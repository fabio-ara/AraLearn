import assert from "node:assert/strict";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  FLOWCHART_STRUCTURE_INPUT_SCHEMA,
  validateFlowchartStructureContract
} from "../../src/flowchart/flowchartStructure.js";

function canonicalIfChain() {
  return {
    kind: "sequence",
    items: [{
      id: "permission-chain",
      kind: "if_chain",
      cases: [{
        id: "administrator",
        condition: "é administrador?",
        thenBranch: [{ id: "allow", kind: "process", text: "Permitir acesso" }]
      }],
      elseBranch: [{ id: "deny", kind: "process", text: "Negar acesso" }]
    }]
  };
}

test("if_chain aceita somente cases com thenBranch e rejeita branches legado", () => {
  const canonical = canonicalIfChain();
  const legacy = structuredClone(canonical);
  const [node] = legacy.items;
  node.branches = node.cases.map(({ id, condition, thenBranch }) => ({
    id,
    condition,
    items: thenBranch
  }));
  delete node.cases;

  const canonicalResult = validateFlowchartStructureContract(canonical);
  const legacyResult = validateFlowchartStructureContract(legacy);

  assert.equal(canonicalResult.valid, true, canonicalResult.findings.join("\n"));
  assert.equal(legacyResult.valid, false);
  assert.match(legacyResult.findings.join("\n"), /root\.items\[0\]\.branches:unknown_field/u);

  const validateSchema = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  }).compile(FLOWCHART_STRUCTURE_INPUT_SCHEMA);
  assert.equal(validateSchema(canonical), true, JSON.stringify(validateSchema.errors));
  assert.equal(validateSchema(legacy), false);
  assert.ok(validateSchema.errors.some((error) =>
    error.keyword === "additionalProperties" &&
    error.params?.additionalProperty === "branches"
  ));
});
