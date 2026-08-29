const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const HTTPS_PATTERN = /^https:\/\/[^\s]+$/u;
const CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const COURSE_SOURCE_PDF_PATH_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([a-f0-9]{64})\.pdf$/u;
const PARTIAL_ISO_DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u;
const BCP47_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*$/u;
const encoder = new TextEncoder();

export const COURSE_SOURCES_CONTRACT = "aralearn.course-sources.v1";
export const COURSE_SOURCE_CHANGE_CONTRACT = "aralearn.course-source-change.v1";
export const COURSE_STUDY_CITATIONS_CONTRACT = "aralearn.course-study-citations.v1";
export const COURSE_SOURCE_CONTEXT_CONTRACT = "aralearn.course-source-context.v1";
export const COURSE_DESIGN_CONTEXT_V2_CONTRACT = "aralearn.course-design-context.v2";
export const COURSE_SOURCE_ATTACHMENT_ACCESS_V1_CONTRACT =
  "aralearn.course-source-attachment-access.v1";
export const COURSE_SOURCE_ATTACHMENT_ACCESS_CONTRACT =
  "aralearn.course-source-attachment-access.v2";
export const COURSE_SOURCE_PDF_INGESTION_PREPARATION_CONTRACT =
  "aralearn.course-source-pdf-ingestion-preparation.v1";
export const COURSE_SOURCE_PDF_INGESTION_CONTRACT =
  "aralearn.course-source-pdf-ingestion.v1";
export const COURSE_SOURCE_PDF_MEDIA_TYPE = "application/pdf";
export const COURSE_SOURCE_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const COURSE_SOURCE_PDF_COURSE_MAX_UNIQUE_BYTES = 64 * 1024 * 1024;

export const COURSE_SOURCE_KINDS = Object.freeze([
  "web_page", "article", "book", "document", "media", "other"
]);
export const COURSE_SOURCE_STATUSES = Object.freeze([
  "active", "retired", "unresolved_legacy"
]);
export const COURSE_SOURCE_STUDY_VISIBILITIES = Object.freeze([
  "hidden", "citation", "citation_and_link"
]);
export const COURSE_SOURCE_ORIGINS = Object.freeze([
  "external", "author_provided", "imported_legacy"
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
export const COURSE_SOURCE_ATTRIBUTION_APPLICATION_CONTRACT =
  "aralearn.course-source-attribution-application.v1";
export const COURSE_SOURCE_COMMAND_TYPES = Object.freeze([
  "save_source", "retire_source", "save_anchor", "retire_anchor",
  "attach_pdf", "set_target_sources"
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

function legacySourceId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4_096 ||
      [...value].length > 2_048 || encoder.encode(value).byteLength > 8_192 ||
      hasControl(value, false)) {
    fail("invalid_course_source_id", "A identidade legada da Fonte é inválida.");
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

export function normalizeCourseSourceAttachment(value, { persisted = false } = {}) {
  const attachment = clone(value);
  const fields = ["contentHash", "byteSize", "mediaType", "storagePath"];
  if (persisted) fields.push("actorId", "createdAt");
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
  if (persisted) {
    normalized.actorId = attachment.actorId === null ? null : uuid(
      attachment.actorId,
      "invalid_course_source_attachment",
      "A identidade do ator do anexo"
    );
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
    fail("invalid_course_source_attachment_access", "A URL assinada do anexo é inválida.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("invalid_course_source_attachment_access", "A URL assinada do anexo é inválida.");
  }
  const localHttp = parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost", "10.0.2.2"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp || !parsed.searchParams.has("token")) {
    fail("invalid_course_source_attachment_access", "A URL assinada do anexo é inválida.");
  }
  return value;
}

export function normalizeCourseSourceAttachmentAccess(value) {
  const access = clone(value);
  exact(access, [
    "contract", "courseId", "courseRevision", "operation", "sourceId",
    "sourceRevision", "storageOriginCourseId", "attachment", "uploadRequired",
    "alreadyLinked", "signedUrl", "expiresAt"
  ], "invalid_course_source_attachment_access", "O acesso ao anexo PDF");
  const compatibleDownload = access.operation === "download" &&
    access.contract === COURSE_SOURCE_ATTACHMENT_ACCESS_V1_CONTRACT;
  const supportedContract = access.contract === COURSE_SOURCE_ATTACHMENT_ACCESS_CONTRACT ||
    compatibleDownload;
  if (!supportedContract ||
      !["prepare_upload", "download"].includes(access.operation) ||
      typeof access.uploadRequired !== "boolean" ||
      typeof access.alreadyLinked !== "boolean") {
    fail("invalid_course_source_attachment_access", "O contrato de acesso ao anexo é inválido.");
  }
  const courseId = uuid(
    access.courseId,
    "invalid_course_source_attachment_access",
    "A identidade do Curso"
  );
  const attachment = normalizeCourseSourceAttachment(access.attachment);
  const storageOriginCourseId = uuid(
    access.storageOriginCourseId,
    "invalid_course_source_attachment_access",
    "A identidade do Curso de origem do objeto"
  );
  const pathCourseId = COURSE_SOURCE_PDF_PATH_PATTERN.exec(attachment.storagePath)?.[1];
  if (pathCourseId !== storageOriginCourseId ||
      !access.alreadyLinked && storageOriginCourseId !== courseId ||
      access.operation === "download" && (access.uploadRequired || !access.alreadyLinked) ||
      access.alreadyLinked && access.uploadRequired ||
      access.operation === "prepare_upload" &&
        (access.signedUrl !== null || access.expiresAt !== null) ||
      access.operation === "download" && access.signedUrl === null ||
      access.operation === "download" && access.expiresAt === null) {
    fail("invalid_course_source_attachment_access", "O acesso ao anexo é inconsistente.");
  }
  return {
    contract: access.contract,
    courseId,
    courseRevision: integer(
      access.courseRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_attachment_access",
      "A revisão do Curso"
    ),
    operation: access.operation,
    sourceId: legacySourceId(access.sourceId),
    sourceRevision: integer(
      access.sourceRevision,
      1,
      Number.MAX_SAFE_INTEGER,
      "invalid_course_source_attachment_access",
      "A revisão da Fonte"
    ),
    storageOriginCourseId,
    attachment,
    uploadRequired: access.uploadRequired,
    alreadyLinked: access.alreadyLinked,
    signedUrl: signedStorageUrl(access.signedUrl, { nullable: true }),
    expiresAt: access.expiresAt === null
      ? null
      : timestamp(
          access.expiresAt,
          "invalid_course_source_attachment_access",
          "A expiração do acesso ao anexo"
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

export function normalizeCourseSourceLinks(value, { allowLegacyIds = false } = {}) {
  const maximumLinks = allowLegacyIds ? 128 : 32;
  if (!Array.isArray(value) || value.length > maximumLinks) {
    fail("invalid_course_source_links", `Os vínculos de Fonte precisam formar uma lista de até ${maximumLinks} itens.`);
  }
  const seenSources = new Set();
  const seenAnchors = new Set();
  const links = value.map((candidate) => {
    exact(candidate, ["sourceId", "sourceRevision", "relation", "anchors"], "invalid_course_source_link", "O vínculo de Fonte");
    const normalizedSourceId = legacySourceId(candidate.sourceId);
    if (!allowLegacyIds && seenSources.has(normalizedSourceId)) {
      fail("duplicate_course_source_link", "Uma atribuição não pode repetir a mesma Fonte.");
    }
    seenSources.add(normalizedSourceId);
    const allowedRelations = allowLegacyIds
      ? [...COURSE_SOURCE_RELATIONS, "legacy_reference"]
      : COURSE_SOURCE_RELATIONS;
    if (!allowedRelations.includes(candidate.relation)) {
      fail("invalid_course_source_link", "A relação de proveniência é inválida.");
    }
    if (!Array.isArray(candidate.anchors) || candidate.anchors.length > 8) {
      fail("invalid_course_source_link", "As Âncoras da Fonte precisam formar uma lista de até 8 itens.");
    }
    const anchors = candidate.anchors.map((anchor) => {
      exact(anchor, ["anchorId", "anchorRevision"], "invalid_course_source_link", "A Âncora atribuída");
      const normalizedAnchorId = anchorId(anchor.anchorId);
      if (!allowLegacyIds && seenAnchors.has(normalizedAnchorId)) {
        fail("duplicate_course_source_anchor_link", "Uma atribuição não pode repetir a mesma Âncora.");
      }
      seenAnchors.add(normalizedAnchorId);
      return {
        anchorId: normalizedAnchorId,
        anchorRevision: integer(anchor.anchorRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_link", "A revisão da Âncora")
      };
    });
    if (anchors.length === 0 && !allowLegacyIds) {
      fail("invalid_course_source_link", "Um vínculo novo exige ao menos uma Âncora verificada.");
    }
    if (candidate.relation === "quoted_from" && anchors.length === 0) {
      fail("invalid_course_source_link", "quoted_from exige ao menos uma Âncora.");
    }
    return {
      sourceId: normalizedSourceId,
      sourceRevision: integer(candidate.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_link", "A revisão da Fonte"),
      relation: candidate.relation,
      anchors
    };
  });
  byteBound(links, 131072, "course_source_links_too_large", "Os vínculos de Fonte");
  return links;
}

function normalizeSourceDocument(value) {
  exact(value, [
    "kind", "title", "authorship", "publicationDate", "identifier", "language",
    "citationText", "url", "editionOrVersion", "origin", "availability",
    "verificationStatus", "studyVisibility"
  ], "invalid_course_source", "A revisão da Fonte");
  if (!COURSE_SOURCE_KINDS.includes(value.kind) ||
      !COURSE_SOURCE_STUDY_VISIBILITIES.includes(value.studyVisibility)) {
    fail("invalid_course_source", "O tipo ou a visibilidade da Fonte é inválido.");
  }
  sourceMetadataEnums(value);
  const url = optionalText(value.url, 2048, "invalid_course_source", "A URL HTTPS da Fonte");
  if (url !== null && !HTTPS_PATTERN.test(url)) {
    fail("invalid_course_source", "A URL da Fonte precisa usar HTTPS.");
  }
  const normalized = {
    kind: value.kind,
    title: text(value.title, 300, "invalid_course_source", "O título da Fonte", {
      allowLayoutWhitespace: false
    }),
    authorship: optionalText(value.authorship, 500, "invalid_course_source", "A autoria", {
      allowLayoutWhitespace: false
    }),
    publicationDate: partialIsoDate(value.publicationDate),
    identifier: optionalText(value.identifier, 240, "invalid_course_source", "O identificador", {
      allowLayoutWhitespace: false
    }),
    language: languageTag(value.language),
    citationText: optionalText(value.citationText, 2048, "invalid_course_source", "O texto de citação"),
    url,
    editionOrVersion: optionalText(value.editionOrVersion, 120, "invalid_course_source", "A edição ou versão", {
      allowLayoutWhitespace: false
    }),
    origin: value.origin,
    availability: value.availability,
    verificationStatus: value.verificationStatus,
    studyVisibility: value.studyVisibility
  };
  if (normalized.studyVisibility !== "hidden" && normalized.citationText === null) {
    fail("invalid_course_source", "Uma Fonte visível no Estudo exige texto de citação.");
  }
  return normalized;
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
      sourceId: legacySourceId(intent.sourceId),
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
  const sourceId = intent.sourceId === null ? null : legacySourceId(intent.sourceId);
  const expectedSourceRevision = integer(
    intent.expectedSourceRevision,
    0,
    Number.MAX_SAFE_INTEGER,
    "invalid_course_source_pdf_ingestion",
    "A revisão esperada da Fonte"
  );
  if (sourceId === null && expectedSourceRevision !== 0) {
    fail(
      "invalid_course_source_pdf_ingestion",
      "Uma Fonte nova precisa começar sem revisão anterior."
    );
  }
  const normalized = {
    mode: intent.mode,
    sourceId,
    expectedSourceRevision,
    source: normalizeSourceDocument(intent.source)
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
      typeof preparation.alreadyLinked !== "boolean" ||
      preparation.uploadRequired && preparation.alreadyLinked) {
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
    sourceId: legacySourceId(preparation.sourceId),
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
    sourceId: legacySourceId(ingestion.source.sourceId),
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
    change.change.type !== "attach_pdf" ||
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
  if (command.type === "save_source") {
    exact(command, ["type", "sourceId", "expectedSourceRevision", "source"], "invalid_course_source_command", "O comando save_source");
    const normalized = {
      type: command.type,
      sourceId: legacySourceId(command.sourceId),
      expectedSourceRevision: integer(command.expectedSourceRevision, 0, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Fonte"),
      source: normalizeSourceDocument(command.source)
    };
    byteBound(normalized, 16384, "course_source_command_too_large", "O comando de Fonte");
    return normalized;
  }
  if (command.type === "retire_source") {
    exact(command, ["type", "sourceId", "expectedSourceRevision"], "invalid_course_source_command", "O comando retire_source");
    return {
      type: command.type,
      sourceId: legacySourceId(command.sourceId),
      expectedSourceRevision: integer(command.expectedSourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Fonte")
    };
  }
  if (command.type === "save_anchor") {
    if (!Object.hasOwn(command, "humanLocator")) command.humanLocator = null;
    exact(command, ["type", "anchorId", "sourceId", "sourceRevision", "expectedAnchorRevision", "selector", "humanLocator", "verificationExcerpt"], "invalid_course_source_command", "O comando save_anchor");
    const normalized = {
      type: command.type,
      anchorId: anchorId(command.anchorId),
      sourceId: legacySourceId(command.sourceId),
      sourceRevision: integer(command.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão da Fonte"),
      expectedAnchorRevision: integer(command.expectedAnchorRevision, 0, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão esperada da Âncora"),
      selector: normalizeCourseSourceSelector(command.selector),
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
  if (command.type === "attach_pdf") {
    exact(command, ["type", "sourceId", "sourceRevision", "attachment"], "invalid_course_source_command", "O comando attach_pdf");
    return {
      type: command.type,
      sourceId: legacySourceId(command.sourceId),
      sourceRevision: integer(command.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_command", "A revisão da Fonte"),
      attachment: normalizeCourseSourceAttachment(command.attachment)
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

export function normalizeSourceAttributionApplications(value, {
  allowLegacyCarry = false
} = {}) {
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
      sourceLinks: normalizeCourseSourceLinks(candidate.sourceLinks, {
        allowLegacyIds: allowLegacyCarry
      })
    };
  });
  byteBound(applications, 196608, "course_source_attribution_applications_too_large", "As aplicações de proveniência");
  return applications;
}

export function normalizeCourseSourceAttributionApplication(value) {
  const application = clone(value);
  exact(
    application,
    ["contract", "contextHash", "didacticMicrosequenceId", "studyUnits"],
    "invalid_course_source_attribution_application",
    "A aplicação de proveniência da materialização"
  );
  if (application.contract !== COURSE_SOURCE_ATTRIBUTION_APPLICATION_CONTRACT ||
      typeof application.contextHash !== "string" ||
      !SHA256_PATTERN.test(application.contextHash)) {
    fail("invalid_course_source_attribution_application", "O hash do contexto de proveniência é inválido.");
  }
  const didacticMicrosequenceId = opaqueId(
    application.didacticMicrosequenceId,
    240,
    "invalid_course_source_attribution_application",
    "A identidade da microssequência didática"
  );
  if (!Array.isArray(application.studyUnits)) {
    fail("invalid_course_source_attribution_application", "As Unidades da aplicação precisam formar uma lista.");
  }
  const studyUnits = normalizeSourceAttributionApplications(
    application.studyUnits.map((studyUnit) => ({
      studyUnitId: studyUnit.studyUnitId,
      sourceLinks: studyUnit.sourceLinks
    }))
  );
  const normalized = {
    contract: COURSE_SOURCE_ATTRIBUTION_APPLICATION_CONTRACT,
    contextHash: application.contextHash,
    didacticMicrosequenceId,
    studyUnits
  };
  byteBound(normalized, 196608, "course_source_attribution_application_too_large", "A aplicação de proveniência");
  return normalized;
}

function normalizeCompactContextSources(value) {
  if (!Array.isArray(value) || value.length > 128) {
    fail("invalid_course_source_context", "As Fontes seladas precisam formar uma lista limitada.");
  }
  const sourceKeys = new Set();
  return value.map((source) => {
    exact(source, ["sourceId", "sourceRevision", "relation", "sourceHash", "anchors"], "invalid_course_source_context", "Uma Fonte selada");
    const normalizedSourceId = legacySourceId(source.sourceId);
    const sourceRevision = integer(source.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_context", "A revisão da Fonte selada");
    const key = `${normalizedSourceId}\0${sourceRevision}`;
    if (sourceKeys.has(key) || typeof source.sourceHash !== "string" || !SHA256_PATTERN.test(source.sourceHash)) {
      fail("invalid_course_source_context", "A Fonte selada é repetida ou possui hash inválido.");
    }
    sourceKeys.add(key);
    if (![...COURSE_SOURCE_RELATIONS, "legacy_reference"].includes(source.relation)) {
      fail("invalid_course_source_context", "A relação da Fonte selada é inválida.");
    }
    if (!Array.isArray(source.anchors) || source.anchors.length > 8) {
      fail("invalid_course_source_context", "As Âncoras seladas precisam formar uma lista limitada.");
    }
    const anchorKeys = new Set();
    const anchors = source.anchors.map((anchor) => {
      exact(anchor, ["anchorId", "anchorRevision", "anchorHash"], "invalid_course_source_context", "Uma Âncora selada");
      const normalizedAnchorId = anchorId(anchor.anchorId);
      const anchorRevision = integer(anchor.anchorRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_context", "A revisão da Âncora selada");
      const anchorKey = `${normalizedAnchorId}\0${anchorRevision}`;
      if (anchorKeys.has(anchorKey) || typeof anchor.anchorHash !== "string" || !SHA256_PATTERN.test(anchor.anchorHash)) {
        fail("invalid_course_source_context", "A Âncora selada é repetida ou possui hash inválido.");
      }
      anchorKeys.add(anchorKey);
      return { anchorId: normalizedAnchorId, anchorRevision, anchorHash: anchor.anchorHash };
    });
    return {
      sourceId: normalizedSourceId,
      sourceRevision,
      relation: source.relation,
      sourceHash: source.sourceHash,
      anchors
    };
  });
}

function normalizeContextPlanItemAttributions(value, label) {
  if (!Array.isArray(value) || value.length > 256) {
    fail("invalid_course_source_context", `${label} precisa formar uma lista limitada.`);
  }
  const itemIds = new Set();
  return value.map((item) => {
    exact(
      item,
      ["planItemId", "planItemVersion", "targetHash", "attributionRevision", "attributionHash", "sources"],
      "invalid_course_source_context",
      "Uma atribuição de item de plano selada"
    );
    const planItemId = uuid(item.planItemId, "invalid_course_source_context", "A identidade do item de plano");
    if (itemIds.has(planItemId) || typeof item.targetHash !== "string" ||
        !SHA256_PATTERN.test(item.targetHash) || typeof item.attributionHash !== "string" ||
        !SHA256_PATTERN.test(item.attributionHash)) {
      fail("invalid_course_source_context", "A atribuição selada é repetida ou possui hash inválido.");
    }
    itemIds.add(planItemId);
    return {
      planItemId,
      planItemVersion: integer(item.planItemVersion, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_context", "A versão do item de plano"),
      targetHash: item.targetHash,
      attributionRevision: integer(item.attributionRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_context", "A revisão da atribuição"),
      attributionHash: item.attributionHash,
      sources: normalizeCompactContextSources(item.sources)
    };
  });
}

export function normalizeCourseSourceContext(value) {
  const context = clone(value);
  exact(
    context,
    [
      "contract", "courseId", "courseRevision", "authoringPartId",
      "componentCatalogVersion", "instructionalAnalysisUnits",
      "evidenceRequirements", "guidanceRevisions", "targets"
    ],
    "invalid_course_source_context",
    "O contexto de materialização"
  );
  if (context.contract !== COURSE_DESIGN_CONTEXT_V2_CONTRACT) {
    fail("invalid_course_source_context", "O contexto não usa o contrato de desenho v2.");
  }
  uuid(context.courseId, "invalid_course_source_context", "A identidade do Curso");
  uuid(context.authoringPartId, "invalid_course_source_context", "A identidade da Parte");
  integer(context.courseRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_context", "A revisão do Curso");
  if (!Array.isArray(context.targets) || context.targets.length > 64) {
    fail("invalid_course_source_context", "Os alvos do contexto precisam formar uma lista limitada.");
  }
  const targetIds = new Set();
  context.targets.forEach((target) => {
    if (!isObject(target) || !Object.hasOwn(target, "sourceAttributions")) {
      fail("invalid_course_source_context", "Um alvo não contém atribuições de proveniência.");
    }
    const targetId = opaqueId(target.didacticMicrosequenceId, 240, "invalid_course_source_context", "A identidade da microssequência");
    if (targetIds.has(targetId)) fail("invalid_course_source_context", "O contexto repete uma microssequência.");
    targetIds.add(targetId);
    exact(
      target.sourceAttributions,
      ["instructionalAnalysisUnits", "evidenceRequirements"],
      "invalid_course_source_context",
      "As atribuições de proveniência do alvo"
    );
    normalizeContextPlanItemAttributions(
      target.sourceAttributions.instructionalAnalysisUnits,
      "As atribuições das unidades de análise"
    );
    normalizeContextPlanItemAttributions(
      target.sourceAttributions.evidenceRequirements,
      "As atribuições dos requisitos de evidência"
    );
  });
  byteBound(context, 65536, "course_source_context_too_large", "O contexto de materialização");
  return context;
}

function nullableActor(value) {
  return value === null ? null : uuid(value, "invalid_course_sources_read", "A identidade do ator");
}

function validateSourceRevision(value, { detailed = false } = {}) {
  const fields = [
    "sourceId", "revision", "status", "kind", "title", "authorship",
    "publicationDate", "identifier", "language", "citationText", "url",
    "editionOrVersion", "origin", "availability", "verificationStatus",
    "studyVisibility", "anchorCount", "createdAt"
  ];
  if (detailed) fields.push("actorId", "anchors", "attachments");
  exact(value, fields, "invalid_course_sources_read", "A revisão de Fonte");
  legacySourceId(value.sourceId);
  integer(value.revision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão da Fonte");
  if (!COURSE_SOURCE_STATUSES.includes(value.status) ||
      value.status === "unresolved_legacy" && value.kind !== null ||
      value.status !== "unresolved_legacy" && !COURSE_SOURCE_KINDS.includes(value.kind) ||
      !COURSE_SOURCE_STUDY_VISIBILITIES.includes(value.studyVisibility)) {
    fail("invalid_course_sources_read", "A revisão de Fonte possui enumeração inválida.");
  }
  sourceMetadataEnums(value, "invalid_course_sources_read");
  if (value.status === "unresolved_legacy") {
    if (value.title !== null || value.authorship !== null || value.publicationDate !== null ||
        value.identifier !== null || value.language !== null || value.citationText !== null ||
        value.url !== null || value.editionOrVersion !== null || value.origin !== "imported_legacy" ||
        value.availability !== "unknown" || value.verificationStatus !== "unverified") {
      fail("invalid_course_sources_read", "Uma Fonte legada não resolvida não pode inventar metadados.");
    }
    if (value.studyVisibility !== "hidden") {
      fail("invalid_course_sources_read", "Uma Fonte legada não resolvida precisa permanecer oculta.");
    }
  } else {
    text(value.title, 300, "invalid_course_sources_read", "O título da Fonte", {
      allowLayoutWhitespace: false
    });
    optionalText(value.authorship, 500, "invalid_course_sources_read", "A autoria", {
      allowLayoutWhitespace: false
    });
    partialIsoDate(value.publicationDate, "invalid_course_sources_read");
    optionalText(value.identifier, 240, "invalid_course_sources_read", "O identificador", {
      allowLayoutWhitespace: false
    });
    languageTag(value.language, "invalid_course_sources_read");
    optionalText(value.citationText, 2048, "invalid_course_sources_read", "O texto de citação");
    const url = optionalText(value.url, 2048, "invalid_course_sources_read", "A URL da Fonte");
    if (url !== null && !HTTPS_PATTERN.test(url)) fail("invalid_course_sources_read", "A URL da Fonte precisa usar HTTPS.");
    optionalText(value.editionOrVersion, 120, "invalid_course_sources_read", "A edição ou versão", {
      allowLayoutWhitespace: false
    });
    if (value.studyVisibility !== "hidden" && value.citationText === null) {
      fail("invalid_course_sources_read", "Uma Fonte visível não contém texto de citação.");
    }
  }
  integer(value.anchorCount, 0, 1000000, "invalid_course_sources_read", "A contagem de Âncoras");
  timestamp(value.createdAt, "invalid_course_sources_read", "A criação da Fonte");
  if (detailed) {
    nullableActor(value.actorId);
    if (!Array.isArray(value.anchors) || value.anchors.length > 8) {
      fail("invalid_course_sources_read", "A lista de Âncoras é inválida.");
    }
    value.anchors.forEach((anchor) => {
      const anchorFields = ["anchorId", "revision", "sourceRevision", "status", "selector", "verificationExcerpt", "actorId", "createdAt"];
      if (Object.hasOwn(anchor, "humanLocator")) anchorFields.push("humanLocator");
      exact(anchor, anchorFields, "invalid_course_sources_read", "A revisão da Âncora");
      anchorId(anchor.anchorId);
      integer(anchor.revision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão da Âncora");
      integer(anchor.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão de Fonte da Âncora");
      if (!["active", "retired"].includes(anchor.status)) fail("invalid_course_sources_read", "O estado da Âncora é inválido.");
      normalizeCourseSourceSelector(anchor.selector);
      if (Object.hasOwn(anchor, "humanLocator")) {
        optionalText(anchor.humanLocator, 500, "invalid_course_sources_read", "O localizador humano", {
          allowLayoutWhitespace: false
        });
      }
      if (anchor.verificationExcerpt !== null) {
        text(anchor.verificationExcerpt, 2000, "invalid_course_sources_read", "O trecho de verificação", {
          preserveWhitespace: true
        });
      }
      nullableActor(anchor.actorId);
      timestamp(anchor.createdAt, "invalid_course_sources_read", "A criação da Âncora");
    });
    if (!Array.isArray(value.attachments) || value.attachments.length > 8) {
      fail("invalid_course_sources_read", "A lista de anexos PDF é inválida.");
    }
    const hashes = new Set();
    value.attachments.forEach((attachment) => {
      const normalized = normalizeCourseSourceAttachment(attachment, { persisted: true });
      if (hashes.has(normalized.contentHash)) {
        fail("invalid_course_sources_read", "A revisão da Fonte repete um anexo PDF.");
      }
      hashes.add(normalized.contentHash);
    });
  }
}

function validateAttribution(value) {
  exact(value, ["attributionId", "targetKind", "targetId", "targetVersion", "targetHash", "revision", "sourceLinks", "actorId", "createdAt", "effective"], "invalid_course_sources_read", "A atribuição de proveniência");
  uuid(value.attributionId, "invalid_course_sources_read", "A identidade da atribuição");
  if (!["plan_item", "study_unit"].includes(value.targetKind)) fail("invalid_course_sources_read", "O tipo do alvo é inválido.");
  if (value.targetKind === "plan_item") {
    uuid(value.targetId, "invalid_course_sources_read", "A identidade do item de plano");
  } else {
    opaqueId(value.targetId, 240, "invalid_course_sources_read", "A identidade da Unidade de estudo");
  }
  integer(value.targetVersion, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A versão do alvo");
  if (typeof value.targetHash !== "string" || !SHA256_PATTERN.test(value.targetHash)) fail("invalid_course_sources_read", "O hash semântico do alvo é inválido.");
  integer(value.revision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão da atribuição");
  normalizeCourseSourceLinks(value.sourceLinks, { allowLegacyIds: true });
  nullableActor(value.actorId);
  timestamp(value.createdAt, "invalid_course_sources_read", "A criação da atribuição");
  if (typeof value.effective !== "boolean") fail("invalid_course_sources_read", "A efetividade da atribuição é inválida.");
}

export function normalizeCourseSourcesRead(value) {
  const read = clone(value);
  exact(read, [
    "contract", "courseId", "courseRevision", "mode", "query", "pdfStorage",
    "items", "nextCursor"
  ], "invalid_course_sources_read", "A leitura de Fontes");
  if (read.contract !== COURSE_SOURCES_CONTRACT || !["catalog", "source", "target"].includes(read.mode)) {
    fail("invalid_course_sources_read", "O contrato ou modo da leitura de Fontes é inválido.");
  }
  uuid(read.courseId, "invalid_course_sources_read", "A identidade do Curso");
  integer(read.courseRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_sources_read", "A revisão do Curso");
  normalizePdfStorage(read.pdfStorage);
  exact(read.query, ["sourceId", "targetKind", "targetId"], "invalid_course_sources_read", "A consulta de Fontes");
  if (read.mode === "catalog") {
    if (read.query.sourceId !== null || read.query.targetKind !== null || read.query.targetId !== null) {
      fail("invalid_course_sources_read", "A consulta do catálogo não aceita alvo.");
    }
  } else if (read.mode === "source") {
    legacySourceId(read.query.sourceId);
    if ((read.query.targetKind === null) !== (read.query.targetId === null) ||
        read.query.targetKind !== null &&
          !["plan_item", "study_unit"].includes(read.query.targetKind)) {
      fail("invalid_course_sources_read", "O contexto da revisão de Fonte é inválido.");
    }
    if (read.query.targetKind === "plan_item") {
      uuid(read.query.targetId, "invalid_course_sources_read", "A identidade do item de plano");
    } else if (read.query.targetKind === "study_unit") {
      opaqueId(read.query.targetId, 240, "invalid_course_sources_read", "A identidade da Unidade de estudo");
    }
  } else {
    if (read.query.sourceId !== null || !["plan_item", "study_unit"].includes(read.query.targetKind)) {
      fail("invalid_course_sources_read", "A consulta do alvo é inválida.");
    }
    if (read.query.targetKind === "plan_item") {
      uuid(read.query.targetId, "invalid_course_sources_read", "A identidade do item de plano");
    } else {
      opaqueId(read.query.targetId, 240, "invalid_course_sources_read", "A identidade da Unidade de estudo");
    }
  }
  if (!Array.isArray(read.items) || read.items.length > 24 ||
      read.nextCursor !== null && (typeof read.nextCursor !== "string" ||
        !CURSOR_PATTERN.test(read.nextCursor) || read.nextCursor.length > 240)) {
    fail("invalid_course_sources_read", "A página de Fontes é inválida.");
  }
  if (read.mode === "source" && read.query.targetKind !== null &&
      (read.items.length > 1 || read.nextCursor !== null)) {
    fail("invalid_course_sources_read", "A revisão contextual de Fonte não é singular.");
  }
  read.items.forEach((item) => {
    if (read.mode === "catalog") validateSourceRevision(item);
    else if (read.mode === "source") validateSourceRevision(item, { detailed: true });
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
    exact(change.change, ["type", "subjectId", "revision"], "invalid_course_source_change", "O fato da mudança");
    if (!COURSE_SOURCE_COMMAND_TYPES.includes(change.change.type)) fail("invalid_course_source_change", "O tipo da mudança é inválido.");
    if (["save_source", "retire_source"].includes(change.change.type)) {
      legacySourceId(change.change.subjectId);
    } else {
      opaqueId(change.change.subjectId, 240, "invalid_course_source_change", "A identidade alterada");
    }
    integer(change.change.revision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_source_change", "A revisão da mudança");
  }
  return change;
}

export function normalizeCourseStudyCitationsRead(value) {
  const read = clone(value);
  exact(read, ["contract", "courseId", "courseRevision", "studyUnitId", "citations"], "invalid_course_study_citations", "A leitura de citações");
  if (read.contract !== COURSE_STUDY_CITATIONS_CONTRACT) fail("invalid_course_study_citations", "O contrato de citações é inválido.");
  uuid(read.courseId, "invalid_course_study_citations", "A identidade do Curso");
  integer(read.courseRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_study_citations", "A revisão do Curso");
  opaqueId(read.studyUnitId, 240, "invalid_course_study_citations", "A identidade da Unidade de estudo");
  if (!Array.isArray(read.citations) || read.citations.length > 128) fail("invalid_course_study_citations", "A lista de citações é inválida.");
  read.citations.forEach((citation) => {
    exact(citation, ["sourceId", "sourceRevision", "title", "citationText", "url", "editionOrVersion", "anchors"], "invalid_course_study_citations", "A citação");
    legacySourceId(citation.sourceId);
    integer(citation.sourceRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_study_citations", "A revisão da Fonte");
    text(citation.title, 300, "invalid_course_study_citations", "O título da Fonte", {
      allowLayoutWhitespace: false
    });
    text(citation.citationText, 2048, "invalid_course_study_citations", "O texto de citação");
    const url = optionalText(citation.url, 2048, "invalid_course_study_citations", "A URL da Fonte");
    if (url !== null && !HTTPS_PATTERN.test(url)) fail("invalid_course_study_citations", "A URL da Fonte precisa usar HTTPS.");
    optionalText(citation.editionOrVersion, 120, "invalid_course_study_citations", "A edição ou versão", {
      allowLayoutWhitespace: false
    });
    if (!Array.isArray(citation.anchors) || citation.anchors.length > 8) fail("invalid_course_study_citations", "As Âncoras da citação são inválidas.");
    citation.anchors.forEach((anchor) => {
      const anchorFields = ["anchorId", "anchorRevision", "selector"];
      if (Object.hasOwn(anchor, "humanLocator")) anchorFields.push("humanLocator");
      exact(anchor, anchorFields, "invalid_course_study_citations", "A Âncora redigida");
      anchorId(anchor.anchorId);
      integer(anchor.anchorRevision, 1, Number.MAX_SAFE_INTEGER, "invalid_course_study_citations", "A revisão da Âncora");
      normalizeCourseSourceSelector(anchor.selector);
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
