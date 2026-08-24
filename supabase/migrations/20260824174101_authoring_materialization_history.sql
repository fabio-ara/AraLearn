-- #153: o histórico já persistido passa a ser observável e Actions conserva
-- sua origem sem criar um segundo fluxo de materialização.

do $authoring_materialization_history_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260824150000' then
    raise exception 'A revisão anterior do runtime não corresponde à esperada.'
      using errcode = '55000';
  end if;
end;
$authoring_materialization_history_preflight$;

alter table private.course_authoring_part_materializations
  drop constraint course_authoring_part_materializations_channel_v1;

alter table private.course_authoring_part_materializations
  add constraint course_authoring_part_materializations_channel_v2 check(
    channel in ('application', 'mcp', 'actions')
  );

create index course_authoring_part_materializations_part_started_v1_idx
  on private.course_authoring_part_materializations(
    course_id,
    authoring_part_id,
    started_at desc,
    id desc
  );

create or replace function private.course_authoring_part_progress_v1(
  p_course_id uuid,
  p_authoring_part_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with linked as materialized (
    select membership.didactic_microsequence_id,
      count(study_unit.entity_id)::integer as study_unit_count
    from private.course_authoring_part_didactic_microsequences membership
    left join private.course_entities study_unit
      on study_unit.course_id = membership.course_id
     and study_unit.entity_type = 'study_unit'
     and study_unit.parent_type = 'microsequence'
     and study_unit.parent_id = membership.didactic_microsequence_id
    where membership.course_id = p_course_id
      and membership.authoring_part_id = p_authoring_part_id
    group by membership.didactic_microsequence_id
  ), attempts as materialized (
    select materialization.*,
      counts.total_count,
      counts.completed_count,
      counts.failed_count
    from private.course_authoring_part_materializations materialization
    cross join lateral (
      select count(step.id)::integer as total_count,
        count(step.id) filter(where step.status = 'completed')::integer
          as completed_count,
        count(step.id) filter(where step.status = 'failed')::integer
          as failed_count
      from private.course_authoring_part_materialization_steps step
      where step.course_id = materialization.course_id
        and step.materialization_id = materialization.id
    ) counts
    where materialization.course_id = p_course_id
      and materialization.authoring_part_id = p_authoring_part_id
  ), latest as materialized (
    select attempt.*
    from attempts attempt
    order by attempt.started_at desc, attempt.id desc
    limit 1
  )
  select jsonb_build_object(
    'state', case
      when (select status from latest) = 'running' then 'materializing'
      when (select status from latest) = 'failed' then 'attention_required'
      when (select status from latest) = 'completed'
        and (select count(*) from linked) > 0
        and not exists(select 1 from linked where study_unit_count = 0)
        then 'materialized'
      when (select count(*) from linked) > 0 then 'partially_materialized'
      else 'planned'
    end,
    'microsequenceCount', (select count(*)::integer from linked),
    'studyUnitCount', coalesce((select sum(study_unit_count)::integer from linked), 0),
    'materializations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attempt.id,
        'status', attempt.status,
        'progressState', case
          when attempt.status = 'failed' then 'failed'
          when attempt.status = 'completed' then 'completed'
          when attempt.completed_count > 0 or attempt.failed_count > 0 then 'partial'
          else 'running'
        end,
        'channel', attempt.channel,
        'version', attempt.version,
        'completedStepCount', attempt.completed_count,
        'failedStepCount', attempt.failed_count,
        'totalStepCount', attempt.total_count,
        'startedAt', attempt.started_at,
        'updatedAt', attempt.updated_at,
        'completedAt', attempt.completed_at,
        'summary', coalesce(
          nullif(btrim(attempt.result_facts->>'summary'), ''),
          case attempt.status
            when 'completed' then attempt.completed_count::text ||
              case when attempt.completed_count = 1 then ' etapa concluída' else ' etapas concluídas' end
            when 'failed' then 'A execução terminou com falha.'
            else attempt.completed_count::text || ' de ' ||
              attempt.total_count::text || ' etapas concluídas'
          end
        )
      ) order by attempt.started_at desc, attempt.id desc)
      from attempts attempt
    ), '[]'::jsonb),
    'lastMaterialization', case when exists(select 1 from latest) then (
      select jsonb_build_object(
        'id', latest.id,
        'status', latest.status,
        'version', latest.version,
        'completedStepCount', latest.completed_count,
        'failedStepCount', latest.failed_count,
        'totalStepCount', latest.total_count,
        'startedAt', latest.started_at,
        'updatedAt', latest.updated_at,
        'completedAt', latest.completed_at
      )
      from latest
    ) else null end
  )
$function$;

create function public.advance_course_authoring_part_materialization_for_actor_v2(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_materialization_id uuid,
  p_expected_course_revision bigint,
  p_expected_materialization_version bigint,
  p_operation text,
  p_payload jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
begin
  if p_channel not in ('application', 'mcp', 'actions') then
    raise exception 'Canal da materialização inválido.' using errcode = '22023';
  end if;

  v_result := public.advance_course_authoring_part_materialization_for_actor_v1(
    p_actor_id,
    p_course_id,
    p_authoring_part_id,
    p_materialization_id,
    p_expected_course_revision,
    p_expected_materialization_version,
    p_operation,
    p_payload,
    case when p_channel = 'actions' then 'mcp' else p_channel end,
    p_request_id
  );

  if p_channel = 'actions' then
    update private.course_authoring_part_materializations materialization
    set channel = 'actions'
    where materialization.course_id = p_course_id
      and materialization.authoring_part_id = p_authoring_part_id
      and materialization.id = p_materialization_id;

    update private.course_events event_value
    set summary = jsonb_set(event_value.summary, '{channel}', '"actions"'::jsonb, true)
    where event_value.course_id = p_course_id
      and event_value.revision = (v_result->>'courseRevision')::bigint
      and event_value.operation = 'advance_course_authoring_part_materialization'
      and event_value.summary->>'materializationId' = p_materialization_id::text;

    v_result := jsonb_set(v_result, '{channel}', '"actions"'::jsonb, true);

    update private.course_change_receipts receipt
    set result = v_result
    where receipt.actor_id = p_actor_id
      and receipt.request_id = p_request_id
      and receipt.operation = 'advance_authoring_part_materialization'
      and receipt.course_id = p_course_id;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.advance_course_authoring_part_materialization_for_actor_v2(
  uuid, uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.advance_course_authoring_part_materialization_for_actor_v2(
  uuid, uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text
) to service_role;

comment on function public.advance_course_authoring_part_materialization_for_actor_v2(
  uuid, uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text
) is 'Avança a materialização canônica e preserva Aplicativo, MCP ou Actions como canal observável.';

-- As projeções existentes continuam sendo a autoridade dos objetos. Somente os
-- destinos de interface mudam para as tarefas canônicas consolidadas.
do $canonical_authoring_annotation_routes$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'private.course_anchored_annotation_item_v1(private.course_anchored_annotations,uuid,boolean)'
      ::regprocedure
  ) into v_definition;
  v_definition := replace(v_definition, '?section=inspection', '?section=content');
  v_definition := replace(v_definition, '?section=observations', '?section=review');
  execute v_definition;
end;
$canonical_authoring_annotation_routes$;

do $advance_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if not (v_manifest->'features' ? 'course-authoring-part-materialization-history-v1') then
    v_manifest := jsonb_set(
      v_manifest,
      '{features}',
      (v_manifest->'features') || to_jsonb('course-authoring-part-materialization-history-v1'::text)
    );
  end if;
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260824174101'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_runtime_manifest$;

do $authoring_materialization_history_postflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260824174101'
     or not (public.get_aralearn_runtime_manifest()->'features'
       @> '["course-authoring-part-materialization-history-v1"]'::jsonb) then
    raise exception 'O manifesto não anunciou o histórico completo de materializações.'
      using errcode = '55000';
  end if;
  if not exists(
    select 1
    from pg_proc procedure_value
    join pg_namespace namespace_value on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'public'
      and procedure_value.proname = 'advance_course_authoring_part_materialization_for_actor_v2'
  ) then
    raise exception 'A fronteira de materialização com canal observável não foi criada.'
      using errcode = '55000';
  end if;
  if pg_get_functiondef(
    'private.course_anchored_annotation_item_v1(private.course_anchored_annotations,uuid,boolean)'
      ::regprocedure
  ) ~ 'section=(inspection|observations)' then
    raise exception 'As projeções de Observações ainda publicam destinos antigos de Autoria.'
      using errcode = '55000';
  end if;
end;
$authoring_materialization_history_postflight$;
