begin;

-- O delegado interno só é necessário durante a chamada aninhada da autoria
-- privada. Limpá-lo logo depois impede que uma chamada direta, no mesmo ciclo
-- SQL, herde uma autorização temporária já encerrada.
do $migration$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'public.dispatch_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
  ) into v_definition;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$    v_result := public.apply_authoring_command(
      p_actor_id, null, p_request_id, p_run_id,
      p_command, p_part_key, p_payload
    );
    update private.authoring_command_events event$old$,
    $new$    v_result := public.apply_authoring_command(
      p_actor_id, null, p_request_id, p_run_id,
      p_command, p_part_key, p_payload
    );
    perform set_config('aralearn.private_authoring_delegate_actor', '', true);
    update private.authoring_command_events event$new$
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível limitar o delegado temporário da autoria privada.'
      using errcode = '55000';
  end if;
  execute v_definition;
end;
$migration$;

commit;
