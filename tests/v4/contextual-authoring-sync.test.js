import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  finalizeCleanContextualCourseDraftSync,
  finalizeContextualCourseDraftSync,
  materializeContextualCourseDraft
} from "../../src/assist/contextualAuthoringSync.js";
import {
  buildWorkspaceOutline
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";
import {
  claimContextualAuthoringSyncAttempt,
  createLessonEditorApp,
  settleContextualAuthoringSyncAttempt
} from "../../src/ui/lessonEditorApp.js";

const project = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v4/project-minimal.json", import.meta.url),
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

function outline(document = project) {
  return buildWorkspaceOutline(document);
}

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
      expectedRevision
    }
  };
}

function cleanLocalState() {
  return {
    contract: "aralearn.card-assistance-local-state.v4",
    undo: null,
    sync: { pendingPaths: [], expectedRevision: null }
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
  const synchronizedB = deferred();
  const finalizedCourses = [];
  const synchronizedCourses = [];
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
    async finalizeCardAssistanceSync(courseKey, { expectedLocalDraftRevision }) {
      assert.equal(expectedLocalDraftRevision, draftRevisions.get(courseKey));
      finalizedCourses.push(courseKey);
      const nextLocalState = cleanLocalState();
      localStates.set(courseKey, nextLocalState);
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
          content: buildWorkspaceOutline(twoCourseProject),
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
      if (name === "publicarCursoDoWorkspace") {
        return {
          workspaceId: targetWorkspaceId,
          revision: revisions.get(targetWorkspaceId),
          courseId: sourceIds.get(courseKey),
          contentHash: (courseKey === courseA.id ? "c" : "d").repeat(64),
          target: "private",
          completionState: "partial"
        };
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
      remoteCatalog,
      syncEngine: {
        async restoreDeferredCourseRevision() {}
      },
      async synchronizeReplica({ expectedCourseIds }) {
        synchronizedCourses.push(...expectedCourseIds);
        if (expectedCourseIds.includes(sourceIds.get(courseB.id))) {
          synchronizedB.resolve();
        }
      }
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

  await timeout(synchronizedB.promise, "sincronização posterior de B");
  assert.deepEqual(finalizedCourses, [courseA.id, courseB.id]);
  assert.deepEqual(synchronizedCourses, [
    sourceIds.get(courseA.id),
    sourceIds.get(courseB.id)
  ]);
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

test("administrador substitui a microssequência e atualiza o curso oficial", async () => {
  const calls = [];
  let revision = 1;
  const collectionId = "44444444-4444-4444-8444-444444444444";
  const remoteCatalog = {
    async listCollections() {
      return [{ courseId: sourceCourseId, collectionId }];
    },
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") {
        return {
          workspaceId,
          revision,
          content: outline(),
          publications: []
        };
      }
      if (new Set([
        "atualizarMetadadosDaEntidade",
        "salvarCardsNaMicrossequencia"
      ]).has(name)) return { workspaceId, revision: ++revision };
      if (name === "publicarCursoDoWorkspace") {
        return {
          workspaceId,
          revision,
          courseId: sourceCourseId,
          contentHash: "b".repeat(64),
          target: "catalog",
          completionState: "partial"
        };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  const result = await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage("catalog", { catalogAdmin: true }),
    projectDocument: project,
    courseKey: path.courseKey,
    pendingPaths: [path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });

  assert.equal(result.status, "published");
  assert.deepEqual(result.localFinalization, {
    courseKey: path.courseKey,
    expectedLocalDraftRevision: "draft-revision"
  });
  const save = calls.find(([name]) => name === "salvarCardsNaMicrossequencia")[1];
  assert.deepEqual(save.microsequencePath, Object.values(path));
  assert.equal(save.mode, "replace");
  assert.equal(Object.hasOwn(save, "status"), false);
  assert.equal(JSON.parse(save.cardsJson).length, 2);
  const publish = calls.find(([name]) => name === "publicarCursoDoWorkspace")[1];
  assert.equal(Object.hasOwn(publish, "completion"), false);
  assert.equal(publish.target, "catalog");
  assert.equal(publish.existingCourseId, sourceCourseId);
  assert.equal(publish.expectedContentHash, "a".repeat(64));
  assert.equal(publish.collectionId, collectionId);
});

test("curso privado atualiza a publicação corrente com CAS de conteúdo", async () => {
  const calls = [];
  let revision = 1;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision };
      if (name === "lerWorkspaceDeAutoria") return {
        workspaceId,
        revision,
        content: outline(),
        publications: []
      };
      if (new Set([
        "atualizarMetadadosDaEntidade",
        "salvarCardsNaMicrossequencia"
      ]).has(name)) return { workspaceId, revision: ++revision };
      if (name === "publicarCursoDoWorkspace") return {
        workspaceId,
        revision,
        courseId: sourceCourseId,
        contentHash: "c".repeat(64)
      };
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
  const publish = calls.find(([name]) => name === "publicarCursoDoWorkspace")[1];
  assert.equal(publish.target, "private");
  assert.equal(publish.existingCourseId, sourceCourseId);
  assert.equal(publish.expectedContentHash, "a".repeat(64));
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
        content: outline(remoteDocument),
        publications: []
      };
      if (name === "criarEstruturaNoWorkspace") return { workspaceId, revision: ++revision };
      if (name === "salvarCardsNaMicrossequencia") return { workspaceId, revision: ++revision };
      if (name === "atualizarMetadadosDaEntidade") return { workspaceId, revision: ++revision };
      if (name === "reorganizarWorkspace") return { workspaceId, revision: ++revision };
      if (name === "excluirDoWorkspace") return { workspaceId, revision: ++revision };
      if (name === "publicarCursoDoWorkspace") return {
        workspaceId,
        revision,
        courseId: "33333333-3333-4333-8333-333333333333",
        contentHash: "d".repeat(64)
      };
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
        content: outline(remoteProject),
        publications: []
      };
      if ([
        "atualizarMetadadosDaEntidade",
        "reorganizarWorkspace",
        "salvarCardsNaMicrossequencia"
      ].includes(name)) return { workspaceId, revision: ++revision };
      if (name === "publicarCursoDoWorkspace") return {
        workspaceId,
        revision,
        courseId: sourceCourseId,
        contentHash: "e".repeat(64)
      };
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
        content: outline(),
        publications: []
      };
      if (new Set([
        "atualizarMetadadosDaEntidade",
        "salvarCardsNaMicrossequencia"
      ]).has(name)) return { workspaceId, revision: ++revision };
      if (name === "publicarCursoDoWorkspace") return {
        workspaceId,
        revision,
        courseId: sourceCourseId,
        contentHash: "f".repeat(64)
      };
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

test("finalização local encaminha exatamente o curso e a revisão materializada", async () => {
  const calls = [];
  const result = await finalizeContextualCourseDraftSync({
    storage: {
      async finalizeCardAssistanceSync(courseKey, options) {
        calls.push([courseKey, options]);
        return { status: "finalized" };
      }
    },
    courseKey: path.courseKey,
    expectedLocalDraftRevision: "draft-revision"
  });
  assert.deepEqual(calls, [[path.courseKey, {
    expectedLocalDraftRevision: "draft-revision"
  }]]);
  assert.deepEqual(result, { status: "finalized" });
});

test("retry clean finaliza idempotentemente a revisão ainda registrada na fila", async () => {
  const calls = [];
  const storage = {
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
