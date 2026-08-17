import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCourseAuthoringError,
  countCourseEntities,
  courseListCardinality,
  mergeCourseEntityPages,
  mergeCourseListPages,
  normalizeCourseDetail,
  normalizeCourseEntityPage,
  normalizeCourseListPage,
  projectCourseEntities,
  projectCoursePlanning
} from "../../src/ui/courseAuthoringViewModel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_COURSE_ID = "20000000-0000-4000-8000-000000000002";

function courseItem(courseId = COURSE_ID, title = "Fundamentos") {
  return {
    courseId,
    title,
    goal: "Compreender relações essenciais.",
    revision: 3,
    ownership: "owned",
    canEdit: true,
    moduleCount: 1,
    lessonCount: 1,
    topicCount: 0,
    microsequenceCount: 2,
    studyUnitCount: 4,
    updatedAt: "2026-08-17T12:00:00Z"
  };
}

function entities(items, options = {}) {
  return {
    contract: "aralearn.course-entities.v1",
    courseId: COURSE_ID,
    revision: 3,
    items,
    hasMore: options.hasMore === true,
    nextCursor: options.nextCursor || null,
    offline: options.offline === true
  };
}

test("lista distingue zero, um e muitos sem perder cursor ou estado offline conhecido", () => {
  const empty = normalizeCourseListPage({ items: [], hasMore: false, nextCursor: null });
  assert.equal(courseListCardinality(empty), "zero");

  const one = normalizeCourseListPage({
    items: [courseItem()],
    hasMore: false,
    nextCursor: null,
    offline: true
  });
  assert.equal(courseListCardinality(one), "one");
  assert.equal(one.offlineKnown, true);
  assert.equal(one.items[0].ownership, "owned");
  assert.equal(one.items[0].canEdit, true);
  assert.deepEqual(one.items[0].counts, {
    moduleCount: 1,
    lessonCount: 1,
    topicCount: 0,
    microsequenceCount: 2,
    studyUnitCount: 4
  });

  const cursor = {
    beforeUpdatedAt: "2026-08-17T11:00:00Z",
    beforeId: COURSE_ID
  };
  const first = normalizeCourseListPage({ items: [courseItem()], hasMore: true, nextCursor: cursor });
  const second = normalizeCourseListPage({
    items: [courseItem(SECOND_COURSE_ID, "Aplicações")],
    hasMore: false,
    nextCursor: null
  });
  const merged = mergeCourseListPages(first, second);
  assert.equal(courseListCardinality(first), "many");
  assert.equal(courseListCardinality(merged), "many");
  assert.deepEqual(merged.items.map((item) => item.courseId), [COURSE_ID, SECOND_COURSE_ID]);
});

test("detalhe e páginas de entidades exigem o mesmo Curso e a mesma revisão", () => {
  const course = normalizeCourseDetail({
    courseId: COURSE_ID,
    title: "Fundamentos",
    goal: "Aprender.",
    revision: 3,
    ownership: "owned",
    canEdit: true,
    counts: {
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 0,
      microsequenceCount: 1,
      studyUnitCount: 1
    },
    stale: true
  }, { expectedCourseId: COURSE_ID });
  assert.equal(course.offlineKnown, true);
  assert.equal(course.revision, 3);
  assert.equal(course.canEdit, true);

  assert.throws(
    () => normalizeCourseEntityPage({
      courseId: COURSE_ID,
      revision: 4,
      items: [],
      hasMore: false,
      nextCursor: null
    }, { expectedCourseId: COURSE_ID, expectedRevision: 3 }),
    (error) => error.code === "course_revision_changed"
  );
});

test("detalhe clona o estado autoral e projeta somente o resumo canônico do planejamento", () => {
  const source = {
    version: 1,
    parts: [{ id: "part-a", privateNote: "não renderizar" }, { id: "part-b" }],
    decisions: [{ id: "decision-a" }],
    mandate: { note: "interno" }
  };
  const course = normalizeCourseDetail({
    courseId: COURSE_ID,
    title: "Fundamentos",
    goal: "Compreender relações essenciais.",
    brief: "Priorizar exemplos concretos.",
    revision: 3,
    ownership: "owned",
    canEdit: true,
    authoringState: source
  }, { expectedCourseId: COURSE_ID });

  assert.notEqual(course.authoringState, source);
  assert.notEqual(course.authoringState.parts, source.parts);
  source.parts.push({ id: "part-c" });
  assert.equal(course.authoringState.parts.length, 2);
  assert.equal(Object.isFrozen(course.authoringState.parts[0]), true);
  assert.deepEqual(projectCoursePlanning(course), {
    objective: "Compreender relações essenciais.",
    orientations: "Priorizar exemplos concretos.",
    partCount: 2,
    decisionCount: 1
  });
  assert.deepEqual(projectCourseEntities([], { section: "planning" }), []);
});

test("Autoria rejeita Curso compartilhado antes de projetar título ou deep link", () => {
  assert.throws(
    () => normalizeCourseDetail({
      courseId: COURSE_ID,
      title: "Fundamentos",
      goal: "Aprender.",
      revision: 3,
      ownership: "shared",
      canEdit: false,
      authoringState: null
    }),
    (error) => error.code === "course_not_owned"
  );
  assert.throws(
    () => normalizeCourseListPage({
      items: [{ ...courseItem(), ownership: "shared", canEdit: false }],
      hasMore: false,
      nextCursor: null
    }),
    (error) => error.code === "course_not_owned"
  );
});

test("entidades viram estrutura plana e conteúdo com contexto curto", () => {
  const firstPage = normalizeCourseEntityPage(entities([
    {
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      version: 1,
      content: { title: "Base" }
    },
    {
      entityType: "lesson",
      entityId: "lesson-a",
      parentType: "module",
      parentId: "module-a",
      position: 0,
      version: 1,
      content: { title: "Relações" }
    },
    {
      entityType: "microsequence",
      entityId: "micro-a",
      parentType: "lesson",
      parentId: "lesson-a",
      position: 0,
      version: 1,
      content: { title: "Primeiro caso", goal: "Reconhecer o padrão." }
    }
  ], {
    hasMore: true,
    nextCursor: { entityType: "microsequence", entityId: "micro-a" }
  }), { expectedCourseId: COURSE_ID, expectedRevision: 3 });
  const secondPage = normalizeCourseEntityPage(entities([{
    entityType: "card",
    entityId: "unit-a",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 1,
    version: 1,
    content: {
      title: "Exemplo guiado",
      content: [{ data: { text: "Compare os dois valores." } }]
    }
  }]), { expectedCourseId: COURSE_ID, expectedRevision: 3 });
  const merged = mergeCourseEntityPages(firstPage, secondPage);

  assert.deepEqual(countCourseEntities(merged.items), { microsequences: 1, units: 1 });
  assert.deepEqual(
    projectCourseEntities(merged.items, { section: "structure" }).map((item) => item.label),
    ["Módulo", "Lição", "Microssequência"]
  );
  const content = projectCourseEntities(merged.items, { section: "content" });
  assert.equal(content.length, 1);
  assert.equal(content[0].label, "Unidade");
  assert.equal(content[0].summary, "Compare os dois valores.");
  assert.equal(content[0].context, "Base · Relações · Primeiro caso");
});

test("projeção recompõe a ordem didática sem depender da ordem de transporte", () => {
  const items = normalizeCourseEntityPage(entities([
    { entityType: "card", entityId: "unit-b", parentType: "microsequence", parentId: "micro-b", position: 1, content: { title: "B" } },
    { entityType: "microsequence", entityId: "micro-b", parentType: "lesson", parentId: "lesson-a", position: 1, content: { title: "Segunda" } },
    { entityType: "module", entityId: "module-a", parentType: null, parentId: null, position: 0, content: { title: "Módulo" } },
    { entityType: "card", entityId: "unit-a", parentType: "microsequence", parentId: "micro-a", position: 1, content: { title: "A" } },
    { entityType: "lesson", entityId: "lesson-a", parentType: "module", parentId: "module-a", position: 0, content: { title: "Lição" } },
    { entityType: "microsequence", entityId: "micro-a", parentType: "lesson", parentId: "lesson-a", position: 0, content: { title: "Primeira" } }
  ]), { expectedCourseId: COURSE_ID, expectedRevision: 3 });

  assert.deepEqual(
    projectCourseEntities(items.items, { section: "structure" }).map((item) => item.title),
    ["Módulo", "Lição", "Primeira", "Segunda"]
  );
  assert.deepEqual(
    projectCourseEntities(items.items, { section: "content" }).map((item) => item.title),
    ["A", "B"]
  );
});

test("falhas conhecidas não expõem mensagem técnica", () => {
  assert.deepEqual(classifyCourseAuthoringError({ status: 404 }), {
    kind: "access-revoked",
    message: "O acesso a este Curso não está mais disponível."
  });
  assert.equal(classifyCourseAuthoringError({ code: "PT404" }).kind, "access-revoked");
  assert.equal(classifyCourseAuthoringError({ code: "40001" }).kind, "revision-changed");
  assert.equal(
    classifyCourseAuthoringError({ code: "network_error" }, { knownCourse: courseItem() }).kind,
    "offline-known"
  );
  assert.deepEqual(classifyCourseAuthoringError(new Error("segredo técnico")), {
    kind: "error",
    message: "Não foi possível carregar esta área agora."
  });
});
