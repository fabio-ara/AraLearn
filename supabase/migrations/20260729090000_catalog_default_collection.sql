begin;

-- Toda publicação oficial precisa de uma coleção. O catálogo limpo também
-- precisa poder receber a primeira fixture sem reativar a API administrativa
-- removida no corte OAuth.
insert into public.catalog_collections(
  contract_key, title, description, position, is_published
)
select
  'outros',
  'Outros cursos',
  'Cursos oficiais ainda não associados a uma coleção temática.',
  coalesce(max(collection.position) + 1, 0),
  true
from public.catalog_collections collection
where not exists (
  select 1
  from public.catalog_collections existing
  where existing.contract_key = 'outros'
)
on conflict (contract_key) do nothing;

create or replace function public.resolve_catalog_artifact_publisher_v4(
  p_contract_key text,
  p_requested_owner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor_id uuid;
  v_course public.courses%rowtype;
  v_collection_id uuid;
begin
  perform private.require_service_role();
  if p_contract_key is null or btrim(p_contract_key) = '' then
    raise exception 'contractKey ausente.' using errcode = '22023';
  end if;

  if p_requested_owner_id is not null then
    select assignment.user_id into v_actor_id
    from private.app_role_assignments assignment
    where assignment.user_id = p_requested_owner_id
      and assignment.active
      and assignment.role in ('owner', 'catalog_publisher')
    order by case assignment.role when 'owner' then 0 else 1 end
    limit 1;
    if v_actor_id is null then
      raise exception 'Publicador solicitado não está ativo.' using errcode = '42501';
    end if;
  else
    select assignment.user_id into v_actor_id
    from private.app_role_assignments assignment
    where assignment.active
      and assignment.role in ('owner', 'catalog_publisher')
    order by case assignment.role when 'owner' then 0 else 1 end,
      assignment.granted_at, assignment.user_id
    limit 1;
  end if;
  if v_actor_id is null then
    raise exception 'Nenhum publicador do catálogo está ativo.' using errcode = '42501';
  end if;

  select * into v_course
  from public.courses course
  where course.owner_id is null
    and course.contract_key = p_contract_key
    and course.deleted_at is null
  order by course.updated_at desc, course.id
  limit 1;

  select placement.collection_id into v_collection_id
  from public.catalog_collection_courses placement
  where placement.course_id = v_course.id
    and placement.deleted_at is null
  order by placement.position, placement.id
  limit 1;

  if v_collection_id is null then
    select collection.id into v_collection_id
    from public.catalog_collections collection
    where collection.contract_key = 'outros'
      and collection.is_published
      and collection.deleted_at is null;
  end if;

  return jsonb_build_object(
    'actorId', v_actor_id,
    'courseId', v_course.id,
    'currentRevisionHash', v_course.current_revision_hash,
    'collectionId', v_collection_id
  );
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
    'schemaRevision', '20260729090000',
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
      'microtheory-review-projection',
      'workspace-cursor-pagination',
      'oauth-only-authoring-mcp',
      'default-catalog-collection'
    )
  );
$function$;

commit;
