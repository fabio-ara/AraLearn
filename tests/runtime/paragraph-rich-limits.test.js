import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_PACKAGE_REGISTRY as registry } from "../../src/resources/packages/index.js";
import { validateFormulaExpression } from "../../src/domain/formulaExpression.js";
import { mathBlock, paragraphInstance, richData, tallExpression, wideExpression } from "../fixtures/package/rich-paragraph-limits.js";

const check = (data) => registry.validateInstance(paragraphInstance("limit", data), "content");
test("profundidade da AST é preservada quando o schema é incorporado ao parágrafo", () => {
  const expression = tallExpression(28);
  assert.equal(validateFormulaExpression(expression).ok, true);
  const result = check(richData([mathBlock(expression)]));
  assert.equal(result.valid, true, result.errors.join("\n"));
});
test("limite agregado permite 512 nós e recusa 513 entre uma ou várias expressões", () => {
  for (const blocks of [[mathBlock(wideExpression())], Array.from({ length: 128 }, () => mathBlock({ type: "row", children: [{ type: "identifier", value: "x" }, { type: "operator", value: "+" }, { type: "number", value: "1" }] }))]) {
    const result = check(richData(blocks));
    assert.equal(result.valid, true, result.errors.join("\n"));
  }
  for (const blocks of [[mathBlock(wideExpression(513))], [mathBlock(wideExpression()), mathBlock({ type: "number", value: "1" })]]) {
    const result = check(richData(blocks));
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /512/u);
  }
});

test("notação alta respeita profundidade e textos hostis não ampliam o contrato", () => {
  assert.equal(check(richData([mathBlock(tallExpression(16))])).valid, true);
  for (const expression of [tallExpression(33), { type: "identifier", value: "a".repeat(257) }, { type: "identifier", value: "<img src=x onerror=alert(1)>" }, { type: "fenced", open: "<script>", close: "</script>", content: { type: "identifier", value: "x" } }, { type: "identifier", value: "x", onclick: "alert(1)" }]) {
    assert.equal(check(richData([mathBlock(expression)])).valid, false);
    assert.throws(() => registry.normalizeInstance(paragraphInstance("bad", richData([mathBlock(expression)])), "content"), TypeError);
  }
  const manyText = richData([{ kind: "paragraph", inlines: Array.from({ length: 128 }, () => ({ kind: "text", text: "a".repeat(94) })) }]);
  assert.equal(check(manyText).valid, false);
  assert.match(check(manyText).errors.join("\n"), /12000/u);
});
