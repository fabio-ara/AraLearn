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
const ANNOTATION_ID = "90000000-0000-4000-8000-000000000009";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

class FakeHost {
  constructor() {
    this.innerHTML = "";
    this.attributes = new Map();
    this.hidden = false;
    this.listeners = new Map();
    this.focusedSelectors = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  querySelector(selector) {
    if (selector.includes("data-audit-action")) {
      return { focus: () => this.focusedSelectors.push(selector) };
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeDocument {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}

class FakeWindow {
  constructor() {
    this.listeners = new Map();
    this.location = { hash: "" };
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
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
      detail: `#/authoring/courses/${COURSE_ID}?section=review&findingId=${FINDING_ID}`,
      target: currentAvailable
        ? `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=unit-a`
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
    `#/authoring/courses/${COURSE_ID}?section=review&findingId=${item.findingId}`;
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
    deepLink: `#/authoring/courses/${COURSE_ID}?section=review&findingId=${FINDING_ID}&correctionId=${CORRECTION_ID}`
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
          changeId: "19",
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
        authorship: "Autoria",
        publicationDate: "2026",
        identifier: null,
        language: "pt-BR",
        citationText: "Autoria. Fonte verificável. 2026.",
        url: "https://example.test/fonte",
        editionOrVersion: "2ª edição",
        origin: "external",
        availability: "open_access",
        verificationStatus: "author_verified",
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
  deepLink = `#/authoring/courses/${COURSE_ID}?section=review&auditRunId=${auditRunId}`
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

function observationAuditClick(root, {
  studyUnitId = "unit-a",
  annotationId = "",
  annotationVersion = ""
} = {}) {
  const node = {
    dataset: {
      observationsAction: "audit-target",
      studyUnitId,
      annotationId,
      annotationVersion
    },
    closest(selector) {
      return selector === "[data-observations-action]" ? this : null;
    }
  };
  root.observations.listeners.get("click")({ target: node, preventDefault() {} });
}

function draftControl({
  name = "",
  value = "",
  type = "textarea",
  checked = false,
  dataset = {},
  documentValue
} = {}) {
  return {
    name,
    value,
    type,
    checked,
    dataset,
    selectionStart: typeof value === "string" ? value.length : null,
    selectionEnd: typeof value === "string" ? value.length : null,
    focusCalls: 0,
    closest(selector) {
      return selector.includes("[data-audit-form]") ? this.form : null;
    },
    focus() {
      this.focusCalls += 1;
      if (documentValue) documentValue.activeElement = this;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
}

function draftForm({ kind, draftId, controls, details = [] }) {
  const form = {
    dataset: { auditForm: kind, auditDraftId: draftId },
    controls,
    elements: {
      namedItem(name) { return controls.find((control) => control.name === name) || null; }
    },
    querySelectorAll(selector) {
      if (selector === "[data-audit-edit-field]") {
        return controls.filter((control) => control.dataset.auditEditField !== undefined);
      }
      if (selector === "[data-audit-source-ref]") {
        return controls.filter((control) => control.dataset.auditSourceRef !== undefined);
      }
      if (selector === "[data-audit-plan-ref]") {
        return controls.filter((control) => control.dataset.auditPlanRef !== undefined);
      }
      if (selector === "[data-audit-parameter-ref]") {
        return controls.filter((control) => control.dataset.auditParameterRef !== undefined);
      }
      if (selector === "[data-audit-annotation-ref]") {
        return controls.filter((control) => control.dataset.auditAnnotationRef !== undefined);
      }
      if (selector === "[data-audit-reference-details]") return details;
      if (selector.includes("[name]") || selector.includes("[data-audit-edit-field]")) {
        return controls;
      }
      return [];
    }
  };
  controls.forEach((control) => { control.form = form; });
  return form;
}

function exposeDraftForm(host, form) {
  host.querySelectorAll = (selector) => selector === "[data-audit-form][data-audit-draft-id]"
    ? [form]
    : [];
}

function submitAuditForm(root, form) {
  root.listeners.get("submit")({
    target: form,
    preventDefault() {}
  });
}

function auditRoundForm({
  kind,
  draftId,
  documentValue = null,
  editorialEvidence = "Evidência editorial preservada."
}) {
  const dimensions = ["pedagogical_quality", "factual_quality", "editorial_quality"];
  const controls = dimensions.flatMap((dimension) => [
    draftControl({
      name: `criterion-code:${dimension}`,
      value: `human_review.${dimension}`,
      type: "text",
      documentValue
    }),
    draftControl({
      name: `criterion-version:${dimension}`,
      value: "1",
      type: "hidden",
      documentValue
    }),
    draftControl({
      name: `criterion-statement:${dimension}`,
      value: `Critério ${dimension}.`,
      documentValue
    }),
    draftControl({
      name: `result:${dimension}`,
      value: dimension === "editorial_quality"
        ? "failed"
        : dimension === "factual_quality" ? "not_checked" : "passed",
      type: "select-one",
      documentValue
    }),
    draftControl({
      name: `evidence:${dimension}`,
      value: dimension === "editorial_quality"
        ? editorialEvidence
        : `Evidência ${dimension}.`,
      documentValue
    }),
    draftControl({
      name: `severity:${dimension}`,
      value: "high",
      type: "select-one",
      documentValue
    })
  ]);
  if (kind === "verify") {
    controls.push(draftControl({
      name: "verification-outcome",
      value: "still_open",
      type: "select-one",
      documentValue
    }));
  }
  return draftForm({ kind, draftId, controls });
}

function observationSupportController() {
  return {
    async loadAuthoringOutline() {
      return {
        contract: "aralearn.course.v1",
        courseId: COURSE_ID,
        title: "Curso auditado",
        goal: "Auditar o Curso.",
        revision: 7,
        ownership: "owned",
        canEdit: true,
        counts: {
          moduleCount: 0,
          lessonCount: 0,
          topicCount: 0,
          microsequenceCount: 0,
          studyUnitCount: 0
        },
        createdAt: "2026-08-17T09:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z",
        outline: {
          courseId: COURSE_ID,
          title: "Curso auditado",
          goal: "Auditar o Curso.",
          modules: []
        },
        deepLink: `#/authoring/courses/${COURSE_ID}?section=content`
      };
    },
    async loadCourseAnchoredAnnotations(_courseId, options) {
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: COURSE_ID,
        courseRevision: 7,
        annotationSetVersion: 0,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: 0,
          byOrigin: {},
          byChannel: {},
          byState: {},
          unclassifiedTotal: 0
        },
        items: [],
        hasMore: false,
        nextCursor: null
      };
    },
    async mutateCourseAnchoredAnnotations() {
      throw new Error("Não deve alterar Observações.");
    }
  };
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
  assert.match(root.audit.innerHTML, /Unidades afetadas<\/dt><dd>1/u);
  assert.match(root.audit.innerHTML, /Tempo registrado<\/dt><dd>10 min/u);
  assert.match(root.audit.innerHTML, /Rejeitar correção/u);
  assert.match(root.audit.innerHTML, /Dispensar achado/u);
  assert.doesNotMatch(root.audit.innerHTML, /request-chat-(?:finding|correction|run)/u);
});

test("detalhes de achado, correção e rodada não expõem compositor paralelo", async () => {
  let writes = 0;
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, title: "Curso auditado", revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(_courseId, options) { return detailPage(options); },
      async mutateCourseAuditCycle() { writes += 1; throw new Error("Não deve alterar."); }
    }
  });
  await panel.open();
  assert.doesNotMatch(root.audit.innerHTML, /ChatGPT|request-chat|copiar pedido/iu);
  assert.match(root.audit.innerHTML, /Correção autoral/u);
  assert.match(root.audit.innerHTML, /Texto anterior\./u);
  assert.match(root.audit.innerHTML, /Texto corrigido\./u);

  const runRoot = new FakeRoot();
  const runPanel = createCourseAuditPanel({
    root: runRoot,
    course: { courseId: COURSE_ID, title: "Curso auditado", revision: 7 },
    routeTarget: { kind: "audit_run", id: CLEAN_RUN_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(_courseId, options) { return runDetailPage(options); },
      async mutateCourseAuditCycle() { writes += 1; throw new Error("Não deve alterar."); }
    }
  });
  await runPanel.open();
  assert.doesNotMatch(runRoot.audit.innerHTML, /ChatGPT|request-chat|copiar pedido/iu);
  assert.match(runRoot.audit.innerHTML, /Checks da rodada/u);

  assert.equal(writes, 0);
  panel.destroy();
  runPanel.destroy();
});

test("Auditoria usa a revisão relida ao atualizar sem perder o detalhe", async () => {
  const revisions = [];
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(_courseId, options) {
        revisions.push(options.expectedCourseRevision);
        return detailPage(options);
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  await panel.open();
  await panel.refresh(8);

  assert.deepEqual(revisions, [7, 8]);
  assert.match(root.audit.innerHTML, /Texto corrigido\./u);
});

test("apply usa comando versionado, atualiza revisão e nunca cai em audit offline", async () => {
  const writes = [];
  const revisions = [];
  const navigations = [];
  const root = new FakeRoot();
  const documentValue = new FakeDocument();
  const tabMoves = [];
  const cancelControl = { focus: () => tabMoves.push("cancel") };
  const confirmControl = { focus: () => tabMoves.push("confirm") };
  root.audit.querySelectorAll = (selector) => selector.includes("data-audit-confirmation")
    ? [cancelControl, confirmControl]
    : [];
  documentValue.activeElement = confirmControl;
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    documentValue,
    onCourseRevisionChange: (revision) => revisions.push(revision),
    onNavigate: (hash) => navigations.push(hash),
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
          suggestedAnnotationActions: [{
            annotationId: ANNOTATION_ID,
            annotationVersion: 3,
            action: "resolve"
          }]
        };
      }
    }
  });
  await panel.open();
  actionClick(root, "apply-correction");
  assert.match(root.audit.innerHTML, /role="alertdialog"/u);
  assert.match(root.audit.innerHTML, /class="course-authoring-confirm-backdrop" data-audit-confirmation-backdrop/u);
  assert.match(root.audit.innerHTML, /role="alertdialog"[^>]*aria-modal="true"/u);
  assert.match(root.audit.innerHTML, /data-confirmation-tone="primary"/u);
  assert.equal(writes.length, 0);
  assert.equal(root.audit.focusedSelectors.at(-1), '[data-audit-action="cancel-confirmation"]');
  let tabPrevented = false;
  root.listeners.get("keydown")({
    key: "Tab",
    target: { closest: () => null },
    preventDefault() { tabPrevented = true; }
  });
  assert.equal(tabPrevented, true);
  assert.equal(tabMoves.at(-1), "cancel");
  root.listeners.get("keydown")({
    key: "Escape",
    target: { closest: () => null },
    preventDefault() {},
    stopPropagation() {}
  });
  assert.doesNotMatch(root.audit.innerHTML, /role="alertdialog"/u);
  assert.equal(root.audit.focusedSelectors.at(-1), '[data-audit-action="apply-correction"]');
  actionClick(root, "apply-correction");
  documentValue.listeners.get("click")({
    target: { matches: (selector) => selector === "[data-audit-confirmation-backdrop]" }
  });
  assert.doesNotMatch(root.audit.innerHTML, /role="alertdialog"/u);
  actionClick(root, "apply-correction");
  actionClick(root, "confirm-mutation");
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
  const suggestionRoute = `#/authoring/courses/${COURSE_ID}?section=review&annotationId=${ANNOTATION_ID}`;
  assert.match(root.audit.innerHTML, /Revisar sugestão de resolução/u);
  assert.doesNotMatch(root.audit.innerHTML, /Observação v3/u);
  assert.equal(deepLinkClick(root, suggestionRoute), true);
  assert.deepEqual(navigations, [suggestionRoute]);
  panel.destroy();
  assert.equal(documentValue.listeners.has("click"), false);

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
  assert.match(offlineRoot.audit.innerHTML, /Sem conexão/u);
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

test("editor preserva título, folha, justificativa e foco após validação local", async () => {
  let writes = 0;
  const root = new FakeRoot();
  const documentValue = new FakeDocument();
  const navigatorValue = { onLine: true };
  const windowValue = new FakeWindow();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue,
    windowValue,
    documentValue,
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        return options.query.mode === "context"
          ? contextPage(options)
          : detailPage(options, { currentAvailable: true });
      },
      async mutateCourseAuditCycle() {
        writes += 1;
        throw new Error("A validação local deveria impedir a escrita.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  actionClick(root, "open-correction-editor");
  await settle();
  const fieldKeys = [...root.audit.innerHTML.matchAll(/data-audit-edit-field="([^"]+)"/gu)]
    .map((match) => match[1]);
  assert.equal(fieldKeys[0], "title");
  assert.ok(fieldKeys.length >= 2);

  const title = draftControl({
    value: "",
    dataset: { auditEditField: "title" },
    documentValue
  });
  const leaf = draftControl({
    value: "Folha <revista> & preservada.",
    dataset: { auditEditField: fieldKeys[1] },
    documentValue
  });
  const rationale = draftControl({
    name: "rationale",
    value: "Justificativa & argumento do autor.",
    documentValue
  });
  const form = draftForm({
    kind: "correction",
    draftId: `correction:${CORRECTION_ID}:1`,
    controls: [title, leaf, rationale]
  });
  exposeDraftForm(root.audit, form);
  documentValue.activeElement = leaf;

  submitAuditForm(root, form);

  assert.equal(writes, 0);
  assert.match(root.audit.innerHTML, /O título da Unidade é obrigatório/u);
  assert.match(root.audit.innerHTML, /data-audit-editor-overlay/u);
  assert.doesNotMatch(root.audit.innerHTML, /request-chat-(?:finding|correction|run)|ChatGPT/u);
  assert.match(root.audit.innerHTML, /data-audit-edit-field="title"[^>]*><\/textarea>/u);
  assert.match(root.audit.innerHTML, /Folha &lt;revista&gt; &amp; preservada\.<\/textarea>/u);
  assert.match(root.audit.innerHTML, /Justificativa &amp; argumento do autor\.<\/textarea>/u);
  assert.ok(leaf.focusCalls >= 1);
  assert.equal(documentValue.activeElement, leaf);

  navigatorValue.onLine = false;
  windowValue.listeners.get("offline")();
  assert.match(root.audit.innerHTML, /Folha &lt;revista&gt; &amp; preservada\.<\/textarea>/u);
  assert.match(root.audit.innerHTML, /Justificativa &amp; argumento do autor\.<\/textarea>/u);
  assert.ok(leaf.focusCalls >= 2);
});

test("verificação preserva valores, referências abertas e foco ao ficar offline e voltar", async () => {
  const root = new FakeRoot();
  const documentValue = new FakeDocument();
  const navigatorValue = { onLine: true };
  const windowValue = new FakeWindow();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue,
    windowValue,
    documentValue,
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        return options.query.mode === "context"
          ? contextPage(options)
          : detailPage(options, { status: "applied", currentAvailable: true });
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve escrever enquanto offline.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  actionClick(root, "open-verification");
  const evidence = draftControl({
    name: "evidence:factual_quality",
    value: "Evidência <nova> & conferida.",
    documentValue
  });
  const outcome = draftControl({
    name: "verification-outcome",
    value: "resolved",
    type: "select-one",
    documentValue
  });
  const sourceRef = draftControl({
    type: "checkbox",
    checked: true,
    dataset: {
      auditSourceRef: "",
      dimension: "factual_quality",
      sourceId: "fonte-literal",
      sourceRevision: "2",
      anchorId: "anchor-a",
      anchorRevision: "3"
    },
    documentValue
  });
  const form = draftForm({
    kind: "verify",
    draftId: `verify:${FINDING_ID}:1:${CORRECTION_ID}:1`,
    controls: [evidence, outcome, sourceRef],
    details: [{
      open: true,
      dataset: { auditReferenceDetails: "factual_quality" }
    }]
  });
  exposeDraftForm(root.audit, form);
  documentValue.activeElement = evidence;
  root.listeners.get("input")({ target: evidence });

  navigatorValue.onLine = false;
  windowValue.listeners.get("offline")();
  assert.match(root.audit.innerHTML, /Sem conexão/u);
  assert.match(root.audit.innerHTML, /Evidência &lt;nova&gt; &amp; conferida\.<\/textarea>/u);
  assert.match(root.audit.innerHTML, /<option value="resolved" selected>O achado foi resolvido/u);
  assert.match(root.audit.innerHTML, /data-anchor-revision="3" checked/u);
  assert.match(root.audit.innerHTML, /data-audit-reference-details="factual_quality" open/u);
  assert.ok(evidence.focusCalls >= 1);

  submitAuditForm(root, form);
  assert.match(root.audit.innerHTML, /Auditoria exige conexão de rede/u);
  assert.match(root.audit.innerHTML, /Evidência &lt;nova&gt; &amp; conferida\.<\/textarea>/u);
  navigatorValue.onLine = true;
  windowValue.listeners.get("online")();
  assert.doesNotMatch(root.audit.innerHTML, /Sem conexão/u);
  assert.match(root.audit.innerHTML, /Evidência &lt;nova&gt; &amp; conferida\.<\/textarea>/u);
  assert.match(root.audit.innerHTML, /<option value="resolved" selected/u);
  assert.ok(evidence.focusCalls >= 3);
});

test("registro de rodada preserva rascunho e foco nas recomposições online e offline", async () => {
  const root = new FakeRoot();
  const documentValue = new FakeDocument();
  const navigatorValue = { onLine: true };
  const windowValue = new FakeWindow();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, title: "Curso auditado", revision: 7 },
    navigatorValue,
    windowValue,
    documentValue,
    controller: {
      async loadCourseAuditCycle(courseId, options) {
        assert.equal(courseId, COURSE_ID);
        return contextPage(options);
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve escrever enquanto offline.");
      },
      async loadAuthoringOutline() {
        return {
          contract: "aralearn.course.v1",
          courseId: COURSE_ID,
          title: "Curso auditado",
          goal: "Auditar o Curso.",
          revision: 7,
          ownership: "owned",
          canEdit: true,
          counts: {
            moduleCount: 0,
            lessonCount: 0,
            topicCount: 0,
            microsequenceCount: 0,
            studyUnitCount: 0
          },
          createdAt: "2026-08-17T09:00:00.000Z",
          updatedAt: "2026-08-17T10:00:00.000Z",
          outline: {
            courseId: COURSE_ID,
            title: "Curso auditado",
            goal: "Auditar o Curso.",
            modules: []
          },
          deepLink: `#/authoring/courses/${COURSE_ID}?section=content`
        };
      },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return {
          contract: "aralearn.course-anchored-annotation-page.v1",
          courseId: COURSE_ID,
          courseRevision: 7,
          annotationSetVersion: 0,
          query: structuredClone(options.query),
          summary: {
            matchingTotal: 0,
            byOrigin: {},
            byChannel: {},
            byState: {},
            unclassifiedTotal: 0
          },
          items: [],
          hasMore: false,
          nextCursor: null
        };
      },
      async mutateCourseAnchoredAnnotations() {
        throw new Error("Não deve alterar Observações.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  observationAuditClick(root);
  await settle();
  actionClick(root, "open-record");
  const evidence = draftControl({
    name: "evidence:editorial_quality",
    value: "Argumento editorial do autor.",
    documentValue
  });
  const result = draftControl({
    name: "result:editorial_quality",
    value: "uncertain",
    type: "select-one",
    documentValue
  });
  const severity = draftControl({
    name: "severity:editorial_quality",
    value: "critical",
    type: "select-one",
    documentValue
  });
  const form = draftForm({
    kind: "record",
    draftId: `record:${HASH_B}`,
    controls: [evidence, result, severity]
  });
  exposeDraftForm(root.audit, form);
  documentValue.activeElement = evidence;
  root.listeners.get("input")({ target: evidence });

  navigatorValue.onLine = false;
  windowValue.listeners.get("offline")();
  assert.match(root.audit.innerHTML, /Argumento editorial do autor\.<\/textarea>/u);
  assert.match(root.audit.innerHTML, /<option value="uncertain" selected>Incerto/u);
  assert.match(root.audit.innerHTML, /<option value="critical" selected>Crítica/u);
  assert.ok(evidence.focusCalls >= 1);

  navigatorValue.onLine = true;
  windowValue.listeners.get("online")();
  assert.match(root.audit.innerHTML, /Argumento editorial do autor\.<\/textarea>/u);
  assert.match(root.audit.innerHTML, /<option value="uncertain" selected/u);
  assert.match(root.audit.innerHTML, /<option value="critical" selected/u);
  assert.ok(evidence.focusCalls >= 2);
});

test("cancelar rodada e Esc no editor descartam o rascunho sem recapturar o DOM anterior", async () => {
  const recordRoot = new FakeRoot();
  const recordDocument = new FakeDocument();
  const recordPanel = createCourseAuditPanel({
    root: recordRoot,
    course: { courseId: COURSE_ID, title: "Curso auditado", revision: 7 },
    navigatorValue: { onLine: true },
    documentValue: recordDocument,
    controller: {
      ...observationSupportController(),
      async loadCourseAuditCycle(_courseId, options) { return contextPage(options); },
      async mutateCourseAuditCycle() { throw new Error("Não deve alterar."); }
    }
  });
  await recordPanel.open();
  observationAuditClick(recordRoot);
  await settle();
  actionClick(recordRoot, "open-record");
  const recordForm = auditRoundForm({
    kind: "record",
    draftId: `record:${HASH_B}`,
    documentValue: recordDocument,
    editorialEvidence: "Rascunho que deve ser descartado."
  });
  exposeDraftForm(recordRoot.audit, recordForm);
  const recordEvidence = recordForm.controls.find(({ name }) =>
    name === "evidence:editorial_quality");
  recordDocument.activeElement = recordEvidence;
  recordRoot.listeners.get("input")({ target: recordEvidence });
  assert.equal(recordPanel.hasPendingDraft(), true);

  actionClick(recordRoot, "cancel-round");
  assert.equal(recordPanel.hasPendingDraft(), false);
  recordRoot.audit.querySelectorAll = () => [];
  actionClick(recordRoot, "open-record");
  assert.doesNotMatch(recordRoot.audit.innerHTML, /Rascunho que deve ser descartado/u);
  assert.match(recordRoot.audit.innerHTML, /Não verificado nesta rodada/u);

  const editorRoot = new FakeRoot();
  const editorDocument = new FakeDocument();
  const editorPanel = createCourseAuditPanel({
    root: editorRoot,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    documentValue: editorDocument,
    controller: {
      async loadCourseAuditCycle(_courseId, options) {
        return options.query.mode === "context"
          ? contextPage(options)
          : detailPage(options, { currentAvailable: true });
      },
      async mutateCourseAuditCycle() { throw new Error("Não deve alterar."); }
    }
  });
  await editorPanel.open();
  actionClick(editorRoot, "open-correction-editor");
  await settle();
  const fieldKeys = [...editorRoot.audit.innerHTML.matchAll(/data-audit-edit-field="([^"]+)"/gu)]
    .map((match) => match[1]);
  const editorForm = draftForm({
    kind: "correction",
    draftId: `correction:${CORRECTION_ID}:1`,
    controls: [
      draftControl({
        value: "Título cancelado",
        dataset: { auditEditField: fieldKeys[0] },
        documentValue: editorDocument
      }),
      draftControl({
        value: "Folha cancelada",
        dataset: { auditEditField: fieldKeys[1] },
        documentValue: editorDocument
      }),
      draftControl({
        name: "rationale",
        value: "Justificativa cancelada",
        documentValue: editorDocument
      })
    ]
  });
  exposeDraftForm(editorRoot.audit, editorForm);
  editorDocument.activeElement = editorForm.controls[1];
  editorRoot.listeners.get("input")({ target: editorForm.controls[1] });
  editorRoot.listeners.get("keydown")({
    key: "Escape",
    target: { closest: () => null },
    preventDefault() {},
    stopPropagation() {}
  });
  editorRoot.audit.querySelectorAll = () => [];
  actionClick(editorRoot, "open-correction-editor");
  await settle();
  assert.doesNotMatch(editorRoot.audit.innerHTML, /Título cancelado|Folha cancelada|Justificativa cancelada/u);
  assert.match(editorRoot.audit.innerHTML, /Texto corrigido\./u);
});

test("submit reaberto de rodada e verificação repete requestId e todos os IDs gerados", async () => {
  const recordWrites = [];
  const recordRoot = new FakeRoot();
  const recordPanel = createCourseAuditPanel({
    root: recordRoot,
    course: { courseId: COURSE_ID, title: "Curso auditado", revision: 7 },
    navigatorValue: { onLine: true },
    controller: {
      ...observationSupportController(),
      async loadCourseAuditCycle(_courseId, options) { return contextPage(options); },
      async mutateCourseAuditCycle(input) {
        recordWrites.push(structuredClone(input));
        throw Object.assign(new TypeError("Failed to fetch"), { code: "failed_to_fetch" });
      }
    }
  });
  await recordPanel.open();
  observationAuditClick(recordRoot);
  await settle();
  actionClick(recordRoot, "open-record");
  const firstRecordForm = auditRoundForm({
    kind: "record",
    draftId: `record:${HASH_B}`,
    editorialEvidence: "Mesma evidência de rodada."
  });
  exposeDraftForm(recordRoot.audit, firstRecordForm);
  submitAuditForm(recordRoot, firstRecordForm);
  await settle();
  actionClick(recordRoot, "open-record");
  const secondRecordForm = auditRoundForm({
    kind: "record",
    draftId: `record:${HASH_B}`,
    editorialEvidence: "Mesma evidência de rodada."
  });
  exposeDraftForm(recordRoot.audit, secondRecordForm);
  submitAuditForm(recordRoot, secondRecordForm);
  await settle();
  assert.equal(recordWrites.length, 2);
  assert.deepEqual(recordWrites[1], recordWrites[0]);

  const verificationWrites = [];
  const verificationRoot = new FakeRoot();
  const verificationPanel = createCourseAuditPanel({
    root: verificationRoot,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(_courseId, options) {
        return options.query.mode === "context"
          ? contextPage(options)
          : detailPage(options, { status: "applied", currentAvailable: true });
      },
      async mutateCourseAuditCycle(input) {
        verificationWrites.push(structuredClone(input));
        throw Object.assign(new TypeError("Failed to fetch"), { code: "failed_to_fetch" });
      }
    }
  });
  await verificationPanel.open();
  actionClick(verificationRoot, "open-verification");
  await settle();
  const verificationDraftId = `verify:${FINDING_ID}:1:${CORRECTION_ID}:1`;
  const firstVerificationForm = auditRoundForm({
    kind: "verify",
    draftId: verificationDraftId,
    editorialEvidence: "Mesma evidência de verificação."
  });
  exposeDraftForm(verificationRoot.audit, firstVerificationForm);
  submitAuditForm(verificationRoot, firstVerificationForm);
  await settle();
  actionClick(verificationRoot, "open-verification");
  const secondVerificationForm = auditRoundForm({
    kind: "verify",
    draftId: verificationDraftId,
    editorialEvidence: "Mesma evidência de verificação."
  });
  exposeDraftForm(verificationRoot.audit, secondVerificationForm);
  submitAuditForm(verificationRoot, secondVerificationForm);
  await settle();
  assert.equal(verificationWrites.length, 2);
  assert.deepEqual(verificationWrites[1], verificationWrites[0]);
});

test("nova correção reaberta após ambiguidade conserva editor, correctionId, requestId e comando", async () => {
  const writes = [];
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(_courseId, options) {
        if (options.query.mode === "context") return contextPage(options);
        const page = detailPage(options, { currentAvailable: true });
        page.detail.finding.correctionRef = null;
        page.detail.corrections = [];
        page.detail.selectedCorrection = null;
        page.detail.selectedCorrectionHistory = [];
        return page;
      },
      async mutateCourseAuditCycle(input) {
        writes.push(structuredClone(input));
        throw Object.assign(new TypeError("Failed to fetch"), { code: "failed_to_fetch" });
      }
    }
  });
  await panel.open();
  actionClick(root, "open-correction-editor");
  await settle();
  const firstDraftId = /data-audit-draft-id="(correction:[^"]+:0)"/u.exec(
    root.audit.innerHTML
  )?.[1];
  assert.ok(firstDraftId);
  const fieldKeys = [...root.audit.innerHTML.matchAll(/data-audit-edit-field="([^"]+)"/gu)]
    .map((match) => match[1]);
  const correctionForm = (draftId) => draftForm({
    kind: "correction",
    draftId,
    controls: [
      draftControl({
        value: "Título proposto",
        dataset: { auditEditField: fieldKeys[0] }
      }),
      draftControl({
        value: "Folha proposta e preservada.",
        dataset: { auditEditField: fieldKeys[1] }
      }),
      draftControl({ name: "rationale", value: "Razão preservada da nova proposta." })
    ]
  });
  const firstForm = correctionForm(firstDraftId);
  exposeDraftForm(root.audit, firstForm);
  submitAuditForm(root, firstForm);
  await settle();
  actionClick(root, "open-correction-editor");
  await settle();
  const secondDraftId = /data-audit-draft-id="(correction:[^"]+:0)"/u.exec(
    root.audit.innerHTML
  )?.[1];
  assert.equal(secondDraftId, firstDraftId);
  assert.match(root.audit.innerHTML, /Título proposto/u);
  assert.match(root.audit.innerHTML, /Folha proposta e preservada\./u);
  assert.match(root.audit.innerHTML, /Razão preservada da nova proposta\./u);
  const secondForm = correctionForm(secondDraftId);
  exposeDraftForm(root.audit, secondForm);
  submitAuditForm(root, secondForm);
  await settle();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], writes[0]);
});

test("deep links externos ou javascript são reduzidos ao hash interno validado", async () => {
  const navigations = [];
  const root = new FakeRoot();
  const canonicalFinding = `#/authoring/courses/${COURSE_ID}?section=review&findingId=${FINDING_ID}`;
  const canonicalTarget = `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=unit-a`;
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

test("divisão estrutural permanece achado aberto e não entra no editor", async () => {
  let writes = 0;
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID, correctionId: CORRECTION_ID },
    navigatorValue: { onLine: true },
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
  assert.match(root.audit.innerHTML, /divisão estrutural permanece pendente/iu);
  assert.match(root.audit.innerHTML, />Aberto<\/span>/u);
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

test("índices vazios omitem métricas e paginação e mantêm atualização icon-first", async () => {
  const root = new FakeRoot();
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, revision: 7 },
    routeTarget: { kind: "audit_finding", id: FINDING_ID },
    navigatorValue: { onLine: true },
    controller: {
      async loadCourseAuditCycle(_courseId, options) {
        if (options.query.mode === "detail") return detailPage(options);
        if (options.query.mode === "findings") {
          return findingsPage(options, [], { matchingTotal: 0 });
        }
        return runsPage(options, []);
      },
      async mutateCourseAuditCycle() {
        throw new Error("Não deve alterar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  actionClick(root, "back-findings");
  await settle();

  assert.match(root.audit.innerHTML, /Nenhum achado corresponde aos filtros\./u);
  assert.doesNotMatch(root.audit.innerHTML, /course-audit-summary|Correspondentes<\/dt>|Página 1/u);
  assert.match(root.audit.innerHTML,
    /data-audit-action="reload-findings" aria-label="Atualizar achados" title="Atualizar achados">/u);
  assert.doesNotMatch(root.audit.innerHTML, />Atualizar<\/button>/u);

  actionClick(root, "show-runs");
  await settle();
  assert.match(root.audit.innerHTML, /Nenhuma rodada foi registrada\./u);
  assert.match(root.audit.innerHTML,
    /data-audit-action="reload-runs" aria-label="Atualizar rodadas" title="Atualizar rodadas"/u);
  assert.doesNotMatch(root.audit.innerHTML, />Atualizar<\/button>/u);
  panel.destroy();
});

test("paginação de achados falha fechada quando o cursor se repete", async () => {
  let findingReads = 0;
  const root = new FakeRoot();
  const secondFinding = finding();
  secondFinding.findingId = "70000000-0000-4000-8000-000000000007";
  secondFinding.deepLinks.detail =
    `#/authoring/courses/${COURSE_ID}?section=review&findingId=${secondFinding.findingId}`;
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
    `href="#/authoring/courses/${COURSE_ID}?section=review&amp;auditRunId=${CLEAN_RUN_ID}"`
  ));
  assert.ok(root.audit.innerHTML.includes(
    `href="#/authoring/courses/${COURSE_ID}?section=content&amp;studyUnitId=unit-a"`
  ));

  actionClick(root, "back-runs");
  await settle();
  assert.equal(queries[1].mode, "runs");
  assert.equal(queries[1].auditRunId, null);
  assert.match(root.audit.innerHTML, /Nenhum achado criado/u);
  assert.match(root.audit.innerHTML, new RegExp(`data-audit-run-id="${CLEAN_RUN_ID}"`, "u"));
  assert.doesNotMatch(root.audit.innerHTML, /javascript:/u);
  assert.ok(root.audit.innerHTML.includes(
    `href="#/authoring/courses/${COURSE_ID}?section=review&amp;auditRunId=${CLEAN_RUN_ID}"`
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

test("Auditoria embute Observações sem reintroduzir fluxo de cópia", async () => {
  const root = new FakeRoot();
  let legacyCallbacks = 0;
  const panel = createCourseAuditPanel({
    root,
    course: { courseId: COURSE_ID, title: "Curso auditado", revision: 7 },
    navigatorValue: { onLine: true },
    onRequestChat() { legacyCallbacks += 1; },
    controller: {
      async loadCourseAuditCycle() { throw new Error("Achados não devem ser lidos."); },
      async mutateCourseAuditCycle() { throw new Error("Não deve alterar auditoria."); },
      async loadAuthoringOutline() {
        return {
          contract: "aralearn.course.v1",
          courseId: COURSE_ID,
          title: "Curso auditado",
          goal: "Auditar o Curso.",
          revision: 7,
          ownership: "owned",
          canEdit: true,
          counts: {
            moduleCount: 0,
            lessonCount: 0,
            topicCount: 0,
            microsequenceCount: 0,
            studyUnitCount: 0
          },
          createdAt: "2026-08-17T09:00:00.000Z",
          updatedAt: "2026-08-17T10:00:00.000Z",
          outline: {
            courseId: COURSE_ID,
            title: "Curso auditado",
            goal: "Auditar o Curso.",
            modules: []
          },
          deepLink: `#/authoring/courses/${COURSE_ID}?section=content`
        };
      },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return {
          contract: "aralearn.course-anchored-annotation-page.v1",
          courseId: COURSE_ID,
          courseRevision: 7,
          annotationSetVersion: 0,
          query: structuredClone(options.query),
          summary: {
            matchingTotal: 0,
            byOrigin: {},
            byChannel: {},
            byState: {},
            unclassifiedTotal: 0
          },
          items: [],
          hasMore: false,
          nextCursor: null
        };
      },
      async mutateCourseAnchoredAnnotations() {
        throw new Error("Não deve alterar Observações.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.match(root.observations.innerHTML, />Registrar<\/button>/u);
  assert.doesNotMatch(root.observations.innerHTML, /ChatGPT|Registrar e copiar|request-chat/iu);
  assert.equal(legacyCallbacks, 0);
  panel.destroy();
});
