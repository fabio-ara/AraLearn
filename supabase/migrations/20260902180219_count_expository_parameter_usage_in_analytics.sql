-- Analytics conta o teto de novidade somente onde ele governa materialização:
-- StudyUnits expositivas ou mistas. O snapshot continua selando os quatro
-- parâmetros em toda Unit para proveniência e reprodução.
begin;

do $course_analytics_parameter_applicability_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260902160602'
     or to_regprocedure(
       'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'
     ) is null then
    raise exception 'O runtime de Analytics anterior não corresponde ao esperado.'
      using errcode = '55000';
  end if;
end;
$course_analytics_parameter_applicability_preflight$;

create or replace function public.get_owned_course_authoring_analytics_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_query jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_label text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_query is null or jsonb_typeof(p_query) <> 'object'
     or not (p_query ? 'scope') or p_query - 'scope' <> '{}'::jsonb
     or jsonb_typeof(p_query->'scope') <> 'object'
     or not (p_query->'scope' ?& array['kind','ref'])
     or (p_query->'scope') - 'kind' - 'ref' <> '{}'::jsonb
     or jsonb_typeof(p_query#>'{scope,kind}') <> 'string'
     or p_query#>>'{scope,kind}' not in(
       'course','authoring_part','didactic_microsequence','study_unit'
     ) then
    raise exception 'Consulta de Analytics inválida.' using errcode = '22023';
  end if;
  v_scope_kind := p_query#>>'{scope,kind}';
  if v_scope_kind = 'course' then
    if p_query#>'{scope,ref}' <> 'null'::jsonb then
      raise exception 'O escopo Curso não recebe referência.' using errcode = '22023';
    end if;
    v_scope_ref := null;
  else
    if jsonb_typeof(p_query#>'{scope,ref}') <> 'string' then
      raise exception 'O escopo exige referência corrente.' using errcode = '22023';
    end if;
    v_scope_ref := p_query#>>'{scope,ref}';
    if nullif(btrim(v_scope_ref),'') is null
       or v_scope_ref <> btrim(v_scope_ref)
       or char_length(v_scope_ref) > 240
       or v_scope_ref ~ '[[:cntrl:]]' then
      raise exception 'A referência do escopo é inválida.' using errcode = '22023';
    end if;
  end if;
  select * into v_course from public.courses course where course.id = p_course_id;
  if not found then raise exception 'Curso inexistente.' using errcode = 'PT404'; end if;
  if v_course.revision is distinct from p_expected_course_revision then
    raise exception 'O Curso mudou durante a leitura de Analytics.'
      using errcode = '40001';
  end if;
  if v_scope_kind = 'course' then
    v_scope_label := v_course.title;
  elsif v_scope_kind = 'authoring_part' then
    select part.title into v_scope_label
    from private.course_authoring_parts part
    where part.course_id = p_course_id and part.id::text = v_scope_ref;
  elsif v_scope_kind = 'didactic_microsequence' then
    select microsequence.content->>'title' into v_scope_label
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.entity_id = v_scope_ref;
  else
    select unit.content->>'title' into v_scope_label
    from private.course_entities unit
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and unit.entity_id = v_scope_ref;
  end if;
  if v_scope_label is null then
    raise exception 'Escopo de Analytics inexistente.' using errcode = 'PT404';
  end if;

  with
  selected_microsequences as materialized (
    select microsequence.entity_id,microsequence.parent_id as lesson_id,
      microsequence.position,microsequence.content->>'title' as title
    from private.course_entities microsequence
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
      and (
        v_scope_kind = 'course'
        or v_scope_kind = 'authoring_part' and exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.authoring_part_id::text = v_scope_ref
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
        or v_scope_kind = 'didactic_microsequence'
          and microsequence.entity_id = v_scope_ref
        or v_scope_kind = 'study_unit' and exists(
          select 1 from private.course_entities selected_unit
          where selected_unit.course_id = microsequence.course_id
            and selected_unit.entity_type = 'study_unit'
            and selected_unit.entity_id = v_scope_ref
            and selected_unit.parent_id = microsequence.entity_id
        )
      )
  ),
  scope_units_unordered as materialized (
    select unit.entity_id,unit.parent_id as microsequence_id,unit.position,
      unit.content,unit.version,unit.created_at,unit.updated_at,
      unit.design_snapshot,unit.design_application,
      unit.created_origin,unit.last_revision_origin,
      microsequence.lesson_id,lesson.parent_id as module_id,
      microsequence.position as microsequence_position,
      lesson.position as lesson_position,module_value.position as module_position
    from private.course_entities unit
    join selected_microsequences microsequence
      on microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = unit.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.lesson_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id
     and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
      and (v_scope_kind <> 'study_unit' or unit.entity_id = v_scope_ref)
  ),
  scope_units as materialized (
    select unit.*,
      row_number() over(order by unit.module_position,unit.lesson_position,
        unit.microsequence_position,unit.position,unit.entity_id)::integer
        as analytics_position
    from scope_units_unordered unit
  ),
  scope_options as materialized (
    select 'course'::text as kind,null::text as ref,v_course.title as label,
      0::integer as kind_order,0::integer as first_order,0::integer as second_order,
      0::integer as third_order,0::integer as fourth_order,''::text as tie
    union all
    select 'authoring_part',part.id::text,part.title,1,part.position,0,0,0,part.id::text
    from private.course_authoring_parts part
    where part.course_id = p_course_id
    union all
    select 'didactic_microsequence',microsequence.entity_id,
      microsequence.content->>'title',2,module_value.position,lesson.position,
      microsequence.position,0,microsequence.entity_id
    from private.course_entities microsequence
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where microsequence.course_id = p_course_id
      and microsequence.entity_type = 'microsequence'
    union all
    select 'study_unit',unit.entity_id,unit.content->>'title',3,
      module_value.position,lesson.position,microsequence.position,unit.position,
      unit.entity_id
    from private.course_entities unit
    join private.course_entities microsequence
      on microsequence.course_id = unit.course_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.entity_id = unit.parent_id
    join private.course_entities lesson
      on lesson.course_id = microsequence.course_id and lesson.entity_type = 'lesson'
     and lesson.entity_id = microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id = lesson.course_id and module_value.entity_type = 'module'
     and module_value.entity_id = lesson.parent_id
    where unit.course_id = p_course_id and unit.entity_type = 'study_unit'
  ),
  current_design as materialized (
    select unit.entity_id as study_unit_id,
      unit.design_snapshot as snapshot,unit.design_application as application
    from scope_units unit
    where jsonb_typeof(unit.design_snapshot) = 'object'
      and jsonb_typeof(unit.design_application) = 'object'
      and jsonb_typeof(unit.design_snapshot->'appliedAt') = 'string'
      and (unit.design_snapshot->>'appliedAt')::timestamptz >= unit.updated_at
  ),
  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    where parameter.value->>'parameterId'
        <> 'new_analysis_unit_ceiling_per_expository_study_unit'
      or design.application->>'mode' in('expository','mixed')
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin'
  ),
  editorial_per_unit as materialized (
    select design.study_unit_id,
      case when char_length(editorial.raw_direction) <= 4000
        then editorial.raw_direction else null end as direction,
      case when char_length(editorial.raw_direction) > 4000 then null
        when editorial.origin_count = 1 then editorial.single_origin
        when editorial.origin_count > 1 then 'mixed' else null end as origin,
      char_length(editorial.raw_direction) > 4000 as truncated
    from current_design design
    left join lateral (
      select string_agg(direction.value->>'direction',E'\n\n'
          order by direction.ordinal) as raw_direction,
        count(distinct direction.value->>'origin')::integer as origin_count,
        min(direction.value->>'origin') as single_origin
      from jsonb_array_elements(design.snapshot->'editorialDirections')
        with ordinality direction(value,ordinal)
    ) editorial on true
  ),
  editorial_rows as materialized (
    select editorial.direction,editorial.origin,count(*)::integer as study_unit_count
    from editorial_per_unit editorial
    group by editorial.direction,editorial.origin
  ),
  authorized_analysis as materialized (
    select distinct item.id as analysis_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'instructionalAnalysisUnitIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'instructional_analysis_unit'
     and item.id::text = requested.value
  ),
  introduction_rows as materialized (
    select design.study_unit_id,introduction.value as analysis_id
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.application->'introducedInstructionalAnalysisUnitIds'
    ) introduction(value)
  ),
  explanation_rows as materialized (
    select design.study_unit_id,form.value as form
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'explanationApplications'
    ) explanation(value)
    cross join lateral jsonb_array_elements_text(
      explanation.value->'developedForms'
    ) form(value)
  ),
  component_rows as materialized (
    select unit.entity_id as study_unit_id,
      (instance.value->>'package')||'@'||(instance.value->>'version') as component_ref
    from scope_units unit
    cross join lateral (
      select content.value from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response') = 'object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance(value)
    where jsonb_typeof(instance.value) = 'object'
      and nullif(instance.value->>'package','') is not null
      and nullif(instance.value->>'version','') is not null
  ),
  authorized_evidence as materialized (
    select distinct item.id as evidence_id,item.position+1 as position,item.statement
    from current_design design
    cross join lateral jsonb_array_elements_text(
      design.snapshot->'evidenceRequirementIds'
    ) requested(value)
    join private.course_instructional_plan_items item
      on item.course_id = p_course_id
     and item.item_kind = 'evidence_requirement'
     and item.id::text = requested.value
  ),
  practice_rows as materialized (
    select design.study_unit_id,
      practice.value->>'evidenceRequirementId' as evidence_id,
      practice.value->>'opportunityId' as opportunity_id,
      practice.value->'variedDimensions' as varied_dimensions
    from current_design design
    cross join lateral jsonb_array_elements(
      design.application->'practiceApplications'
    ) practice(value)
  ),
  variation_rows as materialized (
    select practice.evidence_id,practice.opportunity_id,dimension.value as dimension
    from practice_rows practice
    cross join lateral jsonb_array_elements_text(
      practice.varied_dimensions
    ) dimension(value)
  ),
  effective_attributions as materialized (
    select unit.entity_id as study_unit_id,attribution.id as attribution_id
    from scope_units unit
    join lateral (
      select effective.id
      from private.course_effective_source_attribution_v1(
        p_course_id,'study_unit',unit.entity_id
      ) effective
    ) attribution on true
  ),
  source_role_rows as materialized (
    select source_link.relation as role,
      count(distinct source_link.source_id)::integer as source_count,
      count(distinct anchor_link.anchor_id)::integer as anchor_count,
      count(distinct attribution.study_unit_id)::integer as study_unit_count
    from effective_attributions attribution
    join private.course_source_attribution_sources source_link
      on source_link.course_id = p_course_id
     and source_link.attribution_id = attribution.attribution_id
    left join private.course_source_attribution_anchors anchor_link
      on anchor_link.course_id = source_link.course_id
     and anchor_link.attribution_id = source_link.attribution_id
     and anchor_link.source_ordinal = source_link.source_ordinal
    group by source_link.relation
  ),
  scope_annotations as materialized (
    select annotation.*
    from private.course_anchored_annotations annotation
    where annotation.course_id = p_course_id
      and annotation.origin in('author','learner','reviewer')
      and (
        v_scope_kind = 'course'
        or annotation.target_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id = annotation.target_id
        )
        or v_scope_kind in('authoring_part','didactic_microsequence')
          and annotation.target_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = annotation.target_id
        )
      )
  ),
  relevant_parameter_assignments as materialized (
    select assignment.parameter_id,assignment.scope_kind,assignment.scope_ref
    from private.course_design_parameter_assignments assignment
    where assignment.course_id = p_course_id
      and assignment.origin in('author','research_condition')
      and (
        v_scope_kind = 'course'
        or assignment.scope_kind = 'course'
        or assignment.scope_kind = 'lesson' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.lesson_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id = assignment.scope_ref
        )
        or assignment.scope_kind = 'study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id=assignment.scope_ref
        )
      )
  ),
  origin_changes as materialized (
    select origin.origin,
      count(*) filter(where unit.created_origin = origin.origin)::integer as created_count,
      count(*) filter(where unit.version > 1
        and unit.last_revision_origin = origin.origin)::integer as revised_count
    from (values('human'::text),('gpt'::text)) origin(origin)
    cross join scope_units unit
    group by origin.origin
    having count(*) filter(where unit.created_origin = origin.origin
      or unit.version > 1 and unit.last_revision_origin = origin.origin) > 0
  ),
  missing_rows as materialized (
    select format('%s StudyUnits não possuem aplicação pedagógica corrente.',
      count(*)::integer) as message
    from scope_units unit
    where not exists(
      select 1 from current_design design where design.study_unit_id = unit.entity_id
    )
    having count(*) > 0
    union all
    select format('%s StudyUnits não possuem os quatro parâmetros usados.',
      count(*)::integer)
    from scope_units unit
    left join current_design design on design.study_unit_id = unit.entity_id
    where design.study_unit_id is null
      or jsonb_array_length(design.snapshot->'parameters') <> 4
    having count(*) > 0
    union all
    select format('%s direções editoriais excederam o limite do snapshot.',
      count(*)::integer)
    from editorial_per_unit editorial where editorial.truncated
    having count(*) > 0
    union all
    select 'Há mudanças de StudyUnit sem origem explicitamente observável.'
    where exists(
      select 1 from scope_units unit
      where unit.created_origin is null
        or unit.version > 1 and unit.last_revision_origin is null
    )
  )
  select jsonb_build_object(
    'contract','aralearn.course-authoring-analytics.v2',
    'course',jsonb_build_object(
      'id',v_course.id,'revision',v_course.revision,'title',v_course.title
    ),
    'scope',jsonb_build_object(
      'selected',jsonb_build_object(
        'kind',v_scope_kind,'ref',v_scope_ref,'label',v_scope_label
      ),
      'options',coalesce((select jsonb_agg(jsonb_build_object(
        'kind',option_value.kind,'ref',option_value.ref,'label',option_value.label
      ) order by option_value.kind_order,option_value.first_order,
        option_value.second_order,option_value.third_order,
        option_value.fourth_order,option_value.tie)
        from scope_options option_value),'[]'::jsonb)
    ),
    'design',jsonb_build_object(
      'studyUnitCount',(select count(*)::integer from scope_units),
      'parameters',coalesce((select jsonb_agg(jsonb_build_object(
        'parameterId',definition.parameter_id,
        'label',definition.definition->>'label',
        'valueKind',case definition.value_kind when 'set' then 'string_list'
          else definition.value_kind end,
        'effectiveValues',coalesce((select jsonb_agg(jsonb_build_object(
          'value',value_row.value,'origin',value_row.origin,
          'studyUnitCount',value_row.study_unit_count
        ) order by value_row.value::text,value_row.origin nulls first)
          from parameter_value_rows value_row
          where value_row.parameter_id = definition.parameter_id),'[]'::jsonb)
      ) order by definition.ordinal)
      from private.course_design_parameter_definitions definition),'[]'::jsonb),
      'editorialDirections',coalesce((select jsonb_agg(jsonb_build_object(
        'direction',editorial.direction,'origin',editorial.origin,
        'studyUnitCount',editorial.study_unit_count
      ) order by editorial.direction nulls first,editorial.origin nulls first)
        from editorial_rows editorial),'[]'::jsonb),
      'analysisUnits',coalesce((select jsonb_agg(jsonb_build_object(
        'position',analysis.position,'statement',analysis.statement,
        'introductionCount',coalesce((select count(*)::integer
          from introduction_rows introduction
          where introduction.analysis_id = analysis.analysis_id::text),0)
      ) order by analysis.position)
        from authorized_analysis analysis),'[]'::jsonb),
      'introductionsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'studyUnitRef',unit.entity_id,'position',unit.analytics_position,
        'title',unit.content->>'title','introducedCount',coalesce((
          select count(*)::integer from introduction_rows introduction
          where introduction.study_unit_id = unit.entity_id
        ),0)
      ) order by unit.analytics_position)
        from scope_units unit),'[]'::jsonb),
      'explanationForms',coalesce((select jsonb_agg(jsonb_build_object(
        'form',form.form,'studyUnitCount',form.study_unit_count,
        'applicationCount',form.application_count
      ) order by form.form)
        from (select explanation.form,
          count(distinct explanation.study_unit_id)::integer as study_unit_count,
          count(*)::integer as application_count
          from explanation_rows explanation group by explanation.form) form),'[]'::jsonb),
      'components',coalesce((select jsonb_agg(jsonb_build_object(
        'componentRef',component.component_ref,
        'studyUnitCount',component.study_unit_count,
        'instanceCount',component.instance_count
      ) order by component.component_ref)
        from (select instance.component_ref,
          count(distinct instance.study_unit_id)::integer as study_unit_count,
          count(*)::integer as instance_count
          from component_rows instance group by instance.component_ref) component),'[]'::jsonb),
      'practiceByRequirement',coalesce((select jsonb_agg(jsonb_build_object(
        'position',evidence.position,'statement',evidence.statement,
        'opportunityCount',coalesce((select count(distinct practice.opportunity_id)::integer
          from practice_rows practice
          where practice.evidence_id = evidence.evidence_id::text),0)
      ) order by evidence.position)
        from authorized_evidence evidence),'[]'::jsonb),
      'practiceVariationDimensions',coalesce((select jsonb_agg(jsonb_build_object(
        'dimension',variation.dimension,
        'opportunityCount',variation.opportunity_count
      ) order by variation.dimension)
        from (select item.dimension,
          count(distinct (item.evidence_id,item.opportunity_id))::integer
            as opportunity_count
          from variation_rows item group by item.dimension) variation),'[]'::jsonb),
      'sourcesByRole',coalesce((select jsonb_agg(jsonb_build_object(
        'role',source_role.role,'sourceCount',source_role.source_count,
        'anchorCount',source_role.anchor_count,
        'studyUnitCount',source_role.study_unit_count
      ) order by source_role.role)
        from source_role_rows source_role),'[]'::jsonb)
    ),
    'authorship',jsonb_build_object(
      'observations',jsonb_build_object(
        'createdCount',(select count(*)::integer from scope_annotations),
        'openCount',(select count(*)::integer from scope_annotations
          where state in('open','considered')),
        'resolvedCount',(select count(*)::integer from scope_annotations
          where state = 'resolved')
      ),
      'explicitParameterOverrideCount',(
        select count(*)::integer from relevant_parameter_assignments
      ),
      'manuallyRevisedStudyUnitCount',(
        select count(*)::integer from scope_units unit
        where unit.version > 1 and unit.last_revision_origin = 'human'
      ),
      'studyUnitsByOrigin',coalesce((select jsonb_agg(jsonb_build_object(
        'origin',change.origin,'createdCount',change.created_count,
        'lastRevisedCount',change.revised_count
      ) order by change.origin) from origin_changes change),'[]'::jsonb)
    ),
    'missingData',coalesce((select jsonb_agg(missing.message order by missing.message)
      from missing_rows missing),'[]'::jsonb),
    'deepLink',null
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_owned_course_authoring_analytics_for_actor_v2(
  uuid,uuid,bigint,jsonb
) from public,anon,authenticated;
grant execute on function public.get_owned_course_authoring_analytics_for_actor_v2(
  uuid,uuid,bigint,jsonb
) to service_role;

do $advance_course_analytics_parameter_applicability_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260902180219'::text),
    true
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_course_analytics_parameter_applicability_manifest$;

do $course_analytics_parameter_applicability_postflight$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'::regprocedure
  );
  if v_definition not like '%new_analysis_unit_ceiling_per_expository_study_unit%'
     or v_definition not like '%expository%'
     or v_definition not like '%mixed%'
     or public.get_aralearn_runtime_manifest()->>'schemaRevision'
       <> '20260902180219' then
    raise exception 'A aplicabilidade do teto em Analytics ficou incompleta.'
      using errcode = '55000';
  end if;
end;
$course_analytics_parameter_applicability_postflight$;

commit;
