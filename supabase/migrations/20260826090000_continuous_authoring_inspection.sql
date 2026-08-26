begin;

do $continuous_authoring_inspection_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260825190000'
     or to_regprocedure(
       'private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer)'
     ) is null
     or to_regprocedure(
       'private.course_materialization_design_context_core_v1(uuid,uuid,bigint,jsonb)'
     ) is null
     or to_regprocedure(
       'private.execute_course_audit_cycle_command_core_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is null
     or to_regprocedure(
       'private.execute_course_anchored_annotation_command_core_v1(uuid,uuid,bigint,jsonb,text,text,text,boolean)'
     ) is null then
    raise exception 'A inspeção contínua exige o runtime anterior completo.'
      using errcode = '55000';
  end if;
end;
$continuous_authoring_inspection_preflight$;

alter function private.list_course_study_units_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
) rename to list_course_study_units_for_actor_core_v1;

create function private.course_relevant_design_fingerprint_v1(p_context jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog,private
as $function$
  select private.course_design_json_hash_v1(jsonb_build_object(
    'componentCatalogVersion',p_context->'componentCatalogVersion',
    'instructionalAnalysisUnits',p_context->'instructionalAnalysisUnits',
    'evidenceRequirements',p_context->'evidenceRequirements',
    'guidanceRevisions',p_context->'guidanceRevisions',
    'targets',coalesce((
      select jsonb_agg(target.value - 'sourceAttributions' order by target.ordinal)
      from jsonb_array_elements(p_context->'targets')
        with ordinality target(value,ordinal)
    ),'[]'::jsonb)
  ))
$function$;

alter function private.execute_course_audit_cycle_command_core_v1(
  uuid,uuid,bigint,jsonb,text,text
) rename to execute_course_audit_cycle_command_pre_continuous_inspection_v1;

create function private.execute_course_audit_cycle_command_core_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_command jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_result jsonb;
  v_annotation record;
  v_receipt_result jsonb;
begin
  v_result := private.execute_course_audit_cycle_command_pre_continuous_inspection_v1(
    p_actor_id,p_course_id,p_expected_course_revision,p_command,p_channel,p_request_id
  );
  if p_command->>'type' <> 'verify_finding' then
    return v_result;
  end if;

  for v_annotation in
    select annotation_value.id,annotation_value.version
    from private.course_audit_finding_annotations link
    join private.course_anchored_annotations annotation_value
      on annotation_value.course_id = link.course_id
     and annotation_value.id = link.annotation_id
    where link.course_id = p_course_id
      and link.finding_id = (p_command->>'findingId')::uuid
      and annotation_value.state <> 'withdrawn'
      and (
        p_command->>'outcome' = 'resolved'
          and annotation_value.state <> 'resolved'
        or p_command->>'outcome' = 'still_open'
          and annotation_value.state = 'resolved'
      )
    order by annotation_value.id
  loop
    perform private.execute_course_anchored_annotation_command_core_v1(
      p_actor_id,
      p_course_id,
      null,
      jsonb_build_object(
        'type',case when p_command->>'outcome' = 'resolved'
          then 'resolve_anchored_annotation'
          else 'reopen_anchored_annotation'
        end,
        'annotationId',v_annotation.id,
        'expectedAnnotationVersion',v_annotation.version
      ),
      'author',
      'authoring_interface',
      'audit.verify:' || (p_command->>'auditRunId') || ':' || v_annotation.id::text,
      true
    );
  end loop;

  update private.course_change_receipts receipt
  set result = jsonb_set(
    receipt.result,'{suggestedAnnotationActions}','[]'::jsonb,true
  )
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.course_id = p_course_id
    and receipt.operation = 'update_audit_cycle'
  returning receipt.result into v_receipt_result;
  if v_receipt_result is null then
    raise exception 'O recibo da verificação não foi preservado.'
      using errcode = '55000';
  end if;
  return private.course_audit_change_from_receipt_v1(
    v_receipt_result,(v_result->>'idempotent')::boolean
  );
end;
$function$;

create function private.course_design_target_human_snapshot_v1(
  p_context jsonb,
  p_didactic_microsequence_id text
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'parameters',coalesce((
      select jsonb_agg(jsonb_build_object(
        'parameterId',parameter.value->>'parameterId',
        'value',parameter.value->'value',
        'origin',parameter.value->>'origin',
        'sourceScopeKind',parameter.value#>>'{sourceScope,kind}'
      ) order by parameter.ordinal)
      from jsonb_array_elements(target.value->'parameters')
        with ordinality parameter(value,ordinal)
    ),'[]'::jsonb),
    'guidance',coalesce((
      select jsonb_agg(jsonb_build_object(
        'guidance',revision.value->>'guidance',
        'origin',revision.value->>'origin',
        'sourceScopeKind',revision.value#>>'{sourceScope,kind}'
      ) order by guidance_id.ordinal)
      from jsonb_array_elements_text(target.value->'guidanceRevisionIds')
        with ordinality guidance_id(value,ordinal)
      join lateral (
        select dictionary.value
        from jsonb_array_elements(p_context->'guidanceRevisions') dictionary(value)
        where dictionary.value->>'revisionId' = guidance_id.value
        limit 1
      ) revision on true
    ),'[]'::jsonb),
    'componentPolicy',jsonb_build_object(
      'availability',target.value#>>'{componentPolicy,policy,availability}',
      'allowedCount',coalesce(jsonb_array_length(
        target.value#>'{componentPolicy,policy,allowedRefs}'
      ),0),
      'excludedCount',coalesce(jsonb_array_length(
        target.value#>'{componentPolicy,policy,excludedRefs}'
      ),0),
      'preferredCount',coalesce(jsonb_array_length(
        target.value#>'{componentPolicy,policy,preferredRefs}'
      ),0),
      'origin',target.value#>>'{componentPolicy,origin}',
      'sourceScopeKind',target.value#>>'{componentPolicy,sourceScope,kind}'
    )
  )
  from jsonb_array_elements(p_context->'targets') target(value)
  where target.value->>'didacticMicrosequenceId' = p_didactic_microsequence_id
  limit 1
$function$;

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
set search_path = pg_catalog,public,private
as $function$
declare
  v_result jsonb;
  v_items jsonb;
begin
  v_result := private.list_course_study_units_for_actor_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_scope_kind,p_scope_id,
    p_anchor_study_unit_id,p_cursor_study_unit_id,p_direction,p_limit,p_max_bytes
  );

  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'authorship',jsonb_build_object(
        'pendingObservationCount',coalesce(observation_value.pending_count,0),
        'production',case when production.materialization_id is null then null
          else jsonb_build_object(
            'materializationId',production.materialization_id,
            'recordedAt',production.recorded_at,
            'state',case
              when (item.value->>'updatedAt')::timestamptz > production.recorded_at
                then 'changed'
              else 'produced'
            end,
            'currentMaterialization',production.materialization_id = production.latest_materialization_id
          ) end,
        'design',case when production.materialization_id is null
          or current_design.fingerprint is null then null
          else jsonb_build_object(
            'usedFingerprint',production.used_fingerprint,
            'currentFingerprint',current_design.fingerprint,
            'used',production.used_design,
            'current',private.course_design_target_human_snapshot_v1(
              current_design.context,
              item.value#>>'{curriculumPath,didacticMicrosequence,id}'
            ),
            'state',case
              when production.used_fingerprint = current_design.fingerprint then 'current'
              when coalesce(verification_value.verified,false) then 'verified'
              else 'changed'
            end
          ) end
      )
    ) order by item.ordinal
  ),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_result->'items')
    with ordinality item(value,ordinal)
  left join lateral (
    select count(*)::integer as pending_count
    from private.course_anchored_annotations annotation_value
    where annotation_value.course_id = p_course_id
      and annotation_value.target_kind = 'study_unit'
      and annotation_value.target_id = item.value#>>'{studyUnit,id}'
      and annotation_value.state in ('open','considered')
      and (annotation_value.hard_delete_after is null
        or annotation_value.hard_delete_after > statement_timestamp())
  ) observation_value on true
  left join lateral (
    select materialization.id as materialization_id,
      materialization.authoring_part_id,
      materialization.design_context,
      step.completed_at as recorded_at,
      private.course_relevant_design_fingerprint_v1(
        materialization.design_context
      ) as used_fingerprint,
      private.course_design_target_human_snapshot_v1(
        materialization.design_context,
        item.value#>>'{curriculumPath,didacticMicrosequence,id}'
      ) as used_design,
      (
        select latest.id
        from private.course_authoring_part_materializations latest
        where latest.course_id = materialization.course_id
          and latest.authoring_part_id = materialization.authoring_part_id
        order by latest.started_at desc,latest.id desc
        limit 1
      ) as latest_materialization_id
    from private.course_authoring_part_materialization_steps step
    join private.course_authoring_part_materializations materialization
      on materialization.course_id = step.course_id
     and materialization.id = step.materialization_id
    cross join lateral jsonb_array_elements(
      coalesce(step.result_facts#>'{designApplication,studyUnits}','[]'::jsonb)
    ) applied_study_unit(value)
    where step.course_id = p_course_id
      and step.status = 'completed'
      and step.step_kind = 'didactic_microsequence_materialization'
      and applied_study_unit.value->>'studyUnitId' = item.value#>>'{studyUnit,id}'
    order by step.completed_at desc,step.id desc
    limit 1
  ) production on true
  left join lateral (
    select computed.context,
      private.course_relevant_design_fingerprint_v1(computed.context) as fingerprint
    from lateral (
      select jsonb_agg(jsonb_build_object(
        'kind','didactic_microsequence_materialization',
        'targetDidacticMicrosequenceId',materialization_step.target_didactic_microsequence_id,
        'productionPosition',materialization_step.production_position
      ) order by materialization_step.production_position,materialization_step.id) as value
      from private.course_authoring_part_materialization_steps materialization_step
      where materialization_step.course_id = p_course_id
        and materialization_step.materialization_id = production.materialization_id
        and materialization_step.step_kind = 'didactic_microsequence_materialization'
    ) steps
    cross join lateral (
      select private.course_materialization_design_context_core_v1(
        p_course_id,
        production.authoring_part_id,
        p_expected_revision,
        steps.value
      ) as context
    ) computed
    where production.materialization_id is not null
      and jsonb_typeof(steps.value) = 'array'
      and jsonb_array_length(steps.value) between 1 and 64
  ) current_design on true
  left join lateral (
    select exists(
      select 1
      from private.course_authoring_corrections correction
      join private.course_instructional_audit_runs verification_run
        on verification_run.course_id = correction.course_id
       and verification_run.id = (correction.verification->>'auditRunId')::uuid
      where correction.course_id = p_course_id
        and correction.target_study_unit_id = item.value#>>'{studyUnit,id}'
        and correction.status = 'verified'
        and correction.verification->>'outcome' = 'resolved'
        and verification_run.course_revision = p_expected_revision
        and verification_run.target_version = (item.value->>'version')::bigint
    ) as verified
  ) verification_value on true;

  v_result := jsonb_set(v_result,'{items}',v_items,true);
  v_result := jsonb_set(
    v_result,'{contract}',to_jsonb('aralearn.course-study-unit-inspection-page.v2'::text),true
  );
  v_result := jsonb_set(
    v_result,'{pageBytes}',to_jsonb(octet_length(v_items::text)),true
  );
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Página de Unidades excede o limite de leitura.'
      using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create or replace function public.list_owned_course_study_units_for_actor_v1(
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
set search_path = pg_catalog,private
as $function$
  select private.list_course_study_units_for_actor_v1(
    p_actor_id,p_course_id,p_expected_revision,p_scope_kind,p_scope_id,
    p_anchor_study_unit_id,p_cursor_study_unit_id,p_direction,p_limit,p_max_bytes
  )
$function$;

revoke all on function private.course_relevant_design_fingerprint_v1(jsonb),
  private.course_design_target_human_snapshot_v1(jsonb,text),
  private.execute_course_audit_cycle_command_pre_continuous_inspection_v1(
    uuid,uuid,bigint,jsonb,text,text
  ), private.execute_course_audit_cycle_command_core_v1(
    uuid,uuid,bigint,jsonb,text,text
  ),
  private.list_course_study_units_for_actor_core_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer,integer
  ), private.list_course_study_units_for_actor_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer,integer
  ), public.list_owned_course_study_units_for_actor_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer,integer
  ) from public,anon,authenticated,service_role;

grant execute on function public.list_owned_course_study_units_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
) to service_role;

do $advance_continuous_authoring_inspection_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if not (v_manifest->'features' ? 'continuous-authoring-inspection-v1') then
    v_manifest := jsonb_set(
      v_manifest,'{features}',
      (v_manifest->'features') || to_jsonb('continuous-authoring-inspection-v1'::text)
    );
  end if;
  v_manifest := jsonb_set(
    v_manifest,'{schemaRevision}',to_jsonb('20260826090000'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_continuous_authoring_inspection_manifest$;

do $continuous_authoring_inspection_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260826090000'
     or not (public.get_aralearn_runtime_manifest()->'features'
       @> '["continuous-authoring-inspection-v1"]'::jsonb)
     or to_regprocedure(
       'private.course_relevant_design_fingerprint_v1(jsonb)'
     ) is null
     or to_regprocedure(
       'private.course_design_target_human_snapshot_v1(jsonb,text)'
     ) is null
     or to_regprocedure(
       'private.execute_course_audit_cycle_command_pre_continuous_inspection_v1(uuid,uuid,bigint,jsonb,text,text)'
     ) is null then
    raise exception 'A projeção de inspeção contínua não foi instalada.'
      using errcode = '55000';
  end if;
end;
$continuous_authoring_inspection_postflight$;

commit;
