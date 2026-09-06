import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderCslReference } from "../../src/bibliography/renderCslReference.js";
import { bibliographyVendorOutputs, buildBibliographyModule, applyAbntElectronicLocationPatch, applyAbntAccessPunctuationPatch, applyAbntEmptyMetadataSeparatorPatch } from "../../scripts/buildBibliographyVendor.mjs";
import { COURSE_SOURCE_KINDS, createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { courseSourceToCslItem } from "../../src/domain/courseSourceReference.js";

const corpus = JSON.parse(await readFile(new URL("../fixtures/bibliography/corpus.json", import.meta.url), "utf8"));
const styles = ["apa7", "abnt-2025"];
const code = (expected) => (error) => error?.code === expected;

test("diagnósticos bibliográficos não enviam conteúdo ao console e erros continuam explícitos", async (t) => {
  const { default: engine } = await import("../../src/bibliography/vendor/citeproc.generated.js");
  for (const method of ["log", "info", "warn", "error", "debug", "trace"]) {
    t.mock.method(console, method, () => assert.fail("Conteúdo bibliográfico chegou ao console."));
  }
  engine.debug("referência sintética que deve permanecer local");
  assert.throws(() => engine.error("falha sintética"), /citeproc-js error: falha sintética/u);
});

test("motor e estilos correspondem aos fontes e hashes fixados; alteração do fonte recusa geração", async () => {
  for (const [file, expected] of await bibliographyVendorOutputs()) {
    assert.equal(await readFile(new URL(`../../${file}`, import.meta.url), "utf8"), expected, file);
  }
  assert.throws(() => buildBibliographyModule("module.exports = {};", "0".repeat(64)), /hash aprovado/u);
  assert.throws(() => applyAbntElectronicLocationPatch("<style/>"), /localização eletrônica/u);
  assert.throws(() => applyAbntAccessPunctuationPatch("<style/>"), /pontuação de acesso/u);
  assert.throws(() => applyAbntEmptyMetadataSeparatorPatch("<style/>"), /separadores de metadados/u);
});

test("ABNT pontua o acesso uma vez com ou sem data, sem inventar data ausente", async () => {
  for (const type of ["webpage", "report"]) {
    const item = { id: `access-${type}`, type, title: "Referência local", URL: "https://example.test/referencia-local" };
    const withoutDate = await renderCslReference(item, { style: "abnt-2025" });
    assert(withoutDate.text.endsWith("Disponível em: https://example.test/referencia-local."));
    assert(!withoutDate.text.includes("Acesso em:"));
    assert(!Object.hasOwn(item, "accessed"));
    const withDate = await renderCslReference({ ...item, accessed: { "date-parts": [[2026, 9, 5]] } }, { style: "abnt-2025" });
    assert(withDate.text.endsWith("Disponível em: https://example.test/referencia-local. Acesso em: 5 set. 2026."));
    const noUrl = await renderCslReference({ id: `no-url-${type}`, type, title: item.title }, { style: "abnt-2025" });
    assert(!noUrl.text.includes("Disponível em:"));
    assert(!noUrl.text.includes("Acesso em:"));
  }
});

test("APA e ABNT preservam dados do corpus e devolvem somente runs tipados", async () => {
  const before = structuredClone(corpus);
  for (const style of styles) {
    for (const item of corpus) {
      const result = await renderCslReference(item, { style });
      assert.deepEqual(Object.keys(result).sort(), ["runs", "text"]);
      assert(result.text.trim());
      assert.equal(result.text, result.runs.map((run) => run.text).join(""));
      for (const run of result.runs) {
        assert(Object.keys(run).every((key) => ["text", "italic", "bold", "verticalAlign"].includes(key)));
        assert.equal(typeof run.text, "string");
        if (Object.hasOwn(run, "italic")) assert.equal(run.italic, true);
        if (Object.hasOwn(run, "bold")) assert.equal(run.bold, true);
        if (Object.hasOwn(run, "verticalAlign")) assert(["sup", "sub"].includes(run.verticalAlign));
      }
    }
  }
  assert.deepEqual(corpus, before);
});

test("referência preserva título em itálico APA e em negrito ABNT sem apresentar HTML", async () => {
  const item = corpus.find((entry) => entry.id === "manual");
  const apa = await renderCslReference(item, { style: "apa7" });
  const abnt = await renderCslReference(item, { style: "abnt-2025" });
  assert(apa.runs.some((run) => run.italic && run.text.includes("Publication manual")));
  assert(abnt.runs.some((run) => run.bold && run.text.includes("Publication manual")));
  assert.match(apa.text, /American Psychological Association\. \(2019\)\./u);
  assert.match(apa.text, /\(7th ed\.\)/u);
  assert.match(abnt.text, /2019/u);
  assert(!/<\/?(?:em|strong|span)\b/u.test(apa.text));
});

test("dados ausentes não viram autor, data de acesso ou ano inventado; item vazio é recusado", async () => {
  for (const style of styles) {
    const result = await renderCslReference(corpus.find((item) => item.id === "incomplete"), { style });
    assert(!/202[0-9]|1900|undefined|null|Acesso em|Retrieved/iu.test(result.text));
    await assert.rejects(renderCslReference({ id: "missing", type: "document" }, { style }), code("insufficient_bibliographic_data"));
  }
});

test("metadados hostis continuam texto, preservando entidades e ênfase sem atributos executáveis", async () => {
  const hostile = corpus.find((item) => item.id === "markup-probe");
  for (const style of styles) {
    const result = await renderCslReference(hostile, { style });
    assert(result.text.includes("<script>globalThis.__cslExecuted=1</script>"));
    assert(result.text.includes("&"));
    assert(!Object.hasOwn(result, "html"));
    assert(result.runs.every((run) => !Object.keys(run).some((key) => /^on|html|href|style$/u.test(key))));
    const encoded = await renderCslReference({ id: "entities", type: "book", title: "&lt;b&gt; &#60; & x < y" }, { style });
    assert(encoded.text.toLowerCase().includes("&lt;b&gt; &#60; & x < y"));
  }
});

test("reset tipográfico e sobrescrito ficam contidos na própria ocorrência", async () => {
  const result = await renderCslReference({ id: "nested", type: "book", title: "Base <i>interna</i> normal H<sub>2</sub>O x<sup>2</sup>", issued: { "date-parts": [[2024]] } }, { style: "apa7" });
  assert(result.runs.some((run) => run.text.includes("interna") && !run.italic));
  assert(result.runs.some((run) => run.text === "2" && run.verticalAlign === "sub"));
  assert(result.runs.some((run) => run.text === "2" && run.verticalAlign === "sup"));
  assert(result.runs.some((run) => run.text.includes("normal") && run.italic && !run.verticalAlign));
});

test("estilos, campos, nomes, URLs, datas e orçamento inválidos falham antes da formatação", async () => {
  const base = { id: "bounded", type: "book", title: "Título" };
  await assert.rejects(renderCslReference(base, { style: "untrusted.csl" }), code("invalid_bibliography_style"));
  const bad = [
    { ...base, unknown: "extra" }, { ...base, type: "software" },
    { ...base, language: "__proto__" },
    { ...base, URL: "javascript:alert(1)" }, { ...base, URL: "https://user:password@example.test" },
    { ...base, author: [{ literal: "Instituição", family: "Sobrenome" }] },
    { ...base, author: [{ given: "Sem sobrenome" }] },
    { ...base, issued: { "date-parts": [[2023, 2, 29]] } },
    { ...base, issued: { "date-parts": [[2024, 13]] } },
    { ...base, issued: { "date-parts": [[2024]], literal: "ontem" } },
    { ...base, title: "x".repeat(4001) },
    { ...base, author: Array.from({ length: 64 }, () => ({ literal: "x".repeat(1000) })) },
    JSON.parse('{"id":"a","type":"book","title":"Título","__proto__":{}}')
  ];
  for (const item of bad) await assert.rejects(renderCslReference(item, { style: "apa7" }), code("invalid_bibliographic_reference"));
  for (const parts of [[2024], [2024, 2], [2024, 2, 29]]) {
    assert((await renderCslReference({ ...base, issued: { "date-parts": [parts] } }, { style: "apa7" })).text.includes("2024"));
  }
});

test("chamadas concorrentes de estilos diferentes mantêm contexto e locale próprios", async () => {
  const item = corpus.find((entry) => entry.id === "manual");
  const [apa, abnt, repeat] = await Promise.all([
    renderCslReference(item, { style: "apa7" }),
    renderCslReference(item, { style: "abnt-2025" }),
    renderCslReference(item, { style: "apa7" })
  ]);
  assert.deepEqual(apa, repeat);
  assert.notEqual(apa.text, abnt.text);
  assert(apa.runs.some((run) => run.italic));
  assert(abnt.runs.some((run) => run.bold));
});

test("cache por conteúdo isola revisões e impede mutação do resultado compartilhado", async () => {
  const item = corpus.find((entry) => entry.id === "manual");
  const expected = await renderCslReference(item, { style: "apa7" });
  const changedByCaller = await renderCslReference(item, { style: "apa7" });
  changedByCaller.runs[0].text = "Alteração externa";
  changedByCaller.text = "Alteração externa";
  assert.deepEqual(await renderCslReference(item, { style: "apa7" }), expected);
  const next = await renderCslReference({ ...item, title: "Outra obra com o mesmo identificador" }, { style: "apa7" });
  assert.notEqual(next.text, expected.text);
  assert(next.text.includes("Outra obra"));
  assert.deepEqual(await renderCslReference(item, { style: "apa7" }), expected);
});

test("identificadores da fonte não se tornam chaves especiais do processador", async () => {
  for (const id of ["constructor", "__proto__"]) {
    assert((await renderCslReference({ id, type: "book", title: "Livro de ensaio" }, { style: "apa7" })).text.includes("Livro de ensaio"));
  }
});

test("localização eletrônica aparece em APA e ABNT sem se tornar paginação nem duplicar páginas", async () => {
  const article = { id: "elocation", type: "article-journal", title: "Artigo de ensaio", author: [{ family: "Silva", given: "Ana" }],
    issued: { "date-parts": [[2025]] }, "container-title": "Periódico de ensaio", volume: "4", issue: "2", number: "e12345" };
  for (const style of styles) {
    const electronic = await renderCslReference(article, { style });
    assert.equal(electronic.text.match(/e12345/gu)?.length, 1);
    assert(!/p\.\s*e12345/u.test(electronic.text));
    const pageItem = { ...article, page: "12-19" };
    delete pageItem.number;
    const pages = await renderCslReference(pageItem, { style });
    assert(/12[–-]19/u.test(pages.text));
    assert(!pages.text.includes("e12345"));
  }
});

test("projeção dos onze tipos da fonte canônica é aceita pelo motor", async () => {
  for (const kind of COURSE_SOURCE_KINDS) {
    const item = courseSourceToCslItem({ sourceId: `source-${kind}`, kind, title: "Material de ensaio", authors: [{ literal: "Instituição de ensaio" }],
      publicationDate: null, url: null, language: null, editionOrVersion: null, bibliographic: createEmptyCourseSourceBibliographicMetadata() });
    assert((await renderCslReference(item, { style: "apa7" })).text.includes("Material de ensaio"), kind);
  }
});

test("autoria literal e URL identificam material sem título; limites aceitam a fonte canônica", async () => {
  const url = `https://example.test/${"a".repeat(2027)}`;
  assert.equal(url.length, 2048);
  for (const style of styles) {
    const result = await renderCslReference({ id: "x".repeat(240), type: "manuscript", author: [{ literal: "Instituto de ensaio" }], URL: url }, { style });
    assert.match(result.text, /Instituto de ensaio/iu);
    assert(result.text.includes(url));
    assert(!result.text.includes("Material de ensaio"));
  }
});

test("onze tipos com dados mínimos preservam título e URL sem separadores duplicados nem data inventada", async () => {
  for (const kind of COURSE_SOURCE_KINDS) {
    const source = { sourceId: `minimal-${kind}`, kind, title: "Referência local", authors: [],
      publicationDate: null, url: "https://example.test/referencia-local", language: null,
      editionOrVersion: null, bibliographic: createEmptyCourseSourceBibliographicMetadata() };
    const item = courseSourceToCslItem(source);
    const original = structuredClone(item);
    for (const style of styles) {
      const { text, runs } = await renderCslReference(item, { style });
      assert.match(text, /Referência local/iu, `${kind}/${style}`);
      assert(text.includes(source.url), `${kind}/${style}`);
      assert.doesNotMatch(text, /[.,;:]\s+[.,;:]/u, `${kind}/${style}`);
      assert.doesNotMatch(text, /Acesso em:|\b2026\b/u, `${kind}/${style}`);
      assert.equal(runs.map(({ text }) => text).join(""), text);
    }
    assert.deepEqual(item, original);
    assert(!Object.hasOwn(item, "author"));
    assert(!Object.hasOwn(item, "issued"));
    assert(!Object.hasOwn(item, "accessed"));
  }
});
