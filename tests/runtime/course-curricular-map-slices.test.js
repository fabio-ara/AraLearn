import test from "node:test";
import assert from "node:assert/strict";
import { applyCurricularMapSlice, inspectCurricularMapCompleteness, normalizeCurricularMapSlice,
  normalizeCurricularMap, normalizeCurricularMapRead, normalizeCurricularMapChange }
  from "../../src/domain/courseCurricularMapSlices.js";

const scopeId = "10000000-0000-4000-8000-000000000001";
function map() {
  return { audience: "Iniciantes", prerequisites: [], scopeItems: [{ id: scopeId, position: 0, statement: "Explicar relações" }],
    modules: [{ moduleId: "m1", title: "Primeiro", objective: "Relacionar conceitos", position: 0,
      lessons: [{ lessonId: "l1", title: "Começo", objective: "Reconhecer", position: 0,
        microsequences: [{ microsequenceId: "ms1", title: "Relações", objective: "Explicar", position: 0,
          dependencyMicrosequenceIds: [], scopeItemIds: [scopeId], explanationPlan: {
            purpose: "Dar fundamento", prerequisites: [], relations: ["Causa e efeito"], sourceIds: []
          } }] }] },
    { moduleId: "m2", title: "Segundo", objective: "Aplicar", position: 1, lessons: [] }] };
}

test("leitura curricular conserva hierarquia completa e rejeita estrutura ou completude adulterada", () => {
  assert.deepEqual(normalizeCurricularMap(map()), map());
  const read = { contract: "aralearn.course-curricular-map.v1", courseId: scopeId,
    courseRevision: 2, planVersion: 2, map: map(), mapApprovalReference: "referencia_opaca",
    completeness: inspectCurricularMapCompleteness(map()) };
  assert.deepEqual(normalizeCurricularMapRead(read, scopeId), read);
  assert.throws(() => normalizeCurricularMapRead({ ...read, completeness: { complete: true, pending: [] } }));
  for (const mutate of [value => value.modules[0].lessons[0].microsequences[0].extra = true,
    value => value.modules[0].lessons[0].microsequences[0].position = 8,
    value => value.modules[0].lessons.push(structuredClone(value.modules[0].lessons[0]))]) {
    const invalid = map(); mutate(invalid); assert.throws(() => normalizeCurricularMap(invalid));
  }
  const change = { contract: "aralearn.course-curricular-map-change.v1", courseId: scopeId,
    courseRevision: 3, planVersion: 3, approval: "draft", changed: true, idempotent: false };
  assert.deepEqual(normalizeCurricularMapChange(change, { expectedCourseRevision: 2, expectedPlanVersion: 2 }), change);
  assert.throws(() => normalizeCurricularMapChange({ ...change, planVersion: 4 }, { expectedPlanVersion: 2 }));
});

test("rename focal e reordenação conservam IDs, descendentes e campos não selecionados", () => {
  const before = map();
  const after = applyCurricularMapSlice(before, { type: "save_module", moduleId: "m1", title: "Fundamentos", position: 1 });
  assert.deepEqual(after.modules[1], { ...before.modules[0], title: "Fundamentos", position: 1 });
  assert.deepEqual(after.modules[0], { ...before.modules[1], position: 0 });
  assert.equal(before.modules[0].title, "Primeiro");
  const micro = applyCurricularMapSlice(after, { type: "save_microsequence", microsequenceId: "ms1", objective: "Explicar causalidade" });
  assert.deepEqual(micro.modules[1].lessons[0].microsequences[0], {
    ...before.modules[0].lessons[0].microsequences[0], objective: "Explicar causalidade"
  });
});

test("rascunho cresce por ramos e explicita dependência, cobertura e ramo ainda incompletos", () => {
  let value = { audience: "", prerequisites: [], scopeItems: [], modules: [] };
  assert.equal(inspectCurricularMapCompleteness(value).complete, false);
  value = applyCurricularMapSlice(value, { type: "save_module", moduleId: "m", title: "Conceitos", objective: "Compreender" });
  value = applyCurricularMapSlice(value, { type: "save_lesson", lessonId: "l", moduleId: "m", title: "Relações", objective: "Explicar" });
  value = applyCurricularMapSlice(value, { type: "save_microsequence", microsequenceId: "ms", lessonId: "l", title: "Causa", objective: "Distinguir", dependencyMicrosequenceIds: ["futura"] });
  assert.ok(inspectCurricularMapCompleteness(value).pending.some(item => item.reason === "dependency_missing"));
  assert.deepEqual(value.modules[0].lessons[0].microsequences[0].dependencyMicrosequenceIds, ["futura"]);
});

test("item de escopo conserva identidade ao mudar enunciado e remoção deixa referência pendente visível", () => {
  const before = map();
  const after = applyCurricularMapSlice(before, { type: "save_scope_item", id: scopeId, statement: "Explicar relações causais" });
  assert.deepEqual(after.modules, before.modules);
  const removed = applyCurricularMapSlice(after, { type: "remove_scope_item", id: scopeId });
  assert.ok(inspectCurricularMapCompleteness(removed).pending.some(item => item.reason === "scope_reference_missing"));
});

test("recorte rejeita árvore livre, identidade ausente e movimentação para pai inexistente", () => {
  assert.throws(() => normalizeCurricularMapSlice({ type: "save_module", moduleId: "m1", lessons: [] }));
  assert.throws(() => normalizeCurricularMapSlice({ type: "save_microsequence", title: "Sem identidade" }));
  assert.throws(() => applyCurricularMapSlice(map(), { type: "save_lesson", lessonId: "l1", moduleId: "ausente" }));
  assert.throws(() => applyCurricularMapSlice(map(), { type: "save_module", moduleId: "novo", title: "Sem objetivo" }));
  assert.throws(() => normalizeCurricularMapSlice({ type: "save_microsequence", microsequenceId: "ms1", dependencyMicrosequenceIds: ["ms0", "ms0"] }));
});
