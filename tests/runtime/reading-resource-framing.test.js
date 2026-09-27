import test from "node:test";
import assert from "node:assert/strict";
import { renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";

const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
const calculator = { id: "framing-tool", package: "aralearn.resource.calculator", version: "1.0.0",
  data: { title: "Calculadora sintética", prompt: "Confira a expressão.", initialExpression: "sqrt(3^2 + 4^2)", angleUnit: "radians" } };
const unit = (content) => ({ id: "framing-unit", position: 1, title: "Ritmo entre recursos", role: "theory",
  content, response: null, feedback: [], topics: [] });

test("a leitura entrega os recursos na pilha e omite a moldura quando não há recurso", () => {
  const consecutive = renderPackageStudyUnitBlocks(unit([paragraph("first", "Primeiro recurso."), paragraph("second", "Segundo recurso.")]));
  assert.match(consecutive, /^<div class="runtime-resource-stack">/u);
  assert.equal([...consecutive.matchAll(/<section class="package-instance"/gu)].length, 2);
  assert.ok(consecutive.endsWith("</div>"), "A pilha fecha o conteúdo sem moldura órfã");
  assert.equal([...renderPackageStudyUnitBlocks(unit([paragraph("only", "Um recurso.")])).matchAll(/class="runtime-resource-stack"/gu)].length, 1);
  assert.equal(renderPackageStudyUnitBlocks(unit([calculator]), { toolsInActionBar: true }), "",
    "Ferramentas retiradas para a barra de ações não criam espaço vazio");
  assert.match(renderPackageStudyUnitBlocks(unit([calculator]), {}), /^<div class="runtime-resource-stack">/u);
});
