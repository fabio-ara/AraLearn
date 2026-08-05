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
