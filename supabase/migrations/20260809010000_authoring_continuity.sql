-- Continuidade autoral corrente: partes, decisões, mandato e achados compactos.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-authoring-continuity-v1',
  0
));

create function private.valid_authoring_continuity_v1(p_state jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_part jsonb;
  v_decision jsonb;
  v_mandate jsonb;
begin
  if p_state is null
     or jsonb_typeof(p_state) <> 'object'
     or not (p_state ?& array['version', 'parts', 'decisions', 'mandate'])
     or exists (
       select 1 from jsonb_object_keys(p_state) field_name
       where field_name not in ('version', 'parts', 'decisions', 'mandate')
     )
     or jsonb_typeof(p_state->'version') <> 'number'
     or p_state->>'version' <> '1'
     or jsonb_typeof(p_state->'parts') <> 'array'
     or jsonb_typeof(p_state->'decisions') <> 'array'
     or jsonb_array_length(p_state->'parts') > 64
     or jsonb_array_length(p_state->'decisions') > 128
     or octet_length(p_state::text) > 65536
     or pg_column_size(p_state) > 98304 then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_state->'parts') part
    group by part->>'id'
    having count(*) > 1
  ) then
    return false;
  end if;

  for v_part in select value from jsonb_array_elements(p_state->'parts')
  loop
    if jsonb_typeof(v_part) <> 'object'
       or not (v_part ?& array['id', 'title', 'microsequenceIds'])
       or exists (
         select 1 from jsonb_object_keys(v_part) field_name
         where field_name not in ('id', 'title', 'microsequenceIds')
       )
       or nullif(btrim(v_part->>'id'), '') is null
       or v_part->>'id' <> btrim(v_part->>'id')
       or char_length(v_part->>'id') > 240
       or nullif(btrim(v_part->>'title'), '') is null
       or char_length(v_part->>'title') > 300
       or jsonb_typeof(v_part->'microsequenceIds') <> 'array'
       or jsonb_array_length(v_part->'microsequenceIds') < 1
       or jsonb_array_length(v_part->'microsequenceIds') > 500
       or exists (
         select 1
         from jsonb_array_elements(v_part->'microsequenceIds') value
         where jsonb_typeof(value) <> 'string'
           or nullif(btrim(value #>> '{}'), '') is null
           or value #>> '{}' <> btrim(value #>> '{}')
           or char_length(value #>> '{}') > 240
       )
       or exists (
         select 1
         from jsonb_array_elements_text(v_part->'microsequenceIds') value
         group by value
         having count(*) > 1
       ) then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_state->'parts') part
    cross join lateral jsonb_array_elements_text(part->'microsequenceIds') microsequence_id
    group by microsequence_id
    having count(*) > 1
  ) then
    return false;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_state->'decisions') decision
    group by decision->>'id'
    having count(*) > 1
  ) then
    return false;
  end if;

  for v_decision in select value from jsonb_array_elements(p_state->'decisions')
  loop
    if jsonb_typeof(v_decision) <> 'object'
       or not (v_decision ?& array['id', 'summary'])
       or exists (
         select 1 from jsonb_object_keys(v_decision) field_name
         where field_name not in ('id', 'summary', 'entityType', 'entityId')
       )
       or nullif(btrim(v_decision->>'id'), '') is null
       or v_decision->>'id' <> btrim(v_decision->>'id')
       or char_length(v_decision->>'id') > 240
       or nullif(btrim(v_decision->>'summary'), '') is null
       or char_length(v_decision->>'summary') > 1000
       or ((v_decision ? 'entityType') <> (v_decision ? 'entityId'))
       or (
         v_decision ? 'entityType'
         and (
           v_decision->>'entityType' not in (
             'course', 'module', 'lesson', 'microsequence', 'card'
           )
           or nullif(btrim(v_decision->>'entityId'), '') is null
           or v_decision->>'entityId' <> btrim(v_decision->>'entityId')
           or char_length(v_decision->>'entityId') > 240
         )
       ) then
      return false;
    end if;
  end loop;

  if p_state->'mandate' = 'null'::jsonb then
    return true;
  end if;
  v_mandate := p_state->'mandate';
  if jsonb_typeof(v_mandate) <> 'object'
     or not (v_mandate ?& array['id', 'kind', 'decidedAtRevision'])
     or exists (
       select 1 from jsonb_object_keys(v_mandate) field_name
       where field_name not in (
         'id', 'kind', 'targetPartId', 'findingIds', 'note',
         'decidedAtRevision'
       )
     )
     or nullif(btrim(v_mandate->>'id'), '') is null
     or v_mandate->>'id' <> btrim(v_mandate->>'id')
     or char_length(v_mandate->>'id') > 240
     or v_mandate->>'kind' not in (
       'build_part', 'repair_findings', 'audit', 'restructure'
     )
     or jsonb_typeof(v_mandate->'decidedAtRevision') <> 'number'
     or v_mandate->>'decidedAtRevision' !~ '^[1-9][0-9]{0,18}$'
     or (v_mandate->>'decidedAtRevision')::numeric > 9223372036854775807
     or (
       v_mandate ? 'targetPartId'
       and (
         nullif(btrim(v_mandate->>'targetPartId'), '') is null
         or v_mandate->>'targetPartId' <> btrim(v_mandate->>'targetPartId')
         or char_length(v_mandate->>'targetPartId') > 240
         or not exists (
           select 1 from jsonb_array_elements(p_state->'parts') part
           where part->>'id' = v_mandate->>'targetPartId'
         )
       )
     )
     or (
       v_mandate ? 'findingIds'
       and (
         jsonb_typeof(v_mandate->'findingIds') <> 'array'
         or jsonb_array_length(v_mandate->'findingIds') > 50
         or exists (
           select 1 from jsonb_array_elements(v_mandate->'findingIds') finding_id
           where jsonb_typeof(finding_id) <> 'string'
             or finding_id #>> '{}' !~
               '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
         )
         or exists (
           select 1
           from jsonb_array_elements_text(v_mandate->'findingIds') finding_id
           group by finding_id
           having count(*) > 1
         )
       )
     )
     or (
       v_mandate ? 'note'
       and (
         nullif(btrim(v_mandate->>'note'), '') is null
         or char_length(v_mandate->>'note') > 2000
       )
     )
     or (
       v_mandate->>'kind' = 'build_part'
       and not (v_mandate ? 'targetPartId')
     )
     or (
       v_mandate->>'kind' <> 'repair_findings'
       and v_mandate ? 'findingIds'
     )
     or (
       v_mandate->>'kind' = 'repair_findings'
       and (
         not (v_mandate ? 'findingIds')
         or jsonb_array_length(v_mandate->'findingIds') = 0
         or v_mandate ? 'targetPartId'
       )
     ) then
    return false;
  end if;
  return true;
exception
  when others then
    return false;
end;
$function$;

create function private.normalize_authoring_continuity_v1(
  p_state jsonb,
  p_previous jsonb,
  p_revision bigint
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_state jsonb := p_state;
  v_mandate jsonb;
  v_previous_mandate jsonb;
  v_decided_revision bigint := p_revision;
begin
  if jsonb_typeof(v_state) <> 'object'
     or v_state->'mandate' is null
     or v_state->'mandate' = 'null'::jsonb then
    return v_state;
  end if;
  v_mandate := v_state->'mandate';
  v_previous_mandate := p_previous->'mandate';
  if jsonb_typeof(v_previous_mandate) = 'object'
     and (v_previous_mandate - 'decidedAtRevision'::text) =
       (v_mandate - 'decidedAtRevision'::text)
     and v_previous_mandate->>'decidedAtRevision' ~ '^[1-9][0-9]{0,18}$' then
    v_decided_revision := (v_previous_mandate->>'decidedAtRevision')::bigint;
  end if;
  return jsonb_set(
    v_state,
    '{mandate}',
    (v_mandate - 'decidedAtRevision'::text) || jsonb_build_object(
      'decidedAtRevision', v_decided_revision
    ),
    true
  );
end;
$function$;

alter table private.authoring_workspaces
  add column authoring_state jsonb not null default
    '{"version":1,"parts":[],"decisions":[],"mandate":null}'::jsonb;

alter table private.authoring_workspaces
  add constraint authoring_workspaces_continuity_v1 check (
    private.valid_authoring_continuity_v1(authoring_state)
  );

-- A capacidade editorial global é dinâmica. Quando não há membership, a
-- projeção usa o papel público já existente `admin`; nunca cria uma tipologia.
create function private.educational_workspace_effective_role_v1(
  p_workspace_id uuid,
  p_actor_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select coalesce(
    private.educational_workspace_role_v1(p_workspace_id, p_actor_id),
    case when private.educational_workspace_can_v1(
      p_workspace_id, p_actor_id, 'manage'
    ) then 'admin' end
  )
$function$;

create or replace function private.require_educational_workspace_capability_v1(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_capability text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_role text;
begin
  if p_capability not in (
    'read', 'author', 'review', 'comment', 'publish', 'manage', 'transfer'
  ) then
    raise exception 'Capacidade do workspace inválida.' using errcode = '22023';
  end if;
  v_role := private.educational_workspace_effective_role_v1(
    p_workspace_id, p_actor_id
  );
  if private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, p_capability
  ) then
    return v_role;
  end if;
  if v_role is null then
    raise exception 'Workspace inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  raise exception 'Ação não permitida neste workspace.' using errcode = '42501';
end;
$function$;

-- As leituras compostas foram criadas antes do acesso editorial global e
-- projetavam o membership bruto. Recompila somente as projeções que ainda
-- existem no corte corrente; Trilhas já projeta capacidades, não um papel.
do $rewrite_effective_workspace_roles$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_signature := to_regprocedure(
    'public.get_authoring_workspace_v5(uuid,uuid,text[],boolean)'
  );
  if v_signature is not null then
    v_definition := pg_get_functiondef(v_signature);
    v_rewritten := replace(
      v_definition,
      'private.educational_workspace_role_v1(v_workspace.id, p_owner_id)',
      'private.educational_workspace_effective_role_v1(v_workspace.id, p_owner_id)'
    );
    if v_rewritten = v_definition
       and v_definition not like
         '%private.educational_workspace_effective_role_v1(v_workspace.id, p_owner_id)%'
    then
      raise exception 'Projeção de papel ausente na leitura do workspace.'
        using errcode = '55000';
    end if;
    execute v_rewritten;
  end if;

  v_signature := to_regprocedure(
    'public.list_authoring_workspaces_v5(uuid,integer,timestamptz,uuid)'
  );
  if v_signature is not null then
    v_definition := pg_get_functiondef(v_signature);
    v_rewritten := replace(
      v_definition,
      'private.educational_workspace_role_v1(page.id, p_owner_id)',
      'private.educational_workspace_effective_role_v1(page.id, p_owner_id)'
    );
    if v_rewritten = v_definition
       and v_definition not like
         '%private.educational_workspace_effective_role_v1(page.id, p_owner_id)%'
    then
      raise exception 'Projeção de papel ausente na lista de workspaces.'
        using errcode = '55000';
    end if;
    execute v_rewritten;
  end if;
end;
$rewrite_effective_workspace_roles$;

alter table private.authoring_workspace_observations
  add column kind text not null default 'note',
  add column category text,
  add column severity text,
  add column status text,
  add column proposed_repair text,
  add column audit_revision bigint,
  add column audit_part_id text,
  add column pending_correction_request_id text,
  add column pending_revision bigint,
  add column correction_request_id text,
  add column resulting_revision bigint,
  add column verification text,
  add column verified_revision bigint;

alter table private.trail_observation_threads
  add column correction_resulting_revision bigint,
  add constraint trail_observation_threads_correction_revision_v1 check (
    correction_resulting_revision is null or correction_resulting_revision > 1
  );

alter table private.authoring_workspace_observations
  add constraint authoring_workspace_observations_lifecycle_v1 check (
    (
      kind = 'note'
      and category is null
      and severity is null
      and status is null
      and proposed_repair is null
      and audit_revision is null
      and audit_part_id is null
      and pending_correction_request_id is null
      and pending_revision is null
      and correction_request_id is null
      and resulting_revision is null
      and verification is null
      and verified_revision is null
    )
    or (
      kind = 'audit_finding'
      and category is not null
      and btrim(category) <> ''
      and category = btrim(category)
      and char_length(category) <= 64
      and severity in ('low', 'medium', 'high', 'critical')
      and status in ('open', 'approved', 'rejected', 'repaired', 'resolved')
      and char_length(body) <= 1000
      and proposed_repair is not null
      and btrim(proposed_repair) <> ''
      and char_length(proposed_repair) <= 1000
      and audit_revision > 0
      and (
        audit_part_id is null
        or (
          nullif(btrim(audit_part_id), '') is not null
          and audit_part_id = btrim(audit_part_id)
          and char_length(audit_part_id) <= 240
        )
      )
      and (
        pending_correction_request_id is null
        or pending_correction_request_id ~
          '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      )
      and (pending_revision is null or pending_revision > audit_revision)
      and (
        (pending_correction_request_id is null and pending_revision is null)
        or (
          status = 'approved'
          and
          pending_correction_request_id is not null
          and pending_revision is not null
        )
      )
      and (
        correction_request_id is null
        or correction_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      )
      and (resulting_revision is null or resulting_revision > 0)
      and (
        (correction_request_id is null and resulting_revision is null)
        or (correction_request_id is not null and resulting_revision is not null)
      )
      and (
        verification is null
        or (btrim(verification) <> '' and char_length(verification) <= 1000)
      )
      and (verified_revision is null or verified_revision > 0)
      and (
        (verification is null and verified_revision is null)
        or (verification is not null and verified_revision is not null)
      )
      and (status <> 'repaired' or correction_request_id is not null)
      and (
        status <> 'resolved'
        or (correction_request_id is not null and verification is not null)
      )
    )
  );

drop index if exists private.authoring_workspace_observations_current_idx;
create index authoring_workspace_observations_current_idx
  on private.authoring_workspace_observations(
    workspace_id, updated_at desc, id desc
  );
create index authoring_workspace_active_findings_v1_idx
  on private.authoring_workspace_observations(
    workspace_id, updated_at desc, id desc
  ) where kind = 'audit_finding'
    and status in ('open', 'approved', 'repaired');
create index authoring_workspace_terminal_findings_v1_idx
  on private.authoring_workspace_observations(
    workspace_id, updated_at desc, id desc
  ) where kind = 'audit_finding'
    and status in ('rejected', 'resolved');

alter table private.authoring_workspace_observation_receipts
  add column workspace_id uuid,
  add column operation text,
  add column expires_at timestamptz not null default now() + interval '14 days';

delete from private.authoring_workspace_observation_receipts receipt
where coalesce(receipt.result->>'workspaceId', '') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
   or not exists (
     select 1 from private.authoring_workspaces workspace
     where workspace.id = (receipt.result->>'workspaceId')::uuid
   )
   or receipt.result->>'operation' not in ('create', 'delete');

update private.authoring_workspace_observation_receipts receipt
set workspace_id = (receipt.result->>'workspaceId')::uuid,
    operation = receipt.result->>'operation';

alter table private.authoring_workspace_observation_receipts
  alter column workspace_id set not null,
  alter column operation set not null,
  add constraint authoring_workspace_observation_receipts_workspace_v1
    foreign key(workspace_id) references private.authoring_workspaces(id)
      on delete cascade,
  add constraint authoring_workspace_observation_receipts_operation_v1
    check(operation in ('create', 'delete')),
  add constraint authoring_workspace_observation_receipts_expiry_v1
    check(expires_at > created_at);

create index authoring_workspace_observation_receipts_expiry_v1_idx
  on private.authoring_workspace_observation_receipts(
    expires_at, actor_id, request_id
  );

alter table private.authoring_workspace_requests
  drop constraint authoring_workspace_requests_operation_v5;
alter table private.authoring_workspace_requests
  add constraint authoring_workspace_requests_operation_v5 check (
    operation in (
      'create', 'create_structure', 'update_metadata',
      'save_microsequence_cards', 'save_card', 'update_brief',
      'copy_entity', 'rename_entity', 'move_entity', 'delete_entity',
      'merge_microsequences', 'split_microsequence', 'promote_module',
      'demote_course', 'import_course', 'publish_private_preview',
      'publish_private_complete', 'publish_catalog_complete',
      'delete_workspace', 'update_continuity', 'create_finding',
      'decide_finding', 'link_finding_correction', 'verify_finding',
      'delete_finding'
    )
  );

alter table private.authoring_workspace_events
  drop constraint authoring_workspace_events_operation_v5;
alter table private.authoring_workspace_events
  add constraint authoring_workspace_events_operation_v5 check (
    operation in (
      'create', 'create_structure', 'update_metadata',
      'save_microsequence_cards', 'save_card', 'update_brief',
      'copy_entity', 'rename_entity', 'move_entity', 'delete_entity',
      'merge_microsequences', 'split_microsequence', 'promote_module',
      'demote_course', 'import_course', 'update_continuity',
      'create_finding', 'decide_finding', 'link_finding_correction',
      'verify_finding', 'delete_finding'
    )
  );

create function private.current_authoring_observation_path_v1(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_path text[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_target_type text;
  v_target_id text;
  v_path text[];
begin
  if p_entity_type = 'workspace' then
    return '{}'::text[];
  end if;
  v_target_type := case when p_entity_type = 'resource'
    then 'card' else p_entity_type end;
  v_target_id := p_entity_path[cardinality(p_entity_path)];
  if v_target_id is null then return null; end if;
  with recursive lineage as (
    select entity.entity_type, entity.entity_id,
      entity.parent_type, entity.parent_id,
      array[entity.entity_id]::text[] as entity_path
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = v_target_type
      and entity.entity_id = v_target_id
    union all
    select parent.entity_type, parent.entity_id,
      parent.parent_type, parent.parent_id,
      array_prepend(parent.entity_id, child.entity_path)
    from lineage child
    join private.authoring_workspace_entities parent
      on parent.workspace_id = p_workspace_id
     and parent.entity_type = child.parent_type
     and parent.entity_id = child.parent_id
    where child.entity_type <> 'course'
  )
  select entity_path into v_path
  from lineage
  where entity_type = 'course'
  limit 1;
  return v_path;
end;
$function$;

create function private.authoring_observation_target_exists_v1(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_path text[],
  p_resource_target_id text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_card jsonb;
  v_suffix text;
begin
  if p_entity_type = 'workspace' then
    return cardinality(p_entity_path) = 0 and p_resource_target_id is null;
  end if;
  if private.current_authoring_observation_path_v1(
    p_workspace_id, p_entity_type, p_entity_path
  ) is distinct from p_entity_path then
    return false;
  end if;
  if p_entity_type <> 'resource' then
    return p_resource_target_id is null;
  end if;
  if p_resource_target_id is null then return false; end if;
  select entity.content into v_card
  from private.authoring_workspace_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'card'
    and entity.entity_id = p_entity_path[cardinality(p_entity_path)];
  if not found then return false; end if;
  if p_resource_target_id = 'main' then
    return nullif(btrim(v_card->>'resource'), '') is not null
      and v_card->>'resource' <> 'composite';
  end if;
  if p_resource_target_id = 'response' then
    return v_card->>'resource' <> 'choice'
      and v_card->>'exercise' = 'choice';
  end if;
  if p_resource_target_id = 'after:text' then return true; end if;
  if p_resource_target_id like 'body:%' then
    v_suffix := substr(p_resource_target_id, 6);
    return v_card->>'resource' = 'composite'
      and nullif(v_suffix, '') is not null
      and jsonb_typeof(v_card->'blocks') = 'array'
      and exists (
        select 1 from jsonb_array_elements(v_card->'blocks') block
        where block->>'id' = v_suffix
      );
  end if;
  if p_resource_target_id like 'after:%' then
    v_suffix := substr(p_resource_target_id, 7);
    return nullif(v_suffix, '') is not null
      and jsonb_typeof(v_card->'afterBlocks') = 'array'
      and exists (
        select 1 from jsonb_array_elements(v_card->'afterBlocks') block
        where block->>'id' = v_suffix
      );
  end if;
  return false;
end;
$function$;

create function private.authoring_observation_target_available_v1(
  p_workspace_id uuid,
  p_entity_type text,
  p_current_entity_path text[],
  p_resource_target_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select p_current_entity_path is not null and (
    p_entity_type <> 'resource'
    or private.authoring_observation_target_exists_v1(
      p_workspace_id, p_entity_type, p_current_entity_path,
      p_resource_target_id
    )
  )
$function$;

create function private.authoring_audit_target_in_part_v1(
  p_workspace_id uuid,
  p_state jsonb,
  p_entity_type text,
  p_entity_path text[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_target_part_id text := p_state#>>'{mandate,targetPartId}';
  v_target_id text;
  v_microsequence_ids text[];
begin
  if v_target_part_id is null then return true; end if;
  v_target_id := p_entity_path[cardinality(p_entity_path)];
  if p_entity_type = 'workspace' then
    select array_agg(entity.entity_id order by entity.entity_id)
    into v_microsequence_ids
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'microsequence';
  elsif p_entity_type = 'course' then
    select array_agg(microsequence.entity_id order by microsequence.entity_id)
    into v_microsequence_ids
    from private.authoring_workspace_entities module_value
    join private.authoring_workspace_entities lesson
      on lesson.workspace_id = module_value.workspace_id
     and lesson.entity_type = 'lesson'
     and lesson.parent_type = 'module'
     and lesson.parent_id = module_value.entity_id
    join private.authoring_workspace_entities microsequence
      on microsequence.workspace_id = lesson.workspace_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    where module_value.workspace_id = p_workspace_id
      and module_value.entity_type = 'module'
      and module_value.parent_type = 'course'
      and module_value.parent_id = v_target_id;
  elsif p_entity_type = 'module' then
    select array_agg(microsequence.entity_id order by microsequence.entity_id)
    into v_microsequence_ids
    from private.authoring_workspace_entities lesson
    join private.authoring_workspace_entities microsequence
      on microsequence.workspace_id = lesson.workspace_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.parent_type = 'lesson'
     and microsequence.parent_id = lesson.entity_id
    where lesson.workspace_id = p_workspace_id
      and lesson.entity_type = 'lesson'
      and lesson.parent_type = 'module'
      and lesson.parent_id = v_target_id;
  elsif p_entity_type = 'lesson' then
    select array_agg(microsequence.entity_id order by microsequence.entity_id)
    into v_microsequence_ids
    from private.authoring_workspace_entities microsequence
    where microsequence.workspace_id = p_workspace_id
      and microsequence.entity_type = 'microsequence'
      and microsequence.parent_type = 'lesson'
      and microsequence.parent_id = v_target_id;
  elsif p_entity_type = 'microsequence' then
    -- O finding conserva o caminho auditado. Se o próprio reparo removeu a
    -- microssequência, sua identidade continua na Parte até o replanejamento.
    v_microsequence_ids := case
      when cardinality(p_entity_path) = 4 then array[v_target_id]
      else null
    end;
  elsif p_entity_type in ('card', 'resource') then
    select array_agg(microsequence.entity_id)
    into v_microsequence_ids
    from private.authoring_workspace_entities card
    join private.authoring_workspace_entities microsequence
      on microsequence.workspace_id = card.workspace_id
     and microsequence.entity_type = 'microsequence'
     and microsequence.entity_id = card.parent_id
    where card.workspace_id = p_workspace_id
      and card.entity_type = 'card'
      and card.entity_id = v_target_id
      and card.parent_type = 'microsequence';
    if coalesce(cardinality(v_microsequence_ids), 0) = 0
       and cardinality(p_entity_path) = 5 then
      -- Card/resource excluído não pode mais ser resolvido pela árvore. O
      -- caminho imutável do finding ainda prova a micro auditada.
      v_microsequence_ids := array[p_entity_path[4]];
    end if;
  else
    return false;
  end if;
  if coalesce(cardinality(v_microsequence_ids), 0) = 0 then return false; end if;
  return not exists (
    select 1
    from unnest(v_microsequence_ids) microsequence_id
    where not exists (
      select 1
      from jsonb_array_elements(p_state->'parts') part
      cross join lateral jsonb_array_elements_text(
        part->'microsequenceIds'
      ) listed
      where part->>'id' = v_target_part_id
        and listed = microsequence_id
    )
  );
end;
$function$;

create function private.authoring_observation_paths_related_v1(
  p_left text[],
  p_right text[]
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select p_left is not null and p_right is not null and (
    (
      cardinality(p_left) <= cardinality(p_right)
      and p_left = p_right[1:cardinality(p_left)]
    )
    or (
      cardinality(p_right) <= cardinality(p_left)
      and p_right = p_left[1:cardinality(p_right)]
    )
  )
$function$;

create function private.prune_authoring_workspace_terminal_findings_v1(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'authoring-terminal-findings:' || p_workspace_id::text,
    0
  ));
  with ranked as materialized (
    select observation.id, observation.updated_at,
      row_number() over(
        order by observation.updated_at desc, observation.id desc
      ) as ordinal
    from private.authoring_workspace_observations observation
    where observation.workspace_id = p_workspace_id
      and observation.kind = 'audit_finding'
      and observation.status in ('rejected', 'resolved')
  ), disposable as materialized (
    select ranked.id
    from ranked
    where ranked.updated_at < statement_timestamp() - interval '90 days'
       or ranked.ordinal > 100
  )
  delete from private.authoring_workspace_observations observation
  using disposable
  where observation.id = disposable.id;
end;
$function$;

create function private.prune_authoring_workspace_observation_receipts_v1(
  p_actor_id uuid default null,
  p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if p_actor_id is not null and p_request_id is not null then
    delete from private.authoring_workspace_observation_receipts receipt
    where receipt.actor_id = p_actor_id
      and receipt.request_id = p_request_id
      and receipt.expires_at <= statement_timestamp();
  end if;
  with expired_receipts as materialized (
    select receipt.ctid
    from private.authoring_workspace_observation_receipts receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 256
    for update skip locked
  )
  delete from private.authoring_workspace_observation_receipts receipt
  using expired_receipts expired
  where receipt.ctid = expired.ctid;
end;
$function$;

drop function public.list_authoring_workspace_observations_for_actor_v1(uuid, uuid);
drop function private.list_authoring_workspace_observations_v1(uuid, uuid);

create function private.list_authoring_workspace_observations_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_entity_types text[] default null,
  p_kinds text[] default null,
  p_statuses text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_items jsonb;
  v_summary jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  perform private.prune_authoring_workspace_terminal_findings_v1(
    p_workspace_id
  );
  if p_limit not between 1 and 50
     or ((p_before_updated_at is null) <> (p_before_id is null))
     or cardinality(coalesce(p_entity_types, '{}'::text[])) > 7
     or cardinality(coalesce(p_kinds, '{}'::text[])) > 2
     or cardinality(coalesce(p_statuses, '{}'::text[])) > 5
     or exists (
       select 1 from unnest(coalesce(p_entity_types, '{}'::text[])) value
       where value not in (
         'workspace', 'course', 'module', 'lesson',
         'microsequence', 'card', 'resource'
       )
     )
     or exists (
       select 1 from unnest(coalesce(p_kinds, '{}'::text[])) value
       where value not in ('note', 'audit_finding')
     )
     or exists (
       select 1 from unnest(coalesce(p_statuses, '{}'::text[])) value
       where value not in ('open', 'approved', 'rejected', 'repaired', 'resolved')
     ) then
    raise exception 'Consulta de observações inválida.' using errcode = '22023';
  end if;

  with candidates as materialized (
    select observation.*,
      private.current_authoring_observation_path_v1(
        observation.workspace_id,
        observation.entity_type,
        observation.entity_path
      ) as current_entity_path
    from private.authoring_workspace_observations observation
    where observation.workspace_id = p_workspace_id
      and (
        observation.author_id = p_actor_id
        or private.educational_workspace_can_v1(
          p_workspace_id, p_actor_id, 'review'
        )
      )
      and (p_entity_types is null or observation.entity_type = any(p_entity_types))
      and (p_kinds is null or observation.kind = any(p_kinds))
      and (p_statuses is null or observation.status = any(p_statuses))
      and (
        p_before_updated_at is null
        or (observation.updated_at, observation.id) <
          (p_before_updated_at, p_before_id)
      )
    order by observation.updated_at desc, observation.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by updated_at desc, id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'observationId', page.id,
      'workspaceId', page.workspace_id,
      'kind', page.kind,
      'entityType', page.entity_type,
      'entityPath', to_jsonb(page.entity_path),
      'currentEntityPath', to_jsonb(page.current_entity_path),
      'targetAvailable', private.authoring_observation_target_available_v1(
        page.workspace_id, page.entity_type, page.current_entity_path,
        page.resource_target_id
      ),
      'resourceTargetId', page.resource_target_id,
      'body', page.body,
      'category', page.category,
      'severity', page.severity,
      'status', page.status,
      'proposedRepair', page.proposed_repair,
      'auditRevision', page.audit_revision,
      'pendingCorrectionRequestId', page.pending_correction_request_id,
      'pendingRevision', page.pending_revision,
      'correctionRequestId', page.correction_request_id,
      'resultingRevision', page.resulting_revision,
      'verification', page.verification,
      'verifiedRevision', page.verified_revision,
      'authorId', page.author_id,
      'canDelete', page.author_id = p_actor_id
        or private.educational_workspace_can_v1(
          p_workspace_id, p_actor_id, 'review'
        ),
      'createdAt', page.created_at,
      'updatedAt', page.updated_at
    ) order by page.updated_at desc, page.id desc), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'beforeUpdatedAt', page.updated_at,
        'beforeId', page.id
      )
      from page
      order by page.updated_at, page.id
      limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;

  select jsonb_build_object(
    'total', count(*),
    'notes', count(*) filter(where observation.kind = 'note'),
    'findings', count(*) filter(where observation.kind = 'audit_finding'),
    'activeFindings', count(*) filter(
      where observation.kind = 'audit_finding'
        and observation.status in ('open', 'approved', 'repaired')
    ),
    'byStatus', jsonb_build_object(
      'open', count(*) filter(where observation.status = 'open'),
      'approved', count(*) filter(where observation.status = 'approved'),
      'rejected', count(*) filter(where observation.status = 'rejected'),
      'repaired', count(*) filter(where observation.status = 'repaired'),
      'resolved', count(*) filter(where observation.status = 'resolved')
    )
  ) into v_summary
  from private.authoring_workspace_observations observation
  where observation.workspace_id = p_workspace_id
    and (
      observation.author_id = p_actor_id
      or private.educational_workspace_can_v1(
        p_workspace_id, p_actor_id, 'review'
      )
    );

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor,
    'summary', v_summary
  );
end;
$function$;

create function public.list_authoring_workspace_observations_for_actor_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_limit integer default 20,
  p_before_updated_at timestamptz default null,
  p_before_id uuid default null,
  p_entity_types text[] default null,
  p_kinds text[] default null,
  p_statuses text[] default null
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as $function$
  select private.list_authoring_workspace_observations_v1(
    p_actor_id, p_workspace_id, p_limit, p_before_updated_at, p_before_id,
    p_entity_types, p_kinds, p_statuses
  )
$function$;

create or replace function private.manage_authoring_workspace_observation_v1(
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
    p_workspace_id, p_actor_id, case when p_operation = 'create'
      then 'comment' else 'read' end
  );
  perform private.prune_authoring_workspace_terminal_findings_v1(
    p_workspace_id
  );
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in ('create', 'delete')
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 8192 then
    raise exception 'Operação de observação inválida.' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'workspaceId', p_workspace_id,
      'operation', p_operation,
      'payload', p_payload
    )::text, 'UTF8'), 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(
    'workspace-observation:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_observation_receipts_v1(
    p_actor_id, p_request_id
  );
  select * into v_receipt
  from private.authoring_workspace_observation_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    if v_receipt.workspace_id <> p_workspace_id
       or v_receipt.operation <> p_operation
       or v_receipt.request_hash <> v_hash then
      raise exception 'requestId reutilizado com outra intenção.'
        using errcode = '23514';
    end if;
    return v_receipt.result || jsonb_build_object('idempotent', true);
  end if;

  if p_operation = 'create' then
    if exists(
      select 1 from jsonb_object_keys(p_payload) field
      where field not in ('entityType', 'entityPath', 'resourceTargetId', 'body')
    )
       or jsonb_typeof(p_payload->'entityPath') <> 'array' then
      raise exception 'Observação contém campo desconhecido.' using errcode = '22023';
    end if;
    v_entity_type := btrim(coalesce(p_payload->>'entityType', ''));
    select coalesce(array_agg(value order by ordinal), '{}') into v_entity_path
    from jsonb_array_elements_text(p_payload->'entityPath')
      with ordinality item(value, ordinal);
    v_resource_target_id := nullif(
      btrim(coalesce(p_payload->>'resourceTargetId', '')), ''
    );
    if v_entity_type not in (
         'workspace', 'course', 'module', 'lesson',
         'microsequence', 'card', 'resource'
       )
       or cardinality(v_entity_path) <> (case v_entity_type
         when 'workspace' then 0 when 'course' then 1 when 'module' then 2
         when 'lesson' then 3 when 'microsequence' then 4 else 5 end)
       or exists(
         select 1 from unnest(v_entity_path) part
         where btrim(part) = '' or char_length(part) > 240
       )
       or ((v_entity_type = 'resource') <> (v_resource_target_id is not null))
       or char_length(coalesce(v_resource_target_id, '')) > 240
       or btrim(coalesce(p_payload->>'body', '')) = ''
       or char_length(p_payload->>'body') > 2000
       or not private.authoring_observation_target_exists_v1(
         p_workspace_id, v_entity_type, v_entity_path, v_resource_target_id
       ) then
      raise exception 'Observação inválida.' using errcode = '22023';
    end if;
    insert into private.authoring_workspace_observations(
      workspace_id, author_id, kind, entity_type, entity_path,
      resource_target_id, body
    ) values(
      p_workspace_id, p_actor_id, 'note', v_entity_type, v_entity_path,
      v_resource_target_id, btrim(p_payload->>'body')
    ) returning * into v_observation;
    v_result := jsonb_build_object(
      'operation', 'create', 'observationId', v_observation.id,
      'workspaceId', p_workspace_id, 'updatedAt', v_observation.updated_at,
      'idempotent', false
    );
  else
    if exists(
      select 1 from jsonb_object_keys(p_payload) field
      where field <> 'observationId'
    ) or coalesce(p_payload->>'observationId', '') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception 'Observação inválida.' using errcode = '22023';
    end if;
    select * into v_observation
    from private.authoring_workspace_observations observation
    where observation.id = (p_payload->>'observationId')::uuid
      and observation.workspace_id = p_workspace_id
      and observation.kind = 'note'
    for update;
    if not found then
      raise exception 'Observação não encontrada.' using errcode = 'P0002';
    end if;
    if v_observation.author_id <> p_actor_id
       and not private.educational_workspace_can_v1(
         p_workspace_id, p_actor_id, 'review'
       ) then
      raise exception 'Sem permissão para excluir esta observação.'
        using errcode = '42501';
    end if;
    delete from private.authoring_workspace_observations
    where id = v_observation.id;
    v_result := jsonb_build_object(
      'operation', 'delete', 'observationId', v_observation.id,
      'workspaceId', p_workspace_id, 'updatedAt', now(),
      'idempotent', false
    );
  end if;
  insert into private.authoring_workspace_observation_receipts(
    actor_id, request_id, request_hash, workspace_id, operation, result
  ) values(
    p_actor_id, p_request_id, v_hash, p_workspace_id, p_operation, v_result
  );
  return v_result;
end;
$function$;

create function public.get_authoring_workspace_continuity_v1(
  p_actor_id uuid,
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_workspace private.authoring_workspaces%rowtype;
  v_active_findings jsonb;
  v_active_truncated boolean;
  v_summary jsonb;
  v_structural_summary jsonb;
  v_situated_summary jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  perform private.prune_authoring_workspace_terminal_findings_v1(
    p_workspace_id
  );
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;

  with candidates as materialized (
    select observation.*,
      private.current_authoring_observation_path_v1(
        observation.workspace_id,
        observation.entity_type,
        observation.entity_path
      ) as current_entity_path
    from private.authoring_workspace_observations observation
    where observation.workspace_id = p_workspace_id
      and observation.kind = 'audit_finding'
      and observation.status in ('open', 'approved', 'repaired')
    order by observation.updated_at desc, observation.id desc
    limit 11
  ), page as materialized (
    select * from candidates
    order by updated_at desc, id desc
    limit 10
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'findingId', page.id,
      'entityType', page.entity_type,
      'entityPath', to_jsonb(page.entity_path),
      'currentEntityPath', to_jsonb(page.current_entity_path),
      'targetAvailable', private.authoring_observation_target_available_v1(
        page.workspace_id, page.entity_type, page.current_entity_path,
        page.resource_target_id
      ),
      'resourceTargetId', page.resource_target_id,
      'body', page.body,
      'category', page.category,
      'severity', page.severity,
      'status', page.status,
      'proposedRepair', page.proposed_repair,
      'auditRevision', page.audit_revision,
      'pendingCorrectionRequestId', page.pending_correction_request_id,
      'pendingRevision', page.pending_revision,
      'correctionRequestId', page.correction_request_id,
      'resultingRevision', page.resulting_revision,
      'verifiedRevision', page.verified_revision,
      'createdAt', page.created_at,
      'updatedAt', page.updated_at
    ) order by page.updated_at desc, page.id desc), '[]'::jsonb),
    (select count(*) from candidates) > 10
  into v_active_findings, v_active_truncated
  from page;

  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter(
      where observation.status in ('open', 'approved', 'repaired')
    ),
    'byStatus', jsonb_build_object(
      'open', count(*) filter(where observation.status = 'open'),
      'approved', count(*) filter(where observation.status = 'approved'),
      'rejected', count(*) filter(where observation.status = 'rejected'),
      'repaired', count(*) filter(where observation.status = 'repaired'),
      'resolved', count(*) filter(where observation.status = 'resolved')
    )
  ) into v_summary
  from private.authoring_workspace_observations observation
  where observation.workspace_id = p_workspace_id
    and observation.kind = 'audit_finding';

  with totals as materialized (
    select count(*)::integer as total_count
    from private.authoring_workspace_observations observation
    where observation.workspace_id = p_workspace_id
      and observation.kind = 'note'
  ), grouped as materialized (
    select observation.workspace_id, observation.entity_type,
      observation.entity_path, observation.resource_target_id,
      count(*)::integer as total_count
    from private.authoring_workspace_observations observation
    where observation.workspace_id = p_workspace_id
      and observation.kind = 'note'
    group by observation.workspace_id, observation.entity_type,
      observation.entity_path, observation.resource_target_id
    order by count(*) desc, observation.entity_type,
      observation.entity_path, observation.resource_target_id
    limit 20
  ), focus as materialized (
    select grouped.*,
      private.current_authoring_observation_path_v1(
        grouped.workspace_id, grouped.entity_type, grouped.entity_path
      ) as current_entity_path
    from grouped
  )
  select jsonb_build_object(
    'totalCount', totals.total_count,
    'openCount', totals.total_count,
    'focus', coalesce((select jsonb_agg(jsonb_build_object(
      'entityType', focus.entity_type,
      'entityPath', to_jsonb(focus.entity_path),
      'currentEntityPath', to_jsonb(focus.current_entity_path),
      'resourceTargetId', focus.resource_target_id,
      'targetAvailable', private.authoring_observation_target_available_v1(
        focus.workspace_id, focus.entity_type, focus.current_entity_path,
        focus.resource_target_id
      ),
      'totalCount', focus.total_count,
      'openCount', focus.total_count
    ) order by focus.total_count desc, focus.entity_type, focus.entity_path,
      focus.resource_target_id) from focus), '[]'::jsonb)
  ) into v_structural_summary from totals;

  if private.educational_workspace_can_v1(
    p_workspace_id, p_actor_id, 'comment'
  ) then
    v_situated_summary := private.educational_workspace_comment_summary_v1(
      p_actor_id, p_workspace_id
    );
  else
    v_situated_summary := jsonb_build_object(
      'totalCount', 0, 'openCount', 0, 'focus', jsonb_build_array()
    );
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'revision', v_workspace.revision,
    'authoringState', v_workspace.authoring_state,
    'activeFindings', v_active_findings,
    'activeFindingsTruncated', v_active_truncated,
    'findingSummary', v_summary,
    'structuralObservations', v_structural_summary,
    'situatedObservations', v_situated_summary,
    'updatedAt', v_workspace.updated_at
  );
end;
$function$;

create function private.authoring_part_is_materialized_v1(
  p_workspace_id uuid,
  p_state jsonb,
  p_part_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select exists (
    select 1
    from jsonb_array_elements(p_state->'parts') part
    where part->>'id' = p_part_id
      and not exists (
        select 1
        from jsonb_array_elements_text(part->'microsequenceIds') microsequence_id
        where not exists (
          select 1
          from private.authoring_workspace_entities microsequence
          where microsequence.workspace_id = p_workspace_id
            and microsequence.entity_type = 'microsequence'
            and microsequence.entity_id = microsequence_id
            and microsequence.content->>'status' = 'ready'
        )
        or not exists (
          select 1
          from private.authoring_workspace_entities card
          where card.workspace_id = p_workspace_id
            and card.entity_type = 'card'
            and card.parent_type = 'microsequence'
            and card.parent_id = microsequence_id
        )
      )
  )
$function$;

create function private.authoring_jsonb_text_path_v1(p_path jsonb)
returns text[]
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_path text[];
begin
  if jsonb_typeof(p_path) <> 'array' then return null; end if;
  select coalesce(array_agg(value order by ordinal), '{}') into v_path
  from jsonb_array_elements_text(p_path)
    with ordinality path_part(value, ordinal);
  if exists (
    select 1 from unnest(v_path) value
    where nullif(btrim(value), '') is null
      or value <> btrim(value)
      or char_length(value) > 240
  ) then
    return null;
  end if;
  return v_path;
exception
  when others then return null;
end;
$function$;

-- Resolve a entidade na árvore que resultaria do mesmo lote. Isso permite ao
-- gate conferir tanto a origem quanto o destino de moves/promote/demote sem
-- confiar apenas nos caminhos declarados pelo adaptador.
create function private.authoring_post_change_path_v1(
  p_workspace_id uuid,
  p_changes jsonb,
  p_entity_type text,
  p_entity_id text
)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with recursive proposed_entities as materialized (
    select entity.entity_type, entity.entity_id,
      entity.parent_type, entity.parent_id
    from private.authoring_workspace_entities entity
    where entity.workspace_id = p_workspace_id
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_changes->'upserts', '[]'::jsonb)) change
        where change->>'entityType' = entity.entity_type
          and change->>'entityId' = entity.entity_id
      )
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_changes->'deletes', '[]'::jsonb)) change
        where change->>'entityType' = entity.entity_type
          and change->>'entityId' = entity.entity_id
      )
    union all
    select change->>'entityType', change->>'entityId',
      nullif(change->>'parentType', ''), nullif(change->>'parentId', '')
    from jsonb_array_elements(coalesce(p_changes->'upserts', '[]'::jsonb)) change
  ), lineage as (
    select entity.entity_type, entity.entity_id,
      entity.parent_type, entity.parent_id,
      array[entity.entity_id]::text[] as entity_path,
      array[entity.entity_type || ':' || entity.entity_id]::text[] as visited
    from proposed_entities entity
    where entity.entity_type = p_entity_type
      and entity.entity_id = p_entity_id
    union all
    select parent.entity_type, parent.entity_id,
      parent.parent_type, parent.parent_id,
      array_prepend(parent.entity_id, child.entity_path),
      array_append(child.visited, parent.entity_type || ':' || parent.entity_id)
    from lineage child
    join proposed_entities parent
      on parent.entity_type = child.parent_type
     and parent.entity_id = child.parent_id
    where child.entity_type <> 'course'
      and cardinality(child.visited) < 8
      and not (parent.entity_type || ':' || parent.entity_id = any(child.visited))
  )
  select case
    when p_entity_type = 'project' then '{}'::text[]
    else (
      select entity_path from lineage
      where entity_type = 'course'
      limit 1
    )
  end
$function$;

-- Calcula, antes do commit, quais achados o lote realmente toca. A decisão
-- usa a árvore corrente e a árvore pós-lote; resource exige o par exato.
create function private.authoring_finding_touched_by_commit_v1(
  p_workspace_id uuid,
  p_finding_id uuid,
  p_changes jsonb,
  p_summary jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_finding private.authoring_workspace_observations%rowtype;
  v_finding_path text[];
  v_change_record record;
  v_change jsonb;
  v_pre_path text[];
  v_post_path text[];
  v_candidate_path text[];
  v_summary_path jsonb;
begin
  select * into v_finding
  from private.authoring_workspace_observations observation
  where observation.workspace_id = p_workspace_id
    and observation.id = p_finding_id
    and observation.kind = 'audit_finding'
    and observation.status = 'approved';
  if not found then return false; end if;
  v_finding_path := coalesce(
    private.current_authoring_observation_path_v1(
      p_workspace_id, v_finding.entity_type, v_finding.entity_path
    ),
    v_finding.entity_path
  );

  if v_finding.entity_type = 'resource' then
    return jsonb_typeof(p_summary->'resourceTargets') = 'array'
      and exists (
        select 1
        from jsonb_array_elements(p_summary->'resourceTargets') target
        where target->'cardPath' = to_jsonb(v_finding_path)
          and target->>'targetId' = v_finding.resource_target_id
      );
  end if;

  -- IDs são únicos por tipo dentro do workspace. Para cards, isso também
  -- reconhece move/delete sem confundir outro card com o mesmo targetId.
  if v_finding.entity_type = 'card' then
    return exists (
      select 1
      from (
        select value from jsonb_array_elements(p_changes->'upserts')
        union all
        select value from jsonb_array_elements(p_changes->'deletes')
      ) changed
      where changed.value->>'entityType' = 'card'
        and changed.value->>'entityId' =
          v_finding_path[cardinality(v_finding_path)]
    );
  end if;

  if jsonb_typeof(p_summary->'targetPaths') = 'array' then
    for v_summary_path in
      select value from jsonb_array_elements(p_summary->'targetPaths')
    loop
      v_candidate_path := private.authoring_jsonb_text_path_v1(v_summary_path);
      if v_candidate_path is not null
         and cardinality(v_finding_path) <= cardinality(v_candidate_path)
         and v_finding_path = v_candidate_path[
           1:cardinality(v_finding_path)
         ] then
        return true;
      end if;
    end loop;
  end if;

  for v_change_record in
    select value as change_value, false as is_delete
    from jsonb_array_elements(p_changes->'upserts')
    union all
    select value as change_value, true as is_delete
    from jsonb_array_elements(p_changes->'deletes')
  loop
    v_change := v_change_record.change_value;
    if v_change->>'entityType' = 'project' then
      v_pre_path := '{}'::text[];
    else
      v_pre_path := private.current_authoring_observation_path_v1(
        p_workspace_id, v_change->>'entityType',
        array[v_change->>'entityId']
      );
    end if;
    v_post_path := case when v_change_record.is_delete then null
      else private.authoring_post_change_path_v1(
        p_workspace_id, p_changes, v_change->>'entityType',
        v_change->>'entityId'
      ) end;
    for v_candidate_path in
      select candidate.entity_path
      from (values (v_pre_path), (v_post_path)) candidate(entity_path)
    loop
      if v_candidate_path is not null
         and cardinality(v_finding_path) <= cardinality(v_candidate_path)
         and v_finding_path = v_candidate_path[
           1:cardinality(v_finding_path)
         ] then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$function$;

create function private.assert_authoring_commit_mandate_v1(
  p_workspace_id uuid,
  p_operation text,
  p_changes jsonb,
  p_summary jsonb,
  p_state jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_kind text := p_state#>>'{mandate,kind}';
  v_target_part_id text := p_state#>>'{mandate,targetPartId}';
  v_change jsonb;
  v_change_record record;
  v_entity_type text;
  v_entity_id text;
  v_parent_id text;
  v_pre_parent_id text;
  v_post_parent_id text;
  v_change_path text[];
  v_pre_change_path text[];
  v_post_change_path text[];
  v_path_to_check text[];
  v_finding_path text[];
  v_summary_path jsonb;
  v_summary_path_array text[];
  v_resource_target jsonb;
  v_allowed boolean;
  v_remap jsonb := p_summary->'continuityRemap';
  v_target_paths jsonb := coalesce(p_summary->'targetPaths', '[]'::jsonb);
  v_changed_card_paths jsonb := coalesce(
    p_summary->'changedCardPaths', '[]'::jsonb
  );
  v_card_shell_paths jsonb := coalesce(
    p_summary->'cardShellChangedPaths', '[]'::jsonb
  );
  v_resource_targets jsonb := coalesce(
    p_summary->'resourceTargets', '[]'::jsonb
  );
  v_expected_operation_family text := case
    when p_operation in ('save_microsequence_cards', 'save_card')
      then 'content'
    else 'structure'
  end;
begin
  if v_kind is null then return; end if;
  if v_kind = 'audit' then
    raise exception 'Mandato de auditoria não autoriza mutação de conteúdo.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'object'
     or jsonb_typeof(p_changes->'upserts') <> 'array'
     or jsonb_typeof(p_changes->'deletes') <> 'array' then
    raise exception 'Mutação composta inválida.' using errcode = '22023';
  end if;

  if v_kind = 'build_part' then
    if p_operation not in ('save_microsequence_cards', 'save_card') then
      raise exception 'Mandato build_part aceita somente materialização da Parte.'
        using errcode = '42501';
    end if;
    for v_change in
      select value from jsonb_array_elements(p_changes->'upserts')
      union all
      select value from jsonb_array_elements(p_changes->'deletes')
    loop
      v_entity_type := v_change->>'entityType';
      v_entity_id := v_change->>'entityId';
      if v_entity_type = 'microsequence' then
        v_allowed := exists (
          select 1
          from jsonb_array_elements(p_state->'parts') part
          cross join lateral jsonb_array_elements_text(
            part->'microsequenceIds'
          ) microsequence_id
          where part->>'id' = v_target_part_id
            and microsequence_id = v_entity_id
        );
      elsif v_entity_type = 'card' then
        v_parent_id := nullif(v_change->>'parentId', '');
        if v_parent_id is null then
          select entity.parent_id into v_parent_id
          from private.authoring_workspace_entities entity
          where entity.workspace_id = p_workspace_id
            and entity.entity_type = 'card'
            and entity.entity_id = v_entity_id;
        end if;
        v_allowed := exists (
          select 1
          from jsonb_array_elements(p_state->'parts') part
          cross join lateral jsonb_array_elements_text(
            part->'microsequenceIds'
          ) microsequence_id
          where part->>'id' = v_target_part_id
            and microsequence_id = v_parent_id
        );
      else
        v_allowed := false;
      end if;
      if not coalesce(v_allowed, false) then
        raise exception 'Mutação escapa da Parte autorizada pelo mandato.'
          using errcode = '42501';
      end if;
    end loop;
    return;
  end if;

  if v_kind = 'repair_findings' then
    if exists (
      select 1
      from jsonb_array_elements_text(p_state#>'{mandate,findingIds}') finding_id
      where not exists (
        select 1
        from private.authoring_workspace_observations observation
        where observation.workspace_id = p_workspace_id
          and observation.id = finding_id::uuid
          and observation.kind = 'audit_finding'
          and observation.status in ('approved', 'repaired')
      )
    ) then
      raise exception 'Mandato de reparo contém achado fora do ciclo ativo.'
        using errcode = '42501';
    end if;
    if p_summary->>'operationFamily' is distinct from
         v_expected_operation_family
       or (p_summary ? 'targetPaths'
         and jsonb_typeof(p_summary->'targetPaths') <> 'array')
       or (p_summary ? 'targetPathsTruncated'
         and jsonb_typeof(p_summary->'targetPathsTruncated') <> 'boolean')
       or coalesce((p_summary->>'targetPathsTruncated')::boolean, false)
       or (p_summary ? 'changedCardPaths'
         and jsonb_typeof(p_summary->'changedCardPaths') <> 'array')
       or (p_summary ? 'changedCardPathsTruncated'
         and jsonb_typeof(p_summary->'changedCardPathsTruncated') <> 'boolean')
       or coalesce((p_summary->>'changedCardPathsTruncated')::boolean, false)
       or (p_summary ? 'cardShellChangedPaths'
         and jsonb_typeof(p_summary->'cardShellChangedPaths') <> 'array')
       or (p_summary ? 'cardShellChangedPathsTruncated'
         and jsonb_typeof(
           p_summary->'cardShellChangedPathsTruncated'
         ) <> 'boolean')
       or coalesce(
         (p_summary->>'cardShellChangedPathsTruncated')::boolean, false
       )
       or (p_summary ? 'resourceTargets'
         and jsonb_typeof(p_summary->'resourceTargets') <> 'array')
       or (p_summary ? 'resourceTargetsTruncated'
         and jsonb_typeof(p_summary->'resourceTargetsTruncated') <> 'boolean')
       or coalesce((p_summary->>'resourceTargetsTruncated')::boolean, false)
    then
      raise exception 'Resumo de reparo incompleto ou truncado.'
        using errcode = '42501';
    end if;
    if jsonb_array_length(v_target_paths) > 20
       or jsonb_array_length(v_changed_card_paths) > 20
       or jsonb_array_length(v_card_shell_paths) > 20
       or jsonb_array_length(v_resource_targets) > 10 then
      raise exception 'Resumo de reparo excede o recorte seguro.'
        using errcode = '42501';
    end if;
    -- O destino declarado é evidência adicional: cada origem e cada destino
    -- precisa estar no próprio achado ou abaixo dele. A relação é direcional.
    for v_summary_path in
      select value from jsonb_array_elements(v_target_paths)
    loop
      v_summary_path_array := private.authoring_jsonb_text_path_v1(
        v_summary_path
      );
      if v_summary_path_array is null then
        raise exception 'Caminho de reparo inválido.' using errcode = '22023';
      end if;
      v_allowed := exists (
        select 1
        from private.authoring_workspace_observations observation
        cross join lateral (
          select coalesce(
            private.current_authoring_observation_path_v1(
              p_workspace_id, observation.entity_type,
              observation.entity_path
            ),
            observation.entity_path
          ) as entity_path
        ) finding
        where observation.workspace_id = p_workspace_id
          and observation.id::text in (
            select finding_id from jsonb_array_elements_text(
              p_state#>'{mandate,findingIds}'
            ) finding_id
          )
          and observation.kind = 'audit_finding'
          and observation.status = 'approved'
          and cardinality(finding.entity_path) <=
            cardinality(v_summary_path_array)
          and finding.entity_path = v_summary_path_array[
            1:cardinality(finding.entity_path)
          ]
      );
      if not coalesce(v_allowed, false) then
        raise exception 'Destino escapa dos achados autorizados.'
          using errcode = '42501';
      end if;
    end loop;
    for v_summary_path in
      select value from jsonb_array_elements(v_changed_card_paths)
    loop
      if private.authoring_jsonb_text_path_v1(v_summary_path) is null then
        raise exception 'Caminho de card alterado é inválido.'
          using errcode = '22023';
      end if;
    end loop;
    for v_summary_path in
      select value from jsonb_array_elements(v_card_shell_paths)
    loop
      v_summary_path_array := private.authoring_jsonb_text_path_v1(
        v_summary_path
      );
      if v_summary_path_array is null
         or not exists (
           select 1 from jsonb_array_elements(v_changed_card_paths) changed_path
           where changed_path = v_summary_path
         ) then
        raise exception 'Shell de card não pertence aos cards alterados.'
          using errcode = '22023';
      end if;
      v_allowed := exists (
        select 1
        from private.authoring_workspace_observations observation
        cross join lateral (
          select coalesce(
            private.current_authoring_observation_path_v1(
              p_workspace_id, observation.entity_type,
              observation.entity_path
            ),
            observation.entity_path
          ) as entity_path
        ) finding
        where observation.workspace_id = p_workspace_id
          and observation.id::text in (
            select finding_id
            from jsonb_array_elements_text(
              p_state#>'{mandate,findingIds}'
            ) finding_id
          )
          and observation.kind = 'audit_finding'
          and observation.status = 'approved'
          and observation.entity_type <> 'resource'
          and cardinality(finding.entity_path) <=
            cardinality(v_summary_path_array)
          and finding.entity_path = v_summary_path_array[
            1:cardinality(finding.entity_path)
          ]
      );
      if not coalesce(v_allowed, false) then
        raise exception 'Shell de card escapa dos achados autorizados.'
          using errcode = '42501';
      end if;
    end loop;
    for v_resource_target in
      select value from jsonb_array_elements(v_resource_targets)
    loop
      if jsonb_typeof(v_resource_target) <> 'object' then
        raise exception 'Resource alterado é inválido.' using errcode = '22023';
      end if;
      if not (v_resource_target ?& array['cardPath', 'targetId'])
         or exists (
           select 1 from jsonb_object_keys(v_resource_target) field_name
           where field_name not in ('cardPath', 'targetId')
         ) then
        raise exception 'Resource alterado é inválido.' using errcode = '22023';
      end if;
      v_summary_path_array := private.authoring_jsonb_text_path_v1(
        v_resource_target->'cardPath'
      );
      if v_summary_path_array is null
         or jsonb_typeof(v_resource_target->'targetId') <> 'string'
         or nullif(btrim(v_resource_target->>'targetId'), '') is null
         or char_length(v_resource_target->>'targetId') > 240
         or not exists (
           select 1 from jsonb_array_elements(v_changed_card_paths) changed_path
           where changed_path = v_resource_target->'cardPath'
         ) then
        raise exception 'Resource alterado não pertence aos cards alterados.'
          using errcode = '22023';
      end if;
      v_allowed := exists (
        select 1
        from private.authoring_workspace_observations observation
        cross join lateral (
          select coalesce(
            private.current_authoring_observation_path_v1(
              p_workspace_id, observation.entity_type,
              observation.entity_path
            ),
            observation.entity_path
          ) as entity_path
        ) finding
        where observation.workspace_id = p_workspace_id
          and observation.id::text in (
            select finding_id
            from jsonb_array_elements_text(
              p_state#>'{mandate,findingIds}'
            ) finding_id
          )
          and observation.kind = 'audit_finding'
          and observation.status = 'approved'
          and (
            (
              observation.entity_type = 'resource'
              and finding.entity_path = v_summary_path_array
              and observation.resource_target_id =
                v_resource_target->>'targetId'
            )
            or (
              observation.entity_type <> 'resource'
              and cardinality(finding.entity_path) <=
                cardinality(v_summary_path_array)
              and finding.entity_path = v_summary_path_array[
                1:cardinality(finding.entity_path)
              ]
            )
          )
      );
      if not coalesce(v_allowed, false) then
        raise exception 'Resource escapa dos achados autorizados.'
          using errcode = '42501';
      end if;
    end loop;
    if p_summary->>'operationFamily' = 'content' and exists (
      select 1
      from jsonb_array_elements(v_changed_card_paths) changed_path
      where not exists (
        select 1 from jsonb_array_elements(v_card_shell_paths) shell_path
        where shell_path = changed_path
      )
      and not exists (
        select 1 from jsonb_array_elements(v_resource_targets) resource_target
        where resource_target->'cardPath' = changed_path
      )
    ) then
      raise exception 'Card alterado não declara shell nem resource autorizado.'
        using errcode = '42501';
    end if;
    for v_change_record in
      select value as change_value, false as is_delete
      from jsonb_array_elements(p_changes->'upserts')
      union all
      select value as change_value, true as is_delete
      from jsonb_array_elements(p_changes->'deletes')
    loop
      v_change := v_change_record.change_value;
      v_entity_type := v_change->>'entityType';
      v_entity_id := v_change->>'entityId';
      if v_entity_type = 'project' then
        v_pre_change_path := '{}'::text[];
      else
        v_pre_change_path := private.current_authoring_observation_path_v1(
          p_workspace_id, v_entity_type, array[v_entity_id]
        );
      end if;
      v_post_change_path := case when v_change_record.is_delete then null
        else private.authoring_post_change_path_v1(
          p_workspace_id, p_changes, v_entity_type, v_entity_id
        ) end;
      v_change_path := coalesce(v_post_change_path, v_pre_change_path);
      if v_entity_type = 'card'
         and not exists (
           select 1 from jsonb_array_elements(v_changed_card_paths) changed_path
           where changed_path = to_jsonb(v_change_path)
         ) then
        raise exception 'Card mutado não consta do resumo verificável.'
          using errcode = '42501';
      end if;
      -- Upserts existentes podem mudar de pai. A autorização cobre o caminho
      -- anterior e o posterior; deletes só têm origem e creates só destino.
      for v_path_to_check in
        select candidate.entity_path
        from (values (v_pre_change_path), (v_post_change_path))
          candidate(entity_path)
      loop
        if v_path_to_check is null then continue; end if;
        v_allowed := exists (
          select 1
          from private.authoring_workspace_observations observation
          cross join lateral (
            select coalesce(
              private.current_authoring_observation_path_v1(
                p_workspace_id, observation.entity_type,
                observation.entity_path
              ),
              observation.entity_path
            ) as entity_path
          ) finding
          where observation.workspace_id = p_workspace_id
            and observation.id::text in (
              select finding_id from jsonb_array_elements_text(
                p_state#>'{mandate,findingIds}'
              ) finding_id
            )
            and observation.kind = 'audit_finding'
            and observation.status = 'approved'
            and cardinality(finding.entity_path) <=
              cardinality(v_path_to_check)
            and finding.entity_path = v_path_to_check[
              1:cardinality(finding.entity_path)
            ]
        );
        if not coalesce(v_allowed, false) then
          raise exception 'Mutação escapa dos achados autorizados pelo mandato.'
            using errcode = '42501';
        end if;
      end loop;
      if v_pre_change_path is null and v_post_change_path is null then
        raise exception 'Não foi possível resolver o alvo da mutação.'
          using errcode = '42501';
      end if;
    end loop;
    return;
  end if;

  if v_kind <> 'restructure' then
    raise exception 'Mandato de autoria desconhecido.' using errcode = '22023';
  end if;
  if p_operation not in (
    'create_structure', 'update_metadata', 'copy_entity', 'rename_entity',
    'move_entity', 'delete_entity', 'merge_microsequences',
    'split_microsequence', 'promote_module', 'demote_course', 'import_course'
  ) then
    raise exception 'Mandato restructure não autoriza mutação de conteúdo.'
      using errcode = '42501';
  end if;
  if v_target_part_id is null then return; end if;
  if (p_summary ? 'targetPaths'
      and jsonb_typeof(p_summary->'targetPaths') <> 'array')
     or (p_summary ? 'targetPathsTruncated'
      and jsonb_typeof(p_summary->'targetPathsTruncated') <> 'boolean')
     or coalesce((p_summary->>'targetPathsTruncated')::boolean, false) then
    raise exception 'Reestruturação truncada não prova seu escopo.'
      using errcode = '42501';
  end if;
  for v_change_record in
    select value as change_value, false as is_delete
    from jsonb_array_elements(p_changes->'upserts')
    union all
    select value as change_value, true as is_delete
    from jsonb_array_elements(p_changes->'deletes')
  loop
    v_change := v_change_record.change_value;
    v_entity_type := v_change->>'entityType';
    v_entity_id := v_change->>'entityId';
    if v_entity_type = 'microsequence' then
      v_allowed := exists (
        select 1
        from jsonb_array_elements(p_state->'parts') part
        cross join lateral jsonb_array_elements_text(
          part->'microsequenceIds'
        ) microsequence_id
        where part->>'id' = v_target_part_id
          and (
            microsequence_id = v_entity_id
            or (
              v_remap->>'kind' = 'split'
              and microsequence_id = v_remap->>'sourceId'
              and v_entity_id = v_remap->>'newId'
            )
            or (
              v_remap->>'kind' = 'merge'
              and (
                v_entity_id = v_remap->>'targetId'
                or exists (
                  select 1
                  from jsonb_array_elements_text(
                    v_remap->'sourceIds'
                  ) source_id
                  where source_id = v_entity_id
                )
              )
              and (
                microsequence_id = v_remap->>'targetId'
                or exists (
                  select 1
                  from jsonb_array_elements_text(
                    v_remap->'sourceIds'
                  ) source_id
                  where source_id = microsequence_id
                )
              )
            )
          )
      );
    elsif v_entity_type = 'card'
          and p_operation in ('split_microsequence', 'merge_microsequences') then
      select entity.parent_id into v_pre_parent_id
      from private.authoring_workspace_entities entity
      where entity.workspace_id = p_workspace_id
        and entity.entity_type = 'card'
        and entity.entity_id = v_entity_id
        and entity.parent_type = 'microsequence';
      v_post_parent_id := case when v_change_record.is_delete then null
        else nullif(v_change->>'parentId', '') end;
      v_allowed := (
          v_change_record.is_delete
          or (
            v_change->>'parentType' = 'microsequence'
            and v_post_parent_id is not null
          )
        )
        and coalesce(v_pre_parent_id, v_post_parent_id) is not null
        and not exists (
          select 1
          from unnest(array[v_pre_parent_id, v_post_parent_id]) parent_id
          where parent_id is not null
            and not exists (
              select 1
              from jsonb_array_elements(p_state->'parts') part
              cross join lateral jsonb_array_elements_text(
                part->'microsequenceIds'
              ) microsequence_id
              where part->>'id' = v_target_part_id
                and (
                  (
                    v_remap->>'kind' = 'split'
                    and microsequence_id = v_remap->>'sourceId'
                    and parent_id in (
                      v_remap->>'sourceId', v_remap->>'newId'
                    )
                  )
                  or (
                    v_remap->>'kind' = 'merge'
                    and (
                      parent_id = v_remap->>'targetId'
                      or exists (
                        select 1
                        from jsonb_array_elements_text(
                          v_remap->'sourceIds'
                        ) source_id
                        where source_id = parent_id
                      )
                    )
                    and (
                      microsequence_id = parent_id
                      or (
                        parent_id = v_remap->>'targetId'
                        and exists (
                          select 1
                          from jsonb_array_elements_text(
                            v_remap->'sourceIds'
                          ) source_id
                          where source_id = microsequence_id
                        )
                      )
                    )
                  )
                )
            )
        );
    else
      v_allowed := false;
    end if;
    if not coalesce(v_allowed, false) then
      raise exception 'Reestruturação escapa da Parte autorizada.'
        using errcode = '42501';
    end if;
  end loop;
end;
$function$;

create function private.remap_authoring_continuity_v1(
  p_state jsonb,
  p_operation text,
  p_changes jsonb,
  p_summary jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $function$
declare
  v_remap jsonb := p_summary->'continuityRemap';
  v_kind text;
  v_source_id text;
  v_new_id text;
  v_target_id text;
  v_source_ids jsonb;
  v_part jsonb;
  v_part_ids jsonb;
  v_parts jsonb := '[]'::jsonb;
  v_decision jsonb;
  v_decisions jsonb := '[]'::jsonb;
  v_microsequence_id text;
  v_source_part_count integer := 0;
  v_participant_part_count integer := 0;
  v_affected_part_count integer := 0;
  v_reference_count integer := 0;
  v_inserted boolean;
  v_result_state jsonb := p_state;
begin
  if p_operation not in ('split_microsequence', 'merge_microsequences') then
    if v_remap is not null then
      raise exception 'continuityRemap só é aceito em split/merge.'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'state', p_state,
      'adjusted', false,
      'affectedPartCount', 0,
      'referenceCount', 0
    );
  end if;
  if jsonb_typeof(v_remap) <> 'object' then
    raise exception 'split/merge exige continuityRemap.' using errcode = '22023';
  end if;
  v_kind := v_remap->>'kind';

  if p_operation = 'split_microsequence' then
    if v_kind <> 'split'
       or not (v_remap ?& array['kind', 'sourceId', 'newId'])
       or exists (
         select 1 from jsonb_object_keys(v_remap) field_name
         where field_name not in ('kind', 'sourceId', 'newId')
       ) then
      raise exception 'continuityRemap de split inválido.' using errcode = '22023';
    end if;
    v_source_id := v_remap->>'sourceId';
    v_new_id := v_remap->>'newId';
    if nullif(btrim(v_source_id), '') is null
       or nullif(btrim(v_new_id), '') is null
       or v_source_id <> btrim(v_source_id)
       or v_new_id <> btrim(v_new_id)
       or char_length(v_source_id) > 240
       or char_length(v_new_id) > 240
       or v_source_id = v_new_id
       or not exists (
         select 1 from jsonb_array_elements(p_changes->'upserts') change
         where change->>'entityType' = 'microsequence'
           and change->>'entityId' = v_source_id
       )
       or not exists (
         select 1 from jsonb_array_elements(p_changes->'upserts') change
         where change->>'entityType' = 'microsequence'
           and change->>'entityId' = v_new_id
           and not (change ? 'version')
       )
       or exists (
         select 1 from jsonb_array_elements(p_changes->'deletes') change
         where change->>'entityType' = 'microsequence'
           and change->>'entityId' in (v_source_id, v_new_id)
       ) then
      raise exception 'continuityRemap não corresponde ao split.'
        using errcode = '22023';
    end if;

    select count(*) into v_source_part_count
    from jsonb_array_elements(p_state->'parts') part
    where exists (
      select 1 from jsonb_array_elements_text(part->'microsequenceIds') listed
      where listed = v_source_id
    );
    if v_source_part_count > 1 then
      raise exception 'Microssequência de origem pertence a mais de uma Parte.'
        using errcode = '23514';
    end if;
    if v_source_part_count = 1 then
      for v_part in select value from jsonb_array_elements(p_state->'parts')
      loop
        v_part_ids := '[]'::jsonb;
        for v_microsequence_id in
          select value from jsonb_array_elements_text(v_part->'microsequenceIds')
        loop
          v_part_ids := v_part_ids || jsonb_build_array(v_microsequence_id);
          if v_microsequence_id = v_source_id then
            v_part_ids := v_part_ids || jsonb_build_array(v_new_id);
            v_reference_count := v_reference_count + 1;
          end if;
        end loop;
        if v_part_ids is distinct from v_part->'microsequenceIds' then
          v_affected_part_count := v_affected_part_count + 1;
        end if;
        v_parts := v_parts || jsonb_build_array(jsonb_set(
          v_part, '{microsequenceIds}', v_part_ids, false
        ));
      end loop;
      v_result_state := jsonb_set(p_state, '{parts}', v_parts, false);
    end if;
  else
    if v_kind <> 'merge'
       or not (v_remap ?& array['kind', 'targetId', 'sourceIds'])
       or exists (
         select 1 from jsonb_object_keys(v_remap) field_name
         where field_name not in ('kind', 'targetId', 'sourceIds')
       )
       or jsonb_typeof(v_remap->'sourceIds') <> 'array' then
      raise exception 'continuityRemap de merge inválido.' using errcode = '22023';
    end if;
    v_target_id := v_remap->>'targetId';
    v_source_ids := v_remap->'sourceIds';
    if nullif(btrim(v_target_id), '') is null
       or v_target_id <> btrim(v_target_id)
       or char_length(v_target_id) > 240
       or jsonb_array_length(v_source_ids) not between 1 and 500
       or exists (
         select 1 from jsonb_array_elements(v_source_ids) source_id
         where jsonb_typeof(source_id) <> 'string'
           or nullif(btrim(source_id #>> '{}'), '') is null
           or source_id #>> '{}' <> btrim(source_id #>> '{}')
           or char_length(source_id #>> '{}') > 240
           or source_id #>> '{}' = v_target_id
       )
       or exists (
         select 1 from jsonb_array_elements_text(v_source_ids) source_id
         group by source_id having count(*) > 1
       )
       or not exists (
         select 1 from jsonb_array_elements(p_changes->'upserts') change
         where change->>'entityType' = 'microsequence'
           and change->>'entityId' = v_target_id
       )
       or exists (
         select 1 from jsonb_array_elements(p_changes->'deletes') change
         where change->>'entityType' = 'microsequence'
           and change->>'entityId' = v_target_id
       )
       or exists (
         select 1 from jsonb_array_elements_text(v_source_ids) source_id
         where not exists (
           select 1 from jsonb_array_elements(p_changes->'deletes') change
           where change->>'entityType' = 'microsequence'
             and change->>'entityId' = source_id
         )
       ) then
      raise exception 'continuityRemap não corresponde ao merge.'
        using errcode = '22023';
    end if;

    select count(*) into v_participant_part_count
    from jsonb_array_elements(p_state->'parts') part
    where exists (
      select 1
      from jsonb_array_elements_text(part->'microsequenceIds') listed
      where listed = v_target_id
         or exists (
           select 1 from jsonb_array_elements_text(v_source_ids) source_id
           where source_id = listed
         )
    );
    if v_participant_part_count > 1 then
      raise exception 'Merge cruza Partes de continuidade distintas.'
        using errcode = '23514';
    end if;
    if v_participant_part_count = 1 then
      for v_part in select value from jsonb_array_elements(p_state->'parts')
      loop
        v_part_ids := '[]'::jsonb;
        v_inserted := false;
        for v_microsequence_id in
          select value from jsonb_array_elements_text(v_part->'microsequenceIds')
        loop
          if v_microsequence_id = v_target_id
             or exists (
               select 1 from jsonb_array_elements_text(v_source_ids) source_id
               where source_id = v_microsequence_id
             ) then
            v_reference_count := v_reference_count + 1;
            if not v_inserted then
              v_part_ids := v_part_ids || jsonb_build_array(v_target_id);
              v_inserted := true;
            end if;
          else
            v_part_ids := v_part_ids || jsonb_build_array(v_microsequence_id);
          end if;
        end loop;
        if v_part_ids is distinct from v_part->'microsequenceIds' then
          v_affected_part_count := v_affected_part_count + 1;
        end if;
        v_parts := v_parts || jsonb_build_array(jsonb_set(
          v_part, '{microsequenceIds}', v_part_ids, false
        ));
      end loop;
      v_result_state := jsonb_set(p_state, '{parts}', v_parts, false);
    end if;
    for v_decision in
      select value from jsonb_array_elements(v_result_state->'decisions')
    loop
      if v_decision->>'entityType' = 'microsequence'
         and exists (
           select 1 from jsonb_array_elements_text(v_source_ids) source_id
           where source_id = v_decision->>'entityId'
         ) then
        v_decision := jsonb_set(
          v_decision, '{entityId}', to_jsonb(v_target_id), false
        );
        v_reference_count := v_reference_count + 1;
      end if;
      v_decisions := v_decisions || jsonb_build_array(v_decision);
    end loop;
    v_result_state := jsonb_set(
      v_result_state, '{decisions}', v_decisions, false
    );
  end if;

  if not private.valid_authoring_continuity_v1(v_result_state) then
    raise exception 'Remapeamento produziria continuidade inválida.'
      using errcode = '23514';
  end if;
  return jsonb_build_object(
    'state', v_result_state,
    'adjusted', v_result_state is distinct from p_state,
    'affectedPartCount', v_affected_part_count,
    'referenceCount', v_reference_count
  );
end;
$function$;

alter function public.commit_authoring_workspace_changes_v5(
  uuid, uuid, text, text, bigint, text, jsonb, jsonb
) rename to commit_authoring_workspace_changes_without_continuity_v1;

create function public.commit_authoring_workspace_changes_v5(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_changes jsonb,
  p_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
  v_workspace private.authoring_workspaces%rowtype;
  v_remap_result jsonb;
  v_state jsonb;
  v_change_summary jsonb;
  v_mandate_consumed boolean := false;
  v_pending_finding_ids uuid[] := '{}'::uuid[];
  v_pending_update_count integer := 0;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'author'
  );
  if p_operation in ('split_microsequence', 'merge_microsequences') then
    if jsonb_typeof(p_summary->'continuityRemap') <> 'object' then
      raise exception 'split/merge exige continuityRemap.' using errcode = '22023';
    end if;
  elsif p_summary ? 'continuityRemap' then
    raise exception 'continuityRemap só é aceito em split/merge.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from private.authoring_workspace_requests request
    where request.owner_id = p_actor_id
      and request.request_id = p_request_id
  ) then
    return public.commit_authoring_workspace_changes_without_continuity_v1(
      p_actor_id, p_workspace_id, p_request_id, p_payload_hash,
      p_expected_revision, p_operation, p_changes, p_summary
    );
  end if;
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  perform private.assert_authoring_commit_mandate_v1(
    p_workspace_id, p_operation, p_changes, p_summary,
    v_workspace.authoring_state
  );
  if v_workspace.authoring_state#>>'{mandate,kind}' = 'repair_findings' then
    select coalesce(
      array_agg(observation.id order by mandated.ordinal), '{}'::uuid[]
    )
    into v_pending_finding_ids
    from jsonb_array_elements_text(
      v_workspace.authoring_state#>'{mandate,findingIds}'
    ) with ordinality mandated(finding_id, ordinal)
    join private.authoring_workspace_observations observation
      on observation.workspace_id = p_workspace_id
     and observation.id = mandated.finding_id::uuid
     and observation.kind = 'audit_finding'
     and observation.status = 'approved'
    where private.authoring_finding_touched_by_commit_v1(
      p_workspace_id, observation.id, p_changes, p_summary
    );
  end if;

  v_result := public.commit_authoring_workspace_changes_without_continuity_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash,
    p_expected_revision, p_operation, p_changes, p_summary
  );
  if coalesce((v_result->>'idempotent')::boolean, false) then
    return v_result;
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  v_state := v_workspace.authoring_state;
  v_remap_result := private.remap_authoring_continuity_v1(
    v_state, p_operation, p_changes, p_summary
  );
  v_state := v_remap_result->'state';

  if v_state#>>'{mandate,kind}' = 'build_part'
     and private.authoring_part_is_materialized_v1(
       p_workspace_id, v_state, v_state#>>'{mandate,targetPartId}'
     ) then
    v_state := jsonb_set(v_state, '{mandate}', 'null'::jsonb, false);
    v_mandate_consumed := true;
  end if;

  if cardinality(v_pending_finding_ids) > 0 then
    update private.authoring_workspace_observations observation
    set pending_correction_request_id = p_request_id,
        pending_revision = (v_result->>'revision')::bigint,
        updated_at = now()
    where observation.workspace_id = p_workspace_id
      and observation.id = any(v_pending_finding_ids)
      and observation.kind = 'audit_finding'
      and observation.status = 'approved';
    get diagnostics v_pending_update_count = row_count;
    if v_pending_update_count <> cardinality(v_pending_finding_ids) then
      raise exception 'Achado mudou durante o commit autoral.'
        using errcode = '40001';
    end if;
  end if;
  update private.authoring_workspaces workspace
  set authoring_state = v_state
  where workspace.id = p_workspace_id;

  v_change_summary := ((v_result->'change') - 'continuityRemap'::text) ||
    jsonb_build_object(
      'continuityAdjusted',
        coalesce((v_remap_result->>'adjusted')::boolean, false)
          or v_mandate_consumed,
      'continuityAffectedPartCount',
        coalesce((v_remap_result->>'affectedPartCount')::integer, 0),
      'continuityReferenceCount',
        coalesce((v_remap_result->>'referenceCount')::integer, 0),
      'continuityMandateConsumed', v_mandate_consumed
    );
  v_result := jsonb_set(v_result, '{change}', v_change_summary, false);
  update private.authoring_workspace_requests request
  set result = v_result
  where request.owner_id = p_actor_id
    and request.request_id = p_request_id
    and request.workspace_id = p_workspace_id;
  update private.authoring_workspace_events event
  set summary = v_change_summary
  where event.workspace_id = p_workspace_id
    and event.revision = (v_result->>'revision')::bigint;
  perform private.prune_authoring_workspace_terminal_findings_v1(
    p_workspace_id
  );
  return v_result;
end;
$function$;

create function public.update_authoring_workspace_continuity_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_state jsonb;
  v_next_revision bigint;
  v_result jsonb;
  v_summary jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'author'
  );
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_operation not in (
       'define_part', 'remove_part', 'record_decision', 'remove_decision',
       'set_mandate', 'clear_mandate', 'record_approved_plan'
     )
     or jsonb_typeof(p_state) <> 'object'
     or octet_length(p_state::text) > 65536
     or pg_column_size(p_state) > 98304 then
    raise exception 'Continuidade autoral inválida.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'authoring-continuity:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(p_actor_id, p_request_id);
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id
    and request.request_id = p_request_id;
  if found then
    if v_request.workspace_id <> p_workspace_id
       or v_request.operation <> 'update_continuity'
       or v_request.payload_hash <> p_payload_hash
       or v_request.result->>'continuityOperation' <> p_operation then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.deleted_at is null
  for update;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using
      errcode = '40001',
      detail = jsonb_build_object(
        'expectedRevision', p_expected_revision,
        'currentRevision', v_workspace.revision
      )::text;
  end if;

  v_state := private.normalize_authoring_continuity_v1(
    p_state, v_workspace.authoring_state, p_expected_revision
  );
  if not private.valid_authoring_continuity_v1(v_state) then
    raise exception 'Estado de continuidade inválido.' using errcode = '22023';
  end if;
  if p_operation = 'record_approved_plan'
     and (
       jsonb_array_length(v_state->'parts') = 0
       or jsonb_array_length(v_state->'decisions') = 0
     ) then
    raise exception 'Plano aprovado exige Partes e decisão.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_state->'parts') part
    cross join lateral jsonb_array_elements_text(
      part->'microsequenceIds'
    ) microsequence_id
    where not exists (
      select 1
      from private.authoring_workspace_entities entity
      where entity.workspace_id = p_workspace_id
        and entity.entity_type = 'microsequence'
        and entity.entity_id = microsequence_id
      )
      and not exists (
        select 1
        from jsonb_array_elements(
          v_workspace.authoring_state->'parts'
        ) previous_part
        cross join lateral jsonb_array_elements_text(
          previous_part->'microsequenceIds'
        ) previous_microsequence_id
        where previous_microsequence_id = microsequence_id
      )
  ) then
    raise exception 'Parte introduz referência a microssequência inexistente.'
      using errcode = 'P0002';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_state->'decisions') decision
    where decision ? 'entityType'
      and not exists (
        select 1
        from private.authoring_workspace_entities entity
        where entity.workspace_id = p_workspace_id
          and entity.entity_type = decision->>'entityType'
          and entity.entity_id = decision->>'entityId'
      )
      and not exists (
        select 1
        from jsonb_array_elements(
          v_workspace.authoring_state->'decisions'
        ) previous_decision
        where previous_decision->>'id' = decision->>'id'
          and previous_decision->>'entityType' = decision->>'entityType'
          and previous_decision->>'entityId' = decision->>'entityId'
      )
  ) then
    raise exception 'Decisão introduz referência a entidade inexistente.'
      using errcode = 'P0002';
  end if;
  if v_state->'mandate' <> 'null'::jsonb
     and (v_state#>>'{mandate,decidedAtRevision}')::bigint > p_expected_revision then
    raise exception 'Revisão do mandato inválida.' using errcode = '22023';
  end if;
  if v_state#>>'{mandate,kind}' = 'repair_findings'
     and (
       v_workspace.authoring_state#>>'{mandate,kind}' is distinct from
         'repair_findings'
       or ((v_workspace.authoring_state->'mandate') - 'decidedAtRevision'::text)
         is distinct from ((v_state->'mandate') - 'decidedAtRevision'::text)
     )
     and exists (
       select 1
       from jsonb_array_elements_text(v_state#>'{mandate,findingIds}') finding_id
       where not exists (
         select 1
         from private.authoring_workspace_observations observation
         where observation.workspace_id = p_workspace_id
           and observation.id = finding_id::uuid
           and observation.kind = 'audit_finding'
           and observation.status = 'approved'
       )
     ) then
    raise exception 'Mandato referencia achado inexistente ou não aprovado.'
      using errcode = '23514';
  end if;
  if v_state#>>'{mandate,kind}' = 'build_part'
     and private.authoring_part_is_materialized_v1(
       p_workspace_id, v_state, v_state#>>'{mandate,targetPartId}'
     ) then
    raise exception 'Parte já materializada não aceita novo mandato de construção.'
      using errcode = '23514';
  end if;

  v_next_revision := v_workspace.revision + 1;
  update private.authoring_workspaces workspace
  set authoring_state = v_state,
      revision = v_next_revision,
      updated_at = now()
  where workspace.id = p_workspace_id
  returning * into v_workspace;

  v_summary := jsonb_build_object(
    'continuityOperation', p_operation,
    'stateVersion', 1,
    'partCount', jsonb_array_length(v_state->'parts'),
    'decisionCount', jsonb_array_length(v_state->'decisions'),
    'mandateId', v_state#>>'{mandate,id}'
  );
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', v_next_revision,
    'continuityOperation', p_operation,
    'stateVersion', 1,
    'partCount', jsonb_array_length(v_state->'parts'),
    'decisionCount', jsonb_array_length(v_state->'decisions'),
    'mandateId', v_state#>>'{mandate,id}',
    'updatedAt', v_workspace.updated_at,
    'idempotent', false
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values(
    p_actor_id, p_request_id, 'update_continuity', p_payload_hash,
    p_workspace_id, v_result
  );
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values(
    p_workspace_id, v_next_revision, 'update_continuity', v_summary, p_actor_id
  );
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id
    and event.id not in (
      select recent.id
      from private.authoring_workspace_events recent
      where recent.workspace_id = p_workspace_id
      order by recent.revision desc
      limit 200
    );
  perform private.prune_authoring_workspace_terminal_findings_v1(
    p_workspace_id
  );
  return v_result;
end;
$function$;

create function public.manage_authoring_workspace_finding_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_finding private.authoring_workspace_observations%rowtype;
  v_entity_type text;
  v_entity_path text[];
  v_resource_target_id text;
  v_finding_id uuid;
  v_decision text;
  v_outcome text;
  v_event_operation text;
  v_required_capability text;
  v_correction_count integer;
  v_resulting_revision bigint;
  v_correction_target jsonb;
  v_correction_change jsonb;
  v_correction_event_summary jsonb;
  v_correction_resource_target jsonb;
  v_changed_card_path jsonb;
  v_correction_path text[];
  v_finding_path text[];
  v_related_target boolean := false;
  v_pending_correction boolean := false;
  v_next_revision bigint;
  v_result jsonb;
  v_summary jsonb;
  v_authoring_state jsonb;
  v_consume_mandate boolean := false;
begin
  v_event_operation := case p_operation
    when 'create' then 'create_finding'
    when 'decide' then 'decide_finding'
    when 'link_correction' then 'link_finding_correction'
    when 'verify' then 'verify_finding'
    when 'delete' then 'delete_finding'
  end;
  v_required_capability := case when p_operation in ('decide', 'link_correction')
    then 'author' else 'review' end;
  if v_event_operation is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 16384 then
    raise exception 'Operação de achado inválida.' using errcode = '22023';
  end if;
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, v_required_capability
  );
  perform private.prune_authoring_workspace_terminal_findings_v1(
    p_workspace_id
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'authoring-finding:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(p_actor_id, p_request_id);
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id
    and request.request_id = p_request_id;
  if found then
    if v_request.workspace_id <> p_workspace_id
       or v_request.operation <> v_event_operation
       or v_request.payload_hash <> p_payload_hash
       or v_request.result->>'findingOperation' <> p_operation then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id
    and workspace.deleted_at is null
  for update;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using
      errcode = '40001',
      detail = jsonb_build_object(
        'expectedRevision', p_expected_revision,
        'currentRevision', v_workspace.revision
      )::text;
  end if;
  v_authoring_state := v_workspace.authoring_state;
  if p_operation in ('create', 'verify')
     and v_authoring_state#>>'{mandate,kind}' is distinct from 'audit' then
    raise exception 'Criação e reauditoria de achados exigem mandato audit vigente.'
      using errcode = '42501';
  end if;

  if p_operation = 'create' then
    if not (p_payload ?& array[
         'entityType', 'entityPath', 'body',
         'category', 'severity', 'proposedRepair'
       ])
       or exists (
         select 1 from jsonb_object_keys(p_payload) field_name
         where field_name not in (
           'entityType', 'entityPath', 'resourceTargetId', 'body',
           'category', 'severity', 'proposedRepair'
         )
       )
       or jsonb_typeof(p_payload->'entityPath') <> 'array' then
      raise exception 'Achado contém campo inválido.' using errcode = '22023';
    end if;
    v_entity_type := btrim(p_payload->>'entityType');
    select coalesce(array_agg(value order by ordinal), '{}') into v_entity_path
    from jsonb_array_elements_text(p_payload->'entityPath')
      with ordinality item(value, ordinal);
    v_resource_target_id := nullif(
      btrim(coalesce(p_payload->>'resourceTargetId', '')), ''
    );
    if v_entity_type not in (
         'workspace', 'course', 'module', 'lesson',
         'microsequence', 'card', 'resource'
       )
       or cardinality(v_entity_path) <> (case v_entity_type
         when 'workspace' then 0 when 'course' then 1 when 'module' then 2
         when 'lesson' then 3 when 'microsequence' then 4 else 5 end)
       or exists (
         select 1 from unnest(v_entity_path) part
         where nullif(btrim(part), '') is null or char_length(part) > 240
       )
       or ((v_entity_type = 'resource') <> (v_resource_target_id is not null))
       or char_length(coalesce(v_resource_target_id, '')) > 240
       or nullif(btrim(p_payload->>'body'), '') is null
       or char_length(p_payload->>'body') > 1000
       or nullif(btrim(p_payload->>'category'), '') is null
       or p_payload->>'category' <> btrim(p_payload->>'category')
       or char_length(p_payload->>'category') > 64
       or p_payload->>'severity' not in ('low', 'medium', 'high', 'critical')
       or nullif(btrim(p_payload->>'proposedRepair'), '') is null
       or char_length(p_payload->>'proposedRepair') > 1000 then
      raise exception 'Achado inválido.' using errcode = '22023';
    end if;
    if not private.authoring_observation_target_exists_v1(
      p_workspace_id, v_entity_type, v_entity_path, v_resource_target_id
    ) then
      raise exception 'Alvo do achado não encontrado.' using errcode = 'P0002';
    end if;
    if not private.authoring_audit_target_in_part_v1(
      p_workspace_id, v_authoring_state, v_entity_type, v_entity_path
    ) then
      raise exception 'Alvo do achado escapa da Parte autorizada para auditoria.'
        using errcode = '42501';
    end if;
    insert into private.authoring_workspace_observations(
      workspace_id, author_id, kind, entity_type, entity_path,
      resource_target_id, body, category, severity, status,
      proposed_repair, audit_revision, audit_part_id
    ) values(
      p_workspace_id, p_actor_id, 'audit_finding', v_entity_type,
      v_entity_path, v_resource_target_id, btrim(p_payload->>'body'),
      p_payload->>'category', p_payload->>'severity', 'open',
      btrim(p_payload->>'proposedRepair'), p_expected_revision,
      v_authoring_state#>>'{mandate,targetPartId}'
    ) returning * into v_finding;
    v_finding_id := v_finding.id;
    v_summary := jsonb_build_object(
      'findingId', v_finding_id,
      'findingOperation', p_operation,
      'entityType', v_entity_type,
      'category', v_finding.category,
      'severity', v_finding.severity,
      'status', v_finding.status,
      'auditRevision', v_finding.audit_revision
    );
  else
    if not (p_payload ? 'findingId')
       or coalesce(p_payload->>'findingId', '') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception 'findingId inválido.' using errcode = '22023';
    end if;
    v_finding_id := (p_payload->>'findingId')::uuid;
    select * into v_finding
    from private.authoring_workspace_observations observation
    where observation.workspace_id = p_workspace_id
      and observation.id = v_finding_id
      and observation.kind = 'audit_finding'
    for update;
    if not found then
      raise exception 'Achado não encontrado.' using errcode = 'P0002';
    end if;
    if p_operation = 'verify'
       and not private.authoring_audit_target_in_part_v1(
         p_workspace_id, v_authoring_state,
         v_finding.entity_type, v_finding.entity_path
       )
       and not (
         v_finding.audit_part_id is not null
         and v_finding.audit_part_id =
           v_authoring_state#>>'{mandate,targetPartId}'
         and not private.authoring_observation_target_available_v1(
           p_workspace_id,
           v_finding.entity_type,
           private.current_authoring_observation_path_v1(
             p_workspace_id, v_finding.entity_type, v_finding.entity_path
           ),
           v_finding.resource_target_id
         )
       ) then
      raise exception 'Reauditoria escapa da Parte autorizada.'
        using errcode = '42501';
    end if;

    if p_operation = 'decide' then
      if exists (
        select 1 from jsonb_object_keys(p_payload) field_name
        where field_name not in ('findingId', 'decision')
      ) then
        raise exception 'Decisão de achado inválida.' using errcode = '22023';
      end if;
      v_decision := p_payload->>'decision';
      if v_decision not in ('approve', 'reject') or v_finding.status <> 'open' then
        raise exception 'Decisão de achado inválida.' using errcode = '23514';
      end if;
      update private.authoring_workspace_observations observation
      set status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
          pending_correction_request_id = null,
          pending_revision = null,
          correction_request_id = null,
          resulting_revision = null,
          verification = null,
          verified_revision = null,
          updated_at = now()
      where observation.id = v_finding_id
      returning * into v_finding;
      v_consume_mandate := v_decision = 'reject';
    elsif p_operation = 'link_correction' then
      if exists (
        select 1 from jsonb_object_keys(p_payload) field_name
        where field_name not in ('findingId', 'correctionRequestId')
      )
         or coalesce(p_payload->>'correctionRequestId', '') !~
           '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
        raise exception 'Vínculo de correção inválido.' using errcode = '23514';
      end if;
      if v_finding.status <> 'approved'
         or v_workspace.authoring_state#>>'{mandate,kind}' <> 'repair_findings'
         or not exists (
           select 1 from jsonb_array_elements_text(coalesce(
             v_workspace.authoring_state#>'{mandate,findingIds}', '[]'::jsonb
           )) mandated(finding_id)
           where mandated.finding_id = v_finding_id::text
         ) then
        raise exception 'Vínculo de correção inválido.' using errcode = '23514';
      end if;
      if v_finding.pending_correction_request_id is not null
         and v_finding.pending_correction_request_id <>
           p_payload->>'correctionRequestId' then
        raise exception 'A correção informada não corresponde ao handoff pendente.'
          using errcode = '23514';
      end if;
      v_pending_correction :=
        v_finding.pending_correction_request_id =
          p_payload->>'correctionRequestId'
        and v_finding.pending_revision is not null;
      if v_pending_correction then
        v_resulting_revision := v_finding.pending_revision;
        if v_resulting_revision <= v_finding.audit_revision
           or v_resulting_revision > p_expected_revision then
          raise exception 'Handoff de correção pendente é inválido.'
            using errcode = '23514';
        end if;
      else
        select count(*), max(event.revision),
        min((request.result->'change')::text)::jsonb,
        min(event.summary::text)::jsonb
      into v_correction_count, v_resulting_revision,
        v_correction_change, v_correction_event_summary
      from private.authoring_workspace_requests request
      join private.authoring_workspace_events event
        on event.workspace_id = request.workspace_id
       and event.revision = case
         when request.result->>'revision' ~ '^[1-9][0-9]{0,18}$'
           then (request.result->>'revision')::bigint
         else null
       end
       and event.operation = request.operation
      where request.workspace_id = p_workspace_id
        and request.request_id = p_payload->>'correctionRequestId'
        and request.operation in (
          'create_structure', 'update_metadata', 'save_microsequence_cards',
          'save_card', 'update_brief', 'copy_entity', 'rename_entity',
          'move_entity', 'delete_entity', 'merge_microsequences',
          'split_microsequence', 'promote_module', 'demote_course',
          'import_course'
        )
        and request.result->>'revision' ~ '^[1-9][0-9]{0,18}$'
        and jsonb_typeof(request.result->'change') = 'object'
        and jsonb_typeof(event.summary) = 'object'
        and request.result->'change' = event.summary;
      if v_correction_count <> 1
         or v_resulting_revision is null
         or v_resulting_revision <= v_finding.audit_revision
         or v_resulting_revision > p_expected_revision then
        raise exception 'Correção confirmada não encontrada neste workspace.'
          using errcode = 'P0002';
      end if;
      if v_correction_event_summary is distinct from v_correction_change then
        raise exception 'Alvo da correção confirmada é inválido.'
          using errcode = '22023';
      end if;
      if jsonb_typeof(
           v_correction_event_summary->'targetPathsTruncated'
         ) is distinct from 'boolean'
         or coalesce(
           (v_correction_event_summary->>'targetPathsTruncated')::boolean,
           true
         ) then
        raise exception 'Correção truncada não prova todos os seus alvos.'
          using errcode = '23514';
      end if;
      v_finding_path := coalesce(
        private.current_authoring_observation_path_v1(
          p_workspace_id, v_finding.entity_type, v_finding.entity_path
        ),
        v_finding.entity_path
      );
      if jsonb_typeof(v_correction_change->'targetPaths') = 'array'
         and jsonb_array_length(v_correction_change->'targetPaths') > 0 then
        v_correction_target := v_correction_change->'targetPaths';
      elsif jsonb_typeof(v_correction_change->'targetPath') = 'array' then
        v_correction_target := jsonb_build_array(
          v_correction_change->'targetPath'
        );
      else
        raise exception 'Correção confirmada não declara seus alvos.'
          using errcode = '22023';
      end if;
      v_related_target := false;
      for v_correction_change in
        select value from jsonb_array_elements(v_correction_target)
      loop
        if jsonb_typeof(v_correction_change) <> 'array' then
          raise exception 'Alvo da correção confirmada é inválido.'
            using errcode = '22023';
        end if;
        begin
          select coalesce(array_agg(value order by ordinal), '{}')
          into v_correction_path
          from jsonb_array_elements_text(v_correction_change)
            with ordinality target(value, ordinal);
        exception
          when others then
            raise exception 'Alvo da correção confirmada é inválido.'
              using errcode = '22023';
        end;
        if exists (
             select 1 from unnest(v_correction_path) path_part
             where nullif(btrim(path_part), '') is null
               or char_length(path_part) > 240
           ) then
          raise exception 'Alvo da correção confirmada é inválido.'
            using errcode = '22023';
        end if;
        v_related_target := v_related_target
          or private.authoring_observation_paths_related_v1(
            v_finding_path, v_correction_path
          );
      end loop;
      if not v_related_target then
        raise exception 'A correção confirmada não alcança o alvo do achado.'
          using errcode = '23514';
      end if;
      if v_finding.entity_type = 'card' then
        if jsonb_typeof(
             v_correction_event_summary->'changedCardPaths'
           ) is distinct from 'array' then
          raise exception 'Correção de card não declara recorte completo.'
            using errcode = '23514';
        end if;
        if jsonb_array_length(
             v_correction_event_summary->'changedCardPaths'
           ) not between 1 and 20
           or jsonb_typeof(
             v_correction_event_summary->'changedCardPathsTruncated'
           ) is distinct from 'boolean'
           or coalesce(
             (v_correction_event_summary->>'changedCardPathsTruncated')::boolean,
             true
           )
        then
          raise exception 'Correção de card não declara recorte completo.'
            using errcode = '23514';
        end if;
        for v_changed_card_path in
          select value from jsonb_array_elements(
            v_correction_event_summary->'changedCardPaths'
          )
        loop
          if jsonb_typeof(v_changed_card_path) <> 'array'
             or exists (
               select 1 from jsonb_array_elements(v_changed_card_path) path_part
               where jsonb_typeof(path_part) <> 'string'
             ) then
            raise exception 'Caminho de card corrigido é inválido.'
              using errcode = '22023';
          end if;
        end loop;
        if not exists (
          select 1
          from jsonb_array_elements(
            v_correction_event_summary->'changedCardPaths'
          ) card_path
          where card_path = to_jsonb(v_finding_path)
        ) then
          raise exception 'A correção confirmada não alterou o card do achado.'
            using errcode = '23514';
        end if;
      end if;
      if v_finding.entity_type = 'resource' then
        if jsonb_typeof(
             v_correction_event_summary->'resourceTargets'
           ) is distinct from 'array' then
          raise exception 'A correção confirmada não declara seus resources.'
            using errcode = '23514';
        end if;
        if jsonb_array_length(
             v_correction_event_summary->'resourceTargets'
           ) not between 1 and 10
           or jsonb_typeof(
             v_correction_event_summary->'resourceTargetsTruncated'
           ) is distinct from 'boolean'
           or coalesce(
             (v_correction_event_summary->>'resourceTargetsTruncated')::boolean,
             true
           )
        then
          raise exception 'A correção confirmada não declara seus resources.'
            using errcode = '23514';
        end if;
        for v_correction_resource_target in
          select value from jsonb_array_elements(
            v_correction_event_summary->'resourceTargets'
          )
        loop
          if jsonb_typeof(v_correction_resource_target) <> 'object' then
            raise exception 'Declaração de resource corrigido é inválida.'
              using errcode = '22023';
          end if;
          if not (v_correction_resource_target ?& array[
               'cardPath', 'targetId'
             ])
             or exists (
               select 1
               from jsonb_object_keys(v_correction_resource_target) field_name
               where field_name not in ('cardPath', 'targetId')
             )
             or jsonb_typeof(
               v_correction_resource_target->'cardPath'
             ) <> 'array'
             or jsonb_typeof(
               v_correction_resource_target->'targetId'
             ) <> 'string'
             or char_length(
               v_correction_resource_target->>'targetId'
             ) > 240 then
            raise exception 'Declaração de resource corrigido é inválida.'
              using errcode = '22023';
          end if;
        end loop;
        if not exists (
          select 1
          from jsonb_array_elements(
            v_correction_event_summary->'resourceTargets'
          ) resource_target
          where resource_target->>'targetId' =
              v_finding.resource_target_id
            and resource_target->'cardPath' = to_jsonb(v_finding_path)
        ) then
          raise exception 'A correção confirmada não alcança o resource do achado.'
            using errcode = '23514';
        end if;
      end if;
      end if;
      update private.authoring_workspace_observations observation
      set status = 'repaired',
          correction_request_id = p_payload->>'correctionRequestId',
          resulting_revision = v_resulting_revision,
          pending_correction_request_id = null,
          pending_revision = null,
          verification = null,
          verified_revision = null,
          updated_at = now()
      where observation.id = v_finding_id
      returning * into v_finding;
      v_consume_mandate := true;
    elsif p_operation = 'verify' then
      if exists (
        select 1 from jsonb_object_keys(p_payload) field_name
        where field_name not in ('findingId', 'outcome', 'verification')
      ) then
        raise exception 'Verificação de achado inválida.' using errcode = '22023';
      end if;
      v_outcome := p_payload->>'outcome';
      if v_outcome not in ('resolved', 'still_open')
         or v_finding.status <> 'repaired'
         or nullif(btrim(p_payload->>'verification'), '') is null
         or char_length(p_payload->>'verification') > 1000 then
        raise exception 'Verificação de achado inválida.' using errcode = '23514';
      end if;
      update private.authoring_workspace_observations observation
      set status = case when v_outcome = 'resolved' then 'resolved' else 'open' end,
          pending_correction_request_id = null,
          pending_revision = null,
          verification = btrim(p_payload->>'verification'),
          verified_revision = p_expected_revision,
          updated_at = now()
      where observation.id = v_finding_id
      returning * into v_finding;
    else
      if exists (
        select 1 from jsonb_object_keys(p_payload) field_name
        where field_name <> 'findingId'
      ) then
        raise exception 'Exclusão de achado inválida.' using errcode = '22023';
      end if;
      delete from private.authoring_workspace_observations observation
      where observation.id = v_finding_id;
      v_finding.status := null;
      v_consume_mandate := true;
    end if;

    if v_consume_mandate
       and v_authoring_state#>>'{mandate,kind}' = 'repair_findings' then
      select case
        when count(*) = 0 then jsonb_set(
          v_authoring_state, '{mandate}', 'null'::jsonb, false
        )
        else jsonb_set(
          v_authoring_state,
          '{mandate,findingIds}',
          jsonb_agg(to_jsonb(finding_id) order by ordinal),
          false
        )
      end
      into v_authoring_state
      from jsonb_array_elements_text(
        v_authoring_state#>'{mandate,findingIds}'
      ) with ordinality listed(finding_id, ordinal)
      where finding_id <> v_finding_id::text;
    end if;

    v_summary := jsonb_build_object(
      'findingId', v_finding_id,
      'findingOperation', p_operation,
      'status', coalesce(v_finding.status, 'deleted'),
      'correctionRequestId', v_finding.correction_request_id,
      'resultingRevision', v_finding.resulting_revision,
      'verifiedRevision', v_finding.verified_revision
    );
  end if;

  v_next_revision := v_workspace.revision + 1;
  update private.authoring_workspaces workspace
  set revision = v_next_revision,
      authoring_state = v_authoring_state,
      updated_at = now()
  where workspace.id = p_workspace_id
  returning * into v_workspace;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'findingId', v_finding_id,
    'findingOperation', p_operation,
    'status', coalesce(v_finding.status, 'deleted'),
    'revision', v_next_revision,
    'updatedAt', v_workspace.updated_at,
    'idempotent', false
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values(
    p_actor_id, p_request_id, v_event_operation, p_payload_hash,
    p_workspace_id, v_result
  );
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values(
    p_workspace_id, v_next_revision, v_event_operation, v_summary, p_actor_id
  );
  delete from private.authoring_workspace_events event
  where event.workspace_id = p_workspace_id
    and event.id not in (
      select recent.id
      from private.authoring_workspace_events recent
      where recent.workspace_id = p_workspace_id
      order by recent.revision desc
      limit 200
    );
  perform private.prune_authoring_workspace_terminal_findings_v1(
    p_workspace_id
  );
  return v_result;
end;
$function$;

create function private.authoring_comment_correction_revision_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_card_id text,
  p_entity_path text[],
  p_comment_created_at timestamptz,
  p_correction_request_id text
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_current_path text[];
  v_count integer;
  v_revision bigint;
  v_change jsonb;
  v_event_summary jsonb;
  v_candidate jsonb;
  v_candidate_path text[];
  v_reaches_card boolean := false;
begin
  v_current_path := private.current_authoring_observation_path_v1(
    p_workspace_id, 'card', array[p_card_id]
  );
  if v_current_path is null or v_current_path is distinct from p_entity_path then
    raise exception 'O caminho informado não identifica o card observado.'
      using errcode = '23514';
  end if;
  select count(*), max(event.revision),
    min((request.result->'change')::text)::jsonb,
    min(event.summary::text)::jsonb
  into v_count, v_revision, v_change, v_event_summary
  from private.authoring_workspace_requests request
  join private.authoring_workspace_events event
    on event.workspace_id = request.workspace_id
   and event.revision = case
     when request.result->>'revision' ~ '^[1-9][0-9]{0,18}$'
       then (request.result->>'revision')::bigint
     else null
   end
   and event.operation = request.operation
   and event.actor_id = p_actor_id
  join private.authoring_workspaces workspace
    on workspace.id = request.workspace_id
   and workspace.deleted_at is null
   and workspace.revision >= event.revision
  where request.owner_id = p_actor_id
    and request.workspace_id = p_workspace_id
    and request.request_id = p_correction_request_id
    and request.operation in (
      'create_structure', 'update_metadata', 'save_microsequence_cards',
      'save_card', 'copy_entity', 'rename_entity', 'move_entity',
      'delete_entity', 'merge_microsequences', 'split_microsequence',
      'promote_module', 'demote_course', 'import_course'
    )
    and request.result->>'revision' ~ '^[1-9][0-9]{0,18}$'
    and (request.result->>'revision')::bigint > 1
    and event.created_at > p_comment_created_at
    and jsonb_typeof(request.result->'change') = 'object'
    and request.result->'change' = event.summary;
  if v_count <> 1 or v_revision is null then
    raise exception 'Correção autoral posterior não encontrada.'
      using errcode = 'P0002';
  end if;
  if v_event_summary is distinct from v_change
     or jsonb_typeof(v_change->'targetPaths') is distinct from 'array'
     or jsonb_typeof(v_change->'changedCardPaths') is distinct from 'array'
     or jsonb_typeof(v_change->'targetPathsTruncated') is distinct from 'boolean'
     or (v_change->>'targetPathsTruncated')::boolean
     or jsonb_typeof(v_change->'changedCardPathsTruncated') is distinct from 'boolean'
     or (v_change->>'changedCardPathsTruncated')::boolean then
    raise exception 'A correção não possui evidência completa de seus alvos.'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_change->'changedCardPaths') card_path
    where card_path = to_jsonb(v_current_path)
  ) then
    v_reaches_card := true;
  end if;
  if not v_reaches_card then
    for v_candidate in
      select value from jsonb_array_elements(v_change->'targetPaths')
    loop
      v_candidate_path := private.authoring_jsonb_text_path_v1(v_candidate);
      if v_candidate_path is not null
         and cardinality(v_candidate_path) <= cardinality(v_current_path)
         and v_candidate_path = v_current_path[1:cardinality(v_candidate_path)] then
        v_reaches_card := true;
        exit;
      end if;
    end loop;
  end if;
  if not v_reaches_card then
    raise exception 'A correção autoral não alcança o card observado.'
      using errcode = '23514';
  end if;
  return v_revision;
end;
$function$;

alter function private.manage_educational_workspace_comment_v1(
  uuid, text, uuid, uuid, text, jsonb
) rename to manage_educational_workspace_comment_without_link_validation_v1;

create function private.manage_educational_workspace_comment_v1(
  p_actor_id uuid,
  p_request_id text,
  p_workspace_id uuid,
  p_comment_id uuid,
  p_operation text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions
as $function$
declare
  v_thread private.trail_observation_threads%rowtype;
  v_existing_receipt private.educational_workspace_receipts%rowtype;
  v_path text[];
  v_resulting_revision bigint;
  v_result jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  if p_operation = 'set_comment_status'
     and p_payload->>'status' = 'incorporated' then
    raise exception 'incorporated exige vínculo com correção autoral validada.'
      using errcode = '23514';
  end if;
  if p_operation <> 'link_comment_correction' then
    return private.manage_educational_workspace_comment_without_link_validation_v1(
      p_actor_id, p_request_id, p_workspace_id, p_comment_id,
      p_operation, p_payload
    );
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'workspace-comment:' || p_actor_id::text || ':' || p_request_id, 0
  ));
  select * into v_existing_receipt
  from private.educational_workspace_receipts receipt
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  if found then
    return private.manage_educational_workspace_comment_without_link_validation_v1(
      p_actor_id, p_request_id, p_workspace_id, p_comment_id,
      p_operation, p_payload
    );
  end if;
  if jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(p_payload) field
       where field not in ('correctionRequestId', 'entityPath')
     )
     or coalesce(p_payload->>'correctionRequestId', '') !~
       '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or jsonb_typeof(p_payload->'entityPath') is distinct from 'array'
     or jsonb_array_length(p_payload->'entityPath') <> 5 then
    raise exception 'Vínculo de correção inválido.' using errcode = '22023';
  end if;
  begin
    select array_agg(value order by ordinal) into v_path
    from jsonb_array_elements_text(p_payload->'entityPath')
      with ordinality item(value, ordinal);
  exception when others then
    raise exception 'Vínculo de correção inválido.' using errcode = '22023';
  end;
  if exists (
    select 1 from unnest(v_path) value
    where nullif(btrim(value), '') is null or char_length(value) > 240
  ) then
    raise exception 'Vínculo de correção inválido.' using errcode = '22023';
  end if;
  select thread.* into v_thread
  from private.trail_observation_threads thread
  join private.trail_items item on item.id = thread.trail_item_id
  join public.trail_personal_states state_row
    on state_row.user_id = thread.user_id
   and state_row.trail_item_id = thread.trail_item_id
  where thread.id = p_comment_id
    and item.workspace_id = p_workspace_id
    and state_row.state#>array['observations', thread.card_id] is not null
  for update of thread;
  if not found then
    raise exception 'Observação inexistente ou inacessível.' using errcode = 'P0002';
  end if;
  v_resulting_revision := private.authoring_comment_correction_revision_v1(
    p_actor_id, p_workspace_id, v_thread.card_id, v_path,
    v_thread.created_at, p_payload->>'correctionRequestId'
  );
  v_result := private.manage_educational_workspace_comment_without_link_validation_v1(
    p_actor_id, p_request_id, p_workspace_id, p_comment_id,
    p_operation, p_payload
  ) || jsonb_build_object('resultingRevision', v_resulting_revision);
  update private.trail_observation_threads thread
  set correction_resulting_revision = v_resulting_revision
  where thread.id = p_comment_id;
  update private.educational_workspace_receipts receipt
  set result = v_result
  where receipt.actor_id = p_actor_id and receipt.request_id = p_request_id;
  return v_result;
end;
$function$;

revoke all on function private.valid_authoring_continuity_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.educational_workspace_effective_role_v1(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_authoring_continuity_v1(jsonb, jsonb, bigint)
  from public, anon, authenticated, service_role;
revoke all on function private.current_authoring_observation_path_v1(uuid, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_observation_target_exists_v1(uuid, text, text[], text)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_observation_target_available_v1(uuid, text, text[], text)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_audit_target_in_part_v1(uuid, jsonb, text, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_comment_correction_revision_v1(
  uuid, uuid, text, text[], timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function private.manage_educational_workspace_comment_without_link_validation_v1(
  uuid, text, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.manage_educational_workspace_comment_v1(
  uuid, text, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.authoring_observation_paths_related_v1(text[], text[])
  from public, anon, authenticated, service_role;
revoke all on function private.prune_authoring_workspace_terminal_findings_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.prune_authoring_workspace_observation_receipts_v1(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_part_is_materialized_v1(uuid, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_jsonb_text_path_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.authoring_post_change_path_v1(
  uuid, jsonb, text, text
) from public, anon, authenticated, service_role;
revoke all on function private.authoring_finding_touched_by_commit_v1(
  uuid, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.assert_authoring_commit_mandate_v1(
  uuid, text, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.remap_authoring_continuity_v1(jsonb, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_authoring_workspace_changes_without_continuity_v1(
  uuid, uuid, text, text, bigint, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.commit_authoring_workspace_changes_v5(
  uuid, uuid, text, text, bigint, text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function private.list_authoring_workspace_observations_v1(
  uuid, uuid, integer, timestamptz, uuid, text[], text[], text[]
) from public, anon, authenticated, service_role;
revoke all on function public.list_authoring_workspace_observations_for_actor_v1(
  uuid, uuid, integer, timestamptz, uuid, text[], text[], text[]
) from public, anon, authenticated;
revoke all on function public.get_authoring_workspace_continuity_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.update_authoring_workspace_continuity_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) from public, anon, authenticated;
revoke all on function public.manage_authoring_workspace_finding_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) from public, anon, authenticated;

grant execute on function public.list_authoring_workspace_observations_for_actor_v1(
  uuid, uuid, integer, timestamptz, uuid, text[], text[], text[]
) to service_role;
grant execute on function public.get_authoring_workspace_continuity_v1(uuid, uuid)
  to service_role;
grant execute on function public.update_authoring_workspace_continuity_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) to service_role;
grant execute on function public.manage_authoring_workspace_finding_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) to service_role;
grant execute on function public.commit_authoring_workspace_changes_v5(
  uuid, uuid, text, text, bigint, text, jsonb, jsonb
) to service_role;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_without_authoring_continuity_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with base as (
    select public.get_aralearn_runtime_manifest_without_authoring_continuity_v1()
      as value
  )
  select jsonb_set(
    jsonb_set(base.value, '{schemaRevision}', '"20260809010000"'::jsonb),
    '{features}',
    ((base.value->'features') - 'resumable-authoring-continuity-v1'::text)
      || jsonb_build_array('resumable-authoring-continuity-v1')
  )
  from base
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_without_authoring_continuity_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
