begin;

-- A classificação automática existe somente para raízes oficiais. Um curso
-- privado publicado pode ser oferecido, mas não pertence a coleção alguma até
-- que a decisão editorial o promova explicitamente.
create or replace function private.ensure_official_course_collection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_collection_id uuid := case new.contract_key
    when 'course-dataprev-2026-analista-processamento-seguranca-informacao'
      then '71000000-0000-4000-8000-000000000001'::uuid
    when 'course-fundamentos-ia-analise-dados'
      then '71000000-0000-4000-8000-000000000002'::uuid
    when 'course-microsoft-azure-ai-fundamentals-ai900'
      then '71000000-0000-4000-8000-000000000003'::uuid
    else '71000000-0000-4000-8000-000000000004'::uuid
  end;
begin
  if new.owner_id is null
     and new.status = 'published'
     and new.deleted_at is null then
    if not exists (
      select 1 from public.catalog_collection_courses item
      where item.course_id = new.id and item.deleted_at is null
    ) then
      insert into public.catalog_collection_courses(collection_id, course_id, position)
      values (v_collection_id, new.id, 0);
    end if;
  else
    delete from public.catalog_collection_courses where course_id = new.id;
  end if;
  return new;
end;
$$;

-- Corrige associações criadas antes da separação explícita entre catálogo e
-- biblioteca pessoal. Cursos privados não possuem classificação oficial.
delete from public.catalog_collection_courses item
using public.courses course
where course.id = item.course_id
  and course.owner_id is not null;

comment on function private.ensure_official_course_collection() is
  'Mantém a classificação automática somente para raízes oficiais publicadas.';

commit;
