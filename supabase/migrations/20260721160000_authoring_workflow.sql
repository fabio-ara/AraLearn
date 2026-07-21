begin;

select pg_advisory_xact_lock(hashtextextended('aralearn-authoring-workflow-v1', 0));

-- Papéis da aplicação. A identidade é sempre o UUID de auth.users; nenhum
-- endereço de e-mail ou proprietário inicial fica gravado na migration.
create table private.app_role_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (user_id, role),
  constraint app_role_assignments_role check (
    role in ('owner', 'catalog_publisher', 'author', 'reviewer')
  ),
  constraint app_role_assignments_reason check (
    reason is null or (btrim(reason) <> '' and char_length(reason) <= 500)
  ),
  constraint app_role_assignments_revocation check (
    (active and revoked_at is null and revoked_by is null)
    or (not active and revoked_at is not null)
  )
);

create index app_role_assignments_active_role_idx
  on private.app_role_assignments(role, user_id)
  where active;

-- Transfere uma única vez os administradores ativos já existentes para o
-- modelo de papéis. As autorizações seguintes consultam somente esta tabela.
insert into private.app_role_assignments(
  user_id, role, active, granted_by, granted_at, reason, updated_at
)
select administrator.user_id, 'owner', true, administrator.user_id, now(),
  'Transferência para o modelo de papéis', now()
from private.app_admins administrator
where administrator.active
on conflict(user_id, role) do nothing;

create table private.app_role_audit (
  id bigint generated always as identity primary key,
  target_user_id uuid not null,
  role text not null,
  operation text not null,
  active boolean,
  changed_by uuid,
  reason text,
  changed_at timestamptz not null default now(),
  constraint app_role_audit_role check (
    role in ('owner', 'catalog_publisher', 'author', 'reviewer')
  ),
  constraint app_role_audit_operation check (
    operation in ('grant', 'revoke', 'reactivate', 'change', 'delete')
  )
);

create index app_role_audit_target_idx
  on private.app_role_audit(target_user_id, changed_at desc);

create or replace function private.has_active_app_role(
  p_user_id uuid,
  p_role text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select p_user_id is not null and exists (
    select 1
    from private.app_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role = p_role
      and assignment.active
  );
$$;

create or replace function private.require_service_role()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  if private.request_role() is distinct from 'service_role' then
    raise exception 'Operação restrita ao serviço de autoria.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.protect_last_app_owner()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_removes_owner boolean;
begin
  if old.role <> 'owner' or not old.active then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_removes_owner := tg_op = 'DELETE';
  if tg_op = 'UPDATE' then
    v_removes_owner := new.role <> 'owner' or not new.active;
  end if;

  if not v_removes_owner then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aralearn-active-owner', 0));
  if not exists (
    select 1
    from private.app_role_assignments assignment
    where assignment.role = 'owner'
      and assignment.active
      and assignment.user_id <> old.user_id
  ) then
    raise exception 'O último proprietário ativo não pode ser removido.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists app_role_assignments_protect_last_owner
  on private.app_role_assignments;
create trigger app_role_assignments_protect_last_owner
before update or delete on private.app_role_assignments
for each row execute function private.protect_last_app_owner();

create or replace function private.audit_app_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_actor_text text := nullif(
    current_setting('aralearn.role_actor_user_id', true),
    ''
  );
  v_actor uuid;
  v_operation text;
  v_row private.app_role_assignments%rowtype;
begin
  if v_actor_text is not null then
    v_actor := v_actor_text::uuid;
  end if;

  if tg_op = 'DELETE' then
    v_row := old;
    v_operation := 'delete';
  else
    v_row := new;
    v_operation := case
      when tg_op = 'INSERT' and new.active then 'grant'
      when tg_op = 'INSERT' then 'revoke'
      when not old.active and new.active then 'reactivate'
      when old.active and not new.active then 'revoke'
      else 'change'
    end;
  end if;

  insert into private.app_role_audit(
    target_user_id, role, operation, active, changed_by, reason
  ) values (
    v_row.user_id, v_row.role, v_operation, v_row.active,
    coalesce(v_actor, v_row.granted_by, v_row.revoked_by), v_row.reason
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists app_role_assignments_audit
  on private.app_role_assignments;
create trigger app_role_assignments_audit
after insert or update or delete on private.app_role_assignments
for each row execute function private.audit_app_role_assignment();

-- O papel owner concentra a administração do aplicativo. catalog_publisher
-- recebe somente poderes editoriais, sem ampliar as RLS de dados pessoais.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
  select private.request_role() = 'service_role'
    or private.has_active_app_role(auth.uid(), 'owner');
$$;

create or replace function public.set_app_role(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role text,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_active_owner_count bigint;
  v_actor_can_manage boolean;
  v_assignment private.app_role_assignments%rowtype;
begin
  perform private.require_service_role();

  if p_target_user_id is null
     or p_role not in ('owner', 'catalog_publisher', 'author', 'reviewer')
     or p_active is null then
    raise exception 'Atribuição de papel inválida.' using errcode = '22023';
  end if;
  if p_reason is not null
     and (nullif(btrim(p_reason), '') is null or char_length(p_reason) > 500) then
    raise exception 'Justificativa inválida.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users account where account.id = p_target_user_id) then
    raise exception 'Usuário de destino inexistente.' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aralearn-active-owner', 0));
  select count(*) into v_active_owner_count
  from private.app_role_assignments assignment
  where assignment.role = 'owner' and assignment.active;

  v_actor_can_manage := p_actor_user_id is not null
    and private.has_active_app_role(p_actor_user_id, 'owner');

  -- O único caso sem ator é a criação do primeiro owner. Depois disso, toda
  -- alteração exige um owner identificável.
  if not v_actor_can_manage and not (
    p_actor_user_id is null
    and v_active_owner_count = 0
    and p_role = 'owner'
    and p_active
  ) then
    raise exception 'Somente um proprietário pode administrar papéis.'
      using errcode = '42501';
  end if;

  perform set_config(
    'aralearn.role_actor_user_id',
    coalesce(p_actor_user_id::text, ''),
    true
  );

  insert into private.app_role_assignments(
    user_id, role, active, granted_by, granted_at,
    revoked_by, revoked_at, reason, updated_at
  ) values (
    p_target_user_id, p_role, p_active,
    case when p_active then p_actor_user_id end,
    now(),
    case when not p_active then p_actor_user_id end,
    case when not p_active then now() end,
    p_reason, now()
  )
  on conflict(user_id, role) do update set
    active = excluded.active,
    granted_by = case
      when excluded.active then excluded.granted_by
      else private.app_role_assignments.granted_by
    end,
    granted_at = case
      when excluded.active then now()
      else private.app_role_assignments.granted_at
    end,
    revoked_by = excluded.revoked_by,
    revoked_at = excluded.revoked_at,
    reason = excluded.reason,
    updated_at = now()
  returning * into v_assignment;

  return jsonb_build_object(
    'userId', v_assignment.user_id,
    'role', v_assignment.role,
    'active', v_assignment.active,
    'updatedAt', v_assignment.updated_at
  );
end;
$$;

create or replace function public.list_app_role_assignments(p_actor_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or not private.has_active_app_role(p_actor_user_id, 'owner') then
    raise exception 'Somente um proprietário pode consultar papéis.'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', assignment.user_id,
      'role', assignment.role,
      'active', assignment.active,
      'grantedAt', assignment.granted_at,
      'revokedAt', assignment.revoked_at,
      'updatedAt', assignment.updated_at
    ) order by assignment.user_id, assignment.role)
    from private.app_role_assignments assignment
  ), '[]'::jsonb);
end;
$$;

create or replace function public.current_user_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner boolean;
  v_catalog_publisher boolean;
  v_author boolean;
  v_reviewer boolean;
  v_roles jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  v_owner := private.has_active_app_role(v_user_id, 'owner');
  v_catalog_publisher := private.has_active_app_role(v_user_id, 'catalog_publisher');
  v_author := private.has_active_app_role(v_user_id, 'author');
  v_reviewer := private.has_active_app_role(v_user_id, 'reviewer');

  select coalesce(jsonb_agg(role order by role), '[]'::jsonb)
  into v_roles
  from (
    select assignment.role
    from private.app_role_assignments assignment
    where assignment.user_id = v_user_id and assignment.active
  ) active_roles;

  return jsonb_build_object(
    'authenticated', true,
    'userId', v_user_id,
    'roles', v_roles,
    'privateImport', true,
    'catalogImport', v_owner or v_catalog_publisher,
    'catalogPublish', v_owner or v_catalog_publisher,
    'manageRoles', v_owner,
    'authoring', jsonb_build_object(
      'private', true,
      'catalogDraft', v_owner or v_catalog_publisher or v_author,
      'catalogReview', v_owner or v_catalog_publisher or v_reviewer,
      'catalogPublish', v_owner or v_catalog_publisher
    )
  );
end;
$$;

-- Clientes da API. A chave original nunca entra no banco: somente SHA-256 e
-- um prefixo de identificação ficam persistidos.
create table private.authoring_api_clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_prefix text not null unique,
  api_key_hash text not null unique,
  scopes text[] not null,
  rate_limit_per_minute integer not null default 30,
  expires_at timestamptz,
  revoked_at timestamptz,
  rotated_from_client_id uuid references private.authoring_api_clients(id)
    on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint authoring_api_clients_name check (
    btrim(name) <> '' and char_length(name) <= 120
  ),
  constraint authoring_api_clients_prefix check (
    key_prefix ~ '^arl_[A-Za-z0-9_-]{6,40}$'
  ),
  constraint authoring_api_clients_hash check (
    api_key_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_api_clients_scopes check (
    cardinality(scopes) between 1 and 8
    and scopes <@ array[
      'authoring:read',
      'authoring:write',
      'authoring:audit',
      'course:import',
      'catalog:publish',
      'roles:manage'
    ]::text[]
  ),
  constraint authoring_api_clients_rate check (
    rate_limit_per_minute between 1 and 600
  ),
  constraint authoring_api_clients_expiry check (
    expires_at is null or expires_at > created_at
  )
);

create index authoring_api_clients_owner_idx
  on private.authoring_api_clients(owner_user_id, revoked_at, expires_at);

create table private.authoring_api_rate_windows (
  client_id uuid primary key references private.authoring_api_clients(id)
    on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  constraint authoring_api_rate_windows_count check (request_count >= 0)
);

create index authoring_api_rate_windows_time_idx
  on private.authoring_api_rate_windows(window_started_at);

create table private.authoring_user_rate_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  constraint authoring_user_rate_windows_count check (request_count >= 0)
);

create index authoring_user_rate_windows_time_idx
  on private.authoring_user_rate_windows(window_started_at);

create table private.authoring_api_client_events (
  id bigint generated always as identity primary key,
  client_id uuid references private.authoring_api_clients(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint authoring_api_client_events_type check (
    event_type in ('created', 'rate_limited', 'rotated', 'revoked')
  ),
  constraint authoring_api_client_events_details check (
    jsonb_typeof(details) = 'object' and pg_column_size(details) <= 65536
  )
);

create index authoring_api_client_events_client_idx
  on private.authoring_api_client_events(client_id, created_at desc);
create index authoring_api_client_events_type_created_idx
  on private.authoring_api_client_events(event_type, created_at, id);

create or replace function private.user_can_use_authoring_scope(
  p_user_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
  select p_user_id is not null
    and exists (select 1 from auth.users account where account.id = p_user_id)
    and case p_scope
      when 'authoring:read' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'author')
        or private.has_active_app_role(p_user_id, 'reviewer')
      when 'authoring:write' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'author')
      when 'authoring:audit' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'reviewer')
      when 'course:import' then
        true
      when 'catalog:publish' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
      when 'roles:manage' then
        private.has_active_app_role(p_user_id, 'owner')
      else false
    end;
$$;

create or replace function public.create_authoring_api_client(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_key_prefix text,
  p_api_key_hash text,
  p_scopes text[],
  p_rate_limit_per_minute integer default 30,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_client private.authoring_api_clients%rowtype;
  v_scopes text[];
begin
  perform private.require_service_role();

  if p_actor_user_id is null or p_owner_user_id is null
     or not exists (select 1 from auth.users account where account.id = p_owner_user_id)
     or (p_actor_user_id <> p_owner_user_id
       and not private.has_active_app_role(p_actor_user_id, 'owner')) then
    raise exception 'Cliente de autoria não autorizado.' using errcode = '42501';
  end if;

  select array_agg(scope order by scope) into v_scopes
  from (select distinct unnest(p_scopes) as scope) normalized;

  if v_scopes is null or 'course:import' = any(v_scopes) or exists (
    select 1 from unnest(v_scopes) scope
    where not private.user_can_use_authoring_scope(p_owner_user_id, scope)
  ) then
    raise exception 'Escopo de autoria não autorizado.' using errcode = '42501';
  end if;

  insert into private.authoring_api_clients(
    owner_user_id, name, key_prefix, api_key_hash, scopes,
    rate_limit_per_minute, expires_at, created_by
  ) values (
    p_owner_user_id, btrim(p_name), p_key_prefix, lower(p_api_key_hash), v_scopes,
    p_rate_limit_per_minute, p_expires_at, p_actor_user_id
  ) returning * into v_client;

  insert into private.authoring_api_client_events(
    client_id, actor_user_id, event_type, details
  ) values (
    v_client.id, p_actor_user_id, 'created',
    jsonb_build_object('scopes', v_client.scopes, 'keyPrefix', v_client.key_prefix)
  );

  return jsonb_build_object(
    'clientId', v_client.id,
    'ownerUserId', v_client.owner_user_id,
    'name', v_client.name,
    'keyPrefix', v_client.key_prefix,
    'scopes', to_jsonb(v_client.scopes),
    'rateLimitPerMinute', v_client.rate_limit_per_minute,
    'expiresAt', v_client.expires_at
  );
end;
$$;

create or replace function public.rotate_authoring_api_client(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_new_key_prefix text,
  p_new_api_key_hash text,
  p_new_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_old private.authoring_api_clients%rowtype;
  v_new private.authoring_api_clients%rowtype;
begin
  perform private.require_service_role();
  select * into v_old
  from private.authoring_api_clients client
  where client.id = p_client_id
  for update;

  if not found or v_old.revoked_at is not null
     or p_actor_user_id is null
     or (p_actor_user_id <> v_old.owner_user_id
       and not private.has_active_app_role(p_actor_user_id, 'owner')) then
    raise exception 'Rotação de cliente não autorizada.' using errcode = '42501';
  end if;

  insert into private.authoring_api_clients(
    owner_user_id, name, key_prefix, api_key_hash, scopes,
    rate_limit_per_minute, expires_at, rotated_from_client_id, created_by
  ) values (
    v_old.owner_user_id, v_old.name, p_new_key_prefix, lower(p_new_api_key_hash),
    v_old.scopes, v_old.rate_limit_per_minute, p_new_expires_at,
    v_old.id, p_actor_user_id
  ) returning * into v_new;

  update private.authoring_api_clients
  set revoked_at = now(), updated_at = now()
  where id = v_old.id;

  insert into private.authoring_api_client_events(
    client_id, actor_user_id, event_type, details
  ) values
    (v_old.id, p_actor_user_id, 'rotated', jsonb_build_object('replacementClientId', v_new.id)),
    (v_new.id, p_actor_user_id, 'created', jsonb_build_object('rotatedFromClientId', v_old.id));

  return jsonb_build_object(
    'clientId', v_new.id,
    'ownerUserId', v_new.owner_user_id,
    'name', v_new.name,
    'keyPrefix', v_new.key_prefix,
    'scopes', to_jsonb(v_new.scopes),
    'rateLimitPerMinute', v_new.rate_limit_per_minute,
    'expiresAt', v_new.expires_at,
    'rotatedFromClientId', v_old.id
  );
end;
$$;

create or replace function public.revoke_authoring_api_client(
  p_actor_user_id uuid,
  p_client_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_client private.authoring_api_clients%rowtype;
begin
  perform private.require_service_role();
  select * into v_client
  from private.authoring_api_clients client
  where client.id = p_client_id
  for update;

  if not found or p_actor_user_id is null
     or (p_actor_user_id <> v_client.owner_user_id
       and not private.has_active_app_role(p_actor_user_id, 'owner')) then
    raise exception 'Revogação de cliente não autorizada.' using errcode = '42501';
  end if;

  if v_client.revoked_at is null then
    update private.authoring_api_clients
    set revoked_at = now(), updated_at = now()
    where id = v_client.id
    returning * into v_client;

    insert into private.authoring_api_client_events(
      client_id, actor_user_id, event_type
    ) values (v_client.id, p_actor_user_id, 'revoked');
  end if;

  return jsonb_build_object(
    'clientId', v_client.id,
    'revokedAt', v_client.revoked_at
  );
end;
$$;

-- Resolve a chave já resumida pela Edge Function. Também consome uma unidade
-- da janela de rate limit; chamadas rejeitadas não revelam qual teste falhou.
create or replace function public.resolve_authoring_api_client(
  p_api_key_hash text,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_client private.authoring_api_clients%rowtype;
  v_window timestamptz := date_trunc('minute', statement_timestamp());
  v_count integer;
  -- Uma importação manual grande avança em diversos lotes pequenos. O limite
  -- continua estrito, mas comporta um curso grande sem interromper o próprio
  -- fluxo idempotente antes da virada da janela.
  v_user_limit constant integer := 120;
  v_user_scopes text[];
begin
  perform private.require_service_role();

  -- Sessões do aplicativo chegam aqui após a Edge Function validar o JWT no
  -- Auth. Elas não precisam de uma chave paralela e recebem capacidades
  -- derivadas exclusivamente do UUID autenticado.
  if p_api_key_hash is null then
    if p_user_id is null or not exists (
      select 1 from auth.users account where account.id = p_user_id
    ) then
      raise exception 'Sessão de autoria inválida.' using errcode = '28000';
    end if;

    insert into private.authoring_user_rate_windows(
      user_id, window_started_at, request_count
    ) values (p_user_id, v_window, 1)
    on conflict(user_id) do update
    set request_count = case
          when private.authoring_user_rate_windows.window_started_at = excluded.window_started_at
            then private.authoring_user_rate_windows.request_count + 1
          else 1
        end,
        window_started_at = excluded.window_started_at
    returning request_count into v_count;

    if v_count > v_user_limit then
      if v_count = v_user_limit + 1 then
        insert into private.authoring_api_client_events(
          client_id, actor_user_id, event_type, details
        ) values (
          null, p_user_id, 'rate_limited',
          jsonb_build_object('windowStartedAt', v_window, 'authentication', 'jwt')
        );
      end if;
      return jsonb_build_object(
        'active', true,
        'status', 'rate_limited',
        'actorId', p_user_id,
        'clientId', null,
        'scopes', '[]'::jsonb,
        'rateLimit', v_user_limit,
        'rateRemaining', 0
      );
    end if;

    select coalesce(array_agg(scope order by scope), array[]::text[])
    into v_user_scopes
    from unnest(array[
      'authoring:read', 'authoring:write', 'authoring:audit',
      'course:import', 'catalog:publish', 'roles:manage'
    ]::text[]) scope
    where private.user_can_use_authoring_scope(p_user_id, scope);

    return jsonb_build_object(
      'active', true,
      'actorId', p_user_id,
      'clientId', null,
      'scopes', to_jsonb(v_user_scopes),
      'rateLimit', v_user_limit,
      'rateRemaining', greatest(v_user_limit - v_count, 0)
    );
  end if;

  if lower(p_api_key_hash) !~ '^[0-9a-f]{64}$' then
    raise exception 'Credencial de autoria inválida.' using errcode = '28000';
  end if;

  select * into v_client
  from private.authoring_api_clients client
  where client.api_key_hash = lower(p_api_key_hash)
  for update;

  if not found
     or v_client.revoked_at is not null
     or (v_client.expires_at is not null and v_client.expires_at <= now())
     or (p_user_id is not null and p_user_id <> v_client.owner_user_id) then
    raise exception 'Credencial de autoria inválida.' using errcode = '28000';
  end if;

  insert into private.authoring_api_rate_windows(
    client_id, window_started_at, request_count
  ) values (v_client.id, v_window, 1)
  on conflict(client_id) do update
  set request_count = case
        when private.authoring_api_rate_windows.window_started_at = excluded.window_started_at
          then private.authoring_api_rate_windows.request_count + 1
        else 1
      end,
      window_started_at = excluded.window_started_at
  returning request_count into v_count;

  if v_count > v_client.rate_limit_per_minute then
    if v_count = v_client.rate_limit_per_minute + 1 then
      insert into private.authoring_api_client_events(
        client_id, actor_user_id, event_type, details
      ) values (
        v_client.id, v_client.owner_user_id, 'rate_limited',
        jsonb_build_object('windowStartedAt', v_window)
      );
    end if;
    return jsonb_build_object(
      'active', true,
      'status', 'rate_limited',
      'actorId', v_client.owner_user_id,
      'clientId', v_client.id,
      'scopes', '[]'::jsonb,
      'rateLimit', v_client.rate_limit_per_minute,
      'rateRemaining', 0
    );
  end if;

  update private.authoring_api_clients
  set last_used_at = now(), updated_at = now()
  where id = v_client.id;

  select coalesce(array_agg(scope order by scope), array[]::text[])
  into v_user_scopes
  from unnest(v_client.scopes) scope
  where private.user_can_use_authoring_scope(v_client.owner_user_id, scope);

  return jsonb_build_object(
    'active', true,
    'clientId', v_client.id,
    'actorId', v_client.owner_user_id,
    'actorUserId', v_client.owner_user_id,
    'keyPrefix', v_client.key_prefix,
    'scopes', to_jsonb(v_user_scopes),
    'rateLimitPerMinute', v_client.rate_limit_per_minute,
    'rateLimit', v_client.rate_limit_per_minute,
    'rateRemaining', greatest(v_client.rate_limit_per_minute - v_count, 0),
    'expiresAt', v_client.expires_at
  );
end;
$$;

-- Estado relacional e transitório do ciclo Planner -> Builder -> Auditor.
-- Fragmentos e relatórios são staging de autoria, nunca a árvore operacional.
create table private.authoring_runs (
  id uuid primary key,
  created_by uuid not null references auth.users(id) on delete cascade,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  publication_target text not null,
  collection_id uuid references public.catalog_collections(id) on delete set null,
  collection_explicit boolean not null default false,
  publication_intent text not null default 'create',
  base_course_id uuid references public.courses(id) on delete restrict,
  base_content_hash text,
  contract_key text,
  title text not null,
  brief jsonb not null default '{}'::jsonb,
  status text not null default 'planning',
  plan jsonb,
  plan_hash text,
  validation_report jsonb,
  document_hash text,
  assembled_document jsonb,
  publication_step integer not null default 0,
  publication_actor_id uuid references auth.users(id) on delete set null,
  publication_client_id uuid references private.authoring_api_clients(id) on delete set null,
  publication_lease_token uuid,
  publication_lease_until timestamptz,
  publication_error jsonb,
  blocked_context jsonb,
  blocked_previous_status text,
  course_id uuid references public.courses(id) on delete set null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  validated_at timestamptz,
  published_at timestamptz,
  terminal_compacted_at timestamptz,
  constraint authoring_runs_target check (
    publication_target = 'catalog'
  ),
  constraint authoring_runs_publication_intent check (
    publication_intent in ('create', 'update')
    and (
      (publication_intent = 'create'
        and base_course_id is null and base_content_hash is null)
      or (publication_intent = 'update'
        and base_course_id is not null
        and base_content_hash ~ '^[0-9a-f]{64}$')
    )
  ),
  constraint authoring_runs_contract_key check (
    contract_key is null or (btrim(contract_key) <> '' and char_length(contract_key) <= 240)
  ),
  constraint authoring_runs_title check (
    btrim(title) <> '' and char_length(title) <= 300
  ),
  constraint authoring_runs_brief check (
    jsonb_typeof(brief) = 'object' and pg_column_size(brief) <= 32768
  ),
  constraint authoring_runs_status check (
    status in (
      'planning', 'building', 'auditing', 'repair', 'rebuild',
      'ready_for_validation', 'validated', 'publishing', 'published',
      'blocked', 'cancelled'
    )
  ),
  constraint authoring_runs_plan check (
    plan is null or (jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 4194304)
  ),
  constraint authoring_runs_hashes check (
    (plan_hash is null or plan_hash ~ '^[0-9a-f]{64}$')
    and (document_hash is null or document_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint authoring_runs_document check (
    assembled_document is null or (
      jsonb_typeof(assembled_document) = 'object'
      and pg_column_size(assembled_document) <= 5242880
    )
  ),
  constraint authoring_runs_publication_step check (publication_step >= 0),
  constraint authoring_runs_publication_lease check (
    (publication_lease_token is null and publication_lease_until is null)
    or (
      status = 'publishing'
      and publication_lease_token is not null
      and publication_lease_until is not null
      and publication_actor_id is not null
    )
  ),
  constraint authoring_runs_publication_actor check (
    publication_client_id is null or publication_actor_id is not null
  ),
  constraint authoring_runs_publication_error check (
    publication_error is null or (
      status = 'publishing'
      and jsonb_typeof(publication_error) = 'object'
      and publication_error->>'kind' in ('transient', 'deterministic')
      and nullif(btrim(publication_error->>'code'), '') is not null
      and pg_column_size(publication_error) <= 8192
    )
  ),
  constraint authoring_runs_blocked_context check (
    blocked_context is null or (
      jsonb_typeof(blocked_context) = 'object'
      and pg_column_size(blocked_context) <= 262144
    )
  ),
  constraint authoring_runs_blocked_shape check (
    (status = 'blocked' and blocked_context is not null and blocked_previous_status is not null)
    or (status <> 'blocked' and blocked_context is null and blocked_previous_status is null)
  ),
  constraint authoring_runs_revision check (revision > 0),
  constraint authoring_runs_expiry check (expires_at > created_at),
  constraint authoring_runs_publication_shape check (
    (status <> 'published' and published_at is null)
    or (status = 'published' and course_id is not null and published_at is not null)
  )
);

create index authoring_runs_publication_lease_idx
  on private.authoring_runs(publication_lease_until)
  where status = 'publishing' and publication_lease_until is not null;

-- A materialização oficial em chunks pertence a uma única execução de
-- autoria. Esses campos permitem repetir a comparação otimista no primeiro e
-- no último passo, além de impedir que outra importação apague seu staging.
alter table private.official_catalog_imports
  add column if not exists authoring_run_id uuid
    references private.authoring_runs(id) on delete set null,
  add column if not exists base_course_id uuid,
  add column if not exists base_content_hash text;

alter table private.official_catalog_imports
  drop constraint if exists official_catalog_imports_authoring_base_check;
alter table private.official_catalog_imports
  add constraint official_catalog_imports_authoring_base_check check (
    authoring_run_id is null
    or (
      (base_course_id is null and base_content_hash is null)
      or (base_course_id is not null and base_content_hash ~ '^[0-9a-f]{64}$')
    )
  );

create index if not exists official_catalog_imports_authoring_run_idx
  on private.official_catalog_imports(authoring_run_id)
  where authoring_run_id is not null;

create index authoring_runs_creator_idx
  on private.authoring_runs(created_by, updated_at desc);
create index authoring_runs_status_idx
  on private.authoring_runs(status, updated_at, id);
create index authoring_runs_expiry_idx
  on private.authoring_runs(expires_at, status);
create index authoring_runs_status_published_at_idx
  on private.authoring_runs(status, published_at, id);

-- O ledger pode ser extenso. Ele chega em blocos pequenos e existe em uma
-- única cópia transitória; o plano conserva apenas o manifesto e os hashes.
create table private.authoring_ledger_chunks (
  run_id uuid not null references private.authoring_runs(id) on delete cascade,
  section text not null,
  position integer not null,
  items jsonb not null,
  item_count integer generated always as (jsonb_array_length(items)) stored,
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(run_id, section, position),
  constraint authoring_ledger_chunks_section check (
    section in ('sources', 'claims', 'terms')
  ),
  constraint authoring_ledger_chunks_position check (position between 0 and 999),
  constraint authoring_ledger_chunks_items check (
    jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) between 1 and 10000
    and pg_column_size(items) <= 65536
  ),
  constraint authoring_ledger_chunks_hash check (
    content_hash ~ '^[0-9a-f]{64}$'
  )
);

create index authoring_ledger_chunks_run_idx
  on private.authoring_ledger_chunks(run_id, section, position);

create table private.authoring_parts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.authoring_runs(id) on delete cascade,
  part_key text not null,
  position integer not null,
  title text not null,
  outline jsonb not null,
  specification jsonb,
  fragment jsonb,
  submission_meta jsonb not null default '{}'::jsonb,
  fragment_hash text,
  status text not null default 'planned',
  blocked_previous_status text,
  attempt integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  unique(run_id, part_key),
  unique(run_id, position),
  constraint authoring_parts_key check (
    btrim(part_key) <> '' and char_length(part_key) <= 240
  ),
  constraint authoring_parts_position check (position >= 0),
  constraint authoring_parts_title check (
    btrim(title) <> '' and char_length(title) <= 300
  ),
  constraint authoring_parts_outline check (
    jsonb_typeof(outline) = 'object'
    and pg_column_size(outline) <= 262144
  ),
  constraint authoring_parts_specification check (
    specification is null or (
      jsonb_typeof(specification) = 'object'
      and pg_column_size(specification) <= 98304
    )
  ),
  constraint authoring_parts_fragment check (
    fragment is null or (jsonb_typeof(fragment) = 'object' and pg_column_size(fragment) <= 524288)
  ),
  constraint authoring_parts_submission_meta check (
    jsonb_typeof(submission_meta) = 'object'
    and pg_column_size(submission_meta) <= 524288
  ),
  constraint authoring_parts_fragment_hash check (
    fragment_hash is null or fragment_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_parts_status check (
    status in (
      'planned', 'building', 'awaiting_audit',
      'repair_required', 'rebuild_required', 'approved', 'blocked'
    )
  ),
  constraint authoring_parts_attempt check (attempt >= 0),
  constraint authoring_parts_blocked_shape check (
    (status = 'blocked' and blocked_previous_status is not null)
    or (status <> 'blocked' and blocked_previous_status is null)
  ),
  constraint authoring_parts_approval_shape check (
    (status <> 'approved' and approved_at is null)
    or (status = 'approved' and approved_at is not null)
  )
);

create index authoring_parts_next_idx
  on private.authoring_parts(run_id, position, status);

create table private.authoring_audit_reports (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.authoring_runs(id) on delete cascade,
  part_id uuid not null references private.authoring_parts(id) on delete cascade,
  attempt integer not null,
  decision text not null,
  findings jsonb not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint authoring_audit_reports_attempt check (attempt > 0),
  constraint authoring_audit_reports_decision check (
    decision in ('approve', 'repair', 'rebuild', 'blocked')
  ),
  constraint authoring_audit_reports_findings check (
    jsonb_typeof(findings) in ('array', 'object')
    and pg_column_size(findings) <= 131072
  )
);

create index authoring_audit_reports_run_idx
  on private.authoring_audit_reports(run_id, created_at);
create index authoring_audit_reports_part_attempt_idx
  on private.authoring_audit_reports(part_id, attempt, created_at);

create table private.authoring_block_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.authoring_runs(id) on delete cascade,
  part_id uuid references private.authoring_parts(id) on delete cascade,
  action text not null,
  context jsonb not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint authoring_block_events_action check (action in ('block', 'resume')),
  constraint authoring_block_events_context check (
    jsonb_typeof(context) = 'object' and pg_column_size(context) <= 262144
  )
);

create index authoring_block_events_run_idx
  on private.authoring_block_events(run_id, id);

create table private.authoring_command_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.authoring_runs(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  request_id text not null,
  command text not null,
  part_key text,
  api_request_hash text,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique(actor_user_id, request_id),
  constraint authoring_command_events_command check (
    command in (
      'create_run', 'set_plan', 'put_ledger_chunk', 'finalize_plan',
      'set_part_specification', 'submit_part', 'audit_part', 'reopen_part',
      'validate', 'prepare_publish', 'import_document',
      'block', 'resume', 'cancel_run'
    )
  ),
  constraint authoring_command_events_hash check (
    request_hash ~ '^[0-9a-f]{64}$'
    and (api_request_hash is null or api_request_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint authoring_command_events_request_id check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint authoring_command_events_result check (
    jsonb_typeof(result) = 'object' and pg_column_size(result) <= 1048576
  )
);

create index authoring_command_events_run_idx
  on private.authoring_command_events(run_id, id);

-- Recibos mínimos sobrevivem à remoção do staging para que um requestId antigo
-- nunca volte a executar o mesmo comando. Não há FK para a execução ou o ator:
-- a finalidade desta tabela é justamente preservar a prova depois da retenção.
create table private.authoring_command_receipts (
  actor_user_id uuid not null,
  responsible_user_id uuid not null,
  request_id text not null,
  run_id uuid not null,
  command text not null,
  part_key text,
  api_request_hash text,
  request_hash text not null,
  result jsonb not null,
  command_created_at timestamptz not null,
  retained_at timestamptz not null default now(),
  primary key(actor_user_id, request_id),
  constraint authoring_command_receipts_hash check (
    request_hash ~ '^[0-9a-f]{64}$'
    and (api_request_hash is null or api_request_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint authoring_command_receipts_request_id check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint authoring_command_receipts_result check (
    jsonb_typeof(result) = 'object' and pg_column_size(result) <= 1048576
  )
);

create index authoring_command_receipts_run_idx
  on private.authoring_command_receipts(run_id, retained_at);
create index authoring_command_receipts_responsible_idx
  on private.authoring_command_receipts(responsible_user_id, retained_at);
create index authoring_command_receipts_retained_idx
  on private.authoring_command_receipts(
    retained_at, actor_user_id, request_id
  );

-- A auditoria de retenção não referencia a execução por FK porque precisa
-- continuar consultável depois da remoção física do staging terminal.
create table private.authoring_retention_events (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  prior_status text not null,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  responsible_user_id uuid not null,
  details jsonb not null,
  created_at timestamptz not null default now(),
  unique(run_id, action),
  constraint authoring_retention_events_action check (
    action in ('expired_run_cancelled', 'terminal_run_deleted')
  ),
  constraint authoring_retention_events_details check (
    jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4194304
  )
);

create index authoring_retention_events_created_idx
  on private.authoring_retention_events(created_at desc);
create index authoring_retention_events_responsible_idx
  on private.authoring_retention_events(responsible_user_id, created_at);

create or replace function private.authoring_actor_has_role(
  p_user_id uuid,
  p_role text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select private.has_active_app_role(p_user_id, 'owner')
    or private.has_active_app_role(p_user_id, p_role);
$$;

create or replace function private.authoring_client_has_scope(
  p_client_id uuid,
  p_actor_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select p_client_id is null or exists (
    select 1
    from private.authoring_api_clients client
    where client.id = p_client_id
      and client.owner_user_id = p_actor_id
      and client.revoked_at is null
      and (client.expires_at is null or client.expires_at > now())
      and p_scope = any(client.scopes)
  );
$$;

create or replace function private.authoring_run_is_accessible(
  p_actor_id uuid,
  p_run private.authoring_runs,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select p_actor_id is not null and case
    when p_action = 'publish' then
      private.has_active_app_role(p_actor_id, 'owner')
      or private.has_active_app_role(p_actor_id, 'catalog_publisher')
    when p_action = 'write' then
      private.has_active_app_role(p_actor_id, 'owner')
      or private.has_active_app_role(p_actor_id, 'catalog_publisher')
      or (
        p_run.created_by = p_actor_id
        and private.has_active_app_role(p_actor_id, 'author')
      )
    when p_action = 'audit' then
      private.has_active_app_role(p_actor_id, 'owner')
      or private.has_active_app_role(p_actor_id, 'catalog_publisher')
      or private.has_active_app_role(p_actor_id, 'reviewer')
    when p_action = 'read' then
      private.has_active_app_role(p_actor_id, 'owner')
      or private.has_active_app_role(p_actor_id, 'catalog_publisher')
      or private.has_active_app_role(p_actor_id, 'reviewer')
      or (
        p_run.created_by = p_actor_id
        and private.has_active_app_role(p_actor_id, 'author')
      )
    else false
  end;
$$;

create or replace function public.get_authoring_run(
  p_run_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run private.authoring_runs%rowtype;
begin
  perform private.require_service_role();
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id;

  if not found or not private.authoring_run_is_accessible(p_actor_id, v_run, 'read') then
    raise exception 'Execução de autoria não encontrada.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'runId', v_run.id,
    'createdBy', v_run.created_by,
    'publicationTarget', v_run.publication_target,
    'collectionId', v_run.collection_id,
    'collectionExplicit', v_run.collection_explicit,
    'publicationIntent', v_run.publication_intent,
    'baseCourseId', v_run.base_course_id,
    'baseContentHash', v_run.base_content_hash,
    'contractKey', v_run.contract_key,
    'title', v_run.title,
    'brief', v_run.brief,
    'status', v_run.status,
    'nextAction', case
      when v_run.status = 'blocked' then 'ask_user'
      when v_run.status = 'building'
        and not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
        then 'upload_ledger'
      when v_run.status = 'ready_for_validation' then 'validate'
      when v_run.status = 'validated' then 'prepare_publish'
      when v_run.status = 'publishing'
        and v_run.publication_error->>'kind' = 'deterministic'
        then 'publication_failed'
      when v_run.status = 'publishing'
        and v_run.publication_lease_until > clock_timestamp()
        then 'poll_publication'
      when v_run.status = 'publishing' then 'continue_publish'
      when v_run.status = 'published' then 'complete'
      else 'next_part'
    end,
    'blockedContext', v_run.blocked_context,
    'revision', v_run.revision,
    'plan', v_run.plan,
    'planHash', v_run.plan_hash,
    'documentHash', v_run.document_hash,
    'assembledDocument', v_run.assembled_document,
    'publicationStep', v_run.publication_step,
    'publicationPhase', case
      when v_run.status = 'published' then 'complete'
      when v_run.publication_error->>'kind' = 'deterministic' then 'failed'
      when v_run.publication_lease_until > clock_timestamp() then 'finalizing'
      when v_run.status = 'publishing' then 'staging'
      else null
    end,
    'publicationLeaseUntil', v_run.publication_lease_until,
    'publicationError', v_run.publication_error,
    'courseId', v_run.course_id,
    'ledgerProgress', case
      when v_run.plan->'ledgerManifest' is null then null
      else (
        select jsonb_object_agg(section.name, jsonb_build_object(
          'expectedChunks', (v_run.plan->'ledgerManifest'->'sections'->section.name->>'chunkCount')::integer,
          'expectedItems', (v_run.plan->'ledgerManifest'->'sections'->section.name->>'itemCount')::integer,
          'receivedChunks', (select count(*) from private.authoring_ledger_chunks chunk
            where chunk.run_id = v_run.id and chunk.section = section.name),
          'receivedItems', (select coalesce(sum(chunk.item_count), 0) from private.authoring_ledger_chunks chunk
            where chunk.run_id = v_run.id and chunk.section = section.name),
          'missingPositions', coalesce((
            select jsonb_agg(expected.position order by expected.position)
            from generate_series(
              0,
              (v_run.plan->'ledgerManifest'->'sections'->section.name->>'chunkCount')::integer - 1
            ) expected(position)
            where not exists (
              select 1 from private.authoring_ledger_chunks chunk
              where chunk.run_id = v_run.id and chunk.section = section.name
                and chunk.position = expected.position
            )
          ), '[]'::jsonb)
        ))
        from (values ('sources'), ('claims'), ('terms')) section(name)
      )
    end,
    'nextPart', (
      select jsonb_build_object(
        'partKey', part.part_key,
        'position', part.position,
        'title', part.title,
        'status', part.status,
        'blockedPreviousStatus', part.blocked_previous_status,
        'attempt', part.attempt,
        'outline', part.outline,
        'specification', part.specification
      )
      from private.authoring_parts part
      where part.run_id = v_run.id and part.status <> 'approved'
      order by part.position
      limit 1
    ),
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', part.part_key,
        'position', part.position,
        'title', part.title,
        'status', part.status,
        'attempt', part.attempt,
        'outline', part.outline,
        'specification', part.specification,
        'fragment', part.fragment,
        'submissionMeta', part.submission_meta,
        'fragmentHash', part.fragment_hash,
        'submittedAt', part.submitted_at,
        'approvedAt', part.approved_at,
        'audits', coalesce((
          select jsonb_agg(jsonb_build_object(
            'attempt', report.attempt,
            'decision', report.decision,
            'findings', report.findings,
            'reviewedBy', report.reviewed_by,
            'createdAt', report.created_at
          ) order by report.attempt)
          from private.authoring_audit_reports report
          where report.part_id = part.id
        ), '[]'::jsonb)
      ) order by part.position)
      from private.authoring_parts part
      where part.run_id = v_run.id
    ), '[]'::jsonb),
    'validation', v_run.validation_report,
    'blockHistory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', block_event.action,
        'partKey', part.part_key,
        'context', block_event.context,
        'createdAt', block_event.created_at
      ) order by block_event.id)
      from private.authoring_block_events block_event
      left join private.authoring_parts part on part.id = block_event.part_id
      where block_event.run_id = v_run.id
    ), '[]'::jsonb),
    'createdAt', v_run.created_at,
    'updatedAt', v_run.updated_at,
    'validatedAt', v_run.validated_at,
    'publishedAt', v_run.published_at
  );
end;
$$;

create or replace function public.get_authoring_run_summary(
  p_run_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run private.authoring_runs%rowtype;
begin
  perform private.require_service_role();
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id;

  if not found or not private.authoring_run_is_accessible(p_actor_id, v_run, 'read') then
    raise exception 'Execução de autoria não encontrada.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'runId', v_run.id,
    'createdBy', v_run.created_by,
    'publicationTarget', v_run.publication_target,
    'collectionId', v_run.collection_id,
    'collectionExplicit', v_run.collection_explicit,
    'publicationIntent', v_run.publication_intent,
    'baseCourseId', v_run.base_course_id,
    'baseContentHash', v_run.base_content_hash,
    'contractKey', v_run.contract_key,
    'title', v_run.title,
    'brief', v_run.brief,
    'planHash', v_run.plan_hash,
    'status', v_run.status,
    'nextAction', case
      when v_run.status = 'blocked' then 'ask_user'
      when v_run.status = 'building'
        and not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
        then 'upload_ledger'
      when v_run.status = 'ready_for_validation' then 'validate'
      when v_run.status = 'validated' then 'prepare_publish'
      when v_run.status = 'publishing'
        and v_run.publication_error->>'kind' = 'deterministic'
        then 'publication_failed'
      when v_run.status = 'publishing'
        and v_run.publication_lease_until > clock_timestamp()
        then 'poll_publication'
      when v_run.status = 'publishing' then 'continue_publish'
      when v_run.status = 'published' then 'complete'
      else 'next_part'
    end,
    'blockedContext', v_run.blocked_context,
    'revision', v_run.revision,
    'planHash', v_run.plan_hash,
    'documentHash', v_run.document_hash,
    'publicationStep', v_run.publication_step,
    'publicationPhase', case
      when v_run.status = 'published' then 'complete'
      when v_run.publication_error->>'kind' = 'deterministic' then 'failed'
      when v_run.publication_lease_until > clock_timestamp() then 'finalizing'
      when v_run.status = 'publishing' then 'staging'
      else null
    end,
    'publicationLeaseUntil', v_run.publication_lease_until,
    'publicationError', v_run.publication_error,
    'courseId', v_run.course_id,
    'ledgerProgress', case
      when v_run.plan->'ledgerManifest' is null then null
      else (
        select jsonb_object_agg(section.name, jsonb_build_object(
          'expectedChunks', (v_run.plan->'ledgerManifest'->'sections'->section.name->>'chunkCount')::integer,
          'expectedItems', (v_run.plan->'ledgerManifest'->'sections'->section.name->>'itemCount')::integer,
          'receivedChunks', (select count(*) from private.authoring_ledger_chunks chunk
            where chunk.run_id = v_run.id and chunk.section = section.name),
          'receivedItems', (select coalesce(sum(chunk.item_count), 0) from private.authoring_ledger_chunks chunk
            where chunk.run_id = v_run.id and chunk.section = section.name),
          'missingPositions', coalesce((
            select jsonb_agg(expected.position order by expected.position)
            from generate_series(
              0,
              (v_run.plan->'ledgerManifest'->'sections'->section.name->>'chunkCount')::integer - 1
            ) expected(position)
            where not exists (
              select 1 from private.authoring_ledger_chunks chunk
              where chunk.run_id = v_run.id and chunk.section = section.name
                and chunk.position = expected.position
            )
          ), '[]'::jsonb)
        ))
        from (values ('sources'), ('claims'), ('terms')) section(name)
      )
    end,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', part.part_key,
        'position', part.position,
        'title', part.title,
        'status', part.status,
        'attempt', part.attempt,
        'specificationReady', part.specification is not null,
        'fragmentHash', part.fragment_hash,
        'submittedAt', part.submitted_at,
        'approvedAt', part.approved_at,
        'latestAudit', (
          select jsonb_build_object(
            'attempt', report.attempt,
            'decision', report.decision,
            'findings', report.findings,
            'createdAt', report.created_at
          )
          from private.authoring_audit_reports report
          where report.part_id = part.id
          order by report.attempt desc
          limit 1
        )
      ) order by part.position)
      from private.authoring_parts part
      where part.run_id = v_run.id
    ), '[]'::jsonb),
    'validation', v_run.validation_report,
    'createdAt', v_run.created_at,
    'updatedAt', v_run.updated_at,
    'validatedAt', v_run.validated_at,
    'publishedAt', v_run.published_at
  );
end;
$$;

create or replace function public.list_authoring_runs(
  p_actor_id uuid,
  p_limit integer default 30,
  p_before_updated_at timestamptz default null,
  p_before_run_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_items jsonb;
  v_has_more boolean;
  v_last jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null or p_limit not between 1 and 100
     or ((p_before_updated_at is null) <> (p_before_run_id is null)) then
    raise exception 'Paginação de execuções inválida.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(item order by item->>'updatedAt' desc, item->>'runId' desc), '[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'runId', run.id,
      'title', run.title,
      'status', run.status,
      'publicationTarget', run.publication_target,
      'collectionId', run.collection_id,
      'courseId', run.course_id,
      'nextAction', case
        when run.status = 'blocked' then 'ask_user'
        when run.status = 'planning' then 'set_plan'
        when run.status = 'building'
          and not coalesce((run.plan->>'ledgerFinalized')::boolean, false)
          then 'upload_ledger'
        when run.status = 'ready_for_validation' then 'validate'
        when run.status = 'validated' then 'prepare_publish'
        when run.status = 'publishing' then 'continue_publish'
        when run.status = 'published' then 'complete'
        when coalesce((select part.specification is null
          from private.authoring_parts part
          where part.run_id = run.id and part.status <> 'approved'
          order by part.position limit 1), false) then 'specify_part'
        when exists (select 1 from private.authoring_parts part
          where part.run_id = run.id and part.status = 'awaiting_audit') then 'audit_part'
        else 'build_part'
      end,
      'partCounts', jsonb_build_object(
        'total', (select count(*) from private.authoring_parts part where part.run_id = run.id),
        'planned', (select count(*) from private.authoring_parts part where part.run_id = run.id and part.status = 'planned'),
        'awaitingAudit', (select count(*) from private.authoring_parts part where part.run_id = run.id and part.status = 'awaiting_audit'),
        'repairRequired', (select count(*) from private.authoring_parts part where part.run_id = run.id and part.status = 'repair_required'),
        'rebuildRequired', (select count(*) from private.authoring_parts part where part.run_id = run.id and part.status = 'rebuild_required'),
        'approved', (select count(*) from private.authoring_parts part where part.run_id = run.id and part.status = 'approved')
      ),
      'createdAt', run.created_at,
      'updatedAt', run.updated_at,
      'expiresAt', run.expires_at
    ) item
    from private.authoring_runs run
    where private.authoring_run_is_accessible(p_actor_id, run, 'read')
      and (
        p_before_updated_at is null
        or (run.updated_at, run.id) < (p_before_updated_at, p_before_run_id)
      )
    order by run.updated_at desc, run.id desc
    limit p_limit + 1
  ) page;

  v_has_more := jsonb_array_length(v_items) > p_limit;
  if v_has_more then
    v_items := v_items - p_limit;
    v_last := v_items->(p_limit - 1);
  end if;
  return jsonb_build_object(
    'items', v_items,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'updatedAt', v_last->>'updatedAt',
      'runId', v_last->>'runId'
    ) else null end
  );
end;
$$;

create or replace function private.authoring_ledger_document(p_run_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, private
as $$
  select jsonb_build_object(
    'artifact', 'aralearn.course-ledger',
    'version', 1,
    'runId', p_run_id,
    'sources', coalesce((
      select jsonb_agg(item.value order by chunk.position, item.ordinality)
      from private.authoring_ledger_chunks chunk
      cross join lateral jsonb_array_elements(chunk.items) with ordinality item(value, ordinality)
      where chunk.run_id = p_run_id and chunk.section = 'sources'
    ), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(item.value order by chunk.position, item.ordinality)
      from private.authoring_ledger_chunks chunk
      cross join lateral jsonb_array_elements(chunk.items) with ordinality item(value, ordinality)
      where chunk.run_id = p_run_id and chunk.section = 'claims'
    ), '[]'::jsonb),
    'terms', coalesce((
      select jsonb_agg(item.value order by chunk.position, item.ordinality)
      from private.authoring_ledger_chunks chunk
      cross join lateral jsonb_array_elements(chunk.items) with ordinality item(value, ordinality)
      where chunk.run_id = p_run_id and chunk.section = 'terms'
    ), '[]'::jsonb),
    'approvedParts', '[]'::jsonb,
    'openIssues', coalesce((
      select run.plan->'ledgerManifest'->'openIssues'
      from private.authoring_runs run where run.id = p_run_id
    ), '[]'::jsonb)
  );
$$;

create or replace function private.authoring_ledger_slice(
  p_run_id uuid,
  p_specification jsonb,
  p_part_key text
)
returns jsonb
language sql
stable
set search_path = pg_catalog, private
as $$
  with ledger as (
    select private.authoring_ledger_document(p_run_id) as value
  ), cards as (
    select card
    from jsonb_array_elements(coalesce(p_specification->'cardPlan', '[]'::jsonb)) as item(card)
  ), wanted_card_ids as (
    select card_id as id
    from jsonb_array_elements_text(
      coalesce(p_specification->'cardIds', '[]'::jsonb)
    ) as item(card_id)
    union
    select card->>'cardId' from cards where nullif(card->>'cardId', '') is not null
  ), base_source_ids as (
    select source_id as id
    from jsonb_array_elements_text(
      coalesce(p_specification->'allowedSourceIds', '[]'::jsonb)
    ) as item(source_id)
    union
    select source_id
    from cards
    cross join lateral jsonb_array_elements_text(
      coalesce(cards.card->'sourceIds', '[]'::jsonb)
    ) as item(source_id)
  ), wanted_term_ids as (
    select term_id as id
    from jsonb_array_elements_text(
      coalesce(p_specification->'availableTermIds', '[]'::jsonb)
    ) as item(term_id)
    union
    select term_id
    from cards
    cross join lateral jsonb_array_elements_text(
      coalesce(cards.card->'introducedTermIds', '[]'::jsonb)
    ) as item(term_id)
    union
    select term_id
    from cards
    cross join lateral jsonb_array_elements_text(
      coalesce(cards.card->'requiredTermIds', '[]'::jsonb)
    ) as item(term_id)
  ), selected_terms as (
    select term
    from ledger
    cross join lateral jsonb_array_elements(
      coalesce(ledger.value->'terms', '[]'::jsonb)
    ) as item(term)
    where term->>'termId' in (select id from wanted_term_ids)
       or term->>'firstTeachingCardId' in (select id from wanted_card_ids)
       or exists (
         select 1
         from jsonb_array_elements_text(
           coalesce(term->'requiredByCardIds', '[]'::jsonb)
         ) required(card_id)
         where required.card_id in (select id from wanted_card_ids)
       )
  ), term_source_ids as (
    select source_id as id
    from selected_terms
    cross join lateral jsonb_array_elements_text(
      coalesce(selected_terms.term->'sourceIds', '[]'::jsonb)
    ) as item(source_id)
  ), preclaim_source_ids as (
    select id from base_source_ids
    union
    select id from term_source_ids
  ), selected_claims as (
    select claim
    from ledger
    cross join lateral jsonb_array_elements(
      coalesce(ledger.value->'claims', '[]'::jsonb)
    ) as item(claim)
    where exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(claim->'allowedPartKeys', '[]'::jsonb)
      ) as item(allowed_part)
      where allowed_part = p_part_key
    ) or exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(claim->'sourceIds', '[]'::jsonb)
      ) as item(source_id)
      where source_id in (select id from preclaim_source_ids)
    )
  ), claim_source_ids as (
    select source_id as id
    from selected_claims
    cross join lateral jsonb_array_elements_text(
      coalesce(selected_claims.claim->'sourceIds', '[]'::jsonb)
    ) as item(source_id)
  ), selected_source_ids as (
    select id from preclaim_source_ids
    union
    select id from claim_source_ids
  )
  select jsonb_build_object(
    'sources', coalesce((
      select jsonb_agg(source)
      from ledger
      cross join lateral jsonb_array_elements(
        coalesce(ledger.value->'sources', '[]'::jsonb)
      ) as item(source)
      where source->>'sourceId' in (select id from selected_source_ids)
    ), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(claim) from selected_claims), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(term) from selected_terms), '[]'::jsonb),
    'openIssues', coalesce((select value->'openIssues' from ledger), '[]'::jsonb)
  );
$$;

create or replace function private.authoring_project_slice(
  p_project jsonb,
  p_ownership jsonb
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select (p_project - 'courses') || jsonb_build_object(
    'courses', jsonb_build_array(
      (course.value - 'modules') || jsonb_build_object(
        'modules', jsonb_build_array(
          (module_value.value - 'lessons') || jsonb_build_object(
            'lessons', jsonb_build_array(lesson.value)
          )
        )
      )
    )
  )
  from jsonb_array_elements(coalesce(p_project->'courses', '[]'::jsonb)) course(value)
  cross join lateral jsonb_array_elements(
    coalesce(course.value->'modules', '[]'::jsonb)
  ) module_value(value)
  cross join lateral jsonb_array_elements(
    coalesce(module_value.value->'lessons', '[]'::jsonb)
  ) lesson(value)
  where course.value->>'id' = p_ownership->>'courseId'
    and module_value.value->>'id' = p_ownership->>'moduleId'
    and lesson.value->>'id' = p_ownership->>'lessonId'
  limit 1;
$$;

create or replace function private.authoring_continuity_slice(
  p_run_id uuid,
  p_part_id uuid
)
returns jsonb
language sql
stable
set search_path = pg_catalog, private, extensions
as $$
  with recursive target as (
    select part.* from private.authoring_parts part where part.id = p_part_id
  ), dependency_keys(part_key) as (
    select dependency
    from target
    cross join lateral jsonb_array_elements_text(
      coalesce(target.outline->'dependsOnPartKeys', '[]'::jsonb)
    ) dependency
    union
    select nested_dependency
    from dependency_keys current
    join private.authoring_parts part
      on part.run_id = p_run_id and part.part_key = current.part_key
    cross join lateral jsonb_array_elements_text(
      coalesce(part.outline->'dependsOnPartKeys', '[]'::jsonb)
    ) nested_dependency
  ), dependencies as (
    select part.*
    from private.authoring_parts part
    where part.run_id = p_run_id
      and part.status = 'approved'
      and part.part_key in (select part_key from dependency_keys)
  ), state_rows as (
    select field.name, value
    from dependencies part
    cross join lateral (values
      ('introducedTermIds'), ('usedClaimIds'), ('coveredOutcomeIds'), ('resolvedErrorIds')
    ) field(name)
    cross join lateral jsonb_array_elements_text(
      coalesce(part.submission_meta->'stateDelta'->field.name, '[]'::jsonb)
    ) item(value)
  ), dependency_microsequences as (
    select distinct microsequence_id as id
    from dependencies part
    cross join lateral jsonb_array_elements_text(
      coalesce(part.specification->'ownership'->'microsequenceIds', '[]'::jsonb)
    ) item(microsequence_id)
  ), external_microsequences as (
    select microsequence
    from dependencies part
    cross join lateral jsonb_array_elements(
      coalesce(part.specification->'structure'->'microsequences', '[]'::jsonb)
    ) item(microsequence)
  ), founded_microsequences(id) as (
    select distinct card->>'microsequenceId'
    from dependencies part
    cross join lateral jsonb_array_elements(
      coalesce(part.specification->'cardPlan', '[]'::jsonb)
    ) item(card)
    where card->>'learningFunction' in ('foundation', 'worked_example')
    union
    select microsequence->>'id'
    from external_microsequences
    join founded_microsequences founded on exists (
      select 1 from jsonb_array_elements_text(
        coalesce(microsequence->'dependsOn', '[]'::jsonb)
      ) dependency(id)
      where dependency.id = founded.id
    )
  ), all_approved as (
    select part.part_key, part.fragment_hash, part.submission_meta->'stateDelta' as delta
    from private.authoring_parts part
    where part.run_id = p_run_id and part.status = 'approved'
    order by part.position
  )
  select jsonb_build_object(
    'approvedParts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', part.part_key,
        'fragmentHash', part.fragment_hash
      ) order by part.position)
      from dependencies part
    ), '[]'::jsonb),
    'stateDelta', jsonb_build_object(
      'introducedTermIds', coalesce((select jsonb_agg(to_jsonb(value) order by value)
        from (select distinct value from state_rows where name = 'introducedTermIds') valueset), '[]'::jsonb),
      'usedClaimIds', coalesce((select jsonb_agg(to_jsonb(value) order by value)
        from (select distinct value from state_rows where name = 'usedClaimIds') valueset), '[]'::jsonb),
      'coveredOutcomeIds', coalesce((select jsonb_agg(to_jsonb(value) order by value)
        from (select distinct value from state_rows where name = 'coveredOutcomeIds') valueset), '[]'::jsonb),
      'resolvedErrorIds', coalesce((select jsonb_agg(to_jsonb(value) order by value)
        from (select distinct value from state_rows where name = 'resolvedErrorIds') valueset), '[]'::jsonb),
      'notes', '[]'::jsonb
    ),
    'dependencyMicrosequenceIds', coalesce((
      select jsonb_agg(to_jsonb(id) order by id) from dependency_microsequences
    ), '[]'::jsonb),
    'foundedMicrosequenceIds', coalesce((
      select jsonb_agg(to_jsonb(id) order by id) from founded_microsequences
    ), '[]'::jsonb),
    'stateHash', encode(extensions.digest(convert_to(coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', part_key, 'fragmentHash', fragment_hash, 'stateDelta', delta
      ) order by part_key) from all_approved
    ), '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
  );
$$;

create or replace function public.get_next_authoring_part(
  p_run_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_part private.authoring_parts%rowtype;
begin
  perform private.require_service_role();
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id;

  if not found or not private.authoring_run_is_accessible(p_actor_id, v_run, 'read') then
    raise exception 'Execução de autoria não encontrada.' using errcode = '42501';
  end if;

  select * into v_part
  from private.authoring_parts part
  where part.run_id = v_run.id and part.status <> 'approved'
  order by part.position
  limit 1;

  return jsonb_build_object(
    'runId', v_run.id,
    'status', v_run.status,
    'brief', v_run.brief,
    'planHash', v_run.plan_hash,
    'ledgerProgress', case
      when v_run.plan->'ledgerManifest' is null then null
      else (
        select jsonb_object_agg(section.name, jsonb_build_object(
          'expectedChunks', (v_run.plan->'ledgerManifest'->'sections'->section.name->>'chunkCount')::integer,
          'expectedItems', (v_run.plan->'ledgerManifest'->'sections'->section.name->>'itemCount')::integer,
          'receivedChunks', (select count(*) from private.authoring_ledger_chunks chunk
            where chunk.run_id = v_run.id and chunk.section = section.name),
          'receivedItems', (select coalesce(sum(chunk.item_count), 0) from private.authoring_ledger_chunks chunk
            where chunk.run_id = v_run.id and chunk.section = section.name),
          'missingPositions', coalesce((
            select jsonb_agg(expected.position order by expected.position)
            from generate_series(
              0,
              (v_run.plan->'ledgerManifest'->'sections'->section.name->>'chunkCount')::integer - 1
            ) expected(position)
            where not exists (
              select 1 from private.authoring_ledger_chunks chunk
              where chunk.run_id = v_run.id and chunk.section = section.name
                and chunk.position = expected.position
            )
          ), '[]'::jsonb)
        ))
        from (values ('sources'), ('claims'), ('terms')) section(name)
      )
    end,
    'nextAction', case
      when not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
        then 'upload_ledger'
      when v_part.id is null then null
      when v_part.specification is null then 'specify_part'
      else 'build_part'
    end,
    'plan', jsonb_build_object(
      'ledgerManifest', v_run.plan->'ledgerManifest',
      'ledgerFinalized', coalesce((v_run.plan->>'ledgerFinalized')::boolean, false),
      'ledgerHash', v_run.plan->>'ledgerHash',
      'project', case when v_part.specification is null
        then private.authoring_project_slice(
          v_run.plan->'project', v_part.outline->'ownership'
        ) else null end,
      'ledger', case
        when not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
          or v_part.id is null then '{}'::jsonb else
        private.authoring_ledger_slice(
          v_run.id, coalesce(v_part.specification, v_part.outline), v_part.part_key
        )
      end,
      'learningOutcomes', coalesce((
        select jsonb_agg(outcome)
        from jsonb_array_elements(
          coalesce(v_run.plan->'learningOutcomes', '[]'::jsonb)
        ) outcome
        where outcome->>'id' in (
          select outcome_id
          from jsonb_array_elements_text(
            coalesce(v_part.outline->'outcomeIds', '[]'::jsonb)
          ) outcome_id
        )
      ), '[]'::jsonb)
    ),
    'continuity', case when v_part.id is null then jsonb_build_object(
      'approvedParts', '[]'::jsonb,
      'stateDelta', jsonb_build_object(
        'introducedTermIds', '[]'::jsonb, 'usedClaimIds', '[]'::jsonb,
        'coveredOutcomeIds', '[]'::jsonb, 'resolvedErrorIds', '[]'::jsonb,
        'notes', '[]'::jsonb
      ),
      'dependencyMicrosequenceIds', '[]'::jsonb,
      'foundedMicrosequenceIds', '[]'::jsonb,
      'stateHash', encode(extensions.digest(convert_to('[]', 'UTF8'), 'sha256'), 'hex')
    ) else private.authoring_continuity_slice(v_run.id, v_part.id) end,
    'nextPart', case
      when not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
        or v_part.id is null then null else jsonb_build_object(
      'partKey', v_part.part_key,
      'position', v_part.position,
      'title', v_part.title,
      'status', v_part.status,
      'blockedPreviousStatus', v_part.blocked_previous_status,
      'attempt', v_part.attempt,
      'outline', v_part.outline,
      'specification', v_part.specification,
      'specificationHash', v_part.submission_meta->>'specificationHash'
    ) end,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'partKey', part.part_key,
        'position', part.position,
        'status', part.status,
        'attempt', part.attempt,
        'outline', case when part.id = v_part.id then part.outline else null end,
        'specification', case when part.id = v_part.id then part.specification else null end,
        'submissionMeta', case when part.status = 'approved'
          then jsonb_build_object(
            'stateDelta', coalesce(part.submission_meta->'stateDelta', '{}'::jsonb)
          )
          else '{}'::jsonb
        end,
        'fragmentHash', part.fragment_hash,
        'audits', case when part.id = v_part.id then coalesce((
          select jsonb_agg(jsonb_build_object(
            'attempt', report.attempt,
            'decision', report.decision,
            'findings', report.findings,
            'createdAt', report.created_at
          ) order by report.attempt)
          from private.authoring_audit_reports report
          where report.part_id = part.id
        ), '[]'::jsonb) else '[]'::jsonb end
      ) order by part.position)
      from private.authoring_parts part
      where part.run_id = v_run.id and part.id = v_part.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_authoring_part_submission(
  p_run_id uuid,
  p_part_key text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_part private.authoring_parts%rowtype;
begin
  perform private.require_service_role();
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id;

  if not found or not private.authoring_run_is_accessible(p_actor_id, v_run, 'read') then
    raise exception 'Execução de autoria não encontrada.' using errcode = '42501';
  end if;

  select * into v_part
  from private.authoring_parts part
  where part.run_id = v_run.id and part.part_key = p_part_key;
  if not found then
    raise exception 'Parte de autoria inexistente.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'runId', v_run.id,
    'partKey', v_part.part_key,
    'position', v_part.position,
    'title', v_part.title,
    'status', v_part.status,
    'attempt', v_part.attempt,
    'baseLedgerSha256', v_part.submission_meta->>'baseLedgerSha256',
    'fragmentHash', v_part.fragment_hash,
    'submissionSha256', v_part.fragment_hash,
    'specification', v_part.specification,
    'fragment', v_part.fragment,
    'evidence', coalesce(v_part.submission_meta->'evidence', '[]'::jsonb),
    'stateDelta', coalesce(v_part.submission_meta->'stateDelta', '{}'::jsonb),
    'submittedAt', v_part.submitted_at,
    'latestAudit', (
      select jsonb_build_object(
        'attempt', report.attempt,
        'decision', report.decision,
        'findings', report.findings,
        'reviewedBy', report.reviewed_by,
        'createdAt', report.created_at
      )
      from private.authoring_audit_reports report
      where report.part_id = v_part.id
      order by report.attempt desc
      limit 1
    )
  );
end;
$$;

create or replace function public.replay_authoring_command(
  p_actor_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_api_request_hash text,
  p_required_scope text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_hash text;
  v_result jsonb;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_api_request_hash !~ '^[a-f0-9]{64}$'
     or p_required_scope not in (
       'authoring:write', 'authoring:audit', 'catalog:publish'
     ) then
    raise exception 'Consulta idempotente inválida.' using errcode = '22023';
  end if;
  if not private.authoring_client_has_scope(p_client_id, p_actor_id, p_required_scope)
     or not private.user_can_use_authoring_scope(p_actor_id, p_required_scope) then
    raise exception 'Autorização atual insuficiente para recuperar a resposta.'
      using errcode = '42501';
  end if;

  select event.api_request_hash, event.result
  into v_hash, v_result
  from private.authoring_command_events event
  where event.actor_user_id = p_actor_id and event.request_id = p_request_id;
  if not found then
    select receipt.api_request_hash, receipt.result
    into v_hash, v_result
    from private.authoring_command_receipts receipt
    where receipt.actor_user_id = p_actor_id and receipt.request_id = p_request_id;
  end if;
  if not found or v_hash is null then return null; end if;
  if v_hash is null or v_hash <> p_api_request_hash then
    raise exception 'requestId reutilizado com conteúdo diferente.' using errcode = '22023';
  end if;
  return v_result || jsonb_build_object('idempotent', true);
end;
$$;

-- A cobrança usa a linha completa convertida para JSONB, o que inclui todos
-- os metadados e desreferencia valores TOAST. O fator 2 reserva uma margem
-- conservadora de 100% para índices, tuplas, páginas e variações físicas que
-- pg_column_size isoladamente não representa.
create or replace function private.authoring_row_storage_charge(p_row jsonb)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select (pg_column_size(p_row)::bigint + 64) * 2;
$$;

create or replace function private.authoring_acquire_storage_global_lock()
returns void
language sql
volatile
set search_path = pg_catalog
as $$
  select pg_advisory_xact_lock(hashtextextended('authoring-staging-global', 0));
$$;

create or replace function private.authoring_acquire_storage_actor_lock(
  p_actor_id uuid
)
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  if p_actor_id is null then
    raise exception 'Autor obrigatório para trava de armazenamento.'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'authoring-staging-actor:' || p_actor_id::text, 0
  ));
end;
$$;

create or replace function private.authoring_acquire_storage_locks(
  p_actor_id uuid
)
returns void
language plpgsql
volatile
set search_path = pg_catalog, private
as $$
begin
  -- A ordem é parte do protocolo de concorrência e deve permanecer global,
  -- depois autor, em toda gravação ou transição terminal.
  perform private.authoring_acquire_storage_global_lock();
  perform private.authoring_acquire_storage_actor_lock(p_actor_id);
end;
$$;

create or replace function private.authoring_run_staging_bytes(p_run_id uuid)
returns bigint
language sql
stable
set search_path = pg_catalog, private
as $$
  select coalesce((
    select
      private.authoring_row_storage_charge(to_jsonb(run))
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(part)))
          from private.authoring_parts part where part.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(chunk)))
          from private.authoring_ledger_chunks chunk where chunk.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(report)))
          from private.authoring_audit_reports report where report.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(event)))
          from private.authoring_block_events event where event.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(command)))
          from private.authoring_command_events command where command.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(stage)))
          from private.official_catalog_imports stage
          where stage.authoring_run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(stage_row)))
        from private.official_catalog_import_stage_rows stage_row
        join private.official_catalog_imports stage
          on stage.import_id = stage_row.import_id
        where stage.authoring_run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(chunk)))
        from private.official_catalog_import_chunks chunk
        join private.official_catalog_imports stage
          on stage.import_id = chunk.import_id
        where stage.authoring_run_id = run.id), 0)
    from private.authoring_runs run
    where run.id = p_run_id
  ), 0)::bigint;
$$;

create or replace function private.authoring_actor_retained_bytes(p_actor_id uuid)
returns bigint
language sql
stable
set search_path = pg_catalog, private
as $$
  select
    coalesce((select sum(private.authoring_run_staging_bytes(run.id))
      from private.authoring_runs run
      where run.created_by = p_actor_id
        and run.status in ('published', 'cancelled')), 0)
    + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(receipt)))
      from private.authoring_command_receipts receipt
      where receipt.responsible_user_id = p_actor_id), 0)
    + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(event)))
      from private.authoring_retention_events event
      where event.responsible_user_id = p_actor_id), 0);
$$;

create or replace function private.authoring_global_retained_bytes()
returns bigint
language sql
stable
set search_path = pg_catalog, private
as $$
  select
    coalesce((select sum(private.authoring_run_staging_bytes(run.id))
      from private.authoring_runs run
      where run.status in ('published', 'cancelled')), 0)
    + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(receipt)))
      from private.authoring_command_receipts receipt), 0)
    + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(event)))
      from private.authoring_retention_events event), 0);
$$;

create or replace function private.authoring_assert_staging_quota(
  p_actor_id uuid,
  p_run_id uuid,
  p_incoming_bytes bigint,
  p_replaced_bytes bigint default 0
)
returns void
language plpgsql
set search_path = pg_catalog, private
as $$
declare
  v_delta bigint := coalesce(p_incoming_bytes, 0) - coalesce(p_replaced_bytes, 0);
  v_run_bytes bigint;
  v_actor_bytes bigint;
  v_global_bytes bigint;
  v_actor_terminal_bytes bigint;
  v_global_terminal_bytes bigint;
  v_quota_actor_id uuid;
  v_run_limit bigint := coalesce(nullif(current_setting(
    'aralearn.authoring_run_quota_bytes', true
  ), '')::bigint, 33554432);
  v_actor_limit bigint := coalesce(nullif(current_setting(
    'aralearn.authoring_actor_quota_bytes', true
  ), '')::bigint, 67108864);
  v_global_limit bigint := coalesce(nullif(current_setting(
    'aralearn.authoring_global_quota_bytes', true
  ), '')::bigint, 134217728);
  v_actor_terminal_limit bigint := coalesce(nullif(current_setting(
    'aralearn.authoring_actor_terminal_quota_bytes', true
  ), '')::bigint, 67108864);
  v_global_terminal_limit bigint := coalesce(nullif(current_setting(
    'aralearn.authoring_global_terminal_quota_bytes', true
  ), '')::bigint, 134217728);
begin
  if p_actor_id is null or p_run_id is null or p_incoming_bytes < 0 or p_replaced_bytes < 0 then
    raise exception 'Parâmetros de quota de autoria inválidos.' using errcode = '22023';
  end if;
  if v_run_limit < 1 or v_actor_limit < v_run_limit
     or v_global_limit < v_actor_limit
     or v_actor_terminal_limit < 1
     or v_global_terminal_limit < v_actor_terminal_limit then
    raise exception 'Configuração de quota de autoria inválida.' using errcode = '22023';
  end if;

  select run.created_by into v_quota_actor_id
  from private.authoring_runs run
  where run.id = p_run_id;
  v_quota_actor_id := coalesce(v_quota_actor_id, p_actor_id);

  -- As duas travas tornam atômicas as verificações concorrentes de um mesmo
  -- autor e do limite global, sem bloquear leituras do fluxo.
  perform private.authoring_acquire_storage_locks(v_quota_actor_id);

  -- O tamanho da execução precisa ser lido depois das travas. Caso contrário,
  -- duas gravações concorrentes poderiam validar o mesmo retrato antigo.
  v_run_bytes := private.authoring_run_staging_bytes(p_run_id);

  select coalesce(sum(private.authoring_run_staging_bytes(run.id)), 0)::bigint
  into v_actor_bytes
  from private.authoring_runs run
  where run.created_by = v_quota_actor_id
    and run.status not in ('published', 'cancelled');

  select coalesce(sum(private.authoring_run_staging_bytes(run.id)), 0)::bigint
  into v_global_bytes
  from private.authoring_runs run
  where run.status not in ('published', 'cancelled');

  v_actor_terminal_bytes := private.authoring_actor_retained_bytes(
    v_quota_actor_id
  );
  v_global_terminal_bytes := private.authoring_global_retained_bytes();

  if v_actor_terminal_bytes >= v_actor_terminal_limit then
    raise exception 'O histórico terminal retido do autor atingiu a quota configurada.'
      using errcode = '54000';
  end if;
  if v_global_terminal_bytes >= v_global_terminal_limit then
    raise exception 'O histórico terminal retido atingiu a quota global configurada.'
      using errcode = '54000';
  end if;

  if v_run_bytes + v_delta > v_run_limit then
    raise exception 'A execução excederia a quota de staging de 32 MiB.'
      using errcode = '54000';
  end if;
  if v_actor_bytes + v_delta > v_actor_limit then
    raise exception 'O autor excederia a quota de staging de 64 MiB.'
      using errcode = '54000';
  end if;
  if v_global_bytes + v_delta > v_global_limit then
    raise exception 'O staging ativo excederia a quota global de 128 MiB.'
      using errcode = '54000';
  end if;
end;
$$;

create or replace function private.authoring_enforce_import_staging_quota()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
declare
  v_run_id uuid;
  v_actor_id uuid;
begin
  if tg_table_name = 'official_catalog_imports' then
    if new.authoring_run_id is null then
      return new;
    end if;
    if tg_op = 'UPDATE'
       and old.authoring_run_id is not distinct from new.authoring_run_id
       and old.course_payload is not distinct from new.course_payload
       and old.expected_counts is not distinct from new.expected_counts then
      return new;
    end if;
    v_run_id := new.authoring_run_id;
  else
    select stage.authoring_run_id into v_run_id
    from private.official_catalog_imports stage
    where stage.import_id = new.import_id;
    if v_run_id is null then return new; end if;
  end if;

  select run.created_by into v_actor_id
  from private.authoring_runs run
  where run.id = v_run_id;
  if v_actor_id is null then
    raise exception 'Staging de publicação sem execução de autoria válida.'
      using errcode = '23514';
  end if;
  -- O trigger é AFTER: o tamanho atual já contém a linha nova. Delta zero
  -- valida o estado físico exato e qualquer erro desfaz o chunk inteiro.
  perform private.authoring_assert_staging_quota(v_actor_id, v_run_id, 0, 0);
  return new;
end;
$$;

drop trigger if exists official_catalog_imports_authoring_quota
  on private.official_catalog_imports;
create trigger official_catalog_imports_authoring_quota
after insert or update of authoring_run_id, course_payload, expected_counts
on private.official_catalog_imports
for each row execute function private.authoring_enforce_import_staging_quota();

drop trigger if exists official_catalog_import_chunks_authoring_quota
  on private.official_catalog_import_chunks;
create trigger official_catalog_import_chunks_authoring_quota
after insert or update on private.official_catalog_import_chunks
for each row execute function private.authoring_enforce_import_staging_quota();

create or replace function private.authoring_compact_terminal_payloads(p_run_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, private, extensions
as $$
declare
  v_compacted_at timestamptz;
begin
  select run.terminal_compacted_at into v_compacted_at
  from private.authoring_runs run
  where run.id = p_run_id
  for update;
  if not found then
    raise exception 'Execução de autoria inexistente.' using errcode = 'P0002';
  end if;
  if v_compacted_at is not null then
    return;
  end if;

  -- O marcador fica em uma coluna controlada pelo servidor. Nenhum campo
  -- autoral chamado "compacted" participa da decisão, evitando tanto casts
  -- inválidos quanto um falso sinal que preserve payload volumoso.
  update private.authoring_runs run
  set brief = jsonb_build_object(
    'compacted', true,
    'originalType', jsonb_typeof(run.brief),
    'sha256', encode(digest(convert_to(run.brief::text, 'UTF8'), 'sha256'), 'hex')
  ),
      terminal_compacted_at = clock_timestamp()
  where run.id = p_run_id;

  delete from private.authoring_ledger_chunks chunk
  where chunk.run_id = p_run_id;

  update private.authoring_audit_reports report
  set findings = jsonb_build_object(
    'compacted', true,
    'originalType', jsonb_typeof(report.findings),
    'sha256', encode(digest(convert_to(report.findings::text, 'UTF8'), 'sha256'), 'hex')
  )
  where report.run_id = p_run_id;

  update private.authoring_block_events event
  set context = jsonb_build_object(
    'compacted', true,
    'sha256', encode(digest(convert_to(event.context::text, 'UTF8'), 'sha256'), 'hex')
  )
  where event.run_id = p_run_id;

  update private.authoring_parts part
  set outline = jsonb_build_object(
        'compacted', true,
        'partKey', part.part_key,
        'sha256', encode(digest(convert_to(part.outline::text, 'UTF8'), 'sha256'), 'hex')
      ),
      specification = case when part.specification is null then null else
        jsonb_strip_nulls(jsonb_build_object(
          'compacted', true,
          'partKey', part.part_key,
          'ownership', part.specification->'ownership',
          'outcomeIds', part.specification->'outcomeIds'
        )) end,
      fragment = null,
      submission_meta = jsonb_strip_nulls(jsonb_build_object(
        'compacted', true,
        'mode', part.submission_meta->'mode',
        'planHash', part.submission_meta->'planHash',
        'specificationHash', part.submission_meta->'specificationHash',
        'baseLedgerSha256', part.submission_meta->'baseLedgerSha256'
      )),
      updated_at = now()
  where part.run_id = p_run_id;

  update private.authoring_command_events command
  set result = jsonb_strip_nulls(jsonb_build_object(
    'compacted', true,
    'sha256', encode(digest(convert_to(command.result::text, 'UTF8'), 'sha256'), 'hex'),
    'status', command.result->'status',
    'runId', command.result->'runId',
    'partKey', command.result->'partKey',
    'partStatus', command.result->'partStatus',
    'attempt', command.result->'attempt',
    'decision', command.result->'decision',
    'section', command.result->'section',
    'position', command.result->'position',
    'contentHash', command.result->'contentHash',
    'fragmentHash', command.result->'fragmentHash',
    'documentHash', command.result->'documentHash',
    'courseId', command.result->'courseId',
    'publicationTarget', command.result->'publicationTarget',
    'target', command.result->'target',
    'nextAction', command.result->'nextAction',
    'ledgerHash', command.result->'ledgerHash'
  ))
  where command.run_id = p_run_id
    and pg_column_size(command.result) > 512;
end;
$$;

create or replace function private.authoring_complete_publication(
  p_run_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, private
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_course public.courses%rowtype;
  v_collection public.catalog_collections%rowtype;
begin
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id
  for update;
  if not found then
    raise exception 'Execução de autoria inexistente.' using errcode = 'P0002';
  end if;

  select * into v_course
  from public.courses course
  where course.id = p_course_id
    and course.status = 'published'
    and course.deleted_at is null
  for update;
  if not found
     or v_course.owner_id is not null
     or v_course.content_hash is distinct from v_run.document_hash
     or (
       v_run.contract_key is not null
       and v_course.contract_key is distinct from v_run.contract_key
     ) then
    raise exception 'Curso materializado incompatível com a execução.'
      using errcode = '23514';
  end if;

  if v_run.status = 'published' then
    if v_run.course_id is distinct from v_course.id then
      raise exception 'A execução já publicou outro curso.' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'status', v_run.status,
      'runId', v_run.id,
      'courseId', v_run.course_id,
      'publishedAt', v_run.published_at,
      'idempotent', true
    );
  end if;
  if v_run.status <> 'publishing' then
    raise exception 'A publicação ainda não foi preparada.' using errcode = '55000';
  end if;

  -- A passagem do staging ativo para histórico terminal precisa ser
  -- serializada com as verificações de quota. Assim nenhuma criação ou
  -- gravação valida um retrato intermediário e ultrapassa o limite retido.
  perform private.authoring_acquire_storage_locks(v_run.created_by);

  -- Todos os caminhos de conclusão, inclusive reconciliação e cancelamento
  -- após uma materialização já confirmada, obedecem à mesma regra editorial.
  -- A escolha explícita nunca muda; a automática pode cair em Outros.
  select * into v_collection
  from public.catalog_collections collection
  where collection.id = v_run.collection_id
    and collection.is_published
    and collection.deleted_at is null
  for share;
  if not found then
    if v_run.collection_explicit then
      raise exception 'A coleção escolhida não está mais disponível.'
        using errcode = 'AR422';
    end if;
    select * into v_collection
    from public.catalog_collections collection
    where collection.contract_key = 'outros'
      and collection.is_published
      and collection.deleted_at is null
    order by collection.id
    limit 1
    for share;
    if not found then
      raise exception 'A coleção escolhida não está mais disponível.'
        using errcode = 'AR422';
    end if;
    update private.authoring_runs
    set collection_id = v_collection.id,
        publication_error = case
          when publication_error->>'code' = 'collection_unavailable' then null
          else publication_error
        end,
        updated_at = now()
    where id = v_run.id
    returning * into v_run;
  end if;

  if v_run.collection_id is not null and (
    v_run.collection_explicit
    or not exists (
      select 1
      from public.catalog_collection_courses existing
      join public.catalog_collections collection
        on collection.id = existing.collection_id
       and collection.is_published
       and collection.deleted_at is null
      where existing.course_id = v_course.id
        and existing.deleted_at is null
    )
  ) then
    delete from public.catalog_collection_courses item
    where item.course_id = v_course.id;
    insert into public.catalog_collection_courses(
      collection_id, course_id, position
    ) values (
      v_run.collection_id,
      v_course.id,
      coalesce((
        select max(item.position) + 1
        from public.catalog_collection_courses item
        where item.collection_id = v_run.collection_id
          and item.deleted_at is null
      ), 0)
    );
  end if;

  -- A árvore publicada já vive nas tabelas relacionais canônicas. O staging
  -- volumoso deixa de ter utilidade assim que a publicação é confirmada.
  perform private.authoring_compact_terminal_payloads(v_run.id);

  update private.authoring_runs run
  set status = 'published',
      course_id = v_course.id,
      published_at = now(),
      plan = jsonb_strip_nulls(jsonb_build_object(
        'kind', 'published_manifest',
        'artifact', plan->'artifact',
        'version', plan->'version',
        'runId', run.id,
        'partCount', (select count(*) from private.authoring_parts part where part.run_id = run.id),
        'learningOutcomeIds', coalesce((
          select jsonb_agg(outcome->'id')
          from jsonb_array_elements(coalesce(plan->'learningOutcomes', '[]'::jsonb)) outcome
        ), '[]'::jsonb)
      )),
      validation_report = jsonb_build_object(
        'valid', true,
        'compacted', true,
        'documentHash', document_hash
      ),
      assembled_document = null,
      publication_lease_token = null,
      publication_lease_until = null,
      publication_error = null,
      revision = revision + 1,
      updated_at = now()
  where run.id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'status', v_run.status,
    'runId', v_run.id,
    'courseId', v_run.course_id,
    'publishedAt', v_run.published_at,
    'idempotent', false
  );
end;
$$;

create or replace function private.assert_authoring_publication_authority(
  p_run private.authoring_runs
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  -- O trabalho em background não herda a autorização do pedido original.
  -- As linhas que sustentam a permissão ficam protegidas durante o passo
  -- transacional para que uma revogação concorrente não passe despercebida.
  perform 1
  from private.app_role_assignments assignment
  where assignment.user_id = p_run.publication_actor_id
    and assignment.role in ('owner', 'catalog_publisher')
    and assignment.active
    and assignment.revoked_at is null
  for share;
  if not found then
    raise exception 'A permissão de publicação foi revogada.' using errcode = '42501';
  end if;

  if p_run.publication_client_id is not null then
    perform 1
    from private.authoring_api_clients client
    where client.id = p_run.publication_client_id
      and client.owner_user_id = p_run.publication_actor_id
      and client.revoked_at is null
      and (client.expires_at is null or client.expires_at > now())
      and 'catalog:publish' = any(client.scopes)
    for share;
    if not found then
      raise exception 'A credencial que iniciou a publicação não está mais autorizada.'
        using errcode = '42501';
    end if;
  end if;

  if p_run.collection_id is null then
    raise exception 'A coleção escolhida não está mais disponível.' using errcode = 'AR422';
  else
    perform 1
    from public.catalog_collections collection
    where collection.id = p_run.collection_id
      and collection.is_published
      and collection.deleted_at is null
    for share;
    if not found then
      raise exception 'A coleção escolhida não está mais disponível.' using errcode = 'AR422';
    end if;
  end if;
end;
$$;

create or replace function public.claim_authoring_publication(
  p_run_id uuid,
  p_actor_id uuid,
  p_client_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 130
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '5s'
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_retry_after integer;
  v_previous_authorized boolean;
  v_collection_id uuid;
  v_error jsonb;
begin
  perform private.require_service_role();
  if p_run_id is null or p_actor_id is null or p_lease_token is null
     or p_lease_seconds not between 30 and 140 then
    raise exception 'Lease de publicação inválida.' using errcode = '22023';
  end if;
  if not exists (select 1 from private.authoring_runs run where run.id = p_run_id) then
    raise exception 'Execução de autoria inexistente.' using errcode = 'P0002';
  end if;

  -- SKIP LOCKED impede que o polling espere o finalizador, que conserva a
  -- linha da execução bloqueada durante a materialização atômica.
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id
  for update skip locked;
  if not found then
    return jsonb_build_object(
      'status', 'publishing',
      'phase', 'finalizing',
      'runId', p_run_id,
      'leaseAcquired', false,
      'pollAfterSeconds', 3
    );
  end if;
  if not private.authoring_run_is_accessible(p_actor_id, v_run, 'publish') then
    raise exception 'Publicação não autorizada.' using errcode = '42501';
  end if;
  if not private.authoring_client_has_scope(
    p_client_id, p_actor_id, 'catalog:publish'
  ) then
    raise exception 'Escopo catalog:publish obrigatório.' using errcode = '42501';
  end if;
  if v_run.status = 'published' then
    return jsonb_build_object(
      'status', 'published', 'phase', 'complete', 'runId', v_run.id,
      'courseId', v_run.course_id, 'leaseAcquired', false, 'idempotent', true
    );
  end if;
  if v_run.status <> 'publishing' then
    raise exception 'A publicação ainda não foi preparada.' using errcode = '55000';
  end if;
  if v_run.publication_lease_until > clock_timestamp() then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from v_run.publication_lease_until - clock_timestamp()))::integer
    );
    return jsonb_build_object(
      'status', 'publishing', 'phase', 'finalizing', 'runId', v_run.id,
      'leaseAcquired', (
        v_run.publication_lease_token = p_lease_token
        and v_run.publication_actor_id = p_actor_id
        and v_run.publication_client_id is not distinct from p_client_id
      ),
      'idempotent', (
        v_run.publication_lease_token = p_lease_token
        and v_run.publication_actor_id = p_actor_id
        and v_run.publication_client_id is not distinct from p_client_id
      ),
      'leaseUntil', v_run.publication_lease_until,
      'pollAfterSeconds', least(v_retry_after, 5)
    );
  end if;

  if v_run.collection_id is null or not exists (
    select 1 from public.catalog_collections collection
    where collection.id = v_run.collection_id
      and collection.is_published and collection.deleted_at is null
  ) then
    if v_run.collection_explicit then
      v_error := jsonb_build_object(
        'kind', 'deterministic', 'code', 'collection_unavailable',
        'message', 'A coleção escolhida não está mais disponível.',
        'httpStatus', 422, 'failedAt', clock_timestamp()
      );
    else
      select collection.id into v_collection_id
      from public.catalog_collections collection
      where collection.contract_key = 'outros'
        and collection.is_published
        and collection.deleted_at is null
      for share;
      if v_collection_id is null then
        v_error := jsonb_build_object(
          'kind', 'deterministic', 'code', 'collection_unavailable',
          'message', 'Nenhuma coleção pública está disponível para o curso.',
          'httpStatus', 422, 'failedAt', clock_timestamp()
        );
      else
        update private.authoring_runs run
        set collection_id = v_collection_id,
            publication_error = case
              when publication_error->>'code' = 'collection_unavailable' then null
              else publication_error
            end,
            revision = revision + 1,
            updated_at = now()
        where run.id = v_run.id
        returning * into v_run;
      end if;
    end if;
  end if;
  if v_error is not null then
    update private.authoring_runs run
    set publication_error = v_error,
        publication_lease_token = null,
        publication_lease_until = null,
        revision = revision + 1,
        updated_at = now()
    where run.id = v_run.id;
    return jsonb_build_object(
      'status', 'publishing', 'phase', 'failed', 'runId', v_run.id,
      'leaseAcquired', false, 'publicationError', v_error
    );
  end if;

  if v_run.publication_error->>'code' = 'collection_unavailable'
     and exists (
       select 1 from public.catalog_collections collection
       where collection.id = v_run.collection_id
         and collection.is_published
         and collection.deleted_at is null
     ) then
    update private.authoring_runs run
    set publication_error = null,
        revision = revision + 1,
        updated_at = now()
    where run.id = v_run.id
    returning * into v_run;
  end if;

  perform 1
  from private.app_role_assignments assignment
  where assignment.user_id = v_run.publication_actor_id
    and assignment.role in ('owner', 'catalog_publisher')
  for share;
  if v_run.publication_client_id is not null then
    perform 1
    from private.authoring_api_clients client
    where client.id = v_run.publication_client_id
    for share;
  end if;

  select exists (
    select 1
    from private.app_role_assignments assignment
    where assignment.user_id = v_run.publication_actor_id
      and assignment.role in ('owner', 'catalog_publisher')
      and assignment.active and assignment.revoked_at is null
  ) and (
    v_run.publication_client_id is null or exists (
      select 1 from private.authoring_api_clients client
      where client.id = v_run.publication_client_id
        and client.owner_user_id = v_run.publication_actor_id
        and client.revoked_at is null
        and (client.expires_at is null or client.expires_at > now())
        and 'catalog:publish' = any(client.scopes)
    )
  ) into v_previous_authorized;

  if v_run.publication_actor_id is distinct from p_actor_id
     or v_run.publication_client_id is distinct from p_client_id then
    if v_previous_authorized then
      raise exception 'A publicação pertence a outro publicador.' using errcode = '42501';
    end if;
    update private.authoring_runs run
    set publication_actor_id = p_actor_id,
        publication_client_id = p_client_id,
        publication_error = case
          when publication_error->>'code' in ('not_authorized', 'invalid_client') then null
          else publication_error
        end,
        revision = revision + 1,
        updated_at = now()
    where run.id = v_run.id
    returning * into v_run;
  end if;
  if v_run.publication_error->>'code' in ('not_authorized', 'invalid_client') then
    perform private.assert_authoring_publication_authority(v_run);
    update private.authoring_runs run
    set publication_error = null,
        revision = revision + 1,
        updated_at = now()
    where run.id = v_run.id
    returning * into v_run;
  end if;
  if v_run.publication_error->>'kind' = 'deterministic' then
    return jsonb_build_object(
      'status', 'publishing', 'phase', 'failed', 'runId', v_run.id,
      'leaseAcquired', false, 'publicationError', v_run.publication_error
    );
  end if;
  perform private.assert_authoring_publication_authority(v_run);

  update private.authoring_runs run
  set publication_lease_token = p_lease_token,
      publication_lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      publication_error = null,
      revision = revision + 1,
      updated_at = now()
  where run.id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'status', 'publishing', 'phase', 'finalizing', 'runId', v_run.id,
    'leaseAcquired', true,
    'leaseUntil', v_run.publication_lease_until,
    'pollAfterSeconds', 3
  );
end;
$$;

create or replace function public.record_authoring_publication_failure(
  p_run_id uuid,
  p_lease_token uuid,
  p_kind text,
  p_code text,
  p_message text,
  p_http_status integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '5s'
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_error jsonb;
begin
  perform private.require_service_role();
  if p_run_id is null or p_lease_token is null
     or p_kind is null
     or p_kind not in ('transient', 'deterministic')
     or nullif(btrim(p_code), '') is null
     or p_http_status is null
     or p_http_status not between 400 and 599 then
    raise exception 'Falha de publicação inválida.' using errcode = '22023';
  end if;
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id
  for update;
  if not found then
    raise exception 'Execução de autoria inexistente.' using errcode = 'P0002';
  end if;
  if v_run.status = 'published' then
    return jsonb_build_object(
      'status', 'published', 'phase', 'complete', 'runId', v_run.id,
      'courseId', v_run.course_id, 'recorded', false
    );
  end if;
  if v_run.status <> 'publishing'
     or v_run.publication_lease_token is distinct from p_lease_token then
    return jsonb_build_object(
      'status', v_run.status, 'runId', v_run.id,
      'recorded', false, 'superseded', true
    );
  end if;

  v_error := jsonb_build_object(
    'kind', p_kind,
    'code', left(btrim(p_code), 120),
    'message', left(coalesce(nullif(btrim(p_message), ''), 'Falha na publicação.'), 2000),
    'httpStatus', p_http_status,
    'failedAt', clock_timestamp()
  );
  update private.authoring_runs run
  set publication_lease_token = null,
      publication_lease_until = null,
      publication_error = v_error,
      revision = revision + 1,
      updated_at = now()
  where run.id = v_run.id;

  return jsonb_build_object(
    'status', 'publishing',
    'phase', case p_kind when 'deterministic' then 'failed' else 'retry' end,
    'runId', v_run.id,
    'recorded', true,
    'publicationError', v_error,
    'pollAfterSeconds', case p_kind when 'transient' then 3 else null end
  );
end;
$$;

create or replace function public.apply_authoring_command(
  p_actor_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_run_id uuid,
  p_command text,
  p_part_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
set statement_timeout = '30s'
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_request_hash text;
  v_existing private.authoring_command_events%rowtype;
  v_receipt private.authoring_command_receipts%rowtype;
  v_run private.authoring_runs%rowtype;
  v_part private.authoring_parts%rowtype;
  v_result jsonb;
  v_target text;
  v_title text;
  v_contract_key text;
  v_plan jsonb;
  v_parts jsonb;
  v_item jsonb;
  v_position integer;
  v_fragment jsonb;
  v_fragment_hash text;
  v_decision text;
  v_findings jsonb;
  v_document_hash text;
  v_course public.courses%rowtype;
  v_staging private.official_catalog_imports%rowtype;
  v_required_scope text;
  v_effective_run_id uuid := p_run_id;
  v_delta_field text;
  v_delta_values jsonb;
  v_outline jsonb;
  v_specification jsonb;
  v_specification_hash text;
  v_collection_id uuid;
  v_api_request_hash text;
  v_ledger_manifest jsonb;
  v_ledger jsonb;
  v_ledger_hash text;
  v_section text;
  v_chunk_position integer;
  v_expected_chunks integer;
  v_expected_items integer;
  v_publication_intent text;
  v_base_course_id uuid;
  v_base_content_hash text;
  v_response_bytes bigint;
  v_block_context jsonb;
  v_expected_revision bigint;
  v_previous_authorized boolean;
  v_submission_meta jsonb;
begin
  perform private.require_service_role();

  if p_actor_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or (p_run_id is null and p_command not in ('create_run', 'import_document'))
     or p_command is null
     or p_command not in (
      'create_run', 'set_plan', 'put_ledger_chunk', 'finalize_plan',
      'set_part_specification', 'submit_part', 'audit_part', 'reopen_part',
       'validate', 'prepare_publish', 'import_document',
       'block', 'resume', 'cancel_run'
     ) or jsonb_typeof(v_payload) <> 'object'
     or pg_column_size(v_payload) > 33554432 then
    raise exception 'Comando de autoria inválido.' using errcode = '22023';
  end if;
  v_api_request_hash := nullif(v_payload->>'_apiRequestHash', '');
  if v_payload ? '_apiRequestHash'
     and (v_api_request_hash is null or v_api_request_hash !~ '^[a-f0-9]{64}$') then
    raise exception 'Hash da requisição da API inválido.' using errcode = '22023';
  end if;
  v_payload := v_payload - '_apiRequestHash';
  if not exists (select 1 from auth.users account where account.id = p_actor_id) then
    raise exception 'Autor inexistente.' using errcode = '23503';
  end if;

  v_required_scope := case p_command
    when 'audit_part' then 'authoring:audit'
    when 'reopen_part' then 'authoring:audit'
    when 'validate' then 'authoring:audit'
    when 'prepare_publish' then 'catalog:publish'
    when 'import_document' then 'catalog:publish'
    else 'authoring:write'
  end;
  -- A autorização atual precede inclusive a leitura idempotente. Revogar o
  -- papel ou a chave encerra imediatamente a capacidade de recuperar respostas
  -- anteriores, e um replay jamais renova a retenção da execução.
  if not private.authoring_client_has_scope(
    p_client_id, p_actor_id, v_required_scope
  ) or not private.user_can_use_authoring_scope(
    p_actor_id, v_required_scope
  ) then
    raise exception 'Escopo de autoria insuficiente.' using errcode = '42501';
  end if;

  if v_effective_run_id is null then
    v_effective_run_id := gen_random_uuid();
  end if;

  v_request_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'runId', p_run_id,
      'command', p_command,
      'partKey', p_part_key,
      'payload', v_payload
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    p_actor_id::text || ':' || p_request_id::text,
    0
  ));

  select * into v_existing
  from private.authoring_command_events event
  where event.actor_user_id = p_actor_id
    and event.request_id = p_request_id;

  if found then
    if (
      v_existing.api_request_hash is not null
      and v_api_request_hash is not null
      and v_existing.api_request_hash <> v_api_request_hash
    ) or (
      (v_existing.api_request_hash is null or v_api_request_hash is null)
      and v_existing.request_hash <> v_request_hash
    ) then
      raise exception 'requestId reutilizado com conteúdo diferente.'
        using errcode = '22023';
    end if;
    if v_existing.command = 'prepare_publish' then
      select * into v_run
      from private.authoring_runs run
      where run.id = v_existing.run_id;
      return v_existing.result
        || jsonb_build_object('document', v_run.assembled_document)
        || jsonb_build_object('idempotent', true);
    end if;
    return v_existing.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_receipt
  from private.authoring_command_receipts receipt
  where receipt.actor_user_id = p_actor_id
    and receipt.request_id = p_request_id;

  if found then
    if (
      v_receipt.api_request_hash is not null
      and v_api_request_hash is not null
      and v_receipt.api_request_hash <> v_api_request_hash
    ) or (
      (v_receipt.api_request_hash is null or v_api_request_hash is null)
      and v_receipt.request_hash <> v_request_hash
    ) then
      raise exception 'requestId reutilizado com conteúdo diferente.'
        using errcode = '22023';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  if p_command in ('create_run', 'import_document') and (
    exists (
      select 1 from private.authoring_command_receipts receipt
      where receipt.run_id = v_effective_run_id
    ) or exists (
      select 1 from private.authoring_retention_events retained
      where retained.run_id = v_effective_run_id
    )
  ) then
    raise exception 'Identificador de execução já encerrado pela retenção.'
      using errcode = '23505';
  end if;

  if p_command = 'create_run' then
    v_target := coalesce(
      nullif(v_payload->>'publicationTarget', ''),
      nullif(v_payload->>'target', ''),
      'catalog'
    );
    v_title := nullif(btrim(v_payload->>'title'), '');
    v_contract_key := nullif(btrim(v_payload->>'contractKey'), '');
    v_publication_intent := nullif(btrim(v_payload->'publicationIntent'->>'mode'), '');
    v_base_course_id := nullif(v_payload->'publicationIntent'->>'existingCourseId', '')::uuid;
    v_base_content_hash := lower(nullif(
      v_payload->'publicationIntent'->>'expectedContentHash', ''
    ));
    v_collection_id := nullif(v_payload->>'collectionId', '')::uuid;
    if v_collection_id is null and v_contract_key is not null then
      select item.collection_id into v_collection_id
      from public.courses course
      join public.catalog_collection_courses item on item.course_id = course.id
      join public.catalog_collections collection on collection.id = item.collection_id
      where course.contract_key = v_contract_key
        and course.owner_id is null
        and course.deleted_at is null
        and item.deleted_at is null
        and collection.deleted_at is null
        and collection.is_published
      order by item.position, item.collection_id
      limit 1;
    end if;
    if v_collection_id is null then
      select collection.id into v_collection_id
      from public.catalog_collections collection
      where collection.contract_key = 'outros'
        and collection.is_published
        and collection.deleted_at is null;
    end if;

    if v_target <> 'catalog' or v_title is null or v_contract_key is null
       or v_publication_intent not in ('create', 'update')
       or (v_publication_intent = 'create' and (
         v_base_course_id is not null or v_base_content_hash is not null
       ))
       or (v_publication_intent = 'update' and (
         v_base_course_id is null
         or v_base_content_hash is null
         or v_base_content_hash !~ '^[0-9a-f]{64}$'
       ))
       or jsonb_typeof(coalesce(v_payload->'brief', '{}'::jsonb)) <> 'object'
       or pg_column_size(coalesce(v_payload->'brief', '{}'::jsonb)) > 32768 then
      raise exception 'Destino e título da execução são obrigatórios.' using errcode = '22023';
    end if;
    if v_collection_id is null or not exists (
      select 1
      from public.catalog_collections collection
      where collection.id = v_collection_id
        and collection.is_published
        and collection.deleted_at is null
    ) then
      raise exception 'Coleção de catálogo inexistente ou indisponível.' using errcode = '23503';
    end if;
    if v_target = 'catalog' and not private.authoring_actor_has_role(
      p_actor_id, 'author'
    ) and not private.authoring_actor_has_role(p_actor_id, 'catalog_publisher') then
      raise exception 'Autoria de catálogo não autorizada.' using errcode = '42501';
    end if;
    if not private.authoring_client_has_scope(
      p_client_id, p_actor_id, 'authoring:write'
    ) then
      raise exception 'Escopo authoring:write obrigatório.' using errcode = '42501';
    end if;
    if v_publication_intent = 'create' and exists (
      select 1 from public.courses course
      where course.contract_key = v_contract_key
        and course.owner_id is null
        and course.deleted_at is null
    ) then
      raise exception 'Já existe curso oficial com esse identificador; use intenção update.'
        using errcode = '23505';
    end if;
    if v_publication_intent = 'update' and not exists (
      select 1 from public.courses course
      where course.id = v_base_course_id
        and course.contract_key = v_contract_key
        and course.owner_id is null
        and course.status = 'published'
        and course.deleted_at is null
        and course.content_hash = v_base_content_hash
    ) then
      raise exception 'O curso de origem não corresponde à versão esperada.'
        using errcode = '40001';
    end if;
    perform private.authoring_assert_staging_quota(
      p_actor_id, v_effective_run_id, pg_column_size(coalesce(v_payload->'brief', '{}'::jsonb))
    );
    if (select count(*) from private.authoring_runs run
        where run.created_by = p_actor_id
          and run.status not in ('published', 'cancelled')) >= 2
       or (p_client_id is not null and (select count(*) from private.authoring_runs run
        where run.api_client_id = p_client_id
          and run.status not in ('published', 'cancelled')) >= 2) then
      raise exception 'Há duas execuções de autoria ativas. Conclua ou cancele uma delas.'
        using errcode = '54000';
    end if;

    insert into private.authoring_runs(
      id, created_by, api_client_id, publication_target,
      collection_id, collection_explicit, publication_intent,
      base_course_id, base_content_hash, contract_key, title, brief
    ) values (
      v_effective_run_id, p_actor_id, p_client_id, v_target,
      v_collection_id, nullif(v_payload->>'collectionId', '') is not null,
      v_publication_intent, v_base_course_id, v_base_content_hash,
      v_contract_key, v_title, coalesce(v_payload->'brief', '{}'::jsonb)
    ) returning * into v_run;

    v_result := jsonb_build_object(
      'status', 'planning',
      'runId', v_run.id,
      'publicationTarget', v_run.publication_target
    );
  elsif p_command = 'import_document' then
    if p_client_id is not null then
      raise exception 'A importação manual exige sessão de usuário.' using errcode = '42501';
    end if;
    if exists (select 1 from private.authoring_runs run where run.id = v_effective_run_id) then
      raise exception 'A importação exige uma nova execução.' using errcode = '23505';
    end if;
    v_target := coalesce(
      nullif(v_payload->>'publicationTarget', ''),
      nullif(v_payload->>'target', ''),
      'catalog'
    );
    v_title := nullif(btrim(coalesce(
      v_payload->>'title',
      v_payload->'document'->'courses'->0->>'title',
      v_payload->'document'->'project'->>'title',
      v_payload->'document'->>'title'
    )), '');
    v_contract_key := nullif(btrim(coalesce(
      v_payload->>'contractKey',
      v_payload->'document'->'courses'->0->>'id',
      v_payload->'document'->'project'->>'id',
      v_payload->'document'->>'id'
    )), '');
    v_document_hash := lower(nullif(coalesce(
      v_payload->>'documentHash', v_payload->>'contentHash'
    ), ''));
    v_fragment := v_payload->'document';
    v_publication_intent := nullif(btrim(v_payload->'publicationIntent'->>'mode'), '');
    v_base_course_id := nullif(
      v_payload->'publicationIntent'->>'existingCourseId', ''
    )::uuid;
    v_base_content_hash := lower(nullif(
      v_payload->'publicationIntent'->>'expectedContentHash', ''
    ));
    v_collection_id := nullif(v_payload->>'collectionId', '')::uuid;
    if v_collection_id is null and v_contract_key is not null then
      select item.collection_id into v_collection_id
      from public.courses course
      join public.catalog_collection_courses item on item.course_id = course.id
      join public.catalog_collections collection on collection.id = item.collection_id
      where course.contract_key = v_contract_key
        and course.owner_id is null
        and course.deleted_at is null
        and item.deleted_at is null
        and collection.deleted_at is null
        and collection.is_published
      order by item.position, item.collection_id
      limit 1;
    end if;
    if v_collection_id is null then
      select collection.id into v_collection_id
      from public.catalog_collections collection
      where collection.contract_key = 'outros'
        and collection.is_published
        and collection.deleted_at is null;
    end if;

    if v_target <> 'catalog' or v_title is null or v_contract_key is null
       or jsonb_typeof(v_fragment) <> 'object'
       or v_document_hash is null
       or v_document_hash !~ '^[0-9a-f]{64}$'
       or v_publication_intent not in ('create', 'update')
       or (v_publication_intent = 'create' and (
         v_base_course_id is not null or v_base_content_hash is not null
       ))
       or (v_publication_intent = 'update' and (
         v_base_course_id is null
         or v_base_content_hash is null
         or v_base_content_hash !~ '^[0-9a-f]{64}$'
       )) then
      raise exception 'Documento importado inválido ou ainda não validado.'
        using errcode = '22023';
    end if;
    if v_collection_id is null or not exists (
      select 1
      from public.catalog_collections collection
      where collection.id = v_collection_id
        and collection.is_published
        and collection.deleted_at is null
    ) then
      raise exception 'Coleção de catálogo inexistente ou indisponível.' using errcode = '23503';
    end if;
    if not (
      private.has_active_app_role(p_actor_id, 'owner')
      or private.has_active_app_role(p_actor_id, 'catalog_publisher')
    ) then
      raise exception 'Importação no catálogo não autorizada.' using errcode = '42501';
    end if;
    if not private.authoring_client_has_scope(
      p_client_id, p_actor_id, 'catalog:publish'
    ) then
      raise exception 'Escopo catalog:publish obrigatório.' using errcode = '42501';
    end if;
    if v_publication_intent = 'create' and exists (
      select 1 from public.courses course
      where course.contract_key = v_contract_key
        and course.owner_id is null
        and course.deleted_at is null
    ) then
      raise exception 'Já existe curso oficial com esse identificador; use intenção update.'
        using errcode = '23505';
    end if;
    if v_publication_intent = 'update' and not exists (
      select 1 from public.courses course
      where course.id = v_base_course_id
        and course.contract_key = v_contract_key
        and course.owner_id is null
        and course.status = 'published'
        and course.deleted_at is null
        and course.content_hash = v_base_content_hash
    ) then
      raise exception 'O curso de origem não corresponde à versão esperada.'
        using errcode = '40001';
    end if;
    perform private.authoring_assert_staging_quota(
      p_actor_id, v_effective_run_id, pg_column_size(v_fragment)
    );
    if (select count(*) from private.authoring_runs run
        where run.created_by = p_actor_id
          and run.status not in ('published', 'cancelled')) >= 2
       or (p_client_id is not null and (select count(*) from private.authoring_runs run
        where run.api_client_id = p_client_id
          and run.status not in ('published', 'cancelled')) >= 2) then
      raise exception 'Há duas execuções de autoria ativas. Conclua ou cancele uma delas.'
        using errcode = '54000';
    end if;

    insert into private.authoring_runs(
      id, created_by, api_client_id, publication_target, collection_id, collection_explicit,
      publication_intent, contract_key, title, status, plan, plan_hash, validation_report,
      base_course_id, base_content_hash, document_hash, assembled_document, validated_at
    ) values (
      v_effective_run_id, p_actor_id, p_client_id, v_target,
      v_collection_id, nullif(v_payload->>'collectionId', '') is not null,
      v_publication_intent, v_contract_key, v_title, 'validated',
      jsonb_build_object('kind', 'document_import', 'parts', 1),
      encode(extensions.digest(convert_to('document_import', 'UTF8'), 'sha256'), 'hex'),
      coalesce(v_payload->'validation', jsonb_build_object(
        'valid', true,
        'source', 'edge_contract_and_relational_validation'
      )),
      v_base_course_id, v_base_content_hash, v_document_hash, v_fragment, now()
    ) returning * into v_run;

    insert into private.authoring_parts(
      run_id, part_key, position, title, outline, specification, fragment,
      fragment_hash, status, attempt, submitted_at, approved_at
    ) values (
      v_effective_run_id, 'document', 0, v_title,
      jsonb_build_object(
        'key', 'document', 'title', v_title,
        'boundary', 'Documento integral validado',
        'cutReason', 'Importação administrativa',
        'dependsOnPartKeys', jsonb_build_array(),
        'ownership', jsonb_build_object(),
        'cardIds', jsonb_build_array(),
        'outcomeIds', jsonb_build_array()
      ),
      jsonb_build_object('kind', 'document_import'),
      null,
      v_document_hash,
      'approved', 1, now(), now()
    );

    v_result := jsonb_build_object(
      'status', 'validated',
      'runId', v_run.id,
      'documentHash', v_document_hash,
      'publicationTarget', v_target
    );
  else
    select * into v_run
    from private.authoring_runs run
    where run.id = v_effective_run_id
    for update;

    if not found then
      raise exception 'Execução de autoria inexistente.' using errcode = 'P0002';
    end if;

    if not private.authoring_client_has_scope(
      p_client_id, p_actor_id, v_required_scope
    ) then
      raise exception 'Escopo de autoria insuficiente.' using errcode = '42501';
    end if;

    if p_command in ('audit_part', 'reopen_part', 'validate') then
      if not private.authoring_run_is_accessible(p_actor_id, v_run, 'audit') then
        raise exception 'Revisão não autorizada.' using errcode = '42501';
      end if;
    elsif p_command = 'prepare_publish' then
      if not private.authoring_run_is_accessible(p_actor_id, v_run, 'publish') then
        raise exception 'Publicação não autorizada.' using errcode = '42501';
      end if;
    elsif not private.authoring_run_is_accessible(p_actor_id, v_run, 'write') then
      raise exception 'Alteração de autoria não autorizada.' using errcode = '42501';
    end if;

    if p_command = 'set_plan' then
      if v_run.status <> 'planning' then
        raise exception 'O plano só pode ser definido durante planning.' using errcode = '55000';
      end if;
      v_plan := coalesce(v_payload->'plan', v_payload);
      v_parts := coalesce(v_payload->'parts', v_plan->'parts');
      v_ledger_manifest := v_plan->'ledgerManifest';
      v_contract_key := nullif(btrim(v_plan->'project'->'courses'->0->>'id'), '');
      if jsonb_typeof(v_plan) <> 'object'
         or jsonb_typeof(v_parts) <> 'array'
         or jsonb_array_length(v_parts) not between 1 and 256
         or jsonb_typeof(v_plan->'learningOutcomes') <> 'array'
         or jsonb_array_length(v_plan->'learningOutcomes') = 0
         or exists (
           select 1
           from jsonb_array_elements(v_plan->'learningOutcomes') outcome
           where jsonb_typeof(outcome) <> 'object'
              or nullif(outcome->>'id', '') is null
         )
         or (
           select count(*) <> count(distinct outcome->>'id')
           from jsonb_array_elements(v_plan->'learningOutcomes') outcome
         )
         or jsonb_typeof(v_ledger_manifest) <> 'object'
         or v_contract_key is null
         or v_ledger_manifest->>'artifact' <> 'aralearn.course-ledger-manifest'
         or v_ledger_manifest->>'runId' <> v_run.id::text
         or (v_ledger_manifest->>'version')::integer <> 1
         or jsonb_typeof(v_ledger_manifest->'sections') <> 'object'
         or (select count(*) from jsonb_object_keys(v_ledger_manifest->'sections')) <> 3
         or exists (
           select 1
           from jsonb_each(v_ledger_manifest->'sections') section
           where section.key not in ('sources', 'claims', 'terms')
              or jsonb_typeof(section.value) <> 'object'
              or jsonb_typeof(section.value->'chunkCount') <> 'number'
              or jsonb_typeof(section.value->'itemCount') <> 'number'
              or (section.value->>'chunkCount')::numeric
                   <> trunc((section.value->>'chunkCount')::numeric)
              or (section.value->>'itemCount')::numeric
                   <> trunc((section.value->>'itemCount')::numeric)
              or (section.value->>'chunkCount')::integer not between 0 and 1000
              or (section.value->>'itemCount')::integer not between 0 and 100000
              or ((section.value->>'chunkCount')::integer = 0)
                   <> ((section.value->>'itemCount')::integer = 0)
         ) then
        raise exception 'Plano sem partes válidas.' using errcode = '22023';
      end if;
      if v_run.contract_key is not null and v_run.contract_key <> v_contract_key then
        raise exception 'O identificador do curso não pode mudar durante a execução.'
          using errcode = '23514';
      end if;
      if v_run.publication_intent = 'create' and exists (
        select 1 from public.courses course
        where course.contract_key = v_contract_key
          and course.owner_id is null and course.deleted_at is null
      ) then
        raise exception 'O identificador do novo curso passou a existir durante o planejamento.'
          using errcode = '23505';
      end if;
      if v_run.publication_intent = 'update' and not exists (
        select 1 from public.courses course
        where course.id = v_run.base_course_id
          and course.contract_key = v_contract_key
          and course.owner_id is null
          and course.status = 'published'
          and course.deleted_at is null
          and course.content_hash = v_run.base_content_hash
      ) then
        raise exception 'A versão oficial mudou durante o planejamento.' using errcode = '40001';
      end if;
      v_collection_id := v_run.collection_id;
      if not v_run.collection_explicit then
        select item.collection_id into v_collection_id
        from public.courses course
        join public.catalog_collection_courses item on item.course_id = course.id
        join public.catalog_collections collection on collection.id = item.collection_id
        where course.contract_key = v_contract_key
          and course.owner_id is null
          and course.deleted_at is null
          and item.deleted_at is null
          and collection.deleted_at is null
          and collection.is_published
        order by item.position, item.collection_id
        limit 1;
        v_collection_id := coalesce(v_collection_id, v_run.collection_id);
      end if;

      if exists (
        select 1
        from jsonb_array_elements(v_parts) part
        cross join lateral jsonb_array_elements_text(
          coalesce(part->'outcomeIds', '[]'::jsonb)
        ) outcome_id
        where outcome_id not in (
          select outcome->>'id'
          from jsonb_array_elements(v_plan->'learningOutcomes') outcome
        )
      ) or exists (
        select 1
        from jsonb_array_elements(v_plan->'learningOutcomes') outcome
        where not exists (
          select 1
          from jsonb_array_elements(v_parts) part
          cross join lateral jsonb_array_elements_text(
            coalesce(part->'outcomeIds', '[]'::jsonb)
          ) outcome_id
          where outcome_id = outcome->>'id'
        )
      ) or (
        select count(*) <> count(distinct card_id)
        from jsonb_array_elements(v_parts) part
        cross join lateral jsonb_array_elements_text(
          coalesce(part->'cardIds', '[]'::jsonb)
        ) card_id
      ) then
        raise exception 'Cards e resultados do plano devem ser únicos e integralmente atribuídos.'
          using errcode = '22023';
      end if;
      perform private.authoring_assert_staging_quota(
        p_actor_id, v_run.id, pg_column_size(v_plan) + pg_column_size(v_parts),
        coalesce(pg_column_size(v_run.plan), 0)
      );

      v_position := 0;
      for v_item in select value from jsonb_array_elements(v_parts)
      loop
        if jsonb_typeof(v_item) <> 'object'
           or (select count(*) from jsonb_object_keys(v_item)) <> 8
           or exists (select 1 from jsonb_object_keys(v_item) field where field not in (
             'key', 'title', 'boundary', 'cutReason', 'dependsOnPartKeys',
             'ownership', 'cardIds', 'outcomeIds'
           ))
           or nullif(btrim(v_item->>'key'), '') is null
           or nullif(btrim(v_item->>'title'), '') is null
           or nullif(btrim(v_item->>'boundary'), '') is null
           or nullif(btrim(v_item->>'cutReason'), '') is null
           or jsonb_typeof(v_item->'ownership') <> 'object'
           or jsonb_typeof(v_item->'dependsOnPartKeys') <> 'array'
           or jsonb_typeof(v_item->'cardIds') <> 'array'
           or jsonb_array_length(v_item->'cardIds') = 0
           or jsonb_typeof(v_item->'outcomeIds') <> 'array'
           or jsonb_array_length(v_item->'outcomeIds') = 0
           or exists (
             select 1 from jsonb_array_elements(v_item->'cardIds') value
             where jsonb_typeof(value) <> 'string' or nullif(value #>> '{}', '') is null
           )
           or exists (
             select 1 from jsonb_array_elements(v_item->'outcomeIds') value
             where jsonb_typeof(value) <> 'string' or nullif(value #>> '{}', '') is null
           ) then
          raise exception 'Parte do plano inválida na posição %.', v_position
            using errcode = '22023';
        end if;
        v_outline := jsonb_build_object(
          'key', btrim(v_item->>'key'),
          'title', btrim(v_item->>'title'),
          'boundary', btrim(v_item->>'boundary'),
          'cutReason', btrim(v_item->>'cutReason'),
          'dependsOnPartKeys', v_item->'dependsOnPartKeys',
          'ownership', v_item->'ownership',
          'cardIds', v_item->'cardIds',
          'outcomeIds', v_item->'outcomeIds'
        );
        insert into private.authoring_parts(
          id, run_id, part_key, position, title, outline, specification
        ) values (
          gen_random_uuid(),
          v_run.id,
          btrim(v_item->>'key'),
          v_position,
          btrim(v_item->>'title'),
          v_outline,
          null
        );
        v_position := v_position + 1;
      end loop;

      update private.authoring_runs
      set status = 'building',
          plan = v_plan || jsonb_build_object('ledgerFinalized', false),
          contract_key = v_contract_key,
          collection_id = v_collection_id,
          plan_hash = encode(extensions.digest(convert_to(v_plan::text, 'UTF8'), 'sha256'), 'hex'),
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id
      returning * into v_run;

      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'partCount', v_position,
        'nextPartKey', v_parts->0->>'key',
        'nextAction', 'upload_ledger',
        'ledgerManifest', v_ledger_manifest
      );
    elsif p_command = 'put_ledger_chunk' then
      if v_run.status <> 'building'
         or coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
         or exists (
           select 1 from private.authoring_parts part
           where part.run_id = v_run.id
             and (part.specification is not null or part.attempt > 0)
         ) then
        raise exception 'O ledger não aceita novos chunks no estado atual.'
          using errcode = '55000';
      end if;
      if coalesce(v_payload->>'planHash', '') <> coalesce(v_run.plan_hash, '') then
        raise exception 'O plano usado para enviar o ledger ficou desatualizado.'
          using errcode = '40001';
      end if;
      v_section := nullif(btrim(v_payload->>'section'), '');
      if jsonb_typeof(v_payload->'position') <> 'number'
         or (v_payload->>'position')::numeric <> trunc((v_payload->>'position')::numeric) then
        raise exception 'Posição do chunk inválida.' using errcode = '22023';
      end if;
      v_chunk_position := (v_payload->>'position')::integer;
      v_ledger_manifest := v_run.plan->'ledgerManifest';
      if v_section not in ('sources', 'claims', 'terms')
         or v_chunk_position < 0
         or v_chunk_position >= (v_ledger_manifest->'sections'->v_section->>'chunkCount')::integer
         or jsonb_typeof(v_payload->'items') <> 'array'
         or jsonb_array_length(v_payload->'items') = 0
         or pg_column_size(v_payload->'items') > 65536
         or exists (
           select 1 from jsonb_array_elements(v_payload->'items') item
           where jsonb_typeof(item) <> 'object'
         ) then
        raise exception 'Chunk do ledger incompatível com o manifesto.' using errcode = '22023';
      end if;
      if (v_section = 'sources' and exists (
        select 1 from jsonb_array_elements(v_payload->'items') item
        where nullif(btrim(item->>'sourceId'), '') is null
          or nullif(btrim(item->>'title'), '') is null
          or nullif(btrim(item->>'locator'), '') is null
          or nullif(btrim(item->>'excerpt'), '') is null
          or item->>'kind' not in (
            'attachment', 'book', 'article', 'standard', 'documentation',
            'web', 'dataset', 'other'
          )
          or item->>'stability' not in ('stable', 'versioned', 'volatile')
          or exists (select 1 from jsonb_object_keys(item) field where field not in (
            'sourceId', 'title', 'kind', 'locator', 'excerpt', 'stability',
            'author', 'usageNotes'
          ))
      )) or (v_section = 'claims' and exists (
        select 1 from jsonb_array_elements(v_payload->'items') item
        where nullif(btrim(item->>'claimId'), '') is null
          or nullif(btrim(item->>'statement'), '') is null
          or nullif(btrim(item->>'support'), '') is null
          or item->>'confidence' not in ('high', 'medium', 'low')
          or jsonb_typeof(item->'sourceIds') <> 'array'
          or jsonb_array_length(item->'sourceIds') = 0
          or jsonb_typeof(coalesce(item->'allowedPartKeys', '[]'::jsonb)) <> 'array'
          or exists (select 1 from jsonb_object_keys(item) field where field not in (
            'claimId', 'statement', 'sourceIds', 'support', 'confidence', 'allowedPartKeys'
          ))
      )) or (v_section = 'terms' and exists (
        select 1 from jsonb_array_elements(v_payload->'items') item
        where nullif(btrim(item->>'termId'), '') is null
          or nullif(btrim(item->>'form'), '') is null
          or nullif(btrim(item->>'language'), '') is null
          or nullif(btrim(item->>'explanation'), '') is null
          or nullif(btrim(item->>'firstTeachingCardId'), '') is null
          or jsonb_typeof(coalesce(item->'requiredByCardIds', '[]'::jsonb)) <> 'array'
          or jsonb_typeof(coalesce(item->'sourceIds', '[]'::jsonb)) <> 'array'
          or exists (select 1 from jsonb_object_keys(item) field where field not in (
            'termId', 'form', 'language', 'explanation', 'gloss',
            'firstTeachingCardId', 'requiredByCardIds', 'sourceIds'
          ))
      )) then
        raise exception 'Chunk do ledger contém itens inválidos.' using errcode = '22023';
      end if;
      v_ledger_hash := encode(extensions.digest(
        convert_to((v_payload->'items')::text, 'UTF8'), 'sha256'
      ), 'hex');
      perform private.authoring_assert_staging_quota(
        p_actor_id,
        v_run.id,
        pg_column_size(v_payload->'items'),
        coalesce((select pg_column_size(chunk.items)
          from private.authoring_ledger_chunks chunk
          where chunk.run_id = v_run.id
            and chunk.section = v_section
            and chunk.position = v_chunk_position), 0)
      );
      insert into private.authoring_ledger_chunks(
        run_id, section, position, items, content_hash
      ) values (
        v_run.id, v_section, v_chunk_position, v_payload->'items', v_ledger_hash
      )
      on conflict(run_id, section, position) do update
      set items = excluded.items,
          content_hash = excluded.content_hash,
          updated_at = now()
      where private.authoring_ledger_chunks.content_hash = excluded.content_hash;
      if not found then
        raise exception 'A posição do chunk já contém outro conteúdo.'
          using errcode = '23505';
      end if;
      update private.authoring_runs
      set revision = revision + 1, updated_at = now()
      where id = v_run.id returning * into v_run;
      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'section', v_section,
        'position', v_chunk_position,
        'itemCount', jsonb_array_length(v_payload->'items'),
        'contentHash', v_ledger_hash,
        'nextAction', 'upload_ledger'
      );
    elsif p_command = 'finalize_plan' then
      if v_run.status <> 'building'
         or coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
         or exists (
           select 1 from private.authoring_parts part
           where part.run_id = v_run.id
             and (part.specification is not null or part.attempt > 0)
         ) then
        raise exception 'O ledger não pode ser finalizado no estado atual.'
          using errcode = '55000';
      end if;
      if coalesce(v_payload->>'planHash', '') <> coalesce(v_run.plan_hash, '') then
        raise exception 'O plano usado para finalizar o ledger ficou desatualizado.'
          using errcode = '40001';
      end if;
      v_ledger_manifest := v_run.plan->'ledgerManifest';
      if jsonb_array_length(coalesce(v_ledger_manifest->'openIssues', '[]'::jsonb)) <> 0 then
        raise exception 'O plano ainda contém pendências abertas.' using errcode = '23514';
      end if;
      for v_section in select unnest(array['sources', 'claims', 'terms'])
      loop
        v_expected_chunks := (v_ledger_manifest->'sections'->v_section->>'chunkCount')::integer;
        v_expected_items := (v_ledger_manifest->'sections'->v_section->>'itemCount')::integer;
        if (select count(*) from private.authoring_ledger_chunks chunk
            where chunk.run_id = v_run.id and chunk.section = v_section) <> v_expected_chunks
           or (select coalesce(sum(chunk.item_count), 0) from private.authoring_ledger_chunks chunk
               where chunk.run_id = v_run.id and chunk.section = v_section) <> v_expected_items
           or exists (
             select 1 from generate_series(0, greatest(v_expected_chunks - 1, -1)) expected(position)
             where not exists (
               select 1 from private.authoring_ledger_chunks chunk
               where chunk.run_id = v_run.id and chunk.section = v_section
                 and chunk.position = expected.position
             )
           ) then
          raise exception 'Ledger incompleto na seção %.', v_section
            using errcode = '22023';
        end if;
      end loop;
      v_ledger := private.authoring_ledger_document(v_run.id);
      if exists (
        select 1 from jsonb_array_elements(v_ledger->'sources') source
        where nullif(source->>'sourceId', '') is null
      ) or (
        select count(*) <> count(distinct source->>'sourceId')
        from jsonb_array_elements(v_ledger->'sources') source
      ) or exists (
        select 1 from jsonb_array_elements(v_ledger->'claims') claim
        where nullif(claim->>'claimId', '') is null
          or jsonb_typeof(claim->'sourceIds') <> 'array'
          or exists (
            select 1 from jsonb_array_elements_text(claim->'sourceIds') source_id
            where source_id not in (
              select source->>'sourceId' from jsonb_array_elements(v_ledger->'sources') source
            )
          )
      ) or (
        select count(*) <> count(distinct claim->>'claimId')
        from jsonb_array_elements(v_ledger->'claims') claim
      ) or exists (
        select 1 from jsonb_array_elements(v_ledger->'claims') claim
        cross join lateral jsonb_array_elements_text(
          coalesce(claim->'allowedPartKeys', '[]'::jsonb)
        ) allowed_part(part_key)
        where allowed_part.part_key not in (
          select planned_part->>'key' from jsonb_array_elements(v_run.plan->'parts') planned_part
        )
      ) or exists (
        select 1 from jsonb_array_elements(v_ledger->'terms') term
        where nullif(term->>'termId', '') is null
          or nullif(term->>'firstTeachingCardId', '') is null
          or term->>'firstTeachingCardId' not in (
            select card_id
            from jsonb_array_elements(v_run.plan->'parts') part
            cross join lateral jsonb_array_elements_text(part->'cardIds') card_id
          )
          or exists (
            select 1 from jsonb_array_elements_text(coalesce(term->'requiredByCardIds', '[]'::jsonb)) card_id
            where card_id not in (
              select planned_card_id
              from jsonb_array_elements(v_run.plan->'parts') part
              cross join lateral jsonb_array_elements_text(part->'cardIds') planned_card_id
            )
          )
          or exists (
            select 1 from jsonb_array_elements_text(coalesce(term->'sourceIds', '[]'::jsonb)) source_id
            where source_id not in (
              select source->>'sourceId' from jsonb_array_elements(v_ledger->'sources') source
            )
          )
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(term->'requiredByCardIds', '[]'::jsonb)) required(card_id)
            where (
              select part_ord * 1000000 + card_ord
              from jsonb_array_elements(v_run.plan->'parts') with ordinality p(part, part_ord)
              cross join lateral jsonb_array_elements_text(p.part->'cardIds') with ordinality c(card_id, card_ord)
              where c.card_id = required.card_id
            ) < (
              select part_ord * 1000000 + card_ord
              from jsonb_array_elements(v_run.plan->'parts') with ordinality p(part, part_ord)
              cross join lateral jsonb_array_elements_text(p.part->'cardIds') with ordinality c(card_id, card_ord)
              where c.card_id = term->>'firstTeachingCardId'
            )
          )
      ) or (
        select count(*) <> count(distinct term->>'termId')
        from jsonb_array_elements(v_ledger->'terms') term
      ) then
        raise exception 'O ledger contém identificadores ou referências inválidas.'
          using errcode = '23514';
      end if;
      v_ledger_hash := encode(extensions.digest(
        convert_to(v_ledger::text, 'UTF8'), 'sha256'
      ), 'hex');
      for v_item in
        select jsonb_build_object(
          'outline', part.outline,
          'ledger', private.authoring_ledger_slice(v_run.id, part.outline, part.part_key),
          'project', private.authoring_project_slice(
            v_run.plan->'project', part.outline->'ownership'
          ),
          'outcomes', coalesce((
            select jsonb_agg(outcome)
            from jsonb_array_elements(v_run.plan->'learningOutcomes') outcome
            where outcome->>'id' in (
              select outcome_id from jsonb_array_elements_text(
                part.outline->'outcomeIds'
              ) outcome_id
            )
          ), '[]'::jsonb)
        )
        from private.authoring_parts part
        where part.run_id = v_run.id
      loop
        v_response_bytes := pg_column_size(v_run.brief)
          + pg_column_size(v_item->'project')
          + pg_column_size(v_item->'outcomes')
          + pg_column_size(v_item->'outline')
          + pg_column_size(v_item->'ledger')
          + 8192;
        if v_response_bytes > 81920 then
          raise exception 'O contexto planejado de uma parte excede 80 KiB; divida a parte.'
            using errcode = '54000';
        end if;
      end loop;
      v_plan := v_run.plan || jsonb_build_object(
        'ledgerFinalized', true,
        'ledgerHash', v_ledger_hash
      );
      perform private.authoring_assert_staging_quota(
        p_actor_id, v_run.id, pg_column_size(v_plan),
        coalesce(pg_column_size(v_run.plan), 0)
      );
      update private.authoring_runs
      set plan = v_plan,
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id returning * into v_run;
      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'ledgerHash', v_ledger_hash,
        'nextAction', 'specify_part'
      );
    elsif p_command = 'set_part_specification' then
      if v_run.status <> 'building' or nullif(btrim(p_part_key), '') is null then
        raise exception 'A execução não aceita especificação no estado atual.'
          using errcode = '55000';
      end if;
      if not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false) then
        raise exception 'Finalize o ledger antes de especificar a primeira parte.'
          using errcode = '55000';
      end if;
      select * into v_part
      from private.authoring_parts part
      where part.run_id = v_run.id and part.part_key = p_part_key
      for update;
      if not found then
        raise exception 'Parte inexistente.' using errcode = 'P0002';
      end if;
      if v_part.status <> 'planned' or v_part.specification is not null
         or exists (
           select 1 from private.authoring_parts prior
           where prior.run_id = v_run.id
             and prior.position < v_part.position
             and prior.status <> 'approved'
         ) then
        raise exception 'Somente a primeira parte causal pendente pode ser especificada.'
          using errcode = '55000';
      end if;
      v_specification := v_payload->'specification';
      if coalesce(v_payload->>'planHash', '') <> coalesce(v_run.plan_hash, '') then
        raise exception 'O plano usado para especificar a parte ficou desatualizado.'
          using errcode = '40001';
      end if;
      if jsonb_typeof(v_specification) <> 'object'
         or pg_column_size(v_specification) > 49152
         or jsonb_typeof(v_specification->'cardPlan') <> 'array' then
        raise exception 'Especificação da parte inválida.' using errcode = '22023';
      end if;
      v_outline := jsonb_build_object(
        'key', coalesce(v_specification->>'key', v_specification->>'partKey'),
        'title', v_specification->>'title',
        'boundary', v_specification->>'boundary',
        'cutReason', v_specification->>'cutReason',
        'dependsOnPartKeys', coalesce(v_specification->'dependsOnPartKeys', '[]'::jsonb),
        'ownership', v_specification->'ownership',
        'cardIds', coalesce((
          select jsonb_agg(card->'cardId' order by ordinality)
          from jsonb_array_elements(v_specification->'cardPlan') with ordinality item(card, ordinality)
        ), '[]'::jsonb),
        'outcomeIds', coalesce(v_specification->'outcomeIds', '[]'::jsonb)
      );
      if v_outline is distinct from v_part.outline then
        raise exception 'A especificação diverge do contorno reservado no plano.'
          using errcode = '22023';
      end if;
      select coalesce(jsonb_agg(outcome), '[]'::jsonb) into v_item
      from jsonb_array_elements(v_run.plan->'learningOutcomes') outcome
      where outcome->>'id' in (
        select outcome_id
        from jsonb_array_elements_text(v_specification->'outcomeIds') outcome_id
      );
      v_response_bytes := pg_column_size(v_specification)
        + pg_column_size(private.authoring_ledger_slice(
            v_run.id, v_specification, v_part.part_key
          ))
        + pg_column_size(private.authoring_continuity_slice(v_run.id, v_part.id))
        + pg_column_size(v_item)
        + 8192;
      if v_response_bytes > 81920 then
        raise exception 'O contexto da parte excede 80 KiB; divida ou simplifique a parte.'
          using errcode = '54000';
      end if;
      v_specification_hash := encode(extensions.digest(
        convert_to(v_specification::text, 'UTF8'), 'sha256'
      ), 'hex');
      v_submission_meta := v_part.submission_meta || jsonb_build_object(
        'specificationHash', v_specification_hash,
        'planHash', v_run.plan_hash
      );
      perform private.authoring_assert_staging_quota(
        p_actor_id, v_run.id,
        pg_column_size(v_specification) + pg_column_size(v_submission_meta),
        coalesce(pg_column_size(v_part.specification), 0)
          + coalesce(pg_column_size(v_part.submission_meta), 0)
      );
      update private.authoring_parts
      set specification = v_specification,
          submission_meta = v_submission_meta,
          updated_at = now()
      where id = v_part.id;
      update private.authoring_runs
      set revision = revision + 1, updated_at = now()
      where id = v_run.id returning * into v_run;
      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'partKey', v_part.part_key,
        'partStatus', v_part.status,
        'nextAction', 'build_part',
        'specificationHash', v_specification_hash
      );
    elsif p_command = 'submit_part' then
      if nullif(btrim(p_part_key), '') is null then
        raise exception 'partKey é obrigatório.' using errcode = '22023';
      end if;
      if v_run.status not in ('building', 'repair', 'rebuild') then
        raise exception 'A execução não aceita entregas no estado atual.' using errcode = '55000';
      end if;
      select * into v_part
      from private.authoring_parts part
      where part.run_id = v_run.id and part.part_key = p_part_key
      for update;
      if not found then
        raise exception 'Parte inexistente.' using errcode = 'P0002';
      end if;
      if v_part.specification is null then
        raise exception 'A parte ainda precisa ser especificada.' using errcode = '55000';
      end if;
      if v_part.attempt >= 8 then
        raise exception 'A parte atingiu o limite de oito tentativas.' using errcode = '55000';
      end if;
      if v_part.status not in (
        'planned', 'building', 'repair_required', 'rebuild_required'
      ) then
        raise exception 'Parte não aceita uma nova entrega no estado atual.' using errcode = '55000';
      end if;
      if jsonb_typeof(v_payload->'expectedAttempt') <> 'number'
         or (v_payload->>'expectedAttempt')::numeric <> trunc((v_payload->>'expectedAttempt')::numeric)
         or (v_payload->>'expectedAttempt')::integer <> v_part.attempt + 1 then
        raise exception 'A especificação da parte ficou desatualizada.' using errcode = '40001';
      end if;
      if coalesce(v_payload->>'baseLedgerSha256', '') !~ '^[a-f0-9]{64}$' then
        raise exception 'Hash causal da especificação ausente ou inválido.' using errcode = '22023';
      end if;
      if (v_part.status = 'repair_required' and coalesce(v_payload->>'mode', '') <> 'repair')
         or (v_part.status = 'rebuild_required' and coalesce(v_payload->>'mode', '') <> 'rebuild')
         or (v_part.status in ('planned', 'building')
             and coalesce(v_payload->>'mode', 'build') <> 'build') then
        raise exception 'O modo da entrega não corresponde à decisão da auditoria.'
          using errcode = '22023';
      end if;
      if exists (
        select 1 from private.authoring_parts previous
        where previous.run_id = v_run.id
          and previous.position < v_part.position
          and previous.status <> 'approved'
      ) then
        raise exception 'As partes anteriores ainda não foram aprovadas.' using errcode = '55000';
      end if;
      v_fragment := v_payload->'fragment';
      if jsonb_typeof(v_fragment) <> 'object' or v_fragment = '{}'::jsonb then
        raise exception 'Fragmento da parte ausente.' using errcode = '22023';
      end if;
      if jsonb_typeof(coalesce(v_payload->'evidence', '[]'::jsonb)) <> 'array'
         or jsonb_array_length(coalesce(v_payload->'evidence', '[]'::jsonb)) > 200
         or exists (
           select 1
           from jsonb_array_elements(coalesce(v_payload->'evidence', '[]'::jsonb)) item
           where jsonb_typeof(item) <> 'object'
         ) then
        raise exception 'evidence deve conter no máximo 200 objetos.'
          using errcode = '22023';
      end if;
      if jsonb_typeof(v_payload->'stateDelta') <> 'object'
         or (select count(*) from jsonb_object_keys(v_payload->'stateDelta')) <> 5
         or exists (
           select 1
           from jsonb_object_keys(v_payload->'stateDelta') field
           where field not in (
             'introducedTermIds', 'usedClaimIds', 'coveredOutcomeIds',
             'resolvedErrorIds', 'notes'
           )
         ) then
        raise exception 'stateDelta deve conter exatamente os cinco campos previstos.'
          using errcode = '22023';
      end if;
      for v_delta_field in
        select unnest(array[
          'introducedTermIds', 'usedClaimIds', 'coveredOutcomeIds',
          'resolvedErrorIds', 'notes'
        ])
      loop
        v_delta_values := v_payload->'stateDelta'->v_delta_field;
        if jsonb_typeof(v_delta_values) <> 'array'
           or jsonb_array_length(v_delta_values) > 1000
           or exists (
             select 1
             from jsonb_array_elements(v_delta_values) item
             where jsonb_typeof(item) <> 'string'
                or nullif(btrim(item #>> '{}'), '') is null
                or char_length(btrim(item #>> '{}')) > 500
           )
           or (
             select count(*) <> count(distinct btrim(item #>> '{}'))
             from jsonb_array_elements(v_delta_values) item
           ) then
          raise exception 'stateDelta.% deve ser uma lista sem duplicatas de textos sucintos.',
            v_delta_field using errcode = '22023';
        end if;
      end loop;
      if exists (
        select 1
        from jsonb_array_elements_text(v_part.specification->'outcomeIds') expected(outcome_id)
        where expected.outcome_id not in (
          select covered.outcome_id
          from jsonb_array_elements_text(
            v_payload->'stateDelta'->'coveredOutcomeIds'
          ) covered(outcome_id)
        )
      ) or exists (
        select 1
        from jsonb_array_elements_text(
          v_payload->'stateDelta'->'coveredOutcomeIds'
        ) covered(outcome_id)
        where covered.outcome_id not in (
          select expected.outcome_id
          from jsonb_array_elements_text(
            v_part.specification->'outcomeIds'
          ) expected(outcome_id)
        )
      ) then
        raise exception 'A entrega deve cobrir exatamente os resultados atribuídos à parte.'
          using errcode = '22023';
      end if;
      v_fragment_hash := encode(extensions.digest(
        convert_to(v_fragment::text, 'UTF8'), 'sha256'
      ), 'hex');
      v_submission_meta := v_part.submission_meta || jsonb_build_object(
        'mode', coalesce(v_payload->>'mode', 'build'),
        'expectedAttempt', (v_payload->>'expectedAttempt')::integer,
        'baseLedgerSha256', v_payload->>'baseLedgerSha256',
        'evidence', coalesce(v_payload->'evidence', '[]'::jsonb),
        'stateDelta', v_payload->'stateDelta'
      );
      perform private.authoring_assert_staging_quota(
        p_actor_id,
        v_run.id,
        pg_column_size(v_fragment) + pg_column_size(v_submission_meta),
        coalesce(pg_column_size(v_part.fragment), 0)
          + coalesce(pg_column_size(v_part.submission_meta), 0)
      );

      update private.authoring_parts
      set fragment = v_fragment,
          submission_meta = v_submission_meta,
          fragment_hash = v_fragment_hash,
          status = 'awaiting_audit',
          attempt = attempt + 1,
          submitted_at = now(),
          approved_at = null,
          updated_at = now()
      where id = v_part.id
      returning * into v_part;

      update private.authoring_runs
      set status = 'auditing', revision = revision + 1, updated_at = now()
      where id = v_run.id
      returning * into v_run;

      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'partKey', v_part.part_key,
        'partStatus', v_part.status,
        'attempt', v_part.attempt,
        'fragmentHash', v_fragment_hash
      );
    elsif p_command = 'audit_part' then
      if nullif(btrim(p_part_key), '') is null then
        raise exception 'partKey é obrigatório.' using errcode = '22023';
      end if;
      if v_run.status <> 'auditing' then
        raise exception 'A execução não aceita auditoria no estado atual.' using errcode = '55000';
      end if;
      select * into v_part
      from private.authoring_parts part
      where part.run_id = v_run.id and part.part_key = p_part_key
      for update;
      if not found or v_part.status <> 'awaiting_audit' then
        raise exception 'Parte não está aguardando auditoria.' using errcode = '55000';
      end if;
      if jsonb_typeof(v_payload->'expectedAttempt') <> 'number'
         or (v_payload->>'expectedAttempt')::numeric <> trunc((v_payload->>'expectedAttempt')::numeric)
         or (v_payload->>'expectedAttempt')::integer <> v_part.attempt
         or coalesce(v_payload->>'submissionSha256', '') <> coalesce(v_part.fragment_hash, '') then
        raise exception 'A entrega examinada não é mais a entrega atual.' using errcode = '40001';
      end if;
      v_decision := v_payload->>'decision';
      v_findings := jsonb_build_object(
        'gates', coalesce(v_payload->'gates', '{}'::jsonb),
        'findings', coalesce(v_payload->'findings', '[]'::jsonb),
        'instructions', coalesce(v_payload->>'instructions', '')
      );
      if v_decision not in ('approve', 'repair', 'rebuild', 'blocked')
         or jsonb_typeof(v_payload->'gates') <> 'object'
         or (select count(*) from jsonb_object_keys(v_payload->'gates')) <> 7
         or exists (
           select 1
           from jsonb_each(v_payload->'gates') gate
           where gate.key not in (
             'contract', 'specification', 'sources', 'didactics',
             'continuity', 'language', 'resources'
           ) or jsonb_typeof(gate.value) <> 'boolean'
         )
         or jsonb_typeof(v_payload->'findings') <> 'array'
         or jsonb_array_length(v_payload->'findings') > 100
         or exists (
           select 1
           from jsonb_array_elements(v_payload->'findings') finding
           where jsonb_typeof(finding) <> 'object'
              or (select count(*) from jsonb_object_keys(finding)) <> 8
              or exists (select 1 from jsonb_object_keys(finding) field where field not in (
                'issueId', 'severity', 'gate', 'pointer', 'observed',
                'requiredChange', 'preserveFields', 'acceptanceTest'
              ))
              or coalesce(finding->>'issueId', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
              or finding->>'severity' not in ('error', 'warning')
              or finding->>'gate' not in (
                'contract', 'specification', 'sources', 'didactics',
                'continuity', 'language', 'resources'
              )
              or coalesce(finding->>'pointer', '') !~ '^/'
              or nullif(btrim(finding->>'observed'), '') is null
              or nullif(btrim(finding->>'requiredChange'), '') is null
              or nullif(btrim(finding->>'acceptanceTest'), '') is null
              or jsonb_typeof(finding->'preserveFields') <> 'array'
              or jsonb_array_length(finding->'preserveFields') = 0
              or exists (
                select 1 from jsonb_array_elements_text(finding->'preserveFields') pointer
                where pointer !~ '^/'
              )
         ) then
        raise exception 'Decisão de auditoria inválida.' using errcode = '22023';
      end if;
      if v_decision = 'approve' and (
        jsonb_array_length(v_payload->'findings') <> 0
        or exists (
          select 1 from jsonb_each(v_payload->'gates') gate
          where gate.value <> 'true'::jsonb
        )
      ) then
        raise exception 'Aprovação exige todos os critérios atendidos e nenhuma constatação.'
          using errcode = '22023';
      end if;
      if v_decision <> 'approve'
         and jsonb_array_length(v_payload->'findings') = 0
         and nullif(btrim(coalesce(v_payload->>'instructions', '')), '') is null then
        raise exception 'A decisão deve registrar uma constatação ou instrução.'
          using errcode = '22023';
      end if;
      v_target := case
        when v_decision = 'repair' then 'repair'
        when v_decision = 'rebuild' then 'rebuild'
        when v_decision = 'blocked' then 'blocked'
        when not exists (
          select 1 from private.authoring_parts part
          where part.run_id = v_run.id
            and part.id <> v_part.id
            and part.status <> 'approved'
        ) then 'ready_for_validation'
        else 'building'
      end;
      v_block_context := case when v_decision = 'blocked' then
        jsonb_build_object(
          'reason', 'audit_blocked',
          'partKey', v_part.part_key,
          'report', v_findings
        )
      end;
      v_result := jsonb_build_object(
        'status', v_target,
        'runId', v_run.id,
        'partKey', v_part.part_key,
        'partStatus', case v_decision
          when 'approve' then 'approved'
          when 'repair' then 'repair_required'
          when 'rebuild' then 'rebuild_required'
          else 'blocked'
        end,
        'decision', v_decision
      );
      perform private.authoring_assert_staging_quota(
        p_actor_id,
        v_run.id,
        pg_column_size(v_findings)
          + case when v_decision = 'blocked'
              then pg_column_size(v_block_context) * 2
              else 0
            end,
        coalesce(pg_column_size(v_run.blocked_context), 0)
          + case when v_decision = 'rebuild'
              then coalesce(pg_column_size(v_part.fragment), 0)
              else 0
            end
      );

      insert into private.authoring_audit_reports(
        run_id, part_id, attempt, decision, findings,
        reviewed_by, api_client_id
      ) values (
        v_run.id, v_part.id, v_part.attempt, v_decision, v_findings,
        p_actor_id, p_client_id
      );

      update private.authoring_parts
      set status = case v_decision
            when 'approve' then 'approved'
            when 'repair' then 'repair_required'
            when 'rebuild' then 'rebuild_required'
            else 'blocked'
          end,
          fragment = case when v_decision = 'rebuild' then null else fragment end,
          fragment_hash = case when v_decision = 'rebuild' then null else fragment_hash end,
          blocked_previous_status = case
            when v_decision = 'blocked' then 'awaiting_audit'
          end,
          approved_at = case when v_decision = 'approve' then now() end,
          updated_at = now()
      where id = v_part.id
      returning * into v_part;

      update private.authoring_runs
      set status = v_target,
          blocked_context = v_block_context,
          blocked_previous_status = case when v_decision = 'blocked' then 'auditing' end,
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id
      returning * into v_run;

      if v_decision = 'blocked' then
        insert into private.authoring_block_events(
          run_id, part_id, action, context, actor_user_id, api_client_id
        ) values (
          v_run.id, v_part.id, 'block', v_block_context,
          p_actor_id, p_client_id
        );
      end if;

    elsif p_command = 'reopen_part' then
      if nullif(btrim(p_part_key), '') is null then
        raise exception 'partKey é obrigatório.' using errcode = '22023';
      end if;
      if v_run.status <> 'ready_for_validation' then
        raise exception 'A reabertura só é permitida após a aprovação de todas as partes.'
          using errcode = '55000';
      end if;
      select * into v_part
      from private.authoring_parts part
      where part.run_id = v_run.id and part.part_key = p_part_key
      for update;
      if not found or v_part.status <> 'approved' then
        raise exception 'A parte aprovada não foi encontrada.' using errcode = '55000';
      end if;
      if v_part.attempt >= 8 then
        raise exception 'A parte atingiu o limite de oito tentativas.' using errcode = '55000';
      end if;
      if jsonb_typeof(v_payload->'expectedAttempt') <> 'number'
         or (v_payload->>'expectedAttempt')::numeric <> trunc((v_payload->>'expectedAttempt')::numeric)
         or (v_payload->>'expectedAttempt')::integer <> v_part.attempt
         or coalesce(v_payload->>'submissionSha256', '') <> coalesce(v_part.fragment_hash, '') then
        raise exception 'A parte indicada não é mais a versão aprovada atual.' using errcode = '40001';
      end if;
      v_decision := v_payload->>'decision';
      if v_decision not in ('repair', 'rebuild')
         or jsonb_typeof(v_payload->'findings') <> 'array'
         or jsonb_array_length(v_payload->'findings') > 100
         or (
           jsonb_array_length(v_payload->'findings') = 0
           and nullif(btrim(coalesce(v_payload->>'instructions', '')), '') is null
         )
         or exists (
           select 1
           from jsonb_array_elements(v_payload->'findings') finding
           where jsonb_typeof(finding) <> 'object'
              or (select count(*) from jsonb_object_keys(finding)) <> 8
              or exists (select 1 from jsonb_object_keys(finding) field where field not in (
                'issueId', 'severity', 'gate', 'pointer', 'observed',
                'requiredChange', 'preserveFields', 'acceptanceTest'
              ))
              or coalesce(finding->>'issueId', '') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
              or finding->>'severity' not in ('error', 'warning')
              or finding->>'gate' not in (
                'contract', 'specification', 'sources', 'didactics',
                'continuity', 'language', 'resources'
              )
              or coalesce(finding->>'pointer', '') !~ '^/'
              or nullif(btrim(finding->>'observed'), '') is null
              or nullif(btrim(finding->>'requiredChange'), '') is null
              or nullif(btrim(finding->>'acceptanceTest'), '') is null
              or jsonb_typeof(finding->'preserveFields') <> 'array'
              or jsonb_array_length(finding->'preserveFields') = 0
              or exists (
                select 1 from jsonb_array_elements_text(finding->'preserveFields') pointer
                where pointer !~ '^/'
              )
         ) then
        raise exception 'Reabertura de validação inválida.' using errcode = '22023';
      end if;

      v_findings := jsonb_build_object(
        'phase', 'final_validation',
        'findings', v_payload->'findings',
        'instructions', coalesce(v_payload->>'instructions', '')
      );
      perform private.authoring_assert_staging_quota(
        p_actor_id, v_run.id, pg_column_size(v_findings),
        case when v_decision = 'rebuild'
          then coalesce(pg_column_size(v_part.fragment), 0)
          else 0
        end
      );
      insert into private.authoring_audit_reports(
        run_id, part_id, attempt, decision, findings,
        reviewed_by, api_client_id
      ) values (
        v_run.id, v_part.id, v_part.attempt, v_decision, v_findings,
        p_actor_id, p_client_id
      );

      update private.authoring_parts
      set status = case v_decision
            when 'repair' then 'repair_required'
            else 'rebuild_required'
          end,
          fragment = case when v_decision = 'rebuild' then null else fragment end,
          fragment_hash = case when v_decision = 'rebuild' then null else fragment_hash end,
          approved_at = null,
          updated_at = now()
      where id = v_part.id
      returning * into v_part;

      update private.authoring_runs
      set status = v_decision,
          validation_report = null,
          document_hash = null,
          assembled_document = null,
          validated_at = null,
          publication_step = 0,
          publication_lease_token = null,
          publication_lease_until = null,
          publication_error = null,
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id
      returning * into v_run;

      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'partKey', v_part.part_key,
        'partStatus', v_part.status,
        'decision', v_decision,
        'nextAction', case v_decision when 'repair' then 'repair_part' else 'rebuild_part' end
      );
    elsif p_command = 'cancel_run' then
      if v_run.status = 'published' then
        raise exception 'Uma execução publicada não pode ser cancelada.' using errcode = '55000';
      end if;
      if v_run.status = 'publishing' then
        -- O comando já bloqueou a linha da execução. Não espera pelas
        -- travas do importador: se uma materialização estiver em curso,
        -- devolve controle e a tentativa seguinte reconciliará o resultado.
        if not pg_try_advisory_xact_lock(
          hashtextextended('aralearn-official-import-staging', 0)
        ) or not pg_try_advisory_xact_lock(
          hashtextextended('official-import:' || v_run.contract_key, 0)
        ) then
          raise exception 'A publicação está sendo materializada.'
            using errcode = '55P03';
        end if;
        select * into v_staging
        from private.official_catalog_imports stage
        where stage.authoring_run_id = v_run.id
        for update;
        select * into v_course
        from public.courses course
        where course.contract_key = v_run.contract_key
          and course.owner_id is null
          and course.deleted_at is null
        for update;

        if v_staging.import_id is not null
           and v_staging.authoring_run_id = v_run.id
           and v_staging.status = 'published'
           and v_staging.source_hash = v_run.document_hash
           and v_course.id is not null
           and v_staging.course_id = v_course.id
           and v_course.content_hash = v_run.document_hash then
          v_result := private.authoring_complete_publication(v_run.id, v_course.id);
        elsif v_staging.import_id is not null then
          -- Antes do finalizador, todos os dados didáticos ainda estão no
          -- staging. Desvincular e apagar é seguro e deixa a operação
          -- novamente cancelável sem conservar quota indefinidamente.
          update private.official_catalog_imports stage
          set authoring_run_id = null,
              base_course_id = null,
              base_content_hash = null,
              updated_at = now()
          where stage.import_id = v_staging.import_id;
          delete from private.official_catalog_imports stage
          where stage.import_id = v_staging.import_id;
        end if;
      end if;
      if v_result is not null then
        null;
      elsif v_run.status = 'cancelled' then
        -- Um novo requestId não cria eventos ilimitados depois que a
        -- execução terminou. O primeiro cancelamento já preserva seu recibo;
        -- chamadas posteriores são leituras terminais sem qualquer escrita.
        return jsonb_build_object(
          'status', 'cancelled',
          'runId', v_run.id,
          'idempotentTerminal', true,
          'idempotent', true
        );
      else
        if nullif(btrim(v_payload->>'reason'), '') is null
           or char_length(btrim(v_payload->>'reason')) > 500 then
          raise exception 'O cancelamento exige um motivo sucinto.' using errcode = '22023';
        end if;
        perform private.authoring_acquire_storage_locks(v_run.created_by);
        perform private.authoring_compact_terminal_payloads(v_run.id);
        update private.authoring_runs
        set status = 'cancelled',
            plan = jsonb_strip_nulls(jsonb_build_object(
              'compacted', true,
              'artifact', plan->'artifact',
              'version', plan->'version',
              'runId', id,
              'partCount', (select count(*) from private.authoring_parts part where part.run_id = id)
            )),
            validation_report = case when validation_report is null then null else
              jsonb_strip_nulls(jsonb_build_object(
                'valid', validation_report->'valid',
                'compacted', true,
                'documentHash', document_hash
              )) end,
            assembled_document = null,
            blocked_context = null,
            blocked_previous_status = null,
            publication_actor_id = null,
            publication_client_id = null,
            publication_lease_token = null,
            publication_lease_until = null,
            publication_error = null,
            revision = revision + 1,
            updated_at = now()
        where id = v_run.id returning * into v_run;
        v_result := jsonb_build_object(
          'status', 'cancelled',
          'runId', v_run.id,
          'reason', btrim(v_payload->>'reason')
        );
      end if;
    elsif p_command = 'block' then
      if v_run.status in ('blocked', 'published', 'cancelled') then
        raise exception 'A execução não pode ser bloqueada no estado atual.' using errcode = '55000';
      end if;
      if nullif(btrim(v_payload->>'reason'), '') is null
         or jsonb_typeof(coalesce(v_payload->'questions', '[]'::jsonb)) <> 'array' then
        raise exception 'O bloqueio exige reason e uma lista questions.' using errcode = '22023';
      end if;

      v_block_context := jsonb_build_object(
        'reason', btrim(v_payload->>'reason'),
        'questions', coalesce(v_payload->'questions', '[]'::jsonb),
        'partKey', p_part_key
      );
      v_result := jsonb_build_object(
        'status', 'blocked',
        'runId', v_run.id,
        'partKey', p_part_key,
        'nextAction', 'ask_user',
        'blockedContext', v_block_context
      );
      perform private.authoring_assert_staging_quota(
        p_actor_id,
        v_run.id,
        pg_column_size(v_block_context) * 2,
        coalesce(pg_column_size(v_run.blocked_context), 0)
      );

      if nullif(btrim(p_part_key), '') is not null then
        select * into v_part
        from private.authoring_parts part
        where part.run_id = v_run.id and part.part_key = p_part_key
        for update;
        if not found or v_part.status = 'approved' then
          raise exception 'Parte não pode ser bloqueada.' using errcode = '55000';
        end if;
        update private.authoring_parts
        set blocked_previous_status = status,
            status = 'blocked',
            updated_at = now()
        where id = v_part.id
        returning * into v_part;
      end if;

      update private.authoring_runs
      set blocked_previous_status = status,
          status = 'blocked',
          blocked_context = v_block_context,
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id
      returning * into v_run;

      insert into private.authoring_block_events(
        run_id, part_id, action, context, actor_user_id, api_client_id
      ) values (
        v_run.id, v_part.id, 'block', v_run.blocked_context,
        p_actor_id, p_client_id
      );

    elsif p_command = 'resume' then
      if v_run.status <> 'blocked' then
        raise exception 'A execução não está bloqueada.' using errcode = '55000';
      end if;
      if jsonb_typeof(coalesce(v_payload->'resolution', '{}'::jsonb)) <> 'object'
         or coalesce(v_payload->'resolution', '{}'::jsonb) = '{}'::jsonb then
        raise exception 'A retomada exige uma resolução explícita.' using errcode = '22023';
      end if;

      if nullif(v_run.blocked_context->>'partKey', '') is not null then
        select * into v_part
        from private.authoring_parts part
        where part.run_id = v_run.id
          and part.part_key = v_run.blocked_context->>'partKey'
        for update;
        if found and v_part.status = 'blocked' then
          update private.authoring_parts
          set status = blocked_previous_status,
              blocked_previous_status = null,
              updated_at = now()
          where id = v_part.id
          returning * into v_part;
        end if;
      end if;

      v_block_context := jsonb_build_object('resolution', v_payload->'resolution');
      v_result := jsonb_build_object(
        'status', v_run.blocked_previous_status,
        'runId', v_run.id,
        'partKey', v_part.part_key,
        'resumed', true
      );
      perform private.authoring_assert_staging_quota(
        p_actor_id,
        v_run.id,
        pg_column_size(v_block_context),
        coalesce(pg_column_size(v_run.blocked_context), 0)
      );

      insert into private.authoring_block_events(
        run_id, part_id, action, context, actor_user_id, api_client_id
      ) values (
        v_run.id, v_part.id, 'resume',
        v_block_context,
        p_actor_id, p_client_id
      );

      update private.authoring_runs
      set status = blocked_previous_status,
          blocked_context = null,
          blocked_previous_status = null,
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id
      returning * into v_run;

    elsif p_command = 'validate' then
      if coalesce(v_payload->>'expectedRevision', '') !~ '^[0-9]+$' then
        raise exception 'A validação exige a revisão causal da execução.'
          using errcode = '22023';
      end if;
      v_expected_revision := (v_payload->>'expectedRevision')::bigint;
      if v_expected_revision <> v_run.revision then
        raise exception 'A execução mudou durante a validação integral.'
          using errcode = '40001';
      end if;
      if v_run.status <> 'ready_for_validation'
         or (
           coalesce(v_run.plan->>'kind', '') <> 'document_import'
           and not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
         )
         or jsonb_array_length(coalesce(
           v_run.plan->'ledgerManifest'->'openIssues', '[]'::jsonb
         )) <> 0
         or exists (
           select 1 from private.authoring_parts part
           where part.run_id = v_run.id and part.status <> 'approved'
         ) or exists (
           select 1
           from jsonb_array_elements(v_run.plan->'learningOutcomes') outcome
           where not exists (
             select 1
             from private.authoring_parts part
             cross join lateral jsonb_array_elements_text(
               part.submission_meta->'stateDelta'->'coveredOutcomeIds'
             ) covered(outcome_id)
             where part.run_id = v_run.id
               and covered.outcome_id = outcome->>'id'
           )
         ) then
        raise exception 'Todas as partes e resultados precisam estar aprovados antes da validação.'
          using errcode = '55000';
      end if;
      v_document_hash := lower(nullif(coalesce(
        v_payload->>'documentHash', v_payload->>'contentHash'
      ), ''));
      v_fragment := v_payload->'document';
      if coalesce((v_payload->>'valid')::boolean, false) is not true
         or v_document_hash is null
         or v_document_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'A validação integral não aprovou o curso.' using errcode = '23514';
      end if;
      if jsonb_typeof(v_fragment) <> 'object' then
        raise exception 'A validação precisa fornecer o documento integral montado.'
          using errcode = '22023';
      end if;
      perform private.authoring_assert_staging_quota(
        p_actor_id,
        v_run.id,
        pg_column_size(v_fragment)
          + pg_column_size(coalesce(
            v_payload->'validation', v_payload - 'document' - 'expectedRevision'
          )),
        coalesce(pg_column_size(v_run.assembled_document), 0)
          + coalesce(pg_column_size(v_run.validation_report), 0)
      );

      update private.authoring_runs
      set status = 'validated',
          validation_report = coalesce(
            v_payload->'validation', v_payload - 'document' - 'expectedRevision'
          ),
          document_hash = v_document_hash,
          assembled_document = v_fragment,
          validated_at = now(),
          publication_lease_token = null,
          publication_lease_until = null,
          publication_error = null,
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id
      returning * into v_run;

      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'documentHash', v_run.document_hash
      );
    elsif p_command = 'prepare_publish' then
      if v_run.status not in ('validated', 'publishing')
         or (
           coalesce(v_run.plan->>'kind', '') <> 'document_import'
           and not coalesce((v_run.plan->>'ledgerFinalized')::boolean, false)
         )
         or jsonb_array_length(coalesce(
           v_run.plan->'ledgerManifest'->'openIssues', '[]'::jsonb
         )) <> 0
         or v_run.assembled_document is null
         or v_run.document_hash is null then
        raise exception 'Somente um curso validado pode ser publicado.' using errcode = '55000';
      end if;
      if v_run.status = 'publishing' and (
        v_run.publication_actor_id is distinct from p_actor_id
        or v_run.publication_client_id is distinct from p_client_id
      ) then
        perform 1
        from private.app_role_assignments assignment
        where assignment.user_id = v_run.publication_actor_id
          and assignment.role in ('owner', 'catalog_publisher')
        for share;
        if v_run.publication_client_id is not null then
          perform 1
          from private.authoring_api_clients client
          where client.id = v_run.publication_client_id
          for share;
        end if;
        select exists (
          select 1
          from private.app_role_assignments assignment
          where assignment.user_id = v_run.publication_actor_id
            and assignment.role in ('owner', 'catalog_publisher')
            and assignment.active
            and assignment.revoked_at is null
        ) and (
          v_run.publication_client_id is null or exists (
            select 1
            from private.authoring_api_clients client
            where client.id = v_run.publication_client_id
              and client.owner_user_id = v_run.publication_actor_id
              and client.revoked_at is null
              and (client.expires_at is null or client.expires_at > now())
              and 'catalog:publish' = any(client.scopes)
          )
        ) into v_previous_authorized;
        if v_previous_authorized then
          raise exception 'A publicação pertence a outro publicador.' using errcode = '42501';
        end if;
        update private.authoring_runs run
        set publication_actor_id = p_actor_id,
            publication_client_id = p_client_id,
            publication_error = case
              when publication_error->>'code' in ('not_authorized', 'invalid_client')
                then null
              else publication_error
            end,
            revision = revision + 1,
            updated_at = now()
        where run.id = v_run.id
        returning * into v_run;
      end if;
      if v_run.publication_error->>'code' in ('not_authorized', 'invalid_client') then
        update private.authoring_runs run
        set publication_error = null,
            revision = revision + 1,
            updated_at = now()
        where run.id = v_run.id
        returning * into v_run;
      end if;
      if v_run.publication_error->>'kind' = 'deterministic'
         and v_run.publication_error->>'code' <> 'collection_unavailable' then
        raise exception 'A falha determinística da publicação exige correção ou cancelamento.'
          using errcode = '55000';
      end if;
      if v_run.status = 'validated' and not (v_payload ? 'nextStep') then
        if v_run.publication_intent = 'create' and exists (
          select 1 from public.courses course
          where course.contract_key = v_run.contract_key
            and course.owner_id is null and course.deleted_at is null
        ) then
          raise exception 'O identificador do novo curso já existe no catálogo.'
            using errcode = '23505';
        end if;
        if v_run.publication_intent = 'update' and not exists (
          select 1 from public.courses course
          where course.id = v_run.base_course_id
            and course.contract_key = v_run.contract_key
            and course.owner_id is null
            and course.status = 'published'
            and course.deleted_at is null
            and course.content_hash = v_run.base_content_hash
        ) then
          raise exception 'A versão oficial mudou antes da publicação.' using errcode = '40001';
        end if;
      end if;

      if v_payload ? 'nextStep' then
        if (v_payload->>'nextStep')::integer < v_run.publication_step then
          raise exception 'O cursor de publicação não pode retroceder.' using errcode = '22023';
        end if;
        if (v_payload->>'nextStep')::integer > v_run.publication_step + 1000 then
          raise exception 'Avanço de cursor de publicação inválido.' using errcode = '22023';
        end if;
      end if;

      update private.authoring_runs
      set status = 'publishing',
          publication_actor_id = p_actor_id,
          publication_client_id = p_client_id,
          publication_step = case
            when v_payload ? 'nextStep' then (v_payload->>'nextStep')::integer
            else publication_step
          end,
          revision = revision + 1,
          updated_at = now()
      where id = v_run.id
      returning * into v_run;

      v_result := jsonb_build_object(
        'status', v_run.status,
        'runId', v_run.id,
        'target', v_run.publication_target,
        'publicationTarget', v_run.publication_target,
        'publicationIntent', v_run.publication_intent,
        'baseCourseId', v_run.base_course_id,
        'baseContentHash', v_run.base_content_hash,
        'documentHash', v_run.document_hash,
        'document', v_run.assembled_document,
        'publicationStep', v_run.publication_step
      );
    end if;
  end if;

  -- A medição final enxerga o estado exato já montado por qualquer branch e
  -- reserva também o recibo comum. Se falhar, a transação desfaz todas as
  -- escritas anteriores; cancelamento permanece sempre disponível para liberar
  -- staging antigo que já exceda os limites atuais.
  if p_command <> 'cancel_run' then
    perform private.authoring_assert_staging_quota(
      p_actor_id,
      v_effective_run_id,
      private.authoring_row_storage_charge(jsonb_build_object(
        'run_id', v_effective_run_id,
        'actor_user_id', p_actor_id,
        'api_client_id', p_client_id,
        'request_id', p_request_id,
        'command', p_command,
        'part_key', p_part_key,
        'api_request_hash', v_api_request_hash,
        'request_hash', v_request_hash,
        'result', (v_result - 'document')
          || jsonb_build_object('idempotent', false),
        'created_at', clock_timestamp()
      )),
      0
    );
  end if;

  insert into private.authoring_command_events(
    run_id, actor_user_id, api_client_id, request_id,
    command, part_key, api_request_hash, request_hash, result
  ) values (
    v_effective_run_id, p_actor_id, p_client_id, p_request_id,
    p_command, p_part_key, v_api_request_hash, v_request_hash,
    (v_result - 'document') || jsonb_build_object('idempotent', false)
  );

  -- A segunda leitura ocorre depois do INSERT e mede a linha real, inclusive
  -- seus metadados e a margem estrutural. Qualquer excesso desfaz o comando e
  -- o evento na mesma transação. Só o primeiro cancelamento fica dispensado,
  -- pois precisa continuar disponível mesmo quando a quota já foi atingida.
  if p_command <> 'cancel_run' then
    perform private.authoring_assert_staging_quota(
      p_actor_id, v_effective_run_id, 0, 0
    );
  end if;

  -- Toda operação concluída sobre trabalho ainda ativo estende a janela móvel.
  -- Falhas não chegam a este ponto e, portanto, jamais renovam a retenção.
  update private.authoring_runs run
  set expires_at = now() + interval '30 days'
  where run.id = v_effective_run_id
    and run.status in (
      'planning', 'building', 'auditing', 'repair', 'rebuild',
      'ready_for_validation', 'validated', 'publishing', 'blocked'
    );

  return v_result || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.authoring_storage_diagnostics(p_actor_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or not private.has_active_app_role(p_actor_user_id, 'owner') then
    raise exception 'Diagnóstico de autoria não autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'runs', (select count(*) from private.authoring_runs),
    'activeRuns', (select count(*) from private.authoring_runs run where run.status in (
      'planning', 'building', 'auditing', 'repair', 'rebuild',
      'ready_for_validation', 'validated', 'publishing', 'blocked'
    )),
    'expiredActiveRuns', (select count(*) from private.authoring_runs run
      where run.expires_at < now() and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
      )),
    'expiredActiveRunsBeyondGrace', (select count(*) from private.authoring_runs run
      where run.expires_at < now() - interval '30 days' and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
      )),
    'publishedRuns', (select count(*) from private.authoring_runs run where run.status = 'published'),
    'publishedRunsWithAssembledDocument', (select count(*) from private.authoring_runs run
      where run.status = 'published' and run.assembled_document is not null),
    'publishedPartsWithFragments', (select count(*) from private.authoring_parts part
      join private.authoring_runs run on run.id = part.run_id
      where run.status = 'published' and part.fragment is not null),
    'publishedLedgerChunks', (select count(*) from private.authoring_ledger_chunks chunk
      join private.authoring_runs run on run.id = chunk.run_id
      where run.status = 'published'),
    'cancelledRuns', (select count(*) from private.authoring_runs run where run.status = 'cancelled'),
    'parts', (select count(*) from private.authoring_parts),
    'ledgerChunks', (select count(*) from private.authoring_ledger_chunks),
    'auditReports', (select count(*) from private.authoring_audit_reports),
    'commandEvents', (select count(*) from private.authoring_command_events),
    'retainedCommandReceipts', (select count(*) from private.authoring_command_receipts),
    'retentionEvents', (select count(*) from private.authoring_retention_events),
    'apiClients', (select count(*) from private.authoring_api_clients),
    'apiClientRateWindows', (select count(*) from private.authoring_api_rate_windows),
    'userRateWindows', (select count(*) from private.authoring_user_rate_windows),
    'stagingBytes', jsonb_build_object(
      'chargeModel', 'full_row_jsonb_plus_64_times_2',
      'global', (select coalesce(sum(private.authoring_run_staging_bytes(run.id)), 0)
        from private.authoring_runs run
        where run.status not in ('published', 'cancelled')),
      'terminalRetained', private.authoring_global_retained_bytes(),
      'retainedReceipts', (select coalesce(sum(
          private.authoring_row_storage_charge(to_jsonb(receipt))
        ), 0) from private.authoring_command_receipts receipt),
      'retentionEvents', (select coalesce(sum(
          private.authoring_row_storage_charge(to_jsonb(event))
        ), 0) from private.authoring_retention_events event),
      'terminalActors', coalesce((
        select jsonb_agg(jsonb_build_object(
          'actorId', usage.actor_id,
          'bytes', usage.bytes
        ) order by usage.bytes desc, usage.actor_id)
        from (
          select actor.actor_id,
                 private.authoring_actor_retained_bytes(actor.actor_id) bytes
          from (
            select run.created_by actor_id
            from private.authoring_runs run
            where run.status in ('published', 'cancelled')
            union
            select receipt.responsible_user_id
            from private.authoring_command_receipts receipt
            union
            select event.responsible_user_id
            from private.authoring_retention_events event
          ) actor
        ) usage
      ), '[]'::jsonb),
      'terminalLimits', jsonb_build_object(
        'actor', coalesce(nullif(current_setting(
          'aralearn.authoring_actor_terminal_quota_bytes', true
        ), '')::bigint, 67108864),
        'global', coalesce(nullif(current_setting(
          'aralearn.authoring_global_terminal_quota_bytes', true
        ), '')::bigint, 134217728)
      ),
      'actors', coalesce((
        select jsonb_agg(jsonb_build_object(
          'actorId', usage.actor_id,
          'bytes', usage.bytes
        ) order by usage.bytes desc, usage.actor_id)
        from (
          select run.created_by actor_id,
                 sum(private.authoring_run_staging_bytes(run.id))::bigint bytes
          from private.authoring_runs run
          where run.status not in ('published', 'cancelled')
          group by run.created_by
        ) usage
      ), '[]'::jsonb),
      'runs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'runId', usage.run_id,
          'actorId', usage.actor_id,
          'bytes', usage.bytes
        ) order by usage.bytes desc, usage.run_id)
        from (
          select run.id run_id, run.created_by actor_id,
                 private.authoring_run_staging_bytes(run.id) bytes
          from private.authoring_runs run
          where run.status not in ('published', 'cancelled')
        ) usage
      ), '[]'::jsonb)
    ),
    'bytes', jsonb_build_object(
      'runs', pg_total_relation_size('private.authoring_runs'::regclass),
      'parts', pg_total_relation_size('private.authoring_parts'::regclass),
      'ledgerChunks', pg_total_relation_size('private.authoring_ledger_chunks'::regclass),
      'audits', pg_total_relation_size('private.authoring_audit_reports'::regclass),
      'blockEvents', pg_total_relation_size('private.authoring_block_events'::regclass),
      'commands', pg_total_relation_size('private.authoring_command_events'::regclass),
      'retainedCommands', pg_total_relation_size('private.authoring_command_receipts'::regclass),
      'retentionAudit', pg_total_relation_size('private.authoring_retention_events'::regclass),
      'clients', pg_total_relation_size('private.authoring_api_clients'::regclass),
      'officialImportManifests', pg_total_relation_size('private.official_catalog_imports'::regclass),
      'officialImportRows', pg_total_relation_size('private.official_catalog_import_stage_rows'::regclass),
      'officialImportChunks', pg_total_relation_size('private.official_catalog_import_chunks'::regclass)
    )
  );
end;
$$;

create table private.authoring_maintenance_state (
  singleton boolean primary key default true check (singleton),
  last_attempt_at timestamptz,
  last_cleanup_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  phase text not null default 'recover_publishing',
  cursor_at timestamptz,
  cursor_id uuid,
  cycle_started_at timestamptz,
  cycle_cancelled_before timestamptz,
  cycle_published_before timestamptz,
  cycle_deferred_count bigint not null default 0,
  last_batch_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint authoring_maintenance_state_phase check (
    phase in (
      'recover_publishing', 'expire_active', 'delete_cancelled',
      'delete_published', 'prune_aux'
    )
  ),
  constraint authoring_maintenance_state_cursor check (
    (cursor_at is null and cursor_id is null)
    or (cursor_at is not null and cursor_id is not null)
  ),
  constraint authoring_maintenance_state_cycle check (
    (
      cycle_started_at is null
      and cycle_cancelled_before is null
      and cycle_published_before is null
      and cycle_deferred_count = 0
    ) or (
      cycle_started_at is not null
      and cycle_cancelled_before is not null
      and cycle_published_before is not null
      and cycle_deferred_count >= 0
    )
  )
);
insert into private.authoring_maintenance_state(singleton) values (true);

create or replace function public.cleanup_authoring_history(
  p_actor_user_id uuid,
  p_dry_run boolean default true,
  p_cancelled_before timestamptz default (now() - interval '30 days'),
  p_published_before timestamptz default (now() - interval '90 days')
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
set statement_timeout = '8s'
as $$
declare
  v_expired_active bigint := 0;
  v_cancelled bigint := 0;
  v_published bigint := 0;
  v_staging_bytes bigint := 0;
  v_compacted_parts bigint := 0;
  v_compacted_audit_reports bigint := 0;
  v_compacted_block_events bigint := 0;
  v_cancelled_active_runs bigint := 0;
  v_deleted_cancelled_runs bigint := 0;
  v_deleted_published_runs bigint := 0;
  v_retained_receipts bigint := 0;
  v_retention_events bigint := 0;
  v_new_retention_events bigint := 0;
  v_deleted_windows bigint := 0;
  v_deleted_user_windows bigint := 0;
  v_deleted_client_events bigint := 0;
  v_deleted_receipts bigint := 0;
  v_deleted_retention_events bigint := 0;
  v_publishing_recovery bigint := 0;
  v_completed_publications bigint := 0;
  v_reverted_publications bigint := 0;
  v_deferred_publications bigint := 0;
  v_recovery_run private.authoring_runs%rowtype;
  v_recovery_stage private.official_catalog_imports%rowtype;
  v_recovery_course public.courses%rowtype;
  v_has_recovery_stage boolean;
  v_lock_actor uuid;
  v_phase text;
  v_cursor_at timestamptz;
  v_cursor_id uuid;
  v_cycle_started_at timestamptz;
  v_cycle_cancelled_before timestamptz;
  v_cycle_published_before timestamptz;
  v_cycle_deferred_count bigint := 0;
  v_batch_size integer := least(25, greatest(1, coalesce(nullif(current_setting(
    'aralearn.authoring_cleanup_batch_size', true
  ), '')::integer, 10)));
  v_prune_batch_size integer := least(1000, greatest(1, coalesce(nullif(current_setting(
    'aralearn.authoring_cleanup_prune_batch_size', true
  ), '')::integer, 250)));
  v_selected_ids uuid[] := array[]::uuid[];
  v_selected_count integer := 0;
  v_last_selected_at timestamptz;
  v_last_selected_id uuid;
  v_phase_has_more boolean := false;
  v_has_more boolean := false;
  v_cycle_completed boolean := false;
  v_remaining_eligible bigint := 0;
  v_remaining_aux bigint := 0;
  v_remaining_eligible_exists boolean := false;
  v_remaining_aux_exists boolean := false;
  v_processed_runs bigint := 0;
  v_prune_remaining integer;
  v_next_phase text;
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or not private.has_active_app_role(p_actor_user_id, 'owner') then
    raise exception 'Limpeza de autoria não autorizada.' using errcode = '42501';
  end if;
  if p_dry_run is null or p_cancelled_before is null or p_published_before is null
     or p_cancelled_before > now() - interval '30 days'
     or p_published_before > now() - interval '90 days' then
    raise exception 'Parâmetros de retenção inválidos.' using errcode = '22023';
  end if;

  if not p_dry_run then
    -- Apenas uma limpeza efetiva pode transferir ou excluir históricos por
    -- vez. A trava evita que duas rotinas bloqueiem conjuntos de runs em
    -- ordens diferentes enquanto ambas tentam adquirir a quota global.
    perform pg_advisory_xact_lock(hashtextextended(
      'authoring-history-cleanup', 0
    ));
    select state.phase, state.cursor_at, state.cursor_id, state.cycle_started_at,
      state.cycle_cancelled_before, state.cycle_published_before,
      state.cycle_deferred_count
    into v_phase, v_cursor_at, v_cursor_id, v_cycle_started_at,
      v_cycle_cancelled_before, v_cycle_published_before,
      v_cycle_deferred_count
    from private.authoring_maintenance_state state
    where state.singleton
    for update;
    if v_cycle_started_at is null then
      v_phase := 'recover_publishing';
      v_cursor_at := null;
      v_cursor_id := null;
      v_cycle_started_at := clock_timestamp();
      v_cycle_cancelled_before := p_cancelled_before;
      v_cycle_published_before := p_published_before;
      v_cycle_deferred_count := 0;
      update private.authoring_maintenance_state state
      set phase = v_phase,
          cursor_at = null,
          cursor_id = null,
          cycle_started_at = v_cycle_started_at,
          cycle_cancelled_before = v_cycle_cancelled_before,
          cycle_published_before = v_cycle_published_before,
          cycle_deferred_count = 0,
          updated_at = now()
      where state.singleton;
    end if;
  else
    select state.phase, state.cursor_at, state.cursor_id, state.cycle_started_at,
      state.cycle_cancelled_before, state.cycle_published_before,
      state.cycle_deferred_count
    into v_phase, v_cursor_at, v_cursor_id, v_cycle_started_at,
      v_cycle_cancelled_before, v_cycle_published_before,
      v_cycle_deferred_count
    from private.authoring_maintenance_state state
    where state.singleton;
    v_phase := coalesce(v_phase, 'recover_publishing');
  end if;
  v_cycle_cancelled_before := coalesce(v_cycle_cancelled_before, p_cancelled_before);
  v_cycle_published_before := coalesce(v_cycle_published_before, p_published_before);

  -- As métricas exatas percorrem o histórico completo e pertencem somente ao
  -- diagnóstico explícito. A limpeza efetiva trabalha com o lote selecionado
  -- e com EXISTS indexados, para sempre conseguir persistir seu cursor.
  if p_dry_run then
    select count(*) into v_publishing_recovery
    from private.authoring_runs run
    where run.expires_at < now() - interval '30 days'
      and run.status = 'publishing';

    select count(*) into v_expired_active
    from private.authoring_runs run
    where run.expires_at < now() - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'blocked'
      );

    select count(*) into v_cancelled
    from private.authoring_runs run
    where run.status = 'cancelled' and run.updated_at < v_cycle_cancelled_before;

    select count(*) into v_published
    from private.authoring_runs run
    where run.status = 'published'
      and run.published_at < v_cycle_published_before;

    select coalesce(sum(private.authoring_run_staging_bytes(run.id)), 0)::bigint
    into v_staging_bytes
    from private.authoring_runs run
    where run.expires_at < now() - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'blocked'
      );

    v_remaining_eligible := v_publishing_recovery + v_expired_active
      + v_cancelled + v_published;
    select
      (select count(*) from private.authoring_api_rate_windows api_window
        where api_window.window_started_at < now() - interval '1 day')
      + (select count(*) from private.authoring_user_rate_windows user_window
        where user_window.window_started_at < now() - interval '1 day')
      + (select count(*) from private.authoring_api_client_events event
        where event.event_type = 'rate_limited'
          and event.created_at < now() - interval '90 days')
      + (select count(*) from private.authoring_command_receipts receipt
        where receipt.retained_at < now() - interval '730 days')
      + (select count(*) from private.authoring_retention_events event
        where event.created_at < now() - interval '2555 days')
    into v_remaining_aux;
  end if;

  if not p_dry_run and v_phase = 'recover_publishing' then
    select coalesce(array_agg(candidate.id order by candidate.expires_at, candidate.id), array[]::uuid[])
    into v_selected_ids
    from (
      select run.id, run.expires_at
      from private.authoring_runs run
      where run.expires_at < v_cycle_started_at - interval '30 days'
        and run.status = 'publishing'
        and (
          v_cursor_at is null
          or (run.expires_at, run.id) > (v_cursor_at, v_cursor_id)
        )
      order by run.expires_at, run.id
      limit v_batch_size
    ) candidate;
    v_selected_count := cardinality(v_selected_ids);
    v_publishing_recovery := v_selected_count;

    -- Publicações presas não podem consumir quota para sempre. Sob as
    -- mesmas travas do importador, uma materialização já confirmada conclui
    -- a execução; antes disso, o staging é descartado e o fluxo volta ao
    -- estado validado, que a retenção abaixo cancelará por estar vencido.
    perform pg_advisory_xact_lock(
      hashtextextended('aralearn-official-import-staging', 0)
    );
    for v_recovery_run in
      select * from private.authoring_runs run
      where run.id = any(v_selected_ids)
        and run.expires_at < v_cycle_started_at - interval '30 days'
        and run.status = 'publishing'
      order by run.expires_at, run.id
    loop
      begin
        perform pg_advisory_xact_lock(
          hashtextextended('official-import:' || v_recovery_run.contract_key, 0)
        );
        select * into v_recovery_run
        from private.authoring_runs run
        where run.id = v_recovery_run.id
          and run.expires_at < now() - interval '30 days'
          and run.status = 'publishing'
        for update;
        if not found then
          continue;
        end if;
        v_recovery_stage := null;
        select * into v_recovery_stage
        from private.official_catalog_imports stage
        where stage.authoring_run_id = v_recovery_run.id
        for update;
        v_has_recovery_stage := found;
        v_recovery_course := null;
        select * into v_recovery_course
        from public.courses course
        where course.contract_key = v_recovery_run.contract_key
          and course.owner_id is null
          and course.deleted_at is null
        for update;

        -- Só a prova material ligada a esta execução autoriza a conclusão.
        -- Um curso de mesmo hash, sem esse staging publicado, pode pertencer
        -- a outra execução e nunca deve ser apropriado por reconciliação.
        if v_has_recovery_stage
           and v_recovery_stage.status = 'published'
           and v_recovery_stage.authoring_run_id = v_recovery_run.id
           and v_recovery_stage.source_hash = v_recovery_run.document_hash
           and v_recovery_course.id is not null
           and v_recovery_stage.course_id = v_recovery_course.id
           and v_recovery_course.content_hash = v_recovery_run.document_hash then
          perform private.authoring_complete_publication(
            v_recovery_run.id, v_recovery_course.id
          );
          v_completed_publications := v_completed_publications + 1;
        else
          if v_has_recovery_stage then
            update private.official_catalog_imports stage
            set authoring_run_id = null,
                base_course_id = null,
                base_content_hash = null,
                updated_at = now()
            where stage.import_id = v_recovery_stage.import_id;
            delete from private.official_catalog_imports stage
            where stage.import_id = v_recovery_stage.import_id;
          end if;
          update private.authoring_runs run
          set status = 'validated',
              publication_step = 0,
              publication_actor_id = null,
              publication_client_id = null,
              publication_lease_token = null,
              publication_lease_until = null,
              publication_error = null,
              revision = revision + 1,
              updated_at = now()
          where run.id = v_recovery_run.id;
          v_reverted_publications := v_reverted_publications + 1;
        end if;
      exception when sqlstate 'AR422' then
        -- Uma coleção explícita desativada exige ação editorial, mas não
        -- impede a recuperação independente das demais execuções do lote.
        update private.authoring_runs run
        set publication_lease_token = null,
            publication_lease_until = null,
            publication_error = jsonb_build_object(
              'kind', 'deterministic',
              'code', 'collection_unavailable',
              'message', 'A coleção escolhida não está mais disponível.',
              'httpStatus', 422,
              'failedAt', clock_timestamp()
            ),
            revision = revision + 1,
            updated_at = now()
        where run.id = v_recovery_run.id
          and run.status = 'publishing';
        v_deferred_publications := v_deferred_publications + 1;
      end;
    end loop;

    if v_selected_count > 0 then
      select run.expires_at, run.id
      into v_last_selected_at, v_last_selected_id
      from private.authoring_runs run
      where run.id = any(v_selected_ids)
      order by run.expires_at desc, run.id desc
      limit 1;
      -- A execução pode ter mudado de estado, mas expires_at e id continuam a
      -- representar o keyset escolhido nesta transação.
      if v_last_selected_at is null then
        select candidate.expires_at, candidate.id
        into v_last_selected_at, v_last_selected_id
        from unnest(v_selected_ids) selected(id)
        join private.authoring_runs candidate on candidate.id = selected.id
        order by candidate.expires_at desc, candidate.id desc
        limit 1;
      end if;
      v_processed_runs := v_selected_count;
    end if;

    select exists(
      select 1 from private.authoring_runs run
      where run.expires_at < v_cycle_started_at - interval '30 days'
        and run.status = 'publishing'
        and (
          coalesce(v_last_selected_at, v_cursor_at) is null
          or (run.expires_at, run.id) > (
            coalesce(v_last_selected_at, v_cursor_at),
            coalesce(v_last_selected_id, v_cursor_id)
          )
        )
    ) into v_phase_has_more;

    v_cycle_deferred_count := v_cycle_deferred_count + v_deferred_publications;
    if v_phase_has_more then
      update private.authoring_maintenance_state state
      set cursor_at = coalesce(v_last_selected_at, v_cursor_at),
          cursor_id = coalesce(v_last_selected_id, v_cursor_id),
          cycle_deferred_count = v_cycle_deferred_count,
          last_batch_at = clock_timestamp(),
          updated_at = now()
      where state.singleton;
    else
      update private.authoring_maintenance_state state
      set phase = 'expire_active', cursor_at = null, cursor_id = null,
          cycle_deferred_count = v_cycle_deferred_count,
          last_batch_at = clock_timestamp(), updated_at = now()
      where state.singleton;
    end if;
    v_has_more := true;
  end if;

  if not p_dry_run and v_phase = 'expire_active' then
    -- Serializa a decisão de expiração com os comandos, que também bloqueiam a
    -- linha da execução antes de mudar seu estado.
    select coalesce(array_agg(candidate.id order by candidate.expires_at, candidate.id), array[]::uuid[])
    into v_selected_ids
    from (
      select run.id, run.expires_at
      from private.authoring_runs run
      where run.expires_at < v_cycle_started_at - interval '30 days'
        and run.status <> 'publishing'
        and run.status in (
          'planning', 'building', 'auditing', 'repair', 'rebuild',
          'ready_for_validation', 'validated', 'blocked'
        )
        and (
          v_cursor_at is null
          or (run.expires_at, run.id) > (v_cursor_at, v_cursor_id)
      )
      order by run.expires_at, run.id
      limit v_batch_size
      for update
    ) candidate;
    v_selected_count := cardinality(v_selected_ids);
    v_expired_active := v_selected_count;
    if v_selected_count > 0 then
      select run.expires_at, run.id
      into v_last_selected_at, v_last_selected_id
      from private.authoring_runs run
      where run.id = any(v_selected_ids)
      order by run.expires_at desc, run.id desc
      limit 1;
      select coalesce(sum(private.authoring_run_staging_bytes(run.id)), 0)::bigint
      into v_staging_bytes
      from private.authoring_runs run
      where run.id = any(v_selected_ids);
    end if;

    -- As linhas já estão bloqueadas na mesma ordem usada pelos comandos. Só
    -- então a limpeza adquire global -> autores ordenados e terminaliza o
    -- lote sem abrir uma janela concorrente na quota.
    perform private.authoring_acquire_storage_global_lock();
    for v_lock_actor in
      select distinct run.created_by
      from private.authoring_runs run
      where run.id = any(v_selected_ids)
        and run.expires_at < v_cycle_started_at - interval '30 days'
        and run.status <> 'publishing'
        and run.status in (
          'planning', 'building', 'auditing', 'repair', 'rebuild',
          'ready_for_validation', 'validated', 'blocked'
        )
      order by run.created_by
    loop
      perform private.authoring_acquire_storage_actor_lock(v_lock_actor);
    end loop;

    -- O trabalho ativo vencido ultrapassou ainda uma carência de trinta dias.
    -- Primeiro se registra uma prova independente; só então o staging grande é
    -- compactado e a execução passa a cancelled, iniciando sua própria retenção.
    insert into private.authoring_retention_events(
      run_id, prior_status, action, actor_user_id,
      responsible_user_id, details
    )
    select
      run.id,
      run.status,
      'expired_run_cancelled',
      p_actor_user_id,
      run.created_by,
      jsonb_build_object(
        'title', run.title,
        'createdAt', run.created_at,
        'updatedAt', run.updated_at,
        'expiredAt', run.expires_at,
        'graceDays', 30,
        'planHash', run.plan_hash,
        'documentHash', run.document_hash,
        'courseId', run.course_id,
        'partCount', (select count(*) from private.authoring_parts part where part.run_id = run.id),
        'commandCount', (select count(*) from private.authoring_command_events event where event.run_id = run.id),
        'auditCount', (select count(*) from private.authoring_audit_reports report where report.run_id = run.id),
        'blockCount', (select count(*) from private.authoring_block_events event where event.run_id = run.id),
        'auditTrail', coalesce((
          select jsonb_agg(jsonb_build_object(
            'partKey', audit.part_key,
            'attempt', audit.attempt,
            'decision', audit.decision,
            'findingsHash', encode(extensions.digest(
              convert_to(audit.findings::text, 'UTF8'), 'sha256'
            ), 'hex'),
            'createdAt', audit.created_at
          ) order by audit.created_at, audit.id)
          from (
            select report.id, part.part_key, report.attempt, report.decision,
              report.findings, report.created_at
            from private.authoring_audit_reports report
            join private.authoring_parts part on part.id = report.part_id
            where report.run_id = run.id
            order by report.created_at desc, report.id desc
            limit 1000
          ) audit
        ), '[]'::jsonb),
        'blockTrail', coalesce((
          select jsonb_agg(jsonb_build_object(
            'partKey', blocked.part_key,
            'action', blocked.action,
            'contextHash', encode(extensions.digest(
              convert_to(blocked.context::text, 'UTF8'), 'sha256'
            ), 'hex'),
            'createdAt', blocked.created_at
          ) order by blocked.created_at, blocked.id)
          from (
            select event.id, part.part_key, event.action, event.context, event.created_at
            from private.authoring_block_events event
            left join private.authoring_parts part on part.id = event.part_id
            where event.run_id = run.id
            order by event.created_at desc, event.id desc
            limit 1000
          ) blocked
        ), '[]'::jsonb)
      )
    from private.authoring_runs run
    where run.id = any(v_selected_ids)
      and run.expires_at < v_cycle_started_at - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
      )
    on conflict(run_id, action) do nothing;
    get diagnostics v_retention_events = row_count;

    perform private.authoring_compact_terminal_payloads(run.id)
    from private.authoring_runs run
    where run.id = any(v_selected_ids)
      and run.expires_at < v_cycle_started_at - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'blocked'
      );

    update private.authoring_parts part
    set specification = case when part.specification is null then null else
          jsonb_strip_nulls(jsonb_build_object(
            'compacted', true,
            'partKey', part.part_key,
            'ownership', part.specification->'ownership'
          )) end,
        fragment = null,
        submission_meta = (part.submission_meta - 'evidence')
          || jsonb_build_object('compacted', true),
        updated_at = now()
    from private.authoring_runs run
    where run.id = part.run_id
      and run.id = any(v_selected_ids)
      and run.expires_at < v_cycle_started_at - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
      )
      and (
        part.fragment is not null
        or part.submission_meta ? 'evidence'
        or (part.specification is not null and pg_column_size(part.specification) > 256)
      );
    get diagnostics v_compacted_parts = row_count;

    delete from private.authoring_ledger_chunks chunk
    using private.authoring_runs run
    where run.id = chunk.run_id
      and run.id = any(v_selected_ids)
      and run.expires_at < v_cycle_started_at - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
      );

    update private.authoring_audit_reports report
    set findings = jsonb_build_object(
          'compacted', true,
          'originalType', jsonb_typeof(report.findings),
          'sha256', encode(extensions.digest(
            convert_to(report.findings::text, 'UTF8'), 'sha256'
          ), 'hex')
        )
    from private.authoring_runs run
    where run.id = report.run_id
      and run.id = any(v_selected_ids)
      and run.expires_at < v_cycle_started_at - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
      )
      and pg_column_size(report.findings) > 512;
    get diagnostics v_compacted_audit_reports = row_count;

    update private.authoring_block_events event
    set context = jsonb_build_object(
          'compacted', true,
          'sha256', encode(extensions.digest(
            convert_to(event.context::text, 'UTF8'), 'sha256'
          ), 'hex')
        )
    from private.authoring_runs run
    where run.id = event.run_id
      and run.id = any(v_selected_ids)
      and run.expires_at < v_cycle_started_at - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
      )
      and pg_column_size(event.context) > 512;
    get diagnostics v_compacted_block_events = row_count;

    update private.authoring_runs run
    set status = 'cancelled',
        plan = jsonb_strip_nulls(jsonb_build_object(
          'compacted', true,
          'artifact', run.plan->'artifact',
          'version', run.plan->'version',
          'runId', run.id,
          'partCount', (select count(*) from private.authoring_parts part where part.run_id = run.id)
        )),
        assembled_document = null,
        blocked_context = null,
        blocked_previous_status = null,
        publication_actor_id = null,
        publication_client_id = null,
        publication_lease_token = null,
        publication_lease_until = null,
        publication_error = null,
        revision = revision + 1,
        updated_at = now()
    where run.id = any(v_selected_ids)
      and run.expires_at < v_cycle_started_at - interval '30 days'
      and run.status <> 'publishing'
      and run.status in (
        'planning', 'building', 'auditing', 'repair', 'rebuild',
        'ready_for_validation', 'validated', 'publishing', 'blocked'
    );
    get diagnostics v_cancelled_active_runs = row_count;

    v_processed_runs := v_selected_count;
    select exists(
      select 1 from private.authoring_runs run
      where run.expires_at < v_cycle_started_at - interval '30 days'
        and run.status <> 'publishing'
        and run.status in (
          'planning', 'building', 'auditing', 'repair', 'rebuild',
          'ready_for_validation', 'validated', 'blocked'
        )
        and (
          coalesce(v_last_selected_at, v_cursor_at) is null
          or (run.expires_at, run.id) > (
            coalesce(v_last_selected_at, v_cursor_at),
            coalesce(v_last_selected_id, v_cursor_id)
          )
        )
    ) into v_phase_has_more;
    if v_phase_has_more then
      update private.authoring_maintenance_state state
      set cursor_at = coalesce(v_last_selected_at, v_cursor_at),
          cursor_id = coalesce(v_last_selected_id, v_cursor_id),
          last_batch_at = clock_timestamp(), updated_at = now()
      where state.singleton;
    else
      update private.authoring_maintenance_state state
      set phase = 'delete_cancelled', cursor_at = null, cursor_id = null,
          last_batch_at = clock_timestamp(), updated_at = now()
      where state.singleton;
    end if;
    v_has_more := true;
  end if;

  if not p_dry_run and v_phase in ('delete_cancelled', 'delete_published') then
    if v_phase = 'delete_cancelled' then
      select coalesce(array_agg(candidate.id order by candidate.updated_at, candidate.id), array[]::uuid[])
      into v_selected_ids
      from (
        select run.id, run.updated_at
        from private.authoring_runs run
        where run.status = 'cancelled'
          and run.updated_at < v_cycle_cancelled_before
          and (
            v_cursor_at is null
            or (run.updated_at, run.id) > (v_cursor_at, v_cursor_id)
          )
        order by run.updated_at, run.id
        limit v_batch_size
        for update
      ) candidate;
    else
      select coalesce(array_agg(candidate.id order by candidate.published_at, candidate.id), array[]::uuid[])
      into v_selected_ids
      from (
        select run.id, run.published_at
        from private.authoring_runs run
        where run.status = 'published'
          and run.published_at < v_cycle_published_before
          and (
            v_cursor_at is null
            or (run.published_at, run.id) > (v_cursor_at, v_cursor_id)
          )
        order by run.published_at, run.id
        limit v_batch_size
        for update
      ) candidate;
    end if;
    v_selected_count := cardinality(v_selected_ids);
    if v_selected_count > 0 then
      select
        count(*) filter (where run.status = 'cancelled'),
        count(*) filter (where run.status = 'published')
      into v_cancelled, v_published
      from private.authoring_runs run
      where run.id = any(v_selected_ids);
      if v_phase = 'delete_cancelled' then
        select run.updated_at, run.id
        into v_last_selected_at, v_last_selected_id
        from private.authoring_runs run
        where run.id = any(v_selected_ids)
        order by run.updated_at desc, run.id desc
        limit 1;
      else
        select run.published_at, run.id
        into v_last_selected_at, v_last_selected_id
        from private.authoring_runs run
        where run.id = any(v_selected_ids)
        order by run.published_at desc, run.id desc
        limit 1;
      end if;
    end if;

    -- Execuções que já eram terminais antes desta chamada só saem depois da
    -- retenção configurada. A prova causal e a auditoria mínima sobrevivem.
    -- O bloqueio antecede a cópia dos recibos e impede uma gravação concorrente
    -- de ficar fora da prova retida no mesmo instante da exclusão.
    perform private.authoring_acquire_storage_global_lock();
    for v_lock_actor in
      select distinct run.created_by
      from private.authoring_runs run
      where run.id = any(v_selected_ids)
      order by run.created_by
    loop
      perform private.authoring_acquire_storage_actor_lock(v_lock_actor);
    end loop;

    insert into private.authoring_retention_events(
      run_id, prior_status, action, actor_user_id,
      responsible_user_id, details
    )
    select
      run.id,
      run.status,
      'terminal_run_deleted',
      p_actor_user_id,
      run.created_by,
      jsonb_build_object(
        'title', run.title,
        'createdAt', run.created_at,
        'updatedAt', run.updated_at,
        'publishedAt', run.published_at,
        'planHash', run.plan_hash,
        'documentHash', run.document_hash,
        'courseId', run.course_id,
        'partCount', (select count(*) from private.authoring_parts part where part.run_id = run.id),
        'commandCount', (select count(*) from private.authoring_command_events event where event.run_id = run.id),
        'auditCount', (select count(*) from private.authoring_audit_reports report where report.run_id = run.id),
        'blockCount', (select count(*) from private.authoring_block_events event where event.run_id = run.id),
        'auditTrail', coalesce((
          select jsonb_agg(jsonb_build_object(
            'partKey', audit.part_key,
            'attempt', audit.attempt,
            'decision', audit.decision,
            'findingsHash', encode(extensions.digest(
              convert_to(audit.findings::text, 'UTF8'), 'sha256'
            ), 'hex'),
            'createdAt', audit.created_at
          ) order by audit.created_at, audit.id)
          from (
            select report.id, part.part_key, report.attempt, report.decision,
              report.findings, report.created_at
            from private.authoring_audit_reports report
            join private.authoring_parts part on part.id = report.part_id
            where report.run_id = run.id
            order by report.created_at desc, report.id desc
            limit 1000
          ) audit
        ), '[]'::jsonb),
        'blockTrail', coalesce((
          select jsonb_agg(jsonb_build_object(
            'partKey', blocked.part_key,
            'action', blocked.action,
            'contextHash', encode(extensions.digest(
              convert_to(blocked.context::text, 'UTF8'), 'sha256'
            ), 'hex'),
            'createdAt', blocked.created_at
          ) order by blocked.created_at, blocked.id)
          from (
            select event.id, part.part_key, event.action, event.context, event.created_at
            from private.authoring_block_events event
            left join private.authoring_parts part on part.id = event.part_id
            where event.run_id = run.id
            order by event.created_at desc, event.id desc
            limit 1000
          ) blocked
        ), '[]'::jsonb)
      )
    from private.authoring_runs run
    where run.id = any(v_selected_ids)
      and (
        (run.status = 'cancelled' and run.updated_at < v_cycle_cancelled_before)
        or (run.status = 'published' and run.published_at < v_cycle_published_before)
      )
    on conflict(run_id, action) do nothing;
    get diagnostics v_new_retention_events = row_count;
    v_retention_events := v_retention_events + v_new_retention_events;

    insert into private.authoring_command_receipts(
      actor_user_id, responsible_user_id, request_id, run_id, command, part_key,
      api_request_hash, request_hash, result, command_created_at
    )
    select
      event.actor_user_id, run.created_by, event.request_id, event.run_id, event.command,
      event.part_key, event.api_request_hash, event.request_hash, event.result, event.created_at
    from private.authoring_command_events event
    join private.authoring_runs run on run.id = event.run_id
    where event.actor_user_id is not null
      and run.id = any(v_selected_ids)
      and (
        (run.status = 'cancelled' and run.updated_at < v_cycle_cancelled_before)
        or (run.status = 'published' and run.published_at < v_cycle_published_before)
      )
    on conflict(actor_user_id, request_id) do nothing;
    get diagnostics v_retained_receipts = row_count;

    delete from private.authoring_runs run
    where run.id = any(v_selected_ids)
      and run.status = 'cancelled' and run.updated_at < v_cycle_cancelled_before;
    get diagnostics v_deleted_cancelled_runs = row_count;

    delete from private.authoring_runs run
    where run.id = any(v_selected_ids)
      and run.status = 'published' and run.published_at < v_cycle_published_before;
    get diagnostics v_deleted_published_runs = row_count;

    v_processed_runs := v_selected_count;
    if v_phase = 'delete_cancelled' then
      select exists(
        select 1 from private.authoring_runs run
        where run.status = 'cancelled'
          and run.updated_at < v_cycle_cancelled_before
          and (
            coalesce(v_last_selected_at, v_cursor_at) is null
            or (run.updated_at, run.id) > (
              coalesce(v_last_selected_at, v_cursor_at),
              coalesce(v_last_selected_id, v_cursor_id)
            )
          )
        limit 1
      ) into v_phase_has_more;
    else
      select exists(
        select 1 from private.authoring_runs run
        where run.status = 'published'
          and run.published_at < v_cycle_published_before
          and (
            coalesce(v_last_selected_at, v_cursor_at) is null
            or (run.published_at, run.id) > (
              coalesce(v_last_selected_at, v_cursor_at),
              coalesce(v_last_selected_id, v_cursor_id)
            )
          )
        limit 1
      ) into v_phase_has_more;
    end if;
    if v_phase_has_more then
      update private.authoring_maintenance_state state
      set cursor_at = coalesce(v_last_selected_at, v_cursor_at),
          cursor_id = coalesce(v_last_selected_id, v_cursor_id),
          last_batch_at = clock_timestamp(), updated_at = now()
      where state.singleton;
    else
      update private.authoring_maintenance_state state
      set phase = case when v_phase = 'delete_cancelled'
            then 'delete_published' else 'prune_aux' end,
          cursor_at = null, cursor_id = null,
          last_batch_at = clock_timestamp(), updated_at = now()
      where state.singleton;
    end if;
    v_has_more := true;
  end if;

  if not p_dry_run and v_phase = 'prune_aux' then
    v_prune_remaining := v_prune_batch_size;

    delete from private.authoring_api_rate_windows api_window
    where api_window.client_id in (
      select candidate.client_id
      from private.authoring_api_rate_windows candidate
      where candidate.window_started_at < now() - interval '1 day'
      order by candidate.window_started_at, candidate.client_id
      limit v_prune_remaining
    );
    get diagnostics v_deleted_windows = row_count;
    v_prune_remaining := v_prune_remaining - v_deleted_windows::integer;
    delete from private.authoring_user_rate_windows user_window
    where user_window.user_id in (
      select candidate.user_id
      from private.authoring_user_rate_windows candidate
      where candidate.window_started_at < now() - interval '1 day'
      order by candidate.window_started_at, candidate.user_id
      limit v_prune_remaining
    );
    get diagnostics v_deleted_user_windows = row_count;
    v_prune_remaining := v_prune_remaining - v_deleted_user_windows::integer;
    v_deleted_windows := v_deleted_windows + v_deleted_user_windows;

    delete from private.authoring_api_client_events event
    where event.id in (
      select candidate.id
      from private.authoring_api_client_events candidate
      where candidate.event_type = 'rate_limited'
        and candidate.created_at < now() - interval '90 days'
      order by candidate.created_at, candidate.id
      limit v_prune_remaining
    );
    get diagnostics v_deleted_client_events = row_count;
    v_prune_remaining := v_prune_remaining - v_deleted_client_events::integer;

    -- Recibos impedem a repetição tardia por dois anos. O identificador da
    -- execução continua reservado pela auditoria de retenção por sete anos.
    delete from private.authoring_command_receipts receipt
    where (receipt.actor_user_id, receipt.request_id) in (
      select candidate.actor_user_id, candidate.request_id
      from private.authoring_command_receipts candidate
      where candidate.retained_at < now() - interval '730 days'
      order by candidate.retained_at, candidate.actor_user_id, candidate.request_id
      limit v_prune_remaining
    );
    get diagnostics v_deleted_receipts = row_count;
    v_prune_remaining := v_prune_remaining - v_deleted_receipts::integer;
    delete from private.authoring_retention_events event
    where event.id in (
      select candidate.id
      from private.authoring_retention_events candidate
      where candidate.created_at < now() - interval '2555 days'
      order by candidate.created_at, candidate.id
      limit v_prune_remaining
    );
    get diagnostics v_deleted_retention_events = row_count;

    select
      exists(select 1 from private.authoring_api_rate_windows api_window
        where api_window.window_started_at < now() - interval '1 day' limit 1)
      or exists(select 1 from private.authoring_user_rate_windows user_window
        where user_window.window_started_at < now() - interval '1 day' limit 1)
      or exists(select 1 from private.authoring_api_client_events event
        where event.event_type = 'rate_limited'
          and event.created_at < now() - interval '90 days' limit 1)
      or exists(select 1 from private.authoring_command_receipts receipt
        where receipt.retained_at < now() - interval '730 days' limit 1)
      or exists(select 1 from private.authoring_retention_events event
        where event.created_at < now() - interval '2555 days' limit 1)
    into v_remaining_aux_exists;
    v_remaining_aux := case when v_remaining_aux_exists then 1 else 0 end;
    if v_remaining_aux_exists then
      update private.authoring_maintenance_state state
      set last_batch_at = clock_timestamp(), updated_at = now()
      where state.singleton;
      v_has_more := true;
    else
      update private.authoring_maintenance_state state
      set phase = 'recover_publishing', cursor_at = null, cursor_id = null,
          cycle_started_at = null, cycle_cancelled_before = null,
          cycle_published_before = null, cycle_deferred_count = 0,
          last_batch_at = clock_timestamp(),
          last_cleanup_at = case when v_cycle_deferred_count = 0
            then clock_timestamp() else state.last_cleanup_at end,
          updated_at = now()
      where state.singleton;
      v_cycle_completed := true;
      v_has_more := false;
    end if;
  end if;

  if p_dry_run then
    v_has_more := v_remaining_eligible > 0 or v_remaining_aux > 0;
  else
    select
      exists(select 1 from private.authoring_runs run
        where run.expires_at < v_cycle_started_at - interval '30 days'
          and run.status in (
            'planning', 'building', 'auditing', 'repair', 'rebuild',
            'ready_for_validation', 'validated', 'publishing', 'blocked'
          ) limit 1)
      or exists(select 1 from private.authoring_runs run
        where run.status = 'cancelled'
          and run.updated_at < v_cycle_cancelled_before limit 1)
      or exists(select 1 from private.authoring_runs run
        where run.status = 'published'
          and run.published_at < v_cycle_published_before limit 1)
    into v_remaining_eligible_exists;
    v_remaining_eligible := case when v_remaining_eligible_exists then 1 else 0 end;

    select
      exists(select 1 from private.authoring_api_rate_windows api_window
        where api_window.window_started_at < now() - interval '1 day' limit 1)
      or exists(select 1 from private.authoring_user_rate_windows user_window
        where user_window.window_started_at < now() - interval '1 day' limit 1)
      or exists(select 1 from private.authoring_api_client_events event
        where event.event_type = 'rate_limited'
          and event.created_at < now() - interval '90 days' limit 1)
      or exists(select 1 from private.authoring_command_receipts receipt
        where receipt.retained_at < now() - interval '730 days' limit 1)
      or exists(select 1 from private.authoring_retention_events event
        where event.created_at < now() - interval '2555 days' limit 1)
    into v_remaining_aux_exists;
    v_remaining_aux := case when v_remaining_aux_exists then 1 else 0 end;
  end if;

  select state.phase into v_next_phase
  from private.authoring_maintenance_state state
  where state.singleton;

  return jsonb_build_object(
    'dryRun', p_dry_run,
    'phase', v_phase,
    'nextPhase', coalesce(v_next_phase, v_phase),
    'batchSize', v_batch_size,
    'pruneBatchSize', v_prune_batch_size,
    'metricsExact', p_dry_run,
    'processedRuns', v_processed_runs,
    'remainingEligibleRuns', v_remaining_eligible,
    'remainingAuxiliaryRows', v_remaining_aux,
    'hasMore', v_has_more,
    'cycleCompleted', v_cycle_completed,
    'expiredActiveRunsBeyondGrace', v_expired_active,
    'publishingRunsBeyondGrace', v_publishing_recovery,
    'completedStuckPublications', v_completed_publications,
    'revertedStuckPublications', v_reverted_publications,
    'deferredStuckPublications', v_deferred_publications,
    'cycleDeferredStuckPublications', v_cycle_deferred_count,
    'incomplete', v_cycle_deferred_count > 0,
    'expiredActiveStagingBytes', v_staging_bytes,
    'cancelledRunsEligible', v_cancelled,
    'publishedRunsEligibleForStagingCompaction', v_published,
    'publishedRunsEligibleForDeletion', v_published,
    'terminalRunsEligible', v_cancelled + v_published,
    'cancelledActiveRuns', v_cancelled_active_runs,
    'deletedRuns', v_deleted_cancelled_runs + v_deleted_published_runs,
    'deletedCancelledRuns', v_deleted_cancelled_runs,
    'deletedPublishedRuns', v_deleted_published_runs,
    'compactedParts', v_compacted_parts,
    'compactedAuditReports', v_compacted_audit_reports,
    'compactedBlockEvents', v_compacted_block_events,
    'retainedCommandReceipts', v_retained_receipts,
    'retentionEventsWritten', v_retention_events,
    'deletedRateWindows', v_deleted_windows,
    'deletedClientEvents', v_deleted_client_events,
    'deletedCommandReceipts', v_deleted_receipts,
    'deletedRetentionEvents', v_deleted_retention_events,
    'activeRunsDeleted', 0,
    'publishedRunRecordsDeleted', v_deleted_published_runs
  );
end;
$$;

create or replace function public.maybe_cleanup_authoring_history()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '8s'
as $$
declare
  v_owner uuid;
  v_result jsonb;
  v_last_cleanup_at timestamptz;
  v_last_attempt_at timestamptz;
  v_last_status text;
begin
  perform private.require_service_role();
  select state.last_cleanup_at, state.last_attempt_at, state.last_result->>'status'
  into v_last_cleanup_at, v_last_attempt_at, v_last_status
  from private.authoring_maintenance_state state
  where state.singleton
  for update;
  if v_last_cleanup_at is not null
     and v_last_cleanup_at >= now() - interval '1 day' then
    return jsonb_build_object('status', 'skipped', 'reason', 'daily_throttle');
  end if;
  if v_last_attempt_at is not null and (
       (v_last_status = 'partial'
         and v_last_attempt_at >= now() - interval '10 seconds')
       or (coalesce(v_last_status, 'deferred') <> 'partial'
         and v_last_attempt_at >= now() - interval '1 hour')
     ) then
    return jsonb_build_object('status', 'skipped', 'reason', 'retry_throttle');
  end if;
  select assignment.user_id into v_owner
  from private.app_role_assignments assignment
  where assignment.role = 'owner' and assignment.active
  order by assignment.granted_at, assignment.user_id
  limit 1;
  if v_owner is null then
    v_result := jsonb_build_object('status', 'skipped', 'reason', 'owner_absent');
  else
    begin
      v_result := public.cleanup_authoring_history(
        v_owner, false, now() - interval '30 days', now() - interval '90 days'
      );
      if coalesce((v_result->>'hasMore')::boolean, false) then
        v_result := v_result || jsonb_build_object('status', 'partial');
      elsif coalesce((v_result->>'cycleDeferredStuckPublications')::bigint, 0) > 0 then
        v_result := v_result || jsonb_build_object('status', 'deferred');
      else
        v_result := v_result || jsonb_build_object('status', 'completed');
      end if;
    exception when others then
      v_result := jsonb_build_object(
        'status', 'deferred',
        'sqlstate', sqlstate
      );
    end;
  end if;
  update private.authoring_maintenance_state
  set last_attempt_at = now(),
      last_cleanup_at = case
        when v_result->>'status' = 'completed' then now()
        else last_cleanup_at
      end,
      last_result = v_result,
      updated_at = now()
  where singleton;
  return v_result;
end;
$$;

-- A importação administrativa preexistente substitui staging antigo do mesmo
-- contract_key. Uma execução ativa da API, porém, não pode ser apagada por
-- outra publicação concorrente.
create or replace function private.protect_active_authoring_import_staging()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  if old.authoring_run_id is not null
     and old.status = 'staging'
     and exists (
       select 1 from private.authoring_runs run
       where run.id = old.authoring_run_id
         and run.status not in ('published', 'cancelled')
     ) then
    raise exception 'Outra publicação de autoria ainda controla este staging.'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists official_catalog_imports_protect_authoring
  on private.official_catalog_imports;
create trigger official_catalog_imports_protect_authoring
before delete on private.official_catalog_imports
for each row execute function private.protect_active_authoring_import_staging();

create or replace function public.begin_authoring_official_course_import(
  p_import_id uuid,
  p_run_id uuid,
  p_course jsonb,
  p_source_hash text,
  p_expected_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '35s'
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_staging private.official_catalog_imports%rowtype;
  v_live public.courses%rowtype;
  v_course_id uuid := private.try_uuid(p_course->>'id');
  v_contract_key text := nullif(btrim(p_course->>'contractKey'), '');
  v_result jsonb;
  v_completion jsonb;
begin
  perform private.require_service_role();
  if p_import_id is null or p_run_id is null or v_course_id is null
     or v_contract_key is null or coalesce(p_source_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Identidade de publicação inválida.' using errcode = '22023';
  end if;

  -- Mesma ordem do importador administrativo: global, curso, linhas.
  perform pg_advisory_xact_lock(
    hashtextextended('aralearn-official-import-staging', 0)
  );
  perform pg_advisory_xact_lock(hashtextextended('official-import:' || v_contract_key, 0));

  select * into v_run from private.authoring_runs run
  where run.id = p_run_id for update;
  if not found or v_run.status <> 'publishing'
     or v_run.contract_key is distinct from v_contract_key
     or v_run.document_hash is distinct from p_source_hash
     or v_run.publication_intent not in ('create', 'update') then
    raise exception 'Execução incompatível com a publicação.' using errcode = '55000';
  end if;
  perform private.assert_authoring_publication_authority(v_run);
  select * into v_staging from private.official_catalog_imports stage
  where stage.contract_key = v_contract_key for update;
  if found
     and v_staging.authoring_run_id is not null
     and v_staging.authoring_run_id is distinct from p_run_id
     and (
       v_staging.status = 'staging'
       or v_staging.import_id = p_import_id
     ) then
    raise exception 'Este artefato de publicação pertence a outra execução.'
      using errcode = '55000';
  end if;

  select * into v_live from public.courses course
  where course.contract_key = v_contract_key
    and course.owner_id is null and course.deleted_at is null
  for update;

  if v_run.publication_intent = 'create' then
    if found then
      if not coalesce(
        v_staging.import_id = p_import_id
        and v_staging.status = 'published'
        and v_live.id = v_course_id
        and v_live.content_hash = p_source_hash,
        false
      ) then
        raise exception 'O identificador do novo curso já existe no catálogo.'
          using errcode = '23505';
      end if;
    end if;
  elsif not coalesce(
    found
      and v_live.id = v_run.base_course_id
      and v_live.contract_key = v_contract_key
      and v_live.status = 'published'
      and (
        v_live.content_hash = v_run.base_content_hash
        or (
          v_staging.import_id = p_import_id
          and v_staging.status = 'published'
          and v_live.content_hash = p_source_hash
        )
      ),
    false
  ) then
    raise exception 'A versão oficial mudou antes da materialização.'
      using errcode = '40001';
  end if;

  v_result := public.begin_official_course_import(
    p_import_id, p_course, p_source_hash, p_expected_counts, true
  );
  update private.official_catalog_imports stage
  set authoring_run_id = p_run_id,
      base_course_id = v_run.base_course_id,
      base_content_hash = v_run.base_content_hash,
      updated_at = now()
  where stage.import_id = coalesce(
    private.try_uuid(v_result->>'importId'), p_import_id
  )
  returning * into v_staging;
  if v_staging.import_id is null then
    raise exception 'Staging de publicação inexistente após a preparação.'
      using errcode = 'P0002';
  end if;
  if v_result->>'status' = 'published' then
    -- O importador canônico pode reconhecer que o mesmo hash já foi
    -- publicado. A execução de autoria precisa ser concluída na mesma
    -- transação; caso contrário ficaria eternamente em publishing.
    v_completion := private.authoring_complete_publication(
      p_run_id, v_staging.course_id
    );
    return v_result || jsonb_build_object(
      'runFinalized', true,
      'runId', p_run_id,
      'idempotent', true,
      'completion', v_completion
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.finalize_authoring_official_course_import(
  p_import_id uuid,
  p_run_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '90s'
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_staging private.official_catalog_imports%rowtype;
  v_live public.courses%rowtype;
  v_contract_key text;
  v_publication jsonb;
  v_completion jsonb;
begin
  perform private.require_service_role();
  perform pg_advisory_xact_lock(
    hashtextextended('aralearn-official-import-staging', 0)
  );
  select stage.contract_key into v_contract_key
  from private.official_catalog_imports stage
  where stage.import_id = p_import_id;
  if v_contract_key is null then
    raise exception 'Staging de publicação inexistente.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('official-import:' || v_contract_key, 0)
  );
  select * into v_run from private.authoring_runs run
  where run.id = p_run_id for update;
  select * into v_staging from private.official_catalog_imports stage
  where stage.import_id = p_import_id for update;
  if v_run.id is null or v_staging.import_id is null
     or v_run.status not in ('publishing', 'published')
     or v_staging.authoring_run_id is distinct from p_run_id
     or v_staging.contract_key is distinct from v_run.contract_key
     or v_staging.source_hash is distinct from v_run.document_hash then
    raise exception 'Staging de publicação incompatível com a execução.'
      using errcode = '55000';
  end if;
  if v_run.status = 'publishing' then
    if p_lease_token is null
       or v_run.publication_lease_token is distinct from p_lease_token
       or v_run.publication_lease_until <= clock_timestamp() then
      raise exception 'O lease do finalizador não está mais ativo.' using errcode = '55P03';
    end if;
    perform private.assert_authoring_publication_authority(v_run);
  end if;
  select * into v_live from public.courses course
  where course.contract_key = v_staging.contract_key
    and course.owner_id is null and course.deleted_at is null
  for update;

  if v_staging.status = 'published' then
    if not found or v_live.id <> v_staging.course_id
       or v_live.content_hash is distinct from v_staging.source_hash then
      raise exception 'A publicação concluída diverge do curso oficial.'
        using errcode = '40001';
    end if;
    v_publication := public.finalize_official_course_import(p_import_id);
    v_completion := private.authoring_complete_publication(
      p_run_id, v_staging.course_id
    );
    return jsonb_build_object(
      'status', 'published',
      'courseId', v_staging.course_id,
      'contentHash', v_staging.source_hash,
      'publicationSeq', coalesce(
        v_publication->'publicationSeq',
        v_publication->'publication'->'publicationSeq'
      ),
      'runFinalized', true,
      'idempotent', coalesce((v_completion->>'idempotent')::boolean, true)
    );
  end if;

  if v_run.publication_intent = 'create' and found then
    raise exception 'O identificador do novo curso passou a existir durante a publicação.'
      using errcode = '40001';
  end if;
  if v_run.publication_intent = 'update' and not coalesce(
    found
      and v_live.id = v_run.base_course_id
      and v_live.status = 'published'
      and v_live.content_hash = v_run.base_content_hash,
    false
  ) then
    raise exception 'A versão oficial mudou durante a publicação.'
      using errcode = '40001';
  end if;
  v_publication := public.finalize_official_course_import(p_import_id);
  v_completion := private.authoring_complete_publication(
    p_run_id, v_staging.course_id
  );
  return jsonb_build_object(
    'status', 'published',
    'courseId', v_staging.course_id,
    'contentHash', v_staging.source_hash,
    'publicationSeq', coalesce(
      v_publication->'publicationSeq',
      v_publication->'publication'->'publicationSeq'
    ),
    'runFinalized', true,
    'idempotent', coalesce((v_publication->>'idempotent')::boolean, false)
  );
end;
$$;

-- O importador legado tinha prazo ilimitado. A autoria concede uma janela
-- compatível com a Edge Function, mas nunca deixa uma transação presa sem teto.
alter function public.finalize_official_course_import(uuid)
  set statement_timeout = '85s';

comment on table private.app_role_assignments is
  'Papéis operacionais por UUID de usuário; não contém e-mail nem segredo.';
comment on table private.authoring_api_clients is
  'Clientes da API com somente prefixo e SHA-256 da chave.';
comment on table private.authoring_runs is
  'Execuções transitórias do ciclo de autoria em partes.';
comment on table private.authoring_ledger_chunks is
  'Ledger transitório em blocos limitados; removido ao publicar ou cancelar.';
comment on table private.authoring_parts is
  'Planejamento e fragmentos transitórios; não substitui a árvore relacional publicada.';
comment on table private.authoring_command_receipts is
  'Recibos causais mínimos preservados após a retenção para impedir repetição de requestId.';
comment on table private.authoring_retention_events is
  'Auditoria administrativa que sobrevive à compactação e à remoção do staging terminal.';
comment on function public.current_user_capabilities() is
  'Capacidades seguras para a interface autenticada, sem expor tabelas privadas.';
comment on function public.resolve_authoring_api_client(text, uuid) is
  'Resolve um hash de chave, aplica expiração, revogação e rate limit.';
comment on function public.apply_authoring_command(uuid, uuid, text, uuid, text, text, jsonb) is
  'Máquina de estados idempotente Planner, Builder, Auditor, validação e publicação.';
comment on function public.replay_authoring_command(uuid, uuid, text, text, text) is
  'Recupera a resposta de uma requisição exata sem revalidar um estado causal que já avançou.';
comment on function public.get_authoring_run_summary(uuid, uuid) is
  'Resumo de execução sem fragmentos nem documento montado.';
comment on function public.list_authoring_runs(uuid, integer, timestamptz, uuid) is
  'Lista paginada das execuções que o ator pode consultar.';
comment on function public.get_next_authoring_part(uuid, uuid) is
  'Contexto causal da próxima parte sem transferir o histórico integral.';
comment on function public.get_authoring_part_submission(uuid, text, uuid) is
  'Entrega persistida que o Auditor relê antes de decidir pelo hash examinado.';
comment on function public.cleanup_authoring_history(uuid, boolean, timestamptz, timestamptz) is
  'Aplica expiração com carência, compacta staging e remove somente estados terminais após retenção.';

-- Nenhuma tabela privada é consultável por papéis da API. Até service_role usa
-- exclusivamente as funções SECURITY DEFINER abaixo.
revoke all on table private.app_role_assignments from public, anon, authenticated, service_role;
revoke all on table private.app_role_audit from public, anon, authenticated, service_role;
revoke all on table private.authoring_api_clients from public, anon, authenticated, service_role;
revoke all on table private.authoring_api_rate_windows from public, anon, authenticated, service_role;
revoke all on table private.authoring_user_rate_windows from public, anon, authenticated, service_role;
revoke all on table private.authoring_api_client_events from public, anon, authenticated, service_role;
revoke all on table private.authoring_runs from public, anon, authenticated, service_role;
revoke all on table private.authoring_ledger_chunks from public, anon, authenticated, service_role;
revoke all on table private.authoring_parts from public, anon, authenticated, service_role;
revoke all on table private.authoring_audit_reports from public, anon, authenticated, service_role;
revoke all on table private.authoring_block_events from public, anon, authenticated, service_role;
revoke all on table private.authoring_command_events from public, anon, authenticated, service_role;
revoke all on table private.authoring_command_receipts from public, anon, authenticated, service_role;
revoke all on table private.authoring_retention_events from public, anon, authenticated, service_role;
revoke all on table private.authoring_maintenance_state from public, anon, authenticated, service_role;

revoke all on function private.has_active_app_role(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.require_service_role() from public, anon, authenticated, service_role;
revoke all on function private.protect_last_app_owner() from public, anon, authenticated, service_role;
revoke all on function private.audit_app_role_assignment() from public, anon, authenticated, service_role;
revoke all on function private.user_can_use_authoring_scope(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.authoring_actor_has_role(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.authoring_client_has_scope(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.authoring_complete_publication(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.assert_authoring_publication_authority(private.authoring_runs)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_run_is_accessible(uuid, private.authoring_runs, text)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_ledger_document(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_ledger_slice(uuid, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_project_slice(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_continuity_slice(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_run_staging_bytes(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_row_storage_charge(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_actor_retained_bytes(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_global_retained_bytes()
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_acquire_storage_global_lock()
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_acquire_storage_actor_lock(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_acquire_storage_locks(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_assert_staging_quota(uuid, uuid, bigint, bigint)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_enforce_import_staging_quota()
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_compact_terminal_payloads(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.protect_active_authoring_import_staging()
  from public, anon, authenticated, service_role;

revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated, service_role;

revoke all on function public.current_user_capabilities() from public, anon, service_role;
grant execute on function public.current_user_capabilities() to authenticated;

revoke all on function public.set_app_role(uuid, uuid, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.list_app_role_assignments(uuid)
  from public, anon, authenticated;
revoke all on function public.create_authoring_api_client(
  uuid, uuid, text, text, text, text[], integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.rotate_authoring_api_client(
  uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.revoke_authoring_api_client(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.resolve_authoring_api_client(text, uuid)
  from public, anon, authenticated;
revoke all on function public.get_authoring_run(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_authoring_run_summary(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_authoring_runs(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.get_next_authoring_part(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_authoring_part_submission(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.replay_authoring_command(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.apply_authoring_command(
  uuid, uuid, text, uuid, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.authoring_storage_diagnostics(uuid)
  from public, anon, authenticated;
revoke all on function public.cleanup_authoring_history(uuid, boolean, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.maybe_cleanup_authoring_history()
  from public, anon, authenticated;
revoke all on function public.begin_authoring_official_course_import(
  uuid, uuid, jsonb, text, jsonb
) from public, anon, authenticated;
revoke all on function public.claim_authoring_publication(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.record_authoring_publication_failure(
  uuid, uuid, text, text, text, integer
) from public, anon, authenticated;
revoke all on function public.finalize_authoring_official_course_import(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.set_app_role(uuid, uuid, text, boolean, text)
  to service_role;
grant execute on function public.list_app_role_assignments(uuid)
  to service_role;
grant execute on function public.create_authoring_api_client(
  uuid, uuid, text, text, text, text[], integer, timestamptz
) to service_role;
grant execute on function public.rotate_authoring_api_client(
  uuid, uuid, text, text, timestamptz
) to service_role;
grant execute on function public.revoke_authoring_api_client(uuid, uuid)
  to service_role;
grant execute on function public.resolve_authoring_api_client(text, uuid)
  to service_role;
grant execute on function public.get_authoring_run(uuid, uuid)
  to service_role;
grant execute on function public.get_authoring_run_summary(uuid, uuid)
  to service_role;
grant execute on function public.list_authoring_runs(uuid, integer, timestamptz, uuid)
  to service_role;
grant execute on function public.get_next_authoring_part(uuid, uuid)
  to service_role;
grant execute on function public.get_authoring_part_submission(uuid, text, uuid)
  to service_role;
grant execute on function public.replay_authoring_command(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.apply_authoring_command(
  uuid, uuid, text, uuid, text, text, jsonb
) to service_role;
grant execute on function public.authoring_storage_diagnostics(uuid)
  to service_role;
grant execute on function public.cleanup_authoring_history(uuid, boolean, timestamptz, timestamptz)
  to service_role;
grant execute on function public.maybe_cleanup_authoring_history()
  to service_role;
grant execute on function public.begin_authoring_official_course_import(
  uuid, uuid, jsonb, text, jsonb
) to service_role;
grant execute on function public.claim_authoring_publication(uuid, uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.record_authoring_publication_failure(
  uuid, uuid, text, text, text, integer
) to service_role;
grant execute on function public.finalize_authoring_official_course_import(uuid, uuid, uuid)
  to service_role;

commit;
