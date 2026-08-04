-- Observações correntes referenciam partes do workspace sem copiar conteúdo.

begin;

create table private.authoring_workspace_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references private.authoring_workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_path text[] not null default '{}',
  resource_target_id text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authoring_workspace_observations_entity_type check (
    entity_type in ('workspace', 'course', 'module', 'lesson', 'microsequence', 'card', 'resource')
  ),
  constraint authoring_workspace_observations_path check (
    cardinality(entity_path) = case entity_type
      when 'workspace' then 0
      when 'course' then 1
      when 'module' then 2
      when 'lesson' then 3
      when 'microsequence' then 4
      else 5
    end
  ),
  constraint authoring_workspace_observations_resource check (
    (entity_type = 'resource' and resource_target_id is not null)
    or (entity_type <> 'resource' and resource_target_id is null)
  ),
  constraint authoring_workspace_observations_body check (
    btrim(body) <> '' and char_length(body) <= 2000
  )
);

create index authoring_workspace_observations_current_idx
  on private.authoring_workspace_observations(workspace_id, updated_at desc, id);

create table private.authoring_workspace_observation_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id, request_id),
  constraint authoring_workspace_observation_receipts_request check (
    request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  constraint authoring_workspace_observation_receipts_hash check (
    request_hash ~ '^[a-f0-9]{64}$'
  )
);

create function private.list_authoring_workspace_observations_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_items jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  select coalesce(jsonb_agg(jsonb_build_object(
    'observationId', observation.id,
    'workspaceId', observation.workspace_id,
    'entityType', observation.entity_type,
    'entityPath', to_jsonb(observation.entity_path),
    'resourceTargetId', observation.resource_target_id,
    'body', observation.body,
    'authorId', observation.author_id,
    'canDelete', observation.author_id = p_actor_id
      or private.educational_workspace_can_v1(p_workspace_id, p_actor_id, 'review'),
    'createdAt', observation.created_at,
    'updatedAt', observation.updated_at
  ) order by observation.updated_at desc, observation.id), '[]'::jsonb)
  into v_items
  from private.authoring_workspace_observations observation
  where observation.workspace_id = p_workspace_id;
  return jsonb_build_object('items', v_items);
end;
$function$;

create function private.manage_authoring_workspace_observation_v1(
  p_actor_id uuid,
  p_request_id text,
  p_workspace_id uuid,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_hash text;
  v_receipt private.authoring_workspace_observation_receipts%rowtype;
  v_observation private.authoring_workspace_observations%rowtype;
  v_entity_type text;
  v_entity_path text[];
  v_resource_target_id text;
  v_result jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, case when p_operation = 'create' then 'comment' else 'read' end
  );
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in ('create', 'delete')
     or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Operação de observação inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'workspaceId', p_workspace_id,
      'operation', p_operation,
      'payload', p_payload
    )::text, 'UTF8'), 'sha256'
  ), 'hex');
  select * into v_receipt
  from private.authoring_workspace_observation_receipts
  where actor_id = p_actor_id and request_id = p_request_id;
  if found then
    if v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com outra intenção.' using errcode = '23514';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  if p_operation = 'create' then
    if exists(select 1 from jsonb_object_keys(p_payload) field where field not in (
      'entityType', 'entityPath', 'resourceTargetId', 'body'
    )) then
      raise exception 'Observação contém campo desconhecido.' using errcode = '22023';
    end if;
    v_entity_type := btrim(coalesce(p_payload->>'entityType', ''));
    select coalesce(array_agg(value), '{}') into v_entity_path
    from jsonb_array_elements_text(coalesce(p_payload->'entityPath', '[]'::jsonb)) value;
    v_resource_target_id := nullif(btrim(coalesce(p_payload->>'resourceTargetId', '')), '');
    if v_entity_type not in ('workspace', 'course', 'module', 'lesson', 'microsequence', 'card', 'resource')
       or cardinality(v_entity_path) <> (case v_entity_type
         when 'workspace' then 0
         when 'course' then 1
         when 'module' then 2
         when 'lesson' then 3
         when 'microsequence' then 4
         else 5
       end)
       or exists(select 1 from unnest(v_entity_path) part where btrim(part) = '' or char_length(part) > 240)
       or ((v_entity_type = 'resource') <> (v_resource_target_id is not null))
       or btrim(coalesce(p_payload->>'body', '')) = ''
       or char_length(p_payload->>'body') > 2000 then
      raise exception 'Observação inválida.' using errcode = '22023';
    end if;
    if v_entity_type <> 'workspace' and exists (
      select 1
      from generate_series(1, cardinality(v_entity_path)) depth
      where not exists (
        select 1
        from private.authoring_workspace_entities entity
        where entity.workspace_id = p_workspace_id
          and entity.entity_type = (array['course', 'module', 'lesson', 'microsequence', 'card'])[depth]
          and entity.entity_id = v_entity_path[depth]
          and (
            (depth = 1 and entity.parent_type is null and entity.parent_id is null)
            or (depth > 1
              and entity.parent_type = (array['course', 'module', 'lesson', 'microsequence', 'card'])[depth - 1]
              and entity.parent_id = v_entity_path[depth - 1])
          )
      )
    ) then
      raise exception 'Alvo da observação não encontrado.' using errcode = 'P0002';
    end if;
    insert into private.authoring_workspace_observations(
      workspace_id, author_id, entity_type, entity_path, resource_target_id, body
    ) values(
      p_workspace_id, p_actor_id, v_entity_type, v_entity_path,
      v_resource_target_id, btrim(p_payload->>'body')
    ) returning * into v_observation;
    v_result := jsonb_build_object(
      'operation', 'create', 'observationId', v_observation.id,
      'workspaceId', p_workspace_id, 'updatedAt', v_observation.updated_at,
      'idempotent', false
    );
  else
    select * into v_observation
    from private.authoring_workspace_observations observation
    where observation.id = (p_payload->>'observationId')::uuid
      and observation.workspace_id = p_workspace_id
    for update;
    if not found then
      raise exception 'Observação não encontrada.' using errcode = 'P0002';
    end if;
    if v_observation.author_id <> p_actor_id
       and not private.educational_workspace_can_v1(p_workspace_id, p_actor_id, 'review') then
      raise exception 'Sem permissão para excluir esta observação.' using errcode = '42501';
    end if;
    delete from private.authoring_workspace_observations where id = v_observation.id;
    v_result := jsonb_build_object(
      'operation', 'delete', 'observationId', v_observation.id,
      'workspaceId', p_workspace_id, 'updatedAt', now(), 'idempotent', false
    );
  end if;
  insert into private.authoring_workspace_observation_receipts(
    actor_id, request_id, request_hash, result
  ) values(p_actor_id, p_request_id, v_hash, v_result);
  return v_result;
end;
$function$;

create function public.list_authoring_workspace_observations_for_actor_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select private.list_authoring_workspace_observations_v1(p_actor_id, p_workspace_id);
$function$;

create function public.manage_authoring_workspace_observation_for_actor_v1(
  p_actor_id uuid,
  p_request_id text,
  p_workspace_id uuid,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as $function$
  select private.manage_authoring_workspace_observation_v1(
    p_actor_id, p_request_id, p_workspace_id, p_operation, p_payload
  );
$function$;

revoke all on function public.list_authoring_workspace_observations_for_actor_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.manage_authoring_workspace_observation_for_actor_v1(uuid, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.list_authoring_workspace_observations_for_actor_v1(uuid, uuid)
  to service_role;
grant execute on function public.manage_authoring_workspace_observation_for_actor_v1(uuid, text, uuid, text, jsonb)
  to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260803020000',
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
      'plans-derived-from-current-content-v1','workspace-entity-observations-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
