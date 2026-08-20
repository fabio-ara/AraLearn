-- #121: corte canônico de Unidade de estudo e leitura autoral vertical.
-- Parte de autoria delimita produção; nunca participa da ordem curricular.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-study-unit-inspection-v1', 0
));

do $course_study_unit_inspection_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_authoring_parts') is null
     or to_regclass(
       'private.course_authoring_part_didactic_microsequences'
     ) is null then
    raise exception 'Estruturas canônicas de Curso ausentes.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817160000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ? 'course-instructional-plan-v1') then
    raise exception 'Manifesto anterior à inspeção de Unidades é incompatível.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.course_entities entity
    where entity.entity_type = 'card'
      and octet_length(entity.content::text) > 1048576
  ) then
    raise exception 'Uma Unidade legada excede o limite serializado de 1 MiB.'
      using errcode = '54000';
  end if;
  if exists(
    select 1
    from private.course_entities entity
    where entity.entity_type = 'card'
      and (
        jsonb_typeof(entity.content->'title') is distinct from 'string'
        or not coalesce(entity.content->>'title' ~ '[^[:space:]]', false)
        or char_length(entity.content->>'title') > 300
        or translate(entity.content->>'title', E'\n\r\t', '')
          ~ '[[:cntrl:]]'
      )
  ) then
    raise exception 'Uma Unidade legada possui título inválido.'
      using errcode = '23514';
  end if;
end;
$course_study_unit_inspection_preflight$;

lock table public.courses in share row exclusive mode;
lock table private.course_entities in share row exclusive mode;
lock table private.course_authoring_parts in share row exclusive mode;
lock table private.course_authoring_part_didactic_microsequences
  in share row exclusive mode;

alter table private.course_entities
  drop constraint course_entities_type_v1,
  drop constraint course_entities_parent_v1,
  drop constraint course_entities_position_v1,
  drop constraint course_entities_content_v1,
  drop constraint course_entities_parent_fk_v1;

update private.course_entities entity
set entity_type = 'study_unit'
where entity.entity_type = 'card';

alter table private.course_entities
  add constraint course_entities_type_v1 check(entity_type in (
    'module', 'lesson', 'topic', 'microsequence', 'study_unit'
  )),
  add constraint course_entities_parent_v1 check(
    (entity_type = 'module' and parent_type is null and parent_id is null)
    or (entity_type = 'lesson' and parent_type = 'module' and parent_id is not null)
    or (entity_type = 'topic' and parent_type = 'lesson' and parent_id is not null)
    or (
      entity_type = 'microsequence'
      and parent_type = 'lesson'
      and parent_id is not null
    )
    or (
      entity_type = 'study_unit'
      and parent_type = 'microsequence'
      and parent_id is not null
    )
  ),
  add constraint course_entities_position_v1 check(
    (entity_type = 'study_unit' and position > 0)
    or (entity_type <> 'study_unit' and position >= 0)
  ),
  add constraint course_entities_content_v1 check(
    jsonb_typeof(content) = 'object'
    and not (content ? 'id')
    and not (content ? 'position')
    and not (entity_type = 'module' and content ? 'lessons')
    and not (
      entity_type = 'lesson'
      and (content ? 'topics' or content ? 'microsequences')
    )
    and not (
      entity_type = 'microsequence'
      and (content ? 'studyUnits' or content ? 'cards')
    )
    and pg_column_size(content) <= 1048576
    and (
      entity_type <> 'study_unit'
      or octet_length(content::text) <= 1048576
    )
    and (
      entity_type not in (
        'module', 'lesson', 'microsequence', 'study_unit'
      )
      or (
        jsonb_typeof(content->'title') = 'string'
        and coalesce(content->>'title' ~ '[^[:space:]]', false)
        and char_length(content->>'title') <= 300
        and translate(content->>'title', E'\n\r\t', '')
          !~ '[[:cntrl:]]'
      )
    )
  ),
  add constraint course_entities_parent_fk_v1 foreign key (
    course_id, parent_type, parent_id
  ) references private.course_entities(course_id, entity_type, entity_id)
    on delete cascade deferrable initially deferred;

create function private.assert_course_lesson_dependencies_v1(
  p_course_id uuid,
  p_lesson_ids text[]
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_lesson_ids text[] := coalesce(p_lesson_ids, '{}'::text[]);
begin
  if p_course_id is null or cardinality(v_lesson_ids) = 0 then
    return;
  end if;
  if exists(
    select 1
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.parent_type = 'lesson'
      and microsequence.parent_id = any(v_lesson_ids)
      and jsonb_typeof(microsequence.content->'dependsOn')
        is distinct from 'array'
  ) then
    raise exception 'dependsOn deve ser uma lista em cada Microssequência afetada.'
      using errcode = '23514';
  end if;
  if exists(
    select 1
    from private.course_entities microsequence
    cross join lateral jsonb_array_elements(
      microsequence.content->'dependsOn'
    ) dependency(value)
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.parent_type = 'lesson'
      and microsequence.parent_id = any(v_lesson_ids)
      and (
        jsonb_typeof(dependency.value) is distinct from 'string'
        or nullif(btrim(dependency.value #>> '{}'), '') is null
      )
  ) or exists(
    select 1
    from private.course_entities microsequence
    cross join lateral jsonb_array_elements(
      microsequence.content->'dependsOn'
    ) dependency(value)
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.parent_type = 'lesson'
      and microsequence.parent_id = any(v_lesson_ids)
    group by microsequence.entity_id,
      lower(btrim(dependency.value #>> '{}'))
    having count(*) > 1
  ) then
    raise exception 'dependsOn contém identidade inválida ou repetida.'
      using errcode = '23514';
  end if;
  if exists(
    select 1
    from private.course_entities microsequence
    cross join lateral jsonb_array_elements(
      microsequence.content->'dependsOn'
    ) dependency_value(value)
    left join private.course_entities dependency
      on dependency.course_id = microsequence.course_id
     and dependency.entity_type = 'microsequence'
     and dependency.parent_type = 'lesson'
     and dependency.parent_id = microsequence.parent_id
     and dependency.entity_id = btrim(dependency_value.value #>> '{}')
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.parent_type = 'lesson'
      and microsequence.parent_id = any(v_lesson_ids)
      and (
        dependency.course_id is null
        or dependency.position >= microsequence.position
      )
  ) then
    raise exception 'dependsOn deve apontar para Microssequência anterior da mesma Lição.'
      using errcode = '23514';
  end if;
end;
$function$;

revoke all on function private.assert_course_lesson_dependencies_v1(
  uuid, text[]
) from public, anon, authenticated, service_role;

do $validate_existing_course_lesson_dependencies$
declare
  v_course record;
begin
  for v_course in
    select lesson.course_id,
      array_agg(lesson.entity_id order by lesson.entity_id) as lesson_ids
    from private.course_entities lesson
    where lesson.entity_type = 'lesson'
    group by lesson.course_id
  loop
    perform private.assert_course_lesson_dependencies_v1(
      v_course.course_id, v_course.lesson_ids
    );
  end loop;
end;
$validate_existing_course_lesson_dependencies$;

-- As funções correntes foram definidas nas migrations anteriores ainda com o
-- discriminador legado. A substituição abaixo é a transformação única do
-- corte; o catálogo final das funções aceita somente study_unit.
do $replace_current_course_study_unit_discriminator$
declare
  v_signature text;
  v_oid regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'private.course_authoring_part_progress_v1(uuid,uuid)',
    'private.get_course_for_actor_v1(uuid,uuid,boolean)',
    'private.get_course_instructional_plan_for_actor_v1(uuid,uuid,integer)',
    'private.list_course_entities_for_actor_v1(uuid,uuid,bigint,integer,text,text)',
    'private.list_course_review_items_for_actor_v1(uuid,integer,timestamptz,uuid,text)',
    'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)',
    'public.list_owned_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)',
    'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)',
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Função corrente ausente: %', v_signature
        using errcode = '55000';
    end if;
    select pg_get_functiondef(v_oid::oid) into v_definition;
    if strpos(v_definition, quote_literal('card')) = 0 then
      raise exception 'Função sem discriminador esperado: %', v_signature
        using errcode = '55000';
    end if;
    v_definition := replace(
      v_definition,
      quote_literal('card'),
      quote_literal('study_unit')
    );
    if v_signature =
        'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text)' then
      if strpos(v_definition, $commit_declare$
  v_changed boolean;
  v_result jsonb;
$commit_declare$) = 0
         or strpos(v_definition, $commit_before_count$
  select count(*)::integer into v_before_entity_count
  from private.course_entities entity where entity.course_id = p_course_id;
$commit_before_count$) = 0
         or strpos(v_definition, $commit_changed$
  v_changed := v_created_count + v_updated_count + v_deleted_count > 0;
$commit_changed$) = 0 then
        raise exception 'Pontos de cerca da composição não foram encontrados.'
          using errcode = '55000';
      end if;
      v_definition := replace(v_definition, $commit_declare$
  v_changed boolean;
  v_result jsonb;
$commit_declare$, $commit_declare_replacement$
  v_changed boolean;
  v_affected_lesson_ids text[] := '{}'::text[];
  v_result jsonb;
$commit_declare_replacement$);
      v_definition := replace(v_definition, $commit_before_count$
  select count(*)::integer into v_before_entity_count
  from private.course_entities entity where entity.course_id = p_course_id;
$commit_before_count$, $commit_before_count_replacement$
  select count(*)::integer into v_before_entity_count
  from private.course_entities entity where entity.course_id = p_course_id;
  with changed as materialized (
    select item.value->>'entityType' as entity_type,
      item.value->>'entityId' as entity_id
    from jsonb_array_elements(v_upserts) item(value)
    union all
    select item.value->>'entityType', item.value->>'entityId'
    from jsonb_array_elements(v_deletes) item(value)
  ), current_affected as materialized (
    select case
      when entity.entity_type = 'lesson' then entity.entity_id
      when entity.entity_type in ('topic', 'microsequence')
        then entity.parent_id
      when entity.entity_type = 'study_unit'
        then current_microsequence.parent_id
    end as lesson_id
    from changed
    join private.course_entities entity
      on entity.course_id = p_course_id
     and entity.entity_type = changed.entity_type
     and entity.entity_id = changed.entity_id
    left join private.course_entities current_microsequence
      on entity.entity_type = 'study_unit'
     and current_microsequence.course_id = entity.course_id
     and current_microsequence.entity_type = 'microsequence'
     and current_microsequence.entity_id = entity.parent_id
  ), upsert_microsequence_parents as materialized (
    select item.value->>'entityId' as microsequence_id,
      nullif(item.value->>'parentId', '') as lesson_id
    from jsonb_array_elements(v_upserts) item(value)
    where item.value->>'entityType' = 'microsequence'
  ), next_affected as materialized (
    select case item.value->>'entityType'
      when 'lesson' then item.value->>'entityId'
      when 'topic' then nullif(item.value->>'parentId', '')
      when 'microsequence' then nullif(item.value->>'parentId', '')
      when 'study_unit' then coalesce(
        upsert_parent.lesson_id, current_parent.parent_id
      )
    end as lesson_id
    from jsonb_array_elements(v_upserts) item(value)
    left join upsert_microsequence_parents upsert_parent
      on item.value->>'entityType' = 'study_unit'
     and upsert_parent.microsequence_id = item.value->>'parentId'
    left join private.course_entities current_parent
      on item.value->>'entityType' = 'study_unit'
     and current_parent.course_id = p_course_id
     and current_parent.entity_type = 'microsequence'
     and current_parent.entity_id = item.value->>'parentId'
  ), affected as (
    select lesson_id from current_affected
    union all
    select lesson_id from next_affected
  )
  select coalesce(
    array_agg(distinct affected.lesson_id order by affected.lesson_id),
    '{}'::text[]
  ) into v_affected_lesson_ids
  from affected where affected.lesson_id is not null;
$commit_before_count_replacement$);
      v_definition := replace(v_definition, $commit_changed$
  v_changed := v_created_count + v_updated_count + v_deleted_count > 0;
$commit_changed$, $commit_changed_replacement$
  perform private.assert_course_lesson_dependencies_v1(
    p_course_id, v_affected_lesson_ids
  );
  v_changed := v_created_count + v_updated_count + v_deleted_count > 0;
$commit_changed_replacement$);
    elsif v_signature =
        'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)' then
      if strpos(v_definition, $materialization_declare$
  v_activity_kind text;
  v_result jsonb;
$materialization_declare$) = 0
         or strpos(v_definition, $materialization_before_count$
        select count(*)::integer into v_before_entity_count
        from private.course_entities entity where entity.course_id = p_course_id;
$materialization_before_count$) = 0
         or strpos(v_definition, $materialization_membership$
        insert into private.course_authoring_part_didactic_microsequences(
$materialization_membership$) = 0 then
        raise exception 'Pontos de cerca da materialização não foram encontrados.'
          using errcode = '55000';
      end if;
      v_definition := replace(v_definition, $materialization_declare$
  v_activity_kind text;
  v_result jsonb;
$materialization_declare$, $materialization_declare_replacement$
  v_activity_kind text;
  v_affected_lesson_ids text[] := '{}'::text[];
  v_result jsonb;
$materialization_declare_replacement$);
      v_definition := replace(v_definition, $materialization_before_count$
        select count(*)::integer into v_before_entity_count
        from private.course_entities entity where entity.course_id = p_course_id;
$materialization_before_count$, $materialization_before_count_replacement$
        select count(*)::integer into v_before_entity_count
        from private.course_entities entity where entity.course_id = p_course_id;
        select coalesce(
          array_agg(distinct affected.lesson_id order by affected.lesson_id),
          '{}'::text[]
        ) into v_affected_lesson_ids
        from (
          select microsequence.parent_id as lesson_id
          from private.course_entities microsequence
          where microsequence.course_id = p_course_id
            and microsequence.entity_type = 'microsequence'
            and microsequence.entity_id =
              v_step.target_didactic_microsequence_id
          union all
          select nullif(item.value->>'parentId', '')
          from jsonb_array_elements(v_upserts) item(value)
          where item.value->>'entityType' = 'microsequence'
            and item.value->>'entityId' =
              v_step.target_didactic_microsequence_id
        ) affected
        where affected.lesson_id is not null;
$materialization_before_count_replacement$);
      v_definition := replace(v_definition, $materialization_membership$
        insert into private.course_authoring_part_didactic_microsequences(
$materialization_membership$, $materialization_membership_replacement$
        perform private.assert_course_lesson_dependencies_v1(
          p_course_id, v_affected_lesson_ids
        );
        insert into private.course_authoring_part_didactic_microsequences(
$materialization_membership_replacement$);
    end if;
    execute v_definition;
  end loop;
end;
$replace_current_course_study_unit_discriminator$;

create function private.list_course_study_units_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_scope_kind text default 'course',
  p_scope_id text default null,
  p_anchor_study_unit_id text default null,
  p_cursor_study_unit_id text default null,
  p_direction text default 'forward',
  p_limit integer default 12,
  p_max_bytes integer default 524288
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_course_revision bigint;
  v_scope_part_id uuid;
  v_pivot_study_unit_id text;
  v_pivot_ordinal bigint;
  v_total_count integer;
  v_items jsonb := '[]'::jsonb;
  v_scope_options jsonb;
  v_first_ordinal bigint;
  v_last_ordinal bigint;
  v_first_study_unit_id text;
  v_last_study_unit_id text;
  v_has_previous boolean := false;
  v_has_more boolean := false;
  v_previous_cursor jsonb;
  v_next_cursor jsonb;
  v_page_bytes integer;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_scope_kind is null
     or p_scope_kind not in (
       'course', 'authoring_part', 'unassigned', 'module', 'lesson',
       'didactic_microsequence'
     )
     or p_direction is null or p_direction not in ('forward', 'backward')
     or p_limit is null or p_limit not between 1 and 24
     or p_max_bytes is null or p_max_bytes not between 65536 and 1500000
     or (p_anchor_study_unit_id is not null and p_cursor_study_unit_id is not null)
     or (
       p_scope_kind in ('course', 'unassigned')
       and p_scope_id is not null
     )
     or (
       p_scope_kind not in ('course', 'unassigned')
       and (
         nullif(btrim(p_scope_id), '') is null
         or p_scope_id <> btrim(p_scope_id)
         or char_length(p_scope_id) > 240
         or p_scope_id ~ '[[:cntrl:]]'
       )
     )
     or (
       p_anchor_study_unit_id is not null
       and (
         nullif(btrim(p_anchor_study_unit_id), '') is null
         or p_anchor_study_unit_id <> btrim(p_anchor_study_unit_id)
         or char_length(p_anchor_study_unit_id) > 240
         or p_anchor_study_unit_id ~ '[[:cntrl:]]'
       )
     )
     or (
       p_cursor_study_unit_id is not null
       and (
         nullif(btrim(p_cursor_study_unit_id), '') is null
         or p_cursor_study_unit_id <> btrim(p_cursor_study_unit_id)
         or char_length(p_cursor_study_unit_id) > 240
         or p_cursor_study_unit_id ~ '[[:cntrl:]]'
       )
     ) then
    raise exception 'Consulta de Unidades de estudo inválida.'
      using errcode = '22023';
  end if;
  if p_scope_kind = 'authoring_part' then
    if p_scope_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Identidade da Parte de autoria inválida.'
        using errcode = '22023';
    end if;
    v_scope_part_id := p_scope_id::uuid;
  end if;

  select course.revision into strict v_course_revision
  from public.courses course where course.id = p_course_id;
  if v_course_revision is distinct from p_expected_revision then
    raise exception 'O Curso mudou; releia antes de continuar.'
      using errcode = '40001';
  end if;

  if p_scope_kind = 'authoring_part' and not exists(
    select 1 from private.course_authoring_parts part
    where part.course_id = p_course_id
      and part.id = v_scope_part_id
      and part.retired_at is null
  ) then
    raise exception 'Parte de autoria inexistente no Curso.' using errcode = 'PT404';
  elsif p_scope_kind in ('module', 'lesson', 'didactic_microsequence')
      and not exists(
        select 1 from private.course_entities entity
        where entity.course_id = p_course_id
          and entity.entity_type = case p_scope_kind
            when 'module' then 'module'
            when 'lesson' then 'lesson'
            else 'microsequence'
          end
          and entity.entity_id = p_scope_id
      ) then
    raise exception 'Escopo curricular inexistente no Curso.' using errcode = 'PT404';
  end if;

  v_pivot_study_unit_id := coalesce(
    p_anchor_study_unit_id, p_cursor_study_unit_id
  );

  with ordered as materialized (
    select study_unit.entity_id,
      row_number() over(order by
        module_value.position, module_value.entity_id,
        lesson.position, lesson.entity_id,
        microsequence.position, microsequence.entity_id,
        study_unit.position, study_unit.entity_id
      ) as ordinal
    from private.course_entities module_value
    join private.course_entities lesson
      on lesson.course_id = module_value.course_id
     and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module'
     and lesson.parent_id = module_value.entity_id
    join private.course_entities microsequence
      on microsequence.course_id = lesson.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    join private.course_entities study_unit
      on study_unit.course_id = microsequence.course_id
     and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = microsequence.entity_id
    left join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id = microsequence.course_id
     and membership.didactic_microsequence_id = microsequence.entity_id
    left join private.course_authoring_parts part
      on part.course_id = membership.course_id
     and part.id = membership.authoring_part_id
     and part.retired_at is null
    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then part.id = v_scope_part_id
        when 'unassigned' then part.id is null
        when 'module' then module_value.entity_id = p_scope_id
        when 'lesson' then lesson.entity_id = p_scope_id
        when 'didactic_microsequence' then microsequence.entity_id = p_scope_id
        else false
      end
  )
  select count(*)::integer,
    max(ordered.ordinal) filter(
      where ordered.entity_id = v_pivot_study_unit_id
    )
  into v_total_count, v_pivot_ordinal
  from ordered;

  if v_pivot_study_unit_id is not null and v_pivot_ordinal is null then
    if p_anchor_study_unit_id is not null then
      raise exception 'Unidade âncora inexistente no escopo.'
        using errcode = 'PT404';
    end if;
    raise exception 'Cursor de Unidade não pertence ao escopo.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'authoringParts', coalesce(jsonb_agg(jsonb_build_object(
      'id', part.id,
      'position', part.position,
      'title', part.title,
      'state', private.course_authoring_part_progress_v1(
        part.course_id, part.id
      )->>'state'
    ) order by part.position, part.id), '[]'::jsonb),
    'unassignedStudyUnitCount', (
      select count(*)::integer
      from private.course_entities study_unit
      join private.course_entities microsequence
        on microsequence.course_id = study_unit.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = study_unit.parent_id
      where study_unit.course_id = p_course_id
        and study_unit.entity_type = 'study_unit'
        and not exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
    )
  ) into v_scope_options
  from private.course_authoring_parts part
  where part.course_id = p_course_id and part.retired_at is null;

  with part_rows as materialized (
    select part.id, part.position, part.title,
      private.course_authoring_part_progress_v1(
        part.course_id, part.id
      )->>'state' as state
    from private.course_authoring_parts part
    where part.course_id = p_course_id and part.retired_at is null
  ), ordered as materialized (
    select study_unit.entity_id,
      study_unit.position as study_unit_position,
      study_unit.content as study_unit_content,
      study_unit.version as study_unit_version,
      study_unit.updated_at as study_unit_updated_at,
      module_value.entity_id as module_id,
      module_value.position as module_position,
      module_value.content->>'title' as module_title,
      lesson.entity_id as lesson_id,
      lesson.position as lesson_position,
      lesson.content->>'title' as lesson_title,
      microsequence.entity_id as microsequence_id,
      microsequence.position as microsequence_position,
      microsequence.content->>'title' as microsequence_title,
      part.id as authoring_part_id,
      part.position as authoring_part_position,
      part.title as authoring_part_title,
      part.state as authoring_part_state,
      row_number() over(order by
        module_value.position, module_value.entity_id,
        lesson.position, lesson.entity_id,
        microsequence.position, microsequence.entity_id,
        study_unit.position, study_unit.entity_id
      ) as ordinal
    from private.course_entities module_value
    join private.course_entities lesson
      on lesson.course_id = module_value.course_id
     and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module'
     and lesson.parent_id = module_value.entity_id
    join private.course_entities microsequence
      on microsequence.course_id = lesson.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    join private.course_entities study_unit
      on study_unit.course_id = microsequence.course_id
     and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = microsequence.entity_id
    left join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id = microsequence.course_id
     and membership.didactic_microsequence_id = microsequence.entity_id
    left join part_rows part on part.id = membership.authoring_part_id
    where module_value.course_id = p_course_id
      and module_value.entity_type = 'module'
      and module_value.parent_type is null
      and module_value.parent_id is null
      and case p_scope_kind
        when 'course' then true
        when 'authoring_part' then part.id = v_scope_part_id
        when 'unassigned' then part.id is null
        when 'module' then module_value.entity_id = p_scope_id
        when 'lesson' then lesson.entity_id = p_scope_id
        when 'didactic_microsequence' then microsequence.entity_id = p_scope_id
        else false
      end
  ), candidate_pool as materialized (
    select ordered.*
    from ordered
    where v_pivot_ordinal is null
       or (
         p_direction = 'forward'
         and (
           ordered.ordinal > v_pivot_ordinal
           or (
             p_anchor_study_unit_id is not null
             and ordered.ordinal = v_pivot_ordinal
           )
         )
       )
       or (
         p_direction = 'backward'
         and (
           ordered.ordinal < v_pivot_ordinal
           or (
             p_anchor_study_unit_id is not null
             and ordered.ordinal = v_pivot_ordinal
           )
         )
       )
    order by
      case when p_direction = 'forward' then ordered.ordinal end,
      case when p_direction = 'backward' then ordered.ordinal end desc
    limit p_limit
  ), projected as materialized (
    select candidate_pool.*,
      jsonb_build_object(
        'studyUnit', candidate_pool.study_unit_content || jsonb_build_object(
          'id', candidate_pool.entity_id,
          'position', candidate_pool.study_unit_position
        ),
        'version', candidate_pool.study_unit_version,
        'updatedAt', candidate_pool.study_unit_updated_at,
        'ordinal', candidate_pool.ordinal,
        'curriculumPath', jsonb_build_object(
          'module', jsonb_build_object(
            'id', candidate_pool.module_id,
            'position', candidate_pool.module_position,
            'title', candidate_pool.module_title
          ),
          'lesson', jsonb_build_object(
            'id', candidate_pool.lesson_id,
            'position', candidate_pool.lesson_position,
            'title', candidate_pool.lesson_title
          ),
          'didacticMicrosequence', jsonb_build_object(
            'id', candidate_pool.microsequence_id,
            'position', candidate_pool.microsequence_position,
            'title', candidate_pool.microsequence_title
          )
        ),
        'authoringPart', case
          when candidate_pool.authoring_part_id is null then null
          else jsonb_build_object(
            'id', candidate_pool.authoring_part_id,
            'position', candidate_pool.authoring_part_position,
            'title', candidate_pool.authoring_part_title,
            'state', candidate_pool.authoring_part_state
          )
        end
      ) as item
    from candidate_pool
  ), running as materialized (
    select projected.*,
      row_number() over(order by
        case when p_direction = 'forward' then projected.ordinal end,
        case when p_direction = 'backward' then projected.ordinal end desc
      ) as directional_rank,
      sum(octet_length(projected.item::text)) over(order by
        case when p_direction = 'forward' then projected.ordinal end,
        case when p_direction = 'backward' then projected.ordinal end desc
      ) as cumulative_bytes
    from projected
  ), chosen as materialized (
    select * from running
    where directional_rank = 1
       or cumulative_bytes + directional_rank * 2 <= p_max_bytes
  )
  select
    coalesce(jsonb_agg(chosen.item order by chosen.ordinal), '[]'::jsonb),
    min(chosen.ordinal), max(chosen.ordinal),
    (array_agg(chosen.entity_id order by chosen.ordinal))[1],
    (array_agg(chosen.entity_id order by chosen.ordinal desc))[1]
  into v_items, v_first_ordinal, v_last_ordinal,
    v_first_study_unit_id, v_last_study_unit_id
  from chosen;

  v_has_previous := coalesce(v_first_ordinal > 1, false);
  v_has_more := coalesce(v_last_ordinal < v_total_count, false);
  v_previous_cursor := case when v_has_previous then jsonb_build_object(
    'studyUnitId', v_first_study_unit_id
  ) else null end;
  v_next_cursor := case when v_has_more then jsonb_build_object(
    'studyUnitId', v_last_study_unit_id
  ) else null end;
  v_page_bytes := octet_length(v_items::text);

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-study-unit-inspection-page.v1',
    'courseId', p_course_id,
    'courseRevision', v_course_revision,
    'scope', jsonb_build_object(
      'kind', p_scope_kind,
      'id', case when p_scope_kind in ('course', 'unassigned')
        then null else p_scope_id end
    ),
    'totalCount', v_total_count,
    'scopeOptions', v_scope_options,
    'items', v_items,
    'hasPrevious', v_has_previous,
    'hasMore', v_has_more,
    'previousCursor', v_previous_cursor,
    'nextCursor', v_next_cursor,
    'pageBytes', v_page_bytes
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Página de Unidades excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create function public.list_owned_course_study_units_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_scope_kind text default 'course',
  p_scope_id text default null,
  p_anchor_study_unit_id text default null,
  p_cursor_study_unit_id text default null,
  p_direction text default 'forward',
  p_limit integer default 12,
  p_max_bytes integer default 524288
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select private.list_course_study_units_for_actor_v1(
    p_actor_id,
    p_course_id,
    p_expected_revision,
    p_scope_kind,
    p_scope_id,
    p_anchor_study_unit_id,
    p_cursor_study_unit_id,
    p_direction,
    p_limit,
    p_max_bytes
  )
$function$;

comment on function public.list_owned_course_study_units_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, text, integer, integer
) is 'Lista owner-only de Unidades em ordem curricular, com escopo e página limitados.';

revoke all on function private.list_course_study_units_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, text, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.list_owned_course_study_units_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_owned_course_study_units_for_actor_v1(
  uuid, uuid, bigint, text, text, text, text, text, integer, integer
) to service_role;

do $course_study_unit_inspection_postflight$
declare
  v_signature text;
  v_oid regprocedure;
begin
  if exists(
    select 1 from private.course_entities entity where entity.entity_type = 'card'
  ) then
    raise exception 'O discriminador legado permaneceu nas entidades.'
      using errcode = '55000';
  end if;
  foreach v_signature in array array[
    'private.course_authoring_part_progress_v1(uuid,uuid)',
    'private.get_course_for_actor_v1(uuid,uuid,boolean)',
    'private.get_course_instructional_plan_for_actor_v1(uuid,uuid,integer)',
    'private.list_course_entities_for_actor_v1(uuid,uuid,bigint,integer,text,text)',
    'private.list_course_review_items_for_actor_v1(uuid,integer,timestamptz,uuid,text)',
    'private.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)',
    'public.list_owned_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)',
    'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)',
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text)'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null or strpos(pg_get_functiondef(v_oid::oid), quote_literal('card')) > 0 then
      raise exception 'Função corrente ainda aceita o discriminador legado: %',
      v_signature using errcode = '55000';
    end if;
  end loop;
  if strpos(pg_get_functiondef(
       'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text)'::regprocedure::oid
     ), 'private.assert_course_lesson_dependencies_v1') = 0
     or strpos(pg_get_functiondef(
       'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)'::regprocedure::oid
     ), 'private.assert_course_lesson_dependencies_v1') = 0 then
    raise exception 'A cerca transversal de Lições não foi instalada.'
      using errcode = '55000';
  end if;
end;
$course_study_unit_inspection_postflight$;

do $advance_course_study_unit_inspection_runtime_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817160000'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente à inspeção de Unidades.'
      using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal)
  into v_features
  from (
    select existing.value, existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value, ordinal)
    union all
    select 'course-study-unit-inspection-v1', 1000002::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision', '20260817170000',
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
$advance_course_study_unit_inspection_runtime_manifest$;

commit;
