begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-drop-legacy-chat-openai-action-origin-v4',
  0
));

-- Autorizações já concluídas permanecem como registro da concessão. Pedidos
-- ainda utilizáveis no host substituído deixam de poder gerar novos tokens.
update private.authoring_action_oauth_authorizations oauth_request
set status = 'denied',
    decided_at = statement_timestamp()
where oauth_request.redirect_uri like 'https://chat.openai.com/%'
  and oauth_request.status in ('pending', 'approved');

-- Tokens não registram a origem que iniciou a concessão. Revogar uma vez os
-- clientes já vinculados é a única forma de provar o corte; o host atual faz
-- uma conexão nova com a mesma credencial confidencial.
update private.authoring_action_oauth_tokens token
set revoked_at = coalesce(token.revoked_at, statement_timestamp())
where token.client_id in (
  select client.id
  from private.authoring_action_oauth_clients client
  where client.gpt_id is not null
)
and token.revoked_at is null;

-- A constraint anterior exigia os dois aliases. O vínculo corrente conserva
-- somente o callback oficial atual; credenciais ainda não vinculadas continuam
-- com a lista vazia.
alter table private.authoring_action_oauth_clients
  drop constraint authoring_action_oauth_clients_redirects,
  drop constraint authoring_action_oauth_clients_link_state;

update private.authoring_action_oauth_clients client
set redirect_uris = array[
      format('https://chatgpt.com/aip/%s/oauth/callback', client.gpt_id)
    ],
    updated_at = statement_timestamp()
where client.gpt_id is not null;

alter table private.authoring_action_oauth_clients
  add constraint authoring_action_oauth_clients_redirects check (
    cardinality(redirect_uris) in (0, 1)
  ),
  add constraint authoring_action_oauth_clients_link_state check (
    (gpt_id is null and redirect_uris = array[]::text[])
    or (
      gpt_id is not null
      and redirect_uris = array[
        format('https://chatgpt.com/aip/%s/oauth/callback', gpt_id)
      ]
    )
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
      redirect_uris = array[
        format('https://chatgpt.com/aip/%s/oauth/callback', p_gpt_id)
      ],
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
  if not found
     or v_client.gpt_id is null
     or cardinality(v_client.redirect_uris) <> 1 then
    raise exception 'Credencial OAuth inexistente ou revogada.' using errcode = '28000';
  end if;
  if coalesce(p_redirect_uri, '') !~
       '^https://chatgpt[.]com/aip/g-[A-Za-z0-9-]{6,150}/oauth/callback$'
     or p_redirect_uri <> v_client.redirect_uris[1] then
    raise exception 'O callback OAuth não é um endereço oficial do ChatGPT.'
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

revoke all on function public.link_authoring_action_oauth_client_v4(
  uuid,uuid,text
) from public, anon, authenticated;
revoke all on function public.create_authoring_action_oauth_authorization_v4(
  uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.link_authoring_action_oauth_client_v4(
  uuid,uuid,text
) to service_role;
grant execute on function public.create_authoring_action_oauth_authorization_v4(
  uuid,text,text,text
) to service_role;

do $advance_action_origin_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260902123759'::text),
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
$advance_action_origin_manifest$;

do $action_origin_postflight$
declare
  v_manifest jsonb;
begin
  if exists (
    select 1
    from private.authoring_action_oauth_clients client
    where client.gpt_id is not null
      and client.redirect_uris <> array[
        format('https://chatgpt.com/aip/%s/oauth/callback', client.gpt_id)
      ]
  ) or exists (
    select 1
    from private.authoring_action_oauth_authorizations oauth_request
    where oauth_request.redirect_uri like 'https://chat.openai.com/%'
      and oauth_request.status in ('pending', 'approved')
  ) or exists (
    select 1
    from private.authoring_action_oauth_tokens token
    join private.authoring_action_oauth_clients client on client.id = token.client_id
    where client.gpt_id is not null
      and token.revoked_at is null
  ) then
    raise exception 'O corte da origem antiga de Actions ficou incompleto.'
      using errcode = '55000';
  end if;

  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260902123759' then
    raise exception 'O manifesto não anuncia o corte da origem de Actions.'
      using errcode = '55000';
  end if;
end;
$action_origin_postflight$;

commit;
