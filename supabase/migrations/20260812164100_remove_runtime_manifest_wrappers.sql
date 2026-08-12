begin;

do $remove_runtime_manifest_wrappers$
declare
  v_function record;
begin
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'public'
      and (
        procedure_value.proname like 'get_aralearn_runtime_manifest_before_%'
        or procedure_value.proname like 'get_aralearn_runtime_manifest_without_%'
      )
    order by procedure_value.oid desc
  loop
    execute format('drop function %s', v_function.signature);
  end loop;

  if exists (
    select 1
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'public'
      and procedure_value.proname <> 'get_aralearn_runtime_manifest'
      and procedure_value.proname like 'get_aralearn_runtime_manifest_%'
  ) then
    raise exception 'Wrappers historicos do manifesto ainda existem.'
      using errcode = '55000';
  end if;
end;
$remove_runtime_manifest_wrappers$;

commit;
