begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select is((select p.provolatile::text from pg_proc p
  where p.oid='public.get_authoring_run(uuid,uuid)'::regprocedure),'v',
  'consulta completa de autoria declara volatilidade coerente');
select is((select p.provolatile::text from pg_proc p
  where p.oid='public.get_authoring_run_summary(uuid,uuid)'::regprocedure),'v',
  'resumo de autoria declara volatilidade coerente');
select is((select p.provolatile::text from pg_proc p
  where p.oid='public.authoring_storage_diagnostics(uuid)'::regprocedure),'v',
  'diagnóstico de autoria declara volatilidade coerente');
select ok(
  position('v_returned jsonb' in lower(pg_get_functiondef(
    'private.apply_personal_tree_sync_mutation(uuid,uuid,jsonb)'::regprocedure
  ))) = 0,
  'variável transitória sem uso não permanece na mutação pessoal'
);

select * from finish();
rollback;
