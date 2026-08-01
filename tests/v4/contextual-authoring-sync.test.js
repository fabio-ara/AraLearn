import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { materializeContextualCourseDraft } from "../../src/assist/contextualAuthoringSync.js";

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
            status: microsequence.status,
            cardCount: microsequence.cards.length
          }))
        }))
      }))
    }))
  };
}

function storage(courseOrigin = "catalog") {
  return {
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

test("reparo contextual substitui uma microssequência e publica prévia privada", async () => {
  const calls = [];
  let readCount = 0;
  const remoteCatalog = {
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
          courseId: "33333333-3333-4333-8333-333333333333",
          contentHash: "b".repeat(64),
          target: "private",
          completionState: "partial"
        };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
  const result = await materializeContextualCourseDraft({
    remoteCatalog,
    storage: storage("catalog"),
    projectDocument: project,
    courseKey: path.courseKey,
    pendingPaths: [path],
    uuidFactory: async (key) => `request-${calls.length}-${key.length}`
  });

  assert.equal(result.status, "published");
  const save = calls.find(([name]) => name === "salvarCardsNaMicrossequencia")[1];
  assert.deepEqual(save.microsequencePath, Object.values(path));
  assert.equal(save.mode, "replace");
  assert.equal(save.status, "ready");
  assert.equal(JSON.parse(save.cardsJson).length, 2);
  const publish = calls.find(([name]) => name === "publicarCursoDoWorkspace")[1];
  assert.equal(publish.completion, "partial");
  assert.equal(Object.hasOwn(publish, "existingCourseId"), false);
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
