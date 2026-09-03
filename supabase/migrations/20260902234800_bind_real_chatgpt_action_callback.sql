begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-bind-real-chatgpt-action-callback-v4',
  0
));

-- O identificador salvo do GPT organiza a credencial, mas não identifica o
-- callback que o cliente OAuth efetivamente usa. O redirect só passa a ser
-- confiável depois de uma troca de código com client_secret e URI idêntica à
-- registrada na autorização. Concessões já consumidas oferecem a mesma prova.
alter table private.authoring_action_oauth_clients
  drop constraint authoring_action_oauth_clients_redirects,
  drop constraint authoring_action_oauth_clients_link_state;

update private.authoring_action_oauth_clients client
set redirect_uris = case
  when client.gpt_id is null then array[]::text[]
  else coalesce((
    select array[
      'https://chatgpt.com' || trusted.callback_path,
      'https://chat.openai.com' || trusted.callback_path
    ]
    from (
      select min(candidate.callback_path) callback_path
      from (
        select regexp_replace(
          oauth_request.redirect_uri,
          '^https://(chatgpt[.]com|chat[.]openai[.]com)',
          ''
        ) callback_path
        from private.authoring_action_oauth_authorizations oauth_request
        where oauth_request.client_id = client.id
          and oauth_request.status = 'consumed'
          and oauth_request.redirect_uri ~
            '^https://(chatgpt[.]com|chat[.]openai[.]com)/aip/g-[A-Za-z0-9-]{6,150}/oauth/callback$'
      ) candidate
      having count(distinct candidate.callback_path) = 1
    ) trusted
  ), array[]::text[])
end,
updated_at = statement_timestamp();

alter table private.authoring_action_oauth_clients
  add constraint authoring_action_oauth_clients_redirects check (
    cardinality(redirect_uris) in (0, 2)
    and (
      cardinality(redirect_uris) = 0
      or coalesce((
        array_ndims(redirect_uris) = 1
        and array_lower(redirect_uris, 1) = 1
        and array_upper(redirect_uris, 1) = 2
        and redirect_uris[1] is not null
        and redirect_uris[2] is not null
        and
        redirect_uris[1] ~
          '^https://chatgpt[.]com/aip/g-[A-Za-z0-9-]{6,150}/oauth/callback$'
        and redirect_uris[2] = regexp_replace(
          redirect_uris[1],
          '^https://chatgpt[.]com',
          'https://chat.openai.com'
        )
      ), false)
    )
  ),
  add constraint authoring_action_oauth_clients_link_state check (
    (gpt_id is null and cardinality(redirect_uris) = 0)
    or (gpt_id is not null and cardinality(redirect_uris) in (0, 2))
  );

create or replace function public.link_authoring_action_oauth_client_v4(
  p_creator_user_id uuid,
  p_client_id uuid,
  p_gpt_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_client private.authoring_action_oauth_clients%rowtype;
begin
  perform private.require_service_role();
  if p_creator_user_id is null
     or p_gpt_id !~ '^g-[A-Za-z0-9-]{6,150}$'
     or not exists (
       select 1 from auth.users account where account.id = p_creator_user_id
     ) then
    raise exception 'Vínculo OAuth inválido.' using errcode = '22023';
  end if;
  select * into v_client
  from private.authoring_action_oauth_clients client
  where client.id = p_client_id
    and client.creator_user_id = p_creator_user_id
  for update;
  if not found
     or not v_client.active
     or v_client.gpt_id is not null
     or cardinality(v_client.redirect_uris) <> 0 then
    raise exception 'Credencial OAuth indisponível.' using errcode = 'P0002';
  end if;

  update private.authoring_action_oauth_clients client
  set active = false,
      updated_at = statement_timestamp()
  where client.creator_user_id = p_creator_user_id
    and client.gpt_id = p_gpt_id
    and client.id <> v_client.id
    and client.active;
  update private.authoring_action_oauth_authorizations oauth_request
  set status = 'denied',
      decided_at = statement_timestamp()
  where oauth_request.client_id in (
    select client.id
    from private.authoring_action_oauth_clients client
    where client.creator_user_id = p_creator_user_id
      and client.gpt_id = p_gpt_id
      and client.id <> v_client.id
      and not client.active
  ) and oauth_request.status in ('pending', 'approved');
  update private.authoring_action_oauth_tokens token
  set revoked_at = coalesce(token.revoked_at, statement_timestamp())
  where token.client_id in (
    select client.id
    from private.authoring_action_oauth_clients client
    where client.creator_user_id = p_creator_user_id
      and client.gpt_id = p_gpt_id
      and client.id <> v_client.id
      and not client.active
  ) and token.revoked_at is null;

  update private.authoring_action_oauth_clients
  set gpt_id = p_gpt_id,
      redirect_uris = array[]::text[],
      updated_at = statement_timestamp()
  where id = v_client.id;

  return jsonb_build_object(
    'clientId', v_client.id,
    'gptId', p_gpt_id,
    'linked', true
  );
end;
$$;

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
  if not found or v_client.gpt_id is null then
    raise exception 'Credencial OAuth inexistente ou revogada.' using errcode = '28000';
  end if;
  if coalesce(p_redirect_uri, '') !~
       '^https://(chatgpt[.]com|chat[.]openai[.]com)/aip/g-[A-Za-z0-9-]{6,150}/oauth/callback$'
     or (
       cardinality(v_client.redirect_uris) = 2
       and not coalesce(p_redirect_uri = any(v_client.redirect_uris), false)
     ) then
    raise exception 'O callback OAuth não é um endereço oficial vinculado ao cliente.'
      using errcode = '22023';
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

create or replace function public.exchange_authoring_action_oauth_code_v4(
  p_client_id uuid,
  p_client_secret_hash text,
  p_code_hash text,
  p_redirect_uri text,
  p_access_token_hash text,
  p_refresh_token_hash text,
  p_grant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_client private.authoring_action_oauth_clients%rowtype;
  v_authorization private.authoring_action_oauth_authorizations%rowtype;
  v_callback_path text;
begin
  perform private.require_service_role();
  if p_client_secret_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_access_token_hash !~ '^[0-9a-f]{64}$'
     or p_refresh_token_hash !~ '^[0-9a-f]{64}$'
     or p_grant_id is null then
    raise exception 'Troca OAuth inválida.' using errcode = '22023';
  end if;
  select * into v_client
  from private.authoring_action_oauth_clients client
  where client.id = p_client_id
    and client.active
    and client.gpt_id is not null
    and client.client_secret_hash = p_client_secret_hash
  for update;
  if not found then
    raise exception 'Cliente OAuth inválido.' using errcode = '28000';
  end if;
  select * into v_authorization
  from private.authoring_action_oauth_authorizations oauth_request
  where oauth_request.client_id = v_client.id
    and oauth_request.code_hash = p_code_hash
  for update;
  if not found
     or v_authorization.status <> 'approved'
     or v_authorization.user_id is null
     or v_authorization.redirect_uri <> p_redirect_uri
     or p_redirect_uri !~
       '^https://(chatgpt[.]com|chat[.]openai[.]com)/aip/g-[A-Za-z0-9-]{6,150}/oauth/callback$'
     or v_authorization.expires_at <= statement_timestamp()
     or (
       cardinality(v_client.redirect_uris) = 2
       and not coalesce(p_redirect_uri = any(v_client.redirect_uris), false)
     ) then
    raise exception 'Código OAuth inválido.' using errcode = '28000';
  end if;

  if cardinality(v_client.redirect_uris) = 0 then
    v_callback_path := regexp_replace(
      p_redirect_uri,
      '^https://(chatgpt[.]com|chat[.]openai[.]com)',
      ''
    );
    update private.authoring_action_oauth_clients
    set redirect_uris = array[
          'https://chatgpt.com' || v_callback_path,
          'https://chat.openai.com' || v_callback_path
        ],
        updated_at = statement_timestamp()
    where id = v_client.id;
  end if;

  insert into private.authoring_action_oauth_tokens (
    token_hash, token_kind, grant_id, client_id, user_id, scope, expires_at
  ) values
    (
      p_access_token_hash, 'access', p_grant_id, v_client.id,
      v_authorization.user_id, v_authorization.scope,
      statement_timestamp() + interval '1 hour'
    ),
    (
      p_refresh_token_hash, 'refresh', p_grant_id, v_client.id,
      v_authorization.user_id, v_authorization.scope,
      statement_timestamp() + interval '30 days'
    );
  update private.authoring_action_oauth_authorizations
  set status = 'consumed',
      consumed_at = statement_timestamp()
  where id = v_authorization.id;

  return jsonb_build_object(
    'userId', v_authorization.user_id,
    'clientId', v_client.id,
    'scope', v_authorization.scope,
    'expiresIn', 3600
  );
end;
$$;

revoke all on function public.link_authoring_action_oauth_client_v4(
  uuid,uuid,text
) from public, anon, authenticated;
revoke all on function public.create_authoring_action_oauth_authorization_v4(
  uuid,text,text,text
) from public, anon, authenticated;
revoke all on function public.exchange_authoring_action_oauth_code_v4(
  uuid,text,text,text,text,text,uuid
) from public, anon, authenticated;
grant execute on function public.link_authoring_action_oauth_client_v4(
  uuid,uuid,text
) to service_role;
grant execute on function public.create_authoring_action_oauth_authorization_v4(
  uuid,text,text,text
) to service_role;
grant execute on function public.exchange_authoring_action_oauth_code_v4(
  uuid,text,text,text,text,text,uuid
) to service_role;

do $advance_action_callback_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260902234800'::text),
    true
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_action_callback_manifest$;

do $action_callback_postflight$
declare
  v_link_definition text;
  v_authorize_definition text;
  v_exchange_definition text;
begin
  v_link_definition := pg_get_functiondef(
    'public.link_authoring_action_oauth_client_v4(uuid,uuid,text)'::regprocedure
  );
  v_authorize_definition := pg_get_functiondef(
    'public.create_authoring_action_oauth_authorization_v4(uuid,text,text,text)'::regprocedure
  );
  v_exchange_definition := pg_get_functiondef(
    'public.exchange_authoring_action_oauth_code_v4(uuid,text,text,text,text,text,uuid)'::regprocedure
  );

  if exists (
    select 1
    from private.authoring_action_oauth_clients client
    where cardinality(client.redirect_uris) not in (0, 2)
      or cardinality(client.redirect_uris) = 2 and not coalesce((
        array_ndims(client.redirect_uris) = 1
        and array_lower(client.redirect_uris, 1) = 1
        and array_upper(client.redirect_uris, 1) = 2
        and client.redirect_uris[1] is not null
        and client.redirect_uris[2] is not null
        and client.redirect_uris[1] ~
          '^https://chatgpt[.]com/aip/g-[A-Za-z0-9-]{6,150}/oauth/callback$'
        and client.redirect_uris[2] = regexp_replace(
          client.redirect_uris[1],
          '^https://chatgpt[.]com',
          'https://chat.openai.com'
        )
      ), false)
  )
     or v_link_definition like '%format(''https://chatgpt.com/aip/%'
     or v_authorize_definition not like '%chat[.]openai[.]com%'
     or v_authorize_definition not like '%any(v_client.redirect_uris)%'
     or v_exchange_definition not like '%v_authorization.redirect_uri <> p_redirect_uri%'
     or v_exchange_definition not like '%cardinality(v_client.redirect_uris) = 0%'
     or public.get_aralearn_runtime_manifest()->>'schemaRevision'
       <> '20260902234800' then
    raise exception 'O vínculo do callback real de Actions ficou incompleto.'
      using errcode = '55000';
  end if;
end;
$action_callback_postflight$;

commit;
