import {
  COURSE_SOURCE_RELATIONS,
  normalizeCourseSourceCommand,
  normalizeCourseSourceLinks,
  normalizeCourseSourceSelector
} from "./courseSources.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CODE_PATTERN = /^[a-z][a-z0-9._:-]{2,119}$/u;
const DECIMAL_ID_PATTERN = /^[1-9][0-9]{0,18}$/u;
const PARAMETER_ID_PATTERN = /^[a-z][a-z0-9_]{0,159}$/u;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const encoder = new TextEncoder();

export const COURSE_AUDIT_CYCLE_PAGE_CONTRACT = "aralearn.course-audit-cycle-page.v1";
export const COURSE_AUDIT_CYCLE_CHANGE_CONTRACT = "aralearn.course-audit-cycle-change.v1";
export const COURSE_AUDIT_CONTEXT_CONTRACT = "aralearn.course-audit-context.v1";
export const COURSE_INSTRUCTIONAL_AUDIT_RUN_CONTRACT = "aralearn.course-instructional-audit-run.v1";
export const COURSE_AUDIT_FINDING_CONTRACT = "aralearn.course-audit-finding.v1";
export const COURSE_AUTHORING_CORRECTION_CONTRACT = "aralearn.course-authoring-correction.v1";

export const COURSE_AUDIT_DIMENSIONS = Object.freeze([
  "structural_conformance", "pedagogical_quality", "factual_quality", "editorial_quality"
]);
export const COURSE_AUDIT_HUMAN_DIMENSIONS = Object.freeze(
  COURSE_AUDIT_DIMENSIONS.filter((dimension) => dimension !== "structural_conformance")
);
export const COURSE_AUDIT_RESULTS = Object.freeze([
  "passed", "failed", "uncertain", "not_applicable", "not_checked"
]);
export const COURSE_AUDIT_ADEQUACY = Object.freeze([
  "sufficient", "insufficient", "uncertain", "not_applicable", "not_assessed"
]);
export const COURSE_AUDIT_ORIGINS = Object.freeze(["human_audit", "automatic_audit"]);
export const COURSE_AUDIT_RUN_KINDS = Object.freeze(["audit", "verification"]);
export const COURSE_AUDIT_FINDING_STATES = Object.freeze([
  "open", "awaiting_verification", "resolved", "dismissed"
]);
export const COURSE_AUTHORING_CORRECTION_STATES = Object.freeze([
  "proposed", "rejected", "applied", "verified", "rolled_back"
]);
export const COURSE_AUDIT_SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);
export const COURSE_AUDIT_COMMAND_TYPES = Object.freeze([
  "record_audit",
  "propose_authoring_correction",
  "reject_authoring_correction",
  "decide_finding",
  "apply_authoring_correction",
  "verify_finding",
  "rollback_authoring_correction"
]);

export class CourseAuditCycleError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CourseAuditCycleError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CourseAuditCycleError(code, message, details);
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    fail("invalid_course_audit_cycle_json", "A auditoria precisa conter somente dados clonáveis.");
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

function byteBound(value, maximum, code, label) {
  if (encoder.encode(JSON.stringify(value)).byteLength > maximum) {
    fail(code, `${label} excede ${maximum} bytes.`);
  }
}

function hasForbiddenCharacter(value) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return point >= 0xd800 && point <= 0xdfff ||
      point <= 31 && ![9, 10, 13].includes(point) || point >= 127 && point <= 159;
  });
}

function text(value, maximumScalars, maximumBytes, code, label, {
  nullable = false,
  preserveLayout = false,
  allowEmpty = false
} = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) ||
      [...value].length > maximumScalars || encoder.encode(value).byteLength > maximumBytes ||
      hasForbiddenCharacter(value) || !preserveLayout && value !== value.trim()) {
    fail(code, `${label} é inválido.`);
  }
  return value;
}

function uuid(value, code, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(code, `${label} precisa ser um UUID canônico.`);
  }
  return value;
}

function opaqueId(value, code, label) {
  return text(value, 240, 960, code, label);
}

function literalSourceId(value, code, label) {
  if (typeof value !== "string" || !value || [...value].length > 2048 ||
      encoder.encode(value).byteLength > 8192 || [...value].some((character) => {
        const point = character.codePointAt(0);
        return point < 32 || point >= 127 && point <= 159 || point >= 0xd800 && point <= 0xdfff;
      })) {
    fail(code, `${label} é inválida.`);
  }
  return value;
}

function integer(value, minimum, maximum, code, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code, `${label} precisa ser um inteiro entre ${minimum} e ${maximum}.`);
  }
  return value;
}

function enumValue(value, allowed, code, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!allowed.includes(value)) fail(code, `${label} é inválido.`);
  return value;
}

function sha256(value, code, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) fail(code, `${label} é inválido.`);
  return value;
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

function nullableUuid(value, code, label) {
  return value === null ? null : uuid(value, code, label);
}

function codeValue(value, code, label) {
  if (typeof value !== "string" || !CODE_PATTERN.test(value) || encoder.encode(value).byteLength > 480) {
    fail(code, `${label} é inválido.`);
  }
  return value;
}

function distinctList(value, maximum, normalize, code, label) {
  if (!Array.isArray(value) || value.length > maximum) fail(code, `${label} é inválida.`);
  const normalized = value.map(normalize);
  if (new Set(normalized.map((item) => JSON.stringify(item))).size !== normalized.length) {
    fail(code, `${label} contém repetição.`);
  }
  return normalized;
}

function method(value, code) {
  exact(value, ["id", "version"], code, "O método de auditoria");
  return {
    id: text(value.id, 200, 800, code, "A identidade do método"),
    version: text(value.version, 80, 320, code, "A versão do método")
  };
}

function criterion(value, code) {
  exact(value, ["code", "version", "statement"], code, "O critério público");
  return {
    code: codeValue(value.code, code, "O código do critério"),
    version: text(value.version, 80, 320, code, "A versão do critério"),
    statement: text(value.statement, 1000, 4096, code, "O enunciado do critério", {
      preserveLayout: true
    })
  };
}

function planItemRef(value, code) {
  exact(value, ["planItemId", "version"], code, "A referência de item do plano");
  return {
    planItemId: uuid(value.planItemId, code, "A identidade do item do plano"),
    version: integer(value.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão do item do plano")
  };
}

function parameterRef(value, code) {
  exact(value, ["parameterId", "changeId"], code, "A referência de parâmetro");
  const changeId = value.changeId === null ? null : text(
    value.changeId, 19, 19, code, "A identidade da mudança de parâmetro"
  );
  if (!PARAMETER_ID_PATTERN.test(value.parameterId) ||
      changeId !== null && !DECIMAL_ID_PATTERN.test(changeId)) {
    fail(code, "A referência de parâmetro é inválida.");
  }
  return {
    parameterId: text(value.parameterId, 160, 640, code, "A identidade do parâmetro"),
    changeId
  };
}

function auditCheck(value, code = "invalid_course_audit_check") {
  exact(value, [
    "checkId", "dimension", "criterion", "result", "publicEvidence", "adequacy",
    "planItemRefs", "parameterRefs", "sourceLinks"
  ], code, "O check de auditoria");
  const normalized = {
    checkId: uuid(value.checkId, code, "A identidade do check"),
    dimension: enumValue(value.dimension, COURSE_AUDIT_DIMENSIONS, code, "A dimensão"),
    criterion: criterion(value.criterion, code),
    result: enumValue(value.result, COURSE_AUDIT_RESULTS, code, "O resultado"),
    publicEvidence: text(value.publicEvidence, 2000, 8192, code, "A evidência pública", {
      preserveLayout: true
    }),
    adequacy: enumValue(value.adequacy, COURSE_AUDIT_ADEQUACY, code, "A adequação"),
    planItemRefs: distinctList(value.planItemRefs, 16, (item) => planItemRef(item, code), code, "As referências de plano"),
    parameterRefs: distinctList(value.parameterRefs, 8, (item) => parameterRef(item, code), code, "As referências de parâmetro"),
    sourceLinks: normalizeCourseSourceLinks(value.sourceLinks)
  };
  if (new Set(normalized.planItemRefs.map(({ planItemId }) => planItemId)).size !==
        normalized.planItemRefs.length ||
      new Set(normalized.parameterRefs.map(({ parameterId }) => parameterId)).size !==
        normalized.parameterRefs.length) {
    fail(code, "O check repete uma referência de plano ou parâmetro.");
  }
  const expectedAdequacy = {
    passed: "sufficient",
    failed: "insufficient",
    uncertain: "uncertain",
    not_applicable: "not_applicable",
    not_checked: "not_assessed"
  }[normalized.result];
  if (normalized.adequacy !== expectedAdequacy) fail(code, "Resultado e adequação do check divergem.");
  if (normalized.dimension === "factual_quality" && ["passed", "failed"].includes(normalized.result)) {
    const allowed = new Set(normalized.criterion.code === "quotation_fidelity"
      ? ["supported_by", "quoted_from"] : ["supported_by"]);
    if (normalized.result === "passed" && !normalized.sourceLinks.length ||
        normalized.sourceLinks.some((link) => !allowed.has(link.relation))) {
      fail(code, "Conclusão factual positiva exige Fonte e Âncora exatas com relação supported_by; quoted_from só verifica fidelidade de citação.");
    }
  }
  return normalized;
}

function auditChecks(value, { server = false } = {}) {
  const code = "invalid_course_audit_checks";
  const maximum = server ? 32 : 31;
  if (!Array.isArray(value) || value.length < 3 || value.length > maximum) {
    fail(code, `Os checks precisam formar uma lista de 3 a ${maximum} itens.`);
  }
  const checks = value.map((item) => auditCheck(item, code));
  if (new Set(checks.map(({ checkId }) => checkId)).size !== checks.length) fail(code, "A rodada repete um check.");
  const required = server ? COURSE_AUDIT_DIMENSIONS : COURSE_AUDIT_HUMAN_DIMENSIONS;
  if (required.some((dimension) => !checks.some((check) => check.dimension === dimension)) ||
      !server && checks.some((check) => check.dimension === "structural_conformance")) {
    fail(code, server
      ? "A rodada de servidor precisa explicitar as quatro dimensões."
      : "O cliente explicita as três dimensões humanas; a dimensão estrutural pertence ao servidor.");
  }
  return checks;
}

function annotationRef(value, code, { projected = false } = {}) {
  exact(value, projected
    ? ["annotationId", "annotationVersion", "available", "deepLink"]
    : ["annotationId", "annotationVersion"], code, "A referência de observação");
  const normalized = {
    annotationId: uuid(value.annotationId, code, "A identidade da observação"),
    annotationVersion: integer(value.annotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da observação")
  };
  if (projected) {
    if (typeof value.available !== "boolean") fail(code, "A disponibilidade da observação é inválida.");
    normalized.available = value.available;
    normalized.deepLink = text(value.deepLink, 2048, 8192, code, "O link da observação", { nullable: true });
    if (!normalized.available && normalized.deepLink !== null) fail(code, "Observação removida não possui link.");
  }
  return normalized;
}

function findingInput(value, checkMap, code) {
  exact(value, ["findingId", "checkId", "code", "severity", "annotationRefs"], code, "O achado novo");
  const checkId = uuid(value.checkId, code, "A identidade do check do achado");
  if (!checkMap.has(checkId) || !["failed", "uncertain"].includes(checkMap.get(checkId).result)) {
    fail(code, "O achado precisa pertencer a um check falho ou incerto da rodada.");
  }
  return {
    findingId: uuid(value.findingId, code, "A identidade do achado"),
    checkId,
    code: codeValue(value.code, code, "O código do achado"),
    severity: enumValue(value.severity, COURSE_AUDIT_SEVERITIES, code, "A gravidade"),
    annotationRefs: distinctList(
      value.annotationRefs, 12, (item) => annotationRef(item, code), code, "As observações vinculadas"
    )
  };
}

function relationFreeContent(value, code, label) {
  if (!object(value)) fail(code, `${label} precisa ser um objeto.`);
  const forbidden = ["id", "position", "modules", "lessons", "microsequences", "studyUnits", "cards"]
    .find((field) => Object.hasOwn(value, field));
  if (forbidden) fail(code, `${label} contém o campo relacional ${forbidden}.`, { field: forbidden });
  byteBound(value, 49152, code, label);
  return clone(value);
}

function commandRefs(command, code, { correction = true } = {}) {
  const normalized = {
    type: command.type,
    findingId: uuid(command.findingId, code, "A identidade do achado"),
    expectedFindingVersion: integer(command.expectedFindingVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão esperada do achado")
  };
  if (correction) {
    normalized.correctionId = uuid(command.correctionId, code, "A identidade da correção");
    normalized.expectedCorrectionVersion = integer(command.expectedCorrectionVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão esperada da correção");
  }
  return normalized;
}

function normalizeCommand(value, { server = false } = {}) {
  const command = clone(value);
  const code = "invalid_course_audit_cycle_command";
  if (!object(command) || !COURSE_AUDIT_COMMAND_TYPES.includes(command.type)) {
    fail(code, "O comando do ciclo de auditoria é inválido.");
  }
  let normalized;
  if (command.type === "record_audit") {
    exact(command, [
      "type", "auditRunId", "targetStudyUnitId", "contextHash", "origin", "method", "checks", "findings"
    ], code, "O comando record_audit");
    const checks = auditChecks(command.checks, { server });
    const checkMap = new Map(checks.map((check) => [check.checkId, check]));
    const maximumFindings = server ? 16 : 15;
    if (!Array.isArray(command.findings) || command.findings.length > maximumFindings) {
      fail(code, `A rodada aceita até ${maximumFindings} achados.`);
    }
    const findings = command.findings.map((item) => findingInput(item, checkMap, code));
    if (new Set(findings.map(({ findingId }) => findingId)).size !== findings.length ||
        new Set(findings.map((finding) => finding.checkId)).size !== findings.length) {
      fail(code, "A rodada repete um achado ou abre mais de um achado para o mesmo check.");
    }
    if (new Set(findings.flatMap((finding) =>
      finding.annotationRefs.map(({ annotationId }) => annotationId)
    )).size > 12) {
      fail(code, "A rodada excede as 12 observações do contexto focal.");
    }
    normalized = {
      type: command.type,
      auditRunId: uuid(command.auditRunId, code, "A identidade da rodada"),
      targetStudyUnitId: opaqueId(command.targetStudyUnitId, code, "A identidade da Unidade de estudo"),
      contextHash: sha256(command.contextHash, code, "O hash do contexto"),
      origin: enumValue(command.origin, COURSE_AUDIT_ORIGINS, code, "A origem"),
      method: method(command.method, code),
      checks,
      findings
    };
  } else if (command.type === "propose_authoring_correction") {
    exact(command, [
      "type", "correctionId", "findingId", "expectedFindingVersion", "expectedCorrectionVersion",
      "afterContent", "afterSourceLinks", "rationale"
    ], code, "O comando propose_authoring_correction");
    normalized = {
      type: command.type,
      correctionId: uuid(command.correctionId, code, "A identidade da correção"),
      findingId: uuid(command.findingId, code, "A identidade do achado"),
      expectedFindingVersion: integer(command.expectedFindingVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão esperada do achado"),
      expectedCorrectionVersion: integer(command.expectedCorrectionVersion, 0, Number.MAX_SAFE_INTEGER, code, "A versão esperada da correção"),
      afterContent: relationFreeContent(command.afterContent, code, "O conteúdo posterior"),
      afterSourceLinks: normalizeCourseSourceLinks(command.afterSourceLinks),
      rationale: text(command.rationale, 2000, 8192, code, "A justificativa da correção", { preserveLayout: true })
    };
    byteBound(
      { content: normalized.afterContent, sourceLinks: normalized.afterSourceLinks },
      49152,
      "course_authoring_correction_snapshot_too_large",
      "O snapshot posterior da correção"
    );
  } else if (command.type === "decide_finding") {
    exact(command, ["type", "findingId", "expectedFindingVersion", "decision"], code, "O comando decide_finding");
    normalized = {
      ...commandRefs(command, code, { correction: false }),
      decision: enumValue(command.decision, ["dismiss", "reopen"], code, "A decisão")
    };
  } else if ([
    "reject_authoring_correction", "apply_authoring_correction", "rollback_authoring_correction"
  ].includes(command.type)) {
    exact(command, [
      "type", "findingId", "expectedFindingVersion", "correctionId", "expectedCorrectionVersion"
    ], code, `O comando ${command.type}`);
    normalized = commandRefs(command, code);
  } else {
    exact(command, [
      "type", "auditRunId", "findingId", "expectedFindingVersion", "correctionId",
      "expectedCorrectionVersion", "contextHash", "origin", "method", "checks", "outcome"
    ], code, "O comando verify_finding");
    normalized = {
      ...commandRefs(command, code),
      auditRunId: uuid(command.auditRunId, code, "A identidade da rodada de verificação"),
      contextHash: sha256(command.contextHash, code, "O hash do contexto"),
      origin: enumValue(command.origin, COURSE_AUDIT_ORIGINS, code, "A origem"),
      method: method(command.method, code),
      checks: auditChecks(command.checks, { server }),
      outcome: enumValue(command.outcome, ["resolved", "still_open"], code, "O resultado da verificação")
    };
  }
  byteBound(normalized, 196608, "course_audit_cycle_command_too_large", "O comando de auditoria");
  return normalized;
}

export function normalizeCourseAuditCycleCommand(value) {
  return normalizeCommand(value, { server: false });
}

export function normalizeCourseAuditCycleServerCommand(value) {
  return normalizeCommand(value, { server: true });
}

function enumList(value, allowed, maximum, code, label) {
  if (!Array.isArray(value) || value.length > maximum ||
      value.some((item) => !allowed.includes(item)) || new Set(value).size !== value.length) {
    fail(code, `${label} precisa formar uma lista válida.`);
  }
  return [...value];
}

export function normalizeCourseAuditCycleQuery(value) {
  const query = clone(value);
  const code = "invalid_course_audit_cycle_query";
  exact(query, [
    "mode", "targetStudyUnitId", "findingId", "correctionId", "auditRunId", "states",
    "dimensions", "severities", "annotationIds"
  ], code, "A consulta do ciclo de auditoria");
  const normalized = {
    mode: enumValue(query.mode, ["context", "findings", "runs", "detail"], code, "O modo"),
    targetStudyUnitId: query.targetStudyUnitId === null ? null :
      opaqueId(query.targetStudyUnitId, code, "A identidade da Unidade de estudo"),
    findingId: nullableUuid(query.findingId, code, "A identidade do achado"),
    correctionId: nullableUuid(query.correctionId, code, "A identidade da correção"),
    auditRunId: nullableUuid(query.auditRunId, code, "A identidade da rodada"),
    states: enumList(query.states, COURSE_AUDIT_FINDING_STATES, 4, code, "Os estados"),
    dimensions: enumList(query.dimensions, COURSE_AUDIT_DIMENSIONS, 4, code, "As dimensões"),
    severities: enumList(query.severities, COURSE_AUDIT_SEVERITIES, 4, code, "As gravidades"),
    annotationIds: distinctList(
      query.annotationIds, 12, (id) => uuid(id, code, "A identidade da observação"),
      code, "As observações selecionadas"
    )
  };
  const hasFilters = normalized.states.length || normalized.dimensions.length || normalized.severities.length;
  if (normalized.mode === "context" && (
    normalized.targetStudyUnitId === null || normalized.findingId !== null ||
    normalized.correctionId !== null || normalized.auditRunId !== null || hasFilters
  ) || normalized.mode === "findings" && (
    normalized.findingId !== null || normalized.correctionId !== null ||
    normalized.auditRunId !== null || normalized.annotationIds.length
  ) || normalized.mode === "runs" && (
    normalized.findingId !== null || normalized.correctionId !== null ||
    normalized.auditRunId !== null || hasFilters || normalized.annotationIds.length
  ) || normalized.mode === "detail" && (
    normalized.targetStudyUnitId !== null ||
    (normalized.findingId === null) === (normalized.auditRunId === null) ||
    normalized.findingId === null && normalized.correctionId !== null ||
    hasFilters || normalized.annotationIds.length
  )) {
    fail(code, "O modo da consulta contém alvo ou filtro ausente ou em excesso.");
  }
  byteBound(normalized, 16384, "course_audit_cycle_query_too_large", "A consulta de auditoria");
  return normalized;
}

export function normalizeCourseAuditCycleReadOptions(value) {
  const options = clone(value);
  const code = "invalid_course_audit_cycle_read_options";
  exact(options, [
    "expectedCourseRevision", "auditSetVersion", "query", "cursor", "limit"
  ], code, "As opções de leitura da auditoria");
  const query = normalizeCourseAuditCycleQuery(options.query);
  const cursor = options.cursor === null ? null : (() => {
    if (typeof options.cursor !== "string" || options.cursor.length > 240 || !CURSOR_PATTERN.test(options.cursor)) {
      fail(code, "O cursor é inválido.");
    }
    return options.cursor;
  })();
  if (!["findings", "runs"].includes(query.mode) && cursor !== null) {
    fail(code, "Somente listas de achados ou rodadas aceitam cursor.");
  }
  const normalized = {
    expectedCourseRevision: integer(
      options.expectedCourseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão esperada do Curso"
    ),
    auditSetVersion: options.auditSetVersion === null ? null : integer(
      options.auditSetVersion, 0, Number.MAX_SAFE_INTEGER, code, "A versão do conjunto de auditoria"
    ),
    query,
    cursor,
    limit: integer(options.limit, 1, 24, code, "O limite da página")
  };
  byteBound(normalized, 16384, "course_audit_cycle_read_options_too_large", "As opções de leitura");
  return normalized;
}

function deepLink(value, code, label) {
  return text(value, 2048, 8192, code, label, { nullable: true });
}

function pathEntry(value, code) {
  exact(value, ["kind", "id", "label", "version"], code, "Uma entrada do caminho");
  return {
    kind: enumValue(value.kind, [
      "course", "module", "lesson", "didactic_microsequence", "study_unit"
    ], code, "O tipo do caminho"),
    id: value.kind === "course"
      ? uuid(value.id, code, "A identidade do Curso no caminho")
      : opaqueId(value.id, code, "A identidade no caminho"),
    label: text(value.label, 300, 1200, code, "O rótulo no caminho", {
      nullable: true,
      preserveLayout: true
    }),
    version: value.version === null ? null : integer(
      value.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão no caminho"
    )
  };
}

function pathValue(value, courseId, studyUnitId, code) {
  if (!Array.isArray(value) || value.length !== 5) fail(code, "O caminho da Unidade de estudo é inválido.");
  const path = value.map((entry) => pathEntry(entry, code));
  const kinds = ["course", "module", "lesson", "didactic_microsequence", "study_unit"];
  if (path.some((entry, index) => entry.kind !== kinds[index]) ||
      path[0].id !== courseId || path.at(-1).id !== studyUnitId) {
    fail(code, "O caminho não liga o Curso à Unidade de estudo.");
  }
  return path;
}

function sourceAnchor(value, code) {
  exact(value, [
    "anchorId", "anchorRevision", "status", "selector", "verificationExcerpt", "anchorHash", "deepLink"
  ], code, "Uma Âncora de evidência");
  return {
    anchorId: opaqueId(value.anchorId, code, "A identidade da Âncora"),
    anchorRevision: integer(value.anchorRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão da Âncora"),
    status: enumValue(value.status, ["active", "retired"], code, "O estado da Âncora"),
    selector: normalizeCourseSourceSelector(value.selector),
    verificationExcerpt: text(
      value.verificationExcerpt, 2000, 8192, code, "O trecho de verificação",
      { nullable: true, preserveLayout: true }
    ),
    anchorHash: sha256(value.anchorHash, code, "O hash da Âncora"),
    deepLink: deepLink(value.deepLink, code, "O link da Âncora")
  };
}

function sourceEvidence(value, code) {
  exact(value, [
    "sourceId", "sourceRevision", "status", "kind", "title", "authorship",
    "publicationDate", "identifier", "language", "citationText", "url",
    "editionOrVersion", "origin", "availability", "verificationStatus",
    "studyVisibility", "relation", "sourceHash", "anchors", "deepLink"
  ], code, "Uma Fonte de evidência");
  const anchors = distinctList(
    value.anchors, 8, (anchor) => sourceAnchor(anchor, code), code, "As Âncoras da Fonte"
  );
  const status = enumValue(value.status, ["active", "retired", "unresolved_legacy"], code, "O estado da Fonte");
  if (status === "unresolved_legacy" && (
    value.kind !== null || value.title !== null || value.authorship !== null ||
    value.publicationDate !== null || value.identifier !== null || value.language !== null ||
    value.citationText !== null || value.url !== null || value.editionOrVersion !== null ||
    value.origin !== "imported_legacy" || value.availability !== "unknown" ||
    value.verificationStatus !== "unverified" || value.studyVisibility !== "hidden" || anchors.length
  )) {
    fail(code, "A Fonte resolvida ou legada não resolvida possui metadados incoerentes.");
  }
  let metadata = null;
  if (status !== "unresolved_legacy") {
    try {
      metadata = normalizeCourseSourceCommand({
        type: "save_source",
        sourceId: "audit-source",
        expectedSourceRevision: 0,
        source: {
          kind: value.kind,
          title: value.title,
          authorship: value.authorship,
          publicationDate: value.publicationDate,
          identifier: value.identifier,
          language: value.language,
          citationText: value.citationText,
          url: value.url,
          editionOrVersion: value.editionOrVersion,
          origin: value.origin,
          availability: value.availability,
          verificationStatus: value.verificationStatus,
          studyVisibility: value.studyVisibility
        }
      }).source;
    } catch {
      fail(code, "A Fonte de evidência possui metadados inválidos.");
    }
  }
  return {
    sourceId: literalSourceId(value.sourceId, code, "A identidade da Fonte"),
    sourceRevision: integer(value.sourceRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão da Fonte"),
    status,
    kind: metadata?.kind ?? null,
    title: metadata?.title ?? null,
    authorship: metadata?.authorship ?? null,
    publicationDate: metadata?.publicationDate ?? null,
    identifier: metadata?.identifier ?? null,
    language: metadata?.language ?? null,
    citationText: metadata?.citationText ?? null,
    url: metadata?.url ?? null,
    editionOrVersion: metadata?.editionOrVersion ?? null,
    origin: metadata?.origin ?? value.origin,
    availability: metadata?.availability ?? value.availability,
    verificationStatus: metadata?.verificationStatus ?? value.verificationStatus,
    studyVisibility: metadata?.studyVisibility ?? value.studyVisibility,
    relation: enumValue(value.relation, [
      ...COURSE_SOURCE_RELATIONS, "legacy_reference"
    ], code, "A relação da Fonte"),
    sourceHash: sha256(value.sourceHash, code, "O hash da Fonte"),
    anchors,
    deepLink: deepLink(value.deepLink, code, "O link da Fonte")
  };
}

function selectedAnnotation(value, code) {
  exact(value, [
    "annotationId", "annotationVersion", "state", "category", "rawText", "briefSummary", "target", "deepLink"
  ], code, "Uma observação selecionada");
  exact(value.target, ["kind", "id"], code, "O alvo da observação selecionada");
  const normalized = {
    annotationId: uuid(value.annotationId, code, "A identidade da observação"),
    annotationVersion: integer(value.annotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da observação"),
    state: enumValue(value.state, ["open", "considered", "resolved", "withdrawn"], code, "O estado da observação"),
    category: enumValue(value.category, ["question", "possible_error", "confusing", "suggestion"], code, "A categoria", { nullable: true }),
    rawText: text(value.rawText, 2000, 16384, code, "O texto da observação", { nullable: true, preserveLayout: true }),
    briefSummary: text(value.briefSummary, 500, 4096, code, "A síntese da observação", { nullable: true, preserveLayout: true }),
    target: {
      kind: enumValue(value.target.kind, [
        "course", "module", "lesson", "topic", "didactic_microsequence", "study_unit"
      ], code, "O tipo do alvo da observação"),
      id: value.target.kind === "course"
        ? uuid(value.target.id, code, "A identidade do Curso observado")
        : opaqueId(value.target.id, code, "A identidade do alvo observado")
    },
    deepLink: deepLink(value.deepLink, code, "O link da observação")
  };
  if (normalized.state === "withdrawn" && (
    normalized.rawText !== null || normalized.briefSummary !== null
  )) fail(code, "Observação retirada não pode expor texto ou síntese.");
  return normalized;
}

function contextContent(value, maximumBytes, code, label) {
  if (!object(value)) fail(code, `${label} precisa ser um objeto.`);
  const forbidden = ["id", "position", "modules", "lessons", "microsequences", "studyUnits", "cards"]
    .find((field) => Object.hasOwn(value, field));
  if (forbidden) fail(code, `${label} contém o campo relacional ${forbidden}.`);
  byteBound(value, maximumBytes, code, label);
  return value;
}

function sourceScope(value, code) {
  if (value === null) return null;
  exact(value, ["kind", "ref"], code, "O escopo de origem");
  return {
    kind: enumValue(value.kind, [
      "course", "module", "lesson", "didactic_microsequence"
    ], code, "O tipo do escopo de origem"),
    ref: value.kind === "course"
      ? uuid(value.ref, code, "A identidade do Curso de origem")
      : opaqueId(value.ref, code, "A referência do escopo de origem")
  };
}

function planContext(value, code) {
  exact(value, [
    "planId", "version", "audience", "instructionalScope", "authoringGuidance", "items"
  ], code, "O plano do contexto");
  if (!Array.isArray(value.items) || value.items.length > 16) fail(code, "Os itens de plano excedem o limite focal.");
  const items = value.items.map((item) => {
    exact(item, [
      "planItemId", "kind", "position", "statement", "version", "sourceLinks"
    ], code, "Um item de plano do contexto");
    return {
      planItemId: uuid(item.planItemId, code, "A identidade do item de plano"),
      kind: enumValue(item.kind, [
        "intended_learning_outcome", "instructional_analysis_unit", "evidence_requirement"
      ], code, "O tipo do item de plano"),
      position: integer(item.position, 0, Number.MAX_SAFE_INTEGER, code, "A posição do item de plano"),
      statement: text(item.statement, 2000, 4096, code, "O enunciado do item de plano", { preserveLayout: true }),
      version: integer(item.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão do item de plano"),
      sourceLinks: normalizeCourseSourceLinks(item.sourceLinks, { allowLegacyIds: true })
    };
  });
  if (new Set(items.map(({ planItemId }) => planItemId)).size !== items.length) fail(code, "O plano repete um item.");
  const normalized = {
    planId: uuid(value.planId, code, "A identidade do plano"),
    version: integer(value.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão do plano"),
    audience: text(value.audience, 4000, 4096, code, "O público", { preserveLayout: true, allowEmpty: true }),
    instructionalScope: text(value.instructionalScope, 8000, 8192, code, "O escopo instrucional", { preserveLayout: true, allowEmpty: true }),
    authoringGuidance: text(value.authoringGuidance, 8192, 8192, code, "A orientação de Autoria", { preserveLayout: true, allowEmpty: true }),
    items
  };
  byteBound(normalized, 32768, code, "O plano focal do contexto");
  return normalized;
}

function designContext(value, code) {
  exact(value, ["parameters", "guidance", "componentPolicy"], code, "O desenho efetivo");
  if (!Array.isArray(value.parameters) || value.parameters.length > 8 ||
      !Array.isArray(value.guidance) || value.guidance.length > 4) {
    fail(code, "O desenho efetivo excede seus limites.");
  }
  const parameters = value.parameters.map((entry) => {
    exact(entry, [
      "parameterId", "value", "origin", "reason", "sourceScope", "inherited"
    ], code, "Um parâmetro efetivo");
    if (typeof entry.inherited !== "boolean") fail(code, "A herança do parâmetro é inválida.");
    byteBound(entry.value, 2048, code, "O valor do parâmetro");
    return {
      parameterId: (() => {
        const parameterId = text(entry.parameterId, 160, 640, code, "A identidade do parâmetro");
        if (!PARAMETER_ID_PATTERN.test(parameterId)) fail(code, "A identidade do parâmetro é inválida.");
        return parameterId;
      })(),
      value: entry.value,
      origin: text(entry.origin, 80, 320, code, "A origem do parâmetro"),
      reason: text(entry.reason, 1000, 4096, code, "A justificativa do parâmetro", { preserveLayout: true }),
      sourceScope: sourceScope(entry.sourceScope, code),
      inherited: entry.inherited
    };
  });
  const guidance = value.guidance.map((entry) => {
    exact(entry, [
      "revisionId", "guidance", "origin", "reason", "sourceScope"
    ], code, "Uma orientação efetiva");
    return {
      revisionId: uuid(entry.revisionId, code, "A identidade da orientação"),
      guidance: text(entry.guidance, 4096, 4096, code, "A orientação", { preserveLayout: true }),
      origin: text(entry.origin, 80, 320, code, "A origem da orientação"),
      reason: text(entry.reason, 1000, 4096, code, "A justificativa da orientação", { preserveLayout: true }),
      sourceScope: sourceScope(entry.sourceScope, code)
    };
  });
  const policy = value.componentPolicy;
  exact(policy, [
    "changeId", "policy", "origin", "reason", "sourceScope", "inherited"
  ], code, "A política de componentes");
  exact(policy.policy, [
    "availability", "allowedRefs", "excludedRefs", "preferredRefs"
  ], code, "O valor da política de componentes");
  if (typeof policy.inherited !== "boolean") fail(code, "A herança da política é inválida.");
  const componentRefs = (items, label) => distinctList(
    items, 64, (ref) => text(ref, 200, 800, code, label), code, label
  );
  const changeId = policy.changeId === null ? null : text(policy.changeId, 19, 19, code, "A mudança da política");
  if (changeId !== null && !DECIMAL_ID_PATTERN.test(changeId)) fail(code, "A mudança da política é inválida.");
  const normalized = {
    parameters,
    guidance,
    componentPolicy: {
      changeId,
      policy: {
        availability: enumValue(policy.policy.availability, ["all", "allow_only"], code, "A disponibilidade"),
        allowedRefs: componentRefs(policy.policy.allowedRefs, "Os componentes permitidos"),
        excludedRefs: componentRefs(policy.policy.excludedRefs, "Os componentes excluídos"),
        preferredRefs: componentRefs(policy.policy.preferredRefs, "Os componentes preferidos")
      },
      origin: text(policy.origin, 80, 320, code, "A origem da política"),
      reason: text(policy.reason, 1000, 4096, code, "A justificativa da política", { preserveLayout: true }),
      sourceScope: sourceScope(policy.sourceScope, code),
      inherited: policy.inherited
    }
  };
  byteBound(normalized, 24576, code, "O desenho focal do contexto");
  return normalized;
}

function catalogIntent(value, code) {
  exact(value, [
    "query", "slot", "studyUnitRole", "disciplineIds", "structureIds", "taskOperationIds",
    "practiceModeIds", "knowledgeObjects", "mustPreserve", "notationIsLearningObject"
  ], code, "A intenção representacional");
  const strings = (items, maximum, label) => distinctList(
    items, maximum, (item) => text(item, 240, 960, code, label), code, label
  );
  if (!["", "content", "response", "feedback"].includes(value.slot) ||
      !["", "theory", "practice"].includes(value.studyUnitRole) ||
      typeof value.notationIsLearningObject !== "boolean") {
    fail(code, "A intenção representacional possui slot, papel ou notação inválidos.");
  }
  return {
    query: text(value.query, 500, 2000, code, "A busca representacional", { allowEmpty: true }),
    slot: value.slot,
    studyUnitRole: value.studyUnitRole,
    disciplineIds: strings(value.disciplineIds, 16, "As disciplinas"),
    structureIds: strings(value.structureIds, 16, "As estruturas"),
    taskOperationIds: strings(value.taskOperationIds, 16, "As operações-alvo"),
    practiceModeIds: strings(value.practiceModeIds, 16, "As modalidades de prática"),
    knowledgeObjects: strings(value.knowledgeObjects, 32, "Os objetos de conhecimento"),
    mustPreserve: strings(value.mustPreserve, 32, "As estruturas a preservar"),
    notationIsLearningObject: value.notationIsLearningObject
  };
}

function auditContext(value, courseId) {
  const code = "invalid_course_audit_cycle_page";
  exact(value, [
    "contract", "contextHash", "target", "didacticMicrosequence", "plan", "design",
    "intent", "sources", "annotations", "facts"
  ], code, "O contexto da auditoria");
  if (value.contract !== COURSE_AUDIT_CONTEXT_CONTRACT) fail(code, "O contrato do contexto é inválido.");
  exact(value.target, [
    "studyUnitId", "version", "hash", "position", "path", "content", "sourceLinks"
  ], code, "A Unidade de estudo-alvo");
  const studyUnitId = opaqueId(value.target.studyUnitId, code, "A identidade da Unidade de estudo");
  const target = {
    studyUnitId,
    version: integer(value.target.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão da Unidade de estudo"),
    hash: sha256(value.target.hash, code, "O hash da Unidade de estudo"),
    position: integer(value.target.position, 1, Number.MAX_SAFE_INTEGER, code, "A posição da Unidade de estudo"),
    path: pathValue(value.target.path, courseId, studyUnitId, code),
    content: contextContent(value.target.content, 65536, code, "O conteúdo da Unidade de estudo"),
    sourceLinks: normalizeCourseSourceLinks(value.target.sourceLinks, { allowLegacyIds: true })
  };
  exact(value.didacticMicrosequence, ["id", "version", "hash", "content"], code, "A microssequência didática");
  const micro = {
    id: opaqueId(value.didacticMicrosequence.id, code, "A identidade da microssequência"),
    version: integer(value.didacticMicrosequence.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão da microssequência"),
    hash: sha256(value.didacticMicrosequence.hash, code, "O hash da microssequência"),
    content: contextContent(value.didacticMicrosequence.content, 8192, code, "O conteúdo da microssequência")
  };
  if (target.path[3].id !== micro.id || target.path[3].version !== micro.version) {
    fail(code, "A microssequência não corresponde ao caminho do alvo.");
  }
  if (!Array.isArray(value.sources) || value.sources.length > 32 ||
      !Array.isArray(value.annotations) || value.annotations.length > 12) {
    fail(code, "Fontes ou observações do contexto excedem o limite.");
  }
  const sources = value.sources.map((source) => sourceEvidence(source, code));
  const annotations = value.annotations.map((annotation) => selectedAnnotation(annotation, code));
  byteBound(target, 98304, code, "O alvo focal do contexto");
  byteBound(sources, 49152, code, "As evidências de Fonte do contexto");
  byteBound(annotations, 16384, code, "As observações selecionadas do contexto");
  exact(value.facts, [
    "courseRevision", "targetVersion", "targetHash", "sourceLinksHash", "planVersion"
  ], code, "Os fatos SQL do contexto");
  const plan = planContext(value.plan, code);
  const facts = {
    courseRevision: integer(value.facts.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão factual do Curso"),
    targetVersion: integer(value.facts.targetVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão factual do alvo"),
    targetHash: sha256(value.facts.targetHash, code, "O hash factual do alvo"),
    sourceLinksHash: sha256(value.facts.sourceLinksHash, code, "O hash factual da proveniência"),
    planVersion: integer(value.facts.planVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão factual do plano")
  };
  if (facts.targetVersion !== target.version || facts.targetHash !== target.hash || facts.planVersion !== plan.version) {
    fail(code, "Os fatos SQL divergem das projeções do contexto.");
  }
  const normalized = {
    contract: value.contract,
    contextHash: sha256(value.contextHash, code, "O hash do contexto"),
    target,
    didacticMicrosequence: micro,
    plan,
    design: designContext(value.design, code),
    intent: catalogIntent(value.intent, code),
    sources,
    annotations,
    facts
  };
  byteBound(normalized, 220000, code, "O contexto focal de auditoria");
  return normalized;
}

function resultCounts(value, code, label) {
  exact(value, COURSE_AUDIT_RESULTS, code, label);
  const normalized = {};
  for (const result of COURSE_AUDIT_RESULTS) {
    normalized[result] = integer(value[result], 0, Number.MAX_SAFE_INTEGER, code, `${label}: ${result}`);
  }
  return normalized;
}

function auditRun(value, courseId) {
  const code = "invalid_course_audit_cycle_page";
  exact(value, [
    "contract", "auditRunId", "runKind", "origin", "method", "courseRevision",
    "contextHash", "target", "checks", "metrics", "createdAt"
  ], code, "Uma rodada de auditoria");
  if (value.contract !== COURSE_INSTRUCTIONAL_AUDIT_RUN_CONTRACT) fail(code, "O contrato da rodada é inválido.");
  exact(value.target, ["studyUnitId", "version", "hash", "path"], code, "O alvo da rodada");
  exact(value.metrics, ["checksTotal", "byResult", "findingsCreated"], code, "As métricas da rodada");
  const checks = auditChecks(value.checks, { server: true });
  const byResult = resultCounts(value.metrics.byResult, code, "Os resultados da rodada");
  if (value.metrics.checksTotal !== checks.length ||
      Object.values(byResult).reduce((sum, count) => sum + count, 0) !== checks.length ||
      COURSE_AUDIT_RESULTS.some((result) => byResult[result] !== checks.filter((check) => check.result === result).length)) {
    fail(code, "As métricas não correspondem aos checks da rodada.");
  }
  const studyUnitId = opaqueId(value.target.studyUnitId, code, "A identidade da Unidade auditada");
  return {
    contract: value.contract,
    auditRunId: uuid(value.auditRunId, code, "A identidade da rodada"),
    runKind: enumValue(value.runKind, COURSE_AUDIT_RUN_KINDS, code, "O tipo da rodada"),
    origin: enumValue(value.origin, COURSE_AUDIT_ORIGINS, code, "A origem da rodada"),
    method: method(value.method, code),
    courseRevision: integer(value.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão auditada do Curso"),
    contextHash: sha256(value.contextHash, code, "O hash do contexto da rodada"),
    target: {
      studyUnitId,
      version: integer(value.target.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão da Unidade auditada"),
      hash: sha256(value.target.hash, code, "O hash da Unidade auditada"),
      path: pathValue(value.target.path, courseId, studyUnitId, code)
    },
    checks,
    metrics: {
      checksTotal: value.metrics.checksTotal,
      byResult,
      findingsCreated: integer(value.metrics.findingsCreated, 0, 16, code, "Os achados criados")
    },
    createdAt: timestamp(value.createdAt, code, "A criação da rodada")
  };
}

function auditRunSummary(value) {
  const code = "invalid_course_audit_cycle_page";
  exact(value, [
    "auditRunId", "runKind", "origin", "method", "courseRevision", "target",
    "resultCounts", "findingsCreated", "createdAt", "deepLink"
  ], code, "Um resumo de rodada de auditoria");
  exact(value.target, ["studyUnitId", "version", "hash"], code, "O alvo resumido da rodada");
  const resultCountsValue = resultCounts(value.resultCounts, code, "Os resultados resumidos da rodada");
  const checksTotal = Object.values(resultCountsValue).reduce((sum, count) => sum + count, 0);
  if (checksTotal < 4 || checksTotal > 32) {
    fail(code, "O resumo da rodada possui contagem de checks inválida.");
  }
  return {
    auditRunId: uuid(value.auditRunId, code, "A identidade da rodada resumida"),
    runKind: enumValue(value.runKind, COURSE_AUDIT_RUN_KINDS, code, "O tipo da rodada resumida"),
    origin: enumValue(value.origin, COURSE_AUDIT_ORIGINS, code, "A origem da rodada resumida"),
    method: method(value.method, code),
    courseRevision: integer(value.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão da rodada resumida"),
    target: {
      studyUnitId: opaqueId(value.target.studyUnitId, code, "A identidade do alvo resumido"),
      version: integer(value.target.version, 1, Number.MAX_SAFE_INTEGER, code, "A versão do alvo resumido"),
      hash: sha256(value.target.hash, code, "O hash do alvo resumido")
    },
    resultCounts: resultCountsValue,
    findingsCreated: integer(value.findingsCreated, 0, 16, code, "Os achados criados pela rodada"),
    createdAt: timestamp(value.createdAt, code, "A criação da rodada resumida"),
    deepLink: deepLink(value.deepLink, code, "O link da rodada resumida")
  };
}

function findingItem(value) {
  const code = "invalid_course_audit_cycle_page";
  exact(value, [
    "contract", "findingId", "findingVersion", "courseId", "status", "origin", "code", "severity",
    "target", "auditRun", "check", "annotationRefs", "correctionRef", "timestamps", "capabilities", "deepLinks"
  ], code, "Um achado de auditoria");
  if (value.contract !== COURSE_AUDIT_FINDING_CONTRACT) fail(code, "O contrato do achado é inválido.");
  const courseId = uuid(value.courseId, code, "A identidade do Curso do achado");
  exact(value.target, [
    "studyUnitId", "observedVersion", "observedHash", "currentAvailable", "currentVersion", "currentHash", "path"
  ], code, "O alvo do achado");
  const studyUnitId = opaqueId(value.target.studyUnitId, code, "A identidade da Unidade do achado");
  if (typeof value.target.currentAvailable !== "boolean" ||
      value.target.currentAvailable !== (value.target.currentVersion !== null && value.target.currentHash !== null)) {
    fail(code, "A disponibilidade corrente do alvo é incoerente.");
  }
  exact(value.auditRun, ["auditRunId", "runKind", "courseRevision", "createdAt"], code, "A referência da rodada");
  const check = auditCheck(value.check, code);
  if (!["failed", "uncertain"].includes(check.result)) fail(code, "Um achado exige check falho ou incerto.");
  if (!Array.isArray(value.annotationRefs) || value.annotationRefs.length > 12) fail(code, "Os vínculos de observação excedem o limite.");
  const annotationRefs = value.annotationRefs.map((ref) => annotationRef(ref, code, { projected: true }));
  let correctionRef = null;
  if (value.correctionRef !== null) {
    exact(value.correctionRef, ["correctionId", "correctionVersion", "status"], code, "A referência da correção");
    correctionRef = {
      correctionId: uuid(value.correctionRef.correctionId, code, "A identidade da correção"),
      correctionVersion: integer(value.correctionRef.correctionVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da correção"),
      status: enumValue(value.correctionRef.status, COURSE_AUTHORING_CORRECTION_STATES, code, "O estado da correção")
    };
  }
  exact(value.timestamps, ["createdAt", "updatedAt", "resolvedAt", "dismissedAt"], code, "Os instantes do achado");
  const timestamps = {};
  for (const field of Object.keys(value.timestamps)) {
    timestamps[field] = timestamp(value.timestamps[field], code, `O instante ${field}`, {
      nullable: ["resolvedAt", "dismissedAt"].includes(field)
    });
  }
  exact(value.capabilities, [
    "canDismiss", "canReopen", "canProposeCorrection", "canVerify"
  ], code, "As capacidades do achado");
  if (Object.values(value.capabilities).some((allowed) => typeof allowed !== "boolean")) {
    fail(code, "As capacidades do achado são inválidas.");
  }
  exact(value.deepLinks, ["detail", "target"], code, "Os links do achado");
  return {
    contract: value.contract,
    findingId: uuid(value.findingId, code, "A identidade do achado"),
    findingVersion: integer(value.findingVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão do achado"),
    courseId,
    status: enumValue(value.status, COURSE_AUDIT_FINDING_STATES, code, "O estado do achado"),
    origin: enumValue(value.origin, COURSE_AUDIT_ORIGINS, code, "A origem do achado"),
    code: codeValue(value.code, code, "O código do achado"),
    severity: enumValue(value.severity, COURSE_AUDIT_SEVERITIES, code, "A gravidade do achado"),
    target: {
      studyUnitId,
      observedVersion: integer(value.target.observedVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão observada"),
      observedHash: sha256(value.target.observedHash, code, "O hash observado"),
      currentAvailable: value.target.currentAvailable,
      currentVersion: value.target.currentVersion === null ? null : integer(
        value.target.currentVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão corrente"
      ),
      currentHash: value.target.currentHash === null ? null : sha256(value.target.currentHash, code, "O hash corrente"),
      path: pathValue(value.target.path, courseId, studyUnitId, code)
    },
    auditRun: {
      auditRunId: uuid(value.auditRun.auditRunId, code, "A identidade da rodada de origem"),
      runKind: enumValue(value.auditRun.runKind, COURSE_AUDIT_RUN_KINDS, code, "O tipo da rodada de origem"),
      courseRevision: integer(value.auditRun.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão da rodada de origem"),
      createdAt: timestamp(value.auditRun.createdAt, code, "A criação da rodada de origem")
    },
    check,
    annotationRefs,
    correctionRef,
    timestamps,
    capabilities: { ...value.capabilities },
    deepLinks: {
      detail: deepLink(value.deepLinks.detail, code, "O link do achado"),
      target: deepLink(value.deepLinks.target, code, "O link do alvo")
    }
  };
}

function correctionSnapshot(value, code, label, { allowLegacyIds = false } = {}) {
  exact(value, ["content", "sourceLinks", "hash"], code, label);
  const normalized = {
    content: relationFreeContent(value.content, code, `O conteúdo de ${label}`),
    sourceLinks: normalizeCourseSourceLinks(value.sourceLinks, { allowLegacyIds }),
    hash: sha256(value.hash, code, `O hash de ${label}`)
  };
  byteBound(normalized, 49152, code, label);
  return normalized;
}

function correctionItem(value) {
  const code = "invalid_course_audit_cycle_page";
  exact(value, [
    "contract", "correctionId", "correctionVersion", "courseId", "findingId", "status", "target",
    "checkpoint", "rationale", "application", "verification", "rollback", "timestamps", "capabilities", "deepLink"
  ], code, "Uma correção autoral");
  if (value.contract !== COURSE_AUTHORING_CORRECTION_CONTRACT) fail(code, "O contrato da correção é inválido.");
  exact(value.target, ["studyUnitId", "baseVersion", "baseHash"], code, "O alvo da correção");
  exact(value.checkpoint, ["before", "after"], code, "O checkpoint da correção");
  const checkpoint = {
    before: correctionSnapshot(value.checkpoint.before, code, "snapshot anterior", {
      allowLegacyIds: true
    }),
    after: correctionSnapshot(value.checkpoint.after, code, "snapshot posterior")
  };
  byteBound(checkpoint, 98304, code, "O checkpoint da correção");
  const mutationFact = (fact, kind) => {
    if (fact === null) return null;
    const fields = kind === "verification"
      ? ["auditRunId", "outcome", "verifiedAt"]
      : kind === "application"
        ? ["courseRevision", "targetVersion", "targetHash", "appliedAt"]
        : ["courseRevision", "targetVersion", "targetHash", "rolledBackAt"];
    exact(fact, fields, code, `O fato de ${kind}`);
    if (kind === "verification") return {
      auditRunId: uuid(fact.auditRunId, code, "A rodada de verificação"),
      outcome: enumValue(fact.outcome, ["resolved", "still_open"], code, "O resultado da verificação"),
      verifiedAt: timestamp(fact.verifiedAt, code, "A verificação")
    };
    const at = kind === "application" ? "appliedAt" : "rolledBackAt";
    return {
      courseRevision: integer(fact.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão resultante"),
      targetVersion: integer(fact.targetVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão resultante do alvo"),
      targetHash: sha256(fact.targetHash, code, "O hash resultante do alvo"),
      [at]: timestamp(fact[at], code, kind === "application" ? "A aplicação" : "O rollback")
    };
  };
  exact(value.timestamps, ["createdAt", "updatedAt"], code, "Os instantes da correção");
  exact(value.capabilities, [
    "canAdjust", "canReject", "canApply", "canVerify", "canRollback"
  ], code, "As capacidades da correção");
  if (Object.values(value.capabilities).some((allowed) => typeof allowed !== "boolean")) {
    fail(code, "As capacidades da correção são inválidas.");
  }
  return {
    contract: value.contract,
    correctionId: uuid(value.correctionId, code, "A identidade da correção"),
    correctionVersion: integer(value.correctionVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da correção"),
    courseId: uuid(value.courseId, code, "A identidade do Curso da correção"),
    findingId: uuid(value.findingId, code, "A identidade do achado corrigido"),
    status: enumValue(value.status, COURSE_AUTHORING_CORRECTION_STATES, code, "O estado da correção"),
    target: {
      studyUnitId: opaqueId(value.target.studyUnitId, code, "A identidade da Unidade corrigida"),
      baseVersion: integer(value.target.baseVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão-base"),
      baseHash: sha256(value.target.baseHash, code, "O hash-base")
    },
    checkpoint,
    rationale: text(value.rationale, 2000, 8192, code, "A justificativa", { preserveLayout: true }),
    application: mutationFact(value.application, "application"),
    verification: mutationFact(value.verification, "verification"),
    rollback: mutationFact(value.rollback, "rollback"),
    timestamps: {
      createdAt: timestamp(value.timestamps.createdAt, code, "A criação da correção"),
      updatedAt: timestamp(value.timestamps.updatedAt, code, "A atualização da correção")
    },
    capabilities: { ...value.capabilities },
    deepLink: deepLink(value.deepLink, code, "O link da correção")
  };
}

function findingHistoryEntry(value, code) {
  exact(value, [
    "findingVersion", "status", "decision", "correctionId", "verificationAuditRunId", "createdAt"
  ], code, "Uma versão histórica do achado");
  return {
    findingVersion: integer(value.findingVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão histórica do achado"),
    status: enumValue(value.status, COURSE_AUDIT_FINDING_STATES, code, "O estado histórico do achado"),
    decision: enumValue(value.decision, [
      "recorded", "dismissed", "reopened", "correction_applied", "resolved", "still_open", "rolled_back"
    ], code, "A transição histórica"),
    correctionId: nullableUuid(value.correctionId, code, "A correção histórica"),
    verificationAuditRunId: nullableUuid(value.verificationAuditRunId, code, "A rodada histórica de verificação"),
    createdAt: timestamp(value.createdAt, code, "A criação da versão do achado")
  };
}

function correctionSummary(value, code, { history = false } = {}) {
  exact(value, history
    ? ["correctionId", "correctionVersion", "status", "rationale", "createdAt"]
    : ["correctionId", "correctionVersion", "status", "rationale", "updatedAt", "deepLink"],
  code, history ? "Uma versão histórica da correção" : "Um resumo de correção");
  const normalized = {
    correctionId: uuid(value.correctionId, code, "A identidade da correção resumida"),
    correctionVersion: integer(value.correctionVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da correção resumida"),
    status: enumValue(value.status, COURSE_AUTHORING_CORRECTION_STATES, code, "O estado da correção resumida"),
    rationale: text(value.rationale, 2000, 8192, code, "A justificativa resumida", { preserveLayout: true })
  };
  if (history) normalized.createdAt = timestamp(value.createdAt, code, "A criação da versão da correção");
  else {
    normalized.updatedAt = timestamp(value.updatedAt, code, "A atualização da correção resumida");
    normalized.deepLink = deepLink(value.deepLink, code, "O link da correção resumida");
  }
  return normalized;
}

function auditDetail(value, courseId, selectedCorrectionId) {
  const code = "invalid_course_audit_cycle_page";
  exact(value, [
    "finding", "findingHistory", "auditRuns", "corrections", "selectedCorrection", "selectedCorrectionHistory"
  ], code, "O detalhe do ciclo de auditoria");
  const finding = findingItem(value.finding);
  if (finding.courseId !== courseId || !Array.isArray(value.findingHistory) || value.findingHistory.length > 16 ||
      !Array.isArray(value.auditRuns) || value.auditRuns.length > 8 ||
      !Array.isArray(value.corrections) || value.corrections.length > 8 ||
      !Array.isArray(value.selectedCorrectionHistory) || value.selectedCorrectionHistory.length > 16) {
    fail(code, "O detalhe excede os limites ou pertence a outro Curso.");
  }
  const findingHistory = value.findingHistory.map((entry) => findingHistoryEntry(entry, code));
  const auditRuns = value.auditRuns.map((run) => auditRun(run, courseId));
  const corrections = value.corrections.map((item) => correctionSummary(item, code));
  const selectedCorrection = value.selectedCorrection === null ? null : correctionItem(value.selectedCorrection);
  const selectedCorrectionHistory = value.selectedCorrectionHistory.map((item) => (
    correctionSummary(item, code, { history: true })
  ));
  if (selectedCorrection !== null && (
    selectedCorrection.courseId !== courseId || selectedCorrection.findingId !== finding.findingId ||
    selectedCorrectionId !== null && selectedCorrection.correctionId !== selectedCorrectionId
  ) || selectedCorrection === null && selectedCorrectionHistory.length ||
      selectedCorrection !== null && selectedCorrectionHistory.some((item) => item.correctionId !== selectedCorrection.correctionId)) {
    fail(code, "A correção selecionada não pertence ao detalhe.");
  }
  return { finding, findingHistory, auditRuns, corrections, selectedCorrection, selectedCorrectionHistory };
}

function countMap(value, keys, code, label) {
  exact(value, keys, code, label);
  return Object.fromEntries(keys.map((key) => [
    key,
    integer(value[key], 0, Number.MAX_SAFE_INTEGER, code, `${label}: ${key}`)
  ]));
}

export function normalizeCourseAuditCyclePage(value) {
  const page = clone(value);
  const code = "invalid_course_audit_cycle_page";
  exact(page, [
    "contract", "courseId", "courseRevision", "auditSetVersion", "query", "summary",
    "context", "items", "runs", "detail", "runDetail", "hasMore", "nextCursor"
  ], code, "A página do ciclo de auditoria");
  if (page.contract !== COURSE_AUDIT_CYCLE_PAGE_CONTRACT) fail(code, "O contrato da página é inválido.");
  const courseId = uuid(page.courseId, code, "A identidade do Curso");
  const query = normalizeCourseAuditCycleQuery(page.query);
  exact(page.summary, ["matchingTotal", "byState", "byDimension", "bySeverity"], code, "O resumo da auditoria");
  const summary = {
    matchingTotal: integer(page.summary.matchingTotal, 0, Number.MAX_SAFE_INTEGER, code, "O total correspondente"),
    byState: countMap(page.summary.byState, COURSE_AUDIT_FINDING_STATES, code, "Os achados por estado"),
    byDimension: countMap(page.summary.byDimension, COURSE_AUDIT_DIMENSIONS, code, "Os achados por dimensão"),
    bySeverity: countMap(page.summary.bySeverity, COURSE_AUDIT_SEVERITIES, code, "Os achados por gravidade")
  };
  if (!Array.isArray(page.items) || page.items.length > 24 ||
      !Array.isArray(page.runs) || page.runs.length > 24 || typeof page.hasMore !== "boolean" ||
      page.hasMore !== (page.nextCursor !== null)) fail(code, "A paginação de achados é inválida.");
  const items = page.items.map(findingItem);
  if (items.some((item) => item.courseId !== courseId)) fail(code, "A página contém achado de outro Curso.");
  const runs = page.runs.map((run) => auditRunSummary(run));
  const context = page.context === null ? null : auditContext(page.context, courseId);
  const detail = page.detail === null ? null : auditDetail(page.detail, courseId, query.correctionId);
  const runDetail = page.runDetail === null ? null : auditRun(page.runDetail, courseId);
  if (query.mode === "context" && (
    context === null || items.length || runs.length || detail !== null || runDetail !== null || page.hasMore
  ) || query.mode === "findings" && (
    context !== null || runs.length || detail !== null || runDetail !== null
  ) || query.mode === "runs" && (
    context !== null || items.length || detail !== null || runDetail !== null
  ) || query.mode === "detail" && (
    context !== null || items.length || runs.length || page.hasMore ||
    query.findingId !== null && (detail === null || runDetail !== null) ||
    query.auditRunId !== null && (detail !== null || runDetail === null)
  ) ||
      query.mode === "context" && context?.target.studyUnitId !== query.targetStudyUnitId ||
      query.mode === "detail" && query.findingId !== null && detail?.finding.findingId !== query.findingId ||
      query.mode === "detail" && query.auditRunId !== null && runDetail?.auditRunId !== query.auditRunId) {
    fail(code, "O conteúdo da página não corresponde ao modo da consulta.");
  }
  if (page.nextCursor !== null && (
    typeof page.nextCursor !== "string" || page.nextCursor.length > 240 || !CURSOR_PATTERN.test(page.nextCursor)
  )) fail(code, "O próximo cursor é inválido.");
  const normalized = {
    contract: page.contract,
    courseId,
    courseRevision: integer(page.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão do Curso"),
    auditSetVersion: integer(page.auditSetVersion, 0, Number.MAX_SAFE_INTEGER, code, "A versão do conjunto"),
    query,
    summary,
    context,
    items,
    runs,
    detail,
    runDetail,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor
  };
  byteBound(normalized, 245760, "course_audit_cycle_page_too_large", "A página do ciclo de auditoria");
  return normalized;
}

function changeFact(value, code) {
  if (value === null) return null;
  exact(value, ["type", "auditRunId", "findingRefs", "correctionRef"], code, "O fato da mudança");
  if (!COURSE_AUDIT_COMMAND_TYPES.includes(value.type) || !Array.isArray(value.findingRefs) || value.findingRefs.length > 16) {
    fail(code, "O tipo ou os achados da mudança são inválidos.");
  }
  const findingRefs = value.findingRefs.map((ref) => {
    exact(ref, ["findingId", "findingVersion"], code, "A referência de achado alterado");
    return {
      findingId: uuid(ref.findingId, code, "A identidade do achado alterado"),
      findingVersion: integer(ref.findingVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão do achado alterado")
    };
  });
  let correctionRef = null;
  if (value.correctionRef !== null) {
    exact(value.correctionRef, ["correctionId", "correctionVersion"], code, "A correção alterada");
    correctionRef = {
      correctionId: uuid(value.correctionRef.correctionId, code, "A identidade da correção alterada"),
      correctionVersion: integer(value.correctionRef.correctionVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da correção alterada")
    };
  }
  return {
    type: value.type,
    auditRunId: nullableUuid(value.auditRunId, code, "A identidade da rodada alterada"),
    findingRefs,
    correctionRef
  };
}

export function normalizeCourseAuditCycleChange(value) {
  const change = clone(value);
  const code = "invalid_course_audit_cycle_change";
  exact(change, [
    "contract", "courseId", "courseRevision", "auditSetVersion", "requestId", "idempotent",
    "changed", "change", "finding", "correction", "suggestedAnnotationActions"
  ], code, "A mudança do ciclo de auditoria");
  if (change.contract !== COURSE_AUDIT_CYCLE_CHANGE_CONTRACT ||
      typeof change.requestId !== "string" || !REQUEST_ID_PATTERN.test(change.requestId) ||
      typeof change.idempotent !== "boolean" || typeof change.changed !== "boolean" ||
      change.changed !== (change.change !== null)) {
    fail(code, "O envelope da mudança é inválido.");
  }
  const courseId = uuid(change.courseId, code, "A identidade do Curso");
  const fact = changeFact(change.change, code);
  const finding = change.finding === null ? null : findingItem(change.finding);
  const correction = change.correction === null ? null : correctionItem(change.correction);
  if (finding !== null && finding.courseId !== courseId || correction !== null && correction.courseId !== courseId) {
    fail(code, "A mudança projeta item de outro Curso.");
  }
  if (!Array.isArray(change.suggestedAnnotationActions) || change.suggestedAnnotationActions.length > 12) {
    fail(code, "As sugestões de ação sobre observações excedem o limite.");
  }
  const suggestedAnnotationActions = change.suggestedAnnotationActions.map((action) => {
    exact(action, ["annotationId", "annotationVersion", "action"], code, "Uma sugestão de observação");
    return {
      annotationId: uuid(action.annotationId, code, "A identidade da observação sugerida"),
      annotationVersion: integer(action.annotationVersion, 1, Number.MAX_SAFE_INTEGER, code, "A versão da observação sugerida"),
      action: enumValue(action.action, ["resolve", "reopen"], code, "A ação sugerida")
    };
  });
  const normalized = {
    contract: change.contract,
    courseId,
    courseRevision: integer(change.courseRevision, 1, Number.MAX_SAFE_INTEGER, code, "A revisão do Curso"),
    auditSetVersion: integer(change.auditSetVersion, 0, Number.MAX_SAFE_INTEGER, code, "A versão do conjunto"),
    requestId: change.requestId,
    idempotent: change.idempotent,
    changed: change.changed,
    change: fact,
    finding,
    correction,
    suggestedAnnotationActions
  };
  byteBound(normalized, 245760, "course_audit_cycle_change_too_large", "A mudança do ciclo de auditoria");
  return normalized;
}
