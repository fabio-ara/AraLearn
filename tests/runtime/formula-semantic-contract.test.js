import test from "node:test";
import assert from "node:assert/strict";

import { validateFormulaExpression } from "../../src/domain/formulaExpression.js";
import { formulaPackage } from "../../src/resources/packages/formula/index.js";

test("exemplo autoral em TeX exercita integral, derivada parcial, tensores, função e prosa contextual", () => {
  const example = formulaPackage.authoringContract.example;
  assert.deepEqual(formulaPackage.validate(example), []);
  assert.match(example.prompt, /teoria de campos/u);
  assert.match(example.tex, /\\int_\{\\Omega\}/u);

  const html = formulaPackage.render(example);
  assert.match(html, /<msub><mo largeop="true">∫<\/mo><mi>Ω<\/mi><\/msub>/u);
  assert.match(html, /<mfrac>/u);
  assert.match(html, /class="package-formula-fenced is-stacked"/u);
  assert.match(html, /class="package-formula-fence-anchor is-open"[^>]*stretchy="false"/u);
  assert.doesNotMatch(html, /stretchy="true"/u);
  assert.match(html, /<mo>∂<\/mo>/u);
  assert.match(html, /<msup><mi>T<\/mi><mrow><mi>i<\/mi><mi>j<\/mi><\/mrow><\/msup>/u);
  assert.match(html, /<mi>S<\/mi><mo>⁡<\/mo>/u);
  assert.doesNotMatch(html, /latex|<script/iu);
});

test("AST semântica valida operadores avançados e rejeita tensores e derivadas incompletos", () => {
  const advanced = {
    type: "large_operator",
    operator: "sum",
    lower: { type: "row", children: [{ type: "identifier", value: "k" }, { type: "operator", value: "=" }, { type: "number", value: "0" }] },
    upper: { type: "identifier", value: "n" },
    body: {
      type: "derivative",
      kind: "ordinary",
      expression: { type: "function", name: "g", arguments: [{ type: "identifier", value: "t" }] },
      variables: [{ symbol: { type: "identifier", value: "t" }, order: 2 }]
    }
  };
  assert.equal(validateFormulaExpression(advanced).ok, true);
  assert.equal(validateFormulaExpression({ type: "tensor", symbol: "T" }).ok, false);
  assert.equal(validateFormulaExpression({ type: "derivative", kind: "partial", expression: { type: "identifier", value: "u" }, variables: [] }).ok, false);
});
