begin;

select plan(24);

select has_table('private','authoring_analytics_metric_definitions');
select has_table('private','authoring_experiment_outcome_observations');
select has_table('private','authoring_analytics_dataset_versions');
select has_table('private','authoring_analytics_outcome_receipts');

select has_column('private','authoring_experiment_outcome_observations','participant_ref');
select has_column('private','authoring_experiment_outcome_observations','missing_reason');
select has_column('private','authoring_experiment_outcome_observations','recorded_by');
select has_column('private','authoring_analytics_metric_definitions','limitations');
select has_column('private','authoring_analytics_metric_definitions','missing_treatment');
select has_column('private','authoring_analytics_metric_definitions','denominator_definition');

select has_view('private','authoring_analytics_design_rows_v1');
select has_view('private','authoring_analytics_process_rows_v1');
select has_view('private','authoring_analytics_assignment_rows_v1');
select has_view('private','authoring_analytics_outcome_rows_v1');

select has_function(
  'public','list_authoring_analytics_dataset_v1',
  array['uuid','uuid','text','jsonb','jsonb','text','integer']
);
select has_function(
  'public','get_authoring_analytics_overview_v1',array['uuid','uuid','jsonb']
);
select has_function(
  'public','record_authoring_experiment_outcome_v1',
  array['uuid','uuid','uuid','text','text','jsonb']
);

select has_trigger(
  'private','authoring_analytics_metric_definitions',
  'authoring_analytics_metric_definitions_immutable_v1',
  'o dicionário de métricas é imutável'
);
select has_trigger(
  'private','authoring_experiment_outcome_observations',
  'authoring_experiment_outcomes_immutable_v1',
  'outcomes são append-only salvo anonimização do ator'
);

select function_privs_are(
  'public','list_authoring_analytics_dataset_v1',
  array['uuid','uuid','text','jsonb','jsonb','text','integer'],
  'service_role',array['EXECUTE'],
  'datasets atravessam somente a fronteira interna'
);
select function_privs_are(
  'public','get_authoring_analytics_overview_v1',
  array['uuid','uuid','jsonb'],'service_role',array['EXECUTE'],
  'overview atravessa somente a fronteira interna'
);
select function_privs_are(
  'public','record_authoring_experiment_outcome_v1',
  array['uuid','uuid','uuid','text','text','jsonb'],
  'service_role',array['EXECUTE'],
  'registro de outcome atravessa somente a fronteira interna'
);

select ok(
  (select count(*) from private.authoring_analytics_metric_definitions)>=12,
  'dicionário cobre desenho, processo, aprendizagem e experimento'
);
select ok(
  pg_get_functiondef(
    'public.list_authoring_analytics_dataset_v1(uuid,uuid,text,jsonb,jsonb,text,integer)'::regprocedure
  ) like '%datasetSetRef%'
  and pg_get_functiondef(
    'public.list_authoring_analytics_dataset_v1(uuid,uuid,text,jsonb,jsonb,text,integer)'::regprocedure
  ) like '%Dataset mudou durante a paginação%',
  'paginação é ancorada em datasetSetRef exata'
);

select * from finish();
rollback;
