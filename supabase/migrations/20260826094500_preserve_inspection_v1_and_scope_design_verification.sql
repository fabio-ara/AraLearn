-- A release pública anterior continua consumindo a projeção v1 até o corte
-- único da sequência. A projeção contínua ganha endpoint próprio e compara
-- somente o desenho da microssequência focal.
begin;

do $continuous_inspection_v2_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260826093000'
     or to_regprocedure(
       'private.list_course_study_units_for_actor_core_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer)'
     ) is null
     or to_regprocedure(
       'private.list_course_study_units_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer,integer)'
     ) is null then
    raise exception 'A inspeção contínua anterior não está instalada.'
      using errcode = '55000';
  end if;
end;
$continuous_inspection_v2_preflight$;

alter function private.list_course_study_units_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
) rename to list_course_study_units_for_actor_continuous_v2;

alter function private.list_course_study_units_for_actor_core_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
) rename to list_course_study_units_for_actor_v1;

create function private.course_relevant_design_fingerprint_v2(
  p_context jsonb,
  p_didactic_microsequence_id text
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog,private
as $function$
  select private.course_design_json_hash_v1(
    private.course_design_target_human_snapshot_v1(
      p_context,p_didactic_microsequence_id
    )
  )
$function$;

create or replace function private.list_course_study_units_for_actor_continuous_v2(
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
  v_result := private.list_course_study_units_for_actor_v1(
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
      step.completed_at as recorded_at,
      private.course_relevant_design_fingerprint_v2(
        materialization.design_context,
        item.value#>>'{curriculumPath,didacticMicrosequence,id}'
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
      private.course_relevant_design_fingerprint_v2(
        computed.context,
        item.value#>>'{curriculumPath,didacticMicrosequence,id}'
      ) as fingerprint
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
        and exists(
          select 1
          from jsonb_array_elements(verification_run.checks) verification_check(value)
          where verification_check.value->>'dimension' = 'structural_conformance'
            and verification_check.value->>'result' = 'passed'
            and verification_check.value#>>'{criterion,code}' = 'current_design_alignment'
        )
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

create function public.list_owned_course_study_units_for_actor_v2(
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
  select private.list_course_study_units_for_actor_continuous_v2(
    p_actor_id,p_course_id,p_expected_revision,p_scope_kind,p_scope_id,
    p_anchor_study_unit_id,p_cursor_study_unit_id,p_direction,p_limit,p_max_bytes
  )
$function$;

revoke all on function private.course_relevant_design_fingerprint_v2(jsonb,text),
  private.list_course_study_units_for_actor_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer,integer
  ), private.list_course_study_units_for_actor_continuous_v2(
    uuid,uuid,bigint,text,text,text,text,text,integer,integer
  ), public.list_owned_course_study_units_for_actor_v1(
    uuid,uuid,bigint,text,text,text,text,text,integer,integer
  ), public.list_owned_course_study_units_for_actor_v2(
    uuid,uuid,bigint,text,text,text,text,text,integer,integer
  ) from public,anon,authenticated,service_role;

grant execute on function public.list_owned_course_study_units_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
), public.list_owned_course_study_units_for_actor_v2(
  uuid,uuid,bigint,text,text,text,text,text,integer,integer
) to service_role;

do $advance_continuous_inspection_v2_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := jsonb_set(
    public.get_aralearn_runtime_manifest(),
    '{schemaRevision}',
    to_jsonb('20260826094500'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_continuous_inspection_v2_manifest$;

do $continuous_inspection_v2_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260826094500'
     or to_regprocedure(
       'public.list_owned_course_study_units_for_actor_v2(uuid,uuid,bigint,text,text,text,text,text,integer,integer)'
     ) is null
     or to_regprocedure(
       'private.course_relevant_design_fingerprint_v2(jsonb,text)'
     ) is null then
    raise exception 'A inspeção contínua v2 não foi separada da projeção pública v1.'
      using errcode = '55000';
  end if;
end;
$continuous_inspection_v2_postflight$;

commit;
