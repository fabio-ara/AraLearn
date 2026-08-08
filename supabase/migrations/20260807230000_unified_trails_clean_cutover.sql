-- Corte físico do estado pessoal anterior. O backfill para
-- trail_personal_states já ocorreu em 20260807220000; a partir daqui somente
-- courseSelections permanece no feed relacional, e grupos usam
-- study_paths/study_path_items pelas RPCs atômicas de Trilhas.

begin;

drop function if exists public.list_user_course_summaries();
drop function if exists private.current_study_state_at(uuid);
drop function if exists public.list_personal_library_courses(
  uuid, integer, integer, uuid, text
);
drop function if exists public.list_current_state_central_v1(
  text, integer, timestamptz, uuid, integer, uuid, text
);

drop function if exists public.apply_study_path_mutation(uuid, jsonb);
drop function if exists public.list_personal_study_paths(
  uuid, uuid, integer, integer, uuid
);
drop function if exists public.create_personal_study_path(
  uuid, uuid, text, text
);
drop function if exists public.rename_personal_study_path(
  uuid, uuid, text, uuid, text
);
drop function if exists public.delete_personal_study_path(
  uuid, uuid, text, uuid
);

drop trigger if exists lesson_progress_sync on public.lesson_progress;
drop trigger if exists card_progress_sync on public.card_progress;
drop trigger if exists card_comments_sync on public.card_comments;
drop trigger if exists card_comments_infer_workspace_v2 on public.card_comments;
drop function if exists private.infer_situated_comment_workspace_v2();

-- As tabelas antigas não participam mais de membership nem das observações
-- autorais correntes (private.authoring_workspace_observations).
drop table if exists public.lesson_progress;
drop table if exists public.card_progress;
drop table if exists public.card_comments;

delete from private.sync_changes
where entity_type in (
  'lessonProgress', 'cardProgress', 'comments',
  'studyPaths', 'studyPathCourses'
);

-- Esta operação segue necessária para apagar workspaces e observações autorais;
-- somente a limpeza da tabela pessoal retirada desaparece.
create or replace function private.discard_authoring_workspace_v1(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_trail_item_id uuid;
  v_user_id uuid;
begin
  -- A autoridade pessoal precisa ser encerrada enquanto a raiz e os membros
  -- ainda podem ser relacionados. Uma seleção alias independente preserva o
  -- estado; apenas o acesso que vinha deste workspace é descartado.
  for v_trail_item_id in
    select item.id from private.trail_items item
    where item.workspace_id = p_workspace_id
    order by item.id
  loop
    for v_user_id in
      select member.user_id
      from private.educational_workspace_members member
      where member.workspace_id = p_workspace_id
      union
      select workspace.owner_id
      from private.authoring_workspaces workspace
      where workspace.id = p_workspace_id
    loop
      perform private.cleanup_trail_personal_access_v1(
        v_user_id, v_trail_item_id, p_workspace_id
      );
    end loop;
  end loop;

  update private.catalog_review_submissions submission
  set review_workspace_id = null, updated_at = now()
  where submission.review_workspace_id = p_workspace_id;

  delete from private.authoring_workspace_observations observation
  where observation.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_observation_receipts receipt
  where receipt.result->>'workspaceId' = p_workspace_id::text;
  delete from private.educational_workspace_receipts receipt
  where receipt.result->>'workspaceId' = p_workspace_id::text;

  delete from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_publications publication
  where publication.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id;
  delete from private.educational_workspace_invitations invitation
  where invitation.workspace_id = p_workspace_id;
  delete from private.educational_workspace_members member
  where member.workspace_id = p_workspace_id;
  delete from private.authoring_workspace_requests request
  where request.workspace_id = p_workspace_id;
  delete from private.authoring_course_workspace_reservations reservation
  where reservation.workspace_id = p_workspace_id;

  update private.authoring_workspaces workspace
  set brief = '',
      purpose = '',
      source_course_id = null,
      source_revision_hash = null,
      source_submission_id = null,
      deleted_at = coalesce(workspace.deleted_at, now()),
      updated_at = now()
  where workspace.id = p_workspace_id;
end;
$function$;

revoke all on function private.discard_authoring_workspace_v1(uuid)
  from public, anon, authenticated, service_role;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_clean_trails_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with base as (
    select public.get_aralearn_runtime_manifest_without_clean_trails_v1() as value
  )
  select jsonb_set(
    jsonb_set(base.value, '{schemaRevision}', '"20260807230000"'::jsonb),
    '{features}',
    (base.value->'features') || jsonb_build_array(
      'unified-trails-clean-cutover-v1'
    )
  ) from base
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_without_clean_trails_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
