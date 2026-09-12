import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { studyCitationMarkers } from "../../src/study/studyCitations.js";
import { createCourseInspectionCitations } from "../../src/ui/courseInspectionCitations.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_COURSE_ID = "10000000-0000-4000-8000-000000000002";
const CREATED_AT = "2026-09-12T10:00:00.000Z";
const HASH = "a".repeat(64);
const TEXT = "Um critério comum permite comparar relações.";
const CURSOR = "eyJvIjoxfQ==";

function studyUnit(id = "unit-a") {
  return { id, position: 1, title: "Comparação", role: "theory", response: null, feedback: [], topics: [],
    content: ["first", "second"].map(resourceId => ({ id: resourceId,
      package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: TEXT } })) };
}

function sourceLinks() {
  return ["first", "second"].map((resourceId, index) => ({
    linkId: `link-${resourceId}`, sourceId: "source-a", relation: "supported_by", roles: ["technical_conceptual"],
    anchors: [{ anchorId: `anchor-${index + 1}` }], occurrences: [{ occurrenceId: `occurrence-${resourceId}`,
      slot: "content", resourceId, path: "text", quote: TEXT, prefix: null, suffix: null }]
  }));
}

function source(courseId = COURSE_ID) {
  return { sourceId: "source-a", revision: 3, status: "active", kind: "book",
    defaultRoles: ["technical_conceptual"], title: "Comparar relações", authors: [{ literal: "Autoria sintética" }],
    publicationDate: "2026", identifier: null, language: "pt-BR", citationMode: "manual",
    citationText: "AUTORIA SINTÉTICA. Comparar relações. 2026.",
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), url: "https://example.test/reference",
    editionOrVersion: null, origin: "external", availability: "open_access", verificationStatus: "author_verified",
    studyVisibility: "citation_and_link", publicFileAccess: "inherit", anchorCount: 3, createdAt: CREATED_AT,
    anchors: [1, 2, 3].map(page => ({ anchorId: `anchor-${page}`, revision: 1, sourceRevision: 3,
      status: "active", selector: { kind: "page_range", startPage: page, endPage: page }, contentHash: HASH,
      humanLocator: `Página ${page}`, verificationExcerpt: null, needsReverification: false, createdAt: CREATED_AT })),
    attachments: [{ contentHash: HASH, byteSize: 1200, mediaType: "application/pdf",
      storagePath: `${courseId}/${HASH}.pdf`, publicFileAccess: "inherit", createdAt: CREATED_AT }] };
}

function readPage(courseId, options) {
  return { contract: "aralearn.course-sources.v3", courseId, courseRevision: options.expectedRevision,
    bibliographyStyle: "abnt-2025", mode: options.mode,
    query: { sourceId: options.sourceId ?? null, targetKind: options.targetKind ?? null, targetId: options.targetId ?? null },
    pdfStorage: { uniqueBytes: 1200, maxUniqueBytes: 64 * 1024 * 1024 },
    items: options.mode === "target" ? [{ targetKind: "study_unit", targetId: options.targetId,
      targetVersion: 4, sourceLinks: sourceLinks(), createdAt: CREATED_AT }] : [source(courseId)], nextCursor: null };
}

function harness(transform = page => page) {
  const calls = [];
  const controller = { async loadCourseSources(courseId, options) {
    calls.push({ courseId, options: structuredClone(options) });
    assert.ok(["target", "source"].includes(options.mode), "somente a proveniência do alvo e suas fontes são lidas");
    if (options.mode === "source") {
      assert.equal(options.targetKind, undefined, "uma fonte não herda o contexto de outro alvo");
      assert.equal(options.targetId, undefined);
    }
    return transform(readPage(courseId, options), options, calls);
  } };
  return { reader: createCourseInspectionCitations({ controller }), calls };
}

function request(overrides = {}) {
  const value = { courseId: COURSE_ID, courseRevision: 7, studyUnitId: "unit-a", studyUnitVersion: 4,
    studyUnit: studyUnit(), ...overrides };
  value.studyUnit = overrides.studyUnit ?? studyUnit(value.studyUnitId);
  return value;
}

test("citações da inspeção preservam vínculos distintos, âncoras e a ocorrência no segundo bloco idêntico", async () => {
  const { reader, calls } = harness();
  const input = request();
  const before = structuredClone(input.studyUnit);
  const result = await reader.load(input);
  assert.equal(result.value.courseId, COURSE_ID);
  assert.equal(result.value.courseRevision, 7);
  assert.equal(result.value.studyUnitId, "unit-a");
  assert.equal(result.value.bibliographyStyle, "abnt-2025");
  assert.deepEqual(result.value.citations.map(({ linkId, sourceId, anchors, occurrences }) => ({
    linkId, sourceId, anchors: anchors.map(({ anchorId }) => anchorId), occurrences
  })), sourceLinks().map(link => ({ linkId: link.linkId, sourceId: link.sourceId,
    anchors: link.anchors.map(({ anchorId }) => anchorId),
    occurrences: link.occurrences.map(occurrence => ({ ...occurrence, status: "resolved" })) })));
  assert.deepEqual(result.value.citations[0].attachments.map(({ contentHash, byteSize, mediaType }) =>
    ({ contentHash, byteSize, mediaType })), [{ contentHash: HASH, byteSize: 1200, mediaType: "application/pdf" }]);
  for (const { linkId } of sourceLinks()) {
    assert.equal(result.formattedReferences[linkId].text, source().citationText);
  }
  assert.deepEqual(studyCitationMarkers(input.studyUnit, result.value).map(({ occurrenceId, target }) =>
    ({ occurrenceId, resourceId: target.resourceId, path: target.path })), ["first", "second"].map(resourceId => ({
    occurrenceId: `occurrence-${resourceId}`, resourceId, path: "text"
  })));
  assert.deepEqual(calls, [
    { courseId: COURSE_ID, options: { mode: "target", targetKind: "study_unit", targetId: "unit-a", expectedRevision: 7 } },
    { courseId: COURSE_ID, options: { mode: "source", sourceId: "source-a", expectedRevision: 7 } }
  ]);
  assert.deepEqual(input.studyUnit, before);
});

test("cache de fonte serve dois alvos do mesmo curso e revisão, sem atravessar curso, revisão ou clear", async () => {
  const { reader, calls } = harness();
  await reader.load(request());
  await reader.load(request({ studyUnitId: "unit-b" }));
  assert.equal(calls.filter(({ options }) => options.mode === "source").length, 1);
  await reader.load(request({ courseRevision: 8 }));
  await reader.load(request({ courseId: OTHER_COURSE_ID, courseRevision: 8 }));
  assert.deepEqual(calls.filter(({ options }) => options.mode === "source").map(({ courseId, options }) =>
    [courseId, options.expectedRevision]), [[COURSE_ID, 7], [COURSE_ID, 8], [OTHER_COURSE_ID, 8]]);
  reader.clear();
  await reader.load(request({ courseId: OTHER_COURSE_ID, courseRevision: 8 }));
  assert.equal(calls.filter(({ options }) => options.mode === "source").length, 4);
});

test("ocorrência cujo recurso saiu da unidade mantém pendência e não migra para bloco de texto igual", async () => {
  const { reader } = harness();
  const unit = studyUnit();
  unit.content.pop();
  const result = await reader.load(request({ studyUnit: unit }));
  assert.equal(result.value.citations[1].occurrences[0].status, "needs_review");
  assert.deepEqual(studyCitationMarkers(unit, result.value).map(({ occurrenceId }) => occurrenceId), ["occurrence-first"]);
});

test("leitura rejeita identidade e versão diferentes do alvo solicitado", async () => {
  const changes = [
    page => { page.courseId = OTHER_COURSE_ID; },
    page => { page.courseRevision += 1; },
    page => { page.query.targetId = "unit-b"; },
    page => { page.items[0].targetId = "unit-b"; },
    page => { page.items[0].targetVersion += 1; }
  ];
  for (const change of changes) {
    const { reader, calls } = harness(page => { change(page); return page; });
    await assert.rejects(reader.load(request()), { code: "course_revision_changed" });
    assert.equal(calls.length, 1, "uma atribuição incompatível não permite carregar fontes");
  }
});

test("negação de acesso propaga o erro e permite nova leitura autorizada", async () => {
  const denied = Object.assign(new Error("Acesso negado sintético"), { code: "access_denied" });
  let block = true;
  const { reader } = harness((page, options) => {
    if (block && options.mode === "source") throw denied;
    return page;
  });
  await assert.rejects(reader.load(request()), error => error === denied);
  block = false;
  assert.equal((await reader.load(request())).value.citations.length, 2);
});

test("clear invalida a leitura em voo antes de ela publicar citações de um contexto encerrado", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let block = true;
  const { reader, calls } = harness(async page => {
    if (block) await pending;
    return page;
  });
  const load = reader.load(request());
  reader.clear();
  block = false;
  release();
  await assert.rejects(load, { code: "course_revision_changed" });
  assert.equal(calls.length, 1, "a resposta tardia não inicia leitura de fontes");
  assert.equal((await reader.load(request())).value.citations.length, 2);
});

test("paginação conserva a atribuição única e rejeita cursor ou atribuição repetidos", async () => {
  const { reader, calls } = harness((page, options) => {
    if (options.mode === "target" && !options.cursor) return { ...page, items: [], nextCursor: CURSOR };
    return page;
  });
  assert.equal((await reader.load(request())).value.citations.length, 2);
  assert.deepEqual(calls.filter(({ options }) => options.mode === "target").map(({ options }) => options.cursor),
    [undefined, CURSOR]);

  for (const repeatAttribution of [false, true]) {
    const repeated = harness((page, options) => {
      if (options.mode !== "target") return page;
      return { ...page, items: repeatAttribution ? page.items : [],
        nextCursor: repeatAttribution && options.cursor ? null : CURSOR };
    });
    await assert.rejects(repeated.reader.load(request()));
    assert.equal(repeated.calls.length, 2, "repetição encerra a leitura sem ciclo nem acesso a fontes");
  }
});
