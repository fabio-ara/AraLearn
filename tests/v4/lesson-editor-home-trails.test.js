import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createLessonEditorApp } from "../../src/ui/lessonEditorApp.js";
import { homeTrailSnapshotForProject } from "../support/homeTrailSnapshot.js";

function fixtureProject() {
  return JSON.parse(fs.readFileSync(
    new URL("../fixtures/v4/project-minimal.json", import.meta.url),
    "utf8"
  ));
}

function partsForCourse(course) {
  const parts = [];
  const add = (entityType, entity, parentType = null, parentId = null, position = 0) => {
    const content = structuredClone(entity);
    for (const key of ["id", "position", "modules", "lessons", "topics", "microsequences", "cards"]) {
      delete content[key];
    }
    parts.push({ entityType, id: entity.id, parentType, parentId, position, content });
  };
  add("course", course);
  for (const [moduleIndex, moduleValue] of course.modules.entries()) {
    add("module", moduleValue, "course", course.id, moduleIndex);
    for (const [lessonIndex, lesson] of moduleValue.lessons.entries()) {
      add("lesson", lesson, "module", moduleValue.id, lessonIndex);
      lesson.topics.forEach((topic, index) => add("topic", topic, "lesson", lesson.id, index));
      for (const [microIndex, microsequence] of lesson.microsequences.entries()) {
        add("microsequence", microsequence, "lesson", lesson.id, microIndex);
        microsequence.cards.forEach((card) =>
          add("card", card, "microsequence", microsequence.id, card.position)
        );
      }
    }
  }
  return parts;
}

function waitFor(predicate, label) {
  const deadline = Date.now() + 2_000;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`Tempo excedido: ${label}`));
      setTimeout(check, 5);
    };
    check();
  });
}

function rootHarness(snapshot) {
  let html = "";
  let openCourse = null;
  let goBack = null;
  let undoCardEdit = null;
  let selectCourse = null;
  let selectedItemId = snapshot.items[0]?.trailItemId || "";
  return {
    get html() { return html; },
    get openCourse() { return openCourse; },
    get goBack() { return goBack; },
    get undoCardEdit() { return undoCardEdit; },
    chooseCourse(itemId) {
      selectedItemId = itemId;
      selectCourse?.({ currentTarget: { value: itemId } });
    },
    root: {
      get innerHTML() { return html; },
      set innerHTML(value) { html = value; },
      querySelector(selector) {
        if (selector === "[data-action='go-back']" &&
            html.includes('data-action="go-back"')) {
          return {
            addEventListener(type, listener) {
              if (type === "click") goBack = listener;
            }
          };
        }
        if (selector === "[data-field='home-course-select']" &&
            html.includes('data-field="home-course-select"')) {
          return {
            addEventListener(type, listener) {
              if (type === "change") selectCourse = listener;
            }
          };
        }
        if (selector === "[data-action='undo-card-edit']" &&
            html.includes('data-action="undo-card-edit"')) {
          return {
            addEventListener(type, listener) {
              if (type === "click") undoCardEdit = listener;
            }
          };
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector !== "[data-action='open-course']" ||
            !html.includes('data-action="open-course"')) return [];
        return [{
          getAttribute(name) {
            const selected = snapshot.items.find((item) =>
              item.trailItemId === selectedItemId
            ) || snapshot.items[0];
            return {
              "data-trail-item-id": selected.trailItemId,
              "data-trail-kind": selected.kind,
              "data-can-edit": selected.canEdit ? "true" : "false",
              "data-course-key": selected.courseKey
            }[name] || null;
          },
          addEventListener(type, listener) {
            if (type === "click") openCourse = listener;
          }
        }];
      },
      dispatchEvent() {}
    }
  };
}

test("refresh pessoal relê respostas remotas posteriores e as projeta na Home", async (t) => {
  const project = fixtureProject();
  const snapshot = homeTrailSnapshotForProject(project);
  const publishedCourseId = snapshot.items[0].courseId;
  snapshot.items[0].courseKey = null;
  const harness = rootHarness(snapshot);
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let refreshCount = 0;
  let initializeOptions = null;
  let clearCount = 0;
  let exposeRemoteReview = false;
  let denyTrails = false;
  const cardPath = [
    project.courses[0].id,
    project.courses[0].modules[0].id,
    project.courses[0].modules[0].lessons[0].id,
    project.courses[0].modules[0].lessons[0].microsequences[0].id,
    project.courses[0].modules[0].lessons[0].microsequences[0].cards[0].id
  ];
  const personalStorage = {
    setCourse() {},
    async initialize(options) { initializeOptions = options; },
    async refresh() { refreshCount += 1; },
    loadProgress() { return { version: 1, lessons: {} }; },
    saveProgress() {},
    loadReviewItems() {
      return exposeRemoteReview
        ? [{ title: "Resposta remota disponível", entityPath: cardPath }]
        : [];
    },
    async clearLocal() { clearCount += 1; },
    async flush() {}
  };
  const storage = {
    loadProject: () => project,
    loadProgress: () => ({ version: 1, lessons: {} }),
    saveProgress() {},
    loadReviewItems: () => [],
    loadCourseSummaries: () => [],
    resolveCourseContractKey(courseId) {
      return courseId === publishedCourseId ? project.courses[0].id : "";
    },
    loadCommentForPath: () => null,
    async loadCardAssistanceLocalState() { return {}; },
    coursePermissions: () => ({
      role: "learner",
      canAuthorContent: false,
      writeTarget: null,
      canOrganizeSelection: false,
      canRemoveSelection: false,
      canDeleteCourse: false
    })
  };
  const app = createLessonEditorApp({
    root: harness.root,
    storage,
    editor: {},
    initialProject: project,
    homeTrails: {
      async loadTrailSnapshot() {
        if (denyTrails) throw Object.assign(new Error("Acesso revogado"), { status: 403 });
        return snapshot;
      }
    },
    trailPersonalStateFactory: () => personalStorage
  });

  await app.refreshTrails();
  await waitFor(() => typeof harness.openCourse === "function", "botão do curso");
  harness.openCourse();
  await waitFor(() => harness.html.includes("Módulos"), "abertura do curso");
  assert.deepEqual(initializeOptions, { refresh: false });
  await waitFor(() => refreshCount === 1, "refresh pessoal em segundo plano");
  assert.equal(typeof harness.goBack, "function");
  harness.goBack();

  exposeRemoteReview = true;
  const refreshCountBeforeVisibility = refreshCount;
  await app.refreshPersonalState();
  assert.equal(refreshCount, refreshCountBeforeVisibility + 1);
  assert.match(harness.html, /Resposta remota disponível/u);

  denyTrails = true;
  assert.equal(await app.refreshTrails(), null);
  assert.equal(clearCount, 1);
  assert.doesNotMatch(harness.html, /data-action="open-course"/u);
});

test("retorno à aba atualiza estado pessoal remoto antes de Trilhas", () => {
  const source = fs.readFileSync(
    new URL("../../public/main.js", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /visibilitychange[\s\S]*document\.visibilityState === "hidden"[\s\S]*else \{[\s\S]*editorApp\?\.refreshPersonalState\?\.\(\)/u
  );
});

test("refresh monta somente o workspace homônimo selecionado por trailItemId", async (t) => {
  const fixture = fixtureProject();
  const baseCourse = fixture.courses[0];
  const alpha = { ...structuredClone(baseCourse), title: "Conteúdo Alpha" };
  const beta = { ...structuredClone(baseCourse), title: "Conteúdo Beta" };
  const trailItemIds = [
    "a0000000-0000-4000-8000-000000000001",
    "a0000000-0000-4000-8000-000000000002"
  ];
  const workspaceIds = [
    "b0000000-0000-4000-8000-000000000001",
    "b0000000-0000-4000-8000-000000000002"
  ];
  const groupId = "c0000000-0000-4000-8000-000000000001";
  const snapshot = {
    space: "trails",
    groups: [{ id: groupId, title: "Testes" }],
    items: [alpha, beta].map((course, index) => ({
      trailItemId: trailItemIds[index],
      workspaceId: workspaceIds[index],
      courseKey: course.id,
      courseId: null,
      selectionId: null,
      contentHash: null,
      kind: "course",
      source: "workspace",
      origin: "workspace",
      title: index ? "Homônimo Beta" : "Homônimo Alpha",
      description: "",
      moduleCount: 1,
      lessonCount: 1,
      microsequenceCount: 1,
      cardCount: 2,
      completedCardCount: 0,
      revision: 1,
      canEdit: true,
      canDelete: true,
      canRemove: false,
      pathId: groupId,
      pathTitle: "Testes",
      updatedAt: "2026-08-07T12:00:00Z"
    })),
    capabilities: { organize: true, catalogManage: false, catalogReview: false }
  };
  const harness = rootHarness(snapshot);
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const emptyProject = { ...structuredClone(fixture), courses: [] };
  const personalStorage = () => ({
    setCourse() {},
    async initialize() {},
    async refresh() {},
    loadProgress: () => ({ version: 1, lessons: {} }),
    saveProgress() {},
    loadReviewItems: () => [],
    async clearLocal() {},
    async flush() {}
  });
  const storage = {
    loadProject: () => emptyProject,
    loadProgress: () => ({ version: 1, lessons: {} }),
    saveProgress() {},
    loadCommentForPath: () => null,
    async loadCardAssistanceLocalState() { return {}; },
    coursePermissions: () => ({
      role: "owner", canAuthorContent: true, writeTarget: "private",
      canOrganizeSelection: true, canRemoveSelection: false, canDeleteCourse: true
    })
  };
  const app = createLessonEditorApp({
    root: harness.root,
    storage,
    editor: {},
    initialProject: emptyProject,
    homeTrails: {
      loadTrailSnapshot: async () => snapshot,
      async loadWorkspaceCourse(item) {
        const index = item.trailItemId === trailItemIds[0] ? 0 : 1;
        return {
          trailItemId: trailItemIds[index],
          workspaceId: workspaceIds[index],
          courseKey: baseCourse.id,
          revision: 1,
          parts: partsForCourse(index ? beta : alpha)
        };
      },
      async cacheWorkspaceCourse() {}
    },
    workspaceCourseAdapter: {
      deleteCourse() {}, saveMetadata() {}, saveMicrosequenceCards() {},
      moveEntity() {}, deleteEntity() {}
    },
    trailPersonalStateFactory: personalStorage
  });

  await app.refreshTrails();
  await waitFor(() => typeof harness.openCourse === "function", "primeiro homônimo");
  harness.openCourse();
  await waitFor(() => harness.html.includes("Conteúdo Alpha"), "conteúdo Alpha");
  harness.goBack();
  harness.chooseCourse(trailItemIds[1]);
  harness.openCourse();
  await waitFor(() => harness.html.includes("Conteúdo Beta"), "conteúdo Beta");
  harness.goBack();
  harness.chooseCourse(trailItemIds[0]);

  await app.refreshTrails();
  assert.equal(app.openCourse(baseCourse.id), true);
  assert.match(harness.html, /Conteúdo Alpha/u);
  assert.doesNotMatch(harness.html, /Conteúdo Beta/u);
});

test("undo local do mesmo courseKey não aparece nem recebe ação dentro do workspace", async (t) => {
  const fixture = fixtureProject();
  const course = fixture.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const snapshot = homeTrailSnapshotForProject(fixture);
  Object.assign(snapshot.items[0], {
    workspaceId: "b0000000-0000-4000-8000-000000000099",
    courseId: null,
    courseKey: course.id,
    source: "workspace",
    origin: "workspace",
    revision: 4,
    canEdit: true,
    canEditOffline: true,
    canDelete: true,
    canRemove: false
  });
  const harness = rootHarness(snapshot);
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  let localUndoWrites = 0;
  const localState = {
    contract: "aralearn.card-assistance-local-state.v4",
    undo: {
      contract: "aralearn.contextual-authoring-undo.v2",
      kind: "microsequence",
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: microsequence.cards[0].id,
      expectedRevision: "rascunho-local-antigo",
      affectedMicrosequenceIds: [microsequence.id],
      inversePatch: {
        type: "object",
        fields: { title: { type: "replace", value: "Título local anterior" } }
      }
    },
    sync: { pendingPaths: [], pendingMetadata: [], expectedRevision: null }
  };
  const emptyProject = { ...structuredClone(fixture), courses: [] };
  const storage = {
    loadProject: () => emptyProject,
    loadProgress: () => ({ version: 1, lessons: {} }),
    saveProgress() {},
    loadCommentForPath: () => null,
    loadReviewItems: () => [],
    async loadCardAssistanceLocalState(courseKey) {
      return courseKey === course.id ? structuredClone(localState) : {};
    },
    async saveMicrosequenceGeneration() { localUndoWrites += 1; },
    coursePermissions: () => ({
      role: "owner",
      canAuthorContent: true,
      writeTarget: "private",
      canOrganizeSelection: true,
      canRemoveSelection: false,
      canDeleteCourse: true
    })
  };
  const personalStorage = {
    setCourse() {},
    async initialize() {},
    async refresh() {},
    loadProgress: () => ({ version: 1, lessons: {} }),
    saveProgress() {},
    loadReviewItems: () => [],
    loadCommentForPath: () => null,
    async clearLocal() {},
    async flush() {}
  };
  const app = createLessonEditorApp({
    root: harness.root,
    storage,
    editor: {},
    initialProject: emptyProject,
    homeTrails: {
      loadTrailSnapshot: async () => snapshot,
      async loadWorkspaceCourse() {
        return {
          trailItemId: snapshot.items[0].trailItemId,
          workspaceId: snapshot.items[0].workspaceId,
          courseKey: course.id,
          revision: 4,
          parts: partsForCourse(course)
        };
      },
      async cacheWorkspaceCourse() {}
    },
    workspaceCourseAdapter: {
      saveMetadata() {},
      saveMicrosequenceCards() {},
      moveEntity() {},
      deleteEntity() {},
      deleteCourse() {}
    },
    trailPersonalStateFactory: () => personalStorage
  });

  await app.refreshTrails();
  await waitFor(() => typeof harness.openCourse === "function", "curso do workspace");
  await harness.openCourse();
  await waitFor(() => harness.html.includes('data-action="open-module"'), "workspace carregado");
  assert.equal(app.openCardPath([
    course.id,
    moduleValue.id,
    lesson.id,
    microsequence.id,
    microsequence.cards[0].id
  ], { edit: true }), true);
  await waitFor(() => harness.html.includes("runtime-card-sheet"), "card do workspace");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.doesNotMatch(harness.html, /data-action="undo-card-edit"/u);
  assert.equal(harness.undoCardEdit, null);
  assert.equal(localUndoWrites, 0);
});
