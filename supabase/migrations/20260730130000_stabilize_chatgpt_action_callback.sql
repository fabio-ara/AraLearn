begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-stabilize-chatgpt-action-callback-v4',
  0
));

-- O identificador de um GPT pode mudar quando a Action é salva, copiada ou
-- recriada pelo ChatGPT. Ele é metadado de organização, não uma credencial.
-- A autorização aceita exclusivamente callbacks oficiais do ChatGPT; a posse
-- do client_secret e a conferência do redirect no code exchange continuam
-- sendo a fronteira de segurança da concessão confidencial.
create or replace function public.create_authoring_action_oauth_authorization_v4(
  p_client_id uuid,
  p_redirect_uri text,
  p_state text,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_client private.authoring_action_oauth_clients%rowtype;
  v_authorization_id uuid;
begin
  perform private.require_service_role();
  select * into v_client
  from private.authoring_action_oauth_clients client
  where client.id = p_client_id and client.active;
  if not found then
    raise exception 'Credencial OAuth inexistente ou revogada.' using errcode = '28000';
  end if;
  if coalesce(p_redirect_uri, '') !~ '^https://(chatgpt[.]com|chat[.]openai[.]com)/aip/g-[A-Za-z0-9-]{6,150}/oauth/callback$' then
    raise exception 'O callback OAuth não é um endereço oficial do ChatGPT.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_state, '')) not between 8 and 1024 then
    raise exception 'O parâmetro state OAuth é inválido.' using errcode = '22023';
  end if;
  if p_scope not in ('openid', 'openid email') then
    raise exception 'O escopo OAuth é inválido.' using errcode = '22023';
  end if;

  delete from private.authoring_action_oauth_authorizations oauth_request
  where oauth_request.client_id = v_client.id
    and oauth_request.expires_at < statement_timestamp() - interval '1 day';
  delete from private.authoring_action_oauth_tokens token
  where token.client_id = v_client.id
    and token.expires_at < statement_timestamp() - interval '7 days';
  if (
    select count(*)
    from private.authoring_action_oauth_authorizations oauth_request
    where oauth_request.client_id = v_client.id
      and oauth_request.status = 'pending'
      and oauth_request.expires_at > statement_timestamp()
  ) >= 50 then
    raise exception 'Limite de autorizações OAuth pendentes atingido.'
      using errcode = 'P0001';
  end if;

  insert into private.authoring_action_oauth_authorizations (
    client_id,
    redirect_uri,
    state,
    scope
  ) values (
    v_client.id,
    p_redirect_uri,
    p_state,
    p_scope
  )
  returning id into v_authorization_id;

  return jsonb_build_object(
    'authorizationId', v_authorization_id,
    'clientId', v_client.id,
    'clientName', v_client.client_name
  );
end;
$$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260730130000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'immutable-course-revisions',
      'storage-only-course-content',
      'canonical-resource-registry',
      'atomic-resource-authoring',
      'atomic-card-assistance',
      'versioned-authoring-workspaces',
      'partial-private-publication',
      'microtheory-review-projection',
      'workspace-cursor-pagination',
      'oauth-only-authoring-mcp',
      'default-catalog-collection',
      'confidential-gpt-action-oauth',
      'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
