import test from "node:test";
import assert from "node:assert/strict";

import { validateCard } from "../../src/domain/cards.js";
import { validateFlowchartStructureContract } from "../../src/flowchart/flowchartStructure.js";

function errorText(result) {
  return (result.errors || []).map((error) => `${error.path}: ${error.message}`).join("\n");
}

function baseCard(resource, fields = {}) {
  return {
    id: `card-${resource}`,
    position: 1,
    resource,
    kind: "theory",
    exercise: "none",
    title: "Recurso",
    after: "",
    ...fields
  };
}

function relationMap(fields = {}) {
  return baseCard("relation_map", {
    prompt: "Observe as relações.",
    leftSet: { label: "U", items: [{ id: "u1", label: "A" }, { id: "u2", label: "B" }] },
    rightSet: { label: "V", items: [{ id: "v1", label: "1" }, { id: "v2", label: "2" }] },
    relations: [{ from: "u1", to: "v1" }, { from: "u2", to: "v2" }],
    ...fields
  });
}

test("relation_map rejeita campos internos que o mapeamento relacional não preservaria", () => {
  const cases = [
    ["conjunto", { leftSet: { label: "U", items: [{ id: "u1", label: "A" }], color: "red" } }, /leftSet\.color/u],
    ["item", { leftSet: { label: "U", items: [{ id: "u1", label: "A", color: "red" }] } }, /items\[0\]\.color/u],
    ["relação", { relations: [{ from: "u1", to: "v1", weight: 2 }] }, /relations\[0\]\.weight/u],
    ["tabela", { relationTable: { columns: ["U", "V"], rows: [["A", "1"]], caption: "Relação" } }, /relationTable\.caption/u],
    ["destaque", { highlight: { leftItems: ["u1"], color: "red" } }, /highlight\.color/u]
  ];
  cases.forEach(([label, fields, expected]) => {
    const result = validateCard(relationMap(fields));
    assert.equal(result.ok, false, label);
    assert.match(errorText(result), expected, label);
  });
});

test("relation_map valida duplicidades, referências e grade auxiliar", () => {
  const duplicate = validateCard(relationMap({
    relations: [{ from: "u1", to: "v1" }, { from: "u1", to: "v1", label: "repetida" }]
  }));
  assert.equal(duplicate.ok, false);
  assert.match(errorText(duplicate), /não pode repetir a mesma relação/u);

  const invalidHighlight = validateCard(relationMap({
    highlight: { leftItems: ["ausente"], relations: [["u1", "v2"]] }
  }));
  assert.equal(invalidHighlight.ok, false);
  assert.match(errorText(invalidHighlight), /Item destacado inexistente/u);
  assert.match(errorText(invalidHighlight), /precisa existir em relations/u);

  const invalidTable = validateCard(relationMap({
    relationTable: { columns: ["U", "V"], rows: [["A"], ["B", { valor: 2 }]] }
  }));
  assert.equal(invalidTable.ok, false);
  assert.match(errorText(invalidTable), /exatamente 2 células/u);
  assert.match(errorText(invalidTable), /célula de relationTable/u);
});

test("matrix rejeita dados internos descartáveis ou sem efeito visual", () => {
  const unknownSequenceField = validateCard(baseCard("matrix", {
    sequence: [
      { name: "A", values: [[1, 0], [0, 1]], color: "red" },
      { connector: "=", values: [[1, 0], [0, 1]] }
    ]
  }));
  assert.equal(unknownSequenceField.ok, false);
  assert.match(errorText(unknownSequenceField), /sequence\[0\]\.color/u);

  const objectCell = validateCard(baseCard("matrix", { values: [[{ value: 1 }]] }));
  assert.equal(objectCell.ok, false);
  assert.match(errorText(objectCell), /célula da matrix/u);

  const orphanHighlight = validateCard(baseCard("matrix", {
    sequence: [{ values: [[1]] }, { connector: "=", values: [[1]] }],
    highlight: { cells: [[0, 0]] }
  }));
  assert.equal(orphanHighlight.ok, false);
  assert.match(errorText(orphanHighlight), /highlight no nível do card exige values/u);

  const invalidDivider = validateCard(baseCard("matrix", {
    values: [[1, 2], [3, 4]],
    dividerAfterColumn: 1
  }));
  assert.equal(invalidDivider.ok, false);
  assert.match(errorText(invalidDivider), /fica fora da matriz/u);
});

test("matrix não aceita destaques repetidos", () => {
  const result = validateCard(baseCard("matrix", {
    values: [[1, 2], [3, 4]],
    highlight: { cells: [[0, 0], [0, 0]], rows: [1, 1] }
  }));
  assert.equal(result.ok, false);
  assert.match(errorText(result), /cells não pode repetir/u);
  assert.match(errorText(result), /rows não pode repetir/u);
});

test("plane valida o objeto scale, intervalos e o modo visual efetivo", () => {
  const unknownScaleField = validateCard(baseCard("plane", {
    scale: { k: 2, vector: [1, 3], unit: "m" }
  }));
  assert.equal(unknownScaleField.ok, false);
  assert.match(errorText(unknownScaleField), /scale\.unit/u);

  const invalidRange = validateCard(baseCard("plane", { x: [2, -2], y: [-1, 1] }));
  assert.equal(invalidRange.ok, false);
  assert.match(errorText(invalidRange), /intervalo crescente/u);

  const incompleteSum = validateCard(baseCard("plane", { sum: [[1, 0]] }));
  assert.equal(incompleteSum.ok, false);
  assert.match(errorText(incompleteSum), /exatamente dois vetores/u);

  const competingModes = validateCard(baseCard("plane", { vector: [1, 0], distance: [[0, 0], [1, 1]] }));
  assert.equal(competingModes.ok, false);
  assert.match(errorText(competingModes), /um único modo visual principal/u);

  const resultOnly = validateCard(baseCard("plane", { result: [1, 2] }));
  assert.equal(resultOnly.ok, false);
  assert.match(errorText(resultOnly), /ao menos um dado visual/u);
});

test("flow rejeita campos desconhecidos, prática truncada e ids repetidos", () => {
  const unknownNode = validateFlowchartStructureContract({
    kind: "sequence",
    items: [{ kind: "process", text: "Executar", color: "red" }]
  });
  assert.equal(unknownNode.valid, false);
  assert.match(unknownNode.findings.join("\n"), /root\.items\[0\]\.color:unknown_field/u);

  const invalidPractice = validateFlowchartStructureContract({
    kind: "sequence",
    items: [{
      kind: "process",
      text: "Executar",
      practice: {
        blankShape: false,
        shapeOptions: ["process", "process", "desconhecida"],
        text: { blank: true, options: [{ value: "Executar", color: "red" }] }
      }
    }]
  });
  assert.equal(invalidPractice.valid, false);
  assert.match(invalidPractice.findings.join("\n"), /duplicate_value/u);
  assert.match(invalidPractice.findings.join("\n"), /unsupported_shape/u);
  assert.match(invalidPractice.findings.join("\n"), /unknown_field/u);
  assert.match(invalidPractice.findings.join("\n"), /incompatible_false/u);

  const duplicateId = validateFlowchartStructureContract({
    kind: "sequence",
    items: [
      { id: "step", kind: "process", text: "A" },
      { id: "step", kind: "process", text: "B" }
    ]
  });
  assert.equal(duplicateId.valid, false);
  assert.match(duplicateId.findings.join("\n"), /duplicate_id/u);
});

test("composite aplica a mesma fronteira estrita aos recursos internos", () => {
  const result = validateCard(baseCard("composite", {
    blocks: [{
      id: "relation-map-1",
      kind: "relation_map",
      prompt: "Observe.",
      leftSet: { label: "U", items: [{ id: "u1", label: "A", color: "red" }] },
      rightSet: { label: "V", items: [{ id: "v1", label: "1" }] },
      relations: [{ from: "u1", to: "v1" }]
    }]
  }));
  assert.equal(result.ok, false);
  assert.match(errorText(result), /blocks\[0\]\.leftSet\.items\[0\]\.color/u);
});
