import test from "node:test";
import assert from "node:assert/strict";

import { graphvizEdgeLabelAttributes } from "../../src/resources/sdk/graphviz.js";
import { bpmnProcessPackage } from "../../src/resources/packages/bpmn-process/index.js";

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
