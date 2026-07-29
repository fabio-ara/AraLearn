begin;

select pg_advisory_xact_lock(hashtextextended('aralearn-workspace-artifact-gc-v4', 0));

create or replace function public.get_course_document_artifact_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_course public.courses%rowtype;
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  select * into v_course from public.courses course
  where course.id = p_course_id
    and course.deleted_at is null
    and course.document_storage_enabled
    and (
      course.owner_id is null
      or course.owner_id = p_owner_id
      or exists (
        select 1 from public.user_course_selections selection
        where selection.user_id = p_owner_id and selection.course_id = course.id
      )
    );
  if not found then
    raise exception 'Curso inacessível ou sem documento.' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'courseId', v_course.id,
    'contractKey', v_course.contract_key,
    'title', v_course.title,
    'goal', v_course.goal,
    'completionState', v_course.completion_state,
    'revisionHash', v_course.current_revision_hash,
    'artifact', jsonb_build_object(
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'artifactType', artifact.artifact_type,
      'mediaType', artifact.media_type,
      'sizeBytes', artifact.size_bytes
    )
  ) into v_result
  from private.artifact_refs artifact
  where artifact.hash = v_course.revision_artifact_hash;
  return v_result;
end;
$$;

create or replace function public.list_unreferenced_artifacts_v3(
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  perform private.require_service_role();
  if p_older_than is null
     or p_older_than < interval '1 hour'
     or p_limit is null
     or p_limit < 1
     or p_limit > 1000 then
    raise exception 'Parâmetros de limpeza inválidos.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'hash', artifact.hash,
      'bucket', artifact.bucket,
      'objectKey', artifact.object_key,
      'sizeBytes', artifact.size_bytes
    ) order by artifact.created_at)
    from (
      select ref.*
      from private.artifact_refs ref
      where ref.created_at < now() - p_older_than
        and not exists (
          select 1 from private.authoring_workspace_revisions revision
          where revision.artifact_hash = ref.hash
        )
        and not exists (
          select 1 from private.authoring_workspaces workspace
          where workspace.current_artifact_hash = ref.hash
        )
        and not exists (
          select 1 from private.course_revisions revision
          where revision.artifact_hash = ref.hash
        )
        and not exists (
          select 1 from public.courses course
          where course.revision_artifact_hash = ref.hash
        )
      order by ref.created_at
      limit p_limit
    ) artifact
  ), '[]'::jsonb);
end;
$$;

create or replace function public.claim_unreferenced_artifacts_v3(
  p_claim_token uuid,
  p_older_than interval default interval '7 days',
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_artifact private.artifact_refs%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform private.require_service_role();
  if p_claim_token is null then
    raise exception 'Token de coleta obrigatório.' using errcode = '22023';
  end if;
  if p_older_than is null or p_older_than < interval '1 hour' then
    raise exception 'Retenção de coleta inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('aralearn-artifact-gc-v3', 0));

  update private.artifact_gc_tombstones set
    claim_token = p_claim_token,
    claimed_at = now()
  where claimed_at < now() - interval '15 minutes';

  for v_artifact in
    select ref.*
    from private.artifact_refs ref
    where ref.created_at < now() - p_older_than
      and not exists (
        select 1 from private.authoring_workspace_revisions revision
        where revision.artifact_hash = ref.hash
      )
      and not exists (
        select 1 from private.authoring_workspaces workspace
        where workspace.current_artifact_hash = ref.hash
      )
      and not exists (
        select 1 from private.course_revisions revision
        where revision.artifact_hash = ref.hash
      )
      and not exists (
        select 1 from public.courses course
        where course.revision_artifact_hash = ref.hash
      )
    order by ref.created_at
    for update skip locked
    limit v_limit
  loop
    insert into private.artifact_gc_tombstones(
      hash, bucket, object_key, artifact_type, media_type, size_bytes, claim_token
    ) values (
      v_artifact.hash, v_artifact.bucket, v_artifact.object_key,
      v_artifact.artifact_type, v_artifact.media_type, v_artifact.size_bytes,
      p_claim_token
    ) on conflict(hash) do nothing;
    delete from private.artifact_refs where hash = v_artifact.hash;
  end loop;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'hash', tombstone.hash,
      'bucket', tombstone.bucket,
      'objectKey', tombstone.object_key,
      'sizeBytes', tombstone.size_bytes
    ) order by tombstone.claimed_at, tombstone.hash)
    from private.artifact_gc_tombstones tombstone
    where tombstone.claim_token = p_claim_token
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260729020000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog',
      'artifact-offline-replica',
      'granular-sync',
      'private-authoring',
      'text-language-metadata',
      'storage-artifact-control-plane',
      'immutable-course-revisions',
      'storage-only-course-content',
      'canonical-resource-registry',
      'atomic-resource-authoring',
      'structured-bottom-up-generation',
      'versioned-authoring-workspaces',
      'partial-private-publication',
      'microtheory-review-projection'
    )
  );
$function$;

commit;
