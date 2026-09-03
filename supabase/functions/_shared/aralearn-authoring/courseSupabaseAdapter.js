import { AuthoringApiError } from "./errors.js";
import { decodeJwtClaims } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";
import { SupabaseOAuthJwtVerifier } from "./oauthJwtVerifier.js";
import {
  CourseDesignParametersError,
  normalizeCourseDesignChange,
  normalizeCourseDesignCommand,
  normalizeCourseDesignRead
} from "../aralearn/runtime/domain/courseDesignParameters.js";
import {
  COURSE_SOURCE_PDF_MEDIA_TYPE,
  COURSE_SOURCE_PDF_MAX_BYTES,
  CourseSourcesError,
  normalizeCourseSourcePdfDownload,
  normalizeCourseSourceChange,
  normalizeCourseSourceCommand,
  normalizeCourseSourcePdfIngestion,
  normalizeCourseSourcePdfIngestionPreparation,
  normalizeCourseSourcePdfIngestionRequest,
  normalizeCourseSourcePdfSourceIntent,
  normalizeCourseSourcesRead,
  normalizeSourceAttributionApplications
} from "../aralearn/runtime/domain/courseSources.js";
import {
  CourseAnchoredAnnotationsError,
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../aralearn/runtime/domain/courseAnchoredAnnotations.js";
import {
  CourseAuthoringAnalyticsError,
  assembleCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../aralearn/runtime/domain/courseAuthoringAnalytics.js";

const DEFAULT_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const COURSE_AUTHORING_ANALYTICS_RESPONSE_LIMIT_BYTES = 512 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INSPECTION_FIELDS = new Set([
  "contract", "courseId", "courseRevision", "scope", "totalCount", "scopeOptions",
  "items", "hasPrevious", "hasMore", "previousCursor", "nextCursor", "pageBytes"
]);
const INSPECTION_ITEM_FIELDS = new Set([
  "studyUnit", "version", "updatedAt", "ordinal", "curriculumPath", "authoringPart",
  "authorship"
]);
const INSPECTION_SCOPE_KINDS = new Set([
  "course", "authoring_part", "unassigned", "module", "lesson",
  "didactic_microsequence"
]);
const AUTHORING_PART_STATES = new Set([
  "planned", "partially_materialized", "materialized"
]);
const COURSE_DESIGN_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_SOURCES_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_ANCHORED_ANNOTATIONS_RESPONSE_LIMIT_BYTES = 256 * 1024;
const SOURCE_CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const COURSE_SOURCE_ATTACHMENT_BUCKET = "course-source-pdfs";
const PERSON_AVATAR_BUCKET = "person-avatars";
const COURSE_SOURCE_DOWNLOAD_EXPIRY_SECONDS = 60;
const COURSE_SOURCE_PDF_VERIFICATION_TIMEOUT_MS = 20_000;
const COURSE_SOURCE_PDF_MAX_DELETE_CLAIMS = 8;
const INTERNAL_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const ACCOUNT_DELETION_CONFIRMATION = "EXCLUIR MINHA CONTA";
const ACCOUNT_DELETION_CONTRACT = "aralearn.account-deletion.v1";
const ACCOUNT_STORAGE_BATCH_SIZE = 100;
const ACCOUNT_MAX_COURSE_PAGES = 100;
const ACCOUNT_MAX_STORAGE_BATCHES = 100;
const PDF_HEADER = Object.freeze([0x25, 0x50, 0x44, 0x46, 0x2d]);

function first(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

function exactRecord(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.size &&
    Object.keys(value).every((field) => fields.has(field));
}

function accountDeletionUnavailable() {
  return new AuthoringApiError(
    503,
    "account_deletion_unavailable",
    "Não foi possível confirmar a limpeza segura da conta."
  );
}

function accountDeletionInProgress() {
  return new AuthoringApiError(
    503,
    "account_deletion_in_progress",
    "A exclusão já começou e alguns arquivos podem ter sido removidos. " +
      "A conta pode já ter sido excluída ou ainda aguardar a etapa final; " +
      "tente novamente para confirmar ou concluir."
  );
}

function accountUuid(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw accountDeletionUnavailable();
  return normalized;
}

function accountStorageObjectKey(item, prefix) {
  const rawName = typeof item?.name === "string" ? item.name.trim() : "";
  const objectKey = rawName.includes("/") ? rawName : `${prefix}${rawName}`;
  if (!rawName || objectKey === prefix || !objectKey.startsWith(prefix) ||
      objectKey.length > 2_048 || [...objectKey].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint <= 31 || codePoint === 127;
      })) {
    throw accountDeletionUnavailable();
  }
  return objectKey;
}

function maintenanceObjectPath(value, bucket) {
  const normalized = String(value || "").trim();
  const pattern = bucket === PERSON_AVATAR_BUCKET
    ? /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/u
    : bucket === COURSE_SOURCE_ATTACHMENT_BUCKET
      ? /^[0-9a-f-]{36}\/[a-f0-9]{64}\.pdf$/u
      : null;
  if (!pattern?.test(normalized) || normalized.length > 500) {
    throw new AuthoringApiError(
      503,
      "invalid_maintenance_state",
      "O inventário de Manutenção devolveu um objeto inválido."
    );
  }
  return normalized;
}

function accountDeletionResult(value) {
  const result = first(value);
  if (!exactRecord(result, new Set(["contract", "status"])) ||
      result.contract !== ACCOUNT_DELETION_CONTRACT || result.status !== "deleted") {
    throw accountDeletionUnavailable();
  }
  return { contract: result.contract, status: result.status };
}

const PERSONAL_COURSE_COPY_EDIT_FIELDS = new Set([
  "contract", "operation", "sourceCourseId", "sourceCourseRevision",
  "targetCourseId", "targetCourseRevision", "studyUnitId", "studyUnitVersion",
  "applicationOrigin", "channel", "createdCopy", "changed", "idempotent",
  "updatedAt"
]);

function strictUuid(value) {
  return typeof value === "string" && value === value.trim().toLowerCase() &&
    UUID_PATTERN.test(value)
    ? value
    : null;
}

function invalidPersonalCourseCopyResponse() {
  return new AuthoringApiError(
    503,
    "course_service_unavailable",
    "O serviço devolveu uma cópia pessoal inválida."
  );
}

function normalizePersonalCourseCopyEdit(value, expected) {
  const result = first(value);
  const sourceCourseId = strictUuid(result?.sourceCourseId);
  const rawTargetCourseId = result?.targetCourseId;
  const targetCourseId = rawTargetCourseId == null
    ? null
    : strictUuid(rawTargetCourseId);
  const targetCourseRevision = result?.targetCourseRevision == null
    ? null
    : result.targetCourseRevision;
  const targetIsAbsent = rawTargetCourseId === null && targetCourseRevision === null;
  const targetIsPresent = rawTargetCourseId !== null && targetCourseId !== null &&
    positiveSafeInteger(targetCourseRevision);
  const mutationShapeValid = result?.changed === true
    ? targetIsPresent && targetCourseRevision === 2 && result.studyUnitVersion === 2 &&
      result.createdCopy === true
    : result?.changed === false
      ? targetIsAbsent && result.studyUnitVersion === expected.expectedStudyUnitVersion &&
        result.createdCopy === false
      : false;
  if (!exactRecord(result, PERSONAL_COURSE_COPY_EDIT_FIELDS) ||
      result.contract !== "aralearn.personal-course-copy-edit.v1" ||
      result.operation !== "commit_personal_course_copy_edit" ||
      sourceCourseId !== expected.sourceCourseId ||
      result.sourceCourseRevision !== expected.expectedSourceCourseRevision ||
      !mutationShapeValid ||
      targetCourseId === sourceCourseId ||
      result.studyUnitId !== expected.studyUnitId ||
      !positiveSafeInteger(result.studyUnitVersion) ||
      result.applicationOrigin !== expected.applicationOrigin ||
      result.channel !== "application" ||
      typeof result.createdCopy !== "boolean" ||
      typeof result.changed !== "boolean" ||
      typeof result.idempotent !== "boolean" ||
      !validTimestamp(result.updatedAt)) {
    throw invalidPersonalCourseCopyResponse();
  }
  return {
    contract: result.contract,
    operation: result.operation,
    sourceCourseId,
    sourceCourseRevision: result.sourceCourseRevision,
    targetCourseId,
    targetCourseRevision,
    studyUnitId: result.studyUnitId,
    studyUnitVersion: result.studyUnitVersion,
    applicationOrigin: result.applicationOrigin,
    channel: result.channel,
    createdCopy: result.createdCopy,
    changed: result.changed,
    idempotent: result.idempotent,
    updatedAt: result.updatedAt
  };
}

function positiveSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function nonNegativeSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value, { nullable = false } = {}) {
  return nullable && value == null ||
    typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function jsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeComponentPolicy(value, { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY }) {
  const componentRefs = new Set(RESOURCE_PACKAGE_REGISTRY.listCatalog().map(
    ({ id, version }) => `${id}@${version}`
  ));
  if (!exactRecord(value, new Set([
    "catalogVersion", "availability", "allowedRefs", "excludedRefs", "preferredRefs"
  ])) || value.catalogVersion !== RESOURCE_CATALOG.catalogVersion ||
      !new Set(["all", "allow_only"]).has(value.availability)) {
    throw new AuthoringApiError(
      503,
      "component_catalog_drift",
      "A regra de componentes não corresponde ao catálogo ativo."
    );
  }
  const lists = {};
  for (const field of ["allowedRefs", "excludedRefs", "preferredRefs"]) {
    const refs = value[field];
    if (!Array.isArray(refs) || refs.length > 64 || new Set(refs).size !== refs.length ||
        refs.some((ref) => typeof ref !== "string" || !componentRefs.has(ref))) {
      throw new AuthoringApiError(
        503,
        "component_catalog_drift",
        "A regra de componentes contém referências fora do catálogo ativo."
      );
    }
    lists[field] = [...refs];
  }
  const allowed = new Set(lists.allowedRefs);
  const excluded = new Set(lists.excludedRefs);
  if (value.availability === "all" && lists.allowedRefs.length !== 0 ||
      value.availability === "allow_only" && lists.allowedRefs.length === 0 ||
      lists.allowedRefs.some((ref) => excluded.has(ref)) ||
      lists.preferredRefs.some((ref) => excluded.has(ref) ||
        value.availability === "allow_only" && !allowed.has(ref))) {
    throw new AuthoringApiError(
      503,
      "invalid_component_policy",
      "A regra efetiva de componentes é inválida."
    );
  }
  return {
    catalogVersion: value.catalogVersion,
    availability: value.availability,
    ...lists
  };
}

function courseSourceCommandSubjectId(command) {
  return command.type === "save_source" || command.type === "retire_source" ||
    command.type === "remove_pdf"
    ? command.sourceId
    : command.type === "save_anchor" || command.type === "retire_anchor"
      ? command.anchorId
      : command.targetId;
}

function boundedInspectionId(value, { uuid = false } = {}) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= 240 && (!uuid || UUID_PATTERN.test(normalized))
    ? normalized
    : null;
}

function normalizeInspectionScope(value) {
  if (!exactRecord(value, new Set(["kind", "id"]))) invalidInspectionRead();
  const kind = String(value.kind || "").trim();
  const id = value.id == null ? null : boundedInspectionId(value.id, {
    uuid: kind === "authoring_part"
  });
  if (!INSPECTION_SCOPE_KINDS.has(kind) ||
      ((kind === "course" || kind === "unassigned") !== (id === null))) {
    invalidInspectionRead();
  }
  return { kind, id };
}

function invalidInspectionRead() {
  throw new AuthoringApiError(
    503,
    "course_service_unavailable",
    "A página de inspeção do Curso é inválida."
  );
}

function normalizeInspectionPart(value) {
  if (value == null) return null;
  if (!exactRecord(value, new Set(["id", "position", "title", "state"]))) {
    invalidInspectionRead();
  }
  const id = boundedInspectionId(value.id, { uuid: true });
  const title = String(value.title || "");
  const state = String(value.state || "").trim();
  if (!id || !nonNegativeSafeInteger(value.position) || !title.trim() ||
      title.length > 300 || !AUTHORING_PART_STATES.has(state)) {
    invalidInspectionRead();
  }
  return { id, position: Number(value.position), title, state };
}

function normalizeCurriculumNode(value) {
  if (!exactRecord(value, new Set(["id", "position", "title"]))) {
    invalidInspectionRead();
  }
  const id = boundedInspectionId(value.id);
  const title = String(value.title || "");
  if (!id || !nonNegativeSafeInteger(value.position) || !title.trim() || title.length > 300) {
    invalidInspectionRead();
  }
  return { id, position: Number(value.position), title };
}

function normalizeInspectionCursor(value, expected) {
  if (!expected) {
    if (value != null) invalidInspectionRead();
    return null;
  }
  if (!exactRecord(value, new Set(["studyUnitId"]))) invalidInspectionRead();
  const studyUnitId = boundedInspectionId(value.studyUnitId);
  if (!studyUnitId) invalidInspectionRead();
  return { studyUnitId };
}

function validInspectionAnalysisIdeas(value) {
  if (!exactRecord(value, new Set(["introduced", "used", "revisited"]))) return false;
  for (const field of ["introduced", "used", "revisited"]) {
    const entries = value[field];
    if (!Array.isArray(entries) || entries.length > 64 || entries.some((entry) =>
      !exactRecord(entry, new Set(["name", "description"])) ||
      typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 2_000 ||
      typeof entry.description !== "string" || entry.description.length > 4_000)) {
      return false;
    }
  }
  return true;
}

function validInspectionDesignState(value) {
  if (!exactRecord(value, new Set(["application"]))) return false;
  const application = value.application;
  if (application === null) return true;
  if (!jsonRecord(application) ||
      new TextEncoder().encode(JSON.stringify(application)).byteLength > 65_536 ||
      !exactRecord(application, new Set([
        "mode", "componentRefs", "analysisIdeas"
      ])) ||
      !new Set(["expository", "practice", "mixed"]).has(application.mode) ||
      !Array.isArray(application.componentRefs) || application.componentRefs.length > 64 ||
      application.componentRefs.some((componentRef) =>
        typeof componentRef !== "string" || !componentRef.trim() || componentRef.length > 500) ||
      !validInspectionAnalysisIdeas(application.analysisIdeas)) return false;
  return true;
}

function normalizeInspectionPage(
  value,
  { courseId, expectedRevision, scopeKind, scopeId },
  validateCourseEntityContent
) {
  if (!exactRecord(value, INSPECTION_FIELDS) ||
      value.contract !== "aralearn.course-study-unit-inspection-page.v2" ||
      String(value.courseId || "").trim().toLowerCase() !== courseId ||
      Number(value.courseRevision) !== expectedRevision ||
      !nonNegativeSafeInteger(value.totalCount) ||
      !nonNegativeSafeInteger(value.pageBytes) || value.pageBytes > 1_750_000 ||
      typeof value.hasPrevious !== "boolean" || typeof value.hasMore !== "boolean" ||
      !Array.isArray(value.items) || value.items.length > 24 ||
      !exactRecord(value.scopeOptions, new Set([
        "authoringParts", "unassignedStudyUnitCount"
      ])) || !Array.isArray(value.scopeOptions.authoringParts) ||
      !nonNegativeSafeInteger(value.scopeOptions.unassignedStudyUnitCount)) {
    invalidInspectionRead();
  }
  const scope = normalizeInspectionScope(value.scope);
  if (scope.kind !== scopeKind || scope.id !== scopeId) invalidInspectionRead();
  const authoringParts = value.scopeOptions.authoringParts.map(normalizeInspectionPart);
  if (authoringParts.some((part, index) => part.position !== index) ||
      new Set(authoringParts.map(({ id }) => id)).size !== authoringParts.length) {
    invalidInspectionRead();
  }
  const items = value.items.map((item) => {
    if (!exactRecord(item, INSPECTION_ITEM_FIELDS) || !jsonRecord(item.studyUnit) ||
        !exactRecord(item.curriculumPath, new Set([
          "module", "lesson", "didacticMicrosequence"
        ]))) {
      invalidInspectionRead();
    }
    const id = boundedInspectionId(item.studyUnit.id);
    const curriculumPath = {
      module: normalizeCurriculumNode(item.curriculumPath.module),
      lesson: normalizeCurriculumNode(item.curriculumPath.lesson),
      didacticMicrosequence: normalizeCurriculumNode(
        item.curriculumPath.didacticMicrosequence
      )
    };
    const authorship = item.authorship;
    if (!exactRecord(authorship, new Set([
      "createdOrigin", "lastRevisionOrigin", "design"
    ])) || ![null, "human", "gpt"].includes(authorship.createdOrigin) ||
        ![null, "human", "gpt"].includes(authorship.lastRevisionOrigin) ||
        !validInspectionDesignState(authorship.design)) {
      invalidInspectionRead();
    }
    if (!id || !positiveSafeInteger(item.studyUnit.position) ||
        !positiveSafeInteger(item.version) || !positiveSafeInteger(item.ordinal) ||
        !validTimestamp(item.updatedAt)) {
      invalidInspectionRead();
    }
    const studyUnitValidation = validateCourseEntityContent("study_unit", item.studyUnit);
    if (!studyUnitValidation.valid) invalidInspectionRead();
    return {
      studyUnit: structuredClone(studyUnitValidation.normalized),
      version: Number(item.version),
      updatedAt: item.updatedAt,
      ordinal: Number(item.ordinal),
      curriculumPath,
      authoringPart: normalizeInspectionPart(item.authoringPart),
      authorship: structuredClone(authorship)
    };
  });
  if (new Set(items.map(({ studyUnit }) => studyUnit.id)).size !== items.length) {
    invalidInspectionRead();
  }
  return {
    contract: value.contract,
    courseId,
    courseRevision: Number(value.courseRevision),
    scope,
    totalCount: Number(value.totalCount),
    scopeOptions: {
      authoringParts,
      unassignedStudyUnitCount: Number(value.scopeOptions.unassignedStudyUnitCount)
    },
    items,
    hasPrevious: value.hasPrevious,
    hasMore: value.hasMore,
    previousCursor: normalizeInspectionCursor(value.previousCursor, value.hasPrevious),
    nextCursor: normalizeInspectionCursor(value.nextCursor, value.hasMore),
    pageBytes: Number(value.pageBytes)
  };
}


function requiredUrl(value, label) {
  const source = String(value || "").trim().replace(/\/+$/u, "");
  if (!source) throw new Error(`${label} ausente.`);
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error(`${label} inválida.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${label} inválida.`);
  }
  return source;
}

function claimText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function audienceIncludes(audience, expected) {
  return (Array.isArray(audience) ? audience : [audience])
    .some((value) => claimText(value) === expected);
}

function assertMcpClaims(claims, { issuer, resource, now = Math.floor(Date.now() / 1_000) }) {
  const clientId = strictUuid(claims?.client_id);
  const pairwiseSubject = strictUuid(claims?.sub);
  const pairwiseSessionId = strictUuid(claims?.session_id);
  const sourceSessionId = strictUuid(claims?.aralearn_session_id);
  const allowedFields = new Set([
    "aal", "aralearn_session_id", "aud", "client_id", "email", "exp", "iat",
    "is_anonymous", "iss", "nbf", "phone", "role", "scope", "session_id", "sub"
  ]);
  if (!claims || typeof claims !== "object" || Array.isArray(claims) ||
      Object.keys(claims).some((field) => !allowedFields.has(field)) ||
      claimText(claims?.iss) !== issuer || claims?.aud !== resource ||
      !clientId || !pairwiseSubject || !pairwiseSessionId || !sourceSessionId ||
      new Set([clientId, pairwiseSubject, pairwiseSessionId, sourceSessionId]).size !== 4 ||
      claims?.scope !== "offline_access" || claims?.role !== "authenticated" ||
      !new Set(["aal1", "aal2"]).has(claims?.aal) ||
      claims?.is_anonymous !== false || claims?.email !== "" || claims?.phone !== "" ||
      claims?.app_metadata != null || claims?.user_metadata != null || claims?.amr != null ||
      !Number.isSafeInteger(claims?.iat) || claims.iat > now + 30 ||
      !Number.isSafeInteger(claims?.exp) || claims.exp <= now ||
      claims.exp <= claims.iat || claims.exp - claims.iat > 7_200 ||
      (claims?.nbf != null && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now + 30))) {
    throw new AuthoringApiError(
      401,
      "invalid_oauth_token",
      "O access token não foi emitido para este recurso MCP."
    );
  }
  return { clientId, pairwiseSessionId, pairwiseSubject, sourceSessionId };
}

function normalizeMcpOAuthPrincipal(value, expectedClientId) {
  const result = first(value);
  const actorId = strictUuid(result?.actorId);
  const oauthClientId = strictUuid(result?.oauthClientId);
  if (!exactRecord(result, new Set(["contract", "actorId", "oauthClientId"])) ||
      result.contract !== "aralearn.mcp-oauth-principal.v1" ||
      !actorId || oauthClientId !== expectedClientId) {
    throw new AuthoringApiError(
      401,
      "invalid_oauth_token",
      "O access token não corresponde a uma autorização MCP ativa."
    );
  }
  return { actorId, oauthClientId };
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function databaseError(status, body) {
  const code = String(body?.code || "");
  const databaseMessage = String(body?.message || "");
  if (status === 401 || code === "28000") {
    return new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
  }
  if (status === 403 || code === "42501") {
    return new AuthoringApiError(403, "not_authorized", "A operação não foi autorizada.");
  }
  if (new Set([
    "course_anchored_annotation_not_found",
    "course_anchored_annotation_target_not_found"
  ]).has(code)) {
    return new AuthoringApiError(
      404,
      code,
      code === "course_anchored_annotation_not_found"
        ? "A observação situada não existe."
        : "O alvo situado não existe neste Curso."
    );
  }
  if (code === "PT404") {
    return new AuthoringApiError(404, "PT404", "O recurso solicitado não foi encontrado.");
  }
  if (code === "40001") {
    return new AuthoringApiError(
      409,
      "stale_course_state",
      "O Curso mudou; releia o estado e tente novamente."
    );
  }
  if (code === "AR001") {
    return new AuthoringApiError(
      422,
      "account_storage_not_empty",
      "A exclusão aguarda a limpeza dos objetos privados da conta."
    );
  }
  if (code === "P1490") {
    const targetCourseId = strictUuid(body?.details);
    return targetCourseId
      ? new AuthoringApiError(
          409,
          "personal_copy_exists",
          "Você já possui uma cópia pessoal deste Curso.",
          { targetCourseId }
        )
      : invalidPersonalCourseCopyResponse();
  }
  if (code === "23514" &&
      databaseMessage.startsWith("A cota de 64 MiB de PDFs")) {
    return new AuthoringApiError(
      413,
      "course_source_pdf_quota_exceeded",
      "O Curso já atingiu a cota de 64 MiB de PDFs únicos."
    );
  }
  if (code === "23514" &&
      databaseMessage.startsWith("Uma revisão de Fonte aceita no máximo oito anexos PDF")) {
    return new AuthoringApiError(
      413,
      "course_source_pdf_attachment_limit",
      "Esta revisão da Fonte já possui o máximo de oito PDFs."
    );
  }
  if (code === "23514" && databaseMessage.startsWith("requestId reutilizado")) {
    return new AuthoringApiError(
      409,
      "request_id_conflict",
      "requestId já foi usado com outra operação ou outro conteúdo."
    );
  }
  if (status === 409 || code === "23505") {
    return new AuthoringApiError(409, "conflict", "A operação conflita com o estado existente.");
  }
  if (status === 413 || code === "54000") {
    return new AuthoringApiError(413, "payload_too_large", "A alteração excede o limite aceito.");
  }
  if (status === 422 || code === "22023" || code === "23514") {
    return new AuthoringApiError(422, "invalid_course_command", "Os dados do Curso são inválidos.");
  }
  if (status === 429) {
    return new AuthoringApiError(429, "rate_limited", "Limite temporário excedido.");
  }
  return new AuthoringApiError(
    status >= 500 ? 503 : status || 500,
    "course_service_unavailable",
    "O serviço de Cursos não concluiu a operação."
  );
}

function actionOAuthDatabaseError(status, body, phase) {
  const code = String(body?.code || "");
  if (status === 429 || code === "P0001") {
    return new AuthoringApiError(
      429,
      "temporarily_unavailable",
      "O serviço OAuth atingiu um limite temporário."
    );
  }
  if (status >= 500 || status === 408 || code === "42501") {
    return new AuthoringApiError(
      503,
      "temporarily_unavailable",
      "O serviço OAuth está temporariamente indisponível."
    );
  }
  if (status >= 400 && status < 500) {
    const grant = phase === "grant";
    return new AuthoringApiError(
      400,
      grant ? "invalid_grant" : "invalid_request",
      grant
        ? "As credenciais ou a concessão OAuth são inválidas."
        : "A solicitação OAuth é inválida."
    );
  }
  return new AuthoringApiError(
    503,
    "temporarily_unavailable",
    "O serviço OAuth está temporariamente indisponível."
  );
}

function responseTooLarge() {
  return new AuthoringApiError(
    413,
    "course_response_too_large",
    "A resposta do serviço de Cursos excedeu o limite seguro."
  );
}

function invalidCourseSourcePdf() {
  return new AuthoringApiError(
    422,
    "invalid_course_source_pdf",
    "O objeto enviado não corresponde ao PDF declarado."
  );
}

function unavailableCourseSourcePdf() {
  return new AuthoringApiError(
    503,
    "course_storage_unavailable",
    "O Storage não permitiu verificar o PDF enviado."
  );
}

function uncertainCourseSourcePdfWrite() {
  return new AuthoringApiError(
    409,
    "course_source_pdf_write_uncertain",
    "A ingestão pode ter sido concluída, mas não foi possível confirmar com segurança " +
      "o PDF e a Fonte solicitados."
  );
}

function courseAnchoredAnnotationsResponseFailure(error) {
  if (error instanceof AuthoringApiError && new Set([
    "payload_too_large", "course_response_too_large"
  ]).has(error.code)) {
    return new AuthoringApiError(
      413,
      "course_anchored_annotations_response_too_large",
      "A resposta de observações excedeu 256 KiB. Use uma página menor."
    );
  }
  return error;
}


function normalizeCourseAuthoringAnalyticsInputValue(callback) {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CourseAuthoringAnalyticsError) {
      throw new AuthoringApiError(422, error.code, error.message);
    }
    throw error;
  }
}

function normalizeCourseAuthoringAnalyticsDatabaseValue(callback) {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CourseAuthoringAnalyticsError || error instanceof TypeError) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O serviço devolveu um snapshot de Analytics inválido."
      );
    }
    throw error;
  }
}

async function readBoundedResponseText(response, limitBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > limitBytes) {
    await response.body?.cancel?.().catch(() => undefined);
    throw responseTooLarge();
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limitBytes) throw responseTooLarge();
    return new TextDecoder().decode(bytes);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let source = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > limitBytes) {
        await reader.cancel().catch(() => undefined);
        throw responseTooLarge();
      }
      source += decoder.decode(value, { stream: true });
    }
    return source + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function readBoundedResponseBytes(response, limitBytes) {
  const declaredHeader = response.headers.get("content-length");
  const declared = declaredHeader === null ? null : Number(declaredHeader);
  if (declared !== null && (!Number.isSafeInteger(declared) || declared < 0 ||
      declared > limitBytes)) {
    await response.body?.cancel?.().catch(() => undefined);
    throw invalidCourseSourcePdf();
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limitBytes) throw invalidCourseSourcePdf();
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > limitBytes) {
        await reader.cancel().catch(() => undefined);
        throw invalidCourseSourcePdf();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function validPdfHeader(bytes) {
  return bytes.byteLength >= PDF_HEADER.length &&
    PDF_HEADER.every((value, index) => bytes[index] === value);
}

function validPdfStructure(bytes) {
  if (!validPdfHeader(bytes)) return false;
  const source = new TextDecoder("latin1").decode(bytes);
  return /(?:^|\s)\d+\s+\d+\s+obj(?:\s|<)/u.test(source) &&
    /(?:^|\s)endobj(?:\s|$)/u.test(source) &&
    /(?:^|\s)startxref\s+\d+\s+%%EOF\s*$/u.test(source);
}

function courseSourcePdfBytes(value) {
  let bytes;
  try {
    if (value instanceof Uint8Array) {
      bytes = new Uint8Array(value);
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value.slice(0));
    }
  } catch {
    throw invalidCourseSourcePdf();
  }
  if (bytes === undefined) {
    throw invalidCourseSourcePdf();
  }
  if (bytes.byteLength < 1 || bytes.byteLength > COURSE_SOURCE_PDF_MAX_BYTES ||
      !validPdfStructure(bytes)) {
    throw invalidCourseSourcePdf();
  }
  return bytes;
}

function courseSourcePdfAttachmentBinaryEquals(left, right) {
  return left?.contentHash === right?.contentHash &&
    left?.byteSize === right?.byteSize &&
    left?.mediaType === right?.mediaType;
}

function courseSourcePdfAttachmentEquals(left, right) {
  return courseSourcePdfAttachmentBinaryEquals(left, right) &&
    left?.storagePath === right?.storagePath;
}

function courseSourcePdfUploadConflict(status, body) {
  if (status !== 400 && status !== 409) return false;
  const description = [body?.statusCode, body?.error, body?.code, body?.message]
    .map((value) => String(value || ""))
    .join(" ")
    .toLowerCase();
  return /duplicate|already exists|resource already exists/u.test(description);
}

function deterministicCourseSourceUuid(hash) {
  const normalized = `${hash.slice(0, 12)}5${hash.slice(13, 16)}` +
    `${((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 32)}`;
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32)
  ].join("-");
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function normalizedCourseSourcePdfIngestionIdentity({
  courseId,
  expectedCourseRevision,
  requestId,
  sourceIntent,
  fileIdentity
}) {
  const normalizedFileIdentity = (() => {
    if (!fileIdentity || typeof fileIdentity !== "object" || Array.isArray(fileIdentity)) {
      throw invalidCourseSourcePdf();
    }
    const fileId = typeof fileIdentity.fileId === "string" ? fileIdentity.fileId.trim() : "";
    const fileName = fileIdentity.fileName == null
      ? null
      : typeof fileIdentity.fileName === "string" ? fileIdentity.fileName.trim() : "";
    const mediaType = fileIdentity.mediaType == null
      ? null
      : typeof fileIdentity.mediaType === "string"
        ? fileIdentity.mediaType.trim().toLowerCase()
        : "";
    if (!fileId || fileId.length > 240 || fileName === "" ||
        fileName !== null && fileName.length > 500 ||
        mediaType !== null && mediaType !== COURSE_SOURCE_PDF_MEDIA_TYPE ||
        /\p{Cc}/u.test(fileId) || fileName !== null && /\p{Cc}/u.test(fileName)) {
      throw invalidCourseSourcePdf();
    }
    return { fileId, fileName, mediaType };
  })();
  const request = normalizeCourseSourcesInputValue(() =>
    normalizeCourseSourcePdfIngestionRequest({
      courseId,
      expectedCourseRevision,
      requestId,
      sourceIntent
    })
  );
  if (request.sourceIntent.mode !== "save" || request.sourceIntent.sourceId !== null) {
    return { ...request, fileIdentity: normalizedFileIdentity };
  }
  const identityHash = await sha256Hex(new TextEncoder().encode(
    `aralearn.course-source-pdf-ingestion.v1\0${request.courseId}\0${request.requestId}`
  ));
  return {
    ...request,
    fileIdentity: normalizedFileIdentity,
    sourceIntent: normalizeCourseSourcesInputValue(() =>
      normalizeCourseSourcePdfSourceIntent({
        ...request.sourceIntent,
        sourceId: deterministicCourseSourceUuid(identityHash)
      })
    )
  };
}

function withDeepLink(value, publicAppUrl, section = "planning") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = structuredClone(value);
  const attach = (course) => {
    const courseId = String(course?.courseId || "").trim();
    return courseId
      ? {
          ...course,
          deepLink: `${publicAppUrl}/#/authoring/courses/${courseId}?section=${section}`
        }
      : course;
  };
  if (Array.isArray(result.items)) result.items = result.items.map(attach);
  if (result.course && typeof result.course === "object") result.course = attach(result.course);
  if (result.courseId) return attach(result);
  return result;
}

function withInspectionDeepLinks(value, publicAppUrl) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray(value.items)) return value;
  const result = structuredClone(value);
  result.items = result.items.map((item) => {
    const studyUnitId = String(item?.studyUnit?.id || "").trim();
    if (!studyUnitId) return item;
    return {
      ...item,
      deepLink: `${publicAppUrl}/#/authoring/courses/${result.courseId}` +
        `?section=content&studyUnitId=${encodeURIComponent(studyUnitId)}`
    };
  });
  return result;
}


function normalizeCourseDesignDatabaseValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseDesignParametersError)) throw error;
    throw new AuthoringApiError(
      503,
      "course_service_unavailable",
      "O serviço devolveu um contrato de parâmetros inválido."
    );
  }
}

function normalizeCourseDesignInputValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseDesignParametersError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseSourcesDatabaseValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseSourcesError)) throw error;
    throw new AuthoringApiError(
      503,
      "course_service_unavailable",
      "O serviço devolveu dados de Fontes inválidos."
    );
  }
}

function normalizeCourseSourcesInputValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseSourcesError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseAnchoredAnnotationsDatabaseValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAnchoredAnnotationsError)) throw error;
    throw new AuthoringApiError(
      503,
      "course_service_unavailable",
      "O serviço devolveu dados de Observações inválidos."
    );
  }
}

function normalizeCourseAnchoredAnnotationsInputValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAnchoredAnnotationsError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function validateComponentCatalogProjection(value, { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY }) {
  const componentCatalogOptions = RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .map((manifest) => ({
      ref: `${manifest.id}@${manifest.version}`,
      label: manifest.label,
      purpose: manifest.purpose
    }));
  const catalog = value?.componentCatalog;
  const options = Array.isArray(catalog?.options) ? catalog.options : [];
  const validOptions = options.length === componentCatalogOptions.length &&
    options.every((option, index) => {
      const expected = componentCatalogOptions[index];
      if (!exactRecord(option, new Set(["ref", "label", "purpose"])) ||
          option.ref !== expected.ref || option.label !== expected.label ||
          option.purpose !== expected.purpose) return false;
      return true;
    });
  if (!jsonRecord(value) || !exactRecord(catalog, new Set(["version", "options"])) ||
      catalog.version !== RESOURCE_CATALOG.catalogVersion ||
      !validOptions) {
    throw new AuthoringApiError(
      503,
      "component_catalog_drift",
      "O catálogo aplicado ao Curso não corresponde ao catálogo ativo."
    );
  }
  const normalized = normalizeCourseDesignDatabaseValue(() => normalizeCourseDesignRead(value));
  const policies = [
    normalized.componentPolicy?.localAssignment?.policy,
    normalized.componentPolicy?.effectiveAssignment?.policy
  ].filter(Boolean);
  if (!policies.length) {
    throw new AuthoringApiError(
      503,
      "course_service_unavailable",
      "A leitura não contém regra efetiva de componentes."
    );
  }
  policies.forEach((policy) => normalizeComponentPolicy(
    policy,
    { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY }
  ));
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength >
      COURSE_DESIGN_RESPONSE_LIMIT_BYTES) {
    throw responseTooLarge();
  }
  return normalized;
}

function authoringChannel(principal) {
  if (principal?.authenticationKind === "application") return "application";
  if (new Set(["oauth", "action"]).has(principal?.authenticationKind)) return "mcp";
  throw new AuthoringApiError(401, "authentication_required", "A origem da Autoria é inválida.");
}

function storageObjectPath(value) {
  return String(value || "").split("/").map(encodeURIComponent).join("/");
}

function signedStorageUrl(baseUrl, value, { download = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new AuthoringApiError(
      503,
      "course_storage_unavailable",
      "O Storage não devolveu uma URL assinada."
    );
  }
  const url = new URL(raw.startsWith("http") ? raw : `${baseUrl}${raw}`);
  if (download) url.searchParams.set("download", "");
  if (!url.searchParams.has("token")) {
    throw new AuthoringApiError(
      503,
      "course_storage_unavailable",
      "O Storage não devolveu uma URL assinada válida."
    );
  }
  return url.toString();
}

function anchoredAnnotationChannel(principal) {
  if (principal?.authenticationKind === "application") return "authoring_interface";
  if (principal?.authenticationKind === "oauth" ||
      principal?.authenticationKind === "action") return "authoring_chat";
  throw new AuthoringApiError(401, "authentication_required", "O canal da observação é inválido.");
}


export class CourseSupabaseAdapter {
  /**
   * @param {{
   *   supabaseUrl?: string,
   *   publicSupabaseUrl?: string,
   *   oauthIssuer?: string,
   *   serverApiKey?: string,
   *   publishableKey?: string,
   *   publicAppUrl?: string,
   *   fetchImpl?: typeof globalThis.fetch,
   *   oauthJwtVerifier?: {verify(token: string, options?: {deadlineAt?: number|null}): Promise<object>},
   *   attempts?: number,
   *   requestTimeoutMs?: number,
   *   responseLimitBytes?: number
   * }} [options]
   */
  constructor({
    supabaseUrl,
    publicSupabaseUrl = supabaseUrl,
    oauthIssuer = "",
    serverApiKey,
    publishableKey,
    publicAppUrl,
    fetchImpl = globalThis.fetch,
    oauthJwtVerifier = null,
    attempts = 3,
    requestTimeoutMs = 8_000,
    responseLimitBytes = DEFAULT_RESPONSE_LIMIT_BYTES
  } = {}) {
    this.supabaseUrl = requiredUrl(supabaseUrl, "SUPABASE_URL");
    this.publicSupabaseUrl = requiredUrl(publicSupabaseUrl, "URL pública do Supabase");
    this.oauthIssuer = requiredUrl(oauthIssuer || `${this.supabaseUrl}/auth/v1`, "Issuer OAuth");
    this.serverApiKey = String(serverApiKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
    this.publicAppUrl = requiredUrl(publicAppUrl, "URL pública do AraLearn");
    this.fetchImpl = fetchImpl;
    this.oauthJwtVerifier = oauthJwtVerifier || new SupabaseOAuthJwtVerifier({
      // No ambiente local, o issuer público aponta ao host do navegador e não
      // é alcançável de dentro do contêiner Edge. A chave vem da mesma instância
      // confiável usada pelo adapter; as claims continuam confrontadas abaixo
      // contra o issuer público exato anunciado ao cliente.
      issuer: `${this.supabaseUrl}/auth/v1`,
      fetchImpl,
      requestTimeoutMs
    });
    this.attempts = attempts;
    this.requestTimeoutMs = requestTimeoutMs;
    this.responseLimitBytes = Number(responseLimitBytes);
    if (!this.serverApiKey) throw new Error("A chave administrativa do Supabase está ausente.");
    if (!this.publishableKey) throw new Error("A chave pública do Supabase está ausente.");
    if (!Number.isSafeInteger(this.responseLimitBytes) || this.responseLimitBytes < 1) {
      throw new TypeError("O limite de resposta do serviço de Cursos é inválido.");
    }
  }

  async #request(url, init, {
    retry = true,
    deadlineAt = null,
    timeoutMs = this.requestTimeoutMs,
    responseLimitBytes = this.responseLimitBytes,
    errorDomain = "course"
  } = {}) {
    const oauthRequest = errorDomain === "oauth_request" || errorDomain === "oauth_grant";
    let lastError = null;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      const remaining = deadlineAt == null ? timeoutMs : deadlineAt - Date.now();
      if (remaining <= 0) {
        throw oauthRequest
          ? new AuthoringApiError(
              503,
              "temporarily_unavailable",
              "O serviço OAuth está temporariamente indisponível."
            )
          : new AuthoringApiError(503, "service_timeout", "O prazo da operação terminou.");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, remaining)));
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        const source = await readBoundedResponseText(response, responseLimitBytes);
        let body = null;
        try {
          body = source ? JSON.parse(source) : null;
        } catch {
          body = source;
        }
        if (response.ok) return body;
        const error = errorDomain === "oauth_request"
          ? actionOAuthDatabaseError(response.status, body, "request")
          : errorDomain === "oauth_grant"
            ? actionOAuthDatabaseError(response.status, body, "grant")
            : databaseError(response.status, body);
        lastError = error;
        if (!retry || !retryableStatus(error.status) || attempt === this.attempts) throw error;
      } catch (error) {
        const normalized = controller.signal.aborted
          ? oauthRequest
            ? new AuthoringApiError(
                503,
                "temporarily_unavailable",
                "O serviço OAuth está temporariamente indisponível."
              )
            : new AuthoringApiError(503, "service_timeout", "O serviço não respondeu a tempo.")
          : error instanceof AuthoringApiError
            ? error
            : new AuthoringApiError(
                503,
                oauthRequest ? "temporarily_unavailable" : "course_service_unavailable",
                oauthRequest
                  ? "O serviço OAuth está temporariamente indisponível."
                  : "Não foi possível alcançar o serviço."
              );
        lastError = normalized;
        if (!retry || !new Set([
          "service_timeout", "course_service_unavailable", "temporarily_unavailable"
        ]).has(normalized.code) ||
            attempt === this.attempts) throw normalized;
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
    throw lastError;
  }

  async #verifyCourseSourcePdf(attachment, {
    deadlineAt = null,
    requireStructure = false
  } = {}) {
    const remaining = deadlineAt == null
      ? COURSE_SOURCE_PDF_VERIFICATION_TIMEOUT_MS
      : deadlineAt - Date.now();
    if (remaining <= 0) {
      throw new AuthoringApiError(503, "service_timeout", "O prazo da operação terminou.");
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(COURSE_SOURCE_PDF_VERIFICATION_TIMEOUT_MS, remaining))
    );
    try {
      const response = await this.fetchImpl(
        `${this.supabaseUrl}/storage/v1/object/authenticated/` +
          `${COURSE_SOURCE_ATTACHMENT_BUCKET}/${storageObjectPath(attachment.storagePath)}`,
        {
          method: "GET",
          headers: {
            ...supabaseServerHeaders(this.serverApiKey, { contentType: false }),
            "Cache-Control": "no-store"
          },
          cache: "no-store",
          signal: controller.signal
        }
      );
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => undefined);
        if (response.status === 400 || response.status === 404) {
          throw invalidCourseSourcePdf();
        }
        throw unavailableCourseSourcePdf();
      }
      const bytes = await readBoundedResponseBytes(response, COURSE_SOURCE_PDF_MAX_BYTES);
      if (bytes.byteLength !== attachment.byteSize ||
          (requireStructure ? !validPdfStructure(bytes) : !validPdfHeader(bytes)) ||
          await sha256Hex(bytes) !== attachment.contentHash) {
        throw invalidCourseSourcePdf();
      }
    } catch (error) {
      if (error instanceof AuthoringApiError) throw error;
      throw unavailableCourseSourcePdf();
    } finally {
      clearTimeout(timer);
    }
  }

  async #prepareCourseSourcePdfIngestion({
    principal,
    courseId,
    expectedCourseRevision,
    requestId,
    sourceIntent,
    attachment,
    deadlineAt
  }) {
    const raw = first(await this.rpc("prepare_course_source_pdf_ingestion_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedCourseRevision,
      p_source_intent: sourceIntent,
      p_content_hash: attachment.contentHash,
      p_byte_size: attachment.byteSize,
      p_media_type: attachment.mediaType,
      p_request_id: requestId
    }, {
      deadlineAt,
      responseLimitBytes: 32 * 1024
    }));
    const preparation = normalizeCourseSourcesDatabaseValue(() =>
      normalizeCourseSourcePdfIngestionPreparation(raw)
    );
    const expectedSourceRevision = sourceIntent.mode === "existing"
      ? sourceIntent.sourceRevision
      : sourceIntent.expectedSourceRevision + 1;
    if (preparation.courseId !== courseId ||
        preparation.courseRevision !== expectedCourseRevision ||
        preparation.requestId !== requestId ||
        preparation.sourceId !== sourceIntent.sourceId ||
        preparation.sourceRevision !== expectedSourceRevision ||
        preparation.attachment.contentHash !== attachment.contentHash ||
        preparation.attachment.byteSize !== attachment.byteSize ||
        preparation.attachment.mediaType !== attachment.mediaType ||
        !preparation.alreadyLinked &&
          preparation.attachment.storagePath !== attachment.storagePath) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A preparação do PDF não corresponde à Fonte solicitada."
      );
    }
    return preparation;
  }

  async #uploadCourseSourcePdf(attachment, bytes, { deadlineAt = null } = {}) {
    const remaining = deadlineAt == null ? this.requestTimeoutMs : deadlineAt - Date.now();
    if (remaining <= 0) return "uncertain";
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(this.requestTimeoutMs, remaining))
    );
    try {
      const response = await this.fetchImpl(
        `${this.supabaseUrl}/storage/v1/object/${COURSE_SOURCE_ATTACHMENT_BUCKET}/` +
          storageObjectPath(attachment.storagePath),
        {
          method: "POST",
          headers: {
            ...supabaseServerHeaders(this.serverApiKey, { contentType: false }),
            "Content-Type": COURSE_SOURCE_PDF_MEDIA_TYPE,
            "Cache-Control": "no-store",
            "x-upsert": "false"
          },
          body: bytes,
          signal: controller.signal
        }
      );
      const source = await readBoundedResponseText(response, 32 * 1024);
      let body = null;
      try {
        body = source ? JSON.parse(source) : null;
      } catch {
        body = source;
      }
      if (response.ok) return "created";
      if (courseSourcePdfUploadConflict(response.status, body)) return "conflict";
      if (retryableStatus(response.status)) return "uncertain";
      throw unavailableCourseSourcePdf();
    } catch (error) {
      if (controller.signal.aborted || !(error instanceof AuthoringApiError)) {
        return "uncertain";
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async #finalizeCourseSourcePdfIngestion({
    principal,
    courseId,
    expectedCourseRevision,
    requestId,
    sourceIntent,
    attachment,
    fileIdentity,
    deadlineAt
  }) {
    const raw = first(await this.rpc("ingest_course_source_pdf_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedCourseRevision,
      p_source_intent: sourceIntent,
      p_attachment: attachment,
      p_file_identity: fileIdentity,
      p_channel: authoringChannel(principal),
      p_request_id: requestId
    }, {
      deadlineAt,
      timeoutMs: 40_000,
      responseLimitBytes: COURSE_SOURCES_RESPONSE_LIMIT_BYTES
    }));
    return await this.#confirmedCourseSourcePdfIngestion(raw, {
      courseId,
      expectedCourseRevision,
      requestId,
      sourceIntent,
      attachment,
      deadlineAt
    });
  }

  async #confirmedCourseSourcePdfIngestion(raw, {
    courseId,
    expectedCourseRevision,
    requestId,
    sourceIntent,
    attachment = null,
    deadlineAt
  }) {
    // Chegar aqui significa que a transação devolveu um resultado ou receipt:
    // qualquer falha posterior deixa o commit potencialmente durável. Nunca a
    // apresente como erro repetível, pois uma nova chamada usaria outra chave
    // idempotente e poderia criar uma Fonte duplicada.
    try {
      const result = normalizeCourseSourcesDatabaseValue(() =>
        normalizeCourseSourcePdfIngestion(raw)
      );
      const expectedSourceRevision = sourceIntent.mode === "existing"
        ? sourceIntent.sourceRevision
        : sourceIntent.expectedSourceRevision + 1;
      // A Fonte e o vínculo PDF são finalizados na mesma transação e avançam a
      // revisão do Curso uma única vez. `bibliographyChanged` descreve parte
      // dessa mudança; não é um segundo incremento independente.
      const expectedResultRevision = expectedCourseRevision +
        Number(result.changed);
      if (result.courseId !== courseId || result.requestId !== requestId ||
          result.courseRevision !== expectedResultRevision ||
          result.source.sourceId !== sourceIntent.sourceId ||
          result.source.sourceRevision !== expectedSourceRevision ||
          attachment !== null && !courseSourcePdfAttachmentEquals(result.attachment, attachment) &&
            !(result.idempotent && courseSourcePdfAttachmentBinaryEquals(
              result.attachment,
              attachment
            ))) {
        throw uncertainCourseSourcePdfWrite();
      }
      await this.#verifyCourseSourcePdf(result.attachment, {
        deadlineAt,
        requireStructure: true
      });
      return result;
    } catch (error) {
      if (error instanceof AuthoringApiError &&
          error.code === "course_source_pdf_write_uncertain") {
        throw error;
      }
      throw uncertainCourseSourcePdfWrite();
    }
  }

  async getCourseSourcePdfIngestionReceipt({
    principal,
    courseId,
    expectedCourseRevision,
    requestId,
    sourceIntent,
    fileIdentity,
    deadlineAt = null
  }) {
    const request = await normalizedCourseSourcePdfIngestionIdentity({
      courseId,
      expectedCourseRevision,
      requestId,
      sourceIntent,
      fileIdentity
    });
    const raw = first(await this.rpc(
      "get_course_source_pdf_ingestion_receipt_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: request.courseId,
        p_expected_revision: request.expectedCourseRevision,
        p_source_intent: request.sourceIntent,
        p_file_identity: request.fileIdentity,
        p_channel: authoringChannel(principal),
        p_request_id: request.requestId
      },
      { deadlineAt, responseLimitBytes: COURSE_SOURCES_RESPONSE_LIMIT_BYTES }
    ));
    if (raw === null) return null;
    return await this.#confirmedCourseSourcePdfIngestion(raw, {
      courseId: request.courseId,
      expectedCourseRevision: request.expectedCourseRevision,
      requestId: request.requestId,
      sourceIntent: request.sourceIntent,
      deadlineAt
    });
  }

  async #cancelCourseSourcePdfIngestion({
    principal,
    courseId,
    requestId,
    storagePath,
    deadlineAt
  }) {
    const result = first(await this.rpc("cancel_course_source_pdf_ingestion_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_storage_path: storagePath,
      p_request_id: requestId
    }, { deadlineAt, responseLimitBytes: 4 * 1024 }));
    if (typeof result !== "boolean") {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O serviço não confirmou o cancelamento da ingestão de PDF."
      );
    }
    return result;
  }


  async #deleteAccountWithJwt(accessToken, confirmation, { deadlineAt = null } = {}) {
    const result = await this.#request(
      `${this.supabaseUrl}/rest/v1/rpc/delete_my_account_v1`,
      {
        method: "POST",
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_confirmation: confirmation })
      },
      { deadlineAt, timeoutMs: 60_000, responseLimitBytes: 32 * 1024 }
    );
    return accountDeletionResult(result);
  }

  async #ownedCourseIdsForAccount(principal, { deadlineAt = null } = {}) {
    const courseIds = [];
    const seen = new Set();
    let cursor = null;
    for (let pageIndex = 0; pageIndex < ACCOUNT_MAX_COURSE_PAGES; pageIndex += 1) {
      const page = await this.listCourses({
        principal,
        limit: 50,
        beforeUpdatedAt: cursor?.beforeUpdatedAt ?? null,
        beforeId: cursor?.beforeId ?? null,
        deadlineAt
      });
      if (!exactRecord(page, new Set(["contract", "items", "hasMore", "nextCursor"])) ||
          page.contract !== "aralearn.course-list.v1" || !Array.isArray(page.items) ||
          page.items.length > 50 || typeof page.hasMore !== "boolean" ||
          (page.hasMore ? page.nextCursor == null : page.nextCursor !== null)) {
        throw accountDeletionUnavailable();
      }
      for (const item of page.items) {
        const courseId = accountUuid(item?.courseId);
        if (seen.has(courseId)) throw accountDeletionUnavailable();
        seen.add(courseId);
        courseIds.push(courseId);
      }
      if (!page.hasMore) return courseIds;
      if (!exactRecord(page.nextCursor, new Set(["beforeUpdatedAt", "beforeId"]))) {
        throw accountDeletionUnavailable();
      }
      const beforeUpdatedAt = String(page.nextCursor.beforeUpdatedAt || "").trim();
      const beforeId = accountUuid(page.nextCursor.beforeId);
      if (!beforeUpdatedAt || !Number.isFinite(Date.parse(beforeUpdatedAt))) {
        throw accountDeletionUnavailable();
      }
      cursor = { beforeUpdatedAt, beforeId };
    }
    throw accountDeletionUnavailable();
  }

  async #deleteAccountStoragePrefix(bucket, prefix, { deadlineAt = null } = {}) {
    for (let batch = 0; batch < ACCOUNT_MAX_STORAGE_BATCHES; batch += 1) {
      const items = await this.#request(
        `${this.supabaseUrl}/storage/v1/object/list/${bucket}`,
        {
          method: "POST",
          headers: supabaseServerHeaders(this.serverApiKey),
          body: JSON.stringify({
            prefix,
            limit: ACCOUNT_STORAGE_BATCH_SIZE,
            offset: 0,
            sortBy: { column: "name", order: "asc" }
          })
        },
        { deadlineAt, responseLimitBytes: 128 * 1024 }
      );
      if (!Array.isArray(items) || items.length > ACCOUNT_STORAGE_BATCH_SIZE) {
        throw accountDeletionUnavailable();
      }
      if (items.length === 0) return;
      const objectKeys = items.map((item) => accountStorageObjectKey(item, prefix));
      if (new Set(objectKeys).size !== objectKeys.length) {
        throw accountDeletionUnavailable();
      }
      await this.#request(
        `${this.supabaseUrl}/storage/v1/object/${bucket}`,
        {
          method: "DELETE",
          headers: supabaseServerHeaders(this.serverApiKey),
          body: JSON.stringify({ prefixes: objectKeys })
        },
        { deadlineAt, responseLimitBytes: 128 * 1024 }
      );
      if (items.length < ACCOUNT_STORAGE_BATCH_SIZE) return;
    }
    throw accountDeletionUnavailable();
  }

  async #deleteMaintenanceObject(bucket, objectPath, { deadlineAt = null } = {}) {
    const normalizedPath = maintenanceObjectPath(objectPath, bucket);
    await this.#request(
      `${this.supabaseUrl}/storage/v1/object/${bucket}`,
      {
        method: "DELETE",
        headers: supabaseServerHeaders(this.serverApiKey),
        body: JSON.stringify({ prefixes: [normalizedPath] })
      },
      { deadlineAt, responseLimitBytes: 128 * 1024 }
    );
  }

  async #deleteRemovedCourseSourcePdf({
    principal,
    courseId,
    requestId,
    deadlineAt = null
  }) {
    const claimed = first(await this.rpc(
      "claim_course_source_pdf_delete_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_request_id: requestId
      },
      { deadlineAt, responseLimitBytes: 4 * 1024 }
    ));
    if (claimed === null) return;
    if (!exactRecord(claimed, new Set(["storagePath"]))) {
      throw unavailableCourseSourcePdf();
    }
    const storagePath = maintenanceObjectPath(
      claimed.storagePath,
      COURSE_SOURCE_ATTACHMENT_BUCKET
    );
    await this.#deleteMaintenanceObject(
      COURSE_SOURCE_ATTACHMENT_BUCKET,
      storagePath,
      { deadlineAt }
    );
    const completed = first(await this.rpc(
      "complete_course_source_pdf_delete_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_request_id: requestId,
        p_storage_path: storagePath
      },
      { deadlineAt, responseLimitBytes: 4 * 1024 }
    ));
    if (completed !== true) throw unavailableCourseSourcePdf();
  }

  async resumeCourseSourcePdfDeletes({
    principal,
    courseId,
    sourceId,
    deadlineAt = null
  }) {
    let deleted = 0;
    for (let claimIndex = 0;
      claimIndex <= COURSE_SOURCE_PDF_MAX_DELETE_CLAIMS;
      claimIndex += 1) {
      const claimed = first(await this.rpc(
        "claim_pending_course_source_pdf_delete_for_source_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_source_id: sourceId
        },
        { deadlineAt, responseLimitBytes: 4 * 1024 }
      ));
      if (claimed === null) return { deleted };
      if (!exactRecord(claimed, new Set(["requestId", "storagePath"])) ||
          typeof claimed.requestId !== "string" ||
          !INTERNAL_REQUEST_ID_PATTERN.test(claimed.requestId)) {
        throw unavailableCourseSourcePdf();
      }
      if (claimIndex === COURSE_SOURCE_PDF_MAX_DELETE_CLAIMS) {
        throw unavailableCourseSourcePdf();
      }
      const storagePath = maintenanceObjectPath(
        claimed.storagePath,
        COURSE_SOURCE_ATTACHMENT_BUCKET
      );
      await this.#deleteMaintenanceObject(
        COURSE_SOURCE_ATTACHMENT_BUCKET,
        storagePath,
        { deadlineAt }
      );
      const completed = first(await this.rpc(
        "complete_course_source_pdf_delete_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_request_id: claimed.requestId,
          p_storage_path: storagePath
        },
        { deadlineAt, responseLimitBytes: 4 * 1024 }
      ));
      if (completed !== true) throw unavailableCourseSourcePdf();
      deleted += 1;
    }
    throw unavailableCourseSourcePdf();
  }

  rpc(functionName, payload, options = {}) {
    return this.#request(`${this.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: supabaseServerHeaders(this.serverApiKey),
      body: JSON.stringify(payload)
    }, options);
  }

  async #userForJwt(jwt, { deadlineAt = null } = {}) {
    const user = await this.#request(`${this.supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${jwt}`
      }
    }, { retry: false, deadlineAt });
    if (!user?.id) {
      throw new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
    }
    return user;
  }

  #applicationActorFromClaims(jwt) {
    const claims = decodeJwtClaims(jwt);
    if (claimText(claims?.client_id) ||
        !audienceIncludes(claims?.aud, "authenticated")) {
      throw new AuthoringApiError(
        401,
        "invalid_application_token",
        "A sessão não foi emitida para a interface do AraLearn."
      );
    }
    const actorId = claimText(claims?.sub).toLowerCase();
    if (!UUID_PATTERN.test(actorId)) {
      throw new AuthoringApiError(
        401,
        "invalid_application_token",
        "A sessão não identifica uma conta válida."
      );
    }
    return actorId;
  }

  async resolveApplicationPrincipal(jwt, { deadlineAt = null } = {}) {
    const actorId = this.#applicationActorFromClaims(jwt);
    const user = await this.#userForJwt(jwt, { deadlineAt });
    if (actorId !== String(user.id).toLowerCase()) {
      throw new AuthoringApiError(
        401,
        "invalid_application_token",
        "A sessão não corresponde à conta autenticada."
      );
    }
    return {
      actorId,
      authenticationKind: "application",
      scopes: ["authoring:read", "authoring:write"]
    };
  }

  async resolveApplicationUser(jwt, { deadlineAt = null } = {}) {
    const principal = await this.resolveApplicationPrincipal(jwt, { deadlineAt });
    return { id: principal.actorId };
  }

  async createActionOAuthClientSetup({
    creatorUserId,
    clientName,
    clientSecretHash
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("create_authoring_action_oauth_client_setup_v4", {
      p_creator_user_id: creatorUserId,
      p_client_name: clientName,
      p_client_secret_hash: clientSecretHash
    }, { deadlineAt, errorDomain: "oauth_request" }));
  }

  async linkActionOAuthClient({
    creatorUserId,
    clientId,
    gptId
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("link_authoring_action_oauth_client_v4", {
      p_creator_user_id: creatorUserId,
      p_client_id: clientId,
      p_gpt_id: gptId
    }, { deadlineAt, errorDomain: "oauth_request" }));
  }

  async createActionOAuthAuthorization({
    clientId,
    redirectUri,
    state,
    scope
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("create_authoring_action_oauth_authorization_v4", {
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_state: state,
      p_scope: scope
    }, { deadlineAt, errorDomain: "oauth_request" }));
  }

  async getActionOAuthAuthorization({
    authorizationId,
    userId
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("get_authoring_action_oauth_authorization_v4", {
      p_authorization_id: authorizationId,
      p_user_id: userId
    }, { deadlineAt, errorDomain: "oauth_request" }));
  }

  async decideActionOAuthAuthorization({
    authorizationId,
    userId,
    action,
    codeHash = null
  }, { deadlineAt = null } = {}) {
    const functionName = action === "approve"
      ? "approve_authoring_action_oauth_authorization_v4"
      : "deny_authoring_action_oauth_authorization_v4";
    return first(await this.rpc(functionName, {
      p_authorization_id: authorizationId,
      p_user_id: userId,
      ...(action === "approve" ? { p_code_hash: codeHash } : {})
    }, { deadlineAt, errorDomain: "oauth_request" }));
  }

  async exchangeActionOAuthCode({
    clientId,
    clientSecretHash,
    codeHash,
    redirectUri,
    accessTokenHash,
    refreshTokenHash,
    grantId
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("exchange_authoring_action_oauth_code_v4", {
      p_client_id: clientId,
      p_client_secret_hash: clientSecretHash,
      p_code_hash: codeHash,
      p_redirect_uri: redirectUri,
      p_access_token_hash: accessTokenHash,
      p_refresh_token_hash: refreshTokenHash,
      p_grant_id: grantId
    }, { deadlineAt, errorDomain: "oauth_grant" }));
  }

  async exchangeActionOAuthRefresh({
    clientId,
    clientSecretHash,
    refreshTokenHash,
    accessTokenHash,
    newRefreshTokenHash
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("exchange_authoring_action_oauth_refresh_v4", {
      p_client_id: clientId,
      p_client_secret_hash: clientSecretHash,
      p_refresh_token_hash: refreshTokenHash,
      p_access_token_hash: accessTokenHash,
      p_new_refresh_token_hash: newRefreshTokenHash
    }, { deadlineAt, errorDomain: "oauth_grant" }));
  }

  async resolveActionPrincipal(accessTokenHash, { deadlineAt = null } = {}) {
    const principal = first(await this.rpc(
      "resolve_authoring_action_oauth_principal_v4",
      { p_access_token_hash: accessTokenHash },
      { deadlineAt, retry: false, responseLimitBytes: 16 * 1024 }
    ));
    if (!principal || principal.active === false) {
      throw new AuthoringApiError(
        401,
        "invalid_oauth_token",
        "O access token não corresponde a uma autorização Actions ativa."
      );
    }
    const actorId = principal.actorId || principal.actor_id
      || principal.actorUserId || principal.actor_user_id;
    if (!UUID_PATTERN.test(String(actorId || ""))) {
      throw new AuthoringApiError(401, "invalid_oauth_token", "Identidade Actions inválida.");
    }
    return {
      actorId,
      authenticationKind: "action",
      scopes: ["authoring:read", "authoring:write"],
      oauthClientId: principal.oauthClientId || principal.oauth_client_id
    };
  }

  async deleteMyAccount({ accessToken, confirmation, deadlineAt = null } = {}) {
    const token = String(accessToken || "").trim();
    if (!token) {
      throw new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
    }
    if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
      throw new AuthoringApiError(
        422,
        "invalid_account_deletion",
        "A confirmação de exclusão da conta é inválida."
      );
    }
    this.#applicationActorFromClaims(token);
    try {
      return await this.#deleteAccountWithJwt(token, confirmation, { deadlineAt });
    } catch (error) {
      if (!(error instanceof AuthoringApiError && error.status === 422 &&
          error.code === "account_storage_not_empty")) {
        if (error instanceof AuthoringApiError &&
            (error.status === 408 || error.status === 429 || error.status >= 500)) {
          throw accountDeletionInProgress();
        }
        throw error;
      }
    }

    try {
      const principal = await this.resolveApplicationPrincipal(token, { deadlineAt });
      const actorId = accountUuid(principal.actorId);
      const courseIds = await this.#ownedCourseIdsForAccount(principal, { deadlineAt });
      for (const courseId of courseIds) {
        await this.#deleteAccountStoragePrefix(
          COURSE_SOURCE_ATTACHMENT_BUCKET,
          `${courseId}/`,
          { deadlineAt }
        );
      }
      await this.#deleteAccountStoragePrefix(
        PERSON_AVATAR_BUCKET,
        `${actorId}/`,
        { deadlineAt }
      );
      return await this.#deleteAccountWithJwt(token, confirmation, { deadlineAt });
    } catch {
      // Depois de AR001, a limpeza física é deliberadamente retomável. Não se
      // pode afirmar se o commit final ocorreu nem apresentar o estado como se
      // nenhuma exclusão tivesse acontecido.
      throw accountDeletionInProgress();
    }
  }

  async resolvePrincipal(authentication, { deadlineAt = null } = {}) {
    if (authentication?.kind !== "oauth") {
      throw new AuthoringApiError(401, "oauth_required", "Conecte sua conta para usar a autoria.");
    }
    const claims = await this.oauthJwtVerifier.verify(authentication.credential, { deadlineAt });
    const identity = assertMcpClaims(claims, {
      issuer: this.oauthIssuer,
      resource: String(authentication.resource || "").trim()
    });
    let resolved;
    try {
      resolved = normalizeMcpOAuthPrincipal(await this.rpc(
        "resolve_mcp_oauth_principal_v1",
        {
          p_pairwise_sub: identity.pairwiseSubject,
          p_pairwise_session_id: identity.pairwiseSessionId,
          p_client_id: identity.clientId,
          p_source_session_id: identity.sourceSessionId
        },
        { deadlineAt, retry: false, responseLimitBytes: 16 * 1024 }
      ), identity.clientId);
    } catch (error) {
      if (error instanceof AuthoringApiError &&
          new Set([401, 403, 404]).has(error.status)) {
        throw new AuthoringApiError(
          401,
          "invalid_oauth_token",
          "O access token não corresponde a uma autorização MCP ativa."
        );
      }
      throw error;
    }
    return {
      actorId: resolved.actorId,
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"],
      oauthClientId: resolved.oauthClientId
    };
  }

  async listCourses({
    principal,
    query = "",
    limit = 24,
    beforeUpdatedAt = null,
    beforeId = null,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("list_owned_courses_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_query: query || null,
      p_limit: limit,
      p_before_updated_at: beforeUpdatedAt,
      p_before_id: beforeId
    }, { deadlineAt }));
    return withDeepLink(result, this.publicAppUrl);
  }

  async getPersonProfile({ principal, deadlineAt = null }) {
    return first(await this.rpc("get_person_profile_for_actor_v1", {
      p_actor_id: principal.actorId
    }, { deadlineAt }));
  }

  async updatePersonProfile({ principal, patch, deadlineAt = null }) {
    return first(await this.rpc("update_person_profile_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_patch: patch
    }, { deadlineAt }));
  }

  async getCourse({ principal, courseId, includeOutline = true, deadlineAt = null }) {
    const result = first(await this.rpc("get_owned_course_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_include_outline: includeOutline
    }, { deadlineAt }));
    return withDeepLink(result, this.publicAppUrl);
  }

  async getCourseInstructionalPlan({
    principal,
    courseId,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("get_owned_course_instructional_plan_for_actor_v3", {
      p_actor_id: principal.actorId,
      p_course_id: courseId
    }, { deadlineAt }));
    if (!jsonRecord(result) ||
        result.contract !== "aralearn.course-instructional-plan.v3" ||
        result.courseId !== courseId || !positiveSafeInteger(result.courseRevision) ||
        !jsonRecord(result.plan) || !positiveSafeInteger(result.plan.version) ||
        !jsonRecord(result.plan.curriculum) ||
        !Array.isArray(result.plan.curriculum.modules) ||
        !Array.isArray(result.plan.curriculumScopeItems) ||
        !Array.isArray(result.plan.instructionalAnalysisUnits)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O serviço devolveu um planejamento curricular inválido."
      );
    }
    return withDeepLink(result, this.publicAppUrl, "planning");
  }

  async getCourseDesign({
    principal,
    courseId,
    scopeKind,
    scopeRef = null,
    childLimit = 32,
    childCursor = null,
    deadlineAt = null
  }) {
    let result;
    try {
      result = first(await this.rpc("get_owned_course_design_for_actor_v2", {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_scope_kind: scopeKind,
        p_scope_ref: scopeRef,
        p_child_limit: childLimit,
        p_child_cursor: childCursor
      }, { deadlineAt, responseLimitBytes: COURSE_DESIGN_RESPONSE_LIMIT_BYTES }));
    } catch (error) {
      if (error instanceof AuthoringApiError && new Set([
        "payload_too_large", "course_response_too_large"
      ]).has(error.code)) {
        throw new AuthoringApiError(
          413,
          "course_design_response_too_large",
          "A leitura do desenho excedeu o limite de 256 KiB. Use um escopo mais específico."
        );
      }
      if (error instanceof AuthoringApiError && error.code === "invalid_course_command") {
        throw new AuthoringApiError(
          422,
          "invalid_course_design_query",
          "O escopo ou cursor não corresponde à navegação do desenho."
        );
      }
      throw error;
    }
    const resourceRuntime = await import(
      "../aralearn/runtime/resources/catalog/resourceCatalog.js"
    );
    const normalized = validateComponentCatalogProjection(result, resourceRuntime);
    const expectedScopeRef = scopeKind === "course" ? courseId : scopeRef;
    if (normalized.courseId !== courseId ||
        normalized.scopeContext.current.kind !== scopeKind ||
        normalized.scopeContext.current.ref !== expectedScopeRef) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A leitura do desenho não corresponde ao Curso e ao escopo solicitados."
      );
    }
    return normalized;
  }

  async getCourseSources({
    principal,
    courseId,
    expectedRevision,
    mode,
    sourceId = null,
    targetKind = null,
    targetId = null,
    cursor = null,
    limit = null,
    deadlineAt = null
  }) {
    const resolvedLimit = limit ?? (mode === "catalog" ? 10 : 1);
    if (mode !== "catalog" && resolvedLimit !== 1) {
      throw new AuthoringApiError(
        422,
        "invalid_course_sources_query",
        "A leitura corrente de Fonte ou alvo usa um único item."
      );
    }
    let result;
    try {
      result = first(await this.rpc("get_owned_course_sources_for_actor_v1", {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_expected_revision: expectedRevision,
        p_mode: mode,
        p_source_id: sourceId,
        p_target_kind: targetKind,
        p_target_id: targetId,
        p_cursor: cursor,
        p_limit: resolvedLimit
      }, {
        deadlineAt,
        responseLimitBytes: COURSE_SOURCES_RESPONSE_LIMIT_BYTES
      }));
    } catch (error) {
      if (error instanceof AuthoringApiError && new Set([
        "payload_too_large", "course_response_too_large"
      ]).has(error.code)) {
        throw new AuthoringApiError(
          413,
          "course_sources_response_too_large",
          "A leitura de Fontes excedeu o limite de 256 KiB. Use uma página menor."
        );
      }
      throw error;
    }
    const normalized = normalizeCourseSourcesDatabaseValue(() =>
      normalizeCourseSourcesRead(result)
    );
    const expectedQuery = { sourceId, targetKind, targetId };
    if (normalized.courseId !== courseId ||
        normalized.courseRevision !== expectedRevision ||
        normalized.mode !== mode ||
        normalized.query.sourceId !== expectedQuery.sourceId ||
        normalized.query.targetKind !== expectedQuery.targetKind ||
        normalized.query.targetId !== expectedQuery.targetId ||
        normalized.nextCursor !== null &&
          !SOURCE_CURSOR_PATTERN.test(normalized.nextCursor) ||
        mode !== "catalog" && (normalized.items.length > 1 ||
          normalized.nextCursor !== null) ||
        mode === "source" && normalized.items.some(({ sourceId: itemSourceId }) =>
          itemSourceId !== sourceId) ||
        mode === "target" && normalized.items.some((item) =>
          item.targetKind !== targetKind || item.targetId !== targetId)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A leitura de Fontes não corresponde ao Curso e à consulta solicitados."
      );
    }
    return normalized;
  }

  async ingestCourseSourcePdf({
    principal,
    courseId,
    expectedCourseRevision,
    requestId,
    sourceIntent,
    fileIdentity,
    bytes,
    mediaType,
    deadlineAt = null
  }) {
    const request = await normalizedCourseSourcePdfIngestionIdentity({
      courseId,
      expectedCourseRevision,
      requestId,
      sourceIntent,
      fileIdentity: fileIdentity ?? {
        fileId: `received-pdf:${requestId}`,
        fileName: null,
        mediaType: COURSE_SOURCE_PDF_MEDIA_TYPE
      }
    });
    if (mediaType !== COURSE_SOURCE_PDF_MEDIA_TYPE) throw invalidCourseSourcePdf();
    const pdfBytes = courseSourcePdfBytes(bytes);
    const contentHash = await sha256Hex(pdfBytes);
    const normalizedIntent = request.sourceIntent;
    let attachment = {
      contentHash,
      byteSize: pdfBytes.byteLength,
      mediaType: COURSE_SOURCE_PDF_MEDIA_TYPE,
      storagePath: `${request.courseId}/${contentHash}.pdf`
    };
    const finalize = () => this.#finalizeCourseSourcePdfIngestion({
      principal,
      courseId: request.courseId,
      expectedCourseRevision: request.expectedCourseRevision,
      requestId: request.requestId,
      sourceIntent: normalizedIntent,
      attachment,
      fileIdentity: request.fileIdentity,
      deadlineAt
    });
    let preparation;
    try {
      try {
        preparation = await this.#prepareCourseSourcePdfIngestion({
          principal,
          courseId: request.courseId,
          expectedCourseRevision: request.expectedCourseRevision,
          requestId: request.requestId,
          sourceIntent: normalizedIntent,
          attachment,
          deadlineAt
        });
        attachment = preparation.attachment;
      } catch (error) {
        if (error instanceof AuthoringApiError && error.code === "stale_course_state") {
          return await finalize();
        }
        throw error;
      }

      for (let attempt = 1; preparation.uploadRequired; attempt += 1) {
        const outcome = await this.#uploadCourseSourcePdf(attachment, pdfBytes, {
          deadlineAt
        });
        if (outcome === "created" || outcome === "conflict") break;
        try {
          preparation = await this.#prepareCourseSourcePdfIngestion({
            principal,
            courseId: request.courseId,
            expectedCourseRevision: request.expectedCourseRevision,
            requestId: request.requestId,
            sourceIntent: normalizedIntent,
            attachment,
            deadlineAt
          });
          attachment = preparation.attachment;
        } catch (error) {
          if (error instanceof AuthoringApiError && error.code === "stale_course_state") {
            return await finalize();
          }
          throw error;
        }
        if (preparation.uploadRequired && attempt >= this.attempts) {
          throw unavailableCourseSourcePdf();
        }
      }

      await this.#verifyCourseSourcePdf(attachment, {
        deadlineAt,
        requireStructure: true
      });
      return await finalize();
    } catch (error) {
      await this.#cancelCourseSourcePdfIngestion({
        principal,
        courseId: request.courseId,
        requestId: request.requestId,
        storagePath: attachment.storagePath,
        deadlineAt
      }).catch(() => undefined);
      throw error;
    }
  }

  async getCourseSourcePdfDownload({
    principal,
    courseId,
    expectedRevision,
    sourceId,
    sourceRevision,
    contentHash,
    deadlineAt = null
  }) {
    const raw = first(await this.rpc("get_course_source_pdf_download_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_course_revision: expectedRevision,
      p_source_id: sourceId,
      p_source_revision: sourceRevision,
      p_content_hash: contentHash
    }, {
      deadlineAt,
      responseLimitBytes: 32 * 1024
    }));
    const storageBaseUrl = `${this.supabaseUrl}/storage/v1`;
    const publicStorageBaseUrl = `${this.publicSupabaseUrl}/storage/v1`;
    const signed = await this.#request(
      `${storageBaseUrl}/object/sign/${COURSE_SOURCE_ATTACHMENT_BUCKET}/` +
        storageObjectPath(raw?.attachment?.storagePath),
      {
        method: "POST",
        headers: supabaseServerHeaders(this.serverApiKey),
        body: JSON.stringify({ expiresIn: COURSE_SOURCE_DOWNLOAD_EXPIRY_SECONDS })
      },
      { retry: false, deadlineAt, responseLimitBytes: 16 * 1024 }
    );
    const normalized = normalizeCourseSourcesDatabaseValue(() =>
      normalizeCourseSourcePdfDownload({
        ...raw,
        signedUrl: signedStorageUrl(
          publicStorageBaseUrl,
          signed?.signedURL,
          { download: true }
        ),
        expiresAt: new Date(
          Date.now() + COURSE_SOURCE_DOWNLOAD_EXPIRY_SECONDS * 1_000
        ).toISOString()
      })
    );
    if (normalized.courseId !== courseId ||
        normalized.courseRevision !== expectedRevision ||
        normalized.sourceId !== sourceId ||
        normalized.sourceRevision !== sourceRevision ||
        normalized.attachment.contentHash !== contentHash) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O download do PDF não corresponde ao Curso e à Fonte solicitados."
      );
    }
    return normalized;
  }

  async getCourseAnchoredAnnotations({
    principal,
    courseId,
    expectedCourseRevision,
    annotationSetVersion = null,
    query,
    cursor = null,
    limit = 12,
    deadlineAt = null
  }) {
    const options = normalizeCourseAnchoredAnnotationsInputValue(() =>
      normalizeCourseAnchoredAnnotationReadOptions({
        expectedCourseRevision,
        annotationSetVersion,
        query,
        cursor,
        limit
      })
    );
    let result;
    try {
      result = first(await this.rpc(
        "get_owned_course_anchored_annotations_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_expected_course_revision: options.expectedCourseRevision,
          p_annotation_set_version: options.annotationSetVersion,
          p_mode: options.query.mode,
          p_origins: options.query.origins,
          p_channels: options.query.channels,
          p_states: options.query.states,
          p_categories: options.query.categories,
          p_include_uncategorized: options.query.includeUncategorized,
          p_subject_ids: options.query.subjectIds,
          p_target_kind: options.query.hierarchy?.target.kind ?? null,
          p_target_id: options.query.hierarchy?.target.id ?? null,
          p_include_descendants: options.query.hierarchy?.includeDescendants ?? false,
          p_annotation_id: options.query.annotationId,
          p_cursor: options.cursor,
          p_limit: options.limit
        },
        {
          deadlineAt,
          responseLimitBytes: COURSE_ANCHORED_ANNOTATIONS_RESPONSE_LIMIT_BYTES
        }
      ));
    } catch (error) {
      throw courseAnchoredAnnotationsResponseFailure(error);
    }
    const normalized = normalizeCourseAnchoredAnnotationsDatabaseValue(() =>
      normalizeCourseAnchoredAnnotationPage(result)
    );
    if (normalized.courseId !== courseId ||
        normalized.courseRevision !== options.expectedCourseRevision ||
        options.annotationSetVersion !== null &&
          normalized.annotationSetVersion !== options.annotationSetVersion ||
        JSON.stringify(normalizeCourseAnchoredAnnotationQuery(normalized.query)) !==
          JSON.stringify(options.query) ||
        normalized.items.some((annotation) => annotation.courseId !== courseId)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A leitura de observações não corresponde ao Curso e à consulta solicitados."
      );
    }
    return normalized;
  }

  async getCourseAuthoringAnalytics({
    principal,
    courseId,
    expectedCourseRevision,
    query,
    deadlineAt = null
  }) {
    const normalizedQuery = normalizeCourseAuthoringAnalyticsInputValue(() =>
      normalizeCourseAuthoringAnalyticsQuery(query)
    );
    let raw;
    try {
      raw = first(await this.rpc(
        "get_owned_course_authoring_analytics_for_actor_v2",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_expected_course_revision: expectedCourseRevision,
          p_query: normalizedQuery
        },
        {
          deadlineAt,
          responseLimitBytes: COURSE_AUTHORING_ANALYTICS_RESPONSE_LIMIT_BYTES
        }
      ));
    } catch (error) {
      if (error instanceof AuthoringApiError && new Set([
        "payload_too_large", "course_response_too_large"
      ]).has(error.code)) {
        throw new AuthoringApiError(
          413,
          "course_authoring_analytics_response_too_large",
          "O snapshot de Analytics excedeu 512 KiB. Use um escopo menor."
        );
      }
      throw error;
    }
    return normalizeCourseAuthoringAnalyticsDatabaseValue(() =>
      assembleCourseAuthoringAnalyticsPage(raw, {
        publicAppUrl: this.publicAppUrl,
        expectedCourseId: courseId,
        expectedQuery: normalizedQuery
      })
    );
  }

  async listCourseEntities({
    principal,
    courseId,
    expectedRevision,
    limit = 50,
    afterEntityType = null,
    afterEntityId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_owned_course_entities_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedRevision,
      p_limit: limit,
      p_after_entity_type: afterEntityType,
      p_after_entity_id: afterEntityId
    }, { deadlineAt }));
  }

  async listCourseStudyUnits({
    principal,
    courseId,
    expectedRevision,
    scopeKind,
    scopeId = null,
    anchorStudyUnitId = null,
    cursorStudyUnitId = null,
    direction = "forward",
    limit = 12,
    maxBytes = 512 * 1024,
    deadlineAt = null
  }) {
    const result = first(await this.rpc(
      "list_owned_course_study_units_for_actor_v2",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_expected_revision: expectedRevision,
        p_scope_kind: scopeKind,
        p_scope_id: scopeId,
        p_anchor_study_unit_id: anchorStudyUnitId,
        p_cursor_study_unit_id: cursorStudyUnitId,
        p_direction: direction,
        p_limit: limit,
        p_max_bytes: maxBytes
      },
      { deadlineAt }
    ));
    const { validateCourseEntityContent } = await import(
      "../aralearn/runtime/domain/courseEntities.js"
    );
    return withInspectionDeepLinks(normalizeInspectionPage(result, {
      courseId,
      expectedRevision,
      scopeKind,
      scopeId
    }, validateCourseEntityContent), this.publicAppUrl);
  }


  async listCourseAccess({ principal, courseId, deadlineAt = null }) {
    return first(await this.rpc("list_course_access_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId
    }, { deadlineAt }));
  }

  async manageCourseAccess({
    principal,
    courseId,
    operation,
    email = null,
    targetUserId = null,
    confirmed,
    requestId,
    deadlineAt = null
  }) {
    return first(await this.rpc("manage_course_access_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_operation: operation,
      p_target_email: email,
      p_target_user_id: targetUserId,
      p_confirmed: confirmed,
      p_request_id: requestId
    }, { deadlineAt }));
  }

  async maintainCourse({
    principal,
    courseId,
    operation,
    confirmed,
    requestId,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("maintain_course_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_operation: operation,
      p_confirmed: confirmed,
      p_request_id: requestId
    }, { deadlineAt, timeoutMs: 60_000 }));
    if (!exactRecord(result, new Set([
      "contract", "courseId", "operation", "status", "changed", "requestId"
    ])) || result.contract !== "aralearn.course-lifecycle.v1" ||
        result.courseId !== courseId || result.operation !== operation ||
        result.requestId !== requestId || typeof result.changed !== "boolean" ||
        !new Set(["completed", "already_absent"]).has(result.status)) {
      throw new AuthoringApiError(
        503,
        "invalid_course_lifecycle_state",
        "O serviço devolveu um ciclo de vida de Curso inválido."
      );
    }
    // Um PDF sob o prefixo do Curso excluído pode continuar legitimamente
    // vinculado a outro Curso por deduplicação. A limpeza física precisa passar
    // pela manutenção que revalida cada objeto, nunca por delete amplo de prefixo.
    const fileCleanupPending = operation === "delete_owned_course" && result.changed;
    return { ...result, fileCleanupPending };
  }

  async getCurrentMaintenance({ principal, limit = 100, deadlineAt = null }) {
    const result = first(await this.rpc("get_current_maintenance_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_limit: limit
    }, { deadlineAt, responseLimitBytes: 512 * 1024 }));
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        result.contract !== "aralearn.current-maintenance.v1" ||
        result.role !== "administrator" ||
        !result.inventory || typeof result.inventory !== "object" ||
        !Array.isArray(result.inventory.items)) {
      throw new AuthoringApiError(
        503,
        "invalid_maintenance_state",
        "O serviço devolveu um estado de Manutenção inválido."
      );
    }
    return result;
  }

  async executeCurrentMaintenance({
    principal,
    operation,
    confirmed,
    limit = 100,
    classification = null,
    objectPath = null,
    deadlineAt = null
  }) {
    let result;
    if (operation === "run_retention") {
      result = first(await this.rpc("run_current_retention_for_actor_v1", {
        p_actor_id: principal.actorId,
        p_limit: limit,
        p_confirmed: confirmed
      }, { deadlineAt, timeoutMs: 60_000 }));
      if (result?.contract !== "aralearn.current-data-retention.v1") {
        throw new AuthoringApiError(
          503,
          "invalid_maintenance_state",
          "A retenção devolveu um resultado inválido."
        );
      }
    } else {
      const authorization = first(await this.rpc(
        "authorize_current_orphan_removal_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_classification: classification,
          p_object_path: objectPath,
          p_confirmed: confirmed
        },
        { deadlineAt }
      ));
      if (!authorization || authorization.authorized !== true ||
          authorization.contract !== "aralearn.current-maintenance-removal.v1" ||
          authorization.classification !== classification ||
          authorization.objectPath !== objectPath) {
        throw new AuthoringApiError(
          503,
          "invalid_maintenance_state",
          "A autorização de remoção do resíduo é inválida."
        );
      }
      await this.#deleteMaintenanceObject(
        authorization.bucketId,
        authorization.objectPath,
        { deadlineAt }
      );
      result = { ...authorization, removed: true };
    }
    return {
      contract: "aralearn.current-maintenance-action.v1",
      operation,
      result,
      state: await this.getCurrentMaintenance({ principal, limit: 100, deadlineAt })
    };
  }

  async createCourse({ principal, requestId, title, objective, deadlineAt = null }) {
    const result = first(await this.rpc("create_course_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_title: title,
      p_objective: objective,
      p_request_id: requestId
    }, { deadlineAt }));
    return withDeepLink(result, this.publicAppUrl);
  }

  async saveCourseCurricularMap({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    expectedPlanVersion,
    approved,
    curricularMap,
    deadlineAt = null
  }) {
    if (typeof approved !== "boolean" || !jsonRecord(curricularMap)) {
      throw new AuthoringApiError(
        422,
        "invalid_course_curricular_map",
        "O mapa curricular é inválido."
      );
    }
    const normalizedMap = structuredClone(curricularMap);
    const requestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify({
      courseId,
      expectedCourseRevision,
      expectedPlanVersion,
      approved,
      curricularMap: normalizedMap
    })));
    const result = first(await this.rpc(
      "save_course_curricular_map_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_expected_course_revision: expectedCourseRevision,
        p_expected_plan_version: expectedPlanVersion,
        p_approved: approved,
        p_curricular_map: normalizedMap,
        p_request_id: requestId,
        p_request_hash: requestHash
      },
      { deadlineAt, timeoutMs: 40_000, responseLimitBytes: 32 * 1024 }
    ));
    const fields = new Set([
      "contract", "courseId", "courseRevision", "planVersion",
      "approval", "changed", "idempotent"
    ]);
    if (!exactRecord(result, fields) ||
        result.contract !== "aralearn.course-curricular-map-change.v1" ||
        result.courseId !== courseId ||
        result.approval !== (approved ? "approved" : "draft") ||
        typeof result.changed !== "boolean" || typeof result.idempotent !== "boolean" ||
        !positiveSafeInteger(result.courseRevision) ||
        !positiveSafeInteger(result.planVersion) ||
        result.courseRevision < expectedCourseRevision ||
        result.planVersion < expectedPlanVersion ||
        !result.idempotent && (
          result.courseRevision !== expectedCourseRevision + (result.changed ? 1 : 0) ||
          result.planVersion !== expectedPlanVersion + (result.changed ? 1 : 0)
        )) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação do mapa curricular é inválida."
      );
    }
    return withDeepLink(result, this.publicAppUrl, "planning");
  }


  async saveCourseAuthoringPart({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    expectedPlanVersion,
    part,
    deadlineAt = null
  }) {
    if (!jsonRecord(part)) {
      throw new AuthoringApiError(
        422,
        "invalid_course_authoring_part",
        "A Parte aprovada é inválida."
      );
    }
    const normalizedPart = structuredClone(part);
    const requestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify({
      courseId,
      expectedCourseRevision,
      expectedPlanVersion,
      part: normalizedPart
    })));
    const result = first(await this.rpc(
      "save_course_authoring_part_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_expected_course_revision: expectedCourseRevision,
        p_expected_plan_version: expectedPlanVersion,
        p_part: normalizedPart,
        p_request_id: requestId,
        p_request_hash: requestHash
      },
      { deadlineAt, timeoutMs: 40_000, responseLimitBytes: 32 * 1024 }
    ));
    const fields = new Set([
      "contract", "courseId", "courseRevision", "planVersion",
      "authoringPartId", "changed", "idempotent"
    ]);
    if (!jsonRecord(result) || Object.keys(result).length !== fields.size ||
        Object.keys(result).some((field) => !fields.has(field)) ||
        result.contract !== "aralearn.course-authoring-part-change.v1" ||
        result.courseId !== courseId || result.authoringPartId !== normalizedPart.partId ||
        typeof result.changed !== "boolean" || typeof result.idempotent !== "boolean" ||
        !Number.isSafeInteger(result.courseRevision) ||
        !Number.isSafeInteger(result.planVersion) ||
        result.courseRevision < expectedCourseRevision ||
        result.planVersion < expectedPlanVersion ||
        !result.idempotent && (
          result.courseRevision !== expectedCourseRevision + (result.changed ? 1 : 0) ||
          result.planVersion !== expectedPlanVersion + (result.changed ? 1 : 0)
        )) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação da Parte aprovada é inválida."
      );
    }
    return withDeepLink(result, this.publicAppUrl, "planning");
  }

  async applyCourseDesignCommand({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    command,
    deadlineAt = null
  }) {
    const normalizedCommand = normalizeCourseDesignInputValue(() =>
      normalizeCourseDesignCommand(command)
    );
    const requestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify({
      courseId,
      expectedCourseRevision,
      command: normalizedCommand
    })));
    const result = first(await this.rpc("apply_course_design_command_for_actor_v2", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_course_revision: expectedCourseRevision,
      p_command: normalizedCommand,
      p_request_id: requestId,
      p_request_hash: requestHash,
      p_channel: authoringChannel(principal)
    }, {
      deadlineAt,
      timeoutMs: 40_000,
      responseLimitBytes: COURSE_DESIGN_RESPONSE_LIMIT_BYTES
    }));
    const normalized = normalizeCourseDesignDatabaseValue(() => normalizeCourseDesignChange(result));
    const expectedScope = normalizedCommand.scope || null;
    if (normalized.courseId !== courseId || normalized.requestId !== requestId ||
        normalized.change != null && (
          normalized.change.type !== normalizedCommand.type || expectedScope != null && (
            normalized.change.scope.kind !== expectedScope.kind ||
            normalized.change.scope.ref !== expectedScope.ref
          )
        )) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação do desenho não corresponde ao comando solicitado."
      );
    }
    return normalized;
  }

  async executeCourseSourceCommand({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    command,
    deadlineAt = null
  }) {
    const normalizedCommand = normalizeCourseSourcesInputValue(() =>
      normalizeCourseSourceCommand(command)
    );
    const execute = () => this.rpc(
      normalizedCommand.type === "remove_pdf"
        ? "remove_course_source_pdf_for_actor_v1"
        : "execute_course_source_command_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_expected_revision: expectedCourseRevision,
        p_command: normalizedCommand,
        p_channel: authoringChannel(principal),
        p_request_id: requestId
      }, {
        deadlineAt,
        timeoutMs: 40_000,
        responseLimitBytes: COURSE_SOURCES_RESPONSE_LIMIT_BYTES
      }
    );
    const result = first(await execute());
    const normalized = normalizeCourseSourcesDatabaseValue(() =>
      normalizeCourseSourceChange(result)
    );
    if (normalized.courseId !== courseId || normalized.requestId !== requestId ||
        normalized.courseRevision !==
          expectedCourseRevision + (normalized.changed ? 1 : 0) ||
        normalized.change != null && (
          normalized.change.type !== normalizedCommand.type ||
          normalized.change.subjectId !== courseSourceCommandSubjectId(normalizedCommand) ||
          normalizedCommand.type === "set_target_sources" &&
            normalized.change.targetVersion !== normalizedCommand.expectedTargetVersion
        )) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação de Fontes não corresponde ao comando solicitado."
      );
    }
    if (normalizedCommand.type === "remove_pdf") {
      await this.#deleteRemovedCourseSourcePdf({
        principal,
        courseId,
        requestId,
        deadlineAt
      });
    }
    return normalized;
  }

  async executeCourseAnchoredAnnotationCommand({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    command,
    deadlineAt = null
  }) {
    const normalizedCommand = normalizeCourseAnchoredAnnotationsInputValue(() =>
      normalizeCourseAnchoredAnnotationCommand(command)
    );
    const requiresCourseRevision = new Set([
      "create_anchored_annotation",
      "correct_anchored_annotation_subjects"
    ]).has(normalizedCommand.type);
    if (requiresCourseRevision !== (expectedCourseRevision !== null)) {
      throw new AuthoringApiError(
        422,
        "invalid_course_anchored_annotation_command",
        requiresCourseRevision
          ? "O comando exige a revisão corrente do Curso."
          : "O comando usa somente a versão da observação."
      );
    }
    const channel = anchoredAnnotationChannel(principal);
    let result;
    try {
      result = first(await this.rpc(
        "execute_course_anchored_annotation_command_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_expected_course_revision: expectedCourseRevision,
          p_command: normalizedCommand,
          p_channel: channel,
          p_request_id: requestId
        },
        {
          deadlineAt,
          timeoutMs: 40_000,
          responseLimitBytes: COURSE_ANCHORED_ANNOTATIONS_RESPONSE_LIMIT_BYTES
        }
      ));
    } catch (error) {
      throw courseAnchoredAnnotationsResponseFailure(error);
    }
    const normalized = normalizeCourseAnchoredAnnotationsDatabaseValue(() =>
      normalizeCourseAnchoredAnnotationChange(result)
    );
    const annotation = normalized.annotation;
    if (normalized.courseId !== courseId || normalized.requestId !== requestId ||
        expectedCourseRevision !== null && (
          normalized.idempotent
            ? normalized.courseRevision < expectedCourseRevision
            : normalized.courseRevision !== expectedCourseRevision
        ) ||
        annotation !== null && (
          annotation.courseId !== courseId ||
          annotation.annotationId !== normalizedCommand.annotationId
        ) ||
        normalizedCommand.type === "create_anchored_annotation" &&
          annotation !== null && (
            annotation.target.kind !== normalizedCommand.target.kind ||
            annotation.target.id !== normalizedCommand.target.id ||
            annotation.provenance.origin !== "author" ||
            annotation.provenance.channel !== channel
          )) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação da observação não corresponde ao comando solicitado."
      );
    }
    return normalized;
  }

  async createCourseAnchoredAnnotations({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    commands,
    deadlineAt = null
  }) {
    if (!Array.isArray(commands) || commands.length < 1 || commands.length > 64) {
      throw new AuthoringApiError(
        422,
        "invalid_course_anchored_annotation_batch",
        "Informe de 1 a 64 Observações para registrar."
      );
    }
    const normalizedCommands = commands.map((command) =>
      normalizeCourseAnchoredAnnotationsInputValue(() =>
        normalizeCourseAnchoredAnnotationCommand(command)
      ));
    if (normalizedCommands.some(({ type }) => type !== "create_anchored_annotation") ||
        new Set(normalizedCommands.map(({ annotationId }) => annotationId)).size !==
          normalizedCommands.length ||
        new Set(normalizedCommands.map(({ target }) => `${target.kind}\0${target.id}`)).size !==
          normalizedCommands.length) {
      throw new AuthoringApiError(
        422,
        "invalid_course_anchored_annotation_batch",
        "O registro em lote precisa criar uma Observação distinta por alvo."
      );
    }
    let result;
    try {
      result = first(await this.rpc(
        "create_course_anchored_annotations_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_expected_course_revision: expectedCourseRevision,
          p_commands: normalizedCommands,
          p_channel: anchoredAnnotationChannel(principal),
          p_request_id: requestId
        },
        {
          deadlineAt,
          timeoutMs: 40_000,
          responseLimitBytes: 32 * 1024
        }
      ));
    } catch (error) {
      throw courseAnchoredAnnotationsResponseFailure(error);
    }
    const fields = new Set([
      "contract", "courseId", "courseRevision", "annotationSetVersion",
      "requestId", "idempotent", "changed", "createdCount"
    ]);
    if (!jsonRecord(result) || Object.keys(result).length !== fields.size ||
        Object.keys(result).some((field) => !fields.has(field)) ||
        result.contract !== "aralearn.course-anchored-annotations-change.v1" ||
        result.courseId !== courseId || result.courseRevision !== expectedCourseRevision ||
        result.requestId !== requestId || typeof result.idempotent !== "boolean" ||
        result.changed !== true || result.createdCount !== normalizedCommands.length ||
        !Number.isSafeInteger(result.annotationSetVersion) ||
        result.annotationSetVersion < normalizedCommands.length) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação do registro de Observações é inválida."
      );
    }
    return result;
  }

  async materializeCourseAuthoringPart({
    principal,
    courseId,
    authoringPartId,
    requestId,
    expectedCourseRevision,
    expectedAuthoringPartVersion,
    planItemUpserts = [],
    targetPlanItems = [],
    units,
    deadlineAt = null
  }) {
    if (!Array.isArray(planItemUpserts) || planItemUpserts.length > 256 ||
        !Array.isArray(targetPlanItems) || targetPlanItems.length < 1 ||
        targetPlanItems.length > 64 ||
        !Array.isArray(units) || units.length < 1 || units.length > 64) {
      throw new AuthoringApiError(
        422,
        "invalid_course_part_materialization",
        "A Parte precisa conter de 1 a 64 Unidades."
      );
    }
    const normalizedPlanItemUpserts = structuredClone(planItemUpserts);
    const normalizedTargetPlanItems = structuredClone(targetPlanItems);
    const normalizedUnits = structuredClone(units);
    if (new TextEncoder().encode(JSON.stringify({
      planItemUpserts: normalizedPlanItemUpserts,
      targetPlanItems: normalizedTargetPlanItems,
      units: normalizedUnits
    })).byteLength > 1_500_000) {
      throw new AuthoringApiError(
        413,
        "course_part_materialization_too_large",
        "A Parte excede o limite de materialização atômica."
      );
    }
    const requestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify({
      courseId,
      authoringPartId,
      expectedCourseRevision,
      expectedAuthoringPartVersion,
      planItemUpserts: normalizedPlanItemUpserts,
      targetPlanItems: normalizedTargetPlanItems,
      units: normalizedUnits
    })));
    const result = first(await this.rpc(
      "materialize_course_authoring_part_for_actor_v2",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_authoring_part_id: authoringPartId,
        p_expected_course_revision: expectedCourseRevision,
        p_expected_authoring_part_version: expectedAuthoringPartVersion,
        p_plan_item_upserts: normalizedPlanItemUpserts,
        p_target_plan_items: normalizedTargetPlanItems,
        p_units: normalizedUnits,
        p_request_id: requestId,
        p_request_hash: requestHash
      },
      {
        deadlineAt,
        timeoutMs: 60_000,
        responseLimitBytes: 32 * 1024
      }
    ));
    const allowed = new Set([
      "contract", "courseId", "courseRevision", "authoringPartId",
      "changed", "studyUnitCount", "idempotent"
    ]);
    if (!jsonRecord(result) ||
        Object.keys(result).length !== allowed.size ||
        Object.keys(result).some((field) => !allowed.has(field)) ||
        result.contract !== "aralearn.course-part-materialization.v1" ||
        result.courseId !== courseId || result.authoringPartId !== authoringPartId ||
        result.studyUnitCount !== normalizedUnits.length ||
        typeof result.changed !== "boolean" || typeof result.idempotent !== "boolean" ||
        !Number.isSafeInteger(result.courseRevision) ||
        result.courseRevision < expectedCourseRevision ||
        !result.idempotent &&
          result.courseRevision !== expectedCourseRevision + (result.changed ? 1 : 0)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação da materialização da Parte é inválida."
      );
    }
    return {
      ...result,
      deepLink: `${this.publicAppUrl}/#/authoring/courses/${encodeURIComponent(courseId)}` +
        `?section=content&studyUnitId=${encodeURIComponent(normalizedUnits[0].studyUnitId)}`
    };
  }

  async commitCourseComposition({
    principal,
    courseId,
    requestId,
    expectedRevision,
    expectedStudyUnitVersion = null,
    applicationOrigin = null,
    upserts = [],
    deletes = [],
    sourceAttributionApplications = [],
    deadlineAt = null
  }) {
    const channel = authoringChannel(principal);
    const hasExpectedStudyUnitVersion = expectedStudyUnitVersion !== null;
    const hasApplicationOrigin = applicationOrigin !== null;
    const contextualApplication = channel === "application" &&
      hasExpectedStudyUnitVersion && hasApplicationOrigin;
    const genericApplication = channel === "application" &&
      !hasExpectedStudyUnitVersion && !hasApplicationOrigin;
    if (channel === "application" && !genericApplication && (
      !contextualApplication ||
      !new Set(["manual", "provider_assistance"]).has(applicationOrigin) ||
      !Number.isSafeInteger(expectedStudyUnitVersion) || expectedStudyUnitVersion < 1 ||
      upserts.length !== 1 || upserts[0]?.entityType !== "study_unit" ||
      deletes.length !== 0
    ) || channel === "mcp" && (
      applicationOrigin !== null || expectedStudyUnitVersion !== null
    )) {
      throw new AuthoringApiError(
        422,
        "invalid_course_composition_origin",
        "A origem ou o escopo da composição é inválido."
      );
    }
    const normalizedApplications = normalizeCourseSourcesInputValue(() =>
      normalizeSourceAttributionApplications(sourceAttributionApplications)
    );
    const rpcInput = {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedRevision,
      p_expected_study_unit_version: expectedStudyUnitVersion,
      p_upserts: upserts,
      p_deletes: deletes,
      p_source_attribution_applications: normalizedApplications,
      p_channel: channel,
      p_application_origin: applicationOrigin,
      p_request_id: requestId
    };
    const result = first(await this.rpc(
      "commit_course_composition_for_actor_v1",
      rpcInput,
      { deadlineAt, timeoutMs: 40_000 }
    ));
    return withDeepLink(result, this.publicAppUrl);
  }

  async commitPersonalCourseCopyEdit({
    principal,
    sourceCourseId,
    requestId,
    expectedSourceCourseRevision,
    expectedStudyUnitVersion,
    didacticMicrosequenceId,
    studyUnit,
    applicationOrigin,
    deadlineAt = null
  }) {
    if (authoringChannel(principal) !== "application" ||
        strictUuid(sourceCourseId) !== sourceCourseId ||
        !positiveSafeInteger(expectedSourceCourseRevision) ||
        !positiveSafeInteger(expectedStudyUnitVersion) ||
        typeof didacticMicrosequenceId !== "string" ||
        !didacticMicrosequenceId || didacticMicrosequenceId !== didacticMicrosequenceId.trim() ||
        [...didacticMicrosequenceId].length > 240 ||
        !new Set(["manual", "provider_assistance"]).has(applicationOrigin)) {
      throw new AuthoringApiError(
        422,
        "invalid_personal_course_copy_edit",
        "A edição da cópia pessoal é inválida."
      );
    }
    const { validateCourseEntityContent } = await import(
      "../aralearn/runtime/domain/courseEntities.js"
    );
    const validation = validateCourseEntityContent("study_unit", studyUnit);
    if (!validation.valid) {
      throw new AuthoringApiError(
        422,
        "invalid_course_contract",
        "A Unidade não satisfaz o contrato didático do Curso.",
        { errors: validation.errors.slice(0, 12) }
      );
    }
    const normalizedStudyUnit = validation.normalized;
    const content = { ...normalizedStudyUnit };
    delete content.id;
    delete content.position;
    const upsert = {
      entityType: "study_unit",
      entityId: normalizedStudyUnit.id,
      parentType: "microsequence",
      parentId: didacticMicrosequenceId,
      position: normalizedStudyUnit.position,
      content
    };
    const raw = await this.rpc(
      "commit_personal_course_copy_edit_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_source_course_id: sourceCourseId,
        p_expected_source_revision: expectedSourceCourseRevision,
        p_expected_study_unit_version: expectedStudyUnitVersion,
        p_upsert: upsert,
        p_application_origin: applicationOrigin,
        p_request_id: requestId
      },
      { deadlineAt, timeoutMs: 40_000 }
    );
    return normalizePersonalCourseCopyEdit(raw, {
      sourceCourseId,
      expectedSourceCourseRevision,
      expectedStudyUnitVersion,
      studyUnitId: normalizedStudyUnit.id,
      applicationOrigin
    });
  }
}
