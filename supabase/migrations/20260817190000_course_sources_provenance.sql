-- #123: Fontes versionadas, Âncoras exatas e proveniência por alvo.
-- Metadados privados não integram o conteúdo da Unidade de estudo.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '10min';

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-course-sources-provenance-v1', 0
));

do $course_sources_preflight$
declare
  v_manifest jsonb;
begin
  if to_regclass('public.courses') is null
     or to_regclass('private.course_entities') is null
     or to_regclass('private.course_instructional_plan_items') is null
     or to_regclass('private.course_authoring_part_materializations') is null
     or to_regclass('private.course_events') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regprocedure('private.require_service_role()') is null
     or to_regprocedure('private.require_course_access_v1(uuid,uuid,boolean)') is null
     or to_regprocedure('extensions.digest(bytea,text)') is null
     or to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception 'Dependências de Fontes e proveniência do Curso ausentes.'
      using errcode = '55000';
  end if;
  if to_regclass('private.course_source_revisions') is not null
     or to_regclass('private.course_source_anchor_revisions') is not null
     or to_regclass('private.course_source_attributions') is not null
     or to_regclass('private.course_source_attribution_sources') is not null
     or to_regclass('private.course_source_attribution_anchors') is not null then
    raise exception 'A autoridade de Fontes já existe parcialmente.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.course_authoring_part_materializations materialization
    where materialization.status = 'running'
  ) then
    raise exception 'Tentativa em execução impede o cutover de proveniência.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.course_entities entity
    where entity.entity_type = 'study_unit'
      and (
        jsonb_typeof(entity.content->'sources') is distinct from 'array'
        or jsonb_array_length(entity.content->'sources') > 128
        or exists(
          select 1
          from jsonb_array_elements(entity.content->'sources') source(value)
          where jsonb_typeof(source.value) is distinct from 'string'
             or char_length(source.value#>>'{}') not between 1 and 2048
             or source.value#>>'{}' ~ '[[:cntrl:]]'
        )
      )
  ) then
    raise exception 'StudyUnit.sources legado possui shape, limite ou ordem incompatível.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.course_entities entity
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'sourceId',source.value,'sourceRevision',1,
        'relation','legacy_reference','anchors','[]'::jsonb
      ) order by source.ordinal),'[]'::jsonb) as links
      from jsonb_array_elements_text(entity.content->'sources')
        with ordinality source(value,ordinal)
    ) derived
    where entity.entity_type = 'study_unit'
      and (
        octet_length(derived.links::text) > 131072
        or octet_length(jsonb_build_object(
          'contract','aralearn.course-sources.v1',
          'courseId',entity.course_id,
          'courseRevision',9223372036854775807,
          'mode','target',
          'query',jsonb_build_object(
            'sourceId',null,'targetKind','study_unit',
            'targetId',entity.entity_id
          ),
          'items',jsonb_build_array(jsonb_build_object(
            'attributionId','ffffffff-ffff-4fff-8fff-ffffffffffff',
            'targetKind','study_unit','targetId',entity.entity_id,
            'targetVersion',9223372036854775807,
            'targetHash',repeat('f',64),'revision',9223372036854775807,
            'sourceLinks',derived.links,
            'actorId','ffffffff-ffff-4fff-8fff-ffffffffffff',
            'createdAt','9999-12-31T23:59:59.999999+00:00',
            'effective',true
          )),'nextCursor',null
        )::text) > 262144
      )
  ) then
    raise exception 'StudyUnit.sources legado excede o orçamento preservável de proveniência.'
      using errcode = '54000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817180000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'course-design-parameters-v1',
       'course-authoring-guidance-v1',
       'course-component-policy-v1'
     ]) then
    raise exception 'Manifesto anterior a Fontes é incompatível.'
      using errcode = '55000';
  end if;
end;
$course_sources_preflight$;

lock table public.courses in share row exclusive mode;
lock table private.course_entities in share row exclusive mode;
lock table private.course_instructional_plan_items in share row exclusive mode;
lock table private.course_authoring_part_materializations in share row exclusive mode;
lock table private.course_authoring_part_materialization_steps in share row exclusive mode;
lock table private.course_events in share row exclusive mode;
lock table private.course_change_receipts in share row exclusive mode;

create temporary table course_legacy_source_refs_v1 on commit drop as
select entity.course_id,
  entity.entity_id as study_unit_id,
  entity.version as target_version,
  source.ordinal::integer - 1 as source_ordinal,
  source.value as source_id
from private.course_entities entity
cross join lateral jsonb_array_elements_text(entity.content->'sources')
  with ordinality source(value,ordinal)
where entity.entity_type = 'study_unit';

create temporary table course_legacy_source_audit_v1 on commit drop as
select
  (select count(*) from private.course_entities where entity_type = 'study_unit')
    as study_unit_count,
  count(*) as source_ref_count,
  encode(extensions.digest(convert_to(coalesce(string_agg(
    encode(convert_to(course_id::text,'UTF8'),'base64') || ':' ||
    encode(convert_to(study_unit_id,'UTF8'),'base64') || ':' ||
    source_ordinal::text || ':' ||
    encode(convert_to(source_id,'UTF8'),'base64'),
    E'\n' order by course_id,study_unit_id,source_ordinal
  ),''),'UTF8'),'sha256'),'hex') as ordered_hash
from course_legacy_source_refs_v1;

create function private.course_source_json_hash_v1(p_value jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $function$
  select encode(extensions.digest(convert_to(p_value::text,'UTF8'),'sha256'),'hex')
$function$;

create function private.reject_course_source_fact_change_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := case when tg_op = 'UPDATE' then to_jsonb(new) else null end;
begin
  if tg_op = 'UPDATE'
     and v_old ? 'actor_id'
     and v_old->'actor_id' <> 'null'::jsonb
     and v_new->'actor_id' = 'null'::jsonb
     and (v_new - 'actor_id') = (v_old - 'actor_id')
     and not exists(
       select 1 from auth.users actor
       where actor.id = (v_old->>'actor_id')::uuid
     ) then
    return new;
  end if;
  if tg_op = 'DELETE' and not exists(
    select 1 from public.courses course
    where course.id = (v_old->>'course_id')::uuid
  ) then
    return old;
  end if;
  raise exception 'Fatos de Fonte e proveniência são append-only.'
    using errcode = '55000';
end;
$function$;

alter function public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text
) set schema private;

alter function private.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,text
) rename to commit_course_composition_core_v1;

create function public.commit_course_composition_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_upserts jsonb,
  p_deletes jsonb,
  p_source_attribution_applications jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_result jsonb;
  v_application record;
  v_entity private.course_entities%rowtype;
  v_upsert jsonb;
  v_application_states jsonb := '[]'::jsonb;
  v_state jsonb;
  v_assignment jsonb;
  v_attribution_changed_count integer := 0;
  v_course public.courses%rowtype;
  v_application_hash text;
  v_target_version bigint;
  v_target_hash text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_upserts) <> 'array'
     or jsonb_typeof(p_deletes) <> 'array'
     or jsonb_typeof(p_source_attribution_applications) <> 'array'
     or jsonb_array_length(p_source_attribution_applications) > 64
     or octet_length(p_source_attribution_applications::text) > 196608
     or exists(
       select 1
       from jsonb_array_elements(p_source_attribution_applications)
         application(value)
       where jsonb_typeof(application.value) <> 'object'
         or application.value - 'studyUnitId' - 'sourceLinks' <> '{}'::jsonb
         or not (application.value ?& array['studyUnitId','sourceLinks'])
         or jsonb_typeof(application.value->'studyUnitId') <> 'string'
         or char_length(application.value->>'studyUnitId') not between 1 and 240
         or not private.valid_course_source_links_shape_v1(
           application.value->'sourceLinks',false
         )
     )
     or (
       select count(*) <> count(distinct application.value->>'studyUnitId')
       from jsonb_array_elements(p_source_attribution_applications)
         application(value)
     )
     or (
       select count(*)
       from jsonb_array_elements(p_upserts) upsert_item(value)
       where upsert_item.value->>'entityType' = 'study_unit'
     ) <> jsonb_array_length(p_source_attribution_applications)
     or exists(
       select 1
       from (
         select candidate.value
         from jsonb_array_elements(p_upserts) candidate(value)
         where candidate.value->>'entityType' = 'study_unit'
       ) upsert_item
       full join jsonb_array_elements(p_source_attribution_applications)
         application(value)
         on application.value->>'studyUnitId'
           = upsert_item.value->>'entityId'
       where (
         upsert_item.value is not null
         and application.value is null
       ) or (
         application.value is not null
         and upsert_item.value is null
       )
     )
     or exists(
       select 1 from jsonb_array_elements(p_upserts) upsert_item(value)
       where upsert_item.value->>'entityType' = 'study_unit'
         and upsert_item.value->'content' ? 'sources'
     ) then
    raise exception 'Composição exige proveniência explícita para cada Unidade.'
      using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'upserts',p_upserts,'deletes',p_deletes,
    'sourceAttributionApplications',p_source_attribution_applications
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'commit_course_composition'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com composição incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;

  for v_application in
    select application.value
    from jsonb_array_elements(p_source_attribution_applications)
      with ordinality application(value,ordinal)
    order by application.ordinal
  loop
    select upsert_item.value into strict v_upsert
    from jsonb_array_elements(p_upserts) upsert_item(value)
    where upsert_item.value->>'entityType' = 'study_unit'
      and upsert_item.value->>'entityId'
        = v_application.value->>'studyUnitId';
    select * into v_entity
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = v_application.value->>'studyUnitId';
    if found then
      v_target_version := v_entity.version + case when row(
        v_entity.parent_type,v_entity.parent_id,v_entity.position,v_entity.content
      ) is distinct from row(
        nullif(v_upsert->>'parentType',''),nullif(v_upsert->>'parentId',''),
        (v_upsert->>'position')::integer,v_upsert->'content'
      ) then 1 else 0 end;
    else
      v_target_version := 1;
    end if;
    v_target_hash := private.course_source_json_hash_v1(jsonb_build_object(
      'targetKind','study_unit','content',v_upsert->'content'
    ));
    v_application_states := v_application_states || jsonb_build_array(
      jsonb_build_object(
        'application',v_application.value,
        'targetVersion',v_target_version,
        'targetHash',v_target_hash
      )
    );
  end loop;

  v_result := private.commit_course_composition_core_v1(
    p_actor_id,p_course_id,p_expected_revision,p_upserts,p_deletes,p_request_id
  );
  for v_application in
    select application.value
    from jsonb_array_elements(v_application_states)
      with ordinality application(value,ordinal)
    order by application.ordinal
  loop
    v_state := private.course_source_target_state_v1(
      p_course_id,'study_unit',
      v_application.value#>>'{application,studyUnitId}'
    );
    if v_state is null then
      raise exception 'A composição não preservou o alvo de proveniência.'
        using errcode = '55000';
    end if;
    v_assignment := private.apply_course_source_attribution_v1(
      p_course_id,'study_unit',
      v_application.value#>>'{application,studyUnitId}',
      (v_state->>'version')::bigint,
      v_application.value#>'{application,sourceLinks}',
      p_actor_id,false,v_state->>'hash'
    );
    if (v_assignment->>'changed')::boolean then
      v_attribution_changed_count := v_attribution_changed_count + 1;
    end if;
  end loop;
  v_application_hash := private.course_source_json_hash_v1(
    p_source_attribution_applications
  );
  if v_attribution_changed_count > 0 then
    if coalesce((v_result->>'createdCount')::integer,0)
         + coalesce((v_result->>'updatedCount')::integer,0)
         + coalesce((v_result->>'deletedCount')::integer,0) = 0 then
      update public.courses course
      set revision = course.revision + 1,updated_at = now()
      where course.id = p_course_id returning * into v_course;
      insert into private.course_events(
        course_id,revision,operation,summary,actor_id
      ) values(
        p_course_id,v_course.revision,'replace_course_composition',
        jsonb_build_object(
          'changeKind','course_composition_replaced',
          'createdCount',0,'updatedCount',0,'deletedCount',0,
          'sourceAttributionApplicationCount',
            jsonb_array_length(p_source_attribution_applications),
          'sourceAttributionChangedCount',v_attribution_changed_count,
          'sourceAttributionApplicationHash',v_application_hash
        ),p_actor_id
      );
      v_result := jsonb_set(v_result,'{revision}',
        to_jsonb(v_course.revision),true);
      v_result := jsonb_set(v_result,'{updatedAt}',
        to_jsonb(v_course.updated_at),true);
    else
      update private.course_events event_value
      set summary = event_value.summary || jsonb_build_object(
        'sourceAttributionApplicationCount',
          jsonb_array_length(p_source_attribution_applications),
        'sourceAttributionChangedCount',v_attribution_changed_count,
        'sourceAttributionApplicationHash',v_application_hash
      )
      where event_value.course_id = p_course_id
        and event_value.revision = (v_result->>'revision')::bigint;
    end if;
    for v_application in
      select application.value
      from jsonb_array_elements(p_source_attribution_applications)
        with ordinality application(value,ordinal)
      order by application.ordinal
    loop
      perform private.assert_course_source_target_citation_budget_v1(
        p_course_id,'study_unit',v_application.value->>'studyUnitId'
      );
    end loop;
  end if;
  update private.course_change_receipts receipt
  set request_hash = v_hash,result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  return v_result;
end;
$function$;

create function private.course_source_context_plan_items_v1(
  p_course_id uuid,
  p_plan_item_ids jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_result jsonb := '[]'::jsonb;
  v_item record;
  v_state jsonb;
  v_attribution record;
  v_sources jsonb;
begin
  if jsonb_typeof(p_plan_item_ids) <> 'array' then
    raise exception 'Itens do contexto de Fonte inválidos.' using errcode = '55000';
  end if;
  for v_item in
    select item.value#>>'{}' as id,item.ordinal
    from jsonb_array_elements(p_plan_item_ids)
      with ordinality item(value,ordinal)
    order by item.ordinal
  loop
    v_state := private.course_source_target_state_v1(
      p_course_id,'plan_item',v_item.id
    );
    select * into v_attribution
    from private.course_effective_source_attribution_v1(
      p_course_id,'plan_item',v_item.id
    );
    if v_state is null or v_attribution.id is null then
      raise exception 'Item de plano sem atribuição efetiva no contexto.'
        using errcode = '55000';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',source_link.source_id,
      'sourceRevision',source_link.source_revision,
      'relation',source_link.relation,
      'sourceHash',private.course_source_json_hash_v1(jsonb_build_object(
        'status',source.status,'kind',source.kind,'title',source.title,
        'citationText',source.citation_text,'url',source.url,
        'editionOrVersion',source.edition_or_version,
        'studyVisibility',source.study_visibility
      )),
      'anchors',coalesce((
        select jsonb_agg(jsonb_build_object(
          'anchorId',anchor_link.anchor_id,
          'anchorRevision',anchor_link.anchor_revision,
          'anchorHash',private.course_source_json_hash_v1(
            jsonb_build_object(
              'status',anchor_value.status,
              'sourceId',anchor_value.source_id,
              'sourceRevision',anchor_value.source_revision,
              'selector',anchor_value.selector,
              'verificationExcerpt',anchor_value.verification_excerpt
            )
          )
        ) order by anchor_link.anchor_ordinal)
        from private.course_source_attribution_anchors anchor_link
        join private.course_source_anchor_revisions anchor_value
          on anchor_value.course_id = anchor_link.course_id
         and anchor_value.anchor_id = anchor_link.anchor_id
         and anchor_value.revision = anchor_link.anchor_revision
        where anchor_link.course_id = source_link.course_id
          and anchor_link.attribution_id = source_link.attribution_id
          and anchor_link.source_ordinal = source_link.source_ordinal
      ),'[]'::jsonb)
    ) order by source_link.source_ordinal),'[]'::jsonb)
    into v_sources
    from private.course_source_attribution_sources source_link
    join private.course_source_revisions source
      on source.course_id = source_link.course_id
     and source.source_id = source_link.source_id
     and source.revision = source_link.source_revision
    where source_link.course_id = p_course_id
      and source_link.attribution_id = v_attribution.id;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'planItemId',v_item.id::uuid,
      'planItemVersion',(v_state->>'version')::bigint,
      'targetHash',v_state->>'hash',
      'attributionRevision',v_attribution.revision,
      'attributionHash',v_attribution.attribution_hash,
      'sources',v_sources
    ));
  end loop;
  return v_result;
end;
$function$;

create function private.course_design_context_with_sources_v1(
  p_context jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_course_id uuid;
  v_targets jsonb;
  v_context jsonb;
begin
  if jsonb_typeof(p_context) <> 'object'
     or p_context->>'contract' not in (
       'aralearn.course-design-context.v1',
       'aralearn.course-design-context.v2'
     )
     or jsonb_typeof(p_context->'targets') <> 'array' then
    raise exception 'Contexto anterior às Fontes é incompatível.'
      using errcode = '55000';
  end if;
  v_course_id := (p_context->>'courseId')::uuid;
  select coalesce(jsonb_agg(
    target.value || jsonb_build_object(
      'sourceAttributions',jsonb_build_object(
        'instructionalAnalysisUnits',
          private.course_source_context_plan_items_v1(
            v_course_id,target.value->'instructionalAnalysisUnitIds'
          ),
        'evidenceRequirements',
          private.course_source_context_plan_items_v1(
            v_course_id,target.value->'evidenceRequirementIds'
          )
      )
    ) order by target.ordinal
  ),'[]'::jsonb) into v_targets
  from jsonb_array_elements(p_context->'targets')
    with ordinality target(value,ordinal);
  v_context := jsonb_set(
    jsonb_set(p_context,'{contract}',
      to_jsonb('aralearn.course-design-context.v2'::text),true),
    '{targets}',v_targets,true
  );
  if octet_length(v_context::text) > 65536 then
    raise exception 'Contexto de desenho e Fontes excede 64 KiB.'
      using errcode = '54000';
  end if;
  return v_context;
end;
$function$;

alter function private.course_materialization_design_context_v1(
  uuid,uuid,bigint,jsonb
) rename to course_materialization_design_context_core_v1;

create function private.course_materialization_design_context_v1(
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_course_revision bigint,
  p_steps jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog,private
as $function$
  select private.course_design_context_with_sources_v1(
    private.course_materialization_design_context_core_v1(
      p_course_id,p_authoring_part_id,p_course_revision,p_steps
    )
  )
$function$;

create function private.valid_course_design_application_v2(
  p_context jsonb,
  p_context_hash text,
  p_application jsonb
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  select p_context->>'contract' = 'aralearn.course-design-context.v2'
    and private.valid_course_design_application_v1(
      jsonb_set(p_context,'{contract}',
        to_jsonb('aralearn.course-design-context.v1'::text),true),
      p_context_hash,p_application
    )
$function$;

create function private.valid_course_source_materialization_application_v1(
  p_context jsonb,
  p_context_hash text,
  p_application jsonb,
  p_entity_changes jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_target jsonb;
begin
  if jsonb_typeof(p_context) <> 'object'
     or p_context->>'contract' <> 'aralearn.course-design-context.v2'
     or p_context_hash !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_application) <> 'object'
     or p_application - 'contract' - 'contextHash'
       - 'didacticMicrosequenceId' - 'studyUnits' <> '{}'::jsonb
     or not (p_application ?& array[
       'contract','contextHash','didacticMicrosequenceId','studyUnits'
     ])
     or p_application->>'contract'
       <> 'aralearn.course-source-attribution-application.v1'
     or p_application->>'contextHash' <> p_context_hash
     or jsonb_typeof(p_application->'didacticMicrosequenceId') <> 'string'
     or jsonb_typeof(p_application->'studyUnits') <> 'array'
     or jsonb_array_length(p_application->'studyUnits') > 64
     or octet_length(p_application::text) > 196608
     or jsonb_typeof(p_entity_changes) <> 'object'
     or jsonb_typeof(p_entity_changes->'upserts') <> 'array' then
    return false;
  end if;
  select target.value into v_target
  from jsonb_array_elements(p_context->'targets') target(value)
  where target.value->>'didacticMicrosequenceId'
    = p_application->>'didacticMicrosequenceId';
  if v_target is null then return false; end if;
  if exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    where jsonb_typeof(unit.value) <> 'object'
      or unit.value - 'studyUnitId' - 'sourceLinks' <> '{}'::jsonb
      or not (unit.value ?& array['studyUnitId','sourceLinks'])
      or jsonb_typeof(unit.value->'studyUnitId') <> 'string'
      or char_length(unit.value->>'studyUnitId') not between 1 and 240
      or not private.valid_course_source_links_shape_v1(
        unit.value->'sourceLinks',false
      )
  ) or (
    select count(*) <> count(distinct unit.value->>'studyUnitId')
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
  ) or (
    select count(*)
    from jsonb_array_elements(p_entity_changes->'upserts') upsert_item(value)
    where upsert_item.value->>'entityType' = 'study_unit'
  ) <> jsonb_array_length(p_application->'studyUnits')
  or exists(
    select 1
    from (
      select candidate.value
      from jsonb_array_elements(p_entity_changes->'upserts') candidate(value)
      where candidate.value->>'entityType' = 'study_unit'
    ) upsert_item
    full join jsonb_array_elements(p_application->'studyUnits') unit(value)
      on unit.value->>'studyUnitId' = upsert_item.value->>'entityId'
    where (
      upsert_item.value is not null
      and unit.value is null
    ) or (
      unit.value is not null
      and upsert_item.value is null
    )
  ) or exists(
    select 1
    from jsonb_array_elements(p_entity_changes->'upserts') upsert_item(value)
    where upsert_item.value->>'entityType' = 'study_unit'
      and (
        upsert_item.value->>'parentId'
          <> p_application->>'didacticMicrosequenceId'
        or upsert_item.value->'content' ? 'sources'
      )
  ) or exists(
    select 1
    from jsonb_array_elements(p_application->'studyUnits') unit(value)
    cross join lateral jsonb_array_elements(unit.value->'sourceLinks') link(value)
    where not exists(
      select 1
      from (
        select source.value
        from jsonb_array_elements(
          v_target#>'{sourceAttributions,instructionalAnalysisUnits}'
        ) item(value)
        cross join lateral jsonb_array_elements(item.value->'sources') source(value)
        union all
        select source.value
        from jsonb_array_elements(
          v_target#>'{sourceAttributions,evidenceRequirements}'
        ) item(value)
        cross join lateral jsonb_array_elements(item.value->'sources') source(value)
      ) allowed
      where allowed.value->>'sourceId' = link.value->>'sourceId'
        and allowed.value->>'sourceRevision' = link.value->>'sourceRevision'
        and allowed.value->>'relation' = link.value->>'relation'
        and not exists(
          select 1
          from jsonb_array_elements(link.value->'anchors') requested(value)
          where not exists(
            select 1
            from jsonb_array_elements(allowed.value->'anchors') sealed(value)
            where sealed.value->>'anchorId' = requested.value->>'anchorId'
              and sealed.value->>'anchorRevision'
                = requested.value->>'anchorRevision'
          )
        )
    )
  ) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$function$;

alter function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
) set schema private;

alter function private.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
) rename to get_owned_course_authoring_part_materialization_design_core_v1;

create function public.get_owned_course_authoring_part_materialization_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_authoring_part_id uuid,
  p_materialization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_result jsonb;
  v_context jsonb;
  v_context_hash text;
begin
  v_result := private.get_owned_course_authoring_part_materialization_core_v1(
    p_actor_id,p_course_id,p_authoring_part_id,p_materialization_id
  );
  v_context := v_result#>'{materialization,designContext}';
  if jsonb_typeof(v_context) <> 'object'
     or v_context->>'contract' <> 'aralearn.course-design-context.v2'
     or v_context->>'componentCatalogVersion'
       <> private.course_component_catalog_v1()->>'version'
     or octet_length(v_context::text) > 65536 then
    raise exception 'Contexto selado da materialização é incompatível.'
      using errcode = '55000';
  end if;
  v_context_hash := private.course_design_json_hash_v1(v_context);
  return jsonb_set(v_result,'{materialization}',
    (v_result->'materialization')
      || jsonb_build_object('contextHash',v_context_hash),true);
end;
$function$;

alter function public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) set schema private;

alter function private.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) rename to advance_course_authoring_part_materialization_design_core_v1;

create function public.advance_course_authoring_part_materialization_for_actor_v1(
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
set search_path = pg_catalog,public,private,extensions
as $function$
declare
  v_context jsonb;
  v_context_hash text;
  v_core_payload jsonb;
  v_result jsonb;
  v_step private.course_authoring_part_materialization_steps%rowtype;
  v_design_application jsonb;
  v_source_application jsonb;
  v_result_facts jsonb;
  v_assignment record;
  v_entity private.course_entities%rowtype;
  v_upsert jsonb;
  v_source_states jsonb := '[]'::jsonb;
  v_state jsonb;
  v_source_hash text;
  v_study_unit_count integer := 0;
  v_source_count integer := 0;
  v_anchor_count integer := 0;
  v_target_version bigint;
  v_target_hash text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if jsonb_typeof(p_payload) <> 'object'
     or p_operation not in ('start','record_step','finish') then
    raise exception 'Avanço da materialização inválido.' using errcode = '22023';
  end if;
  if p_operation = 'start' then
    if p_payload - 'authoringPartVersion' - 'steps' <> '{}'::jsonb
       or not (p_payload ?& array['authoringPartVersion','steps']) then
      raise exception 'start não aceita contexto enviado pelo cliente.'
        using errcode = '22023';
    end if;
    select materialization.design_context into v_context
    from private.course_authoring_part_materializations materialization
    where materialization.course_id = p_course_id
      and materialization.authoring_part_id = p_authoring_part_id
      and materialization.id = p_materialization_id;
    if not found then
      v_context := private.course_materialization_design_context_v1(
        p_course_id,p_authoring_part_id,p_expected_course_revision,
        p_payload->'steps'
      );
    end if;
    v_core_payload := p_payload || jsonb_build_object(
      'designContext',v_context
    );
  elsif p_operation = 'record_step' then
    if p_payload - 'stepId' - 'expectedStepVersion' - 'status'
         - 'resultFacts' - 'entityChanges' - 'designApplication'
         - 'sourceAttributionApplication' <> '{}'::jsonb
       or not (p_payload ?& array[
         'stepId','expectedStepVersion','status','resultFacts',
         'entityChanges','designApplication','sourceAttributionApplication'
       ])
       or jsonb_typeof(p_payload->'resultFacts') <> 'object'
       or p_payload->'resultFacts' ?| array[
         'designApplication','sourceAttributionApplication'
       ] then
      raise exception 'record_step possui contrato de fatos inválido.'
        using errcode = '22023';
    end if;
    select step.* into v_step
    from private.course_authoring_part_materialization_steps step
    where step.course_id = p_course_id
      and step.materialization_id = p_materialization_id
      and step.id::text = p_payload->>'stepId';
    if not found then raise exception 'Etapa inexistente.' using errcode = 'PT404'; end if;
    select materialization.design_context into strict v_context
    from private.course_authoring_part_materializations materialization
    where materialization.course_id = p_course_id
      and materialization.authoring_part_id = p_authoring_part_id
      and materialization.id = p_materialization_id;
    v_context_hash := private.course_design_json_hash_v1(v_context);
    v_design_application := p_payload->'designApplication';
    v_source_application := p_payload->'sourceAttributionApplication';
    if (
      p_payload->>'status' = 'completed'
      and v_step.step_kind = 'didactic_microsequence_materialization'
    ) is distinct from (
      jsonb_typeof(v_design_application) = 'object'
      and jsonb_typeof(v_source_application) = 'object'
    ) then
      raise exception 'Aplicações não correspondem à espécie da etapa.'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_design_application) = 'object' then
      if v_design_application->>'didacticMicrosequenceId'
           <> v_step.target_didactic_microsequence_id
         or not private.valid_course_design_application_v2(
           v_context,v_context_hash,v_design_application
         )
         or v_source_application->>'didacticMicrosequenceId'
           <> v_step.target_didactic_microsequence_id
         or not private.valid_course_source_materialization_application_v1(
           v_context,v_context_hash,v_source_application,
           p_payload->'entityChanges'
         ) then
        raise exception 'Aplicação factual do desenho ou da proveniência é inválida.'
          using errcode = '23514';
      end if;
      v_source_hash := private.course_source_json_hash_v1(v_source_application);
      select count(*)::integer,
        coalesce(sum(jsonb_array_length(unit.value->'sourceLinks')),0)::integer,
        coalesce(sum((
          select coalesce(sum(jsonb_array_length(link.value->'anchors')),0)
          from jsonb_array_elements(unit.value->'sourceLinks') link(value)
        )),0)::integer
      into strict v_study_unit_count,v_source_count,v_anchor_count
      from jsonb_array_elements(v_source_application->'studyUnits') unit(value);
      for v_assignment in
        select unit.value
        from jsonb_array_elements(v_source_application->'studyUnits')
          with ordinality unit(value,ordinal)
        order by unit.ordinal
      loop
        select upsert_item.value into strict v_upsert
        from jsonb_array_elements(p_payload#>'{entityChanges,upserts}')
          upsert_item(value)
        where upsert_item.value->>'entityType' = 'study_unit'
          and upsert_item.value->>'entityId'
            = v_assignment.value->>'studyUnitId';
        select * into v_entity
        from private.course_entities entity
        where entity.course_id = p_course_id
          and entity.entity_type = 'study_unit'
          and entity.entity_id = v_assignment.value->>'studyUnitId';
        if found then
          v_target_version := v_entity.version + case when row(
            v_entity.parent_type,v_entity.parent_id,
            v_entity.position,v_entity.content
          ) is distinct from row(
            nullif(v_upsert->>'parentType',''),nullif(v_upsert->>'parentId',''),
            (v_upsert->>'position')::integer,v_upsert->'content'
          ) then 1 else 0 end;
        else
          v_target_version := 1;
        end if;
        v_target_hash := private.course_source_json_hash_v1(
          jsonb_build_object(
            'targetKind','study_unit','content',v_upsert->'content'
          )
        );
        v_source_states := v_source_states || jsonb_build_array(
          jsonb_build_object(
            'application',v_assignment.value,
            'targetVersion',v_target_version,
            'targetHash',v_target_hash
          )
        );
      end loop;
      v_result_facts := p_payload->'resultFacts' || jsonb_build_object(
        'designApplication',v_design_application,
        'sourceAttributionApplicationHash',v_source_hash,
        'sourceAttributionStudyUnitCount',
          v_study_unit_count,
        'sourceAttributionSourceCount',v_source_count,
        'sourceAttributionAnchorCount',v_anchor_count
      );
    else
      if v_design_application <> 'null'::jsonb
         or v_source_application <> 'null'::jsonb then
        raise exception 'Aplicações precisam ser objeto ou null.'
          using errcode = '22023';
      end if;
      v_result_facts := p_payload->'resultFacts';
    end if;
    if octet_length(v_result_facts::text) > 16384 then
      raise exception 'resultFacts excede 16 KiB.' using errcode = '54000';
    end if;
    v_core_payload := p_payload
      - 'designApplication' - 'sourceAttributionApplication'
      || jsonb_build_object('resultFacts',v_result_facts);
  else
    v_core_payload := p_payload;
  end if;

  v_result := private.advance_course_authoring_part_materialization_core_v1(
    p_actor_id,p_course_id,p_authoring_part_id,p_materialization_id,
    p_expected_course_revision,p_expected_materialization_version,
    p_operation,v_core_payload,p_channel,p_request_id
  );
  if p_operation = 'record_step'
     and jsonb_typeof(v_design_application) = 'object'
     and coalesce((v_result->>'idempotent')::boolean,false) is false then
    perform private.assert_course_design_application_materialized_v1(
      p_course_id,v_step.target_didactic_microsequence_id,
      v_design_application,p_payload->'entityChanges',v_context
    );
    for v_assignment in
      select unit.value
      from jsonb_array_elements(v_source_states)
        with ordinality unit(value,ordinal)
      order by unit.ordinal
    loop
      v_state := private.course_source_target_state_v1(
        p_course_id,'study_unit',
        v_assignment.value#>>'{application,studyUnitId}'
      );
      if v_state is null then
        raise exception 'A materialização não preservou o alvo de proveniência.'
          using errcode = '55000';
      end if;
      perform private.apply_course_source_attribution_v1(
        p_course_id,'study_unit',
        v_assignment.value#>>'{application,studyUnitId}',
        (v_state->>'version')::bigint,
        v_assignment.value#>'{application,sourceLinks}',
        p_actor_id,false,v_state->>'hash'
      );
      perform private.assert_course_source_target_citation_budget_v1(
        p_course_id,'study_unit',
        v_assignment.value#>>'{application,studyUnitId}'
      );
    end loop;
    update private.course_events event_value
    set summary = event_value.summary || jsonb_build_object(
      'sourceAttributionApplicationHash',v_source_hash,
      'sourceAttributionStudyUnitCount',
        jsonb_array_length(v_source_application->'studyUnits'),
      'sourceAttributionSourceCount',v_source_count,
      'sourceAttributionAnchorCount',v_anchor_count
    )
    where event_value.course_id = p_course_id
      and event_value.revision = (v_result->>'courseRevision')::bigint;
  end if;
  select materialization.design_context into strict v_context
  from private.course_authoring_part_materializations materialization
  where materialization.course_id = p_course_id
    and materialization.authoring_part_id = p_authoring_part_id
    and materialization.id = p_materialization_id;
  if v_context->>'contract' <> 'aralearn.course-design-context.v2'
     or v_context->>'componentCatalogVersion'
       <> private.course_component_catalog_v1()->>'version'
     or octet_length(v_context::text) > 65536 then
    raise exception 'Contexto selado da materialização é incompatível.'
      using errcode = '55000';
  end if;
  v_context_hash := private.course_design_json_hash_v1(v_context);
  return jsonb_set(v_result,'{materialization}',
    (v_result->'materialization') || jsonb_build_object(
      'designContext',v_context,'contextHash',v_context_hash
    ),true);
end;
$function$;

create function private.course_source_cursor_v1(
  p_query_hash text,
  p_offset integer
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select replace(replace(encode(convert_to(jsonb_build_object(
    'q',p_query_hash,'o',p_offset
  )::text,'UTF8'),'base64'),E'\n',''),E'\r','')
$function$;

create function public.get_owned_course_sources_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_mode text,
  p_source_id text default null,
  p_target_kind text default null,
  p_target_id text default null,
  p_cursor text default null,
  p_limit integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private
as $function$
declare
  v_course_revision bigint;
  v_items jsonb;
  v_next_cursor text;
  v_has_more boolean;
  v_cursor_payload jsonb;
  v_cursor_offset integer := 0;
  v_cursor_encoded text;
  v_cursor_query_hash text;
  v_page record;
  v_attribution record;
  v_pinned_source_revision bigint;
  v_pinned_source_revision_count integer;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_mode not in ('catalog','source','target')
     or p_limit is null or p_limit not between 1 and 24
     or p_cursor is not null and (
       char_length(p_cursor) not between 1 and 240
       or p_cursor !~ '^[A-Za-z0-9+/_-]+={0,2}$'
     )
     or p_mode = 'catalog' and (
       p_source_id is not null or p_target_kind is not null
       or p_target_id is not null
     )
     or p_mode = 'source' and (
       p_source_id is null or char_length(p_source_id) not between 1 and 2048
       or p_source_id ~ '[[:cntrl:]]'
       or (p_target_kind is null) <> (p_target_id is null)
       or p_target_kind is not null and (
         p_target_kind not in ('plan_item','study_unit')
         or char_length(p_target_id) not between 1 and 240
         or p_target_id <> btrim(p_target_id)
         or p_target_id ~ '[[:cntrl:]]'
         or p_cursor is not null
       )
     )
     or p_mode = 'target' and (
       p_source_id is not null
       or p_target_kind not in ('plan_item','study_unit')
       or p_target_id is null or char_length(p_target_id) not between 1 and 240
       or p_target_id <> btrim(p_target_id)
       or p_target_id ~ '[[:cntrl:]]'
     ) then
    raise exception 'Consulta de Fontes inválida.' using errcode = '22023';
  end if;
  v_cursor_query_hash := private.course_source_json_hash_v1(
    jsonb_build_object(
      'courseId',p_course_id,'expectedRevision',p_expected_revision,
      'mode',p_mode,'sourceId',p_source_id,
      'targetKind',p_target_kind,'targetId',p_target_id,'limit',p_limit
    )
  );
  if p_cursor is not null then
    begin
      v_cursor_encoded := translate(p_cursor,'-_','+/');
      v_cursor_encoded := v_cursor_encoded || repeat(
        '=',(4 - char_length(v_cursor_encoded) % 4) % 4
      );
      v_cursor_payload := convert_from(
        decode(v_cursor_encoded,'base64'),'UTF8'
      )::jsonb;
    exception when others then
      raise exception 'Cursor de Fontes inválido.' using errcode = '22023';
    end;
    if jsonb_typeof(v_cursor_payload) <> 'object'
       or v_cursor_payload - 'q' - 'o' <> '{}'::jsonb
       or not (v_cursor_payload ?& array['q','o'])
       or jsonb_typeof(v_cursor_payload->'q') <> 'string'
       or v_cursor_payload->>'q' !~ '^[a-f0-9]{64}$'
       or v_cursor_payload->>'q' <> v_cursor_query_hash
       or jsonb_typeof(v_cursor_payload->'o') <> 'number'
       or v_cursor_payload->>'o' !~ '^(0|[1-9][0-9]{0,6})$'
       or (v_cursor_payload->>'o')::integer > 1000000 then
      raise exception 'Cursor de Fontes inválido.' using errcode = '22023';
    end if;
    v_cursor_offset := (v_cursor_payload->>'o')::integer;
  end if;
  select course.revision into strict v_course_revision
  from public.courses course where course.id = p_course_id
  for share;
  if v_course_revision <> p_expected_revision then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code','40001',
        'message','O Curso mudou durante a leitura de Fontes.',
        'details',null,
        'hint',null
      )::text,
      detail = jsonb_build_object(
        'status',409,
        'headers',jsonb_build_object()
      )::text;
  end if;

  if p_mode = 'catalog' then
    with current_sources as materialized (
      select distinct on (source.source_id) source.*
      from private.course_source_revisions source
      where source.course_id = p_course_id
      order by source.source_id,source.revision desc
    ), page as materialized (
      select source.*
      from current_sources source
      order by source.source_id
      offset v_cursor_offset limit p_limit + 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',page.source_id,'revision',page.revision,
      'status',page.status,'kind',page.kind,'title',page.title,
      'citationText',page.citation_text,'url',page.url,
      'editionOrVersion',page.edition_or_version,
      'studyVisibility',page.study_visibility,
      'anchorCount',(
        select count(*)::integer
        from (
          select distinct on (anchor_value.anchor_id) anchor_value.status
          from private.course_source_anchor_revisions anchor_value
          where anchor_value.course_id = page.course_id
            and anchor_value.source_id = page.source_id
            and anchor_value.source_revision = page.revision
          order by anchor_value.anchor_id,anchor_value.revision desc
        ) current_anchor where current_anchor.status = 'active'
      ),'createdAt',page.created_at
    ) order by page.source_id) filter(where page.ordinal <= p_limit),'[]'::jsonb),
      null::text,
      count(*) > p_limit
    into v_items,v_next_cursor,v_has_more
    from (
      select page.*,row_number() over(order by page.source_id) as ordinal
      from page
    ) page;
    if v_has_more then
      v_next_cursor := private.course_source_cursor_v1(
        v_cursor_query_hash,v_cursor_offset + p_limit
      );
    else v_next_cursor := null; end if;
  elsif p_mode = 'source' then
    if not exists(
      select 1 from private.course_source_revisions source
      where source.course_id = p_course_id and source.source_id = p_source_id
    ) then
      raise exception 'Fonte inexistente.' using errcode = 'PT404';
    end if;
    if p_target_kind is not null then
      if private.course_source_target_state_v1(
        p_course_id,p_target_kind,p_target_id
      ) is null then
        raise exception 'Alvo de proveniência inexistente.' using errcode = 'PT404';
      end if;
      select * into v_attribution
      from private.course_effective_source_attribution_v1(
        p_course_id,p_target_kind,p_target_id
      );
      if v_attribution.id is null then
        v_items := '[]'::jsonb;
      else
        select min(source_link.source_revision),
          count(distinct source_link.source_revision)::integer
        into v_pinned_source_revision,v_pinned_source_revision_count
        from private.course_source_attribution_sources source_link
        where source_link.course_id = p_course_id
          and source_link.attribution_id = v_attribution.id
          and source_link.source_id = p_source_id;
        if v_pinned_source_revision_count > 1 then
          raise exception 'Atribuição efetiva possui revisões conflitantes da Fonte.'
            using errcode = '55000';
        elsif v_pinned_source_revision is null then
          v_items := '[]'::jsonb;
        else
          select jsonb_build_array(jsonb_build_object(
            'sourceId',source.source_id,'revision',source.revision,
            'status',source.status,'kind',source.kind,'title',source.title,
            'citationText',source.citation_text,'url',source.url,
            'editionOrVersion',source.edition_or_version,
            'studyVisibility',source.study_visibility,
            'anchorCount',(
              select count(distinct anchor_value.anchor_id)::integer
              from private.course_source_anchor_revisions anchor_value
              where anchor_value.course_id = p_course_id
                and anchor_value.source_id = p_source_id
                and anchor_value.source_revision = v_pinned_source_revision
            ),'createdAt',source.created_at,'actorId',source.actor_id,
            'anchors',coalesce((
              select jsonb_agg(jsonb_build_object(
                'anchorId',anchor_value.anchor_id,
                'revision',anchor_value.revision,
                'sourceRevision',anchor_value.source_revision,
                'status',anchor_value.status,
                'selector',anchor_value.selector,
                'verificationExcerpt',anchor_value.verification_excerpt,
                'actorId',anchor_value.actor_id,
                'createdAt',anchor_value.created_at
              ) order by anchor_value.anchor_id)
              from (
                select distinct anchor_identity.anchor_id
                from private.course_source_anchor_revisions anchor_identity
                where anchor_identity.course_id = p_course_id
                  and anchor_identity.source_id = p_source_id
                  and anchor_identity.source_revision = v_pinned_source_revision
              ) anchor_identity
              cross join lateral (
                select coalesce((
                  select anchor_link.anchor_revision
                  from private.course_source_attribution_anchors anchor_link
                  where anchor_link.course_id = p_course_id
                    and anchor_link.attribution_id = v_attribution.id
                    and anchor_link.source_id = p_source_id
                    and anchor_link.source_revision = v_pinned_source_revision
                    and anchor_link.anchor_id = anchor_identity.anchor_id
                  limit 1
                ),(
                  select max(current_anchor.revision)
                  from private.course_source_anchor_revisions current_anchor
                  where current_anchor.course_id = p_course_id
                    and current_anchor.source_id = p_source_id
                    and current_anchor.source_revision = v_pinned_source_revision
                    and current_anchor.anchor_id = anchor_identity.anchor_id
                )) as revision
              ) selected_revision
              join private.course_source_anchor_revisions anchor_value
                on anchor_value.course_id = p_course_id
               and anchor_value.anchor_id = anchor_identity.anchor_id
               and anchor_value.revision = selected_revision.revision
               and anchor_value.source_id = p_source_id
               and anchor_value.source_revision = v_pinned_source_revision
            ),'[]'::jsonb)
          )) into v_items
          from private.course_source_revisions source
          where source.course_id = p_course_id
            and source.source_id = p_source_id
            and source.revision = v_pinned_source_revision;
        end if;
      end if;
      v_next_cursor := null;
      v_has_more := false;
    else
    with page as materialized (
      select source.*,
        row_number() over(order by source.revision desc) as ordinal
      from private.course_source_revisions source
      where source.course_id = p_course_id
        and source.source_id = p_source_id
      order by source.revision desc
      offset v_cursor_offset limit p_limit + 1
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',page.source_id,'revision',page.revision,
      'status',page.status,'kind',page.kind,'title',page.title,
      'citationText',page.citation_text,'url',page.url,
      'editionOrVersion',page.edition_or_version,
      'studyVisibility',page.study_visibility,
      'anchorCount',jsonb_array_length(coalesce((
        select jsonb_agg(anchor_projection.value)
        from (
          select distinct on (anchor_value.anchor_id)
            jsonb_build_object(
              'anchorId',anchor_value.anchor_id,
              'revision',anchor_value.revision,
              'sourceRevision',anchor_value.source_revision,
              'status',anchor_value.status,'selector',anchor_value.selector,
              'verificationExcerpt',anchor_value.verification_excerpt,
              'actorId',anchor_value.actor_id,
              'createdAt',anchor_value.created_at
            ) as value
          from private.course_source_anchor_revisions anchor_value
          where anchor_value.course_id = page.course_id
            and anchor_value.source_id = page.source_id
            and anchor_value.source_revision = page.revision
          order by anchor_value.anchor_id,anchor_value.revision desc
        ) anchor_projection
      ),'[]'::jsonb)),
      'createdAt',page.created_at,'actorId',page.actor_id,
      'anchors',coalesce((
        select jsonb_agg(anchor_projection.value
          order by anchor_projection.anchor_id)
        from (
          select distinct on (anchor_value.anchor_id)
            anchor_value.anchor_id,
            jsonb_build_object(
              'anchorId',anchor_value.anchor_id,
              'revision',anchor_value.revision,
              'sourceRevision',anchor_value.source_revision,
              'status',anchor_value.status,'selector',anchor_value.selector,
              'verificationExcerpt',anchor_value.verification_excerpt,
              'actorId',anchor_value.actor_id,
              'createdAt',anchor_value.created_at
            ) as value
          from private.course_source_anchor_revisions anchor_value
          where anchor_value.course_id = page.course_id
            and anchor_value.source_id = page.source_id
            and anchor_value.source_revision = page.revision
          order by anchor_value.anchor_id,anchor_value.revision desc
        ) anchor_projection
      ),'[]'::jsonb)
    ) order by page.revision desc) filter(
      where page.ordinal <= v_cursor_offset + p_limit
    ),'[]'::jsonb),
      null::text,
      count(*) > p_limit
    into v_items,v_next_cursor,v_has_more
    from page;
    v_items := coalesce(v_items,'[]'::jsonb);
    if v_has_more then
      v_next_cursor := private.course_source_cursor_v1(
        v_cursor_query_hash,v_cursor_offset + p_limit
      );
    else v_next_cursor := null; end if;
    end if;
  else
    if private.course_source_target_state_v1(
      p_course_id,p_target_kind,p_target_id
    ) is null then
      raise exception 'Alvo de proveniência inexistente.' using errcode = 'PT404';
    end if;
    for v_page in
      with page as materialized (
        select attribution.*,
          row_number() over(order by attribution.revision desc) as ordinal
        from private.course_source_attributions attribution
        where attribution.course_id = p_course_id
          and attribution.target_kind = p_target_kind
          and attribution.target_id = p_target_id
        order by attribution.revision desc
        offset v_cursor_offset limit p_limit + 1
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'attributionId',page.id,'targetKind',page.target_kind,
        'targetId',page.target_id,'targetVersion',page.target_version,
        'targetHash',page.target_hash,'revision',page.revision,
        'sourceLinks',private.course_source_links_v1(page.course_id,page.id),
        'actorId',page.actor_id,'createdAt',page.created_at,
        'effective',page.id = (
          select effective.id
          from private.course_effective_source_attribution_v1(
            p_course_id,p_target_kind,p_target_id
          ) effective
        )
      ) order by page.revision desc) filter(
        where page.ordinal <= v_cursor_offset + p_limit
      ),'[]'::jsonb) as items,
        null::text as next_cursor,
        count(*) > p_limit as has_more
      from page
    loop
      v_items := v_page.items;
      v_next_cursor := v_page.next_cursor;
      v_has_more := v_page.has_more;
    end loop;
    v_items := coalesce(v_items,'[]'::jsonb);
    if v_has_more then
      v_next_cursor := private.course_source_cursor_v1(
        v_cursor_query_hash,v_cursor_offset + p_limit
      );
    else v_next_cursor := null; end if;
  end if;

  v_result := jsonb_build_object(
    'contract','aralearn.course-sources.v1','courseId',p_course_id,
    'courseRevision',v_course_revision,'mode',p_mode,
    'query',jsonb_build_object(
      'sourceId',case when p_mode = 'source' then p_source_id else null end,
      'targetKind',case when p_mode in ('source','target')
        then p_target_kind else null end,
      'targetId',case when p_mode in ('source','target')
        then p_target_id else null end
    ),'items',coalesce(v_items,'[]'::jsonb),'nextCursor',v_next_cursor
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'Leitura de Fontes excede 256 KiB.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create function private.course_study_citations_payload_v1(
  p_course_id uuid,
  p_study_unit_id text,
  p_course_revision bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_attribution record;
  v_citations jsonb;
  v_result jsonb;
begin
  if p_course_id is null or p_study_unit_id is null
     or char_length(p_study_unit_id) not between 1 and 240
     or p_course_revision is null or p_course_revision < 1 then
    raise exception 'Cerca de citações de Estudo inválida.'
      using errcode = '22023';
  end if;
  select * into v_attribution
  from private.course_effective_source_attribution_v1(
    p_course_id,'study_unit',p_study_unit_id
  );
  if v_attribution.id is null then
    v_citations := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId',source_link.source_id,
      'sourceRevision',source_link.source_revision,
      'title',source.title,'citationText',source.citation_text,
      'url',case when source.study_visibility = 'citation_and_link'
          and current_source.study_visibility = 'citation_and_link'
        then source.url else null end,
      'editionOrVersion',source.edition_or_version,
      'anchors',coalesce((
        select jsonb_agg(jsonb_build_object(
          'anchorId',anchor_link.anchor_id,
          'anchorRevision',anchor_link.anchor_revision,
          'selector',anchor_value.selector
        ) order by anchor_link.anchor_ordinal)
        from private.course_source_attribution_anchors anchor_link
        join private.course_source_anchor_revisions anchor_value
          on anchor_value.course_id = anchor_link.course_id
         and anchor_value.anchor_id = anchor_link.anchor_id
         and anchor_value.revision = anchor_link.anchor_revision
        where anchor_link.course_id = source_link.course_id
          and anchor_link.attribution_id = source_link.attribution_id
          and anchor_link.source_ordinal = source_link.source_ordinal
      ),'[]'::jsonb)
    ) order by source_link.source_ordinal),'[]'::jsonb)
    into v_citations
    from private.course_source_attribution_sources source_link
    join private.course_source_revisions source
      on source.course_id = source_link.course_id
     and source.source_id = source_link.source_id
     and source.revision = source_link.source_revision
    cross join lateral (
      select current_value.status,current_value.study_visibility
      from private.course_source_revisions current_value
      where current_value.course_id = source.course_id
        and current_value.source_id = source.source_id
      order by current_value.revision desc
      limit 1
    ) current_source
    where source_link.course_id = p_course_id
      and source_link.attribution_id = v_attribution.id
      and source.status = 'active'
      and source.study_visibility in ('citation','citation_and_link')
      and current_source.status = 'active'
      and current_source.study_visibility in ('citation','citation_and_link');
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-study-citations.v1',
    'courseId',p_course_id,'courseRevision',p_course_revision,
    'studyUnitId',p_study_unit_id,'citations',v_citations
  );
  if octet_length(v_result::text) > 262144 then
    raise exception 'Citações de Estudo excedem 256 KiB.' using errcode = '54000';
  end if;
  return v_result;
end;
$function$;

create function private.assert_course_source_target_citation_budget_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog,private
as $function$
begin
  if p_target_kind = 'study_unit' then
    perform private.course_study_citations_payload_v1(
      p_course_id,p_target_id,9223372036854775807
    );
  elsif p_target_kind <> 'plan_item' then
    raise exception 'Tipo do alvo da cerca de citações inválido.'
      using errcode = '22023';
  end if;
end;
$function$;

drop function if exists public.get_course_study_citations_v1(uuid,text);

create function public.get_course_study_citations_v1(
  p_course_id uuid,
  p_expected_revision bigint,
  p_study_unit_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,public,private,auth
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_revision bigint;
begin
  if v_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-access:' || p_course_id::text || ':' || v_actor_id::text,0
  ));
  perform private.require_course_access_v1(p_course_id,v_actor_id,false);
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Revisão esperada das citações é inválida.'
      using errcode = '22023';
  end if;
  select course.revision into strict v_revision
  from public.courses course where course.id = p_course_id
  for share;
  if v_revision <> p_expected_revision then
    raise sqlstate 'PGRST' using
      message = jsonb_build_object(
        'code','40001',
        'message','O Curso mudou durante a leitura de citações.',
        'details',null,
        'hint',null
      )::text,
      detail = jsonb_build_object(
        'status',409,
        'headers',jsonb_build_object()
      )::text;
  end if;
  if p_study_unit_id is null
     or char_length(p_study_unit_id) not between 1 and 240
     or p_study_unit_id <> btrim(p_study_unit_id)
     or p_study_unit_id ~ '[[:cntrl:]]' then
    raise exception 'Unidade de estudo inválida.' using errcode = '22023';
  end if;
  if private.course_source_target_state_v1(
    p_course_id,'study_unit',p_study_unit_id
  ) is null then
    raise exception 'Unidade de estudo inexistente.' using errcode = 'PT404';
  end if;
  return private.course_study_citations_payload_v1(
    p_course_id,p_study_unit_id,v_revision
  );
end;
$function$;

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v4,
  add constraint course_change_receipts_operation_v5 check(operation in (
    'create_course','commit_course_composition','commit_instructional_plan',
    'advance_authoring_part_materialization','apply_course_design_command',
    'execute_course_source_command','grant_access','revoke_access'
  ));

alter table private.course_events
  drop constraint course_events_operation_v4,
  add constraint course_events_operation_v5 check(operation in (
    'create_course','update_course_metadata','replace_course_composition',
    'update_course_instructional_plan',
    'advance_course_authoring_part_materialization','update_course_design',
    'update_course_sources','grant_course_access','revoke_course_access'
  ));

create function public.execute_course_source_command_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_command jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,auth,extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_course public.courses%rowtype;
  v_type text;
  v_source record;
  v_anchor record;
  v_changed boolean := false;
  v_subject_id text;
  v_subject_revision bigint;
  v_assignment jsonb;
  v_result jsonb;
  v_study_unit record;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_revision is null or p_expected_revision < 1
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) is distinct from 'object'
     or octet_length(p_command::text) > 196608 then
    raise exception 'Comando de Fonte inválido.' using errcode = '22023';
  end if;
  v_type := p_command->>'type';
  if v_type not in (
    'save_source','retire_source','save_anchor','retire_anchor',
    'set_target_sources'
  ) then
    raise exception 'Tipo do comando de Fonte inválido.' using errcode = '22023';
  end if;
  v_hash := private.course_source_json_hash_v1(jsonb_build_object(
    'courseId',p_course_id,'expectedRevision',p_expected_revision,
    'channel',p_channel,'command',p_command
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> 'execute_course_source_command'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando de Fonte incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-row:' || p_course_id::text,0
  ));
  select * into strict v_course from public.courses course
  where course.id = p_course_id for update;
  if v_course.revision <> p_expected_revision then
    raise exception 'O Curso mudou; releia antes de salvar a Fonte.'
      using errcode = '40001';
  end if;

  if v_type = 'save_source' then
    if p_command - 'type' - 'sourceId' - 'expectedSourceRevision' - 'source'
         <> '{}'::jsonb
       or not (p_command ?& array[
         'type','sourceId','expectedSourceRevision','source'
       ])
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 2048
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedSourceRevision') <> 'number'
       or p_command->>'expectedSourceRevision' !~ '^[0-9]+$'
       or jsonb_typeof(p_command->'source') <> 'object'
       or (p_command->'source') - 'kind' - 'title' - 'citationText' - 'url'
         - 'editionOrVersion' - 'studyVisibility' <> '{}'::jsonb
       or not (p_command->'source' ?& array[
         'kind','title','citationText','url','editionOrVersion','studyVisibility'
       ]) then
      raise exception 'save_source possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_source_revisions source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    order by source.revision desc limit 1;
    if (
      char_length(p_command->>'sourceId') > 240
      or p_command->>'sourceId' <> btrim(p_command->>'sourceId')
    ) and not exists(
      select 1 from private.course_source_revisions legacy
      where legacy.course_id = p_course_id
        and legacy.source_id = p_command->>'sourceId'
        and legacy.status = 'unresolved_legacy'
    ) then
      raise exception 'Uma identidade ativa fora do limite novo precisa resolver uma referência legada existente.'
        using errcode = '23514';
    end if;
    if coalesce(v_source.revision,0)
         <> (p_command->>'expectedSourceRevision')::bigint then
      raise exception 'A Fonte mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
    if found and v_source.status = 'active' and row(
      v_source.kind,v_source.title,v_source.citation_text,v_source.url,
      v_source.edition_or_version,v_source.study_visibility
    ) is not distinct from row(
      p_command#>>'{source,kind}',p_command#>>'{source,title}',
      p_command#>>'{source,citationText}',p_command#>>'{source,url}',
      p_command#>>'{source,editionOrVersion}',
      p_command#>>'{source,studyVisibility}'
    ) then
      v_subject_revision := v_source.revision;
    else
      insert into private.course_source_revisions(
        course_id,source_id,revision,status,kind,title,citation_text,url,
        edition_or_version,study_visibility,actor_id
      ) values(
        p_course_id,p_command->>'sourceId',coalesce(v_source.revision,0)+1,
        'active',p_command#>>'{source,kind}',p_command#>>'{source,title}',
        p_command#>>'{source,citationText}',p_command#>>'{source,url}',
        p_command#>>'{source,editionOrVersion}',
        p_command#>>'{source,studyVisibility}',p_actor_id
      ) returning * into v_source;
      v_changed := true;
      v_subject_revision := v_source.revision;
    end if;
    v_subject_id := p_command->>'sourceId';
  elsif v_type = 'retire_source' then
    if p_command - 'type' - 'sourceId' - 'expectedSourceRevision'
         <> '{}'::jsonb
       or not (p_command ?& array['type','sourceId','expectedSourceRevision'])
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 2048
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedSourceRevision') <> 'number'
       or p_command->>'expectedSourceRevision' !~ '^[1-9][0-9]*$' then
      raise exception 'retire_source possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_source_revisions source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    order by source.revision desc limit 1;
    if not found then raise exception 'Fonte inexistente.' using errcode = 'PT404'; end if;
    if v_source.revision <> (p_command->>'expectedSourceRevision')::bigint then
      raise exception 'A Fonte mudou; releia antes de retirar.' using errcode = '40001';
    end if;
    if v_source.status = 'unresolved_legacy' then
      raise exception 'Resolva ou substitua a referência legada antes de retirá-la.'
        using errcode = '23514';
    elsif v_source.status = 'retired' then
      v_subject_revision := v_source.revision;
    else
      insert into private.course_source_revisions(
        course_id,source_id,revision,status,kind,title,citation_text,url,
        edition_or_version,study_visibility,actor_id
      ) values(
        p_course_id,v_source.source_id,v_source.revision+1,'retired',
        v_source.kind,v_source.title,v_source.citation_text,v_source.url,
        v_source.edition_or_version,v_source.study_visibility,p_actor_id
      ) returning * into v_source;
      v_changed := true;
      v_subject_revision := v_source.revision;
    end if;
    v_subject_id := p_command->>'sourceId';
  elsif v_type = 'save_anchor' then
    if p_command - 'type' - 'anchorId' - 'sourceId' - 'sourceRevision'
         - 'expectedAnchorRevision' - 'selector' - 'verificationExcerpt'
         <> '{}'::jsonb
       or not (p_command ?& array[
         'type','anchorId','sourceId','sourceRevision',
         'expectedAnchorRevision','selector','verificationExcerpt'
       ])
       or jsonb_typeof(p_command->'anchorId') <> 'string'
       or char_length(p_command->>'anchorId') not between 1 and 240
       or p_command->>'anchorId' <> btrim(p_command->>'anchorId')
       or p_command->>'anchorId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'sourceId') <> 'string'
       or char_length(p_command->>'sourceId') not between 1 and 2048
       or p_command->>'sourceId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'sourceRevision') <> 'number'
       or p_command->>'sourceRevision' !~ '^[1-9][0-9]*$'
       or jsonb_typeof(p_command->'expectedAnchorRevision') <> 'number'
       or p_command->>'expectedAnchorRevision' !~ '^[0-9]+$'
       or jsonb_typeof(p_command->'selector') <> 'object'
       or jsonb_typeof(p_command->'verificationExcerpt')
         not in ('string','null') then
      raise exception 'save_anchor possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_source from private.course_source_revisions source
    where source.course_id = p_course_id
      and source.source_id = p_command->>'sourceId'
    order by source.revision desc limit 1;
    if not found or v_source.status <> 'active'
       or v_source.revision <> (p_command->>'sourceRevision')::bigint then
      raise exception 'Âncora exige a revisão corrente e ativa da Fonte.'
        using errcode = '23514';
    end if;
    select * into v_anchor from private.course_source_anchor_revisions anchor_value
    where anchor_value.course_id = p_course_id
      and anchor_value.anchor_id = p_command->>'anchorId'
    order by anchor_value.revision desc limit 1;
    if coalesce(v_anchor.revision,0)
         <> (p_command->>'expectedAnchorRevision')::bigint then
      raise exception 'A Âncora mudou; releia antes de salvar.' using errcode = '40001';
    end if;
    if v_anchor.revision is not null and (
      v_anchor.source_id <> p_command->>'sourceId'
      or v_anchor.source_revision <> (p_command->>'sourceRevision')::bigint
    ) then
      raise exception 'A identidade da Âncora permanece presa à revisão original da Fonte.'
        using errcode = '23514';
    end if;
    if not exists(
      select 1
      from private.course_source_anchor_revisions existing_anchor
      where existing_anchor.course_id = p_course_id
        and existing_anchor.source_id = p_command->>'sourceId'
        and existing_anchor.source_revision
          = (p_command->>'sourceRevision')::bigint
        and existing_anchor.anchor_id = p_command->>'anchorId'
    ) and (
      select count(distinct existing_anchor.anchor_id)
      from private.course_source_anchor_revisions existing_anchor
      where existing_anchor.course_id = p_course_id
        and existing_anchor.source_id = p_command->>'sourceId'
        and existing_anchor.source_revision
          = (p_command->>'sourceRevision')::bigint
    ) >= 8 then
      raise exception 'Uma revisão de Fonte aceita no máximo oito identidades de Âncora.'
        using errcode = '23514';
    end if;
    if v_anchor.revision is not null and v_anchor.status = 'active'
       and v_anchor.source_id = p_command->>'sourceId'
       and v_anchor.source_revision = (p_command->>'sourceRevision')::bigint
       and v_anchor.selector = p_command->'selector'
       and v_anchor.verification_excerpt is not distinct from
         p_command#>>'{verificationExcerpt}' then
      v_subject_revision := v_anchor.revision;
    else
      insert into private.course_source_anchor_revisions(
        course_id,anchor_id,revision,source_id,source_revision,status,
        selector,verification_excerpt,actor_id
      ) values(
        p_course_id,p_command->>'anchorId',coalesce(v_anchor.revision,0)+1,
        p_command->>'sourceId',(p_command->>'sourceRevision')::bigint,
        'active',p_command->'selector',p_command#>>'{verificationExcerpt}',
        p_actor_id
      ) returning * into v_anchor;
      v_changed := true;
      v_subject_revision := v_anchor.revision;
    end if;
    v_subject_id := p_command->>'anchorId';
  elsif v_type = 'retire_anchor' then
    if p_command - 'type' - 'anchorId' - 'expectedAnchorRevision'
         <> '{}'::jsonb
       or not (p_command ?& array['type','anchorId','expectedAnchorRevision'])
       or jsonb_typeof(p_command->'anchorId') <> 'string'
       or char_length(p_command->>'anchorId') not between 1 and 240
       or p_command->>'anchorId' <> btrim(p_command->>'anchorId')
       or p_command->>'anchorId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedAnchorRevision') <> 'number'
       or p_command->>'expectedAnchorRevision' !~ '^[1-9][0-9]*$' then
      raise exception 'retire_anchor possui shape inválido.' using errcode = '22023';
    end if;
    select * into v_anchor from private.course_source_anchor_revisions anchor_value
    where anchor_value.course_id = p_course_id
      and anchor_value.anchor_id = p_command->>'anchorId'
    order by anchor_value.revision desc limit 1;
    if not found then raise exception 'Âncora inexistente.' using errcode = 'PT404'; end if;
    if v_anchor.revision <> (p_command->>'expectedAnchorRevision')::bigint then
      raise exception 'A Âncora mudou; releia antes de retirar.' using errcode = '40001';
    end if;
    if v_anchor.status = 'retired' then
      v_subject_revision := v_anchor.revision;
    else
      insert into private.course_source_anchor_revisions(
        course_id,anchor_id,revision,source_id,source_revision,status,
        selector,verification_excerpt,actor_id
      ) values(
        p_course_id,v_anchor.anchor_id,v_anchor.revision+1,
        v_anchor.source_id,v_anchor.source_revision,'retired',
        v_anchor.selector,v_anchor.verification_excerpt,p_actor_id
      ) returning * into v_anchor;
      v_changed := true;
      v_subject_revision := v_anchor.revision;
    end if;
    v_subject_id := p_command->>'anchorId';
  else
    if p_command - 'type' - 'targetKind' - 'targetId'
         - 'expectedTargetVersion' - 'sourceLinks' <> '{}'::jsonb
       or not (p_command ?& array[
         'type','targetKind','targetId','expectedTargetVersion','sourceLinks'
       ])
       or p_command->>'targetKind' not in ('plan_item','study_unit')
       or jsonb_typeof(p_command->'targetId') <> 'string'
       or char_length(p_command->>'targetId') not between 1 and 240
       or p_command->>'targetId' <> btrim(p_command->>'targetId')
       or p_command->>'targetId' ~ '[[:cntrl:]]'
       or jsonb_typeof(p_command->'expectedTargetVersion') <> 'number'
       or p_command->>'expectedTargetVersion' !~ '^[1-9][0-9]*$'
       or not private.valid_course_source_links_shape_v1(
         p_command->'sourceLinks',false
       ) then
      raise exception 'set_target_sources possui shape inválido.' using errcode = '22023';
    end if;
    v_assignment := private.apply_course_source_attribution_v1(
      p_course_id,p_command->>'targetKind',p_command->>'targetId',
      (p_command->>'expectedTargetVersion')::bigint,p_command->'sourceLinks',
      p_actor_id,false
    );
    v_changed := (v_assignment->>'changed')::boolean;
    v_subject_id := p_command->>'targetId';
    v_subject_revision := (v_assignment->>'revision')::bigint;
  end if;

  if v_changed then
    update public.courses course
    set revision = course.revision + 1,updated_at = now()
    where course.id = p_course_id returning * into v_course;
    insert into private.course_events(
      course_id,revision,operation,summary,actor_id
    ) values(
      p_course_id,v_course.revision,'update_course_sources',
      jsonb_build_object(
        'activityKind','course_source_changed','channel',p_channel,
        'commandType',v_type,'subjectIdHash',
          private.course_source_json_hash_v1(to_jsonb(v_subject_id)),
        'subjectRevision',v_subject_revision
      ),p_actor_id
    );
    if v_type = 'set_target_sources' then
      perform private.assert_course_source_target_citation_budget_v1(
        p_course_id,p_command->>'targetKind',p_command->>'targetId'
      );
    elsif v_type = 'save_source'
       and v_source.status = 'active'
       and v_source.study_visibility in ('citation','citation_and_link') then
      for v_study_unit in
        select distinct attribution.target_id
        from private.course_source_attributions attribution
        join private.course_source_attribution_sources source_link
          on source_link.course_id = attribution.course_id
         and source_link.attribution_id = attribution.id
        where attribution.course_id = p_course_id
          and attribution.target_kind = 'study_unit'
          and source_link.source_id = v_source.source_id
          and attribution.id = (
            select effective.id
            from private.course_effective_source_attribution_v1(
              attribution.course_id,
              attribution.target_kind,
              attribution.target_id
            ) effective
          )
      loop
        perform private.assert_course_source_target_citation_budget_v1(
          p_course_id,'study_unit',v_study_unit.target_id
        );
      end loop;
    end if;
  end if;
  v_result := jsonb_build_object(
    'contract','aralearn.course-source-change.v1',
    'courseId',p_course_id,'courseRevision',v_course.revision,
    'requestId',p_request_id,'idempotent',false,'changed',v_changed,
    'change',case when v_changed then jsonb_build_object(
      'type',v_type,'subjectId',v_subject_id,'revision',v_subject_revision
    ) else null end
  );
  insert into private.course_change_receipts(
    actor_id,request_id,operation,course_id,request_hash,result
  ) values(
    p_actor_id,p_request_id,'execute_course_source_command',
    p_course_id,v_hash,v_result
  );
  return v_result;
exception when serialization_failure then
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code','40001',
      'message',sqlerrm,
      'details',null,
      'hint',null
    )::text,
    detail = jsonb_build_object(
      'status',409,
      'headers',jsonb_build_object()
    )::text;
end;
$function$;

create table private.course_source_revisions (
  course_id uuid not null references public.courses(id) on delete cascade,
  source_id text not null,
  revision bigint not null,
  status text not null,
  kind text,
  title text,
  citation_text text,
  url text,
  edition_or_version text,
  study_visibility text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(course_id,source_id,revision),
  constraint course_source_revisions_identity_v1 check(
    char_length(source_id) between 1 and 2048
    and source_id !~ '[[:cntrl:]]'
    and revision > 0
  ),
  constraint course_source_revisions_status_v1 check(
    status in ('active','retired','unresolved_legacy')
    and (
      status = 'unresolved_legacy' and kind is null
      or status <> 'unresolved_legacy'
        and kind in ('web_page','article','book','document','media','other')
    )
    and study_visibility in ('hidden','citation','citation_and_link')
  ),
  constraint course_source_revisions_metadata_v1 check(
    (
      status = 'unresolved_legacy'
      and kind is null
      and title is null and citation_text is null and url is null
      and edition_or_version is null and study_visibility = 'hidden'
      and actor_id is null
    ) or (
      status <> 'unresolved_legacy'
      and nullif(btrim(title),'') is not null
      and title = btrim(title)
      and char_length(title) <= 300
      and title !~ '[[:cntrl:]]'
      and (citation_text is null or (
        nullif(btrim(citation_text),'') is not null
        and citation_text = btrim(citation_text)
        and char_length(citation_text) <= 2048
        and citation_text !~ '^[[:space:]]|[[:space:]]$'
        and translate(citation_text,E'\n\r\t','') !~ '[[:cntrl:]]'
      ))
      and (url is null or (
        url = btrim(url) and char_length(url) <= 2048
        and url ~ '^https://[^[:space:]]+$'
      ))
      and (edition_or_version is null or (
        nullif(btrim(edition_or_version),'') is not null
        and edition_or_version = btrim(edition_or_version)
        and char_length(edition_or_version) <= 120
        and edition_or_version !~ '[[:cntrl:]]'
      ))
      and (study_visibility = 'hidden' or citation_text is not null)
    )
  )
);

create index course_source_revisions_catalog_v1_idx on
  private.course_source_revisions(course_id,source_id,revision desc);

create trigger course_source_revisions_append_only_v1
before update or delete on private.course_source_revisions
for each row execute function private.reject_course_source_fact_change_v1();

create table private.course_source_anchor_revisions (
  course_id uuid not null references public.courses(id) on delete cascade,
  anchor_id text not null,
  revision bigint not null,
  source_id text not null,
  source_revision bigint not null,
  status text not null,
  selector jsonb not null,
  verification_excerpt text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(course_id,anchor_id,revision),
  unique(course_id,anchor_id,revision,source_id,source_revision),
  constraint course_source_anchor_revisions_source_fk_v1 foreign key(
    course_id,source_id,source_revision
  ) references private.course_source_revisions(course_id,source_id,revision)
    on delete cascade,
  constraint course_source_anchor_revisions_identity_v1 check(
    char_length(anchor_id) between 1 and 240
    and anchor_id = btrim(anchor_id)
    and anchor_id !~ '[[:cntrl:]]'
    and revision > 0 and source_revision > 0
    and status in ('active','retired')
  ),
  constraint course_source_anchor_revisions_selector_v1 check(
    jsonb_typeof(selector) = 'object'
    and pg_column_size(selector) <= 32768
    and (
      selector->>'kind' = 'page_range'
      and selector ?& array['kind','startPage','endPage']
      and selector - 'kind' - 'startPage' - 'endPage' = '{}'::jsonb
      and jsonb_typeof(selector->'startPage') = 'number'
      and jsonb_typeof(selector->'endPage') = 'number'
      and selector->>'startPage' ~ '^[0-9]+$'
      and selector->>'endPage' ~ '^[0-9]+$'
      and (selector->>'startPage')::integer between 1 and 1000000
      and (selector->>'endPage')::integer between
        (selector->>'startPage')::integer and 1000000
      or selector->>'kind' = 'time_range'
      and selector ?& array['kind','startMilliseconds','endMilliseconds']
      and selector - 'kind' - 'startMilliseconds' - 'endMilliseconds'
        = '{}'::jsonb
      and jsonb_typeof(selector->'startMilliseconds') = 'number'
      and jsonb_typeof(selector->'endMilliseconds') = 'number'
      and selector->>'startMilliseconds' ~ '^[0-9]+$'
      and selector->>'endMilliseconds' ~ '^[0-9]+$'
      and (selector->>'startMilliseconds')::bigint between 0 and 2147483647
      and (selector->>'endMilliseconds')::bigint between
        (selector->>'startMilliseconds')::bigint + 1 and 2147483647
      or selector->>'kind' = 'uri_fragment'
      and selector ?& array['kind','fragment']
      and selector - 'kind' - 'fragment' = '{}'::jsonb
      and jsonb_typeof(selector->'fragment') = 'string'
      and char_length(selector->>'fragment') between 1 and 2048
      and selector->>'fragment' = btrim(selector->>'fragment')
      and left(selector->>'fragment',1) <> '#'
      and selector->>'fragment' !~ '[[:cntrl:]]'
      or selector->>'kind' = 'text_quote'
      and selector ?& array['kind','exact','prefix','suffix']
      and selector - 'kind' - 'exact' - 'prefix' - 'suffix' = '{}'::jsonb
      and jsonb_typeof(selector->'exact') = 'string'
      and char_length(selector->>'exact') between 1 and 4000
      and translate(selector->>'exact',E'\n\r\t','') !~ '[[:cntrl:]]'
      and (selector->'prefix' = 'null'::jsonb or (
        jsonb_typeof(selector->'prefix') = 'string'
        and char_length(selector->>'prefix') between 1 and 500
        and nullif(btrim(selector->>'prefix'),'') is not null
        and selector->>'prefix' = btrim(selector->>'prefix')
        and selector->>'prefix' !~ '^[[:space:]]|[[:space:]]$'
        and translate(selector->>'prefix',E'\n\r\t','') !~ '[[:cntrl:]]'
      ))
      and (selector->'suffix' = 'null'::jsonb or (
        jsonb_typeof(selector->'suffix') = 'string'
        and char_length(selector->>'suffix') between 1 and 500
        and nullif(btrim(selector->>'suffix'),'') is not null
        and selector->>'suffix' = btrim(selector->>'suffix')
        and selector->>'suffix' !~ '^[[:space:]]|[[:space:]]$'
        and translate(selector->>'suffix',E'\n\r\t','') !~ '[[:cntrl:]]'
      ))
    )
  ),
  constraint course_source_anchor_revisions_excerpt_v1 check(
    verification_excerpt is null or (
      char_length(verification_excerpt) between 1 and 2000
      and octet_length(verification_excerpt) <= 8000
      and translate(verification_excerpt,E'\n\r\t','') !~ '[[:cntrl:]]'
    )
  )
);

create index course_source_anchor_revisions_source_v1_idx on
  private.course_source_anchor_revisions(
    course_id,source_id,source_revision,anchor_id,revision desc
  );

create trigger course_source_anchor_revisions_append_only_v1
before update or delete on private.course_source_anchor_revisions
for each row execute function private.reject_course_source_fact_change_v1();

create table private.course_source_attributions (
  course_id uuid not null references public.courses(id) on delete cascade,
  id uuid not null default extensions.gen_random_uuid(),
  target_kind text not null,
  target_id text not null,
  target_version bigint not null,
  target_hash text not null,
  revision bigint not null,
  attribution_hash text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(course_id,id),
  unique(course_id,target_kind,target_id,revision),
  constraint course_source_attributions_target_v1 check(
    target_kind in ('plan_item','study_unit')
    and char_length(target_id) between 1 and 240
    and target_version > 0 and revision > 0
    and target_hash ~ '^[a-f0-9]{64}$'
    and attribution_hash ~ '^[a-f0-9]{64}$'
  )
);

create index course_source_attributions_target_v1_idx on
  private.course_source_attributions(
    course_id,target_kind,target_id,revision desc,id desc
  );

create trigger course_source_attributions_append_only_v1
before update or delete on private.course_source_attributions
for each row execute function private.reject_course_source_fact_change_v1();

create table private.course_source_attribution_sources (
  course_id uuid not null,
  attribution_id uuid not null,
  source_ordinal integer not null,
  source_id text not null,
  source_revision bigint not null,
  relation text not null,
  primary key(course_id,attribution_id,source_ordinal),
  unique(
    course_id,attribution_id,source_ordinal,source_id,source_revision
  ),
  constraint course_source_attribution_sources_attribution_fk_v1 foreign key(
    course_id,attribution_id
  ) references private.course_source_attributions(course_id,id)
    on delete cascade,
  constraint course_source_attribution_sources_source_fk_v1 foreign key(
    course_id,source_id,source_revision
  ) references private.course_source_revisions(course_id,source_id,revision)
    on delete cascade,
  constraint course_source_attribution_sources_value_v1 check(
    source_ordinal between 0 and 127
    and char_length(source_id) between 1 and 2048
    and source_revision > 0
    and relation in (
      'informed_by','supported_by','adapted_from','quoted_from',
      'legacy_reference'
    )
  )
);

create table private.course_source_attribution_anchors (
  course_id uuid not null,
  attribution_id uuid not null,
  source_ordinal integer not null,
  anchor_ordinal integer not null,
  source_id text not null,
  source_revision bigint not null,
  anchor_id text not null,
  anchor_revision bigint not null,
  primary key(
    course_id,attribution_id,source_ordinal,anchor_ordinal
  ),
  unique(course_id,attribution_id,anchor_id),
  constraint course_source_attribution_anchors_source_link_fk_v1 foreign key(
    course_id,attribution_id,source_ordinal,source_id,source_revision
  ) references private.course_source_attribution_sources(
    course_id,attribution_id,source_ordinal,source_id,source_revision
  ) on delete cascade,
  constraint course_source_attribution_anchors_anchor_fk_v1 foreign key(
    course_id,anchor_id,anchor_revision,source_id,source_revision
  ) references private.course_source_anchor_revisions(
    course_id,anchor_id,revision,source_id,source_revision
  ) on delete cascade,
  constraint course_source_attribution_anchors_value_v1 check(
    source_ordinal between 0 and 127
    and anchor_ordinal between 0 and 63
    and source_revision > 0 and anchor_revision > 0
  )
);

create trigger course_source_attribution_sources_append_only_v1
before update or delete on private.course_source_attribution_sources
for each row execute function private.reject_course_source_fact_change_v1();

create trigger course_source_attribution_anchors_append_only_v1
before update or delete on private.course_source_attribution_anchors
for each row execute function private.reject_course_source_fact_change_v1();

revoke all on table private.course_source_revisions,
  private.course_source_anchor_revisions,
  private.course_source_attributions,
  private.course_source_attribution_sources,
  private.course_source_attribution_anchors
from public,anon,authenticated,service_role;

alter table private.course_source_revisions enable row level security;
alter table private.course_source_revisions force row level security;
alter table private.course_source_anchor_revisions enable row level security;
alter table private.course_source_anchor_revisions force row level security;
alter table private.course_source_attributions enable row level security;
alter table private.course_source_attributions force row level security;
alter table private.course_source_attribution_sources enable row level security;
alter table private.course_source_attribution_sources force row level security;
alter table private.course_source_attribution_anchors enable row level security;
alter table private.course_source_attribution_anchors force row level security;

insert into private.course_source_revisions(
  course_id,source_id,revision,status,kind,title,citation_text,url,
  edition_or_version,study_visibility,actor_id
)
select distinct legacy.course_id,legacy.source_id,1,
  'unresolved_legacy',null,null,null,null,null,'hidden',null::uuid
from course_legacy_source_refs_v1 legacy;

update private.course_entities entity
set content = entity.content - 'sources'
where entity.entity_type = 'study_unit';

alter table private.course_entities
  drop constraint course_entities_content_v1,
  add constraint course_entities_content_v2 check(
    jsonb_typeof(content) = 'object'
    and not (content ? 'id')
    and not (content ? 'position')
    and not (entity_type = 'module' and content ? 'lessons')
    and not (
      entity_type = 'lesson'
      and (content ? 'topics' or content ? 'microsequences')
    )
    and not (
      entity_type = 'microsequence'
      and (content ? 'studyUnits' or content ? 'cards')
    )
    and not (entity_type = 'study_unit' and content ? 'sources')
    and pg_column_size(content) <= 1048576
    and (
      entity_type <> 'study_unit'
      or octet_length(content::text) <= 1048576
    )
    and (
      entity_type not in (
        'module','lesson','microsequence','study_unit'
      )
      or (
        jsonb_typeof(content->'title') = 'string'
        and coalesce(content->>'title' ~ '[^[:space:]]',false)
        and char_length(content->>'title') <= 300
        and translate(content->>'title',E'\n\r\t','') !~ '[[:cntrl:]]'
      )
    )
  );

insert into private.course_source_attributions(
  course_id,id,target_kind,target_id,target_version,target_hash,
  revision,attribution_hash,actor_id
)
select entity.course_id,extensions.gen_random_uuid(),'study_unit',
  entity.entity_id,entity.version,
  private.course_source_json_hash_v1(jsonb_build_object(
    'targetKind','study_unit','content',entity.content
  )),1,
  private.course_source_json_hash_v1(coalesce((
    select jsonb_agg(jsonb_build_object(
      'sourceId',legacy.source_id,'sourceRevision',1,
      'relation','legacy_reference','anchors','[]'::jsonb
    ) order by legacy.source_ordinal)
    from course_legacy_source_refs_v1 legacy
    where legacy.course_id = entity.course_id
      and legacy.study_unit_id = entity.entity_id
  ),'[]'::jsonb)),null
from private.course_entities entity
where entity.entity_type = 'study_unit';

insert into private.course_source_attribution_sources(
  course_id,attribution_id,source_ordinal,source_id,source_revision,relation
)
select attribution.course_id,attribution.id,legacy.source_ordinal,
  legacy.source_id,1,'legacy_reference'
from private.course_source_attributions attribution
join course_legacy_source_refs_v1 legacy
  on legacy.course_id = attribution.course_id
 and legacy.study_unit_id = attribution.target_id
where attribution.target_kind = 'study_unit'
  and attribution.revision = 1;

insert into private.course_source_attributions(
  course_id,id,target_kind,target_id,target_version,target_hash,
  revision,attribution_hash,actor_id
)
select item.course_id,extensions.gen_random_uuid(),'plan_item',item.id::text,
  item.version,private.course_source_json_hash_v1(jsonb_build_object(
    'targetKind','plan_item','itemKind',item.item_kind,
    'statement',item.statement
  )),1,private.course_source_json_hash_v1('[]'::jsonb),null
from private.course_instructional_plan_items item;

do $course_sources_backfill_postflight$
declare
  v_expected record;
  v_study_unit_count bigint;
  v_source_ref_count bigint;
  v_ordered_hash text;
begin
  select * into strict v_expected from course_legacy_source_audit_v1;
  select count(*) into v_study_unit_count
  from private.course_source_attributions attribution
  where attribution.target_kind = 'study_unit' and attribution.revision = 1;
  select count(*) into v_source_ref_count
  from private.course_source_attribution_sources;
  select encode(extensions.digest(convert_to(coalesce(string_agg(
    encode(convert_to(source_link.course_id::text,'UTF8'),'base64') || ':' ||
    encode(convert_to(attribution.target_id,'UTF8'),'base64') || ':' ||
    source_link.source_ordinal::text || ':' ||
    encode(convert_to(source_link.source_id,'UTF8'),'base64'),
    E'\n' order by source_link.course_id,attribution.target_id,
      source_link.source_ordinal
  ),''),'UTF8'),'sha256'),'hex') into v_ordered_hash
  from private.course_source_attribution_sources source_link
  join private.course_source_attributions attribution
    on attribution.course_id = source_link.course_id
   and attribution.id = source_link.attribution_id
  where attribution.target_kind = 'study_unit' and attribution.revision = 1;
  if exists(
    select 1 from private.course_entities entity
    where entity.entity_type = 'study_unit' and entity.content ? 'sources'
  ) or v_study_unit_count <> v_expected.study_unit_count
     or v_source_ref_count <> v_expected.source_ref_count
     or v_ordered_hash <> v_expected.ordered_hash then
    raise exception 'Backfill de StudyUnit.sources não preservou shape, contagem, hash e ordem.'
      using errcode = '55000';
  end if;
end;
$course_sources_backfill_postflight$;

create function private.course_source_target_state_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_version bigint;
  v_document jsonb;
begin
  if p_target_kind = 'plan_item' then
    select item.version,jsonb_build_object(
      'targetKind','plan_item','itemKind',item.item_kind,
      'statement',item.statement
    ) into v_version,v_document
    from private.course_instructional_plan_items item
    where item.course_id = p_course_id
      and item.id::text = p_target_id;
  elsif p_target_kind = 'study_unit' then
    select entity.version,jsonb_build_object(
      'targetKind','study_unit','content',entity.content
    ) into v_version,v_document
    from private.course_entities entity
    where entity.course_id = p_course_id
      and entity.entity_type = 'study_unit'
      and entity.entity_id = p_target_id;
  else
    raise exception 'Tipo do alvo de proveniência inválido.'
      using errcode = '22023';
  end if;
  if v_version is null then return null; end if;
  return jsonb_build_object(
    'version',v_version,
    'hash',private.course_source_json_hash_v1(v_document)
  );
end;
$function$;

create function private.course_source_links_v1(
  p_course_id uuid,
  p_attribution_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceId',source_link.source_id,
    'sourceRevision',source_link.source_revision,
    'relation',source_link.relation,
    'anchors',coalesce((
      select jsonb_agg(jsonb_build_object(
        'anchorId',anchor_link.anchor_id,
        'anchorRevision',anchor_link.anchor_revision
      ) order by anchor_link.anchor_ordinal)
      from private.course_source_attribution_anchors anchor_link
      where anchor_link.course_id = source_link.course_id
        and anchor_link.attribution_id = source_link.attribution_id
        and anchor_link.source_ordinal = source_link.source_ordinal
    ),'[]'::jsonb)
  ) order by source_link.source_ordinal),'[]'::jsonb)
  from private.course_source_attribution_sources source_link
  where source_link.course_id = p_course_id
    and source_link.attribution_id = p_attribution_id
$function$;

create function private.course_effective_source_attribution_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
returns private.course_source_attributions
language sql
volatile
security definer
set search_path = pg_catalog,private
as $function$
  select attribution
  from private.course_source_attributions attribution
  cross join lateral private.course_source_target_state_v1(
    p_course_id,p_target_kind,p_target_id
  ) state
  where attribution.course_id = p_course_id
    and attribution.target_kind = p_target_kind
    and attribution.target_id = p_target_id
    and attribution.target_version = (state->>'version')::bigint
    and attribution.target_hash = state->>'hash'
  order by attribution.revision desc,attribution.id desc
  limit 1
$function$;

create function private.course_effective_source_links_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_attribution private.course_source_attributions%rowtype;
begin
  select * into v_attribution
  from private.course_effective_source_attribution_v1(
    p_course_id,p_target_kind,p_target_id
  );
  if v_attribution.id is null then return '[]'::jsonb; end if;
  return private.course_source_links_v1(p_course_id,v_attribution.id);
end;
$function$;

create function private.valid_course_source_links_shape_v1(
  p_links jsonb,
  p_allow_legacy_ids boolean default false
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    jsonb_typeof(p_links) = 'array'
    and jsonb_array_length(p_links) <= case
      when p_allow_legacy_ids then 128 else 32 end
    and octet_length(p_links::text) <= 131072
    and not exists(
      select 1
      from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
      where jsonb_typeof(link.value) <> 'object'
        or link.value - 'sourceId' - 'sourceRevision' - 'relation' - 'anchors'
          <> '{}'::jsonb
        or not (link.value ?& array[
          'sourceId','sourceRevision','relation','anchors'
        ])
        or jsonb_typeof(link.value->'sourceId') <> 'string'
        or char_length(link.value->>'sourceId') not between 1 and 2048
        or link.value->>'sourceId' ~ '[[:cntrl:]]'
        or jsonb_typeof(link.value->'sourceRevision') <> 'number'
        or link.value->>'sourceRevision' !~ '^[1-9][0-9]*$'
        or (link.value->>'sourceRevision')::numeric > 9223372036854775807
        or link.value->>'relation' not in (
          'informed_by','supported_by','adapted_from','quoted_from'
        ) and not (
          p_allow_legacy_ids
          and link.value->>'relation' = 'legacy_reference'
        )
        or jsonb_typeof(link.value->'anchors') <> 'array'
        or jsonb_array_length(link.value->'anchors') > 8
        or not p_allow_legacy_ids
          and jsonb_array_length(link.value->'anchors') = 0
        or link.value->>'relation' = 'quoted_from'
          and jsonb_array_length(link.value->'anchors') = 0
        or exists(
          select 1
          from jsonb_array_elements(link.value->'anchors') anchor(value)
          where jsonb_typeof(anchor.value) <> 'object'
            or anchor.value - 'anchorId' - 'anchorRevision' <> '{}'::jsonb
            or not (anchor.value ?& array['anchorId','anchorRevision'])
            or jsonb_typeof(anchor.value->'anchorId') <> 'string'
            or char_length(anchor.value->>'anchorId') not between 1 and 240
            or anchor.value->>'anchorId' <> btrim(anchor.value->>'anchorId')
            or anchor.value->>'anchorId' ~ '[[:cntrl:]]'
            or jsonb_typeof(anchor.value->'anchorRevision') <> 'number'
            or anchor.value->>'anchorRevision' !~ '^[1-9][0-9]*$'
            or (anchor.value->>'anchorRevision')::numeric > 9223372036854775807
        )
    )
    and (p_allow_legacy_ids or (
      select count(*) = count(distinct link.value->>'sourceId')
      from jsonb_array_elements(p_links) link(value)
    ))
    and (p_allow_legacy_ids or (
      select count(*) = count(distinct anchor.value->>'anchorId')
      from jsonb_array_elements(p_links) link(value)
      cross join lateral jsonb_array_elements(link.value->'anchors') anchor(value)
    )),false
  )
$function$;

create function private.apply_course_source_attribution_v1(
  p_course_id uuid,
  p_target_kind text,
  p_target_id text,
  p_expected_target_version bigint,
  p_links jsonb,
  p_actor_id uuid,
  p_allow_identical_legacy_carry boolean default false,
  p_explicit_target_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,private,extensions
as $function$
declare
  v_state jsonb;
  v_effective private.course_source_attributions%rowtype;
  v_previous private.course_source_attributions%rowtype;
  v_previous_links jsonb;
  v_attribution private.course_source_attributions%rowtype;
  v_link record;
  v_anchor record;
  v_current_revision bigint;
  v_current_status text;
  v_carry boolean := false;
begin
  if p_course_id is null or p_actor_id is null
     or p_target_kind not in ('plan_item','study_unit')
     or p_target_id is null or char_length(p_target_id) not between 1 and 240
     or p_expected_target_version is null or p_expected_target_version < 1
     or p_explicit_target_hash is not null
       and p_explicit_target_hash !~ '^[a-f0-9]{64}$'
     or not private.valid_course_source_links_shape_v1(p_links,false) then
    raise exception 'Aplicação de proveniência inválida.'
      using errcode = '22023';
  end if;
  if p_explicit_target_hash is null then
    v_state := private.course_source_target_state_v1(
      p_course_id,p_target_kind,p_target_id
    );
    if v_state is null then
      raise exception 'Alvo de proveniência inexistente.' using errcode = 'PT404';
    end if;
    if (v_state->>'version')::bigint <> p_expected_target_version then
      raise exception 'O alvo de proveniência mudou; releia antes de salvar.'
        using errcode = '40001';
    end if;
  else
    v_state := private.course_source_target_state_v1(
      p_course_id,p_target_kind,p_target_id
    );
    if v_state is null then
      raise exception 'Alvo de proveniência inexistente.' using errcode = 'PT404';
    end if;
    if (v_state->>'version')::bigint <> p_expected_target_version
       or v_state->>'hash' <> p_explicit_target_hash then
      raise exception 'O alvo de proveniência divergiu do estado materializado.'
        using errcode = '40001';
    end if;
  end if;
  if p_explicit_target_hash is null then
    select * into v_effective
    from private.course_effective_source_attribution_v1(
      p_course_id,p_target_kind,p_target_id
    );
  else
    select * into v_effective
    from private.course_source_attributions attribution
    where attribution.course_id = p_course_id
      and attribution.target_kind = p_target_kind
      and attribution.target_id = p_target_id
      and attribution.target_version = p_expected_target_version
      and attribution.target_hash = p_explicit_target_hash
    order by attribution.revision desc,attribution.id desc
    limit 1;
  end if;
  if v_effective.id is not null and private.course_source_links_v1(
    p_course_id,v_effective.id
  ) = p_links then
    return jsonb_build_object(
      'changed',false,'attributionId',v_effective.id,
      'revision',v_effective.revision,
      'attributionHash',v_effective.attribution_hash
    );
  end if;

  select * into v_previous
  from private.course_source_attributions attribution
  where attribution.course_id = p_course_id
    and attribution.target_kind = p_target_kind
    and attribution.target_id = p_target_id
  order by attribution.revision desc,attribution.id desc limit 1;
  if found then
    v_previous_links := private.course_source_links_v1(
      p_course_id,v_previous.id
    );
    v_carry := p_allow_identical_legacy_carry and v_previous_links = p_links;
  end if;

  if not v_carry and jsonb_array_length(p_links) > 0 then
    for v_link in
      select link.value,link.ordinal::integer - 1 as ordinal
      from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
    loop
      select source.revision,source.status into v_current_revision,v_current_status
      from private.course_source_revisions source
      where source.course_id = p_course_id
        and source.source_id = v_link.value->>'sourceId'
      order by source.revision desc limit 1;
      if not found or v_current_status <> 'active'
         or v_current_revision <> (v_link.value->>'sourceRevision')::bigint
         or jsonb_array_length(v_link.value->'anchors') < 1 then
        raise exception 'Vínculo novo exige Fonte atual, ativa e Âncora verificada.'
          using errcode = '23514';
      end if;
      for v_anchor in
        select anchor.value
        from jsonb_array_elements(v_link.value->'anchors') anchor(value)
      loop
        select anchor_value.revision,anchor_value.status
        into v_current_revision,v_current_status
        from private.course_source_anchor_revisions anchor_value
        where anchor_value.course_id = p_course_id
          and anchor_value.anchor_id = v_anchor.value->>'anchorId'
          and anchor_value.source_id = v_link.value->>'sourceId'
          and anchor_value.source_revision
            = (v_link.value->>'sourceRevision')::bigint
        order by anchor_value.revision desc limit 1;
        if not found or v_current_status <> 'active'
           or v_current_revision <> (v_anchor.value->>'anchorRevision')::bigint then
          raise exception 'Âncora nova precisa ser atual, ativa e presa à revisão exata da Fonte.'
            using errcode = '23514';
        end if;
      end loop;
    end loop;
  end if;

  insert into private.course_source_attributions(
    course_id,id,target_kind,target_id,target_version,target_hash,
    revision,attribution_hash,actor_id
  ) values(
    p_course_id,extensions.gen_random_uuid(),p_target_kind,p_target_id,
    p_expected_target_version,v_state->>'hash',coalesce(v_previous.revision,0)+1,
    private.course_source_json_hash_v1(p_links),p_actor_id
  ) returning * into v_attribution;

  insert into private.course_source_attribution_sources(
    course_id,attribution_id,source_ordinal,source_id,source_revision,relation
  )
  select p_course_id,v_attribution.id,link.ordinal::integer - 1,
    link.value->>'sourceId',(link.value->>'sourceRevision')::bigint,
    link.value->>'relation'
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal);

  insert into private.course_source_attribution_anchors(
    course_id,attribution_id,source_ordinal,anchor_ordinal,
    source_id,source_revision,anchor_id,anchor_revision
  )
  select p_course_id,v_attribution.id,link.ordinal::integer - 1,
    anchor.ordinal::integer - 1,link.value->>'sourceId',
    (link.value->>'sourceRevision')::bigint,
    anchor.value->>'anchorId',(anchor.value->>'anchorRevision')::bigint
  from jsonb_array_elements(p_links) with ordinality link(value,ordinal)
  cross join lateral jsonb_array_elements(link.value->'anchors')
    with ordinality anchor(value,ordinal);

  return jsonb_build_object(
    'changed',true,'attributionId',v_attribution.id,
    'revision',v_attribution.revision,
    'attributionHash',v_attribution.attribution_hash
  );
end;
$function$;

create function private.course_plan_item_sources_projection_v1(
  p_course_id uuid,
  p_items jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  select coalesce(jsonb_agg(
    item.value || jsonb_build_object(
      'sourceLinks',private.course_effective_source_links_v1(
        p_course_id,'plan_item',item.value->>'id'
      )
    ) order by item.ordinal
  ),'[]'::jsonb)
  from jsonb_array_elements(p_items) with ordinality item(value,ordinal)
$function$;

create function private.course_plan_sources_projection_v1(
  p_course_id uuid,
  p_document jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog,private
as $function$
declare
  v_plan jsonb;
begin
  if jsonb_typeof(p_document) <> 'object' then return p_document; end if;
  v_plan := case when jsonb_typeof(p_document->'plan') = 'object'
    then p_document->'plan' else p_document end;
  if not (v_plan ?& array[
    'intendedLearningOutcomes','instructionalAnalysisUnits',
    'evidenceRequirements'
  ]) then return p_document; end if;
  v_plan := jsonb_set(v_plan,'{intendedLearningOutcomes}',
    private.course_plan_item_sources_projection_v1(
      p_course_id,v_plan->'intendedLearningOutcomes'
    ),true);
  v_plan := jsonb_set(v_plan,'{instructionalAnalysisUnits}',
    private.course_plan_item_sources_projection_v1(
      p_course_id,v_plan->'instructionalAnalysisUnits'
    ),true);
  v_plan := jsonb_set(v_plan,'{evidenceRequirements}',
    private.course_plan_item_sources_projection_v1(
      p_course_id,v_plan->'evidenceRequirements'
    ),true);
  if jsonb_typeof(p_document->'plan') = 'object' then
    return jsonb_set(p_document,'{plan}',v_plan,true);
  end if;
  return v_plan;
end;
$function$;

create function private.course_plan_without_sources_v1(p_plan jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_result jsonb := p_plan;
  v_collection text;
  v_items jsonb;
begin
  foreach v_collection in array array[
    'intendedLearningOutcomes','instructionalAnalysisUnits',
    'evidenceRequirements'
  ]::text[] loop
    select coalesce(jsonb_agg(item.value - 'sourceLinks'
      order by item.ordinal),'[]'::jsonb)
    into v_items
    from jsonb_array_elements(p_plan->v_collection)
      with ordinality item(value,ordinal);
    v_result := jsonb_set(v_result,array[v_collection],v_items,true);
  end loop;
  return v_result;
end;
$function$;

alter function private.course_instructional_plan_command_document_v1(uuid)
  rename to course_instructional_plan_command_document_core_v1;

create function private.course_instructional_plan_command_document_v1(
  p_course_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  select private.course_plan_sources_projection_v1(
    p_course_id,
    private.course_instructional_plan_command_document_core_v1(p_course_id)
  )
$function$;

alter function private.get_course_instructional_plan_for_actor_v1(
  uuid,uuid,integer
) rename to get_course_instructional_plan_for_actor_core_v1;

create function private.get_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_recent_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog,private
as $function$
  select private.course_plan_sources_projection_v1(
    p_course_id,
    private.get_course_instructional_plan_for_actor_core_v1(
      p_actor_id,p_course_id,p_recent_limit
    )
  )
$function$;

alter function public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) set schema private;

alter function private.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
) rename to commit_course_instructional_plan_core_v1;

create function public.commit_course_instructional_plan_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_course_revision bigint,
  p_expected_plan_version bigint,
  p_command jsonb,
  p_plan jsonb,
  p_channel text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,extensions
as $function$
declare
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_result jsonb;
  v_item jsonb;
  v_item_state jsonb;
  v_assignment jsonb;
  v_command_assignment jsonb;
  v_assignment_count integer := 0;
  v_course public.courses%rowtype;
  v_plan private.course_instructional_plans%rowtype;
  v_collection text;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_expected_course_revision is null
     or p_expected_plan_version is null
     or p_channel not in ('application','mcp')
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_command) <> 'object'
     or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Commit do plano com Fontes inválido.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId',p_course_id,
    'expectedCourseRevision',p_expected_course_revision,
    'expectedPlanVersion',p_expected_plan_version,
    'channel',p_channel,'command',p_command
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
    if v_receipt.operation <> 'commit_instructional_plan'
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com plano incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent')
      || jsonb_build_object('idempotent',true);
  end if;
  if not (p_plan ?& array[
    'intendedLearningOutcomes','instructionalAnalysisUnits',
    'evidenceRequirements'
  ]) then
    raise exception 'Plano não contém coleções de Fontes.' using errcode = '22023';
  end if;
  foreach v_collection in array array[
    'intendedLearningOutcomes','instructionalAnalysisUnits',
    'evidenceRequirements'
  ]::text[] loop
    if jsonb_typeof(p_plan->v_collection) <> 'array' or exists(
      select 1 from jsonb_array_elements(p_plan->v_collection) item(value)
      where jsonb_typeof(item.value) <> 'object'
        or not (item.value ? 'sourceLinks')
        or not private.valid_course_source_links_shape_v1(
          item.value->'sourceLinks',false
        )
    ) then
      raise exception 'Item de plano não contém sourceLinks canônico.'
        using errcode = '22023';
    end if;
  end loop;
  if p_command->>'type' in ('add_plan_item','update_plan_item') then
    if p_command - 'type' - 'kind' - 'id' - 'position'
         - 'statement' - 'sourceLinks' <> '{}'::jsonb
       or not (p_command ?& array['type','kind','id','statement','sourceLinks'])
       or not private.valid_course_source_links_shape_v1(
         p_command->'sourceLinks',false
       ) then
      raise exception 'add/update_plan_item exige sourceLinks explícito.'
        using errcode = '22023';
    end if;
    select item.value into v_item
    from (
      select item.value
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes') item(value)
      union all
      select item.value
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits') item(value)
      union all
      select item.value
      from jsonb_array_elements(p_plan->'evidenceRequirements') item(value)
    ) item
    where item.value->>'id' = p_command->>'id';
    if v_item is null or v_item->'sourceLinks' <> p_command->'sourceLinks' then
      raise exception 'sourceLinks do comando diverge do alvo do plano.'
        using errcode = '23514';
    end if;
  end if;

  v_result := private.commit_course_instructional_plan_core_v1(
    p_actor_id,p_course_id,p_expected_course_revision,
    p_expected_plan_version,case
      when p_command->>'type' in ('add_plan_item','update_plan_item')
        then p_command - 'sourceLinks'
      else p_command
    end,
    private.course_plan_without_sources_v1(p_plan),p_channel,p_request_id
  );
  for v_item in
    select item.value
    from (
      select item.value,1 as collection_order,item.ordinal
      from jsonb_array_elements(p_plan->'intendedLearningOutcomes')
        with ordinality item(value,ordinal)
      union all
      select item.value,2,item.ordinal
      from jsonb_array_elements(p_plan->'instructionalAnalysisUnits')
        with ordinality item(value,ordinal)
      union all
      select item.value,3,item.ordinal
      from jsonb_array_elements(p_plan->'evidenceRequirements')
        with ordinality item(value,ordinal)
    ) item
    order by item.collection_order,item.ordinal
  loop
    v_item_state := private.course_source_target_state_v1(
      p_course_id,'plan_item',v_item->>'id'
    );
    if v_item_state is null then
      raise exception 'O plano não preservou o alvo de proveniência.'
        using errcode = '55000';
    end if;
    v_assignment := private.apply_course_source_attribution_v1(
      p_course_id,'plan_item',v_item->>'id',
      (v_item_state->>'version')::bigint,v_item->'sourceLinks',
      p_actor_id,false,v_item_state->>'hash'
    );
    if (v_assignment->>'changed')::boolean then
      v_assignment_count := v_assignment_count + 1;
      if p_command->>'type' in ('add_plan_item','update_plan_item')
         and v_item->>'id' = p_command->>'id' then
        v_command_assignment := v_assignment;
      end if;
    end if;
    perform private.assert_course_source_target_citation_budget_v1(
      p_course_id,'plan_item',v_item->>'id'
    );
  end loop;
  if v_assignment_count > 0 then
    if not (v_result->>'changed')::boolean then
      update private.course_instructional_plans plan
      set version = plan.version + 1,updated_at = now()
      where plan.course_id = p_course_id returning * into v_plan;
      update public.courses course
      set revision = course.revision + 1,updated_at = now()
      where course.id = p_course_id returning * into v_course;
      insert into private.course_events(
        course_id,revision,operation,summary,actor_id
      ) values(
        p_course_id,v_course.revision,'update_course_instructional_plan',
        jsonb_build_object(
          'activityKind','plan_changed','channel',p_channel,
          'instructionalPlanId',v_plan.id,'planVersion',v_plan.version,
          'commandType',p_command->>'type',
          'instructionalPlanItemId',p_command->>'id',
          'sourceAttributionCount',v_assignment_count
        ) || case when v_command_assignment is null then '{}'::jsonb
          else jsonb_build_object(
            'sourceAttributionRevision',v_command_assignment->>'revision',
            'sourceAttributionHash',v_command_assignment->>'attributionHash'
          ) end,
        p_actor_id
      );
      v_result := jsonb_set(v_result,'{courseRevision}',
        to_jsonb(v_course.revision),true);
      v_result := jsonb_set(v_result,'{planVersion}',
        to_jsonb(v_plan.version),true);
      v_result := jsonb_set(v_result,'{changed}','true'::jsonb,true);
      v_result := jsonb_set(v_result,'{updatedAt}',
        to_jsonb(greatest(v_course.updated_at,v_plan.updated_at)),true);
    else
      update private.course_events event_value
      set summary = event_value.summary || jsonb_build_object(
        'sourceAttributionCount',v_assignment_count
      ) || case when v_command_assignment is null then '{}'::jsonb
        else jsonb_build_object(
          'sourceAttributionRevision',v_command_assignment->>'revision',
          'sourceAttributionHash',v_command_assignment->>'attributionHash'
        ) end
      where event_value.course_id = p_course_id
        and event_value.revision = (v_result->>'courseRevision')::bigint;
    end if;
  end if;
  update private.course_change_receipts receipt
  set request_hash = v_hash,result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  return v_result;
end;
$function$;

-- Contextos v1 existentes nasceram antes da autoridade de Fontes. Eles são
-- promovidos com atribuições vazias, sem consultar estado corrente nem
-- inventar proveniência histórica.
update private.course_authoring_part_materializations materialization
set design_context = jsonb_set(
  jsonb_set(
    materialization.design_context,
    '{contract}',to_jsonb('aralearn.course-design-context.v2'::text),true
  ),
  '{targets}',coalesce((
    select jsonb_agg(
      target.value || jsonb_build_object(
        'sourceAttributions',jsonb_build_object(
          'instructionalAnalysisUnits','[]'::jsonb,
          'evidenceRequirements','[]'::jsonb
        )
      ) order by target.ordinal
    )
    from jsonb_array_elements(materialization.design_context->'targets')
      with ordinality target(value,ordinal)
  ),'[]'::jsonb),true
)
where materialization.design_context->>'contract'
  = 'aralearn.course-design-context.v1';

comment on function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
) is 'Leitura owner-only paginada do catálogo, histórico exato da Fonte ou histórico do alvo.';

comment on function public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
) is 'Comando owner-only idempotente para revisões de Fonte, Âncora e atribuição de proveniência.';

comment on function public.get_course_study_citations_v1(uuid,bigint,text) is
  'Leitura autenticada redigida das citações efetivas de uma Unidade de estudo.';

revoke all on function private.course_source_json_hash_v1(jsonb),
  private.reject_course_source_fact_change_v1(),
  private.course_source_context_plan_items_v1(uuid,jsonb),
  private.course_design_context_with_sources_v1(jsonb),
  private.course_materialization_design_context_v1(uuid,uuid,bigint,jsonb),
  private.valid_course_design_application_v2(jsonb,text,jsonb),
  private.valid_course_source_materialization_application_v1(
    jsonb,text,jsonb,jsonb
  ),
  private.course_source_cursor_v1(text,integer),
  private.course_study_citations_payload_v1(uuid,text,bigint),
  private.assert_course_source_target_citation_budget_v1(
    uuid,text,text
  ),
  private.course_source_target_state_v1(uuid,text,text),
  private.course_source_links_v1(uuid,uuid),
  private.course_effective_source_attribution_v1(uuid,text,text),
  private.course_effective_source_links_v1(uuid,text,text),
  private.valid_course_source_links_shape_v1(jsonb,boolean),
  private.apply_course_source_attribution_v1(
    uuid,text,text,bigint,jsonb,uuid,boolean,text
  ),
  private.course_plan_item_sources_projection_v1(uuid,jsonb),
  private.course_plan_sources_projection_v1(uuid,jsonb),
  private.course_plan_without_sources_v1(jsonb),
  private.course_instructional_plan_command_document_v1(uuid),
  private.get_course_instructional_plan_for_actor_v1(uuid,uuid,integer),
  private.commit_course_composition_core_v1(
    uuid,uuid,bigint,jsonb,jsonb,text
  ),
  private.get_owned_course_authoring_part_materialization_design_core_v1(
    uuid,uuid,uuid,uuid
  ),
  private.advance_course_authoring_part_materialization_design_core_v1(
    uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
  ),
  private.commit_course_instructional_plan_core_v1(
    uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
  )
from public,anon,authenticated,service_role;

revoke all on function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
), public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
), public.get_course_study_citations_v1(
  uuid,bigint,text
), public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text
), public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
), public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
), public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) from public,anon,authenticated,service_role;

grant execute on function public.get_owned_course_sources_for_actor_v1(
  uuid,uuid,bigint,text,text,text,text,text,integer
), public.execute_course_source_command_for_actor_v1(
  uuid,uuid,bigint,jsonb,text,text
), public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text
), public.commit_course_instructional_plan_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,text,text
), public.get_owned_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid
), public.advance_course_authoring_part_materialization_for_actor_v1(
  uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text
) to service_role;

grant execute on function public.get_course_study_citations_v1(uuid,bigint,text)
to authenticated;

do $course_sources_postflight$
declare
  v_signature text;
  v_definition text;
begin
  if exists(
    select 1 from private.course_entities entity
    where entity.entity_type = 'study_unit' and entity.content ? 'sources'
  ) or exists(
    select 1
    from private.course_source_revisions source
    where source.status = 'unresolved_legacy' and (
      source.kind is not null or source.title is not null
      or source.citation_text is not null or source.url is not null
      or source.edition_or_version is not null
      or source.study_visibility <> 'hidden' or source.actor_id is not null
    )
  ) or exists(
    select 1
    from private.course_authoring_part_materializations materialization
    where materialization.design_context->>'contract'
      <> 'aralearn.course-design-context.v2'
      or jsonb_typeof(materialization.design_context->'targets') <> 'array'
      or exists(
        select 1
        from jsonb_array_elements(materialization.design_context->'targets')
          target(value)
        where jsonb_typeof(target.value->'sourceAttributions') <> 'object'
          or (target.value->'sourceAttributions')
            - 'instructionalAnalysisUnits' - 'evidenceRequirements'
              <> '{}'::jsonb
          or jsonb_typeof(target.value#>'{sourceAttributions,instructionalAnalysisUnits}')
            <> 'array'
          or jsonb_typeof(target.value#>'{sourceAttributions,evidenceRequirements}')
            <> 'array'
      )
  ) then
    raise exception 'Cutover final de conteúdo, legado ou contexto v2 divergiu.'
      using errcode = '55000';
  end if;
  if (
    select count(*)
    from private.course_source_attributions attribution
    where attribution.target_kind = 'plan_item'
      and attribution.revision = 1
  ) <> (
    select count(*) from private.course_instructional_plan_items
  ) or (
    select count(*)
    from private.course_source_attributions attribution
    where attribution.target_kind = 'study_unit'
      and attribution.revision = 1
  ) <> (
    select count(*) from private.course_entities entity
    where entity.entity_type = 'study_unit'
  ) then
    raise exception 'Baseline de atribuições não cobre todos os alvos.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from private.course_source_attributions attribution
    cross join lateral (
      select private.course_source_links_v1(
        attribution.course_id,attribution.id
      ) as links
    ) derived
    where attribution.target_kind = 'study_unit'
      and attribution.revision = 1
      and (
        octet_length(derived.links::text) > 131072
        or octet_length(jsonb_build_object(
          'contract','aralearn.course-sources.v1',
          'courseId',attribution.course_id,
          'courseRevision',9223372036854775807,
          'mode','target',
          'query',jsonb_build_object(
            'sourceId',null,'targetKind','study_unit',
            'targetId',attribution.target_id
          ),
          'items',jsonb_build_array(jsonb_build_object(
            'attributionId','ffffffff-ffff-4fff-8fff-ffffffffffff',
            'targetKind','study_unit','targetId',attribution.target_id,
            'targetVersion',9223372036854775807,
            'targetHash',repeat('f',64),'revision',9223372036854775807,
            'sourceLinks',derived.links,
            'actorId','ffffffff-ffff-4fff-8fff-ffffffffffff',
            'createdAt','9999-12-31T23:59:59.999999+00:00',
            'effective',true
          )),'nextCursor',null
        )::text) > 262144
      )
  ) then
    raise exception 'Baseline de proveniência excede o orçamento de leitura.'
      using errcode = '54000';
  end if;
  foreach v_signature in array array[
    'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)',
    'public.execute_course_source_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)',
    'public.get_course_study_citations_v1(uuid,bigint,text)',
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)',
    'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)',
    'public.get_owned_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid)',
    'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'RPC final de Fontes ausente: %.',v_signature
        using errcode = '55000';
    end if;
  end loop;
  if to_regprocedure(
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,text)'
  ) is not null then
    raise exception 'Assinatura antiga de composição permaneceu pública.'
      using errcode = '55000';
  end if;
  if to_regprocedure(
    'public.get_course_study_citations_v1(uuid,text)'
  ) is not null then
    raise exception 'Assinatura antiga de citações permaneceu pública.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.advance_course_authoring_part_materialization_for_actor_v1(uuid,uuid,uuid,uuid,bigint,bigint,text,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'sourceAttributionApplication') = 0
     or strpos(v_definition,
       'valid_course_source_materialization_application_v1') = 0
     or strpos(v_definition,'sourceAttributionApplicationHash') = 0
     or strpos(v_definition,
       'assert_course_source_target_citation_budget_v1') = 0 then
    raise exception 'Cercas de proveniência da materialização não foram instaladas.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'sourceAttributionApplications') = 0
     or strpos(v_definition,'apply_course_source_attribution_v1') = 0
     or strpos(v_definition,
       'assert_course_source_target_citation_budget_v1') = 0 then
    raise exception 'Composição não está acoplada atomicamente à proveniência.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'private.course_effective_source_attribution_v1(uuid,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'target_version') = 0
     or strpos(v_definition,'''version''') = 0
     or strpos(v_definition,'target_hash') = 0 then
    raise exception 'Efetividade de proveniência não está presa à versão e hash.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.commit_course_instructional_plan_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'v_assignment_count') = 0
     or strpos(v_definition,'sourceLinks') = 0
     or strpos(v_definition,
       'assert_course_source_target_citation_budget_v1') = 0 then
    raise exception 'Plano não reaplica proveniência versionada de todos os itens.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.execute_course_source_command_for_actor_v1(uuid,uuid,bigint,jsonb,text,text)'::regprocedure::oid
  ) into v_definition;
  if (
    char_length(v_definition) - char_length(replace(
      v_definition,'assert_course_source_target_citation_budget_v1',''
    ))
  ) / char_length('assert_course_source_target_citation_budget_v1') < 2
     or strpos(lower(v_definition),'when serialization_failure') = 0
     or strpos(v_definition,'PGRST') = 0 then
    raise exception 'Writers diretos não cercam atribuição e reexposição de Fonte.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'v_pinned_source_revision') = 0
     or strpos(v_definition,'selected_revision') = 0
     or strpos(v_definition,'v_cursor_query_hash') = 0
     or strpos(v_definition,'''expectedRevision''') = 0
     or strpos(lower(v_definition),'for share') = 0
     or strpos(v_definition,'PGRST') = 0 then
    raise exception 'Lookup contextual ou cursor vinculado de Fonte não foi instalado.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.get_course_study_citations_v1(uuid,bigint,text)'::regprocedure::oid
  ) into v_definition;
  if strpos(v_definition,'p_expected_revision') = 0
     or strpos(v_definition,'course_study_citations_payload_v1') = 0
     or strpos(v_definition,'course-access:') = 0
     or strpos(lower(v_definition),'for share') = 0 then
    raise exception 'Leitura compartilhada não está presa à revisão e ao payload cercado.'
      using errcode = '55000';
  end if;
  if exists(
    select 1
    from unnest(array[
      'anon','authenticated','service_role'
    ]::text[]) role_name(value)
    cross join unnest(array[
      'select','insert','update','delete'
    ]::text[]) privilege(value)
    cross join unnest(array[
      'private.course_source_revisions',
      'private.course_source_anchor_revisions',
      'private.course_source_attributions',
      'private.course_source_attribution_sources',
      'private.course_source_attribution_anchors'
    ]::text[]) relation_name(value)
    where has_table_privilege(
      role_name.value,relation_name.value,privilege.value
    )
  ) then
    raise exception 'Autoridades privadas de Fontes expõem privilégio direto.'
      using errcode = '55000';
  end if;
end;
$course_sources_postflight$;

do $advance_course_sources_runtime_manifest$
declare
  v_manifest jsonb;
  v_features jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817180000'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente à autoridade de Fontes.'
      using errcode = '55000';
  end if;
  select jsonb_agg(feature.value order by feature.ordinal)
  into v_features
  from (
    select existing.value,existing.ordinal
    from jsonb_array_elements_text(v_manifest->'features')
      with ordinality existing(value,ordinal)
    union all
    select 'course-sources-v1',1000006::bigint
    union all
    select 'course-source-provenance-v1',1000007::bigint
  ) feature;
  v_manifest := jsonb_build_object(
    'schemaRevision','20260817190000',
    'contractVersion',1,
    'features',v_features
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public,anon,authenticated,service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon,authenticated,service_role;
end;
$advance_course_sources_runtime_manifest$;

commit;
