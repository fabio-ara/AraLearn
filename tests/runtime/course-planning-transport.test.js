import assert from "node:assert/strict";
import test from "node:test";

import { expandPlanningTransport, PLANNING_TRANSPORT_ENCODING } from "../../supabase/functions/_shared/aralearn-authoring/coursePlanningTransport.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const PLAN = "20000000-0000-4000-8000-000000000001";
const PART = "30000000-0000-4000-8000-000000000001";

function microsequenceSource(id, position) {
  return {
    id, position,
    title: "Micro " + id,
    objective: "Objetivo " + id,
    explanationPlan: { purpose: "Plano " + id, prerequisites: [], relations: [], sourceIds: [] },
    explanation: { title: "Explicacao " + id, content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: id } }] },
    contentReview: { state: "current", microsequenceId: id },
    role: "explain",
    dependencyMicrosequenceIds: []
  };
}

function compactEntry(id, productionPosition) {
  return {
    id, productionPosition,
    curriculumPath: { moduleId: "module-1", moduleTitle: "Modulo 1", lessonId: "lesson-1", lessonTitle: "Licao 1" },
    studyUnitCount: 0
  };
}

function compactPayload(options) {
  const settings = options || {};
  const curriculumIds = settings.curriculumIds || ["ms-1"];
  const partIds = settings.partIds || ["ms-1"];
  return {
    payloadEncoding: PLANNING_TRANSPORT_ENCODING,
    contract: "aralearn.course-instructional-plan.v3",
    courseId: COURSE,
    courseRevision: 7,
    plan: {
      id: PLAN, version: 1, title: "Curso sintetico", objective: "", audience: "", scope: "",
      curriculumMapStatus: "approved",
      curriculum: { modules: [{ id: "module-1", position: 0, title: "Modulo 1", objective: "",
        lessons: [{ id: "lesson-1", position: 0, title: "Licao 1", objective: "",
          microsequences: curriculumIds.map((id, index) => microsequenceSource(id, index)) }] }] },
      curriculumScopeItems: [], intendedLearningOutcomes: [], instructionalAnalysisUnits: [],
      evidenceRequirements: [], parts: [{ id: PART, position: 0, title: "Parte 1", intent: "",
        progression: [], version: 1,
        microsequences: partIds.map((id, index) => compactEntry(id, index)) }], counts: {}
    },
    approvalBasis: { courseRevision: 7, planVersion: 1, basisHash: "0000" }
  };
}

test("expande o transporte compacto para a representacao legada completa", () => {
  const expanded = expandPlanningTransport(compactPayload());
  assert.equal("payloadEncoding" in expanded, false);
  const part = expanded.plan.parts[0].microsequences[0];
  assert.deepStrictEqual(Object.keys(part).sort(), ["contentReview", "curriculumPath", "explanation", "explanationPlan", "goal", "id", "productionPosition", "role", "studyUnitCount", "title"]);
  assert.equal(part.goal, "Objetivo ms-1");
  assert.equal(part.title, "Micro ms-1");
  assert.equal(part.role, "explain");
  assert.deepStrictEqual(part.explanation, microsequenceSource("ms-1", 0).explanation);
  assert.deepStrictEqual(part.explanationPlan, microsequenceSource("ms-1", 0).explanationPlan);
  assert.deepStrictEqual(part.contentReview, { state: "current", microsequenceId: "ms-1" });
  assert.deepStrictEqual(part.curriculumPath, { moduleId: "module-1", moduleTitle: "Modulo 1", lessonId: "lesson-1", lessonTitle: "Licao 1" });
  assert.deepStrictEqual(expanded.approvalBasis, { courseRevision: 7, planVersion: 1, basisHash: "0000" });
  assert.deepStrictEqual(expanded.plan.curriculum.modules[0].lessons[0].microsequences[0], microsequenceSource("ms-1", 0));
});

test("recusa payload sem a marca interna, sem fallback para a forma legada", () => {
  const legacy = { contract: "aralearn.course-instructional-plan.v3", courseId: COURSE, courseRevision: 7, plan: { parts: [] } };
  assert.throws(() => expandPlanningTransport(legacy), (error) => error.code === "course_service_unavailable" && /transporte compacto esperado/u.test(error.message));
  assert.throws(() => expandPlanningTransport(null), (error) => error.code === "course_service_unavailable");
  assert.throws(() => expandPlanningTransport({ payloadEncoding: "outra-coisa" }), (error) => error.code === "course_service_unavailable");
});

test("recusa referencia ausente, identidade repetida e campo nao previsto", () => {
  assert.throws(() => expandPlanningTransport(compactPayload({ partIds: ["ms-2"] })), /ausente do curr/u);
  assert.throws(() => expandPlanningTransport(compactPayload({ curriculumIds: ["ms-1", "ms-1"] })), /repete a mesma/u);
  const withExtra = compactPayload();
  withExtra.plan.parts[0].microsequences[0].title = "duplicado no transporte";
  assert.throws(() => expandPlanningTransport(withExtra), /campos n/u);
});

test("recusa curriculo ou lote ausente", () => {
  const withoutParts = compactPayload();
  delete withoutParts.plan.parts;
  assert.throws(() => expandPlanningTransport(withoutParts), /lotes do curso/u);
  const withoutCurriculum = compactPayload();
  delete withoutCurriculum.plan.curriculum;
  assert.throws(() => expandPlanningTransport(withoutCurriculum), /curr.culo do curso/u);
});
