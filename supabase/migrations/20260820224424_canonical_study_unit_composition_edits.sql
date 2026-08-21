begin;

set local search_path = pg_catalog,public,private,auth,storage,extensions;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn:canonical-study-unit-composition-edits:20260820224424',0
));

-- Contextual edits keep the current Course model and the existing composition
-- endpoint. Legacy provenance may cross a content-only edit only when it is an
-- exact carry of the previously effective attribution.

create or replace function private.apply_course_source_attribution_v1(
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
     or not private.valid_course_source_links_shape_v1(
       p_links,p_allow_identical_legacy_carry
     ) then
    raise exception 'Aplicação de proveniência inválida.'
      using errcode = '22023';
  end if;
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
  if p_explicit_target_hash is not null
     and v_state->>'hash' <> p_explicit_target_hash then
    raise exception 'O alvo de proveniência divergiu do estado materializado.'
      using errcode = '40001';
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

  if not v_carry
     and not private.valid_course_source_links_shape_v1(p_links,false) then
    raise exception 'A proveniência histórica só pode ser preservada sem alterações.'
      using errcode = '23514';
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

create function public.commit_course_composition_for_actor_v1(
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
  v_receipt private.course_change_receipts%rowtype;
  v_entity private.course_entities%rowtype;
  v_upsert jsonb;
  v_result jsonb;
  v_existing_channel text;
  v_existing_origin text;
  v_existing_expected_version bigint;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id,p_actor_id,true);
  if p_channel not in ('mcp','application')
     or p_channel = 'mcp' and (
       p_application_origin is not null
       or p_expected_study_unit_version is not null
     )
     or p_channel = 'application' and (
       p_application_origin not in ('manual','provider_assistance')
       or p_expected_study_unit_version is null
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
     ) then
    raise exception 'Canal, origem ou escopo da composição inválido.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id,0
  ));
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at > statement_timestamp();

  if not found and p_channel = 'application' then
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

  v_result := (v_result - 'channel' - 'applicationOrigin'
    - 'expectedStudyUnitVersion') || jsonb_build_object(
      'channel',p_channel,
      'applicationOrigin',p_application_origin,
      'expectedStudyUnitVersion',p_expected_study_unit_version
    );
  update private.course_change_receipts receipt
  set result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  update private.course_events event_value
  set summary = event_value.summary || jsonb_build_object('channel',p_channel)
    || case when p_channel = 'application' then jsonb_build_object(
      'applicationOrigin',p_application_origin
    ) else '{}'::jsonb end
  where event_value.course_id = p_course_id
    and event_value.revision = (v_result->>'revision')::bigint
    and (v_result->>'revision')::bigint > p_expected_revision
    and event_value.operation = 'replace_course_composition';
  if p_channel = 'mcp' then
    return v_result - 'channel' - 'applicationOrigin'
      - 'expectedStudyUnitVersion';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,jsonb,jsonb,jsonb,text
) from public,anon,authenticated,service_role;
revoke all on function public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.commit_course_composition_for_actor_v1(
  uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text
) to service_role;

create or replace function public.commit_course_composition_for_actor_v1(
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
  v_previous_effective private.course_source_attributions%rowtype;
  v_upsert jsonb;
  v_application_states jsonb := '[]'::jsonb;
  v_state jsonb;
  v_assignment jsonb;
  v_attribution_changed_count integer := 0;
  v_course public.courses%rowtype;
  v_application_hash text;
  v_target_version bigint;
  v_target_hash text;
  v_identical_carry boolean;
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
           application.value->'sourceLinks',true
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
         on application.value->>'studyUnitId' = upsert_item.value->>'entityId'
       where (
         upsert_item.value is not null and application.value is null
       ) or (
         application.value is not null and upsert_item.value is null
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
    v_identical_carry := false;
    if found then
      select * into v_previous_effective
      from private.course_effective_source_attribution_v1(
        p_course_id,'study_unit',v_application.value->>'studyUnitId'
      );
      if v_previous_effective.id is not null then
        v_identical_carry := private.course_source_links_v1(
          p_course_id,v_previous_effective.id
        ) = v_application.value->'sourceLinks';
      end if;
      v_target_version := v_entity.version + case when row(
        v_entity.parent_type,v_entity.parent_id,v_entity.position,v_entity.content
      ) is distinct from row(
        nullif(v_upsert->>'parentType',''),nullif(v_upsert->>'parentId',''),
        (v_upsert->>'position')::integer,v_upsert->'content'
      ) then 1 else 0 end;
    else
      v_target_version := 1;
    end if;
    if not v_identical_carry and not private.valid_course_source_links_shape_v1(
      v_application.value->'sourceLinks',false
    ) then
      raise exception 'A proveniência histórica divergiu da atribuição efetiva.'
        using errcode = '23514';
    end if;
    v_target_hash := private.course_source_json_hash_v1(jsonb_build_object(
      'targetKind','study_unit','content',v_upsert->'content'
    ));
    v_application_states := v_application_states || jsonb_build_array(
      jsonb_build_object(
        'application',v_application.value,
        'targetVersion',v_target_version,
        'targetHash',v_target_hash,
        'identicalCarry',v_identical_carry
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
      p_actor_id,(v_application.value->>'identicalCarry')::boolean,
      v_state->>'hash'
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

do $canonical_composition_postflight$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)'::regprocedure
  ) into v_definition;
  if v_definition is null
     or position('expectedStudyUnitVersion' in v_definition) = 0
     or position('applicationOrigin' in v_definition) = 0
     or position('provider_assistance' in v_definition) = 0
     or has_function_privilege(
       'authenticated',
       'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text)',
       'execute'
     )
     or has_function_privilege(
       'service_role',
       'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)',
       'execute'
     ) then
    raise exception 'A composição contextual não ficou cercada pela Edge Function.'
      using errcode = '55000';
  end if;
  select pg_get_functiondef(
    'public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,jsonb,jsonb,jsonb,text)'::regprocedure
  ) into v_definition;
  if position('identicalCarry' in v_definition) = 0
     or position('course_effective_source_attribution_v1' in v_definition) = 0
     or position('valid_course_source_links_shape_v1' in v_definition) = 0 then
    raise exception 'A preservação exata de proveniência não foi instalada.'
      using errcode = '55000';
  end if;
end;
$canonical_composition_postflight$;

do $advance_contextual_composition_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820101500'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ? 'course-sources-v1') then
    raise exception 'Manifesto concorrente à composição contextual.'
      using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(v_manifest,'{schemaRevision}',to_jsonb('20260820224424'::text)),
    '{features}',
    (v_manifest->'features') || to_jsonb('contextual-study-unit-edit-v1'::text)
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
$advance_contextual_composition_manifest$;

do $contextual_composition_manifest_postflight$
declare
  v_manifest jsonb;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820224424'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ? 'contextual-study-unit-edit-v1') then
    raise exception 'Manifesto da composição contextual não foi consolidado.'
      using errcode = '55000';
  end if;
end;
$contextual_composition_manifest_postflight$;

commit;
