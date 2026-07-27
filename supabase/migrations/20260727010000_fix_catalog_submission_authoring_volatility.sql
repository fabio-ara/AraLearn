begin;

-- As duas consultas estabelecem a identidade efetiva da conta na transação.
-- set_config é volátil; declarar STABLE fazia o lint sugerir uma otimização
-- incorreta para chamadas que dependem desse contexto.
create or replace function public.list_catalog_submission_candidates_authoring(p_actor_user_id uuid, p_client_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private
as $$ begin
  perform private.require_catalog_submission_authoring_client(p_actor_user_id, p_client_id, 'authoring:private:read');
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  return public.list_my_catalog_submission_candidates();
end; $$;

create or replace function public.list_my_catalog_submissions_authoring(p_actor_user_id uuid, p_client_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private
as $$ begin
  perform private.require_catalog_submission_authoring_client(p_actor_user_id, p_client_id, 'authoring:private:read');
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  return public.list_my_catalog_submissions();
end; $$;

commit;
