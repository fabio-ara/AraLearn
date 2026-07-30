begin;

select plan(21);

select has_table('private', 'authoring_workspaces', 'workspaces mantêm o ponteiro atual');
select has_table('private', 'authoring_workspace_revisions', 'histórico de revisões é append-only');
select has_table('private', 'authoring_workspace_requests', 'pedidos idempotentes têm resultado persistido');

select hasnt_table('private', 'authoring_runs', 'execuções v3 foram removidas');
select hasnt_table('private', 'authoring_parts', 'partes v3 foram removidas');
select hasnt_table('private', 'authoring_requests', 'pedidos v3 foram removidos');
select hasnt_table('private', 'run_artifacts', 'ligações v3 foram removidas');

select has_column('private', 'authoring_workspaces', 'current_artifact_hash', 'workspace aponta para artefato');
select has_column('private', 'authoring_workspaces', 'revision', 'workspace expõe revisão CAS');
select has_column('private', 'authoring_workspace_revisions', 'parent_revision', 'histórico preserva causalidade');
select has_column('private', 'authoring_workspace_requests', 'payload_hash', 'idempotência compara o pedido');
select has_column('private', 'authoring_workspace_requests', 'result', 'recibo preserva a resposta original');
select has_column('public', 'courses', 'completion_state', 'curso distingue parcial de completo');

select has_function('public', 'create_authoring_workspace_v4', 'criação transacional disponível');
select has_function('public', 'commit_authoring_workspace_revision_v4', 'commit CAS disponível');
select has_function('public', 'replay_authoring_workspace_request_v4', 'replay idempotente disponível');
select has_function('public', 'get_authoring_workspace_v4', 'leitura do ponteiro disponível');
select has_function('public', 'publish_authoring_workspace_course_v4', 'publicação parcial/completa disponível');
select has_function('public', 'delete_authoring_workspace_v4', 'exclusão lógica disponível');
select has_function('private', 'lock_authoring_workspace_request_v4', 'requestId possui serialização transacional');
select has_function('private', 'lock_workspace_catalog_publication_authority_v4', 'publicação editorial trava a autoridade');

select * from finish();
rollback;
