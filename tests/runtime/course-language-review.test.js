import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

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

test("itens visuais do mapa usam maiúscula somente no início de cada linha", async () => {
  const guide = await readFile(
    new URL("../../docs/criar-cursos-pelo-chat.md", import.meta.url),
    "utf8"
  );
  assert.match(guide, /^> Módulo 1 —/mu);
  assert.match(guide, /^> Lição 1 —/mu);
  assert.match(guide, /^> Lição 2 —/mu);
});

test("interface e documentação pública tratam substantivos curriculares como nomes comuns", async () => {
  const docsDirectory = new URL("../../docs/", import.meta.url);
  const documentationFiles = (await readdir(docsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const publicSources = [
    ["public/main.js", await readFile(
      new URL("../../public/main.js", import.meta.url),
      "utf8"
    )],
    ...await Promise.all(documentationFiles.map(async (name) => [
      `docs/${name}`,
      await readFile(new URL(name, docsDirectory), "utf8")
    ]))
  ];
  const noun =
    "(?:Curso|Cursos|Módulo|Módulos|Lição|Lições|Microssequência|" +
    "Microssequências|Parte|Partes|Fonte|Fontes|Unidade de estudo|" +
    "Unidades de estudo|Unidade de análise|Unidades de análise)";
  const artificialCommonNoun = new RegExp(`\\b${noun}\\b`, "gu");
  const violations = [];

  const scanFragment = (name, lineNumber, source) => {
    const boldFragments = [];
    const withoutQuotedMarkup = source
      .replace(/`[^`]*`/gu, (value) => " ".repeat(value.length))
      .replace(/\[[^\]]+\]\([^)]*\)/gu, (value) => " ".repeat(value.length))
      .replace(/\*\*([^*]+)\*\*/gu, (value, inner) => {
        boldFragments.push(inner);
        return " ".repeat(value.length);
      });
    for (const region of [withoutQuotedMarkup, ...boldFragments]) {
      for (const fragment of region.split(/[.!?…|]+/u)) {
        const firstWord = /\p{L}+/u.exec(fragment);
        if (!firstWord) continue;
        artificialCommonNoun.lastIndex = 0;
        for (const match of fragment.matchAll(artificialCommonNoun)) {
          if (match.index === firstWord.index) continue;
          violations.push(`${name}:${lineNumber}: ${match[0]}`);
        }
      }
    }
  };

  for (const [name, source] of publicSources) {
    if (name === "public/main.js") {
      for (const phrase of ["seus Cursos", "PDF de Curso", "conta, Cursos próprios", "lista de Cursos"]) {
        if (source.includes(phrase)) violations.push(`${name}: ${phrase}`);
      }
      continue;
    }
    let inFence = false;
    let paragraph = [];
    let paragraphIsQuote = false;
    let paragraphStart = 1;
    const flushParagraph = () => {
      if (paragraph.length > 0) scanFragment(name, paragraphStart, paragraph.join(" "));
      paragraph = [];
      paragraphIsQuote = false;
    };
    for (const [index, originalLine] of source.split(/\r?\n/u).entries()) {
      if (/^\s*```/u.test(originalLine)) {
        flushParagraph();
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (/^\s{0,3}#{1,6}\s/u.test(originalLine) || /^\s*$/u.test(originalLine)) {
        flushParagraph();
        continue;
      }
      if (/^\s*(?:[-+*]|\d+[.)])\s+/u.test(originalLine)) flushParagraph();
      const isQuote = /^\s*>\s?/u.test(originalLine);
      if (paragraph.length > 0 && paragraphIsQuote !== isQuote) flushParagraph();
      if (paragraph.length === 0) paragraphStart = index + 1;
      paragraphIsQuote = isQuote;
      const content = originalLine
        .replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, "")
        .replace(/^\s*>\s?/u, "");
      paragraph.push(content);
      if (isQuote && /\\\s*$/u.test(content)) flushParagraph();
    }
    flushParagraph();
  }

  assert.deepEqual(violations, []);
});
