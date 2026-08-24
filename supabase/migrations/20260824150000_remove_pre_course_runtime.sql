-- Corte final do runtime anterior a Curso. O backup e o ensaio de restauração
-- pertencem à operação privada; esta migration mantém apenas o estado canônico.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-remove-pre-course-runtime-v1',
  0
));

do $legacy_cut_preflight$
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260824140000' then
    raise exception 'Manifesto concorrente ao corte final do runtime anterior a Curso.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from storage.objects
    where bucket_id in (
      'aralearn-authoring-artifacts',
      'aralearn-course-revisions'
    )
  ) then
    raise exception 'Os buckets legados ainda contêm objetos.'
      using errcode = '55000';
  end if;
end;
$legacy_cut_preflight$;

drop function if exists private.assert_authoring_commit_mandate_v1(p_workspace_id uuid, p_operation text, p_changes jsonb, p_summary jsonb, p_state jsonb) cascade;
drop function if exists private.assert_official_catalog_membership() cascade;
drop function if exists private.assert_official_import_manifest(p_expected_counts jsonb) cascade;
drop function if exists private.audit_app_role_assignment() cascade;
drop function if exists private.authoring_acquire_storage_actor_lock(p_actor_id uuid) cascade;
drop function if exists private.authoring_acquire_storage_global_lock() cascade;
drop function if exists private.authoring_acquire_storage_locks(p_actor_id uuid) cascade;
drop function if exists private.authoring_actor_has_role(p_user_id uuid, p_role text) cascade;
drop function if exists private.authoring_analytics_dataset_set_ref_v1(p_workspace_id uuid, p_dataset text, p_scope jsonb) cascade;
drop function if exists private.authoring_analytics_scope_valid_v1(p_dataset text, p_scope jsonb) cascade;
drop function if exists private.authoring_audit_artifact_refs_v1(p_run_id uuid, p_entity_path text[]) cascade;
drop function if exists private.authoring_audit_finding_distribution_v1(p_audit_run_id uuid) cascade;
drop function if exists private.authoring_audit_finding_identity_v1(p_finding private.authoring_workspace_observations) cascade;
drop function if exists private.authoring_audit_finding_json_v1(p_finding private.authoring_workspace_observations) cascade;
drop function if exists private.authoring_audit_findings_same_identity_v1(p_left private.authoring_workspace_observations, p_right private.authoring_workspace_observations) cascade;
drop function if exists private.authoring_audit_ref_v1(p_id text, p_version text) cascade;
drop function if exists private.authoring_audit_run_entries_v1(p_audit_run_id uuid) cascade;
drop function if exists private.authoring_audit_run_is_current_v1(p_audit_run_id uuid) cascade;
drop function if exists private.authoring_audit_run_ref_v1(p_run private.authoring_audit_runs) cascade;
drop function if exists private.authoring_audit_summary_v1(p_run private.authoring_audit_runs) cascade;
drop function if exists private.authoring_audit_target_in_part_v1(p_workspace_id uuid, p_state jsonb, p_entity_type text, p_entity_path text[]) cascade;
drop function if exists private.authoring_audit_target_in_run_v1(p_audit_run_id uuid, p_entity_type text, p_entity_path text[]) cascade;
drop function if exists private.authoring_comment_correction_revision_v1(p_actor_id uuid, p_workspace_id uuid, p_card_id text, p_entity_path text[], p_comment_created_at timestamp with time zone, p_correction_request_id text) cascade;
drop function if exists private.authoring_continuity_slice(p_run_id uuid, p_part_id uuid) cascade;
drop function if exists private.authoring_design_closed_object_v1(p_value jsonb, p_required text[], p_allowed text[]) cascade;
drop function if exists private.authoring_design_contains_forbidden_key_v1(p_value jsonb) cascade;
drop function if exists private.authoring_design_json_hash_v1(p_value jsonb) cascade;
drop function if exists private.authoring_design_mutation_hash_v1(p_operation text, p_payload jsonb) cascade;
drop function if exists private.authoring_design_scope_entity_version_v1(p_workspace_id uuid, p_scope_kind text, p_scope_ref text) cascade;
drop function if exists private.authoring_design_scope_path_v1(p_workspace_id uuid, p_scope_kind text, p_scope_ref text) cascade;
drop function if exists private.authoring_design_text_array_v1(p_value jsonb, p_minimum integer) cascade;
drop function if exists private.authoring_effective_design_snapshot_json_v1(p_workspace_id uuid, p_snapshot_id text, p_snapshot_version text) cascade;
drop function if exists private.authoring_experiment_contains_sensitive_key_v1(p_value jsonb) cascade;
drop function if exists private.authoring_experiment_difference_progress_v1(p_candidate_variant_revision_id uuid, p_baseline_kind text, p_baseline_ref uuid) cascade;
drop function if exists private.authoring_experiment_difference_set_ref_v1(p_experiment_id uuid) cascade;
drop function if exists private.authoring_experiment_hash_v1(p_value jsonb) cascade;
drop function if exists private.authoring_experiment_json_resource_refs_v1(p_value jsonb) cascade;
drop function if exists private.authoring_experiment_only_actor_anonymization_v1(p_old jsonb, p_new jsonb) cascade;
drop function if exists private.authoring_experiment_options_set_ref_v1(p_workspace_id uuid) cascade;
drop function if exists private.authoring_experiment_participant_set_ref_v1(p_experiment_id uuid) cascade;
drop function if exists private.authoring_experiment_set_ref_v1(p_workspace_id uuid) cascade;
drop function if exists private.authoring_experiment_variant_projection_v1(p_revision_id uuid) cascade;
drop function if exists private.authoring_experiment_variant_set_ref_v1(p_experiment_id uuid) cascade;
drop function if exists private.authoring_finding_touched_by_commit_v1(p_workspace_id uuid, p_finding_id uuid, p_changes jsonb, p_summary jsonb) cascade;
drop function if exists private.authoring_fragments_have_stable_identity(p_authoring_fragment jsonb, p_compiled_fragment jsonb) cascade;
drop function if exists private.authoring_global_retained_bytes() cascade;
drop function if exists private.authoring_jsonb_text_path_v1(p_path jsonb) cascade;
drop function if exists private.authoring_ledger_document(p_run_id uuid) cascade;
drop function if exists private.authoring_ledger_slice(p_run_id uuid, p_specification jsonb, p_part_key text) cascade;
drop function if exists private.authoring_materialized_content_hash_v1(p_workspace_id uuid, p_microsequence_ref text) cascade;
drop function if exists private.authoring_observation_paths_related_v1(p_left text[], p_right text[]) cascade;
drop function if exists private.authoring_observation_target_available_v1(p_workspace_id uuid, p_entity_type text, p_current_entity_path text[], p_resource_target_id text) cascade;
drop function if exists private.authoring_observation_target_exists_v1(p_workspace_id uuid, p_entity_type text, p_entity_path text[], p_resource_target_id text) cascade;
drop function if exists private.authoring_part_is_materialized_v1(p_workspace_id uuid, p_state jsonb, p_part_id text) cascade;
drop function if exists private.authoring_post_change_path_v1(p_workspace_id uuid, p_changes jsonb, p_entity_type text, p_entity_id text) cascade;
drop function if exists private.authoring_private_scope_for_command(p_command text) cascade;
drop function if exists private.authoring_project_slice(p_project jsonb, p_ownership jsonb) cascade;
drop function if exists private.authoring_receipt_set_target() cascade;
drop function if exists private.authoring_row_storage_charge(p_row jsonb) cascade;
drop function if exists private.authorize_authoring_experiment_variant_write_v1(p_variant_revision_id uuid) cascade;
drop function if exists private.begin_authoring_design_mutation_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_server_argument_hash text, p_expected_revision bigint, p_operation text, p_capability text) cascade;
drop function if exists private.begin_authoring_experiment_request_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_request_id text, p_payload_hash text, p_expected_experiment_revision bigint, p_expected_workspace_revision bigint, p_operation text, p_payload jsonb) cascade;
drop function if exists private.begin_catalog_management_v5(p_actor_id uuid, p_request_id text, p_operation text, p_payload_hash text) cascade;
drop function if exists private.bump_authoring_materialization_state_v1() cascade;
drop function if exists private.camel_active_rows(p_table regclass, p_course_id uuid, p_store_name text) cascade;
drop function if exists private.camel_key(p_key text) cascade;
drop function if exists private.can_publish_catalog_v5(p_actor_id uuid) cascade;
drop function if exists private.can_review_catalog_v5(p_actor_id uuid) cascade;
drop function if exists private.canonical_authoring_parameter_value_v1(p_value jsonb) cascade;
drop function if exists private.capture_authoring_experiment_variant_audit_v1(p_variant_revision_id uuid) cascade;
drop function if exists private.capture_catalog_publication() cascade;
drop function if exists private.capture_lean_personal_change() cascade;
drop function if exists private.catalog_management_payload_hash_v5(p_operation text, p_payload jsonb) cascade;
drop function if exists private.cleanup_archived_course_publication_v5() cascade;
drop function if exists private.cleanup_inactive_course_selections_v1() cascade;
drop function if exists private.cleanup_removed_workspace_member_trails_v1() cascade;
drop function if exists private.cleanup_trail_personal_access_v1(p_user_id uuid, p_trail_item_id uuid, p_ignored_workspace_id uuid) cascade;
drop function if exists private.cleanup_unselected_trail_state_v1() cascade;
drop function if exists private.cleanup_workspace_course_publication_v5() cascade;
drop function if exists private.cleanup_workspace_course_trail_item_v1() cascade;
drop function if exists private.clear_authoring_fragment_after_compiled_change() cascade;
drop function if exists private.clear_changes_requested_artifact_v1() cascade;
drop function if exists private.clone_authoring_experiment_workspace_v1(p_actor_id uuid, p_source_workspace_id uuid, p_workspace_course_id text, p_variant_revision_id uuid, p_condition_label text, p_scope_microsequence_ids text[]) cascade;
drop function if exists private.close_catalog_review_workspace_v5(p_workspace_id uuid, p_preserve_control boolean) cascade;
drop function if exists private.compact_course_revision_sync_changes_v5() cascade;
drop function if exists private.complete_authoring_design_mutation_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_server_argument_hash text, p_expected_revision bigint, p_operation text, p_result jsonb, p_summary jsonb) cascade;
drop function if exists private.complete_authoring_experiment_request_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_request_id text, p_payload_hash text, p_operation text, p_argument_hash text, p_result jsonb) cascade;
drop function if exists private.complete_catalog_management_v5(p_actor_id uuid, p_request_id text, p_operation text, p_payload_hash text, p_result jsonb) cascade;
drop function if exists private.consolidate_catalog_root_v1(p_workspace_id uuid, p_workspace_course_id text, p_catalog_course_id uuid) cascade;
drop function if exists private.copy_authoring_experiment_workspace_table_v1(p_table text, p_source_workspace_id uuid, p_target_workspace_id uuid, p_workspace_course_id text, p_scope_microsequence_ids text[]) cascade;
drop function if exists private.course_revision_descendant_store_names() cascade;
drop function if exists private.course_revision_fragment_hash(p_course_id uuid, p_microsequence_id uuid) cascade;
drop function if exists private.course_revision_patch_has_id(p_relational_patch jsonb, p_store text, p_id uuid) cascade;
drop function if exists private.course_revision_patch_row(p_relational_patch jsonb, p_store text, p_id uuid) cascade;
drop function if exists private.course_revision_request_hash(p_value jsonb) cascade;
drop function if exists private.current_authoring_entity_path_v1(p_workspace_id uuid, p_entity_type text, p_entity_id text) cascade;
drop function if exists private.current_authoring_observation_path_v1(p_workspace_id uuid, p_entity_type text, p_entity_path text[]) cascade;
drop function if exists private.current_personal_row(p_entity_type text, p_entity_id uuid, p_user_id uuid) cascade;
drop function if exists private.detach_course_compositions_v1(p_course_id uuid, p_actor_id uuid) cascade;
drop function if exists private.detach_deleted_course_from_trail_v1() cascade;
drop function if exists private.detach_revoked_membership_from_paths() cascade;
drop function if exists private.discard_authoring_workspace_before_audit_runs_v1(p_workspace_id uuid) cascade;
drop function if exists private.discard_authoring_workspace_v1(p_workspace_id uuid) cascade;
drop function if exists private.educational_workspace_can_v1(p_workspace_id uuid, p_actor_id uuid, p_capability text) cascade;
drop function if exists private.educational_workspace_comment_summary_v1(p_actor_id uuid, p_workspace_id uuid) cascade;
drop function if exists private.educational_workspace_details_before_experiments_v1(p_actor_id uuid, p_workspace_id uuid) cascade;
drop function if exists private.educational_workspace_details_v1(p_actor_id uuid, p_workspace_id uuid) cascade;
drop function if exists private.educational_workspace_effective_role_v1(p_workspace_id uuid, p_actor_id uuid) cascade;
drop function if exists private.educational_workspace_role_v1(p_workspace_id uuid, p_actor_id uuid) cascade;
drop function if exists private.enforce_authoring_manifest_selection_fallback_v1() cascade;
drop function if exists private.enforce_formula_block_ast() cascade;
drop function if exists private.ensure_course_trail_item_v1() cascade;
drop function if exists private.ensure_official_course_collection() cascade;
drop function if exists private.ensure_workspace_course_trail_item_v1() cascade;
drop function if exists private.ensure_workspace_primary_owner_membership_v1() cascade;
drop function if exists private.generate_authoring_experiment_variants_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_expected_workspace_revision bigint, p_participant_continuity text) cascade;
drop function if exists private.grant_workspace_publications_to_member_v1(p_workspace_id uuid, p_user_id uuid) cascade;
drop function if exists private.guard_active_course_selection_v1() cascade;
drop function if exists private.guard_active_review_source_course_v1() cascade;
drop function if exists private.guard_authoring_experiment_catalog_promotion_v1() cascade;
drop function if exists private.guard_authoring_experiment_child_entity_v1() cascade;
drop function if exists private.guard_authoring_experiment_child_row_v1() cascade;
drop function if exists private.guard_authoring_experiment_selection_write_v1() cascade;
drop function if exists private.guard_authoring_experiment_variant_revision_update_v1() cascade;
drop function if exists private.guard_authoring_research_lock_write_v1() cascade;
drop function if exists private.guard_authoring_workspace_publication_identity_v1() cascade;
drop function if exists private.guard_frozen_experiment_course_v1() cascade;
drop function if exists private.guard_unique_trail_course_publication_v1() cascade;
drop function if exists private.has_active_app_role(p_user_id uuid, p_role text) cascade;
drop function if exists private.insert_authoring_experiment_protocol_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_protocol_revision integer, p_protocol jsonb) cascade;
drop function if exists private.issue_authoring_experiment_enrollment_code_v1(p_experiment_id uuid, p_protocol_revision integer, p_expires_at timestamp with time zone) cascade;
drop function if exists private.jsonb_to_camel(p_value jsonb) cascade;
drop function if exists private.jsonb_to_snake(p_value jsonb) cascade;
drop function if exists private.link_workspace_publication_trail_item_v1() cascade;
drop function if exists private.list_authoring_workspace_observations_v1(p_actor_id uuid, p_workspace_id uuid, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid, p_entity_types text[], p_kinds text[], p_statuses text[]) cascade;
drop function if exists private.list_educational_workspace_comments_v1(p_actor_id uuid, p_workspace_id uuid, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid, p_categories text[], p_statuses text[]) cascade;
drop function if exists private.list_trail_items_for_actor_v1(p_actor_id uuid, p_limit integer, p_after_id uuid) cascade;
drop function if exists private.local_row(p_store_name text, p_row jsonb) cascade;
drop function if exists private.lock_course_write(p_course_id uuid) cascade;
drop function if exists private.maintain_sync_history_v5() cascade;
drop function if exists private.manage_authoring_workspace_observation_v1(p_actor_id uuid, p_request_id text, p_workspace_id uuid, p_operation text, p_payload jsonb) cascade;
drop function if exists private.manage_educational_workspace_comment_v1(p_actor_id uuid, p_request_id text, p_workspace_id uuid, p_comment_id uuid, p_operation text, p_payload jsonb) cascade;
drop function if exists private.manage_educational_workspace_comment_without_link_validation_v1(p_actor_id uuid, p_request_id text, p_workspace_id uuid, p_comment_id uuid, p_operation text, p_payload jsonb) cascade;
drop function if exists private.merge_trail_personal_state_v1(p_older jsonb, p_current jsonb) cascade;
drop function if exists private.mutate_educational_workspace_v1(p_actor_id uuid, p_request_id text, p_operation text, p_payload jsonb) cascade;
drop function if exists private.normalize_authoring_audit_verification_transition_v1() cascade;
drop function if exists private.normalize_authoring_continuity_v1(p_state jsonb, p_previous jsonb, p_revision bigint) cascade;
drop function if exists private.official_import_store_names() cascade;
drop function if exists private.patch_field_selected(p_changed_fields jsonb, p_field text) cascade;
drop function if exists private.preserve_authoring_audit_finding_history_v1() cascade;
drop function if exists private.preserve_authoring_experiment_resource_set_v1() cascade;
drop function if exists private.preserve_learning_materialization_receipt() cascade;
drop function if exists private.prevent_canonical_course_hard_delete() cascade;
drop function if exists private.protect_active_authoring_import_staging() cascade;
drop function if exists private.protect_last_app_owner() cascade;
drop function if exists private.protect_structural_catalog_collection_v1() cascade;
drop function if exists private.prune_authoring_design_state_v1(p_workspace_id uuid, p_before timestamp with time zone, p_limit integer) cascade;
drop function if exists private.prune_authoring_workspace_observation_receipts_v1(p_actor_id uuid, p_request_id text) cascade;
drop function if exists private.prune_authoring_workspace_state_v5(p_owner_id uuid, p_request_id text) cascade;
drop function if exists private.prune_authoring_workspace_terminal_findings_v1(p_workspace_id uuid) cascade;
drop function if exists private.register_artifact_v4(p_artifact jsonb) cascade;
drop function if exists private.reject_authoring_analytics_definition_mutation_v1() cascade;
drop function if exists private.reject_authoring_analytics_outcome_mutation_v1() cascade;
drop function if exists private.reject_authoring_audit_run_update_v1() cascade;
drop function if exists private.reject_authoring_design_update_v1() cascade;
drop function if exists private.reject_authoring_experiment_assignment_update_v1() cascade;
drop function if exists private.reject_authoring_experiment_history_update_v1() cascade;
drop function if exists private.release_terminal_submission_source_v1() cascade;
drop function if exists private.remap_authoring_continuity_v1(p_state jsonb, p_operation text, p_changes jsonb, p_summary jsonb) cascade;
drop function if exists private.require_authoring_experiment_page_ref_v1(p_provided jsonb, p_current jsonb, p_cursor text, p_label text) cascade;
drop function if exists private.require_catalog_admin_actor(p_actor_user_id uuid, p_owner_only boolean) cascade;
drop function if exists private.require_educational_workspace_capability_v1(p_workspace_id uuid, p_actor_id uuid, p_capability text) cascade;
drop function if exists private.require_workspace_actor_v5(p_owner_id uuid, p_scope text) cascade;
drop function if exists private.resolve_authoring_design_values_v1(p_workspace_id uuid, p_scope_kind text, p_scope_ref text) cascade;
drop function if exists private.revoke_workspace_publications_from_member_v1(p_workspace_id uuid, p_user_id uuid, p_course_id uuid) cascade;
drop function if exists private.safe_sync_watermark(p_now timestamp with time zone) cascade;
drop function if exists private.selection_row(p_selection_id uuid) cascade;
drop function if exists private.shape_store_payload(p_store_name text, p_payload jsonb, p_operation text) cascade;
drop function if exists private.snake_key(p_key text) cascade;
drop function if exists private.stamp_authoring_publication_revision_v1() cascade;
drop function if exists private.store_name(p_table_name text, p_row jsonb) cascade;
drop function if exists private.supersede_changes_requested_submission_v1() cascade;
drop function if exists private.sync_rejection_reason(p_code text, p_message text) cascade;
drop function if exists private.sync_workspace_member_publication_access_v1() cascade;
drop function if exists private.sync_workspace_publication_members_v1() cascade;
drop function if exists private.touch_course_catalog_revision() cascade;
drop function if exists private.touch_lean_row() cascade;
drop function if exists private.touch_revision() cascade;
drop function if exists private.trail_alphabetic_key_v1(p_value text) cascade;
drop function if exists private.trail_completed_card_count_v1(p_actor_id uuid, p_trail_item_id uuid) cascade;
drop function if exists private.trail_item_accessible_v1(p_trail_item_id uuid, p_user_id uuid) cascade;
drop function if exists private.trail_observation_target_available_v1(p_trail_item_id uuid, p_card_id text) cascade;
drop function if exists private.try_bigint(p_value text, p_default bigint) cascade;
drop function if exists private.try_uuid(p_value text) cascade;
drop function if exists private.user_can_use_authoring_scope(p_user_id uuid, p_scope text) cascade;
drop function if exists private.valid_authoring_blueprint_binding_v1(p_binding jsonb, p_blueprint jsonb, p_analysis jsonb) cascade;
drop function if exists private.valid_authoring_continuity_v1(p_state jsonb) cascade;
drop function if exists private.valid_authoring_continuity_without_design_extensions_v1(p_state jsonb) cascade;
drop function if exists private.valid_authoring_decision_extensions_v1(p_decision jsonb) cascade;
drop function if exists private.valid_authoring_instructional_analysis_v1(p_analysis jsonb) cascade;
drop function if exists private.valid_authoring_parameter_value_v1(p_parameter_id text, p_parameter_version text, p_value jsonb) cascade;
drop function if exists private.valid_authoring_pedagogical_blueprint_v2(p_blueprint jsonb) cascade;
drop function if exists private.valid_course_personal_state_v1(p_state jsonb) cascade;
drop function if exists private.valid_trail_personal_state_v1(p_state jsonb) cascade;
drop function if exists private.validate_authoring_experiment_base_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_expected_workspace_revision bigint) cascade;
drop function if exists private.validate_authoring_workspace_entity_content_v5() cascade;
drop function if exists private.validate_authoring_workspace_v5(p_workspace_id uuid) cascade;
drop function if exists private.workspace_result_v5(p_workspace private.legacy_authoring_workspaces, p_idempotent boolean, p_change jsonb) cascade;
drop function if exists public.apply_sync_batch(p_device_id uuid, p_mutations jsonb) cascade;
drop function if exists public.assign_authoring_experiment_participant_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_request_id text, p_payload_hash text, p_expected_experiment_revision bigint, p_payload jsonb) cascade;
drop function if exists public.bootstrap_replica(p_device_id uuid) cascade;
drop function if exists public.claim_catalog_review_v5(p_actor_id uuid, p_submission_id uuid) cascade;
drop function if exists public.claim_unreferenced_artifacts_v4(p_claim_token uuid, p_older_than interval, p_limit integer) cascade;
drop function if exists public.commit_authoring_workspace_changes_v5(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_operation text, p_changes jsonb, p_summary jsonb) cascade;
drop function if exists public.commit_authoring_workspace_changes_without_continuity_v1(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_operation text, p_changes jsonb, p_summary jsonb) cascade;
drop function if exists public.compact_sync_history(p_dry_run boolean, p_now timestamp with time zone) cascade;
drop function if exists public.complete_artifact_gc_v4(p_claim_token uuid, p_hash text, p_object_absent boolean) cascade;
drop function if exists public.create_authoring_workspace_v5(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_title text, p_source_course_id uuid, p_source_revision_hash text, p_source_submission_id uuid, p_brief text, p_rows jsonb) cascade;
drop function if exists public.create_catalog_collection_v5(p_actor_id uuid, p_collection_id uuid, p_request_id text, p_contract_key text, p_title text, p_description text) cascade;
drop function if exists public.current_user_capabilities() cascade;
drop function if exists public.decide_catalog_review_v5(p_actor_id uuid, p_submission_id uuid, p_decision text, p_note text) cascade;
drop function if exists public.delete_authoring_workspace_v5(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint) cascade;
drop function if exists public.discard_unpublished_catalog_materialization_v1(p_actor_id uuid, p_workspace_id uuid) cascade;
drop function if exists public.finalize_reserved_authoring_workspace_v1(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_title text, p_source_course_id uuid, p_source_revision_hash text, p_source_submission_id uuid, p_brief text, p_rows jsonb) cascade;
drop function if exists public.get_authoring_analytics_overview_v1(p_actor_id uuid, p_workspace_id uuid, p_scope jsonb) cascade;
drop function if exists public.get_authoring_audit_run_v1(p_actor_id uuid, p_workspace_id uuid, p_audit_run_id uuid, p_audit_run_version text, p_scope_kind text, p_scope_ref text, p_limit integer, p_after_ordinal integer, p_component_limit integer, p_after_component_ordinal integer, p_anchor_microsequence_ref text) cascade;
drop function if exists public.get_authoring_design_state_v1(p_actor_id uuid, p_workspace_id uuid, p_scope_kind text, p_scope_ref text) cascade;
drop function if exists public.get_authoring_effective_design_snapshot_v1(p_actor_id uuid, p_workspace_id uuid, p_snapshot_id text, p_snapshot_version text) cascade;
drop function if exists public.get_authoring_experiment_context_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_ref jsonb, p_variant_revision_ref jsonb, p_variant_set_ref jsonb, p_scope_path text[], p_cursor text, p_limit integer, p_difference_run_ref jsonb, p_difference_cursor text, p_difference_limit integer, p_collection text, p_collection_set_ref jsonb, p_collection_cursor text, p_collection_limit integer) cascade;
drop function if exists public.get_authoring_experiment_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_section text, p_protocol_revision integer, p_variant_set_ref jsonb, p_variant_cursor text, p_variant_limit integer, p_difference_set_ref jsonb, p_difference_run_cursor text, p_difference_run_limit integer, p_difference_run_ref jsonb, p_difference_cursor text, p_difference_limit integer, p_participant_set_ref jsonb, p_participant_cursor text, p_participant_limit integer) cascade;
drop function if exists public.get_authoring_experiment_variant_evidence_progress_v1(p_actor_id uuid, p_workspace_id uuid, p_variant_revision_ref jsonb) cascade;
drop function if exists public.get_authoring_instructional_analysis_v1(p_actor_id uuid, p_workspace_id uuid, p_scope_kind text, p_scope_ref text, p_analysis_id text, p_analysis_version text) cascade;
drop function if exists public.get_authoring_materialization_manifest_v1(p_actor_id uuid, p_workspace_id uuid, p_manifest_id text, p_manifest_version text) cascade;
drop function if exists public.get_authoring_pedagogical_blueprint_artifact_v1(p_actor_id uuid, p_workspace_id uuid, p_blueprint_id text, p_blueprint_version text) cascade;
drop function if exists public.get_authoring_resource_set_v1(p_actor_id uuid, p_workspace_id uuid, p_resource_set_id text, p_resource_set_version text) cascade;
drop function if exists public.get_authoring_workspace_before_experiments_v1(p_owner_id uuid, p_workspace_id uuid, p_course_ids text[], p_include_card_content boolean) cascade;
drop function if exists public.get_authoring_workspace_continuity_before_audit_runs_v1(p_actor_id uuid, p_workspace_id uuid) cascade;
drop function if exists public.get_authoring_workspace_continuity_v1(p_actor_id uuid, p_workspace_id uuid) cascade;
drop function if exists public.get_authoring_workspace_product_states_v1(p_actor_id uuid, p_workspace_ids uuid[], p_include_microsequences boolean) cascade;
drop function if exists public.get_authoring_workspace_v5(p_owner_id uuid, p_workspace_id uuid, p_course_ids text[], p_include_card_content boolean) cascade;
drop function if exists public.get_catalog_course_admin(p_actor_user_id uuid, p_course_id uuid) cascade;
drop function if exists public.get_catalog_review_artifact_v5(p_actor_id uuid, p_submission_id uuid) cascade;
drop function if exists public.get_course_document_artifact_v4(p_owner_id uuid, p_course_id uuid) cascade;
drop function if exists public.get_course_revision_artifact_v4(p_actor_id uuid, p_course_id uuid, p_revision_hash text) cascade;
drop function if exists public.get_current_educational_workspace_v1(p_workspace_id uuid) cascade;
drop function if exists public.get_educational_workspace_for_actor_v1(p_actor_id uuid, p_workspace_id uuid) cascade;
drop function if exists public.get_trail_workspace_course_v1(p_trail_item_id uuid, p_limit integer, p_after_cursor text, p_expected_revision bigint) cascade;
drop function if exists public.is_app_admin() cascade;
drop function if exists public.link_catalog_review_workspace_v5(p_actor_id uuid, p_submission_id uuid, p_workspace_id uuid) cascade;
drop function if exists public.list_app_role_assignments(p_actor_user_id uuid) cascade;
drop function if exists public.list_authoring_analytics_dataset_v1(p_actor_id uuid, p_workspace_id uuid, p_dataset text, p_scope jsonb, p_dataset_set_ref jsonb, p_cursor text, p_limit integer) cascade;
drop function if exists public.list_authoring_audit_cards_v1(p_actor_id uuid, p_workspace_id uuid, p_microsequence_path text[], p_expected_revision bigint, p_limit integer, p_after_position integer, p_after_id text) cascade;
drop function if exists public.list_authoring_audit_runs_v1(p_actor_id uuid, p_workspace_id uuid, p_scope_kind text, p_scope_ref text, p_limit integer, p_before_created_at timestamp with time zone, p_before_id uuid) cascade;
drop function if exists public.list_authoring_catalog_collections_v4(p_owner_id uuid, p_limit integer, p_after_id uuid, p_query text) cascade;
drop function if exists public.list_authoring_catalog_courses_v4(p_owner_id uuid, p_collection_id uuid, p_limit integer, p_after_id uuid, p_query text) cascade;
drop function if exists public.list_authoring_design_parameter_assignments_v1(p_actor_id uuid, p_workspace_id uuid, p_scope_kind text, p_scope_ref text) cascade;
drop function if exists public.list_authoring_design_parameter_definitions_v1(p_actor_id uuid, p_workspace_id uuid, p_scope_kind text) cascade;
drop function if exists public.list_authoring_experiment_options_v1(p_actor_id uuid, p_workspace_id uuid, p_kind text, p_query text, p_options_set_ref jsonb, p_cursor text, p_limit integer) cascade;
drop function if exists public.list_authoring_experiments_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_set_ref jsonb, p_cursor text, p_limit integer) cascade;
drop function if exists public.list_authoring_part_audit_components_v1(p_actor_id uuid, p_workspace_id uuid, p_part_ref text, p_limit integer, p_after_ordinal integer) cascade;
drop function if exists public.list_authoring_workspace_events_v5(p_owner_id uuid, p_workspace_id uuid, p_limit integer, p_before_revision bigint) cascade;
drop function if exists public.list_authoring_workspace_microsequence_cards_v5(p_owner_id uuid, p_workspace_id uuid, p_microsequence_path text[], p_limit integer, p_after_position integer, p_after_id text) cascade;
drop function if exists public.list_authoring_workspace_observations_for_actor_v1(p_actor_id uuid, p_workspace_id uuid, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid, p_entity_types text[], p_kinds text[], p_statuses text[]) cascade;
drop function if exists public.list_authoring_workspaces_v5(p_owner_id uuid, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid) cascade;
drop function if exists public.list_catalog_collections(p_query text) cascade;
drop function if exists public.list_catalog_collections_admin(p_actor_user_id uuid, p_limit integer, p_after_id uuid, p_query text, p_include_retired boolean) cascade;
drop function if exists public.list_catalog_courses_admin(p_actor_user_id uuid, p_collection_id uuid, p_limit integer, p_after_id uuid, p_query text) cascade;
drop function if exists public.list_catalog_reviews_v5(p_actor_id uuid, p_view text, p_limit integer, p_before_submitted_at timestamp with time zone, p_before_id uuid) cascade;
drop function if exists public.list_current_educational_workspace_comments_v1(p_workspace_id uuid, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid, p_categories text[], p_statuses text[]) cascade;
drop function if exists public.list_educational_workspace_comments_for_actor_v1(p_actor_id uuid, p_workspace_id uuid, p_limit integer, p_before_updated_at timestamp with time zone, p_before_id uuid, p_categories text[], p_statuses text[]) cascade;
drop function if exists public.list_trail_items_for_actor_v1(p_actor_id uuid, p_limit integer, p_after_id uuid) cascade;
drop function if exists public.list_trail_items_v1(p_limit integer, p_after_id uuid) cascade;
drop function if exists public.list_unreferenced_artifacts_v4(p_older_than interval, p_limit integer) cascade;
drop function if exists public.load_trail_personal_state_v1(p_trail_item_id uuid) cascade;
drop function if exists public.manage_authoring_design_parameter_assignment_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_operation text, p_assignment jsonb) cascade;
drop function if exists public.manage_authoring_experiment_enrollment_v1(p_actor_id uuid, p_operation text, p_enrollment_code text, p_enrollment_ref uuid, p_request_id text, p_payload_hash text, p_consent_policy_ref jsonb, p_consent_acknowledged boolean) cascade;
drop function if exists public.manage_authoring_experiment_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_request_id text, p_payload_hash text, p_expected_experiment_revision bigint, p_expected_workspace_revision bigint, p_operation text, p_payload jsonb) cascade;
drop function if exists public.manage_authoring_workspace_finding_before_audit_runs_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_operation text, p_payload jsonb) cascade;
drop function if exists public.manage_authoring_workspace_finding_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_operation text, p_payload jsonb) cascade;
drop function if exists public.manage_authoring_workspace_observation_for_actor_v1(p_actor_id uuid, p_request_id text, p_workspace_id uuid, p_operation text, p_payload jsonb) cascade;
drop function if exists public.manage_current_educational_workspace_comment_v1(p_request_id text, p_workspace_id uuid, p_comment_id uuid, p_operation text, p_payload jsonb) cascade;
drop function if exists public.manage_current_educational_workspace_v1(p_request_id text, p_operation text, p_payload jsonb) cascade;
drop function if exists public.manage_educational_workspace_comment_for_actor_v1(p_actor_id uuid, p_request_id text, p_workspace_id uuid, p_comment_id uuid, p_operation text, p_payload jsonb) cascade;
drop function if exists public.manage_educational_workspace_for_actor_v1(p_actor_id uuid, p_request_id text, p_operation text, p_payload jsonb) cascade;
drop function if exists public.move_catalog_course_v5(p_actor_id uuid, p_course_id uuid, p_request_id text, p_expected_placement_revision bigint, p_target_collection_id uuid) cascade;
drop function if exists public.mutate_trail_personal_state_v1(p_trail_item_id uuid, p_expected_revision bigint, p_operations jsonb, p_mutation_id uuid) cascade;
drop function if exists public.mutate_trails_v1(p_request_id uuid, p_operation text, p_arguments jsonb) cascade;
drop function if exists public.prepare_authoring_experiment_variant_evidence_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_request_id text, p_payload_hash text, p_expected_experiment_revision bigint, p_expected_workspace_revision bigint, p_variant_revision_ref jsonb, p_mandate_ref jsonb, p_scope_path text[]) cascade;
drop function if exists public.preview_authoring_effective_design_v1(p_actor_id uuid, p_workspace_id uuid, p_scope_kind text, p_scope_ref text) cascade;
drop function if exists public.publish_authoring_workspace_course_v5(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_target text, p_completion_state text, p_existing_course_id uuid, p_expected_content_hash text, p_collection_id uuid, p_submission_id uuid, p_metadata jsonb, p_artifact jsonb) cascade;
drop function if exists public.pull_course_revision_changes(p_after_sequence bigint, p_limit integer) cascade;
drop function if exists public.pull_sync_changes(p_after_sequence bigint, p_limit integer, p_device_id uuid) cascade;
drop function if exists public.record_authoring_experiment_diff_classification_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_request_id text, p_payload_hash text, p_expected_experiment_revision bigint, p_expected_workspace_revision bigint, p_difference_run_ref jsonb, p_variant_revision_ref jsonb, p_mandate_ref jsonb, p_scope_path text[], p_classifications jsonb) cascade;
drop function if exists public.record_authoring_experiment_outcome_v1(p_actor_id uuid, p_workspace_id uuid, p_enrollment_ref uuid, p_request_id text, p_payload_hash text, p_payload jsonb) cascade;
drop function if exists public.record_authoring_semantic_audit_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_payload jsonb) cascade;
drop function if exists public.register_authoring_artifact_v5(p_artifact jsonb) cascade;
drop function if exists public.register_authoring_audit_run_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_audit jsonb) cascade;
drop function if exists public.register_authoring_experiment_variant_evidence_v1(p_actor_id uuid, p_workspace_id uuid, p_experiment_id uuid, p_request_id text, p_payload_hash text, p_expected_experiment_revision bigint, p_expected_workspace_revision bigint, p_variant_revision_ref jsonb, p_mandate_ref jsonb, p_evidence jsonb) cascade;
drop function if exists public.register_authoring_materialization_manifest_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_manifest jsonb) cascade;
drop function if exists public.remove_catalog_course_v5(p_actor_id uuid, p_course_id uuid, p_request_id text, p_expected_placement_revision bigint, p_expected_content_hash text) cascade;
drop function if exists public.remove_course_from_personal_library_v5(p_actor_id uuid, p_selection_id uuid, p_course_id uuid, p_request_id text, p_expected_content_hash text) cascade;
drop function if exists public.replace_catalog_authoring_document_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_title text, p_brief text, p_rows jsonb) cascade;
drop function if exists public.replay_authoring_workspace_request_v5(p_owner_id uuid, p_request_id text, p_payload_hash text, p_operation text) cascade;
drop function if exists public.resolve_authoring_effective_design_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_snapshot jsonb) cascade;
drop function if exists public.resolve_authoring_oauth_principal(p_user_id uuid) cascade;
drop function if exists public.resolve_catalog_artifact_publisher_v4(p_contract_key text, p_requested_owner_id uuid) cascade;
drop function if exists public.resume_or_reserve_authoring_workspace_v1(p_actor_id uuid, p_course_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text) cascade;
drop function if exists public.retire_catalog_collection_v5(p_actor_id uuid, p_collection_id uuid, p_request_id text, p_expected_revision bigint, p_replacement_collection_id uuid) cascade;
drop function if exists public.reuse_unchanged_authoring_publication_v5(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_workspace_course_id text, p_content_hash text, p_target text, p_completion_state text, p_existing_course_id uuid, p_expected_content_hash text, p_collection_id uuid) cascade;
drop function if exists public.save_authoring_instructional_analysis_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_analysis jsonb) cascade;
drop function if exists public.save_authoring_pedagogical_blueprint_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_blueprint jsonb) cascade;
drop function if exists public.save_authoring_resource_set_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_resource_set jsonb) cascade;
drop function if exists public.search_authoring_catalog_courses_v5(p_owner_id uuid, p_query text, p_limit integer, p_after_title text, p_after_course_id uuid) cascade;
drop function if exists public.select_catalog_course(p_course_id uuid, p_mutation_id uuid) cascade;
drop function if exists public.set_app_role(p_actor_user_id uuid, p_target_user_id uuid, p_role text, p_active boolean, p_reason text) cascade;
drop function if exists public.submit_private_course_for_catalog_review_v5(p_actor_id uuid, p_submission_id uuid, p_course_id uuid, p_expected_content_hash text, p_note text) cascade;
drop function if exists public.unselect_catalog_course(p_course_id uuid, p_mutation_id uuid) cascade;
drop function if exists public.update_authoring_workspace_brief_v5(p_owner_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_brief text) cascade;
drop function if exists public.update_authoring_workspace_continuity_before_audit_runs_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_operation text, p_state jsonb) cascade;
drop function if exists public.update_authoring_workspace_continuity_v1(p_actor_id uuid, p_workspace_id uuid, p_request_id text, p_payload_hash text, p_expected_revision bigint, p_operation text, p_state jsonb) cascade;
drop function if exists public.update_catalog_collection_v5(p_actor_id uuid, p_collection_id uuid, p_request_id text, p_expected_revision bigint, p_title text, p_description text) cascade;
drop function if exists public.user_can_read_course(p_course_id uuid) cascade;
drop function if exists public.user_can_study_course(p_course_id uuid) cascade;
drop function if exists public.withdraw_catalog_review_v5(p_actor_id uuid, p_submission_id uuid) cascade;
drop view if exists private.authoring_analytics_assignment_rows_v1 cascade;
drop view if exists private.authoring_analytics_design_rows_v1 cascade;
drop view if exists private.authoring_analytics_outcome_rows_v1 cascade;
drop view if exists private.authoring_analytics_process_rows_v1 cascade;
drop view if exists private.current_authoring_design_parameter_assignments_v1 cascade;
drop table if exists private.app_admins cascade;
drop table if exists private.app_role_assignments cascade;
drop table if exists private.app_role_audit cascade;
drop table if exists private.aralearn_desired_learning_components cascade;
drop table if exists private.aralearn_desired_learning_placements cascade;
drop table if exists private.aralearn_desired_learning_relations cascade;
drop table if exists private.aralearn_planned_learning_cards cascade;
drop table if exists private.artifact_gc_tombstones cascade;
drop table if exists private.artifact_refs cascade;
drop table if exists private.authoring_analytics_dataset_versions cascade;
drop table if exists private.authoring_analytics_metric_definitions cascade;
drop table if exists private.authoring_analytics_outcome_receipts cascade;
drop table if exists private.authoring_audit_run_completions cascade;
drop table if exists private.authoring_audit_run_components cascade;
drop table if exists private.authoring_audit_run_microsequences cascade;
drop table if exists private.authoring_audit_runs cascade;
drop table if exists private.authoring_course_workspace_reservations cascade;
drop table if exists private.authoring_design_parameter_assignments cascade;
drop table if exists private.authoring_design_parameter_definitions cascade;
drop table if exists private.authoring_design_request_arguments cascade;
drop table if exists private.authoring_effective_design_snapshot_resource_sets cascade;
drop table if exists private.authoring_effective_design_snapshot_values cascade;
drop table if exists private.authoring_effective_design_snapshots cascade;
drop table if exists private.authoring_experiment_assignments cascade;
drop table if exists private.authoring_experiment_base_invariants cascade;
drop table if exists private.authoring_experiment_base_microsequences cascade;
drop table if exists private.authoring_experiment_base_revisions cascade;
drop table if exists private.authoring_experiment_condition_levels cascade;
drop table if exists private.authoring_experiment_condition_resource_sets cascade;
drop table if exists private.authoring_experiment_conditions cascade;
drop table if exists private.authoring_experiment_diff_classifications cascade;
drop table if exists private.authoring_experiment_difference_decisions cascade;
drop table if exists private.authoring_experiment_difference_hunks cascade;
drop table if exists private.authoring_experiment_difference_pages cascade;
drop table if exists private.authoring_experiment_difference_runs cascade;
drop table if exists private.authoring_experiment_enrollment_codes cascade;
drop table if exists private.authoring_experiment_enrollments cascade;
drop table if exists private.authoring_experiment_factor_levels cascade;
drop table if exists private.authoring_experiment_factor_targets cascade;
drop table if exists private.authoring_experiment_factors cascade;
drop table if exists private.authoring_experiment_instruments cascade;
drop table if exists private.authoring_experiment_invariants cascade;
drop table if exists private.authoring_experiment_lock_write_tokens cascade;
drop table if exists private.authoring_experiment_outcome_observations cascade;
drop table if exists private.authoring_experiment_participant_requests cascade;
drop table if exists private.authoring_experiment_protocol_revisions cascade;
drop table if exists private.authoring_experiment_requests cascade;
drop table if exists private.authoring_experiment_selection_write_tokens cascade;
drop table if exists private.authoring_experiment_variant_allowed_resource_sets cascade;
drop table if exists private.authoring_experiment_variant_corrections cascade;
drop table if exists private.authoring_experiment_variant_freezes cascade;
drop table if exists private.authoring_experiment_variant_microsequences cascade;
drop table if exists private.authoring_experiment_variant_parameter_locks cascade;
drop table if exists private.authoring_experiment_variant_revisions cascade;
drop table if exists private.authoring_experiment_variants cascade;
drop table if exists private.authoring_experiments cascade;
drop table if exists private.authoring_instructional_analyses cascade;
drop table if exists private.authoring_manifest_coverage cascade;
drop table if exists private.authoring_manifest_materialized_resources cascade;
drop table if exists private.authoring_manifest_metrics cascade;
drop table if exists private.authoring_manifest_resource_selections cascade;
drop table if exists private.authoring_materialization_manifests cascade;
drop table if exists private.authoring_materialization_states cascade;
drop table if exists private.authoring_microsequence_design_bindings cascade;
drop table if exists private.authoring_pedagogical_blueprint_bindings cascade;
drop table if exists private.authoring_pedagogical_blueprints cascade;
drop table if exists private.authoring_research_consent_policy_availability cascade;
drop table if exists private.authoring_research_consent_policy_definitions cascade;
drop table if exists private.authoring_research_instrument_availability cascade;
drop table if exists private.authoring_research_instrument_definitions cascade;
drop table if exists private.authoring_resource_set_members cascade;
drop table if exists private.authoring_resource_sets cascade;
drop table if exists private.authoring_user_rate_windows cascade;
drop table if exists private.authoring_workspace_events cascade;
drop table if exists private.authoring_workspace_observation_receipts cascade;
drop table if exists private.authoring_workspace_observations cascade;
drop table if exists private.authoring_workspace_publications cascade;
drop table if exists private.authoring_workspace_requests cascade;
drop table if exists private.catalog_management_receipts_v5 cascade;
drop table if exists private.catalog_review_submissions cascade;
drop table if exists private.course_revision_expected_entities cascade;
drop table if exists private.course_revision_sync_changes cascade;
drop table if exists private.course_revisions cascade;
drop table if exists private.educational_workspace_invitations cascade;
drop table if exists private.educational_workspace_members cascade;
drop table if exists private.educational_workspace_receipts cascade;
drop table if exists private.legacy_authoring_workspace_entities cascade;
drop table if exists private.legacy_authoring_workspaces cascade;
drop table if exists private.legacy_trail_item_courses cascade;
drop table if exists private.legacy_trail_items cascade;
drop table if exists private.package_library_cutover_audit cascade;
drop table if exists private.personal_course_clone_map cascade;
drop table if exists private.personal_library_receipts_v5 cascade;
drop table if exists private.sync_changes cascade;
drop table if exists private.sync_devices cascade;
drop table if exists private.sync_idempotency cascade;
drop table if exists private.sync_retention_policy cascade;
drop table if exists private.trail_mutation_receipts cascade;
drop table if exists private.trail_observation_threads cascade;
drop table if exists private.trail_personal_state_receipts cascade;
drop table if exists public.catalog_collection_courses cascade;
drop table if exists public.catalog_collections cascade;
drop table if exists public.legacy_catalog_courses cascade;
drop table if exists public.legacy_trail_personal_states cascade;
drop table if exists public.study_path_items cascade;
drop table if exists public.study_paths cascade;
drop table if exists public.user_course_selections cascade;

do $remove_legacy_storage_buckets$
begin
  if exists(
    select 1 from storage.buckets
    where id in ('aralearn-authoring-artifacts','aralearn-course-revisions')
  ) then
    perform set_config('storage.allow_delete_query','true',true);
    delete from storage.buckets
    where id in ('aralearn-authoring-artifacts','aralearn-course-revisions');
  end if;
end;
$remove_legacy_storage_buckets$;

do $advance_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  v_manifest := public.get_aralearn_runtime_manifest();
  v_manifest := jsonb_set(
    v_manifest,
    '{schemaRevision}',
    to_jsonb('20260824150000'::text)
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
end;
$advance_runtime_manifest$;

do $legacy_cut_postflight$
declare
  v_object_count bigint;
begin
  if public.get_aralearn_runtime_manifest()->>'schemaRevision' <> '20260824150000' then
    raise exception 'O manifesto não avançou após o corte final.'
      using errcode = '55000';
  end if;
  if exists(
    select 1 from storage.buckets
    where id in ('aralearn-authoring-artifacts','aralearn-course-revisions')
  ) then
    raise exception 'Um bucket legado permaneceu após o corte final.'
      using errcode = '55000';
  end if;

  select count(*) into v_object_count from (
    select relation_value.oid
    from pg_class relation_value
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where namespace_value.nspname in ('public','private')
      and relation_value.relkind in ('r','p','v','m')
    union all
    select procedure_value.oid
    from pg_proc procedure_value
    join pg_namespace namespace_value on namespace_value.oid=procedure_value.pronamespace
    where namespace_value.nspname in ('public','private')
    union all
    select index_value.oid
    from pg_index index_link
    join pg_class table_value on table_value.oid=index_link.indrelid
    join pg_class index_value on index_value.oid=index_link.indexrelid
    join pg_namespace namespace_value on namespace_value.oid=table_value.relnamespace
    where namespace_value.nspname in ('public','private')
    union all
    select constraint_value.oid
    from pg_constraint constraint_value
    join pg_class relation_value on relation_value.oid=constraint_value.conrelid
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where namespace_value.nspname in ('public','private')
    union all
    select trigger_value.oid
    from pg_trigger trigger_value
    join pg_class relation_value on relation_value.oid=trigger_value.tgrelid
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where namespace_value.nspname in ('public','private') and not trigger_value.tgisinternal
    union all
    select policy_value.oid
    from pg_policy policy_value
    join pg_class relation_value on relation_value.oid=policy_value.polrelid
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where namespace_value.nspname in ('public','private')
    union all
    select relation_value.oid
    from pg_class relation_value
    join pg_namespace namespace_value on namespace_value.oid=relation_value.relnamespace
    where namespace_value.nspname in ('public','private')
      and relation_value.relkind in ('r','p')
    union all
    select tableoid from storage.buckets
  ) current_objects;

  if v_object_count <> 758 then
    raise exception 'O inventário canônico pós-corte divergiu: % objetos.',v_object_count
      using errcode = '55000';
  end if;
end;
$legacy_cut_postflight$;

commit;
