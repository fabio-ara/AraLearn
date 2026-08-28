-- Um foco de inspeção é um encaminhamento visual persistido, não uma cópia do
-- material nem uma nova revisão do Curso. Ele conserva a ordem escolhida pelo
-- autor e continua legível caso uma correção posterior remova alguma Unidade.
begin;

do $course_inspection_focus_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260827185748'
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null then
    raise exception 'A base de Autoria necessária aos focos de inspeção não está instalada.'
      using errcode = '55000';
  end if;
end;
$course_inspection_focus_preflight$;

create table private.course_inspection_focuses (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  course_revision bigint not null,
  title text not null,
  study_unit_ids text[] not null,
  created_at timestamptz not null default now(),
  constraint course_inspection_focus_revision_v1 check(course_revision > 0),
  constraint course_inspection_focus_title_v1 check(
    nullif(btrim(title),'') is not null
    and title = btrim(title)
    and char_length(title) <= 160
    and title !~ '[[:cntrl:]]'
  ),
  constraint course_inspection_focus_units_v1 check(
    cardinality(study_unit_ids) between 1 and 64
  )
);

create index course_inspection_focus_course_created_v1_idx
  on private.course_inspection_focuses(course_id,created_at desc,id);

alter table private.course_inspection_focuses enable row level security;
alter table private.course_inspection_focuses force row level security;
revoke all on table private.course_inspection_focuses
  from public,anon,authenticated,service_role;

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v8,
  add constraint course_change_receipts_operation_v9 check(operation in(
    'create_course','commit_course_composition','commit_instructional_plan',
    'advance_authoring_part_materialization','apply_course_design_command',
    'execute_course_source_command','grant_access','revoke_access',
    'update_audit_cycle','create_course_variants','detach_course_variant',
    'commit_personal_course_copy_edit','create_inspection_focus'
  ));

create function public.create_course_inspection_focus_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_title text,
  p_study_unit_ids jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_focus private.course_inspection_focuses%rowtype;
  v_receipt private.course_change_receipts%rowtype;
  v_hash text;
  v_result jsonb;
  v_ids text[];
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_title is null
     or nullif(btrim(p_title),'') is null
     or p_title <> btrim(p_title)
     or char_length(p_title) > 160
     or p_title ~ '[[:cntrl:]]'
     or jsonb_typeof(p_study_unit_ids) is distinct from 'array'
     or jsonb_array_length(p_study_unit_ids) not between 1 and 64
     or exists(
       select 1 from jsonb_array_elements(p_study_unit_ids) item(value)
       where jsonb_typeof(item.value) <> 'string'
          or nullif(btrim(item.value #>> '{}'),'') is null
          or item.value #>> '{}' <> btrim(item.value #>> '{}')
          or char_length(item.value #>> '{}') > 240
          or item.value #>> '{}' ~ '[[:cntrl:]]'
     )
     or (
       select count(*) <> count(distinct item.value #>> '{}')
       from jsonb_array_elements(p_study_unit_ids) item(value)
     ) then
    raise exception 'Foco de inspeção inválido.' using errcode = '22023';
  end if;

  select array_agg(item.value order by item.ordinality)
    into v_ids
  from jsonb_array_elements_text(p_study_unit_ids)
    with ordinality item(value,ordinality);

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId',p_course_id,
    'expectedRevision',p_expected_revision,
    'title',p_title,
    'studyUnitIds',p_study_unit_ids
  )::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'create_inspection_focus'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com foco de inspeção incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object('idempotent',true);
  end if;

  select * into strict v_course from public.courses course
  where course.id = p_course_id;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de criar o foco de inspeção.'
      using errcode = '40001';
  end if;
  if (
    select count(*)
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = any(v_ids)
  ) <> cardinality(v_ids) then
    raise exception 'O foco contém Unidade inexistente neste Curso.'
      using errcode = '23514';
  end if;

  insert into private.course_inspection_focuses(
    course_id,created_by,course_revision,title,study_unit_ids
  ) values(
    p_course_id,p_actor_id,p_expected_revision,p_title,v_ids
  ) returning * into v_focus;

  v_result := jsonb_build_object(
    'contract','aralearn.course-inspection-focus.v1',
    'courseId',p_course_id,
    'courseRevision',p_expected_revision,
    'inspectionFocusId',v_focus.id,
    'title',v_focus.title,
    'studyUnitIds',to_jsonb(v_focus.study_unit_ids),
    'availableStudyUnitIds',to_jsonb(v_focus.study_unit_ids),
    'missingStudyUnitIds','[]'::jsonb,
    'createdAt',v_focus.created_at,
    'requestId',p_request_id,
    'idempotent',false
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'create_inspection_focus',p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001','message',sqlerrm,'details',null,'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,'headers',jsonb_build_object()
    )::text;
end;
$function$;

create function public.get_course_inspection_focus_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_inspection_focus_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_course public.courses%rowtype;
  v_focus private.course_inspection_focuses%rowtype;
  v_available jsonb;
  v_missing jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,false);
  if p_inspection_focus_id is null then
    raise exception 'Identidade do foco de inspeção inválida.' using errcode = '22023';
  end if;
  select * into strict v_course from public.courses course
  where course.id = p_course_id;
  select * into v_focus from private.course_inspection_focuses focus_value
  where focus_value.course_id = p_course_id
    and focus_value.id = p_inspection_focus_id;
  if not found then
    raise exception 'Foco de inspeção inexistente.' using errcode = 'PT404';
  end if;

  select
    coalesce(jsonb_agg(item.study_unit_id order by item.ordinality)
      filter(where entity.entity_id is not null),'[]'::jsonb),
    coalesce(jsonb_agg(item.study_unit_id order by item.ordinality)
      filter(where entity.entity_id is null),'[]'::jsonb)
    into v_available,v_missing
  from unnest(v_focus.study_unit_ids) with ordinality item(study_unit_id,ordinality)
  left join private.course_entities entity
    on entity.course_id = p_course_id
   and entity.entity_type = 'study_unit'
   and entity.entity_id = item.study_unit_id;

  return jsonb_build_object(
    'contract','aralearn.course-inspection-focus.v1',
    'courseId',p_course_id,
    'courseRevision',v_focus.course_revision,
    'currentCourseRevision',v_course.revision,
    'inspectionFocusId',v_focus.id,
    'title',v_focus.title,
    'studyUnitIds',to_jsonb(v_focus.study_unit_ids),
    'availableStudyUnitIds',v_available,
    'missingStudyUnitIds',v_missing,
    'createdAt',v_focus.created_at
  );
end;
$function$;

create function private.decorate_course_inspection_page_v2(
  p_course_id uuid,
  p_expected_revision bigint,
  p_result jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb := p_result;
  v_items jsonb;
begin
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
                then 'changed' else 'produced'
            end,
            'currentMaterialization',production.materialization_id = production.latest_materialization_id
          ) end,
        'design',case when production.materialization_id is null
          or current_design.fingerprint is null then null
          else jsonb_build_object(
            'used',production.used_design,
            'current',private.course_design_target_human_snapshot_v1(
              current_design.context,item.value#>>'{curriculumPath,didacticMicrosequence,id}'
            ),
            'state',case
              when production.used_fingerprint = current_design.fingerprint then 'current'
              when coalesce(verification_value.verified,false) then 'verified'
              else 'changed'
            end
          ) end
      )
    ) order by item.ordinal),'[]'::jsonb) into v_items
  from jsonb_array_elements(v_result->'items') with ordinality item(value,ordinal)
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
        materialization.design_context,item.value#>>'{curriculumPath,didacticMicrosequence,id}'
      ) as used_fingerprint,
      private.course_design_target_human_snapshot_v1(
        materialization.design_context,item.value#>>'{curriculumPath,didacticMicrosequence,id}'
      ) as used_design,
      (
        select latest.id
        from private.course_authoring_part_materializations latest
        where latest.course_id = materialization.course_id
          and latest.authoring_part_id = materialization.authoring_part_id
        order by latest.started_at desc,latest.id desc limit 1
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
    order by step.completed_at desc,step.id desc limit 1
  ) production on true
  left join lateral (
    select computed.context,
      private.course_relevant_design_fingerprint_v2(
        computed.context,item.value#>>'{curriculumPath,didacticMicrosequence,id}'
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
        p_course_id,production.authoring_part_id,p_expected_revision,steps.value
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
          select 1 from jsonb_array_elements(verification_run.checks) verification_check(value)
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
  v_result := jsonb_set(v_result,'{pageBytes}',to_jsonb(octet_length(v_items::text)),true);
  if octet_length(v_result::text) > 1835008 then
    raise exception 'Página de Unidades excede o limite de leitura.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create function private.list_course_inspection_focus_units_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_inspection_focus_id uuid,
  p_cursor_study_unit_id text default null,
  p_direction text default 'forward',
  p_limit integer default 12,
  p_max_bytes integer default 524288
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_course_revision bigint;
  v_focus private.course_inspection_focuses%rowtype;
  v_pivot_focus_ordinal bigint;
  v_total_count integer;
  v_items jsonb := '[]'::jsonb;
  v_scope_options jsonb;
  v_first_focus_ordinal bigint;
  v_last_focus_ordinal bigint;
  v_first_study_unit_id text;
  v_last_study_unit_id text;
  v_has_previous boolean := false;
  v_has_more boolean := false;
  v_result jsonb;
begin
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_inspection_focus_id is null
     or p_direction not in ('forward','backward')
     or p_limit is null or p_limit not between 1 and 24
     or p_max_bytes is null or p_max_bytes not between 65536 and 1500000
     or (p_cursor_study_unit_id is not null and (
       nullif(btrim(p_cursor_study_unit_id),'') is null
       or p_cursor_study_unit_id <> btrim(p_cursor_study_unit_id)
       or char_length(p_cursor_study_unit_id) > 240
       or p_cursor_study_unit_id ~ '[[:cntrl:]]'
     )) then
    raise exception 'Consulta do foco de inspeção inválida.' using errcode = '22023';
  end if;
  select course.revision into strict v_course_revision
  from public.courses course where course.id = p_course_id;
  if v_course_revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de continuar.' using errcode = '40001';
  end if;
  select * into v_focus from private.course_inspection_focuses focus_value
  where focus_value.course_id = p_course_id and focus_value.id = p_inspection_focus_id;
  if not found then
    raise exception 'Foco de inspeção inexistente.' using errcode = 'PT404';
  end if;

  with focused as materialized (
    select item.study_unit_id,
      row_number() over(order by item.ordinality) as focus_ordinal
    from unnest(v_focus.study_unit_ids) with ordinality item(study_unit_id,ordinality)
    join private.course_entities entity
      on entity.course_id = p_course_id
     and entity.entity_type = 'study_unit'
     and entity.entity_id = item.study_unit_id
  )
  select count(*)::integer,
    max(focused.focus_ordinal) filter(where focused.study_unit_id = p_cursor_study_unit_id)
  into v_total_count,v_pivot_focus_ordinal from focused;
  if p_cursor_study_unit_id is not null and v_pivot_focus_ordinal is null then
    raise exception 'Cursor de Unidade não pertence ao foco.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'authoringParts',coalesce(jsonb_agg(jsonb_build_object(
      'id',part.id,'position',part.position,'title',part.title,
      'state',private.course_authoring_part_progress_v1(part.course_id,part.id)->>'state'
    ) order by part.position,part.id),'[]'::jsonb),
    'unassignedStudyUnitCount',(
      select count(*)::integer
      from private.course_entities study_unit
      join private.course_entities microsequence
        on microsequence.course_id = study_unit.course_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.entity_id = study_unit.parent_id
      where study_unit.course_id = p_course_id
        and study_unit.entity_type = 'study_unit'
        and not exists(
          select 1 from private.course_authoring_part_didactic_microsequences membership
          where membership.course_id = microsequence.course_id
            and membership.didactic_microsequence_id = microsequence.entity_id
        )
    )
  ) into v_scope_options
  from private.course_authoring_parts part
  where part.course_id = p_course_id and part.retired_at is null;

  with part_rows as materialized (
    select part.id,part.position,part.title,
      private.course_authoring_part_progress_v1(part.course_id,part.id)->>'state' as state
    from private.course_authoring_parts part
    where part.course_id = p_course_id and part.retired_at is null
  ), all_ordered as materialized (
    select study_unit.entity_id,study_unit.position as study_unit_position,
      study_unit.content as study_unit_content,study_unit.version as study_unit_version,
      study_unit.updated_at as study_unit_updated_at,
      module_value.entity_id as module_id,module_value.position as module_position,
      module_value.content->>'title' as module_title,
      lesson.entity_id as lesson_id,lesson.position as lesson_position,
      lesson.content->>'title' as lesson_title,
      microsequence.entity_id as microsequence_id,
      microsequence.position as microsequence_position,
      microsequence.content->>'title' as microsequence_title,
      part.id as authoring_part_id,part.position as authoring_part_position,
      part.title as authoring_part_title,part.state as authoring_part_state,
      row_number() over(order by module_value.position,module_value.entity_id,
        lesson.position,lesson.entity_id,microsequence.position,microsequence.entity_id,
        study_unit.position,study_unit.entity_id) as course_ordinal
    from private.course_entities module_value
    join private.course_entities lesson
      on lesson.course_id = module_value.course_id and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module' and lesson.parent_id = module_value.entity_id
    join private.course_entities microsequence
      on microsequence.course_id = lesson.course_id and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson' and microsequence.parent_id = lesson.entity_id
    join private.course_entities study_unit
      on study_unit.course_id = microsequence.course_id and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence' and study_unit.parent_id = microsequence.entity_id
    left join private.course_authoring_part_didactic_microsequences membership
      on membership.course_id = microsequence.course_id
     and membership.didactic_microsequence_id = microsequence.entity_id
    left join part_rows part on part.id = membership.authoring_part_id
    where module_value.course_id = p_course_id and module_value.entity_type = 'module'
      and module_value.parent_type is null and module_value.parent_id is null
  ), focused as materialized (
    select all_ordered.*,
      row_number() over(order by item.ordinality) as focus_ordinal
    from unnest(v_focus.study_unit_ids) with ordinality item(study_unit_id,ordinality)
    join all_ordered on all_ordered.entity_id = item.study_unit_id
  ), candidate_pool as materialized (
    select focused.* from focused
    where v_pivot_focus_ordinal is null
       or p_direction = 'forward' and focused.focus_ordinal > v_pivot_focus_ordinal
       or p_direction = 'backward' and focused.focus_ordinal < v_pivot_focus_ordinal
    order by case when p_direction='forward' then focused.focus_ordinal end,
      case when p_direction='backward' then focused.focus_ordinal end desc
    limit p_limit
  ), projected as materialized (
    select candidate_pool.*,
      jsonb_build_object(
        'studyUnit',candidate_pool.study_unit_content || jsonb_build_object(
          'id',candidate_pool.entity_id,'position',candidate_pool.study_unit_position
        ),
        'version',candidate_pool.study_unit_version,
        'updatedAt',candidate_pool.study_unit_updated_at,
        'ordinal',candidate_pool.focus_ordinal,
        'curriculumPath',jsonb_build_object(
          'module',jsonb_build_object('id',candidate_pool.module_id,
            'position',candidate_pool.module_position,'title',candidate_pool.module_title),
          'lesson',jsonb_build_object('id',candidate_pool.lesson_id,
            'position',candidate_pool.lesson_position,'title',candidate_pool.lesson_title),
          'didacticMicrosequence',jsonb_build_object('id',candidate_pool.microsequence_id,
            'position',candidate_pool.microsequence_position,'title',candidate_pool.microsequence_title)
        ),
        'authoringPart',case when candidate_pool.authoring_part_id is null then null
          else jsonb_build_object('id',candidate_pool.authoring_part_id,
            'position',candidate_pool.authoring_part_position,
            'title',candidate_pool.authoring_part_title,'state',candidate_pool.authoring_part_state)
        end
      ) as item
    from candidate_pool
  ), running as materialized (
    select projected.*,row_number() over(order by
      case when p_direction='forward' then projected.focus_ordinal end,
      case when p_direction='backward' then projected.focus_ordinal end desc
    ) as directional_rank,
    sum(octet_length(projected.item::text)) over(order by
      case when p_direction='forward' then projected.focus_ordinal end,
      case when p_direction='backward' then projected.focus_ordinal end desc
    ) as cumulative_bytes
    from projected
  ), chosen as materialized (
    select * from running
    where directional_rank = 1 or cumulative_bytes + directional_rank * 2 <= p_max_bytes
  )
  select coalesce(jsonb_agg(chosen.item order by chosen.focus_ordinal),'[]'::jsonb),
    min(chosen.focus_ordinal),max(chosen.focus_ordinal),
    (array_agg(chosen.entity_id order by chosen.focus_ordinal))[1],
    (array_agg(chosen.entity_id order by chosen.focus_ordinal desc))[1]
  into v_items,v_first_focus_ordinal,v_last_focus_ordinal,
    v_first_study_unit_id,v_last_study_unit_id
  from chosen;

  v_has_previous := coalesce(v_first_focus_ordinal > 1,false);
  v_has_more := coalesce(v_last_focus_ordinal < v_total_count,false);
  v_result := jsonb_build_object(
    'contract','aralearn.course-study-unit-inspection-page.v1',
    'courseId',p_course_id,'courseRevision',v_course_revision,
    'scope',jsonb_build_object('kind','course','id',null),
    'totalCount',v_total_count,'scopeOptions',v_scope_options,'items',v_items,
    'hasPrevious',v_has_previous,'hasMore',v_has_more,
    'previousCursor',case when v_has_previous
      then jsonb_build_object('studyUnitId',v_first_study_unit_id) else null end,
    'nextCursor',case when v_has_more
      then jsonb_build_object('studyUnitId',v_last_study_unit_id) else null end,
    'pageBytes',octet_length(v_items::text)
  );
  return private.decorate_course_inspection_page_v2(
    p_course_id,p_expected_revision,v_result
  );
end;
$function$;

create function public.list_owned_course_inspection_focus_units_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_inspection_focus_id uuid,
  p_cursor_study_unit_id text default null,
  p_direction text default 'forward',
  p_limit integer default 12,
  p_max_bytes integer default 524288
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.list_course_inspection_focus_units_for_actor_v1(
    p_actor_id,p_course_id,p_expected_revision,p_inspection_focus_id,
    p_cursor_study_unit_id,p_direction,p_limit,p_max_bytes
  )
$function$;

comment on table private.course_inspection_focuses is
  'Encaminhamentos ordenados para inspeção situada; não duplicam conteúdo nem alteram a revisão do Curso.';
comment on function public.create_course_inspection_focus_for_actor_v1(
  uuid,uuid,bigint,text,jsonb,text
) is 'Cria idempotentemente um foco ordenado de Unidades existentes e não altera o Curso.';
comment on function public.get_course_inspection_focus_for_actor_v1(
  uuid,uuid,uuid
) is 'Lê um foco e separa Unidades ainda disponíveis das removidas posteriormente.';

revoke all on function public.create_course_inspection_focus_for_actor_v1(
  uuid,uuid,bigint,text,jsonb,text
), public.get_course_inspection_focus_for_actor_v1(
  uuid,uuid,uuid
) , private.decorate_course_inspection_page_v2(
  uuid,bigint,jsonb
), private.list_course_inspection_focus_units_for_actor_v1(
  uuid,uuid,bigint,uuid,text,text,integer,integer
), public.list_owned_course_inspection_focus_units_for_actor_v1(
  uuid,uuid,bigint,uuid,text,text,integer,integer
) from public,anon,authenticated,service_role;
grant execute on function public.create_course_inspection_focus_for_actor_v1(
  uuid,uuid,bigint,text,jsonb,text
), public.get_course_inspection_focus_for_actor_v1(
  uuid,uuid,uuid
) , public.list_owned_course_inspection_focus_units_for_actor_v1(
  uuid,uuid,bigint,uuid,text,text,integer,integer
) to service_role;

do $advance_course_inspection_focus_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if not (v_manifest->'features' ? 'course-inspection-focus-v1') then
    v_manifest := jsonb_set(
      v_manifest,'{features}',
      (v_manifest->'features') || to_jsonb('course-inspection-focus-v1'::text)
    );
  end if;
  v_manifest := jsonb_set(
    v_manifest,'{schemaRevision}',to_jsonb('20260828120000'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_course_inspection_focus_manifest$;

do $course_inspection_focus_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260828120000'
     or not (public.get_aralearn_runtime_manifest()->'features'
       @> '["course-inspection-focus-v1"]'::jsonb)
     or to_regprocedure(
       'public.create_course_inspection_focus_for_actor_v1(uuid,uuid,bigint,text,jsonb,text)'
     ) is null
     or to_regprocedure(
       'public.get_course_inspection_focus_for_actor_v1(uuid,uuid,uuid)'
     ) is null
     or to_regprocedure(
       'public.list_owned_course_inspection_focus_units_for_actor_v1(uuid,uuid,bigint,uuid,text,text,integer,integer)'
     ) is null then
    raise exception 'Os focos de inspeção não foram instalados.' using errcode = '55000';
  end if;
end;
$course_inspection_focus_postflight$;

commit;
