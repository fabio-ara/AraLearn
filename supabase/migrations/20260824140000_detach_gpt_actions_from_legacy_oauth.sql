begin;

-- Actions conserva seu OAuth confidencial, mas resolve a pessoa diretamente
-- pelo estado corrente de Auth e perfil. O caminho antigo de workspace deixa
-- de ser um consumidor necessário do produto publicado.
create or replace function public.resolve_authoring_action_oauth_principal_v4(
  p_access_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_access private.authoring_action_oauth_tokens%rowtype;
begin
  perform private.require_service_role();
  if p_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Access token inválido.' using errcode = '28000';
  end if;

  select token_value.*
  into v_access
  from private.authoring_action_oauth_tokens token_value
  join private.authoring_action_oauth_clients client_value
    on client_value.id = token_value.client_id
   and client_value.active
  join auth.users account_value
    on account_value.id = token_value.user_id
   and account_value.deleted_at is null
   and not coalesce(account_value.is_anonymous, false)
   and (
     account_value.banned_until is null
     or account_value.banned_until <= statement_timestamp()
   )
  join public.person_profiles profile_value
    on profile_value.user_id = account_value.id
  where token_value.token_hash = p_access_token_hash
    and token_value.token_kind = 'access'
    and token_value.revoked_at is null
    and token_value.expires_at > statement_timestamp();

  if not found then
    raise exception 'Access token inválido.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'contract', 'aralearn.action-oauth-principal.v1',
    'active', true,
    'actorId', v_access.user_id,
    'oauthClientId', v_access.client_id,
    'oauthScope', v_access.scope
  );
end;
$function$;

revoke all on function public.resolve_authoring_action_oauth_principal_v4(text)
from public, anon, authenticated, service_role;
grant execute on function public.resolve_authoring_action_oauth_principal_v4(text)
to service_role;

do $advance_actions_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260824130000'
     or (v_manifest->>'contractVersion')::integer <> 1 then
    raise exception 'Manifesto concorrente ao corte do OAuth legado.'
      using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260824140000'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_actions_runtime_manifest$;

do $actions_runtime_postflight$
declare
  v_manifest jsonb;
  v_definition text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260824140000'
     or jsonb_array_length(v_manifest->'features') <> 39 then
    raise exception 'Manifesto do OAuth corrente não foi consolidado.'
      using errcode = '55000';
  end if;

  select pg_get_functiondef(
    'public.resolve_authoring_action_oauth_principal_v4(text)'::regprocedure
  ) into v_definition;
  if v_definition like '%resolve_authoring_oauth_principal(%' then
    raise exception 'O resolvedor de Actions ainda depende do OAuth legado.'
      using errcode = '55000';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.resolve_authoring_action_oauth_principal_v4(text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.resolve_authoring_action_oauth_principal_v4(text)',
       'EXECUTE'
     ) then
    raise exception 'A fronteira server-side do OAuth de Actions divergiu.'
      using errcode = '55000';
  end if;
end;
$actions_runtime_postflight$;

commit;
