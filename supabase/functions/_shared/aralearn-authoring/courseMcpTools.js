import { AuthoringApiError } from "./errors.js";
import {
  CourseAnchoredAnnotationsError,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../aralearn/runtime/domain/courseAnchoredAnnotations.js";
import {
  CourseAuditCycleError,
  normalizeCourseAuditCycleCommand,
  normalizeCourseAuditCycleReadOptions
} from "../aralearn/runtime/domain/courseAuditCycle.js";
import {
  CourseVariantError,
  normalizeCourseVariantCommand,
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantRead
} from "../aralearn/runtime/domain/courseVariants.js";
import {
  CourseAuthoringAnalyticsError,
  normalizeCourseAuthoringAnalyticsQuery
} from "../aralearn/runtime/domain/courseAuthoringAnalytics.js";
import {
  CourseSourcesError,
  normalizeCourseSourcePdfSourceIntent
} from "../aralearn/runtime/domain/courseSources.js";
import { courseMcpAppToolMeta } from "./courseMcpAppResource.js";
import {
  normalizeConversationalPdfSourceIntent,
  projectConversationalPdfSourceTool
} from
  "./conversationalPdfSourceProjection.js";
import {
  ANCHORED_ANNOTATIONS_REQUEST_TARGET_LIMIT_BYTES,
  AUDIT_CYCLE_REQUEST_TARGET_LIMIT_BYTES,
  AUTHORING_ANALYTICS_REQUEST_TARGET_LIMIT_BYTES,
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_PROTOCOL_V1_TOOLS,
  AUTHORING_PROTOCOL_V1_VOCABULARY,
  REQUEST_ID_PATTERN,
  UUID_PATTERN
} from "./authoringProtocolV1.js";

const MCP_OAUTH_SECURITY_SCHEMES = Object.freeze([
  Object.freeze({ type: "oauth2", scopes: Object.freeze(["offline_access"]) })
]);

export {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH,
  AUTHORING_PROTOCOL_V1_TOOLS,
  AUTHORING_PROTOCOL_V1_VOCABULARY
};

export const COURSE_MCP_TOOLS = Object.freeze(
  AUTHORING_PROTOCOL_V1_TOOLS.map((definition) => {
    const tool = projectConversationalPdfSourceTool(definition);
    const uiTool = new Set([
      "lerCurso",
      "consultarComponentesDidaticos"
    ]).has(definition.name);
    const fileTool = definition.name === "incorporarPdfComoFonte";
    return Object.freeze(uiTool || fileTool
      ? {
        ...tool,
        _meta: {
          ...(uiTool ? courseMcpAppToolMeta() : {}),
          ...(fileTool ? { "openai/fileParams": ["pdf"] } : {})
        }
      }
      : tool);
  })
);

const BY_NAME = new Map(COURSE_MCP_TOOLS.map((definition) => [definition.name, definition]));
const PROTOCOL_BY_NAME = new Map(
  AUTHORING_PROTOCOL_V1_TOOLS.map((definition) => [definition.name, definition])
);
const WRITE_TOOLS = new Set([
  "criarCurso", "alterarCurso", "incorporarPdfComoFonte"
]);
export const COURSE_APPLICATION_ONLY_TOOLS = Object.freeze([
  Object.freeze({ name: "gerirPessoas" }),
  Object.freeze({ name: "criarCopiaPessoalDoCurso" }),
  Object.freeze({ name: "manterCursos" }),
  Object.freeze({ name: "manterAraLearn" })
]);
const APPLICATION_BY_NAME = new Map([
  ...BY_NAME,
  ...COURSE_APPLICATION_ONLY_TOOLS.map((definition) => [definition.name, definition])
]);
const APPLICATION_WRITE_TOOLS = new Set([
  ...WRITE_TOOLS,
  ...COURSE_APPLICATION_ONLY_TOOLS.map(({ name }) => name)
]);

function fail(code, message, details = null) {
  throw new AuthoringApiError(422, code, message, details);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_tool_arguments", `${label} precisa ser um objeto.`);
  }
  return value;
}

function exactFields(value, allowed) {
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail("unknown_tool_argument", `O argumento ${unknown} não pertence à ferramenta.`, { field: unknown });
}

function requiredText(value, field, { maximum, optional = false } = {}) {
  if (value == null && optional) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if ((!normalized && !optional) || normalized.length > maximum) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function requiredOpaqueText(value, field, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum * 2 ||
      [...value].length > maximum ||
      new TextEncoder().encode(value).byteLength > maximum * 4 ||
      [...value].some((character) => {
        const point = character.codePointAt(0);
        return point < 32 || point >= 127 && point <= 159;
      })) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return value;
}

function requiredCourseSourceText(value, field, maximum) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized !== value || normalized.length > maximum * 2 ||
      [...normalized].length > maximum ||
      new TextEncoder().encode(normalized).byteLength > maximum * 4 ||
      [...normalized].some((character) => {
        const point = character.codePointAt(0);
        return point < 32 || point >= 127 && point <= 159;
      })) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function requiredUuid(value, field) {
  const normalized = requiredText(value, field, { maximum: 36 });
  if (!UUID_PATTERN.test(normalized)) fail("invalid_tool_argument", `${field} não contém UUID válido.`, { field });
  return normalized.toLowerCase();
}

function requiredRequestId(value) {
  const normalized = requiredText(value, "requestId", { maximum: 128 });
  if (!REQUEST_ID_PATTERN.test(normalized) && !UUID_PATTERN.test(normalized)) {
    fail("invalid_tool_argument", "requestId é inválido.", { field: "requestId" });
  }
  return normalized;
}

function positiveInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function nonNegativeInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > maximum) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function boundedJsonObject(value, field, maximumBytes) {
  const normalized = structuredClone(object(value, field));
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > maximumBytes) {
    fail("invalid_tool_argument", `${field} excede o limite.`, { field });
  }
  return normalized;
}

function normalizeCourseAnchoredAnnotationDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAnchoredAnnotationsError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseAuditCycleDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAuditCycleError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseSourcesDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseSourcesError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseVariantDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseVariantError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseAuthoringAnalyticsDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAuthoringAnalyticsError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message);
  }
}

function route(method, path, requestId = null, body = null) {
  return { kind: "route", method, path, requestId, body };
}

function boundedAnchoredAnnotationsReadRoute(path) {
  if (new TextEncoder().encode(path).byteLength >
      ANCHORED_ANNOTATIONS_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_anchored_annotations_query_too_large",
      "Os filtros de observação excedem o limite transportável de 8 KiB."
    );
  }
  return route("GET", path);
}

function boundedAuditCycleReadRoute(path) {
  if (new TextEncoder().encode(path).byteLength >
      AUDIT_CYCLE_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_audit_cycle_query_too_large",
      "Os filtros de auditoria excedem o limite transportável de 8 KiB."
    );
  }
  return route("GET", path);
}

function boundedCourseAuthoringAnalyticsReadRoute(path) {
  if (new TextEncoder().encode(path).byteLength >
      AUTHORING_ANALYTICS_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_authoring_analytics_query_too_large",
      "Os filtros de Pesquisa excedem o limite transportável de 8 KiB."
    );
  }
  return route("GET", path);
}

function searchParams(entries) {
  const params = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else if (value != null && value !== "") {
      params.set(key, String(value));
    }
  });
  const source = params.toString();
  return source ? `?${source}` : "";
}

function mapList(raw) {
  exactFields(raw, new Set(["query", "limit", "cursor"]));
  const query = raw.query == null ? "" : requiredText(raw.query, "query", { maximum: 120, optional: true });
  const limit = raw.limit == null ? 24 : positiveInteger(raw.limit, "limit", 50);
  let beforeUpdatedAt = null;
  let beforeId = null;
  if (raw.cursor != null) {
    const value = object(raw.cursor, "cursor");
    exactFields(value, new Set(["beforeUpdatedAt", "beforeId"]));
    beforeUpdatedAt = requiredText(value.beforeUpdatedAt, "beforeUpdatedAt", { maximum: 40 });
    beforeId = requiredUuid(value.beforeId, "beforeId");
  }
  return route("GET", `/v1/courses${searchParams({ query, limit, beforeUpdatedAt, beforeId })}`);
}

function mapRead(raw, {
  requireObservationTextDisclosure = true,
  requireAttachmentDownloadUrlDisclosure = true,
  allowAttachmentUploadPreparation = false,
  inspectionVersion = 2
} = {}) {
  exactFields(raw, new Set([
    "courseId", "view", "authoringPartId", "materializationId",
    "expectedRevision", "limit", "cursor", "scope", "anchorStudyUnitId",
    "direction", "maxBytes", "mode", "sourceId", "targetKind", "targetId",
    "annotationSetVersion", "origins", "channels", "states", "categories",
    "includeUncategorized", "subjectIds", "includeDescendants", "annotationId",
    "auditSetVersion", "targetStudyUnitId", "findingId", "correctionId", "auditRunId",
    "dimensions", "severities", "annotationIds", "comparisonSetId",
    "includeObservationText", "includeAttachmentDownloadUrl",
    "attachmentOperation", "sourceRevision", "contentHash", "byteSize", "mediaType",
    "datasets", "from", "to", "inspectionFocusId"
  ]));
  const courseId = requiredUuid(raw.courseId, "courseId");
  const view = raw.view == null ? "outline" : requiredText(raw.view, "view", { maximum: 32 });
  if (!new Set([
    "summary", "outline", "instructional_plan", "course_design",
    "course_sources", "course_source_attachment", "anchored_annotations", "part_materialization",
    "study_units", "entities", "audit_cycle", "research",
    "variant_comparison", "variant_comparisons"
  ]).has(view)) {
    fail("invalid_tool_argument", "view é inválida.", { field: "view" });
  }
  if (!["course_sources", "course_source_attachment", "anchored_annotations", "audit_cycle"].includes(view) && [
    raw.mode, raw.sourceId, raw.targetKind, raw.targetId
  ].some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu campos contextuais incompatíveis.");
  }
  if (!["course_sources", "course_source_attachment"].includes(view) && raw.sourceId != null) {
    fail("invalid_tool_argument", "sourceId pertence somente à leitura de Fontes.");
  }
  const annotationFields = [
    raw.annotationSetVersion, raw.categories,
    raw.includeUncategorized, raw.subjectIds, raw.includeDescendants, raw.annotationId
  ];
  if (view !== "anchored_annotations" && annotationFields.some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de observação incompatíveis.");
  }
  if (!["anchored_annotations", "audit_cycle", "research"].includes(view) && raw.states != null) {
    fail("invalid_tool_argument", "A leitura recebeu estados incompatíveis.");
  }
  if (!["anchored_annotations", "research"].includes(view) &&
      [raw.origins, raw.channels].some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de origem ou canal incompatíveis.");
  }
  if (view !== "research" && [raw.datasets, raw.from, raw.to].some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de Pesquisa incompatíveis.");
  }
  const auditFields = [
    raw.auditSetVersion, raw.targetStudyUnitId, raw.findingId, raw.correctionId, raw.auditRunId,
    raw.dimensions, raw.severities, raw.annotationIds
  ];
  if (view !== "audit_cycle" && auditFields.some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de auditoria incompatíveis.");
  }
  if (view !== "variant_comparison" && raw.comparisonSetId != null) {
    fail("invalid_tool_argument", "comparisonSetId pertence somente às variantes.");
  }
  if (view !== "study_units" && raw.inspectionFocusId != null) {
    fail("invalid_tool_argument", "inspectionFocusId pertence somente ao foco de inspeção.");
  }
  if (!["anchored_annotations", "audit_cycle"].includes(view) &&
      raw.includeObservationText != null) {
    fail(
      "invalid_tool_argument",
      "includeObservationText pertence somente às leituras de Observações.",
      { field: "includeObservationText" }
    );
  }
  const attachmentFields = [
    raw.attachmentOperation, raw.sourceRevision, raw.contentHash, raw.byteSize,
    raw.mediaType
  ];
  if (view !== "course_source_attachment" && attachmentFields.some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu campos de anexo incompatíveis.");
  }
  if (view !== "course_source_attachment" && raw.includeAttachmentDownloadUrl != null) {
    fail(
      "invalid_tool_argument",
      "includeAttachmentDownloadUrl pertence somente ao download de um anexo PDF.",
      { field: "includeAttachmentDownloadUrl" }
    );
  }
  if (view === "research") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null || raw.mode != null || raw.sourceId != null ||
        raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null) ||
        auditFields.some((value) => value != null) || raw.comparisonSetId != null) {
      fail("invalid_tool_argument", "A leitura de Pesquisa recebeu campos incompatíveis.");
    }
    const query = normalizeCourseAuthoringAnalyticsDomain(() =>
      normalizeCourseAuthoringAnalyticsQuery({
        ...(raw.datasets == null ? {} : { datasets: raw.datasets }),
        channels: raw.channels ?? [],
        origins: raw.origins ?? [],
        states: raw.states ?? [],
        from: raw.from ?? null,
        to: raw.to ?? null,
        limit: raw.limit ?? 100,
        cursor: raw.cursor ?? null
      })
    );
    return boundedCourseAuthoringAnalyticsReadRoute(
      `/v1/courses/${courseId}/research${searchParams({
        expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
        dataset: query.datasets,
        channel: query.channels,
        origin: query.origins,
        state: query.states,
        from: query.from,
        to: query.to,
        limit: query.limit,
        cursor: query.cursor
      })}`
    );
  }
  if (view === "variant_comparison") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.limit != null ||
        raw.cursor != null || raw.scope != null || raw.anchorStudyUnitId != null ||
        raw.direction != null || raw.maxBytes != null || raw.mode != null ||
        raw.sourceId != null || raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null) || auditFields.some((value) => value != null)) {
      fail("invalid_tool_argument", "A leitura de variantes recebeu campos incompatíveis.");
    }
    const options = normalizeCourseVariantDomain(() => normalizeCourseVariantRead({
      comparisonSetId: raw.comparisonSetId,
      expectedCourseRevision: raw.expectedRevision
    }));
    return route("GET", `/v1/courses/${courseId}/variant-comparisons/${options.comparisonSetId}` +
      searchParams({ expectedRevision: options.expectedCourseRevision }));
  }
  if (view === "variant_comparisons") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.limit != null ||
        raw.cursor != null || raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null || raw.mode != null || raw.sourceId != null || raw.targetKind != null ||
        raw.targetId != null || raw.comparisonSetId != null || annotationFields.some((value) => value != null) ||
        auditFields.some((value) => value != null)) {
      fail("invalid_tool_argument", "A lista de variantes recebeu campos incompatíveis.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    return route("GET", `/v1/courses/${courseId}/variant-comparisons` + searchParams({ expectedRevision }));
  }
  if (view === "anchored_annotations") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.scope != null ||
        raw.anchorStudyUnitId != null || raw.direction != null || raw.maxBytes != null ||
        raw.sourceId != null) {
      fail("invalid_tool_argument", "A leitura de observações recebeu campos incompatíveis.");
    }
    const hierarchyPresent = raw.targetKind != null || raw.targetId != null;
    if (hierarchyPresent && (raw.targetKind == null || raw.targetId == null) ||
        !hierarchyPresent && raw.includeDescendants != null) {
      fail("invalid_tool_argument", "O filtro hierárquico de observações está incompleto.");
    }
    const mode = raw.mode == null
      ? "inbox"
      : requiredText(raw.mode, "mode", { maximum: 16 });
    if (requireObservationTextDisclosure && mode === "detail" &&
        raw.includeObservationText !== true) {
      fail(
        "observation_text_disclosure_required",
        "A leitura de detalhe exige declarar includeObservationText=true porque o texto da Observação será enviado ao cliente MCP conectado.",
        { field: "includeObservationText" }
      );
    }
    if (mode !== "detail" && raw.includeObservationText != null) {
      fail(
        "invalid_tool_argument",
        "includeObservationText pertence somente à leitura de detalhe de uma Observação.",
        { field: "includeObservationText" }
      );
    }
    const query = normalizeCourseAnchoredAnnotationDomain(() =>
      normalizeCourseAnchoredAnnotationQuery({
        mode,
        origins: raw.origins ?? [],
        channels: raw.channels ?? [],
        states: raw.states ?? [],
        categories: raw.categories ?? [],
        includeUncategorized: raw.includeUncategorized ?? true,
        subjectIds: raw.subjectIds ?? [],
        hierarchy: hierarchyPresent
          ? {
              target: {
                kind: requiredText(raw.targetKind, "targetKind", { maximum: 32 }),
                id: raw.targetKind === "source"
                  ? requiredOpaqueText(raw.targetId, "targetId", 2_048)
                  : requiredCourseSourceText(raw.targetId, "targetId", 240)
              },
              includeDescendants: raw.includeDescendants ?? false
            }
          : null,
        annotationId: raw.annotationId == null
          ? null
          : requiredUuid(raw.annotationId, "annotationId")
      })
    );
    const options = normalizeCourseAnchoredAnnotationDomain(() =>
      normalizeCourseAnchoredAnnotationReadOptions({
        expectedCourseRevision: raw.expectedRevision,
        annotationSetVersion: raw.annotationSetVersion ?? null,
        query,
        cursor: raw.cursor ?? null,
        limit: raw.limit ?? 12
      })
    );
    return boundedAnchoredAnnotationsReadRoute(
      `/v1/courses/${courseId}/anchored-annotations${searchParams({
        expectedRevision: options.expectedCourseRevision,
        annotationSetVersion: options.annotationSetVersion,
        mode: query.mode,
        origin: query.origins,
        channel: query.channels,
        state: query.states,
        category: query.categories,
        includeUncategorized: query.includeUncategorized,
        subjectId: query.subjectIds,
        targetKind: query.hierarchy?.target.kind,
        targetId: query.hierarchy?.target.id,
        includeDescendants: query.hierarchy?.includeDescendants,
        annotationId: query.annotationId,
        cursor: options.cursor,
        limit: options.limit
      })}`
    );
  }
  if (view === "audit_cycle") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.scope != null ||
        raw.anchorStudyUnitId != null || raw.direction != null || raw.maxBytes != null ||
        raw.sourceId != null || raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null)) {
      fail("invalid_tool_argument", "A leitura de auditoria recebeu campos incompatíveis.");
    }
    const mode = raw.mode == null
      ? "findings"
      : requiredText(raw.mode, "mode", { maximum: 16 });
    const annotationIds = raw.annotationIds ?? [];
    if (requireObservationTextDisclosure && mode === "context" &&
        annotationIds.length > 0 && raw.includeObservationText !== true) {
      fail(
        "observation_text_disclosure_required",
        "O contexto de auditoria com Observações exige declarar includeObservationText=true porque os textos serão enviados ao cliente MCP conectado.",
        { field: "includeObservationText" }
      );
    }
    if ((mode !== "context" || annotationIds.length === 0) &&
        raw.includeObservationText != null) {
      fail(
        "invalid_tool_argument",
        "includeObservationText pertence somente ao contexto de auditoria com Observações selecionadas.",
        { field: "includeObservationText" }
      );
    }
    const options = normalizeCourseAuditCycleDomain(() =>
      normalizeCourseAuditCycleReadOptions({
        expectedCourseRevision: raw.expectedRevision,
        auditSetVersion: raw.auditSetVersion ?? null,
        query: {
          mode,
          targetStudyUnitId: raw.targetStudyUnitId ?? null,
          findingId: raw.findingId ?? null,
          correctionId: raw.correctionId ?? null,
          auditRunId: raw.auditRunId ?? null,
          states: raw.states ?? [],
          dimensions: raw.dimensions ?? [],
          severities: raw.severities ?? [],
          annotationIds
        },
        cursor: raw.cursor ?? null,
        limit: raw.limit ?? 12
      })
    );
    const query = options.query;
    return boundedAuditCycleReadRoute(
      `/v1/courses/${courseId}/audit-cycle${searchParams({
        expectedRevision: options.expectedCourseRevision,
        auditSetVersion: options.auditSetVersion,
        mode: query.mode,
        targetStudyUnitId: query.targetStudyUnitId,
        findingId: query.findingId,
        correctionId: query.correctionId,
        auditRunId: query.auditRunId,
        state: query.states,
        dimension: query.dimensions,
        severity: query.severities,
        annotationId: query.annotationIds,
        cursor: options.cursor,
        limit: options.limit
      })}`
    );
  }
  if (view === "course_design") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.expectedRevision != null || raw.anchorStudyUnitId != null ||
        raw.direction != null || raw.maxBytes != null) {
      fail("invalid_tool_argument", "A leitura dos parâmetros recebeu campos incompatíveis.");
    }
    const scope = raw.scope == null
      ? { kind: "course", ref: courseId }
      : object(raw.scope, "scope");
    exactFields(scope, new Set(["kind", "ref"]));
    const scopeKind = requiredText(scope.kind, "scope.kind", { maximum: 32 });
    if (!new Set([
      "course", "module", "lesson", "didactic_microsequence"
    ]).has(scopeKind)) {
      fail("invalid_tool_argument", "scope.kind é inválido.", { field: "scope.kind" });
    }
    const scopeRef = requiredText(scope.ref, "scope.ref", { maximum: 240 });
    if (scopeKind === "course" && scopeRef !== courseId) {
      fail("invalid_tool_argument", "scope.ref não identifica este Curso.", {
        field: "scope.ref"
      });
    }
    const limit = raw.limit == null ? 32 : positiveInteger(raw.limit, "limit", 64);
    const cursor = raw.cursor == null
      ? null
      : requiredText(raw.cursor, "cursor", { maximum: 240 });
    return route("GET", `/v1/courses/${courseId}/course-design${searchParams({
      scopeKind,
      scopeRef,
      limit,
      cursor
    })}`);
  }
  if (view === "course_source_attachment") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.limit != null || raw.cursor != null || raw.scope != null ||
        raw.anchorStudyUnitId != null || raw.direction != null || raw.maxBytes != null ||
        raw.mode != null || raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null) ||
        auditFields.some((value) => value != null) || raw.comparisonSetId != null) {
      fail("invalid_tool_argument", "A leitura do anexo recebeu campos incompatíveis.");
    }
    const operation = requiredText(
      raw.attachmentOperation,
      "attachmentOperation",
      { maximum: 24 }
    );
    if (!["prepare_upload", "download"].includes(operation)) {
      fail("invalid_tool_argument", "attachmentOperation é inválida.", {
        field: "attachmentOperation"
      });
    }
    if (operation === "prepare_upload" && !allowAttachmentUploadPreparation) {
      fail(
        "application_session_required",
        "O envio de PDF exige a sessão autenticada da aplicação.",
        { field: "attachmentOperation" }
      );
    }
    const contentHash = requiredText(raw.contentHash, "contentHash", { maximum: 64 });
    if (!/^[a-f0-9]{64}$/u.test(contentHash)) {
      fail("invalid_tool_argument", "contentHash é inválido.", { field: "contentHash" });
    }
    const byteSize = operation === "prepare_upload"
      ? positiveInteger(raw.byteSize, "byteSize", 20 * 1024 * 1024)
      : null;
    const mediaType = operation === "prepare_upload"
      ? requiredText(raw.mediaType, "mediaType", { maximum: 32 })
      : null;
    if (operation === "prepare_upload" && mediaType !== "application/pdf" ||
        operation === "download" && (raw.byteSize != null || raw.mediaType != null)) {
      fail("invalid_tool_argument", "Os metadados do anexo são inválidos.");
    }
    if (operation === "download" && requireAttachmentDownloadUrlDisclosure &&
        raw.includeAttachmentDownloadUrl !== true) {
      fail(
        "attachment_download_url_disclosure_required",
        "O download exige declarar includeAttachmentDownloadUrl=true porque uma URL assinada, válida por 60 segundos, será enviada ao cliente MCP conectado.",
        { field: "includeAttachmentDownloadUrl" }
      );
    }
    const attachmentDownloadDisclosureSupplied =
      raw.includeAttachmentDownloadUrl != null;
    if (attachmentDownloadDisclosureSupplied && (
      operation !== "download" || !requireAttachmentDownloadUrlDisclosure
    )) {
      fail(
        "invalid_tool_argument",
        "includeAttachmentDownloadUrl pertence somente ao download solicitado pela superfície MCP.",
        { field: "includeAttachmentDownloadUrl" }
      );
    }
    return route("GET", `/v1/courses/${courseId}/source-attachments/access${searchParams({
      expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      operation,
      sourceId: requiredOpaqueText(raw.sourceId, "sourceId", 2_048),
      sourceRevision: positiveInteger(raw.sourceRevision, "sourceRevision"),
      contentHash,
      byteSize,
      mediaType
    })}`);
  }
  if (view === "course_sources") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null) {
      fail("invalid_tool_argument", "A leitura de Fontes recebeu campos incompatíveis.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    const mode = raw.mode == null
      ? "catalog"
      : requiredText(raw.mode, "mode", { maximum: 16 });
    if (!new Set(["catalog", "source", "target"]).has(mode)) {
      fail("invalid_tool_argument", "mode é inválido.", { field: "mode" });
    }
    const sourceId = raw.sourceId == null
      ? null
      : requiredOpaqueText(raw.sourceId, "sourceId", 2_048);
    const targetKind = raw.targetKind == null
      ? null
      : requiredText(raw.targetKind, "targetKind", { maximum: 16 });
    const targetId = raw.targetId == null
      ? null
      : requiredCourseSourceText(raw.targetId, "targetId", 240);
    const hasTargetContext = targetKind !== null || targetId !== null;
    const validTargetContext = targetKind !== null && targetId !== null;
    if ((mode === "source") !== (sourceId !== null) ||
        mode === "catalog" && hasTargetContext ||
        mode === "target" && (sourceId !== null || !validTargetContext) ||
        mode === "source" && hasTargetContext && !validTargetContext ||
        (targetKind !== null && !new Set(["plan_item", "study_unit"]).has(targetKind)) ||
        (targetKind === "plan_item" && !UUID_PATTERN.test(targetId))) {
      fail("invalid_tool_argument", "A consulta de Fontes é inválida.");
    }
    const cursor = raw.cursor == null
      ? null
      : requiredText(raw.cursor, "cursor", { maximum: 240 });
    if (cursor != null && !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(cursor)) {
      fail("invalid_tool_argument", "cursor é inválido.", { field: "cursor" });
    }
    if (mode === "source" && hasTargetContext && cursor !== null) {
      fail("invalid_tool_argument", "A revisão contextual não aceita cursor.", {
        field: "cursor"
      });
    }
    const limit = raw.limit == null ? 10 : positiveInteger(raw.limit, "limit", 24);
    return route("GET", `/v1/courses/${courseId}/sources${searchParams({
      expectedRevision,
      mode,
      sourceId,
      targetKind,
      targetId,
      cursor,
      limit
    })}`);
  }
  if (view === "entities") {
    if (raw.authoringPartId != null || raw.materializationId != null) {
      fail("invalid_tool_argument", "Identidades de materialização não pertencem às entidades.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    const limit = raw.limit == null ? 50 : positiveInteger(raw.limit, "limit", 100);
    let afterEntityType = null;
    let afterEntityId = null;
    if (raw.cursor != null) {
      const cursor = object(raw.cursor, "cursor");
      exactFields(cursor, new Set(["entityType", "entityId"]));
      afterEntityType = requiredText(cursor.entityType, "entityType", { maximum: 40 });
      if (!new Set(["module", "lesson", "topic", "microsequence", "study_unit"]).has(afterEntityType)) {
        fail("invalid_tool_argument", "entityType é inválido.", { field: "cursor.entityType" });
      }
      afterEntityId = requiredText(cursor.entityId, "entityId", { maximum: 240 });
    }
    return route("GET", `/v1/courses/${courseId}/entities${searchParams({
      expectedRevision,
      limit,
      afterEntityType,
      afterEntityId
    })}`);
  }
  if (view === "study_units") {
    if (raw.authoringPartId != null || raw.materializationId != null) {
      fail("invalid_tool_argument", "Identidades de materialização não pertencem à inspeção.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    const limit = raw.limit == null ? 12 : positiveInteger(raw.limit, "limit", 24);
    const maxBytes = raw.maxBytes == null
      ? 512 * 1024
      : positiveInteger(raw.maxBytes, "maxBytes", 1_500_000);
    if (maxBytes < 64 * 1024) {
      fail("invalid_tool_argument", "maxBytes é inválido.", { field: "maxBytes" });
    }
    const direction = raw.direction == null
      ? "forward"
      : requiredText(raw.direction, "direction", { maximum: 8 });
    if (!new Set(["forward", "backward"]).has(direction)) {
      fail("invalid_tool_argument", "direction é inválida.", { field: "direction" });
    }
    let scopeKind = "course";
    let scopeId = null;
    if (raw.scope != null) {
      const scope = object(raw.scope, "scope");
      exactFields(scope, new Set(["kind", "id"]));
      scopeKind = requiredText(scope.kind, "scope.kind", { maximum: 32 });
      if (!new Set([
        "course", "authoring_part", "unassigned", "module", "lesson",
        "didactic_microsequence"
      ]).has(scopeKind)) {
        fail("invalid_tool_argument", "scope.kind é inválido.", { field: "scope.kind" });
      }
      const idless = scopeKind === "course" || scopeKind === "unassigned";
      if (idless) {
        if (scope.id != null) {
          fail("invalid_tool_argument", "scope.id não pertence a este escopo.", {
            field: "scope.id"
          });
        }
      } else {
        scopeId = scopeKind === "authoring_part"
          ? requiredUuid(scope.id, "scope.id")
          : requiredText(scope.id, "scope.id", { maximum: 240 });
      }
    }
    const anchorStudyUnitId = raw.anchorStudyUnitId == null
      ? null
      : requiredText(raw.anchorStudyUnitId, "anchorStudyUnitId", { maximum: 240 });
    let cursorStudyUnitId = null;
    if (raw.cursor != null) {
      if (anchorStudyUnitId != null) {
        fail("invalid_tool_argument", "Âncora e cursor são mutuamente exclusivos.");
      }
      const cursor = object(raw.cursor, "cursor");
      exactFields(cursor, new Set(["studyUnitId"]));
      cursorStudyUnitId = requiredText(cursor.studyUnitId, "cursor.studyUnitId", {
        maximum: 240
      });
    }
    const inspectionFocusId = raw.inspectionFocusId == null
      ? null
      : requiredUuid(raw.inspectionFocusId, "inspectionFocusId");
    if (inspectionFocusId != null && (raw.scope != null || anchorStudyUnitId != null)) {
      fail("invalid_tool_argument", "O foco substitui escopo e âncora na leitura das Unidades.");
    }
    const inspectionPath = inspectionFocusId == null
      ? `/v${inspectionVersion}/courses/${courseId}/study-units`
      : `/v1/courses/${courseId}/inspection-focuses/${inspectionFocusId}/study-units`;
    return route("GET", `${inspectionPath}${searchParams({
      expectedRevision,
      scopeKind,
      scopeId,
      anchorStudyUnitId,
      cursorStudyUnitId,
      direction,
      limit,
      maxBytes
    })}`);
  }
  if (view === "instructional_plan") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.expectedRevision != null || raw.limit != null || raw.cursor != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null) {
      fail("invalid_tool_argument", "Paginação não pertence ao plano instrucional.");
    }
    return route("GET", `/v1/courses/${courseId}/instructional-plan`);
  }
  if (view === "part_materialization") {
    if (raw.expectedRevision != null || raw.limit != null || raw.cursor != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null) {
      fail("invalid_tool_argument", "Paginação não pertence à materialização da Parte.");
    }
    const authoringPartId = requiredUuid(raw.authoringPartId, "authoringPartId");
    const materializationId = requiredUuid(raw.materializationId, "materializationId");
    return route(
      "GET",
      `/v1/courses/${courseId}/authoring-parts/${authoringPartId}` +
        `/materializations/${materializationId}`
    );
  }
  if (raw.authoringPartId != null || raw.materializationId != null ||
      raw.expectedRevision != null || raw.limit != null || raw.cursor != null ||
      raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
      raw.maxBytes != null) {
    fail("invalid_tool_argument", "A leitura recebeu campos incompatíveis com a vista.");
  }
  return route("GET", `/v1/courses/${courseId}${searchParams({ view })}`);
}

function mapCreate(raw) {
  exactFields(raw, new Set(["requestId", "title", "objective"]));
  const requestId = requiredRequestId(raw.requestId);
  return route("POST", "/v1/courses", requestId, {
    requestId,
    title: requiredText(raw.title, "title", { maximum: 300 }),
    objective: requiredText(raw.objective, "objective", { maximum: 2_000 })
  });
}

function mapCourseSourcePdfIngestion(raw) {
  exactFields(raw, new Set([
    "requestId", "courseId", "expectedRevision", "sourceIntent", "pdf"
  ]));
  const requestId = requiredRequestId(raw.requestId);
  const sourceIntent = normalizeCourseSourcesDomain(() =>
    normalizeCourseSourcePdfSourceIntent(
      normalizeConversationalPdfSourceIntent(
        boundedJsonObject(raw.sourceIntent, "sourceIntent", 16 * 1024)
      )
    )
  );
  return {
    kind: "course-source-pdf-ingestion",
    requestId,
    body: {
      requestId,
      courseId: requiredUuid(raw.courseId, "courseId"),
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      sourceIntent,
      pdf: boundedJsonObject(raw.pdf, "pdf", 12 * 1024)
    }
  };
}

function mapPersonalCourseCopy(raw) {
  exactFields(raw, new Set([
    "requestId", "sourceCourseId", "expectedSourceCourseRevision",
    "expectedStudyUnitVersion", "didacticMicrosequenceId", "studyUnit",
    "applicationOrigin"
  ]));
  const requestId = requiredRequestId(raw.requestId);
  const sourceCourseId = requiredUuid(raw.sourceCourseId, "sourceCourseId");
  const applicationOrigin = raw.applicationOrigin;
  if (!new Set(["manual", "provider_assistance"]).has(applicationOrigin)) {
    fail(
      "invalid_tool_argument",
      "applicationOrigin é inválida.",
      { field: "applicationOrigin" }
    );
  }
  return route(
    "POST",
    `/v1/courses/${sourceCourseId}/personal-copy/composition`,
    requestId,
    {
      requestId,
      sourceCourseId,
      expectedSourceCourseRevision: positiveInteger(
        raw.expectedSourceCourseRevision,
        "expectedSourceCourseRevision"
      ),
      expectedStudyUnitVersion: positiveInteger(
        raw.expectedStudyUnitVersion,
        "expectedStudyUnitVersion"
      ),
      didacticMicrosequenceId: requiredOpaqueText(
        raw.didacticMicrosequenceId,
        "didacticMicrosequenceId",
        240
      ),
      studyUnit: boundedJsonObject(raw.studyUnit, "studyUnit", 480 * 1024),
      applicationOrigin
    }
  );
}

function mapChange(raw, {
  requireAnnotationConfirmation = true,
  requireAuditConfirmation = true,
  allowApplicationCompositionMetadata = false,
  normalizeExternalDesignDecision = true
} = {}) {
  const allowedFields = new Set([
    "requestId", "courseId", "expectedRevision", "expectedPlanVersion",
    "operation", "planCommand", "designCommand", "materializationCommand",
    "sourceCommand", "annotationCommand", "auditCommand", "upserts", "deletes",
    "sourceAttributionApplications", "variantCommand", "inspectionFocus"
  ]);
  if (allowApplicationCompositionMetadata) {
    allowedFields.add("expectedStudyUnitVersion");
    allowedFields.add("applicationOrigin");
  }
  exactFields(raw, allowedFields);
  const requestId = requiredRequestId(raw.requestId);
  const courseId = requiredUuid(raw.courseId, "courseId");
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "update_instructional_plan",
    "update_course_design",
    "update_course_sources",
    "update_anchored_annotations",
    "update_audit_cycle",
    "update_course_variants",
    "commit_course_composition",
    "advance_part_materialization",
    "create_inspection_focus"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  if (operation !== "commit_course_composition" && (
    raw.expectedStudyUnitVersion != null || raw.applicationOrigin != null
  )) {
    fail(
      "invalid_tool_argument",
      "Os metadados da edição pertencem somente à composição contextual."
    );
  }
  if (operation !== "update_audit_cycle" && raw.auditCommand != null) {
    fail("invalid_tool_argument", "auditCommand pertence somente ao ciclo de auditoria.");
  }
  if (operation !== "update_course_variants" && raw.variantCommand != null) {
    fail("invalid_tool_argument", "variantCommand pertence somente às variantes.");
  }
  if (operation !== "create_inspection_focus" && raw.inspectionFocus != null) {
    fail("invalid_tool_argument", "inspectionFocus pertence somente à criação do foco.");
  }
  if (operation === "create_inspection_focus") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null || raw.annotationCommand != null ||
        raw.auditCommand != null || raw.variantCommand != null || raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null || raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "A criação do foco recebeu campos incompatíveis.");
    }
    const focus = object(raw.inspectionFocus, "inspectionFocus");
    exactFields(focus, new Set(["title", "studyUnitIds"]));
    const title = requiredText(focus.title, "inspectionFocus.title", { maximum: 160 });
    if (!Array.isArray(focus.studyUnitIds) ||
        focus.studyUnitIds.length < 1 || focus.studyUnitIds.length > 64) {
      fail("invalid_tool_argument", "O foco precisa conter de uma a 64 Unidades.");
    }
    const studyUnitIds = focus.studyUnitIds.map((value, index) =>
      requiredText(value, `inspectionFocus.studyUnitIds[${index}]`, { maximum: 240 })
    );
    if (new Set(studyUnitIds).size !== studyUnitIds.length) {
      fail("invalid_tool_argument", "O foco não aceita Unidades repetidas.");
    }
    return route("POST", `/v1/courses/${courseId}/inspection-focuses`, requestId, {
      requestId,
      expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      title,
      studyUnitIds
    });
  }
  if (operation === "update_course_variants") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null ||
        raw.annotationCommand != null || raw.auditCommand != null ||
        raw.materializationCommand != null || raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de variantes recebeu campos incompatíveis.");
    }
    const supplied = boundedJsonObject(raw.variantCommand, "variantCommand", 128 * 1024);
    const command = normalizeCourseVariantDomain(() =>
      supplied.type === "create_comparison_variants"
        ? normalizeCourseVariantCommand(supplied)
        : normalizeCourseVariantDetachCommand(supplied)
    );
    if (command.type === "create_comparison_variants") {
      const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
      if (expectedRevision !== command.expectedCourseRevision) {
        fail("invalid_tool_argument", "expectedRevision não corresponde ao comando de variantes.");
      }
      return route("POST", `/v1/courses/${courseId}/variant-comparisons/changes`, requestId, {
        requestId, expectedCourseRevision: expectedRevision, command
      });
    }
    if (raw.expectedRevision != null) {
      fail("invalid_tool_argument", "expectedRevision não pertence à desvinculação.");
    }
    return route("POST", `/v1/courses/${courseId}/variant-comparisons/changes`, requestId, {
      requestId, command
    });
  }
  if (operation === "update_audit_cycle") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null ||
        raw.annotationCommand != null || raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de auditoria recebeu campos incompatíveis.");
    }
    const supplied = boundedJsonObject(raw.auditCommand, "auditCommand", 192 * 1024);
    const requiresConfirmation = new Set([
      "apply_authoring_correction", "rollback_authoring_correction"
    ]).has(supplied.type);
    if (requiresConfirmation && requireAuditConfirmation && supplied.confirmed !== true) {
      fail(
        "authoring_correction_confirmation_required",
        "Confirme explicitamente antes de aplicar ou desfazer uma correção autoral."
      );
    }
    if ((!requiresConfirmation || !requireAuditConfirmation) &&
        Object.hasOwn(supplied, "confirmed")) {
      fail(
        "invalid_tool_argument",
        requireAuditConfirmation
          ? "confirmed pertence somente à aplicação ou ao rollback da correção."
          : "confirmed não pertence ao comando da interface."
      );
    }
    const commandInput = { ...supplied };
    delete commandInput.confirmed;
    const command = normalizeCourseAuditCycleDomain(() =>
      normalizeCourseAuditCycleCommand(
        commandInput
      )
    );
    return route("POST", `/v1/courses/${courseId}/audit-cycle/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      command
    });
  }
  if (operation === "update_instructional_plan") {
    if (raw.designCommand != null || raw.sourceCommand != null ||
        raw.annotationCommand != null || raw.materializationCommand != null || raw.upserts != null ||
        raw.deletes != null || raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando do plano recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.planCommand, "planCommand", 192 * 1024);
    return route("POST", `/v1/courses/${courseId}/instructional-plan/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      expectedPlanVersion: positiveInteger(raw.expectedPlanVersion, "expectedPlanVersion"),
      command
    });
  }
  if (operation === "update_course_design") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.sourceCommand != null || raw.annotationCommand != null ||
        raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando dos parâmetros recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.designCommand, "designCommand", 32 * 1024);
    if (normalizeExternalDesignDecision && command.type === "set_parameter") {
      const mode = requiredText(command.mode, "designCommand.mode", { maximum: 16 });
      if (!new Set(["automatic", "explicit"]).has(mode)) {
        fail("invalid_tool_argument", "designCommand.mode é inválido.", {
          field: "designCommand.mode"
        });
      }
      if (mode === "automatic") {
        if (command.origin != null) {
          fail(
            "invalid_tool_argument",
            "Uma decisão automática não recebe origin explícita.",
            { field: "designCommand.origin" }
          );
        }
        command.origin = "automatic";
      } else if (!new Set(["author", "research_condition"]).has(command.origin)) {
        fail(
          "invalid_tool_argument",
          "Uma decisão explícita exige origin author ou research_condition.",
          { field: "designCommand.origin" }
        );
      }
      delete command.mode;
    }
    return route("POST", `/v1/courses/${courseId}/course-design/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      command
    });
  }
  if (operation === "update_course_sources") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.annotationCommand != null ||
        raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de Fontes recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.sourceCommand, "sourceCommand", 192 * 1024);
    return route("POST", `/v1/courses/${courseId}/sources/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      command
    });
  }
  if (operation === "update_anchored_annotations") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null ||
        raw.materializationCommand != null || raw.upserts != null ||
        raw.deletes != null || raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de observação recebeu campos incompatíveis.");
    }
    const supplied = boundedJsonObject(
      raw.annotationCommand,
      "annotationCommand",
      32 * 1024
    );
    if (supplied.type === "create_anchored_annotation") {
      if (requireAnnotationConfirmation && (
        supplied.confirmed !== true || typeof supplied.briefSummary !== "string" ||
        !supplied.briefSummary.trim()
      )) {
        fail(
          "anchored_annotation_confirmation_required",
          "Confirme o alvo e informe uma síntese breve antes de registrar a observação."
        );
      }
      if (!requireAnnotationConfirmation && Object.hasOwn(supplied, "confirmed")) {
        fail("invalid_tool_argument", "confirmed não pertence ao comando da interface.");
      }
    } else if (Object.hasOwn(supplied, "confirmed")) {
      fail("invalid_tool_argument", "confirmed pertence somente à criação de observação.");
    }
    const commandInput = { ...supplied };
    delete commandInput.confirmed;
    const command = normalizeCourseAnchoredAnnotationDomain(() =>
      normalizeCourseAnchoredAnnotationCommand(commandInput)
    );
    const requiresCourseRevision = new Set([
      "create_anchored_annotation",
      "correct_anchored_annotation_subjects"
    ]).has(command.type);
    let expectedCourseRevision = null;
    if (requiresCourseRevision) {
      expectedCourseRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    } else if (raw.expectedRevision != null) {
      fail(
        "invalid_tool_argument",
        "expectedRevision não pertence a este comando de observação.",
        { field: "expectedRevision" }
      );
    }
    return route(
      "POST",
      `/v1/courses/${courseId}/anchored-annotations/changes`,
      requestId,
      { requestId, expectedCourseRevision, command }
    );
  }
  if (operation === "commit_course_composition") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null || raw.annotationCommand != null ||
        raw.materializationCommand != null) {
      fail("invalid_tool_argument", "A composição recebeu campos incompatíveis.");
    }
    const upserts = Array.isArray(raw.upserts) ? raw.upserts : [];
    const deletes = Array.isArray(raw.deletes) ? raw.deletes : [];
    const sourceAttributionApplications = Array.isArray(raw.sourceAttributionApplications)
      ? raw.sourceAttributionApplications
      : null;
    if (sourceAttributionApplications == null) {
      fail(
        "invalid_tool_argument",
        "A composição precisa declarar sourceAttributionApplications."
      );
    }
    if (!upserts.length && !deletes.length) {
      fail("invalid_tool_argument", "Informe entidades para inserir, alterar ou excluir.");
    }
    if (upserts.length > 200 || deletes.length > 200) {
      fail("invalid_tool_argument", "A alteração excede 200 entidades por grupo.");
    }
    const hasExpectedStudyUnitVersion = raw.expectedStudyUnitVersion != null;
    const hasApplicationOrigin = raw.applicationOrigin != null;
    if (allowApplicationCompositionMetadata &&
        hasExpectedStudyUnitVersion !== hasApplicationOrigin) {
      fail(
        "invalid_tool_argument",
        "A edição contextual precisa informar versão e origem em conjunto."
      );
    }
    const applicationMetadata = allowApplicationCompositionMetadata &&
      hasExpectedStudyUnitVersion
      ? {
          expectedStudyUnitVersion: positiveInteger(
            raw.expectedStudyUnitVersion,
            "expectedStudyUnitVersion"
          ),
          applicationOrigin: new Set(["manual", "provider_assistance"]).has(
            raw.applicationOrigin
          )
            ? raw.applicationOrigin
            : fail(
                "invalid_tool_argument",
                "applicationOrigin é inválida.",
                { field: "applicationOrigin" }
              )
        }
      : {};
    return route("POST", `/v1/courses/${courseId}/composition`, requestId, {
      requestId,
      expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      upserts,
      deletes,
      sourceAttributionApplications,
      ...applicationMetadata
    });
  }
  if (raw.expectedPlanVersion != null || raw.planCommand != null ||
      raw.designCommand != null || raw.sourceCommand != null || raw.annotationCommand != null ||
      raw.upserts != null ||
      raw.deletes != null || raw.sourceAttributionApplications != null) {
    fail("invalid_tool_argument", "A materialização recebeu campos incompatíveis.");
  }
  const command = boundedJsonObject(
    raw.materializationCommand,
    "materializationCommand",
    512 * 1024
  );
  const authoringPartId = requiredUuid(command.authoringPartId, "authoringPartId");
  const materializationId = requiredUuid(command.materializationId, "materializationId");
  command.operation = requiredText(command.operation, "materializationCommand.operation", {
    maximum: 20
  });
  if (!new Set(["start", "record_step", "finish"]).has(command.operation)) {
    fail("invalid_tool_argument", "A operação de materialização é inválida.");
  }
  const materializationBaseFields = [
    "operation", "authoringPartId", "materializationId",
    "expectedMaterializationVersion"
  ];
  if (command.operation === "start") {
    exactFields(command, new Set([
      ...materializationBaseFields, "authoringPartVersion", "steps"
    ]));
  } else if (command.operation === "record_step") {
    exactFields(command, new Set([
      ...materializationBaseFields, "stepId", "expectedStepVersion", "status",
      "resultFacts", "entityChanges", "designApplication",
      "sourceAttributionApplication"
    ]));
    if (!Object.hasOwn(command, "designApplication") ||
        !Object.hasOwn(command, "sourceAttributionApplication")) {
      fail(
        "invalid_tool_argument",
        "record_step precisa declarar as aplicações de desenho e proveniência como objeto ou null."
      );
    }
  } else {
    exactFields(command, new Set([
      ...materializationBaseFields, "status", "resultFacts"
    ]));
  }
  command.expectedMaterializationVersion = nonNegativeInteger(
    command.expectedMaterializationVersion,
    "expectedMaterializationVersion"
  );
  return route(
    "POST",
    `/v1/courses/${courseId}/authoring-parts/${authoringPartId}/materializations/${materializationId}/changes`,
    requestId,
    {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      operation: command.operation,
      expectedMaterializationVersion: command.expectedMaterializationVersion,
      payload: Object.fromEntries(Object.entries(command).filter(([field]) => !new Set([
        "operation", "authoringPartId", "materializationId", "expectedMaterializationVersion"
      ]).has(field)))
    }
  );
}

function mapPeople(raw) {
  exactFields(raw, new Set([
    "operation", "requestId", "courseId", "email", "userId", "displayName",
    "avatarObjectKey", "confirmed"
  ]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "read_profile", "update_profile", "list_access", "grant_access", "revoke_access"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  if (operation === "read_profile") {
    if (Object.keys(raw).length !== 1) {
      fail("invalid_tool_argument", "read_profile recebe somente operation.");
    }
    return route("GET", "/v1/profile");
  }
  if (operation === "update_profile") {
    if (Object.keys(raw).some((field) => !new Set([
      "operation", "displayName", "avatarObjectKey"
    ]).has(field))) {
      fail("invalid_tool_argument", "update_profile recebeu campos incompatíveis.");
    }
    const body = {};
    if (Object.hasOwn(raw, "displayName")) {
      body.displayName = requiredText(raw.displayName, "displayName", { maximum: 120 });
    }
    if (Object.hasOwn(raw, "avatarObjectKey")) {
      const value = raw.avatarObjectKey == null
        ? null
        : requiredText(raw.avatarObjectKey, "avatarObjectKey", { maximum: 78 });
      if (value !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u.test(value)) {
        fail("invalid_tool_argument", "avatarObjectKey é inválido.", {
          field: "avatarObjectKey"
        });
      }
      body.avatarObjectKey = value;
    }
    if (!Object.keys(body).length) {
      fail("invalid_tool_argument", "Informe ao menos um dado do perfil.");
    }
    return route("PATCH", "/v1/profile", null, body);
  }
  const courseId = requiredUuid(raw.courseId, "courseId");
  if (operation === "list_access") {
    if (Object.keys(raw).some((field) => !new Set(["operation", "courseId"]).has(field))) {
      fail("invalid_tool_argument", "list_access recebe somente courseId.");
    }
    return route("GET", `/v1/courses/${courseId}/access`);
  }
  if (raw.confirmed !== true) {
    fail("access_confirmation_required", "Confirme a alteração de acesso antes de chamar a ferramenta.");
  }
  const requestId = requiredRequestId(raw.requestId);
  if (operation === "grant_access") {
    if (Object.keys(raw).some((field) => !new Set([
      "operation", "requestId", "courseId", "email", "confirmed"
    ]).has(field))) {
      fail("invalid_tool_argument", "grant_access recebeu campos incompatíveis.");
    }
    const email = requiredText(raw.email, "email", { maximum: 254 });
    if (!/^[^\s@]+@[^\s@]+$/u.test(email)) {
      fail("invalid_tool_argument", "email precisa ser exato.", { field: "email" });
    }
    return route("POST", `/v1/courses/${courseId}/access`, requestId, {
      requestId,
      email: email.toLowerCase(),
      confirmed: true
    });
  }
  if (Object.keys(raw).some((field) => !new Set([
    "operation", "requestId", "courseId", "userId", "confirmed"
  ]).has(field))) {
    fail("invalid_tool_argument", "revoke_access recebeu campos incompatíveis.");
  }
  const userId = requiredUuid(raw.userId, "userId");
  return route("DELETE", `/v1/courses/${courseId}/access/${userId}`, requestId, {
    requestId,
    confirmed: true
  });
}

function mapCourseLifecycle(raw) {
  exactFields(raw, new Set(["operation", "requestId", "courseId", "confirmed"]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set(["delete_owned_course", "leave_shared_course"]).has(operation) ||
      raw.confirmed !== true) {
    fail("invalid_tool_argument", "A operação de ciclo de vida do Curso é inválida.");
  }
  const requestId = requiredRequestId(raw.requestId);
  const courseId = requiredUuid(raw.courseId, "courseId");
  return route("DELETE", `/v1/courses/${courseId}`, requestId, {
    requestId,
    operation,
    confirmed: true
  });
}

function mapCurrentMaintenance(raw) {
  exactFields(raw, new Set([
    "operation", "limit", "classification", "objectPath", "confirmed"
  ]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (operation === "inspect") {
    if (Object.keys(raw).some((field) => !new Set(["operation", "limit"]).has(field))) {
      fail("invalid_tool_argument", "A consulta de Manutenção recebeu campos incompatíveis.");
    }
    const limit = raw.limit == null ? 100 : positiveInteger(raw.limit, "limit", 500);
    return route("GET", `/v1/maintenance?limit=${limit}`);
  }
  if (!new Set(["run_retention", "remove_orphan_object"]).has(operation) ||
      raw.confirmed !== true) {
    fail("invalid_tool_argument", "A ação de Manutenção é inválida.");
  }
  if (operation === "run_retention") {
    if (Object.keys(raw).some((field) => !new Set([
      "operation", "limit", "confirmed"
    ]).has(field))) {
      fail("invalid_tool_argument", "A retenção recebeu campos incompatíveis.");
    }
    return route("POST", "/v1/maintenance/actions", null, {
      operation,
      limit: positiveInteger(raw.limit, "limit", 1000),
      confirmed: true
    });
  }
  if (Object.keys(raw).some((field) => !new Set([
    "operation", "classification", "objectPath", "confirmed"
  ]).has(field))) {
    fail("invalid_tool_argument", "A remoção de resíduo recebeu campos incompatíveis.");
  }
  const classification = requiredText(raw.classification, "classification", { maximum: 80 });
  if (!new Set([
    "avatar_owner_missing", "avatar_profile_unlinked",
    "pdf_course_missing", "pdf_unlinked"
  ]).has(classification)) {
    fail("invalid_tool_argument", "A classe de resíduo não pode ser removida.");
  }
  return route("POST", "/v1/maintenance/actions", null, {
    operation,
    classification,
    objectPath: requiredText(raw.objectPath, "objectPath", { maximum: 500 }),
    confirmed: true
  });
}

function mapResourceLibrary(raw) {
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  const fieldsByOperation = {
    explore: ["operation", "slot"],
    search: ["operation", "query", "intent", "slot", "limit"],
    inspect: ["operation", "packages"],
    contracts: ["operation", "packages"],
    validate_study_unit: ["operation", "studyUnitJson"],
    audit_representation: ["operation", "studyUnitJson", "query", "intent", "slot"],
    preview_study_unit: ["operation", "studyUnitJson", "courseId", "studyUnitId"]
  };
  if (!Object.hasOwn(fieldsByOperation, operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  const hasCourseId = raw.courseId != null;
  const hasStudyUnitId = raw.studyUnitId != null;
  if (operation !== "preview_study_unit" && (hasCourseId || hasStudyUnitId)) {
    fail("invalid_tool_argument", "O alvo da prévia só pertence a preview_study_unit.");
  }
  if (hasCourseId !== hasStudyUnitId) {
    fail("invalid_tool_argument", "courseId e studyUnitId precisam ser informados juntos.");
  }
  exactFields(raw, new Set(fieldsByOperation[operation]));
  if (new Set(["inspect", "contracts"]).has(operation)) {
    if (!Array.isArray(raw.packages) || raw.packages.length < 1 ||
        raw.packages.length > (operation === "contracts" ? 1 : 8)) {
      fail(
        "invalid_tool_argument",
        operation === "contracts"
          ? "contracts exige exatamente um package."
          : "inspect exige de um a oito packages.",
        { field: "packages" }
      );
    }
  }
  if (new Set([
    "validate_study_unit", "audit_representation", "preview_study_unit"
  ]).has(operation)) {
    requiredText(raw.studyUnitJson, "studyUnitJson", { maximum: 40_000 });
  }
  if (raw.limit != null) positiveInteger(raw.limit, "limit", 8);
  return {
    kind: "resource-library",
    requestId: null,
    body: {
      ...raw,
      operation,
      ...(hasCourseId
        ? {
          courseId: requiredUuid(raw.courseId, "courseId"),
          studyUnitId: requiredText(raw.studyUnitId, "studyUnitId", { maximum: 240 })
        }
        : {})
    }
  };
}

export function authoringMcpToolDefinition(name) {
  return BY_NAME.get(String(name || "")) || null;
}

export function authoringProtocolV1ToolDefinition(name) {
  return PROTOCOL_BY_NAME.get(String(name || "")) || null;
}

export function authoringApplicationToolDefinition(name) {
  return APPLICATION_BY_NAME.get(String(name || "")) || null;
}

export function authoringMcpToolsForPrincipal(principal) {
  return COURSE_MCP_TOOLS.filter((definition) =>
    authoringMcpToolIsAllowed(definition.name, principal)
  ).map((definition) => {
    const tool = structuredClone(definition);
    const securitySchemes = structuredClone(MCP_OAUTH_SECURITY_SCHEMES);
    return {
      ...tool,
      securitySchemes,
      _meta: {
        ...(tool._meta || {}),
        securitySchemes: structuredClone(securitySchemes)
      }
    };
  });
}

export function authoringProtocolV1ToolIsAllowed(name, principal) {
  if (!principal?.actorId || !PROTOCOL_BY_NAME.has(name)) return false;
  if (!WRITE_TOOLS.has(name)) return true;
  const scopes = new Set(Array.isArray(principal.scopes) ? principal.scopes : []);
  return scopes.has("authoring:write");
}

export function authoringMcpToolIsAllowed(name, principal) {
  return authoringProtocolV1ToolIsAllowed(name, principal);
}

export function authoringApplicationToolIsAllowed(name, principal) {
  if (!principal?.actorId || !APPLICATION_BY_NAME.has(name)) return false;
  if (!APPLICATION_WRITE_TOOLS.has(name)) return true;
  const scopes = new Set(Array.isArray(principal.scopes) ? principal.scopes : []);
  return scopes.has("authoring:write");
}

export function mapAuthoringProtocolV1Call(name, rawArguments) {
  const raw = object(rawArguments ?? {}, "arguments");
  if (name === "listarCursos") return mapList(raw);
  if (name === "lerCurso") return mapRead(raw);
  if (name === "criarCurso") return mapCreate(raw);
  if (name === "alterarCurso") return mapChange(raw);
  if (name === "incorporarPdfComoFonte") return mapCourseSourcePdfIngestion(raw);
  if (name === "consultarComponentesDidaticos") return mapResourceLibrary(raw);
  throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  return mapAuthoringProtocolV1Call(name, rawArguments);
}

export function mapAuthoringApplicationToolCall(
  name,
  rawArguments,
  { inspectionVersion = 1 } = {}
) {
  const raw = object(rawArguments ?? {}, "arguments");
  if (name === "gerirPessoas") return mapPeople(raw);
  if (name === "criarCopiaPessoalDoCurso") return mapPersonalCourseCopy(raw);
  if (name === "manterCursos") return mapCourseLifecycle(raw);
  if (name === "manterAraLearn") return mapCurrentMaintenance(raw);
  if (name === "lerCurso") {
    return mapRead(raw, {
      requireObservationTextDisclosure: false,
      requireAttachmentDownloadUrlDisclosure: false,
      allowAttachmentUploadPreparation: true,
      inspectionVersion
    });
  }
  if (name === "alterarCurso") {
    return mapChange(raw, {
      requireAnnotationConfirmation: false,
      requireAuditConfirmation: false,
      allowApplicationCompositionMetadata: true,
      normalizeExternalDesignDecision: false
    });
  }
  return mapAuthoringProtocolV1Call(name, raw);
}

function validateOutput(name, envelope, definitions = BY_NAME) {
  if (!definitions.has(name)) throw new TypeError("Ferramenta de autoria inexistente.");
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
      envelope.ok !== true || !("data" in envelope)) {
    throw new TypeError("A resposta da ferramenta não corresponde ao contrato.");
  }
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > 2 * 1024 * 1024) {
    throw new TypeError("A resposta da ferramenta excede o limite de 2 MiB.");
  }
  return envelope;
}

export function validateAuthoringMcpToolOutput(name, value) {
  return validateOutput(name, value);
}

export function validateAuthoringApplicationToolOutput(name, value) {
  return validateOutput(name, value, APPLICATION_BY_NAME);
}
