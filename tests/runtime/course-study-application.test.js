import test from "node:test";
import assert from "node:assert/strict";

import { createCourseStudyApplication } from
  "../../src/study/CourseStudyApplication.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

function project() {
  const makeStudyUnit = (id, position) => ({
    id,
    position,
    title: `Unidade ${position}`,
    role: "theory",
    content: [{
      id: `paragraph-${position}`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: `Conteúdo ${position}.` }
    }],
    response: null,
    feedback: [],
    topics: []
  });
  return {
    contract: "aralearn.course.v1",
    courses: [{
      id: COURSE_ID,
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        guide: { goal: "Guiar.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          guide: { goal: "Ensinar.", include: [], exclude: [], notation: [], avoid: [] },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Microssequência",
            goal: "Explicar.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [makeStudyUnit("unit-a", 1), makeStudyUnit("unit-b", 2)]
          }]
        }]
      }]
    }]
  };
}

class FakeActionNode {
  constructor() {
    this.listeners = new Map();
    this.dataset = {};
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({
        currentTarget: this,
        target: this,
        detail: 1,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
      });
    }
  }

  focus() {}
}

class FakeStudyRoot {
  #html = "";
  #nodes = new Map();

  set innerHTML(value) {
    this.#html = String(value || "");
    this.#nodes.clear();
  }

  get innerHTML() {
    return this.#html;
  }

  querySelector(selector) {
    const match = /^\[data-action='([^']+)'\]$/u.exec(selector);
    if (!match || !this.#html.includes(`data-action="${match[1]}"`)) return null;
    if (!this.#nodes.has(selector)) this.#nodes.set(selector, new FakeActionNode());
    return this.#nodes.get(selector);
  }

  querySelectorAll() { return []; }

  setAttribute() {}

  removeAttribute() {}

  dispatchEvent() { return true; }

  click(action) {
    const node = this.querySelector(`[data-action='${action}']`);
    if (!node) throw new Error(`Ação ausente no teste: ${action}`);
    node.dispatch("click");
  }
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function applicationRepository(document, flush) {
  let pending = false;
  return {
    loadProgress() { return { version: 1, lessons: {} }; },
    loadStudyNavigation() { return null; },
    loadCourseSummaries() {
      return [{
        courseId: COURSE_ID,
        title: "Curso",
        revision: 1,
        ownership: "shared",
        canEdit: false,
        canDerive: false,
        isPersonalCopy: false,
        personalCopyCourseId: null,
        moduleCount: 1,
        lessonCount: 1,
        microsequenceCount: 1,
        studyUnitCount: 2,
        completedStudyUnitCount: 0
      }];
    },
    loadRuntimeStatus() { return { pending }; },
    loadReviewItems() { return []; },
    hasMoreReviewItems() { return false; },
    loadAnnotationsForPath() { return []; },
    isStudyUnitMarkedForReview() { return false; },
    loadProject() { return structuredClone(document); },
    async loadCourse() { return structuredClone(document); },
    async setStudyUnitCompleted() {
      pending = true;
      return { pending: true };
    },
    flush() {
      return flush(() => { pending = false; });
    },
    async clearStudyNavigationPosition() { return true; }
  };
}

async function openFirstStudyUnit(app) {
  await app.openEntityPath([
    COURSE_ID,
    "module-a",
    "lesson-a",
    "micro-a",
    "unit-a"
  ]);
}

test("flush em background atualiza pendente para sincronizado sem nova interação", async () => {
  const document = project();
  let releaseFlush;
  let signalFlushStarted;
  const flushStarted = new Promise((resolve) => { signalFlushStarted = resolve; });
  const flushGate = new Promise((resolve) => { releaseFlush = resolve; });
  const repository = applicationRepository(document, async (markSynced) => {
    signalFlushStarted();
    await flushGate;
    markSynced();
  });
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: document
  });

  await openFirstStudyUnit(app);
  root.click("next-study-unit");
  await flushStarted;
  assert.match(root.innerHTML, /aria-label="Sincronização pendente"/u);

  releaseFlush();
  await nextTurn();
  assert.match(root.innerHTML, /aria-label="Sincronizado"/u);
  assert.doesNotMatch(root.innerHTML, /aria-label="Sincronização pendente"/u);
  app.destroy();
});

test("falha do flush em background mantém a sincronização pendente", async () => {
  const document = project();
  let rejectFlush;
  let signalFlushStarted;
  const flushStarted = new Promise((resolve) => { signalFlushStarted = resolve; });
  const flushGate = new Promise((_, reject) => { rejectFlush = reject; });
  const repository = applicationRepository(document, async () => {
    signalFlushStarted();
    await flushGate;
  });
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: document
  });

  await openFirstStudyUnit(app);
  root.click("next-study-unit");
  await flushStarted;
  rejectFlush(new TypeError("Failed to fetch"));
  await nextTurn();

  assert.match(root.innerHTML, /aria-label="Sincronização pendente"/u);
  assert.doesNotMatch(root.innerHTML, /aria-label="Sincronizado"/u);
  app.destroy();
});
