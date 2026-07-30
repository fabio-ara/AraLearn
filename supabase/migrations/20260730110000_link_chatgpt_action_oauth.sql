begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-link-chatgpt-action-oauth-v4',
  0
));

-- O identificador g-... só existe depois do primeiro salvamento do GPT. A
-- credencial precisa, portanto, nascer antes do callback exato e ser vinculada
-- uma única vez pela pessoa que a criou.
alter table private.authoring_action_oauth_clients
  drop constraint authoring_action_oauth_clients_gpt_id,
  drop constraint authoring_action_oauth_clients_redirects;
alter table private.authoring_action_oauth_clients
  alter column gpt_id drop not null;
alter table private.authoring_action_oauth_clients
  add constraint authoring_action_oauth_clients_gpt_id check (
    gpt_id is null or gpt_id ~ '^g-[A-Za-z0-9-]{6,150}$'
  ),
  add constraint authoring_action_oauth_clients_redirects check (
    cardinality(redirect_uris) in (0, 2)
  ),
  add constraint authoring_action_oauth_clients_link_state check (
    (gpt_id is null and cardinality(redirect_uris) = 0)
    or (gpt_id is not null and cardinality(redirect_uris) = 2)
  );

create unique index authoring_action_oauth_one_setup_per_creator_idx
  on private.authoring_action_oauth_clients(creator_user_id)
  where gpt_id is null and active;

drop function public.register_authoring_action_oauth_client_v4(
  uuid,text,text,text,text[]
);

create function public.create_authoring_action_oauth_client_setup_v4(
  p_creator_user_id uuid,
  p_client_name text,
  p_client_secret_hash text
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
  if char_length(btrim(coalesce(p_client_name, ''))) not between 1 and 120
     or p_client_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Cadastro OAuth inválido.' using errcode = '22023';
  end if;
  if (
    select count(*)
    from private.authoring_action_oauth_clients client
    where client.creator_user_id = p_creator_user_id
      and client.active
      and client.gpt_id is not null
  ) >= 25 then
    raise exception 'Limite de integrações atingido.' using errcode = 'P0001';
  end if;

  update private.authoring_action_oauth_clients client
  set active = false,
      updated_at = statement_timestamp()
  where client.creator_user_id = p_creator_user_id
    and client.gpt_id is null
    and client.active;
  update private.authoring_action_oauth_authorizations oauth_request
  set status = 'denied',
      decided_at = statement_timestamp()
  where oauth_request.client_id in (
    select client.id
    from private.authoring_action_oauth_clients client
    where client.creator_user_id = p_creator_user_id
      and client.gpt_id is null
      and not client.active
  ) and oauth_request.status in ('pending', 'approved');
  update private.authoring_action_oauth_tokens token
  set revoked_at = coalesce(token.revoked_at, statement_timestamp())
  where token.client_id in (
    select client.id
    from private.authoring_action_oauth_clients client
    where client.creator_user_id = p_creator_user_id
      and client.gpt_id is null
      and not client.active
  ) and token.revoked_at is null;

  insert into private.authoring_action_oauth_clients (
    creator_user_id,
    gpt_id,
    client_name,
    client_secret_hash,
    redirect_uris
  ) values (
    p_creator_user_id,
    null,
    btrim(p_client_name),
    p_client_secret_hash,
    array[]::text[]
  )
  returning * into v_client;

  return jsonb_build_object(
    'clientId', v_client.id,
    'clientName', v_client.client_name
  );
end;
$$;

create function public.link_authoring_action_oauth_client_v4(
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
        format('https://chatgpt.com/aip/%s/oauth/callback', p_gpt_id),
        format('https://chat.openai.com/aip/%s/oauth/callback', p_gpt_id)
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

revoke all on function public.create_authoring_action_oauth_client_setup_v4(
  uuid,text,text
) from public, anon, authenticated;
revoke all on function public.link_authoring_action_oauth_client_v4(
  uuid,uuid,text
) from public, anon, authenticated;
grant execute on function public.create_authoring_action_oauth_client_setup_v4(
  uuid,text,text
) to service_role;
grant execute on function public.link_authoring_action_oauth_client_v4(
  uuid,uuid,text
) to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260730110000',
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
      'gpt-action-oauth-linking'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
