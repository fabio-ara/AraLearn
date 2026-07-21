begin;

-- flow_nodes.parent_case_id and flow_cases.flow_node_id form a deliberate
-- graph cycle.  A flow block must therefore insert its nodes first and its
-- cases in the same transaction, where the parent-case FK remains deferred
-- until every row in that block exists.
create or replace function public.begin_official_course_import_flow(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '30s'
as $$
declare
  v_import private.official_catalog_imports%rowtype;
  v_node_count integer;
  v_case_count integer;
  v_expected_nodes integer;
  v_expected_cases integer;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode = '42501';
  end if;
  select * into v_import from private.official_catalog_imports
  where import_id = p_import_id for update;
  if not found or v_import.status <> 'staging' then
    raise exception 'Staging oficial de flow não está disponível.' using errcode = '23514';
  end if;
  select count(*)::integer into v_node_count from public.flow_nodes
  where course_id = v_import.course_id and deleted_at is null;
  select count(*)::integer into v_case_count from public.flow_cases
  where course_id = v_import.course_id and deleted_at is null;
  v_expected_nodes := (v_import.expected_counts ->> 'flowNodes')::integer;
  v_expected_cases := (v_import.expected_counts ->> 'flowCases')::integer;
  if v_node_count = v_expected_nodes and v_case_count = v_expected_cases then
    return jsonb_build_object(
      'status', 'complete', 'importId', p_import_id,
      'nodeCount', v_node_count, 'caseCount', v_case_count, 'idempotent', true
    );
  end if;
  if exists (
    select 1 from private.official_catalog_import_chunks chunk
    where chunk.import_id = p_import_id
      and chunk.store_name in (
        'flowPractices','flowPracticeEntries','flowPracticeOptions',
        'flowPracticeVariants','flowShapeOptions','edges','matrixItems','cells',
        'points','lines','highlights','cardSources','cardTopics'
      )
  ) then
    raise exception 'Flow parcial possui descendentes já confirmados; reconciliação administrativa necessária.'
      using errcode = '23514';
  end if;
  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  delete from public.flow_nodes where course_id = v_import.course_id;
  delete from private.official_catalog_import_chunks
  where import_id = p_import_id and store_name in ('flowNodes', 'flowCases');
  update private.official_catalog_imports set updated_at = now() where import_id = p_import_id;
  return jsonb_build_object(
    'status', 'reset', 'importId', p_import_id,
    'nodeCount', 0, 'caseCount', 0, 'idempotent', false
  );
end;
$$;

create or replace function public.apply_official_course_import_flow_chunk(
  p_import_id uuid,
  p_chunk_index integer,
  p_nodes jsonb,
  p_cases jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
set statement_timeout = '30s'
as $$
declare
  v_import private.official_catalog_imports%rowtype;
  v_node_chunk private.official_catalog_import_chunks%rowtype;
  v_case_chunk private.official_catalog_import_chunks%rowtype;
  v_row jsonb;
  v_result jsonb;
  v_node_count integer;
  v_case_count integer;
  v_node_hash text;
  v_case_hash text;
  v_applied_nodes integer;
  v_applied_cases integer;
  v_expected_nodes integer;
  v_expected_cases integer;
  v_block_id uuid;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode = '42501';
  end if;
  if p_import_id is null or p_chunk_index is null or p_chunk_index < 0
     or jsonb_typeof(p_nodes) <> 'array' or jsonb_typeof(p_cases) <> 'array'
     or jsonb_array_length(p_nodes) = 0 then
    raise exception 'Chunk de flow oficial inválido.' using errcode = '22023';
  end if;
  v_node_count := jsonb_array_length(p_nodes);
  v_case_count := jsonb_array_length(p_cases);
  v_node_hash := encode(extensions.digest(p_nodes::text, 'sha256'), 'hex');
  v_case_hash := encode(extensions.digest(p_cases::text, 'sha256'), 'hex');
  v_block_id := private.try_uuid(p_nodes -> 0 ->> 'blockId');
  if v_block_id is null
     or exists (
       select 1 from jsonb_array_elements(p_nodes) node
       where private.try_uuid(node ->> 'blockId') is distinct from v_block_id
     )
     or exists (
       select 1 from jsonb_array_elements(p_cases) flow_case
       where private.try_uuid(flow_case ->> 'blockId') is distinct from v_block_id
     ) then
    raise exception 'Chunk de flow deve conter um único bloco.' using errcode = '23514';
  end if;

  select * into v_import from private.official_catalog_imports
  where import_id = p_import_id for update;
  if not found then
    raise exception 'Importação oficial não encontrada.' using errcode = '22023';
  end if;
  select * into v_node_chunk from private.official_catalog_import_chunks
  where import_id = p_import_id and store_name = 'flowNodes' and chunk_index = p_chunk_index;
  select * into v_case_chunk from private.official_catalog_import_chunks
  where import_id = p_import_id and store_name = 'flowCases' and chunk_index = p_chunk_index;

  if v_node_chunk.import_id is not null or v_case_chunk.import_id is not null then
    if v_node_chunk.import_id is null
       or v_node_chunk.payload_hash is distinct from v_node_hash
       or v_node_chunk.row_count is distinct from v_node_count
       or (v_case_count > 0 and (
         v_case_chunk.import_id is null
         or v_case_chunk.payload_hash is distinct from v_case_hash
         or v_case_chunk.row_count is distinct from v_case_count
       ))
       or (v_case_count = 0 and v_case_chunk.import_id is not null) then
      raise exception 'Chunk de flow reutilizado com payload incompatível.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', 'applied', 'importId', p_import_id, 'chunkIndex', p_chunk_index,
      'blockId', v_block_id, 'nodeCount', v_node_count, 'caseCount', v_case_count,
      'idempotent', true
    );
  end if;
  if v_import.status <> 'staging' then
    raise exception 'Importação oficial não aceita novos chunks no estado %.', v_import.status
      using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_nodes) node
    where private.try_uuid(node ->> 'courseId') is distinct from v_import.course_id
  ) or exists (
    select 1 from jsonb_array_elements(p_cases) flow_case
    where private.try_uuid(flow_case ->> 'courseId') is distinct from v_import.course_id
  ) then
    raise exception 'Chunk de flow pertence a outro curso.' using errcode = '23514';
  end if;

  v_expected_nodes := (v_import.expected_counts ->> 'flowNodes')::integer;
  v_expected_cases := (v_import.expected_counts ->> 'flowCases')::integer;
  select coalesce(sum(chunk.row_count), 0)::integer into v_applied_nodes
  from private.official_catalog_import_chunks chunk
  where chunk.import_id = p_import_id and chunk.store_name = 'flowNodes';
  select coalesce(sum(chunk.row_count), 0)::integer into v_applied_cases
  from private.official_catalog_import_chunks chunk
  where chunk.import_id = p_import_id and chunk.store_name = 'flowCases';
  if v_applied_nodes + v_node_count > v_expected_nodes
     or v_applied_cases + v_case_count > v_expected_cases then
    raise exception 'Chunks de flow excedem o manifesto.' using errcode = '23514';
  end if;

  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  set constraints flow_nodes_parent_fk, flow_nodes_parent_case_fk deferred;
  for v_row in select value from jsonb_array_elements(p_nodes) loop
    v_result := private.apply_one_sync_mutation(
      auth.uid(), 'flowNodes', private.try_uuid(v_row ->> 'id'),
      v_import.course_id, 'insert', 0, '[]', v_row
    );
    if v_result ->> 'status' <> 'applied' then
      raise exception 'Falha ao importar flowNode/%: %', v_row ->> 'id', v_result
        using errcode = '23514';
    end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_cases) loop
    v_result := private.apply_one_sync_mutation(
      auth.uid(), 'flowCases', private.try_uuid(v_row ->> 'id'),
      v_import.course_id, 'insert', 0, '[]', v_row
    );
    if v_result ->> 'status' <> 'applied' then
      raise exception 'Falha ao importar flowCase/%: %', v_row ->> 'id', v_result
        using errcode = '23514';
    end if;
  end loop;

  insert into private.official_catalog_import_chunks (
    import_id, store_name, chunk_index, row_count, payload_hash
  ) values (p_import_id, 'flowNodes', p_chunk_index, v_node_count, v_node_hash);
  if v_case_count > 0 then
    insert into private.official_catalog_import_chunks (
      import_id, store_name, chunk_index, row_count, payload_hash
    ) values (p_import_id, 'flowCases', p_chunk_index, v_case_count, v_case_hash);
  end if;
  update private.official_catalog_imports set updated_at = now() where import_id = p_import_id;
  return jsonb_build_object(
    'status', 'applied', 'importId', p_import_id, 'chunkIndex', p_chunk_index,
    'blockId', v_block_id, 'nodeCount', v_node_count, 'caseCount', v_case_count,
    'idempotent', false
  );
end;
$$;

revoke all on function public.apply_official_course_import_flow_chunk(uuid, integer, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.begin_official_course_import_flow(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_official_course_import_flow(uuid)
  to service_role;
grant execute on function public.apply_official_course_import_flow_chunk(uuid, integer, jsonb, jsonb)
  to service_role;

commit;
