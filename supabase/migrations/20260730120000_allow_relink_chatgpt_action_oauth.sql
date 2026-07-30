begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-allow-relink-chatgpt-action-oauth-v4',
  0
));

-- Um GPT pode ser configurado novamente. O vínculo anterior permanece apenas
-- como histórico revogado, portanto não pode ocupar a chave do vínculo ativo.
alter table private.authoring_action_oauth_clients
  drop constraint authoring_action_oauth_clients_creator_user_id_gpt_id_key;

create unique index authoring_action_oauth_one_active_gpt_per_creator_idx
  on private.authoring_action_oauth_clients(creator_user_id, gpt_id)
  where gpt_id is not null and active;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260730120000',
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
      'default-catalog-collection',
      'confidential-gpt-action-oauth',
      'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
