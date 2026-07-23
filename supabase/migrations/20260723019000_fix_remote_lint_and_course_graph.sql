begin;

-- Estas rotinas criam tabelas temporárias por chamada ou leem uma seção cujo
-- tipo só é conhecido em tempo de execução. O plpgsql_check não acompanha
-- esses mecanismos e acusa relações/records inexistentes, embora o PostgreSQL
-- os crie ou atribua antes do uso. A diretiva abaixo pertence somente ao
-- analisador estático; não muda nenhuma configuração do banco nem o runtime.
do $lint_pragma$
declare
  v_signature regprocedure;
  v_definition text;
  v_previous text;
begin
  foreach v_signature in array array[
    'private.materialize_authoring_learning_metadata(uuid,uuid)'::regprocedure,
    'public.apply_course_content_revision(uuid,uuid,uuid,text,text)'::regprocedure,
    'public.get_catalog_course_structure_admin(uuid,uuid,text,uuid,integer,integer,uuid)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    v_previous := v_definition;
    v_definition := replace(
      v_definition,
      'AS $function$',
      'AS $function$' || chr(10)
        || '/* @plpgsql_check_options: disable:check */'
    );
    if v_definition = v_previous then
      raise exception 'Não foi possível preparar a diretiva de lint para %.',
        v_signature::text using errcode = '55000';
    end if;
    execute v_definition;
  end loop;
end;
$lint_pragma$;

-- A função consulta helpers estáveis e, portanto, não pode ser IMMUTABLE.
alter function private.assert_course_revision_patch(
  private.course_content_revisions, jsonb
) stable;

-- As tabelas de conteúdo do corte enxuto não possuem tombstone. A versão
-- posterior desta função voltou a consultar deleted_at nelas, o que deixava a
-- validação de curso indisponível. Cursos canônicos continuam sendo filtrados
-- pelo seu próprio tombstone.
create or replace function public.validate_course_graph(p_course_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_course public.courses%rowtype;
begin
  if not public.is_app_admin() then
    raise exception 'Validação oficial exige administrador.' using errcode = '42501';
  end if;

  select * into v_course
  from public.courses
  where id = p_course_id and deleted_at is null;

  if not found then
    return jsonb_build_object(
      'valid', false,
      'publishable', false,
      'courseId', p_course_id,
      'errors', jsonb_build_array(
        jsonb_build_object('code', 'course.missing', 'path', '$.course')
      )
    );
  end if;

  if not exists(select 1 from public.modules where course_id = p_course_id) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'course.modules.empty', 'path', '$.modules')
    );
  end if;
  if not exists(select 1 from public.lessons where course_id = p_course_id) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'course.lessons.empty', 'path', '$.lessons')
    );
  end if;
  if not exists(select 1 from public.microsequences where course_id = p_course_id) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'course.microsequences.empty', 'path', '$.microsequences')
    );
  end if;
  if not exists(select 1 from public.cards where course_id = p_course_id) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'course.cards.empty', 'path', '$.cards')
    );
  end if;
  if exists(
    select 1 from public.microsequences
    where course_id = p_course_id and status <> 'ready'
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'microsequence.not_ready',
      'path', '$.microsequences',
      'message', 'Publicação exige todas as microssequências em ready.'
    ));
  end if;
  if exists(
    select 1 from public.modules
    where course_id = p_course_id
    group by position having count(*) > 1
  ) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'module.position.duplicate', 'path', '$.modules')
    );
  end if;
  if exists(
    select 1 from public.lessons
    where course_id = p_course_id
    group by module_id, position having count(*) > 1
  ) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'lesson.position.duplicate', 'path', '$.lessons')
    );
  end if;
  if exists(
    select 1 from public.microsequences
    where course_id = p_course_id
    group by lesson_id, position having count(*) > 1
  ) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'microsequence.position.duplicate', 'path', '$.microsequences')
    );
  end if;

  return jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'publishable', jsonb_array_length(v_errors) = 0,
    'courseId', p_course_id,
    'contentHash', v_course.content_hash,
    'errors', v_errors
  );
end;
$$;

commit;
