-- Corte terminológico único: operações-alvo da tarefa substituem o rótulo
-- que confundia requisito observável da tarefa com processo mental inferido.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-task-operation-terminology-v1', 0
));

do $reject_reapplied_task_operation_cutover$
declare
  v_manifest jsonb;
begin
  if to_regprocedure('public.get_aralearn_runtime_manifest()') is not null then
    v_manifest := public.get_aralearn_runtime_manifest();
    if v_manifest->>'schemaRevision' = '20260817130000'
       and v_manifest->'features' ? 'task-operation-terminology-v1' then
      raise exception 'O corte de operações-alvo já foi aplicado.'
        using errcode = '55000';
    end if;
  end if;
end;
$reject_reapplied_task_operation_cutover$;

do $require_task_operation_dependencies$
begin
  if to_regprocedure(
       'private.valid_authoring_instructional_analysis_v1(jsonb)'
     ) is null
     or to_regprocedure(
       'private.valid_authoring_pedagogical_blueprint_v2(jsonb)'
     ) is null
     or to_regprocedure(
       'public.save_authoring_resource_set_v1(uuid,uuid,text,text,bigint,jsonb)'
     ) is null
     or to_regclass('private.authoring_instructional_analyses') is null
     or to_regclass('private.authoring_resource_sets') is null
     or to_regclass('private.authoring_pedagogical_blueprints') is null
     or to_regclass('private.authoring_materialization_manifests') is null then
    raise exception 'Dependências do corte de operações-alvo ausentes.'
      using errcode = '55000';
  end if;
end;
$require_task_operation_dependencies$;

-- O helper principal só recebe cargas de contratos acadêmicos fechados:
-- InstructionalAnalysis@1, ResourceSet@1 (facetBasis),
-- PedagogicalBlueprint@2 e MaterializationManifest@1. Ele localiza as chaves
-- taxonômicas; somente seus valores passam pelo helper de identificadores.
-- Textos livres, comandos, events e receipts não são reinterpretados.
create function private.authoring_task_operation_id_cutover_json_v1(
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_value)
    when 'array' then
      select coalesce(jsonb_agg(
        private.authoring_task_operation_id_cutover_json_v1(item.value)
        order by item.ordinal
      ), '[]'::jsonb)
      into v_result
      from jsonb_array_elements(p_value) with ordinality item(value, ordinal);
      return v_result;
    when 'string' then
      return to_jsonb(regexp_replace(
        p_value #>> '{}', '^operation\.', 'task_operation.'
      ));
    else
      return p_value;
  end case;
end;
$function$;

revoke all on function
  private.authoring_task_operation_id_cutover_json_v1(jsonb)
  from public, anon, authenticated, service_role;

create function private.authoring_task_operation_cutover_json_v1(
  p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(jsonb_object_agg(
        case field.key
          when 'cognitiveOperations' then 'taskOperations'
          when 'cognitiveOperation' then 'taskOperation'
          when 'operationIds' then 'taskOperationIds'
          else field.key
        end,
        case
          when field.key in (
            'cognitiveOperations', 'cognitiveOperation', 'operationIds',
            'taskOperations', 'taskOperation', 'taskOperationIds'
          ) then private.authoring_task_operation_id_cutover_json_v1(
            field.value
          )
          else private.authoring_task_operation_cutover_json_v1(field.value)
        end
      ), '{}'::jsonb)
      into v_result
      from jsonb_each(p_value) field;
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(
        private.authoring_task_operation_cutover_json_v1(item.value)
        order by item.ordinal
      ), '[]'::jsonb)
      into v_result
      from jsonb_array_elements(p_value) with ordinality item(value, ordinal);
      return v_result;
    else
      return p_value;
  end case;
end;
$function$;

revoke all on function private.authoring_task_operation_cutover_json_v1(jsonb)
  from public, anon, authenticated, service_role;

alter table private.authoring_instructional_analyses
  disable trigger authoring_instructional_analyses_immutable_v1;
alter table private.authoring_resource_sets
  disable trigger authoring_resource_sets_immutable_v1;
alter table private.authoring_pedagogical_blueprints
  disable trigger authoring_pedagogical_blueprints_immutable_v1;
alter table private.authoring_materialization_manifests
  disable trigger authoring_materialization_manifests_immutable_v1;

alter table private.authoring_resource_sets
  drop constraint authoring_resource_sets_facets_v1;

with converted as (
  select
    analysis.ctid,
    private.authoring_task_operation_cutover_json_v1(analysis.payload) payload
  from private.authoring_instructional_analyses analysis
), normalized as (
  select
    converted.ctid,
    jsonb_set(
      converted.payload,
      array['evidenceRequirements']::text[],
      coalesce((
        select jsonb_agg(
          case when requirement.value ? 'operation' then
            (requirement.value - 'operation') || jsonb_build_object(
              'taskOperation',
              private.authoring_task_operation_id_cutover_json_v1(
                requirement.value->'operation'
              )
            )
          else requirement.value end
          order by requirement.ordinal
        )
        from jsonb_array_elements(
          converted.payload->'evidenceRequirements'
        ) with ordinality requirement(value, ordinal)
      ), '[]'::jsonb)
    ) payload
  from converted
)
update private.authoring_instructional_analyses analysis
set
  payload = normalized.payload,
  payload_hash = private.authoring_design_json_hash_v1(normalized.payload)
from normalized
where analysis.ctid = normalized.ctid;

update private.authoring_resource_sets resource_set
set facet_basis = private.authoring_task_operation_cutover_json_v1(
  resource_set.facet_basis
);

with reconstructed as (
  select
    resource_set.ctid,
    jsonb_build_object(
      'contract', 'ResourceSet@1',
      'modelVersion', resource_set.model_version,
      'id', resource_set.resource_set_id,
      'version', resource_set.resource_set_version,
      'scope', jsonb_build_object(
        'kind', resource_set.scope_kind,
        'ref', resource_set.scope_ref
      ),
      'packages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'packageId', member.package_id,
          'version', member.package_version
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
    ) payload
  from private.authoring_resource_sets resource_set
)
update private.authoring_resource_sets resource_set
set payload_hash = private.authoring_design_json_hash_v1(reconstructed.payload)
from reconstructed
where resource_set.ctid = reconstructed.ctid;

update private.authoring_pedagogical_blueprints blueprint
set
  payload = private.authoring_task_operation_cutover_json_v1(blueprint.payload),
  payload_hash = private.authoring_design_json_hash_v1(
    private.authoring_task_operation_cutover_json_v1(blueprint.payload)
  );

update private.authoring_materialization_manifests manifest
set
  blueprint_hash = blueprint.payload_hash,
  payload = private.authoring_task_operation_cutover_json_v1(jsonb_set(
      manifest.payload,
      array['blueprintHash']::text[],
      to_jsonb(blueprint.payload_hash)
  )),
  payload_hash = private.authoring_design_json_hash_v1(
    private.authoring_task_operation_cutover_json_v1(jsonb_set(
      manifest.payload,
      array['blueprintHash']::text[],
      to_jsonb(blueprint.payload_hash)
    ))
  )
from private.authoring_pedagogical_blueprints blueprint
where blueprint.workspace_id = manifest.workspace_id
  and blueprint.blueprint_id = manifest.blueprint_id
  and blueprint.blueprint_version = manifest.blueprint_version;

alter table private.authoring_resource_sets
  add constraint authoring_resource_sets_facets_v1 check (
    jsonb_typeof(facet_basis) = 'object'
    and pg_column_size(facet_basis) <= 65536
    and facet_basis ?& array[
      'catalogVersion', 'families', 'disciplines', 'structures',
      'taskOperations', 'practiceModalities'
    ]
    and facet_basis->>'catalogVersion' = resolved_catalog_version
    and jsonb_typeof(facet_basis->'families') = 'array'
    and jsonb_typeof(facet_basis->'disciplines') = 'array'
    and jsonb_typeof(facet_basis->'structures') = 'array'
    and jsonb_typeof(facet_basis->'taskOperations') = 'array'
    and jsonb_typeof(facet_basis->'practiceModalities') = 'array'
    and not private.authoring_design_contains_forbidden_key_v1(facet_basis)
  );

alter table private.authoring_instructional_analyses
  enable trigger authoring_instructional_analyses_immutable_v1;
alter table private.authoring_resource_sets
  enable trigger authoring_resource_sets_immutable_v1;
alter table private.authoring_pedagogical_blueprints
  enable trigger authoring_pedagogical_blueprints_immutable_v1;
alter table private.authoring_materialization_manifests
  enable trigger authoring_materialization_manifests_immutable_v1;

do $replace_task_operation_contracts$
declare
  v_definition text;
  v_replaced text;
  v_count integer;
begin
  select pg_get_functiondef(
    'private.valid_authoring_instructional_analysis_v1(jsonb)'::regprocedure
  ) into strict v_definition;
  v_count := (
    length(v_definition) - length(replace(
      v_definition, 'cognitiveOperations', ''
    ))
  ) / length('cognitiveOperations');
  if v_count <> 3 then
    raise exception
      'Validador de análise contém % ocorrências; eram esperadas 3.', v_count
      using errcode = '55000';
  end if;
  v_count := (
    length(v_definition) - length(replace(v_definition, '''operation''', ''))
  ) / length('''operation''');
  if v_count <> 3 then
    raise exception
      'Validador de análise contém % campos operation; eram esperados 3.', v_count
      using errcode = '55000';
  end if;
  v_replaced := replace(
    replace(v_definition, 'cognitiveOperations', 'taskOperations'),
    '''operation''', '''taskOperation'''
  );
  if v_replaced = v_definition
     or position('cognitiveOperations' in v_replaced) > 0
     or position('''operation''' in v_replaced) > 0 then
    raise exception 'Substituição do contrato de análise foi incompleta.'
      using errcode = '55000';
  end if;
  execute v_replaced;

  select pg_get_functiondef(
    'private.valid_authoring_pedagogical_blueprint_v2(jsonb)'::regprocedure
  ) into strict v_definition;
  v_count := (
    length(v_definition) - length(replace(
      v_definition, 'cognitiveOperations', ''
    ))
  ) / length('cognitiveOperations');
  if v_count <> 3 then
    raise exception
      'Validador de blueprint contém % listas antigas; eram esperadas 3.',
      v_count using errcode = '55000';
  end if;
  v_replaced := replace(
    replace(v_definition, 'cognitiveOperations', 'taskOperations'),
    'cognitiveOperation', 'taskOperation'
  );
  if v_replaced = v_definition
     or position('cognitiveOperation' in v_replaced) > 0 then
    raise exception 'Substituição do contrato de blueprint foi incompleta.'
      using errcode = '55000';
  end if;
  execute v_replaced;

  select pg_get_functiondef(
    'public.save_authoring_resource_set_v1(uuid,uuid,text,text,bigint,jsonb)'
      ::regprocedure
  ) into strict v_definition;
  v_count := (
    length(v_definition) - length(replace(
      v_definition, 'cognitiveOperations', ''
    ))
  ) / length('cognitiveOperations');
  if v_count <> 2 then
    raise exception
      'RPC de ResourceSet contém % listas antigas; eram esperadas 2.', v_count
      using errcode = '55000';
  end if;
  v_replaced := replace(
    v_definition, 'cognitiveOperations', 'taskOperations'
  );
  if v_replaced = v_definition
     or position('cognitiveOperations' in v_replaced) > 0 then
    raise exception 'Substituição do contrato de ResourceSet foi incompleta.'
      using errcode = '55000';
  end if;
  execute v_replaced;
end;
$replace_task_operation_contracts$;

update private.authoring_workspace_requests request
set result = jsonb_set(
  request.result, array['payloadHash']::text[], to_jsonb(analysis.payload_hash)
)
from private.authoring_instructional_analyses analysis
where request.workspace_id = analysis.workspace_id
  and request.operation = 'save_instructional_analysis'
  and request.result#>>'{analysisRef,id}' = analysis.analysis_id
  and request.result#>>'{analysisRef,version}' = analysis.analysis_version
  and request.result ? 'payloadHash';

update private.authoring_workspace_requests request
set result = jsonb_set(
  request.result, array['payloadHash']::text[], to_jsonb(resource_set.payload_hash)
)
from private.authoring_resource_sets resource_set
where request.workspace_id = resource_set.workspace_id
  and request.operation = 'save_resource_set'
  and request.result#>>'{resourceSetRef,id}' = resource_set.resource_set_id
  and request.result#>>'{resourceSetRef,version}' = resource_set.resource_set_version
  and request.result ? 'payloadHash';

update private.authoring_workspace_requests request
set result = jsonb_set(
  request.result, array['blueprintHash']::text[], to_jsonb(blueprint.payload_hash)
)
from private.authoring_pedagogical_blueprints blueprint
where request.workspace_id = blueprint.workspace_id
  and request.operation = 'save_pedagogical_blueprint'
  and request.result#>>'{blueprintRef,id}' = blueprint.blueprint_id
  and request.result#>>'{blueprintRef,version}' = blueprint.blueprint_version
  and request.result ? 'blueprintHash';

update private.authoring_workspace_requests request
set result = jsonb_set(
  request.result, array['payloadHash']::text[], to_jsonb(manifest.payload_hash)
)
from private.authoring_materialization_manifests manifest
where request.workspace_id = manifest.workspace_id
  and request.operation = 'register_materialization_manifest'
  and request.result#>>'{manifestRef,id}' = manifest.manifest_id
  and request.result#>>'{manifestRef,version}' = manifest.manifest_version
  and request.result ? 'payloadHash';

-- Estes validadores pertenciam ao protocolo de autoria retirado no corte de
-- julho e ficaram sem consumidor quando sua RPC pública foi eliminada. Não há
-- contrato corrente a renomear nem motivo para conservar código inalcançável.
drop function if exists
  private.authoring_plan_learning_references_are_valid(jsonb,jsonb);
drop function if exists
  private.authoring_part_learning_references_are_valid(jsonb,jsonb,jsonb);

do $verify_task_operation_data_cutover$
begin
  -- A prova pergunta ao mesmo conversor se ainda restou alguma chave ou algum
  -- identificador taxonômico conversível. Como o conversor ignora strings fora
  -- dessas chaves, objective, description, rationale e demais textos livres
  -- podem citar APIs sem serem reescritos nem bloquear o corte. O protocolo
  -- antigo de operationIds em apply_authoring_command foi retirado com aquela
  -- superfície em julho; seus dois validadores órfãos são removidos acima sem
  -- reinterpretar conteúdo editorial.
  if exists (
       select 1 from private.authoring_instructional_analyses analysis
       where private.authoring_task_operation_cutover_json_v1(
               analysis.payload
             ) <> analysis.payload
          or jsonb_path_exists(
               analysis.payload,
               '$.evidenceRequirements[*].operation'
             )
     )
     or exists (
       select 1 from private.authoring_pedagogical_blueprints blueprint
       where private.authoring_task_operation_cutover_json_v1(
               blueprint.payload
             ) <> blueprint.payload
     )
     or exists (
       select 1 from private.authoring_resource_sets resource_set
       where private.authoring_task_operation_cutover_json_v1(
               resource_set.facet_basis
             ) <> resource_set.facet_basis
     )
     or exists (
       select 1 from private.authoring_materialization_manifests manifest
       where private.authoring_task_operation_cutover_json_v1(
               manifest.payload
             ) <> manifest.payload
     ) then
    raise exception 'O corte de operações-alvo deixou dados no contrato anterior.'
      using errcode = '23514';
  end if;
end;
$verify_task_operation_data_cutover$;

drop function private.authoring_task_operation_cutover_json_v1(jsonb);
drop function private.authoring_task_operation_id_cutover_json_v1(jsonb);

do $verify_task_operation_function_cutover$
declare
  v_function record;
begin
  -- Funções ativas não podem expor as chaves abolidas. Literais operation.*
  -- não são proibidos globalmente: podem identificar protocolos técnicos
  -- alheios à taxonomia acadêmica.
  for v_function in
    select
      routine.oid,
      namespace.nspname schema_name,
      routine.proname function_name,
      pg_get_functiondef(routine.oid) definition
    from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'private')
      and routine.prokind in ('f', 'p')
  loop
    if v_function.definition ~
       $legacy_terms$cognitiveOperations|cognitiveOperation|operationIds$legacy_terms$
    then
      raise exception
        'Vocabulário anterior persiste na função %.% (oid %).',
        v_function.schema_name,
        v_function.function_name,
        v_function.oid
        using errcode = '23514';
    end if;
  end loop;
end;
$verify_task_operation_function_cutover$;

do $advance_task_operation_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  if to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'Manifesto de runtime ausente.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260815235900'
     or not (v_manifest->'features' ? 'parameterized-authoring-design-v1') then
    raise exception 'Manifesto autoral inesperado.' using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(
      v_manifest,
      array['schemaRevision']::text[],
      '"20260817130000"'::jsonb
    ),
    array['features']::text[],
    ((v_manifest->'features') - 'task-operation-terminology-v1')
      || '["task-operation-terminology-v1"]'::jsonb
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public, anon, authenticated, service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon, authenticated, service_role;
end;
$advance_task_operation_runtime_manifest$;

commit;
