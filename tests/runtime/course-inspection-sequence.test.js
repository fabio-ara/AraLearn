import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_INSPECTION_MAX_WINDOW_ITEMS,
  COURSE_INSPECTION_PAGE_SIZE,
  buildCourseInspectionSearchIndex,
  createCourseInspectionSequence,
  inspectionRequestFromTarget,
  normalizeCourseInspectionPage,
  searchCourseInspectionIndex
} from "../../src/ui/CourseInspectionSequence.js";
import { renderPackageStudyUnitBlocksWithDock } from
  "../../src/render/renderPackageStudyUnit.js";
import { renderUiIcon } from "../../src/ui/renderUiIcons.js";

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

function designSnapshot({ ceiling = 2 } = {}) {
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
        value: ["plain_definition", "concrete_example"],
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
    guidance: [{
      guidance: "Usar exemplos contrastivos.",
      origin: "author",
      sourceScopeKind: "course"
    }],
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
    authorship: {
      pendingObservationCount: 0,
      production: {
        materializationId: "30000000-0000-4000-8000-000000000003",
        recordedAt: "2026-08-17T12:00:00Z",
        state: "produced",
        currentMaterialization: true
      },
      design: {
        used: designSnapshot(),
        current: designSnapshot(),
        state: "current"
      }
    },
    deepLink: `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=unit-${String(index).padStart(2, "0")}`
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
    contract: "aralearn.course-study-unit-inspection-page.v2",
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

function courseDocument(totalCount = 60) {
  return {
    document: {
      courses: [{
        id: COURSE_ID,
        position: 0,
        modules: [{
          id: "module-a",
          position: 0,
          title: "Fundamentos",
          lessons: [{
            id: "lesson-a",
            position: 0,
            title: "Relações",
            microsequences: [{
              id: "micro-a",
              position: 0,
              title: "Relações essenciais",
              studyUnits: Array.from({ length: totalCount }, (_, index) => studyUnit(index + 1))
            }]
          }]
        }]
      }]
    }
  };
}

function controllerFixture(overrides = {}, { totalCount = 60 } = {}) {
  const calls = [];
  const documentCalls = [];
  const controller = {
    calls,
    documentCalls,
    async loadAuthoringStudyUnits(courseId, options) {
      calls.push({ courseId, options: structuredClone(options) });
      return pageFor(options, totalCount);
    },
    async loadCourseDocument(courseId, options) {
      documentCalls.push({ courseId, options: structuredClone(options) });
      return courseDocument(totalCount);
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

test("índice curricular pesquisa hierarquia sem acento e prioriza título, caminho e ordinal", () => {
  const source = courseDocument(40).document;
  const course = source.courses[0];
  course.title = "Curso de Decisão";
  course.modules[0].lessons[0].microsequences[0].studyUnits[4].title = "Árvore de decisão";
  const index = buildCourseInspectionSearchIndex(source, COURSE_ID);

  assert.equal(searchCourseInspectionIndex(index, "arvore de decisao")[0].id, "unit-05");
  assert.equal(searchCourseInspectionIndex(index, "relacoes essenciais")[0].kind,
    "didactic_microsequence");
  assert.equal(searchCourseInspectionIndex(index, "40")[0].id, "unit-40");
  assert.equal(searchCourseInspectionIndex(index, "unidade 40")[0].id, "unit-40");
  assert.equal(searchCourseInspectionIndex(index, "curso de")[0].kind, "course");
  const contentMatch = searchCourseInspectionIndex(index, "curricular 17")[0];
  assert.equal(contentMatch.id, "unit-17");
  assert.match(contentMatch.matchExcerpt, /Conteúdo curricular 17/u);
});

test("índice curricular preserva a ordem canônica do documento sem posições estruturais", () => {
  const source = courseDocument(1).document;
  const course = source.courses[0];
  delete course.modules[0].position;
  delete course.modules[0].lessons[0].position;
  delete course.modules[0].lessons[0].microsequences[0].position;
  course.modules.push({
    id: "a-module",
    title: "Segundo módulo",
    lessons: [{
      id: "a-lesson",
      title: "Segunda lição",
      microsequences: [{
        id: "a-microsequence",
        title: "Segunda microssequência",
        studyUnits: [{ ...studyUnit(2), id: "unit-second" }]
      }]
    }]
  });
  course.modules[0].id = "z-module";
  course.modules[0].lessons[0].id = "z-lesson";
  course.modules[0].lessons[0].microsequences[0].id = "z-microsequence";
  course.modules[0].lessons[0].microsequences[0].studyUnits[0].id = "unit-first";

  const index = buildCourseInspectionSearchIndex(source, COURSE_ID);

  assert.equal(searchCourseInspectionIndex(index, "unidade 1")[0].id, "unit-first");
  assert.equal(searchCourseInspectionIndex(index, "unidade 2")[0].id, "unit-second");
});

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
  assert.deepEqual(inspectionRequestFromTarget({ kind: "inspection_focus", id: PART_ID }), {
    scope: { kind: "course", id: null },
    anchorStudyUnitId: null,
    inspectionFocusId: PART_ID
  });
});

test("foco mostra somente o conjunto e oferece saída para o Curso no ponto corrente", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture({
    async loadAuthoringStudyUnits(_courseId, options) {
      assert.equal(options.inspectionFocusId, PART_ID);
      const page = pageFor(options, 3);
      page.inspectionFocus = {
        id: PART_ID,
        title: "Microssequência · Relações essenciais",
        deepLink: `https://fabio-ara.github.io/AraLearn/#/authoring/courses/${COURSE_ID}?section=content&inspectionFocusId=${PART_ID}`,
        requestedCount: 3,
        availableCount: 3,
        missingStudyUnitIds: []
      };
      return page;
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "inspection_focus", id: PART_ID },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null },
    navigatorValue: null
  });

  assert.equal(await sequence.open(), true);
  assert.match(root.innerHTML, /Filtro de inspeção ativo/u);
  assert.match(root.innerHTML, /Microssequência · Relações essenciais/u);
  assert.match(root.innerHTML, /3 Unidades/u);
  assert.match(root.innerHTML, /data-inspection-exit-focus/u);
  assert.match(root.innerHTML, /section=content&amp;studyUnitId=unit-01/u);
  assert.doesNotMatch(root.innerHTML, /inspectionFocusId=20000000/u);
  sequence.destroy();
});

test("menu situado preserva observações e produção; desenho mostra usado versus vigente sem hashes", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture({
    async loadAuthoringStudyUnits(_courseId, options) {
      const page = pageFor(options, 2);
      page.items[0].authorship.pendingObservationCount = 2;
      page.items[0].authorship.design.current = designSnapshot({ ceiling: 3 });
      page.items[0].authorship.design.state = "changed";
      return page;
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

  assert.equal(await sequence.open(), true);
  assert.match(root.innerHTML, /class="course-inspection-item-menu"[^>]*aria-label="Mais ações para Unidade 1"/u);
  assert.match(root.innerHTML, /<span>Observações · 2<\/span>/u);
  assert.match(root.innerHTML, /data-inspection-review-state="observations"[^>]*aria-label="2 observações pendentes"/u);
  assert.match(root.innerHTML, /data-inspection-review-state="design"[^>]*aria-label="Desenho vigente diferente — revisar"/u);
  assert.match(root.innerHTML, /data-inspection-review-state="materialization"[^>]*aria-label="Materialização atual — revisar"/u);
  assert.match(root.innerHTML, /Desenho usado nesta versão × vigente agora/u);
  assert.match(root.innerHTML, /Usado nesta versão/u);
  assert.match(root.innerHTML, /Vigente agora/u);
  assert.match(root.innerHTML, />2<\/span>/u);
  assert.match(root.innerHTML, />3<\/span>/u);
  assert.match(root.innerHTML, /data-inspection-control-key="production:unit-01"/u);
  assert.match(root.innerHTML, /section=planning&amp;authoringPartId=20000000-0000-4000-8000-000000000002&amp;materializationId=30000000-0000-4000-8000-000000000003/u);
  assert.match(root.innerHTML, /<span>Produção<\/span>/u);
  assert.doesNotMatch(root.innerHTML, new RegExp("a{64}|b{64}", "u"));
  sequence.destroy();
});

test("observa e libera o rolador real da Autoria em vez da janela", () => {
  const root = new FakeRoot();
  const authoringScroller = new FakeWindow();
  const windowValue = new FakeWindow();
  root.closest = (selector) => selector === ".course-authoring-root" ? authoringScroller : null;
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue,
    documentValue: { activeElement: null },
    navigatorValue: null
  });

  assert.equal(authoringScroller.listeners.has("scroll"), true);
  assert.equal(windowValue.listeners.has("scroll"), false);
  sequence.destroy();
  assert.equal(authoringScroller.listeners.has("scroll"), false);
});

test("rolagem entre hierarquias atualiza seleção, contexto, links e alvos de edição", async () => {
  const root = new FakeRoot();
  const windowValue = new FakeWindow();
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        const page = pageFor(options, 2);
        page.items[1].curriculumPath = {
          module: { id: "module-b", position: 1, title: "Aplicações" },
          lesson: { id: "lesson-b", position: 1, title: "Cenários" },
          didacticMicrosequence: { id: "micro-b", position: 1, title: "Decisões aplicadas" }
        };
        return page;
      }
    }),
    course: {
      courseId: COURSE_ID,
      revision: REVISION,
      ownership: "owned",
      canEdit: true
    },
    onEditContent() {},
    windowValue,
    documentValue: { activeElement: null }
  });
  await sequence.open();

  const mutableNode = (dataset = {}) => ({
    textContent: "",
    dataset: { ...dataset },
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); }
  });
  const articleOne = mutableNode();
  const articleTwo = mutableNode();
  const selected = new Map();
  const cards = [
    {
      dataset: { inspectionStudyUnit: "unit-01" },
      getBoundingClientRect: () => ({ bottom: 0 }),
      classList: { toggle(_name, value) { selected.set("unit-01", value); } },
      querySelector: () => articleOne
    },
    {
      dataset: { inspectionStudyUnit: "unit-02" },
      getBoundingClientRect: () => ({ bottom: 500 }),
      classList: { toggle(_name, value) { selected.set("unit-02", value); } },
      querySelector: () => articleTwo
    }
  ];
  const nodes = {
    position: mutableNode(),
    parent: mutableNode(),
    summary: mutableNode(),
    selectorSummary: mutableNode(),
    previous: mutableNode(),
    next: mutableNode(),
    module: mutableNode(),
    lesson: mutableNode(),
    microsequence: mutableNode(),
    studyUnit: mutableNode(),
    editModule: mutableNode({ targetId: "module-a" }),
    editLesson: mutableNode({ targetId: "lesson-a" }),
    editMicrosequence: mutableNode({ targetId: "micro-a" })
  };
  const selectors = new Map([
    ["[data-inspection-context-position]", nodes.position],
    ["[data-inspection-context-parent]", nodes.parent],
    ["[data-inspection-context-summary]", nodes.summary],
    [".course-inspection-context-selector > summary", nodes.selectorSummary],
    ['[data-inspection-action="previous"]', nodes.previous],
    ['[data-inspection-action="next"]', nodes.next],
    ["[data-inspection-context-module]", nodes.module],
    ["[data-inspection-context-lesson]", nodes.lesson],
    ["[data-inspection-context-microsequence]", nodes.microsequence],
    ["[data-inspection-context-study-unit]", nodes.studyUnit],
    ['[data-inspection-edit-content="module"]', nodes.editModule],
    ['[data-inspection-edit-content="lesson"]', nodes.editLesson],
    ['[data-inspection-edit-content="didactic_microsequence"]', nodes.editMicrosequence]
  ]);
  root.querySelectorAll = (selector) => selector === "[data-inspection-study-unit]" ? cards : [];
  root.querySelector = (selector) => selectors.get(selector) || null;

  windowValue.listeners.get("scroll")();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(selected.get("unit-01"), false);
  assert.equal(selected.get("unit-02"), true);
  assert.equal(articleOne.attributes.has("aria-current"), false);
  assert.equal(articleTwo.attributes.get("aria-current"), "true");
  assert.equal(nodes.position.textContent, "2/2");
  assert.equal(nodes.parent.textContent, "Aplicações · Cenários");
  assert.equal(nodes.summary.textContent, "Decisões aplicadas");
  assert.equal(nodes.selectorSummary.attributes.get("aria-label"),
    "Localização: Aplicações, Cenários, Decisões aplicadas, Unidade 2");
  assert.equal(nodes.module.textContent, "Módulo · Aplicações");
  assert.match(nodes.module.attributes.get("href"), /moduleId=module-b$/u);
  assert.equal(nodes.lesson.textContent, "Lição · Cenários");
  assert.match(nodes.lesson.attributes.get("href"), /lessonId=lesson-b$/u);
  assert.equal(nodes.microsequence.textContent, "Microssequência · Decisões aplicadas");
  assert.match(nodes.microsequence.attributes.get("href"), /didacticMicrosequenceId=micro-b$/u);
  assert.equal(nodes.studyUnit.textContent, "Unidade · Unidade 2");
  assert.match(nodes.studyUnit.attributes.get("href"), /studyUnitId=unit-02$/u);
  assert.equal(nodes.editModule.dataset.targetId, "module-b");
  assert.equal(nodes.editLesson.dataset.targetId, "lesson-b");
  assert.equal(nodes.editMicrosequence.dataset.targetId, "micro-b");
  sequence.destroy();
});

test("localizador abre e fecha sem permitir rolagem nativa do summary", async () => {
  const root = new FakeRoot();
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  const details = { open: false };
  const focuses = [];
  const summary = {
    closest(selector) {
      if (selector === ".course-inspection-context-selector > summary") return this;
      if (selector === "details") return details;
      return null;
    },
    focus(options) { focuses.push(options); }
  };
  let pointerPrevented = false;
  root.listeners.get("pointerdown")({
    target: summary,
    preventDefault() { pointerPrevented = true; }
  });
  let clickPrevented = false;
  assert.equal(await root.listeners.get("click")({
    target: summary,
    preventDefault() { clickPrevented = true; }
  }), true);
  assert.equal(pointerPrevented, true);
  assert.equal(clickPrevented, true);
  assert.equal(details.open, true);
  assert.deepEqual(focuses, [{ preventScroll: true }]);

  await root.listeners.get("click")({ target: summary, preventDefault() {} });
  assert.equal(details.open, false);
  sequence.destroy();
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

test("combobox curricular alcança uma Unidade distante e mantém a sequência contígua", async () => {
  const root = new FakeRoot();
  let searchFocusCount = 0;
  const searchControl = { focus() { searchFocusCount += 1; } };
  root.querySelector = (selector) => {
    if (selector === '[data-inspection-control-key="search"]') return searchControl;
    if (selector === '[data-inspection-study-unit="unit-858"]') {
      return { getBoundingClientRect() { return { top: 0 }; } };
    }
    return null;
  };
  const controller = controllerFixture({}, { totalCount: 858 });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  assert.equal((root.innerHTML.match(/data-inspection-search-input/gu) || []).length, 1);
  assert.doesNotMatch(root.innerHTML, /data-inspection-jump|data-inspection-scope|Todas as Partes|Sem Parte/u);
  assert.equal(await root.listeners.get("input")({
    target: {
      value: "858",
      matches(selector) {
        return selector === "[data-inspection-search-input]";
      }
    }
  }), true);
  assert.match(root.innerHTML, /role="option"[^>]*data-inspection-search-option="study_unit:unit-858"/u);
  assert.equal(await root.listeners.get("click")({
    preventDefault() {},
    target: {
      dataset: { inspectionSearchOption: "study_unit:unit-858" },
      closest(selector) {
        return selector === "[data-inspection-search-option]" ? this : null;
      }
    }
  }), true);

  assert.equal(sequence.snapshot().studyUnitId, "unit-858");
  assert.equal(sequence.snapshot().itemCount, 13);
  assert.match(root.innerHTML, /data-inspection-study-unit="unit-846"/u);
  assert.match(root.innerHTML, /data-inspection-study-unit="unit-858"/u);
  assert.equal(controller.calls.length, 3);
  assert.equal(controller.calls.at(-2).options.anchorStudyUnitId, "unit-858");
  assert.equal(controller.calls.at(-1).options.direction, "backward");
  assert.equal(controller.calls.at(-1).options.cursor.studyUnitId, "unit-858");
  assert.equal(controller.documentCalls.length, 1);
  assert.deepEqual(controller.documentCalls[0].options, { verifiedRevision: REVISION });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(searchFocusCount, 1);
  sequence.destroy();
});

test("falha do índice curricular não repete a leitura a cada tecla", async () => {
  const root = new FakeRoot();
  let documentAttempts = 0;
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadCourseDocument() {
        documentAttempts += 1;
        throw new Error("Índice indisponível.");
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  const input = root.listeners.get("input");
  for (const value of ["u", "un", "uni"]) {
    assert.equal(await input({
      target: {
        value,
        matches(selector) { return selector === "[data-inspection-search-input]"; }
      }
    }), false);
  }
  assert.equal(documentAttempts, 1);

  assert.equal(await input({
    target: {
      value: "",
      matches(selector) { return selector === "[data-inspection-search-input]"; }
    }
  }), true);
  assert.equal(await input({
    target: {
      value: "unidade",
      matches(selector) { return selector === "[data-inspection-search-input]"; }
    }
  }), false);
  assert.equal(documentAttempts, 2);
  sequence.destroy();
});

test("seleção do combobox prevalece sobre pré-carga concorrente e libera paginação", async () => {
  const root = new FakeRoot();
  const inspectionCalls = [];
  let releasePrefetch;
  let delayedPrefetch = false;
  const prefetchGate = new Promise((resolve) => {
    releasePrefetch = resolve;
  });
  const controller = controllerFixture({
    async loadAuthoringStudyUnits(courseId, options) {
      inspectionCalls.push({ courseId, options: structuredClone(options) });
      if (!delayedPrefetch && options.cursor?.studyUnitId === "unit-12" &&
          options.direction === "forward") {
        delayedPrefetch = true;
        await prefetchGate;
      }
      return pageFor(options);
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  const prefetch = sequence.loadMore("forward");
  assert.equal(await root.listeners.get("input")({
    target: {
      value: "40",
      matches(selector) {
        return selector === "[data-inspection-search-input]";
      }
    }
  }), true);
  assert.equal(await root.listeners.get("click")({
    preventDefault() {},
    target: {
      dataset: { inspectionSearchOption: "study_unit:unit-40" },
      closest(selector) {
        return selector === "[data-inspection-search-option]" ? this : null;
      }
    }
  }), true);
  assert.equal(sequence.snapshot().studyUnitId, "unit-40");
  assert.equal(inspectionCalls.length, 4);
  assert.equal(inspectionCalls.at(-2).options.anchorStudyUnitId, "unit-40");
  assert.equal(inspectionCalls.at(-1).options.direction, "backward");

  releasePrefetch();
  assert.equal(await prefetch, false);
  assert.equal(sequence.snapshot().studyUnitId, "unit-40");
  assert.equal(await sequence.loadMore("forward"), true);
  assert.equal(inspectionCalls.length, 5);
  sequence.destroy();
});

test("combobox conserva o zoom atual ao selecionar uma Unidade já visível", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture();
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "module", id: "module-a" },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();
  const callsBeforeSearch = controller.calls.length;

  await root.listeners.get("input")({
    target: {
      value: "2",
      matches(selector) { return selector === "[data-inspection-search-input]"; }
    }
  });
  assert.equal(await root.listeners.get("click")({
    preventDefault() {},
    target: {
      dataset: { inspectionSearchOption: "study_unit:unit-02" },
      closest(selector) { return selector === "[data-inspection-search-option]" ? this : null; }
    }
  }), true);

  assert.deepEqual(sequence.snapshot().scope, { kind: "module", id: "module-a" });
  assert.equal(sequence.snapshot().studyUnitId, "unit-02");
  assert.equal(controller.calls.length, callsBeforeSearch);
  sequence.destroy();
});

test("combobox conserva o zoom atual ao buscar uma Unidade distante do mesmo escopo", async () => {
  const root = new FakeRoot();
  const controller = controllerFixture();
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "module", id: "module-a" },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  await root.listeners.get("input")({
    target: {
      value: "40",
      matches(selector) { return selector === "[data-inspection-search-input]"; }
    }
  });
  assert.equal(await root.listeners.get("click")({
    preventDefault() {},
    target: {
      dataset: { inspectionSearchOption: "study_unit:unit-40" },
      closest(selector) { return selector === "[data-inspection-search-option]" ? this : null; }
    }
  }), true);

  assert.deepEqual(sequence.snapshot().scope, { kind: "module", id: "module-a" });
  assert.equal(sequence.snapshot().studyUnitId, "unit-40");
  assert.deepEqual(controller.calls.at(-2).options.scope, { kind: "module", id: "module-a" });
  assert.equal(controller.calls.at(-2).options.anchorStudyUnitId, "unit-40");
  assert.equal(controller.calls.at(-1).options.direction, "backward");
  sequence.destroy();
});

test("combobox abre Módulo, Lição e Microssequência como escopos curriculares", async () => {
  const root = new FakeRoot();
  const navigations = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: { courseId: COURSE_ID, revision: REVISION },
    onNavigate(hash, options) {
      navigations.push({ hash, options });
      return true;
    },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  await root.listeners.get("input")({
    target: {
      value: "Fundamentos",
      matches(selector) {
        return selector === "[data-inspection-search-input]";
      }
    }
  });
  assert.match(root.innerHTML, /data-inspection-search-option="module:module-a"/u);
  assert.equal(await root.listeners.get("click")({
    preventDefault() {},
    target: {
      dataset: { inspectionSearchOption: "module:module-a" },
      closest(selector) {
        return selector === "[data-inspection-search-option]" ? this : null;
      }
    }
  }), true);
  assert.equal(navigations.length, 1);
  assert.match(navigations[0].hash, /section=content&moduleId=module-a/u);
  sequence.destroy();
});

test("Inspeção incorpora sem tradução o mesmo renderer de Unidade usado no Estudo", async () => {
  const root = new FakeRoot();
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  assert.match(root.innerHTML, /aria-label="Unidades de estudo"/u);
  assert.doesNotMatch(root.innerHTML, /<h2[^>]*>Unidades<\/h2>/u);
  assert.match(root.innerHTML, /aria-label="Navegação entre Unidades"/u);
  assert.doesNotMatch(root.innerHTML, />Inspeção<|Navegação na Inspeção/u);
  const expected = renderPackageStudyUnitBlocksWithDock(studyUnit(1), {
    omitRepeatedHeading: true,
    blockKeyPrefix: "inspection:unit-01"
  });
  assert.notEqual(expected.bodyHtml, "");
  assert.equal(root.innerHTML.includes(expected.bodyHtml), true);
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
  assert.match(explicitRoot.innerHTML, /Ir ao início da sequência/u);
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

test("retorno contextual restaura o foco na ação exata da Unidade", async () => {
  const root = new FakeRoot();
  let focused = 0;
  const unitElement = { getBoundingClientRect: () => ({ top: 24 }) };
  const control = { focus() { focused += 1; } };
  root.querySelector = (selector) => {
    if (selector === '[data-inspection-study-unit="unit-20"]') return unitElement;
    if (selector === '[data-inspection-control-key="design:unit-20"]') return control;
    return null;
  };
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "study_unit", id: "unit-20" },
    initialFocusKey: "design:unit-20",
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(focused, 1);
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
  assert.equal(controller.calls.at(-2).options.anchorStudyUnitId, "unit-25");
  assert.equal(controller.calls.at(-1).options.direction, "backward");
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

test("Unidade não oferece o antigo pedido de clipboard ao ChatGPT", async () => {
  const root = new FakeRoot();
  const requests = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: { courseId: COURSE_ID, revision: REVISION },
    onRequestChat(request) {
      requests.push(structuredClone(request));
      throw new Error("Falha isolada do integrador");
    },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  assert.doesNotMatch(root.innerHTML, /data-inspection-request-chat|Trabalhar com o ChatGPT/u);
  assert.ok(!root.innerHTML.includes(renderUiIcon("sparkles", "course-authoring-button-icon")));
  assert.deepEqual(requests, []);
  assert.match(root.innerHTML, /data-inspection-study-unit="unit-01"/u);
  sequence.destroy();
});

test("retorno direto à Unidade recupera o zoom estrutural salvo", async () => {
  const controller = controllerFixture({
    async loadAuthoringInspectionPosition() {
      return {
        scope: { kind: "module", id: "module-a" },
        studyUnitId: "unit-20",
        offsetFromStickyTop: 18,
        courseRevision: REVISION
      };
    }
  });
  const sequence = createCourseInspectionSequence({
    root: new FakeRoot(),
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "study_unit", id: "unit-20" },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  assert.deepEqual(sequence.snapshot().scope, { kind: "module", id: "module-a" });
  assert.equal(sequence.snapshot().studyUnitId, "unit-20");
  assert.equal(controller.calls[0].options.anchorStudyUnitId, "unit-20");
  assert.deepEqual(controller.calls[0].options.scope, { kind: "module", id: "module-a" });
  sequence.destroy();
});

test("alvo direto divergente ignora o deslocamento salvo de outra Unidade", async () => {
  const root = new FakeRoot();
  const target = {
    getBoundingClientRect() { return { top: 110, bottom: 310, height: 200 }; }
  };
  root.querySelector = (selector) => {
    if (selector === '.course-inspection-sticky-context') {
      return { getBoundingClientRect() { return { bottom: 10 }; } };
    }
    if (selector === '[data-inspection-study-unit="unit-25"]') return target;
    return null;
  };
  const windowValue = new FakeWindow();
  const controller = controllerFixture({
    async loadAuthoringInspectionPosition() {
      return {
        scope: { kind: "module", id: "module-a" },
        studyUnitId: "unit-24",
        offsetFromStickyTop: 18,
        courseRevision: REVISION
      };
    }
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller,
    course: { courseId: COURSE_ID, revision: REVISION },
    routeTarget: { kind: "study_unit", id: "unit-25" },
    windowValue,
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  assert.deepEqual(sequence.snapshot().scope, { kind: "course", id: null });
  assert.equal(controller.calls[0].options.anchorStudyUnitId, "unit-25");
  assert.deepEqual(windowValue.scrolls[0], { top: 100, left: 0, behavior: "auto" });
  sequence.destroy();
});

test("localização compacta preserva a edição estrutural por entityPath", async () => {
  const root = new FakeRoot();
  const edits = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: {
      courseId: COURSE_ID,
      title: "Curso",
      revision: REVISION,
      ownership: "owned",
      canEdit: true
    },
    onEditContent(target) {
      edits.push(structuredClone(target));
    },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });
  await sequence.open();

  assert.match(root.innerHTML, /data-inspection-edit-content="module"[^>]*aria-label="Editar Módulo"/u);
  assert.match(root.innerHTML, /data-inspection-edit-content="lesson"[^>]*aria-label="Editar Lição"/u);
  assert.match(root.innerHTML, /data-inspection-edit-content="didactic_microsequence"[^>]*aria-label="Editar Microssequência"/u);
  assert.match(root.innerHTML,
    /data-inspection-edit-content="lesson"[^>]*data-inspection-control-key="edit:lesson"/u);
  assert.equal(await root.listeners.get("click")({
    target: {
      dataset: { inspectionEditContent: "lesson", inspectionControlKey: "edit:lesson" },
      closest(selector) {
        return selector === "[data-inspection-edit-content]" ? this : null;
      }
    }
  }), true);
  assert.deepEqual(edits, [{
    kind: "lesson",
    id: "lesson-a",
    entityPath: [COURSE_ID, "module-a", "lesson-a"],
    returnFocusKey: "edit:lesson"
  }]);
  sequence.destroy();
});

test("escopo estrutural sem Unidade mantém contexto e edição situados", async () => {
  const root = new FakeRoot();
  const edits = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({}, { totalCount: 0 }),
    course: {
      courseId: COURSE_ID,
      title: "Curso vazio",
      revision: REVISION,
      ownership: "owned",
      canEdit: true
    },
    routeTarget: { kind: "module", id: "module-a" },
    onEditContent(target) { edits.push(structuredClone(target)); },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  assert.match(root.innerHTML, /course-inspection-empty-context/u);
  assert.match(root.innerHTML, /<small>Módulo<\/small><strong>Fundamentos<\/strong>/u);
  assert.match(root.innerHTML,
    /data-inspection-edit-content="module"[^>]*data-target-id="module-a"/u);
  const edit = {
    dataset: { inspectionEditContent: "module", targetId: "module-a" },
    closest(selector) { return selector === "[data-inspection-edit-content]" ? this : null; }
  };
  assert.equal(await root.listeners.get("click")({ target: edit }), true);
  assert.deepEqual(edits, [{
    kind: "module",
    id: "module-a",
    entityPath: [COURSE_ID, "module-a"],
    returnFocusKey: ""
  }]);
  sequence.destroy();
});

test("Curso sem Unidade mantém o próprio título e a edição situados", async () => {
  const root = new FakeRoot();
  const edits = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({}, { totalCount: 0 }),
    course: {
      courseId: COURSE_ID,
      title: "Curso vazio",
      revision: REVISION,
      ownership: "owned",
      canEdit: true
    },
    onEditContent(target) { edits.push(structuredClone(target)); },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  assert.match(root.innerHTML, /<small>Curso<\/small><strong>Curso vazio<\/strong>/u);
  const edit = {
    dataset: { inspectionEditContent: "course", targetId: COURSE_ID },
    closest(selector) { return selector === "[data-inspection-edit-content]" ? this : null; }
  };
  assert.equal(await root.listeners.get("click")({ target: edit }), true);
  assert.deepEqual(edits, [{
    kind: "course",
    id: COURSE_ID,
    entityPath: [COURSE_ID],
    returnFocusKey: ""
  }]);
  sequence.destroy();
});

test("Inspeção compõe no alvo sem N+1 e carrega a lista somente quando solicitada", async () => {
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
  assert.match(root.innerHTML, /class="course-inspection-item-menu"/u);
  assert.match(root.innerHTML, /<span>Observações<\/span>/u);
  assert.doesNotMatch(root.innerHTML, /Observar esta Unidade/u);
  assert.match(root.innerHTML, /aria-label="Visualizar"/u);
  assert.doesNotMatch(root.innerHTML, /<span>Visualizar<\/span>/u);
  assert.doesNotMatch(root.innerHTML, /data-inspection-select-button/u);
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
  assert.doesNotMatch(root.innerHTML, /Nova observação/u);
  assert.doesNotMatch(root.innerHTML, /Observações · 0/u);
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

test("observação resolvida deixa de marcar a Unidade como pendente", async () => {
  const root = new FakeRoot();
  const resolved = anchoredAnnotation(1);
  resolved.state = "resolved";
  resolved.timestamps.resolvedAt = "2026-08-17T15:00:00.000Z";
  resolved.capabilities.canResolve = false;
  resolved.capabilities.canReopen = true;
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        const page = pageFor(options);
        page.items[0].authorship.pendingObservationCount = 1;
        return page;
      },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return {
          contract: "aralearn.course-anchored-annotation-page.v1",
          courseId: COURSE_ID,
          courseRevision: REVISION,
          annotationSetVersion: 3,
          query: structuredClone(options.query),
          summary: {
            matchingTotal: 1,
            byOrigin: { learner: 1 },
            byChannel: { study_interface: 1 },
            byState: { resolved: 1 },
            unclassifiedTotal: 1
          },
          items: [resolved],
          hasMore: false,
          nextCursor: null
        };
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  await sequence.open();
  assert.match(root.innerHTML, /data-inspection-review-state="observations"/u);
  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-observations]"
          ? { dataset: { studyUnitId: "unit-01" } }
          : null;
      }
    }
  });
  assert.doesNotMatch(root.innerHTML, /data-inspection-review-state="observations"/u);
  sequence.destroy();
});

test("retirada na Inspeção usa confirmação modal, contém Tab e preserva foco", async () => {
  const root = new FakeRoot();
  const focusedSelectors = [];
  root.querySelector = (selector) => selector.includes("data-observation-action")
    ? { focus: () => focusedSelectors.push(selector) }
    : null;
  const documentListeners = new Map();
  const documentValue = {
    activeElement: null,
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (documentListeners.get(type) === listener) documentListeners.delete(type);
    }
  };
  const tabMoves = [];
  const cancelControl = { focus: () => tabMoves.push("cancel") };
  const confirmControl = { focus: () => tabMoves.push("confirm") };
  root.querySelectorAll = (selector) => selector.includes("data-inspection-confirmation")
    ? [cancelControl, confirmControl]
    : [];
  documentValue.activeElement = confirmControl;
  const commands = [];
  const annotationPage = (options) => {
    const value = anchoredAnnotation(1);
    value.capabilities.canWithdraw = true;
    return {
      contract: "aralearn.course-anchored-annotation-page.v1",
      courseId: COURSE_ID,
      courseRevision: REVISION,
      annotationSetVersion: 3,
      query: structuredClone(options.query),
      summary: {
        matchingTotal: 1,
        byOrigin: { learner: 1 },
        byChannel: { study_interface: 1 },
        byState: { open: 1 },
        unclassifiedTotal: 1
      },
      items: [value],
      hasMore: false,
      nextCursor: null
    };
  };
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return annotationPage(options);
      },
      async mutateCourseAnchoredAnnotations(input) {
        commands.push(structuredClone(input.command));
        return {
          contract: "aralearn.course-anchored-annotation-change.v1",
          courseId: COURSE_ID,
          courseRevision: REVISION,
          annotationSetVersion: 4,
          requestId: input.requestId,
          idempotent: false,
          changed: true,
          annotation: null
        };
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue
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
  const annotationId = anchoredAnnotation(1).annotationId;
  const clickObservationAction = (action) => root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-observation-action]"
          ? { dataset: { observationAction: action, observationId: annotationId } }
          : null;
      }
    }
  });

  await clickObservationAction("withdraw");
  assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.match(root.innerHTML, /class="course-authoring-confirm-backdrop" data-inspection-confirmation-backdrop/u);
  assert.match(root.innerHTML, /role="alertdialog" aria-modal="true"/u);
  assert.equal(commands.length, 0);
  assert.equal(focusedSelectors.at(-1), '[data-observation-action="cancel-confirmation"]');
  let tabPrevented = false;
  root.listeners.get("keydown")({ key: "Tab", preventDefault() { tabPrevented = true; } });
  assert.equal(tabPrevented, true);
  assert.equal(tabMoves.at(-1), "cancel");
  root.listeners.get("keydown")({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.doesNotMatch(root.innerHTML, /role="alertdialog"/u);
  assert.equal(focusedSelectors.at(-1),
    `[data-observation-action="withdraw"][data-observation-id="${annotationId}"]`);

  await clickObservationAction("withdraw");
  documentListeners.get("click")({
    target: {
      matches: (selector) => selector === "[data-inspection-confirmation-backdrop]",
      closest: () => null
    }
  });
  assert.doesNotMatch(root.innerHTML, /role="alertdialog"/u);
  await clickObservationAction("withdraw");
  await clickObservationAction("confirm-withdraw");
  assert.deepEqual(commands, [{
    type: "withdraw_anchored_annotation",
    annotationId,
    expectedAnnotationVersion: 1
  }]);
  sequence.destroy();
  assert.equal(documentListeners.size, 0);
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
  assert.match(root.innerHTML, /section=review/u);
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

test("Inspeção distingue vazio, cache offline, falha inicial e falha parcial", async () => {
  const windowValue = new FakeWindow();
  const documentValue = { activeElement: null };
  const optionsPage = (options, totalCount = 60) => pageFor(options, totalCount);

  const emptyRoot = new FakeRoot();
  const empty = createCourseInspectionSequence({
    root: emptyRoot,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        return optionsPage(options, 0);
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue,
    documentValue
  });
  assert.equal(await empty.open(), true);
  assert.match(emptyRoot.innerHTML, /Nenhuma Unidade de estudo materializada/u);
  empty.destroy();

  const offlineRoot = new FakeRoot();
  const offline = createCourseInspectionSequence({
    root: offlineRoot,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        return { ...optionsPage(options), offline: true, stale: true };
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue,
    documentValue
  });
  assert.equal(await offline.open(), true);
  assert.match(offlineRoot.innerHTML, /class="course-inspection-sync-state is-offline"[^>]*aria-label="Sem sincronização com a nuvem"/u);
  assert.doesNotMatch(offlineRoot.innerHTML, />Sem conexão · exibindo/u);
  offline.destroy();

  const failureRoot = new FakeRoot();
  const failure = createCourseInspectionSequence({
    root: failureRoot,
    controller: controllerFixture({
      async loadAuthoringStudyUnits() {
        throw new TypeError("Failed to fetch");
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue,
    documentValue
  });
  assert.equal(await failure.open(), false);
  assert.match(failureRoot.innerHTML, /Conteúdo indisponível/u);
  assert.match(failureRoot.innerHTML, /Sem conexão para carregar este trecho/u);
  failure.destroy();

  const partialRoot = new FakeRoot();
  let partialReads = 0;
  const partial = createCourseInspectionSequence({
    root: partialRoot,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        partialReads += 1;
        if (partialReads > 1) throw new TypeError("Network failure");
        return optionsPage(options);
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue,
    documentValue
  });
  assert.equal(await partial.open(), true);
  assert.equal(await partial.loadMore("forward"), false);
  assert.equal((partialRoot.innerHTML.match(/data-inspection-study-unit=/gu) || []).length, 12);
  assert.match(partialRoot.innerHTML, /Sem conexão para carregar este trecho/u);
  assert.match(partialRoot.innerHTML, /Tentar novamente/u);
  partial.destroy();
});

test("reconexão relê a página offline mesmo quando a revisão não mudou", async () => {
  const root = new FakeRoot();
  let online = false;
  let reads = 0;
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        reads += 1;
        return online ? pageFor(options) : { ...pageFor(options), offline: true, stale: true };
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  assert.match(root.innerHTML, /course-inspection-sync-state is-offline/u);
  online = true;
  assert.equal(await sequence.refresh(REVISION), true);
  assert.equal(reads, 2);
  assert.doesNotMatch(root.innerHTML, /course-inspection-sync-state is-offline/u);
  assert.match(root.innerHTML, /aria-label="Sincronização com a nuvem disponível"/u);
  sequence.destroy();
});

test("atualização na mesma revisão relê marcadores alterados por MCP ou Actions", async () => {
  const root = new FakeRoot();
  let reads = 0;
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        reads += 1;
        const page = pageFor(options);
        page.items[0].authorship.pendingObservationCount = reads === 1 ? 1 : 0;
        return page;
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  assert.match(root.innerHTML, /data-inspection-review-state="observations"/u);
  assert.equal(await sequence.refresh(REVISION), true);
  assert.equal(reads, 2);
  assert.doesNotMatch(root.innerHTML, /data-inspection-review-state="observations"/u);
  sequence.destroy();
});

test("revisão nova cancela paginação antiga e mantém somente o trecho ancorado", async () => {
  const root = new FakeRoot();
  let releaseOldPage;
  const oldPage = new Promise((resolve) => {
    releaseOldPage = resolve;
  });
  const calls = [];
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        calls.push(structuredClone(options));
        if (options.expectedRevision === REVISION && options.cursor) return oldPage;
        return { ...pageFor(options), courseRevision: options.expectedRevision };
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
  });

  assert.equal(await sequence.open(), true);
  const loading = sequence.loadMore("forward");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await sequence.refresh(REVISION + 1), true);
  releaseOldPage(pageFor(calls[1]));
  assert.equal(await loading, false);
  assert.equal(sequence.snapshot().courseRevision, REVISION + 1);
  assert.equal(sequence.snapshot().itemCount, COURSE_INSPECTION_PAGE_SIZE);
  assert.doesNotMatch(root.innerHTML, /O Curso mudou durante a leitura/u);
  assert.equal(calls.at(-1).anchorStudyUnitId, "unit-01");
  sequence.destroy();
});

test("troca de escopo salva a posição e preserva no histórico o deep link exato", async () => {
  const root = new FakeRoot();
  const events = [];
  const activeElement = {
    closest(selector) {
      if (selector === "[data-inspection-control-key]") {
        return { dataset: { inspectionControlKey: "design:unit-01" } };
      }
      return null;
    }
  };
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadAuthoringStudyUnits(_courseId, options) {
        const page = pageFor(options);
        page.items = page.items.map((item) => ({
          ...item,
          deepLink: `https://app.example/AraLearn/${item.deepLink}`
        }));
        return page;
      },
      async saveAuthoringInspectionPosition(_courseId, position) {
        events.push(["save", structuredClone(position)]);
      }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    onNavigate(hash, options) {
      events.push(["navigate", hash, structuredClone(options)]);
    },
    windowValue: new FakeWindow(),
    documentValue: { activeElement }
  });
  await sequence.open();

  const microsequenceRoute = `#/authoring/courses/${COURSE_ID}` +
    "?section=content&didacticMicrosequenceId=micro-a";
  const routeNode = {
    dataset: { inspectionControlKey: "production:unit-02" },
    getAttribute: () => microsequenceRoute,
    closest(selector) {
      return selector === "[data-inspection-study-unit]"
        ? { dataset: { inspectionStudyUnit: "unit-02" } }
        : null;
    }
  };
  await root.listeners.get("click")({
    preventDefault() {},
    target: {
      closest(selector) {
        return selector === "[data-inspection-route]"
          ? routeNode
          : null;
      }
    }
  });

  assert.deepEqual(events.map(([kind]) => kind), ["save", "navigate"]);
  assert.equal(events[0][1].studyUnitId, "unit-02");
  assert.deepEqual(events[1], [
    "navigate",
    microsequenceRoute,
    {
      returnTo: inspectionItem(2).deepLink,
      returnPosition: {
        scope: { kind: "course", id: null },
        studyUnitId: "unit-02",
        offsetFromStickyTop: 0,
        courseRevision: REVISION
      },
      returnFocusKey: "production:unit-02"
    }
  ]);
  sequence.destroy();
});

test("teclado fecha menus, clique externo os recolhe e reduced motion evita animação", async () => {
  const root = new FakeRoot();
  const summary = { focused: false, focus() { this.focused = true; } };
  const menu = {
    open: true,
    querySelector(selector) { return selector === "summary" ? summary : null; }
  };
  const unitTwo = {
    scroll: null,
    scrollIntoView(value) { this.scroll = value; }
  };
  root.querySelectorAll = (selector) => selector.includes("details.course-inspection")
    ? [menu]
    : [];
  root.querySelector = (selector) => selector.includes('data-inspection-study-unit="unit-02"')
    ? unitTwo
    : null;
  const documentListeners = new Map();
  const documentValue = {
    activeElement: { closest: () => menu },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (documentListeners.get(type) === listener) documentListeners.delete(type);
    }
  };
  const windowValue = new FakeWindow();
  windowValue.matchMedia = () => ({ matches: true });
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture(),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue,
    documentValue
  });
  await sequence.open();

  let prevented = false;
  root.listeners.get("keydown")({
    key: "Escape",
    preventDefault() { prevented = true; },
    stopPropagation() {}
  });
  assert.equal(menu.open, false);
  assert.equal(summary.focused, true);
  assert.equal(prevented, true);

  menu.open = true;
  documentListeners.get("click")({ target: { closest: () => null } });
  assert.equal(menu.open, false);

  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-inspection-action]"
          ? { dataset: { inspectionAction: "next" } }
          : null;
      }
    }
  });
  assert.deepEqual(unitTwo.scroll, { block: "start", behavior: "auto" });
  assert.match(root.innerHTML, /data-inspection-context-position>2\/60<\/span>/u);
  assert.match(root.innerHTML,
    /data-inspection-study-unit="unit-02"[^>]*>[\s\S]*?<article[^>]*aria-current="true"/u);
  assert.match(root.innerHTML, /aria-posinset="1" aria-setsize="60"/u);
  sequence.destroy();
  assert.equal(documentListeners.size, 0);
});

test("Inspeção preserva rascunho de criação e edição após validação e restaura o foco", async () => {
  const root = new FakeRoot();
  const focused = [];
  root.querySelector = (selector) => selector === "[data-field='study-unit-observation']"
    ? { focus: () => focused.push(selector) }
    : null;
  const annotation = anchoredAnnotation(1);
  annotation.capabilities.canRevise = true;
  const annotationPage = (options) => ({
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: REVISION,
    annotationSetVersion: 3,
    query: structuredClone(options.query),
    summary: {
      matchingTotal: 1,
      byOrigin: { learner: 1 },
      byChannel: { study_interface: 1 },
      byState: { open: 1 },
      unclassifiedTotal: 1
    },
    items: [structuredClone(annotation)],
    hasMore: false,
    nextCursor: null
  });
  const sequence = createCourseInspectionSequence({
    root,
    controller: controllerFixture({
      async loadCourseAnchoredAnnotations(_courseId, options) { return annotationPage(options); },
      async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
    }),
    course: { courseId: COURSE_ID, revision: REVISION },
    windowValue: new FakeWindow(),
    documentValue: { activeElement: null }
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

  const invalidText = `<rascunho>&${"x".repeat(2_000)}`;
  root.listeners.get("change")({
    target: {
      value: "suggestion",
      matches(selector) { return selector === "[data-field='study-unit-observation-category']"; }
    }
  });
  root.listeners.get("input")({
    target: {
      value: invalidText,
      matches(selector) { return selector === "[data-field='study-unit-observation']"; }
    }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: { matches(selector) { return selector === "[data-observation-composer]"; } }
  });
  assert.match(root.innerHTML, /&lt;rascunho&gt;&amp;/u);
  assert.match(root.innerHTML, /value="suggestion" checked/u);
  assert.match(root.innerHTML, /A observação pode ter no máximo 2\.000 caracteres/u);
  assert.equal(focused.at(-1), "[data-field='study-unit-observation']");

  await root.listeners.get("click")({
    target: {
      closest(selector) {
        return selector === "[data-observation-action]"
          ? { dataset: { observationAction: "edit", observationId: annotation.annotationId } }
          : null;
      }
    }
  });
  root.listeners.get("input")({
    target: {
      value: invalidText,
      matches(selector) { return selector === "[data-field='study-unit-observation']"; }
    }
  });
  root.listeners.get("submit")({
    preventDefault() {},
    target: { matches(selector) { return selector === "[data-observation-composer]"; } }
  });
  assert.match(root.innerHTML, /Editar observação/u);
  assert.match(root.innerHTML, /&lt;rascunho&gt;&amp;/u);
  assert.equal(focused.at(-1), "[data-field='study-unit-observation']");
  sequence.destroy();
});

test("Inspeção repete pelo composer renderizado a mesma criação ou edição ambígua", async (t) => {
  for (const mode of ["create", "edit"]) {
    await t.test(mode === "create" ? "criação" : "edição", async () => {
      const root = new FakeRoot();
      let renderedHtml = root.innerHTML;
      let renderGeneration = 0;
      Object.defineProperty(root, "innerHTML", {
        configurable: true,
        get() { return renderedHtml; },
        set(value) {
          renderedHtml = String(value);
          renderGeneration += 1;
        }
      });
      const requests = [];
      const annotation = anchoredAnnotation(1);
      annotation.capabilities.canRevise = true;
      const pageItems = mode === "edit" ? [annotation] : [];
      const annotationPage = (options) => ({
        contract: "aralearn.course-anchored-annotation-page.v1",
        courseId: COURSE_ID,
        courseRevision: REVISION,
        annotationSetVersion: 3,
        query: structuredClone(options.query),
        summary: {
          matchingTotal: pageItems.length,
          byOrigin: { learner: pageItems.length },
          byChannel: { study_interface: pageItems.length },
          byState: { open: pageItems.length },
          unclassifiedTotal: pageItems.length
        },
        items: structuredClone(pageItems),
        hasMore: false,
        nextCursor: null
      });
      const sequence = createCourseInspectionSequence({
        root,
        controller: controllerFixture({
          async loadCourseAnchoredAnnotations(_courseId, options) { return annotationPage(options); },
          async mutateCourseAnchoredAnnotations(input) {
            requests.push(structuredClone(input));
            if (requests.length === 1) {
              const error = new Error("A conexão caiu depois do envio.");
              error.code = "network_error";
              throw error;
            }
            return {
              contract: "aralearn.course-anchored-annotation-change.v1",
              courseId: COURSE_ID,
              courseRevision: REVISION,
              annotationSetVersion: 4,
              requestId: input.requestId,
              idempotent: true,
              changed: false,
              annotation: null
            };
          }
        }),
        course: { courseId: COURSE_ID, revision: REVISION },
        windowValue: new FakeWindow(),
        documentValue: { activeElement: null }
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
      if (mode === "edit") {
        await root.listeners.get("click")({
          target: {
            closest(selector) {
              return selector === "[data-observation-action]"
                ? { dataset: { observationAction: "edit", observationId: annotation.annotationId } }
                : null;
            }
          }
        });
      }
      const rawText = mode === "edit"
        ? "Edição na Inspeção preservada."
        : "Criação na Inspeção preservada.";
      root.listeners.get("change")({
        target: {
          value: "suggestion",
          matches(selector) { return selector === "[data-field='study-unit-observation-category']"; }
        }
      });
      root.listeners.get("input")({
        target: {
          value: rawText,
          matches(selector) { return selector === "[data-field='study-unit-observation']"; }
        }
      });
      const composerFromCurrentDom = ({ expectDraft = false } = {}) => {
        assert.match(root.innerHTML, /data-observation-composer/u);
        if (expectDraft) assert.match(root.innerHTML, new RegExp(rawText, "u"));
        return {
          renderGeneration,
          matches(selector) { return selector === "[data-observation-composer]"; }
        };
      };
      const firstComposer = composerFromCurrentDom();
      root.listeners.get("submit")({ preventDefault() {}, target: firstComposer });
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(requests.length, 1);
      assert.match(root.innerHTML, new RegExp(rawText, "u"));
      assert.match(root.innerHTML, /confirmar exatamente a mesma operação/u);
      assert.equal(sequence.hasPendingDraft(), true);
      const retryComposer = composerFromCurrentDom({ expectDraft: true });
      assert.notEqual(retryComposer.renderGeneration, firstComposer.renderGeneration);
      assert.notStrictEqual(retryComposer, firstComposer);
      root.listeners.get("submit")({ preventDefault() {}, target: retryComposer });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1], requests[0]);
      assert.equal(requests[0].command.type, mode === "edit"
        ? "revise_anchored_annotation"
        : "create_anchored_annotation");
      assert.equal(sequence.hasPendingDraft(), false);
      sequence.destroy();
    });
  }
});
