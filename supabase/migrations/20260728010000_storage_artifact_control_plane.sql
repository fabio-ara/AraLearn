begin;

select pg_advisory_xact_lock(hashtextextended('aralearn-storage-artifact-control-plane-v3', 0));

-- O corte é deliberadamente destrutivo para o staging de autoria. Auth,
-- papéis, integrações pessoais, biblioteca e progresso são preservados.
drop function if exists public.get_selected_course_graph(uuid) cascade;
drop table if exists private.authoring_private_import_stage_rows cascade;
drop table if exists private.authoring_private_import_chunks cascade;
drop table if exists private.authoring_private_imports cascade;
drop table if exists private.authoring_ledger_chunks cascade;
drop table if exists private.authoring_audit_reports cascade;
drop table if exists private.authoring_block_events cascade;
drop table if exists private.authoring_command_events cascade;
drop table if exists private.authoring_command_receipts cascade;
drop table if exists private.authoring_retention_events cascade;
drop table if exists private.authoring_maintenance_state cascade;
drop table if exists private.authoring_parts cascade;
drop table if exists private.authoring_runs cascade;

-- Remove as portas públicas do motor que recebia documentos JSONB e
-- materializava a árvore do curso linha por linha.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'dispatch_authoring_command%'
        or p.proname like 'replay_authoring_command%'
        or p.proname = 'apply_authoring_command'
        or p.proname = 'list_authoring_runs'
        or p.proname = 'authoring_storage_diagnostics'
        or p.proname = 'cleanup_authoring_history'
        or p.proname = 'maybe_cleanup_authoring_history'
        or p.proname like 'get_authoring_run%'
        or p.proname like 'get_next_authoring_part%'
        or p.proname like 'get_authoring_part_submission%'
        or p.proname like '%authoring%course_import%'
        or p.proname like 'claim_authoring_%'
        or p.proname like 'record_authoring_%materialization%'
        or p.proname like 'record_authoring_publication%'
      )
  loop
    execute format('drop function if exists %s cascade', v_function.signature);
  end loop;
end;
$$;

insert into storage.buckets(id, name, public)
values
  ('aralearn-authoring-artifacts', 'aralearn-authoring-artifacts', false),
  ('aralearn-course-revisions', 'aralearn-course-revisions', false)
on conflict(id) do update set public = false;

create table private.artifact_refs (
  hash text primary key,
  bucket text not null,
  object_key text not null unique,
  artifact_type text not null,
  media_type text not null default 'application/json',
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint artifact_refs_hash check (hash ~ '^[0-9a-f]{64}$'),
  constraint artifact_refs_bucket check (
    bucket in ('aralearn-authoring-artifacts', 'aralearn-course-revisions')
  ),
  constraint artifact_refs_key check (
    object_key ~ '^artifacts/sha256/[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{64}\.json$'
  ),
  constraint artifact_refs_type check (
    btrim(artifact_type) <> '' and char_length(artifact_type) <= 120
  ),
  constraint artifact_refs_media check (
    media_type = 'application/json'
  ),
  constraint artifact_refs_size check (size_bytes > 0)
);

create table private.artifact_gc_tombstones (
  hash text primary key,
  bucket text not null,
  object_key text not null,
  artifact_type text not null,
  media_type text not null,
  size_bytes bigint not null,
  claim_token uuid not null,
  claimed_at timestamptz not null default now(),
  constraint artifact_gc_tombstones_hash_v3 check (hash ~ '^[0-9a-f]{64}$')
);

create table private.authoring_runs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  target text not null,
  collection_id uuid references public.catalog_collections(id) on delete set null,
  title text not null,
  goal text,
  contract_key text not null,
  contract_scope text,
  project_id uuid,
  publication_intent text not null default 'create',
  base_course_id uuid references public.courses(id) on delete restrict,
  base_revision_hash text,
  state text not null default 'planning',
  resume_state text,
  current_part_key text,
  plan_hash text,
  ledger_manifest jsonb,
  final_document_hash text,
  module_count bigint not null default 0,
  lesson_count bigint not null default 0,
  microsequence_count bigint not null default 0,
  card_count bigint not null default 0,
  course_id uuid references public.courses(id) on delete set null,
  operation_phase text,
  operation_cursor integer not null default 0,
  operation_total integer,
  last_error_code text,
  last_error_message text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz,
  constraint authoring_runs_target_v3 check (target in ('private', 'catalog')),
  constraint authoring_runs_title_v3 check (
    btrim(title) <> '' and char_length(title) <= 300
  ),
  constraint authoring_runs_contract_v3 check (
    btrim(contract_key) <> '' and char_length(contract_key) <= 240
  ),
  constraint authoring_runs_intent_v3 check (
    publication_intent in ('create', 'update')
    and (
      (publication_intent = 'create' and base_course_id is null and base_revision_hash is null)
      or
      (publication_intent = 'update' and base_course_id is not null
        and base_revision_hash ~ '^[0-9a-f]{64}$')
    )
  ),
  constraint authoring_runs_state_v3 check (
    state in (
      'planning', 'building', 'auditing', 'repair', 'rebuild',
      'ready_for_validation', 'validating', 'validated', 'publishing',
      'published', 'blocked', 'cancelled', 'failed'
    )
  ),
  constraint authoring_runs_hash_v3 check (
    (plan_hash is null or plan_hash ~ '^[0-9a-f]{64}$')
    and (final_document_hash is null or final_document_hash ~ '^[0-9a-f]{64}$')
    and (base_revision_hash is null or base_revision_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint authoring_runs_ledger_manifest_v3 check (
    ledger_manifest is null
    or (
      jsonb_typeof(ledger_manifest) = 'object'
      and pg_column_size(ledger_manifest) <= 65536
    )
  ),
  constraint authoring_runs_cursor_v3 check (
    operation_cursor >= 0 and (operation_total is null or operation_total >= operation_cursor)
  ),
  constraint authoring_runs_revision_v3 check (revision > 0),
  constraint authoring_runs_counts_v3 check (
    module_count >= 0 and lesson_count >= 0
    and microsequence_count >= 0 and card_count >= 0
  )
);

create index authoring_runs_owner_v3_idx
  on private.authoring_runs(owner_id, updated_at desc, id);
create index authoring_runs_state_v3_idx
  on private.authoring_runs(state, updated_at, id)
  where terminal_at is null;

create or replace function public.resolve_catalog_artifact_publisher_v3(
  p_contract_key text,
  p_requested_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor_id uuid;
  v_course public.courses%rowtype;
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
    if v_actor_id is null then
      raise exception 'Publicador solicitado não está ativo.' using errcode = '42501';
    end if;
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
    raise exception 'Nenhum publicador do catálogo está ativo.' using errcode = '42501';
  end if;

  select * into v_course
  from public.courses course
  where course.owner_id is null
    and course.contract_key = p_contract_key
    and course.deleted_at is null
  order by course.updated_at desc, course.id
  limit 1;

  return jsonb_build_object(
    'actorId', v_actor_id,
    'courseId', v_course.id,
    'currentRevisionHash', v_course.current_revision_hash,
    'collectionId', (
      select placement.collection_id
      from public.catalog_collection_courses placement
      where placement.course_id = v_course.id and placement.deleted_at is null
      order by placement.position, placement.id
      limit 1
    )
  );
end;
$$;

create table private.authoring_parts (
  run_id uuid not null references private.authoring_runs(id) on delete cascade,
  part_key text not null,
  position integer not null,
  title text not null,
  depends_on text[] not null default '{}',
  state text not null default 'planned',
  attempt integer not null default 0,
  specification_hash text,
  submission_hash text,
  audit_hash text,
  base_ledger_hash text,
  fragment_hash text,
  updated_at timestamptz not null default now(),
  primary key(run_id, part_key),
  unique(run_id, position),
  constraint authoring_parts_key_v3 check (
    btrim(part_key) <> '' and char_length(part_key) <= 240
  ),
  constraint authoring_parts_position_v3 check (position >= 0),
  constraint authoring_parts_title_v3 check (
    btrim(title) <> '' and char_length(title) <= 300
  ),
  constraint authoring_parts_state_v3 check (
    state in (
      'planned', 'building', 'awaiting_audit', 'repair_required',
      'rebuild_required', 'approved', 'blocked'
    )
  ),
  constraint authoring_parts_attempt_v3 check (attempt >= 0),
  constraint authoring_parts_hash_v3 check (
    (specification_hash is null or specification_hash ~ '^[0-9a-f]{64}$')
    and (submission_hash is null or submission_hash ~ '^[0-9a-f]{64}$')
    and (audit_hash is null or audit_hash ~ '^[0-9a-f]{64}$')
    and (base_ledger_hash is null or base_ledger_hash ~ '^[0-9a-f]{64}$')
    and (fragment_hash is null or fragment_hash ~ '^[0-9a-f]{64}$')
  )
);

create index authoring_parts_next_v3_idx
  on private.authoring_parts(run_id, position, state);

create table private.authoring_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  run_id uuid,
  part_key text,
  operation text not null,
  payload_hash text not null,
  status text not null default 'accepted',
  result_hash text references private.artifact_refs(hash) on delete restrict,
  error_code text,
  error_message text,
  phase text,
  cursor integer not null default 0,
  total integer,
  lease_owner uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(owner_id, request_id),
  constraint authoring_requests_id_v3 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint authoring_requests_operation_v3 check (
    operation in (
      'create_run', 'set_plan', 'put_ledger_chunk', 'finalize_plan',
      'set_part_specification', 'submit_part', 'audit_part', 'reopen_part',
      'validate', 'publish', 'import_document', 'block', 'resume', 'cancel_run'
    )
  ),
  constraint authoring_requests_hash_v3 check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint authoring_requests_status_v3 check (
    status in ('accepted', 'running', 'succeeded', 'failed')
  ),
  constraint authoring_requests_lease_v3 check (
    (status = 'running' and lease_owner is not null and lease_expires_at is not null)
    or (status <> 'running' and lease_owner is null and lease_expires_at is null)
  ),
  constraint authoring_requests_progress_v3 check (
    cursor >= 0 and (total is null or total >= cursor)
  )
);

create unique index authoring_requests_one_running_run_v3_idx
  on private.authoring_requests(run_id)
  where status = 'running' and run_id is not null;
create index authoring_requests_lease_v3_idx
  on private.authoring_requests(lease_expires_at)
  where status = 'running';
create index authoring_requests_run_v3_idx
  on private.authoring_requests(run_id, created_at desc);

create table private.run_artifacts (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.authoring_runs(id) on delete cascade,
  part_key text,
  attempt integer,
  role text not null,
  artifact_hash text not null references private.artifact_refs(hash) on delete restrict,
  item_count integer,
  created_at timestamptz not null default now(),
  constraint run_artifacts_part_v3 foreign key(run_id, part_key)
    references private.authoring_parts(run_id, part_key) on delete cascade,
  constraint run_artifacts_role_v3 check (
    btrim(role) <> '' and char_length(role) <= 180
  ),
  constraint run_artifacts_attempt_v3 check (attempt is null or attempt > 0),
  constraint run_artifacts_item_count_v3 check (item_count is null or item_count >= 0),
  constraint run_artifacts_part_attempt_v3 check (
    part_key is not null or attempt is null
  )
);

create unique index run_artifacts_role_v3_uidx
  on private.run_artifacts(
    run_id,
    coalesce(part_key, ''),
    coalesce(attempt, 0),
    role
  );
create index run_artifacts_hash_v3_idx on private.run_artifacts(artifact_hash);

alter table public.courses
  add column if not exists current_revision_hash text,
  add column if not exists revision_artifact_hash text,
  add column if not exists module_count bigint not null default 0,
  add column if not exists lesson_count bigint not null default 0,
  add column if not exists microsequence_count bigint not null default 0,
  add column if not exists card_count bigint not null default 0,
  add column if not exists document_storage_enabled boolean not null default false;

alter table public.courses
  drop constraint if exists courses_document_counts_v3;
alter table public.courses
  add constraint courses_document_counts_v3 check (
    module_count >= 0 and lesson_count >= 0
    and microsequence_count >= 0 and card_count >= 0
  );

alter table public.courses
  drop constraint if exists courses_current_revision_hash_v3;
alter table public.courses
  add constraint courses_current_revision_hash_v3 check (
    (current_revision_hash is null and revision_artifact_hash is null)
    or (
      current_revision_hash ~ '^[0-9a-f]{64}$'
      and revision_artifact_hash ~ '^[0-9a-f]{64}$'
      and document_storage_enabled
    )
  );

-- Progresso continua relacional e pertence a uma seleção autenticada, mas seus
-- identificadores de lição/card vêm da revisão validada projetada no IndexedDB.
-- Eles não podem depender de uma árvore de conteúdo duplicada no PostgreSQL.
alter table public.lesson_progress
  drop constraint if exists lesson_progress_lesson_fk;
alter table public.card_progress
  drop constraint if exists card_progress_card_fk;
alter table public.card_comments
  drop constraint if exists card_comments_card_fk;

create table private.course_revisions (
  course_id uuid not null references public.courses(id) on delete cascade,
  revision_hash text not null,
  artifact_hash text not null references private.artifact_refs(hash) on delete restrict,
  base_revision_hash text,
  validation_status text not null,
  validated_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(course_id, revision_hash),
  constraint course_revisions_hash_v3 check (
    revision_hash ~ '^[0-9a-f]{64}$'
    and artifact_hash = revision_hash
    and (base_revision_hash is null or base_revision_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint course_revisions_validation_v3 check (
    validation_status in ('pending', 'validated', 'rejected')
    and (
      (validation_status = 'validated' and validated_at is not null)
      or (validation_status <> 'validated' and validated_at is null)
    )
  )
);

create index course_revisions_artifact_v3_idx
  on private.course_revisions(artifact_hash);

create table private.course_revision_sync_changes (
  sequence bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  scope text not null,
  entity_type text not null default 'courseRevision',
  entity_id uuid not null,
  operation text not null,
  revision_hash text,
  changed_at timestamptz not null default now(),
  constraint course_revision_sync_scope_v3 check (scope in ('private', 'catalog')),
  constraint course_revision_sync_operation_v3 check (operation in ('upsert', 'delete')),
  constraint course_revision_sync_hash_v3 check (
    revision_hash is null or revision_hash ~ '^[0-9a-f]{64}$'
  )
);

create index course_revision_sync_user_v3_idx
  on private.course_revision_sync_changes(user_id, sequence);
create index course_revision_sync_catalog_v3_idx
  on private.course_revision_sync_changes(sequence)
  where scope = 'catalog';

create or replace function private.authoring_run_accessible_v3(
  p_owner_id uuid,
  p_run private.authoring_runs
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select p_owner_id = p_run.owner_id
    or (
      p_run.target = 'catalog'
      and (
        private.has_active_app_role(p_owner_id, 'owner')
        or private.has_active_app_role(p_owner_id, 'catalog_publisher')
        or private.has_active_app_role(p_owner_id, 'author')
        or private.has_active_app_role(p_owner_id, 'reviewer')
      )
    );
$$;

create or replace function private.authoring_control_snapshot_v3(
  p_owner_id uuid,
  p_run_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run private.authoring_runs%rowtype;
begin
  select * into v_run from private.authoring_runs where id = p_run_id;
  if not found then return null; end if;
  if not private.authoring_run_accessible_v3(p_owner_id, v_run) then
    raise exception 'A execução não está acessível.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'runId', v_run.id,
    'ownerId', v_run.owner_id,
    'publicationTarget', v_run.target,
    'target', v_run.target,
    'collectionId', v_run.collection_id,
    'title', v_run.title,
    'goal', v_run.goal,
    'contractKey', v_run.contract_key,
    'contractScope', v_run.contract_scope,
    'projectId', v_run.project_id,
    'publicationIntent', jsonb_build_object(
      'mode', v_run.publication_intent,
      'existingCourseId', v_run.base_course_id,
      'expectedContentHash', v_run.base_revision_hash
    ),
    'status', v_run.state,
    'resumeState', v_run.resume_state,
    'currentPartKey', v_run.current_part_key,
    'planHash', v_run.plan_hash,
    'ledgerManifest', v_run.ledger_manifest,
    'documentHash', v_run.final_document_hash,
    'courseId', v_run.course_id,
    'operationPhase', v_run.operation_phase,
    'operationCursor', v_run.operation_cursor,
    'operationTotal', v_run.operation_total,
    'lastErrorCode', v_run.last_error_code,
    'lastErrorMessage', v_run.last_error_message,
    'revision', v_run.revision,
    'createdAt', v_run.created_at,
    'updatedAt', v_run.updated_at,
    'terminalAt', v_run.terminal_at,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', p.part_key,
        'position', p.position,
        'title', p.title,
        'dependsOnPartKeys', to_jsonb(p.depends_on),
        'status', p.state,
        'attempt', p.attempt,
        'specificationHash', p.specification_hash,
        'submissionHash', p.submission_hash,
        'auditHash', p.audit_hash,
        'baseLedgerSha256', p.base_ledger_hash,
        'fragmentHash', p.fragment_hash,
        'updatedAt', p.updated_at
      ) order by p.position)
      from private.authoring_parts p where p.run_id = v_run.id
    ), '[]'::jsonb),
    'artifacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role', link.role,
        'partKey', link.part_key,
        'attempt', link.attempt,
        'hash', artifact.hash,
        'bucket', artifact.bucket,
        'objectKey', artifact.object_key,
        'artifactType', artifact.artifact_type,
        'mediaType', artifact.media_type,
        'sizeBytes', artifact.size_bytes,
        'itemCount', link.item_count
      ) order by link.id)
      from private.run_artifacts link
      join private.artifact_refs artifact on artifact.hash = link.artifact_hash
      where link.run_id = v_run.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_authoring_run_control_v3(
  p_owner_id uuid,
  p_run_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  return private.authoring_control_snapshot_v3(p_owner_id, p_run_id);
end;
$$;

create or replace function public.list_authoring_runs_control_v3(
  p_owner_id uuid,
  p_limit integer default 25,
  p_before_updated_at timestamptz default null,
  p_before_run_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  perform private.require_service_role();
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(private.authoring_control_snapshot_v3(p_owner_id, selected.id)
        order by selected.updated_at desc, selected.id desc)
      from (
        select run.id, run.updated_at
        from private.authoring_runs run
        where private.authoring_run_accessible_v3(p_owner_id, run)
          and (
            p_before_updated_at is null
            or (run.updated_at, run.id) < (p_before_updated_at, p_before_run_id)
          )
        order by run.updated_at desc, run.id desc
        limit v_limit
      ) selected
    ), '[]'::jsonb),
    'nextCursor', null
  );
end;
$$;

create or replace function public.begin_authoring_request_v3(
  p_owner_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_run_id uuid,
  p_part_key text,
  p_operation text,
  p_payload_hash text,
  p_lease_owner uuid,
  p_lease_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_request private.authoring_requests%rowtype;
  v_acquired boolean := false;
  v_lease_expired boolean := false;
begin
  perform private.require_service_role();
  if p_owner_id is null or p_lease_owner is null
     or p_lease_seconds not between 15 and 300 then
    raise exception 'Pedido de autoria inválido.' using errcode = '22023';
  end if;

  insert into private.authoring_requests(
    request_id, owner_id, api_client_id, run_id, part_key,
    operation, payload_hash
  ) values (
    p_request_id, p_owner_id, p_client_id, p_run_id, p_part_key,
    p_operation, p_payload_hash
  )
  on conflict(owner_id, request_id) do nothing;

  select * into v_request
  from private.authoring_requests
  where owner_id = p_owner_id and request_id = p_request_id
  for update;

  if v_request.operation <> p_operation or v_request.payload_hash <> p_payload_hash
     or v_request.run_id is distinct from p_run_id
     or v_request.part_key is distinct from p_part_key then
    raise exception 'requestId reutilizado com outra intenção.' using errcode = 'AC409';
  end if;

  if v_request.status = 'running' and v_request.lease_expires_at <= now() then
    v_lease_expired := true;
    update private.authoring_requests set
      status = 'accepted',
      lease_owner = null,
      lease_expires_at = null
    where id = v_request.id;
    v_request.status := 'accepted';
  end if;

  update private.authoring_requests set
    status = 'accepted',
    lease_owner = null,
    lease_expires_at = null
  where status = 'running'
    and lease_expires_at <= now()
    and id <> v_request.id;

  if v_request.status = 'accepted' and not exists (
    select 1 from private.authoring_requests active
    where active.run_id is not distinct from p_run_id
      and active.status = 'running'
      and active.id <> v_request.id
  ) then
    begin
      update private.authoring_requests set
        status = 'running',
        lease_owner = p_lease_owner,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        started_at = coalesce(started_at, now())
      where id = v_request.id
      returning * into v_request;
      v_acquired := true;
    exception when unique_violation then
      select * into v_request from private.authoring_requests where id = v_request.id;
    end;
  end if;

  return jsonb_build_object(
    'requestId', v_request.request_id,
    'runId', v_request.run_id,
    'operation', v_request.operation,
    'status', v_request.status,
    'leaseAcquired', v_acquired,
    'leaseExpired', v_lease_expired,
    'leaseExpiresAt', v_request.lease_expires_at,
    'phase', v_request.phase,
    'cursor', v_request.cursor,
    'total', v_request.total,
    'resultHash', v_request.result_hash,
    'errorCode', v_request.error_code,
    'errorMessage', v_request.error_message,
    'pollAfterSeconds', 2,
    'idempotent', not v_acquired
  );
end;
$$;

create or replace function private.register_artifact_v3(p_artifact jsonb)
returns text
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_hash text := p_artifact->>'hash';
  v_expected_key text;
begin
  -- Serializa registro e coleta sem manter a trava fora desta transação curta.
  -- Assim um hash não pode ser religado entre o tombstone e o DELETE no Storage.
  perform pg_advisory_xact_lock(hashtextextended('aralearn-artifact-gc-v3', 0));
  if exists (
    select 1 from private.artifact_gc_tombstones tombstone
    where tombstone.hash = v_hash
  ) then
    raise exception 'Artefato em coleta; tente novamente.'
      using errcode = '55P03';
  end if;
  v_expected_key := format(
    'artifacts/sha256/%s/%s/%s.json',
    substr(v_hash, 1, 2), substr(v_hash, 3, 2), v_hash
  );
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$'
     or p_artifact->>'objectKey' <> v_expected_key
     or (p_artifact->>'sizeBytes')::bigint <= 0 then
    raise exception 'Referência de artefato inválida.' using errcode = '22023';
  end if;
  insert into private.artifact_refs(
    hash, bucket, object_key, artifact_type, media_type, size_bytes
  ) values (
    v_hash,
    p_artifact->>'bucket',
    p_artifact->>'objectKey',
    p_artifact->>'artifactType',
    coalesce(p_artifact->>'mediaType', 'application/json'),
    (p_artifact->>'sizeBytes')::bigint
  )
  on conflict(hash) do update set hash = excluded.hash
  where private.artifact_refs.bucket = excluded.bucket
    and private.artifact_refs.object_key = excluded.object_key
    and private.artifact_refs.size_bytes = excluded.size_bytes;
  if not found then
    raise exception 'Hash já registrado com outro objeto.' using errcode = '23505';
  end if;
  return v_hash;
end;
$$;

create or replace function public.commit_authoring_transition_v3(
  p_owner_id uuid,
  p_request_id text,
  p_operation text,
  p_run_id uuid,
  p_part_key text,
  p_lease_owner uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_artifacts jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_request private.authoring_requests%rowtype;
  v_run private.authoring_runs%rowtype;
  v_part private.authoring_parts%rowtype;
  v_artifact jsonb;
  v_part_meta jsonb;
  v_hash text;
  v_next_key text;
  v_decision text;
  v_course_id uuid;
  v_section text;
  v_expected_chunks integer;
  v_expected_items integer;
  v_received_chunks integer;
  v_received_items integer;
begin
  perform private.require_service_role();
  if jsonb_typeof(p_metadata) <> 'object' or pg_column_size(p_metadata) > 262144
     or jsonb_typeof(p_artifacts) <> 'array'
     or jsonb_array_length(p_artifacts) > 32 then
    raise exception 'Envelope de controle inválido.' using errcode = '22023';
  end if;

  select * into v_request
  from private.authoring_requests
  where owner_id = p_owner_id and request_id = p_request_id
  for update;
  if not found or v_request.operation <> p_operation
     or v_request.status <> 'running'
     or v_request.lease_owner <> p_lease_owner
     or v_request.lease_expires_at <= now() then
    raise exception 'Lease de autoria indisponível.' using errcode = '55P03';
  end if;

  for v_artifact in select value from jsonb_array_elements(p_artifacts)
  loop
    perform private.register_artifact_v3(v_artifact);
  end loop;

  if p_operation = 'import_document' then
    select item->>'hash' into v_hash
    from jsonb_array_elements(p_artifacts) item
    where item->>'role' = 'final_document'
    limit 1;
    if v_hash is null or v_hash <> p_metadata->>'documentHash' then
      raise exception 'Documento importado não corresponde ao artefato.'
        using errcode = '23514';
    end if;
    insert into private.authoring_runs(
      id, owner_id, api_client_id, target, collection_id, title, goal,
      contract_key, contract_scope, project_id,
      publication_intent, base_course_id, base_revision_hash,
      state, final_document_hash, module_count, lesson_count,
      microsequence_count, card_count
    ) values (
      p_run_id, p_owner_id, v_request.api_client_id,
      p_metadata->>'publicationTarget',
      nullif(p_metadata->>'collectionId', '')::uuid,
      p_metadata->>'title',
      p_metadata->>'goal',
      p_metadata->>'contractKey',
      nullif(p_metadata->>'contractScope', ''),
      private.try_uuid(p_metadata->>'projectId'),
      coalesce(p_metadata->>'publicationMode', 'create'),
      nullif(p_metadata->>'baseCourseId', '')::uuid,
      nullif(p_metadata->>'baseRevisionHash', ''),
      'validated', v_hash,
      coalesce((p_metadata->>'moduleCount')::bigint, 0),
      coalesce((p_metadata->>'lessonCount')::bigint, 0),
      coalesce((p_metadata->>'microsequenceCount')::bigint, 0),
      coalesce((p_metadata->>'cardCount')::bigint, 0)
    );
  elsif p_operation = 'create_run' then
    insert into private.authoring_runs(
      id, owner_id, api_client_id, target, collection_id, title, contract_key,
      publication_intent, base_course_id, base_revision_hash
    ) values (
      p_run_id, p_owner_id, v_request.api_client_id,
      p_metadata->>'publicationTarget',
      nullif(p_metadata->>'collectionId', '')::uuid,
      p_metadata->>'title',
      p_metadata->>'contractKey',
      coalesce(p_metadata->>'publicationMode', 'create'),
      nullif(p_metadata->>'baseCourseId', '')::uuid,
      nullif(p_metadata->>'baseRevisionHash', '')
    );
  else
    select * into v_run from private.authoring_runs where id = p_run_id for update;
    if not found or not private.authoring_run_accessible_v3(p_owner_id, v_run) then
      raise exception 'Execução não encontrada.' using errcode = 'P0002';
    end if;

    if p_operation = 'set_plan' then
      if v_run.state <> 'planning' or v_run.plan_hash is not null then
        raise exception 'Plano não pode ser substituído.' using errcode = '55000';
      end if;
      select item->>'hash' into v_hash
      from jsonb_array_elements(p_artifacts) item where item->>'role' = 'plan' limit 1;
      if v_hash is null then raise exception 'Artefato de plano ausente.' using errcode = '22023'; end if;
      update private.authoring_runs set
        plan_hash = v_hash,
        ledger_manifest = p_metadata->'ledgerManifest',
        updated_at = now(),
        revision = revision + 1
      where id = p_run_id;
      for v_part_meta in select value from jsonb_array_elements(p_metadata->'parts')
      loop
        insert into private.authoring_parts(
          run_id, part_key, position, title, depends_on
        ) values (
          p_run_id,
          v_part_meta->>'partKey',
          (v_part_meta->>'position')::integer,
          v_part_meta->>'title',
          array(select jsonb_array_elements_text(
            coalesce(v_part_meta->'dependsOnPartKeys', '[]'::jsonb)
          ))
        );
      end loop;
    elsif p_operation = 'put_ledger_chunk' then
      if v_run.state <> 'planning' or v_run.plan_hash <> p_metadata->>'planHash' then
        raise exception 'Estado do ledger desatualizado.' using errcode = '55000';
      end if;
      v_section := p_metadata->>'section';
      v_expected_chunks := coalesce(
        (v_run.ledger_manifest#>>array['sections', v_section, 'chunkCount'])::integer,
        0
      );
      if v_section not in ('sources', 'claims', 'terms')
         or (p_metadata->>'position')::integer < 0
         or (p_metadata->>'position')::integer >= v_expected_chunks then
        raise exception 'Posição do trecho fora do manifesto.' using errcode = '22023';
      end if;
      update private.authoring_runs set updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation = 'finalize_plan' then
      if v_run.state <> 'planning' or v_run.plan_hash <> p_metadata->>'planHash' then
        raise exception 'Plano desatualizado.' using errcode = '55000';
      end if;
      foreach v_section in array array['sources', 'claims', 'terms']
      loop
        v_expected_chunks := coalesce(
          (v_run.ledger_manifest#>>array['sections', v_section, 'chunkCount'])::integer,
          0
        );
        v_expected_items := coalesce(
          (v_run.ledger_manifest#>>array['sections', v_section, 'itemCount'])::integer,
          0
        );
        select count(*), coalesce(sum(link.item_count), 0)
        into v_received_chunks, v_received_items
        from private.run_artifacts link
        where link.run_id = p_run_id
          and link.role ~ ('^ledger:' || v_section || ':[0-9]+$')
          and substring(link.role from '[0-9]+$')::integer >= 0
          and substring(link.role from '[0-9]+$')::integer < v_expected_chunks;
        if v_received_chunks <> v_expected_chunks
           or v_received_items <> v_expected_items
           or exists (
             select 1
             from generate_series(0, v_expected_chunks - 1) expected(position)
             where not exists (
               select 1
               from private.run_artifacts link
               where link.run_id = p_run_id
                 and link.role = format('ledger:%s:%s', v_section, expected.position)
             )
           ) then
          raise exception 'Ledger incompleto na seção %.', v_section
            using errcode = '23514';
        end if;
      end loop;
      select part_key into v_next_key from private.authoring_parts
      where run_id = p_run_id order by position limit 1;
      if v_next_key is null then raise exception 'Plano sem partes.' using errcode = '23514'; end if;
      update private.authoring_runs set
        state = 'building', current_part_key = v_next_key,
        updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation = 'set_part_specification' then
      select * into v_part from private.authoring_parts
      where run_id = p_run_id and part_key = p_part_key for update;
      if not found or v_run.current_part_key <> p_part_key
         or v_part.state not in ('planned', 'repair_required', 'rebuild_required') then
        raise exception 'Parte não está disponível para especificação.' using errcode = '55000';
      end if;
      select item->>'hash' into v_hash from jsonb_array_elements(p_artifacts) item
      where item->>'role' = 'specification' limit 1;
      update private.authoring_parts set
        state = 'building', attempt = attempt + 1,
        specification_hash = v_hash, updated_at = now()
      where run_id = p_run_id and part_key = p_part_key;
      update private.authoring_runs set
        state = case v_part.state
          when 'repair_required' then 'repair'
          when 'rebuild_required' then 'rebuild'
          else 'building'
        end,
        updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation = 'submit_part' then
      select * into v_part from private.authoring_parts
      where run_id = p_run_id and part_key = p_part_key for update;
      if not found or v_run.current_part_key <> p_part_key
         or v_part.state <> 'building'
         or v_part.attempt <> (p_metadata->>'expectedAttempt')::integer then
        raise exception 'Submissão desatualizada.' using errcode = '55000';
      end if;
      select item->>'hash' into v_hash from jsonb_array_elements(p_artifacts) item
      where item->>'role' = 'submission' limit 1;
      update private.authoring_parts set
        state = 'awaiting_audit',
        submission_hash = v_hash,
        fragment_hash = p_metadata->>'fragmentHash',
        base_ledger_hash = p_metadata->>'baseLedgerSha256',
        updated_at = now()
      where run_id = p_run_id and part_key = p_part_key;
      update private.authoring_runs set
        state = 'auditing', updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation in ('audit_part', 'reopen_part') then
      select * into v_part from private.authoring_parts
      where run_id = p_run_id and part_key = p_part_key for update;
      v_decision := p_metadata->>'decision';
      if not found or v_part.attempt <> (p_metadata->>'expectedAttempt')::integer
         or v_part.fragment_hash <> p_metadata->>'submissionSha256'
         or (
           p_operation = 'audit_part' and v_part.state <> 'awaiting_audit'
         ) then
        raise exception 'Auditoria desatualizada.' using errcode = '55000';
      end if;
      select item->>'hash' into v_hash from jsonb_array_elements(p_artifacts) item
      where item->>'role' = 'audit' limit 1;
      if v_decision = 'approve' then
        if coalesce((p_metadata->>'allGatesPassed')::boolean, false) is not true
           or coalesce((p_metadata->>'findingCount')::integer, 0) <> 0 then
          raise exception 'Aprovação exige todos os gates e nenhum achado.'
            using errcode = '23514';
        end if;
        update private.authoring_parts set state = 'approved', audit_hash = v_hash, updated_at = now()
        where run_id = p_run_id and part_key = p_part_key;
        select part_key into v_next_key from private.authoring_parts
        where run_id = p_run_id and state <> 'approved'
        order by position limit 1;
        update private.authoring_runs set
          state = case when v_next_key is null then 'ready_for_validation' else 'building' end,
          current_part_key = v_next_key,
          updated_at = now(), revision = revision + 1
        where id = p_run_id;
      elsif v_decision in ('repair', 'rebuild') then
        update private.authoring_parts set
          state = case v_decision when 'repair' then 'repair_required' else 'rebuild_required' end,
          audit_hash = v_hash, updated_at = now()
        where run_id = p_run_id and part_key = p_part_key;
        update private.authoring_runs set
          state = v_decision, current_part_key = p_part_key,
          updated_at = now(), revision = revision + 1
        where id = p_run_id;
      elsif v_decision = 'blocked' then
        update private.authoring_parts set state = 'blocked', audit_hash = v_hash, updated_at = now()
        where run_id = p_run_id and part_key = p_part_key;
        update private.authoring_runs set
          resume_state = state, state = 'blocked', current_part_key = p_part_key,
          updated_at = now(), revision = revision + 1
        where id = p_run_id;
      else
        raise exception 'Decisão de auditoria inválida.' using errcode = '22023';
      end if;
    elsif p_operation = 'validate' then
      if v_run.state <> 'ready_for_validation'
         or exists (
           select 1 from private.authoring_parts
           where run_id = p_run_id and state <> 'approved'
         ) then
        raise exception 'Curso ainda não está pronto para validação.' using errcode = '55000';
      end if;
      select item->>'hash' into v_hash from jsonb_array_elements(p_artifacts) item
      where item->>'role' = 'final_document' limit 1;
      if v_hash is null or v_hash <> p_metadata->>'documentHash' then
        raise exception 'Revisão validada não corresponde ao artefato.' using errcode = '23514';
      end if;
      update private.authoring_runs set
        state = 'validated',
        final_document_hash = v_hash,
        title = p_metadata->>'title',
        goal = p_metadata->>'goal',
        contract_key = p_metadata->>'contractKey',
        contract_scope = nullif(p_metadata->>'contractScope', ''),
        project_id = private.try_uuid(p_metadata->>'projectId'),
        module_count = coalesce((p_metadata->>'moduleCount')::bigint, 0),
        lesson_count = coalesce((p_metadata->>'lessonCount')::bigint, 0),
        microsequence_count = coalesce((p_metadata->>'microsequenceCount')::bigint, 0),
        card_count = coalesce((p_metadata->>'cardCount')::bigint, 0),
        operation_phase = null, operation_cursor = 0, operation_total = null,
        updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation = 'publish' then
      if v_run.state not in ('validated', 'publishing') or v_run.final_document_hash is null then
        raise exception 'Revisão não validada.' using errcode = '55000';
      end if;
      if v_run.target = 'catalog'
         and not (
           private.has_active_app_role(p_owner_id, 'owner')
           or private.has_active_app_role(p_owner_id, 'catalog_publisher')
         ) then
        raise exception 'Publicação editorial não autorizada.' using errcode = '42501';
      end if;
      if v_run.publication_intent = 'update' then
        select id into v_course_id from public.courses
        where id = v_run.base_course_id
          and deleted_at is null
          and current_revision_hash = v_run.base_revision_hash
          and (
            (v_run.target = 'private' and owner_id = v_run.owner_id)
            or (v_run.target = 'catalog' and owner_id is null)
          )
        for update;
        if not found then raise exception 'Revisão base desatualizada.' using errcode = '40001'; end if;
      else
        v_course_id := gen_random_uuid();
        insert into public.courses(
          id, owner_id, status, contract_key, title, goal,
          contract_scope, project_id, position,
          content_hash, current_revision_hash, revision_artifact_hash,
          module_count, lesson_count, microsequence_count, card_count,
          document_storage_enabled
        ) values (
          v_course_id,
          case when v_run.target = 'private' then v_run.owner_id end,
          'published', v_run.contract_key, v_run.title,
          coalesce(nullif(v_run.goal, ''), v_run.title),
          v_run.contract_scope,
          coalesce(v_run.project_id, gen_random_uuid()),
          coalesce((
            select max(course.position) + 1
            from public.courses course
            where course.owner_id is not distinct from (
              case when v_run.target = 'private' then v_run.owner_id end
            )
              and course.deleted_at is null
          ), 0),
          v_run.final_document_hash, v_run.final_document_hash,
          v_run.final_document_hash,
          v_run.module_count, v_run.lesson_count,
          v_run.microsequence_count, v_run.card_count, true
        );
      end if;
      insert into private.course_revisions(
        course_id, revision_hash, artifact_hash, base_revision_hash,
        validation_status, validated_at, published_at, created_by
      ) values (
        v_course_id, v_run.final_document_hash, v_run.final_document_hash,
        v_run.base_revision_hash, 'validated', now(), now(), p_owner_id
      ) on conflict(course_id, revision_hash) do nothing;
      update public.courses set
        contract_key = v_run.contract_key,
        title = v_run.title,
        goal = coalesce(nullif(v_run.goal, ''), v_run.title),
        contract_scope = v_run.contract_scope,
        project_id = coalesce(v_run.project_id, project_id, gen_random_uuid()),
        status = 'published',
        deleted_at = null,
        current_revision_hash = v_run.final_document_hash,
        revision_artifact_hash = v_run.final_document_hash,
        content_hash = v_run.final_document_hash,
        module_count = v_run.module_count,
        lesson_count = v_run.lesson_count,
        microsequence_count = v_run.microsequence_count,
        card_count = v_run.card_count,
        document_storage_enabled = true,
        publication_seq = publication_seq + 1,
        updated_at = now()
      where id = v_course_id;
      if v_run.target = 'private' then
        insert into public.user_course_selections(user_id, course_id, position)
        values(
          v_run.owner_id,
          v_course_id,
          coalesce((
            select max(selection.position) + 1
            from public.user_course_selections selection
            where selection.user_id = v_run.owner_id
          ), 0)
        )
        on conflict(user_id, course_id) do nothing;
      elsif v_run.collection_id is not null then
        update public.catalog_collection_courses set
          collection_id = v_run.collection_id,
          position = coalesce((
            select max(item.position) + 1
            from public.catalog_collection_courses item
            where item.collection_id = v_run.collection_id
              and item.course_id <> v_course_id
              and item.deleted_at is null
          ), 0),
          deleted_at = null,
          updated_at = now()
        where course_id = v_course_id and deleted_at is null;
        if not found then
          insert into public.catalog_collection_courses(collection_id, course_id, position)
          values (
            v_run.collection_id,
            v_course_id,
            coalesce((
              select max(item.position) + 1
              from public.catalog_collection_courses item
              where item.collection_id = v_run.collection_id
                and item.deleted_at is null
            ), 0)
          );
        end if;
      end if;
      insert into private.course_revision_sync_changes(
        user_id, scope, entity_id, operation, revision_hash
      ) values (
        case when v_run.target = 'private' then v_run.owner_id end,
        v_run.target, v_course_id, 'upsert', v_run.final_document_hash
      );
      update private.authoring_runs set
        state = 'published', course_id = v_course_id,
        terminal_at = now(), updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation = 'block' then
      if v_run.state in ('published', 'cancelled') then
        raise exception 'Execução terminal.' using errcode = '55000';
      end if;
      update private.authoring_runs set
        resume_state = state, state = 'blocked', current_part_key = coalesce(p_part_key, current_part_key),
        updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation = 'resume' then
      if v_run.state <> 'blocked' then raise exception 'Execução não bloqueada.' using errcode = '55000'; end if;
      update private.authoring_runs set
        state = resume_state, resume_state = null,
        updated_at = now(), revision = revision + 1
      where id = p_run_id;
    elsif p_operation = 'cancel_run' then
      if v_run.state in ('published', 'cancelled') then
        raise exception 'Execução terminal.' using errcode = '55000';
      end if;
      update private.authoring_runs set
        state = 'cancelled', terminal_at = now(),
        updated_at = now(), revision = revision + 1
      where id = p_run_id;
    else
      raise exception 'Operação de controle desconhecida.' using errcode = '22023';
    end if;
  end if;

  -- O vínculo é criado somente depois de a transição validar o estado. A
  -- transação é curta e não contém upload, download ou validação do documento.
  for v_artifact in select value from jsonb_array_elements(p_artifacts)
  loop
    insert into private.run_artifacts(
      run_id, part_key, attempt, role, artifact_hash, item_count
    ) values (
      p_run_id,
      nullif(v_artifact->>'partKey', ''),
      nullif(v_artifact->>'attempt', '')::integer,
      v_artifact->>'role',
      v_artifact->>'hash',
      nullif(v_artifact->>'itemCount', '')::integer
    )
    on conflict(
      run_id,
      (coalesce(part_key, '')),
      (coalesce(attempt, 0)),
      role
    ) do update set
      artifact_hash = excluded.artifact_hash,
      item_count = excluded.item_count;
  end loop;

  update private.authoring_requests set
    status = 'succeeded',
    result_hash = case when p_operation in ('validate', 'publish')
      then (select final_document_hash from private.authoring_runs where id = p_run_id)
      else null end,
    lease_owner = null,
    lease_expires_at = null,
    completed_at = now(),
    phase = 'completed'
  where id = v_request.id;

  return private.authoring_control_snapshot_v3(p_owner_id, p_run_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.fail_authoring_request_v3(
  p_owner_id uuid,
  p_request_id text,
  p_operation text,
  p_lease_owner uuid,
  p_error_code text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  update private.authoring_requests set
    status = 'failed',
    error_code = left(p_error_code, 120),
    error_message = left(p_error_message, 1000),
    lease_owner = null,
    lease_expires_at = null,
    completed_at = now()
  where owner_id = p_owner_id
    and request_id = p_request_id
    and operation = p_operation
    and status = 'running'
    and lease_owner = p_lease_owner;
  return jsonb_build_object('failed', found);
end;
$$;

create or replace function public.release_authoring_request_v3(
  p_owner_id uuid,
  p_request_id text,
  p_operation text,
  p_lease_owner uuid,
  p_error_code text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  update private.authoring_requests set
    status = 'accepted',
    error_code = left(p_error_code, 120),
    error_message = left(p_error_message, 1000),
    lease_owner = null,
    lease_expires_at = null
  where owner_id = p_owner_id
    and request_id = p_request_id
    and operation = p_operation
    and status = 'running'
    and lease_owner = p_lease_owner;
  return jsonb_build_object('released', found, 'retryable', true);
end;
$$;

create or replace function public.replay_authoring_request_v3(
  p_owner_id uuid,
  p_request_id text,
  p_payload_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_request private.authoring_requests%rowtype;
begin
  perform private.require_service_role();
  select * into v_request from private.authoring_requests
  where owner_id = p_owner_id and request_id = p_request_id;
  if not found then return null; end if;
  if v_request.payload_hash <> p_payload_hash then
    raise exception 'requestId reutilizado com outra intenção.' using errcode = 'AC409';
  end if;
  if v_request.status = 'succeeded' and v_request.run_id is not null then
    return private.authoring_control_snapshot_v3(p_owner_id, v_request.run_id)
      || jsonb_build_object('idempotent', true);
  end if;
  return jsonb_build_object(
    'requestId', v_request.request_id,
    'runId', v_request.run_id,
    'operation', v_request.operation,
    'status', v_request.status,
    'phase', v_request.phase,
    'cursor', v_request.cursor,
    'total', v_request.total,
    'errorCode', v_request.error_code,
    'errorMessage', v_request.error_message,
    'pollAfterSeconds', 2,
    'idempotent', true
  );
end;
$$;

create or replace function public.pull_course_revision_changes(
  p_after_sequence bigint default 0,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sequence', change.sequence,
        'courseId', change.entity_id,
        'revisionHash', change.revision_hash,
        'operation', change.operation,
        'scope', change.scope,
        'changedAt', change.changed_at
      ) order by change.sequence)
      from (
        select *
        from private.course_revision_sync_changes
        where sequence > greatest(coalesce(p_after_sequence, 0), 0)
          and (scope = 'catalog' or user_id = v_user_id)
        order by sequence
        limit v_limit
      ) change
    ), '[]'::jsonb),
    'requiresFullResync', false
  );
end;
$$;

create or replace function public.get_course_revision_artifact_v3(
  p_actor_id uuid,
  p_course_id uuid,
  p_revision_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_course public.courses%rowtype;
begin
  perform private.require_service_role();
  if p_actor_id is null or not exists (
    select 1 from auth.users account where account.id = p_actor_id
  ) then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  select * into v_course from public.courses
  where id = p_course_id;
  if not found then return null; end if;
  if not (
    v_course.owner_id is null or v_course.owner_id = p_actor_id
  ) then
    raise exception 'Revisão não autorizada.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'courseId', v_course.id,
      'revisionHash', revision.revision_hash,
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'artifactType', artifact.artifact_type,
      'mediaType', artifact.media_type,
      'sizeBytes', artifact.size_bytes
    )
    from private.course_revisions revision
    join private.artifact_refs artifact on artifact.hash = revision.artifact_hash
    where revision.course_id = v_course.id
      and revision.revision_hash = p_revision_hash
      and revision.validation_status = 'validated'
      and revision.published_at is not null
  );
end;
$$;

create or replace function public.list_unreferenced_artifacts_v3(
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
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
          select 1 from private.run_artifacts link where link.artifact_hash = ref.hash
        )
        and not exists (
          select 1 from private.course_revisions revision where revision.artifact_hash = ref.hash
        )
        and not exists (
          select 1 from private.authoring_requests request where request.result_hash = ref.hash
        )
      order by ref.created_at
      limit least(greatest(coalesce(p_limit, 100), 1), 1000)
    ) artifact
  ), '[]'::jsonb);
end;
$$;

create or replace function public.release_expired_authoring_artifact_links_v3(
  p_older_than interval default interval '30 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_released bigint;
begin
  perform private.require_service_role();
  if p_older_than is null or p_older_than < interval '0 seconds' then
    raise exception 'Retenção inválida.' using errcode = '22023';
  end if;
  with expired_runs as (
    select run.id, run.state
    from private.authoring_runs run
    where run.state in ('published', 'cancelled', 'failed')
      and run.terminal_at < now() - p_older_than
    order by run.terminal_at, run.id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ), released as (
    delete from private.run_artifacts artifact
    using expired_runs run
    where artifact.run_id = run.id
      and (run.state <> 'published' or artifact.role <> 'final_document')
    returning artifact.id
  )
  select count(*) into v_released from released;
  return jsonb_build_object('releasedLinks', v_released);
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
        select 1 from private.run_artifacts link where link.artifact_hash = ref.hash
      )
      and not exists (
        select 1 from private.course_revisions revision where revision.artifact_hash = ref.hash
      )
      and not exists (
        select 1 from private.authoring_requests request where request.result_hash = ref.hash
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

create or replace function public.complete_artifact_gc_v3(
  p_claim_token uuid,
  p_hash text,
  p_object_absent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_tombstone private.artifact_gc_tombstones%rowtype;
begin
  perform private.require_service_role();
  select * into v_tombstone
  from private.artifact_gc_tombstones
  where hash = p_hash and claim_token = p_claim_token
  for update;
  if not found then
    return jsonb_build_object('completed', true, 'idempotent', true);
  end if;
  if not p_object_absent then
    insert into private.artifact_refs(
      hash, bucket, object_key, artifact_type, media_type, size_bytes
    ) values (
      v_tombstone.hash, v_tombstone.bucket, v_tombstone.object_key,
      v_tombstone.artifact_type, v_tombstone.media_type, v_tombstone.size_bytes
    ) on conflict(hash) do nothing;
  end if;
  delete from private.artifact_gc_tombstones
  where hash = p_hash and claim_token = p_claim_token;
  return jsonb_build_object(
    'completed', true,
    'deleted', p_object_absent,
    'idempotent', false
  );
end;
$$;

revoke all on table private.artifact_refs from public, anon, authenticated;
revoke all on table private.artifact_gc_tombstones from public, anon, authenticated;
revoke all on table private.authoring_runs from public, anon, authenticated;
revoke all on table private.authoring_parts from public, anon, authenticated;
revoke all on table private.authoring_requests from public, anon, authenticated;
revoke all on table private.run_artifacts from public, anon, authenticated;
revoke all on table private.course_revisions from public, anon, authenticated;
revoke all on table private.course_revision_sync_changes from public, anon, authenticated;

revoke all on function public.resolve_catalog_artifact_publisher_v3(text,uuid)
  from public, anon, authenticated;
revoke all on function public.get_authoring_run_control_v3(uuid,uuid) from public, anon, authenticated;
revoke all on function public.list_authoring_runs_control_v3(uuid,integer,timestamptz,uuid)
  from public, anon, authenticated;
revoke all on function public.begin_authoring_request_v3(uuid,uuid,text,uuid,text,text,text,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.commit_authoring_transition_v3(uuid,text,text,uuid,text,uuid,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_authoring_request_v3(uuid,text,text,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.release_authoring_request_v3(uuid,text,text,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.replay_authoring_request_v3(uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.list_unreferenced_artifacts_v3(interval,integer)
  from public, anon, authenticated;
revoke all on function public.release_expired_authoring_artifact_links_v3(interval,integer)
  from public, anon, authenticated;
revoke all on function public.claim_unreferenced_artifacts_v3(uuid,interval,integer)
  from public, anon, authenticated;
revoke all on function public.complete_artifact_gc_v3(uuid,text,boolean)
  from public, anon, authenticated;
revoke all on function public.get_course_revision_artifact_v3(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.pull_course_revision_changes(bigint,integer) from public, anon;
grant execute on function public.resolve_catalog_artifact_publisher_v3(text,uuid)
  to service_role;
grant execute on function public.get_authoring_run_control_v3(uuid,uuid) to service_role;
grant execute on function public.list_authoring_runs_control_v3(uuid,integer,timestamptz,uuid)
  to service_role;
grant execute on function public.begin_authoring_request_v3(uuid,uuid,text,uuid,text,text,text,uuid,integer)
  to service_role;
grant execute on function public.commit_authoring_transition_v3(uuid,text,text,uuid,text,uuid,jsonb,jsonb)
  to service_role;
grant execute on function public.fail_authoring_request_v3(uuid,text,text,uuid,text,text)
  to service_role;
grant execute on function public.release_authoring_request_v3(uuid,text,text,uuid,text,text)
  to service_role;
grant execute on function public.replay_authoring_request_v3(uuid,text,text) to service_role;
grant execute on function public.list_unreferenced_artifacts_v3(interval,integer)
  to service_role;
grant execute on function public.release_expired_authoring_artifact_links_v3(interval,integer)
  to service_role;
grant execute on function public.claim_unreferenced_artifacts_v3(uuid,interval,integer)
  to service_role;
grant execute on function public.complete_artifact_gc_v3(uuid,text,boolean)
  to service_role;
grant execute on function public.get_course_revision_artifact_v3(uuid,uuid,text)
  to service_role;
grant execute on function public.pull_course_revision_changes(bigint,integer) to service_role;
grant execute on function public.pull_course_revision_changes(bigint,integer) to authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260728010000',
    'contractVersion', 3,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'relational-offline-replica',
      'granular-sync',
      'private-authoring',
      'catalog-submissions',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'immutable-course-revisions'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
