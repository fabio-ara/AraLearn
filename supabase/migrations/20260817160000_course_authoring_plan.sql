-- O plano instrucional do Curso passa a ser consultável e normalizado.
-- Partes de Autoria são recortes operacionais; não pertencem à hierarquia
-- didática e sua ordem de produção nunca substitui course_entities.position.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-instructional-plan-v1', 0
));

do $require_course_instructional_plan_dependencies$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_events') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('public.get_aralearn_runtime_manifest()') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null
     or to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception 'Dependências do plano instrucional do Curso ausentes.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_instructional_plans') is not null
     or to_regclass('private.course_authoring_parts') is not null then
    raise exception 'O plano instrucional do Curso já existe parcialmente.'
      using errcode = '55000';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses'
      and column_name = 'brief'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses'
      and column_name = 'authoring_state'
  ) then
    raise exception 'Estado monolítico esperado do Curso ausente.'
      using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817150000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'single-live-course-identity-v1',
       'course-cas-idempotency-v1',
       'study-only-course-access-v1'
     ]) then
    raise exception 'Manifesto anterior ao plano instrucional é inesperado.'
      using errcode = '55000';
  end if;
end;
$require_course_instructional_plan_dependencies$;

lock table public.courses in access exclusive mode;
lock table private.course_entities in share row exclusive mode;
lock table private.course_change_receipts in share row exclusive mode;
lock table private.course_events in share row exclusive mode;

-- Decisões e mandatos anteriores não são equivalentes a resultados pretendidos,
-- unidades de análise ou requisitos de evidência. Sem conversor explícito, o
-- corte falha em vez de conservar JSON oculto ou inferir significado.
do $validate_legacy_course_authoring_state$
begin
  if exists(
    select 1 from public.courses course
    where coalesce(course.title ~ '[^[:space:]]', false) is not true
      or coalesce(course.goal ~ '[^[:space:]]', false) is not true
      or translate(course.title, E'\n\r\t', '') ~ '[[:cntrl:]]'
      or translate(course.goal, E'\n\r\t', '') ~ '[[:cntrl:]]'
  ) then
    raise exception 'Cabeçalho anterior contém caractere de controle inválido.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from public.courses course
    where translate(course.brief, E'\n\r\t', '') ~ '[[:cntrl:]]'
  ) then
    raise exception 'Orientação anterior contém caractere de controle inválido.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from private.course_entities entity
    where entity.entity_type in ('module', 'lesson', 'microsequence')
      and (
        jsonb_typeof(entity.content->'title') is distinct from 'string'
        or coalesce(
          entity.content->>'title' ~ '[^[:space:]]', false
        ) is not true
        or char_length(entity.content->>'title') > 300
        or translate(entity.content->>'title', E'\n\r\t', '')
          ~ '[[:cntrl:]]'
      )
  ) then
    raise exception 'Título didático anterior não satisfaz o contrato canônico.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from public.courses course
    where jsonb_typeof(course.authoring_state) is distinct from 'object'
      or course.authoring_state - 'version' - 'parts' - 'decisions' - 'mandate'
        <> '{}'::jsonb
      or course.authoring_state->'version' <> '1'::jsonb
      or jsonb_typeof(course.authoring_state->'parts') is distinct from 'array'
      or jsonb_typeof(course.authoring_state->'decisions') is distinct from 'array'
      or jsonb_array_length(course.authoring_state->'decisions') <> 0
      or course.authoring_state->'mandate' <> 'null'::jsonb
  ) then
    raise exception 'Decisões, mandato ou envelope autoral sem conversor explícito.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from public.courses course
    where jsonb_array_length(course.authoring_state->'parts') > 64
  ) then
    raise exception 'Estado autoral anterior excede o limite de 64 Partes.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from public.courses course
    cross join lateral jsonb_array_elements(
      course.authoring_state->'parts'
    ) with ordinality part(value, ordinal)
    where jsonb_typeof(part.value) is distinct from 'object'
      or part.value - 'id' - 'title' - 'microsequenceIds' <> '{}'::jsonb
      or not (part.value ?& array['id', 'title', 'microsequenceIds'])
      or jsonb_typeof(part.value->'id') is distinct from 'string'
      or nullif(btrim(part.value->>'id'), '') is null
      or part.value->>'id' <> btrim(part.value->>'id')
      or char_length(part.value->>'id') > 240
      or part.value->>'id' ~ '[[:cntrl:]]'
      or jsonb_typeof(part.value->'title') is distinct from 'string'
      or coalesce(part.value->>'title' ~ '[^[:space:]]', false) is not true
      or char_length(btrim(part.value->>'title')) > 300
      or translate(part.value->>'title', E'\n\r\t', '') ~ '[[:cntrl:]]'
      or jsonb_typeof(part.value->'microsequenceIds') is distinct from 'array'
      or jsonb_array_length(part.value->'microsequenceIds') > 64
      or exists(
        select 1
        from jsonb_array_elements(part.value->'microsequenceIds') micro(value)
        where jsonb_typeof(micro.value) is distinct from 'string'
          or nullif(btrim(micro.value#>>'{}'), '') is null
          or micro.value#>>'{}' <> btrim(micro.value#>>'{}')
          or char_length(micro.value#>>'{}') > 240
          or micro.value#>>'{}' ~ '[[:cntrl:]]'
      )
  ) then
    raise exception 'Parte anterior não possui conversão inequívoca.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from public.courses course
    where (
      select coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)
      from jsonb_array_elements(course.authoring_state->'parts') part(value)
    ) > 192
  ) then
    raise exception 'Estado autoral anterior excede 192 vínculos de microssequência.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from public.courses course
    cross join lateral jsonb_array_elements(
      course.authoring_state->'parts'
    ) part(value)
    group by course.id, part.value->>'id'
    having count(*) > 1
  ) or exists(
    select 1
    from public.courses course
    cross join lateral jsonb_array_elements(
      course.authoring_state->'parts'
    ) part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) micro(microsequence_id)
    group by course.id, micro.microsequence_id
    having count(*) > 1
  ) then
    raise exception 'Identidade anterior de Parte ou microssequência repetida.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from public.courses course
    cross join lateral jsonb_array_elements(
      course.authoring_state->'parts'
    ) part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) micro(microsequence_id)
    left join private.course_entities entity
      on entity.course_id = course.id
     and entity.entity_type = 'microsequence'
     and entity.entity_id = micro.microsequence_id
    where entity.course_id is null
  ) then
    raise exception 'Parte anterior referencia microssequência inexistente.'
      using errcode = '55000';
  end if;
end;
$validate_legacy_course_authoring_state$;

create table private.course_instructional_plans (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null unique
    references public.courses(id) on delete cascade,
  audience text not null default '',
  instructional_scope text not null default '',
  authoring_guidance text not null default '',
  preferred_authoring_part_min smallint not null default 7,
  preferred_authoring_part_max smallint not null default 12,
  part_count_origin text not null default 'automatic',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, id),
  constraint course_instructional_plans_audience_v1 check(
    char_length(audience) <= 4000
    and translate(audience, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint course_instructional_plans_scope_v1 check(
    char_length(instructional_scope) <= 8000
    and translate(instructional_scope, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint course_instructional_plans_guidance_v1 check(
    char_length(authoring_guidance) <= 16384
    and translate(authoring_guidance, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint course_instructional_plans_part_range_v1 check(
    preferred_authoring_part_min between 1 and 64
    and preferred_authoring_part_max between 1 and 64
    and preferred_authoring_part_min <= preferred_authoring_part_max
  ),
  constraint course_instructional_plans_origin_v1 check(
    part_count_origin in ('automatic', 'author', 'research_condition')
  ),
  constraint course_instructional_plans_version_v1 check(version > 0)
);

create table private.course_instructional_plan_items (
  id uuid primary key,
  course_id uuid not null,
  instructional_plan_id uuid not null,
  item_kind text not null,
  position integer not null,
  statement text not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, id),
  constraint course_instructional_plan_items_plan_fk_v1 foreign key(
    course_id, instructional_plan_id
  ) references private.course_instructional_plans(course_id, id)
    on delete cascade,
  constraint course_instructional_plan_items_kind_v1 check(item_kind in (
    'intended_learning_outcome',
    'instructional_analysis_unit',
    'evidence_requirement'
  )),
  constraint course_instructional_plan_items_position_v1 check(position >= 0),
  constraint course_instructional_plan_items_statement_v1 check(
    statement ~ '[^[:space:]]'
    and char_length(statement) <= 2000
    and translate(statement, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint course_instructional_plan_items_version_v1 check(version > 0),
  constraint course_instructional_plan_items_order_v1 unique(
    instructional_plan_id, item_kind, position
  ) deferrable initially deferred
);

create table private.course_authoring_parts (
  id uuid primary key,
  course_id uuid not null,
  instructional_plan_id uuid not null,
  position integer,
  title text not null,
  intent text not null default '',
  version bigint not null default 1,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id, id),
  constraint course_authoring_parts_plan_fk_v1 foreign key(
    course_id, instructional_plan_id
  ) references private.course_instructional_plans(course_id, id)
    on delete cascade,
  constraint course_authoring_parts_position_v1 check(
    (retired_at is null and position between 0 and 63)
    or (retired_at is not null and position is null)
  ),
  constraint course_authoring_parts_title_v1 check(
    title ~ '[^[:space:]]'
    and char_length(title) <= 300
    and translate(title, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint course_authoring_parts_intent_v1 check(
    char_length(intent) <= 4000
    and translate(intent, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint course_authoring_parts_version_v1 check(version > 0),
  constraint course_authoring_parts_order_v1 unique(
    instructional_plan_id, position
  ) deferrable initially deferred
);

create table private.course_authoring_part_didactic_microsequences (
  course_id uuid not null,
  authoring_part_id uuid not null,
  didactic_microsequence_entity_type text
    generated always as ('microsequence') stored,
  didactic_microsequence_id text not null,
  production_position integer not null,
  created_at timestamptz not null default now(),
  primary key(course_id, authoring_part_id, didactic_microsequence_id),
  constraint course_authoring_part_microsequences_part_fk_v1 foreign key(
    course_id, authoring_part_id
  ) references private.course_authoring_parts(course_id, id) on delete cascade,
  constraint course_authoring_part_microsequences_entity_fk_v1 foreign key(
    course_id, didactic_microsequence_entity_type,
    didactic_microsequence_id
  ) references private.course_entities(course_id, entity_type, entity_id),
  constraint course_authoring_part_microsequences_position_v1 check(
    production_position between 0 and 63
  ),
  constraint course_authoring_part_microsequences_course_unique_v1 unique(
    course_id, didactic_microsequence_id
  ),
  constraint course_authoring_part_microsequences_order_v1 unique(
    course_id, authoring_part_id, production_position
  ) deferrable initially deferred
);

create table private.course_authoring_part_materializations (
  id uuid primary key,
  course_id uuid not null,
  authoring_part_id uuid not null,
  authoring_part_version bigint not null,
  actor_id uuid references auth.users(id) on delete set null,
  channel text not null,
  status text not null,
  version bigint not null default 1,
  design_context jsonb not null default '{}'::jsonb,
  result_facts jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(course_id, id),
  constraint course_authoring_part_materializations_part_fk_v1 foreign key(
    course_id, authoring_part_id
  ) references private.course_authoring_parts(course_id, id) on delete cascade,
  constraint course_authoring_part_materializations_part_version_v1 check(
    authoring_part_version > 0
  ),
  constraint course_authoring_part_materializations_channel_v1 check(
    channel in ('application', 'mcp')
  ),
  constraint course_authoring_part_materializations_status_v1 check(
    status in ('running', 'completed', 'failed')
  ),
  constraint course_authoring_part_materializations_version_v1 check(version > 0),
  constraint course_authoring_part_materializations_context_v1 check(
    jsonb_typeof(design_context) = 'object'
    and pg_column_size(design_context) <= 65536
  ),
  constraint course_authoring_part_materializations_facts_v1 check(
    jsonb_typeof(result_facts) = 'object'
    and pg_column_size(result_facts) <= 16384
  ),
  constraint course_authoring_part_materializations_completion_v1 check(
    (status = 'running' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  )
);

create unique index course_authoring_part_materializations_running_v1_uidx
  on private.course_authoring_part_materializations(
    course_id, authoring_part_id
  ) where status = 'running';

create index course_authoring_part_materializations_recent_v1_idx
  on private.course_authoring_part_materializations(
    course_id, updated_at desc, id desc
  );

create index course_authoring_part_materializations_part_recent_v1_idx
  on private.course_authoring_part_materializations(
    course_id, authoring_part_id, updated_at desc, id desc
  );

create table private.course_authoring_part_materialization_steps (
  id uuid primary key,
  course_id uuid not null,
  materialization_id uuid not null,
  position integer not null,
  step_kind text not null,
  target_didactic_microsequence_id text,
  production_position integer,
  status text not null default 'pending',
  version bigint not null default 1,
  result_facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(course_id, id),
  constraint course_authoring_part_materialization_steps_attempt_fk_v1 foreign key(
    course_id, materialization_id
  ) references private.course_authoring_part_materializations(course_id, id)
    on delete cascade,
  constraint course_authoring_part_materialization_steps_position_v1 check(
    position >= 0
  ),
  constraint course_authoring_part_materialization_steps_kind_v1 check(
    step_kind in (
      'context_load',
      'didactic_microsequence_materialization',
      'validation'
    )
  ),
  constraint course_authoring_part_materialization_steps_target_v1 check(
    (
      step_kind = 'didactic_microsequence_materialization'
      and nullif(btrim(target_didactic_microsequence_id), '') is not null
      and target_didactic_microsequence_id = btrim(target_didactic_microsequence_id)
      and char_length(target_didactic_microsequence_id) <= 240
      and target_didactic_microsequence_id !~ '[[:cntrl:]]'
      and production_position between 0 and 63
    ) or (
      step_kind <> 'didactic_microsequence_materialization'
      and target_didactic_microsequence_id is null
      and production_position is null
    )
  ),
  constraint course_authoring_part_materialization_steps_status_v1 check(
    status in ('pending', 'completed', 'failed')
  ),
  constraint course_authoring_part_materialization_steps_version_v1 check(version > 0),
  constraint course_authoring_part_materialization_steps_facts_v1 check(
    jsonb_typeof(result_facts) = 'object'
    and pg_column_size(result_facts) <= 16384
  ),
  constraint course_authoring_part_materialization_steps_completion_v1 check(
    (status = 'pending' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  ),
  constraint course_authoring_part_materialization_steps_order_v1 unique(
    materialization_id, position
  ) deferrable initially deferred,
  constraint course_authoring_part_materialization_steps_target_unique_v1 unique(
    materialization_id, target_didactic_microsequence_id
  )
);

-- Uma exclusão de Curso aciona em paralelo os cascades de Partes e entidades.
-- O vínculo continua restritivo para exclusão isolada de microssequência,
-- mas precisa sair antes desses dois ramos para a raiz poder ser removida.
create function private.delete_course_authoring_relations_before_course_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  delete from private.course_authoring_part_didactic_microsequences membership
  where membership.course_id = old.id;
  delete from private.course_authoring_part_materializations materialization
  where materialization.course_id = old.id;
  return old;
end;
$function$;

create trigger courses_authoring_relations_delete_v1
before delete on public.courses
for each row execute function
  private.delete_course_authoring_relations_before_course_v1();

create temporary table course_authoring_part_cutover_map_v1 (
  course_id uuid not null,
  old_part_id text not null,
  new_part_id uuid not null,
  position integer not null,
  title text not null,
  microsequence_ids jsonb not null,
  primary key(course_id, old_part_id),
  unique(new_part_id),
  unique(course_id, position)
) on commit drop;

insert into course_authoring_part_cutover_map_v1(
  course_id, old_part_id, new_part_id, position, title, microsequence_ids
)
select
  course.id,
  part.value->>'id',
  (
    substr(hash.value, 1, 8) || '-' || substr(hash.value, 9, 4) || '-5' ||
    substr(hash.value, 14, 3) || '-8' || substr(hash.value, 18, 3) || '-' ||
    substr(hash.value, 21, 12)
  )::uuid,
  part.ordinal::integer - 1,
  btrim(part.value->>'title'),
  part.value->'microsequenceIds'
from public.courses course
cross join lateral jsonb_array_elements(
  course.authoring_state->'parts'
) with ordinality part(value, ordinal)
cross join lateral (
  select encode(extensions.digest(convert_to(
    course.id::text || ':' || 'authoring-part' || ':' ||
      (part.value->>'id'),
    'UTF8'
  ), 'sha256'), 'hex') as value
) hash;

insert into private.course_instructional_plans(
  id, course_id, audience, instructional_scope, authoring_guidance,
  preferred_authoring_part_min, preferred_authoring_part_max,
  part_count_origin, version, created_at, updated_at
)
select
  (
    substr(hash.value, 1, 8) || '-' || substr(hash.value, 9, 4) || '-5' ||
    substr(hash.value, 14, 3) || '-8' || substr(hash.value, 18, 3) || '-' ||
    substr(hash.value, 21, 12)
  )::uuid,
  course.id,
  '',
  '',
  course.brief,
  7,
  12,
  'automatic',
  1,
  course.created_at,
  course.updated_at
from public.courses course
cross join lateral (
  select encode(extensions.digest(convert_to(
    course.id::text || ':' || 'instructional-plan', 'UTF8'
  ), 'sha256'), 'hex') as value
) hash;

insert into private.course_authoring_parts(
  id, course_id, instructional_plan_id, position, title, intent,
  version, created_at, updated_at
)
select mapping.new_part_id, mapping.course_id, plan.id, mapping.position,
  mapping.title, '', 1, course.created_at, course.updated_at
from course_authoring_part_cutover_map_v1 mapping
join private.course_instructional_plans plan
  on plan.course_id = mapping.course_id
join public.courses course on course.id = mapping.course_id;

insert into private.course_authoring_part_didactic_microsequences(
  course_id, authoring_part_id, didactic_microsequence_id,
  production_position, created_at
)
select mapping.course_id, mapping.new_part_id, micro.value,
  micro.ordinal::integer - 1, course.updated_at
from course_authoring_part_cutover_map_v1 mapping
join public.courses course on course.id = mapping.course_id
cross join lateral jsonb_array_elements_text(
  mapping.microsequence_ids
) with ordinality micro(value, ordinal);

do $validate_course_instructional_plan_cutover$
begin
  if (select count(*) from private.course_instructional_plans)
       <> (select count(*) from public.courses)
     or (select count(*) from private.course_authoring_parts)
       <> (select coalesce(sum(jsonb_array_length(authoring_state->'parts')), 0)
           from public.courses)
     or (select count(*)
         from private.course_authoring_part_didactic_microsequences)
       <> (select coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)
           from public.courses course
           cross join lateral jsonb_array_elements(
             course.authoring_state->'parts'
           ) part(value)) then
    raise exception 'Contagens do corte de plano instrucional divergiram.'
      using errcode = '55000';
  end if;
end;
$validate_course_instructional_plan_cutover$;

-- Recibos dos writers substituídos são efêmeros e não podem ser reproduzidos
-- por contratos de hash diferentes. Eventos, por outro lado, continuam como
-- fatos analíticos canônicos e permanecem na mesma trilha.
delete from private.course_change_receipts receipt
where receipt.operation in ('create', 'update_metadata', 'commit_entities');

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v2,
  add constraint course_change_receipts_operation_v3 check(operation in (
    'create_course',
    'commit_course_composition',
    'commit_instructional_plan',
    'advance_authoring_part_materialization',
    'grant_access',
    'revoke_access'
  ));

alter table private.course_events
  drop constraint course_events_operation_v2,
  add constraint course_events_operation_v3 check(operation in (
    'create_course',
    'update_course_metadata',
    'replace_course_composition',
    'update_course_instructional_plan',
    'advance_course_authoring_part_materialization',
    'grant_course_access',
    'revoke_course_access'
  ));

drop function if exists public.create_course_for_actor_v1(
  uuid, text, text, text, text
);
drop function if exists public.commit_course_changes_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, jsonb, jsonb, jsonb, text
);

alter table public.courses
  drop constraint courses_title_v1,
  drop constraint courses_goal_v1,
  drop constraint courses_brief_v1,
  drop constraint courses_authoring_state_v1,
  drop column brief,
  drop column authoring_state,
  add constraint courses_title_v1 check(
    title ~ '[^[:space:]]'
    and char_length(title) <= 300
    and translate(title, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  add constraint courses_goal_v1 check(
    goal ~ '[^[:space:]]'
    and char_length(goal) <= 2000
    and translate(goal, E'\n\r\t', '') !~ '[[:cntrl:]]'
  );

alter table private.course_entities
  drop constraint course_entities_content_v1,
  add constraint course_entities_content_v1 check(
    jsonb_typeof(content) = 'object'
    and not (content ? 'id')
    and not (content ? 'position')
    and not (entity_type = 'module' and content ? 'lessons')
    and not (
      entity_type = 'lesson'
      and (content ? 'topics' or content ? 'microsequences')
    )
    and not (entity_type = 'microsequence' and content ? 'cards')
    and pg_column_size(content) <= 1048576
    and (
      entity_type not in ('module', 'lesson', 'microsequence')
      or (
        jsonb_typeof(content->'title') = 'string'
        and coalesce(content->>'title' ~ '[^[:space:]]', false)
        and char_length(content->>'title') <= 300
        and translate(content->>'title', E'\n\r\t', '')
          !~ '[[:cntrl:]]'
      )
    )
  );

revoke all on table private.course_instructional_plans
  from public, anon, authenticated, service_role;
revoke all on table private.course_instructional_plan_items
  from public, anon, authenticated, service_role;
revoke all on table private.course_authoring_parts
  from public, anon, authenticated, service_role;
revoke all on table private.course_authoring_part_didactic_microsequences
  from public, anon, authenticated, service_role;
revoke all on table private.course_authoring_part_materializations
  from public, anon, authenticated, service_role;
revoke all on table private.course_authoring_part_materialization_steps
  from public, anon, authenticated, service_role;

create function private.course_instructional_plan_command_document_v1(
  p_course_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select jsonb_build_object(
    'id', plan.id,
    'title', course.title,
    'objective', course.goal,
    'audience', plan.audience,
    'scope', plan.instructional_scope,
    'authoringGuidance', plan.authoring_guidance,
    'preferredPartCount', jsonb_build_object(
      'minimum', plan.preferred_authoring_part_min,
      'maximum', plan.preferred_authoring_part_max,
      'origin', plan.part_count_origin
    ),
    'intendedLearningOutcomes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'position', item.position,
        'statement', item.statement
      ) order by item.position, item.id)
      from private.course_instructional_plan_items item
      where item.instructional_plan_id = plan.id
        and item.item_kind = 'intended_learning_outcome'
    ), '[]'::jsonb),
    'instructionalAnalysisUnits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'position', item.position,
        'statement', item.statement
      ) order by item.position, item.id)
      from private.course_instructional_plan_items item
      where item.instructional_plan_id = plan.id
        and item.item_kind = 'instructional_analysis_unit'
    ), '[]'::jsonb),
    'evidenceRequirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'position', item.position,
        'statement', item.statement
      ) order by item.position, item.id)
      from private.course_instructional_plan_items item
      where item.instructional_plan_id = plan.id
        and item.item_kind = 'evidence_requirement'
    ), '[]'::jsonb),
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', part.id,
        'position', part.position,
        'title', part.title,
        'intent', part.intent,
        'microsequenceIds', coalesce((
          select jsonb_agg(
            membership.didactic_microsequence_id
            order by membership.production_position,
              membership.didactic_microsequence_id
          )
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = part.course_id
            and membership.authoring_part_id = part.id
        ), '[]'::jsonb)
      ) order by part.position, part.id)
      from private.course_authoring_parts part
      where part.instructional_plan_id = plan.id
        and part.retired_at is null
    ), '[]'::jsonb)
  )
  from public.courses course
  join private.course_instructional_plans plan on plan.course_id = course.id
  where course.id = p_course_id
$function$;

create function private.course_authoring_part_progress_v1(
  p_course_id uuid,
  p_authoring_part_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with linked as materialized (
    select membership.didactic_microsequence_id,
      count(study_unit.entity_id)::integer as study_unit_count
    from private.course_authoring_part_didactic_microsequences membership
    left join private.course_entities study_unit
      on study_unit.course_id = membership.course_id
     and study_unit.entity_type = 'card'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = membership.didactic_microsequence_id
    where membership.course_id = p_course_id
      and membership.authoring_part_id = p_authoring_part_id
    group by membership.didactic_microsequence_id
  ), latest as materialized (
    select materialization.*
    from private.course_authoring_part_materializations materialization
    where materialization.course_id = p_course_id
      and materialization.authoring_part_id = p_authoring_part_id
    order by materialization.updated_at desc, materialization.id desc
    limit 1
  ), step_counts as (
    select
      count(step.id)::integer as total_count,
      count(step.id) filter(where step.status = 'completed')::integer
        as completed_count,
      count(step.id) filter(where step.status = 'failed')::integer
        as failed_count
    from latest
    left join private.course_authoring_part_materialization_steps step
      on step.course_id = latest.course_id
     and step.materialization_id = latest.id
  )
  select jsonb_build_object(
    'state', case
      when (select status from latest) = 'running' then 'materializing'
      when (select status from latest) = 'failed' then 'attention_required'
      when (select status from latest) = 'completed'
        and (select count(*) from linked) > 0
        and not exists(select 1 from linked where study_unit_count = 0)
        then 'materialized'
      when (select count(*) from linked) > 0 then 'partially_materialized'
      else 'planned'
    end,
    'microsequenceCount', (select count(*)::integer from linked),
    'studyUnitCount', coalesce((select sum(study_unit_count)::integer from linked), 0),
    'lastMaterialization', case when exists(select 1 from latest) then (
      select jsonb_build_object(
        'id', latest.id,
        'status', latest.status,
        'version', latest.version,
        'completedStepCount', counts.completed_count,
        'failedStepCount', counts.failed_count,
        'totalStepCount', counts.total_count,
        'startedAt', latest.started_at,
        'updatedAt', latest.updated_at,
        'completedAt', latest.completed_at
      )
      from latest cross join step_counts counts
    ) else null end
  )
$function$;

create function private.get_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_recent_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_outcomes jsonb;
  v_analysis_units jsonb;
  v_evidence_requirements jsonb;
  v_parts jsonb;
  v_recent jsonb;
  v_counts jsonb;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_recent_limit is null or p_recent_limit not between 0 and 50 then
    raise exception 'Limite de atividade recente inválido.' using errcode = '22023';
  end if;
  select * into strict v_course
  from public.courses course where course.id = p_course_id;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_course_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'position', item.position,
    'statement', item.statement,
    'version', item.version
  ) order by item.position, item.id), '[]'::jsonb)
  into v_outcomes
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'intended_learning_outcome';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'position', item.position,
    'statement', item.statement,
    'version', item.version
  ) order by item.position, item.id), '[]'::jsonb)
  into v_analysis_units
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'instructional_analysis_unit';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'position', item.position,
    'statement', item.statement,
    'version', item.version
  ) order by item.position, item.id), '[]'::jsonb)
  into v_evidence_requirements
  from private.course_instructional_plan_items item
  where item.instructional_plan_id = v_plan.id
    and item.item_kind = 'evidence_requirement';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', part.id,
    'position', part.position,
    'title', part.title,
    'intent', part.intent,
    'version', part.version,
    'microsequences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', microsequence.entity_id,
        'productionPosition', membership.production_position,
        'title', coalesce(
          nullif(microsequence.content->>'title', ''), microsequence.entity_id
        ),
        'curriculumPath', jsonb_build_object(
          'moduleId', module_value.entity_id,
          'moduleTitle', coalesce(
            nullif(module_value.content->>'title', ''), module_value.entity_id
          ),
          'lessonId', lesson.entity_id,
          'lessonTitle', coalesce(
            nullif(lesson.content->>'title', ''), lesson.entity_id
          )
        ),
        'studyUnitCount', (
          select count(*)::integer
          from private.course_entities study_unit
          where study_unit.course_id = microsequence.course_id
            and study_unit.entity_type = 'card'
            and study_unit.parent_type = 'microsequence'
            and study_unit.parent_id = microsequence.entity_id
        )
      ) order by membership.production_position,
        membership.didactic_microsequence_id)
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id = membership.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id = microsequence.course_id
       and lesson.entity_type = 'lesson'
       and lesson.entity_id = microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id = lesson.course_id
       and module_value.entity_type = 'module'
       and module_value.entity_id = lesson.parent_id
      where membership.course_id = part.course_id
        and membership.authoring_part_id = part.id
    ), '[]'::jsonb),
    'progress', private.course_authoring_part_progress_v1(
      part.course_id, part.id
    )
  ) order by part.position, part.id), '[]'::jsonb)
  into v_parts
  from private.course_authoring_parts part
  where part.instructional_plan_id = v_plan.id
    and part.retired_at is null;

  select jsonb_build_object(
    'intendedLearningOutcomeCount', jsonb_array_length(v_outcomes),
    'instructionalAnalysisUnitCount', jsonb_array_length(v_analysis_units),
    'evidenceRequirementCount', jsonb_array_length(v_evidence_requirements),
    'authoringPartCount', jsonb_array_length(v_parts),
    'linkedDidacticMicrosequenceCount', count(distinct membership.didactic_microsequence_id)::integer,
    'studyUnitCount', count(distinct study_unit.entity_id)::integer
  ) into v_counts
  from private.course_authoring_parts part
  left join private.course_authoring_part_didactic_microsequences membership
    on membership.course_id = part.course_id
   and membership.authoring_part_id = part.id
  left join private.course_entities study_unit
    on study_unit.course_id = membership.course_id
   and study_unit.entity_type = 'card'
   and study_unit.parent_type = 'microsequence'
   and study_unit.parent_id = membership.didactic_microsequence_id
  where part.instructional_plan_id = v_plan.id
    and part.retired_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', activity.id::text,
    'revision', activity.revision,
    'kind', activity.summary->>'activityKind',
    'channel', activity.summary->>'channel',
    'instructionalPlanItemId', nullif(
      activity.summary->>'instructionalPlanItemId', ''
    )::uuid,
    'partId', nullif(activity.summary->>'authoringPartId', '')::uuid,
    'materializationId', nullif(activity.summary->>'materializationId', '')::uuid,
    'createdAt', activity.created_at
  ) order by activity.created_at desc, activity.id desc), '[]'::jsonb)
  into v_recent
  from (
    select event_value.*
    from private.course_events event_value
    where event_value.course_id = p_course_id
      and event_value.operation in (
        'update_course_instructional_plan',
        'advance_course_authoring_part_materialization'
      )
    order by event_value.created_at desc, event_value.id desc
    limit p_recent_limit
  ) activity;

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-instructional-plan.v1',
    'courseId', v_course.id,
    'courseRevision', v_course.revision,
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'version', v_plan.version,
      'title', v_course.title,
      'objective', v_course.goal,
      'audience', v_plan.audience,
      'scope', v_plan.instructional_scope,
      'authoringGuidance', v_plan.authoring_guidance,
      'preferredPartCount', jsonb_build_object(
        'minimum', v_plan.preferred_authoring_part_min,
        'maximum', v_plan.preferred_authoring_part_max,
        'origin', v_plan.part_count_origin
      ),
      'intendedLearningOutcomes', v_outcomes,
      'instructionalAnalysisUnits', v_analysis_units,
      'evidenceRequirements', v_evidence_requirements,
      'parts', v_parts,
      'counts', v_counts,
      'updatedAt', v_plan.updated_at
    ),
    'recentActivity', v_recent
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Planejamento excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create function public.get_owned_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_recent_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select private.get_course_instructional_plan_for_actor_v1(
    p_actor_id, p_course_id, p_recent_limit
  )
$function$;

create function public.get_owned_course_instructional_plan_v1(
  p_course_id uuid,
  p_recent_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
  select private.get_course_instructional_plan_for_actor_v1(
    auth.uid(), p_course_id, p_recent_limit
  )
$function$;

create function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_materialization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course_revision bigint;
  v_materialization private.course_authoring_part_materializations%rowtype;
  v_step_count integer;
  v_steps jsonb;
  v_next_pending_step jsonb;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_authoring_part_id is null or p_materialization_id is null then
    raise exception 'Identidade da materialização inválida.'
      using errcode = '22023';
  end if;

  select course.revision into strict v_course_revision
  from public.courses course
  where course.id = p_course_id;
  select materialization.* into v_materialization
  from private.course_authoring_part_materializations materialization
  where materialization.course_id = p_course_id
    and materialization.authoring_part_id = p_authoring_part_id
    and materialization.id = p_materialization_id;
  if not found then
    raise exception 'Materialização inexistente.' using errcode = 'PT404';
  end if;

  select count(*)::integer into v_step_count
  from private.course_authoring_part_materialization_steps step
  where step.course_id = p_course_id
    and step.materialization_id = p_materialization_id;
  if v_step_count > 64 then
    raise exception 'Materialização excede o limite consultável de etapas.'
      using errcode = '54000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', step.id,
    'position', step.position,
    'kind', step.step_kind,
    'targetDidacticMicrosequenceId', step.target_didactic_microsequence_id,
    'productionPosition', step.production_position,
    'status', step.status,
    'version', step.version,
    'resultFacts', step.result_facts,
    'updatedAt', step.updated_at,
    'completedAt', step.completed_at
  ) order by step.position, step.id), '[]'::jsonb)
  into v_steps
  from private.course_authoring_part_materialization_steps step
  where step.course_id = p_course_id
    and step.materialization_id = p_materialization_id;

  if v_materialization.status = 'running' and not exists(
    select 1
    from private.course_authoring_part_materialization_steps step
    where step.course_id = p_course_id
      and step.materialization_id = p_materialization_id
      and step.status = 'failed'
  ) then
    select jsonb_build_object(
      'id', step.id,
      'position', step.position,
      'kind', step.step_kind,
      'targetDidacticMicrosequenceId', step.target_didactic_microsequence_id,
      'productionPosition', step.production_position,
      'status', step.status,
      'version', step.version,
      'resultFacts', step.result_facts,
      'updatedAt', step.updated_at,
      'completedAt', step.completed_at
    ) into v_next_pending_step
    from private.course_authoring_part_materialization_steps step
    where step.course_id = p_course_id
      and step.materialization_id = p_materialization_id
      and step.status = 'pending'
    order by step.position, step.id
    limit 1;
  end if;

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-authoring-part-materialization.v1',
    'courseId', p_course_id,
    'courseRevision', v_course_revision,
    'authoringPartId', p_authoring_part_id,
    'materialization', jsonb_build_object(
      'id', v_materialization.id,
      'status', v_materialization.status,
      'version', v_materialization.version,
      'authoringPartVersion', v_materialization.authoring_part_version,
      'channel', v_materialization.channel,
      'designContext', v_materialization.design_context,
      'resultFacts', v_materialization.result_facts,
      'startedAt', v_materialization.started_at,
      'updatedAt', v_materialization.updated_at,
      'completedAt', v_materialization.completed_at,
      'steps', v_steps,
      'nextPendingStep', v_next_pending_step
    )
  );
  if pg_column_size(v_result) > 1310720 then
    raise exception 'Resposta da materialização excede o limite permitido.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create function public.commit_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_command jsonb,
  p_plan jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_current jsonb;
  v_changed boolean;
  v_result jsonb;
  v_command_type text;
  v_outcome_count integer;
  v_analysis_count integer;
  v_evidence_count integer;
  v_part_count integer;
  v_microsequence_count integer;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  v_command_type := p_command->>'type';
  -- Replay é resolvido pelo comando fechado antes de validar/reconstruir o
  -- alvo. Assim uma resposta perdida continua reproduzível mesmo que outra
  -- mutação já tenha avançado o plano e o chamador não retenha o alvo antigo.
  if p_expected_course_revision is not null
     and p_expected_plan_version is not null
     and p_channel in ('application', 'mcp')
     and p_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     and jsonb_typeof(p_command) = 'object' then
    v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'courseId', p_course_id,
      'expectedCourseRevision', p_expected_course_revision,
      'expectedPlanVersion', p_expected_plan_version,
      'channel', p_channel,
      'command', p_command
    )::text, 'UTF8'), 'sha256'), 'hex');
    perform pg_advisory_xact_lock(hashtextextended(
      'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
    ));
    delete from private.course_change_receipts receipt
    where receipt.actor_id = p_actor_id
      and receipt.request_id = p_request_id
      and receipt.expires_at <= statement_timestamp();
    select * into v_receipt
    from private.course_change_receipts receipt
    where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
    if found then
      if v_receipt.operation <> 'commit_instructional_plan'
         or v_receipt.course_id <> p_course_id
         or v_receipt.request_hash <> v_hash then
        raise exception 'requestId reutilizado com comando incompatível.'
          using errcode = '23514';
      end if;
      return (v_receipt.result - 'idempotent') || jsonb_build_object(
        'idempotent', true
      );
    end if;
  end if;
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_plan_version is null or p_expected_plan_version < 1
     or p_channel not in ('application', 'mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or pg_column_size(p_command) > 32768
     or v_command_type not in (
       'update_plan',
       'add_plan_item', 'update_plan_item', 'remove_plan_item',
       'reorder_plan_items',
       'add_part', 'update_part', 'remove_part', 'reorder_parts',
       'split_part', 'join_parts',
       'assign_microsequence', 'move_microsequence', 'remove_microsequence'
     )
     or jsonb_typeof(p_plan) is distinct from 'object'
     or octet_length(p_plan::text) > 524288
     or not (p_plan ?& array[
       'id', 'title', 'objective', 'audience', 'scope',
       'authoringGuidance', 'preferredPartCount',
       'intendedLearningOutcomes', 'instructionalAnalysisUnits',
       'evidenceRequirements', 'parts'
     ])
     or p_plan
       - 'id' - 'title' - 'objective' - 'audience' - 'scope'
       - 'authoringGuidance' - 'preferredPartCount'
       - 'intendedLearningOutcomes' - 'instructionalAnalysisUnits'
       - 'evidenceRequirements' - 'parts' <> '{}'::jsonb then
    raise exception 'Commit do plano instrucional inválido.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan->'id') is distinct from 'string'
     or (p_plan->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or jsonb_typeof(p_plan->'title') is distinct from 'string'
     or coalesce(p_plan->>'title' ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_plan->>'title')) > 300
     or translate(p_plan->>'title', E'\n\r\t', '') ~ '[[:cntrl:]]'
     or jsonb_typeof(p_plan->'objective') is distinct from 'string'
     or coalesce(p_plan->>'objective' ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_plan->>'objective')) > 2000
     or translate(p_plan->>'objective', E'\n\r\t', '') ~ '[[:cntrl:]]'
     or jsonb_typeof(p_plan->'audience') is distinct from 'string'
     or char_length(p_plan->>'audience') > 4000
     or jsonb_typeof(p_plan->'scope') is distinct from 'string'
     or char_length(p_plan->>'scope') > 8000
     or jsonb_typeof(p_plan->'authoringGuidance') is distinct from 'string'
     or char_length(p_plan->>'authoringGuidance') > 16384
     or jsonb_typeof(p_plan->'preferredPartCount') is distinct from 'object'
     or not (p_plan->'preferredPartCount' ?& array['minimum', 'maximum', 'origin'])
     or (p_plan->'preferredPartCount') - 'minimum' - 'maximum' - 'origin'
       <> '{}'::jsonb
     or jsonb_typeof(p_plan#>'{preferredPartCount,minimum}') is distinct from 'number'
     or jsonb_typeof(p_plan#>'{preferredPartCount,maximum}') is distinct from 'number'
     or (p_plan#>>'{preferredPartCount,minimum}') !~ '^[0-9]+$'
     or (p_plan#>>'{preferredPartCount,maximum}') !~ '^[0-9]+$'
     or (p_plan#>>'{preferredPartCount,minimum}')::integer not between 1 and 64
     or (p_plan#>>'{preferredPartCount,maximum}')::integer not between 1 and 64
     or (p_plan#>>'{preferredPartCount,minimum}')::integer
       > (p_plan#>>'{preferredPartCount,maximum}')::integer
     or p_plan#>>'{preferredPartCount,origin}' not in (
       'automatic', 'author', 'research_condition'
     )
     or jsonb_typeof(p_plan->'intendedLearningOutcomes') is distinct from 'array'
     or jsonb_typeof(p_plan->'instructionalAnalysisUnits') is distinct from 'array'
     or jsonb_typeof(p_plan->'evidenceRequirements') is distinct from 'array'
     or jsonb_typeof(p_plan->'parts') is distinct from 'array'
     or jsonb_array_length(p_plan->'intendedLearningOutcomes') > 256
     or jsonb_array_length(p_plan->'instructionalAnalysisUnits') > 256
     or jsonb_array_length(p_plan->'evidenceRequirements') > 256
     or jsonb_array_length(p_plan->'intendedLearningOutcomes')
       + jsonb_array_length(p_plan->'instructionalAnalysisUnits')
       + jsonb_array_length(p_plan->'evidenceRequirements') > 512
     or jsonb_array_length(p_plan->'parts') > 64 then
    raise exception 'Conteúdo do plano instrucional inválido.' using errcode = '22023';
  end if;

  if exists(
    with incoming as (
      select 'intended_learning_outcome'::text as item_kind,
        item.value, item.ordinal::integer - 1 as expected_position
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes')
        with ordinality item(value, ordinal)
      union all
      select 'instructional_analysis_unit', item.value,
        item.ordinal::integer - 1
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits')
        with ordinality item(value, ordinal)
      union all
      select 'evidence_requirement', item.value,
        item.ordinal::integer - 1
      from jsonb_array_elements(p_plan->'evidenceRequirements')
        with ordinality item(value, ordinal)
    )
    select 1 from incoming
    where jsonb_typeof(value) is distinct from 'object'
      or value - 'id' - 'position' - 'statement' <> '{}'::jsonb
      or not (value ?& array['id', 'position', 'statement'])
      or jsonb_typeof(value->'id') is distinct from 'string'
      or (value->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(value->'position') is distinct from 'number'
      or value->>'position' !~ '^[0-9]+$'
      or (value->>'position')::integer <> expected_position
      or jsonb_typeof(value->'statement') is distinct from 'string'
      or coalesce(value->>'statement' ~ '[^[:space:]]', false) is not true
      or char_length(value->>'statement') > 2000
  ) or exists(
    with incoming as (
      select item.value->>'id' as id
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    )
    select 1 from incoming group by id having count(*) > 1
  ) then
    raise exception 'Item do plano instrucional inválido ou repetido.'
      using errcode = '22023';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_plan->'parts')
      with ordinality part(value, ordinal)
    where jsonb_typeof(part.value) is distinct from 'object'
      or part.value - 'id' - 'position' - 'title' - 'intent'
        - 'microsequenceIds' <> '{}'::jsonb
      or not (part.value ?& array[
        'id', 'position', 'title', 'intent', 'microsequenceIds'
      ])
      or jsonb_typeof(part.value->'id') is distinct from 'string'
      or (part.value->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(part.value->'position') is distinct from 'number'
      or part.value->>'position' !~ '^[0-9]+$'
      or (part.value->>'position')::integer <> part.ordinal::integer - 1
      or jsonb_typeof(part.value->'title') is distinct from 'string'
      or coalesce(part.value->>'title' ~ '[^[:space:]]', false) is not true
      or char_length(btrim(part.value->>'title')) > 300
      or translate(part.value->>'title', E'\n\r\t', '') ~ '[[:cntrl:]]'
      or jsonb_typeof(part.value->'intent') is distinct from 'string'
      or char_length(part.value->>'intent') > 4000
      or jsonb_typeof(part.value->'microsequenceIds') is distinct from 'array'
      or jsonb_array_length(part.value->'microsequenceIds') > 64
      or exists(
        select 1
        from jsonb_array_elements(part.value->'microsequenceIds') micro(value)
        where jsonb_typeof(micro.value) is distinct from 'string'
          or nullif(btrim(micro.value#>>'{}'), '') is null
          or micro.value#>>'{}' <> btrim(micro.value#>>'{}')
          or char_length(micro.value#>>'{}') > 240
          or micro.value#>>'{}' ~ '[[:cntrl:]]'
      )
  ) or exists(
    select 1 from jsonb_array_elements(p_plan->'parts') part(value)
    group by part.value->>'id' having count(*) > 1
  ) or exists(
    select 1
    from jsonb_array_elements(p_plan->'parts') part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) micro(microsequence_id)
    group by micro.microsequence_id having count(*) > 1
  ) then
    raise exception 'Parte do plano instrucional inválida ou repetida.'
      using errcode = '22023';
  end if;
  if (
    select coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)
    from jsonb_array_elements(p_plan->'parts') part(value)
  ) > 192 then
    raise exception 'O plano excede 192 vínculos de microssequência.'
      using errcode = '22023';
  end if;

  if exists(
    with incoming as (
      select item.value->>'id' as id
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select item.value->>'id'
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    )
    select 1 from incoming
    join private.course_instructional_plan_items existing
      on existing.id = incoming.id::uuid
    where existing.course_id <> p_course_id
  ) or exists(
    select 1 from jsonb_array_elements(p_plan->'parts') part(value)
    join private.course_authoring_parts existing
      on existing.id = (part.value->>'id')::uuid
    where existing.course_id <> p_course_id
  ) or exists(
    select 1
    from jsonb_array_elements(p_plan->'parts') part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) micro(microsequence_id)
    left join private.course_entities entity
      on entity.course_id = p_course_id
     and entity.entity_type = 'microsequence'
     and entity.entity_id = micro.microsequence_id
    where entity.course_id is null
  ) then
    raise exception 'Identidade ou referência do plano pertence a outro contexto.'
      using errcode = '23514';
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'expectedCourseRevision', p_expected_course_revision,
    'expectedPlanVersion', p_expected_plan_version,
    'channel', p_channel,
    'command', p_command
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid from private.course_change_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 100 for update skip locked
  )
  delete from private.course_change_receipts receipt
  using expired where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_instructional_plan'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text, 0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_course_id for update;
  if v_course.revision <> p_expected_course_revision
     or v_plan.version <> p_expected_plan_version then
    raise exception 'O Curso ou plano mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  if v_plan.id <> (p_plan->>'id')::uuid then
    raise exception 'A identidade do plano não pode ser alterada.'
      using errcode = '23514';
  end if;
  v_current := private.course_instructional_plan_command_document_v1(
    p_course_id
  );
  v_changed := v_current is distinct from p_plan;

  if v_changed and exists(
    select 1
    from private.course_authoring_part_materializations materialization
    join private.course_authoring_parts part
      on part.course_id = materialization.course_id
     and part.id = materialization.authoring_part_id
    where materialization.course_id = p_course_id
      and materialization.status = 'running'
      and not exists(
        select 1
        from jsonb_array_elements(p_plan->'parts') candidate(value)
        where (candidate.value->>'id')::uuid = part.id
          and (candidate.value->>'position')::integer = part.position
          and btrim(candidate.value->>'title') = part.title
          and candidate.value->>'intent' = part.intent
          and candidate.value->'microsequenceIds' = coalesce((
            select jsonb_agg(
              membership.didactic_microsequence_id
              order by membership.production_position,
                membership.didactic_microsequence_id
            )
            from private.course_authoring_part_didactic_microsequences membership
            where membership.course_id = part.course_id
              and membership.authoring_part_id = part.id
          ), '[]'::jsonb)
      )
  ) then
    raise exception 'Uma Parte em materialização mudou; finalize ou marque a tentativa como falha antes de alterá-la.'
      using errcode = '40001';
  end if;

  if v_changed then
    update public.courses course
    set title = btrim(p_plan->>'title'),
        goal = btrim(p_plan->>'objective'),
        revision = course.revision + 1,
        updated_at = now()
    where course.id = p_course_id
    returning * into v_course;
    update private.course_instructional_plans plan
    set audience = p_plan->>'audience',
        instructional_scope = p_plan->>'scope',
        authoring_guidance = p_plan->>'authoringGuidance',
        preferred_authoring_part_min =
          (p_plan#>>'{preferredPartCount,minimum}')::smallint,
        preferred_authoring_part_max =
          (p_plan#>>'{preferredPartCount,maximum}')::smallint,
        part_count_origin = p_plan#>>'{preferredPartCount,origin}',
        version = plan.version + 1,
        updated_at = now()
    where plan.id = v_plan.id
    returning * into v_plan;

    with incoming as (
      select 'intended_learning_outcome'::text as item_kind,
        item.value
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select 'instructional_analysis_unit', item.value
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select 'evidence_requirement', item.value
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    )
    delete from private.course_instructional_plan_items item
    where item.instructional_plan_id = v_plan.id
      and not exists(
        select 1 from incoming
        where (incoming.value->>'id')::uuid = item.id
      );

    insert into private.course_instructional_plan_items(
      id, course_id, instructional_plan_id, item_kind,
      position, statement, version
    )
    select (incoming.value->>'id')::uuid, p_course_id, v_plan.id,
      incoming.item_kind, (incoming.value->>'position')::integer,
      btrim(incoming.value->>'statement'), 1
    from (
      select 'intended_learning_outcome'::text as item_kind, item.value
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select 'instructional_analysis_unit', item.value
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select 'evidence_requirement', item.value
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    ) incoming
    on conflict(id) do update set
      item_kind = excluded.item_kind,
      position = excluded.position,
      statement = excluded.statement,
      version = private.course_instructional_plan_items.version + 1,
      updated_at = now()
    where row(
      private.course_instructional_plan_items.item_kind,
      private.course_instructional_plan_items.position,
      private.course_instructional_plan_items.statement
    ) is distinct from row(
      excluded.item_kind, excluded.position, excluded.statement
    );

    insert into private.course_authoring_parts(
      id, course_id, instructional_plan_id, position,
      title, intent, version, retired_at
    )
    select (part.value->>'id')::uuid, p_course_id, v_plan.id,
      (part.value->>'position')::integer, btrim(part.value->>'title'),
      part.value->>'intent', 1, null
    from jsonb_array_elements(p_plan->'parts') part(value)
    on conflict(id) do update set
      position = excluded.position,
      title = excluded.title,
      intent = excluded.intent,
      retired_at = null,
      version = private.course_authoring_parts.version + 1,
      updated_at = now()
    where row(
      private.course_authoring_parts.position,
      private.course_authoring_parts.title,
      private.course_authoring_parts.intent,
      private.course_authoring_parts.retired_at,
      coalesce((
        select jsonb_agg(
          membership.didactic_microsequence_id
          order by membership.production_position
        )
        from private.course_authoring_part_didactic_microsequences membership
        where membership.course_id = private.course_authoring_parts.course_id
          and membership.authoring_part_id = private.course_authoring_parts.id
      ), '[]'::jsonb)
    ) is distinct from row(
      excluded.position, excluded.title, excluded.intent, null::timestamptz,
      coalesce((
        select candidate.value->'microsequenceIds'
        from jsonb_array_elements(p_plan->'parts') candidate(value)
        where (candidate.value->>'id')::uuid = excluded.id
      ), '[]'::jsonb)
    );

    update private.course_authoring_parts part
    set position = null,
        retired_at = now(),
        version = part.version + 1,
        updated_at = now()
    where part.instructional_plan_id = v_plan.id
      and part.retired_at is null
      and not exists(
        select 1 from jsonb_array_elements(p_plan->'parts') candidate(value)
        where (candidate.value->>'id')::uuid = part.id
      );

    delete from private.course_authoring_part_didactic_microsequences membership
    where membership.course_id = p_course_id;
    insert into private.course_authoring_part_didactic_microsequences(
      course_id, authoring_part_id, didactic_microsequence_id,
      production_position
    )
    select p_course_id, (part.value->>'id')::uuid,
      micro.value, micro.ordinal::integer - 1
    from jsonb_array_elements(p_plan->'parts') part(value)
    cross join lateral jsonb_array_elements_text(
      part.value->'microsequenceIds'
    ) with ordinality micro(value, ordinal);

    select
      jsonb_array_length(p_plan->'intendedLearningOutcomes'),
      jsonb_array_length(p_plan->'instructionalAnalysisUnits'),
      jsonb_array_length(p_plan->'evidenceRequirements'),
      jsonb_array_length(p_plan->'parts'),
      coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)::integer
    into v_outcome_count, v_analysis_count, v_evidence_count,
      v_part_count, v_microsequence_count
    from jsonb_array_elements(p_plan->'parts') part(value);
    insert into private.course_events(
      course_id, revision, operation, summary, actor_id
    ) values(
      p_course_id,
      v_course.revision,
      'update_course_instructional_plan',
      jsonb_build_object(
        'activityKind', 'plan_changed',
        'channel', p_channel,
        'instructionalPlanId', v_plan.id,
        'planVersion', v_plan.version,
        'commandType', v_command_type,
        'authoringPartId', case
          when p_command ? 'id' and v_command_type like '%part%'
            then p_command->>'id'
          when p_command ? 'partId' then p_command->>'partId'
          else null
        end,
        'instructionalPlanItemId', case
          when v_command_type in (
            'add_plan_item', 'update_plan_item', 'remove_plan_item'
          ) and p_command ? 'id' then p_command->>'id'
          else null
        end,
        'intendedLearningOutcomeCount', v_outcome_count,
        'instructionalAnalysisUnitCount', v_analysis_count,
        'evidenceRequirementCount', v_evidence_count,
        'authoringPartCount', v_part_count,
        'linkedDidacticMicrosequenceCount', v_microsequence_count
      ),
      p_actor_id
    );
  else
    v_outcome_count := jsonb_array_length(p_plan->'intendedLearningOutcomes');
    v_analysis_count := jsonb_array_length(p_plan->'instructionalAnalysisUnits');
    v_evidence_count := jsonb_array_length(p_plan->'evidenceRequirements');
    v_part_count := jsonb_array_length(p_plan->'parts');
    select coalesce(sum(jsonb_array_length(part.value->'microsequenceIds')), 0)::integer
    into v_microsequence_count
    from jsonb_array_elements(p_plan->'parts') part(value);
  end if;

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-instructional-plan-change.v1',
    'courseId', p_course_id,
    'courseRevision', v_course.revision,
    'planId', v_plan.id,
    'planVersion', v_plan.version,
    'operation', 'commit_instructional_plan',
    'commandType', v_command_type,
    'channel', p_channel,
    'changed', v_changed,
    'idempotent', false,
    'counts', jsonb_build_object(
      'intendedLearningOutcomeCount', v_outcome_count,
      'instructionalAnalysisUnitCount', v_analysis_count,
      'evidenceRequirementCount', v_evidence_count,
      'authoringPartCount', v_part_count,
      'linkedDidacticMicrosequenceCount', v_microsequence_count
    ),
    'updatedAt', greatest(v_course.updated_at, v_plan.updated_at)
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'commit_instructional_plan',
    p_course_id, v_hash, v_result
  );
  return v_result;
end;
$function$;

create function public.advance_course_authoring_part_materialization_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_materialization_id uuid,
  p_expected_course_revision bigint,
  p_expected_materialization_version bigint,
  p_operation text,
  p_payload jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_part private.course_authoring_parts%rowtype;
  v_materialization private.course_authoring_part_materializations%rowtype;
  v_step private.course_authoring_part_materialization_steps%rowtype;
  v_step_id uuid;
  v_entity_changes jsonb := coalesce(p_payload->'entityChanges',
    '{"upserts":[],"deletes":[]}'::jsonb);
  v_upserts jsonb := coalesce(p_payload#>'{entityChanges,upserts}', '[]'::jsonb);
  v_deletes jsonb := coalesce(p_payload#>'{entityChanges,deletes}', '[]'::jsonb);
  v_before_entity_count integer := 0;
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_deleted_count integer := 0;
  v_linked_microsequence_id text;
  v_link_inserted boolean := false;
  v_changed boolean := true;
  v_activity_kind text;
  v_result jsonb;
  v_next_step jsonb;
  v_completed_step_count integer;
  v_failed_step_count integer;
  v_total_step_count integer;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_authoring_part_id is null or p_materialization_id is null
     or p_expected_course_revision is null or p_expected_course_revision < 1
     or p_expected_materialization_version is null
     or p_expected_materialization_version < 0
     or p_operation not in ('start', 'record_step', 'finish')
     or p_channel not in ('application', 'mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_payload) is distinct from 'object'
     or pg_column_size(p_payload) > 524288 then
    raise exception 'Avanço da materialização inválido.' using errcode = '22023';
  end if;

  if p_operation = 'start' then
    if p_payload - 'authoringPartVersion' - 'designContext' - 'steps'
         <> '{}'::jsonb
       or not (p_payload ?& array[
         'authoringPartVersion', 'designContext', 'steps'
       ])
       or jsonb_typeof(p_payload->'authoringPartVersion') is distinct from 'number'
       or p_payload->>'authoringPartVersion' !~ '^[0-9]+$'
       or (p_payload->>'authoringPartVersion')::bigint < 1
       or jsonb_typeof(p_payload->'designContext') is distinct from 'object'
       or pg_column_size(p_payload->'designContext') > 65536
       or jsonb_typeof(p_payload->'steps') is distinct from 'array'
       or jsonb_array_length(p_payload->'steps') not between 1 and 64
       or p_expected_materialization_version <> 0 then
      raise exception 'Início da materialização inválido.' using errcode = '22023';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(p_payload->'steps')
        with ordinality step(value, ordinal)
      where jsonb_typeof(step.value) is distinct from 'object'
        or step.value - 'id' - 'position' - 'kind'
          - 'targetDidacticMicrosequenceId' - 'productionPosition'
          <> '{}'::jsonb
        or not (step.value ?& array[
          'id', 'position', 'kind',
          'targetDidacticMicrosequenceId', 'productionPosition'
        ])
        or jsonb_typeof(step.value->'id') is distinct from 'string'
        or (step.value->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or jsonb_typeof(step.value->'position') is distinct from 'number'
        or step.value->>'position' !~ '^[0-9]+$'
        or (step.value->>'position')::integer <> step.ordinal::integer - 1
        or step.value->>'kind' not in (
          'context_load',
          'didactic_microsequence_materialization',
          'validation'
        )
        or (
          step.value->>'kind' = 'didactic_microsequence_materialization'
          and (
            jsonb_typeof(step.value->'targetDidacticMicrosequenceId')
              is distinct from 'string'
            or nullif(btrim(
              step.value->>'targetDidacticMicrosequenceId'
            ), '') is null
            or step.value->>'targetDidacticMicrosequenceId'
              <> btrim(step.value->>'targetDidacticMicrosequenceId')
            or char_length(
              step.value->>'targetDidacticMicrosequenceId'
            ) > 240
            or step.value->>'targetDidacticMicrosequenceId' ~ '[[:cntrl:]]'
            or jsonb_typeof(step.value->'productionPosition')
              is distinct from 'number'
            or step.value->>'productionPosition' !~ '^[0-9]+$'
            or (step.value->>'productionPosition')::integer not between 0 and 63
          )
        )
        or (
          step.value->>'kind' <> 'didactic_microsequence_materialization'
          and (
            step.value->'targetDidacticMicrosequenceId' <> 'null'::jsonb
            or step.value->'productionPosition' <> 'null'::jsonb
          )
        )
    ) or exists(
      select 1 from jsonb_array_elements(p_payload->'steps') step(value)
      group by step.value->>'id' having count(*) > 1
    ) or exists(
      select 1 from jsonb_array_elements(p_payload->'steps') step(value)
      where step.value->>'kind' = 'didactic_microsequence_materialization'
      group by step.value->>'targetDidacticMicrosequenceId'
      having count(*) > 1
    ) or exists(
      select 1 from jsonb_array_elements(p_payload->'steps') step(value)
      where step.value->>'kind' = 'didactic_microsequence_materialization'
      group by step.value->>'productionPosition'
      having count(*) > 1
    ) then
      raise exception 'Etapas iniciais da materialização inválidas.'
        using errcode = '22023';
    end if;
  elsif p_operation = 'record_step' then
    if p_payload - 'stepId' - 'expectedStepVersion' - 'status'
         - 'resultFacts' - 'entityChanges' <> '{}'::jsonb
       or not (p_payload ?& array[
         'stepId', 'expectedStepVersion', 'status',
         'resultFacts', 'entityChanges'
       ])
       or jsonb_typeof(p_payload->'stepId') is distinct from 'string'
       or (p_payload->>'stepId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(p_payload->'expectedStepVersion') is distinct from 'number'
       or p_payload->>'expectedStepVersion' !~ '^[0-9]+$'
       or (p_payload->>'expectedStepVersion')::bigint < 1
       or p_payload->>'status' not in ('completed', 'failed')
       or jsonb_typeof(p_payload->'resultFacts') is distinct from 'object'
       or pg_column_size(p_payload->'resultFacts') > 16384
       or jsonb_typeof(v_entity_changes) is distinct from 'object'
       or v_entity_changes - 'upserts' - 'deletes' <> '{}'::jsonb
       or not (v_entity_changes ?& array['upserts', 'deletes'])
       or jsonb_typeof(v_upserts) is distinct from 'array'
       or jsonb_typeof(v_deletes) is distinct from 'array'
       or jsonb_array_length(v_upserts) + jsonb_array_length(v_deletes) > 64
       or pg_column_size(v_entity_changes) > 262144
       or p_expected_materialization_version < 1 then
      raise exception 'Registro de etapa inválido.' using errcode = '22023';
    end if;
    v_step_id := (p_payload->>'stepId')::uuid;
    if exists(
      select 1 from jsonb_array_elements(v_upserts) item(value)
      where jsonb_typeof(item.value) is distinct from 'object'
        or item.value - 'entityType' - 'entityId' - 'parentType'
          - 'parentId' - 'position' - 'content' <> '{}'::jsonb
        or not (item.value ?& array[
          'entityType', 'entityId', 'parentType', 'parentId',
          'position', 'content'
        ])
        or item.value->>'entityType' not in (
          'module', 'lesson', 'topic', 'microsequence', 'card'
        )
        or nullif(btrim(item.value->>'entityId'), '') is null
        or item.value->>'entityId' <> btrim(item.value->>'entityId')
        or char_length(item.value->>'entityId') > 240
        or item.value->>'entityId' ~ '[[:cntrl:]]'
        or jsonb_typeof(item.value->'position') is distinct from 'number'
        or item.value->>'position' !~ '^-?[0-9]+$'
        or jsonb_typeof(item.value->'content') is distinct from 'object'
        or (
          item.value->>'entityType' in ('module', 'lesson', 'microsequence')
          and (
            jsonb_typeof(item.value->'content'->'title')
              is distinct from 'string'
            or coalesce(
              item.value#>>'{content,title}' ~ '[^[:space:]]', false
            ) is not true
            or char_length(item.value#>>'{content,title}') > 300
            or translate(item.value#>>'{content,title}', E'\n\r\t', '')
              ~ '[[:cntrl:]]'
          )
        )
    ) or exists(
      select 1 from jsonb_array_elements(v_deletes) item(value)
      where jsonb_typeof(item.value) is distinct from 'object'
        or item.value - 'entityType' - 'entityId' <> '{}'::jsonb
        or not (item.value ?& array['entityType', 'entityId'])
        or item.value->>'entityType' not in (
          'module', 'lesson', 'topic', 'microsequence', 'card'
        )
        or nullif(btrim(item.value->>'entityId'), '') is null
        or item.value->>'entityId' <> btrim(item.value->>'entityId')
        or char_length(item.value->>'entityId') > 240
        or item.value->>'entityId' ~ '[[:cntrl:]]'
    ) or (
      select count(*) <> count(distinct (
        item.value->>'entityType', item.value->>'entityId'
      )) from jsonb_array_elements(v_upserts) item(value)
    ) or (
      select count(*) <> count(distinct (
        item.value->>'entityType', item.value->>'entityId'
      )) from jsonb_array_elements(v_deletes) item(value)
    ) or exists(
      select 1
      from jsonb_array_elements(v_upserts) upsert_item(value)
      join jsonb_array_elements(v_deletes) delete_item(value)
        on delete_item.value->>'entityType' = upsert_item.value->>'entityType'
       and delete_item.value->>'entityId' = upsert_item.value->>'entityId'
    ) then
      raise exception 'Lote de entidades da etapa inválido.' using errcode = '22023';
    end if;
  else
    if p_payload - 'status' - 'resultFacts' <> '{}'::jsonb
       or not (p_payload ?& array['status', 'resultFacts'])
       or p_payload->>'status' not in ('completed', 'failed')
       or jsonb_typeof(p_payload->'resultFacts') is distinct from 'object'
       or pg_column_size(p_payload->'resultFacts') > 16384
       or p_expected_materialization_version < 1 then
      raise exception 'Finalização da materialização inválida.' using errcode = '22023';
    end if;
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'authoringPartId', p_authoring_part_id,
    'materializationId', p_materialization_id,
    'expectedCourseRevision', p_expected_course_revision,
    'expectedMaterializationVersion', p_expected_materialization_version,
    'operation', p_operation,
    'payload', p_payload,
    'channel', p_channel
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid from private.course_change_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 100 for update skip locked
  )
  delete from private.course_change_receipts receipt
  using expired where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'advance_authoring_part_materialization'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text, 0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  select * into strict v_plan
  from private.course_instructional_plans plan
  where plan.course_id = p_course_id for update;
  select * into v_part
  from private.course_authoring_parts part
  where part.course_id = p_course_id and part.id = p_authoring_part_id
  for update;
  if not found or v_part.retired_at is not null then
    raise exception 'Parte de Autoria inexistente.' using errcode = 'PT404';
  end if;
  if v_course.revision <> p_expected_course_revision then
    raise exception 'O Curso mudou; releia antes de continuar.'
      using errcode = '40001';
  end if;

  if p_operation = 'start' then
    if v_part.version <> (p_payload->>'authoringPartVersion')::bigint then
      raise exception 'A Parte mudou; releia antes de materializar.'
        using errcode = '40001';
    end if;
    if exists(
      select 1 from private.course_authoring_part_materializations materialization
      where materialization.id = p_materialization_id
    ) or exists(
      select 1 from private.course_authoring_part_materializations materialization
      where materialization.course_id = p_course_id
        and materialization.authoring_part_id = p_authoring_part_id
        and materialization.status = 'running'
    ) then
      raise exception 'Já existe materialização ativa ou identidade utilizada.'
        using errcode = '23514';
    end if;
    insert into private.course_authoring_part_materializations(
      id, course_id, authoring_part_id, authoring_part_version,
      actor_id, channel, status, version, design_context, result_facts
    ) values(
      p_materialization_id, p_course_id, p_authoring_part_id,
      v_part.version, p_actor_id, p_channel, 'running', 1,
      p_payload->'designContext', '{}'::jsonb
    ) returning * into v_materialization;
    insert into private.course_authoring_part_materialization_steps(
      id, course_id, materialization_id, position, step_kind,
      target_didactic_microsequence_id, production_position,
      status, version, result_facts
    )
    select (step.value->>'id')::uuid, p_course_id, p_materialization_id,
      (step.value->>'position')::integer, step.value->>'kind',
      nullif(step.value->>'targetDidacticMicrosequenceId', ''),
      case when step.value->'productionPosition' = 'null'::jsonb
        then null else (step.value->>'productionPosition')::integer end,
      'pending', 1, '{}'::jsonb
    from jsonb_array_elements(p_payload->'steps') step(value);
    v_activity_kind := 'materialization_started';
  else
    select * into v_materialization
    from private.course_authoring_part_materializations materialization
    where materialization.course_id = p_course_id
      and materialization.id = p_materialization_id
      and materialization.authoring_part_id = p_authoring_part_id
    for update;
    if not found then
      raise exception 'Materialização inexistente.' using errcode = 'PT404';
    end if;
    if v_materialization.version <> p_expected_materialization_version
       or v_materialization.status <> 'running'
       or v_part.version <> v_materialization.authoring_part_version then
      raise exception 'A materialização ou Parte mudou; releia antes de continuar.'
        using errcode = '40001';
    end if;

    if p_operation = 'record_step' then
      select * into v_step
      from private.course_authoring_part_materialization_steps step
      where step.course_id = p_course_id
        and step.materialization_id = p_materialization_id
        and step.id = v_step_id
      for update;
      if not found then
        raise exception 'Etapa inexistente.' using errcode = 'PT404';
      end if;
      if v_step.version <> (p_payload->>'expectedStepVersion')::bigint
         or v_step.status <> 'pending' then
        raise exception 'A etapa mudou; releia antes de continuar.'
          using errcode = '40001';
      end if;
      if exists(
        select 1
        from private.course_authoring_part_materialization_steps step
        where step.materialization_id = p_materialization_id
          and step.status = 'failed'
      ) or exists(
        select 1
        from private.course_authoring_part_materialization_steps step
        where step.materialization_id = p_materialization_id
          and step.status = 'pending'
          and step.position < v_step.position
      ) then
        raise exception 'A etapa não é a próxima pendente ou a materialização já falhou.'
          using errcode = '23514';
      end if;
      if (
        v_step.step_kind <> 'didactic_microsequence_materialization'
        or p_payload->>'status' = 'failed'
      ) and (
        jsonb_array_length(v_upserts) <> 0
        or jsonb_array_length(v_deletes) <> 0
      ) then
        raise exception 'Esta etapa não aceita lote de entidades.'
          using errcode = '22023';
      end if;
      if v_step.step_kind = 'didactic_microsequence_materialization'
         and p_payload->>'status' = 'completed' then
        if exists(
          select 1
          from jsonb_array_elements(v_upserts) item(value)
          left join private.course_entities existing
            on existing.course_id = p_course_id
           and existing.entity_type = item.value->>'entityType'
           and existing.entity_id = item.value->>'entityId'
          where (
            case item.value->>'entityType'
              when 'microsequence' then
                item.value->>'entityId'
                  = v_step.target_didactic_microsequence_id
                and item.value->>'parentType' = 'lesson'
                and nullif(item.value->>'parentId', '') is not null
              when 'card' then
                item.value->>'parentType' = 'microsequence'
                and item.value->>'parentId'
                  = v_step.target_didactic_microsequence_id
              else false
            end
          ) is not true
          or (
            existing.course_id is not null
            and (
              case existing.entity_type
                when 'microsequence' then
                  existing.entity_id
                    = v_step.target_didactic_microsequence_id
                when 'card' then
                  existing.parent_type = 'microsequence'
                  and existing.parent_id
                    = v_step.target_didactic_microsequence_id
                else false
              end
            ) is not true
          )
        ) then
          raise exception 'A etapa tentou alterar conteúdo fora da microssequência alvo.'
            using errcode = '23514';
        end if;
        if exists(
          select 1
          from jsonb_array_elements(v_deletes) deletion(value)
          left join private.course_entities entity
            on entity.course_id = p_course_id
           and entity.entity_type = deletion.value->>'entityType'
           and entity.entity_id = deletion.value->>'entityId'
          where entity.course_id is not null
            and not (
              (entity.entity_type = 'microsequence'
                and entity.entity_id = v_step.target_didactic_microsequence_id)
              or (entity.entity_type = 'card'
                and entity.parent_type = 'microsequence'
                and entity.parent_id = v_step.target_didactic_microsequence_id)
            )
        ) then
          raise exception 'A etapa tentou excluir conteúdo fora da microssequência alvo.'
            using errcode = '23514';
        end if;
        select count(*)::integer into v_before_entity_count
        from private.course_entities entity where entity.course_id = p_course_id;
        select
          count(*) filter(where entity.course_id is null)::integer,
          count(*) filter(
            where entity.course_id is not null
              and row(
                entity.parent_type, entity.parent_id,
                entity.position, entity.content
              ) is distinct from row(
                nullif(item.value->>'parentType', ''),
                nullif(item.value->>'parentId', ''),
                (item.value->>'position')::integer,
                item.value->'content'
              )
          )::integer
        into v_created_count, v_updated_count
        from jsonb_array_elements(v_upserts) item(value)
        left join private.course_entities entity
          on entity.course_id = p_course_id
         and entity.entity_type = item.value->>'entityType'
         and entity.entity_id = item.value->>'entityId';
        delete from private.course_entities entity
        using jsonb_array_elements(v_deletes) deletion(value)
        where entity.course_id = p_course_id
          and entity.entity_type = deletion.value->>'entityType'
          and entity.entity_id = deletion.value->>'entityId';
        select v_before_entity_count - count(*)::integer
        into v_deleted_count
        from private.course_entities entity where entity.course_id = p_course_id;
        insert into private.course_entities(
          course_id, entity_type, entity_id, parent_type, parent_id,
          position, content, version, created_at, updated_at
        )
        select p_course_id, item.value->>'entityType', item.value->>'entityId',
          nullif(item.value->>'parentType', ''),
          nullif(item.value->>'parentId', ''),
          (item.value->>'position')::integer, item.value->'content',
          1, now(), now()
        from jsonb_array_elements(v_upserts) item(value)
        on conflict(course_id, entity_type, entity_id) do update set
          parent_type = excluded.parent_type,
          parent_id = excluded.parent_id,
          position = excluded.position,
          content = excluded.content,
          version = private.course_entities.version + 1,
          updated_at = now()
        where row(
          private.course_entities.parent_type,
          private.course_entities.parent_id,
          private.course_entities.position,
          private.course_entities.content
        ) is distinct from row(
          excluded.parent_type, excluded.parent_id,
          excluded.position, excluded.content
        );
        if exists(
          select 1 from private.course_entities entity
          where entity.course_id = p_course_id
            and entity.parent_type is not null
            and not exists(
              select 1 from private.course_entities parent
              where parent.course_id = entity.course_id
                and parent.entity_type = entity.parent_type
                and parent.entity_id = entity.parent_id
            )
        ) or exists(
          select 1 from private.course_entities entity
          where entity.course_id = p_course_id and entity.entity_type <> 'card'
          group by entity.parent_type, entity.parent_id, entity.entity_type
          having min(entity.position) <> 0
            or max(entity.position) <> count(*) - 1
            or count(distinct entity.position) <> count(*)
        ) or not exists(
          select 1 from private.course_entities entity
          where entity.course_id = p_course_id
            and entity.entity_type = 'microsequence'
            and entity.entity_id = v_step.target_didactic_microsequence_id
        ) then
          raise exception 'O lote produziria composição ou alvo inválido.'
            using errcode = '23514';
        end if;
        insert into private.course_authoring_part_didactic_microsequences(
          course_id, authoring_part_id, didactic_microsequence_id,
          production_position
        ) values(
          p_course_id, p_authoring_part_id,
          v_step.target_didactic_microsequence_id,
          v_step.production_position
        )
        on conflict(course_id, authoring_part_id, didactic_microsequence_id)
        do update set production_position = excluded.production_position
        where private.course_authoring_part_didactic_microsequences.production_position
          is distinct from excluded.production_position;
        v_link_inserted := found;
        v_linked_microsequence_id := v_step.target_didactic_microsequence_id;
        if exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = p_course_id
            and membership.authoring_part_id = p_authoring_part_id
          group by membership.course_id, membership.authoring_part_id
          having min(membership.production_position) <> 0
            or max(membership.production_position) <> count(*) - 1
            or count(distinct membership.production_position) <> count(*)
            or count(*) > 64
        ) then
          raise exception 'A ordem de produção da Parte deve ser contígua entre 0 e 63.'
            using errcode = '23514';
        end if;
        if (
          select count(*)
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = p_course_id
        ) > 192 then
          raise exception 'O plano excede 192 vínculos de microssequência.'
            using errcode = '23514';
        end if;
        if v_link_inserted then
          update private.course_authoring_parts part
          set version = part.version + 1, updated_at = now()
          where part.course_id = p_course_id and part.id = p_authoring_part_id
          returning * into v_part;
          update private.course_instructional_plans plan
          set version = plan.version + 1, updated_at = now()
          where plan.id = v_plan.id
          returning * into v_plan;
        end if;
      end if;
      update private.course_authoring_part_materialization_steps step
      set status = p_payload->>'status',
          result_facts = p_payload->'resultFacts',
          version = step.version + 1,
          updated_at = now(),
          completed_at = now()
      where step.id = v_step.id
      returning * into v_step;
      update private.course_authoring_part_materializations materialization
      set authoring_part_version = v_part.version,
          version = materialization.version + 1,
          updated_at = now()
      where materialization.id = p_materialization_id
      returning * into v_materialization;
      v_activity_kind := 'materialization_step_recorded';
    else
      if p_payload->>'status' = 'completed' and (
        exists(
          select 1 from private.course_authoring_part_materialization_steps step
          where step.materialization_id = p_materialization_id
            and step.status <> 'completed'
        ) or not exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = p_course_id
            and membership.authoring_part_id = p_authoring_part_id
        )
      ) then
        raise exception 'A materialização ainda possui etapas pendentes ou sem conteúdo.'
          using errcode = '23514';
      end if;
      update private.course_authoring_part_materializations materialization
      set status = p_payload->>'status',
          result_facts = p_payload->'resultFacts',
          version = materialization.version + 1,
          updated_at = now(),
          completed_at = now()
      where materialization.id = p_materialization_id
      returning * into v_materialization;
      v_activity_kind := 'materialization_finished';
    end if;
  end if;

  update public.courses course
  set revision = course.revision + 1, updated_at = now()
  where course.id = p_course_id
  returning * into v_course;

  select
    count(*)::integer,
    count(*) filter(where step.status = 'completed')::integer,
    count(*) filter(where step.status = 'failed')::integer
  into v_total_step_count, v_completed_step_count, v_failed_step_count
  from private.course_authoring_part_materialization_steps step
  where step.materialization_id = p_materialization_id;
  select jsonb_build_object(
    'id', step.id,
    'position', step.position,
    'kind', step.step_kind,
    'targetDidacticMicrosequenceId', step.target_didactic_microsequence_id,
    'productionPosition', step.production_position
  ) into v_next_step
  from private.course_authoring_part_materialization_steps step
  where step.materialization_id = p_materialization_id
    and step.status = 'pending'
  order by step.position, step.id limit 1;

  insert into private.course_events(
    course_id, revision, operation, summary, actor_id
  ) values(
    p_course_id,
    v_course.revision,
    'advance_course_authoring_part_materialization',
    jsonb_build_object(
      'activityKind', v_activity_kind,
      'channel', p_channel,
      'instructionalPlanId', v_plan.id,
      'planVersion', v_plan.version,
      'authoringPartId', p_authoring_part_id,
      'authoringPartVersion', v_part.version,
      'materializationId', p_materialization_id,
      'materializationVersion', v_materialization.version,
      'stepId', case when p_operation = 'record_step' then v_step.id else null end,
      'createdCount', v_created_count,
      'updatedCount', v_updated_count,
      'deletedCount', v_deleted_count
    ),
    p_actor_id
  );

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-authoring-materialization-change.v1',
    'courseId', p_course_id,
    'courseRevision', v_course.revision,
    'authoringPartId', p_authoring_part_id,
    'operation', p_operation,
    'channel', p_channel,
    'changed', v_changed,
    'idempotent', false,
    'materialization', jsonb_build_object(
      'id', v_materialization.id,
      'status', v_materialization.status,
      'version', v_materialization.version,
      'authoringPartVersion', v_materialization.authoring_part_version,
      'completedStepCount', v_completed_step_count,
      'failedStepCount', v_failed_step_count,
      'totalStepCount', v_total_step_count,
      'nextPendingStep', v_next_step,
      'updatedAt', v_materialization.updated_at,
      'completedAt', v_materialization.completed_at
    ),
    'step', case when p_operation = 'record_step' then jsonb_build_object(
      'id', v_step.id,
      'status', v_step.status,
      'version', v_step.version
    ) else null end,
    'entities', jsonb_build_object(
      'createdCount', v_created_count,
      'updatedCount', v_updated_count,
      'deletedCount', v_deleted_count,
      'linkedDidacticMicrosequenceId', v_linked_microsequence_id
    )
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'advance_authoring_part_materialization',
    p_course_id, v_hash, v_result
  );
  return v_result;
end;
$function$;

create or replace function private.list_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;
  with accessible as materialized (
    select course.id, course.title, course.goal, course.revision,
      course.created_at, course.updated_at,
      private.course_ownership_v1(course.id, p_actor_id) as ownership
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id = course.id
    where private.course_ownership_v1(course.id, p_actor_id) is not null
      and (
        nullif(btrim(p_query), '') is null
        or lower(course.title || ' ' || course.goal || ' ' || case
          when course.owner_id = p_actor_id then plan.authoring_guidance
          else '' end) like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at, course.id) < (p_before_updated_at, p_before_id)
      )
    order by course.updated_at desc, course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from accessible order by updated_at desc, id desc limit p_limit
  ), projected as (
    select page.*,
      count(entity.course_id) filter(where entity.entity_type = 'module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type = 'lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type = 'topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type = 'microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type = 'card')::integer
        as study_unit_count,
      coalesce((
        select count(distinct study_unit.entity_id)
        from public.course_personal_states personal_state
        cross join lateral jsonb_each(coalesce(
          personal_state.state#>'{progress,lessons}', '{}'::jsonb
        )) lesson(path, value)
        cross join lateral jsonb_array_elements_text(
          lesson.value->'completedStudyUnitIds'
        ) completed(study_unit_id)
        join private.course_entities study_unit
          on study_unit.course_id = page.id
         and study_unit.entity_type = 'card'
         and study_unit.entity_id = completed.study_unit_id
        where personal_state.course_id = page.id
          and personal_state.user_id = p_actor_id
      ), 0)::integer as completed_study_unit_count
    from page
    left join private.course_entities entity on entity.course_id = page.id
    group by page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at, page.ownership
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', projected.id,
    'title', projected.title,
    'goal', projected.goal,
    'revision', projected.revision,
    'ownership', projected.ownership,
    'canEdit', projected.ownership = 'owned',
    'moduleCount', projected.module_count,
    'lessonCount', projected.lesson_count,
    'topicCount', projected.topic_count,
    'microsequenceCount', projected.microsequence_count,
    'studyUnitCount', projected.study_unit_count,
    'completedStudyUnitCount', projected.completed_study_unit_count,
    'updatedAt', projected.updated_at
  ) order by projected.updated_at desc, projected.id desc), '[]'::jsonb),
    (select count(*) from accessible) > p_limit,
    case when (select count(*) from accessible) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      ) from page order by page.updated_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from projected;
  return jsonb_build_object(
    'contract', 'aralearn.course-list.v1',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create or replace function public.list_owned_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;
  with owned as materialized (
    select course.*
    from public.courses course
    join private.course_instructional_plans plan on plan.course_id = course.id
    where course.owner_id = p_actor_id
      and (
        nullif(btrim(p_query), '') is null
        or lower(course.title || ' ' || course.goal || ' ' ||
          plan.authoring_guidance) like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at, course.id) < (p_before_updated_at, p_before_id)
      )
    order by course.updated_at desc, course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from owned order by updated_at desc, id desc limit p_limit
  ), projected as (
    select page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at,
      count(entity.course_id) filter(where entity.entity_type = 'module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type = 'lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type = 'topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type = 'microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type = 'card')::integer
        as study_unit_count
    from page
    left join private.course_entities entity on entity.course_id = page.id
    group by page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'courseId', projected.id,
    'title', projected.title,
    'goal', projected.goal,
    'revision', projected.revision,
    'ownership', 'owned',
    'canEdit', true,
    'moduleCount', projected.module_count,
    'lessonCount', projected.lesson_count,
    'topicCount', projected.topic_count,
    'microsequenceCount', projected.microsequence_count,
    'studyUnitCount', projected.study_unit_count,
    'updatedAt', projected.updated_at
  ) order by projected.updated_at desc, projected.id desc), '[]'::jsonb),
    (select count(*) from owned) > p_limit,
    case when (select count(*) from owned) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      ) from page order by page.updated_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor from projected;
  return jsonb_build_object(
    'contract', 'aralearn.course-list.v1',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create or replace function private.get_course_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_include_outline boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course public.courses%rowtype;
  v_ownership text;
  v_module_count integer;
  v_lesson_count integer;
  v_topic_count integer;
  v_microsequence_count integer;
  v_study_unit_count integer;
  v_modules jsonb;
  v_result jsonb;
begin
  if p_include_outline is null then
    raise exception 'Visualização do Curso inválida.' using errcode = '22023';
  end if;
  v_ownership := private.require_course_access_v1(
    p_course_id, p_actor_id, false
  );
  select * into strict v_course
  from public.courses course where course.id = p_course_id;
  select
    count(*) filter(where entity_type = 'module')::integer,
    count(*) filter(where entity_type = 'lesson')::integer,
    count(*) filter(where entity_type = 'topic')::integer,
    count(*) filter(where entity_type = 'microsequence')::integer,
    count(*) filter(where entity_type = 'card')::integer
  into v_module_count, v_lesson_count, v_topic_count,
    v_microsequence_count, v_study_unit_count
  from private.course_entities entity where entity.course_id = p_course_id;
  if p_include_outline then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', module_value.entity_id,
      'title', coalesce(
        nullif(module_value.content->>'title', ''), module_value.entity_id
      ),
      'lessons', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', lesson.entity_id,
          'title', coalesce(
            nullif(lesson.content->>'title', ''), lesson.entity_id
          ),
          'topics', coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', topic.entity_id,
              'title', coalesce(
                nullif(topic.content->>'title', ''), topic.entity_id
              ),
              'summary', nullif(topic.content->>'summary', '')
            )) order by topic.position, topic.entity_id)
            from private.course_entities topic
            where topic.course_id = p_course_id
              and topic.entity_type = 'topic'
              and topic.parent_type = 'lesson'
              and topic.parent_id = lesson.entity_id
          ), '[]'::jsonb),
          'microsequences', coalesce((
            select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
              'id', microsequence.entity_id,
              'title', coalesce(
                nullif(microsequence.content->>'title', ''),
                microsequence.entity_id
              ),
              'goal', nullif(microsequence.content->>'goal', ''),
              'role', nullif(microsequence.content->>'role', ''),
              'studyUnitCount', (
                select count(*)::integer
                from private.course_entities study_unit
                where study_unit.course_id = p_course_id
                  and study_unit.entity_type = 'card'
                  and study_unit.parent_type = 'microsequence'
                  and study_unit.parent_id = microsequence.entity_id
              )
            )) order by microsequence.position, microsequence.entity_id)
            from private.course_entities microsequence
            where microsequence.course_id = p_course_id
              and microsequence.entity_type = 'microsequence'
              and microsequence.parent_type = 'lesson'
              and microsequence.parent_id = lesson.entity_id
          ), '[]'::jsonb)
        ) order by lesson.position, lesson.entity_id)
        from private.course_entities lesson
        where lesson.course_id = p_course_id
          and lesson.entity_type = 'lesson'
          and lesson.parent_type = 'module'
          and lesson.parent_id = module_value.entity_id
      ), '[]'::jsonb)
    ) order by module_value.position, module_value.entity_id), '[]'::jsonb)
    into v_modules
    from private.course_entities module_value
    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null;
  end if;
  v_result := jsonb_build_object(
    'contract', 'aralearn.course.v1',
    'courseId', v_course.id,
    'title', v_course.title,
    'goal', v_course.goal,
    'revision', v_course.revision,
    'ownership', v_ownership,
    'canEdit', v_ownership = 'owned',
    'counts', jsonb_build_object(
      'moduleCount', v_module_count,
      'lessonCount', v_lesson_count,
      'topicCount', v_topic_count,
      'microsequenceCount', v_microsequence_count,
      'studyUnitCount', v_study_unit_count
    ),
    'createdAt', v_course.created_at,
    'updatedAt', v_course.updated_at
  );
  if p_include_outline then
    v_result := v_result || jsonb_build_object(
      'outline', jsonb_build_object(
        'courseId', v_course.id,
        'title', v_course.title,
        'goal', v_course.goal,
        'modules', v_modules
      )
    );
  end if;
  return v_result;
end;
$function$;

create function public.create_course_for_actor_v1(
  p_actor_id uuid,
  p_title text,
  p_objective text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or not exists(select 1 from auth.users account where account.id = p_actor_id)
     or coalesce(p_title ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_title)) > 300
     or translate(btrim(p_title), E'\n\r\t', '') ~ '[[:cntrl:]]'
     or coalesce(p_objective ~ '[^[:space:]]', false) is not true
     or char_length(btrim(p_objective)) > 2000
     or translate(btrim(p_objective), E'\n\r\t', '') ~ '[[:cntrl:]]'
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Criação de Curso inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', 'create_course',
    'actorId', p_actor_id,
    'title', btrim(p_title),
    'objective', btrim(p_objective)
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'create_course'
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;
  insert into public.courses(id, owner_id, title, goal, revision)
  values(
    extensions.gen_random_uuid(), p_actor_id,
    btrim(p_title), btrim(p_objective), 1
  ) returning * into v_course;
  insert into private.course_instructional_plans(
    course_id, audience, instructional_scope, authoring_guidance,
    preferred_authoring_part_min, preferred_authoring_part_max,
    part_count_origin, version
  ) values(
    v_course.id, '', '', '', 7, 12, 'automatic', 1
  ) returning * into v_plan;
  insert into private.course_events(
    course_id, revision, operation, summary, actor_id
  ) values(
    v_course.id, v_course.revision, 'create_course',
    jsonb_build_object(
      'changeKind', 'course_initialized',
      'instructionalPlanId', v_plan.id,
      'createdCount', 0,
      'updatedCount', 0,
      'deletedCount', 0
    ),
    p_actor_id
  );
  v_result := jsonb_build_object(
    'courseId', v_course.id,
    'title', v_course.title,
    'goal', v_course.goal,
    'revision', v_course.revision,
    'instructionalPlanId', v_plan.id,
    'instructionalPlanVersion', v_plan.version,
    'ownership', 'owned',
    'idempotent', false,
    'createdAt', v_course.created_at,
    'updatedAt', v_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'create_course',
    v_course.id, v_hash, v_result
  );
  return v_result;
end;
$function$;

create function public.commit_course_composition_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_upserts jsonb,
  p_deletes jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_upserts jsonb := coalesce(p_upserts, '[]'::jsonb);
  v_deletes jsonb := coalesce(p_deletes, '[]'::jsonb);
  v_created_count integer := 0;
  v_updated_count integer := 0;
  v_deleted_count integer := 0;
  v_before_entity_count integer;
  v_changed boolean;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(v_upserts) is distinct from 'array'
     or jsonb_typeof(v_deletes) is distinct from 'array'
     or jsonb_array_length(v_upserts) > 200
     or jsonb_array_length(v_deletes) > 200
     or jsonb_array_length(v_upserts) + jsonb_array_length(v_deletes) < 1
     or pg_column_size(jsonb_build_object(
       'upserts', v_upserts, 'deletes', v_deletes
     )) > 524288 then
    raise exception 'Lote de composição do Curso inválido.' using errcode = '22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(v_upserts) item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or item.value - 'entityType' - 'entityId' - 'parentType'
        - 'parentId' - 'position' - 'content' <> '{}'::jsonb
      or not (item.value ?& array[
        'entityType', 'entityId', 'parentType', 'parentId',
        'position', 'content'
      ])
      or item.value->>'entityType' not in (
        'module', 'lesson', 'topic', 'microsequence', 'card'
      )
      or nullif(btrim(item.value->>'entityId'), '') is null
      or item.value->>'entityId' <> btrim(item.value->>'entityId')
      or char_length(item.value->>'entityId') > 240
      or item.value->>'entityId' ~ '[[:cntrl:]]'
      or jsonb_typeof(item.value->'position') is distinct from 'number'
      or item.value->>'position' !~ '^-?[0-9]+$'
      or jsonb_typeof(item.value->'content') is distinct from 'object'
      or (
        item.value->>'entityType' in ('module', 'lesson', 'microsequence')
        and (
          jsonb_typeof(item.value->'content'->'title')
            is distinct from 'string'
          or coalesce(
            item.value#>>'{content,title}' ~ '[^[:space:]]', false
          ) is not true
          or char_length(item.value#>>'{content,title}') > 300
          or translate(item.value#>>'{content,title}', E'\n\r\t', '')
            ~ '[[:cntrl:]]'
        )
      )
  ) or exists(
    select 1 from jsonb_array_elements(v_deletes) item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
      or item.value - 'entityType' - 'entityId' <> '{}'::jsonb
      or not (item.value ?& array['entityType', 'entityId'])
      or item.value->>'entityType' not in (
        'module', 'lesson', 'topic', 'microsequence', 'card'
      )
      or nullif(btrim(item.value->>'entityId'), '') is null
      or item.value->>'entityId' <> btrim(item.value->>'entityId')
      or char_length(item.value->>'entityId') > 240
      or item.value->>'entityId' ~ '[[:cntrl:]]'
  ) or (
    select count(*) <> count(distinct (
      item.value->>'entityType', item.value->>'entityId'
    )) from jsonb_array_elements(v_upserts) item(value)
  ) or (
    select count(*) <> count(distinct (
      item.value->>'entityType', item.value->>'entityId'
    )) from jsonb_array_elements(v_deletes) item(value)
  ) or exists(
    select 1
    from jsonb_array_elements(v_upserts) upsert_item(value)
    join jsonb_array_elements(v_deletes) delete_item(value)
      on delete_item.value->>'entityType' = upsert_item.value->>'entityType'
     and delete_item.value->>'entityId' = upsert_item.value->>'entityId'
  ) then
    raise exception 'Entidade da composição inválida ou repetida.'
      using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'expectedRevision', p_expected_revision,
    'upserts', v_upserts,
    'deletes', v_deletes
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_course_composition'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text, 0
  ));
  select * into strict v_course
  from public.courses course where course.id = p_course_id for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar.'
      using errcode = '40001';
  end if;
  select count(*)::integer into v_before_entity_count
  from private.course_entities entity where entity.course_id = p_course_id;
  select
    count(*) filter(where entity.course_id is null)::integer,
    count(*) filter(
      where entity.course_id is not null
        and row(
          entity.parent_type, entity.parent_id,
          entity.position, entity.content
        ) is distinct from row(
          nullif(item.value->>'parentType', ''),
          nullif(item.value->>'parentId', ''),
          (item.value->>'position')::integer,
          item.value->'content'
        )
    )::integer
  into v_created_count, v_updated_count
  from jsonb_array_elements(v_upserts) item(value)
  left join private.course_entities entity
    on entity.course_id = p_course_id
   and entity.entity_type = item.value->>'entityType'
   and entity.entity_id = item.value->>'entityId';
  delete from private.course_entities entity
  using jsonb_array_elements(v_deletes) deletion(value)
  where entity.course_id = p_course_id
    and entity.entity_type = deletion.value->>'entityType'
    and entity.entity_id = deletion.value->>'entityId';
  select v_before_entity_count - count(*)::integer
  into v_deleted_count
  from private.course_entities entity where entity.course_id = p_course_id;
  insert into private.course_entities(
    course_id, entity_type, entity_id, parent_type, parent_id,
    position, content, version, created_at, updated_at
  )
  select p_course_id, item.value->>'entityType', item.value->>'entityId',
    nullif(item.value->>'parentType', ''),
    nullif(item.value->>'parentId', ''),
    (item.value->>'position')::integer, item.value->'content',
    1, now(), now()
  from jsonb_array_elements(v_upserts) item(value)
  on conflict(course_id, entity_type, entity_id) do update set
    parent_type = excluded.parent_type,
    parent_id = excluded.parent_id,
    position = excluded.position,
    content = excluded.content,
    version = private.course_entities.version + 1,
    updated_at = now()
  where row(
    private.course_entities.parent_type,
    private.course_entities.parent_id,
    private.course_entities.position,
    private.course_entities.content
  ) is distinct from row(
    excluded.parent_type, excluded.parent_id,
    excluded.position, excluded.content
  );
  if exists(
    select 1 from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.parent_type is not null
      and not exists(
        select 1 from private.course_entities parent
        where parent.course_id = entity.course_id
          and parent.entity_type = entity.parent_type
          and parent.entity_id = entity.parent_id
      )
  ) or exists(
    select 1 from private.course_entities entity
    where entity.course_id = p_course_id and entity.entity_type <> 'card'
    group by entity.parent_type, entity.parent_id, entity.entity_type
    having min(entity.position) <> 0
      or max(entity.position) <> count(*) - 1
      or count(distinct entity.position) <> count(*)
  ) then
    raise exception 'A alteração produziria estrutura de Curso inválida.'
      using errcode = '23514';
  end if;
  v_changed := v_created_count + v_updated_count + v_deleted_count > 0;
  if v_changed then
    update public.courses course
    set revision = course.revision + 1, updated_at = now()
    where course.id = p_course_id returning * into v_course;
    insert into private.course_events(
      course_id, revision, operation, summary, actor_id
    ) values(
      p_course_id, v_course.revision, 'replace_course_composition',
      jsonb_build_object(
        'changeKind', 'course_composition_replaced',
        'createdCount', v_created_count,
        'updatedCount', v_updated_count,
        'deletedCount', v_deleted_count
      ),
      p_actor_id
    );
  end if;
  v_result := jsonb_build_object(
    'courseId', p_course_id,
    'revision', v_course.revision,
    'operation', 'commit_course_composition',
    'createdCount', v_created_count,
    'updatedCount', v_updated_count,
    'upsertedCount', v_created_count + v_updated_count,
    'deletedCount', v_deleted_count,
    'idempotent', false,
    'updatedAt', v_course.updated_at
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, 'commit_course_composition',
    p_course_id, v_hash, v_result
  );
  return v_result;
end;
$function$;

create or replace function public.delete_my_account_v1(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, storage
set statement_timeout = '60s'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmação inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'account-delete:' || v_user_id::text, 0
  ));
  if exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'person-avatars'
      and split_part(object_value.name, '/', 1) = v_user_id::text
  ) then
    raise exception 'Remova os objetos privados de avatar antes de excluir a conta.'
      using errcode = '23514';
  end if;
  delete from public.course_access access_value
  where access_value.granted_by = v_user_id;
  update private.course_events event_value
  set summary = (event_value.summary - 'targetUserId') ||
    jsonb_build_object('targetAccountDeleted', true)
  where event_value.summary->>'targetUserId' = v_user_id::text;
  update private.course_change_receipts receipt
  set result = jsonb_set(
    receipt.result,
    '{person}',
    jsonb_build_object('accountDeleted', true),
    false
  )
  where receipt.result#>>'{person,userId}' = v_user_id::text;

  -- A conta elimina seus Cursos na mesma instrução. Retirar primeiro as
  -- relações novas evita depender da ordem interna entre cascades paralelos
  -- de Parte e de entidade sem transformar o vínculo didático em cascade.
  delete from private.course_authoring_part_didactic_microsequences membership
  using public.courses course
  where course.owner_id = v_user_id
    and membership.course_id = course.id;
  delete from private.course_authoring_part_materializations materialization
  using public.courses course
  where course.owner_id = v_user_id
    and materialization.course_id = course.id;

  delete from auth.users auth_user where auth_user.id = v_user_id;
  if not found then
    raise exception 'Conta inexistente.' using errcode = 'PT404';
  end if;
  return jsonb_build_object(
    'contract', 'aralearn.account-deletion.v1',
    'status', 'deleted'
  );
end;
$function$;

comment on table private.course_instructional_plans is
  'Plano instrucional consultável do Curso; título e objetivo permanecem em public.courses.';
comment on table private.course_instructional_plan_items is
  'Resultados pretendidos, unidades de análise instrucional e requisitos de evidência com UUID estável.';
comment on table private.course_authoring_parts is
  'Recortes operacionais de produção fora da hierarquia didática do Curso.';
comment on table private.course_authoring_part_didactic_microsequences is
  'Vínculos reais de Parte a microssequência; production_position não define ordem curricular.';
comment on table private.course_authoring_part_materializations is
  'Tentativas retomáveis e limitadas de materialização de uma Parte de Autoria.';
comment on table private.course_authoring_part_materialization_steps is
  'Etapas idempotentes de uma materialização, sem prompt, conversa ou raciocínio privado.';

revoke all on function private.course_instructional_plan_command_document_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.course_authoring_part_progress_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.delete_course_authoring_relations_before_course_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.get_course_instructional_plan_for_actor_v1(
  uuid, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_owned_course_instructional_plan_for_actor_v1(
  uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.get_owned_course_instructional_plan_for_actor_v1(
  uuid, uuid, integer
) to service_role;
revoke all on function public.get_owned_course_instructional_plan_v1(
  uuid, integer
) from public, anon, service_role;
grant execute on function public.get_owned_course_instructional_plan_v1(
  uuid, integer
) to authenticated;
revoke all on function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid, uuid, uuid, uuid
) to service_role;
revoke all on function public.commit_course_instructional_plan_for_actor_v1(
  uuid, uuid, bigint, bigint, jsonb, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.commit_course_instructional_plan_for_actor_v1(
  uuid, uuid, bigint, bigint, jsonb, jsonb, text, text
) to service_role;
revoke all on function public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid, uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid, uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text
) to service_role;
revoke all on function public.create_course_for_actor_v1(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_course_for_actor_v1(
  uuid, text, text, text
) to service_role;
revoke all on function public.commit_course_composition_for_actor_v1(
  uuid, uuid, bigint, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.commit_course_composition_for_actor_v1(
  uuid, uuid, bigint, jsonb, jsonb, text
) to service_role;
revoke all on function public.delete_my_account_v1(text)
  from public, anon, service_role;
grant execute on function public.delete_my_account_v1(text)
  to authenticated;

do $advance_course_instructional_plan_runtime_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817150000'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente ao plano instrucional.'
      using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal)
  into v_features
  from (
    select existing.value, existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value, ordinal)
    union all
    select 'course-instructional-plan-v1', 1000000::bigint
    union all
    select 'course-authoring-part-materialization-v1', 1000001::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision', '20260817160000',
    'contractVersion', 1,
    'features', v_features
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public, anon, authenticated, service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon, authenticated, service_role;
end;
$advance_course_instructional_plan_runtime_manifest$;

commit;
