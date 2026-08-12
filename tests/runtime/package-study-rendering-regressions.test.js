import assert from "node:assert/strict";
import test from "node:test";

import { renderPackageCardBlocks } from "../../src/render/renderPackageCard.js";

function cardWith(instance) {
  return {
    id: "card-package",
    position: 1,
    title: "Relações",
    role: "theory",
    content: [instance],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

test("modo Estudo não repete enunciado idêntico de paragraph e choice", () => {
  const question = "Qual protocolo confirma a entrega?";
  assert.throws(() => renderPackageCardBlocks({
    ...cardWith({
      id: "context",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: question }
    }),
    role: "practice",
    response: {
      id: "answer",
      package: "aralearn.response.choice",
      version: "1.0.0",
      data: {
        question,
        selectionMode: "single",
        selectionCriterion: "correct",
        options: [{ id: "tcp", text: "TCP" }, { id: "udp", text: "UDP" }],
        answerIds: ["tcp"]
      }
    }
  }), /não pode repetir/u);
});

test("modo Estudo mantém rótulos de arestas fora do desenho do graph", () => {
  const html = renderPackageCardBlocks(cardWith({
    id: "graph",
    package: "aralearn.resource.graph",
    version: "1.0.0",
    data: {
      prompt: "Observe o caminho.",
      layout: "path",
      vertices: [
        { id: "station", label: "Estação central de gerência" },
        { id: "agent", label: "Agente no dispositivo monitorado" }
      ],
      edges: [{ id: "request", from: "station", to: "agent", label: "envia solicitação de leitura", directed: true }]
    }
  }));
  assert.doesNotMatch(html, /package-graph-edge-index/u);
  assert.match(html, /package-graph-relations/u);
  assert.match(html, /Estação central de gerência/u);
  assert.match(html, /envia solicitação de leitura/u);
});

test("modo Estudo materializa relation_map em linhas sem SVG nem setas sobre rótulos", () => {
  const html = renderPackageCardBlocks(cardWith({
    id: "relations",
    package: "aralearn.resource.relation_map",
    version: "1.0.0",
    data: {
      prompt: "Relacione os componentes.",
      leftSet: { label: "Componente", items: [{ id: "agent", label: "Agente instalado no dispositivo monitorado" }] },
      rightSet: { label: "Responsabilidade", items: [{ id: "read", label: "Acessar o objeto gerenciado localmente" }] },
      relations: [{ id: "r1", from: "agent", to: "read", label: "executa" }]
    }
  }));
  assert.doesNotMatch(html, /<svg/u);
  assert.match(html, /package-relation-map/u);
  assert.match(html, /Agente instalado no dispositivo monitorado/u);
  assert.match(html, /Acessar o objeto gerenciado localmente/u);
});
