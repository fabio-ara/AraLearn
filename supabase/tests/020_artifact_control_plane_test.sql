begin;

select plan(45);

select has_table('private', 'authoring_runs', 'execuções formam o plano de controle');
select has_table('private', 'authoring_parts', 'partes guardam somente estado e hashes');
select has_table('private', 'authoring_requests', 'requests idempotentes são persistidos');
select has_table('private', 'artifact_refs', 'referências do Storage são persistidas');
select has_table('private', 'artifact_gc_tombstones', 'coleta física usa tombstones recuperáveis');
select has_table('private', 'run_artifacts', 'execuções recebem papéis de artefato');
select has_table('private', 'course_revisions', 'revisões imutáveis são registradas');
select has_table('private', 'course_revision_sync_changes', 'feed de revisão é compacto');

select hasnt_table('private', 'authoring_ledger_chunks', 'ledger JSONB antigo foi removido');
select hasnt_table('private', 'authoring_audit_reports', 'auditoria JSONB antiga foi removida');
select hasnt_table('private', 'authoring_command_receipts', 'recibos JSONB antigos foram removidos');
select hasnt_table('private', 'authoring_private_imports', 'materializador privado foi removido');
select hasnt_table('private', 'authoring_private_import_chunks', 'chunks relacionais privados foram removidos');
select hasnt_table('private', 'authoring_private_import_stage_rows', 'staging por linha foi removido');

select has_column('private', 'authoring_runs', 'plan_hash', 'execução referencia o plano por hash');
select has_column('private', 'authoring_runs', 'final_document_hash', 'execução referencia a revisão final');
select hasnt_column('private', 'authoring_runs', 'plan', 'plano completo não entra no banco');
select hasnt_column('private', 'authoring_runs', 'assembled_document', 'curso completo não entra no banco');
select hasnt_column('private', 'authoring_runs', 'validation_report', 'relatório completo não entra no banco');
select has_column('private', 'authoring_parts', 'specification_hash', 'especificação é referência');
select has_column('private', 'authoring_parts', 'submission_hash', 'submissão é referência');
select has_column('private', 'authoring_parts', 'audit_hash', 'auditoria é referência');
select hasnt_column('private', 'authoring_parts', 'specification', 'especificação JSONB foi removida');
select hasnt_column('private', 'authoring_parts', 'fragment', 'fragmento JSONB foi removido');

select has_index('private', 'authoring_requests_one_running_owner_v3_idx',
  'só uma mutação pesada por autor pode executar');
select has_index('private', 'authoring_requests_one_running_run_v3_idx',
  'só uma mutação por execução pode executar');
select has_index('private', 'run_artifacts_role_v3_uidx',
  'o papel do artefato é idempotente por tentativa');

select has_function('public', 'begin_authoring_request_v3',
  array['uuid','uuid','text','uuid','text','text','text','uuid','integer'],
  'aquisição atômica de request existe');
select has_function('public', 'commit_authoring_transition_v3',
  array['uuid','text','text','uuid','text','uuid','jsonb','jsonb'],
  'commit curto do plano de controle existe');
select has_function('public', 'release_authoring_request_v3',
  array['uuid','text','text','uuid','text','text'],
  'falha transitória libera a lease');
select has_function('public', 'get_course_revision_artifact_v3',
  array['uuid','uuid','text'],
  'download de revisão exige autorização da API');
select has_function('public', 'pull_course_revision_changes',
  array['bigint','integer'],
  'sincronização por revision_hash existe');
select has_function('public', 'claim_unreferenced_artifacts_v3',
  array['uuid','interval','integer'],
  'coleta reivindica órfãos em lote');
select has_function('public', 'release_expired_authoring_artifact_links_v3',
  array['interval','integer'],
  'retenção libera referências intermediárias de execuções terminais');
select has_function('public', 'complete_artifact_gc_v3',
  array['uuid','text','boolean'],
  'coleta confirma exclusão ou restaura a referência');
select ok(
  pg_get_functiondef('private.register_artifact_v3(jsonb)'::regprocedure)
    like '%pg_advisory_xact_lock%',
  'registro e coleta do mesmo hash são serializados'
);
select unlike(
  pg_get_functiondef(
    'public.commit_authoring_transition_v3(uuid,text,text,uuid,text,uuid,jsonb,jsonb)'
      ::regprocedure
  ),
  '%course_memberships%',
  'publicação não depende da tabela de memberships removida'
);
select unlike(
  pg_get_functiondef(
    'public.commit_authoring_transition_v3(uuid,text,text,uuid,text,uuid,jsonb,jsonb)'
      ::regprocedure
  ),
  '%course_kind%',
  'publicação não depende do enum removido no corte enxuto'
);
select like(
  pg_get_functiondef(
    'public.commit_authoring_transition_v3(uuid,text,text,uuid,text,uuid,jsonb,jsonb)'
      ::regprocedure
  ),
  '%user_course_selections%',
  'curso privado publicado entra na biblioteca leve do autor'
);

select hasnt_function('public', 'dispatch_authoring_command_v2',
  array['uuid','uuid','text','uuid','text','text','jsonb'],
  'despachante JSONB antigo foi removido');
select hasnt_function('public', 'get_next_authoring_part',
  array['uuid','uuid'],
  'leitura SQL que remontava contexto foi removida');

select is(
  (select public from storage.buckets where id = 'aralearn-authoring-artifacts'),
  false,
  'bucket de autoria é privado'
);
select is(
  (select public from storage.buckets where id = 'aralearn-course-revisions'),
  false,
  'bucket de revisões é privado'
);
select ok(
  not has_table_privilege('authenticated', 'private.artifact_refs', 'SELECT'),
  'cliente não lê referências privadas diretamente'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_course_revision_artifact_v3(uuid,uuid,text)',
    'EXECUTE'
  ),
  'cliente não contorna a API de revisão'
);

select * from finish();
rollback;
