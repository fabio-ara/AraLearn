begin;

create or replace function private.require_workspace_actor_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_scope text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
begin
  perform private.require_service_role();
  if p_owner_id is null
     or not exists (select 1 from auth.users account where account.id = p_owner_id) then
    raise exception 'Responsável pelo workspace inválido.' using errcode = '42501';
  end if;
  if p_client_id is not null
     and not private.authoring_client_has_scope(p_client_id, p_owner_id, p_scope)
     and not (
       p_scope in ('authoring:read', 'authoring:write')
       and private.authoring_client_has_scope(
         p_client_id,
         p_owner_id,
         replace(p_scope, 'authoring:', 'authoring:private:')
       )
     ) then
    raise exception 'Escopo de autoria insuficiente.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_workspace_actor_v4(uuid,uuid,text)
  from public, anon, authenticated, service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260729030000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'immutable-course-revisions',
      'storage-only-course-content',
      'canonical-resource-registry',
      'atomic-resource-authoring',
      'structured-bottom-up-generation',
      'versioned-authoring-workspaces',
      'partial-private-publication',
      'microtheory-review-projection'
    )
  );
$function$;

commit;
