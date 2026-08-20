begin;

set local search_path = pg_catalog, public, private, auth, storage, extensions;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn:fix-person-avatar-path-validation:20260820101500', 0
));

do $requirements$
begin
  if to_regclass('public.person_profiles') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure(
       'public.update_person_profile_for_actor_v1(uuid,jsonb)'
     ) is null then
    raise exception 'Perfis e Storage privados são obrigatórios.';
  end if;
end;
$requirements$;

alter table public.person_profiles
drop constraint person_profiles_avatar_object_key_v1;

alter table public.person_profiles
add constraint person_profiles_avatar_object_key_v1 check(
  avatar_object_key is null or (
    split_part(avatar_object_key, '/', 1) = user_id::text
    and avatar_object_key ~ (
      '^' || user_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
    )
  )
);

create or replace function public.update_person_profile_for_actor_v1(
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
        '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
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

drop policy person_avatars_self_insert_v1 on storage.objects;

create policy person_avatars_self_insert_v1
on storage.objects
for insert to authenticated
with check(
  bucket_id = 'person-avatars'
  and owner_id = auth.uid()::text
  and name ~ (
    '^' || auth.uid()::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  )
);

do $person_avatar_path_postflight$
declare
  v_constraint_definition text;
  v_function_definition text;
  v_policy_check text;
begin
  select pg_get_constraintdef(constraint_value.oid)
  into v_constraint_definition
  from pg_constraint constraint_value
  where constraint_value.conrelid = 'public.person_profiles'::regclass
    and constraint_value.conname = 'person_profiles_avatar_object_key_v1'
    and constraint_value.convalidated;

  select pg_get_functiondef(
    'public.update_person_profile_for_actor_v1(uuid,jsonb)'::regprocedure
  ) into v_function_definition;

  select policy_value.with_check
  into v_policy_check
  from pg_policies policy_value
  where policy_value.schemaname = 'storage'
    and policy_value.tablename = 'objects'
    and policy_value.policyname = 'person_avatars_self_insert_v1'
    and policy_value.cmd = 'INSERT'
    and policy_value.roles = array['authenticated']::name[];

  if v_constraint_definition is null
     or position('\.(jpg|png|webp)$' in v_constraint_definition) = 0
     or v_function_definition is null
     or position('\.(jpg|png|webp)$' in v_function_definition) = 0
     or v_policy_check is null
     or position('\.(jpg|png|webp)$' in v_policy_check) = 0
     or position('owner_id =' in v_policy_check) = 0
     or position('(uid())::text' in v_policy_check) = 0 then
    raise exception 'A validação canônica dos caminhos de avatar não foi instalada.'
      using errcode = '55000';
  end if;
end;
$person_avatar_path_postflight$;

do $advance_person_avatar_path_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820065720'
     or (v_manifest->>'contractVersion')::integer <> 1
     or not (v_manifest->'features' ?& array[
       'person-profile-v1',
       'private-person-avatar-v1',
       'study-only-course-access-v1'
     ]) then
    raise exception 'Manifesto concorrente à correção dos avatares privados.'
      using errcode = '55000';
  end if;

  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260820101500'::text)
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
$advance_person_avatar_path_runtime_manifest$;

do $person_avatar_path_manifest_postflight$
declare
  v_manifest jsonb;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest->>'schemaRevision' <> '20260820101500'
     or (v_manifest->>'contractVersion')::integer <> 1
     or jsonb_array_length(v_manifest->'features') <> 31
     or not (v_manifest->'features' ?& array[
       'person-profile-v1',
       'private-person-avatar-v1',
       'study-only-course-access-v1'
     ]) then
    raise exception 'Manifesto da correção dos avatares não foi consolidado.'
      using errcode = '55000';
  end if;
end;
$person_avatar_path_manifest_postflight$;

commit;
