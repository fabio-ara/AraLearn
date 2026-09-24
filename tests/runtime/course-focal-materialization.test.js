import test from "node:test";
import assert from "node:assert/strict";
import { completeHumanContent, completeFocalMaterialization } from
  "../../supabase/functions/_shared/aralearn-authoring/courseFocalMaterialization.js";

const micros = [{ id: "dns", title: "DNS", productionPosition: 0 },
  { id: "cache", title: "Cache", productionPosition: 1 }];
const part = { id: "part", position: 0, title: "Nomes", microsequences: micros };
const context = { plan: { plan: { parts: [part] } }, part: null };
const theory = () => ({ title: "Nome e endereço", content: [{ package: "paragraph", data: { text: "DNS associa nomes a endereços." } }] });

test("autoria deriva identidades, versão, papel e coleções sem alterar o conteúdo", () => {
  const input = theory();
  const copy = structuredClone(input);
  const result = completeHumanContent(input);
  assert.deepEqual(input, copy);
  assert.equal(result.role, "theory");
  assert.equal(result.response, null);
  assert.deepEqual(result.feedback, []);
  assert.deepEqual(result.topics, []);
  assert.deepEqual(result.content[0], { id: "content-1", package: "aralearn.resource.paragraph",
    version: "1.0.0", data: input.content[0].data });
});

test("identidade referenciada e versão explícitas permanecem; componente inválido é localizado", () => {
  const input = theory();
  Object.assign(input.content[0], { id: "conceito", version: "1.0.0" });
  assert.equal(completeHumanContent(input).content[0].id, "conceito");
  input.content[0].version = "99.0.0";
  assert.throws(() => completeHumanContent(input), error => error.code === "human_component_not_found" && error.details.component === 1);
});

test("uma microssequência determina parte sem redefinir o agrupamento", () => {
  const result = completeFocalMaterialization({ microssequencia: "Cache", unidades: [{ conteudo: theory(),
    aplicacaoPedagogica: { ideiasIntroduzidas: ["Cache"] } }] }, context);
  assert.equal(result.part.id, "part");
  assert.equal(result.part.microsequences.length, 2);
  assert.equal(result.microsequence.id, "cache");
  assert.equal(result.units[0].microssequencia, "Cache");
  assert.equal(result.units[0].posicao, 1);
  assert.deepEqual(result.units[0].aplicacaoPedagogica.ideiasIntroduzidas, ["Cache"]);
  assert.deepEqual(result.units[0].aplicacaoPedagogica.praticas, []);
});

test("geração não aceita misturar microssequências por conveniência de lote", () => {
  assert.throws(() => completeFocalMaterialization({ unidades: micros.map(micro => ({
    microssequencia: micro.title, conteudo: theory(), aplicacaoPedagogica: {} })) }, context),
  { code: "human_materialization_focus_required" });
});

test("posição automática acrescenta depois do conteúdo existente e oportunidade é derivada", () => {
  const result = completeFocalMaterialization({ microssequencia: "DNS", unidades: [{ conteudo: theory(),
    aplicacaoPedagogica: { praticas: [{ requisito: "Distinguir nome e endereço" }] } }] }, context,
  [{ curriculumPath: { didacticMicrosequence: { id: "dns" } }, studyUnit: { position: 3 } }]);
  assert.equal(result.units[0].posicao, 4);
  assert.deepEqual(result.units[0].aplicacaoPedagogica.praticas, [{ requisito: "Distinguir nome e endereço",
    oportunidade: "unidade-4-evidencia-1", dimensoesVariadas: [] }]);
});

test("normalização de Explicação não acrescenta estado de unidade nem reescreve relações", () => {
  const explanation = { ...theory(), reconciliation: { entries: ["preservada"] } };
  const result = completeHumanContent(explanation, { explanation: true });
  assert.equal(Object.hasOwn(result, "role"), false);
  assert.deepEqual(result.reconciliation, explanation.reconciliation);
});

test("identidades e posições derivadas não colidem com valores explícitos", () => {
  const input = theory();
  input.content.push({ ...input.content[0], id: "content-1" });
  assert.deepEqual(completeHumanContent(input).content.map(entry => entry.id), ["content-2", "content-1"]);
  const result = completeFocalMaterialization({ microssequencia: "DNS", unidades: [
    { conteudo: theory() }, { posicao: 2, conteudo: theory() }, { conteudo: theory() }
  ] }, context);
  assert.deepEqual(result.units.map(unit => unit.posicao), [1, 2, 3]);
  assert.throws(() => completeHumanContent({ title: "Inválido", content: {} }), { code: "human_content_shape" });
});
