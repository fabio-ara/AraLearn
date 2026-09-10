import assert from "node:assert/strict";
import test from "node:test";
import { choiceResponsePackage as choice } from "../../src/resources/packages/choice-response/index.js";

const question = "Qual medida mantém a conexão? Responda considerando o caso descrito.";
const data = (selectionMode = "single", selectionCriterion = "correct") => choice.normalize({ question, selectionMode, selectionCriterion,
  options: [{ id: "a", text: "Manter o vínculo." }, { id: "b", text: "Alterar somente a cor." }, { id: "c", text: "Retirar o vínculo." }], answerIds: ["a"] });

test("choice simples usa o enunciado como nome e conserva a seleção sem orientação mecânica redundante", () => {
  const html = choice.render(data(), { blockKey: "choice-1", responseState: { selected: ["a"] } });
  assert.ok(html.includes(question));
  assert.doesNotMatch(html, /Selecione a alternativa correta|multiple-choice-instruction|aria-describedby/u);
  assert.match(html, /id="choice-1::question"/u);
  assert.match(html, /role="radiogroup" aria-labelledby="choice-1::question"/u);
  assert.match(html, /role="radio" aria-checked="true" data-choice-option-id="a"/u);
  assert.equal(choice.evaluate(data(), { selectedIds: ["a"] }).correct, true);
});

test("múltipla e melhor resposta conservam a condição visível e a descrição acessível", () => {
  for (const [mode, criterion, instruction, role] of [
    ["multiple", "correct", "Selecione todas as alternativas corretas.", "checkbox"],
    ["single", "best", "Selecione a melhor alternativa.", "radio"]
  ]) {
    const html = choice.render(data(mode, criterion), { blockKey: "special" });
    assert.ok(html.includes(instruction));
    assert.match(html, /id="special::instruction"/u);
    assert.match(html, /aria-labelledby="special::question" aria-describedby="special::instruction"/u);
    assert.ok(html.includes(`role="${role}"`));
  }
});

test("resposta revelada, incompletude e feedback continuam distintos da instrução", () => {
  const revealed = choice.render(data(), { blockKey: "reveal", revealPracticeAnswers: true });
  assert.match(revealed, /Alternativas e resposta esperada\./u);
  assert.match(revealed, /Resposta esperada exibida\./u);
  assert.match(revealed, /role="group" aria-labelledby="reveal::question" aria-describedby="reveal::instruction"/u);
  for (const answerIds of [["a"], ["a", "c"]]) {
    const html = choice.render({ ...data(answerIds.length > 1 ? "multiple" : "single"), answerIds }, { revealPracticeAnswers: true });
    const options = [...html.matchAll(/<div class="multiple-choice-option[^"]*"[^>]*data-choice-option-id="([^"]+)"[^>]*>([\s\S]*?)<\/div>/gu)];
    assert.equal(options.length, 3);
    for (const option of options) assert.equal(option[2].includes('class="visually-hidden">Resposta esperada: </span>'), answerIds.includes(option[1]));
    assert.doesNotMatch(html, /<button|role="radio"|role="checkbox"|data-action="choice-/u);
  }
  const incomplete = choice.render(data(), { responseState: { feedback: "incomplete" } });
  assert.match(incomplete, /role="alert" aria-live="assertive"/u);
  assert.match(incomplete, /Selecione pelo menos uma resposta\./u);
});

test("alternativa de código preserva crases, asteriscos, linhas, indentação e escape literal", () => {
  const source = 'const template = `*literal* ${valor}`;\n\tif (x < 2) return "漢字 <script>";';
  const authored = { ...data(), options: [{ id: "a", kind: "code", language: "javascript", code: source }, { id: "b", text: "Outra operação." }] };
  const html = choice.render(authored, { blockKey: 'code"<&' });
  assert.ok(html.includes('const template = `*literal* ${valor}`;\n\tif (x &lt; 2) return &quot;漢字 &lt;script&gt;&quot;;'));
  assert.doesNotMatch(html, /<em>|<script>/u);
  assert.match(html, /aria-labelledby="code&quot;&lt;&amp;::question"/u);
  assert.equal(choice.accessibleText(authored).includes(source), true);
  assert.equal(authored.options[0].code, source);
});
