import test from "node:test";
import assert from "node:assert/strict";

import {
  convertPublicFlowToStructure,
  convertStructureToPublicFlow,
  normalizeFlowchartStructure,
  validateFlowchartStructureContract
} from "../src/flowchart/flowchartStructure.js";

test("converte flow público com decisão para structure interna", () => {
  const structure = convertPublicFlowToStructure([
    { start: "Início" },
    {
      if: "nota >= 6",
      then: [{ output: "Aprovado" }],
      else: [{ output: "Recuperação" }]
    },
    { end: "Fim" }
  ]);

  assert.equal(structure.kind, "sequence");
  assert.equal(structure.items[0].kind, "start");
  assert.equal(structure.items[1].kind, "if_then_else");
  assert.equal(structure.items[1].condition, "nota >= 6");
  assert.equal(structure.items[1].thenBranch[0].kind, "output");
  assert.equal(structure.items[1].elseBranch[0].text, "Recuperação");
  assert.equal(structure.items[2].kind, "end");
});

test("normaliza e valida structure de fluxograma com laço e switch", () => {
  const normalized = normalizeFlowchartStructure({
    kind: "sequence",
    items: [
      {
        kind: "while",
        condition: "i < 10",
        body: [{ kind: "process", text: "Incrementar" }]
      },
      {
        kind: "switch_case",
        expression: "opcao",
        cases: [
          {
            match: "1",
            body: [{ kind: "output", text: "Um" }]
          }
        ],
        defaultBranch: [{ kind: "output", text: "Outro" }]
      }
    ]
  });

  const validation = validateFlowchartStructureContract(normalized);
  assert.equal(validation.valid, true);
  assert.equal(normalized.items[0].kind, "while");
  assert.equal(normalized.items[1].kind, "switch_case");
  assert.equal(normalized.items[1].cases[0].body[0].kind, "output");
});

test("serializa structure interna composta de volta para flow público", () => {
  const flow = convertStructureToPublicFlow({
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

  assert.equal(flow[0].start, "Início");
  assert.equal(flow[1].if, "x > 0");
  assert.deepEqual(flow[1].then.map((item) => item.process), ["Seguir"]);
  assert.deepEqual(flow[1].else.map((item) => item.output), ["Parar"]);
  assert.equal(flow[2].end, "Fim");
});
