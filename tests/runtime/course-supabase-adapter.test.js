import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from
  "../../src/domain/courseDesignParameters.js";
import { RESOURCE_PACKAGE_REGISTRY } from
  "../../src/resources/catalog/resourceCatalog.js";
import { courseVariantComparisonFixture } from
  "../support/courseVariantComparisonFixture.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "20000000-0000-4000-8000-000000000002";
const OTHER_COURSE_ID = "20000000-0000-4000-8000-000000000009";
const PLAN_ID = "30000000-0000-4000-8000-000000000003";
const PART_ID = "40000000-0000-4000-8000-000000000004";
const MATERIALIZATION_ID = "50000000-0000-4000-8000-000000000005";
const STEP_ID = "60000000-0000-4000-8000-000000000006";
const PLAN_ITEM_ID = "70000000-0000-4000-8000-000000000007";
const FOCUS_ID = "80000000-0000-4000-8000-000000000018";
const AUDIT_RUN_ID = "11111111-1111-5111-8111-111111111111";
const AUDIT_FINDING_ID = "22222222-2222-5222-8222-222222222222";
const AUDIT_CORRECTION_ID = "33333333-3333-5333-8333-333333333333";
const AUDIT_ANNOTATION_ID = "44444444-4444-5444-8444-444444444444";
const MCP_RESOURCE =
  "https://project.example/functions/v1/aralearn-authoring-mcp";
const MCP_CLIENT_ID = "90000000-0000-4000-8000-000000000009";
const MCP_PAIRWISE_SUBJECT = "91000000-0000-5000-8000-000000000009";
const MCP_PAIRWISE_SESSION_ID = "92000000-0000-5000-8000-000000000009";
const MCP_SOURCE_SESSION_ID = "93000000-0000-4000-8000-000000000009";

function jwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "assinatura-de-teste"
  ].join(".");
}

const APPLICATION_TOKEN = jwt({
  aud: "authenticated",
  exp: 2_000_000_000,
  iat: 1_700_000_000,
  iss: "https://project.example/auth/v1",
  role: "authenticated",
  sub: USER_ID
});
const MCP_TOKEN = jwt({
  aud: MCP_RESOURCE,
  client_id: MCP_CLIENT_ID,
  exp: 2_000_000_000,
  iat: 1_700_000_000,
  iss: "https://project.example/auth/v1",
  role: "authenticated",
  sub: USER_ID
});

function protectedMcpClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1_000);
  return {
    aal: "aal1",
    aralearn_session_id: MCP_SOURCE_SESSION_ID,
    aud: MCP_RESOURCE,
    client_id: MCP_CLIENT_ID,
    email: "",
    exp: now + 3_600,
    iat: now - 30,
    is_anonymous: false,
    iss: "https://project.example/auth/v1",
    phone: "",
    role: "authenticated",
    scope: "offline_access",
    session_id: MCP_PAIRWISE_SESSION_ID,
    sub: MCP_PAIRWISE_SUBJECT,
    ...overrides
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function syntheticPdf(label = "fixture") {
  return new TextEncoder().encode(
    `%PDF-1.7\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n` +
      "startxref\n42\n%%EOF\n"
  );
}

function pdfSourceDocument(overrides = {}) {
  return {
    kind: "document",
    title: "Documento autorizado",
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "private",
    verificationStatus: "author_verified",
    studyVisibility: "hidden",
    ...overrides
  };
}

const ANNOTATION_ID = "80000000-0000-4000-8000-000000000008";

function anchoredAnnotation({
  channel = "authoring_interface",
  targetKind = "study_unit",
  targetId = "unit-a",
  contributorKind = "protected_person"
} = {}) {
  const path = [
    { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
    { kind: targetKind, id: targetId,
      label: targetKind === "source" ? "Fonte" : "Unidade", version: 2 }
  ];
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId: ANNOTATION_ID,
    annotationVersion: 1,
    courseId: COURSE_ID,
    provenance: { origin: "author", channel },
    contributor: {
      kind: contributorKind,
      role: "author",
      ref: contributorKind === "self" ? "self" : "person-0123456789abcdef",
      label: contributorKind === "self" ? "Você" : "Pessoa autora"
    },
    target: {
      kind: targetKind,
      id: targetId,
      observedPath: path,
      currentAvailable: true,
      currentPath: path,
      deepLink: "https://sql.example/alvo-literal"
    },
    observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 2 },
    rawText: "Possível erro nesta Unidade.",
    category: "possible_error",
    briefSummary: "Possível erro na Unidade",
    subjectClassification: {
      status: "unclassified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      effective: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      correctedAt: null
    },
    state: "open",
    ownerResponse: null,
    timestamps: {
      capturedAt: null,
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
      firstConsideredAt: null,
      respondedAt: null,
      resolvedAt: null,
      withdrawnAt: null
    },
    capabilities: {
      canRevise: true,
      canWithdraw: true,
      canConsider: true,
      canRespond: false,
      canResolve: true,
      canReopen: false,
      canCorrectSubjects: true
    },
    deepLink: "https://sql.example/observacao-literal"
  };
}

function anchoredQuery({ mode = "inbox", targetKind = "study_unit", targetId = null,
  includeDescendants = false } = {}) {
  return {
    mode,
    origins: [],
    channels: [],
    states: ["open"],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: targetId === null ? null : {
      target: { kind: targetKind, id: targetId },
      includeDescendants
    },
    annotationId: null
  };
}

function anchoredPage(query, item = anchoredAnnotation()) {
  return {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    annotationSetVersion: 4,
    query,
    summary: {
      matchingTotal: 1,
      byOrigin: { author: 1 },
      byChannel: { [item.provenance.channel]: 1 },
      byState: { open: 1 },
      unclassifiedTotal: 1
    },
    items: [item],
    hasMore: false,
    nextCursor: null
  };
}

function anchoredChange(item, {
  requestId = "request-annotation-adapter-1",
  courseRevision = 7,
  idempotent = false
} = {}) {
  return {
    contract: "aralearn.course-anchored-annotation-change.v1",
    courseId: COURSE_ID,
    courseRevision,
    annotationSetVersion: 5,
    requestId,
    idempotent,
    changed: !idempotent,
    annotation: item
  };
}

function adapter(fetchImpl, options = {}) {
  return new CourseSupabaseAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "sb_secret_test",
    publishableKey: "sb_publishable_test",
    publicAppUrl: "https://app.example/AraLearn/",
    fetchImpl,
    attempts: 1,
    ...options
  });
}

function auditQuery({ mode = "context", sourceCorrection = false } = {}) {
  return {
    mode,
    targetStudyUnitId: mode === "context" ? "unit-a" : null,
    findingId: mode === "detail" ? AUDIT_FINDING_ID : null,
    correctionId: mode === "detail" && sourceCorrection ? AUDIT_CORRECTION_ID : null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: mode === "context" ? [AUDIT_ANNOTATION_ID] : []
  };
}

function auditSummary({ matchingTotal = 0 } = {}) {
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

function auditPath() {
  return [
    { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
    { kind: "module", id: "module-a", label: "Módulo", version: 1 },
    { kind: "lesson", id: "lesson-a", label: "Lição", version: 1 },
    { kind: "didactic_microsequence", id: "micro-a", label: "Micro", version: 1 },
    { kind: "study_unit", id: "unit-a", label: "Unidade", version: 2 }
  ];
}

test("configuração de serviço recusa schemes executáveis nos deep links", () => {
  assert.throws(() => adapter(async () => json({}), {
    publicAppUrl: "javascript:alert(1)"
  }), /URL pública do AraLearn inválida/u);
  assert.throws(() => adapter(async () => json({}), {
    supabaseUrl: "data:text/plain,segredo"
  }), /SUPABASE_URL inválida/u);
  assert.doesNotThrow(() => adapter(async () => json({}), {
    supabaseUrl: "http://127.0.0.1:54321",
    publicAppUrl: "http://127.0.0.1:4173/AraLearn/"
  }));
});

test("Pesquisa usa uma RPC limitada e acrescenta dicionário e links fora do banco", async () => {
  const calls = [];
  const query = {
    datasets: ["sources"],
    channels: [],
    origins: [],
    states: [],
    from: null,
    to: null,
    limit: 40,
    cursor: null
  };
  const value = adapter(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return json({
      contract: "aralearn.course-authoring-analytics-rows.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      generatedAt: "2026-08-20T09:00:00.000Z",
      query,
      facts: [{
        factId: "source:source-a:1",
        dataset: "sources",
        kind: "source_revision_created",
        occurredAt: "2026-08-20T08:30:00.000Z",
        courseRevision: 7,
        channel: "authoring_interface",
        origin: "author",
        state: "active",
        subject: { kind: "source", id: "source-a", label: "Fonte A" },
        related: null,
        values: { source_revision: 1 },
        missingData: [],
        deepLink: null
      }],
      summary: {
        factCount: 1,
        missingCourseRevisionCount: 0,
        byDataset: [{ key: "sources", value: 1 }],
        byKind: [{
          dataset: "sources",
          kind: "source_revision_created",
          state: "active",
          value: 1
        }]
      },
      nextCursor: null
    });
  });
  const page = await value.getCourseAuthoringAnalytics({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    query
  });

  assert.match(calls[0].url, /get_owned_course_authoring_analytics_for_actor_v1$/u);
  assert.deepEqual(calls[0].body, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_course_revision: 7,
    p_query: query
  });
  assert.equal(page.contract, "aralearn.course-authoring-analytics.v1");
  assert.equal(page.metrics[0].id, "facts_by_kind");
  assert.equal(
    page.facts[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
      "?section=sources"
  );
  assert.equal(page.deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=research`);
});

function auditCheck(dimension = "factual_quality", result = "failed", checkId =
  "55555555-5555-5555-8555-555555555555") {
  const adequacy = {
    passed: "sufficient",
    failed: "insufficient",
    uncertain: "uncertain",
    not_applicable: "not_applicable",
    not_checked: "not_assessed"
  }[result];
  return {
    checkId,
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
    sourceLinks: []
  };
}

function auditContextPage({
  query = auditQuery(),
  sourceId = "  fonte-literal-á  ",
  targetContent = studyUnitUpsert().content
} = {}) {
  const anchorId = "anchor-a";
  const sourceLinks = [{
    sourceId,
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId, anchorRevision: 1 }]
  }];
  return {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    auditSetVersion: 4,
    query,
    summary: auditSummary(),
    context: {
      contract: "aralearn.course-audit-context.v1",
      contextHash: "a".repeat(64),
      target: {
        studyUnitId: "unit-a",
        version: 2,
        hash: "b".repeat(64),
        position: 1,
        path: auditPath(),
        content: structuredClone(targetContent),
        sourceLinks
      },
      didacticMicrosequence: {
        id: "micro-a",
        version: 1,
        hash: "c".repeat(64),
        content: { title: "Micro" }
      },
      plan: {
        planId: PLAN_ID,
        version: 1,
        audience: "",
        instructionalScope: "",
        authoringGuidance: "",
        items: []
      },
      design: {
        parameters: [{
          parameterId: "required_explanation_forms",
          changeId: "20",
          value: ["plain_definition", "concrete_example"],
          origin: "author",
          reason: "Explicitar definição e exemplo.",
          sourceScope: { kind: "course", ref: COURSE_ID },
          inherited: true
        }],
        guidance: [],
        componentPolicy: {
          changeId: null,
          policy: {
            availability: "all",
            allowedRefs: [],
            excludedRefs: [],
            preferredRefs: []
          },
          origin: "system_default",
          reason: "Política padrão.",
          sourceScope: null,
          inherited: false
        }
      },
      intent: {
        query: "explicação",
        slot: "content",
        studyUnitRole: "theory",
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
        status: "active",
        kind: "document",
        title: "Fonte focal",
        authorship: "Autoria",
        publicationDate: "2026",
        identifier: null,
        language: "pt-BR",
        citationText: null,
        url: null,
        editionOrVersion: null,
        origin: "author_provided",
        availability: "private",
        verificationStatus: "author_verified",
        studyVisibility: "hidden",
        relation: "supported_by",
        sourceHash: "d".repeat(64),
        anchors: [{
          anchorId,
          anchorRevision: 1,
          status: "active",
          selector: { kind: "text_quote", exact: "Conteúdo", prefix: null, suffix: null },
          verificationExcerpt: "Conteúdo",
          anchorHash: "e".repeat(64),
          deepLink: null
        }],
        deepLink: null
      }],
      annotations: query.annotationIds.length ? [{
        annotationId: AUDIT_ANNOTATION_ID,
        annotationVersion: 2,
        state: "open",
        category: "possible_error",
        rawText: "Possível erro.",
        briefSummary: "Erro focal",
        target: { kind: "study_unit", id: "unit-a" },
        deepLink: null
      }] : [],
      facts: {
        courseRevision: 7,
        targetVersion: 2,
        targetHash: "b".repeat(64),
        sourceLinksHash: "f".repeat(64),
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
}

function auditFinding({ currentAvailable = true } = {}) {
  return {
    contract: "aralearn.course-audit-finding.v1",
    findingId: AUDIT_FINDING_ID,
    findingVersion: 2,
    courseId: COURSE_ID,
    status: "open",
    origin: "human_audit",
    code: "missing_source_anchor",
    severity: "high",
    target: {
      studyUnitId: "unit-a",
      observedVersion: 2,
      observedHash: "b".repeat(64),
      currentAvailable,
      currentVersion: currentAvailable ? 2 : null,
      currentHash: currentAvailable ? "b".repeat(64) : null,
      path: auditPath()
    },
    auditRun: {
      auditRunId: AUDIT_RUN_ID,
      runKind: "audit",
      courseRevision: 7,
      createdAt: "2026-08-17T12:00:00.000Z"
    },
    check: auditCheck(),
    annotationRefs: [{
      annotationId: AUDIT_ANNOTATION_ID,
      annotationVersion: 2,
      available: true,
      deepLink: null
    }],
    correctionRef: {
      correctionId: AUDIT_CORRECTION_ID,
      correctionVersion: 1,
      status: "proposed"
    },
    timestamps: {
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:01:00.000Z",
      resolvedAt: null,
      dismissedAt: null
    },
    capabilities: {
      canDismiss: true,
      canReopen: false,
      canProposeCorrection: true,
      canVerify: false
    },
    deepLinks: { detail: null, target: null }
  };
}

function auditCorrection() {
  const content = structuredClone(studyUnitUpsert().content);
  return {
    contract: "aralearn.course-authoring-correction.v1",
    correctionId: AUDIT_CORRECTION_ID,
    correctionVersion: 1,
    courseId: COURSE_ID,
    findingId: AUDIT_FINDING_ID,
    status: "proposed",
    target: { studyUnitId: "unit-a", baseVersion: 2, baseHash: "b".repeat(64) },
    checkpoint: {
      before: { content, sourceLinks: [], hash: "1".repeat(64) },
      after: {
        content: { ...content, title: "Unidade corrigida" },
        sourceLinks: [],
        hash: "2".repeat(64)
      }
    },
    rationale: "Corrigir o achado focal.",
    application: null,
    verification: null,
    rollback: null,
    timestamps: {
      createdAt: "2026-08-17T12:02:00.000Z",
      updatedAt: "2026-08-17T12:02:00.000Z"
    },
    capabilities: {
      canAdjust: true,
      canReject: true,
      canApply: true,
      canVerify: false,
      canRollback: false
    },
    deepLink: null
  };
}

function auditDetailPage({ currentAvailable = true } = {}) {
  const finding = auditFinding({ currentAvailable });
  const correction = auditCorrection();
  return {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    auditSetVersion: 4,
    query: auditQuery({ mode: "detail", sourceCorrection: true }),
    summary: auditSummary({ matchingTotal: 1 }),
    context: null,
    items: [],
    runs: [],
    detail: {
      finding,
      findingHistory: [],
      auditRuns: [],
      corrections: [{
        correctionId: correction.correctionId,
        correctionVersion: correction.correctionVersion,
        status: correction.status,
        rationale: correction.rationale,
        updatedAt: correction.timestamps.updatedAt,
        deepLink: null
      }],
      selectedCorrection: correction,
      selectedCorrectionHistory: []
    },
    runDetail: null,
    hasMore: false,
    nextCursor: null
  };
}

function deterministicAuditId(auditRunId, label) {
  const bytes = createHash("sha256").update(`${auditRunId}\0${label}`, "utf8").digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const source = bytes.subarray(0, 16).toString("hex");
  return `${source.slice(0, 8)}-${source.slice(8, 12)}-${source.slice(12, 16)}-` +
    `${source.slice(16, 20)}-${source.slice(20)}`;
}

test("auditoria owner vincula RPC/query e prepara deep links canônicos e limitados", async () => {
  const requests = [];
  let resultPage = auditContextPage();
  const value = adapter(async (url, init) => {
    assert.match(url, /get_owned_course_audit_cycle_for_actor_v1$/u);
    requests.push(JSON.parse(init.body));
    return json(resultPage);
  });
  const query = auditQuery();
  const result = await value.getCourseAuditCycle({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    auditSetVersion: null,
    query,
    cursor: null,
    limit: 1
  });
  assert.deepEqual(requests[0], {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_course_revision: 7,
    p_audit_set_version: null,
    p_query: query,
    p_cursor: null,
    p_limit: 1
  });
  const encodedSource = "%20%20fonte-literal-%C3%A1%20%20";
  assert.equal(result.context.sources[0].sourceId, "  fonte-literal-á  ");
  assert.equal(result.context.design.parameters[0].changeId, "20");
  assert.equal(result.context.sources[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
    `?section=sources&sourceId=${encodedSource}`);
  assert.equal(result.context.sources[0].anchors[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
    `?section=sources&sourceId=${encodedSource}&anchorId=anchor-a`);
  assert.equal(result.context.annotations[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
    `?section=review&annotationId=${AUDIT_ANNOTATION_ID}`);
  assert.doesNotMatch(result.context.sources[0].deepLink, /\+/u);

  const longSourceId = "界".repeat(2_048);
  resultPage = auditContextPage({ sourceId: longSourceId });
  const bounded = await value.getCourseAuditCycle({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    query,
    limit: 1
  });
  assert.equal(bounded.context.sources[0].sourceId, longSourceId);
  assert.equal(bounded.context.sources[0].deepLink, null);
  assert.equal(bounded.context.sources[0].anchors[0].deepLink, null);

  const runsQuery = {
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
  resultPage = {
    ...auditContextPage(),
    query: runsQuery,
    context: null,
    runs: [{
      auditRunId: AUDIT_RUN_ID,
      runKind: "audit",
      origin: "human_audit",
      method: { id: "manual-review", version: "1" },
      courseRevision: 7,
      target: { studyUnitId: "unit-a", version: 2, hash: "b".repeat(64) },
      resultCounts: {
        passed: 1, failed: 1, uncertain: 0, not_applicable: 0, not_checked: 2
      },
      findingsCreated: 1,
      createdAt: "2026-08-17T12:00:00.000Z",
      deepLink: null
    }]
  };
  const runs = await value.getCourseAuditCycle({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    query: runsQuery,
    limit: 12
  });
  assert.equal(runs.runs[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
    `?section=review&auditRunId=${AUDIT_RUN_ID}`);
});

test("detalhe de auditoria liga finding, correção e observação sem link morto do alvo", async () => {
  let resultPage = auditDetailPage();
  const value = adapter(async () => json(resultPage));
  const options = {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    auditSetVersion: 4,
    query: auditQuery({ mode: "detail", sourceCorrection: true }),
    limit: 1
  };
  const result = await value.getCourseAuditCycle(options);
  const base = `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}`;
  assert.equal(result.detail.finding.deepLinks.detail,
    `${base}?section=review&findingId=${AUDIT_FINDING_ID}`);
  assert.equal(result.detail.finding.deepLinks.target,
    `${base}?section=content&studyUnitId=unit-a`);
  assert.equal(result.detail.finding.annotationRefs[0].deepLink,
    `${base}?section=review&annotationId=${AUDIT_ANNOTATION_ID}`);
  assert.equal(result.detail.corrections[0].deepLink,
    `${base}?section=review&findingId=${AUDIT_FINDING_ID}` +
    `&correctionId=${AUDIT_CORRECTION_ID}`);
  assert.equal(result.detail.selectedCorrection.deepLink,
    result.detail.corrections[0].deepLink);

  resultPage = auditDetailPage({ currentAvailable: false });
  const unavailable = await value.getCourseAuditCycle(options);
  assert.equal(unavailable.detail.finding.deepLinks.detail,
    `${base}?section=review&findingId=${AUDIT_FINDING_ID}`);
  assert.equal(unavailable.detail.finding.deepLinks.target, null);
});

test("links opcionais não tornam um detalhe SQL válido ilegível na fronteira de 240 KiB", async () => {
  const resultPage = auditDetailPage();
  const denseRationale = "界".repeat(2_000);
  const denseText = "界".repeat(12_000);
  for (const snapshot of [
    resultPage.detail.selectedCorrection.checkpoint.before,
    resultPage.detail.selectedCorrection.checkpoint.after
  ]) {
    snapshot.content.content[0].data.text = denseText;
  }
  resultPage.detail.selectedCorrection.rationale = denseRationale;
  resultPage.detail.corrections = Array.from({ length: 8 }, (_, index) => ({
    correctionId: index === 0
      ? AUDIT_CORRECTION_ID
      : `33333333-3333-5333-8333-${String(index + 1).padStart(12, "0")}`,
    correctionVersion: 1,
    status: "proposed",
    rationale: denseRationale,
    updatedAt: "2026-08-17T12:02:00.000Z",
    deepLink: null
  }));
  resultPage.detail.selectedCorrectionHistory = Array.from(
    { length: 16 },
    (_, index) => ({
      correctionId: AUDIT_CORRECTION_ID,
      correctionVersion: index + 1,
      status: "proposed",
      rationale: denseRationale,
      createdAt: "2026-08-17T12:02:00.000Z"
    })
  );
  const rawBytes = Buffer.byteLength(JSON.stringify(resultPage), "utf8");
  assert.ok(rawBytes > 210_000, String(rawBytes));
  assert.ok(rawBytes <= 240 * 1024);

  const longPublicUrl = `https://app.example/${"a".repeat(1_750)}`;
  const value = adapter(async () => json(resultPage), { publicAppUrl: longPublicUrl });
  const result = await value.getCourseAuditCycle({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    auditSetVersion: 4,
    query: auditQuery({ mode: "detail", sourceCorrection: true }),
    limit: 1
  });
  assert.ok(Buffer.byteLength(JSON.stringify(result), "utf8") <= 240 * 1024);
  assert.match(result.detail.finding.deepLinks.detail, /findingId=/u);
  assert.equal(
    result.detail.corrections.some(({ deepLink }) => deepLink === null),
    true
  );
});

test("registro de auditoria deriva check estrutural e ids estáveis antes do RPC", async () => {
  const writes = [];
  let writeCount = 0;
  const invalidContext = auditContextPage({ targetContent: { title: "Unidade inválida" } });
  invalidContext.query.annotationIds = [];
  invalidContext.context.annotations = [];
  const requestId = "request-audit-adapter-0001";
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    if (url.endsWith("/get_owned_course_audit_cycle_for_actor_v1")) {
      return json(invalidContext);
    }
    assert.match(url, /execute_course_audit_cycle_command_for_actor_v1$/u);
    writeCount += 1;
    writes.push(payload);
    return json({
      contract: "aralearn.course-audit-cycle-change.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      auditSetVersion: 5,
      requestId,
      idempotent: writeCount > 1,
      changed: true,
      change: {
        type: "record_audit",
        auditRunId: AUDIT_RUN_ID,
        findingRefs: payload.p_command.findings.map(({ findingId }) => ({
          findingId,
          findingVersion: 1
        })),
        correctionRef: null
      },
      finding: null,
      correction: null,
      suggestedAnnotationActions: []
    });
  });
  const humanChecks = [
    auditCheck("pedagogical_quality", "not_checked",
      "66666666-6666-5666-8666-666666666661"),
    auditCheck("factual_quality", "failed",
      "66666666-6666-5666-8666-666666666662"),
    auditCheck("editorial_quality", "not_checked",
      "66666666-6666-5666-8666-666666666663")
  ];
  const command = {
    type: "record_audit",
    auditRunId: AUDIT_RUN_ID,
    targetStudyUnitId: "unit-a",
    contextHash: "a".repeat(64),
    origin: "human_audit",
    method: { id: "manual-review", version: "1" },
    checks: humanChecks,
    findings: []
  };
  const mutation = {
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId,
    expectedCourseRevision: 7,
    command
  };
  await value.executeCourseAuditCycleCommand(mutation);
  await value.executeCourseAuditCycleCommand(mutation);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].p_command, writes[1].p_command);
  assert.deepEqual(writes[0].p_command.checks.slice(1), humanChecks);
  assert.equal(writes[0].p_command.checks[0].dimension, "structural_conformance");
  assert.equal(writes[0].p_command.checks[0].result, "failed");
  assert.equal(writes[0].p_command.checks[0].checkId, deterministicAuditId(
    AUDIT_RUN_ID,
    "aralearn.course-audit.structural-check.v1"
  ));
  assert.equal(writes[0].p_command.findings[0].findingId, deterministicAuditId(
    AUDIT_RUN_ID,
    "aralearn.course-audit.structural-finding.v1"
  ));
  assert.equal(writes[0].p_actor_id, USER_ID);
  assert.equal(writes[0].p_channel, "mcp");
  assert.equal(writes[0].p_expected_course_revision, 7);

  const validWrites = [];
  const validContext = auditContextPage();
  validContext.query.annotationIds = [];
  validContext.context.annotations = [];
  const validAdapter = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    if (url.endsWith("/get_owned_course_audit_cycle_for_actor_v1")) {
      return json(validContext);
    }
    validWrites.push(payload);
    return json({
      contract: "aralearn.course-audit-cycle-change.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      auditSetVersion: 5,
      requestId: "request-audit-adapter-valid-0001",
      idempotent: false,
      changed: true,
      change: {
        type: "record_audit",
        auditRunId: AUDIT_RUN_ID,
        findingRefs: [],
        correctionRef: null
      },
      finding: null,
      correction: null,
      suggestedAnnotationActions: []
    });
  });
  await validAdapter.executeCourseAuditCycleCommand({
    ...mutation,
    requestId: "request-audit-adapter-valid-0001"
  });
  assert.equal(validWrites[0].p_command.checks[0].result, "passed");
  assert.equal(validWrites[0].p_command.findings.length, 0);
  assert.match(validWrites[0].p_command.checks[0].publicEvidence,
    /encaixe semântico permanece para a auditoria humana/iu);
});

test("retry alcança o receipt antes do enriquecimento nos três comandos contextuais", async () => {
  const humanChecks = [
    auditCheck("pedagogical_quality", "not_checked",
      "66666666-6666-5666-8666-666666666661"),
    auditCheck("factual_quality", "failed",
      "66666666-6666-5666-8666-666666666662"),
    auditCheck("editorial_quality", "not_checked",
      "66666666-6666-5666-8666-666666666663")
  ];
  const commands = [{
    type: "record_audit",
    auditRunId: AUDIT_RUN_ID,
    targetStudyUnitId: "unit-a",
    contextHash: "a".repeat(64),
    origin: "human_audit",
    method: { id: "manual-review", version: "1" },
    checks: humanChecks,
    findings: []
  }, {
    type: "propose_authoring_correction",
    correctionId: AUDIT_CORRECTION_ID,
    findingId: AUDIT_FINDING_ID,
    expectedFindingVersion: 2,
    expectedCorrectionVersion: 0,
    afterContent: {
      ...structuredClone(studyUnitUpsert().content),
      title: "Unidade corrigida"
    },
    afterSourceLinks: [],
    rationale: "Corrigir o achado focal."
  }, {
    type: "verify_finding",
    auditRunId: AUDIT_RUN_ID,
    findingId: AUDIT_FINDING_ID,
    expectedFindingVersion: 3,
    correctionId: AUDIT_CORRECTION_ID,
    expectedCorrectionVersion: 2,
    contextHash: "a".repeat(64),
    origin: "human_audit",
    method: { id: "manual-review", version: "1" },
    checks: humanChecks,
    outcome: "still_open"
  }];

  for (const [index, command] of commands.entries()) {
    const writes = [];
    let firstAttempt = true;
    const requestId = `request-audit-replay-${index + 1}`;
    const value = adapter(async (url, init) => {
      assert.match(url, /execute_course_audit_cycle_command_for_actor_v1$/u);
      const payload = JSON.parse(init.body);
      writes.push(payload);
      if (writes.length === 1) throw new Error("resposta perdida após o commit");
      return json({
        contract: "aralearn.course-audit-cycle-change.v1",
        courseId: COURSE_ID,
        courseRevision: 7,
        auditSetVersion: 5,
        requestId,
        idempotent: true,
        changed: true,
        change: {
          type: command.type,
          auditRunId: command.auditRunId ?? null,
          findingRefs: command.type === "record_audit" ? [] : [{
            findingId: AUDIT_FINDING_ID,
            findingVersion: command.expectedFindingVersion + 1
          }],
          correctionRef: command.correctionId == null ? null : {
            correctionId: AUDIT_CORRECTION_ID,
            correctionVersion: Math.max(1, command.expectedCorrectionVersion + 1)
          }
        },
        finding: null,
        correction: null,
        suggestedAnnotationActions: []
      });
    });
    value.getCourseAuditCycle = async ({ query }) => {
      if (!firstAttempt) {
        throw new AuthoringApiError(
          409,
          "stale_course_state",
          "O Curso mudou; releia o estado e tente novamente."
        );
      }
      if (query.mode === "detail") {
        return {
          auditSetVersion: 4,
          detail: {
            finding: {
              target: { studyUnitId: "unit-a" },
              annotationRefs: []
            }
          }
        };
      }
      return auditContextPage();
    };
    const mutation = {
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId,
      expectedCourseRevision: 7,
      command
    };
    await assert.rejects(() => value.executeCourseAuditCycleCommand(mutation));
    firstAttempt = false;
    const replay = await value.executeCourseAuditCycleCommand(mutation);
    assert.equal(replay.idempotent, true);
    assert.equal(writes.length, 2);
    assert.equal(writes[1].p_command.__replayOnly, true);
    assert.equal(writes[1].p_command.type, command.type);
    if (new Set(["record_audit", "verify_finding"]).has(command.type)) {
      assert.equal(writes[0].p_command.checks.length, 4);
      assert.equal(writes[1].p_command.checks.length, 3);
    }
  }
});

test("proposta reidrata e valida somente a StudyUnit existente antes do RPC", async () => {
  const writes = [];
  const value = adapter(async (url, init) => {
    assert.match(url, /execute_course_audit_cycle_command_for_actor_v1$/u);
    const payload = JSON.parse(init.body);
    writes.push(payload);
    return json({
      contract: "aralearn.course-audit-cycle-change.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      auditSetVersion: 5,
      requestId: "request-audit-correction-1",
      idempotent: false,
      changed: true,
      change: {
        type: "propose_authoring_correction",
        auditRunId: null,
        findingRefs: [{ findingId: AUDIT_FINDING_ID, findingVersion: 2 }],
        correctionRef: { correctionId: AUDIT_CORRECTION_ID, correctionVersion: 1 }
      },
      finding: null,
      correction: null,
      suggestedAnnotationActions: []
    });
  });
  const reads = [];
  value.getCourseAuditCycle = async ({ query }) => {
    reads.push(query);
    if (query.mode === "detail") {
      return {
        auditSetVersion: 4,
        detail: {
          finding: {
            target: { studyUnitId: "unit-a" },
            annotationRefs: []
          }
        }
      };
    }
    return {
      context: {
        target: {
          studyUnitId: "unit-a",
          position: 1,
          content: structuredClone(studyUnitUpsert().content)
        }
      }
    };
  };
  const command = {
    type: "propose_authoring_correction",
    correctionId: AUDIT_CORRECTION_ID,
    findingId: AUDIT_FINDING_ID,
    expectedFindingVersion: 2,
    expectedCorrectionVersion: 0,
    afterContent: {
      ...structuredClone(studyUnitUpsert().content),
      title: "Unidade corrigida"
    },
    afterSourceLinks: [],
    rationale: "Corrigir o achado focal."
  };
  await value.executeCourseAuditCycleCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-audit-correction-1",
    expectedCourseRevision: 7,
    command
  });
  assert.deepEqual(reads.map(({ mode }) => mode), ["detail", "context"]);
  assert.deepEqual(writes[0].p_command.afterContent, command.afterContent);
  assert.equal(writes[0].p_command.afterContent.title, "Unidade corrigida");
  assert.deepEqual(writes[0].p_command.afterContent.topics, []);
  assert.equal(Object.hasOwn(writes[0].p_command.afterContent, "id"), false);
  assert.equal(Object.hasOwn(writes[0].p_command.afterContent, "position"), false);
  assert.equal(writes[0].p_channel, "application");

  await assert.rejects(() => value.executeCourseAuditCycleCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-audit-correction-2",
    expectedCourseRevision: 7,
    command: { ...command, afterContent: { title: "Incompleta" } }
  }), (error) => error.code === "invalid_course_audit_candidate");
  assert.equal(writes.length, 1);
});

test("observações owner preservam projeção protegida, links literais e parâmetros ligados", async () => {
  const query = anchoredQuery({ mode: "target", targetId: "unit-a" });
  const item = anchoredAnnotation();
  let request = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /get_owned_course_anchored_annotations_for_actor_v1$/u);
    request = JSON.parse(init.body);
    return json(anchoredPage(
      Object.fromEntries(Object.entries(query).reverse()),
      item
    ));
  });

  const result = await value.getCourseAnchoredAnnotations({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    annotationSetVersion: null,
    query,
    cursor: null,
    limit: 12
  });

  assert.deepEqual(request, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_course_revision: 7,
    p_annotation_set_version: null,
    p_mode: "target",
    p_origins: [],
    p_channels: [],
    p_states: ["open"],
    p_categories: [],
    p_include_uncategorized: true,
    p_subject_ids: [],
    p_target_kind: "study_unit",
    p_target_id: "unit-a",
    p_include_descendants: false,
    p_annotation_id: null,
    p_cursor: null,
    p_limit: 12
  });
  assert.equal(result.items[0].contributor.kind, "protected_person");
  assert.equal(result.items[0].contributor.ref, "person-0123456789abcdef");
  assert.equal(result.items[0].target.deepLink, "https://sql.example/alvo-literal");
  assert.equal(result.items[0].deepLink, "https://sql.example/observacao-literal");
});

test("Adapter consulta Fonte e envia a proveniência declarada da reformulação", async () => {
  const calls = [];
  const query = anchoredQuery({
    mode: "target",
    targetKind: "source",
    targetId: "source-a",
    includeDescendants: true
  });
  const consideredSourceLinks = [{
    sourceId: "source-a",
    sourceRevision: 2,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 3 }]
  }];
  const responseItem = anchoredAnnotation({
    targetKind: "source",
    targetId: "source-a",
    contributorKind: "self"
  });
  responseItem.annotationVersion = 2;
  responseItem.ownerResponse = {
    text: "Interpretação reformulada.",
    kind: "reformulation",
    consideredSourceLinks,
    updatedAt: "2026-08-20T12:00:00.000Z"
  };
  responseItem.timestamps.respondedAt = "2026-08-20T12:00:00.000Z";
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (/get_owned_course_anchored_annotations_for_actor_v1$/u.test(url)) {
      return json(anchoredPage(query, anchoredAnnotation({
        targetKind: "source",
        targetId: "source-a"
      })));
    }
    return json(anchoredChange(responseItem, {
      requestId: "request-source-reformulation-1"
    }));
  });

  await value.getCourseAnchoredAnnotations({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    annotationSetVersion: null,
    query,
    cursor: null,
    limit: 24
  });
  assert.equal(calls[0].body.p_target_kind, "source");
  assert.equal(calls[0].body.p_target_id, "source-a");
  assert.equal(calls[0].body.p_include_descendants, true);

  const command = {
    type: "respond_to_anchored_annotation",
    annotationId: ANNOTATION_ID,
    expectedAnnotationVersion: 1,
    ownerResponse: "Interpretação reformulada.",
    responseKind: "reformulation",
    consideredSourceLinks
  };
  const result = await value.executeCourseAnchoredAnnotationCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-reformulation-1",
    expectedCourseRevision: null,
    command
  });
  assert.deepEqual(calls[1].body.p_command, command);
  assert.deepEqual(result.annotation.ownerResponse.consideredSourceLinks,
    consideredSourceLinks);
});

test("observações owner limitam cada resposta a 262144 bytes", async () => {
  const value = adapter(async () => new Response("{}", {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "262145"
    }
  }));
  await assert.rejects(
    () => value.getCourseAnchoredAnnotations({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      expectedCourseRevision: 7,
      annotationSetVersion: null,
      query: anchoredQuery(),
      cursor: null,
      limit: 12
    }),
    (error) => error.status === 413 &&
      error.code === "course_anchored_annotations_response_too_large"
  );
  await assert.rejects(
    () => value.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-annotation-large-1",
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId: ANNOTATION_ID,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "Texto",
        category: null,
        capturedAt: null,
        briefSummary: null
      }
    }),
    (error) => error.status === 413 &&
      error.code === "course_anchored_annotations_response_too_large"
  );
});

test("observação ou alvo ausente não apagam o sinal distinto de acesso revogado", async () => {
  for (const code of [
    "course_anchored_annotation_not_found",
    "course_anchored_annotation_target_not_found",
    "PT404"
  ]) {
    const value = adapter(async () => json({ code, message: "ausente" }, 400));
    await assert.rejects(
      () => value.getCourseAnchoredAnnotations({
        principal: { actorId: USER_ID, authenticationKind: "application" },
        courseId: COURSE_ID,
        expectedCourseRevision: 7,
        annotationSetVersion: null,
        query: anchoredQuery(),
        cursor: null,
        limit: 12
      }),
      (error) => error.status === 404 && error.code === code
    );
  }
});

test("canal autoral deriva somente da principal e criação liga alvo confirmado", async () => {
  for (const [authenticationKind, expectedChannel, suffix] of [
    ["application", "authoring_interface", "app"],
    ["oauth", "authoring_chat", "chat"],
    ["action", "authoring_chat", "actions"]
  ]) {
    let request = null;
    const requestId = `request-annotation-${suffix}-1`;
    const value = adapter(async (url, init) => {
      assert.match(url, /execute_course_anchored_annotation_command_for_actor_v1$/u);
      request = JSON.parse(init.body);
      return json(anchoredChange(anchoredAnnotation({
        channel: expectedChannel,
        contributorKind: "self"
      }), { requestId }));
    });
    const command = {
      type: "create_anchored_annotation",
      annotationId: ANNOTATION_ID,
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro nesta Unidade.",
      category: "possible_error",
      capturedAt: null,
      briefSummary: "Possível erro na Unidade"
    };

    const result = await value.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind },
      courseId: COURSE_ID,
      requestId,
      expectedCourseRevision: 7,
      command
    });
    assert.equal(result.annotation.provenance.channel, expectedChannel);
    assert.equal(request.p_channel, expectedChannel);
    assert.deepEqual(request.p_command, command);
    assert.equal(Object.hasOwn(request.p_command, "channel"), false);
    assert.equal(Object.hasOwn(request.p_command, "origin"), false);
  }

  const mismatched = adapter(async () => json(anchoredChange(
    anchoredAnnotation({ targetId: "unit-b", contributorKind: "self" }),
    { requestId: "request-annotation-target-1" }
  )));
  await assert.rejects(
    () => mismatched.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-annotation-target-1",
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId: ANNOTATION_ID,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "Possível erro nesta Unidade.",
        category: "possible_error",
        capturedAt: null,
        briefSummary: null
      }
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("replay idempotente aceita revisão corrente sem relaxar identidade e alvo", async () => {
  const requestId = "request-annotation-replay-1";
  const value = adapter(async () => json(anchoredChange(
    anchoredAnnotation({ contributorKind: "self" }),
    { requestId, courseRevision: 8, idempotent: true }
  )));
  const result = await value.executeCourseAnchoredAnnotationCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId,
    expectedCourseRevision: 7,
    command: {
      type: "create_anchored_annotation",
      annotationId: ANNOTATION_ID,
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro nesta Unidade.",
      category: "possible_error",
      capturedAt: null,
      briefSummary: null
    }
  });
  assert.equal(result.idempotent, true);
  assert.equal(result.courseRevision, 8);
  assert.equal(result.annotation.annotationId, ANNOTATION_ID);

  const regressed = adapter(async () => json(anchoredChange(
    anchoredAnnotation({ contributorKind: "self" }),
    { requestId, courseRevision: 6, idempotent: true }
  )));
  await assert.rejects(
    () => regressed.executeCourseAnchoredAnnotationCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId,
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId: ANNOTATION_ID,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "Possível erro nesta Unidade.",
        category: "possible_error",
        capturedAt: null,
        briefSummary: null
      }
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

function componentCatalog() {
  return {
    version: "1-3e5629f8",
    options: RESOURCE_PACKAGE_REGISTRY.listCatalog().map((manifest) => ({
      ref: `${manifest.id}@${manifest.version}`,
      label: manifest.label,
      purpose: manifest.purpose
    }))
  };
}

function defaultComponentPolicy(excludedRefs = []) {
  return {
    catalogVersion: "1-3e5629f8",
    availability: "all",
    allowedRefs: [],
    excludedRefs,
    preferredRefs: []
  };
}

function studyUnitUpsert() {
  return {
    entityType: "study_unit",
    entityId: "unit-a",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 1,
    content: {
      title: "Unidade A",
      role: "theory",
      content: [{
        id: "paragraph-a",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Conteúdo explicado." }
      }],
      response: null,
      feedback: [],
      topics: []
    }
  };
}

function contextParameters() {
  return COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
    parameterId: definition.id,
    value: structuredClone(definition.defaultValue),
    origin: "system_default",
    reason: "Hipótese padrão de produto.",
    sourceScope: null
  }));
}

function designContext({ excludedRefs = [], targets = true, contextSources = [] } = {}) {
  const inheritedPolicy = excludedRefs.length
    ? {
        changeId: "1",
        policy: defaultComponentPolicy(excludedRefs),
        origin: "author",
        reason: "Componente excluído pelo autor.",
        sourceScope: { kind: "course", ref: COURSE_ID }
      }
    : {
        changeId: null,
        policy: defaultComponentPolicy(),
        origin: "system_default",
        reason: "Todos os componentes instalados estão disponíveis por padrão.",
        sourceScope: null
      };
  return {
    contract: "aralearn.course-design-context.v2",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    componentCatalogVersion: "1-3e5629f8",
    instructionalAnalysisUnits: [{
      id: PLAN_ID,
      position: 0,
      statement: "Explicar a relação entre configuração e concessão.",
      version: 1
    }],
    evidenceRequirements: [{
      id: STEP_ID,
      position: 0,
      statement: "Explica a relação em dois casos distintos.",
      version: 1
    }],
    guidanceRevisions: [],
    targets: targets ? [{
      didacticMicrosequenceId: "micro-a",
      instructionalAnalysisUnitIds: [PLAN_ID],
      evidenceRequirementIds: [STEP_ID],
      parameters: contextParameters(),
      guidanceRevisionIds: [],
      componentPolicy: inheritedPolicy,
      sourceAttributions: {
        instructionalAnalysisUnits: [{
          planItemId: PLAN_ID,
          planItemVersion: 1,
          targetHash: "b".repeat(64),
          attributionRevision: 1,
          attributionHash: "c".repeat(64),
          sources: structuredClone(contextSources)
        }],
        evidenceRequirements: [{
          planItemId: STEP_ID,
          planItemVersion: 1,
          targetHash: "d".repeat(64),
          attributionRevision: 1,
          attributionHash: "e".repeat(64),
          sources: []
        }]
      }
    }] : []
  };
}

function runningMaterialization({
  excludedRefs = [],
  stepKind = "didactic_microsequence_materialization",
  contextSources = []
} = {}) {
  const didactic = stepKind === "didactic_microsequence_materialization";
  const step = {
    id: STEP_ID,
    position: 0,
    kind: stepKind,
    targetDidacticMicrosequenceId: didactic ? "micro-a" : null,
    productionPosition: didactic ? 0 : null,
    status: "pending",
    version: 1,
    resultFacts: {},
    updatedAt: "2026-08-17T10:00:00Z",
    completedAt: null
  };
  return {
    contract: "aralearn.course-authoring-part-materialization.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    materialization: {
      id: MATERIALIZATION_ID,
      authoringPartVersion: 2,
      channel: "mcp",
      status: "running",
      version: 1,
      designContext: designContext({ excludedRefs, contextSources }),
      contextHash: "a".repeat(64),
      resultFacts: {},
      startedAt: "2026-08-17T10:00:00Z",
      updatedAt: "2026-08-17T10:00:00Z",
      completedAt: null,
      steps: [step],
      nextPendingStep: step
    }
  };
}

function materializationChange({
  operation = "start",
  channel = "mcp",
  stepKind = "context_load",
  version = 1,
  authoringPartVersion = 1,
  completedStepCount = 0,
  failedStepCount = 0,
  status = "running",
  contextSources = []
} = {}) {
  const didactic = stepKind === "didactic_microsequence_materialization";
  const completed = operation === "record_step";
  const nextPendingStep = status === "running" && !completed && failedStepCount === 0
    ? {
        id: STEP_ID,
        position: 0,
        kind: stepKind,
        targetDidacticMicrosequenceId: didactic ? "micro-a" : null,
        productionPosition: didactic ? 0 : null
      }
    : null;
  return {
    contract: "aralearn.course-authoring-materialization-change.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    operation,
    channel,
    changed: true,
    idempotent: false,
    materialization: {
      id: MATERIALIZATION_ID,
      status,
      version,
      authoringPartVersion,
      completedStepCount,
      failedStepCount,
      totalStepCount: 1,
      nextPendingStep,
      updatedAt: "2026-08-17T10:01:00Z",
      completedAt: status === "running" ? null : "2026-08-17T10:01:00Z",
      designContext: designContext({ targets: didactic, contextSources }),
      contextHash: "a".repeat(64)
    },
    step: completed ? {
      id: STEP_ID,
      status: failedStepCount ? "failed" : "completed",
      version: 2
    } : null,
    entities: {
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      linkedDidacticMicrosequenceId: didactic && completed ? "micro-a" : null
    }
  };
}

function courseDesignRead() {
  return {
    contract: "aralearn.course-design.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    parameterCatalogVersion: "1.0.0",
    scopeContext: {
      current: { kind: "course", ref: COURSE_ID, label: "Curso" },
      ancestors: [],
      children: [],
      childCount: 0,
      hasMoreChildren: false,
      nextChildCursor: null
    },
    targetPlanItems: null,
    definitions: structuredClone(COURSE_DESIGN_PARAMETER_DEFINITIONS),
    parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
      parameterId: definition.id,
      localAssignment: null,
      effectiveAssignment: {
        changeId: null,
        value: structuredClone(definition.defaultValue),
        origin: "system_default",
        reason: "Hipótese padrão de produto.",
        sourceScope: null,
        inherited: false
      }
    })),
    guidance: { localRevision: null, effectiveRevisions: [] },
    componentCatalog: componentCatalog(),
    componentPolicy: {
      localChange: null,
      effectiveChange: {
        changeId: null,
        policy: defaultComponentPolicy(),
        origin: "system_default",
        reason: "Todos os componentes instalados estão disponíveis por padrão.",
        sourceScope: null,
        inherited: false
      }
    },
    recentApplications: []
  };
}

test("interrompe a leitura quando a resposta do banco excede o teto em bytes", async () => {
  let cancelled = false;
  const encoder = new TextEncoder();
  const value = adapter(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"items":["'));
      controller.enqueue(encoder.encode("x".repeat(80)));
      controller.enqueue(encoder.encode('"]}'));
    },
    cancel() {
      cancelled = true;
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }), { responseLimitBytes: 64 });

  await assert.rejects(
    () => value.listCourses({ principal: { actorId: USER_ID } }),
    (error) => error.status === 413 && error.code === "course_response_too_large"
  );
  assert.equal(cancelled, true);
});

test("autentica sessão do aplicativo sem resolver governança paralela", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, init });
    return json({ id: USER_ID });
  });
  const principal = await value.resolveApplicationPrincipal(APPLICATION_TOKEN);

  assert.deepEqual(principal, {
    actorId: USER_ID,
    authenticationKind: "application",
    scopes: ["authoring:read", "authoring:write"]
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/user$/u);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${APPLICATION_TOKEN}`);
});

test("recusa token OAuth do MCP antes de consultar a identidade do aplicativo", async () => {
  let calls = 0;
  const value = adapter(async () => {
    calls += 1;
    return json({ id: USER_ID });
  });

  await assert.rejects(
    () => value.resolveApplicationPrincipal(MCP_TOKEN),
    (error) => error.status === 401 && error.code === "invalid_application_token"
  );
  assert.equal(calls, 0);
});

test("autentica o MCP pela assinatura e pela autorização viva sem reutilizar o bearer no Auth", async () => {
  const calls = [];
  const verifierCalls = [];
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return json({
      contract: "aralearn.mcp-oauth-principal.v1",
      actorId: USER_ID,
      oauthClientId: MCP_CLIENT_ID
    });
  }, {
    oauthJwtVerifier: {
      async verify(token, options) {
        verifierCalls.push({ token, options });
        return protectedMcpClaims();
      }
    }
  });

  const principal = await value.resolvePrincipal({
    kind: "oauth",
    credential: "token-assinado",
    resource: MCP_RESOURCE
  }, { deadlineAt: 2_000_000_000_000 });

  assert.deepEqual(principal, {
    actorId: USER_ID,
    authenticationKind: "oauth",
    scopes: ["authoring:read", "authoring:write"],
    oauthClientId: MCP_CLIENT_ID
  });
  assert.deepEqual(verifierCalls, [{
    token: "token-assinado",
    options: { deadlineAt: 2_000_000_000_000 }
  }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/resolve_mcp_oauth_principal_v1$/u);
  assert.equal(calls[0].init.headers.apikey, "sb_secret_test");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(calls[0].body, {
    p_pairwise_sub: MCP_PAIRWISE_SUBJECT,
    p_pairwise_session_id: MCP_PAIRWISE_SESSION_ID,
    p_client_id: MCP_CLIENT_ID,
    p_source_session_id: MCP_SOURCE_SESSION_ID
  });
  assert.equal(calls.some(({ url }) => url.endsWith("/auth/v1/user")), false);
});

test("recusa scope de identidade antes do RPC e converte revogação em token inválido", async () => {
  let calls = 0;
  const scopeValue = adapter(async () => {
    calls += 1;
    return json(null);
  }, {
    oauthJwtVerifier: { async verify() { return protectedMcpClaims({ scope: "openid" }); } }
  });
  await assert.rejects(
    () => scopeValue.resolvePrincipal({
      kind: "oauth", credential: "token", resource: MCP_RESOURCE
    }),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
  assert.equal(calls, 0);

  const revoked = adapter(async () => json({ code: "42501", message: "revogado" }, 403), {
    oauthJwtVerifier: { async verify() { return protectedMcpClaims(); } }
  });
  await assert.rejects(
    () => revoked.resolvePrincipal({
      kind: "oauth", credential: "token", resource: MCP_RESOURCE
    }),
    (error) => error.status === 401 && error.code === "invalid_oauth_token"
  );
});

test("exclusão da conta usa o JWT pessoal no RPC e tolera repetição após resposta perdida", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    const rpcCalls = calls.filter((call) => call.url.endsWith("/delete_my_account_v1"));
    if (rpcCalls.length === 1) {
      return json({ code: "PGRST000", message: "Resposta perdida" }, 503);
    }
    return json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
  }, { attempts: 2 });

  const result = await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  });
  assert.deepEqual(result, {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(calls.length, 2);
  const rpcCalls = calls.filter((call) => call.url.endsWith("/delete_my_account_v1"));
  assert.equal(rpcCalls.length, 2);
  for (const call of rpcCalls) {
    assert.match(call.url, /\/rest\/v1\/rpc\/delete_my_account_v1$/u);
    assert.equal(call.init.headers.apikey, "sb_publishable_test");
    assert.equal(call.init.headers.Authorization, `Bearer ${APPLICATION_TOKEN}`);
    assert.deepEqual(call.body, { p_confirmation: "EXCLUIR MINHA CONTA" });
  }
});

test("exclusão bloqueada limpa com service_role apenas os prefixos da pessoa autenticada", async () => {
  const calls = [];
  let deletionCalls = 0;
  const pdfName = `${"a".repeat(64)}.pdf`;
  const avatarName = `${AUDIT_RUN_ID}.webp`;
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/rest/v1/rpc/delete_my_account_v1")) {
      deletionCalls += 1;
      return deletionCalls === 1
        ? json({ code: "AR001", message: "Remova os PDFs privados dos Cursos." }, 500)
        : json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
    }
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    if (url.endsWith("/rest/v1/rpc/list_owned_courses_for_actor_v1")) {
      return body.p_before_id == null
        ? json({
            contract: "aralearn.course-list.v1",
            items: [{ courseId: COURSE_ID }],
            hasMore: true,
            nextCursor: {
              beforeUpdatedAt: "2026-08-20T12:00:00Z",
              beforeId: COURSE_ID
            }
          })
        : json({
            contract: "aralearn.course-list.v1",
            items: [{ courseId: OTHER_COURSE_ID }],
            hasMore: false,
            nextCursor: null
          });
    }
    if (url.endsWith("/storage/v1/object/list/course-source-pdfs")) {
      return json(body.prefix === `${COURSE_ID}/` ? [{ name: pdfName }] : []);
    }
    if (url.endsWith("/storage/v1/object/list/person-avatars")) {
      return json([{ name: avatarName }]);
    }
    if (url.endsWith("/storage/v1/object/course-source-pdfs") ||
        url.endsWith("/storage/v1/object/person-avatars")) {
      return json({});
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  });
  assert.equal(result.status, "deleted");
  assert.equal(deletionCalls, 2);

  const userCalls = calls.filter(({ url }) =>
    url.endsWith("/delete_my_account_v1") || url.endsWith("/auth/v1/user"));
  for (const call of userCalls) {
    assert.equal(call.init.headers.apikey, "sb_publishable_test");
    assert.equal(call.init.headers.Authorization, `Bearer ${APPLICATION_TOKEN}`);
  }
  const privilegedCalls = calls.filter(({ url }) =>
    url.includes("list_owned_courses_for_actor_v1") || url.includes("/storage/v1/object/"));
  assert.ok(privilegedCalls.length >= 1);
  for (const call of privilegedCalls) {
    assert.equal(call.init.headers.apikey, "sb_secret_test");
    assert.equal(call.init.headers.Authorization, undefined);
  }
  const coursePages = calls.filter(({ url }) => url.endsWith("list_owned_courses_for_actor_v1"));
  assert.deepEqual(coursePages.map(({ body }) => [body.p_actor_id, body.p_before_id]), [
    [USER_ID, null],
    [USER_ID, COURSE_ID]
  ]);
  const deletes = calls.filter(({ init, url }) =>
    init.method === "DELETE" && url.includes("/storage/v1/object/"));
  assert.deepEqual(deletes.map(({ body }) => body), [
    { prefixes: [`${COURSE_ID}/${pdfName}`] },
    { prefixes: [`${USER_ID}/${avatarName}`] }
  ]);
});

test("exclusão sem resposta terminal conserva replay explícito antes de limpar o dispositivo", async () => {
  let deletionCalls = 0;
  const value = adapter(async (url) => {
    assert.match(url, /\/rest\/v1\/rpc\/delete_my_account_v1$/u);
    deletionCalls += 1;
    if (deletionCalls <= 2) {
      return json({ code: "PGRST000", message: "Resposta indisponível." }, 503);
    }
    return json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
  }, { attempts: 2 });

  await assert.rejects(
    () => value.deleteMyAccount({
      accessToken: APPLICATION_TOKEN,
      confirmation: "EXCLUIR MINHA CONTA"
    }),
    (error) => error.status === 503 && error.code === "account_deletion_in_progress"
  );
  assert.equal(deletionCalls, 2);

  assert.deepEqual(await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  }), {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(deletionCalls, 3);
});

test("exclusão iniciada informa ambiguidade retomável se a resposta do commit se perder", async () => {
  const calls = [];
  let deletionCalls = 0;
  let deletionRetried = false;
  let accountDeleted = false;
  const pdfName = `${"b".repeat(64)}.pdf`;
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/rest/v1/rpc/delete_my_account_v1")) {
      deletionCalls += 1;
      if (deletionCalls === 1) {
        return json({ code: "AR001", message: "Remova os PDFs privados." }, 500);
      }
      if (!deletionRetried) {
        deletionRetried = true;
        accountDeleted = true;
        return json({ code: "PGRST000", message: "Resposta indisponível." }, 503);
      }
      assert.equal(accountDeleted, true, "o replay deve confirmar um commit já realizado");
      return json({ contract: "aralearn.account-deletion.v1", status: "deleted" });
    }
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    if (url.endsWith("/rest/v1/rpc/list_owned_courses_for_actor_v1")) {
      return json({
        contract: "aralearn.course-list.v1",
        items: [{ courseId: COURSE_ID }],
        hasMore: false,
        nextCursor: null
      });
    }
    if (url.endsWith("/storage/v1/object/list/course-source-pdfs")) {
      return json([{ name: pdfName }]);
    }
    if (url.endsWith("/storage/v1/object/list/person-avatars")) return json([]);
    if (url.endsWith("/storage/v1/object/course-source-pdfs")) return json({});
    assert.fail(`Requisição inesperada: ${url}`);
  });

  await assert.rejects(
    () => value.deleteMyAccount({
      accessToken: APPLICATION_TOKEN,
      confirmation: "EXCLUIR MINHA CONTA"
    }),
    (error) => error.status === 503 &&
      error.code === "account_deletion_in_progress" &&
      /pode já ter sido excluída ou ainda aguardar a etapa final/u.test(error.message)
  );
  const deletesAfterFailure = calls.filter(({ init, url }) =>
    init.method === "DELETE" && url.includes("/storage/v1/object/"));
  assert.equal(deletesAfterFailure.length, 1);

  const result = await value.deleteMyAccount({
    accessToken: APPLICATION_TOKEN,
    confirmation: "EXCLUIR MINHA CONTA"
  });
  assert.deepEqual(result, {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(deletionCalls, 3);
  assert.equal(calls.filter(({ init, url }) =>
    init.method === "DELETE" && url.includes("/storage/v1/object/")).length, 1);
});

test("exclusão não apaga Storage diante de violação relacional alheia", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return json({ id: USER_ID });
    return json({ code: "23514", message: "Constraint relacional não satisfeita." }, 400);
  });

  await assert.rejects(
    () => value.deleteMyAccount({
      accessToken: APPLICATION_TOKEN,
      confirmation: "EXCLUIR MINHA CONTA"
    }),
    (error) => error.status === 422 && error.code === "invalid_course_command"
  );
  assert.deepEqual(calls, [
    "https://project.example/rest/v1/rpc/delete_my_account_v1"
  ]);
});

test("lista por RPC de Curso e acrescenta deep link fora do banco", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_courses_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-list.v1",
      items: [{ courseId: COURSE_ID, title: "Curso" }],
      hasMore: false,
      nextCursor: null
    });
  });
  const result = await value.listCourses({
    principal: { actorId: USER_ID },
    query: "curso",
    limit: 12
  });

  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_limit, 12);
  assert.equal(
    result.items[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=planning`
  );
});

test("não transforma id genérico em identidade ou deep link de Curso", async () => {
  const value = adapter(async () => json({
    contract: "aralearn.course-list.v1",
    items: [{ id: COURSE_ID, title: "Contrato inválido" }],
    hasMore: false,
    nextCursor: null
  }));
  const result = await value.listCourses({
    principal: { actorId: USER_ID },
    limit: 12
  });

  assert.equal(result.items[0].id, COURSE_ID);
  assert.equal(Object.hasOwn(result.items[0], "deepLink"), false);
});

test("lê entidades para o MCP com ator e cerca de versão", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_course_entities_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({ courseId: COURSE_ID, revision: 7, items: [], hasMore: false });
  });
  const result = await value.listCourseEntities({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    limit: 40,
    afterEntityType: "lesson",
    afterEntityId: "lesson-a"
  });
  assert.equal(result.revision, 7);
  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_expected_revision, 7);
  assert.equal(payload.p_after_entity_id, "lesson-a");
});

function inspectionDesignSnapshot({ ceiling = 2 } = {}) {
  return {
    parameters: [
      {
        parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
        value: ceiling,
        origin: "author",
        sourceScopeKind: "didactic_microsequence"
      },
      {
        parameterId: "required_explanation_forms",
        value: ["plain_definition"],
        origin: "system_default",
        sourceScopeKind: null
      },
      {
        parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
        value: 2,
        origin: "system_default",
        sourceScopeKind: null
      },
      {
        parameterId: "required_practice_variation_dimensions",
        value: ["case_or_data"],
        origin: "system_default",
        sourceScopeKind: null
      }
    ],
    guidance: [],
    componentPolicy: {
      availability: "allow_only",
      allowedCount: 3,
      excludedCount: 0,
      preferredCount: 2,
      origin: "author",
      sourceScopeKind: "course"
    }
  };
}

test("cria foco idempotente e acrescenta o deeplink filtrado fora do banco", async () => {
  let payload = null;
  const requestId = "request-inspection-focus-0001";
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/create_course_inspection_focus_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-inspection-focus.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      currentCourseRevision: 7,
      inspectionFocusId: FOCUS_ID,
      title: "Microssequência de contraste",
      studyUnitIds: ["unit-a", "unit-b"],
      availableStudyUnitIds: ["unit-a", "unit-b"],
      missingStudyUnitIds: [],
      requestId,
      idempotent: false
    });
  });
  const result = await value.createCourseInspectionFocus({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    title: "Microssequência de contraste",
    studyUnitIds: ["unit-a", "unit-b"],
    requestId
  });

  assert.equal(payload.p_expected_revision, 7);
  assert.deepEqual(payload.p_study_unit_ids, ["unit-a", "unit-b"]);
  assert.equal(payload.p_request_id, requestId);
  assert.equal(
    result.deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
      `?section=content&inspectionFocusId=${FOCUS_ID}`
  );
});

test("lê inspeção curricular limitada e acrescenta link exato da Unidade", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_course_study_units_for_actor_v2$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-study-unit-inspection-page.v2",
      courseId: COURSE_ID,
      courseRevision: 7,
      scope: { kind: "authoring_part", id: PART_ID },
      totalCount: 1,
      scopeOptions: {
        authoringParts: [{
          id: PART_ID,
          position: 0,
          title: "Parte A",
          state: "materialized"
        }],
        unassignedStudyUnitCount: 0
      },
      items: [{
        studyUnit: {
          id: "unit-a",
          position: 1,
          title: "Unidade A",
          role: "theory",
          content: [{
            id: "paragraph-a",
            package: "aralearn.resource.paragraph",
            version: "1.0.0",
            data: { text: "Conteúdo da Unidade A." }
          }],
          response: null,
          feedback: [],
          topics: []
        },
        version: 2,
        updatedAt: "2026-08-17T10:00:00Z",
        ordinal: 1,
        curriculumPath: {
          module: { id: "module-a", position: 0, title: "Módulo A" },
          lesson: { id: "lesson-a", position: 0, title: "Lição A" },
          didacticMicrosequence: { id: "micro-a", position: 0, title: "Micro A" }
        },
        authoringPart: {
          id: PART_ID,
          position: 0,
          title: "Parte A",
          state: "materialized"
        },
        authorship: {
          pendingObservationCount: 2,
          production: {
            materializationId: "30000000-0000-4000-8000-000000000003",
            recordedAt: "2026-08-17T09:00:00Z",
            state: "changed",
            currentMaterialization: true
          },
          design: {
            used: inspectionDesignSnapshot(),
            current: inspectionDesignSnapshot({ ceiling: 3 }),
            state: "changed"
          }
        }
      }],
      hasPrevious: false,
      hasMore: false,
      previousCursor: null,
      nextCursor: null,
      pageBytes: 640
    });
  });

  const result = await value.listCourseStudyUnits({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    scopeKind: "authoring_part",
    scopeId: PART_ID,
    anchorStudyUnitId: "unit-a",
    direction: "backward",
    limit: 12,
    maxBytes: 262144
  });

  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_scope_kind, "authoring_part");
  assert.equal(payload.p_anchor_study_unit_id, "unit-a");
  assert.equal(payload.p_max_bytes, 262144);
  assert.equal(
    result.items[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
      "?section=content&studyUnitId=unit-a"
  );
});

test("preserva a projeção v1 para a release pública durante o corte", async () => {
  const value = adapter(async (url) => {
    assert.match(url, /\/rpc\/list_owned_course_study_units_for_actor_v1$/u);
    return json({
      contract: "aralearn.course-study-unit-inspection-page.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      scope: { kind: "course", id: null },
      totalCount: 1,
      scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
      items: [{
        studyUnit: {
          id: "unit-a",
          position: 1,
          title: "Unidade A",
          role: "theory",
          content: [{
            id: "paragraph-a",
            package: "aralearn.resource.paragraph",
            version: "1.0.0",
            data: { text: "Conteúdo." }
          }],
          response: null,
          feedback: [],
          topics: []
        },
        version: 2,
        updatedAt: "2026-08-17T10:00:00Z",
        ordinal: 1,
        curriculumPath: {
          module: { id: "module-a", position: 0, title: "Módulo A" },
          lesson: { id: "lesson-a", position: 0, title: "Lição A" },
          didacticMicrosequence: { id: "micro-a", position: 0, title: "Micro A" }
        },
        authoringPart: null
      }],
      hasPrevious: false,
      hasMore: false,
      previousCursor: null,
      nextCursor: null,
      pageBytes: 480
    });
  });

  const result = await value.listCourseStudyUnits({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    scopeKind: "course",
    inspectionVersion: 1
  });
  assert.equal(result.contract, "aralearn.course-study-unit-inspection-page.v1");
  assert.equal(Object.hasOwn(result.items[0], "authorship"), false);
});

test("lê e altera parâmetros por RPC owner-only com catálogo validado", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/rpc/get_owned_course_design_for_actor_v1")) {
      return json(courseDesignRead());
    }
    if (url.endsWith("/rpc/apply_course_design_command_for_actor_v1")) {
      return json({
        contract: "aralearn.course-design-change.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-design-0001",
        idempotent: false,
        changed: true,
        change: {
          changeId: "1",
          type: "clear_guidance",
          scope: { kind: "course", ref: COURSE_ID }
        }
      });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const read = await value.getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "course",
    scopeRef: COURSE_ID,
    childLimit: 16,
    childCursor: null
  });
  assert.equal(read.componentCatalog.options.length, 32);
  assert.equal(Object.hasOwn(read, "deepLink"), false);

  const changed = await value.applyCourseDesignCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-design-0001",
    expectedCourseRevision: 5,
    command: {
      type: "clear_guidance",
      scope: { kind: "course", ref: COURSE_ID }
    }
  });
  assert.equal(changed.changed, true);
  assert.equal(Object.hasOwn(changed, "deepLink"), false);
  assert.deepEqual(calls.map(({ name }) => name), [
    "get_owned_course_design_for_actor_v1",
    "apply_course_design_command_for_actor_v1"
  ]);
  assert.deepEqual(calls[0].payload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_scope_kind: "course",
    p_scope_ref: COURSE_ID,
    p_child_limit: 16,
    p_child_cursor: null
  });
  assert.equal(calls[1].payload.p_channel, "application");
  assert.equal(calls[1].payload.p_expected_course_revision, 5);

  const drifted = courseDesignRead();
  drifted.componentCatalog.options[0].purpose = "Contrato divergente";
  const invalid = adapter(async () => json(drifted));
  await assert.rejects(
    () => invalid.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "component_catalog_drift"
  );

  const oversized = adapter(async () => json({
    code: "54000",
    message: "Leitura de desenho excede 256 KiB."
  }, 400));
  await assert.rejects(
    () => oversized.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.status === 413 && error.code === "course_design_response_too_large"
  );

  const reordered = courseDesignRead();
  [reordered.componentCatalog.options[0], reordered.componentCatalog.options[1]] =
    [reordered.componentCatalog.options[1], reordered.componentCatalog.options[0]];
  const wrongOrder = adapter(async () => json(reordered));
  await assert.rejects(
    () => wrongOrder.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "component_catalog_drift"
  );

  const wrongScope = courseDesignRead();
  wrongScope.scopeContext.current = { kind: "lesson", ref: "lesson-a", label: "Lição A" };
  const mismatchedRead = adapter(async () => json(wrongScope));
  await assert.rejects(
    () => mismatchedRead.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "course_service_unavailable"
  );

  const mismatchedChange = adapter(async () => json({
    contract: "aralearn.course-design-change.v1",
    courseId: "10000000-0000-4000-8000-000000000099",
    courseRevision: 6,
    requestId: "request-design-other",
    idempotent: false,
    changed: true,
    change: {
      changeId: "1",
      type: "clear_guidance",
      scope: { kind: "course", ref: "10000000-0000-4000-8000-000000000099" }
    }
  }));
  await assert.rejects(
    () => mismatchedChange.applyCourseDesignCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-design-0001",
      expectedCourseRevision: 5,
      command: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } }
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("Fontes usam RPC owner-only, DTO exato, bind de consulta e teto de 256 KiB", async () => {
  const calls = [];
  const legacySourceId = ` legacy-${"s".repeat(300)} `;
  const readResult = {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "catalog",
    query: { sourceId: null, targetId: null, targetKind: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [{
      sourceId: "source-a",
      revision: 1,
      status: "active",
      kind: "web_page",
      title: "Fonte A",
      authorship: "Autoria",
      publicationDate: "2026",
      identifier: null,
      language: "pt-BR",
      citationText: "Fonte A, 2026.",
      url: "https://example.test/fonte-a",
      editionOrVersion: null,
      origin: "external",
      availability: "open_access",
      verificationStatus: "author_verified",
      studyVisibility: "citation_and_link",
      anchorCount: 0,
      createdAt: "2026-08-17T10:00:00Z"
    }],
    nextCursor: null
  };
  const changeResult = {
    contract: "aralearn.course-source-change.v1",
    courseId: COURSE_ID,
    courseRevision: 6,
    requestId: "request-source-0001",
    idempotent: false,
    changed: true,
    change: { type: "retire_source", subjectId: legacySourceId, revision: 2 }
  };
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/get_owned_course_sources_for_actor_v1")) return json(readResult);
    if (url.endsWith("/execute_course_source_command_for_actor_v1")) {
      return json(changeResult);
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const read = await value.getCourseSources({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 5,
    mode: "catalog"
  });
  assert.equal(read.items[0].sourceId, "source-a");
  assert.deepEqual(calls[0].payload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_revision: 5,
    p_mode: "catalog",
    p_source_id: null,
    p_target_kind: null,
    p_target_id: null,
    p_cursor: null,
    p_limit: 10
  });

  let contextualPayload = null;
  const contextualResult = {
    ...readResult,
    mode: "source",
    query: {
      sourceId: legacySourceId,
      targetKind: "study_unit",
      targetId: "unit-a"
    },
    items: [],
    nextCursor: null
  };
  const contextualValue = adapter(async (_url, init) => {
    contextualPayload = JSON.parse(init.body);
    return json(contextualResult);
  });
  assert.deepEqual(await contextualValue.getCourseSources({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 5,
    mode: "source",
    sourceId: legacySourceId,
    targetKind: "study_unit",
    targetId: "unit-a"
  }), contextualResult);
  assert.deepEqual(contextualPayload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_revision: 5,
    p_mode: "source",
    p_source_id: legacySourceId,
    p_target_kind: "study_unit",
    p_target_id: "unit-a",
    p_cursor: null,
    p_limit: 10
  });

  const changed = await value.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-source-0001",
    expectedCourseRevision: 5,
    command: {
      type: "retire_source",
      sourceId: legacySourceId,
      expectedSourceRevision: 1
    }
  });
  assert.equal(changed.courseRevision, 6);
  assert.equal(calls[1].payload.p_channel, "mcp");
  assert.deepEqual(calls[1].payload.p_command, {
    type: "retire_source",
    sourceId: legacySourceId,
    expectedSourceRevision: 1
  });

  let linkedPayload = null;
  const linkedValue = adapter(async (_url, init) => {
    linkedPayload = JSON.parse(init.body);
    return json({
      ...changeResult,
      requestId: "request-source-links-1",
      change: { type: "set_target_sources", subjectId: "unit-a", revision: 3 }
    });
  });
  const legacyLinks = [{
    sourceId: legacySourceId,
    sourceRevision: 2,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
  }];
  await linkedValue.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-links-1",
    expectedCourseRevision: 5,
    command: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: "unit-a",
      expectedTargetVersion: 2,
      sourceLinks: legacyLinks
    }
  });
  assert.deepEqual(linkedPayload.p_command.sourceLinks, legacyLinks);

  for (const spoofed of [
    { ...readResult, courseId: USER_ID },
    { ...readResult, query: { sourceId: "source-a", targetKind: null, targetId: null } },
    { ...readResult, items: [{ ...readResult.items[0], actorId: USER_ID }] },
    { ...readResult, nextCursor: "source:cursor" }
  ]) {
    const invalid = adapter(async () => json(spoofed));
    await assert.rejects(
      () => invalid.getCourseSources({
        principal: { actorId: USER_ID },
        courseId: COURSE_ID,
        expectedRevision: 5,
        mode: "catalog"
      }),
      (error) => error.status === 503 && error.code === "course_service_unavailable"
    );
  }

  const oversized = adapter(async () => json({ payload: "x".repeat(270_000) }));
  await assert.rejects(
    () => oversized.getCourseSources({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      expectedRevision: 5,
      mode: "catalog"
    }),
    (error) => error.status === 413 && error.code === "course_sources_response_too_large"
  );

  await assert.rejects(
    () => value.executeCourseSourceCommand({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      requestId: "request-source-bad-1",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: "source-a",
        expectedSourceRevision: 1,
        actorId: USER_ID
      }
    }),
    (error) => error.status === 422 && error.code === "invalid_course_source_command"
  );

  const spoofedChange = adapter(async () => json({
    ...changeResult,
    change: { ...changeResult.change, subjectId: "source-other" }
  }));
  await assert.rejects(
    () => spoofedChange.executeCourseSourceCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-source-0001",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: legacySourceId,
        expectedSourceRevision: 1
      }
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
});

test("ingestão server-side deriva identidade, sela o PDF e preserva lacunas bibliográficas", async () => {
  const pdfBytes = syntheticPdf("save-new");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const calls = [];
  let derivedSourceId = null;
  const value = adapter(async (url, init) => {
    const isStorageUpload = init.method === "POST" &&
      url.includes("/storage/v1/object/course-source-pdfs/");
    const body = isStorageUpload || init.body == null ? init.body : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      derivedSourceId = body.p_source_intent.sourceId;
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-save-1",
        sourceId: derivedSourceId,
        sourceRevision: 1,
        attachment: {
          contentHash,
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath
        },
        uploadRequired: true,
        alreadyLinked: false
      });
    }
    if (isStorageUpload) return json({ Key: storagePath });
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: {
          "Content-Length": String(pdfBytes.byteLength),
          "Content-Type": "application/pdf"
        }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      assert.equal(body.p_source_intent.source.authorship, null);
      assert.equal(body.p_source_intent.source.publicationDate, null);
      assert.equal(body.p_source_intent.source.identifier, null);
      assert.equal(body.p_source_intent.source.url, null);
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 7,
        requestId: "request-ingest-save-1",
        idempotent: false,
        changed: true,
        change: { type: "attach_pdf", subjectId: derivedSourceId, revision: 1 },
        source: {
          sourceId: derivedSourceId,
          sourceRevision: 1,
          bibliographyChanged: true
        },
        attachment: body.p_attachment,
        stored: true
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-save-1",
    sourceIntent: {
      mode: "save",
      sourceId: null,
      expectedSourceRevision: 0,
      source: pdfSourceDocument()
    },
    bytes: pdfBytes.buffer,
    mediaType: "application/pdf"
  });
  assert.equal(result.stored, true);
  assert.equal(result.courseRevision, 7);
  assert.match(derivedSourceId, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const upload = calls.find(({ url, init }) => init.method === "POST" &&
    url.includes("/storage/v1/object/course-source-pdfs/"));
  assert(upload);
  assert.deepEqual(new Uint8Array(upload.body), pdfBytes);
  assert.equal(new Headers(upload.init.headers).get("content-type"), "application/pdf");
  assert.equal(new Headers(upload.init.headers).get("x-upsert"), "false");
  assert.equal(new Headers(upload.init.headers).get("apikey"), "sb_secret_test");
  assert.match(upload.url, new RegExp(`${COURSE_ID}/${contentHash}\\.pdf$`, "u"));
});

test("adapter recupera recibo de ingestão pelo arquivo público e reverifica o PDF privado", async () => {
  const pdfBytes = syntheticPdf("receipt");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const fileIdentity = {
    fileId: "file-adapter-receipt-0001",
    fileName: "edital.pdf",
    mediaType: "application/pdf"
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, method: init.method, body });
    if (url.endsWith("/get_course_source_pdf_ingestion_receipt_for_actor_v1")) {
      assert.deepEqual(body.p_file_identity, fileIdentity);
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-receipt-1",
        idempotent: true,
        changed: true,
        change: { type: "attach_pdf", subjectId: "source-pdf", revision: 2 },
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment: {
          contentHash,
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath
        },
        stored: true
      });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: {
          "Content-Length": String(pdfBytes.byteLength),
          "Content-Type": "application/pdf"
        }
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const result = await value.getCourseSourcePdfIngestionReceipt({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-receipt-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    fileIdentity
  });
  assert.equal(result.idempotent, true);
  assert.equal(result.stored, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].method, "GET");
});

test("ingestão recusa mídia e estrutura inválidas antes de acessar Supabase", async () => {
  let calls = 0;
  const value = adapter(async () => {
    calls += 1;
    assert.fail("PDF inválido não pode acessar o Supabase.");
  });
  const input = {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-invalid-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: syntheticPdf("invalid"),
    mediaType: "application/pdf"
  };
  await assert.rejects(
    () => value.ingestCourseSourcePdf({ ...input, mediaType: "text/plain" }),
    (error) => error.status === 422 && error.code === "invalid_course_source_pdf"
  );
  await assert.rejects(
    () => value.ingestCourseSourcePdf({
      ...input,
      requestId: "request-ingest-invalid-2",
      bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n")
    }),
    (error) => error.status === 422 && error.code === "invalid_course_source_pdf"
  );
  await assert.rejects(
    () => value.ingestCourseSourcePdf({
      ...input,
      requestId: "request-ingest-invalid-3",
      bytes: new Uint8Array()
    }),
    (error) => error.status === 422 && error.code === "invalid_course_source_pdf"
  );
  assert.equal(calls, 0);
});

test("ingestão traduz cota e limite de anexos em mensagens humanas", async () => {
  const cases = [{
    message: "A cota de 64 MiB de PDFs únicos do Curso seria excedida.",
    code: "course_source_pdf_quota_exceeded",
    pattern: /cota de 64 MiB/iu
  }, {
    message: "Uma revisão de Fonte aceita no máximo oito anexos PDF.",
    code: "course_source_pdf_attachment_limit",
    pattern: /máximo de oito PDFs/iu
  }];
  for (const [index, current] of cases.entries()) {
    const pdfBytes = syntheticPdf(`limit-${index}`);
    const value = adapter(async (url) => {
      if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
        return json({ code: "23514", message: current.message }, 400);
      }
      if (url.endsWith("/cancel_course_source_pdf_ingestion_for_actor_v1")) {
        return json(true);
      }
      assert.fail(`Requisição inesperada: ${url}`);
    });
    await assert.rejects(
      () => value.ingestCourseSourcePdf({
        principal: { actorId: USER_ID, authenticationKind: "application" },
        courseId: COURSE_ID,
        expectedCourseRevision: 5,
        requestId: `request-ingest-limit-${index + 1}`,
        sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
        bytes: pdfBytes,
        mediaType: "application/pdf"
      }),
      (error) => error.status === 413 && error.code === current.code &&
        current.pattern.test(error.message),
      current.code
    );
  }
});

test("conflito de upload é deduplicação binária e ainda exige verificação e vínculo", async () => {
  const pdfBytes = syntheticPdf("dedup");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const attachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${contentHash}.pdf`
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, method: init.method });
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-dedup-1",
        sourceId: "source-pdf",
        sourceRevision: 2,
        attachment,
        uploadRequired: true,
        alreadyLinked: false
      });
    }
    if (init.method === "POST" && url.includes("/storage/v1/object/course-source-pdfs/")) {
      return json({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, 409);
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-dedup-1",
        idempotent: false,
        changed: true,
        change: { type: "attach_pdf", subjectId: "source-pdf", revision: 2 },
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment,
        stored: true
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-dedup-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: pdfBytes,
    mediaType: "application/pdf"
  });
  assert.equal(result.stored, true);
  assert.equal(calls.some(({ method }) => method === "DELETE"), false);
  assert.equal(calls.filter(({ url }) =>
    url.includes("/storage/v1/object/authenticated/course-source-pdfs/")).length, 2);
});

test("upload ambíguo relê preflight e objeto antes de finalizar", async () => {
  const pdfBytes = syntheticPdf("uncertain");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const attachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${contentHash}.pdf`
  };
  let preparations = 0;
  let uploadAttempts = 0;
  const value = adapter(async (url, init) => {
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      preparations += 1;
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-uncertain-1",
        sourceId: "source-pdf",
        sourceRevision: 2,
        attachment,
        uploadRequired: preparations === 1,
        alreadyLinked: false
      });
    }
    if (init.method === "POST" && url.includes("/storage/v1/object/course-source-pdfs/")) {
      uploadAttempts += 1;
      throw new TypeError("resposta perdida após o envio");
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-ingest-uncertain-1",
        idempotent: false,
        changed: true,
        change: { type: "attach_pdf", subjectId: "source-pdf", revision: 2 },
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment,
        stored: true
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-uncertain-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: pdfBytes,
    mediaType: "application/pdf"
  });
  assert.equal(result.stored, true);
  assert.equal(preparations, 2);
  assert.equal(uploadAttempts, 1);
});

test("replay pós-timeout recupera receipt e path herdado antes de confirmar stored", async () => {
  const pdfBytes = syntheticPdf("replay");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storageOriginCourseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const inheritedAttachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${storageOriginCourseId}/${contentHash}.pdf`
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push(url);
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      return json({ code: "40001", message: "O Curso mudou." }, 409);
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.p_attachment, {
        contentHash,
        byteSize: pdfBytes.byteLength,
        mediaType: "application/pdf",
        storagePath: `${COURSE_ID}/${contentHash}.pdf`
      });
      return json({
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-replay-1",
        idempotent: true,
        changed: false,
        change: null,
        source: {
          sourceId: "source-pdf",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment: inheritedAttachment,
        stored: true
      });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.ingestCourseSourcePdf({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    expectedCourseRevision: 5,
    requestId: "request-ingest-replay-1",
    sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
    bytes: pdfBytes,
    mediaType: "application/pdf"
  });
  assert.equal(result.idempotent, true);
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((url) =>
    url.includes("/storage/v1/object/authenticated/course-source-pdfs/")).length, 1);
  assert.equal(calls.some((url) => url.endsWith(
    `/course-source-pdfs/${storageOriginCourseId}/${contentHash}.pdf`
  )), true);
});

test("replay não confirma stored quando o objeto está ausente ou corrompido", async () => {
  const cases = [
    { label: "ausente", objectResponse: () => new Response(null, { status: 404 }) },
    {
      label: "corrompido",
      objectResponse: () => {
        const bytes = syntheticPdf("outro-binario");
        return new Response(bytes, {
          headers: { "Content-Length": String(bytes.byteLength) }
        });
      }
    }
  ];
  for (const current of cases) {
    const pdfBytes = syntheticPdf(`replay-${current.label}`);
    const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
    const requestId = `request-ingest-replay-${current.label}`;
    const attachment = {
      contentHash,
      byteSize: pdfBytes.byteLength,
      mediaType: "application/pdf",
      storagePath: `${COURSE_ID}/${contentHash}.pdf`
    };
    let cancels = 0;
    const value = adapter(async (url) => {
      if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
        return json({ code: "40001", message: "O Curso mudou." }, 409);
      }
      if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
        return json({
          contract: "aralearn.course-source-pdf-ingestion.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId,
          idempotent: true,
          changed: true,
          change: { type: "attach_pdf", subjectId: "source-pdf", revision: 2 },
          source: {
            sourceId: "source-pdf",
            sourceRevision: 2,
            bibliographyChanged: false
          },
          attachment,
          stored: true
        });
      }
      if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
        return current.objectResponse();
      }
      if (url.endsWith("/cancel_course_source_pdf_ingestion_for_actor_v1")) {
        cancels += 1;
        return json(true);
      }
      assert.fail(`Requisição inesperada em ${current.label}: ${url}`);
    });
    await assert.rejects(
      () => value.ingestCourseSourcePdf({
        principal: { actorId: USER_ID, authenticationKind: "application" },
        courseId: COURSE_ID,
        expectedCourseRevision: 5,
        requestId,
        sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
        bytes: pdfBytes,
        mediaType: "application/pdf"
      }),
      (error) => error.status === 422 && error.code === "invalid_course_source_pdf",
      current.label
    );
    assert.equal(cancels, 1, current.label);
  }
});

test("falha após upload cancela a intent e deixa o órfão para a manutenção", async () => {
  const pdfBytes = syntheticPdf("residual-maintenance");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const attachment = {
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${contentHash}.pdf`
  };
  let uploads = 0;
  let cancels = 0;
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, method: init.method });
    if (url.endsWith("/prepare_course_source_pdf_ingestion_for_actor_v1")) {
      return json({
        contract: "aralearn.course-source-pdf-ingestion-preparation.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        requestId: "request-ingest-residual-1",
        sourceId: "source-pdf",
        sourceRevision: 2,
        attachment,
        uploadRequired: true,
        alreadyLinked: false
      });
    }
    if (init.method === "POST" && url.includes("/storage/v1/object/course-source-pdfs/")) {
      uploads += 1;
      return json({ Key: attachment.storagePath });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: { "Content-Length": String(pdfBytes.byteLength) }
      });
    }
    if (url.endsWith("/ingest_course_source_pdf_for_actor_v1")) {
      return json({ code: "XX000", message: "falha após upload" }, 500);
    }
    if (url.endsWith("/cancel_course_source_pdf_ingestion_for_actor_v1")) {
      cancels += 1;
      return json(true);
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  await assert.rejects(
    () => value.ingestCourseSourcePdf({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      expectedCourseRevision: 5,
      requestId: "request-ingest-residual-1",
      sourceIntent: { mode: "existing", sourceId: "source-pdf", sourceRevision: 2 },
      bytes: pdfBytes,
      mediaType: "application/pdf"
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
  assert.equal(uploads, 1);
  assert.equal(cancels, 1);
  assert.equal(calls.some(({ method }) => method === "DELETE"), false);
  assert.equal(calls.some(({ url }) =>
    url.endsWith("/can_compensate_course_source_pdf_ingestion_for_actor_v1")), false);
});

test("Adapter autoriza upload autenticado e só assina download depois da autorização", async () => {
  const pdfBytes = syntheticPdf("legacy-attachment");
  const contentHash = createHash("sha256").update(pdfBytes).digest("hex");
  const storageOriginCourseId = "90000000-0000-4000-8000-000000000009";
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const calls = [];
  let uploaded = false;
  let linked = false;
  const rawAccess = (operation) => ({
    contract: operation === "download"
      ? "aralearn.course-source-attachment-access.v1"
      : "aralearn.course-source-attachment-access.v2",
    courseId: COURSE_ID,
    courseRevision: 5,
    operation,
    sourceId: "source-pdf",
    sourceRevision: 2,
    storageOriginCourseId: operation === "download"
      ? storageOriginCourseId
      : COURSE_ID,
    attachment: {
      contentHash,
      byteSize: pdfBytes.byteLength,
      mediaType: "application/pdf",
      storagePath: operation === "download"
        ? `${storageOriginCourseId}/${contentHash}.pdf`
        : storagePath
    },
    uploadRequired: operation === "prepare_upload" && !uploaded,
    alreadyLinked: operation === "download" || linked,
    signedUrl: null,
    expiresAt: null
  });
  const value = adapter(async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method, headers: init.headers, body });
    if (url.endsWith("/get_course_source_attachment_access_for_actor_v1")) {
      return json(rawAccess(body.p_operation));
    }
    if (url.includes("/storage/v1/object/sign/course-source-pdfs/")) {
      return json({ signedURL: "/object/sign/course-source-pdfs/file.pdf?token=download-token" });
    }
    if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
      return new Response(pdfBytes, {
        headers: {
          "Content-Length": String(pdfBytes.byteLength),
          "Content-Type": "application/pdf"
        }
      });
    }
    if (url.endsWith("/attach_course_source_pdf_for_actor_v1")) {
      linked = true;
      return json({
        contract: "aralearn.course-source-change.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-source-pdf-1",
        idempotent: false,
        changed: true,
        change: { type: "attach_pdf", subjectId: "source-pdf", revision: 2 }
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  }, { publicSupabaseUrl: "http://127.0.0.1:54321" });
  const principal = { actorId: USER_ID, authenticationKind: "application" };
  const prepared = await value.getCourseSourceAttachmentAccess({
    principal,
    courseId: COURSE_ID,
    expectedRevision: 5,
    operation: "prepare_upload",
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash,
    byteSize: pdfBytes.byteLength,
    mediaType: "application/pdf"
  });
  assert.equal(prepared.uploadRequired, true);
  assert.equal(prepared.signedUrl, null);
  assert.equal(prepared.expiresAt, null);
  assert.deepEqual(calls[0].body, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_course_revision: 5,
    p_operation: "prepare_upload",
    p_source_id: "source-pdf",
    p_source_revision: 2,
    p_content_hash: contentHash,
    p_byte_size: pdfBytes.byteLength,
    p_media_type: "application/pdf"
  });
  const downloaded = await value.getCourseSourceAttachmentAccess({
    principal,
    courseId: COURSE_ID,
    expectedRevision: 5,
    operation: "download",
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash
  });
  assert.match(downloaded.signedUrl, /token=download-token/u);
  assert.equal(downloaded.contract, "aralearn.course-source-attachment-access.v1");
  assert.equal(new URL(downloaded.signedUrl).origin, "http://127.0.0.1:54321");
  assert.equal(new URL(downloaded.signedUrl).searchParams.has("download"), true);
  assert.deepEqual(calls[2].body, { expiresIn: 60 });
  assert.match(calls[2].url, new RegExp(`${storageOriginCourseId}/${contentHash}\\.pdf$`, "u"));

  uploaded = true;
  const changed = await value.executeCourseSourceCommand({
    principal,
    courseId: COURSE_ID,
    requestId: "request-source-pdf-1",
    expectedCourseRevision: 5,
    command: {
      type: "attach_pdf",
      sourceId: "source-pdf",
      sourceRevision: 2,
      attachment: rawAccess("prepare_upload").attachment
    }
  });
  assert.equal(changed.changed, true);
  assert.match(calls.at(-1).url, /attach_course_source_pdf_for_actor_v1$/u);
  assert.equal(calls.at(-1).body.p_channel, "application");
  const verifiedObjectCall = calls.find(({ url }) =>
    url.includes("/storage/v1/object/authenticated/course-source-pdfs/"));
  assert(verifiedObjectCall);
  assert.equal(verifiedObjectCall.method, "GET");
  assert.equal(new Headers(verifiedObjectCall.headers).get("apikey"), "sb_secret_test");
  assert.equal(new Headers(verifiedObjectCall.headers).get("cache-control"), "no-store");
});

test("Adapter recusa conteúdo adulterado, cabeçalho inválido e objeto acima de 20 MiB", async () => {
  const declaredPdf = syntheticPdf("alpha");
  const otherPdf = syntheticPdf("bravo");
  const invalidHeader = new Uint8Array(declaredPdf);
  invalidHeader[0] = 0x4e;
  assert.equal(otherPdf.byteLength, declaredPdf.byteLength);
  assert.equal(invalidHeader.byteLength, declaredPdf.byteLength);

  const cases = [
    {
      label: "hash divergente",
      declaredBytes: declaredPdf,
      objectBytes: otherPdf,
      contentLength: otherPdf.byteLength
    },
    {
      label: "cabeçalho inválido",
      declaredBytes: invalidHeader,
      objectBytes: invalidHeader,
      contentLength: invalidHeader.byteLength
    },
    {
      label: "objeto acima do limite",
      declaredBytes: declaredPdf,
      objectBytes: declaredPdf,
      contentLength: 20 * 1024 * 1024 + 1
    }
  ];

  for (const [caseIndex, current] of cases.entries()) {
    const contentHash = createHash("sha256").update(current.declaredBytes).digest("hex");
    const attachment = {
      contentHash,
      byteSize: current.declaredBytes.byteLength,
      mediaType: "application/pdf",
      storagePath: `${COURSE_ID}/${contentHash}.pdf`
    };
    let attachRpcCalled = false;
    const value = adapter(async (url) => {
      if (url.endsWith("/get_course_source_attachment_access_for_actor_v1")) {
        return json({
          contract: "aralearn.course-source-attachment-access.v2",
          courseId: COURSE_ID,
          courseRevision: 5,
          operation: "prepare_upload",
          sourceId: "source-pdf",
          sourceRevision: 2,
          storageOriginCourseId: COURSE_ID,
          attachment,
          uploadRequired: false,
          alreadyLinked: false,
          signedUrl: null,
          expiresAt: null
        });
      }
      if (url.includes("/storage/v1/object/authenticated/course-source-pdfs/")) {
        return new Response(current.objectBytes, {
          headers: {
            "Content-Length": String(current.contentLength),
            "Content-Type": "application/pdf"
          }
        });
      }
      if (url.endsWith("/attach_course_source_pdf_for_actor_v1")) {
        attachRpcCalled = true;
      }
      assert.fail(`Requisição inesperada em ${current.label}: ${url}`);
    });
    await assert.rejects(
      () => value.executeCourseSourceCommand({
        principal: { actorId: USER_ID, authenticationKind: "application" },
        courseId: COURSE_ID,
        requestId: `request-pdf-invalid-${caseIndex}`,
        expectedCourseRevision: 5,
        command: {
          type: "attach_pdf",
          sourceId: "source-pdf",
          sourceRevision: 2,
          attachment
        }
      }),
      (error) => error.status === 422 && error.code === "invalid_course_source_pdf",
      current.label
    );
    assert.equal(attachRpcCalled, false, current.label);
  }
});

test("replay de PDF alcança o recibo após a revisão avançar sem reler o objeto", async () => {
  const contentHash = "a".repeat(64);
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push(url);
    if (url.endsWith("/get_course_source_attachment_access_for_actor_v1")) {
      return json({ code: "40001", message: "O Curso mudou." }, 409);
    }
    if (url.endsWith("/attach_course_source_pdf_for_actor_v1")) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_request_id, "request-source-pdf-replay-1");
      return json({
        contract: "aralearn.course-source-change.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: body.p_request_id,
        idempotent: true,
        changed: true,
        change: { type: "attach_pdf", subjectId: "source-pdf", revision: 2 }
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-pdf-replay-1",
    expectedCourseRevision: 5,
    command: {
      type: "attach_pdf",
      sourceId: "source-pdf",
      sourceRevision: 2,
      attachment: {
        contentHash,
        byteSize: 1_024,
        mediaType: "application/pdf",
        storagePath: `${COURSE_ID}/${contentHash}.pdf`
      }
    }
  });
  assert.equal(result.idempotent, true);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((url) => url.includes("/storage/v1/object/")), false);
});

test("Adapter entrega o DTO factual de variantes sem projeção paralela", async () => {
  const comparisonSetId = "81000000-0000-4000-8000-000000000008";
  const expected = courseVariantComparisonFixture({
    sourceCourseId: COURSE_ID,
    comparisonSetId,
    courseRevision: 7
  });
  let call = null;
  const value = adapter(async (url, init) => {
    call = { url, body: JSON.parse(init.body) };
    return json(expected);
  });
  const result = await value.getCourseVariantComparison({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    comparisonSetId,
    expectedCourseRevision: 7
  });
  assert.deepEqual(result, expected);
  assert.match(call.url, /get_owned_course_variant_comparison_for_actor_v1$/u);
  assert.deepEqual(call.body, {
    p_actor_id: USER_ID,
    p_source_course_id: COURSE_ID,
    p_expected_course_revision: 7,
    p_comparison_set_id: comparisonSetId
  });

  const invalid = structuredClone(expected);
  invalid.members[0].references.fingerprint = "não é hash";
  await assert.rejects(
    adapter(async () => json(invalid)).getCourseVariantComparison({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      comparisonSetId,
      expectedCourseRevision: 7
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
});

test("normaliza targetPlanItems e encaminha a atribuição multi-alvo sem aliases", async () => {
  const readFixture = courseDesignRead();
  readFixture.scopeContext = {
    current: { kind: "didactic_microsequence", ref: "micro-a", label: "Micro A" },
    ancestors: [
      { kind: "course", ref: COURSE_ID, label: "Curso" },
      { kind: "module", ref: "module-a", label: "Módulo A" },
      { kind: "lesson", ref: "lesson-a", label: "Lição A" }
    ],
    children: [],
    childCount: 0,
    hasMoreChildren: false,
    nextChildCursor: null
  };
  readFixture.targetPlanItems = {
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (url.endsWith("/rpc/get_owned_course_design_for_actor_v1")) return json(readFixture);
    return json({
      contract: "aralearn.course-design-change.v1",
      courseId: COURSE_ID,
      courseRevision: 6,
      requestId: "request-target-items-0001",
      idempotent: false,
      changed: true,
      change: {
        changeId: "2",
        type: "set_target_plan_items",
        scope: { kind: "didactic_microsequence", ref: "micro-a" }
      }
    });
  });
  const read = await value.getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "didactic_microsequence",
    scopeRef: "micro-a"
  });
  assert.deepEqual(read.targetPlanItems, readFixture.targetPlanItems);

  const command = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  await value.applyCourseDesignCommand({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-target-items-0001",
    expectedCourseRevision: 5,
    command
  });
  assert.deepEqual(calls[1].p_command, command);
  assert.equal(calls[1].p_channel, "mcp");

  const invalid = structuredClone(readFixture);
  invalid.targetPlanItems.instructionalAnalysisUnitIds.push(PLAN_ID);
  await assert.rejects(
    () => adapter(async () => json(invalid)).getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "didactic_microsequence",
      scopeRef: "micro-a"
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("traduz concorrência do banco sem expor detalhes internos", async () => {
  let concurrencyCalls = 0;
  const value = adapter(async () => {
    concurrencyCalls += 1;
    return json({ code: "40001", message: "private.secret" }, 500);
  });
  await assert.rejects(
    () => value.commitCourseComposition({
      principal: { actorId: USER_ID, authenticationKind: "oauth" },
      courseId: COURSE_ID,
      requestId: "request-change-0001",
      expectedRevision: 2,
      upserts: [],
      deletes: []
    }),
    (error) => error.status === 409 &&
      error.code === "stale_course_state" &&
      !error.message.includes("private.secret")
  );
  assert.equal(concurrencyCalls, 1);

  const requestConflict = adapter(async () => json({
    code: "23514",
    message: "requestId reutilizado com comando incompatível."
  }, 400));
  await assert.rejects(
    () => requestConflict.applyCourseDesignCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-design-conflict",
      expectedCourseRevision: 5,
      command: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } }
    }),
    (error) => error.status === 409 && error.code === "request_id_conflict"
  );
});

test("replay idempotente chega ao receipt mesmo após a revisão avançar", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url);
    if (url.endsWith("/rpc/commit_course_composition_for_actor_v1")) {
      return json({ courseId: COURSE_ID, revision: 3, idempotent: true });
    }
    assert.fail("Replay não deve reler as entidades da revisão anterior.");
  });
  const result = await value.commitCourseComposition({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-replay-0001",
    expectedRevision: 2,
    upserts: [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      content: { title: "Módulo A" }
    }],
    deletes: []
  });
  assert.equal(result.idempotent, true);
  assert.deepEqual(calls.map((url) => url.split("/").at(-1)), [
    "commit_course_composition_for_actor_v1"
  ]);
});

test("comando do plano é aplicado sobre a leitura cercada e enviado com o canal", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/rpc/get_owned_course_instructional_plan_for_actor_v1")) {
      return json({
        contract: "aralearn.course-instructional-plan.v1",
        courseId: COURSE_ID,
        courseRevision: 4,
        plan: {
          id: PLAN_ID,
          version: 2,
          title: "Curso",
          objective: "Aprender",
          audience: "",
          scope: "",
          preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
          intendedLearningOutcomes: [{
            id: PLAN_ITEM_ID,
            position: 0,
            statement: "Explicar a evidência.",
            sourceLinks: [{
              sourceId: "source-a",
              sourceRevision: 2,
              relation: "supported_by",
              anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
            }]
          }],
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: []
        },
        recentActivity: []
      });
    }
    if (url.endsWith("/rpc/commit_course_instructional_plan_for_actor_v1")) {
      return json({ courseId: COURSE_ID, courseRevision: 5, changed: true });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const result = await value.commitCourseInstructionalPlan({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-plan-0001",
    expectedCourseRevision: 4,
    expectedPlanVersion: 2,
    command: { type: "update_plan", audience: "Docentes" }
  });

  assert.equal(result.deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=planning`);
  assert.deepEqual(calls.map(({ name }) => name), [
    "get_owned_course_instructional_plan_for_actor_v1",
    "commit_course_instructional_plan_for_actor_v1"
  ]);
  assert.equal(calls[1].payload.p_channel, "application");
  assert.equal(calls[1].payload.p_plan.audience, "Docentes");
  assert.deepEqual(calls[1].payload.p_plan.intendedLearningOutcomes[0].sourceLinks, [{
    sourceId: "source-a",
    sourceRevision: 2,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
  }]);
  assert.deepEqual(calls[1].payload.p_command, {
    type: "update_plan",
    audience: "Docentes"
  });
});

test("posição impossível de Parte retorna o erro público sem chamar o commit", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url.split("/").at(-1));
    if (url.endsWith("/rpc/get_owned_course_instructional_plan_for_actor_v1")) {
      return json({
        contract: "aralearn.course-instructional-plan.v1",
        courseId: COURSE_ID,
        courseRevision: 2,
        plan: {
          id: PLAN_ID,
          version: 2,
          title: "Curso",
          objective: "Aprender",
          audience: "",
          scope: "",
          preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
          intendedLearningOutcomes: [],
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: []
        },
        recentActivity: []
      });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  await assert.rejects(
    () => value.commitCourseInstructionalPlan({
      principal: { actorId: USER_ID, authenticationKind: "action" },
      courseId: COURSE_ID,
      requestId: "request-invalid-part-position-0001",
      expectedCourseRevision: 2,
      expectedPlanVersion: 2,
      command: {
        type: "add_part",
        id: PART_ID,
        position: 1,
        title: "Primeira Parte",
        intent: "Organizar a progressão didática."
      }
    }),
    (error) => error instanceof AuthoringApiError &&
      error.status === 422 &&
      error.code === "invalid_course_authoring_plan_position"
  );
  assert.deepEqual(calls, ["get_owned_course_instructional_plan_for_actor_v1"]);
});

test("vínculos ausentes em item do plano retornam erro público antes de acessar o banco", async () => {
  const value = adapter(async () => {
    assert.fail("Um item inválido não pode alcançar o Supabase.");
  });

  await assert.rejects(
    () => value.commitCourseInstructionalPlan({
      principal: { actorId: USER_ID, authenticationKind: "action" },
      courseId: COURSE_ID,
      requestId: "request-invalid-plan-item-links-0001",
      expectedCourseRevision: 18,
      expectedPlanVersion: 18,
      command: {
        type: "add_plan_item",
        kind: "intended_learning_outcome",
        id: PLAN_ITEM_ID,
        position: 0,
        statement: "Explicar uma relação verificável."
      }
    }),
    (error) => error instanceof AuthoringApiError &&
      error.status === 422 &&
      error.code === "invalid_course_source_links"
  );
});

test("replay do plano chega ao receipt depois de outra revisão sem reaplicar o comando", async () => {
  let committed = null;
  const value = adapter(async (url, init) => {
    if (url.endsWith("/rpc/get_owned_course_instructional_plan_for_actor_v1")) {
      return json({
        courseId: COURSE_ID,
        courseRevision: 9,
        plan: {
          id: PLAN_ID,
          version: 5,
          title: "Curso corrente",
          objective: "Objetivo corrente",
          audience: "Público corrente",
          scope: "",
          preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
          intendedLearningOutcomes: [],
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: []
        }
      });
    }
    committed = JSON.parse(init.body);
    return json({ courseId: COURSE_ID, courseRevision: 4, idempotent: true });
  });

  const result = await value.commitCourseInstructionalPlan({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-plan-replay-0001",
    expectedCourseRevision: 3,
    expectedPlanVersion: 1,
    command: { type: "update_plan", audience: "Público antigo" }
  });

  assert.equal(result.idempotent, true);
  assert.equal(committed.p_plan.audience, "Público corrente");
  assert.equal(committed.p_command.audience, "Público antigo");
  assert.equal(committed.p_channel, "mcp");
});

test("leitura retomável usa RPC owner-only e rejeita campos fora do DTO", async () => {
  let request = null;
  const step = {
    id: STEP_ID,
    position: 0,
    kind: "context_load",
    targetDidacticMicrosequenceId: null,
    productionPosition: null,
    status: "pending",
    version: 1,
    resultFacts: {},
    updatedAt: "2026-08-17T10:00:00Z",
    completedAt: null
  };
  const fixture = {
    contract: "aralearn.course-authoring-part-materialization.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    materialization: {
      id: MATERIALIZATION_ID,
      authoringPartVersion: 2,
      channel: "mcp",
      status: "running",
      version: 1,
      designContext: designContext({ targets: false }),
      contextHash: "a".repeat(64),
      resultFacts: {},
      startedAt: "2026-08-17T10:00:00Z",
      updatedAt: "2026-08-17T10:00:00Z",
      completedAt: null,
      steps: [step],
      nextPendingStep: step
    }
  };
  const value = adapter(async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return json(fixture);
  });

  const result = await value.getCourseAuthoringPartMaterialization({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID
  });

  assert.deepEqual(result, fixture);
  assert.match(request.url,
    /get_owned_course_authoring_part_materialization_for_actor_v1$/u);
  assert.deepEqual(request.body, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_authoring_part_id: PART_ID,
    p_materialization_id: MATERIALIZATION_ID
  });

  const invalid = adapter(async () => json({ ...fixture, actorId: USER_ID }));
  await assert.rejects(
    () => invalid.getCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    /leitura da materialização/u
  );

  const invalidPolicy = runningMaterialization();
  invalidPolicy.materialization.designContext.targets[0].componentPolicy = {
    ...invalidPolicy.materialization.designContext.targets[0].componentPolicy,
    origin: "author",
    sourceScope: { kind: "course", ref: COURSE_ID }
  };
  const invalidPolicyAdapter = adapter(async () => json(invalidPolicy));
  await assert.rejects(
    () => invalidPolicyAdapter.getCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    /leitura da materialização/u
  );

  const overlappingPolicy = runningMaterialization();
  const overlappingRef = componentCatalog().options[0].ref;
  overlappingPolicy.materialization.designContext.targets[0].componentPolicy.policy = {
    catalogVersion: "1-3e5629f8",
    availability: "allow_only",
    allowedRefs: [overlappingRef],
    excludedRefs: [overlappingRef],
    preferredRefs: []
  };
  const overlappingPolicyAdapter = adapter(async () => json(overlappingPolicy));
  await assert.rejects(
    () => overlappingPolicyAdapter.getCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    /leitura da materialização/u
  );
});

test("leitura retomável redige aplicações internas sem ocultar os fatos públicos", async () => {
  const fixture = runningMaterialization();
  const completedStep = fixture.materialization.steps[0];
  Object.assign(completedStep, {
    status: "completed",
    version: 2,
    resultFacts: {
      studyUnitCount: 1,
      designApplication: { sealed: true },
      sourceAttributionApplication: { sealed: true }
    },
    updatedAt: "2026-08-17T10:01:00Z",
    completedAt: "2026-08-17T10:01:00Z"
  });
  const pendingStep = {
    id: "50000000-0000-4000-8000-000000000005",
    position: 1,
    kind: "validation",
    targetDidacticMicrosequenceId: null,
    productionPosition: null,
    status: "pending",
    version: 1,
    resultFacts: {},
    updatedAt: "2026-08-17T10:00:00Z",
    completedAt: null
  };
  fixture.courseRevision = 6;
  fixture.materialization.version = 2;
  fixture.materialization.updatedAt = "2026-08-17T10:01:00Z";
  fixture.materialization.steps = [completedStep, pendingStep];
  fixture.materialization.nextPendingStep = pendingStep;

  const value = adapter(async () => json(fixture));
  const result = await value.getCourseAuthoringPartMaterialization({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID
  });
  assert.deepEqual(result.materialization.steps[0].resultFacts, {
    studyUnitCount: 1
  });
  assert.equal(JSON.stringify(result).includes("designApplication"), false);
  assert.equal(JSON.stringify(result).includes("sourceAttributionApplication"), false);

  const invalid = structuredClone(fixture);
  invalid.materialization.steps[0].resultFacts.content = { duplicated: true };
  await assert.rejects(
    () => adapter(async () => json(invalid)).getCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    /leitura da materialização/u
  );
});

test("avanço de materialização encaminha somente a operação delimitada", async () => {
  let request = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /advance_course_authoring_part_materialization_for_actor_v2$/u);
    request = JSON.parse(init.body);
    return json(materializationChange());
  });
  const payload = {
    authoringPartVersion: 1,
    steps: [{
      id: PLAN_ID,
      position: 0,
      kind: "context_load",
      targetDidacticMicrosequenceId: null,
      productionPosition: null
    }]
  };

  const result = await value.advanceCourseAuthoringPartMaterialization({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    requestId: "request-materialization-0001",
    expectedCourseRevision: 4,
    expectedMaterializationVersion: 0,
    operation: "start",
    payload
  });

  assert.equal(result.operation, "start");
  assert.equal(result.materialization.designContext.contract, "aralearn.course-design-context.v2");
  assert.equal(result.materialization.contextHash, "a".repeat(64));
  assert.equal(request.p_channel, "mcp");
  assert.equal(request.p_authoring_part_id, PART_ID);
  assert.deepEqual(request.p_payload, payload);

  let actionsRequest = null;
  const actionsAdapter = adapter(async (url, init) => {
    assert.match(url, /advance_course_authoring_part_materialization_for_actor_v2$/u);
    actionsRequest = JSON.parse(init.body);
    return json(materializationChange({ channel: "actions" }));
  });
  const actionsResult = await actionsAdapter.advanceCourseAuthoringPartMaterialization({
    principal: { actorId: USER_ID, authenticationKind: "action" },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    requestId: "request-materialization-actions-0001",
    expectedCourseRevision: 4,
    expectedMaterializationVersion: 0,
    operation: "start",
    payload
  });
  assert.equal(actionsRequest.p_channel, "actions");
  assert.equal(actionsResult.channel, "actions");

  const invalid = adapter(async () => json({
    ...materializationChange(),
    materialization: { id: MATERIALIZATION_ID }
  }));
  await assert.rejects(
    () => invalid.advanceCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID, authenticationKind: "oauth" },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID,
      requestId: "request-materialization-0001",
      expectedCourseRevision: 4,
      expectedMaterializationVersion: 0,
      operation: "start",
      payload
    }),
    /leitura da materialização/u
  );
});

test("record_step confere hash e policy selados antes da escrita", async () => {
  const calls = [];
  let excludedRefs = [];
  const contextSources = [{
    sourceId: "source-a",
    sourceRevision: 1,
    relation: "quoted_from",
    sourceHash: "f".repeat(64),
    anchors: [{
      anchorId: "anchor-a",
      anchorRevision: 1,
      anchorHash: "9".repeat(64)
    }]
  }];
  const value = adapter(async (url) => {
    calls.push(url.split("/").at(-1));
    if (url.endsWith("/get_owned_course_authoring_part_materialization_for_actor_v1")) {
      return json(runningMaterialization({ excludedRefs, contextSources }));
    }
    if (url.endsWith("/advance_course_authoring_part_materialization_for_actor_v2")) {
      return json(materializationChange({
        operation: "record_step",
        stepKind: "didactic_microsequence_materialization",
        version: 2,
        authoringPartVersion: 2,
        completedStepCount: 1,
        contextSources
      }));
    }
    assert.fail(`RPC inesperado: ${url}`);
  });
  const paragraphRef = "aralearn.resource.paragraph@1.0.0";
  const payload = {
    stepId: STEP_ID,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: { upserts: [studyUnitUpsert()], deletes: [] },
    designApplication: {
      contextHash: "a".repeat(64),
      didacticMicrosequenceId: "micro-a",
      studyUnits: [{
        studyUnitId: "unit-a",
        mode: "expository",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [],
        practiceApplications: [],
        componentRefs: [paragraphRef]
      }]
    },
    sourceAttributionApplication: {
      contract: "aralearn.course-source-attribution-application.v1",
      contextHash: "a".repeat(64),
      didacticMicrosequenceId: "micro-a",
      studyUnits: [{
        studyUnitId: "unit-a",
        sourceLinks: [{
          sourceId: "source-a",
          sourceRevision: 1,
          relation: "quoted_from",
          anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
        }]
      }]
    }
  };
  const command = {
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    requestId: "request-materialization-step-0001",
    expectedCourseRevision: 5,
    expectedMaterializationVersion: 1,
    operation: "record_step",
    payload
  };

  const result = await value.advanceCourseAuthoringPartMaterialization(command);
  assert.equal(result.operation, "record_step");
  assert.deepEqual(calls, [
    "get_owned_course_authoring_part_materialization_for_actor_v1",
    "advance_course_authoring_part_materialization_for_actor_v2"
  ]);

  calls.length = 0;
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization({
      ...command,
      payload: {
        ...payload,
        designApplication: { ...payload.designApplication, contextHash: "b".repeat(64) }
      }
    }),
    (error) => error.code === "design_context_mismatch"
  );
  assert.deepEqual(calls, ["get_owned_course_authoring_part_materialization_for_actor_v1"]);

  calls.length = 0;
  const spoofedSourceApplication = structuredClone(payload.sourceAttributionApplication);
  spoofedSourceApplication.studyUnits[0].sourceLinks[0].anchors[0].anchorRevision = 2;
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization({
      ...command,
      payload: { ...payload, sourceAttributionApplication: spoofedSourceApplication }
    }),
    (error) => error.code === "source_not_allowed_by_context"
  );
  assert.deepEqual(calls, ["get_owned_course_authoring_part_materialization_for_actor_v1"]);

  calls.length = 0;
  excludedRefs = [paragraphRef];
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization(command),
    (error) => error.code === "component_disallowed_by_policy"
  );
  assert.deepEqual(calls, ["get_owned_course_authoring_part_materialization_for_actor_v1"]);
});

test("record_step exige ambas as aplicações somente na conclusão didática", async () => {
  let stepKind = "context_load";
  let writes = 0;
  const value = adapter(async (url) => {
    if (url.endsWith("/get_owned_course_authoring_part_materialization_for_actor_v1")) {
      return json(runningMaterialization({ stepKind }));
    }
    if (url.endsWith("/advance_course_authoring_part_materialization_for_actor_v2")) {
      writes += 1;
      return json(materializationChange({
        operation: "record_step",
        stepKind,
        version: 2,
        authoringPartVersion: 2,
        completedStepCount: 1
      }));
    }
    assert.fail(`RPC inesperado: ${url}`);
  });
  const command = {
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    requestId: "request-materialization-context-step",
    expectedCourseRevision: 5,
    expectedMaterializationVersion: 1,
    operation: "record_step",
    payload: {
      stepId: STEP_ID,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: { upserts: [], deletes: [] },
      designApplication: null,
      sourceAttributionApplication: null
    }
  };

  await value.advanceCourseAuthoringPartMaterialization(command);
  assert.equal(writes, 1);

  stepKind = "didactic_microsequence_materialization";
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization(command),
    (error) => error.code === "materialization_application_requirement_mismatch"
  );
  assert.equal(writes, 1);

  await value.advanceCourseAuthoringPartMaterialization({
    ...command,
    payload: { ...command.payload, status: "failed" }
  });
  assert.equal(writes, 2);
});

test("encaminha somente o segmento alterado sem reler a composição integral", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    assert.match(url, /commit_course_composition_for_actor_v1$/u);
    return json({
      courseId: COURSE_ID,
      revision: 3,
      operation: "commit_course_composition",
      createdCount: 0,
      updatedCount: 1,
      upsertedCount: 1,
      deletedCount: 0,
      idempotent: false,
      updatedAt: "2026-08-20T22:45:00.000Z"
    });
  });
  const upserts = [{
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: { title: "Módulo A" }
  }];
  const result = await value.commitCourseComposition({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-change-segment-0001",
    expectedRevision: 2,
    upserts,
    deletes: [],
    sourceAttributionApplications: []
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.p_upserts, upserts);
  assert.deepEqual(calls[0].body.p_source_attribution_applications, []);
  assert.equal(calls[0].body.p_channel, "mcp");
  assert.deepEqual(Object.keys(result).sort(), [
    "courseId", "createdCount", "deepLink", "deletedCount", "idempotent",
    "operation", "revision", "updatedAt", "updatedCount", "upsertedCount"
  ]);
});

test("composição da aplicação deriva canal e aceita somente metadado fechado", async () => {
  let rpc = null;
  const sourceLinks = [{
    sourceId: "fonte retirada",
    sourceRevision: 1,
    relation: "legacy_reference",
    anchors: []
  }, {
    sourceId: "fonte retirada",
    sourceRevision: 1,
    relation: "legacy_reference",
    anchors: []
  }];
  const value = adapter(async (url, init) => {
    rpc = { url, body: JSON.parse(init.body) };
    return json({
      courseId: COURSE_ID,
      revision: 5,
      operation: "commit_course_composition",
      createdCount: 0,
      updatedCount: 1,
      upsertedCount: 1,
      deletedCount: 0,
      idempotent: false,
      updatedAt: "2026-08-20T22:45:00.000Z",
      channel: "application",
      applicationOrigin: "manual",
      expectedStudyUnitVersion: 2
    });
  });
  const input = {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-manual-edit-0001",
    expectedRevision: 4,
    expectedStudyUnitVersion: 2,
    applicationOrigin: "manual",
    upserts: [{
      entityType: "study_unit",
      entityId: "unit-a",
      parentType: "microsequence",
      parentId: "micro-a",
      position: 1,
      content: { title: "Unidade revista" }
    }],
    deletes: [],
    sourceAttributionApplications: [{ studyUnitId: "unit-a", sourceLinks }]
  };

  const result = await value.commitCourseComposition(input);

  assert.match(rpc.url, /commit_course_composition_for_actor_v1$/u);
  assert.equal(rpc.body.p_channel, "application");
  assert.equal(rpc.body.p_application_origin, "manual");
  assert.equal(rpc.body.p_expected_study_unit_version, 2);
  assert.deepEqual(
    rpc.body.p_source_attribution_applications[0].sourceLinks,
    sourceLinks
  );
  assert.equal(result.channel, "application");
  assert.match(result.deepLink, /section=planning/u);

  await assert.rejects(
    () => value.commitCourseComposition({ ...input, applicationOrigin: "prompt livre" }),
    (error) => error.code === "invalid_course_composition_origin"
  );
  await assert.rejects(
    () => value.commitCourseComposition({
      ...input,
      principal: { actorId: USER_ID, authenticationKind: "oauth" }
    }),
    (error) => error.code === "invalid_course_composition_origin"
  );
});

test("composição ampla da aplicação preserva o contrato sem metadados focais", async () => {
  let rpc = null;
  const value = adapter(async (url, init) => {
    rpc = { url, body: JSON.parse(init.body) };
    return json({
      courseId: COURSE_ID,
      revision: 3,
      operation: "commit_course_composition",
      createdCount: 1,
      updatedCount: 0,
      upsertedCount: 1,
      deletedCount: 0,
      idempotent: false,
      updatedAt: "2026-08-20T22:45:00.000Z",
      channel: "application",
      applicationOrigin: null,
      expectedStudyUnitVersion: null
    });
  });
  const result = await value.commitCourseComposition({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-broad-application-composition-0001",
    expectedRevision: 2,
    upserts: [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      content: { title: "Módulo A" }
    }],
    deletes: [],
    sourceAttributionApplications: []
  });

  assert.match(rpc.url, /commit_course_composition_for_actor_v1$/u);
  assert.equal(rpc.body.p_channel, "application");
  assert.equal(rpc.body.p_application_origin, null);
  assert.equal(rpc.body.p_expected_study_unit_version, null);
  assert.equal(result.revision, 3);
});

test("cópia pessoal envia um único upsert sem identidade nem proveniência do cliente", async () => {
  let rpc = null;
  const value = adapter(async (url, init) => {
    rpc = { url, body: JSON.parse(init.body) };
    return json({
      contract: "aralearn.personal-course-copy-edit.v1",
      operation: "commit_personal_course_copy_edit",
      sourceCourseId: COURSE_ID,
      sourceCourseRevision: 4,
      targetCourseId: OTHER_COURSE_ID,
      targetCourseRevision: 2,
      studyUnitId: "unit-a",
      studyUnitVersion: 2,
      applicationOrigin: "manual",
      channel: "application",
      createdCopy: true,
      changed: true,
      idempotent: false,
      updatedAt: "2026-08-21T12:00:00.000Z"
    });
  });
  const studyUnit = {
    id: "unit-a",
    position: 1,
    title: "Unidade revista",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
  const result = await value.commitPersonalCourseCopyEdit({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    sourceCourseId: COURSE_ID,
    requestId: "request-personal-copy-0001",
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit,
    applicationOrigin: "manual"
  });

  assert.match(rpc.url, /commit_personal_course_copy_edit_for_actor_v1$/u);
  assert.deepEqual(rpc.body, {
    p_actor_id: USER_ID,
    p_source_course_id: COURSE_ID,
    p_expected_source_revision: 4,
    p_expected_study_unit_version: 2,
    p_upsert: {
      entityType: "study_unit",
      entityId: "unit-a",
      parentType: "microsequence",
      parentId: "micro-a",
      position: 1,
      content: {
        title: "Unidade revista",
        role: "theory",
        content: studyUnit.content,
        response: null,
        feedback: [],
        topics: []
      }
    },
    p_application_origin: "manual",
    p_request_id: "request-personal-copy-0001"
  });
  assert.deepEqual(result, {
    contract: "aralearn.personal-course-copy-edit.v1",
    operation: "commit_personal_course_copy_edit",
    sourceCourseId: COURSE_ID,
    sourceCourseRevision: 4,
    targetCourseId: OTHER_COURSE_ID,
    targetCourseRevision: 2,
    studyUnitId: "unit-a",
    studyUnitVersion: 2,
    applicationOrigin: "manual",
    channel: "application",
    createdCopy: true,
    changed: true,
    idempotent: false,
    updatedAt: "2026-08-21T12:00:00.000Z"
  });
  await assert.rejects(
    () => value.commitPersonalCourseCopyEdit({
      principal: { actorId: USER_ID, authenticationKind: "oauth" },
      sourceCourseId: COURSE_ID,
      requestId: "request-personal-copy-0002",
      expectedSourceCourseRevision: 4,
      expectedStudyUnitVersion: 2,
      didacticMicrosequenceId: "micro-a",
      studyUnit,
      applicationOrigin: "manual"
    }),
    (error) => error.code === "invalid_personal_course_copy_edit"
  );
});

test("cópia pessoal traduz conflito conhecido e rejeita detalhes ou respostas inválidos", async () => {
  const studyUnit = {
    id: "unit-a",
    position: 1,
    title: "Unidade revista",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
  const input = {
    principal: { actorId: USER_ID, authenticationKind: "application" },
    sourceCourseId: COURSE_ID,
    requestId: "request-personal-copy-0001",
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit,
    applicationOrigin: "manual"
  };
  const conflict = adapter(async () => json({
    code: "P1490",
    message: "personal copy already exists",
    details: OTHER_COURSE_ID,
    hint: null
  }, 400));
  await assert.rejects(
    () => conflict.commitPersonalCourseCopyEdit(input),
    (error) => error.status === 409 && error.code === "personal_copy_exists" &&
      error.details?.targetCourseId === OTHER_COURSE_ID &&
      !error.message.includes(OTHER_COURSE_ID)
  );

  const malformedConflict = adapter(async () => json({
    code: "P1490",
    message: "personal copy already exists",
    details: "target=segredo",
    hint: null
  }, 400));
  await assert.rejects(
    () => malformedConflict.commitPersonalCourseCopyEdit(input),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );

  const noOp = adapter(async () => json({
    contract: "aralearn.personal-course-copy-edit.v1",
    operation: "commit_personal_course_copy_edit",
    sourceCourseId: COURSE_ID,
    sourceCourseRevision: 4,
    targetCourseId: null,
    targetCourseRevision: null,
    studyUnitId: "unit-a",
    studyUnitVersion: 2,
    applicationOrigin: "manual",
    channel: "application",
    createdCopy: false,
    changed: false,
    idempotent: false,
    updatedAt: "2026-08-21T12:00:00.000Z"
  }));
  assert.equal(
    (await noOp.commitPersonalCourseCopyEdit(input)).targetCourseId,
    null
  );

  const invalidResponse = adapter(async () => json({
    contract: "aralearn.personal-course-copy-edit.v1",
    operation: "commit_personal_course_copy_edit",
    sourceCourseId: COURSE_ID,
    sourceCourseRevision: 4,
    targetCourseId: OTHER_COURSE_ID,
    targetCourseRevision: 2,
    studyUnitId: "unit-a",
    studyUnitVersion: 2,
    applicationOrigin: "manual",
    channel: "application",
    createdCopy: true,
    changed: true,
    idempotent: false,
    updatedAt: "2026-08-21T12:00:00.000Z",
    actorId: USER_ID
  }));
  await assert.rejects(
    () => invalidResponse.commitPersonalCourseCopyEdit(input),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
});

test("perfil e acesso usam somente os RPCs canônicos para o ator autenticado", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ name: url.split("/").at(-1), payload: JSON.parse(init.body) });
    if (url.endsWith("/get_person_profile_for_actor_v1")) {
      return json({ userId: USER_ID, displayName: null });
    }
    if (url.endsWith("/update_person_profile_for_actor_v1")) {
      return json({ userId: USER_ID, displayName: "Pesquisadora" });
    }
    if (url.endsWith("/list_course_access_for_actor_v1")) {
      return json({ courseId: COURSE_ID, items: [] });
    }
    if (url.endsWith("/manage_course_access_for_actor_v1")) {
      return json({ courseId: COURSE_ID, changed: true });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });
  const principal = { actorId: USER_ID };

  await value.getPersonProfile({ principal });
  await value.updatePersonProfile({ principal, patch: { displayName: "Pesquisadora" } });
  await value.listCourseAccess({ principal, courseId: COURSE_ID });
  await value.manageCourseAccess({
    principal,
    courseId: COURSE_ID,
    operation: "grant_access",
    email: "pessoa@example.com",
    confirmed: true,
    requestId: "request-access-0001"
  });
  await value.manageCourseAccess({
    principal,
    courseId: COURSE_ID,
    operation: "revoke_access",
    targetUserId: USER_ID,
    confirmed: true,
    requestId: "request-access-0002"
  });

  assert.deepEqual(calls.map(({ name }) => name), [
    "get_person_profile_for_actor_v1",
    "update_person_profile_for_actor_v1",
    "list_course_access_for_actor_v1",
    "manage_course_access_for_actor_v1",
    "manage_course_access_for_actor_v1"
  ]);
  assert.equal(calls.every(({ payload }) => payload.p_actor_id === USER_ID), true);
  assert.equal(calls[3].payload.p_target_email, "pessoa@example.com");
  assert.equal(calls[4].payload.p_target_user_id, USER_ID);
});

test("ciclo de vida usa RPC canônica e limpa somente o prefixo PDF do Curso excluído", async () => {
  const calls = [];
  const pdfName = `${"c".repeat(64)}.pdf`;
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/rest/v1/rpc/maintain_course_for_actor_v1")) {
      return json({
        contract: "aralearn.course-lifecycle.v1",
        courseId: COURSE_ID,
        operation: "delete_owned_course",
        status: "completed",
        changed: true,
        requestId: "request-delete-course-0001"
      });
    }
    if (url.endsWith("/storage/v1/object/list/course-source-pdfs")) {
      assert.equal(body.prefix, `${COURSE_ID}/`);
      return json([{ name: pdfName }]);
    }
    if (url.endsWith("/storage/v1/object/course-source-pdfs")) return json({});
    assert.fail(`Requisição inesperada: ${url}`);
  });
  assert.deepEqual(await value.maintainCourse({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    operation: "delete_owned_course",
    confirmed: true,
    requestId: "request-delete-course-0001"
  }), {
    contract: "aralearn.course-lifecycle.v1",
    courseId: COURSE_ID,
    operation: "delete_owned_course",
    status: "completed",
    changed: true,
    requestId: "request-delete-course-0001",
    fileCleanupPending: false
  });
  assert.deepEqual(calls.at(-1).body, {
    prefixes: [`${COURSE_ID}/${pdfName}`]
  });
});

test("repetição de exclusão já concluída não ganha autoridade sobre Storage órfão", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/rest/v1/rpc/maintain_course_for_actor_v1")) {
      return json({
        contract: "aralearn.course-lifecycle.v1",
        courseId: COURSE_ID,
        operation: "delete_owned_course",
        status: "already_absent",
        changed: false,
        requestId: "request-delete-course-0001"
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.maintainCourse({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    operation: "delete_owned_course",
    confirmed: true,
    requestId: "request-delete-course-0001"
  });
  assert.equal(result.status, "already_absent");
  assert.equal(result.fileCleanupPending, false);
  assert.equal(calls.length, 1);
});

test("Manutenção remove somente o objeto revalidado e relê o inventário", async () => {
  const calls = [];
  const objectPath = `${USER_ID}/${AUDIT_RUN_ID}.png`;
  const maintenanceState = {
    contract: "aralearn.current-maintenance.v1",
    role: "administrator",
    retention: { scheduled: true, schedule: "17 3 * * *" },
    inventory: { items: [] }
  };
  const value = adapter(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, init, body });
    if (url.endsWith("/authorize_current_orphan_removal_for_actor_v1")) {
      return json({
        contract: "aralearn.current-maintenance-removal.v1",
        classification: "avatar_profile_unlinked",
        bucketId: "person-avatars",
        objectPath,
        authorized: true
      });
    }
    if (url.endsWith("/storage/v1/object/person-avatars")) return json({});
    if (url.endsWith("/get_current_maintenance_for_actor_v1")) return json(maintenanceState);
    assert.fail(`Requisição inesperada: ${url}`);
  });
  const result = await value.executeCurrentMaintenance({
    principal: { actorId: USER_ID },
    operation: "remove_orphan_object",
    classification: "avatar_profile_unlinked",
    objectPath,
    confirmed: true
  });
  assert.equal(result.contract, "aralearn.current-maintenance-action.v1");
  assert.equal(result.result.removed, true);
  assert.deepEqual(result.state, maintenanceState);
  assert.deepEqual(calls[1].body, { prefixes: [objectPath] });
  assert.equal(calls[1].init.headers.apikey, "sb_secret_test");
});
