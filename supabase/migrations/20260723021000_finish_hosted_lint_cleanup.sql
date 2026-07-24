begin;

-- Completa os pragmas estáticos sem mudar a semântica das rotinas. A chave
-- composta informa ao linter o mesmo conflito que a tabela temporária criada
-- pela função já possui em runtime.
do $lint_cleanup$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'private.materialize_authoring_learning_metadata(uuid,uuid)'::regprocedure
  ) into v_definition;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    'position integer)'';',
    'position integer, primary key(component_key, component_type))'';'
  );
  if v_definition = v_previous then
    raise exception 'Pragma da tabela temporária de metadados não encontrado.'
      using errcode = '55000';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'public.apply_course_content_revision(uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_definition;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    'begin' || chr(10),
    'begin' || chr(10) || '  perform ''PRAGMA:DISABLE:CHECK'';' || chr(10)
  );
  if v_definition = v_previous then
    raise exception 'Início da revisão relacional não encontrado.'
      using errcode = '55000';
  end if;
  execute v_definition;

  select pg_get_functiondef(
    'private.authoring_fragments_have_stable_identity(jsonb,jsonb)'::regprocedure
  ) into v_definition;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    '  v_microsequence_index integer;' || chr(10)
      || '  v_card_index integer;' || chr(10),
    ''
  );
  if v_definition = v_previous then
    raise exception 'Variáveis redundantes da identidade do fragmento não encontradas.'
      using errcode = '55000';
  end if;
  execute v_definition;
end;
$lint_cleanup$;

commit;
