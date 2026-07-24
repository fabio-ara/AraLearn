-- Autoria privada por usuário e materialização relacional atômica.
-- O catálogo oficial continua sob o fluxo editorial já existente.

alter table private.authoring_runs
  drop constraint authoring_runs_target;
alter table private.authoring_runs
  add constraint authoring_runs_target check (
    publication_target in ('catalog', 'private')
  );

alter table private.authoring_api_clients
  drop constraint authoring_api_clients_scopes;
alter table private.authoring_api_clients
  add constraint authoring_api_clients_scopes check (
    cardinality(scopes) between 1 and 8
    and scopes <@ array[
      'authoring:read',
      'authoring:write',
      'authoring:audit',
      'authoring:private:read',
      'authoring:private:write',
      'authoring:private:audit',
      'course:import',
      'catalog:publish',
      'roles:manage'
    ]::text[]
  );

alter table private.authoring_api_clients
  add column issuance_request_id text,
  add column issuance_request_hash text,
  add constraint authoring_api_clients_issuance_request check (
    issuance_request_id is null
    or issuance_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  add constraint authoring_api_clients_issuance_hash check (
    (issuance_request_id is null and issuance_request_hash is null)
    or (
      issuance_request_id is not null
      and issuance_request_hash ~ '^[0-9a-f]{64}$'
    )
  );

create unique index authoring_api_clients_owner_request_uidx
  on private.authoring_api_clients(owner_user_id, issuance_request_id)
  where issuance_request_id is not null;

alter table private.authoring_command_receipts
  add column publication_target text not null default 'catalog',
  add constraint authoring_command_receipts_target check (
    publication_target in ('catalog', 'private')
  );

create or replace function private.authoring_receipt_set_target()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $$
begin
  select run.publication_target into new.publication_target
  from private.authoring_runs run
  where run.id = new.run_id;
  new.publication_target := coalesce(new.publication_target, 'catalog');
  return new;
end;
$$;

create trigger authoring_command_receipts_set_target
before insert on private.authoring_command_receipts
for each row execute function private.authoring_receipt_set_target();

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
      when 'authoring:private:read' then true
      when 'authoring:private:write' then true
      when 'authoring:private:audit' then true
      when 'authoring:read' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'author')
        or private.has_active_app_role(p_user_id, 'reviewer')
        or current_setting('aralearn.private_authoring_delegate_actor', true) = p_user_id::text
      when 'authoring:write' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'author')
        or current_setting('aralearn.private_authoring_delegate_actor', true) = p_user_id::text
      when 'authoring:audit' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'reviewer')
        or current_setting('aralearn.private_authoring_delegate_actor', true) = p_user_id::text
      when 'course:import' then true
      when 'catalog:publish' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
      when 'roles:manage' then private.has_active_app_role(p_user_id, 'owner')
      else false
    end;
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
    when p_run.publication_target = 'private' then
      p_run.created_by = p_actor_id
      and p_action in ('read', 'write', 'audit', 'publish')
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

create or replace function private.private_authoring_integration_json(
  p_client private.authoring_api_clients
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'clientId', p_client.id,
    'name', p_client.name,
    'keyPrefix', p_client.key_prefix,
    'scopes', to_jsonb(p_client.scopes),
    'rateLimitPerMinute', p_client.rate_limit_per_minute,
    'expiresAt', p_client.expires_at,
    'revokedAt', p_client.revoked_at,
    'rotatedFromClientId', p_client.rotated_from_client_id,
    'createdAt', p_client.created_at,
    'lastUsedAt', p_client.last_used_at,
    'active', p_client.revoked_at is null
      and (p_client.expires_at is null or p_client.expires_at > now())
  ));
$$;

create or replace function public.create_private_authoring_integration(
  p_actor_user_id uuid,
  p_request_id text,
  p_name text,
  p_key_prefix text,
  p_api_key_hash text,
  p_expires_in_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth, extensions
as $$
declare
  v_client private.authoring_api_clients%rowtype;
  v_request_hash text;
  v_active_count integer;
  v_scopes constant text[] := array[
    'authoring:private:audit',
    'authoring:private:read',
    'authoring:private:write'
  ]::text[];
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or not exists (select 1 from auth.users account where account.id = p_actor_user_id)
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 80
     or p_key_prefix !~ '^arl_[A-Za-z0-9_-]{6,40}$'
     or lower(p_api_key_hash) !~ '^[0-9a-f]{64}$'
     or p_expires_in_days not between 1 and 365 then
    raise exception 'Dados da integração pessoal inválidos.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'private-authoring-integration:' || p_actor_user_id::text, 0
  ));
  v_request_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'operation', 'create',
      'name', btrim(p_name),
      'expiresInDays', p_expires_in_days
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  select * into v_client
  from private.authoring_api_clients client
  where client.owner_user_id = p_actor_user_id
    and client.issuance_request_id = p_request_id;
  if found then
    if v_client.issuance_request_hash <> v_request_hash
       or v_client.rotated_from_client_id is not null then
      raise exception 'requestId reutilizado com conteúdo diferente.' using errcode = '23505';
    end if;
    return private.private_authoring_integration_json(v_client)
      || jsonb_build_object('idempotent', true);
  end if;
  select count(*)::integer into v_active_count
  from private.authoring_api_clients client
  where client.owner_user_id = p_actor_user_id
    and client.revoked_at is null
    and (client.expires_at is null or client.expires_at > now())
    and client.scopes <@ v_scopes and v_scopes <@ client.scopes;
  if v_active_count >= 5 then
    return jsonb_build_object(
      'status', 'limit_reached',
      'activeCount', v_active_count,
      'activeLimit', 5
    );
  end if;
  insert into private.authoring_api_clients(
    owner_user_id, name, key_prefix, api_key_hash, scopes,
    rate_limit_per_minute, expires_at, created_by,
    issuance_request_id, issuance_request_hash
  ) values (
    p_actor_user_id, btrim(p_name), p_key_prefix, lower(p_api_key_hash), v_scopes,
    30, now() + make_interval(days => p_expires_in_days), p_actor_user_id,
    p_request_id, v_request_hash
  ) returning * into v_client;
  insert into private.authoring_api_client_events(
    client_id, actor_user_id, event_type, details
  ) values (
    v_client.id, p_actor_user_id, 'created',
    jsonb_build_object('scopes', v_client.scopes, 'keyPrefix', v_client.key_prefix)
  );
  return private.private_authoring_integration_json(v_client)
    || jsonb_build_object('idempotent', false, 'activeLimit', 5);
end;
$$;

create or replace function public.list_private_authoring_integrations(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
declare
  v_items jsonb;
  v_active_count integer;
  v_scopes constant text[] := array[
    'authoring:private:audit',
    'authoring:private:read',
    'authoring:private:write'
  ]::text[];
begin
  perform private.require_service_role();
  if p_actor_user_id is null
     or not exists (select 1 from auth.users account where account.id = p_actor_user_id) then
    raise exception 'Sessão de integração inválida.' using errcode = '42501';
  end if;
  select
    coalesce(jsonb_agg(
      private.private_authoring_integration_json(client)
      order by client.created_at desc, client.id desc
    ), '[]'::jsonb),
    count(*) filter (
      where client.revoked_at is null
        and (client.expires_at is null or client.expires_at > now())
    )::integer
  into v_items, v_active_count
  from private.authoring_api_clients client
  where client.owner_user_id = p_actor_user_id
    and client.scopes <@ v_scopes and v_scopes <@ client.scopes;
  return jsonb_build_object(
    'items', v_items,
    'activeCount', v_active_count,
    'activeLimit', 5
  );
end;
$$;

create or replace function public.rotate_private_authoring_integration(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_request_id text,
  p_new_key_prefix text,
  p_new_api_key_hash text,
  p_expires_in_days integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_old private.authoring_api_clients%rowtype;
  v_new private.authoring_api_clients%rowtype;
  v_request_hash text;
  v_scopes constant text[] := array[
    'authoring:private:audit',
    'authoring:private:read',
    'authoring:private:write'
  ]::text[];
begin
  perform private.require_service_role();
  if p_actor_user_id is null or p_client_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_new_key_prefix !~ '^arl_[A-Za-z0-9_-]{6,40}$'
     or lower(p_new_api_key_hash) !~ '^[0-9a-f]{64}$'
     or p_expires_in_days not between 1 and 365 then
    raise exception 'Dados da renovação pessoal inválidos.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'private-authoring-integration:' || p_actor_user_id::text, 0
  ));
  v_request_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'operation', 'rotate',
      'clientId', p_client_id,
      'expiresInDays', p_expires_in_days
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  select * into v_new
  from private.authoring_api_clients client
  where client.owner_user_id = p_actor_user_id
    and client.issuance_request_id = p_request_id;
  if found then
    if v_new.issuance_request_hash <> v_request_hash
       or v_new.rotated_from_client_id is distinct from p_client_id then
      raise exception 'requestId reutilizado com conteúdo diferente.' using errcode = '23505';
    end if;
    return private.private_authoring_integration_json(v_new)
      || jsonb_build_object('idempotent', true);
  end if;
  select * into v_old
  from private.authoring_api_clients client
  where client.id = p_client_id
    and client.owner_user_id = p_actor_user_id
    and client.scopes <@ v_scopes and v_scopes <@ client.scopes
  for update;
  if not found then
    raise exception 'Integração pessoal não encontrada.' using errcode = 'P0002';
  end if;
  if v_old.revoked_at is not null then
    raise exception 'A integração pessoal já foi revogada.' using errcode = '55000';
  end if;
  insert into private.authoring_api_clients(
    owner_user_id, name, key_prefix, api_key_hash, scopes,
    rate_limit_per_minute, expires_at, rotated_from_client_id, created_by,
    issuance_request_id, issuance_request_hash
  ) values (
    p_actor_user_id, v_old.name, p_new_key_prefix, lower(p_new_api_key_hash), v_scopes,
    v_old.rate_limit_per_minute, now() + make_interval(days => p_expires_in_days),
    v_old.id, p_actor_user_id, p_request_id, v_request_hash
  ) returning * into v_new;
  update private.authoring_api_clients client
  set revoked_at = now(), updated_at = now()
  where client.id = v_old.id;
  insert into private.authoring_api_client_events(
    client_id, actor_user_id, event_type, details
  ) values
    (v_old.id, p_actor_user_id, 'rotated',
      jsonb_build_object('replacementClientId', v_new.id)),
    (v_new.id, p_actor_user_id, 'created',
      jsonb_build_object('rotatedFromClientId', v_old.id));
  return private.private_authoring_integration_json(v_new)
    || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.revoke_private_authoring_integration(
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
  v_was_revoked boolean;
  v_scopes constant text[] := array[
    'authoring:private:audit',
    'authoring:private:read',
    'authoring:private:write'
  ]::text[];
begin
  perform private.require_service_role();
  select * into v_client
  from private.authoring_api_clients client
  where client.id = p_client_id
    and client.owner_user_id = p_actor_user_id
    and client.scopes <@ v_scopes and v_scopes <@ client.scopes
  for update;
  if not found then
    raise exception 'Integração pessoal não encontrada.' using errcode = 'P0002';
  end if;
  v_was_revoked := v_client.revoked_at is not null;
  if not v_was_revoked then
    update private.authoring_api_clients client
    set revoked_at = now(), updated_at = now()
    where client.id = v_client.id
    returning * into v_client;
    insert into private.authoring_api_client_events(
      client_id, actor_user_id, event_type
    ) values (v_client.id, p_actor_user_id, 'revoked');
  end if;
  return private.private_authoring_integration_json(v_client)
    || jsonb_build_object('idempotent', v_was_revoked);
end;
$$;

create unique index authoring_runs_active_private_key_uidx
  on private.authoring_runs(created_by, contract_key)
  where publication_target = 'private'
    and status not in ('published', 'cancelled');

create table private.authoring_private_imports (
  import_id uuid primary key,
  run_id uuid not null unique
    references private.authoring_runs(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  api_client_id uuid references private.authoring_api_clients(id) on delete set null,
  course_id uuid not null,
  contract_key text not null,
  course_payload jsonb not null,
  source_hash text not null,
  expected_counts jsonb not null,
  status text not null default 'staging',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authoring_private_imports_payload check (
    jsonb_typeof(course_payload) = 'object'
  ),
  constraint authoring_private_imports_hash check (
    source_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint authoring_private_imports_counts check (
    jsonb_typeof(expected_counts) = 'object'
  ),
  constraint authoring_private_imports_status check (
    status in ('staging', 'published')
  )
);

create table private.authoring_private_import_chunks (
  import_id uuid not null
    references private.authoring_private_imports(import_id) on delete cascade,
  store_name text not null,
  chunk_index integer not null,
  row_count integer not null,
  payload_hash text not null,
  applied_at timestamptz not null default now(),
  primary key(import_id, store_name, chunk_index),
  constraint authoring_private_import_chunks_index check (chunk_index >= 0),
  constraint authoring_private_import_chunks_count check (row_count > 0),
  constraint authoring_private_import_chunks_hash check (
    payload_hash ~ '^[0-9a-f]{64}$'
  )
);

create table private.authoring_private_import_stage_rows (
  import_id uuid not null
    references private.authoring_private_imports(import_id) on delete cascade,
  store_name text not null,
  entity_id uuid not null,
  payload jsonb not null,
  payload_hash text not null,
  primary key(import_id, store_name, entity_id),
  constraint authoring_private_import_stage_payload check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint authoring_private_import_stage_hash check (
    payload_hash ~ '^[0-9a-f]{64}$'
  )
);

create index authoring_private_imports_actor_idx
  on private.authoring_private_imports(actor_user_id, updated_at, import_id);
create index authoring_private_stage_rows_store_idx
  on private.authoring_private_import_stage_rows(import_id, store_name, entity_id);

create or replace function private.authoring_clear_private_stage_after_compaction()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if old.terminal_compacted_at is null
     and new.terminal_compacted_at is not null then
    delete from private.authoring_private_imports stage
    where stage.run_id = new.id;
  end if;
  return new;
end;
$$;

create trigger authoring_runs_clear_private_stage_after_compaction
after update of terminal_compacted_at on private.authoring_runs
for each row execute function private.authoring_clear_private_stage_after_compaction();

create or replace function private.authoring_private_scope_for_command(p_command text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_command in ('audit_part', 'reopen_part', 'validate')
      then 'authoring:private:audit'
    when p_command = 'read' then 'authoring:private:read'
    else 'authoring:private:write'
  end;
$$;

create or replace function private.authoring_assert_private_identity(
  p_run_id uuid,
  p_actor_id uuid,
  p_client_id uuid,
  p_scope text
)
returns private.authoring_runs
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $$
declare
  v_run private.authoring_runs%rowtype;
begin
  select * into v_run
  from private.authoring_runs run
  where run.id = p_run_id;
  if not found
     or v_run.publication_target <> 'private'
     or v_run.created_by <> p_actor_id
     or not private.user_can_use_authoring_scope(p_actor_id, p_scope)
     or not private.authoring_client_has_scope(p_client_id, p_actor_id, p_scope) then
    raise exception 'Execução privada não autorizada.' using errcode = '42501';
  end if;
  return v_run;
end;
$$;

create or replace function public.replay_authoring_command_dispatch(
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
set search_path = pg_catalog, public, private
as $$
declare
  v_event private.authoring_command_events%rowtype;
  v_receipt private.authoring_command_receipts%rowtype;
  v_target text;
  v_scope text;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_api_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Consulta idempotente inválida.' using errcode = '22023';
  end if;

  select event.* into v_event
  from private.authoring_command_events event
  where event.actor_user_id = p_actor_id and event.request_id = p_request_id;
  if found then
    select run.publication_target into v_target
    from private.authoring_runs run where run.id = v_event.run_id;
    if v_event.api_request_hash is null then return null; end if;
    if v_event.api_request_hash <> p_api_request_hash then
      raise exception 'requestId reutilizado com conteúdo diferente.' using errcode = '22023';
    end if;
  else
    select receipt.* into v_receipt
    from private.authoring_command_receipts receipt
    where receipt.actor_user_id = p_actor_id and receipt.request_id = p_request_id;
    if not found or v_receipt.api_request_hash is null then return null; end if;
    if v_receipt.api_request_hash <> p_api_request_hash then
      raise exception 'requestId reutilizado com conteúdo diferente.' using errcode = '22023';
    end if;
    v_target := v_receipt.publication_target;
  end if;

  if v_target <> 'private' then
    return public.replay_authoring_command(
      p_actor_id, p_client_id, p_request_id, p_api_request_hash, p_required_scope
    );
  end if;
  v_scope := case when p_required_scope = 'authoring:audit'
    then 'authoring:private:audit' else 'authoring:private:write' end;
  if not private.user_can_use_authoring_scope(p_actor_id, v_scope)
     or not private.authoring_client_has_scope(p_client_id, p_actor_id, v_scope) then
    raise exception 'Autorização atual insuficiente para recuperar a resposta.'
      using errcode = '42501';
  end if;
  return coalesce(v_event.result, v_receipt.result)
    || jsonb_build_object('idempotent', true);
end;
$$;

create or replace function public.dispatch_authoring_command(
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
  v_api_request_hash text;
  v_request_hash text;
  v_target text;
  v_scope text;
  v_run private.authoring_runs%rowtype;
  v_event private.authoring_command_events%rowtype;
  v_receipt private.authoring_command_receipts%rowtype;
  v_title text;
  v_contract_key text;
  v_result jsonb;
  v_next_step integer;
begin
  perform private.require_service_role();
  if p_actor_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_command is null
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'Comando de autoria inválido.' using errcode = '22023';
  end if;
  v_api_request_hash := nullif(v_payload->>'_apiRequestHash', '');
  if v_payload ? '_apiRequestHash'
     and (v_api_request_hash is null or v_api_request_hash !~ '^[a-f0-9]{64}$') then
    raise exception 'Hash da requisição da API inválido.' using errcode = '22023';
  end if;
  v_payload := v_payload - '_apiRequestHash';
  v_target := case when p_command = 'create_run' then coalesce(
    nullif(v_payload->>'publicationTarget', ''),
    nullif(v_payload->>'target', ''),
    'catalog'
  ) else (
    select run.publication_target from private.authoring_runs run where run.id = p_run_id
  ) end;
  if coalesce(v_target, 'catalog') <> 'private' then
    return public.apply_authoring_command(
      p_actor_id, p_client_id, p_request_id, p_run_id,
      p_command, p_part_key, p_payload
    );
  end if;

  v_scope := private.authoring_private_scope_for_command(p_command);
  if not private.user_can_use_authoring_scope(p_actor_id, v_scope)
     or not private.authoring_client_has_scope(p_client_id, p_actor_id, v_scope) then
    raise exception 'Escopo de autoria privada insuficiente.' using errcode = '42501';
  end if;
  v_request_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'runId', p_run_id,
      'command', p_command,
      'partKey', p_part_key,
      'payload', v_payload
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    p_actor_id::text || ':' || p_request_id, 0
  ));

  select * into v_event from private.authoring_command_events event
  where event.actor_user_id = p_actor_id and event.request_id = p_request_id;
  if found then
    if (v_event.api_request_hash is not null and v_api_request_hash is not null
        and v_event.api_request_hash <> v_api_request_hash)
       or ((v_event.api_request_hash is null or v_api_request_hash is null)
        and v_event.request_hash <> v_request_hash) then
      raise exception 'requestId reutilizado com conteúdo diferente.' using errcode = '22023';
    end if;
    if v_event.command = 'prepare_publish' then
      select * into v_run from private.authoring_runs run where run.id = v_event.run_id;
      return v_event.result || jsonb_build_object(
        'document', v_run.assembled_document, 'idempotent', true
      );
    end if;
    return v_event.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_receipt from private.authoring_command_receipts receipt
  where receipt.actor_user_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.publication_target <> 'private'
       or (v_receipt.api_request_hash is not null and v_api_request_hash is not null
         and v_receipt.api_request_hash <> v_api_request_hash)
       or ((v_receipt.api_request_hash is null or v_api_request_hash is null)
         and v_receipt.request_hash <> v_request_hash) then
      raise exception 'requestId reutilizado com conteúdo diferente.' using errcode = '22023';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  if p_command = 'create_run' then
    if p_run_id is null or exists (
      select 1 from private.authoring_retention_events retained where retained.run_id = p_run_id
    ) then
      raise exception 'Identificador de execução inválido ou já encerrado.' using errcode = '23505';
    end if;
    v_title := nullif(btrim(v_payload->>'title'), '');
    v_contract_key := nullif(btrim(v_payload->>'contractKey'), '');
    if v_title is null or char_length(v_title) > 300
       or v_contract_key is null or char_length(v_contract_key) > 240
       or v_payload->'publicationIntent'->>'mode' <> 'create'
       or v_payload->'publicationIntent' ? 'existingCourseId'
       or v_payload->'publicationIntent' ? 'expectedContentHash'
       or nullif(v_payload->>'collectionId', '') is not null
       or jsonb_typeof(coalesce(v_payload->'brief', '{}'::jsonb)) <> 'object'
       or pg_column_size(coalesce(v_payload->'brief', '{}'::jsonb)) > 32768 then
      raise exception 'Dados da execução privada inválidos.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.courses course
      where course.owner_id = p_actor_id
        and course.contract_key = v_contract_key
        and course.deleted_at is null
    ) then
      raise exception 'Já existe um curso privado com esse identificador.' using errcode = '23505';
    end if;
    if (select count(*) from private.authoring_runs run
        where run.created_by = p_actor_id
          and run.status not in ('published', 'cancelled')) >= 2
       or (p_client_id is not null and (select count(*) from private.authoring_runs run
        where run.api_client_id = p_client_id
          and run.status not in ('published', 'cancelled')) >= 2) then
      raise exception 'Há duas execuções de autoria ativas.' using errcode = '54000';
    end if;
    insert into private.authoring_runs(
      id, created_by, api_client_id, publication_target, collection_id,
      collection_explicit, publication_intent, contract_key, title, brief
    ) values (
      p_run_id, p_actor_id, p_client_id, 'private', null,
      false, 'create', v_contract_key, v_title,
      coalesce(v_payload->'brief', '{}'::jsonb)
    ) returning * into v_run;
    v_result := jsonb_build_object(
      'status', 'planning', 'runId', v_run.id,
      'publicationTarget', 'private'
    );
  elsif p_command = 'prepare_publish' then
    select * into v_run from private.authoring_runs run
    where run.id = p_run_id for update;
    if not found or v_run.created_by <> p_actor_id
       or v_run.publication_target <> 'private' then
      raise exception 'Execução privada não autorizada.' using errcode = '42501';
    end if;
    if v_run.status = 'published' then
      return jsonb_build_object(
        'status', 'published', 'runId', v_run.id,
        'courseId', v_run.course_id, 'documentHash', v_run.document_hash,
        'publicationTarget', 'private', 'idempotent', true
      );
    end if;
    if v_run.status not in ('validated', 'publishing')
       or v_run.assembled_document is null or v_run.document_hash is null then
      raise exception 'Somente um curso validado pode ser materializado.' using errcode = 'AR409';
    end if;
    if v_run.publication_error->>'kind' = 'deterministic' then
      raise exception 'A falha da materialização exige correção ou cancelamento.'
        using errcode = '55000';
    end if;
    if v_payload ? 'nextStep' then
      if coalesce(v_payload->>'nextStep', '') !~ '^[0-9]+$' then
        raise exception 'Cursor de materialização inválido.' using errcode = '22023';
      end if;
      v_next_step := (v_payload->>'nextStep')::integer;
      if v_next_step < v_run.publication_step
         or v_next_step > v_run.publication_step + 1000 then
        raise exception 'O cursor de materialização não pode retroceder ou saltar.'
          using errcode = '22023';
      end if;
    else
      v_next_step := v_run.publication_step;
    end if;
    update private.authoring_runs run
    set status = 'publishing',
        publication_actor_id = p_actor_id,
        publication_client_id = p_client_id,
        publication_step = v_next_step,
        publication_error = null,
        revision = revision + 1,
        updated_at = now()
    where run.id = v_run.id returning * into v_run;
    v_result := jsonb_build_object(
      'status', 'publishing', 'runId', v_run.id,
      'target', 'private', 'publicationTarget', 'private',
      'publicationIntent', 'create', 'documentHash', v_run.document_hash,
      'document', v_run.assembled_document,
      'publicationStep', v_run.publication_step
    );
  else
    perform private.authoring_assert_private_identity(
      p_run_id, p_actor_id, p_client_id, v_scope
    );
    if p_command = 'cancel_run' then
      delete from private.authoring_private_imports stage where stage.run_id = p_run_id;
    end if;
    perform set_config('aralearn.private_authoring_delegate_actor', p_actor_id::text, true);
    v_result := public.apply_authoring_command(
      p_actor_id, null, p_request_id, p_run_id,
      p_command, p_part_key, p_payload
    );
    update private.authoring_command_events event
    set api_client_id = p_client_id
    where event.actor_user_id = p_actor_id and event.request_id = p_request_id;
    return v_result;
  end if;

  perform private.authoring_assert_staging_quota(
    p_actor_id, p_run_id,
    private.authoring_row_storage_charge(jsonb_build_object(
      'run_id', p_run_id, 'actor_user_id', p_actor_id,
      'api_client_id', p_client_id, 'request_id', p_request_id,
      'command', p_command, 'part_key', p_part_key,
      'api_request_hash', v_api_request_hash, 'request_hash', v_request_hash,
      'result', (v_result - 'document') || jsonb_build_object('idempotent', false)
    )), 0
  );
  insert into private.authoring_command_events(
    run_id, actor_user_id, api_client_id, request_id,
    command, part_key, api_request_hash, request_hash, result
  ) values (
    p_run_id, p_actor_id, p_client_id, p_request_id,
    p_command, p_part_key, v_api_request_hash, v_request_hash,
    (v_result - 'document') || jsonb_build_object('idempotent', false)
  );
  update private.authoring_runs run
  set expires_at = now() + interval '30 days'
  where run.id = p_run_id and run.status not in ('published', 'cancelled');
  return v_result || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.begin_authoring_private_course_import(
  p_import_id uuid,
  p_run_id uuid,
  p_actor_id uuid,
  p_client_id uuid,
  p_course jsonb,
  p_source_hash text,
  p_expected_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
set statement_timeout = '30s'
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_existing private.authoring_private_imports%rowtype;
  v_course_id uuid := private.try_uuid(p_course->>'id');
  v_contract_key text := nullif(btrim(p_course->>'contractKey'), '');
begin
  perform private.require_service_role();
  v_run := private.authoring_assert_private_identity(
    p_run_id, p_actor_id, p_client_id, 'authoring:private:write'
  );
  if v_run.status = 'published' and v_run.course_id = v_course_id then
    return jsonb_build_object(
      'status', 'published', 'runId', p_run_id,
      'courseId', v_run.course_id, 'idempotent', true
    );
  end if;
  if v_run.status <> 'publishing'
     or v_run.publication_actor_id <> p_actor_id
     or v_run.publication_client_id is distinct from p_client_id
     or p_import_id is null or v_course_id is null or v_contract_key is null
     or p_source_hash <> v_run.document_hash
     or p_source_hash !~ '^[0-9a-f]{64}$'
     or v_contract_key <> v_run.contract_key then
    raise exception 'Materialização privada incompatível com a execução.' using errcode = '23514';
  end if;
  perform private.assert_official_import_manifest(p_expected_counts);
  perform pg_advisory_xact_lock(hashtextextended('private-authoring:' || p_run_id::text, 0));
  select * into v_existing from private.authoring_private_imports stage
  where stage.import_id = p_import_id for update;
  if found then
    if v_existing.run_id <> p_run_id or v_existing.actor_user_id <> p_actor_id
       or v_existing.api_client_id is distinct from p_client_id
       or v_existing.course_id <> v_course_id
       or v_existing.source_hash <> p_source_hash
       or v_existing.expected_counts <> p_expected_counts
       or v_existing.course_payload <> p_course then
      raise exception 'importId reutilizado com manifesto incompatível.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', v_existing.status, 'importId', p_import_id,
      'courseId', v_course_id, 'idempotent', true
    );
  end if;
  if exists (
    select 1 from private.authoring_private_imports stage where stage.run_id = p_run_id
  ) then
    raise exception 'A execução já possui outra materialização.' using errcode = '23514';
  end if;
  insert into private.authoring_private_imports(
    import_id, run_id, actor_user_id, api_client_id, course_id,
    contract_key, course_payload, source_hash, expected_counts
  ) values (
    p_import_id, p_run_id, p_actor_id, p_client_id, v_course_id,
    v_contract_key, p_course, p_source_hash, p_expected_counts
  );
  perform private.authoring_assert_staging_quota(p_actor_id, p_run_id, 0, 0);
  return jsonb_build_object(
    'status', 'staging', 'importId', p_import_id,
    'courseId', v_course_id, 'idempotent', false
  );
end;
$$;

create or replace function public.apply_authoring_private_course_import_chunk(
  p_import_id uuid,
  p_run_id uuid,
  p_actor_id uuid,
  p_client_id uuid,
  p_store_name text,
  p_chunk_index integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
set statement_timeout = '30s'
as $$
declare
  v_stage private.authoring_private_imports%rowtype;
  v_chunk private.authoring_private_import_chunks%rowtype;
  v_row jsonb;
  v_id uuid;
  v_count integer;
  v_hash text;
  v_row_hash text;
  v_applied integer;
begin
  perform private.require_service_role();
  perform private.authoring_assert_private_identity(
    p_run_id, p_actor_id, p_client_id, 'authoring:private:write'
  );
  if p_store_name is null
     or not (p_store_name = any(private.official_import_store_names()))
     or p_chunk_index is null or p_chunk_index < 0
     or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Chunk privado inválido.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('private-authoring:' || p_run_id::text, 0));
  select * into v_stage from private.authoring_private_imports stage
  where stage.import_id = p_import_id and stage.run_id = p_run_id for update;
  if not found or v_stage.status <> 'staging'
     or v_stage.actor_user_id <> p_actor_id
     or v_stage.api_client_id is distinct from p_client_id then
    raise exception 'Materialização privada indisponível.' using errcode = '23514';
  end if;
  v_count := jsonb_array_length(p_rows);
  v_hash := encode(extensions.digest(convert_to(p_rows::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_chunk from private.authoring_private_import_chunks chunk
  where chunk.import_id = p_import_id and chunk.store_name = p_store_name
    and chunk.chunk_index = p_chunk_index;
  if found then
    if v_chunk.payload_hash <> v_hash or v_chunk.row_count <> v_count then
      raise exception 'Chunk reutilizado com payload incompatível.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', 'applied', 'importId', p_import_id,
      'storeName', p_store_name, 'chunkIndex', p_chunk_index,
      'rowCount', v_count, 'idempotent', true
    );
  end if;
  select coalesce(sum(chunk.row_count), 0)::integer into v_applied
  from private.authoring_private_import_chunks chunk
  where chunk.import_id = p_import_id and chunk.store_name = p_store_name;
  if v_applied + v_count > (v_stage.expected_counts->>p_store_name)::integer then
    raise exception 'Chunks excedem o manifesto de %.', p_store_name using errcode = '23514';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_id := private.try_uuid(v_row->>'id');
    if v_id is null
       or private.try_uuid(v_row->>'courseId') is distinct from v_stage.course_id then
      raise exception 'Linha inválida ou pertencente a outro curso em %.', p_store_name
        using errcode = '23514';
    end if;
    v_row_hash := encode(extensions.digest(convert_to(v_row::text, 'UTF8'), 'sha256'), 'hex');
    if exists (
      select 1 from private.authoring_private_import_stage_rows row_value
      where row_value.import_id = p_import_id
        and row_value.store_name = p_store_name
        and row_value.entity_id = v_id
        and row_value.payload_hash <> v_row_hash
    ) then
      raise exception 'Entidade privada reutilizada com payload incompatível.' using errcode = '23514';
    end if;
    insert into private.authoring_private_import_stage_rows(
      import_id, store_name, entity_id, payload, payload_hash
    ) values (p_import_id, p_store_name, v_id, v_row, v_row_hash)
    on conflict(import_id, store_name, entity_id) do nothing;
  end loop;
  insert into private.authoring_private_import_chunks(
    import_id, store_name, chunk_index, row_count, payload_hash
  ) values (p_import_id, p_store_name, p_chunk_index, v_count, v_hash);
  update private.authoring_private_imports stage
  set updated_at = now() where stage.import_id = p_import_id;
  perform private.authoring_assert_staging_quota(p_actor_id, p_run_id, 0, 0);
  return jsonb_build_object(
    'status', 'applied', 'importId', p_import_id,
    'storeName', p_store_name, 'chunkIndex', p_chunk_index,
    'rowCount', v_count, 'idempotent', false
  );
end;
$$;

create or replace function public.claim_authoring_private_materialization(
  p_run_id uuid,
  p_actor_id uuid,
  p_client_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 130
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_run private.authoring_runs%rowtype;
begin
  perform private.require_service_role();
  v_run := private.authoring_assert_private_identity(
    p_run_id, p_actor_id, p_client_id, 'authoring:private:write'
  );
  select * into v_run from private.authoring_runs run where run.id = p_run_id for update;
  if v_run.status = 'published' then
    return jsonb_build_object(
      'status', 'published', 'runId', v_run.id,
      'courseId', v_run.course_id, 'idempotent', true
    );
  end if;
  if v_run.status <> 'publishing' or p_lease_token is null
     or p_lease_seconds not between 30 and 300 then
    raise exception 'Lease de materialização inválido.' using errcode = '55000';
  end if;
  if v_run.publication_lease_until > clock_timestamp()
     and v_run.publication_lease_token is distinct from p_lease_token then
    return jsonb_build_object(
      'status', 'publishing', 'runId', v_run.id,
      'leaseAcquired', false, 'pollAfterSeconds', 3,
      'publicationLeaseUntil', v_run.publication_lease_until
    );
  end if;
  update private.authoring_runs run
  set publication_lease_token = p_lease_token,
      publication_lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where run.id = p_run_id returning * into v_run;
  return jsonb_build_object(
    'status', 'publishing', 'runId', v_run.id,
    'leaseAcquired', true, 'pollAfterSeconds', 3,
    'publicationLeaseUntil', v_run.publication_lease_until
  );
end;
$$;

create or replace function public.record_authoring_private_materialization_failure(
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
set search_path = pg_catalog, private
as $$
declare
  v_error jsonb;
begin
  perform private.require_service_role();
  if p_kind not in ('transient', 'deterministic')
     or p_lease_token is null or nullif(p_code, '') is null
     or nullif(p_message, '') is null then
    raise exception 'Falha de materialização inválida.' using errcode = '22023';
  end if;
  v_error := jsonb_build_object(
    'kind', p_kind, 'code', left(p_code, 120),
    'message', left(p_message, 1000), 'httpStatus', p_http_status,
    'recordedAt', clock_timestamp()
  );
  update private.authoring_runs run
  set publication_error = v_error,
      publication_lease_token = null,
      publication_lease_until = null,
      updated_at = now()
  where run.id = p_run_id
    and run.publication_target = 'private'
    and run.status = 'publishing'
    and run.publication_lease_token = p_lease_token;
  return jsonb_build_object(
    'status', 'publishing',
    'phase', case p_kind when 'deterministic' then 'failed' else 'retry' end,
    'runId', p_run_id, 'publicationError', v_error
  );
end;
$$;

create or replace function public.finalize_authoring_private_course_import(
  p_import_id uuid,
  p_run_id uuid,
  p_actor_id uuid,
  p_client_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '0'
as $$
declare
  v_run private.authoring_runs%rowtype;
  v_stage private.authoring_private_imports%rowtype;
  v_store text;
  v_expected integer;
  v_staged integer;
  v_row record;
  v_result jsonb;
  v_validation jsonb;
  v_selection_id uuid := gen_random_uuid();
begin
  perform private.require_service_role();
  v_run := private.authoring_assert_private_identity(
    p_run_id, p_actor_id, p_client_id, 'authoring:private:write'
  );
  select * into v_run from private.authoring_runs run
  where run.id = p_run_id for update;
  if v_run.status = 'published' then
    return jsonb_build_object(
      'status', 'published', 'runId', v_run.id,
      'courseId', v_run.course_id, 'visibility', 'private',
      'idempotent', true
    );
  end if;
  if v_run.status <> 'publishing'
     or v_run.publication_actor_id <> p_actor_id
     or v_run.publication_client_id is distinct from p_client_id
     or v_run.publication_lease_token <> p_lease_token
     or v_run.publication_lease_until <= clock_timestamp() then
    raise exception 'Lease de materialização ausente ou expirado.' using errcode = '55P03';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('private-authoring:' || p_run_id::text, 0));
  select * into v_stage from private.authoring_private_imports stage
  where stage.import_id = p_import_id and stage.run_id = p_run_id for update;
  if not found or v_stage.status <> 'staging'
     or v_stage.actor_user_id <> p_actor_id
     or v_stage.api_client_id is distinct from p_client_id
     or v_stage.source_hash <> v_run.document_hash then
    raise exception 'Staging privado incompatível.' using errcode = '23514';
  end if;
  foreach v_store in array private.official_import_store_names() loop
    v_expected := (v_stage.expected_counts->>v_store)::integer;
    select count(*)::integer into v_staged
    from private.authoring_private_import_stage_rows row_value
    where row_value.import_id = p_import_id and row_value.store_name = v_store;
    if v_staged <> v_expected then
      raise exception 'Materialização incompleta em %: % de % linhas.',
        v_store, v_staged, v_expected using errcode = '23514';
    end if;
  end loop;
  if exists (
    select 1 from public.courses course
    where course.owner_id = p_actor_id
      and course.contract_key = v_stage.contract_key
      and course.deleted_at is null
  ) then
    raise exception 'Já existe curso privado com esse identificador.' using errcode = '23505';
  end if;

  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  set constraints all deferred;
  insert into public.courses(
    id, owner_id, source_course_id, status, contract_key, title, goal,
    contract_scope, publication_seq, content_hash, project_id, position
  ) values (
    v_stage.course_id, p_actor_id, null, 'draft', v_stage.contract_key,
    v_stage.course_payload->>'title', v_stage.course_payload->>'goal',
    v_stage.course_payload->>'contractScope', 0, v_stage.source_hash,
    private.try_uuid(v_stage.course_payload->>'projectId'),
    coalesce((select max(course.position) + 1 from public.courses course
      where course.owner_id = p_actor_id), 0)
  );

  foreach v_store in array private.official_import_store_names() loop
    for v_row in
      select row_value.entity_id, row_value.payload
      from private.authoring_private_import_stage_rows row_value
      where row_value.import_id = p_import_id and row_value.store_name = v_store
      order by row_value.entity_id
    loop
      v_result := private.apply_official_stage_row(
        v_store, v_stage.course_id, v_row.entity_id, v_row.payload
      );
      if v_result is null then
        raise exception 'Falha atômica ao materializar %/%', v_store, v_row.entity_id
          using errcode = '23514';
      end if;
    end loop;
  end loop;

  v_validation := public.validate_course_graph(v_stage.course_id);
  if not coalesce((v_validation->>'valid')::boolean, false) then
    raise exception 'Curso privado inválido: %', v_validation->'errors' using errcode = '23514';
  end if;
  update public.courses course
  set status = 'published', content_hash = v_stage.source_hash,
      updated_at = now()
  where course.id = v_stage.course_id and course.owner_id = p_actor_id;
  perform set_config('aralearn.suppress_sync_changes', 'off', true);
  insert into public.user_course_selections(id, user_id, course_id, position)
  values (
    v_selection_id, p_actor_id, v_stage.course_id,
    coalesce((select max(selection.position) + 1
      from public.user_course_selections selection
      where selection.user_id = p_actor_id), 0)
  );

  perform private.authoring_compact_terminal_payloads(v_run.id);
  update private.authoring_runs run
  set status = 'published', course_id = v_stage.course_id,
      plan = jsonb_strip_nulls(jsonb_build_object(
        'compacted', true, 'artifact', run.plan->'artifact',
        'version', run.plan->'version', 'runId', run.id,
        'partCount', (select count(*) from private.authoring_parts part
          where part.run_id = run.id)
      )),
      assembled_document = null,
      publication_lease_token = null,
      publication_lease_until = null,
      publication_error = null,
      revision = revision + 1,
      published_at = now(), updated_at = now()
  where run.id = v_run.id;
  update private.authoring_private_imports stage
  set status = 'published', updated_at = now()
  where stage.import_id = p_import_id;
  delete from private.authoring_private_imports stage
  where stage.import_id = p_import_id;
  return jsonb_build_object(
    'status', 'published', 'runId', p_run_id,
    'courseId', v_stage.course_id, 'selectionId', v_selection_id,
    'contentHash', v_stage.source_hash, 'visibility', 'private',
    'validation', v_validation, 'idempotent', false
  );
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
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(command_event)))
          from private.authoring_command_events command_event
          where command_event.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(stage)))
          from private.official_catalog_imports stage
          where stage.authoring_run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(stage_row)))
          from private.official_catalog_import_stage_rows stage_row
          join private.official_catalog_imports stage on stage.import_id = stage_row.import_id
          where stage.authoring_run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(chunk)))
          from private.official_catalog_import_chunks chunk
          join private.official_catalog_imports stage on stage.import_id = chunk.import_id
          where stage.authoring_run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(stage)))
          from private.authoring_private_imports stage where stage.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(stage_row)))
          from private.authoring_private_import_stage_rows stage_row
          join private.authoring_private_imports stage on stage.import_id = stage_row.import_id
          where stage.run_id = run.id), 0)
      + coalesce((select sum(private.authoring_row_storage_charge(to_jsonb(chunk)))
          from private.authoring_private_import_chunks chunk
          join private.authoring_private_imports stage on stage.import_id = chunk.import_id
          where stage.run_id = run.id), 0)
    from private.authoring_runs run where run.id = p_run_id
  ), 0)::bigint;
$$;

comment on table private.authoring_private_imports is
  'Staging transitório de um curso privado; nenhuma linha didática fica visível antes do commit final.';
comment on function public.dispatch_authoring_command(uuid,uuid,text,uuid,text,text,jsonb) is
  'Separa o protocolo oficial do privado e exige o escopo correspondente ao destino.';
comment on function public.finalize_authoring_private_course_import(uuid,uuid,uuid,uuid,uuid) is
  'Valida e materializa uma execução privada, cria a seleção e conclui a execução na mesma transação.';
comment on function public.create_private_authoring_integration(uuid,text,text,text,text,integer) is
  'Emite metadados de uma integração pessoal com escopos privados fixos; a chave original não entra no banco.';
comment on function public.rotate_private_authoring_integration(uuid,uuid,text,text,text,integer) is
  'Substitui atomicamente uma integração pessoal do próprio usuário e revoga a anterior.';

revoke all on table private.authoring_private_imports
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_private_import_chunks
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_private_import_stage_rows
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_clear_private_stage_after_compaction()
  from public, anon, authenticated, service_role;
revoke all on function private.private_authoring_integration_json(private.authoring_api_clients)
  from public, anon, authenticated, service_role;
revoke all on function public.create_private_authoring_integration(uuid,text,text,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.list_private_authoring_integrations(uuid)
  from public, anon, authenticated;
revoke all on function public.rotate_private_authoring_integration(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.revoke_private_authoring_integration(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.dispatch_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.replay_authoring_command_dispatch(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.begin_authoring_private_course_import(uuid,uuid,uuid,uuid,jsonb,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_authoring_private_course_import_chunk(uuid,uuid,uuid,uuid,text,integer,jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_authoring_private_materialization(uuid,uuid,uuid,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.record_authoring_private_materialization_failure(uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.finalize_authoring_private_course_import(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.dispatch_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)
  to service_role;
grant execute on function public.replay_authoring_command_dispatch(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.begin_authoring_private_course_import(uuid,uuid,uuid,uuid,jsonb,text,jsonb)
  to service_role;
grant execute on function public.apply_authoring_private_course_import_chunk(uuid,uuid,uuid,uuid,text,integer,jsonb)
  to service_role;
grant execute on function public.claim_authoring_private_materialization(uuid,uuid,uuid,uuid,integer)
  to service_role;
grant execute on function public.record_authoring_private_materialization_failure(uuid,uuid,text,text,text,integer)
  to service_role;
grant execute on function public.finalize_authoring_private_course_import(uuid,uuid,uuid,uuid,uuid)
  to service_role;
grant execute on function public.create_private_authoring_integration(uuid,text,text,text,text,integer)
  to service_role;
grant execute on function public.list_private_authoring_integrations(uuid)
  to service_role;
grant execute on function public.rotate_private_authoring_integration(uuid,uuid,text,text,text,integer)
  to service_role;
grant execute on function public.revoke_private_authoring_integration(uuid,uuid)
  to service_role;
