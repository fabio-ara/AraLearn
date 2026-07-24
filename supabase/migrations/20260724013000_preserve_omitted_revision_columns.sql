begin;

-- Uma revisão parcial deve atualizar somente as colunas presentes no fragmento.
-- JSON null explícito ainda é aplicado, mas uma chave ausente não pode entrar
-- na instrução e apagar, por exemplo, cards.after_text.
do $migration$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'private.apply_official_stage_row(text,uuid,uuid,jsonb)'::regprocedure
  ) into v_definition;

  v_previous := v_definition;
  v_definition := regexp_replace(
    v_definition,
    E'and \\(v_payload \\? a\\.attname or \\([[:space:]]*coalesce\\(v_exists[[:space:]]*,[[:space:]]*false\\) and not a\\.attnotnull and a\\.attname not in \\(''id'',''course_id''\\)[[:space:]]*\\)\\)',
    'and v_payload ? a.attname'
  );

  if v_definition = v_previous then
    raise exception 'Não foi possível restringir a revisão às colunas enviadas.';
  end if;

  execute v_definition;
end;
$migration$;

commit;
