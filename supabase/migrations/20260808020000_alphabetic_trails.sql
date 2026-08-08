-- Grupos e cursos de Trilhas não possuem ordem manual. O vínculo pessoal
-- conserva somente pertencimento; a apresentação completa ordena títulos em
-- português depois da paginação estável por identidade.

begin;

create function private.trail_alphabetic_key_v1(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $function$
  select regexp_replace(
    translate(
      normalize(lower(btrim(coalesce(p_value, ''))), NFD),
      U&'\0300\0301\0302\0303\0304\0306\0307\0308\030A\030B\030C\0327\0328',
      ''
    ),
    '[[:space:]]+',
    ' ',
    'g'
  )
$function$;

-- Outros é o agrupamento virtual de todo item sem vínculo. Remover linhas
-- equivalentes evita duas categorias visuais para a mesma finalidade.
delete from public.study_paths path
where private.trail_alphabetic_key_v1(path.title) = 'outros';

create or replace function public.mutate_trails_v1(
  p_request_id uuid,
  p_operation text,
  p_arguments jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_receipt private.trail_mutation_receipts%rowtype;
  v_group_id uuid;
  v_trail_item_id uuid;
  v_placement_id uuid;
  v_current_title text;
  v_old_path_id uuid;
  v_changed boolean := false;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_request_id is null
     or p_operation not in (
       'create_group', 'rename_group', 'delete_group',
       'place_item', 'remove_item_from_group'
     )
     or jsonb_typeof(coalesce(p_arguments, 'null'::jsonb)) <> 'object'
     or pg_column_size(p_arguments) > 4096 then
    raise exception 'Mutação de Trilhas inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'operation', p_operation, 'arguments', p_arguments
  )::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-mutation:' || v_user_id::text || ':' || p_request_id::text, 0
  ));
  delete from private.trail_mutation_receipts receipt
  where receipt.owner_id = v_user_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired as materialized (
    select receipt.ctid
    from private.trail_mutation_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.owner_id, receipt.request_id
    limit 128
    for update skip locked
  )
  delete from private.trail_mutation_receipts receipt
  using expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.trail_mutation_receipts receipt
  where receipt.owner_id = v_user_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.request_hash <> v_hash or v_receipt.operation <> p_operation then
      raise exception 'requestId reutilizado com comando incompatível.'
        using errcode = '23514';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'trail-owner:' || v_user_id::text, 0
  ));
  v_group_id := private.try_uuid(p_arguments->>'groupId');
  v_trail_item_id := private.try_uuid(p_arguments->>'trailItemId');
  -- A fusão publicação↔workspace usa a mesma ordem owner -> item.
  if v_trail_item_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-item:' || v_trail_item_id::text, 0
    ));
  end if;

  if p_operation = 'create_group' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field where field <> 'title'
    ) or nullif(btrim(p_arguments->>'title'), '') is null
       or private.trail_alphabetic_key_v1(p_arguments->>'title') = 'outros'
       or char_length(p_arguments->>'title') > 160 then
      raise exception 'Novo grupo inválido.' using errcode = '22023';
    end if;
    v_group_id := gen_random_uuid();
    insert into public.study_paths(id, owner_id, title)
    values(v_group_id, v_user_id, btrim(p_arguments->>'title'));
    v_changed := true;
  elsif p_operation = 'rename_group' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field
      where field not in ('groupId', 'title')
    ) or v_group_id is null
       or nullif(btrim(p_arguments->>'title'), '') is null
       or private.trail_alphabetic_key_v1(p_arguments->>'title') = 'outros'
       or char_length(p_arguments->>'title') > 160 then
      raise exception 'Renomeação de grupo inválida.' using errcode = '22023';
    end if;
    select path.title into v_current_title
    from public.study_paths path
    where path.id = v_group_id and path.owner_id = v_user_id
    for update;
    if not found then
      raise exception 'Grupo inexistente ou inacessível.' using errcode = 'P0002';
    end if;
    if v_current_title is distinct from btrim(p_arguments->>'title') then
      update public.study_paths
      set title = btrim(p_arguments->>'title')
      where id = v_group_id and owner_id = v_user_id;
      v_changed := true;
    end if;
  elsif p_operation = 'delete_group' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field where field <> 'groupId'
    ) or v_group_id is null then
      raise exception 'Exclusão de grupo inválida.' using errcode = '22023';
    end if;
    delete from public.study_paths
    where id = v_group_id and owner_id = v_user_id;
    v_changed := found;
  elsif p_operation = 'place_item' then
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field
      where field not in ('trailItemId', 'groupId')
    ) or v_group_id is null or v_trail_item_id is null then
      raise exception 'Posicionamento de item inválido.' using errcode = '22023';
    end if;
    if not private.trail_item_accessible_v1(v_trail_item_id, v_user_id) then
      raise exception 'Item inexistente ou inacessível.' using errcode = '42501';
    end if;
    if not exists(
      select 1 from public.study_paths path
      where path.id = v_group_id and path.owner_id = v_user_id
    ) then
      raise exception 'Grupo inexistente ou inacessível.' using errcode = 'P0002';
    end if;
    select item.id, item.path_id into v_placement_id, v_old_path_id
    from public.study_path_items item
    where item.owner_id = v_user_id and item.trail_item_id = v_trail_item_id
    for update;
    if v_placement_id is null then
      v_placement_id := gen_random_uuid();
      insert into public.study_path_items(
        id, path_id, owner_id, trail_item_id
      ) values(
        v_placement_id, v_group_id, v_user_id, v_trail_item_id
      );
      v_changed := true;
    elsif v_old_path_id is distinct from v_group_id then
      update public.study_path_items
      set path_id = v_group_id
      where id = v_placement_id;
      v_changed := true;
    end if;
  else
    if exists(
      select 1 from jsonb_object_keys(p_arguments) field where field <> 'trailItemId'
    ) or v_trail_item_id is null then
      raise exception 'Retirada de item inválida.' using errcode = '22023';
    end if;
    delete from public.study_path_items item
    where item.owner_id = v_user_id and item.trail_item_id = v_trail_item_id
    returning item.path_id into v_old_path_id;
    v_changed := found;
  end if;

  v_result := jsonb_strip_nulls(jsonb_build_object(
    'status', 'applied',
    'operation', p_operation,
    'requestId', p_request_id,
    'groupId', v_group_id,
    'trailItemId', v_trail_item_id,
    'placementId', v_placement_id,
    'changed', v_changed,
    'idempotent', false
  ));
  insert into private.trail_mutation_receipts(
    owner_id, request_id, request_hash, operation, result
  ) values(v_user_id, p_request_id, v_hash, p_operation, v_result);
  return v_result;
end;
$function$;

delete from private.trail_mutation_receipts
where operation in ('move_group', 'move_item');
alter table private.trail_mutation_receipts
  drop constraint trail_mutation_receipts_operation_v1;
alter table private.trail_mutation_receipts
  add constraint trail_mutation_receipts_operation_v1 check (
    operation in (
      'create_group', 'rename_group', 'delete_group',
      'place_item', 'remove_item_from_group'
    )
  );

create or replace function private.cleanup_trail_personal_access_v1(
  p_user_id uuid,
  p_trail_item_id uuid,
  p_ignored_workspace_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_workspace_id uuid;
begin
  if p_user_id is null or p_trail_item_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-item:' || p_trail_item_id::text, 0
  ));
  select item.workspace_id into v_workspace_id
  from private.trail_items item where item.id = p_trail_item_id;
  if not found then return; end if;
  if exists(
    select 1
    from public.user_course_selections selection
    join private.trail_item_courses alias on alias.course_id = selection.course_id
    join public.courses course on course.id = selection.course_id
    where selection.user_id = p_user_id
      and alias.trail_item_id = p_trail_item_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
  ) or (
    v_workspace_id is not null
    and v_workspace_id is distinct from p_ignored_workspace_id
    and private.educational_workspace_can_v1(
      v_workspace_id, p_user_id, 'read'
    )
  ) then return; end if;

  delete from public.study_path_items placement
  where placement.owner_id = p_user_id
    and placement.trail_item_id = p_trail_item_id;
  delete from private.trail_personal_state_receipts receipt
  where receipt.user_id = p_user_id
    and receipt.trail_item_id = p_trail_item_id;
  delete from public.trail_personal_states state_row
  where state_row.user_id = p_user_id
    and state_row.trail_item_id = p_trail_item_id;
end;
$function$;

create or replace function private.link_workspace_publication_trail_item_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_workspace_item private.trail_items%rowtype;
  v_course_item private.trail_items%rowtype;
  v_source_course_id uuid;
  v_keep_id uuid;
  v_drop_id uuid;
  v_locked_workspace_item_id uuid;
  v_locked_course_item_id uuid;
  v_lock_trail_item_id uuid;
  v_owner_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'trail-root:' || new.workspace_id::text || ':' || new.workspace_course_id,
    0
  ));
  select * into v_workspace_item from private.trail_items item
  where item.workspace_id = new.workspace_id
    and item.workspace_course_id = new.workspace_course_id;
  select item.* into v_course_item
  from private.trail_item_courses alias
  join private.trail_items item on item.id = alias.trail_item_id
  where alias.course_id = new.course_id;
  v_locked_workspace_item_id := v_workspace_item.id;
  v_locked_course_item_id := v_course_item.id;

  perform 1
  from public.courses course
  where course.id = new.course_id
     or course.id in (
       select publication.course_id
       from private.authoring_workspace_publications publication
       where publication.workspace_id = new.workspace_id
         and publication.workspace_course_id = new.workspace_course_id
     )
  order by course.id
  for update;

  for v_owner_id in
    select distinct placement.owner_id
    from public.study_path_items placement
    where placement.trail_item_id in (v_workspace_item.id, v_course_item.id)
    order by placement.owner_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-owner:' || v_owner_id::text, 0
    ));
  end loop;
  for v_lock_trail_item_id in
    select lock_id
    from (values (v_workspace_item.id), (v_course_item.id)) lock_row(lock_id)
    where lock_id is not null
    group by lock_id
    order by lock_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(
      'trail-item:' || v_lock_trail_item_id::text, 0
    ));
  end loop;

  select * into v_workspace_item from private.trail_items item
  where item.workspace_id = new.workspace_id
    and item.workspace_course_id = new.workspace_course_id
  for update;
  select item.* into v_course_item
  from private.trail_item_courses alias
  join private.trail_items item on item.id = alias.trail_item_id
  where alias.course_id = new.course_id
  for update;
  if v_workspace_item.id is distinct from v_locked_workspace_item_id
     or v_course_item.id is distinct from v_locked_course_item_id then
    raise exception 'A identidade de Trilhas mudou durante a publicação.'
      using errcode = '40001';
  end if;
  if v_workspace_item.id is null then
    insert into private.trail_items(workspace_id, workspace_course_id)
    values(new.workspace_id, new.workspace_course_id)
    returning * into v_workspace_item;
  end if;
  if v_course_item.id is null then
    insert into private.trail_item_courses(course_id, trail_item_id)
    values(new.course_id, v_workspace_item.id)
    on conflict(course_id) do update
      set trail_item_id = excluded.trail_item_id;
    update private.trail_items
    set course_id = case when new.target = 'catalog' or course_id is null
          then new.course_id else course_id end,
        updated_at = now()
    where id = v_workspace_item.id;
    if new.target = 'catalog' then
      perform private.consolidate_catalog_root_v1(
        new.workspace_id, new.workspace_course_id, new.course_id
      );
    end if;
    return new;
  end if;
  if v_workspace_item.id = v_course_item.id then
    update private.trail_items
    set course_id = case when new.target = 'catalog' or course_id is null
          then new.course_id else course_id end,
        updated_at = now()
    where id = v_workspace_item.id;
    if new.target = 'catalog' then
      perform private.consolidate_catalog_root_v1(
        new.workspace_id, new.workspace_course_id, new.course_id
      );
    end if;
    return new;
  end if;
  select workspace.source_course_id into v_source_course_id
  from private.authoring_workspaces workspace where workspace.id = new.workspace_id;
  if v_source_course_id = new.course_id then
    v_keep_id := v_course_item.id;
    v_drop_id := v_workspace_item.id;
  else
    v_keep_id := v_workspace_item.id;
    v_drop_id := v_course_item.id;
  end if;

  perform 1
  from public.trail_personal_states state_row
  where state_row.trail_item_id in (v_keep_id, v_drop_id)
  order by state_row.user_id, state_row.trail_item_id
  for update;
  perform 1
  from private.trail_observation_threads thread
  where thread.trail_item_id in (v_keep_id, v_drop_id)
  order by thread.user_id, thread.card_id, thread.id
  for update;
  perform 1
  from public.study_path_items placement
  where placement.trail_item_id in (v_keep_id, v_drop_id)
  order by placement.owner_id, placement.path_id, placement.id
  for update;

  insert into public.trail_personal_states(
    user_id, trail_item_id, revision, completed_card_count,
    state, created_at, updated_at
  )
  select state_row.user_id, v_keep_id, state_row.revision,
    state_row.completed_card_count, state_row.state,
    state_row.created_at, state_row.updated_at
  from public.trail_personal_states state_row
  where state_row.trail_item_id = v_drop_id
  on conflict(user_id, trail_item_id) do update set
    revision = greatest(public.trail_personal_states.revision, excluded.revision) + 1,
    state = private.merge_trail_personal_state_v1(
      excluded.state, public.trail_personal_states.state
    ),
    updated_at = greatest(public.trail_personal_states.updated_at, excluded.updated_at);

  delete from private.trail_observation_threads losing
  where losing.trail_item_id = v_drop_id
    and exists(
      select 1 from private.trail_observation_threads kept
      where kept.user_id = losing.user_id
        and kept.trail_item_id = v_keep_id
        and kept.card_id = losing.card_id
    );
  update private.trail_observation_threads
  set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;

  update public.trail_personal_states state_row
  set completed_card_count = (
    select coalesce(sum(jsonb_array_length(lesson.value->'completedCardIds')), 0)::integer
    from jsonb_each(coalesce(state_row.state#>'{progress,lessons}', '{}'::jsonb)) lesson(path, value)
  )
  where state_row.trail_item_id = v_keep_id;
  delete from public.trail_personal_states where trail_item_id = v_drop_id;
  delete from private.trail_personal_state_receipts where trail_item_id = v_drop_id;

  delete from public.study_path_items losing
  where losing.trail_item_id = v_drop_id
    and exists(
      select 1 from public.study_path_items kept
      where kept.owner_id = losing.owner_id and kept.trail_item_id = v_keep_id
    );
  update public.study_path_items set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;
  update private.trail_item_courses
  set trail_item_id = v_keep_id
  where trail_item_id = v_drop_id;
  delete from private.trail_items where id = v_drop_id;
  update private.trail_items
  set workspace_id = new.workspace_id,
      workspace_course_id = new.workspace_course_id,
      course_id = case when new.target = 'catalog' or course_id is null
        then new.course_id else course_id end,
      updated_at = now()
  where id = v_keep_id;
  if new.target = 'catalog' then
    perform private.consolidate_catalog_root_v1(
      new.workspace_id, new.workspace_course_id, new.course_id
    );
  end if;
  return new;
end;
$function$;

drop function private.move_trail_group_v1(uuid, uuid, integer);
drop function private.move_trail_item_v1(uuid, uuid, uuid, integer);
drop function private.normalize_trail_groups_v1(uuid);
drop function private.normalize_trail_group_items_v1(uuid, uuid);

create function private.list_trail_items_for_actor_v1(
  p_actor_id uuid,
  p_limit integer default 50,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := p_actor_id;
  v_groups jsonb;
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Consulta de Trilhas inválida.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', path.id, 'title', path.title
  ) order by private.trail_alphabetic_key_v1(path.title) collate "C", path.id), '[]'::jsonb)
  into v_groups
  from public.study_paths path where path.owner_id = v_user_id;

  with accessible_workspaces as materialized (
    select workspace.*
    from private.authoring_workspaces workspace
    where workspace.deleted_at is null
      and private.educational_workspace_can_v1(workspace.id, v_user_id, 'read')
  ), workspace_items as materialized (
    select
      item.id as trail_item_id,
      workspace.id as workspace_id,
      course.entity_id as course_key,
      coalesce(publication.course_id, item.course_id) as course_id,
      selection.id as selection_id,
      case when counts.card_count = 0 then 'plan' else 'course' end as item_kind,
      'workspace'::text as source_kind,
      case
        when publication.target = 'catalog' then 'catalog'
        when publication.target = 'private' then 'private'
        else 'workspace'
      end as course_origin,
      coalesce(nullif(btrim(course.content->>'title'), ''), workspace.title) as title,
      coalesce(course.content->>'goal', workspace.purpose, '') as description,
      counts.module_count, counts.lesson_count,
      counts.microsequence_count, counts.card_count,
      publication.content_hash,
      workspace.revision,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'author') as can_edit,
      case when publication.target = 'catalog'
        then private.can_publish_catalog_v5(v_user_id)
        else private.educational_workspace_can_v1(workspace.id, v_user_id, 'manage')
      end as can_delete,
      selection.id is not null as can_remove,
      greatest(workspace.updated_at, course.updated_at) as updated_at
    from accessible_workspaces workspace
    join private.authoring_workspace_entities course
      on course.workspace_id = workspace.id and course.entity_type = 'course'
    join private.trail_items item
      on item.workspace_id = workspace.id
     and item.workspace_course_id = course.entity_id
    left join lateral (
      with recursive descendants as (
        select entity.entity_type, entity.entity_id
        from private.authoring_workspace_entities entity
        where entity.workspace_id = workspace.id
          and entity.parent_type = 'course'
          and entity.parent_id = course.entity_id
        union all
        select child.entity_type, child.entity_id
        from descendants parent
        join private.authoring_workspace_entities child
          on child.workspace_id = workspace.id
         and child.parent_type = parent.entity_type
         and child.parent_id = parent.entity_id
      )
      select count(*) filter(where entity_type = 'module')::integer as module_count,
        count(*) filter(where entity_type = 'lesson')::integer as lesson_count,
        count(*) filter(where entity_type = 'microsequence')::integer as microsequence_count,
        count(*) filter(where entity_type = 'card')::integer as card_count
      from descendants
    ) counts on true
    left join lateral (
      select link.target, link.course_id, link.content_hash
      from private.authoring_workspace_publications link
      where link.workspace_id = workspace.id
        and link.workspace_course_id = course.entity_id
      order by (link.target = 'catalog') desc, link.updated_at desc
      limit 1
    ) publication on true
    left join lateral (
      select candidate.*
      from private.trail_item_courses alias
      join public.user_course_selections candidate
        on candidate.course_id = alias.course_id
       and candidate.user_id = v_user_id
      where alias.trail_item_id = item.id
      order by (candidate.course_id = publication.course_id) desc,
        candidate.updated_at desc, candidate.id
      limit 1
    ) selection on true
  ), selected_items as materialized (
    select distinct on (item.id) item.id as trail_item_id,
      null::uuid as workspace_id, null::text as course_key,
      course.id as course_id, selection.id as selection_id,
      'course'::text as item_kind, 'selection'::text as source_kind,
      case when course.owner_id is null then 'catalog' else 'private' end as course_origin,
      course.title, coalesce(course.goal, '') as description,
      course.module_count::integer, course.lesson_count::integer,
      course.microsequence_count::integer, course.card_count::integer,
      course.current_revision_hash as content_hash,
      null::bigint as revision,
      case when course.owner_id is null then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id end as can_edit,
      case when course.owner_id is null then private.can_publish_catalog_v5(v_user_id)
        else course.owner_id = v_user_id end as can_delete,
      true as can_remove,
      greatest(selection.updated_at, course.updated_at) as updated_at
    from public.user_course_selections selection
    join public.courses course on course.id = selection.course_id
    join private.trail_item_courses alias on alias.course_id = course.id
    join private.trail_items item on item.id = alias.trail_item_id
    where selection.user_id = v_user_id
      and course.status = 'published' and course.deleted_at is null
      and course.document_storage_enabled
      and not exists(
        select 1 from workspace_items workspace_item
        where workspace_item.trail_item_id = item.id
      )
    order by item.id, (course.id = item.course_id) desc,
      selection.updated_at desc, selection.id
  ), all_items as materialized (
    select * from workspace_items union all select * from selected_items
  ), located as materialized (
    select content.*, placement.path_id, path.title as path_title
    from all_items content
    left join public.study_path_items placement
      on placement.owner_id = v_user_id
     and placement.trail_item_id = content.trail_item_id
    left join public.study_paths path
      on path.id = placement.path_id and path.owner_id = v_user_id
  ), candidates as materialized (
    select * from located
    where p_after_id is null or trail_item_id > p_after_id
    order by trail_item_id
    limit p_limit + 1
  ), page as materialized (
    select * from candidates order by trail_item_id limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'trailItemId', page.trail_item_id,
      'workspaceId', page.workspace_id,
      'courseKey', page.course_key,
      'courseId', page.course_id,
      'selectionId', page.selection_id,
      'kind', page.item_kind,
      'source', page.source_kind,
      'origin', page.course_origin,
      'title', page.title,
      'description', page.description,
      'moduleCount', page.module_count,
      'lessonCount', page.lesson_count,
      'microsequenceCount', page.microsequence_count,
      'cardCount', page.card_count,
      'completedCardCount', private.trail_completed_card_count_v1(
        v_user_id, page.trail_item_id
      ),
      'contentHash', page.content_hash,
      'revision', page.revision,
      'canEdit', page.can_edit,
      'canDelete', page.can_delete,
      'canRemove', page.can_remove,
      'pathId', page.path_id,
      'pathTitle', page.path_title,
      'updatedAt', page.updated_at
    ) order by private.trail_alphabetic_key_v1(page.title) collate "C", page.trail_item_id),
    '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object('afterId', page.trail_item_id)
      from page order by page.trail_item_id desc limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;
  return jsonb_build_object(
    'space', 'trails', 'groups', v_groups, 'items', v_items,
    'hasMore', v_has_more, 'nextCursor', v_next_cursor,
    'capabilities', jsonb_build_object(
      'catalogManage', private.can_publish_catalog_v5(v_user_id),
      'catalogReview', private.can_review_catalog_v5(v_user_id)
    )
  );
end;
$function$;

create function public.list_trail_items_v1(
  p_limit integer default 50,
  p_after_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
  select private.list_trail_items_for_actor_v1(auth.uid(), p_limit, p_after_id)
$function$;

create function public.list_trail_items_for_actor_v1(
  p_actor_id uuid,
  p_limit integer default 50,
  p_after_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.list_trail_items_for_actor_v1(p_actor_id, p_limit, p_after_id)
$function$;

drop function public.list_trail_items_v1(integer, integer, integer, uuid);
drop function public.list_trail_items_for_actor_v1(uuid, integer, integer, integer, uuid);
drop function private.list_trail_items_for_actor_v1(uuid, integer, integer, integer, uuid);

drop index if exists public.study_paths_owner_position_idx;
drop index if exists public.study_path_items_path_position_idx;
alter table public.study_paths
  drop constraint if exists study_paths_position_nonnegative,
  drop column position;
alter table public.study_path_items
  drop constraint study_path_items_position_nonnegative,
  drop column position;
create index study_paths_owner_id_idx on public.study_paths(owner_id, id);

revoke all on function private.trail_alphabetic_key_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function private.list_trail_items_for_actor_v1(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function private.list_trail_items_for_actor_v1(uuid, integer, uuid)
  to service_role;
revoke all on function public.mutate_trails_v1(uuid, text, jsonb)
  from public, anon;
grant execute on function public.mutate_trails_v1(uuid, text, jsonb)
  to authenticated;
revoke all on function public.list_trail_items_v1(integer, uuid)
  from public, anon;
grant execute on function public.list_trail_items_v1(integer, uuid)
  to authenticated;
revoke all on function public.list_trail_items_for_actor_v1(uuid, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.list_trail_items_for_actor_v1(uuid, integer, uuid)
  to service_role;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_alphabetic_trails_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with base as (
    select public.get_aralearn_runtime_manifest_without_alphabetic_trails_v1() as value
  )
  select jsonb_set(
    jsonb_set(base.value, '{schemaRevision}', '"20260808020000"'::jsonb),
    '{features}',
    case when (base.value->'features') ? 'alphabetic-trails-v1'
      then base.value->'features'
      else (base.value->'features') || jsonb_build_array('alphabetic-trails-v1')
    end
  )
  from base
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_without_alphabetic_trails_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
