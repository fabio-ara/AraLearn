begin;

-- Large official courses cannot be imported row by row inside a single
-- PostgREST request without exceeding the hosted gateway deadline.  Keep the
-- incomplete tree private as an official draft, apply bounded idempotent
-- chunks, and expose it only when the final transaction validates and
-- publishes the complete graph.
create table private.official_catalog_imports (
  import_id uuid primary key,
  course_id uuid not null unique references public.courses(id) on delete cascade,
  contract_key text not null unique,
  source_hash text not null,
  expected_counts jsonb not null,
  publish_requested boolean not null default true,
  status text not null default 'staging',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint official_catalog_imports_source_hash check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint official_catalog_imports_counts_object check (jsonb_typeof(expected_counts) = 'object'),
  constraint official_catalog_imports_status check (status in ('staging', 'draft', 'published'))
);

create table private.official_catalog_import_chunks (
  import_id uuid not null references private.official_catalog_imports(import_id) on delete cascade,
  store_name text not null,
  chunk_index integer not null,
  row_count integer not null,
  payload_hash text not null,
  applied_at timestamptz not null default now(),
  primary key (import_id, store_name, chunk_index),
  constraint official_catalog_import_chunks_index check (chunk_index >= 0),
  constraint official_catalog_import_chunks_count check (row_count > 0),
  constraint official_catalog_import_chunks_hash check (payload_hash ~ '^[0-9a-f]{64}$')
);

create index official_catalog_import_chunks_progress_idx
  on private.official_catalog_import_chunks (import_id, store_name, chunk_index);

create or replace function private.official_import_store_names()
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select array[
    'modules','lessons','guides','guideItems','topics','topicStatements',
    'microsequences','dependencies','microsequenceStatements','cards','blocks','options',
    'nodes','flowNodes','flowCases','flowPractices','flowPracticeEntries',
    'flowPracticeOptions','flowPracticeVariants','flowShapeOptions','edges','matrixItems',
    'cells','points','lines','highlights','cardSources','cardTopics'
  ]::text[];
$$;

create or replace function private.assert_official_import_manifest(p_expected_counts jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog, private
as $$
declare
  v_store_name text;
  v_value jsonb;
begin
  if jsonb_typeof(p_expected_counts) <> 'object' then
    raise exception 'Manifesto da importação oficial deve ser objeto.' using errcode = '22023';
  end if;
  for v_store_name, v_value in select key, value from jsonb_each(p_expected_counts) loop
    if not (v_store_name = any(private.official_import_store_names()))
       or jsonb_typeof(v_value) <> 'number'
       or (v_value #>> '{}') !~ '^\d+$'
       or (v_value #>> '{}')::numeric > 2147483647 then
      raise exception 'Contagem inválida no manifesto para %.', v_store_name using errcode = '22023';
    end if;
  end loop;
  foreach v_store_name in array private.official_import_store_names() loop
    if not (p_expected_counts ? v_store_name) then
      raise exception 'Manifesto não declara a store %.', v_store_name using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.begin_official_course_import(
  p_import_id uuid,
  p_course jsonb,
  p_source_hash text,
  p_expected_counts jsonb,
  p_publish boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '30s'
as $$
declare
  v_course_id uuid := private.try_uuid(p_course ->> 'id');
  v_contract_key text := nullif(btrim(p_course ->> 'contractKey'), '');
  v_existing private.official_catalog_imports%rowtype;
  v_conflicting_course public.courses%rowtype;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode = '42501';
  end if;
  if p_import_id is null or jsonb_typeof(p_course) <> 'object' or v_course_id is null
     or v_contract_key is null or coalesce(p_source_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Identidade ou curso inválido para importação oficial.' using errcode = '22023';
  end if;
  perform private.assert_official_import_manifest(p_expected_counts);
  perform pg_advisory_xact_lock(hashtextextended('official-import:' || v_contract_key, 0));

  select * into v_existing
  from private.official_catalog_imports where import_id = p_import_id
  for update;
  if found then
    if v_existing.course_id is distinct from v_course_id
       or v_existing.contract_key is distinct from v_contract_key
       or v_existing.source_hash is distinct from p_source_hash
       or v_existing.expected_counts is distinct from p_expected_counts
       or v_existing.publish_requested is distinct from p_publish then
      raise exception 'importId reutilizado com manifesto incompatível.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', v_existing.status, 'importId', p_import_id,
      'courseId', v_existing.course_id, 'idempotent', true
    );
  end if;

  select * into v_conflicting_course
  from public.courses
  where kind = 'official' and contract_key = v_contract_key and deleted_at is null
  for update;
  if found then
    raise exception 'Curso oficial já existe fora desta importação: % (%).',
      v_contract_key, v_conflicting_course.status using errcode = '23505';
  end if;

  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  insert into public.courses (
    id, owner_id, kind, status, contract_key, title, goal, contract_scope,
    identity_key, project_id, position
  ) values (
    v_course_id, null, 'official', 'draft', v_contract_key,
    p_course ->> 'title', p_course ->> 'goal', p_course ->> 'contractScope',
    p_course ->> 'identityKey', private.try_uuid(p_course ->> 'projectId'),
    coalesce((p_course ->> 'position')::integer, 0)
  );
  insert into private.official_catalog_imports (
    import_id, course_id, contract_key, source_hash, expected_counts, publish_requested
  ) values (
    p_import_id, v_course_id, v_contract_key, p_source_hash, p_expected_counts, p_publish
  );
  return jsonb_build_object(
    'status', 'staging', 'importId', p_import_id,
    'courseId', v_course_id, 'idempotent', false
  );
end;
$$;

create or replace function public.apply_official_course_import_chunk(
  p_import_id uuid,
  p_store_name text,
  p_chunk_index integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
set statement_timeout = '30s'
as $$
declare
  v_import private.official_catalog_imports%rowtype;
  v_existing private.official_catalog_import_chunks%rowtype;
  v_row jsonb;
  v_result jsonb;
  v_row_count integer;
  v_applied_count integer;
  v_expected_count integer;
  v_payload_hash text;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode = '42501';
  end if;
  if p_import_id is null or p_store_name is null
     or not (p_store_name = any(private.official_import_store_names()))
     or p_chunk_index is null or p_chunk_index < 0
     or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Chunk de importação oficial inválido.' using errcode = '22023';
  end if;
  v_row_count := jsonb_array_length(p_rows);
  v_payload_hash := encode(extensions.digest(p_rows::text, 'sha256'), 'hex');

  select * into v_import from private.official_catalog_imports
  where import_id = p_import_id for update;
  if not found then
    raise exception 'Importação oficial não encontrada.' using errcode = '22023';
  end if;
  select * into v_existing from private.official_catalog_import_chunks
  where import_id = p_import_id and store_name = p_store_name and chunk_index = p_chunk_index;
  if found then
    if v_existing.payload_hash is distinct from v_payload_hash
       or v_existing.row_count is distinct from v_row_count then
      raise exception 'Chunk reutilizado com payload incompatível.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', 'applied', 'importId', p_import_id, 'storeName', p_store_name,
      'chunkIndex', p_chunk_index, 'rowCount', v_row_count, 'idempotent', true
    );
  end if;
  if v_import.status <> 'staging' then
    raise exception 'Importação oficial não aceita novos chunks no estado %.', v_import.status
      using errcode = '23514';
  end if;

  v_expected_count := (v_import.expected_counts ->> p_store_name)::integer;
  select coalesce(sum(chunk.row_count), 0)::integer into v_applied_count
  from private.official_catalog_import_chunks chunk
  where chunk.import_id = p_import_id and chunk.store_name = p_store_name;
  if v_applied_count + v_row_count > v_expected_count then
    raise exception 'Chunks excedem a contagem declarada para %.', p_store_name using errcode = '23514';
  end if;

  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if private.try_uuid(v_row ->> 'courseId') is distinct from v_import.course_id then
      raise exception 'Linha de % pertence a outro curso.', p_store_name using errcode = '23514';
    end if;
    v_result := private.apply_one_sync_mutation(
      auth.uid(), p_store_name, private.try_uuid(v_row ->> 'id'),
      v_import.course_id, 'insert', 0, '[]', v_row
    );
    if v_result ->> 'status' <> 'applied' then
      raise exception 'Falha ao importar %/%: %', p_store_name, v_row ->> 'id', v_result
        using errcode = '23514';
    end if;
  end loop;

  insert into private.official_catalog_import_chunks (
    import_id, store_name, chunk_index, row_count, payload_hash
  ) values (p_import_id, p_store_name, p_chunk_index, v_row_count, v_payload_hash);
  update private.official_catalog_imports set updated_at = now() where import_id = p_import_id;
  return jsonb_build_object(
    'status', 'applied', 'importId', p_import_id, 'storeName', p_store_name,
    'chunkIndex', p_chunk_index, 'rowCount', v_row_count, 'idempotent', false
  );
end;
$$;

create or replace function public.finalize_official_course_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '60s'
as $$
declare
  v_import private.official_catalog_imports%rowtype;
  v_store_name text;
  v_expected_count integer;
  v_applied_count integer;
  v_validation jsonb;
  v_publication jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode = '42501';
  end if;
  select * into v_import from private.official_catalog_imports
  where import_id = p_import_id for update;
  if not found then
    raise exception 'Importação oficial não encontrada.' using errcode = '22023';
  end if;
  if v_import.status in ('draft', 'published') then
    return jsonb_build_object(
      'status', v_import.status, 'importId', p_import_id,
      'courseId', v_import.course_id, 'contentHash',
      private.course_content_hash(v_import.course_id), 'idempotent', true
    );
  end if;

  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);

  foreach v_store_name in array private.official_import_store_names() loop
    v_expected_count := (v_import.expected_counts ->> v_store_name)::integer;
    select coalesce(sum(chunk.row_count), 0)::integer into v_applied_count
    from private.official_catalog_import_chunks chunk
    where chunk.import_id = p_import_id and chunk.store_name = v_store_name;
    if v_applied_count <> v_expected_count then
      raise exception 'Importação incompleta em %: % de % linhas.',
        v_store_name, v_applied_count, v_expected_count using errcode = '23514';
    end if;
  end loop;

  v_validation := public.validate_course_graph(v_import.course_id);
  if not coalesce((v_validation ->> 'valid')::boolean, false) then
    raise exception 'Curso importado é inválido: %', v_validation -> 'errors' using errcode = '23514';
  end if;
  if v_import.publish_requested then
    v_publication := public.publish_official_course(v_import.course_id);
    update private.official_catalog_imports
    set status = 'published', updated_at = now(), completed_at = now()
    where import_id = p_import_id;
  else
    update private.official_catalog_imports
    set status = 'draft', updated_at = now(), completed_at = now()
    where import_id = p_import_id;
  end if;
  return jsonb_build_object(
    'status', case when v_import.publish_requested then 'published' else 'draft' end,
    'importId', p_import_id, 'courseId', v_import.course_id,
    'validation', v_validation, 'publication', v_publication,
    'contentHash', private.course_content_hash(v_import.course_id), 'idempotent', false
  );
end;
$$;

revoke all on function public.begin_official_course_import(uuid, jsonb, text, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.apply_official_course_import_chunk(uuid, text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_official_course_import(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_official_course_import(uuid, jsonb, text, jsonb, boolean)
  to service_role;
grant execute on function public.apply_official_course_import_chunk(uuid, text, integer, jsonb)
  to service_role;
grant execute on function public.finalize_official_course_import(uuid)
  to service_role;

commit;
