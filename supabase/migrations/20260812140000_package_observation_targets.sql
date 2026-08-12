begin;

create or replace function private.authoring_observation_target_exists_v1(
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
  v_slot text;
  v_instance_id text;
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
  v_slot := split_part(p_resource_target_id, ':', 1);
  v_instance_id := substr(p_resource_target_id, char_length(v_slot) + 2);
  if nullif(v_instance_id, '') is null
     or v_slot not in ('content', 'response', 'feedback') then
    return false;
  end if;
  if v_slot = 'response' then
    return jsonb_typeof(v_card->'response') = 'object'
      and v_card->'response'->>'id' = v_instance_id
      and nullif(btrim(v_card->'response'->>'package'), '') is not null;
  end if;
  if v_slot = 'content' then
    return jsonb_typeof(v_card->'content') = 'array'
      and exists (
        select 1 from jsonb_array_elements(v_card->'content') instance
        where instance->>'id' = v_instance_id
          and nullif(btrim(instance->>'package'), '') is not null
      );
  end if;
  return jsonb_typeof(v_card->'feedback') = 'array'
    and exists (
      select 1 from jsonb_array_elements(v_card->'feedback') instance
      where instance->>'id' = v_instance_id
        and nullif(btrim(instance->>'package'), '') is not null
    );
end;
$function$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_package_observation_targets_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_package_observation_targets_v1(),
    '{schemaRevision}',
    '"20260812140000"'::jsonb
  ) || jsonb_build_object(
    'features',
    public.get_aralearn_runtime_manifest_before_package_observation_targets_v1()->'features'
      || '["package-observation-targets-v1"]'::jsonb
  )
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_before_package_observation_targets_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
