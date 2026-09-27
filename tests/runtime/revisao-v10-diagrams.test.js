import test from "node:test";
import assert from "node:assert/strict";

import { graphvizEdgeLabelAttributes } from "../../src/resources/sdk/graphviz.js";
import { bpmnProcessPackage } from "../../src/resources/packages/bpmn-process/index.js";
import { inspectBpmnSemantics, inspectBpmnAuthoring, requireBpmnAuthoring, bpmnEventPresentation } from "../../src/resources/packages/bpmn-process/semantics.js";
import { bpmnInstance, bpmnEventFixture } from "../helpers/bpmnFixture.js";
import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";
import { normalizeMicrosequenceExplanation } from "../../src/domain/courseExplanation.js";
import { normalizeStudyUnitEnvelope, renderStudyUnitEnvelope } from "../../src/resources/kernel/studyUnitEnvelope.js";
import { applyManualStudyUnitEdit } from "../../src/ui/manualStudyUnitEdit.js";

// Contrato puro do helper compartilhado pelos três pacotes de diagrama de sistema.
// O comportamento no DOM (líder do `decorate`, colisões e enquadramento inicial) é
// provado em `tests/e2e/revisao-v10-diagrams.spec.js`.
test("a política compartilhada de rótulos de aresta usa label decorado e wrapping", () => {
  assert.deepEqual(graphvizEdgeLabelAttributes("uma legenda longa", 8), {
    label: "uma\nlegenda\nlonga",
    decorate: "true"
  });
  assert.deepEqual(graphvizEdgeLabelAttributes("curta"), { label: "curta", decorate: "true" });
});

test("a legenda BPMN descreve apenas os tipos semânticos presentes", () => {
  const data = bpmnProcessPackage.normalize({
    participants: [{ id: "p", label: "Participante", lanes: [{ id: "l", label: "Raia" }] }],
    nodes: [
      { id: "start", kind: "start_event", label: "Início", participant: "p", lane: "l" },
      { id: "task", kind: "task", label: "Executar", participant: "p", lane: "l" }
    ],
    flows: [{ id: "f", kind: "sequence", from: "start", to: "task" }]
  });
  const html = bpmnProcessPackage.render(data);
  assert.match(html, /círculos: eventos/u);
  assert.match(html, /retângulos arredondados: atividades/u);
  assert.match(html, /linhas contínuas: sequência/u);
  assert.doesNotMatch(html, /losangos|linhas tracejadas/u);
});

test("BPMN cobre endpoints proibidos sem proibir eventos que recebem ou enviam mensagens válidas", () => {
  assert.deepEqual(inspectBpmnSemantics(bpmnInstance().data), []);
  assert.deepEqual(inspectBpmnSemantics(bpmnEventFixture().data), []);
  for (const [kind, from, to, code] of [
    ["message", "send", "finish", "bpmn_message_to_end"],
    ["message", "need", "register", "bpmn_message_from_start"],
    ["message", "complete", "send", "bpmn_message_gateway"],
    ["message", "send", "complete", "bpmn_message_gateway"],
    ["sequence", "finish", "register", "bpmn_sequence_from_end"],
    ["sequence", "register", "receive", "bpmn_sequence_to_start"]
  ]) {
    const { data } = bpmnInstance();
    data.flows.push({ id: "probe", kind, from, to });
    assert.ok(inspectBpmnSemantics(data).some(issue => issue.code === code), code);
  }
  for (const id of ["start", "end", "catch"]) {
    const { data } = bpmnEventFixture();
    data.flows = data.flows.filter(flow => flow.kind !== "sequence" || flow.from !== id && flow.to !== id);
    assert.ok(inspectBpmnSemantics(data).some(issue => issue.nodeId === id && issue.code.startsWith("bpmn_event_sequence_")));
  }
  for (const [from, to] of [["catch", "work"], ["work", "catch"], ["throw", "send"]]) {
    const { data } = bpmnEventFixture();
    data.flows.push({ id: "extra", kind: "message", from, to });
    assert.ok(inspectBpmnSemantics(data).some(issue => issue.code === "bpmn_intermediate_message_direction"));
  }
});

test("BPMN legado conserva Unidade, Explicação, feedback, texto e alvos, sem perder diagnóstico", () => {
  const instance = bpmnInstance({ invalid: true });
  const unit = { id: "legacy-unit", position: 1, title: "Legado", role: "theory",
    content: [instance], response: null, feedback: [{ ...structuredClone(instance), id: "feedback-bpmn" }], topics: [] };
  const before = structuredClone(unit);
  assert.deepEqual(normalizeStudyUnitEnvelope(unit, registry), unit);
  assert.ok(renderStudyUnitEnvelope(unit, registry));
  assert.ok(normalizeMicrosequenceExplanation({ title: "Base", content: [instance] }));
  for (const slot of ["content", "feedback"]) {
    assert.ok(registry.renderInstance(unit[slot][0], slot));
    assert.match(registry.accessibleText(unit[slot][0], slot), /Evento final/);
    assert.ok(registry.editableTargets(unit[slot][0], slot).length);
    assert.ok(registry.practiceTargets(unit[slot][0], slot).length);
  }
  assert.equal(inspectBpmnAuthoring(unit, unit).filter(issue => issue.blocking).length, 0);
  assert.equal(requireBpmnAuthoring(unit, unit).length, 2);
  assert.throws(() => requireBpmnAuthoring(unit), error => error.code === "bpmn_semantics_invalid" && error.details.blockers.length === 2);
  const edited = applyManualStudyUnitEdit(unit, "content:bpmn", { pathValues: { "nodes[1].label": "Enviar solicitação revisada" } });
  assert.equal(requireBpmnAuthoring(edited, unit).length, 2);
  edited.content[0].data.nodes[1].kind = "service_task";
  assert.throws(() => requireBpmnAuthoring(edited, unit), /evento final não recebe mensagem/);
  const newIdentity = structuredClone(unit);
  newIdentity.content[0].id = "new-resource";
  assert.throws(() => requireBpmnAuthoring(newIdentity, unit));
  assert.deepEqual(unit, before);
});

test("BPMN exige par início/final por participante, sem impor eventos por raia ou alcance", () => {
  for (const [participant, start, end] of [["p0", "start", "end"], ["p1", "messageStart", "messageEnd"], ["p2", "multipleStart", "multipleEnd"]]) {
    const { data } = bpmnEventFixture();
    data.nodes.find(node => node.id === end).kind = "task";
    const issues = inspectBpmnSemantics(data);
    assert.equal(issues.length, 1); // Finals in the other participants do not satisfy this process.
    assert.equal(issues[0].code, "bpmn_start_without_end");
    assert.equal(issues[0].nodeId, start);
    assert.equal(issues[0].path, `nodes[${data.nodes.findIndex(node => node.id === start)}]`);
    assert.ok(issues[0].message.includes(data.participants.find(p => p.id === participant).label));
    data.nodes.push({ ...data.nodes.find(node => node.id === start), id: "second-start" });
    data.flows.push({ id: "second-sequence", kind: "sequence", from: "second-start", to: end });
    assert.equal(inspectBpmnSemantics(data).length, 1); // One actionable issue per participant.
    data.nodes.find(node => node.id === end).kind = "end_event";
    assert.deepEqual(inspectBpmnSemantics(data), []); // Multiple starts can share one final.
    data.nodes.filter(node => node.participant === participant && node.kind === "start_event").forEach(node => { node.kind = "task"; });
    const inverse = inspectBpmnSemantics(data);
    assert.equal(inverse.length, 1);
    assert.equal(inverse[0].code, "bpmn_end_without_start");
    assert.equal(inverse[0].nodeId, end);
    assert.ok(inverse[0].message.includes(data.participants.find(p => p.id === participant).label));
    data.nodes.push({ ...data.nodes.find(node => node.id === end), id: "second-end" });
    data.flows.push({ id: "second-end-sequence", kind: "sequence", from: "second-start", to: "second-end" });
    assert.equal(inspectBpmnSemantics(data).length, 1);
    data.nodes.find(node => node.id === start).kind = "start_event";
    assert.deepEqual(inspectBpmnSemantics(data), []); // One start can coexist with multiple finals.
  }
  const { data } = bpmnEventFixture();
  data.participants[0].lanes.push({ id: "another-lane", label: "Outro responsável" });
  data.nodes.find(node => node.id === "end").lane = "another-lane";
  assert.deepEqual(inspectBpmnSemantics(data), []);
  for (const id of ["start", "end"]) data.nodes.find(node => node.id === id).kind = "task";
  data.participants.push({ id: "external", label: "Participante externo", lanes: [] });
  assert.deepEqual(inspectBpmnSemantics(data), []); // No explicit start: no new final requirement.
});

test("BPMN sem final mantém leitura legada e edição textual, recusando nova autoria ou mudança estrutural", () => {
  const instance = bpmnEventFixture();
  instance.data.nodes.find(node => node.id === "end").kind = "task";
  const unit = { id: "legacy-start", position: 1, title: "Processo salvo", role: "theory",
    content: [instance], response: null, feedback: [], topics: [] };
  const before = structuredClone(unit);
  assert.deepEqual(normalizeStudyUnitEnvelope(unit, registry), unit);
  assert.ok(renderStudyUnitEnvelope(unit, registry));
  assert.ok(normalizeMicrosequenceExplanation({ title: "Processo", content: [instance] }));
  for (const slot of ["content", "feedback"]) {
    assert.ok(registry.renderInstance(instance, slot));
    assert.ok(registry.accessibleText(instance, slot));
    assert.ok(registry.editableTargets(instance, slot).length);
    assert.ok(registry.practiceTargets(instance, slot).length);
    const current = { [slot]: [instance] };
    assert.equal(requireBpmnAuthoring(current, current)[0]?.blocking, false);
    assert.throws(() => requireBpmnAuthoring(current), error => error.code === "bpmn_semantics_invalid" &&
      error.details.blockers.some(issue => issue.code === "bpmn_start_without_end"));
  }
  const edited = applyManualStudyUnitEdit(unit, `content:${instance.id}`, { pathValues: { "nodes[1].label": "Pedido revisto" } });
  assert.equal(requireBpmnAuthoring(edited, unit)[0].blocking, false);
  edited.content[0].data.nodes[1].kind = "service_task";
  assert.throws(() => requireBpmnAuthoring(edited, unit), { code: "bpmn_semantics_invalid" });
  assert.deepEqual(unit, before);
});

test("BPMN deriva marcadores sem alterar tipos, labels ou campos autorais", () => {
  const { data } = bpmnEventFixture();
  const before = structuredClone(data);
  for (const [id, marker, direction] of [["messageStart", "message", "catch"],
    ["messageEnd", "message", "throw"], ["catch", "message", "catch"], ["throw", "message", "throw"],
    ["multipleStart", "multiple", "catch"], ["multipleEnd", "multiple", "throw"]]) {
    assert.deepEqual(bpmnEventPresentation(data.nodes.find(node => node.id === id), data), { marker, direction });
  }
  const invalid = bpmnInstance({ invalid: true }).data;
  assert.equal(bpmnEventPresentation(invalid.nodes.find(node => node.id === "finish"), invalid), null);
  const html = bpmnProcessPackage.render(data);
  assert.match(html, /is-end_event[^]*shape=&quot;circle&quot;/);
  assert.match(html, /is-intermediate_event[^]*shape=&quot;doublecircle&quot;/);
  assert.match(bpmnProcessPackage.accessibleText(data), /Evento intermediário “Receber aviso”, recebe mensagem/);
  assert.doesNotMatch(JSON.stringify(bpmnProcessPackage.authoringContract.visualGrammar), /intermediário ou final/);
  assert.deepEqual(data, before);
});
