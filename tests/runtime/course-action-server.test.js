import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_PROTOCOL_V1_TOOLS,
  UUID_PATTERN
} from "../../supabase/functions/_shared/aralearn-authoring/authoringProtocolV1.js";
import {
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS
} from "../../supabase/functions/_shared/aralearn-authoring/authoringActionProjectionV1.js";
import {
  AUTHORING_CONVERSATIONAL_PROJECTION_HASH,
  AUTHORING_CONVERSATIONAL_PROJECTION_HEADER,
  AUTHORING_CONVERSATIONAL_PROJECTION_ID,
  AUTHORING_CONVERSATIONAL_PROJECTION_VERSION
} from "../../supabase/functions/_shared/aralearn-authoring/conversationalPdfSourceProjection.js";
import {
  applyCourseAuthoringPlanCommand
} from "../../supabase/functions/_shared/aralearn/runtime/domain/courseAuthoringPlan.js";
import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  forChatGptActionDocumentation,
  projectAuthoringProtocolToolsForActions
} from "../../scripts/projectChatGptActionSchemas.mjs";

const ORIGIN = "https://chatgpt.com";
const BASE_URL = "https://project.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/";
const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const ANNOTATION_ID = "20000000-0000-4000-8000-000000000002";
const PLAN_ID = "30000000-0000-4000-8000-000000000003";

function annotation({ state = "open" } = {}) {
  return {
    annotationId: ANNOTATION_ID,
    annotationVersion: state === "open" ? 1 : 2,
    provenance: { origin: "author", channel: "authoring_chat" },
    contributor: { kind: "self", role: "author" },
    target: { kind: "study_unit", id: "unit-a", currentAvailable: true },
    observedRevision: { certainty: "known", courseRevision: 3, targetVersion: 1 },
    rawText: "Rever a explicação antes da publicação.",
    category: "suggestion",
    briefSummary: "Rever a explicação",
    subjectClassification: { status: "unclassified", effective: { subjects: [] } },
    state,
    ownerResponse: null,
    capabilities: {
      canRevise: false,
      canWithdraw: false,
      canConsider: false,
      canRespond: false,
      canResolve: state === "open",
      canReopen: state !== "open",
      canCorrectSubjects: false
    }
  };
}

function createHandler(overrides = {}) {
  return createAuthoringActionHandler({
    adapter: {
      async resolveActionPrincipal(accessTokenHash) {
        assert.match(accessTokenHash, /^[0-9a-f]{64}$/u);
        return {
          actorId: ACTOR_ID,
          authenticationKind: "action",
          scopes: ["authoring:read", "authoring:write"]
        };
      },
      async listCourses() {
        return {
          contract: "aralearn.course-list.v1",
          items: [{
            courseId: ACTOR_ID,
            title: "Curso corrente",
            goal: "Objetivo",
            revision: 3,
            updatedAt: "2026-08-24T12:00:00Z",
            deepLink: "https://app.example/#/authoring"
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      ...overrides
    },
    allowedOrigins: new Set([ORIGIN, "https://app.example"]),
    actionBaseUrl: BASE_URL,
    publicAppUrl: APP_URL
  });
}

function request(path, body = {}, headers = {}) {
  return new Request(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer action-token",
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

test("Actions lista Cursos pelo canal HTTP e pelo principal opaco próprio", async () => {
  let resolved = 0;
  const response = await createHandler({
    async resolveActionPrincipal(hash) {
      resolved += 1;
      assert.match(hash, /^[0-9a-f]{64}$/u);
      return {
        actorId: ACTOR_ID,
        authenticationKind: "action",
        scopes: ["authoring:read", "authoring:write"]
      };
    }
  })(request("listarCursos", { query: "Curso corrente" }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(
    response.headers.get("x-aralearn-authoring-projection"),
    AUTHORING_CONVERSATIONAL_PROJECTION_HEADER
  );
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.items[0].title, "Curso corrente");
  assert.equal(payload.conversation.kind, "resumption");
  assert.equal(payload.conversation.level, "standard");
  assert.match(payload.conversation.message, /Localizei “Curso corrente”/u);
  assert.equal(JSON.stringify(payload.conversation).includes(ACTOR_ID), false);
  assert.equal(payload.data.items[0].courseId, ACTOR_ID);
  assert.equal(resolved, 1);
});

test("Actions rejeita faceta representacional fora do contrato como 422", async () => {
  const response = await createHandler()(request("consultarComponentesDidaticos", {
    operation: "search",
    intent: "Produzir uma resposta sem pistas.",
    notationIsLearningObject: "false"
  }));
  const payload = await response.json();

  assert.equal(response.status, 422);
  assert.equal(payload.error.code, "invalid_tool_argument");
  assert.equal(payload.error.details.field, "notationIsLearningObject");
  assert.equal(payload.conversation.writeState, "none");
});

test("Actions retoma uma Fonte com referência humana sem narrar controles internos", async () => {
  const sourceId = "source-edital-private";
  const anchorId = "anchor-edital-page-44";
  const contentHash = "b".repeat(64);
  const storagePath = `${ACTOR_ID}/${contentHash}.pdf`;
  const sourceCitation = "Edital Dataprev 2026";
  const humanLocator =
    "Perfil 13 — Analista de Processamento → Gestão de Servidores, p. 44 do arquivo";
  const response = await createHandler({
    async getCourseSources() {
      return {
        contract: "aralearn.course-sources.v1",
        courseId: ACTOR_ID,
        courseRevision: 6,
        mode: "source",
        query: { sourceId, targetKind: null, targetId: null },
        pdfStorage: { uniqueBytes: 1_024, maxUniqueBytes: 64 * 1024 * 1024 },
        items: [{
          sourceId,
          revision: 1,
          status: "active",
          kind: "document",
          title: "Edital Dataprev 2026 — fixture sintética",
          authorship: null,
          publicationDate: "2026",
          identifier: null,
          language: "pt-BR",
          citationText: sourceCitation,
          url: null,
          editionOrVersion: null,
          origin: "author_provided",
          availability: "private",
          verificationStatus: "author_verified",
          studyVisibility: "citation",
          anchorCount: 1,
          createdAt: "2026-08-29T12:00:00Z",
          actorId: ACTOR_ID,
          anchors: [{
            anchorId,
            revision: 1,
            sourceRevision: 1,
            status: "active",
            selector: { kind: "page_range", startPage: 44, endPage: 44 },
            humanLocator,
            verificationExcerpt: "Trecho sintético privado.",
            actorId: ACTOR_ID,
            createdAt: "2026-08-29T12:00:00Z"
          }],
          attachments: [{
            contentHash,
            byteSize: 1_024,
            mediaType: "application/pdf",
            storagePath,
            actorId: ACTOR_ID,
            createdAt: "2026-08-29T12:00:00Z"
          }]
        }],
        nextCursor: null
      };
    }
  })(request("lerCurso", {
    courseId: ACTOR_ID,
    view: "course_sources",
    expectedRevision: 5,
    mode: "source",
    sourceId
  }));
  const payload = await response.json();
  const text = payload.conversation.message;

  assert.equal(response.status, 200);
  assert.equal(payload.conversation.kind, "resumption");
  assert.match(text, new RegExp(sourceCitation, "u"));
  assert.match(text, /Perfil 13 .*Gestão de Servidores, p\. 44 do arquivo/u);
  assert.equal(payload.data.items[0].sourceId, sourceId);
  assert.equal(payload.data.items[0].attachments[0].contentHash, contentHash);
  for (const internalValue of [ACTOR_ID, sourceId, anchorId, contentHash, storagePath]) {
    assert.equal(text.includes(internalValue), false, internalValue);
  }
  assert.doesNotMatch(text, /storagePath|contentHash|sourceId|anchorId/iu);
});

test("Actions lê e altera Observações com destinatário e principal próprios", async () => {
  let mutation = null;
  const handler = createHandler({
    async getCourseAnchoredAnnotations(value) {
      assert.equal(value.principal.authenticationKind, "action");
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: ACTOR_ID,
        courseRevision: 3,
        annotationSetVersion: 1,
        summary: {
          matchingTotal: 1,
          byOrigin: { author: 1 },
          byChannel: { authoring_chat: 1 },
          byState: { open: 1 },
          unclassifiedTotal: 1
        },
        items: [annotation()],
        hasMore: false,
        nextCursor: null
      };
    },
    async executeCourseAnchoredAnnotationCommand(value) {
      mutation = value;
      return {
        contract: "aralearn.course-anchored-annotation-change.v1",
        courseId: ACTOR_ID,
        courseRevision: 3,
        annotationSetVersion: 2,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        annotation: annotation({ state: "resolved" })
      };
    }
  });

  const readResponse = await handler(request("lerCurso", {
    courseId: ACTOR_ID,
    view: "anchored_annotations",
    expectedRevision: 3,
    mode: "detail",
    annotationId: ANNOTATION_ID,
    includeObservationText: true
  }));
  assert.equal(readResponse.status, 200);
  const read = await readResponse.json();
  assert.equal(read.data.items[0].rawText, "Rever a explicação antes da publicação.");
  assert.equal(read.data.dataDisclosure.recipient, "connected_actions_gpt");
  assert.equal(read.data.dataDisclosure.rawObservationTextIncluded, true);
  assert.equal(read.conversation.level, "operational");
  assert.equal(JSON.stringify(read.conversation).includes(ACTOR_ID), false);

  const changeResponse = await handler(request("alterarCurso", {
    requestId: "request-action-observation-0001",
    courseId: ACTOR_ID,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "resolve_anchored_annotation",
      annotationId: ANNOTATION_ID,
      expectedAnnotationVersion: 1
    }
  }));
  assert.equal(changeResponse.status, 200);
  const change = await changeResponse.json();
  assert.equal(mutation.principal.authenticationKind, "action");
  assert.equal(mutation.command.type, "resolve_anchored_annotation");
  assert.equal(change.data.annotation.state, "resolved");
  assert.equal(change.data.dataDisclosure.recipient, "connected_actions_gpt");
  assert.match(change.conversation.message, /alteração foi gravada e validada/iu);
  assert.equal(change.conversation.level, "operational");
});

test("Actions lê, altera e relê o plano com operações dedicadas, CAS e replay", async () => {
  let courseRevision = 1;
  let commitCalls = 0;
  let lastPlanConversation = null;
  const receipts = new Map();
  let plan = {
    id: PLAN_ID,
    version: 1,
    title: "Curso corrente",
    objective: "Objetivo inicial",
    audience: "",
    scope: "",
    preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
    intendedLearningOutcomes: [],
    instructionalAnalysisUnits: [],
    evidenceRequirements: [],
    parts: []
  };
  const deepLink = `${APP_URL}#/authoring/courses/${ACTOR_ID}?section=planning`;
  const handler = createHandler({
    async getCourseInstructionalPlan({ courseId }) {
      assert.equal(courseId, ACTOR_ID);
      return {
        contract: "aralearn.course-instructional-plan.v1",
        courseId,
        courseRevision,
        plan: structuredClone(plan),
        recentActivity: [],
        deepLink
      };
    },
    async commitCourseInstructionalPlan(value) {
      const replay = receipts.get(value.requestId);
      if (replay) return { ...structuredClone(replay), idempotent: true };
      commitCalls += 1;
      assert.equal(value.expectedCourseRevision, courseRevision);
      assert.equal(value.expectedPlanVersion, plan.version);
      const { version: currentPlanVersion, ...editablePlan } = plan;
      const nextPlan = applyCourseAuthoringPlanCommand(editablePlan, value.command);
      courseRevision += 1;
      plan = { ...nextPlan, version: currentPlanVersion + 1 };
      const receipt = {
        contract: "aralearn.course-instructional-plan-change.v1",
        courseId: ACTOR_ID,
        courseRevision,
        planId: PLAN_ID,
        planVersion: plan.version,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        deepLink
      };
      receipts.set(value.requestId, structuredClone(receipt));
      return receipt;
    }
  });

  const readPlan = async () => {
    const response = await handler(request("lerCurso", {
      courseId: ACTOR_ID,
      view: "instructional_plan"
    }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    lastPlanConversation = payload.conversation;
    assert.equal(payload.conversation.kind, "resumption");
    assert.equal(JSON.stringify(payload.conversation).includes(ACTOR_ID), false);
    assert.equal(payload.data.phaseGuidance.phase, "planning_design");
    assert.match(
      payload.data.phaseGuidance.instructions.join(" "),
      /mais de uma mudança independente.*teto conta identidades novas declaradas/iu
    );
    return payload.data;
  };
  const changePlan = async (
    requestId,
    current,
    planCommand,
    actionName = "alterarCurso"
  ) => {
    const response = await handler(request(actionName, {
      requestId,
      courseId: ACTOR_ID,
      expectedRevision: current.courseRevision,
      expectedPlanVersion: current.plan.version,
      operation: "update_instructional_plan",
      planCommand
    }));
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    return payload.data;
  };

  const before = await readPlan();
  assert.match(lastPlanConversation.message, /Planejamento incompleto/u);
  assert.match(lastPlanConversation.message, /Próxima decisão/u);
  assert.equal(before.courseRevision, 1);
  assert.equal(before.plan.version, 1);
  assert.equal(before.deepLink, deepLink);

  const overviewChange = await changePlan("action-plan-overview-0001", before, {
    type: "update_plan",
    objective: "Objetivo persistido pela Action",
    audience: "Pessoas autoras"
  });
  assert.equal(overviewChange.courseRevision, 2);
  assert.equal(overviewChange.planVersion, 2);
  assert.equal(overviewChange.deepLink, deepLink);
  const afterOverview = await readPlan();
  assert.equal(afterOverview.plan.objective, "Objetivo persistido pela Action");
  assert.equal(afterOverview.plan.audience, "Pessoas autoras");
  assert.equal(afterOverview.courseRevision, 2);
  assert.equal(afterOverview.plan.version, 2);

  const partChange = await changePlan("action-plan-part-0001", afterOverview, {
    type: "add_part",
    position: 0,
    title: "Fundamentos verificáveis",
    intent: "Organizar a primeira progressão didática."
  }, "add_part");
  assert.equal(partChange.courseRevision, 3);
  assert.equal(partChange.planVersion, 3);
  const afterPart = await readPlan();
  assert.equal(afterPart.plan.parts.length, 1);
  assert.match(afterPart.plan.parts[0].id, UUID_PATTERN);
  assert.deepEqual(
    Object.fromEntries(Object.entries(afterPart.plan.parts[0]).filter(([field]) => field !== "id")),
    {
      position: 0,
      title: "Fundamentos verificáveis",
      intent: "Organizar a primeira progressão didática.",
      microsequenceIds: []
    }
  );

  let afterItems = afterPart;
  const beforeFirstItem = afterItems;
  const itemCases = [{
    kind: "intended_learning_outcome",
    collection: "intendedLearningOutcomes",
    statement: "Explicar os fundamentos em uma situação nova."
  }, {
    kind: "instructional_analysis_unit",
    collection: "instructionalAnalysisUnits",
    statement: "Distinguir os conceitos necessários à explicação."
  }, {
    kind: "evidence_requirement",
    collection: "evidenceRequirements",
    statement: "Produzir uma explicação fundamentada para um caso novo."
  }];
  for (const [index, item] of itemCases.entries()) {
    const itemChange = await changePlan(
      `action-plan-item-000${index + 1}`,
      afterItems,
      {
        type: "add_plan_item",
        kind: item.kind,
        position: 0,
        statement: item.statement,
        sourceLinks: []
      },
      "add_plan_item"
    );
    assert.equal(itemChange.courseRevision, 4 + index);
    assert.equal(itemChange.planVersion, 4 + index);
    assert.equal(itemChange.deepLink, deepLink);
    afterItems = await readPlan();
    assert.equal(afterItems.plan[item.collection].length, 1);
    item.id = afterItems.plan[item.collection][0].id;
    assert.match(item.id, UUID_PATTERN);
    assert.deepEqual(
      Object.fromEntries(Object.entries(afterItems.plan[item.collection][0])
        .filter(([field]) => field !== "id")),
      { position: 0, statement: item.statement, sourceLinks: [] }
    );
  }

  const updatedFirstItemStatement = "Explicar e comparar os fundamentos em uma situação nova.";
  const firstItemUpdate = await changePlan(
    "action-plan-item-update-0001",
    afterItems,
    {
      type: "update_plan_item",
      kind: itemCases[0].kind,
      id: itemCases[0].id,
      statement: updatedFirstItemStatement,
      sourceLinks: []
    },
    "update_plan_item"
  );
  assert.equal(firstItemUpdate.courseRevision, 7);
  assert.equal(firstItemUpdate.planVersion, 7);
  assert.equal(firstItemUpdate.deepLink, deepLink);
  afterItems = await readPlan();
  assert.equal(
    afterItems.plan.intendedLearningOutcomes[0].statement,
    updatedFirstItemStatement
  );

  const firstItemReplayResponse = await handler(request("add_plan_item", {
    requestId: "action-plan-item-0001",
    courseId: ACTOR_ID,
    expectedRevision: beforeFirstItem.courseRevision,
    expectedPlanVersion: beforeFirstItem.plan.version,
    operation: "update_instructional_plan",
    planCommand: {
      type: "add_plan_item",
      kind: itemCases[0].kind,
      position: 0,
      statement: itemCases[0].statement,
      sourceLinks: []
    }
  }));
  const firstItemReplay = (await firstItemReplayResponse.json()).data;
  assert.equal(firstItemReplayResponse.status, 200);
  assert.equal(firstItemReplay.idempotent, true);
  assert.equal(firstItemReplay.courseRevision, 4);
  assert.equal(firstItemReplay.planVersion, 4);
  assert.equal(firstItemReplay.deepLink, deepLink);
  assert.equal((await readPlan()).plan.version, 7);
  assert.equal(commitCalls, 6);

  const missingSourceLinks = await handler(request("add_plan_item", {
    requestId: "action-plan-item-without-links-0001",
    courseId: ACTOR_ID,
    expectedRevision: afterItems.courseRevision,
    expectedPlanVersion: afterItems.plan.version,
    operation: "update_instructional_plan",
    planCommand: {
      type: "add_plan_item",
      kind: "intended_learning_outcome",
      position: 1,
      statement: "Este payload precisa ser recusado antes do adaptador."
    }
  }));
  const missingSourceLinksPayload = await missingSourceLinks.json();
  assert.equal(missingSourceLinks.status, 422);
  assert.equal(missingSourceLinksPayload.error.code, "invalid_course_source_links");
  assert.notEqual(missingSourceLinksPayload.error.code, "internal_error");
  assert.equal(commitCalls, 6);

  const mismatchedDedicatedAction = await handler(request("add_plan_item", {
    requestId: "action-plan-item-mismatch-0001",
    courseId: ACTOR_ID,
    expectedRevision: afterItems.courseRevision,
    expectedPlanVersion: afterItems.plan.version,
    operation: "update_instructional_plan",
    planCommand: {
      type: "update_plan_item",
      kind: itemCases[0].kind,
      id: itemCases[0].id,
      statement: "A Action dedicada não pode trocar de discriminador.",
      sourceLinks: []
    }
  }));
  const mismatchPayload = await mismatchedDedicatedAction.json();
  assert.equal(mismatchedDedicatedAction.status, 422);
  assert.equal(mismatchPayload.error.code, "invalid_action_projection");
  assert.notEqual(mismatchPayload.error.code, "internal_error");
  assert.equal(commitCalls, 6);

  const invalid = await handler(request("alterarCurso", {
    requestId: "action-plan-invalid-0001",
    courseId: ACTOR_ID,
    expectedRevision: afterItems.courseRevision,
    expectedPlanVersion: afterItems.plan.version,
    operation: "update_instructional_plan",
    planCommand: { type: "tipo_inexistente" }
  }));
  const invalidPayload = await invalid.json();
  assert.equal(invalid.status, 422);
  assert.equal(invalidPayload.error.code, "invalid_course_authoring_plan_command");
  assert.equal(invalidPayload.conversation.level, "diagnostic");
  assert.equal(invalidPayload.conversation.success, false);
  assert.doesNotMatch(
    invalidPayload.conversation.message,
    /invalid_course_authoring_plan_command|requestId|expectedRevision/iu
  );
  assert.notEqual(invalidPayload.error.code, "internal_error");
  assert.equal(commitCalls, 6);
  assert.equal((await readPlan()).plan.version, 7);
});

test("Actions não aceita o bearer sem passar pelo resolvedor específico", async () => {
  const response = await createHandler()(new Request(`${BASE_URL}/listarCursos`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: "{}"
  }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.equal((await response.json()).error.code, "authentication_required");
});

test("Actions limita origem, rota e corpo sem abrir transporte genérico", async () => {
  const forbiddenOrigin = await createHandler()(request(
    "listarCursos",
    {},
    { Origin: "https://untrusted.example" }
  ));
  assert.equal(forbiddenOrigin.status, 403);

  const unknown = await createHandler()(request("operarQualquerCoisa"));
  assert.equal(unknown.status, 404);

  const oversized = await createHandler()(request("listarCursos", {
    query: "x".repeat(97 * 1024)
  }));
  assert.equal(oversized.status, 413);
});

test("Actions converte o PDF e completa metadados conservadores de uma Fonte nova", async () => {
  const order = [];
  let ingestion = null;
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  const downloadLink =
    "https://files.oaiusercontent.com/arquivo.pdf?sig=segredo-temporario";
  const fileId = "file-segredo-temporario";
  const contentHash = "a".repeat(64);
  const response = await createHandler({
    async resolveActionPrincipal() {
      order.push("oauth");
      return {
        actorId: ACTOR_ID,
        authenticationKind: "action",
        scopes: ["authoring:read", "authoring:write"]
      };
    },
    async fetchImpl(url, options) {
      order.push("download");
      assert.equal(url, downloadLink);
      assert.equal(options.credentials, "omit");
      assert.equal(new Headers(options.headers).has("authorization"), false);
      return new Response(pdfBytes, {
        headers: { "content-type": "application/pdf" }
      });
    },
    async ingestCourseSourcePdf(value) {
      order.push("ingest");
      ingestion = value;
      return {
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: ACTOR_ID,
        courseRevision: 5,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        change: { type: "attach_pdf", subjectId: "fonte-edital", revision: 1 },
        source: {
          sourceId: "fonte-edital",
          sourceRevision: 1,
          bibliographyChanged: true
        },
        attachment: {
          contentHash,
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath: `${ACTOR_ID}/${contentHash}.pdf`
        },
        stored: true
      };
    }
  })(request("incorporarPdfComoFonte", {
    requestId: "action-pdf-source-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      newSource: { title: "Edital Dataprev 2026" }
    },
    openaiFileIdRefs: [{
      name: "edital-sintetico.pdf",
      id: fileId,
      mime_type: "application/pdf",
      download_link: downloadLink
    }]
  }));
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.deepEqual(order, ["oauth", "download", "ingest"]);
  assert.equal(ingestion.principal.authenticationKind, "action");
  assert.equal(ingestion.courseId, ACTOR_ID);
  assert.equal(ingestion.expectedCourseRevision, 4);
  assert.equal(ingestion.requestId, "action-pdf-source-0001");
  assert.deepEqual(ingestion.sourceIntent, {
    mode: "save",
    sourceId: null,
    expectedSourceRevision: 0,
    source: {
      kind: "document",
      title: "Edital Dataprev 2026",
      authorship: null,
      publicationDate: null,
      identifier: null,
      language: null,
      citationText: null,
      url: null,
      editionOrVersion: null,
      origin: "author_provided",
      availability: "unknown",
      verificationStatus: "unverified",
      studyVisibility: "hidden"
    }
  });
  assert.deepEqual(ingestion.fileIdentity, {
    fileId,
    fileName: "edital-sintetico.pdf",
    mediaType: "application/pdf"
  });
  assert.deepEqual(ingestion.bytes, pdfBytes);
  assert.equal(ingestion.mediaType, "application/pdf");
  assert.equal(payload.data.stored, true);
  assert.equal(payload.data.technicalDetails.contentHash, contentHash);
  assert.equal(
    payload.data.technicalDetails.storagePath,
    `${ACTOR_ID}/${contentHash}.pdf`
  );
  assert.equal(payload.conversation.level, "operational");
  assert.match(payload.conversation.message, /incorporado às Fontes/iu);
  assert.equal(JSON.stringify(payload).includes(downloadLink), false);
  assert.equal(JSON.stringify(payload).includes(fileId), false);
});

test("Actions preserva o payload rico 1.x de uma conversa em cache", async () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  const source = {
    kind: "document",
    title: "Edital Dataprev 2026",
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "unknown",
    verificationStatus: "unverified",
    studyVisibility: "hidden"
  };
  let ingestion = null;
  const response = await createHandler({
    async fetchImpl() {
      return new Response(pdfBytes, {
        headers: { "content-type": "application/pdf" }
      });
    },
    async ingestCourseSourcePdf(value) {
      ingestion = value;
      return {
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: ACTOR_ID,
        courseRevision: 5,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        change: { type: "attach_pdf", subjectId: "fonte-legada", revision: 1 },
        source: {
          sourceId: "fonte-legada",
          sourceRevision: 1,
          bibliographyChanged: true
        },
        attachment: {
          contentHash: "d".repeat(64),
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath: `${ACTOR_ID}/${"d".repeat(64)}.pdf`
        },
        stored: true
      };
    }
  })(request("incorporarPdfComoFonte", {
    requestId: "action-pdf-legacy-save-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      mode: "save",
      sourceId: null,
      expectedSourceRevision: 0,
      source
    },
    openaiFileIdRefs: [{
      name: "edital-legado.pdf",
      id: "file-legacy-save",
      mime_type: "application/pdf",
      download_link: "https://files.oaiusercontent.com/legacy.pdf?sig=temporary"
    }]
  }));
  const payload = await response.json();

  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.deepEqual(ingestion.sourceIntent, {
    mode: "save",
    sourceId: null,
    expectedSourceRevision: 0,
    source
  });
});

test("Actions rejeita estados operacionais na criação antes do download", async () => {
  let downloads = 0;
  let ingestions = 0;
  const response = await createHandler({
    async fetchImpl() {
      downloads += 1;
      assert.fail("Uma Fonte inválida não pode iniciar download.");
    },
    async ingestCourseSourcePdf() {
      ingestions += 1;
      assert.fail("Uma Fonte inválida não pode iniciar persistência.");
    }
  })(request("incorporarPdfComoFonte", {
    requestId: "action-pdf-managed-state-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      newSource: {
        title: "Edital Dataprev 2026",
        studyVisibility: "citation",
        verificationStatus: "author_verified"
      }
    },
    openaiFileIdRefs: [{
      name: "edital.pdf",
      id: "file-invalid-source",
      mime_type: "application/pdf",
      download_link: "https://files.oaiusercontent.com/edital.pdf?sig=temporary"
    }]
  }));
  const payload = await response.json();

  assert.equal(response.status, 422);
  assert.equal(payload.error.code, "invalid_course_source_pdf_ingestion");
  assert.equal(downloads, 0);
  assert.equal(ingestions, 0);
});

test("Actions recupera ingestão confirmada antes de acessar uma URL temporária expirada", async () => {
  const downloadLink =
    "https://files.oaiusercontent.com/edital.pdf?sig=expirado-e-nao-reutilizavel";
  const fileId = "file-ingestion-receipt-0001";
  const contentHash = "c".repeat(64);
  let downloads = 0;
  let ingestions = 0;
  let receiptInput = null;
  const response = await createHandler({
    async fetchImpl() {
      downloads += 1;
      assert.fail("Um replay confirmado não pode baixar novamente a URL temporária.");
    },
    async ingestCourseSourcePdf() {
      ingestions += 1;
      assert.fail("Um replay confirmado não pode repetir a ingestão.");
    },
    async getCourseSourcePdfIngestionReceipt(value) {
      receiptInput = value;
      return {
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: ACTOR_ID,
        courseRevision: 5,
        requestId: value.requestId,
        idempotent: true,
        changed: true,
        change: { type: "attach_pdf", subjectId: "fonte-edital", revision: 2 },
        source: {
          sourceId: "fonte-edital",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment: {
          contentHash,
          byteSize: 24_862,
          mediaType: "application/pdf",
          storagePath: `${ACTOR_ID}/${contentHash}.pdf`
        },
        stored: true
      };
    }
  })(request("incorporarPdfComoFonte", {
    requestId: "action-pdf-receipt-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      existingSource: {
        sourceId: "fonte-edital",
        sourceRevision: 1
      }
    },
    openaiFileIdRefs: [{
      name: "edital-dataprev-2026.pdf",
      id: fileId,
      mime_type: "application/pdf",
      download_link: downloadLink
    }]
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(downloads, 0);
  assert.equal(ingestions, 0);
  assert.deepEqual(receiptInput.fileIdentity, {
    fileId,
    fileName: "edital-dataprev-2026.pdf",
    mediaType: "application/pdf"
  });
  assert.equal(payload.data.stored, true);
  assert.equal(payload.data.idempotent, true);
  assert.equal(JSON.stringify(payload).includes(downloadLink), false);
  assert.equal(JSON.stringify(payload).includes(fileId), false);
});

test("Actions distingue ausência, quantidade e referência de arquivo malformada", async () => {
  let oauthCalls = 0;
  let downloads = 0;
  let ingestions = 0;
  const handler = createHandler({
    async resolveActionPrincipal() {
      oauthCalls += 1;
      return {
        actorId: ACTOR_ID,
        authenticationKind: "action",
        scopes: ["authoring:read", "authoring:write"]
      };
    },
    async fetchImpl() {
      downloads += 1;
      assert.fail("Uma referência inválida não pode iniciar download.");
    },
    async ingestCourseSourcePdf() {
      ingestions += 1;
      assert.fail("Uma referência inválida não pode iniciar ingestão.");
    }
  });
  const base = {
    requestId: "action-pdf-invalid-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      existingSource: {
        sourceId: "fonte-edital",
        sourceRevision: 1
      }
    }
  };
  const validReference = {
    name: "edital.pdf",
    id: "file-edital",
    mime_type: "application/pdf",
    download_link: "https://files.oaiusercontent.com/edital.pdf?sig=segredo"
  };
  const cases = [
    {
      label: "propriedade ausente",
      openaiFileIdRefs: undefined,
      code: "openai_file_missing",
      message: /mesmo anexo novamente/iu
    },
    {
      label: "lista vazia",
      openaiFileIdRefs: [],
      code: "openai_file_missing",
      message: /mesmo anexo novamente/iu
    },
    {
      label: "valor nulo",
      openaiFileIdRefs: null,
      code: "openai_file_missing",
      message: /mesmo anexo novamente/iu
    },
    {
      label: "mais de um PDF",
      openaiFileIdRefs: [validReference, {
        ...validReference,
        id: "file-edital-2"
      }],
      code: "openai_file_count_invalid",
      message: /um PDF por vez/iu
    },
    {
      label: "id isolado",
      openaiFileIdRefs: ["file-sem-binding"],
      code: "invalid_openai_file",
      message: /não precisa ser reenviado/iu
    },
    {
      label: "nome isolado",
      openaiFileIdRefs: ["edital.pdf"],
      code: "invalid_openai_file",
      message: /não precisa ser reenviado/iu
    },
    {
      label: "URL isolada",
      openaiFileIdRefs: [
        "https://files.oaiusercontent.com/edital.pdf?sig=segredo"
      ],
      code: "invalid_openai_file",
      message: /não precisa ser reenviado/iu
    },
    {
      label: "string sem lista",
      openaiFileIdRefs: "file-sem-lista",
      code: "invalid_openai_file",
      message: /não precisa ser reenviado/iu
    },
    {
      label: "objeto sem lista",
      openaiFileIdRefs: validReference,
      code: "invalid_openai_file",
      message: /não precisa ser reenviado/iu
    },
    {
      label: "objeto sem URL",
      openaiFileIdRefs: [{
        name: "edital.pdf",
        id: "file-sem-url",
        mime_type: "application/pdf"
      }],
      code: "invalid_openai_file",
      message: /não precisa ser reenviado/iu
    },
    {
      label: "objeto com campo extra",
      openaiFileIdRefs: [{
      name: "edital.pdf",
      id: "file-com-campo-extra",
      mime_type: "application/pdf",
      download_link: "https://files.oaiusercontent.com/edital.pdf?sig=segredo",
      extra: "não permitido"
      }],
      code: "invalid_openai_file",
      message: /não precisa ser reenviado/iu
    }
  ];

  for (const [index, candidate] of cases.entries()) {
    const response = await handler(request("incorporarPdfComoFonte", {
      ...base,
      requestId: `action-pdf-invalid-000${index + 1}`,
      openaiFileIdRefs: candidate.openaiFileIdRefs
    }));
    const payload = await response.json();
    assert.equal(response.status, 422, candidate.label);
    assert.equal(payload.error.code, candidate.code, candidate.label);
    assert.match(payload.error.message, candidate.message, candidate.label);
    if (candidate.code === "invalid_openai_file") {
      assert.match(payload.error.details.path, /^openaiFileIdRefs(?:\[0\])?/u, candidate.label);
      assert.match(payload.error.details.rule, /^[a-z][a-z_]+$/u, candidate.label);
    }
    assert.equal(payload.conversation.writeState, "none", candidate.label);
    assert.match(payload.conversation.message, /Nada foi salvo/iu, candidate.label);
    assert.equal(JSON.stringify(payload).includes("segredo"), false, candidate.label);
  }
  assert.equal(oauthCalls, cases.length);
  assert.equal(downloads, 0);
  assert.equal(ingestions, 0);
});

test("Actions distingue tipo inválido de acesso temporário expirado", async () => {
  const base = {
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      existingSource: {
        sourceId: "fonte-edital",
        sourceRevision: 1
      }
    }
  };
  let downloads = 0;
  let ingestions = 0;
  const handler = createHandler({
    async fetchImpl() {
      downloads += 1;
      return new Response(null, { status: 404 });
    },
    async ingestCourseSourcePdf() {
      ingestions += 1;
    }
  });

  const invalidType = await handler(request("incorporarPdfComoFonte", {
    ...base,
    requestId: "action-pdf-invalid-type-0001",
    openaiFileIdRefs: [{
      name: "edital.txt",
      id: "file-invalid-type",
      mime_type: "text/plain",
      download_link: "https://files.oaiusercontent.com/edital.txt?sig=temporary"
    }]
  }));
  const invalidTypePayload = await invalidType.json();
  assert.equal(invalidType.status, 415);
  assert.equal(invalidTypePayload.error.code, "unsupported_pdf_media_type");
  assert.match(invalidTypePayload.error.message, /não é um PDF/iu);
  assert.equal(invalidTypePayload.error.recovery.strategy, "correct_and_retry");
  assert.equal(downloads, 0);

  const expired = await handler(request("incorporarPdfComoFonte", {
    ...base,
    requestId: "action-pdf-expired-0001",
    openaiFileIdRefs: [{
      name: "edital.pdf",
      id: "file-expired",
      mime_type: "application/pdf",
      download_link: "https://files.oaiusercontent.com/edital.pdf?sig=expired"
    }]
  }));
  const expiredPayload = await expired.json();
  assert.equal(expired.status, 410);
  assert.equal(expiredPayload.error.code, "openai_file_expired");
  assert.match(expiredPayload.error.message, /expirou/iu);
  assert.equal(expiredPayload.error.recovery.strategy, "correct_and_retry");
  assert.equal(expiredPayload.error.recovery.requestIdMode, "new");
  assert.equal(downloads, 1);
  assert.equal(ingestions, 0);
});

test("Actions relata falha de transferência sem sucesso nem vazamento da referência", async () => {
  let ingestions = 0;
  const downloadLink =
    "https://files.oaiusercontent.com/arquivo.pdf?sig=segredo-indisponivel";
  const fileId = "file-segredo-indisponivel";
  const response = await createHandler({
    async fetchImpl() {
      throw new Error(`${downloadLink} ${fileId}`);
    },
    async ingestCourseSourcePdf() {
      ingestions += 1;
    }
  })(request("incorporarPdfComoFonte", {
    requestId: "action-pdf-transfer-failure-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      existingSource: {
        sourceId: "fonte-edital",
        sourceRevision: 1
      }
    },
    openaiFileIdRefs: [{
      name: "edital.pdf",
      id: fileId,
      mime_type: "application/pdf",
      download_link: downloadLink
    }]
  }));
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 502);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "openai_file_unavailable");
  assert.equal(payload.error.recovery.strategy, "repeat_identical");
  assert.equal(payload.error.recovery.requestIdMode, "same");
  assert.equal(payload.conversation.success, false);
  assert.equal(payload.conversation.writeState, "none");
  assert.doesNotMatch(payload.conversation.message, /incorporado|mantido/iu);
  assert.equal(serialized.includes(downloadLink), false);
  assert.equal(serialized.includes(fileId), false);
  assert.equal(serialized.includes("segredo-indisponivel"), false);
  assert.doesNotMatch(payload.error.message, /^Anexe/iu);
  assert.match(payload.error.message, /só anexe.*se.*expirado/iu);
  assert.equal(ingestions, 0);
});

test("Actions explica a cota de PDFs sem afirmar persistência", async () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  const response = await createHandler({
    async fetchImpl() {
      return new Response(pdfBytes, {
        headers: { "content-type": "application/pdf" }
      });
    },
    async ingestCourseSourcePdf() {
      throw new AuthoringApiError(
        413,
        "course_source_pdf_quota_exceeded",
        "O Curso atingiu a cota de 64 MiB para PDFs mantidos entre as Fontes."
      );
    }
  })(request("incorporarPdfComoFonte", {
    requestId: "action-pdf-quota-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      existingSource: {
        sourceId: "fonte-edital",
        sourceRevision: 1
      }
    },
    openaiFileIdRefs: [{
      name: "edital.pdf",
      id: "file-quota-synthetic",
      mime_type: "application/pdf",
      download_link: "https://files.oaiusercontent.com/quota.pdf?sig=temporary"
    }]
  }));
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error.code, "course_source_pdf_quota_exceeded");
  assert.equal(payload.conversation.writeState, "none");
  assert.match(payload.conversation.message, /cota de 64 MiB/iu);
  assert.match(payload.conversation.message, /Nada foi salvo/iu);
  assert.doesNotMatch(payload.conversation.message, /incorporado|mantido com sucesso/iu);
});

test("Actions não narra sucesso quando a ingestão não confirma stored true", async () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n%%EOF");
  const response = await createHandler({
    async fetchImpl() {
      return new Response(pdfBytes, {
        headers: { "content-type": "application/pdf" }
      });
    },
    async ingestCourseSourcePdf(value) {
      return {
        contract: "aralearn.course-source-pdf-ingestion.v1",
        courseId: ACTOR_ID,
        courseRevision: 5,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        change: { type: "attach_pdf", subjectId: "fonte-edital", revision: 2 },
        source: {
          sourceId: "fonte-edital",
          sourceRevision: 2,
          bibliographyChanged: false
        },
        attachment: {
          contentHash: "b".repeat(64),
          byteSize: pdfBytes.byteLength,
          mediaType: "application/pdf",
          storagePath: `${ACTOR_ID}/${"b".repeat(64)}.pdf`
        }
      };
    }
  })(request("incorporarPdfComoFonte", {
    requestId: "action-pdf-unconfirmed-0001",
    courseId: ACTOR_ID,
    expectedRevision: 4,
    sourceIntent: {
      existingSource: {
        sourceId: "fonte-edital",
        sourceRevision: 1
      }
    },
    openaiFileIdRefs: [{
      name: "edital.pdf",
      id: "file-unconfirmed-synthetic",
      mime_type: "application/pdf",
      download_link: "https://files.oaiusercontent.com/unconfirmed.pdf?sig=temporary"
    }]
  }));
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.error.code, "course_source_pdf_persistence_unconfirmed");
  assert.equal(payload.error.recovery.strategy, "repeat_identical");
  assert.equal(payload.error.recovery.requestIdMode, "same");
  assert.equal(payload.conversation.writeState, "unknown");
  assert.match(payload.conversation.message, /Não foi possível confirmar/iu);
  assert.doesNotMatch(
    payload.conversation.message,
    /foi incorporado|foi mantido|gravação foi concluída/iu
  );
});

test("Actions não afirma ausência de escrita quando a resposta estoura após a gravação", async () => {
  let writes = 0;
  const response = await createHandler({
    async createCourse({ title }) {
      writes += 1;
      return {
        contract: "aralearn.course.v1",
        courseId: ACTOR_ID,
        title,
        revision: 1,
        deepLink: `${APP_URL}#/authoring/courses/${ACTOR_ID}`,
        padding: "x".repeat(100 * 1024)
      };
    }
  })(request("criarCurso", {
    requestId: "action-large-created-course-0001",
    title: "Curso já gravado",
    objective: "Provar a certeza de escrita após o limite da resposta."
  }));
  const payload = await response.json();

  assert.equal(writes, 1);
  assert.equal(response.status, 413);
  assert.equal(payload.error.code, "action_response_too_large");
  assert.equal(payload.error.recovery.strategy, "verify_state");
  assert.equal(payload.error.recovery.retryable, false);
  assert.equal(payload.conversation.success, false);
  assert.equal(payload.conversation.writeState, "complete");
  assert.equal(payload.conversation.retrySafe, false);
  assert.match(payload.conversation.message, /gravação foi concluída/iu);
  assert.doesNotMatch(payload.conversation.message, /Nada foi salvo/u);
});

test("Actions preserva as ferramentas canônicas e acrescenta as operações dedicadas", async () => {
  const openApi = JSON.parse(await readFile(
    new URL(
      "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
      import.meta.url
    ),
    "utf8"
  ));
  assert.equal(openApi.openapi, "3.1.0");
  assert.match(openApi.info.description, /Preservar internamente não significa mostrar/iu);
  assert.match(openApi.info.description, /detalhe técnico literal somente sob pedido explícito/iu);
  assert.deepEqual(
    Object.keys(openApi.paths),
    [
      ...AUTHORING_PROTOCOL_V1_TOOLS.map(({ name }) => `/${name}`),
      ...AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS.map(({ path }) => path)
    ]
  );
  assert.equal(JSON.stringify(openApi).includes("Workspace"), false);
  assert.ok(openApi.components.schemas.SuccessResponse);
  assert.ok(openApi.components.schemas.ErrorResponse);
  assert.ok(openApi.components.schemas.ConversationProjection);
  assert.deepEqual(
    openApi.components.schemas.SuccessResponse.properties.conversation,
    { $ref: "#/components/schemas/ConversationProjection" }
  );
  assert.deepEqual(
    openApi.components.schemas.ErrorResponse.properties.conversation,
    { $ref: "#/components/schemas/ConversationProjection" }
  );
  for (const pathValue of Object.values(openApi.paths)) {
    assert.ok(pathValue.post.description.length <= 300);
  }
  for (const tool of AUTHORING_PROTOCOL_V1_TOOLS) {
    assert.equal(
      openApi.paths[`/${tool.name}`].post.description,
      forChatGptActionDocumentation(tool.description)
    );
  }
  for (const projection of AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS) {
    const operation = openApi.paths[projection.path].post;
    assert.equal(operation.operationId, projection.operationId);
    assert.equal(operation.summary, projection.title);
    assert.equal(operation.description, projection.description);
  }
  const oauth = openApi.components.securitySchemes.AraLearnOAuth;
  assert.match(
    openApi.paths["/consultarComponentesDidaticos"].post.description,
    /contracts aceita exatamente um package/iu
  );
  assert.match(oauth.flows.authorizationCode.authorizationUrl, /authoring-action\/oauth\/authorize$/u);
  assert.doesNotMatch(oauth.flows.authorizationCode.authorizationUrl, /authoring-mcp/u);
});

test("OAuth de Actions cadastra credencial confidencial sem expor seu hash", async () => {
  let registration = null;
  const response = await createHandler({
    async resolveApplicationUser() {
      return { id: ACTOR_ID };
    },
    async createActionOAuthClientSetup(value) {
      registration = value;
      return { clientId: "40000000-0000-4000-8000-000000000004" };
    }
  })(request("oauth/clients/register", {}));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.client_secret, /^ars_[A-Za-z0-9_-]{40,}$/u);
  assert.match(registration.clientSecretHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(payload.client_secret, registration.clientSecretHash);
  assert.equal(payload.token_endpoint_auth_method, "client_secret_post");
});

test("OpenAPI de Actions permanece derivado do catálogo corrente e compacto", async () => {
  const file = await readFile(
    new URL(
      "../../docs/downloads/aralearn-chatgpt-action-openapi.yaml",
      import.meta.url
    )
  );
  assert.ok(file.byteLength < 136 * 1024);
  const openApi = JSON.parse(file);
  const editorProjectionLength = JSON.stringify(openApi, null, 2).length;
  assert.ok(
    editorProjectionLength < 190_000,
    `O editor de GPT expandiria o OpenAPI para ${editorProjectionLength} caracteres.`
  );
  assert.deepEqual(openApi.security, [{ AraLearnOAuth: ["openid", "email"] }]);
  assert.ok(openApi.components.responses.Success);
  assert.ok(openApi.components.responses.Error);
  for (const pathValue of Object.values(openApi.paths)) {
    assert.deepEqual(pathValue.post.responses, {
      "200": { $ref: "#/components/responses/Success" },
      default: { $ref: "#/components/responses/Error" }
    });
  }
  assert.equal(openApi.info["x-aralearn-protocol"], AUTHORING_PROTOCOL_ID);
  assert.equal(
    openApi.info["x-aralearn-protocol-schema-version"],
    AUTHORING_PROTOCOL_SCHEMA_VERSION
  );
  assert.equal(
    openApi.info["x-aralearn-contract-fingerprint"],
    AUTHORING_PROTOCOL_V1_SCHEMA_HASH
  );
  assert.equal(
    openApi.info["x-aralearn-conversational-projection"],
    AUTHORING_CONVERSATIONAL_PROJECTION_ID
  );
  assert.equal(
    openApi.info["x-aralearn-conversational-projection-version"],
    AUTHORING_CONVERSATIONAL_PROJECTION_VERSION
  );
  assert.equal(
    openApi.info["x-aralearn-conversational-projection-fingerprint"],
    AUTHORING_CONVERSATIONAL_PROJECTION_HASH
  );
  assert.match(openApi.info.description, /uma única aprovação/iu);
  assert.match(openApi.info.description, /não confirme cada chamada/iu);
  assert.match(openApi.info.description, /crie um foco das Unidades pertinentes/iu);
  const inputSchemas = Object.values(openApi.paths).map(
    ({ post }) => post.requestBody.content["application/json"].schema
  );
  assert.equal(inputSchemas.some((schema) => JSON.stringify(schema).includes('"allOf"')), false);
  assert.equal(inputSchemas.some((schema) => JSON.stringify(schema).includes('"const"')), false);
  const projected = projectAuthoringProtocolToolsForActions(AUTHORING_PROTOCOL_V1_TOOLS);
  for (const tool of projected) {
    const operation = openApi.paths[`/${tool.name}`]?.post;
    assert.equal(operation.operationId, tool.name);
    assert.ok(operation.requestBody.content["application/json"].schema, tool.name);
  }
  for (const projection of AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS) {
    const operation = openApi.paths[projection.path]?.post;
    assert.equal(operation.operationId, projection.operationId);
    assert.ok(
      operation.requestBody.content["application/json"].schema,
      projection.operationId
    );
  }
});

test("migration de Actions restaura somente a execução server-side do OAuth", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260824130000_restore_gpt_actions_openapi.sql",
      import.meta.url
    ),
    "utf8"
  );
  for (const name of [
    "create_authoring_action_oauth_client_setup_v4",
    "link_authoring_action_oauth_client_v4",
    "create_authoring_action_oauth_authorization_v4",
    "get_authoring_action_oauth_authorization_v4",
    "approve_authoring_action_oauth_authorization_v4",
    "deny_authoring_action_oauth_authorization_v4",
    "exchange_authoring_action_oauth_code_v4",
    "exchange_authoring_action_oauth_refresh_v4",
    "resolve_authoring_action_oauth_principal_v4"
  ]) {
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]+?\\)\\s+to service_role;`, "u")
    );
  }
  assert.match(migration, /from public, anon, authenticated, service_role;/u);
  assert.match(migration, /has_function_privilege\([\s\S]+?'authenticated'[\s\S]+?'EXECUTE'[\s\S]+?\)/u);
});

test("OAuth de Actions resolve a pessoa sem consumir o resolvedor legado", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260824140000_detach_gpt_actions_from_legacy_oauth.sql",
      import.meta.url
    ),
    "utf8"
  );
  assert.match(migration, /join auth\.users account_value/u);
  assert.match(migration, /join public\.person_profiles profile_value/u);
  assert.match(migration, /'contract', 'aralearn\.action-oauth-principal\.v1'/u);
  assert.doesNotMatch(
    migration,
    /v_principal\s*:=\s*public\.resolve_authoring_oauth_principal/u
  );
  assert.match(
    migration,
    /grant execute on function public\.resolve_authoring_action_oauth_principal_v4\(text\)\s+to service_role;/u
  );
});
