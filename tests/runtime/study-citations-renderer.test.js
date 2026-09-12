import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { formatCourseSourceReference } from "../../src/domain/courseSourceReference.js";
import { renderStudyCitations, studyCitationMarkers } from "../../src/study/studyCitations.js";

const content = { content: [{ id: "p", package: "aralearn.resource.paragraph", version: "1.0.0",
  data: { text: "Um quadro liga interfaces. Outro quadro transporta dados." } }] };
const occurrence = overrides => ({ occurrenceId: "cited", slot: "content", resourceId: "p", path: "text",
  quote: "quadro", prefix: "Outro ", suffix: " transporta", ...overrides });
const hash = "a".repeat(64);
function citation(overrides = {}) {
  return { linkId: "source-link", sourceId: "source", sourceRevision: 1, kind: "book",
    title: "Relações entre interfaces", authors: [{ family: "Souza", given: "Ana" }], publicationDate: "2024",
    language: "pt-BR", editionOrVersion: null, citationMode: "generated", citationText: null,
    bibliographic: { ...createEmptyCourseSourceBibliographicMetadata(), publisher: "Editora sintética" },
    url: "https://example.test/fonte", relation: "supported_by", roles: ["technical_conceptual"],
    occurrences: [], anchors: [], attachments: [{ contentHash: hash, byteSize: 1200, mediaType: "application/pdf" }],
    ...overrides };
}
const render = (source, formattedReferences = {}) => renderStudyCitations({ open: true,
  courseId: "10000000-0000-4000-8000-000000000001", value: { citations: [source] }, studyUnit: content,
  sourceOptions: { targetKind: "microsequence_explanation" }, formattedReferences });

test("referência acadêmica abre PDF sob demanda e vínculo geral não inventa trecho", async () => {
  const source = citation();
  const reference = await formatCourseSourceReference(source, { style: "abnt-2025" });
  const html = render(source, { "source-link": reference });
  assert.match(html, /<button type="button" class="study-citation-link"[^>]*data-action="download-citation-attachment"/u);
  assert.doesNotMatch(html, /href="#source-document"/u);
  assert.match(html, /data-citation-anchor-index="-1"/u);
  assert.match(html, /Souza|SOUZA/u);
  assert.match(html, /Relações entre interfaces/u);
  assert.match(html, /2024/u);
  assert.match(html, /Editora sintética/u);
  assert.match(html, /role="img" aria-label="Documento PDF"/u);
  assert.match(html, /Referência do conteúdo; sem trecho específico vinculado/u);
  assert.doesNotMatch(html, /data-action="return-citation"|<h3>Relações|Abrir PDF 1|>Trecho 1</u);
  assert.deepEqual(studyCitationMarkers(content, { citations: [source] }), []);
  assert.match(html, /href="https:\/\/example.test\/fonte"[^>]*aria-label="Endereço de Relações entre interfaces"/u);
  const pending = renderStudyCitations({ open: true, value: { citations: [source] }, downloadPending: true });
  assert.match(pending, /<button[^>]+data-action="download-citation-attachment"[^>]+ disabled aria-disabled="true"/u);
});

test("somente ocorrência resolvida oferece retorno acessível e sem texto redundante", () => {
  const source = citation({ citationMode: "manual", citationText: "Referência autoral preservada.",
    occurrences: [occurrence(), occurrence({ occurrenceId: "old", resourceId: "removed" })] });
  const html = render(source);
  assert.equal((html.match(/data-action="return-citation"/gu) || []).length, 1);
  assert.match(html, /data-citation-occurrence-id="cited"[^>]*aria-label="Voltar ao trecho 1 da referência 1 na explicação"/u);
  assert.doesNotMatch(html, />Trecho 1<|data-citation-occurrence-id="old"/u);
  assert.match(html, /O trecho citado não foi localizado nesta cópia/u);
  assert.match(html, /Referência autoral preservada\./u);
  const markers = studyCitationMarkers(content, { citations: [source] });
  assert.deepEqual(markers.map(marker => marker.occurrenceId), ["cited"]);
});

test("fonte cadastrada apenas por título conserva hiperlink legível sem inventar autores ou data", () => {
  const source = citation({ authors: [], publicationDate: null, bibliographic: createEmptyCourseSourceBibliographicMetadata(),
    citationMode: "manual", citationText: null });
  const html = render(source, { "source-link": { text: "", runs: [] } });
  assert.match(html, />Relações entre interfaces<\/button>/u);
  assert.doesNotMatch(html, /Souza|SOUZA|2024|Editora sintética|Preparando referência/u);
});

test("hiperlink mantém índices da âncora e do anexo correto, sem inventar destino para metadados ausentes", () => {
  const source = citation({ citationMode: "manual", citationText: "Texto literal <sem autor ou data presumidos>.",
    anchors: [{ anchorId: "unavailable", selector: { kind: "page_range", startPage: 8, endPage: 9 },
      humanLocator: "Seção anterior", contentHash: "b".repeat(64) },
    { anchorId: "quoted", selector: { kind: "text_quote", exact: "interfaces", prefix: null, suffix: null },
      humanLocator: "Definição", contentHash: hash }] });
  const html = render(source);
  assert.match(html, /data-citation-index="0" data-attachment-index="0"[^>]*data-citation-anchor-index="1"/u);
  assert.match(html, /Texto literal &lt;sem autor ou data presumidos&gt;\./u);
  assert.match(html, /Documento indisponível para abrir/u);
  assert.equal((html.match(/data-action="download-citation-attachment"/gu) || []).length, 1);
  const web = render(citation({ attachments: [], citationMode: "manual", citationText: "Referência web literal." }));
  assert.match(web, /<a class="study-citation-link" href="https:\/\/example.test\/fonte"/u);
  assert.doesNotMatch(web, /download-citation-attachment/u);
});
