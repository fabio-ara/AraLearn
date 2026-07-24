begin;

select pg_advisory_xact_lock(
  hashtextextended('aralearn-pedagogical-learning-metadata', 0)
);

-- Estes componentes pertencem ao protocolo pedagógico de autoria. Eles não
-- são aliases de lesson_topics: conceptId, termId, operationId e outcomeId
-- têm identidade própria e nunca são resolvidos por aproximação textual.
create table public.learning_components (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  component_key text not null,
  component_type text not null,
  label text,
  description text,
  criterion text,
  language_tag text,
  source_entity_id uuid references public.learning_components(id)
    on delete restrict,
  materialized_from_run_id uuid references private.authoring_runs(id)
    on delete set null,
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(course_id, id),
  constraint learning_components_key check (
    btrim(component_key) <> '' and char_length(component_key) <= 240
  ),
  constraint learning_components_type check (
    component_type in (
      'concept', 'operation', 'term', 'outcome', 'misconception'
    )
  ),
  constraint learning_components_label check (
    label is null or btrim(label) <> ''
  ),
  constraint learning_components_description check (
    description is null or btrim(description) <> ''
  ),
  constraint learning_components_criterion check (
    (
      component_type in ('outcome', 'operation', 'misconception')
      and criterion is not null
      and btrim(criterion) <> ''
      and label is not null
    )
    or (
      component_type not in ('outcome', 'operation', 'misconception')
      and (criterion is null or btrim(criterion) <> '')
    )
  ),
  constraint learning_components_language check (
    language_tag is null
    or language_tag ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'
  ),
  constraint learning_components_named check (
    label is not null
  ),
  constraint learning_components_source check (
    source_entity_id is distinct from id
  ),
  constraint learning_components_position check (position >= 0),
  constraint learning_components_revision check (revision > 0),
  constraint learning_components_time check (updated_at >= created_at)
);

create unique index learning_components_active_key_uidx
  on public.learning_components(course_id, component_key)
  where deleted_at is null;
create index learning_components_course_type_idx
  on public.learning_components(course_id, component_type, position, id)
  where deleted_at is null;
create index learning_components_source_idx
  on public.learning_components(source_entity_id)
  where source_entity_id is not null;

-- A ligação com o contrato público v3 é deliberadamente explícita. A tabela
-- permanece vazia quando o protocolo não fornece componentKey + topicId.
create table public.learning_component_topic_links (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  component_id uuid not null,
  topic_id uuid not null,
  link_kind text not null,
  protocol_path text not null,
  source_entity_id uuid references public.learning_component_topic_links(id)
    on delete restrict,
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(course_id, id),
  constraint learning_component_topic_links_component_fk
    foreign key(course_id, component_id)
    references public.learning_components(course_id, id) on delete cascade,
  constraint learning_component_topic_links_topic_fk
    foreign key(course_id, topic_id)
    references public.lesson_topics(course_id, id) on delete cascade,
  constraint learning_component_topic_links_kind check (
    link_kind in ('equivalent', 'contextualizes', 'represented_by')
  ),
  constraint learning_component_topic_links_path check (
    btrim(protocol_path) <> ''
  ),
  constraint learning_component_topic_links_source check (
    source_entity_id is distinct from id
  ),
  constraint learning_component_topic_links_position check (position >= 0),
  constraint learning_component_topic_links_revision check (revision > 0),
  constraint learning_component_topic_links_time check (updated_at >= created_at)
);

create unique index learning_component_topic_links_active_uidx
  on public.learning_component_topic_links(
    course_id, component_id, topic_id, link_kind
  ) where deleted_at is null;
create index learning_component_topic_links_topic_idx
  on public.learning_component_topic_links(course_id, topic_id, link_kind)
  where deleted_at is null;
create index learning_component_topic_links_source_idx
  on public.learning_component_topic_links(source_entity_id)
  where source_entity_id is not null;

create table public.learning_component_relations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  from_component_id uuid not null,
  to_component_id uuid not null,
  relation_kind text not null,
  source_entity_id uuid references public.learning_component_relations(id)
    on delete restrict,
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(course_id, id),
  constraint learning_component_relations_from_fk
    foreign key(course_id, from_component_id)
    references public.learning_components(course_id, id) on delete cascade,
  constraint learning_component_relations_to_fk
    foreign key(course_id, to_component_id)
    references public.learning_components(course_id, id) on delete cascade,
  constraint learning_component_relations_kind check (
    relation_kind in (
      'requires', 'part_of', 'contrasts', 'represents', 'applies', 'causes'
    )
  ),
  constraint learning_component_relations_distinct check (
    from_component_id <> to_component_id
  ),
  constraint learning_component_relations_source check (
    source_entity_id is distinct from id
  ),
  constraint learning_component_relations_position check (position >= 0),
  constraint learning_component_relations_revision check (revision > 0),
  constraint learning_component_relations_time check (updated_at >= created_at)
);

create unique index learning_component_relations_active_uidx
  on public.learning_component_relations(
    course_id, from_component_id, to_component_id, relation_kind
  ) where deleted_at is null;
create index learning_component_relations_from_idx
  on public.learning_component_relations(
    course_id, from_component_id, relation_kind, position
  ) where deleted_at is null;
create index learning_component_relations_to_idx
  on public.learning_component_relations(
    course_id, to_component_id, relation_kind
  ) where deleted_at is null;
create index learning_component_relations_source_idx
  on public.learning_component_relations(source_entity_id)
  where source_entity_id is not null;

create table public.learning_component_placements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  component_id uuid not null,
  microsequence_id uuid not null,
  card_id uuid,
  learning_role text not null,
  learning_function text,
  support_level text,
  evidence_statement text,
  variation_focus text,
  target_error text,
  source_entity_id uuid references public.learning_component_placements(id)
    on delete restrict,
  position integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(course_id, id),
  constraint learning_component_placements_component_fk
    foreign key(course_id, component_id)
    references public.learning_components(course_id, id) on delete cascade,
  constraint learning_component_placements_microsequence_fk
    foreign key(course_id, microsequence_id)
    references public.microsequences(course_id, id) on delete cascade,
  constraint learning_component_placements_card_fk
    foreign key(course_id, card_id)
    references public.cards(course_id, id) on delete cascade,
  constraint learning_component_placements_role check (
    learning_role in ('introduce', 'practice', 'retrieve', 'assess', 'correct')
  ),
  constraint learning_component_placements_function check (
    learning_function is null
    or learning_function in (
      'foundation', 'worked_example', 'guided_practice',
      'independent_practice', 'contrast', 'error_diagnosis', 'integration'
    )
  ),
  constraint learning_component_placements_support check (
    support_level is null
    or support_level in ('modeled', 'guided', 'reduced', 'independent')
  ),
  constraint learning_component_placements_evidence check (
    evidence_statement is null or btrim(evidence_statement) <> ''
  ),
  constraint learning_component_placements_variation check (
    variation_focus is null or btrim(variation_focus) <> ''
  ),
  constraint learning_component_placements_error check (
    target_error is null or btrim(target_error) <> ''
  ),
  constraint learning_component_placements_source check (
    source_entity_id is distinct from id
  ),
  constraint learning_component_placements_position check (position >= 0),
  constraint learning_component_placements_revision check (revision > 0),
  constraint learning_component_placements_time check (updated_at >= created_at)
);

create unique index learning_component_placements_active_uidx
  on public.learning_component_placements(
    course_id, component_id, microsequence_id,
    coalesce(card_id, '00000000-0000-0000-0000-000000000000'::uuid),
    learning_role
  ) where deleted_at is null;
create index learning_component_placements_continuity_idx
  on public.learning_component_placements(
    course_id, component_id, position, microsequence_id, card_id
  ) where deleted_at is null;
create index learning_component_placements_card_idx
  on public.learning_component_placements(
    course_id, card_id, learning_role, component_id
  ) where deleted_at is null and card_id is not null;
create index learning_component_placements_source_idx
  on public.learning_component_placements(source_entity_id)
  where source_entity_id is not null;

comment on table public.learning_components is
  'Identidades pedagógicas formais do protocolo de autoria, distintas da árvore v3.';
comment on table public.learning_component_topic_links is
  'Vínculos explícitos, nunca inferidos, entre componentes autorais e lesson_topics.';
comment on table public.learning_component_relations is
  'Relações dirigidas e tipadas entre componentes pedagógicos do mesmo curso.';
comment on table public.learning_component_placements is
  'Introdução, prática, retomada, avaliação ou correção de um componente na sequência didática.';

create or replace function private.guard_learning_requires_cycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.deleted_at is not null or new.relation_kind <> 'requires' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('learning-requires:' || new.course_id::text, 0)
  );

  if exists (
    with recursive reachable(component_id) as (
      select relation.to_component_id
      from public.learning_component_relations relation
      where relation.course_id = new.course_id
        and relation.relation_kind = 'requires'
        and relation.deleted_at is null
        and relation.id <> new.id
        and relation.from_component_id = new.to_component_id
      union
      select relation.to_component_id
      from public.learning_component_relations relation
      join reachable path
        on path.component_id = relation.from_component_id
      where relation.course_id = new.course_id
        and relation.relation_kind = 'requires'
        and relation.deleted_at is null
        and relation.id <> new.id
    )
    select 1
    from reachable
    where component_id = new.from_component_id
  ) then
    raise exception 'A relação requires criaria um ciclo pedagógico.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger learning_component_relations_guard_cycle
before insert or update of course_id, from_component_id, to_component_id,
  relation_kind, deleted_at
on public.learning_component_relations
for each row execute function private.guard_learning_requires_cycle();

create or replace function private.guard_learning_component_placement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_component_type text;
  v_card_microsequence_id uuid;
  v_microsequence_exists boolean;
begin
  -- Desativar uma associação pedagógica não depende de reler os seus pais.
  -- Qualquer reativação volta a passar por todas as verificações.
  if new.deleted_at is not null then
    return new;
  end if;

  select component.component_type into v_component_type
  from public.learning_components component
  where component.course_id = new.course_id
    and component.id = new.component_id
    and component.deleted_at is null;

  if not found then
    raise exception 'O componente pedagógico está ausente ou desativado.'
      using errcode = '23514';
  end if;

  select exists(
    select 1
    from public.microsequences microsequence
    where microsequence.course_id = new.course_id
      and microsequence.id = new.microsequence_id
  ) into v_microsequence_exists;
  if not v_microsequence_exists then
    raise exception 'A microssequência pedagógica está ausente.'
      using errcode = '23514';
  end if;

  if new.card_id is not null then
    select card.microsequence_id into v_card_microsequence_id
    from public.cards card
    where card.course_id = new.course_id
      and card.id = new.card_id;
    if not found or v_card_microsequence_id <> new.microsequence_id then
      raise exception 'O card não pertence à microssequência informada.'
        using errcode = '23514';
    end if;
  end if;

  if new.card_id is not null
     and v_component_type in ('operation', 'outcome')
     and (
       new.learning_function is null
       or new.evidence_statement is null
     ) then
    raise exception
      'Operações e resultados ligados a card exigem função e evidência.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger learning_component_placements_guard
before insert or update of course_id, component_id, microsequence_id, card_id,
  learning_function, evidence_statement, deleted_at
on public.learning_component_placements
for each row execute function private.guard_learning_component_placement();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'learning_components',
    'learning_component_topic_links',
    'learning_component_relations',
    'learning_component_placements'
  ] loop
    execute format(
      'create trigger %I_touch_revision before update on public.%I '
      'for each row execute function private.touch_revision()',
      v_table, v_table
    );
  end loop;
end;
$$;

create or replace function private.learning_component_continuity(
  p_course_id uuid,
  p_component_key text default null
)
returns table(
  component_key text,
  component_type text,
  learning_role text,
  module_key text,
  module_position integer,
  lesson_key text,
  lesson_position integer,
  microsequence_key text,
  microsequence_position integer,
  card_key text,
  card_position integer,
  evidence_statement text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    component.component_key,
    component.component_type,
    placement.learning_role,
    module.contract_key,
    module.position,
    lesson.contract_key,
    lesson.position,
    microsequence.contract_key,
    microsequence.position,
    card.contract_key,
    card.position,
    placement.evidence_statement
  from public.learning_components component
  join public.learning_component_placements placement
    on placement.course_id = component.course_id
   and placement.component_id = component.id
   and placement.deleted_at is null
  join public.microsequences microsequence
    on microsequence.course_id = placement.course_id
   and microsequence.id = placement.microsequence_id
  join public.lessons lesson
    on lesson.course_id = microsequence.course_id
   and lesson.id = microsequence.lesson_id
  join public.modules module
    on module.course_id = lesson.course_id
   and module.id = lesson.module_id
  left join public.cards card
    on card.course_id = placement.course_id
   and card.id = placement.card_id
  where component.course_id = p_course_id
    and component.deleted_at is null
    and (
      p_component_key is null
      or component.component_key = p_component_key
    )
  order by
    module.position, lesson.position, microsequence.position,
    card.position nulls first, placement.position, component.component_key;
$$;

create or replace function private.authoring_learning_continuity(
  p_course_id uuid,
  p_component_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_placements jsonb;
begin
  perform private.require_service_role();

  if p_course_id is null then
    raise exception 'courseId é obrigatório.' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(continuity)
      order by
        continuity.module_position,
        continuity.lesson_position,
        continuity.microsequence_position,
        continuity.card_position nulls first,
        continuity.component_key
    ),
    '[]'::jsonb
  )
  into v_placements
  from private.learning_component_continuity(
    p_course_id,
    nullif(btrim(p_component_key), '')
  ) continuity;

  return jsonb_build_object(
    'courseId', p_course_id,
    'componentKey', nullif(btrim(p_component_key), ''),
    'placements', v_placements
  );
end;
$$;

create or replace function private.materialize_authoring_learning_metadata(
  p_run_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_ambiguous_keys integer;
  v_incompatible_existing integer;
  v_unresolved_cards integer;
  v_expected_placements integer;
  v_invalid_relations integer;
  v_existing_result jsonb;
begin
  if p_run_id is null or p_course_id is null then
    raise exception 'runId e courseId são obrigatórios.'
      using errcode = '22023';
  end if;

  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id
  for share;

  if not found then
    raise exception 'Execução de autoria inexistente.'
      using errcode = 'P0002';
  end if;

  if v_run.terminal_compacted_at is not null then
    if v_run.course_id is distinct from p_course_id then
      raise exception
        'Execução compactada e curso incompatíveis para materialização pedagógica.'
        using errcode = '23514';
    end if;

    v_existing_result :=
      v_run.validation_report->'pedagogicalMaterialization';
    if jsonb_typeof(v_existing_result) is distinct from 'object' then
      raise exception
        'Execução compactada sem recibo de materialização pedagógica.'
        using errcode = '55000';
    end if;

    return v_existing_result || jsonb_build_object('idempotent', true);
  end if;

  if v_run.plan is null
     or (v_run.course_id is not null and v_run.course_id <> p_course_id)
     or not exists(
       select 1 from public.courses course where course.id = p_course_id
     ) then
    raise exception 'Execução e curso incompatíveis para materialização pedagógica.'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('learning-metadata:' || p_course_id::text, 0)
  );

  create temporary table if not exists
    aralearn_desired_learning_components (
      component_key text not null,
      component_type text not null,
      label text,
      description text,
      criterion text,
      language_tag text,
      position integer not null,
      primary key(component_key, component_type)
    ) on commit drop;
  truncate aralearn_desired_learning_components;

  insert into aralearn_desired_learning_components(
    component_key, component_type, label, description, criterion,
    language_tag, position
  )
  select
    concept.item->>'id',
    'concept',
    concept.item->>'label',
    null,
    null,
    null,
    (concept.ordinality - 1)::integer
  from jsonb_array_elements(
    coalesce(v_run.plan->'conceptMap'->'concepts', '[]'::jsonb)
  ) with ordinality concept(item, ordinality)
  where nullif(btrim(concept.item->>'id'), '') is not null
    and nullif(btrim(concept.item->>'label'), '') is not null
  on conflict(component_key, component_type) do update
  set label = excluded.label, position = excluded.position;

  insert into aralearn_desired_learning_components(
    component_key, component_type, label, description, criterion,
    language_tag, position
  )
  select
    outcome.item->>'id',
    'outcome',
    outcome.item->>'statement',
    null,
    outcome.item->>'evidence',
    null,
    (outcome.ordinality - 1)::integer
  from jsonb_array_elements(
    coalesce(v_run.plan->'learningOutcomes', '[]'::jsonb)
  ) with ordinality outcome(item, ordinality)
  where nullif(btrim(outcome.item->>'id'), '') is not null
    and nullif(btrim(outcome.item->>'statement'), '') is not null
    and nullif(btrim(outcome.item->>'evidence'), '') is not null
  on conflict(component_key, component_type) do update
  set label = excluded.label,
      criterion = excluded.criterion,
      position = excluded.position;

  insert into aralearn_desired_learning_components(
    component_key, component_type, label, description, criterion,
    language_tag, position
  )
  select distinct on (term.item->>'termId')
    term.item->>'termId',
    'term',
    term.item->>'form',
    term.item->>'explanation',
    null,
    nullif(btrim(term.item->>'language'), ''),
    (chunk.position * 10000 + term.ordinality - 1)::integer
  from private.authoring_ledger_chunks chunk
  cross join lateral jsonb_array_elements(chunk.items)
    with ordinality term(item, ordinality)
  where chunk.run_id = p_run_id
    and chunk.section = 'terms'
    and nullif(btrim(term.item->>'termId'), '') is not null
    and nullif(btrim(term.item->>'form'), '') is not null
  order by term.item->>'termId', chunk.position, term.ordinality
  on conflict(component_key, component_type) do update
  set label = excluded.label,
      description = excluded.description,
      language_tag = excluded.language_tag,
      position = excluded.position;

  insert into aralearn_desired_learning_components(
    component_key, component_type, label, description, criterion,
    language_tag, position
  )
  select
    operation.item->>'id',
    'operation',
    operation.item->>'label',
    null,
    operation.item->>'evidence',
    null,
    (operation.ordinality - 1)::integer
  from jsonb_array_elements(
    coalesce(v_run.plan->'operations', '[]'::jsonb)
  ) with ordinality operation(item, ordinality)
  where nullif(btrim(operation.item->>'id'), '') is not null
    and nullif(btrim(operation.item->>'label'), '') is not null
    and nullif(btrim(operation.item->>'evidence'), '') is not null
  on conflict(component_key, component_type) do update
  set label = excluded.label,
      criterion = excluded.criterion,
      position = excluded.position;

  insert into aralearn_desired_learning_components(
    component_key, component_type, label, description, criterion,
    language_tag, position
  )
  select
    misconception.item->>'id',
    'misconception',
    misconception.item->>'statement',
    null,
    misconception.item->>'correctionEvidence',
    null,
    (misconception.ordinality - 1)::integer
  from jsonb_array_elements(
    coalesce(v_run.plan->'misconceptions', '[]'::jsonb)
  ) with ordinality misconception(item, ordinality)
  where nullif(btrim(misconception.item->>'id'), '') is not null
    and nullif(btrim(misconception.item->>'statement'), '') is not null
    and nullif(btrim(misconception.item->>'correctionEvidence'), '') is not null
  on conflict(component_key, component_type) do update
  set label = excluded.label,
      criterion = excluded.criterion,
      position = excluded.position;

  select count(*) into v_ambiguous_keys
  from (
    select desired.component_key
    from aralearn_desired_learning_components desired
    group by desired.component_key
    having count(*) > 1
  ) ambiguous;
  if v_ambiguous_keys > 0 then
    raise exception
      'O protocolo reutiliza % identificador(es) em tipos pedagógicos distintos.',
      v_ambiguous_keys
      using errcode = '23514';
  end if;

  select count(*) into v_incompatible_existing
  from public.learning_components component
  join aralearn_desired_learning_components desired
    on desired.component_key = component.component_key
  where component.course_id = p_course_id
    and component.deleted_at is null
    and component.component_type <> desired.component_type;
  if v_incompatible_existing > 0 then
    raise exception 'Identificador pedagógico não pode mudar de tipo.'
      using errcode = '23514';
  end if;

  insert into public.learning_components(
    course_id, component_key, component_type, label, description, criterion,
    language_tag, materialized_from_run_id, position
  )
  select
    p_course_id, desired.component_key, desired.component_type,
    desired.label, desired.description, desired.criterion,
    desired.language_tag, p_run_id, desired.position
  from aralearn_desired_learning_components desired
  on conflict(course_id, component_key) where deleted_at is null
  do update set
    label = excluded.label,
    description = excluded.description,
    criterion = excluded.criterion,
    language_tag = excluded.language_tag,
    materialized_from_run_id = excluded.materialized_from_run_id,
    position = excluded.position
  where (
    public.learning_components.label,
    public.learning_components.description,
    public.learning_components.criterion,
    public.learning_components.language_tag,
    public.learning_components.materialized_from_run_id,
    public.learning_components.position
  ) is distinct from (
    excluded.label,
    excluded.description,
    excluded.criterion,
    excluded.language_tag,
    excluded.materialized_from_run_id,
    excluded.position
  );

  update public.learning_components component
  set deleted_at = now()
  where component.course_id = p_course_id
    and component.deleted_at is null
    and not exists (
      select 1
      from aralearn_desired_learning_components desired
      where desired.component_key = component.component_key
    );

  update public.learning_component_topic_links link
  set deleted_at = now()
  where link.course_id = p_course_id
    and link.deleted_at is null
    and exists (
      select 1
      from public.learning_components component
      where component.id = link.component_id
        and component.deleted_at is not null
    );

  create temporary table if not exists
    aralearn_desired_learning_relations (
      from_component_id uuid not null,
      to_component_id uuid not null,
      relation_kind text not null,
      position integer not null,
      primary key(from_component_id, to_component_id, relation_kind)
  ) on commit drop;
  truncate aralearn_desired_learning_relations;

  select count(*) into v_invalid_relations
  from jsonb_array_elements(
    coalesce(v_run.plan->'conceptMap'->'relations', '[]'::jsonb)
  ) relation(item)
  where coalesce(relation.item->>'relation', '') not in (
          'requires', 'part_of', 'contrasts',
          'represents', 'applies', 'causes'
        )
     or relation.item->>'from' = relation.item->>'to'
     or not exists (
       select 1
       from public.learning_components component
       where component.course_id = p_course_id
         and component.component_key = relation.item->>'from'
         and component.component_type = 'concept'
         and component.deleted_at is null
     )
     or not exists (
       select 1
       from public.learning_components component
       where component.course_id = p_course_id
         and component.component_key = relation.item->>'to'
         and component.component_type = 'concept'
         and component.deleted_at is null
     );

  if v_invalid_relations > 0 then
    raise exception
      'O mapa conceitual contém % relação(ões) inválida(s) ou não resolvida(s).',
      v_invalid_relations
      using errcode = '23514';
  end if;

  insert into aralearn_desired_learning_relations(
    from_component_id, to_component_id, relation_kind, position
  )
  select distinct on (
    source.id, target.id, relation.item->>'relation'
  )
    source.id,
    target.id,
    relation.item->>'relation',
    (relation.ordinality - 1)::integer
  from jsonb_array_elements(
    coalesce(v_run.plan->'conceptMap'->'relations', '[]'::jsonb)
  ) with ordinality relation(item, ordinality)
  join public.learning_components source
    on source.course_id = p_course_id
   and source.component_key = relation.item->>'from'
   and source.component_type = 'concept'
   and source.deleted_at is null
  join public.learning_components target
    on target.course_id = p_course_id
   and target.component_key = relation.item->>'to'
   and target.component_type = 'concept'
   and target.deleted_at is null
  where relation.item->>'relation' in (
    'requires', 'part_of', 'contrasts', 'represents', 'applies', 'causes'
  )
    and source.id <> target.id
  order by
    source.id, target.id, relation.item->>'relation', relation.ordinality
  on conflict(from_component_id, to_component_id, relation_kind)
  do update set position = excluded.position;

  update public.learning_component_relations relation
  set deleted_at = now()
  where relation.course_id = p_course_id
    and relation.deleted_at is null
    and not exists (
      select 1
      from aralearn_desired_learning_relations desired
      where desired.from_component_id = relation.from_component_id
        and desired.to_component_id = relation.to_component_id
        and desired.relation_kind = relation.relation_kind
    );

  insert into public.learning_component_relations(
    course_id, from_component_id, to_component_id, relation_kind, position
  )
  select
    p_course_id, desired.from_component_id, desired.to_component_id,
    desired.relation_kind, desired.position
  from aralearn_desired_learning_relations desired
  on conflict(
    course_id, from_component_id, to_component_id, relation_kind
  ) where deleted_at is null
  do update set position = excluded.position
  where public.learning_component_relations.position
    is distinct from excluded.position;

  create temporary table if not exists
    aralearn_planned_learning_cards (
      card_id uuid,
      microsequence_id uuid,
      operation_key text,
      learning_function text,
      learning_role text,
      support_level text,
      evidence_statement text,
      variation_focus text,
      target_error text,
      outcome_keys text[],
      concept_keys text[],
      retrieved_concept_keys text[],
      misconception_keys text[],
      introduced_term_keys text[],
      required_term_keys text[],
      position integer not null
    ) on commit drop;
  truncate aralearn_planned_learning_cards;

  insert into aralearn_planned_learning_cards(
    card_id, microsequence_id, operation_key, learning_function,
    learning_role, support_level, evidence_statement, variation_focus,
    target_error, outcome_keys, concept_keys, retrieved_concept_keys,
    misconception_keys, introduced_term_keys, required_term_keys, position
  )
  select
    card.id,
    microsequence.id,
    card_plan.item->>'operationId',
    card_plan.item->>'learningFunction',
    case card_plan.item->>'learningFunction'
      when 'foundation' then 'introduce'
      when 'worked_example' then 'practice'
      when 'guided_practice' then 'practice'
      when 'independent_practice' then 'practice'
      when 'contrast' then 'correct'
      when 'error_diagnosis' then 'correct'
      when 'integration' then 'assess'
      else null
    end,
    case card_plan.item->>'learningFunction'
      when 'foundation' then 'modeled'
      when 'worked_example' then 'modeled'
      when 'guided_practice' then 'guided'
      when 'contrast' then 'reduced'
      when 'error_diagnosis' then 'reduced'
      when 'independent_practice' then 'independent'
      when 'integration' then 'independent'
      else null
    end,
    card_plan.item->>'evidence',
    nullif(btrim(card_plan.item->>'variationFocus'), ''),
    nullif(btrim(card_plan.item->>'targetError'), ''),
    array(
      select jsonb_array_elements_text(
        coalesce(card_plan.item->'outcomeIds', '[]'::jsonb)
      )
    ),
    array(
      select jsonb_array_elements_text(
        coalesce(card_plan.item->'conceptIds', '[]'::jsonb)
      )
    ),
    array(
      select jsonb_array_elements_text(
        coalesce(card_plan.item->'retrievedConceptIds', '[]'::jsonb)
      )
    ),
    array(
      select jsonb_array_elements_text(
        coalesce(card_plan.item->'misconceptionIds', '[]'::jsonb)
      )
    ),
    array(
      select jsonb_array_elements_text(
        coalesce(card_plan.item->'introducedTermIds', '[]'::jsonb)
      )
    ),
    array(
      select jsonb_array_elements_text(
        coalesce(card_plan.item->'requiredTermIds', '[]'::jsonb)
      )
    ),
    part.position * 10000
      + coalesce((card_plan.item->>'position')::integer, 0)
  from private.authoring_parts part
  cross join lateral jsonb_array_elements(
    coalesce(part.specification->'cardPlan', '[]'::jsonb)
  ) card_plan(item)
  left join public.microsequences microsequence
    on microsequence.course_id = p_course_id
   and microsequence.contract_key = card_plan.item->>'microsequenceId'
  left join public.cards card
    on card.course_id = p_course_id
   and card.microsequence_id = microsequence.id
   and card.contract_key = card_plan.item->>'cardId'
  where part.run_id = p_run_id
    and part.status = 'approved'
    and part.specification is not null;

  select count(*) into v_unresolved_cards
  from aralearn_planned_learning_cards planned
  where planned.card_id is null
     or planned.microsequence_id is null
     or nullif(btrim(planned.operation_key), '') is null
     or planned.learning_role is null
     or planned.support_level is null
     or nullif(btrim(planned.evidence_statement), '') is null
     or cardinality(planned.outcome_keys) = 0
     or cardinality(planned.concept_keys) = 0
     or exists (
       select 1
       from unnest(planned.retrieved_concept_keys) retrieved(component_key)
       where not (
         retrieved.component_key = any(planned.concept_keys)
       )
     );
  if v_unresolved_cards > 0 then
    raise exception
      'A especificação contém % card(s) pedagógicos não resolvidos.',
      v_unresolved_cards
      using errcode = '23514';
  end if;

  create temporary table if not exists
    aralearn_desired_learning_placements (
      component_id uuid not null,
      microsequence_id uuid not null,
      card_id uuid not null,
      learning_role text not null,
      learning_function text,
      support_level text,
      evidence_statement text,
      variation_focus text,
      target_error text,
      position integer not null,
      primary key(component_id, microsequence_id, card_id, learning_role)
    ) on commit drop;
  truncate aralearn_desired_learning_placements;

  insert into aralearn_desired_learning_placements
  select
    component.id,
    planned.microsequence_id,
    planned.card_id,
    planned.learning_role,
    planned.learning_function,
    planned.support_level,
    planned.evidence_statement,
    planned.variation_focus,
    planned.target_error,
    planned.position
  from aralearn_planned_learning_cards planned
  join public.learning_components component
    on component.course_id = p_course_id
   and component.component_key = planned.operation_key
   and component.component_type = 'operation'
   and component.deleted_at is null;

  insert into aralearn_desired_learning_placements
  select
    component.id,
    planned.microsequence_id,
    planned.card_id,
    planned.learning_role,
    planned.learning_function,
    planned.support_level,
    planned.evidence_statement,
    planned.variation_focus,
    planned.target_error,
    planned.position + outcome_key.ordinality::integer - 1
  from aralearn_planned_learning_cards planned
  cross join lateral unnest(planned.outcome_keys)
    with ordinality outcome_key(component_key, ordinality)
  join public.learning_components component
    on component.course_id = p_course_id
   and component.component_key = outcome_key.component_key
   and component.component_type = 'outcome'
   and component.deleted_at is null;

  insert into aralearn_desired_learning_placements
  select
    component.id,
    planned.microsequence_id,
    planned.card_id,
    planned.learning_role,
    planned.learning_function,
    planned.support_level,
    planned.evidence_statement,
    planned.variation_focus,
    planned.target_error,
    planned.position + concept_key.ordinality::integer - 1
  from aralearn_planned_learning_cards planned
  cross join lateral unnest(planned.concept_keys)
    with ordinality concept_key(component_key, ordinality)
  join public.learning_components component
    on component.course_id = p_course_id
   and component.component_key = concept_key.component_key
   and component.component_type = 'concept'
   and component.deleted_at is null;

  insert into aralearn_desired_learning_placements
  select
    component.id,
    planned.microsequence_id,
    planned.card_id,
    'retrieve',
    planned.learning_function,
    planned.support_level,
    planned.evidence_statement,
    planned.variation_focus,
    planned.target_error,
    planned.position + concept_key.ordinality::integer - 1
  from aralearn_planned_learning_cards planned
  cross join lateral unnest(planned.retrieved_concept_keys)
    with ordinality concept_key(component_key, ordinality)
  join public.learning_components component
    on component.course_id = p_course_id
   and component.component_key = concept_key.component_key
   and component.component_type = 'concept'
   and component.deleted_at is null;

  insert into aralearn_desired_learning_placements
  select
    component.id,
    planned.microsequence_id,
    planned.card_id,
    'correct',
    planned.learning_function,
    planned.support_level,
    planned.evidence_statement,
    planned.variation_focus,
    planned.target_error,
    planned.position + misconception_key.ordinality::integer - 1
  from aralearn_planned_learning_cards planned
  cross join lateral unnest(planned.misconception_keys)
    with ordinality misconception_key(component_key, ordinality)
  join public.learning_components component
    on component.course_id = p_course_id
   and component.component_key = misconception_key.component_key
   and component.component_type = 'misconception'
   and component.deleted_at is null;

  insert into aralearn_desired_learning_placements
  select
    component.id,
    planned.microsequence_id,
    planned.card_id,
    'introduce',
    planned.learning_function,
    planned.support_level,
    null,
    null,
    null,
    planned.position + term_key.ordinality::integer - 1
  from aralearn_planned_learning_cards planned
  cross join lateral unnest(planned.introduced_term_keys)
    with ordinality term_key(component_key, ordinality)
  join public.learning_components component
    on component.course_id = p_course_id
   and component.component_key = term_key.component_key
   and component.component_type = 'term'
   and component.deleted_at is null;

  insert into aralearn_desired_learning_placements
  select
    component.id,
    planned.microsequence_id,
    planned.card_id,
    'retrieve',
    planned.learning_function,
    planned.support_level,
    null,
    null,
    null,
    planned.position + term_key.ordinality::integer - 1
  from aralearn_planned_learning_cards planned
  cross join lateral unnest(planned.required_term_keys)
    with ordinality term_key(component_key, ordinality)
  join public.learning_components component
    on component.course_id = p_course_id
   and component.component_key = term_key.component_key
   and component.component_type = 'term'
   and component.deleted_at is null;

  select coalesce(sum(
    1
    + cardinality(planned.outcome_keys)
    + cardinality(planned.concept_keys)
    + cardinality(planned.retrieved_concept_keys)
    + cardinality(planned.misconception_keys)
    + cardinality(planned.introduced_term_keys)
    + cardinality(planned.required_term_keys)
  ), 0)::integer
  into v_expected_placements
  from aralearn_planned_learning_cards planned;

  if (
    select count(*) from aralearn_desired_learning_placements
  ) <> v_expected_placements then
    raise exception
      'A especificação referencia componente pedagógico explícito inexistente.'
      using errcode = '23514';
  end if;

  update public.learning_component_placements placement
  set deleted_at = now()
  where placement.course_id = p_course_id
    and placement.deleted_at is null
    and not exists (
      select 1
      from aralearn_desired_learning_placements desired
      where desired.component_id = placement.component_id
        and desired.microsequence_id = placement.microsequence_id
        and desired.card_id = placement.card_id
        and desired.learning_role = placement.learning_role
    );

  insert into public.learning_component_placements(
    course_id, component_id, microsequence_id, card_id, learning_role,
    learning_function, support_level, evidence_statement, variation_focus,
    target_error, position
  )
  select
    p_course_id, desired.component_id, desired.microsequence_id,
    desired.card_id, desired.learning_role, desired.learning_function,
    desired.support_level, desired.evidence_statement,
    desired.variation_focus, desired.target_error, desired.position
  from aralearn_desired_learning_placements desired
  on conflict(
    course_id, component_id, microsequence_id,
    coalesce(card_id, '00000000-0000-0000-0000-000000000000'::uuid),
    learning_role
  ) where deleted_at is null
  do update set
    learning_function = excluded.learning_function,
    support_level = excluded.support_level,
    evidence_statement = excluded.evidence_statement,
    variation_focus = excluded.variation_focus,
    target_error = excluded.target_error,
    position = excluded.position
  where (
    public.learning_component_placements.learning_function,
    public.learning_component_placements.support_level,
    public.learning_component_placements.evidence_statement,
    public.learning_component_placements.variation_focus,
    public.learning_component_placements.target_error,
    public.learning_component_placements.position
  ) is distinct from (
    excluded.learning_function,
    excluded.support_level,
    excluded.evidence_statement,
    excluded.variation_focus,
    excluded.target_error,
    excluded.position
  );

  return jsonb_build_object(
    'status', 'materialized',
    'idempotent', false,
    'runId', p_run_id,
    'courseId', p_course_id,
    'components', (
      select count(*) from public.learning_components component
      where component.course_id = p_course_id
        and component.deleted_at is null
    ),
    'componentRelations', (
      select count(*) from public.learning_component_relations relation
      where relation.course_id = p_course_id
        and relation.deleted_at is null
    ),
    'componentPlacements', (
      select count(*) from public.learning_component_placements placement
      where placement.course_id = p_course_id
        and placement.deleted_at is null
    ),
    'explicitTopicLinks', (
      select count(*) from public.learning_component_topic_links link
      where link.course_id = p_course_id
        and link.deleted_at is null
    )
  );
end;
$$;

create or replace function private.materialize_learning_metadata_before_compaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_course_id uuid;
  v_result jsonb;
begin
  if new.status = 'publishing'
     and old.terminal_compacted_at is null
     and new.terminal_compacted_at is not null then
    v_course_id := new.course_id;

    if v_course_id is null then
      select stage.course_id into v_course_id
      from private.official_catalog_imports stage
      where stage.authoring_run_id = new.id;
    end if;

    if v_course_id is null then
      select stage.course_id into v_course_id
      from private.authoring_private_imports stage
      where stage.run_id = new.id;
    end if;

    if v_course_id is not null then
      v_result := private.materialize_authoring_learning_metadata(
        new.id, v_course_id
      );
      new.validation_report := coalesce(
        new.validation_report, '{}'::jsonb
      ) || jsonb_build_object(
        'pedagogicalMaterialization', v_result
      );
    end if;
  end if;
  return new;
end;
$$;

-- O BEFORE executa antes de authoring_compact_terminal_payloads apagar o
-- ledger e reduzir cardPlan, e antes do gatilho que limpa o staging privado.
-- Uma falha desfaz a mesma transação da publicação.
create trigger authoring_runs_materialize_learning_metadata_before_compaction
before update of terminal_compacted_at
on private.authoring_runs
for each row execute function
  private.materialize_learning_metadata_before_compaction();

create or replace function private.preserve_learning_materialization_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if jsonb_typeof(
       old.validation_report->'pedagogicalMaterialization'
     ) = 'object'
     and jsonb_typeof(
       new.validation_report->'pedagogicalMaterialization'
     ) is distinct from 'object' then
    new.validation_report := case
      when jsonb_typeof(new.validation_report) = 'object'
        then new.validation_report
      else '{}'::jsonb
    end
      || jsonb_build_object(
        'pedagogicalMaterialization',
        old.validation_report->'pedagogicalMaterialization'
      );
  end if;
  return new;
end;
$$;

-- O finalizador oficial acrescenta seu próprio relatório depois da
-- compactação. O recibo da materialização precisa sobreviver a essa escrita
-- para permitir repetição segura sem reabrir artefatos já descartados.
create trigger authoring_runs_preserve_learning_materialization_receipt
before update of validation_report
on private.authoring_runs
for each row execute function
  private.preserve_learning_materialization_receipt();

-- A cópia pessoal inclui a semântica pedagógica já materializada. Todas as
-- FKs internas são remapeadas; source_entity_id aponta para a linha de origem
-- e permite reconhecer a linhagem sem compartilhar identidade persistente.
create or replace function private.clone_personal_course_tree(
  p_clone_id uuid,
  p_source_course_id uuid,
  p_target_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_table_name text;
  v_table regclass;
  v_columns text;
  v_expressions text;
  v_tables constant text[] := array[
    'modules','lessons','course_guides','guide_items','lesson_topics',
    'topic_statements','microsequences','microsequence_dependencies',
    'microsequence_statements','cards','card_blocks','block_options',
    'block_nodes','flow_nodes','flow_cases','flow_practices',
    'node_practices','node_practice_items','block_edges',
    'block_matrix_items','block_cells','block_points','block_lines',
    'block_highlights','card_refs',
    'learning_components','learning_component_topic_links',
    'learning_component_relations','learning_component_placements'
  ];
begin
  if p_clone_id is null
     or p_source_course_id is null
     or p_target_course_id is null
     or p_source_course_id = p_target_course_id then
    raise exception 'Identidade inválida para cópia pessoal.'
      using errcode = '22023';
  end if;
  set constraints all deferred;

  foreach v_table_name in array v_tables loop
    v_table := ('public.' || v_table_name)::regclass;
    execute format(
      'insert into private.personal_course_clone_map'
      || '(clone_id,table_name,source_id,target_id) '
      || 'select $1,%L,id,gen_random_uuid() from %s where course_id=$2',
      v_table_name, v_table
    ) using p_clone_id, p_source_course_id;
  end loop;

  foreach v_table_name in array v_tables loop
    v_table := ('public.' || v_table_name)::regclass;

    select string_agg(
      format('%I', attribute.attname),
      ', ' order by attribute.attnum
    )
    into v_columns
    from pg_attribute attribute
    where attribute.attrelid = v_table
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attgenerated = '';

    select string_agg(
      case
        when attribute.attname = 'id' then format(
          '(select map.target_id '
          || 'from private.personal_course_clone_map map '
          || 'where map.clone_id=$1 and map.table_name=%L '
          || 'and map.source_id=source.id)',
          v_table_name
        )
        when attribute.attname = 'course_id' then '$2'
        when v_table_name in (
          'learning_components',
          'learning_component_topic_links',
          'learning_component_relations',
          'learning_component_placements'
        ) and attribute.attname = 'source_entity_id' then
          'source.id'
        when v_table_name = 'course_guides'
             and attribute.attname = 'owner_id' then
          '(case source.owner_type '
          || 'when ''module'' then (select map.target_id '
          || 'from private.personal_course_clone_map map '
          || 'where map.clone_id=$1 and map.table_name=''modules'' '
          || 'and map.source_id=source.owner_id) '
          || 'when ''lesson'' then (select map.target_id '
          || 'from private.personal_course_clone_map map '
          || 'where map.clone_id=$1 and map.table_name=''lessons'' '
          || 'and map.source_id=source.owner_id) else null end)'
        when v_table_name in ('microsequence_dependencies','cards')
             and attribute.attname = 'lesson_id' then
          '(select map.target_id '
          || 'from private.personal_course_clone_map map '
          || 'where map.clone_id=$1 and map.table_name=''lessons'' '
          || 'and map.source_id=source.lesson_id)'
        when foreign_key.referenced_table is not null then format(
          '(select map.target_id '
          || 'from private.personal_course_clone_map map '
          || 'where map.clone_id=$1 and map.table_name=%L '
          || 'and map.source_id=source.%I)',
          foreign_key.referenced_table, attribute.attname
        )
        else format('source.%I', attribute.attname)
      end,
      ', ' order by attribute.attnum
    )
    into v_expressions
    from pg_attribute attribute
    left join lateral (
      select referenced.relname as referenced_table
      from pg_constraint constraint_row
      join lateral unnest(constraint_row.conkey)
        with ordinality source_key(attnum, n) on true
      join lateral unnest(constraint_row.confkey)
        with ordinality target_key(attnum, n)
        on target_key.n = source_key.n
      join pg_class referenced
        on referenced.oid = constraint_row.confrelid
      join pg_namespace referenced_schema
        on referenced_schema.oid = referenced.relnamespace
      join pg_attribute referenced_attribute
        on referenced_attribute.attrelid = constraint_row.confrelid
       and referenced_attribute.attnum = target_key.attnum
      where constraint_row.contype = 'f'
        and constraint_row.conrelid = v_table
        and source_key.attnum = attribute.attnum
        and referenced_schema.nspname = 'public'
        and referenced_attribute.attname = 'id'
        and referenced.relname = any(v_tables)
      limit 1
    ) foreign_key on true
    where attribute.attrelid = v_table
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attgenerated = '';

    execute format(
      'insert into %s(%s) select %s from %s source '
      || 'where source.course_id=$3',
      v_table, v_columns, v_expressions, v_table
    ) using p_clone_id, p_target_course_id, p_source_course_id;
  end loop;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'learning_components',
    'learning_component_topic_links',
    'learning_component_relations',
    'learning_component_placements'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      'using(public.user_can_read_course(course_id) or public.is_app_admin())',
      v_table, v_table
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated '
      'with check(public.is_app_admin())',
      v_table, v_table
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated '
      'using(public.is_app_admin()) with check(public.is_app_admin())',
      v_table, v_table
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated '
      'using(public.is_app_admin())',
      v_table, v_table
    );
    execute format(
      'revoke all privileges on table public.%I '
      'from public, anon, authenticated, service_role',
      v_table
    );
  end loop;
end;
$$;

revoke all on function private.guard_learning_requires_cycle()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_learning_component_placement()
  from public, anon, authenticated, service_role;
revoke all on function private.learning_component_continuity(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_learning_continuity(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function private.authoring_learning_continuity(uuid,text)
  to service_role;
revoke all on function private.materialize_authoring_learning_metadata(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.materialize_learning_metadata_before_compaction()
  from public, anon, authenticated, service_role;
revoke all on function private.preserve_learning_materialization_receipt()
  from public, anon, authenticated, service_role;
revoke all on function private.clone_personal_course_tree(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

comment on function private.learning_component_continuity(uuid,text) is
  'Consulta interna ordenada de introdução, prática, retomada, avaliação e correção.';
comment on function private.authoring_learning_continuity(uuid,text) is
  'Consulta de continuidade para o adaptador de autoria, restrita à função de serviço.';
comment on function private.materialize_authoring_learning_metadata(uuid,uuid) is
  'Materializa somente IDs explícitos dos artefatos de autoria; não interpreta texto livre.';

commit;
