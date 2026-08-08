-- Alinha o anúncio público ao corte já executado: o workspace corrente é
-- estudável em Trilhas sem publicação privada parcial, enquanto a ordenação
-- editorial de Coleções continua disponível no backend.

begin;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_contract_alignment_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with base as (
    select public.get_aralearn_runtime_manifest_without_contract_alignment_v1() as value
  )
  select jsonb_set(
    base.value,
    '{features}',
    ((base.value->'features') - 'partial-private-publication') ||
      case
        when (base.value->'features') ? 'catalog-collection-ordering-v1'
          then '[]'::jsonb
        else jsonb_build_array('catalog-collection-ordering-v1')
      end
  )
  from base
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_without_contract_alignment_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
