begin;

create or replace function private.assert_official_catalog_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_course_ids uuid[];
  v_course_id uuid;
  v_active_links bigint;
  v_available_links bigint;
begin
  -- OLD e NEW têm o tipo da tabela que disparou o gatilho. Os testes ficam
  -- separados para o PostgreSQL não resolver campos de outra tabela durante
  -- uma atualização de courses, collections ou collection_courses.
  if tg_op = 'UPDATE' then
    if tg_table_name = 'courses' then
      if old.owner_id is not distinct from new.owner_id
         and old.status is not distinct from new.status
         and old.deleted_at is not distinct from new.deleted_at then
        return null;
      end if;
    elsif tg_table_name = 'catalog_collection_courses' then
      if old.course_id is not distinct from new.course_id
         and old.collection_id is not distinct from new.collection_id
         and old.deleted_at is not distinct from new.deleted_at then
        return null;
      end if;
    elsif tg_table_name = 'catalog_collections' then
      if old.is_published is not distinct from new.is_published
         and old.deleted_at is not distinct from new.deleted_at then
        return null;
      end if;
    end if;
  end if;

  if tg_table_name = 'courses' then
    select coalesce(array_agg(distinct candidate), array[]::uuid[])
    into v_course_ids
    from unnest(array_remove(array[
      case when tg_op <> 'INSERT' then old.id else null end,
      case when tg_op <> 'DELETE' then new.id else null end
    ], null)) candidate;
  elsif tg_table_name = 'catalog_collection_courses' then
    select coalesce(array_agg(distinct candidate), array[]::uuid[])
    into v_course_ids
    from unnest(array_remove(array[
      case when tg_op <> 'INSERT' then old.course_id else null end,
      case when tg_op <> 'DELETE' then new.course_id else null end
    ], null)) candidate;
  else
    select coalesce(array_agg(distinct item.course_id), array[]::uuid[])
    into v_course_ids
    from public.catalog_collection_courses item
    where item.collection_id = any(array_remove(array[
      case when tg_op <> 'INSERT' then old.id else null end,
      case when tg_op <> 'DELETE' then new.id else null end
    ], null))
      and item.deleted_at is null;
  end if;

  foreach v_course_id in array coalesce(v_course_ids, array[]::uuid[])
  loop
    if exists (
      select 1
      from public.courses course
      where course.id = v_course_id
        and course.owner_id is null
        and course.status = 'published'
        and course.deleted_at is null
    ) then
      select
        count(*),
        count(*) filter (
          where collection.is_published and collection.deleted_at is null
        )
      into v_active_links, v_available_links
      from public.catalog_collection_courses item
      join public.catalog_collections collection
        on collection.id = item.collection_id
      where item.course_id = v_course_id
        and item.deleted_at is null;

      if v_active_links <> 1 or v_available_links <> 1 then
        raise exception
          'Curso oficial publicado deve pertencer a uma única coleção ativa.'
          using errcode = '23514';
      end if;
    end if;
  end loop;

  return null;
end;
$$;

commit;
