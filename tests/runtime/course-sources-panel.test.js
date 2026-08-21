import assert from "node:assert/strict";
import test from "node:test";

import { createCourseSourcesPanel } from "../../src/ui/CourseSourcesPanel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PLAN_ITEM_ID = "20000000-0000-4000-8000-000000000002";
const ATTRIBUTION_ID = "30000000-0000-4000-8000-000000000003";

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
    return { focus: () => this.focusedSelectors.push(selector) };
  }

  contains() {
    return true;
  }
}

function source(index, overrides = {}) {
  return {
    sourceId: `source-${String(index).padStart(2, "0")}`,
    revision: 1,
    status: "active",
    kind: "book",
    title: `Fonte ${index}`,
    authorship: "Autoria",
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
    anchorCount: 1,
    createdAt: "2026-08-17T12:00:00.000Z",
    ...overrides
  };
}

function anchor(overrides = {}) {
  return {
    anchorId: "anchor-a",
    revision: 1,
    sourceRevision: 1,
    status: "active",
    selector: { kind: "page_range", startPage: 10, endPage: 12 },
    verificationExcerpt: null,
    actorId: null,
    createdAt: "2026-08-17T12:00:00.000Z",
    ...overrides
  };
}

function sourceFormMetadata(overrides = {}) {
  return {
    authorship: "Autoria",
    publicationDate: "2026",
    identifier: "doi:10.0000/exemplo",
    language: "pt-BR",
    origin: "external",
    availability: "open_access",
    verificationStatus: "author_verified",
    ...overrides
  };
}

function catalogPage(items, { revision = 5, nextCursor = null } = {}) {
  return {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: revision,
    mode: "catalog",
    query: { sourceId: null, targetKind: null, targetId: null },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items,
    nextCursor
  };
}

function sourcePage(value, {
  revision = 5,
  nextCursor = null,
  targetKind = null,
  targetId = null
} = {}) {
  return {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: revision,
    mode: "source",
    query: { sourceId: value.sourceId, targetKind, targetId },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [{
      ...value,
      actorId: null,
      anchors: [anchor({ sourceRevision: value.revision })],
      attachments: structuredClone(value.attachments || [])
    }],
    nextCursor
  };
}

function targetPage({ revision = 5 } = {}) {
  return {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: revision,
    mode: "target",
    query: { sourceId: null, targetKind: "plan_item", targetId: PLAN_ITEM_ID },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [{
      attributionId: ATTRIBUTION_ID,
      targetKind: "plan_item",
      targetId: PLAN_ITEM_ID,
      targetVersion: 3,
      targetHash: "a".repeat(64),
      revision: 1,
      sourceLinks: [{
        sourceId: "source-01",
        sourceRevision: 1,
        relation: "supported_by",
        anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
      }],
      actorId: null,
      createdAt: "2026-08-17T12:00:00.000Z",
      effective: true
    }],
    nextCursor: null
  };
}

function annotationController() {
  return {
    async loadCourseAnchoredAnnotations(courseId, options) {
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId,
        courseRevision: options.expectedCourseRevision,
        annotationSetVersion: options.annotationSetVersion ?? 0,
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
      throw new Error("Mutação de observação inesperada.");
    }
  };
}

function sourceObservation(annotationId, {
  targetKind = "source",
  targetId = "source-01",
  rawText = "Observação sobre a Fonte.",
  category = null
} = {}) {
  const observedPath = [
    { kind: "course", id: COURSE_ID, label: "Curso", version: 5 },
    { kind: "source", id: "source-01", label: "Fonte 1", version: 1 },
    ...(targetKind === "source_anchor"
      ? [{ kind: "source_anchor", id: targetId, label: null, version: 1 }]
      : [])
  ];
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId,
    annotationVersion: 1,
    courseId: COURSE_ID,
    provenance: { origin: "author", channel: "authoring_interface" },
    contributor: { kind: "self", role: "author", ref: "self", label: "Você" },
    target: {
      kind: targetKind,
      id: targetId,
      observedPath,
      currentAvailable: true,
      currentPath: observedPath,
      deepLink: `?section=sources&sourceId=source-01${targetKind === "source_anchor"
        ? `&anchorId=${targetId}` : ""}`
    },
    observedRevision: {
      certainty: "known",
      courseRevision: 5,
      targetVersion: 1
    },
    rawText,
    category,
    briefSummary: null,
    subjectClassification: {
      status: "unclassified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 5,
        subjects: []
      },
      effective: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 5,
        subjects: []
      },
      correctedAt: null
    },
    state: "open",
    ownerResponse: null,
    timestamps: {
      capturedAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
      firstConsideredAt: null,
      respondedAt: null,
      resolvedAt: null,
      withdrawnAt: null
    },
    capabilities: {
      canRevise: true,
      canWithdraw: true,
      canConsider: true,
      canRespond: true,
      canResolve: true,
      canReopen: false,
      canCorrectSubjects: true
    },
    deepLink: `?section=observations&annotationId=${annotationId}`
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

function submit(root, kind, values) {
  const form = editorForm(kind, values);
  root.listeners.get("submit")({ target: form, preventDefault() {} });
  return form;
}

function editorForm(kind, values) {
  const form = {
    elements: {},
    matches(selector) {
      return selector === `[data-source-form="${kind}"]`;
    }
  };
  form.elements = Object.fromEntries(Object.entries(values).map(([name, value]) => [
    name,
    { name, value, form }
  ]));
  return form;
}

function editForm(root, eventType, kind, values, fieldName, matchSelector = "") {
  const form = editorForm(kind, values);
  const target = form.elements[fieldName];
  target.matches = (selector) => selector === matchSelector;
  root.listeners.get(eventType)({ target });
  return form;
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

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("catálogo pagina mais de 55 Fontes em páginas estritas de 10", async () => {
  const all = Array.from({ length: 55 }, (_, index) => source(index + 1));
  const calls = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        calls.push({ courseId, options: structuredClone(options) });
        const offset = options.cursor === null
          ? 0
          : Number(String(options.cursor).replace(/^page-/u, ""));
        return catalogPage(all.slice(offset, offset + 10), {
          nextCursor: offset + 10 < all.length ? `page-${offset + 10}` : null
        });
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  click(root, "load-more-sources");
  await settle();
  click(root, "load-more-sources");
  await settle();
  click(root, "load-more-sources");
  await settle();
  click(root, "load-more-sources");
  await settle();
  click(root, "load-more-sources");
  await settle();

  assert.match(root.innerHTML, /data-source-count="55"/u);
  assert.match(root.innerHTML, /PDFs 0 B de 64 MiB/u);
  assert.deepEqual(calls.map(({ options }) => ({
    limit: options.limit,
    expectedRevision: options.expectedRevision,
    cursor: options.cursor
  })), [
    { limit: 10, expectedRevision: 5, cursor: null },
    { limit: 10, expectedRevision: 5, cursor: "page-10" },
    { limit: 10, expectedRevision: 5, cursor: "page-20" },
    { limit: 10, expectedRevision: 5, cursor: "page-30" },
    { limit: 10, expectedRevision: 5, cursor: "page-40" },
    { limit: 10, expectedRevision: 5, cursor: "page-50" }
  ]);
});

test("Fonte registra nota, contestação e reformulação e exporta a mesma proveniência", async () => {
  const root = new FakeRoot();
  const commands = [];
  const exports = [];
  let annotationSetVersion = 1;
  const consideredSourceLinks = [{
    sourceId: "source-01",
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
  }];
  const reformulated = sourceObservation(
    "60000000-0000-4000-8000-000000000090",
    {
      rawText: "A interpretação precisa distinguir os dois conceitos.",
      category: "reformulation_request"
    }
  );
  reformulated.annotationVersion = 2;
  reformulated.provenance = { origin: "learner", channel: "study_interface" };
  reformulated.contributor = {
    kind: "protected_person",
    role: "learner",
    ref: "person-0123456789abcdef",
    label: "Participante protegido"
  };
  reformulated.target.observedPath[0].label = "CAMINHO_INTERNO_SENTINELA";
  reformulated.target.currentPath[0].label = "CAMINHO_INTERNO_SENTINELA";
  reformulated.target.deepLink = "?interno=CAMINHO_INTERNO_SENTINELA";
  reformulated.deepLink = "?interno=CAMINHO_INTERNO_SENTINELA";
  reformulated.ownerResponse = {
    text: "A formulação agora distingue os dois conceitos.",
    kind: "reformulation",
    consideredSourceLinks,
    updatedAt: "2026-08-20T12:30:00.000Z"
  };
  reformulated.timestamps.respondedAt = "2026-08-20T12:30:00.000Z";
  reformulated.timestamps.updatedAt = "2026-08-20T12:30:00.000Z";
  const observations = [reformulated];
  let lastQuery = null;
  const controller = {
    async loadCourseSources(courseId, options) {
      return options.mode === "catalog"
        ? catalogPage([source(1)])
        : sourcePage(source(1));
    },
    async mutateCourseSources() {
      throw new Error("Mutação de Fonte inesperada.");
    },
    async loadCourseAnchoredAnnotations(courseId, options) {
      lastQuery = structuredClone(options.query);
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId,
        courseRevision: 5,
        annotationSetVersion,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: observations.length,
          byOrigin: { author: observations.length },
          byChannel: { authoring_interface: observations.length },
          byState: { open: observations.length },
          unclassifiedTotal: observations.length
        },
        items: structuredClone(observations),
        hasMore: false,
        nextCursor: null
      };
    },
    async mutateCourseAnchoredAnnotations(value) {
      commands.push(structuredClone(value.command));
      const item = sourceObservation(value.command.annotationId, {
        targetKind: value.command.target.kind,
        targetId: value.command.target.id,
        rawText: value.command.rawText,
        category: value.command.category
      });
      observations.unshift(item);
      annotationSetVersion += 1;
      return {
        contract: "aralearn.course-anchored-annotation-change.v1",
        courseId: COURSE_ID,
        courseRevision: 5,
        annotationSetVersion,
        requestId: value.requestId,
        idempotent: false,
        changed: true,
        annotation: structuredClone(item)
      };
    }
  };
  const panel = createCourseSourcesPanel({
    root,
    controller,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "catalog",
    now: () => "2026-08-20T13:00:00.000Z",
    downloadJson(value, filename) {
      exports.push({ value: structuredClone(value), filename });
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: "source-01" });
  await settle();
  assert.deepEqual(lastQuery.hierarchy, {
    target: { kind: "source", id: "source-01" },
    includeDescendants: true
  });
  assert.match(root.innerHTML, /Acrescentar nota/u);
  assert.match(root.innerHTML, /Contestar interpretação/u);
  assert.match(root.innerHTML, /Solicitar reformulação/u);
  assert.match(root.innerHTML, /Fontes e Âncoras consideradas/u);
  assert.match(root.innerHTML, /Exportação operacional privada/u);
  assert.match(root.innerHTML, /não é anônimo/u);

  for (const values of [
    {
      observationKind: "note",
      targetId: "",
      rawText: "Nota ligada à Fonte."
    },
    {
      observationKind: "contestation",
      targetId: "anchor-a",
      rawText: "Esta Âncora não sustenta a interpretação."
    },
    {
      observationKind: "reformulation",
      targetId: "",
      rawText: "Reformule a interpretação desta Fonte."
    }
  ]) {
    submit(root, "observation", values);
    await settle();
  }
  assert.deepEqual(commands.map(({ target, category }) => ({ target, category })), [
    { target: { kind: "source", id: "source-01" }, category: null },
    {
      target: { kind: "source_anchor", id: "anchor-a" },
      category: "possible_error"
    },
    {
      target: { kind: "source", id: "source-01" },
      category: "reformulation_request"
    }
  ]);

  click(root, "export-observations");
  assert.equal(exports.length, 1);
  assert.equal(exports[0].value.contract,
    "aralearn.course-source-observations-export.v2");
  assert.equal(
    exports[0].value.dataNotice.classification,
    "personal_or_pseudonymized_operational_data"
  );
  assert.match(exports[0].value.dataNotice.message, /texto livre/u);
  assert.match(exports[0].value.dataNotice.message, /identificadores internos/u);
  assert.match(exports[0].value.dataNotice.message, /horários/u);
  assert.match(exports[0].value.dataNotice.message, /não é um conjunto anônimo/u);
  const exportedObservation = exports[0].value.items.find(({ annotationId }) =>
    annotationId === reformulated.annotationId
  );
  assert.deepEqual(exportedObservation.contributor, {
    kind: "protected_person",
    role: "learner"
  });
  assert.equal(Object.hasOwn(exportedObservation.contributor, "ref"), false);
  assert.equal(Object.hasOwn(exportedObservation.target, "observedPath"), false);
  assert.equal(Object.hasOwn(exportedObservation.target, "currentPath"), false);
  assert.equal(Object.hasOwn(exportedObservation.target, "deepLink"), false);
  assert.equal(Object.hasOwn(exportedObservation, "deepLink"), false);
  assert.equal(Object.hasOwn(exportedObservation, "capabilities"), false);
  assert.equal(exportedObservation.rawText, reformulated.rawText);
  assert.equal(exportedObservation.target.id, "source-01");
  assert.equal(exportedObservation.timestamps.createdAt, "2026-08-20T12:00:00.000Z");
  assert.deepEqual(exportedObservation.ownerResponse.consideredSourceLinks,
    consideredSourceLinks);
  assert.doesNotMatch(
    JSON.stringify(exports[0].value),
    /person-0123456789abcdef|CAMINHO_INTERNO_SENTINELA/u
  );
});

test("histórico da Fonte preserva a consulta literal e carrega uma revisão por página", async () => {
  const sourceId = "  fonte-literal-á  ";
  const revisions = [3, 2, 1].map((revision) => source(1, {
    sourceId,
    revision,
    title: `Fonte literal v${revision}`
  }));
  const sourceCalls = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([revisions[0]], { revision: options.expectedRevision });
        }
        sourceCalls.push(structuredClone(options));
        const index = options.cursor === null ? 0 : options.cursor === "older-2" ? 1 : 2;
        return sourcePage(revisions[index], {
          revision: options.expectedRevision,
          nextCursor: index < revisions.length - 1 ? `older-${index + 2}` : null
        });
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  click(root, "open-source", { sourceId });
  await settle();
  assert.equal(sourceCalls.length, 1);
  assert.match(root.innerHTML, /revisão 3/u);
  assert.match(root.innerHTML, /Carregar revisões anteriores/u);

  click(root, "load-more-revisions");
  await settle();
  assert.match(root.innerHTML, /revisão 2/u);
  assert.match(root.innerHTML, /Carregar revisões anteriores/u);

  click(root, "load-more-revisions");
  await settle();
  assert.match(root.innerHTML, /revisão 1/u);
  assert.doesNotMatch(root.innerHTML, /Carregar revisões anteriores/u);
  assert.deepEqual(sourceCalls.map((options) => ({
    sourceId: options.sourceId,
    targetKind: options.targetKind,
    targetId: options.targetId,
    limit: options.limit,
    cursor: options.cursor
  })), [{
    sourceId,
    targetKind: null,
    targetId: null,
    limit: 1,
    cursor: null
  }, {
    sourceId,
    targetKind: null,
    targetId: null,
    limit: 1,
    cursor: "older-2"
  }, {
    sourceId,
    targetKind: null,
    targetId: null,
    limit: 1,
    cursor: "older-3"
  }]);
});

test("deep link abre Fonte literal e localiza a Âncora sem cair no catálogo", async () => {
  const sourceId = "  fonte/literal-á  ";
  const calls = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    initialSourceId: sourceId,
    initialAnchorId: "anchor-pinned",
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        calls.push(structuredClone(options));
        assert.equal(courseId, COURSE_ID);
        const pinned = options.cursor === "older-page";
        const value = source(1, {
          sourceId,
          revision: pinned ? 2 : 3,
          title: pinned ? "Fonte pinada" : "Fonte corrente"
        });
        const page = sourcePage(value, {
          revision: options.expectedRevision,
          nextCursor: pinned ? null : "older-page"
        });
        page.items[0].anchors = [anchor({
          anchorId: pinned ? "anchor-pinned" : "anchor-current",
          sourceRevision: value.revision
        })];
        return page;
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  assert.deepEqual(calls.map(({ mode, sourceId: calledSourceId, cursor, limit }) => ({
    mode, sourceId: calledSourceId, cursor, limit
  })), [{
    mode: "source", sourceId, cursor: null, limit: 24
  }, {
    mode: "source", sourceId, cursor: "older-page", limit: 24
  }]);
  assert.match(root.innerHTML, /Fonte pinada/u);
  assert.match(root.innerHTML, /data-source-deep-linked-anchor/u);
  assert.match(root.innerHTML, /Âncora indicada/u);
});

test("Fonte e Âncora delegam contexto canônico ao ChatGPT sem quebrar o painel", async () => {
  const root = new FakeRoot();
  const requests = [];
  const routes = [];
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "catalog",
    initialSourceId: "source-01",
    controller: {
      ...annotationController(),
      async loadCourseSources(_courseId, options) {
        return options.mode === "catalog"
          ? catalogPage([source(1)])
          : sourcePage(source(1));
      },
      async mutateCourseSources() {
        throw new Error("Mutação inesperada.");
      }
    },
    onNavigate(route) {
      routes.push(route);
      throw new Error("Falha isolada de navegação");
    },
    onRequestChat(request) {
      requests.push(structuredClone(request));
      throw new Error("Falha isolada do integrador");
    }
  });

  assert.equal(await panel.open(), true);
  assert.match(root.innerHTML, /data-source-action="request-chat-source"/u);
  assert.match(root.innerHTML, /data-source-action="request-chat-anchor"/u);
  assert.match(root.innerHTML, /aria-label="Trabalhar com o ChatGPT sobre Fonte 1"/u);
  assert.match(root.innerHTML, /aria-label="Trabalhar com o ChatGPT sobre Páginas 10–12"/u);

  assert.doesNotThrow(() => click(root, "request-chat-source", {
    sourceId: "source-01",
    sourceRevision: "1"
  }));
  assert.doesNotThrow(() => click(root, "request-chat-anchor", {
    anchorId: "anchor-a",
    sourceRevision: "1"
  }));

  const sourceRoute = `#/authoring/courses/${COURSE_ID}?section=sources&sourceId=source-01`;
  const anchorRoute = `${sourceRoute}&anchorId=anchor-a`;
  assert.deepEqual(routes, []);
  assert.deepEqual(requests, [{
    target: {
      type: "source",
      id: "source-01",
      title: "Fonte 1",
      path: ["Fontes", "Fonte 1"]
    },
    action: "verify_source",
    instruction: "Confira esta Fonte comigo, incluindo identidade, metadados, disponibilidade e aderência das evidências. Aponte divergências antes de propor alterações.",
    deepLink: sourceRoute
  }, {
    target: {
      type: "source_anchor",
      id: "anchor-a",
      title: "Páginas 10–12",
      path: ["Fontes", "Fonte 1", "Páginas 10–12"]
    },
    action: "discuss",
    instruction: "Discuta esta Âncora comigo e confira se o localizador e o trecho de verificação sustentam o uso pretendido da Fonte. Não altere outros escopos.",
    deepLink: anchorRoute
  }]);
  assert.match(root.innerHTML, /course-source-revisions/u);
  panel.destroy();
});

test("selecionar Fonte delega a atualização do hash canônico", async () => {
  const root = new FakeRoot();
  const routes = [];
  let detailReads = 0;
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "catalog",
    controller: {
      ...annotationController(),
      async loadCourseSources(_courseId, options) {
        if (options.mode === "catalog") return catalogPage([source(1)]);
        detailReads += 1;
        return sourcePage(source(1));
      },
      async mutateCourseSources() {
        throw new Error("Mutação inesperada.");
      }
    },
    onNavigate(route) {
      routes.push(route);
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: "source-01" });
  assert.deepEqual(routes, [
    `#/authoring/courses/${COURSE_ID}?section=sources&sourceId=source-01`
  ]);
  assert.equal(detailReads, 0);
  panel.destroy();
});

test("deep link de Fonte ausente termina em not_found sem catálogo silencioso", async () => {
  const calls = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    initialSourceId: "fonte-ausente",
    initialAnchorId: "anchor-ausente",
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        calls.push({ courseId, options: structuredClone(options) });
        return sourcePage(source(1, { sourceId: "fonte-ausente" }), {
          revision: options.expectedRevision,
          nextCursor: null
        });
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  assert.equal(await panel.open(), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.mode, "source");
  assert.match(root.innerHTML, /not_found: a Âncora indicada não existe/u);
  assert.doesNotMatch(root.innerHTML, /Nova fonte/u);
  assert.throws(() => createCourseSourcesPanel({
    root: new FakeRoot(),
    courseId: COURSE_ID,
    courseRevision: 5,
    initialAnchorId: "anchor-sem-fonte",
    controller: { ...annotationController(),
      loadCourseSources() {},
      mutateCourseSources() {}
    }
  }), /Deep link de Fonte inválido/u);
});

test("retry ambíguo conserva exatamente requestId e comando sem formulário JSON", async () => {
  const writes = [];
  let currentRevision = 5;
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: currentRevision,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        return catalogPage([], { revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        if (writes.length === 1) throw new TypeError("Failed to fetch");
        currentRevision += 1;
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: currentRevision,
          requestId: input.requestId,
          idempotent: true,
          changed: true,
          change: { type: "save_source", subjectId: "fonte-estavel", revision: 1 }
        };
      }
    }
  });
  await panel.open();
  click(root, "add-source");
  assert.doesNotMatch(root.innerHTML, /JSON/iu);
  submit(root, "source", {
    ...sourceFormMetadata(),
    sourceId: "fonte-estavel",
    kind: "book",
    title: "Fonte estável",
    citationText: "Autoria. Fonte estável. 2026.",
    url: "https://example.test/fonte",
    editionOrVersion: "2ª edição",
    studyVisibility: "citation"
  });
  await settle();
  assert.match(root.innerHTML, /Confirmar a mesma operação/u);
  assert.equal(panel.hasPendingDraft(), true);
  click(root, "retry-command");
  await settle();

  assert.equal(writes.length, 2);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.deepEqual(writes[0].command, writes[1].command);
  assert.equal(writes[0].command.expectedSourceRevision, 0);
  assert.equal(writes[0].command.source.studyVisibility, "citation");
  assert.equal(panel.hasPendingDraft(), false);
});

test("nova Âncora reenvia pelo formulário renderizado o mesmo envelope após falha ambígua", async () => {
  const writes = [];
  const currentSource = source(1, { anchorCount: 0 });
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([currentSource], { revision: options.expectedRevision });
        }
        return {
          ...sourcePage(currentSource, { revision: options.expectedRevision }),
          items: [{ ...currentSource, actorId: null, anchors: [], attachments: [] }]
        };
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        if (writes.length === 1) throw new TypeError("Failed to fetch");
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: true,
          changed: true,
          change: {
            type: "save_anchor",
            subjectId: input.command.anchorId,
            revision: 1
          }
        };
      }
    }
  });
  const values = {
    selectorKind: "page_range",
    startPage: "31",
    endPage: "33",
    verificationExcerpt: "Trecho mantido no formulário novo."
  };

  await panel.open();
  click(root, "open-source", { sourceId: currentSource.sourceId });
  await settle();
  click(root, "add-anchor");
  const firstForm = submit(root, "anchor", values);
  await settle();

  assert.match(root.innerHTML, /Confirmar a mesma operação/u);
  assert.match(root.innerHTML, /name="startPage"[^>]+value="31"/u);
  assert.match(root.innerHTML, />Trecho mantido no formulário novo\.<\/textarea>/u);

  const secondForm = submit(root, "anchor", values);
  assert.notEqual(firstForm, secondForm);
  await settle();

  assert.equal(writes.length, 2);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.equal(writes[0].command.anchorId, writes[1].command.anchorId);
  assert.deepEqual(writes[0].command, writes[1].command);
});

test("observação preserva DOM, foco e envelope no submit natural após falha ambígua", async () => {
  const writes = [];
  const currentSource = source(1);
  const root = new FakeRoot();
  let instant = 0;
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    now() {
      instant += 1;
      return `2026-08-20T12:00:0${instant}.000Z`;
    },
    controller: {
      ...annotationController(),
      async loadCourseSources(courseId, options) {
        return options.mode === "catalog"
          ? catalogPage([currentSource], { revision: options.expectedRevision })
          : sourcePage(currentSource, { revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new Error("Mutação de Fonte inesperada.");
      },
      async mutateCourseAnchoredAnnotations(input) {
        writes.push(structuredClone(input));
        if (writes.length === 1) throw new TypeError("Failed to fetch");
        const item = sourceObservation(input.command.annotationId, {
          targetKind: input.command.target.kind,
          targetId: input.command.target.id,
          rawText: input.command.rawText,
          category: input.command.category
        });
        item.timestamps.capturedAt = input.command.capturedAt;
        return {
          contract: "aralearn.course-anchored-annotation-change.v1",
          courseId: COURSE_ID,
          courseRevision: 5,
          annotationSetVersion: 1,
          requestId: input.requestId,
          idempotent: true,
          changed: true,
          annotation: item
        };
      }
    }
  });
  const values = {
    observationKind: "contestation",
    targetId: "anchor-a",
    rawText: "A interpretação <precisa> ser conferida."
  };

  await panel.open();
  click(root, "open-source", { sourceId: currentSource.sourceId });
  await settle();
  editForm(root, "input", "observation", values, "rawText");
  const firstForm = submit(root, "observation", values);
  await settle();

  assert.match(root.innerHTML, /Confirmar a mesma observação/u);
  assert.match(root.innerHTML, /value="contestation" selected/u);
  assert.match(root.innerHTML, /value="anchor-a" selected/u);
  assert.match(root.innerHTML, />A interpretação &lt;precisa&gt; ser conferida\.<\/textarea>/u);
  assert.equal(
    root.focusedSelectors.at(-1),
    '[data-source-form="observation"] [name="rawText"]'
  );

  const secondForm = submit(root, "observation", values);
  assert.notEqual(firstForm, secondForm);
  await settle();

  assert.equal(writes.length, 2);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.equal(writes[0].command.annotationId, writes[1].command.annotationId);
  assert.equal(writes[0].command.capturedAt, writes[1].command.capturedAt);
  assert.deepEqual(writes[0].command, writes[1].command);
  assert.doesNotMatch(root.innerHTML, />A interpretação &lt;precisa&gt;/u);
});

test("Fonte confirmada não reaparece como ambígua quando apenas a releitura falha", async () => {
  const root = new FakeRoot();
  const writes = [];
  let confirmed = false;
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (confirmed) throw new TypeError("Failed to fetch");
        return catalogPage([], { revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        confirmed = true;
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: { type: "save_source", subjectId: input.command.sourceId, revision: 1 }
        };
      }
    }
  });

  await panel.open();
  click(root, "add-source");
  submit(root, "source", {
    ...sourceFormMetadata(),
    sourceId: "fonte-confirmada",
    kind: "book",
    title: "Fonte confirmada",
    citationText: "Autoria. Fonte confirmada. 2026.",
    url: "https://example.test/confirmada",
    editionOrVersion: "1ª edição",
    studyVisibility: "citation"
  });
  await settle();

  assert.equal(writes.length, 1);
  assert.match(root.innerHTML, /Alteração salva/u);
  assert.match(root.innerHTML, /A escrita foi confirmada, mas a lista está desatualizada/u);
  assert.doesNotMatch(root.innerHTML, /Confirmar a mesma operação/u);
  assert.doesNotMatch(root.innerHTML, /mesmo requestId/u);
  assert.equal(panel.hasPendingDraft(), false);
});

test("Âncora confirmada mantém a escrita final quando catálogo e detalhe não podem ser relidos", async () => {
  const root = new FakeRoot();
  const current = source(1, { anchorCount: 0 });
  const writes = [];
  let confirmed = false;
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (confirmed) throw new TypeError("Failed to fetch");
        if (options.mode === "catalog") {
          return catalogPage([current], { revision: options.expectedRevision });
        }
        return {
          ...sourcePage(current, { revision: options.expectedRevision }),
          items: [{ ...current, actorId: null, anchors: [], attachments: [] }]
        };
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        confirmed = true;
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: { type: "save_anchor", subjectId: input.command.anchorId, revision: 1 }
        };
      }
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: current.sourceId });
  await settle();
  click(root, "add-anchor");
  submit(root, "anchor", {
    selectorKind: "page_range",
    startPage: "4",
    endPage: "7",
    verificationExcerpt: "Trecho confirmado antes da falha de leitura."
  });
  await settle();

  assert.equal(writes.length, 1);
  assert.match(root.innerHTML, /Alteração salva/u);
  assert.match(root.innerHTML, /A escrita foi confirmada, mas a lista está desatualizada/u);
  assert.doesNotMatch(root.innerHTML, /Confirmar a mesma operação/u);
  assert.equal(panel.hasPendingDraft(), false);
});

test("Observação confirmada relata lista desatualizada sem oferecer reaplicação", async () => {
  const root = new FakeRoot();
  const current = source(1);
  const writes = [];
  let annotationConfirmed = false;
  const baseAnnotations = annotationController();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: {
      ...baseAnnotations,
      async loadCourseSources(courseId, options) {
        return options.mode === "catalog"
          ? catalogPage([current], { revision: options.expectedRevision })
          : sourcePage(current, { revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new Error("Mutação de Fonte inesperada.");
      },
      async loadCourseAnchoredAnnotations(courseId, options) {
        if (annotationConfirmed) throw new TypeError("Failed to fetch");
        return baseAnnotations.loadCourseAnchoredAnnotations(courseId, options);
      },
      async mutateCourseAnchoredAnnotations(input) {
        writes.push(structuredClone(input));
        annotationConfirmed = true;
        return {
          contract: "aralearn.course-anchored-annotation-change.v1",
          courseId: COURSE_ID,
          courseRevision: 5,
          annotationSetVersion: 1,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          annotation: sourceObservation(input.command.annotationId, {
            targetKind: input.command.target.kind,
            targetId: input.command.target.id,
            rawText: input.command.rawText,
            category: input.command.category
          })
        };
      }
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: current.sourceId });
  await settle();
  submit(root, "observation", {
    observationKind: "note",
    targetId: "",
    rawText: "Observação cuja escrita será confirmada."
  });
  await settle();

  assert.equal(writes.length, 1);
  assert.match(root.innerHTML, /Observação registrada/u);
  assert.match(root.innerHTML, /A escrita foi confirmada, mas a lista está desatualizada/u);
  assert.doesNotMatch(root.innerHTML, /Confirmar a mesma observação/u);
  assert.doesNotMatch(root.innerHTML, /mesmo requestId/u);
  assert.equal(panel.hasPendingDraft(), false);
});

test("editor de alvo salva o conjunto completo ordenado com relação e âncoras", async () => {
  const writes = [];
  const reads = [];
  const root = new FakeRoot();
  const currentSource = source(1);
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    targetLabel: "Explicar o mecanismo",
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        reads.push(structuredClone(options));
        if (options.mode === "catalog") {
          return catalogPage([currentSource], { revision: options.expectedRevision });
        }
        if (options.mode === "source") {
          return sourcePage(currentSource, {
            revision: options.expectedRevision,
            targetKind: options.targetKind,
            targetId: options.targetId
          });
        }
        return targetPage({ revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: { type: "set_target_sources", subjectId: PLAN_ITEM_ID, revision: 2 }
        };
      }
    }
  });
  await panel.open();
  await settle();
  for (const relation of [
    "informed_by", "supported_by", "adapted_from", "quoted_from",
    "contrasted_with", "exemplified_by", "inspired_by", "needs_verification"
  ]) {
    assert.match(root.innerHTML, new RegExp(`value="${relation}"`, "u"));
  }
  assert.deepEqual(reads.map((options) => ({
    mode: options.mode,
    sourceId: options.sourceId,
    targetKind: options.targetKind,
    targetId: options.targetId,
    limit: options.limit
  })).sort((left, right) => left.mode.localeCompare(right.mode)), [{
    mode: "catalog",
    sourceId: null,
    targetKind: null,
    targetId: null,
    limit: 10
  }, {
    mode: "source",
    sourceId: currentSource.sourceId,
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    limit: 1
  }, {
    mode: "source",
    sourceId: currentSource.sourceId,
    targetKind: null,
    targetId: null,
    limit: 1
  }, {
    mode: "target",
    sourceId: null,
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    limit: 1
  }]);
  click(root, "save-target");
  await settle();

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].command, {
    type: "set_target_sources",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    expectedTargetVersion: 3,
    sourceLinks: [{
      sourceId: "source-01",
      sourceRevision: 1,
      relation: "supported_by",
      anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
    }]
  });
});

test("modal de atribuição contém foco e exige descarte explícito antes de fechar alterações", async () => {
  const root = new FakeRoot();
  const documentListeners = new Map();
  const focusMoves = [];
  const documentValue = {
    activeElement: null,
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    removeEventListener(type) {
      documentListeners.delete(type);
    },
    querySelectorAll() {
      return [opener];
    }
  };
  const focusable = (name) => ({
    focus() {
      documentValue.activeElement = this;
      focusMoves.push(name);
    }
  });
  const closeControl = focusable("fechar");
  const lastControl = focusable("último");
  const cancelControl = focusable("cancelar descarte");
  const confirmControl = focusable("confirmar descarte");
  const details = { open: false, parentElement: null };
  const opener = {
    dataset: { itemId: PLAN_ITEM_ID },
    closest(selector) {
      return selector === "details" ? details : null;
    },
    focus() {
      focusMoves.push("acionador");
    }
  };
  root.querySelectorAll = (selector) => {
    if (selector.includes("data-source-confirmation")) return [cancelControl, confirmControl];
    if (selector.includes("data-source-target-dialog")) return [closeControl, lastControl];
    return [];
  };
  let closes = 0;
  const panel = createCourseSourcesPanel({
    root,
    documentValue,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    onClose() {
      closes += 1;
    },
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") return catalogPage([source(1)], {
          revision: options.expectedRevision
        });
        if (options.mode === "source") return sourcePage(source(1), {
          revision: options.expectedRevision,
          targetKind: options.targetKind,
          targetId: options.targetId
        });
        return targetPage({ revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  await panel.open();
  await settle();
  assert.match(root.innerHTML, /data-source-target-dialog tabindex="-1"/u);
  assert.equal(root.focusedSelectors.at(-1), "[data-source-target-dialog]");

  documentValue.activeElement = lastControl;
  let prevented = false;
  root.listeners.get("keydown")({
    key: "Tab",
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(focusMoves.at(-1), "fechar");

  documentValue.activeElement = closeControl;
  prevented = false;
  root.listeners.get("keydown")({
    key: "Tab",
    shiftKey: true,
    preventDefault() { prevented = true; }
  });
  assert.equal(prevented, true);
  assert.equal(focusMoves.at(-1), "último");

  click(root, "remove-target-source", { sourceId: "source-01" });
  click(root, "close-target");
  assert.equal(closes, 0);
  assert.match(root.innerHTML, /Descartar alterações\?/u);
  assert.match(root.innerHTML, /ainda não foram salvas/u);
  click(root, "cancel-confirmation");
  assert.equal(root.focusedSelectors.at(-1), '[data-source-action="close-target"]');
  assert.match(root.innerHTML, /Nenhuma fonte vinculada/u);

  let escapeStopped = false;
  root.listeners.get("keydown")({
    key: "Escape",
    preventDefault() {},
    stopPropagation() { escapeStopped = true; }
  });
  assert.equal(escapeStopped, true);
  assert.match(root.innerHTML, /Descartar alterações\?/u);
  root.listeners.get("keydown")({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.doesNotMatch(root.innerHTML, /Descartar alterações\?/u);

  documentListeners.get("click")({
    target: { matches: (selector) => selector === ".course-source-target-overlay" }
  });
  assert.equal(closes, 0);
  assert.match(root.innerHTML, /Descartar alterações\?/u);
  click(root, "confirm-target-discard");
  await settle();
  assert.equal(closes, 1);
  assert.equal(details.open, true);
  assert.equal(focusMoves.at(-1), "acionador");
  panel.destroy();
});

test("modal de atribuição sem rascunho fecha pelo backdrop e restaura o acionador", async () => {
  const root = new FakeRoot();
  const documentListeners = new Map();
  let openerFocused = 0;
  const opener = {
    dataset: { itemId: PLAN_ITEM_ID },
    closest() { return null; },
    focus() { openerFocused += 1; }
  };
  const documentValue = {
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type) { documentListeners.delete(type); },
    querySelectorAll() { return [opener]; }
  };
  let closes = 0;
  const panel = createCourseSourcesPanel({
    root,
    documentValue,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    onClose() { closes += 1; },
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") return catalogPage([source(1)], {
          revision: options.expectedRevision
        });
        if (options.mode === "source") return sourcePage(source(1), {
          revision: options.expectedRevision,
          targetKind: options.targetKind,
          targetId: options.targetId
        });
        return targetPage({ revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  await panel.open();
  await settle();
  documentListeners.get("click")({
    target: { matches: (selector) => selector === ".course-source-target-overlay" }
  });
  await settle();
  assert.equal(closes, 1);
  assert.equal(openerFocused, 1);
  assert.doesNotMatch(root.innerHTML, /Descartar alterações/u);
  panel.destroy();
});

test("modal não perde envelope de atribuição cuja resposta ficou ambígua", async () => {
  const root = new FakeRoot();
  let closes = 0;
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    onClose() { closes += 1; },
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") return catalogPage([source(1)], {
          revision: options.expectedRevision
        });
        if (options.mode === "source") return sourcePage(source(1), {
          revision: options.expectedRevision,
          targetKind: options.targetKind,
          targetId: options.targetId
        });
        return targetPage({ revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new TypeError("Failed to fetch");
      }
    }
  });

  await panel.open();
  await settle();
  click(root, "save-target");
  await settle();
  assert.match(root.innerHTML, /Confirmar a mesma operação/u);
  click(root, "close-target");
  assert.equal(closes, 0);
  assert.match(root.innerHTML, /Abandonar confirmação\?/u);
  assert.match(root.innerHTML, /operação pode ter sido aplicada/u);
  click(root, "cancel-confirmation");
  assert.match(root.innerHTML, /Confirmar a mesma operação/u);
  click(root, "close-target");
  click(root, "confirm-target-discard");
  assert.equal(closes, 1);
  panel.destroy();
});

test("exportação do alvo preserva identidades, revisão, relação e Âncora exatas", async () => {
  const exports = [];
  const root = new FakeRoot();
  const currentSource = source(1, {
    attachments: [{
      contentHash: "b".repeat(64),
      byteSize: 2_048,
      mediaType: "application/pdf",
      storagePath: `${COURSE_ID}/${"b".repeat(64)}.pdf`,
      actorId: "40000000-0000-4000-8000-000000000004",
      createdAt: "2026-08-20T12:00:00.000Z"
    }]
  });
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    targetLabel: "Explicar o mecanismo",
    now: () => "2026-08-20T18:00:00.000Z",
    downloadJson: (value, filename) => exports.push({ value, filename }),
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          const { attachments, ...catalogSource } = currentSource;
          assert.equal(attachments.length, 1);
          return catalogPage([catalogSource], { revision: options.expectedRevision });
        }
        if (options.mode === "source") {
          return sourcePage(currentSource, {
            revision: options.expectedRevision,
            targetKind: options.targetKind,
            targetId: options.targetId
          });
        }
        return targetPage({ revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  await panel.open();
  await settle();
  assert.match(root.innerHTML, /Exportar proveniência/u);
  assert.doesNotMatch(root.innerHTML, /data-source-action="export-target" disabled/u);
  click(root, "export-target");

  assert.equal(exports.length, 1);
  assert.equal(exports[0].filename, `aralearn-proveniencia-${COURSE_ID}-plan_item.json`);
  assert.deepEqual(exports[0].value, {
    contract: "aralearn.course-source-attribution-export.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    exportedAt: "2026-08-20T18:00:00.000Z",
    target: {
      kind: "plan_item",
      id: PLAN_ITEM_ID,
      version: 3,
      label: "Explicar o mecanismo",
      attribution: {
        attributionId: ATTRIBUTION_ID,
        revision: 1,
        targetHash: "a".repeat(64),
        createdAt: "2026-08-17T12:00:00.000Z"
      }
    },
    sources: [{
      sourceId: "source-01",
      sourceRevision: 1,
      relation: "supported_by",
      source: {
        sourceId: "source-01",
        revision: 1,
        status: "active",
        kind: "book",
        title: "Fonte 1",
        authorship: "Autoria",
        publicationDate: "2026",
        identifier: null,
        language: "pt-BR",
        citationText: "Autoria. Fonte 1. 2026.",
        url: "https://example.test/source-1",
        editionOrVersion: null,
        origin: "external",
        availability: "open_access",
        verificationStatus: "author_verified",
        studyVisibility: "citation_and_link",
        anchorCount: 1,
        createdAt: "2026-08-17T12:00:00.000Z"
      },
      anchors: [{
        anchorId: "anchor-a",
        revision: 1,
        sourceRevision: 1,
        status: "active",
        selector: { kind: "page_range", startPage: 10, endPage: 12 },
        verificationExcerpt: null,
        createdAt: "2026-08-17T12:00:00.000Z"
      }],
      attachments: [{
        contentHash: "b".repeat(64),
        byteSize: 2_048,
        mediaType: "application/pdf",
        storagePath: `${COURSE_ID}/${"b".repeat(64)}.pdf`,
        createdAt: "2026-08-20T12:00:00.000Z"
      }]
    }]
  });
  assert.match(root.innerHTML, /exportação da proveniência foi preparada para salvamento/u);
  assert.doesNotMatch(root.innerHTML, /is-error/u);
});

test("32 vínculos pinados entre 105 revisões usam lookup contextual único e literal", async () => {
  const links = Array.from({ length: 32 }, (_, index) => ({
    sourceId: `source-${String(index + 1).padStart(2, "0")}`,
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{
      anchorId: `anchor-${String(index + 1).padStart(2, "0")}`,
      anchorRevision: 1
    }]
  }));
  const calls = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        calls.push(structuredClone(options));
        if (options.mode === "catalog") {
          return catalogPage(links.slice(0, 10).map((link, index) => source(index + 1, {
            sourceId: link.sourceId,
            revision: 105
          })), { revision: options.expectedRevision, nextCursor: "cGFnZS0y" });
        }
        if (options.mode === "target") {
          return {
            ...targetPage({ revision: options.expectedRevision }),
            items: [{
              ...targetPage({ revision: options.expectedRevision }).items[0],
              sourceLinks: links
            }]
          };
        }
        const ordinal = Number(options.sourceId.slice(-2));
        const contextual = options.targetKind !== null;
        const revision = contextual ? 1 : 105;
        const value = source(ordinal, { sourceId: options.sourceId, revision });
        return {
          ...sourcePage(value, {
            revision: options.expectedRevision,
            targetKind: options.targetKind,
            targetId: options.targetId
          }),
          items: [{
            ...value,
            actorId: null,
            anchors: [anchor({
              anchorId: `anchor-${String(ordinal).padStart(2, "0")}`,
              revision,
              sourceRevision: revision
            })],
            attachments: []
          }]
        };
      },
      async mutateCourseSources() {
        throw new Error("Não deve salvar.");
      }
    }
  });

  assert.equal(await panel.open(), true);
  await settle();
  const sourceCalls = calls.filter(({ mode }) => mode === "source");
  const contextualCalls = sourceCalls.filter(({ targetKind }) => targetKind !== null);
  const currentCalls = sourceCalls.filter(({ targetKind }) => targetKind === null);
  assert.equal(contextualCalls.length, 32);
  assert.equal(currentCalls.length, 32);
  assert.equal(calls.length, 66);
  assert.equal(contextualCalls.every((options) => options.cursor === null &&
    options.limit === 1 && options.targetKind === "plan_item" &&
    options.targetId === PLAN_ITEM_ID), true);
  assert.deepEqual(contextualCalls[0], {
    mode: "source",
    sourceId: "source-01",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    expectedRevision: 5,
    limit: 1,
    cursor: null
  });
  assert.match(root.innerHTML, /revisão histórica/u);
});

test("catálogo cria, revisa e aposenta a Fonte após confirmação modal acessível", async () => {
  const writes = [];
  let courseRevision = 5;
  let current = null;
  const root = new FakeRoot();
  const tabMoves = [];
  const cancelControl = { focus: () => tabMoves.push("cancel") };
  const confirmControl = { focus: () => tabMoves.push("confirm") };
  root.querySelectorAll = (selector) => selector.includes("data-source-confirmation")
    ? [cancelControl, confirmControl]
    : [];
  const documentValue = {
    activeElement: confirmControl,
    addEventListener() {},
    removeEventListener() {}
  };
  const panel = createCourseSourcesPanel({
    root,
    documentValue,
    courseId: COURSE_ID,
    courseRevision,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          const catalogItem = current ? structuredClone(current) : null;
          if (catalogItem) {
            delete catalogItem.actorId;
            delete catalogItem.anchors;
            delete catalogItem.attachments;
          }
          return catalogPage(catalogItem ? [catalogItem] : [], {
            revision: options.expectedRevision
          });
        }
        return {
          contract: "aralearn.course-sources.v1",
          courseId: COURSE_ID,
          courseRevision: options.expectedRevision,
          mode: "source",
          query: { sourceId: options.sourceId, targetKind: null, targetId: null },
          pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
          items: current ? [structuredClone(current)] : [],
          nextCursor: null
        };
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        const command = input.command;
        if (command.type === "save_source") {
          current = {
            sourceId: command.sourceId,
            revision: command.expectedSourceRevision + 1,
            status: "active",
            ...structuredClone(command.source),
            anchorCount: 0,
            createdAt: "2026-08-17T12:00:00.000Z",
            actorId: null,
            anchors: [],
            attachments: []
          };
        } else {
          current = {
            ...current,
            revision: current.revision + 1,
            status: "retired",
            createdAt: "2026-08-17T12:01:00.000Z"
          };
        }
        courseRevision += 1;
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: command.type,
            subjectId: command.sourceId,
            revision: current.revision
          }
        };
      }
    }
  });

  await panel.open();
  click(root, "add-source");
  submit(root, "source", {
    ...sourceFormMetadata(),
    sourceId: "fonte-versionada",
    kind: "book",
    title: "Fonte versionada",
    citationText: "Autoria. Fonte versionada. 2026.",
    url: "https://example.test/versionada",
    editionOrVersion: "1ª edição",
    studyVisibility: "citation"
  });
  await settle();
  click(root, "open-source", { sourceId: "fonte-versionada" });
  await settle();
  click(root, "edit-source");
  submit(root, "source", {
    ...sourceFormMetadata(),
    sourceId: "fonte-versionada",
    kind: "book",
    title: "Fonte versionada e revista",
    citationText: "Autoria. Fonte versionada e revista. 2026.",
    url: "https://example.test/versionada",
    editionOrVersion: "2ª edição",
    studyVisibility: "citation_and_link"
  });
  await settle();
  click(root, "retire-source");
  assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.match(root.innerHTML, /class="course-authoring-confirm-backdrop" data-source-confirmation-backdrop/u);
  assert.match(root.innerHTML, /role="alertdialog" aria-modal="true"/u);
  assert.equal(writes.length, 2);
  assert.equal(root.focusedSelectors.at(-1), '[data-source-action="cancel-confirmation"]');
  let tabPrevented = false;
  root.listeners.get("keydown")({
    key: "Tab",
    preventDefault() { tabPrevented = true; }
  });
  assert.equal(tabPrevented, true);
  assert.equal(tabMoves.at(-1), "cancel");
  click(root, "cancel-confirmation");
  assert.doesNotMatch(root.innerHTML, /role="alertdialog"/u);
  assert.equal(root.focusedSelectors.at(-1), '[data-source-action="retire-source"]');
  click(root, "retire-source");
  click(root, "confirm-retirement");
  await settle();

  assert.deepEqual(writes.map(({ command }) => ({
    type: command.type,
    expectedSourceRevision: command.expectedSourceRevision,
    title: command.source?.title
  })), [{
    type: "save_source",
    expectedSourceRevision: 0,
    title: "Fonte versionada"
  }, {
    type: "save_source",
    expectedSourceRevision: 1,
    title: "Fonte versionada e revista"
  }, {
    type: "retire_source",
    expectedSourceRevision: 2,
    title: undefined
  }]);
  assert.match(root.innerHTML, /Aposentada/u);
  assert.doesNotMatch(root.innerHTML, /JSON/iu);
});

test("resolver Fonte legada preserva a identidade literal existente", async () => {
  const legacySourceId = `  legacy-${"x".repeat(241)}  `;
  const unresolved = source(1, {
    sourceId: legacySourceId,
    status: "unresolved_legacy",
    kind: null,
    title: null,
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "imported_legacy",
    availability: "unknown",
    verificationStatus: "unverified",
    studyVisibility: "hidden",
    anchorCount: 0
  });
  const writes = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([unresolved], { revision: options.expectedRevision });
        }
        return {
          contract: "aralearn.course-sources.v1",
          courseId: COURSE_ID,
          courseRevision: options.expectedRevision,
          mode: "source",
          query: { sourceId: legacySourceId, targetKind: null, targetId: null },
          pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
          items: [{ ...unresolved, actorId: null, anchors: [], attachments: [] }],
          nextCursor: null
        };
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: { type: "save_source", subjectId: legacySourceId, revision: 2 }
        };
      }
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: legacySourceId });
  await settle();
  assert.match(root.innerHTML, /data-source-action="edit-source"/u);
  click(root, "edit-source");
  assert.match(root.innerHTML, /name="sourceId" maxlength="4096"/u);
  submit(root, "source", {
    ...sourceFormMetadata({ origin: "imported_legacy", availability: "unknown",
      verificationStatus: "unverified" }),
    sourceId: "valor-do-campo-não-substitui-identidade",
    kind: "document",
    title: "Referência legada resolvida",
    citationText: "Autoria. Referência legada resolvida. 2026.",
    url: "",
    editionOrVersion: "",
    studyVisibility: "citation"
  });
  await settle();

  assert.equal(writes.length, 1);
  assert.equal(writes[0].command.sourceId, legacySourceId);
  assert.equal(writes[0].command.expectedSourceRevision, 1);
});

test("detalhe cria, revisa e aposenta Âncora presa à revisão exata da Fonte", async () => {
  const writes = [];
  let courseRevision = 5;
  const base = source(1, { anchorCount: 0 });
  let anchors = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([{ ...base, anchorCount: anchors.filter(({ status }) =>
            status === "active").length }], { revision: options.expectedRevision });
        }
        return {
          contract: "aralearn.course-sources.v1",
          courseId: COURSE_ID,
          courseRevision: options.expectedRevision,
          mode: "source",
          query: { sourceId: base.sourceId, targetKind: null, targetId: null },
          pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
          items: [{
            ...base,
            anchorCount: anchors.filter(({ status }) => status === "active").length,
            actorId: null,
            anchors: structuredClone(anchors),
            attachments: []
          }],
          nextCursor: null
        };
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        const command = input.command;
        let revision;
        if (command.type === "save_anchor") {
          revision = command.expectedAnchorRevision + 1;
          anchors = [{
            anchorId: command.anchorId,
            revision,
            sourceRevision: command.sourceRevision,
            status: "active",
            selector: structuredClone(command.selector),
            verificationExcerpt: command.verificationExcerpt,
            actorId: null,
            createdAt: "2026-08-17T12:00:00.000Z"
          }];
        } else {
          revision = command.expectedAnchorRevision + 1;
          anchors = [{
            ...anchors[0],
            revision,
            status: "retired",
            createdAt: "2026-08-17T12:01:00.000Z"
          }];
        }
        courseRevision += 1;
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: { type: command.type, subjectId: command.anchorId, revision }
        };
      }
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: base.sourceId });
  await settle();
  click(root, "add-anchor");
  submit(root, "anchor", {
    selectorKind: "page_range",
    startPage: "20",
    endPage: "21",
    verificationExcerpt: "Trecho conferido."
  });
  await settle();
  const anchorId = writes[0].command.anchorId;
  click(root, "edit-anchor", { anchorId, sourceRevision: "1" });
  submit(root, "anchor", {
    selectorKind: "page_range",
    startPage: "22",
    endPage: "24",
    verificationExcerpt: "Trecho revisto."
  });
  await settle();
  const opaqueAnchorId = 'âncora"] [autofocus="';
  let opaqueTriggerFocused = false;
  root.querySelectorAll = (selector) => {
    assert.equal(selector, '[data-source-action="retire-anchor"]');
    return [{
      dataset: { anchorId: "outra-âncora" },
      focus() { assert.fail("Não deve focar outra Âncora."); }
    }, {
      dataset: { anchorId: opaqueAnchorId },
      focus(options) {
        opaqueTriggerFocused = true;
        assert.deepEqual(options, { preventScroll: true });
      }
    }];
  };
  click(root, "retire-anchor", { anchorId: opaqueAnchorId, anchorRevision: "2" });
  assert.match(root.innerHTML, /Aposentar âncora\?/u);
  assert.doesNotThrow(() => click(root, "cancel-confirmation"));
  assert.equal(opaqueTriggerFocused, true);

  click(root, "retire-anchor", { anchorId, anchorRevision: "2" });
  assert.match(root.innerHTML, /Aposentar âncora\?/u);
  assert.equal(writes.length, 2);
  click(root, "confirm-retirement");
  await settle();

  assert.deepEqual(writes.map(({ command }) => ({
    type: command.type,
    sourceRevision: command.sourceRevision,
    expectedAnchorRevision: command.expectedAnchorRevision,
    selector: command.selector
  })), [{
    type: "save_anchor",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 20, endPage: 21 }
  }, {
    type: "save_anchor",
    sourceRevision: 1,
    expectedAnchorRevision: 1,
    selector: { kind: "page_range", startPage: 22, endPage: 24 }
  }, {
    type: "retire_anchor",
    sourceRevision: undefined,
    expectedAnchorRevision: 2,
    selector: undefined
  }]);
  assert.match(root.innerHTML, /aposentada/u);
});

test("Âncora text_quote rejeita exact vazio e preserva whitespace literal", async () => {
  const writes = [];
  const currentSource = source(1);
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([currentSource], { revision: options.expectedRevision });
        }
        return sourcePage(currentSource, { revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: {
            type: "save_anchor",
            subjectId: input.command.anchorId,
            revision: 1
          }
        };
      }
    }
  });
  const exact = "  primeira linha\nsegunda linha  ";
  const verificationExcerpt = "  trecho conferido\nem contexto  ";

  await panel.open();
  click(root, "open-source", { sourceId: currentSource.sourceId });
  await settle();
  click(root, "add-anchor");
  submit(root, "anchor", {
    selectorKind: "text_quote",
    exact: "",
    prefix: "contexto anterior",
    suffix: "contexto posterior",
    verificationExcerpt: ""
  });
  await settle();
  assert.equal(writes.length, 0);
  assert.match(root.innerHTML, /O trecho exato é obrigatório/u);

  submit(root, "anchor", {
    selectorKind: "text_quote",
    exact,
    prefix: "contexto anterior",
    suffix: "contexto posterior",
    verificationExcerpt
  });
  await settle();

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].command.selector, {
    kind: "text_quote",
    exact,
    prefix: "contexto anterior",
    suffix: "contexto posterior"
  });
  assert.equal(writes[0].command.verificationExcerpt, verificationExcerpt);
});

test("Fonte preserva rascunho e devolve foco ao link ou à citação após validação local", async () => {
  const writes = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        return catalogPage([], { revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        throw new Error("Não deve transportar um formulário inválido.");
      }
    }
  });
  const common = {
    ...sourceFormMetadata({ authorship: "Autoria preservada", language: "pt-BR" }),
    sourceId: "fonte-em-edicao",
    kind: "document",
    title: "Título <a confirmar>",
    citationText: "Citação ainda presente.",
    editionOrVersion: "2ª edição",
    studyVisibility: "citation_and_link"
  };

  await panel.open();
  click(root, "add-source");
  submit(root, "source", { ...common, url: "http://example.test/fonte" });
  await settle();

  assert.equal(writes.length, 0);
  assert.match(root.innerHTML, /Use um link HTTPS válido/u);
  assert.match(root.innerHTML, /value="fonte-em-edicao"/u);
  assert.match(root.innerHTML, /value="Título &lt;a confirmar&gt;"/u);
  assert.match(root.innerHTML, /value="http:\/\/example\.test\/fonte"/u);
  assert.match(root.innerHTML, />Citação ainda presente\.<\/textarea>/u);
  assert.equal(
    root.focusedSelectors.at(-1),
    '[data-source-form="source"] [name="url"]'
  );

  submit(root, "source", {
    ...common,
    citationText: "",
    url: "https://example.test/fonte"
  });
  await settle();

  assert.equal(writes.length, 0);
  assert.match(root.innerHTML, /Informe uma citação para tornar a fonte visível no Estudo/u);
  assert.match(root.innerHTML, /value="https:\/\/example\.test\/fonte"/u);
  assert.match(root.innerHTML, /value="Autoria preservada"/u);
  assert.match(root.innerHTML, /value="2ª edição"/u);
  assert.equal(
    root.focusedSelectors.at(-1),
    '[data-source-form="source"] [name="citationText"]'
  );
});

test("Âncora preserva rascunhos por tipo e foco diante de seletores inválidos", async () => {
  const writes = [];
  const currentSource = source(1);
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([currentSource], { revision: options.expectedRevision });
        }
        return sourcePage(currentSource, { revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        throw new Error("Não deve transportar um formulário inválido.");
      }
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: currentSource.sourceId });
  await settle();
  click(root, "add-anchor");
  submit(root, "anchor", {
    selectorKind: "page_range",
    startPage: "12",
    endPage: "8",
    verificationExcerpt: "Trecho para conferir & manter."
  });
  await settle();

  assert.equal(writes.length, 0);
  assert.match(root.innerHTML, /A página final é inválido/u);
  assert.match(root.innerHTML, /name="startPage"[^>]+value="12"/u);
  assert.match(root.innerHTML, /name="endPage"[^>]+value="8"/u);
  assert.match(root.innerHTML, />Trecho para conferir &amp; manter\.<\/textarea>/u);
  assert.equal(
    root.focusedSelectors.at(-1),
    '[data-source-form="anchor"] [name="endPage"]'
  );

  editForm(root, "change", "anchor", {
    selectorKind: "uri_fragment",
    startPage: "12",
    endPage: "8",
    verificationExcerpt: "Trecho para conferir & manter."
  }, "selectorKind", "[data-source-anchor-kind]");
  submit(root, "anchor", {
    selectorKind: "uri_fragment",
    fragment: "#secao-intro",
    verificationExcerpt: "Trecho para conferir & manter."
  });
  await settle();

  assert.equal(writes.length, 0);
  assert.match(root.innerHTML, /Informe o identificador sem #/u);
  assert.match(root.innerHTML, /name="fragment"[^>]+value="#secao-intro"/u);
  assert.match(root.innerHTML, />Trecho para conferir &amp; manter\.<\/textarea>/u);
  assert.equal(
    root.focusedSelectors.at(-1),
    '[data-source-form="anchor"] [name="fragment"]'
  );

  editForm(root, "change", "anchor", {
    selectorKind: "text_quote",
    fragment: "#secao-intro",
    verificationExcerpt: "Conferência compartilhada."
  }, "selectorKind", "[data-source-anchor-kind]");
  editForm(root, "input", "anchor", {
    selectorKind: "text_quote",
    exact: "Trecho literal importante.",
    prefix: "Antes do trecho.",
    suffix: "Depois do trecho.",
    verificationExcerpt: "Conferência compartilhada."
  }, "exact");
  editForm(root, "change", "anchor", {
    selectorKind: "page_range",
    exact: "Trecho literal importante.",
    prefix: "Antes do trecho.",
    suffix: "Depois do trecho.",
    verificationExcerpt: "Conferência compartilhada."
  }, "selectorKind", "[data-source-anchor-kind]");

  assert.match(root.innerHTML, /name="startPage"[^>]+value="12"/u);
  assert.match(root.innerHTML, /name="endPage"[^>]+value="8"/u);
  assert.match(root.innerHTML, />Conferência compartilhada\.<\/textarea>/u);

  editForm(root, "change", "anchor", {
    selectorKind: "text_quote",
    startPage: "12",
    endPage: "8",
    verificationExcerpt: "Conferência compartilhada."
  }, "selectorKind", "[data-source-anchor-kind]");

  assert.match(root.innerHTML, />Trecho literal importante\.<\/textarea>/u);
  assert.match(root.innerHTML, />Antes do trecho\.<\/textarea>/u);
  assert.match(root.innerHTML, />Depois do trecho\.<\/textarea>/u);
  assert.match(root.innerHTML, />Conferência compartilhada\.<\/textarea>/u);
  assert.equal(
    root.focusedSelectors.at(-1),
    '[data-source-form="anchor"] [name="selectorKind"]'
  );
});

test("formulários contam escalares Unicode e deixam maxlength defensivo para pares UTF-16", async () => {
  const sourceWrites = [];
  const sourceRoot = new FakeRoot();
  const sourcePanel = createCourseSourcesPanel({
    root: sourceRoot,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        return catalogPage([], { revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        sourceWrites.push(structuredClone(input));
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: { type: "save_source", subjectId: input.command.sourceId, revision: 1 }
        };
      }
    }
  });
  await sourcePanel.open();
  click(sourceRoot, "add-source");
  assert.match(sourceRoot.innerHTML, /name="sourceId" maxlength="480"/u);
  assert.match(sourceRoot.innerHTML, /name="title" maxlength="600"/u);
  submit(sourceRoot, "source", {
    ...sourceFormMetadata(),
    sourceId: "fonte-unicode",
    kind: "document",
    title: "🔎".repeat(301),
    citationText: "",
    url: "",
    editionOrVersion: "",
    studyVisibility: "hidden"
  });
  await settle();
  assert.equal(sourceWrites.length, 0);
  assert.match(sourceRoot.innerHTML, /O título é inválido/u);

  submit(sourceRoot, "source", {
    ...sourceFormMetadata(),
    sourceId: "fonte-unicode",
    kind: "document",
    title: "🔎".repeat(300),
    citationText: "",
    url: "",
    editionOrVersion: "",
    studyVisibility: "hidden"
  });
  await settle();
  assert.equal(sourceWrites.length, 1);
  assert.equal([...sourceWrites[0].command.source.title].length, 300);

  const anchorWrites = [];
  const anchorRoot = new FakeRoot();
  const currentSource = source(1);
  const anchorPanel = createCourseSourcesPanel({
    root: anchorRoot,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([currentSource], { revision: options.expectedRevision });
        }
        return sourcePage(currentSource, { revision: options.expectedRevision });
      },
      async mutateCourseSources(input) {
        anchorWrites.push(structuredClone(input));
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          change: { type: "save_anchor", subjectId: input.command.anchorId, revision: 1 }
        };
      }
    }
  });
  await anchorPanel.open();
  click(anchorRoot, "open-source", { sourceId: currentSource.sourceId });
  await settle();
  click(anchorRoot, "add-anchor");
  anchorRoot.listeners.get("change")({
    target: {
      value: "text_quote",
      matches(selector) {
        return selector === "[data-source-anchor-kind]";
      }
    }
  });
  assert.match(anchorRoot.innerHTML, /name="exact" maxlength="8000"/u);
  assert.match(anchorRoot.innerHTML, /name="verificationExcerpt" maxlength="4000"/u);
  submit(anchorRoot, "anchor", {
    selectorKind: "text_quote",
    exact: "🔎".repeat(4_001),
    prefix: "",
    suffix: "",
    verificationExcerpt: ""
  });
  await settle();
  assert.equal(anchorWrites.length, 0);
  assert.match(anchorRoot.innerHTML, /O trecho exato é inválido/u);

  submit(anchorRoot, "anchor", {
    selectorKind: "text_quote",
    exact: "🔎".repeat(4_000),
    prefix: "",
    suffix: "",
    verificationExcerpt: "🧭".repeat(2_001)
  });
  await settle();
  assert.equal(anchorWrites.length, 0);
  assert.match(anchorRoot.innerHTML, /O trecho de verificação é inválido/u);

  submit(anchorRoot, "anchor", {
    selectorKind: "text_quote",
    exact: "🔎".repeat(4_000),
    prefix: "",
    suffix: "",
    verificationExcerpt: "🧭".repeat(2_000)
  });
  await settle();
  assert.equal(anchorWrites.length, 1);
  assert.equal([...anchorWrites[0].command.selector.exact].length, 4_000);
  assert.equal([...anchorWrites[0].command.verificationExcerpt].length, 2_000);
});

test("atribuição nova sem Âncora ativa é recusada antes do transporte", async () => {
  const writes = [];
  const currentSource = source(1, { anchorCount: 0 });
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "target",
    targetKind: "plan_item",
    targetId: PLAN_ITEM_ID,
    targetVersion: 3,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([currentSource], { revision: options.expectedRevision });
        }
        if (options.mode === "source") {
          return {
            ...sourcePage(currentSource, { revision: options.expectedRevision }),
            items: [{ ...currentSource, actorId: null, anchors: [], attachments: [] }]
          };
        }
        return {
          ...targetPage({ revision: options.expectedRevision }),
          items: []
        };
      },
      async mutateCourseSources(input) {
        writes.push(structuredClone(input));
        throw new Error("Não deve transportar.");
      }
    }
  });

  await panel.open();
  click(root, "add-target-source", { sourceId: currentSource.sourceId });
  await settle();
  click(root, "save-target");
  await settle();

  assert.equal(writes.length, 0);
  assert.match(root.innerHTML, /ao menos uma âncora exata/u);
});

test("painel envia PDF da revisão ativa e baixa o vínculo exato por URL assinada", async () => {
  const root = new FakeRoot();
  const current = source(1);
  const file = {
    name: "fonte.pdf",
    size: 1_024,
    type: "application/pdf",
    async arrayBuffer() {
      return new ArrayBuffer(1_024);
    }
  };
  const attachment = {
    contentHash: "a".repeat(64),
    byteSize: 1_024,
    mediaType: "application/pdf",
    storagePath: `${COURSE_ID}/${"a".repeat(64)}.pdf`,
    actorId: "40000000-0000-4000-8000-000000000004",
    createdAt: "2026-08-20T12:00:00.000Z"
  };
  const uploads = [];
  const downloads = [];
  const opened = [];
  let courseRevision = 5;
  let attachments = [];
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision,
    downloadUrl: (url, value) => opened.push({ url, value }),
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([current], { revision: options.expectedRevision });
        }
        return sourcePage({ ...current, attachments }, { revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new Error("Não deve usar o comando genérico.");
      },
      async uploadCourseSourcePdf(value) {
        uploads.push(value);
        attachments = [attachment];
        courseRevision += 1;
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision,
          requestId: value.requestId,
          idempotent: false,
          changed: true,
          change: { type: "attach_pdf", subjectId: current.sourceId, revision: 1 }
        };
      },
      async getCourseSourceAttachmentDownload(value) {
        downloads.push(value);
        return {
          signedUrl: "https://storage.example.test/file.pdf?token=sealed"
        };
      }
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: current.sourceId });
  await settle();
  assert.match(root.innerHTML, /data-source-pdf-input/u);
  assert.match(root.innerHTML, /<dt>Autoria<\/dt><dd>Autoria<\/dd>/u);
  assert.match(root.innerHTML, /<dt>Publicação<\/dt><dd>2026<\/dd>/u);
  assert.match(root.innerHTML, /<dt>Idioma<\/dt><dd>pt-BR<\/dd>/u);
  assert.match(root.innerHTML, /<dt>Origem<\/dt><dd>Fonte externa<\/dd>/u);

  change(root, "[data-source-pdf-input]", { files: [file] });
  await settle();
  await settle();
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].file, file);
  assert.equal(uploads[0].sourceRevision, 1);
  assert.match(root.innerHTML, /Baixar PDF/u);
  assert.match(root.innerHTML, /1 KiB/u);

  click(root, "download-attachment", {
    sourceRevision: "1",
    contentHash: attachment.contentHash
  });
  await settle();
  assert.deepEqual(downloads, [{
    courseId: COURSE_ID,
    expectedCourseRevision: 6,
    sourceId: current.sourceId,
    sourceRevision: 1,
    contentHash: attachment.contentHash
  }]);
  assert.equal(opened[0].url, "https://storage.example.test/file.pdf?token=sealed");
  assert.deepEqual(opened[0].value, attachment);
});

test("PDF distingue TypeError de transporte e repete naturalmente o envelope preservado", async () => {
  const root = new FakeRoot();
  const current = source(1);
  const file = {
    name: "fonte.pdf",
    size: 1_024,
    type: "application/pdf",
    lastModified: 1_787_000_000_000
  };
  const invalidFile = {
    name: "fonte.txt",
    size: 32,
    type: "text/plain",
    lastModified: 1_787_000_000_001
  };
  const uploads = [];
  let courseRevision = 5;
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision,
    controller: { ...annotationController(),
      async loadCourseSources(courseId, options) {
        return options.mode === "catalog"
          ? catalogPage([current], { revision: options.expectedRevision })
          : sourcePage(current, { revision: options.expectedRevision });
      },
      async mutateCourseSources() {
        throw new Error("Não deve usar o comando genérico.");
      },
      async uploadCourseSourcePdf(value) {
        uploads.push(value);
        if (uploads.length === 1) throw new TypeError("Failed to fetch");
        if (uploads.length === 3) throw new TypeError("O arquivo precisa ser um PDF válido.");
        courseRevision += 1;
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision,
          requestId: value.requestId,
          idempotent: uploads.length === 2,
          changed: true,
          change: { type: "attach_pdf", subjectId: current.sourceId, revision: 1 }
        };
      }
    }
  });

  await panel.open();
  click(root, "open-source", { sourceId: current.sourceId });
  await settle();
  change(root, "[data-source-pdf-input]", { files: [file] });
  await settle();
  assert.match(root.innerHTML, /Confirmar o mesmo PDF/u);
  assert.match(root.innerHTML, /mesmo requestId/u);
  assert.equal(panel.hasPendingDraft(), true);

  change(root, "[data-source-pdf-input]", { files: [file] });
  await settle();
  await settle();
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].requestId, uploads[1].requestId);
  assert.equal(uploads[0].file, file);
  assert.equal(uploads[1].file, file);
  assert.equal(uploads[0].sourceId, uploads[1].sourceId);
  assert.equal(uploads[0].sourceRevision, uploads[1].sourceRevision);
  assert.doesNotMatch(root.innerHTML, /Confirmar o mesmo PDF/u);
  assert.equal(panel.hasPendingDraft(), false);

  change(root, "[data-source-pdf-input]", { files: [invalidFile] });
  await settle();
  assert.equal(uploads.length, 3);
  assert.match(root.innerHTML, /O arquivo precisa ser um PDF válido/u);
  assert.doesNotMatch(root.innerHTML, /Confirmar o mesmo PDF/u);
  assert.equal(panel.hasPendingDraft(), false);
});
