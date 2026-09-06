import assert from "node:assert/strict";
import test from "node:test";
import { validatePackageSchema } from "../../src/resources/kernel/schemaValidation.js";
import { validateFormulaExpression } from "../../src/domain/formulaExpression.js";
import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";

function nestedRoots(count) {
  let expression = { type: "number", value: "4" };
  for (let index = 0; index < count; index += 1) expression = { type: "root", radicand: expression };
  return expression;
}

test("travessia do schema admite a profundidade canônica da AST em fórmula e parágrafo", () => {
  for (const count of [28, 31, 32]) {
    const expression = nestedRoots(count);
    const expected = validateFormulaExpression(expression).ok;
    assert.equal(expected, count <= 31);
    const math = { notation: "mathematics", accessibleText: "Raízes sucessivas de quatro.", expression };
    const formula = registry.validateInstance({ id: "formula-depth", package: "aralearn.resource.formula", version: "1.0.0", data: math }, "content");
    assert.equal(formula.valid, expected, JSON.stringify(formula.errors));
    for (const blocks of [[{ kind: "math", ...math }], [{ kind: "paragraph", inlines: [{ kind: "math", ...math }] }]]) {
      const paragraph = registry.validateInstance({ id: "rich-depth", package: "aralearn.resource.paragraph", version: "1.0.0", data: { format: "rich", blocks } }, "content");
      assert.equal(paragraph.valid, expected, JSON.stringify(paragraph.errors));
    }
  }
});

test("ciclos de referências e excesso de dados falham sem recursão ilimitada", () => {
  for (const schema of [
    { $ref: "#" },
    { $ref: "#/$defs/a", $defs: { a: { $ref: "#/$defs/b" }, b: { $ref: "#/$defs/a" } } },
    { $ref: "#/$defs/missing" }
  ]) assert.equal(validatePackageSchema({}, schema).valid, false);
  let chain = { type: "string" };
  for (let index = 0; index < 101; index += 1) chain = { allOf: [chain] };
  assert.equal(validatePackageSchema("bounded", chain).valid, false);
  const recursive = { $ref: "#/$defs/node", $defs: { node: { type: "object", properties: { child: { $ref: "#/$defs/node" } } } } };
  let value = {};
  for (let index = 0; index < 81; index += 1) value = { child: value };
  assert.match(validatePackageSchema(value, recursive).error, /profundidade dos dados/u);
  assert.equal(validatePackageSchema({ child: {} }, recursive).valid, true);
});
