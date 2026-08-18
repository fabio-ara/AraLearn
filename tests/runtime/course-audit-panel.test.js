import assert from "node:assert/strict";
import test from "node:test";

import { createCourseAuditPanel } from "../../src/ui/CourseAuditPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const FINDING_ID = "20000000-0000-4000-8000-000000000002";
const CORRECTION_ID = "30000000-0000-4000-8000-000000000003";
const RUN_ID = "40000000-0000-4000-8000-000000000004";
const CHECK_ID = "50000000-0000-4000-8000-000000000005";
const CLEAN_RUN_ID = "80000000-0000-4000-8000-000000000008";
const RUN_CHECK_IDS = Object.freeze([
  "81000000-0000-4000-8000-000000000001",
  "82000000-0000-4000-8000-000000000002",
  "83000000-0000-4000-8000-000000000003",
  "84000000-0000-4000-8000-000000000004"
]);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

class FakeHost {
  constructor() {
    this.innerHTML = "";
    this.attributes = new Map();
    this.hidden = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeRoot extends FakeHost {
  constructor() {
    super();
    this.listeners = new Map();
    this.observations = new FakeHost();
    this.audit = new FakeHost();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  querySelector(selector) {
    if (selector === "[data-course-audit-observations]") return this.observations;
    if (selector === "[data-course-audit-findings]") return this.audit;
    return null;
  }

  contains() {
    return true;
  }
}

function studyContent(text) {
  return {
    title: "Unidade auditada",
    role: "theory",
    content: [{
      id: "explicacao",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text }
    }],
    response: null,
    feedback: [],
    topics: ["conceito-central"]
  };
}

function path() {
  return [{ kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
    { kind: "module", id: "module-a", label: "Módulo", version: 1 },
    { kind: "lesson", id: "lesson-a", label: "Lição", version: 1 },
    { kind: "didactic_microsequence", id: "micro-a", label: "Microssequência", version: 1 },
    { kind: "study_unit", id: "unit-a", label: "Unidade auditada", version: 2 }];
}

function check() {
  return {
    checkId: CHECK_ID,
    dimension: "factual_quality",
    criterion: {
      code: "human_review.factual_quality",
      version: "1",
      statement: "A afirmação é sustentada pela Fonte e Âncora indicadas."
    },
    result: "failed",
    publicEvidence: "A edição citada diverge do texto da Unidade.",
    adequacy: "insufficient",
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: [{
      sourceId: "fonte-literal",
      sourceRevision: 2,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-a", anchorRevision: 3 }]
    }]
  };
}

function finding({ correctionStatus = "proposed", courseRevision = 7, currentAvailable = false } = {}) {
  return {
    contract: "aralearn.course-audit-finding.v1",
    findingId: FINDING_ID,
    findingVersion: 1,
    courseId: COURSE_ID,
    status: "open",
    origin: "human_audit",
    code: "human_review.factual_quality",
    severity: "high",
    target: {
      studyUnitId: "unit-a",
      observedVersion: 2,
      observedHash: HASH_A,
      currentAvailable,
      currentVersion: currentAvailable ? 2 : null,
      currentHash: currentAvailable ? HASH_A : null,
      path: path()
    },
    auditRun: {
      auditRunId: RUN_ID,
      runKind: "audit",
      courseRevision,
      createdAt: "2026-08-17T12:00:00Z"
    },
    check: check(),
    annotationRefs: [],
    correctionRef: {
      correctionId: CORRECTION_ID,
      correctionVersion: 1,
      status: correctionStatus
    },
    timestamps: {
      createdAt: "2026-08-17T12:00:00Z",
      updatedAt: "2026-08-17T12:10:00Z",
      resolvedAt: null,
      dismissedAt: null
    },
    capabilities: {
      canDismiss: true,
      canReopen: false,
      canProposeCorrection: true,
      canVerify: correctionStatus === "applied"
    },
    deepLinks: {
      detail: `#/authoring/courses/${COURSE_ID}?section=observations&findingId=${FINDING_ID}`,
      target: currentAvailable
        ? `#/authoring/courses/${COURSE_ID}?section=inspection&studyUnitId=unit-a`
        : null
    }
  };
}

function findingAt(index) {
  const item = finding();
  const suffix = String(index).padStart(12, "0");
  item.findingId = `70000000-0000-4000-8000-${suffix}`;
  item.check.checkId = `71000000-0000-4000-8000-${suffix}`;
  item.correctionRef = null;
  item.capabilities.canVerify = false;
  item.deepLinks.detail =
    `#/authoring/courses/${COURSE_ID}?section=observations&findingId=${item.findingId}`;
  return item;
}

function correction({ status = "proposed", courseRevision = 7 } = {}) {
  return {
    contract: "aralearn.course-authoring-correction.v1",
    correctionId: CORRECTION_ID,
    correctionVersion: 1,
    courseId: COURSE_ID,
    findingId: FINDING_ID,
    status,
    target: { studyUnitId: "unit-a", baseVersion: 2, baseHash: HASH_A },
    checkpoint: {
      before: { content: studyContent("Texto anterior."), sourceLinks: [], hash: HASH_A },
      after: { content: studyContent("Texto corrigido."), sourceLinks: [], hash: HASH_B }
    },
    rationale: "Corrigir a afirmação sem alterar a estrutura.",
    application: status === "applied" ? {
      courseRevision,
      targetVersion: 3,
      targetHash: HASH_B,
      appliedAt: "2026-08-17T12:20:00Z"
    } : null,
    verification: null,
    rollback: null,
    timestamps: {
      createdAt: "2026-08-17T12:10:00Z",
      updatedAt: "2026-08-17T12:10:00Z"
    },
    capabilities: {
      canAdjust: status === "proposed",
      canReject: status === "proposed",
      canApply: status === "proposed",
      canVerify: status === "applied",
      canRollback: status === "applied"
    },
    deepLink: `#/authoring/courses/${COURSE_ID}?section=observations&findingId=${FINDING_ID}&correctionId=${CORRECTION_ID}`
  };
}

function summary(matchingTotal = 1) {
  return {
    matchingTotal,
    byState: { open: matchingTotal, awaiting_verification: 0, resolved: 0, dismissed: 0 },
    byDimension: {
      structural_conformance: 0,
      pedagogical_quality: 0,
      factual_quality: matchingTotal,
      editorial_quality: 0
    },
    bySeverity: { low: 0, medium: 0, high: matchingTotal, critical: 0 }
  };
}

function detailPage(options, { status = "proposed", currentAvailable = false } = {}) {
  const selected = correction({ status, courseRevision: options.expectedCourseRevision });
  return {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: options.expectedCourseRevision,
    auditSetVersion: options.auditSetVersion ?? 1,
    query: structuredClone(options.query),
    summary: summary(),
    context: null,
    items: [],
    runs: [],
    detail: {
      finding: finding({
        correctionStatus: status,
        courseRevision: options.expectedCourseRevision,
        currentAvailable
      }),
      findingHistory: [{
        findingVersion: 1,
        status: "open",
        decision: "recorded",
        correctionId: null,
        verificationAuditRunId: null,
        createdAt: "2026-08-17T12:00:00Z"
      }],
      auditRuns: [],
      corrections: [{
        correctionId: CORRECTION_ID,
        correctionVersion: 1,
        status,
        rationale: selected.rationale,
        updatedAt: "2026-08-17T12:10:00Z",
        deepLink: selected.deepLink
      }],
      selectedCorrection: selected,
      selectedCorrectionHistory: [{
        correctionId: CORRECTION_ID,
        correctionVersion: 1,
        status,
        rationale: selected.rationale,
        createdAt: "2026-08-17T12:10:00Z"
      }]
    },
    runDetail: null,
    hasMore: false,
    nextCursor: null
  };
}

function contextPage(options) {
  return {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: options.expectedCourseRevision,
    auditSetVersion: options.auditSetVersion ?? 1,
    query: structuredClone(options.query),
    summary: summary(),
    context: {
      contract: "aralearn.course-audit-context.v1",
      contextHash: HASH_B,
      target: {
        studyUnitId: "unit-a",
        version: 2,
        hash: HASH_A,
        position: 1,
        path: path(),
        content: studyContent("Texto atual."),
        sourceLinks: [{
          sourceId: "fonte-literal",
          sourceRevision: 2,
          relation: "supported_by",
          anchors: [{ anchorId: "anchor-a", anchorRevision: 3 }]
        }]
      },
      didacticMicrosequence: {
        id: "micro-a",
        version: 1,
        hash: HASH_A,
        content: { title: "Microssequência" }
      },
      plan: {
        planId: "60000000-0000-4000-8000-000000000006",
        version: 2,
        audience: "Pessoas iniciantes.",
        instructionalScope: "Explicar o conceito central.",
        authoringGuidance: "Use evidência verificável.",
        items: []
      },
      design: {
        parameters: [{
          parameterId: "scaffolding",
          value: "progressive",
          origin: "course",
          reason: "Apoio gradual.",
          sourceScope: null,
          inherited: true
        }],
        guidance: [],
        componentPolicy: {
          changeId: null,
          policy: {
            availability: "all",
            allowedRefs: [],
            excludedRefs: [],
            preferredRefs: ["aralearn.resource.paragraph"]
          },
          origin: "course",
          reason: "Catálogo padrão.",
          sourceScope: null,
          inherited: true
        }
      },
      intent: {
        query: "Explicação factual",
        slot: "content",
        studyUnitRole: "theory",
        disciplineIds: [],
        structureIds: [],
        taskOperationIds: ["explain"],
        practiceModeIds: [],
        knowledgeObjects: ["conceito"],
        mustPreserve: ["Fonte exata"],
        notationIsLearningObject: false
      },
      sources: [{
        sourceId: "fonte-literal",
        sourceRevision: 2,
        status: "active",
        kind: "book",
        title: "Fonte verificável",
        citationText: "Autoria. Fonte verificável. 2026.",
        url: "https://example.test/fonte",
        editionOrVersion: "2ª edição",
        studyVisibility: "citation",
        relation: "supported_by",
        sourceHash: HASH_A,
        anchors: [{
          anchorId: "anchor-a",
          anchorRevision: 3,
          status: "active",
          selector: { kind: "page_range", startPage: 4, endPage: 4 },
          verificationExcerpt: "Trecho verificável.",
          anchorHash: HASH_B,
          deepLink: `#/authoring/courses/${COURSE_ID}?section=sources&sourceId=fonte-literal&anchorId=anchor-a`
        }],
        deepLink: `#/authoring/courses/${COURSE_ID}?section=sources&sourceId=fonte-literal`
      }],
      annotations: [],
      facts: {
        courseRevision: options.expectedCourseRevision,
        targetVersion: 2,
        targetHash: HASH_A,
        sourceLinksHash: HASH_B,
        planVersion: 2
      }
    },
    items: [],
    runs: [],
    detail: null,
    runDetail: null,
    hasMore: false,
    nextCursor: null
  };
}

function findingsPage(options, items, { hasMore = false, nextCursor = null, matchingTotal = 1 } = {}) {
  return {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: options.expectedCourseRevision,
    auditSetVersion: options.auditSetVersion ?? 1,
    query: structuredClone(options.query),
    summary: summary(matchingTotal),
    context: null,
    items,
    runs: [],
    detail: null,
    runDetail: null,
    hasMore,
    nextCursor
  };
}

function cleanRunSummary({
  auditRunId = CLEAN_RUN_ID,
  createdAt = "2026-08-17T13:00:00Z",
  deepLink = `#/authoring/courses/${COURSE_ID}?section=observations&auditRunId=${auditRunId}`
} = {}) {
  return {
    auditRunId,
    runKind: "audit",
    origin: "automatic_audit",
    method: { id: "aralearn.automatic-course-audit", version: "1" },
    courseRevision: 7,
    target: { studyUnitId: "unit-a", version: 2, hash: HASH_A },
    resultCounts: {
      passed: 4,
      failed: 0,
      uncertain: 0,
      not_applicable: 0,
      not_checked: 0
    },
    findingsCreated: 0,
    createdAt,
    deepLink
  };
}

function cleanRunDetail() {
  const dimensions = [
    "structural_conformance",
    "pedagogical_quality",
    "factual_quality",
    "editorial_quality"
  ];
  const checks = dimensions.map((dimension, index) => ({
    checkId: RUN_CHECK_IDS[index],
    dimension,
    criterion: {
      code: `automatic.${dimension}`,
      version: "1",
      statement: `Critério preservado de ${dimension}.`
    },
    result: "passed",
    publicEvidence: `Evidência pública preservada de ${dimension}.`,
    adequacy: "sufficient",
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: dimension === "factual_quality" ? structuredClone(check().sourceLinks) : []
  }));
  return {
    contract: "aralearn.course-instructional-audit-run.v1",
    auditRunId: CLEAN_RUN_ID,
    runKind: "audit",
    origin: "automatic_audit",
    method: { id: "aralearn.automatic-course-audit", version: "1" },
    courseRevision: 7,
    contextHash: HASH_B,
    target: { studyUnitId: "unit-a", version: 2, hash: HASH_A, path: path() },
    checks,
    metrics: {
      checksTotal: 4,
      byResult: {
        passed: 4,
        failed: 0,
        uncertain: 0,
        not_applicable: 0,
        not_checked: 0
      },
      findingsCreated: 0
    },
    createdAt: "2026-08-17T13:00:00Z"
  };
}

function runsPage(options, runs, { hasMore = false, nextCursor = null } = {}) {
  return {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: options.expectedCourseRevision,
    auditSetVersion: options.auditSetVersion ?? 1,
    query: structuredClone(options.query),
    summary: summary(),
    context: null,
    items: [],
    runs,
    detail: null,
    runDetail: null,
    hasMore,
    nextCursor
  };
}

function runDetailPage(options) {
  return {
    ...runsPage(options, []),
    runDetail: cleanRunDetail()
  };
}

function actionClick(root, action) {
  const node = {
    dataset: { auditAction: action },
    closest(selector) {
      return selector === "[data-audit-action]" ? this : null;
    },
    getAttribute() {
      return null;
    }
  };
  root.listeners.get("click")({ target: node, preventDefault() {} });
}

function deepLinkClick(root, href) {
  let prevented = false;
  const node = {
    dataset: { auditAction: "navigate-deep-link" },
    closest(selector) {
      return selector === "[data-audit-action]" ? this : null;
    },
    getAttribute(name) {
      return name === "href" ? href : null;
    }
  };
  root.listeners.get("click")({
    target: node,
    preventDefault() {
      prevented = true;
    }
  });
  return prevented;
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("deep link de achado abre detalhe e renderiza Before/After reais na 7ª área", async () => {
  const calls = [];
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        calls.push({ courseId, options: structuredClone(options) });
        return detailPage(options);
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.query.mode, "detail");
  assert.equal(calls[0].options.query.findingId, FINDING_ID);
  assert.equal(calls[0].options.query.correctionId, CORRECTION_ID);
  assert.match(root.innerHTML, /Auditoria e correções/u);
  assert.match(root.audit.innerHTML, /data-audit-preview-grid/u);
  assert.match(root.audit.innerHTML, />Antes</u);
  assert.match(root.audit.innerHTML, />Depois</u);
  assert.match(root.audit.innerHTML, /Texto anterior\./u);
  assert.match(root.audit.innerHTML, /Texto corrigido\./u);
  assert.match(root.audit.innerHTML, /Rejeitar correção/u);
  assert.match(root.audit.innerHTML, /Dispensar achado/u);
});

test("apply usa comando versionado, atualiza revisão e nunca cai em audit offline", async () => {
  const writes = [];
  const revisions = [];
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    confirmValue: () => true,
    onCourseRevisionChange: (revision) => revisions.push(revision),
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        return detailPage(options, { status: options.expectedCourseRevision === 7 ? "proposed" : "applied" });
      },
      async mutateCourseAuditCycle(input) {
        writes.push(structuredClone(input));
        return {
          contract: "aralearn.course-audit-cycle-change.v1",
          courseId: COURSE_ID,
          courseRevision: 8,
          auditSetVersion: 2,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: "apply_authoring_correction",
            auditRunId: null,
            findingRefs: [{ findingId: FINDING_ID, findingVersion: 1 }],
            correctionRef: { correctionId: CORRECTION_ID, correctionVersion: 1 }
          },
          finding: null,
          correction: null,
          suggestedAnnotationActions: []
        };
      }
    }
  });
  await panel.open();
  actionClick(root, "apply-correction");
  await settle();

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].command, {
    type: "apply_authoring_correction",
    findingId: FINDING_ID,
    expectedFindingVersion: 1,
    correctionId: CORRECTION_ID,
    expectedCorrectionVersion: 1
  });
  assert.deepEqual(revisions, [8]);
  assert.match(root.audit.innerHTML, /Aplicada/u);

  const offlineRoot = new FakeRoot();
  let reads = 0;
  const offline = createCourseAuditPanel({
    root: offlineRoot,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID },
    navigatorValue: { onLine: false },
    controller: {
      async loadCourseAuditCycle() {
        reads += 1;
      },
      async mutateCourseAuditCycle() {}
    }
  });
  assert.equal(await offline.open(), false);
  assert.equal(reads, 0);
  assert.match(offlineRoot.audit.innerHTML, /Nenhuma ação usa cache offline/u);
  assert.match(offlineRoot.audit.innerHTML, /Auditoria exige conexão de rede/u);
});

test("detalhe carrega contexto pinado, liga Fonte/Âncora literal e abre editor sem JSON", async () => {
  const queries = [];
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        queries.push(structuredClone(options.query));
        return options.query.mode === "context"
          ? contextPage(options)
          : detailPage(options, { currentAvailable: true });
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.deepEqual(queries.map(({ mode }) => mode), ["detail", "context"]);
  assert.match(root.audit.innerHTML, /Fonte verificável/u);
  assert.match(root.audit.innerHTML, /section=sources&amp;sourceId=fonte-literal/u);
  assert.match(root.audit.innerHTML, /anchorId=anchor-a/u);

  actionClick(root, "open-correction-editor");
  await settle();
  assert.match(root.audit.innerHTML, /Editar título e folhas da Unidade/u);
  assert.match(root.audit.innerHTML, /Editar explicação/u);
  assert.doesNotMatch(root.audit.innerHTML, /\{"title"/u);
});

test("deep links externos ou javascript são reduzidos ao hash interno validado", async () => {
  const navigations = [];
  const root = new FakeRoot();
  const canonicalFinding = `#/authoring/courses/${COURSE_ID}?section=observations&findingId=${FINDING_ID}`;
  const canonicalTarget = `#/authoring/courses/${COURSE_ID}?section=inspection&studyUnitId=unit-a`;
  const canonicalCorrection = `${canonicalFinding}&correctionId=${CORRECTION_ID}`;
  const canonicalSource = `#/authoring/courses/${COURSE_ID}?section=sources&sourceId=fonte-literal`;
  const canonicalAnchor = `${canonicalSource}&anchorId=anchor-a`;
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    onNavigate: (hash) => navigations.push(hash),
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        if (options.query.mode === "context") {
          const page = contextPage(options);
          page.context.sources[0].deepLink = `https://external.invalid/source${canonicalSource}`;
          page.context.sources[0].anchors[0].deepLink = `javascript:alert(1)${canonicalAnchor}`;
          return page;
        }
        const page = detailPage(options, { currentAvailable: true });
        page.detail.finding.deepLinks.detail = `javascript:alert(1)${canonicalFinding}`;
        page.detail.finding.deepLinks.target = `https://external.invalid/unit${canonicalTarget}`;
        page.detail.selectedCorrection.deepLink = `https://external.invalid/correction${canonicalCorrection}`;
        page.detail.corrections[0].deepLink = `https://external.invalid/correction${canonicalCorrection}`;
        return page;
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.doesNotMatch(root.audit.innerHTML, /javascript:|external\.invalid/u);
  for (const hash of [canonicalFinding, canonicalTarget, canonicalCorrection, canonicalSource, canonicalAnchor]) {
    assert.ok(
      root.audit.innerHTML.includes(`href="${hash.replaceAll("&", "&amp;")}"`),
      `não renderizou ${hash}`
    );
  }

  assert.equal(deepLinkClick(root, `javascript:alert(1)${canonicalAnchor}`), true);
  assert.deepEqual(navigations, [canonicalAnchor]);
});

test("divisão estrutural permanece achado aberto e não entra no editor v1", async () => {
  let writes = 0;
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    confirmValue: () => true,
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        const page = detailPage(options);
        page.detail.finding.origin = "automatic_audit";
        page.detail.finding.code = "structural.study_unit_requires_split";
        page.detail.finding.check.dimension = "structural_conformance";
        page.detail.finding.check.criterion.code = "structural.study_unit_requires_split";
        page.detail.finding.check.criterion.statement = "A Unidade reúne conceitos que exigem divisão estrutural.";
        page.detail.finding.capabilities.canVerify = true;
        page.detail.selectedCorrection.capabilities.canVerify = true;
        page.summary.byDimension.factual_quality = 0;
        page.summary.byDimension.structural_conformance = 1;
        return page;
      },
      async mutateCourseAuditCycle() {
        writes += 1;
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.match(root.audit.innerHTML, /divisão estrutural não é aplicada pelo editor v1/u);
  assert.match(root.audit.innerHTML, /achado continua aberto/u);
  assert.doesNotMatch(root.audit.innerHTML, /data-audit-action="open-correction-editor"/u);
  assert.doesNotMatch(root.audit.innerHTML, /data-audit-action="apply-correction"/u);
  assert.doesNotMatch(root.audit.innerHTML, /data-audit-action="open-verification"/u);

  actionClick(root, "open-correction-editor");
  actionClick(root, "apply-correction");
  actionClick(root, "open-verification");
  await settle();
  assert.equal(writes, 0);
  assert.doesNotMatch(root.audit.innerHTML, /Editar título e folhas da Unidade/u);
});

test("paginação de achados falha fechada quando o cursor se repete", async () => {
  let findingReads = 0;
  const root = new FakeRoot();
  const secondFinding = finding();
  secondFinding.findingId = "70000000-0000-4000-8000-000000000007";
  secondFinding.deepLinks.detail =
    `#/authoring/courses/${COURSE_ID}?section=observations&findingId=${secondFinding.findingId}`;
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        if (options.query.mode === "detail") return detailPage(options);
        assert.equal(options.query.mode, "findings");
        findingReads += 1;
        return findingsPage(
          options,
          [findingReads === 1 ? finding() : secondFinding],
          { hasMore: true, nextCursor: "cursor-1", matchingTotal: 3 }
        );
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  actionClick(root, "back-findings");
  await settle();
  assert.equal(findingReads, 1);
  assert.match(root.audit.innerHTML, /Próxima página/u);

  actionClick(root, "load-more");
  await settle();
  assert.equal(findingReads, 2);
  assert.match(root.audit.innerHTML, /70000000-0000-4000-8000-000000000007/u);
  assert.doesNotMatch(root.audit.innerHTML, new RegExp(FINDING_ID, "u"));

  actionClick(root, "load-more");
  await settle();
  assert.equal(findingReads, 2);
  assert.match(root.audit.innerHTML, /paginação repetiu um cursor de achados/u);
});

test("janela de achados alcança o 1.024º item sem acumular DTOs e permite voltar", {
  timeout: 120_000
}, async () => {
  const total = 1024;
  let findingReads = 0;
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        if (options.query.mode === "detail") return detailPage(options);
        assert.equal(options.query.mode, "findings");
        assert.equal(options.limit, 12);
        const pageIndex = options.cursor === null
          ? 0
          : Number(options.cursor.replace("cursor-", ""));
        assert.ok(Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < total);
        findingReads += 1;
        return findingsPage(options, [findingAt(pageIndex + 1)], {
          hasMore: pageIndex + 1 < total,
          nextCursor: pageIndex + 1 < total ? `cursor-${pageIndex + 1}` : null,
          matchingTotal: total
        });
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  actionClick(root, "back-findings");
  await settle();
  actionClick(root, "load-more");
  await settle();
  assert.match(root.audit.innerHTML, /Página 2/u);
  actionClick(root, "previous-findings");
  await settle();
  assert.match(root.audit.innerHTML, /Página 1/u);
  assert.doesNotMatch(root.audit.innerHTML, /paginação repetiu um cursor de achados/u);
  actionClick(root, "load-more");
  await settle();
  assert.match(root.audit.innerHTML, /Página 2/u);
  assert.doesNotMatch(root.audit.innerHTML, /paginação repetiu um cursor de achados/u);

  for (let pageNumber = 3; pageNumber <= total; pageNumber += 1) {
    actionClick(root, "load-more");
    await settle();
    if (pageNumber === 21) {
      assert.match(root.audit.innerHTML, /Página 21/u);
      assert.doesNotMatch(root.audit.innerHTML, /limite seguro/u);
    }
  }

  const firstId = findingAt(1).findingId;
  const penultimateId = findingAt(total - 1).findingId;
  const lastId = findingAt(total).findingId;
  assert.equal(findingReads, total + 2);
  assert.equal((root.audit.innerHTML.match(/data-audit-finding-id=/gu) || []).length, 1);
  assert.match(root.audit.innerHTML, new RegExp(lastId, "u"));
  assert.doesNotMatch(root.audit.innerHTML, new RegExp(firstId, "u"));
  assert.match(root.audit.innerHTML, /Página 1024/u);
  assert.doesNotMatch(root.audit.innerHTML, /data-audit-action="load-more"/u);

  actionClick(root, "previous-findings");
  await settle();
  assert.equal(findingReads, total + 3);
  assert.match(root.audit.innerHTML, new RegExp(penultimateId, "u"));
  assert.match(root.audit.innerHTML, /Página 1023/u);
  assert.equal((root.audit.innerHTML.match(/data-audit-finding-id=/gu) || []).length, 1);

  actionClick(root, "load-more");
  await settle();
  assert.equal(findingReads, total + 4);
  assert.match(root.audit.innerHTML, new RegExp(lastId, "u"));
  assert.doesNotMatch(root.audit.innerHTML, /paginação repetiu um cursor de achados/u);
});

test("deep link de rodada abre runDetail limpo e volta à enumeração completa", async () => {
  const queries = [];
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_run", id: CLEAN_RUN_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        queries.push(structuredClone(options.query));
        if (options.query.mode === "detail") return runDetailPage(options);
        const summaryItem = cleanRunSummary();
        summaryItem.deepLink = `javascript:alert(1)${summaryItem.deepLink}`;
        return runsPage(options, [summaryItem]);
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.deepEqual(queries[0], {
    mode: "detail",
    targetStudyUnitId: null,
    findingId: null,
    correctionId: null,
    auditRunId: CLEAN_RUN_ID,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  });
  assert.match(root.audit.innerHTML, new RegExp(`data-audit-run-detail-id="${CLEAN_RUN_ID}"`, "u"));
  assert.match(root.audit.innerHTML, /Rodada automática/u);
  assert.match(root.audit.innerHTML, /Achados criados<\/dt><dd>0/u);
  assert.match(root.audit.innerHTML, /Critério preservado de structural_conformance/u);
  assert.equal((root.audit.innerHTML.match(/class="course-audit-check"/gu) || []).length, 4);
  assert.ok(root.audit.innerHTML.includes(
    `href="#/authoring/courses/${COURSE_ID}?section=observations&amp;auditRunId=${CLEAN_RUN_ID}"`
  ));
  assert.ok(root.audit.innerHTML.includes(
    `href="#/authoring/courses/${COURSE_ID}?section=inspection&amp;studyUnitId=unit-a"`
  ));

  actionClick(root, "back-runs");
  await settle();
  assert.equal(queries[1].mode, "runs");
  assert.equal(queries[1].auditRunId, null);
  assert.match(root.audit.innerHTML, /Nenhum achado criado/u);
  assert.match(root.audit.innerHTML, new RegExp(`data-audit-run-id="${CLEAN_RUN_ID}"`, "u"));
  assert.doesNotMatch(root.audit.innerHTML, /javascript:/u);
  assert.ok(root.audit.innerHTML.includes(
    `href="#/authoring/courses/${COURSE_ID}?section=observations&amp;auditRunId=${CLEAN_RUN_ID}"`
  ));
});

test("paginação de rodadas alcança a 256ª autoridade dentro de 22 páginas", async () => {
  const total = 256;
  let runReads = 0;
  const baseTime = Date.parse("2026-08-17T13:00:00Z");
  const runAt = (index) => cleanRunSummary({
    auditRunId: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    createdAt: new Date(baseTime - index * 1_000).toISOString()
  });
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_run", id: CLEAN_RUN_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        if (options.query.mode === "detail") return runDetailPage(options);
        assert.equal(options.query.mode, "runs");
        assert.equal(options.limit, 12);
        const pageIndex = runReads;
        const start = pageIndex * 12;
        const end = Math.min(start + 12, total);
        assert.equal(options.cursor, pageIndex === 0 ? null : `cursor${pageIndex}`);
        runReads += 1;
        return runsPage(
          options,
          Array.from({ length: end - start }, (_, offset) => runAt(start + offset)),
          { hasMore: end < total, nextCursor: end < total ? `cursor${runReads}` : null }
        );
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  actionClick(root, "back-runs");
  await settle();
  for (let page = 1; page < 22; page += 1) {
    actionClick(root, "load-more-runs");
    await settle();
  }

  const lastId = "90000000-0000-4000-8000-000000000256";
  assert.equal(runReads, 22);
  assert.equal((root.audit.innerHTML.match(/data-audit-run-id=/gu) || []).length, total);
  assert.match(root.audit.innerHTML, new RegExp(lastId, "u"));
  assert.doesNotMatch(root.audit.innerHTML, /Carregar mais rodadas/u);

  actionClick(root, "load-more-runs");
  await settle();
  assert.equal(runReads, 22);
});

test("paginação de rodadas falha fechada sem progresso newest-first", async () => {
  let runReads = 0;
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_run", id: CLEAN_RUN_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        if (options.query.mode === "detail") return runDetailPage(options);
        runReads += 1;
        return runsPage(options, [cleanRunSummary({
          auditRunId: runReads === 1
            ? "91000000-0000-4000-8000-000000000001"
            : "92000000-0000-4000-8000-000000000002",
          createdAt: runReads === 1 ? "2026-08-17T12:00:00Z" : "2026-08-17T13:00:00Z"
        })], { hasMore: true, nextCursor: `cursor${runReads}` });
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  actionClick(root, "back-runs");
  await settle();
  actionClick(root, "load-more-runs");
  await settle();

  assert.equal(runReads, 2);
  assert.match(root.audit.innerHTML, /não avançou na ordem newest-first/u);
  assert.doesNotMatch(root.audit.innerHTML, /92000000-0000-4000-8000-000000000002/u);
});

test("revogação ao enumerar rodadas remove runDetail e checks já carregados", async () => {
  let revoked = false;
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_run", id: CLEAN_RUN_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        if (revoked) throw Object.assign(new Error("Acesso revogado."), { status: 403 });
        return runDetailPage(options);
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.match(root.audit.innerHTML, /Critério preservado de factual_quality/u);
  revoked = true;
  actionClick(root, "back-runs");
  await settle();
  assert.match(root.audit.innerHTML, /Acesso revogado\./u);
  assert.doesNotMatch(root.audit.innerHTML, /Critério preservado|Resumo preservado/u);
});

test("revogação remove do painel os achados e checkpoints já carregados", async () => {
  let revoked = false;
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        if (revoked) throw Object.assign(new Error("Acesso revogado."), { status: 403 });
        return detailPage(options);
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.match(root.audit.innerHTML, /Texto anterior\./u);
  revoked = true;
  actionClick(root, "back-findings");
  await settle();
  assert.match(root.audit.innerHTML, /Acesso revogado\./u);
  assert.doesNotMatch(root.audit.innerHTML, /Texto anterior\.|Texto corrigido\.|Achado preservado/u);
});
