-- Restringe o contexto do único invólucro SECURITY DEFINER exposto. Todas as
-- chamadas internas usam nomes qualificados; não há motivo para resolver nomes
-- a partir de schemas mutáveis.

begin;

alter function public.get_aralearn_runtime_manifest()
  set search_path = pg_catalog;

commit;
