import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildMicrotheoryReview,
  buildWorkspaceOutline,
  deleteWorkspaceEntity,
  demoteCourseToModule,
  attachWorkspaceEntity,
  mergeWorkspaceMicrosequences,
  moveWorkspaceEntity,
  promoteModuleToCourse,
  renameWorkspaceEntity,
  splitWorkspaceMicrosequence,
  validateAuthoringWorkspace
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";

async function fixture() {
  return JSON.parse(await readFile(
    new URL("../fixtures/package/project-visual.json", import.meta.url),
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

function coursePartIds(course) {
  return [
    course.id,
    ...course.modules.flatMap((moduleValue) => [
      moduleValue.id,
      ...moduleValue.lessons.flatMap((lesson) => [
        lesson.id,
        ...lesson.topics.map((topic) => topic.id),
        ...lesson.microsequences.flatMap((microsequence) => [
          microsequence.id,
          ...microsequence.cards.map((card) => card.id)
        ])
      ])
    ])
  ];
}

test("workspace lista a árvore e projeta somente microteoria no chat", async () => {
  const project = await fixture();
  const outline = buildWorkspaceOutline(project);
  const review = buildMicrotheoryReview(project);

  assert.equal(outline.courses[0].modules[0].lessons[0].microsequences.length, 1);
  const outlinedMicrosequence =
    outline.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(
    outlinedMicrosequence.cardCount,
    firstPath(project).microsequence.cards.length
  );
  assert.equal(Object.hasOwn(outlinedMicrosequence, "cards"), false);
  const microtheory = review.courses[0].modules[0].lessons[0].microtheories[0];
  const theoryCards = firstPath(project).microsequence.cards
    .filter((card) => card.role === "theory");
  assert.equal(typeof microtheory.content, "string");
  assert.ok(microtheory.content.length > 0);
  assert.equal(Array.isArray(microtheory.content), false);
  theoryCards.forEach((card) => {
    assert.doesNotMatch(microtheory.content, new RegExp(card.id, "u"));
  });
  assert.equal(
    microtheory.practiceCount,
    firstPath(project).microsequence.cards.filter((card) => card.role === "practice").length
  );
  assert.deepEqual(microtheory.covers, firstPath(project).microsequence.covers);
  assert.deepEqual(microtheory.checks, firstPath(project).microsequence.checks);
  assert.deepEqual(microtheory.errors, firstPath(project).microsequence.errors || []);
  assert.ok(microtheory.resources.every((resource) => resource.startsWith("aralearn.")));
  assert.deepEqual(microtheory.topics, []);

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

test("projeção de composite humaniza blocos, tópicos e resources", async () => {
  const project = await fixture();
  const { lesson, microsequence } = firstPath(project);
  lesson.topics = [{
    id: "topic-composite",
    label: "Modelo composto",
    kind: "concept",
    checks: ["explica a relação central"],
    errors: ["confundir bloco com resource"]
  }];
  microsequence.cards = [{
    id: "card-composite-teoria",
    position: 1,
    title: "Modelo em blocos",
    role: "theory",
    topics: ["topic-composite"],
    content: [
      { id: "heading-interno", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Visão geral" } },
      { id: "paragraph-interno", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "A relação central é verificável." } }
    ],
    response: null,
    feedback: [],
    sources: []
  }];

  const projected = buildMicrotheoryReview(project)
    .courses[0].modules[0].lessons[0].microtheories[0];
  assert.match(projected.content, /Visão geral/u);
  assert.match(projected.content, /A relação central é verificável\./u);
  assert.doesNotMatch(projected.content, /heading-interno|paragraph-interno|\{|\}/u);
  assert.deepEqual(projected.resources, ["aralearn.resource.paragraph"]);
  assert.deepEqual(projected.topics, [lesson.topics[0].label]);
});

test("renomear, mover, inserir e excluir são mutações isoladas", async () => {
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
  const inserted = attachWorkspaceEntity(renamed, {
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

  assert.equal(
    moved.courses[0].modules[0].lessons[1].microsequences[0].cards[0].id,
    card.id
  );
  const deleted = deleteWorkspaceEntity(moved, {
    entityType: "lesson",
    entityPath: lessonPath
  });
  assert.equal(deleted.courses[0].modules[0].lessons.length, 1);
  assert.equal(validateAuthoringWorkspace(deleted).contract, "aralearn.library.v1");
});

test("juntar e separar microssequências preserva cards e normaliza posições", async () => {
  const project = await fixture();
  const { microsequence, lessonPath, microsequencePath } = firstPath(project);
  const extra = structuredClone(microsequence);
  extra.id = "micro-workspace-extra";
  extra.title = "Prática adicional";
  extra.dependsOn = [microsequence.id];
  extra.cards = extra.cards.map((card, index) => ({
    ...card,
    id: `extra-card-${index + 1}`,
    position: index + 1
  }));
  const inserted = attachWorkspaceEntity(project, {
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
  assert.equal(Object.hasOwn(mergedMicro, "status"), false);
  assert.deepEqual(mergedMicro.cards.map((card) => card.position), mergedMicro.cards.map((_, index) => index + 1));

  const newMicrosequence = {
    ...structuredClone(microsequence),
    id: "micro-workspace-split",
    title: "Recorte conceitual",
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
  const inserted = attachWorkspaceEntity(project, {
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
  const copiedModule = promoted.courses[1].modules[0];
  assert.notEqual(copiedModule.id, moduleValue.id);
  assert.equal(copiedModule.id, "course-promoted--module-1");

  const demoted = demoteCourseToModule(promoted, {
    coursePath: ["course-promoted"],
    targetCoursePath: coursePath,
    moduleId: "module-demoted",
    mode: "move"
  });
  assert.equal(demoted.courses.length, 1);
  assert.equal(demoted.courses[0].modules.at(-1).id, "module-demoted");
  assert.equal(
    demoted.courses[0].modules.at(-1).lessons[0].id,
    copiedModule.lessons[0].id
  );
});

test("promoção por cópia remapeia ids profundamente de modo determinístico", async () => {
  const project = await fixture();
  const { course, moduleValue, modulePath } = firstPath(project);
  const promoted = promoteModuleToCourse(project, {
    modulePath,
    courseId: "course-promoted",
    goal: "Estudar o módulo de forma independente.",
    mode: "copy"
  });
  const deterministic = promoteModuleToCourse(project, {
    modulePath,
    courseId: "course-promoted",
    goal: "Estudar o módulo de forma independente.",
    mode: "copy"
  });
  const copiedModule = promoted.courses[1].modules[0];
  const renamed = renameWorkspaceEntity(promoted, {
    entityType: "module",
    entityPath: ["course-promoted", copiedModule.id],
    title: "Cópia independente"
  });

  assert.deepEqual(
    coursePartIds(promoted.courses[1]),
    coursePartIds(deterministic.courses[1])
  );
  assert.deepEqual(
    coursePartIds(course).filter((id) => coursePartIds(promoted.courses[1]).includes(id)),
    []
  );
  const allPromotedIds = promoted.courses.flatMap(coursePartIds);
  assert.equal(new Set(allPromotedIds).size, allPromotedIds.length);
  assert.notEqual(renamed.courses[0].modules[0].title, "Cópia independente");
  assert.equal(renamed.courses[1].modules[0].title, "Cópia independente");
  assert.equal(moduleValue.id, project.courses[0].modules[0].id);
});

test("promoção por cópia remapeia dependências, ramificações e tópicos internos", async () => {
  const project = await fixture();
  const { course, moduleValue, lesson, microsequence, modulePath } = firstPath(project);
  lesson.topics.push({
    id: "topic-workspace-copy",
    label: "Plano lógico",
    kind: "concept",
    checks: ["reconhece o plano"],
    errors: ["confunde plano com operação"]
  });
  microsequence.cards[0].topics = ["topic-workspace-copy", "tag-livre"];
  const dependent = structuredClone(microsequence);
  dependent.id = "micro-dependent";
  dependent.dependsOn = [microsequence.id];
  dependent.branchOf = microsequence.id;
  dependent.cards = dependent.cards.map((card, index) => ({
    ...card,
    id: `dependent-card-${index + 1}`
  }));
  const withDependency = attachWorkspaceEntity(project, {
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
  const copiedLesson = copied.courses[1].modules[0].lessons[0];
  const [copiedBase, copiedDependent] = copiedLesson.microsequences;

  assert.deepEqual(copiedDependent.dependsOn, [copiedBase.id]);
  assert.equal(copiedDependent.branchOf, copiedBase.id);
  assert.deepEqual(
    copiedBase.cards[0].topics,
    [copiedLesson.topics[0].id, "tag-livre"]
  );

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
    [copiedBase.id]
  );
});

test("rebaixamento por cópia remapeia profundamente e mantém o curso de origem", async () => {
  const project = await fixture();
  const { course, microsequence, modulePath } = firstPath(project);
  const dependent = structuredClone(microsequence);
  dependent.id = "micro-demote-dependent";
  dependent.dependsOn = [microsequence.id];
  dependent.branchOf = microsequence.id;
  dependent.cards = dependent.cards.map((card, index) => ({
    ...card,
    id: `demote-dependent-card-${index + 1}`
  }));
  const enriched = attachWorkspaceEntity(project, {
    entityType: "microsequence",
    parentPath: [...modulePath, firstPath(project).lesson.id],
    entity: dependent
  });
  const withTarget = promoteModuleToCourse(enriched, {
    modulePath,
    courseId: "course-demote-target",
    goal: "Receber o módulo copiado.",
    mode: "copy"
  });
  const demoted = demoteCourseToModule(withTarget, {
    coursePath: [course.id],
    targetCoursePath: ["course-demote-target"],
    moduleId: "module-demoted-copy",
    mode: "copy"
  });
  const sourceCourse = demoted.courses.find((item) => item.id === course.id);
  const targetCourse = demoted.courses.find((item) => item.id === "course-demote-target");
  const copiedModule = targetCourse.modules.at(-1);
  const copiedLesson = copiedModule.lessons[0];
  const [copiedBase, copiedDependent] = copiedLesson.microsequences;

  assert.equal(demoted.courses.length, 2);
  assert.deepEqual(sourceCourse, enriched.courses[0]);
  assert.deepEqual(
    coursePartIds(sourceCourse).filter((id) =>
      [copiedModule.id, ...copiedModule.lessons.flatMap((lessonValue) => [
        lessonValue.id,
        ...lessonValue.topics.map((topic) => topic.id),
        ...lessonValue.microsequences.flatMap((item) => [
          item.id,
          ...item.cards.map((card) => card.id)
        ])
      ])].includes(id)),
    []
  );
  assert.deepEqual(copiedDependent.dependsOn, [copiedBase.id]);
  assert.equal(copiedDependent.branchOf, copiedBase.id);
  const allDemotedIds = demoted.courses.flatMap(coursePartIds);
  assert.equal(new Set(allDemotedIds).size, allDemotedIds.length);
});

test("conversões por movimento preservam descendentes e removem a origem", async () => {
  const project = await fixture();
  const { course, moduleValue, lesson, modulePath } = firstPath(project);
  const promoted = promoteModuleToCourse(project, {
    modulePath,
    courseId: "course-moved",
    goal: "Mover sem recriar identidades.",
    mode: "move"
  });
  const movedCourse = promoted.courses.find((item) => item.id === "course-moved");

  assert.equal(promoted.courses.find((item) => item.id === course.id).modules.length, 0);
  assert.equal(movedCourse.modules[0].id, moduleValue.id);
  assert.equal(movedCourse.modules[0].lessons[0].id, lesson.id);

  const demoted = demoteCourseToModule(promoted, {
    coursePath: ["course-moved"],
    targetCoursePath: [course.id],
    moduleId: moduleValue.id,
    mode: "move"
  });
  const restoredModule = demoted.courses[0].modules[0];

  assert.equal(demoted.courses.some((item) => item.id === "course-moved"), false);
  assert.equal(restoredModule.id, moduleValue.id);
  assert.equal(restoredModule.lessons[0].id, lesson.id);
});
