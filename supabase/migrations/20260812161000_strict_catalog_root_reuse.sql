begin;

-- O fluxo corrente reutiliza a raiz autoral oficial. Portanto, qualquer outra
-- raiz que tente publicar o mesmo curso volta a ser uma violacao, sem caminho
-- alternativo de transferencia ou consolidacao.
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

do $align_catalog_resolver$
declare
  v_signature regprocedure :=
    'public.resolve_catalog_artifact_publisher_v4(text,uuid)'::regprocedure;
  v_definition text;
begin
  v_definition := pg_get_functiondef(v_signature);
  if strpos(v_definition, 'order by placement.position, placement.id') = 0 then
    raise exception 'Resolvedor editorial nao corresponde ao corte esperado.'
      using errcode = '55000';
  end if;
  execute replace(
    v_definition,
    'order by placement.position, placement.id',
    'order by placement.id'
  );
end;
$align_catalog_resolver$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_strict_root_v1;
create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_strict_root_v1(),
    '{schemaRevision}',
    '"20260812161000"'::jsonb
  ) || jsonb_build_object(
    'features',
    coalesce((
      select jsonb_agg(feature.value)
      from jsonb_array_elements(
        public.get_aralearn_runtime_manifest_before_strict_root_v1()->'features'
      ) feature(value)
      where feature.value #>> '{}' <> 'catalog-root-rebinding-v1'
    ), '[]'::jsonb) || '["strict-catalog-root-reuse-v1"]'::jsonb
  )
$function$;
revoke all on function
  public.get_aralearn_runtime_manifest_before_strict_root_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
