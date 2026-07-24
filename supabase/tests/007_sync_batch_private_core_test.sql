begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_function(
  'private',
  'apply_sync_batch_core',
  array['uuid', 'jsonb'],
  'núcleo da sincronização fica no schema privado'
);

select has_function(
  'public',
  'apply_sync_batch',
  array['uuid', 'jsonb'],
  'cliente usa somente a RPC pública da sincronização'
);

select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace_row on namespace_row.oid = procedure.pronamespace
    where procedure.proname like '%apply_sync_batch%legacy%'
      and namespace_row.nspname in ('public', 'private')
  ),
  0,
  'nenhuma função de compatibilidade permanece ativa'
);

select function_privs_are(
  'private',
  'apply_sync_batch_core',
  array['uuid', 'jsonb'],
  'authenticated',
  array[]::text[],
  'usuário autenticado não executa o núcleo diretamente'
);

select function_privs_are(
  'public',
  'apply_sync_batch',
  array['uuid', 'jsonb'],
  'authenticated',
  array['EXECUTE'],
  'usuário autenticado executa somente a RPC pública'
);

select function_privs_are(
  'public',
  'apply_sync_batch',
  array['uuid', 'jsonb'],
  'anon',
  array[]::text[],
  'anon não executa sincronização'
);

select like(
  pg_get_functiondef('public.apply_sync_batch(uuid,jsonb)'::regprocedure),
  '%private.apply_sync_batch_core(p_device_id, p_mutations)%',
  'RPC pública delega ao núcleo privado'
);

select * from finish();
rollback;
