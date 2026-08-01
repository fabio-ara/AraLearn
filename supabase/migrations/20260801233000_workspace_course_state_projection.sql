-- Projeta a composição corrente do workspace sem copiar cursos, planos ou
-- publicações. O detalhe continua limitado e deriva somente das partes atuais.

begin;

create or replace function private.educational_workspace_details_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, auth
as $function$
declare
  v_workspace private.authoring_workspaces%rowtype;
  v_role text;
  v_can_manage boolean;
begin
  v_role := private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  v_can_manage := private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, 'manage'
  );
  select * into strict v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'title', v_workspace.title,
    'purpose', v_workspace.purpose,
    'kind', v_workspace.workspace_kind,
    'visibility', v_workspace.visibility,
    'role', v_role,
    'capabilities', jsonb_build_object(
      'read', true,
      'author', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'author'),
      'review', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'review'),
      'comment', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'comment'),
      'publish', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'publish'),
      'manage', v_can_manage,
      'transfer', private.educational_workspace_can_v1(v_workspace.id, p_actor_id, 'transfer')
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', member.user_id,
        'email', case when v_can_manage or member.user_id = p_actor_id
          then account.email else null end,
        'role', member.role,
        'primaryOwner', member.user_id = v_workspace.owner_id,
        'joinedAt', member.joined_at
      ) order by
        case member.role
          when 'owner' then 0 when 'admin' then 1 when 'author' then 2
          when 'reviewer' then 3 when 'learner' then 4 else 5 end,
        lower(coalesce(account.email, member.user_id::text))
      )
      from private.educational_workspace_members member
      join auth.users account on account.id = member.user_id
      where member.workspace_id = v_workspace.id
    ), '[]'::jsonb),
    'invitations', case when v_can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'invitationId', invitation.id,
        'email', invitation.email,
        'role', invitation.role,
        'expiresAt', invitation.expires_at
      ) order by invitation.created_at desc, invitation.id)
      from private.educational_workspace_invitations invitation
      where invitation.workspace_id = v_workspace.id
        and invitation.expires_at > now()
    ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'courseKey', course_state.course_key,
        'title', course_state.title,
        'goal', course_state.goal,
        'position', course_state.position,
        'moduleCount', course_state.module_count,
        'lessonCount', course_state.lesson_count,
        'microsequenceCount', course_state.microsequence_count,
        'readyMicrosequenceCount', course_state.ready_microsequence_count,
        'cardCount', course_state.card_count,
        'publicationTargets', coalesce((
          select jsonb_agg(targets.target order by targets.target)
          from (
            select distinct publication.target
            from private.authoring_workspace_publications publication
            where publication.workspace_id = v_workspace.id
              and publication.workspace_course_id = course_state.course_key
          ) targets
        ), '[]'::jsonb),
        'updatedAt', course_state.updated_at
      ) order by course_state.position, course_state.course_key)
      from (
        select
          course.entity_id as course_key,
          coalesce(nullif(btrim(course.content->>'title'), ''), course.entity_id) as title,
          coalesce(course.content->>'goal', '') as goal,
          course.position,
          count(distinct module_value.entity_id)::integer as module_count,
          count(distinct lesson.entity_id)::integer as lesson_count,
          count(distinct microsequence.entity_id)::integer as microsequence_count,
          count(distinct microsequence.entity_id) filter (
            where microsequence.content->>'status' = 'ready'
          )::integer as ready_microsequence_count,
          count(distinct card.entity_id)::integer as card_count,
          course.updated_at
        from private.authoring_workspace_entities course
        left join private.authoring_workspace_entities module_value
          on module_value.workspace_id = course.workspace_id
         and module_value.entity_type = 'module'
         and module_value.parent_type = 'course'
         and module_value.parent_id = course.entity_id
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
        where course.workspace_id = v_workspace.id
          and course.entity_type = 'course'
        group by course.entity_id, course.content, course.position, course.updated_at
        order by course.position, course.entity_id
        limit 50
      ) course_state
    ), '[]'::jsonb),
    'courseCount', (
      select count(*)
      from private.authoring_workspace_entities entity
      where entity.workspace_id = v_workspace.id and entity.entity_type = 'course'
    ),
    'publicationCount', (
      select count(*)
      from private.authoring_workspace_publications publication
      where publication.workspace_id = v_workspace.id
    ),
    'updatedAt', v_workspace.updated_at
  );
end;
$function$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260801233000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog', 'artifact-offline-replica', 'granular-sync',
      'private-authoring', 'text-language-metadata',
      'storage-artifact-control-plane', 'pre-registered-publication-artifacts',
      'single-current-course-revision', 'storage-only-course-content',
      'canonical-resource-registry', 'atomic-resource-authoring',
      'atomic-card-assistance', 'composed-authoring-workspaces',
      'workspace-publication-bindings', 'unchanged-publication-short-circuit',
      'bounded-authoring-events', 'partial-private-publication',
      'microtheory-review-projection', 'workspace-cursor-pagination',
      'workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination',
      'global-catalog-course-search', 'catalog-review-submissions',
      'catalog-management', 'personal-library-course-removal',
      'course-revision-sync-compaction', 'automatic-sync-history-maintenance',
      'compact-authoring-brief', 'account-derived-authoring-capabilities',
      'oauth-only-authoring-mcp', 'default-catalog-collection',
      'confidential-gpt-action-oauth', 'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking', 'gpt-action-oauth-stable-callback',
      'workspace-card-metadata', 'structured-authoring-errors',
      'current-state-central-v1', 'situated-personal-comments-v1',
      'educational-workspace-membership-v1',
      'educational-workspace-invitations-v1',
      'workspace-capability-enforcement-v1',
      'workspace-member-course-access-v1',
      'workspace-contextual-current-state-v1',
      'workspace-pedagogical-comments-v1',
      'workspace-course-state-projection-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
