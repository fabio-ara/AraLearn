begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-skip-unchanged-workspace-publication-v5',
  0
));

create or replace function public.reuse_unchanged_authoring_publication_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_workspace_course_id text,
  p_content_hash text,
  p_target text,
  p_completion_state text,
  p_existing_course_id uuid,
  p_expected_content_hash text,
  p_collection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_publication private.authoring_workspace_publications%rowtype;
  v_operation text;
  v_publication_seq bigint;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v5(
    p_owner_id,
    case when p_target = 'catalog' then 'catalog:publish'
      else 'authoring:write'
    end
  );
  if p_workspace_id is null
     or p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or nullif(btrim(p_workspace_course_id), '') is null
     or char_length(p_workspace_course_id) > 240
     or p_content_hash is null
     or p_content_hash !~ '^[0-9a-f]{64}$'
     or p_target is null
     or p_target not in ('private', 'catalog')
     or p_completion_state is null
     or p_completion_state not in ('partial', 'complete')
     or (p_target = 'catalog' and p_completion_state <> 'complete')
     or ((p_existing_course_id is null) <> (p_expected_content_hash is null))
     or (
       p_expected_content_hash is not null
       and p_expected_content_hash !~ '^[0-9a-f]{64}$'
     )
     or (p_target = 'private' and p_collection_id is not null)
     or (p_target = 'catalog' and p_collection_id is null) then
    raise exception 'Confirmação de publicação inalterada inválida.'
      using errcode = '22023';
  end if;

  v_operation := case
    when p_target = 'catalog' then 'publish_catalog_complete'
    when p_completion_state = 'partial' then 'publish_private_preview'
    else 'publish_private_complete'
  end;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-workspace-request-v5:' || p_owner_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(
    p_owner_id,
    p_request_id
  );
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_owner_id
    and request.request_id = p_request_id;
  if found then
    if v_request.payload_hash <> p_payload_hash
       or v_request.operation <> v_operation
       or v_request.workspace_id <> p_workspace_id then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null
  for share;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using errcode = '40001';
  end if;

  select * into v_publication
  from private.authoring_workspace_publications publication
  where publication.workspace_id = p_workspace_id
    and publication.workspace_course_id = p_workspace_course_id
    and publication.target = p_target
    and publication.content_hash = p_content_hash
  for share;
  if not found
     or (
       p_existing_course_id is not null
       and (
         p_existing_course_id <> v_publication.course_id
         or p_expected_content_hash <> v_publication.content_hash
       )
     ) then
    return null;
  end if;

  select course.publication_seq
  into v_publication_seq
  from public.courses course
  where course.id = v_publication.course_id
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
    and course.current_revision_hash = v_publication.content_hash
    and course.revision_artifact_hash = v_publication.content_hash
    and course.content_hash = v_publication.content_hash
    and course.completion_state = p_completion_state
    and (
      (p_target = 'private' and course.owner_id = p_owner_id)
      or (p_target = 'catalog' and course.owner_id is null)
    )
  for share;
  if not found then
    return null;
  end if;

  if p_target = 'private' then
    perform 1
    from public.user_course_selections selection
    where selection.user_id = p_owner_id
      and selection.course_id = v_publication.course_id
    for share;
  else
    perform 1
    from public.catalog_collection_courses item
    where item.collection_id = p_collection_id
      and item.course_id = v_publication.course_id
      and item.deleted_at is null
    for share;
  end if;
  if not found then
    return null;
  end if;

  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', p_expected_revision,
    'courseId', v_publication.course_id,
    'contentHash', v_publication.content_hash,
    'completionState', p_completion_state,
    'target', p_target,
    'submissionId', null,
    'publicationSeq', v_publication_seq,
    'unchanged', true,
    'idempotent', false
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values (
    p_owner_id, p_request_id, v_operation, p_payload_hash,
    p_workspace_id, v_result
  );
  return v_result;
end;
$function$;

revoke all on function
  public.reuse_unchanged_authoring_publication_v5(
    uuid, uuid, text, text, bigint, text, text, text, text,
    uuid, text, uuid
  )
  from public, anon, authenticated;
grant execute on function
  public.reuse_unchanged_authoring_publication_v5(
    uuid, uuid, text, text, bigint, text, text, text, text,
    uuid, text, uuid
  )
  to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260731160000',
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
      'structured-authoring-errors'
    )
  );
$function$;

commit;
