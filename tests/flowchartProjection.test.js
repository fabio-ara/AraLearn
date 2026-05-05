import test from "node:test";
import assert from "node:assert/strict";

import { deriveFlowchartProjectionFromStructure } from "../src/flowchart/flowchartProjection.js";

test("projeta decisão simples em nós, links e merge explícito", () => {
  const projection = deriveFlowchartProjectionFromStructure({
    kind: "sequence",
    items: [
      { kind: "start", text: "Início" },
      {
        kind: "if_then_else",
        condition: "x > 0",
        thenBranch: [{ kind: "process", text: "Seguir" }],
        elseBranch: [{ kind: "output", text: "Parar" }]
      },
      { kind: "end", text: "Fim" }
    ]
  });

  assert.ok(projection);
  assert.equal(projection.entryNodeId, projection.nodes[0].id);
  assert.equal(projection.nodes[1].shape, "decision");
  assert.ok(projection.nodes.some((node) => node.role === "merge" && node.shape === "connector"));
  assert.equal(projection.nodes[0].layoutMeta.semanticKind, "start");
  assert.equal(projection.nodes[1].layoutMeta.level, 1);
  assert.equal(projection.nodes.find((node) => node.role === "merge").row, 3);
  assert.ok(projection.links.some((link) => link.role === "yes" && link.label === "Sim"));
  assert.ok(projection.links.some((link) => link.role === "no" && link.label === "Não"));
  assert.equal(projection.links.at(-1).role, "next");
});

test("projeta switch_case com cadeia de casos e saída padrão", () => {
  const projection = deriveFlowchartProjectionFromStructure({
    kind: "sequence",
    items: [
      {
        kind: "switch_case",
        expression: "opcao",
        cases: [
          { match: "1", body: [{ kind: "output", text: "Um" }] },
          { match: "2", body: [{ kind: "output", text: "Dois" }] }
        ],
        defaultBranch: [{ kind: "output", text: "Outro" }]
      }
    ]
  });

  assert.ok(projection);
  assert.equal(
    projection.nodes.filter((node) => node.shape === "decision").length,
    2
  );
  assert.ok(
    projection.links.some((link) => link.role === "case-match" && link.label === "1")
  );
  assert.ok(
    projection.links.some((link) => link.role === "case-default" && link.label === "Outro caso")
  );
  assert.ok(projection.nodes.some((node) => node.text === "opcao = 2?"));
  assert.deepEqual(
    projection.nodes.filter((node) => node.shape === "decision").map((node) => node.row),
    [0, 2]
  );
  assert.equal(
    projection.nodes.find((node) => node.role === "merge").layoutMeta.semanticKind,
    "merge"
  );
});

test("preserva metadados de prática na projeção de nós e links", () => {
  const projection = deriveFlowchartProjectionFromStructure({
    kind: "sequence",
    items: [
      {
        kind: "if_then",
        condition: "Resposta correta?",
        practice: {
          blankShape: true,
          shapeOptions: ["decision", "process"],
          text: {
            blank: true,
            mode: "choice",
            options: ["Sim", "Não"]
          },
          labels: {
            yes: {
              blank: true,
              variants: ["Sim"]
            }
          }
        },
        thenBranch: [{ kind: "process", text: "Continuar" }]
      }
    ]
  });

  assert.ok(projection);
  assert.equal(projection.nodes[0].shapeBlank, true);
  assert.deepEqual(projection.nodes[0].shapeOptions, ["decision", "process"]);
  assert.equal(projection.nodes[0].textBlank, true);
  assert.deepEqual(
    projection.nodes[0].textOptions.map((item) => item.value),
    ["Sim", "Não"]
  );
  assert.deepEqual(
    projection.links.find((link) => link.role === "yes").labelVariants.map((item) => item.value),
    ["Sim"]
  );
});
