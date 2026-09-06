-- Current owner-only analytics, complete planned inventory and revision-bound export basis.
-- Counts describe content and producer declarations; they do not infer pedagogical quality.
begin;
CREATE OR REPLACE FUNCTION public.get_owned_course_authoring_analytics_for_actor_v4(p_actor_id uuid, p_course_id uuid, p_expected_course_revision bigint, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
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
  ),

  parameter_value_rows as materialized (
    select parameter.value->>'parameterId' as parameter_id,
      parameter.value->'value' as value,parameter.value->>'origin' as origin,parameter.value->>'reason' as reason,
      parameter.value->>'sourceScopeKind' as source_scope_kind,
      count(distinct design.study_unit_id)::integer as study_unit_count
    from current_design design
    cross join lateral jsonb_array_elements(design.snapshot->'parameters') parameter(value)
    where parameter.value->>'parameterId'
        <> 'new_analysis_unit_ceiling_per_expository_study_unit'
      or design.application->>'mode' in('expository','mixed')
    group by parameter.value->>'parameterId',parameter.value->'value',
      parameter.value->>'origin',parameter.value->>'reason',parameter.value->>'sourceScopeKind'
  ),
  editorial_per_unit as materialized (
    select design.study_unit_id,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'direction' else null end as direction,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'origin' else null end as origin,
      case when char_length(direction.value->>'direction') <= 4000
        then direction.value->>'sourceScopeKind' else null end
        as source_scope_kind,
      char_length(direction.value->>'direction') > 4000 as truncated
    from current_design design
    left join lateral jsonb_array_elements(
      design.snapshot->'editorialDirections'
    ) direction(value) on true
  ),
  editorial_rows as materialized (
    select editorial.direction,editorial.origin,editorial.source_scope_kind,
      count(distinct editorial.study_unit_id)::integer as study_unit_count
    from editorial_per_unit editorial
    group by editorial.direction,editorial.origin,editorial.source_scope_kind
  ),
  unit_word_counts as materialized (
    select unit.entity_id as study_unit_id,
      coalesce(sum(
        private.count_course_component_authorial_words_v1(
          instance.instance->'data',null
        )
      ),0)::integer as word_count
    from scope_units unit
    left join lateral (
      select content.value as instance
      from jsonb_array_elements(unit.content->'content') content(value)
      union all
      select unit.content->'response'
      where jsonb_typeof(unit.content->'response')='object'
      union all
      select feedback.value
      from jsonb_array_elements(unit.content->'feedback') feedback(value)
    ) instance on true
    group by unit.entity_id
  ),
  word_count_rows as materialized (
    select unit.word_count,count(*)::integer as study_unit_count
    from unit_word_counts unit
    group by unit.word_count
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
    select role_value.value as role,
      count(distinct source_link.source_id)::integer as source_count,
      count(distinct anchor_link.anchor_id)::integer as anchor_count,
      count(distinct attribution.study_unit_id)::integer as study_unit_count
    from effective_attributions attribution
    join private.course_source_attribution_sources source_link
      on source_link.course_id = p_course_id
     and source_link.attribution_id = attribution.attribution_id
    join private.course_sources source
      on source.course_id=source_link.course_id
     and source.source_id=source_link.source_id
    left join private.course_source_attribution_anchors anchor_link
      on anchor_link.course_id = source_link.course_id
     and anchor_link.attribution_id = source_link.attribution_id
     and anchor_link.source_ordinal = source_link.source_ordinal
    cross join lateral jsonb_array_elements_text(source_link.roles) role_value(value)
    group by role_value.value
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
    select format('Unidades de estudo sem informações pedagógicas completas: %s.',
      count(*)::integer) as message
    from scope_units unit
    where not exists(
      select 1 from current_design design where design.study_unit_id = unit.entity_id
    )
    having count(*) > 0
    union all
    select format('Unidades de estudo sem configuração aplicada completa: %s.',
      count(*)::integer)
    from scope_units unit
    left join current_design design on design.study_unit_id = unit.entity_id
    where design.study_unit_id is null
      or jsonb_array_length(design.snapshot->'parameters') <> (select count(*) from private.course_design_parameter_definitions)
    having count(*) > 0
    union all
    select format('Direções editoriais que não puderam ser mostradas integralmente: %s.',
      count(*)::integer)
    from editorial_per_unit editorial where editorial.truncated
    having count(*) > 0
    union all
    select 'Há unidades de estudo cuja origem de autoria não foi registrada.'
    where exists(
      select 1 from scope_units unit
      where unit.created_origin is null
        or unit.version > 1 and unit.last_revision_origin is null
    )
  )
  select jsonb_build_object(
    'contract','aralearn.course-authoring-analytics.v4',
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
      'practiceSequence',coalesce((select jsonb_agg(jsonb_build_object('studyUnitRef',unit.entity_id,'position',unit.analytics_position,'mode',unit.design_application->>'mode') order by unit.analytics_position) from scope_units unit),'[]'::jsonb),
      
      'parameters',coalesce((select jsonb_agg(jsonb_build_object(
        'parameterId',definition.parameter_id,
        'label',definition.definition->>'label','definition',definition.definition,
        'valueKind',case definition.value_kind when 'set' then 'string_list'
          else definition.value_kind end,
        'effectiveValues',coalesce((select jsonb_agg(jsonb_build_object(
          'value',value_row.value,'origin',value_row.origin,'reason',value_row.reason,
          'sourceScopeKind',value_row.source_scope_kind,
          'studyUnitCount',value_row.study_unit_count
        ) order by value_row.value::text,value_row.origin nulls first,
          value_row.source_scope_kind nulls first)
          from parameter_value_rows value_row
          where value_row.parameter_id = definition.parameter_id),'[]'::jsonb)
      ) order by definition.ordinal)
      from private.course_design_parameter_definitions definition),'[]'::jsonb),
      'editorialDirections',coalesce((select jsonb_agg(jsonb_build_object(
        'direction',editorial.direction,'origin',editorial.origin,
        'sourceScopeKind',editorial.source_scope_kind,
        'studyUnitCount',editorial.study_unit_count
      ) order by editorial.direction nulls first,editorial.origin nulls first,
        editorial.source_scope_kind nulls first)
        from editorial_rows editorial),'[]'::jsonb),
      'wordCountsByStudyUnit',coalesce((select jsonb_agg(jsonb_build_object(
        'wordCount',word_count.word_count,
        'studyUnitCount',word_count.study_unit_count
      ) order by word_count.word_count)
        from word_count_rows word_count),'[]'::jsonb),

      'analysisUnits',coalesce((select jsonb_agg(jsonb_build_object(
        'position',analysis.position,'statement',analysis.statement,
        'introductionCount',coalesce((select count(*)::integer
          from introduction_rows introduction
          where introduction.analysis_id=analysis.analysis_id::text),0),
        'useCount',coalesce((select count(*)::integer
          from scope_units unit
          where coalesce(
            unit.design_application->'usedInstructionalAnalysisUnitIds',
            '[]'::jsonb
          ) ? analysis.analysis_id::text),0),
        'revisitCount',coalesce((select count(*)::integer
          from scope_units unit
          where not (coalesce(
              unit.design_application->'introducedInstructionalAnalysisUnitIds',
              '[]'::jsonb
            ) ? analysis.analysis_id::text)
            and exists(
              select 1 from jsonb_array_elements(coalesce(
                unit.design_application->'explanationApplications','[]'::jsonb
              )) explanation(value)
              where explanation.value->>'instructionalAnalysisUnitId'
                =analysis.analysis_id::text
            )),0)
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
    'basis',jsonb_build_object(
      'inventoryScope',jsonb_build_object('kind','course','ref',null,'label',v_course.title),
      'analysisUnits',coalesce((select jsonb_agg(jsonb_build_object('ref',item.id,'position',item.position+1,'statement',item.statement,'description',item.description) order by item.position,item.id)
        from private.course_instructional_plan_items item where item.course_id=p_course_id and item.item_kind='instructional_analysis_unit'),'[]'::jsonb),
      'evidenceRequirements',coalesce((select jsonb_agg(jsonb_build_object('ref',item.id,'position',item.position+1,'statement',item.statement,'description',item.description) order by item.position,item.id)
        from private.course_instructional_plan_items item where item.course_id=p_course_id and item.item_kind='evidence_requirement'),'[]'::jsonb),
      'sources',coalesce((select jsonb_agg(jsonb_build_object(
        'sourceRef',s.source_id,'revision',s.revision,
        'document',jsonb_build_object('kind',s.kind,'defaultRoles',s.default_roles,'title',s.title,'authors',s.authors,
          'publicationDate',s.publication_date,'identifier',s.identifier,'language',s.language,'citationMode',s.citation_mode,
          'citationText',s.citation_text,'bibliographic',s.bibliographic,'url',s.url,'editionOrVersion',s.edition_or_version,
          'origin',s.origin,'availability',s.availability,'verificationStatus',s.verification_status,'studyVisibility',s.study_visibility),
        'attachments',coalesce((select jsonb_agg(jsonb_build_object('contentHash',a.content_hash,'byteSize',a.byte_size,'mediaType',a.media_type) order by a.content_hash)
          from private.course_source_attachments a where a.course_id=p_course_id and a.source_id=s.source_id and a.status='active'),'[]'::jsonb),
        'anchors',coalesce((select jsonb_agg(jsonb_build_object('anchorRef',a.anchor_id,'contentHash',a.content_hash,'selector',a.selector,'humanLocator',a.human_locator) order by a.anchor_id)
          from private.course_source_anchors a where a.course_id=p_course_id and a.source_id=s.source_id and a.status='active'),'[]'::jsonb)
      ) order by s.source_id) from private.course_sources s where s.course_id=p_course_id and s.status='active'),'[]'::jsonb),
      'studyUnits',coalesce((select jsonb_agg(jsonb_build_object(
        'studyUnitRef',u.entity_id,'position',u.analytics_position,'title',u.content->>'title',
        'requestedParameters',(select jsonb_agg(jsonb_build_object('parameterId',p.value->>'parameterId',
          'mode',p.value#>'{effectiveAssignment,mode}','value',p.value#>'{effectiveAssignment,value}',
          'origin',p.value#>'{effectiveAssignment,origin}','reason',p.value#>'{effectiveAssignment,reason}',
          'sourceScope',case when p.value#>'{effectiveAssignment,sourceScope}'='null'::jsonb then null else jsonb_build_object(
            'kind',p.value#>>'{effectiveAssignment,sourceScope,kind}',
            'ref',case when p.value#>>'{effectiveAssignment,sourceScope,kind}'='course' then null else p.value#>>'{effectiveAssignment,sourceScope,ref}' end) end
        ) order by p.ordinality) from jsonb_array_elements(private.course_current_design_parameters_v1(p_course_id,private.course_design_scope_path_v1(p_course_id,'study_unit',u.entity_id))) with ordinality p(value,ordinality)),
        'appliedParameters',case when d.study_unit_id is null then null else (select jsonb_agg(jsonb_build_object(
          'parameterId',p.value->>'parameterId','value',p.value->'value','origin',p.value->>'origin','reason',p.value->>'reason',
          'sourceScope',case when p.value->>'sourceScopeKind' is null then null else jsonb_build_object('kind',p.value->>'sourceScopeKind',
            'ref',case when p.value->>'sourceScopeKind'='course' then null else p.value->>'sourceScopeRef' end) end
        ) order by p.ordinality) from jsonb_array_elements(d.snapshot->'parameters') with ordinality p(value,ordinality)) end,
        'declaration',case when d.study_unit_id is null then null else jsonb_build_object(
          'mode',d.application->'mode','introducedInstructionalAnalysisUnitIds',d.application->'introducedInstructionalAnalysisUnitIds',
          'usedInstructionalAnalysisUnitIds',d.application->'usedInstructionalAnalysisUnitIds',
          'explanationApplications',d.application->'explanationApplications','practiceApplications',d.application->'practiceApplications') end,
        'components',coalesce((select jsonb_agg(jsonb_build_object('componentRef',(i.instance->>'package')||'@'||(i.instance->>'version'),
          'instanceRef',i.instance->>'id','slot',i.slot) order by i.slot,i.ordinality) from (
          select c.value instance,'content' slot,c.ordinality from jsonb_array_elements(u.content->'content') with ordinality c
          union all select u.content->'response','response',1 where jsonb_typeof(u.content->'response')='object'
          union all select f.value,'feedback',f.ordinality from jsonb_array_elements(u.content->'feedback') with ordinality f
        ) i),'[]'::jsonb),
        'wordCount',w.word_count,
        'sourceLinks',private.course_source_links_v1(p_course_id,(private.course_effective_source_attribution_v1(p_course_id,'study_unit',u.entity_id)).id)
      ) order by u.analytics_position) from scope_units u left join current_design d on d.study_unit_id=u.entity_id
        join unit_word_counts w on w.study_unit_id=u.entity_id),'[]'::jsonb)
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
$function$
;

revoke all on function public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.get_owned_course_authoring_analytics_for_actor_v4(uuid,uuid,bigint,jsonb) to service_role;
drop function public.get_owned_course_authoring_analytics_for_actor_v3(uuid,uuid,bigint,jsonb);

do $manifest$ declare v jsonb; begin
 v:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905154944');
 v:=jsonb_set(v,'{features}',(select jsonb_agg(case when feature='course-authoring-analytics-v3' then 'course-authoring-analytics-v4' else feature end order by ordinal)
   from jsonb_array_elements_text(v->'features') with ordinality f(feature,ordinal))||'["course-authoring-comparison-v1"]'::jsonb);
 execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(v::text)||'::jsonb');
end $manifest$;
commit;
