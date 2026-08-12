begin;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260812164000',
    'contractVersion', 1,
    'features', '[
      "lean-shared-catalog",
      "artifact-offline-replica",
      "granular-sync",
      "private-authoring",
      "text-language-metadata",
      "storage-artifact-control-plane",
      "pre-registered-publication-artifacts",
      "single-current-course-revision",
      "storage-only-course-content",
      "canonical-resource-registry",
      "atomic-resource-authoring",
      "atomic-card-assistance",
      "composed-authoring-workspaces",
      "workspace-publication-bindings",
      "unchanged-publication-short-circuit",
      "bounded-authoring-events",
      "microtheory-review-projection",
      "workspace-event-cursor-pagination",
      "workspace-microsequence-card-pagination",
      "global-catalog-course-search",
      "catalog-review-submissions",
      "catalog-management",
      "personal-library-course-removal",
      "course-revision-sync-compaction",
      "automatic-sync-history-maintenance",
      "compact-authoring-brief",
      "account-derived-authoring-capabilities",
      "oauth-only-authoring-mcp",
      "default-catalog-collection",
      "confidential-gpt-action-oauth",
      "gpt-action-oauth-linking",
      "gpt-action-oauth-relinking",
      "gpt-action-oauth-stable-callback",
      "workspace-card-metadata",
      "structured-authoring-errors",
      "educational-workspace-membership-v1",
      "educational-workspace-invitations-v1",
      "workspace-capability-enforcement-v1",
      "workspace-member-course-access-v1",
      "workspace-contextual-current-state-v1",
      "workspace-course-state-projection-v1",
      "plans-derived-from-current-content-v1",
      "workspace-entity-observations-v1",
      "workspace-delete-cas-v1",
      "atomic-private-course-removal-v1",
      "atomic-catalog-course-removal-v1",
      "single-active-course-composition-v1",
      "alphabetic-catalog-v1",
      "stable-trail-item-identity-v1",
      "workspace-course-paged-composition-v1",
      "atomic-trail-groups-v1",
      "alphabetic-trails-v1",
      "trail-personal-state-v1",
      "atomic-trail-personal-state-v1",
      "stable-entity-personal-state-v1",
      "situated-trail-observations-v1",
      "workspace-trail-observations-v1",
      "unified-trails-clean-cutover-v1",
      "resumable-authoring-continuity-v1",
      "package-library-v1",
      "package-contract-discovery-v1",
      "catalog-package-artifact-cutover-v1",
      "package-card-list-projection-v1",
      "package-observation-targets-v1",
      "catalog-authoring-root-reuse-v1",
      "strict-catalog-root-reuse-v1",
      "current-catalog-root-resolution-v1",
      "discard-unpublished-catalog-materialization-v1",
      "flat-runtime-manifest-v1"
    ]'::jsonb
  )
$function$;

drop function if exists public.get_aralearn_runtime_manifest_before_discard_materialization_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_current_root_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_strict_root_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_catalog_root_reuse_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_catalog_root_rebinding_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_package_observation_targets_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_package_card_list_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_package_cutover_cleanup_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_catalog_package_cutover_v1();
drop function if exists public.get_aralearn_runtime_manifest_before_package_library_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_authoring_continuity_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_catalog_runtime_alignment_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_alphabetic_catalog_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_alphabetic_trails_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_clean_trails_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_trail_observations_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_trail_state_v1();
drop function if exists public.get_aralearn_runtime_manifest_without_contract_alignment_v1();

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
