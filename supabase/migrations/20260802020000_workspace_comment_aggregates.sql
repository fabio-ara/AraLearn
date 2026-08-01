begin;

create or replace function private.educational_workspace_comment_summary_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_can_review boolean;
  v_result jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'comment'
  );
  v_can_review := private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, 'review'
  );

  with visible as materialized (
    select comment.*, course.title as course_title,
      comment.card_key is not null
        and comment.course_revision_hash = course.current_revision_hash
        as target_available
    from public.card_comments comment
    join public.courses course on course.id = comment.course_id
    where comment.workspace_id = p_workspace_id
      and (v_can_review or comment.user_id = p_actor_id)
  ), totals as materialized (
    select
      count(*)::integer as total_count,
      count(*) filter (where status = 'open')::integer as open_count,
      jsonb_build_object(
        'question', count(*) filter (where category = 'question'),
        'possibleError', count(*) filter (where category = 'possible_error'),
        'confusing', count(*) filter (where category = 'confusing'),
        'suggestion', count(*) filter (where category = 'suggestion'),
        'observation', count(*) filter (where category = 'observation')
      ) as by_category,
      jsonb_build_object(
        'open', count(*) filter (where status = 'open'),
        'considered', count(*) filter (where status = 'considered'),
        'resolved', count(*) filter (where status = 'resolved'),
        'incorporated', count(*) filter (where status = 'incorporated')
      ) as by_status
    from visible
  ), focus as materialized (
    select
      course_id,
      card_id,
      max(course_title) as course_title,
      max(card_title) as card_title,
      max(course_key) as course_key,
      max(module_key) as module_key,
      max(lesson_key) as lesson_key,
      max(microsequence_key) as microsequence_key,
      max(card_key) as card_key,
      bool_or(target_available) as target_available,
      count(*)::integer as total_count,
      count(*) filter (where status = 'open')::integer as open_count,
      jsonb_build_object(
        'question', count(*) filter (where category = 'question'),
        'possibleError', count(*) filter (where category = 'possible_error'),
        'confusing', count(*) filter (where category = 'confusing'),
        'suggestion', count(*) filter (where category = 'suggestion'),
        'observation', count(*) filter (where category = 'observation')
      ) as by_category
    from visible
    group by course_id, card_id
    order by
      count(*) filter (where status = 'open') desc,
      count(*) desc,
      card_id
    limit 20
  )
  select jsonb_build_object(
    'totalCount', totals.total_count,
    'openCount', totals.open_count,
    'byCategory', totals.by_category,
    'byStatus', totals.by_status,
    'focusCards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'courseId', focus.course_id,
        'cardId', focus.card_id,
        'courseTitle', focus.course_title,
        'cardTitle', focus.card_title,
        'entityPath', case when focus.card_key is null then null
          else jsonb_build_array(
            focus.course_key, focus.module_key, focus.lesson_key,
            focus.microsequence_key, focus.card_key
          ) end,
        'targetAvailable', focus.target_available,
        'totalCount', focus.total_count,
        'openCount', focus.open_count,
        'byCategory', focus.by_category
      ) order by focus.open_count desc, focus.total_count desc, focus.card_id)
      from focus
    ), '[]'::jsonb)
  ) into v_result
  from totals;
  return v_result;
end;
$function$;

create or replace function public.list_current_educational_workspace_comments_v1(
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_categories text[] default null,
  p_statuses text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
  select private.list_educational_workspace_comments_v1(
    auth.uid(), p_workspace_id, p_limit, p_before_updated_at, p_before_id,
    p_categories, p_statuses
  ) || jsonb_build_object(
    'summary', private.educational_workspace_comment_summary_v1(
      auth.uid(), p_workspace_id
    )
  )
$function$;

create or replace function public.list_educational_workspace_comments_for_actor_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_categories text[] default null,
  p_statuses text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.list_educational_workspace_comments_v1(
    p_actor_id, p_workspace_id, p_limit, p_before_updated_at, p_before_id,
    p_categories, p_statuses
  ) || jsonb_build_object(
    'summary', private.educational_workspace_comment_summary_v1(
      p_actor_id, p_workspace_id
    )
  )
$function$;

revoke all on function private.educational_workspace_comment_summary_v1(uuid, uuid)
  from public;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260802020000',
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
      'non-punitive-study-projections-v1','workspace-comment-aggregates-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
