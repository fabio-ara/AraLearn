import assert from "node:assert/strict";
import test from "node:test";
import {
  CourseAuditCycleError,
  normalizeCourseAuditCycleCommand,
  normalizeCourseAuditCycleChange,
  normalizeCourseAuditCyclePage,
  normalizeCourseAuditCycleQuery,
  normalizeCourseAuditCycleServerCommand
} from "../../src/domain/courseAuditCycle.js";

const RUN_ID = "11111111-1111-5111-8111-111111111111";
const FINDING_ID = "22222222-2222-5222-8222-222222222222";
const CHECK_IDS = {
  pedagogical_quality: "33333333-3333-5333-8333-333333333331",
  factual_quality: "33333333-3333-5333-8333-333333333332",
  editorial_quality: "33333333-3333-5333-8333-333333333333",
  structural_conformance: "33333333-3333-5333-8333-333333333334"
};

function check(dimension, result = "not_checked", sourceLinks = []) {
  const adequacy = {
    passed: "sufficient",
    failed: "insufficient",
    uncertain: "uncertain",
    not_applicable: "not_applicable",
    not_checked: "not_assessed"
  }[result];
  return {
    checkId: CHECK_IDS[dimension],
    dimension,
    criterion: {
      code: dimension === "factual_quality" ? "claim_support" : `${dimension}.review`,
      version: "1",
      statement: `Critério público de ${dimension}.`
    },
    result,
    publicEvidence: `Evidência pública de ${dimension}.`,
    adequacy,
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks
  };
}

function recordCommand(checks, findings = []) {
  return {
    type: "record_audit",
    auditRunId: RUN_ID,
    targetStudyUnitId: "unit-a",
    contextHash: "a".repeat(64),
    origin: "human_audit",
    method: { id: "manual-review", version: "1" },
    checks,
    findings
  };
}

const humanChecks = () => [
  check("pedagogical_quality"),
  check("factual_quality", "failed"),
  check("editorial_quality")
];

test("o envelope público reserva a dimensão estrutural ao servidor", () => {
  const publicCommand = normalizeCourseAuditCycleCommand(recordCommand(humanChecks(), [{
    findingId: FINDING_ID,
    checkId: CHECK_IDS.factual_quality,
    code: "missing_source_anchor",
    severity: "high",
    annotationRefs: []
  }]));
  assert.equal(publicCommand.checks.length, 3);
  assert.equal(publicCommand.checks[1].sourceLinks.length, 0);

  assert.throws(
    () => normalizeCourseAuditCycleCommand(recordCommand([
      ...humanChecks(),
      check("structural_conformance", "passed")
    ])),
    (error) => error instanceof CourseAuditCycleError && error.code === "invalid_course_audit_checks"
  );

  const serverCommand = normalizeCourseAuditCycleServerCommand(recordCommand([
    ...humanChecks(),
    check("structural_conformance", "passed")
  ], [{
    findingId: FINDING_ID,
    checkId: CHECK_IDS.factual_quality,
    code: "missing_source_anchor",
    severity: "high",
    annotationRefs: []
  }]));
  assert.equal(serverCommand.checks.length, 4);
});

test("finding só pode apontar a check failed ou uncertain", () => {
  assert.throws(
    () => normalizeCourseAuditCycleCommand(recordCommand(humanChecks(), [{
      findingId: FINDING_ID,
      checkId: CHECK_IDS.pedagogical_quality,
      code: "invalid_finding",
      severity: "low",
      annotationRefs: []
    }])),
    (error) => error instanceof CourseAuditCycleError &&
      error.message.includes("check falho ou incerto")
  );
});

test("factual passed exige supported_by exato, mas failed representa ausência", () => {
  assert.doesNotThrow(() => normalizeCourseAuditCycleCommand(recordCommand(humanChecks())));
  assert.throws(() => normalizeCourseAuditCycleCommand(recordCommand([
    check("pedagogical_quality"),
    check("factual_quality", "passed"),
    check("editorial_quality")
  ])), CourseAuditCycleError);

  const supported = [{
    sourceId: "source-a",
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
  }];
  assert.doesNotThrow(() => normalizeCourseAuditCycleCommand(recordCommand([
    check("pedagogical_quality"),
    check("factual_quality", "passed", supported),
    check("editorial_quality")
  ])));
});

test("referências de contexto seguem a identidade canônica do catálogo", () => {
  const duplicatePlan = structuredClone(humanChecks());
  duplicatePlan[0].planItemRefs = [
    { planItemId: FINDING_ID, version: 1 },
    { planItemId: FINDING_ID, version: 2 }
  ];
  assert.throws(() => normalizeCourseAuditCycleCommand(recordCommand(duplicatePlan)),
    CourseAuditCycleError);

  const duplicateParameter = structuredClone(humanChecks());
  duplicateParameter[0].parameterRefs = [
    { parameterId: "required_explanation_forms", changeId: "1" },
    { parameterId: "required_explanation_forms", changeId: "2" }
  ];
  assert.throws(() => normalizeCourseAuditCycleCommand(recordCommand(duplicateParameter)),
    CourseAuditCycleError);

  for (const parameterId of [" invalid", "inválido", "astral_😀", "bad\u0000id"]) {
    const invalid = structuredClone(humanChecks());
    invalid[0].parameterRefs = [{ parameterId, changeId: "1" }];
    assert.throws(() => normalizeCourseAuditCycleCommand(recordCommand(invalid)),
      CourseAuditCycleError);
  }
  const zeroChange = structuredClone(humanChecks());
  zeroChange[0].parameterRefs = [{ parameterId: "required_explanation_forms", changeId: "0" }];
  assert.throws(() => normalizeCourseAuditCycleCommand(recordCommand(zeroChange)),
    CourseAuditCycleError);
});

test("uma rodada cabe nas 12 observações da consulta de contexto", () => {
  const annotationRefs = Array.from({ length: 13 }, (_, index) => ({
    annotationId: `77777777-7777-5777-8777-${String(index + 1).padStart(12, "0")}`,
    annotationVersion: 1
  }));
  const twelve = recordCommand(humanChecks(), [{
    findingId: FINDING_ID,
    checkId: CHECK_IDS.factual_quality,
    code: "missing_source_anchor",
    severity: "high",
    annotationRefs: annotationRefs.slice(0, 12)
  }]);
  assert.equal(normalizeCourseAuditCycleCommand(twelve).findings[0].annotationRefs.length, 12);
  assert.throws(() => normalizeCourseAuditCycleCommand({
    ...twelve,
    findings: [{ ...twelve.findings[0], annotationRefs }]
  }), CourseAuditCycleError);

  const twoFailedChecks = humanChecks();
  twoFailedChecks[2] = check("editorial_quality", "failed");
  assert.throws(() => normalizeCourseAuditCycleCommand(recordCommand(twoFailedChecks, [
    { ...twelve.findings[0], annotationRefs: annotationRefs.slice(0, 7) },
    {
      findingId: "88888888-8888-5888-8888-888888888888",
      checkId: CHECK_IDS.editorial_quality,
      code: "editorial_issue",
      severity: "medium",
      annotationRefs: annotationRefs.slice(7)
    }
  ])), CourseAuditCycleError);
});

test("rejeitar correção é comando alcançável e mantém CAS explícito", () => {
  assert.deepEqual(normalizeCourseAuditCycleCommand({
    type: "reject_authoring_correction",
    findingId: FINDING_ID,
    expectedFindingVersion: 2,
    correctionId: "44444444-4444-5444-8444-444444444444",
    expectedCorrectionVersion: 3
  }), {
    type: "reject_authoring_correction",
    findingId: FINDING_ID,
    expectedFindingVersion: 2,
    correctionId: "44444444-4444-5444-8444-444444444444",
    expectedCorrectionVersion: 3
  });
});

test("consulta mantém filtros e focos query-bound", () => {
  assert.equal(normalizeCourseAuditCycleQuery({
    mode: "detail",
    targetStudyUnitId: null,
    findingId: FINDING_ID,
    correctionId: null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  }).mode, "detail");
  assert.throws(() => normalizeCourseAuditCycleQuery({
    mode: "detail",
    targetStudyUnitId: "unit-a",
    findingId: FINDING_ID,
    correctionId: null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  }), CourseAuditCycleError);

  assert.equal(normalizeCourseAuditCycleQuery({
    mode: "runs",
    targetStudyUnitId: "unit-a",
    findingId: null,
    correctionId: null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  }).mode, "runs");
  assert.equal(normalizeCourseAuditCycleQuery({
    mode: "detail",
    targetStudyUnitId: null,
    findingId: null,
    correctionId: null,
    auditRunId: RUN_ID,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  }).auditRunId, RUN_ID);
});

test("snapshot posterior respeita 48 KiB e o comando 192 KiB", () => {
  const base = {
    type: "propose_authoring_correction",
    correctionId: "44444444-4444-5444-8444-444444444444",
    findingId: FINDING_ID,
    expectedFindingVersion: 1,
    expectedCorrectionVersion: 0,
    afterSourceLinks: [],
    rationale: "Corrigir somente o achado focal."
  };
  assert.doesNotThrow(() => normalizeCourseAuditCycleCommand({
    ...base,
    afterContent: { title: "a".repeat(1000), topics: ["topic-a"] }
  }));
  assert.throws(() => normalizeCourseAuditCycleCommand({
    ...base,
    afterContent: { title: "a".repeat(50000) }
  }), (error) => error instanceof CourseAuditCycleError &&
    ["invalid_course_audit_cycle_command", "course_authoring_correction_snapshot_too_large"]
      .includes(error.code));
});

test("contexto preserva sourceId literal e Fonte unresolved sem inventar metadados", () => {
  const courseId = "55555555-5555-5555-8555-555555555555";
  const sourceId = "  fonte-literal-á  ";
  const rawPage = {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId,
    courseRevision: 7,
    auditSetVersion: 0,
    query: {
      mode: "context",
      targetStudyUnitId: "unit-a",
      findingId: null,
      correctionId: null,
      auditRunId: null,
      states: [],
      dimensions: [],
      severities: [],
      annotationIds: []
    },
    summary: {
      matchingTotal: 0,
      byState: { open: 0, awaiting_verification: 0, resolved: 0, dismissed: 0 },
      byDimension: {
        structural_conformance: 0,
        pedagogical_quality: 0,
        factual_quality: 0,
        editorial_quality: 0
      },
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }
    },
    context: {
      contract: "aralearn.course-audit-context.v1",
      contextHash: "c".repeat(64),
      target: {
        studyUnitId: "unit-a",
        version: 2,
        hash: "d".repeat(64),
        position: 1,
        path: [
          { kind: "course", id: courseId, label: "Curso", version: 7 },
          { kind: "module", id: "module-a", label: "Módulo", version: 1 },
          { kind: "lesson", id: "lesson-a", label: "Lição", version: 1 },
          { kind: "didactic_microsequence", id: "micro-a", label: "Micro", version: 1 },
          { kind: "study_unit", id: "unit-a", label: "Unidade", version: 2 }
        ],
        content: { title: "Unidade", topics: ["topic-a"] },
        sourceLinks: [{ sourceId, sourceRevision: 1, relation: "legacy_reference", anchors: [] }]
      },
      didacticMicrosequence: {
        id: "micro-a",
        version: 1,
        hash: "e".repeat(64),
        content: { title: "Micro" }
      },
      plan: {
        planId: "66666666-6666-5666-8666-666666666666",
        version: 1,
        audience: "",
        instructionalScope: "",
        authoringGuidance: "",
        items: []
      },
      design: {
        parameters: [],
        guidance: [],
        componentPolicy: {
          changeId: null,
          policy: { availability: "all", allowedRefs: [], excludedRefs: [], preferredRefs: [] },
          origin: "system_default",
          reason: "Política padrão.",
          sourceScope: null,
          inherited: false
        }
      },
      intent: {
        query: "",
        slot: "",
        studyUnitRole: "",
        disciplineIds: [],
        structureIds: [],
        taskOperationIds: [],
        practiceModeIds: [],
        knowledgeObjects: [],
        mustPreserve: [],
        notationIsLearningObject: false
      },
      sources: [{
        sourceId,
        sourceRevision: 1,
        status: "unresolved_legacy",
        kind: null,
        title: null,
        citationText: null,
        url: null,
        editionOrVersion: null,
        studyVisibility: "hidden",
        relation: "legacy_reference",
        sourceHash: "f".repeat(64),
        anchors: [],
        deepLink: null
      }],
      annotations: [],
      facts: {
        courseRevision: 7,
        targetVersion: 2,
        targetHash: "d".repeat(64),
        sourceLinksHash: "1".repeat(64),
        planVersion: 1
      }
    },
    items: [],
    runs: [],
    detail: null,
    runDetail: null,
    hasMore: false,
    nextCursor: null
  };
  const page = normalizeCourseAuditCyclePage(rawPage);
  assert.equal(page.context.sources[0].sourceId, sourceId);
  assert.equal(page.context.sources[0].kind, null);
  assert.deepEqual(page.context.target.content.topics, ["topic-a"]);

  const restrictedPolicy = structuredClone(rawPage);
  restrictedPolicy.context.design.componentPolicy.policy = {
    availability: "allow_only",
    allowedRefs: ["aralearn.resource.paragraph@1.0.0"],
    excludedRefs: [],
    preferredRefs: ["aralearn.resource.paragraph@1.0.0"]
  };
  assert.equal(
    normalizeCourseAuditCyclePage(restrictedPolicy)
      .context.design.componentPolicy.policy.availability,
    "allow_only"
  );

  const boundary = structuredClone(rawPage);
  boundary.context.target.content = { title: "Unidade", body: "a".repeat(60000) };
  const bounded = normalizeCourseAuditCyclePage(boundary);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded)) < 245760);

  const annotationId = "77777777-7777-5777-8777-777777777777";
  const leaked = structuredClone(rawPage);
  leaked.query.annotationIds = [annotationId];
  leaked.context.annotations = [{
    annotationId,
    annotationVersion: 2,
    state: "withdrawn",
    category: null,
    rawText: "texto que não pode vazar",
    briefSummary: null,
    target: { kind: "study_unit", id: "unit-a" },
    deepLink: null
  }];
  assert.throws(() => normalizeCourseAuditCyclePage(leaked), (error) => (
    error instanceof CourseAuditCycleError && error.message.includes("retirada")
  ));

  const runsPage = structuredClone(rawPage);
  runsPage.query = {
    mode: "runs",
    targetStudyUnitId: "unit-a",
    findingId: null,
    correctionId: null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  };
  runsPage.context = null;
  runsPage.runs = [{
    auditRunId: RUN_ID,
    runKind: "audit",
    origin: "human_audit",
    method: { id: "manual-review", version: "1" },
    courseRevision: 7,
    target: { studyUnitId: "unit-a", version: 2, hash: "d".repeat(64) },
    resultCounts: {
      passed: 1, failed: 1, uncertain: 0, not_applicable: 0, not_checked: 2
    },
    findingsCreated: 1,
    createdAt: "2026-08-17T12:00:00.000Z",
    deepLink: null
  }];
  assert.equal(normalizeCourseAuditCyclePage(runsPage).runs[0].findingsCreated, 1);

  const detailPage = structuredClone(runsPage);
  detailPage.query = { ...runsPage.query, mode: "detail", targetStudyUnitId: null, auditRunId: RUN_ID };
  detailPage.runs = [];
  detailPage.runDetail = {
    contract: "aralearn.course-instructional-audit-run.v1",
    auditRunId: RUN_ID,
    runKind: "audit",
    origin: "human_audit",
    method: { id: "manual-review", version: "1" },
    courseRevision: 7,
    contextHash: "c".repeat(64),
    target: {
      studyUnitId: "unit-a",
      version: 2,
      hash: "d".repeat(64),
      path: rawPage.context.target.path
    },
    checks: [...humanChecks(), check("structural_conformance", "passed")],
    metrics: {
      checksTotal: 4,
      byResult: { passed: 1, failed: 1, uncertain: 0, not_applicable: 0, not_checked: 2 },
      findingsCreated: 1
    },
    createdAt: "2026-08-17T12:00:00.000Z"
  };
  assert.equal(normalizeCourseAuditCyclePage(detailPage).runDetail.target.path.length, 5);
});

test("checkpoint anterior preserva atribuição legada e mantém o posterior estrito", () => {
  const courseId = "55555555-5555-5555-8555-555555555555";
  const correctionId = "44444444-4444-5444-8444-444444444444";
  const change = normalizeCourseAuditCycleChange({
    contract: "aralearn.course-audit-cycle-change.v1",
    courseId,
    courseRevision: 8,
    auditSetVersion: 2,
    requestId: "legacy-checkpoint-0001",
    idempotent: false,
    changed: false,
    change: null,
    finding: null,
    correction: {
      contract: "aralearn.course-authoring-correction.v1",
      correctionId,
      correctionVersion: 1,
      courseId,
      findingId: FINDING_ID,
      status: "proposed",
      target: { studyUnitId: "unit-a", baseVersion: 2, baseHash: "a".repeat(64) },
      checkpoint: {
        before: {
          content: { title: "Antes", topics: ["topic-a"] },
          sourceLinks: [{
            sourceId: "  fonte-legada-á  ",
            sourceRevision: 1,
            relation: "legacy_reference",
            anchors: []
          }],
          hash: "b".repeat(64)
        },
        after: {
          content: { title: "Depois", topics: ["topic-a"] },
          sourceLinks: [],
          hash: "c".repeat(64)
        }
      },
      rationale: "Resolver a atribuição legada sem perder o checkpoint.",
      application: null,
      verification: null,
      rollback: null,
      timestamps: {
        createdAt: "2026-08-17T12:00:00.000Z",
        updatedAt: "2026-08-17T12:00:00.000Z"
      },
      capabilities: {
        canAdjust: true, canReject: true, canApply: true, canVerify: false, canRollback: false
      },
      deepLink: null
    },
    suggestedAnnotationActions: []
  });
  assert.equal(change.correction.checkpoint.before.sourceLinks[0].sourceId, "  fonte-legada-á  ");
});
