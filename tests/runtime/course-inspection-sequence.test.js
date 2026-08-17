import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_INSPECTION_MAX_WINDOW_ITEMS,
  COURSE_INSPECTION_PAGE_SIZE,
  createCourseInspectionSequence,
  inspectionRequestFromTarget,
  normalizeCourseInspectionPage
} from "../../src/ui/CourseInspectionSequence.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const REVISION = 7;

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakeWindow {
  constructor() {
    this.listeners = new Map();
    this.scrolls = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  scrollBy(value) {
    this.scrolls.push(value);
  }

  matchMedia() {
    return { matches: false };
  }
}

class FakeBroadcastChannel {
  static instances = [];

  constructor(name) {
    this.name = name;
    this.listener = null;
    this.messages = [];
    this.closed = false;
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(type, listener) {
    if (type === "message") this.listener = listener;
  }

  removeEventListener(type, listener) {
    if (type === "message" && this.listener === listener) this.listener = null;
  }

  postMessage(value) {
    this.messages.push(structuredClone(value));
  }

  close() {
    this.closed = true;
  }
}

function studyUnit(index) {
  return {
    id: `unit-${String(index).padStart(2, "0")}`,
    position: index,
    title: `Unidade ${index}`,
    role: "theory",
    content: [{
      id: `paragraph-${index}`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: `Conteúdo curricular ${index}.` }
    }],
    response: null,
    feedback: [],
    topics: []
  };
}

function inspectionItem(index) {
  return {
    studyUnit: studyUnit(index),
    version: 1,
    updatedAt: "2026-08-17T12:00:00Z",
    ordinal: index,
    curriculumPath: {
      module: { id: "module-a", position: 0, title: "Fundamentos" },
      lesson: { id: "lesson-a", position: 0, title: "Relações" },
      didacticMicrosequence: {
        id: "micro-a",
        position: 0,
        title: "Relações essenciais"
      }
    },
    authoringPart: {
      id: PART_ID,
      position: 0,
      title: "Parte inicial",
      state: "materialized"
    },
    deepLink: `#/authoring/courses/${COURSE_ID}?section=inspection&studyUnitId=unit-${String(index).padStart(2, "0")}`
  };
}

function anchoredAnnotation(index) {
  const annotationId = `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId,
    annotationVersion: 1,
    courseId: COURSE_ID,
    provenance: { origin: "learner", channel: "study_interface" },
    contributor: { kind: "self", role: "learner", ref: "self", label: "Você" },
    target: {
      kind: "study_unit",
      id: "unit-01",
      observedPath: [
        { kind: "course", id: COURSE_ID, label: "Curso", version: REVISION },
        { kind: "study_unit", id: "unit-01", label: "Unidade 1", version: 1 }
      ],
      currentAvailable: true,
      currentPath: [
        { kind: "course", id: COURSE_ID, label: "Curso", version: REVISION },
        { kind: "study_unit", id: "unit-01", label: "Unidade 1", version: 1 }
      ],
      deepLink: `#/authoring/courses/${COURSE_ID}?section=inspection&studyUnitId=unit-01`
    },
    observedRevision: { certainty: "known", courseRevision: REVISION, targetVersion: 1 },
    rawText: `Observação da página ${index}.`,
    category: null,
    briefSummary: null,
    subjectClassification: {
      status: "unclassified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: REVISION,
        subjects: []
      },
      effective: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: REVISION,
        subjects: []
      },
      correctedAt: null
    },
    state: "open",
    ownerResponse: null,
    timestamps: {
      capturedAt: "2026-08-17T14:00:00.000Z",
      createdAt: "2026-08-17T14:00:00.000Z",
      updatedAt: "2026-08-17T14:00:00.000Z",
      firstConsideredAt: null,
      respondedAt: null,
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
    deepLink: `#/authoring/courses/${COURSE_ID}?section=observations&annotationId=${annotationId}`
  };
}

function pageFor(options, totalCount = 60) {
  const all = Array.from({ length: totalCount }, (_, index) => inspectionItem(index + 1));
  const cursorIndex = options.cursor
    ? all.findIndex(({ studyUnit: value }) => value.id === options.cursor.studyUnitId)
    : -1;
  const anchorIndex = options.anchorStudyUnitId
    ? all.findIndex(({ studyUnit: value }) => value.id === options.anchorStudyUnitId)
    : -1;
  let start;
  let items;
  if (options.direction === "backward" && cursorIndex >= 0) {
    start = Math.max(0, cursorIndex - options.limit);
    items = all.slice(start, cursorIndex);
  } else {
    start = cursorIndex >= 0 ? cursorIndex + 1 : Math.max(0, anchorIndex);
    items = all.slice(start, start + options.limit);
  }
  const end = start + items.length;
  return {
    contract: "aralearn.course-study-unit-inspection-page.v1",
    courseId: COURSE_ID,
    courseRevision: REVISION,
    scope: options.scope,
    totalCount,
    scopeOptions: {
      authoringParts: [{
        id: PART_ID,
        position: 0,
        title: "Parte inicial",
        state: "materialized"
      }],
      unassignedStudyUnitCount: 0
    },
    items,
    hasPrevious: start > 0,
    hasMore: end < totalCount,
    previousCursor: start > 0 ? { studyUnitId: items[0].studyUnit.id } : null,
    nextCursor: end < totalCount ? { studyUnitId: items.at(-1).studyUnit.id } : null,
    pageBytes: 16_384
  };
}

function controllerFixture(overrides = {}) {
  const calls = [];
  const controller = {
    calls,
    async loadAuthoringStudyUnits(courseId, options) {
      calls.push({ courseId, options: structuredClone(options) });
      return pageFor(options);
    },
    async loadAuthoringInspectionPosition() {
      return null;
    },
    async saveAuthoringInspectionPosition() {
      return undefined;
    },
    ...overrides
  };
  return controller;
}

test("normaliza o DTO paginado exato e recusa revisão, ordem ou campos extras", () => {
  const options = {
    expectedRevision: REVISION,
    scope: { kind: "course", id: null },
    cursor: null,
    direction: "forward",
    limit: COURSE_INSPECTION_PAGE_SIZE,
    maxBytes: 1_500_000
  };
  const value = pageFor(options);
  const page = normalizeCourseInspectionPage(value, {
    expectedCourseId: COURSE_ID,
    expectedRevision: REVISION,
    expectedScope: options.scope
  });
  assert.equal(page.items.length, 12);
  assert.equal(page.items[0].studyUnit.id, "unit-01");
  assert.equal(page.nextCursor.studyUnitId, "unit-12");

  assert.throws(() => normalizeCourseInspectionPage({ ...value, extra: true }), /página/u);
  assert.throws(() => normalizeCourseInspectionPage({ ...value, courseRevision: 8 }, {
    expectedRevision: REVISION
  }), /mudou/u);
  assert.throws(() => normalizeCourseInspectionPage({
    ...value,
    items: [value.items[1], value.items[0]]
  }), /ordem/u);
});

test("traduz cada alvo de rota para um único scope ou âncora", () => {
  assert.deepEqual(inspectionRequestFromTarget(null), {
    scope: { kind: "course", id: null },
    anchorStudyUnitId: null
  });
  assert.deepEqual(inspectionRequestFromTarget({ kind: "study_unit", id: "unit-20" }), {
    scope: { kind: "course", id: null },
    anchorStudyUnitId: "unit-20"
  });
  assert.deepEqual(inspectionRequestFromTarget({ kind: "authoring_part", id: PART_ID }), {
    scope: { kind: "authoring_part", id: PART_ID },
    anchorStudyUnitId: null
  });
});

test("pagina de 12 em 12 e conserva uma janela curricular de no máximo 36 artigos", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture();
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null },
    navigatorValue: null
  });

  assert.equal(await sequence.open(), true);
  assert.equal((root.innerHTML.match(/data-inspection-study-unit=/gu) || []).length, 12);
  await sequence.loadMore("forward");
  await sequence.loadMore("forward");
  await sequence.loadMore("forward");
  assert.equal((root.innerHTML.match(/data-inspection-study-unit=/gu) || []).length,
    COURSE_INSPECTION_MAX_WINDOW_ITEMS);
  assert.doesNotMatch(root.innerHTML, /data-inspection-study-unit="unit-01"/u);
  assert.match(root.innerHTML, /data-inspection-study-unit="unit-13"/u);
  assert.equal(sequence.snapshot().itemCount, 36);
  assert.equal(controller.calls.length, 4);
  controller.calls.forEach(({ courseId, options }) => {
    assert.equal(courseId, COURSE_ID);
    assert.equal(options.expectedRevision, REVISION);
    assert.equal(options.limit, 12);
    assert.equal(options.maxBytes, 1_500_000);
    assert.deepEqual(options.scope, { kind: "course", id: null });
  });
  sequence.destroy();
});

test("posição local removida rebasa no Curso; alvo explícito removido permanece visível", async () => {
  const localRoot = new FakeRoot();
  const localCalls = [];
  const localController = controllerFixture({
    async loadAuthoringInspectionPosition() {
      return {
        scope: { kind: "authoring_part", id: PART_ID },
        studyUnitId: "unit-30",
        offsetFromStickyTop: 18,
        courseRevision: REVISION - 1
      };
    },
    async loadAuthoringStudyUnits(courseId, options) {
      localCalls.push(structuredClone(options));
      if (options.scope.kind === "authoring_part") {
        const error = new Error("Parte removida");
        error.code = "not_found";
        throw error;
      }
      return pageFor(options);
    }
  });
  const localSequence = createCourseInspectionSequence({
    root: localRoot,
    controller: localController,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  assert.equal(await localSequence.open(), true);
  assert.deepEqual(localCalls.map(({ scope }) => scope.kind), ["authoring_part", "course"]);
  assert.match(localRoot.innerHTML, /data-inspection-study-unit="unit-01"/u);
  localSequence.destroy();

  const explicitRoot = new FakeRoot();
  const explicitSequence = createCourseInspectionSequence({
    root: explicitRoot,
    controller: controllerFixture({
      async loadAuthoringStudyUnits() {
        const error = new Error("Unidade removida");
        error.status = 404;
        throw error;
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "study_unit", id: "unit-99" },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  assert.equal(await explicitSequence.open(), false);
  assert.match(explicitRoot.innerHTML, /Ponto não encontrado/u);
  assert.match(explicitRoot.innerHTML, /Ir ao início da inspeção/u);
  explicitSequence.destroy();
});

test("revisão nova mantém deep link removido como Ponto não encontrado", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture({
    async loadAuthoringStudyUnits(courseId, options) {
      if (options.expectedRevision === REVISION + 1) {
        const error = new Error("Unidade removida na nova revisão");
        error.code = "PT404";
        throw error;
      }
      return pageFor(options);
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "study_unit", id: "unit-20" },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  assert.equal(await sequence.open(), true);
  assert.equal(await sequence.refresh(REVISION + 1), false);
  assert.match(root.innerHTML, /Ponto não encontrado/u);
  assert.equal(sequence.snapshot().courseRevision, REVISION + 1);
  sequence.destroy();
});

test("sincroniza abas só por sinal e relê a posição local antes de reancorar", async () => {
  FakeBroadcastChannel.instances.length = 0;
  let persistedPosition = null;
  let positionReads = 0;
  const controller = controllerFixture({
    async loadAuthoringInspectionPosition() {
      positionReads += 1;
      return persistedPosition;
    },
    async saveAuthoringInspectionPosition(courseId, position) {
      assert.equal(courseId, COURSE_ID);
      persistedPosition = structuredClone(position);
    }
  });
  const windowValue = new FakeWindow();
  windowValue.BroadcastChannel = FakeBroadcastChannel;
  const sequence = createCourseInspectionSequence({
    root: new FakeRoot(),
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue,
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  const channel = FakeBroadcastChannel.instances[0];
  assert.equal(channel.name, "aralearn.course-authoring-inspection.v1");
  assert.equal(await sequence.savePosition(), true);
  assert.deepEqual(channel.messages, [{
    courseId: COURSE_ID,
    revision: REVISION,
    studyUnitId: "unit-01"
  }]);

  persistedPosition = {
    scope: { kind: "course", id: null },
    studyUnitId: "unit-25",
    offsetFromStickyTop: 14,
    courseRevision: REVISION
  };
  const readsBeforeSignal = positionReads;
  const callsBeforeSignal = controller.calls.length;
  await channel.listener({
    data: {
      courseId: COURSE_ID,
      revision: REVISION,
      studyUnitId: "unit-25",
      page: "conteúdo proibido"
    }
  });
  assert.equal(positionReads, readsBeforeSignal);
  assert.equal(controller.calls.length, callsBeforeSignal);

  await channel.listener({
    data: {
      courseId: COURSE_ID,
      revision: REVISION,
      studyUnitId: "unit-25"
    }
  });
  assert.equal(positionReads, readsBeforeSignal + 1);
  assert.equal(controller.calls.at(-1).options.anchorStudyUnitId, "unit-25");
  assert.equal(sequence.snapshot().studyUnitId, "unit-25");

  sequence.destroy();
  assert.equal(channel.closed, true);
});

test("Inspeção abre atribuição completa da versão exata da Unidade", async () => {
  const root = new FakeRoot();
  const targets = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: {
      courseId: COURSE_ID,
      revision: REVISION,
      ownership: "owned",
      canEdit: true
    },
    onEditSources(target) {
      targets.push(target);
    },
    windowValue: new FakeWindow(),
    documentValue: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    navigatorValue: {}
  });
  await sequence.open();
  assert.match(root.innerHTML, /data-inspection-edit-sources/u);

  const node = {
    dataset: { studyUnitId: "unit-01" },
    closest(selector) {
      return selector === "[data-inspection-edit-sources]" ? this : null;
    }
  };
  await root.listeners.get("click")({ target: node, preventDefault() {} });
  assert.deepEqual(targets, [{
    targetKind: "study_unit",
    targetId: "unit-01",
    targetVersion: 1,
    targetLabel: "Unidade 1"
  }]);
  sequence.destroy();
});

test("Inspeção evita N+1 decorativo e conta somente ao abrir o composer contextual", async () => {
  const root = new FakeRoot();
  const annotationCalls = [];
  const controller = controllerFixture({
    async loadCourseAnchoredAnnotations(courseId, options) {
      annotationCalls.push({ courseId, options: structuredClone(options) });
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: COURSE_ID,
        courseRevision: REVISION,
        annotationSetVersion: 3,
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
      throw new Error("Não deve alterar neste teste.");
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null },
    navigatorValue: null
  });
  await sequence.open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(root.innerHTML, /<\/header><div class="course-inspection-item-actions"/u);
  assert.match(root.innerHTML, /<span>Observações<\/span>/u);
  assert.equal(annotationCalls.length, 0);

  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-observations]"
          ? { dataset: { studyUnitId: "unit-01" } }
          : null;
      }
    }
  });
  assert.match(root.innerHTML, /Observações da Unidade/u);
  assert.match(root.innerHTML, /data-observation-composer/u);
  assert.match(root.innerHTML, /Nova observação/u);
  assert.match(root.innerHTML, /Observações · 0/u);
  assert.equal(annotationCalls.length, 1);
  assert.equal(annotationCalls[0].options.limit, 24);
  assert.equal(annotationCalls[0].options.query.mode, "target");
  assert.deepEqual(annotationCalls[0].options.query.states, []);

  const counter = { textContent: "" };
  root.querySelector = (selector) => selector === "#study-observation-counter" ? counter : null;
  root.listeners.get("input")({
    target: {
      value: "😀a",
      matches(selector) { return selector === "[data-field='study-unit-observation']"; }
    }
  });
  assert.equal(counter.textContent, "2/2.000 caracteres · 5 B/16 KiB");
  sequence.destroy();
});

test("Inspeção agrega sete páginas byte-limited antes de renderizar o contexto", async () => {
  const root = new FakeRoot();
  const cursors = [];
  const controller = controllerFixture({
    async loadCourseAnchoredAnnotations(_courseId, options) {
      cursors.push(options.cursor);
      const index = options.cursor === null ? 0 : Number(options.cursor.replace("cursor", ""));
      const hasMore = index < 6;
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: COURSE_ID,
        courseRevision: REVISION,
        annotationSetVersion: 3,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: 7,
          byOrigin: { learner: 7 },
          byChannel: { study_interface: 7 },
          byState: { open: 7 },
          unclassifiedTotal: 7
        },
        items: [anchoredAnnotation(index + 1)],
        hasMore,
        nextCursor: hasMore ? `cursor${index + 1}` : null
      };
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null },
    navigatorValue: null
  });
  await sequence.open();
  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-observations]"
          ? { dataset: { studyUnitId: "unit-01" } }
          : null;
      }
    }
  });

  assert.deepEqual(cursors, [null, "cursor1", "cursor2", "cursor3", "cursor4", "cursor5", "cursor6"]);
  assert.match(root.innerHTML, /Observações · 7/u);
  assert.match(root.innerHTML, /Observação da página 7\./u);
  sequence.destroy();
});

test("Inspeção limita a amostra owner em 128 sem confundir quota por ator", async () => {
  const root = new FakeRoot();
  const cursors = [];
  const controller = controllerFixture({
    async loadCourseAnchoredAnnotations(_courseId, options) {
      cursors.push(options.cursor);
      const index = options.cursor === null ? 0 : Number(options.cursor.replace("cursor", ""));
      const annotation = anchoredAnnotation(index + 1);
      annotation.contributor = {
        kind: "protected_person",
        role: "learner",
        ref: "person-0123456789abcdef",
        label: index < 128 ? "Estudante A" : "Estudante B"
      };
      const hasMore = index < 128;
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: COURSE_ID,
        courseRevision: REVISION,
        annotationSetVersion: 3,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: 129,
          byOrigin: { learner: 129 },
          byChannel: { study_interface: 129 },
          byState: { open: 129 },
          unclassifiedTotal: 129
        },
        items: [annotation],
        hasMore,
        nextCursor: hasMore ? `cursor${index + 1}` : null
      };
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null },
    navigatorValue: null
  });
  await sequence.open();
  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-observations]"
          ? { dataset: { studyUnitId: "unit-01" } }
          : null;
      }
    }
  });

  assert.equal(cursors.length, 128);
  assert.equal(cursors.at(-1), "cursor127");
  assert.match(root.innerHTML, /Observações · 129/u);
  assert.match(root.innerHTML, /Exibindo 128 de 129 observações correspondentes; 129 ativas/u);
  assert.match(root.innerHTML, /Abrir todas na área Observações/u);
  assert.match(root.innerHTML, /section=observations/u);
  assert.match(root.innerHTML, /Observação da página 128\./u);
  assert.doesNotMatch(root.innerHTML, /Estudante B/u);
  sequence.destroy();
});

test("Inspeção recusa cursor repetido sem renderizar inbox parcial", async () => {
  const root = new FakeRoot();
  let reads = 0;
  const controller = controllerFixture({
    async loadCourseAnchoredAnnotations(_courseId, options) {
      reads += 1;
      return {
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: COURSE_ID,
        courseRevision: REVISION,
        annotationSetVersion: 3,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: 3,
          byOrigin: { learner: 3 },
          byChannel: { study_interface: 3 },
          byState: { open: 3 },
          unclassifiedTotal: 3
        },
        items: [anchoredAnnotation(reads)],
        hasMore: true,
        nextCursor: "cursor-repetido"
      };
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null },
    navigatorValue: null
  });
  await sequence.open();
  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-observations]"
          ? { dataset: { studyUnitId: "unit-01" } }
          : null;
      }
    }
  });

  assert.equal(reads, 2);
  assert.match(root.innerHTML, /não avançou de forma válida/u);
  assert.doesNotMatch(root.innerHTML, /Observação da página 1\./u);
  sequence.destroy();
});
