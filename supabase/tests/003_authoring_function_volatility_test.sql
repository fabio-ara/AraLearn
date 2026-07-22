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
  position('perform v_returned' in lower(pg_get_functiondef(
    'private.apply_one_sync_mutation(uuid,text,uuid,uuid,text,bigint,jsonb,jsonb,bigint,boolean,boolean)'::regprocedure
  ))) > 0,
  'resultado da mutação dinâmica é observado pelo verificador SQL'
);

select * from finish();
rollback;
