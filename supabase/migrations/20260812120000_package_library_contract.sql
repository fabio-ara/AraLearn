begin;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_package_library_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    jsonb_set(
      public.get_aralearn_runtime_manifest_before_package_library_v1(),
      '{schemaRevision}',
      '"20260812120000"'::jsonb
    ),
    '{contractVersion}',
    '1'::jsonb
  ) || jsonb_build_object(
    'features',
    coalesce(
      public.get_aralearn_runtime_manifest_before_package_library_v1()->'features',
      '[]'::jsonb
    ) || '["package-library-v1","package-contract-discovery-v1"]'::jsonb
  )
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_before_package_library_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

do $assert_package_library_contract$
declare
  v_manifest jsonb;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260812120000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ? 'package-library-v1')
     or not (v_manifest->'features' ? 'package-contract-discovery-v1') then
    raise exception 'Manifesto da biblioteca por packages não foi instalado.'
      using errcode = '55000';
  end if;
end;
$assert_package_library_contract$;

commit;
