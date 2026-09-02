import {
  CourseSourcesError,
  normalizeCourseSourceLinks
} from "./courseSources.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const PROTECTED_PERSON_REF_PATTERN = /^person-[0-9a-f]{16}$/u;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const encoder = new TextEncoder();

export const COURSE_ANCHORED_ANNOTATION_PAGE_CONTRACT =
  "aralearn.course-anchored-annotation-page.v1";
export const COURSE_ANCHORED_ANNOTATION_CHANGE_CONTRACT =
  "aralearn.course-anchored-annotation-change.v1";
export const COURSE_ANCHORED_ANNOTATION_CONTRACT =
  "aralearn.course-anchored-annotation.v1";
export const COURSE_ANCHORED_ANNOTATION_TARGET_KINDS = Object.freeze([
  "course", "module", "lesson", "topic", "didactic_microsequence", "study_unit",
  "source", "source_anchor"
]);
export const COURSE_ANCHORED_ANNOTATION_ORIGINS = Object.freeze([
  "author", "learner", "reviewer", "imported"
]);
export const COURSE_ANCHORED_ANNOTATION_CHANNELS = Object.freeze([
  "authoring_interface", "authoring_chat", "study_interface", "imported"
]);
export const COURSE_ANCHORED_ANNOTATION_CATEGORIES = Object.freeze([
  "question", "possible_error", "confusing", "suggestion", "reformulation_request"
]);
export const COURSE_ANCHORED_ANNOTATION_RESPONSE_KINDS = Object.freeze([
  "answer", "reformulation"
]);
export const COURSE_ANCHORED_ANNOTATION_STATES = Object.freeze([
  "open", "considered", "resolved", "withdrawn"
]);
export const COURSE_ANCHORED_ANNOTATION_CONTRIBUTOR_ROLES = Object.freeze([
  "author", "learner", "reviewer", "imported"
]);
export const COURSE_ANCHORED_ANNOTATION_COMMAND_TYPES = Object.freeze([
  "create_anchored_annotation",
  "revise_anchored_annotation",
  "withdraw_anchored_annotation",
  "consider_anchored_annotation",
  "respond_to_anchored_annotation",
  "resolve_anchored_annotation",
  "reopen_anchored_annotation",
  "correct_anchored_annotation_subjects"
]);

export class CourseAnchoredAnnotationsError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CourseAnchoredAnnotationsError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CourseAnchoredAnnotationsError(code, message, details);
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    fail("invalid_course_anchored_annotation_json", "A observação precisa conter somente dados clonáveis.");
  }
}

function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, fields, code, label) {
  if (!object(value)) fail(code, `${label} precisa ser um objeto.`);
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail(code, `${label} contém o campo desconhecido ${unknown}.`, { field: unknown });
  const missing = fields.find((field) => !Object.hasOwn(value, field));
  if (missing) fail(code, `${label} não contém ${missing}.`, { field: missing });
}

function uuid(value, code, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(code, `${label} precisa ser um UUID canônico.`);
  }
  return value;
}

function integer(value, minimum, maximum, code, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, `${label} precisa ser um inteiro entre ${minimum} e ${maximum}.`);
  }
  return value;
}

function hasForbiddenCharacter(value) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return point >= 0xd800 && point <= 0xdfff ||
      point <= 31 && ![9, 10, 13].includes(point) || point >= 127 && point <= 159;
  });
}

function boundedText(value, maximumScalars, maximumBytes, code, label, {
  nullable = false,
  preserveLayout = false
} = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim() ||
      [...value].length > maximumScalars || encoder.encode(value).byteLength > maximumBytes ||
      hasForbiddenCharacter(value) || !preserveLayout && value !== value.trim()) {
    fail(code, `${label} é inválido.`);
  }
  return value;
}

function opaqueId(value, code, label) {
  return boundedText(value, 240, 960, code, label);
}

function sourceId(value, code, label) {
  const hasControl = typeof value === "string" && [...value].some((character) => {
    const point = character.codePointAt(0);
    return point <= 31 || point >= 127 && point <= 159;
  });
  if (typeof value !== "string" || !value || value !== value.trim() ||
      [...value].length > 240 || encoder.encode(value).byteLength > 960 || hasControl) {
    fail(code, `${label} é inválida.`);
  }
  return value;
}

function consideredSourceLinks(value, code) {
  try {
    return normalizeCourseSourceLinks(value);
  } catch (error) {
    if (!(error instanceof CourseSourcesError)) throw error;
    fail(code, error.message, error.details);
  }
}

function targetId(kind, value, code, label = "A identidade do alvo") {
  if (kind === "course") return uuid(value, code, label);
  if (kind === "source") return sourceId(value, code, label);
  return opaqueId(value, code, label);
}

function timestamp(value, code, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const match = typeof value === "string" ? RFC3339_PATTERN.exec(value) : null;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const daysInMonth = month >= 1 && month <= 12
    ? [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    : 0;
  if (!match || year < 1 || day < 1 || day > daysInMonth || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || Number.isNaN(Date.parse(value))) {
    fail(code, `${label} precisa ser um instante serializado.`);
  }
  return value;
}

function byteBound(value, maximum, code, label) {
  if (encoder.encode(JSON.stringify(value)).byteLength > maximum) {
    fail(code, `${label} excede ${maximum} bytes.`);
  }
}

function enumValue(value, values, code, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!values.includes(value)) fail(code, `${label} é inválido.`);
  return value;
}

function target(value, code = "invalid_course_anchored_annotation_target") {
  exact(value, ["kind", "id"], code, "O alvo da observação");
  enumValue(value.kind, COURSE_ANCHORED_ANNOTATION_TARGET_KINDS, code, "O tipo do alvo");
  return {
    kind: value.kind,
    id: targetId(
      value.kind,
      value.id,
      code,
      value.kind === "course" ? "A identidade do Curso-alvo" : "A identidade do alvo"
    )
  };
}

function category(value, code) {
  return enumValue(value, COURSE_ANCHORED_ANNOTATION_CATEGORIES, code, "A categoria", {
    nullable: true
  });
}

export function normalizeCourseAnchoredAnnotationCommand(value) {
  const command = clone(value);
  if (!object(command) || !COURSE_ANCHORED_ANNOTATION_COMMAND_TYPES.includes(command.type)) {
    fail("invalid_course_anchored_annotation_command", "O comando de observação é inválido.");
  }
  const code = "invalid_course_anchored_annotation_command";
  let normalized;
  if (command.type === "create_anchored_annotation") {
    exact(command, [
      "type", "annotationId", "target", "rawText", "category", "capturedAt", "briefSummary"
    ], code, "O comando de criação");
    normalized = {
      type: command.type,
      annotationId: uuid(command.annotationId, code, "A identidade da observação"),
      target: target(command.target, code),
      rawText: boundedText(command.rawText, 2000, 16384, code, "O texto bruto", {
        preserveLayout: true
      }),
      category: category(command.category, code),
      capturedAt: timestamp(command.capturedAt, code, "O instante capturado", { nullable: true }),
      briefSummary: boundedText(command.briefSummary, 500, 4096, code, "A síntese breve", {
        nullable: true,
        preserveLayout: true
      })
    };
  } else if (command.type === "revise_anchored_annotation") {
    exact(command, [
      "type", "annotationId", "expectedAnnotationVersion", "rawText", "category", "briefSummary"
    ], code, "O comando de revisão");
    normalized = {
      type: command.type,
      annotationId: uuid(command.annotationId, code, "A identidade da observação"),
      expectedAnnotationVersion: integer(command.expectedAnnotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão esperada"),
      rawText: boundedText(command.rawText, 2000, 16384, code, "O texto bruto", {
        preserveLayout: true
      }),
      category: category(command.category, code),
      briefSummary: boundedText(command.briefSummary, 500, 4096, code, "A síntese breve", {
        nullable: true,
        preserveLayout: true
      })
    };
  } else if (command.type === "respond_to_anchored_annotation") {
    exact(command, [
      "type", "annotationId", "expectedAnnotationVersion", "ownerResponse",
      "responseKind", "consideredSourceLinks"
    ], code, "O comando de resposta");
    const responseKind = enumValue(
      command.responseKind,
      COURSE_ANCHORED_ANNOTATION_RESPONSE_KINDS,
      code,
      "O tipo da resposta"
    );
    const sourceLinks = consideredSourceLinks(command.consideredSourceLinks, code);
    if ((responseKind === "answer" && sourceLinks.length > 0) ||
        (responseKind === "reformulation" && sourceLinks.length === 0)) {
      fail(
        code,
        responseKind === "reformulation"
          ? "Uma reformulação precisa declarar as Fontes e Âncoras consideradas."
          : "Uma resposta simples não declara Fontes consideradas."
      );
    }
    normalized = {
      type: command.type,
      annotationId: uuid(command.annotationId, code, "A identidade da observação"),
      expectedAnnotationVersion: integer(command.expectedAnnotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão esperada"),
      ownerResponse: boundedText(command.ownerResponse, 2000, 16384, code, "A resposta da pessoa autora", {
        preserveLayout: true
      }),
      responseKind,
      consideredSourceLinks: sourceLinks
    };
  } else if (command.type === "correct_anchored_annotation_subjects") {
    exact(command, ["type", "annotationId", "expectedAnnotationVersion", "subjectIds"], code, "O comando de correção de assunto");
    if (!Array.isArray(command.subjectIds) || command.subjectIds.length > 64) {
      fail(code, "Os assuntos corrigidos precisam formar uma lista limitada.");
    }
    const subjectIds = command.subjectIds.map((id) => opaqueId(id, code, "A identidade do Tópico"));
    if (new Set(subjectIds).size !== subjectIds.length) fail(code, "A correção repete um Tópico.");
    normalized = {
      type: command.type,
      annotationId: uuid(command.annotationId, code, "A identidade da observação"),
      expectedAnnotationVersion: integer(command.expectedAnnotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão esperada"),
      subjectIds
    };
  } else {
    exact(command, ["type", "annotationId", "expectedAnnotationVersion"], code, "O comando de estado");
    normalized = {
      type: command.type,
      annotationId: uuid(command.annotationId, code, "A identidade da observação"),
      expectedAnnotationVersion: integer(command.expectedAnnotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão esperada")
    };
  }
  byteBound(normalized, 32768, "course_anchored_annotation_command_too_large", "O comando de observação");
  return normalized;
}

function enumList(value, allowed, maximum, code, label) {
  if (!Array.isArray(value) || value.length > maximum ||
      value.some((item) => !allowed.includes(item)) || new Set(value).size !== value.length) {
    fail(code, `${label} precisa formar uma lista válida.`);
  }
  return [...value];
}

export function normalizeCourseAnchoredAnnotationQuery(value) {
  const query = clone(value);
  const code = "invalid_course_anchored_annotation_query";
  exact(query, [
    "mode", "origins", "channels", "states", "categories", "includeUncategorized",
    "subjectIds", "hierarchy", "annotationId"
  ], code, "A consulta de observações");
  if (!["inbox", "target", "detail"].includes(query.mode) ||
      typeof query.includeUncategorized !== "boolean") {
    fail(code, "O modo ou filtro de categoria é inválido.");
  }
  const normalized = {
    mode: query.mode,
    origins: enumList(query.origins, COURSE_ANCHORED_ANNOTATION_ORIGINS, 5, code, "As origens"),
    channels: enumList(query.channels, COURSE_ANCHORED_ANNOTATION_CHANNELS, 6, code, "Os canais"),
    states: enumList(query.states, COURSE_ANCHORED_ANNOTATION_STATES, 4, code, "Os estados"),
    categories: enumList(query.categories, COURSE_ANCHORED_ANNOTATION_CATEGORIES, 5, code, "As categorias"),
    includeUncategorized: query.includeUncategorized,
    subjectIds: (() => {
      if (!Array.isArray(query.subjectIds) || query.subjectIds.length > 16) fail(code, "Os assuntos são inválidos.");
      const ids = query.subjectIds.map((id) => opaqueId(id, code, "A identidade do Tópico"));
      if (new Set(ids).size !== ids.length) fail(code, "O filtro repete um Tópico.");
      return ids;
    })(),
    hierarchy: query.hierarchy === null ? null : (() => {
      exact(query.hierarchy, ["target", "includeDescendants"], code, "O filtro hierárquico");
      if (typeof query.hierarchy.includeDescendants !== "boolean") fail(code, "A descendência é inválida.");
      return { target: target(query.hierarchy.target, code), includeDescendants: query.hierarchy.includeDescendants };
    })(),
    annotationId: query.annotationId === null ? null : uuid(query.annotationId, code, "A identidade da observação")
  };
  if (normalized.mode === "detail" && normalized.annotationId === null ||
      normalized.mode !== "detail" && normalized.annotationId !== null ||
      normalized.mode === "target" && normalized.hierarchy === null ||
      normalized.mode === "detail" && normalized.hierarchy !== null) {
    fail(code, "O alvo exigido pelo modo da consulta está ausente ou em excesso.");
  }
  byteBound(normalized, 16384, "course_anchored_annotation_query_too_large", "A consulta de observações");
  return normalized;
}

export function normalizeCourseAnchoredAnnotationReadOptions(value) {
  const options = clone(value);
  const code = "invalid_course_anchored_annotation_read_options";
  exact(options, [
    "expectedCourseRevision", "annotationSetVersion", "query", "cursor", "limit"
  ], code, "As opções de leitura de observações");
  const normalized = {
    expectedCourseRevision: integer(options.expectedCourseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão esperada do Curso"),
    annotationSetVersion: options.annotationSetVersion === null ? null :
      integer(options.annotationSetVersion, 0, Number.MAX_SAFE_INTEGER, code, "A versão esperada do conjunto"),
    query: normalizeCourseAnchoredAnnotationQuery(options.query),
    cursor: options.cursor === null ? null : (() => {
      if (typeof options.cursor !== "string" || options.cursor.length > 240 || !CURSOR_PATTERN.test(options.cursor)) {
        fail(code, "O cursor é inválido.");
      }
      return options.cursor;
    })(),
    limit: integer(options.limit, 1, 24, code, "O limite da página")
  };
  byteBound(normalized, 16384, "course_anchored_annotation_read_options_too_large", "As opções de leitura");
  return normalized;
}

function pathEntry(value, code, label) {
  exact(value, ["kind", "id", "label", "version"], code, label);
  enumValue(value.kind, COURSE_ANCHORED_ANNOTATION_TARGET_KINDS, code, "O tipo do caminho");
  return {
    kind: value.kind,
    id: targetId(
      value.kind,
      value.id,
      code,
      value.kind === "course" ? "A identidade do Curso no caminho" : "A identidade no caminho"
    ),
    label: boundedText(value.label, 300, 1200, code, "O rótulo do caminho", { nullable: true, preserveLayout: true }),
    version: value.version === null ? null : integer(value.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão no caminho")
  };
}

function path(value, code, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) fail(code, `${label} é inválido.`);
  return value.map((entry) => pathEntry(entry, code, "Uma entrada do caminho"));
}

function subject(value, code) {
  exact(value, ["topicId", "label", "topicVersion"], code, "Um assunto classificado");
  return {
    topicId: opaqueId(value.topicId, code, "A identidade do Tópico"),
    label: boundedText(value.label, 300, 1200, code, "O rótulo do Tópico", { preserveLayout: true }),
    topicVersion: integer(value.topicVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão do Tópico")
  };
}

function classificationFact(value, code, { effective = false } = {}) {
  exact(value, ["method", "methodVersion", "taxonomyRevision", "subjects"], code, "A classificação de assunto");
  const automaticMethods = [
    "exact_topic_target", "target_scope_unclassified",
    "imported_unclassified"
  ];
  const methods = effective ? [...automaticMethods, "human_topic_selection"] : automaticMethods;
  enumValue(value.method, methods, code, "O método de classificação");
  integer(value.methodVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão do método");
  if (value.method === "imported_unclassified") {
    if (value.taxonomyRevision !== null) fail(code, "A classificação importada não inventa revisão taxonômica.");
  } else {
    integer(value.taxonomyRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão taxonômica");
  }
  if (!Array.isArray(value.subjects) || value.subjects.length > 64) fail(code, "Os assuntos classificados são inválidos.");
  const subjects = value.subjects.map((item) => subject(item, code));
  if (new Set(subjects.map((item) => item.topicId)).size !== subjects.length) fail(code, "A classificação repete um Tópico.");
  return { method: value.method, methodVersion: value.methodVersion, taxonomyRevision: value.taxonomyRevision, subjects };
}

function annotationItem(value) {
  const code = "invalid_course_anchored_annotation_page";
  exact(value, [
    "contract", "annotationId", "annotationVersion", "courseId", "provenance", "contributor", "target",
    "observedRevision", "rawText", "category", "briefSummary", "subjectClassification",
    "state", "ownerResponse", "timestamps", "capabilities", "deepLink"
  ], code, "Uma observação");
  if (value.contract !== COURSE_ANCHORED_ANNOTATION_CONTRACT) fail(code, "O contrato da observação é inválido.");
  exact(value.provenance, ["origin", "channel"], code, "A proveniência");
  enumValue(value.provenance.origin, COURSE_ANCHORED_ANNOTATION_ORIGINS, code, "A origem");
  enumValue(value.provenance.channel, COURSE_ANCHORED_ANNOTATION_CHANNELS, code, "O canal");
  const provenancePairs = new Set([
    "author\0authoring_interface", "author\0authoring_chat", "learner\0study_interface",
    "author\0imported", "learner\0imported", "reviewer\0imported",
    "imported\0imported"
  ]);
  if (!provenancePairs.has(`${value.provenance.origin}\0${value.provenance.channel}`)) {
    fail(code, "A origem e o canal não formam um par permitido.");
  }
  exact(value.contributor, ["kind", "role", "ref", "label"], code, "A pessoa contribuinte protegida");
  enumValue(value.contributor.kind, ["self", "protected_person", "software", "imported"], code, "O tipo de contribuinte");
  enumValue(value.contributor.role, COURSE_ANCHORED_ANNOTATION_CONTRIBUTOR_ROLES, code, "O papel da pessoa contribuinte");
  const expectedRole = value.provenance.origin;
  if (value.contributor.role !== expectedRole) fail(code, "O papel não corresponde à origem da observação.");
  const protectedRef = value.contributor.ref;
  if (value.contributor.kind === "protected_person" &&
      (typeof protectedRef !== "string" || !PROTECTED_PERSON_REF_PATTERN.test(protectedRef)) ||
      value.contributor.kind === "self" &&
        protectedRef !== null && protectedRef !== "self" ||
      value.contributor.kind === "software" && protectedRef !== null ||
      value.contributor.kind === "imported" && protectedRef !== null ||
      value.provenance.origin !== "imported" &&
        ["software", "imported"].includes(value.contributor.kind)) {
    fail(code, "A referência ou o tipo da pessoa contribuinte não corresponde à projeção protegida.");
  }
  boundedText(value.contributor.label, 120, 480, code, "O rótulo protegido", { preserveLayout: true });
  exact(value.target, ["kind", "id", "observedPath", "currentAvailable", "currentPath", "deepLink"], code, "O alvo situado");
  target({ kind: value.target.kind, id: value.target.id }, code);
  const observedPath = path(value.target.observedPath, code, "O caminho observado");
  const observedLast = observedPath.at(-1);
  if (observedPath[0].kind !== "course" || observedPath[0].id !== value.courseId ||
      observedLast.kind !== value.target.kind || observedLast.id !== value.target.id) {
    fail(code, "O caminho observado não está ancorado no Curso e alvo da observação.");
  }
  if (typeof value.target.currentAvailable !== "boolean" ||
      value.target.currentAvailable !== (value.target.currentPath !== null) ||
      value.target.deepLink !== null && !value.target.currentAvailable) fail(code, "A disponibilidade corrente é incoerente.");
  if (value.target.currentPath !== null) {
    const currentPath = path(value.target.currentPath, code, "O caminho corrente");
    const currentLast = currentPath.at(-1);
    if (currentPath[0].kind !== "course" || currentPath[0].id !== value.courseId ||
        currentLast.kind !== value.target.kind || currentLast.id !== value.target.id) {
      fail(code, "O caminho corrente não corresponde ao Curso e alvo da observação.");
    }
  }
  if (value.target.deepLink !== null) boundedText(value.target.deepLink, 2048, 8192, code, "O link contextual");
  exact(value.observedRevision, ["certainty", "courseRevision", "targetVersion"], code, "A revisão observada");
  enumValue(value.observedRevision.certainty, ["known", "unknown"], code, "A certeza da revisão");
  if (value.observedRevision.certainty === "known") {
    integer(value.observedRevision.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão observada do Curso");
    integer(value.observedRevision.targetVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão observada do alvo");
    if (value.target.kind === "course" && value.observedRevision.targetVersion !== value.observedRevision.courseRevision) {
      fail(code, "A versão observada do Curso precisa coincidir com sua revisão.");
    }
  } else if (value.observedRevision.courseRevision !== null || value.observedRevision.targetVersion !== null) {
    fail(code, "Uma revisão desconhecida não contém valores.");
  }
  if (value.rawText !== null) boundedText(value.rawText, 2000, 16384, code, "O texto bruto", { preserveLayout: true });
  if (value.state === "withdrawn" && (value.rawText !== null || value.briefSummary !== null ||
        value.ownerResponse !== null) ||
      value.state !== "withdrawn" && value.rawText === null) fail(code, "A redação da observação é incoerente.");
  category(value.category, code);
  boundedText(value.briefSummary, 500, 4096, code, "A síntese breve", { nullable: true, preserveLayout: true });
  exact(value.subjectClassification, ["status", "automatic", "effective", "correctedAt"], code, "A classificação");
  enumValue(value.subjectClassification.status, ["classified", "unclassified"], code, "O estado da classificação");
  classificationFact(value.subjectClassification.automatic, code);
  classificationFact(value.subjectClassification.effective, code, { effective: true });
  timestamp(value.subjectClassification.correctedAt, code, "A correção de assunto", { nullable: true });
  const effectiveSubjects = value.subjectClassification.effective.subjects;
  if ((value.subjectClassification.status === "classified") !== (effectiveSubjects.length > 0)) {
    fail(code, "O estado da classificação não corresponde aos assuntos efetivos.");
  }
  enumValue(value.state, COURSE_ANCHORED_ANNOTATION_STATES, code, "O estado");
  if (value.ownerResponse !== null) {
    exact(value.ownerResponse, [
      "text", "kind", "consideredSourceLinks", "updatedAt"
    ], code, "A resposta da pessoa autora");
    boundedText(value.ownerResponse.text, 2000, 16384, code, "A resposta da pessoa autora", { preserveLayout: true });
    enumValue(
      value.ownerResponse.kind,
      COURSE_ANCHORED_ANNOTATION_RESPONSE_KINDS,
      code,
      "O tipo da resposta"
    );
    const sourceLinks = consideredSourceLinks(value.ownerResponse.consideredSourceLinks, code);
    if ((value.ownerResponse.kind === "answer" && sourceLinks.length > 0) ||
        (value.ownerResponse.kind === "reformulation" && sourceLinks.length === 0)) {
      fail(code, "A declaração de Fontes consideradas é incoerente com a resposta.");
    }
    timestamp(value.ownerResponse.updatedAt, code, "A atualização da resposta");
  }
  exact(value.timestamps, [
    "capturedAt", "createdAt", "updatedAt", "firstConsideredAt", "respondedAt", "resolvedAt", "withdrawnAt"
  ], code, "Os instantes da observação");
  for (const field of Object.keys(value.timestamps)) {
    timestamp(value.timestamps[field], code, `O instante ${field}`, { nullable: field !== "createdAt" && field !== "updatedAt" });
  }
  uuid(value.annotationId, code, "A identidade da observação");
  uuid(value.courseId, code, "A identidade do Curso");
  integer(value.annotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da observação");
  exact(value.capabilities, [
    "canRevise", "canWithdraw", "canConsider", "canRespond", "canResolve",
    "canReopen", "canCorrectSubjects"
  ], code, "As capacidades da observação");
  if (Object.values(value.capabilities).some((allowed) => typeof allowed !== "boolean")) {
    fail(code, "As capacidades da observação são inválidas.");
  }
  boundedText(value.deepLink, 2048, 8192, code, "O link da observação", { nullable: true });
}

export function normalizeCourseAnchoredAnnotationPage(value) {
  const page = clone(value);
  const code = "invalid_course_anchored_annotation_page";
  exact(page, [
    "contract", "courseId", "courseRevision", "annotationSetVersion", "query", "summary",
    "items", "hasMore", "nextCursor"
  ], code, "A página de observações");
  if (page.contract !== COURSE_ANCHORED_ANNOTATION_PAGE_CONTRACT) fail(code, "O contrato da página é inválido.");
  uuid(page.courseId, code, "A identidade do Curso");
  integer(page.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão do Curso");
  integer(page.annotationSetVersion, 0, Number.MAX_SAFE_INTEGER, code, "A versão do conjunto de observações");
  page.query = normalizeCourseAnchoredAnnotationQuery(page.query);
  exact(page.summary, ["matchingTotal", "byOrigin", "byChannel", "byState", "unclassifiedTotal"], code, "O resumo");
  integer(page.summary.matchingTotal, 0, Number.MAX_SAFE_INTEGER, code, "O total correspondente");
  integer(page.summary.unclassifiedTotal, 0, Number.MAX_SAFE_INTEGER, code, "O total não classificado");
  for (const [field, allowed] of [["byOrigin", COURSE_ANCHORED_ANNOTATION_ORIGINS], ["byChannel", COURSE_ANCHORED_ANNOTATION_CHANNELS], ["byState", COURSE_ANCHORED_ANNOTATION_STATES]]) {
    if (!object(page.summary[field]) || Object.keys(page.summary[field]).some((key) => !allowed.includes(key)) ||
        Object.values(page.summary[field]).some((count) => !Number.isSafeInteger(count) || count < 0)) fail(code, `O resumo ${field} é inválido.`);
  }
  if (!Array.isArray(page.items) || page.items.length > 24 || typeof page.hasMore !== "boolean" ||
      page.hasMore !== (page.nextCursor !== null)) fail(code, "A paginação é inválida.");
  page.items.forEach(annotationItem);
  if (page.nextCursor !== null && (typeof page.nextCursor !== "string" || page.nextCursor.length > 240 || !CURSOR_PATTERN.test(page.nextCursor))) fail(code, "O próximo cursor é inválido.");
  byteBound(page, 262144, "course_anchored_annotation_page_too_large", "A página de observações");
  return page;
}

export function normalizeCourseAnchoredAnnotationChange(value) {
  const change = clone(value);
  const code = "invalid_course_anchored_annotation_change";
  exact(change, [
    "contract", "courseId", "courseRevision", "annotationSetVersion", "requestId",
    "idempotent", "changed", "annotation"
  ], code, "A mudança de observação");
  if (change.contract !== COURSE_ANCHORED_ANNOTATION_CHANGE_CONTRACT ||
      typeof change.requestId !== "string" || !REQUEST_ID_PATTERN.test(change.requestId) ||
      typeof change.idempotent !== "boolean" || typeof change.changed !== "boolean") {
    fail(code, "A mudança de observação é inválida.");
  }
  uuid(change.courseId, code, "A identidade do Curso");
  integer(change.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão do Curso");
  integer(change.annotationSetVersion, 0, Number.MAX_SAFE_INTEGER, code, "A versão do conjunto de observações");
  if (change.annotation !== null) annotationItem(change.annotation);
  byteBound(change, 65536, "course_anchored_annotation_change_too_large", "A mudança de observação");
  return change;
}
