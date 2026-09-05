import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyCourseSourceBibliographicMetadata,
  normalizeCourseSourceDocument,
  normalizeCourseSourceLinks
} from "../../src/domain/courseSources.js";
import { courseSourceToCslItem, formatCourseSourceReference } from "../../src/domain/courseSourceReference.js";

function source(overrides = {}) {
  return { sourceId: "bibliographic-source", ...normalizeCourseSourceDocument({
    kind: "article", title: "Dados de um ensaio sintético", authors: [{ literal: "Equipe de teste" }],
    defaultRoles: ["technical_conceptual"], publicationDate: "2026-09", language: "pt-BR",
    identifier: "Identificador humano não interpretado", citationMode: "generated",
    citationText: "  Referência MANUAL original.\n", url: null, editionOrVersion: null,
    bibliographic: { ...createEmptyCourseSourceBibliographicMetadata(), containerTitle: "Periódico sintético", articleNumber: "e12345" },
    origin: "author_provided", availability: "unknown", verificationStatus: "unverified", studyVisibility: "citation",
    ...overrides
  }) };
}

test("referência manual mantém cada caractere ao alternar estilos", async () => {
  const value = source({ citationMode: "manual" });
  for (const style of ["apa7", "abnt-2025"]) {
    const formatted = await formatCourseSourceReference(value, { style });
    assert.equal(formatted.text, value.citationText);
    assert.deepEqual(formatted.runs, [{ text: value.citationText }]);
  }
});

test("projeção CSL conserva precisão e nomes literais, sem interpretar identificador humano", () => {
  const item = courseSourceToCslItem(source());
  assert.deepEqual(item.author, [{ literal: "Equipe de teste" }]);
  assert.deepEqual(item.issued, { "date-parts": [[2026, 9]] });
  assert.equal(item.number, "e12345");
  assert.equal(item.page, undefined);
  assert.equal(item.DOI, undefined);
  assert.equal(item.accessed, undefined);
  assert.equal(item["article-number"], undefined);
});

test("geração ABNT e APA mantém e-location e não altera o texto manual guardado", async () => {
  const value = source();
  const before = structuredClone(value);
  for (const style of ["apa7", "abnt-2025"]) {
    const formatted = await formatCourseSourceReference(value, { style });
    assert.match(formatted.text, /e12345/u);
    assert.equal(formatted.mode, "generated");
    assert.ok(formatted.runs.every((run) => typeof run.text === "string" && !Object.hasOwn(run, "html")));
  }
  assert.deepEqual(value, before);
});

test("obra sem metadados identificadores não ganha referência nem título inventados", async () => {
  const value = source({ title: null, authors: [], publicationDate: null, identifier: null,
    bibliographic: createEmptyCourseSourceBibliographicMetadata() });
  const item = courseSourceToCslItem(value);
  assert.equal(item.title, undefined);
  assert.equal(item.author, undefined);
  assert.equal(item.issued, undefined);
  const formatted = await formatCourseSourceReference(value, { style: "apa7" });
  assert.equal(formatted.text, "");
  assert.deepEqual(formatted.runs, []);
  assert.ok(formatted.missingFields.includes("title"));
  const identifierOnly = { ...value, identifier: "Arquivo interno A" };
  assert.equal((await formatCourseSourceReference(identifierOnly, { style: "apa7" })).text, "");
  assert.equal(identifierOnly.identifier, "Arquivo interno A");
});

test("mesma fonte admite vínculos distintos e múltiplos papéis sem herança silenciosa", () => {
  const link = { linkId: "context-a", sourceId: "bibliographic-source", relation: "informed_by",
    roles: ["curricular_scope", "recommended_reading"], anchors: [], occurrences: [] };
  const links = [link, { ...link, linkId: "context-b", roles: ["technical_conceptual"] }];
  assert.deepEqual(normalizeCourseSourceLinks(links), links);
  assert.throws(() => normalizeCourseSourceLinks([{ ...link, roles: undefined }]));
  assert.throws(() => normalizeCourseSourceLinks([{ ...link, roles: ["supported_by"] }]));
});
