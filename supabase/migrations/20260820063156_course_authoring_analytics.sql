-- #127: fatos de Autoria consultados na própria autoridade relacional.
-- A projeção é regenerável e não cria coleta, histórico ou cópia analítica.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-authoring-analytics-v1',0
));

do $course_authoring_analytics_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_events') is null
     or to_regclass('private.course_authoring_parts') is null
     or to_regclass('private.course_authoring_part_materializations') is null
     or to_regclass('private.course_authoring_part_materialization_steps') is null
     or to_regclass('private.course_design_parameter_definitions') is null
     or to_regclass('private.course_design_parameter_changes') is null
     or to_regclass('private.course_authoring_guidance_revisions') is null
     or to_regclass('private.course_authoring_guidance_interpretations') is null
     or to_regclass('private.course_component_policy_changes') is null
     or to_regclass('private.course_source_revisions') is null
     or to_regclass('private.course_source_anchor_revisions') is null
     or to_regclass('private.course_source_attributions') is null
     or to_regclass('private.course_source_attribution_sources') is null
     or to_regclass('private.course_source_attribution_anchors') is null
     or to_regclass('private.course_source_attachments') is null
     or to_regclass('private.course_anchored_annotations') is null
     or to_regclass('private.course_anchored_annotation_events') is null
     or to_regclass('private.course_instructional_audit_runs') is null
     or to_regclass('private.course_audit_findings') is null
     or to_regclass('private.course_authoring_corrections') is null
     or to_regclass('private.course_audit_finding_annotations') is null
     or to_regclass('private.course_variant_plan_checkpoints') is null
     or to_regclass('private.course_variant_comparison_sets') is null
     or to_regclass('private.course_variant_comparison_members') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('private.course_source_json_hash_v1(jsonb)') is null then
    raise exception 'Dependências dos fatos de Autoria ausentes.'
      using errcode = '55000';
  end if;
  if to_regprocedure(
    'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)'
  ) is not null then
    raise exception 'A RPC de fatos de Autoria já existe.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820061206'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'course-authoring-part-materialization-v1',
       'course-design-parameters-v1',
       'course-sources-v1',
       'course-source-pdf-attachments-v1',
       'course-anchored-annotations-v1',
       'course-audit-cycle-v1',
       'course-variant-comparisons-v1'
     ]) then
    raise exception 'Manifesto anterior aos fatos de Autoria é incompatível.'
      using errcode = '55000';
  end if;
end;
$course_authoring_analytics_preflight$;

create function public.get_owned_course_authoring_analytics_for_actor_v1(
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
  v_allowed_datasets constant text[] := array[
    'activity','materializations','design','sources','annotations','audits','variants'
  ];
  v_allowed_channels constant text[] := array[
    'authoring_interface','authoring_chat','study_interface','audit_process'
  ];
  v_datasets text[];
  v_channels text[];
  v_origins text[];
  v_states text[];
  v_from timestamptz;
  v_to timestamptz;
  v_limit integer;
  v_cursor text;
  v_cursor_encoded text;
  v_cursor_payload jsonb;
  v_cursor_at timestamptz;
  v_cursor_fact_id text;
  v_cutoff timestamptz := statement_timestamp();
  v_course_revision bigint;
  v_query_hash text;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);

  if p_expected_course_revision is null or p_expected_course_revision < 1
     or p_query is null or jsonb_typeof(p_query) <> 'object'
     or not (p_query ?& array[
       'datasets','channels','origins','states','from','to','limit','cursor'
     ])
     or p_query - 'datasets' - 'channels' - 'origins' - 'states'
          - 'from' - 'to' - 'limit' - 'cursor' <> '{}'::jsonb
     or jsonb_typeof(p_query->'datasets') <> 'array'
     or jsonb_array_length(p_query->'datasets') not between 1 and 7
     or jsonb_typeof(p_query->'channels') <> 'array'
     or jsonb_array_length(p_query->'channels') > 4
     or jsonb_typeof(p_query->'origins') <> 'array'
     or jsonb_array_length(p_query->'origins') > 16
     or jsonb_typeof(p_query->'states') <> 'array'
     or jsonb_array_length(p_query->'states') > 24
     or jsonb_typeof(p_query->'limit') <> 'number'
     or p_query->>'limit' !~ '^[1-9][0-9]{0,2}$'
     or (p_query->>'limit')::integer not between 1 and 200
     or p_query->'from' <> 'null'::jsonb
        and jsonb_typeof(p_query->'from') <> 'string'
     or p_query->'to' <> 'null'::jsonb
        and jsonb_typeof(p_query->'to') <> 'string'
     or p_query->'cursor' <> 'null'::jsonb
        and jsonb_typeof(p_query->'cursor') <> 'string' then
    raise exception 'Consulta de fatos de Autoria inválida.' using errcode = '22023';
  end if;

  select array_agg(item.value order by item.ordinal)
  into v_datasets
  from jsonb_array_elements_text(p_query->'datasets')
    with ordinality item(value,ordinal);
  select coalesce(array_agg(item.value order by item.ordinal),'{}'::text[])
  into v_channels
  from jsonb_array_elements_text(p_query->'channels')
    with ordinality item(value,ordinal);
  select coalesce(array_agg(item.value order by item.ordinal),'{}'::text[])
  into v_origins
  from jsonb_array_elements_text(p_query->'origins')
    with ordinality item(value,ordinal);
  select coalesce(array_agg(item.value order by item.ordinal),'{}'::text[])
  into v_states
  from jsonb_array_elements_text(p_query->'states')
    with ordinality item(value,ordinal);

  if exists(select 1 from unnest(v_datasets) value where not value = any(v_allowed_datasets))
     or cardinality(v_datasets) <> (select count(distinct value) from unnest(v_datasets) value)
     or exists(select 1 from unnest(v_channels) value where not value = any(v_allowed_channels))
     or cardinality(v_channels) <> (select count(distinct value) from unnest(v_channels) value)
     or exists(select 1 from unnest(v_origins) value
       where value !~ '^[a-z][a-z0-9._:-]{0,79}$')
     or cardinality(v_origins) <> (select count(distinct value) from unnest(v_origins) value)
     or exists(select 1 from unnest(v_states) value
       where value !~ '^[a-z][a-z0-9._:-]{0,79}$')
     or cardinality(v_states) <> (select count(distinct value) from unnest(v_states) value) then
    raise exception 'Filtros de fatos de Autoria inválidos.' using errcode = '22023';
  end if;

  begin
    v_from := case when p_query->'from' = 'null'::jsonb
      then null else (p_query->>'from')::timestamptz end;
    v_to := case when p_query->'to' = 'null'::jsonb
      then null else (p_query->>'to')::timestamptz end;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Período dos fatos de Autoria inválido.' using errcode = '22023';
  end;
  if v_from is not null and v_to is not null and v_from > v_to then
    raise exception 'Período dos fatos de Autoria invertido.' using errcode = '22023';
  end if;
  v_limit := (p_query->>'limit')::integer;
  v_cursor := p_query->>'cursor';
  if v_cursor is not null and (
       char_length(v_cursor) not between 1 and 2048
       or v_cursor !~ '^[A-Za-z0-9_-]+$'
     ) then
    raise exception 'Cursor dos fatos de Autoria inválido.' using errcode = '22023';
  end if;

  select course.revision into v_course_revision
  from public.courses course where course.id = p_course_id;
  if v_course_revision is distinct from p_expected_course_revision then
    raise exception 'A revisão do Curso mudou durante a consulta.' using errcode = '40001';
  end if;

  v_query_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'datasets',p_query->'datasets',
    'channels',p_query->'channels',
    'origins',p_query->'origins',
    'states',p_query->'states',
    'from',p_query->'from',
    'to',p_query->'to',
    'limit',v_limit
  ));

  if v_cursor is not null then
    begin
      v_cursor_encoded := translate(v_cursor,'-_','+/');
      v_cursor_encoded := v_cursor_encoded || repeat(
        '=',(4-char_length(v_cursor_encoded)%4)%4
      );
      v_cursor_payload := convert_from(
        decode(v_cursor_encoded,'base64'),'UTF8'
      )::jsonb;
      if jsonb_typeof(v_cursor_payload) <> 'object'
         or not (v_cursor_payload ?& array[
           'version','queryHash','courseRevision','cutoff','occurredAt','factId'
         ])
         or v_cursor_payload - 'version' - 'queryHash' - 'courseRevision'
              - 'cutoff' - 'occurredAt' - 'factId' <> '{}'::jsonb
         or v_cursor_payload->>'version' <> '1'
         or v_cursor_payload->>'queryHash' <> v_query_hash
         or v_cursor_payload->>'courseRevision' !~ '^[1-9][0-9]*$'
         or (v_cursor_payload->>'courseRevision')::bigint <> v_course_revision
         or v_cursor_payload->>'factId' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$' then
        raise exception 'Cursor incompatível.' using errcode = '22023';
      end if;
      v_cutoff := (v_cursor_payload->>'cutoff')::timestamptz;
      v_cursor_at := (v_cursor_payload->>'occurredAt')::timestamptz;
      v_cursor_fact_id := v_cursor_payload->>'factId';
      if v_cursor_at > v_cutoff then
        raise exception 'Cursor temporalmente inválido.' using errcode = '22023';
      end if;
    exception when invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow or data_exception then
      raise exception 'Cursor dos fatos de Autoria inválido.' using errcode = '22023';
    end;
  end if;

  with
  materialization_steps as materialized (
    select step.course_id,step.materialization_id,
      count(*)::integer as step_count,
      count(*) filter(
        where step.step_kind='didactic_microsequence_materialization'
          and step.status='completed'
      )::integer as produced_study_unit_count
    from private.course_authoring_part_materialization_steps step
    where step.course_id=p_course_id
    group by step.course_id,step.materialization_id
  ),
  materialization_revisions as materialized (
    select event_value.summary->>'materializationId' as materialization_id,
      max(event_value.revision)::bigint as course_revision
    from private.course_events event_value
    where event_value.course_id=p_course_id
      and event_value.summary ? 'materializationId'
    group by event_value.summary->>'materializationId'
  ),
  source_attachment_counts as materialized (
    select attachment.course_id,attachment.source_id,attachment.source_revision,
      count(*)::integer as attachment_count
    from private.course_source_attachments attachment
    where attachment.course_id=p_course_id
    group by attachment.course_id,attachment.source_id,attachment.source_revision
  ),
  attribution_counts as materialized (
    select attribution.course_id,attribution.id,
      count(distinct source_link.source_ordinal)::integer as source_count,
      count(anchor_link.anchor_ordinal)::integer as anchor_count,
      min(source_link.source_id) as first_source_id
    from private.course_source_attributions attribution
    left join private.course_source_attribution_sources source_link
      on source_link.course_id=attribution.course_id
     and source_link.attribution_id=attribution.id
    left join private.course_source_attribution_anchors anchor_link
      on anchor_link.course_id=source_link.course_id
     and anchor_link.attribution_id=source_link.attribution_id
     and anchor_link.source_ordinal=source_link.source_ordinal
    where attribution.course_id=p_course_id
    group by attribution.course_id,attribution.id
  ),
  finding_annotation_counts as materialized (
    select link.course_id,link.finding_id,
      count(distinct link.annotation_id)::integer as annotation_count
    from private.course_audit_finding_annotations link
    where link.course_id=p_course_id
    group by link.course_id,link.finding_id
  ),
  variant_sets as materialized (
    select distinct comparison.id
    from private.course_variant_comparison_sets comparison
    left join private.course_variant_comparison_members membership
      on membership.comparison_set_id=comparison.id
    where comparison.owner_id=p_actor_id
      and (comparison.source_course_id=p_course_id or membership.course_id=p_course_id)
  ),
  raw_facts as materialized (
    select
      'activity:event:'||event_value.id::text as fact_id,
      'activity'::text as dataset,
      coalesce(nullif(event_value.summary->>'activityKind',''),event_value.operation) as kind,
      event_value.created_at as occurred_at,
      event_value.revision::bigint as course_revision,
      case event_value.summary->>'channel'
        when 'application' then 'authoring_interface'
        when 'mcp' then 'authoring_chat'
        else null
      end::text as channel,
      null::text as origin,
      null::text as state,
      jsonb_build_object(
        'kind','course','id',event_value.course_id::text,'label',course.title
      ) as subject,
      null::jsonb as related,
      jsonb_build_object(
        'operation',event_value.operation,
        'activity_kind',nullif(event_value.summary->>'activityKind',''),
        'created_count',case when event_value.summary->>'createdCount'~'^[0-9]+$'
          then (event_value.summary->>'createdCount')::bigint else null end,
        'updated_count',case when event_value.summary->>'updatedCount'~'^[0-9]+$'
          then (event_value.summary->>'updatedCount')::bigint else null end,
        'deleted_count',case when event_value.summary->>'deletedCount'~'^[0-9]+$'
          then (event_value.summary->>'deletedCount')::bigint else null end
      ) as values,
      to_jsonb(array_remove(array[
        case when event_value.summary->>'channel' not in('application','mcp')
          then 'Canal não registrado para este evento.' end
      ]::text[],null)) as missing_data
    from private.course_events event_value
    join public.courses course on course.id=event_value.course_id
    where event_value.course_id=p_course_id

    union all
    select
      'materializations:attempt:'||materialization.id::text,
      'materializations',
      'part_materialization_'||materialization.status,
      coalesce(materialization.completed_at,materialization.updated_at,materialization.started_at),
      revision.course_revision,
      case materialization.channel
        when 'application' then 'authoring_interface'
        when 'mcp' then 'authoring_chat'
      end,
      'automatic',materialization.status,
      jsonb_build_object(
        'kind','authoring_part','id',part.id::text,'label',part.title
      ),
      jsonb_build_object(
        'kind','materialization','id',materialization.id::text,'label',null
      ),
      jsonb_build_object(
        'materialization_version',materialization.version,
        'authoring_part_version',materialization.authoring_part_version,
        'duration_milliseconds',case when materialization.completed_at is null
          then null else round(extract(epoch from
            (materialization.completed_at-materialization.started_at))*1000) end,
        'step_count',coalesce(steps.step_count,0),
        'produced_study_units',coalesce(steps.produced_study_unit_count,0),
        'configuration_hash',private.course_source_json_hash_v1(
          materialization.design_context
        )
      ),
      to_jsonb(array_remove(array[
        case when revision.course_revision is null
          then 'Revisão do Curso não registrada para esta materialização.' end,
        case when materialization.completed_at is null
          then 'Duração ainda não disponível.' end
      ]::text[],null))
    from private.course_authoring_part_materializations materialization
    join private.course_authoring_parts part
      on part.course_id=materialization.course_id
     and part.id=materialization.authoring_part_id
    left join materialization_steps steps
      on steps.course_id=materialization.course_id
     and steps.materialization_id=materialization.id
    left join materialization_revisions revision
      on revision.materialization_id=materialization.id::text
    where materialization.course_id=p_course_id

    union all
    select
      'design:parameter:'||change.id::text,'design',
      'design_parameter_'||change.action,change.created_at,change.course_revision,
      case change.channel when 'application' then 'authoring_interface'
        when 'mcp' then 'authoring_chat' else null end,
      change.origin,change.action,
      jsonb_build_object(
        'kind',change.scope_kind,
        'id',case when change.scope_ref~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then change.scope_ref else 'ref-'||substr(private.course_source_json_hash_v1(
            to_jsonb(change.scope_ref)),1,32) end,
        'label',null
      ),
      jsonb_build_object(
        'kind','design_parameter','id',change.parameter_id,
        'label',definition.definition->>'label'
      ),
      jsonb_build_object(
        'action',change.action,'parameter_id',change.parameter_id,
        'catalog_version',definition.catalog_version,
        'value_kind',definition.value_kind,
        'configuration_hash',case when change.value is null then null
          else private.course_source_json_hash_v1(change.value) end,
        'configuration_item_count',case jsonb_typeof(change.value)
          when 'array' then jsonb_array_length(change.value)
          when 'number' then 1 else null end
      ),'[]'::jsonb
    from private.course_design_parameter_changes change
    join private.course_design_parameter_definitions definition
      on definition.parameter_id=change.parameter_id
    where change.course_id=p_course_id

    union all
    select
      'design:guidance:'||guidance.id::text,'design',
      'authoring_guidance_'||guidance.action,guidance.created_at,
      guidance.course_revision,
      case guidance.channel when 'application' then 'authoring_interface'
        when 'mcp' then 'authoring_chat' else null end,
      guidance.origin,guidance.action,
      jsonb_build_object(
        'kind',guidance.scope_kind,
        'id',case when guidance.scope_ref~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then guidance.scope_ref else 'ref-'||substr(private.course_source_json_hash_v1(
            to_jsonb(guidance.scope_ref)),1,32) end,'label',null
      ),
      jsonb_build_object(
        'kind','guidance_revision','id',guidance.revision_id::text,'label',null
      ),
      jsonb_build_object(
        'action',guidance.action,
        'guidance_hash',case when guidance.guidance is null then null
          else private.course_source_json_hash_v1(to_jsonb(guidance.guidance)) end,
        'guidance_character_count',case when guidance.guidance is null then null
          else char_length(guidance.guidance) end
      ),'[]'::jsonb
    from private.course_authoring_guidance_revisions guidance
    where guidance.course_id=p_course_id

    union all
    select
      'design:interpretation:'||interpretation.id::text,'design',
      'authoring_guidance_interpreted',interpretation.created_at,
      interpretation.course_revision,
      case interpretation.channel when 'application' then 'authoring_interface'
        when 'mcp' then 'authoring_chat' end,
      'automatic',null,
      jsonb_build_object(
        'kind',guidance.scope_kind,
        'id',case when guidance.scope_ref~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then guidance.scope_ref else 'ref-'||substr(private.course_source_json_hash_v1(
            to_jsonb(guidance.scope_ref)),1,32) end,'label',null
      ),
      jsonb_build_object(
        'kind','guidance_revision','id',guidance.revision_id::text,'label',null
      ),
      jsonb_build_object(
        'interpretation_hash',private.course_source_json_hash_v1(
          interpretation.interpretation
        )
      ),'[]'::jsonb
    from private.course_authoring_guidance_interpretations interpretation
    join private.course_authoring_guidance_revisions guidance
      on guidance.revision_id=interpretation.guidance_revision_id
    where interpretation.course_id=p_course_id

    union all
    select
      'design:policy:'||change.id::text,'design',
      'component_policy_'||change.action,change.created_at,change.course_revision,
      case change.channel when 'application' then 'authoring_interface'
        when 'mcp' then 'authoring_chat' end,
      change.origin,change.action,
      jsonb_build_object(
        'kind',change.scope_kind,
        'id',case when change.scope_ref~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then change.scope_ref else 'ref-'||substr(private.course_source_json_hash_v1(
            to_jsonb(change.scope_ref)),1,32) end,'label',null
      ),null,
      jsonb_build_object(
        'action',change.action,
        'configuration_hash',case when change.policy is null then null
          else private.course_source_json_hash_v1(change.policy) end
      ),'[]'::jsonb
    from private.course_component_policy_changes change
    where change.course_id=p_course_id

    union all
    select
      'sources:source:'||substr(private.course_source_json_hash_v1(
        jsonb_build_array(source_value.source_id,source_value.revision)
      ),1,48),
      'sources','source_'||source_value.status,source_value.created_at,null,
      null,null,source_value.status,
      jsonb_build_object(
        'kind','source','id','source-'||substr(private.course_source_json_hash_v1(
          to_jsonb(source_value.source_id)),1,32),'label',source_value.title
      ),null,
      jsonb_build_object(
        'source_revision',source_value.revision,'source_kind',source_value.kind,
        'study_visibility',source_value.study_visibility,
        'has_citation',source_value.citation_text is not null,
        'has_url',source_value.url is not null,
        'attachment_count',coalesce(attachment_count.attachment_count,0)
      ),jsonb_build_array('Revisão do Curso não registrada para este fato de Fonte.')
    from private.course_source_revisions source_value
    left join source_attachment_counts attachment_count
      on attachment_count.course_id=source_value.course_id
     and attachment_count.source_id=source_value.source_id
     and attachment_count.source_revision=source_value.revision
    where source_value.course_id=p_course_id

    union all
    select
      'sources:anchor:'||substr(private.course_source_json_hash_v1(
        jsonb_build_array(anchor.anchor_id,anchor.revision)
      ),1,48),
      'sources','source_anchor_'||anchor.status,anchor.created_at,null,
      null,null,anchor.status,
      jsonb_build_object(
        'kind','source_anchor','id','anchor-'||substr(
          private.course_source_json_hash_v1(to_jsonb(anchor.anchor_id)),1,32
        ),'label',null
      ),
      jsonb_build_object(
        'kind','source','id','source-'||substr(
          private.course_source_json_hash_v1(to_jsonb(anchor.source_id)),1,32
        ),'label',null
      ),
      jsonb_build_object(
        'anchor_revision',anchor.revision,'source_revision',anchor.source_revision,
        'selector_kind',anchor.selector->>'kind',
        'has_verification_excerpt',anchor.verification_excerpt is not null
      ),jsonb_build_array('Revisão do Curso não registrada para esta âncora.')
    from private.course_source_anchor_revisions anchor
    where anchor.course_id=p_course_id

    union all
    select
      'sources:attribution:'||attribution.id::text,'sources',
      'source_attribution_recorded',attribution.created_at,null,null,null,'recorded',
      jsonb_build_object(
        'kind',attribution.target_kind,
        'id',case when attribution.target_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then attribution.target_id else 'ref-'||substr(
            private.course_source_json_hash_v1(to_jsonb(attribution.target_id)),1,32
          ) end,'label',null
      ),
      case when counts.first_source_id is null then null else jsonb_build_object(
        'kind','source','id','source-'||substr(private.course_source_json_hash_v1(
          to_jsonb(counts.first_source_id)),1,32),'label',null
      ) end,
      jsonb_build_object(
        'target_version',attribution.target_version,
        'attribution_revision',attribution.revision,
        'source_count',coalesce(counts.source_count,0),
        'anchor_count',coalesce(counts.anchor_count,0),
        'attribution_hash',attribution.attribution_hash
      ),jsonb_build_array('Revisão do Curso não registrada para esta atribuição.')
    from private.course_source_attributions attribution
    left join attribution_counts counts
      on counts.course_id=attribution.course_id and counts.id=attribution.id
    where attribution.course_id=p_course_id

    union all
    select
      'sources:attachment:'||substr(private.course_source_json_hash_v1(
        jsonb_build_array(attachment.source_id,attachment.source_revision,
          attachment.content_hash)
      ),1,48),
      'sources','source_attachment_recorded',attachment.created_at,null,
      null,null,'recorded',
      jsonb_build_object(
        'kind','source','id','source-'||substr(private.course_source_json_hash_v1(
          to_jsonb(attachment.source_id)),1,32),'label',source_value.title
      ),
      jsonb_build_object(
        'kind','source_attachment','id','sha256-'||attachment.content_hash,
        'label',null
      ),
      jsonb_build_object(
        'source_revision',attachment.source_revision,
        'content_hash',attachment.content_hash,
        'byte_size',attachment.byte_size,'media_type',attachment.media_type
      ),jsonb_build_array('Revisão do Curso não registrada para este anexo.')
    from private.course_source_attachments attachment
    join private.course_source_revisions source_value
      on source_value.course_id=attachment.course_id
     and source_value.source_id=attachment.source_id
     and source_value.revision=attachment.source_revision
    where attachment.course_id=p_course_id

    union all
    select
      'annotations:event:'||event_value.id::text,'annotations',
      'annotation_'||event_value.event_type,event_value.created_at,
      annotation.observed_course_revision,
      case annotation.channel
        when 'authoring_interface' then 'authoring_interface'
        when 'authoring_chat' then 'authoring_chat'
        when 'study_interface' then 'study_interface'
        when 'audit_interface' then 'audit_process'
        when 'audit_automation' then 'audit_process'
        else null
      end,
      annotation.origin,coalesce(event_value.metadata->>'state',event_value.event_type),
      case when jsonb_array_length(annotation.effective_subject_refs)>0
        then jsonb_build_object(
          'kind','topic',
          'id',case when annotation.effective_subject_refs->0->>'topicId'
              ~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
            then annotation.effective_subject_refs->0->>'topicId'
            else 'ref-'||substr(private.course_source_json_hash_v1(
              to_jsonb(annotation.effective_subject_refs->0->>'topicId')
            ),1,32) end,
          'label',annotation.effective_subject_refs->0->>'label'
        ) else jsonb_build_object(
          'kind',annotation.target_kind,
          'id',case when annotation.target_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
            then annotation.target_id else 'ref-'||substr(
              private.course_source_json_hash_v1(to_jsonb(annotation.target_id)),1,32
            ) end,'label',null
        ) end,
      jsonb_build_object(
        'kind','annotation','id',annotation.id::text,'label',null
      ),
      jsonb_build_object(
        'annotation_version',event_value.annotation_version,
        'event_type',event_value.event_type,
        'target_kind',annotation.target_kind,
        'category',event_value.metadata->>'category',
        'subject_count',case when event_value.metadata->>'subjectCount'~'^[0-9]+$'
          then (event_value.metadata->>'subjectCount')::integer else null end,
        'observed_target_version',annotation.observed_target_version,
        'automatic_method',annotation.automatic_method,
        'automatic_method_version',annotation.automatic_method_version,
        'effective_method',annotation.effective_method,
        'effective_method_version',annotation.effective_method_version,
        'effective_taxonomy_revision',annotation.effective_taxonomy_revision
      ),
      to_jsonb(array_remove(array[
        case when annotation.observed_course_revision is null
          then 'Revisão observada desconhecida.' end,
        case when annotation.channel='unknown_legacy'
          then 'Canal da observação desconhecido.' end
      ]::text[],null))
    from private.course_anchored_annotation_events event_value
    join private.course_anchored_annotations annotation
      on annotation.course_id=event_value.course_id
     and annotation.id=event_value.annotation_id
    where event_value.course_id=p_course_id

    union all
    select
      'audits:run:'||run.id::text,'audits','audit_run_'||run.run_kind,
      run.created_at,run.course_revision,'audit_process',run.origin,'recorded',
      jsonb_build_object(
        'kind','study_unit',
        'id',case when run.target_study_unit_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then run.target_study_unit_id else 'ref-'||substr(
            private.course_source_json_hash_v1(to_jsonb(run.target_study_unit_id)),1,32
          ) end,'label',run.target_path->-1->>'label'
      ),
      jsonb_build_object('kind','audit_run','id',run.id::text,'label',null),
      jsonb_build_object(
        'run_kind',run.run_kind,'method_id',run.method->>'id',
        'method_version',run.method->>'version','target_version',run.target_version,
        'check_count',jsonb_array_length(run.checks),
        'findings_created',run.findings_created,'context_hash',run.context_hash
      ),'[]'::jsonb
    from private.course_instructional_audit_runs run
    where run.course_id=p_course_id

    union all
    select
      'audits:finding:'||finding.finding_id::text||':'||finding.finding_version::text,
      'audits','audit_finding_'||finding.decision,finding.created_at,
      run.course_revision,'audit_process',run.origin,finding.status,
      jsonb_build_object(
        'kind','study_unit',
        'id',case when run.target_study_unit_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then run.target_study_unit_id else 'ref-'||substr(
            private.course_source_json_hash_v1(to_jsonb(run.target_study_unit_id)),1,32
          ) end,'label',run.target_path->-1->>'label'
      ),
      jsonb_build_object(
        'kind','audit_finding','id',finding.finding_id::text,'label',null
      ),
      jsonb_build_object(
        'finding_version',finding.finding_version,'decision',finding.decision,
        'code',finding.code,'severity',finding.severity,
        'annotation_count',coalesce(annotation_count.annotation_count,0)
      ),'[]'::jsonb
    from private.course_audit_findings finding
    join private.course_instructional_audit_runs run
      on run.course_id=finding.course_id and run.id=finding.origin_audit_run_id
    left join finding_annotation_counts annotation_count
      on annotation_count.course_id=finding.course_id
     and annotation_count.finding_id=finding.finding_id
    where finding.course_id=p_course_id

    union all
    select
      'audits:correction:'||correction.correction_id::text||':'
        ||correction.correction_version::text,
      'audits','authoring_correction_'||correction.status,correction.created_at,
      coalesce(case when correction.application->>'courseRevision'~'^[1-9][0-9]*$'
        then (correction.application->>'courseRevision')::bigint end,run.course_revision),
      'audit_process',run.origin,correction.status,
      jsonb_build_object(
        'kind','study_unit',
        'id',case when correction.target_study_unit_id
              ~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$'
          then correction.target_study_unit_id else 'ref-'||substr(
            private.course_source_json_hash_v1(to_jsonb(correction.target_study_unit_id)),1,32
          ) end,'label',run.target_path->-1->>'label'
      ),
      jsonb_build_object(
        'kind','audit_finding','id',correction.finding_id::text,'label',null
      ),
      jsonb_build_object(
        'correction_version',correction.correction_version,
        'finding_version',correction.finding_version,
        'base_target_version',correction.base_target_version,
        'applied_target_version',case when correction.application->>'targetVersion'
          ~'^[1-9][0-9]*$' then (correction.application->>'targetVersion')::bigint end,
        'verification_outcome',correction.verification->>'outcome',
        'rollback_course_revision',case when correction.rollback->>'courseRevision'
          ~'^[1-9][0-9]*$' then (correction.rollback->>'courseRevision')::bigint end
      ),'[]'::jsonb
    from private.course_authoring_corrections correction
    join private.course_audit_findings finding
      on finding.course_id=correction.course_id
     and finding.finding_id=correction.finding_id
     and finding.finding_version=correction.finding_version
    join private.course_instructional_audit_runs run
      on run.course_id=finding.course_id and run.id=finding.origin_audit_run_id
    where correction.course_id=p_course_id

    union all
    select
      'variants:checkpoint:'||checkpoint.id::text,'variants',
      'variant_checkpoint_recorded',checkpoint.created_at,
      checkpoint.source_course_revision,null,'author','recorded',
      jsonb_build_object(
        'kind','course','id',checkpoint.source_course_id::text,'label',source_course.title
      ),
      jsonb_build_object(
        'kind','variant_checkpoint','id',checkpoint.id::text,'label',null
      ),
      jsonb_build_object(
        'source_plan_version',checkpoint.source_plan_version,
        'configuration_hash',checkpoint.snapshot_hash
      ),'[]'::jsonb
    from private.course_variant_plan_checkpoints checkpoint
    join public.courses source_course on source_course.id=checkpoint.source_course_id
    where checkpoint.owner_id=p_actor_id and checkpoint.source_course_id=p_course_id

    union all
    select
      'variants:set:'||comparison.id::text,'variants',
      'variant_comparison_recorded',comparison.created_at,
      comparison.source_course_revision,null,'author','recorded',
      jsonb_build_object(
        'kind','course','id',comparison.source_course_id::text,'label',source_course.title
      ),
      jsonb_build_object(
        'kind','variant_comparison','id',comparison.id::text,'label',null
      ),
      jsonb_build_object(
        'set_version',comparison.version,
        'member_count',count(membership.course_id)::integer,
        'active_member_count',count(membership.course_id)
          filter(where membership.detached_at is null)::integer,
        'checkpoint_id',comparison.checkpoint_id::text
      ),'[]'::jsonb
    from private.course_variant_comparison_sets comparison
    join variant_sets relevant on relevant.id=comparison.id
    join public.courses source_course on source_course.id=comparison.source_course_id
    left join private.course_variant_comparison_members membership
      on membership.comparison_set_id=comparison.id
    group by comparison.id,comparison.created_at,comparison.source_course_revision,
      comparison.source_course_id,source_course.title,comparison.version,
      comparison.checkpoint_id

    union all
    select
      'variants:member:'||membership.comparison_set_id::text||':'
        ||membership.course_id::text,'variants',
      case when membership.detached_at is null
        then 'variant_member_attached' else 'variant_member_detached' end,
      coalesce(membership.detached_at,membership.created_at),
      membership.attached_course_revision,null,'author',
      case when membership.detached_at is null then 'attached' else 'detached' end,
      jsonb_build_object(
        'kind','course','id',membership.course_id::text,'label',membership.label
      ),
      jsonb_build_object(
        'kind','variant_comparison','id',membership.comparison_set_id::text,'label',null
      ),
      jsonb_build_object(
        'parameter_difference_count',jsonb_array_length(
          membership.declared_parameter_differences
        ),
        'has_component_policy_difference',
          membership.declared_component_policy_difference is not null,
        'configuration_hash',private.course_source_json_hash_v1(jsonb_build_object(
          'parameters',membership.declared_parameter_differences,
          'componentPolicy',membership.declared_component_policy_difference
        ))
      ),'[]'::jsonb
    from private.course_variant_comparison_members membership
    join variant_sets relevant on relevant.id=membership.comparison_set_id
    where membership.course_id=p_course_id or exists(
      select 1 from private.course_variant_comparison_sets comparison
      where comparison.id=membership.comparison_set_id
        and comparison.source_course_id=p_course_id
    )
  ),
  filtered_facts as materialized (
    select fact.*
    from raw_facts fact
    where fact.dataset=any(v_datasets)
      and (cardinality(v_channels)=0 or fact.channel=any(v_channels))
      and (cardinality(v_origins)=0 or fact.origin=any(v_origins))
      and (cardinality(v_states)=0 or fact.state=any(v_states))
      and (v_from is null or fact.occurred_at>=v_from)
      and (v_to is null or fact.occurred_at<=v_to)
      and fact.occurred_at<=v_cutoff
  ),
  ordered_facts as materialized (
    select fact.*
    from filtered_facts fact
    where v_cursor_at is null
      or (fact.occurred_at,fact.fact_id)<(v_cursor_at,v_cursor_fact_id)
    order by fact.occurred_at desc,fact.fact_id desc
    limit v_limit+1
  ),
  page_facts as materialized (
    select fact.* from ordered_facts fact
    order by fact.occurred_at desc,fact.fact_id desc limit v_limit
  ),
  last_fact as (
    select fact.occurred_at,fact.fact_id from page_facts fact
    order by fact.occurred_at,fact.fact_id limit 1
  ),
  by_dataset as (
    select fact.dataset as key,count(*)::bigint as value
    from filtered_facts fact group by fact.dataset
  ),
  by_kind as (
    select fact.dataset,fact.kind,fact.state,count(*)::bigint as value
    from filtered_facts fact group by fact.dataset,fact.kind,fact.state
  )
  select jsonb_build_object(
    'contract','aralearn.course-authoring-analytics-rows.v1',
    'courseId',p_course_id,
    'courseRevision',v_course_revision,
    'generatedAt',statement_timestamp(),
    'query',p_query,
    'facts',coalesce((select jsonb_agg(jsonb_build_object(
      'factId',fact.fact_id,'dataset',fact.dataset,'kind',fact.kind,
      'occurredAt',fact.occurred_at,'courseRevision',fact.course_revision,
      'channel',fact.channel,'origin',fact.origin,'state',fact.state,
      'subject',fact.subject,'related',fact.related,'values',fact.values,
      'missingData',fact.missing_data,'deepLink',null
    ) order by fact.occurred_at desc,fact.fact_id desc) from page_facts fact),'[]'::jsonb),
    'summary',jsonb_build_object(
      'factCount',(select count(*)::bigint from filtered_facts),
      'missingCourseRevisionCount',(select count(*)::bigint
        from filtered_facts fact where fact.course_revision is null),
      'byDataset',coalesce((select jsonb_agg(jsonb_build_object(
        'key',entry.key,'value',entry.value
      ) order by entry.key) from by_dataset entry),'[]'::jsonb),
      'byKind',coalesce((select jsonb_agg(jsonb_build_object(
        'dataset',entry.dataset,'kind',entry.kind,'state',entry.state,
        'value',entry.value
      ) order by entry.dataset,entry.kind,entry.state nulls first)
        from by_kind entry),'[]'::jsonb)
    ),
    'nextCursor',case when (select count(*) from ordered_facts)>v_limit then (
      select rtrim(translate(replace(replace(encode(convert_to(jsonb_build_object(
        'version',1,'queryHash',v_query_hash,'courseRevision',v_course_revision,
        'cutoff',v_cutoff,'occurredAt',last_value.occurred_at,
        'factId',last_value.fact_id
      )::text,'UTF8'),'base64'),E'\n',''),E'\r',''),'+/','-_'),'=')
      from last_fact last_value
    ) else null end
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_owned_course_authoring_analytics_for_actor_v1(
  uuid,uuid,bigint,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.get_owned_course_authoring_analytics_for_actor_v1(
  uuid,uuid,bigint,jsonb
) to service_role;

do $course_authoring_analytics_postflight$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)'
      ::regprocedure::oid
  ) into v_definition;
  if strpos(lower(v_definition),'security definer')=0
     or strpos(v_definition,'require_service_role')=0
     or strpos(v_definition,'require_course_access_v1')=0
     or strpos(v_definition,'actor_id')=0
     or strpos(v_definition,'raw_text')>0
     or strpos(v_definition,'before_snapshot')>0
     or strpos(v_definition,'after_snapshot')>0 then
    raise exception 'Segurança ou minimização da RPC de fatos divergiu.'
      using errcode='55000';
  end if;
  if has_function_privilege(
       'anon',
       'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)',
       'execute'
     ) or has_function_privilege(
       'authenticated',
       'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)',
       'execute'
     ) or not has_function_privilege(
       'service_role',
       'public.get_owned_course_authoring_analytics_for_actor_v1(uuid,uuid,bigint,jsonb)',
       'execute'
     ) then
    raise exception 'Privilégios da RPC de fatos divergem.' using errcode='55000';
  end if;
end;
$course_authoring_analytics_postflight$;

do $advance_course_authoring_analytics_runtime_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest:=public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision'<>'20260820061206'
     or (v_manifest->>'contractVersion')::integer<>1 then
    raise exception 'Manifesto concorrente aos fatos de Autoria.' using errcode='55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal)
  into v_features
  from (
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all
    select 'course-authoring-analytics-v1',1000020::bigint
  ) feature;
  v_manifest:=jsonb_build_object(
    'schemaRevision','20260820063156','contractVersion',1,'features',v_features
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
$advance_course_authoring_analytics_runtime_manifest$;

commit;
