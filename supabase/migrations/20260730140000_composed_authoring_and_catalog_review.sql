begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-composed-authoring-and-catalog-review-v5',
  0
));

-- O workspace deixa de ser uma sequência de cópias integrais no Storage.
-- A árvore mutável passa a ter uma linha corrente por parte; somente uma
-- publicação materializa o documento canônico compacto.
do $drop_workspace_functions$
declare
  v_function record;
begin
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname in ('public', 'private')
      and procedure_value.proname in (
        'workspace_revision_result_v4',
        'replay_authoring_workspace_request_v4',
        'create_authoring_workspace_v4',
        'commit_authoring_workspace_revision_v4',
        'get_authoring_workspace_v4',
        'list_authoring_workspaces_v4',
        'list_authoring_workspace_history_v4',
        'publish_authoring_workspace_course_v4',
        'publish_authoring_workspace_course_v4_impl',
        'delete_authoring_workspace_v4',
        'populate_authoring_workspace_request_result_v4',
        'lock_authoring_workspace_request_v4',
        'lock_workspace_catalog_publication_authority_v4',
        'require_workspace_actor_v4',
        'list_unreferenced_artifacts_v4',
        'claim_unreferenced_artifacts_v4'
      )
  loop
    execute format('drop function if exists %s cascade', v_function.signature);
  end loop;
end;
$drop_workspace_functions$;

do $drop_replaced_catalog_functions$
declare
  v_function record;
begin
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname in ('public', 'private')
      and procedure_value.proname in (
        'begin_catalog_admin_command',
        'complete_catalog_admin_command',
        'catalog_order_entry_is_valid',
        'list_catalog_courses_admin',
        'get_catalog_course_admin',
        'update_catalog_course_metadata_admin',
        'create_catalog_collection_admin',
        'rename_catalog_collection_admin',
        'retire_catalog_collection_admin',
        'reorder_catalog_collections_admin',
        'move_catalog_course_admin',
        'reorder_catalog_courses_admin'
      )
  loop
    execute format('drop function if exists %s', v_function.signature);
  end loop;
end;
$drop_replaced_catalog_functions$;

drop table if exists private.catalog_admin_receipts;
drop table if exists private.authoring_workspace_revisions cascade;
drop table if exists private.authoring_workspace_requests cascade;
drop table if exists private.authoring_workspaces cascade;

create table private.authoring_workspaces (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  revision bigint not null default 1,
  source_course_id uuid references public.courses(id) on delete set null,
  source_revision_hash text,
  source_submission_id uuid,
  brief text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint authoring_workspaces_title_v5 check (
    btrim(title) <> '' and char_length(title) <= 300
  ),
  constraint authoring_workspaces_revision_v5 check (revision > 0),
  constraint authoring_workspaces_source_hash_v5 check (
    source_revision_hash is null
    or source_revision_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_workspaces_brief_v5 check (
    char_length(brief) <= 16000
  )
);

create index authoring_workspaces_owner_v5_idx
  on private.authoring_workspaces(owner_id, updated_at desc, id)
  where deleted_at is null;
create index authoring_workspaces_deleted_v5_idx
  on private.authoring_workspaces(deleted_at, id)
  where deleted_at is not null;

create table private.authoring_workspace_entities (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  parent_type text,
  parent_id text,
  position integer not null,
  content jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id, entity_type, entity_id),
  constraint authoring_workspace_entities_type_v5 check (
    entity_type in (
      'project', 'course', 'module', 'lesson',
      'topic', 'microsequence', 'card'
    )
  ),
  constraint authoring_workspace_entities_parent_v5 check (
    (entity_type = 'project' and parent_type is null and parent_id is null)
    or (
      entity_type = 'course'
      and parent_type = 'project'
      and parent_id is not null
    )
    or (entity_type = 'module' and parent_type = 'course' and parent_id is not null)
    or (entity_type = 'lesson' and parent_type = 'module' and parent_id is not null)
    or (entity_type = 'topic' and parent_type = 'lesson' and parent_id is not null)
    or (
      entity_type = 'microsequence'
      and parent_type = 'lesson'
      and parent_id is not null
    )
    or (
      entity_type = 'card'
      and parent_type = 'microsequence'
      and parent_id is not null
    )
  ),
  constraint authoring_workspace_entities_id_v5 check (
    btrim(entity_id) <> ''
    and entity_id = btrim(entity_id)
    and char_length(entity_id) <= 240
    and (parent_id is null or (
      btrim(parent_id) <> ''
      and parent_id = btrim(parent_id)
      and char_length(parent_id) <= 240
    ))
    and (entity_type <> 'project' or entity_id = 'project')
  ),
  constraint authoring_workspace_entities_position_v5 check (
    (entity_type = 'project' and position = 0)
    or (entity_type = 'card' and position > 0)
    or (entity_type not in ('project', 'card') and position >= 0)
  ),
  constraint authoring_workspace_entities_content_v5 check (
    jsonb_typeof(content) = 'object'
    and not (content ? 'id')
    and not (content ? 'position')
    and not (content ? 'courses')
    and not (content ? 'modules')
    and not (content ? 'lessons')
    and not (content ? 'topics')
    and not (content ? 'microsequences')
    and not (content ? 'cards')
    and pg_column_size(content) <= 1048576
  ),
  constraint authoring_workspace_entities_version_v5 check (version > 0),
  constraint authoring_workspace_entities_parent_fk_v5 foreign key (
    workspace_id, parent_type, parent_id
  ) references private.authoring_workspace_entities(
    workspace_id, entity_type, entity_id
  ) deferrable initially deferred
);

create index authoring_workspace_entities_parent_v5_idx
  on private.authoring_workspace_entities(
    workspace_id, parent_type, parent_id, entity_type, position, entity_id
  );

-- Cada raiz de curso conhece, por destino, a publicação que deve continuar
-- atualizando. O vínculo guarda somente o baseline necessário ao CAS; a árvore
-- continua nas partes correntes e a publicação continua em um único artefato.
create table private.authoring_workspace_publications (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  workspace_course_id text not null,
  target text not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id, workspace_course_id, target),
  unique(workspace_id, target, course_id),
  constraint authoring_workspace_publications_course_id_v5 check (
    btrim(workspace_course_id) <> ''
    and workspace_course_id = btrim(workspace_course_id)
    and char_length(workspace_course_id) <= 240
  ),
  constraint authoring_workspace_publications_target_v5 check (
    target in ('private', 'catalog')
  ),
  constraint authoring_workspace_publications_hash_v5 check (
    content_hash ~ '^[0-9a-f]{64}$'
  )
);

create index authoring_workspace_publications_course_v5_idx
  on private.authoring_workspace_publications(course_id);

create function private.cleanup_workspace_course_publication_v5()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if old.entity_type = 'course' then
    delete from private.authoring_workspace_publications publication
    where publication.workspace_id = old.workspace_id
      and publication.workspace_course_id = old.entity_id;
  end if;
  return old;
end;
$function$;

create trigger authoring_workspace_course_publication_cleanup_v5
after delete on private.authoring_workspace_entities
for each row execute function
  private.cleanup_workspace_course_publication_v5();

create function private.cleanup_archived_course_publication_v5()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  delete from private.authoring_workspace_publications publication
  where publication.course_id = new.id;
  return new;
end;
$function$;

create trigger archived_course_publication_cleanup_v5
after update of status, deleted_at, document_storage_enabled on public.courses
for each row
when (
  new.deleted_at is not null
  or new.status <> 'published'
  or not new.document_storage_enabled
)
execute function private.cleanup_archived_course_publication_v5();

create table private.authoring_workspace_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  operation text not null,
  payload_hash text not null,
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  primary key(owner_id, request_id),
  constraint authoring_workspace_requests_id_v5 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint authoring_workspace_requests_operation_v5 check (
    operation in (
      'create',
      'create_structure',
      'update_metadata',
      'save_microsequence_cards',
      'save_card',
      'update_brief',
      'copy_entity',
      'rename_entity',
      'move_entity',
      'delete_entity',
      'merge_microsequences',
      'split_microsequence',
      'promote_module',
      'demote_course',
      'import_course',
      'publish_private_preview',
      'publish_private_complete',
      'publish_catalog_complete',
      'delete_workspace'
    )
  ),
  constraint authoring_workspace_requests_hash_v5 check (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_workspace_requests_result_v5 check (
    jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536
  ),
  constraint authoring_workspace_requests_expiry_order_v5 check (
    expires_at > created_at
  )
);

create index authoring_workspace_requests_expiry_v5_idx
  on private.authoring_workspace_requests(expires_at, owner_id, request_id);

create table private.authoring_workspace_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  revision bigint not null,
  operation text not null,
  summary jsonb not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(workspace_id, revision),
  constraint authoring_workspace_events_operation_v5 check (
    operation in (
      'create',
      'create_structure',
      'update_metadata',
      'save_microsequence_cards',
      'save_card',
      'update_brief',
      'copy_entity',
      'rename_entity',
      'move_entity',
      'delete_entity',
      'merge_microsequences',
      'split_microsequence',
      'promote_module',
      'demote_course',
      'import_course'
    )
  ),
  constraint authoring_workspace_events_summary_v5 check (
    jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 32768
  )
);

create index authoring_workspace_events_recent_v5_idx
  on private.authoring_workspace_events(workspace_id, revision desc);

create table private.catalog_management_receipts_v5 (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  primary key(actor_id, request_id),
  constraint catalog_management_receipts_id_v5 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint catalog_management_receipts_operation_v5 check (
    operation in (
      'create_collection',
      'update_collection',
      'retire_collection',
      'move_course',
      'remove_course'
    )
  ),
  constraint catalog_management_receipts_hash_v5 check (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint catalog_management_receipts_result_v5 check (
    jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 65536
  ),
  constraint catalog_management_receipts_expiry_v5 check (
    expires_at > created_at
  )
);

create index catalog_management_receipts_expiry_v5_idx
  on private.catalog_management_receipts_v5(
    expires_at, actor_id, request_id
  );

create table private.personal_library_receipts_v5 (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  primary key(actor_id, request_id),
  constraint personal_library_receipts_id_v5 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint personal_library_receipts_operation_v5 check (
    operation = 'remove_course'
  ),
  constraint personal_library_receipts_hash_v5 check (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint personal_library_receipts_result_v5 check (
    jsonb_typeof(result) = 'object'
    and pg_column_size(result) <= 65536
  ),
  constraint personal_library_receipts_expiry_v5 check (
    expires_at > created_at
  )
);

create index personal_library_receipts_expiry_v5_idx
  on private.personal_library_receipts_v5(
    expires_at, actor_id, request_id
  );

-- O feed de revisões precisa conservar somente o estado mais novo de cada
-- curso e audiência. Uma mudança nova sempre recebe sequence maior; assim,
-- consumidores com afterSequence continuam vendo o estado corrente enquanto
-- as versões superadas deixam de consumir linhas no free-tier.
with ranked_changes as materialized (
  select
    change.sequence,
    row_number() over (
      partition by change.scope, change.user_id, change.entity_id
      order by change.sequence desc
    ) as recency
  from private.course_revision_sync_changes change
)
delete from private.course_revision_sync_changes change
using ranked_changes ranked
where change.sequence = ranked.sequence
  and ranked.recency > 1;

create index course_revision_sync_audience_entity_v5_idx
  on private.course_revision_sync_changes(
    scope, user_id, entity_id, sequence desc
  );

create function private.compact_course_revision_sync_changes_v5()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-course-revision-sync-v5:'
      || new.scope || ':'
      || coalesce(new.user_id::text, 'catalog') || ':'
      || new.entity_id::text,
    0
  ));
  delete from private.course_revision_sync_changes change
  where change.scope = new.scope
    and change.user_id is not distinct from new.user_id
    and change.entity_id = new.entity_id
    and change.sequence < (
      select max(latest.sequence)
      from private.course_revision_sync_changes latest
      where latest.scope = new.scope
        and latest.user_id is not distinct from new.user_id
        and latest.entity_id = new.entity_id
    );
  return null;
end;
$function$;

create trigger course_revision_sync_compact_v5
after insert on private.course_revision_sync_changes
for each row execute function private.compact_course_revision_sync_changes_v5();

-- O feed pessoal já possui watermark e retenções seguros, mas a compactação
-- não pode depender de uma rotina administrativa manual. A primeira escrita
-- elegível de cada dia executa a mesma política; as demais apenas atravessam o
-- gate barato. FOR EACH STATEMENT evita multiplicar o custo em lotes.
create function private.maintain_sync_history_v5()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_policy private.sync_retention_policy%rowtype;
  v_watermark bigint;
  v_compact_through bigint;
begin
  if not pg_try_advisory_xact_lock(hashtextextended(
    'aralearn-sync-history-maintenance-v5',
    0
  )) then
    return null;
  end if;
  -- Toda escrita normal já conserva esta ordem de commit. O try-lock também
  -- fecha com segurança uma inserção administrativa que não a tenha tomado.
  if not pg_try_advisory_xact_lock(hashtextextended(
    'aralearn-sync-feed-commit-order',
    0
  )) then
    return null;
  end if;
  select * into v_policy
  from private.sync_retention_policy policy
  where policy.singleton
  for update;
  if not found
     or v_policy.updated_at > v_now - interval '1 day' then
    return null;
  end if;

  update private.sync_devices device
  set inactive_at = v_now
  where device.inactive_at is null
    and device.last_seen_at < v_now - v_policy.device_inactive_after;

  select coalesce(
    min(device.last_pulled_sequence) filter (
      where device.inactive_at is null
        and device.last_seen_at
          >= v_now - v_policy.device_inactive_after
    ),
    (select coalesce(max(change.sequence), 0)
     from private.sync_changes change)
  )
  into v_watermark
  from private.sync_devices device;

  -- Somente um prefixo contíguo anterior à janela mínima pode desaparecer.
  -- A linha que acionou este trigger tem changed_at corrente e fica protegida.
  select least(
    v_watermark,
    coalesce(min(change.sequence) - 1, v_watermark)
  )
  into v_compact_through
  from private.sync_changes change
  where change.sequence <= v_watermark
    and change.changed_at >= v_now - v_policy.minimum_retention;
  v_compact_through := greatest(
    v_policy.compacted_through_sequence,
    coalesce(v_compact_through, 0)
  );

  delete from private.sync_changes change
  where change.sequence <= v_compact_through;
  delete from private.sync_idempotency ledger
  where ledger.applied_at < v_now - v_policy.idempotency_retention
    and (
      ledger.applied_sequence is null
      or ledger.applied_sequence <= v_compact_through
    );
  update private.sync_retention_policy policy
  set compacted_through_sequence = v_compact_through,
      updated_at = v_now
  where policy.singleton;
  return null;
end;
$function$;

create trigger sync_history_maintenance_v5
after insert on private.sync_changes
for each statement execute function private.maintain_sync_history_v5();

-- O curso aponta para uma única revisão corrente. O corte remove a cadeia
-- histórica já acumulada e deixa os artefatos antigos elegíveis ao GC.
update public.courses course
set content_hash = null,
    current_revision_hash = null,
    revision_artifact_hash = null,
    module_count = 0,
    lesson_count = 0,
    microsequence_count = 0,
    card_count = 0,
    document_storage_enabled = false,
    updated_at = now()
where (course.deleted_at is not null or course.status <> 'published')
  and (
    course.content_hash is not null
    or course.current_revision_hash is not null
    or course.revision_artifact_hash is not null
    or course.document_storage_enabled
    or course.module_count <> 0
    or course.lesson_count <> 0
    or course.microsequence_count <> 0
    or course.card_count <> 0
  );
-- content_hash é o ponteiro leve consumido pela sincronização. Quando a
-- revisão e seu objeto já concordam, uma divergência desse cache pode ser
-- reparada sem escolher entre duas versões de conteúdo.
update public.courses course
set content_hash = course.current_revision_hash,
    updated_at = now()
where course.status = 'published'
  and course.deleted_at is null
  and course.document_storage_enabled
  and course.current_revision_hash is not null
  and course.current_revision_hash = course.revision_artifact_hash
  and course.content_hash is distinct from course.current_revision_hash;
set constraints all immediate;
alter table public.courses
  drop constraint if exists courses_current_revision_hash_v3;
alter table public.courses
  drop constraint if exists courses_document_storage_v5;
alter table public.courses
  add constraint courses_document_storage_v5 check (
    (
      document_storage_enabled
      and content_hash is not null
      and current_revision_hash is not null
      and revision_artifact_hash is not null
      and content_hash = current_revision_hash
      and current_revision_hash = revision_artifact_hash
    )
    or (
      not document_storage_enabled
      and content_hash is null
      and current_revision_hash is null
      and revision_artifact_hash is null
    )
  );
alter table public.courses
  drop constraint if exists courses_published_document_v5;
alter table public.courses
  add constraint courses_published_document_v5 check (
    status <> 'published'
    or deleted_at is not null
    or document_storage_enabled
  );
do $validate_current_course_artifacts$
begin
  if exists (
    select 1
    from public.courses course
    where course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and (
        course.current_revision_hash is null
        or course.revision_artifact_hash is null
        or course.current_revision_hash <> course.revision_artifact_hash
        or not exists (
          select 1
          from private.artifact_refs artifact
          where artifact.hash = course.revision_artifact_hash
        )
      )
  ) then
    raise exception 'Curso publicado aponta para artefato corrente inválido.'
      using errcode = '23514';
  end if;
end;
$validate_current_course_artifacts$;
delete from private.course_revisions revision
where not exists (
  select 1
  from public.courses course
  where course.id = revision.course_id
    and course.current_revision_hash = revision.revision_hash
    and course.revision_artifact_hash = revision.artifact_hash
    and course.document_storage_enabled
    and course.deleted_at is null
);
insert into private.course_revisions(
  course_id, revision_hash, artifact_hash, base_revision_hash,
  validation_status, validated_at, published_at, created_by
)
select
  course.id,
  course.current_revision_hash,
  course.revision_artifact_hash,
  null,
  'validated',
  now(),
  now(),
  null
from public.courses course
where course.status = 'published'
  and course.deleted_at is null
  and course.document_storage_enabled
  and not exists (
    select 1
    from private.course_revisions revision
    where revision.course_id = course.id
  );
update private.course_revisions revision
set base_revision_hash = null
where revision.base_revision_hash is not null;
create unique index course_revisions_single_current_v5_uidx
  on private.course_revisions(course_id);
alter table private.course_revisions
  drop constraint if exists course_revisions_no_history_v5;
alter table private.course_revisions
  add constraint course_revisions_no_history_v5 check (
    base_revision_hash is null
  );

create function private.prune_authoring_workspace_state_v5(
  p_owner_id uuid default null,
  p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  -- A chave corrente precisa expirar antes do replay, mesmo quando há uma
  -- fila antiga maior que o lote de manutenção oportunista.
  if p_owner_id is not null and p_request_id is not null then
    delete from private.authoring_workspace_requests request
    where request.owner_id = p_owner_id
      and request.request_id = p_request_id
      and request.expires_at <= statement_timestamp();
  end if;

  with expired_requests as materialized (
    select request.ctid
    from private.authoring_workspace_requests request
    where request.expires_at <= statement_timestamp()
    order by request.expires_at, request.owner_id, request.request_id
    limit 256
    for update skip locked
  )
  delete from private.authoring_workspace_requests request
  using expired_requests expired
  where request.ctid = expired.ctid;

  with expired_workspaces as materialized (
    select workspace.ctid
    from private.authoring_workspaces workspace
    where workspace.deleted_at
        <= statement_timestamp() - interval '14 days'
      and not exists (
        select 1
        from private.authoring_workspace_requests request
        where request.workspace_id = workspace.id
      )
    order by workspace.deleted_at, workspace.id
    limit 256
    for update skip locked
  )
  delete from private.authoring_workspaces workspace
  using expired_workspaces expired
  where workspace.ctid = expired.ctid;
end;
$function$;

create function private.require_workspace_actor_v5(
  p_owner_id uuid,
  p_scope text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
begin
  perform private.require_service_role();
  if p_owner_id is null or not exists (
    select 1 from auth.users account where account.id = p_owner_id
  ) then
    raise exception 'Responsável pelo workspace inválido.'
      using errcode = '42501';
  end if;
  if p_scope not in (
    'authoring:read',
    'authoring:write',
    'catalog:read',
    'catalog:submit',
    'catalog:review',
    'catalog:publish',
    'catalog:manage'
  ) then
    raise exception 'Escopo de autoria inválido.' using errcode = '42501';
  end if;
end;
$function$;

-- Os leitores abaixo sobreviveram ao corte OAuth porque os nomes e contratos
-- públicos continuam atuais, mas os corpos PL/pgSQL ainda resolviam o helper
-- v4 em tempo de execução. Recompile-os contra a autoridade v5 antes que
-- qualquer chamada a Trilhas ou Coleções alcance um símbolo removido.
do $recompile_current_course_readers$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  foreach v_signature in array array[
    'public.list_personal_library_courses(uuid,integer,integer,uuid,text)'::regprocedure,
    'public.list_authoring_catalog_collections_v4(uuid,integer,integer,uuid,text)'::regprocedure,
    'public.list_authoring_catalog_courses_v4(uuid,uuid,integer,integer,uuid,text)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    if position(
      'private.require_workspace_actor_v4' in v_definition
    ) = 0 then
      raise exception 'Leitor de curso não possui a autoridade esperada: %.',
        v_signature using errcode = '55000';
    end if;
    v_rewritten := replace(
      v_definition,
      'private.require_workspace_actor_v4',
      'private.require_workspace_actor_v5'
    );
    if v_rewritten = v_definition
       or v_rewritten like '%private.require_workspace_actor_v4%' then
      raise exception 'Não foi possível recompilar o leitor de curso: %.',
        v_signature using errcode = '55000';
    end if;
    execute v_rewritten;
  end loop;
end;
$recompile_current_course_readers$;

create function public.search_authoring_catalog_courses_v5(
  p_owner_id uuid,
  p_query text,
  p_limit integer default 20,
  p_after_title text default null,
  p_after_course_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_query text := regexp_replace(
    btrim(coalesce(p_query, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'catalog:read');
  if char_length(v_query) < 2
     or char_length(v_query) > 200
     or p_limit is null
     or p_limit < 1
     or p_limit > 50
     or (p_after_title is null) <> (p_after_course_id is null)
     or (
       p_after_title is not null
       and (
         btrim(p_after_title) = ''
         or char_length(p_after_title) > 300
       )
     ) then
    raise exception 'Busca ou paginação do catálogo inválida.'
      using errcode = '22023';
  end if;

  with candidates as materialized (
    select
      placement.id as placement_id,
      course.id as course_id,
      course.contract_key,
      course.title,
      course.goal,
      course.content_hash,
      course.catalog_revision,
      course.module_count,
      course.lesson_count,
      course.microsequence_count,
      course.card_count,
      course.updated_at,
      collection.id as collection_id,
      collection.contract_key as collection_contract_key,
      collection.title as collection_title
    from public.catalog_collection_courses placement
    join public.catalog_collections collection
      on collection.id = placement.collection_id
     and collection.is_published
     and collection.deleted_at is null
    join public.courses course
      on course.id = placement.course_id
     and course.owner_id is null
     and course.status = 'published'
     and course.deleted_at is null
     and course.document_storage_enabled
     and course.content_hash is not null
    where placement.deleted_at is null
      and not exists (
        select 1
        from regexp_split_to_table(v_query, '[[:space:]]+') token(value)
        where strpos(
          lower(concat_ws(
            ' ',
            course.title,
            course.goal,
            course.contract_key,
            collection.title,
            collection.description
          )),
          lower(token.value)
        ) = 0
      )
      and (
        p_after_title is null
        or (lower(course.title), course.id)
          > (lower(p_after_title), p_after_course_id)
      )
    order by lower(course.title), course.id
    limit p_limit + 1
  ),
  page as (
    select *
    from candidates
    order by lower(title), course_id
    limit p_limit
  )
  select jsonb_build_object(
    'query', v_query,
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId', page.placement_id,
        'courseId', page.course_id,
        'contractKey', page.contract_key,
        'title', page.title,
        'goal', page.goal,
        'contentHash', page.content_hash,
        'revision', page.catalog_revision,
        'moduleCount', page.module_count,
        'lessonCount', page.lesson_count,
        'microsequenceCount', page.microsequence_count,
        'cardCount', page.card_count,
        'updatedAt', page.updated_at,
        'collection', jsonb_build_object(
          'collectionId', page.collection_id,
          'contractKey', page.collection_contract_key,
          'title', page.collection_title
        )
      ) order by lower(page.title), page.course_id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterTitle', page.title,
        'afterCourseId', page.course_id
      )
      from page
      order by lower(page.title) desc, page.course_id desc
      limit 1
    ) else null end
  )
  into v_result;
  return v_result;
end;
$function$;

create function private.can_review_catalog_v5(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select exists (
    select 1
    from private.app_role_assignments assignment
    where assignment.user_id = p_actor_id
      and assignment.role in ('owner', 'catalog_publisher', 'reviewer')
      and assignment.active
      and assignment.revoked_at is null
  );
$function$;

create function private.can_publish_catalog_v5(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select exists (
    select 1
    from private.app_role_assignments assignment
    where assignment.user_id = p_actor_id
      and assignment.role in ('owner', 'catalog_publisher')
      and assignment.active
      and assignment.revoked_at is null
  );
$function$;

create function private.catalog_management_payload_hash_v5(
  p_operation text,
  p_payload jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $function$
  select encode(extensions.digest(
    convert_to(jsonb_build_object(
      'operation', p_operation,
      'payload', p_payload
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');
$function$;

create function private.begin_catalog_management_v5(
  p_actor_id uuid,
  p_request_id text,
  p_operation text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_receipt private.catalog_management_receipts_v5%rowtype;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:manage');
  if not private.can_publish_catalog_v5(p_actor_id) then
    raise exception 'Administração do catálogo não autorizada.'
      using errcode = '42501';
  end if;
  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in (
       'create_collection',
       'update_collection',
       'retire_collection',
       'move_course',
       'remove_course'
     )
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Comando administrativo inválido.'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-management-v5:'
      || p_actor_id::text || ':' || p_request_id,
    0
  ));
  -- A posição é uma propriedade global do catálogo. Serializar os poucos
  -- comandos administrativos evita phantoms entre atores distintos (por
  -- exemplo, duas coleções novas calculando a mesma posição).
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-management-v5:global',
    0
  ));
  delete from private.catalog_management_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired_receipts as materialized (
    select receipt.ctid
    from private.catalog_management_receipts_v5 receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 256
    for update skip locked
  )
  delete from private.catalog_management_receipts_v5 receipt
  using expired_receipts expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.catalog_management_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if not found then return null; end if;
  if v_receipt.operation <> p_operation
     or v_receipt.payload_hash <> p_payload_hash then
    raise exception 'requestId reutilizado com dados diferentes.'
      using errcode = '23505';
  end if;
  return v_receipt.result || jsonb_build_object('idempotent', true);
end;
$function$;

create function private.complete_catalog_management_v5(
  p_actor_id uuid,
  p_request_id text,
  p_operation text,
  p_payload_hash text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if p_result is null
     or jsonb_typeof(p_result) <> 'object'
     or pg_column_size(p_result) > 65536 then
    raise exception 'Recibo administrativo inválido.'
      using errcode = '22023';
  end if;
  insert into private.catalog_management_receipts_v5(
    actor_id, request_id, operation, payload_hash, result
  ) values (
    p_actor_id, p_request_id, p_operation, p_payload_hash,
    p_result || jsonb_build_object('idempotent', false)
  );
  return p_result || jsonb_build_object('idempotent', false);
end;
$function$;

create function private.normalize_catalog_collection_positions_v5()
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  with ordered as materialized (
    select
      collection.id,
      row_number() over (
        order by
          case when collection.contract_key = 'outros' then 1 else 0 end,
          collection.position,
          collection.id
      )::integer - 1 as desired_position
    from public.catalog_collections collection
    where collection.is_published
      and collection.deleted_at is null
  )
  update public.catalog_collections collection
  set position = ordered.desired_position
  from ordered
  where collection.id = ordered.id
    and collection.position is distinct from ordered.desired_position;
$function$;

create function private.normalize_catalog_course_positions_v5(
  p_collection_id uuid
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  with ordered as materialized (
    select
      placement.id,
      row_number() over (
        order by placement.position, placement.id
      )::integer - 1 as desired_position
    from public.catalog_collection_courses placement
    where placement.collection_id = p_collection_id
      and placement.deleted_at is null
  )
  update public.catalog_collection_courses placement
  set position = ordered.desired_position
  from ordered
  where placement.id = ordered.id
    and placement.position is distinct from ordered.desired_position;
$function$;

create function private.validate_authoring_workspace_v5(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
begin
  if (
    select count(*)
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'project'
      and entity.entity_id = 'project'
  ) <> 1 then
    raise exception 'A composição exige uma única raiz project.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.parent_id is not null
      and not exists (
        select 1
        from private.authoring_workspace_entities parent
        where parent.workspace_id = entity.workspace_id
          and parent.entity_type = entity.parent_type
          and parent.entity_id = entity.parent_id
      )
  ) then
    raise exception 'A composição contém uma parte sem pai.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from (
      select
        entity.position,
        row_number() over (
          partition by entity.parent_type, entity.parent_id, entity.entity_type
          order by entity.position, entity.entity_id
        ) - 1 as expected_position
      from private.authoring_workspace_entities entity
      where entity.workspace_id = p_workspace_id
        and entity.entity_type not in ('project', 'card')
    ) ordered
    where ordered.position <> ordered.expected_position
  ) then
    raise exception 'As posições das partes irmãs devem ser contíguas.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'card'
    group by entity.parent_type, entity.parent_id, entity.position
    having count(*) > 1
  ) then
    raise exception 'Cards irmãos não podem ocupar a mesma posição.'
      using errcode = '23514';
  end if;

  if (
    select count(*)
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
  ) > 10000 then
    raise exception 'O workspace excede o limite de partes.'
      using errcode = '22023';
  end if;

  if (
    select coalesce(sum(pg_column_size(entity.content)), 0)
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
  ) > 33554432 then
    raise exception 'O workspace excede o limite de autoria composto.'
      using errcode = '22023';
  end if;
end;
$function$;

create function private.workspace_result_v5(
  p_workspace private.authoring_workspaces,
  p_idempotent boolean default false,
  p_change jsonb default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'workspaceId', p_workspace.id,
    'title', p_workspace.title,
    'revision', p_workspace.revision,
    'currentRevision', p_workspace.revision,
    'sourceCourseId', p_workspace.source_course_id,
    'sourceRevisionHash', p_workspace.source_revision_hash,
    'sourceSubmissionId', p_workspace.source_submission_id,
    'entityCount', (
      select count(*)
      from private.authoring_workspace_entities entity
      where entity.workspace_id = p_workspace.id
    ),
    'createdAt', p_workspace.created_at,
    'updatedAt', p_workspace.updated_at,
    'idempotent', p_idempotent,
    'change', p_change
  ));
$function$;

create or replace function public.get_course_document_artifact_v4(
  p_owner_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(
    p_owner_id,
    'authoring:read'
  );
  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.deleted_at is null
    and course.document_storage_enabled
    and course.current_revision_hash is not null
    and course.revision_artifact_hash is not null
    and (
      course.owner_id = p_owner_id
      or (
        course.status = 'published'
        and exists (
          select 1
          from public.user_course_selections selection
          where selection.user_id = p_owner_id
            and selection.course_id = course.id
        )
      )
      or (
        course.owner_id is null
        and (
          private.can_review_catalog_v5(p_owner_id)
          or private.can_publish_catalog_v5(p_owner_id)
        )
      )
    );
  if not found then
    raise exception 'Curso inacessível ou sem documento.'
      using errcode = 'P0002';
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
  if v_result is null then
    raise exception 'Documento corrente do curso indisponível.'
      using errcode = 'P0002';
  end if;
  return v_result;
end;
$function$;

-- O descritor é reservado antes do upload. Se a gravação ou o CAS da
-- publicação falhar, a referência órfã continua visível ao coletor; um
-- objeto sem linha de controle nunca fica esquecido no Storage.
create function public.register_authoring_artifact_v5(
  p_artifact jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_hash text;
  v_artifact private.artifact_refs%rowtype;
begin
  perform private.require_service_role();
  if p_artifact is null
     or jsonb_typeof(p_artifact) <> 'object'
     or not (
       p_artifact ?& array[
         'hash', 'bucket', 'objectKey', 'artifactType',
         'mediaType', 'sizeBytes'
       ]
     )
     or p_artifact->>'bucket' not in (
       'aralearn-authoring-artifacts',
       'aralearn-course-revisions'
     )
     or p_artifact->>'artifactType' <> 'aralearn.course-revision'
     or p_artifact->>'mediaType' <> 'application/json'
     or jsonb_typeof(p_artifact->'sizeBytes') <> 'number'
     or p_artifact->>'sizeBytes' !~ '^[1-9][0-9]*$'
     or (p_artifact->>'sizeBytes')::numeric > 33554432 then
    raise exception 'Pré-registro de artefato inválido.'
      using errcode = '22023';
  end if;
  v_hash := private.register_artifact_v4(p_artifact);
  -- O mesmo conteúdo pode ter sido materializado por um workspace legado no
  -- bucket alternativo. O hash, caminho e tamanho já foram conferidos pelo
  -- registrador privado; no corte v5 só publicações conservam artefatos, então
  -- a reutilização promove a classificação sem duplicar o objeto.
  update private.artifact_refs artifact
  set artifact_type = 'aralearn.course-revision',
      media_type = 'application/json',
      created_at = now()
  where artifact.hash = v_hash
  returning * into v_artifact;
  if not found then
    raise exception 'O pré-registro do artefato não foi confirmado.'
      using errcode = '23514';
  end if;
  return jsonb_build_object(
    'hash', v_artifact.hash,
    'bucket', v_artifact.bucket,
    'objectKey', v_artifact.object_key,
    'artifactType', v_artifact.artifact_type,
    'mediaType', v_artifact.media_type,
    'sizeBytes', v_artifact.size_bytes,
    'registered', true
  );
end;
$function$;

create function public.replay_authoring_workspace_request_v5(
  p_owner_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_operation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:write');
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id
    and request.request_id = p_request_id;
  if not found then return null; end if;
  if v_request.payload_hash <> p_payload_hash
     or v_request.operation <> p_operation then
    raise exception 'requestId reutilizado com dados diferentes.'
      using errcode = '23505';
  end if;
  return v_request.result || jsonb_build_object('idempotent', true);
end;
$function$;

create function public.create_authoring_workspace_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_title text,
  p_source_course_id uuid,
  p_source_revision_hash text,
  p_source_submission_id uuid,
  p_brief text,
  p_rows jsonb default '[]'::jsonb
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
  v_source_target text;
  v_workspace_course_id text;
  v_course_count integer;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:write');
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_title), '') is null
     or char_length(p_title) > 300
     or p_brief is null
     or char_length(p_brief) > 16000
     or p_rows is null
     or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) > 10000
     or pg_column_size(p_rows) > 33554432
     or (
       (p_source_course_id is null) <>
         (p_source_revision_hash is null)
     )
     or (
       p_source_submission_id is not null
       and p_source_course_id is null
     ) then
    raise exception 'Criação de workspace inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> 'create'
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  if p_source_submission_id is not null then
    perform 1
    from private.catalog_review_submissions submission
    where submission.id = p_source_submission_id
      and submission.source_course_id = p_source_course_id
      and submission.source_revision_hash = p_source_revision_hash
      and submission.artifact_hash is not null
      and (
        submission.author_id = p_owner_id
        or (
          submission.status = 'in_review'
          and submission.reviewer_id = p_owner_id
          and submission.claim_expires_at > now()
        )
      )
    for share;
    if not found then
      raise exception 'Revisão editorial de origem indisponível.'
        using errcode = '42501';
    end if;
  elsif p_source_course_id is not null then
    perform 1
    from public.courses course
    where course.id = p_source_course_id
      and course.deleted_at is null
      and course.document_storage_enabled
      and course.current_revision_hash = p_source_revision_hash
      and (
        course.owner_id = p_owner_id
        or (
          course.status = 'published'
          and exists (
            select 1
            from public.user_course_selections selection
            where selection.user_id = p_owner_id
              and selection.course_id = course.id
          )
        )
        or (
          course.owner_id is null
          and (
            private.can_review_catalog_v5(p_owner_id)
            or private.can_publish_catalog_v5(p_owner_id)
          )
        )
      )
    for share;
    if not found then
      raise exception 'Curso de origem indisponível.'
        using errcode = 'P0002';
    end if;
    select case when course.owner_id is null then 'catalog' else 'private' end
    into v_source_target
    from public.courses course
    where course.id = p_source_course_id;
  end if;

  insert into private.authoring_workspaces(
    id, owner_id, title, source_course_id, source_revision_hash,
    source_submission_id, brief
  ) values (
    p_workspace_id, p_owner_id, btrim(p_title), p_source_course_id,
    p_source_revision_hash, p_source_submission_id, btrim(p_brief)
  )
  returning * into v_workspace;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object'
       or exists (
         select 1
         from jsonb_object_keys(v_row) field_name
         where field_name not in (
           'entityType', 'entityId', 'parentType',
           'parentId', 'position', 'content'
         )
       ) then
      raise exception 'Parte inicial do workspace inválida.'
        using errcode = '22023';
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

  -- Abrir uma publicação para continuar editando é diferente de importar uma
  -- cópia como material de reaproveitamento. Somente a origem do create semeia
  -- continuidade; import_course permanece deliberadamente sem vínculo.
  if v_source_target is not null then
    select min(entity.entity_id), count(*)
    into v_workspace_course_id, v_course_count
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'course';
    if v_course_count <> 1 then
      raise exception 'O curso de origem não possui uma raiz inequívoca.'
        using errcode = '23514';
    end if;
    insert into private.authoring_workspace_publications(
      workspace_id, workspace_course_id, target, course_id, content_hash
    ) values (
      p_workspace_id, v_workspace_course_id, v_source_target,
      p_source_course_id, p_source_revision_hash
    );
  end if;

  v_result := private.workspace_result_v5(
    v_workspace,
    false,
    jsonb_build_object(
      'operation', 'create',
      'created', jsonb_array_length(p_rows),
      'updated', 0,
      'deleted', 0
    )
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_owner_id, p_request_id, 'create', p_payload_hash,
    p_workspace_id, v_result
  );
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values (
    p_workspace_id, 1, 'create', v_result->'change', p_owner_id
  );
  return v_result;
end;
$function$;

create function public.commit_authoring_workspace_changes_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_changes jsonb,
  p_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_change jsonb;
  v_current_version bigint;
  v_created integer := 0;
  v_updated integer := 0;
  v_deleted integer := 0;
  v_next_revision bigint;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:write');
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_operation is null
     or p_operation not in (
       'create_structure',
       'update_metadata',
       'save_microsequence_cards',
       'save_card',
       'copy_entity',
       'rename_entity',
       'move_entity',
       'delete_entity',
       'merge_microsequences',
       'split_microsequence',
       'promote_module',
       'demote_course',
       'import_course'
     )
     or p_changes is null
     or jsonb_typeof(p_changes) <> 'object'
     or jsonb_typeof(p_changes->'upserts') <> 'array'
     or jsonb_typeof(p_changes->'deletes') <> 'array'
     or (
       jsonb_array_length(p_changes->'upserts')
       + jsonb_array_length(p_changes->'deletes')
     ) = 0
     or p_summary is null
     or jsonb_typeof(p_summary) <> 'object'
     or jsonb_array_length(p_changes->'upserts') > 10000
     or jsonb_array_length(p_changes->'deletes') > 10000
     or pg_column_size(p_changes) > 16777216
     or pg_column_size(p_summary) > 32768 then
    raise exception 'Mutação composta inválida.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_changes) field_name
    where field_name not in ('upserts', 'deletes')
  )
     or not (p_summary ?& array['created', 'updated', 'deleted'])
     or exists (
       select 1
       from unnest(array['created', 'updated', 'deleted']) field_name
       where jsonb_typeof(p_summary->field_name) <> 'number'
         or p_summary->>field_name !~ '^[0-9]+$'
     ) then
    raise exception 'Contrato da mutação composta inválido.'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> p_operation
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null
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

  if exists (
    select 1
    from jsonb_array_elements(p_changes->'deletes') item
    group by item->>'entityType', item->>'entityId'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_changes->'upserts') item
    group by item->>'entityType', item->>'entityId'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_changes->'deletes') deleted
    join jsonb_array_elements(p_changes->'upserts') upserted
      on upserted->>'entityType' = deleted->>'entityType'
     and upserted->>'entityId' = deleted->>'entityId'
  ) then
    raise exception 'Uma parte não pode aparecer mais de uma vez na mutação.'
      using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes->'deletes')
  loop
    if jsonb_typeof(v_change) <> 'object'
       or not (v_change ?& array['entityType', 'entityId', 'version'])
       or exists (
         select 1
         from jsonb_object_keys(v_change) field_name
         where field_name not in ('entityType', 'entityId', 'version')
       )
       or v_change->>'entityType' not in (
         'project', 'course', 'module', 'lesson',
         'topic', 'microsequence', 'card'
       )
       or nullif(btrim(v_change->>'entityId'), '') is null
       or v_change->>'entityId' <> btrim(v_change->>'entityId')
       or char_length(v_change->>'entityId') > 240
       or jsonb_typeof(v_change->'version') <> 'number'
       or v_change->>'version' !~ '^[1-9][0-9]*$' then
      raise exception 'Exclusão de parte inválida.' using errcode = '22023';
    end if;

    select entity.version into v_current_version
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = v_change->>'entityType'
      and entity.entity_id = v_change->>'entityId';
    if not found
       or (v_change->>'version')::numeric <> v_current_version then
      raise exception 'A versão da parte excluída está desatualizada.'
        using errcode = '40001';
    end if;
    v_deleted := v_deleted + 1;
  end loop;

  for v_change in select value from jsonb_array_elements(p_changes->'upserts')
  loop
    if jsonb_typeof(v_change) <> 'object'
       or not (
         v_change ?& array[
           'entityType', 'entityId', 'parentType',
           'parentId', 'position', 'content'
         ]
       )
       or exists (
         select 1
         from jsonb_object_keys(v_change) field_name
         where field_name not in (
           'entityType', 'entityId', 'parentType',
           'parentId', 'position', 'content', 'version'
         )
       )
       or v_change->>'entityType' not in (
         'project', 'course', 'module', 'lesson',
         'topic', 'microsequence', 'card'
       )
       or nullif(btrim(v_change->>'entityId'), '') is null
       or v_change->>'entityId' <> btrim(v_change->>'entityId')
       or char_length(v_change->>'entityId') > 240
       or jsonb_typeof(v_change->'position') <> 'number'
       or v_change->>'position' !~ '^-?[0-9]+$'
       or jsonb_typeof(v_change->'content') <> 'object'
       or (
         v_change ? 'version'
         and (
           jsonb_typeof(v_change->'version') <> 'number'
           or v_change->>'version' !~ '^[1-9][0-9]*$'
         )
       ) then
      raise exception 'Parte alterada inválida.' using errcode = '22023';
    end if;

    select entity.version into v_current_version
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = v_change->>'entityType'
      and entity.entity_id = v_change->>'entityId';
    if found then
      if not (v_change ? 'version')
         or (v_change->>'version')::numeric <> v_current_version then
        raise exception 'A versão da parte alterada está desatualizada.'
          using errcode = '40001';
      end if;
      v_updated := v_updated + 1;
    else
      if v_change ? 'version' then
        raise exception 'Uma parte nova não recebe versão preexistente.'
          using errcode = '40001';
      end if;
      v_created := v_created + 1;
    end if;
  end loop;

  if (p_summary->>'created')::numeric <> v_created
     or (p_summary->>'updated')::numeric <> v_updated
     or (p_summary->>'deleted')::numeric <> v_deleted then
    raise exception 'O resumo não corresponde às partes da mutação.'
      using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes->'deletes')
  loop
    delete from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = v_change->>'entityType'
      and entity.entity_id = v_change->>'entityId';
  end loop;

  for v_change in select value from jsonb_array_elements(p_changes->'upserts')
  loop
    insert into private.authoring_workspace_entities(
      workspace_id, entity_type, entity_id, parent_type, parent_id,
      position, content, version
    ) values (
      p_workspace_id,
      v_change->>'entityType',
      v_change->>'entityId',
      nullif(v_change->>'parentType', ''),
      nullif(v_change->>'parentId', ''),
      (v_change->>'position')::integer,
      v_change->'content',
      1
    )
    on conflict(workspace_id, entity_type, entity_id) do update set
      parent_type = excluded.parent_type,
      parent_id = excluded.parent_id,
      position = excluded.position,
      content = excluded.content,
      version = private.authoring_workspace_entities.version + 1,
      updated_at = now();
  end loop;

  perform private.validate_authoring_workspace_v5(p_workspace_id);

  v_next_revision := v_workspace.revision + 1;
  update private.authoring_workspaces workspace
  set revision = v_next_revision, updated_at = now()
  where workspace.id = p_workspace_id
  returning * into v_workspace;

  v_result := private.workspace_result_v5(
    v_workspace,
    false,
    p_summary || jsonb_build_object('operation', p_operation)
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_owner_id, p_request_id, p_operation, p_payload_hash,
    p_workspace_id, v_result
  );
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values (
    p_workspace_id, v_next_revision, p_operation,
    v_result->'change', p_owner_id
  );
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id
    and event.id not in (
      select recent.id
      from private.authoring_workspace_events recent
      where recent.workspace_id = p_workspace_id
      order by recent.revision desc
      limit 200
    );
  return v_result;
end;
$function$;

create function public.update_authoring_workspace_brief_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_brief text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_brief text := btrim(p_brief);
  v_next_revision bigint;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:write');
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or nullif(v_brief, '') is null
     or char_length(v_brief) > 16000 then
    raise exception 'Atualização do contexto de autoria inválida.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id
    and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> 'update_brief'
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null
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

  if v_workspace.brief is distinct from v_brief then
    v_next_revision := v_workspace.revision + 1;
    update private.authoring_workspaces workspace
    set brief = v_brief,
        revision = v_next_revision,
        updated_at = now()
    where workspace.id = p_workspace_id
    returning * into v_workspace;
    v_result := private.workspace_result_v5(
      v_workspace,
      false,
      jsonb_build_object(
        'operation', 'update_brief',
        'created', 0,
        'updated', 0,
        'deleted', 0
      )
    );
    insert into private.authoring_workspace_events(
      workspace_id, revision, operation, summary, actor_id
    ) values (
      p_workspace_id, v_next_revision, 'update_brief',
      v_result->'change', p_owner_id
    );
  else
    v_result := private.workspace_result_v5(
      v_workspace,
      false,
      jsonb_build_object(
        'operation', 'update_brief',
        'created', 0,
        'updated', 0,
        'deleted', 0
      )
    );
  end if;

  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_owner_id, p_request_id, 'update_brief', p_payload_hash,
    p_workspace_id, v_result
  );
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id
    and event.id not in (
      select recent.id
      from private.authoring_workspace_events recent
      where recent.workspace_id = p_workspace_id
      order by recent.revision desc
      limit 200
    );
  return v_result;
end;
$function$;

create function public.get_authoring_workspace_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_course_ids text[] default null,
  p_include_card_content boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_workspace private.authoring_workspaces%rowtype;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:read');
  if p_include_card_content is null
     or (
       p_course_ids is not null
       and (
         cardinality(p_course_ids) not between 1 and 50
         or exists (
           select 1
           from unnest(p_course_ids) requested(course_id)
           where nullif(btrim(requested.course_id), '') is null
             or requested.course_id <> btrim(requested.course_id)
             or char_length(requested.course_id) > 240
         )
         or (
           select count(*) <> count(distinct requested.course_id)
           from unnest(p_course_ids) requested(course_id)
         )
       )
     ) then
    raise exception 'Recorte de workspace inválido.' using errcode = '22023';
  end if;
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  return private.workspace_result_v5(v_workspace) || jsonb_build_object(
    'brief', v_workspace.brief,
    'entities', coalesce((
      with recursive selected_entities as (
        select entity.*
        from private.authoring_workspace_entities entity
        where entity.workspace_id = v_workspace.id
          and entity.entity_type = 'project'
        union all
        select child.*
        from selected_entities parent
        join private.authoring_workspace_entities child
          on child.workspace_id = parent.workspace_id
         and child.parent_type = parent.entity_type
         and child.parent_id = parent.entity_id
        where p_course_ids is null
           or child.entity_type = 'course'
           or parent.entity_type <> 'course'
           or parent.entity_id = any(p_course_ids)
      )
      select jsonb_agg(jsonb_build_object(
        'entityType', entity.entity_type,
        'entityId', entity.entity_id,
        'parentType', entity.parent_type,
        'parentId', entity.parent_id,
        'position', entity.position,
        'content', case
          when not p_include_card_content
            and entity.entity_type = 'card'
            then '{}'::jsonb
          else entity.content
        end,
        'version', entity.version
      ) order by
        case entity.entity_type
          when 'project' then 0
          when 'course' then 1
          when 'module' then 2
          when 'lesson' then 3
          when 'topic' then 4
          when 'microsequence' then 5
          else 6
        end,
        entity.parent_id nulls first,
        entity.position,
        entity.entity_id
      )
      from selected_entities entity
    ), '[]'::jsonb),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'workspaceCourseId', publication.workspace_course_id,
        'target', publication.target,
        'courseId', publication.course_id,
        'contentHash', publication.content_hash,
        'completionState', course.completion_state,
        'updatedAt', publication.updated_at
      ) order by publication.workspace_course_id, publication.target)
      from private.authoring_workspace_publications publication
      join public.courses course on course.id = publication.course_id
      where publication.workspace_id = v_workspace.id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.list_authoring_workspaces_v5(
  p_owner_id uuid,
  p_limit integer default 50,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_last_updated_at timestamptz;
  v_last_id uuid;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:read');
  if p_limit is null
     or p_limit not between 1 and 100
     or ((p_before_updated_at is null) <> (p_before_id is null)) then
    raise exception 'Paginação de workspaces inválida.' using errcode = '22023';
  end if;
  with candidates as materialized (
    select workspace.*
    from private.authoring_workspaces workspace
    where workspace.owner_id = p_owner_id
      and workspace.deleted_at is null
      and (
        p_before_updated_at is null
        or (workspace.updated_at, workspace.id) <
          (p_before_updated_at, p_before_id)
      )
    order by workspace.updated_at desc, workspace.id desc
    limit p_limit + 1
  ),
  page as (
    select * from candidates
    order by updated_at desc, id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'workspaceId', page.id,
      'title', page.title,
      'revision', page.revision,
      'sourceCourseId', page.source_course_id,
      'sourceRevisionHash', page.source_revision_hash,
      'sourceSubmissionId', page.source_submission_id,
      'publicationCount', (
        select count(*)
        from private.authoring_workspace_publications publication
        where publication.workspace_id = page.id
      ),
      'createdAt', page.created_at,
      'updatedAt', page.updated_at
    ) order by page.updated_at desc, page.id desc), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    (
      select page.updated_at
      from page
      order by page.updated_at, page.id
      limit 1
    ),
    (
      select page.id
      from page
      order by page.updated_at, page.id
      limit 1
    )
  into v_items, v_has_more, v_last_updated_at, v_last_id
  from page;
  return jsonb_build_object(
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'beforeUpdatedAt', v_last_updated_at,
      'beforeId', v_last_id
    ) else null end
  );
end;
$function$;

create function public.list_authoring_workspace_events_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_revision bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:read');
  if p_limit is null
     or p_limit not between 1 and 100
     or (p_before_revision is not null and p_before_revision < 1) then
    raise exception 'Paginação de alterações inválida.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from private.authoring_workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_id = p_owner_id
      and workspace.deleted_at is null
  ) then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', event.revision,
        'operation', event.operation,
        'summary', event.summary,
        'createdAt', event.created_at
      ) order by event.revision desc)
      from (
        select *
        from private.authoring_workspace_events event
        where event.workspace_id = p_workspace_id
          and (
            p_before_revision is null
            or event.revision < p_before_revision
          )
        order by event.revision desc
        limit p_limit
      ) event
    ), '[]'::jsonb)
  );
end;
$function$;

-- Leitura paginada dos cards correntes sem recompor o documento do workspace.
-- O retorno deliberadamente não inclui o conteúdo integral de nenhum card.
create function public.list_authoring_workspace_microsequence_cards_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_microsequence_path text[],
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_revision bigint;
  v_items jsonb;
  v_has_more boolean;
  v_last_position integer;
  v_last_id text;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:read');
  if p_workspace_id is null
     or p_microsequence_path is null
     or cardinality(p_microsequence_path) <> 4
     or exists (
       select 1
       from unnest(p_microsequence_path) as path_part(value)
       where path_part.value is null
          or btrim(path_part.value) = ''
          or path_part.value <> btrim(path_part.value)
          or char_length(path_part.value) > 240
     )
     or p_limit is null
     or p_limit not between 1 and 100
     or ((p_after_position is null) <> (p_after_id is null))
     or (p_after_position is not null and p_after_position < 1)
     or (
       p_after_id is not null
       and (
         btrim(p_after_id) = ''
         or p_after_id <> btrim(p_after_id)
         or char_length(p_after_id) > 240
       )
     ) then
    raise exception 'Paginação ou caminho de cards inválido.'
      using errcode = '22023';
  end if;

  select workspace.revision
  into v_revision
  from private.authoring_workspaces workspace
  join private.authoring_workspace_entities course
    on course.workspace_id = workspace.id
   and course.entity_type = 'course'
   and course.entity_id = p_microsequence_path[1]
   and course.parent_type = 'project'
   and course.parent_id = 'project'
  join private.authoring_workspace_entities module_value
    on module_value.workspace_id = workspace.id
   and module_value.entity_type = 'module'
   and module_value.entity_id = p_microsequence_path[2]
   and module_value.parent_type = 'course'
   and module_value.parent_id = course.entity_id
  join private.authoring_workspace_entities lesson
    on lesson.workspace_id = workspace.id
   and lesson.entity_type = 'lesson'
   and lesson.entity_id = p_microsequence_path[3]
   and lesson.parent_type = 'module'
   and lesson.parent_id = module_value.entity_id
  join private.authoring_workspace_entities microsequence
    on microsequence.workspace_id = workspace.id
   and microsequence.entity_type = 'microsequence'
   and microsequence.entity_id = p_microsequence_path[4]
   and microsequence.parent_type = 'lesson'
   and microsequence.parent_id = lesson.entity_id
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null;

  if not found then
    raise exception 'Microssequência inexistente no workspace.'
      using errcode = 'P0002';
  end if;

  with candidates as materialized (
    select
      card.entity_id,
      card.position,
      card.content,
      left(regexp_replace(
        coalesce(
          nullif(btrim(card.content ->> 'title'), ''),
          'Card ' || card.entity_id
        ),
        '[[:space:]]+',
        ' ',
        'g'
      ), 240) as summary
    from private.authoring_workspace_entities card
    where card.workspace_id = p_workspace_id
      and card.entity_type = 'card'
      and card.parent_type = 'microsequence'
      and card.parent_id = p_microsequence_path[4]
      and (
        p_after_position is null
        or (card.position, card.entity_id) >
          (p_after_position, p_after_id)
      )
    order by card.position, card.entity_id
    limit p_limit + 1
  ),
  page as (
    select *
    from candidates
    order by position, entity_id
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', page.entity_id,
      'position', page.position,
      'kind', page.content ->> 'kind',
      'resources', jsonb_build_array(page.content ->> 'resource'),
      'summary', page.summary
    ) order by page.position, page.entity_id), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    (
      select page.position
      from page
      order by page.position desc, page.entity_id desc
      limit 1
    ),
    (
      select page.entity_id
      from page
      order by page.position desc, page.entity_id desc
      limit 1
    )
  into v_items, v_has_more, v_last_position, v_last_id
  from page;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', v_revision,
    'microsequencePath', to_jsonb(p_microsequence_path),
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterId', v_last_id
    ) else null end
  );
end;
$function$;

create function public.delete_authoring_workspace_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:write');
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Exclusão de workspace inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> 'delete_workspace'
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;
  update private.authoring_workspaces workspace
  set brief = '', deleted_at = now(), updated_at = now()
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  update private.catalog_review_submissions submission
  set review_workspace_id = null, updated_at = now()
  where submission.review_workspace_id = p_workspace_id;
  delete from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'deleted', true,
    'idempotent', false
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_owner_id, p_request_id, 'delete_workspace', p_payload_hash,
    p_workspace_id, v_result
  );
  return v_result;
end;
$function$;

-- Uma submissão editorial concede acesso somente à revisão privada escolhida.
create table private.catalog_review_submissions (
  id uuid primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  source_course_id uuid not null references public.courses(id) on delete restrict,
  source_revision_hash text not null,
  artifact_hash text
    references private.artifact_refs(hash) on delete restrict,
  completion_state text not null,
  title text not null,
  goal text not null,
  author_note text,
  status text not null default 'submitted',
  reviewer_id uuid references auth.users(id) on delete set null,
  review_workspace_id uuid
    references private.authoring_workspaces(id) on delete set null,
  claim_expires_at timestamptz,
  reviewer_note text,
  official_course_id uuid references public.courses(id) on delete set null,
  collection_id uuid references public.catalog_collections(id) on delete set null,
  submitted_at timestamptz not null default now(),
  review_started_at timestamptz,
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint catalog_review_submissions_hash_v5 check (
    source_revision_hash ~ '^[0-9a-f]{64}$'
    and (
      artifact_hash is null
      or (
        artifact_hash ~ '^[0-9a-f]{64}$'
        and artifact_hash = source_revision_hash
      )
    )
  ),
  constraint catalog_review_submissions_completion_v5 check (
    completion_state in ('partial', 'complete')
  ),
  constraint catalog_review_submissions_status_v5 check (
    status in (
      'submitted', 'in_review', 'changes_requested',
      'rejected', 'accepted', 'withdrawn', 'superseded'
    )
  ),
  constraint catalog_review_submissions_text_v5 check (
    btrim(title) <> ''
    and char_length(title) <= 300
    and btrim(goal) <> ''
    and char_length(goal) <= 4000
    and (
      author_note is null
      or (btrim(author_note) <> '' and char_length(author_note) <= 4000)
    )
    and (
      reviewer_note is null
      or (btrim(reviewer_note) <> '' and char_length(reviewer_note) <= 4000)
    )
  ),
  constraint catalog_review_submissions_state_v5 check (
    (
      status = 'submitted'
      and reviewer_id is null
      and review_started_at is null
      and claim_expires_at is null
      and decided_at is null
      and official_course_id is null
      and collection_id is null
    )
    or (
      status = 'in_review'
      and reviewer_id is not null
      and review_started_at is not null
      and claim_expires_at is not null
      and claim_expires_at > review_started_at
      and decided_at is null
      and official_course_id is null
      and collection_id is null
    )
    or (
      status in ('changes_requested', 'rejected')
      and reviewer_id is not null
      and review_started_at is not null
      and claim_expires_at is null
      and reviewer_note is not null
      and decided_at is not null
      and official_course_id is null
      and collection_id is null
    )
    or (
      status = 'accepted'
      and reviewer_id is not null
      and review_started_at is not null
      and claim_expires_at is null
      and reviewer_note is not null
      and decided_at is not null
      and official_course_id is not null
      and collection_id is not null
    )
    or (
      status = 'withdrawn'
      and claim_expires_at is null
      and decided_at is not null
      and official_course_id is null
      and collection_id is null
    )
    or (
      status = 'superseded'
      and reviewer_id is null
      and review_started_at is null
      and claim_expires_at is null
      and reviewer_note is not null
      and decided_at is not null
      and official_course_id is null
      and collection_id is null
    )
  ),
  constraint catalog_review_submissions_artifact_lifecycle_v5 check (
    (
      status in ('submitted', 'in_review')
      and artifact_hash is not null
    )
    or (
      status in (
        'changes_requested', 'rejected', 'accepted', 'withdrawn', 'superseded'
      )
      and artifact_hash is null
    )
  )
);

alter table private.authoring_workspaces
  add constraint authoring_workspaces_source_submission_v5
  foreign key(source_submission_id)
  references private.catalog_review_submissions(id)
  on delete set null;

create index catalog_review_submissions_queue_v5_idx
  on private.catalog_review_submissions(status, submitted_at, id);
create index catalog_review_submissions_author_v5_idx
  on private.catalog_review_submissions(author_id, submitted_at desc, id);
create unique index catalog_review_submissions_active_course_v5_uidx
  on private.catalog_review_submissions(author_id, source_course_id)
  where status in ('submitted', 'in_review');

create function private.close_catalog_review_workspace_v5(
  p_workspace_id uuid,
  p_preserve_control boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if p_workspace_id is null then return; end if;
  delete from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_requests request
  where request.workspace_id = p_workspace_id;
  if p_preserve_control then
    update private.authoring_workspaces workspace
    set brief = '',
        deleted_at = coalesce(workspace.deleted_at, now()),
        updated_at = now()
    where workspace.id = p_workspace_id;
  else
    delete from private.authoring_workspaces workspace
    where workspace.id = p_workspace_id;
  end if;
end;
$function$;

create function public.submit_private_course_for_catalog_review_v5(
  p_actor_id uuid,
  p_submission_id uuid,
  p_course_id uuid,
  p_expected_content_hash text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_submission private.catalog_review_submissions%rowtype;
  v_active_submission private.catalog_review_submissions%rowtype;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:submit');
  if p_submission_id is null
     or p_course_id is null
     or p_expected_content_hash is null
     or p_expected_content_hash !~ '^[0-9a-f]{64}$'
     or char_length(p_note) > 4000 then
    raise exception 'Submissão editorial inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-review-source-v5:'
      || p_actor_id::text || ':' || p_course_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-review-submission-v5:' || p_submission_id::text,
    0
  ));
  select * into v_submission
  from private.catalog_review_submissions submission
  where submission.id = p_submission_id;
  if found then
    if v_submission.author_id <> p_actor_id
       or v_submission.source_course_id <> p_course_id
       or v_submission.source_revision_hash <> p_expected_content_hash
       or v_submission.author_note is distinct from
         nullif(btrim(p_note), '') then
      raise exception 'submissionId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'submissionId', v_submission.id,
      'courseId', v_submission.source_course_id,
      'status', v_submission.status,
      'completionState', v_submission.completion_state,
      'idempotent', true
    );
  end if;
  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id = p_actor_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
    and course.current_revision_hash = p_expected_content_hash
    and course.revision_artifact_hash = p_expected_content_hash
    and exists (
      select 1
      from private.course_revisions revision
      where revision.course_id = course.id
        and revision.revision_hash = p_expected_content_hash
        and revision.artifact_hash = p_expected_content_hash
        and revision.validation_status = 'validated'
        and revision.published_at is not null
    )
  for share;
  if not found then
    raise exception 'Curso privado ou revisão não encontrado.'
      using errcode = 'P0002';
  end if;
  select * into v_active_submission
  from private.catalog_review_submissions submission
  where submission.author_id = p_actor_id
    and submission.source_course_id = p_course_id
    and submission.status in ('submitted', 'in_review')
  for update;
  if found then
    if v_active_submission.source_revision_hash = p_expected_content_hash then
      return jsonb_build_object(
        'submissionId', v_active_submission.id,
        'courseId', v_active_submission.source_course_id,
        'title', v_active_submission.title,
        'status', v_active_submission.status,
        'completionState', v_active_submission.completion_state,
        'submittedAt', v_active_submission.submitted_at,
        'idempotent', true
      );
    end if;
    if v_active_submission.status = 'in_review' then
      raise exception 'A revisão anterior já foi assumida pela equipe editorial.'
        using errcode = 'RS409';
    end if;
    update private.catalog_review_submissions submission
    set status = 'superseded',
        artifact_hash = null,
        reviewer_note =
          'Submissão substituída automaticamente por uma revisão mais recente deste curso.',
        decided_at = now(),
        updated_at = now()
    where submission.id = v_active_submission.id;
  end if;
  insert into private.catalog_review_submissions(
    id, author_id, source_course_id, source_revision_hash, artifact_hash,
    completion_state, title, goal, author_note
  ) values (
    p_submission_id, p_actor_id, v_course.id, v_course.current_revision_hash,
    v_course.revision_artifact_hash, v_course.completion_state,
    v_course.title, v_course.goal, nullif(btrim(p_note), '')
  )
  returning * into v_submission;
  return jsonb_build_object(
    'submissionId', v_submission.id,
    'courseId', v_submission.source_course_id,
    'title', v_submission.title,
    'status', v_submission.status,
    'completionState', v_submission.completion_state,
    'submittedAt', v_submission.submitted_at,
    'idempotent', false
  );
end;
$function$;

create function public.list_catalog_reviews_v5(
  p_actor_id uuid,
  p_view text default 'mine',
  p_limit integer default 50,
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_last_submitted_at timestamptz;
  v_last_id uuid;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'authoring:read');
  if p_view is null
     or p_view not in ('mine', 'queue')
     or p_limit is null
     or p_limit not between 1 and 100
     or (
       (p_before_submitted_at is null)
       <> (p_before_id is null)
     ) then
    raise exception 'Consulta editorial inválida.' using errcode = '22023';
  end if;
  if p_view = 'queue' and not private.can_review_catalog_v5(p_actor_id) then
    raise exception 'Revisão editorial não autorizada.' using errcode = '42501';
  end if;
  with candidates as materialized (
    select submission.*
    from private.catalog_review_submissions submission
    where (
      (
        p_view = 'mine'
        and submission.author_id = p_actor_id
      )
      or (
        p_view = 'queue'
        and submission.status in ('submitted', 'in_review')
      )
    )
      and (
        p_before_submitted_at is null
        or (submission.submitted_at, submission.id)
          < (p_before_submitted_at, p_before_id)
      )
    order by submission.submitted_at desc, submission.id desc
    limit p_limit + 1
  ),
  page as materialized (
    select *
    from candidates
    order by submitted_at desc, id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'submissionId', page.id,
      'courseId', page.source_course_id,
      'sourceRevisionHash', page.source_revision_hash,
      'title', page.title,
      'completionState', page.completion_state,
      'status', page.status,
      'authorNote', page.author_note,
      'authorId', case when p_view = 'queue' then page.author_id end,
      'reviewerId', page.reviewer_id,
      'reviewWorkspaceId', page.review_workspace_id,
      'claimExpiresAt', page.claim_expires_at,
      'reviewerNote', page.reviewer_note,
      'officialCourseId', page.official_course_id,
      'submittedAt', page.submitted_at,
      'decidedAt', page.decided_at,
      'updatedAt', page.updated_at
    ) order by page.submitted_at desc, page.id desc), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    (
      select page.submitted_at
      from page
      order by page.submitted_at, page.id
      limit 1
    ),
    (
      select page.id
      from page
      order by page.submitted_at, page.id
      limit 1
    )
  into v_items, v_has_more, v_last_submitted_at, v_last_id
  from page;
  return jsonb_build_object(
    'view', p_view,
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'beforeSubmittedAt', v_last_submitted_at,
      'beforeId', v_last_id
    ) else null end
  );
end;
$function$;

create function public.get_catalog_review_artifact_v5(
  p_actor_id uuid,
  p_submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_submission private.catalog_review_submissions%rowtype;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'authoring:read');
  select * into v_submission
  from private.catalog_review_submissions submission
  where submission.id = p_submission_id
    and (
      submission.author_id = p_actor_id
      or private.can_review_catalog_v5(p_actor_id)
    );
  if not found then
    raise exception 'Revisão editorial inexistente.' using errcode = 'P0002';
  end if;
  if v_submission.artifact_hash is null then
    raise exception 'O conteúdo da submissão já foi liberado após o encerramento editorial.'
      using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'submissionId', v_submission.id,
    'courseId', v_submission.source_course_id,
    'title', v_submission.title,
    'goal', v_submission.goal,
    'completionState', v_submission.completion_state,
    'status', v_submission.status,
    'sourceRevisionHash', v_submission.source_revision_hash,
    'authorNote', v_submission.author_note,
    'reviewerNote', v_submission.reviewer_note,
    'reviewWorkspaceId', v_submission.review_workspace_id,
    'artifact', (
      select jsonb_build_object(
        'hash', artifact.hash,
        'bucket', artifact.bucket,
        'objectKey', artifact.object_key,
        'artifactType', artifact.artifact_type,
        'mediaType', artifact.media_type,
        'sizeBytes', artifact.size_bytes
      )
      from private.artifact_refs artifact
      where artifact.hash = v_submission.artifact_hash
    )
  );
end;
$function$;

create function public.claim_catalog_review_v5(
  p_actor_id uuid,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_submission private.catalog_review_submissions%rowtype;
  v_abandoned_workspace_id uuid;
  v_lease_expires_at timestamptz;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:review');
  if not private.can_review_catalog_v5(p_actor_id) then
    raise exception 'Revisão editorial não autorizada.' using errcode = '42501';
  end if;
  select * into v_submission
  from private.catalog_review_submissions submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Revisão editorial inexistente.' using errcode = 'P0002';
  end if;
  v_lease_expires_at := now() + interval '30 minutes';
  if v_submission.status = 'in_review'
     and v_submission.reviewer_id = p_actor_id then
    update private.catalog_review_submissions submission
    set claim_expires_at = v_lease_expires_at,
        updated_at = now()
    where submission.id = p_submission_id
    returning * into v_submission;
    return jsonb_build_object(
      'submissionId', v_submission.id,
      'status', v_submission.status,
      'reviewerId', v_submission.reviewer_id,
      'reviewWorkspaceId', v_submission.review_workspace_id,
      'leaseExpiresAt', v_submission.claim_expires_at,
      'idempotent', true
    );
  end if;
  if v_submission.status = 'in_review'
     and v_submission.claim_expires_at > now() then
    raise exception 'A revisão já está assumida por outra conta.'
      using errcode = 'RC409';
  end if;
  if v_submission.status not in ('submitted', 'in_review') then
    raise exception 'A revisão não está disponível para assumir.'
      using errcode = 'RC409';
  end if;
  if v_submission.status = 'in_review' then
    for v_abandoned_workspace_id in
      select workspace.id
      from private.authoring_workspaces workspace
      where workspace.source_submission_id = p_submission_id
        and workspace.deleted_at is null
    loop
      perform private.close_catalog_review_workspace_v5(
        v_abandoned_workspace_id,
        false
      );
    end loop;
  end if;
  update private.catalog_review_submissions submission
  set status = 'in_review',
      reviewer_id = p_actor_id,
      review_started_at = now(),
      review_workspace_id = null,
      claim_expires_at = v_lease_expires_at,
      updated_at = now()
  where submission.id = p_submission_id
  returning * into v_submission;
  return jsonb_build_object(
    'submissionId', v_submission.id,
    'status', v_submission.status,
    'reviewerId', p_actor_id,
    'reviewWorkspaceId', v_submission.review_workspace_id,
    'leaseExpiresAt', v_submission.claim_expires_at,
    'idempotent', false
  );
end;
$function$;

create function public.link_catalog_review_workspace_v5(
  p_actor_id uuid,
  p_submission_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_submission private.catalog_review_submissions%rowtype;
  v_previous_workspace_id uuid;
  v_lease_expires_at timestamptz;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:review');
  if not private.can_review_catalog_v5(p_actor_id) then
    raise exception 'Revisão editorial não autorizada.' using errcode = '42501';
  end if;
  select * into v_submission
  from private.catalog_review_submissions submission
  where submission.id = p_submission_id
  for update;
  if not found
     or v_submission.status <> 'in_review'
     or v_submission.reviewer_id <> p_actor_id then
    raise exception 'A revisão não foi assumida por esta conta.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from private.authoring_workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.owner_id = p_actor_id
      and workspace.source_submission_id = p_submission_id
      and workspace.deleted_at is null
  ) then
    raise exception 'Workspace editorial inválido.' using errcode = '23514';
  end if;
  v_previous_workspace_id := v_submission.review_workspace_id;
  if v_previous_workspace_id is not null
     and v_previous_workspace_id <> p_workspace_id then
    perform private.close_catalog_review_workspace_v5(
      v_previous_workspace_id,
      false
    );
  end if;
  v_lease_expires_at := now() + interval '30 minutes';
  update private.catalog_review_submissions submission
  set review_workspace_id = p_workspace_id,
      claim_expires_at = v_lease_expires_at,
      updated_at = now()
  where submission.id = p_submission_id;
  return jsonb_build_object(
    'submissionId', p_submission_id,
    'workspaceId', p_workspace_id,
    'status', 'in_review',
    'leaseExpiresAt', v_lease_expires_at
  );
end;
$function$;

create function public.decide_catalog_review_v5(
  p_actor_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_submission private.catalog_review_submissions%rowtype;
  v_status text;
  v_review_workspace_id uuid;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:review');
  if not private.can_review_catalog_v5(p_actor_id)
     or p_decision not in ('request_changes', 'reject')
     or nullif(btrim(p_note), '') is null
     or char_length(p_note) > 4000 then
    raise exception 'Decisão editorial inválida.' using errcode = '22023';
  end if;
  v_status := case
    when p_decision = 'request_changes' then 'changes_requested'
    else 'rejected'
  end;
  select * into v_submission
  from private.catalog_review_submissions submission
  where submission.id = p_submission_id
  for update;
  if not found then
    raise exception 'Revisão editorial inexistente.' using errcode = 'P0002';
  end if;
  if v_submission.status = v_status
     and v_submission.reviewer_id = p_actor_id
     and v_submission.reviewer_note = btrim(p_note) then
    return jsonb_build_object(
      'submissionId', v_submission.id,
      'status', v_submission.status,
      'idempotent', true
    );
  end if;
  if v_submission.status <> 'in_review'
     or v_submission.reviewer_id <> p_actor_id then
    raise exception 'A revisão precisa estar assumida por esta conta.'
      using errcode = '42501';
  end if;
  v_review_workspace_id := v_submission.review_workspace_id;
  update private.catalog_review_submissions submission
  set status = v_status,
      reviewer_id = p_actor_id,
      reviewer_note = btrim(p_note),
      artifact_hash = null,
      review_workspace_id = null,
      claim_expires_at = null,
      decided_at = now(),
      updated_at = now()
  where submission.id = p_submission_id
  returning * into v_submission;
  perform private.close_catalog_review_workspace_v5(
    v_review_workspace_id,
    false
  );
  return jsonb_build_object(
    'submissionId', v_submission.id,
    'status', v_submission.status,
    'idempotent', false
  );
end;
$function$;

create function public.withdraw_catalog_review_v5(
  p_actor_id uuid,
  p_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_submission private.catalog_review_submissions%rowtype;
  v_review_workspace_id uuid;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:submit');
  select * into v_submission
  from private.catalog_review_submissions submission
  where submission.id = p_submission_id
    and submission.author_id = p_actor_id
  for update;
  if not found then
    raise exception 'Revisão editorial inexistente.' using errcode = 'P0002';
  end if;
  if v_submission.status = 'withdrawn' then
    return jsonb_build_object(
      'submissionId', v_submission.id,
      'status', 'withdrawn',
      'idempotent', true
    );
  end if;
  if v_submission.status not in (
    'submitted', 'in_review', 'changes_requested'
  ) then
    raise exception 'A revisão não pode mais ser retirada.'
      using errcode = '23514';
  end if;
  v_review_workspace_id := v_submission.review_workspace_id;
  update private.catalog_review_submissions submission
  set status = 'withdrawn',
      artifact_hash = null,
      review_workspace_id = null,
      claim_expires_at = null,
      updated_at = now(),
      decided_at = now()
  where submission.id = p_submission_id;
  perform private.close_catalog_review_workspace_v5(
    v_review_workspace_id,
    false
  );
  return jsonb_build_object(
    'submissionId', p_submission_id,
    'status', 'withdrawn',
    'idempotent', false
  );
end;
$function$;

create function public.remove_course_from_personal_library_v5(
  p_actor_id uuid,
  p_selection_id uuid,
  p_course_id uuid,
  p_request_id text,
  p_expected_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_payload_hash text;
  v_receipt private.personal_library_receipts_v5%rowtype;
  v_course public.courses%rowtype;
  v_kind text;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(
    p_actor_id,
    'authoring:write'
  );
  if p_selection_id is null
     or p_course_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_expected_content_hash is null
     or p_expected_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Retirada de Trilhas inválida.'
      using errcode = '22023';
  end if;
  v_payload_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'operation', 'remove_course',
      'selectionId', p_selection_id,
      'courseId', p_course_id,
      'expectedContentHash', p_expected_content_hash
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-personal-library-v5:'
      || p_actor_id::text || ':' || p_request_id,
    0
  ));
  delete from private.personal_library_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired_receipts as materialized (
    select receipt.ctid
    from private.personal_library_receipts_v5 receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 256
    for update skip locked
  )
  delete from private.personal_library_receipts_v5 receipt
  using expired_receipts expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.personal_library_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'remove_course'
       or v_receipt.payload_hash <> v_payload_hash then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = 'PL409';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  -- Publicação privada, submissão editorial e retirada compartilham as mesmas
  -- chaves, evitando que um artefato seja solto enquanto outro fluxo o adota.
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-private-course-publication-v5:' || p_actor_id::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-review-source-v5:'
      || p_actor_id::text || ':' || p_course_id::text || ':'
      || p_expected_content_hash,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'selection:' || p_actor_id::text || ':' || p_course_id::text,
    0
  ));

  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  for update;
  if not found then
    raise exception 'Curso selecionado inexistente.'
      using errcode = 'P0002';
  end if;
  perform 1
  from public.user_course_selections selection
  where selection.id = p_selection_id
    and selection.user_id = p_actor_id
    and selection.course_id = p_course_id
  for update;
  if not found then
    raise exception 'Seleção de curso inexistente.'
      using errcode = 'P0002';
  end if;
  if v_course.owner_id is null then
    v_kind := 'official';
  elsif v_course.owner_id = p_actor_id then
    v_kind := 'personal';
  else
    raise exception 'Seleção de curso inexistente.'
      using errcode = 'P0002';
  end if;
  if v_course.current_revision_hash is distinct from
      p_expected_content_hash then
    raise exception 'Revisão do curso desatualizada.'
      using errcode = '40001';
  end if;

  if v_kind = 'personal' then
    perform 1
    from private.catalog_review_submissions submission
    where submission.author_id = p_actor_id
      and submission.source_course_id = p_course_id
      and submission.status in ('submitted', 'in_review')
    for update;
    if found then
      raise exception 'O curso possui submissão editorial ativa.'
        using errcode = 'AS409';
    end if;
  end if;

  -- Espelha a retirada oficial já usada pelo app: a FK da seleção preserva a
  -- semântica existente para progresso e Trilhas, e o feed recebe um único
  -- tombstone explícito.
  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  delete from public.user_course_selections selection
  where selection.id = p_selection_id;
  perform set_config('aralearn.suppress_sync_changes', 'off', true);
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-sync-feed-commit-order',
    0
  ));
  insert into private.sync_changes(
    audience_user_id, course_id, entity_type, entity_id, operation
  ) values (
    p_actor_id, p_course_id, 'courseSelections', p_selection_id, 'delete'
  );

  if v_kind = 'personal' then
    delete from private.course_revisions revision
    where revision.course_id = p_course_id;
    update public.courses course
    set status = 'archived',
        deleted_at = now(),
        content_hash = null,
        current_revision_hash = null,
        revision_artifact_hash = null,
        module_count = 0,
        lesson_count = 0,
        microsequence_count = 0,
        card_count = 0,
        document_storage_enabled = false,
        updated_at = now()
    where course.id = p_course_id;
    insert into private.course_revision_sync_changes(
      user_id, scope, entity_id, operation, revision_hash
    ) values (
      p_actor_id, 'private', p_course_id, 'delete', null
    );
  end if;

  v_result := jsonb_build_object(
    'status', 'removed',
    'selectionId', p_selection_id,
    'courseId', p_course_id,
    'kind', v_kind,
    'courseArchived', v_kind = 'personal',
    'idempotent', false
  );
  insert into private.personal_library_receipts_v5(
    actor_id, request_id, operation, payload_hash, result
  ) values (
    p_actor_id, p_request_id, 'remove_course', v_payload_hash, v_result
  );
  return v_result;
end;
$function$;

create function public.publish_authoring_workspace_course_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_target text,
  p_completion_state text,
  p_existing_course_id uuid,
  p_expected_content_hash text,
  p_collection_id uuid,
  p_submission_id uuid,
  p_metadata jsonb,
  p_artifact jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_publication private.authoring_workspace_publications%rowtype;
  v_submission private.catalog_review_submissions%rowtype;
  v_course_id uuid;
  v_workspace_course_id text := p_metadata->>'contractKey';
  v_baseline_hash text;
  v_hash text := p_artifact->>'hash';
  v_operation text;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(
    p_owner_id,
    case when p_target = 'catalog' then 'catalog:publish'
      else 'authoring:write'
    end
  );
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_target is null
     or p_target not in ('private', 'catalog')
     or p_completion_state is null
     or p_completion_state not in ('partial', 'complete')
     or (p_target = 'catalog' and p_completion_state <> 'complete')
     or (
       (p_existing_course_id is null) <>
         (p_expected_content_hash is null)
     )
     or (
       p_expected_content_hash is not null
       and p_expected_content_hash !~ '^[0-9a-f]{64}$'
     )
     or p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
     or pg_column_size(p_metadata) > 65536
     or p_artifact is null
     or jsonb_typeof(p_artifact) <> 'object'
     or v_hash !~ '^[0-9a-f]{64}$'
     or p_artifact->>'bucket' not in (
       'aralearn-authoring-artifacts',
       'aralearn-course-revisions'
     )
     or p_artifact->>'artifactType' <> 'aralearn.course-revision'
     or p_artifact->>'mediaType' <> 'application/json'
     or jsonb_typeof(p_artifact->'sizeBytes') <> 'number'
     or p_artifact->>'sizeBytes' !~ '^[1-9][0-9]*$'
     or (p_artifact->>'sizeBytes')::numeric > 33554432 then
    raise exception 'Publicação de workspace inválida.' using errcode = '22023';
  end if;
  if not (
    p_metadata ?& array[
      'contractKey', 'title', 'goal',
      'moduleCount', 'lessonCount', 'microsequenceCount', 'cardCount'
    ]
  )
     or nullif(btrim(p_metadata->>'contractKey'), '') is null
     or char_length(p_metadata->>'contractKey') > 240
     or nullif(btrim(p_metadata->>'title'), '') is null
     or char_length(p_metadata->>'title') > 300
     or nullif(btrim(p_metadata->>'goal'), '') is null
     or char_length(p_metadata->>'goal') > 4000
     or (
       p_metadata ? 'contractScope'
       and jsonb_typeof(p_metadata->'contractScope') not in ('string', 'null')
     )
     or char_length(p_metadata->>'contractScope') > 240
     or exists (
       select 1
       from unnest(array[
         'moduleCount', 'lessonCount', 'microsequenceCount', 'cardCount'
       ]) field_name
       where jsonb_typeof(p_metadata->field_name) <> 'number'
         or p_metadata->>field_name !~ '^[0-9]+$'
         or (p_metadata->>field_name)::numeric > 10000
     ) then
    raise exception 'Metadados de publicação inválidos.'
      using errcode = '22023';
  end if;
  if p_target = 'catalog' then
    perform pg_advisory_xact_lock(hashtextextended(
      'aralearn-catalog-management-v5:global',
      0
    ));
    if p_collection_id is null then
      raise exception 'Publicação editorial não autorizada.'
        using errcode = '42501';
    end if;
    perform 1
    from private.app_role_assignments assignment
    where assignment.user_id = p_owner_id
      and assignment.role in ('owner', 'catalog_publisher')
      and assignment.active
      and assignment.revoked_at is null
    for share;
    if not found then
      raise exception 'Publicação editorial não autorizada.'
        using errcode = '42501';
    end if;
    perform 1
    from public.catalog_collections collection
    where collection.id = p_collection_id
      and collection.is_published
      and collection.deleted_at is null
    for share;
    if not found then
      raise exception 'Coleção de catálogo indisponível.'
        using errcode = 'AR422';
    end if;
  elsif p_collection_id is not null or p_submission_id is not null then
    raise exception 'A publicação privada não recebe destino editorial.'
      using errcode = '22023';
  end if;
  v_operation := case
    when p_target = 'catalog' then 'publish_catalog_complete'
    when p_completion_state = 'partial' then 'publish_private_preview'
    else 'publish_private_complete'
  end;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> v_operation
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;
  if p_target = 'private' then
    perform pg_advisory_xact_lock(hashtextextended(
      'aralearn-private-course-publication-v5:' || p_owner_id::text,
      0
    ));
  end if;
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null
  for share;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using errcode = '40001';
  end if;
  if p_target = 'catalog'
     and v_workspace.source_submission_id is distinct from p_submission_id then
    raise exception 'O destino editorial não corresponde ao workspace.'
      using errcode = '42501';
  end if;
  if p_submission_id is not null then
    select * into v_submission
    from private.catalog_review_submissions submission
    where submission.id = p_submission_id
    for update;
    if not found
       or v_submission.status <> 'in_review'
       or v_submission.reviewer_id <> p_owner_id
       or v_workspace.source_submission_id is distinct from p_submission_id
       or v_submission.review_workspace_id is distinct from p_workspace_id then
      raise exception 'Workspace não corresponde à revisão editorial.'
        using errcode = '42501';
    end if;
  end if;

  perform 1
  from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'course'
    and entity.entity_id = v_workspace_course_id
  for share;
  if not found then
    raise exception 'O curso selecionado não pertence ao workspace.'
      using errcode = 'P0002';
  end if;

  select * into v_publication
  from private.authoring_workspace_publications publication
  where publication.workspace_id = p_workspace_id
    and publication.workspace_course_id = v_workspace_course_id
    and publication.target = p_target
  for update;
  if found then
    if p_existing_course_id is not null
       and (
         p_existing_course_id <> v_publication.course_id
         or p_expected_content_hash <> v_publication.content_hash
       ) then
      raise exception 'A base explícita diverge do vínculo do workspace.'
        using errcode = '40001';
    end if;
    v_course_id := v_publication.course_id;
    v_baseline_hash := v_publication.content_hash;
  elsif p_existing_course_id is not null then
    if exists (
      select 1
      from private.authoring_workspace_publications publication
      where publication.workspace_id = p_workspace_id
        and publication.target = p_target
        and publication.course_id = p_existing_course_id
        and publication.workspace_course_id <> v_workspace_course_id
    ) then
      raise exception 'A publicação já está vinculada a outro curso do workspace.'
        using errcode = '23505';
    end if;
    v_course_id := p_existing_course_id;
    v_baseline_hash := p_expected_content_hash;
  end if;

  if v_course_id is not null then
    perform 1
    from public.courses course
    where course.id = v_course_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and course.current_revision_hash is not distinct from v_baseline_hash
      and course.revision_artifact_hash is not distinct from v_baseline_hash
      and (
        (p_target = 'private' and course.owner_id = p_owner_id)
        or (p_target = 'catalog' and course.owner_id is null)
      )
    for update;
    if not found then
      raise exception 'Revisão base do curso desatualizada.'
        using errcode = '40001';
    end if;
  end if;

  perform private.register_artifact_v4(p_artifact);
  if not exists (
    select 1
    from private.artifact_refs artifact
    where artifact.hash = v_hash
      and artifact.bucket = p_artifact->>'bucket'
      and artifact.object_key = p_artifact->>'objectKey'
      and artifact.artifact_type = p_artifact->>'artifactType'
      and artifact.media_type = p_artifact->>'mediaType'
      and artifact.size_bytes = (p_artifact->>'sizeBytes')::bigint
  ) then
    raise exception 'O descritor não corresponde ao artefato registrado.'
      using errcode = '23514';
  end if;
  if v_course_id is null then
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

  delete from private.course_revisions revision
  where revision.course_id = v_course_id;
  insert into private.course_revisions(
    course_id, revision_hash, artifact_hash, base_revision_hash,
    validation_status, validated_at, published_at, created_by
  ) values (
    v_course_id, v_hash, v_hash, null,
    'validated', now(), now(), p_owner_id
  );
  if not exists (
    select 1
    from private.course_revisions revision
    where revision.course_id = v_course_id
      and revision.revision_hash = v_hash
      and revision.artifact_hash = v_hash
      and revision.validation_status = 'validated'
      and revision.validated_at is not null
      and revision.published_at is not null
  ) then
    raise exception 'A revisão de curso existente não pode ser publicada.'
      using errcode = '23514';
  end if;
  update public.courses course
  set contract_key = p_metadata->>'contractKey',
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
      microsequence_count =
        coalesce((p_metadata->>'microsequenceCount')::bigint, 0),
      card_count = coalesce((p_metadata->>'cardCount')::bigint, 0),
      document_storage_enabled = true,
      completion_state = p_completion_state,
      publication_seq = course.publication_seq + 1,
      updated_at = now()
  where course.id = v_course_id;

  insert into private.authoring_workspace_publications(
    workspace_id,
    workspace_course_id,
    target,
    course_id,
    content_hash
  ) values (
    p_workspace_id,
    v_workspace_course_id,
    p_target,
    v_course_id,
    v_hash
  )
  on conflict(workspace_id, workspace_course_id, target) do update
  set content_hash = excluded.content_hash,
      updated_at = now()
  where private.authoring_workspace_publications.course_id =
    excluded.course_id
  returning * into v_publication;
  if not found then
    raise exception 'O vínculo da publicação mudou durante a atualização.'
      using errcode = '40001';
  end if;

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
  else
    update public.catalog_collection_courses item
    set collection_id = p_collection_id,
        position = coalesce((
          select max(other.position) + 1
          from public.catalog_collection_courses other
          where other.collection_id = p_collection_id
            and other.course_id <> v_course_id
            and other.deleted_at is null
        ), 0),
        deleted_at = null,
        updated_at = now()
    where item.course_id = v_course_id and item.deleted_at is null;
    if not found then
      insert into public.catalog_collection_courses(
        collection_id, course_id, position
      ) values (
        p_collection_id, v_course_id,
        coalesce((
          select max(item.position) + 1
          from public.catalog_collection_courses item
          where item.collection_id = p_collection_id
            and item.deleted_at is null
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
  if p_submission_id is not null then
    update private.catalog_review_submissions submission
    set status = 'accepted',
        official_course_id = v_course_id,
        collection_id = p_collection_id,
        artifact_hash = null,
        review_workspace_id = null,
        claim_expires_at = null,
        reviewer_note = coalesce(
          submission.reviewer_note,
          'Revisão publicada no catálogo.'
        ),
        decided_at = now(),
        updated_at = now()
    where submission.id = p_submission_id;
    perform private.close_catalog_review_workspace_v5(
      p_workspace_id,
      true
    );
  end if;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', p_expected_revision,
    'courseId', v_course_id,
    'contentHash', v_hash,
    'completionState', p_completion_state,
    'target', p_target,
    'submissionId', p_submission_id,
    'idempotent', false
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_owner_id, p_request_id, v_operation, p_payload_hash,
    p_workspace_id, v_result
  );
  return v_result;
end;
$function$;

create function public.create_catalog_collection_v5(
  p_actor_id uuid,
  p_collection_id uuid,
  p_request_id text,
  p_contract_key text,
  p_title text,
  p_description text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_contract_key text := btrim(p_contract_key);
  v_title text := btrim(p_title);
  v_description text := btrim(coalesce(p_description, ''));
  v_payload_hash text;
  v_replay jsonb;
  v_collection public.catalog_collections%rowtype;
  v_position integer;
  v_result jsonb;
begin
  if p_collection_id is null
     or nullif(v_contract_key, '') is null
     or v_contract_key !~ '^[a-z0-9][a-z0-9-]{0,119}$'
     or nullif(v_title, '') is null
     or char_length(v_title) > 160
     or char_length(v_description) > 1000 then
    raise exception 'Nova coleção inválida.' using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'create_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'contractKey', v_contract_key,
      'title', v_title,
      'description', v_description
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'create_collection', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform 1
  from public.catalog_collections collection
  order by collection.id
  for update;
  if exists (
    select 1
    from public.catalog_collections collection
    where collection.id = p_collection_id
       or collection.contract_key = v_contract_key
  ) then
    raise exception 'A coleção ou sua chave já existe.'
      using errcode = '23505';
  end if;
  select coalesce(max(collection.position) + 1, 0)
  into v_position
  from public.catalog_collections collection
  where collection.is_published
    and collection.deleted_at is null
    and collection.contract_key <> 'outros';
  insert into public.catalog_collections(
    id, contract_key, title, description, position,
    is_published, deleted_at
  ) values (
    p_collection_id, v_contract_key, v_title, v_description,
    v_position, true, null
  );
  perform private.normalize_catalog_collection_positions_v5();
  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id;
  v_result := jsonb_build_object(
    'status', 'created',
    'collectionId', v_collection.id,
    'contractKey', v_collection.contract_key,
    'title', v_collection.title,
    'description', v_collection.description,
    'position', v_collection.position,
    'revision', v_collection.revision,
    'courseCount', 0
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'create_collection',
    v_payload_hash, v_result
  );
end;
$function$;

create function public.update_catalog_collection_v5(
  p_actor_id uuid,
  p_collection_id uuid,
  p_request_id text,
  p_expected_revision bigint,
  p_title text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_title text := btrim(p_title);
  v_payload_hash text;
  v_replay jsonb;
  v_collection public.catalog_collections%rowtype;
  v_description text;
  v_course_count bigint;
  v_status text;
  v_result jsonb;
begin
  if p_collection_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or nullif(v_title, '') is null
     or char_length(v_title) > 160
     or (
       p_description is not null
       and char_length(btrim(p_description)) > 1000
     ) then
    raise exception 'Atualização de coleção inválida.'
      using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'update_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'expectedRevision', p_expected_revision,
      'title', v_title,
      'description', p_description
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'update_collection', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for update;
  if not found then
    raise exception 'Coleção ativa inexistente.' using errcode = 'P0002';
  end if;
  if v_collection.revision <> p_expected_revision then
    raise exception 'Revisão da coleção desatualizada.'
      using errcode = '40001';
  end if;
  v_description := case
    when p_description is null then v_collection.description
    else btrim(p_description)
  end;
  if v_collection.title = v_title
     and v_collection.description = v_description then
    v_status := 'unchanged';
  else
    update public.catalog_collections collection
    set title = v_title,
        description = v_description
    where collection.id = p_collection_id
    returning * into v_collection;
    v_status := 'updated';
  end if;
  select count(*) into v_course_count
  from public.catalog_collection_courses placement
  where placement.collection_id = p_collection_id
    and placement.deleted_at is null;
  v_result := jsonb_build_object(
    'status', v_status,
    'collectionId', v_collection.id,
    'contractKey', v_collection.contract_key,
    'title', v_collection.title,
    'description', v_collection.description,
    'position', v_collection.position,
    'revision', v_collection.revision,
    'courseCount', v_course_count
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'update_collection',
    v_payload_hash, v_result
  );
end;
$function$;

create function public.retire_catalog_collection_v5(
  p_actor_id uuid,
  p_collection_id uuid,
  p_request_id text,
  p_expected_revision bigint,
  p_replacement_collection_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload_hash text;
  v_replay jsonb;
  v_collection public.catalog_collections%rowtype;
  v_moved_count integer;
  v_base_position integer;
  v_result jsonb;
begin
  if p_collection_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_replacement_collection_id = p_collection_id then
    raise exception 'Retirada de coleção inválida.'
      using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'retire_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'expectedRevision', p_expected_revision,
      'replacementCollectionId', p_replacement_collection_id
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'retire_collection', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for update;
  if not found then
    raise exception 'Coleção ativa inexistente.' using errcode = 'P0002';
  end if;
  if v_collection.revision <> p_expected_revision then
    raise exception 'Revisão da coleção desatualizada.'
      using errcode = '40001';
  end if;
  if v_collection.contract_key = 'outros' then
    raise exception 'A coleção Outros é o destino estrutural do catálogo.'
      using errcode = '23514';
  end if;
  if p_replacement_collection_id is not null then
    perform 1
    from public.catalog_collections collection
    where collection.id = p_replacement_collection_id
      and collection.is_published
      and collection.deleted_at is null
    for update;
    if not found then
      raise exception 'Coleção de destino inexistente.'
        using errcode = 'P0002';
    end if;
  end if;

  perform 1
  from public.catalog_collection_courses placement
  where placement.collection_id in (
    p_collection_id, p_replacement_collection_id
  )
    and placement.deleted_at is null
  order by placement.id
  for update;
  select count(*) into v_moved_count
  from public.catalog_collection_courses placement
  where placement.collection_id = p_collection_id
    and placement.deleted_at is null;
  if v_moved_count > 0 and p_replacement_collection_id is null then
    raise exception 'Informe uma coleção ativa para receber os cursos.'
      using errcode = '23514';
  end if;
  if v_moved_count > 0 then
    select coalesce(max(placement.position) + 1, 0)
    into v_base_position
    from public.catalog_collection_courses placement
    where placement.collection_id = p_replacement_collection_id
      and placement.deleted_at is null;
    with moving as materialized (
      select
        placement.id,
        row_number() over (
          order by placement.position, placement.id
        )::integer - 1 as offset_value
      from public.catalog_collection_courses placement
      where placement.collection_id = p_collection_id
        and placement.deleted_at is null
    )
    update public.catalog_collection_courses placement
    set collection_id = p_replacement_collection_id,
        position = v_base_position + moving.offset_value
    from moving
    where placement.id = moving.id;
    perform private.normalize_catalog_course_positions_v5(
      p_replacement_collection_id
    );
  end if;
  update public.catalog_collections collection
  set is_published = false,
      deleted_at = now()
  where collection.id = p_collection_id
  returning * into v_collection;
  perform private.normalize_catalog_collection_positions_v5();
  v_result := jsonb_build_object(
    'status', 'retired',
    'collectionId', p_collection_id,
    'replacementCollectionId', p_replacement_collection_id,
    'movedCourseCount', v_moved_count,
    'revision', v_collection.revision
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'retire_collection',
    v_payload_hash, v_result
  );
end;
$function$;

create function public.move_catalog_course_v5(
  p_actor_id uuid,
  p_course_id uuid,
  p_request_id text,
  p_expected_placement_revision bigint,
  p_target_collection_id uuid,
  p_position integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload_hash text;
  v_replay jsonb;
  v_placement public.catalog_collection_courses%rowtype;
  v_from_collection_id uuid;
  v_old_position integer;
  v_target_count integer;
  v_position integer;
  v_status text := 'moved';
  v_result jsonb;
begin
  if p_course_id is null
     or p_expected_placement_revision is null
     or p_expected_placement_revision < 1
     or p_target_collection_id is null
     or (p_position is not null and p_position < 0) then
    raise exception 'Movimento de curso inválido.' using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'move_course',
    jsonb_build_object(
      'courseId', p_course_id,
      'expectedPlacementRevision', p_expected_placement_revision,
      'targetCollectionId', p_target_collection_id,
      'position', p_position
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'move_course', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform 1
  from public.courses course
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  for update;
  if not found then
    raise exception 'Curso oficial inexistente.' using errcode = 'P0002';
  end if;
  select * into v_placement
  from public.catalog_collection_courses placement
  where placement.course_id = p_course_id
    and placement.deleted_at is null
  for update;
  if not found then
    raise exception 'Classificação do curso inexistente.'
      using errcode = 'P0002';
  end if;
  if v_placement.revision <> p_expected_placement_revision then
    raise exception 'Revisão da classificação desatualizada.'
      using errcode = '40001';
  end if;
  if not exists (
    select 1
    from public.catalog_collections collection
    where collection.id = v_placement.collection_id
      and collection.is_published
      and collection.deleted_at is null
  ) then
    raise exception 'Coleção de origem inexistente ou inativa.'
      using errcode = '23514';
  end if;
  perform 1
  from public.catalog_collections collection
  where collection.id = p_target_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for update;
  if not found then
    raise exception 'Coleção de destino inexistente.'
      using errcode = 'P0002';
  end if;

  v_from_collection_id := v_placement.collection_id;
  v_old_position := v_placement.position;
  perform 1
  from public.catalog_collection_courses placement
  where placement.collection_id in (
    v_from_collection_id, p_target_collection_id
  )
    and placement.deleted_at is null
  order by placement.id
  for update;
  select count(*) into v_target_count
  from public.catalog_collection_courses placement
  where placement.collection_id = p_target_collection_id
    and placement.deleted_at is null
    and placement.course_id <> p_course_id;
  v_position := least(coalesce(p_position, v_target_count), v_target_count);

  if v_from_collection_id = p_target_collection_id
     and v_position = v_old_position then
    v_status := 'unchanged';
  elsif v_from_collection_id = p_target_collection_id then
    if v_position < v_old_position then
      update public.catalog_collection_courses placement
      set position = placement.position + 1
      where placement.collection_id = v_from_collection_id
        and placement.deleted_at is null
        and placement.course_id <> p_course_id
        and placement.position >= v_position
        and placement.position < v_old_position;
    else
      update public.catalog_collection_courses placement
      set position = placement.position - 1
      where placement.collection_id = v_from_collection_id
        and placement.deleted_at is null
        and placement.course_id <> p_course_id
        and placement.position > v_old_position
        and placement.position <= v_position;
    end if;
    update public.catalog_collection_courses placement
    set position = v_position
    where placement.id = v_placement.id
    returning * into v_placement;
  else
    update public.catalog_collection_courses placement
    set position = placement.position - 1
    where placement.collection_id = v_from_collection_id
      and placement.deleted_at is null
      and placement.position > v_old_position;
    update public.catalog_collection_courses placement
    set position = placement.position + 1
    where placement.collection_id = p_target_collection_id
      and placement.deleted_at is null
      and placement.position >= v_position;
    update public.catalog_collection_courses placement
    set collection_id = p_target_collection_id,
        position = v_position
    where placement.id = v_placement.id
    returning * into v_placement;
  end if;
  perform private.normalize_catalog_course_positions_v5(
    v_from_collection_id
  );
  if p_target_collection_id <> v_from_collection_id then
    perform private.normalize_catalog_course_positions_v5(
      p_target_collection_id
    );
  end if;
  select * into v_placement
  from public.catalog_collection_courses placement
  where placement.id = v_placement.id;
  v_result := jsonb_build_object(
    'status', v_status,
    'courseId', p_course_id,
    'fromCollectionId', v_from_collection_id,
    'collectionId', v_placement.collection_id,
    'position', v_placement.position,
    'placementRevision', v_placement.revision
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'move_course',
    v_payload_hash, v_result
  );
end;
$function$;

create function public.remove_catalog_course_v5(
  p_actor_id uuid,
  p_course_id uuid,
  p_request_id text,
  p_expected_placement_revision bigint,
  p_expected_content_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload_hash text;
  v_replay jsonb;
  v_course public.courses%rowtype;
  v_placement public.catalog_collection_courses%rowtype;
  v_result jsonb;
begin
  if p_course_id is null
     or p_expected_placement_revision is null
     or p_expected_placement_revision < 1
     or p_expected_content_hash is null
     or p_expected_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Retirada de curso inválida.' using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'remove_course',
    jsonb_build_object(
      'courseId', p_course_id,
      'expectedPlacementRevision', p_expected_placement_revision,
      'expectedContentHash', p_expected_content_hash
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'remove_course', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.owner_id is null
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  for update;
  if not found then
    raise exception 'Curso oficial inexistente.' using errcode = 'P0002';
  end if;
  if v_course.current_revision_hash is distinct from p_expected_content_hash then
    raise exception 'Revisão do curso desatualizada.' using errcode = '40001';
  end if;
  select * into v_placement
  from public.catalog_collection_courses placement
  where placement.course_id = p_course_id
    and placement.deleted_at is null
  for update;
  if not found then
    raise exception 'Classificação do curso inexistente.'
      using errcode = 'P0002';
  end if;
  if v_placement.revision <> p_expected_placement_revision then
    raise exception 'Revisão da classificação desatualizada.'
      using errcode = '40001';
  end if;
  perform 1
  from public.catalog_collection_courses placement
  where placement.collection_id = v_placement.collection_id
    and placement.deleted_at is null
  order by placement.id
  for update;

  delete from public.catalog_collection_courses placement
  where placement.id = v_placement.id;
  update public.catalog_collection_courses placement
  set position = placement.position - 1
  where placement.collection_id = v_placement.collection_id
    and placement.deleted_at is null
    and placement.position > v_placement.position;
  perform private.normalize_catalog_course_positions_v5(
    v_placement.collection_id
  );
  delete from private.course_revisions revision
  where revision.course_id = p_course_id;
  update public.courses course
  set status = 'archived',
      deleted_at = now(),
      content_hash = null,
      current_revision_hash = null,
      revision_artifact_hash = null,
      module_count = 0,
      lesson_count = 0,
      microsequence_count = 0,
      card_count = 0,
      document_storage_enabled = false,
      updated_at = now()
  where course.id = p_course_id;
  insert into private.course_revision_sync_changes(
    user_id, scope, entity_id, operation, revision_hash
  ) values (
    null, 'catalog', p_course_id, 'delete', null
  );
  v_result := jsonb_build_object(
    'status', 'removed',
    'courseId', p_course_id,
    'collectionId', v_placement.collection_id
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'remove_course',
    v_payload_hash, v_result
  );
end;
$function$;

-- A coleta deixa de procurar snapshots de workspace; workspaces compostos não
-- criam objetos no Storage. Revisões publicadas e submissões continuam retendo
-- seus artefatos.
create function public.list_unreferenced_artifacts_v4(
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.require_service_role();
  if p_older_than is null
     or p_older_than < interval '1 hour'
     or p_limit is null
     or p_limit not between 1 and 1000 then
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
          select 1 from private.course_revisions revision
          where revision.artifact_hash = ref.hash
        )
        and not exists (
          select 1 from public.courses course
          where course.revision_artifact_hash = ref.hash
        )
        and not exists (
          select 1 from private.catalog_review_submissions submission
          where submission.artifact_hash = ref.hash
        )
      order by ref.created_at
      limit p_limit
    ) artifact
  ), '[]'::jsonb);
end;
$function$;

create function public.claim_unreferenced_artifacts_v4(
  p_claim_token uuid,
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_artifact private.artifact_refs%rowtype;
  v_limit integer := p_limit;
  v_reclaimed integer := 0;
begin
  perform private.require_service_role();
  if p_claim_token is null
     or p_older_than is null
     or p_older_than < interval '1 hour'
     or p_limit is null
     or p_limit not between 1 and 500 then
    raise exception 'Parâmetros de coleta inválidos.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-artifact-gc-v4',
    0
  ));
  with stale as materialized (
    select tombstone.hash
    from private.artifact_gc_tombstones tombstone
    where tombstone.claimed_at < now() - interval '15 minutes'
    order by tombstone.claimed_at, tombstone.hash
    for update skip locked
    limit v_limit
  )
  update private.artifact_gc_tombstones tombstone
  set claim_token = p_claim_token, claimed_at = now()
  from stale
  where tombstone.hash = stale.hash;
  get diagnostics v_reclaimed = row_count;
  for v_artifact in
    select ref.*
    from private.artifact_refs ref
    where ref.created_at < now() - p_older_than
      and not exists (
        select 1 from private.course_revisions revision
        where revision.artifact_hash = ref.hash
      )
      and not exists (
        select 1 from public.courses course
        where course.revision_artifact_hash = ref.hash
      )
      and not exists (
        select 1 from private.catalog_review_submissions submission
        where submission.artifact_hash = ref.hash
      )
    order by ref.created_at
    for update skip locked
    limit greatest(v_limit - v_reclaimed, 0)
  loop
    insert into private.artifact_gc_tombstones(
      hash, bucket, object_key, artifact_type, media_type, size_bytes,
      claim_token
    ) values (
      v_artifact.hash, v_artifact.bucket, v_artifact.object_key,
      v_artifact.artifact_type, v_artifact.media_type,
      v_artifact.size_bytes, p_claim_token
    ) on conflict(hash) do nothing;
    delete from private.artifact_refs ref where ref.hash = v_artifact.hash;
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
$function$;

-- Capacidades são derivadas da conta em cada chamada; existe um único
-- assistente, e não credenciais ou GPTs separados por perfil.
create or replace function public.resolve_authoring_oauth_principal(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $function$
declare
  v_window timestamptz := date_trunc('minute', statement_timestamp());
  v_count integer;
  v_limit constant integer := 120;
  v_can_review boolean;
  v_can_publish boolean;
  v_scopes text[] := array[
    'authoring:private:read',
    'authoring:private:write',
    'authoring:private:audit',
    'catalog:submit'
  ]::text[];
begin
  perform private.require_service_role();
  if p_user_id is null or not exists (
    select 1 from auth.users account where account.id = p_user_id
  ) then
    raise exception 'Identidade OAuth inválida.' using errcode = '28000';
  end if;
  insert into private.authoring_user_rate_windows(
    user_id, window_started_at, request_count
  ) values (p_user_id, v_window, 1)
  on conflict(user_id) do update
  set request_count = case
        when private.authoring_user_rate_windows.window_started_at =
          excluded.window_started_at
          then private.authoring_user_rate_windows.request_count + 1
        else 1
      end,
      window_started_at = excluded.window_started_at
  returning request_count into v_count;
  if v_count > v_limit then
    return jsonb_build_object(
      'active', true,
      'status', 'rate_limited',
      'actorId', p_user_id,
      'scopes', '[]'::jsonb,
      'rateLimit', v_limit,
      'rateRemaining', 0
    );
  end if;
  v_can_review := private.can_review_catalog_v5(p_user_id);
  v_can_publish := private.can_publish_catalog_v5(p_user_id);
  if v_can_review or v_can_publish then
    v_scopes := array_append(v_scopes, 'catalog:read');
  end if;
  if v_can_review then
    v_scopes := array_append(v_scopes, 'catalog:review');
  end if;
  if v_can_publish then
    v_scopes := v_scopes || array[
      'authoring:read',
      'authoring:write',
      'authoring:audit',
      'catalog:publish',
      'catalog:manage'
    ]::text[];
  end if;
  if private.has_active_app_role(p_user_id, 'owner') then
    v_scopes := array_append(v_scopes, 'roles:manage');
  end if;
  select array_agg(distinct scope order by scope)
  into v_scopes
  from unnest(v_scopes) scope;
  return jsonb_build_object(
    'active', true,
    'actorId', p_user_id,
    'scopes', to_jsonb(v_scopes),
    'rateLimit', v_limit,
    'rateRemaining', greatest(v_limit - v_count, 0)
  );
end;
$function$;

create or replace function public.current_user_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_roles jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(assignment.role order by assignment.role), '[]'::jsonb)
  into v_roles
  from private.app_role_assignments assignment
  where assignment.user_id = v_user_id
    and assignment.active
    and assignment.revoked_at is null;
  return jsonb_build_object(
    'authenticated', true,
    'userId', v_user_id,
    'roles', v_roles,
    'authoring', jsonb_build_object(
      'private', true,
      'catalogSubmit', true,
      'catalogRead', private.can_review_catalog_v5(v_user_id)
        or private.can_publish_catalog_v5(v_user_id),
      'catalogReview', private.can_review_catalog_v5(v_user_id),
      'catalogPublish', private.can_publish_catalog_v5(v_user_id),
      'catalogManage', private.can_publish_catalog_v5(v_user_id)
    )
  );
end;
$function$;

revoke all on table private.authoring_workspaces
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_workspace_entities
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_workspace_publications
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_workspace_requests
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_workspace_events
  from public, anon, authenticated, service_role;
revoke all on table private.catalog_management_receipts_v5
  from public, anon, authenticated, service_role;
revoke all on table private.personal_library_receipts_v5
  from public, anon, authenticated, service_role;
revoke all on table private.catalog_review_submissions
  from public, anon, authenticated, service_role;

do $grant_service_functions$
declare
  v_function record;
begin
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'public'
      and procedure_value.proname in (
        'replay_authoring_workspace_request_v5',
        'get_course_document_artifact_v4',
        'create_authoring_workspace_v5',
        'commit_authoring_workspace_changes_v5',
        'update_authoring_workspace_brief_v5',
        'get_authoring_workspace_v5',
        'list_authoring_workspaces_v5',
        'list_authoring_workspace_events_v5',
        'list_authoring_workspace_microsequence_cards_v5',
        'search_authoring_catalog_courses_v5',
        'delete_authoring_workspace_v5',
        'submit_private_course_for_catalog_review_v5',
        'list_catalog_reviews_v5',
        'get_catalog_review_artifact_v5',
        'claim_catalog_review_v5',
        'link_catalog_review_workspace_v5',
        'decide_catalog_review_v5',
        'withdraw_catalog_review_v5',
        'remove_course_from_personal_library_v5',
        'publish_authoring_workspace_course_v5',
        'create_catalog_collection_v5',
        'update_catalog_collection_v5',
        'retire_catalog_collection_v5',
        'move_catalog_course_v5',
        'remove_catalog_course_v5',
        'list_unreferenced_artifacts_v4',
        'claim_unreferenced_artifacts_v4'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_function.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      v_function.signature
    );
  end loop;
end;
$grant_service_functions$;

revoke all on function public.register_authoring_artifact_v5(jsonb)
  from public, anon, authenticated;
grant execute on function public.register_authoring_artifact_v5(jsonb)
  to service_role;

revoke all on function private.require_workspace_actor_v5(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.prune_authoring_workspace_state_v5(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.compact_course_revision_sync_changes_v5()
  from public, anon, authenticated, service_role;
revoke all on function private.maintain_sync_history_v5()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_workspace_course_publication_v5()
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_archived_course_publication_v5()
  from public, anon, authenticated, service_role;
revoke all on function private.can_review_catalog_v5(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.can_publish_catalog_v5(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_management_payload_hash_v5(text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.begin_catalog_management_v5(
  uuid,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function private.complete_catalog_management_v5(
  uuid,text,text,text,jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.normalize_catalog_collection_positions_v5()
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_catalog_course_positions_v5(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.close_catalog_review_workspace_v5(uuid,boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.validate_authoring_workspace_v5(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.workspace_result_v5(
  private.authoring_workspaces,boolean,jsonb
) from public, anon, authenticated, service_role;

revoke all on function public.resolve_authoring_oauth_principal(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_authoring_oauth_principal(uuid)
  to service_role;
revoke all on function public.current_user_capabilities()
  from public, anon, service_role;
grant execute on function public.current_user_capabilities()
  to authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260730140000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'pre-registered-publication-artifacts',
      'single-current-course-revision',
      'storage-only-course-content',
      'canonical-resource-registry',
      'atomic-resource-authoring',
      'atomic-card-assistance',
      'composed-authoring-workspaces',
      'workspace-publication-bindings',
      'bounded-authoring-events',
      'partial-private-publication',
      'microtheory-review-projection',
      'workspace-cursor-pagination',
      'workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination',
      'global-catalog-course-search',
      'catalog-review-submissions',
      'catalog-management',
      'personal-library-course-removal',
      'course-revision-sync-compaction',
      'automatic-sync-history-maintenance',
      'compact-authoring-brief',
      'account-derived-authoring-capabilities',
      'oauth-only-authoring-mcp',
      'default-catalog-collection',
      'confidential-gpt-action-oauth',
      'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback'
    )
  );
$function$;

commit;
