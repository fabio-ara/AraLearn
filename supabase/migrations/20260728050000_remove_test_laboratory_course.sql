-- Cursos canônicos são removidos por tombstone, nunca por hard delete. Este
-- laboratório não permanece selecionável, publicável nem associado a coleção.
do $$
declare
  v_course_ids uuid[];
begin
  select array_agg(course.id order by course.id)
  into v_course_ids
  from public.courses course
  where course.title = 'Laboratório AraLearn: representações e práticas'
    and course.deleted_at is null;

  if coalesce(cardinality(v_course_ids), 0) > 1 then
    raise exception 'Mais de um curso de teste corresponde ao título informado.'
      using errcode = '23514';
  end if;
  if coalesce(cardinality(v_course_ids), 0) = 0 then
    return;
  end if;

  delete from public.catalog_collection_courses
  where course_id = v_course_ids[1];
  delete from public.user_course_selections
  where course_id = v_course_ids[1];
  delete from private.course_revisions
  where course_id = v_course_ids[1];
  update public.courses
  set deleted_at = now(), updated_at = now()
  where id = v_course_ids[1];
end;
$$;
