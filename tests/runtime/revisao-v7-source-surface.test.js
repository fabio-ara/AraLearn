import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { explanationSourceScope, unlocatedSourceMarkers } from "../../src/study/studyExplanation.js";

const references = readFileSync(new URL("../../public/study-references.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../../public/styles-tokens.css", import.meta.url), "utf8");
const content = { title: "Explicação", content: [{ id: "claimed", package: "aralearn.resource.paragraph",
  version: "1.0.0", data: { text: "Uma camada relaciona pontas de comunicação." } }] };
const citation = (linkId, overrides = {}) => ({ linkId, occurrences: [], ...overrides });
const occurrence = (overrides = {}) => ({ occurrenceId: "where", slot: "content", resourceId: "claimed",
  path: "text", quote: "camada", prefix: "Uma ", suffix: " relaciona", ...overrides });
const tokenValue = name => Number.parseFloat(tokens.match(new RegExp("--" + name + ":\\s*([\\d.]+)rem;", "u"))[1]);
const ruleBody = selector => {
  const start = references.indexOf(selector + " {");
  assert.notEqual(start, -1, "Regra ausente: " + selector);
  return references.slice(start + selector.length + 2, references.indexOf("}", start));
};

test("a folha de Explicação tem um escopo único e nunca mistura as fontes da unidade", () => {
  assert.equal(explanationSourceScope({ source: "unit" }), "unit");
  assert.equal(explanationSourceScope({ source: "explanation" }), "explanation");
  assert.equal(explanationSourceScope({ linkId: "unit-source" }), "explanation");
  assert.equal(explanationSourceScope(null), "explanation");
  assert.equal(explanationSourceScope(undefined), "explanation");
});

test("fonte com trecho não localizável permanece declarada e não vira ausência de fonte", () => {
  const located = citation("located", { occurrences: [occurrence()] });
  const unlocated = citation("unlocated", { occurrences: [occurrence({ occurrenceId: "missing",
    quote: "Trecho ausente da cópia atual.", prefix: null, suffix: null })] });
  const contextual = citation("contextual");
  const partially = citation("partially", { occurrences: [occurrence(), occurrence({ occurrenceId: "missing",
    quote: "Trecho ausente da cópia atual.", prefix: null, suffix: null })] });
  assert.deepEqual(unlocatedSourceMarkers(content, { citations: [located, unlocated, contextual, partially] }),
    [{ linkId: "unlocated", number: 2, needsReview: true }]);
  assert.deepEqual(unlocatedSourceMarkers(content, { citations: [located, contextual] }), []);
  assert.deepEqual(unlocatedSourceMarkers(content, null), []);
  // Um vínculo já localizado conserva o número único da referência; a ocorrência
  // não localizada do mesmo vínculo é declarada no bloco da própria referência.
  assert.deepEqual(unlocatedSourceMarkers(content, { citations: [partially] }), []);
});

test("obra, trecho e âncora mantêm hierarquia declarada na folha de estudo", () => {
  assert.ok(tokenValue("type-xs") < tokenValue("type-sm"));
  const work = ruleBody(".study-bibliography .study-citation-reference");
  assert.ok(work.includes("font-size: var(--type-sm)"));
  assert.ok(work.includes("color: var(--text-secondary)"));
  const quote = ruleBody(".study-explanation-body .study-bibliography .study-citation-quote");
  assert.ok(quote.includes("font-size: var(--type-xs)"));
  assert.ok(quote.includes("color: var(--text-secondary)"));
  assert.ok(quote.includes("white-space: pre-wrap"));
  assert.ok(quote.includes("border-inline-start: 2px solid var(--border-subtle)"));
  const locations = ruleBody(".study-explanation-body .study-bibliography .study-citation-locations");
  assert.ok(locations.includes("font-size: var(--type-xs)"));
  assert.ok(locations.includes("color: var(--text-secondary)"));
  assert.ok(locations.includes("padding-inline-start: 0"));
  // A hierarquia do escopo de estudo não reescreve a geometria já verificada da
  // inspeção e da revisão da autoria.
  for (const line of references.split("\n")) {
    assert.equal(/^\.study-citation-(?:quote|locations)\s*\{/u.test(line), false, line);
  }
  assert.ok(ruleBody(".course-microsequence-review .study-citation-locations").includes("font-size: var(--type-sm)"));
});
