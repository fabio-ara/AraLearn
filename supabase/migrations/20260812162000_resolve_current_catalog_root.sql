begin;

create or replace function public.resolve_catalog_artifact_publisher_v4(
  p_contract_key text,
  p_requested_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_actor_id uuid;
  v_course public.courses%rowtype;
  v_collection_id uuid;
  v_workspace_id uuid;
  v_workspace_course_id text;
  v_workspace_revision bigint;
  v_workspace_owner_id uuid;
begin
  perform private.require_service_role();
  if p_contract_key is null or btrim(p_contract_key) = '' then
    raise exception 'contractKey ausente.' using errcode = '22023';
  end if;

  select * into v_course
  from public.courses course
  where course.owner_id is null
    and course.contract_key = p_contract_key
    and course.deleted_at is null
  order by course.updated_at desc, course.id
  limit 1;

  select publication.workspace_id, publication.workspace_course_id,
    workspace.revision, workspace.owner_id
  into v_workspace_id, v_workspace_course_id, v_workspace_revision,
    v_workspace_owner_id
  from private.authoring_workspace_publications publication
  join private.authoring_workspaces workspace
    on workspace.id = publication.workspace_id
   and workspace.deleted_at is null
  where publication.course_id = v_course.id
    and publication.target = 'catalog'
  order by publication.updated_at desc, publication.workspace_id
  limit 1;

  if p_requested_owner_id is not null then
    select assignment.user_id into v_actor_id
    from private.app_role_assignments assignment
    where assignment.user_id = p_requested_owner_id
      and assignment.active
      and assignment.role in ('owner', 'catalog_publisher')
    order by case assignment.role when 'owner' then 0 else 1 end
    limit 1;
    if v_workspace_owner_id is not null
       and v_actor_id is distinct from v_workspace_owner_id then
      raise exception 'A raiz oficial pertence a outro publicador ativo.'
        using errcode = '42501';
    end if;
  elsif v_workspace_owner_id is not null then
    select assignment.user_id into v_actor_id
    from private.app_role_assignments assignment
    where assignment.user_id = v_workspace_owner_id
      and assignment.active
      and assignment.role in ('owner', 'catalog_publisher')
    order by case assignment.role when 'owner' then 0 else 1 end
    limit 1;
  else
    select assignment.user_id into v_actor_id
    from private.app_role_assignments assignment
    where assignment.active
      and assignment.role in ('owner', 'catalog_publisher')
    order by case assignment.role when 'owner' then 0 else 1 end,
      assignment.granted_at, assignment.user_id
    limit 1;
  end if;
  if v_actor_id is null then
    raise exception 'Nenhum publicador apto para a raiz oficial esta ativo.'
      using errcode = '42501';
  end if;

  select placement.collection_id into v_collection_id
  from public.catalog_collection_courses placement
  where placement.course_id = v_course.id and placement.deleted_at is null
  order by placement.id
  limit 1;
  if v_collection_id is null then
    select collection.id into v_collection_id
    from public.catalog_collections collection
    where collection.contract_key = 'outros'
      and collection.is_published
      and collection.deleted_at is null;
  end if;

  return jsonb_build_object(
    'actorId', v_actor_id,
    'courseId', v_course.id,
    'currentRevisionHash', v_course.current_revision_hash,
    'collectionId', v_collection_id,
    'workspaceId', v_workspace_id,
    'workspaceCourseId', v_workspace_course_id,
    'workspaceRevision', v_workspace_revision
  );
end;
$function$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_current_root_v1;
create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_current_root_v1(),
    '{schemaRevision}',
    '"20260812162000"'::jsonb
  ) || jsonb_build_object(
    'features',
    public.get_aralearn_runtime_manifest_before_current_root_v1()->'features'
      || '["current-catalog-root-resolution-v1"]'::jsonb
  )
$function$;
revoke all on function
  public.get_aralearn_runtime_manifest_before_current_root_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
