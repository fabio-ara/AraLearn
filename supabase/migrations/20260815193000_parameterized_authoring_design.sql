-- Estado autoral parametrizado: análise, parâmetros, resources, blueprint e
-- manifesto permanecem no workspace; receipts/events guardam apenas resumos.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-parameterized-authoring-design-v1', 0
));

do $require_parameterized_authoring_dependencies$
begin
  if to_regprocedure('private.valid_authoring_continuity_v1(jsonb)') is null
     or to_regprocedure(
       'private.require_educational_workspace_capability_v1(uuid,uuid,text)'
     ) is null
     or to_regprocedure(
       'private.prune_authoring_workspace_state_v5(uuid,text)'
     ) is null then
    raise exception 'Dependências do desenho autoral parametrizado ausentes.'
      using errcode = '55000';
  end if;
end;
$require_parameterized_authoring_dependencies$;

-- O runtime já aceita estes dois vínculos compactos nas decisões. A função
-- antiga é preservada como validador do núcleo e recebe uma cópia sem as
-- extensões; o wrapper abaixo valida as extensões com o mesmo contrato do JS.
alter table private.authoring_workspaces
  drop constraint if exists authoring_workspaces_continuity_v1;

alter function private.valid_authoring_continuity_v1(jsonb)
  rename to valid_authoring_continuity_without_design_extensions_v1;

create function private.valid_authoring_decision_extensions_v1(p_decision jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_selection jsonb;
  v_diagnosis jsonb;
  v_item jsonb;
begin
  if jsonb_typeof(p_decision) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(p_decision) field_name
       where field_name not in (
         'id', 'summary', 'entityType', 'entityId',
         'representationSelection', 'pedagogicalDiagnosis'
       )
     ) then
    return false;
  end if;

  if p_decision ? 'representationSelection' then
    v_selection := p_decision->'representationSelection';
    if jsonb_typeof(v_selection) <> 'object'
       or not (p_decision ?& array['entityType', 'entityId'])
       or nullif(btrim(p_decision->>'entityId'), '') is null
       or p_decision->>'entityType' not in ('microsequence', 'card')
       or not (v_selection ?& array[
         'intent', 'chosen', 'fit', 'catalogVersion', 'limitations'
       ])
       or exists (
         select 1 from jsonb_object_keys(v_selection) field_name
         where field_name not in (
           'intent', 'chosen', 'fit', 'desiredResource', 'catalogVersion',
           'limitations', 'chatDisclosure'
         )
       )
       or nullif(btrim(v_selection->>'intent'), '') is null
       or char_length(v_selection->>'intent') > 1000
       or jsonb_typeof(v_selection->'chosen') <> 'object'
       or not (v_selection->'chosen' ?& array['packageId', 'version'])
       or exists (
         select 1 from jsonb_object_keys(v_selection->'chosen') field_name
         where field_name not in ('packageId', 'version')
       )
       or v_selection#>>'{chosen,packageId}' !~
         '^aralearn\.(resource|response)\.[a-z0-9_]+$'
       or v_selection#>>'{chosen,version}' !~
         '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
       or v_selection->>'fit' not in ('canonical', 'versatile', 'substitute')
       or nullif(btrim(v_selection->>'catalogVersion'), '') is null
       or char_length(v_selection->>'catalogVersion') > 80
       or jsonb_typeof(v_selection->'limitations') <> 'array'
       or jsonb_array_length(v_selection->'limitations') > 12
       or exists (
         select 1 from jsonb_array_elements(v_selection->'limitations') item
         where jsonb_typeof(item) <> 'string'
           or nullif(btrim(item #>> '{}'), '') is null
           or char_length(item #>> '{}') > 500
       )
       or exists (
         select 1
         from jsonb_array_elements_text(v_selection->'limitations') item
         group by item having count(*) > 1
       )
       or (
         v_selection ? 'desiredResource'
         and v_selection->'desiredResource' <> 'null'::jsonb
         and (
           nullif(btrim(v_selection->>'desiredResource'), '') is null
           or char_length(v_selection->>'desiredResource') > 1000
         )
       )
       or (
         v_selection ? 'chatDisclosure'
         and v_selection->'chatDisclosure' <> 'null'::jsonb
         and (
           nullif(btrim(v_selection->>'chatDisclosure'), '') is null
           or char_length(v_selection->>'chatDisclosure') > 1000
         )
       )
       or (
         v_selection->>'fit' = 'substitute'
         and (
           nullif(btrim(v_selection->>'desiredResource'), '') is null
           or nullif(btrim(v_selection->>'chatDisclosure'), '') is null
         )
       )
       or (
         v_selection->>'fit' <> 'substitute'
         and nullif(btrim(v_selection->>'chatDisclosure'), '') is not null
       ) then
      return false;
    end if;
  end if;

  if p_decision ? 'pedagogicalDiagnosis' then
    v_diagnosis := p_decision->'pedagogicalDiagnosis';
    if jsonb_typeof(v_diagnosis) <> 'object'
       or not (p_decision ?& array['entityType', 'entityId'])
       or nullif(btrim(p_decision->>'entityId'), '') is null
       or p_decision->>'entityType' <> 'microsequence'
       or not (v_diagnosis ? 'difficultyResponses')
       or exists (
         select 1 from jsonb_object_keys(v_diagnosis) field_name
         where field_name <> 'difficultyResponses'
       )
       or jsonb_typeof(v_diagnosis->'difficultyResponses') <> 'array'
       or jsonb_array_length(v_diagnosis->'difficultyResponses') not between 1 and 4
       or exists (
         select 1
         from jsonb_array_elements(v_diagnosis->'difficultyResponses') item
         where jsonb_typeof(item) <> 'object'
           or not (item ?& array['difficulty', 'response'])
           or exists (
             select 1 from jsonb_object_keys(item) field_name
             where field_name not in ('difficulty', 'response')
           )
           or nullif(btrim(item->>'difficulty'), '') is null
           or char_length(item->>'difficulty') > 240
           or nullif(btrim(item->>'response'), '') is null
           or char_length(item->>'response') > 400
       )
       or exists (
         select 1
         from jsonb_array_elements(v_diagnosis->'difficultyResponses') item
         group by item->>'difficulty' having count(*) > 1
       ) then
      return false;
    end if;
  end if;
  return true;
exception
  when others then
    return false;
end;
$function$;

create table private.authoring_design_request_arguments (
  owner_id uuid not null,
  request_id text not null,
  server_argument_hash text not null,
  primary key(owner_id, request_id),
  foreign key(owner_id, request_id)
    references private.authoring_workspace_requests(owner_id, request_id)
    on delete cascade,
  constraint authoring_design_request_arguments_hash_v1 check (
    server_argument_hash ~ '^[a-f0-9]{64}$'
  )
);

create function private.begin_authoring_design_mutation_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_server_argument_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, p_capability
  );
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[a-f0-9]{64}$'
     or p_server_argument_hash !~ '^[a-f0-9]{64}$'
     or p_expected_revision is null or p_expected_revision < 1
     or p_operation not in (
       'save_instructional_analysis', 'set_design_parameter',
       'remove_design_parameter', 'save_resource_set',
       'save_pedagogical_blueprint', 'resolve_effective_design',
       'register_materialization_manifest'
     ) then
    raise exception 'Mutação de desenho autoral inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(p_actor_id, p_request_id);
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id and request.request_id = p_request_id;
  if found then
    if v_request.workspace_id <> p_workspace_id
       or v_request.operation <> p_operation
       or v_request.payload_hash <> p_payload_hash
       or not exists (
         select 1 from private.authoring_design_request_arguments argument
         where argument.owner_id = p_actor_id
           and argument.request_id = p_request_id
           and argument.server_argument_hash = p_server_argument_hash
       ) then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'result', v_request.result || jsonb_build_object('idempotent', true)
    );
  end if;
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null
  for update;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using
      errcode = '40001',
      detail = jsonb_build_object(
        'expectedRevision', p_expected_revision,
        'currentRevision', v_workspace.revision
      )::text;
  end if;
  return jsonb_build_object(
    'replayed', false,
    'currentRevision', v_workspace.revision,
    'nextRevision', v_workspace.revision + 1
  );
end;
$function$;

create function private.complete_authoring_design_mutation_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_server_argument_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_result jsonb,
  p_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_next_revision bigint := p_expected_revision + 1;
  v_result jsonb;
begin
  if jsonb_typeof(p_result) <> 'object'
     or jsonb_typeof(p_summary) <> 'object'
     or pg_column_size(p_result) > 60000
     or pg_column_size(p_summary) > 30000 then
    raise exception 'Resumo da mutação de desenho inválido.' using errcode = '22023';
  end if;
  update private.authoring_workspaces workspace
  set revision = v_next_revision, updated_at = now()
  where workspace.id = p_workspace_id
    and workspace.revision = p_expected_revision
    and workspace.deleted_at is null;
  if not found then
    raise exception 'Revisão base desatualizada.' using errcode = '40001';
  end if;
  v_result := p_result || jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', v_next_revision,
    'idempotent', false
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_actor_id, p_request_id, p_operation, p_payload_hash,
    p_workspace_id, v_result
  );
  insert into private.authoring_design_request_arguments(
    owner_id, request_id, server_argument_hash
  ) values (p_actor_id, p_request_id, p_server_argument_hash);
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values (
    p_workspace_id, v_next_revision, p_operation, p_summary, p_actor_id
  );
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id
    and event.id not in (
      select recent.id from private.authoring_workspace_events recent
      where recent.workspace_id = p_workspace_id
      order by recent.revision desc limit 200
    );
  perform private.prune_authoring_design_state_v1(
    p_workspace_id, now() - interval '180 days', 32
  );
  return v_result;
end;
$function$;

create function public.list_authoring_design_parameter_definitions_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_scope_kind text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_items jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  if p_scope_kind is not null and p_scope_kind not in (
    'workspace', 'course', 'module', 'lesson', 'microsequence'
  ) then
    raise exception 'Escopo de parâmetros inválido.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(definition.definition order by
    definition.parameter_id, definition.parameter_version), '[]'::jsonb)
  into v_items
  from private.authoring_design_parameter_definitions definition
  where p_scope_kind is null or p_scope_kind = any(definition.supported_scopes);
  return jsonb_build_object(
    'catalogVersion', '1.0.0', 'items', v_items
  );
end;
$function$;

create function public.get_authoring_instructional_analysis_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_scope_kind text,
  p_scope_ref text,
  p_analysis_id text default null,
  p_analysis_version text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_analysis record;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  if (p_analysis_id is null) <> (p_analysis_version is null) then
    raise exception 'Referência de análise incompleta.' using errcode = '22023';
  end if;
  select * into v_analysis
  from private.authoring_instructional_analyses analysis
  where analysis.workspace_id = p_workspace_id
    and analysis.scope_kind = p_scope_kind
    and analysis.scope_ref = p_scope_ref
    and (p_analysis_id is null or (
      analysis.analysis_id = p_analysis_id
      and analysis.analysis_version = p_analysis_version
    ))
  order by analysis.created_revision desc, analysis.created_at desc
  limit 1;
  if not found then
    return jsonb_build_object('status', 'unresolved', 'analysis', null);
  end if;
  return jsonb_build_object(
    'status', case when v_analysis.scope_path =
      private.authoring_design_scope_path_v1(
        p_workspace_id, p_scope_kind, p_scope_ref
      ) and v_analysis.scope_entity_version is not distinct from
      private.authoring_design_scope_entity_version_v1(
        p_workspace_id, p_scope_kind, p_scope_ref
      ) then 'current' else 'stale' end,
    'analysis', v_analysis.payload,
    'createdRevision', v_analysis.created_revision,
    'createdAt', v_analysis.created_at
  );
end;
$function$;

create function public.list_authoring_design_parameter_assignments_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_path text[];
  v_items jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  v_path := private.authoring_design_scope_path_v1(
    p_workspace_id, p_scope_kind, p_scope_ref
  );
  if v_path is null then
    raise exception 'Escopo de desenho inexistente.' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'contract', 'DesignParameterAssignment@1',
    'id', assignment.assignment_id,
    'version', assignment.assignment_version,
    'modelVersion', assignment.model_version,
    'definitionRef', jsonb_build_object(
      'id', assignment.parameter_id, 'version', assignment.parameter_version
    ),
    'scope', jsonb_build_object(
      'kind', assignment.scope_kind, 'ref', assignment.scope_ref
    ),
    'mode', assignment.mode,
    'value', assignment.value,
    'authority', jsonb_build_object(
      'kind', assignment.authority_kind,
      'actorRef', assignment.authority_ref,
      'locked', assignment.locked
    ),
    'rationale', assignment.rationale,
    'provenanceRefs', to_jsonb(assignment.provenance_refs)
  ) order by assignment.parameter_id, assignment.created_revision), '[]'::jsonb)
  into v_items
  from private.current_authoring_design_parameter_assignments_v1 assignment
  where assignment.workspace_id = p_workspace_id
    and (
      (assignment.scope_kind = 'workspace'
       and assignment.scope_ref = p_workspace_id::text)
      or (assignment.scope_kind = 'course' and assignment.scope_ref = v_path[1])
      or (assignment.scope_kind = 'module' and assignment.scope_ref = v_path[2])
      or (assignment.scope_kind = 'lesson' and assignment.scope_ref = v_path[3])
      or (assignment.scope_kind = 'microsequence' and assignment.scope_ref = v_path[4])
    );
  return jsonb_build_object('items', v_items);
end;
$function$;

create function private.valid_authoring_continuity_v1(p_state jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_base jsonb;
  v_decisions jsonb;
begin
  if jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(p_state->'decisions') <> 'array' then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_state->'decisions') decision
    where not private.valid_authoring_decision_extensions_v1(decision)
  ) then
    return false;
  end if;
  select coalesce(
    jsonb_agg(
      (decision - 'representationSelection'::text - 'pedagogicalDiagnosis'::text)
      order by ordinal
    ),
    '[]'::jsonb
  ) into v_decisions
  from jsonb_array_elements(p_state->'decisions')
    with ordinality item(decision, ordinal);
  v_base := jsonb_set(p_state, '{decisions}', v_decisions, false);
  return private.valid_authoring_continuity_without_design_extensions_v1(v_base);
exception
  when others then
    return false;
end;
$function$;

alter table private.authoring_workspaces
  add constraint authoring_workspaces_continuity_v1 check (
    private.valid_authoring_continuity_v1(authoring_state)
  );

-- A migration de reaproveitamento do catálogo substituiu, em vez de unir,
-- as operações instaladas pela continuidade. Recompõe a allowlist corrente.
alter table private.authoring_workspace_requests
  drop constraint if exists authoring_workspace_requests_operation_v5;
alter table private.authoring_workspace_requests
  add constraint authoring_workspace_requests_operation_v5 check(operation in (
    'create', 'create_structure', 'update_metadata',
    'save_microsequence_cards', 'save_card', 'update_brief',
    'copy_entity', 'rename_entity', 'move_entity', 'delete_entity',
    'merge_microsequences', 'split_microsequence', 'promote_module',
    'demote_course', 'import_course', 'replace_catalog_document',
    'publish_private_preview', 'publish_private_complete',
    'publish_catalog_complete', 'delete_workspace',
    'update_continuity', 'create_finding', 'decide_finding',
    'link_finding_correction', 'verify_finding', 'delete_finding',
    'save_instructional_analysis', 'set_design_parameter',
    'remove_design_parameter', 'save_resource_set',
    'save_pedagogical_blueprint', 'resolve_effective_design',
    'register_materialization_manifest'
  ));

alter table private.authoring_workspace_events
  drop constraint if exists authoring_workspace_events_operation_v5;
alter table private.authoring_workspace_events
  add constraint authoring_workspace_events_operation_v5 check(operation in (
    'create', 'create_structure', 'update_metadata',
    'save_microsequence_cards', 'save_card', 'update_brief',
    'copy_entity', 'rename_entity', 'move_entity', 'delete_entity',
    'merge_microsequences', 'split_microsequence', 'promote_module',
    'demote_course', 'import_course', 'replace_catalog_document',
    'update_continuity', 'create_finding', 'decide_finding',
    'link_finding_correction', 'verify_finding', 'delete_finding',
    'save_instructional_analysis', 'set_design_parameter',
    'remove_design_parameter', 'save_resource_set',
    'save_pedagogical_blueprint', 'resolve_effective_design',
    'register_materialization_manifest'
  ));

create function private.authoring_design_contains_forbidden_key_v1(p_value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_key text;
  v_child jsonb;
  v_normalized text;
begin
  if p_value is null then return false; end if;
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      v_normalized := regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g');
      if v_normalized in (
        'chainofthought', 'chainofthoughts', 'internalmonologue', 'reasoning',
        'reasoningcontent', 'reasoningtrace', 'hiddenreasoning',
        'privatereasoning', 'cot', 'prompt', 'prompts', 'rawprompt',
        'systemprompt', 'developerprompt', 'userprompt', 'rawrequest',
        'rawresponse', 'completion', 'conversation', 'messages',
        'chatmessages', 'conversationmessages'
      ) or private.authoring_design_contains_forbidden_key_v1(v_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if private.authoring_design_contains_forbidden_key_v1(v_child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$function$;

create function private.authoring_design_closed_object_v1(
  p_value jsonb,
  p_required text[],
  p_allowed text[]
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select coalesce(
    jsonb_typeof(p_value) = 'object'
    and p_value ?& p_required
    and not exists (
      select 1 from jsonb_object_keys(p_value) field_name
      where not (field_name = any(p_allowed))
    ),
    false
  )
$function$;

create function private.authoring_design_text_array_v1(
  p_value jsonb,
  p_minimum integer default 0
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select coalesce(
    jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) >= p_minimum
    and not exists (
      select 1 from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) <> 'string'
        or nullif(btrim(item #>> '{}'), '') is null
    )
    and jsonb_array_length(p_value) = (
      select count(distinct item #>> '{}')
      from jsonb_array_elements(p_value) item
    ),
    false
  )
$function$;

create function private.valid_authoring_instructional_analysis_v1(p_analysis jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
declare
  v_item jsonb;
begin
  if not private.authoring_design_closed_object_v1(
    p_analysis,
    array[
      'contract','modelVersion','id','version','scope','objective','sourceRefs',
      'derivedFrom','learnerContext','units','relations',
      'coordinationRequirements','explanationRequirements',
      'evidenceRequirements','practiceVariationRequirements',
      'fidelityRequirements','representationRequirements','assumptions','limitations'
    ],
    array[
      'contract','modelVersion','id','version','scope','objective','sourceRefs',
      'derivedFrom','learnerContext','units','relations',
      'coordinationRequirements','explanationRequirements',
      'evidenceRequirements','practiceVariationRequirements',
      'fidelityRequirements','representationRequirements','assumptions','limitations'
    ]
  )
  or p_analysis->>'contract' is distinct from 'InstructionalAnalysis@1'
  or p_analysis->>'modelVersion' is distinct from '1.0.0'
  or nullif(btrim(p_analysis->>'id'), '') is null
  or nullif(btrim(p_analysis->>'version'), '') is null
  or nullif(btrim(p_analysis->>'objective'), '') is null
  or not private.authoring_design_closed_object_v1(
    p_analysis->'scope', array['kind','ref'], array['kind','ref']
  )
  or p_analysis#>>'{scope,kind}' not in (
    'workspace','course','module','lesson','microsequence'
  )
  or nullif(btrim(p_analysis#>>'{scope,ref}'), '') is null
  or not private.authoring_design_text_array_v1(p_analysis->'sourceRefs')
  or not private.authoring_design_closed_object_v1(
    p_analysis->'derivedFrom',
    array['workspaceRevision','scopeEntityVersion'],
    array['workspaceRevision','scopeEntityVersion']
  )
  or jsonb_typeof(p_analysis#>'{derivedFrom,workspaceRevision}') <> 'number'
  or p_analysis#>>'{derivedFrom,workspaceRevision}' !~ '^[1-9][0-9]{0,18}$'
  or not (
    jsonb_typeof(p_analysis#>'{derivedFrom,scopeEntityVersion}') = 'null'
    or (
      jsonb_typeof(p_analysis#>'{derivedFrom,scopeEntityVersion}') = 'number'
      and p_analysis#>>'{derivedFrom,scopeEntityVersion}' ~ '^[1-9][0-9]{0,18}$'
    )
  )
  or not private.authoring_design_closed_object_v1(
    p_analysis->'learnerContext',
    array['audience','conditions','uncertainties'],
    array['audience','conditions','uncertainties']
  )
  or nullif(btrim(p_analysis#>>'{learnerContext,audience}'), '') is null
  or not private.authoring_design_text_array_v1(
    p_analysis#>'{learnerContext,conditions}'
  )
  or not private.authoring_design_text_array_v1(
    p_analysis#>'{learnerContext,uncertainties}'
  )
  or jsonb_typeof(p_analysis->'units') <> 'array'
  or jsonb_array_length(p_analysis->'units') < 1
  or jsonb_typeof(p_analysis->'relations') <> 'array'
  or jsonb_typeof(p_analysis->'coordinationRequirements') <> 'array'
  or jsonb_typeof(p_analysis->'explanationRequirements') <> 'array'
  or jsonb_typeof(p_analysis->'evidenceRequirements') <> 'array'
  or jsonb_typeof(p_analysis->'practiceVariationRequirements') <> 'array'
  or jsonb_typeof(p_analysis->'fidelityRequirements') <> 'array'
  or jsonb_typeof(p_analysis->'representationRequirements') <> 'array'
  or not private.authoring_design_text_array_v1(p_analysis->'assumptions')
  or not private.authoring_design_text_array_v1(p_analysis->'limitations')
  or pg_column_size(p_analysis) > 262144
  or private.authoring_design_contains_forbidden_key_v1(p_analysis)
  then return false; end if;

  for v_item in select value from jsonb_array_elements(p_analysis->'units')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','label','kind','priorKnowledge','knowledgeFormHypothesis'],
      array['id','label','kind','priorKnowledge','knowledgeFormHypothesis']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'label'), '') is null
    or nullif(btrim(v_item->>'kind'), '') is null
    or not private.authoring_design_closed_object_v1(
      v_item->'priorKnowledge',
      array['state','basis','evidenceRefs','note'],
      array['state','basis','evidenceRefs','note']
    )
    or v_item#>>'{priorKnowledge,state}' not in ('new','partial','integrated','unknown')
    or v_item#>>'{priorKnowledge,basis}' not in (
      'brief','source','author','assessment','inference'
    )
    or not private.authoring_design_text_array_v1(
      v_item#>'{priorKnowledge,evidenceRefs}'
    )
    or nullif(btrim(v_item#>>'{priorKnowledge,note}'), '') is null
    or not private.authoring_design_closed_object_v1(
      v_item->'knowledgeFormHypothesis',
      array[
        'conditions','responses','expression','rationaleAvailability','basisRefs','note'
      ],
      array[
        'conditions','responses','expression','rationaleAvailability','basisRefs','note'
      ]
    )
    or not private.authoring_design_text_array_v1(
      v_item#>'{knowledgeFormHypothesis,conditions}'
    )
    or not private.authoring_design_text_array_v1(
      v_item#>'{knowledgeFormHypothesis,responses}'
    )
    or v_item#>>'{knowledgeFormHypothesis,expression}' not in (
      'verbal','nonverbal','mixed','unknown'
    )
    or v_item#>>'{knowledgeFormHypothesis,rationaleAvailability}' not in (
      'available','partial','unavailable','unknown'
    )
    or not private.authoring_design_text_array_v1(
      v_item#>'{knowledgeFormHypothesis,basisRefs}'
    )
    or nullif(btrim(v_item#>>'{knowledgeFormHypothesis,note}'), '') is null
    then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_analysis->'relations')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','fromUnitRef','toUnitRef','kind','rationale'],
      array['id','fromUnitRef','toUnitRef','kind','rationale']
    ) or exists (
      select 1 from jsonb_each_text(v_item) field
      where nullif(btrim(field.value), '') is null
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_analysis->'coordinationRequirements')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','unitRefs','assumedNewUnitRefs','rationale'],
      array['id','unitRefs','assumedNewUnitRefs','rationale']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'rationale'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'unitRefs', 2)
    or not private.authoring_design_text_array_v1(v_item->'assumedNewUnitRefs')
    then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_analysis->'explanationRequirements')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','targetUnitRefs','features','applicabilityRationale'],
      array['id','targetUnitRefs','features','applicabilityRationale']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'applicabilityRationale'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'targetUnitRefs', 1)
    or not private.authoring_design_text_array_v1(v_item->'features', 1)
    then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_analysis->'evidenceRequirements')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array[
        'id','targetUnitRefs','operation','claim','acceptablePerformanceForms',
        'taskFeatures','criterion','fidelityRequirementRef'
      ],
      array[
        'id','targetUnitRefs','operation','claim','acceptablePerformanceForms',
        'taskFeatures','criterion','fidelityRequirementRef'
      ]
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'operation'), '') is null
    or nullif(btrim(v_item->>'claim'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'targetUnitRefs', 1)
    or not private.authoring_design_text_array_v1(
      v_item->'acceptablePerformanceForms', 1
    )
    or not private.authoring_design_text_array_v1(v_item->'taskFeatures', 1)
    or not private.authoring_design_closed_object_v1(
      v_item->'criterion',
      array['observable','successCondition'],
      array['observable','successCondition']
    )
    or nullif(btrim(v_item#>>'{criterion,observable}'), '') is null
    or nullif(btrim(v_item#>>'{criterion,successCondition}'), '') is null
    or not (
      jsonb_typeof(v_item->'fidelityRequirementRef') = 'null'
      or (
        jsonb_typeof(v_item->'fidelityRequirementRef') = 'string'
        and nullif(btrim(v_item->>'fidelityRequirementRef'), '') is not null
      )
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_analysis->'practiceVariationRequirements')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','evidenceRequirementRef','dimensions','rationale'],
      array['id','evidenceRequirementRef','dimensions','rationale']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'evidenceRequirementRef'), '') is null
    or nullif(btrim(v_item->>'rationale'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'dimensions', 1)
    then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_analysis->'fidelityRequirements')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array[
        'id','targetPerformanceForms','offeredPerformanceForms',
        'unrepresentedAspects','rationale'
      ],
      array[
        'id','targetPerformanceForms','offeredPerformanceForms',
        'unrepresentedAspects','rationale'
      ]
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'rationale'), '') is null
    or not private.authoring_design_text_array_v1(
      v_item->'targetPerformanceForms', 1
    )
    or not private.authoring_design_text_array_v1(v_item->'offeredPerformanceForms')
    or not private.authoring_design_text_array_v1(v_item->'unrepresentedAspects')
    then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_analysis->'representationRequirements')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array[
        'id','targetUnitRefs','structures','cognitiveOperations',
        'acceptableFits','rationale'
      ],
      array[
        'id','targetUnitRefs','structures','cognitiveOperations',
        'acceptableFits','rationale'
      ]
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'rationale'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'targetUnitRefs', 1)
    or not private.authoring_design_text_array_v1(v_item->'structures')
    or not private.authoring_design_text_array_v1(v_item->'cognitiveOperations')
    or not private.authoring_design_text_array_v1(v_item->'acceptableFits', 1)
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'acceptableFits') fit
      where fit not in ('canonical','versatile','substitute')
    ) then return false; end if;
  end loop;
  return true;
exception
  when others then return false;
end;
$function$;

create function private.valid_authoring_pedagogical_blueprint_v2(
  p_blueprint jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
declare
  v_item jsonb;
begin
  if not private.authoring_design_closed_object_v1(
    p_blueprint,
    array[
      'goal','learnerSituation','learningConditions','contentDemands',
      'anticipatedDifficulties','designResponses','prerequisiteEvidence',
      'conceptualLayers','theorySteps','practiceSteps','feedbackPlan',
      'termLedger','packageCandidates'
    ],
    array[
      'goal','learnerSituation','learningConditions','contentDemands',
      'anticipatedDifficulties','designResponses','prerequisiteEvidence',
      'conceptualLayers','theorySteps','practiceSteps','feedbackPlan',
      'termLedger','packageCandidates'
    ]
  )
  or nullif(btrim(p_blueprint->>'goal'), '') is null
  or nullif(btrim(p_blueprint->>'learnerSituation'), '') is null
  or nullif(btrim(p_blueprint->>'feedbackPlan'), '') is null
  or jsonb_typeof(p_blueprint->'learningConditions') <> 'array'
  or jsonb_typeof(p_blueprint->'contentDemands') <> 'array'
  or jsonb_array_length(p_blueprint->'contentDemands') < 1
  or jsonb_typeof(p_blueprint->'anticipatedDifficulties') <> 'array'
  or jsonb_typeof(p_blueprint->'designResponses') <> 'array'
  or jsonb_typeof(p_blueprint->'prerequisiteEvidence') <> 'array'
  or jsonb_typeof(p_blueprint->'conceptualLayers') <> 'array'
  or jsonb_array_length(p_blueprint->'conceptualLayers') < 1
  or jsonb_typeof(p_blueprint->'theorySteps') <> 'array'
  or jsonb_array_length(p_blueprint->'theorySteps') < 1
  or jsonb_typeof(p_blueprint->'practiceSteps') <> 'array'
  or jsonb_typeof(p_blueprint->'termLedger') <> 'array'
  or jsonb_typeof(p_blueprint->'packageCandidates') <> 'array'
  or jsonb_array_length(p_blueprint->'packageCandidates') < 1
  or private.authoring_design_contains_forbidden_key_v1(p_blueprint)
  or pg_column_size(p_blueprint) > 524288
  then return false; end if;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'learningConditions')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['id','description','designRelevance'],
      array['id','description','designRelevance']
    ) or exists (
      select 1 from jsonb_each_text(v_item) field
      where nullif(btrim(field.value), '') is null
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'contentDemands')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['id','description','cognitiveOperations'],
      array['id','description','cognitiveOperations']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'description'), '') is null
    or not private.authoring_design_text_array_v1(
      v_item->'cognitiveOperations', 1
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'anticipatedDifficulties')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','description','contentDemandIds','learningConditionIds'],
      array['id','description','contentDemandIds','learningConditionIds']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'description'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'contentDemandIds', 1)
    or not private.authoring_design_text_array_v1(v_item->'learningConditionIds')
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'contentDemandIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'contentDemands') demand
        where demand->>'id' = ref
      )
    )
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'learningConditionIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'learningConditions') condition
        where condition->>'id' = ref
      )
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'prerequisiteEvidence')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['term','evidence'], array['term','evidence']
    ) or nullif(btrim(v_item->>'term'), '') is null
      or nullif(btrim(v_item->>'evidence'), '') is null
    then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'conceptualLayers')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','plainLanguageReferent','formalTerms','requiresLayerIds'],
      array['id','plainLanguageReferent','formalTerms','requiresLayerIds']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'plainLanguageReferent'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'formalTerms', 1)
    or not private.authoring_design_text_array_v1(v_item->'requiresLayerIds')
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'requiresLayerIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'conceptualLayers') layer
        where layer->>'id' = ref
      )
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'packageCandidates')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['id','packageId','version','reason'],
      array['id','packageId','version','reason']
    ) or exists (
      select 1 from jsonb_each_text(v_item) field
      where nullif(btrim(field.value), '') is null
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'theorySteps')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['id','layerIds','purpose','cognitiveOperation','packageCandidateIds'],
      array['id','layerIds','purpose','cognitiveOperation','packageCandidateIds']
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'purpose'), '') is null
    or nullif(btrim(v_item->>'cognitiveOperation'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'layerIds', 1)
    or not private.authoring_design_text_array_v1(v_item->'packageCandidateIds', 1)
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'layerIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'conceptualLayers') layer
        where layer->>'id' = ref
      )
    )
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'packageCandidateIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'packageCandidates') candidate
        where candidate->>'id' = ref
      )
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'practiceSteps')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array[
        'id','targetLayerIds','decision','cognitiveOperation',
        'packageCandidateIds','feedback'
      ],
      array[
        'id','targetLayerIds','decision','cognitiveOperation',
        'packageCandidateIds','feedback'
      ]
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'decision'), '') is null
    or nullif(btrim(v_item->>'cognitiveOperation'), '') is null
    or nullif(btrim(v_item->>'feedback'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'targetLayerIds', 1)
    or not private.authoring_design_text_array_v1(v_item->'packageCandidateIds', 1)
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'targetLayerIds') ref
      where not exists (
        select 1
        from jsonb_array_elements(p_blueprint->'theorySteps') theory,
          jsonb_array_elements_text(theory->'layerIds') layer_ref
        where layer_ref = ref
      )
    )
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'packageCandidateIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'packageCandidates') candidate
        where candidate->>'id' = ref
      )
    ) then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'designResponses')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array[
        'id','difficultyIds','decision','theoryStepIds','practiceStepIds',
        'packageCandidateIds','materializationChecks'
      ],
      array[
        'id','difficultyIds','decision','theoryStepIds','practiceStepIds',
        'packageCandidateIds','materializationChecks'
      ]
    )
    or nullif(btrim(v_item->>'id'), '') is null
    or nullif(btrim(v_item->>'decision'), '') is null
    or not private.authoring_design_text_array_v1(v_item->'difficultyIds', 1)
    or not private.authoring_design_text_array_v1(v_item->'theoryStepIds')
    or not private.authoring_design_text_array_v1(v_item->'practiceStepIds')
    or (
      jsonb_array_length(v_item->'theoryStepIds') = 0
      and jsonb_array_length(v_item->'practiceStepIds') = 0
    )
    or not private.authoring_design_text_array_v1(v_item->'packageCandidateIds')
    or not private.authoring_design_text_array_v1(v_item->'materializationChecks', 1)
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'difficultyIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'anticipatedDifficulties') difficulty
        where difficulty->>'id' = ref
      )
    )
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'theoryStepIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'theorySteps') step_value
        where step_value->>'id' = ref
      )
    )
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'practiceStepIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'practiceSteps') step_value
        where step_value->>'id' = ref
      )
    )
    or exists (
      select 1 from jsonb_array_elements_text(v_item->'packageCandidateIds') ref
      where not exists (
        select 1 from jsonb_array_elements(p_blueprint->'packageCandidates') candidate
        where candidate->>'id' = ref
      )
    )
    then return false; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_blueprint->'termLedger')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['term','introducedInLayerId','plainMeaning'],
      array['term','introducedInLayerId','plainMeaning']
    )
    or nullif(btrim(v_item->>'term'), '') is null
    or nullif(btrim(v_item->>'plainMeaning'), '') is null
    or not exists (
      select 1 from jsonb_array_elements(p_blueprint->'conceptualLayers') layer
      where layer->>'id' = v_item->>'introducedInLayerId'
    ) then return false; end if;
  end loop;

  if exists (
    select 1 from (
      select 'learning' kind, item->>'id' id from jsonb_array_elements(p_blueprint->'learningConditions') item
      union all select 'demand', item->>'id' from jsonb_array_elements(p_blueprint->'contentDemands') item
      union all select 'difficulty', item->>'id' from jsonb_array_elements(p_blueprint->'anticipatedDifficulties') item
      union all select 'response', item->>'id' from jsonb_array_elements(p_blueprint->'designResponses') item
      union all select 'layer', item->>'id' from jsonb_array_elements(p_blueprint->'conceptualLayers') item
      union all select 'candidate', item->>'id' from jsonb_array_elements(p_blueprint->'packageCandidates') item
    ) ids group by kind, id having id is null or count(*) > 1
  )
  or exists (
    select 1 from (
      select item->>'id' id from jsonb_array_elements(p_blueprint->'theorySteps') item
      union all select item->>'id' from jsonb_array_elements(p_blueprint->'practiceSteps') item
    ) ids group by id having id is null or count(*) > 1
  )
  or exists (
    select 1
    from jsonb_array_elements(p_blueprint->'conceptualLayers') layer,
      jsonb_array_elements_text(layer->'formalTerms') formal_term
    where not exists (
      select 1 from jsonb_array_elements(p_blueprint->'termLedger') ledger
      where lower(ledger->>'term') = lower(formal_term)
    )
  )
  or exists (
    select 1
    from jsonb_array_elements(p_blueprint->'anticipatedDifficulties') difficulty
    where not exists (
      select 1
      from jsonb_array_elements(p_blueprint->'designResponses') response_value,
        jsonb_array_elements_text(response_value->'difficultyIds') difficulty_ref
      where difficulty_ref = difficulty->>'id'
    )
  )
  or exists (
    select 1
    from jsonb_array_elements(p_blueprint->'conceptualLayers')
      with ordinality current_layer(value, ordinal),
      jsonb_array_elements_text(current_layer.value->'requiresLayerIds') required_ref
    where not exists (
      select 1
      from jsonb_array_elements(p_blueprint->'conceptualLayers')
        with ordinality prior_layer(value, ordinal)
      where prior_layer.value->>'id' = required_ref
        and prior_layer.ordinal < current_layer.ordinal
    )
  )
  or exists (
    select 1 from jsonb_array_elements(p_blueprint->'conceptualLayers') layer
    where not exists (
      select 1
      from jsonb_array_elements(p_blueprint->'theorySteps') theory_step,
        jsonb_array_elements_text(theory_step->'layerIds') taught_layer_ref
      where taught_layer_ref = layer->>'id'
    )
  ) then return false; end if;
  return true;
exception
  when others then return false;
end;
$function$;

create function private.valid_authoring_blueprint_binding_v1(
  p_binding jsonb,
  p_blueprint jsonb,
  p_analysis jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
declare
  v_item jsonb;
begin
  if not private.authoring_design_closed_object_v1(
    p_binding,
    array[
      'contract','id','version','scope','blueprintRef',
      'blueprintContractVersion','analysisRef','effectiveSnapshotRef','mappings'
    ],
    array[
      'contract','id','version','scope','blueprintRef',
      'blueprintContractVersion','analysisRef','effectiveSnapshotRef','mappings'
    ]
  )
  or p_binding->>'contract' is distinct from 'PedagogicalBlueprintBinding@1'
  or nullif(btrim(p_binding->>'id'), '') is null
  or nullif(btrim(p_binding->>'version'), '') is null
  or jsonb_typeof(p_binding->'blueprintContractVersion') <> 'number'
  or p_binding->>'blueprintContractVersion' <> '2'
  or not private.authoring_design_closed_object_v1(
    p_binding->'scope', array['kind','ref'], array['kind','ref']
  )
  or p_binding#>>'{scope,kind}' is distinct from 'microsequence'
  or not private.authoring_design_closed_object_v1(
    p_binding->'blueprintRef', array['id','version'], array['id','version']
  )
  or not private.authoring_design_closed_object_v1(
    p_binding->'analysisRef', array['id','version'], array['id','version']
  )
  or not private.authoring_design_closed_object_v1(
    p_binding->'effectiveSnapshotRef', array['id','version'], array['id','version']
  )
  or not private.authoring_design_closed_object_v1(
    p_binding->'mappings',
    array[
      'conceptualLayers','contentDemands','designResponses',
      'theorySteps','practiceSteps'
    ],
    array[
      'conceptualLayers','contentDemands','designResponses',
      'theorySteps','practiceSteps'
    ]
  )
  or jsonb_typeof(p_binding#>'{mappings,conceptualLayers}') <> 'array'
  or jsonb_typeof(p_binding#>'{mappings,contentDemands}') <> 'array'
  or jsonb_typeof(p_binding#>'{mappings,designResponses}') <> 'array'
  or jsonb_typeof(p_binding#>'{mappings,theorySteps}') <> 'array'
  or jsonb_typeof(p_binding#>'{mappings,practiceSteps}') <> 'array'
  or private.authoring_design_contains_forbidden_key_v1(p_binding)
  or pg_column_size(p_binding) > 262144
  then return false; end if;

  for v_item in
    select value from jsonb_array_elements(p_binding#>'{mappings,conceptualLayers}')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['layerId','unitRefs'], array['layerId','unitRefs']
    ) or nullif(btrim(v_item->>'layerId'), '') is null
      or not private.authoring_design_text_array_v1(v_item->'unitRefs', 1)
    then return false; end if;
  end loop;
  for v_item in
    select value from jsonb_array_elements(p_binding#>'{mappings,contentDemands}')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['contentDemandId','unitRefs','evidenceRequirementRefs'],
      array['contentDemandId','unitRefs','evidenceRequirementRefs']
    ) or nullif(btrim(v_item->>'contentDemandId'), '') is null
      or not private.authoring_design_text_array_v1(v_item->'unitRefs', 1)
      or not private.authoring_design_text_array_v1(v_item->'evidenceRequirementRefs')
    then return false; end if;
  end loop;
  for v_item in
    select value from jsonb_array_elements(p_binding#>'{mappings,designResponses}')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item,
      array['designResponseId','explanationRequirementRefs','evidenceRequirementRefs'],
      array['designResponseId','explanationRequirementRefs','evidenceRequirementRefs']
    ) or nullif(btrim(v_item->>'designResponseId'), '') is null
      or not private.authoring_design_text_array_v1(v_item->'explanationRequirementRefs')
      or not private.authoring_design_text_array_v1(v_item->'evidenceRequirementRefs')
    then return false; end if;
  end loop;
  for v_item in
    select value from jsonb_array_elements(p_binding#>'{mappings,theorySteps}')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['stepId','unitRefs','explanationRequirementRefs'],
      array['stepId','unitRefs','explanationRequirementRefs']
    ) or nullif(btrim(v_item->>'stepId'), '') is null
      or not private.authoring_design_text_array_v1(v_item->'unitRefs', 1)
      or not private.authoring_design_text_array_v1(v_item->'explanationRequirementRefs')
    then return false; end if;
  end loop;
  for v_item in
    select value from jsonb_array_elements(p_binding#>'{mappings,practiceSteps}')
  loop
    if not private.authoring_design_closed_object_v1(
      v_item, array['stepId','unitRefs','evidenceRequirementRefs'],
      array['stepId','unitRefs','evidenceRequirementRefs']
    ) or nullif(btrim(v_item->>'stepId'), '') is null
      or not private.authoring_design_text_array_v1(v_item->'unitRefs', 1)
      or not private.authoring_design_text_array_v1(v_item->'evidenceRequirementRefs', 1)
    then return false; end if;
  end loop;

  if exists (
    (select item->>'id' from jsonb_array_elements(p_blueprint->'conceptualLayers') item
     except
     select item->>'layerId' from jsonb_array_elements(p_binding#>'{mappings,conceptualLayers}') item)
    union all
    (select item->>'layerId' from jsonb_array_elements(p_binding#>'{mappings,conceptualLayers}') item
     except
     select item->>'id' from jsonb_array_elements(p_blueprint->'conceptualLayers') item)
    union all
    (select item->>'id' from jsonb_array_elements(p_blueprint->'contentDemands') item
     except
     select item->>'contentDemandId' from jsonb_array_elements(p_binding#>'{mappings,contentDemands}') item)
    union all
    (select item->>'contentDemandId' from jsonb_array_elements(p_binding#>'{mappings,contentDemands}') item
     except
     select item->>'id' from jsonb_array_elements(p_blueprint->'contentDemands') item)
    union all
    (select item->>'id' from jsonb_array_elements(p_blueprint->'designResponses') item
     except
     select item->>'designResponseId' from jsonb_array_elements(p_binding#>'{mappings,designResponses}') item)
    union all
    (select item->>'designResponseId' from jsonb_array_elements(p_binding#>'{mappings,designResponses}') item
     except
     select item->>'id' from jsonb_array_elements(p_blueprint->'designResponses') item)
    union all
    (select item->>'id' from jsonb_array_elements(p_blueprint->'theorySteps') item
     except
     select item->>'stepId' from jsonb_array_elements(p_binding#>'{mappings,theorySteps}') item)
    union all
    (select item->>'stepId' from jsonb_array_elements(p_binding#>'{mappings,theorySteps}') item
     except
     select item->>'id' from jsonb_array_elements(p_blueprint->'theorySteps') item)
    union all
    (select item->>'id' from jsonb_array_elements(p_blueprint->'practiceSteps') item
     except
     select item->>'stepId' from jsonb_array_elements(p_binding#>'{mappings,practiceSteps}') item)
    union all
    (select item->>'stepId' from jsonb_array_elements(p_binding#>'{mappings,practiceSteps}') item
     except
     select item->>'id' from jsonb_array_elements(p_blueprint->'practiceSteps') item)
  ) then return false; end if;

  if exists (
    select 1 from (
      select 'layer' kind, item->>'layerId' id from jsonb_array_elements(p_binding#>'{mappings,conceptualLayers}') item
      union all select 'demand', item->>'contentDemandId' from jsonb_array_elements(p_binding#>'{mappings,contentDemands}') item
      union all select 'response', item->>'designResponseId' from jsonb_array_elements(p_binding#>'{mappings,designResponses}') item
    ) ids group by kind, id having count(*) > 1
  )
  or exists (
    select 1 from (
      select item->>'stepId' id from jsonb_array_elements(p_binding#>'{mappings,theorySteps}') item
      union all select item->>'stepId' from jsonb_array_elements(p_binding#>'{mappings,practiceSteps}') item
    ) ids group by id having count(*) > 1
  ) then return false; end if;

  if exists (
    select 1 from (
      select unit_ref
      from jsonb_array_elements(p_binding#>'{mappings,conceptualLayers}') entry,
        jsonb_array_elements_text(entry->'unitRefs') unit_ref
      union all
      select unit_ref
      from jsonb_array_elements(p_binding#>'{mappings,contentDemands}') entry,
        jsonb_array_elements_text(entry->'unitRefs') unit_ref
      union all
      select unit_ref
      from jsonb_array_elements(p_binding#>'{mappings,theorySteps}') entry,
        jsonb_array_elements_text(entry->'unitRefs') unit_ref
      union all
      select unit_ref
      from jsonb_array_elements(p_binding#>'{mappings,practiceSteps}') entry,
        jsonb_array_elements_text(entry->'unitRefs') unit_ref
    ) refs where not exists (
      select 1 from jsonb_array_elements(p_analysis->'units') unit_value
      where unit_value->>'id' = refs.unit_ref
    )
  )
  or exists (
    select 1 from (
      select requirement_ref
      from jsonb_array_elements(p_binding#>'{mappings,designResponses}') entry,
        jsonb_array_elements_text(entry->'explanationRequirementRefs') requirement_ref
      union all
      select requirement_ref
      from jsonb_array_elements(p_binding#>'{mappings,theorySteps}') entry,
        jsonb_array_elements_text(entry->'explanationRequirementRefs') requirement_ref
    ) refs where not exists (
      select 1 from jsonb_array_elements(p_analysis->'explanationRequirements') requirement
      where requirement->>'id' = refs.requirement_ref
    )
  )
  or exists (
    select 1 from (
      select requirement_ref
      from jsonb_array_elements(p_binding#>'{mappings,contentDemands}') entry,
        jsonb_array_elements_text(entry->'evidenceRequirementRefs') requirement_ref
      union all
      select requirement_ref
      from jsonb_array_elements(p_binding#>'{mappings,designResponses}') entry,
        jsonb_array_elements_text(entry->'evidenceRequirementRefs') requirement_ref
      union all
      select requirement_ref
      from jsonb_array_elements(p_binding#>'{mappings,practiceSteps}') entry,
        jsonb_array_elements_text(entry->'evidenceRequirementRefs') requirement_ref
    ) refs where not exists (
      select 1 from jsonb_array_elements(p_analysis->'evidenceRequirements') requirement
      where requirement->>'id' = refs.requirement_ref
    )
  ) then return false; end if;
  return true;
exception
  when others then return false;
end;
$function$;

create function private.reject_authoring_design_update_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'Objetos versionados de desenho são imutáveis.'
    using errcode = '55000';
end;
$function$;

create table private.authoring_design_parameter_definitions (
  parameter_id text not null,
  parameter_version text not null,
  catalog_version text not null,
  value_kind text not null,
  unit_numerator text not null,
  unit_denominator text not null,
  supported_scopes text[] not null,
  resolution_strategy text not null,
  definition jsonb not null,
  default_value jsonb,
  created_at timestamptz not null default now(),
  primary key(parameter_id, parameter_version),
  constraint authoring_design_parameter_definitions_id_v1 check (
    parameter_id ~ '^[a-z][a-z0-9_]{0,159}$'
    and parameter_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'
    and catalog_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'
  ),
  constraint authoring_design_parameter_definitions_kind_v1 check (
    value_kind in ('integer', 'range', 'enum', 'set', 'vector', 'relation')
  ),
  constraint authoring_design_parameter_definitions_unit_v1 check (
    nullif(btrim(unit_numerator), '') is not null
    and nullif(btrim(unit_denominator), '') is not null
    and char_length(unit_numerator) <= 120
    and char_length(unit_denominator) <= 120
  ),
  constraint authoring_design_parameter_definitions_scope_v1 check (
    cardinality(supported_scopes) between 1 and 5
    and supported_scopes <@ array[
      'workspace', 'course', 'module', 'lesson', 'microsequence'
    ]::text[]
  ),
  constraint authoring_design_parameter_definitions_resolution_v1 check (
    resolution_strategy = 'nearest_scope_replaces'
  ),
  constraint authoring_design_parameter_definitions_payload_v1 check (
    jsonb_typeof(definition) = 'object'
    and pg_column_size(definition) <= 65536
    and not private.authoring_design_contains_forbidden_key_v1(definition)
    and (default_value is null or (
      jsonb_typeof(default_value) = 'object'
      and pg_column_size(default_value) <= 65536
      and not private.authoring_design_contains_forbidden_key_v1(default_value)
    ))
  )
);

create table private.authoring_instructional_analyses (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  analysis_id text not null,
  analysis_version text not null,
  model_version text not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint,
  based_on_workspace_revision bigint not null,
  objective text not null,
  payload jsonb not null,
  payload_hash text not null,
  created_revision bigint not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, analysis_id, analysis_version),
  constraint authoring_instructional_analyses_id_v1 check (
    nullif(btrim(analysis_id), '') is not null
    and analysis_id = btrim(analysis_id)
    and char_length(analysis_id) <= 240
    and analysis_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  constraint authoring_instructional_analyses_scope_v1 check (
    scope_kind in ('workspace', 'course', 'module', 'lesson', 'microsequence')
    and nullif(btrim(scope_ref), '') is not null
    and char_length(scope_ref) <= 240
    and cardinality(scope_path) = case scope_kind
      when 'workspace' then 0 when 'course' then 1 when 'module' then 2
      when 'lesson' then 3 else 4 end
    and (scope_kind = 'workspace' or scope_path[cardinality(scope_path)] = scope_ref)
    and ((scope_kind = 'workspace') = (scope_entity_version is null))
  ),
  constraint authoring_instructional_analyses_revision_v1 check (
    based_on_workspace_revision > 0
    and created_revision = based_on_workspace_revision + 1
    and (scope_entity_version is null or scope_entity_version > 0)
  ),
  constraint authoring_instructional_analyses_objective_v1 check (
    nullif(btrim(objective), '') is not null and char_length(objective) <= 4000
  ),
  constraint authoring_instructional_analyses_payload_v1 check (
    jsonb_typeof(payload) = 'object'
    and pg_column_size(payload) <= 262144
    and payload_hash ~ '^[a-f0-9]{64}$'
    and not private.authoring_design_contains_forbidden_key_v1(payload)
  )
);

create index authoring_instructional_analyses_scope_v1_idx
  on private.authoring_instructional_analyses(
    workspace_id, scope_kind, scope_ref, created_revision desc,
    analysis_id, analysis_version
  );

create table private.authoring_design_parameter_assignments (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  assignment_id text not null,
  assignment_version text not null,
  model_version text not null,
  action text not null,
  parameter_id text not null,
  parameter_version text not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  mode text,
  value jsonb,
  authority_kind text not null,
  authority_actor_id uuid references auth.users(id) on delete set null,
  authority_ref text,
  locked boolean not null,
  rationale text not null,
  provenance_refs text[] not null default '{}',
  based_on_workspace_revision bigint not null,
  created_revision bigint not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, assignment_id, assignment_version),
  foreign key(parameter_id, parameter_version)
    references private.authoring_design_parameter_definitions(
      parameter_id, parameter_version
    ) on delete restrict,
  constraint authoring_design_parameter_assignments_id_v1 check (
    nullif(btrim(assignment_id), '') is not null
    and assignment_id = btrim(assignment_id)
    and char_length(assignment_id) <= 240
    and assignment_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  constraint authoring_design_parameter_assignments_action_v1 check (
    action in ('set', 'remove')
  ),
  constraint authoring_design_parameter_assignments_scope_v1 check (
    scope_kind in ('workspace', 'course', 'module', 'lesson', 'microsequence')
    and nullif(btrim(scope_ref), '') is not null
    and char_length(scope_ref) <= 240
    and cardinality(scope_path) = case scope_kind
      when 'workspace' then 0 when 'course' then 1 when 'module' then 2
      when 'lesson' then 3 else 4 end
    and (scope_kind = 'workspace' or scope_path[cardinality(scope_path)] = scope_ref)
  ),
  constraint authoring_design_parameter_assignments_authority_v1 check (
    (action = 'set' and (
      (mode = 'auto' and authority_kind = 'gpt' and not locked)
      or (mode = 'manual_override' and authority_kind = 'author' and not locked)
      or (mode = 'research_lock' and authority_kind = 'research_protocol' and locked)
    ) and value is not null)
    or (action = 'remove' and mode is null and value is null)
  ),
  constraint authoring_design_parameter_assignments_value_v1 check (
    value is null or (
      jsonb_typeof(value) = 'object'
      and pg_column_size(value) <= 65536
      and not private.authoring_design_contains_forbidden_key_v1(value)
    )
  ),
  constraint authoring_design_parameter_assignments_reason_v1 check (
    nullif(btrim(rationale), '') is not null
    and char_length(rationale) <= 1000
    and cardinality(provenance_refs) <= 64
  ),
  constraint authoring_design_parameter_assignments_revision_v1 check (
    based_on_workspace_revision > 0
    and created_revision = based_on_workspace_revision + 1
  )
);

create index authoring_design_parameter_assignments_resolution_v1_idx
  on private.authoring_design_parameter_assignments(
    workspace_id, parameter_id, parameter_version,
    scope_kind, scope_ref, created_revision desc
  );
create index authoring_design_parameter_assignments_identity_v1_idx
  on private.authoring_design_parameter_assignments(
    workspace_id, assignment_id, created_revision desc
  );

create table private.authoring_resource_sets (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  resource_set_id text not null,
  resource_set_version text not null,
  model_version text not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint,
  resolved_catalog_version text not null,
  facet_basis jsonb not null,
  allowed_fits text[] not null,
  allow_embedded_practice boolean not null,
  allow_response_packages boolean not null,
  no_adequate_representation text not null,
  provenance_refs text[] not null default '{}',
  payload_hash text not null,
  based_on_workspace_revision bigint not null,
  created_revision bigint not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, resource_set_id, resource_set_version),
  constraint authoring_resource_sets_id_v1 check (
    nullif(btrim(resource_set_id), '') is not null
    and resource_set_id = btrim(resource_set_id)
    and char_length(resource_set_id) <= 240
    and resource_set_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and nullif(btrim(resolved_catalog_version), '') is not null
    and char_length(resolved_catalog_version) <= 80
  ),
  constraint authoring_resource_sets_scope_v1 check (
    scope_kind in ('workspace', 'course', 'module', 'lesson', 'microsequence')
    and nullif(btrim(scope_ref), '') is not null
    and char_length(scope_ref) <= 240
    and cardinality(scope_path) = case scope_kind
      when 'workspace' then 0 when 'course' then 1 when 'module' then 2
      when 'lesson' then 3 else 4 end
    and (scope_kind = 'workspace' or scope_path[cardinality(scope_path)] = scope_ref)
    and ((scope_kind = 'workspace') = (scope_entity_version is null))
    and (scope_entity_version is null or scope_entity_version > 0)
  ),
  constraint authoring_resource_sets_facets_v1 check (
    jsonb_typeof(facet_basis) = 'object'
    and pg_column_size(facet_basis) <= 65536
    and facet_basis ?& array[
      'catalogVersion', 'families', 'disciplines', 'structures',
      'cognitiveOperations', 'practiceModalities'
    ]
    and facet_basis->>'catalogVersion' = resolved_catalog_version
    and jsonb_typeof(facet_basis->'families') = 'array'
    and jsonb_typeof(facet_basis->'disciplines') = 'array'
    and jsonb_typeof(facet_basis->'structures') = 'array'
    and jsonb_typeof(facet_basis->'cognitiveOperations') = 'array'
    and jsonb_typeof(facet_basis->'practiceModalities') = 'array'
    and not private.authoring_design_contains_forbidden_key_v1(facet_basis)
  ),
  constraint authoring_resource_sets_policy_v1 check (
    cardinality(allowed_fits) between 1 and 3
    and allowed_fits <@ array['canonical', 'versatile', 'substitute']::text[]
    and no_adequate_representation in ('block', 'record_limitation')
  ),
  constraint authoring_resource_sets_provenance_v1 check (
    cardinality(provenance_refs) <= 64
    and payload_hash ~ '^[a-f0-9]{64}$'
    and based_on_workspace_revision > 0
    and created_revision = based_on_workspace_revision + 1
  )
);

create table private.authoring_resource_set_members (
  workspace_id uuid not null,
  resource_set_id text not null,
  resource_set_version text not null,
  package_id text not null,
  package_version text not null,
  ordinal integer not null,
  primary key(
    workspace_id, resource_set_id, resource_set_version,
    package_id, package_version
  ),
  foreign key(workspace_id, resource_set_id, resource_set_version)
    references private.authoring_resource_sets(
      workspace_id, resource_set_id, resource_set_version
    ) on delete cascade,
  constraint authoring_resource_set_members_package_v1 check (
    package_id ~ '^aralearn\.(resource|response)\.[a-z0-9_]+$'
    and package_version ~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
    and ordinal between 1 and 4096
  ),
  unique(workspace_id, resource_set_id, resource_set_version, ordinal)
);

create index authoring_resource_set_members_package_v1_idx
  on private.authoring_resource_set_members(
    package_id, package_version, workspace_id,
    resource_set_id, resource_set_version
  );

create table private.authoring_effective_design_snapshots (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  snapshot_id text not null,
  snapshot_version text not null,
  model_version text not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint,
  analysis_id text not null,
  analysis_version text not null,
  parameter_catalog_version text not null,
  resolution_version text not null,
  based_on_workspace_revision bigint not null,
  created_revision bigint not null,
  payload_hash text not null,
  frozen_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, snapshot_id, snapshot_version),
  constraint authoring_effective_design_snapshots_analysis_key_v1 unique(
    workspace_id, snapshot_id, snapshot_version,
    analysis_id, analysis_version
  ),
  foreign key(workspace_id, analysis_id, analysis_version)
    references private.authoring_instructional_analyses(
      workspace_id, analysis_id, analysis_version
    ) on delete restrict,
  constraint authoring_effective_design_snapshots_id_v1 check (
    nullif(btrim(snapshot_id), '') is not null
    and snapshot_id = btrim(snapshot_id)
    and char_length(snapshot_id) <= 240
    and snapshot_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and parameter_catalog_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and resolution_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  constraint authoring_effective_design_snapshots_scope_v1 check (
    scope_kind in ('workspace', 'course', 'module', 'lesson', 'microsequence')
    and cardinality(scope_path) = case scope_kind
      when 'workspace' then 0 when 'course' then 1 when 'module' then 2
      when 'lesson' then 3 else 4 end
    and (scope_kind = 'workspace' or scope_path[cardinality(scope_path)] = scope_ref)
    and ((scope_kind = 'workspace') = (scope_entity_version is null))
  ),
  constraint authoring_effective_design_snapshots_revision_v1 check (
    based_on_workspace_revision > 0
    and created_revision = based_on_workspace_revision + 1
    and payload_hash ~ '^[a-f0-9]{64}$'
  )
);

create index authoring_effective_design_snapshots_scope_v1_idx
  on private.authoring_effective_design_snapshots(
    workspace_id, scope_kind, scope_ref, created_revision desc,
    snapshot_id, snapshot_version
  );

create table private.authoring_effective_design_snapshot_values (
  workspace_id uuid not null,
  snapshot_id text not null,
  snapshot_version text not null,
  parameter_id text not null,
  parameter_version text not null,
  value jsonb not null,
  assignment_mode text not null,
  inheritance_kind text not null,
  assignment_id text,
  assignment_version text,
  source_scope_kind text not null,
  source_scope_ref text not null,
  rationale text not null,
  provenance_refs text[] not null default '{}',
  primary key(
    workspace_id, snapshot_id, snapshot_version,
    parameter_id, parameter_version
  ),
  foreign key(workspace_id, snapshot_id, snapshot_version)
    references private.authoring_effective_design_snapshots(
      workspace_id, snapshot_id, snapshot_version
    ) on delete cascade,
  foreign key(parameter_id, parameter_version)
    references private.authoring_design_parameter_definitions(
      parameter_id, parameter_version
    ) on delete restrict,
  foreign key(workspace_id, assignment_id, assignment_version)
    references private.authoring_design_parameter_assignments(
      workspace_id, assignment_id, assignment_version
    ) on delete restrict,
  constraint authoring_effective_design_snapshot_values_resolution_v1 check (
    assignment_mode in ('default', 'auto', 'manual_override', 'research_lock')
    and inheritance_kind in ('local', 'inherited')
    and ((assignment_mode = 'default') = (assignment_id is null))
    and ((assignment_id is null) = (assignment_version is null))
    and source_scope_kind in (
      'workspace', 'course', 'module', 'lesson', 'microsequence'
    )
  ),
  constraint authoring_effective_design_snapshot_values_payload_v1 check (
    jsonb_typeof(value) = 'object'
    and pg_column_size(value) <= 65536
    and not private.authoring_design_contains_forbidden_key_v1(value)
    and nullif(btrim(rationale), '') is not null
    and char_length(rationale) <= 1000
    and cardinality(provenance_refs) <= 64
  )
);

create table private.authoring_effective_design_snapshot_resource_sets (
  workspace_id uuid not null,
  snapshot_id text not null,
  snapshot_version text not null,
  resource_set_id text not null,
  resource_set_version text not null,
  ordinal integer not null,
  primary key(
    workspace_id, snapshot_id, snapshot_version,
    resource_set_id, resource_set_version
  ),
  foreign key(workspace_id, snapshot_id, snapshot_version)
    references private.authoring_effective_design_snapshots(
      workspace_id, snapshot_id, snapshot_version
    ) on delete cascade,
  foreign key(workspace_id, resource_set_id, resource_set_version)
    references private.authoring_resource_sets(
      workspace_id, resource_set_id, resource_set_version
    ) on delete restrict,
  constraint authoring_effective_design_snapshot_sets_ordinal_v1 check (
    ordinal between 1 and 128
  ),
  unique(workspace_id, snapshot_id, snapshot_version, ordinal)
);

create table private.authoring_pedagogical_blueprints (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  blueprint_id text not null,
  blueprint_version text not null,
  contract_version integer not null,
  model_version text not null,
  microsequence_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint not null,
  analysis_id text not null,
  analysis_version text not null,
  snapshot_id text not null,
  snapshot_version text not null,
  based_on_workspace_revision bigint not null,
  created_revision bigint not null,
  payload jsonb not null,
  payload_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, blueprint_id, blueprint_version),
  constraint authoring_pedagogical_blueprints_design_key_v1 unique(
    workspace_id, blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ),
  foreign key(workspace_id, analysis_id, analysis_version)
    references private.authoring_instructional_analyses(
      workspace_id, analysis_id, analysis_version
    ) on delete restrict,
  foreign key(workspace_id, snapshot_id, snapshot_version)
    references private.authoring_effective_design_snapshots(
      workspace_id, snapshot_id, snapshot_version
    ) on delete restrict,
  constraint authoring_pedagogical_blueprints_snapshot_analysis_v1
    foreign key(
      workspace_id, snapshot_id, snapshot_version,
      analysis_id, analysis_version
    ) references private.authoring_effective_design_snapshots(
      workspace_id, snapshot_id, snapshot_version,
      analysis_id, analysis_version
    ) on delete restrict,
  constraint authoring_pedagogical_blueprints_id_v1 check (
    nullif(btrim(blueprint_id), '') is not null
    and blueprint_id = btrim(blueprint_id)
    and char_length(blueprint_id) <= 240
    and blueprint_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and contract_version = 2
    and model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  constraint authoring_pedagogical_blueprints_scope_v1 check (
    cardinality(scope_path) = 4
    and scope_path[4] = microsequence_ref
    and scope_entity_version > 0
  ),
  constraint authoring_pedagogical_blueprints_revision_v1 check (
    based_on_workspace_revision > 0
    and created_revision = based_on_workspace_revision + 1
  ),
  constraint authoring_pedagogical_blueprints_payload_v1 check (
    jsonb_typeof(payload) = 'object'
    and pg_column_size(payload) <= 524288
    and payload_hash ~ '^[a-f0-9]{64}$'
    and not private.authoring_design_contains_forbidden_key_v1(payload)
  )
);

create table private.authoring_pedagogical_blueprint_bindings (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  binding_id text not null,
  binding_version text not null,
  contract_version integer not null,
  microsequence_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint not null,
  blueprint_id text not null,
  blueprint_version text not null,
  analysis_id text not null,
  analysis_version text not null,
  snapshot_id text not null,
  snapshot_version text not null,
  created_revision bigint not null,
  payload jsonb not null,
  payload_hash text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, binding_id, binding_version),
  constraint authoring_blueprint_bindings_one_per_blueprint_v1 unique(
    workspace_id, blueprint_id, blueprint_version
  ),
  constraint authoring_blueprint_bindings_design_key_v1 unique(
    workspace_id, binding_id, binding_version,
    blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ),
  constraint authoring_blueprint_bindings_blueprint_v1 foreign key(
    workspace_id, blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) references private.authoring_pedagogical_blueprints(
    workspace_id, blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) on delete restrict,
  constraint authoring_blueprint_bindings_identity_v1 check (
    nullif(btrim(binding_id), '') is not null
    and binding_id = btrim(binding_id)
    and char_length(binding_id) <= 240
    and binding_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and contract_version = 1
  ),
  constraint authoring_blueprint_bindings_scope_v1 check (
    cardinality(scope_path) = 4
    and scope_path[4] = microsequence_ref
    and scope_entity_version > 0
  ),
  constraint authoring_blueprint_bindings_payload_v1 check (
    jsonb_typeof(payload) = 'object'
    and pg_column_size(payload) <= 262144
    and payload_hash ~ '^[a-f0-9]{64}$'
    and not private.authoring_design_contains_forbidden_key_v1(payload)
  )
);

create index authoring_blueprint_bindings_scope_v1_idx
  on private.authoring_pedagogical_blueprint_bindings(
    workspace_id, microsequence_ref, created_revision desc,
    binding_id, binding_version
  );

create table private.authoring_microsequence_design_bindings (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  microsequence_ref text not null,
  binding_id text not null,
  binding_version text not null,
  blueprint_id text not null,
  blueprint_version text not null,
  analysis_id text not null,
  analysis_version text not null,
  snapshot_id text not null,
  snapshot_version text not null,
  bound_at_revision bigint not null,
  updated_at timestamptz not null default now(),
  primary key(workspace_id, microsequence_ref),
  foreign key(workspace_id, blueprint_id, blueprint_version)
    references private.authoring_pedagogical_blueprints(
      workspace_id, blueprint_id, blueprint_version
    ) on delete restrict,
  foreign key(workspace_id, analysis_id, analysis_version)
    references private.authoring_instructional_analyses(
      workspace_id, analysis_id, analysis_version
    ) on delete restrict,
  foreign key(workspace_id, snapshot_id, snapshot_version)
    references private.authoring_effective_design_snapshots(
      workspace_id, snapshot_id, snapshot_version
    ) on delete restrict,
  constraint authoring_microsequence_design_bindings_exact_v1 foreign key(
    workspace_id, blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) references private.authoring_pedagogical_blueprints(
    workspace_id, blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) on delete restrict,
  constraint authoring_microsequence_design_bindings_binding_v1 foreign key(
    workspace_id, binding_id, binding_version,
    blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) references private.authoring_pedagogical_blueprint_bindings(
    workspace_id, binding_id, binding_version,
    blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) on delete restrict,
  constraint authoring_microsequence_design_bindings_revision_v1 check (
    bound_at_revision > 0
  )
);

create table private.authoring_materialization_states (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  microsequence_ref text not null,
  materialization_revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(workspace_id, microsequence_ref),
  constraint authoring_materialization_states_revision_v1 check (
    nullif(btrim(microsequence_ref), '') is not null
    and materialization_revision >= 0
  )
);

create function private.bump_authoring_materialization_state_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_old_microsequence text;
  v_new_microsequence text;
  v_old_lock_key text;
  v_new_lock_key text;
begin
  if tg_op <> 'INSERT'
     and old.entity_type = 'card'
     and old.parent_type = 'microsequence' then
    v_old_microsequence := old.parent_id;
    v_old_lock_key := 'aralearn-materialization:' || old.workspace_id::text
      || ':' || old.parent_id;
  end if;
  if tg_op <> 'DELETE'
     and new.entity_type = 'card'
     and new.parent_type = 'microsequence' then
    v_new_microsequence := new.parent_id;
    v_new_lock_key := 'aralearn-materialization:' || new.workspace_id::text
      || ':' || new.parent_id;
  end if;
  if v_old_lock_key is not null and v_new_lock_key is not null
     and v_old_lock_key is distinct from v_new_lock_key then
    perform pg_advisory_xact_lock(hashtextextended(
      least(v_old_lock_key, v_new_lock_key), 0
    ));
    perform pg_advisory_xact_lock(hashtextextended(
      greatest(v_old_lock_key, v_new_lock_key), 0
    ));
  elsif coalesce(v_old_lock_key, v_new_lock_key) is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      coalesce(v_old_lock_key, v_new_lock_key), 0
    ));
  end if;
  if v_old_microsequence is not null then
    insert into private.authoring_materialization_states(
      workspace_id, microsequence_ref, materialization_revision, updated_at
    ) values (old.workspace_id, v_old_microsequence, 1, now())
    on conflict(workspace_id, microsequence_ref) do update
      set materialization_revision =
        private.authoring_materialization_states.materialization_revision + 1,
        updated_at = excluded.updated_at;
  end if;
  if v_new_microsequence is not null
     and v_new_microsequence is distinct from v_old_microsequence then
    insert into private.authoring_materialization_states(
      workspace_id, microsequence_ref, materialization_revision, updated_at
    ) values (new.workspace_id, v_new_microsequence, 1, now())
    on conflict(workspace_id, microsequence_ref) do update
      set materialization_revision =
        private.authoring_materialization_states.materialization_revision + 1,
        updated_at = excluded.updated_at;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger authoring_workspace_entities_materialization_state_v1
after insert or update or delete on private.authoring_workspace_entities
for each row execute function private.bump_authoring_materialization_state_v1();

create table private.authoring_materialization_manifests (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  manifest_id text not null,
  manifest_version text not null,
  model_version text not null,
  scope_kind text not null,
  scope_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint not null,
  analysis_id text not null,
  analysis_version text not null,
  snapshot_id text not null,
  snapshot_version text not null,
  blueprint_id text not null,
  blueprint_version text not null,
  materialized_workspace_revision bigint not null,
  materialization_state_revision bigint not null,
  created_revision bigint not null,
  content_hash text not null,
  blueprint_hash text not null,
  payload jsonb not null,
  payload_hash text not null,
  declared_created_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, manifest_id, manifest_version),
  foreign key(workspace_id, analysis_id, analysis_version)
    references private.authoring_instructional_analyses(
      workspace_id, analysis_id, analysis_version
    ) on delete restrict,
  foreign key(workspace_id, snapshot_id, snapshot_version)
    references private.authoring_effective_design_snapshots(
      workspace_id, snapshot_id, snapshot_version
    ) on delete restrict,
  foreign key(workspace_id, blueprint_id, blueprint_version)
    references private.authoring_pedagogical_blueprints(
      workspace_id, blueprint_id, blueprint_version
    ) on delete restrict,
  constraint authoring_materialization_manifests_exact_design_v1 foreign key(
    workspace_id, blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) references private.authoring_pedagogical_blueprints(
    workspace_id, blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version
  ) on delete restrict,
  constraint authoring_materialization_manifests_id_v1 check (
    nullif(btrim(manifest_id), '') is not null
    and manifest_id = btrim(manifest_id)
    and char_length(manifest_id) <= 240
    and manifest_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and model_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
  ),
  constraint authoring_materialization_manifests_scope_v1 check (
    scope_kind = 'microsequence'
    and cardinality(scope_path) = 4
    and scope_path[4] = scope_ref
    and scope_entity_version > 0
  ),
  constraint authoring_materialization_manifests_revision_v1 check (
    materialized_workspace_revision > 0
    and materialization_state_revision >= 0
    and created_revision = materialized_workspace_revision + 1
  ),
  constraint authoring_materialization_manifests_hash_v1 check (
    content_hash ~ '^[a-f0-9]{64}$'
    and blueprint_hash ~ '^[a-f0-9]{64}$'
    and payload_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint authoring_materialization_manifests_payload_v1 check (
    jsonb_typeof(payload) = 'object'
    and pg_column_size(payload) <= 1048576
    and not private.authoring_design_contains_forbidden_key_v1(payload)
  )
);

create index authoring_materialization_manifests_scope_v1_idx
  on private.authoring_materialization_manifests(
    workspace_id, scope_ref, created_revision desc,
    manifest_id, manifest_version
  );

create table private.authoring_manifest_resource_selections (
  workspace_id uuid not null,
  manifest_id text not null,
  manifest_version text not null,
  selection_id text not null,
  step_ref text not null,
  package_id text not null,
  package_version text not null,
  resource_set_id text not null,
  resource_set_version text not null,
  role text not null,
  fit text not null,
  rationale text not null,
  limitations text[] not null default '{}',
  primary key(workspace_id, manifest_id, manifest_version, selection_id),
  constraint authoring_manifest_resource_selections_materialized_key_v1 unique(
    workspace_id, manifest_id, manifest_version, selection_id,
    package_id, package_version, role
  ),
  foreign key(workspace_id, manifest_id, manifest_version)
    references private.authoring_materialization_manifests(
      workspace_id, manifest_id, manifest_version
    ) on delete cascade,
  foreign key(
    workspace_id, resource_set_id, resource_set_version,
    package_id, package_version
  ) references private.authoring_resource_set_members(
    workspace_id, resource_set_id, resource_set_version,
    package_id, package_version
  ) on delete restrict,
  constraint authoring_manifest_resource_selections_id_v1 check (
    nullif(btrim(selection_id), '') is not null
    and char_length(selection_id) <= 240
    and nullif(btrim(step_ref), '') is not null
    and char_length(step_ref) <= 240
  ),
  constraint authoring_manifest_resource_selections_contract_v1 check (
    role in ('exposition', 'embedded_practice', 'response')
    and fit in ('canonical', 'versatile', 'substitute')
    and nullif(btrim(rationale), '') is not null
    and char_length(rationale) <= 1000
    and cardinality(limitations) <= 12
    and (fit <> 'substitute' or cardinality(limitations) > 0)
  )
);

create table private.authoring_manifest_materialized_resources (
  workspace_id uuid not null,
  manifest_id text not null,
  manifest_version text not null,
  resource_id text not null,
  selection_id text not null,
  artifact_ref text not null,
  package_id text not null,
  package_version text not null,
  role text not null,
  primary key(workspace_id, manifest_id, manifest_version, resource_id),
  foreign key(
    workspace_id, manifest_id, manifest_version, selection_id,
    package_id, package_version, role
  )
    references private.authoring_manifest_resource_selections(
      workspace_id, manifest_id, manifest_version, selection_id,
      package_id, package_version, role
    ) on delete cascade,
  constraint authoring_manifest_materialized_resources_contract_v1 check (
    nullif(btrim(resource_id), '') is not null
    and char_length(resource_id) <= 240
    and nullif(btrim(artifact_ref), '') is not null
    and char_length(artifact_ref) <= 1000
    and package_id ~ '^aralearn\.(resource|response)\.[a-z0-9_]+$'
    and package_version ~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
    and role in ('exposition', 'embedded_practice', 'response')
  )
);

create table private.authoring_manifest_coverage (
  workspace_id uuid not null,
  manifest_id text not null,
  manifest_version text not null,
  coverage_kind text not null,
  requirement_ref text not null,
  status text not null,
  evidence_refs text[] not null default '{}',
  practice_opportunity_refs text[] not null default '{}',
  primary key(
    workspace_id, manifest_id, manifest_version,
    coverage_kind, requirement_ref
  ),
  foreign key(workspace_id, manifest_id, manifest_version)
    references private.authoring_materialization_manifests(
      workspace_id, manifest_id, manifest_version
    ) on delete cascade,
  constraint authoring_manifest_coverage_contract_v1 check (
    coverage_kind in ('explanation', 'evidence')
    and nullif(btrim(requirement_ref), '') is not null
    and char_length(requirement_ref) <= 240
    and (
      (coverage_kind = 'explanation' and status in (
        'developed', 'mentioned', 'missing', 'not_applicable'
      ))
      or (coverage_kind = 'evidence' and status in (
        'covered', 'partial', 'missing', 'not_applicable'
      ))
    )
    and cardinality(evidence_refs) <= 512
    and cardinality(practice_opportunity_refs) <= 512
  )
);

create table private.authoring_manifest_metrics (
  workspace_id uuid not null,
  manifest_id text not null,
  manifest_version text not null,
  metric_id text not null,
  metric_kind text not null,
  value numeric not null,
  unit text not null,
  scope_kind text not null,
  scope_ref text not null,
  denominator_count integer not null,
  denominator_unit text not null,
  denominator_refs text[] not null,
  algorithm_id text not null,
  algorithm_version text not null,
  input_refs text[] not null,
  primary key(workspace_id, manifest_id, manifest_version, metric_id),
  foreign key(workspace_id, manifest_id, manifest_version)
    references private.authoring_materialization_manifests(
      workspace_id, manifest_id, manifest_version
    ) on delete cascade,
  constraint authoring_manifest_metrics_contract_v1 check (
    nullif(btrim(metric_id), '') is not null
    and char_length(metric_id) <= 240
    and metric_kind in ('observed', 'derived')
    and value >= 0
    and nullif(btrim(unit), '') is not null
    and char_length(unit) <= 120
    and scope_kind in (
      'workspace', 'course', 'module', 'lesson', 'microsequence'
    )
    and nullif(btrim(scope_ref), '') is not null
    and char_length(scope_ref) <= 240
    and denominator_count > 0
    and nullif(btrim(denominator_unit), '') is not null
    and cardinality(denominator_refs) between 1 and 4096
    and nullif(btrim(algorithm_id), '') is not null
    and algorithm_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and cardinality(input_refs) between 1 and 4096
  )
);

-- O conteúdo dos objetos versionados nunca é atualizado. Bindings são a única
-- projeção corrente mutável; a remoção continua disponível ao GC controlado.
create trigger authoring_design_parameter_definitions_immutable_v1
before update on private.authoring_design_parameter_definitions
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_instructional_analyses_immutable_v1
before update on private.authoring_instructional_analyses
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_design_parameter_assignments_immutable_v1
before update on private.authoring_design_parameter_assignments
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_resource_sets_immutable_v1
before update on private.authoring_resource_sets
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_resource_set_members_immutable_v1
before update on private.authoring_resource_set_members
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_effective_design_snapshots_immutable_v1
before update on private.authoring_effective_design_snapshots
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_effective_design_snapshot_values_immutable_v1
before update on private.authoring_effective_design_snapshot_values
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_effective_design_snapshot_sets_immutable_v1
before update on private.authoring_effective_design_snapshot_resource_sets
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_pedagogical_blueprints_immutable_v1
before update on private.authoring_pedagogical_blueprints
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_pedagogical_blueprint_bindings_immutable_v1
before update on private.authoring_pedagogical_blueprint_bindings
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_materialization_manifests_immutable_v1
before update on private.authoring_materialization_manifests
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_manifest_resource_selections_immutable_v1
before update on private.authoring_manifest_resource_selections
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_manifest_materialized_resources_immutable_v1
before update on private.authoring_manifest_materialized_resources
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_manifest_coverage_immutable_v1
before update on private.authoring_manifest_coverage
for each row execute function private.reject_authoring_design_update_v1();
create trigger authoring_manifest_metrics_immutable_v1
before update on private.authoring_manifest_metrics
for each row execute function private.reject_authoring_design_update_v1();

create view private.current_authoring_design_parameter_assignments_v1 as
with ranked as (
  select assignment.*,
    row_number() over (
      partition by assignment.workspace_id, assignment.assignment_id
      order by assignment.created_revision desc,
        assignment.created_at desc, assignment.assignment_version desc
    ) as current_rank
  from private.authoring_design_parameter_assignments assignment
)
select * from ranked
where current_rank = 1 and action = 'set';

with catalog(
  parameter_id, label, description, value_kind,
  unit_numerator, unit_denominator, supported_scopes,
  empirical_status, epistemic_kind, citation_key, anchor_relation,
  anchor_limit, constraints
) as (values
  (
    'new_units_per_theory_step_ceiling',
    'Limite proposto de unidades novas por passo',
    'Limite contextual para a quantidade de unidades da análise tratadas como novas em um mesmo passo de teoria.',
    'integer', 'assumed_new_analysis_unit', 'theory_step',
    array['microsequence']::text[], 'candidate_for_validation',
    'aralearn_operationalization', 'koedinger2012kli',
    'O grain size da análise de conhecimento depende do conteúdo, da tarefa e da população-alvo.',
    'Uma unidade de análise do AraLearn não é um knowledge component observado nem uma medida de aprendizagem.',
    '{"minimum":1}'::jsonb
  ),
  (
    'simultaneous_new_units_per_coordination_set_ceiling',
    'Limite proposto de coordenação simultânea',
    'Limite contextual de unidades assumidas como novas que precisam ser coordenadas simultaneamente em uma relação explícita.',
    'integer', 'assumed_new_analysis_unit', 'coordination_set',
    array['microsequence']::text[], 'candidate_for_validation',
    'aralearn_operationalization', 'chen2023elementinteractivity',
    'Element interactivity depende da estrutura da informação e do conhecimento prévio assumido.',
    'A cardinalidade do conjunto não mede carga cognitiva, dificuldade nem aprendizagem.',
    '{"minimum":1}'::jsonb
  ),
  (
    'applicable_explanation_requirement_refs',
    'Requisitos de explicação aplicáveis',
    'Conjunto explícito de requisitos de explicação que o desenho deve desenvolver no escopo corrente.',
    'set', 'explanation_requirement_ref', 'microsequence',
    array['microsequence']::text[], 'candidate_for_validation',
    'aralearn_operationalization', 'wittwer2008explanations',
    'Explicações instrucionais precisam ser adaptadas ao conhecimento e integradas à atividade cognitiva em curso.',
    'O conjunto é contextual e não constitui lista universal de componentes obrigatórios.',
    '{"setItemPattern":"^[a-zA-Z0-9._:-]+$"}'::jsonb
  ),
  (
    'evidence_alignment_relation',
    'Relação entre alvo e evidência',
    'Relação explícita entre unidades ou operações pretendidas e requisitos de evidência capazes de sustentá-las.',
    'relation', 'evidence_alignment_edge', 'microsequence',
    array['microsequence']::text[], 'candidate_for_validation',
    'aralearn_operationalization', 'mislevy2003ecd',
    'ECD separa a afirmação pretendida, a evidência observável e as tarefas que podem produzi-la.',
    'A relação registrada não transforma desempenho em inferência válida de proficiência sem um modelo de evidência validado.',
    '{"relationKinds":["targets","elicits","supports"]}'::jsonb
  ),
  (
    'distinct_practice_opportunities_per_evidence_requirement',
    'Faixa de oportunidades semanticamente distintas',
    'Faixa proposta de oportunidades com assinaturas semânticas distintas para cada requisito de evidência.',
    'range', 'distinct_semantic_practice_opportunity', 'evidence_requirement',
    array['microsequence']::text[], 'candidate_for_validation',
    'aralearn_operationalization', 'koedinger2012kli',
    'Eventos instrucionais e condições de prática precisam ser relacionados ao tipo de conhecimento e ao processo de aprendizagem pretendido.',
    'A faixa é hipótese de desenho; repetição superficial não aumenta o numerador e a quantidade não prova aprendizagem.',
    '{"minimum":0}'::jsonb
  ),
  (
    'practice_variation_dimensions',
    'Dimensões de variação da prática',
    'Vetor categórico ou numérico das dimensões que devem variar por razão semântica entre oportunidades de prática.',
    'vector', 'variation_dimension', 'evidence_requirement',
    array['microsequence']::text[], 'candidate_for_validation',
    'aralearn_operationalization', 'vanmerrienboer2019fourcomponent',
    'Variação de tarefas pode apoiar transferência quando preserva relações relevantes da competência.',
    'O vetor não é uma escala ordinal de qualidade nem torna 4C/ID pedagogia obrigatória.',
    '{}'::jsonb
  ),
  (
    'accepted_performance_forms',
    'Formas de desempenho aceitas',
    'Conjunto de formas de desempenho que podem fornecer a evidência pretendida no ambiente disponível.',
    'set', 'accepted_performance_form', 'evidence_requirement',
    array['microsequence']::text[], 'candidate_for_validation',
    'aralearn_operationalization', 'mislevy2003ecd',
    'A tarefa deve permitir observações pertinentes à afirmação que se deseja sustentar.',
    'As categorias não formam score de fidelidade e limitações de aproximação permanecem explícitas.',
    '{}'::jsonb
  ),
  (
    'representation_fallback_policy',
    'Política para representação indisponível',
    'Decisão categórica sobre bloquear a materialização ou registrar a limitação quando a representação adequada não está disponível.',
    'enum', 'fallback_policy_category', 'resource_selection',
    array['workspace','course','module','lesson','microsequence']::text[],
    'candidate_for_validation', 'aralearn_operationalization',
    'ainsworth2006deft',
    'Representações distintas oferecem funções e exigências cognitivas diferentes; multiplicidade não garante equivalência.',
    'Permitir substituição não autoriza declarar equivalência entre representações.',
    '{"allowedEnumValues":["block","allow_versatile_with_limitation","allow_substitute_with_limitation"]}'::jsonb
  ),
  (
    'available_resource_set_refs',
    'Conjuntos de resources disponíveis',
    'Conjunto de referências a ResourceSets versionados que restringem quais package@version podem ser escolhidos no escopo.',
    'set', 'resource_set_ref', 'scope',
    array['workspace','course','module','lesson','microsequence']::text[],
    'software_definition', 'software_property', 'ainsworth2006deft',
    'A disponibilidade de representações altera as funções representacionais possíveis no desenho.',
    'ResourceSet expressa disponibilidade controlada, não seleção concreta nem uso materializado.',
    '{"setItemPattern":"^[a-zA-Z0-9._:-]+@[a-zA-Z0-9._-]+$"}'::jsonb
  )
)
insert into private.authoring_design_parameter_definitions(
  parameter_id, parameter_version, catalog_version, value_kind,
  unit_numerator, unit_denominator, supported_scopes,
  resolution_strategy, definition
)
select
  parameter_id, '1.0.0', '1.0.0', value_kind,
  unit_numerator, unit_denominator, supported_scopes,
  'nearest_scope_replaces',
  jsonb_build_object(
    'contract', 'DesignParameterDefinition@1',
    'catalogVersion', '1.0.0',
    'id', parameter_id,
    'version', '1.0.0',
    'label', label,
    'description', description,
    'valueType', value_kind,
    'unit', jsonb_build_object(
      'numerator', unit_numerator, 'denominator', unit_denominator
    ),
    'supportedScopes', to_jsonb(supported_scopes),
    'epistemicClassification', jsonb_build_object(
      'kind', epistemic_kind,
      'claimBoundary', case when epistemic_kind = 'software_property'
        then 'Esta é uma propriedade verificável do software, não uma medida educacional nem evidência de eficácia.'
        else 'Esta é uma operacionalização de desenho do AraLearn, não uma medida científica validada do construto relacionado.' end
    ),
    'empiricalStatus', empirical_status,
    'theoreticalAnchors', jsonb_build_array(jsonb_build_object(
      'citationKey', citation_key,
      'relation', anchor_relation,
      'limit', anchor_limit
    )),
    'responsibility', jsonb_build_object(
      'proposedBy', 'gpt', 'calculatedBy', 'gpt',
      'validatedBy', jsonb_build_array('backend', 'author', 'researcher')
    ),
    'resolutionRule', jsonb_build_object(
      'strategy', 'nearest_scope_replaces',
      'sameScopeConflict', 'error',
      'assignmentValue', 'complete_value',
      'researchLockAuthority', 'separate_gate'
    ),
    'constraints', constraints
  )
from catalog;

create function private.authoring_design_json_hash_v1(p_value jsonb)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, extensions
as $function$
  select encode(extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex')
$function$;

create function private.authoring_materialized_content_hash_v1(
  p_workspace_id uuid,
  p_microsequence_ref text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select private.authoring_design_json_hash_v1(jsonb_build_object(
    'microsequenceRef', p_microsequence_ref,
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', card.entity_id,
        'position', card.position,
        'version', card.version,
        'content', card.content
      ) order by card.position, card.entity_id)
      from private.authoring_workspace_entities card
      where card.workspace_id = p_workspace_id
        and card.entity_type = 'card'
        and card.parent_type = 'microsequence'
        and card.parent_id = p_microsequence_ref
    ), '[]'::jsonb)
  ))
$function$;

create function private.authoring_design_mutation_hash_v1(
  p_operation text,
  p_payload jsonb
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, private
as $function$
  select private.authoring_design_json_hash_v1(jsonb_build_object(
    'operation', p_operation,
    'payload', p_payload
  ))
$function$;

create function private.canonical_authoring_parameter_value_v1(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_items jsonb;
  v_nodes jsonb;
  v_edges jsonb;
begin
  if jsonb_typeof(p_value) <> 'object' then return p_value; end if;
  if p_value->>'kind' = 'set' and jsonb_typeof(p_value->'values') = 'array' then
    select coalesce(jsonb_agg(item order by
      jsonb_typeof(item), item::text collate "C"), '[]'::jsonb)
    into v_items
    from (
      select distinct item
      from jsonb_array_elements(p_value->'values') item
    ) canonical_items;
    return jsonb_build_object('kind', 'set', 'values', v_items);
  elsif p_value->>'kind' = 'vector'
        and jsonb_typeof(p_value->'components') = 'array' then
    select coalesce(jsonb_agg(component order by
      component->>'dimension', component::text collate "C"), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(p_value->'components') component;
    return jsonb_build_object('kind', 'vector', 'components', v_items);
  elsif p_value->>'kind' = 'relation'
        and jsonb_typeof(p_value->'nodes') = 'array'
        and jsonb_typeof(p_value->'edges') = 'array' then
    select coalesce(jsonb_agg(node order by node #>> '{}'), '[]'::jsonb)
    into v_nodes
    from (
      select distinct node from jsonb_array_elements(p_value->'nodes') node
    ) canonical_nodes;
    select coalesce(jsonb_agg(edge order by
      edge->>'from', edge->>'to', edge->>'kind', edge::text collate "C"),
      '[]'::jsonb)
    into v_edges
    from jsonb_array_elements(p_value->'edges') edge;
    return jsonb_build_object(
      'kind', 'relation', 'nodes', v_nodes, 'edges', v_edges
    );
  end if;
  return p_value;
end;
$function$;

create function private.authoring_design_scope_path_v1(
  p_workspace_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_path text[];
  v_expected_depth integer;
begin
  if p_scope_kind not in (
    'workspace', 'course', 'module', 'lesson', 'microsequence'
  ) or nullif(btrim(p_scope_ref), '') is null then
    return null;
  end if;
  if p_scope_kind = 'workspace' then
    if p_scope_ref <> p_workspace_id::text or not exists (
      select 1 from private.authoring_workspaces workspace
      where workspace.id = p_workspace_id and workspace.deleted_at is null
    ) then return null; end if;
    return '{}'::text[];
  end if;
  v_expected_depth := case p_scope_kind
    when 'course' then 1 when 'module' then 2
    when 'lesson' then 3 else 4 end;
  with recursive lineage as (
    select entity.entity_type, entity.entity_id,
      entity.parent_type, entity.parent_id, 1 as depth
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = p_scope_kind
      and entity.entity_id = p_scope_ref
    union all
    select parent.entity_type, parent.entity_id,
      parent.parent_type, parent.parent_id, child.depth + 1
    from lineage child
    join private.authoring_workspace_entities parent
      on parent.workspace_id = p_workspace_id
     and parent.entity_type = child.parent_type
     and parent.entity_id = child.parent_id
    where child.parent_type is not null and child.parent_type <> 'project'
  )
  select array_agg(entity_id order by depth desc)
  into v_path
  from lineage;
  if cardinality(v_path) <> v_expected_depth then return null; end if;
  return v_path;
end;
$function$;

create function private.authoring_design_scope_entity_version_v1(
  p_workspace_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select case when p_scope_kind = 'workspace' then null
    else (
      select entity.version
      from private.authoring_workspace_entities entity
      where entity.workspace_id = p_workspace_id
        and entity.entity_type = p_scope_kind
        and entity.entity_id = p_scope_ref
    ) end
$function$;

create function private.valid_authoring_parameter_value_v1(
  p_parameter_id text,
  p_parameter_version text,
  p_value jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_definition private.authoring_design_parameter_definitions%rowtype;
  v_kind text;
  v_minimum numeric;
  v_maximum numeric;
  v_pattern text;
begin
  select * into v_definition
  from private.authoring_design_parameter_definitions definition
  where definition.parameter_id = p_parameter_id
    and definition.parameter_version = p_parameter_version;
  if not found or jsonb_typeof(p_value) <> 'object'
     or private.authoring_design_contains_forbidden_key_v1(p_value) then
    return false;
  end if;
  v_kind := p_value->>'kind';
  if v_kind <> v_definition.value_kind then return false; end if;
  if v_kind = 'integer' then
    if not (p_value ?& array['kind','value'])
       or exists (
         select 1 from jsonb_object_keys(p_value) field_name
         where field_name not in ('kind','value')
       )
       or jsonb_typeof(p_value->'value') <> 'number'
       or p_value->>'value' !~ '^-?[0-9]+$' then return false; end if;
    v_minimum := nullif(v_definition.definition#>>'{constraints,minimum}', '')::numeric;
    v_maximum := nullif(v_definition.definition#>>'{constraints,maximum}', '')::numeric;
    if (v_minimum is not null and (p_value->>'value')::numeric < v_minimum)
       or (v_maximum is not null and (p_value->>'value')::numeric > v_maximum)
    then return false; end if;
  elsif v_kind = 'range' then
    if not (p_value ?& array['kind','minimum','maximum'])
       or exists (
         select 1 from jsonb_object_keys(p_value) field_name
         where field_name not in ('kind','minimum','maximum')
       )
       or jsonb_typeof(p_value->'minimum') <> 'number'
       or jsonb_typeof(p_value->'maximum') <> 'number'
       or (p_value->>'minimum')::numeric > (p_value->>'maximum')::numeric
    then return false; end if;
    v_minimum := nullif(v_definition.definition#>>'{constraints,minimum}', '')::numeric;
    v_maximum := nullif(v_definition.definition#>>'{constraints,maximum}', '')::numeric;
    if (v_minimum is not null and (p_value->>'minimum')::numeric < v_minimum)
       or (v_maximum is not null and (p_value->>'maximum')::numeric > v_maximum)
    then return false; end if;
  elsif v_kind = 'enum' then
    if not (p_value ?& array['kind','value'])
       or exists (
         select 1 from jsonb_object_keys(p_value) field_name
         where field_name not in ('kind','value')
       )
       or jsonb_typeof(p_value->'value') <> 'string'
       or not exists (
         select 1
         from jsonb_array_elements_text(
           v_definition.definition#>'{constraints,allowedEnumValues}'
         ) allowed(value)
         where allowed.value = p_value->>'value'
       ) then return false; end if;
  elsif v_kind = 'set' then
    v_pattern := nullif(
      v_definition.definition#>>'{constraints,setItemPattern}', ''
    );
    if not (p_value ?& array['kind','values'])
       or exists (
         select 1 from jsonb_object_keys(p_value) field_name
         where field_name not in ('kind','values')
       )
       or jsonb_typeof(p_value->'values') <> 'array'
       or exists (
         select 1 from jsonb_array_elements(p_value->'values') item
         where jsonb_typeof(item) not in ('string','number','boolean')
           or (jsonb_typeof(item) = 'string'
               and nullif(btrim(item #>> '{}'), '') is null)
           or (v_pattern is not null and (
             jsonb_typeof(item) <> 'string' or item #>> '{}' !~ v_pattern
           ))
       )
       or exists (
         select 1 from jsonb_array_elements(p_value->'values') item
         group by item having count(*) > 1
       ) then return false; end if;
  elsif v_kind = 'vector' then
    if not (p_value ?& array['kind','components'])
       or exists (
         select 1 from jsonb_object_keys(p_value) field_name
         where field_name not in ('kind','components')
       )
       or jsonb_typeof(p_value->'components') <> 'array'
       or jsonb_array_length(p_value->'components') < 1
       or exists (
         select 1 from jsonb_array_elements(p_value->'components') component
         where jsonb_typeof(component) <> 'object'
           or not (component ?& array['dimension','value','unit'])
           or exists (
             select 1 from jsonb_object_keys(component) field_name
             where field_name not in ('dimension','value','unit')
           )
           or nullif(btrim(component->>'dimension'), '') is null
           or jsonb_typeof(component->'value')
             not in ('string','number','boolean')
           or nullif(btrim(component->>'unit'), '') is null
       ) then return false; end if;
  elsif v_kind = 'relation' then
    if not (p_value ?& array['kind','nodes','edges'])
       or exists (
         select 1 from jsonb_object_keys(p_value) field_name
         where field_name not in ('kind','nodes','edges')
       )
       or jsonb_typeof(p_value->'nodes') <> 'array'
       or jsonb_typeof(p_value->'edges') <> 'array'
       or exists (
         select 1 from jsonb_array_elements(p_value->'nodes') node
         where jsonb_typeof(node) <> 'string'
           or nullif(btrim(node #>> '{}'), '') is null
       )
       or exists (
         select 1 from jsonb_array_elements_text(p_value->'nodes') node
         group by node having count(*) > 1
       )
       or exists (
         select 1 from jsonb_array_elements(p_value->'edges') edge
         where jsonb_typeof(edge) <> 'object'
           or not (edge ?& array['from','to','kind'])
           or exists (
             select 1 from jsonb_object_keys(edge) field_name
             where field_name not in ('from','to','kind')
           )
           or not (p_value->'nodes' ? (edge->>'from'))
           or not (p_value->'nodes' ? (edge->>'to'))
           or (
             jsonb_array_length(
               v_definition.definition#>'{constraints,relationKinds}'
             ) > 0
             and not exists (
               select 1
               from jsonb_array_elements_text(
                 v_definition.definition#>'{constraints,relationKinds}'
               ) allowed(kind)
               where allowed.kind = edge->>'kind'
             )
           )
       ) then return false; end if;
  end if;
  return pg_column_size(p_value) <= 65536;
exception
  when others then return false;
end;
$function$;

create function public.save_authoring_instructional_analysis_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_analysis jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_path text[];
  v_scope_entity_version bigint;
  v_next_revision bigint := p_expected_revision + 1;
  v_analysis_hash text;
  v_argument_hash text;
begin
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash externo da mutação é inválido.'
      using errcode = '22023';
  end if;
  v_argument_hash := private.authoring_design_mutation_hash_v1(
    'save_instructional_analysis', p_analysis
  );
  v_gate := private.begin_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'save_instructional_analysis', 'author'
  );
  if (v_gate->>'replayed')::boolean then return v_gate->'result'; end if;
  if not private.valid_authoring_instructional_analysis_v1(p_analysis)
     or (p_analysis#>>'{derivedFrom,workspaceRevision}')::numeric
       <> p_expected_revision then
    raise exception 'Análise instrucional inválida.' using errcode = '22023';
  end if;
  v_scope_kind := p_analysis#>>'{scope,kind}';
  v_scope_ref := p_analysis#>>'{scope,ref}';
  v_scope_path := private.authoring_design_scope_path_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  if v_scope_path is null
     or coalesce(p_analysis#>>'{derivedFrom,scopeEntityVersion}', '')
       is distinct from coalesce(v_scope_entity_version::text, '') then
    raise exception 'Análise instrucional usa escopo ou versão desatualizada.'
      using errcode = '40001';
  end if;
  v_analysis_hash := private.authoring_design_json_hash_v1(p_analysis);
  insert into private.authoring_instructional_analyses(
    workspace_id, analysis_id, analysis_version, model_version,
    scope_kind, scope_ref, scope_path, scope_entity_version,
    based_on_workspace_revision, objective, payload, payload_hash,
    created_revision, created_by
  ) values (
    p_workspace_id, p_analysis->>'id', p_analysis->>'version',
    p_analysis->>'modelVersion', v_scope_kind, v_scope_ref, v_scope_path,
    v_scope_entity_version, p_expected_revision, p_analysis->>'objective',
    p_analysis, v_analysis_hash, v_next_revision, p_actor_id
  );
  return private.complete_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'save_instructional_analysis',
    jsonb_build_object(
      'analysisRef', jsonb_build_object(
        'id', p_analysis->>'id', 'version', p_analysis->>'version'
      ),
      'scope', p_analysis->'scope', 'payloadHash', v_analysis_hash
    ),
    jsonb_build_object(
      'analysisId', p_analysis->>'id',
      'analysisVersion', p_analysis->>'version',
      'scopeKind', v_scope_kind, 'scopeRef', v_scope_ref
    )
  );
end;
$function$;

create function public.manage_authoring_design_parameter_assignment_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_assignment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_gate jsonb;
  v_rpc_operation text;
  v_capability text;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_path text[];
  v_parameter_id text;
  v_parameter_version text;
  v_mode text;
  v_authority_kind text;
  v_authority_ref text;
  v_locked boolean;
  v_rationale text;
  v_provenance_refs text[];
  v_current record;
  v_reference text;
  v_reference_id text;
  v_reference_version text;
  v_argument_hash text;
begin
  if p_operation not in ('set', 'remove')
     or jsonb_typeof(p_assignment) <> 'object' then
    raise exception 'Operação de parâmetro inválida.' using errcode = '22023';
  end if;
  v_mode := case when p_operation = 'set' then p_assignment->>'mode' end;
  v_capability := case when v_mode = 'research_lock' then 'manage' else 'author' end;
  v_rpc_operation := case when p_operation = 'set'
    then 'set_design_parameter' else 'remove_design_parameter' end;
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash externo da mutação é inválido.'
      using errcode = '22023';
  end if;
  v_argument_hash := private.authoring_design_mutation_hash_v1(
    v_rpc_operation, p_assignment
  );
  v_gate := private.begin_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, v_rpc_operation, v_capability
  );
  if (v_gate->>'replayed')::boolean then return v_gate->'result'; end if;
  if not private.authoring_design_closed_object_v1(
       p_assignment,
       case when p_operation = 'set' then array[
         'contract','modelVersion','id','version','definitionRef','scope','mode',
         'value','authority','rationale','provenanceRefs'
       ] else array[
         'id','version','definitionRef','scope','rationale','provenanceRefs'
       ] end,
       case when p_operation = 'set' then array[
         'contract','modelVersion','id','version','definitionRef','scope','mode',
         'value','authority','rationale','provenanceRefs'
       ] else array[
         'id','version','definitionRef','scope','rationale','provenanceRefs'
       ] end
     )
     or nullif(btrim(p_assignment->>'id'), '') is null
     or nullif(btrim(p_assignment->>'version'), '') is null
     or not private.authoring_design_closed_object_v1(
       p_assignment->'definitionRef', array['id','version'], array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_assignment->'scope', array['kind','ref'], array['kind','ref']
     )
     or nullif(btrim(p_assignment->>'rationale'), '') is null
     or not private.authoring_design_text_array_v1(p_assignment->'provenanceRefs')
     or private.authoring_design_contains_forbidden_key_v1(p_assignment)
     or pg_column_size(p_assignment) > 65536 then
    raise exception 'Atribuição de parâmetro inválida.' using errcode = '22023';
  end if;
  v_parameter_id := p_assignment#>>'{definitionRef,id}';
  v_parameter_version := p_assignment#>>'{definitionRef,version}';
  v_scope_kind := p_assignment#>>'{scope,kind}';
  v_scope_ref := p_assignment#>>'{scope,ref}';
  v_scope_path := private.authoring_design_scope_path_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  if v_scope_path is null or not exists (
    select 1 from private.authoring_design_parameter_definitions definition
    where definition.parameter_id = v_parameter_id
      and definition.parameter_version = v_parameter_version
      and v_scope_kind = any(definition.supported_scopes)
  ) then
    raise exception 'Definição ou escopo do parâmetro é inválido.'
      using errcode = '22023';
  end if;
  select * into v_current
  from private.current_authoring_design_parameter_assignments_v1 assignment
  where assignment.workspace_id = p_workspace_id
    and assignment.assignment_id = p_assignment->>'id'
  order by assignment.created_revision desc limit 1;

  if found and v_current.mode = 'research_lock' then
    perform private.require_educational_workspace_capability_v1(
      p_workspace_id, p_actor_id, 'manage'
    );
  end if;
  if found and (
    v_current.parameter_id <> v_parameter_id
    or v_current.parameter_version <> v_parameter_version
    or v_current.scope_kind <> v_scope_kind
    or v_current.scope_ref <> v_scope_ref
  ) then
    raise exception 'A identidade de uma atribuição versionada é imutável.'
      using errcode = '22023';
  end if;

  if p_operation = 'set' then
    if p_assignment->>'contract' is distinct from 'DesignParameterAssignment@1'
       or p_assignment->>'modelVersion' is distinct from '1.0.0'
       or p_assignment->>'mode' not in (
         'auto', 'manual_override', 'research_lock'
       )
       or not private.authoring_design_closed_object_v1(
         p_assignment->'authority',
         array['kind','actorRef','locked'], array['kind','actorRef','locked']
       )
       or jsonb_typeof(p_assignment#>'{authority,locked}') <> 'boolean'
       or not private.valid_authoring_parameter_value_v1(
         v_parameter_id, v_parameter_version, p_assignment->'value'
       ) then
      raise exception 'Valor ou autoridade do parâmetro é inválido.'
        using errcode = '22023';
    end if;
    v_authority_kind := p_assignment#>>'{authority,kind}';
    v_authority_ref := nullif(p_assignment#>>'{authority,actorRef}', '');
    v_locked := coalesce((p_assignment#>>'{authority,locked}')::boolean, false);
    if not (
      (v_mode = 'auto' and v_authority_kind = 'gpt' and not v_locked)
      or (v_mode = 'manual_override' and v_authority_kind = 'author' and not v_locked)
      or (v_mode = 'research_lock'
          and v_authority_kind = 'research_protocol' and v_locked)
    ) then
      raise exception 'Autoridade do parâmetro diverge do modo.'
        using errcode = '22023';
    end if;
    p_assignment := jsonb_set(
      p_assignment,
      array['value']::text[],
      private.canonical_authoring_parameter_value_v1(p_assignment->'value')
    );
    if exists (
      select 1
      from private.current_authoring_design_parameter_assignments_v1 assignment
      where assignment.workspace_id = p_workspace_id
        and assignment.parameter_id = v_parameter_id
        and assignment.parameter_version = v_parameter_version
        and assignment.scope_kind = v_scope_kind
        and assignment.scope_ref = v_scope_ref
        and assignment.mode = v_mode
        and assignment.assignment_id <> p_assignment->>'id'
    ) then
      raise exception 'Conflito de atribuição do parâmetro no mesmo escopo.'
        using errcode = '23505';
    end if;
    if v_parameter_id = 'available_resource_set_refs' then
      for v_reference in
        select value #>> '{}'
        from jsonb_array_elements(p_assignment#>'{value,values}') value
      loop
        v_reference_id := split_part(v_reference, '@', 1);
        v_reference_version := substring(
          v_reference from char_length(v_reference_id) + 2
        );
        if v_reference_id = '' or v_reference_version = '' or not exists (
          select 1 from private.authoring_resource_sets resource_set
          where resource_set.workspace_id = p_workspace_id
            and resource_set.resource_set_id = v_reference_id
            and resource_set.resource_set_version = v_reference_version
        ) then
          raise exception 'ResourceSet atribuído não existe: %.', v_reference
            using errcode = '23503';
        end if;
      end loop;
    end if;
  else
    if not found then
      raise exception 'Atribuição corrente inexistente.' using errcode = 'P0002';
    end if;
    v_authority_kind := v_current.authority_kind;
    v_authority_ref := v_current.authority_ref;
    v_locked := v_current.locked;
  end if;
  v_rationale := btrim(coalesce(p_assignment->>'rationale', 'Remoção explícita.'));
  select coalesce(array_agg(value), '{}') into v_provenance_refs
  from jsonb_array_elements_text(
    coalesce(p_assignment->'provenanceRefs', '[]'::jsonb)
  ) value;
  insert into private.authoring_design_parameter_assignments(
    workspace_id, assignment_id, assignment_version, model_version, action,
    parameter_id, parameter_version, scope_kind, scope_ref, scope_path,
    mode, value, authority_kind, authority_actor_id, authority_ref, locked,
    rationale, provenance_refs, based_on_workspace_revision,
    created_revision, created_by
  ) values (
    p_workspace_id, p_assignment->>'id', p_assignment->>'version',
    case when p_operation = 'set' then p_assignment->>'modelVersion'
      else v_current.model_version end,
    p_operation,
    v_parameter_id, v_parameter_version, v_scope_kind, v_scope_ref, v_scope_path,
    case when p_operation = 'set' then v_mode end,
    case when p_operation = 'set' then p_assignment->'value' end,
    v_authority_kind,
    case when v_authority_kind in ('author','research_protocol')
      then p_actor_id end,
    v_authority_ref, v_locked, v_rationale, v_provenance_refs,
    p_expected_revision, p_expected_revision + 1, p_actor_id
  );
  return private.complete_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, v_rpc_operation,
    jsonb_build_object(
      'assignmentRef', jsonb_build_object(
        'id', p_assignment->>'id', 'version', p_assignment->>'version'
      ),
      'assignmentOperation', p_operation,
      'definitionRef', p_assignment->'definitionRef',
      'scope', p_assignment->'scope'
    ),
    jsonb_build_object(
      'assignmentId', p_assignment->>'id',
      'assignmentVersion', p_assignment->>'version',
      'assignmentOperation', p_operation,
      'parameterId', v_parameter_id,
      'scopeKind', v_scope_kind, 'scopeRef', v_scope_ref
    )
  );
end;
$function$;

create function public.save_authoring_resource_set_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_resource_set jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_path text[];
  v_scope_entity_version bigint;
  v_allowed_fits text[];
  v_provenance_refs text[];
  v_package jsonb;
  v_ordinal integer := 0;
  v_hash text;
  v_argument_hash text;
begin
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash externo da mutação é inválido.'
      using errcode = '22023';
  end if;
  v_argument_hash := private.authoring_design_mutation_hash_v1(
    'save_resource_set', p_resource_set
  );
  v_gate := private.begin_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'save_resource_set', 'author'
  );
  if (v_gate->>'replayed')::boolean then return v_gate->'result'; end if;
  if not private.authoring_design_closed_object_v1(
       p_resource_set,
       array[
         'contract','modelVersion','id','version','scope','packages',
         'resolvedCatalogVersion','facetBasis','selectionConstraints',
         'provenanceRefs'
       ],
       array[
         'contract','modelVersion','id','version','scope','packages',
         'resolvedCatalogVersion','facetBasis','selectionConstraints',
         'provenanceRefs'
       ]
     )
     or p_resource_set->>'contract' is distinct from 'ResourceSet@1'
     or p_resource_set->>'modelVersion' is distinct from '1.0.0'
     or nullif(btrim(p_resource_set->>'id'), '') is null
     or nullif(btrim(p_resource_set->>'version'), '') is null
     or not private.authoring_design_closed_object_v1(
       p_resource_set->'scope', array['kind','ref'], array['kind','ref']
     )
     or jsonb_typeof(p_resource_set->'packages') is distinct from 'array'
     or jsonb_array_length(p_resource_set->'packages') not between 1 and 4096
     or not private.authoring_design_closed_object_v1(
       p_resource_set->'facetBasis',
       array[
         'catalogVersion','families','disciplines','structures',
         'cognitiveOperations','practiceModalities'
       ],
       array[
         'catalogVersion','families','disciplines','structures',
         'cognitiveOperations','practiceModalities'
       ]
     )
     or not private.authoring_design_closed_object_v1(
       p_resource_set->'selectionConstraints',
       array[
         'allowedFits','allowEmbeddedPractice','allowResponsePackages',
         'onNoAdequateRepresentation'
       ],
       array[
         'allowedFits','allowEmbeddedPractice','allowResponsePackages',
         'onNoAdequateRepresentation'
       ]
     )
     or jsonb_typeof(p_resource_set#>'{selectionConstraints,allowedFits}')
       is distinct from 'array'
     or jsonb_typeof(
       p_resource_set#>'{selectionConstraints,allowEmbeddedPractice}'
     ) is distinct from 'boolean'
     or jsonb_typeof(
       p_resource_set#>'{selectionConstraints,allowResponsePackages}'
     ) is distinct from 'boolean'
     or not private.authoring_design_text_array_v1(
       p_resource_set->'provenanceRefs'
     )
     or private.authoring_design_contains_forbidden_key_v1(p_resource_set)
     or pg_column_size(p_resource_set) > 524288 then
    raise exception 'ResourceSet inválido.' using errcode = '22023';
  end if;
  v_scope_kind := p_resource_set#>>'{scope,kind}';
  v_scope_ref := p_resource_set#>>'{scope,ref}';
  v_scope_path := private.authoring_design_scope_path_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  if v_scope_path is null then
    raise exception 'Escopo do ResourceSet inexistente.' using errcode = 'P0002';
  end if;
  select array_agg(value order by value) into v_allowed_fits
  from jsonb_array_elements_text(
    p_resource_set#>'{selectionConstraints,allowedFits}'
  ) value;
  select coalesce(array_agg(value), '{}') into v_provenance_refs
  from jsonb_array_elements_text(
    coalesce(p_resource_set->'provenanceRefs', '[]'::jsonb)
  ) value;
  if cardinality(v_allowed_fits) not between 1 and 3
     or not (v_allowed_fits <@ array['canonical','versatile','substitute']::text[])
     or exists (
       select 1
       from jsonb_array_elements_text(
         p_resource_set#>'{selectionConstraints,allowedFits}'
       ) fit
       group by fit having count(*) > 1
     )
     or p_resource_set->>'resolvedCatalogVersion'
       is distinct from p_resource_set#>>'{facetBasis,catalogVersion}'
     or p_resource_set#>>'{selectionConstraints,onNoAdequateRepresentation}'
       not in ('block','record_limitation')
     or exists (
       select 1
       from jsonb_array_elements(p_resource_set->'packages') package
       where jsonb_typeof(package) <> 'object'
         or not (package ?& array['packageId','version'])
         or exists (
           select 1 from jsonb_object_keys(package) field_name
           where field_name not in ('packageId','version')
         )
         or package->>'packageId' !~
           '^aralearn\.(resource|response)\.[a-z0-9_]+$'
         or package->>'version' !~
           '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
     )
     or exists (
       select 1
       from jsonb_array_elements(p_resource_set->'packages') package
       group by package->>'packageId', package->>'version'
       having count(*) > 1
     ) then
    raise exception 'Packages ou política do ResourceSet são inválidos.'
      using errcode = '22023';
  end if;
  v_hash := private.authoring_design_json_hash_v1(p_resource_set);
  insert into private.authoring_resource_sets(
    workspace_id, resource_set_id, resource_set_version, model_version,
    scope_kind, scope_ref, scope_path, scope_entity_version,
    resolved_catalog_version,
    facet_basis, allowed_fits, allow_embedded_practice,
    allow_response_packages, no_adequate_representation,
    provenance_refs, payload_hash, based_on_workspace_revision,
    created_revision, created_by
  ) values (
    p_workspace_id, p_resource_set->>'id', p_resource_set->>'version',
    p_resource_set->>'modelVersion', v_scope_kind, v_scope_ref, v_scope_path,
    v_scope_entity_version, p_resource_set->>'resolvedCatalogVersion',
    p_resource_set->'facetBasis',
    v_allowed_fits,
    (p_resource_set#>>'{selectionConstraints,allowEmbeddedPractice}')::boolean,
    (p_resource_set#>>'{selectionConstraints,allowResponsePackages}')::boolean,
    p_resource_set#>>'{selectionConstraints,onNoAdequateRepresentation}',
    v_provenance_refs, v_hash, p_expected_revision,
    p_expected_revision + 1, p_actor_id
  );
  for v_package in select value from jsonb_array_elements(p_resource_set->'packages')
  loop
    v_ordinal := v_ordinal + 1;
    insert into private.authoring_resource_set_members(
      workspace_id, resource_set_id, resource_set_version,
      package_id, package_version, ordinal
    ) values (
      p_workspace_id, p_resource_set->>'id', p_resource_set->>'version',
      v_package->>'packageId', v_package->>'version', v_ordinal
    );
  end loop;
  return private.complete_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'save_resource_set',
    jsonb_build_object(
      'resourceSetRef', jsonb_build_object(
        'id', p_resource_set->>'id', 'version', p_resource_set->>'version'
      ),
      'packageCount', v_ordinal, 'payloadHash', v_hash
    ),
    jsonb_build_object(
      'resourceSetId', p_resource_set->>'id',
      'resourceSetVersion', p_resource_set->>'version',
      'scopeKind', v_scope_kind, 'scopeRef', v_scope_ref,
      'packageCount', v_ordinal
    )
  );
end;
$function$;

create function private.resolve_authoring_design_values_v1(
  p_workspace_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_path text[];
  v_resolution_path jsonb := '[]'::jsonb;
  v_resolved jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_resource_refs text[] := '{}';
  v_definition private.authoring_design_parameter_definitions%rowtype;
  v_resource_set private.authoring_resource_sets%rowtype;
  v_assignment record;
  v_conflict record;
  v_value jsonb;
  v_assignment_mode text;
  v_assignment_ref jsonb;
  v_source_kind text;
  v_source_ref text;
  v_inheritance text;
  v_rationale text;
  v_provenance_refs text[];
  v_reference text;
  v_reference_id text;
  v_reference_version text;
begin
  v_path := private.authoring_design_scope_path_v1(
    p_workspace_id, p_scope_kind, p_scope_ref
  );
  if v_path is null then
    return jsonb_build_object(
      'status', 'conflict',
      'conflicts', jsonb_build_array(jsonb_build_object(
        'code', 'scope_not_found', 'scopeKind', p_scope_kind,
        'scopeRef', p_scope_ref
      ))
    );
  end if;
  v_resolution_path := jsonb_build_array(jsonb_build_object(
    'kind', 'workspace', 'ref', p_workspace_id::text
  ));
  if cardinality(v_path) >= 1 then
    v_resolution_path := v_resolution_path || jsonb_build_array(
      jsonb_build_object('kind', 'course', 'ref', v_path[1])
    );
  end if;
  if cardinality(v_path) >= 2 then
    v_resolution_path := v_resolution_path || jsonb_build_array(
      jsonb_build_object('kind', 'module', 'ref', v_path[2])
    );
  end if;
  if cardinality(v_path) >= 3 then
    v_resolution_path := v_resolution_path || jsonb_build_array(
      jsonb_build_object('kind', 'lesson', 'ref', v_path[3])
    );
  end if;
  if cardinality(v_path) >= 4 then
    v_resolution_path := v_resolution_path || jsonb_build_array(
      jsonb_build_object('kind', 'microsequence', 'ref', v_path[4])
    );
  end if;

  for v_definition in
    select * from private.authoring_design_parameter_definitions definition
    where p_scope_kind = any(definition.supported_scopes)
    order by definition.parameter_id, definition.parameter_version
  loop
    for v_conflict in
      select assignment.scope_kind, assignment.scope_ref, assignment.mode,
        count(*) as assignment_count
      from private.current_authoring_design_parameter_assignments_v1 assignment
      where assignment.workspace_id = p_workspace_id
        and assignment.parameter_id = v_definition.parameter_id
        and assignment.parameter_version = v_definition.parameter_version
        and (
          (assignment.scope_kind = 'workspace'
           and assignment.scope_ref = p_workspace_id::text)
          or (assignment.scope_kind = 'course' and assignment.scope_ref = v_path[1])
          or (assignment.scope_kind = 'module' and assignment.scope_ref = v_path[2])
          or (assignment.scope_kind = 'lesson' and assignment.scope_ref = v_path[3])
          or (assignment.scope_kind = 'microsequence' and assignment.scope_ref = v_path[4])
        )
      group by assignment.scope_kind, assignment.scope_ref, assignment.mode
      having count(*) > 1
    loop
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'same_scope_assignment_conflict',
        'parameterId', v_definition.parameter_id,
        'scope', jsonb_build_object(
          'kind', v_conflict.scope_kind, 'ref', v_conflict.scope_ref
        ),
        'assignmentMode', v_conflict.mode,
        'count', v_conflict.assignment_count
      ));
    end loop;
    if (
      select count(distinct assignment.value) > 1
      from private.current_authoring_design_parameter_assignments_v1 assignment
      where assignment.workspace_id = p_workspace_id
        and assignment.parameter_id = v_definition.parameter_id
        and assignment.parameter_version = v_definition.parameter_version
        and assignment.mode = 'research_lock'
        and (
          (assignment.scope_kind = 'workspace'
           and assignment.scope_ref = p_workspace_id::text)
          or (assignment.scope_kind = 'course' and assignment.scope_ref = v_path[1])
          or (assignment.scope_kind = 'module' and assignment.scope_ref = v_path[2])
          or (assignment.scope_kind = 'lesson' and assignment.scope_ref = v_path[3])
          or (assignment.scope_kind = 'microsequence' and assignment.scope_ref = v_path[4])
        )
    ) then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'research_lock_conflict',
        'parameterId', v_definition.parameter_id
      ));
    end if;

    select assignment.* into v_assignment
    from private.current_authoring_design_parameter_assignments_v1 assignment
    where assignment.workspace_id = p_workspace_id
      and assignment.parameter_id = v_definition.parameter_id
      and assignment.parameter_version = v_definition.parameter_version
      and (
        (assignment.scope_kind = 'workspace'
         and assignment.scope_ref = p_workspace_id::text)
        or (assignment.scope_kind = 'course' and assignment.scope_ref = v_path[1])
        or (assignment.scope_kind = 'module' and assignment.scope_ref = v_path[2])
        or (assignment.scope_kind = 'lesson' and assignment.scope_ref = v_path[3])
        or (assignment.scope_kind = 'microsequence' and assignment.scope_ref = v_path[4])
      )
    order by case assignment.mode
        when 'research_lock' then 2
        when 'manual_override' then 1
        else 0
      end desc,
      case assignment.scope_kind
        when 'microsequence' then 4 when 'lesson' then 3
        when 'module' then 2 when 'course' then 1 else 0 end desc,
      assignment.created_revision desc,
      assignment.assignment_id, assignment.assignment_version
    limit 1;
    if found then
      if v_assignment.mode = 'research_lock' then
        for v_conflict in
          select assignment.assignment_id, assignment.assignment_version,
            assignment.scope_kind, assignment.scope_ref,
            blocker.assignment_id as lock_assignment_id,
            blocker.assignment_version as lock_assignment_version
          from private.current_authoring_design_parameter_assignments_v1 assignment
          join lateral (
            select lock_assignment.assignment_id,
              lock_assignment.assignment_version
            from private.current_authoring_design_parameter_assignments_v1
              lock_assignment
            where lock_assignment.workspace_id = p_workspace_id
              and lock_assignment.parameter_id = v_definition.parameter_id
              and lock_assignment.parameter_version = v_definition.parameter_version
              and lock_assignment.mode = 'research_lock'
              and lock_assignment.value <> assignment.value
              and (
                (lock_assignment.scope_kind = 'workspace'
                 and lock_assignment.scope_ref = p_workspace_id::text)
                or (lock_assignment.scope_kind = 'course'
                    and lock_assignment.scope_ref = v_path[1])
                or (lock_assignment.scope_kind = 'module'
                    and lock_assignment.scope_ref = v_path[2])
                or (lock_assignment.scope_kind = 'lesson'
                    and lock_assignment.scope_ref = v_path[3])
                or (lock_assignment.scope_kind = 'microsequence'
                    and lock_assignment.scope_ref = v_path[4])
              )
              and case lock_assignment.scope_kind
                when 'microsequence' then 4 when 'lesson' then 3
                when 'module' then 2 when 'course' then 1 else 0 end
                <= case assignment.scope_kind
                  when 'microsequence' then 4 when 'lesson' then 3
                  when 'module' then 2 when 'course' then 1 else 0 end
            order by case lock_assignment.scope_kind
                when 'microsequence' then 4 when 'lesson' then 3
                when 'module' then 2 when 'course' then 1 else 0 end desc,
              lock_assignment.created_revision desc,
              lock_assignment.assignment_id,
              lock_assignment.assignment_version
            limit 1
          ) blocker on true
          where assignment.workspace_id = p_workspace_id
            and assignment.parameter_id = v_definition.parameter_id
            and assignment.parameter_version = v_definition.parameter_version
            and assignment.mode <> 'research_lock'
            and (
              (assignment.scope_kind = 'workspace'
               and assignment.scope_ref = p_workspace_id::text)
              or (assignment.scope_kind = 'course'
                  and assignment.scope_ref = v_path[1])
              or (assignment.scope_kind = 'module'
                  and assignment.scope_ref = v_path[2])
              or (assignment.scope_kind = 'lesson'
                  and assignment.scope_ref = v_path[3])
              or (assignment.scope_kind = 'microsequence'
                  and assignment.scope_ref = v_path[4])
            )
        loop
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'code', 'research_lock_blocks_lower_assignment',
            'parameterId', v_definition.parameter_id,
            'lockAssignmentRef', jsonb_build_object(
              'id', v_conflict.lock_assignment_id,
              'version', v_conflict.lock_assignment_version
            ),
            'blockedAssignmentRef', jsonb_build_object(
              'id', v_conflict.assignment_id,
              'version', v_conflict.assignment_version
            ),
            'blockedScope', jsonb_build_object(
              'kind', v_conflict.scope_kind, 'ref', v_conflict.scope_ref
            )
          ));
        end loop;
      end if;
      v_value := v_assignment.value;
      v_assignment_mode := v_assignment.mode;
      v_assignment_ref := jsonb_build_object(
        'id', v_assignment.assignment_id,
        'version', v_assignment.assignment_version
      );
      v_source_kind := v_assignment.scope_kind;
      v_source_ref := v_assignment.scope_ref;
      v_inheritance := case when v_source_kind = p_scope_kind
        and v_source_ref = p_scope_ref then 'local' else 'inherited' end;
      v_rationale := v_assignment.rationale;
      v_provenance_refs := v_assignment.provenance_refs;
    elsif v_definition.default_value is not null then
      v_value := v_definition.default_value;
      v_assignment_mode := 'default';
      v_assignment_ref := null;
      v_source_kind := 'workspace';
      v_source_ref := p_workspace_id::text;
      v_inheritance := case when p_scope_kind = 'workspace'
        then 'local' else 'inherited' end;
      v_rationale := 'Default versionado da definição.';
      v_provenance_refs := array[
        'parameter-definition:' || v_definition.parameter_id || '@'
          || v_definition.parameter_version
      ];
    else
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'unresolved_parameter',
        'parameterId', v_definition.parameter_id,
        'parameterVersion', v_definition.parameter_version
      ));
      continue;
    end if;
    v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
      'definitionRef', jsonb_build_object(
        'id', v_definition.parameter_id,
        'version', v_definition.parameter_version
      ),
      'value', v_value,
      'resolution', jsonb_build_object(
        'assignmentMode', v_assignment_mode,
        'inheritance', v_inheritance,
        'assignmentRef', v_assignment_ref,
        'sourceScope', jsonb_build_object(
          'kind', v_source_kind, 'ref', v_source_ref
        ),
        'rationale', v_rationale,
        'provenanceRefs', to_jsonb(v_provenance_refs)
      )
    ));
    if v_definition.parameter_id = 'available_resource_set_refs' then
      for v_reference in
        select value #>> '{}' from jsonb_array_elements(v_value->'values') value
      loop
        v_resource_refs := array_append(v_resource_refs, v_reference);
        v_reference_id := split_part(v_reference, '@', 1);
        v_reference_version := substring(
          v_reference from char_length(v_reference_id) + 2
        );
        select * into v_resource_set
        from private.authoring_resource_sets resource_set
        where resource_set.workspace_id = p_workspace_id
          and resource_set.resource_set_id = v_reference_id
          and resource_set.resource_set_version = v_reference_version;
        if not found then
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'code', 'resource_set_not_found', 'resourceSetRef', v_reference
          ));
        elsif not (
          (v_resource_set.scope_kind = 'workspace'
           and v_resource_set.scope_ref = p_workspace_id::text)
          or (v_resource_set.scope_kind = 'course'
              and v_resource_set.scope_ref = v_path[1])
          or (v_resource_set.scope_kind = 'module'
              and v_resource_set.scope_ref = v_path[2])
          or (v_resource_set.scope_kind = 'lesson'
              and v_resource_set.scope_ref = v_path[3])
          or (v_resource_set.scope_kind = 'microsequence'
              and v_resource_set.scope_ref = v_path[4])
        ) then
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'code', 'resource_set_outside_scope',
            'resourceSetRef', v_reference,
            'resourceSetScope', jsonb_build_object(
              'kind', v_resource_set.scope_kind,
              'ref', v_resource_set.scope_ref
            )
          ));
        elsif v_resource_set.scope_path is distinct from
            private.authoring_design_scope_path_v1(
              p_workspace_id, v_resource_set.scope_kind,
              v_resource_set.scope_ref
            )
          or v_resource_set.scope_entity_version is distinct from
            private.authoring_design_scope_entity_version_v1(
              p_workspace_id, v_resource_set.scope_kind,
              v_resource_set.scope_ref
            ) then
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'code', 'stale_resource_set', 'resourceSetRef', v_reference
          ));
        end if;
      end loop;
    end if;
  end loop;
  select coalesce(array_agg(distinct reference order by reference), '{}')
  into v_resource_refs from unnest(v_resource_refs) reference;
  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object(
      'status', 'conflict', 'conflicts', v_conflicts,
      'resolutionPath', v_resolution_path
    );
  end if;
  return jsonb_build_object(
    'status', 'resolved',
    'parameterCatalogVersion', '1.0.0',
    'resolutionVersion', '1.0.0',
    'resolutionPath', v_resolution_path,
    'resolvedValues', v_resolved,
    'resourceSetRefs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', split_part(reference, '@', 1),
        'version', substring(reference from
          char_length(split_part(reference, '@', 1)) + 2)
      ) order by reference)
      from unnest(v_resource_refs) reference
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.preview_authoring_effective_design_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  return private.resolve_authoring_design_values_v1(
    p_workspace_id, p_scope_kind, p_scope_ref
  );
end;
$function$;

create function public.resolve_authoring_effective_design_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_resolution jsonb;
  v_analysis private.authoring_instructional_analyses%rowtype;
  v_scope_kind text;
  v_scope_ref text;
  v_scope_path text[];
  v_scope_entity_version bigint;
  v_snapshot_payload jsonb;
  v_hash text;
  v_frozen_at timestamptz := statement_timestamp();
  v_item jsonb;
  v_set_ref jsonb;
  v_ordinal integer := 0;
  v_argument_hash text;
begin
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash externo da mutação é inválido.'
      using errcode = '22023';
  end if;
  v_argument_hash := private.authoring_design_mutation_hash_v1(
    'resolve_effective_design', p_snapshot
  );
  v_gate := private.begin_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'resolve_effective_design', 'author'
  );
  if (v_gate->>'replayed')::boolean then return v_gate->'result'; end if;
  if not private.authoring_design_closed_object_v1(
       p_snapshot,
       array['contract','modelVersion','id','version','scope','analysisRef'],
       array['contract','modelVersion','id','version','scope','analysisRef']
     )
     or p_snapshot->>'contract' is distinct from 'EffectiveDesignSnapshot@1'
     or nullif(btrim(p_snapshot->>'id'), '') is null
     or nullif(btrim(p_snapshot->>'version'), '') is null
     or p_snapshot->>'modelVersion' is distinct from '1.0.0'
     or not private.authoring_design_closed_object_v1(
       p_snapshot->'scope', array['kind','ref'], array['kind','ref']
     )
     or not private.authoring_design_closed_object_v1(
       p_snapshot->'analysisRef', array['id','version'], array['id','version']
     ) then
    raise exception 'Identidade do snapshot inválida.' using errcode = '22023';
  end if;
  v_scope_kind := p_snapshot#>>'{scope,kind}';
  v_scope_ref := p_snapshot#>>'{scope,ref}';
  v_scope_path := private.authoring_design_scope_path_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  select * into v_analysis
  from private.authoring_instructional_analyses analysis
  where analysis.workspace_id = p_workspace_id
    and analysis.analysis_id = p_snapshot#>>'{analysisRef,id}'
    and analysis.analysis_version = p_snapshot#>>'{analysisRef,version}'
    and analysis.scope_kind = v_scope_kind
    and analysis.scope_ref = v_scope_ref;
  if not found or v_scope_path is null then
    raise exception 'Análise ou escopo do snapshot inexistente.'
      using errcode = '23503';
  end if;
  if v_analysis.scope_path <> v_scope_path
     or v_analysis.scope_entity_version
       is distinct from v_scope_entity_version then
    raise exception 'Análise do snapshot está desatualizada para o escopo.'
      using errcode = '40001';
  end if;
  v_resolution := private.resolve_authoring_design_values_v1(
    p_workspace_id, v_scope_kind, v_scope_ref
  );
  if v_resolution->>'status' <> 'resolved' then
    return v_resolution || jsonb_build_object('idempotent', false);
  end if;
  v_snapshot_payload := jsonb_build_object(
    'contract', 'EffectiveDesignSnapshot@1',
    'modelVersion', p_snapshot->>'modelVersion',
    'id', p_snapshot->>'id',
    'version', p_snapshot->>'version',
    'scope', p_snapshot->'scope',
    'analysisRef', p_snapshot->'analysisRef',
    'parameterCatalogVersion', v_resolution->>'parameterCatalogVersion',
    'basedOnWorkspaceRevision', p_expected_revision,
    'scopeEntityVersion', to_jsonb(v_scope_entity_version),
    'resolutionVersion', v_resolution->>'resolutionVersion',
    'resolutionPath', v_resolution->'resolutionPath',
    'resolvedValues', v_resolution->'resolvedValues',
    'resourceSetRefs', v_resolution->'resourceSetRefs',
    'frozenAt', v_frozen_at
  );
  v_hash := private.authoring_design_json_hash_v1(v_snapshot_payload);
  insert into private.authoring_effective_design_snapshots(
    workspace_id, snapshot_id, snapshot_version, model_version,
    scope_kind, scope_ref, scope_path, scope_entity_version,
    analysis_id, analysis_version, parameter_catalog_version,
    resolution_version, based_on_workspace_revision, created_revision,
    payload_hash, frozen_at, created_by
  ) values (
    p_workspace_id, p_snapshot->>'id', p_snapshot->>'version',
    p_snapshot->>'modelVersion', v_scope_kind, v_scope_ref, v_scope_path,
    v_scope_entity_version, v_analysis.analysis_id, v_analysis.analysis_version,
    v_resolution->>'parameterCatalogVersion',
    v_resolution->>'resolutionVersion', p_expected_revision,
    p_expected_revision + 1, v_hash, v_frozen_at, p_actor_id
  );
  for v_item in select value from jsonb_array_elements(v_resolution->'resolvedValues')
  loop
    insert into private.authoring_effective_design_snapshot_values(
      workspace_id, snapshot_id, snapshot_version,
      parameter_id, parameter_version, value,
      assignment_mode, inheritance_kind, assignment_id, assignment_version,
      source_scope_kind, source_scope_ref, rationale, provenance_refs
    ) values (
      p_workspace_id, p_snapshot->>'id', p_snapshot->>'version',
      v_item#>>'{definitionRef,id}', v_item#>>'{definitionRef,version}',
      v_item->'value', v_item#>>'{resolution,assignmentMode}',
      v_item#>>'{resolution,inheritance}',
      nullif(v_item#>>'{resolution,assignmentRef,id}', ''),
      nullif(v_item#>>'{resolution,assignmentRef,version}', ''),
      v_item#>>'{resolution,sourceScope,kind}',
      v_item#>>'{resolution,sourceScope,ref}',
      v_item#>>'{resolution,rationale}',
      array(select value from jsonb_array_elements_text(
        v_item#>'{resolution,provenanceRefs}'
      ) value)
    );
  end loop;
  for v_set_ref in select value from jsonb_array_elements(v_resolution->'resourceSetRefs')
  loop
    v_ordinal := v_ordinal + 1;
    insert into private.authoring_effective_design_snapshot_resource_sets(
      workspace_id, snapshot_id, snapshot_version,
      resource_set_id, resource_set_version, ordinal
    ) values (
      p_workspace_id, p_snapshot->>'id', p_snapshot->>'version',
      v_set_ref->>'id', v_set_ref->>'version', v_ordinal
    );
  end loop;
  return private.complete_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'resolve_effective_design',
    jsonb_build_object(
      'snapshotRef', jsonb_build_object(
        'id', p_snapshot->>'id', 'version', p_snapshot->>'version'
      ),
      'payloadHash', v_hash
    ),
    jsonb_build_object(
      'snapshotId', p_snapshot->>'id',
      'snapshotVersion', p_snapshot->>'version',
      'scopeKind', v_scope_kind, 'scopeRef', v_scope_ref,
      'parameterCount', jsonb_array_length(v_resolution->'resolvedValues'),
      'resourceSetCount', v_ordinal
    )
  );
end;
$function$;

create function public.save_authoring_pedagogical_blueprint_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_blueprint jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_scope_ref text;
  v_scope_path text[];
  v_scope_entity_version bigint;
  v_analysis private.authoring_instructional_analyses%rowtype;
  v_snapshot private.authoring_effective_design_snapshots%rowtype;
  v_payload jsonb;
  v_binding_payload jsonb;
  v_hash text;
  v_binding_hash text;
  v_current_resolution jsonb;
  v_snapshot_payload jsonb;
  v_argument_hash text;
begin
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash externo da mutação é inválido.'
      using errcode = '22023';
  end if;
  v_argument_hash := private.authoring_design_mutation_hash_v1(
    'save_pedagogical_blueprint', p_blueprint
  );
  v_gate := private.begin_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'save_pedagogical_blueprint', 'author'
  );
  if (v_gate->>'replayed')::boolean then return v_gate->'result'; end if;
  if not private.authoring_design_closed_object_v1(
       p_blueprint,
       array[
         'id','version','modelVersion','contractVersion','scope','analysisRef',
         'effectiveSnapshotRef','blueprint','binding'
       ],
       array[
         'id','version','modelVersion','contractVersion','scope','analysisRef',
         'effectiveSnapshotRef','blueprint','binding'
       ]
     )
     or nullif(btrim(p_blueprint->>'id'), '') is null
     or nullif(btrim(p_blueprint->>'version'), '') is null
     or p_blueprint->>'modelVersion' is distinct from '1.0.0'
     or not (case
       when jsonb_typeof(p_blueprint->'contractVersion') = 'number'
         and p_blueprint->>'contractVersion' ~ '^[0-9]+$'
       then (p_blueprint->>'contractVersion')::integer = 2
       else false
     end)
     or not private.authoring_design_closed_object_v1(
       p_blueprint->'scope', array['kind','ref'], array['kind','ref']
     )
     or p_blueprint#>>'{scope,kind}' is distinct from 'microsequence'
     or not private.authoring_design_closed_object_v1(
       p_blueprint->'analysisRef', array['id','version'], array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_blueprint->'effectiveSnapshotRef',
       array['id','version'], array['id','version']
     )
     or not private.valid_authoring_pedagogical_blueprint_v2(
       p_blueprint->'blueprint'
     )
     or jsonb_typeof(p_blueprint->'binding') <> 'object'
     or private.authoring_design_contains_forbidden_key_v1(p_blueprint)
     or pg_column_size(p_blueprint->'blueprint') > 524288 then
    raise exception 'Blueprint pedagógico inválido.' using errcode = '22023';
  end if;
  v_scope_ref := p_blueprint#>>'{scope,ref}';
  v_scope_path := private.authoring_design_scope_path_v1(
    p_workspace_id, 'microsequence', v_scope_ref
  );
  v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
    p_workspace_id, 'microsequence', v_scope_ref
  );
  select * into v_analysis
  from private.authoring_instructional_analyses analysis
  where analysis.workspace_id = p_workspace_id
    and analysis.analysis_id = p_blueprint#>>'{analysisRef,id}'
    and analysis.analysis_version = p_blueprint#>>'{analysisRef,version}'
    and analysis.scope_kind = 'microsequence'
    and analysis.scope_ref = v_scope_ref;
  if not found then
    raise exception 'Análise do blueprint inexistente.' using errcode = '23503';
  end if;
  v_payload := p_blueprint->'blueprint';
  v_binding_payload := p_blueprint->'binding';
  if not private.valid_authoring_blueprint_binding_v1(
       v_binding_payload, v_payload, v_analysis.payload
     )
     or v_binding_payload->'scope' <> p_blueprint->'scope'
     or v_binding_payload#>>'{blueprintRef,id}' <> p_blueprint->>'id'
     or v_binding_payload#>>'{blueprintRef,version}' <> p_blueprint->>'version'
     or v_binding_payload->'analysisRef' <> p_blueprint->'analysisRef'
     or v_binding_payload->'effectiveSnapshotRef'
       <> p_blueprint->'effectiveSnapshotRef' then
    raise exception 'Binding do blueprint é inválido ou divergente.'
      using errcode = '22023';
  end if;
  select * into v_snapshot
  from private.authoring_effective_design_snapshots snapshot
  where snapshot.workspace_id = p_workspace_id
    and snapshot.snapshot_id = p_blueprint#>>'{effectiveSnapshotRef,id}'
    and snapshot.snapshot_version = p_blueprint#>>'{effectiveSnapshotRef,version}'
    and snapshot.analysis_id = v_analysis.analysis_id
    and snapshot.analysis_version = v_analysis.analysis_version
    and snapshot.scope_kind = 'microsequence'
    and snapshot.scope_ref = v_scope_ref;
  if not found or v_scope_path is null then
    raise exception 'Snapshot ou escopo do blueprint inexistente.'
      using errcode = '23503';
  end if;
  v_current_resolution := private.resolve_authoring_design_values_v1(
    p_workspace_id, 'microsequence', v_scope_ref
  );
  v_snapshot_payload := private.authoring_effective_design_snapshot_json_v1(
    p_workspace_id, v_snapshot.snapshot_id, v_snapshot.snapshot_version
  );
  if v_analysis.scope_path <> v_scope_path
     or v_analysis.scope_entity_version <> v_scope_entity_version
     or v_snapshot.scope_path <> v_scope_path
     or v_snapshot.scope_entity_version <> v_scope_entity_version
     or v_current_resolution->>'status' <> 'resolved'
     or v_snapshot_payload->'resolvedValues'
       <> v_current_resolution->'resolvedValues'
     or v_snapshot_payload->'resourceSetRefs'
       <> v_current_resolution->'resourceSetRefs' then
    raise exception 'Análise ou snapshot do blueprint está desatualizado.'
      using errcode = '40001';
  end if;
  v_hash := private.authoring_design_json_hash_v1(v_payload);
  v_binding_hash := private.authoring_design_json_hash_v1(v_binding_payload);
  insert into private.authoring_pedagogical_blueprints(
    workspace_id, blueprint_id, blueprint_version, contract_version,
    model_version, microsequence_ref, scope_path, scope_entity_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version,
    based_on_workspace_revision, created_revision, payload, payload_hash,
    created_by
  ) values (
    p_workspace_id, p_blueprint->>'id', p_blueprint->>'version', 2,
    p_blueprint->>'modelVersion', v_scope_ref, v_scope_path,
    v_scope_entity_version, v_analysis.analysis_id, v_analysis.analysis_version,
    v_snapshot.snapshot_id, v_snapshot.snapshot_version,
    p_expected_revision, p_expected_revision + 1, v_payload, v_hash, p_actor_id
  );
  insert into private.authoring_pedagogical_blueprint_bindings(
    workspace_id, binding_id, binding_version, contract_version,
    microsequence_ref, scope_path, scope_entity_version,
    blueprint_id, blueprint_version, analysis_id, analysis_version,
    snapshot_id, snapshot_version, created_revision, payload, payload_hash,
    created_by
  ) values (
    p_workspace_id, v_binding_payload->>'id', v_binding_payload->>'version', 1,
    v_scope_ref, v_scope_path, v_scope_entity_version,
    p_blueprint->>'id', p_blueprint->>'version',
    v_analysis.analysis_id, v_analysis.analysis_version,
    v_snapshot.snapshot_id, v_snapshot.snapshot_version,
    p_expected_revision + 1, v_binding_payload, v_binding_hash, p_actor_id
  );
  insert into private.authoring_microsequence_design_bindings(
    workspace_id, microsequence_ref, binding_id, binding_version,
    blueprint_id, blueprint_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version,
    bound_at_revision
  ) values (
    p_workspace_id, v_scope_ref,
    v_binding_payload->>'id', v_binding_payload->>'version',
    p_blueprint->>'id', p_blueprint->>'version',
    v_analysis.analysis_id, v_analysis.analysis_version,
    v_snapshot.snapshot_id, v_snapshot.snapshot_version,
    p_expected_revision + 1
  ) on conflict(workspace_id, microsequence_ref) do update set
    binding_id = excluded.binding_id,
    binding_version = excluded.binding_version,
    blueprint_id = excluded.blueprint_id,
    blueprint_version = excluded.blueprint_version,
    analysis_id = excluded.analysis_id,
    analysis_version = excluded.analysis_version,
    snapshot_id = excluded.snapshot_id,
    snapshot_version = excluded.snapshot_version,
    bound_at_revision = excluded.bound_at_revision,
    updated_at = now();
  return private.complete_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'save_pedagogical_blueprint',
    jsonb_build_object(
      'blueprintRef', jsonb_build_object(
        'id', p_blueprint->>'id', 'version', p_blueprint->>'version'
      ),
      'bindingRef', jsonb_build_object(
        'id', v_binding_payload->>'id', 'version', v_binding_payload->>'version'
      ),
      'analysisRef', p_blueprint->'analysisRef',
      'effectiveSnapshotRef', p_blueprint->'effectiveSnapshotRef',
      'blueprintHash', v_hash, 'bindingHash', v_binding_hash
    ),
    jsonb_build_object(
      'blueprintId', p_blueprint->>'id',
      'blueprintVersion', p_blueprint->>'version',
      'bindingId', v_binding_payload->>'id',
      'bindingVersion', v_binding_payload->>'version',
      'microsequenceRef', v_scope_ref,
      'blueprintHash', v_hash, 'bindingHash', v_binding_hash
    )
  );
end;
$function$;

create function public.register_authoring_materialization_manifest_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_manifest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_scope_ref text;
  v_scope_path text[];
  v_scope_entity_version bigint;
  v_snapshot private.authoring_effective_design_snapshots%rowtype;
  v_blueprint private.authoring_pedagogical_blueprints%rowtype;
  v_blueprint_binding private.authoring_pedagogical_blueprint_bindings%rowtype;
  v_hash text;
  v_selection jsonb;
  v_materialized jsonb;
  v_coverage jsonb;
  v_metric jsonb;
  v_policy private.authoring_resource_sets%rowtype;
  v_selection_row private.authoring_manifest_resource_selections%rowtype;
  v_fallback_policy text;
  v_materialization_state_revision bigint;
  v_argument_hash text;
  v_current_content_hash text;
  v_selection_count integer := 0;
  v_materialized_count integer := 0;
  v_coverage_count integer := 0;
  v_metric_count integer := 0;
begin
  if p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Hash externo da mutação é inválido.'
      using errcode = '22023';
  end if;
  v_argument_hash := private.authoring_design_mutation_hash_v1(
    'register_materialization_manifest', p_manifest
  );
  v_gate := private.begin_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'register_materialization_manifest', 'author'
  );
  if (v_gate->>'replayed')::boolean then return v_gate->'result'; end if;
  if not private.authoring_design_closed_object_v1(
       p_manifest,
       array[
         'contract','modelVersion','id','version','scope','analysisRef',
         'effectiveSnapshotRef','blueprintRef','materializedWorkspaceRevision',
         'scopeEntityVersion','contentHash','blueprintHash','createdAt',
         'resourceSetRefs','plannedSteps','materializedSteps',
         'explanationCoverage','evidenceCoverage','practiceOpportunities',
         'resourceSelections','materializedResources','derivedMetrics',
         'assumptions','limitations'
       ],
       array[
         'contract','modelVersion','id','version','scope','analysisRef',
         'effectiveSnapshotRef','blueprintRef','materializedWorkspaceRevision',
         'scopeEntityVersion','contentHash','blueprintHash','createdAt',
         'resourceSetRefs','plannedSteps','materializedSteps',
         'explanationCoverage','evidenceCoverage','practiceOpportunities',
         'resourceSelections','materializedResources','derivedMetrics',
         'assumptions','limitations'
       ]
     )
     or p_manifest->>'contract' is distinct from 'MaterializationManifest@1'
     or p_manifest->>'modelVersion' is distinct from '1.0.0'
     or nullif(btrim(p_manifest->>'id'), '') is null
     or nullif(btrim(p_manifest->>'version'), '') is null
     or not private.authoring_design_closed_object_v1(
       p_manifest->'scope', array['kind','ref'], array['kind','ref']
     )
     or p_manifest#>>'{scope,kind}' is distinct from 'microsequence'
     or not private.authoring_design_closed_object_v1(
       p_manifest->'analysisRef', array['id','version'], array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_manifest->'effectiveSnapshotRef',
       array['id','version'], array['id','version']
     )
     or not private.authoring_design_closed_object_v1(
       p_manifest->'blueprintRef', array['id','version'], array['id','version']
     )
     or p_manifest->>'contentHash' !~ '^[a-f0-9]{64}$'
     or p_manifest->>'blueprintHash' !~ '^[a-f0-9]{64}$'
     or not (case
       when jsonb_typeof(p_manifest->'materializedWorkspaceRevision') = 'number'
         and p_manifest->>'materializedWorkspaceRevision' ~ '^[1-9][0-9]{0,18}$'
       then (p_manifest->>'materializedWorkspaceRevision')::numeric
         = p_expected_revision
       else false
     end)
     or not (case
       when jsonb_typeof(p_manifest->'scopeEntityVersion') = 'number'
         and p_manifest->>'scopeEntityVersion' ~ '^[1-9][0-9]{0,18}$'
       then true else false
     end)
     or jsonb_typeof(p_manifest->'createdAt') <> 'string'
     or nullif(btrim(p_manifest->>'createdAt'), '') is null
     or jsonb_typeof(p_manifest->'resourceSetRefs') <> 'array'
     or jsonb_typeof(p_manifest->'plannedSteps') <> 'array'
     or jsonb_typeof(p_manifest->'materializedSteps') <> 'array'
     or jsonb_typeof(p_manifest->'resourceSelections') <> 'array'
     or jsonb_typeof(p_manifest->'materializedResources') <> 'array'
     or jsonb_typeof(p_manifest->'explanationCoverage') <> 'array'
     or jsonb_typeof(p_manifest->'evidenceCoverage') <> 'array'
     or jsonb_typeof(p_manifest->'practiceOpportunities') <> 'array'
     or jsonb_typeof(p_manifest->'derivedMetrics') <> 'array'
     or not private.authoring_design_text_array_v1(p_manifest->'assumptions')
     or not private.authoring_design_text_array_v1(p_manifest->'limitations')
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'resourceSetRefs') item
       where not private.authoring_design_closed_object_v1(
         item, array['id','version'], array['id','version']
       )
       or nullif(btrim(item->>'id'), '') is null
       or nullif(btrim(item->>'version'), '') is null
     )
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'plannedSteps') item
       where not private.authoring_design_closed_object_v1(
         item,
         array['stepRef','kind','unitRefs'],
         array['stepRef','kind','unitRefs']
       )
       or nullif(btrim(item->>'stepRef'), '') is null
       or item->>'kind' not in ('theory','practice')
       or not private.authoring_design_text_array_v1(item->'unitRefs')
     )
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'materializedSteps') item
       where not private.authoring_design_closed_object_v1(
         item,
         array['stepRef','kind','unitRefs','artifactRefs'],
         array['stepRef','kind','unitRefs','artifactRefs']
       )
       or nullif(btrim(item->>'stepRef'), '') is null
       or item->>'kind' not in ('theory','practice')
       or not private.authoring_design_text_array_v1(item->'unitRefs')
       or not private.authoring_design_text_array_v1(item->'artifactRefs', 1)
     )
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'explanationCoverage') item
       where not private.authoring_design_closed_object_v1(
         item,
         array['requirementRef','status','evidenceRefs'],
         array['requirementRef','status','evidenceRefs']
       )
       or nullif(btrim(item->>'requirementRef'), '') is null
       or item->>'status' not in ('developed','mentioned','missing','not_applicable')
       or not private.authoring_design_text_array_v1(item->'evidenceRefs')
     )
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'evidenceCoverage') item
       where not private.authoring_design_closed_object_v1(
         item,
         array[
           'requirementRef','status','practiceOpportunityRefs','evidenceRefs'
         ],
         array[
           'requirementRef','status','practiceOpportunityRefs','evidenceRefs'
         ]
       )
       or nullif(btrim(item->>'requirementRef'), '') is null
       or item->>'status' not in ('covered','partial','missing','not_applicable')
       or not private.authoring_design_text_array_v1(
         item->'practiceOpportunityRefs'
       )
       or not private.authoring_design_text_array_v1(item->'evidenceRefs')
     )
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'practiceOpportunities') item
       where not private.authoring_design_closed_object_v1(
         item,
         array[
           'id','evidenceRequirementRefs','semanticSignature','variation','artifactRefs'
         ],
         array[
           'id','evidenceRequirementRefs','semanticSignature','variation','artifactRefs'
         ]
       )
       or nullif(btrim(item->>'id'), '') is null
       or nullif(btrim(item->>'semanticSignature'), '') is null
       or not private.authoring_design_text_array_v1(
         item->'evidenceRequirementRefs', 1
       )
       or jsonb_typeof(item->'variation') <> 'object'
       or not private.authoring_design_text_array_v1(item->'artifactRefs', 1)
     )
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'resourceSelections') item
       where not private.authoring_design_closed_object_v1(
         item,
         array[
           'id','stepRef','package','authorizedByResourceSetRef','role','fit',
           'rationale','limitations'
         ],
         array[
           'id','stepRef','package','authorizedByResourceSetRef','role','fit',
           'rationale','limitations'
         ]
       )
       or nullif(btrim(item->>'id'), '') is null
       or nullif(btrim(item->>'stepRef'), '') is null
       or nullif(btrim(item->>'rationale'), '') is null
       or not private.authoring_design_closed_object_v1(
         item->'package',
         array['packageId','version'], array['packageId','version']
       )
       or not private.authoring_design_closed_object_v1(
         item->'authorizedByResourceSetRef',
         array['id','version'], array['id','version']
       )
       or item->>'role' not in ('exposition','embedded_practice','response')
       or item->>'fit' not in ('canonical','versatile','substitute')
       or not private.authoring_design_text_array_v1(item->'limitations')
     )
     or exists (
       select 1 from jsonb_array_elements(p_manifest->'materializedResources') item
       where not private.authoring_design_closed_object_v1(
         item,
         array['id','selectionRef','artifactRef','package','role'],
         array['id','selectionRef','artifactRef','package','role']
       )
       or nullif(btrim(item->>'id'), '') is null
       or nullif(btrim(item->>'selectionRef'), '') is null
       or nullif(btrim(item->>'artifactRef'), '') is null
       or not private.authoring_design_closed_object_v1(
         item->'package',
         array['packageId','version'], array['packageId','version']
       )
       or item->>'role' not in ('exposition','embedded_practice','response')
     )
     or pg_column_size(p_manifest) > 1048576
     or private.authoring_design_contains_forbidden_key_v1(p_manifest) then
    raise exception 'Manifesto de materialização inválido.' using errcode = '22023';
  end if;
  if exists (
    select 1 from (
      select 'planned' list_kind, item->>'stepRef' semantic_id
      from jsonb_array_elements(p_manifest->'plannedSteps') item
      union all
      select 'materialized', item->>'stepRef'
      from jsonb_array_elements(p_manifest->'materializedSteps') item
      union all
      select 'explanation', item->>'requirementRef'
      from jsonb_array_elements(p_manifest->'explanationCoverage') item
      union all
      select 'evidence', item->>'requirementRef'
      from jsonb_array_elements(p_manifest->'evidenceCoverage') item
      union all
      select 'opportunity', item->>'id'
      from jsonb_array_elements(p_manifest->'practiceOpportunities') item
      union all
      select 'selection', item->>'id'
      from jsonb_array_elements(p_manifest->'resourceSelections') item
      union all
      select 'resource', item->>'id'
      from jsonb_array_elements(p_manifest->'materializedResources') item
      union all
      select 'metric', item->>'id'
      from jsonb_array_elements(p_manifest->'derivedMetrics') item
    ) identities
    group by list_kind, semantic_id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_manifest->'materializedSteps') materialized_step
    where not exists (
      select 1 from jsonb_array_elements(p_manifest->'plannedSteps') planned_step
      where planned_step->>'stepRef' = materialized_step->>'stepRef'
        and planned_step->>'kind' = materialized_step->>'kind'
        and (planned_step->'unitRefs') @> (materialized_step->'unitRefs')
        and (materialized_step->'unitRefs') @> (planned_step->'unitRefs')
    )
  ) or exists (
    select 1
    from jsonb_array_elements(p_manifest->'resourceSelections') selection
    where not exists (
      select 1 from jsonb_array_elements(p_manifest->'plannedSteps') planned_step
      where planned_step->>'stepRef' = selection->>'stepRef'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(p_manifest->'materializedResources') resource_value
    where not exists (
      select 1 from jsonb_array_elements(p_manifest->'resourceSelections') selection
      where selection->>'id' = resource_value->>'selectionRef'
        and selection->'package' = resource_value->'package'
        and selection->>'role' = resource_value->>'role'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(p_manifest->'practiceOpportunities') opportunity,
      jsonb_array_elements_text(opportunity->'artifactRefs') artifact_ref
    where not exists (
      select 1
      from jsonb_array_elements(p_manifest->'materializedSteps') materialized_step,
        jsonb_array_elements_text(materialized_step->'artifactRefs') materialized_ref
      where materialized_ref = artifact_ref
    )
  ) then
    raise exception 'Relações internas do manifesto são inválidas.'
      using errcode = '22023';
  end if;
  v_scope_ref := p_manifest#>>'{scope,ref}';
  v_scope_path := private.authoring_design_scope_path_v1(
    p_workspace_id, 'microsequence', v_scope_ref
  );
  v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
    p_workspace_id, 'microsequence', v_scope_ref
  );
  if v_scope_path is null
     or (p_manifest->>'scopeEntityVersion')::bigint
       <> v_scope_entity_version then
    raise exception 'Conteúdo materializado está desatualizado.'
      using errcode = '40001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-materialization:' || p_workspace_id::text || ':' || v_scope_ref,
    0
  ));
  v_current_content_hash := private.authoring_materialized_content_hash_v1(
    p_workspace_id, v_scope_ref
  );
  if p_manifest->>'contentHash' is distinct from v_current_content_hash then
    raise exception 'Hash do conteúdo materializado diverge do estado corrente.'
      using errcode = '23514';
  end if;
  if exists (
    (select artifact_ref
     from jsonb_array_elements(p_manifest->'materializedSteps') step_value,
       jsonb_array_elements_text(step_value->'artifactRefs') artifact_ref
     except
     select card.entity_id
     from private.authoring_workspace_entities card
     where card.workspace_id = p_workspace_id
       and card.entity_type = 'card'
       and card.parent_type = 'microsequence'
       and card.parent_id = v_scope_ref)
    union all
    (select card.entity_id
     from private.authoring_workspace_entities card
     where card.workspace_id = p_workspace_id
       and card.entity_type = 'card'
       and card.parent_type = 'microsequence'
       and card.parent_id = v_scope_ref
     except
     select artifact_ref
     from jsonb_array_elements(p_manifest->'materializedSteps') step_value,
       jsonb_array_elements_text(step_value->'artifactRefs') artifact_ref)
  ) or exists (
    select 1
    from jsonb_array_elements(p_manifest->'materializedSteps') step_value,
      jsonb_array_elements_text(step_value->'artifactRefs') artifact_ref
    group by artifact_ref having count(*) > 1
  ) then
    raise exception 'Artefatos materializados divergem dos cards correntes.'
      using errcode = '23514';
  end if;
  select * into v_snapshot
  from private.authoring_effective_design_snapshots snapshot
  where snapshot.workspace_id = p_workspace_id
    and snapshot.snapshot_id = p_manifest#>>'{effectiveSnapshotRef,id}'
    and snapshot.snapshot_version = p_manifest#>>'{effectiveSnapshotRef,version}'
    and snapshot.analysis_id = p_manifest#>>'{analysisRef,id}'
    and snapshot.analysis_version = p_manifest#>>'{analysisRef,version}'
    and snapshot.scope_kind = 'microsequence'
    and snapshot.scope_ref = v_scope_ref
    and snapshot.scope_path = v_scope_path
    and snapshot.scope_entity_version = v_scope_entity_version;
  if not found then
    raise exception 'Snapshot do manifesto inexistente ou impertinente.'
      using errcode = '23503';
  end if;
  select * into v_blueprint
  from private.authoring_pedagogical_blueprints blueprint
  where blueprint.workspace_id = p_workspace_id
    and blueprint.blueprint_id = p_manifest#>>'{blueprintRef,id}'
    and blueprint.blueprint_version = p_manifest#>>'{blueprintRef,version}'
    and blueprint.analysis_id = v_snapshot.analysis_id
    and blueprint.analysis_version = v_snapshot.analysis_version
    and blueprint.snapshot_id = v_snapshot.snapshot_id
    and blueprint.snapshot_version = v_snapshot.snapshot_version
    and blueprint.microsequence_ref = v_scope_ref
    and blueprint.scope_path = v_scope_path
    and blueprint.scope_entity_version = v_scope_entity_version
    and exists (
      select 1
      from private.authoring_microsequence_design_bindings binding
      where binding.workspace_id = blueprint.workspace_id
        and binding.microsequence_ref = blueprint.microsequence_ref
        and binding.blueprint_id = blueprint.blueprint_id
        and binding.blueprint_version = blueprint.blueprint_version
        and binding.analysis_id = blueprint.analysis_id
        and binding.analysis_version = blueprint.analysis_version
        and binding.snapshot_id = blueprint.snapshot_id
        and binding.snapshot_version = blueprint.snapshot_version
    );
  if not found or v_blueprint.payload_hash <> p_manifest->>'blueprintHash' then
    raise exception 'Blueprint do manifesto inexistente ou divergente.'
      using errcode = '23514';
  end if;
  select * into v_blueprint_binding
  from private.authoring_pedagogical_blueprint_bindings blueprint_binding
  where blueprint_binding.workspace_id = p_workspace_id
    and blueprint_binding.blueprint_id = v_blueprint.blueprint_id
    and blueprint_binding.blueprint_version = v_blueprint.blueprint_version
    and blueprint_binding.analysis_id = v_blueprint.analysis_id
    and blueprint_binding.analysis_version = v_blueprint.analysis_version
    and blueprint_binding.snapshot_id = v_blueprint.snapshot_id
    and blueprint_binding.snapshot_version = v_blueprint.snapshot_version;
  if not found or exists (
    select 1 from (
      select mapping->>'stepId' step_ref, 'theory' step_kind,
        mapping->'unitRefs' unit_refs
      from jsonb_array_elements(
        v_blueprint_binding.payload#>'{mappings,theorySteps}'
      ) mapping
      union all
      select mapping->>'stepId', 'practice', mapping->'unitRefs'
      from jsonb_array_elements(
        v_blueprint_binding.payload#>'{mappings,practiceSteps}'
      ) mapping
    ) bound_step
    where not exists (
      select 1 from jsonb_array_elements(p_manifest->'plannedSteps') planned_step
      where planned_step->>'stepRef' = bound_step.step_ref
        and planned_step->>'kind' = bound_step.step_kind
        and (planned_step->'unitRefs') @> bound_step.unit_refs
        and bound_step.unit_refs @> (planned_step->'unitRefs')
    )
  ) or exists (
    select 1 from jsonb_array_elements(p_manifest->'plannedSteps') planned_step
    where not exists (
      select 1 from (
        select mapping->>'stepId' step_ref, 'theory' step_kind,
          mapping->'unitRefs' unit_refs
        from jsonb_array_elements(
          v_blueprint_binding.payload#>'{mappings,theorySteps}'
        ) mapping
        union all
        select mapping->>'stepId', 'practice', mapping->'unitRefs'
        from jsonb_array_elements(
          v_blueprint_binding.payload#>'{mappings,practiceSteps}'
        ) mapping
      ) bound_step
      where bound_step.step_ref = planned_step->>'stepRef'
        and bound_step.step_kind = planned_step->>'kind'
        and bound_step.unit_refs @> (planned_step->'unitRefs')
        and (planned_step->'unitRefs') @> bound_step.unit_refs
    )
  ) then
    raise exception 'Passos planejados divergem do binding do blueprint.'
      using errcode = '23514';
  end if;
  select value.value->>'value' into v_fallback_policy
  from private.authoring_effective_design_snapshot_values value
  where value.workspace_id = p_workspace_id
    and value.snapshot_id = v_snapshot.snapshot_id
    and value.snapshot_version = v_snapshot.snapshot_version
    and value.parameter_id = 'representation_fallback_policy'
    and value.parameter_version = '1.0.0';
  if v_fallback_policy not in (
    'block','allow_versatile_with_limitation',
    'allow_substitute_with_limitation'
  ) then
    raise exception 'Snapshot não possui política efetiva de fallback.'
      using errcode = '23514';
  end if;
  if exists (
    (select reference->>'id' as id, reference->>'version' as version
     from jsonb_array_elements(p_manifest->'resourceSetRefs') reference
     except
     select link.resource_set_id, link.resource_set_version
     from private.authoring_effective_design_snapshot_resource_sets link
     where link.workspace_id = p_workspace_id
       and link.snapshot_id = v_snapshot.snapshot_id
       and link.snapshot_version = v_snapshot.snapshot_version)
    union all
    (select link.resource_set_id, link.resource_set_version
     from private.authoring_effective_design_snapshot_resource_sets link
     where link.workspace_id = p_workspace_id
       and link.snapshot_id = v_snapshot.snapshot_id
       and link.snapshot_version = v_snapshot.snapshot_version
     except
     select reference->>'id', reference->>'version'
     from jsonb_array_elements(p_manifest->'resourceSetRefs') reference)
  ) then
    raise exception 'ResourceSets do manifesto divergem do snapshot.'
      using errcode = '23514';
  end if;
  select coalesce((
    select state.materialization_revision
    from private.authoring_materialization_states state
    where state.workspace_id = p_workspace_id
      and state.microsequence_ref = v_scope_ref
  ), 0) into v_materialization_state_revision;
  v_hash := private.authoring_design_json_hash_v1(p_manifest);
  insert into private.authoring_materialization_manifests(
    workspace_id, manifest_id, manifest_version, model_version,
    scope_kind, scope_ref, scope_path, scope_entity_version,
    analysis_id, analysis_version, snapshot_id, snapshot_version,
    blueprint_id, blueprint_version, materialized_workspace_revision,
    materialization_state_revision, created_revision,
    content_hash, blueprint_hash, payload, payload_hash,
    declared_created_at, created_by
  ) values (
    p_workspace_id, p_manifest->>'id', p_manifest->>'version',
    p_manifest->>'modelVersion', 'microsequence', v_scope_ref, v_scope_path,
    v_scope_entity_version, v_snapshot.analysis_id, v_snapshot.analysis_version,
    v_snapshot.snapshot_id, v_snapshot.snapshot_version,
    v_blueprint.blueprint_id, v_blueprint.blueprint_version,
    p_expected_revision, v_materialization_state_revision,
    p_expected_revision + 1,
    p_manifest->>'contentHash', p_manifest->>'blueprintHash',
    p_manifest, v_hash, (p_manifest->>'createdAt')::timestamptz, p_actor_id
  );
  for v_selection in
    select value from jsonb_array_elements(p_manifest->'resourceSelections')
  loop
    select resource_set.* into v_policy
    from private.authoring_effective_design_snapshot_resource_sets link
    join private.authoring_resource_sets resource_set
      on resource_set.workspace_id = link.workspace_id
     and resource_set.resource_set_id = link.resource_set_id
     and resource_set.resource_set_version = link.resource_set_version
    join private.authoring_resource_set_members member
      on member.workspace_id = resource_set.workspace_id
     and member.resource_set_id = resource_set.resource_set_id
     and member.resource_set_version = resource_set.resource_set_version
    where link.workspace_id = p_workspace_id
      and link.snapshot_id = v_snapshot.snapshot_id
      and link.snapshot_version = v_snapshot.snapshot_version
      and resource_set.resource_set_id =
        v_selection#>>'{authorizedByResourceSetRef,id}'
      and resource_set.resource_set_version =
        v_selection#>>'{authorizedByResourceSetRef,version}'
      and member.package_id = v_selection#>>'{package,packageId}'
      and member.package_version = v_selection#>>'{package,version}';
    if not found
       or not (v_selection->>'fit' = any(v_policy.allowed_fits))
       or (v_selection->>'role' = 'embedded_practice'
           and not v_policy.allow_embedded_practice)
       or (v_selection->>'role' = 'response'
           and not v_policy.allow_response_packages)
       or (
         v_selection#>>'{package,packageId}' like 'aralearn.response.%'
         and (
           v_selection->>'role' <> 'response'
           or not v_policy.allow_response_packages
         )
       )
       or (
         v_selection->>'role' = 'response'
         and v_selection#>>'{package,packageId}' not like 'aralearn.response.%'
       )
       or (
         v_selection->>'fit' = 'substitute'
         and v_policy.no_adequate_representation = 'block'
       )
       or (
         v_selection->>'fit' = 'substitute'
         and v_fallback_policy <> 'allow_substitute_with_limitation'
       )
       or (v_selection->>'fit' = 'substitute' and
           jsonb_array_length(v_selection->'limitations') = 0) then
      raise exception 'Seleção de resource viola o ResourceSet autorizador.'
        using errcode = '23514';
    end if;
    insert into private.authoring_manifest_resource_selections(
      workspace_id, manifest_id, manifest_version, selection_id, step_ref,
      package_id, package_version, resource_set_id, resource_set_version,
      role, fit, rationale, limitations
    ) values (
      p_workspace_id, p_manifest->>'id', p_manifest->>'version',
      v_selection->>'id', v_selection->>'stepRef',
      v_selection#>>'{package,packageId}', v_selection#>>'{package,version}',
      v_selection#>>'{authorizedByResourceSetRef,id}',
      v_selection#>>'{authorizedByResourceSetRef,version}',
      v_selection->>'role', v_selection->>'fit', v_selection->>'rationale',
      array(select value from jsonb_array_elements_text(
        v_selection->'limitations'
      ) value)
    );
    v_selection_count := v_selection_count + 1;
  end loop;
  for v_materialized in
    select value from jsonb_array_elements(p_manifest->'materializedResources')
  loop
    select * into v_selection_row
    from private.authoring_manifest_resource_selections selection
    where selection.workspace_id = p_workspace_id
      and selection.manifest_id = p_manifest->>'id'
      and selection.manifest_version = p_manifest->>'version'
      and selection.selection_id = v_materialized->>'selectionRef';
    if not found
       or v_selection_row.package_id <> v_materialized#>>'{package,packageId}'
       or v_selection_row.package_version <> v_materialized#>>'{package,version}'
       or v_selection_row.role <> v_materialized->>'role' then
      raise exception 'Resource materializado diverge da seleção.'
        using errcode = '23514';
    end if;
    insert into private.authoring_manifest_materialized_resources(
      workspace_id, manifest_id, manifest_version, resource_id,
      selection_id, artifact_ref, package_id, package_version, role
    ) values (
      p_workspace_id, p_manifest->>'id', p_manifest->>'version',
      v_materialized->>'id', v_materialized->>'selectionRef',
      v_materialized->>'artifactRef', v_materialized#>>'{package,packageId}',
      v_materialized#>>'{package,version}', v_materialized->>'role'
    );
    v_materialized_count := v_materialized_count + 1;
  end loop;
  for v_coverage in
    select value || jsonb_build_object('coverageKind', 'explanation')
    from jsonb_array_elements(p_manifest->'explanationCoverage') value
    union all
    select value || jsonb_build_object('coverageKind', 'evidence')
    from jsonb_array_elements(p_manifest->'evidenceCoverage') value
  loop
    insert into private.authoring_manifest_coverage(
      workspace_id, manifest_id, manifest_version, coverage_kind,
      requirement_ref, status, evidence_refs, practice_opportunity_refs
    ) values (
      p_workspace_id, p_manifest->>'id', p_manifest->>'version',
      v_coverage->>'coverageKind', v_coverage->>'requirementRef',
      v_coverage->>'status',
      array(select value from jsonb_array_elements_text(
        v_coverage->'evidenceRefs'
      ) value),
      array(select value from jsonb_array_elements_text(
        coalesce(v_coverage->'practiceOpportunityRefs', '[]'::jsonb)
      ) value)
    );
    v_coverage_count := v_coverage_count + 1;
  end loop;
  for v_metric in select value from jsonb_array_elements(p_manifest->'derivedMetrics')
  loop
    insert into private.authoring_manifest_metrics(
      workspace_id, manifest_id, manifest_version, metric_id, metric_kind,
      value, unit, scope_kind, scope_ref,
      denominator_count, denominator_unit, denominator_refs,
      algorithm_id, algorithm_version, input_refs
    ) values (
      p_workspace_id, p_manifest->>'id', p_manifest->>'version',
      v_metric->>'id', v_metric->>'kind', (v_metric->>'value')::numeric,
      v_metric->>'unit', v_metric#>>'{scope,kind}',
      v_metric#>>'{scope,ref}',
      (v_metric#>>'{denominator,count}')::integer,
      v_metric#>>'{denominator,unit}',
      array(select value from jsonb_array_elements_text(
        v_metric#>'{denominator,refs}'
      ) value),
      v_metric#>>'{algorithm,id}', v_metric#>>'{algorithm,version}',
      array(select value from jsonb_array_elements_text(
        v_metric#>'{algorithm,inputRefs}'
      ) value)
    );
    v_metric_count := v_metric_count + 1;
  end loop;
  return private.complete_authoring_design_mutation_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash, v_argument_hash,
    p_expected_revision, 'register_materialization_manifest',
    jsonb_build_object(
      'manifestRef', jsonb_build_object(
        'id', p_manifest->>'id', 'version', p_manifest->>'version'
      ),
      'contentHash', p_manifest->>'contentHash', 'payloadHash', v_hash
    ),
    jsonb_build_object(
      'manifestId', p_manifest->>'id',
      'manifestVersion', p_manifest->>'version',
      'microsequenceRef', v_scope_ref,
      'selectionCount', v_selection_count,
      'materializedResourceCount', v_materialized_count,
      'coverageCount', v_coverage_count,
      'metricCount', v_metric_count
    )
  );
end;
$function$;

create function private.authoring_effective_design_snapshot_json_v1(
  p_workspace_id uuid,
  p_snapshot_id text,
  p_snapshot_version text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'contract', 'EffectiveDesignSnapshot@1',
    'modelVersion', snapshot.model_version,
    'id', snapshot.snapshot_id,
    'version', snapshot.snapshot_version,
    'scope', jsonb_build_object(
      'kind', snapshot.scope_kind, 'ref', snapshot.scope_ref
    ),
    'analysisRef', jsonb_build_object(
      'id', snapshot.analysis_id, 'version', snapshot.analysis_version
    ),
    'parameterCatalogVersion', snapshot.parameter_catalog_version,
    'basedOnWorkspaceRevision', snapshot.based_on_workspace_revision,
    'scopeEntityVersion', snapshot.scope_entity_version,
    'resolutionVersion', snapshot.resolution_version,
    'resolutionPath', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', case ordinal
          when 1 then 'workspace' when 2 then 'course' when 3 then 'module'
          when 4 then 'lesson' else 'microsequence' end,
        'ref', case ordinal when 1 then snapshot.workspace_id::text
          else snapshot.scope_path[ordinal - 1] end
      ) order by ordinal)
      from generate_series(1, cardinality(snapshot.scope_path) + 1) ordinal
    ), '[]'::jsonb),
    'resolvedValues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'definitionRef', jsonb_build_object(
          'id', value.parameter_id, 'version', value.parameter_version
        ),
        'value', value.value,
        'resolution', jsonb_build_object(
          'assignmentMode', value.assignment_mode,
          'inheritance', value.inheritance_kind,
          'assignmentRef', case when value.assignment_id is null then null
            else jsonb_build_object(
              'id', value.assignment_id, 'version', value.assignment_version
            ) end,
          'sourceScope', jsonb_build_object(
            'kind', value.source_scope_kind, 'ref', value.source_scope_ref
          ),
          'rationale', value.rationale,
          'provenanceRefs', to_jsonb(value.provenance_refs)
        )
      ) order by value.parameter_id, value.parameter_version)
      from private.authoring_effective_design_snapshot_values value
      where value.workspace_id = snapshot.workspace_id
        and value.snapshot_id = snapshot.snapshot_id
        and value.snapshot_version = snapshot.snapshot_version
    ), '[]'::jsonb),
    'resourceSetRefs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', link.resource_set_id, 'version', link.resource_set_version
      ) order by link.ordinal)
      from private.authoring_effective_design_snapshot_resource_sets link
      where link.workspace_id = snapshot.workspace_id
        and link.snapshot_id = snapshot.snapshot_id
        and link.snapshot_version = snapshot.snapshot_version
    ), '[]'::jsonb),
    'frozenAt', snapshot.frozen_at
  )
  from private.authoring_effective_design_snapshots snapshot
  where snapshot.workspace_id = p_workspace_id
    and snapshot.snapshot_id = p_snapshot_id
    and snapshot.snapshot_version = p_snapshot_version
$function$;

create function public.get_authoring_resource_set_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_resource_set_id text,
  p_resource_set_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_resource_set jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  select jsonb_build_object(
    'contract', 'ResourceSet@1',
    'modelVersion', resource_set.model_version,
    'id', resource_set.resource_set_id,
    'version', resource_set.resource_set_version,
    'scope', jsonb_build_object(
      'kind', resource_set.scope_kind, 'ref', resource_set.scope_ref
    ),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'packageId', member.package_id, 'version', member.package_version
      ) order by member.ordinal)
      from private.authoring_resource_set_members member
      where member.workspace_id = resource_set.workspace_id
        and member.resource_set_id = resource_set.resource_set_id
        and member.resource_set_version = resource_set.resource_set_version
    ), '[]'::jsonb),
    'resolvedCatalogVersion', resource_set.resolved_catalog_version,
    'facetBasis', resource_set.facet_basis,
    'selectionConstraints', jsonb_build_object(
      'allowedFits', to_jsonb(resource_set.allowed_fits),
      'allowEmbeddedPractice', resource_set.allow_embedded_practice,
      'allowResponsePackages', resource_set.allow_response_packages,
      'onNoAdequateRepresentation', resource_set.no_adequate_representation
    ),
    'provenanceRefs', to_jsonb(resource_set.provenance_refs)
  ) into v_resource_set
  from private.authoring_resource_sets resource_set
  where resource_set.workspace_id = p_workspace_id
    and resource_set.resource_set_id = p_resource_set_id
    and resource_set.resource_set_version = p_resource_set_version;
  if v_resource_set is null then
    raise exception 'ResourceSet inexistente.' using errcode = 'P0002';
  end if;
  return v_resource_set;
end;
$function$;

create function public.get_authoring_effective_design_snapshot_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_snapshot_id text,
  p_snapshot_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_snapshot jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  v_snapshot := private.authoring_effective_design_snapshot_json_v1(
    p_workspace_id, p_snapshot_id, p_snapshot_version
  );
  if v_snapshot is null then
    raise exception 'Snapshot efetivo inexistente.' using errcode = 'P0002';
  end if;
  return v_snapshot;
end;
$function$;

create function public.get_authoring_materialization_manifest_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_manifest_id text,
  p_manifest_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_manifest jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  select manifest.payload into v_manifest
  from private.authoring_materialization_manifests manifest
  where manifest.workspace_id = p_workspace_id
    and manifest.manifest_id = p_manifest_id
    and manifest.manifest_version = p_manifest_version;
  if v_manifest is null then
    raise exception 'Manifesto de materialização inexistente.'
      using errcode = 'P0002';
  end if;
  return v_manifest;
end;
$function$;

create function public.get_authoring_design_state_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_scope_kind text,
  p_scope_ref text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_path text[];
  v_workspace_revision bigint;
  v_scope_entity_version bigint;
  v_analysis private.authoring_instructional_analyses%rowtype;
  v_binding private.authoring_microsequence_design_bindings%rowtype;
  v_blueprint_binding private.authoring_pedagogical_blueprint_bindings%rowtype;
  v_snapshot private.authoring_effective_design_snapshots%rowtype;
  v_blueprint private.authoring_pedagogical_blueprints%rowtype;
  v_manifest private.authoring_materialization_manifests%rowtype;
  v_materialization_state_revision bigint := 0;
  v_current_content_hash text;
  v_resolution jsonb;
  v_snapshot_payload jsonb;
  v_has_legacy_materialized_content boolean := false;
  v_analysis_current boolean := false;
  v_snapshot_current boolean := false;
  v_blueprint_current boolean := false;
  v_manifest_current boolean := false;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  v_path := private.authoring_design_scope_path_v1(
    p_workspace_id, p_scope_kind, p_scope_ref
  );
  if v_path is null then
    raise exception 'Escopo de desenho inexistente.' using errcode = 'P0002';
  end if;
  select workspace.revision into v_workspace_revision
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
    p_workspace_id, p_scope_kind, p_scope_ref
  );
  select * into v_analysis
  from private.authoring_instructional_analyses analysis
  where analysis.workspace_id = p_workspace_id
    and analysis.scope_kind = p_scope_kind
    and analysis.scope_ref = p_scope_ref
  order by analysis.created_revision desc, analysis.created_at desc limit 1;
  v_resolution := private.resolve_authoring_design_values_v1(
    p_workspace_id, p_scope_kind, p_scope_ref
  );
  if p_scope_kind = 'microsequence' then
    select * into v_binding
    from private.authoring_microsequence_design_bindings binding
    where binding.workspace_id = p_workspace_id
      and binding.microsequence_ref = p_scope_ref;
    if found then
      select * into v_snapshot
      from private.authoring_effective_design_snapshots snapshot
      where snapshot.workspace_id = p_workspace_id
        and snapshot.snapshot_id = v_binding.snapshot_id
        and snapshot.snapshot_version = v_binding.snapshot_version;
    else
      select * into v_snapshot
      from private.authoring_effective_design_snapshots snapshot
      where snapshot.workspace_id = p_workspace_id
        and snapshot.scope_kind = p_scope_kind
        and snapshot.scope_ref = p_scope_ref
      order by snapshot.created_revision desc limit 1;
    end if;
    if v_binding.blueprint_id is not null then
      select * into v_blueprint
      from private.authoring_pedagogical_blueprints blueprint
      where blueprint.workspace_id = p_workspace_id
        and blueprint.blueprint_id = v_binding.blueprint_id
        and blueprint.blueprint_version = v_binding.blueprint_version;
      select * into v_blueprint_binding
      from private.authoring_pedagogical_blueprint_bindings binding_value
      where binding_value.workspace_id = p_workspace_id
        and binding_value.binding_id = v_binding.binding_id
        and binding_value.binding_version = v_binding.binding_version;
    end if;
    select * into v_manifest
    from private.authoring_materialization_manifests manifest
    where manifest.workspace_id = p_workspace_id
      and manifest.scope_ref = p_scope_ref
    order by manifest.created_revision desc limit 1;
    select coalesce((
      select state.materialization_revision
      from private.authoring_materialization_states state
      where state.workspace_id = p_workspace_id
        and state.microsequence_ref = p_scope_ref
    ), 0) into v_materialization_state_revision;
    v_current_content_hash := private.authoring_materialized_content_hash_v1(
      p_workspace_id, p_scope_ref
    );
    select exists (
      select 1 from private.authoring_workspace_entities card
      where card.workspace_id = p_workspace_id
        and card.entity_type = 'card'
        and card.parent_type = 'microsequence'
        and card.parent_id = p_scope_ref
    ) into v_has_legacy_materialized_content;
  else
    select * into v_snapshot
    from private.authoring_effective_design_snapshots snapshot
    where snapshot.workspace_id = p_workspace_id
      and snapshot.scope_kind = p_scope_kind
      and snapshot.scope_ref = p_scope_ref
    order by snapshot.created_revision desc limit 1;
  end if;
  v_analysis_current := v_analysis.analysis_id is not null
    and v_analysis.scope_path = v_path
    and (
      (p_scope_kind = 'workspace'
       and v_analysis.created_revision <= v_workspace_revision)
      or (p_scope_kind <> 'workspace'
       and v_analysis.scope_entity_version = v_scope_entity_version)
    );
  if v_snapshot.snapshot_id is not null then
    v_snapshot_payload := private.authoring_effective_design_snapshot_json_v1(
      p_workspace_id, v_snapshot.snapshot_id, v_snapshot.snapshot_version
    );
    v_snapshot_current := v_analysis_current
      and v_snapshot.scope_path = v_path
      and (
        (p_scope_kind = 'workspace'
         and v_snapshot.created_revision <= v_workspace_revision)
        or (p_scope_kind <> 'workspace'
         and v_snapshot.scope_entity_version = v_scope_entity_version)
      )
      and v_snapshot.analysis_id = v_analysis.analysis_id
      and v_snapshot.analysis_version = v_analysis.analysis_version
      and v_resolution->>'status' = 'resolved'
      and v_snapshot_payload->'resolvedValues'
        = v_resolution->'resolvedValues'
      and v_snapshot_payload->'resourceSetRefs'
        = v_resolution->'resourceSetRefs';
  end if;
  v_blueprint_current := v_blueprint.blueprint_id is not null
    and v_blueprint_binding.binding_id is not null
    and v_snapshot_current
    and v_blueprint.scope_path = v_path
    and v_blueprint.scope_entity_version = v_scope_entity_version
    and v_blueprint.analysis_id = v_analysis.analysis_id
    and v_blueprint.analysis_version = v_analysis.analysis_version
    and v_blueprint.snapshot_id = v_snapshot.snapshot_id
    and v_blueprint.snapshot_version = v_snapshot.snapshot_version
    and v_blueprint_binding.scope_path = v_path
    and v_blueprint_binding.scope_entity_version = v_scope_entity_version
    and v_blueprint_binding.blueprint_id = v_blueprint.blueprint_id
    and v_blueprint_binding.blueprint_version = v_blueprint.blueprint_version
    and v_blueprint_binding.analysis_id = v_analysis.analysis_id
    and v_blueprint_binding.analysis_version = v_analysis.analysis_version
    and v_blueprint_binding.snapshot_id = v_snapshot.snapshot_id
    and v_blueprint_binding.snapshot_version = v_snapshot.snapshot_version;
  v_manifest_current := v_manifest.manifest_id is not null
    and v_blueprint_current
    and v_manifest.scope_path = v_path
    and v_manifest.scope_entity_version = v_scope_entity_version
    and v_manifest.blueprint_id = v_blueprint.blueprint_id
    and v_manifest.blueprint_version = v_blueprint.blueprint_version
    and v_manifest.materialization_state_revision =
      v_materialization_state_revision
    and v_manifest.content_hash = v_current_content_hash
    and v_manifest.materialized_workspace_revision < v_workspace_revision;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'workspaceRevision', v_workspace_revision,
    'scope', jsonb_build_object('kind', p_scope_kind, 'ref', p_scope_ref),
    'analysisState', case when v_analysis.analysis_id is null then 'unresolved'
      when v_analysis_current then 'current' else 'stale' end,
    'analysis', v_analysis.payload,
    'parameterState', v_resolution->>'status',
    'resolution', v_resolution,
    'effectiveDesignState', case when v_snapshot.snapshot_id is null
      then 'unresolved' when v_snapshot_current then 'resolved'
      else 'stale' end,
    'effectiveSnapshot', v_snapshot_payload,
    'blueprintState', case when v_binding.blueprint_id is null
      then 'unresolved' when v_blueprint_current then 'current'
      else 'stale' end,
    'blueprintRef', case when v_blueprint.blueprint_id is null then null
      else jsonb_build_object(
        'id', v_blueprint.blueprint_id,
        'version', v_blueprint.blueprint_version,
        'contractVersion', v_blueprint.contract_version
      ) end,
    'blueprint', v_blueprint.payload,
    'blueprintBindingRef', case when v_blueprint_binding.binding_id is null
      then null else jsonb_build_object(
        'id', v_blueprint_binding.binding_id,
        'version', v_blueprint_binding.binding_version,
        'contract', v_blueprint_binding.payload->>'contract'
      ) end,
    'blueprintBinding', v_blueprint_binding.payload,
    'materializationContentHash', v_current_content_hash,
    'materializationState', case
      when v_manifest_current then 'tracked'
      when v_manifest.manifest_id is not null then 'stale'
      when v_has_legacy_materialized_content then 'legacy_untracked'
      else 'unresolved' end,
    'materializationManifest', v_manifest.payload,
    'resourceAvailabilityState', case
      when v_manifest.manifest_id is null and v_has_legacy_materialized_content
        then 'legacy_unrestricted'
      when v_snapshot_current then 'resolved'
      when v_snapshot.snapshot_id is not null then 'stale'
      else 'unresolved' end
  );
end;
$function$;

create function private.prune_authoring_design_state_v1(
  p_workspace_id uuid,
  p_before timestamptz default now() - interval '180 days',
  p_limit integer default 256
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_assignments integer := 0;
  v_bindings integer := 0;
  v_blueprints integer := 0;
  v_snapshots integer := 0;
  v_analyses integer := 0;
  v_resource_sets integer := 0;
begin
  if p_workspace_id is null or p_before is null
     or p_limit not between 1 and 1000 then
    raise exception 'Recorte de retenção inválido.' using errcode = '22023';
  end if;
  with candidates as materialized (
    select assignment.ctid
    from private.authoring_design_parameter_assignments assignment
    where assignment.workspace_id = p_workspace_id
      and assignment.created_at < p_before
      and exists (
        select 1 from private.authoring_design_parameter_assignments newer
        where newer.workspace_id = assignment.workspace_id
          and newer.assignment_id = assignment.assignment_id
          and newer.created_revision > assignment.created_revision
      )
      and not exists (
        select 1 from private.authoring_effective_design_snapshot_values value
        where value.workspace_id = assignment.workspace_id
          and value.assignment_id = assignment.assignment_id
          and value.assignment_version = assignment.assignment_version
      )
    order by assignment.created_at, assignment.created_revision
    limit p_limit for update skip locked
  )
  delete from private.authoring_design_parameter_assignments assignment
  using candidates where assignment.ctid = candidates.ctid;
  get diagnostics v_assignments = row_count;

  with candidates as materialized (
    select blueprint_binding.ctid
    from private.authoring_pedagogical_blueprint_bindings blueprint_binding
    where blueprint_binding.workspace_id = p_workspace_id
      and blueprint_binding.created_at < p_before
      and not exists (
        select 1 from private.authoring_microsequence_design_bindings current_binding
        where current_binding.workspace_id = blueprint_binding.workspace_id
          and current_binding.binding_id = blueprint_binding.binding_id
          and current_binding.binding_version = blueprint_binding.binding_version
      )
      and not exists (
        select 1 from private.authoring_materialization_manifests manifest
        where manifest.workspace_id = blueprint_binding.workspace_id
          and manifest.blueprint_id = blueprint_binding.blueprint_id
          and manifest.blueprint_version = blueprint_binding.blueprint_version
      )
      and exists (
        select 1
        from private.authoring_pedagogical_blueprint_bindings newer
        where newer.workspace_id = blueprint_binding.workspace_id
          and newer.microsequence_ref = blueprint_binding.microsequence_ref
          and newer.created_revision > blueprint_binding.created_revision
      )
    order by blueprint_binding.created_at
    limit p_limit for update skip locked
  )
  delete from private.authoring_pedagogical_blueprint_bindings blueprint_binding
  using candidates where blueprint_binding.ctid = candidates.ctid;
  get diagnostics v_bindings = row_count;

  with candidates as materialized (
    select blueprint.ctid
    from private.authoring_pedagogical_blueprints blueprint
    where blueprint.workspace_id = p_workspace_id
      and blueprint.created_at < p_before
      and not exists (
        select 1 from private.authoring_microsequence_design_bindings binding
        where binding.workspace_id = blueprint.workspace_id
          and binding.blueprint_id = blueprint.blueprint_id
          and binding.blueprint_version = blueprint.blueprint_version
      )
      and not exists (
        select 1 from private.authoring_pedagogical_blueprint_bindings blueprint_binding
        where blueprint_binding.workspace_id = blueprint.workspace_id
          and blueprint_binding.blueprint_id = blueprint.blueprint_id
          and blueprint_binding.blueprint_version = blueprint.blueprint_version
      )
      and not exists (
        select 1 from private.authoring_materialization_manifests manifest
        where manifest.workspace_id = blueprint.workspace_id
          and manifest.blueprint_id = blueprint.blueprint_id
          and manifest.blueprint_version = blueprint.blueprint_version
      )
      and exists (
        select 1 from private.authoring_pedagogical_blueprints newer
        where newer.workspace_id = blueprint.workspace_id
          and newer.microsequence_ref = blueprint.microsequence_ref
          and newer.created_revision > blueprint.created_revision
      )
    order by blueprint.created_at limit p_limit for update skip locked
  )
  delete from private.authoring_pedagogical_blueprints blueprint
  using candidates where blueprint.ctid = candidates.ctid;
  get diagnostics v_blueprints = row_count;

  with candidates as materialized (
    select snapshot.ctid
    from private.authoring_effective_design_snapshots snapshot
    where snapshot.workspace_id = p_workspace_id
      and snapshot.created_at < p_before
      and not exists (
        select 1 from private.authoring_pedagogical_blueprints blueprint
        where blueprint.workspace_id = snapshot.workspace_id
          and blueprint.snapshot_id = snapshot.snapshot_id
          and blueprint.snapshot_version = snapshot.snapshot_version
      )
      and not exists (
        select 1 from private.authoring_materialization_manifests manifest
        where manifest.workspace_id = snapshot.workspace_id
          and manifest.snapshot_id = snapshot.snapshot_id
          and manifest.snapshot_version = snapshot.snapshot_version
      )
      and exists (
        select 1 from private.authoring_effective_design_snapshots newer
        where newer.workspace_id = snapshot.workspace_id
          and newer.scope_kind = snapshot.scope_kind
          and newer.scope_ref = snapshot.scope_ref
          and newer.created_revision > snapshot.created_revision
      )
    order by snapshot.created_at limit p_limit for update skip locked
  )
  delete from private.authoring_effective_design_snapshots snapshot
  using candidates where snapshot.ctid = candidates.ctid;
  get diagnostics v_snapshots = row_count;

  with candidates as materialized (
    select analysis.ctid
    from private.authoring_instructional_analyses analysis
    where analysis.workspace_id = p_workspace_id
      and analysis.created_at < p_before
      and not exists (
        select 1 from private.authoring_effective_design_snapshots snapshot
        where snapshot.workspace_id = analysis.workspace_id
          and snapshot.analysis_id = analysis.analysis_id
          and snapshot.analysis_version = analysis.analysis_version
      )
      and not exists (
        select 1 from private.authoring_pedagogical_blueprints blueprint
        where blueprint.workspace_id = analysis.workspace_id
          and blueprint.analysis_id = analysis.analysis_id
          and blueprint.analysis_version = analysis.analysis_version
      )
      and not exists (
        select 1 from private.authoring_materialization_manifests manifest
        where manifest.workspace_id = analysis.workspace_id
          and manifest.analysis_id = analysis.analysis_id
          and manifest.analysis_version = analysis.analysis_version
      )
      and exists (
        select 1 from private.authoring_instructional_analyses newer
        where newer.workspace_id = analysis.workspace_id
          and newer.scope_kind = analysis.scope_kind
          and newer.scope_ref = analysis.scope_ref
          and newer.created_revision > analysis.created_revision
      )
    order by analysis.created_at limit p_limit for update skip locked
  )
  delete from private.authoring_instructional_analyses analysis
  using candidates where analysis.ctid = candidates.ctid;
  get diagnostics v_analyses = row_count;

  with candidates as materialized (
    select resource_set.ctid
    from private.authoring_resource_sets resource_set
    where resource_set.workspace_id = p_workspace_id
      and resource_set.created_at < p_before
      and not exists (
        select 1
        from private.authoring_effective_design_snapshot_resource_sets link
        where link.workspace_id = resource_set.workspace_id
          and link.resource_set_id = resource_set.resource_set_id
          and link.resource_set_version = resource_set.resource_set_version
      )
      and not exists (
        select 1 from private.authoring_manifest_resource_selections selection
        where selection.workspace_id = resource_set.workspace_id
          and selection.resource_set_id = resource_set.resource_set_id
          and selection.resource_set_version = resource_set.resource_set_version
      )
      and not exists (
        select 1
        from private.current_authoring_design_parameter_assignments_v1 assignment
        cross join lateral jsonb_array_elements_text(
          case when assignment.parameter_id = 'available_resource_set_refs'
            then assignment.value->'values' else '[]'::jsonb end
        ) reference(value)
        where assignment.workspace_id = resource_set.workspace_id
          and reference.value = resource_set.resource_set_id || '@'
            || resource_set.resource_set_version
      )
      and exists (
        select 1 from private.authoring_resource_sets newer
        where newer.workspace_id = resource_set.workspace_id
          and newer.resource_set_id = resource_set.resource_set_id
          and newer.created_revision > resource_set.created_revision
      )
    order by resource_set.created_at limit p_limit for update skip locked
  )
  delete from private.authoring_resource_sets resource_set
  using candidates where resource_set.ctid = candidates.ctid;
  get diagnostics v_resource_sets = row_count;
  return jsonb_build_object(
    'assignments', v_assignments,
    'blueprintBindings', v_bindings,
    'blueprints', v_blueprints,
    'snapshots', v_snapshots,
    'analyses', v_analyses,
    'resourceSets', v_resource_sets,
    'manifests', 0
  );
end;
$function$;

-- As tabelas privadas não são uma API. O runtime e o MCP passam somente pelos
-- RPCs com capability, CAS e receipt/evento compacto.
revoke all on table private.authoring_design_parameter_definitions
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_design_request_arguments
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_instructional_analyses
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_design_parameter_assignments
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_resource_sets
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_resource_set_members
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_effective_design_snapshots
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_effective_design_snapshot_values
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_effective_design_snapshot_resource_sets
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_pedagogical_blueprints
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_pedagogical_blueprint_bindings
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_microsequence_design_bindings
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_materialization_states
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_materialization_manifests
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_manifest_resource_selections
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_manifest_materialized_resources
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_manifest_coverage
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_manifest_metrics
  from public, anon, authenticated, service_role;
revoke all on table private.current_authoring_design_parameter_assignments_v1
  from public, anon, authenticated, service_role;

do $secure_parameterized_authoring_functions$
declare
  v_function record;
  v_public_names constant text[] := array[
    'list_authoring_design_parameter_definitions_v1',
    'get_authoring_instructional_analysis_v1',
    'list_authoring_design_parameter_assignments_v1',
    'save_authoring_instructional_analysis_v1',
    'manage_authoring_design_parameter_assignment_v1',
    'save_authoring_resource_set_v1',
    'get_authoring_resource_set_v1',
    'preview_authoring_effective_design_v1',
    'resolve_authoring_effective_design_v1',
    'save_authoring_pedagogical_blueprint_v1',
    'register_authoring_materialization_manifest_v1',
    'get_authoring_effective_design_snapshot_v1',
    'get_authoring_materialization_manifest_v1',
    'get_authoring_design_state_v1'
  ];
  v_private_names constant text[] := array[
    'valid_authoring_continuity_without_design_extensions_v1',
    'valid_authoring_decision_extensions_v1',
    'valid_authoring_continuity_v1',
    'begin_authoring_design_mutation_v1',
    'complete_authoring_design_mutation_v1',
    'authoring_design_contains_forbidden_key_v1',
    'authoring_design_closed_object_v1',
    'authoring_design_text_array_v1',
    'valid_authoring_instructional_analysis_v1',
    'valid_authoring_pedagogical_blueprint_v2',
    'valid_authoring_blueprint_binding_v1',
    'reject_authoring_design_update_v1',
    'authoring_design_json_hash_v1',
    'authoring_materialized_content_hash_v1',
    'authoring_design_mutation_hash_v1',
    'canonical_authoring_parameter_value_v1',
    'bump_authoring_materialization_state_v1',
    'authoring_design_scope_path_v1',
    'authoring_design_scope_entity_version_v1',
    'valid_authoring_parameter_value_v1',
    'resolve_authoring_design_values_v1',
    'authoring_effective_design_snapshot_json_v1',
    'prune_authoring_design_state_v1'
  ];
begin
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'public'
      and procedure_value.proname = any(v_public_names)
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      v_function.signature
    );
  end loop;
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'private'
      and procedure_value.proname = any(v_private_names)
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function.signature
    );
  end loop;
end;
$secure_parameterized_authoring_functions$;

-- Mantém um único manifesto flat: captura o valor instalado, atualiza-o e
-- recompila a função com JSON literal, sem reintroduzir cadeias de wrappers.
do $install_parameterized_authoring_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  if to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'Manifesto de runtime ausente.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest ->> 'schemaRevision'::text <> '20260812164000'
     or not (
       (v_manifest -> 'features'::text) ? 'flat-runtime-manifest-v1'::text
     ) then
    raise exception 'Manifesto de runtime base inesperado.' using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(
      v_manifest, array['schemaRevision']::text[],
      '"20260815193000"'::jsonb
    ),
    array['features']::text[],
    ((v_manifest -> 'features'::text)
      - 'parameterized-authoring-design-v1'::text)
      || '["parameterized-authoring-design-v1"]'::jsonb
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$install_parameterized_authoring_runtime_manifest$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

do $assert_parameterized_authoring_installation$
declare
  v_request_constraint text;
  v_event_constraint text;
  v_operation text;
begin
  select pg_get_constraintdef(constraint_value.oid)
  into v_request_constraint
  from pg_constraint constraint_value
  where constraint_value.conname = 'authoring_workspace_requests_operation_v5'
    and constraint_value.conrelid =
      'private.authoring_workspace_requests'::regclass;
  select pg_get_constraintdef(constraint_value.oid)
  into v_event_constraint
  from pg_constraint constraint_value
  where constraint_value.conname = 'authoring_workspace_events_operation_v5'
    and constraint_value.conrelid =
      'private.authoring_workspace_events'::regclass;
  foreach v_operation in array array[
    'replace_catalog_document', 'update_continuity', 'create_finding',
    'save_instructional_analysis', 'set_design_parameter',
    'remove_design_parameter', 'save_resource_set',
    'save_pedagogical_blueprint', 'resolve_effective_design',
    'register_materialization_manifest'
  ]
  loop
    if position(quote_literal(v_operation) in v_request_constraint) = 0
       or position(quote_literal(v_operation) in v_event_constraint) = 0 then
      raise exception 'Allowlist final incompleta para %.', v_operation
        using errcode = '55000';
    end if;
  end loop;
  if (select count(*) from private.authoring_design_parameter_definitions) <> 9
     or exists (
       select 1 from private.authoring_design_parameter_definitions definition
       where definition.catalog_version <> '1.0.0'
     ) then
    raise exception 'Catálogo inicial de parâmetros divergente.'
      using errcode = '55000';
  end if;
  if public.get_aralearn_runtime_manifest() ->> 'schemaRevision'::text
       <> '20260815193000'
     or not (
       (public.get_aralearn_runtime_manifest() -> 'features'::text)
         ? 'parameterized-authoring-design-v1'::text
     ) then
    raise exception 'Manifesto de runtime não anuncia o desenho parametrizado.'
      using errcode = '55000';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.get_authoring_design_state_v1(uuid,uuid,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.get_authoring_design_state_v1(uuid,uuid,text,text)',
       'EXECUTE'
     ) then
    raise exception 'Privilégios dos RPCs de desenho divergentes.'
      using errcode = '55000';
  end if;
end;
$assert_parameterized_authoring_installation$;

commit;
