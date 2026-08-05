import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  finalizeContextualCourseDraftSync,
  materializeContextualCourseDraft
} from "../../src/assist/contextualAuthoringSync.js";

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
  return {
    courses: document.courses.map((course) => ({
      id: course.id,
      modules: course.modules.map((moduleValue) => ({
        id: moduleValue.id,
        lessons: moduleValue.lessons.map((lesson) => ({
          id: lesson.id,
          microsequences: lesson.microsequences.map((microsequence) => ({
            id: microsequence.id,
            position: microsequence.position,
            title: microsequence.title,
            goal: microsequence.goal,
            role: microsequence.role,
            branchOf: microsequence.branchOf,
            dependsOn: microsequence.dependsOn,
            covers: microsequence.covers,
            checks: microsequence.checks,
            errors: microsequence.errors,
            status: microsequence.status,
            cardCount: microsequence.cards.length
          }))
        }))
      }))
    }))
  };
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
  let readCount = 0;
  const collectionId = "44444444-4444-4444-8444-444444444444";
  const remoteCatalog = {
    async listCollections() {
      return [{ courseId: sourceCourseId, collectionId }];
    },
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision: 1 };
      if (name === "lerWorkspaceDeAutoria") {
        readCount += 1;
        return {
          workspaceId,
          revision: readCount === 1 ? 1 : 2,
          content: outline(),
          publications: []
        };
      }
      if (name === "salvarCardsNaMicrossequencia") return { workspaceId, revision: 2 };
      if (name === "publicarCursoDoWorkspace") {
        return {
          workspaceId,
          revision: 2,
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
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, args]);
      if (name === "criarWorkspaceDeAutoria") return { workspaceId, revision: 1 };
      if (name === "lerWorkspaceDeAutoria") return {
        workspaceId,
        revision: 1,
        content: outline(),
        publications: []
      };
      if (name === "salvarCardsNaMicrossequencia") return { workspaceId, revision: 2 };
      if (name === "publicarCursoDoWorkspace") return {
        workspaceId,
        revision: 2,
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
  const created = structuredClone(createdProject.courses[0].modules[0].lessons[0].microsequences[0]);
  created.id = "micro-created";
  created.title = "Nova prática";
  created.goal = "Praticar o conceito.";
  created.status = "generated";
  createdProject.courses[0].modules[0].lessons[0].microsequences.push(created);
  const createdPath = { ...path, microsequenceKey: created.id };
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
      if (name === "criarEstruturaNoWorkspace") return { workspaceId, revision: ++revision };
      if (name === "salvarCardsNaMicrossequencia") return { workspaceId, revision: ++revision };
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
    pendingPaths: [createdPath],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  assert.deepEqual(
    calls.filter(([name]) => new Set([
      "criarEstruturaNoWorkspace", "salvarCardsNaMicrossequencia"
    ]).has(name)).map(([name]) => name),
    ["criarEstruturaNoWorkspace", "salvarCardsNaMicrossequencia"]
  );
  assert.equal(
    calls.find(([name]) => name === "criarEstruturaNoWorkspace")[1].parts[0].id,
    "micro-created"
  );

  calls.length = 0;
  revision = 1;
  const removedProject = structuredClone(project);
  removedProject.courses[0].modules[0].lessons[0].microsequences = [];
  await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage(),
    projectDocument: removedProject,
    courseKey: path.courseKey,
    pendingPaths: [path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  const removal = calls.find(([name]) => name === "excluirDoWorkspace");
  assert.equal(removal[1].operation, "delete_entity");
  assert.deepEqual(removal[1].entityPath, Object.values(path));
});

test("metadados e posição da microssequência são sincronizados antes dos cards", async () => {
  const changedProject = structuredClone(project);
  const changedMicrosequence = changedProject.courses[0].modules[0].lessons[0].microsequences[0];
  changedMicrosequence.title = "Título corrigido";
  changedMicrosequence.goal = "Objetivo corrigido.";
  changedMicrosequence.position = 3;
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
    pendingPaths: [path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });
  const operations = calls
    .map(([name]) => name)
    .filter((name) => [
      "atualizarMetadadosDaEntidade",
      "reorganizarWorkspace",
      "salvarCardsNaMicrossequencia"
    ].includes(name));
  assert.deepEqual(operations, [
    "atualizarMetadadosDaEntidade",
    "reorganizarWorkspace",
    "salvarCardsNaMicrossequencia"
  ]);
  const metadata = calls.find(([name]) => name === "atualizarMetadadosDaEntidade")[1];
  assert.equal(metadata.title, "Título corrigido");
  assert.equal(metadata.goal, "Objetivo corrigido.");
  const move = calls.find(([name]) => name === "reorganizarWorkspace")[1];
  assert.equal(move.operation, "move_entity");
  assert.equal(move.position, 3);
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
