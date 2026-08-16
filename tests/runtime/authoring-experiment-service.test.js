import assert from "node:assert/strict";
import test from "node:test";

import {
  executeExperimentEnrollmentAction,
  executeWorkspaceExperimentAction,
  readAuthoringExperimentContext,
  registerAuthoringExperimentVariantEvidence,
  recordAuthoringExperimentDiffClassification
} from "../../supabase/functions/_shared/aralearn-authoring/authoringExperimentService.js";
import {
  validateWorkspaceDesignActionPayload,
  validateWorkspaceExperimentActionPayload
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringApplicationToolDefinition,
  authoringMcpToolDefinition,
  validateAuthoringApplicationToolOutput,
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const CHILD_WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";
const EXPERIMENT_ID = "30000000-0000-4000-8000-000000000001";
const COURSE_ID = "40000000-0000-4000-8000-000000000001";
const SELECTION_ID = "50000000-0000-4000-8000-000000000001";
const ENROLLMENT_REF = "60000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);
const PRINCIPAL = Object.freeze({ actorId: ACTOR_ID });
const PATH = Object.freeze(["course-a", "module-a", "lesson-a", "micro-a"]);
const VARIANT_SET_REF = Object.freeze({ id: "variant-set-a", version: "7" });
const DIFFERENCE_SET_REF = Object.freeze({ id: "difference-set-a", version: "7" });
const DIFFERENCE_RUN_REF = Object.freeze({ id: "difference-run-a", version: "3" });
const DIFFERENCE_HUNK_REF = Object.freeze({ id: "h-1234567890abcdef", version: "b".repeat(64) });
const PARTICIPANT_SET_REF = Object.freeze({ id: "participant-set-a", version: "7" });

function versionedRef(id, version = "1.0.0") {
  return { id, version };
}

function evidenceArtifact(hash, suffix) {
  return {
    hash,
    bucket: "authoring-artifacts",
    objectKey: `experiments/${suffix}.json`,
    artifactType: "authoring_experiment_materialization",
    mediaType: "application/json",
    sizeBytes: 1
  };
}

function outputEnvelope(data) {
  return { ok: true, requestId: null, data };
}

function validateApplication(data, action = "gerirExperimentoInstrucional") {
  assert.doesNotThrow(() => validateAuthoringApplicationToolOutput(
    action,
    outputEnvelope(data)
  ));
}

function baseProtocol(targets = [{ kind: "microsequence", ref: "micro-a" }]) {
  return {
    title: "Protocolo de granularidade",
    hypothesis: "A granularidade altera a coordenação requerida.",
    baseRef: versionedRef("publication-base", "4"),
    scope: { kind: "course", ref: "course-a" },
    factors: [{
      factorId: "novelty-ceiling",
      definitionRef: versionedRef(
        "simultaneous_new_units_per_coordination_set_ceiling"
      ),
      kind: "parameter",
      targets,
    }],
    conditions: [{
      conditionId: "condition-a",
      label: "Uma unidade nova",
      values: [{ factorId: "novelty-ceiling", value: { kind: "integer", value: 1 } }]
    }, {
      conditionId: "condition-b",
      label: "Duas unidades novas",
      values: [{ factorId: "novelty-ceiling", value: { kind: "integer", value: 2 } }]
    }],
    invariants: ["sources", "targets", "analysis", "structure"],
    assignment: { rule: "manual" },
    consentPolicyRef: versionedRef("consent-policy"),
    instrumentRefs: [],
    outcomeRefs: []
  };
}

function overviewRaw() {
  return {
    id: EXPERIMENT_ID,
    experimentRevision: 7,
    state: "ready",
    title: "Protocolo de granularidade",
    hypothesis: "Hipótese explícita",
    actions: {
      saveProtocol: false,
      validate: false,
      generateVariants: false,
      decideDifference: true,
      freeze: true,
      startCollection: true,
      rotateEnrollmentCode: false,
      transitionCollection: ["invalidate"],
      assignParticipant: true
    },
    assignment: {
      rule: "seeded_random",
      seed: "private-seed",
      algorithm: "sha256-counter-v1",
      commitment: HASH
    },
    enrollment: { configured: true, expiresAt: "2026-08-30T12:00:00.000Z" },
    conditionCount: 2,
    variantCount: 2,
    differenceCount: 1
  };
}

function variantRaw(index = 1) {
  return {
    variantRevisionRef: versionedRef(`variant-${index}`, String(index)),
    conditionRef: versionedRef(`condition-${index}`, "1"),
    baseRef: versionedRef("publication-base", "4"),
    protocolRef: versionedRef(EXPERIMENT_ID, "7"),
    state: "ready",
    workspaceRevision: 19,
    readerTarget: {
      workspaceId: CHILD_WORKSPACE_ID,
      entityPath: PATH,
      courseId: COURSE_ID,
      contentHash: HASH
    },
    frozenAt: "2026-08-16T12:00:00.000Z",
    limitationRefs: [versionedRef("limitation-a")],
    snapshotRef: versionedRef(`snapshot-${index}`),
    materializationRef: versionedRef(`manifest-${index}`),
    auditRunRef: versionedRef(`audit-${index}`),
    provenanceHash: HASH,
    provenancePinCount: 12,
    provenance: {
      currentness: {
        base: true,
        protocol: true,
        condition: true,
        materialization: true,
        audit: true
      }
    },
    allowedResources: Array.from({ length: 8 }, (_, itemIndex) => ({
      ref: versionedRef(`resource-set-${itemIndex + 1}`),
      label: `ResourceSet ${itemIndex + 1}`,
      role: "allowed"
    })),
    materializedResources: Array.from({ length: 8 }, (_, itemIndex) => ({
      ref: versionedRef(`materialized-${itemIndex + 1}`),
      label: `Materializado ${itemIndex + 1}`,
      role: "actual"
    }))
  };
}

function differenceRunRaw(index = 1) {
  return {
    differenceRef: versionedRef(`difference-run-${index}`, String(index)),
    baselineRef: {
      kind: index % 2 === 0 ? "variant" : "base",
      ref: versionedRef(index % 2 === 0 ? "variant-baseline" : "publication-base")
    },
    candidateVariantRevisionRef: versionedRef(`variant-${index}`),
    state: "ready",
    hunkCount: 25,
    classifiedCount: 20,
    decision: null,
    requiresParticipantContinuity: index === 2
  };
}

function differenceHunkRaw(index = 1) {
  return {
    differenceRef: versionedRef(`hunk-${index}`, HASH),
    differenceId: `hunk-${index}`,
    path: `cards.card-${index}.content`,
    kind: "changed",
    beforeSummary: "Conteúdo anterior",
    afterSummary: "Conteúdo materializado",
    classification: index % 2 === 0 ? "inevitable_derived" : null,
    publicRationale: index % 2 === 0 ? "Derivação necessária." : null,
    evidenceRefs: [`evidence-${index}`],
    humanDecision: null,
    requiresParticipantContinuity: index === 1
  };
}

test("actions experimentais permanecem application-only e o MCP público conserva 30 tools", () => {
  assert.equal(AUTHORING_WORKSPACE_MCP_TOOLS.length, 30);
  assert.equal(authoringMcpToolDefinition("gerirExperimentoInstrucional"), null);
  assert.equal(authoringMcpToolDefinition("ingressarEmExperimentoInstrucional"), null);
  assert.ok(authoringApplicationToolDefinition("gerirExperimentoInstrucional"));
  assert.ok(authoringApplicationToolDefinition("ingressarEmExperimentoInstrucional"));
});

test("cursores de list/options exigem snapshots globais explícitos", () => {
  assert.throws(() => validateWorkspaceExperimentActionPayload({
    operation: "list",
    cursor: "opaque-list-page-2"
  }), (error) => error?.code === "missing_experiment_list_set_ref");
  assert.deepEqual(validateWorkspaceExperimentActionPayload({
    operation: "list",
    experimentSetRef: versionedRef("experiment-set-a", "4"),
    cursor: "opaque-list-page-2"
  }), {
    operation: "list",
    experimentSetRef: versionedRef("experiment-set-a", "4"),
    cursor: "opaque-list-page-2",
    limit: 20
  });
  assert.throws(() => validateWorkspaceExperimentActionPayload({
    operation: "list_options",
    kind: "outcome",
    cursor: "opaque-options-page-2"
  }), (error) => error?.code === "missing_experiment_list_set_ref");
  assert.deepEqual(validateWorkspaceExperimentActionPayload({
    operation: "list_options",
    kind: "outcome",
    optionsSetRef: versionedRef("options-set-a", "9"),
    cursor: "opaque-options-page-2"
  }), {
    operation: "list_options",
    kind: "outcome",
    optionsSetRef: versionedRef("options-set-a", "9"),
    cursor: "opaque-options-page-2",
    limit: 20
  });
  assert.throws(() => validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    view: "experiment_context",
    cursor: "opaque-context-page-2"
  }), (error) => error?.code === "missing_experiment_context_set_ref");
  assert.deepEqual(validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    view: "experiment_context",
    variantSetRef: versionedRef("context-set-a", "5"),
    cursor: "opaque-context-page-2"
  }), {
    operation: "read_slice",
    view: "experiment_context",
    variantSetRef: versionedRef("context-set-a", "5"),
    cursor: "opaque-context-page-2",
    limit: 20
  });
});

test("paginação experimental falha fechada quando o backend omite o pin canônico", async () => {
  const missingPin = (promise) => assert.rejects(
    promise,
    (error) => error?.code === "invalid_experiment_backend_result"
  );
  await missingPin(executeWorkspaceExperimentAction({
    adapter: {
      async listAuthoringExperiments() {
        return { workspaceRevision: 3, items: [], count: 0, truncated: false };
      }
    },
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "list"
  }));
  await missingPin(executeWorkspaceExperimentAction({
    adapter: {
      async listAuthoringExperimentOptions() {
        return { workspaceRevision: 3, items: [], count: 0, truncated: false };
      }
    },
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "list_options",
    kind: "scope"
  }));
  for (const section of ["variants", "participants", "differences"]) {
    await missingPin(executeWorkspaceExperimentAction({
      adapter: {
        async getAuthoringExperiment() {
          const pageField = {
            variants: "variants",
            participants: "participants",
            differences: "differenceRuns"
          }[section];
          return {
            workspaceRevision: 3,
            experiment: {
              id: EXPERIMENT_ID,
              experimentRevision: 2,
              state: "ready",
              [pageField]: { items: [], count: 0, truncated: false }
            }
          };
        }
      },
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      operation: "read",
      experimentId: EXPERIMENT_ID,
      section
    }));
  }
  await missingPin(readAuthoringExperimentContext({
    adapter: {
      async getAuthoringExperimentContext() {
        return {
          workspace: { id: WORKSPACE_ID, title: "Pai", revision: 3 },
          variants: { items: [], count: 0, truncated: false }
        };
      }
    },
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID
  }));
});

test("list e overview validam outputs fechados e nunca projetam seed", async () => {
  const adapter = {
    async listAuthoringExperiments({ actorId, workspaceId, limit }) {
      assert.equal(actorId, ACTOR_ID);
      assert.equal(workspaceId, WORKSPACE_ID);
      assert.equal(limit, 20);
      return {
        workspaceRevision: 31,
        experimentSetRef: versionedRef("experiment-set-a", "31"),
        items: [{
          id: EXPERIMENT_ID,
          experimentRevision: 7,
          title: "Protocolo de granularidade",
          state: "ready",
          conditionCount: 2,
          variantCount: 2,
          updatedAt: "2026-08-16T12:00:00.000Z"
        }],
        count: 1,
        nextCursor: null,
        truncated: false
      };
    },
    async getAuthoringExperiment() {
      return { workspaceRevision: 31, experiment: overviewRaw() };
    }
  };
  const listed = await executeWorkspaceExperimentAction({
    adapter, principal: PRINCIPAL, workspaceId: WORKSPACE_ID, operation: "list"
  });
  validateApplication(listed);
  assert.equal(listed.count, 1);
  assert.deepEqual(listed.experimentSetRef, {
    id: "experiment-set-a",
    version: "31"
  });

  const overview = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "overview"
  });
  validateApplication(overview);
  assert.deepEqual(overview.experiment.actions.transitionCollection, ["invalidate"]);
  assert.equal(overview.experiment.assignment.seedConfigured, true);
  assert.equal(/private-seed|"seed"/u.test(JSON.stringify(overview)), false);
});

test("list_options projeta metadados governados por kind e limita factor_definition", async () => {
  const itemsByKind = {
    scope: [{
      scope: { kind: "microsequence", ref: "micro-a" },
      label: "Microssequência A",
      entityPath: PATH
    }],
    base: [{
      ref: versionedRef("publication-base", "4"),
      label: "Publicação aprovada",
      approved: true,
      scope: { kind: "course", ref: "course-a" }
    }],
    factor_definition: [{
      definitionRef: versionedRef("applicable_explanation_requirement_refs"),
      label: "Requisitos de explicação",
      kind: "parameter",
      valueType: "set",
      numerator: "explanation_requirement_ref",
      denominator: "microsequence",
      supportedScopes: ["microsequence"],
      constraints: {
        minimum: 0,
        maximum: 8,
        allowedEnumValues: ["conceptual", "causal"],
        setItemPattern: "^[a-zA-Z0-9._:-]+$",
        refNamespace: "explanation_requirement",
        vectorDimensions: ["context"],
        allowedUnits: ["ratio"],
        relationKinds: ["supports"]
      },
      options: [{
        label: "Conceitual",
        value: { kind: "set", values: ["conceptual"] }
      }]
    }, {
      definitionRef: versionedRef("ignored-second-definition"),
      label: "Segunda definição",
      kind: "parameter",
      valueType: "integer",
      supportedScopes: ["microsequence"],
      constraints: {},
      options: []
    }],
    resource_set: [{
      ref: versionedRef("resource-set-a"),
      label: "Resources categóricos",
      memberCount: 8,
      scope: { kind: "course", ref: "course-a" }
    }],
    consent_policy: [{ ref: versionedRef("consent-a"), label: "Consentimento A" }],
    instrument: [{ ref: versionedRef("instrument-a"), label: "Instrumento A" }],
    outcome: [{ ref: versionedRef("outcome-a"), label: "Outcome A" }]
  };
  for (const kind of Object.keys(itemsByKind)) {
    let receivedLimit = null;
    const adapter = {
      async listAuthoringExperimentOptions({ limit, kind: receivedKind }) {
        assert.equal(receivedKind, kind);
        receivedLimit = limit;
        return {
          workspaceRevision: 31,
          optionsSetRef: versionedRef("options-set-a", "31"),
          items: itemsByKind[kind].slice(0, limit),
          count: itemsByKind[kind].length,
          nextCursor: itemsByKind[kind].length > limit ? "opaque-next" : null,
          truncated: itemsByKind[kind].length > limit
        };
      }
    };
    const result = await executeWorkspaceExperimentAction({
      adapter,
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      operation: "list_options",
      kind,
      limit: 50
    });
    validateApplication(result);
    assert.ok(JSON.stringify(result).length < 96 * 1024);
    if (kind === "factor_definition") {
      assert.equal(receivedLimit, 1);
      assert.deepEqual(result.items[0].supportedScopes, ["microsequence"]);
      assert.equal(result.items[0].constraints.refNamespace, "explanation_requirement");
      assert.deepEqual(result.items[0].options[0].value, {
        kind: "set", values: ["conceptual"]
      });
    }
    assert.deepEqual(result.optionsSetRef, {
      id: "options-set-a",
      version: "31"
    });
    if (kind === "base") assert.equal(result.items[0].approved, true);
    if (kind === "resource_set") assert.equal(result.items[0].memberCount, 8);
    if (kind === "scope") assert.deepEqual(result.items[0].entityPath, PATH);
  }
});

test("protocol section ecoa o pin histórico, remove seed e permanece abaixo de 96 KiB", async () => {
  const encodedSize = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const longTargets = [];
  while (longTargets.length < 500) {
    const candidate = {
      kind: "microsequence",
      ref: `micro-${String(longTargets.length + 1).padStart(3, "0")}-${"x".repeat(210)}`
    };
    const candidateProtocol = baseProtocol([...longTargets, candidate]);
    if (encodedSize({ protocol: candidateProtocol }) > 58_500) break;
    longTargets.push(candidate);
  }
  const protocol = baseProtocol(longTargets);
  protocol.assignment = {
    rule: "seeded_random",
    seed: "never-project-this-seed"
  };
  const accepted = validateWorkspaceExperimentActionPayload({
    operation: "save_protocol",
    requestId: "save-protocol-budget-0001",
    expectedExperimentRevision: 0,
    payload: { protocol }
  });
  assert.equal(accepted.operation, "save_protocol");
  assert.ok(encodedSize({ protocol }) > 57_000);
  const oversized = structuredClone(protocol);
  while (encodedSize({ protocol: oversized }) <= 60_000) {
    oversized.factors[0].targets.push({
      kind: "microsequence",
      ref: `overflow-${oversized.factors[0].targets.length + 1}-${"y".repeat(210)}`
    });
  }
  assert.throws(() => validateWorkspaceExperimentActionPayload({
    operation: "save_protocol",
    requestId: "save-protocol-budget-oversized",
    expectedExperimentRevision: 0,
    payload: { protocol: oversized }
  }), (error) => error?.code === "experiment_payload_too_large");
  const readProtocol = structuredClone(protocol);
  readProtocol.conditions[0].conditionRef = versionedRef("condition-a", "7");
  readProtocol.conditions[1].conditionRef = versionedRef("condition-b", "7");
  const adapter = {
    async getAuthoringExperiment({ protocolRevision }) {
      assert.equal(protocolRevision, 7);
      return {
        workspaceRevision: 31,
        experiment: {
          id: EXPERIMENT_ID,
          experimentRevision: 7,
          state: "draft",
          protocolRef: versionedRef(EXPERIMENT_ID, "7"),
          protocolRevision: 7,
          protocol: readProtocol
        }
      };
    }
  };
  const result = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "protocol",
    protocolRevision: 7
  });
  validateApplication(result);
  assert.deepEqual(result.experiment.protocolRef, versionedRef(EXPERIMENT_ID, "7"));
  assert.equal(result.experiment.protocolRevision, 7);
  assert.deepEqual(
    result.experiment.protocol.conditions[0].conditionRef,
    versionedRef("condition-a", "7")
  );
  assert.equal(/never-project-this-seed|"seed"/u.test(JSON.stringify(result)), false);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).byteLength < 90 * 1024);

  await assert.rejects(
    executeWorkspaceExperimentAction({
      adapter: {
        async getAuthoringExperiment() {
          return {
            workspaceRevision: 31,
            experiment: {
              id: EXPERIMENT_ID,
              experimentRevision: 7,
              state: "draft",
              protocolRef: versionedRef(EXPERIMENT_ID, "8"),
              protocolRevision: 8,
              protocol: readProtocol
            }
          };
        }
      },
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      operation: "read",
      experimentId: EXPERIMENT_ID,
      section: "protocol",
      protocolRevision: 7
    }),
    (error) => error?.code === "experiment_protocol_revision_changed"
  );
});

test("variants preservam cursor opaco, CAS child, provenance e totais truncados", async () => {
  const adapter = {
    async getAuthoringExperiment(args) {
      assert.equal(args.variantCursor, "opaque-page-2");
      assert.equal(args.variantLimit, 10);
      return {
        workspaceRevision: 31,
        experiment: {
          id: EXPERIMENT_ID,
          experimentRevision: 7,
          state: "ready",
          variantSetRef: VARIANT_SET_REF,
          variants: {
            variantSetRef: VARIANT_SET_REF,
            items: [variantRaw(2)],
            count: 21,
            nextCursor: null,
            truncated: false
          }
        }
      };
    }
  };
  const result = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "variants",
    variantSetRef: VARIANT_SET_REF,
    variantCursor: "opaque-page-2",
    variantLimit: 20
  });
  validateApplication(result);
  const variant = result.experiment.items[0];
  assert.equal(variant.workspaceRevision, 19);
  assert.deepEqual(variant.snapshotRef, versionedRef("snapshot-2"));
  assert.equal(variant.currentness.materialization, true);
  assert.equal(variant.allowedResources.items.length, 2);
  assert.equal(variant.allowedResources.count, 8);
  assert.equal(variant.allowedResources.truncated, true);
  assert.equal(result.experiment.items.length, 1);
});

test("runs e hunks paginam mais de 20 itens sob pins independentes", async () => {
  const differenceRuns = Array.from({ length: 25 }, (_, index) => differenceRunRaw(index + 1));
  const hunks = Array.from({ length: 25 }, (_, index) => differenceHunkRaw(index + 1));
  const adapter = {
    async getAuthoringExperiment(args) {
      return {
        workspaceRevision: 31,
        experiment: {
          id: EXPERIMENT_ID,
          experimentRevision: 7,
          state: "ready",
          ...(args.differenceRunRef ? {
            differenceRunRef: DIFFERENCE_RUN_REF,
            hunks
          } : {
            differenceSetRef: DIFFERENCE_SET_REF,
            differenceRuns
          })
        }
      };
    }
  };
  const runPage1 = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "differences",
    differenceRunLimit: 20
  });
  validateApplication(runPage1);
  assert.equal(runPage1.experiment.mode, "runs");
  assert.equal(runPage1.experiment.items.length, 20);
  assert.equal(runPage1.experiment.nextCursor, "d:20");
  assert.deepEqual(runPage1.experiment.differenceSetRef, DIFFERENCE_SET_REF);
  assert.equal(runPage1.experiment.items[1].baselineRef.kind, "variant_revision");

  const runPage2 = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "differences",
    differenceSetRef: DIFFERENCE_SET_REF,
    differenceRunCursor: runPage1.experiment.nextCursor,
    differenceRunLimit: 20
  });
  validateApplication(runPage2);
  assert.equal(runPage2.experiment.items.length, 5);
  assert.equal(runPage2.experiment.nextCursor, null);

  const hunkPage1 = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "differences",
    differenceRunRef: DIFFERENCE_RUN_REF,
    differenceLimit: 20
  });
  validateApplication(hunkPage1);
  assert.equal(hunkPage1.experiment.mode, "hunks");
  assert.equal(hunkPage1.experiment.items.length, 20);
  assert.equal(hunkPage1.experiment.nextCursor, "h:20");
  assert.deepEqual(hunkPage1.experiment.items[0].differenceRef, versionedRef("hunk-1", HASH));
  assert.equal(hunkPage1.experiment.items[0].requiresParticipantContinuity, true);

  const hunkPage2 = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "differences",
    differenceRunRef: DIFFERENCE_RUN_REF,
    differenceCursor: hunkPage1.experiment.nextCursor,
    differenceLimit: 20
  });
  validateApplication(hunkPage2);
  assert.equal(hunkPage2.experiment.items.length, 5);
  assert.equal(hunkPage2.experiment.nextCursor, null);
});

test("participants usam fila pseudônima pinada sem user, consent, seed ou outcome", async () => {
  const participants = Array.from({ length: 25 }, (_, index) => ({
    enrollmentRef: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    pseudonymLabel: `Participante ${index + 1}`,
    status: index % 2 === 0 ? "enrolled" : "assigned",
    assignedConditionRef: index % 2 === 0 ? null : versionedRef("condition-a")
  }));
  const adapter = {
    async getAuthoringExperiment() {
      return {
        workspaceRevision: 31,
        experiment: {
          id: EXPERIMENT_ID,
          experimentRevision: 7,
          state: "collecting",
          participantSetRef: PARTICIPANT_SET_REF,
          participants
        }
      };
    }
  };
  const first = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "participants",
    participantLimit: 20
  });
  validateApplication(first);
  assert.equal(first.experiment.nextCursor, "p:20");
  const second = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "read",
    experimentId: EXPERIMENT_ID,
    section: "participants",
    participantSetRef: PARTICIPANT_SET_REF,
    participantCursor: first.experiment.nextCursor,
    participantLimit: 20
  });
  validateApplication(second);
  assert.equal(second.experiment.items.length, 5);
  assert.equal(/user|participantRef|consent|seed|outcome/iu.test(JSON.stringify(second)), false);
});

test("save e assign chegam ao ledger sem preflight stateful no service", async () => {
  const calls = [];
  const adapter = {
    async getAuthoringExperiment() {
      throw new Error("preflight indevido");
    },
    async manageAuthoringExperiment(args) {
      calls.push(args);
      return {
        workspaceRevision: 32,
        experimentRef: { id: EXPERIMENT_ID },
        revision: 1,
        state: "draft",
        idempotent: false,
        protocolRef: versionedRef(EXPERIMENT_ID, "1")
      };
    },
    async assignAuthoringExperimentParticipant(args) {
      calls.push(args);
      return {
        workspaceRevision: 32,
        experimentRef: { id: EXPERIMENT_ID },
        revision: 8,
        state: "collecting",
        idempotent: true,
        assignmentRef: versionedRef("assignment-a")
      };
    }
  };
  const save = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "save_protocol",
    requestId: "save-protocol-replay-0001",
    expectedExperimentRevision: 0,
    payload: { protocol: baseProtocol() }
  });
  validateApplication(save);
  const assign = await executeWorkspaceExperimentAction({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "assign_participant",
    requestId: "assign-participant-0001",
    expectedExperimentRevision: 7,
    payload: {
      experimentId: EXPERIMENT_ID,
      enrollmentRef: ENROLLMENT_REF,
      conditionRef: versionedRef("condition-a")
    }
  });
  validateApplication(assign);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.protocol.assignment.seed, undefined);
  assert.equal(calls[1].payload.enrollmentRef, ENROLLMENT_REF);
});

test("rotate_enrollment_code permanece app-only e devolve plaintext só no receipt", async () => {
  const result = await executeWorkspaceExperimentAction({
    adapter: {
      async manageAuthoringExperiment(args) {
        assert.equal(args.operation, "rotate_enrollment_code");
        return {
          workspaceRevision: 32,
          experimentRef: { id: EXPERIMENT_ID },
          revision: 9,
          state: "collecting",
          idempotent: false,
          resultRef: versionedRef("enrollment-code-rotation"),
          enrollmentCode: "ROTATED_CODE_1234",
          expiresAt: "2026-08-30T12:00:00.000Z"
        };
      }
    },
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "rotate_enrollment_code",
    requestId: "rotate-enrollment-code-0001",
    expectedExperimentRevision: 8,
    payload: { experimentId: EXPERIMENT_ID }
  });
  validateApplication(result);
  assert.equal(result.enrollmentCode, "ROTATED_CODE_1234");
  assert.equal(result.expiresAt, "2026-08-30T12:00:00.000Z");
});

test("request_correction usa CAS do child e projeta receipt append-only", async () => {
  const variantRevisionRef = versionedRef(
    "70000000-0000-4000-8000-000000000001",
    "3"
  );
  assert.throws(() => validateWorkspaceExperimentActionPayload({
    operation: "request_correction",
    requestId: "request-correction-missing-fence",
    expectedExperimentRevision: 8,
    payload: {
      experimentId: EXPERIMENT_ID,
      variantRevisionRef,
      reason: "Correção factual necessária.",
      participantContinuity: "retain_existing"
    }
  }), (error) => error?.code === "missing_workspace_revision");

  const result = await executeWorkspaceExperimentAction({
    adapter: {
      async manageAuthoringExperiment(args) {
        assert.equal(args.operation, "request_correction");
        assert.equal(args.expectedWorkspaceRevision, 44);
        assert.equal(args.payload.participantContinuity, "retain_existing");
        return {
          workspaceId: WORKSPACE_ID,
          workspaceRevision: 44,
          experimentId: EXPERIMENT_ID,
          experimentRevision: 9,
          state: "correction_required",
          idempotent: false,
          correctionRef: versionedRef(
            "71000000-0000-4000-8000-000000000001",
            "9"
          )
        };
      }
    },
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    operation: "request_correction",
    requestId: "request-correction-0001",
    expectedExperimentRevision: 8,
    expectedWorkspaceRevision: 44,
    payload: {
      experimentId: EXPERIMENT_ID,
      variantRevisionRef,
      reason: "Correção factual necessária.",
      participantContinuity: "retain_existing"
    }
  });
  validateApplication(result);
  assert.equal(result.state, "correction_required");
  assert.deepEqual(result.resultRef, versionedRef(
    "71000000-0000-4000-8000-000000000001",
    "9"
  ));
});

test("ingresso repassa consentimento e usa enrollmentRef em status/withdraw", async () => {
  const calls = [];
  const adapter = {
    async manageAuthoringExperimentEnrollment(args) {
      calls.push(args);
      if (args.operation === "read_policy") {
        return {
          title: "Estudo de granularidade",
          policy: {
            ref: versionedRef("consent-policy"),
            label: "Consentimento informado",
            publicText: "Leia e confirme antes do ingresso."
          }
        };
      }
      if (args.operation === "enroll") {
        return { enrollmentRef: ENROLLMENT_REF, status: "enrolled", selection: null };
      }
      if (args.operation === "status") {
        return {
          enrollmentRef: ENROLLMENT_REF,
          status: "assigned",
          selection: {
            selectionId: SELECTION_ID,
            courseId: COURSE_ID,
            contentHash: HASH,
            readerTarget: { courseId: COURSE_ID, contentHash: HASH }
          }
        };
      }
      return { enrollmentRef: ENROLLMENT_REF, status: "withdrawn", selection: null };
    }
  };
  const policy = await executeExperimentEnrollmentAction({
    adapter, principal: PRINCIPAL, operation: "read_policy", enrollmentCode: "CODE_12345678"
  });
  validateApplication(policy, "ingressarEmExperimentoInstrucional");
  const enrolled = await executeExperimentEnrollmentAction({
    adapter,
    principal: PRINCIPAL,
    operation: "enroll",
    enrollmentCode: "CODE_12345678",
    requestId: "enroll-request-0001",
    consentPolicyRef: versionedRef("consent-policy"),
    consentAcknowledged: true
  });
  validateApplication(enrolled, "ingressarEmExperimentoInstrucional");
  assert.equal(calls[1].consentAcknowledged, true);
  const status = await executeExperimentEnrollmentAction({
    adapter, principal: PRINCIPAL, operation: "status", enrollmentRef: ENROLLMENT_REF
  });
  validateApplication(status, "ingressarEmExperimentoInstrucional");
  assert.equal(status.selection.readerTarget.access, "private");
  const withdrawn = await executeExperimentEnrollmentAction({
    adapter,
    principal: PRINCIPAL,
    operation: "withdraw",
    enrollmentRef: ENROLLMENT_REF,
    requestId: "withdraw-request-0001"
  });
  validateApplication(withdrawn, "ingressarEmExperimentoInstrucional");
  assert.equal(withdrawn.selection, null);
  assert.equal(calls[2].enrollmentCode, null);
  assert.equal(calls[3].enrollmentCode, null);
});

test("experiment_context faz discovery parent→target sem dados sensíveis", async () => {
  const experimentRef = versionedRef(EXPERIMENT_ID, "7");
  const variantRevisionRef = versionedRef("variant-a", "3");
  const collectionRefs = Object.freeze({
    factor_targets: versionedRef("context-factor-targets", "7"),
    locks: versionedRef("context-locks", "7"),
    resource_sets: versionedRef("context-resource-sets", "7"),
    target_paths: versionedRef("context-target-paths", "7"),
    difference_runs: versionedRef("context-difference-runs", "7")
  });
  const collectionItems = Object.freeze({
    factor_targets: Array.from({ length: 25 }, (_, index) => ({
      factorId: "novelty-ceiling",
      targetOrdinal: index + 1,
      kind: "microsequence",
      ref: `micro-${index + 1}`
    })),
    locks: Array.from({ length: 33 }, (_, index) => ({
      assignmentRef: versionedRef(`assignment-${index + 1}`),
      definitionRef: versionedRef("novelty-definition"),
      factorId: "novelty-ceiling",
      targetOrdinal: index + 1,
      scope: { kind: "microsequence", ref: `micro-${index + 1}` }
    })),
    resource_sets: Array.from({ length: 25 }, (_, index) => (
      versionedRef(`resource-set-${index + 1}`)
    )),
    target_paths: Array.from({ length: 25 }, (_, index) => ({
      entityType: "microsequence",
      entityPath: ["course-a", "module-a", "lesson-a", `micro-${index + 1}`],
      label: `Micro ${index + 1}`
    })),
    difference_runs: Array.from({ length: 33 }, (_, index) => ({
      differenceRunRef: versionedRef(`difference-run-${index + 1}`, HASH),
      baselineRef: {
        kind: index === 0 ? "base" : "variant_revision",
        ref: versionedRef(`baseline-${index + 1}`, HASH)
      },
      hunkCount: 33,
      recordedCount: 33,
      classifiedCount: index,
      status: index >= 25 ? "classified" : "classification_pending"
    }))
  });
  const collectionPage = (name, selected, cursor, limit) => {
    const items = collectionItems[name];
    const offset = Number(cursor || 0);
    const pageItems = name === selected ? items.slice(offset, offset + limit) : [];
    const nextOffset = offset + pageItems.length;
    return {
      setRef: collectionRefs[name],
      items: pageItems,
      count: items.length,
      nextCursor: name === selected && nextOffset < items.length
        ? String(nextOffset)
        : null,
      truncated: name === selected ? nextOffset < items.length : items.length > 0
    };
  };
  const adapter = {
    async getAuthoringExperimentContext({
      experimentRef: requested,
      workspaceId,
      differenceRunRef,
      collection,
      collectionSetRef,
      collectionCursor,
      collectionLimit = 20
    }) {
      if (!requested && workspaceId !== CHILD_WORKSPACE_ID) {
        return {
          workspace: { id: WORKSPACE_ID, title: "Workspace pai", revision: 31 },
          variantSetRef: versionedRef("context-set-a", "31"),
          variants: {
            items: [{
              experimentRef,
              variantRevisionRef,
              experimentLabel: "Granularidade",
              conditionLabel: "Condição A",
              status: "ready",
              scope: { kind: "course", ref: "course-a" },
              targetLabel: "Variante A"
            }],
            count: 1,
            nextCursor: null,
            truncated: false
          }
        };
      }
      const selectedCollection = differenceRunRef == null
        ? collection || "factor_targets"
        : null;
      if (collectionSetRef != null) {
        assert.deepEqual(collectionSetRef, collectionRefs[selectedCollection]);
      }
      const result = {
        workspace: { id: WORKSPACE_ID, title: "Workspace pai", revision: 31 },
        experimentContext: {
          experimentRef,
          experimentRevision: 7,
          status: "ready",
          baseRef: versionedRef("publication-base", "4"),
          protocolRef: versionedRef(EXPERIMENT_ID, "7"),
          conditionRef: versionedRef("condition-a"),
          variantRevisionRef,
          scope: { kind: "course", ref: "course-a" },
          factors: [{
            factorId: "novelty-ceiling",
            definitionRef: versionedRef("novelty-definition"),
            kind: "parameter",
            targetCount: 25,
            value: { kind: "integer", value: 2 },
            resourceSetRef: null
          }],
          factorTargets: collectionPage(
            "factor_targets", selectedCollection, collectionCursor, collectionLimit
          ),
          invariants: ["sources", "targets", "analysis", "structure"],
          locks: collectionPage(
            "locks", selectedCollection, collectionCursor, collectionLimit
          ),
          resourceSetRefs: collectionPage(
            "resource_sets", selectedCollection, collectionCursor, collectionLimit
          ),
          currentness: {
            base: true, protocol: true, condition: true, variant: true, design: true
          },
          mandate: {
            mandateRef: versionedRef("mandate-a", "2"),
            status: "active",
            conditionRef: versionedRef("condition-a"),
            variantRevisionRef
          },
          targetWorkspaceId: CHILD_WORKSPACE_ID,
          targetPaths: collectionPage(
            "target_paths", selectedCollection, collectionCursor, collectionLimit
          ),
          differenceRuns: collectionPage(
            "difference_runs", selectedCollection, collectionCursor, collectionLimit
          ),
          collection: selectedCollection,
          collectionSetRef: selectedCollection == null
            ? null
            : collectionRefs[selectedCollection]
        }
      };
      if (differenceRunRef) {
        result.experimentContext.differences = {
          differenceRunRef,
          items: [{
            differenceRef: DIFFERENCE_HUNK_REF,
            ordinal: 1,
            path: ["/cards/@id%3Apractice/text"],
            kind: "changed",
            factualSummary: "before=\"curto\"\nafter=\"desenvolvido\"",
            beforeHash: "c".repeat(64),
            afterHash: "d".repeat(64),
            evidenceRefs: ["manifest:candidate"],
            classification: null
          }],
          count: 1,
          nextCursor: null,
          truncated: false
        };
      }
      return result;
    }
  };
  const discovery = await readAuthoringExperimentContext({
    adapter, principal: PRINCIPAL, workspaceId: WORKSPACE_ID
  });
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    outputEnvelope(discovery)
  ));
  assert.equal(discovery.result.mode, "discovery");
  const discoverySetRef = discovery.result.variantSetRef;
  const discoveryPage2 = await readAuthoringExperimentContext({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    variantSetRef: discoverySetRef,
    cursor: "opaque-discovery-page-2"
  });
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    outputEnvelope(discoveryPage2)
  ));
  assert.deepEqual(discoveryPage2.result.variantSetRef, discoverySetRef);
  const target = await readAuthoringExperimentContext({
    adapter,
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    experimentRef,
    variantRevisionRef
  });
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    outputEnvelope(target)
  ));
  assert.equal(target.result.experimentContext.targetWorkspaceId, CHILD_WORKSPACE_ID);
  assert.equal(target.result.experimentContext.factorTargets.items.length, 20);
  assert.equal(target.result.experimentContext.factorTargets.nextCursor, "20");
  const collectionFields = {
    factor_targets: "factorTargets",
    locks: "locks",
    resource_sets: "resourceSetRefs",
    target_paths: "targetPaths",
    difference_runs: "differenceRuns"
  };
  for (const [collection, field] of Object.entries(collectionFields)) {
    const firstPage = await readAuthoringExperimentContext({
      adapter,
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      experimentRef,
      variantRevisionRef,
      collection,
      collectionLimit: 20
    });
    assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
      "gerirDesenhoInstrucional",
      outputEnvelope(firstPage)
    ));
    const envelope = firstPage.result.experimentContext[field];
    assert.equal(envelope.items.length, 20);
    assert.equal(envelope.nextCursor, "20");
    if (collection === "locks") {
      assert.equal(Object.hasOwn(envelope.items[0], "value"), false);
    }
    const secondPage = await readAuthoringExperimentContext({
      adapter,
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      experimentRef,
      variantRevisionRef,
      collection,
      collectionSetRef: envelope.setRef,
      collectionCursor: envelope.nextCursor,
      collectionLimit: 20
    });
    assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
      "gerirDesenhoInstrucional",
      outputEnvelope(secondPage)
    ));
    assert.equal(
      envelope.items.length + secondPage.result.experimentContext[field].items.length,
      collectionItems[collection].length
    );
    assert.equal(
      new TextEncoder().encode(JSON.stringify(firstPage)).byteLength < 90 * 1024,
      true
    );
  }
  const normalizedCollection = validateWorkspaceDesignActionPayload({
    operation: "read_slice",
    view: "experiment_context",
    experimentRef,
    variantRevisionRef,
    collection: "locks",
    collectionSetRef: collectionRefs.locks,
    collectionCursor: "20",
    collectionLimit: 20
  });
  assert.equal(normalizedCollection.collection, "locks");
  assert.deepEqual(normalizedCollection.collectionSetRef, collectionRefs.locks);
  const childTarget = await readAuthoringExperimentContext({
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID
  });
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    outputEnvelope(childTarget)
  ));
  assert.equal(childTarget.result.mode, "target");
  const differencePage = await readAuthoringExperimentContext({
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    experimentRef,
    variantRevisionRef,
    differenceRunRef: DIFFERENCE_RUN_REF,
    limit: 20
  });
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    outputEnvelope(differencePage)
  ));
  assert.equal(differencePage.result.nextAction, "classify_experiment_diff");
  assert.deepEqual(
    differencePage.result.experimentContext.differences.items[0].differenceRef,
    DIFFERENCE_HUNK_REF
  );
  assert.deepEqual(
    validateWorkspaceDesignActionPayload({
      operation: "read_slice",
      view: "experiment_context",
      experimentRef,
      variantRevisionRef,
      differenceRunRef: DIFFERENCE_RUN_REF,
      cursor: "opaque-hunk-page-2",
      limit: 20
    }).differenceRunRef,
    DIFFERENCE_RUN_REF
  );
  assert.equal(
    /seed|participant|consent|instrument|outcome/iu.test(JSON.stringify(target)),
    false
  );
});

test("registro factual deriva hunks e retoma após resposta perdida sem repetir prefixo", async () => {
  const experimentRef = versionedRef(EXPERIMENT_ID, "7");
  const variantRevisionRef = versionedRef("variant-a", "3");
  const mandateRef = versionedRef("mandate-a", "2");
  const receipts = new Map();
  const pages = [];
  let sourceCalls = 0;
  let loseSecondPage = true;
  let progress = null;
  let currentExperimentRef = experimentRef;
  const adapter = {
    async getAuthoringExperimentVariantEvidenceInputs(args) {
      sourceCalls += 1;
      assert.match(args.requestId, /^experiment-evidence-inputs:/u);
      assert.match(args.payloadHash, /^[a-f0-9]{64}$/u);
      assert.equal(args.expectedExperimentRevision, 7);
      assert.equal(args.expectedWorkspaceRevision, 19);
      assert.deepEqual(args.scopePath, PATH);
      return {
        idempotent: sourceCalls > 1,
        targetWorkspaceId: CHILD_WORKSPACE_ID,
        experimentRef: currentExperimentRef,
        protocolRef: versionedRef(EXPERIMENT_ID, "7"),
        conditionRef: versionedRef("condition-a", "1"),
        variantRevisionRef,
        mandateRef,
        algorithmRef: {
          id: "canonical-json-pointer-fnv1a64-diff",
          version: "2.0.0"
        },
        candidate: {
          artifactRef: versionedRef("candidate-artifact", HASH),
          artifact: evidenceArtifact(HASH, "candidate"),
          evidenceRefs: ["manifest:candidate", "audit:candidate"]
        },
        baselines: [{
          baselineRef: {
            kind: "base",
            ref: versionedRef("base-artifact", "c".repeat(64))
          },
          artifact: evidenceArtifact("c".repeat(64), "base"),
          evidenceRefs: ["publication:base"],
          ...(progress ? { progress } : {})
        }]
      };
    },
    async loadAuthoringExperimentEvidenceArtifact({ artifact }) {
      return artifact.hash === HASH
        ? { values: Array.from({ length: 25 }, () => 1) }
        : { values: Array.from({ length: 25 }, () => 0) };
    },
    async registerAuthoringExperimentVariantEvidencePage(args) {
      pages.push(args);
      const replay = receipts.get(args.requestId);
      if (replay) return { ...structuredClone(replay), idempotent: true };
      assert.ok(args.hunks.length <= 20);
      assert.equal(Object.hasOwn(args, "evidence"), false);
      assert.match(args.differenceRunRef.id, /^[0-9a-f-]{36}$/u);
      assert.equal(args.differenceRunRef.version.length, 64);
      for (const hunk of args.hunks) {
        assert.match(hunk.differenceId, /^h-[a-f0-9]{16}$/u);
        assert.match(hunk.differenceRef.id, /^h-[a-f0-9]{32}$/u);
        assert.match(hunk.differenceRef.version, /^[a-f0-9]{64}$/u);
        assert.equal(new TextEncoder().encode(hunk.factualSummary).byteLength <= 1_000, true);
        assert.deepEqual(hunk.path.length, 1);
      }
      const recordedCount = Math.min(args.pageOrdinal * 20, args.hunkCount);
      const receipt = {
        experimentRevision: 7 + args.pageOrdinal,
        variantRevisionRef,
        differenceRunRef: args.differenceRunRef,
        recordedCount,
        pendingCount: args.hunkCount - recordedCount,
        status: recordedCount === args.hunkCount ? "complete" : "partial",
        idempotent: false
      };
      receipts.set(args.requestId, receipt);
      currentExperimentRef = versionedRef(
        EXPERIMENT_ID,
        String(receipt.experimentRevision)
      );
      progress = {
        differenceRunRef: args.differenceRunRef,
        firstMissingPageOrdinal: args.pageOrdinal + 1,
        recordedCount,
        expectedCount: args.hunkCount,
        pageCount: args.pageCount,
        complete: recordedCount === args.hunkCount
      };
      if (args.pageOrdinal === 2 && loseSecondPage) {
        loseSecondPage = false;
        throw new Error("Resposta da segunda página perdida.");
      }
      return receipt;
    }
  };
  const options = {
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    requestId: "register-evidence-lost-response-0001",
    expectedRevision: 19,
    microsequencePath: PATH,
    payload: { experimentRef, variantRevisionRef, mandateRef }
  };
  const yielded = await registerAuthoringExperimentVariantEvidence({
    ...options,
    requestId: "register-evidence-short-deadline-0001",
    deadlineAt: Date.now() + 9_000
  });
  assert.equal(yielded.result.complete, false);
  assert.equal(yielded.result.recorded, 0);
  assert.equal(yielded.result.expected, 0);
  assert.equal(pages.length, 0);
  await assert.rejects(
    registerAuthoringExperimentVariantEvidence(options),
    /Resposta da segunda página perdida/u
  );
  const replay = await registerAuthoringExperimentVariantEvidence(options);
  assert.equal(replay.replayed, true);
  assert.equal(replay.result.recorded, 25);
  assert.equal(replay.result.expected, 25);
  assert.equal(replay.result.complete, true);
  assert.equal(replay.result.experimentRef.version, "9");
  assert.equal(replay.result.differenceRunRefs.length, 1);
  assert.equal(new TextEncoder().encode(JSON.stringify(replay)).byteLength < 90 * 1024, true);
  assert.equal(sourceCalls, 3);
  assert.equal(pages.length, 2);
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    outputEnvelope(replay)
  ));
  await assert.rejects(registerAuthoringExperimentVariantEvidence({
    ...options,
    requestId: "register-evidence-forged-hunks-0001",
    payload: {
      ...options.payload,
      hunks: [{ differenceId: "invented" }]
    }
  }), (error) => error?.code === "invalid_experiment_evidence_request");
});

test("registro factual cobre zero e cinco mil hunks sem ampliar o receipt público", async () => {
  const run = async ({ baselineValue, candidateValue, requestId }) => {
    let experimentRef = versionedRef(EXPERIMENT_ID, "7");
    const variantRevisionRef = versionedRef("variant-limit", "1");
    const mandateRef = versionedRef("mandate-limit", "1");
    const pages = [];
    let progress = null;
    const adapter = {
      async getAuthoringExperimentVariantEvidenceInputs() {
        return {
          idempotent: false,
          targetWorkspaceId: CHILD_WORKSPACE_ID,
          experimentRef,
          variantRevisionRef,
          mandateRef,
          algorithmRef: {
            id: "canonical-json-pointer-fnv1a64-diff",
            version: "2.0.0"
          },
          candidate: {
            artifactRef: versionedRef("candidate-limit", "d".repeat(64)),
            artifact: evidenceArtifact("d".repeat(64), "candidate-limit"),
            evidenceRefs: []
          },
          baselines: [{
            baselineRef: {
              kind: "base",
              ref: versionedRef("base-limit", "e".repeat(64))
            },
            artifact: evidenceArtifact("e".repeat(64), "base-limit"),
            evidenceRefs: [],
            ...(progress ? { progress } : {})
          }]
        };
      },
      async loadAuthoringExperimentEvidenceArtifact({ artifact }) {
        return artifact.hash === "d".repeat(64) ? candidateValue : baselineValue;
      },
      async registerAuthoringExperimentVariantEvidencePage(args) {
        pages.push(args);
        const recordedCount = Math.min(args.pageOrdinal * 20, args.hunkCount);
        const pendingCount = Math.max(0, args.hunkCount - recordedCount);
        progress = {
          differenceRunRef: args.differenceRunRef,
          firstMissingPageOrdinal: args.pageOrdinal + 1,
          recordedCount,
          expectedCount: args.hunkCount,
          pageCount: args.pageCount,
          complete: pendingCount === 0
        };
        const receipt = {
          experimentRevision: args.expectedExperimentRevision + 1,
          variantRevisionRef,
          differenceRunRef: args.differenceRunRef,
          recordedCount,
          pendingCount,
          status: args.pageOrdinal === args.pageCount ? "complete" : "partial",
          idempotent: false
        };
        experimentRef = versionedRef(EXPERIMENT_ID, String(receipt.experimentRevision));
        return receipt;
      }
    };
    const invocations = [];
    for (let invocation = 1; invocation <= 20; invocation += 1) {
      const result = await registerAuthoringExperimentVariantEvidence({
        adapter,
        principal: PRINCIPAL,
        workspaceId: CHILD_WORKSPACE_ID,
        requestId: `${requestId}-${invocation}`,
        expectedRevision: 19,
        microsequencePath: PATH,
        payload: { experimentRef, variantRevisionRef, mandateRef }
      });
      invocations.push(result);
      experimentRef = result.result.experimentRef;
      if (result.result.complete) return { result, pages, invocations };
      assert.equal(
        result.result.nextAction,
        "reread_context_and_repeat_registration"
      );
    }
    throw new Error("O registro factual não convergiu.");
  };
  const empty = await run({
    baselineValue: { values: [] },
    candidateValue: { values: [] },
    requestId: "register-evidence-zero-hunks-0001"
  });
  assert.equal(empty.pages.length, 1);
  assert.deepEqual(empty.pages[0].hunks, []);
  assert.equal(empty.result.result.expected, 0);
  assert.equal(empty.result.result.complete, true);
  assert.equal(empty.invocations.length, 1);

  const maximum = await run({
    baselineValue: {
      values: Array.from({ length: 4_999 }, () => 0),
      publicNote: "á".repeat(2_000)
    },
    candidateValue: {
      values: Array.from({ length: 4_999 }, () => 1),
      publicNote: "🚀".repeat(2_000)
    },
    requestId: "register-evidence-five-thousand-0001"
  });
  assert.equal(maximum.pages.length, 250);
  assert.deepEqual(
    maximum.pages.map(({ pageOrdinal }) => pageOrdinal),
    Array.from({ length: 250 }, (_, index) => index + 1)
  );
  assert.equal(maximum.result.result.recorded, 5_000);
  assert.equal(maximum.result.result.expected, 5_000);
  assert.equal(maximum.result.result.complete, true);
  assert.ok(maximum.invocations.length > 1);
  assert.deepEqual(
    maximum.invocations.map(({ result }) => result.recorded),
    [...maximum.invocations.map(({ result }) => result.recorded)].sort((a, b) => a - b)
  );
  assert.equal(new TextEncoder().encode(JSON.stringify(maximum.result)).byteLength < 90 * 1024, true);
  const summaryBytes = maximum.pages
    .flatMap(({ hunks }) => hunks)
    .map(({ factualSummary }) => new TextEncoder().encode(factualSummary).byteLength);
  assert.equal(Math.max(...summaryBytes) <= 1_000, true);
});

test("registro factual recusa progresso cujo pin de páginas diverge do diff recomputado", async () => {
  const experimentRef = versionedRef(EXPERIMENT_ID, "7");
  const variantRevisionRef = versionedRef("variant-progress", "1");
  const mandateRef = versionedRef("mandate-progress", "1");
  const adapter = {
    async getAuthoringExperimentVariantEvidenceInputs() {
      return {
        targetWorkspaceId: CHILD_WORKSPACE_ID,
        experimentRef,
        variantRevisionRef,
        mandateRef,
        algorithmRef: {
          id: "canonical-json-pointer-fnv1a64-diff",
          version: "2.0.0"
        },
        candidate: {
          artifactRef: versionedRef("candidate-progress", "d".repeat(64)),
          artifact: evidenceArtifact("d".repeat(64), "candidate-progress"),
          evidenceRefs: []
        },
        baselines: [{
          baselineRef: {
            kind: "base",
            ref: versionedRef("base-progress", "e".repeat(64))
          },
          artifact: evidenceArtifact("e".repeat(64), "base-progress"),
          evidenceRefs: [],
          progress: {
            differenceRunRef: null,
            firstMissingPageOrdinal: 1,
            recordedCount: 0,
            expectedCount: 21,
            pageCount: 1,
            complete: false
          }
        }]
      };
    },
    async loadAuthoringExperimentEvidenceArtifact({ artifact }) {
      return artifact.hash === "d".repeat(64)
        ? { values: Array.from({ length: 21 }, () => 1) }
        : { values: Array.from({ length: 21 }, () => 0) };
    },
    async registerAuthoringExperimentVariantEvidencePage() {
      assert.fail("Uma paginação preparada divergente não pode chegar ao registro.");
    }
  };
  await assert.rejects(registerAuthoringExperimentVariantEvidence({
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    requestId: "register-evidence-invalid-progress-0001",
    expectedRevision: 19,
    microsequencePath: PATH,
    payload: { experimentRef, variantRevisionRef, mandateRef }
  }), (error) => error?.code === "experiment_evidence_progress_changed");
});

test("registro factual carrega candidato uma vez e baselines incrementalmente", async () => {
  const experimentRef = versionedRef(EXPERIMENT_ID, "7");
  const variantRevisionRef = versionedRef("variant-stream", "2");
  const mandateRef = versionedRef("mandate-stream", "1");
  const candidateHash = "a".repeat(64);
  const baseHash = "b".repeat(64);
  const previousHash = "c".repeat(64);
  const events = [];
  const values = new Map([
    [candidateHash, { value: 1 }],
    [baseHash, { value: 0 }],
    [previousHash, { value: 2 }]
  ]);
  const adapter = {
    async getAuthoringExperimentVariantEvidenceInputs() {
      return {
        targetWorkspaceId: CHILD_WORKSPACE_ID,
        experimentRef,
        variantRevisionRef,
        mandateRef,
        algorithmRef: {
          id: "canonical-json-pointer-fnv1a64-diff",
          version: "2.0.0"
        },
        candidate: {
          artifactRef: versionedRef("candidate-stream", candidateHash),
          artifact: evidenceArtifact(candidateHash, "candidate-stream"),
          evidenceRefs: []
        },
        baselines: [{
          baselineRef: {
            kind: "variant_revision",
            ref: versionedRef("previous-stream", previousHash)
          },
          artifact: evidenceArtifact(previousHash, "previous-stream"),
          evidenceRefs: []
        }, {
          baselineRef: {
            kind: "base",
            ref: versionedRef("base-stream", baseHash)
          },
          artifact: evidenceArtifact(baseHash, "base-stream"),
          evidenceRefs: []
        }]
      };
    },
    async loadAuthoringExperimentEvidenceArtifact({ artifact }) {
      events.push(`load:${artifact.hash[0]}`);
      return values.get(artifact.hash);
    },
    async registerAuthoringExperimentVariantEvidencePage(args) {
      events.push(`register:${args.baselineRef.kind}`);
      return {
        experimentRevision: args.expectedExperimentRevision + 1,
        recordedCount: 1,
        pendingCount: 0,
        complete: true,
        idempotent: false
      };
    }
  };
  const result = await registerAuthoringExperimentVariantEvidence({
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    requestId: "register-evidence-streaming-0001",
    expectedRevision: 19,
    microsequencePath: PATH,
    payload: { experimentRef, variantRevisionRef, mandateRef }
  });
  assert.deepEqual(events, [
    "load:a",
    "load:b",
    "register:base",
    "load:c",
    "register:variant_revision"
  ]);
  assert.equal(result.result.recorded, 2);
  assert.equal(result.result.complete, true);
});

test("registro factual não relê baselines completas entre retomadas", async () => {
  let experimentRef = versionedRef(EXPERIMENT_ID, "7");
  const variantRevisionRef = versionedRef("variant-many-baselines", "2");
  const mandateRef = versionedRef("mandate-many-baselines", "1");
  const candidateHash = "f".repeat(64);
  const progressByBaseline = new Map();
  const baselineLoadCount = new Map();
  let candidateLoads = 0;
  let pageCalls = 0;
  const baselines = Array.from({ length: 32 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    const hash = (index + 1).toString(16).padStart(64, "0");
    const id = `baseline-many-${suffix}`;
    return {
      baselineRef: {
        kind: index === 0 ? "base" : "variant_revision",
        ref: versionedRef(id, hash)
      },
      artifact: evidenceArtifact(hash, id),
      evidenceRefs: [],
      progress: {
        differenceRunRef: null,
        firstMissingPageOrdinal: 1,
        recordedCount: 0,
        expectedCount: null,
        pageCount: null,
        complete: false
      }
    };
  });
  const adapter = {
    async getAuthoringExperimentVariantEvidenceInputs() {
      return {
        targetWorkspaceId: CHILD_WORKSPACE_ID,
        experimentRef,
        variantRevisionRef,
        mandateRef,
        algorithmRef: {
          id: "canonical-json-pointer-fnv1a64-diff",
          version: "2.0.0"
        },
        candidate: {
          artifactRef: versionedRef("candidate-many-baselines", candidateHash),
          artifact: evidenceArtifact(candidateHash, "candidate-many-baselines"),
          evidenceRefs: []
        },
        baselines: baselines.map((baseline) => ({
          ...baseline,
          progress: progressByBaseline.get(baseline.baselineRef.ref.id)
            || baseline.progress
        }))
      };
    },
    async loadAuthoringExperimentEvidenceArtifact({ artifact }) {
      if (artifact.hash === candidateHash) {
        candidateLoads += 1;
        return { value: "candidate" };
      }
      const baseline = baselines.find((item) => item.artifact.hash === artifact.hash);
      assert.ok(baseline, "O loader só pode receber descriptors preparados.");
      const baselineId = baseline.baselineRef.ref.id;
      baselineLoadCount.set(baselineId, (baselineLoadCount.get(baselineId) || 0) + 1);
      return { value: baselineId };
    },
    async registerAuthoringExperimentVariantEvidencePage(args) {
      pageCalls += 1;
      const baselineId = args.baselineRef.ref.id;
      progressByBaseline.set(baselineId, {
        differenceRunRef: args.differenceRunRef,
        firstMissingPageOrdinal: null,
        recordedCount: args.hunkCount,
        expectedCount: args.hunkCount,
        pageCount: args.pageCount,
        complete: true
      });
      experimentRef = versionedRef(
        EXPERIMENT_ID,
        String(Number(experimentRef.version) + 1)
      );
      return {
        experimentRevision: Number(experimentRef.version),
        differenceRunRef: args.differenceRunRef,
        recordedCount: args.hunkCount,
        pendingCount: 0,
        complete: true,
        idempotent: false
      };
    }
  };
  let result;
  for (let invocation = 1; invocation <= baselines.length; invocation += 1) {
    result = await registerAuthoringExperimentVariantEvidence({
      adapter,
      principal: PRINCIPAL,
      workspaceId: CHILD_WORKSPACE_ID,
      requestId: `register-many-baselines-${String(invocation).padStart(4, "0")}`,
      expectedRevision: 19,
      microsequencePath: PATH,
      payload: { experimentRef, variantRevisionRef, mandateRef },
      evidencePageCallLimit: 1
    });
  }
  assert.equal(result.result.complete, true);
  assert.equal(result.result.recorded, 32);
  assert.equal(result.result.expected, 32);
  assert.equal(result.result.differenceRunRefs.length, 32);
  assert.equal(pageCalls, 32);
  assert.equal(candidateLoads, 32);
  assert.equal(baselineLoadCount.size, 32);
  assert.deepEqual([...baselineLoadCount.values()], Array.from({ length: 32 }, () => 1));

  const loadsBeforeCompleteReplay = {
    candidate: candidateLoads,
    baselines: [...baselineLoadCount.values()].reduce((sum, value) => sum + value, 0)
  };
  const completed = await registerAuthoringExperimentVariantEvidence({
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    requestId: "register-many-baselines-complete-replay",
    expectedRevision: 19,
    microsequencePath: PATH,
    payload: { experimentRef, variantRevisionRef, mandateRef },
    evidencePageCallLimit: 1
  });
  assert.equal(completed.result.complete, true);
  assert.equal(candidateLoads, loadsBeforeCompleteReplay.candidate);
  assert.equal(
    [...baselineLoadCount.values()].reduce((sum, value) => sum + value, 0),
    loadsBeforeCompleteReplay.baselines
  );

  const firstBaselineId = baselines[0].baselineRef.ref.id;
  progressByBaseline.set(firstBaselineId, {
    ...progressByBaseline.get(firstBaselineId),
    differenceRunRef: {
      ...progressByBaseline.get(firstBaselineId).differenceRunRef,
      id: "40000000-0000-4000-8000-000000000099"
    }
  });
  await assert.rejects(registerAuthoringExperimentVariantEvidence({
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    requestId: "register-many-baselines-forged-complete-progress",
    expectedRevision: 19,
    microsequencePath: PATH,
    payload: { experimentRef, variantRevisionRef, mandateRef },
    evidencePageCallLimit: 1
  }), (error) => error?.code === "experiment_evidence_progress_changed");
  assert.equal(candidateLoads, loadsBeforeCompleteReplay.candidate);
});

test("classificação pública fica presa ao child, target e mandate exatos", async () => {
  const experimentRef = versionedRef(EXPERIMENT_ID, "7");
  const variantRevisionRef = versionedRef("variant-a", "3");
  const mandateRef = versionedRef("mandate-a", "2");
  let recorded = null;
  const adapter = {
    async getAuthoringExperimentContext({ workspaceId, scopePath }) {
      assert.equal(workspaceId, CHILD_WORKSPACE_ID);
      assert.deepEqual(scopePath, PATH);
      return {
        experimentContext: {
          experimentRef,
          variantRevisionRef,
          targetWorkspaceId: CHILD_WORKSPACE_ID,
          targetPaths: { items: [{ entityPath: PATH }] },
          mandate: { mandateRef }
        }
      };
    },
    async recordAuthoringExperimentDiffClassifications(args) {
      if (args.mandateRef.id !== mandateRef.id) {
        const error = new Error("Mandato experimental mudou.");
        error.code = "experiment_mandate_context_changed";
        throw error;
      }
      recorded = args;
      return {
        revision: 20,
        replayed: false,
        variantRevisionRef,
        differenceRunRef: DIFFERENCE_RUN_REF,
        classificationRef: versionedRef("classification-a"),
        status: "classified",
        recordedCount: 1,
        pendingCount: 0
      };
    }
  };
  const result = await recordAuthoringExperimentDiffClassification({
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    requestId: "classify-difference-0001",
    expectedRevision: 19,
    microsequencePath: PATH,
    payload: {
      experimentRef,
      variantRevisionRef,
      differenceRunRef: DIFFERENCE_RUN_REF,
      mandateRef,
      classifications: [{
        differenceRef: DIFFERENCE_HUNK_REF,
        classification: "directly_required",
        publicRationale: "Exigido diretamente pela condição.",
        evidenceRefs: ["card-a"]
      }]
    }
  });
  assert.equal(recorded.workspaceId, CHILD_WORKSPACE_ID);
  assert.deepEqual(recorded.mandateRef, mandateRef);
  assert.deepEqual(recorded.differenceRunRef, DIFFERENCE_RUN_REF);
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirDesenhoInstrucional",
    outputEnvelope(result)
  ));

  await assert.rejects(
    recordAuthoringExperimentDiffClassification({
      adapter,
      principal: PRINCIPAL,
      workspaceId: CHILD_WORKSPACE_ID,
      requestId: "classify-difference-0002",
      expectedRevision: 19,
      microsequencePath: PATH,
      payload: {
        experimentRef,
        variantRevisionRef,
        differenceRunRef: DIFFERENCE_RUN_REF,
        mandateRef: versionedRef("wrong-mandate", "2"),
        classifications: [{
          differenceRef: DIFFERENCE_HUNK_REF,
          classification: "directly_required",
          publicRationale: "Rationale",
          evidenceRefs: ["card-a"]
        }]
      }
    }),
    (error) => error?.code === "experiment_mandate_context_changed"
  );
});

test("retry de classificação consulta o ledger antes de contexto ou mandato mutáveis", async () => {
  const experimentRef = versionedRef(EXPERIMENT_ID, "7");
  const variantRevisionRef = versionedRef("variant-a", "3");
  const mandateRef = versionedRef("mandate-a", "2");
  const classificationRef = versionedRef("classification-a", "1");
  let contextReads = 0;
  let rpcCalls = 0;
  let stateChanged = false;
  const adapter = {
    async getAuthoringExperimentContext() {
      contextReads += 1;
      if (stateChanged) throw new Error("O mandato já foi limpo.");
      return null;
    },
    async recordAuthoringExperimentDiffClassifications(args) {
      rpcCalls += 1;
      assert.equal(args.requestId, "classify-lost-response-0001");
      if (rpcCalls === 1) stateChanged = true;
      return {
        revision: 20,
        replayed: rpcCalls > 1,
        variantRevisionRef,
        differenceRunRef: DIFFERENCE_RUN_REF,
        classificationRef,
        status: "classified",
        recordedCount: 1,
        pendingCount: 0
      };
    }
  };
  const options = {
    adapter,
    principal: PRINCIPAL,
    workspaceId: CHILD_WORKSPACE_ID,
    requestId: "classify-lost-response-0001",
    expectedRevision: 19,
    microsequencePath: PATH,
    payload: {
      experimentRef,
      variantRevisionRef,
      differenceRunRef: DIFFERENCE_RUN_REF,
      mandateRef,
      classifications: [{
        differenceRef: DIFFERENCE_HUNK_REF,
        classification: "directly_required",
        publicRationale: "Exigido diretamente pela condição.",
        evidenceRefs: ["card-a"]
      }]
    }
  };
  const first = await recordAuthoringExperimentDiffClassification(options);
  const replay = await recordAuthoringExperimentDiffClassification(options);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result.classificationRef, classificationRef);
  assert.equal(contextReads, 0);
  assert.equal(rpcCalls, 2);
});
