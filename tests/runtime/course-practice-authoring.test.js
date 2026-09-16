import assert from "node:assert/strict";
import test from "node:test";
import { inspectCoursePracticeAuthoring, requireCoursePracticeAuthoring } from "../../src/domain/coursePracticeAuthoring.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { applyManualStudyUnitEdit } from "../../src/ui/manualStudyUnitEdit.js";

const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const legacy = { id: "legacy", title: "Resposta anterior", role: "practice", position: 1, topics: [],
  content: [paragraph("body", "Distinga os participantes.")], feedback: [],
  response: { id: "response", package: "aralearn.response.open", version: "1.0.0", data: { prompt: "Explique." } } };
const practice = { ...legacy, response: { id: "response", package: "aralearn.response.choice", version: "1.0.0",
  data: { question: "Qual elemento é local?", selectionMode: "single", selectionCriterion: "correct", answerIds: ["socket"], options: [
    { id: "socket", text: "Socket" }, { id: "conexao", text: "Conexão" }
  ] } }, feedback: [paragraph("feedback", "Socket é a interface local; a conexão relaciona as pontas.")] };

test("nova resposta aberta é recusada, mas manutenção alheia preserva legado", () => {
  assert.equal(inspectCoursePracticeAuthoring(legacy)[0].code, "practice_response_legacy_only");
  assert.deepEqual(inspectCoursePracticeAuthoring({ ...legacy, title: "Título revisto" }, legacy), []);
  const reordered = { ...legacy, response: { data: legacy.response.data, version: "1.0.0",
    package: "aralearn.response.open", id: "response" } };
  assert.deepEqual(inspectCoursePracticeAuthoring(reordered, legacy), []);
  assert.throws(() => requireCoursePracticeAuthoring({ ...legacy, response: { ...legacy.response,
    data: { prompt: "Outro pedido." } } }, legacy), { code: "practice_response_legacy_only" });
  assert.equal(applyManualStudyUnitEdit(legacy, "content:body", { pathValues: { text: "Observe os dois participantes." } }).response.package,
    "aralearn.response.open");
  assert.throws(() => applyManualStudyUnitEdit(legacy, "response:response", { pathValues: { prompt: "Novo pedido." } }),
    { code: "practice_response_legacy_only" });
});

test("prática nova ou substituída exige feedback local e avalia sem rede", () => {
  assert.deepEqual(inspectCoursePracticeAuthoring(practice, legacy), []);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.evaluateResponse(practice.response, { selectedIds: ["socket"] }).correct, true);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.evaluateResponse(practice.response, { selectedIds: ["conexao"] }).correct, false);
  assert.match(RESOURCE_PACKAGE_REGISTRY.accessibleText(practice.feedback[0], "feedback"), /interface local/u);
  for (const feedback of [[], [paragraph("feedback", " ")]]) {
    assert.equal(inspectCoursePracticeAuthoring({ ...practice, feedback })[0].code, "practice_offline_feedback_required");
    assert.equal(inspectCoursePracticeAuthoring({ ...practice, feedback }, practice)[0].code, "practice_offline_feedback_required");
  }
});

test("lacuna de termo canônico aceita equivalentes explícitos, sem limite arbitrário de tokens", () => {
  const gap = { ...practice, content: [paragraph("body", "A interface local é o socket.")], response: {
    id: "response", package: "aralearn.response.gap", version: "1.0.0", data: { blanks: [{ id: "term",
      targetInstanceId: "body", targetPath: "text:socket", answer: "socket", responseMode: "text", acceptedAnswers: ["soquete"] }] }
  } };
  assert.deepEqual(inspectCoursePracticeAuthoring(gap), []);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.evaluateResponse(gap.response, { values: { term: "soquete" } }).correct, true);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.evaluateResponse(gap.response, { values: { term: "conexão" } }).correct, false);
});
