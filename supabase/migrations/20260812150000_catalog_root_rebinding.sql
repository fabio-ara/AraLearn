begin;

-- A importacao oficial materializa uma raiz descartavel por revisao. Quando o
-- mesmo curso recebe outra revisao, a vinculacao corrente precisa migrar para
-- a nova raiz antes do gatilho de identidade consolidar a Trilha. Publicacoes
-- privadas continuam proibidas de disputar a identidade de outro workspace.
create or replace function private.guard_unique_trail_course_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if tg_op = 'INSERT' and new.target = 'catalog' then
    delete from private.authoring_workspace_publications publication
    where publication.workspace_id = new.workspace_id
      and publication.workspace_course_id = new.workspace_course_id
      and publication.course_id = new.course_id
      and publication.target = 'private';

    delete from private.authoring_workspace_publications publication
    where publication.course_id = new.course_id
      and publication.target = 'catalog'
      and (
        publication.workspace_id,
        publication.workspace_course_id
      ) is distinct from (
        new.workspace_id,
        new.workspace_course_id
      );
  end if;

  if exists(
    select 1 from private.authoring_workspace_publications publication
    where publication.course_id = new.course_id
      and (
        publication.workspace_id,
        publication.workspace_course_id,
        publication.target
      ) is distinct from (
        new.workspace_id,
        new.workspace_course_id,
        new.target
      )
  ) then
    raise exception 'Este curso ja pertence a outra raiz publicada.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_catalog_root_rebinding_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_catalog_root_rebinding_v1(),
    '{schemaRevision}',
    '"20260812150000"'::jsonb
  ) || jsonb_build_object(
    'features',
    public.get_aralearn_runtime_manifest_before_catalog_root_rebinding_v1()->'features'
      || '["catalog-root-rebinding-v1"]'::jsonb
  )
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_before_catalog_root_rebinding_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
