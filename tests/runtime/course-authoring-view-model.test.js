import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCourseAuthoringError,
  countCourseEntities,
  courseListCardinality,
  mergeCourseEntityPages,
  mergeCourseListPages,
  normalizeCourseAuthoringPlan,
  normalizeCourseDetail,
  normalizeCourseEntityPage,
  normalizeCourseListPage,
  projectCourseEntities,
  projectCoursePlanning
} from "../../src/ui/courseAuthoringViewModel.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_COURSE_ID = "20000000-0000-4000-8000-000000000002";
const PART_ID = "30000000-0000-4000-8000-000000000003";
const SECOND_PART_ID = "40000000-0000-4000-8000-000000000004";
const ITEM_ID = "50000000-0000-4000-8000-000000000005";
const MATERIALIZATION_ID = "60000000-0000-4000-8000-000000000006";
const EVENT_ID = "42";
const PLAN_ID = "80000000-0000-4000-8000-000000000008";

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

test("planejamento normaliza listas nomeadas e projeta Partes fora da hierarquia", () => {
  const course = normalizeCourseDetail({
    courseId: COURSE_ID,
    title: "Fundamentos",
    goal: "Compreender relações essenciais.",
    revision: 3,
    ownership: "owned",
    canEdit: true
  }, { expectedCourseId: COURSE_ID });
  const plan = normalizeCourseAuthoringPlan({
    contract: "aralearn.course-instructional-plan.v1",
    courseId: COURSE_ID,
    courseRevision: 3,
    plan: {
      id: PLAN_ID,
      version: 2,
      title: "Fundamentos",
      objective: "Compreender relações essenciais.",
      audience: "Pessoas iniciantes.",
      scope: "Relações fundamentais.",
      authoringGuidance: "Priorizar exemplos concretos.",
      preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
      intendedLearningOutcomes: [{
        id: ITEM_ID,
        position: 0,
        statement: "Comparar relações.",
        version: 1
      }],
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts: [{
        id: PART_ID,
        title: "Relações iniciais",
        intent: "Materializar exemplos fundamentais.",
        version: 2,
        position: 0,
        microsequences: [{
          id: "micro-a",
          productionPosition: 0,
          title: "Primeiro caso",
          curriculumPath: {
            moduleId: "module-a",
            moduleTitle: "Base",
            lessonId: "lesson-a",
            lessonTitle: "Relações"
          },
          studyUnitCount: 2
        }],
        progress: {
          state: "partially_materialized",
          microsequenceCount: 1,
          studyUnitCount: 2,
          lastMaterialization: {
            id: MATERIALIZATION_ID,
            status: "running",
            version: 1,
            completedStepCount: 2,
            failedStepCount: 0,
            totalStepCount: 4,
            startedAt: "2026-08-17T10:00:00Z",
            updatedAt: "2026-08-17T10:10:00Z",
            completedAt: null
          }
        }
      }, {
        id: SECOND_PART_ID,
        title: "Aplicações",
        intent: null,
        version: 1,
        position: 1,
        microsequences: [],
        progress: {
          state: "planned",
          microsequenceCount: 0,
          studyUnitCount: 0,
          lastMaterialization: null
        }
      }],
      counts: {
        intendedLearningOutcomeCount: 1,
        instructionalAnalysisUnitCount: 0,
        evidenceRequirementCount: 0,
        authoringPartCount: 2,
        linkedDidacticMicrosequenceCount: 1,
        studyUnitCount: 2
      },
      updatedAt: "2026-08-17T10:10:00Z"
    },
    recentActivity: [{
      eventId: EVENT_ID,
      revision: 3,
      kind: "plan_changed",
      channel: "mcp",
      instructionalPlanItemId: ITEM_ID,
      partId: null,
      materializationId: null,
      createdAt: "2026-08-17T10:10:00Z"
    }]
  }, { expectedCourseId: COURSE_ID, expectedCourseRevision: 3 });

  const projection = projectCoursePlanning(course, plan);
  assert.equal(Object.isFrozen(plan.plan.parts[0]), true);
  assert.equal(Object.isFrozen(plan.plan.intendedLearningOutcomes[0]), true);
  assert.deepEqual({
    objective: projection.objective,
    audience: projection.audience,
    range: projection.preferredPartCount,
    linked: projection.linkedMicrosequenceCount,
    studyUnits: projection.studyUnitCount,
    status: projection.parts[0].status
  }, {
    objective: "Compreender relações essenciais.",
    audience: "Pessoas iniciantes.",
    range: { minimum: 7, maximum: 12, origin: "automatic" },
    linked: 1,
    studyUnits: 2,
    status: "partially_materialized"
  });
  assert.equal(projection.parts[0].linkedMicrosequenceCount, 1);
  assert.equal(projection.recentActivity[0].eventId, "42");
  assert.equal(projection.recentActivity[0].kind, "plan_changed");
  assert.equal(projection.recentActivity[0].instructionalPlanItemId, ITEM_ID);
  assert.deepEqual(projectCourseEntities([], { section: "planning" }), []);
});

test("atividade recente aceita somente o bigint identity decimal positivo do banco", () => {
  const payload = {
    contract: "aralearn.course-instructional-plan.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    plan: {
      id: PLAN_ID,
      version: 2,
      title: "Fundamentos",
      objective: "Aprender.",
      audience: "",
      scope: "",
      authoringGuidance: "",
      preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
      intendedLearningOutcomes: [],
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts: [],
      counts: {
        intendedLearningOutcomeCount: 0,
        instructionalAnalysisUnitCount: 0,
        evidenceRequirementCount: 0,
        authoringPartCount: 0,
        linkedDidacticMicrosequenceCount: 0,
        studyUnitCount: 0
      },
      updatedAt: "2026-08-17T10:10:00Z"
    },
    recentActivity: [{
      eventId: "9223372036854775807",
      revision: 4,
      kind: "plan_changed",
      channel: "application",
      instructionalPlanItemId: null,
      partId: null,
      materializationId: null,
      createdAt: "2026-08-17T10:10:00Z"
    }]
  };

  const normalized = normalizeCourseAuthoringPlan(payload);
  assert.equal(normalized.recentActivity[0].eventId, "9223372036854775807");
  for (const eventId of [
    "0",
    "01",
    "9223372036854775808",
    "70000000-0000-4000-8000-000000000007",
    42
  ]) {
    assert.throws(
      () => normalizeCourseAuthoringPlan({
        ...payload,
        recentActivity: [{ ...payload.recentActivity[0], eventId }]
      }),
      (error) => error.code === "invalid_authoring_plan"
    );
  }
});

test("caminho curricular usa o mesmo limite canônico de 240 caracteres", () => {
  const curriculumId = "x".repeat(240);
  const base = {
    contract: "aralearn.course-instructional-plan.v1",
    courseId: COURSE_ID,
    courseRevision: 3,
    plan: {
      id: PLAN_ID,
      version: 1,
      title: "Fundamentos",
      objective: "Aprender.",
      audience: "",
      scope: "",
      authoringGuidance: "",
      preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
      intendedLearningOutcomes: [],
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts: [{
        id: PART_ID,
        title: "Parte",
        intent: "",
        version: 1,
        position: 0,
        microsequences: [{
          id: "micro-a",
          productionPosition: 0,
          title: "Microssequência",
          curriculumPath: {
            moduleId: curriculumId,
            moduleTitle: "Módulo",
            lessonId: curriculumId,
            lessonTitle: "Lição"
          },
          studyUnitCount: 0
        }],
        progress: {
          state: "partially_materialized",
          microsequenceCount: 1,
          studyUnitCount: 0,
          lastMaterialization: null
        }
      }],
      counts: {
        intendedLearningOutcomeCount: 0,
        instructionalAnalysisUnitCount: 0,
        evidenceRequirementCount: 0,
        authoringPartCount: 1,
        linkedDidacticMicrosequenceCount: 1,
        studyUnitCount: 0
      },
      updatedAt: "2026-08-17T10:10:00Z"
    },
    recentActivity: []
  };

  assert.equal(
    normalizeCourseAuthoringPlan(base).plan.parts[0].microsequences[0]
      .curriculumPath.moduleId.length,
    240
  );
  for (const field of ["moduleId", "lessonId"]) {
    const invalid = structuredClone(base);
    invalid.plan.parts[0].microsequences[0].curriculumPath[field] = "x".repeat(241);
    assert.throws(
      () => normalizeCourseAuthoringPlan(invalid),
      (error) => error.code === "invalid_authoring_plan"
    );
  }
});

test("planejamento recusa segunda autoridade de título ou objetivo e vínculos duplicados", () => {
  const course = normalizeCourseDetail({
    courseId: COURSE_ID,
    title: "Fundamentos",
    goal: "Aprender.",
    revision: 3,
    ownership: "owned",
    canEdit: true
  });
  const base = {
    contract: "aralearn.course-instructional-plan.v1",
    courseId: COURSE_ID,
    courseRevision: 3,
    plan: {
      id: PLAN_ID,
      version: 1,
      title: "Outro título",
      objective: "Aprender.",
      audience: null,
      scope: null,
      authoringGuidance: null,
      preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
      intendedLearningOutcomes: [],
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts: [],
      counts: {
        intendedLearningOutcomeCount: 0,
        instructionalAnalysisUnitCount: 0,
        evidenceRequirementCount: 0,
        authoringPartCount: 0,
        linkedDidacticMicrosequenceCount: 0,
        studyUnitCount: 0
      },
      updatedAt: "2026-08-17T10:00:00Z"
    },
    recentActivity: []
  };
  const plan = normalizeCourseAuthoringPlan(base);
  assert.throws(
    () => projectCoursePlanning(course, plan),
    (error) => error.code === "invalid_authoring_plan"
  );
  assert.throws(
    () => normalizeCourseAuthoringPlan({
      ...base,
      plan: {
        ...base.plan,
        title: "Fundamentos",
        preferredPartCount: { minimum: 13, maximum: 12, origin: "author" }
      }
    }),
    (error) => error.code === "invalid_authoring_plan"
  );
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
