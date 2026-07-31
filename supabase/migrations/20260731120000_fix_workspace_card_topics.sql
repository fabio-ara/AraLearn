begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-fix-workspace-card-topics-v5',
  0
));

-- `topics` representa filhos somente na linha de lesson. Em cards, a mesma
-- chave contém tags ou referências pedagógicas válidas do contrato v4.
alter table private.authoring_workspace_entities
  drop constraint if exists authoring_workspace_entities_content_v5;

alter table private.authoring_workspace_entities
  add constraint authoring_workspace_entities_content_v5 check (
    jsonb_typeof(content) = 'object'
    and not (content ? 'id')
    and not (content ? 'position')
    and not (entity_type = 'project' and content ? 'courses')
    and not (entity_type = 'course' and content ? 'modules')
    and not (entity_type = 'module' and content ? 'lessons')
    and not (
      entity_type = 'lesson'
      and (content ? 'topics' or content ? 'microsequences')
    )
    and not (entity_type = 'microsequence' and content ? 'cards')
    and pg_column_size(content) <= 1048576
  );

create or replace function private.validate_authoring_workspace_entity_content_v5()
returns trigger
language plpgsql
set search_path = pg_catalog, private
as $function$
declare
  v_field text;
  v_path text;
  v_message text;
begin
  v_field := case
    when new.content ? 'id' then 'id'
    when new.content ? 'position' then 'position'
    when new.entity_type = 'project' and new.content ? 'courses' then 'courses'
    when new.entity_type = 'course' and new.content ? 'modules' then 'modules'
    when new.entity_type = 'module' and new.content ? 'lessons' then 'lessons'
    when new.entity_type = 'lesson' and new.content ? 'topics' then 'topics'
    when new.entity_type = 'lesson' and new.content ? 'microsequences'
      then 'microsequences'
    when new.entity_type = 'microsequence' and new.content ? 'cards' then 'cards'
    else null
  end;
  if v_field is null then
    return new;
  end if;

  v_path := format(
    'entities[%s:%s].content.%s',
    new.entity_type,
    new.entity_id,
    v_field
  );
  v_message := format(
    'O campo %s pertence à estrutura da entidade %s, não ao seu conteúdo atômico.',
    v_field,
    new.entity_type
  );
  raise exception '%', v_message
    using
      errcode = '23514',
      detail = jsonb_build_object(
        'path', v_path,
        'rule', 'workspace_entity_content_separation',
        'errors', jsonb_build_array(jsonb_build_object(
          'path', v_path,
          'message', v_message,
          'reason', 'child_collection_in_atomic_content',
          'rule', 'workspace_entity_content_separation'
        ))
      )::text;
end;
$function$;

drop trigger if exists authoring_workspace_entity_content_v5
  on private.authoring_workspace_entities;
create trigger authoring_workspace_entity_content_v5
before insert or update of entity_type, entity_id, content
on private.authoring_workspace_entities
for each row execute function
  private.validate_authoring_workspace_entity_content_v5();

comment on constraint authoring_workspace_entities_content_v5
  on private.authoring_workspace_entities is
  'Separa identidade e coleções filhas por tipo; preserva topics, languageTag e textDirection válidos dos cards.';

revoke all on function
  private.validate_authoring_workspace_entity_content_v5()
  from public, anon, authenticated;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260731120000',
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
