begin;

create or replace function public.list_authoring_workspace_microsequence_cards_v5(
  p_owner_id uuid,
  p_workspace_id uuid,
  p_microsequence_path text[],
  p_limit integer default 50,
  p_after_position integer default null,
  p_after_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_revision bigint;
  v_items jsonb;
  v_has_more boolean;
  v_last_position integer;
  v_last_id text;
begin
  perform private.require_workspace_actor_v5(p_owner_id, 'authoring:read');
  if p_workspace_id is null
     or p_microsequence_path is null
     or cardinality(p_microsequence_path) <> 4
     or exists (
       select 1 from unnest(p_microsequence_path) as path_part(value)
       where path_part.value is null
          or btrim(path_part.value) = ''
          or path_part.value <> btrim(path_part.value)
          or char_length(path_part.value) > 240
     )
     or p_limit is null
     or p_limit not between 1 and 100
     or ((p_after_position is null) <> (p_after_id is null))
     or (p_after_position is not null and p_after_position < 1)
     or (
       p_after_id is not null
       and (
         btrim(p_after_id) = ''
         or p_after_id <> btrim(p_after_id)
         or char_length(p_after_id) > 240
       )
     ) then
    raise exception 'Paginação ou caminho de cards inválido.'
      using errcode = '22023';
  end if;

  select workspace.revision
  into v_revision
  from private.authoring_workspaces workspace
  join private.authoring_workspace_entities course
    on course.workspace_id = workspace.id
   and course.entity_type = 'course'
   and course.entity_id = p_microsequence_path[1]
   and course.parent_type = 'project'
   and course.parent_id = 'project'
  join private.authoring_workspace_entities module_value
    on module_value.workspace_id = workspace.id
   and module_value.entity_type = 'module'
   and module_value.entity_id = p_microsequence_path[2]
   and module_value.parent_type = 'course'
   and module_value.parent_id = course.entity_id
  join private.authoring_workspace_entities lesson
    on lesson.workspace_id = workspace.id
   and lesson.entity_type = 'lesson'
   and lesson.entity_id = p_microsequence_path[3]
   and lesson.parent_type = 'module'
   and lesson.parent_id = module_value.entity_id
  join private.authoring_workspace_entities microsequence
    on microsequence.workspace_id = workspace.id
   and microsequence.entity_type = 'microsequence'
   and microsequence.entity_id = p_microsequence_path[4]
   and microsequence.parent_type = 'lesson'
   and microsequence.parent_id = lesson.entity_id
  where workspace.id = p_workspace_id
    and workspace.owner_id = p_owner_id
    and workspace.deleted_at is null;

  if not found then
    raise exception 'Microssequência inexistente no workspace.'
      using errcode = 'P0002';
  end if;

  with candidates as materialized (
    select
      card.entity_id,
      card.position,
      card.content,
      left(regexp_replace(
        coalesce(nullif(btrim(card.content ->> 'title'), ''), 'Card ' || card.entity_id),
        '[[:space:]]+',
        ' ',
        'g'
      ), 240) as summary,
      (
        select coalesce(jsonb_agg(package_id order by first_position), '[]'::jsonb)
        from (
          select
            instance.value ->> 'package' as package_id,
            min(instance.ordinality) as first_position
          from jsonb_array_elements(
            coalesce(card.content -> 'content', '[]'::jsonb)
            || case
              when jsonb_typeof(card.content -> 'response') = 'object'
                then jsonb_build_array(card.content -> 'response')
              else '[]'::jsonb
            end
            || coalesce(card.content -> 'feedback', '[]'::jsonb)
          ) with ordinality as instance(value, ordinality)
          where nullif(btrim(instance.value ->> 'package'), '') is not null
          group by instance.value ->> 'package'
        ) ordered_packages
      ) as packages
    from private.authoring_workspace_entities card
    where card.workspace_id = p_workspace_id
      and card.entity_type = 'card'
      and card.parent_type = 'microsequence'
      and card.parent_id = p_microsequence_path[4]
      and (
        p_after_position is null
        or (card.position, card.entity_id) > (p_after_position, p_after_id)
      )
    order by card.position, card.entity_id
    limit p_limit + 1
  ),
  page as (
    select * from candidates
    order by position, entity_id
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', page.entity_id,
      'position', page.position,
      'role', page.content ->> 'role',
      'packages', page.packages,
      'summary', page.summary
    ) order by page.position, page.entity_id), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    (
      select page.position from page
      order by page.position desc, page.entity_id desc
      limit 1
    ),
    (
      select page.entity_id from page
      order by page.position desc, page.entity_id desc
      limit 1
    )
  into v_items, v_has_more, v_last_position, v_last_id
  from page;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', v_revision,
    'microsequencePath', to_jsonb(p_microsequence_path),
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterId', v_last_id
    ) else null end
  );
end;
$function$;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_package_card_list_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_package_card_list_v1(),
    '{schemaRevision}',
    '"20260812132000"'::jsonb
  ) || jsonb_build_object(
    'features',
    public.get_aralearn_runtime_manifest_before_package_card_list_v1()->'features'
      || '["package-card-list-projection-v1"]'::jsonb
  )
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_before_package_card_list_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
