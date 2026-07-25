begin;

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
        or (
          current_setting('aralearn.private_authoring_delegate_actor', true) = p_user_id::text
          and nullif(current_setting('aralearn.private_authoring_delegate_request_id', true), '') is not null
        )
      when 'authoring:write' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'author')
        or (
          current_setting('aralearn.private_authoring_delegate_actor', true) = p_user_id::text
          and nullif(current_setting('aralearn.private_authoring_delegate_request_id', true), '') is not null
        )
      when 'authoring:audit' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
        or private.has_active_app_role(p_user_id, 'reviewer')
        or (
          current_setting('aralearn.private_authoring_delegate_actor', true) = p_user_id::text
          and nullif(current_setting('aralearn.private_authoring_delegate_request_id', true), '') is not null
        )
      when 'course:import' then true
      when 'catalog:publish' then
        private.has_active_app_role(p_user_id, 'owner')
        or private.has_active_app_role(p_user_id, 'catalog_publisher')
      when 'roles:manage' then private.has_active_app_role(p_user_id, 'owner')
      else false
    end;
$$;

do $migration$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'public.dispatch_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
  ) into v_definition;

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$    perform set_config('aralearn.private_authoring_delegate_actor', p_actor_id::text, true);$old$,
    $new$    perform set_config('aralearn.private_authoring_delegate_actor', p_actor_id::text, true);
    perform set_config('aralearn.private_authoring_delegate_request_id', p_request_id, true);$new$
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível delimitar o delegado de autoria privada.'
      using errcode = '55000';
  end if;

  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$    perform set_config('aralearn.private_authoring_delegate_actor', '', true);$old$,
    $new$    perform set_config('aralearn.private_authoring_delegate_actor', '', true);
    perform set_config('aralearn.private_authoring_delegate_request_id', '', true);$new$
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível limpar o delegado de autoria privada.'
      using errcode = '55000';
  end if;
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'public.apply_course_content_revision(uuid,uuid,uuid,text,text)'::regprocedure
  ) into v_definition;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$  create temporary table course_revision_expected_entities($old$,
    $new$  create temporary table if not exists course_revision_expected_entities($new$
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível reutilizar a tabela temporária de revisão.'
      using errcode = '55000';
  end if;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$  ) on commit drop;$old$,
    $new$  ) on commit drop;
  truncate table course_revision_expected_entities;
$new$
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível limpar a tabela temporária de revisão.'
      using errcode = '55000';
  end if;
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_definition text;
  v_previous text;
begin
  select pg_get_functiondef(
    'public.open_course_content_revision(uuid,uuid,uuid,text,uuid,uuid,uuid)'::regprocedure
  ) into v_definition;
  v_previous := v_definition;
  v_definition := replace(
    v_definition,
    $old$      and card.deleted_at is null;$old$,
    $new$;$new$
  );
  if v_definition = v_previous then
    raise exception 'Não foi possível permitir a reativação de card tombstonado.'
      using errcode = '55000';
  end if;
  execute v_definition;
end;
$migration$;

commit;
