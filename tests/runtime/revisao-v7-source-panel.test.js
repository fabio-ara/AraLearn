import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { createCourseSourcesPanel } from "../../src/ui/CourseSourcesPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_ID = "20000000-0000-4000-8000-000000000002";

class Root {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  contains() { return true; }
}

function source(overrides = {}) {
  return {
    sourceId: "source-01", revision: 1, status: "active", kind: "book",
    defaultRoles: ["technical_conceptual"], title: "Obra de teste",
    authors: [{ literal: "Autoria" }], publicationDate: "2026", identifier: null,
    language: "pt-BR", citationMode: "manual", citationText: "Autoria. Obra de teste. 2026.",
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), url: "https://example.test/work",
    editionOrVersion: null, origin: "external", availability: "open_access",
    verificationStatus: "author_verified", studyVisibility: "citation_and_link",
    publicFileAccess: "inherit", anchorCount: 0, createdAt: "2026-09-24T00:00:00.000Z",
    attachments: [],
    ...overrides
  };
}

function anchor(id, page) {
  return {
    anchorId: id, revision: 1, sourceRevision: 1, status: "active",
    selector: { kind: "page_range", startPage: page, endPage: page },
    contentHash: null, humanLocator: `Capítulo ${page}`, verificationExcerpt: null,
    needsReverification: false, createdAt: "2026-09-24T00:00:00.000Z"
  };
}

function catalogPage(items, nextCursor = null) {
  return {
    contract: "aralearn.course-sources.v3", courseId: COURSE_ID, courseRevision: 5,
    bibliographyStyle: "abnt-2025", mode: "catalog",
    query: { sourceId: null, targetKind: null, targetId: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, items, nextCursor
  };
}

function sourcePage(value, items = [value]) {
  return {
    contract: "aralearn.course-sources.v3", courseId: COURSE_ID, courseRevision: 5,
    bibliographyStyle: "abnt-2025", mode: "source",
    query: { sourceId: value.sourceId, targetKind: null, targetId: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, items, nextCursor: null
  };
}

function targetPage(sourceLinks = [], targetKind = "plan_item", targetId = TARGET_ID) {
  return {
    contract: "aralearn.course-sources.v3", courseId: COURSE_ID, courseRevision: 5,
    bibliographyStyle: "abnt-2025", mode: "target",
    query: { sourceId: null, targetKind, targetId },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [{ targetKind, targetId, targetVersion: 1,
      sourceLinks, createdAt: "2026-09-24T00:00:00.000Z" }], nextCursor: null
  };
}

function controllerFor({ current, detailedItems = [current], nextCursor = null } = {}) {
  const catalogSummary = structuredClone(current);
  delete catalogSummary.anchors;
  delete catalogSummary.attachments;
  return {
    async loadCourseSources(_courseId, options) {
      if (options.mode === "catalog") return catalogPage([catalogSummary], nextCursor);
      if (options.mode === "target") return targetPage([], options.targetKind, options.targetId);
      return sourcePage(current, detailedItems);
    },
    async mutateCourseSources(request) {
      return { contract: "aralearn.course-source-change.v1", courseId: COURSE_ID,
        courseRevision: request.expectedCourseRevision, requestId: request.requestId,
        idempotent: false, changed: false, change: null };
    },
    async loadCourseAnchoredAnnotations(_courseId, options) {
      return { contract: "aralearn.course-anchored-annotation-page.v1", courseId: COURSE_ID,
        courseRevision: options.expectedCourseRevision, annotationSetVersion: 0,
        query: options.query, summary: { matchingTotal: 0, byOrigin: {}, byChannel: {},
          byState: {}, unclassifiedTotal: 0 }, items: [], hasMore: false, nextCursor: null };
    },
    async mutateCourseAnchoredAnnotations() { throw new Error("observações não usadas neste cenário"); }
  };
}

function click(root, action, dataset = {}) {
  const target = { dataset: { sourceAction: action, ...dataset },
    closest() { return this; } };
  root.listeners.get("click")({ target, preventDefault() {} });
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("catálogo comunica itens carregados e continuação sem fingir total", async () => {
  const root = new Root();
  const current = source();
  const panel = createCourseSourcesPanel({ root, controller: controllerFor({ current, nextCursor: "next-page" }),
    courseId: COURSE_ID, courseRevision: 5 });

  await panel.open();
  assert.match(root.innerHTML, /1\+ fontes/u);
  assert.match(root.innerHTML, /1 carregada; há mais fontes/u);
  assert.match(root.innerHTML, /aria-label="Carregar mais fontes"/u);
  panel.destroy();
});

test("ficha explicita obra, contagem de âncoras e controle textual do trecho", async () => {
  const current = source({ anchorCount: 2, anchors: [anchor("a-1", 3), anchor("a-2", 8)] });
  const root = new Root();
  const panel = createCourseSourcesPanel({ root, controller: controllerFor({ current }),
    courseId: COURSE_ID, courseRevision: 5 });

  await panel.open();
  click(root, "open-source", { sourceId: current.sourceId });
  await settle();
  assert.match(root.innerHTML, /course-source-entity-label">Obra · <\/span>Obra de teste/u);
  assert.match(root.innerHTML, /Âncoras na fonte/u);
  assert.match(root.innerHTML, />2 âncoras</u);
  assert.match(root.innerHTML, /Adicionar âncora/u);
  panel.destroy();
});

test("fonte existente sem detalhe de âncora é indicada como não demonstrada", async () => {
  const current = source({ anchorCount: 2 });
  const root = new Root();
  const panel = createCourseSourcesPanel({ root,
    controller: controllerFor({ current, detailedItems: [] }),
    courseId: COURSE_ID, courseRevision: 5, mode: "target", targetKind: "plan_item",
    targetId: TARGET_ID, targetVersion: 1 });

  await panel.open();
  click(root, "show-source-catalog");
  click(root, "add-target-source", { sourceId: current.sourceId });
  await settle();
  assert.match(root.innerHTML, /Fonte · obra/u);
  assert.match(root.innerHTML, /Fonte existente; as âncoras ainda não foram demonstradas/u);
  assert.match(root.innerHTML, /Ocorrências no texto/iu);
  assert.match(root.innerHTML, /0 ocorrências/u);
  panel.destroy();
});

test("seletor de ocorrência identifica a parte do texto sem repetir a finalidade inteira", async () => {
  const current = source({ anchorCount: 1, anchors: [anchor("a-1", 3)] });
  const longText = "Finalidade longa do componente que não precisa ser repetida em cada opção do seletor.";
  const targetExplanation = {
    title: "Explicação", content: [
      { id: "p-1", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: longText } },
      { id: "p-2", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Segundo bloco do texto." } }
    ]
  };
  const root = new Root();
  const panel = createCourseSourcesPanel({ root, controller: controllerFor({ current }),
    courseId: COURSE_ID, courseRevision: 5, mode: "target",
    targetKind: "microsequence_explanation", targetId: "explanation-1", targetVersion: 1,
    targetExplanation });

  await panel.open();
  click(root, "show-source-catalog");
  click(root, "add-target-source", { sourceId: current.sourceId });
  await settle();
  assert.match(root.innerHTML, /Parte do texto/u);
  assert.match(root.innerHTML, /Conteúdo · Bloco 1 · Texto/u);
  assert.doesNotMatch(root.innerHTML, /<option[^>]*>[^<]*Finalidade longa do componente/u);
  panel.destroy();
});
