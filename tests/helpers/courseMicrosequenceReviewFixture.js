import { courseAuthoringAnalyticsFixture, ANALYTICS_COURSE_ID } from "./courseAuthoringAnalyticsFixture.js";
import { assembleCourseAuthoringExport } from "../../src/domain/courseAuthoringComparison.js";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";

export const REVIEW_COURSE_ID = ANALYTICS_COURSE_ID;
export const REVIEW_MS_ID = "micro-review";
export function microsequenceReviewExport({ revision = 7, explanationText = "Um socket é a interface local usada pelo processo.", withUnits = true, withPdf = false } = {}) {
  const guide = { goal: "Distinguir mecanismo e participantes.", include: [], exclude: [], notation: [], avoid: [] };
  const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
  const units = (withUnits ? [{ id: "unit-theory", title: "Interface local", role: "theory" },
    { id: "unit-practice", title: "Distinguir interface e relação", role: "practice" }] : []).map((value, index) => ({
    ...value, position: index + 1, content: [paragraph(`unit-text-${index}`, "O processo usa uma interface; a conexão relaciona participantes.")],
    response: value.role === "practice" ? { id: "practice-response", package: "aralearn.response.open", version: "1.0.0",
      data: { prompt: "Explique a diferença com suas palavras." } } : null, feedback: [], topics: [] }));
  const analytics = courseAuthoringAnalyticsFixture({ revision, title: "Curso sintético", studyUnits: units.map(unit => ({ studyUnitRef: unit.id, title: unit.title })) });
  analytics.basis.sources = [{ sourceRef: "source-review", revision: 1, document: {
    kind: "book", defaultRoles: ["technical_conceptual"], title: "Obra sintética sobre interfaces", authors: [{ literal: "Autoria sintética" }],
    publicationDate: "2026", identifier: null, language: "pt-BR", citationMode: "generated", citationText: null,
    bibliographic: createEmptyCourseSourceBibliographicMetadata(), url: "https://example.test/reference", editionOrVersion: null,
    origin: "author_provided", availability: "open_access", verificationStatus: "unverified", studyVisibility: "hidden"
  }, attachments: withPdf ? [{ contentHash: "a".repeat(64), byteSize: 128, mediaType: "application/pdf" }] : [], anchors: [{ anchorRef: "anchor-review", contentHash: withPdf ? "a".repeat(64) : null,
    selector: { kind: "page_range", startPage: 12, endPage: 13 }, humanLocator: "Capítulo 2, páginas 12–13" }] }];
  const sourceLink = (resourceId, quote) => ({ linkId: `link-${resourceId}`, sourceId: "source-review", relation: "supported_by",
    roles: ["technical_conceptual"], anchors: [{ anchorId: "anchor-review" }], occurrences: [{ occurrenceId: `occurrence-${resourceId}`,
      slot: "content", resourceId, path: "text", quote, prefix: null, suffix: null }] });
  analytics.basis.studyUnits.forEach((unit, index) => { unit.sourceLinks = [sourceLink(`unit-text-${index}`, "O processo usa uma interface")]; });
  if (units[1]) units[1].feedback = [paragraph("feedback-text", "Observe qual elemento é local ao processo e qual relaciona os participantes.")];
  const selected = { kind: "didactic_microsequence", ref: REVIEW_MS_ID, label: "Interfaces" };
  analytics.scope = { selected, options: [analytics.scope.selected, selected] };
  const microsequence = { id: REVIEW_MS_ID, title: "Interfaces", goal: "Distinguir interface e conexão.", role: "explain",
    dependsOn: [], covers: [], checks: [], errors: [], studyUnits: units,
    explanation: { title: "Processo, socket e conexão", content: [paragraph("support-text", explanationText)] } };
  const document = { contract: "aralearn.course.v1", courses: [{ id: REVIEW_COURSE_ID, title: "Curso sintético", goal: "Objetivo sintético",
    modules: [{ id: "module-review", title: "Módulo", guide, lessons: [{ id: "lesson-review", title: "Lição", guide, topics: [], microsequences: [microsequence] }] }] }] };
  const sources = [{ contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025", courseId: REVIEW_COURSE_ID,
    courseRevision: revision, mode: "target", query: { sourceId: null, targetKind: "microsequence_explanation", targetId: REVIEW_MS_ID },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, nextCursor: null,
    items: [{ targetKind: "microsequence_explanation", targetId: REVIEW_MS_ID, targetVersion: 2,
      sourceLinks: [sourceLink("support-text", explanationText)], createdAt: "2026-09-07T00:00:00Z" }] }];
  return assembleCourseAuthoringExport({ analytics, document, explanationSources: sources });
}
