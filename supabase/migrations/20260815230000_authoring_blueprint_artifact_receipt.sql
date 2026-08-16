-- Receipt imutável do blueprint para retomada do manifesto sem depender da conversa.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-authoring-blueprint-artifact-receipt-v1', 0
));

do $require_blueprint_artifact_dependencies$
begin
  if to_regclass('private.authoring_pedagogical_blueprints') is null
     or to_regclass('private.authoring_pedagogical_blueprint_bindings') is null
     or to_regprocedure(
       'private.require_educational_workspace_capability_v1(uuid,uuid,text)'
     ) is null then
    raise exception 'Dependências do receipt de blueprint ausentes.'
      using errcode = '55000';
  end if;
end;
$require_blueprint_artifact_dependencies$;

-- #104: qualquer fit não canônico é fallback representacional. A
-- constraint passa a proteger novas escritas sem invalidar a aplicação da
-- migration caso um ambiente anterior contenha linhas versatile legadas.
alter table private.authoring_manifest_resource_selections
  drop constraint authoring_manifest_resource_selections_contract_v1;
alter table private.authoring_manifest_resource_selections
  add constraint authoring_manifest_resource_selections_contract_v1 check (
    role in ('exposition', 'embedded_practice', 'response')
    and fit in ('canonical', 'versatile', 'substitute')
    and nullif(btrim(rationale), '') is not null
    and char_length(rationale) <= 1000
    and cardinality(limitations) <= 12
    and (
      (fit = 'canonical' and cardinality(limitations) = 0)
      or (fit <> 'canonical' and cardinality(limitations) > 0)
    )
  ) not valid;

create function private.enforce_authoring_manifest_selection_fallback_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $function$
declare
  v_fallback_policy text;
  v_no_adequate_representation text;
  v_allowed_fits text[];
begin
  if new.fit = 'canonical' then
    return new;
  end if;
  select
    snapshot_value.value->>'value',
    resource_set.no_adequate_representation,
    resource_set.allowed_fits
  into
    v_fallback_policy,
    v_no_adequate_representation,
    v_allowed_fits
  from private.authoring_materialization_manifests manifest
  join private.authoring_effective_design_snapshot_values snapshot_value
    on snapshot_value.workspace_id = manifest.workspace_id
   and snapshot_value.snapshot_id = manifest.snapshot_id
   and snapshot_value.snapshot_version = manifest.snapshot_version
   and snapshot_value.parameter_id = 'representation_fallback_policy'
   and snapshot_value.parameter_version = '1.0.0'
  join private.authoring_resource_sets resource_set
    on resource_set.workspace_id = new.workspace_id
   and resource_set.resource_set_id = new.resource_set_id
   and resource_set.resource_set_version = new.resource_set_version
  where manifest.workspace_id = new.workspace_id
    and manifest.manifest_id = new.manifest_id
    and manifest.manifest_version = new.manifest_version;
  if not found
     or not (new.fit = any(v_allowed_fits))
     or v_no_adequate_representation <> 'record_limitation'
     or cardinality(new.limitations) = 0
     or (new.fit = 'versatile' and v_fallback_policy not in (
       'allow_versatile_with_limitation',
       'allow_substitute_with_limitation'
     ))
     or (new.fit = 'substitute'
       and v_fallback_policy <> 'allow_substitute_with_limitation') then
    raise exception
      'Seleção não canônica viola a política efetiva de representação.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function
  private.enforce_authoring_manifest_selection_fallback_v1()
  from public, anon, authenticated, service_role;

create trigger authoring_manifest_selection_fallback_v1
before insert or update on private.authoring_manifest_resource_selections
for each row execute function
  private.enforce_authoring_manifest_selection_fallback_v1();

create function public.get_authoring_pedagogical_blueprint_artifact_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_blueprint_id text,
  p_blueprint_version text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_blueprint private.authoring_pedagogical_blueprints%rowtype;
  v_binding private.authoring_pedagogical_blueprint_bindings%rowtype;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  if nullif(btrim(p_blueprint_id), '') is null
     or nullif(btrim(p_blueprint_version), '') is null then
    raise exception 'Referência do blueprint inválida.' using errcode = '22023';
  end if;
  select * into v_blueprint
  from private.authoring_pedagogical_blueprints blueprint
  where blueprint.workspace_id = p_workspace_id
    and blueprint.blueprint_id = p_blueprint_id
    and blueprint.blueprint_version = p_blueprint_version;
  if not found then
    raise exception 'Blueprint pedagógico inexistente.' using errcode = 'P0002';
  end if;
  select * into v_binding
  from private.authoring_pedagogical_blueprint_bindings binding
  where binding.workspace_id = p_workspace_id
    and binding.blueprint_id = v_blueprint.blueprint_id
    and binding.blueprint_version = v_blueprint.blueprint_version;
  if not found then
    raise exception 'Binding do blueprint inexistente.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'blueprintRef', jsonb_build_object(
      'id', v_blueprint.blueprint_id,
      'version', v_blueprint.blueprint_version
    ),
    'bindingRef', jsonb_build_object(
      'id', v_binding.binding_id,
      'version', v_binding.binding_version
    ),
    'analysisRef', jsonb_build_object(
      'id', v_blueprint.analysis_id,
      'version', v_blueprint.analysis_version
    ),
    'effectiveSnapshotRef', jsonb_build_object(
      'id', v_blueprint.snapshot_id,
      'version', v_blueprint.snapshot_version
    ),
    'scope', jsonb_build_object(
      'kind', 'microsequence',
      'ref', v_blueprint.microsequence_ref
    ),
    'scopeEntityVersion', v_blueprint.scope_entity_version,
    'basedOnWorkspaceRevision', v_blueprint.based_on_workspace_revision,
    'createdRevision', v_blueprint.created_revision,
    'blueprintHash', v_blueprint.payload_hash,
    'bindingHash', v_binding.payload_hash
  );
end;
$function$;

revoke all on function public.get_authoring_pedagogical_blueprint_artifact_v1(
  uuid, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_authoring_pedagogical_blueprint_artifact_v1(
  uuid, uuid, text, text
) to service_role;

do $advance_blueprint_artifact_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  if to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'Manifesto de runtime ausente.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest ->> 'schemaRevision' <> '20260815193000'
     or not (v_manifest -> 'features' ? 'parameterized-authoring-design-v1') then
    raise exception 'Manifesto parametrizado inesperado.' using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(
      v_manifest,
      array['schemaRevision']::text[],
      '"20260815230000"'::jsonb
    ),
    array['features']::text[],
    ((v_manifest -> 'features') - 'authoring-blueprint-artifact-receipt-v1')
      || '["authoring-blueprint-artifact-receipt-v1"]'::jsonb
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
    to service_role;
end;
$advance_blueprint_artifact_runtime_manifest$;

commit;
