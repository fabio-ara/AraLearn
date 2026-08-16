begin;

-- O manifesto é estático e integra a inicialização do cliente antes da
-- autenticação. As demais RPCs internas continuam restritas ao service_role.
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
