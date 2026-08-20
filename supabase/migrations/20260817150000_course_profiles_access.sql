begin;

set local search_path = pg_catalog, public, private, auth, storage, extensions;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn:course-profiles-access:20260817150000', 0
));

do $requirements$
begin
  if to_regclass('public.courses') is null
     or to_regclass('public.course_access') is null
     or to_regclass('private.course_events') is null
     or to_regclass('private.course_change_receipts') is null
     or to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'O modelo canônico de Cursos e o Storage são obrigatórios.';
  end if;
end;
$requirements$;

create table public.person_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_object_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_profiles_display_name_v1 check(
    display_name is null or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 120
      and display_name !~ '[[:cntrl:]]'
    )
  ),
  constraint person_profiles_avatar_object_key_v1 check(
    avatar_object_key is null or (
      split_part(avatar_object_key, '/', 1) = user_id::text
      and avatar_object_key ~ ('^' || user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp)$')
    )
  )
);

create function private.touch_person_profile_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger person_profiles_touch_v1
before update on public.person_profiles
for each row execute function private.touch_person_profile_v1();

create function private.create_person_profile_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.person_profiles(user_id)
  values(new.id)
  on conflict(user_id) do nothing;
  return new;
end;
$function$;

create trigger auth_users_create_person_profile_v1
after insert on auth.users
for each row execute function private.create_person_profile_v1();

insert into public.person_profiles(user_id)
select auth_user.id
from auth.users auth_user
on conflict(user_id) do nothing;

alter table private.course_events
  drop constraint if exists course_events_course_id_revision_key;
create index course_events_revision_v2_idx
  on private.course_events(course_id, revision, id);

alter table private.course_events
  drop constraint course_events_operation_v1,
  add constraint course_events_operation_v2 check(
    operation in (
      'create_course',
      'update_course_metadata',
      'replace_course_composition',
      'grant_course_access',
      'revoke_course_access'
    )
  ),
  drop constraint course_events_summary_v1,
  add constraint course_events_summary_v2 check(
    jsonb_typeof(summary) = 'object'
    and pg_column_size(summary) <= 32768
    and not (summary ?| array[
      'operation', 'workspaceId', 'workspace_id', 'catalog', 'publication',
      'email', 'targetEmail', 'target_email'
    ])
  );

alter table private.course_change_receipts
  drop constraint course_change_receipts_operation_v1,
  add constraint course_change_receipts_operation_v2 check(operation in (
    'create', 'update_metadata', 'commit_entities', 'grant_access', 'revoke_access'
  ));

create function public.list_owned_courses_for_actor_v1(
  p_actor_id uuid,
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or (p_query is not null and char_length(btrim(p_query)) > 120) then
    raise exception 'Consulta de Cursos inválida.' using errcode = '22023';
  end if;
  with owned as materialized (
    select course.*
    from public.courses course
    where course.owner_id = p_actor_id
      and (
        nullif(btrim(p_query), '') is null
        or lower(course.title || ' ' || course.goal || ' ' || course.brief)
          like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        p_before_updated_at is null
        or (course.updated_at, course.id) < (p_before_updated_at, p_before_id)
      )
    order by course.updated_at desc, course.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from owned
    order by updated_at desc, id desc
    limit p_limit
  ), projected as (
    select page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at,
      count(entity.course_id) filter(where entity.entity_type = 'module')::integer
        as module_count,
      count(entity.course_id) filter(where entity.entity_type = 'lesson')::integer
        as lesson_count,
      count(entity.course_id) filter(where entity.entity_type = 'topic')::integer
        as topic_count,
      count(entity.course_id) filter(where entity.entity_type = 'microsequence')::integer
        as microsequence_count,
      count(entity.course_id) filter(where entity.entity_type = 'card')::integer
        as study_unit_count
    from page
    left join private.course_entities entity on entity.course_id = page.id
    group by page.id, page.title, page.goal, page.revision,
      page.created_at, page.updated_at
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'courseId', projected.id,
      'title', projected.title,
      'goal', projected.goal,
      'revision', projected.revision,
      'ownership', 'owned',
      'canEdit', true,
      'moduleCount', projected.module_count,
      'lessonCount', projected.lesson_count,
      'topicCount', projected.topic_count,
      'microsequenceCount', projected.microsequence_count,
      'studyUnitCount', projected.study_unit_count,
      'updatedAt', projected.updated_at
    ) order by projected.updated_at desc, projected.id desc), '[]'::jsonb),
    (select count(*) from owned) > p_limit,
    case when (select count(*) from owned) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      ) from page order by page.updated_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from projected;
  return jsonb_build_object(
    'contract', 'aralearn.course-list.v1',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

create function public.get_owned_course_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_include_outline boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  return private.get_course_for_actor_v1(
    p_actor_id, p_course_id, p_include_outline
  );
end;
$function$;

create function public.list_owned_course_entities_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_expected_revision bigint,
  p_limit integer default 50,
  p_after_entity_type text default null,
  p_after_entity_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  return private.list_course_entities_for_actor_v1(
    p_actor_id,
    p_course_id,
    p_expected_revision,
    p_limit,
    p_after_entity_type,
    p_after_entity_id
  );
end;
$function$;

create function public.list_owned_courses_v1(
  p_query text default null,
  p_limit integer default 24,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select public.list_owned_courses_for_actor_v1(
    auth.uid(), p_query, p_limit, p_before_updated_at, p_before_id
  )
$function$;

create function public.get_owned_course_v1(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select public.get_owned_course_for_actor_v1(auth.uid(), p_course_id, false)
$function$;

create function public.list_owned_course_entities_v1(
  p_course_id uuid,
  p_expected_revision bigint,
  p_limit integer default 500,
  p_after_entity_type text default null,
  p_after_entity_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
  select public.list_owned_course_entities_for_actor_v1(
    auth.uid(), p_course_id, p_expected_revision, p_limit,
    p_after_entity_type, p_after_entity_id
  )
$function$;

create function public.get_person_profile_for_actor_v1(
  p_actor_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_profile public.person_profiles%rowtype;
begin
  perform private.require_service_role();
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  select * into strict v_profile
  from public.person_profiles profile
  where profile.user_id = p_actor_id;
  return jsonb_build_object(
    'contract', 'aralearn.person-profile.v1',
    'userId', v_profile.user_id,
    'displayName', v_profile.display_name,
    'avatarObjectKey', v_profile.avatar_object_key,
    'updatedAt', v_profile.updated_at
  );
exception
  when no_data_found then
    raise exception 'Perfil inexistente.' using errcode = 'PT404';
end;
$function$;

create function public.update_person_profile_for_actor_v1(
  p_actor_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_profile public.person_profiles%rowtype;
  v_previous_avatar text;
  v_display_name text;
  v_avatar_object_key text;
begin
  perform private.require_service_role();
  if p_actor_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or p_patch = '{}'::jsonb
     or exists(
       select 1 from jsonb_object_keys(p_patch) field
       where field not in ('displayName', 'avatarObjectKey')
     ) then
    raise exception 'Alteração de perfil inválida.' using errcode = '22023';
  end if;
  if p_patch ? 'displayName' then
    if jsonb_typeof(p_patch->'displayName') <> 'string' then
      raise exception 'Nome inválido.' using errcode = '22023';
    end if;
    v_display_name := btrim(p_patch->>'displayName');
    if char_length(v_display_name) not between 1 and 120
       or v_display_name ~ '[[:cntrl:]]' then
      raise exception 'Nome inválido.' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'avatarObjectKey' then
    if jsonb_typeof(p_patch->'avatarObjectKey') = 'null' then
      v_avatar_object_key := null;
    elsif jsonb_typeof(p_patch->'avatarObjectKey') = 'string' then
      v_avatar_object_key := p_patch->>'avatarObjectKey';
      if v_avatar_object_key !~ (
        '^' || p_actor_id::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp)$'
      ) then
        raise exception 'Objeto de avatar inválido.' using errcode = '22023';
      end if;
      if not exists(
        select 1 from storage.objects object_value
        where object_value.bucket_id = 'person-avatars'
          and object_value.name = v_avatar_object_key
          and object_value.owner_id = p_actor_id::text
      ) then
        raise exception 'Objeto de avatar inexistente.' using errcode = 'PT404';
      end if;
    else
      raise exception 'Objeto de avatar inválido.' using errcode = '22023';
    end if;
  end if;

  select profile.avatar_object_key into v_previous_avatar
  from public.person_profiles profile
  where profile.user_id = p_actor_id
  for update;
  if not found then
    raise exception 'Perfil inexistente.' using errcode = 'PT404';
  end if;

  update public.person_profiles profile
  set display_name = case when p_patch ? 'displayName'
        then v_display_name else profile.display_name end,
      avatar_object_key = case when p_patch ? 'avatarObjectKey'
        then v_avatar_object_key else profile.avatar_object_key end
  where profile.user_id = p_actor_id
  returning * into v_profile;

  return jsonb_build_object(
    'contract', 'aralearn.person-profile.v1',
    'userId', v_profile.user_id,
    'displayName', v_profile.display_name,
    'avatarObjectKey', v_profile.avatar_object_key,
    'previousAvatarObjectKey', case
      when p_patch ? 'avatarObjectKey' then v_previous_avatar else null end,
    'updatedAt', v_profile.updated_at
  );
end;
$function$;

create function public.list_course_access_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_owner_id uuid;
  v_owner jsonb;
  v_people jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  select course.owner_id into strict v_owner_id
  from public.courses course
  where course.id = p_course_id;
  select jsonb_build_object(
    'userId', profile.user_id,
    'displayName', profile.display_name,
    'avatarObjectKey', profile.avatar_object_key
  ) into v_owner
  from public.person_profiles profile
  where profile.user_id = v_owner_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', access_value.user_id,
    'displayName', profile.display_name,
    'avatarObjectKey', profile.avatar_object_key,
    'grantedAt', access_value.granted_at
  ) order by coalesce(profile.display_name, ''), access_value.granted_at, access_value.user_id), '[]'::jsonb)
  into v_people
  from public.course_access access_value
  join public.person_profiles profile on profile.user_id = access_value.user_id
  where access_value.course_id = p_course_id;
  return jsonb_build_object(
    'contract', 'aralearn.course-people.v1',
    'courseId', p_course_id,
    'owner', v_owner,
    'people', v_people
  );
end;
$function$;

create function public.manage_course_access_for_actor_v1(
  p_actor_id uuid,
  p_course_id uuid,
  p_operation text,
  p_target_email text,
  p_target_user_id uuid,
  p_confirmed boolean,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_course public.courses%rowtype;
  v_target_user_id uuid;
  v_target_email text;
  v_hash text;
  v_receipt private.course_change_receipts%rowtype;
  v_profile public.person_profiles%rowtype;
  v_changed boolean := false;
  v_result jsonb;
begin
  perform private.require_service_role();
  perform private.require_course_access_v1(p_course_id, p_actor_id, true);
  if p_operation not in ('grant_access', 'revoke_access')
     or p_confirmed is distinct from true
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'Alteração de acesso inválida.' using errcode = '22023';
  end if;
  if p_operation = 'grant_access' then
    if p_target_user_id is not null
       or p_target_email is null
       or p_target_email <> btrim(p_target_email)
       or char_length(p_target_email) not between 3 and 254
       or p_target_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
      raise exception 'E-mail exato inválido.' using errcode = '22023';
    end if;
    v_target_email := lower(p_target_email);
  else
    if p_target_user_id is null or p_target_email is not null then
      raise exception 'Pessoa de acesso inválida.' using errcode = '22023';
    end if;
    v_target_user_id := p_target_user_id;
  end if;

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'courseId', p_course_id,
    'operation', p_operation,
    'target', case when p_operation = 'grant_access'
      then v_target_email else v_target_user_id::text end,
    'confirmed', true
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'course-change-request:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  delete from private.course_change_receipts receipt
  where (receipt.actor_id, receipt.request_id) in (
    select expired.actor_id, expired.request_id
    from private.course_change_receipts expired
    where expired.expires_at <= statement_timestamp()
    order by expired.expires_at, expired.actor_id, expired.request_id
    limit 100
  );
  delete from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  select * into v_receipt
  from private.course_change_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at > statement_timestamp();
  if found then
    if v_receipt.operation <> p_operation
       or v_receipt.course_id <> p_course_id
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return (v_receipt.result - 'idempotent') || jsonb_build_object(
      'idempotent', true
    );
  end if;

  select * into strict v_course
  from public.courses course
  where course.id = p_course_id;
  if p_operation = 'grant_access' then
    select auth_user.id into v_target_user_id
    from auth.users auth_user
    where lower(auth_user.email) = v_target_email;
    if not found then
      raise exception 'Conta não encontrada para o e-mail informado.'
        using errcode = 'PT404';
    end if;
  end if;
  if v_target_user_id = v_course.owner_id then
    raise exception 'O proprietário já possui acesso ao Curso.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'course-access:' || p_course_id::text || ':' || v_target_user_id::text, 0
  ));

  select * into v_profile
  from public.person_profiles profile
  where profile.user_id = v_target_user_id;
  if not found then
    raise exception 'Perfil inexistente.' using errcode = 'PT404';
  end if;

  if p_operation = 'grant_access' then
    insert into public.course_access(course_id, user_id, granted_by)
    values(p_course_id, v_target_user_id, p_actor_id)
    on conflict(course_id, user_id) do nothing;
    v_changed := found;
  else
    delete from public.course_access access_value
    where access_value.course_id = p_course_id
      and access_value.user_id = v_target_user_id;
    v_changed := found;
  end if;

  if v_changed then
    insert into private.course_events(
      course_id, revision, operation, summary, actor_id
    ) values(
      p_course_id,
      v_course.revision,
      case p_operation
        when 'grant_access' then 'grant_course_access'
        else 'revoke_course_access'
      end,
      jsonb_build_object('targetUserId', v_target_user_id),
      p_actor_id
    );
  end if;

  v_result := jsonb_build_object(
    'contract', 'aralearn.course-access-change.v1',
    'courseId', p_course_id,
    'operation', p_operation,
    'changed', v_changed,
    'person', jsonb_build_object(
      'userId', v_profile.user_id,
      'displayName', v_profile.display_name,
      'avatarObjectKey', v_profile.avatar_object_key
    ),
    'idempotent', false
  );
  insert into private.course_change_receipts(
    actor_id, request_id, operation, course_id, request_hash, result
  ) values(
    p_actor_id, p_request_id, p_operation, p_course_id, v_hash, v_result
  );
  return v_result;
end;
$function$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
  'person-avatars',
  'person-avatars',
  false,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict(id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop function if exists public.delete_own_account(text);

create function public.delete_my_account_v1(p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, storage
set statement_timeout = '60s'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmação inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'account-delete:' || v_user_id::text, 0
  ));
  if exists(
    select 1 from storage.objects object_value
    where object_value.bucket_id = 'person-avatars'
      and split_part(object_value.name, '/', 1) = v_user_id::text
  ) then
    raise exception 'Remova os objetos privados de avatar antes de excluir a conta.'
      using errcode = '23514';
  end if;
  -- `granted_by` é restritivo para conservar a autoria da concessão enquanto
  -- a conta existe. Na exclusão voluntária, retirar primeiro as concessões
  -- emitidas evita que essa trilha de autoria bloqueie o cascade da conta.
  -- Excluir o vínculo não toca o estado pessoal de Estudo do favorecido.
  delete from public.course_access access_value
  where access_value.granted_by = v_user_id;
  update private.course_events event_value
  set summary = (event_value.summary - 'targetUserId') ||
    jsonb_build_object('targetAccountDeleted', true)
  where event_value.summary->>'targetUserId' = v_user_id::text;
  update private.course_change_receipts receipt
  set result = jsonb_set(
    receipt.result,
    '{person}',
    jsonb_build_object('accountDeleted', true),
    false
  )
  where receipt.result#>>'{person,userId}' = v_user_id::text;
  delete from auth.users auth_user where auth_user.id = v_user_id;
  if not found then
    raise exception 'Conta inexistente.' using errcode = 'PT404';
  end if;
  return jsonb_build_object(
    'contract', 'aralearn.account-deletion.v1',
    'status', 'deleted'
  );
end;
$function$;

create function private.can_read_person_v1(p_person_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
  select coalesce(case
    when p_person_id = auth.uid()::text then true
    when p_person_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then exists(
        select 1
        from public.courses course
        join public.course_access access_value
          on access_value.course_id = course.id
        where (
            (course.owner_id = auth.uid()
              and access_value.user_id = p_person_id::uuid)
            or (course.owner_id = p_person_id::uuid
              and access_value.user_id = auth.uid())
          )
      )
    else false
  end, false)
$function$;

alter table public.person_profiles enable row level security;
alter table public.person_profiles force row level security;

create policy person_profiles_direct_relation_select_v1
on public.person_profiles
for select to authenticated
using(
  private.can_read_person_v1(user_id::text)
);

create policy person_avatars_direct_relation_select_v1
on storage.objects
for select to authenticated
using(
  bucket_id = 'person-avatars'
  and private.can_read_person_v1(split_part(name, '/', 1))
);

create policy person_avatars_self_insert_v1
on storage.objects
for insert to authenticated
with check(
  bucket_id = 'person-avatars'
  and owner_id = auth.uid()::text
  and name ~ (
    '^' || auth.uid()::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp)$'
  )
);

create policy person_avatars_self_delete_v1
on storage.objects
for delete to authenticated
using(
  bucket_id = 'person-avatars'
  and owner_id = auth.uid()::text
  and split_part(name, '/', 1) = auth.uid()::text
);

revoke all on table public.person_profiles
  from public, anon, authenticated, service_role;
grant select on table public.person_profiles to authenticated;

revoke all on function private.touch_person_profile_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.create_person_profile_v1()
  from public, anon, authenticated, service_role;
revoke all on function private.can_read_person_v1(text)
  from public, anon, service_role;
grant execute on function private.can_read_person_v1(text)
  to authenticated;
revoke all on function public.list_courses_for_actor_v1(
  uuid, text, integer, timestamptz, uuid
) from service_role;
revoke all on function public.get_course_for_actor_v1(uuid, uuid, boolean)
  from service_role;
revoke all on function public.list_course_entities_for_actor_v1(
  uuid, uuid, bigint, integer, text, text
) from service_role;
revoke all on function public.list_owned_courses_for_actor_v1(
  uuid, text, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.list_owned_courses_for_actor_v1(
  uuid, text, integer, timestamptz, uuid
) to service_role;
revoke all on function public.get_owned_course_for_actor_v1(
  uuid, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.get_owned_course_for_actor_v1(
  uuid, uuid, boolean
) to service_role;
revoke all on function public.list_owned_course_entities_for_actor_v1(
  uuid, uuid, bigint, integer, text, text
) from public, anon, authenticated;
grant execute on function public.list_owned_course_entities_for_actor_v1(
  uuid, uuid, bigint, integer, text, text
) to service_role;
revoke all on function public.list_owned_courses_v1(
  text, integer, timestamptz, uuid
) from public, anon, service_role;
grant execute on function public.list_owned_courses_v1(
  text, integer, timestamptz, uuid
) to authenticated;
revoke all on function public.get_owned_course_v1(uuid)
  from public, anon, service_role;
grant execute on function public.get_owned_course_v1(uuid)
  to authenticated;
revoke all on function public.list_owned_course_entities_v1(
  uuid, bigint, integer, text, text
) from public, anon, service_role;
grant execute on function public.list_owned_course_entities_v1(
  uuid, bigint, integer, text, text
) to authenticated;
revoke all on function public.delete_my_account_v1(text)
  from public, anon, service_role;
grant execute on function public.delete_my_account_v1(text)
  to authenticated;
revoke all on function public.get_person_profile_for_actor_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_person_profile_for_actor_v1(uuid)
  to service_role;
revoke all on function public.update_person_profile_for_actor_v1(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_person_profile_for_actor_v1(uuid, jsonb)
  to service_role;
revoke all on function public.list_course_access_for_actor_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_course_access_for_actor_v1(uuid, uuid)
  to service_role;
revoke all on function public.manage_course_access_for_actor_v1(
  uuid, uuid, text, text, uuid, boolean, text
) from public, anon, authenticated;
grant execute on function public.manage_course_access_for_actor_v1(
  uuid, uuid, text, text, uuid, boolean, text
) to service_role;

do $advance_profile_access_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260817140000'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'flat-runtime-manifest-v1',
       'single-live-course-identity-v1',
       'paged-live-course-composition-v1',
       'direct-course-access-v1',
       'course-personal-state-v1',
       'course-cas-idempotency-v1',
       'oauth-only-authoring-mcp',
       'package-library-v1',
       'package-contract-discovery-v1'
     ]) then
    raise exception 'Manifesto anterior a perfil e acesso é inesperado.'
      using errcode = '55000';
  end if;
  v_manifest := jsonb_build_object(
    'schemaRevision', '20260817150000',
    'contractVersion', 1,
    'features', jsonb_build_array(
      'flat-runtime-manifest-v1',
      'single-live-course-identity-v1',
      'paged-live-course-composition-v1',
      'direct-course-access-v1',
      'course-personal-state-v1',
      'course-cas-idempotency-v1',
      'oauth-only-authoring-mcp',
      'package-library-v1',
      'package-contract-discovery-v1',
      'person-profile-v1',
      'study-only-course-access-v1',
      'private-person-avatar-v1',
      'self-account-deletion-v1'
    )
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public, anon, authenticated, service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to anon, authenticated, service_role;
end;
$advance_profile_access_runtime_manifest$;

commit;
