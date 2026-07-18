begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.course_kind as enum ('official', 'personal');
create type public.course_status as enum ('draft', 'published', 'active', 'archived');
create type public.membership_role as enum ('owner', 'editor', 'learner');
create type public.microsequence_role as enum ('explain', 'practice', 'review', 'support');
create type public.microsequence_status as enum ('planned', 'generated', 'needs_review', 'ready');
create type public.topic_kind as enum ('concept', 'procedure', 'representation', 'term');
create type public.card_resource as enum (
  'paragraph', 'choice', 'composite', 'code', 'table', 'flow',
  'tree', 'graph', 'relation_map', 'matrix', 'plane'
);
create type public.card_kind as enum ('theory', 'exercise');
create type public.exercise_kind as enum ('none', 'gap', 'choice');
create type public.block_role as enum ('primary', 'composite', 'after');
create type public.sync_mutation_status as enum ('applied', 'conflict', 'rejected');

create table private.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete restrict,
  kind public.course_kind not null,
  status public.course_status not null,
  source_course_id uuid references public.courses(id) on delete restrict,
  source_entity_id uuid references public.courses(id) on delete restrict,
  source_publication_seq bigint,
  source_content_hash text,
  baseline_content_hash text,
  contract_key text not null,
  title text not null,
  goal text not null,
  contract_scope text,
  publication_seq bigint not null default 0,
  content_hash text,
  personalized_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, kind),
  constraint courses_contract_key_not_blank check (btrim(contract_key) <> ''),
  constraint courses_title_not_blank check (btrim(title) <> ''),
  constraint courses_goal_not_blank check (btrim(goal) <> ''),
  constraint courses_contract_scope_not_blank check (
    contract_scope is null or btrim(contract_scope) <> ''
  ),
  constraint courses_revision_positive check (revision > 0),
  constraint courses_publication_nonnegative check (publication_seq >= 0),
  constraint courses_hash_format check (
    (content_hash is null or content_hash ~ '^[0-9a-f]{64}$') and
    (source_content_hash is null or source_content_hash ~ '^[0-9a-f]{64}$') and
    (baseline_content_hash is null or baseline_content_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint courses_kind_owner check (
    (kind = 'official' and owner_id is null and status in ('draft', 'published', 'archived')) or
    (kind = 'personal' and owner_id is not null and status in ('active', 'archived'))
  ),
  constraint courses_source_consistent check (
    (source_course_id is null and source_entity_id is null and source_publication_seq is null
      and source_content_hash is null and baseline_content_hash is null) or
    (kind = 'personal' and source_course_id is not null and source_entity_id = source_course_id and
      source_publication_seq is not null and source_content_hash is not null
      and baseline_content_hash is not null)
  )
);

create unique index courses_official_contract_key_uidx
  on public.courses (contract_key)
  where kind = 'official' and deleted_at is null;
create index courses_owner_idx on public.courses (owner_id, deleted_at, updated_at desc);
create index courses_catalog_idx on public.courses (kind, status, deleted_at, publication_seq desc);
create index courses_source_idx on public.courses (source_course_id, source_publication_seq);
create unique index courses_personal_owner_contract_key_uidx
  on public.courses (owner_id, contract_key)
  where kind = 'personal' and deleted_at is null;

create table public.course_memberships (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint course_memberships_position_nonnegative check (position >= 0),
  constraint course_memberships_revision_positive check (revision > 0)
);

create unique index course_memberships_active_uidx
  on public.course_memberships (course_id, user_id)
  where deleted_at is null;
create index course_memberships_user_idx
  on public.course_memberships (user_id, deleted_at, position);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  source_entity_id uuid references public.modules(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  title text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint modules_key_not_blank check (btrim(contract_key) <> ''),
  constraint modules_title_not_blank check (btrim(title) <> ''),
  constraint modules_position_nonnegative check (position >= 0),
  constraint modules_revision_positive check (revision > 0)
);

create unique index modules_active_key_uidx on public.modules (course_id, contract_key) where deleted_at is null;
create index modules_active_position_idx on public.modules (course_id, position) where deleted_at is null;
create index modules_source_idx on public.modules (source_entity_id);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid not null,
  source_entity_id uuid references public.lessons(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  title text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, module_id, id),
  constraint lessons_module_fk foreign key (course_id, module_id)
    references public.modules(course_id, id) on delete cascade,
  constraint lessons_key_not_blank check (btrim(contract_key) <> ''),
  constraint lessons_title_not_blank check (btrim(title) <> ''),
  constraint lessons_position_nonnegative check (position >= 0),
  constraint lessons_revision_positive check (revision > 0)
);

create unique index lessons_active_key_uidx on public.lessons (module_id, contract_key) where deleted_at is null;
create index lessons_active_position_idx on public.lessons (module_id, position) where deleted_at is null;
create index lessons_course_idx on public.lessons (course_id, deleted_at, updated_at desc);
create index lessons_source_idx on public.lessons (source_entity_id);

create table public.course_guides (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid,
  lesson_id uuid,
  source_entity_id uuid references public.course_guides(id) on delete restrict,
  goal text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint course_guides_module_fk foreign key (course_id, module_id)
    references public.modules(course_id, id) on delete cascade,
  constraint course_guides_lesson_fk foreign key (course_id, lesson_id)
    references public.lessons(course_id, id) on delete cascade,
  constraint course_guides_single_owner check ((module_id is null) <> (lesson_id is null)),
  constraint course_guides_goal_not_blank check (btrim(goal) <> ''),
  constraint course_guides_revision_positive check (revision > 0)
);

create unique index course_guides_active_module_uidx on public.course_guides (module_id) where module_id is not null and deleted_at is null;
create unique index course_guides_active_lesson_uidx on public.course_guides (lesson_id) where lesson_id is not null and deleted_at is null;
create index course_guides_course_idx on public.course_guides (course_id, deleted_at);

create table public.guide_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  guide_id uuid not null,
  source_entity_id uuid references public.guide_items(id) on delete restrict,
  item_kind text not null,
  position integer not null,
  value text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint guide_items_guide_fk foreign key (course_id, guide_id)
    references public.course_guides(course_id, id) on delete cascade,
  constraint guide_items_kind check (item_kind in ('include', 'exclude', 'notation', 'avoid')),
  constraint guide_items_position_nonnegative check (position >= 0),
  constraint guide_items_value_not_blank check (btrim(value) <> ''),
  constraint guide_items_revision_positive check (revision > 0)
);

create index guide_items_active_position_idx on public.guide_items (guide_id, item_kind, position) where deleted_at is null;
create unique index guide_items_active_value_uidx on public.guide_items (guide_id, item_kind, lower(value)) where deleted_at is null;
create index guide_items_course_idx on public.guide_items (course_id, deleted_at);

create table public.lesson_topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null,
  source_entity_id uuid references public.lesson_topics(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  label text not null,
  kind public.topic_kind not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint lesson_topics_lesson_fk foreign key (course_id, lesson_id)
    references public.lessons(course_id, id) on delete cascade,
  constraint lesson_topics_key_not_blank check (btrim(contract_key) <> ''),
  constraint lesson_topics_label_not_blank check (btrim(label) <> ''),
  constraint lesson_topics_position_nonnegative check (position >= 0),
  constraint lesson_topics_revision_positive check (revision > 0)
);

create unique index lesson_topics_active_key_uidx on public.lesson_topics (lesson_id, contract_key) where deleted_at is null;
create index lesson_topics_active_position_idx on public.lesson_topics (lesson_id, position) where deleted_at is null;

create table public.topic_statements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  topic_id uuid not null,
  source_entity_id uuid references public.topic_statements(id) on delete restrict,
  statement_kind text not null,
  position integer not null,
  value text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint topic_statements_topic_fk foreign key (course_id, topic_id)
    references public.lesson_topics(course_id, id) on delete cascade,
  constraint topic_statements_kind check (statement_kind in ('check', 'error')),
  constraint topic_statements_position_nonnegative check (position >= 0),
  constraint topic_statements_value_not_blank check (btrim(value) <> ''),
  constraint topic_statements_revision_positive check (revision > 0)
);

create index topic_statements_active_position_idx
  on public.topic_statements (topic_id, statement_kind, position) where deleted_at is null;

create table public.microsequences (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null,
  branch_of_id uuid,
  source_entity_id uuid references public.microsequences(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  title text not null,
  goal text not null,
  role public.microsequence_role not null,
  status public.microsequence_status not null,
  cards_revision bigint not null default 1,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, lesson_id, id),
  constraint microsequences_lesson_fk foreign key (course_id, lesson_id)
    references public.lessons(course_id, id) on delete cascade,
  constraint microsequences_branch_fk foreign key (course_id, lesson_id, branch_of_id)
    references public.microsequences(course_id, lesson_id, id) on delete restrict deferrable initially deferred,
  constraint microsequences_key_not_blank check (btrim(contract_key) <> ''),
  constraint microsequences_title_not_blank check (btrim(title) <> ''),
  constraint microsequences_goal_not_blank check (btrim(goal) <> ''),
  constraint microsequences_not_self_branch check (branch_of_id is null or branch_of_id <> id),
  constraint microsequences_position_nonnegative check (position >= 0),
  constraint microsequences_cards_revision_positive check (cards_revision > 0),
  constraint microsequences_revision_positive check (revision > 0)
);

create unique index microsequences_active_key_uidx on public.microsequences (lesson_id, contract_key) where deleted_at is null;
create index microsequences_active_position_idx on public.microsequences (lesson_id, position) where deleted_at is null;
create index microsequences_course_idx on public.microsequences (course_id, deleted_at, updated_at desc);
create index microsequences_source_idx on public.microsequences (source_entity_id);

create table public.microsequence_dependencies (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  lesson_id uuid not null,
  microsequence_id uuid not null,
  depends_on_microsequence_id uuid not null,
  source_entity_id uuid references public.microsequence_dependencies(id) on delete restrict,
  position integer not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint microsequence_dependencies_source_fk foreign key (course_id, lesson_id, microsequence_id)
    references public.microsequences(course_id, lesson_id, id) on delete cascade,
  constraint microsequence_dependencies_target_fk foreign key (course_id, lesson_id, depends_on_microsequence_id)
    references public.microsequences(course_id, lesson_id, id) on delete restrict,
  constraint microsequence_dependencies_not_self check (microsequence_id <> depends_on_microsequence_id),
  constraint microsequence_dependencies_position_nonnegative check (position >= 0),
  constraint microsequence_dependencies_revision_positive check (revision > 0)
);

create unique index microsequence_dependencies_active_pair_uidx
  on public.microsequence_dependencies (microsequence_id, depends_on_microsequence_id) where deleted_at is null;
create index microsequence_dependencies_active_position_idx
  on public.microsequence_dependencies (microsequence_id, position) where deleted_at is null;

create table public.microsequence_statements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  microsequence_id uuid not null,
  source_entity_id uuid references public.microsequence_statements(id) on delete restrict,
  statement_kind text not null,
  position integer not null,
  value text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint microsequence_statements_microsequence_fk foreign key (course_id, microsequence_id)
    references public.microsequences(course_id, id) on delete cascade,
  constraint microsequence_statements_kind check (statement_kind in ('cover', 'check', 'error')),
  constraint microsequence_statements_position_nonnegative check (position >= 0),
  constraint microsequence_statements_value_not_blank check (btrim(value) <> ''),
  constraint microsequence_statements_revision_positive check (revision > 0)
);

create index microsequence_statements_active_position_idx
  on public.microsequence_statements (microsequence_id, statement_kind, position) where deleted_at is null;

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  microsequence_id uuid not null,
  source_entity_id uuid references public.cards(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  resource public.card_resource not null,
  kind public.card_kind not null,
  exercise public.exercise_kind not null,
  title text not null,
  after_text text not null default '',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint cards_microsequence_fk foreign key (course_id, microsequence_id)
    references public.microsequences(course_id, id) on delete cascade,
  constraint cards_key_not_blank check (btrim(contract_key) <> ''),
  constraint cards_title_not_blank check (btrim(title) <> ''),
  constraint cards_position_positive check (position > 0),
  constraint cards_shape check (
    (kind = 'theory' and exercise = 'none') or
    (kind = 'exercise' and exercise in ('gap', 'choice'))
  ),
  constraint cards_resource_exercise check (
    (resource = 'choice' and kind = 'exercise' and exercise = 'choice') or resource <> 'choice'
  ),
  constraint cards_revision_positive check (revision > 0)
);

create index cards_active_position_idx on public.cards (microsequence_id, position) where deleted_at is null;
create index cards_course_idx on public.cards (course_id, deleted_at, updated_at desc);
create index cards_source_idx on public.cards (source_entity_id);

create table public.card_blocks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  card_id uuid not null,
  parent_block_id uuid,
  source_entity_id uuid references public.card_blocks(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  role public.block_role not null,
  block_type text not null,
  value_text text,
  prompt text,
  language text,
  code text,
  question text,
  name text,
  divider_after_column integer,
  scale_factor numeric,
  result_text text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, card_id, id),
  constraint card_blocks_card_fk foreign key (course_id, card_id)
    references public.cards(course_id, id) on delete cascade,
  constraint card_blocks_parent_fk foreign key (course_id, card_id, parent_block_id)
    references public.card_blocks(course_id, card_id, id) on delete cascade deferrable initially deferred,
  constraint card_blocks_key_not_blank check (btrim(contract_key) <> ''),
  constraint card_blocks_type check (block_type in (
    'heading', 'paragraph', 'choice', 'composite', 'code', 'table', 'flow',
    'tree', 'graph', 'relation_map', 'matrix', 'plane'
  )),
  constraint card_blocks_position_nonnegative check (position >= 0),
  constraint card_blocks_divider_nonnegative check (divider_after_column is null or divider_after_column >= 0),
  constraint card_blocks_parent_role check (
    (role = 'composite' and parent_block_id is not null) or
    (role in ('primary', 'after') and parent_block_id is null)
  ),
  constraint card_blocks_text_shape check (
    block_type not in ('heading', 'paragraph') or (value_text is not null and btrim(value_text) <> '')
  ),
  constraint card_blocks_code_shape check (
    block_type <> 'code' or
    (prompt is not null and btrim(prompt) <> '' and language is not null and btrim(language) <> '' and
      code is not null and btrim(code) <> '')
  ),
  constraint card_blocks_revision_positive check (revision > 0)
);

create unique index card_blocks_active_key_uidx on public.card_blocks (course_id, contract_key) where deleted_at is null;
create index card_blocks_active_position_idx
  on public.card_blocks (card_id, role, position) where deleted_at is null;
create unique index card_blocks_one_primary_uidx
  on public.card_blocks (card_id) where role = 'primary' and deleted_at is null;
create index card_blocks_course_idx on public.card_blocks (course_id, deleted_at, updated_at desc);
create index card_blocks_source_idx on public.card_blocks (source_entity_id);

create table public.block_options (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  source_entity_id uuid references public.block_options(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  option_kind text not null default 'text',
  text_value text,
  language text,
  code text,
  is_correct boolean not null default false,
  enabled boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint block_options_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint block_options_key_not_blank check (btrim(contract_key) <> ''),
  constraint block_options_kind check (option_kind in ('text', 'code')),
  constraint block_options_content check (
    (option_kind = 'text' and text_value is not null and btrim(text_value) <> '' and code is null) or
    (option_kind = 'code' and language is not null and btrim(language) <> '' and code is not null and btrim(code) <> '')
  ),
  constraint block_options_position_nonnegative check (position >= 0),
  constraint block_options_revision_positive check (revision > 0)
);

create unique index block_options_active_key_uidx on public.block_options (block_id, contract_key) where deleted_at is null;
create index block_options_active_position_idx on public.block_options (block_id, position) where deleted_at is null;
create unique index block_options_one_correct_uidx on public.block_options (block_id) where is_correct and deleted_at is null;
create index block_options_course_idx on public.block_options (course_id, deleted_at);

create table public.block_nodes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  parent_node_id uuid,
  source_entity_id uuid references public.block_nodes(id) on delete restrict,
  identity_key text,
  contract_key text not null,
  position integer not null,
  node_scope text not null,
  parent_contract_key text,
  node_kind text not null,
  label text,
  x numeric,
  y numeric,
  has_x boolean not null default false,
  has_y boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, block_id, id),
  constraint block_nodes_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint block_nodes_parent_fk foreign key (course_id, block_id, parent_node_id)
    references public.block_nodes(course_id, block_id, id) on delete cascade deferrable initially deferred,
  constraint block_nodes_key_not_blank check (btrim(contract_key) <> ''),
  constraint block_nodes_scope check (
    node_scope in ('tree','graph','relation_left','relation_right')
  ),
  constraint block_nodes_kind check (
    (node_scope = 'tree' and node_kind in ('folder','file')) or
    (node_scope = 'graph' and node_kind = 'vertex') or
    (node_scope in ('relation_left','relation_right') and node_kind = 'set_item')
  ),
  constraint block_nodes_coordinates check (
    has_x = (x is not null) and has_y = (y is not null)
  ),
  constraint block_nodes_position_nonnegative check (position >= 0),
  constraint block_nodes_revision_positive check (revision > 0)
);

create unique index block_nodes_active_key_uidx on public.block_nodes (block_id, contract_key) where deleted_at is null;
create index block_nodes_active_position_idx
  on public.block_nodes (block_id, parent_node_id, node_scope, position) where deleted_at is null;
create index block_nodes_course_idx on public.block_nodes (course_id, deleted_at);
create index block_nodes_source_idx on public.block_nodes (source_entity_id);

create table public.block_edges (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  from_node_id uuid not null,
  to_node_id uuid not null,
  source_entity_id uuid references public.block_edges(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  edge_role text not null,
  label text,
  weight text,
  directed boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint block_edges_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint block_edges_from_fk foreign key (course_id, block_id, from_node_id)
    references public.block_nodes(course_id, block_id, id) on delete restrict,
  constraint block_edges_to_fk foreign key (course_id, block_id, to_node_id)
    references public.block_nodes(course_id, block_id, id) on delete restrict,
  constraint block_edges_key_not_blank check (btrim(contract_key) <> ''),
  constraint block_edges_role check (edge_role in ('graph', 'relation')),
  constraint block_edges_position_nonnegative check (position >= 0),
  constraint block_edges_revision_positive check (revision > 0)
);

create unique index block_edges_active_key_uidx on public.block_edges (block_id, contract_key) where deleted_at is null;
create index block_edges_active_position_idx on public.block_edges (block_id, position) where deleted_at is null;
create index block_edges_course_idx on public.block_edges (course_id, deleted_at);

create table public.block_matrix_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  source_entity_id uuid references public.block_matrix_items(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  item_kind text not null,
  name text,
  connector text,
  divider_after_column integer,
  row_count integer not null,
  column_count integer not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, block_id, id),
  constraint block_matrix_items_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint block_matrix_items_key_not_blank check (btrim(contract_key) <> ''),
  constraint block_matrix_items_kind check (item_kind in ('table', 'matrix', 'sequence', 'pair_list', 'relation_table')),
  constraint block_matrix_items_position_nonnegative check (position >= 0),
  constraint block_matrix_items_dimensions_positive check (row_count > 0 and column_count > 0),
  constraint block_matrix_items_divider_valid check (
    divider_after_column is null or (divider_after_column >= 0 and divider_after_column < column_count)
  ),
  constraint block_matrix_items_revision_positive check (revision > 0)
);

create unique index block_matrix_items_active_key_uidx
  on public.block_matrix_items (block_id, contract_key) where deleted_at is null;
create index block_matrix_items_active_position_idx
  on public.block_matrix_items (block_id, position) where deleted_at is null;

create table public.block_cells (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  matrix_item_id uuid not null,
  source_entity_id uuid references public.block_cells(id) on delete restrict,
  row_index integer not null,
  column_index integer not null,
  cell_role text not null default 'value',
  text_value text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint block_cells_matrix_item_fk foreign key (course_id, matrix_item_id)
    references public.block_matrix_items(course_id, id) on delete cascade,
  constraint block_cells_indexes_nonnegative check (row_index >= 0 and column_index >= 0),
  constraint block_cells_role check (cell_role in ('header', 'value')),
  constraint block_cells_revision_positive check (revision > 0)
);

create unique index block_cells_active_coordinate_uidx
  on public.block_cells (matrix_item_id, row_index, column_index) where deleted_at is null;
create index block_cells_course_idx on public.block_cells (course_id, deleted_at);

create table public.block_points (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  source_entity_id uuid references public.block_points(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  point_kind text not null,
  group_index integer,
  x numeric not null,
  y numeric not null,
  label text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint block_points_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint block_points_key_not_blank check (btrim(contract_key) <> ''),
  constraint block_points_kind check (point_kind in (
    'x', 'y', 'vector', 'vectors', 'sum', 'distance', 'scale_vector', 'result'
  )),
  constraint block_points_position_nonnegative check (position >= 0),
  constraint block_points_group_nonnegative check (group_index is null or group_index >= 0),
  constraint block_points_revision_positive check (revision > 0)
);

create unique index block_points_active_key_uidx on public.block_points (block_id, contract_key) where deleted_at is null;
create index block_points_active_position_idx
  on public.block_points (block_id, point_kind, position) where deleted_at is null;

create table public.block_lines (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  source_entity_id uuid references public.block_lines(id) on delete restrict,
  contract_key text not null,
  position integer not null,
  line_kind text not null default 'segment',
  x1 numeric not null,
  y1 numeric not null,
  x2 numeric not null,
  y2 numeric not null,
  label text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint block_lines_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint block_lines_key_not_blank check (btrim(contract_key) <> ''),
  constraint block_lines_kind check (line_kind in ('segment', 'vector', 'distance', 'axis')),
  constraint block_lines_position_nonnegative check (position >= 0),
  constraint block_lines_revision_positive check (revision > 0)
);

create unique index block_lines_active_key_uidx on public.block_lines (block_id, contract_key) where deleted_at is null;
create index block_lines_active_position_idx on public.block_lines (block_id, position) where deleted_at is null;

create table public.block_highlights (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  matrix_item_id uuid,
  target_node_id uuid,
  secondary_node_id uuid,
  source_entity_id uuid references public.block_highlights(id) on delete restrict,
  position integer not null,
  target_kind text not null,
  text_value text,
  row_index integer,
  column_index integer,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint block_highlights_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint block_highlights_matrix_fk foreign key (course_id, matrix_item_id)
    references public.block_matrix_items(course_id, id) on delete cascade,
  constraint block_highlights_target_node_fk foreign key (course_id, block_id, target_node_id)
    references public.block_nodes(course_id, block_id, id) on delete cascade,
  constraint block_highlights_secondary_node_fk foreign key (course_id, block_id, secondary_node_id)
    references public.block_nodes(course_id, block_id, id) on delete cascade,
  constraint block_highlights_kind check (target_kind in (
    'pattern', 'node', 'edge', 'left_item', 'right_item', 'relation', 'cell', 'row', 'column'
  )),
  constraint block_highlights_position_nonnegative check (position >= 0),
  constraint block_highlights_coordinates check (
    (row_index is null or row_index >= 0) and (column_index is null or column_index >= 0)
  ),
  constraint block_highlights_shape check (
    (target_kind = 'pattern' and text_value is not null) or
    (target_kind in ('node', 'left_item', 'right_item') and target_node_id is not null) or
    (target_kind in ('edge', 'relation') and target_node_id is not null and secondary_node_id is not null) or
    (target_kind = 'cell' and matrix_item_id is not null and row_index is not null and column_index is not null) or
    (target_kind = 'row' and matrix_item_id is not null and row_index is not null) or
    (target_kind = 'column' and matrix_item_id is not null and column_index is not null)
  ),
  constraint block_highlights_revision_positive check (revision > 0)
);

create index block_highlights_active_position_idx
  on public.block_highlights (block_id, position) where deleted_at is null;

create table public.card_refs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  card_id uuid not null,
  topic_id uuid,
  source_entity_id uuid references public.card_refs(id) on delete restrict,
  ref_kind text not null,
  position integer not null,
  value text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint card_refs_card_fk foreign key (course_id, card_id)
    references public.cards(course_id, id) on delete cascade,
  constraint card_refs_topic_fk foreign key (course_id, topic_id)
    references public.lesson_topics(course_id, id) on delete set null (topic_id),
  constraint card_refs_kind check (ref_kind in ('source', 'topic')),
  constraint card_refs_value_not_blank check (btrim(value) <> ''),
  constraint card_refs_position_nonnegative check (position >= 0),
  constraint card_refs_revision_positive check (revision > 0)
);

create index card_refs_active_position_idx on public.card_refs (card_id, ref_kind, position) where deleted_at is null;
create unique index card_refs_active_value_uidx on public.card_refs (card_id, ref_kind, lower(value)) where deleted_at is null;

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid not null,
  lesson_id uuid not null,
  source_entity_id uuid references public.lessons(id) on delete restrict,
  course_key text,
  module_key text,
  lesson_key text,
  path_key text,
  cursor integer,
  first_viewed_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, user_id, module_id, lesson_id, id),
  constraint lesson_progress_lesson_fk foreign key (course_id, module_id, lesson_id)
    references public.lessons(course_id, module_id, id) on delete restrict,
  constraint lesson_progress_completion_order check (
    completed_at is null or first_viewed_at is null or completed_at >= first_viewed_at
  ),
  constraint lesson_progress_cursor_nonnegative check (cursor is null or cursor >= -1),
  constraint lesson_progress_path_key check (path_key is null or btrim(path_key) <> ''),
  constraint lesson_progress_revision_positive check (revision > 0)
);

create unique index lesson_progress_active_uidx
  on public.lesson_progress (user_id, course_id, lesson_id) where deleted_at is null;
create index lesson_progress_user_course_idx
  on public.lesson_progress (user_id, course_id, deleted_at, last_activity_at desc);

create table public.card_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid not null,
  lesson_id uuid not null,
  lesson_progress_id uuid not null,
  card_id uuid not null,
  source_entity_id uuid references public.cards(id) on delete restrict,
  path_key text,
  card_key text,
  position integer,
  first_viewed_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  last_result text,
  last_activity_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint card_progress_lesson_fk foreign key (course_id, module_id, lesson_id)
    references public.lessons(course_id, module_id, id) on delete restrict,
  constraint card_progress_lesson_progress_fk foreign key (
    course_id, user_id, module_id, lesson_id, lesson_progress_id
  ) references public.lesson_progress(course_id, user_id, module_id, lesson_id, id)
    on delete cascade deferrable initially immediate,
  constraint card_progress_attempts_nonnegative check (attempts >= 0),
  constraint card_progress_completion_order check (
    completed_at is null or first_viewed_at is null or completed_at >= first_viewed_at
  ),
  constraint card_progress_position_nonnegative check (position is null or position >= 0),
  constraint card_progress_path_key check (path_key is null or btrim(path_key) <> ''),
  constraint card_progress_revision_positive check (revision > 0)
);

create unique index card_progress_active_uidx
  on public.card_progress (user_id, course_id, card_id) where deleted_at is null;
create index card_progress_user_course_idx
  on public.card_progress (user_id, course_id, deleted_at, last_activity_at desc);

create table public.card_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  card_id uuid not null,
  body text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint card_comments_card_fk foreign key (course_id, card_id)
    references public.cards(course_id, id) on delete restrict,
  constraint card_comments_body_not_blank check (deleted_at is not null or btrim(body) <> ''),
  constraint card_comments_revision_positive check (revision > 0)
);

create unique index card_comments_active_uidx
  on public.card_comments (user_id, course_id, card_id) where deleted_at is null;
create index card_comments_user_card_idx
  on public.card_comments (user_id, card_id, deleted_at, updated_at desc);

create table public.sync_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  last_pulled_sequence bigint not null default 0,
  last_seen_at timestamptz not null default now(),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id),
  constraint sync_devices_cursor_nonnegative check (last_pulled_sequence >= 0),
  constraint sync_devices_revision_positive check (revision > 0)
);

create index sync_devices_user_idx on public.sync_devices (user_id, deleted_at, last_seen_at desc);

create table public.sync_mutations (
  id uuid primary key default gen_random_uuid(),
  mutation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  entity_type text not null,
  entity_id uuid,
  operation text not null,
  base_revision bigint not null,
  status public.sync_mutation_status not null,
  request jsonb not null,
  result jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, mutation_id),
  constraint sync_mutations_device_fk foreign key (user_id, device_id)
    references public.sync_devices(user_id, id) on delete restrict,
  constraint sync_mutations_operation check (operation in ('insert', 'update', 'delete')),
  constraint sync_mutations_base_revision_nonnegative check (base_revision >= 0),
  constraint sync_mutations_request_object check (jsonb_typeof(request) = 'object'),
  constraint sync_mutations_result_object check (jsonb_typeof(result) = 'object'),
  constraint sync_mutations_revision_positive check (revision > 0)
);

create index sync_mutations_user_device_idx
  on public.sync_mutations (user_id, device_id, created_at desc);

create table public.sync_changes (
  sequence bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid() unique,
  audience_user_id uuid references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  entity_revision bigint not null,
  row_data jsonb not null,
  changed_at timestamptz not null default now(),
  constraint sync_changes_operation check (operation in ('insert', 'update', 'delete')),
  constraint sync_changes_revision_positive check (entity_revision > 0),
  constraint sync_changes_row_object check (jsonb_typeof(row_data) = 'object')
);

create index sync_changes_audience_sequence_idx
  on public.sync_changes (audience_user_id, sequence);
create index sync_changes_course_sequence_idx
  on public.sync_changes (course_id, sequence);
create index sync_changes_entity_idx
  on public.sync_changes (entity_type, entity_id, sequence desc);

create table private.rpc_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  operation text not null,
  request_course_id uuid references public.courses(id) on delete restrict,
  result_course_id uuid references public.courses(id) on delete restrict,
  request_fingerprint text,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id),
  constraint rpc_idempotency_operation check (operation in (
    'clone_catalog_course', 'refresh_personal_course', 'replace_microsequence_cards',
    'delete_personal_course'
  )),
  constraint rpc_idempotency_fingerprint_format check (
    request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint rpc_idempotency_result_payload check (
    result_payload is null or jsonb_typeof(result_payload) = 'object'
  ),
  constraint rpc_idempotency_replace_shape check (
    operation <> 'replace_microsequence_cards'
    or (request_fingerprint is not null and result_payload is not null)
  ),
  constraint rpc_idempotency_course_shape check (
    operation = 'delete_personal_course'
    or (request_course_id is not null and result_course_id is not null)
  )
);

-- Lossless local-row projection.  These typed columns preserve the presence
-- flags and scalar variants required to reconstruct every AraLearn v3 field;
-- no course/card subtree is stored as JSONB.
alter table public.courses
  add column identity_key text,
  add column project_id uuid,
  add column position integer not null default 0,
  add constraint courses_position_nonnegative check (position >= 0);
create unique index courses_personal_owner_identity_key_uidx
  on public.courses (owner_id, identity_key)
  where kind = 'personal' and identity_key is not null and deleted_at is null;
create index courses_personal_owner_position_idx
  on public.courses (owner_id, position)
  where kind = 'personal' and deleted_at is null;
alter table public.modules add column identity_key text;
alter table public.lessons add column identity_key text;
alter table public.course_guides
  add column identity_key text,
  add column owner_type text,
  add column owner_id uuid,
  add constraint course_guides_owner_type check (owner_type is null or owner_type in ('module', 'lesson'));
alter table public.guide_items
  add column identity_key text,
  add column item_type text,
  add constraint guide_items_item_type check (item_type is null or item_type in ('include','exclude','notation','avoid'));
alter table public.lesson_topics
  add column identity_key text,
  add column topic_kind public.topic_kind;
alter table public.topic_statements
  add column identity_key text,
  add column statement_type text,
  add constraint topic_statements_statement_type check (statement_type is null or statement_type in ('check','error'));
alter table public.microsequences
  add column identity_key text,
  add column branch_of_contract_key text,
  add column has_branch_of boolean not null default false,
  add column has_errors boolean not null default false;
alter table public.microsequence_dependencies
  add column identity_key text,
  add column depends_on_contract_key text;
alter table public.microsequence_statements
  add column identity_key text,
  add column statement_type text,
  add constraint microsequence_statements_statement_type check (
    statement_type is null or statement_type in ('cover','check','error')
  );
alter table public.cards
  add column identity_key text,
  add column lesson_id uuid not null,
  add column card_kind public.card_kind,
  add column after text,
  add column has_after boolean not null default false,
  drop constraint cards_microsequence_fk,
  add constraint cards_course_lesson_id_unique unique (course_id, lesson_id, id),
  add constraint cards_course_lesson_microsequence_id_unique
    unique (course_id, lesson_id, microsequence_id, id),
  add constraint cards_microsequence_fk foreign key (course_id, lesson_id, microsequence_id)
    references public.microsequences(course_id, lesson_id, id) on delete cascade;
create unique index cards_active_key_uidx
  on public.cards (lesson_id, contract_key) where deleted_at is null;

alter table public.card_blocks drop constraint card_blocks_parent_role;
alter table public.card_blocks
  add column identity_key text,
  add column region text,
  add column is_primary boolean not null default false,
  add column value text,
  add column answer_contract_key text,
  add column left_set_label text,
  add column right_set_label text,
  add column has_value boolean not null default false,
  add column has_prompt boolean not null default false,
  add column has_question boolean not null default false,
  add column has_answer boolean not null default false,
  add column has_language boolean not null default false,
  add column has_code boolean not null default false,
  add column has_name boolean not null default false,
  add column has_divider_after_column boolean not null default false,
  add column has_pair_list boolean not null default false,
  add column has_relation_table boolean not null default false,
  add column has_highlight boolean not null default false,
  add column has_values boolean not null default false,
  add column has_sequence boolean not null default false,
  add column x_range numeric[],
  add column y_range numeric[],
  add column has_x_range boolean not null default false,
  add column has_y_range boolean not null default false,
  add column scale_k numeric,
  add column has_scale boolean not null default false,
  add column has_result boolean not null default false,
  add constraint card_blocks_region check (region is null or region in ('primary','content','after')),
  add constraint card_blocks_x_range check (x_range is null or cardinality(x_range) = 2),
  add constraint card_blocks_y_range check (y_range is null or cardinality(y_range) = 2);

alter table public.block_options
  add column identity_key text,
  add column has_kind boolean not null default false,
  add column text text;

create table public.flow_nodes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  parent_node_id uuid,
  parent_case_id uuid,
  source_entity_id uuid references public.flow_nodes(id) on delete restrict,
  identity_key text,
  branch text not null,
  position integer not null,
  contract_key text,
  has_contract_key boolean not null default false,
  node_kind text not null,
  text text,
  condition text,
  expression text,
  init text,
  update text,
  iterator text,
  iterable text,
  comment text,
  has_text boolean not null default false,
  has_condition boolean not null default false,
  has_expression boolean not null default false,
  has_init boolean not null default false,
  has_update boolean not null default false,
  has_iterator boolean not null default false,
  has_iterable boolean not null default false,
  has_cases boolean not null default false,
  has_branches boolean not null default false,
  has_items boolean not null default false,
  has_then_branch boolean not null default false,
  has_else_branch boolean not null default false,
  has_body boolean not null default false,
  has_default_branch boolean not null default false,
  has_comment boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, block_id, id),
  constraint flow_nodes_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  constraint flow_nodes_parent_fk foreign key (course_id, block_id, parent_node_id)
    references public.flow_nodes(course_id, block_id, id) on delete cascade deferrable initially deferred,
  constraint flow_nodes_kind check (node_kind in (
    'sequence','start','end','input','output','process','if_then','if_then_else',
    'while','do_while','for','if_chain','switch_case'
  )),
  constraint flow_nodes_position_nonnegative check (position >= 0),
  constraint flow_nodes_revision_positive check (revision > 0)
);
create index flow_nodes_active_position_idx
  on public.flow_nodes (block_id, parent_node_id, parent_case_id, branch, position)
  where deleted_at is null;
create index flow_nodes_course_idx on public.flow_nodes (course_id, deleted_at, updated_at desc);

create table public.flow_cases (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  block_id uuid not null,
  flow_node_id uuid not null,
  source_entity_id uuid references public.flow_cases(id) on delete restrict,
  identity_key text,
  position integer not null,
  case_kind text not null,
  contract_key text,
  has_contract_key boolean not null default false,
  condition text,
  match text,
  has_then_branch boolean not null default false,
  has_body boolean not null default false,
  has_items boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  unique (course_id, block_id, id),
  constraint flow_cases_node_fk foreign key (course_id, block_id, flow_node_id)
    references public.flow_nodes(course_id, block_id, id) on delete cascade,
  constraint flow_cases_kind check (case_kind in ('switch','if_chain','legacy_branch')),
  constraint flow_cases_position_nonnegative check (position >= 0),
  constraint flow_cases_revision_positive check (revision > 0)
);
create index flow_cases_active_position_idx
  on public.flow_cases (flow_node_id, position) where deleted_at is null;
alter table public.flow_nodes
  add constraint flow_nodes_parent_case_fk foreign key (course_id, block_id, parent_case_id)
    references public.flow_cases(course_id, block_id, id) on delete cascade deferrable initially deferred;

create table public.flow_practices (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  source_entity_id uuid references public.flow_practices(id) on delete restrict,
  identity_key text,
  owner_type text not null,
  flow_node_id uuid,
  flow_case_id uuid,
  blank_shape boolean not null default false,
  has_blank_shape boolean not null default false,
  blank_text boolean not null default false,
  has_blank_text boolean not null default false,
  blank_label boolean not null default false,
  has_blank_label boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint flow_practices_flow_node_fk foreign key (course_id, flow_node_id)
    references public.flow_nodes(course_id, id) on delete cascade,
  constraint flow_practices_flow_case_fk foreign key (course_id, flow_case_id)
    references public.flow_cases(course_id, id) on delete cascade,
  constraint flow_practices_owner check (
    (owner_type = 'node' and flow_node_id is not null and flow_case_id is null) or
    (owner_type = 'case' and flow_case_id is not null and flow_node_id is null)
  ),
  constraint flow_practices_revision_positive check (revision > 0)
);
create unique index flow_practices_active_node_uidx
  on public.flow_practices (flow_node_id) where flow_node_id is not null and deleted_at is null;
create unique index flow_practices_active_case_uidx
  on public.flow_practices (flow_case_id) where flow_case_id is not null and deleted_at is null;
create index flow_practices_course_idx on public.flow_practices (course_id, deleted_at, updated_at desc);

create table public.node_practices (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  practice_id uuid not null,
  source_entity_id uuid references public.node_practices(id) on delete restrict,
  identity_key text,
  entry_kind text not null,
  label_key text,
  blank boolean not null default true,
  mode text,
  position integer not null default 0,
  was_boolean boolean not null default false,
  has_blank boolean not null default false,
  has_mode boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint node_practices_practice_fk foreign key (course_id, practice_id)
    references public.flow_practices(course_id, id) on delete cascade,
  constraint node_practices_entry_kind check (entry_kind in ('text','label')),
  constraint node_practices_mode check (mode is null or mode = 'choice'),
  constraint node_practices_label_key check (
    (entry_kind = 'label' and label_key is not null and btrim(label_key) <> '') or
    (entry_kind = 'text' and label_key is null)
  ),
  constraint node_practices_position_nonnegative check (position >= 0),
  constraint node_practices_revision_positive check (revision > 0)
);
create index node_practices_active_order_idx
  on public.node_practices (practice_id, entry_kind, coalesce(label_key, ''), position)
  where deleted_at is null;

create table public.node_practice_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  entry_id uuid,
  flow_practice_id uuid,
  source_entity_id uuid references public.node_practice_items(id) on delete restrict,
  identity_key text,
  contract_key text,
  position integer not null,
  item_kind text not null,
  value text not null,
  was_primitive boolean not null default false,
  has_contract_key boolean not null default false,
  enabled boolean not null default true,
  has_enabled boolean not null default false,
  regex boolean not null default false,
  has_regex boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, id),
  constraint node_practice_items_entry_fk foreign key (course_id, entry_id)
    references public.node_practices(course_id, id) on delete cascade,
  constraint node_practice_items_flow_practice_fk foreign key (course_id, flow_practice_id)
    references public.flow_practices(course_id, id) on delete cascade,
  constraint node_practice_items_owner check (
    (item_kind in ('option','variant') and entry_id is not null and flow_practice_id is null) or
    (item_kind = 'shape_option' and flow_practice_id is not null and entry_id is null)
  ),
  constraint node_practice_items_kind check (item_kind in ('option','variant','shape_option')),
  constraint node_practice_items_contract_key check (
    has_contract_key = (contract_key is not null) and
    (contract_key is null or btrim(contract_key) <> '')
  ),
  constraint node_practice_items_value_not_blank check (btrim(value) <> ''),
  constraint node_practice_items_position_nonnegative check (position >= 0),
  constraint node_practice_items_revision_positive check (revision > 0)
);
create unique index node_practice_items_active_key_uidx
  on public.node_practice_items (entry_id, contract_key)
  where entry_id is not null and contract_key is not null and deleted_at is null;
create index node_practice_items_active_position_idx
  on public.node_practice_items (entry_id, item_kind, position)
  where entry_id is not null and deleted_at is null;

alter table public.block_edges
  add column identity_key text,
  add column edge_scope text,
  add column from_contract_key text,
  add column to_contract_key text,
  add column has_label boolean not null default false,
  add column has_weight boolean not null default false;
alter table public.block_matrix_items alter column row_count set default 1;
alter table public.block_matrix_items alter column column_count set default 1;
alter table public.block_matrix_items
  add column identity_key text,
  add column is_sequence boolean not null default false,
  add column has_connector boolean not null default false,
  add column has_highlight boolean not null default false,
  add column has_name boolean not null default false;

alter table public.block_cells alter column matrix_item_id drop not null;
alter table public.block_cells alter column text_value drop not null;
alter table public.block_cells drop constraint block_cells_indexes_nonnegative;
alter table public.block_cells
  add column identity_key text,
  add column block_id uuid not null,
  add column cell_kind text,
  add column position integer,
  add column value_type text,
  add column number_value numeric,
  add column boolean_value boolean,
  add constraint block_cells_block_fk foreign key (course_id, block_id)
    references public.card_blocks(course_id, id) on delete cascade,
  add constraint block_cells_indexes check (row_index >= -1 and column_index >= 0),
  add constraint block_cells_value_type check (value_type is null or value_type in ('null','string','number','boolean'));

alter table public.block_points
  add column identity_key text,
  add column point_role text;
alter table public.block_lines
  add column identity_key text,
  add column from_point_id uuid,
  add column to_point_id uuid,
  add column line_role text,
  add constraint block_lines_from_point_fk foreign key (course_id, from_point_id)
    references public.block_points(course_id, id) on delete restrict,
  add constraint block_lines_to_point_fk foreign key (course_id, to_point_id)
    references public.block_points(course_id, id) on delete restrict;

alter table public.block_highlights drop constraint block_highlights_shape;
alter table public.block_highlights
  add column identity_key text,
  add column selection_type text,
  add column value text,
  add column from_contract_key text,
  add column to_contract_key text;
alter table public.card_refs
  add column identity_key text,
  add column topic_contract_key text;

alter table public.card_comments
  add column module_id uuid not null,
  add column lesson_id uuid not null,
  add column microsequence_id uuid not null,
  add column source_entity_id uuid references public.cards(id) on delete restrict,
  add column course_key text,
  add column module_key text,
  add column lesson_key text,
  add column microsequence_key text,
  add column card_key text;

alter table public.block_cells
  drop constraint block_cells_matrix_item_fk,
  add constraint block_cells_matrix_item_fk foreign key (course_id, block_id, matrix_item_id)
    references public.block_matrix_items(course_id, block_id, id) on delete cascade;

alter table public.card_progress
  add constraint card_progress_card_fk foreign key (course_id, lesson_id, card_id)
    references public.cards(course_id, lesson_id, id) on delete restrict;

alter table public.card_comments
  drop constraint card_comments_card_fk,
  add constraint card_comments_lesson_fk foreign key (course_id, module_id, lesson_id)
    references public.lessons(course_id, module_id, id) on delete restrict,
  add constraint card_comments_card_fk foreign key (
    course_id, lesson_id, microsequence_id, card_id
  ) references public.cards(course_id, lesson_id, microsequence_id, id) on delete restrict;

create index lesson_progress_user_path_idx
  on public.lesson_progress (user_id, path_key) where deleted_at is null;
create index card_progress_user_path_card_idx
  on public.card_progress (user_id, path_key, card_key) where deleted_at is null;

alter table public.block_points drop constraint block_points_kind;
alter table public.block_points add constraint block_points_kind check (point_kind in (
  'origin','x','y','vector','vectors','sum','scale','distance','result'
));
alter table public.block_lines drop constraint block_lines_kind;
alter table public.block_lines add constraint block_lines_kind check (line_kind in (
  'segment','axis','vector','vectors','sum','scale','distance'
));
create unique index block_cells_active_block_coordinate_uidx
  on public.block_cells (block_id, cell_kind, row_index, column_index)
  where matrix_item_id is null and deleted_at is null;
create index node_practice_items_active_shape_position_idx
  on public.node_practice_items (flow_practice_id, position)
  where item_kind = 'shape_option' and deleted_at is null;

create or replace function private.request_role()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), '')
  );
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
  select private.request_role() = 'service_role'
    or exists (
      select 1 from private.app_admins a
      where a.user_id = auth.uid() and a.active
    );
$$;

create or replace function public.user_owns_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and c.kind = 'personal'
      and c.owner_id = auth.uid()
      and c.deleted_at is null
  );
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
    where c.id = p_course_id
      and c.deleted_at is null
      and (
        (c.kind = 'official' and c.status = 'published')
        or c.owner_id = auth.uid()
        or exists (
          select 1 from public.course_memberships m
          where m.course_id = c.id and m.user_id = auth.uid() and m.deleted_at is null
        )
      )
  );
$$;

create or replace function public.user_can_edit_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null and exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and c.kind = 'personal'
      and c.status = 'active'
      and c.deleted_at is null
      and (
        c.owner_id = auth.uid()
        or exists (
          select 1 from public.course_memberships m
          where m.course_id = c.id and m.user_id = auth.uid()
            and m.role in ('owner', 'editor') and m.deleted_at is null
        )
      )
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
    select 1 from public.courses c
    where c.id = p_course_id
      and c.kind = 'personal'
      and c.status = 'active'
      and c.deleted_at is null
      and (
        c.owner_id = auth.uid()
        or exists (
          select 1 from public.course_memberships m
          where m.course_id = c.id and m.user_id = auth.uid() and m.deleted_at is null
        )
      )
  );
$$;

create or replace function private.refresh_matrix_dimensions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_matrix_item_id uuid := coalesce(new.matrix_item_id, old.matrix_item_id);
begin
  if v_matrix_item_id is not null then
    update public.block_matrix_items item set
      row_count = greatest(1, coalesce((
        select max(cell.row_index) + 1 from public.block_cells cell
        where cell.matrix_item_id = v_matrix_item_id and cell.deleted_at is null and cell.row_index >= 0
      ), 1)),
      column_count = greatest(1, coalesce((
        select max(cell.column_index) + 1 from public.block_cells cell
        where cell.matrix_item_id = v_matrix_item_id and cell.deleted_at is null
      ), 1))
    where item.id = v_matrix_item_id;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger block_cells_refresh_dimensions
after insert or update or delete on public.block_cells
for each row execute function private.refresh_matrix_dimensions();

create or replace function private.touch_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'courses', 'course_memberships', 'modules', 'lessons', 'course_guides',
    'guide_items', 'lesson_topics', 'topic_statements', 'microsequences',
    'microsequence_dependencies', 'microsequence_statements', 'cards',
    'card_blocks', 'block_options', 'block_nodes', 'flow_nodes', 'flow_cases',
    'flow_practices', 'node_practices',
    'node_practice_items', 'block_edges', 'block_matrix_items', 'block_cells',
    'block_points', 'block_lines', 'block_highlights', 'card_refs',
    'lesson_progress', 'card_progress', 'card_comments', 'sync_devices',
    'sync_mutations'
  ] loop
    execute format(
      'create trigger %I_touch_revision before update on public.%I '
      'for each row execute function private.touch_revision()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function private.content_row_microsequence_id(p_table_name text, p_row jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  if p_row is null then return null; end if;
  if p_table_name in ('cards', 'microsequence_dependencies', 'microsequence_statements') then
    return private.try_uuid(p_row ->> 'microsequence_id');
  elsif p_table_name = 'card_blocks' then
    select card.microsequence_id into v_id from public.cards card
    where card.id = private.try_uuid(p_row ->> 'card_id');
  elsif p_table_name in (
    'block_options', 'block_nodes', 'block_edges', 'block_matrix_items', 'block_cells',
    'block_points', 'block_lines', 'block_highlights', 'flow_nodes', 'flow_cases'
  ) then
    select card.microsequence_id into v_id
    from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = private.try_uuid(p_row ->> 'block_id');
  elsif p_table_name = 'flow_practices' then
    select card.microsequence_id into v_id
    from public.flow_practices practice
    left join public.flow_nodes node on node.id = practice.flow_node_id
    left join public.flow_cases flow_case on flow_case.id = practice.flow_case_id
    join public.card_blocks block on block.id = coalesce(node.block_id, flow_case.block_id)
    join public.cards card on card.id = block.card_id
    where practice.id = private.try_uuid(p_row ->> 'id');
  elsif p_table_name = 'node_practices' then
    select private.content_row_microsequence_id('flow_practices', to_jsonb(practice)) into v_id
    from public.flow_practices practice
    where practice.id = private.try_uuid(p_row ->> 'practice_id');
  elsif p_table_name = 'node_practice_items' then
    select private.content_row_microsequence_id('flow_practices', to_jsonb(practice)) into v_id
    from public.flow_practices practice
    where practice.id = coalesce(
      private.try_uuid(p_row ->> 'flow_practice_id'),
      (select entry.practice_id from public.node_practices entry
       where entry.id = private.try_uuid(p_row ->> 'entry_id'))
    );
  elsif p_table_name = 'card_refs' then
    select card.microsequence_id into v_id from public.cards card
    where card.id = private.try_uuid(p_row ->> 'card_id');
  end if;
  return v_id;
end;
$$;

create or replace function private.content_row_card_id(p_table_name text, p_row jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid;
begin
  if p_row is null or p_table_name = 'cards' then return null; end if;
  if p_table_name in ('card_blocks', 'card_refs') then
    return private.try_uuid(p_row ->> 'card_id');
  elsif p_table_name in (
    'block_options', 'block_nodes', 'block_edges', 'block_matrix_items', 'block_cells',
    'block_points', 'block_lines', 'block_highlights', 'flow_nodes', 'flow_cases'
  ) then
    select block.card_id into v_id from public.card_blocks block
    where block.id = private.try_uuid(p_row ->> 'block_id');
  elsif p_table_name = 'flow_practices' then
    select block.card_id into v_id
    from public.flow_practices practice
    left join public.flow_nodes node on node.id = practice.flow_node_id
    left join public.flow_cases flow_case on flow_case.id = practice.flow_case_id
    join public.card_blocks block on block.id = coalesce(node.block_id, flow_case.block_id)
    where practice.id = private.try_uuid(p_row ->> 'id');
  elsif p_table_name = 'node_practices' then
    select private.content_row_card_id('flow_practices', to_jsonb(practice)) into v_id
    from public.flow_practices practice
    where practice.id = private.try_uuid(p_row ->> 'practice_id');
  elsif p_table_name = 'node_practice_items' then
    select private.content_row_card_id('flow_practices', to_jsonb(practice)) into v_id
    from public.flow_practices practice
    where practice.id = coalesce(
      private.try_uuid(p_row ->> 'flow_practice_id'),
      (select entry.practice_id from public.node_practices entry
       where entry.id = private.try_uuid(p_row ->> 'entry_id'))
    );
  end if;
  return v_id;
end;
$$;

create or replace function private.mark_course_self_dirty()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if current_setting('aralearn.suppress_course_dirty', true) = 'on' then
    return new;
  end if;
  if row(
    new.contract_key, new.title, new.goal, new.contract_scope, new.identity_key, new.project_id,
    new.position, new.deleted_at
  ) is distinct from row(
    old.contract_key, old.title, old.goal, old.contract_scope, old.identity_key, old.project_id,
    old.position, old.deleted_at
  ) then
    new.content_hash := null;
    if new.kind = 'personal' then
      new.personalized_at := coalesce(new.personalized_at, now());
    elsif new.kind = 'official' and (old.status = 'published' or new.status = 'published') then
      new.status := 'draft';
    end if;
  end if;
  return new;
end;
$$;

create trigger courses_mark_self_dirty
before update on public.courses
for each row execute function private.mark_course_self_dirty();

create or replace function private.mark_course_content_dirty()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_course_ids uuid[];
  v_card_ids uuid[];
  v_microsequence_ids uuid[];
  v_lesson_ids uuid[];
  v_module_ids uuid[];
begin
  if current_setting('aralearn.suppress_course_dirty', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_course_ids := array[
    private.try_uuid(v_old_row ->> 'course_id'),
    private.try_uuid(v_new_row ->> 'course_id')
  ];
  -- Every authorial row mutation advances the course-wide optimistic token
  -- exactly once.  Synthetic ancestor touches below run with dirty tracking
  -- suppressed, so a block edit does not multiply the course revision through
  -- card -> microsequence -> lesson -> module propagation.
  update public.courses course
  set content_hash = null,
      personalized_at = case when course.kind = 'personal'
        then coalesce(course.personalized_at, now()) else course.personalized_at end,
      status = case when course.kind = 'official' and course.status = 'published'
        then 'draft'::public.course_status else course.status end
  where course.id in (select distinct unnest(v_course_ids))
    and course.deleted_at is null;

  if coalesce(current_setting('aralearn.suppress_aggregate_revision', true), 'off') <> 'on'
     and coalesce(current_setting('aralearn.suppress_microsequence_revision', true), 'off') <> 'on' then
    perform set_config('aralearn.suppress_aggregate_revision', 'on', true);
    perform set_config('aralearn.suppress_course_dirty', 'on', true);
    v_card_ids := array[
      private.content_row_card_id(tg_table_name, v_old_row),
      private.content_row_card_id(tg_table_name, v_new_row)
    ];
    v_microsequence_ids := array[
      private.content_row_microsequence_id(tg_table_name, v_old_row),
      private.content_row_microsequence_id(tg_table_name, v_new_row)
    ];
    update public.cards card
    set updated_at = card.updated_at
    where card.id in (select distinct unnest(v_card_ids))
      and card.deleted_at is null;

    if tg_table_name in (
      'cards', 'card_blocks', 'block_options', 'block_nodes', 'flow_nodes',
      'flow_cases', 'flow_practices', 'node_practices', 'node_practice_items',
      'block_edges', 'block_matrix_items', 'block_cells', 'block_points',
      'block_lines', 'block_highlights', 'card_refs'
    ) then
      -- cards_revision is the optimistic token for replacing only the card
      -- subtree.  Metadata and dependency edits still advance revision, but
      -- deliberately leave this narrower token unchanged.
      update public.microsequences microsequence
      set updated_at = microsequence.updated_at,
          cards_revision = microsequence.cards_revision + 1
      where microsequence.id in (select distinct unnest(v_microsequence_ids))
        and microsequence.deleted_at is null;
    else
      update public.microsequences microsequence
      set updated_at = microsequence.updated_at
      where microsequence.id in (select distinct unnest(v_microsequence_ids))
        and microsequence.deleted_at is null;
    end if;

    v_lesson_ids := array[
      case when tg_table_name = 'microsequences' then private.try_uuid(v_old_row ->> 'lesson_id') end,
      case when tg_table_name = 'microsequences' then private.try_uuid(v_new_row ->> 'lesson_id') end,
      case when tg_table_name in ('cards','microsequence_dependencies','lesson_topics')
        then private.try_uuid(v_old_row ->> 'lesson_id') end,
      case when tg_table_name in ('cards','microsequence_dependencies','lesson_topics')
        then private.try_uuid(v_new_row ->> 'lesson_id') end
      ,case when tg_table_name = 'course_guides'
        then private.try_uuid(v_old_row ->> 'lesson_id') end
      ,case when tg_table_name = 'course_guides'
        then private.try_uuid(v_new_row ->> 'lesson_id') end
    ] || array(
      select distinct guide.lesson_id from public.course_guides guide
      where tg_table_name = 'guide_items'
        and guide.id in (
          private.try_uuid(v_old_row ->> 'guide_id'),
          private.try_uuid(v_new_row ->> 'guide_id')
        )
        and guide.lesson_id is not null
    ) || array(
      select distinct topic.lesson_id from public.lesson_topics topic
      where tg_table_name = 'topic_statements'
        and topic.id in (
          private.try_uuid(v_old_row ->> 'topic_id'),
          private.try_uuid(v_new_row ->> 'topic_id')
        )
    ) || array(
      select distinct microsequence.lesson_id from public.microsequences microsequence
      where microsequence.id in (select distinct unnest(v_microsequence_ids))
    );
    update public.lessons lesson
    set updated_at = lesson.updated_at
    where lesson.id in (select distinct unnest(v_lesson_ids))
      and lesson.deleted_at is null;

    v_module_ids := array[
      case when tg_table_name = 'lessons' then private.try_uuid(v_old_row ->> 'module_id') end,
      case when tg_table_name = 'lessons' then private.try_uuid(v_new_row ->> 'module_id') end,
      case when tg_table_name = 'course_guides' then private.try_uuid(v_old_row ->> 'module_id') end,
      case when tg_table_name = 'course_guides' then private.try_uuid(v_new_row ->> 'module_id') end
    ] || array(
      select distinct guide.module_id from public.course_guides guide
      where tg_table_name = 'guide_items'
        and guide.id in (
          private.try_uuid(v_old_row ->> 'guide_id'),
          private.try_uuid(v_new_row ->> 'guide_id')
        )
        and guide.module_id is not null
    ) || array(
      select distinct lesson.module_id from public.lessons lesson
      where lesson.id in (select distinct unnest(v_lesson_ids))
    );
    update public.modules module
    set updated_at = module.updated_at
    where module.id in (select distinct unnest(v_module_ids))
      and module.deleted_at is null;
    perform set_config('aralearn.suppress_course_dirty', 'off', true);
    perform set_config('aralearn.suppress_aggregate_revision', 'off', true);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'modules', 'lessons', 'course_guides', 'guide_items', 'lesson_topics',
    'topic_statements', 'microsequences', 'microsequence_dependencies',
    'microsequence_statements', 'cards', 'card_blocks', 'block_options',
    'block_nodes', 'flow_nodes', 'flow_cases', 'flow_practices', 'node_practices',
    'node_practice_items', 'block_edges',
    'block_matrix_items', 'block_cells', 'block_points', 'block_lines',
    'block_highlights', 'card_refs'
  ] loop
    execute format(
      'create trigger %I_mark_course_dirty after insert or update or delete on public.%I '
      'for each row execute function private.mark_course_content_dirty()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function private.capture_sync_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row jsonb;
  v_course_id uuid;
  v_entity_id uuid;
  v_audience uuid;
  v_revision bigint;
  v_operation text;
begin
  if current_setting('aralearn.suppress_sync_changes', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_entity_id := nullif(v_row ->> 'id', '')::uuid;
  v_revision := coalesce(nullif(v_row ->> 'revision', '')::bigint, 1);
  v_course_id := nullif(v_row ->> 'course_id', '')::uuid;
  v_audience := nullif(v_row ->> 'user_id', '')::uuid;

  if tg_table_name = 'courses' then
    v_course_id := v_entity_id;
    -- A personal course row is shared by every active member.  Keeping the
    -- audience course-scoped (NULL) also lets a newly linked device bootstrap
    -- the course row that precedes its children in the feed.
    v_audience := null;
  end if;
  if tg_table_name = 'course_memberships' then
    v_audience := nullif(v_row ->> 'user_id', '')::uuid;
  end if;

  v_operation := case
    when tg_op = 'DELETE' or (v_row ->> 'deleted_at') is not null then 'delete'
    when tg_op = 'INSERT' then 'insert'
    else 'update'
  end;

  insert into public.sync_changes (
    audience_user_id, course_id, entity_type, entity_id, operation,
    entity_revision, row_data
  ) values (
    v_audience, v_course_id, tg_table_name, v_entity_id, v_operation,
    v_revision, v_row
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'courses', 'course_memberships', 'modules', 'lessons', 'course_guides',
    'guide_items', 'lesson_topics', 'topic_statements', 'microsequences',
    'microsequence_dependencies', 'microsequence_statements', 'cards',
    'card_blocks', 'block_options', 'block_nodes', 'flow_nodes', 'flow_cases',
    'flow_practices', 'node_practices',
    'node_practice_items', 'block_edges', 'block_matrix_items', 'block_cells',
    'block_points', 'block_lines', 'block_highlights', 'card_refs',
    'lesson_progress', 'card_progress', 'card_comments'
  ] loop
    execute format(
      'create trigger %I_capture_sync_change after insert or update or delete on public.%I '
      'for each row execute function private.capture_sync_change()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function private.course_content_hash(p_course_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with canonical(entity_type, entity_path, row_value) as (
    select 'course', c.contract_key,
      jsonb_build_object(
        'contract_key', c.contract_key, 'title', c.title, 'goal', c.goal,
        'contract_scope', c.contract_scope
      )
    from public.courses c where c.id = p_course_id and c.deleted_at is null
    union all
    select 'module', m.contract_key,
      jsonb_build_object('position', m.position, 'title', m.title)
    from public.modules m where m.course_id = p_course_id and m.deleted_at is null
    union all
    select 'lesson', m.contract_key || '/' || l.contract_key,
      jsonb_build_object('position', l.position, 'title', l.title)
    from public.lessons l join public.modules m on m.id = l.module_id
    where l.course_id = p_course_id and l.deleted_at is null and m.deleted_at is null
    union all
    select 'guide', coalesce(m.contract_key, l.contract_key), jsonb_build_object('goal', g.goal)
    from public.course_guides g
    left join public.modules m on m.id = g.module_id
    left join public.lessons l on l.id = g.lesson_id
    where g.course_id = p_course_id and g.deleted_at is null
    union all
    select 'guide_item', coalesce(m.contract_key, l.contract_key) || '/' || gi.item_kind || '/' || gi.position,
      jsonb_build_object('kind', gi.item_kind, 'position', gi.position, 'value', gi.value)
    from public.guide_items gi join public.course_guides g on g.id = gi.guide_id
    left join public.modules m on m.id = g.module_id
    left join public.lessons l on l.id = g.lesson_id
    where gi.course_id = p_course_id and gi.deleted_at is null and g.deleted_at is null
    union all
    select 'topic', l.contract_key || '/' || t.contract_key,
      jsonb_build_object('position', t.position, 'label', t.label, 'kind', t.kind)
    from public.lesson_topics t join public.lessons l on l.id = t.lesson_id
    where t.course_id = p_course_id and t.deleted_at is null and l.deleted_at is null
    union all
    select 'topic_statement', t.contract_key || '/' || s.statement_kind || '/' || s.position,
      jsonb_build_object('kind', s.statement_kind, 'position', s.position, 'value', s.value)
    from public.topic_statements s join public.lesson_topics t on t.id = s.topic_id
    where s.course_id = p_course_id and s.deleted_at is null and t.deleted_at is null
    union all
    select 'microsequence', l.contract_key || '/' || ms.contract_key,
      jsonb_build_object('position', ms.position, 'title', ms.title, 'goal', ms.goal,
        'role', ms.role, 'status', ms.status, 'branch_of', branch.contract_key)
    from public.microsequences ms join public.lessons l on l.id = ms.lesson_id
    left join public.microsequences branch on branch.id = ms.branch_of_id
    where ms.course_id = p_course_id and ms.deleted_at is null and l.deleted_at is null
    union all
    select 'dependency', ms.contract_key || '/' || d.position,
      jsonb_build_object('position', d.position, 'depends_on', dep.contract_key)
    from public.microsequence_dependencies d
    join public.microsequences ms on ms.id = d.microsequence_id
    join public.microsequences dep on dep.id = d.depends_on_microsequence_id
    where d.course_id = p_course_id and d.deleted_at is null
    union all
    select 'microsequence_statement', ms.contract_key || '/' || s.statement_kind || '/' || s.position,
      jsonb_build_object('kind', s.statement_kind, 'position', s.position, 'value', s.value)
    from public.microsequence_statements s join public.microsequences ms on ms.id = s.microsequence_id
    where s.course_id = p_course_id and s.deleted_at is null and ms.deleted_at is null
    union all
    select 'card', ms.contract_key || '/' || c.contract_key,
      jsonb_build_object('position', c.position, 'resource', c.resource, 'kind', c.kind,
        'exercise', c.exercise, 'title', c.title, 'after', c.after_text)
    from public.cards c join public.microsequences ms on ms.id = c.microsequence_id
    where c.course_id = p_course_id and c.deleted_at is null and ms.deleted_at is null
    union all
    select 'block', c.contract_key || '/' || b.contract_key,
      (to_jsonb(b) - array['id','course_id','card_id','parent_block_id','source_entity_id',
        'revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('parent', parent.contract_key)
    from public.card_blocks b join public.cards c on c.id = b.card_id
    left join public.card_blocks parent on parent.id = b.parent_block_id
    where b.course_id = p_course_id and b.deleted_at is null and c.deleted_at is null
    union all
    select 'option', b.contract_key || '/' || o.contract_key,
      to_jsonb(o) - array['id','course_id','block_id','source_entity_id','revision','created_at','updated_at','deleted_at']
    from public.block_options o join public.card_blocks b on b.id = o.block_id
    where o.course_id = p_course_id and o.deleted_at is null and b.deleted_at is null
    union all
    select 'node', b.contract_key || '/' || n.contract_key,
      (to_jsonb(n) - array['id','course_id','block_id','parent_node_id','source_entity_id',
        'revision','created_at','updated_at','deleted_at']) || jsonb_build_object('parent', parent.contract_key)
    from public.block_nodes n join public.card_blocks b on b.id = n.block_id
    left join public.block_nodes parent on parent.id = n.parent_node_id
    where n.course_id = p_course_id and n.deleted_at is null and b.deleted_at is null
    union all
    select 'flow_node', coalesce(n.identity_key, b.contract_key || '/flow/' || n.branch || '/' || n.position),
      (to_jsonb(n) - array['id','course_id','block_id','parent_node_id','parent_case_id',
        'source_entity_id','identity_key','revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('parent_node', parent.identity_key, 'parent_case', parent_case.identity_key)
    from public.flow_nodes n join public.card_blocks b on b.id = n.block_id
    left join public.flow_nodes parent on parent.id = n.parent_node_id
    left join public.flow_cases parent_case on parent_case.id = n.parent_case_id
    where n.course_id = p_course_id and n.deleted_at is null and b.deleted_at is null
    union all
    select 'flow_case', coalesce(fc.identity_key, n.identity_key || '/case/' || fc.position),
      (to_jsonb(fc) - array['id','course_id','block_id','flow_node_id','source_entity_id',
        'identity_key','revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('flow_node', n.identity_key)
    from public.flow_cases fc join public.flow_nodes n on n.id = fc.flow_node_id
    where fc.course_id = p_course_id and fc.deleted_at is null and n.deleted_at is null
    union all
    select 'flow_practice', coalesce(fp.identity_key, coalesce(n.identity_key, fc.identity_key) || '/practice'),
      (to_jsonb(fp) - array['id','course_id','source_entity_id','identity_key','flow_node_id','flow_case_id',
        'revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('owner', coalesce(n.identity_key, fc.identity_key))
    from public.flow_practices fp
    left join public.flow_nodes n on n.id = fp.flow_node_id
    left join public.flow_cases fc on fc.id = fp.flow_case_id
    where fp.course_id = p_course_id and fp.deleted_at is null
    union all
    select 'flow_practice_entry', coalesce(entry.identity_key,
        practice.identity_key || '/' || entry.entry_kind || '/' || entry.position),
      (to_jsonb(entry) - array['id','course_id','practice_id','source_entity_id','identity_key',
        'revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('practice', practice.identity_key)
    from public.node_practices entry
    join public.flow_practices practice on practice.id = entry.practice_id
    where entry.course_id = p_course_id and entry.deleted_at is null and practice.deleted_at is null
    union all
    select 'flow_practice_item', coalesce(item.identity_key,
        coalesce(entry.identity_key, practice.identity_key) || '/' || item.item_kind || '/' || item.position),
      (to_jsonb(item) - array['id','course_id','entry_id','flow_practice_id','source_entity_id','identity_key',
        'revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('owner', coalesce(entry.identity_key, practice.identity_key))
    from public.node_practice_items item
    left join public.node_practices entry on entry.id = item.entry_id
    left join public.flow_practices practice on practice.id = item.flow_practice_id
    where item.course_id = p_course_id and item.deleted_at is null
    union all
    select 'edge', b.contract_key || '/' || e.contract_key,
      (to_jsonb(e) - array['id','course_id','block_id','from_node_id','to_node_id','source_entity_id',
        'revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('from', fn.contract_key, 'to', tn.contract_key)
    from public.block_edges e join public.card_blocks b on b.id = e.block_id
    join public.block_nodes fn on fn.id = e.from_node_id join public.block_nodes tn on tn.id = e.to_node_id
    where e.course_id = p_course_id and e.deleted_at is null and b.deleted_at is null
    union all
    select 'matrix_item', b.contract_key || '/' || mi.contract_key,
      to_jsonb(mi) - array['id','course_id','block_id','source_entity_id','revision','created_at','updated_at','deleted_at']
    from public.block_matrix_items mi join public.card_blocks b on b.id = mi.block_id
    where mi.course_id = p_course_id and mi.deleted_at is null and b.deleted_at is null
    union all
    select 'cell', b.contract_key || '/' || coalesce(mi.contract_key, cell.cell_kind, 'cell')
        || '/' || cell.row_index || '/' || cell.column_index,
      to_jsonb(cell) - array['id','course_id','block_id','matrix_item_id','source_entity_id',
        'revision','created_at','updated_at','deleted_at']
    from public.block_cells cell
    join public.card_blocks b on b.id = cell.block_id
    left join public.block_matrix_items mi on mi.id = cell.matrix_item_id
    where cell.course_id = p_course_id and cell.deleted_at is null and b.deleted_at is null
      and (mi.id is null or mi.deleted_at is null)
    union all
    select 'point', b.contract_key || '/' || p.contract_key,
      to_jsonb(p) - array['id','course_id','block_id','source_entity_id','revision','created_at','updated_at','deleted_at']
    from public.block_points p join public.card_blocks b on b.id = p.block_id
    where p.course_id = p_course_id and p.deleted_at is null and b.deleted_at is null
    union all
    select 'line', b.contract_key || '/' || l.contract_key,
      to_jsonb(l) - array['id','course_id','block_id','source_entity_id','revision','created_at','updated_at','deleted_at']
    from public.block_lines l join public.card_blocks b on b.id = l.block_id
    where l.course_id = p_course_id and l.deleted_at is null and b.deleted_at is null
    union all
    select 'highlight', b.contract_key || '/' || h.position,
      (to_jsonb(h) - array['id','course_id','block_id','matrix_item_id','target_node_id','secondary_node_id',
        'source_entity_id','revision','created_at','updated_at','deleted_at']) ||
      jsonb_build_object('matrix', mi.contract_key, 'target', tn.contract_key, 'secondary', sn.contract_key)
    from public.block_highlights h join public.card_blocks b on b.id = h.block_id
    left join public.block_matrix_items mi on mi.id = h.matrix_item_id
    left join public.block_nodes tn on tn.id = h.target_node_id
    left join public.block_nodes sn on sn.id = h.secondary_node_id
    where h.course_id = p_course_id and h.deleted_at is null and b.deleted_at is null
    union all
    select 'card_ref', c.contract_key || '/' || r.ref_kind || '/' || r.position,
      jsonb_build_object('kind', r.ref_kind, 'position', r.position, 'value', r.value)
    from public.card_refs r join public.cards c on c.id = r.card_id
    where r.course_id = p_course_id and r.deleted_at is null and c.deleted_at is null
  )
  select encode(extensions.digest(coalesce(string_agg(
    entity_type || chr(31) || entity_path || chr(31) || row_value::text,
    chr(30) order by entity_type, entity_path, row_value::text
  ), ''), 'sha256'), 'hex')
  from canonical;
$$;

create or replace function public.compute_course_content_hash(p_course_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not public.user_can_read_course(p_course_id) and not public.is_app_admin() then
    raise exception 'Curso não autorizado.' using errcode = '42501';
  end if;
  return private.course_content_hash(p_course_id);
end;
$$;

create or replace function private.copy_clone_scalar_projection(
  p_table regclass,
  p_source_course_id uuid,
  p_target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignments text;
begin
  select string_agg(format('%I = source.%I', attribute.attname, attribute.attname), ', ' order by attribute.attnum)
  into v_assignments
  from pg_attribute attribute
  where attribute.attrelid = p_table and attribute.attnum > 0 and not attribute.attisdropped
    and attribute.attname not in (
      'id','course_id','source_entity_id','identity_key','revision','cards_revision',
      'created_at','updated_at','deleted_at'
    )
    and attribute.attname !~ '_id$';
  if v_assignments is not null then
    execute format(
      'update %s target set %s from %s source '
      'where target.course_id = $2 and target.deleted_at is null '
      'and target.source_entity_id = source.id and source.course_id = $1',
      p_table, v_assignments, p_table
    ) using p_source_course_id, p_target_course_id;
  end if;
  execute format(
    'update %s target set identity_key = replace(source.identity_key, '
    '''course:'' || source_course.contract_key, ''course:'' || target_course.contract_key) '
    'from %s source, public.courses source_course, public.courses target_course '
    'where target.course_id = $2 and target.deleted_at is null '
    'and target.source_entity_id = source.id and source.course_id = $1 '
    'and source_course.id = $1 and target_course.id = $2 and source.identity_key is not null',
    p_table, p_table
  ) using p_source_course_id, p_target_course_id;
end;
$$;

create or replace function private.clone_course_tree(p_source_course_id uuid, p_target_course_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_table text;
begin
  insert into public.modules (id, course_id, source_entity_id, contract_key, position, title)
  select gen_random_uuid(), p_target_course_id, s.id, s.contract_key, s.position, s.title
  from public.modules s
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.lessons (id, course_id, module_id, source_entity_id, contract_key, position, title)
  select gen_random_uuid(), p_target_course_id, tm.id, s.id, s.contract_key, s.position, s.title
  from public.lessons s
  join public.modules tm on tm.course_id = p_target_course_id and tm.source_entity_id = s.module_id and tm.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.course_guides (id, course_id, module_id, lesson_id, source_entity_id, goal)
  select gen_random_uuid(), p_target_course_id, tm.id, tl.id, s.id, s.goal
  from public.course_guides s
  left join public.modules tm
    on tm.course_id = p_target_course_id and tm.source_entity_id = s.module_id and tm.deleted_at is null
  left join public.lessons tl
    on tl.course_id = p_target_course_id and tl.source_entity_id = s.lesson_id and tl.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null;

  insert into public.guide_items (id, course_id, guide_id, source_entity_id, item_kind, position, value)
  select gen_random_uuid(), p_target_course_id, tg.id, s.id, s.item_kind, s.position, s.value
  from public.guide_items s
  join public.course_guides tg
    on tg.course_id = p_target_course_id and tg.source_entity_id = s.guide_id and tg.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.item_kind, s.position, s.id;

  insert into public.lesson_topics (id, course_id, lesson_id, source_entity_id, contract_key, position, label, kind)
  select gen_random_uuid(), p_target_course_id, tl.id, s.id, s.contract_key, s.position, s.label, s.kind
  from public.lesson_topics s
  join public.lessons tl
    on tl.course_id = p_target_course_id and tl.source_entity_id = s.lesson_id and tl.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.topic_statements (id, course_id, topic_id, source_entity_id, statement_kind, position, value)
  select gen_random_uuid(), p_target_course_id, tt.id, s.id, s.statement_kind, s.position, s.value
  from public.topic_statements s
  join public.lesson_topics tt
    on tt.course_id = p_target_course_id and tt.source_entity_id = s.topic_id and tt.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.statement_kind, s.position, s.id;

  insert into public.microsequences (
    id, course_id, lesson_id, branch_of_id, source_entity_id, contract_key,
    position, title, goal, role, status, cards_revision
  )
  select gen_random_uuid(), p_target_course_id, tl.id, null, s.id, s.contract_key,
    s.position, s.title, s.goal, s.role, s.status, s.cards_revision
  from public.microsequences s
  join public.lessons tl
    on tl.course_id = p_target_course_id and tl.source_entity_id = s.lesson_id and tl.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  update public.microsequences target
  set branch_of_id = target_branch.id
  from public.microsequences source, public.microsequences target_branch
  where target.course_id = p_target_course_id
    and target.deleted_at is null
    and target.source_entity_id = source.id
    and source.course_id = p_source_course_id
    and source.branch_of_id is not null
    and target_branch.course_id = p_target_course_id
    and target_branch.deleted_at is null
    and target_branch.source_entity_id = source.branch_of_id;

  insert into public.microsequence_dependencies (
    id, course_id, lesson_id, microsequence_id, depends_on_microsequence_id,
    source_entity_id, position
  )
  select gen_random_uuid(), p_target_course_id, target_ms.lesson_id, target_ms.id,
    target_dep.id, s.id, s.position
  from public.microsequence_dependencies s
  join public.microsequences target_ms
    on target_ms.course_id = p_target_course_id and target_ms.source_entity_id = s.microsequence_id
      and target_ms.deleted_at is null
  join public.microsequences target_dep
    on target_dep.course_id = p_target_course_id and target_dep.source_entity_id = s.depends_on_microsequence_id
      and target_dep.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.microsequence_statements (
    id, course_id, microsequence_id, source_entity_id, statement_kind, position, value
  )
  select gen_random_uuid(), p_target_course_id, target_ms.id, s.id, s.statement_kind, s.position, s.value
  from public.microsequence_statements s
  join public.microsequences target_ms
    on target_ms.course_id = p_target_course_id and target_ms.source_entity_id = s.microsequence_id
      and target_ms.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.statement_kind, s.position, s.id;

  insert into public.cards (
    id, course_id, microsequence_id, lesson_id, source_entity_id, contract_key, position,
    resource, kind, exercise, title, after_text
  )
  select gen_random_uuid(), p_target_course_id, target_ms.id, target_ms.lesson_id, s.id, s.contract_key,
    s.position, s.resource, s.kind, s.exercise, s.title, s.after_text
  from public.cards s
  join public.microsequences target_ms
    on target_ms.course_id = p_target_course_id and target_ms.source_entity_id = s.microsequence_id
      and target_ms.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.card_blocks (
    id, course_id, card_id, parent_block_id, source_entity_id, contract_key,
    position, role, block_type, value_text, prompt, language, code, question,
    name, divider_after_column, scale_factor, result_text
  )
  select gen_random_uuid(), p_target_course_id, target_card.id, null, s.id, s.contract_key,
    s.position, s.role, s.block_type, s.value_text, s.prompt, s.language, s.code,
    s.question, s.name, s.divider_after_column, s.scale_factor, s.result_text
  from public.card_blocks s
  join public.cards target_card
    on target_card.course_id = p_target_course_id and target_card.source_entity_id = s.card_id
      and target_card.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null and s.parent_block_id is null
  order by s.position, s.id;

  insert into public.card_blocks (
    id, course_id, card_id, parent_block_id, source_entity_id, contract_key,
    position, role, block_type, value_text, prompt, language, code, question,
    name, divider_after_column, scale_factor, result_text
  )
  select gen_random_uuid(), p_target_course_id, target_card.id, target_parent.id, s.id, s.contract_key,
    s.position, s.role, s.block_type, s.value_text, s.prompt, s.language, s.code,
    s.question, s.name, s.divider_after_column, s.scale_factor, s.result_text
  from public.card_blocks s
  join public.cards target_card
    on target_card.course_id = p_target_course_id and target_card.source_entity_id = s.card_id
      and target_card.deleted_at is null
  join public.card_blocks target_parent
    on target_parent.course_id = p_target_course_id and target_parent.source_entity_id = s.parent_block_id
      and target_parent.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null and s.parent_block_id is not null
  order by s.position, s.id;

  insert into public.block_options (
    id, course_id, block_id, source_entity_id, contract_key, position, option_kind,
    text_value, language, code, is_correct, enabled
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, s.id, s.contract_key,
    s.position, s.option_kind, s.text_value, s.language, s.code, s.is_correct, s.enabled
  from public.block_options s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.block_nodes (
    id, course_id, block_id, parent_node_id, source_entity_id, identity_key,
    contract_key, position, node_scope, parent_contract_key, node_kind, label,
    x, y, has_x, has_y
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, null, s.id,
    replace(s.identity_key, 'course:' || source_course.contract_key, 'course:' || target_course.contract_key),
    s.contract_key, s.position, s.node_scope, s.parent_contract_key, s.node_kind,
    s.label, s.x, s.y, s.has_x, s.has_y
  from public.block_nodes s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  join public.courses source_course on source_course.id = p_source_course_id
  join public.courses target_course on target_course.id = p_target_course_id
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  update public.block_nodes target
  set parent_node_id = target_parent.id
  from public.block_nodes source, public.block_nodes target_parent
  where target.course_id = p_target_course_id
    and target.deleted_at is null
    and target.source_entity_id = source.id
    and source.course_id = p_source_course_id
    and source.parent_node_id is not null
    and target_parent.course_id = p_target_course_id
    and target_parent.deleted_at is null
    and target_parent.source_entity_id = source.parent_node_id;

  insert into public.flow_nodes (
    id, course_id, block_id, parent_node_id, parent_case_id, source_entity_id,
    identity_key, branch, position, contract_key, has_contract_key, node_kind,
    text, condition, expression, init, update, iterator, iterable, comment,
    has_text, has_condition, has_expression, has_init, has_update, has_iterator,
    has_iterable, has_cases, has_branches, has_items, has_then_branch,
    has_else_branch, has_body, has_default_branch, has_comment
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, null, null, s.id,
    replace(s.identity_key, 'course:' || source_course.contract_key, 'course:' || target_course.contract_key),
    s.branch, s.position, s.contract_key, s.has_contract_key, s.node_kind,
    s.text, s.condition, s.expression, s.init, s.update, s.iterator, s.iterable, s.comment,
    s.has_text, s.has_condition, s.has_expression, s.has_init, s.has_update, s.has_iterator,
    s.has_iterable, s.has_cases, s.has_branches, s.has_items, s.has_then_branch,
    s.has_else_branch, s.has_body, s.has_default_branch, s.has_comment
  from public.flow_nodes s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  join public.courses source_course on source_course.id = p_source_course_id
  join public.courses target_course on target_course.id = p_target_course_id
  where s.course_id = p_source_course_id and s.deleted_at is null;

  insert into public.flow_cases (
    id, course_id, block_id, flow_node_id, source_entity_id, identity_key,
    position, case_kind, contract_key, has_contract_key, condition, match,
    has_then_branch, has_body, has_items
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, target_node.id, s.id,
    replace(s.identity_key, 'course:' || source_course.contract_key, 'course:' || target_course.contract_key),
    s.position, s.case_kind, s.contract_key, s.has_contract_key, s.condition, s.match,
    s.has_then_branch, s.has_body, s.has_items
  from public.flow_cases s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  join public.flow_nodes target_node
    on target_node.course_id = p_target_course_id and target_node.source_entity_id = s.flow_node_id
      and target_node.deleted_at is null
  join public.courses source_course on source_course.id = p_source_course_id
  join public.courses target_course on target_course.id = p_target_course_id
  where s.course_id = p_source_course_id and s.deleted_at is null;

  update public.flow_nodes target set
    parent_node_id = target_parent.id,
    parent_case_id = target_case.id
  from public.flow_nodes source
  left join public.flow_nodes target_parent
    on target_parent.course_id = p_target_course_id and target_parent.source_entity_id = source.parent_node_id
      and target_parent.deleted_at is null
  left join public.flow_cases target_case
    on target_case.course_id = p_target_course_id and target_case.source_entity_id = source.parent_case_id
      and target_case.deleted_at is null
  where target.course_id = p_target_course_id and target.deleted_at is null
    and target.source_entity_id = source.id
    and source.course_id = p_source_course_id;

  insert into public.flow_practices (
    id, course_id, source_entity_id, blank_shape, identity_key,
    owner_type, flow_node_id, flow_case_id, has_blank_shape,
    has_blank_text, blank_text, has_blank_label, blank_label
  )
  select gen_random_uuid(), p_target_course_id, s.id, s.blank_shape,
    replace(s.identity_key, 'course:' || source_course.contract_key, 'course:' || target_course.contract_key),
    s.owner_type, target_node.id, target_case.id,
    s.has_blank_shape, s.has_blank_text, s.blank_text, s.has_blank_label, s.blank_label
  from public.flow_practices s
  left join public.flow_nodes target_node
    on target_node.course_id = p_target_course_id and target_node.source_entity_id = s.flow_node_id
      and target_node.deleted_at is null
  left join public.flow_cases target_case
    on target_case.course_id = p_target_course_id and target_case.source_entity_id = s.flow_case_id
      and target_case.deleted_at is null
  join public.courses source_course on source_course.id = p_source_course_id
  join public.courses target_course on target_course.id = p_target_course_id
  where s.course_id = p_source_course_id and s.deleted_at is null and s.owner_type is not null;

  insert into public.node_practices (
    id, course_id, practice_id, source_entity_id, identity_key, entry_kind,
    label_key, blank, mode, position, was_boolean, has_blank, has_mode
  )
  select gen_random_uuid(), p_target_course_id, target_practice.id, s.id,
    replace(s.identity_key, 'course:' || source_course.contract_key, 'course:' || target_course.contract_key),
    s.entry_kind, s.label_key, s.blank, s.mode, s.position,
    s.was_boolean, s.has_blank, s.has_mode
  from public.node_practices s
  join public.flow_practices target_practice
    on target_practice.course_id = p_target_course_id and target_practice.source_entity_id = s.practice_id
      and target_practice.deleted_at is null
  join public.courses source_course on source_course.id = p_source_course_id
  join public.courses target_course on target_course.id = p_target_course_id
  where s.course_id = p_source_course_id and s.deleted_at is null and s.practice_id is not null;

  insert into public.node_practice_items (
    id, course_id, entry_id, flow_practice_id, source_entity_id, identity_key,
    contract_key, position, item_kind, value, was_primitive, has_contract_key,
    enabled, has_enabled, regex, has_regex
  )
  select gen_random_uuid(), p_target_course_id, target_entry.id, target_practice.id, s.id,
    replace(s.identity_key, 'course:' || source_course.contract_key, 'course:' || target_course.contract_key),
    s.contract_key, s.position, s.item_kind, s.value, s.was_primitive,
    s.has_contract_key, s.enabled, s.has_enabled, s.regex, s.has_regex
  from public.node_practice_items s
  left join public.node_practices target_entry
    on target_entry.course_id = p_target_course_id and target_entry.source_entity_id = s.entry_id
      and target_entry.deleted_at is null
  left join public.flow_practices target_practice
    on target_practice.course_id = p_target_course_id and target_practice.source_entity_id = s.flow_practice_id
      and target_practice.deleted_at is null
  join public.courses source_course on source_course.id = p_source_course_id
  join public.courses target_course on target_course.id = p_target_course_id
  where s.course_id = p_source_course_id and s.deleted_at is null
    and (s.entry_id is not null or s.flow_practice_id is not null);

  insert into public.block_edges (
    id, course_id, block_id, from_node_id, to_node_id, source_entity_id,
    contract_key, position, edge_role, label, weight, directed
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, target_from.id,
    target_to.id, s.id, s.contract_key, s.position, s.edge_role, s.label,
    s.weight, s.directed
  from public.block_edges s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  join public.block_nodes target_from
    on target_from.course_id = p_target_course_id and target_from.source_entity_id = s.from_node_id
      and target_from.deleted_at is null
  join public.block_nodes target_to
    on target_to.course_id = p_target_course_id and target_to.source_entity_id = s.to_node_id
      and target_to.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.block_matrix_items (
    id, course_id, block_id, source_entity_id, contract_key, position, item_kind,
    name, connector, divider_after_column, row_count, column_count
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, s.id, s.contract_key,
    s.position, s.item_kind, s.name, s.connector, s.divider_after_column,
    s.row_count, s.column_count
  from public.block_matrix_items s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.block_cells (
    id, course_id, block_id, matrix_item_id, source_entity_id, row_index, column_index,
    cell_role, text_value
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, target_item.id, s.id, s.row_index,
    s.column_index, s.cell_role, s.text_value
  from public.block_cells s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  left join public.block_matrix_items target_item
    on target_item.course_id = p_target_course_id and target_item.source_entity_id = s.matrix_item_id
      and target_item.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null;

  insert into public.block_points (
    id, course_id, block_id, source_entity_id, contract_key, position, point_kind,
    group_index, x, y, label
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, s.id, s.contract_key,
    s.position, s.point_kind, s.group_index, s.x, s.y, s.label
  from public.block_points s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.block_lines (
    id, course_id, block_id, source_entity_id, contract_key, position, line_kind,
    x1, y1, x2, y2, label
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, s.id, s.contract_key,
    s.position, s.line_kind, s.x1, s.y1, s.x2, s.y2, s.label
  from public.block_lines s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.block_highlights (
    id, course_id, block_id, matrix_item_id, target_node_id, secondary_node_id,
    source_entity_id, position, target_kind, text_value, row_index, column_index
  )
  select gen_random_uuid(), p_target_course_id, target_block.id, target_item.id,
    target_node.id, target_secondary.id, s.id, s.position, s.target_kind,
    s.text_value, s.row_index, s.column_index
  from public.block_highlights s
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = s.block_id
      and target_block.deleted_at is null
  left join public.block_matrix_items target_item
    on target_item.course_id = p_target_course_id and target_item.source_entity_id = s.matrix_item_id
      and target_item.deleted_at is null
  left join public.block_nodes target_node
    on target_node.course_id = p_target_course_id and target_node.source_entity_id = s.target_node_id
      and target_node.deleted_at is null
  left join public.block_nodes target_secondary
    on target_secondary.course_id = p_target_course_id and target_secondary.source_entity_id = s.secondary_node_id
      and target_secondary.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.position, s.id;

  insert into public.card_refs (
    id, course_id, card_id, topic_id, source_entity_id, ref_kind, position, value
  )
  select gen_random_uuid(), p_target_course_id, target_card.id, target_topic.id,
    s.id, s.ref_kind, s.position, s.value
  from public.card_refs s
  join public.cards target_card
    on target_card.course_id = p_target_course_id and target_card.source_entity_id = s.card_id
      and target_card.deleted_at is null
  left join public.lesson_topics target_topic
    on target_topic.course_id = p_target_course_id and target_topic.source_entity_id = s.topic_id
      and target_topic.deleted_at is null
  where s.course_id = p_source_course_id and s.deleted_at is null
  order by s.ref_kind, s.position, s.id;

  foreach v_table in array array[
    'modules','lessons','course_guides','guide_items','lesson_topics','topic_statements',
    'microsequences','microsequence_dependencies','microsequence_statements','cards',
    'card_blocks','block_options','block_nodes','flow_nodes','flow_cases','flow_practices',
    'node_practices','node_practice_items','block_edges','block_matrix_items','block_cells',
    'block_points','block_lines','block_highlights','card_refs'
  ] loop
    perform private.copy_clone_scalar_projection(
      ('public.' || v_table)::regclass, p_source_course_id, p_target_course_id
    );
  end loop;

  update public.course_guides target set
    owner_type = source.owner_type,
    owner_id = coalesce(target_module.id, target_lesson.id)
  from public.course_guides source
  left join public.modules target_module
    on target_module.course_id = p_target_course_id and target_module.source_entity_id = source.owner_id
      and target_module.deleted_at is null
  left join public.lessons target_lesson
    on target_lesson.course_id = p_target_course_id and target_lesson.source_entity_id = source.owner_id
      and target_lesson.deleted_at is null
  where target.course_id = p_target_course_id and target.deleted_at is null
    and target.source_entity_id = source.id
    and source.course_id = p_source_course_id;

  update public.cards target set lesson_id = target_lesson.id
  from public.cards source
  join public.lessons target_lesson
    on target_lesson.course_id = p_target_course_id and target_lesson.source_entity_id = source.lesson_id
      and target_lesson.deleted_at is null
  where target.course_id = p_target_course_id and target.deleted_at is null
    and target.source_entity_id = source.id
    and source.course_id = p_source_course_id;

  update public.block_cells target set block_id = target_block.id
  from public.block_cells source
  join public.card_blocks target_block
    on target_block.course_id = p_target_course_id and target_block.source_entity_id = source.block_id
      and target_block.deleted_at is null
  where target.course_id = p_target_course_id and target.deleted_at is null
    and target.source_entity_id = source.id
    and source.course_id = p_source_course_id;

  update public.block_lines target set
    from_point_id = target_from.id,
    to_point_id = target_to.id
  from public.block_lines source
  left join public.block_points target_from
    on target_from.course_id = p_target_course_id and target_from.source_entity_id = source.from_point_id
      and target_from.deleted_at is null
  left join public.block_points target_to
    on target_to.course_id = p_target_course_id and target_to.source_entity_id = source.to_point_id
      and target_to.deleted_at is null
  where target.course_id = p_target_course_id and target.deleted_at is null
    and target.source_entity_id = source.id
    and source.course_id = p_source_course_id;
end;
$$;

create or replace function public.clone_catalog_course(p_source_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.courses%rowtype;
  v_target_id uuid := gen_random_uuid();
  v_target_contract_key text;
  v_target_position integer;
  v_source_hash text;
  v_target_hash text;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  perform private.lock_course_write(p_source_course_id);
  select * into v_source from public.courses
  where id = p_source_course_id and kind = 'official' and status = 'published' and deleted_at is null
  for share;
  if not found then
    raise exception 'Curso oficial publicado não encontrado.' using errcode = '22023';
  end if;

  v_target_contract_key := v_source.contract_key || '-' || left(replace(v_target_id::text, '-', ''), 8);
  perform pg_advisory_xact_lock(hashtextextended('course-position:' || v_user_id::text, 0));
  select coalesce(max(position) + 1, 0) into v_target_position
  from public.courses
  where kind = 'personal' and owner_id = v_user_id and deleted_at is null;

  v_source_hash := coalesce(v_source.content_hash, private.course_content_hash(v_source.id));
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  insert into public.courses (
    id, owner_id, kind, status, source_course_id, source_entity_id,
    source_publication_seq, source_content_hash, baseline_content_hash, contract_key, title, goal,
    contract_scope,
    publication_seq, content_hash, identity_key, position
  ) values (
    v_target_id, v_user_id, 'personal', 'active', v_source.id, v_source.id,
    v_source.publication_seq, v_source_hash, v_source_hash, v_target_contract_key, v_source.title,
    v_source.goal, v_source.contract_scope, 0, null,
    case when v_source.identity_key is null then 'course:' || v_target_contract_key
      else replace(v_source.identity_key, 'course:' || v_source.contract_key, 'course:' || v_target_contract_key) end,
    v_target_position
  );
  insert into public.course_memberships (course_id, user_id, role, position)
  values (v_target_id, v_user_id, 'owner', 0);
  perform private.clone_course_tree(v_source.id, v_target_id);
  v_target_hash := private.course_content_hash(v_target_id);
  update public.courses
  set content_hash = v_target_hash, baseline_content_hash = v_target_hash,
      personalized_at = null
  where id = v_target_id;
  perform set_config('aralearn.suppress_course_dirty', 'off', true);
  return v_target_id;
end;
$$;

create or replace function private.soft_delete_course_tree(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'guide_items', 'topic_statements', 'microsequence_dependencies',
    'microsequence_statements', 'block_options', 'node_practice_items',
    'node_practices', 'flow_practices', 'flow_cases', 'flow_nodes',
    'block_edges', 'block_cells', 'block_highlights',
    'block_matrix_items', 'block_points', 'block_lines', 'card_refs',
    'block_nodes', 'card_blocks', 'cards', 'lesson_topics', 'course_guides',
    'microsequences', 'lessons', 'modules'
  ] loop
    execute format(
      'update public.%I set deleted_at = now() where course_id = $1 and deleted_at is null',
      v_table
    ) using p_course_id;
  end loop;
end;
$$;

create or replace function private.lock_course_write(p_course_id uuid)
returns void
language sql
volatile
set search_path = pg_catalog
as $$
  select pg_advisory_xact_lock(
    hashtextextended('aralearn-course-write:' || p_course_id::text, 0)
  );
$$;

drop function if exists public.delete_personal_course(uuid, uuid);

create or replace function public.delete_personal_course(
  p_course_id uuid,
  p_base_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_course public.courses%rowtype;
  v_deleted_course public.courses%rowtype;
  v_existing private.rpc_idempotency%rowtype;
  v_result jsonb;
  v_member_ids uuid[];
  v_fingerprint text;
begin
  if v_user_id is null or p_mutation_id is null then
    raise exception 'Autenticação e mutationId são obrigatórios.' using errcode = '42501';
  end if;
  if p_base_revision is null or p_base_revision < 0 then
    raise exception 'baseRevision deve ser não negativa.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_mutation_id::text, 0)
  );
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'operation', 'delete_personal_course', 'courseId', p_course_id,
    'baseRevision', p_base_revision
  )::text, 'sha256'), 'hex');
  select * into v_existing from private.rpc_idempotency
  where user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_existing.operation <> 'delete_personal_course'
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'mutationId já foi usado com outra operação.' using errcode = '23505';
    end if;
    return v_existing.result_payload || jsonb_build_object('idempotent', true);
  end if;

  perform private.lock_course_write(p_course_id);

  select * into v_course from public.courses
  where id = p_course_id and kind = 'personal'
  for update;
  if not found then
    v_result := jsonb_build_object(
      'status', 'applied', 'mutationId', p_mutation_id,
      'courseId', p_course_id, 'noop', true
    );
    insert into private.rpc_idempotency (
      user_id, mutation_id, operation, request_fingerprint, result_payload
    ) values (
      v_user_id, p_mutation_id, 'delete_personal_course', v_fingerprint, v_result
    );
    return v_result;
  end if;
  if not public.is_app_admin() and v_course.owner_id is distinct from v_user_id then
    raise exception 'Somente owner pode excluir o curso pessoal.' using errcode = '42501';
  end if;
  if v_course.deleted_at is not null then
    v_result := jsonb_build_object(
      'status', 'applied', 'mutationId', p_mutation_id,
      'courseId', p_course_id, 'noop', true
    );
    insert into private.rpc_idempotency (
      user_id, mutation_id, operation, request_course_id, result_course_id,
      request_fingerprint, result_payload
    ) values (
      v_user_id, p_mutation_id, 'delete_personal_course', p_course_id, p_course_id,
      v_fingerprint, v_result
    );
    return v_result;
  end if;

  if v_course.revision <> p_base_revision then
    v_result := jsonb_build_object(
      'status', 'conflict', 'reason', 'revision_mismatch',
      'mutationId', p_mutation_id, 'courseId', p_course_id,
      'baseRevision', p_base_revision, 'remoteRevision', v_course.revision,
      'remoteRow', private.local_row('courses', to_jsonb(v_course)),
      'noop', false
    );
    insert into private.rpc_idempotency (
      user_id, mutation_id, operation, request_course_id, result_course_id,
      request_fingerprint, result_payload
    ) values (
      v_user_id, p_mutation_id, 'delete_personal_course', p_course_id, p_course_id,
      v_fingerprint, v_result
    );
    return v_result;
  end if;

  select array_agg(membership.user_id) into v_member_ids
  from public.course_memberships membership
  where membership.course_id = p_course_id and membership.deleted_at is null;
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  perform private.soft_delete_course_tree(p_course_id);
  update public.card_progress set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.lesson_progress set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.card_comments set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.course_memberships set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.courses set deleted_at = now()
  where id = p_course_id and deleted_at is null
  returning * into v_deleted_course;
  insert into public.sync_changes (
    audience_user_id, course_id, entity_type, entity_id, operation, entity_revision, row_data
  )
  select member_id, p_course_id, 'courses', p_course_id, 'delete',
    v_deleted_course.revision, to_jsonb(v_deleted_course)
  from unnest(coalesce(v_member_ids, '{}'::uuid[])) member_id;
  perform set_config('aralearn.suppress_course_dirty', 'off', true);

  v_result := jsonb_build_object(
    'status', 'applied', 'mutationId', p_mutation_id,
    'courseId', p_course_id, 'revision', v_deleted_course.revision,
    'noop', false
  );
  insert into private.rpc_idempotency (
    user_id, mutation_id, operation, request_course_id, result_course_id,
    request_fingerprint, result_payload
  ) values (
    v_user_id, p_mutation_id, 'delete_personal_course', p_course_id, p_course_id,
    v_fingerprint, v_result
  );
  return v_result;
end;
$$;

create or replace function public.refresh_personal_course_from_source(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_personal public.courses%rowtype;
  v_source public.courses%rowtype;
  v_current_hash text;
  v_source_hash text;
  v_target_hash text;
begin
  if v_user_id is null or not public.user_can_edit_course(p_course_id) then
    raise exception 'Curso pessoal não autorizado.' using errcode = '42501';
  end if;

  perform private.lock_course_write(p_course_id);

  select * into v_personal from public.courses
  where id = p_course_id and kind = 'personal' and deleted_at is null
  for update;
  if not found or v_personal.source_course_id is null then
    raise exception 'Curso pessoal não possui origem oficial.' using errcode = '22023';
  end if;

  select * into v_source from public.courses
  where id = v_personal.source_course_id and kind = 'official'
    and status = 'published' and deleted_at is null
  for share;
  if not found then
    raise exception 'Origem oficial publicada não encontrada.' using errcode = '22023';
  end if;

  v_current_hash := private.course_content_hash(p_course_id);
  if v_personal.personalized_at is not null or v_personal.baseline_content_hash is null
     or v_current_hash <> v_personal.baseline_content_hash then
    update public.courses
    set content_hash = v_current_hash, personalized_at = coalesce(personalized_at, now())
    where id = p_course_id;
    raise exception 'Curso personalizado; crie uma nova cópia da publicação atual.' using errcode = '23514';
  end if;

  v_source_hash := coalesce(v_source.content_hash, private.course_content_hash(v_source.id));
  if v_personal.source_publication_seq = v_source.publication_seq
     and v_current_hash = v_personal.baseline_content_hash then
    update public.courses set content_hash = v_current_hash, personalized_at = null where id = p_course_id;
    return p_course_id;
  end if;

  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  perform private.soft_delete_course_tree(p_course_id);
  perform private.clone_course_tree(v_source.id, p_course_id);

  set constraints card_progress_lesson_progress_fk deferred;
  update public.lesson_progress progress
  set lesson_id = target.id,
      module_id = target.module_id,
      source_entity_id = target.source_entity_id,
      course_key = personal.contract_key,
      module_key = target_module.contract_key,
      lesson_key = target.contract_key,
      path_key = personal.contract_key || '::' || target_module.contract_key || '::' || target.contract_key
  from public.lessons old_lesson,
       public.lessons target,
       public.modules target_module,
       public.courses personal
  where progress.course_id = p_course_id
    and progress.lesson_id = old_lesson.id
    and old_lesson.course_id = p_course_id and old_lesson.deleted_at is not null
    and target.course_id = p_course_id and target.deleted_at is null
    and target.source_entity_id = old_lesson.source_entity_id
    and target_module.id = target.module_id and target_module.deleted_at is null
    and personal.id = p_course_id;

  update public.card_progress progress
  set card_id = target.id,
      lesson_id = target.lesson_id,
      module_id = target_lesson.module_id,
      source_entity_id = target.source_entity_id,
      path_key = personal.contract_key || '::' || target_module.contract_key || '::' || target_lesson.contract_key,
      card_key = target.contract_key,
      position = target.position
  from public.cards old_card,
       public.cards target,
       public.lessons target_lesson,
       public.modules target_module,
       public.courses personal
  where progress.course_id = p_course_id
    and progress.card_id = old_card.id
    and old_card.course_id = p_course_id and old_card.deleted_at is not null
    and target.course_id = p_course_id and target.deleted_at is null
    and target.source_entity_id = old_card.source_entity_id
    and target_lesson.id = target.lesson_id and target_lesson.deleted_at is null
    and target_module.id = target_lesson.module_id and target_module.deleted_at is null
    and personal.id = p_course_id;

  update public.card_comments comment
  set card_id = target.id, lesson_id = target.lesson_id,
      module_id = target_lesson.module_id, microsequence_id = target.microsequence_id,
      source_entity_id = target.source_entity_id,
      course_key = personal.contract_key,
      module_key = target_module.contract_key,
      lesson_key = target_lesson.contract_key,
      microsequence_key = target_microsequence.contract_key,
      card_key = target.contract_key
  from public.cards old_card,
       public.cards target,
       public.lessons target_lesson,
       public.modules target_module,
       public.microsequences target_microsequence,
       public.courses personal
  where comment.course_id = p_course_id
    and comment.card_id = old_card.id
    and old_card.course_id = p_course_id and old_card.deleted_at is not null
    and target.course_id = p_course_id and target.deleted_at is null
    and target.source_entity_id = old_card.source_entity_id
    and target_lesson.id = target.lesson_id and target_lesson.deleted_at is null
    and target_module.id = target_lesson.module_id and target_module.deleted_at is null
    and target_microsequence.id = target.microsequence_id and target_microsequence.deleted_at is null
    and personal.id = p_course_id;

  update public.lesson_progress p set deleted_at = now()
  where p.course_id = p_course_id and p.deleted_at is null
    and not exists (
      select 1 from public.lessons l where l.id = p.lesson_id and l.course_id = p_course_id and l.deleted_at is null
    );
  update public.card_progress p set deleted_at = now()
  where p.course_id = p_course_id and p.deleted_at is null
    and not exists (
      select 1 from public.cards c where c.id = p.card_id and c.course_id = p_course_id and c.deleted_at is null
    );
  update public.card_comments c set deleted_at = now()
  where c.course_id = p_course_id and c.deleted_at is null
    and not exists (
      select 1 from public.cards card where card.id = c.card_id and card.course_id = p_course_id and card.deleted_at is null
    );

  update public.courses
  set source_publication_seq = v_source.publication_seq,
      source_content_hash = v_source_hash,
      title = v_source.title,
      goal = v_source.goal,
      contract_scope = v_source.contract_scope,
      personalized_at = null
  where id = p_course_id;
  v_target_hash := private.course_content_hash(p_course_id);
  update public.courses
  set baseline_content_hash = v_target_hash,
      content_hash = v_target_hash,
      personalized_at = null
  where id = p_course_id;
  perform set_config('aralearn.suppress_course_dirty', 'off', true);
  return p_course_id;
end;
$$;

-- Idempotent PostgREST overloads used by the catalog client.  A mutationId is
-- globally single-use per user; replay returns the original result UUID.
create or replace function public.clone_catalog_course(
  p_source_course_id uuid,
  p_mutation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing private.rpc_idempotency%rowtype;
  v_result_course_id uuid;
begin
  if v_user_id is null or p_mutation_id is null then
    raise exception 'Autenticação e mutationId são obrigatórios.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_mutation_id::text, 0));
  select * into v_existing from private.rpc_idempotency
  where user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_existing.operation <> 'clone_catalog_course'
       or v_existing.request_course_id <> p_source_course_id then
      raise exception 'mutationId já foi usado por outra operação.' using errcode = '23505';
    end if;
    return v_existing.result_course_id;
  end if;
  v_result_course_id := public.clone_catalog_course(p_source_course_id);
  insert into private.rpc_idempotency (
    user_id, mutation_id, operation, request_course_id, result_course_id
  ) values (
    v_user_id, p_mutation_id, 'clone_catalog_course', p_source_course_id, v_result_course_id
  );
  return v_result_course_id;
end;
$$;

create or replace function public.refresh_personal_course_from_source(
  p_personal_course_id uuid,
  p_mutation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing private.rpc_idempotency%rowtype;
  v_result_course_id uuid;
begin
  if v_user_id is null or p_mutation_id is null then
    raise exception 'Autenticação e mutationId são obrigatórios.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_mutation_id::text, 0));
  select * into v_existing from private.rpc_idempotency
  where user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_existing.operation <> 'refresh_personal_course'
       or v_existing.request_course_id <> p_personal_course_id then
      raise exception 'mutationId já foi usado por outra operação.' using errcode = '23505';
    end if;
    return v_existing.result_course_id;
  end if;
  v_result_course_id := public.refresh_personal_course_from_source(p_personal_course_id);
  insert into private.rpc_idempotency (
    user_id, mutation_id, operation, request_course_id, result_course_id
  ) values (
    v_user_id, p_mutation_id, 'refresh_personal_course', p_personal_course_id, v_result_course_id
  );
  return v_result_course_id;
end;
$$;

-- Ordered collections are deliberately not protected by immediate UNIQUE
-- indexes: a client can swap two adjacent positions in one sync batch without
-- either intermediate row colliding.  The complete graph is checked here
-- before validation/publication, when positions must be unique and contiguous.
create or replace function private.position_findings(p_course_id uuid)
returns table(code text, path text, message text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_table text;
  v_scope_expression text;
  v_path_prefix text;
  v_start_position integer;
begin
  for v_table, v_scope_expression, v_path_prefix, v_start_position in
    select * from (values
      ('modules', 'course_id::text', '$.__relationalOrder.modules', 0),
      ('lessons', 'module_id::text', '$.__relationalOrder.lessons', 0),
      ('guide_items', 'concat_ws(''/'', guide_id::text, item_kind)', '$.__relationalOrder.guideItems', 0),
      ('lesson_topics', 'lesson_id::text', '$.__relationalOrder.topics', 0),
      ('topic_statements', 'concat_ws(''/'', topic_id::text, statement_kind)', '$.__relationalOrder.topicStatements', 0),
      ('microsequences', 'lesson_id::text', '$.__relationalOrder.microsequences', 0),
      ('microsequence_dependencies', 'microsequence_id::text', '$.__relationalOrder.dependencies', 0),
      ('microsequence_statements', 'concat_ws(''/'', microsequence_id::text, statement_kind)', '$.__relationalOrder.microsequenceStatements', 0),
      ('cards', 'microsequence_id::text', '$.__relationalOrder.cards', 1),
      ('card_blocks', 'concat_ws(''/'', card_id::text, role::text)', '$.__relationalOrder.blocks', 0),
      ('block_options', 'block_id::text', '$.__relationalOrder.options', 0),
      ('block_nodes', 'concat_ws(''/'', block_id::text, node_scope)', '$.__relationalOrder.nodes', 0),
      ('flow_nodes', 'concat_ws(''/'', block_id::text, coalesce(parent_node_id::text, ''root''), coalesce(parent_case_id::text, ''root''), branch)', '$.__relationalOrder.flowNodes', 0),
      ('flow_cases', 'flow_node_id::text', '$.__relationalOrder.flowCases', 0),
      ('node_practices', 'concat_ws(''/'', practice_id::text, entry_kind)', '$.__relationalOrder.flowPracticeEntries', 0),
      ('node_practice_items', 'concat_ws(''/'', coalesce(entry_id, flow_practice_id)::text, item_kind)', '$.__relationalOrder.flowPracticeItems', 0),
      ('block_edges', 'block_id::text', '$.__relationalOrder.edges', 0),
      ('block_matrix_items', 'concat_ws(''/'', block_id::text, is_sequence)', '$.__relationalOrder.matrixItems', 0),
      ('block_points', 'concat_ws(''/'', block_id::text, point_kind)', '$.__relationalOrder.points', 0),
      ('block_lines', 'concat_ws(''/'', block_id::text, line_role)', '$.__relationalOrder.lines', 0),
      ('block_highlights', 'concat_ws(''/'', block_id::text, coalesce(matrix_item_id::text, ''root''), selection_type)', '$.__relationalOrder.highlights', 0),
      ('card_refs', 'concat_ws(''/'', card_id::text, ref_kind)', '$.__relationalOrder.cardRefs', 0)
    ) config(table_name, scope_expression, path_prefix, start_position)
  loop
    return query execute format(
      'select ''position.invalid''::text, %L || ''['' || coalesce(grouped.scope_key, ''null'') || '']''::text, '
      '       ''Posições ativas precisam ser únicas e contíguas no índice inicial do contrato.''::text '
      'from ('
      '  select (%s)::text scope_key, count(*) total, count(distinct position) distinct_positions, '
      '         min(position) min_position, max(position) max_position '
      '  from public.%I where course_id = $1 and deleted_at is null group by %s'
      ') grouped '
      'where grouped.total <> grouped.distinct_positions '
      '   or grouped.min_position <> %s '
      '   or grouped.max_position <> grouped.total - 1 + %s',
      v_path_prefix, v_scope_expression, v_table, v_scope_expression,
      v_start_position, v_start_position
    ) using p_course_id;
  end loop;
end;
$$;

create or replace function public.validate_course_graph(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_errors jsonb;
  v_valid boolean;
  v_publishable boolean;
begin
  if not public.user_can_read_course(p_course_id) and not public.is_app_admin() then
    raise exception 'Curso não autorizado.' using errcode = '42501';
  end if;

  with findings as (
    select 'course.empty' code, '$.modules' path, 'Curso precisa ter ao menos um módulo.' message
    where not exists (select 1 from public.modules where course_id = p_course_id and deleted_at is null)
    union all
    select 'module.guide_missing', '$.modules[' || m.contract_key || '].guide', 'Módulo precisa de guide.'
    from public.modules m
    where m.course_id = p_course_id and m.deleted_at is null
      and not exists (select 1 from public.course_guides g where g.module_id = m.id and g.deleted_at is null)
    union all
    select 'module.lesson_missing', '$.modules[' || m.contract_key || '].lessons', 'Módulo precisa ter ao menos uma lição.'
    from public.modules m
    where m.course_id = p_course_id and m.deleted_at is null
      and not exists (select 1 from public.lessons l where l.module_id = m.id and l.deleted_at is null)
    union all
    select 'lesson.guide_missing', '$.lessons[' || l.contract_key || '].guide', 'Lição precisa de guide.'
    from public.lessons l
    where l.course_id = p_course_id and l.deleted_at is null
      and not exists (select 1 from public.course_guides g where g.lesson_id = l.id and g.deleted_at is null)
    union all
    select 'lesson.microsequence_missing', '$.lessons[' || l.contract_key || '].microsequences',
      'Lição precisa ter ao menos uma microssequência.'
    from public.lessons l
    where l.course_id = p_course_id and l.deleted_at is null
      and not exists (select 1 from public.microsequences m where m.lesson_id = l.id and m.deleted_at is null)
    union all
    select 'microsequence.cards_missing', '$.microsequences[' || ms.contract_key || '].cards',
      'Microssequência materializada precisa ter cards.'
    from public.microsequences ms
    where ms.course_id = p_course_id and ms.deleted_at is null and ms.status <> 'planned'
      and not exists (select 1 from public.cards c where c.microsequence_id = ms.id and c.deleted_at is null)
    union all
    select 'microsequence.not_ready', '$.microsequences[' || ms.contract_key || '].status',
      'Publicação exige todas as microssequências em ready.'
    from public.microsequences ms
    where ms.course_id = p_course_id and ms.deleted_at is null and ms.status <> 'ready'
    union all
    select 'dependency.not_previous', '$.microsequences[' || ms.contract_key || '].dependsOn',
      'Dependência precisa apontar para microssequência anterior da mesma lição.'
    from public.microsequence_dependencies d
    join public.microsequences ms on ms.id = d.microsequence_id
    join public.microsequences dep on dep.id = d.depends_on_microsequence_id
    where d.course_id = p_course_id and d.deleted_at is null and dep.position >= ms.position
    union all
    select 'card.primary_block_missing', '$.cards[' || c.contract_key || ']',
      'Card precisa de exatamente um bloco primário.'
    from public.cards c
    where c.course_id = p_course_id and c.deleted_at is null and c.resource <> 'composite'
      and (select count(*) from public.card_blocks b
           where b.card_id = c.id and b.role = 'primary' and b.deleted_at is null) <> 1
    union all
    select 'card.composite_blocks_invalid', '$.cards[' || c.contract_key || '].blocks',
      'Card composite precisa de ao menos um bloco composite e nenhum bloco primário.'
    from public.cards c
    where c.course_id = p_course_id and c.deleted_at is null and c.resource = 'composite'
      and (
        (select count(*) from public.card_blocks b
         where b.card_id = c.id and b.role = 'composite' and b.deleted_at is null) < 1
        or (select count(*) from public.card_blocks b
            where b.card_id = c.id and b.role = 'primary' and b.deleted_at is null) <> 0
      )
    union all
    select 'card.primary_resource_mismatch', '$.cards[' || c.contract_key || '].resource',
      'Tipo do bloco primário diverge do resource do card.'
    from public.cards c join public.card_blocks b on b.card_id = c.id and b.role = 'primary' and b.deleted_at is null
    where c.course_id = p_course_id and c.deleted_at is null and c.resource <> 'composite'
      and b.block_type <> c.resource::text
    union all
    select 'contract.projection_mismatch', '$.cards[' || c.contract_key || ']',
      'Projeção relacional do card diverge dos campos públicos com presença explícita.'
    from public.cards c
    where c.course_id = p_course_id and c.deleted_at is null
      and (c.card_kind is distinct from c.kind or c.has_after is distinct from (c.after is not null))
    union all
    select 'contract.projection_mismatch', '$.blocks[' || b.contract_key || ']',
      'Projeção relacional do bloco diverge dos campos públicos com presença explícita.'
    from public.card_blocks b
    where b.course_id = p_course_id and b.deleted_at is null and (
      b.is_primary is distinct from (b.role = 'primary')
      or b.region is distinct from case b.role when 'primary' then 'primary' when 'composite' then 'content' else 'after' end
      or b.has_value is distinct from (b.value is not null)
      or b.has_prompt is distinct from (b.prompt is not null)
      or b.has_question is distinct from (b.question is not null)
      or b.has_language is distinct from (b.language is not null)
      or b.has_code is distinct from (b.code is not null)
      or b.has_name is distinct from (b.name is not null)
      or b.has_divider_after_column is distinct from (b.divider_after_column is not null)
      or b.has_x_range is distinct from (b.x_range is not null)
      or b.has_y_range is distinct from (b.y_range is not null)
      or b.has_scale is distinct from (b.scale_k is not null)
      or b.has_result is distinct from (b.result_text is not null)
    )
    union all
    select 'choice.options_invalid', '$.blocks[' || b.contract_key || '].options',
      'Bloco choice precisa de 3 ou 4 opções e exatamente uma correta.'
    from public.card_blocks b
    where b.course_id = p_course_id and b.deleted_at is null and b.block_type = 'choice'
      and ((select count(*) from public.block_options o where o.block_id = b.id and o.deleted_at is null) not between 3 and 4
        or (select count(*) from public.block_options o where o.block_id = b.id and o.deleted_at is null and o.is_correct) <> 1)
    union all
    select 'grid.cell_out_of_bounds', '$.matrixItems[' || mi.contract_key || '].cells',
      'Célula fora das dimensões declaradas.'
    from public.block_cells cell join public.block_matrix_items mi on mi.id = cell.matrix_item_id
    where cell.course_id = p_course_id and cell.deleted_at is null
      and (cell.row_index >= mi.row_count or cell.column_index >= mi.column_count)
    union all
    select 'flow.root_invalid', '$.blocks[' || b.contract_key || '].structure',
      'Flow precisa de uma única raiz sequence.'
    from public.card_blocks b
    where b.course_id = p_course_id and b.deleted_at is null and b.block_type = 'flow'
      and (select count(*) from public.flow_nodes n
           where n.block_id = b.id and n.node_kind = 'sequence'
             and n.parent_node_id is null and n.parent_case_id is null and n.deleted_at is null) <> 1
    union all
    select position_error.code, position_error.path, position_error.message
    from private.position_findings(p_course_id) position_error
  )
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'path', path, 'message', message)
    order by code, path), '[]'::jsonb)
  into v_errors from findings;

  v_valid := jsonb_array_length(v_errors) = 0;
  v_publishable := v_valid and not exists (
    select 1 from public.microsequences where course_id = p_course_id and deleted_at is null and status <> 'ready'
  );
  return jsonb_build_object(
    'courseId', p_course_id,
    'valid', v_valid,
    'publishable', v_publishable,
    'errors', v_errors,
    'contentHash', private.course_content_hash(p_course_id)
  );
end;
$$;

create or replace function public.publish_official_course(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_course public.courses%rowtype;
  v_validation jsonb;
  v_hash text;
begin
  if not public.is_app_admin() then
    raise exception 'Publicação exige service_role ou administrador.' using errcode = '42501';
  end if;
  perform private.lock_course_write(p_course_id);
  select * into v_course from public.courses
  where id = p_course_id and kind = 'official' and deleted_at is null
  for update;
  if not found then
    raise exception 'Curso oficial não encontrado.' using errcode = '22023';
  end if;

  v_validation := public.validate_course_graph(p_course_id);
  if not coalesce((v_validation ->> 'publishable')::boolean, false) then
    raise exception 'Curso incompleto ou inválido: %', v_validation -> 'errors' using errcode = '23514';
  end if;
  v_hash := v_validation ->> 'contentHash';

  if v_course.status = 'published' and v_course.content_hash = v_hash then
    return jsonb_build_object(
      'courseId', p_course_id, 'publicationSeq', v_course.publication_seq,
      'contentHash', v_hash, 'status', 'published', 'idempotent', true
    );
  end if;

  update public.courses
  set status = 'published', publication_seq = publication_seq + 1,
      content_hash = v_hash, personalized_at = null
  where id = p_course_id
  returning * into v_course;
  return jsonb_build_object(
    'courseId', p_course_id, 'publicationSeq', v_course.publication_seq,
    'contentHash', v_hash, 'status', 'published', 'idempotent', false
  );
end;
$$;

create or replace function public.list_catalog_courses()
returns table (
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  is_installed boolean,
  installed_course_id uuid,
  update_available boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select c.id, c.contract_key, c.title, c.goal, c.publication_seq,
    coalesce(c.content_hash, private.course_content_hash(c.id)),
    (select count(*) from public.modules m where m.course_id = c.id and m.deleted_at is null),
    (select count(*) from public.lessons l where l.course_id = c.id and l.deleted_at is null),
    installed.id is not null,
    installed.id,
    installed.id is not null and installed.source_publication_seq < c.publication_seq
  from public.courses c
  left join lateral (
    select personal.id, personal.source_publication_seq
    from public.courses personal
    where personal.kind = 'personal' and personal.source_course_id = c.id
      and personal.deleted_at is null
      and exists (
        select 1 from public.course_memberships membership
        where membership.course_id = personal.id and membership.user_id = auth.uid()
          and membership.deleted_at is null
      )
    order by personal.created_at desc limit 1
  ) installed on true
  where c.kind = 'official' and c.status = 'published' and c.deleted_at is null
  order by c.title, c.id;
end;
$$;

create or replace function public.list_user_course_summaries()
returns table (
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  membership_role public.membership_role,
  status public.course_status,
  source_course_id uuid,
  source_publication_seq bigint,
  available_publication_seq bigint,
  content_hash text,
  source_content_hash text,
  baseline_content_hash text,
  is_personalized boolean,
  update_available boolean,
  module_count bigint,
  lesson_count bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select c.id, c.contract_key, c.title, c.goal, membership.role, c.status,
    c.source_course_id, c.source_publication_seq, source.publication_seq,
    hashes.current_hash, c.source_content_hash, c.baseline_content_hash,
    c.personalized_at is not null or hashes.current_hash is distinct from c.baseline_content_hash,
    source.publication_seq is not null and source.publication_seq > c.source_publication_seq,
    (select count(*) from public.modules m where m.course_id = c.id and m.deleted_at is null),
    (select count(*) from public.lessons l where l.course_id = c.id and l.deleted_at is null),
    greatest(
      (select max(lp.last_activity_at) from public.lesson_progress lp
       where lp.course_id = c.id and lp.user_id = auth.uid() and lp.deleted_at is null),
      (select max(cp.last_activity_at) from public.card_progress cp
       where cp.course_id = c.id and cp.user_id = auth.uid() and cp.deleted_at is null)
    )
  from public.course_memberships membership
  join public.courses c on c.id = membership.course_id
  left join public.courses source on source.id = c.source_course_id and source.deleted_at is null
  cross join lateral (
    select coalesce(c.content_hash, private.course_content_hash(c.id)) current_hash
  ) hashes
  where membership.user_id = auth.uid() and membership.deleted_at is null
    and c.kind = 'personal' and c.deleted_at is null
  order by membership.position, c.title, c.id;
end;
$$;

create or replace function private.shape_store_payload(p_store_name text, p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_identity text := coalesce(nullif(p_payload ->> 'identity_key', ''), nullif(p_payload ->> 'id', ''));
begin
  return v_payload || case p_store_name
    when 'guides' then jsonb_build_object(
      'module_id', case when p_payload ->> 'owner_type' = 'module' then p_payload -> 'owner_id' else 'null'::jsonb end,
      'lesson_id', case when p_payload ->> 'owner_type' = 'lesson' then p_payload -> 'owner_id' else 'null'::jsonb end
    )
    when 'guideItems' then jsonb_build_object('item_kind', p_payload -> 'item_type')
    when 'topics' then jsonb_build_object('kind', p_payload -> 'topic_kind')
    when 'topicStatements' then jsonb_build_object('statement_kind', p_payload -> 'statement_type')
    when 'microsequenceStatements' then jsonb_build_object('statement_kind', p_payload -> 'statement_type')
    when 'cards' then jsonb_build_object(
      'kind', p_payload -> 'card_kind', 'after_text', coalesce(p_payload -> 'after', '""'::jsonb)
    )
    when 'blocks' then jsonb_build_object(
      'contract_key', coalesce(nullif(p_payload ->> 'contract_key', ''), v_identity),
      'role', case p_payload ->> 'region' when 'content' then 'composite' else p_payload ->> 'region' end,
      'value_text', p_payload -> 'value', 'scale_factor', p_payload -> 'scale_k'
    )
    when 'options' then jsonb_build_object('text_value', p_payload -> 'text')
    when 'flowPractices' then jsonb_build_object(
      'flow_node_id', case when p_payload ->> 'owner_type' = 'node' then p_payload -> 'owner_id' else 'null'::jsonb end,
      'flow_case_id', case when p_payload ->> 'owner_type' = 'case' then p_payload -> 'owner_id' else 'null'::jsonb end
    )
    when 'flowPracticeOptions' then jsonb_build_object(
      'item_kind', 'option', 'flow_practice_id', null
    )
    when 'flowPracticeVariants' then jsonb_build_object(
      'item_kind', 'variant', 'flow_practice_id', null
    )
    when 'flowShapeOptions' then jsonb_build_object(
      'entry_id', null, 'flow_practice_id', p_payload -> 'practice_id',
      'item_kind', 'shape_option'
    )
    when 'edges' then jsonb_build_object(
      'contract_key', v_identity, 'edge_role', p_payload -> 'edge_scope'
    )
    when 'matrixItems' then jsonb_build_object(
      'contract_key', v_identity,
      'item_kind', case when coalesce((p_payload ->> 'is_sequence')::boolean, false) then 'sequence' else 'matrix' end
    )
    when 'cells' then jsonb_build_object(
      'cell_role', case when (p_payload ->> 'row_index')::integer = -1 then 'header' else 'value' end
    )
    when 'points' then jsonb_build_object('contract_key', v_identity, 'point_kind', p_payload -> 'point_role')
    when 'lines' then jsonb_build_object('contract_key', v_identity, 'line_kind', p_payload -> 'line_role')
    when 'highlights' then jsonb_build_object(
      'target_kind', case p_payload ->> 'selection_type'
        when 'leftItem' then 'left_item' when 'rightItem' then 'right_item'
        when 'vertex' then 'node' else p_payload ->> 'selection_type' end,
      'text_value', p_payload -> 'value'
    )
    when 'cardSources' then jsonb_build_object('ref_kind', 'source')
    when 'cardTopics' then jsonb_build_object(
      'ref_kind', 'topic', 'value', p_payload -> 'topic_contract_key'
    )
    else '{}'::jsonb
  end;
end;
$$;

create or replace function private.sync_payload_key_allowed(p_store_name text, p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_table regclass := private.table_for_store(p_store_name);
begin
  return v_table is not null and (
    exists (
      select 1 from pg_attribute attribute
      where attribute.attrelid = v_table and attribute.attnum > 0 and not attribute.attisdropped
        and attribute.attname = p_key
    )
    or (p_store_name = 'courses' and p_key = 'course_id')
    or (p_store_name = 'flowPractices' and p_key = 'owner_id')
    or (p_store_name = 'flowShapeOptions' and p_key = 'practice_id')
  );
end;
$$;

create or replace function private.apply_one_sync_mutation(
  p_user_id uuid,
  p_store_name text,
  p_entity_id uuid,
  p_course_id uuid,
  p_operation text,
  p_base_revision bigint,
  p_changed_fields jsonb,
  p_payload jsonb,
  p_batch_expected_revision bigint default null,
  p_allow_batch_expected_revision boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_table regclass := private.table_for_store(p_store_name);
  v_raw_payload jsonb := private.jsonb_to_snake(coalesce(p_payload, '{}'::jsonb));
  v_payload jsonb := private.shape_store_payload(p_store_name, v_raw_payload);
  v_current jsonb;
  v_canonical jsonb;
  v_natural_entity_id uuid;
  v_returned jsonb;
  v_columns text;
  v_expressions text;
  v_is_admin boolean := public.is_app_admin();
begin
  if v_table is null or p_entity_id is null or p_course_id is null then
    raise exception 'Entidade de sincronização inválida: %.', p_store_name using errcode = '22023';
  end if;
  if p_operation not in ('insert', 'update', 'delete') then
    raise exception 'Operação de sincronização inválida.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'Payload da mutação deve ser objeto.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_changed_fields, '[]'::jsonb)) <> 'array'
     or exists (
       select 1 from jsonb_array_elements(coalesce(p_changed_fields, '[]'::jsonb)) field
       where jsonb_typeof(field) <> 'string'
     ) then
    raise exception 'changedFields deve ser uma lista de nomes de campo.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_raw_payload) payload_key
    where not private.sync_payload_key_allowed(p_store_name, payload_key)
  ) then
    raise exception 'Payload contém campo desconhecido para %.', p_store_name using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_changed_fields, '[]'::jsonb)) changed_field
    where not private.sync_payload_key_allowed(
      p_store_name,
      private.snake_key(changed_field)
    )
  ) then
    raise exception 'changedFields contém campo desconhecido para %.', p_store_name using errcode = '22023';
  end if;
  if p_store_name = 'courses' and p_operation = 'delete' then
    raise exception 'Exclusão de curso exige delete_personal_course transacional.' using errcode = '42501';
  end if;

  -- Serialize the optimistic read/compare/write sequence even when the row does
  -- not exist yet.  Without this lock, two concurrent inserts or updates could
  -- both validate the same base revision before either write becomes visible.
  perform pg_advisory_xact_lock(
    hashtextextended('sync-entity:' || p_store_name || ':' || p_entity_id::text, 0)
  );

  if not v_is_admin then
    if p_store_name = 'memberships' then
      -- Membership/role management is not a generic content mutation.  It is
      -- reserved for trusted server-side administration so an editor cannot
      -- promote itself or revoke another member through the sync endpoint.
      raise exception 'Associações de curso não podem ser alteradas pela sincronização do cliente.'
        using errcode = '42501';
    elsif p_store_name = 'courses' and p_operation = 'insert' then
      if p_user_id is null or p_user_id <> auth.uid() or p_entity_id <> p_course_id then
        raise exception 'Criação de curso pessoal não autorizada.' using errcode = '42501';
      end if;
    elsif p_store_name in ('lessonProgress', 'cardProgress', 'comments') then
      if p_user_id is null or p_user_id <> auth.uid() or not public.user_can_study_course(p_course_id) then
        raise exception 'Progresso ou comentário não autorizado.' using errcode = '42501';
      end if;
    elsif not public.user_can_edit_course(p_course_id) then
      raise exception 'Mutação de curso não autorizada.' using errcode = '42501';
    end if;
  end if;

  -- The first insert on a progress/comment natural key is serialized across
  -- devices.  A losing UUID is reported as a structured conflict so the
  -- replica can remap it to the canonical remote identity instead of receiving
  -- an opaque unique_violation/rejected result.
  if p_operation = 'insert' and p_store_name in ('lessonProgress', 'cardProgress', 'comments') then
    v_natural_entity_id := case
      when p_store_name = 'lessonProgress' then private.try_uuid(v_payload ->> 'lesson_id')
      else private.try_uuid(v_payload ->> 'card_id')
    end;
    if v_natural_entity_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(
        'sync-natural:' || p_store_name || ':' || p_user_id::text || ':' ||
        p_course_id::text || ':' || v_natural_entity_id::text,
        0
      ));
      if p_store_name = 'lessonProgress' then
        select to_jsonb(progress) into v_canonical
        from public.lesson_progress progress
        where progress.user_id = p_user_id and progress.course_id = p_course_id
          and progress.lesson_id = v_natural_entity_id and progress.deleted_at is null
        for update;
      elsif p_store_name = 'cardProgress' then
        select to_jsonb(progress) into v_canonical
        from public.card_progress progress
        where progress.user_id = p_user_id and progress.course_id = p_course_id
          and progress.card_id = v_natural_entity_id and progress.deleted_at is null
        for update;
      else
        select to_jsonb(comment) into v_canonical
        from public.card_comments comment
        where comment.user_id = p_user_id and comment.course_id = p_course_id
          and comment.card_id = v_natural_entity_id and comment.deleted_at is null
        for update;
      end if;
      if v_canonical is not null
         and private.try_uuid(v_canonical ->> 'id') is distinct from p_entity_id then
        return jsonb_build_object(
          'status', 'conflict', 'entityType', p_store_name, 'entityId', p_entity_id,
          'canonicalEntityId', v_canonical ->> 'id', 'reason', 'natural_key_exists',
          'remoteRevision', (v_canonical ->> 'revision')::bigint,
          'remoteRow', private.local_row(p_store_name, v_canonical)
        );
      end if;
    end if;
  end if;

  execute format('select to_jsonb(t) from %s t where t.id = $1', v_table)
    into v_current using p_entity_id;

  if v_current is not null and (
    (p_store_name = 'courses' and p_entity_id <> p_course_id)
    or (p_store_name <> 'courses' and nullif(v_current ->> 'course_id', '')::uuid <> p_course_id)
  ) then
    raise exception 'Entidade não pertence ao curso autorizado.' using errcode = '42501';
  end if;

  if p_store_name in ('lessonProgress', 'cardProgress', 'comments')
     and v_current is not null
     and private.try_uuid(v_current ->> 'user_id') is distinct from p_user_id then
    raise exception 'Progresso ou comentário pertence a outro usuário.' using errcode = '42501';
  end if;

  if p_operation = 'update' and v_current is not null and (
    (p_store_name = 'lessonProgress' and v_payload ? 'lesson_id'
      and private.try_uuid(v_payload ->> 'lesson_id') is distinct from private.try_uuid(v_current ->> 'lesson_id'))
    or (p_store_name in ('cardProgress', 'comments') and v_payload ? 'card_id'
      and private.try_uuid(v_payload ->> 'card_id') is distinct from private.try_uuid(v_current ->> 'card_id'))
  ) then
    raise exception 'Chave natural de progresso/comentário é imutável; use tombstone e novo insert.'
      using errcode = '23514';
  end if;

  if p_store_name = 'memberships' and v_current is not null
     and v_current ->> 'role' = 'owner'
     and (
       p_operation = 'delete'
       or (p_operation = 'update' and coalesce(v_payload ->> 'role', 'owner') <> 'owner')
     )
     and (
       select count(*) from public.course_memberships membership
       where membership.course_id = p_course_id and membership.role = 'owner'
         and membership.deleted_at is null
     ) <= 1 then
    raise exception 'O último owner ativo do curso não pode ser removido.' using errcode = '23514';
  end if;

  if p_operation = 'insert' then
    if v_current is not null then
      return jsonb_build_object(
        'status', 'conflict', 'entityType', p_store_name, 'entityId', p_entity_id,
        'reason', 'entity_exists', 'remoteRevision', (v_current ->> 'revision')::bigint,
        'remoteRow', private.local_row(p_store_name, v_current)
      );
    end if;
  elsif v_current is null then
    return jsonb_build_object(
      'status', 'conflict', 'entityType', p_store_name, 'entityId', p_entity_id,
      'reason', 'entity_missing', 'remoteRevision', null, 'remoteRow', null
    );
  elsif (v_current ->> 'revision')::bigint <> p_base_revision
        and not (
          p_allow_batch_expected_revision
          and p_batch_expected_revision = p_base_revision
          and (v_current ->> 'revision')::bigint >= p_batch_expected_revision
        ) then
    return jsonb_build_object(
      'status', 'conflict', 'entityType', p_store_name, 'entityId', p_entity_id,
      'reason', 'revision_mismatch', 'remoteRevision', (v_current ->> 'revision')::bigint,
      'remoteRow', private.local_row(p_store_name, v_current)
    );
  end if;

  v_payload := v_payload || jsonb_build_object('id', p_entity_id);
  if p_store_name <> 'courses' then
    v_payload := v_payload || jsonb_build_object('course_id', p_course_id);
  end if;
  if p_store_name in ('lessonProgress', 'cardProgress', 'comments') then
    v_payload := v_payload || jsonb_build_object('user_id', p_user_id);
  end if;

  if p_operation = 'delete' then
    execute format(
      'update %s t set deleted_at = now() where t.id = $1 returning to_jsonb(t)', v_table
    ) into v_returned using p_entity_id;
  else
    -- Server-maintained identity, lineage, revision, publication and ownership
    -- columns cannot be spoofed by a client mutation.
    v_payload := v_payload - array[
      'revision', 'created_at', 'updated_at', 'deleted_at',
      'cards_revision',
      'source_course_id', 'source_publication_seq', 'source_content_hash', 'baseline_content_hash',
      'publication_seq', 'content_hash', 'personalized_at'
    ];
    if p_store_name not in ('lessonProgress', 'cardProgress', 'comments') then
      v_payload := v_payload - 'source_entity_id';
    end if;
    if p_store_name = 'courses' then
      v_payload := v_payload - array['owner_id', 'kind', 'status'];
      if p_operation = 'insert' then
        v_payload := v_payload || jsonb_build_object(
          'owner_id', p_user_id, 'kind', 'personal', 'status', 'active'
        );
      end if;
    end if;

    select
      string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum),
      string_agg(format('populated.%I', attribute.attname), ', ' order by attribute.attnum)
    into v_columns, v_expressions
    from pg_attribute attribute
    where attribute.attrelid = v_table and attribute.attnum > 0 and not attribute.attisdropped
      and v_payload ? attribute.attname;

    if v_columns is null then
      raise exception 'Mutação sem campos persistíveis.' using errcode = '22023';
    end if;

    if p_operation = 'insert' then
      begin
        execute format(
          'insert into %s as inserted (%s) select %s from jsonb_populate_record(null::%s, $1) populated '
          'returning to_jsonb(inserted)',
          v_table, v_columns, v_expressions, v_table
        ) into v_returned using v_payload;
      exception when unique_violation then
        v_canonical := null;
        if p_store_name = 'lessonProgress' then
          select to_jsonb(progress) into v_canonical
          from public.lesson_progress progress
          where progress.user_id = p_user_id and progress.course_id = p_course_id
            and progress.lesson_id = private.try_uuid(v_payload ->> 'lesson_id')
            and progress.deleted_at is null;
        elsif p_store_name = 'cardProgress' then
          select to_jsonb(progress) into v_canonical
          from public.card_progress progress
          where progress.user_id = p_user_id and progress.course_id = p_course_id
            and progress.card_id = private.try_uuid(v_payload ->> 'card_id')
            and progress.deleted_at is null;
        elsif p_store_name = 'comments' then
          select to_jsonb(comment) into v_canonical
          from public.card_comments comment
          where comment.user_id = p_user_id and comment.course_id = p_course_id
            and comment.card_id = private.try_uuid(v_payload ->> 'card_id')
            and comment.deleted_at is null;
        end if;
        if v_canonical is null
           or private.try_uuid(v_canonical ->> 'id') is not distinct from p_entity_id then
          raise;
        end if;
        return jsonb_build_object(
          'status', 'conflict', 'entityType', p_store_name, 'entityId', p_entity_id,
          'canonicalEntityId', v_canonical ->> 'id', 'reason', 'natural_key_exists',
          'remoteRevision', (v_canonical ->> 'revision')::bigint,
          'remoteRow', private.local_row(p_store_name, v_canonical)
        );
      end;
      if p_store_name = 'courses' then
        insert into public.course_memberships (course_id, user_id, role, position)
        values (p_entity_id, p_user_id, 'owner', 0);
      end if;
    else
      -- Updating one entity still touches only that physical row.  The revision
      -- trigger atomically advances the optimistic concurrency token.
      v_payload := v_payload - array['id', 'course_id', 'user_id'];
      select
        string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum),
        string_agg(format('populated.%I', attribute.attname), ', ' order by attribute.attnum)
      into v_columns, v_expressions
      from pg_attribute attribute
      where attribute.attrelid = v_table and attribute.attnum > 0 and not attribute.attisdropped
        and v_payload ? attribute.attname;
      if v_columns is null then
        raise exception 'Atualização sem campos persistíveis.' using errcode = '22023';
      end if;
      execute format(
        'update %s target set (%s) = (select %s from jsonb_populate_record(null::%s, $1) populated) '
        'where target.id = $2 returning to_jsonb(target)',
        v_table, v_columns, v_expressions, v_table
      ) into v_returned using v_payload, p_entity_id;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'applied', 'entityType', p_store_name, 'entityId', p_entity_id,
    'operation', p_operation, 'revision', (v_returned ->> 'revision')::bigint,
    'row', private.local_row(p_store_name, v_returned)
  );
end;
$$;

create or replace function public.apply_sync_batch(p_device_id uuid, p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_mutations jsonb := case when jsonb_typeof(p_mutations) = 'array' then p_mutations else p_mutations -> 'mutations' end;
  v_mutation jsonb;
  v_scan_mutation jsonb;
  v_mutation_id uuid;
  v_store_name text;
  v_entity_id uuid;
  v_course_id uuid;
  v_lock_course_id uuid;
  v_operation text;
  v_base_revision bigint;
  v_result jsonb;
  v_existing jsonb;
  v_results jsonb := '[]'::jsonb;
  v_saved_results jsonb;
  v_final_results jsonb := '[]'::jsonb;
  v_saved_result jsonb;
  v_message text;
  v_batch_blocked boolean := false;
  v_atomic_failed boolean := false;
  v_was_existing boolean;
  v_blocker_status public.sync_mutation_status;
  v_blocker_mutation_id uuid;
  v_blocker_mutation_key text;
  v_blocker_store_name text;
  v_blocker_entity_id uuid;
  v_blocker_result jsonb;
  v_initial_revisions jsonb := '{}'::jsonb;
  v_direct_counts jsonb := '{}'::jsonb;
  v_entity_key text;
  v_initial_revision bigint;
  v_expected_revision bigint;
  v_direct_count bigint;
  v_table regclass;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_device_id is null or jsonb_typeof(v_mutations) <> 'array' or jsonb_array_length(v_mutations) > 250 then
    raise exception 'Lote de sincronização inválido (máximo: 250).' using errcode = '22023';
  end if;

  insert into public.sync_devices (id, user_id, last_seen_at)
  values (p_device_id, v_user_id, now())
  on conflict (id) do update set last_seen_at = now()
  where sync_devices.user_id = excluded.user_id;
  if not exists (select 1 from public.sync_devices where id = p_device_id and user_id = v_user_id) then
    raise exception 'Dispositivo pertence a outro usuário.' using errcode = '42501';
  end if;

  -- Serialize every writer that targets the same course.  Entity-level locks
  -- still protect individual rows, while this lock makes the batch-start
  -- revision snapshot trustworthy for aggregate ancestor tokens.
  for v_lock_course_id in
    select distinct private.try_uuid(item ->> 'courseId')
    from jsonb_array_elements(v_mutations) item
    where private.try_uuid(item ->> 'courseId') is not null
      and coalesce(item ->> 'entityType', '') not in (
        'lessonProgress', 'cardProgress', 'comments'
      )
    order by 1
  loop
    perform private.lock_course_write(v_lock_course_id);
  end loop;

  -- Capture revisions before any row in this ordered batch changes.  A parent
  -- may legitimately be touched by an earlier child mutation; its first direct
  -- mutation compares against this snapshot plus its count of earlier direct
  -- mutations.  This also covers parent -> child -> parent and insert -> child
  -- -> update interleavings without accepting a revision from another batch.
  for v_scan_mutation in select value from jsonb_array_elements(v_mutations) loop
    v_store_name := v_scan_mutation ->> 'entityType';
    v_entity_id := private.try_uuid(v_scan_mutation ->> 'entityId');
    v_table := private.table_for_store(v_store_name);
    if v_table is not null and v_entity_id is not null then
      v_entity_key := v_store_name || ':' || v_entity_id::text;
      if not (v_initial_revisions ? v_entity_key) then
        v_initial_revision := null;
        execute format('select revision from %s where id = $1', v_table)
          into v_initial_revision using v_entity_id;
        v_initial_revisions := jsonb_set(
          v_initial_revisions, array[v_entity_key],
          coalesce(to_jsonb(v_initial_revision), 'null'::jsonb), true
        );
      end if;
    end if;
  end loop;

  -- All authorial writes and their idempotency rows live in one subtransaction.
  -- Any real conflict/rejection aborts the whole ordered batch, preventing a
  -- half-deleted tree.  We rebuild durable conflict ledger rows afterwards.
  begin
    for v_mutation in select value from jsonb_array_elements(v_mutations) loop
      begin
        v_mutation_id := private.try_uuid(v_mutation ->> 'mutationId');
        v_store_name := v_mutation ->> 'entityType';
        v_entity_id := private.try_uuid(v_mutation ->> 'entityId');
        v_course_id := private.try_uuid(v_mutation ->> 'courseId');
        v_operation := v_mutation ->> 'operation';
        v_base_revision := private.try_bigint(v_mutation ->> 'baseRevision', 0);
        if v_operation = 'upsert' then
          v_operation := case when v_base_revision = 0 then 'insert' else 'update' end;
        end if;
        if v_mutation_id is null then
          raise exception 'mutationId é obrigatório.' using errcode = '22023';
        end if;

        select result into v_existing from public.sync_mutations
        where user_id = v_user_id and mutation_id = v_mutation_id;
        v_was_existing := found;
        if v_was_existing then
          v_result := v_existing || jsonb_build_object('idempotent', true);
        else
          v_entity_key := v_store_name || ':' || v_entity_id::text;
          v_initial_revision := private.try_bigint(v_initial_revisions ->> v_entity_key, null);
          v_direct_count := private.try_bigint(v_direct_counts ->> v_entity_key, 0);
          v_expected_revision := coalesce(v_initial_revision, 0) + v_direct_count;
          v_result := private.apply_one_sync_mutation(
            v_user_id, v_store_name, v_entity_id, v_course_id, v_operation,
            v_base_revision, coalesce(v_mutation -> 'changedFields', '[]'),
            coalesce(v_mutation -> 'payload', '{}'),
            v_expected_revision, true
          ) || jsonb_build_object('mutationId', v_mutation_id, 'idempotent', false);

          insert into public.sync_mutations (
            mutation_id, user_id, device_id, entity_type, entity_id, operation,
            base_revision, status, request, result
          ) values (
            v_mutation_id, v_user_id, p_device_id, v_store_name, v_entity_id, v_operation,
            v_base_revision, (v_result ->> 'status')::public.sync_mutation_status, v_mutation, v_result
          );
          if v_result ->> 'status' = 'applied' then
            v_direct_counts := jsonb_set(
              v_direct_counts, array[v_entity_key], to_jsonb(v_direct_count + 1), true
            );
          end if;
        end if;
      exception when others then
        get stacked diagnostics v_message = message_text;
        v_result := jsonb_build_object(
          'mutationId', v_mutation ->> 'mutationId', 'status', 'rejected',
          'entityType', v_mutation ->> 'entityType', 'entityId', v_mutation ->> 'entityId',
          'reason', 'validation_error', 'message', v_message, 'idempotent', false
        );
        if private.try_uuid(v_mutation ->> 'mutationId') is not null then
          insert into public.sync_mutations (
            mutation_id, user_id, device_id, entity_type, entity_id, operation,
            base_revision, status, request, result
          ) values (
            private.try_uuid(v_mutation ->> 'mutationId'), v_user_id, p_device_id,
            coalesce(v_mutation ->> 'entityType', 'invalid'), private.try_uuid(v_mutation ->> 'entityId'),
            case
              when v_mutation ->> 'operation' = 'upsert' and private.try_bigint(v_mutation ->> 'baseRevision', 0) = 0 then 'insert'
              when v_mutation ->> 'operation' = 'upsert' then 'update'
              when v_mutation ->> 'operation' in ('insert','update','delete') then v_mutation ->> 'operation'
              else 'update'
            end,
            greatest(private.try_bigint(v_mutation ->> 'baseRevision', 0), 0),
            'rejected', v_mutation, v_result
          ) on conflict (user_id, mutation_id) do nothing;
        end if;
      end;

      v_results := v_results || jsonb_build_array(v_result);
      if v_result ->> 'status' in ('conflict', 'rejected') then
        v_batch_blocked := true;
        v_blocker_status := (v_result ->> 'status')::public.sync_mutation_status;
        v_blocker_mutation_id := private.try_uuid(v_result ->> 'mutationId');
        v_blocker_mutation_key := v_result ->> 'mutationId';
        v_blocker_store_name := coalesce(v_result ->> 'entityType', v_store_name);
        v_blocker_entity_id := coalesce(private.try_uuid(v_result ->> 'entityId'), v_entity_id);
        v_blocker_result := v_result;
        raise exception 'aralearn_atomic_batch_rollback' using errcode = 'P0001';
      end if;
    end loop;
  exception when raise_exception then
    if sqlerrm <> 'aralearn_atomic_batch_rollback' then
      raise;
    end if;
    v_atomic_failed := true;
  end;

  if v_atomic_failed then
    v_saved_results := v_results;
    v_final_results := '[]'::jsonb;
    for v_mutation in select value from jsonb_array_elements(v_mutations) loop
      v_mutation_id := private.try_uuid(v_mutation ->> 'mutationId');
      v_store_name := coalesce(v_mutation ->> 'entityType', 'invalid');
      v_entity_id := private.try_uuid(v_mutation ->> 'entityId');
      v_course_id := private.try_uuid(v_mutation ->> 'courseId');
      v_base_revision := greatest(private.try_bigint(v_mutation ->> 'baseRevision', 0), 0);
      v_operation := case
        when v_mutation ->> 'operation' = 'upsert' and v_base_revision = 0 then 'insert'
        when v_mutation ->> 'operation' = 'upsert' then 'update'
        when v_mutation ->> 'operation' in ('insert','update','delete') then v_mutation ->> 'operation'
        else 'update'
      end;

      v_existing := null;
      if v_mutation_id is not null then
        select result into v_existing from public.sync_mutations
        where user_id = v_user_id and mutation_id = v_mutation_id;
      end if;
      if v_existing is not null then
        v_result := v_existing || jsonb_build_object('idempotent', true);
      else
        v_saved_result := null;
        select value into v_saved_result
        from jsonb_array_elements(v_saved_results)
        where value ->> 'mutationId' = v_mutation ->> 'mutationId'
        limit 1;
        if v_mutation ->> 'mutationId' = v_blocker_mutation_key then
          v_result := coalesce(v_saved_result, v_blocker_result) || jsonb_build_object(
            'atomicRollback', true, 'rolledBack', false
          );
        elsif v_saved_result is not null then
          v_result := v_saved_result || jsonb_build_object(
            'status', v_blocker_status,
            'reason', 'atomic_batch_rolled_back',
            'message', 'Mutação revertida porque outra mutação do lote falhou.',
            'blocked', true, 'atomicRollback', true, 'rolledBack', true,
            'blockedByMutationId', v_blocker_mutation_key,
            'blockedByStatus', v_blocker_status,
            'blockedByEntityType', v_blocker_store_name,
            'blockedByEntityId', v_blocker_entity_id,
            'idempotent', false
          );
        else
          v_result := jsonb_build_object(
            'mutationId', v_mutation ->> 'mutationId',
            'status', v_blocker_status,
            'entityType', v_store_name,
            'entityId', v_entity_id,
            'courseId', v_course_id,
            'baseRevision', v_base_revision,
            'reason', 'causal_batch_blocked',
            'message', 'Mutação não aplicada porque uma mutação anterior do lote falhou.',
            'blocked', true, 'atomicRollback', true, 'rolledBack', false,
            'blockedByMutationId', v_blocker_mutation_key,
            'blockedByStatus', v_blocker_status,
            'blockedByEntityType', v_blocker_store_name,
            'blockedByEntityId', v_blocker_entity_id,
            'remoteRevision', case
              when v_store_name = v_blocker_store_name and v_entity_id = v_blocker_entity_id
                then v_blocker_result -> 'remoteRevision'
              else null
            end,
            'remoteRow', case
              when v_store_name = v_blocker_store_name and v_entity_id = v_blocker_entity_id
                then v_blocker_result -> 'remoteRow'
              else null
            end,
            'idempotent', false
          );
        end if;

        -- Only the mutation that actually conflicted/failed is terminal and
        -- receives an idempotency row.  Rolled-back or not-yet-run siblings
        -- remain causal/pending in the client outbox and may reuse their
        -- mutationId after the blocker is resolved.
        if v_mutation_id is not null
           and v_mutation ->> 'mutationId' = v_blocker_mutation_key then
          insert into public.sync_mutations (
            mutation_id, user_id, device_id, entity_type, entity_id, operation,
            base_revision, status, request, result
          ) values (
            v_mutation_id, v_user_id, p_device_id, v_store_name, v_entity_id, v_operation,
            v_base_revision, (v_result ->> 'status')::public.sync_mutation_status,
            v_mutation, v_result
          ) on conflict (user_id, mutation_id) do nothing;
        end if;
      end if;
      v_final_results := v_final_results || jsonb_build_array(v_result);
    end loop;
    v_results := v_final_results;
  end if;

  return jsonb_build_object(
    'deviceId', p_device_id,
    'atomic', true,
    'rolledBack', v_atomic_failed,
    'results', v_results
  );
end;
$$;

create or replace function public.pull_sync_changes(
  p_after_sequence bigint default 0,
  p_limit integer default 100,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_change record;
  v_store_name text;
  v_item jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_last_sequence bigint := greatest(coalesce(p_after_sequence, 0), 0);
  v_has_more boolean := false;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_device_id is not null then
    insert into public.sync_devices (id, user_id, last_seen_at)
    values (p_device_id, v_user_id, now())
    on conflict (id) do update set last_seen_at = now(), deleted_at = null
    where sync_devices.user_id = excluded.user_id;
    if not exists (
      select 1 from public.sync_devices
      where id = p_device_id and user_id = v_user_id and deleted_at is null
    ) then
      raise exception 'Dispositivo pertence a outro usuário.' using errcode = '42501';
    end if;
  end if;

  for v_change in
    select change.*
    from public.sync_changes change
    where change.sequence > greatest(coalesce(p_after_sequence, 0), 0)
      and (
        change.audience_user_id = v_user_id
        or (
          change.audience_user_id is null and change.course_id is not null
          and exists (
            select 1 from public.courses course
            where course.id = change.course_id and course.kind = 'personal'
              and (course.owner_id = v_user_id or exists (
                select 1 from public.course_memberships membership
                where membership.course_id = course.id and membership.user_id = v_user_id
                  and membership.deleted_at is null
              ))
          )
        )
      )
    order by change.sequence
    limit v_limit + 1
  loop
    v_store_name := private.store_name(v_change.entity_type, v_change.row_data);
    if v_store_name is null then
      continue;
    end if;
    v_count := v_count + 1;
    if v_count > v_limit then
      v_has_more := true;
      exit;
    end if;
    v_last_sequence := v_change.sequence;
    v_item := jsonb_build_object(
      'sequence', v_change.sequence,
      'entityType', v_store_name,
      'storeName', v_store_name,
      'entityId', v_change.entity_id,
      'courseId', v_change.course_id,
      'operation', v_change.operation,
      'tombstone', v_change.operation = 'delete' or (v_change.row_data ->> 'deleted_at') is not null,
      'revision', v_change.entity_revision,
      'row', private.local_row(v_store_name, v_change.row_data),
      'payload', private.local_row(v_store_name, v_change.row_data),
      'changedAt', v_change.changed_at
    );
    v_changes := v_changes || jsonb_build_array(v_item);
  end loop;

  if p_device_id is not null then
    update public.sync_devices
    set last_pulled_sequence = greatest(last_pulled_sequence, v_last_sequence), last_seen_at = now()
    where id = p_device_id and user_id = v_user_id;
  end if;
  return jsonb_build_object(
    'afterSequence', greatest(coalesce(p_after_sequence, 0), 0),
    'nextSequence', v_last_sequence,
    'hasMore', v_has_more,
    'changes', v_changes
  );
end;
$$;

create or replace function private.soft_delete_microsequence_cards(
  p_course_id uuid,
  p_microsequence_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.node_practice_items item set deleted_at = now()
  where item.course_id = p_course_id and item.deleted_at is null and (
    exists (
      select 1 from public.node_practices entry
      join public.flow_practices practice on practice.id = entry.practice_id
      left join public.flow_nodes node on node.id = practice.flow_node_id
      left join public.flow_cases case_row on case_row.id = practice.flow_case_id
      join public.card_blocks block on block.id = coalesce(node.block_id, case_row.block_id)
      join public.cards card on card.id = block.card_id
      where entry.id = item.entry_id and card.microsequence_id = p_microsequence_id
    ) or exists (
      select 1 from public.flow_practices practice
      left join public.flow_nodes node on node.id = practice.flow_node_id
      left join public.flow_cases case_row on case_row.id = practice.flow_case_id
      join public.card_blocks block on block.id = coalesce(node.block_id, case_row.block_id)
      join public.cards card on card.id = block.card_id
      where practice.id = item.flow_practice_id and card.microsequence_id = p_microsequence_id
    )
  );
  update public.node_practices entry set deleted_at = now()
  where entry.course_id = p_course_id and entry.deleted_at is null and exists (
    select 1 from public.flow_practices practice
    left join public.flow_nodes node on node.id = practice.flow_node_id
    left join public.flow_cases case_row on case_row.id = practice.flow_case_id
    join public.card_blocks block on block.id = coalesce(node.block_id, case_row.block_id)
    join public.cards card on card.id = block.card_id
    where practice.id = entry.practice_id and card.microsequence_id = p_microsequence_id
  );
  update public.flow_practices practice set deleted_at = now()
  where practice.course_id = p_course_id and practice.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id in (
      select node.block_id from public.flow_nodes node where node.id = practice.flow_node_id
      union all
      select case_row.block_id from public.flow_cases case_row where case_row.id = practice.flow_case_id
    ) and card.microsequence_id = p_microsequence_id
  );
  update public.flow_cases case_row set deleted_at = now()
  where case_row.course_id = p_course_id and case_row.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = case_row.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.flow_nodes node set deleted_at = now()
  where node.course_id = p_course_id and node.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = node.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.block_highlights child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = child.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.block_cells child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block
    left join public.block_matrix_items item on item.id = child.matrix_item_id
    join public.cards card on card.id = block.card_id
    where block.id = coalesce(child.block_id, item.block_id)
      and card.microsequence_id = p_microsequence_id
  );
  update public.block_options child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = child.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.block_edges child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = child.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.block_matrix_items child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = child.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.block_points child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = child.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.block_lines child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = child.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.card_refs child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.cards card where card.id = child.card_id and card.microsequence_id = p_microsequence_id
  );
  update public.block_nodes child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where block.id = child.block_id and card.microsequence_id = p_microsequence_id
  );
  update public.card_blocks child set deleted_at = now()
  where child.course_id = p_course_id and child.deleted_at is null and exists (
    select 1 from public.cards card where card.id = child.card_id and card.microsequence_id = p_microsequence_id
  );
  update public.cards set deleted_at = now()
  where course_id = p_course_id and microsequence_id = p_microsequence_id and deleted_at is null;
end;
$$;

create or replace function private.fragment_entity_microsequence_id(
  p_store_name text,
  p_entity_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_table regclass := private.table_for_store(p_store_name);
  v_microsequence_id uuid;
  v_parent_id uuid;
begin
  if p_store_name = 'cards' then
    select card.microsequence_id into v_microsequence_id
    from public.cards card where card.id = p_entity_id;
  elsif p_store_name = 'blocks' then
    select card.microsequence_id into v_microsequence_id
    from public.card_blocks entity join public.cards card on card.id = entity.card_id
    where entity.id = p_entity_id;
  elsif p_store_name in (
    'options','nodes','flowNodes','flowCases','edges','matrixItems',
    'points','lines','highlights'
  ) then
    execute format(
      'select card.microsequence_id from %s entity '
      'join public.card_blocks block on block.id = entity.block_id '
      'join public.cards card on card.id = block.card_id where entity.id = $1',
      v_table
    ) into v_microsequence_id using p_entity_id;
  elsif p_store_name = 'cells' then
    select card.microsequence_id into v_microsequence_id
    from public.block_cells entity
    left join public.block_matrix_items matrix_item on matrix_item.id = entity.matrix_item_id
    join public.card_blocks block on block.id = coalesce(entity.block_id, matrix_item.block_id)
    join public.cards card on card.id = block.card_id
    where entity.id = p_entity_id;
  elsif p_store_name in ('cardSources','cardTopics') then
    select card.microsequence_id into v_microsequence_id
    from public.card_refs entity join public.cards card on card.id = entity.card_id
    where entity.id = p_entity_id;
  elsif p_store_name = 'flowPractices' then
    select card.microsequence_id into v_microsequence_id
    from public.flow_practices entity
    left join public.flow_nodes flow_node on flow_node.id = entity.flow_node_id
    left join public.flow_cases flow_case on flow_case.id = entity.flow_case_id
    join public.card_blocks block
      on block.id = coalesce(flow_node.block_id, flow_case.block_id)
    join public.cards card on card.id = block.card_id
    where entity.id = p_entity_id;
  elsif p_store_name = 'flowPracticeEntries' then
    select entity.practice_id into v_parent_id
    from public.node_practices entity where entity.id = p_entity_id;
    v_microsequence_id := private.fragment_entity_microsequence_id('flowPractices', v_parent_id);
  elsif p_store_name in ('flowPracticeOptions','flowPracticeVariants') then
    select entity.entry_id into v_parent_id
    from public.node_practice_items entity where entity.id = p_entity_id;
    v_microsequence_id := private.fragment_entity_microsequence_id('flowPracticeEntries', v_parent_id);
  elsif p_store_name = 'flowShapeOptions' then
    select entity.flow_practice_id into v_parent_id
    from public.node_practice_items entity where entity.id = p_entity_id;
    v_microsequence_id := private.fragment_entity_microsequence_id('flowPractices', v_parent_id);
  end if;
  return v_microsequence_id;
end;
$$;

create or replace function private.validate_microsequence_fragment_scope(
  p_course_id uuid,
  p_microsequence_id uuid,
  p_fragment jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_store_name text;
  v_store_names text[] := array[
    'cards','blocks','options','nodes','flowNodes','flowCases','flowPractices',
    'flowPracticeEntries','flowPracticeOptions','flowPracticeVariants','flowShapeOptions',
    'edges','matrixItems','cells','points','lines','highlights','cardSources','cardTopics'
  ];
  v_block_child_stores text[] := array[
    'options','nodes','flowNodes','edges','matrixItems','points','lines','highlights'
  ];
  v_row jsonb;
  v_entity_id uuid;
  v_table regclass;
  v_exists boolean;
  v_seen_tokens text[] := '{}';
  v_token text;
  v_lesson_id uuid;
begin
  select microsequence.lesson_id into v_lesson_id
  from public.microsequences microsequence
  where microsequence.id = p_microsequence_id and microsequence.course_id = p_course_id;

  foreach v_store_name in array v_store_names loop
    if p_fragment ? v_store_name and jsonb_typeof(p_fragment -> v_store_name) <> 'array' then
      raise exception 'Coleção % do fragmento precisa ser array.', v_store_name using errcode = '22023';
    end if;
    for v_row in select value from jsonb_array_elements(coalesce(p_fragment -> v_store_name, '[]'::jsonb)) loop
      v_entity_id := private.try_uuid(v_row ->> 'id');
      if v_entity_id is null then
        raise exception 'Entidade sem UUID válido em %.', v_store_name using errcode = '22023';
      end if;
      if v_row ? 'courseId' and private.try_uuid(v_row ->> 'courseId') is distinct from p_course_id then
        raise exception 'Entidade de % aponta para outro curso.', v_store_name using errcode = '23514';
      end if;
      v_token := case
        when v_store_name in ('cardSources','cardTopics') then 'cardRefs'
        when v_store_name in ('flowPracticeOptions','flowPracticeVariants','flowShapeOptions')
          then 'flowPracticeItems'
        else v_store_name
      end || ':' || v_entity_id::text;
      if v_token = any(v_seen_tokens) then
        raise exception 'UUID duplicado no fragmento: %.', v_entity_id using errcode = '23505';
      end if;
      v_seen_tokens := array_append(v_seen_tokens, v_token);

      v_table := private.table_for_store(v_store_name);
      execute format('select exists (select 1 from %s entity where entity.id = $1)', v_table)
        into v_exists using v_entity_id;
      if v_exists and private.fragment_entity_microsequence_id(v_store_name, v_entity_id)
          is distinct from p_microsequence_id then
        raise exception 'UUID % de % já pertence a outra microssequência.', v_entity_id, v_store_name
          using errcode = '23514';
      end if;
    end loop;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(p_fragment -> 'cards') card
    where private.try_uuid(card ->> 'microsequenceId') is distinct from p_microsequence_id
       or (card ? 'lessonId' and private.try_uuid(card ->> 'lessonId') is distinct from v_lesson_id)
  ) then
    raise exception 'Card fora da microssequência ou lição do fragmento.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_fragment -> 'blocks', '[]'::jsonb)) child
    where not exists (
      select 1 from jsonb_array_elements(p_fragment -> 'cards') parent
      where parent ->> 'id' = child ->> 'cardId'
    )
  ) then
    raise exception 'Bloco aponta para card ausente no fragmento.' using errcode = '23514';
  end if;
  foreach v_store_name in array v_block_child_stores loop
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_fragment -> v_store_name, '[]'::jsonb)) child
      where not exists (
        select 1 from jsonb_array_elements(coalesce(p_fragment -> 'blocks', '[]'::jsonb)) parent
        where parent ->> 'id' = child ->> 'blockId'
      )
    ) then
      raise exception 'Entidade de % aponta para bloco ausente no fragmento.', v_store_name
        using errcode = '23514';
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowCases', '[]'::jsonb)) child
    where not exists (
        select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowNodes', '[]'::jsonb)) parent
        where parent ->> 'id' = child ->> 'flowNodeId'
      )
      or not exists (
        select 1 from jsonb_array_elements(coalesce(p_fragment -> 'blocks', '[]'::jsonb)) parent
        where parent ->> 'id' = child ->> 'blockId'
      )
  ) then
    raise exception 'Case aponta para flowNode ausente no fragmento.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowPractices', '[]'::jsonb)) child
    where (child ->> 'ownerType' = 'node' and not exists (
      select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowNodes', '[]'::jsonb)) parent
      where parent ->> 'id' = child ->> 'ownerId'
    )) or (child ->> 'ownerType' = 'case' and not exists (
      select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowCases', '[]'::jsonb)) parent
      where parent ->> 'id' = child ->> 'ownerId'
    )) or coalesce(child ->> 'ownerType', '') not in ('node','case')
  ) then
    raise exception 'Practice aponta para owner ausente no fragmento.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowPracticeEntries', '[]'::jsonb)) child
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowPractices', '[]'::jsonb)) parent
      where parent ->> 'id' = child ->> 'practiceId'
    )
  ) then
    raise exception 'Practice entry aponta para practice ausente no fragmento.' using errcode = '23514';
  end if;
  foreach v_store_name in array array['flowPracticeOptions','flowPracticeVariants'] loop
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_fragment -> v_store_name, '[]'::jsonb)) child
      where not exists (
        select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowPracticeEntries', '[]'::jsonb)) parent
        where parent ->> 'id' = child ->> 'entryId'
      )
    ) then
      raise exception 'Entidade de % aponta para entry ausente no fragmento.', v_store_name
        using errcode = '23514';
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowShapeOptions', '[]'::jsonb)) child
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_fragment -> 'flowPractices', '[]'::jsonb)) parent
      where parent ->> 'id' = child ->> 'practiceId'
    )
  ) then
    raise exception 'Shape option aponta para practice ausente no fragmento.' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_fragment -> 'cells', '[]'::jsonb)) child
    where not (
      exists (
        select 1 from jsonb_array_elements(coalesce(p_fragment -> 'blocks', '[]'::jsonb)) parent
        where parent ->> 'id' = child ->> 'blockId'
      ) or exists (
        select 1 from jsonb_array_elements(coalesce(p_fragment -> 'matrixItems', '[]'::jsonb)) parent
        where parent ->> 'id' = child ->> 'matrixItemId'
      )
    )
  ) then
    raise exception 'Cell aponta para bloco/matrixItem ausente no fragmento.' using errcode = '23514';
  end if;
  foreach v_store_name in array array['cardSources','cardTopics'] loop
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_fragment -> v_store_name, '[]'::jsonb)) child
      where not exists (
        select 1 from jsonb_array_elements(p_fragment -> 'cards') parent
        where parent ->> 'id' = child ->> 'cardId'
      )
    ) then
      raise exception 'Referência de % aponta para card ausente no fragmento.', v_store_name
        using errcode = '23514';
    end if;
  end loop;
end;
$$;

create or replace function public.replace_microsequence_cards(
  p_course_id uuid,
  p_microsequence_id uuid,
  p_fragment jsonb,
  p_base_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_microsequence public.microsequences%rowtype;
  v_store_name text;
  v_store_names text[] := array[
    'cards','blocks','options','nodes','flowNodes','flowCases','flowPractices',
    'flowPracticeEntries','flowPracticeOptions','flowPracticeVariants','flowShapeOptions',
    'edges','matrixItems','cells','points','lines','highlights','cardSources','cardTopics'
  ];
  v_row jsonb;
  v_result jsonb;
  v_card_count integer;
  v_entity_id uuid;
  v_table regclass;
  v_existing jsonb;
  v_existing_revision bigint;
begin
  if not public.is_app_admin()
     and (v_user_id is null or not public.user_can_edit_course(p_course_id)) then
    raise exception 'Substituição não autorizada.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fragment) <> 'object' or jsonb_typeof(p_fragment -> 'cards') <> 'array'
     or jsonb_array_length(p_fragment -> 'cards') = 0 then
    raise exception 'Fragmento relacional deve conter cards.' using errcode = '22023';
  end if;
  perform private.lock_course_write(p_course_id);
  select * into v_microsequence from public.microsequences
  where id = p_microsequence_id and course_id = p_course_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Microssequência não encontrada.' using errcode = '22023';
  end if;
  if p_base_revision is not null and v_microsequence.cards_revision <> p_base_revision then
    raise exception 'Conflito de revisão dos cards da microssequência.' using errcode = '40001';
  end if;
  perform private.validate_microsequence_fragment_scope(
    p_course_id, p_microsequence_id, p_fragment
  );
  if exists (
    select 1 from jsonb_array_elements(p_fragment -> 'cards') card
    where nullif(card ->> 'microsequenceId', '')::uuid is distinct from p_microsequence_id
  ) then
    raise exception 'Card fora da microssequência do fragmento.' using errcode = '23514';
  end if;

  perform set_config('aralearn.suppress_microsequence_revision', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  perform private.soft_delete_microsequence_cards(p_course_id, p_microsequence_id);
  foreach v_store_name in array v_store_names loop
    if jsonb_typeof(p_fragment -> v_store_name) = 'array' then
      for v_row in select value from jsonb_array_elements(p_fragment -> v_store_name) loop
        v_entity_id := private.try_uuid(v_row ->> 'id');
        v_table := private.table_for_store(v_store_name);
        execute format('select to_jsonb(entity) from %s entity where entity.id = $1', v_table)
          into v_existing using v_entity_id;
        if v_existing is null then
          v_result := private.apply_one_sync_mutation(
            v_user_id, v_store_name, v_entity_id,
            p_course_id, 'insert', 0, '[]', v_row
          );
        else
          if private.fragment_entity_microsequence_id(v_store_name, v_entity_id)
              is distinct from p_microsequence_id then
            raise exception 'UUID % de % pertence a outra microssequência.', v_entity_id, v_store_name
              using errcode = '23514';
          end if;
          if (v_existing ->> 'deleted_at') is not null then
            execute format(
              'update %s entity set deleted_at = null where entity.id = $1 returning revision', v_table
            ) into v_existing_revision using v_entity_id;
          else
            v_existing_revision := (v_existing ->> 'revision')::bigint;
          end if;
          v_result := private.apply_one_sync_mutation(
            v_user_id, v_store_name, v_entity_id,
            p_course_id, 'update', v_existing_revision, '[]', v_row
          );
        end if;
        if v_result ->> 'status' <> 'applied' then
          raise exception 'Fragmento conflita em %/%: %', v_store_name, v_row ->> 'id', v_result
            using errcode = '23514';
        end if;
      end loop;
    end if;
  end loop;

  select count(*) into v_card_count from public.cards
  where course_id = p_course_id and microsequence_id = p_microsequence_id and deleted_at is null;
  if v_card_count = 0 or exists (
    select 1 from public.cards card
    where card.course_id = p_course_id and card.microsequence_id = p_microsequence_id
      and card.deleted_at is null and card.resource <> 'composite'
      and (select count(*) from public.card_blocks block
           where block.card_id = card.id and block.role = 'primary' and block.deleted_at is null) <> 1
  ) then
    raise exception 'Fragmento sem bloco primário único por card.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.cards card
    where card.course_id = p_course_id and card.microsequence_id = p_microsequence_id
      and card.deleted_at is null and card.resource = 'composite'
      and (
        (select count(*) from public.card_blocks block
         where block.card_id = card.id and block.role = 'composite' and block.deleted_at is null) < 1
        or (select count(*) from public.card_blocks block
            where block.card_id = card.id and block.role = 'primary' and block.deleted_at is null) <> 0
      )
  ) then
    raise exception 'Card composite exige blocos composite e proíbe bloco primário.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.cards card
    join public.card_blocks block on block.card_id = card.id
      and block.role = 'primary' and block.deleted_at is null
    where card.course_id = p_course_id and card.microsequence_id = p_microsequence_id
      and card.deleted_at is null and card.resource <> 'composite'
      and block.block_type <> card.resource::text
  ) then
    raise exception 'Resource do card diverge do bloco primário.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where card.microsequence_id = p_microsequence_id and block.block_type = 'choice'
      and block.deleted_at is null and (
        (select count(*) from public.block_options option where option.block_id = block.id and option.deleted_at is null) not between 3 and 4
        or (select count(*) from public.block_options option where option.block_id = block.id
            and option.deleted_at is null and option.is_correct) <> 1
      )
  ) then
    raise exception 'Bloco choice inválido no fragmento.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.block_cells cell
    join public.block_matrix_items item on item.id = cell.matrix_item_id
    join public.card_blocks block on block.id = item.block_id
    join public.cards card on card.id = block.card_id
    where card.microsequence_id = p_microsequence_id and cell.deleted_at is null
      and (cell.row_index >= item.row_count or cell.column_index >= item.column_count)
  ) then
    raise exception 'Célula fora das dimensões no fragmento.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.card_blocks block join public.cards card on card.id = block.card_id
    where card.microsequence_id = p_microsequence_id and block.block_type = 'flow'
      and block.deleted_at is null and (
        select count(*) from public.flow_nodes node
        where node.block_id = block.id and node.node_kind = 'sequence'
          and node.parent_node_id is null and node.parent_case_id is null
          and node.deleted_at is null
      ) <> 1
  ) then
    raise exception 'Flow sem raiz sequence única no fragmento.' using errcode = '23514';
  end if;

  perform set_config('aralearn.suppress_course_dirty', 'off', true);
  perform set_config('aralearn.suppress_microsequence_revision', 'off', true);
  update public.microsequences
  set status = 'ready', cards_revision = cards_revision + 1
  where id = p_microsequence_id
  returning * into v_microsequence;
  return jsonb_build_object(
    'courseId', p_course_id, 'microsequenceId', p_microsequence_id,
    'revision', v_microsequence.revision,
    'cardsRevision', v_microsequence.cards_revision,
    'cardCount', v_card_count
  );
end;
$$;

create or replace function public.replace_microsequence_cards(
  p_course_id uuid,
  p_microsequence_id uuid,
  p_fragment jsonb,
  p_base_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing private.rpc_idempotency%rowtype;
  v_fingerprint text;
  v_result jsonb;
begin
  if v_user_id is null or p_mutation_id is null then
    raise exception 'Autenticação e mutationId são obrigatórios.' using errcode = '42501';
  end if;
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'courseId', p_course_id,
    'microsequenceId', p_microsequence_id,
    'fragment', p_fragment,
    'baseRevision', p_base_revision
  )::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_mutation_id::text, 0));
  select * into v_existing from private.rpc_idempotency
  where user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_existing.operation <> 'replace_microsequence_cards'
       or v_existing.request_course_id <> p_course_id
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'mutationId já foi usado com outro payload.' using errcode = '23505';
    end if;
    return v_existing.result_payload;
  end if;

  begin
    v_result := public.replace_microsequence_cards(
      p_course_id, p_microsequence_id, p_fragment, p_base_revision
    ) || jsonb_build_object('status', 'applied', 'mutationId', p_mutation_id);
  exception when serialization_failure then
    select jsonb_build_object(
      'status', 'conflict',
      'mutationId', p_mutation_id,
      'courseId', p_course_id,
      'microsequenceId', p_microsequence_id,
      'remoteRevision', microsequence.cards_revision,
      'remoteCardsRevision', microsequence.cards_revision,
      'remoteRow', private.local_row('microsequences', to_jsonb(microsequence))
    ) into v_result
    from public.microsequences microsequence
    where microsequence.id = p_microsequence_id and microsequence.course_id = p_course_id;
    if v_result is null then
      raise;
    end if;
  end;
  insert into private.rpc_idempotency (
    user_id, mutation_id, operation, request_course_id, result_course_id,
    request_fingerprint, result_payload
  ) values (
    v_user_id, p_mutation_id, 'replace_microsequence_cards', p_course_id, p_course_id,
    v_fingerprint, v_result
  );
  return v_result;
end;
$$;

create or replace function public.import_official_course(
  p_envelope jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_course jsonb := coalesce(p_envelope -> 'course', p_envelope -> 'courses' -> 0);
  v_course_id uuid := coalesce(nullif(v_course ->> 'id', '')::uuid, gen_random_uuid());
  v_store_name text;
  v_store_names text[] := array[
    'modules','lessons','guides','guideItems','topics','topicStatements',
    'microsequences','dependencies','microsequenceStatements','cards','blocks','options',
    'nodes','flowNodes','flowCases','flowPractices','flowPracticeEntries',
    'flowPracticeOptions','flowPracticeVariants','flowShapeOptions','edges','matrixItems',
    'cells','points','lines','highlights','cardSources','cardTopics'
  ];
  v_row jsonb;
  v_result jsonb;
  v_validation jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Importação oficial exige administrador.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_envelope) <> 'object' or jsonb_typeof(v_course) <> 'object' then
    raise exception 'Envelope relacional inválido.' using errcode = '22023';
  end if;
  perform private.lock_course_write(v_course_id);
  insert into public.courses (
    id, owner_id, kind, status, contract_key, title, goal, contract_scope,
    identity_key, project_id, position
  )
  values (
    v_course_id, null, 'official', 'draft', v_course ->> 'contractKey',
    v_course ->> 'title', v_course ->> 'goal', v_course ->> 'contractScope',
    v_course ->> 'identityKey',
    private.try_uuid(v_course ->> 'projectId'), coalesce((v_course ->> 'position')::integer, 0)
  );
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  foreach v_store_name in array v_store_names loop
    if jsonb_typeof(p_envelope -> v_store_name) = 'array' then
      for v_row in select value from jsonb_array_elements(p_envelope -> v_store_name) loop
        v_result := private.apply_one_sync_mutation(
          auth.uid(), v_store_name, nullif(v_row ->> 'id', '')::uuid,
          v_course_id, 'insert', 0, '[]', v_row
        );
        if v_result ->> 'status' <> 'applied' then
          raise exception 'Falha ao importar %/%: %', v_store_name, v_row ->> 'id', v_result
            using errcode = '23514';
        end if;
      end loop;
    end if;
  end loop;
  perform set_config('aralearn.suppress_course_dirty', 'off', true);
  v_validation := public.validate_course_graph(v_course_id);
  if p_publish then
    perform public.publish_official_course(v_course_id);
  end if;
  return jsonb_build_object(
    'courseId', v_course_id, 'validation', v_validation,
    'published', p_publish, 'contentHash', private.course_content_hash(v_course_id)
  );
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'modules','lessons','course_guides','guide_items','lesson_topics','topic_statements',
    'microsequences','microsequence_dependencies','microsequence_statements','cards',
    'card_blocks','block_options','block_nodes','flow_nodes','flow_cases','flow_practices','node_practices',
    'node_practice_items','block_edges','block_matrix_items','block_cells','block_points',
    'block_lines','block_highlights','card_refs'
  ] loop
    execute format(
      'create index %I_lineage_idx on public.%I (course_id, source_entity_id) '
      'where source_entity_id is not null', v_table, v_table
    );
    execute format(
      'create unique index %I_identity_key_uidx on public.%I (course_id, identity_key) '
      'where identity_key is not null and deleted_at is null', v_table, v_table
    );
  end loop;
end;
$$;

-- RLS is enabled for every table in the exposed public schema.  Writes are
-- intentionally funneled through transactional RPCs; direct reads remain
-- useful for diagnostics and are still course/user scoped.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'courses','course_memberships','modules','lessons','course_guides','guide_items',
    'lesson_topics','topic_statements','microsequences','microsequence_dependencies',
    'microsequence_statements','cards','card_blocks','block_options','block_nodes',
    'flow_nodes','flow_cases','flow_practices','node_practices','node_practice_items','block_edges',
    'block_matrix_items','block_cells','block_points','block_lines','block_highlights',
    'card_refs','lesson_progress','card_progress','card_comments','sync_devices',
    'sync_mutations','sync_changes'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
  end loop;

  execute 'create policy courses_select on public.courses for select to authenticated '
    'using (public.user_can_read_course(id) or public.is_app_admin())';
  execute 'create policy courses_insert on public.courses for insert to authenticated '
    'with check (public.is_app_admin() or (kind = ''personal'' and owner_id = auth.uid()))';
  execute 'create policy courses_update on public.courses for update to authenticated '
    'using (public.user_can_edit_course(id) or public.is_app_admin()) '
    'with check (public.user_can_edit_course(id) or public.is_app_admin())';
  execute 'create policy courses_delete on public.courses for delete to authenticated '
    'using (public.user_owns_course(id) or public.is_app_admin())';

  execute 'create policy memberships_select on public.course_memberships for select to authenticated '
    'using (user_id = auth.uid() or public.user_can_edit_course(course_id) or public.is_app_admin())';
  execute 'create policy memberships_insert on public.course_memberships for insert to authenticated '
    'with check (public.user_can_edit_course(course_id) or public.is_app_admin())';
  execute 'create policy memberships_update on public.course_memberships for update to authenticated '
    'using (public.user_can_edit_course(course_id) or public.is_app_admin()) '
    'with check (public.user_can_edit_course(course_id) or public.is_app_admin())';
  execute 'create policy memberships_delete on public.course_memberships for delete to authenticated '
    'using (public.user_can_edit_course(course_id) or public.is_app_admin())';

  foreach v_table in array array[
    'modules','lessons','course_guides','guide_items','lesson_topics','topic_statements',
    'microsequences','microsequence_dependencies','microsequence_statements','cards',
    'card_blocks','block_options','block_nodes','flow_nodes','flow_cases','flow_practices','node_practices',
    'node_practice_items','block_edges','block_matrix_items','block_cells','block_points',
    'block_lines','block_highlights','card_refs'
  ] loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      'using (public.user_can_read_course(course_id) or public.is_app_admin())', v_table, v_table
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated '
      'with check (public.user_can_edit_course(course_id) or public.is_app_admin())', v_table, v_table
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated '
      'using (public.user_can_edit_course(course_id) or public.is_app_admin()) '
      'with check (public.user_can_edit_course(course_id) or public.is_app_admin())', v_table, v_table
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated '
      'using (public.user_can_edit_course(course_id) or public.is_app_admin())', v_table, v_table
    );
  end loop;

  foreach v_table in array array['lesson_progress','card_progress','card_comments'] loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      'using (user_id = auth.uid() or public.is_app_admin())', v_table, v_table
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated '
      'with check ((user_id = auth.uid() and public.user_can_study_course(course_id)) or public.is_app_admin())',
      v_table, v_table
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated '
      'using (user_id = auth.uid() or public.is_app_admin()) '
      'with check ((user_id = auth.uid() and public.user_can_study_course(course_id)) or public.is_app_admin())',
      v_table, v_table
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated '
      'using (user_id = auth.uid() or public.is_app_admin())', v_table, v_table
    );
  end loop;
end;
$$;

create policy sync_devices_select on public.sync_devices for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());
create policy sync_devices_insert on public.sync_devices for insert to authenticated
  with check (user_id = auth.uid() or public.is_app_admin());
create policy sync_devices_update on public.sync_devices for update to authenticated
  using (user_id = auth.uid() or public.is_app_admin())
  with check (user_id = auth.uid() or public.is_app_admin());
create policy sync_devices_delete on public.sync_devices for delete to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy sync_mutations_select on public.sync_mutations for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());
create policy sync_changes_select on public.sync_changes for select to authenticated
  using (
    public.is_app_admin() or audience_user_id = auth.uid()
    or (audience_user_id is null and course_id is not null and public.user_can_read_course(course_id))
  );

revoke all privileges on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.user_owns_course(uuid) to authenticated;
grant execute on function public.user_can_read_course(uuid) to authenticated;
grant execute on function public.user_can_edit_course(uuid) to authenticated;
grant execute on function public.user_can_study_course(uuid) to authenticated;
grant execute on function public.compute_course_content_hash(uuid) to authenticated;
grant execute on function public.clone_catalog_course(uuid, uuid) to authenticated;
grant execute on function public.refresh_personal_course_from_source(uuid, uuid) to authenticated;
grant execute on function public.delete_personal_course(uuid, bigint, uuid) to authenticated;
grant execute on function public.validate_course_graph(uuid) to authenticated;
grant execute on function public.list_catalog_courses() to authenticated;
grant execute on function public.list_user_course_summaries() to authenticated;
grant execute on function public.apply_sync_batch(uuid, jsonb) to authenticated;
grant execute on function public.pull_sync_changes(bigint, integer, uuid) to authenticated;
grant execute on function public.replace_microsequence_cards(uuid, uuid, jsonb, bigint) to service_role;
grant execute on function public.replace_microsequence_cards(uuid, uuid, jsonb, bigint, uuid) to authenticated;
grant execute on function public.publish_official_course(uuid) to authenticated, service_role;
grant execute on function public.import_official_course(jsonb, boolean) to authenticated, service_role;

revoke all on schema private from public, anon, authenticated;

-- The browser replica uses JavaScript store names and camelCase rows.  Keep the
-- physical SQL names private to this adapter so the sync protocol is stable.
create or replace function private.camel_key(p_key text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_parts text[] := string_to_array(p_key, '_');
  v_result text := lower(v_parts[1]);
  v_index integer;
begin
  for v_index in 2 .. coalesce(array_length(v_parts, 1), 1) loop
    v_result := v_result || upper(left(v_parts[v_index], 1)) || substr(v_parts[v_index], 2);
  end loop;
  return v_result;
end;
$$;

create or replace function private.snake_key(p_key text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select lower(regexp_replace(p_key, '([A-Z])', '_\1', 'g'));
$$;

create or replace function private.jsonb_to_camel(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, private
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) <> 'object' then p_value
    else coalesce((
      select jsonb_object_agg(private.camel_key(entry.key), entry.value)
      from jsonb_each(p_value) entry
    ), '{}'::jsonb)
  end;
$$;

create or replace function private.jsonb_to_snake(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, private
as $$
  select case
    when p_value is null then '{}'::jsonb
    when jsonb_typeof(p_value) <> 'object' then p_value
    else coalesce((
      select jsonb_object_agg(private.snake_key(entry.key), entry.value)
      from jsonb_each(p_value) entry
    ), '{}'::jsonb)
  end;
$$;

create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return nullif(p_value, '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.try_bigint(p_value text, p_default bigint default 0)
returns bigint
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return coalesce(nullif(p_value, '')::bigint, p_default);
exception when invalid_text_representation or numeric_value_out_of_range then
  return p_default;
end;
$$;

create or replace function private.store_name(p_table_name text, p_row jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_table_name
    when 'courses' then 'courses'
    when 'course_memberships' then 'memberships'
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
  end;
$$;

create or replace function private.local_row(p_store_name text, p_row jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, private
as $$
declare
  v_row jsonb := private.jsonb_to_camel(p_row);
  v_common_server text[] := array['createdAt'];
begin
  if p_store_name = 'courses' then
    return (v_row - 'createdAt') || jsonb_build_object('courseId', p_row -> 'id');
  elsif p_store_name = 'memberships' then
    return v_row - array['createdAt'];
  elsif p_store_name in ('modules','lessons','microsequences','dependencies') then
    return v_row - v_common_server;
  elsif p_store_name = 'microsequenceStatements' then
    return v_row - array['statementKind','createdAt'];
  elsif p_store_name = 'guides' then
    return v_row - array['moduleId','lessonId','createdAt'];
  elsif p_store_name = 'guideItems' then
    return v_row - array['itemKind','createdAt'];
  elsif p_store_name = 'topics' then
    return v_row - array['kind','createdAt'];
  elsif p_store_name = 'topicStatements' then
    return v_row - array['statementKind','createdAt'];
  elsif p_store_name = 'cards' then
    return v_row - array['kind','afterText','createdAt'];
  elsif p_store_name = 'blocks' then
    return v_row - array[
      'contractKey','parentBlockId','role','valueText','scaleFactor','createdAt'
    ];
  elsif p_store_name = 'options' then
    return v_row - array['textValue','enabled','createdAt'];
  elsif p_store_name = 'nodes' then
    return v_row - v_common_server;
  elsif p_store_name in ('flowNodes','flowCases') then
    return v_row - v_common_server;
  elsif p_store_name = 'flowPractices' then
    return (v_row - array['flowNodeId','flowCaseId','createdAt']) ||
      jsonb_build_object('ownerId', coalesce(p_row -> 'flow_node_id', p_row -> 'flow_case_id'));
  elsif p_store_name = 'flowPracticeEntries' then
    return v_row - v_common_server;
  elsif p_store_name = 'flowPracticeOptions' then
    return v_row - array[
      'flowPracticeId','itemKind','regex','hasRegex','createdAt'
    ];
  elsif p_store_name = 'flowPracticeVariants' then
    return v_row - array[
      'flowPracticeId','itemKind','enabled','hasEnabled','createdAt'
    ];
  elsif p_store_name = 'flowShapeOptions' then
    return (v_row - array[
      'entryId','flowPracticeId','itemKind','contractKey','wasPrimitive',
      'hasContractKey','enabled','hasEnabled','hasRegex','regex','createdAt'
    ]) || jsonb_build_object('practiceId', p_row -> 'flow_practice_id');
  elsif p_store_name = 'edges' then
    return v_row - array['contractKey','edgeRole','directed','createdAt'];
  elsif p_store_name = 'matrixItems' then
    return v_row - array[
      'contractKey','itemKind','dividerAfterColumn','rowCount','columnCount','createdAt'
    ];
  elsif p_store_name = 'cells' then
    return v_row - array['cellRole','createdAt'];
  elsif p_store_name = 'points' then
    return v_row - array['contractKey','pointKind','groupIndex','createdAt'];
  elsif p_store_name = 'lines' then
    return v_row - array['contractKey','lineKind','createdAt'];
  elsif p_store_name = 'highlights' then
    return v_row - array[
      'targetKind','textValue','targetNodeId','secondaryNodeId','createdAt'
    ];
  elsif p_store_name = 'cardSources' then
    return v_row - array['topicId','refKind','topicContractKey','createdAt'];
  elsif p_store_name = 'cardTopics' then
    return v_row - array['value','refKind','createdAt'];
  elsif p_store_name = 'lessonProgress' then
    return v_row - v_common_server;
  elsif p_store_name = 'cardProgress' then
    return v_row - v_common_server;
  elsif p_store_name = 'comments' then
    return v_row;
  end if;
  return v_row;
end;
$$;

create or replace function private.table_for_store(p_store_name text)
returns regclass
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_store_name
    when 'courses' then 'public.courses'::regclass
    when 'memberships' then 'public.course_memberships'::regclass
    when 'modules' then 'public.modules'::regclass
    when 'lessons' then 'public.lessons'::regclass
    when 'guides' then 'public.course_guides'::regclass
    when 'guideItems' then 'public.guide_items'::regclass
    when 'topics' then 'public.lesson_topics'::regclass
    when 'topicStatements' then 'public.topic_statements'::regclass
    when 'microsequences' then 'public.microsequences'::regclass
    when 'dependencies' then 'public.microsequence_dependencies'::regclass
    when 'microsequenceStatements' then 'public.microsequence_statements'::regclass
    when 'cards' then 'public.cards'::regclass
    when 'blocks' then 'public.card_blocks'::regclass
    when 'options' then 'public.block_options'::regclass
    when 'nodes' then 'public.block_nodes'::regclass
    when 'flowNodes' then 'public.flow_nodes'::regclass
    when 'flowCases' then 'public.flow_cases'::regclass
    when 'flowPractices' then 'public.flow_practices'::regclass
    when 'flowPracticeEntries' then 'public.node_practices'::regclass
    when 'flowPracticeOptions' then 'public.node_practice_items'::regclass
    when 'flowPracticeVariants' then 'public.node_practice_items'::regclass
    when 'flowShapeOptions' then 'public.node_practice_items'::regclass
    when 'edges' then 'public.block_edges'::regclass
    when 'matrixItems' then 'public.block_matrix_items'::regclass
    when 'cells' then 'public.block_cells'::regclass
    when 'points' then 'public.block_points'::regclass
    when 'lines' then 'public.block_lines'::regclass
    when 'highlights' then 'public.block_highlights'::regclass
    when 'cardSources' then 'public.card_refs'::regclass
    when 'cardTopics' then 'public.card_refs'::regclass
    when 'lessonProgress' then 'public.lesson_progress'::regclass
    when 'cardProgress' then 'public.card_progress'::regclass
    when 'comments' then 'public.card_comments'::regclass
    else null
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
set search_path = pg_catalog, private
as $$
declare
  v_result jsonb;
  v_table_name text := (select relname from pg_class where oid = p_table);
begin
  execute format(
    'select coalesce(jsonb_agg(private.local_row(coalesce($2, private.store_name($3, to_jsonb(t))), to_jsonb(t)) order by t.position, t.id), ''[]''::jsonb) '
    'from %s t where t.course_id = $1 and t.deleted_at is null '
    'and ($2 is null or private.store_name($3, to_jsonb(t)) = $2)', p_table
  ) into v_result using p_course_id, p_store_name, v_table_name;
  return v_result;
exception when undefined_column then
  execute format(
    'select coalesce(jsonb_agg(private.local_row(coalesce($2, private.store_name($3, to_jsonb(t))), to_jsonb(t)) order by t.id), ''[]''::jsonb) '
    'from %s t where t.course_id = $1 and t.deleted_at is null '
    'and ($2 is null or private.store_name($3, to_jsonb(t)) = $2)', p_table
  ) into v_result using p_course_id, p_store_name, v_table_name;
  return v_result;
end;
$$;

create or replace function public.get_personal_course_graph(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_course public.courses%rowtype;
  v_course_json jsonb;
begin
  if auth.uid() is null or not public.user_can_read_course(p_course_id) then
    raise exception 'Curso pessoal não autorizado.' using errcode = '42501';
  end if;
  select * into v_course from public.courses
  where id = p_course_id and kind = 'personal' and deleted_at is null;
  if not found then
    raise exception 'Curso pessoal não encontrado.' using errcode = '22023';
  end if;
  v_course_json := private.local_row('courses', to_jsonb(v_course));
  return jsonb_build_object(
    'schemaVersion', 1, 'courses', jsonb_build_array(v_course_json),
    'memberships', (
      select coalesce(
        jsonb_agg(private.local_row('memberships', to_jsonb(membership))
          order by membership.position, membership.id),
        '[]'::jsonb
      )
      from public.course_memberships membership
      where membership.course_id = p_course_id and membership.deleted_at is null
        and (public.is_app_admin() or membership.user_id = auth.uid())
    ),
    'modules', private.camel_active_rows('public.modules', p_course_id),
    'lessons', private.camel_active_rows('public.lessons', p_course_id),
    'guides', private.camel_active_rows('public.course_guides', p_course_id),
    'guideItems', private.camel_active_rows('public.guide_items', p_course_id),
    'topics', private.camel_active_rows('public.lesson_topics', p_course_id),
    'topicStatements', private.camel_active_rows('public.topic_statements', p_course_id),
    'microsequences', private.camel_active_rows('public.microsequences', p_course_id),
    'dependencies', private.camel_active_rows('public.microsequence_dependencies', p_course_id),
    'microsequenceStatements', private.camel_active_rows('public.microsequence_statements', p_course_id),
    'cards', private.camel_active_rows('public.cards', p_course_id),
    'blocks', private.camel_active_rows('public.card_blocks', p_course_id),
    'options', private.camel_active_rows('public.block_options', p_course_id),
    'nodes', private.camel_active_rows('public.block_nodes', p_course_id),
    'flowNodes', private.camel_active_rows('public.flow_nodes', p_course_id),
    'flowCases', private.camel_active_rows('public.flow_cases', p_course_id),
    'flowPractices', private.camel_active_rows('public.flow_practices', p_course_id),
    'flowPracticeEntries', private.camel_active_rows('public.node_practices', p_course_id),
    'flowPracticeOptions', private.camel_active_rows('public.node_practice_items', p_course_id, 'flowPracticeOptions'),
    'flowPracticeVariants', private.camel_active_rows('public.node_practice_items', p_course_id, 'flowPracticeVariants'),
    'flowShapeOptions', private.camel_active_rows('public.node_practice_items', p_course_id, 'flowShapeOptions'),
    'edges', private.camel_active_rows('public.block_edges', p_course_id),
    'matrixItems', private.camel_active_rows('public.block_matrix_items', p_course_id),
    'cells', private.camel_active_rows('public.block_cells', p_course_id),
    'points', private.camel_active_rows('public.block_points', p_course_id),
    'lines', private.camel_active_rows('public.block_lines', p_course_id),
    'highlights', private.camel_active_rows('public.block_highlights', p_course_id),
    'cardSources', private.camel_active_rows('public.card_refs', p_course_id, 'cardSources'),
    'cardTopics', private.camel_active_rows('public.card_refs', p_course_id, 'cardTopics'),
    'lessonProgress', (
      select coalesce(jsonb_agg(private.local_row('lessonProgress', to_jsonb(lp)) order by lp.updated_at, lp.id), '[]')
      from public.lesson_progress lp where lp.course_id = p_course_id and lp.user_id = auth.uid()
        and lp.deleted_at is null
    ),
    'cardProgress', (
      select coalesce(jsonb_agg(private.local_row('cardProgress', to_jsonb(cp)) order by cp.updated_at, cp.id), '[]')
      from public.card_progress cp where cp.course_id = p_course_id and cp.user_id = auth.uid()
        and cp.deleted_at is null
    ),
    'comments', (
      select coalesce(jsonb_agg(private.local_row('comments', to_jsonb(comment)) order by comment.updated_at, comment.id), '[]')
      from public.card_comments comment where comment.course_id = p_course_id and comment.user_id = auth.uid()
        and comment.deleted_at is null
    )
  );
end;
$$;

revoke all on function public.get_personal_course_graph(uuid) from public, anon, authenticated;
grant execute on function public.get_personal_course_graph(uuid) to authenticated;
revoke all privileges on all functions in schema private from public, anon, authenticated;

commit;
