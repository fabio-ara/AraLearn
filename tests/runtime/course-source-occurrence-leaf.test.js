import assert from "node:assert/strict";
import test from "node:test";

import { inspectCourseSourceEvidence } from "../../src/domain/courseSources.js";
import { listCourseSourceOccurrenceTargets, locateCourseSourceOccurrenceTargets }
  from "../../src/domain/courseSourceOccurrences.js";
import { resolveHumanSourceOccurrences } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanMaterialization.js";
import { toolErrorData } from "../../supabase/functions/_shared/aralearn-authoring/toolErrorEnvelope.js";

const OPTIONS = Object.freeze({ targetKind: "microsequence_explanation" });
const newId = async key => `occurrence:${key}`;

const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const tree = (id, labels) => ({ id, package: "aralearn.resource.tree", version: "1.0.0",
  data: { prompt: "Observe a árvore.", variant: "hierarchy",
    nodes: labels.map((label, index) => ({ id: `n${index + 1}`, label,
      parentId: index === 0 ? null : `n${index}` })) } });
// O fluxo rotula cada folha textual só pelo nome do campo: dois nós produzem dois
// candidatos com o mesmo rótulo público, além do mesmo texto.
const flow = (id, texts) => ({ id, package: "aralearn.resource.flow", version: "1.0.0",
  data: { structure: { id: "root", kind: "sequence", items: texts.map((text, index) => ({
    id: `step${index + 1}`, kind: "process", text })) } } });

const explanation = (...content) => ({ title: "Hierarquia e rede", content });
const derive = (content, occurrence) => resolveHumanSourceOccurrences({ requested: [occurrence],
  content, options: OPTIONS, newId, identityPrefix: "test" });

test("o servidor deriva a folha exata do recurso e do trecho literal", async () => {
  const content = explanation(paragraph("content-1",
    "Uma árvore é um tipo particular de grafo: ela é conectada e não possui ciclos."));
  const [occurrence] = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "é conectada" });
  assert.deepEqual(occurrence, { occurrenceId: "occurrence:test:occurrence:0", slot: "content",
    resourceId: "content-1", path: "text", quote: "é conectada", prefix: null, suffix: null });
  assert.equal(Object.hasOwn(occurrence, "folha"), false);
  const wrongPart = await derive(content, { lugar: "conteudo", recurso: 1,
    trecho: "é conectada", alvo: 2 }).then(() => null, error => error);
  assert.equal(wrongPart.details.blockers[0].code, "source_occurrence_part_not_found",
    "uma seleção explícita inválida não pode ser ignorada só porque há um trecho único");
  // A citação derivada resolve na leitura: o aviso não nasce de um nome interno errado.
  assert.ok(locateCourseSourceOccurrenceTargets(listCourseSourceOccurrenceTargets(content, OPTIONS),
    { slot: "content", resourceId: "content-1", quote: "é conectada" })[0]);
});

test("dois rótulos distintos com o mesmo texto exigem alvo humano, sem escolha arbitrária", async () => {
  const content = explanation(paragraph("content-1", "Região Norte é filho de Central."),
    tree("content-2", ["Central", "Central", "Base N1"]));
  const [unique] = await derive(content, { lugar: "conteudo", recurso: 2, trecho: "Base N1" });
  assert.equal(unique.path, "nodes[2].label");
  const ambiguous = await derive(content, { lugar: "conteudo", recurso: 2, trecho: "Central" })
    .then(() => null, error => error);
  assert.equal(ambiguous.code, "invalid_human_source_occurrence");
  assert.equal(ambiguous.details.blockers[0].code, "ambiguous_source_occurrence");
  assert.equal(ambiguous.details.blockers[0].candidates.length, 2,
    "duas folhas do mesmo componente devolvem os dois candidatos, sem eleger uma");
  assert.equal(ambiguous.details.blockers[0].candidates[0], "1. nó 1 — Central");
  assert.equal(ambiguous.details.blockers[0].candidates[1], "2. nó 2 — Central");
  assert.match(ambiguous.details.blockers[0].message, /informe alvo pela posição ou pelo rótulo público/u);
  const forwarded = toolErrorData(ambiguous);
  assert.equal(forwarded.details.blockers[0].candidates.length, 2,
    "a decisão útil chega ao contrato público da tarefa");
  for (const [alvo, expected] of [[1, "nodes[0].label"], [2, "nodes[1].label"],
    ["Editar nó 2", "nodes[1].label"], ["nó 2", "nodes[1].label"]]) {
    const [chosen] = await derive(content, { lugar: "conteudo", recurso: 2, trecho: "Central", alvo });
    assert.equal(chosen.path, expected, `alvo ${JSON.stringify(alvo)}`);
    assert.equal(chosen.quote, "Central");
    assert.equal(Object.hasOwn(chosen, "alvo"), false, "o alvo é entrada, não parte da ocorrência");
  }
  for (const alvo of [3, "parte inexistente"]) {
    const missing = await derive(content, { lugar: "conteudo", recurso: 2, trecho: "Central", alvo })
      .then(() => null, error => error);
    assert.equal(missing.details.blockers[0].code, "source_occurrence_part_not_found");
    assert.equal(missing.details.blockers[0].candidates.length, 2,
      "o alvo ausente recebe a lista completa para decidir");
  }
});

test("rótulo público repetido no componente não permite escolher por engano", async () => {
  const content = explanation(flow("flow-1", ["Central", "Central"]));
  const ambiguous = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "Central",
    alvo: "Editar text" }).then(() => null, error => error);
  assert.equal(ambiguous.details.blockers[0].code, "ambiguous_source_occurrence");
  assert.equal(ambiguous.details.blockers[0].candidates.length, 2);
  assert.match(ambiguous.details.blockers[0].message, /rótulo informado/u);
  const [first] = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "Central", alvo: 1 });
  const [second] = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "Central", alvo: 2 });
  assert.equal(first.path, "structure.items[0].text");
  assert.equal(second.path, "structure.items[1].text");
  assert.notEqual(first.path, second.path, "a posição distingue duas folhas de texto idêntico");
});

test("repetição deliberada usa prefixo e sufixo, e ausência não grava citação", async () => {
  const content = explanation(paragraph("content-1",
    "Região Norte é filho de Central. Depois, Região Norte é filho de Central."));
  const repeated = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "Região Norte" })
    .then(() => null, error => error);
  assert.equal(repeated.details.blockers[0].code, "source_occurrence_repeated_in_part");
  const disambiguated = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "Região Norte",
    prefixo: "Depois, ", sufixo: " é filho" });
  assert.equal(disambiguated[0].path, "text");
  assert.equal(disambiguated[0].prefix, "Depois, ");
  const missing = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "passagem ausente" })
    .then(() => null, error => error);
  assert.equal(missing.details.blockers[0].code, "source_occurrence_not_located");
  assert.equal(Object.hasOwn(missing.details.blockers[0], "candidates"), false);
  const insideLeaf = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "Central" })
    .then(() => null, error => error);
  assert.equal(insideLeaf.details.blockers[0].code, "source_occurrence_repeated_in_part",
    "a repetição na mesma folha continua exigindo prefixo e sufixo");
});

test("o nome interno da folha deixou de integrar o contrato da ocorrência", async () => {
  const content = explanation(paragraph("content-1", "Uma árvore é conectada."));
  const rejected = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "conectada",
    folha: "text" }).then(() => null, error => error);
  assert.equal(rejected.code, "invalid_human_source_occurrence");
  assert.match(rejected.message, /lugar, a posição do recurso e o trecho literal/u);
});

test("o alvo aceita posição ou rótulo e recusa valor sem referência humana", async () => {
  const content = explanation(paragraph("content-1", "Uma árvore é conectada."));
  for (const alvo of [0, -1, 1.5, "", "   ", "x".repeat(301), true, [], {}, null]) {
    const rejected = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "conectada", alvo })
      .then(() => null, error => error);
    assert.equal(rejected.code, "invalid_human_source_occurrence", `alvo ${JSON.stringify(alvo)}`);
    assert.match(rejected.message, /alvo aceita a posição ou o rótulo público/u);
  }
  const [accepted] = await derive(content, { lugar: "conteudo", recurso: 1, trecho: "conectada", alvo: 1 });
  assert.equal(accepted.path, "text", "alvo redundante em folha única continua válido");
});

test("auditor confere a folha quando recebe o conteúdo e mantém o limite semântico", () => {
  const content = explanation(paragraph("content-1", "Uma árvore é conectada."));
  const targets = listCourseSourceOccurrenceTargets(content, OPTIONS);
  const source = { revision: 1, status: "active", anchors: [{ anchorId: "anchor", status: "active",
    humanLocator: "Seção 1", contentHash: null, needsReverification: false }] };
  const occurrence = quote => ({ occurrenceId: "occ", slot: "content", resourceId: "content-1",
    path: "text", quote, prefix: null, suffix: null });
  const link = occurrenceValue => ({ linkId: "link", sourceId: "source", relation: "supported_by",
    roles: ["technical_conceptual"], anchors: [{ anchorId: "anchor" }], occurrences: [occurrenceValue] });
  assert.deepEqual(inspectCourseSourceEvidence(link(occurrence("conectada")), source, { targets }),
    { located: true, issues: [] });
  assert.deepEqual(inspectCourseSourceEvidence(link(occurrence("não está neste texto")), source, { targets }),
    { located: false, issues: ["occurrence_not_located"] });
  // Sem o conteúdo em escopo o veredito permanece estrutural, nunca uma localização inventada.
  assert.deepEqual(inspectCourseSourceEvidence(link(occurrence("não está neste texto")), source),
    { located: true, issues: [] });
});
