begin;

-- A revisão pontual parte da linha existente para conservar campos omitidos.
-- Depois dessa mudança, a chamada a format passou a conter um quarto argumento
-- que já não corresponde a nenhum marcador da instrução dinâmica.
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
    '''where target.id=$2 returning to_jsonb(target)'',v_table,v_columns,v_expressions,v_table',
    '''where target.id=$2 returning to_jsonb(target)'',v_table,v_columns,v_expressions'
  );

  if v_definition = v_previous then
    raise exception 'Não foi possível corrigir a chamada dinâmica da revisão.';
  end if;

  execute v_definition;
end;
$migration$;

commit;
