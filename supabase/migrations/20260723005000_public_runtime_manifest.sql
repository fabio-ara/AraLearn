begin;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260723005000',
    'contractVersion', 3,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'relational-offline-replica',
      'granular-sync',
      'private-authoring',
      'catalog-submissions',
      'text-language-metadata'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

comment on function public.get_aralearn_runtime_manifest() is
  'Metadados públicos e sem dados de usuário usados para impedir que um runtime incompatível seja publicado antes das migrations.';

commit;
