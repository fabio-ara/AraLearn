import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  aggregatePartConformanceAudits,
  auditInstructionalConformance,
  deriveActualMaterializedResources
} from "../../src/authoring/instructionalConformanceAudit.js";
import { designParameterCatalog } from "../../src/authoring/instructionalDesignContracts.js";
import { createPedagogicalBlueprintBinding } from "../../src/authoring/instructionalDesignBinding.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

const designFixture = JSON.parse(fs.readFileSync(new URL(
  "../fixtures/pedagogy/instructional-design-scenarios.v1.json",
  import.meta.url
), "utf8"));
const auditFixture = JSON.parse(fs.readFileSync(new URL(
  "../../authoring/evals/instructional-conformance-audit-scenarios.v1.json",
  import.meta.url
), "utf8"));

const analysis = designFixture.scenarios.find(({ id }) => (
  id === designFixture.canonicalLifecycle.analysisScenarioRef
)).analysis;

function blueprint() {
  return {
    goal: "Explicar entrega a processos e escolha entre serviços de transporte.",
    learnerSituation: "Pessoa iniciante em redes.",
    learningConditions: [],
    contentDemands: [{
      id: "transport-demand",
      description: "Relacionar entrega, processo e requisitos do serviço.",
      cognitiveOperations: ["trace_delivery", "discriminate_by_requirement"]
    }],
    anticipatedDifficulties: [],
    designResponses: [],
    prerequisiteEvidence: [],
    conceptualLayers: [
      {
        id: "delivery-layer",
        plainLanguageReferent: "Entrega ao programa correto.",
        formalTerms: ["porta", "socket"],
        requiresLayerIds: []
      },
      {
        id: "transport-layer",
        plainLanguageReferent: "Escolha segundo requisitos.",
        formalTerms: ["TCP", "UDP"],
        requiresLayerIds: ["delivery-layer"]
      }
    ],
    theorySteps: [
      {
        id: "theory-process-delivery",
        layerIds: ["delivery-layer"],
        purpose: "Explicar entrega.",
        cognitiveOperation: "explain",
        packageCandidateIds: ["prose"]
      },
      {
        id: "theory-transport-choice",
        layerIds: ["transport-layer"],
        purpose: "Contrastar serviços.",
        cognitiveOperation: "explain",
        packageCandidateIds: ["prose"]
      }
    ],
    practiceSteps: [{
      id: "practice-transport-choice",
      targetLayerIds: ["transport-layer"],
      decision: "Escolher serviço pelo requisito.",
      cognitiveOperation: "discriminate",
      packageCandidateIds: ["choice"],
      feedback: "Contrasta o requisito determinante."
    }],
    feedbackPlan: "Retomar a relação usada na decisão.",
    termLedger: [
      { term: "porta", introducedInLayerId: "delivery-layer", plainMeaning: "Identificador do processo." },
      { term: "socket", introducedInLayerId: "delivery-layer", plainMeaning: "Extremidade de comunicação." },
      { term: "TCP", introducedInLayerId: "transport-layer", plainMeaning: "Serviço com entrega confiável." },
      { term: "UDP", introducedInLayerId: "transport-layer", plainMeaning: "Serviço sem confirmação de entrega." }
    ],
    packageCandidates: [
      {
        id: "prose",
        packageId: "aralearn.resource.paragraph",
        version: "1.0.0",
        reason: "Desenvolver relações."
      },
      {
        id: "choice",
        packageId: "aralearn.response.choice",
        version: "1.0.0",
        reason: "Discriminar alternativas."
      }
    ]
  };
}

function mappings() {
  return {
    conceptualLayers: [
      { layerId: "delivery-layer", unitRefs: ["process", "port", "socket"] },
      { layerId: "transport-layer", unitRefs: ["tcp", "udp"] }
    ],
    contentDemands: [{
      contentDemandId: "transport-demand",
      unitRefs: ["process", "port", "socket", "tcp", "udp"],
      evidenceRequirementRefs: ["ev-process-delivery", "ev-transport-choice"]
    }],
    designResponses: [],
    theorySteps: [
      {
        stepId: "theory-process-delivery",
        unitRefs: ["process", "port", "socket"],
        explanationRequirementRefs: ["exp-process-delivery"]
      },
      {
        stepId: "theory-transport-choice",
        unitRefs: ["tcp", "udp"],
        explanationRequirementRefs: ["exp-transport-choice"]
      }
    ],
    practiceSteps: [{
      stepId: "practice-transport-choice",
      unitRefs: ["tcp", "udp"],
      evidenceRequirementRefs: ["ev-transport-choice"]
    }]
  };
}

function instance(packageId, instanceId, data = null) {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog().find(({ id }) => id === packageId);
  const example = data || RESOURCE_PACKAGE_REGISTRY
    .getAuthoringContract(packageId, manifest.version).contract.example;
  const slot = packageId.startsWith("aralearn.response.") ? "response" : "content";
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id: instanceId,
    package: packageId,
    version: manifest.version,
    data: example
  }, slot);
}

function cards() {
  return [
    {
      id: "card:theory:1",
      position: 1,
      title: "Entrega ao processo",
      role: "theory",
      content: [instance("aralearn.resource.paragraph", "paragraph-1")],
      response: null,
      feedback: [],
      topics: [],
      sources: ["source:computing:transport-short"]
    },
    {
      id: "card:theory:2",
      position: 2,
      title: "TCP e UDP",
      role: "theory",
      content: [instance("aralearn.resource.paragraph", "paragraph-2")],
      response: null,
      feedback: [],
      topics: [],
      sources: ["source:computing:transport-short"]
    },
    ...[1, 2, 3].map((index) => ({
      id: `card:practice:${index}`,
      position: 2 + index,
      title: `Prática ${index}`,
      role: "practice",
      content: [],
      response: instance("aralearn.response.choice", `choice-${index}`),
      feedback: [],
      topics: [],
      sources: ["source:computing:transport-short"]
    }))
  ];
}

function input() {
  const lifecycle = structuredClone(designFixture.canonicalLifecycle);
  const blueprintValue = blueprint();
  const binding = createPedagogicalBlueprintBinding({
    id: "binding-transport-audit",
    blueprint: blueprintValue,
    blueprintRef: lifecycle.materializationManifest.blueprintRef,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis,
    effectiveSnapshot: lifecycle.effectiveSnapshot,
    mappings: mappings()
  });
  return {
    analysis: structuredClone(analysis),
    parameterDefinitions: designParameterCatalog(),
    parameterAssignments: lifecycle.parameterAssignments,
    effectiveSnapshot: lifecycle.effectiveSnapshot,
    resourceSets: lifecycle.resourceSets,
    blueprint: blueprintValue,
    binding: structuredClone(binding),
    materializationManifest: lifecycle.materializationManifest,
    cards: cards(),
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    context: {
      workspaceId: "9dc92a1e-6791-4c48-9026-06db166f119a",
      microsequencePath: [
        "course-research-a",
        "module-transport",
        "lesson-transport",
        "ms-computing-transport"
      ],
      auditedRevision: 8,
      materializationStateRevision: 8,
      currentContentHash: lifecycle.materializationManifest.contentHash,
      materializationState: "tracked"
    }
  };
}

function codes(report) {
  return new Set(report.findings.map(({ code }) => code));
}

test("corpus #106 mantém oito cenários versionados sem alegar validade educacional", () => {
  assert.equal(auditFixture.contract, "aralearn.instructional-conformance-audit-scenarios.v1");
  assert.equal(auditFixture.scenarios.length, 8);
  assert.match(auditFixture.claimBoundary, /não mede aprendizagem/iu);
  const dns = auditFixture.scenarios.find(({ sourceIssue }) => sourceIssue === 89);
  assert.equal(dns.sourceIssue, 89);
  assert.ok(dns.materialization.cards[0].text.includes("base distribuída de registros de recursos"));
  assert.deepEqual(
    dns.expected.semanticFindings.map(({ code }) => code),
    ["semantic_excessive_compression"]
  );
  const falsePositive = auditFixture.scenarios.find(({ id }) => id === "7");
  assert.equal(falsePositive.expected.humanDecision.repairAuthorized, false);
});

test("auditoria deriva cards e packages reais sem confiar no manifesto", () => {
  const report = auditInstructionalConformance(input());
  assert.equal(report.contract, "AuthoringConformanceAudit@1");
  assert.equal(report.auditedRevision, 8);
  assert.equal(report.epistemicBoundary.includes("eficácia educacional"), true);
  assert.equal(codes(report).has("actual_resources_match_manifest"), false);
  assert.ok(codes(report).has("new_units_per_theory_step_ceiling"));
  assert.ok(codes(report).has("applicable_explanation_coverage"));
  assert.ok(codes(report).has("evidence_requirement_coverage"));
  assert.equal(Object.hasOwn(report.summary, "score"), false);
  assert.ok(report.metrics.every(({ denominator }) => denominator.count > 0));
  assert.equal(deriveActualMaterializedResources(input().cards).length, 5);
});

test("manifesto forjado não oculta package real ou condição experimental divergente", () => {
  const forged = input();
  forged.cards[0].content[0] = instance("aralearn.resource.flow", "flow-outside-condition");
  const report = auditInstructionalConformance(forged);
  assert.ok(codes(report).has("actual_resources_match_manifest"));
  assert.ok(codes(report).has("actual_resources_preserve_resource_set_condition"));
  const finding = report.findings.find(({ code }) => (
    code === "actual_resources_preserve_resource_set_condition"
  ));
  assert.equal(finding.origin, "deterministic");
  assert.equal(finding.severity, "critical");
  assert.match(finding.fingerprint, /^v1:/u);
});

test("hash e marcador correntes impedem auditar manifesto stale como conforme", () => {
  const stale = input();
  stale.context.currentContentHash = "c".repeat(64);
  stale.context.materializationState = "stale";
  const report = auditInstructionalConformance(stale);
  const finding = report.findings.find(({ code }) => (
    code === "manifest_tracks_current_materialization"
  ));
  assert.ok(finding);
  assert.equal(finding.severity, "critical");
  assert.equal(finding.ruleRef.kind, "materialization");
});

test("fontes dos cards permanecem rastreáveis à análise vigente", () => {
  const untracked = input();
  untracked.cards[0].sources.push("source:foreign");
  const report = auditInstructionalConformance(untracked);
  const finding = report.findings.find(({ code }) => (
    code === "card_sources_trace_to_analysis"
  ));
  assert.ok(finding);
  assert.equal(finding.target.entityType, "card");
  assert.equal(finding.target.entityPath.at(-1), "card:theory:1");
  assert.equal(finding.ruleRef.kind, "traceability");
});

test("ordem real detecta prática antes da teoria necessária", () => {
  const earlyPractice = input();
  earlyPractice.cards.find(({ id }) => id === "card:practice:1").position = 1;
  earlyPractice.cards.find(({ id }) => id === "card:theory:1").position = 4;
  earlyPractice.cards.find(({ id }) => id === "card:theory:2").position = 5;
  earlyPractice.cards.find(({ id }) => id === "card:practice:2").position = 2;
  earlyPractice.cards.find(({ id }) => id === "card:practice:3").position = 3;
  const report = auditInstructionalConformance(earlyPractice);
  assert.ok(codes(report).has("practice_after_required_theory"));
  const finding = report.findings.find(({ code }) => code === "practice_after_required_theory");
  assert.equal(finding.target.entityType, "card");
  assert.equal(finding.target.entityPath.at(-1), "card:practice:1");
});

test("auditoria semântica permanece pergunta explícita, não fato contado pelo backend", () => {
  const report = auditInstructionalConformance(input());
  assert.deepEqual(new Set(report.semanticReview.map(({ code }) => code)), new Set([
    "semantic_excessive_compression",
    "semantic_explanation_only_mentioned",
    "semantic_practice_operation_mismatch",
    "semantic_representation_mismatch"
  ]));
  for (const semantic of report.semanticReview) {
    assert.equal(codes(report).has(semantic.code), false);
  }
});

test("coleções malformadas falham fechado sem apagar locks, ResourceSets ou cards", () => {
  const fixture = input();
  for (const field of [
    "parameterDefinitions",
    "parameterAssignments",
    "resourceSets",
    "cards"
  ]) {
    assert.throws(
      () => auditInstructionalConformance({ ...fixture, [field]: {} }),
      new RegExp(`exige ${field} como lista`, "u")
    );
  }
  assert.throws(
    () => auditInstructionalConformance({
      ...fixture,
      context: { ...fixture.context, microsequencePath: ["course", "module", "lesson", "other"] }
    }),
    /não identifica a materialização corrente/u
  );
  assert.throws(
    () => auditInstructionalConformance({ ...fixture, context: null }),
    /contexto corrente/u
  );
  assert.throws(
    () => deriveActualMaterializedResources({}),
    /exige cards como lista/u
  );
});

test("agregação de Parte mede cobertura e distribuição sem criar nota", () => {
  const first = auditInstructionalConformance(input());
  const secondInput = input();
  secondInput.analysis.id = "analysis-second";
  secondInput.analysis.scope.ref = "ms-second";
  secondInput.effectiveSnapshot.id = "snapshot-second";
  secondInput.effectiveSnapshot.scope.ref = "ms-second";
  secondInput.effectiveSnapshot.analysisRef = { id: "analysis-second", version: "1.0.0" };
  secondInput.effectiveSnapshot.resolutionPath.at(-1).ref = "ms-second";
  secondInput.binding.id = "binding-second";
  secondInput.binding.scope.ref = "ms-second";
  secondInput.binding.analysisRef = { id: "analysis-second", version: "1.0.0" };
  secondInput.binding.effectiveSnapshotRef = { id: "snapshot-second", version: "1.0.0" };
  secondInput.materializationManifest.id = "manifest-second";
  secondInput.materializationManifest.scope.ref = "ms-second";
  secondInput.materializationManifest.analysisRef = { id: "analysis-second", version: "1.0.0" };
  secondInput.materializationManifest.effectiveSnapshotRef = { id: "snapshot-second", version: "1.0.0" };
  secondInput.context.microsequencePath[3] = "ms-second";
  const second = auditInstructionalConformance(secondInput);
  const part = aggregatePartConformanceAudits({
    part: { id: "part-a", microsequenceIds: ["ms-computing-transport", "ms-second"] },
    audits: [first, second],
    auditedRevision: 8
  });
  assert.equal(part.scope.kind, "part");
  assert.equal(part.distribution.auditedMicrosequenceCount, 2);
  assert.equal(
    part.distribution.findingCount,
    first.findings.length + second.findings.length
  );
  assert.equal(
    part.distribution.findingsByOrigin.deterministic,
    part.distribution.findingCount
  );
  assert.equal(part.checks[0].status, "passed");
  assert.equal(Object.hasOwn(part.summary, "score"), false);
  for (const dimension of ["structure", "design", "practice", "resources"]) {
    const states = [first.summary[dimension], second.summary[dimension]];
    const expected = states.includes("finding")
      ? "finding"
      : states.every((state) => state === "conformant")
        ? "conformant"
        : "not_checked";
    assert.equal(part.summary[dimension], expected);
  }
  assert.equal(
    part.findings.some(({ code }) => code.startsWith("part_design_")),
    false
  );

  const incomplete = aggregatePartConformanceAudits({
    part: { id: "part-a", microsequenceIds: ["ms-computing-transport", "ms-missing"] },
    audits: [first],
    auditedRevision: 8
  });
  assert.equal(incomplete.checks[0].status, "failed");
  assert.ok(incomplete.findings.some(({ code }) => code === "part_microsequence_audit_coverage"));
  assert.equal(incomplete.summary.design, "not_checked");
  assert.throws(
    () => aggregatePartConformanceAudits({
      part: { id: "part-a", microsequenceIds: ["ms-computing-transport"] },
      audits: [{ ...first, scope: { kind: "microsequence", ref: "outside" } }],
      auditedRevision: 8
    }),
    /pertencer uma única vez à Parte/u
  );
  const historicalChild = aggregatePartConformanceAudits({
    part: { id: "part-a", microsequenceIds: ["ms-computing-transport"] },
    audits: [{ ...first, auditedRevision: 7 }],
    auditedRevision: 8
  });
  assert.equal(historicalChild.refs.auditRefs.items[0].auditedRevision, 7);
  assert.throws(
    () => aggregatePartConformanceAudits({
      part: { id: "part-a", microsequenceIds: ["ms-computing-transport"] },
      audits: [{ ...first, auditedRevision: 9 }],
      auditedRevision: 8
    }),
    /posterior à Parte/u
  );
  const byCategory = Object.fromEntries([...new Set(first.findings.map(
    ({ category }) => category
  ))].map((category) => [
    category,
    first.findings.filter((finding) => finding.category === category).length
  ]));
  const compactChild = {
    contract: first.contract,
    algorithm: first.algorithm,
    scope: first.scope,
    auditedRevision: 7,
    materializationStateRevision: first.materializationStateRevision,
    contentHash: first.contentHash,
    summary: first.summary,
    auditRunRef: { id: "audit-run-first", version: "1" },
    findingSummary: {
      total: first.findings.length,
      byCategory,
      byOrigin: { deterministic: first.findings.length }
    }
  };
  const compactPart = aggregatePartConformanceAudits({
    part: { id: "part-a", microsequenceIds: ["ms-computing-transport"] },
    audits: [compactChild],
    auditedRevision: 8
  });
  assert.equal(compactPart.metrics[0].value, first.findings.length);
  assert.equal(compactPart.distribution.findingsByOrigin.deterministic, first.findings.length);
  assert.deepEqual(compactPart.refs.auditRefs.items[0].auditRunRef, {
    id: "audit-run-first", version: "1"
  });
  const mixedOriginPart = aggregatePartConformanceAudits({
    part: { id: "part-a", microsequenceIds: ["ms-computing-transport"] },
    audits: [{
      ...compactChild,
      findingSummary: {
        total: 2,
        byCategory: { design: 1, practice: 1 },
        byOrigin: { deterministic: 1, semantic_audit: 1 }
      }
    }],
    auditedRevision: 8
  });
  assert.deepEqual(mixedOriginPart.distribution.findingsByOrigin, {
    deterministic: 1,
    semantic_audit: 1
  });
  assert.throws(
    () => aggregatePartConformanceAudits({
      part: { id: "part-a", microsequenceIds: ["ms-computing-transport"] },
      audits: [{
        ...compactChild,
        findingSummary: {
          total: 1,
          byCategory: { invented: 1 },
          byOrigin: { deterministic: 1 }
        }
      }],
      auditedRevision: 8
    }),
    /distribuição compacta/u
  );

  const largeIds = Array.from({ length: 500 }, (_, index) =>
    `ms-${index}-${"x".repeat(220)}`);
  const largePart = aggregatePartConformanceAudits({
    part: { id: "part-large", microsequenceIds: largeIds },
    audits: largeIds.map((scopeRef, index) => ({
      ...compactChild,
      scope: { kind: "microsequence", ref: scopeRef },
      auditRunRef: {
        id: `audit-${index}-${"x".repeat(215)}`,
        version: "1"
      }
    })),
    auditedRevision: 8
  });
  const largeMetric = largePart.metrics[0];
  assert.deepEqual({
    itemCount: largeMetric.denominator.refs.items.length,
    count: largeMetric.denominator.refs.count,
    truncated: largeMetric.denominator.refs.truncated,
    inputItemCount: largeMetric.algorithm.inputRefs.items.length,
    inputCount: largeMetric.algorithm.inputRefs.count,
    inputTruncated: largeMetric.algorithm.inputRefs.truncated
  }, {
    itemCount: 5,
    count: 500,
    truncated: true,
    inputItemCount: 5,
    inputCount: 500,
    inputTruncated: true
  });
  assert.deepEqual({
    microsequenceItems: largePart.refs.microsequenceRefs.items.length,
    microsequenceCount: largePart.refs.microsequenceRefs.count,
    microsequenceTruncated: largePart.refs.microsequenceRefs.truncated,
    auditItems: largePart.refs.auditRefs.items.length,
    auditCount: largePart.refs.auditRefs.count,
    auditTruncated: largePart.refs.auditRefs.truncated
  }, {
    microsequenceItems: 20,
    microsequenceCount: 500,
    microsequenceTruncated: true,
    auditItems: 20,
    auditCount: 500,
    auditTruncated: true
  });
  assert.ok(Buffer.byteLength(JSON.stringify(largePart), "utf8") < 96 * 1_024);
  assert.throws(
    () => aggregatePartConformanceAudits({
      part: { id: "part-a", microsequenceIds: ["ms-computing-transport"] },
      audits: [{
        scope: first.scope,
        auditedRevision: 8,
        summary: first.summary,
        checks: [],
        findings: [],
        metrics: []
      }],
      auditedRevision: 8
    }),
    /canônica/u
  );
});
