-- A publicação enxuta recebe o hash canônico no momento da materialização.
-- A função editorial restaurada na migration anterior ainda chamava o cálculo
-- retirado no corte enxuto. Recriamos a definição já instalada trocando
-- somente essa referência pelo marcador persistido na raiz do curso.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'private.validate_catalog_submission_course(uuid)'::regprocedure
  ) into v_definition;

  if position('private.course_content_hash(p_course_id)' in v_definition) = 0 then
    raise exception 'A definição editorial esperada não contém a referência de hash a corrigir.';
  end if;

  v_definition := replace(
    v_definition,
    'private.course_content_hash(p_course_id)',
    'v_course.content_hash'
  );
  execute v_definition;
end;
$$;
