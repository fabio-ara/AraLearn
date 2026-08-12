import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  finalizeCleanContextualCourseDraftSync,
  finalizeContextualCourseDraftSync,
  materializeContextualCourseDraft
} from "../../src/assist/contextualAuthoringSync.js";
import {
  claimContextualAuthoringSyncAttempt,
  createLessonEditorApp,
  settleContextualAuthoringSyncAttempt
} from "../../src/ui/lessonEditorApp.js";

const project = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const path = {
  courseKey: "course-fixture-minimal",
  moduleKey: "module-fixture-minimal",
  lessonKey: "lesson-fixture-minimal",
  microsequenceKey: "micro-fixture-minimal"
};
const sourceCourseId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";

function firstLesson(document) {
  return document.courses[0].modules[0].lessons[0];
}

function copiedMicrosequence(document, id, title = id) {
  const copy = structuredClone(firstLesson(document).microsequences[0]);
  copy.id = id;
  copy.title = title;
  copy.cards = copy.cards.map((card, index) => ({
    ...card,
    id: `${id}-card-${index + 1}`
  }));
  return copy;
}

function pathFor(microsequenceKey) {
  return { ...path, microsequenceKey };
}

function pendingPathFrom(document, pathValue = path) {
  const lesson = findLessonForPath(document, pathValue);
  const position = lesson.microsequences.findIndex((item) => item.id === pathValue.microsequenceKey);
  const microsequence = lesson.microsequences[position];
  return {
    ...pathValue,
    textOnly: true,
    baseCards: structuredClone(microsequence.cards || []),
    baseMetadata: {
      title: microsequence.title,
      goal: microsequence.goal,
      role: microsequence.role,
      branchOf: microsequence.branchOf || null,
      dependsOn: microsequence.dependsOn || [],
      covers: microsequence.covers || [],
      checks: microsequence.checks || [],
      errors: microsequence.errors || []
    },
    basePosition: position
  };
}

function findLessonForPath(document, pathValue) {
  const course = document.courses.find((item) => item.id === pathValue.courseKey);
  const moduleValue = course.modules.find((item) => item.id === pathValue.moduleKey);
  return moduleValue.lessons.find((item) => item.id === pathValue.lessonKey);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function courseVariant(suffix, title) {
  const course = structuredClone(project.courses[0]);
  course.id = `course-${suffix}`;
  course.title = title;
  const moduleValue = course.modules[0];
  moduleValue.id = `module-${suffix}`;
  const lesson = moduleValue.lessons[0];
  lesson.id = `lesson-${suffix}`;
  lesson.topics = lesson.topics.map((topic, index) => ({
    ...topic,
    id: `topic-${suffix}-${index + 1}`
  }));
  const microsequence = lesson.microsequences[0];
  microsequence.id = `micro-${suffix}`;
  microsequence.cards = microsequence.cards.map((card, index) => ({
    ...card,
    id: `card-${suffix}-${index + 1}`
  }));
  return course;
}

function coursePath(course) {
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  return {
    courseKey: course.id,
    moduleKey: moduleValue.id,
    lessonKey: lesson.id,
    microsequenceKey: microsequence.id
  };
}

function pendingLocalState(pathValue, expectedRevision) {
  return {
    contract: "aralearn.card-assistance-local-state.v4",
    undo: null,
    sync: {
      pendingPaths: [pathValue],
      pendingMetadata: [],
      expectedRevision
    }
  };
}

function cleanLocalState() {
  return {
    contract: "aralearn.card-assistance-local-state.v4",
    undo: null,
    sync: { pendingPaths: [], pendingMetadata: [], expectedRevision: null }
  };
}

function timeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Tempo esgotado: ${label}`)), 2_000);
    })
  ]).finally(() => clearTimeout(timer));
}

function storage(courseOrigin = "private", { catalogAdmin = false, privateOwner = true } = {}) {
  return {
    coursePermissions() {
      const canAuthorContent = courseOrigin === "catalog" ? catalogAdmin : privateOwner;
      return {
        canAuthorContent,
        writeTarget: canAuthorContent ? courseOrigin : null
      };
    },
    async getLocalCourseDraft() {
      return {
        courseId: sourceCourseId,
        courseKey: path.courseKey,
        courseOrigin,
        revision: "draft-revision",
        baseContentHash: "a".repeat(64)
      };
    }
  };
}

test("materialização usa o localDraft do snapshot sem abrir uma segunda leitura", async () => {
  const localProject = structuredClone(project);
  firstLesson(localProject).microsequences[0].cards[0].title = "Título capturado em R1";
  const localStorage = storage("private");
  const draftSnapshot = await localStorage.getLocalCourseDraft();
  localStorage.getLocalCourseDraft = async () => {
    assert.fail("o localDraft não deve ser relido fora do snapshot atômico");
  };
  let revision = 1;
  let savedCards = null;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") {
        return {
          workspaceId,
          revision,
          content: structuredClone(project),
          publications: []
        };
      }
      if (name === "salvarCardsNaMicrossequencia") {
        savedCards = JSON.parse(args.cardsJson);
        return { workspaceId, revision: ++revision };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };

  const result = await materializeContextualCourseDraft({
    remoteCatalog,
    storage: localStorage,
    projectDocument: localProject,
    courseKey: path.courseKey,
    pendingPaths: [pendingPathFrom(project)],
    expectedLocalDraftRevision: draftSnapshot.revision,
    draftSnapshot
  });

  assert.equal(result.status, "materialized");
  assert.equal(savedCards[0].title, "Título capturado em R1");
});

test("edição concorrente agenda uma única sincronização posterior sem perder a fila", async () => {
  const syncState = {
    running: false,
    trailingAttemptRequested: false
  };
  let scheduledAttempts = 0;

  assert.equal(claimContextualAuthoringSyncAttempt(syncState), true, "R1 inicia");
  assert.equal(claimContextualAuthoringSyncAttempt(syncState), false, "R2 espera R1");
  assert.equal(claimContextualAuthoringSyncAttempt(syncState), false, "R3 compartilha a fila");
  assert.deepEqual(syncState, {
    running: true,
    trailingAttemptRequested: true
  });

  assert.equal(
    settleContextualAuthoringSyncAttempt(
      syncState,
      () => {
        scheduledAttempts += 1;
      }
    ),
    true,
    "a fila pendente exige uma nova tentativa após R1"
  );
  assert.equal(scheduledAttempts, 0, "a nova tentativa espera o finally corrente terminar");
  await Promise.resolve();
  assert.equal(scheduledAttempts, 1, "R2 é reagendada automaticamente");
  assert.equal(claimContextualAuthoringSyncAttempt(syncState), true, "a tentativa posterior inicia");
  assert.equal(
    settleContextualAuthoringSyncAttempt(syncState),
    false,
    "a fila consumida não produz um loop vazio"
  );
  assert.deepEqual(syncState, {
    running: false,
    trailingAttemptRequested: false
  });
});

test("sinal concorrente agenda uma tentativa posterior mesmo sem fila visível", async () => {
  const syncState = {
    running: false,
    trailingAttemptRequested: false
  };
  let scheduledAttempts = 0;

  assert.equal(claimContextualAuthoringSyncAttempt(syncState), true);
  assert.equal(claimContextualAuthoringSyncAttempt(syncState), false);
  assert.equal(settleContextualAuthoringSyncAttempt(
    syncState,
    () => {
      scheduledAttempts += 1;
    }
  ), true);
  await Promise.resolve();
  assert.equal(scheduledAttempts, 1);
  assert.equal(claimContextualAuthoringSyncAttempt(syncState), true);
  assert.equal(settleContextualAuthoringSyncAttempt(syncState), false);
});

test("sincronização iniciada em A não sobrescreve nem perde a edição persistida em B", async (t) => {
  const courseA = courseVariant("a", "Curso A");
  const courseB = courseVariant("b", "Curso B");
  const twoCourseProject = {
    ...structuredClone(project),
    courses: [courseA, courseB]
  };
  const pathA = coursePath(courseA);
  const pathB = coursePath(courseB);
  const sourceIds = new Map([
    [courseA.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    [courseB.id, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]
  ]);
  const draftRevisions = new Map([
    [courseA.id, "draft-a"],
    [courseB.id, "draft-b"]
  ]);
  const localStates = new Map([
    [courseA.id, pendingLocalState(pathA, draftRevisions.get(courseA.id))],
    [courseB.id, pendingLocalState(pathB, draftRevisions.get(courseB.id))]
  ]);
  const startedA = deferred();
  const releaseA = deferred();
  const loadedB = deferred();
  const finalizedB = deferred();
  const finalizedCourses = [];
  const acknowledgedCourses = [];
  const workspaceCourseKeys = new Map();
  const revisions = new Map();
  const listeners = {};
  const previousWindow = globalThis.window;
  globalThis.window = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    }
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  let renderedHtml = "";
  const root = {
    get innerHTML() {
      return renderedHtml;
    },
    set innerHTML(value) {
      renderedHtml = value;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    dispatchEvent() {}
  };
  const editorStorage = {
    loadProject() {
      return twoCourseProject;
    },
    loadCommentForPath() {
      return null;
    },
    async saveCommentForPath() {},
    async deleteCommentForPath() {},
    loadProgress() {
      return { version: 1, lessons: {} };
    },
    saveProgress() {},
    coursePermissions() {
      return {
        role: "owner",
        canAuthorContent: true,
        writeTarget: "private",
        canOrganizeSelection: true,
        canRemoveSelection: true,
        canDeleteCourse: true
      };
    },
    async loadCardAssistanceLocalState(courseKey) {
      if (courseKey === courseB.id) loadedB.resolve();
      return structuredClone(localStates.get(courseKey) || cleanLocalState());
    },
    async saveCardAssistanceLocalState(courseKey, localState) {
      localStates.set(courseKey, structuredClone(localState));
    },
    async getLocalCourseDraft(courseKey) {
      return {
        courseId: sourceIds.get(courseKey),
        courseKey,
        courseOrigin: "private",
        revision: draftRevisions.get(courseKey),
        baseContentHash: (courseKey === courseA.id ? "a" : "b").repeat(64)
      };
    },
    async acknowledgeWorkspaceCourseDraft(courseKey, {
      expectedLocalDraftRevision,
      workspaceId: acknowledgedWorkspaceId,
      workspaceRevision
    }) {
      assert.equal(expectedLocalDraftRevision, draftRevisions.get(courseKey));
      assert.equal(acknowledgedWorkspaceId, `workspace-${courseKey}`);
      assert.ok(Number.isSafeInteger(workspaceRevision));
      acknowledgedCourses.push(courseKey);
    },
    async finalizeCardAssistanceSync(courseKey, { expectedLocalDraftRevision }) {
      assert.equal(expectedLocalDraftRevision, draftRevisions.get(courseKey));
      finalizedCourses.push(courseKey);
      const nextLocalState = cleanLocalState();
      localStates.set(courseKey, nextLocalState);
      if (courseKey === courseB.id) finalizedB.resolve();
      return structuredClone(nextLocalState);
    }
  };
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      if (name === "criarWorkspaceDeAutoria") {
        const courseKey = [...sourceIds.entries()].find(
          ([, sourceId]) => sourceId === args.sourceCourseId
        )?.[0];
        assert.ok(courseKey);
        if (courseKey === courseA.id) {
          startedA.resolve();
          await releaseA.promise;
        }
        const targetWorkspaceId = `workspace-${courseKey}`;
        workspaceCourseKeys.set(targetWorkspaceId, courseKey);
        revisions.set(targetWorkspaceId, 1);
        return { workspaceId: targetWorkspaceId, revision: 1 };
      }
      const targetWorkspaceId = args.workspaceId;
      const courseKey = workspaceCourseKeys.get(targetWorkspaceId);
      assert.ok(courseKey, `workspace conhecido para ${name}`);
      if (name === "lerWorkspaceDeAutoria") {
        return {
          workspaceId: targetWorkspaceId,
          revision: revisions.get(targetWorkspaceId),
          content: {
            ...structuredClone(twoCourseProject),
            courses: [structuredClone(
              twoCourseProject.courses.find((course) => course.id === courseKey)
            )]
          },
          publications: []
        };
      }
      if ([
        "atualizarMetadadosDaEntidade",
        "salvarCardsNaMicrossequencia"
      ].includes(name)) {
        const revision = revisions.get(targetWorkspaceId) + 1;
        revisions.set(targetWorkspaceId, revision);
        return { workspaceId: targetWorkspaceId, revision };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  const app = createLessonEditorApp({
    root,
    storage: editorStorage,
    editor: {},
    initialProject: twoCourseProject,
    contextualAuthoring: {
      remoteCatalog
    }
  });

  await timeout(startedA.promise, "início da sincronização de A");
  const cardPathB = [
    pathB.courseKey,
    pathB.moduleKey,
    pathB.lessonKey,
    pathB.microsequenceKey,
    courseB.modules[0].lessons[0].microsequences[0].cards[0].id
  ];
  assert.equal(app.openCardPath(cardPathB, { edit: true }), true);
  await timeout(loadedB.promise, "leitura do estado local de B");
  assert.equal(typeof listeners.online, "function");
  listeners.online();
  releaseA.resolve();

  await timeout(finalizedB.promise, "materialização posterior de B");
  assert.deepEqual(acknowledgedCourses, [courseA.id, courseB.id]);
  assert.deepEqual(finalizedCourses, [courseA.id, courseB.id]);
  assert.deepEqual(localStates.get(courseA.id).sync.pendingPaths, []);
  assert.deepEqual(localStates.get(courseB.id).sync.pendingPaths, []);
  assert.match(renderedHtml, /Curso B/u);
});

for (const denied of [
  { title: "curso de catálogo comum", origin: "catalog", options: {} },
  { title: "curso privado alheio", origin: "private", options: { privateOwner: false } }
]) {
  test(`${denied.title} é recusado antes de qualquer chamada remota`, async () => {
    const calls = [];
    await assert.rejects(
      materializeContextualCourseDraft({
        remoteCatalog: {
          async executeApplicationAuthoringAction(name, args) {
            calls.push([name, args]);
            throw new Error("A chamada remota não deveria ocorrer.");
          }
        },
        storage: storage(denied.origin, denied.options),
        projectDocument: project,
        courseKey: path.courseKey,
        pendingPaths: [path]
      }),
      (error) => error?.code === "course_authoring_forbidden"
    );
    assert.deepEqual(calls, []);
  });
}

test("administrador materializa a correção em workspace sem alterar o curso oficial", async () => {
  const calls = [];
  let revision = 1;
  const changedProject = structuredClone(project);
  firstLesson(changedProject).microsequences[0].cards[0].title = "Título corrigido";
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") {
        return {
          workspaceId,
          revision,
          content: structuredClone(project),
          publications: []
        };
      }
      if (new Set([
        "atualizarMetadadosDaEntidade",
        "salvarCardsNaMicrossequencia"
      ]).has(name)) return { workspaceId, revision: ++revision };
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  const result = await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage("catalog", { catalogAdmin: true }),
    projectDocument: changedProject,
    courseKey: path.courseKey,
    pendingPaths: [path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });

  assert.equal(result.status, "materialized");
  assert.equal(result.source, "workspace");
  assert.equal(result.workspaceId, workspaceId);
  assert.equal(result.revision, 2);
  assert.deepEqual(result.localFinalization, {
    courseKey: path.courseKey,
    expectedLocalDraftRevision: "draft-revision",
    workspaceId,
    workspaceRevision: 2
  });
  const save = calls.find(([name]) => name === "salvarCardsNaMicrossequencia")[1];
  assert.deepEqual(save.microsequencePath, Object.values(path));
  assert.equal(save.mode, "replace");
  assert.equal(Object.hasOwn(save, "status"), false);
  assert.equal(JSON.parse(save.cardsJson).length, 2);
  assert.equal(calls.some(([name]) => name === "publicarCursoDoWorkspace"), false);
});

test("curso privado atualiza a composição corrente sem gerar artefato publicado", async () => {
  const calls = [];
  let revision = 1;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") return {
        workspaceId,
        revision,
        content: structuredClone(project),
        publications: []
      };
      if (new Set([
        "atualizarMetadadosDaEntidade",
        "salvarCardsNaMicrossequencia"
      ]).has(name)) return { workspaceId, revision: ++revision };
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage("private"),
    projectDocument: project,
    courseKey: path.courseKey,
    pendingPaths: [path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  assert.equal(calls.some(([name]) => name === "publicarCursoDoWorkspace"), false);
});

test("metadado textual local materializa sem depender da sessão que o editou", async () => {
  const calls = [];
  let revision = 1;
  const changedProject = structuredClone(project);
  changedProject.courses[0].title = "Título retomado offline";
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") return {
        workspaceId,
        revision,
        content: structuredClone(project),
        publications: []
      };
      if (name === "atualizarMetadadosDaEntidade") {
        return { workspaceId, revision: ++revision };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  const result = await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage("private"),
    projectDocument: changedProject,
    courseKey: path.courseKey,
    pendingMetadata: [{
      entityType: "course",
      entityPath: [path.courseKey],
      baseMetadata: { title: project.courses[0].title, goal: project.courses[0].goal },
      metadata: { title: changedProject.courses[0].title, goal: project.courses[0].goal }
    }],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  const update = calls.find(([name]) => name === "atualizarMetadadosDaEntidade");
  assert.equal(update[1].title, "Título retomado offline");
  assert.deepEqual(update[1].entityPath, [path.courseKey]);
  assert.equal(calls.some(([name]) => name === "salvarCardsNaMicrossequencia"), false);
  assert.equal(result.status, "materialized");
});

test("metadado textual concorrente preserva o rascunho local sem sobrescrever o remoto", async () => {
  const remoteProject = structuredClone(project);
  remoteProject.courses[0].title = "Título de outro dispositivo";
  const localProject = structuredClone(project);
  localProject.courses[0].title = "Título local";
  const calls = [];
  await assert.rejects(
    materializeContextualCourseDraft({
      remoteCatalog: {
        async executeApplicationAuthoringAction(name, args) {
          calls.push([name, args]);
          if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision: 1 };
          if (name === "lerWorkspaceDeAutoria") return {
            workspaceId,
            revision: 1,
            content: structuredClone(remoteProject),
            publications: []
          };
          throw new Error("A escrita remota não deveria ocorrer.");
        }
      },
      storage: storage("private"),
      projectDocument: localProject,
      courseKey: path.courseKey,
      pendingMetadata: [{
        entityType: "course",
        entityPath: [path.courseKey],
        baseMetadata: { title: project.courses[0].title, goal: project.courses[0].goal },
        metadata: { title: localProject.courses[0].title, goal: project.courses[0].goal }
      }]
    }),
    (error) => error?.code === "contextual_authoring_conflict"
  );
  assert.equal(calls.some(([name]) => name === "atualizarMetadadosDaEntidade"), false);
});

test("metadados textuais concorrentes em folhas distintas são combinados", async () => {
  const remoteProject = structuredClone(project);
  remoteProject.courses[0].goal = "Objetivo de outro dispositivo";
  const localProject = structuredClone(project);
  localProject.courses[0].title = "Título local combinado";
  const calls = [];
  let revision = 1;
  const result = await materializeContextualCourseDraft({
    remoteCatalog: {
      async executeApplicationAuthoringAction(name, args) {
        calls.push([name, args]);
        if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
        if (name === "lerWorkspaceDeAutoria") return {
          workspaceId,
          revision,
          content: structuredClone(remoteProject),
          publications: []
        };
        if (name === "atualizarMetadadosDaEntidade") {
          return { workspaceId, revision: ++revision };
        }
        throw new Error(`Chamada inesperada: ${name}`);
      }
    },
    storage: storage("private"),
    projectDocument: localProject,
    courseKey: path.courseKey,
    pendingMetadata: [{
      entityType: "course",
      entityPath: [path.courseKey],
      baseMetadata: { title: project.courses[0].title, goal: project.courses[0].goal },
      metadata: { title: localProject.courses[0].title, goal: project.courses[0].goal }
    }]
  });
  const update = calls.find(([name]) => name === "atualizarMetadadosDaEntidade")[1];
  assert.equal(update.title, localProject.courses[0].title);
  assert.equal(update.goal, remoteProject.courses[0].goal);
  assert.equal(result.status, "materialized");
});

test("microssequência criada ou retirada sincroniza primeiro sua estrutura", async () => {
  const createdProject = structuredClone(project);
  const created = copiedMicrosequence(createdProject, "micro-created", "Nova prática");
  created.goal = "Praticar o conceito.";
  created.status = "generated";
  firstLesson(createdProject).microsequences.unshift(created);
  const createdPath = pathFor(created.id);
  const calls = [];
  let revision = 1;
  let remoteDocument = project;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") return {
        workspaceId,
        revision,
        content: structuredClone(remoteDocument),
        publications: []
      };
      if (name === "criarEstruturaNoWorkspace") return { workspaceId, revision: ++revision };
      if (name === "salvarCardsNaMicrossequencia") return { workspaceId, revision: ++revision };
      if (name === "atualizarMetadadosDaEntidade") return { workspaceId, revision: ++revision };
      if (name === "reorganizarWorkspace") return { workspaceId, revision: ++revision };
      if (name === "excluirDoWorkspace") return { workspaceId, revision: ++revision };
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage(),
    projectDocument: createdProject,
    courseKey: path.courseKey,
    pendingPaths: [createdPath, path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  const creation = calls.find(([name]) => name === "criarEstruturaNoWorkspace")[1];
  assert.equal(creation.parts[0].id, "micro-created");
  assert.equal(creation.parts[0].position, 0);
  const createdSave = calls.find(([, args]) =>
    args.microsequencePath?.at(-1) === "micro-created"
    && Object.hasOwn(args, "cardsJson")
  )[1];
  assert.equal(Object.hasOwn(createdSave, "status"), false);
  assert.equal(
    calls.filter(([name]) => name === "reorganizarWorkspace").length,
    0,
    "o outline em memória deve refletir a criação antes do próximo caminho"
  );

  calls.length = 0;
  revision = 1;
  remoteDocument = structuredClone(project);
  const survivor = copiedMicrosequence(remoteDocument, "micro-survivor", "Sobrevivente");
  firstLesson(remoteDocument).microsequences.push(survivor);
  const removedProject = structuredClone(remoteDocument);
  firstLesson(removedProject).microsequences.shift();
  const survivorPath = pathFor(survivor.id);
  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage(),
    projectDocument: removedProject,
    courseKey: path.courseKey,
    pendingPaths: [path, survivorPath],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  const removal = calls.find(([name]) => name === "excluirDoWorkspace");
  assert.equal(removal[1].operation, "delete_entity");
  assert.deepEqual(removal[1].entityPath, Object.values(path));
  assert.equal(
    calls.filter(([name]) => name === "reorganizarWorkspace").length,
    0,
    "o outline em memória deve refletir a exclusão antes do próximo caminho"
  );
});

test("metadados e posição da microssequência são sincronizados antes dos cards", async () => {
  const remoteProject = structuredClone(project);
  const movedMicrosequence = copiedMicrosequence(
    remoteProject,
    "micro-moved",
    "Microssequência movida"
  );
  firstLesson(remoteProject).microsequences.push(movedMicrosequence);
  const changedProject = structuredClone(remoteProject);
  firstLesson(changedProject).microsequences.reverse();
  const changedMicrosequence = firstLesson(changedProject).microsequences[0];
  changedMicrosequence.title = "Título corrigido";
  changedMicrosequence.goal = "Objetivo corrigido.";
  changedMicrosequence.cards[0].title = "Card corrigido";
  const movedPath = pathFor(changedMicrosequence.id);
  const calls = [];
  let revision = 1;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") return {
        workspaceId,
        revision,
        content: structuredClone(remoteProject),
        publications: []
      };
      if ([
        "atualizarMetadadosDaEntidade",
        "reorganizarWorkspace",
        "salvarCardsNaMicrossequencia"
      ].includes(name)) return { workspaceId, revision: ++revision };
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage(),
    projectDocument: changedProject,
    courseKey: path.courseKey,
    pendingPaths: [movedPath, path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  const operations = calls
    .map(([name]) => name)
    .filter((name) => [
      "atualizarMetadadosDaEntidade",
      "reorganizarWorkspace",
      "salvarCardsNaMicrossequencia"
    ].includes(name));
  assert.equal(
    operations.filter((name) => name === "reorganizarWorkspace").length,
    1,
    "o segundo caminho deve observar a ordem já movida em memória"
  );
  const metadata = calls.find(([name, args]) =>
    name === "atualizarMetadadosDaEntidade"
    && args.entityPath.at(-1) === movedPath.microsequenceKey
  )[1];
  assert.equal(metadata.title, "Título corrigido");
  assert.equal(metadata.goal, "Objetivo corrigido.");
  const move = calls.find(([name]) => name === "reorganizarWorkspace")[1];
  assert.equal(move.operation, "move_entity");
  assert.equal(move.position, 0);
  const metadataIndex = calls.findIndex(([name, args]) =>
    name === "atualizarMetadadosDaEntidade"
    && args.entityPath.at(-1) === movedPath.microsequenceKey
  );
  const moveIndex = calls.findIndex(([name]) => name === "reorganizarWorkspace");
  const saveIndex = calls.findIndex(([name, args]) =>
    name === "salvarCardsNaMicrossequencia"
    && args.microsequencePath.at(-1) === movedPath.microsequenceKey
  );
  assert.ok(metadataIndex < moveIndex && moveIndex < saveIndex);
  assert.equal(Object.hasOwn(changedMicrosequence, "position"), false);
});

test("replace vazio preserva a microssequência planejada na sincronização", async () => {
  const localProject = structuredClone(project);
  const localMicrosequence = firstLesson(localProject).microsequences[0];
  localMicrosequence.cards = [];
  localMicrosequence.status = "planned";
  const calls = [];
  let revision = 1;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") return {
        workspaceId,
        revision,
        content: structuredClone(project),
        publications: []
      };
      if (new Set([
        "atualizarMetadadosDaEntidade",
        "salvarCardsNaMicrossequencia"
      ]).has(name)) return { workspaceId, revision: ++revision };
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };

  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage(),
    projectDocument: localProject,
    courseKey: path.courseKey,
    pendingPaths: [path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });

  const save = calls.find(([name]) => name === "salvarCardsNaMicrossequencia")[1];
  assert.equal(save.mode, "replace");
  assert.equal(Object.hasOwn(save, "status"), false);
  assert.deepEqual(JSON.parse(save.cardsJson), []);
});

test("replay textOnly combina folhas do mesmo card e preserva adição e ordem remotas por ID", async () => {
  const baseProject = structuredClone(project);
  const localProject = structuredClone(baseProject);
  const remoteProject = structuredClone(baseProject);
  firstLesson(localProject).microsequences[0].cards[0].title = "Título local";
  const remoteCards = firstLesson(remoteProject).microsequences[0].cards;
  remoteCards[0].text = "Texto remoto na mesma ficha.";
  const addedCard = {
    ...structuredClone(remoteCards[0]),
    id: "card-remoto-adicionado",
    title: "Card criado remotamente",
    text: "Conteúdo criado em outro dispositivo.",
    position: 1
  };
  remoteCards[1].position = 2;
  remoteCards[0].position = 3;
  firstLesson(remoteProject).microsequences[0].cards = [
    addedCard,
    remoteCards[1],
    remoteCards[0]
  ];
  let revision = 7;
  let savedCards = null;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") {
        return { workspaceId, revision, content: structuredClone(remoteProject), publications: [] };
      }
      if (name === "salvarCardsNaMicrossequencia") {
        savedCards = JSON.parse(args.cardsJson);
        revision += 1;
        return { workspaceId, revision };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };

  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage(),
    projectDocument: localProject,
    courseKey: path.courseKey,
    pendingPaths: [pendingPathFrom(baseProject)],
    uuidFactory: async (key) => `request-${key.length}`
  });

  assert.deepEqual(savedCards.map(({ id, position }) => ({ id, position })), [
    { id: "card-remoto-adicionado", position: 1 },
    { id: "card-fixture-minimal-complete", position: 2 },
    { id: "card-fixture-minimal-regra", position: 3 }
  ]);
  assert.equal(savedCards[0].title, "Card criado remotamente");
  assert.equal(savedCards[2].title, "Título local");
  assert.equal(savedCards[2].text, "Texto remoto na mesma ficha.");
});

test("replay textual recusa conflito no mesmo card sem sobrescrever o remoto", async () => {
  const baseProject = structuredClone(project);
  const localProject = structuredClone(baseProject);
  const remoteProject = structuredClone(baseProject);
  firstLesson(localProject).microsequences[0].cards[0].title = "Título local";
  firstLesson(remoteProject).microsequences[0].cards[0].title = "Título remoto";
  let remoteWrites = 0;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name) {
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision: 7 };
      if (name === "lerWorkspaceDeAutoria") {
        return { workspaceId, revision: 7, content: structuredClone(remoteProject), publications: [] };
      }
      remoteWrites += 1;
      return { workspaceId, revision: 8 };
    }
  };

  await assert.rejects(
    () => materializeContextualCourseDraft({
      remoteCatalog,
      storage: storage(),
      projectDocument: localProject,
      courseKey: path.courseKey,
      pendingPaths: [pendingPathFrom(baseProject)]
    }),
    (error) => error?.code === "contextual_authoring_conflict"
  );
  assert.equal(remoteWrites, 0);
});

test("replay textOnly com conflictPolicy local mantém a folha local e as demais folhas remotas", async () => {
  const baseProject = structuredClone(project);
  const localProject = structuredClone(baseProject);
  const remoteProject = structuredClone(baseProject);
  firstLesson(localProject).microsequences[0].cards[0].title = "Título local escolhido";
  firstLesson(remoteProject).microsequences[0].cards[0].title = "Título remoto concorrente";
  firstLesson(remoteProject).microsequences[0].cards[0].text = "Texto remoto preservado.";
  let revision = 9;
  let savedCards = null;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") {
        return { workspaceId, revision, content: structuredClone(remoteProject), publications: [] };
      }
      if (name === "salvarCardsNaMicrossequencia") {
        savedCards = JSON.parse(args.cardsJson);
        return { workspaceId, revision: ++revision };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };

  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage(),
    projectDocument: localProject,
    courseKey: path.courseKey,
    pendingPaths: [pendingPathFrom(baseProject)],
    conflictPolicy: "local"
  });

  assert.equal(savedCards[0].title, "Título local escolhido");
  assert.equal(savedCards[0].text, "Texto remoto preservado.");
});

test("finalização local encaminha exatamente o curso e a revisão materializada", async () => {
  const calls = [];
  const result = await finalizeContextualCourseDraftSync({
    storage: {
      async acknowledgeWorkspaceCourseDraft(courseKey, options) {
        calls.push(["acknowledge", courseKey, options]);
      },
      async finalizeCardAssistanceSync(courseKey, options) {
        calls.push(["finalize", courseKey, options]);
        return { status: "finalized" };
      }
    },
    courseKey: path.courseKey,
    expectedLocalDraftRevision: "draft-revision",
    workspaceId,
    workspaceRevision: 7
  });
  assert.deepEqual(calls, [
    ["acknowledge", path.courseKey, {
      expectedLocalDraftRevision: "draft-revision",
      workspaceId,
      workspaceRevision: 7
    }],
    ["finalize", path.courseKey, {
      expectedLocalDraftRevision: "draft-revision"
    }]
  ]);
  assert.deepEqual(result, { status: "finalized" });
});

test("retry clean finaliza idempotentemente a revisão ainda registrada na fila", async () => {
  const calls = [];
  const storage = {
    async getWorkspaceCourseDraftReceipt() {
      return { consumedRevision: "draft-revision-consumed" };
    },
    async finalizeCardAssistanceSync(courseKey, options) {
      calls.push([courseKey, options]);
      return {
        contract: "aralearn.card-assistance-local-state.v4",
        undo: null,
        sync: { pendingPaths: [], expectedRevision: null }
      };
    }
  };
  const localState = {
    sync: {
      pendingPaths: [path],
      expectedRevision: " draft-revision-consumed "
    }
  };

  const first = await finalizeCleanContextualCourseDraftSync({
    storage,
    courseKey: path.courseKey,
    localState
  });
  const second = await finalizeCleanContextualCourseDraftSync({
    storage,
    courseKey: path.courseKey,
    localState
  });
  const alreadyCleared = await finalizeCleanContextualCourseDraftSync({
    storage,
    courseKey: path.courseKey,
    localState: first.localState
  });

  assert.equal(first.attempted, true);
  assert.equal(second.attempted, true);
  assert.deepEqual(calls, [
    [path.courseKey, { expectedLocalDraftRevision: "draft-revision-consumed" }],
    [path.courseKey, { expectedLocalDraftRevision: "draft-revision-consumed" }]
  ]);
  assert.deepEqual(alreadyCleared, { attempted: false, localState: null });
});

test("fila pendente sem rascunho nem recibo nunca é tratada como sincronizada", async () => {
  const pending = pendingLocalState(path, "draft-missing");
  const missingDraftStorage = {
    ...storage("private"),
    async getLocalCourseDraft() { return null; },
    async getWorkspaceCourseDraftReceipt() { return null; }
  };

  await assert.rejects(
    () => materializeContextualCourseDraft({
      remoteCatalog: { executeApplicationAuthoringAction: async () => assert.fail("não chama remoto") },
      storage: missingDraftStorage,
      projectDocument: project,
      courseKey: path.courseKey,
      pendingPaths: pending.sync.pendingPaths,
      expectedLocalDraftRevision: pending.sync.expectedRevision
    }),
    (error) => error?.code === "contextual_authoring_draft_missing"
  );
  await assert.rejects(
    () => finalizeCleanContextualCourseDraftSync({
      storage: missingDraftStorage,
      courseKey: path.courseKey,
      localState: pending
    }),
    (error) => error?.code === "contextual_authoring_not_materialized"
  );
  assert.deepEqual(pending.sync.pendingPaths, [path]);
});
