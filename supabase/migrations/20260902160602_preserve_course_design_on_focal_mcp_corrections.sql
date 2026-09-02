begin;

do $preserve_focal_mcp_design_preflight$
begin
  if to_regprocedure(
       'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)'
     ) is null
     or to_regprocedure(
       'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)'
     ) is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regprocedure(
       'private.course_component_refs_from_content_v1(jsonb)'
     ) is null
     or to_regprocedure(
       'private.course_component_policy_allows_v1(jsonb,text)'
     ) is null
     or to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'O runtime de Autoria necessário à correção focal está incompleto.'
      using errcode = '55000';
  end if;
end;
$preserve_focal_mcp_design_preflight$;

create or replace function public.commit_course_composition_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_expected_study_unit_version bigint,
  p_upserts jsonb,
  p_deletes jsonb,
  p_source_attribution_applications jsonb,
  p_channel text,
  p_application_origin text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,extensions
as $function$
declare
  v_entity private.course_entities%rowtype;
  v_upsert jsonb;
  v_result jsonb;
  v_existing_channel text;
  v_existing_origin text;
  v_existing_expected_version bigint;
  v_created_study_unit_ids text[] := array[]::text[];
  v_changed_study_unit_ids text[] := array[]::text[];
  v_design_preservable_study_unit_ids text[] := array[]::text[];
  v_change_origin text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_channel not in ('mcp','application')
     or p_channel = 'mcp' and (
       p_application_origin is not null
       or p_expected_study_unit_version is not null
     )
     or p_channel = 'application' and (
       (p_application_origin is null) <>
         (p_expected_study_unit_version is null)
       or p_application_origin is not null and (
         p_application_origin not in ('manual','provider_assistance')
         or p_expected_study_unit_version < 1
         or jsonb_typeof(p_upserts) <> 'array'
         or jsonb_array_length(p_upserts) <> 1
         or p_upserts->0->>'entityType' <> 'study_unit'
         or jsonb_typeof(p_deletes) <> 'array'
         or jsonb_array_length(p_deletes) <> 0
         or jsonb_typeof(p_source_attribution_applications) <> 'array'
         or jsonb_array_length(p_source_attribution_applications) <> 1
         or p_source_attribution_applications->0->>'studyUnitId'
            <> p_upserts->0->>'entityId'
       )
     ) then
    raise exception 'Canal, origem ou escopo da composição inválido.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  perform 1
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at > statement_timestamp();

  if not found and p_channel = 'application'
     and p_application_origin is not null then
    v_upsert := p_upserts->0;
    select * into v_entity
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = v_upsert->>'entityId';
    if not found then
      raise exception 'Unidade de estudo inexistente.' using errcode = 'PT404';
    end if;
    if v_entity.version <> p_expected_study_unit_version then
      raise exception 'A Unidade mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
  end if;

  if jsonb_typeof(p_upserts)='array' then
    select coalesce(array_agg(item.value->>'entityId') filter(
        where item.value->>'entityType'='study_unit' and entity.course_id is null
      ),array[]::text[]),
      coalesce(array_agg(item.value->>'entityId') filter(
        where item.value->>'entityType'='study_unit' and(
          entity.course_id is null or row(
            entity.parent_type,entity.parent_id,entity.position,entity.content
          ) is distinct from row(
            nullif(item.value->>'parentType',''),nullif(item.value->>'parentId',''),
            case when item.value->>'position'~'^[0-9]+$'
              then (item.value->>'position')::integer end,item.value->'content'
          )
        )
      ),array[]::text[]),
      coalesce(array_agg(item.value->>'entityId') filter(
        where item.value->>'entityType'='study_unit'
          and entity.course_id is not null
          and row(
            entity.parent_type,entity.parent_id,entity.position,
            entity.content->>'role'
          ) is not distinct from row(
            nullif(item.value->>'parentType',''),nullif(item.value->>'parentId',''),
            case when item.value->>'position'~'^[0-9]+$'
              then (item.value->>'position')::integer end,
            item.value#>>'{content,role}'
          )
          and jsonb_typeof(entity.design_snapshot)='object'
          and jsonb_typeof(entity.design_application)='object'
          and not exists(
            select 1
            from unnest(private.course_component_refs_from_content_v1(
              item.value->'content'
            )) component(ref)
            where private.course_component_policy_allows_v1(
              entity.design_snapshot#>'{componentPolicy,policy}',component.ref
            ) is not true
          )
      ),array[]::text[])
    into v_created_study_unit_ids,v_changed_study_unit_ids,
      v_design_preservable_study_unit_ids
    from jsonb_array_elements(p_upserts) item(value)
    left join private.course_entities entity
      on entity.course_id=p_course_id and entity.entity_type='study_unit'
     and entity.entity_id=item.value->>'entityId';
  end if;

  v_result := public.commit_course_composition_for_actor_v1(
    p_actor_id,p_course_id,p_expected_revision,p_upserts,p_deletes,
    p_source_attribution_applications,p_request_id
  );

  v_existing_channel := v_result->>'channel';
  v_existing_origin := v_result->>'applicationOrigin';
  v_existing_expected_version := case
    when jsonb_typeof(v_result->'expectedStudyUnitVersion') = 'number'
      then (v_result->>'expectedStudyUnitVersion')::bigint
    else null
  end;
  if (v_result->>'idempotent')::boolean and v_existing_channel is not null and (
    v_existing_channel <> p_channel
    or v_existing_origin is distinct from p_application_origin
    or v_existing_expected_version is distinct from p_expected_study_unit_version
  ) then
    raise exception 'requestId reutilizado com origem incompatível.'
      using errcode = '23514';
  end if;
  if (v_result->>'idempotent')::boolean and v_existing_channel is null
     and p_channel <> 'mcp' then
    raise exception 'Receipt anterior não comprova a origem da aplicação.'
      using errcode = '23514';
  end if;

  v_change_origin:=case when p_application_origin='manual'
    then 'human' else 'gpt' end;
  if not (v_result->>'idempotent')::boolean
     and cardinality(v_changed_study_unit_ids)>0 then
    update private.course_entities entity
    set created_origin=case when entity.entity_id=any(v_created_study_unit_ids)
          then coalesce(entity.created_origin,v_change_origin)
        else entity.created_origin end,
      last_revision_origin=v_change_origin,
      design_snapshot=case
        when (p_channel='mcp' or p_channel='application'
          and p_application_origin='provider_assistance')
          and entity.entity_id=any(v_design_preservable_study_unit_ids)
          then jsonb_set(
            entity.design_snapshot,'{appliedAt}',to_jsonb(entity.updated_at),true
          )
        else null
      end,
      design_application=case
        when (p_channel='mcp' or p_channel='application'
          and p_application_origin='provider_assistance')
          and entity.entity_id=any(v_design_preservable_study_unit_ids)
          then jsonb_set(
            entity.design_application,
            '{componentRefs}',
            to_jsonb(private.course_component_refs_from_content_v1(entity.content)),
            true
          )
        else null
      end
    where entity.course_id=p_course_id and entity.entity_type='study_unit'
      and entity.entity_id=any(v_changed_study_unit_ids);
  end if;

  v_result := (v_result - 'channel' - 'applicationOrigin'
    - 'expectedStudyUnitVersion') || jsonb_build_object(
      'channel',p_channel,
      'applicationOrigin',p_application_origin,
      'expectedStudyUnitVersion',p_expected_study_unit_version
    );
  update private.course_change_receipts receipt
  set result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  null;
  if p_channel = 'mcp' then
    return v_result - 'channel' - 'applicationOrigin'
      - 'expectedStudyUnitVersion';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text
) from public,anon,authenticated;
grant execute on function public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text
) to service_role;

do $advance_focal_mcp_design_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260902160602'::text),
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
$advance_focal_mcp_design_manifest$;

do $preserve_focal_mcp_design_postflight$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)'::regprocedure
  );
  if v_definition not like '%v_design_preservable_study_unit_ids%'
     or v_definition not like '%p_channel = ''mcp''%'
     or v_definition not like '%provider_assistance%'
     or v_definition not like '%course_component_policy_allows_v1%'
     or v_definition not like '%''{appliedAt}''%'
     or public.get_aralearn_runtime_manifest()->>'schemaRevision'
       <> '20260902160602' then
    raise exception 'A preservação focal de desenho MCP ficou incompleta.'
      using errcode = '55000';
  end if;
end;
$preserve_focal_mcp_design_postflight$;

commit;
