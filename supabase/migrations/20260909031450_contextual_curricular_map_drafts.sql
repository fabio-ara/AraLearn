begin;

-- O mesmo mapa canônico admite construção incremental. Tipos, identidades e
-- limites são invariantes; público, árvore e grafo completos são exigidos na
-- aprovação. A transformação preserva o writer, seus locks, recibos e grants.
do $draft_shape$
declare
  v_definition text;
  v_change record;
begin
  v_definition:=replace(pg_get_functiondef(
    'private.valid_course_curricular_map_shape_v1(jsonb)'::regprocedure),E'\r\n',E'\n');
  for v_change in select * from (values
    (E'    and nullif(btrim(p_map->>''audience''),'''') is not null\n',''),
    ('jsonb_array_length(p_map->''scopeItems'') between 1 and 256',
     'jsonb_array_length(p_map->''scopeItems'') between 0 and 256'),
    ('jsonb_array_length(p_map->''modules'') between 1 and 64',
     'jsonb_array_length(p_map->''modules'') between 0 and 64'),
    ('jsonb_array_length(module_value.value->''lessons'') not between 1 and 64',
     'jsonb_array_length(module_value.value->''lessons'') not between 0 and 64'),
    ('jsonb_array_length(lesson.value->''microsequences'') not between 1 and 64',
     'jsonb_array_length(lesson.value->''microsequences'') not between 0 and 64')
  ) as changes(before_text,after_text) loop
    if (length(v_definition)-length(replace(v_definition,v_change.before_text,'')))
        /length(v_change.before_text)<>1 then
      raise exception 'Forma precursora do mapa curricular divergiu.' using errcode='55000';
    end if;
    v_definition:=replace(v_definition,v_change.before_text,v_change.after_text);
  end loop;
  execute v_definition;
end $draft_shape$;

do $draft_dependencies$
declare
  v_definition text;
  v_before text:=$before$  if exists(
    select 1
    from private.course_entities current_micro$before$;
begin
  v_definition:=replace(pg_get_functiondef(
    'private.assert_course_lesson_dependencies_v1(uuid,text[])'::regprocedure),E'\r\n',E'\n');
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 then
    raise exception 'Grafo precursor do mapa curricular divergiu.' using errcode='55000';
  end if;
  v_definition:=replace(v_definition,v_before,$after$
  -- O tipo e a unicidade acima continuam obrigatórios em qualquer estado.
  -- Uma pendência no grafo é legível no rascunho persistido; não é aprovação.
  if exists(select 1 from private.course_instructional_plans plan
    where plan.course_id=p_course_id and plan.curriculum_map_status='draft') then
    return;
  end if;
  if exists(
    select 1
    from private.course_entities current_micro$after$);
  execute v_definition;
end $draft_dependencies$;

do $draft_writer$
declare
  v_definition text;
  v_start integer;
  v_end integer;
  v_change record;
begin
  v_definition:=replace(pg_get_functiondef(
    'public.save_course_curricular_map_for_actor_v1(uuid,uuid,bigint,bigint,boolean,jsonb,text,text)'::regprocedure),E'\r\n',E'\n');
  for v_change in select * from (values
    ($before$  if exists(
    with micros as materialized($before$,
     $after$  if p_approved and (
    nullif(btrim(p_curricular_map->>'audience'),'') is null
    or jsonb_array_length(p_curricular_map->'scopeItems')=0
    or jsonb_array_length(p_curricular_map->'modules')=0
    or exists(select 1 from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
      where jsonb_array_length(module_value.value->'lessons')=0)
    or exists(select 1 from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
      cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
      where jsonb_array_length(lesson.value->'microsequences')=0)
  ) then
    raise exception 'Complete publico, escopo e ramos do mapa antes da aprovacao.' using errcode='23514';
  end if;

  if p_approved and exists(
    with micros as materialized($after$,1),
    ($before$'title',excluded.content->'title','guide',excluded.content->'guide'$before$,
     $after$'title',excluded.content->'title','guide',
        coalesce(course_entities.content->'guide','{}'::jsonb)
          ||jsonb_build_object('goal',excluded.content#>'{guide,goal}')$after$,2),
    ($before$'role',excluded.content->'role','dependsOn',excluded.content->'dependsOn',$before$,
     $after$'dependsOn',excluded.content->'dependsOn',$after$,1),
    ($before$'covers',excluded.content->'covers','checks',excluded.content->'checks',
        'errors',excluded.content->'errors'$before$,
     $after$'covers',excluded.content->'covers'$after$,1),
    ($before$course_entities.content->'scopeItemIds',course_entities.content->'explanationPlan') is distinct from row($before$,
     $after$course_entities.content->'scopeItemIds',course_entities.content->'explanationPlan',
      course_entities.content->'covers') is distinct from row($after$,1),
    ($before$excluded.content->'dependsOn',excluded.content->'scopeItemIds',excluded.content->'explanationPlan'
    );$before$,
     $after$excluded.content->'dependsOn',excluded.content->'scopeItemIds',excluded.content->'explanationPlan',
      excluded.content->'covers'
    );$after$,1),
    ($before$instructional_scope=(
          select string_agg$before$,
     $after$instructional_scope=coalesce((
          select string_agg$after$,1),
    ($before$        ),curriculum_map_status='draft',version=version+1,updated_at=now()$before$,
     $after$        ),''),curriculum_map_status='draft',version=version+1,updated_at=now()$after$,1)
  ) as changes(before_text,after_text,expected_count) loop
    if (length(v_definition)-length(replace(v_definition,v_change.before_text,'')))
        /length(v_change.before_text)<>v_change.expected_count then
      raise exception 'Writer precursor do mapa curricular divergiu: %',v_change.before_text using errcode='55000';
    end if;
    v_definition:=replace(v_definition,v_change.before_text,v_change.after_text);
  end loop;

  v_start:=position('    -- Entidades ja produzidas nao podem ser removidas' in v_definition);
  v_end:=position(E'    insert into private.course_instructional_plan_items(\n' in v_definition);
  if v_start=0 or v_end<=v_start then
    raise exception 'Protecao precursora do mapa curricular divergiu.' using errcode='55000';
  end if;
  v_definition:=substring(v_definition,1,v_start-1)||$protection$
    -- Intenção pode evoluir sem reescrever conteúdo ou configuração aplicada.
    -- Remover/reparentear um ramo com dados úteis requer o fluxo do próprio
    -- objeto, não uma omissão na árvore enviada pelo planejamento.
    if exists(
      with incoming as materialized(
        select 'module'::text as entity_type,module_value.value->>'moduleId' as entity_id,
          null::text as parent_id
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        union all
        select 'lesson',lesson.value->>'lessonId',module_value.value->>'moduleId'
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
        union all
        select 'microsequence',microsequence.value->>'microsequenceId',lesson.value->>'lessonId'
        from jsonb_array_elements(p_curricular_map->'modules') module_value(value)
        cross join lateral jsonb_array_elements(module_value.value->'lessons') lesson(value)
        cross join lateral jsonb_array_elements(lesson.value->'microsequences') microsequence(value)
      ), protected_micros as materialized(
        select microsequence.* from private.course_entities microsequence
        where microsequence.course_id=p_course_id and microsequence.entity_type='microsequence'
          and (nullif(microsequence.content->'explanation','null'::jsonb) is not null
            or exists(select 1 from private.course_entities unit
              where unit.course_id=p_course_id and unit.entity_type='study_unit'
                and unit.parent_id=microsequence.entity_id)
            or exists(select 1 from private.course_source_attributions attribution
              where attribution.course_id=p_course_id
                and attribution.target_kind='microsequence_explanation'
                and attribution.target_id=microsequence.entity_id))
      ), protected as(
        select entity_type,entity_id,parent_id from protected_micros
        union
        select lesson.entity_type,lesson.entity_id,lesson.parent_id
        from private.course_entities lesson join protected_micros microsequence
          on lesson.course_id=p_course_id and lesson.entity_type='lesson'
          and lesson.entity_id=microsequence.parent_id
        union
        select module_value.entity_type,module_value.entity_id,module_value.parent_id
        from private.course_entities module_value
        join private.course_entities lesson on lesson.course_id=p_course_id
          and lesson.entity_type='lesson' and lesson.parent_id=module_value.entity_id
        join protected_micros microsequence on microsequence.parent_id=lesson.entity_id
        where module_value.course_id=p_course_id and module_value.entity_type='module'
      )
      select 1 from protected left join incoming using(entity_type,entity_id)
      where incoming.entity_id is null or incoming.parent_id is distinct from protected.parent_id
    ) or exists(
      select 1 from private.course_instructional_plan_items item
      where item.course_id=p_course_id and item.item_kind='curriculum_scope_item'
        and exists(select 1 from private.course_source_attributions attribution
          where attribution.course_id=p_course_id and attribution.target_kind='plan_item'
            and attribution.target_id=item.id::text)
        and not exists(select 1 from jsonb_array_elements(p_curricular_map->'scopeItems') incoming(value)
          where incoming.value->>'id'=item.id::text)
    ) then
      raise exception 'O mapa nao pode remover ou deslocar ramos com conteudo ou fontes salvos.' using errcode='23514';
    end if;

    -- O estado muda dentro da transação antes da validação do grafo. v_plan
    -- conserva a versão/estado anterior para o único incremento final por CAS.
    update private.course_instructional_plans set curriculum_map_status='draft'
    where id=v_plan.id and curriculum_map_status<>'draft';

$protection$||substring(v_definition,v_end);
  execute v_definition;
end $draft_writer$;

notify pgrst,'reload schema';
commit;
