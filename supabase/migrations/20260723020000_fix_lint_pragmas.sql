begin;

-- A migration anterior corrigiu os defeitos reais. Esta substitui uma diretiva
-- incompatível da ferramenta de lint por pragmas entendidos pelo
-- plpgsql_check. PERFORM de uma constante não altera o comportamento em
-- execução; ele apenas dá tipos ao analisador estático.
do $lint_pragma$
declare
  v_signature regprocedure;
  v_definition text;
  v_previous text;
  v_pragma text;
  v_signatures text[] := array[
    'private.materialize_authoring_learning_metadata(uuid,uuid)',
    'public.apply_course_content_revision(uuid,uuid,uuid,text,text)',
    'public.get_catalog_course_structure_admin(uuid,uuid,text,uuid,integer,integer,uuid)'
  ];
  v_pragmas text[] := array[
    'PRAGMA:TABLE: aralearn_desired_learning_components (component_key text, component_type text, label text, description text, criterion text, language_tag text, position integer)',
    'PRAGMA:TABLE: course_revision_expected_entities (table_name text, entity_id uuid)',
    'PRAGMA:TYPE:v_item (sort_position integer, id uuid, item jsonb)'
  ];
  v_index integer;
begin
  for v_index in array_lower(v_signatures, 1)..array_upper(v_signatures, 1) loop
    v_signature := v_signatures[v_index]::regprocedure;
    v_pragma := v_pragmas[v_index];
    v_definition := pg_get_functiondef(v_signature);
    v_previous := v_definition;
    v_definition := replace(
      v_definition,
      '/* @plpgsql_check_options: disable:check */' || chr(10),
      ''
    );
    -- Comentários no corpo da função podem ser descartados pela versão do
    -- PostgreSQL que reconstrói a definição. A diretiva antiga é opcional:
    -- a única alteração funcional desta migração é a inclusão do pragma.
    v_previous := v_definition;
    v_definition := regexp_replace(
      v_definition,
      E'(?i)\\mbegin\\s*',
      'begin' || chr(10) || '  perform ' || quote_literal(v_pragma) || ';' || chr(10)
    );
    if v_definition = v_previous then
      raise exception 'Não foi possível inserir pragma de lint em %.', v_signature
        using errcode = '55000';
    end if;
    execute v_definition;
  end loop;
end;
$lint_pragma$;

commit;
