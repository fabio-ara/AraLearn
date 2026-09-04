import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { COURSE_AUTHORING_GUIDES } from
  "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";

test("revisão linguístico-didática mantém focos salientes sem virar árbitro mecânico", async () => {
  const corpus = JSON.parse(await readFile(
    new URL("../fixtures/authoring-language-review-corpus.json", import.meta.url),
    "utf8"
  ));
  assert.equal(corpus.length, 3);
  for (const example of corpus) {
    assert.ok(example.focus.length > 0);
    assert.notEqual(example.before, example.after);
  }
  const guidance = COURSE_AUTHORING_GUIDES.linguistic_didactic_review.instructions.join(" ");
  for (const pattern of [
    /curto\/curta/iu,
    /negativas defensivas/iu,
    /metadiscurso/iu,
    /combina\/reúne/iu,
    /enumerações extensas/iu,
    /empilhamento de conceitos/iu,
    /anglicismos ou decalques/iu,
    /metáforas técnicas inadequadas/iu,
    /terminologia ou sigla/iu,
    /explica em vez de apenas resumir/iu
  ]) assert.match(guidance, pattern);
  assert.match(guidance, /não são proibições mecânicas/iu);
});

test("rótulos públicos evitam capitalização artificial de substantivos comuns", async () => {
  const sources = await Promise.all([
    "../../src/study/CourseStudyScreen.js",
    "../../src/ui/CourseInspectionSequence.js",
    "../../src/ui/courseAuthoringViewModel.js"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const visibleSource = sources.join("\n");

  for (const phrase of [
    "Ordem das Lições",
    "Fontes e Âncoras",
    "à Observação enviada",
    "esta Observação em lote",
    "Um Tópico da estrutura"
  ]) {
    assert.doesNotMatch(visibleSource, new RegExp(phrase, "u"));
  }
});
