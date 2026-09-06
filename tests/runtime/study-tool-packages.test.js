import assert from "node:assert/strict";
import test from "node:test";
import { calculatorPackage } from "../../src/resources/packages/calculator/index.js";
import { grammarPackage } from "../../src/resources/packages/grammar/index.js";
import { dictionaryPackage } from "../../src/resources/packages/dictionary/index.js";
import { readingPackage } from "../../src/resources/packages/reading/index.js";
import { CalculatorError, evaluateCalculatorExpression } from "../../src/resources/packages/calculator/expression.js";
import { createPackageRegistry } from "../../src/resources/kernel/packageRegistry.js";

const definitions = [calculatorPackage, grammarPackage, dictionaryPackage, readingPackage];
const registry = createPackageRegistry(definitions);
const instance = (definition, data = definition.authoringContract.example) => ({
  id: `${definition.manifest.id}-instance`, package: definition.manifest.id, version: definition.manifest.version, data: structuredClone(data)
});
const failure = (code) => (error) => error instanceof CalculatorError && error.code === code;

test("quatro ferramentas usam o registro comum e exemplos válidos no conteúdo, sem outro slot", () => {
  for (const definition of definitions) {
    const value = instance(definition);
    assert.deepEqual(registry.validateInstance(value, "content"), { valid: true, errors: [] });
    assert.equal(registry.validateInstance(value, "feedback").valid, false);
    assert.deepEqual(registry.normalizeInstance(value, "content"), value);
    assert.equal(registry.get(definition.manifest.id, "1.0.0").toolInteraction, definition.toolInteraction);
    assert(definition.accessibleText(value.data).includes(value.data.title));
    assert(definition.editableTargets(value.data).length > 0);
    assert.deepEqual(definition.practiceTargets(value.data), []);
  }
});

test("calculadora respeita precedência matemática, sinal, potência à direita e decimais explícitos", () => {
  for (const [expression, expected] of [
    ["2 + 3 * 4", 14], ["(2+3)*4", 20], ["2^3^2", 512], ["-2^2", -4], ["(-2)^2", 4],
    ["2^-2", 0.25], ["3--2", 5], ["1,5 + .25", 1.75], ["2e3/4", 500], ["6 ÷ 2 × 3 − 1", 8],
    ["sqrt(3^2+4^2)", 5], ["abs(-4)", 4], ["log(100)", 2], ["ln(e)", 1], ["exp(0)", 1]
  ]) assert.equal(evaluateCalculatorExpression(expression).value, expected, expression);
  assert.equal(evaluateCalculatorExpression("0.1+0.2").text, "0.3");
  assert.equal(evaluateCalculatorExpression("-0").text, "0");
  assert.equal(evaluateCalculatorExpression("1/3").text, "0.333333333333");
});

test("calculadora distingue graus de radianos e explica os polos trigonométricos", () => {
  assert(Math.abs(evaluateCalculatorExpression("sin(90)", { angleUnit: "degrees" }).value - 1) < 1e-12);
  assert(Math.abs(evaluateCalculatorExpression("sin(pi/2)", { angleUnit: "radians" }).value - 1) < 1e-12);
  assert(Math.abs(evaluateCalculatorExpression("cos(π)").value + 1) < 1e-12);
  assert(Math.abs(evaluateCalculatorExpression("tan(45)", { angleUnit: "degrees" }).value - 1) < 1e-12);
  assert.throws(() => evaluateCalculatorExpression("tan(90)", { angleUnit: "degrees" }), failure("outside_real_domain"));
  assert.throws(() => evaluateCalculatorExpression("sin(1e13)"), failure("angle_out_of_range"));
  assert.throws(() => evaluateCalculatorExpression("1", { angleUnit: "gradians" }), failure("invalid_angle_unit"));
});

test("calculadora recusa código, acessos, multiplicação implícita e expressões incompletas", () => {
  for (const expression of ["globalThis.alert(1)", "constructor(1)", "__proto__", "Math.sqrt(4)", "1;2", "1&&2",
    "[1][0]", "x=4", "2(3)", "2pi", "sqrt 4", "sqrt()", "2+", "(2+3", "2)", "1,2,3", "1 000", "NaN", "Infinity", "<img src=x>"]) {
    assert.throws(() => evaluateCalculatorExpression(expression), (error) => error instanceof CalculatorError, expression);
  }
  assert.throws(() => evaluateCalculatorExpression(""), failure("empty_expression"));
  assert.throws(() => evaluateCalculatorExpression("9".repeat(257)), failure("expression_too_long"));
  assert.throws(() => evaluateCalculatorExpression("1+".repeat(64) + "1"), failure("expression_too_complex"));
  assert.throws(() => evaluateCalculatorExpression("(".repeat(33) + "1" + ")".repeat(33)), failure("expression_too_deep"));
});

test("calculadora recusa divisão por zero, domínio não real, estouro e perda total por arredondamento", () => {
  assert.throws(() => evaluateCalculatorExpression("1/0"), failure("division_by_zero"));
  for (const expression of ["sqrt(-1)", "ln(0)", "log(-2)", "(-8)^(1/3)", "0^0", "0^-1"]) {
    assert.throws(() => evaluateCalculatorExpression(expression), failure("outside_real_domain"), expression);
  }
  for (const expression of ["1e309", "1e-999"]) assert.throws(() => evaluateCalculatorExpression(expression), failure("number_out_of_range"));
  for (const expression of ["1e308*10", "exp(1000)", "exp(-1000)", "1e-300*1e-300", "1e-300/1e300", "10^-1000"]) {
    assert.throws(() => evaluateCalculatorExpression(expression), failure("result_out_of_range"), expression);
  }
});

test("auxiliares preservam itens plurais, idioma e referência lógica de PDF sem URL temporária", () => {
  for (const definition of definitions.slice(1)) {
    const data = { title: "Recursos", items: [
      { id: "url", label: "語法 /ɐ/ العربية", languageTag: "zh-Hant", target: { kind: "url", url: "https://example.org/consulta?q=%E8%AA%9E" } },
      { id: "pdf", label: "Leitura em PDF", target: { kind: "source_attachment", sourceId: "source-one", sourceRevision: 2, contentHash: "a".repeat(64) } }
    ] };
    const value = instance(definition, data);
    assert.equal(registry.validateInstance(value, "content").valid, true);
    assert.deepEqual(registry.normalizeInstance(value, "content").data, data);
    const html = definition.render(data);
    assert.match(html, /lang="zh-Hant"/u);
    assert.match(html, /dir="auto"/u);
    assert.equal((html.match(/data-tool-link-index=/gu) || []).length, 2);
    assert(!html.includes("source-one"));
    assert(!html.includes("https://example.org"));
  }
});

test("auxiliares rejeitam destinos executáveis, campos extras, revisão falsa e URL de Storage", () => {
  const invalidTargets = [
    { kind: "url", url: "javascript:alert(1)" }, { kind: "url", url: "data:text/html,test" },
    { kind: "url", url: "https://user:password@example.org/" }, { kind: "url", url: "/relativo" },
    { kind: "url", url: "https://example.org/\nresource" },
    { kind: "url", url: "https://example.org/storage/v1/object/sign/pdf/file?token=secret" },
    { kind: "source_attachment", sourceId: "source", sourceRevision: 0, contentHash: "a".repeat(64) },
    { kind: "source_attachment", sourceId: "source", sourceRevision: 1, contentHash: "invalid" },
    { kind: "source_attachment", sourceId: "source", sourceRevision: 1, contentHash: "a".repeat(64), url: "https://example.org/" }
  ];
  for (const target of invalidTargets) {
    const value = instance(readingPackage, { title: "Leitura", items: [{ id: "one", label: "Item", target }] });
    assert.equal(registry.validateInstance(value, "content").valid, false, JSON.stringify(target));
  }
  const duplicate = instance(readingPackage);
  duplicate.data.items.push(structuredClone(duplicate.data.items[0]));
  assert.equal(registry.validateInstance(duplicate, "content").valid, false);
});

test("render de títulos e rótulos hostis não cria elementos ou atributos executáveis", () => {
  const hostile = '<img src=x onerror="alert(1)">';
  for (const definition of definitions) {
    const data = structuredClone(definition.authoringContract.example);
    data.title = hostile;
    if (data.items) data.items[0].label = hostile;
    const html = definition.render(data);
    assert(!html.includes("<img"));
    assert(html.includes("&lt;img"));
    assert(!html.includes(' onerror="'));
  }
});
