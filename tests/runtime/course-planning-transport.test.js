import assert from "node:assert/strict";
import test from "node:test";

import { expandPlanningTransport, expandReviewPlanningTransport, PLANNING_TRANSPORT_ENCODING,
  REVIEW_PLANNING_TRANSPORT_ENCODING } from "../../supabase/functions/_shared/aralearn-authoring/coursePlanningTransport.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const PLAN = "20000000-0000-4000-8000-000000000001";
const PART = "30000000-0000-4000-8000-000000000001";

// Ordem de chaves do jsonb do Postgres para exatamente estes dez campos.
const LEGACY_KEY_ORDER = ["id", "goal", "role", "title", "explanation", "contentReview",
  "curriculumPath", "studyUnitCount", "explanationPlan", "productionPosition"];

function curriculumMicrosequence(id, position) {
  return "{\"id\":\"" + id + "\",\"position\":" + position +
    ",\"title\":\"Micro " + id + "\",\"objective\":\"Objetivo " + id + "\"," +
    "\"role\":\"explain\",\"dependencyMicrosequenceIds\":[]," +
    "\"explanationPlan\":{\"purpose\":\"Plano " + id + "\"}," +
    "\"explanation\":{\"title\":\"Explicacao " + id + "\",\"content\":[]}," +
    "\"contentReview\":{\"state\":\"current\",\"microsequenceId\":\"" + id + "\"}}";
}

function compactPayload(options) {
  const settings = options || {};
  const curriculumIds = settings.curriculumIds || ["ms-1"];
  const partIds = settings.partIds || ["ms-1"];
  const extra = settings.extra || "";
  const microsequences = curriculumIds.map((id, index) => curriculumMicrosequence(id, index)).join(",");
  const entries = partIds.map((id, index) => "{\"id\":\"" + id + "\",\"productionPosition\":" + index +
    ",\"curriculumPath\":{\"moduleId\":\"module-a\",\"moduleTitle\":\"Modulo\",\"lessonId\":\"lesson-a\",\"lessonTitle\":\"Licao\"}," +
    "\"studyUnitCount\":" + index + "}").join(",");
  return JSON.parse("{\"payloadEncoding\":\"" + PLANNING_TRANSPORT_ENCODING + "\"," +
    "\"contract\":\"aralearn.course-instructional-plan.v3\",\"courseId\":\"" + COURSE + "\",\"courseRevision\":7," +
    "\"plan\":{\"id\":\"" + PLAN + "\",\"version\":1,\"curriculumMapStatus\":\"approved\"," +
    "\"curriculum\":{\"modules\":[{\"id\":\"module-a\",\"position\":0,\"lessons\":[{\"id\":\"lesson-a\",\"position\":0," +
    "\"microsequences\":[" + microsequences + "]}]}]}," +
    "\"curriculumScopeItems\":[],\"instructionalAnalysisUnits\":[],\"evidenceRequirements\":[]," +
    "\"parts\":[{\"id\":\"" + PART + "\",\"position\":0,\"progress\":{\"state\":\"planned\"}," +
    "\"microsequences\":[" + entries + "]}]" + extra + "}," +
    "\"approvalBasis\":{\"courseRevision\":7,\"planVersion\":1,\"basisHash\":\"00\"}}");
}

function reviewCompactPayload(options) {
  const payload = compactPayload(options);
  payload.payloadEncoding = REVIEW_PLANNING_TRANSPORT_ENCODING;
  payload.contract = "aralearn.course-review-plan.v1";
  delete payload.approvalBasis;
  delete payload.plan.instructionalAnalysisUnits;
  delete payload.plan.evidenceRequirements;
  for (const moduleValue of payload.plan.curriculum.modules) {
    for (const lesson of moduleValue.lessons) {
      for (const item of lesson.microsequences) delete item.contentReview;
    }
  }
  for (const part of payload.plan.parts) {
    delete part.progress;
    for (const item of part.microsequences) delete item.studyUnitCount;
  }
  return payload;
}

test("reconstitui o lote na ordem do jsonb sem tocar no restante da arvore", () => {
  const expanded = expandPlanningTransport(compactPayload());
  assert.equal("payloadEncoding" in expanded, false);
  const part = expanded.plan.parts[0].microsequences[0];
  assert.deepStrictEqual(Object.keys(part), LEGACY_KEY_ORDER);
  assert.equal(part.goal, "Objetivo ms-1");
  assert.equal(part.title, "Micro ms-1");
  assert.equal(part.role, "explain");
  assert.deepStrictEqual(part.contentReview, { state: "current", microsequenceId: "ms-1" });
  assert.deepStrictEqual(part.curriculumPath, { moduleId: "module-a", moduleTitle: "Modulo", lessonId: "lesson-a", lessonTitle: "Licao" });
  assert.equal(part.studyUnitCount, 0);
  assert.equal(part.productionPosition, 0);
  assert.deepStrictEqual(expanded.plan.curriculum.modules[0].lessons[0].microsequences[0],
    JSON.parse(curriculumMicrosequence("ms-1", 0)));
  assert.equal(expanded.plan.parts[0].progress.state, "planned");
});

test("recusa payload sem a marca interna, sem fallback para a forma legada", () => {
  assert.throws(() => expandPlanningTransport({ contract: "aralearn.course-instructional-plan.v3", plan: { parts: [] } }),
    (error) => error.code === "course_service_unavailable" && /transporte compacto esperado/u.test(error.message));
  assert.throws(() => expandPlanningTransport(null), (error) => error.code === "course_service_unavailable");
  assert.throws(() => expandPlanningTransport({ payloadEncoding: "outra-coisa" }), (error) => error.code === "course_service_unavailable");
});

test("recusa referencia ausente, identidade repetida e campo nao previsto", () => {
  assert.throws(() => expandPlanningTransport(compactPayload({ partIds: ["ms-2"] })), /ausente do curr/u);
  assert.throws(() => expandPlanningTransport(compactPayload({ curriculumIds: ["ms-1", "ms-1"] })), /repete a mesma/u);
  const withExtra = compactPayload();
  withExtra.plan.parts[0].microsequences[0].title = "duplicado";
  assert.throws(() => expandPlanningTransport(withExtra), /campos n/u);
});

test("recusa campo obrigatorio ausente e preserva nulos validos", () => {
  const missingPosition = compactPayload();
  delete missingPosition.plan.parts[0].microsequences[0].productionPosition;
  assert.throws(() => expandPlanningTransport(missingPosition), /posi..o de produ/u);

  const missingExplanation = compactPayload();
  delete missingExplanation.plan.curriculum.modules[0].lessons[0].microsequences[0].explanation;
  assert.throws(() => expandPlanningTransport(missingExplanation), /omite o campo explanation/u);

  const nullTitle = compactPayload();
  nullTitle.plan.curriculum.modules[0].lessons[0].microsequences[0].title = null;
  const expanded = expandPlanningTransport(nullTitle);
  assert.equal(Object.hasOwn(expanded.plan.parts[0].microsequences[0], "title"), true);
  assert.equal(expanded.plan.parts[0].microsequences[0].title, null);
});

test("preserva subarvores desconhecidas com chaves unicode, __proto__ e constructor", () => {
  const extra = ",\"extra\":{\"__proto__\":{\"polluted\":true},\"constructor\":\"x\",\"a\u00e7\u00e3o\":\"acento\",\"0\":\"zero\",\"1\":\"um\"}";
  const expanded = expandPlanningTransport(compactPayload({ extra }));
  const extraValue = expanded.plan.extra;
  assert.equal(Object.hasOwn(extraValue, "__proto__"), true);
  assert.equal(Object.hasOwn(extraValue, "constructor"), true);
  assert.equal(extraValue.constructor, "x");
  assert.deepStrictEqual(Object.getOwnPropertyDescriptor(extraValue, "__proto__").value, { polluted: true });
  assert.equal(expanded.plan.extra.ação, "acento");
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.getPrototypeOf(extraValue), Object.prototype);
});

test("reconstitui a leitura de revisão sem exigir ou inventar contentReview global", () => {
  const expanded = expandReviewPlanningTransport(reviewCompactPayload());
  const part = expanded.plan.parts[0].microsequences[0];
  assert.deepStrictEqual(Object.keys(part), ["id", "goal", "title", "explanation",
    "curriculumPath", "explanationPlan", "productionPosition"]);
  assert.equal(Object.hasOwn(part, "contentReview"), false);
  assert.equal(Object.hasOwn(part, "role"), false);
  assert.equal(Object.hasOwn(part, "studyUnitCount"), false);
  assert.equal(Object.hasOwn(expanded, "approvalBasis"), false);
  assert.equal(Object.hasOwn(expanded.plan, "instructionalAnalysisUnits"), false);
  assert.deepStrictEqual(part.explanation, { title: "Explicacao ms-1", content: [] });
  assert.deepStrictEqual(part.explanationPlan, { purpose: "Plano ms-1" });
  assert.throws(() => expandPlanningTransport(reviewCompactPayload()),
    (error) => error.code === "course_service_unavailable" && /transporte compacto esperado/u.test(error.message));
  assert.throws(() => expandReviewPlanningTransport(compactPayload()),
    (error) => error.code === "course_service_unavailable" && /transporte compacto esperado/u.test(error.message));
  const withDiscardedCount = reviewCompactPayload();
  withDiscardedCount.plan.parts[0].microsequences[0].studyUnitCount = 1;
  assert.throws(() => expandReviewPlanningTransport(withDiscardedCount),
    (error) => error.code === "course_service_unavailable" && /campos não previstos/u.test(error.message));
});
