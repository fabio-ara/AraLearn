begin;

select pg_advisory_xact_lock(hashtextextended('aralearn-authoring-workspaces-v4', 0));

-- O fluxo v3 orientado a execução/parte/cursor deixa de ser uma superfície
-- operacional. O workspace v4 guarda somente ponteiros e histórico de
-- revisões; o documento continua privado e imutável no Storage.
drop table if exists private.run_artifacts cascade;
drop table if exists private.authoring_parts cascade;
drop table if exists private.authoring_requests cascade;
drop table if exists private.authoring_runs cascade;

do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and (
        p.proname in (
          'get_authoring_run_control_v3',
          'list_authoring_runs_control_v3',
          'begin_authoring_request_v3',
          'commit_authoring_transition_v3',
          'fail_authoring_request_v3',
          'release_authoring_request_v3',
          'replay_authoring_request_v3',
          'release_expired_authoring_artifact_links_v3'
        )
        or p.proname = 'authoring_control_snapshot_v3'
        or p.proname = 'authoring_run_accessible_v3'
      )
  loop
    execute format('drop function if exists %s cascade', v_function.signature);
  end loop;
end;
$$;

alter table public.courses
  add column if not exists completion_state text not null default 'complete';
alter table public.courses
  drop constraint if exists courses_completion_state_v4;
alter table public.courses
  add constraint courses_completion_state_v4
    check (completion_state in ('partial', 'complete'));

create table private.authoring_workspaces (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  title text not null,
  current_artifact_hash text not null references private.artifact_refs(hash) on delete restrict,
  revision bigint not null default 1,
  source_course_id uuid references public.courses(id) on delete set null,
  source_revision_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint authoring_workspaces_title_v4 check (
    btrim(title) <> '' and char_length(title) <= 300
  ),
  constraint authoring_workspaces_revision_v4 check (revision > 0),
  constraint authoring_workspaces_hash_v4 check (
    current_artifact_hash ~ '^[0-9a-f]{64}$'
    and (source_revision_hash is null or source_revision_hash ~ '^[0-9a-f]{64}$')
  )
);

create index authoring_workspaces_owner_v4_idx
  on private.authoring_workspaces(owner_id, updated_at desc, id)
  where deleted_at is null;

create table private.authoring_workspace_revisions (
  workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
  revision bigint not null,
  artifact_hash text not null references private.artifact_refs(hash) on delete restrict,
  parent_revision bigint,
  operation text not null,
  request_id text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, revision),
  unique(workspace_id, request_id),
  constraint authoring_workspace_revisions_revision_v4 check (
    revision > 0 and (parent_revision is null or parent_revision = revision - 1)
  ),
  constraint authoring_workspace_revisions_operation_v4 check (
    operation in (
      'create', 'import_course', 'insert_entity', 'replace_entity',
      'rename_entity', 'move_entity', 'delete_entity',
      'merge_microsequences', 'split_microsequence',
      'promote_module', 'demote_course', 'restore_revision'
    )
  ),
  constraint authoring_workspace_revisions_request_v4 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  )
);

create index authoring_workspace_revisions_artifact_v4_idx
  on private.authoring_workspace_revisions(artifact_hash);

create table private.authoring_workspace_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  operation text not null,
  payload_hash text not null,
  workspace_id uuid references private.authoring_workspaces(id) on delete cascade,
  result_revision bigint,
  result_course_id uuid references public.courses(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(owner_id, request_id),
  constraint authoring_workspace_requests_id_v4 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint authoring_workspace_requests_hash_v4 check (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_workspace_requests_operation_v4 check (
    operation in (
      'create', 'import_course', 'insert_entity', 'replace_entity',
      'rename_entity', 'move_entity', 'delete_entity',
      'merge_microsequences', 'split_microsequence',
      'promote_module', 'demote_course', 'restore_revision',
      'publish_private_preview', 'publish_private_complete', 'publish_catalog_complete',
      'delete_workspace'
    )
  )
);

create index authoring_workspace_requests_created_v4_idx
  on private.authoring_workspace_requests(created_at, owner_id);

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

create or replace function private.workspace_revision_result_v4(
  p_workspace private.authoring_workspaces,
  p_revision bigint default null,
  p_idempotent boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select jsonb_build_object(
    'workspaceId', p_workspace.id,
    'title', p_workspace.title,
    'revision', coalesce(p_revision, p_workspace.revision),
    'currentRevision', p_workspace.revision,
    'sourceCourseId', p_workspace.source_course_id,
    'sourceRevisionHash', p_workspace.source_revision_hash,
    'createdAt', p_workspace.created_at,
    'updatedAt', p_workspace.updated_at,
    'idempotent', p_idempotent,
    'artifact', jsonb_build_object(
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'artifactType', artifact.artifact_type,
      'mediaType', artifact.media_type,
      'sizeBytes', artifact.size_bytes
    )
  )
  from private.authoring_workspace_revisions revision
  join private.artifact_refs artifact on artifact.hash = revision.artifact_hash
  where revision.workspace_id = p_workspace.id
    and revision.revision = coalesce(p_revision, p_workspace.revision);
$$;

create or replace function public.replay_authoring_workspace_request_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_operation text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_course public.courses%rowtype;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id,
    p_client_id,
    case when p_operation = 'publish_catalog_complete'
      then 'catalog:publish'
      else 'authoring:write'
    end
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id
    and request.request_id = p_request_id;
  if not found then return null; end if;
  if v_request.payload_hash <> p_payload_hash
     or v_request.operation <> p_operation then
    raise exception 'requestId reutilizado com dados diferentes.' using errcode = '23505';
  end if;
  if v_request.result_course_id is not null then
    select * into v_course
    from public.courses course
    where course.id = v_request.result_course_id;
    return jsonb_build_object(
      'workspaceId', v_request.workspace_id,
      'revision', v_request.result_revision,
      'courseId', v_request.result_course_id,
      'contentHash', v_course.current_revision_hash,
      'completionState', v_course.completion_state,
      'target', case when v_course.owner_id is null then 'catalog' else 'private' end,
      'idempotent', true
    );
  end if;
  if v_request.workspace_id is not null then
    select * into v_workspace
    from private.authoring_workspaces workspace
    where workspace.id = v_request.workspace_id
      and workspace.owner_id = p_owner_id;
    if found and v_request.result_revision is not null then
      return private.workspace_revision_result_v4(
        v_workspace, v_request.result_revision, true
      );
    end if;
  end if;
  return jsonb_build_object(
    'workspaceId', v_request.workspace_id,
    'deleted', p_operation = 'delete_workspace',
    'idempotent', true
  );
end;
$$;

create or replace function public.create_authoring_workspace_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_title text,
  p_operation text,
  p_artifact jsonb,
  p_source_course_id uuid default null,
  p_source_revision_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_hash text;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:write'
  );
  if p_workspace_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_operation not in ('create', 'import_course')
     or nullif(btrim(p_title), '') is null then
    raise exception 'Criação de workspace inválida.' using errcode = '22023';
  end if;

  select * into v_request
  from private.authoring_workspace_requests
  where owner_id = p_owner_id and request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> p_operation then
      raise exception 'requestId reutilizado com dados diferentes.' using errcode = '23505';
    end if;
    select * into v_workspace from private.authoring_workspaces
    where id = v_request.workspace_id and owner_id = p_owner_id;
    return private.workspace_revision_result_v4(
      v_workspace, v_request.result_revision, true
    );
  end if;

  perform private.register_artifact_v3(p_artifact);
  v_hash := p_artifact->>'hash';
  insert into private.authoring_workspaces(
    id, owner_id, api_client_id, title, current_artifact_hash,
    source_course_id, source_revision_hash
  ) values (
    p_workspace_id, p_owner_id, p_client_id, btrim(p_title), v_hash,
    p_source_course_id, p_source_revision_hash
  )
  returning * into v_workspace;
  insert into private.authoring_workspace_revisions(
    workspace_id, revision, artifact_hash, parent_revision,
    operation, request_id, actor_id
  ) values (
    v_workspace.id, 1, v_hash, null, p_operation, p_request_id, p_owner_id
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash,
    workspace_id, result_revision
  ) values (
    p_owner_id, p_request_id, p_operation, p_payload_hash,
    v_workspace.id, 1
  );
  return private.workspace_revision_result_v4(v_workspace);
end;
$$;

create or replace function public.commit_authoring_workspace_revision_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_artifact jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_hash text;
  v_next_revision bigint;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:write'
  );
  if p_expected_revision is null or p_expected_revision < 1
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_operation not in (
       'insert_entity', 'replace_entity', 'rename_entity', 'move_entity',
       'delete_entity', 'merge_microsequences', 'split_microsequence',
       'promote_module', 'demote_course', 'restore_revision'
     ) then
    raise exception 'Mutação de workspace inválida.' using errcode = '22023';
  end if;

  select * into v_request
  from private.authoring_workspace_requests
  where owner_id = p_owner_id and request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> p_operation
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.' using errcode = '23505';
    end if;
    select * into v_workspace from private.authoring_workspaces
    where id = p_workspace_id and owner_id = p_owner_id;
    return private.workspace_revision_result_v4(
      v_workspace, v_request.result_revision, true
    );
  end if;

  select * into v_workspace
  from private.authoring_workspaces
  where id = p_workspace_id
    and owner_id = p_owner_id
    and deleted_at is null
  for update;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using
      errcode = '40001',
      detail = jsonb_build_object(
        'expectedRevision', p_expected_revision,
        'currentRevision', v_workspace.revision
      )::text;
  end if;

  perform private.register_artifact_v3(p_artifact);
  v_hash := p_artifact->>'hash';
  v_next_revision := v_workspace.revision + 1;
  insert into private.authoring_workspace_revisions(
    workspace_id, revision, artifact_hash, parent_revision,
    operation, request_id, actor_id
  ) values (
    p_workspace_id, v_next_revision, v_hash, v_workspace.revision,
    p_operation, p_request_id, p_owner_id
  );
  update private.authoring_workspaces set
    current_artifact_hash = v_hash,
    revision = v_next_revision,
    updated_at = now()
  where id = p_workspace_id
  returning * into v_workspace;
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash,
    workspace_id, result_revision
  ) values (
    p_owner_id, p_request_id, p_operation, p_payload_hash,
    p_workspace_id, v_next_revision
  );
  return private.workspace_revision_result_v4(v_workspace);
end;
$$;

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
  where id = p_workspace_id and owner_id = p_owner_id and deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
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

create or replace function public.list_authoring_workspaces_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  if p_limit < 1 or p_limit > 100
     or ((p_before_updated_at is null) <> (p_before_id is null)) then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspaceId', selected.id,
        'title', selected.title,
        'revision', selected.revision,
        'sourceCourseId', selected.source_course_id,
        'sourceRevisionHash', selected.source_revision_hash,
        'updatedAt', selected.updated_at,
        'createdAt', selected.created_at
      ) order by selected.updated_at desc, selected.id desc)
      from (
        select workspace.*
        from private.authoring_workspaces workspace
        where workspace.owner_id = p_owner_id
          and workspace.deleted_at is null
          and (
            p_before_updated_at is null
            or (workspace.updated_at, workspace.id) < (p_before_updated_at, p_before_id)
          )
        order by workspace.updated_at desc, workspace.id desc
        limit p_limit
      ) selected
    ), '[]'::jsonb),
    'hasMore', (
      select count(*) = p_limit
      from (
        select 1
        from private.authoring_workspaces workspace
        where workspace.owner_id = p_owner_id
          and workspace.deleted_at is null
          and (
            p_before_updated_at is null
            or (workspace.updated_at, workspace.id) < (p_before_updated_at, p_before_id)
          )
        limit p_limit
      ) page
    )
  );
end;
$$;

create or replace function public.list_authoring_workspace_history_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  if p_limit < 1 or p_limit > 100 or not exists (
    select 1 from private.authoring_workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_id = p_owner_id
      and workspace.deleted_at is null
  ) then
    raise exception 'Workspace ou paginação inválidos.' using errcode = '22023';
  end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'revision', revision.revision,
      'parentRevision', revision.parent_revision,
      'operation', revision.operation,
      'artifactHash', revision.artifact_hash,
      'createdAt', revision.created_at
    ) order by revision.revision desc)
    from (
      select *
      from private.authoring_workspace_revisions
      where workspace_id = p_workspace_id
      order by revision desc
      limit p_limit
    ) revision
  ), '[]'::jsonb));
end;
$$;

create or replace function public.get_course_document_artifact_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_course public.courses%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  select * into v_course from public.courses course
  where course.id = p_course_id
    and course.deleted_at is null
    and course.document_storage_enabled
    and (
      course.owner_id is null
      or course.owner_id = p_owner_id
      or exists (
        select 1 from public.user_course_selections selection
        where selection.user_id = p_owner_id and selection.course_id = course.id
      )
    );
  if not found then
    raise exception 'Curso inacessível ou sem documento.' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'courseId', v_course.id,
    'contractKey', v_course.contract_key,
    'title', v_course.title,
    'goal', v_course.goal,
    'completionState', v_course.completion_state,
    'revisionHash', v_course.current_revision_hash,
    'artifact', jsonb_build_object(
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'artifactType', artifact.artifact_type,
      'mediaType', artifact.media_type,
      'sizeBytes', artifact.size_bytes
    )
  ) into v_result
  from private.artifact_refs artifact
  where artifact.hash = v_course.revision_artifact_hash;
  return v_result;
end;
$$;

create or replace function public.publish_authoring_workspace_course_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_target text,
  p_completion_state text,
  p_publication_mode text,
  p_existing_course_id uuid,
  p_expected_content_hash text,
  p_collection_id uuid,
  p_metadata jsonb,
  p_artifact jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_course_id uuid;
  v_hash text := p_artifact->>'hash';
  v_operation text;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id,
    case when p_target = 'catalog' then 'catalog:publish' else 'authoring:write' end
  );
  if p_target not in ('private', 'catalog')
     or p_completion_state not in ('partial', 'complete')
     or (p_target = 'catalog' and p_completion_state <> 'complete')
     or p_publication_mode not in ('create', 'update')
     or p_expected_revision < 1
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or v_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Publicação de workspace inválida.' using errcode = '22023';
  end if;
  v_operation := case
    when p_target = 'catalog' then 'publish_catalog_complete'
    when p_completion_state = 'partial' then 'publish_private_preview'
    else 'publish_private_complete'
  end;
  select * into v_request
  from private.authoring_workspace_requests
  where owner_id = p_owner_id and request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> v_operation
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'workspaceId', p_workspace_id,
      'revision', v_request.result_revision,
      'courseId', v_request.result_course_id,
      'completionState', p_completion_state,
      'idempotent', true
    );
  end if;
  select * into v_workspace
  from private.authoring_workspaces
  where id = p_workspace_id and owner_id = p_owner_id and deleted_at is null
  for share;
  if not found then raise exception 'Workspace inexistente.' using errcode = 'P0002'; end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using errcode = '40001';
  end if;
  if p_target = 'catalog' then
    perform private.require_catalog_admin_actor(p_owner_id, false);
  end if;
  perform private.register_artifact_v3(p_artifact);

  if p_publication_mode = 'update' then
    select id into v_course_id from public.courses course
    where course.id = p_existing_course_id
      and course.deleted_at is null
      and course.current_revision_hash is not distinct from p_expected_content_hash
      and (
        (p_target = 'private' and course.owner_id = p_owner_id)
        or (p_target = 'catalog' and course.owner_id is null)
      )
    for update;
    if not found then
      raise exception 'Revisão base do curso desatualizada.' using errcode = '40001';
    end if;
  else
    v_course_id := gen_random_uuid();
    insert into public.courses(
      id, owner_id, status, contract_key, title, goal,
      contract_scope, project_id, position,
      content_hash, current_revision_hash, revision_artifact_hash,
      module_count, lesson_count, microsequence_count, card_count,
      document_storage_enabled, completion_state
    ) values (
      v_course_id,
      case when p_target = 'private' then p_owner_id end,
      'published',
      p_metadata->>'contractKey',
      p_metadata->>'title',
      coalesce(nullif(p_metadata->>'goal', ''), p_metadata->>'title'),
      p_metadata->>'contractScope',
      gen_random_uuid(),
      coalesce((
        select max(course.position) + 1
        from public.courses course
        where course.owner_id is not distinct from (
          case when p_target = 'private' then p_owner_id end
        ) and course.deleted_at is null
      ), 0),
      v_hash, v_hash, v_hash,
      coalesce((p_metadata->>'moduleCount')::bigint, 0),
      coalesce((p_metadata->>'lessonCount')::bigint, 0),
      coalesce((p_metadata->>'microsequenceCount')::bigint, 0),
      coalesce((p_metadata->>'cardCount')::bigint, 0),
      true, p_completion_state
    );
  end if;

  insert into private.course_revisions(
    course_id, revision_hash, artifact_hash, base_revision_hash,
    validation_status, validated_at, published_at, created_by
  ) values (
    v_course_id, v_hash, v_hash, p_expected_content_hash,
    'validated', now(), now(), p_owner_id
  ) on conflict(course_id, revision_hash) do nothing;
  update public.courses set
    contract_key = p_metadata->>'contractKey',
    title = p_metadata->>'title',
    goal = coalesce(nullif(p_metadata->>'goal', ''), p_metadata->>'title'),
    contract_scope = p_metadata->>'contractScope',
    status = 'published',
    deleted_at = null,
    current_revision_hash = v_hash,
    revision_artifact_hash = v_hash,
    content_hash = v_hash,
    module_count = coalesce((p_metadata->>'moduleCount')::bigint, 0),
    lesson_count = coalesce((p_metadata->>'lessonCount')::bigint, 0),
    microsequence_count = coalesce((p_metadata->>'microsequenceCount')::bigint, 0),
    card_count = coalesce((p_metadata->>'cardCount')::bigint, 0),
    document_storage_enabled = true,
    completion_state = p_completion_state,
    publication_seq = publication_seq + 1,
    updated_at = now()
  where id = v_course_id;

  if p_target = 'private' then
    insert into public.user_course_selections(user_id, course_id, position)
    values (
      p_owner_id, v_course_id,
      coalesce((
        select max(selection.position) + 1
        from public.user_course_selections selection
        where selection.user_id = p_owner_id
      ), 0)
    ) on conflict(user_id, course_id) do nothing;
  elsif p_collection_id is not null then
    update public.catalog_collection_courses set
      collection_id = p_collection_id,
      position = coalesce((
        select max(item.position) + 1
        from public.catalog_collection_courses item
        where item.collection_id = p_collection_id
          and item.course_id <> v_course_id
          and item.deleted_at is null
      ), 0),
      deleted_at = null,
      updated_at = now()
    where course_id = v_course_id and deleted_at is null;
    if not found then
      insert into public.catalog_collection_courses(collection_id, course_id, position)
      values (
        p_collection_id, v_course_id,
        coalesce((
          select max(item.position) + 1
          from public.catalog_collection_courses item
          where item.collection_id = p_collection_id and item.deleted_at is null
        ), 0)
      );
    end if;
  end if;

  insert into private.course_revision_sync_changes(
    user_id, scope, entity_id, operation, revision_hash
  ) values (
    case when p_target = 'private' then p_owner_id end,
    p_target, v_course_id, 'upsert', v_hash
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash,
    workspace_id, result_revision, result_course_id
  ) values (
    p_owner_id, p_request_id, v_operation, p_payload_hash,
    p_workspace_id, p_expected_revision, v_course_id
  );
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', p_expected_revision,
    'courseId', v_course_id,
    'contentHash', v_hash,
    'completionState', p_completion_state,
    'target', p_target,
    'idempotent', false
  );
end;
$$;

create or replace function public.delete_authoring_workspace_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:write'
  );
  select * into v_request
  from private.authoring_workspace_requests
  where owner_id = p_owner_id and request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> 'delete_workspace'
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.' using errcode = '23505';
    end if;
    return jsonb_build_object('workspaceId', p_workspace_id, 'deleted', true, 'idempotent', true);
  end if;
  update private.authoring_workspaces set deleted_at = now(), updated_at = now()
  where id = p_workspace_id and owner_id = p_owner_id and deleted_at is null
  returning * into v_workspace;
  if not found then raise exception 'Workspace inexistente.' using errcode = 'P0002'; end if;
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result_revision
  ) values (
    p_owner_id, p_request_id, 'delete_workspace', p_payload_hash,
    p_workspace_id, v_workspace.revision
  );
  return jsonb_build_object('workspaceId', p_workspace_id, 'deleted', true, 'idempotent', false);
end;
$$;

-- O GC passa a considerar o histórico dos workspaces e seus recibos.
create or replace function public.list_unreferenced_artifacts_v3(
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  if p_older_than < interval '1 hour' or p_limit < 1 or p_limit > 1000 then
    raise exception 'Parâmetros de limpeza inválidos.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'sizeBytes', artifact.size_bytes
    ) order by artifact.created_at)
    from (
      select ref.*
      from private.artifact_refs ref
      where ref.created_at < now() - p_older_than
        and not exists (
          select 1 from private.authoring_workspace_revisions revision
          where revision.artifact_hash = ref.hash
        )
        and not exists (
          select 1 from private.course_revisions revision
          where revision.artifact_hash = ref.hash
        )
      order by ref.created_at
      limit p_limit
    ) artifact
  ), '[]'::jsonb);
end;
$$;

create or replace function public.claim_unreferenced_artifacts_v3(
  p_claim_token uuid,
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_artifact private.artifact_refs%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform private.require_service_role();
  if p_claim_token is null then
    raise exception 'Token de coleta obrigatório.' using errcode = '22023';
  end if;
  if p_older_than is null or p_older_than < interval '1 hour' then
    raise exception 'Retenção de coleta inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-artifact-gc-v3', 0));

  update private.artifact_gc_tombstones set
    claim_token = p_claim_token,
    claimed_at = now()
  where claimed_at < now() - interval '15 minutes';

  for v_artifact in
    select ref.*
    from private.artifact_refs ref
    where ref.created_at < now() - p_older_than
      and not exists (
        select 1 from private.authoring_workspace_revisions revision
        where revision.artifact_hash = ref.hash
      )
      and not exists (
        select 1 from private.authoring_workspaces workspace
        where workspace.current_artifact_hash = ref.hash
      )
      and not exists (
        select 1 from private.course_revisions revision
        where revision.artifact_hash = ref.hash
      )
      and not exists (
        select 1 from public.courses course
        where course.revision_artifact_hash = ref.hash
      )
    order by ref.created_at
    for update skip locked
    limit v_limit
  loop
    insert into private.artifact_gc_tombstones(
      hash, bucket, object_key, artifact_type, media_type, size_bytes, claim_token
    ) values (
      v_artifact.hash, v_artifact.bucket, v_artifact.object_key,
      v_artifact.artifact_type, v_artifact.media_type, v_artifact.size_bytes,
      p_claim_token
    ) on conflict(hash) do nothing;
    delete from private.artifact_refs where hash = v_artifact.hash;
  end loop;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'hash', tombstone.hash,
      'bucket', tombstone.bucket,
      'objectKey', tombstone.object_key,
      'sizeBytes', tombstone.size_bytes
    ) order by tombstone.claimed_at, tombstone.hash)
    from private.artifact_gc_tombstones tombstone
    where tombstone.claim_token = p_claim_token
  ), '[]'::jsonb);
end;
$$;

revoke all on table private.authoring_workspaces from public, anon, authenticated;
revoke all on table private.authoring_workspace_revisions from public, anon, authenticated;
revoke all on table private.authoring_workspace_requests from public, anon, authenticated;
revoke all on function private.require_workspace_actor_v4(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_revision_result_v4(
  private.authoring_workspaces,bigint,boolean
) from public, anon, authenticated, service_role;

revoke all on function public.create_authoring_workspace_v4(
  uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text
) from public, anon, authenticated;
revoke all on function public.replay_authoring_workspace_request_v4(
  uuid,uuid,text,text,text
) from public, anon, authenticated;
revoke all on function public.commit_authoring_workspace_revision_v4(
  uuid,uuid,uuid,text,text,bigint,text,jsonb
) from public, anon, authenticated;
revoke all on function public.get_authoring_workspace_v4(uuid,uuid,uuid,bigint)
  from public, anon, authenticated;
revoke all on function public.list_authoring_workspaces_v4(
  uuid,uuid,integer,timestamptz,uuid
) from public, anon, authenticated;
revoke all on function public.list_authoring_workspace_history_v4(
  uuid,uuid,uuid,integer
) from public, anon, authenticated;
revoke all on function public.get_course_document_artifact_v4(uuid,uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) from public, anon, authenticated;
revoke all on function public.delete_authoring_workspace_v4(
  uuid,uuid,uuid,text,text
) from public, anon, authenticated;

grant execute on function public.create_authoring_workspace_v4(
  uuid,uuid,uuid,text,text,text,text,jsonb,uuid,text
) to service_role;
grant execute on function public.replay_authoring_workspace_request_v4(
  uuid,uuid,text,text,text
) to service_role;
grant execute on function public.commit_authoring_workspace_revision_v4(
  uuid,uuid,uuid,text,text,bigint,text,jsonb
) to service_role;
grant execute on function public.get_authoring_workspace_v4(uuid,uuid,uuid,bigint)
  to service_role;
grant execute on function public.list_authoring_workspaces_v4(
  uuid,uuid,integer,timestamptz,uuid
) to service_role;
grant execute on function public.list_authoring_workspace_history_v4(
  uuid,uuid,uuid,integer
) to service_role;
grant execute on function public.get_course_document_artifact_v4(uuid,uuid,uuid)
  to service_role;
grant execute on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) to service_role;
grant execute on function public.delete_authoring_workspace_v4(
  uuid,uuid,uuid,text,text
) to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260729010000',
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

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
