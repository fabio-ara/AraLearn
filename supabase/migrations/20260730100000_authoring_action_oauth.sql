begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-authoring-action-oauth-v4',
  0
));

create table private.authoring_action_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  gpt_id text not null,
  client_name text not null,
  client_secret_hash text not null,
  redirect_uris text[] not null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint authoring_action_oauth_clients_gpt_id check (
    gpt_id ~ '^g-[A-Za-z0-9-]{6,150}$'
  ),
  constraint authoring_action_oauth_clients_name check (
    char_length(client_name) between 1 and 120
  ),
  constraint authoring_action_oauth_clients_secret_hash check (
    client_secret_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_action_oauth_clients_redirects check (
    cardinality(redirect_uris) = 2
  ),
  unique(creator_user_id, gpt_id)
);

create table private.authoring_action_oauth_authorizations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references private.authoring_action_oauth_clients(id)
    on delete cascade,
  redirect_uri text not null,
  state text not null,
  scope text not null,
  status text not null default 'pending',
  user_id uuid references auth.users(id) on delete cascade,
  code_hash text,
  expires_at timestamptz not null
    default statement_timestamp() + interval '10 minutes',
  created_at timestamptz not null default statement_timestamp(),
  decided_at timestamptz,
  consumed_at timestamptz,
  constraint authoring_action_oauth_authorizations_state check (
    char_length(state) between 8 and 1024
  ),
  constraint authoring_action_oauth_authorizations_scope check (
    scope in ('openid', 'openid email')
  ),
  constraint authoring_action_oauth_authorizations_status check (
    status in ('pending', 'approved', 'denied', 'consumed')
  ),
  constraint authoring_action_oauth_authorizations_code check (
    code_hash is null or code_hash ~ '^[0-9a-f]{64}$'
  )
);

create unique index authoring_action_oauth_authorizations_code_idx
  on private.authoring_action_oauth_authorizations(code_hash)
  where code_hash is not null;
create index authoring_action_oauth_authorizations_expiry_idx
  on private.authoring_action_oauth_authorizations(expires_at);

create table private.authoring_action_oauth_tokens (
  token_hash text primary key,
  token_kind text not null,
  grant_id uuid not null,
  client_id uuid not null references private.authoring_action_oauth_clients(id)
    on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  replaced_by_hash text,
  constraint authoring_action_oauth_tokens_hash check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_action_oauth_tokens_kind check (
    token_kind in ('access', 'refresh')
  ),
  constraint authoring_action_oauth_tokens_scope check (
    scope in ('openid', 'openid email')
  ),
  constraint authoring_action_oauth_tokens_replacement check (
    replaced_by_hash is null or replaced_by_hash ~ '^[0-9a-f]{64}$'
  )
);

create index authoring_action_oauth_tokens_grant_idx
  on private.authoring_action_oauth_tokens(grant_id);
create index authoring_action_oauth_tokens_expiry_idx
  on private.authoring_action_oauth_tokens(expires_at)
  where revoked_at is null;

create function public.register_authoring_action_oauth_client_v4(
  p_creator_user_id uuid,
  p_gpt_id text,
  p_client_name text,
  p_client_secret_hash text,
  p_redirect_uris text[]
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
  if p_creator_user_id is null or not exists (
    select 1 from auth.users account where account.id = p_creator_user_id
  ) then
    raise exception 'Conta inválida.' using errcode = '28000';
  end if;
  if p_gpt_id !~ '^g-[A-Za-z0-9-]{6,150}$'
     or char_length(btrim(coalesce(p_client_name, ''))) not between 1 and 120
     or p_client_secret_hash !~ '^[0-9a-f]{64}$'
     or cardinality(p_redirect_uris) <> 2
     or p_redirect_uris[1] <> format(
       'https://chatgpt.com/aip/%s/oauth/callback',
       p_gpt_id
     )
     or p_redirect_uris[2] <> format(
       'https://chat.openai.com/aip/%s/oauth/callback',
       p_gpt_id
     ) then
    raise exception 'Cadastro OAuth inválido.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from private.authoring_action_oauth_clients client
    where client.creator_user_id = p_creator_user_id
      and client.gpt_id = p_gpt_id
  ) and (
    select count(*)
    from private.authoring_action_oauth_clients client
    where client.creator_user_id = p_creator_user_id
      and client.active
  ) >= 25 then
    raise exception 'Limite de integrações atingido.' using errcode = 'P0001';
  end if;

  insert into private.authoring_action_oauth_clients (
    creator_user_id,
    gpt_id,
    client_name,
    client_secret_hash,
    redirect_uris
  ) values (
    p_creator_user_id,
    p_gpt_id,
    btrim(p_client_name),
    p_client_secret_hash,
    p_redirect_uris
  )
  on conflict(creator_user_id, gpt_id) do update
  set client_name = excluded.client_name,
      client_secret_hash = excluded.client_secret_hash,
      redirect_uris = excluded.redirect_uris,
      active = true,
      updated_at = statement_timestamp()
  returning * into v_client;

  update private.authoring_action_oauth_authorizations oauth_request
  set status = 'denied',
      decided_at = statement_timestamp()
  where oauth_request.client_id = v_client.id
    and oauth_request.status in ('pending', 'approved');
  update private.authoring_action_oauth_tokens token
  set revoked_at = coalesce(token.revoked_at, statement_timestamp())
  where token.client_id = v_client.id
    and token.revoked_at is null;

  return jsonb_build_object(
    'clientId', v_client.id,
    'clientName', v_client.client_name
  );
end;
$$;

create function public.create_authoring_action_oauth_authorization_v4(
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
  if not found
     or not (p_redirect_uri = any(v_client.redirect_uris))
     or char_length(coalesce(p_state, '')) not between 8 and 1024
     or p_scope not in ('openid', 'openid email') then
    raise exception 'Solicitação OAuth inválida.' using errcode = '22023';
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

create function public.get_authoring_action_oauth_authorization_v4(
  p_authorization_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_authorization private.authoring_action_oauth_authorizations%rowtype;
  v_client private.authoring_action_oauth_clients%rowtype;
  v_email text;
begin
  perform private.require_service_role();
  if p_user_id is null then
    raise exception 'Conta obrigatória.' using errcode = '28000';
  end if;
  select * into v_authorization
  from private.authoring_action_oauth_authorizations oauth_request
  where oauth_request.id = p_authorization_id;
  if not found
     or v_authorization.status <> 'pending'
     or v_authorization.expires_at <= statement_timestamp() then
    raise exception 'Autorização inexistente ou expirada.'
      using errcode = 'P0002';
  end if;
  select * into strict v_client
  from private.authoring_action_oauth_clients client
  where client.id = v_authorization.client_id and client.active;
  select account.email into v_email
  from auth.users account
  where account.id = p_user_id;
  if not found then
    raise exception 'Conta inválida.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'authorization_id', v_authorization.id,
    'client', jsonb_build_object(
      'id', v_client.id,
      'name', v_client.client_name
    ),
    'user', jsonb_build_object(
      'id', p_user_id,
      'email', coalesce(v_email, '')
    ),
    'scope', v_authorization.scope
  );
end;
$$;

create function public.approve_authoring_action_oauth_authorization_v4(
  p_authorization_id uuid,
  p_user_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_authorization private.authoring_action_oauth_authorizations%rowtype;
begin
  perform private.require_service_role();
  if p_user_id is null
     or p_code_hash !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from auth.users account where account.id = p_user_id
     ) then
    raise exception 'Decisão OAuth inválida.' using errcode = '22023';
  end if;
  select * into v_authorization
  from private.authoring_action_oauth_authorizations oauth_request
  where oauth_request.id = p_authorization_id
  for update;
  if not found
     or v_authorization.status <> 'pending'
     or v_authorization.expires_at <= statement_timestamp() then
    raise exception 'Autorização inexistente ou expirada.'
      using errcode = 'P0002';
  end if;
  update private.authoring_action_oauth_authorizations
  set status = 'approved',
      user_id = p_user_id,
      code_hash = p_code_hash,
      expires_at = statement_timestamp() + interval '5 minutes',
      decided_at = statement_timestamp()
  where id = v_authorization.id;
  return jsonb_build_object(
    'redirectUri', v_authorization.redirect_uri,
    'state', v_authorization.state
  );
end;
$$;

create function public.deny_authoring_action_oauth_authorization_v4(
  p_authorization_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_authorization private.authoring_action_oauth_authorizations%rowtype;
begin
  perform private.require_service_role();
  if p_user_id is null or not exists (
    select 1 from auth.users account where account.id = p_user_id
  ) then
    raise exception 'Decisão OAuth inválida.' using errcode = '22023';
  end if;
  select * into v_authorization
  from private.authoring_action_oauth_authorizations oauth_request
  where oauth_request.id = p_authorization_id
  for update;
  if not found
     or v_authorization.status <> 'pending'
     or v_authorization.expires_at <= statement_timestamp() then
    raise exception 'Autorização inexistente ou expirada.'
      using errcode = 'P0002';
  end if;
  update private.authoring_action_oauth_authorizations
  set status = 'denied',
      user_id = p_user_id,
      decided_at = statement_timestamp()
  where id = v_authorization.id;
  return jsonb_build_object(
    'redirectUri', v_authorization.redirect_uri,
    'state', v_authorization.state
  );
end;
$$;

create function public.exchange_authoring_action_oauth_code_v4(
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
     or v_authorization.expires_at <= statement_timestamp() then
    raise exception 'Código OAuth inválido.' using errcode = '28000';
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

create function public.exchange_authoring_action_oauth_refresh_v4(
  p_client_id uuid,
  p_client_secret_hash text,
  p_refresh_token_hash text,
  p_access_token_hash text,
  p_new_refresh_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_client private.authoring_action_oauth_clients%rowtype;
  v_refresh private.authoring_action_oauth_tokens%rowtype;
begin
  perform private.require_service_role();
  if p_client_secret_hash !~ '^[0-9a-f]{64}$'
     or p_refresh_token_hash !~ '^[0-9a-f]{64}$'
     or p_access_token_hash !~ '^[0-9a-f]{64}$'
     or p_new_refresh_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Renovação OAuth inválida.' using errcode = '22023';
  end if;
  select * into v_client
  from private.authoring_action_oauth_clients client
  where client.id = p_client_id
    and client.active
    and client.client_secret_hash = p_client_secret_hash
  for update;
  if not found then
    raise exception 'Cliente OAuth inválido.' using errcode = '28000';
  end if;
  select * into v_refresh
  from private.authoring_action_oauth_tokens token
  where token.token_hash = p_refresh_token_hash
    and token.token_kind = 'refresh'
    and token.client_id = v_client.id
  for update;
  if not found
     or v_refresh.revoked_at is not null
     or v_refresh.expires_at <= statement_timestamp() then
    raise exception 'Refresh token inválido.' using errcode = '28000';
  end if;

  update private.authoring_action_oauth_tokens
  set revoked_at = statement_timestamp(),
      replaced_by_hash = p_new_refresh_token_hash
  where token_hash = v_refresh.token_hash;
  insert into private.authoring_action_oauth_tokens (
    token_hash, token_kind, grant_id, client_id, user_id, scope, expires_at
  ) values
    (
      p_access_token_hash, 'access', v_refresh.grant_id, v_client.id,
      v_refresh.user_id, v_refresh.scope,
      statement_timestamp() + interval '1 hour'
    ),
    (
      p_new_refresh_token_hash, 'refresh', v_refresh.grant_id, v_client.id,
      v_refresh.user_id, v_refresh.scope,
      statement_timestamp() + interval '30 days'
    );

  return jsonb_build_object(
    'userId', v_refresh.user_id,
    'clientId', v_client.id,
    'scope', v_refresh.scope,
    'expiresIn', 3600
  );
end;
$$;

create function public.resolve_authoring_action_oauth_principal_v4(
  p_access_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_access private.authoring_action_oauth_tokens%rowtype;
  v_principal jsonb;
begin
  perform private.require_service_role();
  if p_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Access token inválido.' using errcode = '28000';
  end if;
  select token.* into v_access
  from private.authoring_action_oauth_tokens token
  join private.authoring_action_oauth_clients client
    on client.id = token.client_id and client.active
  where token.token_hash = p_access_token_hash
    and token.token_kind = 'access'
    and token.revoked_at is null
    and token.expires_at > statement_timestamp();
  if not found then
    raise exception 'Access token inválido.' using errcode = '28000';
  end if;
  v_principal := public.resolve_authoring_oauth_principal(v_access.user_id);
  return v_principal || jsonb_build_object(
    'oauthClientId', v_access.client_id,
    'oauthScope', v_access.scope
  );
end;
$$;

revoke all on table private.authoring_action_oauth_clients
  from public, anon, authenticated;
revoke all on table private.authoring_action_oauth_authorizations
  from public, anon, authenticated;
revoke all on table private.authoring_action_oauth_tokens
  from public, anon, authenticated;

revoke all on function public.register_authoring_action_oauth_client_v4(
  uuid,text,text,text,text[]
) from public, anon, authenticated;
revoke all on function public.create_authoring_action_oauth_authorization_v4(
  uuid,text,text,text
) from public, anon, authenticated;
revoke all on function public.get_authoring_action_oauth_authorization_v4(
  uuid,uuid
) from public, anon, authenticated;
revoke all on function public.approve_authoring_action_oauth_authorization_v4(
  uuid,uuid,text
) from public, anon, authenticated;
revoke all on function public.deny_authoring_action_oauth_authorization_v4(
  uuid,uuid
) from public, anon, authenticated;
revoke all on function public.exchange_authoring_action_oauth_code_v4(
  uuid,text,text,text,text,text,uuid
) from public, anon, authenticated;
revoke all on function public.exchange_authoring_action_oauth_refresh_v4(
  uuid,text,text,text,text
) from public, anon, authenticated;
revoke all on function public.resolve_authoring_action_oauth_principal_v4(text)
  from public, anon, authenticated;

grant execute on function public.register_authoring_action_oauth_client_v4(
  uuid,text,text,text,text[]
) to service_role;
grant execute on function public.create_authoring_action_oauth_authorization_v4(
  uuid,text,text,text
) to service_role;
grant execute on function public.get_authoring_action_oauth_authorization_v4(
  uuid,uuid
) to service_role;
grant execute on function public.approve_authoring_action_oauth_authorization_v4(
  uuid,uuid,text
) to service_role;
grant execute on function public.deny_authoring_action_oauth_authorization_v4(
  uuid,uuid
) to service_role;
grant execute on function public.exchange_authoring_action_oauth_code_v4(
  uuid,text,text,text,text,text,uuid
) to service_role;
grant execute on function public.exchange_authoring_action_oauth_refresh_v4(
  uuid,text,text,text,text
) to service_role;
grant execute on function public.resolve_authoring_action_oauth_principal_v4(text)
  to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260730100000',
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
      'confidential-gpt-action-oauth'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
