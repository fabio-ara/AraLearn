-- O manifesto público encadeia as revisões anteriores, cujas funções auxiliares
-- permanecem deliberadamente sem EXECUTE para clientes. O invólucro final deve
-- executar com o proprietário para não expor essa cadeia interna.

begin;

alter function public.get_aralearn_runtime_manifest()
  security definer;
alter function public.get_aralearn_runtime_manifest()
  set search_path = pg_catalog, public;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
