-- 472: transporte normalizado do planejamento (RPC v5) sem alterar v3/v4.
-- O construtor privado passa a receber a representacao pedida (p_compact) e o guard
-- 1835008 mede exatamente essa representacao. Na forma compacta o lote omite apenas
-- os campos que o adapter reconstitui a partir do curriculo da mesma microssequencia
-- (title, goal, explanationPlan, explanation, contentReview, role). v3 e v4 mantem a
-- arvore completa e o guard original; v5 e a unica representacao compacta.

create or replace function private.build_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_compact boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_prerequisites jsonb;
  v_outcomes jsonb;
  v_analysis_units jsonb;
  v_evidence_requirements jsonb;
  v_curriculum jsonb;
  v_scope_items jsonb;
  v_parts jsonb;
  v_counts jsonb;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  select * into strict v_course from public.courses course
  where course.id=p_course_id;
  select * into strict v_plan from private.course_instructional_plans plan
  where plan.course_id=p_course_id;

  select coalesce(jsonb_agg(to_jsonb(item.statement)
    order by item.position,item.id),'[]'::jsonb)
  into v_prerequisites
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='declared_prerequisite';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'version',item.version
  ) order by item.position,item.id),'[]'::jsonb)
  into v_outcomes
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='intended_learning_outcome';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'description',item.description,'version',item.version,
    'introducedAt',(
      select jsonb_build_object(
        'studyUnitId',unit.entity_id,
        'didacticMicrosequenceId',microsequence.entity_id,
        'title',unit.content->>'title'
      )
      from private.course_entities unit
      join private.course_entities microsequence
        on microsequence.course_id=unit.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=unit.parent_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
      where unit.course_id=p_course_id and unit.entity_type='study_unit'
        and coalesce(
          unit.design_application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
        ) ? item.id::text
      order by module_value.position,lesson.position,microsequence.position,
        unit.position,unit.entity_id limit 1
    ),
    'usedBy',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studyUnitId',used.entity_id,
        'didacticMicrosequenceId',used.parent_id,
        'title',used.content->>'title'
      ) order by used.module_position,used.lesson_position,
        used.microsequence_position,used.position,used.entity_id)
      from (
        select unit.*,module_value.position as module_position,
          lesson.position as lesson_position,
          microsequence.position as microsequence_position
        from private.course_entities unit
        join private.course_entities microsequence
          on microsequence.course_id=unit.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=unit.parent_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        where unit.course_id=p_course_id and unit.entity_type='study_unit'
          and coalesce(
            unit.design_application->'usedInstructionalAnalysisUnitIds','[]'::jsonb
          ) ? item.id::text
      ) used
    ),'[]'::jsonb),
    'revisitedBy',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studyUnitId',revisited.entity_id,
        'didacticMicrosequenceId',revisited.parent_id,
        'title',revisited.content->>'title'
      ) order by revisited.module_position,revisited.lesson_position,
        revisited.microsequence_position,revisited.position,revisited.entity_id)
      from (
        select distinct unit.*,module_value.position as module_position,
          lesson.position as lesson_position,
          microsequence.position as microsequence_position
        from private.course_entities unit
        join private.course_entities microsequence
          on microsequence.course_id=unit.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=unit.parent_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        cross join lateral jsonb_array_elements(coalesce(
          unit.design_application->'explanationApplications','[]'::jsonb
        )) explanation(value)
        where unit.course_id=p_course_id and unit.entity_type='study_unit'
          and explanation.value->>'instructionalAnalysisUnitId'=item.id::text
          and not (coalesce(
            unit.design_application->'introducedInstructionalAnalysisUnitIds','[]'::jsonb
          ) ? item.id::text)
      ) revisited
    ),'[]'::jsonb)
  ) order by item.position,item.id),'[]'::jsonb)
  into v_analysis_units
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='instructional_analysis_unit';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',item.id,'position',item.position,'statement',item.statement,
    'version',item.version
  ) order by item.position,item.id),'[]'::jsonb)
  into v_evidence_requirements
  from private.course_instructional_plan_items item
  where item.instructional_plan_id=v_plan.id
    and item.item_kind='evidence_requirement';

  select jsonb_build_object('modules',coalesce(jsonb_agg(jsonb_build_object(
    'id',module_value.entity_id,'position',module_value.position,
    'title',module_value.content->>'title',
    'objective',coalesce(module_value.content#>>'{guide,goal}',''),
    'lessons',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',lesson.entity_id,'position',lesson.position,
        'title',lesson.content->>'title',
        'objective',coalesce(lesson.content#>>'{guide,goal}',''),
        'microsequences',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',microsequence.entity_id,'position',microsequence.position,
            'title',microsequence.content->>'title',
            'objective',coalesce(microsequence.content->>'goal',''),'explanationPlan',microsequence.content->'explanationPlan','explanation',microsequence.content->'explanation','contentReview',private.course_content_review_v1(p_course_id,'microsequence_explanation',microsequence.entity_id),
            'role',coalesce(microsequence.content->>'role','explain'),
            'dependencyMicrosequenceIds',coalesce(
              microsequence.content->'dependsOn','[]'::jsonb
            )
          ) order by microsequence.position,microsequence.entity_id)
          from private.course_entities microsequence
          where microsequence.course_id=lesson.course_id
            and microsequence.entity_type='microsequence'
            and microsequence.parent_id=lesson.entity_id
        ),'[]'::jsonb)
      ) order by lesson.position,lesson.entity_id)
      from private.course_entities lesson
      where lesson.course_id=module_value.course_id
        and lesson.entity_type='lesson' and lesson.parent_id=module_value.entity_id
    ),'[]'::jsonb)
  ) order by module_value.position,module_value.entity_id),'[]'::jsonb))
  into v_curriculum
  from private.course_entities module_value
  where module_value.course_id=p_course_id and module_value.entity_type='module';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',scope_item.id,'position',scope_item.position,
    'statement',scope_item.statement,
    'state',case when exists(
      select 1 from private.course_design_target_plan_items any_target
      where any_target.course_id=p_course_id
        and any_target.plan_item_kind='curriculum_scope_item'
        and any_target.plan_item_id=scope_item.id
    ) and not exists(
      select 1 from private.course_design_target_plan_items target
      where target.course_id=p_course_id
        and target.plan_item_kind='curriculum_scope_item'
        and target.plan_item_id=scope_item.id
        and not exists(
          select 1 from private.course_entities unit
          where unit.course_id=target.course_id and unit.entity_type='study_unit'
            and unit.parent_id=target.didactic_microsequence_id
            and coalesce(
              unit.design_application->'curriculumScopeItemIds','[]'::jsonb
            ) ? scope_item.id::text
        )
    ) then 'developed' else 'planned' end,
    'curriculumTargets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'moduleId',target.module_id,'lessonId',target.lesson_id,
        'didacticMicrosequenceIds',target.microsequence_ids
      ) order by target.module_position,target.lesson_position,target.lesson_id)
      from (
        select module_value.entity_id as module_id,
          module_value.position as module_position,lesson.entity_id as lesson_id,
          lesson.position as lesson_position,
          jsonb_agg(to_jsonb(microsequence.entity_id)
            order by microsequence.position,microsequence.entity_id)
            as microsequence_ids
        from private.course_design_target_plan_items assignment
        join private.course_entities microsequence
          on microsequence.course_id=assignment.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=assignment.didactic_microsequence_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        where assignment.course_id=p_course_id
          and assignment.plan_item_kind='curriculum_scope_item'
          and assignment.plan_item_id=scope_item.id
        group by module_value.entity_id,module_value.position,
          lesson.entity_id,lesson.position
      ) target
    ),'[]'::jsonb),
    'developedIn',coalesce((
      select jsonb_agg(jsonb_build_object(
        'studyUnitId',developed.entity_id,
        'didacticMicrosequenceId',developed.parent_id,
        'title',developed.content->>'title'
      ) order by developed.module_position,developed.lesson_position,
        developed.microsequence_position,developed.position,developed.entity_id)
      from (
        select distinct unit.*,module_value.position as module_position,
          lesson.position as lesson_position,
          microsequence.position as microsequence_position
        from private.course_design_target_plan_items assignment
        join private.course_entities microsequence
          on microsequence.course_id=assignment.course_id
         and microsequence.entity_type='microsequence'
         and microsequence.entity_id=assignment.didactic_microsequence_id
        join private.course_entities lesson
          on lesson.course_id=microsequence.course_id
         and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
        join private.course_entities module_value
          on module_value.course_id=lesson.course_id
         and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
        join private.course_entities unit
          on unit.course_id=microsequence.course_id and unit.entity_type='study_unit'
         and unit.parent_id=microsequence.entity_id
        where assignment.course_id=p_course_id
          and assignment.plan_item_kind='curriculum_scope_item'
          and assignment.plan_item_id=scope_item.id
          and coalesce(
            unit.design_application->'curriculumScopeItemIds','[]'::jsonb
          ) ? scope_item.id::text
      ) developed
    ),'[]'::jsonb)
  ) order by scope_item.position,scope_item.id),'[]'::jsonb)
  into v_scope_items
  from private.course_instructional_plan_items scope_item
  where scope_item.instructional_plan_id=v_plan.id
    and scope_item.item_kind='curriculum_scope_item';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',part.id,'position',part.position,'title',part.title,
    'intent',part.intent,'progression',part.progression,'version',part.version,
    'microsequences',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',microsequence.entity_id,
        'productionPosition',membership.production_position,
        'title',microsequence.content->>'title',
        'goal',coalesce(microsequence.content->>'goal',''),'explanationPlan',microsequence.content->'explanationPlan','explanation',microsequence.content->'explanation','contentReview',private.course_content_review_v1(p_course_id,'microsequence_explanation',microsequence.entity_id),
        'role',coalesce(microsequence.content->>'role','explain'),
        'curriculumPath',jsonb_build_object(
          'moduleId',module_value.entity_id,
          'moduleTitle',module_value.content->>'title',
          'lessonId',lesson.entity_id,'lessonTitle',lesson.content->>'title'
        ),
        'studyUnitCount',(
          select count(*)::integer from private.course_entities unit
          where unit.course_id=p_course_id and unit.entity_type='study_unit'
            and unit.parent_id=microsequence.entity_id
        )
      ) order by membership.production_position,microsequence.entity_id)
      from private.course_authoring_part_didactic_microsequences membership
      join private.course_entities microsequence
        on microsequence.course_id=membership.course_id
       and microsequence.entity_type='microsequence'
       and microsequence.entity_id=membership.didactic_microsequence_id
      join private.course_entities lesson
        on lesson.course_id=microsequence.course_id
       and lesson.entity_type='lesson' and lesson.entity_id=microsequence.parent_id
      join private.course_entities module_value
        on module_value.course_id=lesson.course_id
       and module_value.entity_type='module' and module_value.entity_id=lesson.parent_id
      where membership.course_id=p_course_id and membership.authoring_part_id=part.id
    ),'[]'::jsonb),
    'progress',private.course_authoring_part_progress_v1(p_course_id,part.id)
  ) order by part.position,part.id),'[]'::jsonb)
  into v_parts
  from private.course_authoring_parts part
  where part.instructional_plan_id=v_plan.id;
  if p_compact then
    select coalesce(jsonb_agg(
        jsonb_set(part_value,'{microsequences}',coalesce((
          select jsonb_agg(
              element_value - 'title' - 'goal' - 'explanationPlan' - 'explanation'
                - 'contentReview' - 'role'
              order by element_ordinal)
          from jsonb_array_elements(coalesce(part_value->'microsequences','[]'::jsonb))
            with ordinality element(element_value,element_ordinal)
        ),'[]'::jsonb))
        order by part_ordinal),'[]'::jsonb)
    into v_parts
    from jsonb_array_elements(v_parts) with ordinality part(part_value,part_ordinal);
  end if;

  select jsonb_build_object(
    'intendedLearningOutcomeCount',jsonb_array_length(v_outcomes),
    'instructionalAnalysisUnitCount',jsonb_array_length(v_analysis_units),
    'evidenceRequirementCount',jsonb_array_length(v_evidence_requirements),
    'authoringPartCount',jsonb_array_length(v_parts),
    'linkedDidacticMicrosequenceCount',(
      select count(*)::integer
      from private.course_authoring_part_didactic_microsequences membership
      where membership.course_id=p_course_id
    ),
    'studyUnitCount',(
      select count(*)::integer from private.course_entities unit
      where unit.course_id=p_course_id and unit.entity_type='study_unit'
    )
  ) into v_counts;

  v_result:=jsonb_build_object(
    'contract','aralearn.course-instructional-plan.v3',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'plan',jsonb_build_object(
      'id',v_plan.id,'version',v_plan.version,'title',v_course.title,
      'objective',v_course.goal,'audience',v_plan.audience,
      'scope',v_plan.instructional_scope,
      'curriculumMapStatus',v_plan.curriculum_map_status,
      'declaredPrerequisites',v_prerequisites,'curriculum',v_curriculum,
      'curriculumScopeItems',v_scope_items,
      'preferredPartCount',jsonb_build_object(
        'minimum',v_plan.preferred_authoring_part_min,
        'maximum',v_plan.preferred_authoring_part_max,
        'origin',v_plan.part_count_origin
      ),
      'intendedLearningOutcomes',v_outcomes,
      'instructionalAnalysisUnits',v_analysis_units,
      'evidenceRequirements',v_evidence_requirements,
      'parts',v_parts,'counts',v_counts,'updatedAt',v_plan.updated_at
    )
  );
  if octet_length(v_result::text)>1835008 then
    raise exception 'O planejamento curricular excede o limite de leitura.'
      using errcode='54000';
  end if;
  return v_result;
end;
$function$;

revoke all on function private.build_course_instructional_plan_for_actor_v1(uuid,uuid,boolean)
from public,anon,authenticated,service_role;

create or replace function private.get_course_instructional_plan_for_actor_v3(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
begin
  return private.build_course_instructional_plan_for_actor_v1(p_actor_id,p_course_id,false);
end;
$function$;

revoke all on function private.get_course_instructional_plan_for_actor_v3(uuid,uuid)
from public,anon,authenticated,service_role;

create function public.get_owned_course_instructional_plan_for_actor_v5(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private,extensions
as $function$
declare v_read jsonb; v_map jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  v_read:=private.build_course_instructional_plan_for_actor_v1(p_actor_id,p_course_id,true);
  v_map:=private.current_course_curricular_map_v1(p_course_id);
  return v_read||jsonb_build_object(
    'payloadEncoding','curriculum-backed-microsequence-v1',
    'approvalBasis',jsonb_build_object(
      'courseRevision',(v_read->>'courseRevision')::bigint,
      'planVersion',(v_read#>>'{plan,version}')::bigint,
      'basisHash',encode(extensions.digest(convert_to(v_map::text,'UTF8'),'sha256'),'hex')));
end
$function$;

revoke all on function public.get_owned_course_instructional_plan_for_actor_v5(uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_instructional_plan_for_actor_v5(uuid,uuid)
to service_role;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20261016162436');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;

