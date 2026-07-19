begin;

-- O bootstrap deve estabelecer uma visão consistente das autorizações e do
-- cursor sem montar, numa única resposta, todas as árvores pessoais. As árvores
-- são obtidas individualmente por get_personal_course_graph depois que este
-- manifesto é aplicado no dispositivo.
create or replace function public.bootstrap_replica(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot jsonb := jsonb_build_object('schemaVersion', 3);
  v_store_name text;
  v_store_names constant text[] := array[
    'courses','memberships','modules','lessons','guides','guideItems','topics',
    'topicStatements','microsequences','dependencies','microsequenceStatements',
    'cards','blocks','options','nodes','flowNodes','flowCases','flowPractices',
    'flowPracticeEntries','flowPracticeOptions','flowPracticeVariants','flowShapeOptions',
    'edges','matrixItems','cells','points','lines','highlights','cardSources','cardTopics',
    'lessonProgress','cardProgress','comments','studyPaths','studyPathCourses'
  ];
  v_high_water bigint;
begin
  if v_user_id is null or p_device_id is null then
    raise exception 'Autenticação e deviceId são obrigatórios.' using errcode = '42501';
  end if;

  -- A mesma barreira usada pelos produtores do feed torna o manifesto e o
  -- high-water uma única visão lógica.
  perform pg_advisory_xact_lock(hashtextextended('aralearn-sync-feed-commit-order', 0));

  foreach v_store_name in array v_store_names loop
    v_snapshot := jsonb_set(v_snapshot, array[v_store_name], '[]'::jsonb, true);
  end loop;

  v_snapshot := jsonb_set(v_snapshot, array['courses'], coalesce((
    select jsonb_agg(private.local_row('courses', to_jsonb(course)) order by course.id)
    from public.courses course
    where course.kind = 'personal'
      and course.deleted_at is null
      and (
        course.owner_id = v_user_id
        or exists (
          select 1
          from public.course_memberships membership
          where membership.course_id = course.id
            and membership.user_id = v_user_id
            and membership.deleted_at is null
        )
      )
  ), '[]'::jsonb), true);

  v_snapshot := jsonb_set(v_snapshot, array['memberships'], coalesce((
    select jsonb_agg(
      private.local_row('memberships', to_jsonb(membership))
      order by membership.position, membership.id
    )
    from public.course_memberships membership
    join public.courses course on course.id = membership.course_id
    where membership.user_id = v_user_id
      and membership.deleted_at is null
      and course.kind = 'personal'
      and course.deleted_at is null
  ), '[]'::jsonb), true);

  v_snapshot := jsonb_set(v_snapshot, array['studyPaths'], coalesce((
    select jsonb_agg(private.local_row('studyPaths', to_jsonb(path)) order by path.position, path.id)
    from public.study_paths path
    where path.owner_id = v_user_id and path.deleted_at is null
  ), '[]'::jsonb), true);

  v_snapshot := jsonb_set(v_snapshot, array['studyPathCourses'], coalesce((
    select jsonb_agg(
      private.local_row('studyPathCourses', to_jsonb(item))
      order by item.path_id, item.position, item.id
    )
    from public.study_path_courses item
    where item.owner_id = v_user_id and item.deleted_at is null
  ), '[]'::jsonb), true);

  select coalesce(max(sequence), 0)
  into v_high_water
  from public.sync_changes;

  insert into public.sync_devices (
    id, user_id, last_pulled_sequence, last_seen_at, inactive_at, deleted_at
  ) values (
    p_device_id, v_user_id, v_high_water, now(), null, null
  )
  on conflict (id) do update
  set last_pulled_sequence = excluded.last_pulled_sequence,
      last_seen_at = excluded.last_seen_at,
      inactive_at = null,
      deleted_at = null
  where sync_devices.user_id = excluded.user_id;

  if not exists (
    select 1
    from public.sync_devices
    where id = p_device_id
      and user_id = v_user_id
      and deleted_at is null
      and inactive_at is null
  ) then
    raise exception 'Dispositivo pertence a outro usuário.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'deviceId', p_device_id,
    'snapshotMode', 'manifest',
    'snapshot', v_snapshot,
    'highWaterSequence', v_high_water
  );
end;
$$;

revoke all on function public.bootstrap_replica(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_replica(uuid) to authenticated;

comment on function public.bootstrap_replica(uuid) is
  'Retorna manifesto autorizado e high-water consistentes; árvores pessoais são baixadas individualmente.';

commit;
