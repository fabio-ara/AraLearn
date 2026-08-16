-- Auditoria de conformidade instrucional: rodadas imutáveis, achados
-- estruturados e reauditoria vinculada ao estado materializado corrente.

begin;

select pg_advisory_xact_lock(hashtextextended(
  'aralearn-authoring-design-conformance-audit-v1',
  0
));

alter table private.authoring_workspace_requests
  drop constraint if exists authoring_workspace_requests_operation_v5;
alter table private.authoring_workspace_requests
  add constraint authoring_workspace_requests_operation_v5 check(operation in (
    'create', 'create_structure', 'update_metadata',
    'save_microsequence_cards', 'save_card', 'update_brief',
    'copy_entity', 'rename_entity', 'move_entity', 'delete_entity',
    'merge_microsequences', 'split_microsequence', 'promote_module',
    'demote_course', 'import_course', 'replace_catalog_document',
    'publish_private_preview', 'publish_private_complete',
    'publish_catalog_complete', 'delete_workspace',
    'update_continuity', 'create_finding', 'decide_finding',
    'link_finding_correction', 'verify_finding', 'delete_finding',
    'save_instructional_analysis', 'set_design_parameter',
    'remove_design_parameter', 'save_resource_set',
    'save_pedagogical_blueprint', 'resolve_effective_design',
    'register_materialization_manifest', 'run_authoring_audit',
    'record_authoring_semantic_audit'
  ));

alter table private.authoring_workspace_events
  drop constraint if exists authoring_workspace_events_operation_v5;
alter table private.authoring_workspace_events
  add constraint authoring_workspace_events_operation_v5 check(operation in (
    'create', 'create_structure', 'update_metadata',
    'save_microsequence_cards', 'save_card', 'update_brief',
    'copy_entity', 'rename_entity', 'move_entity', 'delete_entity',
    'merge_microsequences', 'split_microsequence', 'promote_module',
    'demote_course', 'import_course', 'replace_catalog_document',
    'update_continuity', 'create_finding', 'decide_finding',
    'link_finding_correction', 'verify_finding', 'delete_finding',
    'save_instructional_analysis', 'set_design_parameter',
    'remove_design_parameter', 'save_resource_set',
    'save_pedagogical_blueprint', 'resolve_effective_design',
    'register_materialization_manifest', 'run_authoring_audit',
    'record_authoring_semantic_audit'
  ));

create table private.authoring_audit_runs (
  id uuid primary key default gen_random_uuid(),
  run_version text not null default '1.0.0',
  workspace_id uuid not null
    references private.authoring_workspaces(id) on delete cascade,
  kind text not null,
  scope_kind text not null,
  scope_ref text not null,
  audited_workspace_revision bigint not null,
  algorithm_id text not null,
  algorithm_version text not null,
  deterministic_result jsonb not null,
  mandate_snapshot jsonb not null,
  result_hash text not null,
  deterministic_finding_count integer not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint authoring_audit_runs_identity_v1 check (
    run_version = '1.0.0'
    and kind in ('audit', 'reaudit')
    and scope_kind in ('microsequence', 'part')
    and nullif(btrim(scope_ref), '') is not null
    and scope_ref = btrim(scope_ref)
    and char_length(scope_ref) <= 240
  ),
  constraint authoring_audit_runs_revision_v1 check (
    audited_workspace_revision > 0
    and deterministic_finding_count between 0 and 5000
  ),
  constraint authoring_audit_runs_algorithm_v1 check (
    nullif(btrim(algorithm_id), '') is not null
    and char_length(algorithm_id) <= 160
    and algorithm_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
    and result_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint authoring_audit_runs_result_v1 check (
    jsonb_typeof(deterministic_result) = 'object'
    and pg_column_size(deterministic_result) <= 2097152
    and not private.authoring_design_contains_forbidden_key_v1(
      deterministic_result
    )
    and jsonb_typeof(mandate_snapshot) = 'object'
    and nullif(btrim(mandate_snapshot->>'id'), '') is not null
    and mandate_snapshot->>'kind' = 'audit'
    and pg_column_size(mandate_snapshot) <= 16384
    and not private.authoring_design_contains_forbidden_key_v1(
      mandate_snapshot
    )
  )
);

create index authoring_audit_runs_scope_v1_idx
  on private.authoring_audit_runs(
    workspace_id, scope_kind, scope_ref, created_at desc, id desc
  );

create table private.authoring_audit_run_microsequences (
  audit_run_id uuid not null
    references private.authoring_audit_runs(id) on delete cascade,
  workspace_id uuid not null,
  ordinal integer not null,
  microsequence_ref text not null,
  scope_path text[] not null,
  scope_entity_version bigint not null,
  materialization_state_revision bigint not null,
  content_hash text not null,
  analysis_id text,
  analysis_version text,
  snapshot_id text,
  snapshot_version text,
  blueprint_id text,
  blueprint_version text,
  binding_id text,
  binding_version text,
  manifest_id text,
  manifest_version text,
  resource_set_refs jsonb not null,
  primary key(audit_run_id, microsequence_ref),
  unique(audit_run_id, ordinal),
  foreign key(workspace_id, analysis_id, analysis_version)
    references private.authoring_instructional_analyses(
      workspace_id, analysis_id, analysis_version
    ) on delete restrict,
  foreign key(workspace_id, snapshot_id, snapshot_version)
    references private.authoring_effective_design_snapshots(
      workspace_id, snapshot_id, snapshot_version
    ) on delete restrict,
  foreign key(workspace_id, blueprint_id, blueprint_version)
    references private.authoring_pedagogical_blueprints(
      workspace_id, blueprint_id, blueprint_version
    ) on delete restrict,
  foreign key(workspace_id, binding_id, binding_version)
    references private.authoring_pedagogical_blueprint_bindings(
      workspace_id, binding_id, binding_version
    ) on delete restrict,
  foreign key(workspace_id, manifest_id, manifest_version)
    references private.authoring_materialization_manifests(
      workspace_id, manifest_id, manifest_version
    ) on delete restrict,
  constraint authoring_audit_run_microsequences_scope_v1 check (
    ordinal between 1 and 500
    and nullif(btrim(microsequence_ref), '') is not null
    and char_length(microsequence_ref) <= 240
    and cardinality(scope_path) = 4
    and scope_path[4] = microsequence_ref
    and scope_entity_version > 0
    and materialization_state_revision >= 0
    and content_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint authoring_audit_run_microsequences_refs_v1 check (
    ((analysis_id is null) = (analysis_version is null))
    and ((snapshot_id is null) = (snapshot_version is null))
    and ((blueprint_id is null) = (blueprint_version is null))
    and ((binding_id is null) = (binding_version is null))
    and ((manifest_id is null) = (manifest_version is null))
    and jsonb_typeof(resource_set_refs) = 'array'
    and jsonb_array_length(resource_set_refs) <= 128
  )
);

create index authoring_audit_run_microsequences_lookup_v1_idx
  on private.authoring_audit_run_microsequences(
    workspace_id, microsequence_ref, audit_run_id
  );

create table private.authoring_audit_run_completions (
  audit_run_id uuid primary key
    references private.authoring_audit_runs(id) on delete cascade,
  workspace_id uuid not null,
  completed_revision bigint not null,
  semantic_result jsonb not null,
  result_hash text not null,
  semantic_finding_count integer not null,
  verification_count integer not null,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now(),
  constraint authoring_audit_run_completions_revision_v1 check (
    completed_revision > 0
    and semantic_finding_count between 0 and 100
    and verification_count between 0 and 100
    and result_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint authoring_audit_run_completions_result_v1 check (
    jsonb_typeof(semantic_result) = 'object'
    and pg_column_size(semantic_result) <= 1048576
    and not private.authoring_design_contains_forbidden_key_v1(semantic_result)
  )
);

create table private.authoring_audit_run_components (
  parent_audit_run_id uuid not null
    references private.authoring_audit_runs(id) on delete cascade,
  ordinal integer not null,
  microsequence_ref text not null,
  target_available boolean not null,
  child_audit_run_id uuid
    references private.authoring_audit_runs(id)
      on delete no action deferrable initially deferred,
  primary key(parent_audit_run_id, ordinal),
  unique(parent_audit_run_id, microsequence_ref),
  constraint authoring_audit_run_components_shape_v1 check (
    ordinal between 1 and 500
    and nullif(btrim(microsequence_ref), '') is not null
    and char_length(microsequence_ref) <= 240
    and (child_audit_run_id is null or parent_audit_run_id <> child_audit_run_id)
    and (target_available or child_audit_run_id is null)
  )
);

create index authoring_audit_run_components_child_v1_idx
  on private.authoring_audit_run_components(child_audit_run_id);
create unique index authoring_audit_run_components_unique_child_v1_idx
  on private.authoring_audit_run_components(
    parent_audit_run_id, child_audit_run_id
  ) where child_audit_run_id is not null;

create function private.reject_authoring_audit_run_update_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_table_name = 'authoring_audit_runs'
     and to_jsonb(old)->'created_by' <> 'null'::jsonb
     and to_jsonb(new)->'created_by' = 'null'::jsonb
     and (to_jsonb(new) - 'created_by') is not distinct from
       (to_jsonb(old) - 'created_by') then
    return new;
  end if;
  if tg_table_name = 'authoring_audit_run_completions'
     and to_jsonb(old)->'completed_by' <> 'null'::jsonb
     and to_jsonb(new)->'completed_by' = 'null'::jsonb
     and (to_jsonb(new) - 'completed_by') is not distinct from
       (to_jsonb(old) - 'completed_by') then
    return new;
  end if;
  raise exception 'Rodadas de auditoria são imutáveis.' using errcode = '55000';
end;
$function$;

create trigger authoring_audit_runs_immutable_v1
before update on private.authoring_audit_runs
for each row execute function private.reject_authoring_audit_run_update_v1();
create trigger authoring_audit_run_microsequences_immutable_v1
before update on private.authoring_audit_run_microsequences
for each row execute function private.reject_authoring_audit_run_update_v1();
create trigger authoring_audit_run_completions_immutable_v1
before update on private.authoring_audit_run_completions
for each row execute function private.reject_authoring_audit_run_update_v1();
create trigger authoring_audit_run_components_immutable_v1
before update on private.authoring_audit_run_components
for each row execute function private.reject_authoring_audit_run_update_v1();

create or replace function private.reject_authoring_design_update_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  -- FKs de proveniência usam SET NULL para que a exclusão de uma conta não
  -- apague nem torne inalcançáveis os artefatos versionados que ela criou.
  if tg_table_name = 'authoring_design_parameter_assignments'
     and to_jsonb(old)->>'authority_kind' = 'author'
     and to_jsonb(old)->'authority_actor_id' <> 'null'::jsonb
     and to_jsonb(new)->'authority_actor_id' = 'null'::jsonb then
    new := jsonb_populate_record(
      new, jsonb_build_object('authority_ref', null)
    );
  end if;
  if (
       coalesce(
         to_jsonb(old)->'created_by' <> 'null'::jsonb
         and to_jsonb(new)->'created_by' = 'null'::jsonb,
         false
       )
       or coalesce(
         to_jsonb(old)->'authority_actor_id' <> 'null'::jsonb
         and to_jsonb(new)->'authority_actor_id' = 'null'::jsonb,
         false
       )
     )
     and (
       to_jsonb(new)->'created_by' is not distinct from
         to_jsonb(old)->'created_by'
       or (
         to_jsonb(old)->'created_by' <> 'null'::jsonb
         and to_jsonb(new)->'created_by' = 'null'::jsonb
       )
     )
     and (
       to_jsonb(new)->'authority_actor_id' is not distinct from
         to_jsonb(old)->'authority_actor_id'
       or (
         to_jsonb(old)->'authority_actor_id' <> 'null'::jsonb
         and to_jsonb(new)->'authority_actor_id' = 'null'::jsonb
       )
     )
     and (
       to_jsonb(new)->'authority_ref' is not distinct from
         to_jsonb(old)->'authority_ref'
       or (
         to_jsonb(old)->>'authority_kind' = 'author'
         and to_jsonb(old)->'authority_actor_id' <> 'null'::jsonb
         and to_jsonb(new)->'authority_actor_id' = 'null'::jsonb
         and to_jsonb(new)->'authority_ref' = 'null'::jsonb
       )
     )
     and (
       to_jsonb(new) - array[
         'created_by', 'authority_actor_id', 'authority_ref'
       ]
     )
       is not distinct from
       (
         to_jsonb(old) - array[
           'created_by', 'authority_actor_id', 'authority_ref'
         ]
       ) then
    return new;
  end if;
  raise exception 'Objetos versionados de desenho são imutáveis.'
    using errcode = '55000';
end;
$function$;

alter table private.authoring_workspace_observations
  drop constraint if exists authoring_workspace_observations_author_id_fkey;
alter table private.authoring_workspace_observations
  alter column author_id drop not null;
alter table private.authoring_workspace_observations
  add constraint authoring_workspace_observations_author_id_fkey
    foreign key(author_id) references auth.users(id) on delete set null;

alter table private.authoring_workspace_observations
  drop constraint if exists authoring_workspace_observations_lifecycle_v1;

alter table private.authoring_workspace_observations
  add column audit_run_id uuid,
  add column audit_finding_ordinal integer,
  add column finding_code text,
  add column finding_origin text,
  add column rule_kind text,
  add column rule_id text,
  add column rule_version text,
  add column public_evidence text,
  add column finding_fingerprint text,
  add column verified_by_audit_run_id uuid,
  add column superseded_by_finding_id uuid,
  add constraint authoring_workspace_observations_audit_run_v1
    foreign key(audit_run_id) references private.authoring_audit_runs(id)
      on delete restrict,
  add constraint authoring_workspace_observations_verification_run_v1
    foreign key(verified_by_audit_run_id)
      references private.authoring_audit_runs(id) on delete restrict,
  add constraint authoring_workspace_observations_superseded_by_v1
    foreign key(superseded_by_finding_id)
      references private.authoring_workspace_observations(id) on delete set null;

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
      and audit_run_id is null
      and audit_finding_ordinal is null
      and finding_code is null
      and finding_origin is null
      and rule_kind is null
      and rule_id is null
      and rule_version is null
      and public_evidence is null
      and finding_fingerprint is null
      and verified_by_audit_run_id is null
      and superseded_by_finding_id is null
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
      and (
        proposed_repair is null
        or (
          btrim(proposed_repair) <> ''
          and char_length(proposed_repair) <= 1000
        )
      )
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
        (audit_run_id is null
          and audit_finding_ordinal is null
          and finding_code is null
          and finding_origin is null
          and rule_kind is null
          and rule_id is null
          and rule_version is null
          and public_evidence is null
          and finding_fingerprint is null)
        or (
          audit_run_id is not null
          and audit_finding_ordinal between 1 and 5000
          and finding_code ~ '^[a-z][a-z0-9_.-]{1,119}$'
          and finding_origin in ('deterministic', 'semantic_audit')
          and nullif(btrim(rule_kind), '') is not null
          and char_length(rule_kind) <= 64
          and nullif(btrim(rule_id), '') is not null
          and char_length(rule_id) <= 240
          and (
            rule_version is null
            or rule_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
          )
          and nullif(btrim(public_evidence), '') is not null
          and char_length(public_evidence) <= 2000
          and finding_fingerprint ~ '^[a-f0-9]{64}$'
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
          and pending_correction_request_id is not null
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
        (verification is null and verified_revision is null
          and verified_by_audit_run_id is null)
        or (verification is not null and verified_revision is not null)
      )
      and (status <> 'repaired' or correction_request_id is not null)
      and (
        status <> 'resolved'
        or (correction_request_id is not null and verification is not null)
      )
      and (audit_run_id is null or verification is null
        or verified_by_audit_run_id is not null)
      and (superseded_by_finding_id is null
        or superseded_by_finding_id <> id)
    )
  );

create unique index authoring_workspace_audit_findings_ordinal_v1_idx
  on private.authoring_workspace_observations(
    audit_run_id, audit_finding_ordinal
  ) where audit_run_id is not null;
create unique index authoring_workspace_audit_findings_fingerprint_v1_idx
  on private.authoring_workspace_observations(
    audit_run_id, finding_fingerprint
  ) where audit_run_id is not null;

create function private.preserve_authoring_audit_finding_history_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if old.audit_run_id is null then
    return old;
  end if;
  if current_setting('aralearn.audit_workspace_discard', true)
       = old.workspace_id::text then
    return old;
  end if;
  -- Cascata da exclusão do workspace pode purgar o histórico inteiro. Enquanto
  -- o workspace existe, remoções de alvo apenas o tornam indisponível.
  if exists (
    select 1 from private.authoring_workspaces workspace
    where workspace.id = old.workspace_id
  ) then
    return null;
  end if;
  return old;
end;
$function$;

create trigger preserve_authoring_audit_finding_history_v1
before delete on private.authoring_workspace_observations
for each row execute function private.preserve_authoring_audit_finding_history_v1();

do $rename_workspace_discard_for_audit_runs$
begin
  if to_regprocedure('private.discard_authoring_workspace_v1(uuid)') is not null then
    alter function private.discard_authoring_workspace_v1(uuid)
      rename to discard_authoring_workspace_before_audit_runs_v1;
  end if;
end;
$rename_workspace_discard_for_audit_runs$;

create function private.discard_authoring_workspace_v1(
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  perform set_config(
    'aralearn.audit_workspace_discard', p_workspace_id::text, true
  );
  perform private.discard_authoring_workspace_before_audit_runs_v1(
    p_workspace_id
  );
  delete from private.authoring_audit_run_components component
  where component.parent_audit_run_id in (
    select run.id from private.authoring_audit_runs run
    where run.workspace_id = p_workspace_id
  ) or component.child_audit_run_id in (
    select run.id from private.authoring_audit_runs run
    where run.workspace_id = p_workspace_id
  );
  delete from private.authoring_audit_runs run
  where run.workspace_id = p_workspace_id;
  delete from private.authoring_microsequence_design_bindings binding
  where binding.workspace_id = p_workspace_id;
  delete from private.authoring_materialization_manifests manifest
  where manifest.workspace_id = p_workspace_id;
  delete from private.authoring_pedagogical_blueprint_bindings binding
  where binding.workspace_id = p_workspace_id;
  delete from private.authoring_pedagogical_blueprints blueprint
  where blueprint.workspace_id = p_workspace_id;
  delete from private.authoring_effective_design_snapshots snapshot
  where snapshot.workspace_id = p_workspace_id;
  delete from private.authoring_design_parameter_assignments assignment
  where assignment.workspace_id = p_workspace_id;
  delete from private.authoring_resource_sets resource_set
  where resource_set.workspace_id = p_workspace_id;
  delete from private.authoring_instructional_analyses analysis
  where analysis.workspace_id = p_workspace_id;
  delete from private.authoring_materialization_states state
  where state.workspace_id = p_workspace_id;
  perform set_config('aralearn.audit_workspace_discard', '', true);
end;
$function$;

revoke all on function private.discard_authoring_workspace_v1(uuid)
  from public, anon, authenticated, service_role;

create function private.normalize_authoring_audit_verification_transition_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if old.audit_run_id is not null and new.verification is null then
    new.verified_revision := null;
    new.verified_by_audit_run_id := null;
  end if;
  return new;
end;
$function$;

create trigger normalize_authoring_audit_verification_transition_v1
before update on private.authoring_workspace_observations
for each row execute function private.normalize_authoring_audit_verification_transition_v1();

create or replace function private.prune_authoring_workspace_terminal_findings_v1(
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
      and observation.audit_run_id is null
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

create function private.authoring_audit_run_ref_v1(
  p_run private.authoring_audit_runs
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object('id', p_run.id, 'version', p_run.run_version)
$function$;

create function private.authoring_audit_ref_v1(
  p_id text,
  p_version text
)
returns jsonb
language sql
immutable
security definer
set search_path = pg_catalog
as $function$
  select case when p_id is null then null else jsonb_build_object(
    'id', p_id, 'version', p_version
  ) end
$function$;

create function private.authoring_audit_finding_identity_v1(
  p_finding private.authoring_workspace_observations
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'code', p_finding.finding_code,
    'target', jsonb_build_object(
      'entityType', p_finding.entity_type,
      'entityPath', to_jsonb(coalesce(
        private.current_authoring_observation_path_v1(
          p_finding.workspace_id,
          p_finding.entity_type,
          p_finding.entity_path
        ),
        p_finding.entity_path
      )),
      'resourceTargetId', p_finding.resource_target_id
    ),
    'ruleRef', jsonb_build_object(
      'kind', btrim(p_finding.rule_kind),
      'id', btrim(p_finding.rule_id),
      'version', nullif(btrim(p_finding.rule_version), '')
    )
  )
$function$;

create function private.authoring_audit_findings_same_identity_v1(
  p_left private.authoring_workspace_observations,
  p_right private.authoring_workspace_observations
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select private.authoring_audit_finding_identity_v1(p_left)
    = private.authoring_audit_finding_identity_v1(p_right)
$function$;

create function private.authoring_audit_artifact_refs_v1(
  p_run_id uuid,
  p_entity_path text[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with scoped as materialized (
    select audited.*
    from private.authoring_audit_run_microsequences audited
    where audited.audit_run_id = p_run_id
      and (
        p_entity_path is null
        or cardinality(p_entity_path) = 0
        or audited.scope_path[1:least(cardinality(p_entity_path), 4)]
          = p_entity_path[1:least(cardinality(p_entity_path), 4)]
      )
  ), singular as (
    select * from scoped
    where p_entity_path is not null and cardinality(p_entity_path) >= 4
    order by ordinal
    limit 1
  ), resource_refs as (
    select distinct resource_ref
    from scoped
    cross join lateral jsonb_array_elements(scoped.resource_set_refs) resource_ref
  ), microsequence_refs as (
    select microsequence_ref, ordinal from scoped order by ordinal
  )
  select jsonb_build_object(
    'analysisRef', case when cardinality(p_entity_path) >= 4 then (
      select private.authoring_audit_ref_v1(analysis_id, analysis_version)
      from singular
    ) else null end,
    'effectiveSnapshotRef', case when cardinality(p_entity_path) >= 4 then (
      select private.authoring_audit_ref_v1(snapshot_id, snapshot_version)
      from singular
    ) else null end,
    'blueprintRef', case when cardinality(p_entity_path) >= 4 then (
      select private.authoring_audit_ref_v1(blueprint_id, blueprint_version)
      from singular
    ) else null end,
    'bindingRef', case when cardinality(p_entity_path) >= 4 then (
      select private.authoring_audit_ref_v1(binding_id, binding_version)
      from singular
    ) else null end,
    'manifestRef', case when cardinality(p_entity_path) >= 4 then (
      select private.authoring_audit_ref_v1(manifest_id, manifest_version)
      from singular
    ) else null end,
    'resourceSetRefs', jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(resource_ref order by resource_ref->>'id', resource_ref->>'version')
        from (
          select resource_ref
          from resource_refs
          order by resource_ref->>'id', resource_ref->>'version'
          limit 20
        ) bounded
      ), '[]'::jsonb),
      'count', (select count(*) from resource_refs),
      'truncated', (select count(*) from resource_refs) > 20
    ),
    'microsequenceRefs', jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(microsequence_ref order by ordinal)
        from (
          select * from microsequence_refs order by ordinal limit 20
        ) bounded
      ), '[]'::jsonb),
      'count', (select count(*) from microsequence_refs),
      'truncated', (select count(*) from microsequence_refs) > 20
    )
  )
$function$;

create function private.authoring_audit_target_in_run_v1(
  p_audit_run_id uuid,
  p_entity_type text,
  p_entity_path text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select exists (
    select 1
    from private.authoring_audit_runs run
    where run.id = p_audit_run_id
      and (
        (p_entity_type = 'workspace' and run.scope_kind = 'part')
        or exists (
          select 1
          from private.authoring_audit_run_microsequences audited
          where audited.audit_run_id = run.id
            and cardinality(p_entity_path) <= 5
            and (
              cardinality(p_entity_path) = 0
              or p_entity_path = audited.scope_path[
                1:least(cardinality(p_entity_path), 4)
              ] || case when cardinality(p_entity_path) = 5
                then array[p_entity_path[5]] else '{}'::text[] end
            )
        )
      )
  )
$function$;

create function private.authoring_audit_run_is_current_v1(
  p_audit_run_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select exists (
    select 1 from private.authoring_audit_runs run
    where run.id = p_audit_run_id
  ) and not exists (
    select 1
    from private.authoring_audit_runs current_run
    join private.authoring_audit_runs newer_run
      on newer_run.workspace_id = current_run.workspace_id
     and newer_run.scope_kind = current_run.scope_kind
     and newer_run.scope_ref = current_run.scope_ref
     and (
       newer_run.audited_workspace_revision,
       newer_run.created_at,
       newer_run.id
     ) > (
       current_run.audited_workspace_revision,
       current_run.created_at,
       current_run.id
     )
    where current_run.id = p_audit_run_id
  ) and not exists (
    select 1
    from private.authoring_audit_run_components component
    join private.authoring_audit_runs parent
      on parent.id = component.parent_audit_run_id
    where parent.id = p_audit_run_id
      and (
        component.target_available is distinct from (
          private.authoring_design_scope_path_v1(
            parent.workspace_id,
            'microsequence',
            component.microsequence_ref
          ) is not null
        )
        or component.child_audit_run_id is distinct from (
          select child.id
          from private.authoring_audit_runs child
          join private.authoring_audit_run_completions completion
            on completion.audit_run_id = child.id
          where child.workspace_id = parent.workspace_id
            and child.scope_kind = 'microsequence'
            and child.scope_ref = component.microsequence_ref
            and private.authoring_audit_run_is_current_v1(child.id)
          order by child.created_at desc, child.id desc
          limit 1
        )
      )
  ) and not exists (
    select 1
    from private.authoring_audit_runs run
    join private.authoring_workspaces workspace
      on workspace.id = run.workspace_id
    left join lateral (
      select part
      from jsonb_array_elements(
        coalesce(workspace.authoring_state->'parts', '[]'::jsonb)
      ) part
      where part->>'id' = run.scope_ref
      limit 1
    ) current_part on run.scope_kind = 'part'
    where run.id = p_audit_run_id
      and (
        (
          workspace.authoring_state->'mandate'
            is distinct from run.mandate_snapshot
          and (
            coalesce(
              workspace.authoring_state->'mandate',
              'null'::jsonb
            ) is distinct from 'null'::jsonb
            or not exists (
              select 1
              from private.authoring_audit_run_completions completion
              where completion.audit_run_id = run.id
            )
          )
        )
        or (
          run.scope_kind = 'part'
          and (
            current_part.part is null
            or current_part.part->'microsequenceIds' is distinct from (
              select coalesce(jsonb_agg(
                component.microsequence_ref order by component.ordinal
              ), '[]'::jsonb)
              from private.authoring_audit_run_components component
              where component.parent_audit_run_id = run.id
            )
          )
        )
      )
  ) and not exists (
    select 1
    from private.authoring_audit_run_microsequences audited
    left join private.authoring_microsequence_design_bindings binding
      on binding.workspace_id = audited.workspace_id
     and binding.microsequence_ref = audited.microsequence_ref
    left join lateral (
      select manifest.*
      from private.authoring_materialization_manifests manifest
      where manifest.workspace_id = audited.workspace_id
        and manifest.scope_ref = audited.microsequence_ref
      order by manifest.created_revision desc, manifest.created_at desc
      limit 1
    ) current_manifest on true
    where audited.audit_run_id = p_audit_run_id
      and (
        private.authoring_design_scope_path_v1(
          audited.workspace_id, 'microsequence', audited.microsequence_ref
        ) is distinct from audited.scope_path
        or private.authoring_design_scope_entity_version_v1(
          audited.workspace_id, 'microsequence', audited.microsequence_ref
        ) is distinct from audited.scope_entity_version
        or coalesce((
          select state.materialization_revision
          from private.authoring_materialization_states state
          where state.workspace_id = audited.workspace_id
            and state.microsequence_ref = audited.microsequence_ref
        ), 0) is distinct from audited.materialization_state_revision
        or private.authoring_materialized_content_hash_v1(
          audited.workspace_id, audited.microsequence_ref
        ) is distinct from audited.content_hash
        or binding.analysis_id is distinct from audited.analysis_id
        or binding.analysis_version is distinct from audited.analysis_version
        or binding.snapshot_id is distinct from audited.snapshot_id
        or binding.snapshot_version is distinct from audited.snapshot_version
        or binding.blueprint_id is distinct from audited.blueprint_id
        or binding.blueprint_version is distinct from audited.blueprint_version
        or binding.binding_id is distinct from audited.binding_id
        or binding.binding_version is distinct from audited.binding_version
        or current_manifest.manifest_id is distinct from audited.manifest_id
        or current_manifest.manifest_version is distinct from audited.manifest_version
        or audited.resource_set_refs is distinct from coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', snapshot_set.resource_set_id,
            'version', snapshot_set.resource_set_version
          ) order by snapshot_set.ordinal)
          from private.authoring_effective_design_snapshot_resource_sets snapshot_set
          where snapshot_set.workspace_id = audited.workspace_id
            and snapshot_set.snapshot_id = audited.snapshot_id
            and snapshot_set.snapshot_version = audited.snapshot_version
        ), '[]'::jsonb)
      )
  )
$function$;

create function public.list_authoring_audit_cards_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_microsequence_path text[],
  p_expected_revision bigint,
  p_limit integer default 25,
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
  v_scope_entity_version bigint;
  v_materialization_state_revision bigint;
  v_content_hash text;
  v_items jsonb;
  v_has_more boolean;
  v_last_position integer;
  v_last_id text;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  if p_microsequence_path is null
     or cardinality(p_microsequence_path) <> 4
     or exists (
       select 1 from unnest(p_microsequence_path) path_part
       where nullif(btrim(path_part), '') is null
          or path_part <> btrim(path_part)
          or char_length(path_part) > 240
     )
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_limit is null
     or p_limit not between 1 and 50
     or ((p_after_position is null) <> (p_after_id is null))
     or (p_after_position is not null and p_after_position < 1)
     or (p_after_id is not null and (
       nullif(btrim(p_after_id), '') is null
       or p_after_id <> btrim(p_after_id)
       or char_length(p_after_id) > 240
     )) then
    raise exception 'Leitura paginada de auditoria inválida.'
      using errcode = '22023';
  end if;
  select workspace.revision into v_revision
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if v_revision <> p_expected_revision then
    raise exception 'Revisão base desatualizada.' using
      errcode = '40001',
      detail = jsonb_build_object(
        'expectedRevision', p_expected_revision,
        'currentRevision', v_revision
      )::text;
  end if;
  if private.authoring_design_scope_path_v1(
       p_workspace_id, 'microsequence', p_microsequence_path[4]
     ) is distinct from p_microsequence_path then
    raise exception 'Microssequência inexistente no caminho informado.'
      using errcode = 'P0002';
  end if;
  v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
    p_workspace_id, 'microsequence', p_microsequence_path[4]
  );
  select coalesce(state.materialization_revision, 0)
  into v_materialization_state_revision
  from (select 1) seed
  left join private.authoring_materialization_states state
    on state.workspace_id = p_workspace_id
   and state.microsequence_ref = p_microsequence_path[4];
  v_content_hash := private.authoring_materialized_content_hash_v1(
    p_workspace_id, p_microsequence_path[4]
  );

  with candidates as materialized (
    select card.entity_id, card.position, card.version, card.content
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
  ), page as materialized (
    select * from candidates
    order by position, entity_id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.entity_id,
      'position', page.position,
      'version', page.version,
      'content', page.content
    ) order by page.position, page.entity_id), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    (select page.position from page
      order by page.position desc, page.entity_id desc limit 1),
    (select page.entity_id from page
      order by page.position desc, page.entity_id desc limit 1)
  into v_items, v_has_more, v_last_position, v_last_id
  from page;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', v_revision,
    'microsequencePath', to_jsonb(p_microsequence_path),
    'scopeEntityVersion', v_scope_entity_version,
    'materializationStateRevision', v_materialization_state_revision,
    'contentHash', v_content_hash,
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', case when v_has_more then jsonb_build_object(
      'afterPosition', v_last_position,
      'afterId', v_last_id
    ) else null end
  );
end;
$function$;

create function public.list_authoring_part_audit_components_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_part_ref text,
  p_limit integer default 10,
  p_after_ordinal integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_workspace private.authoring_workspaces%rowtype;
  v_part jsonb;
  v_items jsonb;
  v_total integer;
  v_ready integer;
  v_has_more boolean;
  v_next_cursor text;
  v_page_count integer := 0;
  v_component record;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  if nullif(btrim(p_part_ref), '') is null
     or char_length(p_part_ref) > 240
     or p_limit not between 1 and 10
     or (p_after_ordinal is not null and p_after_ordinal < 1) then
    raise exception 'Página de componentes da Parte inválida.'
      using errcode = '22023';
  end if;
  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  select part into v_part
  from jsonb_array_elements(
    coalesce(v_workspace.authoring_state->'parts', '[]'::jsonb)
  ) part
  where part->>'id' = p_part_ref;
  if v_part is null then
    raise exception 'Parte inexistente.' using errcode = 'P0002';
  end if;

  select jsonb_array_length(v_part->'microsequenceIds') into v_total;
  v_ready := 0;
  v_items := '[]'::jsonb;
  v_has_more := false;
  for v_component in
    with members as (
      select member.microsequence_ref, member.ordinal::integer
      from jsonb_array_elements_text(v_part->'microsequenceIds')
        with ordinality member(microsequence_ref, ordinal)
      where p_after_ordinal is null or member.ordinal > p_after_ordinal
      order by member.ordinal
      limit p_limit + 1
    )
    select member.*,
      current_entity.entity_id is not null as target_available,
      child.id as child_run_id,
      child.run_version,
      child.audited_workspace_revision,
      child.deterministic_result,
      audited.scope_path,
      audited.scope_entity_version,
      audited.materialization_state_revision,
      audited.content_hash,
      audited.analysis_id,
      audited.analysis_version,
      audited.snapshot_id,
      audited.snapshot_version,
      audited.blueprint_id,
      audited.blueprint_version,
      audited.binding_id,
      audited.binding_version,
      audited.manifest_id,
      audited.manifest_version,
      audited.resource_set_refs,
      coalesce((finding_distribution.value->>'total')::integer, 0)
        as finding_count,
      coalesce(finding_distribution.value->'byCategory', '{}'::jsonb)
        as findings_by_category,
      coalesce(finding_distribution.value->'byOrigin', '{}'::jsonb)
        as findings_by_origin
    from members member
    left join private.authoring_workspace_entities current_entity
      on current_entity.workspace_id = p_workspace_id
     and current_entity.entity_type = 'microsequence'
     and current_entity.entity_id = member.microsequence_ref
    left join lateral (
      select run.*
      from private.authoring_audit_runs run
      join private.authoring_audit_run_completions completion
        on completion.audit_run_id = run.id
      where run.workspace_id = p_workspace_id
        and run.scope_kind = 'microsequence'
        and run.scope_ref = member.microsequence_ref
        and private.authoring_audit_run_is_current_v1(run.id)
      order by run.created_at desc, run.id desc
      limit 1
    ) child on true
    left join private.authoring_audit_run_microsequences audited
      on audited.audit_run_id = child.id
     and audited.microsequence_ref = member.microsequence_ref
    left join lateral (
      select private.authoring_audit_finding_distribution_v1(child.id) as value
    ) finding_distribution on child.id is not null
    order by member.ordinal
  loop
    v_page_count := v_page_count + 1;
    if v_page_count > p_limit then
      v_has_more := true;
      exit;
    end if;
    v_next_cursor := v_component.ordinal::text;
    if v_component.child_run_id is not null then
      v_ready := v_ready + 1;
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'ordinal', v_component.ordinal,
      'microsequenceRef', v_component.microsequence_ref,
      'targetAvailable', v_component.target_available,
      'ready', v_component.child_run_id is not null,
      'auditRunRef', case when v_component.child_run_id is null then null
        else jsonb_build_object(
          'id', v_component.child_run_id,
          'version', v_component.run_version
        ) end,
      'auditedRevision', v_component.audited_workspace_revision,
      'deterministicReport', case when v_component.child_run_id is null then null
        else jsonb_build_object(
          'contract', v_component.deterministic_result->'contract',
          'algorithm', v_component.deterministic_result->'algorithm',
          'scope', v_component.deterministic_result->'scope',
          'materializationStateRevision',
            v_component.deterministic_result->'materializationStateRevision',
          'contentHash', v_component.deterministic_result->'contentHash',
          'summary', v_component.deterministic_result->'summary'
        ) end,
      'findingCount', v_component.finding_count,
      'findingsByCategory', v_component.findings_by_category,
      'findingsByOrigin', v_component.findings_by_origin,
      'microsequence', case when v_component.child_run_id is null then null
        else jsonb_build_object(
          'path', to_jsonb(v_component.scope_path),
          'scopeEntityVersion', v_component.scope_entity_version,
          'materializationStateRevision',
            v_component.materialization_state_revision,
          'contentHash', v_component.content_hash,
          'refs', jsonb_build_object(
            'analysisRef', private.authoring_audit_ref_v1(
              v_component.analysis_id, v_component.analysis_version
            ),
            'effectiveSnapshotRef', private.authoring_audit_ref_v1(
              v_component.snapshot_id, v_component.snapshot_version
            ),
            'blueprintRef', private.authoring_audit_ref_v1(
              v_component.blueprint_id, v_component.blueprint_version
            ),
            'bindingRef', private.authoring_audit_ref_v1(
              v_component.binding_id, v_component.binding_version
            ),
            'manifestRef', private.authoring_audit_ref_v1(
              v_component.manifest_id, v_component.manifest_version
            ),
            'resourceSetRefs', v_component.resource_set_refs
          )
        )
        end
    ));
  end loop;
  if not v_has_more then
    v_next_cursor := null;
  end if;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', v_workspace.revision,
    'partRef', p_part_ref,
    'items', v_items,
    'total', v_total,
    'pageReadyCount', v_ready,
    'nextCursor', v_next_cursor,
    'truncated', v_has_more
  );
end;
$function$;

create function public.register_authoring_audit_run_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_request private.authoring_workspace_requests%rowtype;
  v_workspace private.authoring_workspaces%rowtype;
  v_run private.authoring_audit_runs%rowtype;
  v_scope jsonb;
  v_scope_kind text;
  v_scope_ref text;
  v_kind text;
  v_algorithm jsonb;
  v_report jsonb;
  v_microsequence jsonb;
  v_component jsonb;
  v_child_run private.authoring_audit_runs%rowtype;
  v_path text[];
  v_current_path text[];
  v_microsequence_ref text;
  v_scope_entity_version bigint;
  v_materialization_state_revision bigint;
  v_content_hash text;
  v_target_available boolean;
  v_component_ref jsonb;
  v_binding private.authoring_microsequence_design_bindings%rowtype;
  v_manifest private.authoring_materialization_manifests%rowtype;
  v_refs jsonb;
  v_resource_set_refs jsonb;
  v_part jsonb;
  v_part_microsequence_ids text[];
  v_finding jsonb;
  v_target jsonb;
  v_entity_type text;
  v_entity_path text[];
  v_resource_target_id text;
  v_rule_ref jsonb;
  v_proposed_repair text;
  v_fingerprint text;
  v_finding_id uuid;
  v_finding_ids jsonb := '[]'::jsonb;
  v_next_revision bigint;
  v_result jsonb;
  v_summary jsonb;
  v_distribution jsonb;
  v_ordinal integer := 0;
begin
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[a-f0-9]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or jsonb_typeof(p_audit) <> 'object'
     or pg_column_size(p_audit) > 4194304
     or not (p_audit ?& array[
       'contract', 'kind', 'scope', 'algorithm',
       'microsequences', 'report', 'findings'
     ])
     or exists (
       select 1 from jsonb_object_keys(p_audit) field_name
       where field_name not in (
         'contract', 'kind', 'scope', 'algorithm',
         'microsequences', 'components', 'report', 'findings'
       )
     )
     or p_audit->>'contract' <> 'AuthoringConformanceAudit@1'
     or jsonb_typeof(p_audit->'scope') <> 'object'
     or jsonb_typeof(p_audit->'algorithm') <> 'object'
     or jsonb_typeof(p_audit->'microsequences') <> 'array'
     or jsonb_array_length(p_audit->'microsequences') > 500
     or (
       p_audit ? 'components'
       and (
         jsonb_typeof(p_audit->'components') <> 'array'
         or jsonb_array_length(p_audit->'components') > 500
       )
     )
     or jsonb_typeof(p_audit->'report') <> 'object'
     or jsonb_typeof(p_audit->'findings') <> 'array'
     or jsonb_array_length(p_audit->'findings') > 5000
     or private.authoring_design_contains_forbidden_key_v1(p_audit) then
    raise exception 'Rodada determinística inválida.' using errcode = '22023';
  end if;
  v_scope := p_audit->'scope';
  v_scope_kind := v_scope->>'kind';
  v_scope_ref := nullif(btrim(v_scope->>'ref'), '');
  v_kind := p_audit->>'kind';
  v_algorithm := p_audit->'algorithm';
  v_report := p_audit->'report';
  if exists (
       select 1 from jsonb_object_keys(v_scope) field_name
       where field_name not in ('kind', 'ref')
     )
     or v_scope_kind not in ('microsequence', 'part')
     or v_scope_ref is null
     or char_length(v_scope_ref) > 240
     or v_kind not in ('audit', 'reaudit')
     or not (v_algorithm ?& array['id', 'version'])
     or exists (
       select 1 from jsonb_object_keys(v_algorithm) field_name
       where field_name not in ('id', 'version')
     )
     or nullif(btrim(v_algorithm->>'id'), '') is null
     or char_length(v_algorithm->>'id') > 160
     or coalesce(v_algorithm->>'version', '') !~
       '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
     or v_report->>'contract' is distinct from p_audit->>'contract'
     or v_report->'algorithm' is distinct from v_algorithm
     or v_report->'scope' is distinct from v_scope
     or coalesce(v_report->>'auditedRevision', '') !~ '^[1-9][0-9]{0,18}$'
     or (v_report->>'auditedRevision')::bigint is distinct from
       p_expected_revision
      or jsonb_typeof(v_report->'checks') <> 'array'
      or jsonb_typeof(v_report->'metrics') <> 'array'
      or jsonb_typeof(v_report->'summary') <> 'object'
      or coalesce(v_report#>>'{summary,deterministicFindingCount}', '')
        !~ '^[0-9]{1,4}$'
      or (v_report#>>'{summary,deterministicFindingCount}')::integer
        is distinct from jsonb_array_length(p_audit->'findings') then
    raise exception 'Identidade da rodada determinística inválida.'
      using errcode = '22023';
  end if;
  if (v_scope_kind = 'part' and (
        jsonb_typeof(p_audit->'components') <> 'array'
        or jsonb_array_length(p_audit->'components') < 1
        or jsonb_array_length(p_audit->'microsequences') <> 0
        or jsonb_typeof(v_report#>'{refs,auditRefs}') <> 'object'
      ))
     or (v_scope_kind = 'microsequence' and (
       p_audit ? 'components'
       or jsonb_array_length(p_audit->'microsequences') <> 1
     )) then
    raise exception 'Componentes versionados incompatíveis com o escopo.'
      using errcode = '22023';
  end if;

  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'authoring-audit-request:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(p_actor_id, p_request_id);
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id and request.request_id = p_request_id;
  if found then
    if v_request.workspace_id <> p_workspace_id
       or v_request.operation <> 'run_authoring_audit'
       or v_request.payload_hash <> p_payload_hash then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null
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
  if v_workspace.authoring_state#>>'{mandate,kind}' is distinct from 'audit'
     or nullif(btrim(v_workspace.authoring_state#>>'{mandate,id}'), '') is null
     or jsonb_typeof(v_workspace.authoring_state->'mandate') <> 'object' then
    raise exception 'A auditoria exige mandato audit vigente.'
      using errcode = '42501';
  end if;

  if v_scope_kind = 'part' then
    select part into v_part
    from jsonb_array_elements(v_workspace.authoring_state->'parts') part
    where part->>'id' = v_scope_ref;
    if v_part is null
       or (
         v_workspace.authoring_state#>>'{mandate,targetPartId}' is not null
         and v_workspace.authoring_state#>>'{mandate,targetPartId}'
           is distinct from v_scope_ref
       ) then
      raise exception 'A Parte não pertence ao mandato de auditoria.'
        using errcode = '42501';
    end if;
  elsif not private.authoring_audit_target_in_part_v1(
    p_workspace_id,
    v_workspace.authoring_state,
    'microsequence',
    private.authoring_design_scope_path_v1(
      p_workspace_id, 'microsequence', v_scope_ref
    )
  ) then
    raise exception 'A microssequência escapa do mandato de auditoria.'
      using errcode = '42501';
  end if;

  insert into private.authoring_audit_runs(
    workspace_id, kind, scope_kind, scope_ref,
    audited_workspace_revision, algorithm_id, algorithm_version,
    deterministic_result, mandate_snapshot, result_hash,
    deterministic_finding_count,
    created_by
  ) values(
    p_workspace_id, v_kind, v_scope_kind, v_scope_ref,
    p_expected_revision, v_algorithm->>'id', v_algorithm->>'version',
    v_report, v_workspace.authoring_state->'mandate',
    private.authoring_design_json_hash_v1(p_audit),
    jsonb_array_length(p_audit->'findings'),
    p_actor_id
  ) returning * into v_run;

  for v_microsequence in
    select value
    from jsonb_array_elements(p_audit->'microsequences')
      with ordinality item(value, ordinal)
    order by ordinal
  loop
    v_ordinal := v_ordinal + 1;
    if jsonb_typeof(v_microsequence) <> 'object'
       or not (v_microsequence ?& array[
         'path', 'scopeEntityVersion', 'materializationStateRevision',
         'contentHash', 'refs'
       ])
       or exists (
         select 1 from jsonb_object_keys(v_microsequence) field_name
         where field_name not in (
           'path', 'scopeEntityVersion', 'materializationStateRevision',
           'contentHash', 'refs'
         )
       )
       or jsonb_typeof(v_microsequence->'path') <> 'array'
       or jsonb_array_length(v_microsequence->'path') <> 4
       or jsonb_typeof(v_microsequence->'refs') <> 'object'
       or coalesce(v_microsequence->>'scopeEntityVersion', '')
         !~ '^[1-9][0-9]{0,18}$'
       or coalesce(v_microsequence->>'materializationStateRevision', '')
         !~ '^[0-9]{1,19}$'
       or coalesce(v_microsequence->>'contentHash', '') !~ '^[a-f0-9]{64}$'
    then
      raise exception 'Microssequência auditada inválida.'
        using errcode = '22023';
    end if;
    begin
      select array_agg(value order by ordinal) into v_path
      from jsonb_array_elements_text(v_microsequence->'path')
        with ordinality path_part(value, ordinal);
    exception when others then
      raise exception 'Caminho auditado inválido.' using errcode = '22023';
    end;
    if exists (
      select 1 from unnest(v_path) path_part
      where nullif(btrim(path_part), '') is null
        or path_part <> btrim(path_part)
        or char_length(path_part) > 240
    ) then
      raise exception 'Caminho auditado inválido.' using errcode = '22023';
    end if;
    v_microsequence_ref := v_path[4];
    v_current_path := private.authoring_design_scope_path_v1(
      p_workspace_id, 'microsequence', v_microsequence_ref
    );
    if v_current_path is distinct from v_path
       or (v_scope_kind = 'microsequence' and (
         v_ordinal <> 1 or v_microsequence_ref <> v_scope_ref
       )) then
      raise exception 'Escopo auditado diverge do workspace corrente.'
        using errcode = '40001';
    end if;
    v_scope_entity_version := private.authoring_design_scope_entity_version_v1(
      p_workspace_id, 'microsequence', v_microsequence_ref
    );
    select coalesce(state.materialization_revision, 0)
    into v_materialization_state_revision
    from (select 1) seed
    left join private.authoring_materialization_states state
      on state.workspace_id = p_workspace_id
     and state.microsequence_ref = v_microsequence_ref;
    v_content_hash := private.authoring_materialized_content_hash_v1(
      p_workspace_id, v_microsequence_ref
    );
    if v_scope_entity_version is distinct from
         (v_microsequence->>'scopeEntityVersion')::bigint
       or v_materialization_state_revision is distinct from
         (v_microsequence->>'materializationStateRevision')::bigint
       or v_content_hash is distinct from v_microsequence->>'contentHash' then
      raise exception 'A materialização mudou durante a auditoria.'
        using errcode = '40001';
    end if;
    select * into v_binding
    from private.authoring_microsequence_design_bindings binding
    where binding.workspace_id = p_workspace_id
      and binding.microsequence_ref = v_microsequence_ref;
    select * into v_manifest
    from private.authoring_materialization_manifests manifest
    where manifest.workspace_id = p_workspace_id
      and manifest.scope_ref = v_microsequence_ref
    order by manifest.created_revision desc, manifest.created_at desc
    limit 1;
    v_refs := v_microsequence->'refs';
    if exists (
       select 1 from jsonb_object_keys(v_refs) field_name
       where field_name not in (
         'analysisRef', 'effectiveSnapshotRef', 'blueprintRef',
         'bindingRef', 'manifestRef', 'resourceSetRefs'
       )
    )
       or v_refs->'analysisRef' is distinct from
         private.authoring_audit_ref_v1(v_binding.analysis_id, v_binding.analysis_version)
       or v_refs->'effectiveSnapshotRef' is distinct from
         private.authoring_audit_ref_v1(v_binding.snapshot_id, v_binding.snapshot_version)
       or v_refs->'blueprintRef' is distinct from
         private.authoring_audit_ref_v1(v_binding.blueprint_id, v_binding.blueprint_version)
       or v_refs->'bindingRef' is distinct from
         private.authoring_audit_ref_v1(v_binding.binding_id, v_binding.binding_version)
       or v_refs->'manifestRef' is distinct from
         private.authoring_audit_ref_v1(v_manifest.manifest_id, v_manifest.manifest_version)
       or jsonb_typeof(v_refs->'resourceSetRefs') <> 'array'
       or v_manifest.content_hash is distinct from v_content_hash
       or v_manifest.materialization_state_revision is distinct from
         v_materialization_state_revision then
      raise exception 'Os artefatos auditados não são o snapshot corrente.'
        using errcode = '40001';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', snapshot_set.resource_set_id,
      'version', snapshot_set.resource_set_version
    ) order by snapshot_set.ordinal), '[]'::jsonb)
    into v_resource_set_refs
    from private.authoring_effective_design_snapshot_resource_sets snapshot_set
    where snapshot_set.workspace_id = p_workspace_id
      and snapshot_set.snapshot_id = v_binding.snapshot_id
      and snapshot_set.snapshot_version = v_binding.snapshot_version;
    if v_refs->'resourceSetRefs' is distinct from v_resource_set_refs then
      raise exception 'A condição de ResourceSet diverge do snapshot auditado.'
        using errcode = '40001';
    end if;
    insert into private.authoring_audit_run_microsequences(
      audit_run_id, workspace_id, ordinal, microsequence_ref, scope_path,
      scope_entity_version, materialization_state_revision, content_hash,
      analysis_id, analysis_version, snapshot_id, snapshot_version,
      blueprint_id, blueprint_version, binding_id, binding_version,
      manifest_id, manifest_version, resource_set_refs
    ) values(
      v_run.id, p_workspace_id, v_ordinal, v_microsequence_ref, v_path,
      v_scope_entity_version, v_materialization_state_revision, v_content_hash,
      v_binding.analysis_id, v_binding.analysis_version,
      v_binding.snapshot_id, v_binding.snapshot_version,
      v_binding.blueprint_id, v_binding.blueprint_version,
      v_binding.binding_id, v_binding.binding_version,
      v_manifest.manifest_id, v_manifest.manifest_version,
      v_resource_set_refs
    );
  end loop;

  if v_scope_kind = 'microsequence' and v_ordinal <> 1 then
    raise exception 'Auditoria de microssequência exige um único alvo.'
      using errcode = '22023';
  elsif v_scope_kind = 'part' then
    select array_agg(microsequence_id order by ordinal)
    into v_part_microsequence_ids
    from jsonb_array_elements_text(v_part->'microsequenceIds')
      with ordinality item(microsequence_id, ordinal);
    if jsonb_array_length(p_audit->'components') <>
         cardinality(v_part_microsequence_ids)
       or jsonb_typeof(v_report#>'{refs,microsequenceRefs}') <> 'object'
       or coalesce(v_report#>>'{refs,microsequenceRefs,count}', '')
         !~ '^[0-9]{1,3}$'
       or (v_report#>>'{refs,microsequenceRefs,count}')::integer <>
         cardinality(v_part_microsequence_ids)
       or jsonb_typeof(v_report#>'{refs,microsequenceRefs,items}') <> 'array'
       or v_report#>'{refs,microsequenceRefs,items}' is distinct from (
         select coalesce(jsonb_agg(microsequence_id order by ordinal), '[]'::jsonb)
         from (
           select microsequence_id, ordinal
           from unnest(v_part_microsequence_ids)
             with ordinality member(microsequence_id, ordinal)
           order by ordinal limit 20
         ) bounded
       )
       or coalesce((v_report#>>'{refs,microsequenceRefs,truncated}')::boolean, false)
         is distinct from (cardinality(v_part_microsequence_ids) > 20) then
      raise exception 'A rodada não congelou o recorte corrente completo da Parte.'
        using errcode = '40001';
    end if;
    v_ordinal := 0;
    for v_component in
      select value
      from jsonb_array_elements(p_audit->'components')
        with ordinality item(value, ordinal)
      order by ordinal
    loop
      v_ordinal := v_ordinal + 1;
      if jsonb_typeof(v_component) <> 'object'
         or not (v_component ?& array[
           'ordinal', 'microsequenceRef', 'targetAvailable', 'auditRunRef'
         ])
         or exists (
            select 1 from jsonb_object_keys(v_component) field_name
            where field_name not in (
              'ordinal', 'microsequenceRef', 'targetAvailable', 'auditRunRef'
            )
          )
         or coalesce(v_component->>'ordinal', '') !~ '^[1-9][0-9]{0,2}$'
         or (v_component->>'ordinal')::integer <> v_ordinal
         or v_component->>'microsequenceRef' is distinct from
           v_part_microsequence_ids[v_ordinal]
         or jsonb_typeof(v_component->'targetAvailable') <> 'boolean'
         or not (
           v_component->'auditRunRef' = 'null'::jsonb
           or jsonb_typeof(v_component->'auditRunRef') = 'object'
         ) then
        raise exception 'Mapeamento de componente inválido.' using errcode = '22023';
      end if;
      v_microsequence_ref := v_component->>'microsequenceRef';
      v_current_path := private.authoring_design_scope_path_v1(
        p_workspace_id, 'microsequence', v_microsequence_ref
      );
      v_target_available := v_current_path is not null;
      if (v_component->>'targetAvailable')::boolean is distinct from
           v_target_available
         or (not v_target_available and
           v_component->'auditRunRef' <> 'null'::jsonb) then
        raise exception 'Disponibilidade do componente mudou durante a auditoria.'
          using errcode = '40001';
      end if;
      v_component_ref := v_component->'auditRunRef';
      v_child_run := null;
      if v_target_available then
        if jsonb_typeof(v_component_ref) <> 'object'
           or exists (
             select 1 from jsonb_object_keys(v_component_ref) field_name
             where field_name not in ('id', 'version')
           )
           or coalesce(v_component_ref->>'id', '') !~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
           or v_component_ref->>'version' <> '1.0.0' then
          raise exception 'Referência de componente inválida.' using errcode = '22023';
        end if;
        select child.* into v_child_run
        from private.authoring_audit_runs child
        join private.authoring_audit_run_completions completion
          on completion.audit_run_id = child.id
        where child.id = (v_component_ref->>'id')::uuid
          and child.run_version = v_component_ref->>'version'
          and child.workspace_id = p_workspace_id
          and child.scope_kind = 'microsequence'
          and child.scope_ref = v_microsequence_ref
          and private.authoring_audit_run_is_current_v1(child.id);
        if not found then
          raise exception 'A rodada componente não está concluída ou corrente.'
            using errcode = '40001';
        end if;
        insert into private.authoring_audit_run_microsequences(
          audit_run_id, workspace_id, ordinal, microsequence_ref, scope_path,
          scope_entity_version, materialization_state_revision, content_hash,
          analysis_id, analysis_version, snapshot_id, snapshot_version,
          blueprint_id, blueprint_version, binding_id, binding_version,
          manifest_id, manifest_version, resource_set_refs
        ) select
          v_run.id, p_workspace_id, v_ordinal, audited.microsequence_ref,
          audited.scope_path, audited.scope_entity_version,
          audited.materialization_state_revision, audited.content_hash,
          audited.analysis_id, audited.analysis_version,
          audited.snapshot_id, audited.snapshot_version,
          audited.blueprint_id, audited.blueprint_version,
          audited.binding_id, audited.binding_version,
          audited.manifest_id, audited.manifest_version,
          audited.resource_set_refs
        from private.authoring_audit_run_microsequences audited
        where audited.audit_run_id = v_child_run.id
          and audited.microsequence_ref = v_microsequence_ref;
      end if;
      insert into private.authoring_audit_run_components(
        parent_audit_run_id, ordinal, microsequence_ref,
        target_available, child_audit_run_id
      ) values(
        v_run.id, v_ordinal, v_microsequence_ref,
        v_target_available, v_child_run.id
      );
    end loop;
    with child_distributions as materialized (
      select private.authoring_audit_finding_distribution_v1(
        component.child_audit_run_id
      ) value
      from private.authoring_audit_run_components component
      where component.parent_audit_run_id = v_run.id
        and component.child_audit_run_id is not null
    ), category_counts as (
      select category.key, sum((category.value)::integer)::integer total
      from child_distributions distribution
      cross join lateral jsonb_each_text(
        distribution.value->'byCategory'
      ) category
      group by category.key
    ), origin_counts as (
      select origin.key, sum((origin.value)::integer)::integer total
      from child_distributions distribution
      cross join lateral jsonb_each_text(
        distribution.value->'byOrigin'
      ) origin
      group by origin.key
    )
    select jsonb_build_object(
      'microsequenceCount', cardinality(v_part_microsequence_ids),
      'auditedMicrosequenceCount', (
        select count(*)::integer from child_distributions
      ),
      'findingCount', coalesce((
        select sum((value->>'total')::integer)::integer
        from child_distributions
      ), 0),
      'findingsByCategory', coalesce((
        select jsonb_object_agg(key, total) from category_counts
      ), '{}'::jsonb),
      'findingsByOrigin', coalesce((
        select jsonb_object_agg(key, total) from origin_counts
      ), '{}'::jsonb)
    ) into v_distribution;
    if v_report->'distribution' is distinct from v_distribution then
      raise exception 'A distribuição da Parte diverge das rodadas componentes.'
        using errcode = '40001';
    end if;
    if jsonb_typeof(v_report#>'{refs,auditRefs}') <> 'object'
       or coalesce(v_report#>>'{refs,auditRefs,count}', '') !~ '^[0-9]{1,3}$'
       or (v_report#>>'{refs,auditRefs,count}')::integer is distinct from (
         select count(*)::integer
         from private.authoring_audit_run_components component
         where component.parent_audit_run_id = v_run.id
           and component.child_audit_run_id is not null
       )
       or jsonb_typeof(v_report#>'{refs,auditRefs,items}') <> 'array'
       or v_report#>'{refs,auditRefs,items}' is distinct from (
         select coalesce(jsonb_agg(jsonb_build_object(
           'scopeRef', component.microsequence_ref,
           'auditedRevision', child.audited_workspace_revision,
           'contentHash', audited.content_hash,
           'auditRunRef', private.authoring_audit_run_ref_v1(child)
         ) order by component.ordinal), '[]'::jsonb)
         from (
           select *
           from private.authoring_audit_run_components component
           where component.parent_audit_run_id = v_run.id
             and component.child_audit_run_id is not null
           order by component.ordinal limit 20
         ) component
         join private.authoring_audit_runs child
           on child.id = component.child_audit_run_id
         join private.authoring_audit_run_microsequences audited
           on audited.audit_run_id = child.id
          and audited.microsequence_ref = component.microsequence_ref
       )
       or coalesce((v_report#>>'{refs,auditRefs,truncated}')::boolean, false)
         is distinct from ((v_report#>>'{refs,auditRefs,count}')::integer > 20)
    then
      raise exception 'A proveniência componente diverge da rodada congelada.'
        using errcode = '40001';
    end if;
  end if;

  v_ordinal := 0;
  for v_finding in
    select value from jsonb_array_elements(p_audit->'findings')
      with ordinality item(value, ordinal)
    order by ordinal
  loop
    v_ordinal := v_ordinal + 1;
    if jsonb_typeof(v_finding) <> 'object'
       or not (v_finding ?& array[
         'code', 'origin', 'category', 'severity', 'target',
         'ruleRef', 'publicEvidence', 'proposedRepair'
       ])
       or exists (
         select 1 from jsonb_object_keys(v_finding) field_name
         where field_name not in (
           'code', 'origin', 'category', 'severity', 'target',
           'ruleRef', 'publicEvidence', 'proposedRepair', 'fingerprint'
         )
       )
       or v_finding->>'origin' <> 'deterministic'
       or coalesce(v_finding->>'code', '') !~ '^[a-z][a-z0-9_.-]{1,119}$'
       or nullif(btrim(v_finding->>'category'), '') is null
       or v_finding->>'category' not in (
         'structure', 'design', 'explanation', 'practice', 'resources',
         'coverage', 'coherence', 'dependencies', 'redundancy', 'integration'
       )
       or v_finding->>'severity' not in ('low', 'medium', 'high', 'critical')
       or jsonb_typeof(v_finding->'target') <> 'object'
       or jsonb_typeof(v_finding->'ruleRef') <> 'object'
       or nullif(btrim(v_finding->>'publicEvidence'), '') is null
       or char_length(v_finding->>'publicEvidence') > 2000
       or (
         v_finding->'proposedRepair' <> 'null'::jsonb
         and (
           jsonb_typeof(v_finding->'proposedRepair') <> 'string'
           or nullif(btrim(v_finding->>'proposedRepair'), '') is null
           or char_length(v_finding->>'proposedRepair') > 1000
         )
       ) then
      raise exception 'Achado determinístico inválido.' using errcode = '22023';
    end if;
    v_target := v_finding->'target';
    v_rule_ref := v_finding->'ruleRef';
    if not (v_target ?& array['entityType', 'entityPath'])
       or exists (
         select 1 from jsonb_object_keys(v_target) field_name
         where field_name not in ('entityType', 'entityPath', 'resourceTargetId')
       )
       or not (v_rule_ref ?& array['kind', 'id', 'version'])
       or exists (
         select 1 from jsonb_object_keys(v_rule_ref) field_name
         where field_name not in ('kind', 'id', 'version')
       )
       or jsonb_typeof(v_target->'entityPath') <> 'array'
       or nullif(btrim(v_rule_ref->>'kind'), '') is null
       or char_length(v_rule_ref->>'kind') > 64
       or nullif(btrim(v_rule_ref->>'id'), '') is null
       or char_length(v_rule_ref->>'id') > 240
       or (
         v_rule_ref->'version' <> 'null'::jsonb
         and coalesce(v_rule_ref->>'version', '') !~
           '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
       ) then
      raise exception 'Alvo ou regra determinística inválida.'
        using errcode = '22023';
    end if;
    v_entity_type := v_target->>'entityType';
    begin
      select coalesce(array_agg(value order by ordinal), '{}') into v_entity_path
      from jsonb_array_elements_text(v_target->'entityPath')
        with ordinality path_part(value, ordinal);
    exception when others then
      raise exception 'Alvo determinístico inválido.' using errcode = '22023';
    end;
    v_resource_target_id := nullif(btrim(v_target->>'resourceTargetId'), '');
    if v_entity_type not in (
         'workspace', 'course', 'module', 'lesson',
         'microsequence', 'card', 'resource'
       )
       or cardinality(v_entity_path) <> (case v_entity_type
         when 'workspace' then 0 when 'course' then 1 when 'module' then 2
         when 'lesson' then 3 when 'microsequence' then 4 else 5 end)
       or ((v_entity_type = 'resource') <> (v_resource_target_id is not null))
       or char_length(coalesce(v_resource_target_id, '')) > 240
       or not private.authoring_audit_target_in_run_v1(
         v_run.id, v_entity_type, v_entity_path
       )
       or not private.authoring_observation_target_exists_v1(
         p_workspace_id, v_entity_type, v_entity_path, v_resource_target_id
       ) then
      raise exception 'O alvo do achado não pertence ao snapshot auditado.'
        using errcode = 'P0002';
    end if;
    v_proposed_repair := case
      when v_finding->'proposedRepair' = 'null'::jsonb then null
      else btrim(v_finding->>'proposedRepair')
    end;
    v_fingerprint := private.authoring_design_json_hash_v1(jsonb_build_object(
      'code', v_finding->>'code',
      'target', jsonb_build_object(
        'entityType', v_entity_type,
        'entityPath', to_jsonb(v_entity_path),
        'resourceTargetId', v_resource_target_id
      ),
      'ruleRef', jsonb_build_object(
        'kind', btrim(v_rule_ref->>'kind'),
        'id', btrim(v_rule_ref->>'id'),
        'version', nullif(btrim(v_rule_ref->>'version'), '')
      )
    ));
    insert into private.authoring_workspace_observations(
      workspace_id, author_id, kind, entity_type, entity_path,
      resource_target_id, body, category, severity, status,
      proposed_repair, audit_revision, audit_part_id,
      audit_run_id, audit_finding_ordinal, finding_code, finding_origin,
      rule_kind, rule_id, rule_version, public_evidence, finding_fingerprint
    ) values(
      p_workspace_id, p_actor_id, 'audit_finding', v_entity_type, v_entity_path,
      v_resource_target_id, left(btrim(v_finding->>'publicEvidence'), 1000),
      btrim(v_finding->>'category'), v_finding->>'severity', 'open',
      v_proposed_repair, p_expected_revision,
      case when v_scope_kind = 'part' then v_scope_ref else null end,
      v_run.id, v_ordinal, v_finding->>'code', 'deterministic',
      btrim(v_rule_ref->>'kind'), btrim(v_rule_ref->>'id'),
      nullif(btrim(v_rule_ref->>'version'), ''),
      btrim(v_finding->>'publicEvidence'), v_fingerprint
    ) returning id into v_finding_id;
    v_finding_ids := v_finding_ids || jsonb_build_array(v_finding_id);
  end loop;

  v_next_revision := p_expected_revision + 1;
  update private.authoring_workspaces workspace
  set revision = v_next_revision, updated_at = now()
  where workspace.id = p_workspace_id
  returning * into v_workspace;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'auditRunRef', private.authoring_audit_run_ref_v1(v_run),
    'kind', v_kind,
    'status', 'semantic_pending',
    'scope', v_scope,
    'startedRevision', p_expected_revision,
    'revision', v_next_revision,
    'findingCount', jsonb_array_length(v_finding_ids),
    'createdAt', v_run.created_at,
    'idempotent', false
  );
  v_summary := jsonb_build_object(
    'auditRunRef', private.authoring_audit_run_ref_v1(v_run),
    'scope', v_scope,
    'kind', v_kind,
    'status', 'semantic_pending',
    'findingCount', jsonb_array_length(v_finding_ids)
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values(
    p_actor_id, p_request_id, 'run_authoring_audit', p_payload_hash,
    p_workspace_id, v_result
  );
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values(
    p_workspace_id, v_next_revision, 'run_authoring_audit', v_summary, p_actor_id
  );
  return v_result;
end;
$function$;

create function public.record_authoring_semantic_audit_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_request_id text,
  p_payload_hash text,
  p_expected_revision bigint,
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
  v_run private.authoring_audit_runs%rowtype;
  v_run_id uuid;
  v_run_version text;
  v_finding jsonb;
  v_target jsonb;
  v_entity_type text;
  v_entity_path text[];
  v_resource_target_id text;
  v_rule_ref jsonb;
  v_proposed_repair text;
  v_fingerprint text;
  v_finding_id uuid;
  v_finding_ids jsonb := '[]'::jsonb;
  v_verification jsonb;
  v_verified_finding private.authoring_workspace_observations%rowtype;
  v_verification_finding_ids jsonb := '[]'::jsonb;
  v_persisted_verifications jsonb := '[]'::jsonb;
  v_seen_verification_identities jsonb := '[]'::jsonb;
  v_verification_identity_hash text;
  v_recurrence_id uuid;
  v_next_revision bigint;
  v_result jsonb;
  v_summary jsonb;
  v_ordinal integer;
begin
  if p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_payload_hash !~ '^[a-f0-9]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 1
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 2097152
     or not (p_payload ?& array['auditRunRef', 'findings', 'verifications'])
     or exists (
       select 1 from jsonb_object_keys(p_payload) field_name
       where field_name not in ('auditRunRef', 'findings', 'verifications')
     )
     or jsonb_typeof(p_payload->'auditRunRef') <> 'object'
     or jsonb_typeof(p_payload->'findings') <> 'array'
     or jsonb_array_length(p_payload->'findings') > 100
     or jsonb_typeof(p_payload->'verifications') <> 'array'
     or jsonb_array_length(p_payload->'verifications') > 100
     or exists (
       select 1
       from jsonb_array_elements(p_payload->'verifications') verification(value)
       group by verification.value->>'findingId'
       having count(*) > 1
     )
     or private.authoring_design_contains_forbidden_key_v1(p_payload) then
    raise exception 'Auditoria semântica inválida.' using errcode = '22023';
  end if;
  if exists (
       select 1 from jsonb_object_keys(p_payload->'auditRunRef') field_name
       where field_name not in ('id', 'version')
     )
     or coalesce(p_payload#>>'{auditRunRef,id}', '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or p_payload#>>'{auditRunRef,version}' <> '1.0.0' then
    raise exception 'Referência da rodada inválida.' using errcode = '22023';
  end if;
  v_run_id := (p_payload#>>'{auditRunRef,id}')::uuid;
  v_run_version := p_payload#>>'{auditRunRef,version}';

  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'review'
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'authoring-audit-request:' || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform private.prune_authoring_workspace_state_v5(p_actor_id, p_request_id);
  select * into v_request
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id and request.request_id = p_request_id;
  if found then
    if v_request.workspace_id <> p_workspace_id
       or v_request.operation <> 'record_authoring_semantic_audit'
       or v_request.payload_hash <> p_payload_hash then
      raise exception 'requestId reutilizado com dados diferentes.'
        using errcode = '23505';
    end if;
    return v_request.result || jsonb_build_object('idempotent', true);
  end if;

  select * into v_workspace
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null
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
  if v_workspace.authoring_state#>>'{mandate,kind}' is distinct from 'audit' then
    raise exception 'A auditoria semântica exige mandato audit vigente.'
      using errcode = '42501';
  end if;
  select * into v_run
  from private.authoring_audit_runs run
  where run.id = v_run_id
    and run.run_version = v_run_version
    and run.workspace_id = p_workspace_id;
  if not found then
    raise exception 'Rodada de auditoria inexistente.' using errcode = 'P0002';
  end if;
  if v_workspace.revision <> v_run.audited_workspace_revision + 1 then
    raise exception 'O workspace mudou depois da rodada determinística.' using
      errcode = '40001',
      detail = jsonb_build_object(
        'auditedRevision', v_run.audited_workspace_revision,
        'currentRevision', v_workspace.revision
      )::text;
  end if;
  if exists (
       select 1 from private.authoring_audit_run_completions completion
       where completion.audit_run_id = v_run.id
     ) then
    raise exception 'A rodada de auditoria já foi concluída.'
      using errcode = '23505';
  end if;
  if not private.authoring_audit_run_is_current_v1(v_run.id) then
    raise exception 'O estado mudou após a rodada determinística.'
      using errcode = '40001';
  end if;
  if v_run.scope_kind = 'part'
     and v_workspace.authoring_state#>>'{mandate,targetPartId}' is not null
     and v_workspace.authoring_state#>>'{mandate,targetPartId}'
       is distinct from v_run.scope_ref then
    raise exception 'A rodada escapa da Parte autorizada.'
      using errcode = '42501';
  end if;

  v_ordinal := v_run.deterministic_finding_count;
  for v_finding in
    select value from jsonb_array_elements(p_payload->'findings')
      with ordinality item(value, ordinal)
    order by ordinal
  loop
    v_ordinal := v_ordinal + 1;
    if jsonb_typeof(v_finding) <> 'object'
       or not (v_finding ?& array[
         'code', 'category', 'severity', 'target', 'ruleRef',
         'publicEvidence', 'proposedRepair'
       ])
       or exists (
         select 1 from jsonb_object_keys(v_finding) field_name
         where field_name not in (
          'code', 'category', 'severity', 'target', 'ruleRef',
           'publicEvidence', 'proposedRepair'
         )
       )
       or coalesce(v_finding->>'code', '') !~ '^[a-z][a-z0-9_.-]{1,119}$'
       or v_finding->>'category' not in (
         'structure', 'design', 'explanation', 'practice', 'resources',
         'coverage', 'coherence', 'dependencies', 'redundancy', 'integration'
       )
       or v_finding->>'severity' not in ('low', 'medium', 'high', 'critical')
       or jsonb_typeof(v_finding->'target') <> 'object'
       or jsonb_typeof(v_finding->'ruleRef') <> 'object'
       or nullif(btrim(v_finding->>'publicEvidence'), '') is null
       or char_length(v_finding->>'publicEvidence') > 2000
       or (
         v_finding->'proposedRepair' <> 'null'::jsonb
         and (
           jsonb_typeof(v_finding->'proposedRepair') <> 'string'
           or nullif(btrim(v_finding->>'proposedRepair'), '') is null
           or char_length(v_finding->>'proposedRepair') > 1000
         )
       ) then
      raise exception 'Achado semântico inválido.' using errcode = '22023';
    end if;
    v_target := v_finding->'target';
    v_rule_ref := v_finding->'ruleRef';
    if not (v_target ?& array['entityType', 'entityPath'])
       or exists (
         select 1 from jsonb_object_keys(v_target) field_name
         where field_name not in ('entityType', 'entityPath', 'resourceTargetId')
       )
       or not (v_rule_ref ?& array['kind', 'id', 'version'])
       or exists (
         select 1 from jsonb_object_keys(v_rule_ref) field_name
         where field_name not in ('kind', 'id', 'version')
       )
       or jsonb_typeof(v_target->'entityPath') <> 'array'
       or nullif(btrim(v_rule_ref->>'kind'), '') is null
       or char_length(v_rule_ref->>'kind') > 64
       or nullif(btrim(v_rule_ref->>'id'), '') is null
       or char_length(v_rule_ref->>'id') > 240
       or (
         v_rule_ref->'version' <> 'null'::jsonb
         and coalesce(v_rule_ref->>'version', '') !~
           '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'
       ) then
      raise exception 'Alvo ou regra semântica inválida.' using errcode = '22023';
    end if;
    v_entity_type := v_target->>'entityType';
    begin
      select coalesce(array_agg(value order by ordinal), '{}') into v_entity_path
      from jsonb_array_elements_text(v_target->'entityPath')
        with ordinality path_part(value, ordinal);
    exception when others then
      raise exception 'Alvo semântico inválido.' using errcode = '22023';
    end;
    v_resource_target_id := nullif(btrim(v_target->>'resourceTargetId'), '');
    if v_entity_type not in (
         'workspace', 'course', 'module', 'lesson',
         'microsequence', 'card', 'resource'
       )
       or cardinality(v_entity_path) <> (case v_entity_type
         when 'workspace' then 0 when 'course' then 1 when 'module' then 2
         when 'lesson' then 3 when 'microsequence' then 4 else 5 end)
       or ((v_entity_type = 'resource') <> (v_resource_target_id is not null))
       or not private.authoring_audit_target_in_run_v1(
         v_run.id, v_entity_type, v_entity_path
       )
       or not private.authoring_observation_target_exists_v1(
         p_workspace_id, v_entity_type, v_entity_path, v_resource_target_id
       ) then
      raise exception 'O alvo semântico não pertence à rodada corrente.'
        using errcode = 'P0002';
    end if;
    v_proposed_repair := case
      when v_finding->'proposedRepair' = 'null'::jsonb then null
      else btrim(v_finding->>'proposedRepair')
    end;
    v_fingerprint := private.authoring_design_json_hash_v1(jsonb_build_object(
      'code', v_finding->>'code',
      'target', jsonb_build_object(
        'entityType', v_entity_type,
        'entityPath', to_jsonb(v_entity_path),
        'resourceTargetId', v_resource_target_id
      ),
      'ruleRef', jsonb_build_object(
        'kind', btrim(v_rule_ref->>'kind'),
        'id', btrim(v_rule_ref->>'id'),
        'version', nullif(btrim(v_rule_ref->>'version'), '')
      )
    ));
    insert into private.authoring_workspace_observations(
      workspace_id, author_id, kind, entity_type, entity_path,
      resource_target_id, body, category, severity, status,
      proposed_repair, audit_revision, audit_part_id,
      audit_run_id, audit_finding_ordinal, finding_code, finding_origin,
      rule_kind, rule_id, rule_version, public_evidence, finding_fingerprint
    ) values(
      p_workspace_id, p_actor_id, 'audit_finding', v_entity_type, v_entity_path,
      v_resource_target_id, left(btrim(v_finding->>'publicEvidence'), 1000),
      v_finding->>'category',
      v_finding->>'severity', 'open', v_proposed_repair,
      v_run.audited_workspace_revision,
      case when v_run.scope_kind = 'part' then v_run.scope_ref else null end,
      v_run.id, v_ordinal, v_finding->>'code', 'semantic_audit',
      btrim(v_rule_ref->>'kind'), btrim(v_rule_ref->>'id'),
      nullif(btrim(v_rule_ref->>'version'), ''),
      btrim(v_finding->>'publicEvidence'), v_fingerprint
    ) returning id into v_finding_id;
    v_finding_ids := v_finding_ids || jsonb_build_array(v_finding_id);
  end loop;

  if v_run.kind = 'reaudit' and exists (
    select 1
    from private.authoring_workspace_observations repaired
    where repaired.workspace_id = p_workspace_id
      and repaired.kind = 'audit_finding'
      and repaired.audit_run_id is not null
      and repaired.status = 'repaired'
      and repaired.superseded_by_finding_id is null
      and repaired.resulting_revision is not null
      and repaired.resulting_revision <= v_run.audited_workspace_revision
      and (
        repaired.audit_part_id is null
        or (
          v_run.scope_kind = 'part'
          and repaired.audit_part_id = v_run.scope_ref
        )
      )
      and private.authoring_audit_target_in_run_v1(
        v_run.id,
        repaired.entity_type,
        coalesce(
          private.current_authoring_observation_path_v1(
            p_workspace_id, repaired.entity_type, repaired.entity_path
          ),
          repaired.entity_path
        )
      )
      and not exists (
        select 1
        from private.authoring_workspace_observations newer
        where newer.workspace_id = p_workspace_id
          and newer.kind = 'audit_finding'
          and newer.audit_run_id is not null
          and newer.id <> repaired.id
          and newer.status = 'repaired'
          and newer.resulting_revision <= v_run.audited_workspace_revision
          and private.authoring_audit_findings_same_identity_v1(
            newer, repaired
          )
          and (newer.audit_revision, newer.created_at, newer.id) >
            (repaired.audit_revision, repaired.created_at, repaired.id)
      )
      and not exists (
        select 1
        from jsonb_array_elements(p_payload->'verifications') verification(value)
        where verification.value->>'findingId' = repaired.id::text
      )
  ) then
    raise exception
      'A reauditoria deve verificar todos os reparos elegíveis do escopo.'
      using errcode = '23514';
  end if;

  for v_verification in
    select value from jsonb_array_elements(p_payload->'verifications')
      with ordinality item(value, ordinal)
    order by ordinal
  loop
    if jsonb_typeof(v_verification) <> 'object'
       or not (v_verification ?& array[
         'findingId', 'outcome', 'publicEvidence'
       ])
       or exists (
         select 1 from jsonb_object_keys(v_verification) field_name
         where field_name not in ('findingId', 'outcome', 'publicEvidence')
       )
       or coalesce(v_verification->>'findingId', '') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or v_verification->>'outcome' not in ('resolved', 'still_open')
       or nullif(btrim(v_verification->>'publicEvidence'), '') is null
       or char_length(v_verification->>'publicEvidence') > 1000 then
      raise exception 'Verificação semântica inválida.' using errcode = '22023';
    end if;
    select * into v_verified_finding
    from private.authoring_workspace_observations observation
    where observation.id = (v_verification->>'findingId')::uuid
      and observation.workspace_id = p_workspace_id
      and observation.kind = 'audit_finding'
    for update;
    if found then
      v_verification_identity_hash := private.authoring_design_json_hash_v1(
        private.authoring_audit_finding_identity_v1(v_verified_finding)
      );
    else
      v_verification_identity_hash := null;
    end if;
    if not found
       or v_run.kind <> 'reaudit'
       or v_verified_finding.audit_run_id is null
       or v_verified_finding.status <> 'repaired'
       or v_verified_finding.superseded_by_finding_id is not null
       or v_verified_finding.resulting_revision is null
       or v_verified_finding.resulting_revision > v_run.audited_workspace_revision
       or v_seen_verification_identities ? coalesce(
         v_verification_identity_hash, ''
       )
       or exists (
         select 1
         from private.authoring_workspace_observations newer
         where newer.workspace_id = p_workspace_id
           and newer.kind = 'audit_finding'
           and newer.audit_run_id is not null
           and newer.id <> v_verified_finding.id
           and newer.status = 'repaired'
           and newer.resulting_revision <= v_run.audited_workspace_revision
           and private.authoring_audit_findings_same_identity_v1(
             newer, v_verified_finding
           )
           and (newer.audit_revision, newer.created_at, newer.id) >
             (v_verified_finding.audit_revision,
              v_verified_finding.created_at,
              v_verified_finding.id)
       )
       or (
         v_verified_finding.audit_part_id is not null
         and (
           v_run.scope_kind <> 'part'
           or v_verified_finding.audit_part_id <> v_run.scope_ref
         )
       )
       or (
         v_verification->>'outcome' = 'resolved'
         and exists (
           select 1
           from private.authoring_workspace_observations recurrence
           where (
               recurrence.audit_run_id = v_run.id
               or recurrence.audit_run_id in (
                 select component.child_audit_run_id
                 from private.authoring_audit_run_components component
                 where component.parent_audit_run_id = v_run.id
                   and component.child_audit_run_id is not null
               )
             )
             and private.authoring_audit_findings_same_identity_v1(
               recurrence, v_verified_finding
             )
         )
       )
       or (
         v_verification->>'outcome' = 'still_open'
         and not exists (
           select 1
           from private.authoring_workspace_observations recurrence
           where (
               recurrence.audit_run_id = v_run.id
               or recurrence.audit_run_id in (
                 select component.child_audit_run_id
                 from private.authoring_audit_run_components component
                 where component.parent_audit_run_id = v_run.id
                   and component.child_audit_run_id is not null
               )
             )
             and private.authoring_audit_findings_same_identity_v1(
               recurrence, v_verified_finding
             )
         )
       )
       or not private.authoring_audit_target_in_run_v1(
         v_run.id,
         v_verified_finding.entity_type,
         coalesce(
           private.current_authoring_observation_path_v1(
             p_workspace_id,
             v_verified_finding.entity_type,
             v_verified_finding.entity_path
           ),
           v_verified_finding.entity_path
         )
       ) then
      raise exception 'A verificação não prova reauditoria independente nem ausência de recorrência.'
        using errcode = '23514';
    end if;
    v_seen_verification_identities := v_seen_verification_identities
      || jsonb_build_array(v_verification_identity_hash);
    select recurrence.id into v_recurrence_id
    from private.authoring_workspace_observations recurrence
    where (
        recurrence.audit_run_id = v_run.id
        or recurrence.audit_run_id in (
          select component.child_audit_run_id
          from private.authoring_audit_run_components component
          where component.parent_audit_run_id = v_run.id
            and component.child_audit_run_id is not null
        )
      )
      and private.authoring_audit_findings_same_identity_v1(
        recurrence, v_verified_finding
      )
    order by recurrence.audit_finding_ordinal, recurrence.id
    limit 1;
    v_persisted_verifications := v_persisted_verifications
      || jsonb_build_array(v_verification || jsonb_build_object(
        'correctionRequestId', v_verified_finding.correction_request_id,
        'resultingRevision', v_verified_finding.resulting_revision,
        'statusAtVerification', v_verified_finding.status,
        'identityHash', v_verification_identity_hash,
        'recurrenceFindingId', v_recurrence_id
      ));
    update private.authoring_workspace_observations observation
    set status = case
          when v_verification->>'outcome' = 'resolved' then 'resolved'
          when v_recurrence_id is not null then 'repaired'
          else 'open'
        end,
        pending_correction_request_id = null,
        pending_revision = null,
        verification = btrim(v_verification->>'publicEvidence'),
        verified_revision = p_expected_revision + 1,
        verified_by_audit_run_id = v_run.id,
        superseded_by_finding_id = case
          when v_recurrence_id is not null then v_recurrence_id
          else observation.superseded_by_finding_id
        end,
        updated_at = now()
    where observation.id = v_verified_finding.id;
    v_verification_finding_ids := v_verification_finding_ids
      || jsonb_build_array(v_verified_finding.id);
  end loop;

  v_next_revision := p_expected_revision + 1;
  insert into private.authoring_audit_run_completions(
    audit_run_id, workspace_id, completed_revision, semantic_result,
    result_hash, semantic_finding_count, verification_count,
    completed_by
  ) values(
    v_run.id, p_workspace_id, v_next_revision,
    jsonb_build_object(
      'findings', p_payload->'findings',
      'verifications', v_persisted_verifications
    ),
    private.authoring_design_json_hash_v1(p_payload),
    jsonb_array_length(v_finding_ids),
    jsonb_array_length(v_verification_finding_ids),
    p_actor_id
  );
  update private.authoring_workspaces workspace
  set revision = v_next_revision, updated_at = now()
  where workspace.id = p_workspace_id
  returning * into v_workspace;
  v_result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'auditRunRef', private.authoring_audit_run_ref_v1(v_run),
    'status', 'complete',
    'recordedCount', jsonb_array_length(v_finding_ids),
    'verifiedCount', jsonb_array_length(v_verification_finding_ids),
    'findingIds', v_finding_ids,
    'verificationFindingIds', v_verification_finding_ids,
    'revision', v_next_revision,
    'idempotent', false
  );
  v_summary := jsonb_build_object(
    'auditRunRef', private.authoring_audit_run_ref_v1(v_run),
    'status', 'complete',
    'recordedCount', jsonb_array_length(v_finding_ids),
    'verifiedCount', jsonb_array_length(v_verification_finding_ids)
  );
  insert into private.authoring_workspace_requests(
    owner_id, request_id, operation, payload_hash, workspace_id, result
  ) values(
    p_actor_id, p_request_id, 'record_authoring_semantic_audit',
    p_payload_hash, p_workspace_id, v_result
  );
  insert into private.authoring_workspace_events(
    workspace_id, revision, operation, summary, actor_id
  ) values(
    p_workspace_id, v_next_revision, 'record_authoring_semantic_audit',
    v_summary, p_actor_id
  );
  return v_result;
end;
$function$;

alter function public.update_authoring_workspace_continuity_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) rename to update_authoring_workspace_continuity_before_audit_runs_v1;

revoke all on function public.update_authoring_workspace_continuity_before_audit_runs_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) from public, anon, authenticated, service_role;

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
  v_current_state jsonb;
begin
  -- Replay permanece estrito e não volta a julgar uma intenção já registrada
  -- contra um estado posterior do workspace.
  perform 1
  from private.authoring_workspace_requests request
  where request.owner_id = p_actor_id
    and request.request_id = p_request_id;
  if found then
    return public.update_authoring_workspace_continuity_before_audit_runs_v1(
      p_actor_id, p_workspace_id, p_request_id, p_payload_hash,
      p_expected_revision, p_operation, p_state
    );
  end if;

  if p_operation in ('set_mandate', 'clear_mandate') then
    select workspace.authoring_state into v_current_state
    from private.authoring_workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.deleted_at is null
    for update;
    if v_current_state#>>'{mandate,kind}' = 'repair_findings'
       and p_state->'mandate' is distinct from v_current_state->'mandate'
       and exists (
         select 1
         from jsonb_array_elements_text(
           v_current_state#>'{mandate,findingIds}'
         ) requested(finding_id)
         left join private.authoring_workspace_observations finding
           on finding.workspace_id = p_workspace_id
          and finding.id = requested.finding_id::uuid
          and finding.kind = 'audit_finding'
         where finding.id is null
            or finding.status not in ('repaired', 'resolved', 'rejected')
       ) then
      raise exception
        'O mandato de reparo atual ainda possui achados não concluídos.'
        using errcode = '23514';
    end if;
  end if;

  if p_operation = 'set_mandate'
     and jsonb_typeof(p_state) = 'object'
     and p_state#>>'{mandate,kind}' = 'repair_findings'
     and jsonb_typeof(p_state#>'{mandate,findingIds}') = 'array'
     and not exists (
       select 1
       from jsonb_array_elements_text(p_state#>'{mandate,findingIds}') id(value)
       where id.value !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     ) then
    -- O mesmo lock usado pela mutação canônica fecha a janela entre esta
    -- revalidação e a persistência do mandato.
    perform 1
    from private.authoring_workspaces workspace
    where workspace.id = p_workspace_id
      and workspace.deleted_at is null
    for update;
    if exists (
      select 1
      from jsonb_array_elements_text(
        p_state#>'{mandate,findingIds}'
      ) requested(finding_id)
      left join private.authoring_workspace_observations finding
        on finding.workspace_id = p_workspace_id
       and finding.id = requested.finding_id::uuid
       and finding.kind = 'audit_finding'
      where finding.id is null
         or finding.status <> 'approved'
         or finding.superseded_by_finding_id is not null
         or (
           finding.audit_run_id is not null
           and (
             not private.authoring_audit_run_is_current_v1(
               finding.audit_run_id
             )
             or not private.authoring_observation_target_available_v1(
               finding.workspace_id,
               finding.entity_type,
               private.current_authoring_observation_path_v1(
                 finding.workspace_id,
                 finding.entity_type,
                 finding.entity_path
               ),
               finding.resource_target_id
             )
             or not exists (
               select 1
               from private.authoring_audit_run_completions completion
               where completion.audit_run_id = finding.audit_run_id
             )
           )
         )
    ) then
      raise exception
        'Mandato de reparo exige achados aprovados, correntes e disponíveis.'
        using errcode = '40001';
    end if;
  end if;

  return public.update_authoring_workspace_continuity_before_audit_runs_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash,
    p_expected_revision, p_operation, p_state
  );
end;
$function$;

alter function public.manage_authoring_workspace_finding_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) rename to manage_authoring_workspace_finding_before_audit_runs_v1;

revoke all on function public.manage_authoring_workspace_finding_before_audit_runs_v1(
  uuid, uuid, text, text, bigint, text, jsonb
) from public, anon, authenticated, service_role;

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
  v_existing_request private.authoring_workspace_requests%rowtype;
  v_event_operation text;
  v_required_capability text;
  v_run_id uuid;
  v_superseded_by_finding_id uuid;
  v_target_available boolean;
  v_result jsonb;
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
  if v_event_operation is not null
     and p_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     and p_payload_hash ~ '^[0-9a-f]{64}$' then
    perform private.require_educational_workspace_capability_v1(
      p_workspace_id, p_actor_id, v_required_capability
    );
    perform pg_advisory_xact_lock(hashtextextended(
      'authoring-finding:' || p_actor_id::text || ':' || p_request_id,
      0
    ));
    select * into v_existing_request
    from private.authoring_workspace_requests request
    where request.owner_id = p_actor_id
      and request.request_id = p_request_id;
    if found then
      if v_existing_request.workspace_id <> p_workspace_id
         or v_existing_request.operation <> v_event_operation
         or v_existing_request.payload_hash <> p_payload_hash
         or v_existing_request.result->>'findingOperation' <> p_operation then
        raise exception 'requestId reutilizado com dados diferentes.'
          using errcode = '23505';
      end if;
      return v_existing_request.result || jsonb_build_object('idempotent', true);
    end if;
  end if;
  if p_operation in ('verify', 'delete', 'decide')
     and coalesce(p_payload->>'findingId', '') ~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    select observation.audit_run_id, observation.superseded_by_finding_id,
      private.authoring_observation_target_available_v1(
        observation.workspace_id,
        observation.entity_type,
        private.current_authoring_observation_path_v1(
          observation.workspace_id,
          observation.entity_type,
          observation.entity_path
        ),
        observation.resource_target_id
      )
    into v_run_id, v_superseded_by_finding_id, v_target_available
    from private.authoring_workspace_observations observation
    where observation.workspace_id = p_workspace_id
      and observation.id = (p_payload->>'findingId')::uuid
      and observation.kind = 'audit_finding';
    if v_run_id is not null then
      if p_operation = 'delete' then
        raise exception 'Achado estruturado pertence ao histórico imutável da rodada.'
          using errcode = '23514';
      elsif p_operation = 'verify' then
        raise exception
          'Achado estruturado exige uma nova rodada e record_semantic_audit.'
          using errcode = '23514';
      elsif v_superseded_by_finding_id is not null then
        raise exception 'A ocorrência foi sucedida por um achado corrente da reauditoria.'
          using errcode = '23514';
      elsif not private.authoring_audit_run_is_current_v1(v_run_id)
         or not coalesce(v_target_available, false) then
        raise exception 'A rodada ou o alvo mudou; releia e execute nova auditoria.'
          using errcode = '40001';
      elsif not exists (
        select 1
        from private.authoring_audit_run_completions completion
        where completion.audit_run_id = v_run_id
      ) then
        raise exception 'A decisão humana aguarda a conclusão da auditoria semântica.'
          using errcode = '23514';
      end if;
    end if;
  end if;
  v_result := public.manage_authoring_workspace_finding_before_audit_runs_v1(
    p_actor_id, p_workspace_id, p_request_id, p_payload_hash,
    p_expected_revision, p_operation, p_payload
  );
  if v_run_id is not null
     and p_operation = 'decide'
     and coalesce((v_result->>'idempotent')::boolean, false) = false then
    update private.authoring_workspace_observations observation
    set verification = null,
        verified_revision = null,
        verified_by_audit_run_id = null
    where observation.workspace_id = p_workspace_id
      and observation.id = (p_payload->>'findingId')::uuid;
  end if;
  return v_result;
end;
$function$;

create function private.authoring_audit_finding_json_v1(
  p_finding private.authoring_workspace_observations
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'findingId', p_finding.id,
    'code', p_finding.finding_code,
    'category', p_finding.category,
    'origin', p_finding.finding_origin,
    'severity', p_finding.severity,
    'status', p_finding.status,
    'target', jsonb_build_object(
      'entityType', p_finding.entity_type,
      'entityPath', to_jsonb(p_finding.entity_path),
      'resourceTargetId', p_finding.resource_target_id
    ),
    'currentEntityPath', to_jsonb(
      private.current_authoring_observation_path_v1(
        p_finding.workspace_id,
        p_finding.entity_type,
        p_finding.entity_path
      )
    ),
    'targetAvailable', private.authoring_observation_target_available_v1(
      p_finding.workspace_id,
      p_finding.entity_type,
      private.current_authoring_observation_path_v1(
        p_finding.workspace_id,
        p_finding.entity_type,
        p_finding.entity_path
      ),
      p_finding.resource_target_id
    ),
    'ruleRef', jsonb_build_object(
      'kind', p_finding.rule_kind,
      'id', p_finding.rule_id,
      'version', p_finding.rule_version
    ),
    'publicEvidence', p_finding.public_evidence,
    'proposedRepair', p_finding.proposed_repair,
    'detectedRevision', p_finding.audit_revision,
    'auditPartId', p_finding.audit_part_id,
    'auditRunRef', (
      select private.authoring_audit_run_ref_v1(run)
      from private.authoring_audit_runs run
      where run.id = p_finding.audit_run_id
    ),
    'artifactRefs', private.authoring_audit_artifact_refs_v1(
      p_finding.audit_run_id, p_finding.entity_path
    ),
    'verificationAuditRunRef', (
      select private.authoring_audit_run_ref_v1(run)
      from private.authoring_audit_runs run
      where run.id = p_finding.verified_by_audit_run_id
    ),
    'pendingCorrectionRequestId', p_finding.pending_correction_request_id,
    'pendingRevision', p_finding.pending_revision,
    'correctionRequestId', p_finding.correction_request_id,
    'resultingRevision', p_finding.resulting_revision,
    'verification', p_finding.verification,
    'verifiedRevision', p_finding.verified_revision,
    'createdAt', p_finding.created_at,
    'updatedAt', p_finding.updated_at
  )
$function$;

create function private.authoring_audit_run_entries_v1(
  p_audit_run_id uuid
)
returns table(
  finding_id uuid,
  page_ordinal integer,
  verification_run_id uuid,
  verification_result jsonb,
  verification_revision bigint
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select finding.id,
    finding.audit_finding_ordinal,
    null::uuid,
    null::jsonb,
    null::bigint
  from private.authoring_workspace_observations finding
  where finding.audit_run_id = p_audit_run_id
  union all
  select finding.id,
    run.deterministic_finding_count
      + completion.semantic_finding_count
      + verification.ordinal::integer,
    run.id,
    verification.value,
    completion.completed_revision
  from private.authoring_audit_runs run
  join private.authoring_audit_run_completions completion
    on completion.audit_run_id = run.id
  cross join lateral jsonb_array_elements(
    coalesce(completion.semantic_result->'verifications', '[]'::jsonb)
  ) with ordinality verification(value, ordinal)
  join private.authoring_workspace_observations finding
    on finding.id = (verification.value->>'findingId')::uuid
   and finding.audit_run_id <> run.id
  where run.id = p_audit_run_id
    and (
      verification.value->>'outcome' <> 'still_open'
      or coalesce(verification.value->>'recurrenceFindingId', '') = ''
    )
$function$;

create function private.authoring_audit_finding_distribution_v1(
  p_audit_run_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with findings as materialized (
    select finding.*
    from private.authoring_audit_run_entries_v1(p_audit_run_id) entry
    join private.authoring_workspace_observations finding
      on finding.id = entry.finding_id
    where entry.verification_run_id is null
       or entry.verification_result->>'outcome' = 'still_open'
  ), counts as (
    select finding.category, count(*)::integer as total
    from findings finding
    group by finding.category
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from findings),
    'byCategory', coalesce((
      select jsonb_object_agg(counts.category, counts.total) from counts
    ), '{}'::jsonb),
    'byOrigin', jsonb_build_object(
      'deterministic', (select count(*)::integer from findings
        where finding_origin = 'deterministic'),
      'semantic_audit', (select count(*)::integer from findings
        where finding_origin = 'semantic_audit')
    )
  )
$function$;

create function private.authoring_audit_summary_v1(
  p_run private.authoring_audit_runs
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  with summary_findings as materialized (
    select finding.*
    from private.authoring_audit_run_entries_v1(p_run.id) entry
    join private.authoring_workspace_observations finding
      on finding.id = entry.finding_id
    where entry.verification_run_id is null
       or entry.verification_result->>'outcome' = 'still_open'
  ), own_finding_counts as (
    select
      count(*) filter(where finding_origin = 'deterministic') as deterministic,
      count(*) filter(where finding_origin = 'semantic_audit') as semantic,
      count(*) as total,
      count(*) filter(where category = 'structure') as structure_count,
      count(*) filter(where category in ('design', 'explanation')) as design_count,
      count(*) filter(where category = 'practice') as practice_count,
      count(*) filter(where category = 'resources') as resources_count,
      count(*) filter(where finding_code = 'part_microsequence_audit_coverage'
        or category = 'coverage') as coverage_count,
      count(*) filter(where category = 'coherence') as coherence_count,
      count(*) filter(where category = 'dependencies') as dependencies_count,
      count(*) filter(where category = 'redundancy') as redundancy_count,
      count(*) filter(where category = 'integration') as integration_count
    from summary_findings finding
  ), child_finding_counts as (
    select
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByOrigin,deterministic}')::integer,
        0
      ) else 0 end as deterministic,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByOrigin,semantic_audit}')::integer,
        0
      ) else 0 end as semantic,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingCount}')::integer,
        0
      ) else 0 end as total,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,structure}')::integer,
        0
      ) else 0 end as structure_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,design}')::integer,
        0
      ) + coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,explanation}')::integer,
        0
      ) else 0 end as design_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,practice}')::integer,
        0
      ) else 0 end as practice_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,resources}')::integer,
        0
      ) else 0 end as resources_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,coverage}')::integer,
        0
      ) else 0 end as coverage_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,coherence}')::integer,
        0
      ) else 0 end as coherence_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,dependencies}')::integer,
        0
      ) else 0 end as dependencies_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,redundancy}')::integer,
        0
      ) else 0 end as redundancy_count,
      case when p_run.scope_kind = 'part' then coalesce(
        (p_run.deterministic_result#>>'{distribution,findingsByCategory,integration}')::integer,
        0
      ) else 0 end as integration_count
  ), finding_counts as (
    select
      own.deterministic + child.deterministic as deterministic,
      own.semantic + child.semantic as semantic,
      own.total + child.total as total,
      own.structure_count + child.structure_count as structure_count,
      own.design_count + child.design_count as design_count,
      own.practice_count + child.practice_count as practice_count,
      own.resources_count + child.resources_count as resources_count,
      own.coverage_count + child.coverage_count as coverage_count,
      own.coherence_count + child.coherence_count as coherence_count,
      own.dependencies_count + child.dependencies_count as dependencies_count,
      own.redundancy_count + child.redundancy_count as redundancy_count,
      own.integration_count + child.integration_count as integration_count
    from own_finding_counts own cross join child_finding_counts child
  ), base as (
    select coalesce(p_run.deterministic_result->'summary', '{}'::jsonb) summary,
      coalesce(p_run.deterministic_result->'metrics', '[]'::jsonb) metrics
  ), run_state as (
    select coalesce((
      select check_item->>'status'
      from jsonb_array_elements(
        coalesce(p_run.deterministic_result->'checks', '[]'::jsonb)
      ) check_item
      where check_item->>'code' = 'part_microsequence_audit_coverage'
      limit 1
    ), 'not_applicable') coverage_check
  )
  select jsonb_build_object(
    'dimensions', jsonb_build_object(
      'structure', jsonb_build_object(
        'status', case when finding_counts.structure_count > 0 then 'finding'
          else coalesce(base.summary->>'structure', 'not_checked') end,
        'findingCount', finding_counts.structure_count
      ),
      'design', jsonb_build_object(
        'status', case when finding_counts.design_count > 0 then 'finding'
          else coalesce(base.summary->>'design', 'not_checked') end,
        'findingCount', finding_counts.design_count
      ),
      'practice', jsonb_build_object(
        'status', case when finding_counts.practice_count > 0 then 'finding'
          else coalesce(base.summary->>'practice', 'not_checked') end,
        'findingCount', finding_counts.practice_count
      ),
      'resources', jsonb_build_object(
        'status', case when finding_counts.resources_count > 0 then 'finding'
          else coalesce(base.summary->>'resources', 'not_checked') end,
        'findingCount', finding_counts.resources_count
      ),
      'coverage', jsonb_build_object(
        'status', case when p_run.scope_kind = 'part'
          and finding_counts.coverage_count > 0 then 'finding'
          when p_run.scope_kind = 'part' and run_state.coverage_check = 'failed'
            then 'finding'
          when p_run.scope_kind = 'part' and run_state.coverage_check = 'passed'
            then 'conformant'
          else 'not_checked' end,
        'findingCount', case when p_run.scope_kind = 'part'
          then finding_counts.coverage_count else 0 end
      ),
      'coherence', jsonb_build_object(
        'status', case when p_run.scope_kind <> 'part' then 'not_checked'
          when finding_counts.coherence_count > 0 then 'finding'
          else 'not_checked' end,
        'findingCount', case when p_run.scope_kind = 'part'
          then finding_counts.coherence_count else 0 end
      ),
      'dependencies', jsonb_build_object(
        'status', case when p_run.scope_kind <> 'part' then 'not_checked'
          when finding_counts.dependencies_count > 0 then 'finding'
          else 'not_checked' end,
        'findingCount', case when p_run.scope_kind = 'part'
          then finding_counts.dependencies_count else 0 end
      ),
      'redundancy', jsonb_build_object(
        'status', case when p_run.scope_kind <> 'part' then 'not_checked'
          when finding_counts.redundancy_count > 0 then 'finding'
          else 'not_checked' end,
        'findingCount', case when p_run.scope_kind = 'part'
          then finding_counts.redundancy_count else 0 end
      ),
      'integration', jsonb_build_object(
        'status', case when p_run.scope_kind <> 'part' then 'not_checked'
          when finding_counts.integration_count > 0 then 'finding'
          else 'not_checked' end,
        'findingCount', case when p_run.scope_kind = 'part'
          then finding_counts.integration_count else 0 end
      )
    ),
    'checks', jsonb_build_object(
      'passed', coalesce((base.summary#>>'{checkCounts,passed}')::integer, 0),
      'failed', coalesce((base.summary#>>'{checkCounts,failed}')::integer, 0),
      'notApplicable', coalesce(
        (base.summary#>>'{checkCounts,notApplicable}')::integer, 0
      )
    ),
    'findings', jsonb_build_object(
      'deterministic', finding_counts.deterministic,
      'semantic', finding_counts.semantic,
      'total', finding_counts.total
    ),
    'metrics', base.metrics
  )
  from finding_counts cross join base cross join run_state
$function$;

create function public.get_authoring_audit_run_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_audit_run_id uuid default null,
  p_audit_run_version text default null,
  p_scope_kind text default null,
  p_scope_ref text default null,
  p_limit integer default 20,
  p_after_ordinal integer default null,
  p_component_limit integer default 10,
  p_after_component_ordinal integer default null,
  p_anchor_microsequence_ref text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_run private.authoring_audit_runs%rowtype;
  v_completion private.authoring_audit_run_completions%rowtype;
  v_items jsonb;
  v_total integer;
  v_has_more boolean;
  v_next_cursor text;
  v_component_items jsonb;
  v_component_total integer;
  v_component_has_more boolean;
  v_component_next_cursor text;
  v_workspace_revision bigint;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  select workspace.revision into v_workspace_revision
  from private.authoring_workspaces workspace
  where workspace.id = p_workspace_id and workspace.deleted_at is null;
  if not found then
    raise exception 'Workspace inexistente.' using errcode = 'P0002';
  end if;
  if ((p_audit_run_id is null) = (p_scope_kind is null))
     or ((p_audit_run_id is null) <> (p_audit_run_version is null))
     or ((p_scope_kind is null) <> (p_scope_ref is null))
     or (p_scope_kind is not null and p_scope_kind not in ('microsequence', 'part'))
     or (p_scope_ref is not null and (
       nullif(btrim(p_scope_ref), '') is null
       or char_length(p_scope_ref) > 240
     ))
     or p_limit not between 1 and 50
     or (p_after_ordinal is not null and p_after_ordinal < 1)
     or p_component_limit not between 1 and 10
     or (p_after_component_ordinal is not null
       and p_after_component_ordinal < 1)
     or (p_anchor_microsequence_ref is not null and (
       nullif(btrim(p_anchor_microsequence_ref), '') is null
       or p_anchor_microsequence_ref <> btrim(p_anchor_microsequence_ref)
       or char_length(p_anchor_microsequence_ref) > 240
     )) then
    raise exception 'Leitura da rodada de auditoria inválida.'
      using errcode = '22023';
  end if;
  if p_audit_run_id is not null then
    select * into v_run
    from private.authoring_audit_runs run
    where run.id = p_audit_run_id
      and run.run_version = p_audit_run_version
      and run.workspace_id = p_workspace_id;
  else
    select * into v_run
    from private.authoring_audit_runs run
    where run.workspace_id = p_workspace_id
      and run.scope_kind = p_scope_kind
      and run.scope_ref = p_scope_ref
    order by private.authoring_audit_run_is_current_v1(run.id) desc,
      run.created_at desc, run.id desc
    limit 1;
  end if;
  if not found then
    return jsonb_build_object(
      'workspaceId', p_workspace_id,
      'revision', v_workspace_revision,
      'audit', null
    );
  end if;
  select * into v_completion
  from private.authoring_audit_run_completions completion
  where completion.audit_run_id = v_run.id;

  with run_entries as materialized (
    select finding,
      entry.verification_run_id,
      entry.verification_result,
      entry.verification_revision,
      entry.page_ordinal
    from private.authoring_audit_run_entries_v1(v_run.id) entry
    join private.authoring_workspace_observations finding
      on finding.id = entry.finding_id
  ), candidates as materialized (
    select * from run_entries entry
    where p_after_ordinal is null or entry.page_ordinal > p_after_ordinal
    order by entry.page_ordinal
    limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by page_ordinal
    limit p_limit
  )
  select coalesce(jsonb_agg(
      private.authoring_audit_finding_json_v1(page.finding)
        || case when page.verification_run_id is null then '{}'::jsonb
          else jsonb_build_object(
            'status', case when page.verification_result->>'outcome' = 'resolved'
              then 'resolved' else 'open' end,
            'verification', page.verification_result->>'publicEvidence',
            'verifiedRevision', page.verification_revision,
            'verificationAuditRunRef', private.authoring_audit_run_ref_v1(v_run),
            'pendingCorrectionRequestId', null,
            'pendingRevision', null,
            'correctionRequestId',
              page.verification_result->>'correctionRequestId',
            'resultingRevision',
              (page.verification_result->>'resultingRevision')::bigint
          ) end
      order by page.page_ordinal
    ), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select page.page_ordinal::text
      from page order by page.page_ordinal desc limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;
  select count(*) into v_total
  from private.authoring_audit_run_entries_v1(v_run.id);
  if v_run.scope_kind = 'part' then
    with candidates as materialized (
      select component.*, child.run_version,
        child.audited_workspace_revision,
        audited.scope_path, audited.content_hash
      from private.authoring_audit_run_components component
      left join private.authoring_audit_runs child
        on child.id = component.child_audit_run_id
      left join private.authoring_audit_run_microsequences audited
        on audited.audit_run_id = component.child_audit_run_id
       and audited.microsequence_ref = component.microsequence_ref
      where component.parent_audit_run_id = v_run.id
        and (
          p_after_component_ordinal is null
          or component.ordinal > p_after_component_ordinal
        )
      order by component.ordinal
      limit p_component_limit + 1
    ), page as materialized (
      select * from candidates order by ordinal limit p_component_limit
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'ordinal', page.ordinal,
        'microsequenceRef', page.microsequence_ref,
        'microsequencePath', case when page.scope_path is null
          then null else to_jsonb(page.scope_path) end,
        'childAuditRunRef', case when page.child_audit_run_id is null
          then null else jsonb_build_object(
            'id', page.child_audit_run_id, 'version', page.run_version
          ) end,
        'auditedRevision', page.audited_workspace_revision,
        'contentHash', page.content_hash,
        'status', case when page.child_audit_run_id is null
          then 'not_audited' else 'complete' end,
        'targetAvailable', private.authoring_design_scope_path_v1(
          p_workspace_id, 'microsequence', page.microsequence_ref
        ) is not null
      ) order by page.ordinal), '[]'::jsonb),
      (select count(*) from candidates) > p_component_limit,
      case when (select count(*) from candidates) > p_component_limit then (
        select page.ordinal::text from page order by page.ordinal desc limit 1
      ) end
    into v_component_items, v_component_has_more, v_component_next_cursor
    from page;
    select count(*)::integer into v_component_total
    from private.authoring_audit_run_components component
    where component.parent_audit_run_id = v_run.id;
  else
    v_component_items := '[]'::jsonb;
    v_component_total := 0;
    v_component_has_more := false;
    v_component_next_cursor := null;
  end if;

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'revision', v_workspace_revision,
    'audit', jsonb_build_object(
      'microsequenceRefs', jsonb_build_object(
        'items', case when v_run.scope_kind = 'part' then (
          select coalesce(jsonb_agg(
            component.microsequence_ref order by component.ordinal
          ), '[]'::jsonb)
          from (
            select * from private.authoring_audit_run_components component
            where component.parent_audit_run_id = v_run.id
            order by component.ordinal limit 20
          ) component
        ) else (
          select coalesce(jsonb_agg(
            audited.microsequence_ref order by audited.ordinal
          ), '[]'::jsonb)
          from private.authoring_audit_run_microsequences audited
          where audited.audit_run_id = v_run.id
        ) end,
        'count', case when v_run.scope_kind = 'part'
          then v_component_total else 1 end,
        'truncated', v_run.scope_kind = 'part' and v_component_total > 20
      ),
      'containsAnchor', case when p_anchor_microsequence_ref is null then true
        when v_run.scope_kind = 'part' then exists (
          select 1 from private.authoring_audit_run_components component
          where component.parent_audit_run_id = v_run.id
            and component.microsequence_ref = p_anchor_microsequence_ref
        ) else v_run.scope_ref = p_anchor_microsequence_ref end,
      'latestAuditRun', jsonb_build_object(
        'ref', private.authoring_audit_run_ref_v1(v_run),
        'kind', v_run.kind,
        'status', case when v_completion.audit_run_id is null
          then 'semantic_pending' else 'complete' end,
        'current', private.authoring_audit_run_is_current_v1(v_run.id),
        'scope', jsonb_build_object(
          'kind', v_run.scope_kind, 'ref', v_run.scope_ref
        ),
        'startedRevision', v_run.audited_workspace_revision,
        'completedRevision', v_completion.completed_revision,
        'createdAt', v_run.created_at,
        'completedAt', v_completion.completed_at
      ),
      'summary', private.authoring_audit_summary_v1(v_run),
      'components', jsonb_build_object(
        'items', v_component_items,
        'count', v_component_total,
        'nextCursor', v_component_next_cursor,
        'truncated', v_component_has_more
      ),
      'findings', v_items,
      'total', v_total,
      'nextCursor', v_next_cursor,
      'truncated', v_has_more
    )
  );
end;
$function$;

create function public.list_authoring_audit_runs_v1(
  p_actor_id uuid,
  p_workspace_id uuid,
  p_scope_kind text default null,
  p_scope_ref text default null,
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  perform private.require_educational_workspace_capability_v1(
    p_workspace_id, p_actor_id, 'read'
  );
  if ((p_scope_kind is null) <> (p_scope_ref is null))
     or (p_scope_kind is not null and p_scope_kind not in ('microsequence', 'part'))
     or p_limit not between 1 and 50
     or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception 'Lista de rodadas de auditoria inválida.'
      using errcode = '22023';
  end if;
  with candidates as materialized (
    select run.*,
      completion.completed_revision,
      completion.completed_at
    from private.authoring_audit_runs run
    left join private.authoring_audit_run_completions completion
      on completion.audit_run_id = run.id
    where run.workspace_id = p_workspace_id
      and (p_scope_kind is null or (
        run.scope_kind = p_scope_kind and run.scope_ref = p_scope_ref
      ))
      and (
        p_before_created_at is null
        or (run.created_at, run.id) < (p_before_created_at, p_before_id)
      )
    order by run.created_at desc, run.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from candidates
    order by created_at desc, id desc
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'ref', jsonb_build_object('id', page.id, 'version', page.run_version),
      'kind', page.kind,
      'status', case when page.completed_revision is null
        then 'semantic_pending' else 'complete' end,
      'current', private.authoring_audit_run_is_current_v1(page.id),
      'scope', jsonb_build_object('kind', page.scope_kind, 'ref', page.scope_ref),
      'startedRevision', page.audited_workspace_revision,
      'completedRevision', page.completed_revision,
      'summary', private.authoring_audit_summary_v1((
        select run
        from private.authoring_audit_runs run
        where run.id = page.id
      )),
      'createdAt', page.created_at,
      'completedAt', page.completed_at
    ) order by page.created_at desc, page.id desc), '[]'::jsonb),
    (select count(*) from candidates) > p_limit,
    case when (select count(*) from candidates) > p_limit then (
      select jsonb_build_object(
        'beforeCreatedAt', page.created_at,
        'beforeId', page.id
      ) from page order by page.created_at, page.id limit 1
    ) end
  into v_items, v_has_more, v_next_cursor
  from page;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'items', v_items,
    'hasMore', v_has_more,
    'nextCursor', v_next_cursor
  );
end;
$function$;

-- Acrescenta os campos publicáveis à paginação geral de observações sem
-- duplicar o corpo, os filtros ou a política de visibilidade já instalada.
do $extend_authoring_observation_projection_for_audits$
declare
  v_signature regprocedure := to_regprocedure(
    'private.list_authoring_workspace_observations_v1(uuid,uuid,integer,timestamptz,uuid,text[],text[],text[])'
  );
  v_definition text;
  v_rewritten text;
  v_before_filter text;
  v_marker text := '''proposedRepair'', page.proposed_repair,';
  v_delete_marker text := '''updatedAt'', page.updated_at';
  v_workspace_marker text := 'where observation.workspace_id = p_workspace_id';
  v_workspace_replacement text := 'where observation.workspace_id = p_workspace_id
      and observation.superseded_by_finding_id is null';
  v_delete_replacement text := '''updatedAt'', page.updated_at,
      ''canDelete'', page.audit_run_id is null and (
        coalesce(page.author_id = p_actor_id, false)
        or private.educational_workspace_can_v1(
          p_workspace_id, p_actor_id, ''review''
        )
      )';
  v_replacement text := '''proposedRepair'', page.proposed_repair,
      ''findingCode'', page.finding_code,
      ''findingOrigin'', page.finding_origin,
      ''ruleRef'', case when page.audit_run_id is null then null
        else jsonb_build_object(
          ''kind'', page.rule_kind,
          ''id'', page.rule_id,
          ''version'', page.rule_version
        ) end,
      ''publicEvidence'', page.public_evidence,
      ''auditPartId'', page.audit_part_id,
      ''auditRunRef'', (
        select private.authoring_audit_run_ref_v1(audit_run)
        from private.authoring_audit_runs audit_run
        where audit_run.id = page.audit_run_id
      ),
      ''verificationAuditRunRef'', (
        select private.authoring_audit_run_ref_v1(verification_run)
        from private.authoring_audit_runs verification_run
        where verification_run.id = page.verified_by_audit_run_id
      ),';
begin
  if v_signature is null then
    raise exception 'Projeção de observações ausente.' using errcode = '55000';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  v_rewritten := replace(v_definition, v_marker, v_replacement);
  if v_rewritten = v_definition then
    raise exception 'Projeção de observações incompatível com auditoria.'
      using errcode = '55000';
  end if;
  if strpos(v_rewritten, v_delete_marker) = 0 then
    raise exception 'Permissão de exclusão da projeção incompatível com auditoria.'
      using errcode = '55000';
  end if;
  v_rewritten := replace(v_rewritten, v_delete_marker, v_delete_replacement);
  v_before_filter := v_rewritten;
  v_rewritten := replace(
    v_rewritten, v_workspace_marker, v_workspace_replacement
  );
  v_rewritten := replace(
    v_rewritten,
    'where observation.workspace_id=p_workspace_id',
    'where observation.workspace_id=p_workspace_id
      and observation.superseded_by_finding_id is null'
  );
  if v_rewritten = v_before_filter then
    raise exception 'Filtro ativo da projeção incompatível com auditoria.'
      using errcode = '55000';
  end if;
  execute v_rewritten;
end;
$extend_authoring_observation_projection_for_audits$;

-- O resume transporta somente identidade/lifecycle compactos. Proveniência
-- completa é lida progressivamente pela view audit da rodada exata.
alter function public.get_authoring_workspace_continuity_v1(uuid, uuid)
  rename to get_authoring_workspace_continuity_before_audit_runs_v1;

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
  v_result jsonb;
  v_active_findings jsonb;
begin
  v_result := public.get_authoring_workspace_continuity_before_audit_runs_v1(
    p_actor_id, p_workspace_id
  );
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
      and observation.superseded_by_finding_id is null
    order by observation.updated_at desc, observation.id desc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
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
      'findingCode', page.finding_code,
      'findingOrigin', page.finding_origin,
      'ruleRef', case when page.audit_run_id is null then null
        else jsonb_build_object(
          'kind', page.rule_kind,
          'id', page.rule_id,
          'version', page.rule_version
        ) end,
      'publicEvidence', page.public_evidence,
      'auditRevision', page.audit_revision,
      'auditPartId', page.audit_part_id,
      'auditRunRef', (
        select private.authoring_audit_run_ref_v1(audit_run)
        from private.authoring_audit_runs audit_run
        where audit_run.id = page.audit_run_id
      ),
      'verificationAuditRunRef', (
        select private.authoring_audit_run_ref_v1(verification_run)
        from private.authoring_audit_runs verification_run
        where verification_run.id = page.verified_by_audit_run_id
      ),
      'pendingCorrectionRequestId', page.pending_correction_request_id,
      'pendingRevision', page.pending_revision,
      'correctionRequestId', page.correction_request_id,
      'resultingRevision', page.resulting_revision,
      'verification', page.verification,
      'verifiedRevision', page.verified_revision,
      'createdAt', page.created_at,
      'updatedAt', page.updated_at
    ) order by page.updated_at desc, page.id desc), '[]'::jsonb)
  into v_active_findings
  from candidates page;
  return jsonb_set(v_result, '{activeFindings}', v_active_findings, true);
end;
$function$;

revoke all on function public.get_authoring_workspace_continuity_before_audit_runs_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.get_authoring_workspace_continuity_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_authoring_workspace_continuity_v1(uuid, uuid)
  to service_role;

revoke all on table private.authoring_audit_runs
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_audit_run_microsequences
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_audit_run_completions
  from public, anon, authenticated, service_role;
revoke all on table private.authoring_audit_run_components
  from public, anon, authenticated, service_role;

do $secure_authoring_audit_functions$
declare
  v_function record;
  v_public_names constant text[] := array[
    'list_authoring_audit_cards_v1',
    'list_authoring_part_audit_components_v1',
    'register_authoring_audit_run_v1',
    'record_authoring_semantic_audit_v1',
    'update_authoring_workspace_continuity_v1',
    'manage_authoring_workspace_finding_v1',
    'get_authoring_audit_run_v1',
    'list_authoring_audit_runs_v1'
  ];
  v_private_names constant text[] := array[
    'reject_authoring_audit_run_update_v1',
    'preserve_authoring_audit_finding_history_v1',
    'normalize_authoring_audit_verification_transition_v1',
    'authoring_audit_run_ref_v1',
    'authoring_audit_ref_v1',
    'authoring_audit_artifact_refs_v1',
    'authoring_audit_target_in_run_v1',
    'authoring_audit_run_is_current_v1',
    'authoring_audit_finding_json_v1',
    'authoring_audit_summary_v1'
  ];
begin
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'public'
      and procedure_value.proname = any(v_public_names)
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      v_function.signature
    );
  end loop;
  for v_function in
    select procedure_value.oid::regprocedure as signature
    from pg_proc procedure_value
    join pg_namespace namespace_value
      on namespace_value.oid = procedure_value.pronamespace
    where namespace_value.nspname = 'private'
      and procedure_value.proname = any(v_private_names)
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function.signature
    );
  end loop;
end;
$secure_authoring_audit_functions$;

do $advance_authoring_audit_runtime_manifest$
declare
  v_manifest jsonb;
  v_body text;
begin
  if to_regprocedure('public.get_aralearn_runtime_manifest()') is null then
    raise exception 'Manifesto de runtime ausente.' using errcode = '55000';
  end if;
  v_manifest := public.get_aralearn_runtime_manifest();
  if v_manifest ->> 'schemaRevision' <> '20260815233000'
     or not (v_manifest -> 'features' ? 'authoring-product-state-projection-v1')
  then
    raise exception 'Manifesto anterior à auditoria inesperado.'
      using errcode = '55000';
  end if;
  v_manifest := jsonb_set(
    jsonb_set(
      v_manifest,
      array['schemaRevision']::text[],
      '"20260815235900"'::jsonb
    ),
    array['features']::text[],
    ((v_manifest -> 'features') - 'authoring-design-conformance-audit-v1')
      || '["authoring-design-conformance-audit-v1"]'::jsonb
  );
  v_body := 'select ' || quote_literal(v_manifest::text) || '::jsonb';
  execute format(
    'create or replace function public.get_aralearn_runtime_manifest() '
      || 'returns jsonb language sql stable security definer '
      || 'set search_path = pg_catalog as %L',
    v_body
  );
  revoke all on function public.get_aralearn_runtime_manifest()
    from public, anon, authenticated, service_role;
  grant execute on function public.get_aralearn_runtime_manifest()
    to service_role;
end;
$advance_authoring_audit_runtime_manifest$;

commit;
