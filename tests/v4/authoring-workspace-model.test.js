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
  const card = microsequence.cards[0];
  const coursePath = [course.id];
  const modulePath = [...coursePath, moduleValue.id];
  const lessonPath = [...modulePath, lesson.id];
  const microsequencePath = [...lessonPath, microsequence.id];
  return {
    course,
    moduleValue,
    lesson,
    microsequence,
    card,
    coursePath,
    modulePath,
    lessonPath,
    microsequencePath,
    cardPath: [...microsequencePath, card.id]
  };
}

test("workspace lista a árvore e projeta somente microteoria no chat", async () => {
  const project = await fixture();
  const outline = buildWorkspaceOutline(project);
  const review = buildMicrotheoryReview(project);

  assert.equal(outline.courses[0].modules[0].lessons[0].microsequences.length, 1);
  const microtheory = review.courses[0].modules[0].lessons[0].microtheories[0];
  const theoryCards = firstPath(project).microsequence.cards
    .filter((card) => card.kind === "theory");
  assert.equal(typeof microtheory.content, "string");
  assert.ok(microtheory.content.length > 0);
  assert.equal(Array.isArray(microtheory.content), false);
  theoryCards.forEach((card) => {
    assert.doesNotMatch(microtheory.content, new RegExp(card.id, "u"));
  });
  assert.equal(
    microtheory.practiceCount,
    firstPath(project).microsequence.cards.filter((card) => card.kind === "exercise").length
  );

  const selected = buildMicrotheoryReview(project, firstPath(project).microsequencePath);
  assert.equal(
    selected.courses[0].modules[0].lessons[0].microtheories.length,
    1
  );
  assert.equal(
    selected.courses[0].modules[0].lessons[0].microtheories[0].id,
    firstPath(project).microsequence.id
  );
});

test("renomear, mover, inserir, substituir e excluir são mutações isoladas", async () => {
  const project = await fixture();
  const {
    lesson, microsequence, card,
    coursePath, modulePath, lessonPath, microsequencePath
  } = firstPath(project);
  const renamed = renameWorkspaceEntity(project, {
    entityType: "course",
    entityPath: coursePath,
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
    parentPath: modulePath,
    entity: secondLesson
  });
  const moved = moveWorkspaceEntity(inserted, {
    entityType: "microsequence",
    entityPath: microsequencePath,
    targetParentPath: [...modulePath, secondLesson.id]
  });
  assert.equal(moved.courses[0].modules[0].lessons[0].microsequences.length, 0);
  assert.equal(moved.courses[0].modules[0].lessons[1].microsequences[0].id, microsequence.id);

  const replacement = structuredClone(card);
  replacement.title = "Teoria revista";
  const movedCardPath = [...modulePath, secondLesson.id, microsequence.id, card.id];
  const replaced = replaceWorkspaceEntity(moved, {
    entityType: "card",
    entityPath: movedCardPath,
    entity: replacement
  });
  assert.equal(
    replaced.courses[0].modules[0].lessons[1].microsequences[0].cards[0].title,
    "Teoria revista"
  );
  const deleted = deleteWorkspaceEntity(replaced, {
    entityType: "lesson",
    entityPath: lessonPath
  });
  assert.equal(deleted.courses[0].modules[0].lessons.length, 1);
  assert.equal(validateAuthoringWorkspace(deleted).contract, "aralearn.contract");
});

test("juntar e separar microssequências preserva cards e normaliza posições", async () => {
  const project = await fixture();
  const { microsequence, lessonPath, microsequencePath } = firstPath(project);
  const extra = structuredClone(microsequence);
  extra.id = "micro-workspace-extra";
  extra.title = "Prática adicional";
  extra.status = "needs_review";
  extra.dependsOn = [microsequence.id];
  extra.cards = extra.cards.map((card, index) => ({
    ...card,
    id: `extra-card-${index + 1}`,
    position: index + 1
  }));
  const inserted = insertWorkspaceEntity(project, {
    entityType: "microsequence",
    parentPath: lessonPath,
    entity: extra
  });
  const merged = mergeWorkspaceMicrosequences(inserted, {
    targetPath: microsequencePath,
    sourcePaths: [[...lessonPath, extra.id]]
  });
  const mergedMicro = firstPath(merged).microsequence;
  assert.equal(mergedMicro.cards.length, microsequence.cards.length + extra.cards.length);
  assert.equal(mergedMicro.status, "needs_review");
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
    sourcePath: microsequencePath,
    newMicrosequence,
    cardIds: selectedIds
  });
  assert.deepEqual(
    split.courses[0].modules[0].lessons[0].microsequences[1].cards.map((card) => card.id),
    selectedIds
  );
});

test("juntar recusa o mesmo caminho de origem repetido", async () => {
  const project = await fixture();
  const { course, moduleValue, lesson, microsequence, lessonPath } = firstPath(project);
  const extra = structuredClone(microsequence);
  extra.id = "micro-duplicate-source";
  extra.cards = extra.cards.map((card, index) => ({
    ...card,
    id: `duplicate-source-card-${index + 1}`
  }));
  const inserted = insertWorkspaceEntity(project, {
    entityType: "microsequence",
    parentPath: lessonPath,
    entity: extra
  });
  const sourcePath = [
    course.id,
    moduleValue.id,
    lesson.id,
    extra.id
  ];
  assert.throws(
    () => mergeWorkspaceMicrosequences(inserted, {
      targetPath: [
        course.id,
        moduleValue.id,
        lesson.id,
        microsequence.id
      ],
      sourcePaths: [sourcePath, sourcePath]
    }),
    (error) => error?.code === "invalid_workspace_merge"
  );
});

test("módulos podem virar cursos e cursos podem virar módulos", async () => {
  const project = await fixture();
  const { moduleValue, coursePath, modulePath } = firstPath(project);
  const promoted = promoteModuleToCourse(project, {
    modulePath,
    courseId: "course-promoted",
    goal: "Estudar o módulo de forma independente.",
    mode: "copy"
  });
  assert.equal(promoted.courses.length, 2);
  assert.equal(promoted.courses[1].modules[0].id, moduleValue.id);

  const demoted = demoteCourseToModule(promoted, {
    coursePath: ["course-promoted"],
    targetCoursePath: coursePath,
    moduleId: "module-demoted",
    mode: "move"
  });
  assert.equal(demoted.courses.length, 1);
  assert.equal(demoted.courses[0].modules.at(-1).id, "module-demoted");
});

test("entityPath distingue ids repetidos depois de copiar entre cursos", async () => {
  const project = await fixture();
  const { moduleValue, modulePath } = firstPath(project);
  const promoted = promoteModuleToCourse(project, {
    modulePath,
    courseId: "course-promoted",
    goal: "Estudar o módulo de forma independente.",
    mode: "copy"
  });
  const renamed = renameWorkspaceEntity(promoted, {
    entityType: "module",
    entityPath: ["course-promoted", moduleValue.id],
    title: "Cópia independente"
  });
  assert.notEqual(renamed.courses[0].modules[0].title, "Cópia independente");
  assert.equal(renamed.courses[1].modules[0].title, "Cópia independente");
});

test("excluir dependência numa cópia não altera outra lição com os mesmos ids", async () => {
  const project = await fixture();
  const { course, moduleValue, lesson, microsequence, modulePath } = firstPath(project);
  const dependent = structuredClone(microsequence);
  dependent.id = "micro-dependent";
  dependent.dependsOn = [microsequence.id];
  dependent.cards = dependent.cards.map((card, index) => ({
    ...card,
    id: `dependent-card-${index + 1}`
  }));
  const withDependency = insertWorkspaceEntity(project, {
    entityType: "microsequence",
    parentPath: [...modulePath, lesson.id],
    entity: dependent
  });
  const copied = promoteModuleToCourse(withDependency, {
    modulePath,
    courseId: "course-copy",
    goal: "Cópia",
    mode: "copy"
  });
  const changed = deleteWorkspaceEntity(copied, {
    entityType: "microsequence",
    entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id]
  });
  assert.deepEqual(
    changed.courses[0].modules[0].lessons[0].microsequences[0].dependsOn,
    []
  );
  assert.deepEqual(
    changed.courses[1].modules[0].lessons[0].microsequences[1].dependsOn,
    [microsequence.id]
  );
});
