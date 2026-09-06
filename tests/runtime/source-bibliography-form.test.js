import assert from "node:assert/strict";
import test from "node:test";
import { createSourceBibliographyDraft, captureSourceBibliographyDraft, sourceDocumentFromBibliographyDraft,
  renderSourceBibliographyForm, appendSourceContributor } from "../../src/ui/sourceBibliographyForm.js";
import { sourceOccurrenceFromSelection, renderSourceOccurrenceForm } from "../../src/ui/sourceOccurrenceForm.js";
import { renderBibliographicReference } from "../../src/ui/renderBibliographicReference.js";
import { normalizeCourseSourceDocument } from "../../src/domain/courseSources.js";

test("alternar modos e tipos preserva referência literal, nomes e metadados fora dos campos visíveis", () => {
  const draft = createSourceBibliographyDraft();
  draft.citationText = "  Referência com\n  recuo e <texto>.  ";
  draft.kind = "article";
  draft.bibliographic.doi = "10.1234/exemplo";
  draft.bibliographic.articleNumber = "e12345";
  appendSourceContributor(draft, "authors");
  Object.assign(draft.authors[0], { format: "person", family: "da Silva", given: "Maria" });
  const changed = captureSourceBibliographyDraft({ elements: { kind: { value: "book" }, citationMode: { value: "generated" } } }, draft);
  const source = normalizeCourseSourceDocument(sourceDocumentFromBibliographyDraft(changed));
  assert.equal(source.title, null);
  assert.equal(source.citationText, draft.citationText);
  assert.deepEqual(source.authors, [{ family: "da Silva", given: "Maria" }]);
  assert.equal(source.bibliographic.doi, draft.bibliographic.doi);
  assert.equal(source.bibliographic.articleNumber, "e12345");
  const html = renderSourceBibliographyForm({ sourceEditor: { draft: changed } });
  assert.match(html, /name="bibliographic_doi"/u);
  assert.doesNotMatch(html, /name="citationText"/u);
  changed.citationMode = "manual";
  const manual = renderSourceBibliographyForm({ sourceEditor: { draft: changed } });
  assert.match(manual, / {2}Referência com\n {2}recuo e &lt;texto&gt;\. {2}/u);
});

test("seleção de citação conserva o trecho literal e contexto suficiente sem alterar o conteúdo", () => {
  const target = { slot: "content", resourceId: "paragraph-1", path: "text", text: "Uma ideia. Uma ideia; outra conclusão." };
  const copy = structuredClone(target);
  const occurrence = sourceOccurrenceFromSelection(target, { selectionStart: 11, selectionEnd: 20 }, "occurrence-1");
  assert.deepEqual(occurrence, { occurrenceId: "occurrence-1", slot: "content", resourceId: "paragraph-1", path: "text",
    quote: "Uma ideia", prefix: "Uma ideia. ", suffix: "; outra conclusão." });
  assert.deepEqual(target, copy);
  assert.throws(() => sourceOccurrenceFromSelection(target, { selectionStart: 2, selectionEnd: 2 }), /Selecione/u);
  assert.throws(() => sourceOccurrenceFromSelection({ ...target, text: "x".repeat(4_001) },
    { selectionStart: 0, selectionEnd: 4_001 }), /4.000/u);
});

test("referência e ocorrência hostis são texto, com marcação restrita ao formato bibliográfico", () => {
  assert.equal(renderBibliographicReference({ text: "", runs: [{ text: '<img src=x onerror="alert(1)">', italic: true,
    bold: true, verticalAlign: "sup", html: "<script>" }] }),
  '<sup><strong><em>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</em></strong></sup>');
  const markup = renderSourceOccurrenceForm({ targetKind: "study_unit", targetStudyUnit: null }, { linkId: "link-a", occurrences: [{
    occurrenceId: "occ-a", quote: "<script>alert(1)</script>" }] });
  assert.match(markup, /Trecho a conferir/u);
  assert.doesNotMatch(markup, /<script>/u);
});
