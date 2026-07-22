-- The functions consult auth/session state through require_service_role() and
-- authorization helpers.  PostgreSQL must not cache them as STABLE.
alter function public.get_authoring_run(uuid, uuid) volatile;
alter function public.get_authoring_run_summary(uuid, uuid) volatile;
alter function public.authoring_storage_diagnostics(uuid) volatile;

-- Supabase's PL/pgSQL checker does not infer the read made by the final JSONB
-- expression after a dynamic `EXECUTE ... INTO`.  Keep the result explicitly
-- observed before returning it, without changing the affected row or payload.
do $$
declare
  v_definition text;
  v_marker constant text := E'\n  return jsonb_build_object(\n    \'status\', \'applied\', \'entityType\', p_store_name, \'entityId\', p_entity_id,';
begin
  select pg_get_functiondef('private.apply_one_sync_mutation(uuid,text,uuid,uuid,text,bigint,jsonb,jsonb,bigint,boolean,boolean)'::regprocedure)
  into v_definition;

  if position(v_marker in v_definition) = 0 then
    raise exception 'Não foi possível localizar o retorno de apply_one_sync_mutation.';
  end if;

  v_definition := replace(v_definition, v_marker, E'\n  perform v_returned;\n' || v_marker);
  execute v_definition;
end;
$$;
