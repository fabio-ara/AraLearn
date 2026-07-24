begin;

-- A remontagem pontual inclui campos anuláveis que não aparecem no fragmento.
-- O valor nulo precisa receber o tipo da coluna dinâmica; sem a conversão,
-- PostgreSQL pode inferir text e rejeitar, por exemplo, cards.deleted_at.
do $migration$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'private.apply_official_stage_row(text,uuid,uuid,jsonb)'::regprocedure
  ) into v_definition;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    'else ''null'' end,'','' order by a.attnum)',
    'else format(''null::%s'', a.atttypid::regtype) end,'','' order by a.attnum)'
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível corrigir os nulos tipados da revisão.';
  end if;
  execute v_definition;
end;
$migration$;

commit;
