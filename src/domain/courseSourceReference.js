import { COURSE_BIBLIOGRAPHY_STYLES, COURSE_SOURCE_KINDS } from "./courseSources.js";

const CSL_TYPES = Object.freeze({
  web_page: "webpage", article: "article-journal", book: "book", chapter: "chapter",
  slides: "speech", notice: "report", standard: "standard", internal_document: "manuscript",
  document: "document", media: "motion_picture", other: "document"
});
const CSL_FIELDS = Object.freeze({
  containerTitle: "container-title", publisher: "publisher", publisherPlace: "publisher-place",
  volume: "volume", issue: "issue", pages: "page",
  doi: "DOI", isbn: "ISBN", issn: "ISSN", genre: "genre", number: "number"
});

function suppliedDate(value) {
  return value === null ? null : { "date-parts": [value.split("-").map(Number)] };
}

function suppliedNames(names) {
  return names.map((name) => Object.hasOwn(name, "literal")
    ? { literal: name.literal }
    : { family: name.family, ...(name.given === null ? {} : { given: name.given }) });
}

/** Project already normalized canonical source metadata; never infer names or dates. */
export function courseSourceToCslItem(source) {
  if (!source || !COURSE_SOURCE_KINDS.includes(source.kind) ||
      !Array.isArray(source.authors) || !source.bibliographic) {
    throw new TypeError("A fonte bibliográfica precisa estar normalizada.");
  }
  const item = { id: source.sourceId, type: CSL_TYPES[source.kind] };
  for (const [field, cslField] of Object.entries({ title: "title", url: "URL", language: "language", editionOrVersion: "edition" })) {
    if (source[field] !== null) item[cslField] = source[field];
  }
  if (source.authors.length) item.author = suppliedNames(source.authors);
  if (source.bibliographic.editors.length) item.editor = suppliedNames(source.bibliographic.editors);
  const issued = suppliedDate(source.publicationDate);
  const accessed = suppliedDate(source.bibliographic.accessedDate);
  if (issued) item.issued = issued;
  if (accessed) item.accessed = accessed;
  for (const [field, cslField] of Object.entries(CSL_FIELDS)) {
    const value = source.bibliographic[field];
    if (value !== null) item[cslField] = value;
  }
  if (source.kind === "article" && source.bibliographic.articleNumber !== null) {
    if (source.bibliographic.number !== null && source.bibliographic.number !== source.bibliographic.articleNumber) {
      throw new TypeError("O artigo possui identificadores de localização conflitantes.");
    }
    item.number = source.bibliographic.articleNumber;
  }
  // identifier is intentionally free text, not an inferred DOI, ISBN or date.
  return item;
}

export async function formatCourseSourceReference(source, { style } = {}) {
  if (!COURSE_BIBLIOGRAPHY_STYLES.includes(style) ||
      !["manual", "generated"].includes(source?.citationMode)) {
    throw new TypeError("Modo ou estilo bibliográfico inválido.");
  }
  if (source.citationMode === "manual") {
    if (source.citationText !== null && typeof source.citationText !== "string") {
      throw new TypeError("A referência manual precisa ser texto.");
    }
    const text = source.citationText ?? "";
    return { text, runs: text ? [{ text }] : [], mode: "manual", missingFields: text ? [] : ["citationText"] };
  }
  const missingFields = [
    ...(source.title === null ? ["title"] : []),
    ...(source.authors.length === 0 ? ["authors"] : []),
    ...(source.publicationDate === null ? ["publicationDate"] : []),
    ...(["article", "chapter"].includes(source.kind) && source.bibliographic.containerTitle === null ? ["containerTitle"] : [])
  ];
  const hasIdentifyingMetadata = source.title !== null || source.authors.length > 0 ||
    source.url !== null ||
    source.bibliographic.editors.length > 0 ||
    ["containerTitle", "publisher", "doi", "isbn", "issn", "number", "articleNumber"]
      .some((field) => source.bibliographic[field] !== null);
  if (!hasIdentifyingMetadata) {
    return { text: "", runs: [], mode: "generated", missingFields };
  }
  const item = courseSourceToCslItem(source);
  const { renderCslReference } = await import("../bibliography/renderCslReference.js");
  const formatted = await renderCslReference(item, { style });
  return { ...formatted, mode: "generated", missingFields };
}
