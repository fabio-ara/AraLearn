import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResourceGapModel,
  extractResourceGapAnswers,
  listResourceGapFields,
  resourceHasGap,
  resourceSupportsGap,
  resolveResourceGapText
} from "../../src/core/resourceGaps.js";

test("catálogo formal de lacunas cobre todos os recursos estruturados", () => {
  [
    "paragraph",
    "code",
    "table",
    "flow",
    "tree",
    "graph",
    "relation_map",
    "matrix",
    "plane",
    "formula",
    "composite"
  ].forEach((resource) => assert.equal(resourceSupportsGap(resource), true, resource));
  assert.equal(resourceSupportsGap("choice"), false);
});

test("campos de lacuna são enumerados em ordem determinística", () => {
  const card = {
    resource: "composite",
    blocks: [
      { id: "table-1", kind: "table", rows: [["A", "[[B::B|C]]"], ["[[D]]", "E"]] },
      {
        layout: "auto",
        id: "graph-1",
        kind: "graph",
        vertices: [{ id: "v1", label: "[[origem]]" }, { id: "v2", label: "Destino" }],
        edges: [{ id: "edge-1", from: "v1", to: "v2", weight: "[[3::3|4]]" }]
      }
    ]
  };
  const model = buildResourceGapModel(card);
  assert.deepEqual(model.answers, ["B", "D", "origem", "3"]);
  assert.deepEqual(
    model.tokens.map(({ path, index }) => [path, index]),
    [
      ["blocks[0].rows[0][1]", 0],
      ["blocks[0].rows[1][0]", 1],
      ["blocks[1].vertices[0].label", 2],
      ["blocks[1].edges[0].weight", 3]
    ]
  );
  assert.equal(model.fieldByPath.get("blocks[1].vertices[0].label").startIndex, 2);
});

test("fórmula usa somente valores folha como campos interativos", () => {
  const formula = {
    resource: "formula",
    expression: {
      type: "fraction",
      numerator: { type: "identifier", value: "[[x::x|y]]" },
      denominator: {
        type: "row",
        children: [
          { type: "number", value: "2" },
          { type: "operator", value: "[[+::+|-]]" },
          { type: "identifier", value: "z" }
        ]
      }
    }
  };
  assert.deepEqual(
    listResourceGapFields(formula).map(({ path }) => path),
    [
      "expression.numerator.value",
      "expression.denominator.children[0].value",
      "expression.denominator.children[1].value",
      "expression.denominator.children[2].value"
    ]
  );
  assert.deepEqual(extractResourceGapAnswers(formula), ["x", "+"]);
});

test("texto resolvido nunca expõe resposta ainda não preenchida", () => {
  const source = "A → [[B::B|C]] e [[D;;]].";
  assert.equal(resolveResourceGapText(source, [], 0), "A → … e ….");
  assert.equal(resolveResourceGapText(source, ["B"], 0), "A → B e ….");
  assert.equal(resolveResourceGapText(source, ["B", "D"], 0), "A → B e D.");
  assert.equal(resourceHasGap({ resource: "plane", result: "[[(2, 1);;]]" }), true);
});
