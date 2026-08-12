begin;

delete from private.authoring_workspaces workspace
where workspace.id in (
  '7834c4dc-8ddb-5e8a-900f-3fd2dfe86c35'::uuid,
  '14f9cda1-5d59-503a-89e4-2e822bcae41f'::uuid,
  'b2d79d82-1a6f-5049-9d9f-f181c741ab08'::uuid
);

do $assert_package_cutover_workspaces_removed$
begin
  if exists (
    select 1 from private.authoring_workspaces workspace
    where workspace.id in (
      '7834c4dc-8ddb-5e8a-900f-3fd2dfe86c35'::uuid,
      '14f9cda1-5d59-503a-89e4-2e822bcae41f'::uuid,
      'b2d79d82-1a6f-5049-9d9f-f181c741ab08'::uuid
    )
  ) then
    raise exception 'Workspaces transitórios do corte não foram removidos.'
      using errcode = '55000';
  end if;
end;
$assert_package_cutover_workspaces_removed$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_package_cutover_cleanup_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_package_cutover_cleanup_v1(),
    '{schemaRevision}',
    '"20260812131000"'::jsonb
  )
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_before_package_cutover_cleanup_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
