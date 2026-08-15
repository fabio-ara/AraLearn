import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import {
  canonicalJsonStringify
} from "../../supabase/functions/_shared/aralearn-authoring/canonicalJson.js";
import {
  DESIGN_PARAMETER_CATALOG
} from "../../src/authoring/instructionalDesignContracts.js";

const migrationUrl = new URL(
  "../../supabase/migrations/20260815193000_parameterized_authoring_design.sql",
  import.meta.url
);
const blueprintArtifactMigrationUrl = new URL(
  "../../supabase/migrations/20260815230000_authoring_blueprint_artifact_receipt.sql",
  import.meta.url
);

const ACTOR = "10000000-0000-4000-8000-000000000001";
const AUTHOR_ONLY = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";

function hash(character) {
  return character.repeat(64);
}

async function scalar(database, sql, parameters = []) {
  const result = await database.query(sql, parameters);
  return result.rows[0]?.value;
}

async function mutationHash(_database, operation, payload) {
  return createHash("sha256")
    .update(canonicalJsonStringify({ operation, payload }))
    .digest("hex");
}

function analysisPayload(revision = 1, overrides = {}) {
  return {
    contract: "InstructionalAnalysis@1",
    modelVersion: "1.0.0",
    id: "analysis-a",
    version: "1.0.0",
    scope: { kind: "microsequence", ref: "micro-a" },
    objective: "Distinguir relações causais de associações.",
    sourceRefs: [],
    derivedFrom: { workspaceRevision: revision, scopeEntityVersion: 1 },
    learnerContext: {
      audience: "Pessoa autodidata iniciante.",
      conditions: [],
      uncertainties: ["Conhecimento prévio não observado diretamente."]
    },
    units: [{
      id: "unit:a",
      label: "Relação causal",
      kind: "concept",
      priorKnowledge: {
        state: "unknown",
        basis: "inference",
        evidenceRefs: [],
        note: "O conhecimento prévio ainda não foi observado."
      },
      knowledgeFormHypothesis: {
        conditions: [],
        responses: [],
        expression: "verbal",
        rationaleAvailability: "unknown",
        basisRefs: [],
        note: "Hipótese operacional sujeita a revisão."
      }
    }],
    relations: [],
    coordinationRequirements: [],
    explanationRequirements: [{
      id: "explanation:a",
      targetUnitRefs: ["unit:a"],
      features: ["contrast"],
      applicabilityRationale: "A distinção precisa ser desenvolvida explicitamente."
    }],
    evidenceRequirements: [{
      id: "evidence:a",
      targetUnitRefs: ["unit:a"],
      operation: "compare",
      claim: "A pessoa distingue causalidade de associação.",
      acceptablePerformanceForms: ["explanation_with_example"],
      taskFeatures: ["paired_cases"],
      criterion: {
        observable: "Escolha e justificativa.",
        successCondition: "A justificativa usa a relação pertinente."
      },
      fidelityRequirementRef: null
    }],
    practiceVariationRequirements: [],
    fidelityRequirements: [],
    representationRequirements: [],
    assumptions: [],
    limitations: [],
    ...overrides
  };
}

function pedagogicalBlueprintV2() {
  return {
    goal: "Distinguir relações causais de associações.",
    learnerSituation: "Pessoa autodidata iniciante.",
    learningConditions: [],
    contentDemands: [{
      id: "demand:a",
      description: "Comparar relações e justificar a distinção.",
      cognitiveOperations: ["compare"]
    }],
    anticipatedDifficulties: [],
    designResponses: [],
    prerequisiteEvidence: [],
    conceptualLayers: [{
      id: "layer:a",
      plainLanguageReferent: "Relações entre acontecimentos.",
      formalTerms: ["causalidade"],
      requiresLayerIds: []
    }],
    theorySteps: [{
      id: "theory:a",
      layerIds: ["layer:a"],
      purpose: "Desenvolver a distinção antes da prática.",
      cognitiveOperation: "compare",
      packageCandidateIds: ["concept-map"]
    }],
    practiceSteps: [{
      id: "practice:a",
      targetLayerIds: ["layer:a"],
      decision: "Classificar a relação apresentada.",
      cognitiveOperation: "compare",
      packageCandidateIds: ["concept-map"],
      feedback: "Retomar a evidência necessária para afirmar causalidade."
    }],
    feedbackPlan: "Explicitar a relação usada na decisão.",
    termLedger: [{
      term: "causalidade",
      introducedInLayerId: "layer:a",
      plainMeaning: "Relação em que uma mudança produz outra."
    }],
    packageCandidates: [{
      id: "concept-map",
      packageId: "aralearn.resource.concept_map",
      version: "1.0.0",
      reason: "Representar relações explicitamente."
    }]
  };
}

function pedagogicalBlueprintBinding() {
  return {
    contract: "PedagogicalBlueprintBinding@1",
    id: "binding-a",
    version: "1.0.0",
    scope: { kind: "microsequence", ref: "micro-a" },
    blueprintRef: { id: "blueprint-a", version: "1.0.0" },
    blueprintContractVersion: 2,
    analysisRef: { id: "analysis-a", version: "1.0.0" },
    effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
    mappings: {
      conceptualLayers: [{ layerId: "layer:a", unitRefs: ["unit:a"] }],
      contentDemands: [{
        contentDemandId: "demand:a",
        unitRefs: ["unit:a"],
        evidenceRequirementRefs: ["evidence:a"]
      }],
      designResponses: [],
      theorySteps: [{
        stepId: "theory:a",
        unitRefs: ["unit:a"],
        explanationRequirementRefs: ["explanation:a"]
      }],
      practiceSteps: [{
        stepId: "practice:a",
        unitRefs: ["unit:a"],
        evidenceRequirementRefs: ["evidence:a"]
      }]
    }
  };
}

async function setupDatabase() {
  const database = new PGlite();
  await database.exec(`
    create schema private;
    create schema auth;
    create schema extensions;
    create role anon;
    create role authenticated;
    create role service_role;

    create table auth.users(id uuid primary key);
    create function extensions.digest(bytea,text)
    returns bytea language sql immutable
    as $$ select decode(md5($1) || md5($1), 'hex') $$;

    create function private.valid_authoring_continuity_v1(p_state jsonb)
    returns boolean language sql immutable as $$
      select jsonb_typeof(p_state) = 'object'
        and jsonb_typeof(p_state->'decisions') = 'array'
        and not exists (
          select 1 from jsonb_array_elements(p_state->'decisions') decision
          where jsonb_typeof(decision) <> 'object'
            or not (decision ?& array['id','summary','entityType','entityId'])
            or exists (
              select 1 from jsonb_object_keys(decision) field_name
              where field_name not in ('id','summary','entityType','entityId')
            )
        )
    $$;

    create table private.authoring_workspaces(
      id uuid primary key,
      owner_id uuid not null references auth.users(id),
      title text not null,
      revision bigint not null default 1,
      brief text not null default '',
      authoring_state jsonb not null default '{"decisions":[]}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      constraint authoring_workspaces_continuity_v1 check (
        private.valid_authoring_continuity_v1(authoring_state)
      )
    );
    create table private.authoring_workspace_entities(
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      entity_type text not null,
      entity_id text not null,
      parent_type text,
      parent_id text,
      position integer not null,
      content jsonb not null default '{}'::jsonb,
      version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(workspace_id, entity_type, entity_id)
    );
    create table private.authoring_workspace_requests(
      owner_id uuid not null references auth.users(id),
      request_id text not null,
      operation text not null,
      payload_hash text not null,
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      result jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '14 days',
      primary key(owner_id,request_id),
      constraint authoring_workspace_requests_operation_v5 check(operation in (
        'create','create_structure','update_metadata','save_microsequence_cards',
        'save_card','update_brief','copy_entity','rename_entity','move_entity',
        'delete_entity','merge_microsequences','split_microsequence',
        'promote_module','demote_course','import_course','replace_catalog_document',
        'publish_private_preview','publish_private_complete',
        'publish_catalog_complete','delete_workspace'
      )),
      check(payload_hash ~ '^[a-f0-9]{64}$'),
      check(jsonb_typeof(result) = 'object' and pg_column_size(result) <= 65536)
    );
    create table private.authoring_workspace_events(
      id bigint generated always as identity primary key,
      workspace_id uuid not null
        references private.authoring_workspaces(id) on delete cascade,
      revision bigint not null,
      operation text not null,
      summary jsonb not null,
      actor_id uuid references auth.users(id),
      created_at timestamptz not null default now(),
      unique(workspace_id,revision),
      constraint authoring_workspace_events_operation_v5 check(operation in (
        'create','create_structure','update_metadata','save_microsequence_cards',
        'save_card','update_brief','copy_entity','rename_entity','move_entity',
        'delete_entity','merge_microsequences','split_microsequence',
        'promote_module','demote_course','import_course'
      )),
      check(jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 32768)
    );
    create function private.require_educational_workspace_capability_v1(
      uuid,uuid,text
    ) returns text language plpgsql as $$
      begin
         if $2 not in ('${ACTOR}'::uuid,'${AUTHOR_ONLY}'::uuid) then
           raise exception 'Capability ausente.' using errcode='42501';
         end if;
         if $2 = '${AUTHOR_ONLY}'::uuid and $3 = 'manage' then
           raise exception 'Capability manage ausente.' using errcode='42501';
         end if;
        return $3;
      end
    $$;
    create function private.prune_authoring_workspace_state_v5(uuid,text)
    returns void language sql as $$ select $$;
    create function public.replay_authoring_workspace_request_v5(
      p_owner_id uuid,p_request_id text,p_payload_hash text,p_operation text
    ) returns jsonb language plpgsql security definer
    set search_path=pg_catalog,private as $$
      declare v_request private.authoring_workspace_requests%rowtype;
      begin
        select * into v_request from private.authoring_workspace_requests request
        where request.owner_id=p_owner_id and request.request_id=p_request_id;
        if not found then return null; end if;
        if v_request.payload_hash<>p_payload_hash
           or v_request.operation<>p_operation then
          raise exception 'requestId reutilizado com dados diferentes.'
            using errcode='23505';
        end if;
        return v_request.result || jsonb_build_object('idempotent',true);
      end
    $$;
    create function public.get_aralearn_runtime_manifest()
    returns jsonb language sql stable security definer
    set search_path = pg_catalog as $$
      select jsonb_build_object(
        'schemaRevision','20260812164000',
        'contractVersion',1,
        'features','["flat-runtime-manifest-v1"]'::jsonb
      )
    $$;

    insert into auth.users(id) values('${ACTOR}'),('${AUTHOR_ONLY}');
    insert into private.authoring_workspaces(id,owner_id,title)
    values('${WORKSPACE}','${ACTOR}','Workspace legado');
    insert into private.authoring_workspace_entities(
      workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
    ) values
      ('${WORKSPACE}','project','project-a',null,null,0,'{}'),
      ('${WORKSPACE}','course','course-a','project','project-a',0,'{}'),
      ('${WORKSPACE}','module','module-a','course','course-a',0,'{}'),
      ('${WORKSPACE}','lesson','lesson-a','module','module-a',0,'{}'),
      ('${WORKSPACE}','microsequence','micro-a','lesson','lesson-a',0,'{}'),
      ('${WORKSPACE}','microsequence','micro-legacy','lesson','lesson-a',1,'{}'),
      ('${WORKSPACE}','card','card-legacy','microsequence','micro-legacy',0,
       '{"kind":"theory","text":"Conteúdo anterior à parametrização."}');
  `);
  const migration = await fs.readFile(migrationUrl, "utf8");
  await database.exec(migration);
  const blueprintArtifactMigration = await fs.readFile(
    blueprintArtifactMigrationUrl,
    "utf8"
  );
  await database.exec(blueprintArtifactMigration);
  return database;
}

async function saveAnalysis(database, revision = 1, overrides = {}) {
  const analysis = analysisPayload(revision, overrides);
  const payloadHash = await mutationHash(
    database, "save_instructional_analysis", analysis
  );
  return scalar(database, `
    select public.save_authoring_instructional_analysis_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR,
    WORKSPACE,
    `analysis:request:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(analysis)
  ]);
}

async function saveResourceSet(database, revision, {
  id = "resource-set-a",
  version = "1.0.0",
  scope = { kind: "workspace", ref: WORKSPACE },
  packages = [{
    packageId: "aralearn.resource.concept_map",
    version: "1.0.0"
  }],
  allowedFits = ["canonical", "versatile", "substitute"],
  noAdequateRepresentation = "block"
} = {}) {
  const resourceSet = {
    contract: "ResourceSet@1",
    modelVersion: "1.0.0",
    id,
    version,
    scope,
    packages,
    resolvedCatalogVersion: "1.0.0",
    facetBasis: {
      catalogVersion: "1.0.0",
      families: ["relationships"],
      disciplines: [],
      structures: ["network"],
      cognitiveOperations: ["compare"],
      practiceModalities: []
    },
    selectionConstraints: {
      allowedFits,
      allowEmbeddedPractice: false,
      allowResponsePackages: false,
      onNoAdequateRepresentation: noAdequateRepresentation
    },
    provenanceRefs: ["condition:a"]
  };
  const payloadHash = await mutationHash(database, "save_resource_set", resourceSet);
  return scalar(database, `
    select public.save_authoring_resource_set_v1(
      $1,$2,$3,$4,$5,$6::jsonb
    ) value
  `, [
    ACTOR,
    WORKSPACE,
    `resource-set:${id}:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(resourceSet)
  ]);
}

async function setAssignment(database, revision, {
  id,
  version = "1.0.0",
  parameterId,
  scope,
  mode = "auto",
  value,
  requestSuffix = id,
  actor = ACTOR
}) {
  const authority = mode === "research_lock"
    ? { kind: "research_protocol", actorRef: "protocol:a", locked: true }
    : mode === "manual_override"
      ? { kind: "author", actorRef: actor, locked: false }
      : { kind: "gpt", actorRef: null, locked: false };
  const assignment = {
    contract: "DesignParameterAssignment@1",
    modelVersion: "1.0.0",
    id,
    version,
    definitionRef: { id: parameterId, version: "1.0.0" },
    scope,
    mode,
    value,
    authority,
    rationale: `Valor ${mode} para ${parameterId}.`,
    provenanceRefs: [`test:${requestSuffix}`]
  };
  const payloadHash = await mutationHash(
    database, "set_design_parameter", assignment
  );
  return scalar(database, `
    select public.manage_authoring_design_parameter_assignment_v1(
      $1,$2,$3,$4,$5,'set',$6::jsonb
    ) value
  `, [
    actor,
    WORKSPACE,
    `parameter:set:${requestSuffix}:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(assignment)
  ]);
}

async function removeAssignment(database, revision, {
  id,
  version,
  parameterId,
  scope,
  requestSuffix = id
}) {
  const assignment = {
    id,
    version,
    definitionRef: { id: parameterId, version: "1.0.0" },
    scope,
    rationale: "Restaurar herança.",
    provenanceRefs: ["author:restore-auto"]
  };
  const payloadHash = await mutationHash(
    database, "remove_design_parameter", assignment
  );
  return scalar(database, `
    select public.manage_authoring_design_parameter_assignment_v1(
      $1,$2,$3,$4,$5,'remove',$6::jsonb
    ) value
  `, [
    ACTOR,
    WORKSPACE,
    `parameter:remove:${requestSuffix}:${String(revision).padStart(4, "0")}`,
    payloadHash,
    revision,
    JSON.stringify(assignment)
  ]);
}

const MICRO_SCOPE = Object.freeze({ kind: "microsequence", ref: "micro-a" });
const PARAMETER_VALUES = Object.freeze([
  ["new_units_per_theory_step_ceiling", { kind: "integer", value: 2 }],
  ["simultaneous_new_units_per_coordination_set_ceiling", { kind: "integer", value: 2 }],
  ["applicable_explanation_requirement_refs", {
    kind: "set", values: ["explanation:b", "explanation:a"]
  }],
  ["evidence_alignment_relation", {
    kind: "relation",
    nodes: ["unit:a", "evidence:a"],
    edges: [{ from: "unit:a", to: "evidence:a", kind: "supports" }]
  }],
  ["distinct_practice_opportunities_per_evidence_requirement", {
    kind: "range", minimum: 1, maximum: 2
  }],
  ["practice_variation_dimensions", {
    kind: "vector",
    components: [{ dimension: "context", value: "varied", unit: "category" }]
  }],
  ["accepted_performance_forms", {
    kind: "set", values: ["explanation_with_example"]
  }]
]);

test("migration instala desenho parametrizado aditivo e preserva legado", async () => {
  const database = await setupDatabase();
  try {
    const catalogCount = await scalar(database, `
      select count(*)::integer value
      from private.authoring_design_parameter_definitions
    `);
    assert.equal(catalogCount, 9);
    const storedCatalog = await database.query(`
      select definition
      from private.authoring_design_parameter_definitions
      order by parameter_id
    `);
    assert.deepEqual(
      storedCatalog.rows.map(({ definition }) => definition),
      [...DESIGN_PARAMETER_CATALOG].sort((left, right) => (
        left.id.localeCompare(right.id, "en")
      ))
    );
    const manifest = await scalar(database, `
      select public.get_aralearn_runtime_manifest() value
    `);
    assert.equal(manifest.schemaRevision, "20260815230000");
    assert.equal(manifest.features.includes("flat-runtime-manifest-v1"), true);
    assert.equal(
      manifest.features.includes("parameterized-authoring-design-v1"),
      true
    );
    assert.equal(
      manifest.features.includes("authoring-blueprint-artifact-receipt-v1"),
      true
    );
    assert.equal(await scalar(database, `
      select has_function_privilege(
        'service_role',
        'private.canonical_authoring_parameter_value_v1(jsonb)',
        'EXECUTE'
      ) value
    `), false);
    const state = await scalar(database, `
      select public.get_authoring_design_state_v1($1,$2,'microsequence','micro-a') value
    `, [ACTOR, WORKSPACE]);
    assert.equal(state.analysisState, "unresolved");
    assert.equal(state.effectiveDesignState, "unresolved");
    assert.equal(state.materializationState, "unresolved");
    assert.equal(state.resourceAvailabilityState, "unresolved");
    const legacyState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-legacy'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(legacyState.materializationState, "legacy_untracked");
    assert.equal(legacyState.resourceAvailabilityState, "legacy_unrestricted");
    await database.exec(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values
        ('${WORKSPACE}','microsequence','micro-post-cutover',
         'lesson','lesson-a',2,'{}'),
        ('${WORKSPACE}','card','card-post-cutover',
         'microsequence','micro-post-cutover',0,
         '{"kind":"theory","text":"Conteúdo ainda sem manifesto."}')
    `);
    const postCutoverUntracked = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-post-cutover'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(postCutoverUntracked.materializationState, "legacy_untracked");
    assert.equal(
      postCutoverUntracked.resourceAvailabilityState,
      "legacy_unrestricted"
    );
    await assert.rejects(scalar(database, `
      select public.get_authoring_design_state_v1(
        '10000000-0000-4000-8000-000000000099',$1,
        'microsequence','micro-a'
      ) value
    `, [WORKSPACE]), (error) => error.code === "42501");

    const operations = await database.query(`
      select conname, pg_get_constraintdef(oid) definition
      from pg_constraint
      where conname in (
        'authoring_workspace_requests_operation_v5',
        'authoring_workspace_events_operation_v5'
      )
      order by conname
    `);
    assert.equal(operations.rows.length, 2);
    for (const { definition } of operations.rows) {
      for (const operation of [
        "replace_catalog_document",
        "update_continuity",
        "save_instructional_analysis",
        "register_materialization_manifest"
      ]) {
        assert.match(definition, new RegExp(operation));
      }
    }
  } finally {
    await database.close();
  }
});

test("continuidade aceita extensões normativas e rejeita vínculos incompletos", async () => {
  const database = await setupDatabase();
  try {
    const valid = {
      decisions: [{
        id: "decision-a",
        summary: "Usar representação canônica.",
        entityType: "microsequence",
        entityId: "micro-a",
        representationSelection: {
          intent: "Comparar relações.",
          chosen: {
            packageId: "aralearn.resource.concept_map",
            version: "1.0.0"
          },
          fit: "canonical",
          catalogVersion: "1.0.0",
          limitations: []
        },
        pedagogicalDiagnosis: {
          difficultyResponses: [{
            difficulty: "Confundir direção.",
            response: "Contrastar exemplos."
          }]
        }
      }]
    };
    await database.query(`
      update private.authoring_workspaces set authoring_state=$2::jsonb where id=$1
    `, [WORKSPACE, JSON.stringify(valid)]);
    const invalid = structuredClone(valid);
    delete invalid.decisions[0].entityId;
    await assert.rejects(database.query(`
      update private.authoring_workspaces set authoring_state=$2::jsonb where id=$1
    `, [WORKSPACE, JSON.stringify(invalid)]), (error) => error.code === "23514");
  } finally {
    await database.close();
  }
});

test("análise usa capability, CAS, receipt idempotente e bloqueia CoT", async () => {
  const database = await setupDatabase();
  try {
    const analysis = analysisPayload();
    const analysisHash = await mutationHash(
      database, "save_instructional_analysis", analysis
    );
    const result = await scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0001',$3,1,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, analysisHash, JSON.stringify(analysis)]);
    assert.equal(result.revision, 2);
    assert.equal(result.idempotent, false);
    const preflightReplay = await scalar(database, `
      select public.replay_authoring_workspace_request_v5(
        $1,'analysis:request:0001',$2,'save_instructional_analysis'
      ) value
    `, [ACTOR, analysisHash]);
    assert.equal(preflightReplay.idempotent, true);
    assert.equal(preflightReplay.revision, 2);
    const replay = await scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0001',$3,1,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, analysisHash, JSON.stringify(analysis)]);
    assert.equal(replay.idempotent, true);
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0001',$3,2,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, analysisHash, JSON.stringify({
      ...analysis,
      objective: "Payload diferente não pode reaproveitar receipt."
    })]), (error) => error.code === "23505");
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:hash-mismatch',$3,2,$4::jsonb
      ) value
    `, [ACTOR, WORKSPACE, "invalid", JSON.stringify({
      ...analysis,
      id: "analysis-hash-mismatch"
    })]), (error) => error.code === "22023");
    const cotAnalysis = {
      ...analysis,
      id: "analysis-cot",
      chainOfThought: "raciocínio privado"
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0002',$3,2,$4::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_instructional_analysis", cotAnalysis),
      JSON.stringify(cotAnalysis)
    ]), (error) => error.code === "22023");
    const promptAnalysis = {
      ...analysis,
      id: "analysis-prompt",
      provenance: { System_Prompt: "não persistir" },
      CHAT_messages: ["não persistir"]
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:0003',$3,2,$4::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_instructional_analysis", promptAnalysis),
      JSON.stringify(promptAnalysis)
    ]), (error) => error.code === "22023");
    const missingContract = structuredClone(analysis);
    delete missingContract.contract;
    await assert.rejects(scalar(database, `
      select public.save_authoring_instructional_analysis_v1(
        $1,$2,'analysis:request:missing-contract',$3,2,$4::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_instructional_analysis", missingContract),
      JSON.stringify(missingContract)
    ]), (error) => error.code === "22023");
    const receiptSize = await scalar(database, `
      select pg_column_size(result)::integer value
      from private.authoring_workspace_requests
      where owner_id=$1 and request_id='analysis:request:0001'
    `, [ACTOR]);
    assert.ok(receiptSize < 2_048);
  } finally {
    await database.close();
  }
});

test("override manual restaura Auto e locks redundantes preservam o bloqueador aplicável", async () => {
  const database = await setupDatabase();
  try {
    let revision = 1;
    await setAssignment(database, revision++, {
      id: "fallback-auto-micro",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE,
      value: { kind: "enum", value: "block" }
    });
    for (const [parameterId, value] of PARAMETER_VALUES) {
      await setAssignment(database, revision++, {
        id: `lock-test-${parameterId}`,
        parameterId,
        scope: MICRO_SCOPE,
        value
      });
    }
    await setAssignment(database, revision++, {
      id: "lock-test-available-resource-sets",
      parameterId: "available_resource_set_refs",
      scope: MICRO_SCOPE,
      value: { kind: "set", values: [] }
    });
    await setAssignment(database, revision++, {
      id: "fallback-manual-micro",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE,
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const overridden = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(overridden.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    )).resolution.assignmentRef.id, "fallback-manual-micro");
    await removeAssignment(database, revision++, {
      id: "fallback-manual-micro",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE
    });
    const restored = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(restored.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    )).resolution.assignmentRef.id, "fallback-auto-micro");
    await setAssignment(database, revision++, {
      id: "fallback-manual-course-priority",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const inheritedManual = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const inheritedFallback = inheritedManual.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    ));
    assert.equal(inheritedFallback.resolution.assignmentRef.id, (
      "fallback-manual-course-priority"
    ));
    assert.equal(inheritedFallback.resolution.inheritance, "inherited");
    await removeAssignment(database, revision++, {
      id: "fallback-manual-course-priority",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" }
    });

    await setAssignment(database, revision++, {
      id: "explanations-lock-micro",
      parameterId: "applicable_explanation_requirement_refs",
      scope: MICRO_SCOPE,
      mode: "research_lock",
      value: { kind: "set", values: ["explanation:b", "explanation:a"] }
    });
    await setAssignment(database, revision++, {
      id: "explanations-lock-micro",
      version: "2.0.0",
      parameterId: "applicable_explanation_requirement_refs",
      scope: MICRO_SCOPE,
      mode: "research_lock",
      value: { kind: "set", values: ["explanation:a", "explanation:b"] },
      requestSuffix: "explanations-lock-micro-v2"
    });
    const canonicalLocks = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(canonicalLocks.status, "resolved");
    assert.deepEqual(canonicalLocks.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "applicable_explanation_requirement_refs"
    )).value.values, ["explanation:a", "explanation:b"]);

    await setAssignment(database, revision++, {
      id: "fallback-lock-workspace",
      parameterId: "representation_fallback_policy",
      scope: { kind: "workspace", ref: WORKSPACE },
      mode: "research_lock",
      value: { kind: "enum", value: "block" }
    });
    await assert.rejects(setAssignment(database, revision, {
      id: "fallback-lock-workspace",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: { kind: "workspace", ref: WORKSPACE },
      mode: "manual_override",
      value: { kind: "enum", value: "block" },
      actor: AUTHOR_ONLY,
      requestSuffix: "lock-author-downgrade"
    }), (error) => error.code === "42501");
    await assert.rejects(setAssignment(database, revision, {
      id: "fallback-lock-workspace",
      version: "2.0.1",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "block" },
      actor: AUTHOR_ONLY,
      requestSuffix: "lock-author-move"
    }), (error) => error.code === "42501");
    await assert.rejects(setAssignment(database, revision, {
      id: "fallback-lock-workspace",
      version: "2.0.2",
      parameterId: "available_resource_set_refs",
      scope: { kind: "workspace", ref: WORKSPACE },
      mode: "manual_override",
      value: { kind: "set", values: [] },
      actor: AUTHOR_ONLY,
      requestSuffix: "lock-author-definition"
    }), (error) => error.code === "42501");
    await setAssignment(database, revision++, {
      id: "fallback-lock-lesson",
      parameterId: "representation_fallback_policy",
      scope: { kind: "lesson", ref: "lesson-a" },
      mode: "research_lock",
      value: { kind: "enum", value: "block" }
    });
    await setAssignment(database, revision++, {
      id: "fallback-manual-course",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const nestedLocks = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const courseConflict = nestedLocks.conflicts.find((conflict) => (
      conflict.code === "research_lock_blocks_lower_assignment"
      && conflict.blockedAssignmentRef.id === "fallback-manual-course"
    ));
    assert.equal(nestedLocks.status, "conflict");
    assert.equal(courseConflict.lockAssignmentRef.id, "fallback-lock-workspace");
  } finally {
    await database.close();
  }
});

test("resolução, ResourceSet, snapshot, blueprint e manifesto preservam proveniência", async () => {
  const database = await setupDatabase();
  try {
    await saveAnalysis(database, 1);

    await assert.rejects(saveResourceSet(database, 2, {
      id: "resource-set-duplicate",
      packages: [
        { packageId: "aralearn.resource.concept_map", version: "1.0.0" },
        { packageId: "aralearn.resource.concept_map", version: "1.0.0" }
      ]
    }), (error) => error.code === "22023");
    await saveResourceSet(database, 2, {
      scope: { kind: "lesson", ref: "lesson-a" },
      packages: [{
        packageId: "aralearn.resource.concept_map",
        version: "1.0.0"
      }, {
        packageId: "aralearn.response.choice",
        version: "1.0.0"
      }]
    });
    await saveResourceSet(database, 3, {
      id: "resource-set-record",
      scope: { kind: "lesson", ref: "lesson-a" },
      noAdequateRepresentation: "record_limitation"
    });
    const storedResourceSet = await scalar(database, `
      select public.get_authoring_resource_set_v1(
        $1,$2,'resource-set-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(storedResourceSet.scope.kind, "lesson");
    assert.equal(storedResourceSet.packages.length, 2);
    assert.equal(
      storedResourceSet.selectionConstraints.onNoAdequateRepresentation,
      "block"
    );
    await assert.rejects(database.query(`
      update private.authoring_resource_sets
      set resolved_catalog_version='2.0.0'
      where workspace_id=$1 and resource_set_id='resource-set-a'
    `, [WORKSPACE]), (error) => error.code === "55000");

    let revision = 4;
    await setAssignment(database, revision++, {
      id: "fallback-workspace",
      parameterId: "representation_fallback_policy",
      scope: { kind: "workspace", ref: WORKSPACE },
      value: { kind: "enum", value: "block" }
    });
    await assert.rejects(setAssignment(database, 3, {
      id: "fallback-cas-stale",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      value: { kind: "enum", value: "allow_versatile_with_limitation" }
    }), (error) => error.code === "40001");
    await setAssignment(database, revision++, {
      id: "fallback-course",
      parameterId: "representation_fallback_policy",
      scope: { kind: "course", ref: "course-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    await setAssignment(database, revision++, {
      id: "fallback-lesson",
      parameterId: "representation_fallback_policy",
      scope: { kind: "lesson", ref: "lesson-a" },
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    await setAssignment(database, revision++, {
      id: "fallback-micro",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE,
      mode: "manual_override",
      value: { kind: "enum", value: "block" }
    });
    await setAssignment(database, revision++, {
      id: "available-lesson",
      parameterId: "available_resource_set_refs",
      scope: { kind: "lesson", ref: "lesson-a" },
      value: {
        kind: "set",
        values: ["resource-set-record@1.0.0", "resource-set-a@1.0.0"]
      }
    });
    await assert.rejects(setAssignment(database, revision, {
      id: "invalid-duplicate-set",
      parameterId: "applicable_explanation_requirement_refs",
      scope: MICRO_SCOPE,
      value: { kind: "set", values: ["explanation:a", "explanation:a"] }
    }), (error) => error.code === "22023");
    await assert.rejects(setAssignment(database, revision, {
      id: "invalid-integer-string",
      parameterId: "new_units_per_theory_step_ceiling",
      scope: { kind: "lesson", ref: "lesson-a" },
      value: { kind: "integer", value: "2" }
    }), (error) => error.code === "22023");
    await assert.rejects(setAssignment(database, revision, {
      id: "invalid-relation-kind",
      parameterId: "evidence_alignment_relation",
      scope: MICRO_SCOPE,
      value: {
        kind: "relation",
        nodes: ["unit:a", "evidence:a"],
        edges: [{ from: "unit:a", to: "evidence:a", kind: "causes" }]
      }
    }), (error) => error.code === "22023");
    for (const [parameterId, value] of PARAMETER_VALUES) {
      await setAssignment(database, revision++, {
        id: `parameter-${parameterId}`,
        parameterId,
        scope: MICRO_SCOPE,
        value
      });
    }
    assert.equal(revision, 16);
    const nearest = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(nearest.status, "resolved");
    assert.deepEqual(
      nearest.resolutionPath.map(({ kind }) => kind),
      ["workspace", "course", "module", "lesson", "microsequence"]
    );
    assert.equal(nearest.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    )).resolution.assignmentRef.id, "fallback-micro");
    assert.equal(nearest.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "available_resource_set_refs"
    )).resolution.inheritance, "inherited");

    await setAssignment(database, revision++, {
      id: "fallback-protocol-lock",
      parameterId: "representation_fallback_policy",
      scope: { kind: "module", ref: "module-a" },
      mode: "research_lock",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const blocked = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(blocked.status, "conflict");
    assert.equal(blocked.conflicts.some(({ code }) => (
      code === "research_lock_blocks_lower_assignment"
    )), true);

    await removeAssignment(database, revision++, {
      id: "fallback-micro",
      version: "2.0.0",
      parameterId: "representation_fallback_policy",
      scope: MICRO_SCOPE
    });
    const locked = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(locked.status, "resolved");
    const fallback = locked.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    ));
    assert.equal(fallback.resolution.assignmentMode, "research_lock");
    assert.equal(fallback.resolution.sourceScope.kind, "module");
    await setAssignment(database, revision++, {
      id: "fallback-module-redundant",
      parameterId: "representation_fallback_policy",
      scope: { kind: "module", ref: "module-a" },
      mode: "manual_override",
      value: { kind: "enum", value: "allow_substitute_with_limitation" }
    });
    const redundantUnderLock = await scalar(database, `
      select public.preview_authoring_effective_design_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const redundantFallback = redundantUnderLock.resolvedValues.find(({ definitionRef }) => (
      definitionRef.id === "representation_fallback_policy"
    ));
    assert.equal(redundantUnderLock.status, "resolved");
    assert.equal(redundantFallback.resolution.assignmentMode, "research_lock");

    const snapshotInput = {
      contract: "EffectiveDesignSnapshot@1",
      modelVersion: "1.0.0",
      id: "snapshot-a",
      version: "1.0.0",
      scope: MICRO_SCOPE,
      analysisRef: { id: "analysis-a", version: "1.0.0" }
    };
    const snapshotReceipt = await scalar(database, `
      select public.resolve_authoring_effective_design_v1(
        $1,$2,'snapshot:resolve:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "resolve_effective_design", snapshotInput),
      revision,
      JSON.stringify(snapshotInput)
    ]);
    assert.equal(snapshotReceipt.snapshotRef.id, "snapshot-a");
    assert.equal(Object.hasOwn(snapshotReceipt, "snapshot"), false);
    revision += 1;
    const snapshot = await scalar(database, `
      select public.get_authoring_effective_design_snapshot_v1(
        $1,$2,'snapshot-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(snapshot.basedOnWorkspaceRevision, revision - 1);
    assert.equal(snapshot.scopeEntityVersion, 1);
    assert.equal(snapshot.resolvedValues.length, 9);
    assert.deepEqual(snapshot.resourceSetRefs, [{
      id: "resource-set-a", version: "1.0.0"
    }, {
      id: "resource-set-record", version: "1.0.0"
    }]);
    await assert.rejects(database.query(`
      update private.authoring_effective_design_snapshots
      set resolution_version='2.0.0'
      where workspace_id=$1 and snapshot_id='snapshot-a'
    `, [WORKSPACE]), (error) => error.code === "55000");

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
    const invalidBlueprintInput = {
      ...blueprintInput,
      id: "blueprint-invalid",
      blueprint: { sequence: [] },
      binding: {
        ...pedagogicalBlueprintBinding(),
        id: "binding-invalid",
        blueprintRef: { id: "blueprint-invalid", version: "1.0.0" }
      }
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_pedagogical_blueprint_v1(
        $1,$2,'blueprint:save:invalid',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "save_pedagogical_blueprint", invalidBlueprintInput
      ),
      revision,
      JSON.stringify(invalidBlueprintInput)
    ]), (error) => error.code === "22023");
    const invalidBindingInput = {
      ...blueprintInput,
      id: "blueprint-invalid-binding",
      binding: {
        ...pedagogicalBlueprintBinding(),
        id: "binding-invalid-shape",
        blueprintRef: { id: "blueprint-invalid-binding", version: "1.0.0" },
        mappings: {
          ...pedagogicalBlueprintBinding().mappings,
          practiceSteps: [{
            stepId: "practice:a",
            unitRefs: ["unit:unknown"],
            evidenceRequirementRefs: ["evidence:a"]
          }]
        }
      }
    };
    await assert.rejects(scalar(database, `
      select public.save_authoring_pedagogical_blueprint_v1(
        $1,$2,'blueprint:save:invalid-binding',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "save_pedagogical_blueprint", invalidBindingInput
      ),
      revision,
      JSON.stringify(invalidBindingInput)
    ]), (error) => error.code === "22023");
    const blueprintReceipt = await scalar(database, `
      select public.save_authoring_pedagogical_blueprint_v1(
        $1,$2,'blueprint:save:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "save_pedagogical_blueprint", blueprintInput),
      revision,
      JSON.stringify(blueprintInput)
    ]);
    revision += 1;
    assert.match(blueprintReceipt.blueprintHash, /^[a-f0-9]{64}$/u);
    assert.equal(blueprintReceipt.bindingRef.id, "binding-a");
    const resumedDesign = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.deepEqual(resumedDesign.blueprintRef, {
      id: "blueprint-a", version: "1.0.0", contractVersion: 2
    });
    assert.deepEqual(resumedDesign.blueprintBindingRef, {
      id: "binding-a",
      version: "1.0.0",
      contract: "PedagogicalBlueprintBinding@1"
    });
    assert.deepEqual(resumedDesign.blueprintBinding, blueprintInput.binding);
    assert.deepEqual(
      resumedDesign.blueprintBinding.mappings.practiceSteps[0].evidenceRequirementRefs,
      ["evidence:a"]
    );
    const resumedArtifact = await scalar(database, `
      select public.get_authoring_pedagogical_blueprint_artifact_v1(
        $1,$2,'blueprint-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.deepEqual(resumedArtifact.blueprintRef, {
      id: "blueprint-a", version: "1.0.0"
    });
    assert.deepEqual(resumedArtifact.bindingRef, {
      id: "binding-a", version: "1.0.0"
    });
    assert.equal(resumedArtifact.blueprintHash, blueprintReceipt.blueprintHash);
    assert.equal(resumedArtifact.bindingHash, blueprintReceipt.bindingHash);
    assert.equal(resumedArtifact.scopeEntityVersion, 1);
    await assert.rejects(database.query(`
      update private.authoring_pedagogical_blueprint_bindings
      set payload='{}'::jsonb
      where workspace_id=$1 and binding_id='binding-a'
    `, [WORKSPACE]), (error) => error.code === "55000");
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values($1,'card','card:a','microsequence','micro-a',0,$2::jsonb)
    `, [WORKSPACE, JSON.stringify({ kind: "theory", text: "Conteúdo A." })]);
    const materializationBasis = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.match(materializationBasis.materializationContentHash, /^[a-f0-9]{64}$/u);

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
      contentHash: materializationBasis.materializationContentHash,
      blueprintHash: blueprintReceipt.blueprintHash,
      createdAt: "2026-08-15T20:00:00.000Z",
      resourceSetRefs: [
        { id: "resource-set-a", version: "1.0.0" },
        { id: "resource-set-record", version: "1.0.0" }
      ],
      plannedSteps: [
        { stepRef: "theory:a", kind: "theory", unitRefs: ["unit:a"] },
        { stepRef: "practice:a", kind: "practice", unitRefs: ["unit:a"] }
      ],
      materializedSteps: [{
        stepRef: "theory:a",
        kind: "theory",
        unitRefs: ["unit:a"],
        artifactRefs: ["card:a"]
      }],
      explanationCoverage: [],
      evidenceCoverage: [],
      practiceOpportunities: [],
      resourceSelections: [{
        id: "selection:a",
        stepRef: "theory:a",
        package: {
          packageId: "aralearn.resource.concept_map",
          version: "1.0.0"
        },
        authorizedByResourceSetRef: {
          id: "resource-set-record",
          version: "1.0.0"
        },
        role: "exposition",
        fit: "substitute",
        rationale: "A estrutura é uma rede de relações.",
        limitations: ["Representação substituta registrada explicitamente."]
      }],
      materializedResources: [{
        id: "resource:a",
        selectionRef: "selection:a",
        artifactRef: "card:a:resource:a",
        package: {
          packageId: "aralearn.resource.concept_map",
          version: "1.0.0"
        },
        role: "exposition"
      }],
      derivedMetrics: [],
      assumptions: [],
      limitations: []
    };
    const forgedContentManifest = {
      ...manifest,
      id: "manifest-forged-content",
      contentHash: hash("f")
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:forged-content:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", forgedContentManifest
      ),
      revision,
      JSON.stringify(forgedContentManifest)
    ]), (error) => error.code === "23514");
    const ghostArtifactManifest = {
      ...manifest,
      id: "manifest-ghost-artifact",
      materializedSteps: [{
        ...manifest.materializedSteps[0],
        artifactRefs: ["card:ghost"]
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:ghost-artifact:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", ghostArtifactManifest
      ),
      revision,
      JSON.stringify(ghostArtifactManifest)
    ]), (error) => error.code === "23514");
    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      ) values($1,'card','card:extra','microsequence','micro-a',1,$2::jsonb)
    `, [WORKSPACE, JSON.stringify({ kind: "theory", text: "Card extra." })]);
    const extraCardState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    const omittedExtraManifest = {
      ...manifest,
      id: "manifest-omitted-extra",
      contentHash: extraCardState.materializationContentHash
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:omitted-extra:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", omittedExtraManifest
      ),
      revision,
      JSON.stringify(omittedExtraManifest)
    ]), (error) => error.code === "23514");
    await database.query(`
      delete from private.authoring_workspace_entities
      where workspace_id=$1 and entity_type='card' and entity_id='card:extra'
    `, [WORKSPACE]);
    const restoredCardSetState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(restoredCardSetState.materializationContentHash, manifest.contentHash);
    const incompletePlanManifest = {
      ...manifest,
      id: "manifest-incomplete-plan",
      plannedSteps: [manifest.plannedSteps[0]]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:incomplete-plan:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", incompletePlanManifest
      ),
      revision,
      JSON.stringify(incompletePlanManifest)
    ]), (error) => error.code === "23514");
    const responseBypassManifest = {
      ...manifest,
      id: "manifest-response-role-bypass",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        id: "selection:response-bypass",
        package: {
          packageId: "aralearn.response.choice",
          version: "1.0.0"
        },
        authorizedByResourceSetRef: { id: "resource-set-a", version: "1.0.0" },
        role: "exposition"
      }],
      materializedResources: [{
        ...manifest.materializedResources[0],
        id: "resource:response-bypass",
        selectionRef: "selection:response-bypass",
        package: {
          packageId: "aralearn.response.choice",
          version: "1.0.0"
        },
        role: "exposition"
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:response-role-bypass:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", responseBypassManifest
      ),
      revision,
      JSON.stringify(responseBypassManifest)
    ]), (error) => error.code === "23514");
    const versatileWithoutLimitationManifest = {
      ...manifest,
      id: "manifest-versatile-without-limitation",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        fit: "versatile",
        limitations: []
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:versatile:no-limitation',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database,
        "register_materialization_manifest",
        versatileWithoutLimitationManifest
      ),
      revision,
      JSON.stringify(versatileWithoutLimitationManifest)
    ]), (error) => error.code === "23514");
    const canonicalWithLimitationManifest = {
      ...manifest,
      id: "manifest-canonical-with-limitation",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        fit: "canonical"
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:canonical:limitation',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", canonicalWithLimitationManifest
      ),
      revision,
      JSON.stringify(canonicalWithLimitationManifest)
    ]), (error) => error.code === "23514");
    const blockedVersatileManifest = {
      ...manifest,
      id: "manifest-blocked-versatile",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        authorizedByResourceSetRef: { id: "resource-set-a", version: "1.0.0" },
        fit: "versatile",
        limitations: ["Representação não canônica declarada."]
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:versatile:blocked',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", blockedVersatileManifest
      ),
      revision,
      JSON.stringify(blockedVersatileManifest)
    ]), (error) => error.code === "23514");
    const blockedSubstituteManifest = {
      ...manifest,
      id: "manifest-blocked-substitute",
      resourceSelections: [{
        ...manifest.resourceSelections[0],
        authorizedByResourceSetRef: { id: "resource-set-a", version: "1.0.0" },
        fit: "substitute",
        limitations: ["Não equivale à representação requerida."]
      }]
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:blocked:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", blockedSubstituteManifest
      ),
      revision,
      JSON.stringify(blockedSubstituteManifest)
    ]), (error) => error.code === "23514");
    const manifestReceipt = await scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:register:0001',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "register_materialization_manifest", manifest),
      revision,
      JSON.stringify(manifest)
    ]);
    revision += 1;
    assert.equal(manifestReceipt.manifestRef.id, "manifest-a");
    const currentState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(currentState.analysisState, "current");
    assert.equal(currentState.effectiveDesignState, "resolved");
    assert.equal(currentState.blueprintState, "current");
    assert.equal(currentState.materializationState, "tracked");
    assert.equal(currentState.resourceAvailabilityState, "resolved");
    await database.query(`
      update private.authoring_workspace_entities
      set content=$2::jsonb,version=version+1
      where workspace_id=$1 and entity_type='card' and entity_id='card:a'
    `, [WORKSPACE, JSON.stringify({ kind: "theory", text: "Conteúdo B." })]);
    const changedContentState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(changedContentState.materializationState, "stale");
    assert.equal(changedContentState.blueprintState, "current");
    assert.notEqual(
      changedContentState.materializationContentHash,
      manifest.contentHash
    );

    const wrongSnapshotManifest = {
      ...manifest,
      id: "manifest-wrong-snapshot",
      materializedWorkspaceRevision: revision,
      contentHash: changedContentState.materializationContentHash,
      effectiveSnapshotRef: { id: "snapshot-missing", version: "1.0.0" }
    };
    await assert.rejects(scalar(database, `
      select public.register_authoring_materialization_manifest_v1(
        $1,$2,'manifest:register:0002',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(
        database, "register_materialization_manifest", wrongSnapshotManifest
      ),
      revision,
      JSON.stringify(wrongSnapshotManifest)
    ]), (error) => error.code === "23503");

    await database.query(`
      update private.authoring_workspace_entities
      set version=2
      where workspace_id=$1 and entity_type='lesson' and entity_id='lesson-a'
    `, [WORKSPACE]);
    const staleResourceState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(staleResourceState.analysisState, "current");
    assert.equal(staleResourceState.effectiveDesignState, "stale");
    assert.equal(staleResourceState.resourceAvailabilityState, "stale");
    assert.equal(staleResourceState.resolution.conflicts.some(({ code }) => (
      code === "stale_resource_set"
    )), true);
    await database.query(`
      update private.authoring_workspace_entities
      set version=2
      where workspace_id=$1 and entity_type='microsequence' and entity_id='micro-a'
    `, [WORKSPACE]);
    const staleAnalysisRead = await scalar(database, `
      select public.get_authoring_instructional_analysis_v1(
        $1,$2,'microsequence','micro-a','analysis-a','1.0.0'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(staleAnalysisRead.status, "stale");
    const staleState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-a'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(staleState.analysisState, "stale");
    assert.equal(staleState.effectiveDesignState, "stale");
    assert.equal(staleState.blueprintState, "stale");
    assert.equal(staleState.materializationState, "stale");
    assert.equal(staleState.resourceAvailabilityState, "stale");
    const staleSnapshotInput = { ...snapshotInput, id: "snapshot-stale" };
    await assert.rejects(scalar(database, `
      select public.resolve_authoring_effective_design_v1(
        $1,$2,'snapshot:resolve:stale',$3,$4,$5::jsonb
      ) value
    `, [
      ACTOR,
      WORKSPACE,
      await mutationHash(database, "resolve_effective_design", staleSnapshotInput),
      revision,
      JSON.stringify(staleSnapshotInput)
    ]), (error) => error.code === "40001");
    const retention = await scalar(database, `
      select private.prune_authoring_design_state_v1(
        $1,now()+interval '1 day',256
      ) value
    `, [WORKSPACE]);
    assert.equal(retention.manifests, 0);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_effective_design_snapshots
      where workspace_id=$1 and snapshot_id='snapshot-a'
    `, [WORKSPACE]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_materialization_manifests
      where workspace_id=$1 and manifest_id='manifest-a'
    `, [WORKSPACE]), 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_pedagogical_blueprint_bindings
      where workspace_id=$1 and binding_id='binding-a'
    `, [WORKSPACE]), 1);
  } finally {
    await database.close();
  }
});

test("GC é limitado, preserva referências e o resolver atende curso grande", async () => {
  const database = await setupDatabase();
  try {
    await database.query(`
      insert into private.authoring_design_parameter_assignments(
        workspace_id,assignment_id,assignment_version,model_version,action,
        parameter_id,parameter_version,scope_kind,scope_ref,scope_path,
        mode,value,authority_kind,authority_ref,locked,rationale,
        provenance_refs,based_on_workspace_revision,created_revision,created_by,
        created_at
      ) values
      ($1,'gc-assignment','1.0.0','1.0.0','set',
       'representation_fallback_policy','1.0.0','microsequence','micro-a',
       array['course-a','module-a','lesson-a','micro-a'],
       'auto','{"kind":"enum","value":"block"}','gpt',null,false,
       'Versão antiga.','{}',1,2,$2,now()-interval '400 days'),
      ($1,'gc-assignment','2.0.0','1.0.0','remove',
       'representation_fallback_policy','1.0.0','microsequence','micro-a',
       array['course-a','module-a','lesson-a','micro-a'],
       null,null,'gpt',null,false,'Tombstone.','{}',2,3,$2,
       now()-interval '399 days')
    `, [WORKSPACE, ACTOR]);
    await database.query(`
      insert into private.authoring_resource_sets(
        workspace_id,resource_set_id,resource_set_version,model_version,
        scope_kind,scope_ref,scope_path,resolved_catalog_version,facet_basis,
        allowed_fits,allow_embedded_practice,allow_response_packages,
        no_adequate_representation,provenance_refs,payload_hash,
        based_on_workspace_revision,created_revision,created_by,created_at
      ) values
      ($1::uuid,'gc-resource-set','1.0.0','1.0.0','workspace',($1::uuid)::text,'{}',
       '1.0.0','{"catalogVersion":"1.0.0","families":[],"disciplines":[],
       "structures":[],"cognitiveOperations":[],"practiceModalities":[]}',
       array['canonical'],false,false,'block','{}',$2,1,2,$3,
       now()-interval '400 days'),
      ($1::uuid,'gc-resource-set','2.0.0','1.0.0','workspace',($1::uuid)::text,'{}',
       '1.0.0','{"catalogVersion":"1.0.0","families":[],"disciplines":[],
       "structures":[],"cognitiveOperations":[],"practiceModalities":[]}',
       array['canonical'],false,false,'block','{}',$2,2,3,$3,
       now()-interval '399 days')
    `, [WORKSPACE, hash("a"), ACTOR]);
    const pruned = await scalar(database, `
      select private.prune_authoring_design_state_v1(
        $1,now()-interval '30 days',64
      ) value
    `, [WORKSPACE]);
    assert.equal(pruned.assignments, 1);
    assert.equal(pruned.resourceSets, 1);
    assert.equal(await scalar(database, `
      select count(*)::integer value
      from private.authoring_design_parameter_assignments
      where workspace_id=$1 and assignment_id='gc-assignment'
    `, [WORKSPACE]), 1);

    await database.query(`
      insert into private.authoring_workspace_entities(
        workspace_id,entity_type,entity_id,parent_type,parent_id,position,content
      )
      select $1,'microsequence','micro-large-'||value,'lesson','lesson-a',
        value,'{}'::jsonb
      from generate_series(1,500) value
    `, [WORKSPACE]);
    const largeState = await scalar(database, `
      select public.get_authoring_design_state_v1(
        $1,$2,'microsequence','micro-large-500'
      ) value
    `, [ACTOR, WORKSPACE]);
    assert.equal(largeState.analysisState, "unresolved");
    assert.equal(largeState.resourceAvailabilityState, "unresolved");
  } finally {
    await database.close();
  }
});
