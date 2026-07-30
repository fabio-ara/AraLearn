begin;

create or replace function public.aralearn_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_claims jsonb := event->'claims';
  v_issuer text := v_claims->>'iss';
  v_resource text;
begin
  if jsonb_typeof(v_claims) <> 'object' then
    raise exception 'Claims ausentes no hook de access token.'
      using errcode = '22023';
  end if;

  -- Sessões normais do aplicativo permanecem inalteradas. Somente tokens
  -- emitidos pelo OAuth Server têm client_id e são destinados ao MCP.
  if nullif(btrim(v_claims->>'client_id'), '') is not null then
    if v_issuer !~ '^https?://[^/]+/auth/v1$' then
      raise exception 'Issuer OAuth inválido para o MCP.'
        using errcode = '22023';
    end if;
    v_resource := regexp_replace(
      v_issuer,
      '/auth/v1$',
      '/functions/v1/aralearn-authoring-mcp'
    );
    v_claims := jsonb_set(v_claims, '{aud}', to_jsonb(v_resource), true);
  end if;

  return jsonb_set(event, '{claims}', v_claims, true);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.aralearn_mcp_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.aralearn_mcp_access_token_hook(jsonb)
  from authenticated, anon, public;

-- O corte v4 remove os últimos nomes públicos herdados do plano de controle
-- anterior. Não são mantidos aliases: Edge Functions e scripts usam somente
-- os nomes abaixo depois desta migration.
alter function public.resolve_catalog_artifact_publisher_v3(text, uuid)
  rename to resolve_catalog_artifact_publisher_v4;
alter function public.get_course_revision_artifact_v3(uuid, uuid, text)
  rename to get_course_revision_artifact_v4;
alter function public.list_unreferenced_artifacts_v3(interval, integer)
  rename to list_unreferenced_artifacts_v4;
alter function public.claim_unreferenced_artifacts_v3(uuid, interval, integer)
  rename to claim_unreferenced_artifacts_v4;
alter function public.complete_artifact_gc_v3(uuid, text, boolean)
  rename to complete_artifact_gc_v4;

revoke all on function public.resolve_catalog_artifact_publisher_v4(text, uuid)
  from public, anon, authenticated;
revoke all on function public.get_course_revision_artifact_v4(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.list_unreferenced_artifacts_v4(interval, integer)
  from public, anon, authenticated;
revoke all on function public.claim_unreferenced_artifacts_v4(uuid, interval, integer)
  from public, anon, authenticated;
revoke all on function public.complete_artifact_gc_v4(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.resolve_catalog_artifact_publisher_v4(text, uuid)
  to service_role;
grant execute on function public.get_course_revision_artifact_v4(uuid, uuid, text)
  to service_role;
grant execute on function public.list_unreferenced_artifacts_v4(interval, integer)
  to service_role;
grant execute on function public.claim_unreferenced_artifacts_v4(uuid, interval, integer)
  to service_role;
grant execute on function public.complete_artifact_gc_v4(uuid, text, boolean)
  to service_role;

alter function public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) rename to publish_authoring_workspace_course_v4_impl;

create function public.publish_authoring_workspace_course_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_target text,
  p_completion_state text,
  p_publication_mode text,
  p_existing_course_id uuid,
  p_expected_content_hash text,
  p_collection_id uuid,
  p_metadata jsonb,
  p_artifact jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_target = 'catalog' then
    if p_collection_id is null then
      raise exception 'A publicação oficial exige uma coleção.'
        using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.catalog_collections collection
      where collection.id = p_collection_id
        and collection.is_published
        and collection.deleted_at is null
    ) then
      raise exception 'Coleção de catálogo inexistente ou indisponível.'
        using errcode = 'AR422';
    end if;
  elsif p_collection_id is not null then
    raise exception 'A publicação privada não recebe coleção.'
      using errcode = '22023';
  end if;

  return public.publish_authoring_workspace_course_v4_impl(
    p_owner_id,
    p_client_id,
    p_workspace_id,
    p_request_id,
    p_payload_hash,
    p_expected_revision,
    p_target,
    p_completion_state,
    p_publication_mode,
    p_existing_course_id,
    p_expected_content_hash,
    p_collection_id,
    p_metadata,
    p_artifact
  );
end;
$$;

revoke all on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.publish_authoring_workspace_course_v4(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) to service_role;

revoke all on function public.publish_authoring_workspace_course_v4_impl(
  uuid,uuid,uuid,text,text,bigint,text,text,text,uuid,text,uuid,jsonb,jsonb
) from public, anon, authenticated;

create function public.list_authoring_catalog_collections_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id uuid default null,
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
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  if p_limit is null or p_limit < 1 or p_limit > 100
     or (p_after_position is null) <> (p_after_id is null)
     or (p_after_position is not null and p_after_position < 0)
     or char_length(v_query) > 200 then
    raise exception 'Paginação do catálogo inválida.'
      using errcode = '22023';
  end if;

  with candidates as materialized (
    select
      collection.id,
      collection.contract_key,
      collection.title,
      collection.description,
      collection.position,
      collection.revision,
      collection.created_at,
      collection.updated_at,
      (
        select count(*)
        from public.catalog_collection_courses item
        join public.courses course
          on course.id = item.course_id
         and course.owner_id is null
         and course.status = 'published'
         and course.deleted_at is null
         and course.document_storage_enabled
        where item.collection_id = collection.id
          and item.deleted_at is null
      ) as course_count
    from public.catalog_collections collection
    where collection.is_published
      and collection.deleted_at is null
      and (
        v_query = ''
        or collection.title ilike '%' || v_query || '%'
        or collection.description ilike '%' || v_query || '%'
        or collection.contract_key ilike '%' || v_query || '%'
        or exists (
          select 1
          from public.catalog_collection_courses item
          join public.courses course
            on course.id = item.course_id
           and course.owner_id is null
           and course.status = 'published'
           and course.deleted_at is null
           and course.document_storage_enabled
          where item.collection_id = collection.id
            and item.deleted_at is null
            and (
              course.title ilike '%' || v_query || '%'
              or course.goal ilike '%' || v_query || '%'
              or course.contract_key ilike '%' || v_query || '%'
            )
        )
      )
      and (
        p_after_position is null
        or (collection.position, collection.id) > (p_after_position, p_after_id)
      )
    order by collection.position, collection.id
    limit p_limit + 1
  ),
  page as (
    select * from candidates
    order by position, id
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'collectionId', page.id,
        'contractKey', page.contract_key,
        'title', page.title,
        'description', page.description,
        'position', page.position,
        'status', 'active',
        'revision', page.revision,
        'courseCount', page.course_count,
        'createdAt', page.created_at,
        'updatedAt', page.updated_at
      ) order by page.position, page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterPosition', page.position,
        'afterId', page.id
      )
      from page
      order by page.position desc, page.id desc
      limit 1
    ) else null end
  )
  into v_result;
  return v_result;
end;
$$;

create function public.list_authoring_catalog_courses_v4(
  p_owner_id uuid,
  p_client_id uuid,
  p_collection_id uuid,
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id uuid default null,
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
  v_result jsonb;
begin
  perform private.require_workspace_actor_v4(
    p_owner_id, p_client_id, 'authoring:read'
  );
  if p_collection_id is null
     or p_limit is null or p_limit < 1 or p_limit > 100
     or (p_after_position is null) <> (p_after_id is null)
     or (p_after_position is not null and p_after_position < 0)
     or char_length(v_query) > 200 then
    raise exception 'Paginação de cursos inválida.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.catalog_collections collection
    where collection.id = p_collection_id
      and collection.is_published
      and collection.deleted_at is null
  ) then
    raise exception 'Coleção de catálogo inexistente ou indisponível.'
      using errcode = 'P0002';
  end if;

  with candidates as materialized (
    select
      item.id as placement_id,
      item.position,
      item.revision as placement_revision,
      course.id,
      course.contract_key,
      course.title,
      course.goal,
      course.publication_seq,
      course.content_hash,
      course.catalog_revision,
      course.updated_at,
      course.module_count,
      course.lesson_count
    from public.catalog_collection_courses item
    join public.courses course
      on course.id = item.course_id
     and course.owner_id is null
     and course.status = 'published'
     and course.deleted_at is null
     and course.document_storage_enabled
    where item.collection_id = p_collection_id
      and item.deleted_at is null
      and (
        v_query = ''
        or course.title ilike '%' || v_query || '%'
        or course.goal ilike '%' || v_query || '%'
        or course.contract_key ilike '%' || v_query || '%'
      )
      and (
        p_after_position is null
        or (item.position, course.id) > (p_after_position, p_after_id)
      )
    order by item.position, course.id
    limit p_limit + 1
  ),
  page as (
    select * from candidates
    order by position, id
    limit p_limit
  )
  select jsonb_build_object(
    'collectionId', p_collection_id,
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'placementId', page.placement_id,
        'placementRevision', page.placement_revision,
        'position', page.position,
        'courseId', page.id,
        'contractKey', page.contract_key,
        'title', page.title,
        'goal', page.goal,
        'publicationSeq', page.publication_seq,
        'contentHash', page.content_hash,
        'revision', page.catalog_revision,
        'moduleCount', page.module_count,
        'lessonCount', page.lesson_count,
        'updatedAt', page.updated_at
      ) order by page.position, page.id)
      from page
    ), '[]'::jsonb),
    'nextCursor',
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'afterPosition', page.position,
        'afterId', page.id
      )
      from page
      order by page.position desc, page.id desc
      limit 1
    ) else null end
  )
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.list_authoring_catalog_collections_v4(
  uuid,uuid,integer,integer,uuid,text
) from public, anon, authenticated;
revoke all on function public.list_authoring_catalog_courses_v4(
  uuid,uuid,uuid,integer,integer,uuid,text
) from public, anon, authenticated;
grant execute on function public.list_authoring_catalog_collections_v4(
  uuid,uuid,integer,integer,uuid,text
) to service_role;
grant execute on function public.list_authoring_catalog_courses_v4(
  uuid,uuid,uuid,integer,integer,uuid,text
) to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260729050000',
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
      'atomic-card-assistance',
      'versioned-authoring-workspaces',
      'partial-private-publication',
      'microtheory-review-projection'
    )
  );
$function$;

commit;
