-- Faz a Central e as leituras do chat refletirem o papel contextual vigente.

begin;

do $rewrite_workspace_projections$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_signature := 'public.get_current_state_central_v1()'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_rewritten := replace(
    v_definition,
    'where workspace.owner_id = v_user_id',
    'where private.educational_workspace_can_v1(workspace.id, v_user_id, ''read'')'
  );
  if v_rewritten = v_definition then
    raise exception 'A Central não possui o predicado de proprietário esperado.'
      using errcode = '55000';
  end if;
  execute v_rewritten;

  v_signature := 'public.list_current_state_central_v1(text,integer,timestamptz,uuid,integer,uuid,text)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_rewritten := replace(
    v_definition,
    'where workspace.owner_id = v_user_id',
    'where private.educational_workspace_can_v1(workspace.id, v_user_id, ''read'')'
  );
  v_rewritten := replace(
    v_rewritten,
    '''title'', page.title,
        ''publicationCount''',
    '''title'', page.title,
        ''workspaceKind'', page.workspace_kind,
        ''role'', private.educational_workspace_role_v1(page.id, v_user_id),
        ''purpose'', page.purpose,
        ''publicationCount'''
  );
  if v_rewritten = v_definition
     or v_rewritten not like '%''workspaceKind''%'
     or v_rewritten not like '%educational_workspace_role_v1%' then
    raise exception 'Não foi possível projetar os papéis na Central.'
      using errcode = '55000';
  end if;
  execute v_rewritten;

  v_signature := 'public.get_authoring_workspace_v5(uuid,uuid,text[],boolean)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_rewritten := replace(
    v_definition,
    '''brief'', v_workspace.brief,',
    '''brief'', v_workspace.brief,
    ''purpose'', v_workspace.purpose,
    ''workspaceKind'', v_workspace.workspace_kind,
    ''visibility'', v_workspace.visibility,
    ''role'', private.educational_workspace_role_v1(v_workspace.id, p_owner_id),
    ''capabilities'', jsonb_build_object(
      ''author'', private.educational_workspace_can_v1(v_workspace.id, p_owner_id, ''author''),
      ''review'', private.educational_workspace_can_v1(v_workspace.id, p_owner_id, ''review''),
      ''comment'', private.educational_workspace_can_v1(v_workspace.id, p_owner_id, ''comment''),
      ''publish'', private.educational_workspace_can_v1(v_workspace.id, p_owner_id, ''publish''),
      ''manage'', private.educational_workspace_can_v1(v_workspace.id, p_owner_id, ''manage'')
    ),'
  );
  if v_rewritten = v_definition then
    raise exception 'Leitura do workspace não possui o brief esperado.'
      using errcode = '55000';
  end if;
  execute v_rewritten;

  v_signature := 'public.list_authoring_workspaces_v5(uuid,integer,timestamptz,uuid)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_rewritten := replace(
    v_definition,
    $list_marker$'title', page.title,$list_marker$,
    $list_projection$'title', page.title,
      'purpose', page.purpose,
      'workspaceKind', page.workspace_kind,
      'visibility', page.visibility,
      'role', private.educational_workspace_role_v1(page.id, p_owner_id),$list_projection$
  );
  if v_rewritten = v_definition then
    raise exception 'Lista de workspaces não possui o título esperado.'
      using errcode = '55000';
  end if;
  execute v_rewritten;
end;
$rewrite_workspace_projections$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260801220000',
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
      'workspace-contextual-current-state-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
