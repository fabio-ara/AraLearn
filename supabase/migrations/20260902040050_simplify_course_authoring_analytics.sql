-- #273: Analytics educacional é um snapshot quantitativo do Curso corrente.
-- Não há facts paginados, ledger paralelo, runs, steps, duração ou hashes públicos.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn:simplify-course-authoring-analytics:20260902040050',0
));

do $course_authoring_analytics_v2_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_events') is null
     or to_regclass('private.course_authoring_parts') is null
     or to_regclass('private.course_authoring_part_didactic_microsequences') is null
     or to_regclass('private.course_authoring_part_materializations') is null
     or to_regclass('private.course_authoring_part_materialization_steps') is null
     or to_regclass('private.course_design_parameter_definitions') is null
     or to_regclass('private.course_design_parameter_changes') is null
     or to_regclass('private.course_source_attributions') is null
     or to_regclass('private.course_source_attribution_sources') is null
     or to_regclass('private.course_source_attribution_anchors') is null
     or to_regclass('private.course_anchored_annotations') is null
     or to_regclass('private.course_authoring_corrections') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('private.course_source_json_hash_v1(jsonb)') is null
     or to_regprocedure(
       'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)'
     ) is null then
    raise exception 'Dependências do snapshot de Analytics v2 ausentes.'
      using errcode = '55000';
  end if;
  if to_regprocedure(
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'
  ) is not null then
    raise exception 'A RPC de Analytics v2 já existe.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260831183106'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ? 'course-authoring-analytics-v1') then
    raise exception 'Manifesto anterior ao snapshot de Analytics v2 é incompatível.'
      using errcode = '55000';
  end if;
end;
$course_authoring_analytics_v2_preflight$;

drop function public.get_owned_course_authoring_analytics_for_actor_v1(
  uuid,uuid,bigint,jsonb
);
drop index if exists private.course_events_analytics_v1_idx;

create function public.get_owned_course_authoring_analytics_for_actor_v2(
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
     or not (p_query ? 'scope')
     or p_query - 'scope' <> '{}'::jsonb
     or jsonb_typeof(p_query->'scope') <> 'object'
     or not (p_query->'scope' ?& array['kind','ref'])
     or (p_query->'scope') - 'kind' - 'ref' <> '{}'::jsonb
     or jsonb_typeof(p_query#>'{scope,kind}') <> 'string'
     or p_query#>>'{scope,kind}' not in (
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
      raise exception 'O escopo exige referência humana corrente.' using errcode = '22023';
    end if;
    v_scope_ref := p_query#>>'{scope,ref}';
    if nullif(btrim(v_scope_ref),'') is null
       or v_scope_ref <> btrim(v_scope_ref)
       or char_length(v_scope_ref) > 240
       or v_scope_ref ~ '[[:cntrl:]]' then
      raise exception 'A referência do escopo é inválida.' using errcode = '22023';
    end if;
  end if;

  select * into v_course from public.courses course where course.id=p_course_id;
  if not found then
    raise exception 'Curso inexistente.' using errcode = 'PT404';
  end if;
  if v_course.revision is distinct from p_expected_course_revision then
    raise exception 'O Curso mudou durante a leitura de Analytics.' using errcode = '40001';
  end if;

  if v_scope_kind='course' then
    v_scope_label:=v_course.title;
  elsif v_scope_kind='authoring_part' then
    select part.title into v_scope_label
    from private.course_authoring_parts part
    where part.course_id=p_course_id and part.id::text=v_scope_ref
      and part.retired_at is null;
  elsif v_scope_kind='didactic_microsequence' then
    select microsequence.content->>'title' into v_scope_label
    from private.course_entities microsequence
    where microsequence.course_id=p_course_id
      and microsequence.entity_type='microsequence'
      and microsequence.entity_id=v_scope_ref;
  else
    select unit.content->>'title' into v_scope_label
    from private.course_entities unit
    where unit.course_id=p_course_id and unit.entity_type='study_unit'
      and unit.entity_id=v_scope_ref;
  end if;
  if v_scope_label is null then
    raise exception 'Escopo de Analytics inexistente.' using errcode = 'PT404';
  end if;

  with
  selected_microsequences as materialized (
    select microsequence.entity_id,microsequence.parent_id as lesson_id,
      microsequence.position,microsequence.content->>'title' as title
    from private.course_entities microsequence
    where microsequence.course_id=p_course_id
      and microsequence.entity_type='microsequence'
      and (
        v_scope_kind='course'
        or v_scope_kind='authoring_part' and exists(
          select 1
          from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id=microsequence.course_id
            and membership.authoring_part_id::text=v_scope_ref
            and membership.didactic_microsequence_id=microsequence.entity_id
        )
        or v_scope_kind='didactic_microsequence'
          and microsequence.entity_id=v_scope_ref
        or v_scope_kind='study_unit' and exists(
          select 1 from private.course_entities selected_unit
          where selected_unit.course_id=microsequence.course_id
            and selected_unit.entity_type='study_unit'
            and selected_unit.entity_id=v_scope_ref
            and selected_unit.parent_id=microsequence.entity_id
        )
      )
  ),
  scope_units_unordered as materialized (
    select unit.entity_id,unit.parent_id as microsequence_id,unit.position,
      unit.content,unit.version,unit.created_at,unit.updated_at,
      microsequence.lesson_id,lesson.parent_id as module_id,
      microsequence.position as microsequence_position,
      lesson.position as lesson_position,module_value.position as module_position
    from private.course_entities unit
    join selected_microsequences microsequence
      on microsequence.entity_id=unit.parent_id
    join private.course_entities lesson
      on lesson.course_id=unit.course_id and lesson.entity_type='lesson'
     and lesson.entity_id=microsequence.lesson_id
    join private.course_entities module_value
      on module_value.course_id=lesson.course_id and module_value.entity_type='module'
     and module_value.entity_id=lesson.parent_id
    where unit.course_id=p_course_id and unit.entity_type='study_unit'
      and (v_scope_kind<>'study_unit' or unit.entity_id=v_scope_ref)
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
    where part.course_id=p_course_id and part.retired_at is null
    union all
    select 'didactic_microsequence',microsequence.entity_id,
      microsequence.content->>'title',2,module_value.position,lesson.position,
      microsequence.position,0,microsequence.entity_id
    from private.course_entities microsequence
    join private.course_entities lesson
      on lesson.course_id=microsequence.course_id and lesson.entity_type='lesson'
     and lesson.entity_id=microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id=lesson.course_id and module_value.entity_type='module'
     and module_value.entity_id=lesson.parent_id
    where microsequence.course_id=p_course_id
      and microsequence.entity_type='microsequence'
    union all
    select 'study_unit',unit.entity_id,unit.content->>'title',3,
      module_value.position,lesson.position,microsequence.position,unit.position,
      unit.entity_id
    from private.course_entities unit
    join private.course_entities microsequence
      on microsequence.course_id=unit.course_id
     and microsequence.entity_type='microsequence'
     and microsequence.entity_id=unit.parent_id
    join private.course_entities lesson
      on lesson.course_id=microsequence.course_id and lesson.entity_type='lesson'
     and lesson.entity_id=microsequence.parent_id
    join private.course_entities module_value
      on module_value.course_id=lesson.course_id and module_value.entity_type='module'
     and module_value.entity_id=lesson.parent_id
    where unit.course_id=p_course_id and unit.entity_type='study_unit'
  ),
  design_candidates as materialized (
    select unit.entity_id as study_unit_id,step.id as step_id,step.completed_at,
      application.value as application,materialization.design_context,
      target.value as target
    from scope_units unit
    join private.course_authoring_part_materialization_steps step
      on step.course_id=p_course_id and step.status='completed'
     and step.step_kind='didactic_microsequence_materialization'
     and step.target_didactic_microsequence_id=unit.microsequence_id
     and jsonb_typeof(step.result_facts->'designApplication')='object'
    join private.course_authoring_part_materializations materialization
      on materialization.course_id=step.course_id
     and materialization.id=step.materialization_id
    cross join lateral jsonb_array_elements(
      step.result_facts#>'{designApplication,studyUnits}'
    ) application(value)
    cross join lateral jsonb_array_elements(
      materialization.design_context->'targets'
    ) target(value)
    where application.value->>'studyUnitId'=unit.entity_id
      and target.value->>'didacticMicrosequenceId'=unit.microsequence_id
      and step.completed_at>=unit.updated_at
  ),
  latest_design as materialized (
    select distinct on(candidate.study_unit_id)
      candidate.study_unit_id,candidate.step_id,candidate.completed_at,
      candidate.application,candidate.design_context,candidate.target
    from design_candidates candidate
    order by candidate.study_unit_id,candidate.completed_at desc,candidate.step_id desc
  ),
  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from latest_design design
    cross join lateral jsonb_array_elements(design.target->'parameters') parameter(value)
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin'
  ),
  editorial_per_unit as materialized (
    select design.study_unit_id,
      case when char_length(editorial.raw_direction)<=4000
        then editorial.raw_direction else null end as direction,
      case when char_length(editorial.raw_direction)>4000 then null
        when editorial.origin_count=1 then editorial.single_origin
        when editorial.origin_count>1 then 'mixed' else null end as origin,
      char_length(editorial.raw_direction)>4000 as truncated
    from latest_design design
    left join lateral (
      select string_agg(revision.value->>'guidance',E'\n\n'
          order by revision.ordinal) as raw_direction,
        count(distinct revision.value->>'origin')::integer as origin_count,
        min(revision.value->>'origin') as single_origin
      from jsonb_array_elements(design.design_context->'guidanceRevisions')
        with ordinality revision(value,ordinal)
      where design.target->'guidanceRevisionIds' ? (revision.value->>'revisionId')
    ) editorial on true
  ),
  editorial_rows as materialized (
    select editorial.direction,editorial.origin,
      count(*)::integer as study_unit_count
    from editorial_per_unit editorial
    group by editorial.direction,editorial.origin
  ),
  analysis_inventory_candidates as materialized (
    select item.value->>'id' as analysis_id,
      (item.value->>'position')::integer+1 as position,
      item.value->>'statement' as statement,
      (design.design_context->>'courseRevision')::bigint as course_revision
    from latest_design design
    cross join lateral jsonb_array_elements(
      design.design_context->'instructionalAnalysisUnits'
    ) item(value)
    where design.target->'instructionalAnalysisUnitIds' ? (item.value->>'id')
  ),
  authorized_analysis as materialized (
    select distinct on(candidate.analysis_id)
      candidate.analysis_id,candidate.position,candidate.statement
    from analysis_inventory_candidates candidate
    order by candidate.analysis_id,candidate.course_revision desc
  ),
  introduction_rows as materialized (
    select design.study_unit_id,introduction.value as analysis_id
    from latest_design design
    cross join lateral jsonb_array_elements_text(
      design.application->'introducedInstructionalAnalysisUnitIds'
    ) introduction(value)
  ),
  explanation_rows as materialized (
    select design.study_unit_id,form.value as form
    from latest_design design
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
      select content.value
      from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response')='object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance(value)
    where jsonb_typeof(instance.value)='object'
      and nullif(instance.value->>'package','') is not null
      and nullif(instance.value->>'version','') is not null
  ),
  evidence_inventory_candidates as materialized (
    select item.value->>'id' as evidence_id,
      (item.value->>'position')::integer+1 as position,
      item.value->>'statement' as statement,
      (design.design_context->>'courseRevision')::bigint as course_revision
    from latest_design design
    cross join lateral jsonb_array_elements(
      design.design_context->'evidenceRequirements'
    ) item(value)
    where design.target->'evidenceRequirementIds' ? (item.value->>'id')
  ),
  authorized_evidence as materialized (
    select distinct on(candidate.evidence_id)
      candidate.evidence_id,candidate.position,candidate.statement
    from evidence_inventory_candidates candidate
    order by candidate.evidence_id,candidate.course_revision desc
  ),
  practice_rows as materialized (
    select design.study_unit_id,
      practice.value->>'evidenceRequirementId' as evidence_id,
      practice.value->>'opportunityId' as opportunity_id,
      practice.value->'variedDimensions' as varied_dimensions
    from latest_design design
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
      select candidate.id
      from private.course_source_attributions candidate
      where candidate.course_id=p_course_id
        and candidate.target_kind='study_unit'
        and candidate.target_id=unit.entity_id
        and candidate.target_version=unit.version
        and candidate.target_hash=private.course_source_json_hash_v1(
          jsonb_build_object('targetKind','study_unit','content',unit.content)
        )
      order by candidate.revision desc,candidate.id desc limit 1
    ) attribution on true
  ),
  source_role_rows as materialized (
    select source_link.relation as role,
      count(distinct (source_link.source_id,source_link.source_revision))::integer
        as source_count,
      count(distinct (anchor_link.anchor_id,anchor_link.anchor_revision))::integer
        as anchor_count,
      count(distinct attribution.study_unit_id)::integer as study_unit_count
    from effective_attributions attribution
    join private.course_source_attribution_sources source_link
      on source_link.course_id=p_course_id
     and source_link.attribution_id=attribution.attribution_id
    left join private.course_source_attribution_anchors anchor_link
      on anchor_link.course_id=source_link.course_id
     and anchor_link.attribution_id=source_link.attribution_id
     and anchor_link.source_ordinal=source_link.source_ordinal
    group by source_link.relation
  ),
  scope_annotations as materialized (
    select annotation.*
    from private.course_anchored_annotations annotation
    where annotation.course_id=p_course_id
      and annotation.origin in('author','learner','human_audit')
      and (
        v_scope_kind='course'
        or annotation.target_kind='study_unit' and exists(
          select 1 from scope_units unit where unit.entity_id=annotation.target_id
        )
        or v_scope_kind in('authoring_part','didactic_microsequence')
          and annotation.target_kind='didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id=annotation.target_id
        )
      )
  ),
  selected_lessons as materialized (
    select distinct microsequence.lesson_id
    from selected_microsequences microsequence
  ),
  selected_modules as materialized (
    select distinct lesson.parent_id as module_id
    from private.course_entities lesson
    join selected_lessons selected on selected.lesson_id=lesson.entity_id
    where lesson.course_id=p_course_id and lesson.entity_type='lesson'
  ),
  relevant_parameter_changes as materialized (
    select change.id
    from private.course_design_parameter_changes change
    where change.course_id=p_course_id
      and (
        change.origin in('author','research_condition')
        or change.action='clear' and change.actor_id is not null
          and change.channel in('application','mcp','actions')
      )
      and (
        v_scope_kind='course'
        or change.scope_kind='course'
        or change.scope_kind='module' and exists(
          select 1 from selected_modules module_value
          where module_value.module_id=change.scope_ref
        )
        or change.scope_kind='lesson' and exists(
          select 1 from selected_lessons lesson
          where lesson.lesson_id=change.scope_ref
        )
        or change.scope_kind='didactic_microsequence' and exists(
          select 1 from selected_microsequences microsequence
          where microsequence.entity_id=change.scope_ref
        )
      )
  ),
  latest_repairs as materialized (
    select distinct on(correction.correction_id)
      correction.correction_id,correction.status,correction.target_study_unit_id
    from private.course_authoring_corrections correction
    where correction.course_id=p_course_id
      and exists(
        select 1 from scope_units unit
        where unit.entity_id=correction.target_study_unit_id
      )
    order by correction.correction_id,correction.correction_version desc
  ),
  materialized_unit_changes as materialized (
    select unit.entity_id as study_unit_id,materialization.channel,
      unit.created_at as unit_created_at,step.completed_at,
      row_number() over(partition by unit.entity_id
        order by step.completed_at,step.id)::integer as change_number
    from scope_units unit
    join private.course_authoring_part_materialization_steps step
      on step.course_id=p_course_id and step.status='completed'
     and step.step_kind='didactic_microsequence_materialization'
     and jsonb_typeof(step.result_facts->'designApplication')='object'
    join private.course_authoring_part_materializations materialization
      on materialization.course_id=step.course_id
     and materialization.id=step.materialization_id
    cross join lateral jsonb_array_elements(
      step.result_facts#>'{designApplication,studyUnits}'
    ) application(value)
    where application.value->>'studyUnitId'=unit.entity_id
  ),
  origin_change_rows as materialized (
    select 'gpt'::text as origin,
      count(*) filter(where change.change_number=1
        and change.unit_created_at=change.completed_at)::integer as created_count,
      count(*) filter(where change.change_number>1
        or change.unit_created_at<>change.completed_at)::integer as revised_count
    from materialized_unit_changes change
    where change.channel in('mcp','actions')
    having count(*)>0
    union all
    select 'gpt',
      coalesce(sum(case when event_value.summary->>'createdCount'~'^[0-9]+$'
        then (event_value.summary->>'createdCount')::integer else 0 end),0)::integer,
      coalesce(sum(case when event_value.summary->>'updatedCount'~'^[0-9]+$'
        then (event_value.summary->>'updatedCount')::integer else 0 end),0)::integer
    from private.course_events event_value
    where v_scope_kind='course' and event_value.course_id=p_course_id
      and event_value.operation='replace_course_composition'
      and event_value.summary->>'channel' in('mcp','actions')
      and coalesce(event_value.summary->>'applicationOrigin','')
        not in('manual','provider_assistance')
    having count(*)>0
    union all
    select event_value.summary->>'applicationOrigin' as origin,
      coalesce(sum(case when event_value.summary->>'createdCount'~'^[0-9]+$'
        then (event_value.summary->>'createdCount')::integer else 0 end),0)::integer,
      coalesce(sum(case when event_value.summary->>'updatedCount'~'^[0-9]+$'
        then (event_value.summary->>'updatedCount')::integer else 0 end),0)::integer
    from private.course_events event_value
    where v_scope_kind='course' and event_value.course_id=p_course_id
      and event_value.operation='replace_course_composition'
      and event_value.summary->>'applicationOrigin' in('manual','provider_assistance')
    group by event_value.summary->>'applicationOrigin'
  ),
  origin_changes as materialized (
    select change.origin,
      sum(change.created_count)::integer as created_count,
      sum(change.revised_count)::integer as revised_count
    from origin_change_rows change
    group by change.origin
  ),
  missing_rows as materialized (
    select format('%s StudyUnits não possuem aplicação pedagógica materializada.',
      count(*)::integer) as message
    from scope_units unit
    where not exists(
      select 1 from latest_design design where design.study_unit_id=unit.entity_id
    )
    having count(*)>0
    union all
    select format('%s StudyUnits não possuem os quatro parâmetros usados.',
      count(*)::integer)
    from scope_units unit
    left join latest_design design on design.study_unit_id=unit.entity_id
    where design.study_unit_id is null
      or jsonb_array_length(design.target->'parameters')<>4
    having count(*)>0
    union all
    select format('%s direções editoriais excederam o limite do snapshot.',
      count(*)::integer)
    from editorial_per_unit editorial where editorial.truncated
    having count(*)>0
    union all
    select 'Edições manuais ou assistidas não possuem alvo suficiente para este escopo.'
    where v_scope_kind<>'course' and exists(
      select 1 from private.course_events event_value
      where event_value.course_id=p_course_id
        and event_value.summary->>'applicationOrigin' in('manual','provider_assistance')
    )
    union all
    select 'Mudanças GPT de composição não possuem alvo suficiente para este escopo.'
    where v_scope_kind<>'course' and exists(
      select 1 from private.course_events event_value
      where event_value.course_id=p_course_id
        and event_value.operation='replace_course_composition'
        and event_value.summary->>'channel' in('mcp','actions')
        and coalesce(event_value.summary->>'applicationOrigin','')
          not in('manual','provider_assistance')
        and coalesce((event_value.summary->>'createdCount')::integer,0)
          +coalesce((event_value.summary->>'updatedCount')::integer,0)>0
    )
    union all
    select 'Há mudanças de StudyUnit sem origem explicitamente observável.'
    where exists(
      select 1 from materialized_unit_changes change
      where change.channel not in('mcp','actions')
    ) or exists(
      select 1 from private.course_events event_value
      where event_value.course_id=p_course_id
        and event_value.operation='replace_course_composition'
        and coalesce((event_value.summary->>'createdCount')::integer,0)
          +coalesce((event_value.summary->>'updatedCount')::integer,0)>0
        and not (
          coalesce(event_value.summary->>'channel','') in('mcp','actions')
          or coalesce(event_value.summary->>'applicationOrigin','')
            in('manual','provider_assistance')
        )
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
          where value_row.parameter_id=definition.parameter_id),'[]'::jsonb)
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
          where introduction.analysis_id=analysis.analysis_id),0)
      ) order by analysis.position)
        from authorized_analysis analysis),'[]'::jsonb),
      'introductionsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'studyUnitRef',unit.entity_id,'position',unit.analytics_position,
        'title',unit.content->>'title','introducedCount',coalesce((
          select count(*)::integer from introduction_rows introduction
          where introduction.study_unit_id=unit.entity_id
        ),0)
      ) order by unit.analytics_position)
        from scope_units unit),'[]'::jsonb),
      'explanationForms',coalesce((select jsonb_agg(jsonb_build_object(
        'form',form.form,'studyUnitCount',form.study_unit_count,
        'applicationCount',form.application_count
      ) order by form.form)
        from (select explanation.form,count(distinct explanation.study_unit_id)::integer
          as study_unit_count,count(*)::integer as application_count
          from explanation_rows explanation group by explanation.form) form),'[]'::jsonb),
      'components',coalesce((select jsonb_agg(jsonb_build_object(
        'componentRef',component.component_ref,
        'studyUnitCount',component.study_unit_count,
        'instanceCount',component.instance_count
      ) order by component.component_ref)
        from (select instance.component_ref,count(distinct instance.study_unit_id)::integer
          as study_unit_count,count(*)::integer as instance_count
          from component_rows instance group by instance.component_ref) component),'[]'::jsonb),
      'practiceByRequirement',coalesce((select jsonb_agg(jsonb_build_object(
        'position',evidence.position,'statement',evidence.statement,
        'opportunityCount',coalesce((select count(distinct practice.opportunity_id)::integer
          from practice_rows practice where practice.evidence_id=evidence.evidence_id),0)
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
        'openCount',(select count(*)::integer from scope_annotations where state='open'),
        'resolvedCount',(select count(*)::integer from scope_annotations where state='resolved')
      ),
      'explicitParameterChangeCount',(
        select count(*)::integer from relevant_parameter_changes
      ),
      'manualEditCount',case when v_scope_kind='course' then (
        select count(*)::integer from private.course_events event_value
        where event_value.course_id=p_course_id
          and event_value.summary->>'applicationOrigin'='manual'
      ) when exists(
        select 1 from private.course_events event_value
        where event_value.course_id=p_course_id
          and event_value.summary->>'applicationOrigin'='manual'
      ) then null else 0 end,
      'repairs',jsonb_build_object(
        'acceptedCount',(select count(*)::integer from latest_repairs
          where status in('applied','verified','rolled_back')),
        'rejectedCount',(select count(*)::integer from latest_repairs
          where status='rejected')
      ),
      'studyUnitChangesByOrigin',coalesce((select jsonb_agg(jsonb_build_object(
        'origin',change.origin,'createdCount',change.created_count,
        'revisedCount',change.revised_count
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
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_authoring_analytics_for_actor_v2(
  uuid,uuid,bigint,jsonb
) to service_role;

do $course_authoring_analytics_v2_postflight$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)'
      ::regprocedure::oid
  ) into v_definition;
  if strpos(lower(v_definition),'security definer')=0
     or strpos(v_definition,'require_service_role')=0
     or strpos(v_definition,'require_course_access_v1')=0
     or strpos(v_definition,'duration_milliseconds')>0
     or strpos(v_definition,'step_count')>0
     or strpos(v_definition,'fact_id')>0
     or strpos(v_definition,'nextCursor')>0
     or strpos(v_definition,'datasets')>0 then
    raise exception 'Segurança ou simplificação da RPC de Analytics v2 divergiu.'
      using errcode='55000';
  end if;
  if to_regprocedure(
       'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)'
     ) is not null
     or to_regclass('private.course_events_analytics_v1_idx') is not null then
    raise exception 'A projeção técnica de Analytics v1 ainda existe.' using errcode='55000';
  end if;
  if has_function_privilege(
       'anon',
       'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)',
       'execute'
     ) or has_function_privilege(
       'authenticated',
       'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)',
       'execute'
     ) or not has_function_privilege(
       'service_role',
       'public.get_owned_course_authoring_analytics_for_actor_v2(uuid,uuid,bigint,jsonb)',
       'execute'
     ) then
    raise exception 'Privilégios da RPC de Analytics v2 divergem.' using errcode='55000';
  end if;
end;
$course_authoring_analytics_v2_postflight$;

do $advance_course_authoring_analytics_v2_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  select jsonb_agg(feature.value order by feature.value)
  into v_features
  from (
    select distinct existing.value
    from jsonb_array_elements_text(v_manifest->'features') existing(value)
    where existing.value<>'course-authoring-analytics-v1'
    union
    select 'course-authoring-analytics-v2'
  ) feature;
  v_manifest:=jsonb_build_object(
    'schemaRevision','20260902040050',
    'contractVersion',(v_manifest->>'contractVersion')::integer,
    'features',v_features
  );
  v_body:='select '||quote_literal(v_manifest::text)||'::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      ||'returns jsonb language sql stable security definer '
      ||'set search_path = pg_catalog as %L',v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_authoring_analytics_v2_manifest$;

commit;
