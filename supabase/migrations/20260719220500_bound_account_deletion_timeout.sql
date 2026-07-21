begin;

-- A conta pode possuir cursos grandes. O limite ampliado fica restrito à RPC
-- destrutiva e não altera o prazo curto das consultas comuns do browser.
alter function public.delete_own_account(text)
  set statement_timeout = '60s';

commit;
