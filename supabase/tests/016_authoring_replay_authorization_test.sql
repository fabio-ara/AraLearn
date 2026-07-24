begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'aa600000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'authoring-replay@aralearn.test',
  'x',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
) on conflict(id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);

insert into private.app_role_assignments(
  user_id, role, active, granted_by, reason
) values (
  'aa600000-0000-4000-8000-000000000001',
  'owner',
  true,
  'aa600000-0000-4000-8000-000000000001',
  'Teste da autorização de replay'
) on conflict(user_id, role) do update
set active = true, revoked_at = null, revoked_by = null;

select lives_ok($call$
  select public.create_authoring_api_client(
    'aa600000-0000-4000-8000-000000000001',
    'aa600000-0000-4000-8000-000000000001',
    'Replay editorial',
    'arl_replay_catalog',
    repeat('6', 64),
    array[
      'authoring:read',
      'authoring:write',
      'authoring:audit',
      'catalog:publish'
    ]::text[],
    30,
    null
  )
$call$, 'teste cria cliente editorial');

select lives_ok($call$
  select public.create_authoring_api_client(
    'aa600000-0000-4000-8000-000000000001',
    'aa600000-0000-4000-8000-000000000001',
    'Replay pessoal',
    'arl_replay_private',
    repeat('7', 64),
    array[
      'authoring:private:read',
      'authoring:private:write',
      'authoring:private:audit'
    ]::text[],
    30,
    null
  )
$call$, 'teste cria cliente pessoal');

insert into private.authoring_runs(
  id, created_by, publication_target, contract_key, title, status
) values
  (
    'a6000000-0000-4000-8000-000000000001',
    'aa600000-0000-4000-8000-000000000001',
    'catalog',
    'replay-catalog',
    'Replay editorial',
    'cancelled'
  ),
  (
    'a6000000-0000-4000-8000-000000000002',
    'aa600000-0000-4000-8000-000000000001',
    'private',
    'replay-private',
    'Replay pessoal',
    'cancelled'
  );

insert into private.authoring_command_receipts(
  actor_user_id,
  responsible_user_id,
  request_id,
  run_id,
  command,
  part_key,
  api_request_hash,
  request_hash,
  result,
  command_created_at
) values
  (
    'aa600000-0000-4000-8000-000000000001',
    'aa600000-0000-4000-8000-000000000001',
    'replay-catalog-request',
    'a6000000-0000-4000-8000-000000000001',
    'cancel_run',
    null,
    repeat('a', 64),
    repeat('b', 64),
    '{"status":"cancelled","target":"catalog"}'::jsonb,
    now()
  ),
  (
    'aa600000-0000-4000-8000-000000000001',
    'aa600000-0000-4000-8000-000000000001',
    'replay-private-request',
    'a6000000-0000-4000-8000-000000000002',
    'cancel_run',
    null,
    repeat('c', 64),
    repeat('d', 64),
    '{"status":"cancelled","target":"private"}'::jsonb,
    now()
  );

select is(
  (
    select publication_target
    from private.authoring_command_receipts
    where request_id = 'replay-private-request'
  ),
  'private',
  'recibo captura o destino antes da limpeza'
);

delete from private.authoring_runs
where id in (
  'a6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000002'
);

select is(
  public.replay_authoring_command_dispatch(
    'aa600000-0000-4000-8000-000000000001',
    (
      select id from private.authoring_api_clients
      where key_prefix = 'arl_replay_catalog'
    ),
    'replay-absent-request',
    repeat('e', 64),
    'authoring:write'
  ),
  null::jsonb,
  'requestId ausente não é tratado como replay privado'
);

select throws_ok($call$
  select public.replay_authoring_command_dispatch(
    'aa600000-0000-4000-8000-000000000001',
    (
      select id from private.authoring_api_clients
      where key_prefix = 'arl_replay_private'
    ),
    'replay-catalog-request',
    repeat('f', 64),
    'authoring:write'
  )
$call$, '42501', 'Autorização atual insuficiente para recuperar a resposta.',
  'cliente pessoal é recusado antes de comparar o hash editorial');

select throws_ok($call$
  select public.replay_authoring_command_dispatch(
    'aa600000-0000-4000-8000-000000000001',
    (
      select id from private.authoring_api_clients
      where key_prefix = 'arl_replay_catalog'
    ),
    'replay-catalog-request',
    repeat('f', 64),
    'authoring:write'
  )
$call$, '22023', 'requestId reutilizado com conteúdo diferente.',
  'cliente editorial autorizado ainda não reutiliza requestId com outro corpo');

select is(
  public.replay_authoring_command_dispatch(
    'aa600000-0000-4000-8000-000000000001',
    (
      select id from private.authoring_api_clients
      where key_prefix = 'arl_replay_catalog'
    ),
    'replay-catalog-request',
    repeat('a', 64),
    'authoring:write'
  )->>'idempotent',
  'true',
  'cliente editorial recupera o recibo editorial retido'
);

select throws_ok($call$
  select public.replay_authoring_command_dispatch(
    'aa600000-0000-4000-8000-000000000001',
    (
      select id from private.authoring_api_clients
      where key_prefix = 'arl_replay_catalog'
    ),
    'replay-private-request',
    repeat('f', 64),
    'authoring:write'
  )
$call$, '42501', 'Autorização atual insuficiente para recuperar a resposta.',
  'cliente editorial é recusado antes de comparar o hash pessoal');

select throws_ok($call$
  select public.replay_authoring_command_dispatch(
    'aa600000-0000-4000-8000-000000000001',
    (
      select id from private.authoring_api_clients
      where key_prefix = 'arl_replay_private'
    ),
    'replay-private-request',
    repeat('f', 64),
    'authoring:write'
  )
$call$, '22023', 'requestId reutilizado com conteúdo diferente.',
  'cliente pessoal autorizado ainda não reutiliza requestId com outro corpo');

select is(
  public.replay_authoring_command_dispatch(
    'aa600000-0000-4000-8000-000000000001',
    (
      select id from private.authoring_api_clients
      where key_prefix = 'arl_replay_private'
    ),
    'replay-private-request',
    repeat('c', 64),
    'authoring:write'
  )->>'idempotent',
  'true',
  'cliente pessoal recupera o recibo pessoal retido'
);

select * from finish();
rollback;
