begin;

-- Destructive lean cut-over.  Official course trees are shared once; a user
-- stores only a selection and personal study state.  The existing deployment
-- contains test data only, so no legacy rows are migrated or retained.
select pg_advisory_xact_lock(hashtextextended('aralearn-shared-catalog-lean-cutover', 0));

revoke all on all functions in schema public from anon;

-- Remove every public entry point whose contract depended on cloned trees,
-- optimistic revisions, or the old replica document.
drop function if exists public.clone_catalog_course(uuid) cascade;
drop function if exists public.clone_catalog_course(uuid, uuid) cascade;
drop function if exists public.refresh_personal_course_from_source(uuid) cascade;
drop function if exists public.refresh_personal_course_from_source(uuid, uuid) cascade;
drop function if exists public.delete_personal_course(uuid, uuid) cascade;
drop function if exists public.delete_personal_course(uuid, bigint, uuid) cascade;
drop function if exists public.get_personal_course_graph(uuid) cascade;
drop function if exists public.replace_microsequence_cards(uuid, bigint, uuid, jsonb) cascade;
drop function if exists public.apply_study_path_mutation(uuid, text, uuid, text, bigint, text[], jsonb) cascade;
drop function if exists public.apply_sync_batch(uuid, jsonb) cascade;
drop function if exists public.pull_sync_changes(bigint, integer, uuid) cascade;
drop function if exists public.bootstrap_replica(uuid) cascade;
drop function if exists public.bootstrap_replica_manifest(uuid) cascade;
drop function if exists public.get_replica_course_snapshot(uuid, uuid) cascade;
drop function if exists public.list_catalog_collections(text) cascade;
drop function if exists public.list_personal_course_summaries() cascade;
drop function if exists public.list_user_course_summaries() cascade;
drop function if exists public.list_catalog_courses() cascade;
drop function if exists public.apply_study_path_mutation(uuid, jsonb) cascade;
drop function if exists public.delete_own_account(text) cascade;

drop function if exists private.capture_sync_change() cascade;
drop function if exists private.capture_personal_library_change() cascade;
drop function if exists private.capture_study_path_change() cascade;
drop function if exists private.mark_personal_course_dirty() cascade;
drop function if exists private.mark_course_content_dirty() cascade;
drop function if exists private.mark_course_self_dirty() cascade;
drop function if exists private.content_row_card_id(text,jsonb) cascade;
drop function if exists private.content_row_microsequence_id(text,jsonb) cascade;
drop function if exists private.clone_course_tree(uuid, uuid, uuid) cascade;
drop function if exists private.soft_delete_course_tree(uuid, bigint, uuid) cascade;
drop function if exists public.validate_course_graph(uuid) cascade;
drop function if exists public.compute_course_content_hash(uuid) cascade;
drop function if exists private.course_content_hash(uuid) cascade;
drop function if exists public.user_owns_course(uuid) cascade;
drop function if exists public.user_can_edit_course(uuid) cascade;

do $$
declare v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname in (
      'apply_one_sync_mutation','apply_entity_mutation','soft_delete_entity',
      'clone_entity_rows','copy_clone_scalar_projection','clone_course_tree'
    )) or (n.nspname='public' and p.proname in (
      'clone_catalog_course','refresh_personal_course_from_source',
      'delete_personal_course','get_personal_course_graph',
      'replace_microsequence_cards','publish_official_course'
    ))
  loop execute format('drop function %s cascade',v_function); end loop;
end;
$$;

-- Technical import staging is rebuilt below.  No fixture or partially staged
-- tree survives this cut-over.
drop function if exists public.finalize_official_course_import(uuid) cascade;
drop function if exists public.apply_official_course_import_chunk(uuid, text, integer, jsonb) cascade;
drop function if exists public.begin_official_course_import(uuid, jsonb, text, jsonb, boolean) cascade;
drop function if exists public.apply_official_course_import_flow_chunk(uuid, integer, jsonb, jsonb) cascade;
drop function if exists public.begin_official_course_import_flow(uuid) cascade;
drop table if exists private.official_catalog_import_stage_rows cascade;
drop table if exists private.official_catalog_import_chunks cascade;
drop table if exists private.official_catalog_imports cascade;

-- Personal/test state is deliberately discarded.  The official tree is also
-- emptied and will be republished through the staged administrative importer.
drop table if exists public.study_path_courses cascade;
drop table if exists public.study_paths cascade;
drop table if exists public.card_comments cascade;
drop table if exists public.card_progress cascade;
drop table if exists public.lesson_progress cascade;
drop table if exists public.course_memberships cascade;
drop table if exists public.sync_changes cascade;
drop table if exists public.sync_mutations cascade;
drop table if exists public.sync_devices cascade;
drop table if exists private.rpc_idempotency cascade;
drop table if exists private.sync_retention_policy cascade;

truncate table public.courses cascade;

-- The canonical tree is replaced as one validated snapshot.  Per-row
-- revisions, textual identity aliases, tombstones and audit timestamps would
-- duplicate information without helping the student runtime, so they are
-- removed from every didactic child table.
do $$
declare v_table text; v_trigger record;
begin
  foreach v_table in array array[
    'courses','modules','lessons','course_guides','guide_items','lesson_topics',
    'topic_statements','microsequences','microsequence_dependencies',
    'microsequence_statements','cards','card_blocks','block_options','block_nodes',
    'flow_nodes','flow_cases','flow_practices','node_practices','node_practice_items',
    'block_edges','block_matrix_items','block_cells','block_points','block_lines',
    'block_highlights','card_refs','catalog_collections','catalog_collection_courses'
  ] loop
    for v_trigger in
      select t.tgname from pg_trigger t
      join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
      where n.nspname='public' and c.relname=v_table and not t.tgisinternal
        and pn.nspname='private' and p.proname='touch_revision'
    loop execute format('drop trigger %I on public.%I',v_trigger.tgname,v_table); end loop;
    execute format('alter table public.%I drop column if exists revision cascade',v_table);
    execute format('alter table public.%I drop column if exists cards_revision cascade',v_table);
    execute format('alter table public.%I drop column if exists identity_key cascade',v_table);
    if v_table<>'courses' and v_table not in ('catalog_collections','catalog_collection_courses') then
      execute format('alter table public.%I drop column if exists created_at cascade',v_table);
      execute format('alter table public.%I drop column if exists updated_at cascade',v_table);
      execute format('alter table public.%I drop column if exists deleted_at cascade',v_table);
    end if;
  end loop;
end;
$$;

-- Natural keys and sibling order remain database-enforced.  These replace the
-- old partial/tombstone indexes with one compact index per actual invariant.
-- Existing composite FK-support indexes beginning with course_id also serve
-- course-scoped scans; separate course_id-only indexes would duplicate them.
create unique index modules_key_lean_uidx on public.modules(course_id,contract_key);
create unique index modules_position_lean_uidx on public.modules(course_id,position);
create unique index lessons_key_lean_uidx on public.lessons(module_id,contract_key);
create unique index lessons_position_lean_uidx on public.lessons(module_id,position);
create unique index course_guides_module_lean_uidx on public.course_guides(module_id)
  where module_id is not null;
create unique index course_guides_lesson_lean_uidx on public.course_guides(lesson_id)
  where lesson_id is not null;
create unique index guide_items_position_lean_uidx
  on public.guide_items(guide_id,item_kind,position);
create unique index guide_items_value_lean_uidx
  on public.guide_items(guide_id,item_kind,lower(value));
create unique index lesson_topics_key_lean_uidx on public.lesson_topics(lesson_id,contract_key);
create unique index lesson_topics_position_lean_uidx on public.lesson_topics(lesson_id,position);
create unique index topic_statements_position_lean_uidx
  on public.topic_statements(topic_id,statement_kind,position);
create unique index microsequences_key_lean_uidx on public.microsequences(lesson_id,contract_key);
create unique index microsequences_position_lean_uidx on public.microsequences(lesson_id,position);
create unique index microsequence_dependencies_pair_lean_uidx
  on public.microsequence_dependencies(microsequence_id,depends_on_microsequence_id);
create unique index microsequence_dependencies_position_lean_uidx
  on public.microsequence_dependencies(microsequence_id,position);
create unique index microsequence_statements_position_lean_uidx
  on public.microsequence_statements(microsequence_id,statement_kind,position);
create unique index cards_key_lean_uidx on public.cards(lesson_id,contract_key);
create unique index cards_position_lean_uidx on public.cards(microsequence_id,position);
create unique index card_blocks_key_lean_uidx on public.card_blocks(course_id,contract_key);
create unique index card_blocks_position_lean_uidx on public.card_blocks(card_id,role,position);
create unique index card_blocks_primary_lean_uidx on public.card_blocks(card_id) where role='primary';
create unique index block_options_key_lean_uidx on public.block_options(block_id,contract_key);
create unique index block_options_position_lean_uidx on public.block_options(block_id,position);
create unique index block_options_correct_lean_uidx on public.block_options(block_id) where is_correct;
create unique index block_nodes_key_lean_uidx on public.block_nodes(block_id,contract_key);
create unique index block_nodes_position_lean_uidx
  on public.block_nodes(block_id,parent_node_id,node_scope,position) nulls not distinct;
create unique index flow_nodes_position_lean_uidx
  on public.flow_nodes(block_id,parent_node_id,parent_case_id,branch,position) nulls not distinct;
create unique index flow_cases_position_lean_uidx on public.flow_cases(flow_node_id,position);
create unique index flow_practices_node_lean_uidx on public.flow_practices(flow_node_id)
  where flow_node_id is not null;
create unique index flow_practices_case_lean_uidx on public.flow_practices(flow_case_id)
  where flow_case_id is not null;
create unique index node_practices_order_lean_uidx
  on public.node_practices(practice_id,entry_kind,coalesce(label_key,''),position);
create unique index node_practice_items_key_lean_uidx
  on public.node_practice_items(entry_id,contract_key)
  where entry_id is not null and contract_key is not null;
create unique index node_practice_items_position_lean_uidx
  on public.node_practice_items(entry_id,item_kind,position) where entry_id is not null;
create unique index node_practice_items_shape_position_lean_uidx
  on public.node_practice_items(flow_practice_id,position) where item_kind='shape_option';
create unique index block_edges_key_lean_uidx on public.block_edges(block_id,contract_key);
create unique index block_edges_position_lean_uidx on public.block_edges(block_id,position);
create unique index block_matrix_items_key_lean_uidx on public.block_matrix_items(block_id,contract_key);
create unique index block_matrix_items_position_lean_uidx on public.block_matrix_items(block_id,position);
create unique index block_cells_matrix_coordinate_lean_uidx
  on public.block_cells(matrix_item_id,row_index,column_index) where matrix_item_id is not null;
create unique index block_cells_block_coordinate_lean_uidx
  on public.block_cells(block_id,cell_kind,row_index,column_index) where matrix_item_id is null;
create unique index block_points_key_lean_uidx on public.block_points(block_id,contract_key);
create unique index block_points_position_lean_uidx on public.block_points(block_id,point_kind,position);
create unique index block_lines_key_lean_uidx on public.block_lines(block_id,contract_key);
create unique index block_lines_position_lean_uidx on public.block_lines(block_id,position);
create unique index block_highlights_position_lean_uidx on public.block_highlights(block_id,position);
create unique index card_refs_position_lean_uidx on public.card_refs(card_id,ref_kind,position);
create unique index card_refs_value_lean_uidx on public.card_refs(card_id,ref_kind,lower(value));

-- Cards may retain their UUID while moving between canonical microssequences.
-- The importer updates parents before children inside one transaction, so this
-- FK must be checked against the final graph rather than an intermediate row.
alter table public.cards alter constraint cards_microsequence_fk
  deferrable initially deferred;

-- Persisted identities are UUIDs.  Lineage columns and their indexes belonged
-- to cloned trees and are physically removed, not left dormant.
do $$
declare
  v_table text;
  v_index record;
begin
  foreach v_table in array array[
    'modules','lessons','course_guides','guide_items','lesson_topics',
    'topic_statements','microsequences','microsequence_dependencies',
    'microsequence_statements','cards','card_blocks','block_options',
    'block_nodes','flow_nodes','flow_cases','flow_practices','node_practices',
    'node_practice_items','block_edges','block_matrix_items','block_cells',
    'block_points','block_lines','block_highlights','card_refs'
  ] loop
    execute format('alter table public.%I drop column if exists source_entity_id cascade', v_table);
  end loop;

  for v_index in
    select schemaname, indexname
    from pg_indexes
    where schemaname = 'public'
      and (
        indexname like '%\_source%' escape '\'
        or indexname like '%\_lineage%' escape '\'
        or indexname like '%\_identity\_key\_uidx' escape '\'
      )
  loop
    execute format('drop index if exists %I.%I', v_index.schemaname, v_index.indexname);
  end loop;
end;
$$;

alter table public.courses drop constraint if exists courses_source_consistent;
alter table public.courses drop constraint if exists courses_hash_format;
alter table public.courses drop constraint if exists courses_kind_owner;
alter table public.courses
  drop column if exists owner_id cascade,
  drop column if exists kind cascade,
  drop column if exists source_course_id cascade,
  drop column if exists source_entity_id cascade,
  drop column if exists source_publication_seq cascade,
  drop column if exists source_content_hash cascade,
  drop column if exists baseline_content_hash cascade,
  drop column if exists personalized_at cascade;
alter table public.courses add constraint courses_hash_format
  check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');
alter table public.courses add constraint courses_official_status
  check (status in ('draft','published','archived'));
drop type if exists public.course_kind cascade;
create unique index courses_contract_key_lean_uidx
  on public.courses(contract_key) where deleted_at is null;
create index courses_catalog_lean_idx
  on public.courses(status,deleted_at,publication_seq desc);

-- Collections are catalog-owned navigation, not user state.  Re-establish the
-- canonical buckets after the destructive catalog truncate and guarantee that
-- each published course belongs to exactly one bucket.  The three current
-- official contract keys have stable routing; future courses enter "Outros"
-- until an administrator assigns a deliberate collection.
insert into public.catalog_collections(
  id,contract_key,title,description,position,is_published,deleted_at
) values
  ('71000000-0000-4000-8000-000000000001','concursos-publicos','Concursos públicos','',0,true,null),
  ('71000000-0000-4000-8000-000000000002','ia-e-dados','IA e dados','',1,true,null),
  ('71000000-0000-4000-8000-000000000003','certificacoes','Certificações','',2,true,null),
  ('71000000-0000-4000-8000-000000000004','outros','Outros','',999,true,null)
on conflict(id) do update set
  contract_key=excluded.contract_key,title=excluded.title,description=excluded.description,
  position=excluded.position,is_published=true,deleted_at=null;

create unique index catalog_collection_courses_course_lean_uidx
  on public.catalog_collection_courses(course_id) where deleted_at is null;

create or replace function private.ensure_official_course_collection()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_collection_id uuid:=case new.contract_key
    when 'course-dataprev-2026-analista-processamento-seguranca-informacao'
      then '71000000-0000-4000-8000-000000000001'::uuid
    when 'course-fundamentos-ia-analise-dados'
      then '71000000-0000-4000-8000-000000000002'::uuid
    when 'course-microsoft-azure-ai-fundamentals-ai900'
      then '71000000-0000-4000-8000-000000000003'::uuid
    else '71000000-0000-4000-8000-000000000004'::uuid
  end;
begin
  -- Preserve an explicit administrative classification across republications.
  -- The deterministic bucket is only a first-publication default.
  if new.status='published' and new.deleted_at is null then
    if not exists(
      select 1 from public.catalog_collection_courses item
      where item.course_id=new.id and item.deleted_at is null
    ) then
      insert into public.catalog_collection_courses(collection_id,course_id,position)
      values(v_collection_id,new.id,0);
    end if;
  else
    delete from public.catalog_collection_courses where course_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_ensure_official_collection on public.courses;
create trigger courses_ensure_official_collection
after insert or update of status,deleted_at,contract_key on public.courses
for each row execute function private.ensure_official_course_collection();

-- A canonical course is retired with status/deleted_at, never by physically
-- deleting its root row.  Besides preserving its administrative identity, this
-- keeps the personal deletion events below addressable until every active
-- replica has crossed the safe sync watermark.
create or replace function private.prevent_canonical_course_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Curso canônico não pode ser excluído fisicamente; arquive-o ou use deleted_at.'
    using errcode = '23514';
end;
$$;

create trigger courses_prevent_canonical_hard_delete
before delete on public.courses
for each row execute function private.prevent_canonical_course_hard_delete();

drop type if exists public.membership_role cascade;
drop type if exists public.sync_mutation_status cascade;

create table public.user_course_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id),
  unique (id, user_id),
  unique (id, user_id, course_id),
  constraint user_course_selections_position_nonnegative check (position >= 0)
);
create index user_course_selections_user_position_idx
  on public.user_course_selections(user_id, position, created_at, id);

create table public.study_paths (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_paths_title_not_blank check (btrim(title) <> ''),
  constraint study_paths_position_nonnegative check (position >= 0),
  unique (id, owner_id)
);
create index study_paths_owner_position_idx on public.study_paths(owner_id, position, created_at, id);

create table public.study_path_courses (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  selection_id uuid not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_path_courses_path_fk foreign key(path_id, owner_id)
    references public.study_paths(id, owner_id) on delete cascade,
  constraint study_path_courses_selection_fk foreign key(selection_id, owner_id)
    references public.user_course_selections(id, user_id) on delete cascade,
  constraint study_path_courses_position_nonnegative check (position >= 0),
  unique(path_id, selection_id),
  unique(owner_id, selection_id),
  unique(id, owner_id)
);
create index study_path_courses_path_position_idx on public.study_path_courses(path_id, position, id);
create index study_path_courses_owner_idx on public.study_path_courses(owner_id, selection_id);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  lesson_id uuid not null,
  cursor integer,
  first_viewed_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_progress_selection_fk foreign key(
    selection_id, user_id, course_id
  ) references public.user_course_selections(id, user_id, course_id)
    on delete cascade,
  constraint lesson_progress_lesson_fk foreign key(course_id, lesson_id)
    references public.lessons(course_id, id) on delete cascade,
  constraint lesson_progress_cursor_nonnegative check (cursor is null or cursor >= -1),
  constraint lesson_progress_completion_order check (
    completed_at is null or first_viewed_at is null or completed_at >= first_viewed_at
  ),
  unique(selection_id, lesson_id)
);
create index lesson_progress_user_activity_idx
  on public.lesson_progress(user_id, last_activity_at desc nulls last, id);

create table public.card_progress (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  card_id uuid not null,
  first_viewed_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  last_result text,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_progress_selection_fk foreign key(
    selection_id, user_id, course_id
  ) references public.user_course_selections(id, user_id, course_id)
    on delete cascade,
  constraint card_progress_card_fk foreign key(course_id, card_id)
    references public.cards(course_id, id) on delete cascade,
  constraint card_progress_attempts_nonnegative check (attempts >= 0),
  constraint card_progress_completion_order check (
    completed_at is null or first_viewed_at is null or completed_at >= first_viewed_at
  ),
  unique(selection_id, card_id)
);
create index card_progress_user_activity_idx
  on public.card_progress(user_id, last_activity_at desc nulls last, id);

create table public.card_comments (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  card_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_comments_selection_fk foreign key(
    selection_id, user_id, course_id
  ) references public.user_course_selections(id, user_id, course_id)
    on delete cascade,
  constraint card_comments_card_fk foreign key(course_id, card_id)
    references public.cards(course_id, id) on delete cascade,
  constraint card_comments_body_not_blank check (btrim(body) <> ''),
  unique(selection_id, card_id)
);
create index card_comments_user_updated_idx on public.card_comments(user_id, updated_at desc, id);

-- Sync internals are private and compact: no request/result envelopes, no full
-- row snapshots, no optimistic base revision, and no public technical tables.
create table private.sync_devices (
  id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_pulled_sequence bigint not null default 0,
  last_processed_mutation_sequence bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  inactive_at timestamptz,
  primary key(user_id, id),
  constraint sync_devices_cursor_nonnegative check(
    last_pulled_sequence >= 0 and last_processed_mutation_sequence >= 0
  )
);
create index sync_devices_active_cursor_idx
  on private.sync_devices(last_pulled_sequence, last_seen_at)
  where inactive_at is null;

create table private.sync_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request_hash text not null,
  entity_type text not null,
  entity_id uuid,
  operation text not null,
  device_id uuid,
  client_sequence bigint,
  applied_sequence bigint,
  outcome text not null default 'applied',
  error_code text,
  error_message text,
  applied_at timestamptz not null default now(),
  primary key(user_id, mutation_id),
  constraint sync_idempotency_device_fk foreign key(user_id,device_id)
    references private.sync_devices(user_id,id) on delete cascade,
  constraint sync_idempotency_device_sequence_shape check(
    (device_id is null and client_sequence is null)
    or (device_id is not null and client_sequence is not null and client_sequence > 0)
  ),
  constraint sync_idempotency_hash check(request_hash ~ '^[0-9a-f]{64}$'),
  constraint sync_idempotency_operation check(operation in ('upsert','delete','select','unselect')),
  constraint sync_idempotency_outcome check(outcome in ('applied','rejected')),
  constraint sync_idempotency_error_shape check(
    (outcome='applied' and error_code is null and error_message is null)
    or (outcome='rejected' and error_code is not null and error_message is not null)
  )
);
create index sync_idempotency_applied_idx on private.sync_idempotency(applied_at, user_id);
create unique index sync_idempotency_device_sequence_uidx
  on private.sync_idempotency(user_id,device_id,client_sequence) where device_id is not null;

create table private.sync_changes (
  sequence bigint generated always as identity primary key,
  audience_user_id uuid references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  changed_at timestamptz not null default now(),
  constraint sync_changes_operation check(operation in ('upsert','delete','publish'))
);
create index sync_changes_audience_sequence_idx on private.sync_changes(audience_user_id, sequence);
create index sync_changes_course_sequence_idx on private.sync_changes(course_id, sequence);
create index sync_changes_changed_idx on private.sync_changes(changed_at, sequence);

create table private.sync_retention_policy (
  singleton boolean primary key default true check(singleton),
  minimum_retention interval not null default interval '30 days',
  idempotency_retention interval not null default interval '90 days',
  device_inactive_after interval not null default interval '90 days',
  compacted_through_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint sync_retention_floor_nonnegative check(compacted_through_sequence >= 0)
);
insert into private.sync_retention_policy(singleton) values(true);

create or replace function private.touch_lean_row()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.refresh_matrix_dimensions()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_matrix_item_id uuid:=coalesce(new.matrix_item_id,old.matrix_item_id);
begin
  if v_matrix_item_id is not null then
    update public.block_matrix_items item set
      row_count=greatest(1,coalesce((select max(cell.row_index)+1 from public.block_cells cell
        where cell.matrix_item_id=v_matrix_item_id and cell.row_index>=0),1)),
      column_count=greatest(1,coalesce((select max(cell.column_index)+1 from public.block_cells cell
        where cell.matrix_item_id=v_matrix_item_id),1))
    where item.id=v_matrix_item_id;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'user_course_selections','study_paths','study_path_courses',
    'lesson_progress','card_progress','card_comments'
  ] loop
    execute format(
      'create trigger %I_touch before update on public.%I '
      'for each row execute function private.touch_lean_row()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function public.user_can_read_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null and exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.deleted_at is null
      and c.status = 'published'
  );
$$;

create or replace function public.user_can_study_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_course_selections s
    join public.courses c on c.id = s.course_id
    where s.user_id = auth.uid() and s.course_id = p_course_id
      and c.status = 'published' and c.deleted_at is null
  );
$$;

create or replace function private.store_name(p_table_name text, p_row jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_table_name
    when 'courses' then 'courses'
    when 'user_course_selections' then 'courseSelections'
    when 'modules' then 'modules'
    when 'lessons' then 'lessons'
    when 'course_guides' then 'guides'
    when 'guide_items' then 'guideItems'
    when 'lesson_topics' then 'topics'
    when 'topic_statements' then 'topicStatements'
    when 'microsequences' then 'microsequences'
    when 'microsequence_dependencies' then 'dependencies'
    when 'microsequence_statements' then 'microsequenceStatements'
    when 'cards' then 'cards'
    when 'card_blocks' then 'blocks'
    when 'block_options' then 'options'
    when 'block_nodes' then 'nodes'
    when 'flow_nodes' then 'flowNodes'
    when 'flow_cases' then 'flowCases'
    when 'flow_practices' then 'flowPractices'
    when 'node_practices' then 'flowPracticeEntries'
    when 'node_practice_items' then case p_row ->> 'item_kind'
      when 'option' then 'flowPracticeOptions'
      when 'variant' then 'flowPracticeVariants'
      when 'shape_option' then 'flowShapeOptions'
    end
    when 'block_edges' then 'edges'
    when 'block_matrix_items' then 'matrixItems'
    when 'block_cells' then 'cells'
    when 'block_points' then 'points'
    when 'block_lines' then 'lines'
    when 'block_highlights' then 'highlights'
    when 'card_refs' then case p_row ->> 'ref_kind'
      when 'source' then 'cardSources'
      when 'topic' then 'cardTopics'
    end
    when 'lesson_progress' then 'lessonProgress'
    when 'card_progress' then 'cardProgress'
    when 'card_comments' then 'comments'
    when 'study_paths' then 'studyPaths'
    when 'study_path_courses' then 'studyPathCourses'
  end;
$$;

create or replace function private.table_for_store(p_store_name text)
returns regclass
language sql
stable
set search_path = pg_catalog
as $$
  select case p_store_name
    when 'courses' then to_regclass('public.courses')
    when 'courseSelections' then to_regclass('public.user_course_selections')
    when 'modules' then to_regclass('public.modules')
    when 'lessons' then to_regclass('public.lessons')
    when 'guides' then to_regclass('public.course_guides')
    when 'guideItems' then to_regclass('public.guide_items')
    when 'topics' then to_regclass('public.lesson_topics')
    when 'topicStatements' then to_regclass('public.topic_statements')
    when 'microsequences' then to_regclass('public.microsequences')
    when 'dependencies' then to_regclass('public.microsequence_dependencies')
    when 'microsequenceStatements' then to_regclass('public.microsequence_statements')
    when 'cards' then to_regclass('public.cards')
    when 'blocks' then to_regclass('public.card_blocks')
    when 'options' then to_regclass('public.block_options')
    when 'nodes' then to_regclass('public.block_nodes')
    when 'flowNodes' then to_regclass('public.flow_nodes')
    when 'flowCases' then to_regclass('public.flow_cases')
    when 'flowPractices' then to_regclass('public.flow_practices')
    when 'flowPracticeEntries' then to_regclass('public.node_practices')
    when 'flowPracticeOptions' then to_regclass('public.node_practice_items')
    when 'flowPracticeVariants' then to_regclass('public.node_practice_items')
    when 'flowShapeOptions' then to_regclass('public.node_practice_items')
    when 'edges' then to_regclass('public.block_edges')
    when 'matrixItems' then to_regclass('public.block_matrix_items')
    when 'cells' then to_regclass('public.block_cells')
    when 'points' then to_regclass('public.block_points')
    when 'lines' then to_regclass('public.block_lines')
    when 'highlights' then to_regclass('public.block_highlights')
    when 'cardSources' then to_regclass('public.card_refs')
    when 'cardTopics' then to_regclass('public.card_refs')
    when 'lessonProgress' then to_regclass('public.lesson_progress')
    when 'cardProgress' then to_regclass('public.card_progress')
    when 'comments' then to_regclass('public.card_comments')
    when 'studyPaths' then to_regclass('public.study_paths')
    when 'studyPathCourses' then to_regclass('public.study_path_courses')
  end;
$$;

create or replace function private.camel_active_rows(
  p_table regclass,
  p_course_id uuid,
  p_store_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,private
as $$
declare v_result jsonb; v_table_name text; v_order text;
begin
  select c.relname into v_table_name from pg_class c where c.oid=p_table;
  v_order:=case when exists(select 1 from pg_attribute a
    where a.attrelid=p_table and a.attname='position' and not a.attisdropped)
    then 't.position,t.id' else 't.id' end;
  execute format(
    'select coalesce(jsonb_agg(private.local_row(coalesce($2,private.store_name($3,to_jsonb(t))),to_jsonb(t)) '
    'order by %s),''[]''::jsonb) from %s t where t.course_id=$1 '
    'and ($2 is null or private.store_name($3,to_jsonb(t))=$2)',v_order,p_table
  ) into v_result using p_course_id,p_store_name,v_table_name;
  return v_result;
end;
$$;

create or replace function private.selection_row(p_selection_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.jsonb_to_camel(to_jsonb(s)) || jsonb_build_object(
    'publicationSeq', c.publication_seq,
    'contentHash', c.content_hash,
    'title', c.title,
    'goal', c.goal,
    'contractKey', c.contract_key
  )
  from public.user_course_selections s
  join public.courses c on c.id = s.course_id
  where s.id = p_selection_id;
$$;

create or replace function private.current_personal_row(
  p_entity_type text,
  p_entity_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare v_row jsonb;
begin
  if p_entity_type = 'courseSelections' then
    select private.selection_row(id) into v_row from public.user_course_selections
    where id = p_entity_id and user_id = p_user_id;
  elsif p_entity_type = 'lessonProgress' then
    select private.local_row('lessonProgress', to_jsonb(t)) into v_row
    from public.lesson_progress t where t.id = p_entity_id and t.user_id = p_user_id;
  elsif p_entity_type = 'cardProgress' then
    select private.local_row('cardProgress', to_jsonb(t)) into v_row
    from public.card_progress t where t.id = p_entity_id and t.user_id = p_user_id;
  elsif p_entity_type = 'comments' then
    select private.local_row('comments', to_jsonb(t)) into v_row
    from public.card_comments t where t.id = p_entity_id and t.user_id = p_user_id;
  elsif p_entity_type = 'studyPaths' then
    select private.jsonb_to_camel(to_jsonb(t)) into v_row
    from public.study_paths t where t.id = p_entity_id and t.owner_id = p_user_id;
  elsif p_entity_type = 'studyPathCourses' then
    select private.jsonb_to_camel(to_jsonb(t)) || jsonb_build_object('courseId',s.course_id) into v_row
    from public.study_path_courses t
    join public.user_course_selections s on s.id=t.selection_id
    where t.id = p_entity_id and t.owner_id = p_user_id;
  end if;
  return v_row;
end;
$$;

create or replace function private.capture_lean_personal_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_user_id uuid;
  v_course_id uuid;
  v_entity_type text := private.store_name(tg_table_name, v_row);
begin
  if coalesce(current_setting('aralearn.suppress_sync_changes', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_user_id := private.try_uuid(coalesce(v_row ->> 'user_id', v_row ->> 'owner_id'));
  v_course_id := private.try_uuid(v_row ->> 'course_id');
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
  insert into private.sync_changes(
    audience_user_id, course_id, entity_type, entity_id, operation
  ) values (
    v_user_id, v_course_id, v_entity_type, private.try_uuid(v_row ->> 'id'),
    case when tg_op = 'DELETE' then 'delete' else 'upsert' end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'user_course_selections','study_paths','study_path_courses',
    'lesson_progress','card_progress','card_comments'
  ] loop
    execute format(
      'create trigger %I_sync after insert or update or delete on public.%I '
      'for each row execute function private.capture_lean_personal_change()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function private.capture_catalog_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.status = 'published' and old.deleted_at is null
     and (new.status <> 'published' or new.deleted_at is not null) then
    -- Deleting the lightweight selection cascades through trail membership,
    -- progress and comments.  Their own triggers write per-user tombstones in
    -- the same transaction, so a replica can never retain a retired course as
    -- an apparently valid personal selection.
    delete from public.user_course_selections selection
      where selection.course_id = new.id;
  elsif new.status = 'published' and new.deleted_at is null
     and (old.content_hash is distinct from new.content_hash
          or old.publication_seq is distinct from new.publication_seq
          or old.status is distinct from new.status
          or old.deleted_at is distinct from new.deleted_at) then
    perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
    insert into private.sync_changes(
      audience_user_id, course_id, entity_type, entity_id, operation
    ) values (null, new.id, 'coursePublication', new.id, 'publish');
  end if;
  return new;
end;
$$;
create trigger courses_catalog_publication_sync
after update on public.courses
for each row execute function private.capture_catalog_publication();

-- RLS is defense in depth.  Browser clients receive no direct table grants;
-- all writes and graph reads go through the small RPC surface below.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'user_course_selections','study_paths','study_path_courses',
    'lesson_progress','card_progress','card_comments'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
  end loop;
end;
$$;

create policy user_course_selections_owner on public.user_course_selections
  for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
create policy study_paths_owner on public.study_paths
  for all to authenticated using(owner_id = auth.uid()) with check(owner_id = auth.uid());
create policy study_path_courses_owner on public.study_path_courses
  for all to authenticated using(owner_id = auth.uid()) with check(owner_id = auth.uid());
create policy lesson_progress_owner on public.lesson_progress
  for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
create policy card_progress_owner on public.card_progress
  for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());
create policy card_comments_owner on public.card_comments
  for all to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid());

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all on schema private from public, anon, authenticated;

create or replace function public.list_catalog_collections(p_query text default '')
returns table(
  collection_id uuid,
  collection_key text,
  collection_title text,
  collection_description text,
  collection_position integer,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  is_selected boolean,
  selection_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user_id uuid := auth.uid(); v_query text := btrim(coalesce(p_query, ''));
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select collection.id, collection.contract_key, collection.title, collection.description,
    collection.position, course.id, course.contract_key, course.title, course.goal,
    course.publication_seq, course.content_hash,
    (select count(*) from public.modules m where m.course_id = course.id),
    (select count(*) from public.lessons l where l.course_id = course.id),
    selection.id is not null, selection.id
  from public.catalog_collections collection
  join public.catalog_collection_courses item
    on item.collection_id = collection.id and item.deleted_at is null
  join public.courses course
    on course.id = item.course_id
    and course.status = 'published' and course.deleted_at is null
  left join public.user_course_selections selection
    on selection.course_id = course.id and selection.user_id = v_user_id
  where collection.is_published and collection.deleted_at is null
    and (
      v_query = '' or collection.title ilike '%' || v_query || '%'
      or collection.description ilike '%' || v_query || '%'
      or course.title ilike '%' || v_query || '%'
      or course.goal ilike '%' || v_query || '%'
    )
  order by collection.position, collection.title, item.position, course.title, course.id;
end;
$$;

create or replace function public.list_user_course_summaries()
returns table(
  selection_id uuid,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  "position" integer,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select s.id, c.id, c.contract_key, c.title, c.goal, s.position,
    c.publication_seq, c.content_hash,
    (select count(*) from public.modules m where m.course_id = c.id),
    (select count(*) from public.lessons l where l.course_id = c.id),
    greatest(
      (select max(lp.last_activity_at) from public.lesson_progress lp where lp.selection_id = s.id),
      (select max(cp.last_activity_at) from public.card_progress cp where cp.selection_id = s.id)
    )
  from public.user_course_selections s
  join public.courses c on c.id = s.course_id
  where s.user_id = v_user_id
    and c.status = 'published' and c.deleted_at is null
  order by s.position, s.created_at, s.id;
end;
$$;

create or replace function public.select_catalog_course(
  p_course_id uuid,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_ledger private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_sequence bigint;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode = '42501'; end if;
  if p_course_id is null or p_mutation_id is null then
    raise exception 'courseId e mutationId são obrigatórios.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.courses c where c.id = p_course_id
      and c.status = 'published' and c.deleted_at is null
  ) then raise exception 'Curso oficial publicado não encontrado.' using errcode = '22023'; end if;
  v_hash := encode(extensions.digest(convert_to('select:' || p_course_id::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('selection:' || v_user_id::text || ':' || p_course_id::text, 0));
  select * into v_ledger from private.sync_idempotency
    where user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_ledger.request_hash <> v_hash or v_ledger.operation <> 'select' then
      raise exception 'mutationId reutilizado com operação incompatível.' using errcode = '23514';
    end if;
    select * into v_selection from public.user_course_selections
      where user_id = v_user_id and course_id = p_course_id;
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'selectionId',v_selection.id,'row',private.selection_row(v_selection.id),
      'desiredSelected',true,'currentSelected',v_selection.id is not null,
      'superseded',v_selection.id is null
    );
  end if;
  insert into public.user_course_selections(user_id, course_id, position)
  values(
    v_user_id, p_course_id,
    coalesce((select max(s.position) + 1 from public.user_course_selections s where s.user_id = v_user_id), 0)
  )
  on conflict(user_id, course_id) do update set updated_at = public.user_course_selections.updated_at
  returning * into v_selection;
  select max(sequence) into v_sequence from private.sync_changes
    where audience_user_id = v_user_id and entity_type = 'courseSelections' and entity_id = v_selection.id;
  insert into private.sync_idempotency(
    user_id, mutation_id, request_hash, entity_type, entity_id, operation, applied_sequence
  ) values(v_user_id,p_mutation_id,v_hash,'courseSelections',v_selection.id,'select',v_sequence);
  return jsonb_build_object(
    'status','applied','mutationId',p_mutation_id,'idempotent',false,
    'selectionId',v_selection.id,'courseId',p_course_id,'row',private.selection_row(v_selection.id),
    'desiredSelected',true,'currentSelected',true,'superseded',false
  );
end;
$$;

create or replace function public.unselect_catalog_course(
  p_course_id uuid,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_ledger private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_sequence bigint;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode = '42501'; end if;
  if p_course_id is null or p_mutation_id is null then
    raise exception 'courseId e mutationId são obrigatórios.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to('unselect:' || p_course_id::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('selection:' || v_user_id::text || ':' || p_course_id::text, 0));
  select * into v_ledger from private.sync_idempotency
    where user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_ledger.request_hash <> v_hash or v_ledger.operation <> 'unselect' then
      raise exception 'mutationId reutilizado com operação incompatível.' using errcode = '23514';
    end if;
    select * into v_selection from public.user_course_selections
      where user_id = v_user_id and course_id = p_course_id;
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'courseId',p_course_id,'selectionId',v_ledger.entity_id,
      'desiredSelected',false,'currentSelected',v_selection.id is not null,
      'superseded',v_selection.id is not null,'row',private.selection_row(v_selection.id)
    );
  end if;
  select * into v_selection from public.user_course_selections
    where user_id = v_user_id and course_id = p_course_id for update;
  if not found then
    -- Two offline devices may independently express the same desired absence.
    -- Record the second intent without leaking whether a selection ever existed.
    insert into private.sync_idempotency(
      user_id,mutation_id,request_hash,entity_type,entity_id,operation,applied_sequence
    ) values(v_user_id,p_mutation_id,v_hash,'courseSelections',null,'unselect',null);
    return jsonb_build_object(
      'status','applied','mutationId',p_mutation_id,'idempotent',true,
      'courseId',p_course_id,'selectionId',null,
      'desiredSelected',false,'currentSelected',false,'superseded',false
    );
  end if;

  perform set_config('aralearn.suppress_sync_changes','on',true);
  delete from public.user_course_selections where id = v_selection.id;
  perform set_config('aralearn.suppress_sync_changes','off',true);
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
  insert into private.sync_changes(audience_user_id,course_id,entity_type,entity_id,operation)
    values(v_user_id,p_course_id,'courseSelections',v_selection.id,'delete')
    returning sequence into v_sequence;
  insert into private.sync_idempotency(
    user_id,mutation_id,request_hash,entity_type,entity_id,operation,applied_sequence
  ) values(v_user_id,p_mutation_id,v_hash,'courseSelections',v_selection.id,'unselect',v_sequence);
  return jsonb_build_object(
    'status','applied','mutationId',p_mutation_id,'idempotent',false,
    'courseId',p_course_id,'selectionId',v_selection.id,
    'desiredSelected',false,'currentSelected',false,'superseded',false
  );
end;
$$;

create or replace function public.get_selected_course_graph(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '55s'
as $$
declare v_user_id uuid := auth.uid(); v_course public.courses%rowtype;
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode = '42501'; end if;
  select c.* into v_course from public.courses c
  join public.user_course_selections s on s.course_id = c.id and s.user_id = v_user_id
  where c.id = p_course_id and c.status = 'published' and c.deleted_at is null;
  if not found then raise exception 'Curso não está selecionado nesta conta.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'courseId',v_course.id,'publicationSeq',v_course.publication_seq,'contentHash',v_course.content_hash,
    'graph',jsonb_build_object(
      'schemaVersion',1,
      'courses',jsonb_build_array(
        private.local_row('courses',to_jsonb(v_course))-array['createdAt','updatedAt','deletedAt','ownerId']
      ),
      'modules',private.camel_active_rows('public.modules',p_course_id),
      'lessons',private.camel_active_rows('public.lessons',p_course_id),
      'guides',private.camel_active_rows('public.course_guides',p_course_id),
      'guideItems',private.camel_active_rows('public.guide_items',p_course_id),
      'topics',private.camel_active_rows('public.lesson_topics',p_course_id),
      'topicStatements',private.camel_active_rows('public.topic_statements',p_course_id),
      'microsequences',private.camel_active_rows('public.microsequences',p_course_id),
      'dependencies',private.camel_active_rows('public.microsequence_dependencies',p_course_id),
      'microsequenceStatements',private.camel_active_rows('public.microsequence_statements',p_course_id),
      'cards',private.camel_active_rows('public.cards',p_course_id),
      'blocks',private.camel_active_rows('public.card_blocks',p_course_id),
      'options',private.camel_active_rows('public.block_options',p_course_id),
      'nodes',private.camel_active_rows('public.block_nodes',p_course_id),
      'flowNodes',private.camel_active_rows('public.flow_nodes',p_course_id),
      'flowCases',private.camel_active_rows('public.flow_cases',p_course_id),
      'flowPractices',private.camel_active_rows('public.flow_practices',p_course_id),
      'flowPracticeEntries',private.camel_active_rows('public.node_practices',p_course_id),
      'flowPracticeOptions',private.camel_active_rows('public.node_practice_items',p_course_id,'flowPracticeOptions'),
      'flowPracticeVariants',private.camel_active_rows('public.node_practice_items',p_course_id,'flowPracticeVariants'),
      'flowShapeOptions',private.camel_active_rows('public.node_practice_items',p_course_id,'flowShapeOptions'),
      'edges',private.camel_active_rows('public.block_edges',p_course_id),
      'matrixItems',private.camel_active_rows('public.block_matrix_items',p_course_id),
      'cells',private.camel_active_rows('public.block_cells',p_course_id),
      'points',private.camel_active_rows('public.block_points',p_course_id),
      'lines',private.camel_active_rows('public.block_lines',p_course_id),
      'highlights',private.camel_active_rows('public.block_highlights',p_course_id),
      'cardSources',private.camel_active_rows('public.card_refs',p_course_id,'cardSources'),
      'cardTopics',private.camel_active_rows('public.card_refs',p_course_id,'cardTopics')
    )
  );
end;
$$;

create or replace function public.bootstrap_replica(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid := auth.uid(); v_high_water bigint; v_snapshot jsonb; v_selected jsonb;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));
  select greatest(
    (select compacted_through_sequence from private.sync_retention_policy where singleton),
    coalesce(max(sequence),0)
  ) into v_high_water from private.sync_changes;
  insert into private.sync_devices(id,user_id,last_pulled_sequence,last_seen_at,inactive_at)
  values(p_device_id,v_user_id,v_high_water,now(),null)
  on conflict(user_id,id) do update set
    last_pulled_sequence=excluded.last_pulled_sequence,last_seen_at=now(),inactive_at=null;
  select jsonb_build_object(
    'courseSelections',coalesce((select jsonb_agg(private.selection_row(s.id) order by s.position,s.id)
      from public.user_course_selections s
      join public.courses c on c.id=s.course_id
      where s.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'lessonProgress',coalesce((select jsonb_agg(private.local_row('lessonProgress',to_jsonb(t)) order by t.id)
      from public.lesson_progress t
      join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id
      where t.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'cardProgress',coalesce((select jsonb_agg(private.local_row('cardProgress',to_jsonb(t)) order by t.id)
      from public.card_progress t
      join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id
      where t.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'comments',coalesce((select jsonb_agg(private.local_row('comments',to_jsonb(t)) order by t.id)
      from public.card_comments t
      join public.user_course_selections s on s.id=t.selection_id and s.user_id=t.user_id
      join public.courses c on c.id=s.course_id
      where t.user_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb),
    'studyPaths',coalesce((select jsonb_agg(private.jsonb_to_camel(to_jsonb(t)) order by t.position,t.id)
      from public.study_paths t where t.owner_id=v_user_id),'[]'::jsonb),
    'studyPathCourses',coalesce((select jsonb_agg(
        private.jsonb_to_camel(to_jsonb(t)) || jsonb_build_object('courseId',s.course_id)
        order by t.position,t.id)
      from public.study_path_courses t join public.user_course_selections s on s.id=t.selection_id
      join public.courses c on c.id=s.course_id
      where t.owner_id=v_user_id and c.status='published' and c.deleted_at is null),'[]'::jsonb)
  ) into v_snapshot;
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId',c.id,'publicationSeq',c.publication_seq,'contentHash',c.content_hash
  ) order by s.position,s.id),'[]'::jsonb) into v_selected
  from public.user_course_selections s join public.courses c on c.id=s.course_id
  where s.user_id=v_user_id and c.status='published' and c.deleted_at is null;
  return jsonb_build_object(
    'snapshot',v_snapshot,'selectedCourses',v_selected,'highWaterSequence',v_high_water
  );
end;
$$;

create or replace function public.pull_sync_changes(
  p_after_sequence bigint,
  p_limit integer default 500,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit,500),1),1000);
  v_high_water bigint;
  v_compacted_through bigint;
  v_changes jsonb;
  v_next bigint;
  v_has_more boolean;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;
  if coalesce(p_after_sequence,0) < 0 then raise exception 'Cursor inválido.' using errcode='22023'; end if;
  select compacted_through_sequence into v_compacted_through
    from private.sync_retention_policy where singleton;
  if coalesce(p_after_sequence,0)<coalesce(v_compacted_through,0) then
    raise exception 'Cursor anterior ao histórico retido; novo bootstrap é obrigatório.' using errcode='55000';
  end if;
  insert into private.sync_devices(id,user_id,last_seen_at,inactive_at)
  values(p_device_id,v_user_id,now(),null)
  on conflict(user_id,id) do update set last_seen_at=now(),inactive_at=null;
  select greatest(coalesce(v_compacted_through,0),coalesce(max(sequence),0))
    into v_high_water from private.sync_changes;
  with visible as (
    select ch.*,
      case when ch.entity_type='coursePublication' then s.id else ch.entity_id end as projected_id,
      case when ch.entity_type='coursePublication' then 'courseSelections' else ch.entity_type end as projected_type
    from private.sync_changes ch
    left join public.user_course_selections s
      on ch.entity_type='coursePublication' and s.course_id=ch.course_id and s.user_id=v_user_id
    where ch.sequence > coalesce(p_after_sequence,0)
      and ch.sequence <= v_high_water
      and (ch.audience_user_id=v_user_id or (ch.entity_type='coursePublication' and s.id is not null))
    order by ch.sequence limit v_limit
  ), materialized as (
    select visible.*,
      private.current_personal_row(projected_type,projected_id,v_user_id) as projected_row
    from visible
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sequence',sequence,'entityType',projected_type,'entityId',projected_id,
    'courseId',course_id,'operation',case when projected_row is null then 'delete' else 'upsert' end,
    'row',projected_row,
    'changedAt',changed_at
  ) order by sequence),'[]'::jsonb),coalesce(max(sequence),coalesce(p_after_sequence,0))
  into v_changes,v_next from materialized;
  select exists(
    select 1 from private.sync_changes ch
    left join public.user_course_selections s
      on ch.entity_type='coursePublication' and s.course_id=ch.course_id and s.user_id=v_user_id
    where ch.sequence>v_next and ch.sequence<=v_high_water
      and (ch.audience_user_id=v_user_id or (ch.entity_type='coursePublication' and s.id is not null))
  ) into v_has_more;
  if not v_has_more then v_next:=v_high_water; end if;
  update private.sync_devices set last_pulled_sequence=greatest(last_pulled_sequence,v_next),last_seen_at=now()
    where user_id=v_user_id and id=p_device_id;
  return jsonb_build_object(
    'changes',v_changes,'nextSequence',v_next,'highWaterSequence',v_high_water,
    'hasMore',v_has_more
  );
end;
$$;

create or replace function private.patch_field_selected(p_changed_fields jsonb, p_field text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(p_changed_fields) <> 'array'
    or exists(select 1 from jsonb_array_elements_text(p_changed_fields) value where value = p_field);
$$;

create or replace function public.apply_sync_batch(p_device_id uuid, p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb := case when jsonb_typeof(p_mutations)='array' then p_mutations else p_mutations->'mutations' end;
  v_mutation jsonb;
  v_mutation_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_course_id uuid;
  v_operation text;
  v_requested_operation text;
  v_payload jsonb;
  v_changed jsonb;
  v_allowed_fields text[];
  v_mutable_fields text[];
  v_hash text;
  v_existing private.sync_idempotency%rowtype;
  v_selection public.user_course_selections%rowtype;
  v_path_course public.study_path_courses%rowtype;
  v_path_id uuid;
  v_selection_id uuid;
  v_existing_selection_id uuid;
  v_existing_course_id uuid;
  v_existing_content_id uuid;
  v_row jsonb;
  v_sequence bigint;
  v_was_deleted boolean;
  v_client_sequence bigint;
  v_device_processed bigint;
  v_results jsonb := '[]'::jsonb;
  v_code text;
  v_message text;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode='42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' then raise exception 'Mutações devem ser array.' using errcode='22023'; end if;
  if jsonb_array_length(v_items) > 500 then raise exception 'Lote excede 500 mutações.' using errcode='22023'; end if;

  insert into private.sync_devices(id,user_id,last_seen_at,inactive_at)
  values(p_device_id,v_user_id,now(),null)
  on conflict(user_id,id) do update set last_seen_at=now(),inactive_at=null;
  select last_processed_mutation_sequence into v_device_processed
    from private.sync_devices where user_id=v_user_id and id=p_device_id for update;

  for v_mutation in select value from jsonb_array_elements(v_items) loop
    begin
      v_mutation_id:=null; v_entity_type:=null; v_entity_id:=null;
      v_course_id:=null; v_client_sequence:=null;
      v_mutation_id := private.try_uuid(v_mutation->>'mutationId');
      if coalesce(v_mutation->>'sequence','')~'^[0-9]+$' then
        v_client_sequence:=(v_mutation->>'sequence')::bigint;
      end if;
      v_entity_type := v_mutation->>'entityType';
      v_entity_id := private.try_uuid(v_mutation->>'entityId');
      v_course_id := private.try_uuid(v_mutation->>'courseId');
      v_requested_operation := lower(coalesce(v_mutation->>'operation',''));
      v_operation := v_requested_operation;
      v_payload := coalesce(v_mutation->'payload','{}'::jsonb);
      v_changed := coalesce(v_mutation->'changedFields','[]'::jsonb);
      if v_operation in ('insert','update') then v_operation := 'upsert'; end if;
      v_hash := encode(extensions.digest(convert_to(v_mutation::text,'UTF8'),'sha256'),'hex');

      -- A terminal result is part of the idempotency contract too.  Consult the
      -- ledger before validating the envelope again, otherwise a lost rejected
      -- response would be re-evaluated forever (or be mistaken for an applied
      -- mutation once the device watermark had advanced).
      if v_mutation_id is not null then
        perform pg_advisory_xact_lock(hashtextextended(
          'sync-mutation:'||v_user_id::text||':'||v_mutation_id::text,0
        ));
        select * into v_existing from private.sync_idempotency
          where user_id=v_user_id and mutation_id=v_mutation_id;
        if found then
          if v_existing.request_hash<>v_hash then
            raise exception 'mutationId reutilizado com payload incompatível.' using errcode='23514';
          end if;
          if v_existing.outcome='rejected' then
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status','rejected','mutationId',v_existing.mutation_id,
              'entityType',v_existing.entity_type,'entityId',v_existing.entity_id,
              'code',v_existing.error_code,'reason','invalid_mutation',
              'message',v_existing.error_message,'idempotent',true
            ));
          else
            v_row := private.current_personal_row(
              v_existing.entity_type,v_existing.entity_id,v_user_id
            );
            v_results := v_results || jsonb_build_array(jsonb_build_object(
              'status','applied','mutationId',v_existing.mutation_id,
              'entityType',v_existing.entity_type,'entityId',v_existing.entity_id,
              'operation',v_existing.operation,'idempotent',true,'row',v_row
            ));
          end if;
          if coalesce(v_client_sequence,0)>0 then
            v_device_processed:=greatest(v_device_processed,v_client_sequence);
            update private.sync_devices set last_processed_mutation_sequence=v_device_processed
              where user_id=v_user_id and id=p_device_id;
          end if;
          continue;
        end if;
      end if;

      if v_mutation_id is null or v_entity_id is null or coalesce(v_client_sequence,0)<=0
         or v_entity_type not in ('lessonProgress','cardProgress','comments','studyPaths','studyPathCourses')
         or v_operation not in ('upsert','delete') or jsonb_typeof(v_payload)<>'object'
         or jsonb_typeof(v_changed)<>'array'
         or exists(select 1 from jsonb_array_elements(v_changed) f where jsonb_typeof(f)<>'string') then
        raise exception 'Envelope de mutação inválido.' using errcode='22023';
      end if;
      v_mutable_fields:=case v_entity_type
        when 'lessonProgress' then array['cursor','firstViewedAt','completedAt','lastActivityAt']
        when 'cardProgress' then array['firstViewedAt','completedAt','attempts','lastResult','lastActivityAt']
        when 'comments' then array['body']
        when 'studyPaths' then array['title','position']
        when 'studyPathCourses' then array['pathId','selectionId','courseId','position']
      end;
      v_allowed_fields:=v_mutable_fields||case v_entity_type
        when 'lessonProgress' then array[
          'id','userId','courseId','selectionId','lessonId','moduleId',
          'courseKey','moduleKey','lessonKey','pathKey','createdAt','updatedAt','deletedAt'
        ]
        when 'cardProgress' then array[
          'id','userId','courseId','selectionId','moduleId','lessonId','microsequenceId',
          'lessonProgressId','cardId','courseKey','moduleKey','lessonKey','microsequenceKey',
          'pathKey','cardKey','position','createdAt','updatedAt','deletedAt'
        ]
        when 'comments' then array[
          'id','userId','courseId','selectionId','moduleId','lessonId','microsequenceId','cardId',
          'courseKey','moduleKey','lessonKey','microsequenceKey','cardKey',
          'createdAt','updatedAt','deletedAt'
        ]
        when 'studyPaths' then array['id','ownerId','createdAt','updatedAt','deletedAt']
        when 'studyPathCourses' then array['id','ownerId','createdAt','updatedAt','deletedAt']
      end;
      if exists(select 1 from jsonb_object_keys(v_payload) k where not(k=any(v_allowed_fields))) then
        raise exception 'Payload contém campo desconhecido para %.',v_entity_type using errcode='22023';
      end if;
      if exists(select 1 from jsonb_array_elements_text(v_changed) f
        where not(f=any(v_allowed_fields))) then
        raise exception 'changedFields contém campo desconhecido.' using errcode='22023';
      end if;
      if v_requested_operation='update' and exists(
        select 1 from jsonb_array_elements_text(v_changed) f
        where not(f=any(v_mutable_fields))
      ) then
        raise exception 'changedFields de update contém campo imutável.' using errcode='22023';
      end if;
      if v_requested_operation='update' then
        if jsonb_array_length(v_changed)=0 then
          raise exception 'Update exige changedFields.' using errcode='22023';
        end if;
        if exists(select 1 from jsonb_object_keys(v_payload) k
          where k=any(v_mutable_fields)
            and not exists(select 1 from jsonb_array_elements_text(v_changed) f where f=k))
          or exists(select 1 from jsonb_array_elements_text(v_changed) f where not(v_payload?f)) then
          raise exception 'Payload patch diverge de changedFields.' using errcode='22023';
        end if;
      elsif v_requested_operation='insert' then
        -- Deterministic entity IDs mean two offline devices may both believe a
        -- row is new.  If the second insert finds it already present, its full
        -- mutable state is the later LWW value.
        select coalesce(jsonb_agg(to_jsonb(field_name)),'[]'::jsonb) into v_changed
        from unnest(v_mutable_fields) field_name where v_payload?field_name;
      end if;
      if v_client_sequence<=v_device_processed then
        v_row:=private.current_personal_row(v_entity_type,v_entity_id,v_user_id);
        v_results:=v_results||jsonb_build_array(jsonb_build_object(
          'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
          'entityId',v_entity_id,'operation',v_operation,'idempotent',true,
          'deduplicatedByDeviceSequence',true,'row',v_row
        ));
        continue;
      end if;

      if v_operation='delete' then
        v_existing_selection_id:=null;
        v_existing_course_id:=null;
        v_existing_content_id:=null;
        if v_entity_type='lessonProgress' then
          select selection_id,course_id,lesson_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.lesson_progress where id=v_entity_id and user_id=v_user_id;
          if found and (
            (v_course_id is not null and v_existing_course_id<>v_course_id)
            or (private.try_uuid(v_payload->>'selectionId') is not null
              and v_existing_selection_id<>private.try_uuid(v_payload->>'selectionId'))
            or (private.try_uuid(v_payload->>'lessonId') is not null
              and v_existing_content_id<>private.try_uuid(v_payload->>'lessonId'))
          ) then raise exception 'Identidade imutável da entidade não corresponde ao envelope.' using errcode='23514'; end if;
          delete from public.lesson_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='cardProgress' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_progress where id=v_entity_id and user_id=v_user_id;
          if found and (
            (v_course_id is not null and v_existing_course_id<>v_course_id)
            or (private.try_uuid(v_payload->>'selectionId') is not null
              and v_existing_selection_id<>private.try_uuid(v_payload->>'selectionId'))
            or (private.try_uuid(v_payload->>'cardId') is not null
              and v_existing_content_id<>private.try_uuid(v_payload->>'cardId'))
          ) then raise exception 'Identidade imutável da entidade não corresponde ao envelope.' using errcode='23514'; end if;
          delete from public.card_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='comments' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_comments where id=v_entity_id and user_id=v_user_id;
          if found and (
            (v_course_id is not null and v_existing_course_id<>v_course_id)
            or (private.try_uuid(v_payload->>'selectionId') is not null
              and v_existing_selection_id<>private.try_uuid(v_payload->>'selectionId'))
            or (private.try_uuid(v_payload->>'cardId') is not null
              and v_existing_content_id<>private.try_uuid(v_payload->>'cardId'))
          ) then raise exception 'Identidade imutável da entidade não corresponde ao envelope.' using errcode='23514'; end if;
          delete from public.card_comments where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='studyPaths' then
          delete from public.study_paths where id=v_entity_id and owner_id=v_user_id;
        elsif v_entity_type='studyPathCourses' then
          delete from public.study_path_courses where id=v_entity_id and owner_id=v_user_id;
        end if;
        v_was_deleted:=found;
        select max(sequence) into v_sequence from private.sync_changes
          where audience_user_id=v_user_id and entity_type=v_entity_type and entity_id=v_entity_id;
        insert into private.sync_idempotency(
          user_id,mutation_id,request_hash,entity_type,entity_id,operation,
          device_id,client_sequence,applied_sequence
        ) values(v_user_id,v_mutation_id,v_hash,v_entity_type,v_entity_id,'delete',
          p_device_id,v_client_sequence,v_sequence);
        v_device_processed:=greatest(v_device_processed,v_client_sequence);
        update private.sync_devices set last_processed_mutation_sequence=v_device_processed
          where user_id=v_user_id and id=p_device_id;
        v_results:=v_results||jsonb_build_array(jsonb_build_object(
          'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
          'entityId',v_entity_id,'operation','delete','idempotent',not v_was_deleted,'row',null
        ));
        continue;
      end if;

      if v_entity_type in ('lessonProgress','cardProgress','comments') then
        v_selection_id := private.try_uuid(coalesce(v_payload->>'selectionId',v_payload->>'selection_id'));
        if v_selection_id is null then
          select id into v_selection_id from public.user_course_selections
          where user_id=v_user_id and course_id=v_course_id;
        end if;
        select * into v_selection from public.user_course_selections
          where id=v_selection_id and user_id=v_user_id;
        if not found or (v_course_id is not null and v_selection.course_id<>v_course_id) then
          raise exception 'Seleção de curso não autorizada.' using errcode='42501';
        end if;
        v_course_id := v_selection.course_id;

        -- An entity ID is stable across devices.  A stale or malformed envelope
        -- must never use a valid selection for course B to patch an existing
        -- row that actually belongs to course A in the same account.
        v_existing_selection_id:=null;
        v_existing_course_id:=null;
        v_existing_content_id:=null;
        if v_entity_type='lessonProgress' then
          select selection_id,course_id,lesson_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.lesson_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='cardProgress' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_progress where id=v_entity_id and user_id=v_user_id;
        elsif v_entity_type='comments' then
          select selection_id,course_id,card_id
            into v_existing_selection_id,v_existing_course_id,v_existing_content_id
            from public.card_comments where id=v_entity_id and user_id=v_user_id;
        end if;
        if v_existing_course_id is not null and (
          v_existing_selection_id<>v_selection.id or v_existing_course_id<>v_selection.course_id
          or (v_entity_type='lessonProgress' and private.try_uuid(v_payload->>'lessonId') is not null
            and v_existing_content_id<>private.try_uuid(v_payload->>'lessonId'))
          or (v_entity_type in ('cardProgress','comments') and private.try_uuid(v_payload->>'cardId') is not null
            and v_existing_content_id<>private.try_uuid(v_payload->>'cardId'))
        ) then
          raise exception 'Identidade imutável da entidade não corresponde à seleção.' using errcode='23514';
        end if;
      end if;

      if v_entity_type='lessonProgress' then
        if exists(select 1 from public.lesson_progress where id=v_entity_id and user_id=v_user_id) then
          update public.lesson_progress set
            cursor=case when private.patch_field_selected(v_changed,'cursor') and v_payload?'cursor'
              then (v_payload->>'cursor')::integer else cursor end,
            first_viewed_at=case when private.patch_field_selected(v_changed,'firstViewedAt') and v_payload?'firstViewedAt'
              then (v_payload->>'firstViewedAt')::timestamptz else first_viewed_at end,
            completed_at=case when private.patch_field_selected(v_changed,'completedAt') and v_payload?'completedAt'
              then (v_payload->>'completedAt')::timestamptz else completed_at end,
            last_activity_at=case when private.patch_field_selected(v_changed,'lastActivityAt') and v_payload?'lastActivityAt'
              then (v_payload->>'lastActivityAt')::timestamptz else last_activity_at end
          where id=v_entity_id and user_id=v_user_id;
        else
          insert into public.lesson_progress(
            id,selection_id,user_id,course_id,lesson_id,cursor,
            first_viewed_at,completed_at,last_activity_at
          ) values(
            v_entity_id,v_selection.id,v_user_id,v_selection.course_id,
            private.try_uuid(v_payload->>'lessonId'),(v_payload->>'cursor')::integer,
            (v_payload->>'firstViewedAt')::timestamptz,(v_payload->>'completedAt')::timestamptz,
            (v_payload->>'lastActivityAt')::timestamptz
          );
        end if;
      elsif v_entity_type='cardProgress' then
        if exists(select 1 from public.card_progress where id=v_entity_id and user_id=v_user_id) then
          update public.card_progress set
            first_viewed_at=case when private.patch_field_selected(v_changed,'firstViewedAt') and v_payload?'firstViewedAt'
              then (v_payload->>'firstViewedAt')::timestamptz else first_viewed_at end,
            completed_at=case when private.patch_field_selected(v_changed,'completedAt') and v_payload?'completedAt'
              then (v_payload->>'completedAt')::timestamptz else completed_at end,
            attempts=case when private.patch_field_selected(v_changed,'attempts') and v_payload?'attempts'
              then (v_payload->>'attempts')::integer else attempts end,
            last_result=case when private.patch_field_selected(v_changed,'lastResult') and v_payload?'lastResult'
              then v_payload->>'lastResult' else last_result end,
            last_activity_at=case when private.patch_field_selected(v_changed,'lastActivityAt') and v_payload?'lastActivityAt'
              then (v_payload->>'lastActivityAt')::timestamptz else last_activity_at end
          where id=v_entity_id and user_id=v_user_id;
        else
          insert into public.card_progress(
            id,selection_id,user_id,course_id,card_id,first_viewed_at,
            completed_at,attempts,last_result,last_activity_at
          ) values(
            v_entity_id,v_selection.id,v_user_id,v_selection.course_id,
            private.try_uuid(v_payload->>'cardId'),(v_payload->>'firstViewedAt')::timestamptz,
            (v_payload->>'completedAt')::timestamptz,coalesce((v_payload->>'attempts')::integer,0),
            v_payload->>'lastResult',(v_payload->>'lastActivityAt')::timestamptz
          );
        end if;
      elsif v_entity_type='comments' then
        if exists(select 1 from public.card_comments where id=v_entity_id and user_id=v_user_id) then
          update public.card_comments set body=case
            when private.patch_field_selected(v_changed,'body') and v_payload?'body' then v_payload->>'body'
            else body end
          where id=v_entity_id and user_id=v_user_id;
        else
          insert into public.card_comments(
            id,selection_id,user_id,course_id,card_id,body
          ) values(
            v_entity_id,v_selection.id,v_user_id,v_selection.course_id,
            private.try_uuid(v_payload->>'cardId'),v_payload->>'body'
          );
        end if;
      elsif v_entity_type='studyPaths' then
        if exists(select 1 from public.study_paths where id=v_entity_id and owner_id=v_user_id) then
          update public.study_paths set
            title=case when private.patch_field_selected(v_changed,'title') and v_payload?'title'
              then v_payload->>'title' else title end,
            position=case when private.patch_field_selected(v_changed,'position') and v_payload?'position'
              then (v_payload->>'position')::integer else position end
          where id=v_entity_id and owner_id=v_user_id;
        else
          insert into public.study_paths(id,owner_id,title,position)
          values(v_entity_id,v_user_id,v_payload->>'title',coalesce((v_payload->>'position')::integer,0));
        end if;
      elsif v_entity_type='studyPathCourses' then
        select * into v_path_course from public.study_path_courses
          where id=v_entity_id and owner_id=v_user_id;
        if found then
          v_path_id:=case when private.patch_field_selected(v_changed,'pathId') and v_payload?'pathId'
            then private.try_uuid(v_payload->>'pathId') else v_path_course.path_id end;
          v_selection_id:=case when private.patch_field_selected(v_changed,'selectionId')
              and v_payload?'selectionId' then private.try_uuid(v_payload->>'selectionId')
            else v_path_course.selection_id end;
          if private.patch_field_selected(v_changed,'courseId') and v_payload?'courseId'
             and not(v_payload?'selectionId') then
            select id into v_selection_id from public.user_course_selections
            where user_id=v_user_id and course_id=private.try_uuid(v_payload->>'courseId');
          end if;
        else
          v_path_id:=private.try_uuid(v_payload->>'pathId');
          v_selection_id:=private.try_uuid(v_payload->>'selectionId');
          if v_selection_id is null and private.try_uuid(v_payload->>'courseId') is not null then
            select id into v_selection_id from public.user_course_selections
            where user_id=v_user_id and course_id=private.try_uuid(v_payload->>'courseId');
          end if;
        end if;
        if not exists(select 1 from public.study_paths where id=v_path_id and owner_id=v_user_id)
           or not exists(select 1 from public.user_course_selections where id=v_selection_id and user_id=v_user_id) then
          raise exception 'Trilha ou seleção não autorizada.' using errcode='42501';
        end if;
        if v_path_course.id is not null then
          update public.study_path_courses set
            path_id=case when private.patch_field_selected(v_changed,'pathId') and v_payload?'pathId'
              then v_path_id else path_id end,
            selection_id=case when (private.patch_field_selected(v_changed,'selectionId')
              or private.patch_field_selected(v_changed,'courseId'))
              and (v_payload?'selectionId' or v_payload?'courseId') then v_selection_id else selection_id end,
            position=case when private.patch_field_selected(v_changed,'position') and v_payload?'position'
              then (v_payload->>'position')::integer else position end
          where id=v_entity_id and owner_id=v_user_id;
        else
          insert into public.study_path_courses(id,path_id,owner_id,selection_id,position)
          values(v_entity_id,v_path_id,v_user_id,v_selection_id,coalesce((v_payload->>'position')::integer,0));
        end if;
      end if;

      select max(sequence) into v_sequence from private.sync_changes
      where audience_user_id=v_user_id and entity_type=v_entity_type and entity_id=v_entity_id;
      insert into private.sync_idempotency(
        user_id,mutation_id,request_hash,entity_type,entity_id,operation,
        device_id,client_sequence,applied_sequence
      ) values(v_user_id,v_mutation_id,v_hash,v_entity_type,v_entity_id,v_operation,
        p_device_id,v_client_sequence,v_sequence);
      v_device_processed:=greatest(v_device_processed,v_client_sequence);
      update private.sync_devices set last_processed_mutation_sequence=v_device_processed
        where user_id=v_user_id and id=p_device_id;
      v_row:=private.current_personal_row(v_entity_type,v_entity_id,v_user_id);
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'status','applied','mutationId',v_mutation_id,'entityType',v_entity_type,
        'entityId',v_entity_id,'operation',v_operation,'idempotent',false,'row',v_row
      ));
    exception when others then
      get stacked diagnostics v_code=returned_sqlstate,v_message=message_text;
      -- Convert only deterministic client/data failures into a terminal
      -- rejection.  Unknown SQLSTATEs are treated as service defects or
      -- infrastructure failures and roll the whole RPC back, so the outbox can
      -- retry safely instead of losing a valid offline mutation.
      if left(v_code,2) not in ('22','23') and v_code <> '42501' then
        raise;
      end if;
      if v_mutation_id is not null and coalesce(v_client_sequence,0)>0 then
        insert into private.sync_idempotency(
          user_id,mutation_id,request_hash,entity_type,entity_id,operation,
          device_id,client_sequence,outcome,error_code,error_message
        ) values(
          v_user_id,v_mutation_id,v_hash,coalesce(v_entity_type,'invalid'),v_entity_id,
          case when v_operation in ('upsert','delete') then v_operation else 'upsert' end,
          p_device_id,v_client_sequence,'rejected',v_code,coalesce(v_message,'Mutação rejeitada.')
        ) on conflict do nothing;
      end if;
      if coalesce(v_client_sequence,0)>0 then
        v_device_processed:=greatest(v_device_processed,v_client_sequence);
        update private.sync_devices set last_processed_mutation_sequence=v_device_processed
          where user_id=v_user_id and id=p_device_id;
      end if;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'status','rejected','mutationId',v_mutation->>'mutationId','entityType',v_mutation->>'entityType',
        'entityId',v_mutation->>'entityId','code',v_code,'reason','invalid_mutation','message',v_message
      ));
    end;
  end loop;
  return jsonb_build_object('status','applied','results',v_results);
end;
$$;

drop function if exists public.import_official_course(jsonb, boolean) cascade;

create table private.official_catalog_imports(
  import_id uuid primary key,
  course_id uuid not null unique,
  contract_key text not null unique,
  course_payload jsonb not null,
  source_hash text not null,
  expected_counts jsonb not null,
  publish_requested boolean not null default true,
  status text not null default 'staging',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint official_catalog_imports_course_object check(jsonb_typeof(course_payload)='object'),
  constraint official_catalog_imports_hash check(source_hash ~ '^[0-9a-f]{64}$'),
  constraint official_catalog_imports_counts check(jsonb_typeof(expected_counts)='object'),
  constraint official_catalog_imports_status check(status in ('staging','draft','published'))
);

create table private.official_catalog_import_chunks(
  import_id uuid not null references private.official_catalog_imports(import_id) on delete cascade,
  store_name text not null,
  chunk_index integer not null,
  row_count integer not null,
  payload_hash text not null,
  applied_at timestamptz not null default now(),
  primary key(import_id,store_name,chunk_index),
  constraint official_catalog_import_chunks_index check(chunk_index>=0),
  constraint official_catalog_import_chunks_count check(row_count>0),
  constraint official_catalog_import_chunks_hash check(payload_hash ~ '^[0-9a-f]{64}$')
);

create table private.official_catalog_import_stage_rows(
  import_id uuid not null references private.official_catalog_imports(import_id) on delete cascade,
  store_name text not null,
  entity_id uuid not null,
  payload jsonb not null,
  payload_hash text not null,
  primary key(import_id,store_name,entity_id),
  constraint official_catalog_import_stage_payload check(jsonb_typeof(payload)='object'),
  constraint official_catalog_import_stage_hash check(payload_hash ~ '^[0-9a-f]{64}$')
);

create or replace function private.release_empty_official_import_staging()
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,private,public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Liberação de staging exige administração.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  lock table private.official_catalog_import_stage_rows,
    private.official_catalog_import_chunks in access exclusive mode;
  if exists(select 1 from private.official_catalog_import_stage_rows limit 1)
     or exists(select 1 from private.official_catalog_import_chunks limit 1) then
    return false;
  end if;
  truncate table private.official_catalog_import_stage_rows,
    private.official_catalog_import_chunks;
  return true;
end;
$$;

create or replace function private.official_import_store_names()
returns text[]
language sql
immutable
set search_path=pg_catalog
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
set search_path=pg_catalog,private
as $$
declare v_store text; v_value jsonb;
begin
  if jsonb_typeof(p_expected_counts)<>'object' then raise exception 'Manifesto inválido.' using errcode='22023'; end if;
  foreach v_store in array private.official_import_store_names() loop
    v_value:=p_expected_counts->v_store;
    if jsonb_typeof(v_value)<>'number' or (v_value#>>'{}')!~'^\d+$'
       or (v_value#>>'{}')::numeric>2147483647 then
      raise exception 'Contagem inválida no manifesto para %.',v_store using errcode='22023';
    end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(p_expected_counts) k
    where not (k=any(private.official_import_store_names()))) then
    raise exception 'Manifesto contém store desconhecida.' using errcode='22023';
  end if;
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
set search_path=pg_catalog,public,private,auth
set statement_timeout='30s'
as $$
declare
  v_course_id uuid:=private.try_uuid(p_course->>'id');
  v_contract_key text:=nullif(btrim(p_course->>'contractKey'),'');
  v_existing private.official_catalog_imports%rowtype;
  v_live public.courses%rowtype;
begin
  if not public.is_app_admin() then raise exception 'Importação oficial exige administrador.' using errcode='42501'; end if;
  if p_import_id is null or jsonb_typeof(p_course)<>'object' or v_course_id is null
     or v_contract_key is null or coalesce(p_source_hash,'')!~'^[0-9a-f]{64}$' then
    raise exception 'Identidade ou curso inválido para importação oficial.' using errcode='22023';
  end if;
  perform private.assert_official_import_manifest(p_expected_counts);
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  perform pg_advisory_xact_lock(hashtextextended('official-import:'||v_contract_key,0));

  select * into v_existing from private.official_catalog_imports where import_id=p_import_id for update;
  if found then
    if v_existing.course_id<>v_course_id or v_existing.contract_key<>v_contract_key
       or v_existing.source_hash<>p_source_hash or v_existing.expected_counts<>p_expected_counts
       or v_existing.publish_requested<>p_publish then
      raise exception 'importId reutilizado com manifesto incompatível.' using errcode='23514';
    end if;
    return jsonb_build_object('status',v_existing.status,'importId',p_import_id,
      'courseId',v_course_id,'idempotent',true,'contentHash',v_existing.source_hash);
  end if;

  select * into v_existing from private.official_catalog_imports
    where contract_key=v_contract_key for update;
  if found and v_existing.status='published' and v_existing.source_hash=p_source_hash then
    return jsonb_build_object('status','published','importId',v_existing.import_id,
      'courseId',v_existing.course_id,'idempotent',true,'contentHash',v_existing.source_hash);
  end if;
  if found then delete from private.official_catalog_imports where import_id=v_existing.import_id; end if;

  select * into v_live from public.courses
  where contract_key=v_contract_key and deleted_at is null for update;
  if found and v_live.id<>v_course_id then
    raise exception 'O UUID canônico do curso publicado não pode mudar.' using errcode='23514';
  end if;
  if found and v_live.status='published' and not coalesce(p_publish,false) then
    raise exception 'Draft não pode substituir uma publicação ativa.' using errcode='23514';
  end if;
  insert into private.official_catalog_imports(
    import_id,course_id,contract_key,course_payload,source_hash,expected_counts,publish_requested
  ) values(p_import_id,v_course_id,v_contract_key,p_course,p_source_hash,p_expected_counts,p_publish);
  return jsonb_build_object('status','staging','importId',p_import_id,
    'courseId',v_course_id,'idempotent',false);
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
set search_path=pg_catalog,public,private,auth,extensions
set statement_timeout='30s'
as $$
declare
  v_import private.official_catalog_imports%rowtype;
  v_chunk private.official_catalog_import_chunks%rowtype;
  v_row jsonb; v_id uuid; v_count integer; v_hash text; v_row_hash text; v_applied integer;
begin
  if not public.is_app_admin() then raise exception 'Importação oficial exige administrador.' using errcode='42501'; end if;
  if p_store_name is null or not(p_store_name=any(private.official_import_store_names()))
     or p_chunk_index is null or p_chunk_index<0 or jsonb_typeof(p_rows)<>'array'
     or jsonb_array_length(p_rows)=0 then
    raise exception 'Chunk de importação oficial inválido.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  v_count:=jsonb_array_length(p_rows);
  v_hash:=encode(extensions.digest(convert_to(p_rows::text,'UTF8'),'sha256'),'hex');
  select * into v_import from private.official_catalog_imports where import_id=p_import_id for update;
  if not found or v_import.status<>'staging' then raise exception 'Importação oficial não está em staging.' using errcode='23514'; end if;
  select * into v_chunk from private.official_catalog_import_chunks
    where import_id=p_import_id and store_name=p_store_name and chunk_index=p_chunk_index;
  if found then
    if v_chunk.payload_hash<>v_hash or v_chunk.row_count<>v_count then
      raise exception 'Chunk reutilizado com payload incompatível.' using errcode='23514';
    end if;
    return jsonb_build_object('status','applied','importId',p_import_id,'storeName',p_store_name,
      'chunkIndex',p_chunk_index,'rowCount',v_count,'idempotent',true);
  end if;
  select coalesce(sum(row_count),0)::integer into v_applied from private.official_catalog_import_chunks
    where import_id=p_import_id and store_name=p_store_name;
  if v_applied+v_count>(v_import.expected_counts->>p_store_name)::integer then
    raise exception 'Chunks excedem o manifesto de %.',p_store_name using errcode='23514';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_id:=private.try_uuid(v_row->>'id');
    if v_id is null or private.try_uuid(v_row->>'courseId') is distinct from v_import.course_id then
      raise exception 'Linha inválida ou pertencente a outro curso em %.',p_store_name using errcode='23514';
    end if;
    v_row_hash:=encode(extensions.digest(convert_to(v_row::text,'UTF8'),'sha256'),'hex');
    if exists(
      select 1 from private.official_catalog_import_stage_rows s
      where s.import_id=p_import_id and s.store_name=p_store_name and s.entity_id=v_id
        and s.payload_hash<>v_row_hash
    ) then
      raise exception 'A entidade %/% foi reutilizada com payload incompatível.',p_store_name,v_id
        using errcode='23514';
    end if;
    insert into private.official_catalog_import_stage_rows(import_id,store_name,entity_id,payload,payload_hash)
    values(p_import_id,p_store_name,v_id,v_row,v_row_hash)
    on conflict(import_id,store_name,entity_id) do nothing;
  end loop;
  insert into private.official_catalog_import_chunks(import_id,store_name,chunk_index,row_count,payload_hash)
    values(p_import_id,p_store_name,p_chunk_index,v_count,v_hash);
  update private.official_catalog_imports set updated_at=now() where import_id=p_import_id;
  return jsonb_build_object('status','applied','importId',p_import_id,'storeName',p_store_name,
    'chunkIndex',p_chunk_index,'rowCount',v_count,'idempotent',false);
end;
$$;

create or replace function public.begin_official_course_import_flow(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare v_import private.official_catalog_imports%rowtype; v_nodes integer; v_cases integer;
begin
  if not public.is_app_admin() then raise exception 'Importação oficial exige administrador.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  select * into v_import from private.official_catalog_imports where import_id=p_import_id;
  if not found or v_import.status<>'staging' then raise exception 'Staging oficial de flow indisponível.' using errcode='23514'; end if;
  select count(*) into v_nodes from private.official_catalog_import_stage_rows
    where import_id=p_import_id and store_name='flowNodes';
  select count(*) into v_cases from private.official_catalog_import_stage_rows
    where import_id=p_import_id and store_name='flowCases';
  return jsonb_build_object(
    'status',case when v_nodes=(v_import.expected_counts->>'flowNodes')::integer
      and v_cases=(v_import.expected_counts->>'flowCases')::integer then 'complete' else 'staging' end,
    'importId',p_import_id,'nodeCount',v_nodes,'caseCount',v_cases,
    'idempotent',v_nodes>0 or v_cases>0
  );
end;
$$;

create or replace function public.apply_official_course_import_flow_chunk(
  p_import_id uuid,p_chunk_index integer,p_nodes jsonb,p_cases jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
as $$
declare v_node_result jsonb; v_case_result jsonb; v_block_id uuid;
begin
  if jsonb_typeof(p_nodes)<>'array' or jsonb_array_length(p_nodes)=0
     or jsonb_typeof(p_cases)<>'array' then
    raise exception 'Chunk de flow oficial inválido.' using errcode='22023';
  end if;
  v_block_id:=private.try_uuid(p_nodes->0->>'blockId');
  if v_block_id is null or exists(select 1 from jsonb_array_elements(p_nodes) n
    where private.try_uuid(n->>'blockId')<>v_block_id)
    or exists(select 1 from jsonb_array_elements(p_cases) c
    where private.try_uuid(c->>'blockId')<>v_block_id) then
    raise exception 'Chunk de flow deve conter um único bloco.' using errcode='23514';
  end if;
  v_node_result:=public.apply_official_course_import_chunk(p_import_id,'flowNodes',p_chunk_index,p_nodes);
  if jsonb_array_length(p_cases)>0 then
    v_case_result:=public.apply_official_course_import_chunk(p_import_id,'flowCases',p_chunk_index,p_cases);
  end if;
  return jsonb_build_object('status','applied','importId',p_import_id,'chunkIndex',p_chunk_index,
    'blockId',v_block_id,'nodeCount',jsonb_array_length(p_nodes),'caseCount',jsonb_array_length(p_cases),
    'idempotent',coalesce((v_node_result->>'idempotent')::boolean,false)
      and (v_case_result is null or coalesce((v_case_result->>'idempotent')::boolean,false)));
end;
$$;

create or replace function private.apply_official_stage_row(
  p_store_name text,
  p_course_id uuid,
  p_entity_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_table regclass:=private.table_for_store(p_store_name);
  v_payload jsonb:=private.shape_store_payload(
    p_store_name,private.jsonb_to_snake(coalesce(p_payload,'{}'::jsonb)),'insert'
  );
  v_current_course uuid;
  v_exists boolean;
  v_columns text;
  v_expressions text;
  v_returned jsonb;
begin
  if not public.is_app_admin() or v_table is null
     or not(p_store_name=any(private.official_import_store_names()))
     or p_course_id is null or p_entity_id is null then
    raise exception 'Materialização oficial não autorizada ou inválida.' using errcode='42501';
  end if;
  if private.try_uuid(p_payload->>'id') is distinct from p_entity_id
     or private.try_uuid(p_payload->>'courseId') is distinct from p_course_id then
    raise exception 'Identidade canônica divergente na linha oficial.' using errcode='23514';
  end if;
  execute format('select true,course_id from %s where id=$1',v_table)
    into v_exists,v_current_course using p_entity_id;
  if coalesce(v_exists,false) and v_current_course<>p_course_id then
    raise exception 'UUID canônico já pertence a outro curso.' using errcode='23514';
  end if;
  v_payload:=v_payload||jsonb_build_object('id',p_entity_id,'course_id',p_course_id);
  v_payload:=v_payload-array[
    'source_entity_id','revision','created_at','updated_at','deleted_at'
  ];
  if coalesce(v_exists,false) then
    v_payload:=v_payload-array['id','course_id'];
  end if;
  select
    string_agg(format('%I',a.attname),',' order by a.attnum),
    string_agg(case when v_payload?a.attname then format('populated.%I',a.attname)
      else 'null' end,',' order by a.attnum)
  into v_columns,v_expressions
  from pg_attribute a
  where a.attrelid=v_table and a.attnum>0 and not a.attisdropped
    and (v_payload?a.attname or (
      coalesce(v_exists,false) and not a.attnotnull and a.attname not in ('id','course_id')
    ));
  if v_columns is null then raise exception 'Linha oficial sem campos persistíveis.' using errcode='22023'; end if;
  if coalesce(v_exists,false) then
    execute format(
      'update %s target set (%s)=(select %s from jsonb_populate_record(null::%s,$1) populated) '
      'where target.id=$2 returning to_jsonb(target)',v_table,v_columns,v_expressions,v_table
    ) into v_returned using v_payload,p_entity_id;
  else
    execute format(
      'insert into %s as inserted (%s) select %s from jsonb_populate_record(null::%s,$1) populated '
      'returning to_jsonb(inserted)',v_table,v_columns,v_expressions,v_table
    ) into v_returned using v_payload;
  end if;
  return private.local_row(p_store_name,v_returned);
end;
$$;

create or replace function private.prepare_official_course_replacement(
  p_import_id uuid,
  p_course_id uuid
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_table_name text;
  v_position_floor constant bigint:=1000000000;
begin
  if not public.is_app_admin() or p_import_id is null or p_course_id is null then
    raise exception 'Preparação de publicação oficial não autorizada ou inválida.' using errcode='42501';
  end if;
  if not exists(
    select 1 from private.official_catalog_imports i
    where i.import_id=p_import_id and i.course_id=p_course_id and i.status='staging'
  ) then
    raise exception 'Importação oficial em staging não corresponde ao curso.' using errcode='23514';
  end if;
  if exists(
    select 1 from private.official_catalog_import_stage_rows s
    where s.import_id=p_import_id
      and s.store_name in ('modules','lessons','microsequences','cards')
      and (
        coalesce(s.payload->>'contractKey','') like '__aralearn_stage_%'
        or case
          when coalesce(s.payload->>'position','')~'^\d+$'
            then (s.payload->>'position')::numeric>=v_position_floor
          else true
        end
      )
  ) then
    raise exception 'Chave ou posição canônica usa a faixa reservada da publicação.' using errcode='23514';
  end if;

  -- Only modules, lessons, microsequences and cards carry user progress.  Every
  -- other didactic row is a catalog projection and can be rebuilt hard inside
  -- this invisible transaction.  Child-first deletion also frees partial and
  -- expression unique indexes (correct option, primary block, guide owner,
  -- coordinates and references) before the new snapshot is inserted.
  foreach v_table_name in array array[
    'card_refs','block_highlights','block_lines','block_points','block_cells',
    'block_matrix_items','block_edges','node_practice_items','node_practices',
    'flow_practices','flow_cases','flow_nodes','block_nodes','block_options',
    'card_blocks','microsequence_statements','microsequence_dependencies',
    'topic_statements','lesson_topics','guide_items','course_guides'
  ] loop
    execute format('delete from public.%I where course_id=$1',v_table_name)
      using p_course_id;
  end loop;

  -- Vacate every immediate natural-key/position invariant of progress-bearing
  -- rows.  Final positions are bounded below the reserved range above, so an
  -- insertion at the beginning, an arbitrary swap and a parent move cannot
  -- collide with the still-live snapshot while rows are applied by UUID.
  foreach v_table_name in array array['modules','lessons','microsequences','cards'] loop
    execute format($sql$
      with displaced as (
        select id,
          (1000000000::bigint+row_number() over(order by id))::integer as temporary_position,
          '__aralearn_stage_'||replace(id::text,'-','') as temporary_key
        from public.%I where course_id=$1
      )
      update public.%I target set
        position=displaced.temporary_position,
        contract_key=displaced.temporary_key
      from displaced where target.id=displaced.id
    $sql$,v_table_name,v_table_name) using p_course_id;
  end loop;
end;
$$;

create or replace function public.validate_course_graph(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare v_errors jsonb:='[]'::jsonb; v_course public.courses%rowtype;
begin
  if not public.is_app_admin() then raise exception 'Validação oficial exige administrador.' using errcode='42501'; end if;
  select * into v_course from public.courses where id=p_course_id;
  if not found then
    return jsonb_build_object('valid',false,'publishable',false,'courseId',p_course_id,
      'errors',jsonb_build_array(jsonb_build_object('code','course.missing','path','$.course')));
  end if;
  if not exists(select 1 from public.modules where course_id=p_course_id) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','course.modules.empty','path','$.modules'));
  end if;
  if not exists(select 1 from public.lessons where course_id=p_course_id) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','course.lessons.empty','path','$.lessons'));
  end if;
  if not exists(select 1 from public.microsequences where course_id=p_course_id) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','course.microsequences.empty','path','$.microsequences'));
  end if;
  if not exists(select 1 from public.cards where course_id=p_course_id) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','course.cards.empty','path','$.cards'));
  end if;
  if exists(select 1 from public.microsequences where course_id=p_course_id and status<>'ready') then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object(
      'code','microsequence.not_ready','path','$.microsequences',
      'message','Publicação exige todas as microssequências em ready.'
    ));
  end if;
  if exists(select 1 from public.modules where course_id=p_course_id group by position having count(*)>1) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','module.position.duplicate','path','$.modules'));
  end if;
  if exists(select 1 from public.lessons where course_id=p_course_id group by module_id,position having count(*)>1) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','lesson.position.duplicate','path','$.lessons'));
  end if;
  if exists(select 1 from public.microsequences where course_id=p_course_id group by lesson_id,position having count(*)>1) then
    v_errors:=v_errors||jsonb_build_array(jsonb_build_object('code','microsequence.position.duplicate','path','$.microsequences'));
  end if;
  return jsonb_build_object(
    'valid',jsonb_array_length(v_errors)=0,'publishable',jsonb_array_length(v_errors)=0,
    'courseId',p_course_id,'contentHash',v_course.content_hash,'errors',v_errors
  );
end;
$$;

create or replace function private.reconcile_official_course_progress(p_course_id uuid)
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare v_updated integer:=0;
begin
  -- card_progress is the granular source of truth.  lesson_progress is only a
  -- compact summary for startup and must follow the current canonical order
  -- whenever publication adds, removes or reorders cards.
  with ordered as (
    select
      lp.id as progress_id,
      row_number() over(
        partition by lp.id order by ms.position,c.position,c.id
      ) as card_number,
      cp.completed_at
    from public.lesson_progress lp
    join public.microsequences ms
      on ms.course_id=lp.course_id and ms.lesson_id=lp.lesson_id
    join public.cards c
      on c.course_id=lp.course_id and c.lesson_id=lp.lesson_id
      and c.microsequence_id=ms.id
    left join public.card_progress cp
      on cp.selection_id=lp.selection_id and cp.card_id=c.id
      and cp.completed_at is not null
    where lp.course_id=p_course_id
  ), stats as (
    select
      progress_id,
      count(*)::integer as total_cards,
      coalesce(
        min(card_number) filter(where completed_at is null)-1,
        count(*)
      )::integer as contiguous_completed,
      max(completed_at) as last_completed_at
    from ordered group by progress_id
  ), desired as (
    select
      lp.id,
      coalesce(s.contiguous_completed,0)-1 as cursor,
      case
        when coalesce(s.total_cards,0)>0
          and s.contiguous_completed=s.total_cards
        then coalesce(lp.completed_at,s.last_completed_at)
        else null
      end as completed_at
    from public.lesson_progress lp
    left join stats s on s.progress_id=lp.id
    where lp.course_id=p_course_id
  )
  update public.lesson_progress lp set
    cursor=d.cursor,
    completed_at=d.completed_at
  from desired d
  where lp.id=d.id
    and (lp.cursor is distinct from d.cursor
      or lp.completed_at is distinct from d.completed_at);
  get diagnostics v_updated=row_count;
  return v_updated;
end;
$$;

create or replace function public.finalize_official_course_import(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
set statement_timeout='0'
as $$
declare
  v_import private.official_catalog_imports%rowtype;
  v_store text; v_expected integer; v_staged integer; v_row record;
  v_table regclass; v_result jsonb; v_validation jsonb;
  v_staging_truncated boolean:=false;
  v_table_name text; v_stores text[];
  v_delete_tables text[]:=array[
    'card_refs','block_highlights','block_lines','block_points','block_cells','block_matrix_items',
    'block_edges','node_practice_items','node_practices','flow_practices','flow_cases','flow_nodes',
    'block_nodes','block_options','card_blocks','cards','microsequence_statements',
    'microsequence_dependencies','microsequences','topic_statements','lesson_topics','guide_items',
    'course_guides','lessons','modules'
  ];
begin
  if not public.is_app_admin() then raise exception 'Importação oficial exige administrador.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  select * into v_import from private.official_catalog_imports where import_id=p_import_id for update;
  if not found then raise exception 'Importação oficial não encontrada.' using errcode='22023'; end if;
  if v_import.status in ('draft','published') then
    v_staging_truncated:=private.release_empty_official_import_staging();
    return jsonb_build_object('status',v_import.status,'importId',p_import_id,'courseId',v_import.course_id,
      'contentHash',v_import.source_hash,'stagingTruncated',v_staging_truncated,'idempotent',true);
  end if;
  foreach v_store in array private.official_import_store_names() loop
    v_expected:=(v_import.expected_counts->>v_store)::integer;
    select count(*)::integer into v_staged from private.official_catalog_import_stage_rows
      where import_id=p_import_id and store_name=v_store;
    if v_staged<>v_expected then
      raise exception 'Importação incompleta em %: % de % linhas.',v_store,v_staged,v_expected using errcode='23514';
    end if;
  end loop;

  if not v_import.publish_requested and exists(
    select 1 from public.courses c
    where c.id=v_import.course_id
      and c.status='published' and c.deleted_at is null
  ) then
    raise exception 'Draft não pode substituir uma publicação ativa.' using errcode='23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('official-publication:'||v_import.course_id::text,0));
  perform set_config('aralearn.suppress_sync_changes','on',true);
  perform set_config('aralearn.suppress_course_dirty','on',true);
  set constraints all deferred;
  if exists(select 1 from public.courses where id=v_import.course_id) then
    update public.courses set
      contract_key=v_import.course_payload->>'contractKey',
      title=v_import.course_payload->>'title',goal=v_import.course_payload->>'goal',
      contract_scope=v_import.course_payload->>'contractScope',
      project_id=private.try_uuid(v_import.course_payload->>'projectId'),
      position=coalesce((v_import.course_payload->>'position')::integer,0),deleted_at=null
    where id=v_import.course_id;
  else
    insert into public.courses(
      id,status,contract_key,title,goal,contract_scope,project_id,position
    ) values(
      v_import.course_id,'draft',v_import.course_payload->>'contractKey',
      v_import.course_payload->>'title',v_import.course_payload->>'goal',
      v_import.course_payload->>'contractScope',
      private.try_uuid(v_import.course_payload->>'projectId'),
      coalesce((v_import.course_payload->>'position')::integer,0)
    );
  end if;

  perform private.prepare_official_course_replacement(p_import_id,v_import.course_id);

  foreach v_store in array private.official_import_store_names() loop
    v_table:=private.table_for_store(v_store);
    for v_row in select entity_id,payload from private.official_catalog_import_stage_rows
      where import_id=p_import_id and store_name=v_store order by entity_id
    loop
      v_result:=private.apply_official_stage_row(
        v_store,v_import.course_id,v_row.entity_id,v_row.payload
      );
      if v_result is null then raise exception 'Falha atômica ao materializar %/%',v_store,v_row.entity_id using errcode='23514'; end if;
    end loop;
  end loop;

  -- Content tables have no feed trigger.  Re-enable the personal feed before
  -- hard-deleting stale canonical rows so cascaded progress/comment removals
  -- reach every affected replica.
  perform set_config('aralearn.suppress_sync_changes','off',true);
  foreach v_table_name in array v_delete_tables loop
    v_stores:=case v_table_name
      when 'course_guides' then array['guides'] when 'guide_items' then array['guideItems']
      when 'lesson_topics' then array['topics'] when 'topic_statements' then array['topicStatements']
      when 'microsequence_dependencies' then array['dependencies']
      when 'microsequence_statements' then array['microsequenceStatements']
      when 'card_blocks' then array['blocks'] when 'block_options' then array['options']
      when 'block_nodes' then array['nodes'] when 'flow_nodes' then array['flowNodes']
      when 'flow_cases' then array['flowCases'] when 'flow_practices' then array['flowPractices']
      when 'node_practices' then array['flowPracticeEntries']
      when 'node_practice_items' then array['flowPracticeOptions','flowPracticeVariants','flowShapeOptions']
      when 'block_edges' then array['edges'] when 'block_matrix_items' then array['matrixItems']
      when 'block_cells' then array['cells'] when 'block_points' then array['points']
      when 'block_lines' then array['lines'] when 'block_highlights' then array['highlights']
      when 'card_refs' then array['cardSources','cardTopics']
      else array[v_table_name] end;
    execute format(
      'delete from public.%I t where t.course_id=$1 and not exists ('||
      'select 1 from private.official_catalog_import_stage_rows s '
      'where s.import_id=$2 and s.store_name=any($3) and s.entity_id=t.id)',v_table_name
    ) using v_import.course_id,p_import_id,v_stores;
  end loop;

  perform private.reconcile_official_course_progress(v_import.course_id);

  v_validation:=public.validate_course_graph(v_import.course_id);
  if not coalesce((v_validation->>'valid')::boolean,false) then
    raise exception 'Curso importado é inválido: %',v_validation->'errors' using errcode='23514';
  end if;
  if v_import.publish_requested then
    update public.courses set status='published',publication_seq=case
      when content_hash is distinct from v_import.source_hash then publication_seq+1 else publication_seq end,
      content_hash=v_import.source_hash
    where id=v_import.course_id;
  end if;
  update private.official_catalog_imports set
    status=case when publish_requested then 'published' else 'draft' end,
    updated_at=now(),completed_at=now()
  where import_id=p_import_id;
  delete from private.official_catalog_import_stage_rows where import_id=p_import_id;
  delete from private.official_catalog_import_chunks where import_id=p_import_id;
  v_staging_truncated:=private.release_empty_official_import_staging();
  return jsonb_build_object(
    'status',case when v_import.publish_requested then 'published' else 'draft' end,
    'importId',p_import_id,'courseId',v_import.course_id,'validation',v_validation,
    'contentHash',v_import.source_hash,'publication',jsonb_build_object(
      'status',case when v_import.publish_requested then 'published' else 'draft' end,
      'courseId',v_import.course_id,'contentHash',v_import.source_hash,
      'publicationSeq',(select publication_seq from public.courses where id=v_import.course_id)
    ),'stagingTruncated',v_staging_truncated,'idempotent',false
  );
end;
$$;

create or replace function private.safe_sync_watermark(p_now timestamptz default now())
returns bigint
language sql
stable
security definer
set search_path=pg_catalog,private
as $$
  with policy as (
    select device_inactive_after,compacted_through_sequence
      from private.sync_retention_policy where singleton
  ), active as (
    select d.last_pulled_sequence from private.sync_devices d cross join policy p
    where d.inactive_at is null and d.last_seen_at>=p_now-p.device_inactive_after
  )
  select greatest(
    (select compacted_through_sequence from policy),
    coalesce((select min(last_pulled_sequence) from active),
      (select coalesce(max(sequence),0) from private.sync_changes))
  );
$$;

create or replace function public.sync_storage_diagnostics()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,private,public
as $$
declare v_policy private.sync_retention_policy%rowtype;
begin
  if not public.is_app_admin() then raise exception 'Diagnóstico exige administração.' using errcode='42501'; end if;
  select * into v_policy from private.sync_retention_policy where singleton;
  return jsonb_build_object(
    'safeWatermark',private.safe_sync_watermark(now()),
    'compactedThroughSequence',v_policy.compacted_through_sequence,
    'activeDevices',(select count(*) from private.sync_devices d where d.inactive_at is null
      and d.last_seen_at>=now()-v_policy.device_inactive_after),
    'inactiveDevices',(select count(*) from private.sync_devices d where d.inactive_at is not null
      or d.last_seen_at<now()-v_policy.device_inactive_after),
    'changeRows',(select count(*) from private.sync_changes),
    'idempotencyRows',(select count(*) from private.sync_idempotency),
    'changeBytes',pg_total_relation_size('private.sync_changes'::regclass),
    'idempotencyBytes',pg_total_relation_size('private.sync_idempotency'::regclass),
    'stagingImports',(select count(*) from private.official_catalog_imports where status='staging'),
    'stagingRows',(select count(*) from private.official_catalog_import_stage_rows),
    'stagingChunks',(select count(*) from private.official_catalog_import_chunks),
    'stagingBytes',
      pg_total_relation_size('private.official_catalog_imports'::regclass)
      +pg_total_relation_size('private.official_catalog_import_stage_rows'::regclass)
      +pg_total_relation_size('private.official_catalog_import_chunks'::regclass)
  );
end;
$$;

create or replace function public.compact_sync_history(
  p_dry_run boolean default true,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,private,public
as $$
declare
  v_policy private.sync_retention_policy%rowtype; v_watermark bigint; v_compact_through bigint;
  v_stale bigint; v_change_candidates bigint; v_ledger_candidates bigint;
  v_deleted_changes bigint:=0; v_deleted_ledger bigint:=0;
begin
  if not public.is_app_admin() then raise exception 'Compactação exige administração.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order',0));
  select * into v_policy from private.sync_retention_policy where singleton for update;
  select count(*) into v_stale from private.sync_devices d
    where d.inactive_at is null and d.last_seen_at<p_now-v_policy.device_inactive_after;
  if not p_dry_run then
    update private.sync_devices set inactive_at=p_now
      where inactive_at is null and last_seen_at<p_now-v_policy.device_inactive_after;
  end if;
  select coalesce(min(d.last_pulled_sequence) filter(where d.inactive_at is null
      and d.last_seen_at>=p_now-v_policy.device_inactive_after),
      (select coalesce(max(sequence),0) from private.sync_changes))
    into v_watermark from private.sync_devices d;
  -- Compact only a contiguous, retained prefix.  Persisting its upper bound is
  -- essential even when the delete empties the feed completely.
  select least(v_watermark,coalesce(min(c.sequence)-1,v_watermark))
    into v_compact_through
    from private.sync_changes c
    where c.sequence<=v_watermark
      and c.changed_at>=p_now-v_policy.minimum_retention;
  v_compact_through:=greatest(v_policy.compacted_through_sequence,coalesce(v_compact_through,0));
  select count(*) into v_change_candidates from private.sync_changes c
    where c.sequence<=v_compact_through;
  select count(*) into v_ledger_candidates from private.sync_idempotency i
    where i.applied_at<p_now-v_policy.idempotency_retention
      and (i.applied_sequence is null or i.applied_sequence<=v_compact_through);
  if not p_dry_run then
    delete from private.sync_changes c
      where c.sequence<=v_compact_through;
    get diagnostics v_deleted_changes=row_count;
    update private.sync_retention_policy set
      compacted_through_sequence=v_compact_through,updated_at=p_now
      where singleton;
    -- Selection RPCs intentionally have no device_id, but their mutation IDs
    -- must not grow forever.  The same configured retention applies to every
    -- ledger row; an entry tied to a feed sequence remains protected until that
    -- sequence is itself below the safe compacted watermark.
    delete from private.sync_idempotency i
      where i.applied_at<p_now-v_policy.idempotency_retention
        and (i.applied_sequence is null or i.applied_sequence<=v_compact_through);
    get diagnostics v_deleted_ledger=row_count;
  end if;
  return jsonb_build_object(
    'dryRun',p_dry_run,'safeWatermark',v_watermark,
    'compactedThroughSequence',v_compact_through,'staleDevices',v_stale,
    'changeCandidates',v_change_candidates,'idempotencyCandidates',v_ledger_candidates,
    'deletedChanges',v_deleted_changes,'deletedIdempotency',v_deleted_ledger,
    'tombstonesDeletedWithoutWatermark',0
  );
end;
$$;

create or replace function public.cleanup_abandoned_official_imports(
  p_dry_run boolean default true,
  p_older_than interval default interval '7 days',
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,private,public
as $$
declare
  v_imports bigint; v_rows bigint; v_chunks bigint; v_deleted bigint:=0;
  v_staging_truncated boolean:=false;
begin
  if not public.is_app_admin() then
    raise exception 'Limpeza de staging exige administração.' using errcode='42501';
  end if;
  if p_older_than is null or p_older_than<=interval '0 seconds' or p_now is null then
    raise exception 'Retenção de staging inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-official-import-staging',0));
  perform pg_advisory_xact_lock(hashtextextended('official-import-cleanup',0));
  select count(*) into v_imports from private.official_catalog_imports i
    where i.status='staging' and i.updated_at<p_now-p_older_than;
  select count(*) into v_rows from private.official_catalog_import_stage_rows s
    join private.official_catalog_imports i on i.import_id=s.import_id
    where i.status='staging' and i.updated_at<p_now-p_older_than;
  select count(*) into v_chunks from private.official_catalog_import_chunks c
    join private.official_catalog_imports i on i.import_id=c.import_id
    where i.status='staging' and i.updated_at<p_now-p_older_than;
  if not p_dry_run then
    delete from private.official_catalog_imports i
      where i.status='staging' and i.updated_at<p_now-p_older_than;
    get diagnostics v_deleted=row_count;
    v_staging_truncated:=private.release_empty_official_import_staging();
  end if;
  return jsonb_build_object(
    'dryRun',p_dry_run,'olderThan',p_older_than::text,
    'candidateImports',v_imports,'candidateRows',v_rows,'candidateChunks',v_chunks,
    'deletedImports',v_deleted,'stagingTruncated',v_staging_truncated
  );
end;
$$;

comment on function public.cleanup_abandoned_official_imports(boolean,interval,timestamptz) is
  'Remove somente staging incompleto e inativo; nunca toca drafts concluídos ou publicações live.';

create or replace function public.delete_own_account(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth
set statement_timeout='60s'
as $$
declare v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
  if p_confirmation is distinct from 'EXCLUIR' then raise exception 'Confirmação inválida.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete:'||v_user_id::text,0));
  perform set_config('aralearn.suppress_sync_changes','on',true);
  delete from auth.users u where u.id=v_user_id;
  if not found then raise exception 'Conta não encontrada.' using errcode='P0002'; end if;
  return jsonb_build_object('status','deleted','userId',v_user_id);
end;
$$;

comment on function public.select_catalog_course(uuid,uuid) is
  'Seleciona um curso oficial compartilhado sem clonar sua árvore.';
comment on function public.unselect_catalog_course(uuid,uuid) is
  'Remove a seleção e o estado pessoal associado, sem alterar o catálogo.';
comment on function public.apply_sync_batch(uuid,jsonb) is
  'Aplica estado pessoal por last-write-wins; não usa baseRevision nem gera conflitos autorais.';
comment on function public.get_selected_course_graph(uuid) is
  'Entrega a árvore oficial canônica somente para uma seleção da conta autenticada.';

do $$
declare v_table text;
begin
  alter table public.courses enable row level security;
  alter table public.courses force row level security;
  drop policy if exists courses_select on public.courses;
  drop policy if exists courses_insert on public.courses;
  drop policy if exists courses_update on public.courses;
  drop policy if exists courses_delete on public.courses;
  create policy courses_select on public.courses for select to authenticated
    using(public.user_can_read_course(id) or public.is_app_admin());
  create policy courses_insert on public.courses for insert to authenticated
    with check(public.is_app_admin());
  create policy courses_update on public.courses for update to authenticated
    using(public.is_app_admin())
    with check(public.is_app_admin());
  create policy courses_delete on public.courses for delete to authenticated
    using(public.is_app_admin());

  foreach v_table in array array[
    'modules','lessons','course_guides','guide_items','lesson_topics','topic_statements',
    'microsequences','microsequence_dependencies','microsequence_statements','cards',
    'card_blocks','block_options','block_nodes','flow_nodes','flow_cases','flow_practices',
    'node_practices','node_practice_items','block_edges','block_matrix_items','block_cells',
    'block_points','block_lines','block_highlights','card_refs'
  ] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('alter table public.%I force row level security',v_table);
    execute format('drop policy if exists %I_select on public.%I',v_table,v_table);
    execute format('drop policy if exists %I_insert on public.%I',v_table,v_table);
    execute format('drop policy if exists %I_update on public.%I',v_table,v_table);
    execute format('drop policy if exists %I_delete on public.%I',v_table,v_table);
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      'using(public.user_can_read_course(course_id) or public.is_app_admin())',v_table,v_table
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated '
      'with check(public.is_app_admin())',v_table,v_table
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated '
      'using(public.is_app_admin()) '
      'with check(public.is_app_admin())',v_table,v_table
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated '
      'using(public.is_app_admin())',v_table,v_table
    );
  end loop;
end;
$$;

-- Least privilege is applied after every function is created: PostgreSQL gives
-- new functions EXECUTE to PUBLIC by default, so the final revoke is mandatory.
revoke all privileges on all functions in schema public from public,anon,authenticated,service_role;
revoke all privileges on all functions in schema private from public,anon,authenticated,service_role;

grant execute on function public.list_catalog_collections(text) to authenticated;
grant execute on function public.list_user_course_summaries() to authenticated;
grant execute on function public.select_catalog_course(uuid,uuid) to authenticated;
grant execute on function public.unselect_catalog_course(uuid,uuid) to authenticated;
grant execute on function public.get_selected_course_graph(uuid) to authenticated;
grant execute on function public.bootstrap_replica(uuid) to authenticated;
grant execute on function public.apply_sync_batch(uuid,jsonb) to authenticated;
grant execute on function public.pull_sync_changes(bigint,integer,uuid) to authenticated;
grant execute on function public.delete_own_account(text) to authenticated;

grant execute on function public.begin_official_course_import(uuid,jsonb,text,jsonb,boolean) to service_role;
grant execute on function public.apply_official_course_import_chunk(uuid,text,integer,jsonb) to service_role;
grant execute on function public.begin_official_course_import_flow(uuid) to service_role;
grant execute on function public.apply_official_course_import_flow_chunk(uuid,integer,jsonb,jsonb) to service_role;
grant execute on function public.finalize_official_course_import(uuid) to service_role;
grant execute on function public.sync_storage_diagnostics() to service_role;
grant execute on function public.compact_sync_history(boolean,timestamptz) to service_role;
grant execute on function public.cleanup_abandoned_official_imports(boolean,interval,timestamptz)
  to service_role;

commit;
