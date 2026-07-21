begin;

-- A clone is discovered by the course/membership feed entries and then
-- materialized once through get_personal_course_graph. Emitting one feed row
-- for every copied child both duplicates that snapshot and can exhaust the
-- hosted statement timeout for large official courses.
create or replace function public.clone_catalog_course(p_source_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
set statement_timeout = '60s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.courses%rowtype;
  v_target_id uuid := gen_random_uuid();
  v_target_contract_key text;
  v_target_position integer;
  v_source_hash text;
  v_target_hash text;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  perform private.lock_course_write(p_source_course_id);
  select * into v_source from public.courses
  where id = p_source_course_id and kind = 'official' and status = 'published' and deleted_at is null
  for share;
  if not found then
    raise exception 'Curso oficial publicado não encontrado.' using errcode = '22023';
  end if;

  v_target_contract_key := v_source.contract_key || '-' || left(replace(v_target_id::text, '-', ''), 8);
  perform pg_advisory_xact_lock(hashtextextended('course-position:' || v_user_id::text, 0));
  select coalesce(max(position) + 1, 0) into v_target_position
  from public.courses
  where kind = 'personal' and owner_id = v_user_id and deleted_at is null;

  v_source_hash := coalesce(v_source.content_hash, private.course_content_hash(v_source.id));
  perform set_config('aralearn.suppress_course_dirty', 'on', true);
  insert into public.courses (
    id, owner_id, kind, status, source_course_id, source_entity_id,
    source_publication_seq, source_content_hash, baseline_content_hash, contract_key, title, goal,
    contract_scope,
    publication_seq, content_hash, identity_key, position
  ) values (
    v_target_id, v_user_id, 'personal', 'active', v_source.id, v_source.id,
    v_source.publication_seq, v_source_hash, v_source_hash, v_target_contract_key, v_source.title,
    v_source.goal, v_source.contract_scope, 0, null,
    case when v_source.identity_key is null then 'course:' || v_target_contract_key
      else replace(v_source.identity_key, 'course:' || v_source.contract_key, 'course:' || v_target_contract_key) end,
    v_target_position
  );
  insert into public.course_memberships (course_id, user_id, role, position)
  values (v_target_id, v_user_id, 'owner', 0);

  -- The two rows above remain in the incremental feed so every device learns
  -- about the membership. Children are fetched exactly once as a snapshot.
  perform set_config('aralearn.suppress_sync_changes', 'on', true);
  perform private.clone_course_tree(v_source.id, v_target_id);
  perform set_config('aralearn.suppress_sync_changes', 'off', true);

  v_target_hash := private.course_content_hash(v_target_id);
  update public.courses
  set content_hash = v_target_hash, baseline_content_hash = v_target_hash,
      personalized_at = null
  where id = v_target_id;
  perform set_config('aralearn.suppress_course_dirty', 'off', true);
  return v_target_id;
end;
$$;

alter function public.clone_catalog_course(uuid, uuid)
  set statement_timeout = '60s';

commit;
