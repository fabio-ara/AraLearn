begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('private', 'authoring_private_imports',
  'staging privado possui tabela própria');
select has_table('private', 'authoring_private_import_stage_rows',
  'linhas privadas permanecem fora do schema público');
select has_column('private', 'authoring_command_receipts', 'publication_target',
  'recibo retido conserva o destino para autorizar replay');
select has_function('public', 'dispatch_authoring_command',
  array['uuid','uuid','text','uuid','text','text','jsonb'],
  'dispatcher separa autoria oficial e privada');
select has_function('public', 'finalize_authoring_private_course_import',
  array['uuid','uuid','uuid','uuid','uuid'],
  'materialização privada possui finalizador atômico');
select has_function('public', 'create_private_authoring_integration',
  array['uuid','text','text','text','text','integer'],
  'usuário autenticado possui emissão encapsulada de integração pessoal');
select has_function('public', 'list_private_authoring_integrations',
  array['uuid'], 'metadados de integrações possuem consulta própria');
select has_function('public', 'rotate_private_authoring_integration',
  array['uuid','uuid','text','text','text','integer'],
  'integração pessoal possui renovação atômica');
select has_function('public', 'revoke_private_authoring_integration',
  array['uuid','uuid'], 'integração pessoal pode ser revogada pelo proprietário');
select trigger_is(
  'private', 'authoring_runs',
  'authoring_runs_clear_private_stage_after_compaction',
  'private', 'authoring_clear_private_stage_after_compaction',
  'compactação terminal remove o staging privado'
);

select ok(not has_table_privilege(
  'authenticated', 'private.authoring_private_imports', 'SELECT'
), 'usuário autenticado não lê staging privado');
select ok(not has_function_privilege(
  'authenticated',
  'public.finalize_authoring_private_course_import(uuid,uuid,uuid,uuid,uuid)',
  'EXECUTE'
), 'usuário autenticado não chama o finalizador diretamente');
select ok(not has_function_privilege(
  'authenticated',
  'public.create_private_authoring_integration(uuid,text,text,text,text,integer)',
  'EXECUTE'
), 'emissão passa pela Edge e não aceita identidade forjada no PostgREST');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000',
   'aa300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'private-author-a@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'aa300000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'private-author-b@aralearn.test', 'x', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict(id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);

select ok(private.user_can_use_authoring_scope(
  'aa300000-0000-4000-8000-000000000001', 'authoring:private:write'
), 'toda conta autenticada pode criar trabalho privado');
select ok(not private.user_can_use_authoring_scope(
  'aa300000-0000-4000-8000-000000000001', 'catalog:publish'
), 'conta comum não recebe publicação de catálogo');

select lives_ok($call$
  select public.create_authoring_api_client(
    'aa300000-0000-4000-8000-000000000001',
    'aa300000-0000-4000-8000-000000000001',
    'Integração privada de teste',
    'arl_private01',
    repeat('a', 64),
    array[
      'authoring:private:read',
      'authoring:private:write',
      'authoring:private:audit'
    ]::text[],
    30,
    null
  )
$call$, 'conta comum pode criar uma chave limitada à própria autoria');

select throws_ok($call$
  select public.create_authoring_api_client(
    'aa300000-0000-4000-8000-000000000001',
    'aa300000-0000-4000-8000-000000000001',
    'Integração indevida de catálogo',
    'arl_catalog01',
    repeat('b', 64),
    array['authoring:private:write', 'catalog:publish']::text[],
    30,
    null
  )
$call$, '42501', 'Escopo de autoria não autorizado.',
  'conta comum não amplia a própria chave para publicação oficial');

select is(
  public.create_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    'private-key-create-0001', 'Agente pessoal', 'arl_self001',
    repeat('c', 64), 90
  )->>'idempotent',
  'false', 'primeira emissão cria uma integração pessoal'
);
select is(
  public.create_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    'private-key-create-0001', 'Agente pessoal', 'arl_self001',
    repeat('c', 64), 90
  )->>'idempotent',
  'true', 'mesmo pedido de emissão não cria uma segunda chave'
);
select throws_ok($call$
  select public.create_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    'private-key-create-0001', 'Outro agente', 'arl_self999',
    repeat('9', 64), 90
  )
$call$, '23505', 'requestId reutilizado com conteúdo diferente.',
  'requestId de emissão não aceita outra intenção');
select ok(
  not public.create_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    'private-key-create-0001', 'Agente pessoal', 'arl_self001',
    repeat('c', 64), 90
  ) ?| array['apiKey', 'api_key_hash'],
  'banco nunca devolve o segredo nem o hash da integração'
);
select throws_ok($call$
  select public.revoke_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000002',
    (select id from private.authoring_api_clients where key_prefix = 'arl_self001')
  )
$call$, 'P0002', 'Integração pessoal não encontrada.',
  'usuário B não revoga a integração do usuário A');
select is(
  public.list_private_authoring_integrations(
    'aa300000-0000-4000-8000-000000000002'
  )->>'activeCount',
  '0', 'usuário B não vê metadados de integrações do usuário A'
);
select is(
  public.rotate_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    (select id from private.authoring_api_clients where key_prefix = 'arl_self001'),
    'private-key-rotate-0001', 'arl_self002', repeat('d', 64), 120
  )->>'idempotent',
  'false', 'renovação cria uma chave substituta'
);
select ok(
  (select revoked_at is not null from private.authoring_api_clients
    where key_prefix = 'arl_self001'),
  'renovação revoga a chave anterior na mesma transação'
);
select is(
  public.rotate_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    (select id from private.authoring_api_clients where key_prefix = 'arl_self001'),
    'private-key-rotate-0001', 'arl_self002', repeat('d', 64), 120
  )->>'idempotent',
  'true', 'repetição da renovação devolve apenas metadados da substituta'
);
select throws_ok($call$
  select public.rotate_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    (select id from private.authoring_api_clients where key_prefix = 'arl_self001'),
    'private-key-rotate-0001', 'arl_self998', repeat('8', 64), 121
  )
$call$, '23505', 'requestId reutilizado com conteúdo diferente.',
  'requestId de renovação não aceita outra intenção');
select is(
  public.revoke_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    (select id from private.authoring_api_clients where key_prefix = 'arl_self002')
  )->>'idempotent',
  'false', 'proprietário revoga a própria integração'
);
select is(
  public.revoke_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    (select id from private.authoring_api_clients where key_prefix = 'arl_self002')
  )->>'idempotent',
  'true', 'revogação repetida permanece idempotente'
);

select lives_ok(format($call$
  select public.create_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    'private-limit-create-%1$s', 'Agente %1$s', 'arl_limit%1$s', repeat('%2$s', 64), 30
  )
$call$, suffix, digit), 'limite aceita integração pessoal ' || suffix)
from (values ('01','1'), ('02','2'), ('03','3'), ('04','4')) sample(suffix, digit);
select is(
  public.create_private_authoring_integration(
    'aa300000-0000-4000-8000-000000000001',
    'private-limit-create-05', 'Agente excedente', 'arl_limit05', repeat('5', 64), 30
  )->>'status',
  'limit_reached', 'sexta integração ativa é recusada pelo limite da conta'
);
select ok(not private.authoring_client_has_scope(
  (select id from private.authoring_api_clients where key_prefix = 'arl_self002'),
  'aa300000-0000-4000-8000-000000000001',
  'authoring:private:read'
), 'chave revogada deixa de autorizar imediatamente');
select throws_ok($call$
  update private.authoring_api_clients
  set expires_at = created_at - interval '1 second'
  where key_prefix = 'arl_limit01'
$call$, '23514', null,
  'expiração anterior à emissão é recusada');
select ok(
  public.list_private_authoring_integrations(
    'aa300000-0000-4000-8000-000000000001'
  )::text !~ '(apiKey|api_key_hash|issuance_request)',
  'listagem contém somente metadados não secretos'
);

select is(
  public.dispatch_authoring_command(
    'aa300000-0000-4000-8000-000000000001', null,
    'private-create-request-0001',
    'a3000000-0000-4000-8000-000000000001',
    'create_run', null,
    jsonb_build_object(
      'publicationTarget', 'private',
      'title', 'Curso privado de teste',
      'contractKey', 'private-course-test',
      'brief', jsonb_build_object('audience', 'iniciante'),
      'publicationIntent', jsonb_build_object('mode', 'create')
    )
  )->>'publicationTarget',
  'private',
  'conta comum cria execução privada'
);

select is(
  public.dispatch_authoring_command(
    'aa300000-0000-4000-8000-000000000001', null,
    'private-create-request-0001',
    'a3000000-0000-4000-8000-000000000001',
    'create_run', null,
    jsonb_build_object(
      'publicationTarget', 'private',
      'title', 'Curso privado de teste',
      'contractKey', 'private-course-test',
      'brief', jsonb_build_object('audience', 'iniciante'),
      'publicationIntent', jsonb_build_object('mode', 'create')
    )
  )->>'idempotent',
  'true',
  'repetição idêntica não duplica a execução'
);

select throws_ok($call$
  select public.get_authoring_run(
    'a3000000-0000-4000-8000-000000000001',
    'aa300000-0000-4000-8000-000000000002'
  )
$call$, '42501', 'Execução de autoria não encontrada.',
  'outro usuário não lê a execução privada');

select throws_ok($call$
  select public.dispatch_authoring_command(
    'aa300000-0000-4000-8000-000000000001', null,
    'catalog-create-request-0001',
    'a3000000-0000-4000-8000-000000000002',
    'create_run', null,
    jsonb_build_object(
      'publicationTarget', 'catalog',
      'title', 'Tentativa de catálogo',
      'contractKey', 'forbidden-catalog-course',
      'brief', '{}'::jsonb,
      'publicationIntent', jsonb_build_object('mode', 'create')
    )
  )
$call$, '42501', 'Autoria de catálogo não autorizada.',
  'conta comum não cria execução oficial');

select ok(
  pg_get_functiondef(
    'public.finalize_authoring_private_course_import(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) like '%validate_course_graph%user_course_selections%',
  'validação antecede a seleção visível no mesmo finalizador'
);
select ok(
  pg_get_functiondef(
    'public.finalize_authoring_private_course_import(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ) like '%owner_id = p_actor_id%',
  'curso materializado permanece vinculado ao autor'
);
select ok(
  pg_get_functiondef('private.authoring_clear_private_stage_after_compaction()'::regprocedure)
    like '%delete from private.authoring_private_imports%',
  'staging abandonado não permanece depois da compactação'
);

select * from finish();
rollback;
