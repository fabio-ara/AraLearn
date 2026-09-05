import { normalizeCourseSourceOccurrence, COURSE_SOURCE_MAX_OCCURRENCES } from "./courseSourceOccurrences.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const HTTPS_PATTERN = /^https:\/\/[^\s]+$/u;
const CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const COURSE_SOURCE_PDF_PATH_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([a-f0-9]{64})\.pdf$/u;
const PARTIAL_ISO_DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u;
const BCP47_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*$/u;
const encoder = new TextEncoder();

export const COURSE_SOURCES_CONTRACT = "aralearn.course-sources.v3";
export const COURSE_SOURCE_CHANGE_CONTRACT = "aralearn.course-source-change.v1";
export const COURSE_STUDY_CITATIONS_CONTRACT = "aralearn.course-study-citations.v2";
export const COURSE_SOURCE_PDF_DOWNLOAD_CONTRACT =
  "aralearn.course-source-pdf-download.v2";
export const COURSE_SOURCE_PDF_INGESTION_PREPARATION_CONTRACT =
  "aralearn.course-source-pdf-ingestion-preparation.v1";
export const COURSE_SOURCE_PDF_INGESTION_CONTRACT =
  "aralearn.course-source-pdf-ingestion.v1";
export const COURSE_SOURCE_PDF_MEDIA_TYPE = "application/pdf";
export const COURSE_SOURCE_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const COURSE_SOURCE_PDF_COURSE_MAX_UNIQUE_BYTES = 64 * 1024 * 1024;

export const COURSE_SOURCE_KINDS = Object.freeze([
  "web_page", "article", "book", "chapter", "slides", "notice", "standard",
  "internal_document", "document", "media", "other"
]);
export const COURSE_SOURCE_ROLES = Object.freeze([
  "curricular_scope", "assessment_evidence", "technical_conceptual", "recommended_reading"
]);
export const COURSE_BIBLIOGRAPHY_STYLES = Object.freeze(["apa7", "abnt-2025"]);
export const COURSE_SOURCE_BIBLIOGRAPHIC_FIELDS = Object.freeze([
  "editors", "containerTitle", "publisher", "publisherPlace", "volume", "issue",
  "pages", "articleNumber", "doi", "isbn", "issn", "accessedDate", "genre", "number"
]);

export function createEmptyCourseSourceBibliographicMetadata() {
  return Object.fromEntries(COURSE_SOURCE_BIBLIOGRAPHIC_FIELDS
    .map((field) => [field, field === "editors" ? [] : null]));
}
export const COURSE_SOURCE_STATUSES = Object.freeze([
  "active", "retired"
]);
export const COURSE_SOURCE_STUDY_VISIBILITIES = Object.freeze([
  "hidden", "citation", "citation_and_link"
]);
export const COURSE_SOURCE_ORIGINS = Object.freeze([
  "external", "author_provided", "imported"
]);
export const COURSE_SOURCE_AVAILABILITIES = Object.freeze([
  "open_access", "restricted", "private", "unknown"
]);
export const COURSE_SOURCE_VERIFICATION_STATUSES = Object.freeze([
  "unverified", "author_verified"
]);
export const COURSE_SOURCE_SELECTOR_KINDS = Object.freeze([
  "page_range", "time_range", "uri_fragment", "text_quote"
]);
export const COURSE_SOURCE_RELATIONS = Object.freeze([
  "informed_by", "supported_by", "adapted_from", "quoted_from",
  "contrasted_with", "exemplified_by", "inspired_by", "needs_verification"
]);
export const COURSE_SOURCE_COMMAND_TYPES = Object.freeze([
  "save_source", "retire_source", "save_anchor", "retire_anchor",
  "remove_pdf", "set_target_sources", "set_bibliography_style"
]);
const COURSE_SOURCE_CHANGE_TYPES = Object.freeze([
  ...COURSE_SOURCE_COMMAND_TYPES,
  "ingest_pdf"
]);

export class CourseSourcesError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CourseSourcesError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CourseSourcesError(code, message, details);
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    fail("invalid_course_sources_json", "Fontes e proveniência precisam conter somente dados clonáveis.");
  }
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, fields, code, label) {
  if (!isObject(value)) fail(code, `${label} precisa ser um objeto.`);
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail(code, `${label} contém o campo desconhecido ${unknown}.`, { field: unknown });
  const missing = fields.find((field) => !Object.hasOwn(value, field));
  if (missing) fail(code, `${label} não contém ${missing}.`, { field: missing });
}

function hasControl(value, allowLayoutWhitespace = true) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    if (point >= 127 && point <= 159) return true;
    if (point >= 32) return false;
    return !allowLayoutWhitespace || ![9, 10, 13].includes(point);
  });
}

function text(
  value,
  maximum,
  code,
  label,
  { nullable = false, trim = false, preserveWhitespace = false, allowLayoutWhitespace = true } = {}
) {
  if (nullable && value === null) return null;
  if (typeof value !== "string") fail(code, `${label} precisa ser texto.`);
  const normalized = trim ? value.trim() : value;
  if (!normalized || normalized.length > maximum * 2 ||
      [...normalized].length > maximum ||
      hasControl(normalized, allowLayoutWhitespace) ||
      !trim && !preserveWhitespace && normalized !== normalized.trim()) {
    fail(code, `${label} é inválido.`);
  }
  return normalized;
}

function optionalText(value, maximum, code, label, options = {}) {
  if (value === null) return null;
  return text(value, maximum, code, label, options);
}

function uuid(value, code, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(code, `${label} precisa ser um UUID canônico.`);
  }
  return value;
}

function courseSourceRequestId(value, code, label) {
  if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
    fail(code, `${label} é inválido.`);
  }
  return value;
}

function integer(value, minimum, maximum, code, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, `${label} precisa ser um inteiro entre ${minimum} e ${maximum}.`);
  }
  return value;
}

function timestamp(value, code, label) {
  if (typeof value !== "string" || !value || Number.isNaN(Date.parse(value))) {
    fail(code, `${label} precisa ser um instante serializado.`);
  }
  return value;
}

function partialIsoDate(value, code = "invalid_course_source") {
  if (value === null) return null;
  if (typeof value !== "string" || value !== value.trim()) {
    fail(code, "A data de publicação precisa usar AAAA, AAAA-MM ou AAAA-MM-DD.");
  }
  const match = PARTIAL_ISO_DATE_PATTERN.exec(value);
  if (!match || match[1] === "0000") {
    fail(code, "A data de publicação precisa usar AAAA, AAAA-MM ou AAAA-MM-DD.");
  }
  if (match[2] !== undefined) {
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      fail(code, "A data de publicação possui mês inválido.");
    }
  }
  if (match[3] !== undefined) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const candidate = new Date(0);
    candidate.setUTCHours(0, 0, 0, 0);
    candidate.setUTCFullYear(year, month - 1, day);
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 ||
        candidate.getUTCDate() !== day) {
      fail(code, "A data de publicação possui dia inválido.");
    }
  }
  return value;
}

function languageTag(value, code = "invalid_course_source") {
  if (value === null) return null;
  if (typeof value !== "string" || value !== value.trim() || value.length > 35 ||
      !BCP47_PATTERN.test(value)) {
    fail(code, "O idioma da Fonte precisa ser uma etiqueta BCP 47 simples, como pt-BR.");
  }
  return value;
}

function sourceMetadataEnums(value, code = "invalid_course_source") {
  if (!COURSE_SOURCE_ORIGINS.includes(value.origin) ||
      !COURSE_SOURCE_AVAILABILITIES.includes(value.availability) ||
      !COURSE_SOURCE_VERIFICATION_STATUSES.includes(value.verificationStatus)) {
    fail(code, "A origem, a disponibilidade ou a verificação da Fonte é inválida.");
  }
}

function normalizePdfStorage(value) {
  exact(
    value,
    ["uniqueBytes", "maxUniqueBytes"],
    "invalid_course_sources_read",
    "O uso de PDFs do Curso"
  );
  const uniqueBytes = integer(
    value.uniqueBytes,
    0,
    COURSE_SOURCE_PDF_COURSE_MAX_UNIQUE_BYTES,
    "invalid_course_sources_read",
    "O uso de PDFs do Curso"
  );
  if (value.maxUniqueBytes !== COURSE_SOURCE_PDF_COURSE_MAX_UNIQUE_BYTES) {
    fail("invalid_course_sources_read", "A cota de PDFs do Curso diverge do contrato.");
  }
  return { uniqueBytes, maxUniqueBytes: value.maxUniqueBytes };
}

function byteBound(value, maximum, code, label) {
  if (encoder.encode(JSON.stringify(value)).byteLength > maximum) {
    fail(code, `${label} excede ${maximum} bytes.`);
  }
}

function sourceId(value) {
  if (typeof value !== "string" || value.length < 1 || [...value].length > 240 ||
      encoder.encode(value).byteLength > 960 || value !== value.trim() ||
      hasControl(value, false)) {
    fail("invalid_course_source_id", "A identidade da Fonte é inválida.");
  }
  return value;
}

function opaqueId(value, maximum, code, label) {
  return text(value, maximum, code, label, { allowLayoutWhitespace: false });
}

function anchorId(value) {
  return opaqueId(value, 240, "invalid_course_source_anchor_id", "A identidade da Âncora");
}

function contentHash(value, code = "invalid_course_source_attachment") {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(code, "O hash SHA-256 do anexo é inválido.");
  }
  return value;
}

function pdfStoragePath(value, expectedHash = null, code = "invalid_course_source_attachment") {
  if (typeof value !== "string" || value !== value.trim()) {
    fail(code, "O caminho do anexo é inválido.");
  }
  const match = COURSE_SOURCE_PDF_PATH_PATTERN.exec(value);
  if (!match || expectedHash !== null && match[2] !== expectedHash) {
    fail(code, "O caminho do anexo não corresponde ao hash SHA-256.");
  }
  return value;
}

export function normalizeCourseSourceAttachment(value, { persisted = false, policy = persisted } = {}) {
  const attachment = clone(value);
  const fields = ["contentHash", "byteSize", "mediaType", "storagePath"];
  if (persisted) fields.push("createdAt");
  if (policy) fields.push("publicFileAccess");
  exact(attachment, fields, "invalid_course_source_attachment", "O anexo PDF");
  const hash = contentHash(attachment.contentHash);
  const normalized = {
    contentHash: hash,
    byteSize: integer(
      attachment.byteSize,
      1,
      COURSE_SOURCE_PDF_MAX_BYTES,
      "invalid_course_source_attachment",
      "O tamanho do anexo"
    ),
    mediaType: attachment.mediaType,
    storagePath: pdfStoragePath(attachment.storagePath, hash)
  };
  if (normalized.mediaType !== COURSE_SOURCE_PDF_MEDIA_TYPE) {
    fail("invalid_course_source_attachment", "O anexo precisa ser um PDF.");
  }
  if (policy) {
    if (!["inherit", "restricted", "available"].includes(attachment.publicFileAccess)) {
      fail("invalid_course_source_attachment", "A política do PDF é inválida.");
    }
    normalized.publicFileAccess = attachment.publicFileAccess;
  }
  if (persisted) {
    normalized.createdAt = timestamp(
      attachment.createdAt,
      "invalid_course_source_attachment",
      "A criação do anexo"
    );
  }
  return normalized;
}

function signedStorageUrl(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > 8_192 || hasControl(value, false)) {
    fail("invalid_course_source_pdf_download", "A URL assinada do PDF é inválida.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("invalid_course_source_pdf_download", "A URL assinada do PDF é inválida.");
  }
  const localHttp = parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost", "10.0.2.2"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp || !parsed.searchParams.has("token")) {
    fail("invalid_course_source_pdf_download", "A URL assinada do PDF é inválida.");
  }
  return value;
}

export function normalizeCoursePublicPdfAttachment(value) {
  exact(value, ["contentHash", "byteSize", "mediaType"], "invalid_course_source_attachment", "O PDF autorizado");
  contentHash(value.contentHash);
  integer(value.byteSize, 1, COURSE_SOURCE_PDF_MAX_BYTES, "invalid_course_source_attachment", "O tamanho do PDF");
  if (value.mediaType !== COURSE_SOURCE_PDF_MEDIA_TYPE) {
    fail("invalid_course_source_attachment", "O anexo precisa ser um PDF.");
  }
  return clone(value);
}

export function normalizeCourseSourcePdfDownload(value) {
  const download = clone(value);
  exact(download, [
    "contract", "courseId", "courseRevision", "sourceId", "sourceRevision",
    "attachment", "signedUrl", "expiresAt"
  ], "invalid_course_source_pdf_download", "O download do PDF");
  if (download.contract !== COURSE_SOURCE_PDF_DOWNLOAD_CONTRACT) {
    fail("invalid_course_source_pdf_download", "O contrato de download do PDF é inválido.");
  }
  const courseId = uuid(
    download.courseId,
    "invalid_course_source_pdf_download",
    "A identidade do Curso"
  );
  const attachment = normalizeCoursePublicPdfAttachment(download.attachment);
  return {
    contract: download.contract,
    courseId,
    courseRevision: integer(
      download.courseRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_pdf_download",
      "A revisão do Curso"
    ),
    sourceId: sourceId(download.sourceId),
    sourceRevision: integer(
      download.sourceRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_pdf_download",
      "A revisão da Fonte"
    ),
    attachment,
    signedUrl: signedStorageUrl(download.signedUrl),
    expiresAt: timestamp(
      download.expiresAt,
      "invalid_course_source_pdf_download",
      "A expiração do download"
    )
  };
}

export function normalizeCourseSourceSelector(value) {
  const selector = clone(value);
  if (!isObject(selector) || !COURSE_SOURCE_SELECTOR_KINDS.includes(selector.kind)) {
    fail("invalid_course_source_selector", "O seletor da Âncora é inválido.");
  }
  if (selector.kind === "page_range") {
    exact(selector, ["kind", "startPage", "endPage"], "invalid_course_source_selector", "O seletor page_range");
    const startPage = integer(selector.startPage, 1, 1000000, "invalid_course_source_selector", "A página inicial");
    const endPage = integer(selector.endPage, startPage, 1000000, "invalid_course_source_selector", "A página final");
    return { kind: selector.kind, startPage, endPage };
  }
  if (selector.kind === "time_range") {
    exact(selector, ["kind", "startMilliseconds", "endMilliseconds"], "invalid_course_source_selector", "O seletor time_range");
    const startMilliseconds = integer(selector.startMilliseconds, 0, 2147483647, "invalid_course_source_selector", "O início temporal");
    const endMilliseconds = integer(selector.endMilliseconds, startMilliseconds + 1, 2147483647, "invalid_course_source_selector", "O fim temporal");
    return { kind: selector.kind, startMilliseconds, endMilliseconds };
  }
  if (selector.kind === "uri_fragment") {
    exact(selector, ["kind", "fragment"], "invalid_course_source_selector", "O seletor uri_fragment");
    const fragment = text(selector.fragment, 2048, "invalid_course_source_selector", "O fragmento URI", {
      allowLayoutWhitespace: false
    });
    if (fragment.startsWith("#")) fail("invalid_course_source_selector", "O fragmento URI não inclui #.");
    return { kind: selector.kind, fragment };
  }
  exact(selector, ["kind", "exact", "prefix", "suffix"], "invalid_course_source_selector", "O seletor text_quote");
  const normalized = {
    kind: selector.kind,
    exact: text(selector.exact, 4000, "invalid_course_source_selector", "O trecho exato", {
      preserveWhitespace: true
    }),
    prefix: optionalText(selector.prefix, 500, "invalid_course_source_selector", "O prefixo do trecho"),
    suffix: optionalText(selector.suffix, 500, "invalid_course_source_selector", "O sufixo do trecho")
  };
  return normalized;
}

export function normalizeCourseSourceLinks(value) {
  const maximumLinks = 32;
  if (!Array.isArray(value) || value.length > maximumLinks) {
    fail("invalid_course_source_links", `Os vínculos de Fonte precisam formar uma lista de até ${maximumLinks} itens.`);
  }
  const seenLinks = new Set();
  const links = value.map((candidate) => {
    exact(candidate, ["linkId", "sourceId", "relation", "roles", "anchors", "occurrences"], "invalid_course_source_link", "O vínculo de Fonte");
    const linkId = opaqueId(candidate.linkId, 240, "invalid_course_source_link", "A identidade do vínculo");
    const normalizedSourceId = sourceId(candidate.sourceId);
    if (seenLinks.has(linkId)) {
      fail("duplicate_course_source_link", "Uma atribuição não pode repetir a identidade do vínculo.");
    }
    seenLinks.add(linkId);
    if (!COURSE_SOURCE_RELATIONS.includes(candidate.relation)) {
      fail("invalid_course_source_link", "A relação de proveniência é inválida.");
    }
    if (!Array.isArray(candidate.anchors) || candidate.anchors.length > 8) {
      fail("invalid_course_source_link", "As Âncoras da Fonte precisam formar uma lista de até 8 itens.");
    }
    const seenAnchors = new Set();
    const anchors = candidate.anchors.map((anchor) => {
      exact(anchor, ["anchorId"], "invalid_course_source_link", "A Âncora atribuída");
      const normalizedAnchorId = anchorId(anchor.anchorId);
      if (seenAnchors.has(normalizedAnchorId)) {
        fail("duplicate_course_source_anchor_link", "Uma atribuição não pode repetir a mesma Âncora.");
      }
      seenAnchors.add(normalizedAnchorId);
      return { anchorId: normalizedAnchorId };
    });
    if (candidate.relation === "quoted_from" && anchors.length === 0) {
      fail("invalid_course_source_link", "quoted_from exige ao menos uma Âncora.");
    }
    const occurrences = candidate.occurrences;
    if (!Array.isArray(occurrences) || occurrences.length > COURSE_SOURCE_MAX_OCCURRENCES) {
      fail("invalid_course_source_link", "As ocorrências do vínculo são inválidas.");
    }
    const occurrenceIds = new Set();
    const normalizedOccurrences = occurrences.map((occurrence) => {
      let normalized;
      try { normalized = normalizeCourseSourceOccurrence(occurrence); }
      catch (error) {
        if (error?.code !== "invalid_course_source_occurrence") throw error;
        fail(error.code, error.message);
      }
      if (occurrenceIds.has(normalized.occurrenceId)) {
        fail("duplicate_course_source_occurrence", "O vínculo repete uma ocorrência.");
      }
      occurrenceIds.add(normalized.occurrenceId);
      return normalized;
    });
    return {
      linkId,
      sourceId: normalizedSourceId,
      relation: candidate.relation,
      roles: normalizeCourseSourceRoles(candidate.roles),
      anchors,
      occurrences: normalizedOccurrences
    };
  });
  byteBound(links, 131072, "course_source_links_too_large", "Os vínculos de Fonte");
  return links;
}

const NEW_PDF_SOURCE_DEFAULTS = Object.freeze({
  kind: "document",
  defaultRoles: [],
  authors: [],
  publicationDate: null,
  identifier: null,
  language: null,
  citationText: null,
  citationMode: "manual",
  bibliographic: createEmptyCourseSourceBibliographicMetadata(),
  url: null,
  editionOrVersion: null,
  origin: "author_provided",
  availability: "unknown",
  verificationStatus: "unverified",
  studyVisibility: "hidden"
});

function normalizeCourseSourceRoles(value) {
  if (!Array.isArray(value) || value.length > COURSE_SOURCE_ROLES.length ||
      new Set(value).size !== value.length ||
      value.some((role) => !COURSE_SOURCE_ROLES.includes(role))) {
    fail("invalid_course_source", "Os papéis de uso da fonte são inválidos.");
  }
  return [...value];
}

function normalizeBibliographicNames(value) {
  if (!Array.isArray(value) || value.length > 32) {
    fail("invalid_course_source", "Os nomes bibliográficos precisam formar uma lista de até 32 itens.");
  }
  return value.map((name) => {
    const literal = isObject(name) && Object.hasOwn(name, "literal");
    exact(name, literal ? ["literal"] : ["family", "given"], "invalid_course_source", "O nome bibliográfico");
    if (literal) return { literal: text(name.literal, 500, "invalid_course_source", "O nome literal", { allowLayoutWhitespace: false }) };
    return {
      family: text(name.family, 240, "invalid_course_source", "O sobrenome informado", { allowLayoutWhitespace: false }),
      given: optionalText(name.given, 240, "invalid_course_source", "O prenome informado", { allowLayoutWhitespace: false })
    };
  });
}

function normalizeBibliographicMetadata(value) {
  exact(value, COURSE_SOURCE_BIBLIOGRAPHIC_FIELDS, "invalid_course_source", "Os metadados bibliográficos");
  return Object.fromEntries(COURSE_SOURCE_BIBLIOGRAPHIC_FIELDS.map((field) => [field,
    field === "editors" ? normalizeBibliographicNames(value[field]) :
      field === "accessedDate" ? partialIsoDate(value[field]) :
        optionalText(value[field], ["containerTitle", "publisher"].includes(field) ? 500 : 240,
          "invalid_course_source", `O campo bibliográfico ${field}`, { allowLayoutWhitespace: false })
  ]));
}

export function normalizeCourseSourceDocument(value) {
  exact(value, [
    "kind", "defaultRoles", "title", "authors", "publicationDate", "identifier", "language",
    "citationMode", "citationText", "bibliographic", "url", "editionOrVersion", "origin", "availability",
    "verificationStatus", "studyVisibility"
  ], "invalid_course_source", "A revisão da Fonte");
  if (!COURSE_SOURCE_KINDS.includes(value.kind) ||
      !["manual", "generated"].includes(value.citationMode) ||
      !COURSE_SOURCE_STUDY_VISIBILITIES.includes(value.studyVisibility)) {
    fail("invalid_course_source", "O tipo, o papel ou a visibilidade da Fonte é inválido.");
  }
  sourceMetadataEnums(value);
  const url = optionalText(value.url, 2048, "invalid_course_source", "A URL HTTPS da Fonte");
  if (url !== null && !HTTPS_PATTERN.test(url)) {
    fail("invalid_course_source", "A URL da Fonte precisa usar HTTPS.");
  }
  const normalized = {
    kind: value.kind,
    defaultRoles: normalizeCourseSourceRoles(value.defaultRoles),
    title: optionalText(value.title, 300, "invalid_course_source", "O título da Fonte", {
      allowLayoutWhitespace: false
    }),
    authors: normalizeBibliographicNames(value.authors),
    publicationDate: partialIsoDate(value.publicationDate),
    identifier: optionalText(value.identifier, 240, "invalid_course_source", "O identificador", {
      allowLayoutWhitespace: false
    }),
    language: languageTag(value.language),
    citationMode: value.citationMode,
    citationText: optionalText(value.citationText, 2048, "invalid_course_source", "O texto de citação", { preserveWhitespace: true }),
    bibliographic: normalizeBibliographicMetadata(value.bibliographic),
    url,
    editionOrVersion: optionalText(value.editionOrVersion, 120, "invalid_course_source", "A edição ou versão", {
      allowLayoutWhitespace: false
    }),
    origin: value.origin,
    availability: value.availability,
    verificationStatus: value.verificationStatus,
    studyVisibility: value.studyVisibility
  };
  if (normalized.studyVisibility !== "hidden" && normalized.citationMode === "manual" && normalized.citationText === null) {
    fail("invalid_course_source", "Uma Fonte visível no Estudo exige texto de citação.");
  }
  return normalized;
}

function normalizePdfSourceDocument(value, expectedSourceRevision) {
  const candidate = expectedSourceRevision === 0 && isObject(value)
    ? { ...NEW_PDF_SOURCE_DEFAULTS, ...value }
    : value;
  return normalizeCourseSourceDocument(candidate);
}

export function normalizeCourseSourcePdfSourceIntent(value) {
  const intent = clone(value);
  if (!isObject(intent) || !["existing", "save"].includes(intent.mode)) {
    fail(
      "invalid_course_source_pdf_ingestion",
      "A intenção da ingestão de PDF é inválida."
    );
  }
  if (intent.mode === "existing") {
    exact(
      intent,
      ["mode", "sourceId", "sourceRevision"],
      "invalid_course_source_pdf_ingestion",
      "A intenção de anexar a uma Fonte existente"
    );
    return {
      mode: intent.mode,
      sourceId: sourceId(intent.sourceId),
      sourceRevision: integer(
        intent.sourceRevision,
        1,
        Number.MAX_SAFE_INTEGER,
        "invalid_course_source_pdf_ingestion",
        "A revisão da Fonte"
      )
    };
  }
  exact(
    intent,
    ["mode", "sourceId", "expectedSourceRevision", "source"],
    "invalid_course_source_pdf_ingestion",
    "A intenção de salvar a Fonte e seu PDF"
  );
  const normalizedSourceId = intent.sourceId === null ? null : sourceId(intent.sourceId);
  const expectedSourceRevision = integer(
    intent.expectedSourceRevision,
    0,
    Number.MAX_SAFE_INTEGER,
    "invalid_course_source_pdf_ingestion",
    "A revisão esperada da Fonte"
  );
  if (normalizedSourceId === null && expectedSourceRevision !== 0) {
    fail(
      "invalid_course_source_pdf_ingestion",
      "Uma Fonte nova precisa começar sem revisão anterior."
    );
  }
  const normalized = {
    mode: intent.mode,
    sourceId: normalizedSourceId,
    expectedSourceRevision,
    source: normalizePdfSourceDocument(intent.source, expectedSourceRevision)
  };
  byteBound(
    normalized,
    16384,
    "course_source_pdf_ingestion_too_large",
    "A intenção da ingestão de PDF"
  );
  return normalized;
}

export function normalizeCourseSourcePdfIngestionRequest(value) {
  const request = clone(value);
  exact(request, [
    "courseId", "expectedCourseRevision", "requestId", "sourceIntent"
  ], "invalid_course_source_pdf_ingestion", "A requisição de ingestão de PDF");
  return {
    courseId: uuid(
      request.courseId,
      "invalid_course_source_pdf_ingestion",
      "A identidade do Curso"
    ),
    expectedCourseRevision: integer(
      request.expectedCourseRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_pdf_ingestion",
      "A revisão esperada do Curso"
    ),
    requestId: courseSourceRequestId(
      request.requestId,
      "invalid_course_source_pdf_ingestion",
      "A identidade da requisição"
    ),
    sourceIntent: normalizeCourseSourcePdfSourceIntent(request.sourceIntent)
  };
}

export function normalizeCourseSourcePdfIngestionPreparation(value) {
  const preparation = clone(value);
  exact(preparation, [
    "contract", "courseId", "courseRevision", "requestId", "sourceId",
    "sourceRevision", "attachment", "uploadRequired", "alreadyLinked"
  ], "invalid_course_source_pdf_ingestion_preparation", "A preparação da ingestão de PDF");
  if (preparation.contract !== COURSE_SOURCE_PDF_INGESTION_PREPARATION_CONTRACT ||
      typeof preparation.uploadRequired !== "boolean" ||
      typeof preparation.alreadyLinked !== "boolean") {
    fail(
      "invalid_course_source_pdf_ingestion_preparation",
      "A preparação da ingestão de PDF é inválida."
    );
  }
  const courseId = uuid(
    preparation.courseId,
    "invalid_course_source_pdf_ingestion_preparation",
    "A identidade do Curso"
  );
  const attachment = normalizeCourseSourceAttachment(preparation.attachment);
  if (!preparation.alreadyLinked &&
      COURSE_SOURCE_PDF_PATH_PATTERN.exec(attachment.storagePath)?.[1] !== courseId) {
    fail(
      "invalid_course_source_pdf_ingestion_preparation",
      "A preparação aponta para outro Curso."
    );
  }
  return {
    contract: preparation.contract,
    courseId,
    courseRevision: integer(
      preparation.courseRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_pdf_ingestion_preparation",
      "A revisão do Curso"
    ),
    requestId: courseSourceRequestId(
      preparation.requestId,
      "invalid_course_source_pdf_ingestion_preparation",
      "A identidade da requisição"
    ),
    sourceId: sourceId(preparation.sourceId),
    sourceRevision: integer(
      preparation.sourceRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_pdf_ingestion_preparation",
      "A revisão da Fonte"
    ),
    attachment,
    uploadRequired: preparation.uploadRequired,
    alreadyLinked: preparation.alreadyLinked
  };
}

export function normalizeCourseSourcePdfIngestion(value) {
  const ingestion = clone(value);
  exact(ingestion, [
    "contract", "courseId", "courseRevision", "requestId", "idempotent",
    "changed", "change", "source", "attachment", "stored"
  ], "invalid_course_source_pdf_ingestion", "O resultado da ingestão de PDF");
  if (ingestion.contract !== COURSE_SOURCE_PDF_INGESTION_CONTRACT ||
      ingestion.stored !== true) {
    fail(
      "invalid_course_source_pdf_ingestion",
      "O resultado da ingestão de PDF é inválido."
    );
  }
  const change = normalizeCourseSourceChange({
    contract: COURSE_SOURCE_CHANGE_CONTRACT,
    courseId: ingestion.courseId,
    courseRevision: ingestion.courseRevision,
    requestId: ingestion.requestId,
    idempotent: ingestion.idempotent,
    changed: ingestion.changed,
    change: ingestion.change
  });
  exact(
    ingestion.source,
    ["sourceId", "sourceRevision", "bibliographyChanged"],
    "invalid_course_source_pdf_ingestion",
    "A Fonte ingerida"
  );
  const source = {
    sourceId: sourceId(ingestion.source.sourceId),
    sourceRevision: integer(
      ingestion.source.sourceRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_pdf_ingestion",
      "A revisão da Fonte ingerida"
    ),
    bibliographyChanged: ingestion.source.bibliographyChanged
  };
  if (typeof source.bibliographyChanged !== "boolean") {
    fail(
      "invalid_course_source_pdf_ingestion",
      "O estado bibliográfico da Fonte ingerida é inválido."
    );
  }
  const attachment = normalizeCourseSourceAttachment(ingestion.attachment);
  if (change.change !== null && (
    change.change.type !== "ingest_pdf" ||
    change.change.subjectId !== source.sourceId ||
    change.change.revision !== source.sourceRevision
  )) {
    fail(
      "invalid_course_source_pdf_ingestion",
      "A Fonte devolvida não corresponde à ingestão de PDF."
    );
  }
  return {
    contract: ingestion.contract,
    courseId: change.courseId,
    courseRevision: change.courseRevision,
    requestId: change.requestId,
    idempotent: change.idempotent,
    changed: change.changed,
    change: change.change,
    source,
    attachment,
    stored: true
  };
}

export function normalizeCourseSourceCommand(value) {
  const command = clone(value);
  if (!isObject(command) || !COURSE_SOURCE_COMMAND_TYPES.includes(command.type)) {
    fail("invalid_course_source_command", "O comando de Fonte é inválido.");
  }
  if (command.type === "set_bibliography_style") {
    exact(command, ["type", "style"], "invalid_course_source_command", "O estilo bibliográfico");
    if (!COURSE_BIBLIOGRAPHY_STYLES.includes(command.style)) {
      fail("invalid_course_source_command", "O estilo bibliográfico é inválido.");
    }
    return command;
  }
  if (command.type === "save_source") {
    exact(command, ["type", "sourceId", "expectedSourceRevision", "source"], "invalid_course_source_command", "O comando save_source");
    const normalized = {
      type: command.type,
      sourceId: sourceId(command.sourceId),
      expectedSourceRevision: integer(command.expectedSourceRevision, 0, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Fonte"),
      source: normalizeCourseSourceDocument(command.source)
    };
    byteBound(normalized, 16384, "course_source_command_too_large", "O comando de Fonte");
    return normalized;
  }
  if (command.type === "retire_source") {
    exact(command, ["type", "sourceId", "expectedSourceRevision"], "invalid_course_source_command", "O comando retire_source");
    return {
      type: command.type,
      sourceId: sourceId(command.sourceId),
      expectedSourceRevision: integer(command.expectedSourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Fonte")
    };
  }
  if (command.type === "save_anchor") {
    exact(command, ["type", "anchorId", "sourceId", "sourceRevision", "expectedAnchorRevision", "selector", "contentHash", "humanLocator", "verificationExcerpt"], "invalid_course_source_command", "O comando save_anchor");
    const normalized = {
      type: command.type,
      anchorId: anchorId(command.anchorId),
      sourceId: sourceId(command.sourceId),
      sourceRevision: integer(command.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão da Fonte"),
      expectedAnchorRevision: integer(command.expectedAnchorRevision, 0, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Âncora"),
      selector: normalizeCourseSourceSelector(command.selector),
      contentHash: command.contentHash === null ? null : contentHash(command.contentHash, "invalid_course_source_command"),
      humanLocator: optionalText(command.humanLocator, 500, "invalid_course_source_command", "O localizador humano", {
        allowLayoutWhitespace: false
      }),
      verificationExcerpt: command.verificationExcerpt === null ? null :
        text(command.verificationExcerpt, 2000, "invalid_course_source_command", "O trecho de verificação", {
          preserveWhitespace: true
        })
    };
    byteBound(normalized, 32768, "course_source_command_too_large", "O comando de Âncora");
    return normalized;
  }
  if (command.type === "retire_anchor") {
    exact(command, ["type", "anchorId", "expectedAnchorRevision"], "invalid_course_source_command", "O comando retire_anchor");
    return {
      type: command.type,
      anchorId: anchorId(command.anchorId),
      expectedAnchorRevision: integer(command.expectedAnchorRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Âncora")
    };
  }
  if (command.type === "remove_pdf") {
    exact(command, ["type", "sourceId", "expectedSourceRevision", "contentHash"], "invalid_course_source_command", "O comando remove_pdf");
    return {
      type: command.type,
      sourceId: sourceId(command.sourceId),
      expectedSourceRevision: integer(command.expectedSourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Fonte"),
      contentHash: contentHash(command.contentHash, "invalid_course_source_command")
    };
  }
  exact(command, ["type", "targetKind", "targetId", "expectedTargetVersion", "sourceLinks"], "invalid_course_source_command", "O comando set_target_sources");
  if (!["plan_item", "study_unit"].includes(command.targetKind)) {
    fail("invalid_course_source_target", "O tipo do alvo de proveniência é inválido.");
  }
  return {
    type: command.type,
    targetKind: command.targetKind,
    targetId: command.targetKind === "plan_item"
      ? uuid(command.targetId, "invalid_course_source_target", "A identidade do item de plano")
      : opaqueId(command.targetId, 240, "invalid_course_source_target", "A identidade da Unidade de estudo"),
    expectedTargetVersion: integer(command.expectedTargetVersion, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_target", "A versão esperada do alvo"),
    sourceLinks: normalizeCourseSourceLinks(command.sourceLinks)
  };
}

export function normalizeSourceAttributionApplications(value) {
  if (!Array.isArray(value) || value.length > 64) {
    fail("invalid_course_source_attribution_applications", "As aplicações de proveniência precisam formar uma lista de até 64 itens.");
  }
  const ids = new Set();
  const applications = value.map((candidate) => {
    exact(candidate, ["studyUnitId", "sourceLinks"], "invalid_course_source_attribution_application", "A aplicação de proveniência");
    const studyUnitId = opaqueId(candidate.studyUnitId, 240, "invalid_course_source_target", "A identidade da Unidade de estudo");
    if (ids.has(studyUnitId)) {
      fail("duplicate_course_source_attribution_application", "A aplicação repete uma Unidade de estudo.");
    }
    ids.add(studyUnitId);
    return {
      studyUnitId,
      sourceLinks: normalizeCourseSourceLinks(candidate.sourceLinks)
    };
  });
  byteBound(applications, 196608, "course_source_attribution_applications_too_large", "As aplicações de proveniência");
  return applications;
}


function validateSource(value, { detailed = false } = {}) {
  const fields = [
    "sourceId", "revision", "status", "kind", "defaultRoles", "title", "authors",
    "publicationDate", "identifier", "language", "citationMode", "citationText", "bibliographic", "url",
    "editionOrVersion", "origin", "availability", "verificationStatus",
    "studyVisibility", "publicFileAccess", "anchorCount", "createdAt"
  ];
  if (detailed) fields.push("anchors", "attachments");
  exact(value, fields, "invalid_course_sources_read", "A Fonte");
  sourceId(value.sourceId);
  integer(value.revision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão da Fonte");
  if (!COURSE_SOURCE_STATUSES.includes(value.status) ||
      !COURSE_SOURCE_KINDS.includes(value.kind) ||
      !["manual", "generated"].includes(value.citationMode) ||
      !COURSE_SOURCE_STUDY_VISIBILITIES.includes(value.studyVisibility) ||
      !["inherit", "restricted", "available"].includes(value.publicFileAccess)) {
    fail("invalid_course_sources_read", "A Fonte possui enumeração inválida.");
  }
  sourceMetadataEnums(value, "invalid_course_sources_read");
  normalizeCourseSourceRoles(value.defaultRoles);
  normalizeBibliographicNames(value.authors);
  normalizeBibliographicMetadata(value.bibliographic);
  optionalText(value.title, 300, "invalid_course_sources_read", "O título da Fonte", {
    allowLayoutWhitespace: false
  });
  partialIsoDate(value.publicationDate, "invalid_course_sources_read");
  optionalText(value.identifier, 240, "invalid_course_sources_read", "O identificador", {
    allowLayoutWhitespace: false
  });
  languageTag(value.language, "invalid_course_sources_read");
  optionalText(value.citationText, 2048, "invalid_course_sources_read", "O texto de citação", { preserveWhitespace: true });
  const sourceUrl = optionalText(value.url, 2048, "invalid_course_sources_read", "A URL da Fonte");
  if (sourceUrl !== null && !HTTPS_PATTERN.test(sourceUrl)) {
    fail("invalid_course_sources_read", "A URL da Fonte precisa usar HTTPS.");
  }
  optionalText(value.editionOrVersion, 120, "invalid_course_sources_read", "A edição ou versão", {
    allowLayoutWhitespace: false
  });
  if (value.studyVisibility !== "hidden" && value.citationMode === "manual" && value.citationText === null) {
    fail("invalid_course_sources_read", "Uma Fonte visível não contém texto de citação.");
  }
  integer(value.anchorCount, 0, 1_000_000, "invalid_course_sources_read", "A contagem de Âncoras");
  timestamp(value.createdAt, "invalid_course_sources_read", "A criação da Fonte");
  if (!detailed) return;

  if (!Array.isArray(value.anchors) || value.anchors.length > 128 ||
      !Array.isArray(value.attachments) || value.attachments.length > 8) {
    fail("invalid_course_sources_read", "Os detalhes da Fonte são inválidos.");
  }
  value.anchors.forEach((anchor) => {
    exact(anchor, [
      "anchorId", "revision", "sourceRevision", "status", "selector", "contentHash",
      "humanLocator", "verificationExcerpt", "needsReverification", "createdAt"
    ], "invalid_course_sources_read", "A Âncora");
    anchorId(anchor.anchorId);
    integer(anchor.revision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão da Âncora");
    if (anchor.sourceRevision !== value.revision ||
        !["active", "retired"].includes(anchor.status) ||
        typeof anchor.needsReverification !== "boolean") {
      fail("invalid_course_sources_read", "A Âncora não corresponde à Fonte corrente.");
    }
    normalizeCourseSourceSelector(anchor.selector);
    if (anchor.contentHash !== null) contentHash(anchor.contentHash, "invalid_course_sources_read");
    optionalText(anchor.humanLocator, 500, "invalid_course_sources_read", "O localizador humano", {
      allowLayoutWhitespace: false
    });
    optionalText(
      anchor.verificationExcerpt,
      2000,
      "invalid_course_sources_read",
      "O trecho de verificação",
      { preserveWhitespace: true }
    );
    timestamp(anchor.createdAt, "invalid_course_sources_read", "A criação da Âncora");
  });
  const hashes = new Set();
  value.attachments.forEach((attachment) => {
    const normalized = normalizeCourseSourceAttachment(attachment, { persisted: true });
    if (hashes.has(normalized.contentHash)) {
      fail("invalid_course_sources_read", "A Fonte repete um anexo PDF.");
    }
    hashes.add(normalized.contentHash);
  });
}

function validateAttribution(value) {
  exact(value, [
    "targetKind", "targetId", "targetVersion", "sourceLinks", "createdAt"
  ], "invalid_course_sources_read", "A atribuição de proveniência");
  if (!["plan_item", "study_unit"].includes(value.targetKind)) {
    fail("invalid_course_sources_read", "O tipo do alvo é inválido.");
  }
  if (value.targetKind === "plan_item") {
    uuid(value.targetId, "invalid_course_sources_read", "A identidade do item de plano");
  } else {
    opaqueId(value.targetId, 240, "invalid_course_sources_read", "A identidade da Unidade de estudo");
  }
  integer(value.targetVersion, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A versão do alvo");
  normalizeCourseSourceLinks(value.sourceLinks);
  timestamp(value.createdAt, "invalid_course_sources_read", "A criação da atribuição");
}

export function normalizeCourseSourcesRead(value) {
  const read = clone(value);
  exact(read, [
    "contract", "courseId", "courseRevision", "bibliographyStyle", "mode", "query", "pdfStorage",
    "items", "nextCursor"
  ], "invalid_course_sources_read", "A leitura de Fontes");
  if (read.contract !== COURSE_SOURCES_CONTRACT || !COURSE_BIBLIOGRAPHY_STYLES.includes(read.bibliographyStyle) ||
      !["catalog", "source", "target"].includes(read.mode)) {
    fail("invalid_course_sources_read", "O contrato ou modo da leitura de Fontes é inválido.");
  }
  uuid(read.courseId, "invalid_course_sources_read", "A identidade do Curso");
  integer(read.courseRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão do Curso");
  normalizePdfStorage(read.pdfStorage);
  exact(read.query, ["sourceId", "targetKind", "targetId"], "invalid_course_sources_read", "A consulta de Fontes");
  if (read.mode === "catalog") {
    if (read.query.sourceId !== null || read.query.targetKind !== null ||
        read.query.targetId !== null) {
      fail("invalid_course_sources_read", "A consulta do catálogo não aceita alvo.");
    }
  } else if (read.mode === "source") {
    sourceId(read.query.sourceId);
    if ((read.query.targetKind === null) !== (read.query.targetId === null) ||
        read.query.targetKind !== null &&
          !["plan_item", "study_unit"].includes(read.query.targetKind)) {
      fail("invalid_course_sources_read", "O contexto da Fonte é inválido.");
    }
  } else if (read.query.sourceId !== null ||
      !["plan_item", "study_unit"].includes(read.query.targetKind)) {
    fail("invalid_course_sources_read", "A consulta do alvo é inválida.");
  }
  if (read.query.targetKind === "plan_item") {
    uuid(read.query.targetId, "invalid_course_sources_read", "A identidade do item de plano");
  } else if (read.query.targetKind === "study_unit") {
    opaqueId(read.query.targetId, 240, "invalid_course_sources_read", "A identidade da Unidade de estudo");
  }
  if (!Array.isArray(read.items) || read.items.length > 24 ||
      read.nextCursor !== null && (
        typeof read.nextCursor !== "string" || read.nextCursor.length > 240 ||
        !CURSOR_PATTERN.test(read.nextCursor)
      )) {
    fail("invalid_course_sources_read", "A página de Fontes é inválida.");
  }
  if (read.mode === "source" && (read.items.length > 1 || read.nextCursor !== null)) {
    fail("invalid_course_sources_read", "A leitura de uma Fonte precisa ser singular.");
  }
  read.items.forEach((item) => {
    if (read.mode === "catalog") validateSource(item);
    else if (read.mode === "source") validateSource(item, { detailed: true });
    else validateAttribution(item);
  });
  byteBound(read, 262144, "course_sources_read_too_large", "A leitura de Fontes");
  return read;
}

export function normalizeCourseSourceChange(value) {
  const change = clone(value);
  exact(change, ["contract", "courseId", "courseRevision", "requestId", "idempotent", "changed", "change"], "invalid_course_source_change", "O resultado da mudança de Fonte");
  if (change.contract !== COURSE_SOURCE_CHANGE_CONTRACT ||
      typeof change.requestId !== "string" || !REQUEST_ID_PATTERN.test(change.requestId) ||
      typeof change.idempotent !== "boolean" || typeof change.changed !== "boolean" ||
      change.changed !== (change.change !== null)) {
    fail("invalid_course_source_change", "O resultado da mudança de Fonte é inválido.");
  }
  uuid(change.courseId, "invalid_course_source_change", "A identidade do Curso");
  integer(change.courseRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_change", "A revisão do Curso");
  if (change.change !== null) {
    if (!COURSE_SOURCE_CHANGE_TYPES.includes(change.change.type)) fail("invalid_course_source_change", "O tipo da mudança é inválido.");
    const isTargetChange = change.change.type === "set_target_sources";
    exact(
      change.change,
      isTargetChange ? ["type", "subjectId", "targetVersion"] : ["type", "subjectId", "revision"],
      "invalid_course_source_change",
      "O fato da mudança"
    );
    if (["save_source", "retire_source", "remove_pdf", "ingest_pdf"].includes(change.change.type)) {
      sourceId(change.change.subjectId);
    } else {
      opaqueId(change.change.subjectId, 240, "invalid_course_source_change", "A identidade alterada");
    }
    integer(
      isTargetChange ? change.change.targetVersion : change.change.revision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_change",
      isTargetChange ? "A versão do alvo" : "A revisão da mudança"
    );
  }
  return change;
}

export function normalizeCourseStudyCitationsRead(value) {
  const read = clone(value);
  exact(read, ["contract", "courseId", "courseRevision", "bibliographyStyle", "studyUnitId", "citations"], "invalid_course_study_citations", "A leitura de citações");
  if (read.contract !== COURSE_STUDY_CITATIONS_CONTRACT) fail("invalid_course_study_citations", "O contrato de citações é inválido.");
  if (!COURSE_BIBLIOGRAPHY_STYLES.includes(read.bibliographyStyle)) fail("invalid_course_study_citations", "O estilo bibliográfico é inválido.");
  uuid(read.courseId, "invalid_course_study_citations", "A identidade do Curso");
  integer(read.courseRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_study_citations", "A revisão do Curso");
  opaqueId(read.studyUnitId, 240, "invalid_course_study_citations", "A identidade da Unidade de estudo");
  if (!Array.isArray(read.citations) || read.citations.length > 128) fail("invalid_course_study_citations", "A lista de citações é inválida.");
  if (new Set(read.citations.map((citation) => citation?.linkId)).size !== read.citations.length) {
    fail("invalid_course_study_citations", "A leitura repete a identidade de um vínculo.");
  }
  read.citations.forEach((citation) => {
    exact(citation, ["linkId", "sourceId", "sourceRevision", "kind", "title", "authors",
      "publicationDate", "identifier", "language", "bibliographic", "citationMode", "citationText",
      "url", "editionOrVersion", "relation", "roles", "occurrences", "anchors", "attachments"], "invalid_course_study_citations", "A citação");
    normalizeCourseSourceLinks([{
      linkId: citation.linkId, sourceId: citation.sourceId, relation: citation.relation,
      roles: citation.roles, occurrences: citation.occurrences,
      anchors: citation.anchors?.map(({ anchorId }) => ({ anchorId }))
    }]);
    if (!COURSE_SOURCE_KINDS.includes(citation.kind) || !["manual", "generated"].includes(citation.citationMode)) {
      fail("invalid_course_study_citations", "Os metadados da citação são inválidos.");
    }
    normalizeBibliographicNames(citation.authors);
    normalizeBibliographicMetadata(citation.bibliographic);
    partialIsoDate(citation.publicationDate, "invalid_course_study_citations");
    languageTag(citation.language, "invalid_course_study_citations");
    optionalText(citation.identifier, 240, "invalid_course_study_citations", "O identificador humano");
    sourceId(citation.sourceId);
    integer(citation.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_study_citations", "A revisão da Fonte");
    if (!Array.isArray(citation.attachments) || citation.attachments.length > 8) {
      fail("invalid_course_study_citations", "A lista de PDFs autorizados é inválida.");
    }
    citation.attachments.forEach(normalizeCoursePublicPdfAttachment);
    optionalText(citation.title, 300, "invalid_course_study_citations", "O título da Fonte", {
      allowLayoutWhitespace: false
    });
    optionalText(citation.citationText, 2048, "invalid_course_study_citations", "O texto de citação", { preserveWhitespace: true });
    if (citation.citationMode === "manual" && citation.citationText === null) {
      fail("invalid_course_study_citations", "A referência manual visível exige texto.");
    }
    const url = optionalText(citation.url, 2048, "invalid_course_study_citations", "A URL da Fonte");
    if (url !== null && !HTTPS_PATTERN.test(url)) fail("invalid_course_study_citations", "A URL da Fonte precisa usar HTTPS.");
    optionalText(citation.editionOrVersion, 120, "invalid_course_study_citations", "A edição ou versão", {
      allowLayoutWhitespace: false
    });
    if (!Array.isArray(citation.anchors) || citation.anchors.length > 8) fail("invalid_course_study_citations", "As Âncoras da citação são inválidas.");
    citation.anchors.forEach((anchor) => {
      const anchorFields = ["anchorId", "selector", "humanLocator", "contentHash"];
      exact(anchor, anchorFields, "invalid_course_study_citations", "A Âncora redigida");
      anchorId(anchor.anchorId);
      normalizeCourseSourceSelector(anchor.selector);
      if (anchor.contentHash !== null) contentHash(anchor.contentHash, "invalid_course_study_citations");
      if (Object.hasOwn(anchor, "humanLocator")) {
        optionalText(anchor.humanLocator, 500, "invalid_course_study_citations", "O localizador humano", {
          allowLayoutWhitespace: false
        });
      }
    });
  });
  byteBound(read, 262144, "course_study_citations_too_large", "A leitura de citações");
  return read;
}
