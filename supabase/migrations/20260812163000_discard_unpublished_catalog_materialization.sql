begin;

create function public.discard_unpublished_catalog_materialization_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_deleted boolean := false;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:publish');
  if not private.can_publish_catalog_v5(p_actor_id) then
    raise exception 'Limpeza editorial nao autorizada.' using errcode = '42501';
  end if;
  if p_workspace_id is null then
    raise exception 'Materializacao editorial invalida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-materialization-v1:' || p_workspace_id::text, 0
  ));
  if exists (
    select 1 from private.authoring_workspace_publications publication
    where publication.workspace_id = p_workspace_id
  ) then
    raise exception 'Uma raiz publicada nao pode ser descartada.'
      using errcode = '42501';
  end if;
  delete from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_actor_id;
  v_deleted := found;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'discarded', v_deleted
  );
end;
$function$;

revoke all on function public.discard_unpublished_catalog_materialization_v1(
  uuid,uuid
) from public, anon, authenticated;
grant execute on function public.discard_unpublished_catalog_materialization_v1(
  uuid,uuid
) to service_role;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_discard_materialization_v1;
create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_discard_materialization_v1(),
    '{schemaRevision}',
    '"20260812163000"'::jsonb
  ) || jsonb_build_object(
    'features',
    public.get_aralearn_runtime_manifest_before_discard_materialization_v1()->'features'
      || '["discard-unpublished-catalog-materialization-v1"]'::jsonb
  )
$function$;
revoke all on function
  public.get_aralearn_runtime_manifest_before_discard_materialization_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
