import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { resolveCardRuntime } from "../../src/core/cardRuntime.js";
import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import { canonicalCourseHash } from "../../src/persistence/canonicalCourseHash.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { ProjectDocumentDiffer } from "../../src/persistence/ProjectDocumentDiffer.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import { validateRelationalCourse } from "../../src/persistence/validateRelationalCourse.js";
import { renderCardRuntimeArticle, renderRuntimeBlockList } from "../../src/render/renderCardRuntime.js";

const fixtureUrl = new URL("../fixtures/v3/project-visual.json", import.meta.url);

async function projectWithTextMetadata() {
  const project = JSON.parse(await fs.readFile(fixtureUrl, "utf8"));
  const cards = project.courses[0].modules[0].lessons[0].microsequences[0].cards;
  cards[0].languageTag = "ar";
  cards[0].textDirection = "rtl";
  cards[0].afterBlocks = [{
    kind: "paragraph",
    value: "הסבר קצר.",
    languageTag: "he",
    textDirection: "rtl"
  }];
  cards[1].textDirection = "auto";
  return project;
}

test("idioma e direção opcionais preservam valor e omissão no round-trip relacional", async () => {
  const source = await projectWithTextMetadata();
  const contractValidation = validateProjectDocument(source);
  assert.equal(contractValidation.ok, true, JSON.stringify(contractValidation.errors));

  const rows = contractToRelationalRows(source);
  const [arabicCard, automaticCard, omittedCard] = rows.cards;
  assert.deepEqual(
    [arabicCard.languageTag, arabicCard.textDirection, arabicCard.hasLanguageTag, arabicCard.hasTextDirection],
    ["ar", "rtl", true, true]
  );
  assert.deepEqual(
    [automaticCard.languageTag, automaticCard.textDirection, automaticCard.hasLanguageTag, automaticCard.hasTextDirection],
    [null, "auto", false, true]
  );
  assert.deepEqual(
    [omittedCard.languageTag, omittedCard.textDirection, omittedCard.hasLanguageTag, omittedCard.hasTextDirection],
    [null, null, false, false]
  );

  const primaryBlock = rows.blocks.find((row) => row.cardId === arabicCard.id && row.region === "primary");
  const hebrewBlock = rows.blocks.find((row) => row.cardId === arabicCard.id && row.region === "after");
  assert.deepEqual(
    [primaryBlock.languageTag, primaryBlock.textDirection, primaryBlock.hasLanguageTag, primaryBlock.hasTextDirection],
    [null, null, false, false],
    "metadados do recurso têm uma única origem na linha do card"
  );
  assert.deepEqual(
    [hebrewBlock.languageTag, hebrewBlock.textDirection, hebrewBlock.hasLanguageTag, hebrewBlock.hasTextDirection],
    ["he", "rtl", true, true]
  );

  const relationalValidation = validateRelationalCourse(rows);
  assert.equal(relationalValidation.ok, true, JSON.stringify(relationalValidation.errors));
  const rebuilt = relationalRowsToContract(rows);
  assert.deepEqual(rebuilt, source);
  assert.equal(await canonicalCourseHash(rebuilt.courses[0]), await canonicalCourseHash(source.courses[0]));
});

test("validação rejeita etiqueta ou direção fora da extensão opcional", async () => {
  const source = await projectWithTextMetadata();
  const card = source.courses[0].modules[0].lessons[0].microsequences[0].cards[0];

  card.languageTag = "pt_BR";
  let validation = validateProjectDocument(source);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) => entry.path.endsWith(".languageTag")));

  card.languageTag = "pt-BR";
  card.textDirection = "sideways";
  validation = validateProjectDocument(source);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) => entry.path.endsWith(".textDirection")));
});

test("validação relacional confere presença e formato dos metadados", async () => {
  const rows = contractToRelationalRows(await projectWithTextMetadata());
  rows.cards[0].hasLanguageTag = false;
  let validation = validateRelationalCourse(rows, { assemble: false });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) => entry.code === "presence"));

  rows.cards[0].hasLanguageTag = true;
  rows.cards[0].languageTag = "ar_001";
  validation = validateRelationalCourse(rows, { assemble: false });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) => entry.code === "language_tag"));
});

test("alterar o idioma produz apenas um patch granular da linha do card", async () => {
  const previous = JSON.parse(await fs.readFile(fixtureUrl, "utf8"));
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].languageTag = "ar";

  const result = new ProjectDocumentDiffer().diff(previous, next);
  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].storeName, "cards");
  assert.deepEqual(result.mutations[0].changedFields, ["hasLanguageTag", "languageTag"]);
});

test("runtime aplica lang e dir sem perder a herança do card", async () => {
  const source = await projectWithTextMetadata();
  const card = source.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  const html = renderCardRuntimeArticle(card);
  assert.match(html, /<article[^>]+lang="ar" dir="rtl">/u);
  assert.match(html, /runtime-graph-block" lang="ar" dir="rtl"/u);
  assert.match(html, /runtime-graph-prompt" lang="ar" dir="rtl"/u);

  const runtime = resolveCardRuntime(card);
  const after = runtime.blocks.find((block) => block.kind === "after");
  const hebrewRuntimeBlock = after.blocks.find((block) => block.languageTag === "he");
  assert.deepEqual(
    [hebrewRuntimeBlock.languageTag, hebrewRuntimeBlock.textDirection],
    ["he", "rtl"]
  );
  const blockHtml = renderRuntimeBlockList([hebrewRuntimeBlock]);
  assert.match(blockHtml, /runtime-paragraph" lang="he" dir="rtl"/u);
});
