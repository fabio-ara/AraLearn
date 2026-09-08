import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMicrosequenceExplanation, normalizeMicrosequenceExplanationPlan } from "../../src/domain/courseExplanation.js";
import { composeCourseDocument, flattenCourseDocument, validateCourseEntityContent } from "../../src/domain/courseEntities.js";

const block = { id: "shared-definition", package: "aralearn.resource.paragraph", version: "1.0.0",
  data: { text: "Um host pode usar duas interfaces. As interfaces pertencem ao mesmo participante." } };
const explanation = () => ({ title: "Participante e conexão", content: [structuredClone(block)] });
const plan = () => ({ purpose: "Distinguir participante e conexão", prerequisites: ["Programa e comunicação"],
  relations: ["Um host pode possuir várias interfaces"], sourceIds: [] });
function documentFixture() {
  const guide = { goal: "Reconhecer a relação", include: [], exclude: [], notation: [], avoid: [] };
  const unit = (id, position) => ({ id, position, title: "Host e interface", role: "theory",
    content: [{ ...structuredClone(block), id: `${id}-text` }], response: null, feedback: [], topics: [] });
  return { contract: "aralearn.course.v1", courses: [{ id: "synthetic-course", title: "Rede sintética", goal: "Distinguir conexões",
    modules: [{ id: "module", title: "Conexões", guide, lessons: [{ id: "lesson", title: "Participantes", guide,
      topics: [], microsequences: [{ id: "ms", title: "Host", goal: "Distinguir host e interface", role: "explain",
        dependsOn: [], covers: [], checks: [], errors: [], explanationPlan: plan(), explanation: explanation(),
        studyUnits: [unit("u1", 1), unit("u2", 2)] }] }] }] }] };
}

test("apoio compartilhado sobrevive ao round-trip sem virar unidade ou cópia por card", () => {
  const flat = flattenCourseDocument(documentFixture());
  assert.equal(flat.rows.filter((row) => row.entityType === "study_unit").length, 2);
  assert.equal(flat.rows.filter((row) => row.content.explanation).length, 1);
  const restored = composeCourseDocument(flat.course, flat.rows);
  const ms = restored.courses[0].modules[0].lessons[0].microsequences[0];
  assert.deepEqual(ms.explanation, explanation());
  assert.deepEqual(ms.explanationPlan, plan());
  assert.ok(ms.studyUnits.every((unit) => !Object.hasOwn(unit, "explanation")));
});

test("apoio exige conteúdo real do catálogo e recusa resposta, HTML arbitrário e aprovação", () => {
  for (const value of [{ ...explanation(), content: [] }, { ...explanation(), response: {} },
    { title: "Texto", html: "<p>Texto</p>" }, { ...explanation(), approved: true },
    { ...explanation(), content: [block, block] },
    { ...explanation(), content: [{ ...block, package: "unknown.resource" }] }]) {
    assert.throws(() => normalizeMicrosequenceExplanation(value));
  }
});

test("planejamento não vira conteúdo produzido ou aprovação", () => {
  assert.deepEqual(normalizeMicrosequenceExplanationPlan(plan()), plan());
  assert.throws(() => normalizeMicrosequenceExplanationPlan({ ...plan(), approved: true }));
  const entity = { ...documentFixture().courses[0].modules[0].lessons[0].microsequences[0], position: 0 };
  delete entity.studyUnits;
  delete entity.explanation;
  assert.equal(validateCourseEntityContent("microsequence", entity).valid, true);
  assert.equal(validateCourseEntityContent("microsequence", { ...entity, contentReview: { state: "approved" } }).valid, false);
});

test("acervo sem apoio permanece válido sem geração ou aprovação implícita", () => {
  const document = documentFixture();
  const ms = document.courses[0].modules[0].lessons[0].microsequences[0];
  delete ms.explanation; delete ms.explanationPlan;
  const flat = flattenCourseDocument(document);
  const restored = composeCourseDocument(flat.course, flat.rows);
  assert.deepEqual(restored.courses[0].modules[0].lessons[0].microsequences[0], ms);
});
