-- The functions consult auth/session state through require_service_role() and
-- authorization helpers.  PostgreSQL must not cache them as STABLE.
alter function public.get_authoring_run(uuid, uuid) volatile;
alter function public.get_authoring_run_summary(uuid, uuid) volatile;
alter function public.authoring_storage_diagnostics(uuid) volatile;

-- The personal-tree mutation assigned a returned row that was never consumed.
-- The mutation result is assembled from the canonical row afterwards, so the
-- SQL result can be discarded without changing the protocol.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('private.apply_personal_tree_sync_mutation(uuid,uuid,jsonb)'::regprocedure)
  into v_definition;

  if position('v_returned jsonb;' in v_definition) = 0
     or position(') into v_returned using v_snake_payload,v_entity_id;' in v_definition) = 0
     or position(') into v_returned using v_snake_payload;' in v_definition) = 0 then
    raise exception 'Não foi possível localizar a variável transitória da mutação pessoal.';
  end if;

  v_definition := replace(v_definition, E'\n  v_returned jsonb;', '');
  v_definition := replace(v_definition, ' returning to_jsonb(target)', '');
  v_definition := replace(v_definition, ' returning to_jsonb(inserted)', '');
  v_definition := replace(v_definition, ') into v_returned using v_snake_payload,v_entity_id;', ') using v_snake_payload,v_entity_id;');
  v_definition := replace(v_definition, ') into v_returned using v_snake_payload;', ') using v_snake_payload;');
  execute v_definition;
end;
$$;
