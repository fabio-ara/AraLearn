import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildMicrotheoryReview,
  buildWorkspaceOutline,
  deleteWorkspaceEntity,
  demoteCourseToModule,
  insertWorkspaceEntity,
  mergeWorkspaceMicrosequences,
  moveWorkspaceEntity,
  promoteModuleToCourse,
  renameWorkspaceEntity,
  replaceWorkspaceEntity,
  splitWorkspaceMicrosequence,
  validateAuthoringWorkspace
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";

async function fixture() {
  return JSON.parse(await readFile(
    new URL("../../docs/examples/aralearn-contract.logic-plane-matrix-course.json", import.meta.url),
    "utf8"
  ));
}

function firstPath(project) {
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  return { course, moduleValue, lesson, microsequence, card: microsequence.cards[0] };
}

test("workspace lista a árvore e projeta somente microteoria no chat", async () => {
  const project = await fixture();
  const outline = buildWorkspaceOutline(project);
  const review = buildMicrotheoryReview(project);

  assert.equal(outline.courses[0].modules[0].lessons[0].microsequences.length, 1);
  const microtheory = review.courses[0].modules[0].lessons[0].microtheories[0];
  assert.ok(microtheory.theoryCards.length > 0);
  assert.ok(microtheory.theoryCards.every((card) => card.kind === "theory"));
  assert.equal(
    microtheory.practiceCardCount,
    firstPath(project).microsequence.cards.filter((card) => card.kind === "exercise").length
  );
});

test("renomear, mover, inserir, substituir e excluir são mutações isoladas", async () => {
  const project = await fixture();
  const { course, moduleValue, lesson, microsequence, card } = firstPath(project);
  const renamed = renameWorkspaceEntity(project, {
    entityType: "course",
    entityId: course.id,
    title: "Curso renomeado"
  });
  assert.equal(renamed.courses[0].title, "Curso renomeado");
  assert.notEqual(project.courses[0].title, "Curso renomeado");

  const secondLesson = structuredClone(lesson);
  secondLesson.id = "lesson-workspace-second";
  secondLesson.title = "Segunda lição";
  secondLesson.microsequences = [];
  const inserted = insertWorkspaceEntity(renamed, {
    entityType: "lesson",
    parentId: moduleValue.id,
    entity: secondLesson
  });
  const moved = moveWorkspaceEntity(inserted, {
    entityType: "microsequence",
    entityId: microsequence.id,
    targetParentId: secondLesson.id
  });
  assert.equal(moved.courses[0].modules[0].lessons[0].microsequences.length, 0);
  assert.equal(moved.courses[0].modules[0].lessons[1].microsequences[0].id, microsequence.id);

  const replacement = structuredClone(card);
  replacement.title = "Teoria revista";
  const replaced = replaceWorkspaceEntity(moved, {
    entityType: "card",
    entityId: card.id,
    entity: replacement
  });
  assert.equal(
    replaced.courses[0].modules[0].lessons[1].microsequences[0].cards[0].title,
    "Teoria revista"
  );
  const deleted = deleteWorkspaceEntity(replaced, {
    entityType: "lesson",
    entityId: lesson.id
  });
  assert.equal(deleted.courses[0].modules[0].lessons.length, 1);
  assert.equal(validateAuthoringWorkspace(deleted).contract, "aralearn.contract");
});

test("juntar e separar microssequências preserva cards e normaliza posições", async () => {
  const project = await fixture();
  const { lesson, microsequence } = firstPath(project);
  const extra = structuredClone(microsequence);
  extra.id = "micro-workspace-extra";
  extra.title = "Prática adicional";
  extra.dependsOn = [microsequence.id];
  extra.cards = extra.cards.map((card, index) => ({
    ...card,
    id: `extra-card-${index + 1}`,
    position: index + 1
  }));
  const inserted = insertWorkspaceEntity(project, {
    entityType: "microsequence",
    parentId: lesson.id,
    entity: extra
  });
  const merged = mergeWorkspaceMicrosequences(inserted, {
    targetId: microsequence.id,
    sourceIds: [extra.id]
  });
  const mergedMicro = firstPath(merged).microsequence;
  assert.equal(mergedMicro.cards.length, microsequence.cards.length + extra.cards.length);
  assert.deepEqual(mergedMicro.cards.map((card) => card.position), mergedMicro.cards.map((_, index) => index + 1));

  const newMicrosequence = {
    ...structuredClone(microsequence),
    id: "micro-workspace-split",
    title: "Recorte conceitual",
    status: "ready",
    cards: []
  };
  const selectedIds = mergedMicro.cards.slice(-2).map((card) => card.id);
  const split = splitWorkspaceMicrosequence(merged, {
    sourceId: microsequence.id,
    newMicrosequence,
    cardIds: selectedIds
  });
  assert.deepEqual(
    split.courses[0].modules[0].lessons[0].microsequences[1].cards.map((card) => card.id),
    selectedIds
  );
});

test("módulos podem virar cursos e cursos podem virar módulos", async () => {
  const project = await fixture();
  const { course, moduleValue } = firstPath(project);
  const promoted = promoteModuleToCourse(project, {
    moduleId: moduleValue.id,
    courseId: "course-promoted",
    goal: "Estudar o módulo de forma independente.",
    mode: "copy"
  });
  assert.equal(promoted.courses.length, 2);
  assert.equal(promoted.courses[1].modules[0].id, moduleValue.id);

  const demoted = demoteCourseToModule(promoted, {
    courseId: "course-promoted",
    targetCourseId: course.id,
    moduleId: "module-demoted",
    mode: "move"
  });
  assert.equal(demoted.courses.length, 1);
  assert.equal(demoted.courses[0].modules.at(-1).id, "module-demoted");
});

