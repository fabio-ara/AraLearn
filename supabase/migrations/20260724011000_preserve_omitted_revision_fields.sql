begin;

-- Em uma correção pontual, o fragmento contém apenas os campos alterados.
-- A remontagem de uma linha existente precisa partir da própria linha para
-- preservar campos omitidos; JSON null explícito continua significando null.
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
    'jsonb_populate_record(null::%s,$1) populated) ''',
    'jsonb_populate_record(target,$1) populated) '''
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível preservar os campos omitidos da revisão.';
  end if;
  execute v_definition;
end;
$migration$;

commit;
