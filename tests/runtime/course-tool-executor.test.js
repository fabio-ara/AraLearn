import test from "node:test";
import assert from "node:assert/strict";

import {
  executeCourseTool,
  projectCourseToolResultForMcp
} from "../../supabase/functions/_shared/aralearn-authoring/courseToolExecutor.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  listCourseAuthoringKnowledgeResources,
  readCourseAuthoringKnowledgeResource
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_ACTOR_ID = "30000000-0000-4000-8000-000000000003";
const SOURCE_ATTRIBUTION_ID = "40000000-0000-4000-8000-000000000004";
const PDF_HASH = "a".repeat(64);
const PDF_STORAGE_PATH = `${COURSE_ID}/${PDF_HASH}.pdf`;
const PDF_SIGNED_URL =
  "https://storage.example.test/object/course-source.pdf?token=signed-download-secret";
const TEXT_QUOTE_EXACT = "Trecho exato potencialmente pessoal sentinel-text-quote";
const TEXT_QUOTE_PREFIX = "Prefixo potencialmente pessoal sentinel-prefix";
const TEXT_QUOTE_SUFFIX = "Sufixo potencialmente pessoal sentinel-suffix";
const URI_FRAGMENT = "section=sentinel-uri-fragment";
const PRINCIPAL = { actorId: COURSE_ID, scopes: ["authoring:write"] };

function protectedAnnotationPage() {
  const rawText = "Texto pessoal integral sentinel@example.test";
  const path = [{ kind: "course", id: COURSE_ID, label: "Curso", version: 7 }, {
    kind: "study_unit",
    id: "study-unit-internal-ref",
    label: "Unidade visível",
    version: 3
  }];
  return {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    annotationSetVersion: 3,
    query: { mode: "inbox", hierarchy: null },
    summary: {
      matchingTotal: 1,
      byOrigin: { learner: 1 },
      byChannel: { study_interface: 1 },
      byState: { open: 1 },
      unclassifiedTotal: 0
    },
    items: [{
      contract: "aralearn.course-anchored-annotation.v1",
      annotationId: "20000000-0000-4000-8000-000000000002",
      annotationVersion: 2,
      courseId: COURSE_ID,
      provenance: { origin: "learner", channel: "study_interface" },
      contributor: {
        kind: "protected_person",
        role: "learner",
        ref: "person-deadbeefdeadbeef",
        label: "Estudante DEAD"
      },
      target: {
        kind: "study_unit",
        id: "study-unit-internal-ref",
        observedPath: path,
        currentAvailable: true,
        currentPath: path,
        deepLink: "https://app.example/#/authoring?section=observations"
      },
      observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 3 },
      rawText,
      category: "confusing",
      briefSummary: "Trecho confuso",
      subjectClassification: {
        status: "classified",
        automatic: { subjects: [] },
        effective: {
          subjects: [{ topicId: "topic-internal-ref", label: "Relações", topicVersion: 4 }]
        },
        correctedAt: null
      },
      state: "open",
      ownerResponse: {
        text: "Resposta autoral integral",
        kind: "answer",
        consideredSourceLinks: [],
        updatedAt: "2026-08-21T12:10:00Z"
      },
      timestamps: {
        capturedAt: "2026-08-21T12:00:00Z",
        createdAt: "2026-08-21T12:00:00Z",
        updatedAt: "2026-08-21T12:10:00Z",
        firstConsideredAt: null,
        respondedAt: "2026-08-21T12:10:00Z",
        resolvedAt: null,
        withdrawnAt: null
      },
      capabilities: {
        canRevise: false,
        canWithdraw: false,
        canConsider: true,
        canRespond: true,
        canResolve: true,
        canReopen: false,
        canCorrectSubjects: true
      },
      deepLink: "https://app.example/#/authoring?annotation=opaque"
    }],
    hasMore: false,
    nextCursor: null
  };
}

function protectedCourseSourcesPage() {
  return {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    mode: "source",
    query: { sourceId: "source-a", targetKind: null, targetId: null },
    pdfStorage: { uniqueBytes: 1_024, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [{
      sourceId: "source-a",
      revision: 2,
      status: "active",
      kind: "document",
      title: "Fonte A",
      authorship: "Autoria",
      publicationDate: "2026",
      identifier: "ISBN 0000",
      language: "pt-BR",
      citationText: "AUTORIA. Fonte A.",
      url: "https://example.test/source-a",
      editionOrVersion: "2",
      origin: "author_provided",
      availability: "private",
      verificationStatus: "author_verified",
      studyVisibility: "citation",
      anchorCount: 3,
      createdAt: "2026-08-21T12:00:00Z",
      actorId: SOURCE_ACTOR_ID,
      anchors: [{
        anchorId: "anchor-a",
        revision: 1,
        sourceRevision: 2,
        status: "active",
        selector: { kind: "page_range", startPage: 2, endPage: 3 },
        verificationExcerpt: "Trecho verificável.",
        actorId: SOURCE_ACTOR_ID,
        createdAt: "2026-08-21T12:01:00Z"
      }, {
        anchorId: "anchor-text-quote",
        revision: 1,
        sourceRevision: 2,
        status: "active",
        selector: {
          kind: "text_quote",
          exact: TEXT_QUOTE_EXACT,
          prefix: TEXT_QUOTE_PREFIX,
          suffix: TEXT_QUOTE_SUFFIX
        },
        verificationExcerpt: null,
        actorId: SOURCE_ACTOR_ID,
        createdAt: "2026-08-21T12:01:30Z"
      }, {
        anchorId: "anchor-uri-fragment",
        revision: 1,
        sourceRevision: 2,
        status: "active",
        selector: { kind: "uri_fragment", fragment: URI_FRAGMENT },
        verificationExcerpt: null,
        actorId: SOURCE_ACTOR_ID,
        createdAt: "2026-08-21T12:01:45Z"
      }],
      attachments: [{
        contentHash: PDF_HASH,
        byteSize: 1_024,
        mediaType: "application/pdf",
        storagePath: PDF_STORAGE_PATH,
        actorId: SOURCE_ACTOR_ID,
        createdAt: "2026-08-21T12:02:00Z"
      }]
    }],
    nextCursor: null
  };
}

function protectedCourseSourceTargetPage() {
  return {
    ...protectedCourseSourcesPage(),
    mode: "target",
    query: { sourceId: null, targetKind: "study_unit", targetId: "study-unit-a" },
    items: [{
      attributionId: SOURCE_ATTRIBUTION_ID,
      targetKind: "study_unit",
      targetId: "study-unit-a",
      targetVersion: 3,
      targetHash: "b".repeat(64),
      revision: 2,
      sourceLinks: [{
        sourceId: "source-a",
        sourceRevision: 2,
        relation: "supported_by",
        anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
      }],
      actorId: SOURCE_ACTOR_ID,
      createdAt: "2026-08-21T12:03:00Z",
      effective: true
    }]
  };
}

function protectedAttachmentDownload() {
  return {
    contract: "aralearn.course-source-attachment-access.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    operation: "download",
    sourceId: "source-a",
    sourceRevision: 2,
    storageOriginCourseId: COURSE_ID,
    attachment: {
      contentHash: PDF_HASH,
      byteSize: 1_024,
      mediaType: "application/pdf",
      storagePath: PDF_STORAGE_PATH
    },
    uploadRequired: false,
    alreadyLinked: true,
    signedUrl: PDF_SIGNED_URL,
    expiresAt: "2026-08-21T12:01:00Z"
  };
}

test("executa leitura de Curso pela mesma rota usada pelo aplicativo", async () => {
  let received = null;
  const result = await executeCourseTool({
    adapter: {
      async getCourse(value) {
        received = value;
        return { courseId: value.courseId, revision: 3 };
      }
    },
    principal: PRINCIPAL,
    name: "lerCurso",
    rawArguments: { courseId: COURSE_ID },
    deadlineAt: Date.now() + 1_000
  });

  assert.equal(received.courseId, COURSE_ID);
  assert.equal(result.data.revision, 3);
  assert.equal(result.requestId, null);
});

test("impede escrita sem escopo", async () => {
  await assert.rejects(
    () => executeCourseTool({
      adapter: {},
      principal: { actorId: COURSE_ID, scopes: ["authoring:read"] },
      name: "criarCurso",
      rawArguments: {
        requestId: "request-course-0001",
        title: "Curso",
        objective: "Aprender"
      }
    }),
    (error) => error.status === 403
  );
});

test("projeção MCP de Observações omite identidade, caminhos e texto fora do detalhe", () => {
  const projected = projectCourseToolResultForMcp(protectedAnnotationPage());
  const serialized = JSON.stringify(projected);
  const item = projected.items[0];

  assert.equal(projected.contract, "aralearn.mcp-anchored-annotation-page.v1");
  assert.equal(item.target.label, "Unidade visível");
  assert.deepEqual(item.contributor, {
    kind: "protected_person",
    role: "learner"
  });
  assert.deepEqual(item.subjectClassification.subjects, [{ label: "Relações" }]);
  assert.equal(projected.dataDisclosure.rawObservationTextIncluded, false);
  for (const protectedValue of [
    COURSE_ID,
    "person-deadbeefdeadbeef",
    "study-unit-internal-ref",
    "topic-internal-ref",
    "Estudante DEAD",
    "sentinel@example.test",
    "Resposta autoral integral"
  ]) {
    assert.equal(serialized.includes(protectedValue), false, protectedValue);
  }
  for (const protectedField of ["observedPath", "currentPath", "topicId", "topicVersion", "ref"] ) {
    assert.equal(Object.hasOwn(item.target, protectedField), false, protectedField);
  }
  assert.equal(Object.hasOwn(item.contributor, "label"), false);
  assert.equal(Object.hasOwn(item.target, "deepLink"), false);
  assert.equal(Object.hasOwn(item, "deepLink"), false);
});

test("texto integral de Observação só entra no detalhe explicitamente declarado", async () => {
  const page = protectedAnnotationPage();
  const detail = projectCourseToolResultForMcp(page, { includeObservationText: true });
  assert.equal(detail.items[0].rawText, page.items[0].rawText);
  assert.equal(Object.hasOwn(detail.items[0].ownerResponse, "text"), false);
  assert.equal(JSON.stringify(detail).includes(page.items[0].ownerResponse.text), false);
  assert.equal(detail.dataDisclosure.rawObservationTextIncluded, true);

  let received = null;
  const result = await executeCourseTool({
    adapter: {
      async getCourseAnchoredAnnotations(value) {
        received = value;
        return page;
      }
    },
    principal: PRINCIPAL,
    name: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "anchored_annotations",
      expectedRevision: 7,
      mode: "detail",
      annotationId: page.items[0].annotationId,
      includeObservationText: true
    }
  });
  assert.equal(received.query.mode, "detail");
  assert.equal(result.data.items[0].rawText, page.items[0].rawText);
  assert.equal(result.data.dataDisclosure.recipient, "connected_mcp_client");

  await assert.rejects(() => executeCourseTool({
    adapter: { async getCourseAnchoredAnnotations() { return page; } },
    principal: PRINCIPAL,
    name: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "anchored_annotations",
      expectedRevision: 7,
      mode: "detail",
      annotationId: page.items[0].annotationId
    }
  }), (error) => error.code === "observation_text_disclosure_required");
});

test("contexto MCP de auditoria minimiza Observações selecionadas", () => {
  const source = protectedAnnotationPage().items[0];
  const audit = {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    context: { annotations: [source] }
  };
  const projected = projectCourseToolResultForMcp(audit);
  const annotation = projected.context.annotations[0];

  assert.deepEqual(Object.keys(annotation).toSorted(), [
    "annotationId", "annotationVersion", "briefSummary", "category", "state", "target"
  ].toSorted());
  assert.deepEqual(annotation.target, { kind: "study_unit" });
  assert.equal(projected.dataDisclosure.rawObservationTextIncluded, false);
  assert.equal(Object.hasOwn(projected, "courseId"), false);
  assert.equal(JSON.stringify(projected).includes(COURSE_ID), false);
  assert.equal(JSON.stringify(projected).includes("person-deadbeefdeadbeef"), false);
  assert.equal(JSON.stringify(projected).includes("Estudante DEAD"), false);

  const withText = projectCourseToolResultForMcp(audit, { includeObservationText: true });
  assert.equal(withText.context.annotations[0].rawText, source.rawText);
  assert.equal(Object.hasOwn(withText.context.annotations[0], "deepLink"), false);
});

test("aplicação conserva o DTO completo de Observações sem confirmação própria do MCP", async () => {
  const page = protectedAnnotationPage();
  const result = await executeCourseTool({
    adapter: { async getCourseAnchoredAnnotations() { return page; } },
    principal: { ...PRINCIPAL, authenticationKind: "application" },
    name: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "anchored_annotations",
      expectedRevision: 7,
      mode: "detail",
      annotationId: page.items[0].annotationId
    },
    surface: "application"
  });
  assert.equal(result.data.items[0].contributor.ref, "person-deadbeefdeadbeef");
  assert.equal(result.data.items[0].target.observedPath.at(-1).id, "study-unit-internal-ref");
});

test("projeção MCP de Fontes conserva referências autorais e omite pessoas e infraestrutura", () => {
  const sourcePage = projectCourseToolResultForMcp(protectedCourseSourcesPage());
  const source = sourcePage.items[0];
  const serializedSource = JSON.stringify(sourcePage);

  assert.equal(sourcePage.contract, "aralearn.mcp-course-sources.v1");
  assert.equal(source.sourceId, "source-a");
  assert.equal(source.identifier, "ISBN 0000");
  assert.equal(source.editionOrVersion, "2");
  assert.equal(source.anchors[0].anchorId, "anchor-a");
  assert.deepEqual(source.anchors[1].selector, {
    kind: "text_quote",
    exact: TEXT_QUOTE_EXACT,
    prefix: TEXT_QUOTE_PREFIX,
    suffix: TEXT_QUOTE_SUFFIX
  });
  assert.deepEqual(source.anchors[2].selector, {
    kind: "uri_fragment",
    fragment: URI_FRAGMENT
  });
  assert.equal(source.attachments[0].contentHash, PDF_HASH);
  assert.equal(source.attachments[0].byteSize, 1_024);
  assert.equal(sourcePage.dataDisclosure.recipient, "connected_mcp_client");
  assert.equal(sourcePage.dataDisclosure.attachmentDownloadUrlIncluded, false);
  assert.deepEqual(sourcePage.dataDisclosure.potentiallyPersonalFreeTextIncluded, [
    "items[].title",
    "items[].authorship",
    "items[].identifier",
    "items[].citationText",
    "items[].url",
    "items[].editionOrVersion",
    "items[].anchors[].verificationExcerpt",
    "items[].anchors[].selector.exact",
    "items[].anchors[].selector.prefix",
    "items[].anchors[].selector.suffix",
    "items[].anchors[].selector.fragment"
  ]);
  for (const disclosedValue of [
    TEXT_QUOTE_EXACT,
    TEXT_QUOTE_PREFIX,
    TEXT_QUOTE_SUFFIX,
    URI_FRAGMENT
  ]) {
    assert.equal(serializedSource.includes(disclosedValue), true, disclosedValue);
  }
  const pageRangeOnly = protectedCourseSourcesPage();
  pageRangeOnly.items[0].anchorCount = 1;
  pageRangeOnly.items[0].anchors = [pageRangeOnly.items[0].anchors[0]];
  const pageRangeOnlyDisclosure = projectCourseToolResultForMcp(pageRangeOnly)
    .dataDisclosure.potentiallyPersonalFreeTextIncluded;
  for (const selectorPath of ["exact", "prefix", "suffix", "fragment"]
    .map((field) => `items[].anchors[].selector.${field}`)) {
    assert.equal(pageRangeOnlyDisclosure.includes(selectorPath), false, selectorPath);
  }
  for (const protectedValue of [COURSE_ID, SOURCE_ACTOR_ID, PDF_STORAGE_PATH]) {
    assert.equal(serializedSource.includes(protectedValue), false, protectedValue);
  }
  for (const protectedField of ["actorId", "storagePath"]) {
    assert.equal(Object.hasOwn(source, protectedField), false, protectedField);
    assert.equal(Object.hasOwn(source.anchors[0], protectedField), false, protectedField);
    assert.equal(Object.hasOwn(source.attachments[0], protectedField), false, protectedField);
  }

  const targetPage = projectCourseToolResultForMcp(protectedCourseSourceTargetPage());
  const attribution = targetPage.items[0];
  assert.equal(attribution.targetId, "study-unit-a");
  assert.equal(attribution.sourceLinks[0].sourceId, "source-a");
  assert.equal(Object.hasOwn(attribution, "attributionId"), false);
  assert.equal(Object.hasOwn(attribution, "targetHash"), false);
  assert.equal(Object.hasOwn(attribution, "actorId"), false);
  assert.equal(JSON.stringify(targetPage).includes(SOURCE_ATTRIBUTION_ID), false);
  assert.equal(JSON.stringify(targetPage).includes(SOURCE_ACTOR_ID), false);
});

test("download MCP exige opt-in antes do adapter e projeta a URL como credencial de 60 s", async () => {
  let adapterCalls = 0;
  const adapter = {
    async getCourseSourceAttachmentAccess() {
      adapterCalls += 1;
      return protectedAttachmentDownload();
    }
  };
  const argumentsWithoutDisclosure = {
    courseId: COURSE_ID,
    view: "course_source_attachment",
    expectedRevision: 7,
    attachmentOperation: "download",
    sourceId: "source-a",
    sourceRevision: 2,
    contentHash: PDF_HASH
  };

  await assert.rejects(() => executeCourseTool({
    adapter,
    principal: PRINCIPAL,
    name: "lerCurso",
    rawArguments: argumentsWithoutDisclosure
  }), (error) => {
    assert.equal(error.code, "attachment_download_url_disclosure_required");
    assert.equal(String(error.message).includes(PDF_SIGNED_URL), false);
    return true;
  });
  assert.equal(adapterCalls, 0);

  const result = await executeCourseTool({
    adapter,
    principal: PRINCIPAL,
    name: "lerCurso",
    rawArguments: {
      ...argumentsWithoutDisclosure,
      includeAttachmentDownloadUrl: true
    }
  });
  assert.equal(adapterCalls, 1);
  assert.equal(result.data.contract, "aralearn.mcp-course-source-attachment-access.v1");
  assert.equal(result.data.signedUrl, PDF_SIGNED_URL);
  assert.equal(result.data.expiresAt, protectedAttachmentDownload().expiresAt);
  assert.deepEqual(result.data.attachment, {
    contentHash: PDF_HASH,
    byteSize: 1_024,
    mediaType: "application/pdf"
  });
  assert.deepEqual(result.data.dataDisclosure, {
    recipient: "connected_mcp_client",
    purpose: "author_requested_pdf_download",
    attachmentDownloadUrlIncluded: true,
    attachmentDownloadUrlKind: "time_limited_bearer_credential",
    attachmentDownloadUrlExpiresInSeconds: 60,
    omitted: [
      "courseId",
      "storageOriginCourseId",
      "attachment.storagePath",
      "attachment.actorId"
    ]
  });
  const serialized = JSON.stringify(result.data);
  assert.equal(serialized.includes(PDF_STORAGE_PATH), false);
  assert.equal(Object.hasOwn(result.data, "storageOriginCourseId"), false);
});

test("projeção defensiva não devolve URL sem opt-in e a aplicação conserva o DTO completo", async () => {
  const raw = protectedAttachmentDownload();
  const minimized = projectCourseToolResultForMcp(raw);
  assert.equal(Object.hasOwn(minimized, "signedUrl"), false);
  assert.equal(Object.hasOwn(minimized, "expiresAt"), false);
  assert.equal(JSON.stringify(minimized).includes(PDF_SIGNED_URL), false);
  assert.equal(minimized.dataDisclosure.attachmentDownloadUrlIncluded, false);

  const sourcePage = protectedCourseSourcesPage();
  const applicationSources = await executeCourseTool({
    adapter: { async getCourseSources() { return sourcePage; } },
    principal: { ...PRINCIPAL, authenticationKind: "application" },
    name: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 7,
      mode: "source",
      sourceId: "source-a"
    },
    surface: "application"
  });
  assert.equal(applicationSources.data.contract, "aralearn.course-sources.v1");
  assert.equal(applicationSources.data.courseId, COURSE_ID);
  assert.equal(applicationSources.data.items[0].actorId, SOURCE_ACTOR_ID);
  assert.equal(applicationSources.data.items[0].attachments[0].storagePath, PDF_STORAGE_PATH);

  const applicationDownload = await executeCourseTool({
    adapter: { async getCourseSourceAttachmentAccess() { return raw; } },
    principal: { ...PRINCIPAL, authenticationKind: "application" },
    name: "lerCurso",
    rawArguments: {
      courseId: COURSE_ID,
      view: "course_source_attachment",
      expectedRevision: 7,
      attachmentOperation: "download",
      sourceId: "source-a",
      sourceRevision: 2,
      contentHash: PDF_HASH
    },
    surface: "application"
  });
  assert.deepEqual(applicationDownload.data, raw);
});

test("executa cópia pessoal somente pela superfície da aplicação", async () => {
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
  let received = null;
  const rawArguments = {
    requestId: "request-personal-copy-0001",
    sourceCourseId: COURSE_ID,
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit,
    applicationOrigin: "manual"
  };
  const result = await executeCourseTool({
    adapter: {
      async commitPersonalCourseCopyEdit(value) {
        received = value;
        return { contract: "aralearn.personal-course-copy-edit.v1", changed: true };
      }
    },
    principal: {
      actorId: COURSE_ID,
      authenticationKind: "application",
      scopes: ["authoring:write"]
    },
    name: "criarCopiaPessoalDoCurso",
    rawArguments,
    surface: "application"
  });

  assert.equal(received.sourceCourseId, COURSE_ID);
  assert.equal(received.studyUnit.id, "unit-a");
  assert.equal(received.applicationOrigin, "manual");
  assert.equal(result.requestId, rawArguments.requestId);
  await assert.rejects(
    () => executeCourseTool({
      adapter: {},
      principal: { ...PRINCIPAL, authenticationKind: "oauth" },
      name: "criarCopiaPessoalDoCurso",
      rawArguments
    }),
    (error) => error.status === 403
  );
});

test("conhecimento contém somente invariantes estáveis", () => {
  const resources = listCourseAuthoringKnowledgeResources();
  assert.equal(resources.length, 1);
  assert.equal("text" in resources[0], false);
  const value = readCourseAuthoringKnowledgeResource(resources[0].uri);
  assert.match(value.text, /Curso vivo e mutável/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /não os fixe no prompt/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /targetPlanItems/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /somente as unidades de análise/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /audit_cycle em mode context/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /raciocínio privada/iu);
  assert.match(COURSE_AUTHORING_SERVER_INSTRUCTIONS, /Aplicar uma correção não prova/iu);
  assert.doesNotMatch(value.text, /workspace|trilha|coleção|publica(?:ção|do)/iu);
});
