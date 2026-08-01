-- Projeção autenticada e frugal do estado corrente usado pela Central.
-- Não cria tabela, snapshot nem histórico: cada resposta deriva das fontes
-- canônicas e pagina apenas a seção solicitada.

begin;

create function public.get_current_state_central_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_can_review boolean;
  v_can_publish boolean;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;

  v_can_review := private.can_review_catalog_v5(v_user_id);
  v_can_publish := private.can_publish_catalog_v5(v_user_id);

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'construction', (
        select count(*)
        from private.authoring_workspaces workspace
        where workspace.owner_id = v_user_id
          and workspace.deleted_at is null
      ),
      'trails', (
        select count(*)
        from public.user_course_selections selection
        join public.courses course on course.id = selection.course_id
        where selection.user_id = v_user_id
          and course.status = 'published'
          and course.deleted_at is null
          and course.document_storage_enabled
      ),
      'evaluationMine', (
        select count(*)
        from private.catalog_review_submissions submission
        where submission.author_id = v_user_id
          and submission.status in ('submitted', 'in_review')
      ),
      'evaluationQueue', case when v_can_review then (
        select count(*)
        from private.catalog_review_submissions submission
        where submission.status in ('submitted', 'in_review')
      ) else 0 end,
      'collections', (
        select count(distinct publication.course_id)
        from private.authoring_workspace_publications publication
        join private.authoring_workspaces workspace
          on workspace.id = publication.workspace_id
        join public.courses course on course.id = publication.course_id
        where workspace.owner_id = v_user_id
          and workspace.deleted_at is null
          and publication.target = 'catalog'
          and course.owner_id is null
          and course.status = 'published'
          and course.deleted_at is null
          and course.document_storage_enabled
      )
    ),
    'capabilities', jsonb_build_object(
      'authoringPrivate', true,
      'catalogSubmit', true,
      'catalogReview', v_can_review,
      'catalogPublish', v_can_publish,
      'catalogManage', v_can_publish
    )
  );
end;
$function$;

create function public.list_current_state_central_v1(
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
      select * from candidates
      order by updated_at desc, id desc
      limit p_limit
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'workspaceId', page.id,
        'kind', case when page.source_submission_id is null then 'authoring' else 'review' end,
        'title', page.title,
        'publicationCount', (
          select count(*)
          from private.authoring_workspace_publications publication
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
        greatest(
          (select max(progress.last_activity_at)
           from public.lesson_progress progress
           where progress.selection_id = selection.id),
          (select max(progress.last_activity_at)
           from public.card_progress progress
           where progress.selection_id = selection.id)
        ) as last_activity_at
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
      select * from candidates
      order by position, id
      limit p_limit
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
        'lastActivityAt', page.last_activity_at,
        'position', page.position
      ) order by page.position, page.id), '[]'::jsonb),
      (select count(*) from candidates) > p_limit,
      case when (select count(*) from candidates) > p_limit then (
        select jsonb_build_object(
          'afterPosition', page.position,
          'afterId', page.id
        )
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
      select * from candidates
      order by submitted_at desc, id desc
      limit p_limit
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
      join private.authoring_workspaces workspace
        on workspace.id = publication.workspace_id
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
      select * from candidates
      order by updated_at desc, course_id desc
      limit p_limit
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

revoke all on function public.get_current_state_central_v1()
  from public, anon, service_role;
grant execute on function public.get_current_state_central_v1()
  to authenticated;

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
    'schemaRevision', '20260801120000',
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
      'current-state-central-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
