import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCourseAuthoringError,
  courseListCardinality,
  mergeCourseDesignScopePages,
  mergeCourseListPages,
  normalizeCourseDesign,
  normalizeCourseDesignChange,
  normalizeCourseAuthoringOutline,
  normalizeCourseAuthoringPlan,
  normalizeCourseDetail,
  normalizeCourseListPage,
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

function outlineFixture() {
  return {
    contract: "aralearn.course.v1",
    courseId: COURSE_ID,
    title: "Fundamentos",
    goal: "Compreender relações essenciais.",
    revision: 3,
    ownership: "owned",
    canEdit: true,
    counts: {
      moduleCount: 1,
      lessonCount: 1,
      topicCount: 1,
      microsequenceCount: 2,
      studyUnitCount: 4
    },
    createdAt: "2026-08-17T10:00:00Z",
    updatedAt: "2026-08-17T12:00:00Z",
    outline: {
      courseId: COURSE_ID,
      title: "Fundamentos",
      goal: "Compreender relações essenciais.",
      modules: [{
        id: "module-a",
        title: "Base",
        lessons: [{
          id: "lesson-a",
          title: "Relações",
          topics: [{ id: "topic-a", title: "Proporção", summary: "Uma relação." }],
          microsequences: [{
            id: "micro-a",
            title: "Primeiro caso",
            goal: "Reconhecer o padrão.",
            studyUnitCount: 1
          }, {
            id: "micro-b",
            title: "Segundo caso",
            studyUnitCount: 3
          }]
        }]
      }]
    },
    deepLink: `#/authoring/courses/${COURSE_ID}?section=structure`
  };
}

function courseDesignFixture({
  children = [{ kind: "module", ref: "module-a", label: "Base", position: 0 }],
  childCount = children.length,
  hasMoreChildren = false,
  nextChildCursor = null
} = {}) {
  const definitions = [{
    id: "new_analysis_unit_ceiling_per_expository_study_unit",
    label: "Novas unidades de análise por Unidade expositiva",
    construct: "Quantidade de unidades novas introduzidas em uma explicação.",
    operationalization: "Conta identidades introduzidas por Unidade expositiva.",
    limitations: "O agregado não demonstra desenvolvimento conceitual.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: ["https://doi.org/10.1111/j.1551-6709.2012.01245.x"],
    supportedScopes: ["course", "lesson", "didactic_microsequence"],
    valueSchema: { type: "integer", minimum: 1, maximum: 8 },
    defaultValue: 2
  }, {
    id: "required_explanation_forms",
    label: "Formas exigidas de explicação",
    construct: "Formas complementares usadas para desenvolver um termo.",
    operationalization: "Registra as formas desenvolvidas na materialização.",
    limitations: "Presença não prova clareza.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: ["https://doi.org/10.1080/01638539609544975"],
    supportedScopes: ["course", "lesson", "didactic_microsequence"],
    valueSchema: {
      type: "set",
      allowedValues: [
        "plain_definition", "concrete_example", "mechanism", "contrast",
        "application_condition", "limit_or_exception", "worked_example", "representation_link"
      ],
      minimumItems: 1,
      maximumItems: 8
    },
    defaultValue: ["plain_definition", "concrete_example", "mechanism", "contrast"]
  }, {
    id: "minimum_distinct_practice_opportunities_per_evidence_requirement",
    label: "Oportunidades distintas de prática",
    construct: "Quantidade de oportunidades para o mesmo requisito de evidência.",
    operationalization: "Conta oportunidades distintas registradas.",
    limitations: "Quantidade não mede recuperação bem-sucedida.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: ["https://doi.org/10.1111/j.1467-9280.2006.01693.x"],
    supportedScopes: ["course", "lesson", "didactic_microsequence"],
    valueSchema: { type: "integer", minimum: 1, maximum: 16 },
    defaultValue: 2
  }, {
    id: "required_practice_variation_dimensions",
    label: "Dimensões exigidas de variação",
    construct: "Aspectos variados entre oportunidades de prática.",
    operationalization: "Registra as dimensões variadas mantendo a operação-alvo.",
    limitations: "Variação registrada não prova transferência.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: ["https://doi.org/10.1002/acp.1598"],
    supportedScopes: ["course", "lesson", "didactic_microsequence"],
    valueSchema: {
      type: "set",
      allowedValues: [
        "case_or_data", "context", "task_feature", "external_representation", "support_level"
      ],
      minimumItems: 1,
      maximumItems: 5
    },
    defaultValue: ["case_or_data"]
  }];
  const componentOptions = Array.from({ length: 32 }, (_, index) => ({
    ref: `aralearn.resource.component_${String(index + 1).padStart(2, "0")}@1.0.0`,
    label: `Componente ${index + 1}`,
    purpose: `Finalidade acadêmica ${index + 1}.`
  }));
  return {
    contract: "aralearn.course-design.v1",
    courseId: COURSE_ID,
    courseRevision: 3,
    parameterCatalogVersion: "1.0.0",
    scopeContext: {
      current: { kind: "course", ref: COURSE_ID, label: "Fundamentos" },
      ancestors: [],
      children,
      childCount,
      hasMoreChildren,
      nextChildCursor
    },
    definitions,
    parameters: definitions.map((definition) => ({
      parameterId: definition.id,
      localAssignment: null,
      effectiveAssignment: {
        changeId: null,
        value: structuredClone(definition.defaultValue),
        origin: "system_default",
        reason: "Hipótese operacional inicial do produto.",
        sourceScope: null,
        inherited: false
      }
    })),
    guidance: {
      localRevision: {
        revisionId: "91000000-0000-4000-8000-000000000019",
        guidance: "Explique cada termo antes de depender dele.",
        origin: "migration",
        reason: "Texto preservado do planejamento anterior."
      },
      effectiveRevisions: [{
        revisionId: "91000000-0000-4000-8000-000000000019",
        guidance: "Explique cada termo antes de depender dele.",
        origin: "migration",
        reason: "Texto preservado do planejamento anterior.",
        sourceScope: { kind: "course", ref: COURSE_ID },
        currentInterpretation: {
          interpretationId: "12",
          guidanceRevisionId: "91000000-0000-4000-8000-000000000019",
          interpretation: {
            summary: "Desenvolver termos antes de usá-los.",
            directives: [{ kind: "require", statement: "Definir cada termo novo." }],
            divergences: [],
            questions: ["Qual exemplo concreto deve vir primeiro?"]
          },
          createdAt: "2026-08-17T12:00:00Z"
        }
      }]
    },
    componentCatalog: { version: "1-3e5629f8", options: componentOptions },
    componentPolicy: {
      localChange: null,
      effectiveChange: {
        changeId: null,
        policy: {
          catalogVersion: "1-3e5629f8",
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        origin: "system_default",
        reason: "Todos os componentes atuais começam disponíveis.",
        sourceScope: null,
        inherited: false
      }
    },
    targetPlanItems: null,
    recentApplications: [{
      materializationId: MATERIALIZATION_ID,
      stepId: "92000000-0000-4000-8000-000000000029",
      didacticMicrosequenceId: "micro-a",
      recordedAt: "2026-08-17T12:10:00Z",
      contextHash: "a".repeat(64),
      studyUnitCount: 3,
      modeCounts: { expository: 1, practice: 1, mixed: 1 },
      introducedInstructionalAnalysisUnitIds: [ITEM_ID],
      developedExplanationForms: ["plain_definition", "concrete_example"],
      practiceOpportunityCount: 2,
      variedDimensions: ["case_or_data"],
      componentRefs: [componentOptions[0].ref]
    }]
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

test("detalhe e outline exigem o mesmo Curso e a mesma revisão", () => {
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
    () => normalizeCourseAuthoringOutline(outlineFixture(), {
      expectedCourseId: COURSE_ID,
      expectedRevision: 4
    }),
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

test("desenho por escopo preserva hipótese, proveniência, orientação original e fatos aplicados", () => {
  const design = normalizeCourseDesign(courseDesignFixture(), {
    expectedCourseId: COURSE_ID,
    expectedCourseRevision: 3,
    expectedScope: { kind: "course", ref: COURSE_ID }
  });
  assert.equal(design.definitions.length, 4);
  assert.equal(design.componentCatalog.options.length, 32);
  assert.equal(design.parameters[0].effectiveAssignment.origin, "system_default");
  assert.equal(design.guidance.localRevision.origin, "migration");
  assert.equal(design.guidance.effectiveRevisions.length, 1);
  assert.equal(design.targetPlanItems, null);
  assert.equal(
    design.guidance.effectiveRevisions[0].currentInterpretation.interpretation.directives[0].kind,
    "require"
  );
  assert.deepEqual(design.recentApplications[0].modeCounts, {
    expository: 1,
    practice: 1,
    mixed: 1
  });

  const micro = courseDesignFixture({ children: [] });
  micro.scopeContext = {
    current: {
      kind: "didactic_microsequence",
      ref: "micro-a",
      label: "Microssequência A"
    },
    ancestors: [
      { kind: "course", ref: COURSE_ID, label: "Fundamentos" },
      { kind: "module", ref: "module-a", label: "Módulo A" },
      { kind: "lesson", ref: "lesson-a", label: "Lição A" }
    ],
    children: [],
    childCount: 0,
    hasMoreChildren: false,
    nextChildCursor: null
  };
  micro.guidance.localRevision = null;
  micro.targetPlanItems = {
    instructionalAnalysisUnitIds: [ITEM_ID],
    evidenceRequirementIds: []
  };
  const normalizedMicro = normalizeCourseDesign(micro, {
    expectedCourseId: COURSE_ID,
    expectedCourseRevision: 3,
    expectedScope: { kind: "didactic_microsequence", ref: "micro-a" }
  });
  assert.deepEqual(normalizedMicro.targetPlanItems.instructionalAnalysisUnitIds, [ITEM_ID]);
});

test("desenho rejeita contrato singular legado, campo extra e política preferida excluída", () => {
  const singular = courseDesignFixture();
  singular.guidance = {
    localRevision: singular.guidance.localRevision,
    effectiveRevision: singular.guidance.effectiveRevisions[0],
    interpretations: []
  };
  assert.throws(
    () => normalizeCourseDesign(singular),
    (error) => error.code === "invalid_course_design"
  );

  assert.throws(
    () => normalizeCourseDesign({
      ...courseDesignFixture(),
      deepLink: `#/authoring/courses/${COURSE_ID}?section=parameters`
    }),
    (error) => error.code === "invalid_course_design"
  );

  const conflict = courseDesignFixture();
  const ref = conflict.componentCatalog.options[0].ref;
  conflict.componentPolicy.effectiveChange.policy.excludedRefs = [ref];
  conflict.componentPolicy.effectiveChange.policy.preferredRefs = [ref];
  assert.throws(
    () => normalizeCourseDesign(conflict),
    (error) => error.code === "invalid_course_design"
  );
});

test("confirmação de desenho preserva requestId opaco e expõe somente fato canônico", () => {
  const requestId = "client.retry:001";
  const changed = normalizeCourseDesignChange({
    contract: "aralearn.course-design-change.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    requestId,
    idempotent: true,
    changed: true,
    change: {
      changeId: "13",
      type: "interpret_guidance",
      scope: { kind: "lesson", ref: "lesson-a" }
    }
  }, { expectedCourseId: COURSE_ID, expectedRequestId: requestId });
  assert.equal(changed.requestId, requestId);
  assert.equal(changed.change.changeId, "13");

  const targetChange = normalizeCourseDesignChange({
    contract: "aralearn.course-design-change.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    requestId,
    idempotent: false,
    changed: true,
    change: {
      changeId: "14",
      type: "set_target_plan_items",
      scope: { kind: "didactic_microsequence", ref: "micro-a" }
    }
  });
  assert.equal(targetChange.change.scope.ref, "micro-a");

  assert.throws(
    () => normalizeCourseDesignChange({
      contract: "aralearn.course-design-change.v1",
      courseId: COURSE_ID,
      courseRevision: 5,
      requestId,
      idempotent: false,
      changed: true,
      change: {
        changeId: "14",
        type: "set_target_plan_items",
        scope: { kind: "lesson", ref: "lesson-a" }
      }
    }),
    (error) => error.code === "invalid_course_design"
  );

  assert.equal(normalizeCourseDesignChange({
    contract: "aralearn.course-design-change.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    requestId,
    idempotent: true,
    changed: false,
    change: null
  }).change, null);

  assert.throws(
    () => normalizeCourseDesignChange({
      contract: "aralearn.course-design-change.v1",
      courseId: COURSE_ID,
      courseRevision: 4,
      requestId,
      idempotent: false,
      changed: true,
      change: { type: "set_parameter" }
    }),
    (error) => error.code === "invalid_course_design"
  );
});

test("paginação de escopos agrega mais de cinquenta opções sem repetir o desenho", () => {
  const children = Array.from({ length: 50 }, (_, position) => ({
    kind: "module",
    ref: `module-${String(position + 1).padStart(2, "0")}`,
    label: `Módulo ${position + 1}`,
    position
  }));
  const first = courseDesignFixture({
    children: children.slice(0, 32),
    childCount: 50,
    hasMoreChildren: true,
    nextChildCursor: children[31].ref
  });
  const second = courseDesignFixture({
    children: children.slice(32),
    childCount: 50,
    hasMoreChildren: false,
    nextChildCursor: null
  });
  const merged = mergeCourseDesignScopePages(first, second);
  assert.equal(merged.scopeContext.children.length, 50);
  assert.equal(merged.scopeContext.children.at(-1).ref, "module-50");
  assert.equal(merged.scopeContext.hasMoreChildren, false);
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

test("outline vira uma apresentação estrutural derivada sem carregar Unidades de estudo", () => {
  const outline = normalizeCourseAuthoringOutline(outlineFixture(), {
    expectedCourseId: COURSE_ID,
    expectedRevision: 3
  });
  assert.deepEqual(outline.rows.map(({ label, title }) => [label, title]), [
    ["Módulo", "Base"],
    ["Lição", "Relações"],
    ["Tópico", "Proporção"],
    ["Microssequência didática", "Primeiro caso"],
    ["Microssequência didática", "Segundo caso"]
  ]);
  assert.deepEqual(outline.microsequences, [{
    id: "micro-a",
    label: "Base · Relações · Primeiro caso"
  }, {
    id: "micro-b",
    label: "Base · Relações · Segundo caso"
  }]);
  assert.equal(outline.rows.some((row) => row.kind === "study_unit"), false);
});

test("outline recusa contagens ou identidades duplicadas em vez de criar outra hierarquia", () => {
  const wrongCount = outlineFixture();
  wrongCount.counts.studyUnitCount = 5;
  assert.throws(
    () => normalizeCourseAuthoringOutline(wrongCount),
    (error) => error.code === "invalid_course_outline"
  );
  const duplicate = outlineFixture();
  duplicate.outline.modules[0].lessons[0].microsequences[1].id = "micro-a";
  assert.throws(
    () => normalizeCourseAuthoringOutline(duplicate),
    (error) => error.code === "invalid_course_outline"
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
