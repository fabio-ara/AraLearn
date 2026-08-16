import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthoringWorkspaceEngine } from "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js";
import {
  executeAuthoringTool
} from "../../supabase/functions/_shared/aralearn-authoring/authoringToolExecutor.js";
import {
  executeAuthoringRoute
} from "../../supabase/functions/_shared/aralearn-authoring/authoringRouter.js";
import {
  applyContinuityStateOperation,
  buildWorkspaceResumeProjection,
  normalizeContinuityState,
  validateFindingOperation
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceContinuity.js";
import {
  authoringMcpToolDefinition,
  AUTHORING_WORKSPACE_MCP_TOOLS,
  mapAuthoringMcpToolCall,
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  validateWorkspaceContinuityActionPayload,
  workspaceRoute
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";
import {
  buildWorkspaceOutlineFromRows,
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const FINDING_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = { actorId: ACTOR_ID, authenticationKind: "oauth" };

async function mutationFixture() {
  const document = JSON.parse(await readFile(
    new URL(
      "../fixtures/package/project-visual.json",
      import.meta.url
    ),
    "utf8"
  ));
  const lesson = document.courses[0].modules[0].lessons[0];
  lesson.microsequences[0].cards[0] = {
    id: "card-composite-targets",
    position: lesson.microsequences[0].cards[0].position,
    title: "Regra e código",
    role: "theory",
    content: [
      {
        id: "instruction",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Complete a condição." }
      },
      {
        id: "code",
        package: "aralearn.resource.code",
        version: "1.0.0",
        data: {
          prompt: "Complete a condição.",
          language: "python",
          code: "if nota >= 6:\n    aprovar()"
        }
      }
    ],
    response: null,
    feedback: [{
      id: "feedback",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Feedback explicativo." }
    }],
    topics: [],
    sources: []
  };
  lesson.microsequences[0].cards[1] = {
    ...structuredClone(lesson.microsequences[0].cards[0]),
    id: "card-composite-peer",
    position: lesson.microsequences[0].cards[1].position,
    title: "Outro card com os mesmos IDs locais"
  };
  const cloned = structuredClone(lesson.microsequences[0]);
  cloned.id = "micro-merge-source";
  cloned.title = "Origem da junção";
  cloned.cards = [];
  lesson.microsequences.push(cloned);
  const moveTargetLesson = structuredClone(lesson);
  moveTargetLesson.id = "lesson-move-target";
  moveTargetLesson.title = "Destino da movimentação";
  moveTargetLesson.microsequences = [];
  document.courses[0].modules[0].lessons.push(moveTargetLesson);
  return document;
}

function mutationReference(document, revision = 7) {
  const entities = flattenWorkspaceDocument(document).map((item, index) => ({
    ...item,
    version: index + 1
  }));
  return {
    workspaceId: WORKSPACE_ID,
    title: "Curso em construção",
    revision,
    currentRevision: revision,
    entityCount: entities.length,
    sourceCourseId: null,
    sourceRevisionHash: null,
    sourceSubmissionId: null,
    publications: [],
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    idempotent: false,
    brief: "Público iniciante.",
    purpose: "Produzir o curso em colaboração.",
    workspaceKind: "personal",
    visibility: "private",
    role: "owner",
    capabilities: {
      author: true,
      review: true,
      comment: true,
      publish: true,
      manage: true
    },
    entities
  };
}

function row(entityType, entityId, parentType, parentId, position, content) {
  return {
    entityType, entityId, parentType, parentId, position, content, version: 1
  };
}

function reference({ revision = 7, includeCardContent = true } = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    title: "Curso em construção",
    revision,
    currentRevision: revision,
    entityCount: 9,
    sourceCourseId: null,
    sourceRevisionHash: null,
    sourceSubmissionId: null,
    publications: [],
    createdAt: "2026-08-09T10:00:00.000Z",
    updatedAt: "2026-08-09T10:00:00.000Z",
    idempotent: false,
    brief: "Público iniciante e fonte oficial.",
    purpose: "Produzir o curso em colaboração.",
    workspaceKind: "personal",
    visibility: "private",
    role: "owner",
    capabilities: {
      author: true,
      review: true,
      comment: true,
      publish: true,
      manage: true
    },
    entities: [
      row("project", "project", null, null, 0, { title: "Projeto" }),
      row("course", "course-a", "project", "project", 0, {
        title: "Curso A", goal: "Aprender A"
      }),
      row("module", "module-a", "course", "course-a", 0, {
        title: "Módulo A", goal: "Compreender A"
      }),
      row("lesson", "lesson-a", "module", "module-a", 0, {
        title: "Lição A", goal: "Aplicar A"
      }),
      row("microsequence", "micro-a", "lesson", "lesson-a", 0, {
        title: "Micro A", goal: "Distinguir A", role: "explain", status: "ready"
      }),
      row("microsequence", "micro-b", "lesson", "lesson-a", 1, {
        title: "Micro B", goal: "Praticar A", role: "practice", status: "planned"
      }),
      row("microsequence", "micro-c", "lesson", "lesson-a", 2, {
        title: "Micro C", goal: "Revisar A", role: "review", status: "planned"
      }),
      row("microsequence", "micro-d", "lesson", "lesson-a", 3, {
        title: "Micro D", goal: "Apoiar A", role: "support", status: "planned"
      }),
      row("card", "card-a", "microsequence", "micro-a", 1,
        includeCardContent
          ? {
            title: "Card A",
            role: "theory",
            content: [{
              id: "paragraph-a",
              package: "aralearn.resource.paragraph",
              version: "1.0.0",
              data: { text: "A" }
            }],
            response: null,
            feedback: [{
              id: "support-a",
              package: "aralearn.resource.paragraph",
              version: "1.0.0",
              data: { text: "B" }
            }],
            topics: [],
            sources: []
          }
          : { title: "Card A" })
    ]
  };
}

function continuity(overrides = {}) {
  return {
    revision: 7,
    authoringState: {
      version: 1,
      parts: ["a", "b", "c", "d"].map((suffix) => ({
        id: `part-${suffix}`,
        title: `Parte ${suffix.toUpperCase()}`,
        microsequenceIds: [`micro-${suffix}`]
      })),
      decisions: [{
        id: "decision-a", summary: "Manter a progressão.",
        entityType: "course", entityId: "course-a"
      }],
      mandate: {
        id: "mandate-current",
        kind: "build_part",
        targetPartId: "part-a",
        decidedAtRevision: 6
      }
    },
    activeFindings: [{
      findingId: FINDING_ID,
      entityType: "resource",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      currentEntityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      targetAvailable: true,
      resourceTargetId: "content:paragraph-a",
      body: "O exemplo está curto.",
      category: "coverage",
      severity: "medium",
      status: "approved",
      proposedRepair: "Ampliar o exemplo.",
      findingCode: "actual_cards_match_artifact_refs",
      findingOrigin: "deterministic",
      ruleRef: { kind: "design_contract", id: "manifest", version: "1" },
      publicEvidence: "O artifactRef declarado não coincide com o card atual.",
      auditPartId: null,
      auditRunRef: { id: ACTOR_ID, version: "1" },
      artifactRefs: {
        analysisRef: { id: "analysis-a", version: "1.0.0" },
        effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
        blueprintRef: { id: "blueprint-a", version: "2.0.0" },
        bindingRef: { id: "binding-a", version: "1.0.0" },
        manifestRef: { id: "manifest-a", version: "1.0.0" },
        resourceSetRefs: {
          items: [{ id: "resource-set-a", version: "1.0.0" }],
          count: 1,
          truncated: false
        },
        microsequenceRefs: {
          items: ["micro-a"],
          count: 1,
          truncated: false
        }
      },
      verificationAuditRunRef: null,
      auditRevision: 6,
      pendingCorrectionRequestId: "repair:pending:0001",
      pendingRevision: 7,
      correctionRequestId: null,
      resultingRevision: null,
      verification: null,
      verifiedRevision: null,
      updatedAt: "2026-08-09T10:00:00.000Z"
    }],
    findingSummary: {
      total: 2,
      active: 1,
      byStatus: { open: 0, approved: 1, rejected: 0, repaired: 0, resolved: 1 }
    },
    ...overrides
  };
}

function productState({
  revision = 7,
  authoringState = "audit_pending",
  microsequenceStateMap = {
    "micro-a": "f",
    "micro-b": "p",
    "micro-c": "p",
    "micro-d": "p"
  }
} = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    revision,
    authoringState,
    microsequenceCount: Object.keys(microsequenceStateMap).length,
    analyzedCount: Object.values(microsequenceStateMap).filter((value) => value === "a").length,
    materializedCount: Object.values(microsequenceStateMap)
      .filter((value) => new Set(["m", "r", "f"]).has(value)).length,
    readyCount: Object.values(microsequenceStateMap).filter((value) => value === "r").length,
    activeFindingCount: Object.values(microsequenceStateMap).filter((value) => value === "f").length,
    microsequenceStateMap
  };
}

function planningReference(revision, brief) {
  const value = reference({ revision, includeCardContent: false });
  value.brief = brief;
  value.entities = value.entities.filter(({ entityType }) =>
    !new Set(["microsequence", "card"]).has(entityType));
  value.entities.push(...Array.from({ length: 37 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return row("microsequence", `m${number}`, "lesson", "lesson-a", index, {
      title: `Microssequência ${number}`,
      goal: `Cobrir o recorte ${number}`,
      role: "explain",
      status: "planned"
    });
  }));
  value.entities.push(
    row("card", "card-m13", "microsequence", "m13", 1, { title: "Card 13" }),
    row("card", "card-m15", "microsequence", "m15", 1, { title: "Card 15" })
  );
  value.entityCount = value.entities.length;
  return value;
}

const SUBSTITUTE_REPRESENTATION_SELECTION = Object.freeze({
  intent: "Mostrar dependências causais com papéis distintos e leitura vertical.",
  chosen: {
    packageId: "aralearn.resource.graph",
    version: "1.0.0"
  },
  fit: "substitute",
  desiredResource: "diagrama causal especializado",
  catalogVersion: "1-a1b2c3d4",
  limitations: [
    "O package escolhido não distingue causalidade de associação por convenção própria."
  ],
  chatDisclosure: "Usei Grafo como aproximação porque ainda não há um diagrama causal especializado."
});

const PEDAGOGICAL_DIAGNOSIS = Object.freeze({
  difficultyResponses: [{
    difficulty: "Sem laboratório, comandos podem ficar sem consequência observável.",
    response: "Mostrar uma sessão textual com erro, correção e novo estado."
  }]
});

test("decisão preserva escolha e substituição de resource fora do envelope do card", () => {
  const mapped = mapAuthoringMcpToolCall("gerirContinuidadeDaAutoria", {
    requestId: "continuity:representation:0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    operation: "record_decision",
    decisionId: "representation-card-a",
    summary: "Preservar a intenção representacional para revisão futura.",
    entityType: "card",
    entityId: "card-a",
    representationSelection: SUBSTITUTE_REPRESENTATION_SELECTION
  });
  assert.deepEqual(
    mapped.body.arguments.representationSelection,
    SUBSTITUTE_REPRESENTATION_SELECTION
  );
  const payload = validateWorkspaceContinuityActionPayload(mapped.body);
  const next = applyContinuityStateOperation({
    state: continuity().authoringState,
    operation: payload.operation,
    arguments: payload.arguments,
    reference: reference(),
    continuity: continuity(),
    expectedRevision: payload.expectedRevision
  });
  const decision = next.decisions.find(({ id }) => id === "representation-card-a");
  assert.deepEqual(decision.representationSelection, SUBSTITUTE_REPRESENTATION_SELECTION);

  const projection = buildWorkspaceResumeProjection(reference(), {
    ...continuity(),
    authoringState: next
  });
  assert.deepEqual(
    projection.content.decisions.find(({ id }) => id === decision.id)
      .representationSelection,
    SUBSTITUTE_REPRESENTATION_SELECTION
  );
  const card = reference().entities.find(({ entityType }) => entityType === "card");
  assert.equal(Object.hasOwn(card.content, "representationSelection"), false);
});

test("metadado representacional exige alvo adequado e explicita substituição sem bloquear", () => {
  assert.throws(() => mapAuthoringMcpToolCall("gerirContinuidadeDaAutoria", {
    requestId: "continuity:representation:bad1",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    operation: "record_decision",
    decisionId: "representation-course-a",
    summary: "Alvo estrutural inadequado.",
    entityType: "course",
    entityId: "course-a",
    representationSelection: SUBSTITUTE_REPRESENTATION_SELECTION
  }), ({ code }) => code === "invalid_tool_arguments");

  assert.throws(() => validateWorkspaceContinuityActionPayload({
    requestId: "continuity:representation:bad2",
    expectedRevision: 7,
    operation: "record_decision",
    arguments: {
      id: "representation-card-a",
      summary: "Substituição sem comunicação explícita.",
      entityType: "card",
      entityId: "card-a",
      representationSelection: {
        ...SUBSTITUTE_REPRESENTATION_SELECTION,
        chatDisclosure: null
      }
    }
  }), ({ code }) => code === "invalid_authoring_decision");
});

test("decisão de microssequência persiste diagnóstico aprovado sem conversa ou raciocínio privado", () => {
  const mapped = mapAuthoringMcpToolCall("gerirContinuidadeDaAutoria", {
    requestId: "continuity:diagnosis:0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    operation: "record_decision",
    decisionId: "diagnosis-micro-a",
    summary: "Tornar a interação operacional observável sem laboratório.",
    entityType: "microsequence",
    entityId: "micro-a",
    pedagogicalDiagnosis: PEDAGOGICAL_DIAGNOSIS
  });
  const payload = validateWorkspaceContinuityActionPayload(mapped.body);
  const next = applyContinuityStateOperation({
    state: continuity().authoringState,
    operation: payload.operation,
    arguments: payload.arguments,
    reference: reference(),
    continuity: continuity(),
    expectedRevision: payload.expectedRevision
  });
  const persisted = next.decisions.find(({ id }) => id === "diagnosis-micro-a");
  assert.deepEqual(persisted.pedagogicalDiagnosis, PEDAGOGICAL_DIAGNOSIS);
  assert.equal(Object.hasOwn(persisted, "conversation"), false);
  assert.equal(Object.hasOwn(persisted, "reasoning"), false);

  const resumed = buildWorkspaceResumeProjection(reference(), {
    ...continuity(),
    authoringState: next
  });
  assert.deepEqual(
    resumed.content.decisions.find(({ id }) => id === persisted.id)
      .pedagogicalDiagnosis,
    PEDAGOGICAL_DIAGNOSIS
  );
});

test("diagnóstico compacto exige alvo de microssequência e vínculo dificuldade-resposta", () => {
  assert.throws(() => mapAuthoringMcpToolCall("gerirContinuidadeDaAutoria", {
    requestId: "continuity:diagnosis:bad1",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    operation: "record_decision",
    decisionId: "diagnosis-course-a",
    summary: "Alvo amplo demais.",
    entityType: "course",
    entityId: "course-a",
    pedagogicalDiagnosis: PEDAGOGICAL_DIAGNOSIS
  }), ({ code }) => code === "invalid_tool_arguments");

  assert.throws(() => validateWorkspaceContinuityActionPayload({
    requestId: "continuity:diagnosis:bad2",
    expectedRevision: 7,
    operation: "record_decision",
    arguments: {
      id: "diagnosis-micro-a",
      summary: "Resposta sem dificuldade existente.",
      entityType: "microsequence",
      entityId: "micro-a",
      pedagogicalDiagnosis: {
        ...PEDAGOGICAL_DIAGNOSIS,
        difficultyResponses: []
      }
    }
  }), ({ code }) => code === "invalid_authoring_decision");
});

test("diagnóstico compacto preserva 64 microssequências realistas em 48 KiB", () => {
  const decisions = Array.from({ length: 64 }, (_, index) => ({
    id: `diagnosis-${index}`,
    summary: `Estudo móvel; demanda: acompanhar as relações e decisões da unidade ${index} sem perder cobertura.`,
    entityType: "microsequence",
    entityId: `micro-${index}`,
    pedagogicalDiagnosis: {
      difficultyResponses: [{
        difficulty: `As relações simultâneas da unidade ${index} podem ficar abstratas sem referente observável.`,
        response: "Usar caso observável e camadas; conferir que cada termo surge após o referente e que eventual prática é determinística."
      }]
    }
  }));
  const parts = Array.from({ length: 4 }, (_, partIndex) => ({
    id: `part-${partIndex}`,
    title: `Parte ${partIndex + 1}`,
    microsequenceIds: Array.from(
      { length: 16 },
      (_, index) => `micro-${partIndex * 16 + index}`
    )
  }));
  const normalized = normalizeContinuityState({
    version: 1,
    parts,
    decisions,
    mandate: {
      id: "mandate-build-part-0",
      kind: "build_part",
      targetPartId: "part-0",
      note: "Materializar a Parte aprovada sem extrapolar o plano.",
      decidedAtRevision: 1
    }
  });
  assert.equal(normalized.decisions.length, 64);
  const size = new TextEncoder().encode(JSON.stringify(normalized)).byteLength;
  assert.ok(size > 28 * 1_024, `fixture de escala ficou artificialmente pequena: ${size}`);
  assert.ok(
    size < 48 * 1_024,
    `continuidade realista excedeu 48 KiB: ${size}`
  );
});

test("estado de continuidade é fechado, econômico e limita coleções antes do RPC", () => {
  assert.throws(
    () => normalizeContinuityState({
      version: 1, parts: [], decisions: [], mandate: null, snapshot: {}
    }),
    ({ status, code }) => status === 422 && code === "invalid_authoring_continuity"
  );
  assert.throws(
    () => normalizeContinuityState({
      version: 1,
      parts: Array.from({ length: 65 }, (_, index) => ({
        id: `part-${index}`, title: `Parte ${index}`, microsequenceIds: ["micro-a"]
      })),
      decisions: [], mandate: null
    }),
    ({ status, code }) => status === 422 && code === "authoring_continuity_too_large"
  );
  assert.throws(
    () => normalizeContinuityState({
      version: 1, parts: [],
      decisions: Array.from({ length: 129 }, (_, index) => ({
        id: `decision-${index}`, summary: `Decisão ${index}`
      })),
      mandate: null
    }),
    ({ status, code }) => status === 422 && code === "authoring_continuity_too_large"
  );
  assert.throws(
    () => normalizeContinuityState({
      version: 1,
      parts: [{
        id: "part-a", title: "Parte A",
        microsequenceIds: Array.from({ length: 501 }, (_, index) => `micro-${index}`)
      }],
      decisions: [], mandate: null
    }),
    ({ status, code }) => status === 422 && code === "invalid_authoring_continuity"
  );
});

test("Partes não se sobrepõem e mandato de reparo aceita somente achados aprovados", () => {
  assert.throws(() => applyContinuityStateOperation({
    state: continuity().authoringState,
    operation: "define_part",
    arguments: {
      id: "part-b", title: "Parte B", microsequenceIds: ["micro-a"]
    },
    reference: reference(),
    continuity: continuity(),
    expectedRevision: 7
  }), ({ code }) => code === "overlapping_authoring_parts");

  const approved = applyContinuityStateOperation({
    state: continuity().authoringState,
    operation: "set_mandate",
    arguments: {
      id: "mandate-a", kind: "repair_findings", findingIds: [FINDING_ID]
    },
    reference: reference(),
    continuity: continuity(),
    expectedRevision: 7
  });
  assert.equal(approved.mandate.decidedAtRevision, 7);

  assert.throws(() => applyContinuityStateOperation({
    state: continuity().authoringState,
    operation: "set_mandate",
    arguments: {
      id: "mandate-a", kind: "repair_findings", findingIds: [FINDING_ID]
    },
    reference: reference(),
    continuity: continuity({
      activeFindings: [{ ...continuity().activeFindings[0], status: "open" }]
    }),
    expectedRevision: 7
  }), ({ code }) => code === "authoring_mandate_finding_not_approved");

  assert.throws(() => applyContinuityStateOperation({
    state: continuity().authoringState,
    operation: "set_mandate",
    arguments: {
      id: "mandate-build-complete", kind: "build_part", targetPartId: "part-a"
    },
    reference: reference(),
    continuity: continuity(),
    expectedRevision: 7
  }), ({ code }) => code === "authoring_mandate_part_already_materialized");

  const generatedReference = reference();
  generatedReference.entities.find(({ entityType, entityId }) =>
    entityType === "microsequence" && entityId === "micro-a").content.status = "generated";
  const generatedMandate = applyContinuityStateOperation({
    state: continuity().authoringState,
    operation: "set_mandate",
    arguments: {
      id: "mandate-build-generated", kind: "build_part", targetPartId: "part-a"
    },
    reference: generatedReference,
    continuity: continuity(),
    expectedRevision: 7
  });
  assert.equal(generatedMandate.mandate.id, "mandate-build-generated");
});

test("achado de resource valida o target canônico atual antes de persistir", () => {
  const base = {
    operation: "record_finding",
    reference: reference(),
    continuity: continuity(),
    arguments: {
      entityType: "resource",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      resourceTargetId: "content:paragraph-a",
      category: "coverage",
      severity: "high",
      summary: "Exemplo insuficiente.",
      proposedRepair: "Ampliar o exemplo."
    }
  };
  assert.equal(validateFindingOperation(base).resourceTargetId, "content:paragraph-a");
  assert.throws(
    () => validateFindingOperation({
      ...base,
      arguments: { ...base.arguments, resourceTargetId: "content:missing" }
    }),
    ({ status, code }) => status === 422 && code === "authoring_finding_resource_not_found"
  );
});

test("resume recompõe nova sessão sem cards, chat ou achados encerrados", () => {
  const projection = buildWorkspaceResumeProjection(reference({
    includeCardContent: false
  }), continuity({
    activeFindings: [
      continuity().activeFindings[0],
      { ...continuity().activeFindings[0], findingId: ACTOR_ID, status: "resolved" }
    ]
  }));
  assert.equal(projection.view, "resume");
  assert.deepEqual(projection.content.parts.map(({ id }) => id), [
    "part-a", "part-b", "part-c", "part-d"
  ]);
  assert.equal(projection.content.decisions[0].id, "decision-a");
  assert.equal(projection.content.mandate.id, "mandate-current");
  assert.deepEqual(projection.content.parts[0].microsequenceIds, ["micro-a"]);
  assert.equal(projection.content.parts[0].microsequenceStateMask, "r");
  assert.equal(projection.content.parts[0].readyCount, 1);
  assert.equal(projection.content.parts[0].missingCount, 0);
  assert.equal(projection.content.parts[0].materializedCount, 1);
  assert.equal(projection.content.parts[0].cardCount, 1);
  assert.deepEqual(projection.content.findings.items.map(({ status }) => status), [
    "approved"
  ]);
  assert.equal(projection.content.findings.summary.totalCount, 2);
  assert.equal(
    projection.content.findings.items[0].pendingCorrectionRequestId,
    "repair:pending:0001"
  );
  assert.equal(projection.content.findings.items[0].pendingRevision, 7);
  assert.equal(projection.content.outline.unassignedMicrosequenceCount, 0);
  assert.equal(Object.hasOwn(projection.content, "cards"), false);
  assert.equal(JSON.stringify(projection).includes('"blocks"'), false);
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "lerWorkspaceDeAutoria",
    { ok: true, requestId: null, data: projection }
  ));

  const partialPlan = structuredClone(continuity());
  partialPlan.authoringState.parts = partialPlan.authoringState.parts.slice(0, 1);
  const partialProjection = buildWorkspaceResumeProjection(
    reference({ includeCardContent: false }),
    partialPlan,
    productState({
      microsequenceStateMap: {
        "micro-a": "f", "micro-b": "a", "micro-c": "p", "micro-d": "p"
      }
    })
  );
  assert.deepEqual(partialProjection.content.unassignedMicrosequenceStateMap, {
    "micro-b": "a", "micro-c": "p", "micro-d": "p"
  });

  const expectedHandoff = Array.from({ length: 7 }, (_, index) => ({
    findingId: `${String(index + 20).padStart(8, "0")}-0000-4000-8000-000000000000`,
    summary: `Achado ${index + 1}`,
    proposedRepair: `Reparo ${index + 1}`
  }));
  const handoffProjection = buildWorkspaceResumeProjection(
    reference({ includeCardContent: false }),
    continuity({
      activeFindings: expectedHandoff.map((item) => ({
        ...continuity().activeFindings[0],
        ...item,
        body: item.summary,
        status: "approved"
      })),
      findingSummary: {
        total: 7,
        active: 7,
        byStatus: { open: 0, approved: 7, rejected: 0, repaired: 0, resolved: 0 }
      }
    })
  );
  assert.deepEqual(handoffProjection.content.findings.items.map((finding) => ({
    findingId: finding.observationId,
    summary: finding.summary,
    proposedRepair: finding.proposedRepair
  })), expectedHandoff.slice(0, 5));
  assert.equal(handoffProjection.content.findings.truncated, true);
});

test("MCP preserva trinta tools, substitui o nome antigo e mapeia resume e mutação tipada", async () => {
  assert.equal(AUTHORING_WORKSPACE_MCP_TOOLS.length, 30);
  assert.equal(authoringMcpToolDefinition("atualizarContextoDoWorkspace"), null);
  assert.ok(authoringMcpToolDefinition("gerirContinuidadeDaAutoria"));
  assert.deepEqual(mapAuthoringMcpToolCall("lerWorkspaceDeAutoria", {
    workspaceId: WORKSPACE_ID,
    view: "resume"
  }), {
    method: "GET",
    path: `/v1/workspaces/${WORKSPACE_ID}?view=resume`,
    body: null,
    requestId: null
  });
  const mapped = mapAuthoringMcpToolCall("gerirContinuidadeDaAutoria", {
    requestId: "continuity:part:0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    operation: "define_part",
    partId: "part-b",
    title: "Parte B",
    microsequenceIds: ["micro-b"]
  });
  assert.deepEqual(mapped.body.arguments, {
    id: "part-b", title: "Parte B", microsequenceIds: ["micro-b"]
  });
  assert.equal(
    workspaceRoute("POST", mapped.path).name,
    "manageWorkspaceContinuity"
  );
  assert.deepEqual(validateWorkspaceContinuityActionPayload(mapped.body), mapped.body);
  assert.throws(() => mapAuthoringMcpToolCall("gerirContinuidadeDaAutoria", {
    requestId: "continuity:mandate:bad1",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    operation: "set_mandate",
    mandateId: "mandate-a",
    kind: "build_part"
  }), ({ status, code }) => status === 422 && code === "invalid_tool_arguments");
  assert.doesNotThrow(() => mapAuthoringMcpToolCall(
    "gerirContinuidadeDaAutoria",
    {
      requestId: "continuity:mandate:audit",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 7,
      operation: "set_mandate",
      mandateId: "mandate-a",
      kind: "audit",
      targetPartId: "part-a"
    }
  ));
  assert.throws(() => validateWorkspaceContinuityActionPayload({
    requestId: "continuity:mandate:bad2",
    expectedRevision: 7,
    operation: "set_mandate",
    arguments: { id: "mandate-a", kind: "repair_findings", findingIds: [] }
  }), ({ status }) => status === 422);

  const observations = mapAuthoringMcpToolCall("gerirWorkspaceEducacional", {
    operation: "list_observations",
    workspaceId: WORKSPACE_ID,
    entityTypes: ["card", "resource"],
    kinds: ["audit_finding"],
    statuses: ["open", "approved"]
  });
  const observationUrl = new URL(`https://project.invalid${observations.path}`);
  assert.deepEqual(JSON.parse(observationUrl.searchParams.get("entityTypes")), [
    "card", "resource"
  ]);
  assert.deepEqual(JSON.parse(observationUrl.searchParams.get("kinds")), [
    "audit_finding"
  ]);
  assert.deepEqual(JSON.parse(observationUrl.searchParams.get("statuses")), [
    "open", "approved"
  ]);
  const observationEnvelope = {
    ok: true,
    requestId: null,
    data: {
      workspaceId: WORKSPACE_ID,
      items: [{
        observationId: FINDING_ID,
        workspaceId: WORKSPACE_ID,
        kind: "audit_finding",
        entityType: "card",
        entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
        currentEntityPath: [
          "course-a", "module-a", "lesson-a", "micro-a", "card-a"
        ],
        targetAvailable: true,
        resourceTargetId: null,
        body: "Rever o exemplo.",
        category: "coverage",
        severity: "medium",
        status: "approved",
        proposedRepair: "Ampliar.",
        findingCode: "actual_cards_match_artifact_refs",
        findingOrigin: "deterministic",
        ruleRef: { kind: "design_contract", id: "manifest", version: "1" },
        publicEvidence: "O artifactRef declarado não coincide com o card atual.",
        auditPartId: null,
        auditRunRef: { id: ACTOR_ID, version: "1" },
        artifactRefs: {
          analysisRef: { id: "analysis-a", version: "1.0.0" },
          effectiveSnapshotRef: { id: "snapshot-a", version: "1.0.0" },
          blueprintRef: { id: "blueprint-a", version: "2.0.0" },
          bindingRef: { id: "binding-a", version: "1.0.0" },
          manifestRef: { id: "manifest-a", version: "1.0.0" },
          resourceSetRefs: {
            items: [{ id: "resource-set-a", version: "1.0.0" }],
            count: 1,
            truncated: false
          },
          microsequenceRefs: {
            items: ["micro-a"],
            count: 1,
            truncated: false
          }
        },
        verificationAuditRunRef: null,
        auditRevision: 7,
        pendingCorrectionRequestId: "repair:pending:0001",
        pendingRevision: 8,
        correctionRequestId: null,
        resultingRevision: null,
        verification: null,
        verifiedRevision: null,
        authorId: ACTOR_ID,
        canDelete: false,
        createdAt: "2026-08-09T10:00:00.000Z",
        updatedAt: "2026-08-09T10:00:00.000Z"
      }],
      hasMore: false,
      nextCursor: null,
      summary: {}
    }
  };
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirWorkspaceEducacional",
    observationEnvelope
  ));
  const anonymizedStructuredFinding = structuredClone(observationEnvelope);
  anonymizedStructuredFinding.data.items[0].authorId = null;
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirWorkspaceEducacional",
    anonymizedStructuredFinding
  ));
  const deletableStructuredFinding = structuredClone(observationEnvelope);
  deletableStructuredFinding.data.items[0].canDelete = true;
  assert.throws(() => validateAuthoringMcpToolOutput(
    "gerirWorkspaceEducacional",
    deletableStructuredFinding
  ));
  const missingWorkspaceId = structuredClone(observationEnvelope);
  delete missingWorkspaceId.data.workspaceId;
  assert.throws(() => validateAuthoringMcpToolOutput(
    "gerirWorkspaceEducacional",
    missingWorkspaceId
  ));

  const toolPrincipal = { ...PRINCIPAL, scopes: ["authoring:read"] };
  const observationResult = await executeAuthoringTool({
    adapter: {
      async listWorkspaceObservations() {
        return observationEnvelope.data;
      }
    },
    principal: toolPrincipal,
    name: "gerirWorkspaceEducacional",
    rawArguments: {
      operation: "list_observations",
      workspaceId: WORKSPACE_ID,
      kinds: ["audit_finding"]
    }
  });
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "gerirWorkspaceEducacional",
    { ok: true, ...observationResult }
  ));

  const outlineReference = reference({ includeCardContent: false });
  const { entities, ...outlineControl } = outlineReference;
  const outlineResult = await executeAuthoringTool({
    adapter: {
      async getWorkspace() {
        return {
          ...outlineControl,
          view: "outline",
          content: buildWorkspaceOutlineFromRows(entities)
        };
      }
    },
    principal: toolPrincipal,
    name: "lerWorkspaceDeAutoria",
    rawArguments: { workspaceId: WORKSPACE_ID, view: "outline" }
  });
  assert.equal(
    Object.hasOwn(outlineResult.data.content.courses[0]
      .modules[0].lessons[0].microsequences[0], "status"),
    false
  );
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "lerWorkspaceDeAutoria",
    { ok: true, ...outlineResult }
  ));

  const resumeProjection = buildWorkspaceResumeProjection(
    reference({ includeCardContent: false }),
    continuity()
  );
  const resumeResult = await executeAuthoringTool({
    adapter: {
      async getWorkspace() {
        return resumeProjection;
      }
    },
    principal: toolPrincipal,
    name: "lerWorkspaceDeAutoria",
    rawArguments: { workspaceId: WORKSPACE_ID, view: "resume" }
  });
  assert.equal(resumeResult.data.view, "resume");
  assert.equal(
    Object.hasOwn(resumeResult.data.content.decisions[0], "currentEntityPath"),
    false
  );
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "lerWorkspaceDeAutoria",
    { ok: true, ...resumeResult }
  ));

  const listResult = await executeAuthoringTool({
    adapter: {
      async listWorkspaces() {
        return {
          items: [{
            workspaceId: WORKSPACE_ID,
            title: "Curso em construção",
            purpose: "Produzir o curso em colaboração.",
            workspaceKind: "team",
            visibility: "members",
            role: "admin",
            revision: 7,
            sourceCourseId: null,
            sourceRevisionHash: null,
            sourceSubmissionId: null,
            publicationCount: 0,
            authoringState: "building",
            createdAt: "2026-08-09T10:00:00.000Z",
            updatedAt: "2026-08-09T10:00:00.000Z"
          }],
          hasMore: false,
          nextCursor: null
        };
      }
    },
    principal: toolPrincipal,
    name: "listarWorkspacesDeAutoria",
    rawArguments: {}
  });
  assert.equal(listResult.data.items[0].role, "admin");
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "listarWorkspacesDeAutoria",
    { ok: true, ...listResult }
  ));

  const reviewControl = reference({ includeCardContent: false });
  delete reviewControl.entities;
  const microtheoryResult = await executeAuthoringTool({
    adapter: {
      async getWorkspace() {
        return {
          ...reviewControl,
          view: "microtheories",
          content: { courses: [] }
        };
      }
    },
    principal: toolPrincipal,
    name: "revisarMicroteoriasDoWorkspace",
    rawArguments: {
      workspaceId: WORKSPACE_ID,
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a"]
    }
  });
  assert.equal(microtheoryResult.data.role, "owner");
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "revisarMicroteoriasDoWorkspace",
    { ok: true, ...microtheoryResult }
  ));

  const eventResult = await executeAuthoringTool({
    adapter: {
      async getWorkspaceEvents() {
        return {
          items: [
            {
              revision: 8,
              operation: "update_brief",
              summary: {
                operation: "update_brief", created: 0, updated: 0, deleted: 0
              },
              createdAt: "2026-08-09T10:01:00.000Z"
            },
            {
              revision: 9,
              operation: "update_continuity",
              summary: {
                continuityOperation: "record_approved_plan",
                stateVersion: 1,
                partCount: 4,
                decisionCount: 1,
                mandateId: "mandate-build-p1"
              },
              createdAt: "2026-08-09T10:02:00.000Z"
            },
            {
              revision: 10,
              operation: "create_finding",
              summary: {
                findingId: FINDING_ID,
                findingOperation: "create",
                entityType: "resource",
                category: "coverage",
                severity: "medium",
                status: "open",
                auditRevision: 9
              },
              createdAt: "2026-08-09T10:03:00.000Z"
            },
            {
              revision: 11,
              operation: "decide_finding",
              summary: {
                findingId: FINDING_ID,
                findingOperation: "decide",
                status: "approved",
                correctionRequestId: null,
                resultingRevision: null,
                verifiedRevision: null
              },
              createdAt: "2026-08-09T10:04:00.000Z"
            }
          ]
        };
      }
    },
    principal: toolPrincipal,
    name: "listarAlteracoesRecentesDoWorkspace",
    rawArguments: { workspaceId: WORKSPACE_ID }
  });
  assert.deepEqual(eventResult.data.items.map(({ operation }) => operation), [
    "update_brief", "update_continuity", "create_finding", "decide_finding"
  ]);
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "listarAlteracoesRecentesDoWorkspace",
    { ok: true, ...eventResult }
  ));
});

test("engine usa o RPC compacto, traduz findings e conserva CAS/replay", async () => {
  const calls = [];
  const engine = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid",
    serverApiKey: "secret",
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "get_authoring_workspace_v5") {
        return reference({ includeCardContent: payload.p_include_card_content });
      }
      if (name === "get_authoring_workspace_continuity_v1") return continuity();
      if (name === "get_authoring_workspace_product_states_v1") {
        return { items: [productState()] };
      }
      if (name === "replay_authoring_workspace_request_v5") return null;
      if (name === "manage_authoring_workspace_finding_v1") {
        return {
          workspaceId: WORKSPACE_ID,
          findingId: FINDING_ID,
          findingOperation: "create",
          status: "open",
          revision: 8,
          updatedAt: "2026-08-09T10:01:00.000Z",
          idempotent: false
        };
      }
      throw new Error(`RPC inesperada: ${name}`);
    }
  });

  const resumed = await engine.get({
    principal: PRINCIPAL, workspaceId: WORKSPACE_ID, view: "resume"
  });
  assert.equal(resumed.content.parts[0].id, "part-a");
  assert.equal(resumed.content.parts[0].microsequenceStateMask, "f");
  assert.deepEqual(resumed.content.unassignedMicrosequenceStateMap, {});
  assert.equal(calls[0].payload.p_include_card_content, false);

  const result = await engine.manageContinuity({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "finding:create:0001",
    expectedRevision: 7,
    operation: "record_finding",
    arguments: {
      entityType: "resource",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      resourceTargetId: "content:paragraph-a",
      category: "coverage",
      severity: "high",
      summary: "Exemplo insuficiente.",
      proposedRepair: "Ampliar o exemplo."
    }
  });
  assert.equal(result.observationId, FINDING_ID);
  assert.equal(result.findingOperation, "record_finding");
  const mutation = calls.find(({ name }) =>
    name === "manage_authoring_workspace_finding_v1");
  assert.equal(mutation.payload.p_operation, "create");
  assert.equal(mutation.payload.p_payload.body, "Exemplo insuficiente.");
  assert.equal(Object.hasOwn(mutation.payload.p_payload, "summary"), false);
  assert.equal(
    calls.findLast(({ name }) => name === "get_authoring_workspace_v5")
      .payload.p_include_card_content,
    true
  );
});

test("pagina física de observations preserva o cursor sem ultrapassar o budget", async () => {
  const path = `/v1/workspaces/${WORKSPACE_ID}/observations`;
  const route = workspaceRoute("GET", path);
  let received = null;
  const result = await executeAuthoringRoute({
    request: new Request(`https://edge.example${path}?limit=50`),
    route,
    principal: { ...PRINCIPAL, scopes: ["authoring:read"] },
    adapter: {
      async listWorkspaceObservations(options) {
        received = options;
        return {
          workspaceId: WORKSPACE_ID,
          items: [],
          hasMore: true,
          nextCursor: {
            beforeUpdatedAt: "2026-08-15T12:00:00.000Z",
            beforeId: FINDING_ID
          },
          summary: {}
        };
      }
    }
  });
  assert.equal(received.limit, 5);
  assert.equal(result.data.hasMore, true);
});

test("listagem cerca o estado canônico e não depende de cache já visitado", async () => {
  let listReads = 0;
  let stateReads = 0;
  const engine = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid",
    serverApiKey: "secret",
    rpc: async (name) => {
      if (name === "list_authoring_workspaces_v5") {
        const revision = listReads++ === 0 ? 7 : 8;
        return {
          items: [{
            workspaceId: WORKSPACE_ID,
            title: "Curso em construção",
            revision
          }],
          hasMore: false,
          nextCursor: null
        };
      }
      if (name === "get_authoring_workspace_product_states_v1") {
        stateReads += 1;
        return {
          items: [productState({ revision: 8, authoringState: "building" })]
        };
      }
      throw new Error(`RPC inesperada: ${name}`);
    }
  });
  const result = await engine.list({ principal: PRINCIPAL });
  assert.equal(result.items[0].revision, 8);
  assert.equal(result.items[0].authoringState, "building");
  assert.equal(listReads, 2);
  assert.equal(stateReads, 2);
});

test("engine traduz integralmente os cinco passos públicos do lifecycle de achado", async () => {
  let revision = 7;
  let status = null;
  const mutations = [];
  const engine = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid",
    serverApiKey: "secret",
    rpc: async (name, payload) => {
      if (name === "replay_authoring_workspace_request_v5") return null;
      if (name === "get_authoring_workspace_v5") {
        return reference({
          revision,
          includeCardContent: payload.p_include_card_content
        });
      }
      if (name === "get_authoring_workspace_continuity_v1") {
        return continuity({
          revision,
          activeFindings: status && !new Set(["rejected", "resolved", "deleted"]).has(status)
            ? [{ ...continuity().activeFindings[0], status }]
            : []
        });
      }
      if (name === "manage_authoring_workspace_finding_v1") {
        mutations.push(structuredClone(payload));
        status = {
          create: "open",
          decide: payload.p_payload.decision === "approve" ? "approved" : "rejected",
          link_correction: "repaired",
          verify: payload.p_payload.outcome === "resolved" ? "resolved" : "open",
          delete: "deleted"
        }[payload.p_operation];
        revision += 1;
        return {
          workspaceId: WORKSPACE_ID,
          findingId: FINDING_ID,
          findingOperation: payload.p_operation,
          status,
          revision,
          updatedAt: "2026-08-09T10:01:00.000Z",
          idempotent: false
        };
      }
      throw new Error(`RPC inesperada: ${name}`);
    }
  });

  const base = {
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID
  };
  await engine.manageContinuity({
    ...base,
    requestId: "finding:create:sequence",
    expectedRevision: 7,
    operation: "record_finding",
    arguments: {
      entityType: "resource",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      resourceTargetId: "content:paragraph-a",
      category: "coverage",
      severity: "high",
      summary: "Exemplo insuficiente.",
      proposedRepair: "Ampliar o exemplo."
    }
  });
  await engine.manageContinuity({
    ...base,
    requestId: "finding:decide:sequence",
    expectedRevision: 8,
    operation: "decide_finding",
    arguments: { observationId: FINDING_ID, decision: "approved" }
  });
  await engine.manageContinuity({
    ...base,
    requestId: "finding:link:sequence",
    expectedRevision: 9,
    operation: "link_finding_correction",
    arguments: {
      observationId: FINDING_ID,
      correctionRequestId: "correction:card:sequence"
    }
  });
  await engine.manageContinuity({
    ...base,
    requestId: "finding:verify:sequence",
    expectedRevision: 10,
    operation: "verify_finding",
    arguments: {
      observationId: FINDING_ID,
      outcome: "resolved",
      note: "A reauditoria confirmou o reparo."
    }
  });
  const removed = await engine.manageContinuity({
    ...base,
    requestId: "finding:delete:sequence",
    expectedRevision: 11,
    operation: "delete_finding",
    arguments: { observationId: FINDING_ID }
  });

  assert.equal(removed.observationId, FINDING_ID);
  assert.equal(removed.status, "deleted");
  assert.deepEqual(mutations.map(({ p_operation }) => p_operation), [
    "create", "decide", "link_correction", "verify", "delete"
  ]);
  assert.deepEqual(mutations[0].p_payload, {
    entityType: "resource",
    entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
    resourceTargetId: "content:paragraph-a",
    category: "coverage",
    severity: "high",
    proposedRepair: "Ampliar o exemplo.",
    body: "Exemplo insuficiente."
  });
  assert.deepEqual(mutations[1].p_payload, {
    findingId: FINDING_ID, decision: "approve"
  });
  assert.deepEqual(mutations[2].p_payload, {
    findingId: FINDING_ID, correctionRequestId: "correction:card:sequence"
  });
  assert.deepEqual(mutations[3].p_payload, {
    findingId: FINDING_ID,
    outcome: "resolved",
    verification: "A reauditoria confirmou o reparo."
  });
  assert.deepEqual(mutations[4].p_payload, { findingId: FINDING_ID });
});

test("resume relê uma vez nas duas ordens de corrida e recusa snapshot incoerente", async () => {
  for (const [referenceRevisions, continuityRevisions] of [
    [[7, 8], [8, 8]],
    [[8, 8], [7, 8]]
  ]) {
    let referenceCall = 0;
    let continuityCall = 0;
    const engine = new AuthoringWorkspaceEngine({
      supabaseUrl: "https://project.invalid",
      serverApiKey: "secret",
      rpc: async (name) => {
        if (name === "get_authoring_workspace_v5") {
          return reference({ revision: referenceRevisions[referenceCall++] });
        }
        if (name === "get_authoring_workspace_continuity_v1") {
          return continuity({ revision: continuityRevisions[continuityCall++] });
        }
        if (name === "get_authoring_workspace_product_states_v1") {
          return { items: [productState({ revision: 8 })] };
        }
        throw new Error(`RPC inesperada: ${name}`);
      }
    });
    const result = await engine.get({
      principal: PRINCIPAL, workspaceId: WORKSPACE_ID, view: "resume"
    });
    assert.equal(result.revision, 8);
    assert.equal(referenceCall, 2);
    assert.equal(continuityCall, 2);
  }

  const inconsistent = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid",
    serverApiKey: "secret",
    rpc: async (name) => {
      if (name === "get_authoring_workspace_v5") return reference({ revision: 7 });
      if (name === "get_authoring_workspace_continuity_v1") {
        return continuity({ revision: 8 });
      }
      if (name === "get_authoring_workspace_product_states_v1") {
        return { items: [productState({ revision: 8 })] };
      }
      throw new Error(`RPC inesperada: ${name}`);
    }
  });
  await assert.rejects(inconsistent.get({
    principal: PRINCIPAL, workspaceId: WORKSPACE_ID, view: "resume"
  }), ({ status: errorStatus, code }) =>
    errorStatus === 409 && code === "workspace_snapshot_changed");
});

test("finding além do recorte ativo não é recusado pelo JS e fica para o RPC autoritativo", () => {
  const validated = validateFindingOperation({
    operation: "decide_finding",
    arguments: { observationId: FINDING_ID, decision: "approved" },
    reference: reference(),
    continuity: continuity({
      activeFindings: [],
      activeFindingsTruncated: true
    })
  });
  assert.deepEqual(validated, {
    observationId: FINDING_ID,
    decision: "approved"
  });
});

test("record_approved_plan conserva P1–P4 após troca de brief e nova sessão", async () => {
  const ids = (first, last) => Array.from(
    { length: last - first + 1 },
    (_, index) => `m${String(first + index).padStart(2, "0")}`
  );
  const parts = [
    { id: "p1", title: "Parte 1", microsequenceIds: ids(1, 12) },
    { id: "p2", title: "Parte 2", microsequenceIds: ids(13, 18) },
    { id: "p3", title: "Parte 3", microsequenceIds: ids(19, 26) },
    { id: "p4", title: "Parte 4", microsequenceIds: ids(27, 37) }
  ];
  const planArguments = {
    parts,
    decisions: [{
      id: "decision-approved-plan",
      summary: "Plano aprovado em quatro Partes.",
      entityType: "course",
      entityId: "course-a"
    }],
    mandate: {
      id: "mandate-build-p1",
      kind: "build_part",
      targetPartId: "p1"
    }
  };
  const mapped = mapAuthoringMcpToolCall("gerirContinuidadeDaAutoria", {
    requestId: "continuity:approved-plan:0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 1,
    operation: "record_approved_plan",
    ...planArguments
  });
  assert.deepEqual(mapped.body.arguments, planArguments);
  assert.deepEqual(validateWorkspaceContinuityActionPayload(mapped.body), mapped.body);

  let revision = 1;
  let brief = "Brief completo com P1, P2, P3 e P4.";
  let authoringState = {
    version: 1, parts: [], decisions: [], mandate: null
  };
  let stateWriteCount = 0;
  const rpc = async (name, payload) => {
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return planningReference(revision, brief);
    }
    if (name === "get_authoring_workspace_continuity_v1") {
      return {
        revision,
        authoringState,
        activeFindings: [],
        activeFindingsTruncated: false,
        findingSummary: {
          total: 0,
          active: 0,
          byStatus: { open: 0, approved: 0, rejected: 0, repaired: 0, resolved: 0 }
        },
        structuralObservations: { totalCount: 0, openCount: 0, focus: [] },
        situatedObservations: { totalCount: 0, openCount: 0, focus: [] }
      };
    }
    if (name === "get_authoring_workspace_product_states_v1") {
      return {
        items: [productState({
          revision,
          authoringState: "building",
          microsequenceStateMap: Object.fromEntries(
            Array.from({ length: 37 }, (_, index) => {
              const number = index + 1;
              const id = `m${String(number).padStart(2, "0")}`;
              return [id, new Set([13, 15]).has(number) ? "m" : "p"];
            })
          )
        })]
      };
    }
    if (name === "update_authoring_workspace_continuity_v1") {
      stateWriteCount += 1;
      authoringState = structuredClone(payload.p_state);
      revision += 1;
      return {
        workspaceId: WORKSPACE_ID,
        revision,
        continuityOperation: payload.p_operation,
        stateVersion: 1,
        partCount: authoringState.parts.length,
        decisionCount: authoringState.decisions.length,
        mandateId: authoringState.mandate?.id || null,
        updatedAt: "2026-08-09T10:01:00.000Z",
        idempotent: false
      };
    }
    if (name === "update_authoring_workspace_brief_v5") {
      brief = payload.p_brief;
      revision += 1;
      return {
        ...planningReference(revision, brief),
        entities: undefined,
        idempotent: false
      };
    }
    throw new Error(`RPC inesperada: ${name}`);
  };
  const firstSession = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid", serverApiKey: "secret", rpc
  });
  const planned = await firstSession.manageContinuity({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:approved-plan:0001",
    expectedRevision: 1,
    operation: "record_approved_plan",
    arguments: planArguments
  });
  assert.equal(planned.revision, 2);
  assert.equal(planned.partCount, 4);
  assert.equal(stateWriteCount, 1);

  const briefUpdated = await firstSession.manageContinuity({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:brief:p1-only",
    expectedRevision: 2,
    operation: "replace_stable_brief",
    arguments: { brief: "Contexto estável necessário para construir P1." }
  });
  assert.equal(briefUpdated.revision, 3);

  const newSession = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid", serverApiKey: "secret", rpc
  });
  const resumed = await newSession.get({
    principal: PRINCIPAL, workspaceId: WORKSPACE_ID, view: "resume"
  });
  assert.deepEqual(
    resumed.content.parts.map(({ id, microsequenceIds }) => ({ id, microsequenceIds })),
    parts.map(({ id, microsequenceIds }) => ({ id, microsequenceIds }))
  );
  assert.equal(resumed.content.decisions[0].id, "decision-approved-plan");
  assert.equal(resumed.content.mandate.targetPartId, "p1");
  assert.equal(
    resumed.content.parts.find(({ id }) => id === "p2")
      .microsequenceStateMask.slice(0, 3),
    "mpm"
  );
  assert.equal(stateWriteCount, 1);
});

test("split e merge entregam remapeamento compacto na mesma commit", async () => {
  const document = await mutationFixture();
  const demoteTargetCourse = {
    id: "course-demote-target",
    title: "Curso de destino",
    goal: "Receber conteúdo rebaixado.",
    modules: []
  };
  document.courses.push(demoteTargetCourse);
  const course = document.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const source = lesson.microsequences[0];
  const mergeSource = lesson.microsequences[1];
  const sourcePath = [course.id, moduleValue.id, lesson.id, source.id];
  const mergeSourcePath = [
    course.id, moduleValue.id, lesson.id, mergeSource.id
  ];
  const rpcCalls = [];
  let currentState = {
    version: 1,
    parts: [{
      id: "part-a",
      title: "Parte A",
      microsequenceIds: [source.id, mergeSource.id]
    }],
    decisions: [],
    mandate: null
  };
  const engine = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid",
    serverApiKey: "secret",
    rpc: async (name, payload) => {
      if (name === "replay_authoring_workspace_request_v5") return null;
      if (name === "get_authoring_workspace_v5") {
        return mutationReference(document);
      }
      if (name === "get_authoring_workspace_continuity_v1") {
        return {
          revision: 7,
          authoringState: currentState,
          activeFindings: [],
          activeFindingsTruncated: false
        };
      }
      if (name === "commit_authoring_workspace_changes_v5") {
        rpcCalls.push(structuredClone(payload));
        return { workspaceId: WORKSPACE_ID, revision: 8, idempotent: false };
      }
      throw new Error(`RPC inesperada: ${name}`);
    }
  });

  const splitMicrosequence = structuredClone(source);
  splitMicrosequence.id = "micro-split-new";
  splitMicrosequence.title = "Nova microssequência";
  splitMicrosequence.cards = [];
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:split:0001",
    expectedRevision: 7,
    operation: "split_microsequence",
    arguments: {
      sourcePath,
      newMicrosequence: splitMicrosequence,
      cardIds: [source.cards[0].id],
      position: 1
    }
  });
  assert.deepEqual(rpcCalls[0].p_summary.continuityRemap, {
    kind: "split", sourceId: source.id, newId: "micro-split-new"
  });
  assert.deepEqual(rpcCalls[0].p_summary.targetPath, sourcePath);
  assert.equal(rpcCalls[0].p_summary.operationFamily, "structure");

  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:merge:0001",
    expectedRevision: 7,
    operation: "merge_microsequences",
    arguments: {
      targetPath: sourcePath,
      sourcePaths: [mergeSourcePath],
      title: null,
      goal: null
    }
  });
  assert.deepEqual(rpcCalls[1].p_summary.continuityRemap, {
    kind: "merge", targetId: source.id, sourceIds: [mergeSource.id]
  });
  assert.deepEqual(rpcCalls[1].p_summary.targetPaths, [
    sourcePath, mergeSourcePath
  ]);

  const lessonPath = [course.id, moduleValue.id, lesson.id];
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:create-structure:paths",
    expectedRevision: 7,
    operation: "create_structure",
    arguments: {
      parts: [{
        entityType: "microsequence",
        parentPath: lessonPath,
        id: "micro-created-target",
        title: "Alvo criado",
        goal: "Cobrir o alvo criado.",
        role: "explain",
        branchOf: null,
        dependsOn: [],
        covers: [],
        checks: [],
        errors: []
      }]
    }
  });
  assert.deepEqual(rpcCalls[2].p_summary.targetPaths, [
    lessonPath, [...lessonPath, "micro-created-target"]
  ]);

  const moveTargetPath = [course.id, moduleValue.id, "lesson-move-target"];
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:move:paths",
    expectedRevision: 7,
    operation: "move_entity",
    arguments: {
      entityType: "microsequence",
      entityPath: mergeSourcePath,
      targetParentPath: moveTargetPath,
      position: 0
    }
  });
  assert.deepEqual(rpcCalls[3].p_summary.targetPaths, [
    mergeSourcePath, [...moveTargetPath, mergeSource.id]
  ]);

  const targetCard = source.cards[0];
  const peerCard = source.cards[1];
  const targetCardPath = [...sourcePath, targetCard.id];
  const peerCardPath = [...sourcePath, peerCard.id];
  const correctedTargetCard = structuredClone(targetCard);
  correctedTargetCard.content[0].data.text = "Condição explicada com precisão.";
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:resource:card-a",
    expectedRevision: 7,
    operation: "save_card",
    arguments: { cardPath: targetCardPath, card: correctedTargetCard }
  });
  assert.deepEqual(rpcCalls[4].p_summary.changedCardPaths, [targetCardPath]);
  assert.deepEqual(rpcCalls[4].p_summary.resourceTargets, [{
    cardPath: targetCardPath,
    targetId: "content:instruction"
  }]);
  assert.equal(rpcCalls[4].p_summary.changedCardPathsTruncated, false);
  assert.equal(rpcCalls[4].p_summary.resourceTargetsTruncated, false);
  assert.equal(rpcCalls[4].p_summary.operationFamily, "content");
  assert.deepEqual(rpcCalls[4].p_summary.cardShellChangedPaths, []);
  assert.equal(rpcCalls[4].p_summary.cardShellChangedPathsTruncated, false);
  assert.equal(
    rpcCalls[4].p_summary.resourceTargets.some(({ cardPath }) =>
      JSON.stringify(cardPath) === JSON.stringify(peerCardPath)),
    false
  );

  const correctedPeerCard = structuredClone(peerCard);
  correctedPeerCard.content[0].data.text = "Outra condição corrigida.";
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:resource:card-b",
    expectedRevision: 7,
    operation: "save_card",
    arguments: { cardPath: peerCardPath, card: correctedPeerCard }
  });
  assert.deepEqual(rpcCalls[5].p_summary.resourceTargets, [{
    cardPath: peerCardPath,
    targetId: "content:instruction"
  }]);

  const retitledTargetCard = structuredClone(targetCard);
  retitledTargetCard.title = "Título corrigido sem alterar resources";
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:shell:card-a",
    expectedRevision: 7,
    operation: "save_card",
    arguments: { cardPath: targetCardPath, card: retitledTargetCard }
  });
  assert.deepEqual(rpcCalls[6].p_summary.cardShellChangedPaths, [targetCardPath]);
  assert.equal(rpcCalls[6].p_summary.cardShellChangedPathsTruncated, false);
  assert.deepEqual(rpcCalls[6].p_summary.resourceTargets, []);
  assert.equal(rpcCalls[6].p_summary.resourceTargetsTruncated, false);
  const mutationControl = mutationReference(document, 8);
  for (const field of [
    "entities", "brief", "purpose", "workspaceKind", "visibility", "role",
    "capabilities"
  ]) delete mutationControl[field];
  const shellEnvelope = {
    ok: true,
    requestId: "continuity:shell:card-a",
    data: {
      ...mutationControl,
      change: {
        operation: "save_card",
        ...rpcCalls[6].p_summary
      }
    }
  };
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "salvarCardNoWorkspace",
    shellEnvelope
  ));
  const invalidShellEnvelope = structuredClone(shellEnvelope);
  delete invalidShellEnvelope.data.change.cardShellChangedPathsTruncated;
  assert.throws(() => validateAuthoringMcpToolOutput(
    "salvarCardNoWorkspace",
    invalidShellEnvelope
  ));

  const reorderedTargetCard = structuredClone(targetCard);
  reorderedTargetCard.content.reverse();
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:resource-order:card-a",
    expectedRevision: 7,
    operation: "save_card",
    arguments: { cardPath: targetCardPath, card: reorderedTargetCard }
  });
  assert.deepEqual(
    rpcCalls[7].p_summary.resourceTargets.map(({ targetId }) => targetId),
    ["content:code", "content:instruction"]
  );
  assert.deepEqual(rpcCalls[7].p_summary.cardShellChangedPaths, []);

  const copyTargetPath = [...lessonPath, "micro-copy-target"];
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:copy:destination-only",
    expectedRevision: 7,
    operation: "copy_entity",
    arguments: {
      entityType: "microsequence",
      entityPath: sourcePath,
      targetParentPath: lessonPath,
      newRootId: "micro-copy-target",
      position: 2
    }
  });
  assert.deepEqual(rpcCalls[8].p_summary.targetPaths, [copyTargetPath]);
  assert.deepEqual(rpcCalls[8].p_summary.targetPath, copyTargetPath);

  const modulePath = [course.id, moduleValue.id];
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:promote:both-sides",
    expectedRevision: 7,
    operation: "promote_module",
    arguments: {
      modulePath,
      courseId: "course-promoted-target",
      goal: "Estudar o módulo como curso independente.",
      mode: "copy"
    }
  });
  assert.deepEqual(rpcCalls[9].p_summary.targetPaths, [
    modulePath, ["course-promoted-target"]
  ]);

  const coursePath = [course.id];
  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:demote:both-sides",
    expectedRevision: 7,
    operation: "demote_course",
    arguments: {
      coursePath,
      targetCoursePath: [demoteTargetCourse.id],
      moduleId: "module-demoted-target"
    }
  });
  assert.deepEqual(rpcCalls[10].p_summary.targetPaths, [
    coursePath, [demoteTargetCourse.id, "module-demoted-target"]
  ]);

  currentState = {
    ...currentState,
    parts: [
      { id: "part-a", title: "Parte A", microsequenceIds: [source.id] },
      {
        id: "part-b", title: "Parte B",
        microsequenceIds: [mergeSource.id]
      }
    ]
  };
  await assert.rejects(engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:merge:cross-part",
    expectedRevision: 7,
    operation: "merge_microsequences",
    arguments: {
      targetPath: sourcePath,
      sourcePaths: [mergeSourcePath],
      title: null,
      goal: null
    }
  }), ({ status, code, message }) =>
    status === 422
    && code === "workspace_cross_part_merge"
    && message.includes("record_approved_plan"));
  assert.equal(rpcCalls.length, 11);
});

test("operações locais ignoram referências antigas e replanejamento substitui o estado", () => {
  const staleState = {
    version: 1,
    parts: [
      { id: "stale-a", title: "Antiga A", microsequenceIds: ["missing-a"] },
      { id: "stale-b", title: "Antiga B", microsequenceIds: ["missing-b"] }
    ],
    decisions: [
      {
        id: "stale-decision-a", summary: "Decisão antiga A.",
        entityType: "card", entityId: "missing-card-a"
      },
      {
        id: "stale-decision-b", summary: "Decisão antiga B.",
        entityType: "lesson", entityId: "missing-lesson-b"
      }
    ],
    mandate: {
      id: "old-audit", kind: "audit", targetPartId: "stale-a",
      decidedAtRevision: 6
    }
  };
  const cleared = applyContinuityStateOperation({
    state: staleState,
    operation: "clear_mandate",
    arguments: {},
    reference: reference(),
    continuity: continuity(),
    expectedRevision: 7
  });
  assert.equal(cleared.mandate, null);
  const withCurrentDecision = applyContinuityStateOperation({
    state: cleared,
    operation: "record_decision",
    arguments: {
      id: "current-decision", summary: "Decisão corrente.",
      entityType: "course", entityId: "course-a"
    },
    reference: reference(),
    continuity: continuity(),
    expectedRevision: 7
  });
  assert.equal(withCurrentDecision.decisions.length, 3);
  const replanned = applyContinuityStateOperation({
    state: withCurrentDecision,
    operation: "record_approved_plan",
    arguments: {
      parts: [{
        id: "part-current", title: "Parte corrente",
        microsequenceIds: ["micro-b"]
      }],
      decisions: [{
        id: "decision-current", summary: "Plano corrente aprovado.",
        entityType: "course", entityId: "course-a"
      }],
      mandate: {
        id: "mandate-current-plan", kind: "build_part",
        targetPartId: "part-current"
      }
    },
    reference: reference(),
    continuity: continuity(),
    expectedRevision: 7
  });
  assert.deepEqual(replanned.parts.map(({ id }) => id), ["part-current"]);
  assert.deepEqual(replanned.decisions.map(({ id }) => id), ["decision-current"]);
  assert.equal(replanned.mandate.targetPartId, "part-current");
});

test("brief usa limite UTF-8 e envelope resume mantém margem da Action", async () => {
  const exactBrief = "á".repeat(8_192);
  assert.doesNotThrow(() => validateWorkspaceContinuityActionPayload({
    requestId: "continuity:brief:utf8-ok",
    expectedRevision: 7,
    operation: "replace_stable_brief",
    arguments: { brief: exactBrief }
  }));
  assert.throws(() => validateWorkspaceContinuityActionPayload({
    requestId: "continuity:brief:utf8-large",
    expectedRevision: 7,
    operation: "replace_stable_brief",
    arguments: { brief: `${exactBrief}á` }
  }), ({ status, code }) => status === 422 && code === "authoring_brief_too_large");

  const rows = reference({ includeCardContent: false }).entities.filter(({ entityType }) =>
    entityType !== "microsequence" && entityType !== "card");
  const parts = Array.from({ length: 64 }, (_, partIndex) => {
    const microsequenceIds = Array.from({ length: 2 }, (_, itemIndex) =>
      `m-${partIndex}-${itemIndex}`);
    rows.push(...microsequenceIds.map((entityId, position) => row(
      "microsequence", entityId, "lesson", "lesson-a", position,
      { title: entityId, goal: entityId, role: "explain", status: "planned" }
    )));
    return {
      id: `part-${partIndex}`,
      title: `Parte ${partIndex}`,
      microsequenceIds
    };
  });
  const largeReference = {
    ...reference({ includeCardContent: false }),
    brief: exactBrief,
    entities: rows,
    entityCount: rows.length,
    publications: Array.from({ length: 10 }, (_, index) => ({
      workspaceCourseId: `course-${index}`,
      target: index % 2 ? "private" : "catalog",
      courseId: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
      contentHash: String(index).repeat(64),
      updatedAt: "2026-08-09T10:00:00.000Z"
    }))
  };
  const decisions = Array.from({ length: 128 }, (_, index) => ({
    id: `decision-${index}`,
    summary: `Decisão ${index}: ${"x".repeat(160)}`,
    entityType: "card",
    entityId: `missing-card-${index}`
  }));
  const longPath = Array.from({ length: 5 }, (_, index) =>
    `${index}-${"z".repeat(230)}`);
  const observationFocus = Array.from({ length: 20 }, (_, index) => ({
    entityType: "resource",
    entityPath: longPath,
    currentEntityPath: longPath,
    resourceTargetId: `content:${index}`,
    targetAvailable: true,
    totalCount: index + 1,
    openCount: index + 1
  }));
  const largeContinuity = continuity({
    authoringState: { version: 1, parts, decisions, mandate: null },
    activeFindings: Array.from({ length: 10 }, (_, index) => ({
      ...continuity().activeFindings[0],
      findingId: `${String(index + 100).padStart(8, "0")}-0000-4000-8000-000000000000`,
      entityType: "microsequence",
      entityPath: ["course-a", "module-a", "lesson-a", `m-${index}-0`],
      currentEntityPath: ["course-a", "module-a", "lesson-a", `m-${index}-0`],
      resourceTargetId: null,
      status: "open"
    })),
    structuralObservations: {
      totalCount: 20, openCount: 20, focus: observationFocus
    },
    situatedObservations: {
      totalCount: 20, openCount: 20, focus: observationFocus
    }
  });
  const projection = buildWorkspaceResumeProjection(
    largeReference,
    largeContinuity
  );
  const envelope = { ok: true, requestId: null, data: projection };
  assert.doesNotThrow(() => validateAuthoringMcpToolOutput(
    "lerWorkspaceDeAutoria",
    envelope
  ));
  assert.deepEqual(projection.content.observations.structural.focus, []);
  assert.deepEqual(projection.content.observations.situated.focus, []);
  assert.equal(
    projection.content.decisions.some((decision) =>
      Object.hasOwn(decision, "currentEntityPath")),
    false
  );
  assert.equal(projection.content.findings.truncated, true);
  assert.ok(new TextEncoder().encode(JSON.stringify(projection)).byteLength
    <= 88 * 1_024);
  assert.ok(new TextEncoder().encode(JSON.stringify(envelope)).byteLength
    < 96 * 1_024);

  let rpcCalled = false;
  const engine = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.invalid",
    serverApiKey: "secret",
    rpc: async () => {
      rpcCalled = true;
      return null;
    }
  });
  await assert.rejects(engine.manageContinuity({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "continuity:brief:utf8-engine",
    expectedRevision: 7,
    operation: "replace_stable_brief",
    arguments: { brief: `${exactBrief}á` }
  }), ({ status, code }) => status === 422 && code === "authoring_brief_too_large");
  assert.equal(rpcCalled, false);
});
