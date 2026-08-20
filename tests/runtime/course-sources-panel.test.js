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
    "aralearn.course-source-observations-export.v1");
  assert.deepEqual(exports[0].value.items.find(({ annotationId }) =>
    annotationId === reformulated.annotationId
  ).ownerResponse.consideredSourceLinks, consideredSourceLinks);
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
    confirmValue: () => true,
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
