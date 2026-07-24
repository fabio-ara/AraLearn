begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

create function pg_temp.empty_import_manifest()
returns jsonb
language sql
stable
as $$
  select jsonb_object_agg(store_name, 0)
  from unnest(private.official_import_store_names()) store_name;
$$;

create function pg_temp.course_payload(
  p_id uuid,
  p_contract_key text,
  p_title text default 'Curso de teste'
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_id,
    'contractKey', p_contract_key,
    'title', p_title,
    'goal', 'Validar o fluxo de autoria.',
    'contractScope', 'Teste integrado',
    'position', 0
  );
$$;

select has_table('private', 'authoring_runs', 'execuções ficam no schema privado');
select has_table('private', 'authoring_parts', 'partes ficam no schema privado');
select has_table('private', 'authoring_audit_reports', 'auditorias ficam no schema privado');
select has_table('private', 'authoring_command_receipts', 'recibos idempotentes são persistidos');
select hasnt_table('public', 'authoring_runs', 'staging de autoria não é tabela pública');
select has_column('private', 'authoring_runs', 'terminal_compacted_at',
  'compactação terminal usa marcador controlado pelo servidor');
select has_column('private', 'authoring_command_receipts', 'responsible_user_id',
  'recibo retido conserva o responsável pela quota');
select has_column('private', 'authoring_retention_events', 'responsible_user_id',
  'evento retido conserva o responsável pela quota');
select has_column('private', 'authoring_maintenance_state', 'phase',
  'manutenção persistente conserva a fase retomável');
select has_column('private', 'authoring_maintenance_state', 'cursor_at',
  'manutenção persistente conserva o instante do cursor');
select has_column('private', 'authoring_maintenance_state', 'cursor_id',
  'manutenção persistente conserva o UUID do cursor');
select has_column('private', 'authoring_maintenance_state', 'cycle_started_at',
  'manutenção persistente delimita cada ciclo');
select has_column('private', 'authoring_maintenance_state', 'cycle_cancelled_before',
  'ciclo conserva o limite de retenção para cancelamentos');
select has_column('private', 'authoring_maintenance_state', 'cycle_published_before',
  'ciclo conserva o limite de retenção para publicações');
select has_column('private', 'authoring_maintenance_state', 'cycle_deferred_count',
  'ciclo conserva recuperações adiadas entre fases');
select has_column('private', 'authoring_maintenance_state', 'last_batch_at',
  'manutenção persistente registra o último lote');
select ok(
  pg_get_indexdef('private.authoring_runs_status_published_at_idx'::regclass)
    like '%(status, published_at, id)%',
  'retenção publicada usa índice por status, data e UUID'
);
select ok(
  pg_get_indexdef('private.authoring_runs_status_idx'::regclass)
    like '%(status, updated_at, id)%',
  'retenção cancelada usa índice por status, data e UUID'
);
select ok(
  pg_get_indexdef('private.authoring_api_client_events_type_created_idx'::regclass)
    like '%(event_type, created_at, id)%',
  'prune de eventos usa índice por tipo, data e identidade'
);
select ok(
  pg_get_indexdef('private.authoring_command_receipts_retained_idx'::regclass)
    like '%(retained_at, actor_user_id, request_id)%',
  'prune de recibos usa índice na mesma ordem de seu keyset'
);

select has_function('public', 'begin_authoring_official_course_import',
  array['uuid', 'uuid', 'jsonb', 'text', 'jsonb'],
  'wrapper de abertura da publicação existe');
select has_function('public', 'finalize_authoring_official_course_import',
  array['uuid', 'uuid', 'uuid'], 'wrapper atômico de finalização existe');
select has_function('public', 'claim_authoring_publication',
  array['uuid', 'uuid', 'uuid', 'uuid', 'integer'],
  'lease persistente da finalização existe');
select has_function('public', 'record_authoring_publication_failure',
  array['uuid', 'uuid', 'text', 'text', 'text', 'integer'],
  'falha do worker pode ser persistida');
select has_function('public', 'apply_authoring_command',
  array['uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'jsonb'],
  'máquina de estados existe');
select has_function('public', 'get_next_authoring_part', array['uuid', 'uuid'],
  'consulta compacta da próxima parte existe');
select has_function('private', 'catalog_submission_tree_counts', array['uuid'],
  'contagem da árvore de submissão existe');
select has_function('private', 'validate_catalog_submission_course', array['uuid'],
  'validação editorial da submissão existe');
select ok((
  select strpos(definition, 'public."{modules') = 0
  from (
    select pg_get_functiondef(
      'private.catalog_submission_tree_counts(uuid)'::regprocedure
    ) definition
  ) source
), 'contagem editorial não transforma a lista de tabelas em uma relação literal');
select ok((
  select strpos(definition, 'module.deleted_at') = 0
     and strpos(definition, 'card.deleted_at') = 0
     and strpos(definition, 'block.deleted_at') = 0
  from (
    select pg_get_functiondef(
      'private.validate_catalog_submission_course(uuid)'::regprocedure
    ) definition
  ) source
), 'validação editorial respeita o modelo enxuto sem tombstones nas tabelas de conteúdo');
select ok((
  select strpos(definition, 'private.course_content_hash') = 0
  from (
    select pg_get_functiondef(
      'private.validate_catalog_submission_course(uuid)'::regprocedure
    ) definition
  ) source
), 'validação editorial usa o hash já persistido pela publicação enxuta');
select has_function('public', 'cleanup_authoring_history',
  array['uuid', 'boolean', 'timestamp with time zone', 'timestamp with time zone'],
  'retenção e reconciliação existem');
select has_function('private', 'authoring_row_storage_charge', array['jsonb'],
  'cobrança estrutural conservadora existe');
select has_function('private', 'authoring_actor_retained_bytes', array['uuid'],
  'quota durável por responsável existe');
select has_function('private', 'authoring_global_retained_bytes', array[]::text[],
  'quota durável global existe');

select ok(has_function_privilege('service_role',
  'public.begin_authoring_official_course_import(uuid,uuid,jsonb,text,jsonb)', 'EXECUTE'),
  'service_role abre staging de autoria');
select ok(has_function_privilege('service_role',
  'public.finalize_authoring_official_course_import(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role finaliza staging de autoria');
select ok(not has_function_privilege('authenticated',
  'public.begin_authoring_official_course_import(uuid,uuid,jsonb,text,jsonb)', 'EXECUTE'),
  'authenticated não abre o importador diretamente');
select ok(not has_function_privilege('authenticated',
  'public.finalize_authoring_official_course_import(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated não finaliza o importador diretamente');
select ok(not has_function_privilege('anon',
  'public.finalize_authoring_official_course_import(uuid,uuid,uuid)', 'EXECUTE'),
  'anon não publica');
select ok(not has_function_privilege('authenticated',
  'public.claim_authoring_publication(uuid,uuid,uuid,uuid,integer)', 'EXECUTE'),
  'authenticated não adquire lease diretamente');
select ok(not has_function_privilege('anon',
  'public.record_authoring_publication_failure(uuid,uuid,text,text,text,integer)', 'EXECUTE'),
  'anon não registra falha de worker');
select ok(not has_table_privilege('service_role', 'private.authoring_runs', 'SELECT'),
  'service_role acessa staging somente por funções');
select ok(not has_table_privilege('authenticated', 'private.authoring_runs', 'SELECT'),
  'authenticated não consulta staging');
select ok(not has_function_privilege('service_role',
  'private.authoring_global_retained_bytes()', 'EXECUTE'),
  'medição privada não é exposta diretamente à service_role');

select ok((select p.prosecdef and p.proconfig is not null
  from pg_proc p where p.oid =
    'public.finalize_authoring_official_course_import(uuid,uuid,uuid)'::regprocedure),
  'finalizador é SECURITY DEFINER com configuração fixa');
select ok((select 'statement_timeout=90s' = any(p.proconfig)
  from pg_proc p where p.oid =
    'public.finalize_authoring_official_course_import(uuid,uuid,uuid)'::regprocedure),
  'wrapper final tem teto de 90 segundos');
select ok((select 'statement_timeout=85s' = any(p.proconfig)
  from pg_proc p where p.oid =
    'public.finalize_official_course_import(uuid)'::regprocedure),
  'materializador relacional encerra antes do teto do wrapper');
select ok((select 'statement_timeout=8s' = any(p.proconfig)
  from pg_proc p where p.oid =
    'public.cleanup_authoring_history(uuid,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure),
  'cada lote de retenção tem teto SQL de oito segundos');
select ok((select 'statement_timeout=8s' = any(p.proconfig)
  from pg_proc p where p.oid =
    'public.maybe_cleanup_authoring_history()'::regprocedure),
  'a manutenção oportunista encerra antes do teto HTTP');
select ok((
  select position('aralearn-official-import-staging' in pg_get_functiondef(p.oid))
       < position('official-import:' in pg_get_functiondef(p.oid))
     and position('official-import:' in pg_get_functiondef(p.oid))
       < position('for update' in lower(pg_get_functiondef(p.oid)))
  from pg_proc p where p.oid =
    'public.begin_authoring_official_course_import(uuid,uuid,jsonb,text,jsonb)'::regprocedure
), 'begin segue a ordem de travas global, curso e linhas');
select ok((
  select position('aralearn-official-import-staging' in pg_get_functiondef(p.oid))
       < position('official-import:' in pg_get_functiondef(p.oid))
     and position('official-import:' in pg_get_functiondef(p.oid))
       < position('for update' in lower(pg_get_functiondef(p.oid)))
  from pg_proc p where p.oid =
    'public.finalize_authoring_official_course_import(uuid,uuid,uuid)'::regprocedure
), 'finalize segue a ordem de travas global, curso e linhas');
select ok((
  select strpos(definition, 'authoring_acquire_storage_global_lock()')
       < strpos(definition, 'authoring_acquire_storage_actor_lock(p_actor_id)')
  from (
    select pg_get_functiondef(
      'private.authoring_acquire_storage_locks(uuid)'::regprocedure
    ) definition
  ) source
), 'helper de quota fixa a ordem global e depois autor');
select ok((
  select strpos(definition, 'authoring_acquire_storage_locks(v_run.created_by)')
       < strpos(definition, 'set status = ''published''')
  from (
    select pg_get_functiondef(
      'private.authoring_complete_publication(uuid,uuid)'::regprocedure
    ) definition
  ) source
), 'publicação adquire quota global e do autor antes de terminalizar');
select ok((
  select strpos(definition, 'authoring_acquire_storage_locks(v_run.created_by)')
       < strpos(definition, 'set status = ''cancelled''')
  from (
    select pg_get_functiondef(
      'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
    ) definition
  ) source
), 'cancelamento adquire quota global e do autor antes de terminalizar');
select ok((
  select strpos(definition, 'limit v_batch_size') > 0
     and strpos(definition, 'order by run.expires_at, run.id') > 0
     and strpos(definition, 'run.id = any(v_selected_ids)') > 0
     and strpos(definition, 'authoring_acquire_storage_global_lock()')
       < strpos(definition, 'authoring_acquire_storage_actor_lock(v_lock_actor)')
     and strpos(definition, ' offset ') = 0
     and strpos(definition, 'skip locked') = 0
  from (
    select pg_get_functiondef(
      'public.cleanup_authoring_history(uuid,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure
    ) definition
  ) source
), 'retenção usa keyset limitado, não salta linhas e trava quota global antes dos autores');
select ok((
  select
    strpos(definition, 'if p_dry_run then')
      < strpos(definition, 'select count(*) into v_publishing_recovery')
    and strpos(mutating_path, 'select count(*) into v_') = 0
    and strpos(mutating_path,
      '(select count(*) from private.authoring_api_rate_windows') = 0
    and strpos(mutating_path,
      'exists(select 1 from private.authoring_runs run') > 0
    and strpos(mutating_path,
      'exists(select 1 from private.authoring_api_client_events event') > 0
  from (
    select definition,
      substr(definition, strpos(definition,
        'if not p_dry_run and v_phase = ''recover_publishing''')) mutating_path
    from (
      select lower(pg_get_functiondef(
        'public.cleanup_authoring_history(uuid,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure
      )) definition
    ) function_source
  ) source
), 'caminho mutante evita métricas globais exatas e usa sondagens indexáveis');
select ok((
  select
    strpos(definition,
      'v_phase in (''delete_cancelled'', ''delete_published'')') > 0
    and strpos(definition, 'order by run.updated_at, run.id') > 0
    and strpos(definition, 'order by run.published_at, run.id') > 0
    and strpos(definition, 'order by terminal_at') = 0
    and strpos(definition,
      'case when run.status = ''published'' then run.published_at else run.updated_at end') = 0
  from (
    select lower(pg_get_functiondef(
      'public.cleanup_authoring_history(uuid,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure
    )) definition
  ) source
), 'cancelados e publicados usam fases e keysets indexáveis independentes');
select ok((
  select strpos(definition, 'aralearn-official-import-staging')
       < strpos(definition, 'official-import:')
     and strpos(definition, 'official-import:')
       < strpos(definition, 'where run.id = v_recovery_run.id')
  from (
    select pg_get_functiondef(
      'public.cleanup_authoring_history(uuid,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure
    ) definition
  ) source
), 'recuperação preserva a ordem staging, contrato e linhas');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'aa100000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'authoring-owner@aralearn.test', 'x', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
) on conflict(id) do nothing;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   'aa100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'authoring-publisher@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'aa100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'authoring-writer@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict(id) do nothing;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'aa100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
  'authoring-deleted-publisher@aralearn.test', 'x', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
) on conflict(id) do nothing;

insert into private.app_role_assignments(
  user_id, role, active, granted_by, reason
) values
  ('aa100000-0000-4000-8000-000000000001', 'owner', true,
   'aa100000-0000-4000-8000-000000000001', 'Teste integrado'),
  ('aa100000-0000-4000-8000-000000000001', 'author', true,
   'aa100000-0000-4000-8000-000000000001', 'Teste integrado'),
  ('aa100000-0000-4000-8000-000000000001', 'reviewer', true,
   'aa100000-0000-4000-8000-000000000001', 'Teste integrado'),
  ('aa100000-0000-4000-8000-000000000001', 'catalog_publisher', true,
   'aa100000-0000-4000-8000-000000000001', 'Teste integrado'),
  ('aa100000-0000-4000-8000-000000000002', 'catalog_publisher', true,
   'aa100000-0000-4000-8000-000000000001', 'Teste de publicação colaborativa'),
  ('aa100000-0000-4000-8000-000000000003', 'author', true,
   'aa100000-0000-4000-8000-000000000001', 'Teste de autoria colaborativa')
on conflict(user_id, role) do update set active = true, revoked_at = null, revoked_by = null;

insert into public.catalog_collections(
  id, contract_key, title, description, position, is_published, deleted_at
) values
  ('71a00000-0000-4000-8000-000000000001', 'authoring-test-a', 'Coleção A', '', 900, true, null),
  ('71a00000-0000-4000-8000-000000000002', 'authoring-test-b', 'Coleção B', '', 901, true, null)
on conflict(id) do update set is_published = true, deleted_at = null;

select set_config('request.jwt.claim.role', 'service_role', true);

-- O pacote público usa estes metadados. O mesmo trecho precisa ser aceito pelo
-- OpenAPI, pelo runtime e pela função SQL, sem remoção silenciosa.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target,
  publication_intent, contract_key, title, status, plan, plan_hash
) values (
  'a1000000-0000-4000-8000-000000000050',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'catalog', 'create',
  'authoring-ledger-metadata', 'Metadados do registro', 'building',
  jsonb_build_object(
    'ledgerFinalized', false,
    'ledgerManifest', jsonb_build_object(
      'sections', jsonb_build_object(
        'sources', jsonb_build_object('chunkCount', 1, 'itemCount', 1),
        'claims', jsonb_build_object('chunkCount', 0, 'itemCount', 0),
        'terms', jsonb_build_object('chunkCount', 0, 'itemCount', 0)
      )
    )
  ),
  repeat('d', 64)
);

select is(
  public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'ledger-metadata-request-0001',
    'a1000000-0000-4000-8000-000000000050',
    'put_ledger_chunk', null,
    jsonb_build_object(
      'planHash', repeat('d', 64),
      'section', 'sources',
      'position', 0,
      'items', jsonb_build_array(jsonb_build_object(
        'sourceId', 'source-versioned',
        'title', 'Fonte versionada',
        'kind', 'documentation',
        'locator', 'https://example.test/manual',
        'publishedOn', '2026-07-20',
        'publishedVersion', '3.1',
        'accessedOn', '2026-07-22',
        'excerpt', 'Trecho usado no curso.',
        'stability', 'versioned',
        'usageTerms', 'Uso autorizado para esta execução.',
        'usageNotes', 'Preservar a versão consultada.'
      ))
    )
  )->>'itemCount',
  '1',
  'chunk SQL aceita os metadados declarados pelo contrato'
);
select is(
  (
    select items->0->>'publishedVersion'
    from private.authoring_ledger_chunks
    where run_id = 'a1000000-0000-4000-8000-000000000050'
      and section = 'sources' and position = 0
  ),
  '3.1',
  'chunk SQL preserva os metadados da fonte'
);
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'ledger-empty-request-0001',
    'a1000000-0000-4000-8000-000000000050',
    'put_ledger_chunk', null,
    jsonb_build_object(
      'planHash', repeat('d', 64),
      'section', 'sources',
      'position', 0,
      'items', '[]'::jsonb
    )
  )
$call$, '22023', 'Chunk do ledger incompatível com o manifesto.',
  'chunk vazio é rejeitado também no SQL');
select set_config('request.jwt.claim.sub', 'aa100000-0000-4000-8000-000000000001', true);

insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status
) values (
  'a1000000-0000-4000-8000-000000000099',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-incomplete-publish', 'Autoria incompleta', 'planning'
);
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'incomplete-publish-0001', 'a1000000-0000-4000-8000-000000000099',
    'prepare_publish', null, '{}'::jsonb
  )
$call$, 'AR409', 'Somente um curso validado pode ser publicado.',
  'publicação incompleta possui código semântico próprio');

-- Um autor pode produzir o run e um publicador distinto assume a etapa final.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, plan, document_hash,
  assembled_document, validated_at
) values (
  'a1000000-0000-4000-8000-000000000010',
  'aa100000-0000-4000-8000-000000000003', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-collaborative-publish', 'Autoria colaborativa', 'validated',
  jsonb_build_object('kind', 'document_import'), repeat('0', 64), '{}'::jsonb, now()
);
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000002', null,
  'collaborative-publish-0001', 'a1000000-0000-4000-8000-000000000010',
  'prepare_publish', null, '{}'::jsonb
)->>'status', 'publishing', 'publicador autorizado assume run criado por autor');
select is((select publication_actor_id from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000010'),
  'aa100000-0000-4000-8000-000000000002'::uuid,
  'identidade do publicador efetivo fica persistida');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000002', null,
  'collaborative-cancel-0001', 'a1000000-0000-4000-8000-000000000010',
  'cancel_run', null, jsonb_build_object('reason', 'Encerrar o teste colaborativo.')
)->>'status', 'cancelled', 'run colaborativo de teste é encerrado');

-- Lease é exclusivo, expira e usa fencing por token físico.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id,
  collection_explicit, publication_intent, contract_key, title, status,
  document_hash, assembled_document, validated_at, course_id, plan
) values (
  'a1000000-0000-4000-8000-000000000011',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-lease-test', 'Lease de teste', 'publishing', repeat('e', 64), '{}'::jsonb, now(),
  null, '{}'::jsonb
);
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000011',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000011', 130
)->>'leaseAcquired', 'true', 'primeiro worker adquire o lease');
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000011',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000011', 130
)->>'leaseAcquired', 'true',
  'resposta perdida do claim recupera o mesmo lease idempotente');
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000011',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000012', 130
)->>'leaseAcquired', 'false', 'worker concorrente não duplica o finalizador');
update private.authoring_runs
set publication_lease_until = now() - interval '1 second'
where id = 'a1000000-0000-4000-8000-000000000011';
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000011',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000012', 130
)->>'leaseAcquired', 'true', 'lease vencido pode ser recuperado');
select is(public.record_authoring_publication_failure(
  'a1000000-0000-4000-8000-000000000011',
  'e1000000-0000-4000-8000-000000000011', 'deterministic',
  'old_worker', 'Worker antigo.', 422
)->>'superseded', 'true', 'worker antigo não grava sobre o novo lease');
select is(public.record_authoring_publication_failure(
  'a1000000-0000-4000-8000-000000000011',
  'e1000000-0000-4000-8000-000000000012', 'transient',
  'service_unavailable', 'Falha temporária.', 503
)->>'recorded', 'true', 'falha transitória libera o lease');
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000011',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000013', 130
)->>'leaseAcquired', 'true', 'falha transitória permite nova tentativa');
select is((select publication_error is null from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000011'), true,
  'nova tentativa limpa somente a falha transitória');

-- A autorização é revalidada dentro da transação final. A revogação posterior
-- ao lease impede a publicação, e a restauração explícita permite retomá-la
-- com um novo token sem reutilizar o worker anterior.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id,
  collection_explicit, publication_intent, contract_key, title, status,
  document_hash, assembled_document, validated_at
) values (
  'a1000000-0000-4000-8000-000000000012',
  'aa100000-0000-4000-8000-000000000003',
  'aa100000-0000-4000-8000-000000000002', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-revoked-publisher', 'Publicador revogado', 'publishing',
  repeat('f', 64), '{}'::jsonb, now()
);
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, authoring_run_id
) values (
  'b1000000-0000-4000-8000-000000000012',
  'c1000000-0000-4000-8000-000000000012', 'authoring-revoked-publisher',
  pg_temp.course_payload(
    'c1000000-0000-4000-8000-000000000012', 'authoring-revoked-publisher'
  ), repeat('f', 64), pg_temp.empty_import_manifest(), true, 'staging',
  'a1000000-0000-4000-8000-000000000012'
);
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000012',
  'aa100000-0000-4000-8000-000000000002', null,
  'e1000000-0000-4000-8000-000000000021', 130
)->>'leaseAcquired', 'true', 'publicador adquire lease enquanto autorizado');
update private.app_role_assignments
set active = false, revoked_at = now(),
    revoked_by = 'aa100000-0000-4000-8000-000000000001'
where user_id = 'aa100000-0000-4000-8000-000000000002'
  and role = 'catalog_publisher';
select throws_ok($call$
  select public.finalize_authoring_official_course_import(
    'b1000000-0000-4000-8000-000000000012',
    'a1000000-0000-4000-8000-000000000012',
    'e1000000-0000-4000-8000-000000000021'
  )
$call$, '42501', 'A permissão de publicação foi revogada.',
  'revogação posterior ao lease impede a materialização');
select is(public.record_authoring_publication_failure(
  'a1000000-0000-4000-8000-000000000012',
  'e1000000-0000-4000-8000-000000000021', 'deterministic',
  'not_authorized', 'A permissão de publicação foi revogada.', 403
)->>'recorded', 'true', 'falha de autorização fica persistida e libera o lease');
update private.app_role_assignments
set active = true, revoked_at = null, revoked_by = null
where user_id = 'aa100000-0000-4000-8000-000000000002'
  and role = 'catalog_publisher';
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000012',
  'aa100000-0000-4000-8000-000000000002', null,
  'e1000000-0000-4000-8000-000000000022', 130
)->>'leaseAcquired', 'true',
  'permissão restaurada retoma a publicação com novo lease');
select is((select publication_error is null from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000012'), true,
  'retomada autorizada limpa a rejeição de autorização');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000002', null,
  'revoked-publisher-cancel-0001', 'a1000000-0000-4000-8000-000000000012',
  'cancel_run', null, jsonb_build_object('reason', 'Encerrar o teste de revogação.')
)->>'status', 'cancelled', 'staging do teste de revogação é removido');

-- A conta do publicador pode ser removida sem bloquear o ciclo de vida da
-- conta. O run pertence a outro autor e permanece auditável, sem usuário órfão.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id,
  collection_explicit, publication_intent, contract_key, title, status
) values (
  'a1000000-0000-4000-8000-000000000013',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000004', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-deleted-publisher', 'Conta removível', 'publishing'
);
select lives_ok($call$
  delete from auth.users
  where id = 'aa100000-0000-4000-8000-000000000004'
$call$, 'exclusão da conta do publicador não é bloqueada');
select is((select publication_actor_id from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000013'), null::uuid,
  'referência ao publicador removido é anulada');
select is((select count(*) from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000013'), 1::bigint,
  'run criado por outra pessoa permanece após excluir o publicador');
delete from private.authoring_runs
where id = 'a1000000-0000-4000-8000-000000000013';

-- Coleção automática pode usar o fallback público depois de uma revogação;
-- uma escolha editorial explícita nunca é trocada silenciosamente.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id,
  collection_explicit, publication_intent, contract_key, title, status,
  document_hash, assembled_document, validated_at
) values
  ('a1000000-0000-4000-8000-000000000014',
   'aa100000-0000-4000-8000-000000000001',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', false, 'create',
   'authoring-auto-collection', 'Coleção automática', 'publishing',
   repeat('1a', 32), '{}'::jsonb, now(),
   'c1000000-0000-4000-8000-000000000014', '{}'::jsonb),
  ('a1000000-0000-4000-8000-000000000015',
   'aa100000-0000-4000-8000-000000000001',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000002', true, 'create',
   'authoring-explicit-collection', 'Coleção explícita', 'publishing',
   repeat('1b', 32), '{}'::jsonb, now(),
   'c1000000-0000-4000-8000-000000000015', '{}'::jsonb);
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, authoring_run_id
) values
  ('b1000000-0000-4000-8000-000000000014',
   'c1000000-0000-4000-8000-000000000014', 'authoring-auto-collection',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000014', 'authoring-auto-collection'
   ), repeat('1a', 32), pg_temp.empty_import_manifest(), true, 'staging',
   'a1000000-0000-4000-8000-000000000014'),
  ('b1000000-0000-4000-8000-000000000015',
   'c1000000-0000-4000-8000-000000000015', 'authoring-explicit-collection',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000015', 'authoring-explicit-collection'
   ), repeat('1b', 32), pg_temp.empty_import_manifest(), true, 'staging',
   'a1000000-0000-4000-8000-000000000015');

select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000014',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000031', 130
)->>'leaseAcquired', 'true', 'publicação automática adquire o primeiro lease');
update public.catalog_collections set is_published = false
where id = '71a00000-0000-4000-8000-000000000001';
select throws_ok($call$
  select public.finalize_authoring_official_course_import(
    'b1000000-0000-4000-8000-000000000014',
    'a1000000-0000-4000-8000-000000000014',
    'e1000000-0000-4000-8000-000000000031'
  )
$call$, 'AR422', 'A coleção escolhida não está mais disponível.',
  'coleção automática é revalidada dentro do finalizador');
select is(public.record_authoring_publication_failure(
  'a1000000-0000-4000-8000-000000000014',
  'e1000000-0000-4000-8000-000000000031', 'deterministic',
  'collection_unavailable', 'A coleção ficou indisponível.', 422
)->>'recorded', 'true', 'indisponibilidade automática fica registrada');
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000014',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000032', 130
)->>'leaseAcquired', 'true', 'fallback automático permite novo lease');
select is((select collection_id from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000014'),
  '71000000-0000-4000-8000-000000000004'::uuid,
  'execução automática passa para a coleção Outros');
select is((select publication_error is null from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000014'), true,
  'fallback limpa somente a falha de coleção');
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values (
  'c1000000-0000-4000-8000-000000000014', 'published',
  'authoring-auto-collection', 'Coleção automática', 'Objetivo', 0, 1,
  repeat('1a', 32), null, null
);
update public.catalog_collection_courses
set collection_id = '71a00000-0000-4000-8000-000000000001'
where course_id = 'c1000000-0000-4000-8000-000000000014'
  and deleted_at is null;
update private.official_catalog_imports
set status = 'published', completed_at = now(), updated_at = now()
where import_id = 'b1000000-0000-4000-8000-000000000014';
select is(public.finalize_authoring_official_course_import(
  'b1000000-0000-4000-8000-000000000014',
  'a1000000-0000-4000-8000-000000000014',
  'e1000000-0000-4000-8000-000000000032'
)->>'status', 'published', 'retomada automática conclui a execução');
select is((select collection_id from public.catalog_collection_courses
  where course_id = 'c1000000-0000-4000-8000-000000000014'
    and deleted_at is null),
  '71000000-0000-4000-8000-000000000004'::uuid,
  'associação invisível é substituída pela coleção automática válida');
update public.catalog_collections set is_published = true
where id = '71a00000-0000-4000-8000-000000000001';

select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000015',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000041', 130
)->>'leaseAcquired', 'true', 'publicação explícita adquire o primeiro lease');
update public.catalog_collections set is_published = false
where id = '71a00000-0000-4000-8000-000000000002';
select throws_ok($call$
  select public.finalize_authoring_official_course_import(
    'b1000000-0000-4000-8000-000000000015',
    'a1000000-0000-4000-8000-000000000015',
    'e1000000-0000-4000-8000-000000000041'
  )
$call$, 'AR422', 'A coleção escolhida não está mais disponível.',
  'coleção explícita indisponível impede a publicação');
select is(public.record_authoring_publication_failure(
  'a1000000-0000-4000-8000-000000000015',
  'e1000000-0000-4000-8000-000000000041', 'deterministic',
  'collection_unavailable', 'A coleção ficou indisponível.', 422
)->>'recorded', 'true', 'falha da coleção explícita fica registrada');
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values (
  'c1000000-0000-4000-8000-000000000015', 'published',
  'authoring-explicit-collection', 'Coleção explícita', 'Objetivo', 0, 1,
  repeat('1b', 32), null, null
);
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000015',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000042', 130
)->>'leaseAcquired', 'false',
  'coleção explícita ainda indisponível não recebe fallback');
select is((select collection_id from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000015'),
  '71a00000-0000-4000-8000-000000000002'::uuid,
  'falha explícita preserva a coleção escolhida');
select throws_ok($call$
  select private.authoring_complete_publication(
    'a1000000-0000-4000-8000-000000000015',
    'c1000000-0000-4000-8000-000000000015'
  )
$call$, 'AR422', 'A coleção escolhida não está mais disponível.',
  'reconciliação não associa materialização a coleção explícita desativada');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000015'),
  'publishing', 'falha editorial não conclui parcialmente a execução');
update public.catalog_collections set is_published = true
where id = '71a00000-0000-4000-8000-000000000002';
select is(public.claim_authoring_publication(
  'a1000000-0000-4000-8000-000000000015',
  'aa100000-0000-4000-8000-000000000001', null,
  'e1000000-0000-4000-8000-000000000043', 130
)->>'leaseAcquired', 'true',
  'coleção explícita reativada retoma sem mudar a escolha editorial');
select is((select collection_id from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000015'),
  '71a00000-0000-4000-8000-000000000002'::uuid,
  'retomada explícita conserva a mesma coleção');
select is((select publication_error is null from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000015'), true,
  'reativação limpa somente a falha de disponibilidade');
select is(private.authoring_complete_publication(
  'a1000000-0000-4000-8000-000000000015',
  'c1000000-0000-4000-8000-000000000015'
)->>'status', 'published',
  'reconciliação explícita conclui quando a mesma coleção volta a ficar ativa');
select is((select collection_id from public.catalog_collection_courses
  where course_id = 'c1000000-0000-4000-8000-000000000015'
    and deleted_at is null),
  '71a00000-0000-4000-8000-000000000002'::uuid,
  'reconciliação mantém a associação editorial explícita');

-- Intenção create nunca pode substituir um curso que já existe, mesmo
-- quando ainda não há staging.
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values (
  'c1000000-0000-4000-8000-000000000001', 'published',
  'authoring-existing-create', 'Curso existente', 'Objetivo', 0, 1,
  repeat('1', 64), null, null
);
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, document_hash,
  assembled_document, validated_at
) values (
  'a1000000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-existing-create', 'Create indevido', 'publishing', repeat('2', 64),
  '{}'::jsonb, now()
);
select throws_ok($call$
  select public.begin_authoring_official_course_import(
    'b1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    pg_temp.course_payload(
      'c1000000-0000-4000-8000-000000000001', 'authoring-existing-create'
    ), repeat('2', 64), pg_temp.empty_import_manifest()
  )
$call$, '23505', 'O identificador do novo curso já existe no catálogo.',
  'create existente é rejeitado antes de criar staging');

-- Update aplica CAS também antes de existir staging.
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values (
  'c1000000-0000-4000-8000-000000000002', 'published',
  'authoring-stale-update', 'Curso alterado', 'Objetivo', 0, 2,
  repeat('4', 64), null, null
);
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id, collection_explicit,
  publication_intent, base_course_id, base_content_hash, contract_key, title,
  status, document_hash, assembled_document, validated_at
) values (
  'a1000000-0000-4000-8000-000000000002',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'update',
  'c1000000-0000-4000-8000-000000000002', repeat('3', 64),
  'authoring-stale-update', 'Update obsoleto', 'publishing', repeat('5', 64),
  '{}'::jsonb, now()
);
select throws_ok($call$
  select public.begin_authoring_official_course_import(
    'b1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    pg_temp.course_payload(
      'c1000000-0000-4000-8000-000000000002', 'authoring-stale-update'
    ), repeat('5', 64), pg_temp.empty_import_manifest()
  )
$call$, '40001', 'A versão oficial mudou antes da materialização.',
  'update obsoleto é rejeitado sem depender de staging anterior');

-- O mesmo importId/documento não pode ser apropriado por outra execução
-- ou outra coleção.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, document_hash,
  assembled_document, validated_at
) values
  ('a1000000-0000-4000-8000-000000000003',
   'aa100000-0000-4000-8000-000000000001',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-owned-import', 'Primeira execução', 'publishing', repeat('6', 64),
   '{}'::jsonb, now()),
  ('a1000000-0000-4000-8000-000000000004',
   'aa100000-0000-4000-8000-000000000001',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000002', true, 'create',
   'authoring-owned-import', 'Segunda execução', 'publishing', repeat('6', 64),
   '{}'::jsonb, now());
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, authoring_run_id
) values (
  'b1000000-0000-4000-8000-000000000003',
  'c1000000-0000-4000-8000-000000000003', 'authoring-owned-import',
  pg_temp.course_payload(
    'c1000000-0000-4000-8000-000000000003', 'authoring-owned-import'
  ), repeat('6', 64), pg_temp.empty_import_manifest(), true, 'published',
  'a1000000-0000-4000-8000-000000000003'
);
select throws_ok($call$
  select public.begin_authoring_official_course_import(
    'b1000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000004',
    pg_temp.course_payload(
      'c1000000-0000-4000-8000-000000000003', 'authoring-owned-import'
    ), repeat('6', 64), pg_temp.empty_import_manifest()
  )
$call$, '55000', 'Este artefato de publicação pertence a outra execução.',
  'documento idêntico não muda silenciosamente de run ou coleção');

-- Cancelamento antes do finalizador remove somente o staging ainda não
-- materializado e libera a quota da execução.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, document_hash,
  assembled_document, validated_at
) values (
  'a1000000-0000-4000-8000-000000000005',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-cancel-safe', 'Cancelamento seguro', 'publishing', repeat('7', 64),
  '{}'::jsonb, now()
);
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, authoring_run_id
) values (
  'b1000000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000005', 'authoring-cancel-safe',
  pg_temp.course_payload(
    'c1000000-0000-4000-8000-000000000005', 'authoring-cancel-safe'
  ), repeat('7', 64), pg_temp.empty_import_manifest(), true, 'staging',
  'a1000000-0000-4000-8000-000000000005'
);
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'cancel-safe-request-0001', 'a1000000-0000-4000-8000-000000000005',
  'cancel_run', null, jsonb_build_object('reason', 'Publicação interrompida antes da materialização.')
)->>'status', 'cancelled', 'cancelamento pré-finalize conclui de forma segura');
select is((select count(*) from private.official_catalog_imports
  where import_id = 'b1000000-0000-4000-8000-000000000005'), 0::bigint,
  'cancelamento remove o staging parcial');

-- Simula perda da resposta depois que o materializador confirmou o curso. O
-- wrapper conclui run, coleção e compactação na mesma transação; repetir é
-- idempotente e não precisa de um segundo comando para tornar o estado correto.
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values (
  'c1000000-0000-4000-8000-000000000006', 'published',
  'authoring-atomic-finalize', 'Curso atômico', 'Objetivo', 0, 1,
  repeat('8', 64), null, null
);
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, plan, plan_hash,
  validation_report, document_hash, assembled_document, validated_at,
  publication_lease_token, publication_lease_until
) values (
  'a1000000-0000-4000-8000-000000000006',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000002', true, 'create',
  'authoring-atomic-finalize', 'Curso atômico', 'publishing',
  jsonb_build_object(
    'artifact', 'aralearn.course-plan', 'version', 1,
    'learningOutcomes', jsonb_build_array(jsonb_build_object('id', 'outcome-1'))
  ), repeat('9', 64), jsonb_build_object('valid', true), repeat('8', 64),
  jsonb_build_object('contract', 'aralearn.contract', 'version', 3), now(),
  'e1000000-0000-4000-8000-000000000006', now() + interval '2 minutes'
);
insert into private.authoring_parts(
  id, run_id, part_key, position, title, outline, specification, fragment,
  submission_meta, fragment_hash, status, attempt, submitted_at, approved_at
) values (
  'd1000000-0000-4000-8000-000000000006',
  'a1000000-0000-4000-8000-000000000006', 'parte-1', 0, 'Parte 1',
  '{}'::jsonb, jsonb_build_object('ownership', '{}'::jsonb,
    'outcomeIds', jsonb_build_array('outcome-1')),
  jsonb_build_object('microsequences', jsonb_build_array()),
  jsonb_build_object('mode', 'build', 'evidence', jsonb_build_array()),
  repeat('a', 64), 'approved', 1, now(), now()
);
insert into private.authoring_ledger_chunks(
  run_id, section, position, items, content_hash
) values (
  'a1000000-0000-4000-8000-000000000006', 'sources', 0,
  jsonb_build_array(jsonb_build_object('sourceId', 'source-1')), repeat('b', 64)
);
insert into private.authoring_audit_reports(
  run_id, part_id, attempt, decision, findings, reviewed_by
) values (
  'a1000000-0000-4000-8000-000000000006',
  'd1000000-0000-4000-8000-000000000006', 1, 'approve',
  jsonb_build_object('details', repeat('x', 2000)),
  'aa100000-0000-4000-8000-000000000001'
);
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, completed_at, authoring_run_id
) values (
  'b1000000-0000-4000-8000-000000000006',
  'c1000000-0000-4000-8000-000000000006', 'authoring-atomic-finalize',
  pg_temp.course_payload(
    'c1000000-0000-4000-8000-000000000006', 'authoring-atomic-finalize'
  ), repeat('8', 64), pg_temp.empty_import_manifest(), true, 'published', now(),
  'a1000000-0000-4000-8000-000000000006'
);

select is(public.finalize_authoring_official_course_import(
  'b1000000-0000-4000-8000-000000000006',
  'a1000000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000006'
)->>'status', 'published', 'primeiro retorno do finalizador já confirma a execução');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000006'), 'published',
  'run fica published na mesma transação');
select is((select count(*) from public.catalog_collection_courses
  where course_id = 'c1000000-0000-4000-8000-000000000006'
    and collection_id = '71a00000-0000-4000-8000-000000000002'
    and deleted_at is null), 1::bigint,
  'curso entra na coleção escolhida na mesma transação');
select is((select count(*) from private.authoring_ledger_chunks
  where run_id = 'a1000000-0000-4000-8000-000000000006'), 0::bigint,
  'ledger transitório é removido ao publicar');
select is((select assembled_document is null from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000006'), true,
  'documento montado não permanece após a publicação');
select is((select (findings->>'compacted')::boolean from private.authoring_audit_reports
  where run_id = 'a1000000-0000-4000-8000-000000000006'), true,
  'relatório volumoso é compactado');
select is(public.finalize_authoring_official_course_import(
  'b1000000-0000-4000-8000-000000000006',
  'a1000000-0000-4000-8000-000000000006',
  'e1000000-0000-4000-8000-000000000006'
)->>'idempotent', 'true', 'retry depois de perder a resposta é idempotente');

-- Se o importador reconhecer o mesmo hash já publicado, o wrapper encerra a
-- execução de autoria na mesma transação e respeita sua coleção explícita.
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_target,
  collection_id, collection_explicit,
  publication_intent, base_course_id, base_content_hash, contract_key,
  title, status, plan, document_hash, assembled_document, validated_at
) values (
  'a1000000-0000-4000-8000-000000000034',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'update',
  'c1000000-0000-4000-8000-000000000006', repeat('8', 64),
  'authoring-atomic-finalize', 'Reuso atômico', 'publishing',
  jsonb_build_object('kind', 'document_import'), repeat('8', 64),
  jsonb_build_object('contract', 'aralearn.contract', 'version', 3), now()
);
create temporary table begin_reuse_capture(result jsonb) on commit drop;
update private.official_catalog_imports
set authoring_run_id = null, base_course_id = null, base_content_hash = null
where import_id = 'b1000000-0000-4000-8000-000000000006';
insert into begin_reuse_capture(result)
select public.begin_authoring_official_course_import(
  'b1000000-0000-4000-8000-000000000006',
  'a1000000-0000-4000-8000-000000000034',
  pg_temp.course_payload(
    'c1000000-0000-4000-8000-000000000006', 'authoring-atomic-finalize'
  ), repeat('8', 64), pg_temp.empty_import_manifest()
);
select is((select result->>'runFinalized' from begin_reuse_capture), 'true',
  'begin idempotente confirma que a execução também foi finalizada');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000034'), 'published',
  'reuso do import publicado não deixa o run preso em publishing');
select is((select count(*) from public.catalog_collection_courses
  where course_id = 'c1000000-0000-4000-8000-000000000006'
    and collection_id = '71a00000-0000-4000-8000-000000000001'
    and deleted_at is null), 1::bigint,
  'reuso publicado aplica a coleção explícita da execução atual');

-- A manutenção não cancela uma materialização confirmada e não deixa
-- uma publicação pré-materialização consumir quota indefinidamente.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, document_hash,
  assembled_document, created_at, updated_at, expires_at, validated_at
) values
  ('a1000000-0000-4000-8000-000000000007',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-expired-stage', 'Staging vencido', 'publishing', repeat('c', 64),
   '{}'::jsonb, now() - interval '70 days', now() - interval '40 days',
   now() - interval '35 days', now() - interval '40 days'),
  ('a1000000-0000-4000-8000-000000000008',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-expired-materialized', 'Publicação confirmada', 'publishing', repeat('d', 64),
   '{}'::jsonb, now() - interval '70 days', now() - interval '40 days',
   now() - interval '35 days', now() - interval '40 days'),
  ('a1000000-0000-4000-8000-000000000009',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000002', true, 'create',
   'authoring-expired-inactive-collection', 'Coleção desativada', 'publishing', repeat('e', 64),
   '{}'::jsonb, now() - interval '70 days', now() - interval '40 days',
   now() - interval '35 days', now() - interval '40 days'),
  ('a1000000-0000-4000-8000-000000000035',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-expired-no-proof', 'Sem prova causal', 'publishing', repeat('f', 64),
   '{}'::jsonb, now() - interval '70 days', now() - interval '40 days',
   now() - interval '35 days', now() - interval '40 days');
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values
  (
  'c1000000-0000-4000-8000-000000000007', 'published',
  'authoring-expired-stage', 'Curso alheio ao staging', 'Objetivo', 0, 1,
  repeat('c', 64), null, null
  ),
  (
  'c1000000-0000-4000-8000-000000000008', 'published',
  'authoring-expired-materialized', 'Curso confirmado', 'Objetivo', 0, 1,
  repeat('d', 64), null, null
  ),
  (
  'c1000000-0000-4000-8000-000000000009', 'published',
  'authoring-expired-inactive-collection', 'Curso sem coleção', 'Objetivo', 0, 1,
  repeat('e', 64), null, null
  ),
  (
  'c1000000-0000-4000-8000-000000000010', 'published',
  'authoring-expired-no-proof', 'Curso sem prova', 'Objetivo', 0, 1,
  repeat('f', 64), null, null
  );
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, authoring_run_id
) values
  ('b1000000-0000-4000-8000-000000000007',
   'c1000000-0000-4000-8000-000000000007', 'authoring-expired-stage',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000007', 'authoring-expired-stage'
   ), repeat('c', 64), pg_temp.empty_import_manifest(), true, 'staging',
   'a1000000-0000-4000-8000-000000000007'),
  ('b1000000-0000-4000-8000-000000000008',
   'c1000000-0000-4000-8000-000000000008', 'authoring-expired-materialized',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000008', 'authoring-expired-materialized'
    ), repeat('d', 64), pg_temp.empty_import_manifest(), true, 'published',
    'a1000000-0000-4000-8000-000000000008'),
  ('b1000000-0000-4000-8000-000000000009',
   'c1000000-0000-4000-8000-000000000009', 'authoring-expired-inactive-collection',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000009', 'authoring-expired-inactive-collection'
   ), repeat('e', 64), pg_temp.empty_import_manifest(), true, 'published',
   'a1000000-0000-4000-8000-000000000009');

update public.catalog_collections
set is_published = false, updated_at = now()
where id = '71a00000-0000-4000-8000-000000000002';
create temporary table cleanup_capture(result jsonb) on commit drop;
select lives_ok($call$
  insert into cleanup_capture(result)
  select public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days'
  )
$call$, 'reconciliação de publicações vencidas conclui');
select lives_ok($call$
  select public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days'
  )
$call$, 'expiração retoma na fase seguinte sem ampliar o primeiro lote');
update public.catalog_collections
set is_published = true, updated_at = now()
where id = '71a00000-0000-4000-8000-000000000002';
select is((select (result->>'deferredStuckPublications')::bigint from cleanup_capture),
  1::bigint, 'coleção explícita indisponível é isolada sem abortar o lote');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000007'), 'cancelled',
  'staging vencido sem materialização é cancelado com segurança');
select is((select count(*) from private.official_catalog_imports
  where import_id = 'b1000000-0000-4000-8000-000000000007'), 0::bigint,
  'staging vencido é removido');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000008'), 'published',
  'curso já materializado conclui em vez de ser cancelado');
select is((select course_id from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000008'),
  'c1000000-0000-4000-8000-000000000008'::uuid,
  'reconciliação preserva o curso materializado');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000009'), 'publishing',
  'publicação com coleção explícita indisponível permanece recuperável');
select is((select publication_error->>'code' from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000009'), 'collection_unavailable',
  'falha isolada registra causa determinística');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000035'), 'cancelled',
  'curso de mesmo hash sem staging próprio não conclui outra execução');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000007'), 'cancelled',
  'staging ainda incompleto não prova publicação mesmo com curso de mesmo hash');

update public.catalog_collections
set is_published = false, updated_at = now()
where id = '71a00000-0000-4000-8000-000000000002';
update private.authoring_maintenance_state
set last_attempt_at = null, last_cleanup_at = null, last_result = '{}'::jsonb,
    phase = 'recover_publishing', cursor_at = null, cursor_id = null,
    cycle_started_at = null, cycle_cancelled_before = null,
    cycle_published_before = null, cycle_deferred_count = 0,
    last_batch_at = null;
select is(public.maybe_cleanup_authoring_history()->>'status', 'partial',
  'publicação adiada não impede a continuação das demais fases');
select is(public.maybe_cleanup_authoring_history()->>'reason', 'retry_throttle',
  'lote parcial respeita a espera curta entre tentativas');
update private.authoring_maintenance_state
set last_attempt_at = now() - interval '11 seconds';
select is(public.maybe_cleanup_authoring_history()->>'status', 'partial',
  'fase seguinte retoma dez segundos depois de um lote parcial');
select is((select last_cleanup_at is null from private.authoring_maintenance_state), true,
  'tentativa parcial não avança o marco de limpeza concluída');
update public.catalog_collections
set is_published = true, updated_at = now()
where id = '71a00000-0000-4000-8000-000000000002';

-- Ao remover um run terminal, a quota deixa de cobrar o staging apagado e
-- passa a cobrar exatamente as linhas físicas preservadas para idempotência e
-- auditoria, sempre atribuídas ao criador da execução.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status,
  created_at, updated_at, expires_at, terminal_compacted_at
) values (
  'a1000000-0000-4000-8000-000000000044',
  'aa100000-0000-4000-8000-000000000002', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-retained-physical', 'Retenção física', 'cancelled',
  now() - interval '80 days', now() - interval '40 days',
  now() - interval '40 days', now() - interval '40 days'
);
insert into private.authoring_command_events(
  run_id, actor_user_id, request_id, command, request_hash, result, created_at
) values (
  'a1000000-0000-4000-8000-000000000044',
  'aa100000-0000-4000-8000-000000000002',
  'retained-physical-0001', 'cancel_run', repeat('6', 64),
  jsonb_build_object('status', 'cancelled', 'runId',
    'a1000000-0000-4000-8000-000000000044'),
  now() - interval '40 days'
);
create temporary table retained_transfer_capture(
  actor_before bigint not null,
  run_before bigint not null
) on commit drop;
insert into retained_transfer_capture values (
  private.authoring_actor_retained_bytes(
    'aa100000-0000-4000-8000-000000000002'
  ),
  private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000044'
  )
);
select lives_ok($call$
  select public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days'
  )
$call$, 'cleanup transfere histórico terminal para retenção física');
select is((select count(*) from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000044'), 0::bigint,
  'run terminal elegível é removido');
select is((select responsible_user_id from private.authoring_command_receipts
  where run_id = 'a1000000-0000-4000-8000-000000000044' limit 1),
  'aa100000-0000-4000-8000-000000000002'::uuid,
  'recibo retido continua atribuído ao criador');
select is((select responsible_user_id from private.authoring_retention_events
  where run_id = 'a1000000-0000-4000-8000-000000000044'
    and action = 'terminal_run_deleted'),
  'aa100000-0000-4000-8000-000000000002'::uuid,
  'evento de retenção continua atribuído ao criador');
select is(
  private.authoring_actor_retained_bytes(
    'aa100000-0000-4000-8000-000000000002'
  ) - (select actor_before - run_before from retained_transfer_capture),
  (coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(receipt)))
    from private.authoring_command_receipts receipt
    where receipt.run_id = 'a1000000-0000-4000-8000-000000000044'), 0)
  + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(event)))
    from private.authoring_retention_events event
    where event.run_id = 'a1000000-0000-4000-8000-000000000044'), 0))::bigint,
  'quota pós-cleanup cobra somente recibos e eventos realmente retidos'
);

-- Cancelar não pode apropriar um curso de mesmo hash sem staging próprio e
-- deve liberar imediatamente os payloads transitórios, inclusive os recibos.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, brief, status, plan, validation_report,
  document_hash, assembled_document, validated_at
) values (
  'a1000000-0000-4000-8000-000000000033',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-cancel-no-proof', 'Cancelamento causal',
  jsonb_build_object('payload', (
    select jsonb_agg(md5(item::text)) from generate_series(1, 500) item
  )), 'publishing',
  jsonb_build_object('artifact', 'aralearn.course-plan', 'padding', repeat('p', 3000)),
  jsonb_build_object('valid', true, 'padding', repeat('v', 3000)),
  repeat('1', 64), jsonb_build_object('padding', repeat('d', 3000)), now()
);
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values (
  'c1000000-0000-4000-8000-000000000033', 'published',
  'authoring-cancel-no-proof', 'Curso independente', 'Objetivo', 0, 1,
  repeat('1', 64), null, null
);
insert into private.authoring_parts(
  id, run_id, part_key, position, title, outline, specification, fragment,
  submission_meta, fragment_hash, status, attempt, submitted_at, approved_at
) values (
  'd1000000-0000-4000-8000-000000000033',
  'a1000000-0000-4000-8000-000000000033', 'parte-cancelada', 0,
  'Parte cancelada', jsonb_build_object('payload', (
    select jsonb_agg(md5(item::text)) from generate_series(1, 3000) item
  )),
  jsonb_build_object('ownership', '{}'::jsonb, 'padding', repeat('s', 3000)),
  jsonb_build_object('padding', repeat('f', 3000)),
  jsonb_build_object('evidence', jsonb_build_array(repeat('m', 3000))),
  repeat('2', 64), 'approved', 1, now(), now()
);
insert into private.authoring_audit_reports(
  run_id, part_id, attempt, decision, findings, reviewed_by
) values (
  'a1000000-0000-4000-8000-000000000033',
  'd1000000-0000-4000-8000-000000000033', 1, 'approve',
  jsonb_build_object('details', repeat('a', 4000)),
  'aa100000-0000-4000-8000-000000000001'
);
insert into private.authoring_block_events(
  run_id, part_id, action, context, actor_user_id
) values (
  'a1000000-0000-4000-8000-000000000033',
  'd1000000-0000-4000-8000-000000000033', 'resume',
  jsonb_build_object('details', repeat('b', 4000)),
  'aa100000-0000-4000-8000-000000000001'
);
insert into private.authoring_command_events(
  run_id, actor_user_id, request_id, command, request_hash, result
) values (
  'a1000000-0000-4000-8000-000000000033',
  'aa100000-0000-4000-8000-000000000001',
  'cancel-large-prior-0001', 'prepare_publish', repeat('3', 64),
  jsonb_build_object('status', 'publishing', 'runId',
    'a1000000-0000-4000-8000-000000000033', 'details', repeat('r', 8000))
);
create temporary table cancelled_size_capture(
  before_bytes bigint not null,
  after_bytes bigint,
  after_events bigint
) on commit drop;
insert into cancelled_size_capture(before_bytes)
values (private.authoring_run_staging_bytes('a1000000-0000-4000-8000-000000000033'));
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'cancel-causal-request-0001', 'a1000000-0000-4000-8000-000000000033',
  'cancel_run', null, jsonb_build_object('reason', 'Encerrar o teste.')
)->>'status', 'cancelled', 'cancelamento sem prova própria não conclui publicação alheia');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000033'), 'cancelled',
  'curso de mesmo hash não transforma cancelamento em publicação');
select is((select (findings->>'compacted')::boolean from private.authoring_audit_reports
  where run_id = 'a1000000-0000-4000-8000-000000000033'), true,
  'cancelamento compacta relatórios imediatamente');
select is((select (context->>'compacted')::boolean from private.authoring_block_events
  where run_id = 'a1000000-0000-4000-8000-000000000033'), true,
  'cancelamento compacta contexto de bloqueio imediatamente');
select is((select (result->>'compacted')::boolean from private.authoring_command_events
  where request_id = 'cancel-large-prior-0001'), true,
  'cancelamento compacta resultados antigos sem perder o recibo causal');
select is((select (brief->>'compacted')::boolean from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000033'), true,
  'cancelamento compacta o briefing volumoso');
select is((select (outline->>'compacted')::boolean from private.authoring_parts
  where run_id = 'a1000000-0000-4000-8000-000000000033'), true,
  'cancelamento compacta o roteiro volumoso de cada parte');
update cancelled_size_capture
set after_bytes = private.authoring_run_staging_bytes(
      'a1000000-0000-4000-8000-000000000033'
    ),
    after_events = (select count(*) from private.authoring_command_events event
      where event.run_id = 'a1000000-0000-4000-8000-000000000033');
select ok((select after_bytes < before_bytes / 4 from cancelled_size_capture),
  'estado terminal cai a uma fração do staging ativo');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'cancel-causal-request-0002', 'a1000000-0000-4000-8000-000000000033',
  'cancel_run', null, jsonb_build_object('reason', 'Repetição segura.')
)->>'idempotentTerminal', 'true', 'cancelamento terminal pode ser repetido com segurança');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'cancel-causal-request-0003', 'a1000000-0000-4000-8000-000000000033',
  'cancel_run', null, jsonb_build_object('reason', 'Outra repetição segura.')
)->>'idempotentTerminal', 'true', 'outro requestId terminal também não grava evento');
select is(private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000033'
  ), (select after_bytes from cancelled_size_capture),
  'cancelamentos terminais com requestIds novos não aumentam os bytes');
select is((select count(*) from private.authoring_command_events event
    where event.run_id = 'a1000000-0000-4000-8000-000000000033'),
  (select after_events from cancelled_size_capture),
  'cancelamentos terminais com requestIds novos não criam eventos');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'cancel-causal-request-0001', 'a1000000-0000-4000-8000-000000000033',
  'cancel_run', null, jsonb_build_object('reason', 'Encerrar o teste.')
)->>'idempotent', 'true', 'requestId do primeiro cancelamento conserva replay idempotente');

-- O cliente pode usar qualquer chave no briefing. A compactação confia
-- apenas no marcador server-side e nunca interpreta um campo autoral chamado
-- compacted.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, brief, status
) values
  ('a1000000-0000-4000-8000-000000000039',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-forged-compacted-string', 'Marcador autoral inválido',
   jsonb_build_object('compacted', 'x'), 'planning'),
  ('a1000000-0000-4000-8000-000000000040',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-forged-compacted-true', 'Marcador autoral forjado',
   jsonb_build_object('compacted', true, 'padding', (
     select jsonb_agg(md5(item::text)) from generate_series(1, 300) item
   )), 'planning');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'forged-compact-string-0001', 'a1000000-0000-4000-8000-000000000039',
  'cancel_run', null, jsonb_build_object('reason', 'Testar marcador textual.')
)->>'status', 'cancelled', 'marcador textual autoral não quebra cancelamento');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'forged-compact-true-0001', 'a1000000-0000-4000-8000-000000000040',
  'cancel_run', null, jsonb_build_object('reason', 'Testar marcador forjado.')
)->>'status', 'cancelled', 'marcador booleano autoral não evita compactação');
select is((select brief ? 'padding' from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000040'), false,
  'payload forjado é removido mesmo quando declara compacted true');
select ok((select bool_and(
    terminal_compacted_at is not null
    and brief->>'compacted' = 'true'
    and brief ? 'sha256'
  ) from private.authoring_runs
  where id in (
    'a1000000-0000-4000-8000-000000000039',
    'a1000000-0000-4000-8000-000000000040'
  )), 'marcador server-side confirma a compactação dos dois payloads');

-- O histórico terminal compacto também tem quota própria. Cancelar permanece
-- possível para liberar staging ativo, mas o mesmo autor não inicia outro
-- ciclo ilimitado enquanto a retenção ainda ocupa o banco.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status
) values
  ('a1000000-0000-4000-8000-000000000036',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'terminal-quota-owner', 'Quota terminal do proprietário', 'planning'),
  ('a1000000-0000-4000-8000-000000000037',
   'aa100000-0000-4000-8000-000000000003', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'terminal-quota-other', 'Quota terminal de outro autor', 'planning');
create temporary table terminal_quota_capture(
  actor_one bigint not null,
  actor_three bigint not null,
  global_bytes bigint not null
) on commit drop;
insert into terminal_quota_capture
select
  private.authoring_actor_retained_bytes(
    'aa100000-0000-4000-8000-000000000001'
  ),
  private.authoring_actor_retained_bytes(
    'aa100000-0000-4000-8000-000000000003'
  ),
  private.authoring_global_retained_bytes();
select ok((select actor_one > actor_three from terminal_quota_capture),
  'cenário de isolamento possui históricos terminais distintos');
select set_config('aralearn.authoring_actor_terminal_quota_bytes',
  (select actor_one::text from terminal_quota_capture), true);
select throws_ok($call$
  select private.authoring_assert_staging_quota(
    'aa100000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000036', 0, 0
  )
$call$, '54000',
  'O histórico terminal retido do autor atingiu a quota configurada.',
  'quota terminal bloqueia nova gravação do autor que atingiu o limite');
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'terminal-quota-create-0001', 'a1000000-0000-4000-8000-000000000038',
    'create_run', null, jsonb_build_object(
      'title', 'Nova execução bloqueada',
      'contractKey', 'terminal-quota-blocked-create',
      'collectionId', '71a00000-0000-4000-8000-000000000001',
      'publicationIntent', jsonb_build_object('mode', 'create')
    )
  )
$call$, '54000',
  'O histórico terminal retido do autor atingiu a quota configurada.',
  'quota terminal impede criar novo run sem deixar linha parcial');
select is((select count(*) from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000038'), 0::bigint,
  'criação bloqueada não persiste execução');
select lives_ok($call$
  select private.authoring_assert_staging_quota(
    'aa100000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000037', 0, 0
  )
$call$, 'quota terminal de um autor não bloqueia outro autor abaixo do limite');
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001', null,
  'terminal-quota-cancel-0001', 'a1000000-0000-4000-8000-000000000036',
  'cancel_run', null, jsonb_build_object('reason', 'Liberar staging mesmo sob quota.')
)->>'status', 'cancelled', 'cancelamento continua permitido sob quota terminal');

update terminal_quota_capture capture
set global_bytes = private.authoring_global_retained_bytes();
select set_config('aralearn.authoring_actor_terminal_quota_bytes',
  (select global_bytes::text from terminal_quota_capture), true);
select set_config('aralearn.authoring_global_terminal_quota_bytes',
  (select global_bytes::text from terminal_quota_capture), true);
select throws_ok($call$
  select private.authoring_assert_staging_quota(
    'aa100000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000037', 0, 0
  )
$call$, '54000',
  'O histórico terminal retido atingiu a quota global configurada.',
  'quota global alcança a soma de todos os autores sob a mesma trava');
select set_config('aralearn.authoring_actor_terminal_quota_bytes', '', true);
select set_config('aralearn.authoring_global_terminal_quota_bytes', '', true);
delete from private.authoring_runs
where id = 'a1000000-0000-4000-8000-000000000037';

-- A validação usa uma revisão monotônica, não apenas o nome do estado. Mesmo
-- que reopen -> repair -> approve volte a ready_for_validation, o retrato
-- montado antes dessas mudanças não pode ser confirmado (proteção contra ABA).
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, plan, revision
) values (
  'a1000000-0000-4000-8000-000000000020',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-aba-validation', 'Validação causal', 'ready_for_validation',
  jsonb_build_object('kind', 'document_import'), 1
);
update private.authoring_runs
set status = 'repair', revision = revision + 1
where id = 'a1000000-0000-4000-8000-000000000020';
update private.authoring_runs
set status = 'ready_for_validation', revision = revision + 1
where id = 'a1000000-0000-4000-8000-000000000020';
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'aba-validation-request-0001', 'a1000000-0000-4000-8000-000000000020',
    'validate', null, jsonb_build_object(
      'expectedRevision', 1,
      'valid', true,
      'documentHash', repeat('a', 64),
      'document', '{}'::jsonb,
      'validation', jsonb_build_object('valid', true)
    )
  )
$call$, '40001', 'A execução mudou durante a validação integral.',
  'validação rejeita retrato ABA com revisão antiga');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000020'),
  'ready_for_validation', 'falha causal não altera a execução atual');

-- block e resume contam blocked_context, histórico e recibo antes de gravar.
-- Limites menores, válidos somente nesta transação de teste, tornam a prova
-- rápida sem alocar dezenas de MiB.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status
) values
  ('a1000000-0000-4000-8000-000000000021',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-block-quota', 'Quota de bloqueio', 'planning'),
  ('a1000000-0000-4000-8000-000000000022',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-resume-quota', 'Quota de retomada', 'planning');
update private.authoring_runs
set status = 'blocked',
    blocked_previous_status = 'planning',
    blocked_context = jsonb_build_object(
      'reason', 'Aguardar resposta.', 'questions', jsonb_build_array(), 'partKey', null
    )
where id = 'a1000000-0000-4000-8000-000000000022';
select set_config(
  'aralearn.authoring_run_quota_bytes',
  (private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000021'
  ) + 128)::text,
  true
);
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'block-quota-request-0001', 'a1000000-0000-4000-8000-000000000021',
    'block', null, jsonb_build_object(
      'reason', repeat('b', 512), 'questions', jsonb_build_array()
    )
  )
$call$, '54000', 'A execução excederia a quota de staging de 32 MiB.',
  'block não ultrapassa a quota por repetição de contexto');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000021'),
  'planning', 'block rejeitado não muda o estado');
select is((select count(*) from private.authoring_block_events
  where run_id = 'a1000000-0000-4000-8000-000000000021'), 0::bigint,
  'block rejeitado não cria histórico parcial');
select set_config(
  'aralearn.authoring_run_quota_bytes',
  (private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000022'
  ) + 64)::text,
  true
);
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'resume-quota-request-0001', 'a1000000-0000-4000-8000-000000000022',
    'resume', null, jsonb_build_object(
      'resolution', jsonb_build_object('answer', repeat('r', 512))
    )
  )
$call$, '54000', 'A execução excederia a quota de staging de 32 MiB.',
  'resume não ultrapassa a quota por acúmulo de resoluções');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000022'),
  'blocked', 'resume rejeitado preserva o bloqueio');
select is((select count(*) from private.authoring_block_events
  where run_id = 'a1000000-0000-4000-8000-000000000022'), 0::bigint,
  'resume rejeitado não cria histórico parcial');
select set_config('aralearn.authoring_run_quota_bytes', '', true);

-- A decisão blocked da auditoria grava relatório, contexto no run e evento.
-- Todos esses bytes são reservados antes da primeira escrita.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status
) values (
  'a1000000-0000-4000-8000-000000000024',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-audit-blocked-quota', 'Quota de auditoria bloqueada', 'auditing'
);
insert into private.authoring_parts(
  id, run_id, part_key, position, title, outline, fragment,
  submission_meta, fragment_hash, status, attempt, submitted_at
) values (
  'ad100000-0000-4000-8000-000000000024',
  'a1000000-0000-4000-8000-000000000024', 'parte-quota', 0,
  'Parte sob auditoria', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  repeat('2a', 32), 'awaiting_audit', 1, now()
);
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'audit-outdated-gates-0001', 'a1000000-0000-4000-8000-000000000024',
    'audit_part', 'parte-quota', jsonb_build_object(
      'expectedAttempt', 1,
      'submissionSha256', repeat('2a', 32),
      'decision', 'blocked',
      'gates', jsonb_build_object(
        'contract', false, 'specification', true, 'sources', true,
        'didactics', true, 'continuity', true, 'language', true,
        'resources', true
      ),
      'findings', jsonb_build_array(),
      'instructions', 'Conferir o curso.'
    )
  )
$call$, '22023', 'Decisão de auditoria inválida.',
  'a transação rejeita o conjunto antigo de critérios de auditoria');
select set_config(
  'aralearn.authoring_run_quota_bytes',
  (private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000024'
  ) + 128)::text,
  true
);
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001', null,
    'audit-blocked-quota-0001', 'a1000000-0000-4000-8000-000000000024',
    'audit_part', 'parte-quota', jsonb_build_object(
      'expectedAttempt', 1,
      'submissionSha256', repeat('2a', 32),
      'decision', 'blocked',
      'gates', jsonb_build_object(
        'planAlignment', false, 'contract', true, 'outcomeCoverage', true,
        'sources', true, 'continuity', true, 'interactionCoherence', true,
        'language', true, 'fieldPreservation', true,
        'structuredElements', true, 'feedback', true
      ),
      'findings', jsonb_build_array(),
      'instructions', (
        select string_agg(md5(item::text), '') from generate_series(1, 64) item
      )
    )
  )
$call$, '54000', 'A execução excederia a quota de staging de 32 MiB.',
  'audit_part blocked reserva relatório e dois contextos antes de gravar');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000024'),
  'auditing', 'quota preserva o estado anterior da execução auditada');
select is((select status from private.authoring_parts
  where id = 'ad100000-0000-4000-8000-000000000024'),
  'awaiting_audit', 'quota preserva a parte aguardando auditoria');
select is((select count(*) from private.authoring_audit_reports
  where run_id = 'a1000000-0000-4000-8000-000000000024'), 0::bigint,
  'quota não deixa relatório parcial');
select is((select count(*) from private.authoring_block_events
  where run_id = 'a1000000-0000-4000-8000-000000000024'), 0::bigint,
  'quota não deixa evento de bloqueio parcial');
select set_config('aralearn.authoring_run_quota_bytes', '', true);

-- A cobrança conservadora aceita igualdade exata e rejeita um único byte
-- excedente. A asserção comum volta a medir depois que a linha do recibo foi
-- inserida, de modo que uma falha reverta a operação inteira.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status
) values
  ('a1000000-0000-4000-8000-000000000027',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-exact-quota', 'Limite exato', 'planning'),
  ('a1000000-0000-4000-8000-000000000028',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-over-quota', 'Um byte além', 'planning');
select set_config(
  'aralearn.authoring_run_quota_bytes',
  private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000027'
  )::text,
  true
);
select lives_ok($call$
  select private.authoring_assert_staging_quota(
    'aa100000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000027', 0, 0
  )
$call$, 'estado físico exatamente no limite é aceito');
select set_config(
  'aralearn.authoring_run_quota_bytes',
  (private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000027'
  ) - 1)::text,
  true
);
select throws_ok($call$
  select private.authoring_assert_staging_quota(
    'aa100000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000027', 0, 0
  )
$call$, '54000', 'A execução excederia a quota de staging de 32 MiB.',
  'um byte além do limite físico é rejeitado');
select ok((
  select strpos(definition, 'insert into private.authoring_command_events(')
    < strpos(definition, 'A segunda leitura ocorre depois do INSERT')
  from (
    select pg_get_functiondef(
      'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
    ) definition
  ) source
), 'asserção final ocorre depois da persistência da linha completa do comando');
select set_config('aralearn.authoring_run_quota_bytes', '', true);
delete from private.authoring_runs where id in (
  'a1000000-0000-4000-8000-000000000027',
  'a1000000-0000-4000-8000-000000000028'
);

-- A medição inclui a linha inteira, não apenas seus JSONBs. Metadados longos
-- e muitos eventos mínimos aumentam a cobrança pelo valor integral com a
-- mesma margem estrutural usada pela quota.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status
) values
  ('a1000000-0000-4000-8000-000000000041',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-short-metadata', 'Metadado pequeno', 'planning'),
  ('a1000000-0000-4000-8000-000000000042',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-long-metadata', 'Metadado longo', 'planning'),
  ('a1000000-0000-4000-8000-000000000043',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-minimal-events', 'Eventos mínimos', 'planning');
create temporary table structural_charge_capture(
  run_id uuid primary key,
  before_bytes bigint not null
) on commit drop;
insert into structural_charge_capture
select run.id, private.authoring_run_staging_bytes(run.id)
from private.authoring_runs run
where run.id in (
  'a1000000-0000-4000-8000-000000000041',
  'a1000000-0000-4000-8000-000000000042',
  'a1000000-0000-4000-8000-000000000043'
);
insert into private.authoring_command_events(
  run_id, actor_user_id, request_id, command, request_hash, result
) values
  ('a1000000-0000-4000-8000-000000000041',
   'aa100000-0000-4000-8000-000000000001', 'meta0001', 'block',
   repeat('4', 64), jsonb_build_object('status', 'planning')),
  ('a1000000-0000-4000-8000-000000000042',
   'aa100000-0000-4000-8000-000000000001', repeat('m', 127), 'block',
   repeat('5', 64), jsonb_build_object('status', 'planning'));
select ok(
  private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000042'
  ) - (select before_bytes from structural_charge_capture
    where run_id = 'a1000000-0000-4000-8000-000000000042')
  > private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000041'
  ) - (select before_bytes from structural_charge_capture
    where run_id = 'a1000000-0000-4000-8000-000000000041'),
  'metadado textual longo aumenta a cobrança mesmo com resultado igual'
);
insert into private.authoring_block_events(
  run_id, action, context, actor_user_id
)
select
  'a1000000-0000-4000-8000-000000000043',
  case when item % 2 = 0 then 'block' else 'resume' end,
  '{}'::jsonb,
  'aa100000-0000-4000-8000-000000000001'
from generate_series(1, 20) item;
select is(
  private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000043'
  ) - (select before_bytes from structural_charge_capture
    where run_id = 'a1000000-0000-4000-8000-000000000043'),
  (select sum(private.authoring_row_storage_charge(to_jsonb(event)))::bigint
   from private.authoring_block_events event
   where event.run_id = 'a1000000-0000-4000-8000-000000000043'),
  'vinte eventos mínimos entram integralmente na medição do run'
);
delete from private.authoring_runs where id in (
  'a1000000-0000-4000-8000-000000000041',
  'a1000000-0000-4000-8000-000000000042',
  'a1000000-0000-4000-8000-000000000043'
);

-- A quota pertence ao criador do run, mesmo quando um colaborador autorizado
-- executa a operação. Um segundo run dá ao autor um consumo já existente.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, plan
) values
  ('a1000000-0000-4000-8000-000000000025',
   'aa100000-0000-4000-8000-000000000003', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-owner-quota-target', 'Quota do autor', 'planning', null),
  ('a1000000-0000-4000-8000-000000000026',
   'aa100000-0000-4000-8000-000000000003', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-owner-quota-padding', 'Consumo do mesmo autor', 'planning',
   jsonb_build_object('padding', (
     select jsonb_agg(md5(item::text)) from generate_series(1, 2000) item
   )));
select set_config(
  'aralearn.authoring_run_quota_bytes',
  (private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000025'
  ) + 4096)::text,
  true
);
select set_config(
  'aralearn.authoring_actor_quota_bytes',
  ((select sum(private.authoring_run_staging_bytes(run.id))
    from private.authoring_runs run
    where run.created_by = 'aa100000-0000-4000-8000-000000000003'
      and run.status not in ('published', 'cancelled')) + 128)::text,
  true
);
select throws_ok($call$
  select private.authoring_assert_staging_quota(
    'aa100000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000025', 1024, 0
  )
$call$, '54000', 'O autor excederia a quota de staging de 64 MiB.',
  'operação colaborativa consome a quota do criador do run');
select ok((
  select strpos(
    pg_get_functiondef(
      'private.authoring_assert_staging_quota(uuid,uuid,bigint,bigint)'::regprocedure
    ),
    'v_run_bytes := private.authoring_run_staging_bytes(p_run_id);'
  ) > strpos(
    pg_get_functiondef(
      'private.authoring_assert_staging_quota(uuid,uuid,bigint,bigint)'::regprocedure
    ),
    'authoring_acquire_storage_locks(v_quota_actor_id)'
  )
), 'tamanho do run é relido depois da trava de quota');
select set_config('aralearn.authoring_run_quota_bytes', '', true);
select set_config('aralearn.authoring_actor_quota_bytes', '', true);

-- Duas requisições HTTP iguais podem montar payloads internos diferentes
-- (por exemplo, expectedRevision 7 e 9). O hash externo é a identidade causal.
insert into private.authoring_command_events(
  run_id, actor_user_id, request_id, command, api_request_hash,
  request_hash, result
) values (
  'a1000000-0000-4000-8000-000000000025',
  'aa100000-0000-4000-8000-000000000003',
  'external-hash-event-0001', 'block', repeat('a', 64), repeat('b', 64),
  jsonb_build_object('status', 'planning', 'runId',
    'a1000000-0000-4000-8000-000000000025')
);
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000003', null,
  'external-hash-event-0001', 'a1000000-0000-4000-8000-000000000025',
  'block', null, jsonb_build_object(
    '_apiRequestHash', repeat('a', 64),
    'reason', 'Payload interno diferente', 'questions', jsonb_build_array()
  )
)->>'idempotent', 'true',
  'command_event repete pelo mesmo hash HTTP apesar do hash interno diferente');
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000003', null,
    'external-hash-event-0001', 'a1000000-0000-4000-8000-000000000025',
    'block', null, jsonb_build_object(
      '_apiRequestHash', repeat('c', 64),
      'reason', 'Outra requisição HTTP', 'questions', jsonb_build_array()
    )
  )
$call$, '22023', 'requestId reutilizado com conteúdo diferente.',
  'command_event rejeita hash HTTP diferente');
insert into private.authoring_command_receipts(
  actor_user_id, responsible_user_id, request_id, run_id, command, api_request_hash,
  request_hash, result, command_created_at
) values (
  'aa100000-0000-4000-8000-000000000003',
  'aa100000-0000-4000-8000-000000000003',
  'external-hash-receipt-0001', 'a1000000-0000-4000-8000-000000000026',
  'block', repeat('d', 64), repeat('e', 64),
  jsonb_build_object('status', 'planning', 'runId',
    'a1000000-0000-4000-8000-000000000026'), now()
);
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000003', null,
  'external-hash-receipt-0001', 'a1000000-0000-4000-8000-000000000026',
  'block', null, jsonb_build_object(
    '_apiRequestHash', repeat('d', 64),
    'reason', 'Payload recomposto', 'questions', jsonb_build_array()
  )
)->>'idempotent', 'true',
  'recibo retido também repete pelo mesmo hash HTTP');
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000003', null,
    'external-hash-receipt-0001', 'a1000000-0000-4000-8000-000000000026',
    'block', null, jsonb_build_object(
      '_apiRequestHash', repeat('f', 64),
      'reason', 'Outra chamada', 'questions', jsonb_build_array()
    )
  )
$call$, '22023', 'requestId reutilizado com conteúdo diferente.',
  'recibo retido rejeita hash HTTP diferente');

-- A quota inclui o staging físico do importador. O trigger do recibo de chunk
-- enxerga todas as linhas inseridas no mesmo comando e sua falha desfaz o lote.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, document_hash,
  assembled_document, validated_at
) values
  ('a1000000-0000-4000-8000-000000000030',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'physical-staging-chunk', 'Quota física', 'publishing', repeat('4', 64),
   '{}'::jsonb, now()),
  ('a1000000-0000-4000-8000-000000000031',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'physical-staging-flow', 'Quota física de flow', 'publishing', repeat('5', 64),
   '{}'::jsonb, now()),
  ('a1000000-0000-4000-8000-000000000032',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'physical-staging-manifest', 'Quota física do manifesto', 'publishing', repeat('6', 64),
   '{}'::jsonb, now());
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, authoring_run_id
) values
  ('b1000000-0000-4000-8000-000000000030',
   'c1000000-0000-4000-8000-000000000030', 'physical-staging-chunk',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000030', 'physical-staging-chunk'
   ), repeat('4', 64), jsonb_set(pg_temp.empty_import_manifest(), '{modules}', '1'),
   true, 'staging', 'a1000000-0000-4000-8000-000000000030'),
  ('b1000000-0000-4000-8000-000000000031',
   'c1000000-0000-4000-8000-000000000031', 'physical-staging-flow',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000031', 'physical-staging-flow'
   ), repeat('5', 64), jsonb_set(jsonb_set(
     pg_temp.empty_import_manifest(), '{flowNodes}', '1'
   ), '{flowCases}', '1'), true, 'staging',
   'a1000000-0000-4000-8000-000000000031'),
  ('b1000000-0000-4000-8000-000000000032',
   'c1000000-0000-4000-8000-000000000032', 'physical-staging-manifest',
   pg_temp.course_payload(
     'c1000000-0000-4000-8000-000000000032', 'physical-staging-manifest',
     repeat('M', 4000)
   ), repeat('6', 64), pg_temp.empty_import_manifest(), true, 'staging', null);

select lives_ok($call$
  select public.apply_official_course_import_chunk(
    'b1000000-0000-4000-8000-000000000030', 'modules', 0,
    jsonb_build_array(jsonb_build_object(
      'id', 'd1000000-0000-4000-8000-000000000030',
      'courseId', 'c1000000-0000-4000-8000-000000000030'
    ))
  )
$call$, 'chunk de referência mede o tamanho físico final');
create temporary table physical_quota_capture(
  kind text primary key, bytes bigint not null
) on commit drop;
insert into physical_quota_capture values (
  'chunk', private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000030'
  )
);
delete from private.official_catalog_import_chunks
where import_id = 'b1000000-0000-4000-8000-000000000030';
delete from private.official_catalog_import_stage_rows
where import_id = 'b1000000-0000-4000-8000-000000000030';
select set_config('aralearn.authoring_run_quota_bytes',
  (select bytes::text from physical_quota_capture where kind = 'chunk'), true);
select lives_ok($call$
  select public.apply_official_course_import_chunk(
    'b1000000-0000-4000-8000-000000000030', 'modules', 0,
    jsonb_build_array(jsonb_build_object(
      'id', 'd1000000-0000-4000-8000-000000000030',
      'courseId', 'c1000000-0000-4000-8000-000000000030'
    ))
  )
$call$, 'staging físico exatamente no limite é aceito');
delete from private.official_catalog_import_chunks
where import_id = 'b1000000-0000-4000-8000-000000000030';
delete from private.official_catalog_import_stage_rows
where import_id = 'b1000000-0000-4000-8000-000000000030';
select set_config('aralearn.authoring_run_quota_bytes',
  (select (bytes - 1)::text from physical_quota_capture where kind = 'chunk'), true);
select throws_ok($call$
  select public.apply_official_course_import_chunk(
    'b1000000-0000-4000-8000-000000000030', 'modules', 0,
    jsonb_build_array(jsonb_build_object(
      'id', 'd1000000-0000-4000-8000-000000000030',
      'courseId', 'c1000000-0000-4000-8000-000000000030'
    ))
  )
$call$, '54000', 'A execução excederia a quota de staging de 32 MiB.',
  'um byte excedente desfaz todas as linhas do chunk');
select is((select count(*) from private.official_catalog_import_stage_rows
  where import_id = 'b1000000-0000-4000-8000-000000000030'), 0::bigint,
  'chunk rejeitado não deixa linhas físicas parciais');
select set_config('aralearn.authoring_run_quota_bytes', '', true);

select lives_ok($call$
  select public.apply_official_course_import_flow_chunk(
    'b1000000-0000-4000-8000-000000000031', 0,
    jsonb_build_array(jsonb_build_object(
      'id', 'd1000000-0000-4000-8000-000000000031',
      'courseId', 'c1000000-0000-4000-8000-000000000031',
      'blockId', 'd1000000-0000-4000-8000-000000000039'
    )),
    jsonb_build_array(jsonb_build_object(
      'id', 'd1000000-0000-4000-8000-000000000032',
      'courseId', 'c1000000-0000-4000-8000-000000000031',
      'blockId', 'd1000000-0000-4000-8000-000000000039'
    ))
  )
$call$, 'flow de referência mede o tamanho físico final');
insert into physical_quota_capture values (
  'flow', private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000031'
  )
);
delete from private.official_catalog_import_chunks
where import_id = 'b1000000-0000-4000-8000-000000000031';
delete from private.official_catalog_import_stage_rows
where import_id = 'b1000000-0000-4000-8000-000000000031';
select set_config('aralearn.authoring_run_quota_bytes',
  (select (bytes - 1)::text from physical_quota_capture where kind = 'flow'), true);
select throws_ok($call$
  select public.apply_official_course_import_flow_chunk(
    'b1000000-0000-4000-8000-000000000031', 0,
    jsonb_build_array(jsonb_build_object(
      'id', 'd1000000-0000-4000-8000-000000000031',
      'courseId', 'c1000000-0000-4000-8000-000000000031',
      'blockId', 'd1000000-0000-4000-8000-000000000039'
    )),
    jsonb_build_array(jsonb_build_object(
      'id', 'd1000000-0000-4000-8000-000000000032',
      'courseId', 'c1000000-0000-4000-8000-000000000031',
      'blockId', 'd1000000-0000-4000-8000-000000000039'
    ))
  )
$call$, '54000', 'A execução excederia a quota de staging de 32 MiB.',
  'flow acima do limite desfaz nós e casos juntos');
select is((select count(*) from private.official_catalog_import_stage_rows
  where import_id = 'b1000000-0000-4000-8000-000000000031'), 0::bigint,
  'flow rejeitado não conserva metade do bloco');
select set_config('aralearn.authoring_run_quota_bytes', '', true);

update private.official_catalog_imports
set authoring_run_id = 'a1000000-0000-4000-8000-000000000032'
where import_id = 'b1000000-0000-4000-8000-000000000032';
insert into physical_quota_capture values (
  'manifest', private.authoring_run_staging_bytes(
    'a1000000-0000-4000-8000-000000000032'
  )
);
update private.official_catalog_imports set authoring_run_id = null
where import_id = 'b1000000-0000-4000-8000-000000000032';
select set_config('aralearn.authoring_run_quota_bytes',
  (select (bytes - 1)::text from physical_quota_capture where kind = 'manifest'), true);
select throws_ok($call$
  update private.official_catalog_imports
  set authoring_run_id = 'a1000000-0000-4000-8000-000000000032'
  where import_id = 'b1000000-0000-4000-8000-000000000032'
$call$, '54000', 'A execução excederia a quota de staging de 32 MiB.',
  'associação do manifesto também respeita o limite físico');
select is((select authoring_run_id from private.official_catalog_imports
  where import_id = 'b1000000-0000-4000-8000-000000000032'), null::uuid,
  'falha de quota desfaz a associação do manifesto');
select set_config('aralearn.authoring_run_quota_bytes', '', true);

-- Uma credencial nova não toma staging de um publicador ainda válido. Depois
-- de revogar a chave antiga, a mesma execução pode continuar sem repetir os
-- chunks já confirmados.
insert into private.authoring_api_clients(
  id, owner_user_id, name, key_prefix, api_key_hash, scopes,
  rate_limit_per_minute, created_by
) values
  ('ac100000-0000-4000-8000-000000000001',
   'aa100000-0000-4000-8000-000000000001', 'Cliente antigo',
   'arl_old001', repeat('1c', 32), array['catalog:publish'], 120,
   'aa100000-0000-4000-8000-000000000001'),
  ('ac100000-0000-4000-8000-000000000002',
   'aa100000-0000-4000-8000-000000000001', 'Cliente substituto',
   'arl_new001', repeat('1d', 32), array['catalog:publish'], 120,
   'aa100000-0000-4000-8000-000000000001');
insert into private.authoring_runs(
  id, created_by, publication_actor_id, publication_client_id,
  publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, plan,
  document_hash, assembled_document, validated_at, publication_step
) values (
  'a1000000-0000-4000-8000-000000000023',
  'aa100000-0000-4000-8000-000000000001',
  'aa100000-0000-4000-8000-000000000001',
  'ac100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-staging-handoff', 'Handoff de staging', 'publishing',
  jsonb_build_object('kind', 'document_import'), repeat('e', 64), '{}'::jsonb,
  now(), 4
);
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000001',
    'ac100000-0000-4000-8000-000000000002',
    'handoff-active-request-0001', 'a1000000-0000-4000-8000-000000000023',
    'prepare_publish', null, jsonb_build_object('nextStep', 5)
  )
$call$, '42501', 'A publicação pertence a outro publicador.',
  'cliente novo não toma staging de cliente ainda válido');
update private.authoring_api_clients
set revoked_at = now(), updated_at = now()
where id = 'ac100000-0000-4000-8000-000000000001';
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000001',
  'ac100000-0000-4000-8000-000000000002',
  'handoff-revoked-request-0001', 'a1000000-0000-4000-8000-000000000023',
  'prepare_publish', null, jsonb_build_object('nextStep', 5)
)->>'publicationStep', '5',
  'cliente autorizado continua o staging após revogação da chave antiga');
select is((select publication_client_id from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000023'),
  'ac100000-0000-4000-8000-000000000002'::uuid,
  'handoff persiste a nova credencial antes do próximo chunk');

-- Escopo e papel são revalidados antes de qualquer replay. A resposta antiga
-- não prolonga a execução e deixa de ser legível assim que o papel ou a chave
-- são revogados.
insert into private.authoring_api_clients(
  id, owner_user_id, name, key_prefix, api_key_hash, scopes,
  rate_limit_per_minute, created_by
) values (
  'ac100000-0000-4000-8000-000000000050',
  'aa100000-0000-4000-8000-000000000003', 'Replay revogável',
  'arl_replay50', repeat('9a', 32), array['authoring:write'], 120,
  'aa100000-0000-4000-8000-000000000001'
);
insert into private.authoring_runs(
  id, created_by, api_client_id, publication_target, collection_id,
  collection_explicit, publication_intent, contract_key, title, status,
  created_at, updated_at, expires_at
) values (
  'a1000000-0000-4000-8000-000000000049',
  'aa100000-0000-4000-8000-000000000003',
  'ac100000-0000-4000-8000-000000000050', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-replay-revocation', 'Replay revogável', 'planning',
  now() - interval '1 day', now() - interval '1 hour', now() + interval '7 days'
);
insert into private.authoring_command_events(
  run_id, actor_user_id, api_client_id, request_id, command, part_key,
  request_hash, result
) values (
  'a1000000-0000-4000-8000-000000000049',
  'aa100000-0000-4000-8000-000000000003',
  'ac100000-0000-4000-8000-000000000050',
  'replay-revocation-0001', 'set_plan', null,
  encode(extensions.digest(convert_to(jsonb_build_object(
    'runId', 'a1000000-0000-4000-8000-000000000049'::uuid,
    'command', 'set_plan', 'partKey', null,
    'payload', jsonb_build_object('plan', jsonb_build_object())
  )::text, 'UTF8'), 'sha256'), 'hex'),
  jsonb_build_object('status', 'building', 'runId',
    'a1000000-0000-4000-8000-000000000049')
);
create temporary table replay_expiry_capture(value timestamptz) on commit drop;
insert into replay_expiry_capture
select expires_at from private.authoring_runs
where id = 'a1000000-0000-4000-8000-000000000049';
select is(public.apply_authoring_command(
  'aa100000-0000-4000-8000-000000000003',
  'ac100000-0000-4000-8000-000000000050',
  'replay-revocation-0001', 'a1000000-0000-4000-8000-000000000049',
  'set_plan', null, jsonb_build_object('plan', jsonb_build_object())
)->>'idempotent', 'true', 'replay autorizado continua idempotente');
select is((select expires_at from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000049'),
  (select value from replay_expiry_capture),
  'replay não renova a retenção da execução');
update private.app_role_assignments
set active = false, revoked_at = now(),
    revoked_by = 'aa100000-0000-4000-8000-000000000001'
where user_id = 'aa100000-0000-4000-8000-000000000003' and role = 'author';
select is((public.resolve_authoring_api_client(repeat('9a', 32), null)->'scopes'),
  '[]'::jsonb, 'chave perde o escopo quando o papel do titular é revogado');
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000003',
    'ac100000-0000-4000-8000-000000000050',
    'replay-revocation-0001', 'a1000000-0000-4000-8000-000000000049',
    'set_plan', null, jsonb_build_object('plan', jsonb_build_object())
  )
$call$, '42501', 'Escopo de autoria insuficiente.',
  'papel revogado impede recuperar uma resposta idempotente');
select is((select expires_at from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000049'),
  (select value from replay_expiry_capture),
  'replay negado também não prolonga a execução');
update private.app_role_assignments
set active = true, revoked_at = null, revoked_by = null
where user_id = 'aa100000-0000-4000-8000-000000000003' and role = 'author';
update private.authoring_api_clients
set revoked_at = now(), updated_at = now()
where id = 'ac100000-0000-4000-8000-000000000050';
select throws_ok($call$
  select public.apply_authoring_command(
    'aa100000-0000-4000-8000-000000000003',
    'ac100000-0000-4000-8000-000000000050',
    'replay-revocation-0001', 'a1000000-0000-4000-8000-000000000049',
    'set_plan', null, jsonb_build_object('plan', jsonb_build_object())
  )
$call$, '42501', 'Escopo de autoria insuficiente.',
  'chave revogada impede recuperar uma resposta idempotente');

-- A manutenção percorre cinco runs em lotes de dois, sem OFFSET e sem repetir
-- efeitos. O dry-run observa o mesmo conjunto sem tocar no cursor persistido.
select set_config('aralearn.authoring_cleanup_batch_size', '2', true);
select set_config('aralearn.authoring_cleanup_prune_batch_size', '2', true);
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status,
  created_at, updated_at, expires_at
)
select
  ('a1000000-0000-4000-8000-' || lpad((50 + item)::text, 12, '0'))::uuid,
  'aa100000-0000-4000-8000-000000000001'::uuid, 'catalog',
  '71a00000-0000-4000-8000-000000000001'::uuid, true, 'create',
  'authoring-cleanup-batch-' || item, 'Lote ' || item, 'building',
  now() - interval '80 days', now() - interval '45 days',
  now() - interval '40 days' + item * interval '1 minute'
from generate_series(0, 4) item;
update private.authoring_maintenance_state
set phase = 'expire_active', cursor_at = null, cursor_id = null,
    cycle_started_at = now(),
    cycle_cancelled_before = now() - interval '30 days',
    cycle_published_before = now() - interval '90 days',
    cycle_deferred_count = 0, last_batch_at = null,
    last_attempt_at = null, last_cleanup_at = null, last_result = '{}'::jsonb;
create temporary table cleanup_incremental_capture(
  step integer primary key, result jsonb not null
) on commit drop;
insert into cleanup_incremental_capture values (
  0, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', true,
    now() - interval '30 days', now() - interval '90 days'
  )
);
select is((select result->>'processedRuns' from cleanup_incremental_capture where step = 0),
  '0', 'dry-run não processa runs');
select is((select result->>'metricsExact' from cleanup_incremental_capture where step = 0),
  'true', 'dry-run preserva as métricas diagnósticas exatas');
select is((select phase from private.authoring_maintenance_state), 'expire_active',
  'dry-run não altera a fase persistida');
select is((select cursor_id from private.authoring_maintenance_state), null::uuid,
  'dry-run não altera o cursor persistido');
insert into cleanup_incremental_capture values (
  1, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
insert into cleanup_incremental_capture values (
  2, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
insert into cleanup_incremental_capture values (
  3, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
select is((select result->>'metricsExact' from cleanup_incremental_capture where step = 1),
  'false', 'lote mutante não executa métricas globais exatas');
select ok((select (result->>'remainingEligibleRuns')::integer between 0 and 1
  from cleanup_incremental_capture where step = 1),
  'lote mutante devolve somente uma sondagem limitada de trabalho restante');
select results_eq(
  $$select (result->>'processedRuns')::integer
    from cleanup_incremental_capture where step between 1 and 3 order by step$$,
  array[2, 2, 1], 'cinco runs são processados em três lotes limitados');
select is((select count(*) from private.authoring_runs
  where contract_key like 'authoring-cleanup-batch-%' and status = 'cancelled'),
  5::bigint, 'todos os runs do lote são terminalizados uma única vez');
select is((select count(*) from private.authoring_retention_events
  where run_id between 'a1000000-0000-4000-8000-000000000050'::uuid
    and 'a1000000-0000-4000-8000-000000000054'::uuid
    and action = 'expired_run_cancelled'),
  5::bigint, 'cada run produz uma única prova de expiração');
select is((select phase from private.authoring_maintenance_state), 'delete_cancelled',
  'fim do keyset avança para a fase seguinte');
select is((select cursor_id from private.authoring_maintenance_state), null::uuid,
  'mudança de fase limpa o cursor anterior');

-- Uma falha no meio do lote desfaz tanto o efeito quanto o cursor.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status,
  created_at, updated_at, expires_at
) values (
  'a1000000-0000-4000-8000-000000000055',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-cleanup-rollback', 'Rollback do lote', 'building',
  now() - interval '80 days', now() - interval '45 days', now() - interval '40 days'
);
update private.authoring_maintenance_state
set phase = 'expire_active', cursor_at = null, cursor_id = null,
    cycle_started_at = now(),
    cycle_cancelled_before = now() - interval '30 days',
    cycle_published_before = now() - interval '90 days',
    cycle_deferred_count = 0;
create function pg_temp.reject_cleanup_retention()
returns trigger language plpgsql as $$
begin
  raise exception 'falha injetada no lote' using errcode = 'P0001';
end;
$$;
create trigger reject_cleanup_retention
before insert on private.authoring_retention_events
for each row execute function pg_temp.reject_cleanup_retention();
select throws_ok($call$
  select public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days'
  )
$call$, 'P0001', 'falha injetada no lote',
  'falha transacional interrompe o lote');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000055'), 'building',
  'falha do lote preserva o run');
select is((select cursor_id from private.authoring_maintenance_state), null::uuid,
  'falha do lote preserva o cursor');
drop trigger reject_cleanup_retention on private.authoring_retention_events;
select lives_ok($call$
  select public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days'
  )
$call$, 'o mesmo lote pode ser retomado depois do rollback');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000055'), 'cancelled',
  'retomada terminaliza o run que falhou antes');

-- Uma publicação adiada avança o cursor, não impede a seguinte e permanece
-- registrada até o encerramento do ciclo.
update private.authoring_runs
set status = 'cancelled', updated_at = now(), publication_error = null,
    publication_lease_token = null, publication_lease_until = null,
    publication_actor_id = null, publication_client_id = null
where id = 'a1000000-0000-4000-8000-000000000009';
update public.catalog_collections set is_published = false
where id = '71a00000-0000-4000-8000-000000000002';
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, document_hash,
  assembled_document, created_at, updated_at, expires_at, validated_at
) values
  ('a1000000-0000-4000-8000-000000000060',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000002', true, 'create',
   'authoring-deferred-keyset', 'Adiada no keyset', 'publishing', repeat('6', 64),
   '{}'::jsonb, now() - interval '80 days', now() - interval '45 days',
   now() - interval '42 days', now() - interval '45 days'),
  ('a1000000-0000-4000-8000-000000000061',
   'aa100000-0000-4000-8000-000000000001', 'catalog',
   '71a00000-0000-4000-8000-000000000001', true, 'create',
   'authoring-after-deferred', 'Depois da adiada', 'publishing', repeat('7', 64),
   '{}'::jsonb, now() - interval '80 days', now() - interval '45 days',
   now() - interval '41 days', now() - interval '45 days');
insert into public.courses(
  id, status, contract_key, title, goal, position, publication_seq,
  content_hash, owner_id, deleted_at
) values (
  'c1000000-0000-4000-8000-000000000060', 'published',
  'authoring-deferred-keyset', 'Adiada no keyset', 'Objetivo', 0, 1,
  repeat('6', 64), null, null
);
insert into private.official_catalog_imports(
  import_id, course_id, contract_key, course_payload, source_hash,
  expected_counts, publish_requested, status, authoring_run_id
) values (
  'b1000000-0000-4000-8000-000000000060',
  'c1000000-0000-4000-8000-000000000060', 'authoring-deferred-keyset',
  pg_temp.course_payload(
    'c1000000-0000-4000-8000-000000000060', 'authoring-deferred-keyset'
  ), repeat('6', 64), pg_temp.empty_import_manifest(), true, 'published',
  'a1000000-0000-4000-8000-000000000060'
);
select set_config('aralearn.authoring_cleanup_batch_size', '1', true);
update private.authoring_maintenance_state
set phase = 'recover_publishing', cursor_at = null, cursor_id = null,
    cycle_started_at = now(),
    cycle_cancelled_before = now() - interval '30 days',
    cycle_published_before = now() - interval '90 days',
    cycle_deferred_count = 0, last_cleanup_at = null;
create temporary table cleanup_deferred_capture(
  step integer primary key, result jsonb not null
) on commit drop;
insert into cleanup_deferred_capture values (
  1, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
insert into cleanup_deferred_capture values (
  2, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
select is((select result->>'cycleDeferredStuckPublications'
  from cleanup_deferred_capture where step = 2), '1',
  'contador adiado sobrevive à chamada seguinte');
select is((select status from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000061'), 'validated',
  'publicação posterior é recuperada apesar da anterior adiada');
select is((select cycle_deferred_count from private.authoring_maintenance_state),
  1::bigint, 'estado persistente conserva a publicação adiada');
update private.authoring_maintenance_state set phase = 'prune_aux',
  cursor_at = null, cursor_id = null;
insert into cleanup_deferred_capture values (
  3, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days'
  )
);
select is((select result->>'incomplete' from cleanup_deferred_capture where step = 3),
  'true', 'fim do ciclo não declara sucesso enquanto houver item adiado');
select is((select last_cleanup_at from private.authoring_maintenance_state),
  null::timestamptz, 'ciclo incompleto não avança o marco diário');
update public.catalog_collections set is_published = true
where id = '71a00000-0000-4000-8000-000000000002';
select is(public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'
)->>'completedStuckPublications', '1',
  'publicação adiada volta a ser considerada no ciclo seguinte');

-- O cutoff pertence ao ciclo: mudar o argumento entre chamadas não amplia o
-- conjunto já iniciado.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status,
  created_at, updated_at, expires_at, terminal_compacted_at
) values (
  'a1000000-0000-4000-8000-000000000062',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-cutoff-stable', 'Cutoff estável', 'cancelled',
  now() - interval '80 days', now() - interval '40 days',
  now() - interval '35 days', now() - interval '40 days'
);
update private.authoring_maintenance_state
set phase = 'delete_cancelled', cursor_at = null, cursor_id = null,
    cycle_started_at = now(),
    cycle_cancelled_before = now() - interval '50 days',
    cycle_published_before = now() - interval '120 days',
    cycle_deferred_count = 0;
select is(public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'
)->>'processedRuns', '0', 'argument posterior não altera o cutoff do ciclo');
select is((select count(*) from private.authoring_runs
  where id = 'a1000000-0000-4000-8000-000000000062'), 1::bigint,
  'run fora do cutoff persistido permanece intacto');
delete from private.authoring_runs
where id = 'a1000000-0000-4000-8000-000000000062';

-- Cancelamentos e publicações possuem keysets próprios. Cada fase avança em
-- lotes de dois sem ordenar a união integral dos dois conjuntos terminais.
select set_config('aralearn.authoring_cleanup_batch_size', '2', true);
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status,
  created_at, updated_at, expires_at, terminal_compacted_at
)
select
  ('a1000000-0000-4000-8000-' || lpad((70 + item)::text, 12, '0'))::uuid,
  'aa100000-0000-4000-8000-000000000001'::uuid, 'catalog',
  '71a00000-0000-4000-8000-000000000001'::uuid, true, 'create',
  'authoring-cancelled-page-' || item, 'Cancelado ' || item, 'cancelled',
  now() - interval '200 days',
  now() - interval '60 days' + item * interval '1 minute',
  now() - interval '150 days', now() - interval '60 days'
from generate_series(0, 4) item;
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status, course_id,
  created_at, updated_at, expires_at, published_at, terminal_compacted_at
)
select
  ('a1000000-0000-4000-8000-' || lpad((80 + item)::text, 12, '0'))::uuid,
  'aa100000-0000-4000-8000-000000000001'::uuid, 'catalog',
  '71a00000-0000-4000-8000-000000000001'::uuid, true, 'create',
  'authoring-published-page-' || item, 'Publicado ' || item, 'published',
  'c1000000-0000-4000-8000-000000000008'::uuid,
  now() - interval '200 days', now() - interval '100 days',
  now() - interval '150 days',
  now() - interval '100 days' + item * interval '1 minute',
  now() - interval '100 days'
from generate_series(0, 4) item;
update private.authoring_maintenance_state
set phase = 'delete_cancelled', cursor_at = null, cursor_id = null,
    cycle_started_at = now(),
    cycle_cancelled_before = now() - interval '30 days',
    cycle_published_before = now() - interval '90 days',
    cycle_deferred_count = 0;
create temporary table cleanup_terminal_pages(
  step integer primary key, result jsonb not null
) on commit drop;
insert into cleanup_terminal_pages values (1, public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'));
insert into cleanup_terminal_pages values (2, public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'));
insert into cleanup_terminal_pages values (3, public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'));
select is((select phase from private.authoring_maintenance_state),
  'delete_published', 'cancelamentos concluem antes de iniciar publicações');
insert into cleanup_terminal_pages values (4, public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'));
insert into cleanup_terminal_pages values (5, public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'));
insert into cleanup_terminal_pages values (6, public.cleanup_authoring_history(
  'aa100000-0000-4000-8000-000000000001', false,
  now() - interval '30 days', now() - interval '90 days'));
select results_eq(
  $$select (result->>'processedRuns')::integer
    from cleanup_terminal_pages order by step$$,
  array[2, 2, 1, 2, 2, 1],
  'cada keyset terminal respeita o lote de duas execuções');
select results_eq(
  $$select result->>'nextPhase' from cleanup_terminal_pages order by step$$,
  array[
    'delete_cancelled', 'delete_cancelled', 'delete_published',
    'delete_published', 'delete_published', 'prune_aux'
  ], 'as fases terminais avançam sem compartilhar cursor');
select is((select count(*) from private.authoring_runs
  where id between 'a1000000-0000-4000-8000-000000000070'::uuid
    and 'a1000000-0000-4000-8000-000000000084'::uuid), 0::bigint,
  'todos os runs terminais paginados são removidos uma única vez');

-- A fase auxiliar usa um orçamento total, não um LIMIT independente por tabela.
delete from private.authoring_api_rate_windows
where window_started_at < now() - interval '1 day';
delete from private.authoring_user_rate_windows
where window_started_at < now() - interval '1 day';
delete from private.authoring_api_client_events
where event_type = 'rate_limited' and created_at < now() - interval '90 days';
insert into private.authoring_api_client_events(
  client_id, actor_user_id, event_type, details, created_at
)
select null, 'aa100000-0000-4000-8000-000000000001', 'rate_limited',
  jsonb_build_object('batch', item), now() - interval '100 days' + item * interval '1 minute'
from generate_series(1, 5) item;
update private.authoring_maintenance_state
set phase = 'prune_aux', cursor_at = null, cursor_id = null,
    cycle_started_at = now(),
    cycle_cancelled_before = now() - interval '30 days',
    cycle_published_before = now() - interval '90 days',
    cycle_deferred_count = 0, last_cleanup_at = null;
create temporary table cleanup_prune_capture(
  step integer primary key, result jsonb not null
) on commit drop;
insert into cleanup_prune_capture values (
  1, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
insert into cleanup_prune_capture values (
  2, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
insert into cleanup_prune_capture values (
  3, public.cleanup_authoring_history(
    'aa100000-0000-4000-8000-000000000001', false,
    now() - interval '30 days', now() - interval '90 days')
);
select results_eq(
  $$select (result->>'deletedClientEvents')::integer
    from cleanup_prune_capture order by step$$,
  array[2, 2, 1], 'prune auxiliar respeita o limite total de duas linhas');
select is((select result->>'cycleCompleted' from cleanup_prune_capture where step = 3),
  'true', 'último lote auxiliar conclui o ciclo');
select is((select count(*) from private.authoring_api_client_events
  where event_type = 'rate_limited' and created_at < now() - interval '90 days'),
  0::bigint, 'retomadas removem todo o conjunto auxiliar sem repetição');
select set_config('aralearn.authoring_cleanup_batch_size', '', true);
select set_config('aralearn.authoring_cleanup_prune_batch_size', '', true);

-- A próxima parte recebe somente os exemplos resolvidos de dependências
-- aprovadas, com identidade da operação e da microssequência causal.
insert into private.authoring_runs(
  id, created_by, publication_target, collection_id, collection_explicit,
  publication_intent, contract_key, title, status
) values (
  'a1000000-0000-4000-8000-000000000095',
  'aa100000-0000-4000-8000-000000000001', 'catalog',
  '71a00000-0000-4000-8000-000000000001', true, 'create',
  'authoring-worked-continuity', 'Continuidade por operação', 'building'
);
insert into private.authoring_parts(
  id, run_id, part_key, position, title, outline, specification, fragment,
  submission_meta, fragment_hash, status, attempt, submitted_at, approved_at
) values (
  'd1000000-0000-4000-8000-000000000095',
  'a1000000-0000-4000-8000-000000000095', 'parte-base', 0, 'Base',
  jsonb_build_object('dependsOnPartKeys', jsonb_build_array()),
  jsonb_build_object(
    'ownership', jsonb_build_object('microsequenceIds', jsonb_build_array('micro-base')),
    'structure', jsonb_build_object('microsequences', jsonb_build_array(
      jsonb_build_object('id', 'micro-base', 'dependsOn', jsonb_build_array())
    )),
    'cardPlan', jsonb_build_array(jsonb_build_object(
      'cardId', 'card-base', 'microsequenceId', 'micro-base',
      'operationId', 'operation-filter', 'learningFunction', 'worked_example'
    ))
  ),
  jsonb_build_object('microsequences', jsonb_build_array()),
  jsonb_build_object('stateDelta', jsonb_build_object(
    'introducedTermIds', jsonb_build_array(),
    'usedClaimIds', jsonb_build_array(),
    'coveredOutcomeIds', jsonb_build_array(),
    'resolvedErrorIds', jsonb_build_array()
  )), repeat('9a', 32), 'approved', 1, now(), now()
), (
  'd1000000-0000-4000-8000-000000000096',
  'a1000000-0000-4000-8000-000000000095', 'parte-pratica', 1, 'Prática',
  jsonb_build_object('dependsOnPartKeys', jsonb_build_array('parte-base')),
  '{}'::jsonb, null, null, null, 'planned', 0, null, null
);
select is(
  private.authoring_continuity_slice(
    'a1000000-0000-4000-8000-000000000095',
    'd1000000-0000-4000-8000-000000000096'
  )->'workedOperations',
  jsonb_build_array(jsonb_build_object(
    'operationId', 'operation-filter',
    'microsequenceId', 'micro-base'
  )),
  'continuidade identifica o exemplo resolvido aprovado por operação'
);
select ok(
  not (private.authoring_continuity_slice(
    'a1000000-0000-4000-8000-000000000095',
    'd1000000-0000-4000-8000-000000000096'
  ) ? 'foundedMicrosequenceIds'),
  'continuidade não expõe o mecanismo substituído de microssequências fundadas'
);

select * from finish();
rollback;
