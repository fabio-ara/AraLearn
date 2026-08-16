import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  deriveAutoResourceSet,
  executeWorkspaceDesignAction,
  readInstructionalDesignContract,
  validateWorkspaceCardDesignAccess
} from "../../supabase/functions/_shared/aralearn-authoring/authoringDesignService.js";
import {
  executeAuthoringRoute
} from "../../supabase/functions/_shared/aralearn-authoring/authoringRouter.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  canonicalJsonStringify
} from "../../supabase/functions/_shared/aralearn-authoring/canonicalJson.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";
import {
  AuthoringWorkspaceEngine
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js";
import {
  validateWorkspaceDesignActionPayload,
  workspaceRoute
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";
import {
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  DESIGN_PARAMETER_CATALOG
} from "../../src/authoring/instructionalDesignContracts.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../../src/resources/catalog/resourceCatalog.js";

const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const PRINCIPAL = Object.freeze({
  actorId: "10000000-0000-4000-8000-000000000001",
  scopes: ["authoring:private:read", "authoring:private:write"]
});
const PATH = Object.freeze([
  "course-network", "module-transport", "lesson-transport", "ms-computing-transport"
]);
const fixture = JSON.parse(await readFile(new URL(
  "../fixtures/pedagogy/instructional-design-scenarios.v1.json",
  import.meta.url
), "utf8"));

function analysis(revision = 1) {
  const value = structuredClone(fixture.scenarios.find(
    ({ id }) => id === fixture.canonicalLifecycle.analysisScenarioRef
  ).analysis);
  value.scope = { kind: "microsequence", ref: PATH[3] };
  value.derivedFrom.workspaceRevision = revision;
  value.derivedFrom.scopeEntityVersion = 1;
  return value;
}

function assignment(revision = 2) {
  const value = structuredClone(fixture.canonicalLifecycle.parameterAssignments.find(
    ({ definitionRef }) => definitionRef.id === "representation_fallback_policy"
  ));
  value.id = "fallback-auto";
  value.version = `1.0.${revision}`;
  value.scope = { kind: "microsequence", ref: PATH[3] };
  return value;
}

function blueprint() {
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
      packageCandidateIds: ["paragraph"]
    }],
    practiceSteps: [],
    feedbackPlan: "Explicitar a relação usada na decisão.",
    termLedger: [{
      term: "causalidade",
      introducedInLayerId: "layer:a",
      plainMeaning: "Relação em que uma mudança produz outra."
    }],
    packageCandidates: [{
      id: "paragraph",
      packageId: "aralearn.resource.paragraph",
      version: "1.0.0",
      reason: "Explicação progressiva em prosa."
    }]
  };
}

function mappings() {
  return {
    conceptualLayers: [{ layerId: "layer:a", unitRefs: ["process"] }],
    contentDemands: [{
      contentDemandId: "demand:a",
      unitRefs: ["process"],
      evidenceRequirementRefs: []
    }],
    designResponses: [],
    theorySteps: [{
      stepId: "theory:a",
      unitRefs: ["process"],
      explanationRequirementRefs: []
    }],
    practiceSteps: []
  };
}

function stateBase() {
  return {
    workspaceId: WORKSPACE,
    workspaceRevision: 1,
    analysisState: "unresolved",
    analysis: null,
    parameterState: "conflict",
    resolution: { status: "conflict", conflicts: [] },
    effectiveDesignState: "unresolved",
    effectiveSnapshot: null,
    blueprintState: "unresolved",
    blueprintRef: null,
    blueprint: null,
    blueprintBindingRef: null,
    blueprintBinding: null,
    materializationContentHash: null,
    materializationState: "unresolved",
    materializationManifest: null,
    resourceAvailabilityState: "unresolved"
  };
}

function journeyAdapter() {
  const state = stateBase();
  let assignments = [];
  const ledger = new Map();
  const receipt = (requestId, operation, payloadHash, value) => {
    ledger.set(requestId, { operation, payloadHash, value: structuredClone(value) });
    return value;
  };
  return {
    state,
    async getWorkspace({ view }) {
      if (view === "resume") return {
        workspaceId: WORKSPACE,
        title: "Transporte",
        brief: "[source:network-source]",
        revision: state.workspaceRevision,
        content: {
          parts: [],
          decisions: [],
          findings: { items: [], truncated: false }
        }
      };
      return {
        revision: state.workspaceRevision,
        content: {
          id: PATH[3],
          title: "Transporte",
          goal: "Compreender entrega ao processo.",
          role: "explain",
          dependsOn: [],
          covers: [],
          checks: [],
          errors: [],
          cardCount: 0
        }
      };
    },
    async getAuthoringDesignState() {
      return structuredClone(state);
    },
    async listAuthoringDesignParameterDefinitions() {
      return { catalogVersion: "1.0.0", items: structuredClone(DESIGN_PARAMETER_CATALOG) };
    },
    async listAuthoringDesignParameterAssignments() {
      return { items: structuredClone(assignments) };
    },
    async getAuthoringResourceSet() {
      throw new Error("O snapshot desta jornada não usa ResourceSet.");
    },
    async getAuthoringPedagogicalBlueprintArtifact() {
      return {
        blueprintRef: structuredClone(state.blueprintRef),
        bindingRef: structuredClone(state.blueprintBindingRef),
        scopeEntityVersion: 1,
        createdRevision: state.workspaceRevision,
        blueprintHash: "e".repeat(64),
        bindingHash: "f".repeat(64)
      };
    },
    async replayAuthoringDesignMutation({ requestId, payloadHash, operation }) {
      const entry = ledger.get(requestId);
      if (!entry) return null;
      if (entry.payloadHash !== payloadHash || entry.operation !== operation) {
        throw new AuthoringApiError(409, "idempotency_key_reused", "Payload divergente.");
      }
      return { ...structuredClone(entry.value), idempotent: true };
    },
    async saveAuthoringInstructionalAnalysis(options) {
      state.analysis = structuredClone(options.payload);
      state.analysisState = "current";
      state.workspaceRevision += 1;
      return receipt(options.requestId, "save_instructional_analysis", options.payloadHash, {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        analysisRef: { id: options.payload.id, version: options.payload.version },
        scope: structuredClone(options.payload.scope),
        payloadHash: "a".repeat(64)
      });
    },
    async setAuthoringDesignParameter(options) {
      assignments = DESIGN_PARAMETER_CATALOG.map((definition, index) => ({
        id: `auto-${index}`,
        version: "1.0.0",
        definitionRef: { id: definition.id, version: definition.version },
        scope: { kind: "microsequence", ref: PATH[3] },
        mode: "auto"
      }));
      state.parameterState = "resolved";
      state.resolution = { status: "resolved", conflicts: [] };
      state.workspaceRevision += 1;
      return receipt(options.requestId, "set_design_parameter", options.payloadHash, {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        assignmentRef: { id: options.payload.id, version: options.payload.version },
        assignmentOperation: "set",
        definitionRef: structuredClone(options.payload.definitionRef),
        scope: structuredClone(options.payload.scope)
      });
    },
    async resolveAuthoringEffectiveDesign(options) {
      state.effectiveSnapshot = {
        ...structuredClone(options.payload),
        parameterCatalogVersion: "1.0.0",
        basedOnWorkspaceRevision: options.expectedRevision,
        scopeEntityVersion: 1,
        resolutionVersion: "1.0.0",
        resolutionPath: [],
        resolvedValues: [],
        resourceSetRefs: [],
        frozenAt: "2026-08-15T12:00:00Z"
      };
      state.effectiveDesignState = "resolved";
      state.workspaceRevision += 1;
      return receipt(options.requestId, "resolve_effective_design", options.payloadHash, {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        snapshotRef: { id: options.payload.id, version: options.payload.version },
        payloadHash: "b".repeat(64)
      });
    }
  };
}

function action(adapter, operation, overrides = {}) {
  return executeWorkspaceDesignAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    operation,
    microsequencePath: PATH,
    ...overrides
  });
}

test("sessão nova retoma slice, persiste Auto, resolve e repete receipt perdido", async () => {
  const adapter = journeyAdapter();
  const first = await action(adapter, "read_slice");
  assert.equal(first.result.view, "overview");
  assert.equal(first.result.nextAction, "save_analysis");
  assert.equal(Object.hasOwn(first.result, "analysis"), false);

  const saved = await action(adapter, "save_analysis", {
    requestId: "analysis-request-0001",
    expectedRevision: 1,
    payload: analysis(1)
  });
  assert.equal(saved.revision, 2);
  assert.equal(saved.replayed, false);

  const set = await action(adapter, "set_parameter", {
    requestId: "parameter-request-0001",
    expectedRevision: 2,
    payload: assignment(2)
  });
  assert.equal(set.revision, 3);

  const resolved = await action(adapter, "resolve_effective", {
    requestId: "snapshot-request-0001",
    expectedRevision: 3,
    payload: {}
  });
  assert.equal(resolved.revision, 4);
  assert.equal(resolved.result.status, "resolved");

  const resumed = await action(adapter, "read_slice", { view: "parameters" });
  assert.equal(resumed.revision, 4);
  assert.equal(resumed.result.nextAction, "save_blueprint");
  assert.equal(resumed.result.parameterDefinitions.index.length, 9);
  assert.ok(JSON.stringify(resumed).length < 96 * 1024);

  const replayed = await action(adapter, "save_analysis", {
    requestId: "analysis-request-0001",
    expectedRevision: 1,
    payload: analysis(1)
  });
  assert.equal(replayed.revision, 2);
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.result, saved.result);
});

test("slice cerca assignments entre duas leituras de revisão e repete após corrida", async () => {
  const adapter = journeyAdapter();
  const events = [];
  const originalState = adapter.getAuthoringDesignState.bind(adapter);
  const originalWorkspace = adapter.getWorkspace.bind(adapter);
  const originalAssignments = adapter.listAuthoringDesignParameterAssignments.bind(adapter);
  let assignmentReads = 0;
  let stateReads = 0;
  adapter.getAuthoringDesignState = async (...args) => {
    events.push("state");
    stateReads += 1;
    return originalState(...args);
  };
  adapter.getWorkspace = async (...args) => {
    events.push(`workspace:${args[0]?.view}`);
    return originalWorkspace(...args);
  };
  adapter.listAuthoringDesignParameterAssignments = async (...args) => {
    events.push("assignments");
    assignmentReads += 1;
    const stale = await originalAssignments(...args);
    if (assignmentReads === 1) adapter.state.workspaceRevision += 1;
    return stale;
  };

  const slice = await action(adapter, "read_slice");
  assert.equal(events[0], "state");
  assert.equal(stateReads, 4);
  assert.equal(assignmentReads, 2);
  assert.equal(slice.revision, 2);
});

test("requestId de desenho inclui o caminho e não reproduz receipt de outra micro", async () => {
  const adapter = journeyAdapter();
  await action(adapter, "save_analysis", {
    requestId: "path-analysis-request-0001",
    expectedRevision: 1,
    payload: analysis(1)
  });
  await action(adapter, "set_parameter", {
    requestId: "path-parameter-request-0001",
    expectedRevision: 2,
    payload: assignment(2)
  });
  await action(adapter, "resolve_effective", {
    requestId: "path-resolution-request-0001",
    expectedRevision: 3,
    payload: {}
  });

  await assert.rejects(executeWorkspaceDesignAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    operation: "resolve_effective",
    requestId: "path-resolution-request-0001",
    expectedRevision: 3,
    microsequencePath: [...PATH.slice(0, 3), "another-microsequence"],
    payload: {}
  }), (error) => error instanceof AuthoringApiError
    && error.code === "idempotency_key_reused");
});

test("mutações rejeitam caminho que mistura ancestrais antes de persistir", async () => {
  const adapter = journeyAdapter();
  const originalWorkspace = adapter.getWorkspace.bind(adapter);
  let pathChecks = 0;
  adapter.getWorkspace = async (options) => {
    if (options.view === "entity") {
      pathChecks += 1;
      if (options.entityPath?.[0] === "course-from-another-branch") {
        throw new AuthoringApiError(
          404,
          "workspace_entity_not_found",
          "A cadeia canônica não contém esse caminho."
        );
      }
    }
    return originalWorkspace(options);
  };
  const mixedPath = ["course-from-another-branch", ...PATH.slice(1)];
  const scopedAssignment = assignment(1);
  scopedAssignment.scope = { kind: "course", ref: mixedPath[0] };

  await assert.rejects(executeWorkspaceDesignAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    operation: "set_parameter",
    requestId: "mixed-path-parameter-request-0001",
    expectedRevision: 1,
    microsequencePath: mixedPath,
    payload: scopedAssignment
  }), (error) => error instanceof AuthoringApiError
    && error.code === "workspace_entity_not_found");
  assert.equal(pathChecks, 1);
});

test("defaults sem assignment explícito continuam pedindo Auto somente nos parâmetros relevantes", async () => {
  const adapter = journeyAdapter();
  adapter.state.analysis = {
    id: "analysis-minimal",
    version: "1.0.0",
    units: [],
    coordinationRequirements: [],
    explanationRequirements: [],
    evidenceRequirements: [],
    practiceVariationRequirements: []
  };
  adapter.state.analysisState = "current";
  adapter.state.parameterState = "resolved";
  adapter.state.resolution = { status: "resolved", conflicts: [] };
  const result = await action(adapter, "read_slice", { view: "parameters" });
  assert.equal(result.result.nextAction, "set_parameter");
  assert.ok(result.result.parameterDefinitions.index.length < DESIGN_PARAMETER_CATALOG.length);
  assert.equal(result.result.parameterDefinitions.relevant.length,
    result.result.parameterDefinitions.index.length);
});

test("ResourceSet efetivo é lido em páginas estáveis sem carregar contracts", async () => {
  const adapter = journeyAdapter();
  const resourceSet = {
    contract: "ResourceSet@1",
    modelVersion: "1.0.0",
    id: "condition-a",
    version: "1.0.0",
    scope: { kind: "microsequence", ref: PATH[3] },
    packages: [
      { packageId: "aralearn.response.choice", version: "1.0.0" },
      { packageId: "aralearn.resource.relation_map", version: "1.0.0" },
      { packageId: "aralearn.resource.paragraph", version: "1.0.0" }
    ],
    resolvedCatalogVersion: "1.0.0",
    facetBasis: {
      catalogVersion: "1.0.0",
      families: ["exposition", "response"],
      disciplines: ["computing"],
      structures: ["prose", "relation"],
      cognitiveOperations: ["explain"],
      practiceModalities: ["selected_response"]
    },
    selectionConstraints: {
      allowedFits: ["canonical", "versatile"],
      allowEmbeddedPractice: false,
      allowResponsePackages: true,
      onNoAdequateRepresentation: "record_limitation"
    },
    provenanceRefs: ["research-condition:a"]
  };
  const effectiveRef = { id: resourceSet.id, version: resourceSet.version };
  adapter.state.effectiveSnapshot = {
    id: "snapshot-a",
    version: "1.0.0",
    resourceSetRefs: [effectiveRef]
  };
  adapter.state.effectiveDesignState = "resolved";
  let resourceSetReads = 0;
  adapter.getAuthoringResourceSet = async ({ resourceSetRef }) => {
    resourceSetReads += 1;
    assert.deepEqual(resourceSetRef, effectiveRef);
    return structuredClone(resourceSet);
  };

  const first = await action(adapter, "read_slice", {
    view: "resource_set",
    resourceSetRef: effectiveRef,
    limit: 2
  });
  assert.equal(first.result.resourceSet.total, 3);
  assert.deepEqual(first.result.resourceSet.packages, [
    { packageId: "aralearn.resource.paragraph", version: "1.0.0" },
    { packageId: "aralearn.resource.relation_map", version: "1.0.0" }
  ]);
  assert.equal(
    first.result.resourceSet.nextCursor,
    "aralearn.resource.relation_map@1.0.0"
  );
  assert.deepEqual(first.result.resourceSet.metadata.ref, effectiveRef);
  assert.equal(Object.hasOwn(first.result.resourceSet, "contracts"), false);
  assert.ok(JSON.stringify(first).length < 96 * 1024);
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    { ok: true, requestId: null, data: first }
  ));

  const second = await action(adapter, "read_slice", {
    view: "resource_set",
    resourceSetRef: effectiveRef,
    cursor: first.result.resourceSet.nextCursor,
    limit: 2
  });
  assert.deepEqual(second.result.resourceSet.packages, [
    { packageId: "aralearn.response.choice", version: "1.0.0" }
  ]);
  assert.equal(second.result.resourceSet.nextCursor, null);

  const readsBeforeRejectedRef = resourceSetReads;
  await assert.rejects(action(adapter, "read_slice", {
    view: "resource_set",
    resourceSetRef: { id: "condition-a", version: "2.0.0" }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "resource_set_not_effective");
  assert.equal(resourceSetReads, readsBeforeRejectedRef);

  await assert.rejects(action(adapter, "read_slice", {
    view: "resource_set",
    resourceSetRef: effectiveRef,
    cursor: "aralearn.resource.missing@1.0.0"
  }), (error) => error instanceof AuthoringApiError
    && error.code === "invalid_resource_set_cursor");

  const largeResourceSet = {
    ...resourceSet,
    id: "condition-large",
    packages: Array.from({ length: 4_096 }, (_, index) => ({
      packageId: `aralearn.resource.test_${String(index).padStart(4, "0")}`,
      version: "1.0.0"
    }))
  };
  const largeRef = { id: largeResourceSet.id, version: largeResourceSet.version };
  adapter.state.effectiveSnapshot.resourceSetRefs = [largeRef];
  adapter.getAuthoringResourceSet = async () => structuredClone(largeResourceSet);
  const bounded = await action(adapter, "read_slice", {
    view: "resource_set",
    resourceSetRef: largeRef,
    limit: 100
  });
  assert.equal(bounded.result.resourceSet.packages.length, 100);
  assert.equal(bounded.result.resourceSet.total, 4_096);
  assert.equal(bounded.result.resourceSet.nextCursor, "aralearn.resource.test_0099@1.0.0");
  assert.ok(JSON.stringify(bounded).length < 96 * 1024);
});

test("views não somam artefatos grandes e materialização sem manifesto permanece acessível", async () => {
  const adapter = journeyAdapter();
  adapter.state.analysis = { id: "analysis-big", version: "1.0.0", body: "a".repeat(70_000) };
  adapter.state.analysisState = "current";
  adapter.state.blueprint = { body: "b".repeat(70_000) };
  adapter.state.blueprintRef = { id: "blueprint-big", version: "1.0.0" };
  adapter.state.blueprintState = "current";
  adapter.state.blueprintBinding = { body: "c".repeat(70_000) };
  adapter.state.blueprintBindingRef = { id: "binding-big", version: "1.0.0" };
  adapter.state.materializationContentHash = "d".repeat(64);
  adapter.state.materializationState = "legacy_untracked";
  adapter.state.resourceAvailabilityState = "legacy_unrestricted";

  for (const view of ["overview", "analysis", "blueprint", "binding", "materialization"]) {
    const response = await action(adapter, "read_slice", { view });
    assert.ok(new TextEncoder().encode(JSON.stringify(response)).byteLength < 96 * 1024, view);
  }
  const overview = await action(adapter, "read_slice");
  assert.ok(overview.result.availableViews.includes("materialization"));
  const materialization = await action(adapter, "read_slice", { view: "materialization" });
  assert.equal(materialization.result.materialization.contentHash, "d".repeat(64));
  assert.equal(materialization.result.materialization.manifest, null);
});

test("sessão nova retoma a rodada mais recente da Parte por escopo explícito", async () => {
  const adapter = journeyAdapter();
  const originalGetWorkspace = adapter.getWorkspace.bind(adapter);
  const calls = [];
  let includePart = true;
  let includeEntity = true;
  adapter.getWorkspace = async (options) => {
    if (options.view === "entity" && !includeEntity) {
      throw new Error("A microssequência histórica não existe mais.");
    }
    if (options.view !== "resume") return originalGetWorkspace(options);
    return {
      workspaceId: WORKSPACE,
      title: "Transporte",
      brief: "",
      revision: adapter.state.workspaceRevision,
      content: {
        parts: includePart ? [{
          id: "part-network",
          title: "Rede e transporte",
          status: "audited",
          microsequenceIds: [PATH[3]]
        }] : [],
        decisions: [],
        findings: { items: [], truncated: false }
      }
    };
  };
  adapter.getAuthoringAuditRun = async (options) => {
    calls.push(structuredClone(options));
    return {
      workspaceId: WORKSPACE,
      revision: adapter.state.workspaceRevision,
      audit: {
        microsequenceRefs: { items: [PATH[3]], count: 1, truncated: false },
        containsAnchor: true,
        latestAuditRun: {
          ref: {
            id: "30000000-0000-4000-8000-000000000001",
            version: "1.0.0"
          },
          kind: "audit",
          status: "complete",
          current: true,
          scope: { kind: "part", ref: "part-network" },
          startedRevision: 7,
          completedRevision: 8,
          createdAt: "2026-08-15T20:00:00.000Z",
          completedAt: "2026-08-15T20:01:00.000Z"
        },
        summary: {
          dimensions: {},
          checks: { passed: 1, failed: 0, notApplicable: 0 },
          findings: { deterministic: 0, semantic: 0, total: 0 },
          metrics: []
        },
        findings: [],
        components: { items: [], count: 0, nextCursor: null, truncated: false },
        total: 0,
        nextCursor: null,
        truncated: false
      }
    };
  };

  const resumed = await action(adapter, "read_slice", {
    view: "audit",
    auditScope: { kind: "part", ref: "part-network" }
  });
  assert.equal(resumed.result.audit.latestAuditRun.status, "complete");
  assert.deepEqual(calls[0].scope, { kind: "part", ref: "part-network" });
  assert.equal(calls[0].auditRunRef, null);

  await assert.rejects(action(adapter, "read_slice", {
    view: "audit",
    auditScope: { kind: "part", ref: "part-outside-anchor" }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "audit_run_scope_mismatch");
  assert.equal(calls.length, 1);

  includePart = false;
  includeEntity = false;
  const historical = await action(adapter, "read_slice", {
    view: "audit",
    auditRunRef: {
      id: "30000000-0000-4000-8000-000000000001",
      version: "1.0.0"
    }
  });
  assert.equal(historical.result.audit.latestAuditRun.scope.ref, "part-network");
  assert.deepEqual(calls.at(-1).auditRunRef, {
    id: "30000000-0000-4000-8000-000000000001",
    version: "1.0.0"
  });
  assert.equal(calls.at(-1).limit, 2);
  assert.equal(historical.result.microsequence.targetAvailable, false);
});

test("leitura de auditoria cerca a página contra revisão híbrida", async () => {
  const adapter = journeyAdapter();
  const originalGetWorkspace = adapter.getWorkspace.bind(adapter);
  adapter.getWorkspace = async (options) => {
    if (options.view !== "resume") return originalGetWorkspace(options);
    return {
      workspaceId: WORKSPACE,
      title: "Transporte",
      brief: "",
      revision: adapter.state.workspaceRevision,
      content: { parts: [], decisions: [], findings: { items: [], truncated: false } }
    };
  };
  adapter.getAuthoringAuditRun = async () => {
    const readRevision = adapter.state.workspaceRevision;
    adapter.state.workspaceRevision += 1;
    return {
      workspaceId: WORKSPACE,
      revision: readRevision,
      audit: null
    };
  };

  await assert.rejects(action(adapter, "read_slice", {
    view: "audit"
  }), (error) => error instanceof AuthoringApiError
    && error.code === "stale_authoring_state");
});

function cardWith(packageId) {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) => id === packageId);
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, manifest.version);
  return {
    id: "card-a",
    position: 0,
    title: "Representação",
    role: "theory",
    content: [RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
      id: "content-a",
      package: packageId,
      version: manifest.version,
      data: contract.contract.example
    }, "content")],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

test("gate preserva legado explícito, bloqueia workspace novo e rejeita card fora do set", async () => {
  const shorthand = { id: "legacy", kind: "theory", text: "Formato histórico." };
  const legacy = await validateWorkspaceCardDesignAccess({
    adapter: {
      async getAuthoringDesignState() {
        return {
          workspaceRevision: 5,
          effectiveSnapshot: null,
          materializationState: "legacy_untracked",
          resourceAvailabilityState: "legacy_unrestricted"
        };
      }
    },
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    expectedRevision: 5,
    operation: "save_microsequence_cards",
    arguments: { microsequencePath: PATH, cards: [shorthand] }
  });
  assert.equal(legacy.mode, "legacy_unrestricted");

  await assert.rejects(validateWorkspaceCardDesignAccess({
    adapter: {
      async getAuthoringDesignState() {
        return {
          workspaceRevision: 5,
          effectiveSnapshot: null,
          materializationState: "unresolved",
          resourceAvailabilityState: "unresolved"
        };
      }
    },
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    expectedRevision: 5,
    operation: "save_microsequence_cards",
    arguments: { microsequencePath: PATH, cards: [shorthand] }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "materialization_design_required");

  const effectiveSnapshot = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
  effectiveSnapshot.scope = { kind: "microsequence", ref: PATH[3] };
  const resourceSet = structuredClone(fixture.canonicalLifecycle.resourceSets[0]);
  resourceSet.resolvedCatalogVersion = RESOURCE_CATALOG.catalogVersion;
  resourceSet.facetBasis.catalogVersion = RESOURCE_CATALOG.catalogVersion;
  const currentState = {
    workspaceRevision: 8,
    effectiveDesignState: "resolved",
    effectiveSnapshot,
    blueprintState: "current",
    blueprint: {
      packageCandidates: [{
        id: "paragraph",
        packageId: "aralearn.resource.paragraph",
        version: "1.0.0"
      }],
      theorySteps: [{
        id: "theory-a",
        cognitiveOperation: "operation.explain",
        packageCandidateIds: ["paragraph"]
      }],
      practiceSteps: []
    },
    blueprintBinding: { contract: "PedagogicalBlueprintBinding@1" }
  };
  const restrictedAdapter = {
    async getAuthoringDesignState() {
      return structuredClone(currentState);
    },
    async getAuthoringEffectiveDesignSnapshot() {
      return structuredClone(effectiveSnapshot);
    },
    async getAuthoringResourceSet() {
      return structuredClone(resourceSet);
    }
  };
  await assert.rejects(validateWorkspaceCardDesignAccess({
    adapter: restrictedAdapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    expectedRevision: 8,
    operation: "save_card",
    arguments: {
      cardPath: [...PATH, "card-a"],
      card: cardWith("aralearn.resource.chart")
    }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "materialization_not_authorized");
});

test("protocolo fecha branches, aceita view progressiva e aplica budget antes do serviço", () => {
  assert.deepEqual(validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    microsequencePath: PATH,
    view: "binding"
  }), {
    operation: "read_slice",
    microsequencePath: [...PATH],
    view: "binding"
  });
  assert.throws(() => validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    microsequencePath: PATH,
    payload: {}
  }), (error) => error instanceof AuthoringApiError
    && error.code === "unknown_workspace_field");
  assert.throws(() => validateWorkspaceDesignActionPayload({
    operation: "save_analysis",
    requestId: "analysis-request-0002",
    expectedRevision: 1,
    microsequencePath: PATH,
    contractName: "instructional_analysis",
    payload: analysis(1)
  }), (error) => error instanceof AuthoringApiError
    && error.code === "unknown_workspace_field");
  assert.throws(() => validateWorkspaceDesignActionPayload({
    operation: "register_manifest",
    requestId: "manifest-request-0001",
    expectedRevision: 1,
    microsequencePath: PATH,
    payload: { body: "x".repeat(1_050_000) }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "design_payload_too_large");
  assert.deepEqual(validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    microsequencePath: PATH,
    view: "resource_set",
    resourceSetRef: { id: "condition-a", version: "1.0.0" },
    cursor: "aralearn.resource.paragraph@1.0.0",
    limit: 25
  }), {
    operation: "read_slice",
    view: "resource_set",
    microsequencePath: [...PATH],
    resourceSetRef: { id: "condition-a", version: "1.0.0" },
    cursor: "aralearn.resource.paragraph@1.0.0",
    limit: 25
  });
  assert.throws(() => validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    microsequencePath: PATH,
    view: "overview",
    resourceSetRef: { id: "condition-a", version: "1.0.0" }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "unknown_workspace_field");
  assert.deepEqual(validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    microsequencePath: PATH,
    view: "audit",
    auditScope: { kind: "part", ref: "part-network" },
    limit: 50,
    componentLimit: 10
  }), {
    operation: "read_slice",
    microsequencePath: [...PATH],
    view: "audit",
    auditScope: { kind: "part", ref: "part-network" },
    limit: 50,
    componentLimit: 10
  });
  assert.throws(() => validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    microsequencePath: PATH,
    view: "audit",
    auditRunRef: {
      id: "30000000-0000-4000-8000-000000000001",
      version: "1.0.0"
    },
    auditScope: { kind: "part", ref: "part-network" }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "invalid_audit_slice_arguments");
});

test("contracts action_* descrevem o payloadJson, não repetem o envelope MCP", () => {
  const manifest = structuredClone(fixture.canonicalLifecycle.materializationManifest);
  const examples = {
    action_read_slice: { microsequencePath: [...PATH], view: "overview" },
    action_contracts: { contractName: "action_resolve_effective" },
    action_save_analysis: analysis(1),
    action_set_parameter: assignment(2),
    action_remove_parameter: {
      assignmentRef: { id: "fallback-auto", version: "1.0.2" },
      definitionRef: { id: "representation_fallback_policy", version: "1.0.0" },
      rationale: "Restaurar Auto herdado.",
      provenanceRefs: []
    },
    action_save_resource_set: {
      mode: "auto",
      facets: {
        families: ["family.prose"],
        disciplines: [],
        structures: ["structure.prose"],
        cognitiveOperations: ["operation.explain"],
        practiceModalities: []
      },
      provenanceRefs: ["analysis:current"]
    },
    action_resolve_effective: {},
    action_save_blueprint: { blueprint: blueprint(), mappings: mappings() },
    action_register_manifest: manifest
  };
  for (const [contractName, example] of Object.entries(examples)) {
    const contract = readInstructionalDesignContract({ workspaceId: WORKSPACE, contractName });
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(contract.result.schema);
    assert.equal(validate(example), true, `${contractName}: ${ajv.errorsText(validate.errors)}`);
    if (contractName.startsWith("action_save_")) {
      assert.equal(Object.hasOwn(contract.result.schema.properties || {}, "operation"), false);
    }
  }
  const readSliceContract = readInstructionalDesignContract({
    workspaceId: WORKSPACE,
    contractName: "action_read_slice"
  }).result.schema;
  const validateResourceSetRead = new Ajv2020({ allErrors: true, strict: false })
    .compile(readSliceContract);
  assert.equal(validateResourceSetRead({
    microsequencePath: [...PATH],
    view: "resource_set",
    resourceSetRef: { id: "condition-a", version: "1.0.0" },
    limit: 50
  }), true);
  assert.equal(validateResourceSetRead({
    microsequencePath: [...PATH],
    view: "overview",
    resourceSetRef: { id: "condition-a", version: "1.0.0" }
  }), false);
  const semanticContract = readInstructionalDesignContract({
    workspaceId: WORKSPACE,
    contractName: "action_record_semantic_audit"
  }).result.schema;
  const validateSemanticBatch = new Ajv2020({ allErrors: true, strict: false })
    .compile(semanticContract);
  const semanticFinding = {
    code: "semantic_explanation_underdeveloped",
    category: "design",
    severity: "high",
    target: { entityType: "microsequence", entityPath: [...PATH] },
    ruleRef: { kind: "semantic_rubric", id: "explanation", version: "1.0.0" },
    publicEvidence: "A explicação apenas menciona a distinção.",
    proposedRepair: null
  };
  const semanticBatch = {
    auditRunRef: {
      id: "30000000-0000-4000-8000-000000000001",
      version: "1.0.0"
    },
    findings: Array.from({ length: 100 }, () => semanticFinding),
    verifications: []
  };
  assert.equal(validateSemanticBatch(semanticBatch), true);
  assert.equal(validateSemanticBatch({
    ...semanticBatch,
    findings: [...semanticBatch.findings, semanticFinding]
  }), false);
  assert.equal(validateSemanticBatch({
    ...semanticBatch,
    findings: [{ ...semanticFinding, category: "unscored_quality" }]
  }), false);
  assert.equal(validateResourceSetRead({
    microsequencePath: [...PATH],
    view: "audit",
    auditScope: { kind: "part", ref: "part-network" },
    limit: 50
  }), true);
  assert.equal(validateResourceSetRead({
    microsequencePath: [...PATH],
    view: "audit",
    auditRunRef: {
      id: "30000000-0000-4000-8000-000000000001",
      version: "1.0.0"
    },
    auditScope: { kind: "part", ref: "part-network" }
  }), false);
  const assignmentDefinitions = Object.keys(readInstructionalDesignContract({
    workspaceId: WORKSPACE,
    contractName: "action_set_parameter"
  }).result.schema.$defs || {});
  assert.ok(assignmentDefinitions.includes("DesignParameterAssignment"));
  assert.equal(assignmentDefinitions.includes("InstructionalAnalysis"), false);
  assert.equal(assignmentDefinitions.includes("MaterializationManifest"), false);
  const analysisDefinitions = Object.keys(readInstructionalDesignContract({
    workspaceId: WORKSPACE,
    contractName: "instructional_analysis"
  }).result.schema.$defs || {});
  assert.deepEqual(analysisDefinitions.sort(), ["InstructionalAnalysis", "Scope"]);
});

test("adapter consulta replay e mantém snapshot histórico sem convertê-lo em getter current", async () => {
  const calls = [];
  const target = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === "replay_authoring_workspace_request_v5") {
        return [{ workspaceId: WORKSPACE, revision: 2, idempotent: true }];
      }
      return [{ id: "snapshot-old", version: "1.0.0", scope: {
        kind: "microsequence", ref: PATH[3]
      } }];
    }
  };
  const replay = await SupabaseAuthoringAdapter.prototype.replayAuthoringDesignMutation.call(
    target,
    {
      principal: PRINCIPAL,
      requestId: "analysis-request-0001",
      payloadHash: "a".repeat(64),
      operation: "save_instructional_analysis"
    }
  );
  const historical = await SupabaseAuthoringAdapter.prototype
    .getAuthoringEffectiveDesignSnapshot.call(target, {
      principal: PRINCIPAL,
      workspaceId: WORKSPACE,
      snapshotRef: { id: "snapshot-old", version: "1.0.0" }
    });
  assert.equal(replay.idempotent, true);
  assert.equal(historical.id, "snapshot-old");
  assert.deepEqual(calls.map(({ name }) => name), [
    "replay_authoring_workspace_request_v5",
    "get_authoring_effective_design_snapshot_v1"
  ]);
});

test("bootstrap Auto congela package@version por família, não finge ausência e aceita mais de 128 membros", async () => {
  let persisted = null;
  const adapter = {
    async replayAuthoringDesignMutation() {
      return null;
    },
    async getWorkspace() {
      return {
        revision: 1,
        content: { id: PATH[3] }
      };
    },
    async saveAuthoringResourceSet(options) {
      persisted = structuredClone(options.payload);
      return {
        workspaceId: WORKSPACE,
        revision: 2,
        idempotent: false,
        resourceSetRef: { id: options.payload.id, version: options.payload.version },
        packageCount: options.payload.packages.length,
        payloadHash: "a".repeat(64)
      };
    }
  };
  const auto = await action(adapter, "save_resource_set", {
    requestId: "resource-set-request-0001",
    expectedRevision: 1,
    payload: {
      mode: "auto",
      facets: {
        families: ["family.text_language"],
        disciplines: [],
        structures: [],
        cognitiveOperations: [],
        practiceModalities: []
      },
      provenanceRefs: ["analysis:current"]
    }
  });
  assert.equal(auto.result.packageCount, persisted.packages.length);
  assert.ok(persisted.packages.length > 0);
  assert.equal(persisted.packages.every(({ packageId, version }) => (
    RESOURCE_PACKAGE_REGISTRY.get(packageId, version)
  )), true);
  assert.equal(persisted.resolvedCatalogVersion, RESOURCE_CATALOG.catalogVersion);
  assert.equal(persisted.facetBasis.catalogVersion, RESOURCE_CATALOG.catalogVersion);
  assert.deepEqual(persisted.facetBasis.families, ["family.text_language"]);

  await assert.rejects(action(adapter, "save_resource_set", {
    requestId: "resource-set-request-0002",
    expectedRevision: 1,
    payload: {
      mode: "auto",
      facets: {
        families: ["family.response"],
        disciplines: [],
        structures: ["structure.prose"],
        cognitiveOperations: [],
        practiceModalities: []
      },
      provenanceRefs: []
    }
  }), (error) => error instanceof AuthoringApiError
    && error.code === "resource_set_no_adequate_representation");

  const manifests = Array.from({ length: 129 }, (_, index) => ({
    id: `aralearn.resource.auto_${String(index).padStart(3, "0")}`,
    version: "1.0.0",
    academic: {
      taxonomy: {
        familyIds: ["family.auto"],
        disciplineIds: [],
        structureIds: [],
        operationIds: [],
        practiceModeIds: []
      }
    }
  }));
  const derived = await deriveAutoResourceSet({
    payload: {
      mode: "auto",
      facets: {
        families: ["family.auto"],
        disciplines: [],
        structures: [],
        cognitiveOperations: [],
        practiceModalities: []
      },
      provenanceRefs: []
    },
    microsequencePath: PATH,
    expectedRevision: 7,
    catalog: {
      catalogVersion: "catalog-test-129",
      explore() {
        return { families: [{ id: "family.auto" }] };
      },
      search() {
        return { candidates: [] };
      }
    },
    packageRegistry: {
      listCatalog() {
        return structuredClone(manifests);
      }
    }
  });
  assert.equal(derived.packages.length, 129);
  assert.deepEqual(derived.packages[128], {
    packageId: "aralearn.resource.auto_128",
    version: "1.0.0"
  });
});

test("replay de cards usa exatamente o hash de mutate e antecede qualquer gate", async () => {
  const operationArguments = {
    microsequencePath: [...PATH],
    mode: "replace",
    cards: [cardWith("aralearn.resource.paragraph")]
  };
  const expectedHash = createHash("sha256").update(canonicalJsonStringify({
    operation: "save_microsequence_cards",
    payload: {
      workspaceId: WORKSPACE,
      expectedRevision: 8,
      arguments: operationArguments
    }
  })).digest("hex");
  let rpcArguments = null;
  const receipt = {
    workspaceId: WORKSPACE,
    revision: 9,
    idempotent: true
  };
  const engine = new AuthoringWorkspaceEngine({
    rpc: async (name, parameters) => {
      assert.equal(name, "replay_authoring_workspace_request_v5");
      rpcArguments = parameters;
      return [receipt];
    },
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: `sb_secret_${"a".repeat(40)}`
  });
  assert.deepEqual(await engine.replayMutation({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    requestId: "cards-request-0001",
    expectedRevision: 8,
    operation: "save_microsequence_cards",
    arguments: operationArguments
  }), receipt);
  assert.equal(rpcArguments.p_payload_hash, expectedHash);

  const path = `/v1/workspaces/${WORKSPACE}/mutations`;
  const route = workspaceRoute("POST", path);
  let designRead = false;
  let mutationCalled = false;
  const result = await executeAuthoringRoute({
    request: new Request(`https://edge.example${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "cards-request-0001",
        expectedRevision: 8,
        operation: "save_microsequence_cards",
        arguments: operationArguments
      })
    }),
    route,
    principal: PRINCIPAL,
    adapter: {
      async replayWorkspaceMutation() {
        return structuredClone(receipt);
      },
      async getAuthoringDesignState() {
        designRead = true;
        throw new Error("gate não deveria rodar em replay");
      },
      async mutateWorkspace() {
        mutationCalled = true;
        throw new Error("mutação não deveria repetir");
      }
    }
  });
  assert.deepEqual(result.data, receipt);
  assert.equal(designRead, false);
  assert.equal(mutationCalled, false);
});

test("duas chamadas de cards idênticas convergem ao receipt após corrida", async () => {
  const operationArguments = {
    microsequencePath: [...PATH],
    mode: "replace",
    cards: [cardWith("aralearn.resource.paragraph")]
  };
  const receipt = {
    workspaceId: WORKSPACE,
    revision: 9,
    idempotent: false
  };
  let stored = null;
  let mutationCalls = 0;
  const adapter = {
    async replayWorkspaceMutation() {
      return stored ? { ...stored, idempotent: true } : null;
    },
    async getAuthoringDesignState() {
      return {
        workspaceRevision: 8,
        effectiveSnapshot: null,
        materializationState: "legacy_untracked",
        resourceAvailabilityState: "legacy_unrestricted"
      };
    },
    async mutateWorkspace() {
      mutationCalls += 1;
      if (mutationCalls === 1) {
        stored = structuredClone(receipt);
        await Promise.resolve();
        return structuredClone(receipt);
      }
      throw new AuthoringApiError(
        409,
        "stale_workspace_revision",
        "A primeira chamada já avançou a revisão."
      );
    }
  };
  const invoke = () => {
    const path = `/v1/workspaces/${WORKSPACE}/mutations`;
    return executeAuthoringRoute({
      request: new Request(`https://edge.example${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "cards-request-0002",
          expectedRevision: 8,
          operation: "save_microsequence_cards",
          arguments: operationArguments
        })
      }),
      route: workspaceRoute("POST", path),
      principal: PRINCIPAL,
      adapter
    });
  };
  const [firstResult, secondResult] = await Promise.all([invoke(), invoke()]);
  assert.equal(firstResult.data.revision, 9);
  assert.equal(secondResult.data.revision, 9);
  assert.equal(secondResult.data.idempotent, true);
});

test("save_blueprint compacto deriva envelope/binding e nova sessão lê hashes persistidos", async () => {
  const adapter = journeyAdapter();
  const currentAnalysis = analysis(7);
  const effectiveSnapshot = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
  effectiveSnapshot.scopeEntityVersion = currentAnalysis.derivedFrom.scopeEntityVersion;
  const resourceSet = structuredClone(fixture.canonicalLifecycle.resourceSets[0]);
  resourceSet.resolvedCatalogVersion = RESOURCE_CATALOG.catalogVersion;
  resourceSet.facetBasis.catalogVersion = RESOURCE_CATALOG.catalogVersion;
  adapter.state.workspaceRevision = 7;
  adapter.state.analysisState = "current";
  adapter.state.analysis = currentAnalysis;
  adapter.state.parameterState = "resolved";
  adapter.state.effectiveDesignState = "resolved";
  adapter.state.effectiveSnapshot = effectiveSnapshot;
  adapter.state.resourceAvailabilityState = "resolved";
  adapter.getAuthoringResourceSet = async () => structuredClone(resourceSet);
  let persisted = null;
  adapter.saveAuthoringPedagogicalBlueprint = async (options) => {
    persisted = structuredClone(options.payload);
    adapter.state.workspaceRevision = 8;
    adapter.state.blueprintState = "current";
    adapter.state.blueprintRef = { id: persisted.id, version: persisted.version };
    adapter.state.blueprint = structuredClone(persisted.blueprint);
    adapter.state.blueprintBindingRef = {
      id: persisted.binding.id,
      version: persisted.binding.version
    };
    adapter.state.blueprintBinding = structuredClone(persisted.binding);
    return {
      workspaceId: WORKSPACE,
      revision: 8,
      idempotent: false,
      blueprintRef: { id: persisted.id, version: persisted.version },
      bindingRef: { id: persisted.binding.id, version: persisted.binding.version },
      analysisRef: { id: currentAnalysis.id, version: currentAnalysis.version },
      effectiveSnapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version },
      blueprintHash: "e".repeat(64),
      bindingHash: "f".repeat(64)
    };
  };
  const compactBlueprint = blueprint();
  compactBlueprint.theorySteps[0].cognitiveOperation = "explain";
  compactBlueprint.contentDemands[0].cognitiveOperations = ["explain"];
  const compactMappings = mappings();
  compactMappings.conceptualLayers[0].unitRefs = ["tcp"];
  compactMappings.contentDemands[0].unitRefs = ["tcp"];
  compactMappings.theorySteps[0].unitRefs = ["tcp"];

  const saved = await action(adapter, "save_blueprint", {
    requestId: "blueprint-request-0001",
    expectedRevision: 7,
    payload: { blueprint: compactBlueprint, mappings: compactMappings }
  });
  assert.equal(saved.revision, 8);
  assert.equal(persisted.scope.ref, PATH[3]);
  assert.deepEqual(persisted.analysisRef, { id: currentAnalysis.id, version: currentAnalysis.version });
  assert.deepEqual(persisted.effectiveSnapshotRef, {
    id: effectiveSnapshot.id,
    version: effectiveSnapshot.version
  });
  assert.equal(persisted.binding.contract, "PedagogicalBlueprintBinding@1");
  assert.deepEqual(persisted.binding.mappings, compactMappings);

  const resumed = await action(adapter, "read_slice");
  assert.equal(resumed.result.artifacts.blueprintHash, "e".repeat(64));
  assert.equal(resumed.result.artifacts.bindingHash, "f".repeat(64));
  assert.equal(resumed.result.artifacts.scopeEntityVersion, 1);
});

function bindingForManifest(manifest, currentAnalysis, effectiveSnapshot) {
  return {
    contract: "PedagogicalBlueprintBinding@1",
    id: "binding-computing-transport",
    version: "1.0.0",
    scope: structuredClone(currentAnalysis.scope),
    blueprintRef: structuredClone(manifest.blueprintRef),
    blueprintContractVersion: 2,
    analysisRef: { id: currentAnalysis.id, version: currentAnalysis.version },
    effectiveSnapshotRef: { id: effectiveSnapshot.id, version: effectiveSnapshot.version },
    mappings: {
      conceptualLayers: [],
      contentDemands: [],
      designResponses: [],
      theorySteps: manifest.plannedSteps.filter(({ kind }) => kind === "theory")
        .map((step, index) => ({
          stepId: step.stepRef,
          unitRefs: structuredClone(step.unitRefs),
          explanationRequirementRefs: index === 0
            ? ["exp-process-delivery"]
            : ["exp-transport-choice"]
        })),
      practiceSteps: manifest.plannedSteps.filter(({ kind }) => kind === "practice")
        .map((step) => ({
          stepId: step.stepRef,
          unitRefs: structuredClone(step.unitRefs),
          evidenceRequirementRefs: ["ev-transport-choice"]
        }))
    }
  };
}

test("register_manifest valida diff e autorizações ricas, mas devolve receipt compacto replayável", async () => {
  const currentAnalysis = analysis(7);
  currentAnalysis.derivedFrom.scopeEntityVersion = 3;
  const effectiveSnapshot = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
  const resourceSet = structuredClone(fixture.canonicalLifecycle.resourceSets[0]);
  resourceSet.resolvedCatalogVersion = RESOURCE_CATALOG.catalogVersion;
  resourceSet.facetBasis.catalogVersion = RESOURCE_CATALOG.catalogVersion;
  const manifest = structuredClone(fixture.canonicalLifecycle.materializationManifest);
  const state = {
    workspaceRevision: manifest.materializedWorkspaceRevision,
    analysisState: "current",
    analysis: currentAnalysis,
    parameterState: "resolved",
    effectiveDesignState: "resolved",
    effectiveSnapshot,
    blueprintState: "current",
    blueprintBinding: bindingForManifest(manifest, currentAnalysis, effectiveSnapshot)
  };
  let persisted = null;
  let ledger = null;
  const adapter = {
    async replayAuthoringDesignMutation({ requestId, payloadHash, operation }) {
      if (!ledger) return null;
      assert.equal(requestId, ledger.requestId);
      assert.equal(payloadHash, ledger.payloadHash);
      assert.equal(operation, "register_materialization_manifest");
      return { ...ledger.receipt, idempotent: true };
    },
    async getAuthoringDesignState() {
      return structuredClone(state);
    },
    async getWorkspace() {
      return {
        revision: manifest.materializedWorkspaceRevision,
        content: { id: PATH[3] }
      };
    },
    async getAuthoringResourceSet() {
      return structuredClone(resourceSet);
    },
    async registerAuthoringMaterializationManifest(options) {
      persisted = structuredClone(options.payload);
      const receipt = {
        workspaceId: WORKSPACE,
        revision: options.expectedRevision + 1,
        idempotent: false,
        manifestRef: { id: manifest.id, version: manifest.version },
        contentHash: manifest.contentHash,
        payloadHash: "9".repeat(64)
      };
      ledger = {
        requestId: options.requestId,
        payloadHash: options.payloadHash,
        receipt
      };
      return receipt;
    }
  };
  const first = await action(adapter, "register_manifest", {
    requestId: "manifest-request-0002",
    expectedRevision: manifest.materializedWorkspaceRevision,
    payload: manifest
  });
  assert.deepEqual(persisted, manifest);
  assert.equal(first.result.registration, "accepted");
  assert.equal(first.result.resourceAuthorization, "authorized");
  assert.ok(new TextEncoder().encode(JSON.stringify(first)).byteLength < 96 * 1024);
  const replay = await action(adapter, "register_manifest", {
    requestId: "manifest-request-0002",
    expectedRevision: manifest.materializedWorkspaceRevision,
    payload: manifest
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, first.result);

  const outside = structuredClone(manifest);
  outside.id = "manifest-outside";
  outside.resourceSelections[0].package = {
    packageId: "aralearn.resource.chart",
    version: "1.0.0"
  };
  outside.materializedResources.find(({ selectionRef }) => (
    selectionRef === outside.resourceSelections[0].id
  )).package = structuredClone(outside.resourceSelections[0].package);
  ledger = null;
  await assert.rejects(action(adapter, "register_manifest", {
    requestId: "manifest-request-0003",
    expectedRevision: manifest.materializedWorkspaceRevision,
    payload: outside
  }), (error) => error instanceof AuthoringApiError
    && error.code === "materialization_resource_not_authorized");
});

function digestJson(value) {
  return createHash("sha256")
    .update(canonicalJsonStringify(value))
    .digest("hex");
}

function integratedJourneyAdapter() {
  const state = stateBase();
  state.workspaceRevision = 6;
  state.parameterState = "conflict";
  state.resolution = {
    status: "conflict",
    conflicts: [{
      definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
      code: "assignment_required"
    }]
  };
  let assignments = DESIGN_PARAMETER_CATALOG
    .filter(({ id }) => id !== "available_resource_set_refs")
    .map((definition, index) => ({
      id: `existing-auto-${index}`,
      version: "1.0.0",
      definitionRef: { id: definition.id, version: definition.version },
      scope: { kind: "microsequence", ref: PATH[3] },
      mode: "auto"
    }));
  let resourceSet = null;
  let artifact = null;
  let cards = [];
  const designLedger = new Map();
  const workspaceLedger = new Map();
  const createdAt = "2026-08-15T12:00:00.000Z";

  function requireRevision(expectedRevision) {
    if (state.workspaceRevision !== expectedRevision) {
      throw new AuthoringApiError(
        409,
        "stale_authoring_state",
        "A revisão mudou.",
        { expectedRevision, currentRevision: state.workspaceRevision }
      );
    }
  }

  function rememberDesign(options, operation, receipt) {
    designLedger.set(options.requestId, {
      operation,
      payloadHash: options.payloadHash,
      receipt: structuredClone(receipt)
    });
    return receipt;
  }

  function workspaceReceipt({ operation, idempotent = false }) {
    return {
      workspaceId: WORKSPACE,
      title: "Transporte",
      revision: state.workspaceRevision,
      currentRevision: state.workspaceRevision,
      entityCount: 6 + cards.length,
      createdAt,
      updatedAt: createdAt,
      idempotent,
      change: { operation, created: cards.length, updated: 0, deleted: 0 }
    };
  }

  return {
    state,
    async resolvePrincipal() {
      return {
        ...PRINCIPAL,
        oauthClientId: "authoring-journey-client",
        authenticationKind: "oauth"
      };
    },
    async getWorkspace({ view }) {
      if (view === "resume") {
        return {
          workspaceId: WORKSPACE,
          title: "Transporte",
          brief: "[source:network-source]",
          revision: state.workspaceRevision,
          content: {
            parts: [{
              id: "part-transport",
              title: "Parte Transporte",
              status: "planned",
              microsequenceIds: [PATH[3]]
            }],
            decisions: [],
            findings: { items: [], truncated: false }
          }
        };
      }
      return {
        revision: state.workspaceRevision,
        content: {
          id: PATH[3],
          title: "Transporte",
          goal: "Compreender entrega ao processo.",
          role: "explain",
          dependsOn: [],
          covers: [],
          checks: [],
          errors: [],
          cardCount: cards.length
        }
      };
    },
    async getAuthoringDesignState() {
      return structuredClone(state);
    },
    async listAuthoringDesignParameterDefinitions() {
      return {
        catalogVersion: "1.0.0",
        items: structuredClone(DESIGN_PARAMETER_CATALOG)
      };
    },
    async listAuthoringDesignParameterAssignments() {
      return { items: structuredClone(assignments) };
    },
    async getAuthoringResourceSet({ resourceSetRef }) {
      if (!resourceSet
          || `${resourceSetRef.id}@${resourceSetRef.version}`
            !== `${resourceSet.id}@${resourceSet.version}`) {
        throw new AuthoringApiError(404, "resource_set_not_found", "ResourceSet ausente.");
      }
      return structuredClone(resourceSet);
    },
    async getAuthoringEffectiveDesignSnapshot({ snapshotRef }) {
      if (!state.effectiveSnapshot
          || `${snapshotRef.id}@${snapshotRef.version}`
            !== `${state.effectiveSnapshot.id}@${state.effectiveSnapshot.version}`) {
        throw new AuthoringApiError(404, "snapshot_not_found", "Snapshot ausente.");
      }
      return structuredClone(state.effectiveSnapshot);
    },
    async getAuthoringPedagogicalBlueprintArtifact() {
      if (!artifact) {
        throw new AuthoringApiError(404, "blueprint_not_found", "Blueprint ausente.");
      }
      return structuredClone(artifact);
    },
    async replayAuthoringDesignMutation({ requestId, payloadHash, operation }) {
      const entry = designLedger.get(requestId);
      if (!entry) return null;
      if (entry.payloadHash !== payloadHash || entry.operation !== operation) {
        throw new AuthoringApiError(409, "idempotency_key_reused", "Payload divergente.");
      }
      return { ...structuredClone(entry.receipt), idempotent: true };
    },
    async saveAuthoringInstructionalAnalysis(options) {
      requireRevision(options.expectedRevision);
      state.analysis = structuredClone(options.payload);
      state.analysisState = "current";
      state.workspaceRevision += 1;
      return rememberDesign(options, "save_instructional_analysis", {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        analysisRef: { id: options.payload.id, version: options.payload.version },
        scope: structuredClone(options.payload.scope),
        payloadHash: digestJson(options.payload)
      });
    },
    async saveAuthoringResourceSet(options) {
      requireRevision(options.expectedRevision);
      resourceSet = structuredClone(options.payload);
      state.workspaceRevision += 1;
      return rememberDesign(options, "save_resource_set", {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        resourceSetRef: { id: resourceSet.id, version: resourceSet.version },
        packageCount: resourceSet.packages.length,
        payloadHash: digestJson(resourceSet)
      });
    },
    async setAuthoringDesignParameter(options) {
      requireRevision(options.expectedRevision);
      assignments = assignments.filter(({ definitionRef }) => (
        definitionRef.id !== options.payload.definitionRef.id
      ));
      assignments.push(structuredClone(options.payload));
      state.parameterState = "resolved";
      state.resolution = { status: "resolved", conflicts: [] };
      state.workspaceRevision += 1;
      return rememberDesign(options, "set_design_parameter", {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        assignmentRef: { id: options.payload.id, version: options.payload.version },
        assignmentOperation: "set",
        definitionRef: structuredClone(options.payload.definitionRef),
        scope: structuredClone(options.payload.scope)
      });
    },
    async resolveAuthoringEffectiveDesign(options) {
      requireRevision(options.expectedRevision);
      const snapshot = structuredClone(fixture.canonicalLifecycle.effectiveSnapshot);
      Object.assign(snapshot, structuredClone(options.payload), {
        parameterCatalogVersion: "1.0.0",
        basedOnWorkspaceRevision: options.expectedRevision,
        scopeEntityVersion: 1,
        resolutionVersion: "1.0.0",
        resolutionPath: [
          { kind: "workspace", ref: WORKSPACE },
          { kind: "course", ref: PATH[0] },
          { kind: "module", ref: PATH[1] },
          { kind: "lesson", ref: PATH[2] },
          { kind: "microsequence", ref: PATH[3] }
        ],
        resourceSetRefs: [{ id: resourceSet.id, version: resourceSet.version }],
        frozenAt: createdAt
      });
      snapshot.resolvedValues = snapshot.resolvedValues.map((resolved) => ({
        ...resolved,
        resolution: {
          ...resolved.resolution,
          inheritance: "local",
          sourceScope: { kind: "microsequence", ref: PATH[3] }
        }
      }));
      snapshot.resolvedValues.push({
        definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
        value: { kind: "set", values: [`${resourceSet.id}@${resourceSet.version}`] },
        resolution: {
          assignmentMode: "auto",
          inheritance: "local",
          assignmentRef: { id: "available-sets-auto", version: "1.0.0" },
          sourceScope: { kind: "microsequence", ref: PATH[3] },
          rationale: "Conjunto Auto persistido antes do snapshot.",
          provenanceRefs: [`${resourceSet.id}@${resourceSet.version}`]
        }
      });
      state.effectiveSnapshot = snapshot;
      state.effectiveDesignState = "resolved";
      state.resourceAvailabilityState = "resolved";
      state.workspaceRevision += 1;
      return rememberDesign(options, "resolve_effective_design", {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        snapshotRef: { id: snapshot.id, version: snapshot.version },
        payloadHash: digestJson(snapshot)
      });
    },
    async saveAuthoringPedagogicalBlueprint(options) {
      requireRevision(options.expectedRevision);
      state.workspaceRevision += 1;
      state.blueprintState = "current";
      state.blueprintRef = { id: options.payload.id, version: options.payload.version };
      state.blueprint = structuredClone(options.payload.blueprint);
      state.blueprintBindingRef = {
        id: options.payload.binding.id,
        version: options.payload.binding.version
      };
      state.blueprintBinding = structuredClone(options.payload.binding);
      artifact = {
        blueprintRef: structuredClone(state.blueprintRef),
        bindingRef: structuredClone(state.blueprintBindingRef),
        analysisRef: { id: state.analysis.id, version: state.analysis.version },
        effectiveSnapshotRef: {
          id: state.effectiveSnapshot.id,
          version: state.effectiveSnapshot.version
        },
        scope: { kind: "microsequence", ref: PATH[3] },
        scopeEntityVersion: 1,
        basedOnWorkspaceRevision: options.expectedRevision,
        createdRevision: state.workspaceRevision,
        blueprintHash: digestJson(options.payload.blueprint),
        bindingHash: digestJson(options.payload.binding)
      };
      return rememberDesign(options, "save_pedagogical_blueprint", {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        ...structuredClone(artifact)
      });
    },
    async replayWorkspaceMutation(options) {
      const entry = workspaceLedger.get(options.requestId);
      if (!entry) return null;
      const signature = canonicalJsonStringify({
        workspaceId: options.workspaceId,
        expectedRevision: options.expectedRevision,
        operation: options.operation,
        arguments: options.arguments
      });
      if (signature !== entry.signature) {
        throw new AuthoringApiError(409, "idempotency_key_reused", "Payload divergente.");
      }
      return { ...structuredClone(entry.receipt), idempotent: true };
    },
    async mutateWorkspace(options) {
      requireRevision(options.expectedRevision);
      cards = structuredClone(options.arguments.cards);
      state.materializationContentHash = digestJson(cards);
      state.materializationState = "untracked";
      state.workspaceRevision += 1;
      const receipt = workspaceReceipt({ operation: options.operation });
      workspaceLedger.set(options.requestId, {
        signature: canonicalJsonStringify({
          workspaceId: options.workspaceId,
          expectedRevision: options.expectedRevision,
          operation: options.operation,
          arguments: options.arguments
        }),
        receipt: structuredClone(receipt)
      });
      return receipt;
    },
    async registerAuthoringMaterializationManifest(options) {
      requireRevision(options.expectedRevision);
      state.materializationManifest = structuredClone(options.payload);
      state.materializationState = "tracked";
      state.workspaceRevision += 1;
      return rememberDesign(options, "register_materialization_manifest", {
        workspaceId: WORKSPACE,
        revision: state.workspaceRevision,
        idempotent: false,
        manifestRef: { id: options.payload.id, version: options.payload.version },
        contentHash: options.payload.contentHash,
        payloadHash: digestJson(options.payload)
      });
    }
  };
}

function authoringMcpHandlerForJourney(adapter) {
  return createAuthoringMcpHandler({
    adapter,
    allowedOrigins: new Set(["https://client.example"]),
    resourceUrl: "https://edge.example/functions/v1/aralearn-authoring-mcp",
    authorizationServer: "https://project.example/auth/v1"
  });
}

async function invokeJourneyTool(handler, name, argumentsValue, id) {
  const response = await handler(new Request(
    "https://edge.example/functions/v1/aralearn-authoring-mcp",
    {
      method: "POST",
      headers: {
        Origin: "https://client.example",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer header.oauth-payload.signature",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: argumentsValue }
      })
    }
  ));
  assert.equal(response.status, 200);
  const envelope = JSON.parse(await response.text());
  assert.equal(envelope.jsonrpc, "2.0");
  return envelope.result.structuredContent;
}

test("jornada MCP retoma análise, ResourceSet, catálogo, cards e manifesto sem conversa", async () => {
  const adapter = integratedJourneyAdapter();
  const firstSession = authoringMcpHandlerForJourney(adapter);
  let callId = 1;
  const design = (operation, extra = {}) => invokeJourneyTool(
    firstSession,
    "gerirDesenhoInstrucional",
    { operation, workspaceId: WORKSPACE, ...extra },
    callId++
  );

  const initial = await design("read_slice", { microsequencePath: [...PATH] });
  assert.equal(initial.ok, true);
  assert.equal(initial.data.revision, 6);
  assert.equal(initial.data.result.nextAction, "save_analysis");
  assert.deepEqual(initial.data.result.coordination.part, {
    id: "part-transport",
    title: "Parte Transporte",
    microsequenceCount: 1
  });
  const analysisReceipt = await design("save_analysis", {
    requestId: "journey-analysis-0001",
    expectedRevision: 6,
    microsequencePath: [...PATH],
    payloadJson: JSON.stringify(analysis(6))
  });
  assert.equal(analysisReceipt.ok, true);
  assert.equal(analysisReceipt.data.revision, 7);

  const autoSet = await design("save_resource_set", {
    requestId: "journey-resource-set-0001",
    expectedRevision: 7,
    microsequencePath: [...PATH],
    payloadJson: JSON.stringify({
      mode: "auto",
      facets: {
        families: ["family.text_language"],
        disciplines: [],
        structures: ["structure.prose"],
        cognitiveOperations: ["operation.explain"],
        practiceModalities: []
      },
      selectionConstraints: {
        allowedFits: ["canonical", "versatile", "substitute"],
        allowEmbeddedPractice: true,
        allowResponsePackages: true,
        onNoAdequateRepresentation: "record_limitation"
      },
      provenanceRefs: ["analysis-computing-transport@1.0.0"]
    })
  });
  assert.equal(autoSet.ok, true);
  assert.equal(autoSet.data.revision, 8);
  assert.ok(autoSet.data.result.packageCount >= 1);
  const resourceSetRef = autoSet.data.result.resourceSetRef;

  const availableAssignment = {
    contract: "DesignParameterAssignment@1",
    modelVersion: "1.0.0",
    id: "available-sets-auto",
    version: "1.0.0",
    definitionRef: { id: "available_resource_set_refs", version: "1.0.0" },
    scope: { kind: "microsequence", ref: PATH[3] },
    mode: "auto",
    value: {
      kind: "set",
      values: [`${resourceSetRef.id}@${resourceSetRef.version}`]
    },
    authority: { kind: "gpt", actorRef: null, locked: false },
    rationale: "Disponibilidade Auto congelada antes da resolução.",
    provenanceRefs: [`${resourceSetRef.id}@${resourceSetRef.version}`]
  };
  const assignmentReceipt = await design("set_parameter", {
    requestId: "journey-parameter-0001",
    expectedRevision: 8,
    microsequencePath: [...PATH],
    payloadJson: JSON.stringify(availableAssignment)
  });
  assert.equal(assignmentReceipt.ok, true);
  assert.equal(assignmentReceipt.data.revision, 9);

  const resolution = await design("resolve_effective", {
    requestId: "journey-resolution-0001",
    expectedRevision: 9,
    microsequencePath: [...PATH],
    payloadJson: "{}"
  });
  assert.equal(resolution.ok, true);
  assert.equal(resolution.data.revision, 10);
  const snapshotRef = resolution.data.result.snapshotRef;

  const exploredCatalog = await invokeJourneyTool(
    firstSession,
    "consultarBibliotecaDeResources",
    {
      operation: "explore",
      workspaceId: WORKSPACE,
      snapshotRef,
      slot: "content"
    },
    callId++
  );
  assert.equal(exploredCatalog.ok, true);
  assert.equal(exploredCatalog.data.availability.mode, "resource_set_restricted");
  assert.ok(exploredCatalog.data.result.families.length >= 1);
  const catalog = await invokeJourneyTool(
    firstSession,
    "consultarBibliotecaDeResources",
    {
      operation: "search",
      workspaceId: WORKSPACE,
      snapshotRef,
      query: "explicação progressiva em prosa",
      slot: "content",
      structureIds: ["structure.prose"],
      operationIds: ["operation.explain"],
      limit: 4
    },
    callId++
  );
  assert.equal(catalog.ok, true);
  assert.equal(catalog.data.availability.mode, "resource_set_restricted");
  assert.deepEqual(catalog.data.availability.snapshotRef, snapshotRef);
  const paragraphCandidate = catalog.data.result.candidates.find(({ packageId }) => (
    packageId === "aralearn.resource.paragraph"
  ));
  assert.ok(paragraphCandidate);
  const inspectedCatalog = await invokeJourneyTool(
    firstSession,
    "consultarBibliotecaDeResources",
    {
      operation: "inspect",
      workspaceId: WORKSPACE,
      snapshotRef,
      packages: [{
        packageId: paragraphCandidate.packageId,
        version: paragraphCandidate.version
      }]
    },
    callId++
  );
  assert.equal(inspectedCatalog.ok, true);
  assert.equal(inspectedCatalog.data.result.items[0].status, "ok");
  const catalogContract = await invokeJourneyTool(
    firstSession,
    "consultarBibliotecaDeResources",
    {
      operation: "contracts",
      workspaceId: WORKSPACE,
      snapshotRef,
      packages: [{
        packageId: paragraphCandidate.packageId,
        version: paragraphCandidate.version
      }]
    },
    callId++
  );
  assert.equal(catalogContract.ok, true);
  assert.equal(catalogContract.data.result.items.length, 1);

  const compactBlueprint = blueprint();
  compactBlueprint.theorySteps[0].cognitiveOperation = "explain";
  compactBlueprint.contentDemands[0].cognitiveOperations = ["explain"];
  const compactMappings = mappings();
  compactMappings.conceptualLayers[0].unitRefs = ["tcp"];
  compactMappings.contentDemands[0].unitRefs = ["tcp"];
  compactMappings.theorySteps[0].unitRefs = ["tcp"];
  const blueprintReceipt = await design("save_blueprint", {
    requestId: "journey-blueprint-0001",
    expectedRevision: 10,
    microsequencePath: [...PATH],
    payloadJson: JSON.stringify({
      blueprint: compactBlueprint,
      mappings: compactMappings
    })
  });
  assert.equal(blueprintReceipt.ok, true);
  assert.equal(blueprintReceipt.data.revision, 11);

  const cards = [cardWith("aralearn.resource.paragraph")];
  cards[0].position = 1;
  const validatedCard = await invokeJourneyTool(
    firstSession,
    "consultarBibliotecaDeResources",
    {
      operation: "validate_card",
      workspaceId: WORKSPACE,
      snapshotRef,
      cardJson: JSON.stringify(cards[0])
    },
    callId++
  );
  assert.equal(validatedCard.ok, true);
  assert.equal(validatedCard.data.result.valid, true);
  const auditedCard = await invokeJourneyTool(
    firstSession,
    "consultarBibliotecaDeResources",
    {
      operation: "audit_representation",
      workspaceId: WORKSPACE,
      snapshotRef,
      cardJson: JSON.stringify(cards[0]),
      intent: "Explicar progressivamente em prosa.",
      operationIds: ["operation.explain"]
    },
    callId++
  );
  assert.equal(auditedCard.ok, true);
  assert.equal(auditedCard.data.result.structural.valid, true);
  const cardArguments = {
    requestId: "journey-cards-0001",
    workspaceId: WORKSPACE,
    expectedRevision: 11,
    microsequencePath: [...PATH],
    mode: "replace",
    cardsJson: JSON.stringify(cards)
  };
  const directGate = await validateWorkspaceCardDesignAccess({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE,
    expectedRevision: 11,
    operation: "save_microsequence_cards",
    arguments: { microsequencePath: [...PATH], mode: "replace", cards }
  });
  assert.equal(directGate.mode, "resource_set_restricted");
  const savedCards = await invokeJourneyTool(
    firstSession,
    "salvarCardsNaMicrossequencia",
    cardArguments,
    callId++
  );
  assert.equal(savedCards.ok, true, JSON.stringify(savedCards));
  assert.equal(savedCards.data.revision, 12);
  const replayedCards = await invokeJourneyTool(
    firstSession,
    "salvarCardsNaMicrossequencia",
    cardArguments,
    callId++
  );
  assert.equal(replayedCards.ok, true);
  assert.equal(replayedCards.data.revision, 12);
  assert.equal(replayedCards.data.idempotent, true);
  const staleCards = await invokeJourneyTool(
    firstSession,
    "salvarCardsNaMicrossequencia",
    { ...cardArguments, requestId: "journey-cards-stale-0001" },
    callId++
  );
  assert.equal(staleCards.ok, false);
  assert.equal(staleCards.error.code, "stale_authoring_state");

  const secondSession = authoringMcpHandlerForJourney(adapter);
  const resumedOverview = await invokeJourneyTool(
    secondSession,
    "gerirDesenhoInstrucional",
    {
      operation: "read_slice",
      workspaceId: WORKSPACE,
      microsequencePath: [...PATH],
      view: "overview"
    },
    callId++
  );
  const resumedMaterialization = await invokeJourneyTool(
    secondSession,
    "gerirDesenhoInstrucional",
    {
      operation: "read_slice",
      workspaceId: WORKSPACE,
      microsequencePath: [...PATH],
      view: "materialization"
    },
    callId++
  );
  assert.equal(resumedOverview.ok, true);
  assert.equal(resumedOverview.data.result.artifacts.blueprintHash,
    blueprintReceipt.data.result.blueprintHash);
  assert.equal(resumedMaterialization.ok, true);
  assert.equal(resumedMaterialization.data.result.materialization.manifest, null);
  const materialization = resumedMaterialization.data.result.materialization;
  const manifestFit = paragraphCandidate.fit;
  const manifest = {
    contract: "MaterializationManifest@1",
    modelVersion: "1.0.0",
    id: "journey-manifest",
    version: "1.0.0",
    scope: { kind: "microsequence", ref: PATH[3] },
    analysisRef: { id: adapter.state.analysis.id, version: adapter.state.analysis.version },
    effectiveSnapshotRef: snapshotRef,
    blueprintRef: blueprintReceipt.data.result.blueprintRef,
    materializedWorkspaceRevision: 12,
    scopeEntityVersion: 1,
    contentHash: materialization.contentHash,
    blueprintHash: resumedOverview.data.result.artifacts.blueprintHash,
    createdAt: "2026-08-15T12:05:00.000Z",
    resourceSetRefs: [resourceSetRef],
    plannedSteps: [{ stepRef: "theory:a", kind: "theory", unitRefs: ["tcp"] }],
    materializedSteps: [{
      stepRef: "theory:a",
      kind: "theory",
      unitRefs: ["tcp"],
      artifactRefs: [cards[0].id]
    }],
    explanationCoverage: [],
    evidenceCoverage: [],
    practiceOpportunities: [],
    resourceSelections: [{
      id: "selection-paragraph",
      stepRef: "theory:a",
      package: { packageId: "aralearn.resource.paragraph", version: "1.0.0" },
      authorizedByResourceSetRef: resourceSetRef,
      role: "exposition",
      fit: manifestFit,
      rationale: "Prosa selecionada no catálogo restrito.",
      limitations: manifestFit === "canonical"
        ? []
        : [paragraphCandidate.reason || "Representação não canônica declarada."]
    }],
    materializedResources: [{
      id: "materialized-paragraph",
      selectionRef: "selection-paragraph",
      artifactRef: cards[0].id,
      package: { packageId: "aralearn.resource.paragraph", version: "1.0.0" },
      role: "exposition"
    }],
    derivedMetrics: [],
    assumptions: [],
    limitations: []
  };
  const manifestReceipt = await invokeJourneyTool(
    secondSession,
    "gerirDesenhoInstrucional",
    {
      operation: "register_manifest",
      workspaceId: WORKSPACE,
      requestId: "journey-manifest-0001",
      expectedRevision: 12,
      microsequencePath: [...PATH],
      payloadJson: JSON.stringify(manifest)
    },
    callId++
  );
  assert.equal(manifestReceipt.ok, true);
  assert.equal(manifestReceipt.data.revision, 13);
  assert.equal(manifestReceipt.data.result.registration, "accepted");
  const replayedManifest = await invokeJourneyTool(
    secondSession,
    "gerirDesenhoInstrucional",
    {
      operation: "register_manifest",
      workspaceId: WORKSPACE,
      requestId: "journey-manifest-0001",
      expectedRevision: 12,
      microsequencePath: [...PATH],
      payloadJson: JSON.stringify(manifest)
    },
    callId++
  );
  assert.equal(replayedManifest.ok, true);
  assert.equal(replayedManifest.data.replayed, true);

  const finalSession = authoringMcpHandlerForJourney(adapter);
  const finalSlice = await invokeJourneyTool(
    finalSession,
    "gerirDesenhoInstrucional",
    {
      operation: "read_slice",
      workspaceId: WORKSPACE,
      microsequencePath: [...PATH],
      view: "materialization"
    },
    callId++
  );
  assert.equal(finalSlice.ok, true);
  assert.equal(finalSlice.data.revision, 13);
  assert.deepEqual(finalSlice.data.result.materialization.manifest.ref,
    { id: manifest.id, version: manifest.version });
  assert.equal(finalSlice.data.result.nextAction, "continue_to_next_microsequence");
});
