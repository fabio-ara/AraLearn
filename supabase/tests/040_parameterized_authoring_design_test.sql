begin;

select plan(64);

select has_table('private', 'authoring_design_parameter_definitions');
select has_table('private', 'authoring_design_request_arguments');
select has_table('private', 'authoring_instructional_analyses');
select has_table('private', 'authoring_design_parameter_assignments');
select has_table('private', 'authoring_resource_sets');
select has_table('private', 'authoring_resource_set_members');
select has_table('private', 'authoring_effective_design_snapshots');
select has_table('private', 'authoring_effective_design_snapshot_values');
select has_table('private', 'authoring_effective_design_snapshot_resource_sets');
select has_table('private', 'authoring_pedagogical_blueprints');
select has_table('private', 'authoring_pedagogical_blueprint_bindings');
select has_table('private', 'authoring_microsequence_design_bindings');
select has_table('private', 'authoring_materialization_states');
select has_table('private', 'authoring_materialization_manifests');
select has_table('private', 'authoring_manifest_resource_selections');
select has_table('private', 'authoring_manifest_materialized_resources');
select has_table('private', 'authoring_manifest_coverage');
select has_table('private', 'authoring_manifest_metrics');

select has_column(
  'private', 'authoring_design_parameter_assignments', 'model_version',
  'assignment append-only conserva a versão do contrato'
);
select has_column(
  'private', 'authoring_instructional_analyses', 'scope_entity_version',
  'análise congela a versão da entidade analisada'
);
select has_column(
  'private', 'authoring_effective_design_snapshots',
  'based_on_workspace_revision',
  'snapshot congela a revisão corrente usada na resolução'
);
select has_column(
  'private', 'authoring_materialization_manifests', 'content_hash',
  'manifesto liga a materialização ao conteúdo efetivo'
);
select has_column(
  'private', 'authoring_materialization_manifests',
  'materialization_state_revision',
  'manifesto congela o marcador transacional do conteúdo materializado'
);
select has_column(
  'private', 'authoring_manifest_resource_selections', 'resource_set_id',
  'cada seleção declara o ResourceSet autorizador'
);
select has_column(
  'private', 'authoring_pedagogical_blueprint_bindings', 'payload',
  'binding versionado conserva mappings completos para retomada e diff'
);
select has_column(
  'private', 'authoring_microsequence_design_bindings', 'binding_id',
  'projeção corrente aponta ao binding imutável exato'
);

select has_function(
  'public', 'list_authoring_design_parameter_definitions_v1',
  array['uuid','uuid','text']
);
select has_function(
  'public', 'get_authoring_instructional_analysis_v1',
  array['uuid','uuid','text','text','text','text']
);
select has_function(
  'public', 'list_authoring_design_parameter_assignments_v1',
  array['uuid','uuid','text','text']
);
select has_function(
  'public', 'save_authoring_instructional_analysis_v1',
  array['uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'manage_authoring_design_parameter_assignment_v1',
  array['uuid','uuid','text','text','bigint','text','jsonb']
);
select has_function(
  'public', 'save_authoring_resource_set_v1',
  array['uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'get_authoring_resource_set_v1',
  array['uuid','uuid','text','text']
);
select has_function(
  'public', 'preview_authoring_effective_design_v1',
  array['uuid','uuid','text','text']
);
select has_function(
  'public', 'resolve_authoring_effective_design_v1',
  array['uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'save_authoring_pedagogical_blueprint_v1',
  array['uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'register_authoring_materialization_manifest_v1',
  array['uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'get_authoring_effective_design_snapshot_v1',
  array['uuid','uuid','text','text']
);
select has_function(
  'public', 'get_authoring_materialization_manifest_v1',
  array['uuid','uuid','text','text']
);
select has_function(
  'public', 'get_authoring_design_state_v1',
  array['uuid','uuid','text','text']
);
select has_function(
  'private', 'resolve_authoring_design_values_v1',
  array['uuid','text','text']
);
select has_function(
  'private', 'prune_authoring_design_state_v1',
  array['uuid','timestamp with time zone','integer']
);
select has_function(
  'private', 'valid_authoring_continuity_v1', array['jsonb']
);
select has_function(
  'private', 'valid_authoring_pedagogical_blueprint_v2', array['jsonb']
);
select has_function(
  'private', 'valid_authoring_blueprint_binding_v1',
  array['jsonb','jsonb','jsonb']
);
select has_function(
  'private', 'authoring_materialized_content_hash_v1', array['uuid','text']
);
select has_function(
  'private', 'canonical_authoring_parameter_value_v1', array['jsonb']
);

select is(
  (select count(*)::integer
   from private.authoring_design_parameter_definitions),
  9,
  'o catálogo científico inicial contém as nove definições versionadas'
);

select ok(
  not exists (
    select 1
    from private.authoring_design_parameter_definitions definition
    where definition.catalog_version <> '1.0.0'
      or definition.definition->>'contract'
        <> 'DesignParameterDefinition@1'
      or definition.definition#>>'{epistemicClassification,claimBoundary}' is null
      or jsonb_array_length(definition.definition->'theoreticalAnchors') = 0
      or definition.definition#>>'{resolutionRule,sameScopeConflict}'
        <> 'error'
  ),
  'cada definição preserva versão, fronteira epistêmica, âncora e resolução'
);

select ok(
  (
    select bool_and(
      pg_get_constraintdef(constraint_value.oid)
        like '%replace_catalog_document%'
      and pg_get_constraintdef(constraint_value.oid) like '%update_continuity%'
      and pg_get_constraintdef(constraint_value.oid) like '%create_finding%'
      and pg_get_constraintdef(constraint_value.oid)
        like '%save_instructional_analysis%'
      and pg_get_constraintdef(constraint_value.oid)
        like '%register_materialization_manifest%'
    )
    from pg_constraint constraint_value
    where constraint_value.conname in (
      'authoring_workspace_requests_operation_v5',
      'authoring_workspace_events_operation_v5'
    )
  ),
  'allowlists finais unem catálogo, continuidade, auditoria e desenho'
);

select ok(
  pg_get_functiondef(
    'private.valid_authoring_continuity_v1(jsonb)'::regprocedure
  ) like '%representationSelection%'
  and pg_get_functiondef(
    'private.valid_authoring_continuity_v1(jsonb)'::regprocedure
  ) like '%pedagogicalDiagnosis%'
  and pg_get_functiondef(
    'private.valid_authoring_decision_extensions_v1(jsonb)'::regprocedure
  ) like '%entityType%entityId%',
  'continuidade aceita somente extensões normativas com vínculo de entidade'
);

select ok(
  pg_get_functiondef(
    'private.authoring_design_contains_forbidden_key_v1(jsonb)'::regprocedure
  ) like '%chainofthought%chainofthoughts%internalmonologue%reasoning%'
    || 'reasoningcontent%reasoningtrace%hiddenreasoning%privatereasoning%'
    || 'systemprompt%developerprompt%chatmessages%conversationmessages%',
  'estado persistente rejeita prompt, resposta bruta e cadeia de pensamento'
);

select is(
  (
    select count(*)::integer
    from pg_trigger trigger_value
    where not trigger_value.tgisinternal
      and trigger_value.tgname in (
        'authoring_design_parameter_definitions_immutable_v1',
        'authoring_instructional_analyses_immutable_v1',
        'authoring_design_parameter_assignments_immutable_v1',
        'authoring_resource_sets_immutable_v1',
        'authoring_resource_set_members_immutable_v1',
        'authoring_effective_design_snapshots_immutable_v1',
        'authoring_effective_design_snapshot_values_immutable_v1',
        'authoring_effective_design_snapshot_sets_immutable_v1',
        'authoring_pedagogical_blueprints_immutable_v1',
        'authoring_pedagogical_blueprint_bindings_immutable_v1',
        'authoring_materialization_manifests_immutable_v1',
        'authoring_manifest_resource_selections_immutable_v1',
        'authoring_manifest_materialized_resources_immutable_v1',
        'authoring_manifest_coverage_immutable_v1',
        'authoring_manifest_metrics_immutable_v1'
      )
  ),
  15,
  'objetos versionados são imutáveis; só binding corrente pode mudar'
);

select ok(
  pg_get_functiondef(
    'public.save_authoring_pedagogical_blueprint_v1(uuid,uuid,text,text,bigint,jsonb)'::regprocedure
  ) like '%valid_authoring_pedagogical_blueprint_v2%'
  and pg_get_functiondef(
    'public.save_authoring_pedagogical_blueprint_v1(uuid,uuid,text,text,bigint,jsonb)'::regprocedure
  ) like '%valid_authoring_blueprint_binding_v1%'
  and pg_get_functiondef(
    'public.save_authoring_pedagogical_blueprint_v1(uuid,uuid,text,text,bigint,jsonb)'::regprocedure
  ) like '%authoring_pedagogical_blueprint_bindings%',
  'blueprint v2 e binding fechado são validados e persistidos juntos'
);

select ok(
  pg_get_functiondef(
    'private.resolve_authoring_design_values_v1(uuid,text,text)'::regprocedure
  ) like '%same_scope_assignment_conflict%'
  and pg_get_functiondef(
    'private.resolve_authoring_design_values_v1(uuid,text,text)'::regprocedure
  ) like '%research_lock_conflict%'
  and pg_get_functiondef(
    'private.resolve_authoring_design_values_v1(uuid,text,text)'::regprocedure
  ) like '%research_lock_blocks_lower_assignment%'
  and pg_get_functiondef(
    'private.resolve_authoring_design_values_v1(uuid,text,text)'::regprocedure
  ) like '%when ''manual_override'' then 1%'
  and pg_get_functiondef(
    'private.resolve_authoring_design_values_v1(uuid,text,text)'::regprocedure
  ) like '%when ''microsequence'' then 4%',
  'resolver implementa cadeia completa, conflito no escopo e gate de locks'
);

select ok(
  pg_get_functiondef(
    'public.register_authoring_materialization_manifest_v1(uuid,uuid,text,text,bigint,jsonb)'::regprocedure
  ) like '%authorizedByResourceSetRef%'
  and pg_get_functiondef(
    'public.register_authoring_materialization_manifest_v1(uuid,uuid,text,text,bigint,jsonb)'::regprocedure
  ) like '%no_adequate_representation = ''block''%'
  and pg_get_functiondef(
    'public.register_authoring_materialization_manifest_v1(uuid,uuid,text,text,bigint,jsonb)'::regprocedure
  ) like '%ResourceSets do manifesto divergem do snapshot%'
  and pg_get_functiondef(
    'public.register_authoring_materialization_manifest_v1(uuid,uuid,text,text,bigint,jsonb)'::regprocedure
  ) like '%aralearn.response.%%role%response%',
  'manifesto aplica conjunto exato e a política do ResourceSet autorizador local'
);

select ok(
  public.get_aralearn_runtime_manifest()->>'schemaRevision'
    = '20260815193000'
  and public.get_aralearn_runtime_manifest()->'features'
    ? 'parameterized-authoring-design-v1',
  'manifesto flat anuncia a revisão e a feature parametrizada'
);

select function_privs_are(
  'public', 'get_authoring_design_state_v1',
  array['uuid','uuid','text','text'], 'service_role', array['EXECUTE'],
  'somente o executor interno lê o estado em nome do OAuth'
);

select function_privs_are(
  'private', 'resolve_authoring_design_values_v1',
  array['uuid','text','text'], 'service_role', array[]::text[],
  'resolver interno não é exposto como RPC direta'
);

select function_privs_are(
  'private', 'canonical_authoring_parameter_value_v1',
  array['jsonb'], 'service_role', array[]::text[],
  'canonicalizador interno não conserva EXECUTE para roles de runtime'
);

select ok(
  pg_get_functiondef(
    'private.prune_authoring_design_state_v1(uuid,timestamptz,integer)'::regprocedure
  ) like '%for update skip locked%'
  and pg_get_functiondef(
    'private.prune_authoring_design_state_v1(uuid,timestamptz,integer)'::regprocedure
  ) not like '%delete from private.authoring_materialization_manifests%',
  'GC é limitado, concorrente e nunca remove manifestos de proveniência'
);

select ok(
  (
    select count(*) >= 6
    from pg_indexes index_value
    where index_value.schemaname = 'private'
      and index_value.indexname like 'authoring_%design%_v1_idx'
         or (
           index_value.schemaname = 'private'
           and index_value.indexname in (
             'authoring_instructional_analyses_scope_v1_idx',
             'authoring_resource_set_members_package_v1_idx',
             'authoring_materialization_manifests_scope_v1_idx'
           )
         )
  ),
  'resolução, busca por escopo, packages e manifestos possuem índices'
);

select ok(
  exists (
    select 1 from pg_constraint constraint_value
    where constraint_value.conrelid =
      'private.authoring_manifest_resource_selections'::regclass
      and constraint_value.contype = 'f'
      and pg_get_constraintdef(constraint_value.oid)
        like '%resource_set_id%package_id%'
  )
  and exists (
    select 1 from pg_constraint constraint_value
    where constraint_value.conrelid =
      'private.authoring_materialization_manifests'::regclass
      and constraint_value.contype = 'f'
      and pg_get_constraintdef(constraint_value.oid) like '%snapshot_id%'
  )
  and exists (
    select 1 from pg_constraint constraint_value
    where constraint_value.conrelid =
      'private.authoring_microsequence_design_bindings'::regclass
      and constraint_value.contype = 'f'
      and pg_get_constraintdef(constraint_value.oid)
        like '%binding_id%blueprint_id%analysis_id%snapshot_id%'
  ),
  'FKs prendem seleção, manifesto e binding corrente a referências exatas'
);

select is(
  (
    select
      (select count(*) from private.authoring_instructional_analyses)
      + (select count(*) from private.authoring_design_parameter_assignments)
      + (select count(*) from private.authoring_resource_sets)
      + (select count(*) from private.authoring_effective_design_snapshots)
      + (select count(*) from private.authoring_pedagogical_blueprints)
      + (select count(*) from private.authoring_pedagogical_blueprint_bindings)
      + (select count(*) from private.authoring_materialization_manifests)
  )::bigint,
  0::bigint,
  'workspaces legados não recebem backfill fictício de análise ou manifesto'
);

select * from finish();
rollback;
