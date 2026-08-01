-- Workspaces educacionais: papéis locais, convites efêmeros e governança
-- corrente sobre o mesmo workspace composto usado pela autoria. Nenhum curso,
-- card ou artefato é duplicado por esta migration.

begin;

alter table private.authoring_workspaces
  add column purpose text not null default '',
  add column workspace_kind text not null default 'personal',
  add column visibility text not null default 'members';

alter table private.authoring_workspaces
  add constraint authoring_workspaces_purpose_v1 check (
    char_length(purpose) <= 1000
  ),
  add constraint authoring_workspaces_kind_v1 check (
    workspace_kind in ('personal', 'class', 'team')
  ),
  add constraint authoring_workspaces_visibility_v1 check (
    visibility in ('private', 'members')
  );

create table private.educational_workspace_members (
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  granted_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id, user_id),
  constraint educational_workspace_members_role_v1 check (
    role in ('owner', 'admin', 'author', 'reviewer', 'learner', 'reader')
  )
);

create index educational_workspace_members_user_v1_idx
  on private.educational_workspace_members(user_id, updated_at desc, workspace_id);

insert into private.educational_workspace_members(
  workspace_id, user_id, role, granted_by, joined_at, updated_at
)
select workspace.id, workspace.owner_id, 'owner', workspace.owner_id,
  workspace.created_at, workspace.updated_at
from private.authoring_workspaces workspace
on conflict(workspace_id, user_id) do update
set role = 'owner', updated_at = excluded.updated_at;

create function private.ensure_workspace_primary_owner_membership_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  insert into private.educational_workspace_members(
    workspace_id, user_id, role, granted_by
  ) values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict(workspace_id, user_id) do update
    set role = 'owner', updated_at = now();
  return new;
end;
$function$;

create trigger ensure_workspace_primary_owner_membership_v1
after insert on private.authoring_workspaces
for each row execute function
  private.ensure_workspace_primary_owner_membership_v1();

create table private.educational_workspace_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  email text not null,
  role text not null,
  code_hash text not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  unique(workspace_id, email),
  unique(code_hash),
  constraint educational_workspace_invitations_email_v1 check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint educational_workspace_invitations_role_v1 check (
    role in ('admin', 'author', 'reviewer', 'learner', 'reader')
  ),
  constraint educational_workspace_invitations_hash_v1 check (
    code_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint educational_workspace_invitations_expiry_v1 check (
    expires_at > created_at and expires_at <= created_at + interval '7 days'
  )
);

create index educational_workspace_invitations_expiry_v1_idx
  on private.educational_workspace_invitations(expires_at, workspace_id);

create table private.educational_workspace_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  operation text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key(actor_id, request_id),
  constraint educational_workspace_receipts_request_v1 check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint educational_workspace_receipts_operation_v1 check (
    operation in (
      'create', 'update', 'invite', 'accept_invite', 'cancel_invite',
      'set_role', 'remove_member', 'transfer_owner', 'leave'
    )
  ),
  constraint educational_workspace_receipts_hash_v1 check (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint educational_workspace_receipts_result_v1 check (
    jsonb_typeof(result) = 'object' and pg_column_size(result) <= 32768
  ),
  constraint educational_workspace_receipts_expiry_v1 check (
    expires_at > created_at
  )
);

create index educational_workspace_receipts_expiry_v1_idx
  on private.educational_workspace_receipts(expires_at, actor_id, request_id);

create function private.educational_workspace_role_v1(
  p_workspace_id uuid,
  p_actor_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select member.role
  from private.educational_workspace_members member
  join private.authoring_workspaces workspace on workspace.id = member.workspace_id
  where member.workspace_id = p_workspace_id
    and member.user_id = p_actor_id
    and workspace.deleted_at is null
$function$;

create function private.educational_workspace_can_v1(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select coalesce((
    select case p_capability
      when 'read' then member.role in (
        'owner', 'admin', 'author', 'reviewer', 'learner', 'reader'
      )
      when 'author' then member.role in ('owner', 'admin', 'author')
      when 'review' then member.role in ('owner', 'admin', 'author', 'reviewer')
      when 'comment' then member.role in (
        'owner', 'admin', 'author', 'reviewer', 'learner'
      )
      when 'publish' then member.role in ('owner', 'admin', 'author')
      when 'manage' then member.role in ('owner', 'admin')
      when 'transfer' then member.role = 'owner' and workspace.owner_id = p_actor_id
      else false
    end
    from private.educational_workspace_members member
    join private.authoring_workspaces workspace on workspace.id = member.workspace_id
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_id
      and workspace.deleted_at is null
  ), false)
$function$;

create function private.require_educational_workspace_capability_v1(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_capability text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_role text;
begin
  if p_capability not in (
    'read', 'author', 'review', 'comment', 'publish', 'manage', 'transfer'
  ) then
    raise exception 'Capacidade do workspace inválida.' using errcode = '22023';
  end if;
  v_role := private.educational_workspace_role_v1(p_workspace_id, p_actor_id);
  if v_role is null then
    raise exception 'Workspace inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  if not private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, p_capability
  ) then
    raise exception 'Ação não permitida neste workspace.' using errcode = '42501';
  end if;
  return v_role;
end;
$function$;

create function private.educational_workspace_details_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
declare
  v_workspace private.authoring_workspaces%rowtype;
  v_role text;
  v_can_manage boolean;
begin
  v_role := private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  v_can_manage := private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, 'manage'
  );
  select * into strict v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'title', v_workspace.title,
    'purpose', v_workspace.purpose,
    'kind', v_workspace.workspace_kind,
    'visibility', v_workspace.visibility,
    'role', v_role,
    'capabilities', jsonb_build_object(
      'read', true,
      'author', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'author'),
      'review', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'review'),
      'comment', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'comment'),
      'publish', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'publish'),
      'manage', v_can_manage,
      'transfer', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'transfer')
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', member.user_id,
        'email', case when v_can_manage or member.user_id = p_actor_id
          then account.email else null end,
        'role', member.role,
        'primaryOwner', member.user_id = v_workspace.owner_id,
        'joinedAt', member.joined_at
      ) order by
        case member.role
          when 'owner' then 0 when 'admin' then 1 when 'author' then 2
          when 'reviewer' then 3 when 'learner' then 4 else 5 end,
        lower(coalesce(account.email, member.user_id::text))
      )
      from private.educational_workspace_members member
      join auth.users account on account.id = member.user_id
      where member.workspace_id = v_workspace.id
    ), '[]'::jsonb),
    'invitations', case when v_can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'invitationId', invitation.id,
        'email', invitation.email,
        'role', invitation.role,
        'expiresAt', invitation.expires_at
      ) order by invitation.created_at desc, invitation.id)
      from private.educational_workspace_invitations invitation
      where invitation.workspace_id = v_workspace.id
        and invitation.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end,
    'courseCount', (
      select count(*)
      from private.authoring_workspace_entities entity
      where entity.workspace_id = v_workspace.id and entity.entity_type = 'course'
    ),
    'publicationCount', (
      select count(*)
      from private.authoring_workspace_publications publication
      where publication.workspace_id = v_workspace.id
    ),
    'updatedAt', v_workspace.updated_at
  );
end;
$function$;

create function private.mutate_educational_workspace_v1(
  p_actor_id uuid,
  p_request_id text,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_payload_hash text;
  v_receipt private.educational_workspace_receipts%rowtype;
  v_workspace_id uuid;
  v_workspace private.authoring_workspaces%rowtype;
  v_actor_role text;
  v_target_role text;
  v_target_user_id uuid;
  v_email text;
  v_code text;
  v_code_hash text;
  v_invitation private.educational_workspace_invitations%rowtype;
  v_result jsonb;
begin
  if p_actor_id is null or not exists(
    select 1 from auth.users account where account.id = p_actor_id
  ) then
    raise exception 'Conta inválida.' using errcode = '42501';
  end if;
  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in (
       'create', 'update', 'invite', 'accept_invite', 'cancel_invite',
       'set_role', 'remove_member', 'transfer_owner', 'leave'
     )
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 16384 then
    raise exception 'Comando de workspace inválido.' using errcode = '22023';
  end if;

  v_payload_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'operation', p_operation,
      'payload', p_payload
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-educational-workspace-v1:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  delete from private.educational_workspace_receipts receipt
  where receipt.expires_at <= statement_timestamp();
  delete from private.educational_workspace_invitations invitation
  where invitation.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.educational_workspace_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.operation <> p_operation or v_receipt.payload_hash <> v_payload_hash then
      raise exception 'requestId reutilizado com dados diferentes.' using errcode = '23505';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  if p_operation = 'create' then
    if exists(
      select 1 from jsonb_object_keys(p_payload) field_name
      where field_name not in ('workspaceId', 'title', 'purpose', 'kind', 'visibility')
    )
       or not (p_payload ?& array['workspaceId', 'title', 'purpose', 'kind', 'visibility'])
       or nullif(btrim(p_payload->>'title'), '') is null
       or char_length(p_payload->>'title') > 300
       or char_length(p_payload->>'purpose') > 1000
       or p_payload->>'kind' not in ('personal', 'class', 'team')
       or p_payload->>'visibility' not in ('private', 'members') then
      raise exception 'Dados do workspace inválidos.' using errcode = '22023';
    end if;
    begin
      v_workspace_id := (p_payload->>'workspaceId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Identidade do workspace inválida.' using errcode = '22023';
    end;
    insert into private.authoring_workspaces(
      id, owner_id, title, purpose, workspace_kind, visibility, brief
    ) values (
      v_workspace_id, p_actor_id, btrim(p_payload->>'title'),
      btrim(p_payload->>'purpose'), p_payload->>'kind',
      p_payload->>'visibility', ''
    ) returning * into v_workspace;
    insert into private.authoring_workspace_entities(
      workspace_id, entity_type, entity_id, parent_type, parent_id,
      position, content
    ) values (
      v_workspace_id, 'project', 'project', null, null, 0,
      jsonb_build_object(
        'contract', 'aralearn.contract', 'version', 4, 'kind', 'project'
      )
    );
    v_result := jsonb_build_object(
      'workspaceId', v_workspace_id, 'operation', p_operation,
      'role', 'owner', 'idempotent', false
    );
  else
    if p_operation = 'accept_invite' then
      if exists(
        select 1 from jsonb_object_keys(p_payload) field_name where field_name <> 'code'
      ) or not (p_payload ? 'code')
         or (p_payload->>'code') !~ '^[A-Za-z0-9_-]{32,128}$' then
        raise exception 'Convite inválido.' using errcode = '22023';
      end if;
      v_code_hash := encode(extensions.digest(
        convert_to(p_payload->>'code', 'UTF8'), 'sha256'
      ), 'hex');
      select * into v_invitation
      from private.educational_workspace_invitations invitation
      where invitation.code_hash = v_code_hash
        and invitation.expires_at > statement_timestamp()
      for update;
      if not found then
        raise exception 'Convite inexistente ou expirado.' using errcode = 'P0002';
      end if;
      select lower(btrim(account.email)) into v_email
      from auth.users account where account.id = p_actor_id;
      if v_email is null or v_email <> v_invitation.email then
        raise exception 'Este convite pertence a outra conta.' using errcode = '42501';
      end if;
      insert into private.educational_workspace_members(
        workspace_id, user_id, role, granted_by
      ) values (
        v_invitation.workspace_id, p_actor_id, v_invitation.role,
        v_invitation.invited_by
      ) on conflict(workspace_id, user_id) do update
        set role = excluded.role,
            granted_by = excluded.granted_by,
            updated_at = now();
      delete from private.educational_workspace_invitations invitation
      where invitation.id = v_invitation.id;
      v_workspace_id := v_invitation.workspace_id;
      v_result := jsonb_build_object(
        'workspaceId', v_workspace_id, 'operation', p_operation,
        'role', v_invitation.role, 'idempotent', false
      );
    else
      if not (p_payload ? 'workspaceId') then
        raise exception 'Workspace não informado.' using errcode = '22023';
      end if;
      begin
        v_workspace_id := (p_payload->>'workspaceId')::uuid;
      exception when invalid_text_representation then
        raise exception 'Identidade do workspace inválida.' using errcode = '22023';
      end;
      select * into v_workspace
      from private.authoring_workspaces workspace
      where workspace.id = v_workspace_id and workspace.deleted_at is null
      for update;
      if not found then
        raise exception 'Workspace inexistente ou inacessível.' using errcode = 'P0002';
      end if;
      v_actor_role := private.educational_workspace_role_v1(v_workspace_id, p_actor_id);

      if p_operation = 'update' then
        perform private.require_educational_workspace_capability_v1(
          v_workspace_id, p_actor_id, 'manage'
        );
        if exists(
          select 1 from jsonb_object_keys(p_payload) field_name
          where field_name not in ('workspaceId', 'title', 'purpose', 'kind', 'visibility')
        )
           or not (p_payload ?& array['workspaceId', 'title', 'purpose', 'kind', 'visibility'])
           or nullif(btrim(p_payload->>'title'), '') is null
           or char_length(p_payload->>'title') > 300
           or char_length(p_payload->>'purpose') > 1000
           or p_payload->>'kind' not in ('personal', 'class', 'team')
           or p_payload->>'visibility' not in ('private', 'members') then
          raise exception 'Dados do workspace inválidos.' using errcode = '22023';
        end if;
        update private.authoring_workspaces workspace
        set title = btrim(p_payload->>'title'),
            purpose = btrim(p_payload->>'purpose'),
            workspace_kind = p_payload->>'kind',
            visibility = p_payload->>'visibility',
            updated_at = now()
        where workspace.id = v_workspace_id;
        v_result := jsonb_build_object(
          'workspaceId', v_workspace_id, 'operation', p_operation,
          'idempotent', false
        );
      elsif p_operation = 'invite' then
        perform private.require_educational_workspace_capability_v1(
          v_workspace_id, p_actor_id, 'manage'
        );
        if exists(
          select 1 from jsonb_object_keys(p_payload) field_name
          where field_name not in ('workspaceId', 'email', 'role')
        ) or not (p_payload ?& array['workspaceId', 'email', 'role']) then
          raise exception 'Dados do convite inválidos.' using errcode = '22023';
        end if;
        v_email := lower(btrim(p_payload->>'email'));
        v_target_role := p_payload->>'role';
        if char_length(v_email) not between 3 and 320
           or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
           or v_target_role not in ('admin', 'author', 'reviewer', 'learner', 'reader')
           or (v_actor_role = 'admin' and v_target_role = 'admin') then
          raise exception 'Dados do convite inválidos.' using errcode = '22023';
        end if;
        if exists(
          select 1
          from private.educational_workspace_members member
          join auth.users account on account.id = member.user_id
          where member.workspace_id = v_workspace_id
            and lower(btrim(account.email)) = v_email
        ) then
          raise exception 'Esta conta já participa do workspace.' using errcode = '23505';
        end if;
        v_code := replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '/', '_'), '+', '-');
        v_code := replace(v_code, '=', '');
        v_code_hash := encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');
        insert into private.educational_workspace_invitations(
          workspace_id, email, role, code_hash, invited_by
        ) values (
          v_workspace_id, v_email, v_target_role, v_code_hash, p_actor_id
        ) on conflict(workspace_id, email) do update
          set role = excluded.role,
              code_hash = excluded.code_hash,
              invited_by = excluded.invited_by,
              created_at = now(),
              expires_at = now() + interval '7 days'
        returning * into v_invitation;
        v_result := jsonb_build_object(
          'workspaceId', v_workspace_id, 'operation', p_operation,
          'invitationId', v_invitation.id, 'code', v_code,
          'expiresAt', v_invitation.expires_at, 'idempotent', false
        );
      elsif p_operation = 'cancel_invite' then
        perform private.require_educational_workspace_capability_v1(
          v_workspace_id, p_actor_id, 'manage'
        );
        if exists(
          select 1 from jsonb_object_keys(p_payload) field_name
          where field_name not in ('workspaceId', 'invitationId')
        ) or not (p_payload ? 'invitationId') then
          raise exception 'Convite inválido.' using errcode = '22023';
        end if;
        delete from private.educational_workspace_invitations invitation
        where invitation.workspace_id = v_workspace_id
          and invitation.id = (p_payload->>'invitationId')::uuid;
        if not found then
          raise exception 'Convite inexistente.' using errcode = 'P0002';
        end if;
        v_result := jsonb_build_object(
          'workspaceId', v_workspace_id, 'operation', p_operation,
          'idempotent', false
        );
      elsif p_operation in ('set_role', 'remove_member', 'transfer_owner') then
        perform private.require_educational_workspace_capability_v1(
          v_workspace_id, p_actor_id,
          case when p_operation = 'transfer_owner' then 'transfer' else 'manage' end
        );
        if not (p_payload ? 'userId') then
          raise exception 'Membro não informado.' using errcode = '22023';
        end if;
        begin
          v_target_user_id := (p_payload->>'userId')::uuid;
        exception when invalid_text_representation then
          raise exception 'Identidade do membro inválida.' using errcode = '22023';
        end;
        select member.role into v_target_role
        from private.educational_workspace_members member
        where member.workspace_id = v_workspace_id and member.user_id = v_target_user_id
        for update;
        if not found then
          raise exception 'Membro inexistente.' using errcode = 'P0002';
        end if;
        if p_operation = 'set_role' then
          if exists(
            select 1 from jsonb_object_keys(p_payload) field_name
            where field_name not in ('workspaceId', 'userId', 'role')
          ) or not (p_payload ? 'role')
             or p_payload->>'role' not in ('admin', 'author', 'reviewer', 'learner', 'reader')
             or (v_target_role = 'owner' and (
               v_actor_role <> 'owner' or v_target_user_id = v_workspace.owner_id
             ))
             or (v_actor_role = 'admin' and (
               v_target_role = 'admin' or p_payload->>'role' = 'admin'
             )) then
            raise exception 'Alteração de papel não permitida.' using errcode = '42501';
          end if;
          update private.educational_workspace_members member
          set role = p_payload->>'role', granted_by = p_actor_id, updated_at = now()
          where member.workspace_id = v_workspace_id and member.user_id = v_target_user_id;
          v_target_role := p_payload->>'role';
        elsif p_operation = 'remove_member' then
          if exists(
            select 1 from jsonb_object_keys(p_payload) field_name
            where field_name not in ('workspaceId', 'userId')
          ) or v_target_user_id = v_workspace.owner_id
             or (v_target_role = 'owner' and v_actor_role <> 'owner')
             or (v_actor_role = 'admin' and v_target_role = 'admin') then
            raise exception 'Remoção de membro não permitida.' using errcode = '42501';
          end if;
          delete from private.educational_workspace_members member
          where member.workspace_id = v_workspace_id and member.user_id = v_target_user_id;
        else
          if exists(
            select 1 from jsonb_object_keys(p_payload) field_name
            where field_name not in ('workspaceId', 'userId')
          ) or v_workspace.owner_id <> p_actor_id then
            raise exception 'Transferência de propriedade não permitida.' using errcode = '42501';
          end if;
          update private.educational_workspace_members member
          set role = 'owner', granted_by = p_actor_id, updated_at = now()
          where member.workspace_id = v_workspace_id and member.user_id = v_target_user_id;
          update private.authoring_workspaces workspace
          set owner_id = v_target_user_id, updated_at = now()
          where workspace.id = v_workspace_id;
          v_target_role := 'owner';
        end if;
        v_result := jsonb_build_object(
          'workspaceId', v_workspace_id, 'operation', p_operation,
          'userId', v_target_user_id, 'role', v_target_role,
          'idempotent', false
        );
      elsif p_operation = 'leave' then
        if exists(
          select 1 from jsonb_object_keys(p_payload) field_name
          where field_name <> 'workspaceId'
        ) or v_actor_role is null or v_workspace.owner_id = p_actor_id then
          raise exception 'O proprietário primário precisa transferir o workspace antes de sair.'
            using errcode = '42501';
        end if;
        delete from private.educational_workspace_members member
        where member.workspace_id = v_workspace_id and member.user_id = p_actor_id;
        v_result := jsonb_build_object(
          'workspaceId', v_workspace_id, 'operation', p_operation,
          'idempotent', false
        );
      end if;
    end if;
  end if;

  insert into private.educational_workspace_receipts(
    actor_id, request_id, operation, payload_hash, result
  ) values (p_actor_id, p_request_id, p_operation, v_payload_hash, v_result);
  return v_result;
end;
$function$;

create function public.get_current_educational_workspace_v1(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return private.educational_workspace_details_v1(v_actor_id, p_workspace_id);
end;
$function$;

create function public.manage_current_educational_workspace_v1(
  p_request_id text,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, auth
as $function$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return private.mutate_educational_workspace_v1(
    v_actor_id, p_request_id, p_operation, p_payload
  );
end;
$function$;

create function public.get_educational_workspace_for_actor_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'authoring:read');
  return private.educational_workspace_details_v1(p_actor_id, p_workspace_id);
end;
$function$;

create function public.manage_educational_workspace_for_actor_v1(
  p_actor_id uuid,
  p_request_id text,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'authoring:read');
  return private.mutate_educational_workspace_v1(
    p_actor_id, p_request_id, p_operation, p_payload
  );
end;
$function$;

revoke all on function public.get_current_educational_workspace_v1(uuid)
  from public, anon, service_role;
grant execute on function public.get_current_educational_workspace_v1(uuid)
  to authenticated;
revoke all on function public.manage_current_educational_workspace_v1(text, text, jsonb)
  from public, anon, service_role;
grant execute on function public.manage_current_educational_workspace_v1(text, text, jsonb)
  to authenticated;
revoke all on function public.get_educational_workspace_for_actor_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_educational_workspace_for_actor_v1(uuid, uuid)
  to service_role;
revoke all on function public.manage_educational_workspace_for_actor_v1(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.manage_educational_workspace_for_actor_v1(uuid, text, text, jsonb)
  to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260801210000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'pre-registered-publication-artifacts',
      'single-current-course-revision',
      'storage-only-course-content',
      'canonical-resource-registry',
      'atomic-resource-authoring',
      'atomic-card-assistance',
      'composed-authoring-workspaces',
      'workspace-publication-bindings',
      'unchanged-publication-short-circuit',
      'bounded-authoring-events',
      'partial-private-publication',
      'microtheory-review-projection',
      'workspace-cursor-pagination',
      'workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination',
      'global-catalog-course-search',
      'catalog-review-submissions',
      'catalog-management',
      'personal-library-course-removal',
      'course-revision-sync-compaction',
      'automatic-sync-history-maintenance',
      'compact-authoring-brief',
      'account-derived-authoring-capabilities',
      'oauth-only-authoring-mcp',
      'default-catalog-collection',
      'confidential-gpt-action-oauth',
      'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback',
      'workspace-card-metadata',
      'structured-authoring-errors',
      'current-state-central-v1',
      'situated-personal-comments-v1',
      'educational-workspace-membership-v1',
      'educational-workspace-invitations-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
