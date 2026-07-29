import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { canonicalCourseHash } from "../../src/persistence/canonicalCourseHash.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import { renderCardRuntimeArticle } from "../../src/render/renderCardRuntime.js";

const fixtureUrl = new URL("../fixtures/v4/project-visual.json", import.meta.url);

const multilingualSample = [
  "Português: ação, educação e São Paulo.",
  "普通話：學習與實踐。",
  "廣東話：學習同實踐。",
  "日本語：学習と実践。",
  "Ἑλληνική: λόγος καὶ μάθησις.",
  "العربية: التعلّم والممارسة.",
  "עברית: למידה ותרגול.",
  "IPA: /ˈa.ɾɐ ˌlɜːn/.",
  "Química: H₂SO₄ + 2 NaOH → Na₂SO₄ + 2 H₂O.",
  "Matemática: ∀x ∈ ℝ, x² ≥ 0; ∫₀¹ x dx = ½.",
  "Segurança: <script>alert('não executar')</script>.",
  "الأمان: <img src=x onerror=alert('لا')>.",
  "אבטחה: <svg onload=alert('לא')></svg>."
].join(" ");

const displayTextKeys = new Set([
  "title",
  "goal",
  "text",
  "after",
  "prompt",
  "question",
  "label",
  "value"
]);

function appendInternationalText(value) {
  if (Array.isArray(value)) {
    return value.map(appendInternationalText);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (displayTextKeys.has(key) && typeof child === "string" && child.trim()) {
      return [key, `${child} ${multilingualSample}`];
    }
    return [key, appendInternationalText(child)];
  }));
}

function collectCards(project) {
  return project.courses.flatMap((course) =>
    course.modules.flatMap((moduleValue) =>
      moduleValue.lessons.flatMap((lesson) =>
        lesson.microsequences.flatMap((microsequence) => microsequence.cards)
      )
    )
  );
}

test("texto multilíngue, fórmulas e símbolos preservam o round-trip relacional", async () => {
  const source = appendInternationalText(JSON.parse(await fs.readFile(fixtureUrl, "utf8")));
  const validation = validateProjectDocument(source);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));

  const rows = contractToRelationalRows(source);
  const rebuilt = relationalRowsToContract(rows);

  assert.deepEqual(rebuilt, source);
  assert.equal(await canonicalCourseHash(rebuilt.courses[0]), await canonicalCourseHash(source.courses[0]));

  const serializedRows = JSON.stringify(rows);
  for (const expected of ["普通話", "廣東話", "日本語", "λόγος", "العربية", "עברית", "H₂SO₄", "∫₀¹"]) {
    assert.match(serializedRows, new RegExp(expected, "u"));
  }
});

test("o renderizador mantém Unicode e neutraliza marcação executável", async () => {
  const source = appendInternationalText(JSON.parse(await fs.readFile(fixtureUrl, "utf8")));
  const html = collectCards(source).map((card) => renderCardRuntimeArticle(card)).join("\n");

  assert.match(html, /普通話/u);
  assert.match(html, /廣東話/u);
  assert.match(html, /日本語/u);
  assert.match(html, /λόγος/u);
  assert.match(html, /العربية/u);
  assert.match(html, /עברית/u);
  assert.match(html, /H₂SO₄/u);
  assert.match(html, /∫₀¹/u);
  assert.doesNotMatch(html, /<script(?:\s|>)/iu);
  assert.doesNotMatch(html, /<img(?:\s|>)/iu);
  assert.doesNotMatch(html, /<svg\s+onload/iu);
  assert.match(html, /&lt;script&gt;alert/u);
  assert.match(html, /&lt;img src=x onerror=alert/u);
  assert.match(html, /&lt;svg onload=alert/u);
  assert.match(html, /<article class="card [^"]+"[^>]* dir="auto">/u);
  assert.match(html, /<header class="card-head"><h4 dir="auto">/u);
  assert.match(html, /<p class="runtime-graph-prompt" dir="auto">/u);
});
