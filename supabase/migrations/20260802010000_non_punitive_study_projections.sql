begin;

-- A data resume somente quando o estado funcional corrente foi modificado.
-- Ela não representa presença, atenção, tempo de estudo nem desempenho.
create or replace function private.current_study_state_at(p_selection_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select max(state.updated_at)
  from (
    select progress.updated_at
    from public.lesson_progress progress
    where progress.selection_id = p_selection_id
    union all
    select progress.updated_at
    from public.card_progress progress
    where progress.selection_id = p_selection_id
  ) state;
$$;

drop function if exists public.list_user_course_summaries();

create function public.list_user_course_summaries()
returns table(
  selection_id uuid,
  course_id uuid,
  contract_key text,
  title text,
  goal text,
  "position" integer,
  publication_seq bigint,
  content_hash text,
  module_count bigint,
  lesson_count bigint,
  last_study_state_at timestamptz,
  course_origin text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  return query
  select
    selection.id,
    course.id,
    course.contract_key,
    course.title,
    course.goal,
    selection.position,
    course.publication_seq,
    course.content_hash,
    course.module_count,
    course.lesson_count,
    private.current_study_state_at(selection.id),
    case when course.owner_id is null then 'catalog' else 'private' end
  from public.user_course_selections selection
  join public.courses course on course.id = selection.course_id
  where selection.user_id = v_user_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  order by selection.position, selection.created_at, selection.id;
end;
$$;

create or replace function public.list_personal_library_courses(
  p_actor_user_id uuid,
  p_client_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_selection_id uuid default null,
  p_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_items jsonb := '[]'::jsonb;
  v_item record;
  v_count integer := 0;
  v_has_more boolean := false;
  v_last_position integer;
  v_last_selection_id uuid;
begin
  perform private.require_personal_library_client(
    p_actor_user_id,
    p_client_id,
    'authoring:private:read'
  );
  if p_limit is null
     or p_limit not between 1 and 100
     or char_length(v_query) > 160
     or ((p_after_position is null) <> (p_after_selection_id is null))
     or (p_after_position is not null and p_after_position < 0) then
    raise exception 'Paginação da biblioteca pessoal inválida.' using errcode = '22023';
  end if;

  for v_item in
    select
      selection.position,
      selection.id as selection_id,
      jsonb_build_object(
        'selectionId', selection.id,
        'courseId', course.id,
        'kind', case when course.owner_id is null then 'official' else 'personal' end,
        'contractKey', course.contract_key,
        'title', course.title,
        'goal', course.goal,
        'position', selection.position,
        'publicationSeq', course.publication_seq,
        'catalogRevision', course.catalog_revision,
        'contentHash', course.content_hash,
        'moduleCount', course.module_count,
        'lessonCount', course.lesson_count,
        'pathId', path.id,
        'pathTitle', path.title,
        'lastStudyStateAt', private.current_study_state_at(selection.id)
      ) as item
    from public.user_course_selections selection
    join public.courses course on course.id = selection.course_id
    left join public.study_path_courses path_course
      on path_course.owner_id = p_actor_user_id
      and path_course.selection_id = selection.id
    left join public.study_paths path
      on path.id = path_course.path_id
      and path.owner_id = p_actor_user_id
    where selection.user_id = p_actor_user_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and (course.owner_id is null or course.owner_id = p_actor_user_id)
      and (
        v_query = ''
        or position(lower(v_query) in lower(
          course.title || ' ' || course.goal || ' ' || course.contract_key
        )) > 0
      )
      and (
        p_after_position is null
        or (selection.position, selection.id) >
          (p_after_position, p_after_selection_id)
      )
    order by selection.position, selection.id
    limit p_limit + 1
  loop
    v_count := v_count + 1;
    if v_count > p_limit then
      v_has_more := true;
      exit;
    end if;
    v_items := v_items || jsonb_build_array(v_item.item);
    v_last_position := v_item.position;
    v_last_selection_id := v_item.selection_id;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterSelectionId', v_last_selection_id
    ) else null end
  );
end;
$$;

create or replace function public.list_current_state_central_v1(
  p_section text,
  p_limit integer default 20,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_after_position integer default null,
  p_after_id uuid default null,
  p_audience text default 'mine'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor jsonb := null;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_section is null
     or p_section not in ('construction', 'trails', 'evaluation', 'collections')
     or p_limit is null
     or p_limit not between 1 and 50
     or p_audience is null
     or p_audience not in ('mine', 'queue')
     or ((p_before_at is null) <> (p_before_id is null))
     or ((p_after_position is null) <> (p_after_id is null))
     or (p_after_position is not null and p_after_position < 0)
     or (p_section = 'trails' and p_before_at is not null)
     or (p_section <> 'trails' and p_after_position is not null)
     or (p_section <> 'evaluation' and p_audience <> 'mine') then
    raise exception 'Consulta da Central inválida.' using errcode = '22023';
  end if;
  if p_section = 'evaluation'
     and p_audience = 'queue'
     and not private.can_review_catalog_v5(v_user_id) then
    raise exception 'Revisão editorial não autorizada.' using errcode = '42501';
  end if;

  if p_section = 'construction' then
    with candidates as materialized (
      select workspace.*
      from private.authoring_workspaces workspace
      where workspace.owner_id = v_user_id
        and workspace.deleted_at is null
        and (
          p_before_at is null
          or (workspace.updated_at, workspace.id) < (p_before_at, p_before_id)
        )
      order by workspace.updated_at desc, workspace.id desc
      limit p_limit + 1
    ), page as materialized (
      select * from candidates order by updated_at desc, id desc limit p_limit
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'workspaceId', page.id,
        'kind', case when page.source_submission_id is null then 'authoring' else 'review' end,
        'title', page.title,
        'publicationCount', (
          select count(*) from private.authoring_workspace_publications publication
          where publication.workspace_id = page.id
        ),
        'updatedAt', page.updated_at
      ) order by page.updated_at desc, page.id desc), '[]'::jsonb),
      (select count(*) from candidates) > p_limit,
      case when (select count(*) from candidates) > p_limit then (
        select jsonb_build_object('beforeAt', page.updated_at, 'beforeId', page.id)
        from page order by page.updated_at, page.id limit 1
      ) end
    into v_items, v_has_more, v_next_cursor
    from page;
  elsif p_section = 'trails' then
    with candidates as materialized (
      select selection.*, course.title, course.goal, course.module_count,
        course.lesson_count,
        case when course.owner_id is null then 'catalog' else 'private' end as course_origin,
        private.current_study_state_at(selection.id) as last_study_state_at
      from public.user_course_selections selection
      join public.courses course on course.id = selection.course_id
      where selection.user_id = v_user_id
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
        and (
          p_after_position is null
          or (selection.position, selection.id) > (p_after_position, p_after_id)
        )
      order by selection.position, selection.id
      limit p_limit + 1
    ), page as materialized (
      select * from candidates order by position, id limit p_limit
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'selectionId', page.id,
        'courseId', page.course_id,
        'kind', page.course_origin,
        'title', page.title,
        'goal', page.goal,
        'moduleCount', page.module_count,
        'lessonCount', page.lesson_count,
        'lastStudyStateAt', page.last_study_state_at,
        'position', page.position
      ) order by page.position, page.id), '[]'::jsonb),
      (select count(*) from candidates) > p_limit,
      case when (select count(*) from candidates) > p_limit then (
        select jsonb_build_object('afterPosition', page.position, 'afterId', page.id)
        from page order by page.position desc, page.id desc limit 1
      ) end
    into v_items, v_has_more, v_next_cursor
    from page;
  elsif p_section = 'evaluation' then
    with candidates as materialized (
      select submission.*
      from private.catalog_review_submissions submission
      where submission.status in ('submitted', 'in_review')
        and (
          (p_audience = 'mine' and submission.author_id = v_user_id)
          or p_audience = 'queue'
        )
        and (
          p_before_at is null
          or (submission.submitted_at, submission.id) < (p_before_at, p_before_id)
        )
      order by submission.submitted_at desc, submission.id desc
      limit p_limit + 1
    ), page as materialized (
      select * from candidates order by submitted_at desc, id desc limit p_limit
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'submissionId', page.id,
        'courseId', page.source_course_id,
        'kind', p_audience,
        'title', page.title,
        'status', page.status,
        'completionState', page.completion_state,
        'claimedByMe', page.reviewer_id = v_user_id,
        'claimAvailable', page.status = 'submitted'
          or page.claim_expires_at is null
          or page.claim_expires_at <= now(),
        'submittedAt', page.submitted_at,
        'updatedAt', page.updated_at
      ) order by page.submitted_at desc, page.id desc), '[]'::jsonb),
      (select count(*) from candidates) > p_limit,
      case when (select count(*) from candidates) > p_limit then (
        select jsonb_build_object('beforeAt', page.submitted_at, 'beforeId', page.id)
        from page order by page.submitted_at, page.id limit 1
      ) end
    into v_items, v_has_more, v_next_cursor
    from page;
  else
    with owned as materialized (
      select distinct on (publication.course_id)
        publication.course_id,
        publication.updated_at,
        workspace.title as workspace_title,
        course.title,
        course.goal,
        course.completion_state
      from private.authoring_workspace_publications publication
      join private.authoring_workspaces workspace on workspace.id = publication.workspace_id
      join public.courses course on course.id = publication.course_id
      where workspace.owner_id = v_user_id
        and workspace.deleted_at is null
        and publication.target = 'catalog'
        and course.owner_id is null
        and course.status = 'published'
        and course.deleted_at is null
        and course.document_storage_enabled
      order by publication.course_id, publication.updated_at desc
    ), candidates as materialized (
      select * from owned
      where p_before_at is null
        or (owned.updated_at, owned.course_id) < (p_before_at, p_before_id)
      order by owned.updated_at desc, owned.course_id desc
      limit p_limit + 1
    ), page as materialized (
      select * from candidates order by updated_at desc, course_id desc limit p_limit
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'courseId', page.course_id,
        'kind', 'catalog',
        'title', page.title,
        'goal', page.goal,
        'completionState', page.completion_state,
        'workspaceTitle', page.workspace_title,
        'updatedAt', page.updated_at
      ) order by page.updated_at desc, page.course_id desc), '[]'::jsonb),
      (select count(*) from candidates) > p_limit,
      case when (select count(*) from candidates) > p_limit then (
        select jsonb_build_object('beforeAt', page.updated_at, 'beforeId', page.course_id)
        from page order by page.updated_at, page.course_id limit 1
      ) end
    into v_items, v_has_more, v_next_cursor
    from page;
  end if;

  return jsonb_build_object(
    'section', p_section,
    'audience', p_audience,
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

revoke all on function private.current_study_state_at(uuid) from public;
revoke all on function public.list_user_course_summaries() from public, anon;
grant execute on function public.list_user_course_summaries() to authenticated;
revoke all on function public.list_personal_library_courses(
  uuid, uuid, integer, integer, uuid, text
) from public, anon, authenticated;
grant execute on function public.list_personal_library_courses(
  uuid, uuid, integer, integer, uuid, text
) to service_role;
revoke all on function public.list_current_state_central_v1(
  text, integer, timestamptz, uuid, integer, uuid, text
) from public, anon, service_role;
grant execute on function public.list_current_state_central_v1(
  text, integer, timestamptz, uuid, integer, uuid, text
) to authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260802010000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog','artifact-offline-replica','granular-sync',
      'private-authoring','text-language-metadata','storage-artifact-control-plane',
      'pre-registered-publication-artifacts','single-current-course-revision',
      'storage-only-course-content','canonical-resource-registry','atomic-resource-authoring',
      'atomic-card-assistance','composed-authoring-workspaces','workspace-publication-bindings',
      'unchanged-publication-short-circuit','bounded-authoring-events','partial-private-publication',
      'microtheory-review-projection','workspace-cursor-pagination','workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination','global-catalog-course-search',
      'catalog-review-submissions','catalog-management','personal-library-course-removal',
      'course-revision-sync-compaction','automatic-sync-history-maintenance','compact-authoring-brief',
      'account-derived-authoring-capabilities','oauth-only-authoring-mcp','default-catalog-collection',
      'confidential-gpt-action-oauth','gpt-action-oauth-linking','gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback','workspace-card-metadata','structured-authoring-errors',
      'current-state-central-v1','situated-personal-comments-v1',
      'educational-workspace-membership-v1','educational-workspace-invitations-v1',
      'workspace-capability-enforcement-v1','workspace-member-course-access-v1',
      'workspace-contextual-current-state-v1','workspace-pedagogical-comments-v1',
      'workspace-course-state-projection-v1','non-punitive-study-state-v1',
      'non-punitive-study-projections-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
