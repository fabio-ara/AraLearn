begin;

alter table private.authoring_workspace_requests
  drop constraint authoring_workspace_requests_operation_v5;
alter table private.authoring_workspace_requests
  add constraint authoring_workspace_requests_operation_v5 check(operation in (
    'create','create_structure','update_metadata','save_microsequence_cards',
    'save_card','update_brief','copy_entity','rename_entity','move_entity',
    'delete_entity','merge_microsequences','split_microsequence',
    'promote_module','demote_course','import_course','replace_catalog_document',
    'publish_private_preview','publish_private_complete',
    'publish_catalog_complete','delete_workspace'
  ));

alter table private.authoring_workspace_events
  drop constraint authoring_workspace_events_operation_v5;
alter table private.authoring_workspace_events
  add constraint authoring_workspace_events_operation_v5 check(operation in (
    'create','create_structure','update_metadata','save_microsequence_cards',
    'save_card','update_brief','copy_entity','rename_entity','move_entity',
    'delete_entity','merge_microsequences','split_microsequence',
    'promote_module','demote_course','import_course','replace_catalog_document'
  ));

create function public.replace_catalog_authoring_document_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_title text,
  p_brief text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_row jsonb;
  v_result jsonb;
  v_row_count integer;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:publish');
  if not private.can_publish_catalog_v5(p_actor_id) then
    raise exception 'Publicacao editorial nao autorizada.'
      using errcode = '42501';
  end if;
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or nullif(btrim(p_title), '') is null
     or char_length(p_title) > 300
     or p_brief is null
     or char_length(p_brief) > 16000
     or p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) < 2
     or jsonb_array_length(p_rows) > 10000
     or pg_column_size(p_rows) > 33554432 then
    raise exception 'Documento oficial invalido.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-management-v5:global', 0
  ));
  perform private.prune_authoring_workspace_state_v5(p_actor_id, p_request_id);
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> 'replace_catalog_document'
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select workspace.* into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_actor_id
    and exists (
      select 1 from private.authoring_workspace_publications publication
      where publication.workspace_id = workspace.id
        and publication.target = 'catalog'
    )
  for update;
  if not found then
    raise exception 'Raiz oficial de autoria inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisao base desatualizada.' using errcode = '40001';
  end if;

  delete from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(v_row) field_name
         where field_name not in (
           'entityType', 'entityId', 'parentType',
           'parentId', 'position', 'content'
         )
       ) then
      raise exception 'Parte oficial invalida.' using errcode = '22023';
    end if;
    insert into private.authoring_workspace_entities(
      workspace_id, entity_type, entity_id, parent_type, parent_id,
      position, content
    ) values (
      p_workspace_id,
      v_row->>'entityType',
      v_row->>'entityId',
      nullif(v_row->>'parentType', ''),
      nullif(v_row->>'parentId', ''),
      (v_row->>'position')::integer,
      v_row->'content'
    );
  end loop;
  perform private.validate_authoring_workspace_v5(p_workspace_id);

  v_row_count := jsonb_array_length(p_rows);
  update private.authoring_workspaces workspace
  set title = btrim(p_title),
      brief = btrim(p_brief),
      revision = workspace.revision + 1,
      deleted_at = null,
      updated_at = now()
  where workspace.id = p_workspace_id
  returning * into v_workspace;
  v_result := private.workspace_result_v5(
    v_workspace,
    false,
    jsonb_build_object(
      'operation', 'replace_catalog_document',
      'created', v_row_count,
      'updated', 0,
      'deleted', 0
    )
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_actor_id, p_request_id, 'replace_catalog_document', p_payload_hash,
    p_workspace_id, v_result
  );
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values (
    p_workspace_id, v_workspace.revision, 'replace_catalog_document',
    v_result->'change', p_actor_id
  );
  return v_result;
end;
$function$;

revoke all on function public.replace_catalog_authoring_document_v1(
  uuid,uuid,text,text,bigint,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.replace_catalog_authoring_document_v1(
  uuid,uuid,text,text,bigint,text,text,jsonb
) to service_role;

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
begin
  perform private.require_service_role();
  if p_contract_key is null or btrim(p_contract_key) = '' then
    raise exception 'contractKey ausente.' using errcode = '22023';
  end if;
  if p_requested_owner_id is not null then
    select assignment.user_id into v_actor_id
    from private.app_role_assignments assignment
    where assignment.user_id = p_requested_owner_id
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
    raise exception 'Nenhum publicador do catalogo esta ativo.'
      using errcode = '42501';
  end if;
  select * into v_course
  from public.courses course
  where course.owner_id is null
    and course.contract_key = p_contract_key
    and course.deleted_at is null
  order by course.updated_at desc, course.id
  limit 1;
  select placement.collection_id into v_collection_id
  from public.catalog_collection_courses placement
  where placement.course_id = v_course.id and placement.deleted_at is null
  order by placement.position, placement.id
  limit 1;
  if v_collection_id is null then
    select collection.id into v_collection_id
    from public.catalog_collections collection
    where collection.contract_key = 'outros'
      and collection.is_published
      and collection.deleted_at is null;
  end if;
  select publication.workspace_id, publication.workspace_course_id,
    workspace.revision
  into v_workspace_id, v_workspace_course_id, v_workspace_revision
  from private.authoring_workspace_publications publication
  join private.authoring_workspaces workspace
    on workspace.id = publication.workspace_id
  where publication.course_id = v_course.id
    and publication.target = 'catalog'
    and workspace.owner_id = v_actor_id
  order by publication.updated_at desc, publication.workspace_id
  limit 1;
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
  rename to get_aralearn_runtime_manifest_before_catalog_root_reuse_v1;
create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_catalog_root_reuse_v1(),
    '{schemaRevision}',
    '"20260812160000"'::jsonb
  ) || jsonb_build_object(
    'features',
    public.get_aralearn_runtime_manifest_before_catalog_root_reuse_v1()->'features'
      || '["catalog-authoring-root-reuse-v1"]'::jsonb
  )
$function$;
revoke all on function
  public.get_aralearn_runtime_manifest_before_catalog_root_reuse_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
