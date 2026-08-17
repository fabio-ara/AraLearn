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
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
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
    citationText: `Autoria. Fonte ${index}. 2026.`,
    url: `https://example.test/source-${index}`,
    editionOrVersion: null,
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

function catalogPage(items, { revision = 5, nextCursor = null } = {}) {
  return {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: revision,
    mode: "catalog",
    query: { sourceId: null, targetKind: null, targetId: null },
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
    items: [{ ...value, actorId: null, anchors: [anchor({ sourceRevision: value.revision })] }],
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
  const form = {
    elements: Object.fromEntries(Object.entries(values).map(([name, value]) => [
      name,
      { value }
    ])),
    matches(selector) {
      return selector === `[data-source-form="${kind}"]`;
    }
  };
  root.listeners.get("submit")({ target: form, preventDefault() {} });
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
    controller: {
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
    controller: {
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

test("retry ambíguo conserva exatamente requestId e comando sem formulário JSON", async () => {
  const writes = [];
  let currentRevision = 5;
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: currentRevision,
    controller: {
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
  click(root, "retry-command");
  await settle();

  assert.equal(writes.length, 2);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.deepEqual(writes[0].command, writes[1].command);
  assert.equal(writes[0].command.expectedSourceRevision, 0);
  assert.equal(writes[0].command.source.studyVisibility, "citation");
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
    controller: {
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
    controller: {
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
            })]
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

test("catálogo cria, revisa e aposenta a Fonte por comandos versionados naturais", async () => {
  const writes = [];
  let courseRevision = 5;
  let current = null;
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision,
    confirmValue: () => true,
    controller: {
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          const catalogItem = current ? structuredClone(current) : null;
          if (catalogItem) {
            delete catalogItem.actorId;
            delete catalogItem.anchors;
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
            anchors: []
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
    citationText: null,
    url: null,
    editionOrVersion: null,
    studyVisibility: "hidden",
    anchorCount: 0
  });
  const writes = [];
  const root = new FakeRoot();
  const panel = createCourseSourcesPanel({
    root,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: {
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
          items: [{ ...unresolved, actorId: null, anchors: [] }],
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
    confirmValue: () => true,
    controller: {
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
          items: [{
            ...base,
            anchorCount: anchors.filter(({ status }) => status === "active").length,
            actorId: null,
            anchors: structuredClone(anchors)
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
  click(root, "retire-anchor", { anchorId, anchorRevision: "2" });
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
    controller: {
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

test("formulários contam escalares Unicode e deixam maxlength defensivo para pares UTF-16", async () => {
  const sourceWrites = [];
  const sourceRoot = new FakeRoot();
  const sourcePanel = createCourseSourcesPanel({
    root: sourceRoot,
    courseId: COURSE_ID,
    courseRevision: 5,
    controller: {
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
    controller: {
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
    controller: {
      async loadCourseSources(courseId, options) {
        if (options.mode === "catalog") {
          return catalogPage([currentSource], { revision: options.expectedRevision });
        }
        if (options.mode === "source") {
          return {
            ...sourcePage(currentSource, { revision: options.expectedRevision }),
            items: [{ ...currentSource, actorId: null, anchors: [] }]
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
