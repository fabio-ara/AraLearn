import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalAuthoringValue } from "../../src/domain/courseAuthoringBasis.js";
import { normalizeMicrosequenceExplanation } from "../../src/domain/courseExplanation.js";
import { explanationReconciliationTargets, inspectExplanationReconciliation, normalizeExplanationReconciliation,
  EXPLANATION_RECONCILIATION_CONTRACT } from "../../src/domain/courseExplanationReconciliation.js";
import { chartPackage } from "../../src/resources/packages/chart/index.js";
import { graphPackage } from "../../src/resources/packages/graph/index.js";
import { applyExplanationTextFields } from "../../src/ui/CourseMicrosequenceReview.js";

const basis = value => createHash("sha256").update(canonicalAuthoringValue({ title: value.title, content: value.content })).digest("hex");
const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
function entry(target, overrides = {}) {
  return { resourceId: target.resourceId, path: target.path, quote: target.text, prefix: null, suffix: null,
    role: "introduced", analysisUnitIds: [`idea-${target.resourceId}`], evidenceRequirementIds: [],
    destinationMicrosequenceId: null, reason: "O trecho apresenta uma distinção que o percurso deve ensinar.", ...overrides };
}
function reconcile(explanation, entries) {
  return { ...explanation, reconciliation: { contract: EXPLANATION_RECONCILIATION_CONTRACT, contentBasis: basis(explanation),
    entries: entries || explanationReconciliationTargets(explanation).map(target => entry(target)) } };
}
const inspect = (value, options = {}) => inspectExplanationReconciliation(value, { contentBasis: basis(value),
  analysisUnitIds: ["idea-a", "idea-b", "idea-c", "idea-d", "idea-e", "idea-f"], microsequenceIds: ["later"], ...options });

test("seis ensinamentos da base continuam no inventário quando o pedido só contempla dois", () => {
  const explanation = reconcile({ title: "Seis distinções", content: ["a", "b", "c", "d", "e", "f"]
    .map(id => paragraph(id, `Distinção independente ${id}.`)) });
  const result = inspect(explanation);
  assert.equal(result.ready, true);
  assert.deepEqual(result.introduced, ["idea-a", "idea-b", "idea-c", "idea-d", "idea-e", "idea-f"]);
  const shortRequest = new Set(["idea-a", "idea-b"]);
  assert.deepEqual(result.introduced.filter(id => !shortRequest.has(id)), ["idea-c", "idea-d", "idea-e", "idea-f"]);
  const omittedDeclarations = structuredClone(explanation);
  omittedDeclarations.reconciliation.entries = omittedDeclarations.reconciliation.entries.slice(0, 2);
  assert.equal(inspect(omittedDeclarations).ready, false);
  assert.equal(inspect(omittedDeclarations).blockers.filter(item => item.code === "explanation_reconciliation_unmapped").length, 4);
  const contextual = structuredClone(explanation);
  contextual.reconciliation.entries.slice(2).forEach(item => { item.role = "preview"; item.destinationMicrosequenceId = "later"; });
  const preview = inspect(contextual);
  assert.equal(preview.ready, true);
  assert.deepEqual(preview.introduced, ["idea-a", "idea-b"]);
  assert.equal(preview.deferred.length, 4);
});

for (const text of [
  "Uma ideia.\n\nOutra relação.",
  "Uma  ideia.\t Outra relação.",
  "Uma `ideia` e outra relação.",
  "Uma `ideia`.\n\nOutra  relação."
]) test(`prosa literal reconciliada não exige sua cópia acessível: ${JSON.stringify(text)}`, () => {
  const explanation = { title: "Base literal", content: [paragraph("a", text)] };
  const targets = explanationReconciliationTargets(explanation);
  assert.deepEqual(targets.map(target => target.path), ["text"]);
  assert.equal(targets[0].text, text);
  const value = reconcile(explanation, [entry({ resourceId: "a", path: "text", text })]);
  assert.equal(inspect(value).ready, true);
  assert.equal(value.content[0].data.text, text);

  const missing = structuredClone(value);
  missing.reconciliation.entries[0].quote = "Uma";
  assert.deepEqual(inspect(missing).blockers.map(({ code, path }) => ({ code, path })), [
    { code: "explanation_reconciliation_unmapped", path: "text" }
  ]);
  const normalizedLocator = structuredClone(value);
  normalizedLocator.reconciliation.entries[0].quote = text.replace(/`/gu, "").replace(/\s+/gu, " ");
  assert.ok(inspect(normalizedLocator).blockers.some(item => item.code === "explanation_reconciliation_locator_stale"),
    "A equivalência de apresentação não transforma o localizador em correspondência aproximada.");
});

test("reconciliação já salva da representação acessível permanece inspecionável", () => {
  const text = "Uma `ideia`.\n\nOutra relação.";
  const value = reconcile({ title: "Base preservada", content: [paragraph("a", text)] }, [
    entry({ resourceId: "a", path: "text", text }),
    entry({ resourceId: "a", path: "$", text: "Uma ideia. Outra relação." })
  ]);
  assert.equal(inspect(value).ready, true);
  value.reconciliation.entries[1].quote = "Uma representação que deixou de existir.";
  assert.ok(inspect(value).blockers.some(item => item.code === "explanation_reconciliation_locator_stale"));
});

test("prévia sem destino declara pendência; dependência adiada e destino removido impedem prontidão", () => {
  const explanation = reconcile({ title: "Antecipação", content: [paragraph("a", "Uma antecipação que será desenvolvida depois.")] });
  explanation.reconciliation.entries[0].role = "preview";
  assert.equal(inspect(explanation).ready, true);
  assert.deepEqual(inspect(explanation).deferred, [{ entry: 1, destinationMicrosequenceId: null, state: "pending" }]);
  explanation.reconciliation.entries[0].role = "deferred";
  assert.equal(inspect(explanation).blockers[0].code, "explanation_reconciliation_dependency_pending");
  explanation.reconciliation.entries[0].destinationMicrosequenceId = "removed";
  assert.equal(inspect(explanation).blockers[0].code, "explanation_reconciliation_destination_missing");
});

test("conteúdo alterado conserva mapa antigo para reparo e localizador ambíguo nunca migra por aproximação", () => {
  const value = reconcile({ title: "Identidades", content: [paragraph("a", "Uma ideia antiga.")] });
  value.content[0].data.text = "Uma ideia nova.";
  assert.deepEqual(normalizeMicrosequenceExplanation(value).reconciliation, value.reconciliation);
  assert.deepEqual(inspect(value).blockers.map(item => item.code), ["explanation_reconciliation_stale",
    "explanation_reconciliation_locator_stale", "explanation_reconciliation_unmapped"]);
  const repeated = reconcile({ title: "Repetição", content: [paragraph("a", "Uma ideia. Uma ideia.")] });
  repeated.reconciliation.entries[0].quote = "Uma ideia.";
  assert.ok(inspect(repeated).blockers.some(item => item.code === "explanation_reconciliation_locator_stale"));
});

test("edição manual da base não transporta uma declaração pertencente ao texto anterior", () => {
  const before = reconcile({ title: "Identidades", content: [paragraph("a", "Uma ideia antiga.")] });
  const changed = applyExplanationTextFields(before, [{ targetId: "content:a", path: "text", value: "Uma ideia nova." }]);
  assert.equal(Object.hasOwn(changed, "reconciliation"), false);
  assert.equal(changed.content[0].data.text, "Uma ideia nova.");
  assert.equal(before.content[0].data.text, "Uma ideia antiga.");
  assert.ok(before.reconciliation, "a leitura histórica permanece intacta no objeto anterior");
});

test("índices de seleção UTF-16 não omitem texto depois de caracteres suplementares", () => {
  const value = reconcile({ title: "Unicode", content: [paragraph("a", "𝛼A B")] });
  value.reconciliation.entries[0].quote = "𝛼A ";
  assert.equal(inspect(value).ready, false);
  assert.equal(inspect(value).blockers[0].code, "explanation_reconciliation_unmapped");
  value.reconciliation.entries[0].quote = "𝛼A B";
  assert.equal(inspect(value).ready, true);
});

for (const definition of [chartPackage, graphPackage]) test(`${definition.manifest.id}: números e relações gráficas entram na base mesmo com folhas editáveis`, () => {
  const content = { id: "a", package: definition.manifest.id, version: definition.manifest.version,
    data: structuredClone(definition.authoringContract.example) };
  const value = normalizeMicrosequenceExplanation({ title: "Representação estruturada", content: [content] });
  const targets = explanationReconciliationTargets(value);
  const accessible = targets.find(target => target.path === "$");
  assert.ok(accessible, "a representação numérica/relacional não desaparece atrás do título");
  assert.ok(targets.some(target => target.path !== "$"));
  const incomplete = reconcile(value, targets.filter(target => target.path !== "$").map(target => entry(target)));
  assert.ok(inspect(incomplete).blockers.some(item => item.path === "$"));
  assert.equal(inspect(reconcile(value)).ready, true);
});

test("limites e localizadores da reconciliação usam o contrato seguro de ocorrências existente", () => {
  const value = reconcile({ title: "Base", content: [paragraph("a", "Texto.")] }).reconciliation;
  for (const invalid of [{ ...value, contentBasis: "fake" }, { ...value, entries: [] },
    { ...value, entries: [{ ...value.entries[0], path: "__proto__.text" }] },
    { ...value, entries: [{ ...value.entries[0], prefix: "x".repeat(501) }] },
    { ...value, entries: [{ ...value.entries[0], analysisUnitIds: [] }] },
    { ...value, entries: [{ ...value.entries[0], reason: " " }] }]) assert.throws(() => normalizeExplanationReconciliation(invalid));
  assert.deepEqual(normalizeExplanationReconciliation(value), value);
});
