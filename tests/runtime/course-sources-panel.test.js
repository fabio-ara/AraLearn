import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { createCourseSourcesPanel } from "../../src/ui/CourseSourcesPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PLAN_ITEM_ID = "20000000-0000-4000-8000-000000000002";
const HASH = "a".repeat(64);

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
    this.focusedSelectors = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  querySelector(selector) {
    return {
      focus: () => this.focusedSelectors.push(selector),
      scrollIntoView() {}
    };
  }

  querySelectorAll() {
    return [];
  }

  contains() {
    return true;
  }
}

function anchor(overrides = {}) {
  return {
    anchorId: "anchor-a",
    revision: 1,
    sourceRevision: 1,
    status: "active",
    selector: { kind: "page_range", startPage: 10, endPage: 12 },
    humanLocator: "Capítulo 2",
    verificationExcerpt: null,
    contentHash: null,
    needsReverification: false,
    createdAt: "2026-09-02T12:00:00.000Z",
    ...overrides
  };
}

function attachment(overrides = {}) {
  return {
    contentHash: HASH,
    byteSize: 2_048,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${overrides.contentHash ?? HASH}.pdf`,
    createdAt: "2026-09-02T12:00:00.000Z",
    publicFileAccess: "inherit",
    ...overrides
  };
}

function source(index = 1, overrides = {}) {
  return {
    sourceId: `source-${String(index).padStart(2, "0")}`,
    revision: 1,
    status: "active",
    kind: "book",
    defaultRoles: ["technical_conceptual"],
    bibliographic: createEmptyCourseSourceBibliographicMetadata(),
    citationMode: "manual",
    title: `Fonte ${index}`,
    authors: [{ literal: "Autoria" }],
    publicationDate: "2026",
    identifier: null,
    language: "pt-BR",
    citationText: `Autoria. Fonte ${index}. 2026.`,
    url: `https://example.test/source-${index}`,
    editionOrVersion: null,
    origin: "external",
    availability: "open_access",
    verificationStatus: "author_verified",
    studyVisibility: "citation_and_link",
    publicFileAccess: "inherit",
    anchorCount: 1,
    createdAt: "2026-09-02T12:00:00.000Z",
    ...overrides
  };
}

function catalogPage(items, { revision = 5, nextCursor = null } = {}) {
  return {
    contract: "aralearn.course-sources.v3",
    bibliographyStyle: "abnt-2025",
    courseId: COURSE_ID,
    courseRevision: revision,
    mode: "catalog",
    query: { sourceId: null, targetKind: null, targetId: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items,
    nextCursor
  };
}

function sourcePage(value, options = {}) {
  return {
    contract: "aralearn.course-sources.v3",
    bibliographyStyle: "abnt-2025",
    courseId: COURSE_ID,
    courseRevision: options.expectedRevision ?? 5,
    mode: "source",
    query: {
      sourceId: value.sourceId,
      targetKind: options.targetKind ?? null,
      targetId: options.targetId ?? null
    },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [{
      ...value,
      anchors: structuredClone(value.anchors ?? [anchor({ sourceRevision: value.revision })]),
      attachments: structuredClone(value.attachments ?? [])
    }],
    nextCursor: null
  };
}

function targetPage(sourceLinks = [], { revision = 5 } = {}) {
  return {
    contract: "aralearn.course-sources.v3",
    bibliographyStyle: "abnt-2025",
    courseId: COURSE_ID,
    courseRevision: revision,
    mode: "target",
    query: { sourceId: null, targetKind: "plan_item", targetId: PLAN_ITEM_ID },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: sourceLinks === null ? [] : [{
      targetKind: "plan_item",
      targetId: PLAN_ITEM_ID,
      targetVersion: 3,
      sourceLinks: structuredClone(sourceLinks),
      createdAt: "2026-09-02T12:00:00.000Z"
    }],
    nextCursor: null
  };
}

function annotationPage(courseRevision = 5) {
  return {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision,
    annotationSetVersion: 0,
    query: {
      mode: "target",
      origins: [],
      channels: [],
      states: [],
      categories: [],
      includeUncategorized: true,
      subjectIds: [],
      hierarchy: null,
      annotationId: null
    },
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
}

function changeResult(requestId, courseRevision = 5) {
  return {
    contract: "aralearn.course-source-change.v1",
    courseId: COURSE_ID,
    courseRevision,
    requestId,
    idempotent: false,
    changed: false,
    change: null
  };
}

function fileAccessReceipt(request, overrides = {}) {
  return { contract: "aralearn.course-source-file-access-change.v1", courseId: request.courseId,
    courseRevision: request.expectedRevision + 1, sourceId: request.sourceId,
    sourceRevision: request.sourceRevision + 1, contentHash: request.contentHash,
    publicFileAccess: request.publicFileAccess, changed: true, idempotent: false, ...overrides };
}

function controllerFixture({
  catalog = [source()],
  details = new Map(catalog.map((item) => [item.sourceId, item])),
  links = null,
  onRead = () => {},
  onMutate = () => {},
  onUpload = () => {},
  onDownload = () => {},
  onFileAccess = (request) => fileAccessReceipt(request)
} = {}) {
  return {
    async loadCourseSources(_courseId, options) {
      onRead(structuredClone(options));
      if (options.mode === "catalog") return catalogPage(catalog.map((item) => {
        const summary = structuredClone(item);
        delete summary.anchors;
        delete summary.attachments;
        return summary;
      }), { revision: options.expectedRevision });
      if (options.mode === "target") return targetPage(links, {
        revision: options.expectedRevision
      });
      const value = details.get(options.sourceId);
      if (!value) {
        return {
          ...sourcePage(source(), options),
          query: {
            sourceId: options.sourceId,
            targetKind: options.targetKind,
            targetId: options.targetId
          },
          items: []
        };
      }
      return sourcePage(value, options);
    },
    async mutateCourseSources(value) {
      onMutate(structuredClone(value));
      return changeResult(value.requestId, value.expectedCourseRevision);
    },
    async setCourseSourceFileAccess(value) {
      return onFileAccess(structuredClone(value));
    },
    async loadCourseAnchoredAnnotations(_courseId, options) {
      const page = annotationPage(options.expectedCourseRevision);
      page.query = structuredClone(options.query);
      return page;
    },
    async mutateCourseAnchoredAnnotations() {
      throw new Error("Mutação de Observação inesperada.");
    },
    async uploadCourseSourcePdf(value) {
      onUpload(value);
      return changeResult(value.requestId, value.expectedCourseRevision);
    },
    async getCourseSourceAttachmentDownload(value) {
      onDownload(structuredClone(value));
      return {
        signedUrl: "https://storage.example.test/object.pdf?token=sealed"
      };
    }
  };
}

function click(root, action, dataset = {}) {
  const node = {
    dataset: { sourceAction: action, ...dataset },
    closest(selector) {
      return selector === "[data-source-action]" ? this : null;
    }
  };
  root.listeners.get("click")({ target: node, preventDefault() {} });
}

function change(root, selector, values = {}) {
  const node = {
    ...values,
    matches(candidate) {
      return candidate === selector;
    }
  };
  root.listeners.get("change")({ target: node });
}

function form(kind, values) {
  const value = {
    elements: {},
    matches(selector) {
      return selector === `[data-source-form="${kind}"]`;
    }
  };
  value.elements = Object.fromEntries(Object.entries(values).map(([name, fieldValue]) => [
    name,
    { name, value: fieldValue, checked: fieldValue === true, form: value }
  ]));
  return value;
}

function submit(root, kind, values) {
  const value = form(kind, values);
  root.listeners.get("submit")({ target: value, preventDefault() {} });
  return value;
}

function sourceFormValues(overrides = {}) {
  return {
    sourceId: "source-new",
    kind: "book",
    role_assessment_evidence: true,
    role_technical_conceptual: false,
    citationMode: "manual",
    title: "Fonte atualizada",
    authors_0_format: "literal",
    authors_0_literal: "Autoria",
    publicationDate: "2026",
    identifier: "isbn:123",
    language: "pt-BR",
    citationText: "Autoria. Fonte atualizada. 2026.",
    url: "https://example.test/current",
    editionOrVersion: "2",
    origin: "author_provided",
    availability: "open_access",
    verificationStatus: "author_verified",
    studyVisibility: "citation_and_link",
    ...overrides
  };
}

test("mudar estilo após resposta perdida repete o mesmo pedido mesmo após atualizar o curso", async () => {
  const requests = [];
  const root = new FakeRoot();
  const controller = controllerFixture();
  controller.mutateCourseSources = async request => {
    requests.push(structuredClone(request));
    if (requests.length === 1) throw new TypeError("Failed to fetch");
    return { ...changeResult(request.requestId, 7), idempotent: true };
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID, courseRevision: 5 });
  await panel.open();
  submit(root, "bibliography-style", { bibliographyStyle: "apa7" });
  await settle();
  assert.equal(requests.length, 1);
  assert.equal(panel.hasPendingDraft(), true);
  await panel.refresh(7);
  click(root, "retry-command");
  await settle();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0]);
  assert.deepEqual(requests[1].command, { type: "set_bibliography_style", style: "apa7" });
  assert.equal(requests[1].expectedCourseRevision, 5);
  assert.equal(panel.hasPendingDraft(), false);
});

test("detalhe de fonte distingue seleção local de vínculo persistido sem contornar recusa", async () => {
  for (const [persisted, denied] of [[false, false], [true, false], [false, true]]) {
    const root = new FakeRoot();
    const reads = [];
    const link = { linkId: "link-a", sourceId: "source-01", relation: "supported_by", roles: [], anchors: [], occurrences: [] };
    const controller = controllerFixture({ links: persisted ? [link] : [], onRead: value => reads.push(value) });
    const load = controller.loadCourseSources;
    controller.loadCourseSources = async (courseId, options) => {
      const result = await load(courseId, options);
      if (options.mode === "source") {
        if (denied) throw Object.assign(new Error("Leitura não autorizada."), { status: 403 });
        if (!persisted && options.targetKind) result.items = [];
      }
      return result;
    };
    const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID, courseRevision: 5,
      mode: "target", targetKind: "plan_item", targetId: PLAN_ITEM_ID, targetVersion: 3 });
    await panel.open();
    if (!persisted) click(root, "add-target-source", { sourceId: "source-01" });
    await settle();
    click(root, "open-source", { sourceId: "source-01" });
    await settle();
    const sourceReads = reads.filter(value => value.mode === "source");
    assert.equal(sourceReads.length, 2);
    assert.ok(sourceReads.every(value => persisted ? value.targetId === PLAN_ITEM_ID : value.targetKind == null && value.targetId == null));
    if (denied) assert.match(root.innerHTML, /Você não tem permissão/u);
    else assert.match(root.innerHTML, /course-source-current-view/u);
    click(root, "close-detail");
    assert.equal(panel.hasPendingDraft(), !persisted);
    assert.match(root.innerHTML, /data-source-id="source-01"/u);
    panel.destroy();
  }
});

test("fontes da Explicação conservam trecho literal, versão da MS e retorno ao recorte", async () => {
  const root = new FakeRoot();
  const reads = [];
  const writes = [];
  const navigations = [];
  let closed = 0;
  let focused = false;
  const controller = controllerFixture({ onRead: value => reads.push(value), onMutate: value => writes.push(value) });
  const load = controller.loadCourseSources;
  controller.loadCourseSources = async (courseId, options) => {
    const result = await load(courseId, options);
    if (options.mode === "target") result.query = { sourceId: null,
      targetKind: "microsequence_explanation", targetId: "micro-a" };
    return result;
  };
  const text = "Uma ligação conecta A e B. Retirar a ligação impede essa interação.";
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID, courseRevision: 5,
    mode: "target", targetKind: "microsequence_explanation", targetId: "micro-a", targetVersion: 9,
    targetLabel: "Explicação · Ligações", targetExplanation: { title: "Ligações", content: [{ id: "p",
      package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } }] },
    onNavigate: (...args) => navigations.push(args), onClose: () => closed++,
    documentValue: { querySelectorAll: selector => selector === "[data-inspection-edit-explanation-sources]"
      ? [{ dataset: { microsequenceId: "micro-a" }, focus: () => { focused = true; } }] : [] }
  });
  await panel.open();
  click(root, "add-target-source", { sourceId: "source-01" });
  await settle();
  const linkId = root.innerHTML.match(/data-link-id="([^"]+)"/u)[1];
  click(root, "add-occurrence", { linkId });
  assert.ok(root.innerHTML.includes(text));
  assert.doesNotMatch(root.innerHTML, /Resposta ·|Retorno ·/u);
  const query = root.querySelector.bind(root);
  root.querySelector = selector => selector === "[data-source-occurrence-selection]"
    ? { selectionStart: 0, selectionEnd: 25 } : query(selector);
  click(root, "save-occurrence", { linkId });
  assert.match(root.innerHTML, /Trecho localizado/u);
  click(root, "open-source", { sourceId: "source-01" });
  await settle();
  assert.equal(navigations.length, 0);
  click(root, "close-detail");
  assert.match(root.innerHTML, /Fontes de Explicação/u);
  assert.ok(root.innerHTML.includes(text.slice(0, 25)));
  click(root, "save-target");
  await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].command.targetKind, "microsequence_explanation");
  assert.equal(writes[0].command.targetId, "micro-a");
  assert.equal(writes[0].command.expectedTargetVersion, 9);
  assert.equal(writes[0].command.sourceLinks[0].occurrences[0].quote, text.slice(0, 25));
  assert.equal(writes[0].command.sourceLinks[0].occurrences[0].slot, "content");
  assert.ok(reads.some(value => value.mode === "source" && value.targetKind == null));
  click(root, "close-target");
  await settle();
  assert.equal(closed, 1);
  assert.equal(focused, true);
  panel.destroy();
});

test("uma fonte admite usos independentes e remover um vínculo preserva o outro", async () => {
  const mutations = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({ root, controller: controllerFixture({ onMutate: request => mutations.push(request) }),
    courseId: COURSE_ID, courseRevision: 5, mode: "target", targetKind: "plan_item", targetId: PLAN_ITEM_ID, targetVersion: 3 });
  await panel.open();
  click(root, "add-target-source", { sourceId: "source-01" });
  await settle();
  click(root, "add-target-source", { sourceId: "source-01" });
  await settle();
  const identities = [...new Set([...root.innerHTML.matchAll(/data-link-id="([^"]+)"/gu)].map(match => match[1]))];
  assert.equal(identities.length, 2);
  change(root, "[data-source-target-relation]", { dataset: { linkId: identities[1] }, value: "contrasted_with" });
  change(root, "[data-source-target-role]", { dataset: { linkId: identities[1], sourceTargetRole: "assessment_evidence" }, checked: true });
  click(root, "remove-target-source", { linkId: identities[0] });
  click(root, "save-target");
  await settle();
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].command.sourceLinks, [{ linkId: identities[1], sourceId: "source-01",
    relation: "contrasted_with", roles: ["assessment_evidence", "technical_conceptual"], anchors: [], occurrences: [] }]);
});

test("confirmação de PDF perdido conserva arquivo, pedido e revisão após atualizar o catálogo", async () => {
  const requests = [];
  const root = new FakeRoot();
  const controller = controllerFixture();
  controller.uploadCourseSourcePdf = async request => {
    requests.push(request);
    if (requests.length === 1) throw new TypeError("Failed to fetch");
    return { ...changeResult(request.requestId, 7), idempotent: true };
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID, courseRevision: 5, initialSourceId: "source-01" });
  await panel.open();
  const file = new File(["%PDF-synthetic"], "local.pdf", { type: "application/pdf" });
  change(root, "[data-source-pdf-input]", { files: [file] });
  await settle();
  assert.equal(panel.hasPendingDraft(), true);
  await panel.refresh(7);
  click(root, "retry-attachment");
  await settle();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[1].file, file);
  assert.equal(requests[1].expectedCourseRevision, 5);
  assert.equal(panel.hasPendingDraft(), false);
});

function anchorFormValues(overrides = {}) {
  return {
    selectorKind: "page_range",
    startPage: "4",
    endPage: "5",
    startTime: "",
    endTime: "",
    fragment: "",
    exact: "",
    prefix: "",
    suffix: "",
    humanLocator: "Capítulo 1",
    verificationExcerpt: "Trecho conferido.",
    ...overrides
  };
}

function promiseGate() {
  let resolve;
  const promise = new Promise((release) => { resolve = release; });
  return { promise, resolve };
}

function enterAnchorDraft(root, overrides = {}) {
  const draft = form("anchor", anchorFormValues(overrides));
  change(root, "[data-source-anchor-kind]", draft.elements.selectorKind);
  return draft;
}

test("PDF pendente impede abertura e troca de editor até terminar a releitura", async () => {
  const root = new FakeRoot();
  const uploaded = promiseGate();
  const refreshed = promiseGate();
  const controller = controllerFixture({ catalog: [source(), source(2)] });
  let refreshStarted = false;
  const load = controller.loadCourseSources;
  controller.loadCourseSources = async (...args) => {
    if (args[1].expectedRevision === 6) {
      refreshStarted = true;
      await refreshed.promise;
    }
    return load(...args);
  };
  controller.uploadCourseSourcePdf = async request => {
    await uploaded.promise;
    return { ...changeResult(request.requestId, 6), changed: true,
      change: { type: "ingest_pdf", subjectId: request.sourceId, revision: request.sourceRevision } };
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
    courseRevision: 5, initialSourceId: "source-01" });
  try {
    await panel.open();
    change(root, "[data-source-pdf-input]", { files: [new File(["%PDF-synthetic"], "local.pdf")] });
    await settle();
    function assertBlocked() {
      for (const action of ["add-source", "open-source", "edit-source", "retire-source",
        "add-anchor", "edit-anchor", "retire-anchor"]) {
        assert.match(root.innerHTML, new RegExp(`data-source-action="${action}"[^>]* disabled`, "u"));
        const before = root.innerHTML;
        click(root, action, { sourceId: "source-02", sourceRevision: "1", anchorId: "anchor-a", anchorRevision: "1" });
        assert.equal(root.innerHTML, before, `${action} deve conservar o contexto ocupado`);
      }
      assert.doesNotMatch(root.innerHTML, /data-source-form="(?:source|anchor)"/u);
    }
    assertBlocked();
    uploaded.resolve();
    await settle();
    assert.equal(refreshStarted, true);
    assertBlocked();
    refreshed.resolve();
    await settle();
    assert.doesNotMatch(root.innerHTML, /data-source-action="add-anchor"[^>]* disabled/u);
    click(root, "add-anchor");
    assert.match(root.innerHTML, /data-source-form="anchor"/u);
  } finally {
    uploaded.resolve();
    refreshed.resolve();
    await settle();
    panel.destroy();
  }
});

test("PDF e releitura preservam rascunho, arquivo e CAS da âncora já aberta", async (t) => {
  for (const existing of [false, true]) await t.test(existing ? "editar âncora" : "nova âncora", async () => {
    const root = new FakeRoot();
    const uploaded = promiseGate();
    const catalogRead = promiseGate();
    const detailRead = promiseGate();
    const current = source(1, { attachments: [attachment()] });
    const controller = controllerFixture({ catalog: [current] });
    const writes = [];
    const uploads = [];
    let detailStarted = false;
    const load = controller.loadCourseSources;
    controller.loadCourseSources = async (...args) => {
      if (args[1].expectedRevision === 6) {
        if (args[1].mode === "catalog") await catalogRead.promise;
        if (args[1].mode === "source") {
          detailStarted = true;
          await detailRead.promise;
        }
      }
      return load(...args);
    };
    controller.uploadCourseSourcePdf = async request => {
      uploads.push(request);
      current.attachments.push(attachment({ contentHash: "b".repeat(64) }));
      await uploaded.promise;
      return { ...changeResult(request.requestId, 6), changed: true,
        change: { type: "ingest_pdf", subjectId: request.sourceId, revision: request.sourceRevision } };
    };
    controller.mutateCourseSources = async request => {
      writes.push(request);
      return { ...changeResult(request.requestId, 7), changed: true,
        change: { type: "save_anchor", subjectId: request.command.anchorId, revision: existing ? 2 : 1 } };
    };
    const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
      courseRevision: 5, initialSourceId: current.sourceId, initialAnchorId: "anchor-a" });
    try {
      await panel.open();
      click(root, existing ? "edit-anchor" : "add-anchor", { anchorId: "anchor-a", sourceRevision: "1" });
      enterAnchorDraft(root, { contentHash: HASH, humanLocator: "Rascunho anterior ao PDF" });
      const file = new File(["%PDF-synthetic"], "local.pdf", { type: "application/pdf" });
      change(root, "[data-source-pdf-input]", { files: [file] });
      await settle();
      const finalDraft = anchorFormValues({ contentHash: HASH, humanLocator: "Rascunho editado durante o PDF" });
      enterAnchorDraft(root, finalDraft);
      function assertDraft() {
        assert.match(root.innerHTML, /data-source-form="anchor"/u);
        assert.match(root.innerHTML, /value="Rascunho editado durante o PDF"/u);
        assert.match(root.innerHTML, new RegExp(`<option value="${HASH}" selected`, "u"));
        assert.match(root.innerHTML, /name="startPage"[^>]*value="4"/u);
        assert.equal(panel.hasPendingDraft(), true);
        assert.equal(writes.length, 0);
      }
      assertDraft();
      uploaded.resolve();
      await settle();
      assertDraft();
      catalogRead.resolve();
      await settle();
      assert.equal(detailStarted, true);
      assertDraft();
      detailRead.resolve();
      await settle();
      assertDraft();
      assert.match(root.innerHTML, new RegExp(`<option value="${"b".repeat(64)}"`, "u"));
      assert.equal(uploads.length, 1);
      assert.equal(uploads[0].file, file);
      root.focusedSelectors.length = 0;
      await panel.refresh(6);
      await settle();
      assertDraft();
      assert.equal(root.focusedSelectors.includes("[data-source-deep-linked-anchor]"), false);
      submit(root, "anchor", finalDraft);
      await settle();
      assert.equal(writes.length, 1);
      assert.equal(writes[0].expectedCourseRevision, 6);
      assert.equal(writes[0].command.sourceId, current.sourceId);
      assert.equal(writes[0].command.sourceRevision, 1);
      assert.equal(writes[0].command.expectedAnchorRevision, existing ? 1 : 0);
      assert.equal(writes[0].command.contentHash, HASH);
      assert.equal(writes[0].command.humanLocator, finalDraft.humanLocator);
      assert.doesNotMatch(root.innerHTML, /data-source-form="anchor"/u);
      assert.equal(panel.hasPendingDraft(), false);
    } finally {
      uploaded.resolve();
      catalogRead.resolve();
      detailRead.resolve();
      await settle();
      panel.destroy();
    }
  });
});

test("confirmação idempotente e falha da releitura do PDF mantêm a edição e o mesmo pedido", async () => {
  const root = new FakeRoot();
  const current = source(1, { attachments: [attachment()] });
  const controller = controllerFixture({ catalog: [current] });
  const requests = [];
  let failRead = false;
  const load = controller.loadCourseSources;
  controller.loadCourseSources = async (...args) => {
    if (failRead && args[1].expectedRevision === 6) throw new TypeError("Failed to fetch");
    return load(...args);
  };
  controller.uploadCourseSourcePdf = async request => {
    requests.push(request);
    if (requests.length === 1) throw new TypeError("Failed to fetch");
    failRead = true;
    return { ...changeResult(request.requestId, 6), idempotent: true, changed: true,
      change: { type: "ingest_pdf", subjectId: request.sourceId, revision: request.sourceRevision } };
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
    courseRevision: 5, initialSourceId: current.sourceId });
  await panel.open();
  click(root, "edit-anchor", { anchorId: "anchor-a", sourceRevision: "1" });
  enterAnchorDraft(root, { humanLocator: "Conservar após confirmação", contentHash: HASH });
  const file = new File(["%PDF-synthetic"], "local.pdf", { type: "application/pdf" });
  change(root, "[data-source-pdf-input]", { files: [file] });
  await settle();
  click(root, "retry-attachment");
  await settle();
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(requests[1].file, file);
  assert.match(root.innerHTML, /confirmada, mas a lista está desatualizada/u);
  assert.match(root.innerHTML, /value="Conservar após confirmação"/u);
  assert.equal(panel.hasPendingDraft(), true);
  failRead = false;
  click(root, "retry-detail");
  await settle();
  assert.match(root.innerHTML, /value="Conservar após confirmação"/u);
  assert.equal(requests.length, 2);
  panel.destroy();
});

test("permissão e remoção de PDF preservam a âncora independente em edição", async (t) => {
  for (const operation of ["access", "remove"]) await t.test(operation, async () => {
    const root = new FakeRoot();
    const current = source(1, { attachments: [attachment()] });
    const controller = controllerFixture({ catalog: [current] });
    const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
      courseRevision: 5, initialSourceId: current.sourceId });
    await panel.open();
    click(root, "edit-anchor", { anchorId: "anchor-a", sourceRevision: "1" });
    enterAnchorDraft(root, { contentHash: HASH, humanLocator: "Edição independente" });
    if (operation === "access") {
      submit(root, "file-access", { sourceId: current.sourceId, contentHash: HASH, publicFileAccess: "restricted" });
      click(root, "confirm-file-access");
    } else {
      click(root, "remove-attachment", { sourceRevision: "1", contentHash: HASH });
      click(root, "confirm-retirement");
    }
    await settle();
    assert.match(root.innerHTML, /data-source-form="anchor"/u);
    assert.match(root.innerHTML, /value="Edição independente"/u);
    assert.match(root.innerHTML, new RegExp(`<option value="${HASH}" selected`, "u"));
    assert.equal(panel.hasPendingDraft(), true);
    panel.destroy();
  });
});

test("PDF conserva edição e vínculos ainda não salvos no alvo contextual", async () => {
  const root = new FakeRoot();
  const writes = [];
  const controller = controllerFixture({ onMutate: request => writes.push(request) });
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
    courseRevision: 5, mode: "target", targetKind: "plan_item", targetId: PLAN_ITEM_ID, targetVersion: 3 });
  await panel.open();
  click(root, "add-target-source", { sourceId: "source-01" });
  await settle();
  click(root, "open-source", { sourceId: "source-01" });
  await settle();
  click(root, "add-anchor");
  enterAnchorDraft(root, { humanLocator: "Rascunho no alvo" });
  change(root, "[data-source-pdf-input]", { files: [new File(["%PDF-synthetic"], "local.pdf")] });
  await settle();
  assert.match(root.innerHTML, /value="Rascunho no alvo"/u);
  assert.equal(writes.length, 0);
  click(root, "cancel-anchor-form");
  click(root, "close-detail");
  click(root, "save-target");
  await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].command.type, "set_target_sources");
  assert.equal(writes[0].command.targetId, PLAN_ITEM_ID);
  assert.equal(writes[0].command.sourceLinks.length, 1);
  assert.equal(writes[0].command.sourceLinks[0].sourceId, "source-01");
  panel.destroy();
});

test("adicionar vínculo aguarda a atribuição inicial e a recuperação de falha", async (t) => {
  for (const failFirst of [false, true]) await t.test(failFirst ? "leitura falha" : "leitura atrasada", async () => {
    const root = new FakeRoot();
    const targetRead = promiseGate();
    const controller = controllerFixture();
    const load = controller.loadCourseSources;
    let reads = 0;
    controller.loadCourseSources = async (...args) => {
      if (args[1].mode === "target" && ++reads === 1) {
        await targetRead.promise;
        if (failFirst) throw new TypeError("Failed to fetch");
      }
      return load(...args);
    };
    const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
      courseRevision: 5, mode: "target", targetKind: "plan_item", targetId: PLAN_ITEM_ID, targetVersion: 3 });
    const opening = panel.open();
    try {
      await settle();
      function assertUnavailable() {
        assert.match(root.innerHTML, /data-source-action="add-target-source"[^>]* disabled/u);
        click(root, "add-target-source", { sourceId: "source-01" });
        assert.equal(panel.hasPendingDraft(), false);
        assert.doesNotMatch(root.innerHTML, /class="course-source-card is-selected"/u);
      }
      assertUnavailable();
      targetRead.resolve();
      await opening;
      await settle();
      if (failFirst) {
        assertUnavailable();
        click(root, "retry-target");
        await settle();
      }
      assert.doesNotMatch(root.innerHTML, /data-source-action="add-target-source"[^>]* disabled/u);
      click(root, "add-target-source", { sourceId: "source-01" });
      await settle();
      assert.match(root.innerHTML, /class="course-source-target-link"/u);
      assert.equal(panel.hasPendingDraft(), true);
    } finally {
      targetRead.resolve();
      await opening;
      panel.destroy();
    }
  });
});

test("releitura do alvo conserva edições e remoções feitas enquanto a resposta está pendente", async () => {
  const root = new FakeRoot();
  const targetRead = promiseGate();
  const links = [1, 2, 3].map(index => ({ linkId: `link-${index}`, sourceId: "source-01",
    relation: "supported_by", roles: ["technical_conceptual"], anchors: [], occurrences: [] }));
  const writes = [];
  const controller = controllerFixture({ links, onMutate: request => {
    writes.push(request);
    links.splice(0, links.length, ...structuredClone(request.command.sourceLinks));
  } });
  const load = controller.loadCourseSources;
  let targetReads = 0;
  controller.loadCourseSources = async (...args) => {
    if (args[1].mode === "target") {
      targetReads++;
      if (targetReads === 2) throw new TypeError("Failed to fetch");
      if (targetReads === 3) await targetRead.promise;
    }
    return load(...args);
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
    courseRevision: 5, mode: "target", targetKind: "plan_item", targetId: PLAN_ITEM_ID, targetVersion: 3 });
  try {
    await panel.open();
    await settle();
    click(root, "open-source", { sourceId: "source-01" });
    await settle();
    change(root, "[data-source-pdf-input]", { files: [new File(["%PDF-synthetic"], "local.pdf")] });
    await settle();
    click(root, "close-detail");
    assert.match(root.innerHTML, /data-source-action="retry-target"/u);
    click(root, "retry-target");
    await settle();
    assert.equal(targetReads, 3);
    assert.match(root.innerHTML, /class="course-source-target-link"/u);
    assert.match(root.innerHTML, /data-source-action="add-target-source"[^>]* disabled/u);
    assert.match(root.innerHTML, /data-source-action="save-target"[^>]* disabled/u);
    change(root, "[data-source-target-relation]", { dataset: { linkId: "link-1" }, value: "contrasted_with" });
    change(root, "[data-source-target-role]", { dataset: { linkId: "link-1", sourceTargetRole: "assessment_evidence" }, checked: true });
    change(root, "[data-source-target-anchor]", { dataset: { linkId: "link-1", anchorId: "anchor-a" }, checked: true });
    click(root, "move-target-source-up", { linkId: "link-3" });
    click(root, "move-target-source-up", { linkId: "link-3" });
    click(root, "remove-target-source", { linkId: "link-2" });
    click(root, "save-target");
    assert.equal(writes.length, 0);
    targetRead.resolve();
    await settle();
    assert.equal(panel.hasPendingDraft(), true);
    click(root, "save-target");
    await settle();
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].command.sourceLinks.map(link => link.linkId), ["link-3", "link-1"]);
    assert.deepEqual(writes[0].command.sourceLinks[1], {
      linkId: "link-1", sourceId: "source-01", relation: "contrasted_with",
      roles: ["assessment_evidence", "technical_conceptual"], anchors: [{ anchorId: "anchor-a" }], occurrences: []
    });
    assert.equal(panel.hasPendingDraft(), false);
  } finally {
    targetRead.resolve();
    await settle();
    panel.destroy();
  }
});

test("confirmação dos vínculos não declara salvo um rascunho alterado durante a escrita", async () => {
  const root = new FakeRoot();
  const committed = promiseGate();
  const links = [1, 2].map(index => ({ linkId: `link-${index}`, sourceId: "source-01",
    relation: "supported_by", roles: ["technical_conceptual"], anchors: [], occurrences: [] }));
  const writes = [];
  let saved = 0;
  const controller = controllerFixture({ links });
  controller.mutateCourseSources = async request => {
    writes.push(structuredClone(request));
    await committed.promise;
    links.splice(0, links.length, ...structuredClone(request.command.sourceLinks));
    return changeResult(request.requestId, request.expectedCourseRevision);
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
    courseRevision: 5, mode: "target", targetKind: "plan_item", targetId: PLAN_ITEM_ID, targetVersion: 3,
    onTargetSaved: () => { saved++; panel.destroy(); } });
  try {
    await panel.open();
    await settle();
    change(root, "[data-source-target-relation]", { dataset: { linkId: "link-1" }, value: "contrasted_with" });
    click(root, "save-target");
    await settle();
    assert.equal(writes.length, 1);
    change(root, "[data-source-target-relation]", { dataset: { linkId: "link-1" }, value: "supported_by" });
    click(root, "remove-target-source", { linkId: "link-2" });
    committed.resolve();
    await settle();
    assert.equal(panel.hasPendingDraft(), true);
    assert.equal(writes.length, 1);
    assert.equal(saved, 0);
    assert.match(root.innerHTML, /data-source-target-dialog/u);
    click(root, "save-target");
    await settle();
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1].command.sourceLinks, [{
      linkId: "link-1", sourceId: "source-01", relation: "supported_by",
      roles: ["technical_conceptual"], anchors: [], occurrences: []
    }]);
    assert.equal(panel.hasPendingDraft(), false);
    assert.equal(saved, 1);
    assert.equal(root.innerHTML, "");
  } finally {
    committed.resolve();
    await settle();
    panel.destroy();
  }
});

test("salvar a referência encerra seu editor e conserva a âncora ainda não salva", async () => {
  const root = new FakeRoot();
  const writes = [];
  const panel = createCourseSourcesPanel({ root, controller: controllerFixture({
    onMutate: request => writes.push(request)
  }), courseId: COURSE_ID, courseRevision: 5, initialSourceId: "source-01" });
  await panel.open();
  click(root, "edit-anchor", { anchorId: "anchor-a", sourceRevision: "1" });
  const draft = anchorFormValues({ humanLocator: "Âncora independente da referência" });
  enterAnchorDraft(root, draft);
  click(root, "edit-source");
  submit(root, "source", sourceFormValues({ sourceId: "source-01" }));
  await settle();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].command.type, "save_source");
  assert.doesNotMatch(root.innerHTML, /data-source-form="source"/u);
  assert.match(root.innerHTML, /value="Âncora independente da referência"/u);
  assert.equal(panel.hasPendingDraft(), true);
  submit(root, "anchor", draft);
  await settle();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].command.type, "save_anchor");
  assert.equal(writes[1].command.expectedAnchorRevision, 1);
  assert.doesNotMatch(root.innerHTML, /data-source-form="anchor"/u);
  assert.equal(panel.hasPendingDraft(), false);
  panel.destroy();
});

test("edição posterior ao envio da fonte ou âncora permanece com sua revisão original", async (t) => {
  for (const kind of ["source", "anchor"]) for (const uncertain of [false, true]) {
    await t.test(`${kind}: ${uncertain ? "retorno perdido e reconciliação" : "confirmação direta"}`, async () => {
      const root = new FakeRoot();
      const committed = promiseGate();
      const current = source(1, { anchors: [anchor()] });
      const requests = [];
      const controller = controllerFixture({ catalog: [current] });
      controller.mutateCourseSources = async request => {
        requests.push(structuredClone(request));
        if (requests.length === 1) {
          await committed.promise;
          if (kind === "source") Object.assign(current, request.command.source, { revision: 2 });
          else current.anchors[0].revision = 2;
          if (uncertain) throw new TypeError("Failed to fetch");
        } else if (!uncertain || requests.length !== 2 || request.requestId !== requests[0].requestId) {
          throw Object.assign(new Error("conflict"), { status: 409 });
        }
        return { ...changeResult(request.requestId, 6), changed: true, idempotent: requests.length > 1,
          change: { type: `save_${kind}`, subjectId: kind === "source" ? current.sourceId : "anchor-a", revision: 2 } };
      };
      const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID,
        courseRevision: 5, initialSourceId: current.sourceId });
      try {
        await panel.open();
        click(root, `edit-${kind}`, { anchorId: "anchor-a", sourceRevision: "1" });
        const sent = kind === "source" ? sourceFormValues({ sourceId: current.sourceId, title: "Texto enviado" })
          : anchorFormValues({ humanLocator: "Texto enviado" });
        submit(root, kind, sent);
        await settle();
        const later = kind === "source" ? { ...sent, title: "Texto posterior ao envio" }
          : { ...sent, humanLocator: "Texto posterior ao envio" };
        const changed = form(kind, later);
        root.listeners.get("input")({ target: changed.elements[kind === "source" ? "title" : "humanLocator"] });
        committed.resolve();
        await settle();
        if (uncertain) {
          click(root, "retry-command");
          await settle();
          assert.deepEqual(requests[1], requests[0]);
        }
        assert.match(root.innerHTML, new RegExp(`data-source-form="${kind}"`, "u"));
        assert.match(root.innerHTML, /value="Texto posterior ao envio"/u);
        assert.equal(panel.hasPendingDraft(), true);
        const confirmedCount = requests.length;
        submit(root, kind, later);
        await settle();
        assert.equal(requests.length, confirmedCount + 1);
        assert.equal(requests.at(-1).command[kind === "source" ? "expectedSourceRevision" : "expectedAnchorRevision"], 1);
        assert.match(root.innerHTML, /O curso mudou/u);
        assert.match(root.innerHTML, /value="Texto posterior ao envio"/u);
        assert.equal(panel.hasPendingDraft(), true);
      } finally {
        committed.resolve();
        await settle();
        panel.destroy();
      }
    });
  }
});

test("confirmação dos vínculos não fecha uma seleção de trecho iniciada durante a escrita", async () => {
  const root = new FakeRoot();
  const committed = promiseGate();
  const link = { linkId: "link-1", sourceId: "source-01", relation: "supported_by",
    roles: ["technical_conceptual"], anchors: [], occurrences: [] };
  const controller = controllerFixture({ links: [link] });
  const load = controller.loadCourseSources;
  controller.loadCourseSources = async (...args) => {
    const page = await load(...args);
    if (args[1].mode === "target") page.query = { sourceId: null, targetKind: "microsequence_explanation", targetId: "micro-a" };
    return page;
  };
  controller.mutateCourseSources = async request => {
    await committed.promise;
    return changeResult(request.requestId, request.expectedCourseRevision);
  };
  let saved = 0;
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID, courseRevision: 5,
    mode: "target", targetKind: "microsequence_explanation", targetId: "micro-a", targetVersion: 3,
    targetExplanation: { title: "Ligações", content: [{ id: "p", package: "aralearn.resource.paragraph",
      version: "1.0.0", data: { text: "Uma ligação conecta A e B." } }] },
    onTargetSaved: () => { saved++; panel.destroy(); } });
  try {
    await panel.open();
    await settle();
    click(root, "save-target");
    await settle();
    click(root, "add-occurrence", { linkId: link.linkId });
    assert.match(root.innerHTML, /data-source-occurrence-selection/u);
    committed.resolve();
    await settle();
    assert.equal(saved, 0);
    assert.match(root.innerHTML, /data-source-occurrence-selection/u);
    click(root, "cancel-occurrence");
    click(root, "save-target");
    await settle();
    assert.equal(saved, 1);
    assert.equal(root.innerHTML, "");
  } finally {
    committed.resolve();
    await settle();
    panel.destroy();
  }
});

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("acesso público de fonte e de cada PDF fica em ajustes e depende de confirmação", async () => {
  const root = new FakeRoot();
  const calls = [];
  const item = source(1, { publicFileAccess: "restricted", attachments: [attachment({ publicFileAccess: "available" }), attachment({ contentHash: "b".repeat(64) })] });
  const panel = createCourseSourcesPanel({ root, controller: controllerFixture({ catalog: [item],
    onFileAccess: (request) => { calls.push(request); return fileAccessReceipt(request); } }),
    courseId: COURSE_ID, courseRevision: 5, coursePublicFileAccess: "available", initialSourceId: item.sourceId });
  await panel.open();
  assert.match(root.innerHTML, /<details class="course-source-file-access">/u);
  assert.match(root.innerHTML, /exceção no PDF prevalece sobre a fonte e o curso/u);
  assert.equal((root.innerHTML.match(/data-source-form="file-access"/gu) || []).length, 3);
  assert.match(root.innerHTML, /Herdar da fonte · restringir/u);
  assert.match(root.innerHTML, /Disponível no curso público/u);
  submit(root, "file-access", { sourceId: item.sourceId, contentHash: "", publicFileAccess: "available" });
  assert.equal(calls.length, 0);
  assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.match(root.innerHTML, /Confirme que você pode disponibilizá-lo/u);
  click(root, "cancel-confirmation");
  assert.equal(calls.length, 0);
  submit(root, "file-access", { sourceId: item.sourceId, contentHash: "", publicFileAccess: "available" });
  click(root, "confirm-file-access");
  await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual({ ...calls[0], requestId: "request" }, { courseId: COURSE_ID, expectedRevision: 5,
    sourceId: item.sourceId, sourceRevision: 1, contentHash: null, publicFileAccess: "available", requestId: "request" });
  submit(root, "file-access", { sourceId: item.sourceId, contentHash: HASH, publicFileAccess: "inherit" });
  click(root, "confirm-file-access");
  await settle();
  assert.equal(calls[1].contentHash, HASH);
  assert.equal(calls[1].publicFileAccess, "inherit");
  assert.equal(calls[1].expectedRevision, 6);
  assert.notEqual(calls[1].requestId, calls[0].requestId);
});

test("permissão incerta conserva a mesma revisão e o mesmo pedido, impedindo troca silenciosa", async () => {
  const root = new FakeRoot();
  const calls = [];
  const writes = [];
  const item = source(1, { attachments: [attachment()] });
  const panel = createCourseSourcesPanel({ root, controller: controllerFixture({ catalog: [item], onMutate: (request) => writes.push(request),
    onFileAccess: (request) => {
      calls.push(request);
      if (calls.length === 1) throw new TypeError("Failed to fetch");
      return fileAccessReceipt(request, { idempotent: true });
    } }), courseId: COURSE_ID, courseRevision: 5, initialSourceId: item.sourceId });
  await panel.open();
  submit(root, "file-access", { sourceId: item.sourceId, contentHash: HASH, publicFileAccess: "available" });
  click(root, "confirm-file-access");
  await settle();
  assert.equal(panel.hasPendingDraft(), true);
  assert.match(root.innerHTML, /Confirmar a mesma permissão/u);
  submit(root, "file-access", { sourceId: item.sourceId, contentHash: HASH, publicFileAccess: "restricted" });
  submit(root, "source", sourceFormValues());
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(writes.length, 0);
  await panel.refresh(8);
  click(root, "retry-file-access");
  await settle();
  assert.deepEqual(calls[1], calls[0]);
  assert.match(root.innerHTML, /operação já estava confirmada/u);
  assert.equal(panel.hasPendingDraft(), false);
});

test("recibo incompatível mantém a permissão pendente para consultar o mesmo pedido", async () => {
  const root = new FakeRoot();
  const calls = [];
  const panel = createCourseSourcesPanel({ root, controller: controllerFixture({
    onFileAccess: (request) => { calls.push(request); return fileAccessReceipt(request, { contentHash: HASH }); }
  }), courseId: COURSE_ID, courseRevision: 5, initialSourceId: source().sourceId });
  await panel.open();
  submit(root, "file-access", { sourceId: source().sourceId, contentHash: "", publicFileAccess: "available" });
  click(root, "confirm-file-access");
  await settle();
  assert.equal(panel.hasPendingDraft(), true);
  assert.match(root.innerHTML, /confirmação da permissão não chegou/u);
  click(root, "retry-file-access");
  await settle();
  assert.deepEqual(calls[1], calls[0]);
});

test("conflito conserva a escolha e só permite nova confirmação após atualizar as revisões", async () => {
  const root = new FakeRoot();
  const calls = [];
  const item = source();
  const details = new Map([[item.sourceId, item]]);
  const panel = createCourseSourcesPanel({ root, controller: controllerFixture({ details,
    onFileAccess: (request) => {
      calls.push(request);
      if (calls.length === 1) throw Object.assign(new Error("conflict"), { status: 409, code: "course_revision_changed" });
      return fileAccessReceipt(request);
    } }), courseId: COURSE_ID, courseRevision: 5, initialSourceId: item.sourceId });
  await panel.open();
  const values = { sourceId: item.sourceId, contentHash: "", publicFileAccess: "available" };
  submit(root, "file-access", values);
  click(root, "confirm-file-access");
  await settle();
  assert.match(root.innerHTML, /O curso mudou/u);
  assert.match(root.innerHTML, /value="available" selected/u);
  assert.doesNotMatch(root.innerHTML, /data-source-action="retry-file-access"/u);
  submit(root, "file-access", values);
  click(root, "confirm-file-access");
  await settle();
  assert.equal(calls.length, 1);
  details.set(item.sourceId, { ...item, revision: 2 });
  await panel.refresh(7, "restricted");
  submit(root, "file-access", values);
  assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.equal(calls.length, 1);
  click(root, "confirm-file-access");
  await settle();
  assert.equal(calls[1].expectedRevision, 7);
  assert.equal(calls[1].sourceRevision, 2);
  assert.notEqual(calls[0].requestId, calls[1].requestId);
});

test("falha de contrato das fontes permanece no nível humano da operação", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture();
  controller.loadCourseSources = async () => ({});
  const panel = createCourseSourcesPanel({
    root,
    controller,
    courseId: COURSE_ID,
    courseRevision: 5
  });

  assert.equal(await panel.open(), false);
  assert.match(root.innerHTML, /Não foi possível carregar as fontes\./u);
  assert.doesNotMatch(root.innerHTML, /contract|courseRevision|requestId|UUID|cursor/iu);
});

test("catálogo e detalhe mostram somente Fonte, Âncoras e PDF correntes", async () => {
  const current = source(1, { attachments: [attachment()] });
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture({ catalog: [current] }),
    courseId: COURSE_ID,
    courseRevision: 5
  });

  assert.equal(await panel.open(), true);
  click(root, "open-source", { sourceId: current.sourceId });
  await settle();

  assert.match(root.innerHTML, /course-source-current/u);
  assert.match(root.innerHTML, /Fonte 1/u);
  assert.match(root.innerHTML, /Capítulo 2/u);
  assert.match(root.innerHTML, /PDF disponível/u);
  assert.match(root.innerHTML, /Papéis sugeridos.*Sustentação do conteúdo/u);
  assert.doesNotMatch(root.innerHTML,
    /course-source-revisions|Revisão anterior|Histórico|actorId|targetHash|legacy/iu);
});

test("resumo do catálogo flexiona fonte no singular", async () => {
  const singularRoot = new FakeRoot();
  const singular = createCourseSourcesPanel({
    root: singularRoot,
    controller: controllerFixture({ catalog: [source()] }),
    courseId: COURSE_ID,
    courseRevision: 5
  });
  assert.equal(await singular.open(), true);
  assert.match(singularRoot.innerHTML, />1 fonte</u);
  assert.doesNotMatch(singularRoot.innerHTML, />1 fontes/u);

  const pluralRoot = new FakeRoot();
  const pluralPanel = createCourseSourcesPanel({
    root: pluralRoot,
    controller: controllerFixture({ catalog: [source(1), source(2)] }),
    courseId: COURSE_ID,
    courseRevision: 5
  });
  assert.equal(await pluralPanel.open(), true);
  assert.match(pluralRoot.innerHTML, />2 fontes</u);

  const pagedRoot = new FakeRoot();
  const pagedController = controllerFixture();
  pagedController.loadCourseSources = async () => catalogPage([source()], {
    nextCursor: "cGFnZS0x"
  });
  const pagedPanel = createCourseSourcesPanel({
    root: pagedRoot,
    controller: pagedController,
    courseId: COURSE_ID,
    courseRevision: 5
  });
  assert.equal(await pagedPanel.open(), true);
  assert.match(pagedRoot.innerHTML, />1\+ fontes</u);
});

test("catálogo mantém paginação apenas entre Fontes correntes", async () => {
  const all = Array.from({ length: 15 }, (_, index) => source(index + 1));
  const calls = [];
  const root = new FakeRoot();
  const controller = controllerFixture({ catalog: all.slice(0, 10) });
  controller.loadCourseSources = async (_courseId, options) => {
    calls.push(structuredClone(options));
    const offset = options.cursor ? 10 : 0;
    return catalogPage(all.slice(offset, offset + 10), {
      nextCursor: offset === 0 ? "cGFnZS0xMA==" : null
    });
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID, courseRevision: 5 });

  await panel.open();
  click(root, "load-more-sources");
  await settle();

  assert.match(root.innerHTML, /data-source-count="15"/u);
  assert.deepEqual(calls.map(({ mode, limit, cursor }) => ({ mode, limit, cursor })), [
    { mode: "catalog", limit: 10, cursor: null },
    { mode: "catalog", limit: 10, cursor: "cGFnZS0xMA==" }
  ]);
});

test("deep link encontra somente a Fonte e a Âncora correntes", async () => {
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture(),
    courseId: COURSE_ID,
    courseRevision: 5,
    initialSourceId: "source-01",
    initialAnchorId: "anchor-a"
  });

  assert.equal(await panel.open(), true);
  assert.match(root.innerHTML, /data-source-deep-linked-anchor/u);
  assert.doesNotMatch(root.innerHTML, /Carregar revisões|histórico/iu);
  assert.throws(() => createCourseSourcesPanel({
    root: new FakeRoot(),
    controller: controllerFixture(),
    courseId: COURSE_ID,
    courseRevision: 5,
    initialSourceId: "x".repeat(241)
  }), /endereço da fonte é inválido/u);
});

test("edição de Fonte usa revisão somente como cerca interna", async () => {
  const commands = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture({ onMutate: (value) => commands.push(value) }),
    courseId: COURSE_ID,
    courseRevision: 5
  });

  await panel.open();
  click(root, "open-source", { sourceId: "source-01" });
  await settle();
  click(root, "edit-source");
  assert.match(root.innerHTML, /Editar referência/u);
  assert.doesNotMatch(root.innerHTML, /Nova revisão/u);
  submit(root, "source", sourceFormValues({ sourceId: "source-01" }));
  await settle();

  assert.equal(commands.length, 1);
  assert.equal(commands[0].command.type, "save_source");
  assert.equal(commands[0].command.sourceId, "source-01");
  assert.equal(commands[0].command.expectedSourceRevision, 1);
  assert.deepEqual(commands[0].command.source.defaultRoles, ["assessment_evidence"]);
  assert.equal(Object.hasOwn(commands[0].command.source, "actorId"), false);
});

test("falha ao salvar fonte orienta a ação sem revelar transporte ou versão", async (t) => {
  async function renderFailure(error) {
    const root = new FakeRoot();
    const controller = controllerFixture();
    controller.mutateCourseSources = async () => { throw error; };
    const panel = createCourseSourcesPanel({
      root,
      controller,
      courseId: COURSE_ID,
      courseRevision: 5
    });
    await panel.open();
    click(root, "open-source", { sourceId: "source-01" });
    await settle();
    click(root, "edit-source");
    submit(root, "source", sourceFormValues({ sourceId: "source-01" }));
    await settle();
    return root.innerHTML;
  }

  await t.test("sem conexão", async () => {
    const html = await renderFailure(new TypeError("Failed to fetch"));
    assert.match(html, /Sem conexão para salvar a fonte\./u);
    assert.doesNotMatch(html, /Failed to fetch|Supabase respondeu com HTTP/iu);
  });

  await t.test("conflito", async () => {
    const error = Object.assign(new Error("CourseVersion is invalid"), { status: 409 });
    const html = await renderFailure(error);
    assert.match(html, /O curso mudou\. Recarregue as fontes antes de salvar\./u);
    assert.doesNotMatch(html, /CourseVersion is invalid|>409</iu);
  });
});

test("edição de Âncora preserva CAS interno sem oferecer história", async () => {
  const commands = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture({ onMutate: (value) => commands.push(value) }),
    courseId: COURSE_ID,
    courseRevision: 5
  });

  await panel.open();
  click(root, "open-source", { sourceId: "source-01" });
  await settle();
  click(root, "edit-anchor", { anchorId: "anchor-a", sourceRevision: "1" });
  assert.match(root.innerHTML, /Editar âncora/u);
  submit(root, "anchor", anchorFormValues());
  await settle();

  assert.equal(commands.length, 1);
  assert.deepEqual({
    type: commands[0].command.type,
    sourceId: commands[0].command.sourceId,
    sourceRevision: commands[0].command.sourceRevision,
    expectedAnchorRevision: commands[0].command.expectedAnchorRevision
  }, {
    type: "save_anchor",
    sourceId: "source-01",
    sourceRevision: 1,
    expectedAnchorRevision: 1
  });
});

test("voltar da fonte aguarda a releitura após confirmar a gravação", async () => {
  const root = new FakeRoot();
  let refreshing = false;
  let releaseRead;
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  const controller = controllerFixture({ onMutate: () => { refreshing = true; } });
  const load = controller.loadCourseSources;
  controller.loadCourseSources = async (...args) => {
    if (refreshing) await readGate;
    return load(...args);
  };
  const panel = createCourseSourcesPanel({ root, controller, courseId: COURSE_ID, courseRevision: 5 });
  await panel.open();
  click(root, "open-source", { sourceId: "source-01" });
  await settle();
  click(root, "edit-anchor", { anchorId: "anchor-a", sourceRevision: "1" });
  submit(root, "anchor", anchorFormValues());
  await settle();
  assert.doesNotMatch(root.innerHTML, /data-source-form="anchor"/u);
  assert.match(root.innerHTML, /data-source-action="close-detail"[^>]* disabled/u);
  click(root, "close-detail");
  assert.match(root.innerHTML, /data-source-detail-dialog/u);
  releaseRead();
  await settle();
  assert.doesNotMatch(root.innerHTML, /data-source-action="close-detail"[^>]* disabled/u);
  click(root, "close-detail");
  assert.doesNotMatch(root.innerHTML, /data-source-detail-dialog/u);
  panel.destroy();
});

test("atribuição lê uma Fonte corrente uma vez e salva o conjunto completo", async () => {
  const reads = [];
  const mutations = [];
  const links = [{
    sourceId: "source-01",
    linkId: "link-fixture", roles: ["technical_conceptual"], occurrences: [],
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a" }]
  }];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture({
      links,
      onRead: (value) => reads.push(value),
      onMutate: (value) => mutations.push(value)
    }),
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    targetLabel: "Explicar a relação"
  });

  assert.equal(await panel.open(), true);
  await settle();
  assert.equal(reads.filter(({ mode }) => mode === "source").length, 1);
  assert.match(root.innerHTML, /Fonte corrente/u);
  click(root, "save-target");
  await settle();

  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].command.sourceLinks, links);
  assert.equal(Object.hasOwn(mutations[0].command, "targetHash"), false);
});

test("referência à obra inteira dispensa localizador, mas citação direta exige um", async () => {
  const current = source(1, { anchorCount: 0, anchors: [] });
  const mutations = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture({
      catalog: [current],
      details: new Map([[current.sourceId, current]]),
      links: null,
      onMutate: (value) => mutations.push(value)
    }),
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3
  });

  await panel.open();
  assert.match(root.innerHTML, /Fontes deste item/u);
  click(root, "add-target-source", { sourceId: current.sourceId });
  await settle();
  const linkId = root.innerHTML.match(/data-link-id="([^"]+)"/u)[1];
  change(root, "[data-source-target-relation]", { dataset: { linkId }, value: "quoted_from" });
  click(root, "save-target");
  await settle();
  assert.equal(mutations.length, 0);
  assert.match(root.innerHTML, /Uma citação direta exige ao menos um localizador/u);
  change(root, "[data-source-target-relation]", { dataset: { linkId }, value: "supported_by" });
  click(root, "save-target");
  await settle();
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].command.sourceLinks, [{ linkId,
    sourceId: current.sourceId, roles: ["technical_conceptual"], occurrences: [],
    relation: "supported_by", anchors: []
  }]);
});

test("exportação contém a proveniência corrente em linguagem humana", async () => {
  const current = source(1, { attachments: [attachment()] });
  const exports = [];
  const links = [{
    sourceId: current.sourceId,
    linkId: "link-fixture", roles: ["technical_conceptual"], occurrences: [],
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a" }]
  }];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture({ catalog: [current], links }),
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    targetLabel: "Explicar a relação",
    now: () => "2026-09-02T18:00:00.000Z",
    downloadJson: (value, filename) => exports.push({ value, filename })
  });

  await panel.open();
  await settle();
  click(root, "export-target");

  assert.equal(exports.length, 1);
  assert.equal(exports[0].value.contract, "aralearn.course-source-attribution-export.v3");
  assert.deepEqual(exports[0].value.target, {
    kind: "plan_item",
    version: 3,
    label: "Explicar a relação"
  });
  assert.equal(exports[0].value.sources[0].source.title, "Fonte 1");
  assert.equal(exports[0].value.sources[0].source.sourceId, "source-01");
  assert.equal(exports[0].value.sources[0].anchors[0].anchorId, "anchor-a");
  assert.equal(exports[0].value.sources[0].anchors[0].humanLocator, "Capítulo 2");
  assert.deepEqual(exports[0].value.sources[0].attachments, [{
    contentHash: HASH,
    byteSize: 2_048,
    mediaType: "application/pdf",
    createdAt: "2026-09-02T12:00:00.000Z"
  }]);
  assert.doesNotMatch(JSON.stringify(exports[0]),
    /sourceRevision|anchorRevision|attributionId|actorId|targetHash|storagePath|history/iu);
});

test("falhas de exportação nomeiam o resultado sem expor o erro interno", async (t) => {
  const failure = new Error("Cannot read properties of undefined");

  await t.test("observações", async () => {
    const root = new FakeRoot();
    const panel = createCourseSourcesPanel({
      root,
      controller: controllerFixture(),
      courseId: COURSE_ID,
      courseRevision: 5,
      downloadJson: () => { throw failure; }
    });
    await panel.open();
    click(root, "open-source", { sourceId: "source-01" });
    await settle();
    click(root, "export-observations");
    assert.match(root.innerHTML, /Não foi possível exportar as observações\./u);
    assert.doesNotMatch(root.innerHTML, /Cannot read properties of undefined/iu);
  });

  await t.test("proveniência", async () => {
    const current = source();
    const root = new FakeRoot();
    const panel = createCourseSourcesPanel({
      root,
      controller: controllerFixture({
        catalog: [current],
        links: [{
          sourceId: current.sourceId,
          linkId: "link-fixture", roles: ["technical_conceptual"], occurrences: [],
          relation: "supported_by",
          anchors: [{ anchorId: "anchor-a" }]
        }]
      }),
      courseId: COURSE_ID,
      courseRevision: 5,
      mode: "target",
      targetKind: "plan_item",
      targetId: PLAN_ITEM_ID,
      targetVersion: 3,
      downloadJson: () => { throw failure; }
    });
    await panel.open();
    await settle();
    click(root, "export-target");
    assert.match(root.innerHTML, /Não foi possível exportar a proveniência\./u);
    assert.doesNotMatch(root.innerHTML, /Cannot read properties of undefined/iu);
  });
});

test("PDF usa ingestão server-side e download autorizado do estado corrente", async () => {
  const current = source(1, { attachments: [attachment()] });
  const uploads = [];
  const downloads = [];
  const opened = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture({
      catalog: [current],
      onUpload: (value) => uploads.push(value),
      onDownload: (value) => downloads.push(value)
    }),
    courseId: COURSE_ID,
    courseRevision: 5,
    downloadUrl: (url) => opened.push(url)
  });

  await panel.open();
  click(root, "open-source", { sourceId: current.sourceId });
  await settle();
  const file = { name: "fonte.pdf", type: "application/pdf", size: 100, stream() {} };
  change(root, "[data-source-pdf-input]", { files: [file] });
  await settle();
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].sourceId, current.sourceId);

  click(root, "download-attachment", {
    sourceRevision: "1",
    contentHash: HASH
  });
  await settle();
  assert.equal(downloads.length, 1);
  assert.deepEqual(opened, ["https://storage.example.test/object.pdf?token=sealed"]);
});

test("confirmações destrutivas mantêm nome acessível e foco", async () => {
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    controller: controllerFixture(),
    courseId: COURSE_ID,
    courseRevision: 5
  });

  await panel.open();
  click(root, "open-source", { sourceId: "source-01" });
  await settle();
  click(root, "retire-source");

  assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.match(root.innerHTML, /Aposentar fonte\?/u);
  assert.match(root.innerHTML, /referências já vinculadas serão preservados/u);
  assert.equal(root.focusedSelectors.at(-1), '[data-source-action="cancel-confirmation"]');
  panel.destroy();
});
