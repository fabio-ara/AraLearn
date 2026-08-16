begin;

select plan(46);

select has_table('private', 'authoring_experiments');
select has_table('private', 'authoring_experiment_protocol_revisions');
select has_table('private', 'authoring_experiment_factors');
select has_table('private', 'authoring_experiment_factor_targets');
select has_table('private', 'authoring_experiment_factor_levels');
select has_table('private', 'authoring_experiment_conditions');
select has_table('private', 'authoring_experiment_condition_levels');
select has_table('private', 'authoring_experiment_condition_resource_sets');
select has_table('private', 'authoring_experiment_invariants');
select has_table('private', 'authoring_experiment_instruments');
select has_table('private', 'authoring_experiment_base_revisions');
select has_table('private', 'authoring_experiment_base_microsequences');
select has_table('private', 'authoring_experiment_variants');
select has_table('private', 'authoring_experiment_variant_revisions');
select has_table('private', 'authoring_experiment_difference_runs');
select has_table('private', 'authoring_experiment_difference_hunks');
select has_table('private', 'authoring_experiment_diff_classifications');
select has_table('private', 'authoring_experiment_variant_freezes');
select has_table('private', 'authoring_experiment_enrollments');
select has_table('private', 'authoring_experiment_assignments');
select has_table('private', 'authoring_experiment_variant_corrections');

select has_column('public', 'courses', 'experiment_variant');
select has_column('public', 'courses', 'experiment_base');
select has_column('private', 'authoring_experiments', 'revision');
select has_column(
  'private', 'authoring_experiment_assignments', 'assignment_proof'
);

select has_function(
  'public', 'prepare_authoring_experiment_variant_evidence_v1',
  array[
    'uuid','uuid','uuid','text','text','bigint','bigint','jsonb','jsonb',
    'text[]'
  ]
);
select has_function(
  'public', 'get_authoring_experiment_variant_evidence_progress_v1',
  array['uuid','uuid','jsonb']
);
select has_function(
  'public', 'register_authoring_experiment_variant_evidence_v1',
  array[
    'uuid','uuid','uuid','text','text','bigint','bigint','jsonb','jsonb',
    'jsonb'
  ]
);
select has_function(
  'public', 'record_authoring_experiment_diff_classification_v1',
  array[
    'uuid','uuid','uuid','text','text','bigint','bigint','jsonb','jsonb',
    'jsonb','text[]','jsonb'
  ]
);
select has_function(
  'public', 'manage_authoring_experiment_v1',
  array[
    'uuid','uuid','uuid','text','text','bigint','bigint','text','jsonb'
  ]
);
select has_function(
  'public', 'assign_authoring_experiment_participant_v1',
  array['uuid','uuid','uuid','text','text','bigint','jsonb']
);
select has_function(
  'public', 'manage_authoring_experiment_enrollment_v1',
  array['uuid','text','text','uuid','text','text','jsonb','boolean']
);
select has_function(
  'public', 'list_authoring_experiments_v1',
  array['uuid','uuid','jsonb','text','integer']
);
select has_function(
  'public', 'list_authoring_experiment_options_v1',
  array['uuid','uuid','text','text','jsonb','text','integer']
);
select has_function(
  'public', 'get_authoring_experiment_v1',
  array[
    'uuid','uuid','uuid','text','integer','jsonb','text','integer','jsonb',
    'text','integer','jsonb','text','integer','jsonb','text','integer'
  ]
);
select has_function(
  'public', 'get_authoring_experiment_context_v1',
  array[
    'uuid','uuid','jsonb','jsonb','jsonb','text[]','text','integer','jsonb',
    'text','integer','text','jsonb','text','integer'
  ]
);

select has_trigger(
  'public', 'courses', 'courses_ensure_official_collection',
  'bases e variantes experimentais não entram no catálogo'
);
select has_trigger(
  'public', 'user_course_selections',
  'authoring_experiment_selection_write_guard_v1',
  'seleção participante nasce e termina pelo control plane'
);
select has_trigger(
  'private', 'authoring_experiment_variant_revisions',
  'authoring_experiment_variant_revision_update_v1',
  'revisões de variante só aceitam transições governadas'
);
select has_trigger(
  'private', 'authoring_experiment_assignments',
  'authoring_experiment_assignments_immutable_v1',
  'atribuições são append-only'
);
select has_trigger(
  'private', 'authoring_experiment_variant_corrections',
  'authoring_experiment_variant_corrections_immutable_v1',
  'pedidos de correção são append-only'
);

select function_privs_are(
  'public', 'manage_authoring_experiment_v1',
  array[
    'uuid','uuid','uuid','text','text','bigint','bigint','text','jsonb'
  ],
  'service_role', array['EXECUTE'],
  'somente a fronteira interna gerencia o experimento'
);
select function_privs_are(
  'public', 'manage_authoring_experiment_enrollment_v1',
  array['uuid','text','text','uuid','text','text','jsonb','boolean'],
  'service_role', array['EXECUTE'],
  'ingresso e retirada passam pela fronteira interna'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_value
    where constraint_value.conrelid =
      'private.authoring_experiment_difference_hunks'::regclass
      and constraint_value.contype = 'u'
      and pg_get_constraintdef(constraint_value.oid) like
        '%difference_run_id, difference_ref_id%'
  ),
  'a identidade factual é única dentro da rodada, não globalmente'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_value
    where constraint_value.conrelid =
      'private.authoring_experiment_assignments'::regclass
      and constraint_value.contype = 'u'
      and pg_get_constraintdef(constraint_value.oid) like '%enrollment_id%'
  ),
  'cada enrollment recebe no máximo uma atribuição'
);
select ok(
  pg_get_functiondef(
    'private.anonymize_owned_experiment_courses_v1()'::regprocedure
  ) like '%experiment_base=true%'
  and pg_get_functiondef(
    'private.ensure_official_course_collection()'::regprocedure
  ) like '%experiment_base%',
  'exclusão do autor preserva a base experimental sem promovê-la'
);

select * from finish();
rollback;
