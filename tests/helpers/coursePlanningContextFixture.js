import { inspectCurricularMapCompleteness } from "../../src/domain/courseCurricularMapSlices.js";
import { courseDesignFixture } from "./courseDesignFixture.js";

export function coursePlanningContextFixture({ incomplete = false, revision = 1, version = 1, approved = false } = {}) {
  const courseId = "10000000-0000-4000-8000-000000000001";
  const scopeId = "20000000-0000-4000-8000-000000000002";
  const analysisId = "30000000-0000-4000-8000-000000000003";
  const course = { courseId, title: "Planejamento sintético", goal: "Relacionar mecanismo e evidência.", revision,
    ownership: "owned", canEdit: true, canObserve: true, visibility: "private", publicFileAccess: "restricted" };
  const explanationPlan = { purpose: "Desenvolver a relação entre mecanismo e evidência.", prerequisites: ["Distinguir causa e coincidência."],
    relations: ["A evidência deve discriminar mecanismos."], sourceIds: [] };
  const map = { audience: "Pessoas iniciantes.", prerequisites: [], scopeItems: [{ id: scopeId, statement: "Relacionar mecanismo e evidência.", position: 0 }],
    modules: [{ moduleId: "module-context", title: "Mecanismos", objective: "Examinar relações.", position: 0,
      lessons: [{ lessonId: "lesson-context", title: "Relações", objective: "Distinguir mecanismos.", position: 0,
        microsequences: [{ microsequenceId: "micro-context", title: "Base antes das unidades", objective: "Explicar uma relação.", position: 0,
          dependencyMicrosequenceIds: incomplete ? ["micro-ainda-ausente"] : [], scopeItemIds: [scopeId], explanationPlan }] }] }] };
  const curriculum = { modules: map.modules.map(module => ({ id: module.moduleId, title: module.title, objective: module.objective, position: module.position,
    lessons: module.lessons.map(lesson => ({ id: lesson.lessonId, title: lesson.title, objective: lesson.objective, position: lesson.position,
      microsequences: lesson.microsequences.map(ms => ({ id: ms.microsequenceId, title: ms.title, objective: ms.objective, position: ms.position,
        dependencyMicrosequenceIds: ms.dependencyMicrosequenceIds, explanationPlan: ms.explanationPlan, role: null })) })) })) };
  const plan = { contract: "aralearn.course-instructional-plan.v3", courseId, courseRevision: revision,
    plan: { id: "40000000-0000-4000-8000-000000000004", version, title: course.title, objective: course.goal,
      curriculumMapStatus: approved ? "approved" : "draft", audience: map.audience, declaredPrerequisites: [], scope: "Mecanismos.", curriculum,
      curriculumScopeItems: [{ ...map.scopeItems[0], state: "planned", curriculumTargets: [{ moduleId: "module-context", lessonId: "lesson-context", didacticMicrosequenceIds: ["micro-context"] }] }],
      preferredPartCount: { minimum: 1, maximum: 2, origin: "automatic" }, intendedLearningOutcomes: [], instructionalAnalysisUnits: [], evidenceRequirements: [], parts: [],
      counts: { intendedLearningOutcomeCount: 0, instructionalAnalysisUnitCount: 0, evidenceRequirementCount: 0, authoringPartCount: 0, linkedDidacticMicrosequenceCount: 0, studyUnitCount: 0 },
      updatedAt: "2026-09-09T12:00:00Z" } };
  const read = { contract: "aralearn.course-curricular-map.v1", courseId, courseRevision: revision, planVersion: version, map,
    mapApprovalReference: `inspected_map_${revision}_${version}`, completeness: inspectCurricularMapCompleteness(map) };
  const selection = { courseId, moduleId: "module-context", lessonId: "lesson-context", microsequenceId: "micro-context", studyUnitId: "unit-absent" };
  const designs = Object.fromEntries(["course", "module", "lesson", "didactic_microsequence"].map(scope => [scope, courseDesignFixture(selection, { scope, revision })]));
  designs.didactic_microsequence.targetPlanItems.instructionalAnalysisUnitIds = [analysisId];
  const entity = { entityId: "micro-context", entityType: "microsequence", version: 1, content: { explanationPlan,
    explanation: { title: "Base explicativa salva", content: [{ id: "base-text", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "O mecanismo relaciona causa e consequência." } }] } } };
  const review = { contract: "aralearn.course-content-review.v1", courseId, courseRevision: revision,
    targetKind: "microsequence_explanation", targetId: "micro-context", entityVersion: 1,
    basisHash: "a".repeat(64), reviewPolicy: "saved", contentReview: { state: "unregistered" } };
  const analytics = { course: { id: courseId, revision }, scope: { selected: { kind: "didactic_microsequence", ref: "micro-context" } },
    basis: { analysisUnits: [{ ref: analysisId, statement: "Relação causal", description: "Relação a distinguir de coincidência." }], evidenceRequirements: [], studyUnits: [] } };
  return { courseId, course, plan, read, designs, entity, review, analytics };
}
