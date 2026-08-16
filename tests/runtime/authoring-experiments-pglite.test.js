import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";

import {
  MICRO_SCOPE,
  PARAMETER_VALUES,
  mutationHash,
  pedagogicalBlueprintBinding,
  pedagogicalBlueprintV2,
  saveAnalysis,
  saveResourceSet,
  scalar,
  setAssignment,
  setupDatabase
} from "./parameterized-authoring-design-pglite.test.js";
import {
  assignSeededExperimentCondition,
  EXPERIMENT_ASSIGNMENT_ALGORITHMS
} from "../../supabase/functions/_shared/aralearn/runtime/authoring/instructionalExperiment.js";

const ACTOR = "10000000-0000-4000-8000-000000000001";
const ADMIN = "10000000-0000-4000-8000-000000000002";
const PARTICIPANT = "10000000-0000-4000-8000-000000000003";
const DELETED_PARTICIPANT = "10000000-0000-4000-8000-000000000004";
const OUTSIDER = "10000000-0000-4000-8000-000000000005";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const BASE_COURSE = "30000000-0000-4000-8000-000000000001";
const BASE_ARTIFACT = "a".repeat(64);
const experimentMigrationUrl = new URL(
  "../../supabase/migrations/20260816120000_parameterized_authoring_experiments.sql",
  import.meta.url
);

function fixedHash(character) {
  return character.repeat(64);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

async function installExperimentDatabase() {
  const database = await setupDatabase();
  await database.exec(`
    create or replace function extensions.digest(p_value bytea,p_algorithm text)
    returns bytea language sql immutable as $$
      select case when lower(p_algorithm)='sha256'
        then pg_catalog.sha256(p_value)
        else null end
    $$;

    alter table private.authoring_workspaces
      add column if not exists purpose text not null default 'authoring',
      add column if not exists workspace_kind text not null default 'course_authoring',
      add column if not exists visibility text not null default 'private',
      add column if not exists source_course_id uuid;

    create table private.educational_workspace_members(
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null,
      granted_by uuid references auth.users(id) on delete set null,
      joined_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id,user_id)
    );
    insert into private.educational_workspace_members(
      workspace_id,user_id,role,granted_by
    ) values
      ('${WORKSPACE}','${ACTOR}','owner','${ACTOR}'),
      ('${WORKSPACE}','${ADMIN}','admin','${ACTOR}');
    insert into auth.users(id) values
      ('${PARTICIPANT}'),('${DELETED_PARTICIPANT}'),('${OUTSIDER}');

    create table private.artifact_refs(
      hash text primary key,
      bucket text not null,
      object_key text not null,
      artifact_type text not null,
      media_type text not null,
      size_bytes bigint not null,
      created_at timestamptz not null default now()
    );
    create table private.artifact_gc_tombstones(
      hash text primary key,
      bucket text not null,
      object_key text not null,
      artifact_type text not null,
      media_type text not null,
      size_bytes bigint not null,
      claim_token uuid not null,
      claimed_at timestamptz not null default now()
    );
    create table private.catalog_review_submissions(
      id uuid primary key default gen_random_uuid(),
      artifact_hash text,
      source_course_id uuid,
      official_course_id uuid
    );
    create table private.course_revision_sync_changes(
      id bigint generated always as identity primary key,
      user_id uuid,
      scope text not null,
      entity_id uuid not null,
      operation text not null,
      revision_hash text
    );

    create or replace function private.require_service_role()
    returns void language sql as $$ select $$;
    create or replace function auth.uid()
    returns uuid language sql stable as $$
      select nullif(current_setting('aralearn.test_actor',true),'')::uuid
    $$;
    create or replace function extensions.gen_random_uuid()
    returns uuid language sql volatile as $$ select gen_random_uuid() $$;
    create or replace function extensions.gen_random_bytes(p_length integer)
    returns bytea language sql volatile as $$
      select decode(substr(
        md5(random()::text || clock_timestamp()::text)
        || md5(random()::text || txid_current()::text),1,p_length*2
      ),'hex')
    $$;

    create table public.courses(
      id uuid primary key,
      owner_id uuid references auth.users(id) on delete cascade,
      status text not null,
      contract_key text not null,
      title text not null,
      goal text not null default '',
      contract_scope text,
      project_id uuid,
      position integer not null default 0,
      content_hash text,
      current_revision_hash text,
      revision_artifact_hash text,
      module_count integer not null default 0,
      lesson_count integer not null default 0,
      microsequence_count integer not null default 0,
      card_count integer not null default 0,
      document_storage_enabled boolean not null default true,
      completion_state text not null default 'complete',
      deleted_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table private.course_revisions(
      course_id uuid not null references public.courses(id) on delete cascade,
      revision_hash text not null,
      artifact_hash text not null references private.artifact_refs(hash),
      base_revision_hash text,
      validation_status text not null,
      validated_at timestamptz,
      published_at timestamptz,
      created_by uuid references auth.users(id) on delete set null,
      primary key(course_id,revision_hash)
    );
    create table private.authoring_workspace_publications(
      workspace_id uuid not null references private.authoring_workspaces(id),
      workspace_course_id text not null,
      target text not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      content_hash text not null references private.artifact_refs(hash),
      updated_at timestamptz not null default now(),
      primary key(workspace_id,workspace_course_id,target)
    );
    create table public.user_course_selections(
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      course_id uuid not null references public.courses(id) on delete cascade,
      position integer not null default 0,
      updated_at timestamptz not null default now(),
      unique(user_id,course_id)
    );
    create table public.catalog_collection_courses(
      collection_id uuid not null,
      course_id uuid not null references public.courses(id) on delete cascade,
      position integer not null default 0,
      deleted_at timestamptz,
      unique(collection_id,course_id)
    );

    create function private.grant_workspace_publications_to_member_v1(
      p_workspace_id uuid,p_user_id uuid
    ) returns void language plpgsql security definer
    set search_path=pg_catalog,public,private as $$
    begin
      insert into public.user_course_selections(user_id,course_id)
      select p_user_id,publication.course_id
      from private.authoring_workspace_publications publication
      join public.courses course on course.id=publication.course_id
      where publication.workspace_id=p_workspace_id
        and publication.target='private' and course.status='published'
      on conflict(user_id,course_id) do nothing;
    end;
    $$;
    create function private.revoke_workspace_publications_from_member_v1(
      p_workspace_id uuid,p_user_id uuid,p_course_id uuid default null
    ) returns void language plpgsql security definer
    set search_path=pg_catalog,public,private as $$
    begin
      delete from public.user_course_selections selection
      where selection.user_id=p_user_id and selection.course_id in (
        select publication.course_id
        from private.authoring_workspace_publications publication
        where publication.workspace_id=p_workspace_id
        union select p_course_id where p_course_id is not null
      );
    end;
    $$;
    create function private.sync_workspace_publication_members_v1()
    returns trigger language plpgsql security definer
    set search_path=pg_catalog,private as $$
    declare v_member record;
    begin
      if tg_op<>'DELETE' and new.target='private' then
        for v_member in select member.user_id
          from private.educational_workspace_members member
          where member.workspace_id=new.workspace_id
        loop
          perform private.grant_workspace_publications_to_member_v1(
            new.workspace_id,v_member.user_id
          );
        end loop;
      end if;
      return case when tg_op='DELETE' then old else new end;
    end;
    $$;
    create trigger sync_workspace_publication_members_v1
    after insert or update or delete on private.authoring_workspace_publications
    for each row execute function private.sync_workspace_publication_members_v1();

    create or replace function private.can_publish_catalog_v5(uuid)
    returns boolean language sql stable as $$ select false $$;
    create or replace function private.can_review_catalog_v5(uuid)
    returns boolean language sql stable as $$
      select $1='${OUTSIDER}'::uuid
    $$;
    create or replace function private.require_workspace_actor_v5(
      p_actor_id uuid,p_scope text
    ) returns void language plpgsql stable as $$
    begin
      if p_actor_id is null or not exists(
        select 1 from auth.users account where account.id=p_actor_id
      ) then
        raise exception 'Autenticação obrigatória.' using errcode='42501';
      end if;
    end;
    $$;
    create or replace function private.educational_workspace_effective_role_v1(
      p_workspace_id uuid,p_actor_id uuid
    ) returns text language sql stable as $$
      select member.role
      from private.educational_workspace_members member
      where member.workspace_id=p_workspace_id and member.user_id=p_actor_id
    $$;
    create function public.get_authoring_workspace_v5(
      p_actor_id uuid,p_workspace_id uuid,p_course_ids text[] default null,
      p_include_card_content boolean default true
    ) returns jsonb language sql stable as $$
      select jsonb_build_object(
        'workspaceId',p_workspace_id,'capabilities',jsonb_build_object()
      )
    $$;
    create function private.educational_workspace_details_v1(
      p_actor_id uuid,p_workspace_id uuid
    ) returns jsonb language sql stable as $$
      select jsonb_build_object(
        'workspaceId',p_workspace_id,'capabilities',jsonb_build_object()
      )
    $$;

    -- Assinaturas legadas reais exercitam o guard central instalado por #107.
    create function public.select_catalog_course(
      p_course_id uuid,p_mutation_id uuid
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,public,auth as $$
    declare v_user_id uuid:=auth.uid(); v_selection_id uuid;
    begin
      if not exists(select 1 from public.courses course
        where course.id=p_course_id and course.owner_id is null
          and course.status='published' and course.deleted_at is null
          and course.document_storage_enabled) then
        raise exception 'Curso oficial publicado não encontrado.'
          using errcode='22023';
      end if;
      insert into public.user_course_selections(user_id,course_id)
      values(v_user_id,p_course_id) returning id into v_selection_id;
      return jsonb_build_object('status','applied','selectionId',v_selection_id);
    end;
    $$;
    create function public.unselect_catalog_course(
      p_course_id uuid,p_mutation_id uuid
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,public,auth as $$
    declare v_selection_id uuid;
    begin
      delete from public.user_course_selections selection
      where selection.user_id=auth.uid() and selection.course_id=p_course_id
      returning id into v_selection_id;
      return jsonb_build_object('status','applied','selectionId',v_selection_id);
    end;
    $$;
    create function public.remove_course_from_personal_library_v5(
      p_actor_id uuid,p_selection_id uuid,p_course_id uuid,
      p_request_id text,p_expected_content_hash text
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,public as $$
    begin
      delete from public.user_course_selections selection
      where selection.id=p_selection_id and selection.user_id=p_actor_id
        and selection.course_id=p_course_id;
      return jsonb_build_object('status','removed');
    end;
    $$;
    create function public.apply_sync_batch(
      p_device_id uuid,p_mutations jsonb
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,public as $$
    declare v_mutation jsonb:=p_mutations->0; v_result jsonb;
      v_code text; v_message text;
    begin
      begin
        v_result:=public.unselect_catalog_course(
          (v_mutation->>'courseId')::uuid,
          (v_mutation->>'mutationId')::uuid
        );
        return jsonb_build_object('status','applied','results',
          jsonb_build_array(v_result));
      exception when others then
        get stacked diagnostics v_code=returned_sqlstate,v_message=message_text;
        return jsonb_build_object('status','applied','results',jsonb_build_array(
          jsonb_build_object('status','rejected','code',v_code,'message',v_message)
        ));
      end;
    end;
    $$;
    create function public.submit_private_course_for_catalog_review_v5(
      p_actor_id uuid,p_submission_id uuid,p_course_id uuid,
      p_expected_content_hash text,p_note text default null
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,private as $$
    begin
      insert into private.catalog_review_submissions(
        id,source_course_id,artifact_hash
      ) values(p_submission_id,p_course_id,p_expected_content_hash);
      return jsonb_build_object('submissionId',p_submission_id);
    end;
    $$;
  `);
  await database.exec(await fs.readFile(experimentMigrationUrl, "utf8"));
  return database;
}

async function prepareAuditedBase(database) {
  await saveAnalysis(database, 1);
  await saveResourceSet(database, 2, {
    scope: MICRO_SCOPE
  });
  await saveResourceSet(database, 3, {
    id: "resource-set-b",
    scope: MICRO_SCOPE
  });
  let revision = 4;
  await setAssignment(database, revision++, {
    id: "fallback-micro",
    parameterId: "representation_fallback_policy",
    scope: MICRO_SCOPE,
    value: { kind: "enum", value: "block" }
  });
  await setAssignment(database, revision++, {
    id: "available-micro",
    parameterId: "available_resource_set_refs",
    scope: MICRO_SCOPE,
    value: { kind: "set", values: ["resource-set-a@1.0.0"] }
  });
  for (const [parameterId, value] of PARAMETER_VALUES) {
    await setAssignment(database, revision++, {
      id: `parameter-${parameterId}`,
      parameterId,
      scope: MICRO_SCOPE,
      value
    });
  }

  const snapshotInput = {
    contract: "EffectiveDesignSnapshot@1",
    modelVersion: "1.0.0",
    id: "snapshot-a",
    version: "1.0.0",
    scope: MICRO_SCOPE,
    analysisRef: { id: "analysis-a", version: "1.0.0" }
  };
  await scalar(database, `
    select public.resolve_authoring_effective_design_v1(
      $1,$2,'experiment:snapshot:0001',$3,$4,$5::jsonb
    ) value
  `, [
    ACTOR, WORKSPACE,
    await mutationHash(database, "resolve_effective_design", snapshotInput),
    revision, JSON.stringify(snapshotInput)
  ]);
  revision += 1;
  const snapshot = await scalar(database, `
    select public.get_authoring_effective_design_snapshot_v1(
      $1,$2,'snapshot-a','1.0.0'
    ) value
  `, [ACTOR, WORKSPACE]);

  const blueprintInput = {
    id: "blueprint-a",
    version: "1.0.0",
    modelVersion: "1.0.0",
    contractVersion: 2,
    scope: MICRO_SCOPE,
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
    blueprint: pedagogicalBlueprintV2(),
    binding: pedagogicalBlueprintBinding()
  };
  const blueprintReceipt = await scalar(database, `
    select public.save_authoring_pedagogical_blueprint_v1(
      $1,$2,'experiment:blueprint:0001',$3,$4,$5::jsonb
    ) value
  `, [
    ACTOR, WORKSPACE,
    await mutationHash(database, "save_pedagogical_blueprint", blueprintInput),
    revision, JSON.stringify(blueprintInput)
  ]);
  revision += 1;

  await database.query(`
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'card','card:a','microsequence','micro-a',0,$2::jsonb)
  `, [WORKSPACE, JSON.stringify({ kind: "theory", text: "Conteúdo A." })]);
  const designState = await scalar(database, `
    select public.get_authoring_design_state_v1(
      $1,$2,'microsequence','micro-a'
    ) value
  `, [ACTOR, WORKSPACE]);
  const manifest = {
    contract: "MaterializationManifest@1",
    modelVersion: "1.0.0",
    id: "manifest-a",
    version: "1.0.0",
    scope: MICRO_SCOPE,
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
    blueprintRef: { id: "blueprint-a", version: "1.0.0" },
    materializedWorkspaceRevision: revision,
    scopeEntityVersion: 1,
    contentHash: designState.materializationContentHash,
    blueprintHash: blueprintReceipt.blueprintHash,
    createdAt: "2026-08-16T12:00:00.000Z",
    resourceSetRefs: snapshot.resourceSetRefs,
    plannedSteps: [
      { stepRef: "theory:a", kind: "theory", unitRefs: ["unit:a"] },
      { stepRef: "practice:a", kind: "practice", unitRefs: ["unit:a"] }
    ],
    materializedSteps: [{
      stepRef: "theory:a", kind: "theory", unitRefs: ["unit:a"],
      artifactRefs: ["card:a"]
    }],
    explanationCoverage: [],
    evidenceCoverage: [],
    practiceOpportunities: [],
    resourceSelections: [{
      id: "selection:a",
      stepRef: "theory:a",
      package: { packageId: "aralearn.resource.concept_map", version: "1.0.0" },
      authorizedByResourceSetRef: { id: "resource-set-a", version: "1.0.0" },
      role: "exposition",
      fit: "canonical",
      rationale: "Representação canônica da relação.",
      limitations: []
    }],
    materializedResources: [{
      id: "resource:a",
      selectionRef: "selection:a",
      artifactRef: "card:a:resource:a",
      package: { packageId: "aralearn.resource.concept_map", version: "1.0.0" },
      role: "exposition"
    }],
    derivedMetrics: [], assumptions: [], limitations: []
  };
  await scalar(database, `
    select public.register_authoring_materialization_manifest_v1(
      $1,$2,'experiment:manifest:0001',$3,$4,$5::jsonb
    ) value
  `, [
    ACTOR, WORKSPACE,
    await mutationHash(database, "register_materialization_manifest", manifest),
    revision, JSON.stringify(manifest)
  ]);
  revision += 1;

  await database.query(`
    update private.authoring_workspaces
    set authoring_state=authoring_state || $2::jsonb
    where id=$1
  `, [WORKSPACE, JSON.stringify({
    mandate: { id: "mandate-audit-base", kind: "audit", decidedAtRevision: revision }
  })]);
  const materializationRevision = await scalar(database, `
    select materialization_revision::integer value
    from private.authoring_materialization_states
    where workspace_id=$1 and microsequence_ref='micro-a'
  `, [WORKSPACE]);
  const refs = {
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
    blueprintRef: { id: "blueprint-a", version: "1.0.0" },
    bindingRef: { id: "binding-a", version: "1.0.0" },
    manifestRef: { id: "manifest-a", version: "1.0.0" },
    resourceSetRefs: snapshot.resourceSetRefs
  };
  const algorithm = {
    id: "aralearn.instructional-conformance", version: "1.0.0"
  };
  const report = {
    contract: "AuthoringConformanceAudit@1",
    algorithm,
    scope: MICRO_SCOPE,
    auditedRevision: revision,
    refs,
    checks: [{ code: "base_is_current", category: "structure", status: "passed" }],
    metrics: [],
    summary: {
      structure: "conformant", design: "conformant",
      practice: "conformant", resources: "conformant",
      deterministicFindingCount: 0,
      checkCounts: { passed: 1, failed: 0, notApplicable: 0 }
    }
  };
  const auditCommand = {
    contract: "AuthoringConformanceAudit@1",
    kind: "audit",
    scope: MICRO_SCOPE,
    algorithm,
    microsequences: [{
      path: ["course-a", "module-a", "lesson-a", "micro-a"],
      scopeEntityVersion: 1,
      materializationStateRevision: materializationRevision,
      contentHash: manifest.contentHash,
      refs
    }],
    report,
    findings: []
  };
  const auditReceipt = await scalar(database, `
    select public.register_authoring_audit_run_v1(
      $1,$2,'experiment:audit:base:0001',$3,$4,$5::jsonb
    ) value
  `, [
    ACTOR, WORKSPACE,
    await mutationHash(database, "run_authoring_audit", auditCommand),
    revision, JSON.stringify(auditCommand)
  ]);
  revision += 1;
  const semantic = {
    auditRunRef: auditReceipt.auditRunRef,
    findings: [],
    verifications: []
  };
  await scalar(database, `
    select public.record_authoring_semantic_audit_v1(
      $1,$2,'experiment:audit:semantic:0001',$3,$4,$5::jsonb
    ) value
  `, [
    ACTOR, WORKSPACE,
    await mutationHash(database, "record_authoring_semantic_audit", semantic),
    revision, JSON.stringify(semantic)
  ]);
  revision += 1;
  return { revision, artifactHash: manifest.contentHash, auditReceipt };
}

async function materializeAndAuditVariant(database, variant, {
  suffix,
  artifactHash
}) {
  const resourceSetId = suffix === "condition-b"
    ? "resource-set-b"
    : "resource-set-a";
  let revision = await scalar(database, `
    select revision::integer value
    from private.authoring_workspaces where id=$1
  `, [variant.child_workspace_id]);
  const snapshotInput = {
    contract: "EffectiveDesignSnapshot@1",
    modelVersion: "1.0.0",
    id: `snapshot-${suffix}`,
    version: "1.0.0",
    scope: MICRO_SCOPE,
    analysisRef: { id: "analysis-a", version: "1.0.0" }
  };
  const snapshotReceipt = await scalar(database, `
    select public.resolve_authoring_effective_design_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR, variant.child_workspace_id, `experiment:${suffix}:snapshot:0001`,
    await mutationHash(database, "resolve_effective_design", snapshotInput),
    revision, JSON.stringify(snapshotInput)
  ]);
  assert.deepEqual(snapshotReceipt.snapshotRef, {
    id: snapshotInput.id, version: snapshotInput.version
  });
  revision += 1;
  const snapshot = await scalar(database, `
    select public.get_authoring_effective_design_snapshot_v1(
      $1,$2,$3,'1.0.0'
    ) value
  `, [ACTOR, variant.child_workspace_id, snapshotInput.id]);
  const binding = {
    ...pedagogicalBlueprintBinding(),
    id: `binding-${suffix}`,
    blueprintRef: { id: `blueprint-${suffix}`, version: "1.0.0" },
    effectiveSnapshotRef: { id: snapshotInput.id, version: "1.0.0" }
  };
  const blueprintInput = {
    id: `blueprint-${suffix}`,
    version: "1.0.0",
    modelVersion: "1.0.0",
    contractVersion: 2,
    scope: MICRO_SCOPE,
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: snapshotInput.id, version: "1.0.0" },
    blueprint: pedagogicalBlueprintV2(),
    binding
  };
  const blueprintReceipt = await scalar(database, `
    select public.save_authoring_pedagogical_blueprint_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR, variant.child_workspace_id, `experiment:${suffix}:blueprint:0001`,
    await mutationHash(database, "save_pedagogical_blueprint", blueprintInput),
    revision, JSON.stringify(blueprintInput)
  ]);
  revision += 1;
  await database.query(`
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values($1,'card','card:a','microsequence','micro-a',0,$2::jsonb)
  `, [
    variant.child_workspace_id,
    JSON.stringify({ kind: "theory", text: `Conteúdo materializado ${suffix}.` })
  ]);
  const designState = await scalar(database, `
    select public.get_authoring_design_state_v1(
      $1,$2,'microsequence','micro-a'
    ) value
  `, [ACTOR, variant.child_workspace_id]);
  const manifest = {
    contract: "MaterializationManifest@1",
    modelVersion: "1.0.0",
    id: `manifest-${suffix}`,
    version: "1.0.0",
    scope: MICRO_SCOPE,
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: snapshotInput.id, version: "1.0.0" },
    blueprintRef: { id: blueprintInput.id, version: "1.0.0" },
    materializedWorkspaceRevision: revision,
    scopeEntityVersion: 1,
    contentHash: designState.materializationContentHash,
    blueprintHash: blueprintReceipt.blueprintHash,
    createdAt: "2026-08-16T13:00:00.000Z",
    resourceSetRefs: snapshot.resourceSetRefs,
    plannedSteps: [
      { stepRef: "theory:a", kind: "theory", unitRefs: ["unit:a"] },
      { stepRef: "practice:a", kind: "practice", unitRefs: ["unit:a"] }
    ],
    materializedSteps: [{
      stepRef: "theory:a", kind: "theory", unitRefs: ["unit:a"],
      artifactRefs: ["card:a"]
    }],
    explanationCoverage: [],
    evidenceCoverage: [],
    practiceOpportunities: [],
    resourceSelections: [{
      id: `selection-${suffix}`,
      stepRef: "theory:a",
      package: { packageId: "aralearn.resource.concept_map", version: "1.0.0" },
      authorizedByResourceSetRef: { id: resourceSetId, version: "1.0.0" },
      role: "exposition",
      fit: "canonical",
      rationale: "Representação autorizada pela condição.",
      limitations: []
    }],
    materializedResources: [{
      id: `resource-${suffix}`,
      selectionRef: `selection-${suffix}`,
      artifactRef: `card:a:resource:${suffix}`,
      package: { packageId: "aralearn.resource.concept_map", version: "1.0.0" },
      role: "exposition"
    }],
    derivedMetrics: [], assumptions: [], limitations: []
  };
  await scalar(database, `
    select public.register_authoring_materialization_manifest_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR, variant.child_workspace_id, `experiment:${suffix}:manifest:0001`,
    await mutationHash(database, "register_materialization_manifest", manifest),
    revision, JSON.stringify(manifest)
  ]);
  revision += 1;

  const mandate = {
    id: `experiment:${variant.id}:audit`,
    kind: "audit",
    decidedAtRevision: revision
  };
  await database.query(`
    update private.authoring_workspaces
    set authoring_state=authoring_state || $2::jsonb
    where id=$1
  `, [variant.child_workspace_id, JSON.stringify({ mandate })]);
  const materializationRevision = await scalar(database, `
    select materialization_revision::integer value
    from private.authoring_materialization_states
    where workspace_id=$1 and microsequence_ref='micro-a'
  `, [variant.child_workspace_id]);
  const refs = {
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: snapshotInput.id, version: "1.0.0" },
    blueprintRef: { id: blueprintInput.id, version: "1.0.0" },
    bindingRef: { id: binding.id, version: "1.0.0" },
    manifestRef: { id: manifest.id, version: "1.0.0" },
    resourceSetRefs: snapshot.resourceSetRefs
  };
  const algorithm = {
    id: "aralearn.instructional-conformance", version: "1.0.0"
  };
  const report = {
    contract: "AuthoringConformanceAudit@1",
    algorithm,
    scope: MICRO_SCOPE,
    auditedRevision: revision,
    refs,
    checks: [{ code: "variant_is_current", category: "structure", status: "passed" }],
    metrics: [],
    summary: {
      structure: "conformant", design: "conformant",
      practice: "conformant", resources: "conformant",
      deterministicFindingCount: 0,
      checkCounts: { passed: 1, failed: 0, notApplicable: 0 }
    }
  };
  const auditCommand = {
    contract: "AuthoringConformanceAudit@1",
    kind: "audit",
    scope: MICRO_SCOPE,
    algorithm,
    microsequences: [{
      path: ["course-a", "module-a", "lesson-a", "micro-a"],
      scopeEntityVersion: 1,
      materializationStateRevision: materializationRevision,
      contentHash: manifest.contentHash,
      refs
    }],
    report,
    findings: []
  };
  const auditReceipt = await scalar(database, `
    select public.register_authoring_audit_run_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR, variant.child_workspace_id, `experiment:${suffix}:audit:0001`,
    await mutationHash(database, "run_authoring_audit", auditCommand),
    revision, JSON.stringify(auditCommand)
  ]);
  revision += 1;
  const semantic = {
    auditRunRef: auditReceipt.auditRunRef, findings: [], verifications: []
  };
  await scalar(database, `
    select public.record_authoring_semantic_audit_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR, variant.child_workspace_id, `experiment:${suffix}:semantic:0001`,
    await mutationHash(database, "record_authoring_semantic_audit", semantic),
    revision, JSON.stringify(semantic)
  ]);
  revision += 1;

  await database.query(`
    insert into private.artifact_refs(
      hash,bucket,object_key,artifact_type,media_type,size_bytes
    ) values($1,'authoring-artifacts',$2,'course_revision',
      'application/json',2048)
  `, [artifactHash, `sha256/${artifactHash.slice(0, 2)}/${artifactHash}.json`]);
  await database.query(`
    update public.courses
    set content_hash=$2,current_revision_hash=$2,revision_artifact_hash=$2
    where id=$1
  `, [variant.publication_course_id, artifactHash]);
  await database.query(`
    update private.authoring_workspace_publications
    set content_hash=$2,updated_at=now()
    where workspace_id=$1 and target='private'
  `, [variant.child_workspace_id, artifactHash]);
  await database.query(`
    insert into private.course_revisions(
      course_id,revision_hash,artifact_hash,validation_status,
      validated_at,published_at,created_by
    ) values($1,$2,$2,'validated',now(),now(),$3)
  `, [variant.publication_course_id, artifactHash, ACTOR]);
  return {
    revision,
    mandateRef: { id: mandate.id, version: String(mandate.decidedAtRevision) },
    auditRunRef: auditReceipt.auditRunRef,
    artifactHash
  };
}

function protocol({ artifactHash, assignmentRule = "manual", seed = null } = {}) {
  return {
    title: "Comparação parametrizada focal",
    hypothesis: "Variar o teto de unidades altera a compreensão sem mudar o alvo.",
    baseRef: { id: BASE_COURSE, version: artifactHash },
    scope: { kind: "microsequence", ref: "micro-a" },
    factors: [{
      factorId: "units-ceiling",
      definitionRef: {
        id: "new_units_per_theory_step_ceiling", version: "1.0.0"
      },
      kind: "parameter",
      targets: [{ kind: "microsequence", ref: "micro-a" }]
    }, {
      factorId: "resource-choice",
      definitionRef: {
        id: "available_resource_set_refs", version: "1.0.0"
      },
      kind: "resource_set",
      targets: [{ kind: "microsequence", ref: "micro-a" }]
    }],
    conditions: [{
      conditionId: "condition-a",
      label: "Duas unidades",
      values: [{
        factorId: "units-ceiling", value: { kind: "integer", value: 2 }
      }, {
        factorId: "resource-choice",
        resourceSetRef: { id: "resource-set-a", version: "1.0.0" }
      }]
    }, {
      conditionId: "condition-b",
      label: "Três unidades",
      values: [{
        factorId: "units-ceiling", value: { kind: "integer", value: 3 }
      }, {
        factorId: "resource-choice",
        resourceSetRef: { id: "resource-set-b", version: "1.0.0" }
      }]
    }],
    invariants: ["sources", "targets", "analysis", "structure"],
    assignment: {
      rule: assignmentRule,
      ...(assignmentRule === "seeded_random" ? { seed } : {})
    },
    consentPolicyRef: {
      id: "aralearn.consent.instructional_experiment.basic", version: "1.0.0"
    },
    instrumentRefs: [],
    outcomeRefs: []
  };
}

async function publishBase(database, revision, artifactHash) {
  await database.query(`
    insert into private.artifact_refs(
      hash,bucket,object_key,artifact_type,media_type,size_bytes,created_at
    ) values($1,'authoring-artifacts',$2,'course_revision',
      'application/json',1024,now()-interval '30 days')
  `, [artifactHash, `sha256/${artifactHash.slice(0, 2)}/${artifactHash}.json`]);
  await database.query(`
    insert into public.courses(
      id,owner_id,status,contract_key,title,goal,contract_scope,project_id,
      position,content_hash,current_revision_hash,revision_artifact_hash,
      module_count,lesson_count,microsequence_count,card_count,
      document_storage_enabled,completion_state
    ) values(
      $1,$2,'published','private-base','Curso base','Distinguir relações.',
      'course-a',gen_random_uuid(),0,$3,$3,$3,1,1,1,1,true,'complete'
    )
  `, [BASE_COURSE, ACTOR, artifactHash]);
  await database.query(`
    insert into private.course_revisions(
      course_id,revision_hash,artifact_hash,validation_status,
      validated_at,published_at,created_by
    ) values($1,$2,$2,'validated',now(),now(),$3)
  `, [BASE_COURSE, artifactHash, ACTOR]);
  await database.query(`
    insert into private.authoring_workspace_publications(
      workspace_id,workspace_course_id,target,course_id,content_hash
    ) values($1,'course-a','private',$2,$3)
  `, [WORKSPACE, BASE_COURSE, artifactHash]);
  assert.equal(await scalar(database, `
    select published_workspace_revision::bigint value
    from private.authoring_workspace_publications
    where workspace_id=$1 and target='private'
  `, [WORKSPACE]), revision);
}

async function manage(database, {
  actorId = ACTOR,
  experimentId = null,
  requestId,
  expectedExperimentRevision,
  expectedWorkspaceRevision = null,
  operation,
  payload
}) {
  return scalar(database, `
    select public.manage_authoring_experiment_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb
    ) value
  `, [
    actorId, WORKSPACE, experimentId, requestId, fixedHash("b"),
    expectedExperimentRevision, expectedWorkspaceRevision,
    operation, JSON.stringify(payload)
  ]);
}

function factualHunk(index, artifactHash) {
  return {
    differenceRef: {
      id: `difference:item:${String(index).padStart(4, "0")}`,
      version: sha256(`difference-item-${index}`)
    },
    differenceId: `h-${sha256(`difference-id-${index}`).slice(0, 16)}`,
    ordinal: index,
    path: ["cards", String(index - 1)],
    kind: "changed",
    factualSummary: `O valor factual ${index} mudou entre os artefatos pinados.`,
    beforeHash: sha256(`before-${index}`),
    afterHash: sha256(`after-${index}`),
    evidenceRefs: [`artifact:sha256:${artifactHash}`]
  };
}

async function registerEvidencePage(database, {
  experimentId,
  expectedExperimentRevision,
  variant,
  childRevision,
  mandateRef,
  differenceRunRef,
  baselineRef,
  pageOrdinal,
  pageCount,
  hunkCount,
  hunks,
  requestId
}) {
  const evidence = {
    differenceRunRef,
    baselineRef,
    candidateVariantRevisionRef: {
      id: variant.id, version: String(variant.variant_revision)
    },
    algorithmRef: {
      id: "canonical-json-pointer-fnv1a64-diff", version: "2.0.0"
    },
    pageOrdinal,
    pageCount,
    hunkCount,
    hunks
  };
  return scalar(database, `
    select public.register_authoring_experiment_variant_evidence_v1(
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb
    ) value
  `, [
    ACTOR, variant.child_workspace_id, experimentId, requestId,
    sha256(JSON.stringify(evidence)), expectedExperimentRevision, childRevision,
    JSON.stringify({ id: variant.id, version: String(variant.variant_revision) }),
    JSON.stringify(mandateRef), JSON.stringify(evidence)
  ]);
}

async function classifyEvidence(database, {
  experimentId,
  expectedExperimentRevision,
  variant,
  childRevision,
  mandateRef,
  differenceRunRef,
  hunks,
  requestId
}) {
  const classifications = hunks.map((hunk) => ({
    differenceRef: hunk.differenceRef,
    classification: "directly_required",
    publicRationale: "Mudança factual exigida pela condição experimental.",
    evidenceRefs: hunk.evidenceRefs
  }));
  return scalar(database, `
    select public.record_authoring_experiment_diff_classification_v1(
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12::jsonb
    ) value
  `, [
    ACTOR, variant.child_workspace_id, experimentId, requestId,
    sha256(JSON.stringify(classifications)), expectedExperimentRevision,
    childRevision, JSON.stringify(differenceRunRef),
    JSON.stringify({ id: variant.id, version: String(variant.variant_revision) }),
    JSON.stringify(mandateRef),
    ["course-a", "module-a", "lesson-a", "micro-a"],
    JSON.stringify(classifications)
  ]);
}

function assignmentProtocol({ assignmentRule, seed = null, conditionIds }) {
  return {
    title: `Atribuição ${assignmentRule}`,
    hypothesis: "A atribuição preserva a distribuição governada.",
    baseRef: { id: BASE_COURSE, version: BASE_ARTIFACT },
    scope: MICRO_SCOPE,
    factors: [{
      factorId: "units-ceiling",
      definitionRef: {
        id: "new_units_per_theory_step_ceiling", version: "1.0.0"
      },
      kind: "parameter",
      targets: [{ kind: "microsequence", ref: "micro-a" }]
    }],
    conditions: conditionIds.map((conditionId, index) => ({
      conditionId,
      label: `Condição ${conditionId}`,
      values: [{
        factorId: "units-ceiling",
        value: { kind: "integer", value: index + 2 }
      }]
    })),
    invariants: ["sources", "targets", "analysis", "structure"],
    assignment: {
      rule: assignmentRule,
      ...(assignmentRule === "seeded_random" ? { seed } : {})
    },
    consentPolicyRef: {
      id: "aralearn.consent.instructional_experiment.basic", version: "1.0.0"
    },
    instrumentRefs: [],
    outcomeRefs: []
  };
}

async function installCollectingAssignmentFixture(database, {
  experimentId,
  protocolRevision,
  assignmentRule,
  seed = null,
  conditionIds,
  experimentRevision
}) {
  const protocolPayload = assignmentProtocol({
    assignmentRule, seed, conditionIds
  });
  await database.query(`
    insert into private.artifact_refs(
      hash,bucket,object_key,artifact_type,media_type,size_bytes
    ) values($1,'authoring-artifacts',$2,'course_revision',
      'application/json',1024)
    on conflict(hash) do nothing
  `, [BASE_ARTIFACT, `sha256/aa/${BASE_ARTIFACT}.json`]);
  await database.query(`
    insert into private.authoring_experiments(
      id,workspace_id,experiment_key,title,state,revision,created_by,updated_by
    ) values($1,$2,$3,$4,'draft',$5,$6,$6)
  `, [
    experimentId, WORKSPACE, `fixture-${experimentId}`,
    protocolPayload.title, experimentRevision, ACTOR
  ]);
  await scalar(database, `
    select private.insert_authoring_experiment_protocol_v1(
      $1,$2,$3,$4,$5::jsonb
    ) value
  `, [
    ACTOR, WORKSPACE, experimentId, protocolRevision,
    JSON.stringify(protocolPayload)
  ]);
  const baseRevisionId = randomUUID();
  await database.query(`
    insert into private.authoring_experiment_base_revisions(
      id,experiment_id,protocol_revision,workspace_id,workspace_revision,
      scope_kind,scope_ref,scope_path,scope_entity_version,
      workspace_course_id,publication_course_id,artifact_hash,content_hash,
      validated_by
    ) values(
      $1,$2,$3,$4,1,'microsequence','micro-a',$5,1,
      'course-a',$6,$7,$7,$8
    )
  `, [
    baseRevisionId, experimentId, protocolRevision, WORKSPACE,
    ["course-a", "module-a", "lesson-a", "micro-a"],
    BASE_COURSE, BASE_ARTIFACT, ACTOR
  ]);
  await database.query(`
    update private.authoring_experiments
    set current_protocol_revision=$2,current_base_revision_id=$3,
      state='collecting'
    where id=$1
  `, [experimentId, protocolRevision, baseRevisionId]);

  const variants = [];
  for (const conditionId of [...conditionIds].sort()) {
    const childWorkspaceId = randomUUID();
    const courseId = randomUUID();
    const variantId = randomUUID();
    const variantRevisionId = randomUUID();
    const ordinal = await scalar(database, `
      select ordinal::integer value
      from private.authoring_experiment_conditions
      where experiment_id=$1 and protocol_revision=$2 and condition_id=$3
    `, [experimentId, protocolRevision, conditionId]);
    await database.query(`
      insert into private.authoring_workspaces(id,owner_id,title)
      values($1,$2,$3)
    `, [childWorkspaceId, ACTOR, `Child ${conditionId}`]);
    await database.query(`
      insert into private.educational_workspace_members(
        workspace_id,user_id,role,granted_by
      ) values($1,$2,'owner',$2)
    `, [childWorkspaceId, ACTOR]);
    await database.query(`
      insert into public.courses(
        id,owner_id,status,contract_key,title,content_hash,
        current_revision_hash,revision_artifact_hash,experiment_variant
      ) values($1,$2,'published',$3,$4,$5,$5,$5,true)
    `, [courseId, ACTOR, `fixture-${conditionId}`, conditionId, BASE_ARTIFACT]);
    await database.query(`
      insert into private.authoring_experiment_variants(
        id,experiment_id,protocol_revision,condition_id,ordinal
      ) values($1,$2,$3,$4,$5)
    `, [variantId, experimentId, protocolRevision, conditionId, ordinal]);
    await database.query(`
      insert into private.authoring_experiment_variant_revisions(
        id,variant_id,experiment_id,protocol_revision,condition_id,
        variant_revision,base_revision_id,child_workspace_id,
        workspace_course_id,publication_course_id,initial_workspace_revision,
        materialization_mandate_id,materialization_mandate_revision,
        evidence_workspace_revision,initial_artifact_hash,initial_content_hash,
        final_artifact_hash,final_content_hash,status,participant_continuity,
        scope_map,created_by,evidence_recorded_at
      ) values(
        $1,$2,$3,$4,$5,1,$6,$7,'course-a',$8,1,
        $9,1,1,$10,$10,$10,$10,'frozen','not_applicable',$11::jsonb,$12,now()
      )
    `, [
      variantRevisionId, variantId, experimentId, protocolRevision,
      conditionId, baseRevisionId, childWorkspaceId, courseId,
      `experiment:${variantRevisionId}:materialize`, BASE_ARTIFACT,
      JSON.stringify({ sourcePath: MICRO_SCOPE, targetPath: MICRO_SCOPE }), ACTOR
    ]);
    await database.query(`
      update private.authoring_experiment_variants
      set current_variant_revision_id=$2 where id=$1
    `, [variantId, variantRevisionId]);
    await database.query(`
      insert into private.authoring_experiment_variant_freezes(
        variant_revision_id,experiment_id,experiment_revision,
        artifact_hash,workspace_revision,frozen_by
      ) values($1,$2,$3,$4,1,$5)
    `, [variantRevisionId, experimentId, experimentRevision, BASE_ARTIFACT, ACTOR]);
    variants.push({ conditionId, variantRevisionId, courseId });
  }
  return {
    experimentId,
    protocolRevision,
    experimentRevision,
    protocolPayload,
    baseRevisionId,
    variants
  };
}

async function insertAssignmentEnrollment(database, {
  experimentId,
  protocolRevision,
  userId,
  participantRef
}) {
  const enrollmentRef = randomUUID();
  await database.query(`insert into auth.users(id) values($1)`, [userId]);
  await database.query(`
    insert into private.authoring_experiment_enrollments(
      id,experiment_id,protocol_revision,participant_ref,user_id,
      consent_policy_ref,consent_revision,accepted_at
    ) values(
      $1,$2,$3,$4,$5,
      'aralearn.consent.instructional_experiment.basic','1.0.0',now()
    )
  `, [enrollmentRef, experimentId, protocolRevision, participantRef, userId]);
  return enrollmentRef;
}

async function assignParticipant(database, {
  experimentId,
  enrollmentRef,
  expectedExperimentRevision,
  requestId
}) {
  return scalar(database, `
    select public.assign_authoring_experiment_participant_v1(
      $1,$2,$3,$4,$5,$6,$7::jsonb
    ) value
  `, [
    ACTOR, WORKSPACE, experimentId, requestId, fixedHash("8"),
    expectedExperimentRevision, JSON.stringify({ enrollmentRef })
  ]);
}

test("#107 percorre base auditada, valida protocolo e gera children com locks canônicos", async () => {
  const database = await installExperimentDatabase();
  try {
    const base = await prepareAuditedBase(database);
    await publishBase(database, base.revision, BASE_ARTIFACT);
    const protocolPayload = protocol({ artifactHash: BASE_ARTIFACT });
    const overlappingProtocol = structuredClone(protocolPayload);
    overlappingProtocol.scope = { kind: "lesson", ref: "lesson-a" };
    overlappingProtocol.factors[1].targets = [
      { kind: "lesson", ref: "lesson-a" }
    ];
    overlappingProtocol.factors.push({
      factorId: "resource-choice-nested",
      definitionRef: {
        id: "available_resource_set_refs", version: "1.0.0"
      },
      kind: "resource_set",
      targets: [{ kind: "microsequence", ref: "micro-a" }]
    });
    for (const condition of overlappingProtocol.conditions) {
      condition.values.push({
        factorId: "resource-choice-nested",
        resourceSetRef: condition.values[1].resourceSetRef
      });
    }
    await assert.rejects(manage(database, {
      requestId: "experiment:protocol:overlap:0001",
      expectedExperimentRevision: 0,
      operation: "save_protocol",
      payload: { protocol: overlappingProtocol }
    }), (error) => error.code === "23514");
    const created = await manage(database, {
      requestId: "experiment:protocol:create:0001",
      expectedExperimentRevision: 0,
      operation: "save_protocol",
      payload: { protocol: protocolPayload }
    });
    assert.equal(created.state, "draft");
    assert.equal(created.experimentRevision, 1);
    assert.equal(await scalar(database, `
      select protocol ? 'assignment' and not (protocol#>'{assignment}' ? 'seed') value
      from private.authoring_experiment_protocol_revisions
      where experiment_id=$1 and protocol_revision=1
    `, [created.experimentId]), true);

    const validated = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:validate:0001",
      expectedExperimentRevision: 1,
      expectedWorkspaceRevision: base.revision,
      operation: "validate",
      payload: {}
    });
    assert.equal(validated.state, "validated");
    const generated = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:generate:0001",
      expectedExperimentRevision: 2,
      expectedWorkspaceRevision: base.revision,
      operation: "generate_variants",
      payload: {}
    });
    assert.equal(generated.state, "generating");
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_variant_revisions
      where experiment_id=$1 and status='generating'
    `, [created.experimentId]), 2);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_design_parameter_assignments assignment
      join private.authoring_experiment_variant_revisions revision
        on revision.child_workspace_id=assignment.workspace_id
      where revision.experiment_id=$1 and assignment.mode='research_lock'
    `, [created.experimentId]), 4);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_lock_write_tokens
    `), 0);
    assert.equal(await scalar(database, `
      select bool_and(private.educational_workspace_can_v1(
        revision.child_workspace_id,$2,'author'
      )) value
      from private.authoring_experiment_variant_revisions revision
      where revision.experiment_id=$1
    `, [created.experimentId, ACTOR]), true);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.educational_workspace_members member
      join private.authoring_experiment_variant_revisions revision
        on revision.child_workspace_id=member.workspace_id
      where revision.experiment_id=$1 and member.user_id=$2
    `, [created.experimentId, PARTICIPANT]), 0);

    const variants = (await database.query(`
      select revision.id,revision.variant_revision,
        revision.child_workspace_id,revision.publication_course_id,
        revision.base_revision_id,variant.condition_id,variant.ordinal
      from private.authoring_experiment_variants variant
      join private.authoring_experiment_variant_revisions revision
        on revision.id=variant.current_variant_revision_id
      where variant.experiment_id=$1
      order by variant.ordinal
    `, [created.experimentId])).rows;
    const firstVariant = variants[0];
    const allowedByCondition = (await database.query(`
      select revision.condition_id,resource.resource_set_id
      from private.authoring_experiment_variant_revisions revision
      join private.authoring_experiment_variant_allowed_resource_sets resource
        on resource.variant_revision_id=revision.id
      where revision.experiment_id=$1 and resource.source_kind='factor'
      order by revision.condition_id,resource.resource_set_id
    `, [created.experimentId])).rows;
    assert.deepEqual(allowedByCondition, [{
      condition_id: "condition-a", resource_set_id: "resource-set-a"
    }, {
      condition_id: "condition-b", resource_set_id: "resource-set-b"
    }]);
    await assert.rejects(database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values($1,'card','card:unauthorized','microsequence','micro-a',99,$2::jsonb)
    `, [firstVariant.child_workspace_id, JSON.stringify({
      kind: "theory",
      resource: {
        packageId: "aralearn.resource.unauthorized", version: "1.0.0"
      }
    })]), (error) => error.code === "23514");
    const firstMaterialization = await materializeAndAuditVariant(
      database,
      firstVariant,
      { suffix: "condition-a", artifactHash: fixedHash("c") }
    );
    const variantRef = {
      id: firstVariant.id, version: String(firstVariant.variant_revision)
    };
    const prepared = await scalar(database, `
      select public.prepare_authoring_experiment_variant_evidence_v1(
        $1,$2,$3,'experiment:evidence:prepare:a',$4,3,$5,$6::jsonb,$7::jsonb,$8
      ) value
    `, [
      ACTOR, firstVariant.child_workspace_id, created.experimentId,
      fixedHash("d"), firstMaterialization.revision,
      JSON.stringify(variantRef), JSON.stringify(firstMaterialization.mandateRef),
      ["course-a", "module-a", "lesson-a", "micro-a"]
    ]);
    assert.deepEqual(prepared.algorithmRef, {
      id: "canonical-json-pointer-fnv1a64-diff", version: "2.0.0"
    });
    assert.equal(prepared.baselines.length, 1);
    assert.equal(prepared.baselines[0].progress.firstMissingPageOrdinal, 1);
    assert.equal(prepared.baselines[0].progress.differenceRunRef, null);
    const differenceRunRef = {
      id: "40000000-0000-4000-8000-000000000001",
      version: sha256("condition-a-versus-base")
    };
    const baselineRef = {
      kind: "base",
      ref: prepared.baselines[0].ref
    };
    const hunks = Array.from(
      { length: 21 },
      (_, index) => factualHunk(index + 1, firstMaterialization.artifactHash)
    );
    await assert.rejects(registerEvidencePage(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 3,
      variant: firstVariant,
      childRevision: firstMaterialization.revision,
      mandateRef: firstMaterialization.mandateRef,
      differenceRunRef,
      baselineRef,
      pageOrdinal: 2,
      pageCount: 2,
      hunkCount: hunks.length,
      hunks: hunks.slice(20),
      requestId: "experiment:evidence:a:page:0002:first"
    }), (error) => error.code === "40001");
    const pageOne = await registerEvidencePage(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 3,
      variant: firstVariant,
      childRevision: firstMaterialization.revision,
      mandateRef: firstMaterialization.mandateRef,
      differenceRunRef,
      baselineRef,
      pageOrdinal: 1,
      pageCount: 2,
      hunkCount: hunks.length,
      hunks: hunks.slice(0, 20),
      requestId: "experiment:evidence:a:page:0001"
    });
    assert.equal(pageOne.complete, false);
    assert.equal(pageOne.firstMissingPageOrdinal, 2);
    const pageOneReplay = await registerEvidencePage(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 3,
      variant: firstVariant,
      childRevision: firstMaterialization.revision,
      mandateRef: firstMaterialization.mandateRef,
      differenceRunRef,
      baselineRef,
      pageOrdinal: 1,
      pageCount: 2,
      hunkCount: hunks.length,
      hunks: hunks.slice(0, 20),
      requestId: "experiment:evidence:a:page:0001"
    });
    assert.equal(pageOneReplay.idempotent, true);
    const stalePreparedReplay = await scalar(database, `
      select public.prepare_authoring_experiment_variant_evidence_v1(
        $1,$2,$3,'experiment:evidence:prepare:a',$4,3,$5,$6::jsonb,$7::jsonb,$8
      ) value
    `, [
      ACTOR, firstVariant.child_workspace_id, created.experimentId,
      fixedHash("d"), firstMaterialization.revision,
      JSON.stringify(variantRef), JSON.stringify(firstMaterialization.mandateRef),
      ["course-a", "module-a", "lesson-a", "micro-a"]
    ]);
    assert.equal(stalePreparedReplay.idempotent, true);
    assert.equal(
      stalePreparedReplay.baselines[0].progress.differenceRunRef,
      null
    );
    const freshProgress = await scalar(database, `
      select public.get_authoring_experiment_variant_evidence_progress_v1(
        $1,$2,$3::jsonb
      ) value
    `, [ACTOR, firstVariant.child_workspace_id, JSON.stringify(variantRef)]);
    assert.equal(freshProgress.experimentRef.version, "4");
    assert.equal(freshProgress.baselines[0].progress.firstMissingPageOrdinal, 2);
    assert.deepEqual(
      freshProgress.baselines[0].progress.differenceRunRef,
      differenceRunRef
    );
    const pageTwo = await registerEvidencePage(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 4,
      variant: firstVariant,
      childRevision: firstMaterialization.revision,
      mandateRef: firstMaterialization.mandateRef,
      differenceRunRef,
      baselineRef,
      pageOrdinal: 2,
      pageCount: 2,
      hunkCount: hunks.length,
      hunks: hunks.slice(20),
      requestId: "experiment:evidence:a:page:0002"
    });
    assert.equal(pageTwo.complete, true);
    assert.equal(pageTwo.experimentRevision, 5);

    const firstClassification = await classifyEvidence(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 5,
      variant: firstVariant,
      childRevision: firstMaterialization.revision,
      mandateRef: firstMaterialization.mandateRef,
      differenceRunRef,
      hunks: hunks.slice(0, 20),
      requestId: "experiment:classify:a:0001"
    });
    assert.equal(firstClassification.pendingCount, 1);
    const finalClassification = await classifyEvidence(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 6,
      variant: firstVariant,
      childRevision: firstMaterialization.revision,
      mandateRef: firstMaterialization.mandateRef,
      differenceRunRef,
      hunks: hunks.slice(20),
      requestId: "experiment:classify:a:0002"
    });
    assert.equal(finalClassification.status, "classified");
    let experimentRevision = 7;
    for (const [index, hunk] of hunks.entries()) {
      const accepted = await manage(database, {
        experimentId: created.experimentId,
        requestId: `experiment:decision:a:${String(index + 1).padStart(4, "0")}`,
        expectedExperimentRevision: experimentRevision,
        operation: "decide_difference",
        payload: {
          differenceRunRef,
          differenceRef: hunk.differenceRef,
          decision: "accept",
          note: "Diferença factual conferida e aceita pelo pesquisador."
        }
      });
      experimentRevision = accepted.experimentRevision;
    }
    assert.equal(experimentRevision, 28);
    const frozenFirst = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:freeze:a:0001",
      expectedExperimentRevision: experimentRevision,
      expectedWorkspaceRevision: firstMaterialization.revision,
      operation: "freeze",
      payload: { variantRevisionRef: variantRef }
    });
    assert.equal(frozenFirst.experimentRevision, 29);
    assert.equal(await scalar(database, `
      select status value
      from private.authoring_experiment_variant_revisions where id=$1
    `, [firstVariant.id]), "frozen");
    await assert.rejects(database.query(`
      update private.authoring_workspace_entities
      set content='{"kind":"theory","text":"mutação tardia"}'::jsonb
      where workspace_id=$1 and entity_type='card' and entity_id='card:a'
    `, [firstVariant.child_workspace_id]), (error) => error.code === "55000");

    const secondVariant = variants[1];
    const secondMaterialization = await materializeAndAuditVariant(
      database,
      secondVariant,
      { suffix: "condition-b", artifactHash: fixedHash("d") }
    );
    const secondVariantRef = {
      id: secondVariant.id, version: String(secondVariant.variant_revision)
    };
    const preparedSecond = await scalar(database, `
      select public.prepare_authoring_experiment_variant_evidence_v1(
        $1,$2,$3,'experiment:evidence:prepare:b',$4,29,$5,$6::jsonb,$7::jsonb,$8
      ) value
    `, [
      ACTOR, secondVariant.child_workspace_id, created.experimentId,
      fixedHash("e"), secondMaterialization.revision,
      JSON.stringify(secondVariantRef), JSON.stringify(secondMaterialization.mandateRef),
      ["course-a", "module-a", "lesson-a", "micro-a"]
    ]);
    assert.deepEqual(
      preparedSecond.baselines.map(({ kind }) => kind),
      ["base", "variant_revision"]
    );
    const secondBaseRunRef = {
      id: "40000000-0000-4000-8000-000000000002",
      version: sha256("condition-b-versus-base")
    };
    const secondBaseReceipt = await registerEvidencePage(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 29,
      variant: secondVariant,
      childRevision: secondMaterialization.revision,
      mandateRef: secondMaterialization.mandateRef,
      differenceRunRef: secondBaseRunRef,
      baselineRef: {
        kind: "base", ref: preparedSecond.baselines[0].ref
      },
      pageOrdinal: 1,
      pageCount: 1,
      hunkCount: 0,
      hunks: [],
      requestId: "experiment:evidence:b:base:0001"
    });
    assert.equal(secondBaseReceipt.experimentRevision, 30);
    assert.equal(secondBaseReceipt.complete, true);
    await assert.rejects(manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:freeze:b:missing-cross",
      expectedExperimentRevision: 30,
      expectedWorkspaceRevision: secondMaterialization.revision,
      operation: "freeze",
      payload: { variantRevisionRef: secondVariantRef }
    }), (error) => error.code === "23514");
    const secondCrossRunRef = {
      id: "40000000-0000-4000-8000-000000000003",
      version: sha256("condition-b-versus-condition-a")
    };
    const secondCrossReceipt = await registerEvidencePage(database, {
      experimentId: created.experimentId,
      expectedExperimentRevision: 30,
      variant: secondVariant,
      childRevision: secondMaterialization.revision,
      mandateRef: secondMaterialization.mandateRef,
      differenceRunRef: secondCrossRunRef,
      baselineRef: {
        kind: "variant_revision", ref: preparedSecond.baselines[1].ref
      },
      pageOrdinal: 1,
      pageCount: 1,
      hunkCount: 0,
      hunks: [],
      requestId: "experiment:evidence:b:cross:0001"
    });
    assert.equal(secondCrossReceipt.experimentRevision, 31);
    assert.equal(await scalar(database, `
      select status value
      from private.authoring_experiment_variant_revisions where id=$1
    `, [secondVariant.id]), "ready");
    const frozenSecond = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:freeze:b:0001",
      expectedExperimentRevision: 31,
      expectedWorkspaceRevision: secondMaterialization.revision,
      operation: "freeze",
      payload: { variantRevisionRef: secondVariantRef }
    });
    assert.equal(frozenSecond.experimentRevision, 32);

    const started = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:collection:start:0001",
      expectedExperimentRevision: 32,
      expectedWorkspaceRevision: base.revision,
      operation: "start_collection",
      payload: {}
    });
    assert.equal(started.state, "collecting");
    assert.match(started.enrollmentCode, /^[A-Za-z0-9_-]{8,128}$/u);
    const rotated = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:collection:rotate:0001",
      expectedExperimentRevision: 33,
      operation: "rotate_enrollment_code",
      payload: {}
    });
    assert.notEqual(rotated.enrollmentCode, started.enrollmentCode);
    await assert.rejects(scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'read_policy',$2,null,null,null,null,null
      ) value
    `, [PARTICIPANT, started.enrollmentCode]), (error) => error.code === "P0002");
    const policy = await scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'read_policy',$2,null,null,null,null,null
      ) value
    `, [PARTICIPANT, rotated.enrollmentCode]);
    assert.deepEqual(policy.policy.ref, {
      id: "aralearn.consent.instructional_experiment.basic", version: "1.0.0"
    });
    assert.match(policy.policy.publicText, /retirar o consentimento/u);
    assert.match(policy.policy.publicText, /Conteúdo já baixado/u);
    assert.match(policy.policy.publicText, /adequação ética e jurídica/u);
    const enrollment = await scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'enroll',$2,null,'experiment:participant:enroll:0001',$3,$4::jsonb,true
      ) value
    `, [
      PARTICIPANT, rotated.enrollmentCode, fixedHash("f"),
      JSON.stringify(policy.policy.ref)
    ]);
    assert.equal(enrollment.status, "enrolled");
    assert.equal(enrollment.selection, null);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.educational_workspace_members where user_id=$1
    `, [PARTICIPANT]), 0);
    const assignment = await scalar(database, `
      select public.assign_authoring_experiment_participant_v1(
        $1,$2,$3,'experiment:participant:assign:0001',$4,34,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, created.experimentId, fixedHash("1"),
      JSON.stringify({
        enrollmentRef: enrollment.enrollmentRef,
        conditionRef: { id: "condition-a", version: "1" }
      })
    ]);
    assert.equal(assignment.experimentRevision, 35);
    const participantStatus = await scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'status',null,$2,null,null,null,null
      ) value
    `, [PARTICIPANT, enrollment.enrollmentRef]);
    assert.equal(participantStatus.status, "assigned");
    assert.equal(participantStatus.selection.courseId, firstVariant.publication_course_id);
    const participantSelectionId = participantStatus.selection.selectionId;
    await database.query(`select set_config('aralearn.test_actor',$1,false)`, [PARTICIPANT]);
    assert.equal(await scalar(database, `
      select public.user_can_read_course($1) value
    `, [firstVariant.publication_course_id]), true);
    assert.equal(await scalar(database, `
      select to_regprocedure(
        'public.get_course_revision_artifact_v3(uuid,uuid,text)'
      )::text value
    `), null);
    assert.equal(await scalar(database, `
      select to_regprocedure(
        'public.get_course_revision_artifact_v4(uuid,uuid,text)'
      ) is not null value
    `), true);
    assert.equal(await scalar(database, `
      select to_regprocedure(
        'public.get_course_document_artifact_v4(uuid,uuid)'
      ) is not null value
    `), true);
    const assignedRevisionArtifact = await scalar(database, `
      select public.get_course_revision_artifact_v4($1,$2,$3) value
    `, [
      PARTICIPANT, firstVariant.publication_course_id,
      firstMaterialization.artifactHash
    ]);
    assert.equal(assignedRevisionArtifact.hash, firstMaterialization.artifactHash);
    const assignedDocumentArtifact = await scalar(database, `
      select public.get_course_document_artifact_v4($1,$2) value
    `, [PARTICIPANT, firstVariant.publication_course_id]);
    assert.equal(
      assignedDocumentArtifact.artifact.hash,
      firstMaterialization.artifactHash
    );
    await database.query(`select set_config('aralearn.test_actor',$1,false)`, [OUTSIDER]);
    await assert.rejects(database.query(`
      insert into public.user_course_selections(id,user_id,course_id)
      values($1,$2,$3)
    `, [randomUUID(), OUTSIDER, firstVariant.publication_course_id]),
    (error) => error.code === "42501");
    await assert.rejects(scalar(database, `
      select public.submit_private_course_for_catalog_review_v5(
        $1,$2,$3,$4,'Não deve sair do experimento.'
      ) value
    `, [ACTOR, randomUUID(), firstVariant.publication_course_id,
      firstMaterialization.artifactHash]), (error) => error.code === "42501");
    await assert.rejects(database.query(`
      insert into public.catalog_collection_courses(
        collection_id,course_id,position
      ) values($1,$2,0)
    `, [randomUUID(), firstVariant.publication_course_id]),
    (error) => error.code === "42501");
    await database.query(`select set_config('aralearn.test_actor',$1,false)`, [PARTICIPANT]);
    await assert.rejects(database.query(`
      delete from public.user_course_selections where id=$1
    `, [participantSelectionId]), (error) => error.code === "42501");
    await assert.rejects(scalar(database, `
      select public.unselect_catalog_course($1,$2) value
    `, [firstVariant.publication_course_id, randomUUID()]),
    (error) => error.code === "42501");
    await assert.rejects(scalar(database, `
      select public.remove_course_from_personal_library_v5(
        $1,$2,$3,'experiment:selection:remove:0001',$4
      ) value
    `, [PARTICIPANT, participantSelectionId,
      firstVariant.publication_course_id, firstMaterialization.artifactHash]),
    (error) => error.code === "42501");
    const rejectedSync = await scalar(database, `
      select public.apply_sync_batch($1,$2::jsonb) value
    `, [randomUUID(), JSON.stringify([{
      mutationId: randomUUID(),
      entityId: participantSelectionId,
      courseId: firstVariant.publication_course_id,
      operation: "delete"
    }])]);
    assert.equal(rejectedSync.results[0].status, "rejected");
    assert.equal(rejectedSync.results[0].code, "42501");
    assert.equal(await scalar(database, `
      select count(*)::integer value from public.user_course_selections
      where id=$1
    `, [participantSelectionId]), 1);
    for (const [reader, courseId, revisionHash] of [
      [PARTICIPANT, secondVariant.publication_course_id,
        secondMaterialization.artifactHash],
      [OUTSIDER, firstVariant.publication_course_id,
        firstMaterialization.artifactHash]
    ]) {
      await assert.rejects(scalar(database, `
        select public.get_course_revision_artifact_v4($1,$2,$3) value
      `, [reader, courseId, revisionHash]), (error) => error.code === "42501");
      await assert.rejects(scalar(database, `
        select public.get_course_document_artifact_v4($1,$2) value
      `, [reader, courseId]), (error) => error.code === "42501");
    }

    const deletedEnrollment = await scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'enroll',$2,null,'experiment:participant:delete:enroll:0001',
        $3,$4::jsonb,true
      ) value
    `, [
      DELETED_PARTICIPANT, rotated.enrollmentCode, fixedHash("3"),
      JSON.stringify(policy.policy.ref)
    ]);
    const deletedAssignment = await scalar(database, `
      select public.assign_authoring_experiment_participant_v1(
        $1,$2,$3,'experiment:participant:delete:assign:0001',$4,35,$5::jsonb
      ) value
    `, [
      ACTOR, WORKSPACE, created.experimentId, fixedHash("4"),
      JSON.stringify({
        enrollmentRef: deletedEnrollment.enrollmentRef,
        conditionRef: { id: "condition-b", version: "1" }
      })
    ]);
    assert.equal(deletedAssignment.experimentRevision, 36);
    await database.query(`delete from auth.users where id=$1`, [DELETED_PARTICIPANT]);
    assert.equal(await scalar(database, `
      select user_id is null value
      from private.authoring_experiment_enrollments where id=$1
    `, [deletedEnrollment.enrollmentRef]), true);
    const anonymizedAssignment = (await database.query(`
      select participant_ref,selection_ref,selection_id,assignment_proof
      from private.authoring_experiment_assignments where enrollment_id=$1
    `, [deletedEnrollment.enrollmentRef])).rows[0];
    assert.match(anonymizedAssignment.participant_ref, /^participant:[0-9a-f-]{36}$/u);
    assert.ok(anonymizedAssignment.selection_ref);
    assert.equal(anonymizedAssignment.selection_id, null);
    assert.match(anonymizedAssignment.assignment_proof, /^[a-f0-9]{64}$/u);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_participant_requests where actor_id=$1
    `, [DELETED_PARTICIPANT]), 0);
    await database.query(`select set_config('aralearn.test_actor',$1,false)`, [PARTICIPANT]);

    await database.query(`
      update private.artifact_refs set created_at=now()-interval '30 days'
      where hash in ($1,$2)
    `, [firstMaterialization.artifactHash, secondMaterialization.artifactHash]);
    const orphanHash = fixedHash("9");
    await database.query(`
      insert into private.artifact_refs(
        hash,bucket,object_key,artifact_type,media_type,size_bytes,created_at
      ) values($1,'authoring-artifacts',$2,'course_revision',
        'application/json',16,now()-interval '30 days')
    `, [orphanHash, `sha256/99/${orphanHash}.json`]);
    const unreferenced = await scalar(database, `
      select public.list_unreferenced_artifacts_v4(interval '1 hour',100) value
    `);
    assert.deepEqual(unreferenced.map(({ hash }) => hash), [orphanHash]);
    const claimed = await scalar(database, `
      select public.claim_unreferenced_artifacts_v4(
        '50000000-0000-4000-8000-000000000001',interval '1 hour',100
      ) value
    `);
    assert.deepEqual(claimed.map(({ hash }) => hash), [orphanHash]);
    const correctionOverview = await scalar(database, `
      select public.get_authoring_experiment_v1(
        $1,$2,$3,'overview',null,null,null,10,null,null,20,null,null,20,
        null,null,20
      ) value
    `, [ACTOR, WORKSPACE, created.experimentId]);
    assert.equal(correctionOverview.actions.requestCorrection, true);

    const correction = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:variant:correction:0001",
      expectedExperimentRevision: 36,
      expectedWorkspaceRevision: firstMaterialization.revision,
      operation: "request_correction",
      payload: {
        variantRevisionRef: variantRef,
        reason: "A primeira condição exige uma nova revisão materializada.",
        participantContinuity: "retain_existing"
      }
    });
    assert.equal(correction.state, "correction_required");
    assert.equal(correction.experimentRevision, 37);
    assert.deepEqual((await database.query(`
      select condition_id,status
      from private.authoring_experiment_variant_revisions
      where id in ($1,$2) order by condition_id
    `, [firstVariant.id, secondVariant.id])).rows, [{
      condition_id: "condition-a", status: "invalidated"
    }, {
      condition_id: "condition-b", status: "invalidated"
    }]);
    await assert.rejects(manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:freeze:b:stale-after-correction",
      expectedExperimentRevision: 37,
      expectedWorkspaceRevision: secondMaterialization.revision,
      operation: "freeze",
      payload: { variantRevisionRef: secondVariantRef }
    }), (error) => error.code === "23514");
    await assert.rejects(manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:collection:stale-after-correction",
      expectedExperimentRevision: 37,
      expectedWorkspaceRevision: base.revision,
      operation: "start_collection",
      payload: {}
    }), (error) => error.code === "23514");
    const correctionReplay = await manage(database, {
      experimentId: created.experimentId,
      requestId: "experiment:variant:correction:0001",
      expectedExperimentRevision: 36,
      expectedWorkspaceRevision: firstMaterialization.revision,
      operation: "request_correction",
      payload: {
        variantRevisionRef: variantRef,
        reason: "A primeira condição exige uma nova revisão materializada.",
        participantContinuity: "retain_existing"
      }
    });
    assert.equal(correctionReplay.idempotent, true);

    await database.query(`delete from auth.users where id=$1`, [ACTOR]);
    assert.equal(await scalar(database, `
      select count(*)::integer value from auth.users where id=$1
    `, [ACTOR]), 0);
    assert.equal(await scalar(database, `
      select count(*)::integer value from public.courses
      where id=$1 and owner_id is null and experiment_base
    `, [BASE_COURSE]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_base_revisions
      where experiment_id=$1 and artifact_hash=$2
    `, [created.experimentId, BASE_ARTIFACT]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from public.catalog_collection_courses
      where course_id=$1 and deleted_at is null
    `, [BASE_COURSE]), 0);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from public.user_course_selections where course_id=$1
    `, [BASE_COURSE]), 0);
    assert.equal(await scalar(database, `
      select public.user_can_read_course($1) value
    `, [BASE_COURSE]), false);
    assert.equal((await scalar(database, `
      select public.get_course_revision_artifact_v4($1,$2,$3) value
    `, [ADMIN,BASE_COURSE,BASE_ARTIFACT])).hash, BASE_ARTIFACT);
    await assert.rejects(scalar(database, `
      select public.get_course_revision_artifact_v4($1,$2,$3) value
    `, [OUTSIDER,BASE_COURSE,BASE_ARTIFACT]),
    (error) => error.code === "42501");
    const regenerated = await manage(database, {
      actorId: ADMIN,
      experimentId: created.experimentId,
      requestId: "experiment:generate:correction:0001",
      expectedExperimentRevision: 37,
      expectedWorkspaceRevision: base.revision,
      operation: "generate_variants",
      payload: { participantContinuity: "retain_existing" }
    });
    assert.equal(regenerated.experimentRevision, 38);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_variant_revisions
      where experiment_id=$1 and variant_revision=2 and status='generating'
    `, [created.experimentId]), 2);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from public.courses
      where experiment_variant and owner_id is null
        and id in ($1,$2)
    `, [firstVariant.publication_course_id, secondVariant.publication_course_id]), 2);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from public.catalog_collection_courses
      where course_id in ($1,$2) and deleted_at is null
    `, [firstVariant.publication_course_id, secondVariant.publication_course_id]), 0);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from public.user_course_selections
      where user_id=$1 and course_id=$2
    `, [PARTICIPANT, firstVariant.publication_course_id]), 1);
    assert.equal(await scalar(database, `
      select public.user_can_read_course($1) value
    `, [firstVariant.publication_course_id]), true);
    assert.equal((await scalar(database, `
      select public.get_course_revision_artifact_v4($1,$2,$3) value
    `, [
      PARTICIPANT, firstVariant.publication_course_id,
      firstMaterialization.artifactHash
    ])).hash, firstMaterialization.artifactHash);
    assert.equal((await scalar(database, `
      select public.get_course_document_artifact_v4($1,$2) value
    `, [PARTICIPANT, firstVariant.publication_course_id])).artifact.hash,
    firstMaterialization.artifactHash);
    await assert.rejects(scalar(database, `
      select public.get_course_revision_artifact_v4($1,$2,$3) value
    `, [
      OUTSIDER, firstVariant.publication_course_id,
      firstMaterialization.artifactHash
    ]), (error) => error.code === "42501");
    await assert.rejects(scalar(database, `
      select public.get_course_document_artifact_v4($1,$2) value
    `, [OUTSIDER, firstVariant.publication_course_id]),
    (error) => error.code === "42501");
    assert.equal((await scalar(database, `
      select public.get_course_revision_artifact_v4($1,$2,$3) value
    `, [ADMIN, firstVariant.publication_course_id,
      firstMaterialization.artifactHash])).hash,
    firstMaterialization.artifactHash);
    assert.equal((await scalar(database, `
      select public.get_course_document_artifact_v4($1,$2) value
    `, [ADMIN, firstVariant.publication_course_id])).artifact.hash,
    firstMaterialization.artifactHash);
    await database.query(`select set_config('aralearn.test_actor',$1,false)`, [OUTSIDER]);
    await assert.rejects(scalar(database, `
      select public.select_catalog_course($1,$2) value
    `, [firstVariant.publication_course_id, randomUUID()]),
    (error) => error.code === "42501");
    await assert.rejects(scalar(database, `
      select public.select_catalog_course($1,$2) value
    `, [BASE_COURSE, randomUUID()]),
    (error) => error.code === "42501");
    await database.query(`select set_config('aralearn.test_actor',$1,false)`, [PARTICIPANT]);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.artifact_refs
      where hash in ($1,$2,$3)
    `, [BASE_ARTIFACT, firstMaterialization.artifactHash,
      secondMaterialization.artifactHash]), 3);

    const withdrawn = await scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'withdraw',null,$2,'experiment:participant:withdraw:0001',$3,null,null
      ) value
    `, [PARTICIPANT, enrollment.enrollmentRef, fixedHash("2")]);
    assert.equal(withdrawn.status, "withdrawn");
    assert.equal(withdrawn.selection, null);
    const withdrawnReplay = await scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'withdraw',null,$2,'experiment:participant:withdraw:0001',$3,null,null
      ) value
    `, [PARTICIPANT, enrollment.enrollmentRef, fixedHash("2")]);
    assert.equal(withdrawnReplay.idempotent, true);
    const withdrawnStatus = await scalar(database, `
      select public.manage_authoring_experiment_enrollment_v1(
        $1,'status',null,$2,null,null,null,null
      ) value
    `, [PARTICIPANT, enrollment.enrollmentRef]);
    assert.equal(withdrawnStatus.status, "withdrawn");
    assert.equal(await scalar(database, `
      select public.user_can_read_course($1) value
    `, [firstVariant.publication_course_id]), false);
    await assert.rejects(scalar(database, `
      select public.get_course_revision_artifact_v4($1,$2,$3) value
    `, [
      PARTICIPANT, firstVariant.publication_course_id,
      firstMaterialization.artifactHash
    ]), (error) => error.code === "42501");
    await assert.rejects(scalar(database, `
      select public.get_course_document_artifact_v4($1,$2) value
    `, [PARTICIPANT, firstVariant.publication_course_id]),
    (error) => error.code === "42501");
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_assignments
      where enrollment_id=$1 and selection_id is null
    `, [enrollment.enrollmentRef]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_selection_write_tokens
    `), 0);
  } finally {
    await database.close();
  }
});

test("#107 mantém seeded SQL igual ao helper e balanceia por contagem estável", async () => {
  const database = await installExperimentDatabase();
  try {
    const seededExperimentId = "30000000-0000-4000-8000-000000000001";
    const seededParticipantRef =
      "participant:60000000-0000-4000-8000-000000000001";
    const seededFixture = await installCollectingAssignmentFixture(database, {
      experimentId: seededExperimentId,
      protocolRevision: 7,
      assignmentRule: "seeded_random",
      seed: "seed-a",
      conditionIds: ["condition-c", "condition-a", "condition-b"],
      experimentRevision: 10
    });
    const seededEnrollment = await insertAssignmentEnrollment(database, {
      experimentId: seededExperimentId,
      protocolRevision: 7,
      userId: "60000000-0000-4000-8000-000000000002",
      participantRef: seededParticipantRef
    });
    const conditionRefs = ["condition-c", "condition-a", "condition-b"]
      .map((id) => ({ id, version: "7" }));
    const expectedSeeded = await assignSeededExperimentCondition({
      protocolRef: { id: seededExperimentId, version: "7" },
      seed: "seed-a",
      participantRef: seededParticipantRef,
      conditionRefs
    });
    assert.equal(
      expectedSeeded.algorithm,
      EXPERIMENT_ASSIGNMENT_ALGORITHMS.seededRandom
    );
    assert.deepEqual(expectedSeeded.conditionRef, {
      id: "condition-a", version: "7"
    });
    assert.equal(
      expectedSeeded.secretCommitment,
      "6e958e47d9d330f7402a1880dc867105365a800a4cd5bed6aea6753b80e28087"
    );
    assert.equal(
      expectedSeeded.assignmentFingerprint,
      "cf6433cd6b33bfb18e37687d936125594ef9c7b2bd96f27d4b824116ca92a2fe"
    );
    const seededReceipt = await assignParticipant(database, {
      experimentId: seededExperimentId,
      enrollmentRef: seededEnrollment,
      expectedExperimentRevision: 10,
      requestId: "experiment:seeded:assign:0001"
    });
    assert.equal(seededReceipt.experimentRevision, 11);
    const seededRow = (await database.query(`
      select condition_id,assignment_kind,algorithm_version,assignment_proof
      from private.authoring_experiment_assignments
      where experiment_id=$1 and enrollment_id=$2
    `, [seededExperimentId, seededEnrollment])).rows[0];
    assert.equal(seededRow.condition_id, expectedSeeded.conditionRef.id);
    assert.equal(seededRow.assignment_kind, "seeded_random");
    assert.equal(seededRow.algorithm_version, expectedSeeded.algorithm);
    assert.equal(seededRow.assignment_proof, expectedSeeded.assignmentFingerprint);
    const persistedSeed = (await database.query(`
      select protocol,assignment_secret_hash,assignment_secret_commitment
      from private.authoring_experiment_protocol_revisions
      where experiment_id=$1 and protocol_revision=7
    `, [seededExperimentId])).rows[0];
    assert.equal(persistedSeed.protocol.assignment.seed, undefined);
    assert.equal(persistedSeed.assignment_secret_hash, sha256("seed-a"));
    assert.equal(
      persistedSeed.assignment_secret_commitment,
      expectedSeeded.secretCommitment
    );
    assert.equal(JSON.stringify(seededFixture).includes("seed-a"), true);
    assert.equal(JSON.stringify(seededReceipt).includes("seed-a"), false);
    await database.query(`
      update private.authoring_experiments
      set state='paused',revision=revision+5 where id=$1
    `, [seededExperimentId]);
    const seededReplay = await assignParticipant(database, {
      experimentId: seededExperimentId,
      enrollmentRef: seededEnrollment,
      expectedExperimentRevision: 10,
      requestId: "experiment:seeded:assign:0001"
    });
    assert.equal(seededReplay.idempotent, true);
    assert.equal(seededReplay.experimentRevision, 11);

    const balancedExperimentId = randomUUID();
    await installCollectingAssignmentFixture(database, {
      experimentId: balancedExperimentId,
      protocolRevision: 1,
      assignmentRule: "balanced_simple",
      conditionIds: ["condition-b", "condition-a"],
      experimentRevision: 20
    });
    const balancedEnrollments = [];
    for (let index = 0; index < 2; index += 1) {
      balancedEnrollments.push(await insertAssignmentEnrollment(database, {
        experimentId: balancedExperimentId,
        protocolRevision: 1,
        userId: randomUUID(),
        participantRef: `participant:${randomUUID()}`
      }));
    }
    const firstBalanced = await assignParticipant(database, {
      experimentId: balancedExperimentId,
      enrollmentRef: balancedEnrollments[0],
      expectedExperimentRevision: 20,
      requestId: "experiment:balanced:assign:0001"
    });
    assert.equal(firstBalanced.experimentRevision, 21);
    const firstBalancedReplay = await assignParticipant(database, {
      experimentId: balancedExperimentId,
      enrollmentRef: balancedEnrollments[0],
      expectedExperimentRevision: 20,
      requestId: "experiment:balanced:assign:0001"
    });
    assert.equal(firstBalancedReplay.idempotent, true);
    const secondBalanced = await assignParticipant(database, {
      experimentId: balancedExperimentId,
      enrollmentRef: balancedEnrollments[1],
      expectedExperimentRevision: 21,
      requestId: "experiment:balanced:assign:0002"
    });
    assert.equal(secondBalanced.experimentRevision, 22);
    const balancedCounts = (await database.query(`
      select condition_id,count(*)::integer assignment_count
      from private.authoring_experiment_assignments
      where experiment_id=$1 group by condition_id order by condition_id
    `, [balancedExperimentId])).rows;
    assert.deepEqual(balancedCounts, [{
      condition_id: "condition-a", assignment_count: 1
    }, {
      condition_id: "condition-b", assignment_count: 1
    }]);
  } finally {
    await database.close();
  }
});

test("#107 escopa o mesmo hunk factual por rodada e decide pelo pin exato", async () => {
  const database = await installExperimentDatabase();
  try {
    const experimentId = randomUUID();
    const fixture = await installCollectingAssignmentFixture(database, {
      experimentId,
      protocolRevision: 1,
      assignmentRule: "manual",
      conditionIds: ["condition-a", "condition-b"],
      experimentRevision: 10
    });
    const runRefs = [0, 1].map((index) => ({
      id: randomUUID(),
      version: sha256(`shared-run-${index + 1}`)
    }));
    const sharedDifferenceRef = {
      id: "difference:shared:0001",
      version: sha256("shared-factual-hunk")
    };
    for (let index = 0; index < runRefs.length; index += 1) {
      await database.query(`
        insert into private.authoring_experiment_difference_runs(
          id,experiment_id,candidate_variant_revision_id,baseline_kind,
          base_revision_id,algorithm_id,algorithm_version,
          baseline_artifact_hash,variant_artifact_hash,factual_hash,
          hunk_count,page_count,created_by
        ) values(
          $1,$2,$3,'base',$4,'canonical-json-pointer-fnv1a64-diff','2.0.0',
          $5,$5,$6,1,1,$7
        )
      `, [runRefs[index].id, experimentId,
        fixture.variants[index].variantRevisionId, fixture.baseRevisionId,
        BASE_ARTIFACT, runRefs[index].version, ACTOR]);
      await database.query(`
        insert into private.authoring_experiment_difference_hunks(
          difference_run_id,difference_ref_id,hunk_id,hunk_hash,ordinal,
          path,change_kind,factual_summary,evidence_refs
        ) values($1,$2,'h-shared',$3,1,$4,'changed',$5,'{}')
      `, [runRefs[index].id, sharedDifferenceRef.id,
        sharedDifferenceRef.version, ["cards", "0"],
        "O mesmo hunk factual ocorre em duas comparações pinadas."]);
      await database.query(`
        insert into private.authoring_experiment_difference_pages(
          difference_run_id,page_ordinal,page_hash,item_count
        ) values($1,1,$2,1)
      `, [runRefs[index].id, sha256(`shared-page-${index + 1}`)]);
      await database.query(`
        insert into private.authoring_experiment_diff_classifications(
          experiment_id,difference_run_id,hunk_id,classification,
          public_evidence,evidence_refs,experiment_revision,classified_by
        ) values(
          $1,$2,'h-shared','directly_required',$3,'{}',10,$4
        )
      `, [experimentId, runRefs[index].id,
        "O hunk foi conferido na rodada factual exata.", ACTOR]);
    }
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_difference_hunks
      where difference_ref_id=$1
    `, [sharedDifferenceRef.id]), 2);

    const firstDecision = await manage(database, {
      experimentId,
      requestId: "experiment:shared-hunk:decision:0001",
      expectedExperimentRevision: 10,
      operation: "decide_difference",
      payload: {
        differenceRunRef: runRefs[0],
        differenceRef: sharedDifferenceRef,
        decision: "accept",
        note: "Aceite humano restrito à primeira rodada factual."
      }
    });
    assert.deepEqual(firstDecision.differenceRunRef, runRefs[0]);
    assert.deepEqual((await database.query(`
      select difference_run_id
      from private.authoring_experiment_difference_decisions
      order by decided_at,id
    `)).rows, [{ difference_run_id: runRefs[0].id }]);
    const secondDecision = await manage(database, {
      experimentId,
      requestId: "experiment:shared-hunk:decision:0002",
      expectedExperimentRevision: 11,
      operation: "decide_difference",
      payload: {
        differenceRunRef: runRefs[1],
        differenceRef: sharedDifferenceRef,
        decision: "accept",
        note: "Aceite humano independente para a segunda rodada factual."
      }
    });
    assert.deepEqual(secondDecision.differenceRunRef, runRefs[1]);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_experiment_difference_decisions
    `), 2);
  } finally {
    await database.close();
  }
});
