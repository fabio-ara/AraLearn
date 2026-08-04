-- Trilhas e Coleções passam a ser as únicas superfícies de organização.
-- A projeção de Trilhas reúne planos correntes, cursos em materialização e
-- cursos selecionados sem criar tabela, snapshot ou cópia de conteúdo.

begin;

drop function if exists public.get_current_state_central_v1();
drop function if exists public.list_current_state_central_v1(
  text, integer, timestamptz, uuid, integer, uuid, text
);

create function public.list_trail_items_v1(
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100
     or ((p_after_position is null) <> (p_after_id is null))
     or coalesce(p_after_position, 0) < 0 then
    raise exception 'Consulta de Trilhas inválida.' using errcode = '22023';
  end if;

  with accessible_workspaces as materialized (
    select workspace.*, member.role
    from private.authoring_workspaces workspace
    join private.educational_workspace_members member
      on member.workspace_id = workspace.id
     and member.user_id = v_user_id
    where workspace.deleted_at is null
  ), workspace_courses as materialized (
    select
      'workspace:' || workspace.id::text || ':' || course.entity_id as item_id,
      workspace.id as workspace_id,
      course.entity_id as course_key,
      publication.course_id,
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
      counts.module_count,
      counts.lesson_count,
      counts.microsequence_count,
      counts.card_count,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'author') as can_edit,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'manage') as can_delete,
      coalesce(selection.position, 1000000 + row_number() over (
        order by workspace.updated_at desc, workspace.id, course.position, course.entity_id
      )::integer) as position,
      greatest(workspace.updated_at, course.updated_at) as updated_at
    from accessible_workspaces workspace
    join private.authoring_workspace_entities course
      on course.workspace_id = workspace.id
     and course.entity_type = 'course'
    left join lateral (
      select
        count(distinct module_value.entity_id)::integer as module_count,
        count(distinct lesson.entity_id)::integer as lesson_count,
        count(distinct microsequence.entity_id)::integer as microsequence_count,
        count(distinct card.entity_id)::integer as card_count
      from private.authoring_workspace_entities module_value
      left join private.authoring_workspace_entities lesson
        on lesson.workspace_id = module_value.workspace_id
       and lesson.entity_type = 'lesson'
       and lesson.parent_type = 'module'
       and lesson.parent_id = module_value.entity_id
      left join private.authoring_workspace_entities microsequence
        on microsequence.workspace_id = lesson.workspace_id
       and microsequence.entity_type = 'microsequence'
       and microsequence.parent_type = 'lesson'
       and microsequence.parent_id = lesson.entity_id
      left join private.authoring_workspace_entities card
        on card.workspace_id = microsequence.workspace_id
       and card.entity_type = 'card'
       and card.parent_type = 'microsequence'
       and card.parent_id = microsequence.entity_id
      where module_value.workspace_id = workspace.id
        and module_value.entity_type = 'module'
        and module_value.parent_type = 'course'
        and module_value.parent_id = course.entity_id
    ) counts on true
    left join lateral (
      select link.course_id, link.target
      from private.authoring_workspace_publications link
      where link.workspace_id = workspace.id
        and link.workspace_course_id = course.entity_id
      order by case link.target when 'private' then 0 else 1 end, link.updated_at desc
      limit 1
    ) publication on true
    left join public.user_course_selections selection
      on selection.user_id = v_user_id
     and selection.course_id = publication.course_id
  ), empty_workspace_plans as materialized (
    select
      'workspace:' || workspace.id::text || ':plan' as item_id,
      workspace.id as workspace_id,
      null::text as course_key,
      null::uuid as course_id,
      null::uuid as selection_id,
      'plan'::text as item_kind,
      'workspace'::text as source_kind,
      'workspace'::text as course_origin,
      workspace.title,
      coalesce(workspace.purpose, workspace.brief, '') as description,
      0::integer as module_count,
      0::integer as lesson_count,
      0::integer as microsequence_count,
      0::integer as card_count,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'author') as can_edit,
      private.educational_workspace_can_v1(workspace.id, v_user_id, 'manage') as can_delete,
      1000000 + row_number() over (
        order by workspace.updated_at desc, workspace.id
      )::integer as position,
      workspace.updated_at
    from accessible_workspaces workspace
    where not exists (
      select 1 from private.authoring_workspace_entities entity
      where entity.workspace_id = workspace.id and entity.entity_type = 'course'
    )
  ), selected_courses as materialized (
    select
      'course:' || course.id::text as item_id,
      null::uuid as workspace_id,
      null::text as course_key,
      course.id as course_id,
      selection.id as selection_id,
      'course'::text as item_kind,
      'selection'::text as source_kind,
      case when course.owner_id is null then 'catalog' else 'private' end as course_origin,
      course.title,
      coalesce(course.goal, '') as description,
      course.module_count::integer,
      course.lesson_count::integer,
      0::integer as microsequence_count,
      course.card_count::integer,
      (course.owner_id = v_user_id) as can_edit,
      (course.owner_id = v_user_id) as can_delete,
      selection.position,
      greatest(selection.updated_at, course.updated_at) as updated_at
    from public.user_course_selections selection
    join public.courses course on course.id = selection.course_id
    where selection.user_id = v_user_id
      and course.status = 'published'
      and course.deleted_at is null
      and course.document_storage_enabled
      and not exists (
        select 1
        from private.authoring_workspace_publications publication
        join accessible_workspaces workspace on workspace.id = publication.workspace_id
        where publication.course_id = course.id
      )
  ), all_items as materialized (
    select * from workspace_courses
    union all
    select * from empty_workspace_plans
    union all
    select * from selected_courses
  ), candidates as materialized (
    select * from all_items
    where p_after_position is null or (position, item_id) > (p_after_position, p_after_id)
    order by position, item_id
    limit p_limit + 1
  ), page as materialized (
    select * from candidates order by position, item_id limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'itemId', page.item_id,
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
      'canEdit', page.can_edit,
      'canDelete', page.can_delete,
      'position', page.position,
      'updatedAt', page.updated_at
    ) order by page.position, page.item_id), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object('afterPosition', page.position, 'afterId', page.item_id)
      from page order by page.position desc, page.item_id desc limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;

  return jsonb_build_object(
    'space', 'trails',
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor,
    'capabilities', jsonb_build_object(
      'catalogManage', private.can_publish_catalog_v5(v_user_id),
      'catalogReview', private.can_review_catalog_v5(v_user_id)
    )
  );
end;
$function$;

revoke all on function public.list_trail_items_v1(integer, integer, text)
  from public, anon, service_role;
grant execute on function public.list_trail_items_v1(integer, integer, text)
  to authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260803010000',
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
      'situated-personal-comments-v1','educational-workspace-membership-v1',
      'educational-workspace-invitations-v1','workspace-capability-enforcement-v1',
      'workspace-member-course-access-v1','workspace-contextual-current-state-v1',
      'workspace-pedagogical-comments-v1','workspace-course-state-projection-v1',
      'non-punitive-study-state-v1','non-punitive-study-projections-v1',
      'workspace-comment-aggregates-v1','integrated-trails-v1',
      'plans-derived-from-current-content-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
