begin;

-- A personal-course deletion already emits one course tombstone for each
-- active member. Letting the generic row trigger run as well creates one
-- sync_changes row per descendant (more than 14 thousand for Dataprev),
-- which needlessly exhausts the hosted statement timeout. The custom GUC is
-- set only inside the transaction because Supabase does not permit persisting
-- it as a function-level setting.
create or replace function public.delete_personal_course(
  p_course_id uuid,
  p_base_revision bigint,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
set statement_timeout = '60s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_course public.courses%rowtype;
  v_deleted_course public.courses%rowtype;
  v_existing private.rpc_idempotency%rowtype;
  v_result jsonb;
  v_member_ids uuid[];
  v_fingerprint text;
begin
  if v_user_id is null or p_mutation_id is null then
    raise exception 'Autenticação e mutationId são obrigatórios.' using errcode = '42501';
  end if;
  if p_base_revision is null or p_base_revision < 0 then
    raise exception 'baseRevision deve ser não negativa.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_mutation_id::text, 0)
  );
  v_fingerprint := encode(extensions.digest(jsonb_build_object(
    'operation', 'delete_personal_course', 'courseId', p_course_id,
    'baseRevision', p_base_revision
  )::text, 'sha256'), 'hex');
  select * into v_existing from private.rpc_idempotency
  where user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_existing.operation <> 'delete_personal_course'
       or v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'mutationId já foi usado com outra operação.' using errcode = '23505';
    end if;
    return v_existing.result_payload || jsonb_build_object('idempotent', true);
  end if;

  perform private.lock_course_write(p_course_id);
  select * into v_course from public.courses
  where id = p_course_id and kind = 'personal'
  for update;
  if not found then
    v_result := jsonb_build_object(
      'status', 'applied', 'mutationId', p_mutation_id,
      'courseId', p_course_id, 'noop', true
    );
    insert into private.rpc_idempotency (
      user_id, mutation_id, operation, request_fingerprint, result_payload
    ) values (
      v_user_id, p_mutation_id, 'delete_personal_course', v_fingerprint, v_result
    );
    return v_result;
  end if;
  if not public.is_app_admin() and v_course.owner_id is distinct from v_user_id then
    raise exception 'Somente owner pode excluir o curso pessoal.' using errcode = '42501';
  end if;
  if v_course.deleted_at is not null then
    v_result := jsonb_build_object(
      'status', 'applied', 'mutationId', p_mutation_id,
      'courseId', p_course_id, 'noop', true
    );
    insert into private.rpc_idempotency (
      user_id, mutation_id, operation, request_course_id, result_course_id,
      request_fingerprint, result_payload
    ) values (
      v_user_id, p_mutation_id, 'delete_personal_course', p_course_id, p_course_id,
      v_fingerprint, v_result
    );
    return v_result;
  end if;
  if v_course.revision <> p_base_revision then
    v_result := jsonb_build_object(
      'status', 'conflict', 'reason', 'revision_mismatch',
      'mutationId', p_mutation_id, 'courseId', p_course_id,
      'baseRevision', p_base_revision, 'remoteRevision', v_course.revision,
      'remoteRow', private.local_row('courses', to_jsonb(v_course)),
      'noop', false
    );
    insert into private.rpc_idempotency (
      user_id, mutation_id, operation, request_course_id, result_course_id,
      request_fingerprint, result_payload
    ) values (
      v_user_id, p_mutation_id, 'delete_personal_course', p_course_id, p_course_id,
      v_fingerprint, v_result
    );
    return v_result;
  end if;

  select array_agg(membership.user_id) into v_member_ids
  from public.course_memberships membership
  where membership.course_id = p_course_id and membership.deleted_at is null;
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform private.soft_delete_course_tree(p_course_id);
  update public.card_progress set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.lesson_progress set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.card_comments set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.course_memberships set deleted_at = now()
  where course_id = p_course_id and deleted_at is null;
  update public.courses set deleted_at = now()
  where id = p_course_id and deleted_at is null
  returning * into v_deleted_course;
  insert into public.sync_changes (
    audience_user_id, course_id, entity_type, entity_id, operation, entity_revision, row_data
  )
  select member_id, p_course_id, 'courses', p_course_id, 'delete',
    v_deleted_course.revision, to_jsonb(v_deleted_course)
  from unnest(coalesce(v_member_ids, '{}'::uuid[])) member_id;
  perform set_config('aralearn.suppress_sync_changes', 'off', true);
  perform set_config('aralearn.suppress_course_dirty', 'off', true);

  v_result := jsonb_build_object(
    'status', 'applied', 'mutationId', p_mutation_id,
    'courseId', p_course_id, 'revision', v_deleted_course.revision,
    'noop', false
  );
  insert into private.rpc_idempotency (
    user_id, mutation_id, operation, request_course_id, result_course_id,
    request_fingerprint, result_payload
  ) values (
    v_user_id, p_mutation_id, 'delete_personal_course', p_course_id, p_course_id,
    v_fingerprint, v_result
  );
  return v_result;
end;
$$;

-- These RPCs intentionally assemble or mutate a complete relational tree.
-- Keep the exemption bounded and scoped to the functions; ordinary browser
-- requests retain their short default timeout.
alter function public.get_personal_course_graph(uuid)
  set statement_timeout = '60s';
alter function public.bootstrap_replica(uuid)
  set statement_timeout = '60s';
alter function public.refresh_personal_course_from_source(uuid)
  set statement_timeout = '60s';
alter function public.refresh_personal_course_from_source(uuid, uuid)
  set statement_timeout = '60s';
alter function public.clone_catalog_course(uuid, uuid)
  set statement_timeout = '60s';

commit;
