-- A biblioteca local precisa conhecer a origem de cada seleção sem inferi-la
-- de campos ausentes. A origem é parte do contrato de réplica, não um fallback
-- de interface.
create or replace function private.selection_row(p_selection_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.jsonb_to_camel(to_jsonb(selection)) || jsonb_build_object(
    'publicationSeq', course.publication_seq,
    'contentHash', course.content_hash,
    'title', course.title,
    'goal', course.goal,
    'contractKey', course.contract_key,
    'courseOrigin', case when course.owner_id is null then 'catalog' else 'private' end
  )
  from public.user_course_selections selection
  join public.courses course on course.id = selection.course_id
  where selection.id = p_selection_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled;
$$;

drop function if exists public.list_user_course_summaries();

create function public.list_user_course_summaries()
returns table(
  selection_id uuid,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  "position" integer,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  last_activity_at timestamptz,
  course_origin text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select
    selection.id,
    course.id,
    course.contract_key,
    course.title,
    course.goal,
    selection.position,
    course.publication_seq,
    course.content_hash,
    course.module_count,
    course.lesson_count,
    greatest(
      (select max(progress.last_activity_at)
       from public.lesson_progress progress
       where progress.selection_id = selection.id),
      (select max(progress.last_activity_at)
       from public.card_progress progress
       where progress.selection_id = selection.id)
    ),
    case when course.owner_id is null then 'catalog' else 'private' end
  from public.user_course_selections selection
  join public.courses course on course.id = selection.course_id
  where selection.user_id = v_user_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  order by selection.position, selection.created_at, selection.id;
end;
$$;

revoke all on function public.list_user_course_summaries() from public, anon;
grant execute on function public.list_user_course_summaries() to authenticated;

-- O laboratório foi usado somente para teste e não pertence a uma coleção.
-- A condição de unicidade impede que uma migração destrutiva alcance outro curso.
do $$
declare
  v_course_ids uuid[];
begin
  select array_agg(course.id order by course.id)
  into v_course_ids
  from public.courses course
  where course.title = 'Laboratório AraLearn: representações e práticas'
    and course.deleted_at is null
    and not exists (
      select 1
      from public.catalog_collection_courses placement
      where placement.course_id = course.id
        and placement.deleted_at is null
    );

  if coalesce(cardinality(v_course_ids), 0) > 1 then
    raise exception 'Mais de um curso de teste corresponde ao título informado.'
      using errcode = '23514';
  end if;
  if coalesce(cardinality(v_course_ids), 0) = 1 then
    delete from public.courses where id = v_course_ids[1];
  end if;
end;
$$;
