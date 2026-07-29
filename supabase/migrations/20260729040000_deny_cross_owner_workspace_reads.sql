begin;

create or replace function public.get_authoring_workspace_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_revision bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_workspace private.authoring_workspaces%rowtype;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  select * into v_workspace
  from private.authoring_workspaces
  where id = p_workspace_id and deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.owner_id <> p_owner_id then
    raise exception 'Workspace pertence a outra conta.' using errcode = '42501';
  end if;
  if p_revision is not null and not exists (
    select 1 from private.authoring_workspace_revisions revision
    where revision.workspace_id = v_workspace.id and revision.revision = p_revision
  ) then
    raise exception 'Revisão inexistente.' using errcode = 'P0002';
  end if;
  return private.workspace_revision_result_v4(v_workspace, p_revision);
end;
$$;

revoke all on function public.get_authoring_workspace_v4(uuid,uuid,uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.get_authoring_workspace_v4(uuid,uuid,uuid,bigint)
  to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260729040000',
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
