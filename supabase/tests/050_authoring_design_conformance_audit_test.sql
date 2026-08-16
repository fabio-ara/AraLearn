begin;

select plan(38);

select has_table('private', 'authoring_audit_runs', 'authoring_audit_runs');
select has_table('private', 'authoring_audit_run_microsequences', 'authoring_audit_run_microsequences');
select has_table('private', 'authoring_audit_run_completions', 'authoring_audit_run_completions');
select has_table('private', 'authoring_audit_run_components', 'authoring_audit_run_components');

select has_column('private', 'authoring_workspace_observations', 'audit_run_id', 'audit_run_id');
select has_column('private', 'authoring_workspace_observations', 'audit_finding_ordinal', 'audit_finding_ordinal');
select has_column('private', 'authoring_workspace_observations', 'finding_code', 'finding_code');
select has_column('private', 'authoring_workspace_observations', 'finding_origin', 'finding_origin');
select has_column('private', 'authoring_workspace_observations', 'rule_kind', 'rule_kind');
select has_column('private', 'authoring_workspace_observations', 'rule_id', 'rule_id');
select has_column('private', 'authoring_workspace_observations', 'rule_version', 'rule_version');
select has_column('private', 'authoring_workspace_observations', 'public_evidence', 'public_evidence');
select has_column('private', 'authoring_workspace_observations', 'finding_fingerprint', 'finding_fingerprint');
select has_column('private', 'authoring_workspace_observations', 'verified_by_audit_run_id', 'verified_by_audit_run_id');
select has_column('private', 'authoring_workspace_observations', 'superseded_by_finding_id', 'superseded_by_finding_id');
select has_column('private', 'authoring_audit_runs', 'mandate_snapshot', 'mandate_snapshot');

select has_function(
  'public', 'list_authoring_audit_cards_v1',
  array['uuid','uuid','text[]','bigint','integer','integer','text']
);
select has_function(
  'public', 'list_authoring_part_audit_components_v1',
  array['uuid','uuid','text','integer','integer']
);
select has_function(
  'public', 'register_authoring_audit_run_v1',
  array['uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'record_authoring_semantic_audit_v1',
  array['uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'get_authoring_audit_run_v1',
  array[
    'uuid','uuid','uuid','text','text','text','integer','integer',
    'integer','integer','text'
  ]
);
select has_function(
  'public', 'list_authoring_audit_runs_v1',
  array['uuid','uuid','text','text','integer','timestamp with time zone','uuid']
);
select has_function(
  'public', 'manage_authoring_workspace_finding_v1',
  array['uuid','uuid','text','text','bigint','text','jsonb']
);
select has_function(
  'public', 'update_authoring_workspace_continuity_v1',
  array['uuid','uuid','text','text','bigint','text','jsonb']
);

select has_function(
  'private', 'authoring_audit_run_is_current_v1', array['uuid']
);
select has_function(
  'private', 'authoring_audit_target_in_run_v1',
  array['uuid','text','text[]']
);
select has_function(
  'private', 'authoring_audit_run_entries_v1', array['uuid']
);
select has_function(
  'private', 'authoring_audit_finding_distribution_v1', array['uuid']
);

select has_trigger(
  'private', 'authoring_audit_runs',
  'authoring_audit_runs_immutable_v1',
  'rodadas determinísticas são append-only'
);
select has_trigger(
  'private', 'authoring_workspace_observations',
  'preserve_authoring_audit_finding_history_v1',
  'remoção de alvo não apaga achado estruturado'
);

select function_privs_are(
  'public', 'register_authoring_audit_run_v1',
  array['uuid','uuid','text','text','bigint','jsonb'],
  'service_role', array['EXECUTE'],
  'somente o executor interno registra a rodada'
);
select function_privs_are(
  'public', 'record_authoring_semantic_audit_v1',
  array['uuid','uuid','text','text','bigint','jsonb'],
  'service_role', array['EXECUTE'],
  'somente o executor interno conclui a rodada'
);
select function_privs_are(
  'private', 'authoring_audit_run_is_current_v1',
  array['uuid'], 'service_role', array[]::text[],
  'currentness permanece auxiliar privado'
);
select function_privs_are(
  'public', 'manage_authoring_workspace_finding_before_audit_runs_v1',
  array['uuid','uuid','text','text','bigint','text','jsonb'],
  'service_role', array[]::text[],
  'delegate legado não contorna o lifecycle estruturado'
);

select ok(
  public.get_aralearn_runtime_manifest()->'features'
    ? 'authoring-design-conformance-audit-v1',
  'manifesto anuncia o contrato de auditoria instalado'
);
select ok(
  exists (
    select 1 from pg_constraint constraint_value
    where constraint_value.conrelid =
      'private.authoring_audit_run_components'::regclass
      and constraint_value.contype = 'f'
      and pg_get_constraintdef(constraint_value.oid) like '%child_audit_run_id%'
  )
  and exists (
    select 1 from pg_indexes index_value
    where index_value.schemaname = 'private'
      and index_value.indexname =
        'authoring_workspace_audit_findings_fingerprint_v1_idx'
  ),
  'lineage de Parte e identidade de recorrência possuem integridade física'
);

select ok(
  not (
    select attribute.attnotnull
    from pg_attribute attribute
    where attribute.attrelid =
      'private.authoring_workspace_observations'::regclass
      and attribute.attname = 'author_id'
      and not attribute.attisdropped
  )
  and exists (
    select 1
    from pg_constraint constraint_value
    where constraint_value.conrelid =
      'private.authoring_workspace_observations'::regclass
      and constraint_value.conname =
        'authoring_workspace_observations_author_id_fkey'
      and constraint_value.confdeltype = 'n'
  ),
  'exclusão da conta anonimiza a autoria sem apagar o finding'
);

select ok(
  pg_get_functiondef(
    'private.reject_authoring_design_update_v1()'::regprocedure
  ) like '%authority_ref%'
  and pg_get_functiondef(
    'private.reject_authoring_audit_run_update_v1()'::regprocedure
  ) like '%completed_by%',
  'imutabilidade admite somente anonimização controlada da proveniência'
);

select * from finish();
rollback;
