import { AuthoringApiError } from "./errors.js";
import { decodeJwtClaims } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";
import { SupabaseOAuthJwtVerifier } from "./oauthJwtVerifier.js";
import {
  applyCourseAuthoringPlanCommand,
  CourseAuthoringPlanError,
  normalizeCourseAuthoringPlan,
  normalizeCourseAuthoringPlanCommand
} from "../aralearn/runtime/domain/courseAuthoringPlan.js";
import {
  COURSE_COMPONENT_CATALOG_VERSION,
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  CourseDesignParametersError,
  normalizeCourseAuthoringGuidanceInterpretation,
  normalizeCourseComponentPolicy,
  normalizeCourseDesignChange,
  normalizeCourseDesignParameterValue,
  normalizeCourseDesignRead
} from "../aralearn/runtime/domain/courseDesignParameters.js";
import {
  COURSE_DESIGN_CONTEXT_V2_CONTRACT,
  COURSE_SOURCE_PDF_MEDIA_TYPE,
  COURSE_SOURCE_PDF_MAX_BYTES,
  CourseSourcesError,
  normalizeCourseSourceAttachmentAccess,
  normalizeCourseSourceAttributionApplication,
  normalizeCourseSourceChange,
  normalizeCourseSourceCommand,
  normalizeCourseSourceContext,
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
  CourseAuditCycleError,
  normalizeCourseAuditCycleChange,
  normalizeCourseAuditCycleCommand,
  normalizeCourseAuditCyclePage,
  normalizeCourseAuditCycleQuery,
  normalizeCourseAuditCycleReadOptions,
  normalizeCourseAuditCycleServerCommand
} from "../aralearn/runtime/domain/courseAuditCycle.js";
import {
  CourseVariantError,
  normalizeCourseVariantChange,
  normalizeCourseVariantCommand,
  normalizeCourseVariantComparison,
  normalizeCourseVariantComparisonList,
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantRead
} from "../aralearn/runtime/domain/courseVariants.js";
import {
  CourseAuthoringAnalyticsError,
  assembleCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../aralearn/runtime/domain/courseAuthoringAnalytics.js";

const DEFAULT_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const COURSE_VARIANT_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_AUTHORING_ANALYTICS_RESPONSE_LIMIT_BYTES = 512 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MATERIALIZATION_FIELDS = new Set([
  "id", "authoringPartVersion", "channel", "status", "version", "designContext",
  "contextHash", "resultFacts", "startedAt", "updatedAt", "completedAt", "steps",
  "nextPendingStep"
]);
const MATERIALIZATION_STEP_FIELDS = new Set([
  "id", "position", "kind", "targetDidacticMicrosequenceId", "productionPosition",
  "status", "version", "resultFacts", "updatedAt", "completedAt"
]);
const MATERIALIZATION_CHANGE_FIELDS = new Set([
  "contract", "courseId", "courseRevision", "authoringPartId", "operation",
  "channel", "changed", "idempotent", "materialization", "step", "entities"
]);
const MATERIALIZATION_CHANGE_STATE_FIELDS = new Set([
  "id", "status", "version", "authoringPartVersion", "completedStepCount",
  "failedStepCount", "totalStepCount", "nextPendingStep", "updatedAt",
  "completedAt", "designContext", "contextHash"
]);
const MATERIALIZATION_CHANGE_NEXT_STEP_FIELDS = new Set([
  "id", "position", "kind", "targetDidacticMicrosequenceId", "productionPosition"
]);
const MATERIALIZATION_CHANGE_STEP_FIELDS = new Set(["id", "status", "version"]);
const MATERIALIZATION_CHANGE_ENTITY_FIELDS = new Set([
  "createdCount", "updatedCount", "deletedCount", "linkedDidacticMicrosequenceId"
]);
const INSPECTION_FIELDS = new Set([
  "contract", "courseId", "courseRevision", "scope", "totalCount", "scopeOptions",
  "items", "hasPrevious", "hasMore", "previousCursor", "nextCursor", "pageBytes"
]);
const INSPECTION_ITEM_FIELDS = new Set([
  "studyUnit", "version", "updatedAt", "ordinal", "curriculumPath", "authoringPart",
  "authorship"
]);
const LEGACY_INSPECTION_ITEM_FIELDS = new Set([
  "studyUnit", "version", "updatedAt", "ordinal", "curriculumPath", "authoringPart"
]);
const INSPECTION_SCOPE_KINDS = new Set([
  "course", "authoring_part", "unassigned", "module", "lesson",
  "didactic_microsequence"
]);
const AUTHORING_PART_STATES = new Set([
  "planned", "partially_materialized", "materializing", "attention_required",
  "materialized"
]);
const INSPECTION_DESIGN_ORIGINS = new Set([
  "automatic", "author", "research_condition", "migration", "system_default"
]);
const INSPECTION_DESIGN_SCOPES = new Set([
  "course", "module", "lesson", "didactic_microsequence"
]);
const INSPECTION_DESIGN_PARAMETER_IDS = new Set(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id }) => id)
);
const COURSE_DESIGN_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_SOURCES_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_ANCHORED_ANNOTATIONS_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_AUDIT_CYCLE_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_AUDIT_CYCLE_DTO_LIMIT_BYTES = 240 * 1024;
const COURSE_DESIGN_PARAMETER_DEFAULTS = new Map(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id, defaultValue }) => [id, defaultValue])
);
const CONTEXT_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const COURSE_SOURCE_ATTACHMENT_BUCKET = "course-source-pdfs";
const PERSON_AVATAR_BUCKET = "person-avatars";
const COURSE_SOURCE_DOWNLOAD_EXPIRY_SECONDS = 60;
const COURSE_SOURCE_PDF_VERIFICATION_TIMEOUT_MS = 20_000;
const ACCOUNT_DELETION_CONFIRMATION = "EXCLUIR MINHA CONTA";
const ACCOUNT_DELETION_CONTRACT = "aralearn.account-deletion.v1";
const ACCOUNT_STORAGE_BATCH_SIZE = 100;
const ACCOUNT_MAX_COURSE_PAGES = 100;
const ACCOUNT_MAX_STORAGE_BATCHES = 100;
const PDF_HEADER = Object.freeze([0x25, 0x50, 0x44, 0x46, 0x2d]);

function first(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

function invalidMaterializationRead() {
  throw new AuthoringApiError(
    503,
    "course_service_unavailable",
    "A leitura da materialização da Parte é inválida."
  );
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

function duplicatesMaterializationPayload(value) {
  return jsonRecord(value) && [
    "designApplication", "sourceAttributionApplication", "entityChanges", "content"
  ].some((field) => Object.hasOwn(value, field));
}

function publicMaterializationResultFacts(value) {
  if (!jsonRecord(value)) return null;
  const result = structuredClone(value);
  delete result.designApplication;
  delete result.sourceAttributionApplication;
  return duplicatesMaterializationPayload(result) ? null : result;
}

function decimalIdentity(value) {
  return typeof value === "string" && /^[1-9][0-9]*$/u.test(value);
}

function normalizedDesignScope(value, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (!exactRecord(value, new Set(["kind", "ref"]))) return null;
  if (typeof value.kind !== "string" || typeof value.ref !== "string") return null;
  const kind = value.kind.trim();
  const ref = value.ref.trim();
  if (!new Set(["course", "module", "lesson", "didactic_microsequence"]).has(kind) ||
      kind !== value.kind || !ref || ref !== value.ref || ref.length > 240) return null;
  return { kind, ref };
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
    if (!Array.isArray(refs) || refs.length > 32 || new Set(refs).size !== refs.length ||
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

function assertComponentRefsAllowed(refs, policy) {
  const allowed = new Set(policy.allowedRefs);
  const excluded = new Set(policy.excludedRefs);
  const denied = refs.find((ref) => excluded.has(ref) ||
    policy.availability === "allow_only" && !allowed.has(ref));
  if (denied) {
    throw new AuthoringApiError(
      422,
      "component_disallowed_by_policy",
      "A etapa usa componente excluído pela regra efetiva.",
      { ref: denied }
    );
  }
}

function assertSourceLinksAllowedByContext(studyUnits, target) {
  const allowedSources = new Map();
  for (const attribution of [
    ...target.sourceAttributions.instructionalAnalysisUnits,
    ...target.sourceAttributions.evidenceRequirements
  ]) {
    for (const source of attribution.sources) {
      const key = `${source.sourceId}\0${source.sourceRevision}\0${source.relation}`;
      const anchors = allowedSources.get(key) || new Set();
      source.anchors.forEach(({ anchorId, anchorRevision }) =>
        anchors.add(`${anchorId}\0${anchorRevision}`));
      allowedSources.set(key, anchors);
    }
  }
  for (const studyUnit of studyUnits) {
    for (const sourceLink of studyUnit.sourceLinks) {
      const key = `${sourceLink.sourceId}\0${sourceLink.sourceRevision}\0${sourceLink.relation}`;
      const anchors = allowedSources.get(key);
      if (!anchors || sourceLink.anchors.some(({ anchorId, anchorRevision }) =>
        !anchors.has(`${anchorId}\0${anchorRevision}`))) {
        throw new AuthoringApiError(
          422,
          "source_not_allowed_by_context",
          "A aplicação usa Fonte, revisão, relação ou Âncora fora do contexto selado.",
          { studyUnitId: studyUnit.studyUnitId, sourceId: sourceLink.sourceId }
        );
      }
    }
  }
}

function courseSourceCommandSubjectId(command) {
  return command.type === "save_source" || command.type === "retire_source" ||
    command.type === "attach_pdf"
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

function validInspectionDesignSnapshot(value) {
  if (!exactRecord(value, new Set(["parameters", "guidance", "componentPolicy"])) ||
      !Array.isArray(value.parameters) || value.parameters.length !== 4 ||
      !Array.isArray(value.guidance) || value.guidance.length > 4 ||
      !exactRecord(value.componentPolicy, new Set([
        "availability", "allowedCount", "excludedCount", "preferredCount",
        "origin", "sourceScopeKind"
      ]))) return false;
  const parameterIds = new Set();
  for (const parameter of value.parameters) {
    if (!exactRecord(parameter, new Set([
      "parameterId", "value", "origin", "sourceScopeKind"
    ])) || !INSPECTION_DESIGN_PARAMETER_IDS.has(parameter.parameterId) ||
        parameterIds.has(parameter.parameterId) ||
        !(Number.isSafeInteger(parameter.value) ||
          Array.isArray(parameter.value) && parameter.value.length <= 16 &&
          parameter.value.every((item) => typeof item === "string" && item.length <= 80)) ||
        !INSPECTION_DESIGN_ORIGINS.has(parameter.origin) ||
        !(parameter.sourceScopeKind === null ||
          INSPECTION_DESIGN_SCOPES.has(parameter.sourceScopeKind))) return false;
    parameterIds.add(parameter.parameterId);
  }
  if (parameterIds.size !== 4) return false;
  if (value.guidance.some((revision) =>
    !exactRecord(revision, new Set(["guidance", "origin", "sourceScopeKind"])) ||
    typeof revision.guidance !== "string" || revision.guidance.length > 16_384 ||
    !INSPECTION_DESIGN_ORIGINS.has(revision.origin) ||
    !INSPECTION_DESIGN_SCOPES.has(revision.sourceScopeKind)
  )) return false;
  const policy = value.componentPolicy;
  return new Set(["all", "allow_only"]).has(policy.availability) &&
    [policy.allowedCount, policy.excludedCount, policy.preferredCount].every(
      (count) => nonNegativeSafeInteger(count) && count <= 128
    ) && INSPECTION_DESIGN_ORIGINS.has(policy.origin) &&
    (policy.sourceScopeKind === null ||
      INSPECTION_DESIGN_SCOPES.has(policy.sourceScopeKind));
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
    const authorship = item.authorship;
    if (!exactRecord(authorship, new Set([
      "pendingObservationCount", "production", "design"
    ])) || !nonNegativeSafeInteger(authorship.pendingObservationCount) ||
        authorship.pendingObservationCount > 512) {
      invalidInspectionRead();
    }
    if (authorship.production !== null && (
      !exactRecord(authorship.production, new Set([
        "materializationId", "recordedAt", "state", "currentMaterialization"
      ])) || !UUID_PATTERN.test(String(authorship.production.materializationId || "")) ||
      !validTimestamp(authorship.production.recordedAt) ||
      !new Set(["produced", "changed"]).has(authorship.production.state) ||
      typeof authorship.production.currentMaterialization !== "boolean"
    )) invalidInspectionRead();
    if (authorship.design !== null && (
      !exactRecord(authorship.design, new Set([
        "used", "current", "state"
      ])) || !validInspectionDesignSnapshot(authorship.design.used) ||
      !validInspectionDesignSnapshot(authorship.design.current) ||
      !new Set(["current", "changed", "verified"]).has(authorship.design.state)
    )) invalidInspectionRead();
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
      curriculumPath: {
        module: normalizeCurriculumNode(item.curriculumPath.module),
        lesson: normalizeCurriculumNode(item.curriculumPath.lesson),
        didacticMicrosequence: normalizeCurriculumNode(
          item.curriculumPath.didacticMicrosequence
        )
      },
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

function normalizeLegacyInspectionPage(
  value,
  { courseId, expectedRevision, scopeKind, scopeId },
  validateCourseEntityContent
) {
  if (!exactRecord(value, INSPECTION_FIELDS) ||
      value.contract !== "aralearn.course-study-unit-inspection-page.v1" ||
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
    if (!exactRecord(item, LEGACY_INSPECTION_ITEM_FIELDS) || !jsonRecord(item.studyUnit) ||
        !exactRecord(item.curriculumPath, new Set([
          "module", "lesson", "didacticMicrosequence"
        ]))) {
      invalidInspectionRead();
    }
    const id = boundedInspectionId(item.studyUnit.id);
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
      curriculumPath: {
        module: normalizeCurriculumNode(item.curriculumPath.module),
        lesson: normalizeCurriculumNode(item.curriculumPath.lesson),
        didacticMicrosequence: normalizeCurriculumNode(
          item.curriculumPath.didacticMicrosequence
        )
      },
      authoringPart: normalizeInspectionPart(item.authoringPart)
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

function normalizeEffectiveComponentPolicy(value) {
  if (!exactRecord(value, new Set([
    "changeId", "policy", "origin", "reason", "sourceScope"
  ])) || value.changeId != null && !decimalIdentity(value.changeId) ||
      !new Set([
        "system_default", "automatic", "author", "research_condition"
      ]).has(value.origin) || typeof value.reason !== "string" ||
      !value.reason.trim() || value.reason.length > 1_000) {
    invalidMaterializationRead();
  }
  const sourceScope = normalizedDesignScope(value.sourceScope, { nullable: true });
  const systemDefault = value.origin === "system_default";
  if ((value.sourceScope != null && !sourceScope) ||
      (systemDefault && (value.changeId !== null || sourceScope !== null)) ||
      (!systemDefault && (!decimalIdentity(value.changeId) || sourceScope === null))) {
    invalidMaterializationRead();
  }
  let policy;
  try {
    policy = normalizeCourseComponentPolicy(value.policy);
  } catch {
    invalidMaterializationRead();
  }
  if (systemDefault && (policy.availability !== "all" || policy.allowedRefs.length ||
      policy.excludedRefs.length || policy.preferredRefs.length)) {
    invalidMaterializationRead();
  }
  return {
    changeId: value.changeId,
    policy,
    origin: value.origin,
    reason: value.reason,
    sourceScope
  };
}

function normalizeMaterializationDesignContext(
  value,
  { courseId, authoringPartId }
) {
  const sourceContext = normalizeCourseSourcesDatabaseValue(() =>
    normalizeCourseSourceContext(value)
  );
  const fields = new Set([
    "contract", "courseId", "courseRevision", "authoringPartId",
    "componentCatalogVersion", "instructionalAnalysisUnits",
    "evidenceRequirements", "guidanceRevisions", "targets"
  ]);
  if (!exactRecord(sourceContext, fields) ||
      sourceContext.contract !== COURSE_DESIGN_CONTEXT_V2_CONTRACT ||
      String(sourceContext.courseId || "").trim().toLowerCase() !== courseId ||
      String(sourceContext.authoringPartId || "").trim().toLowerCase() !== authoringPartId ||
      !positiveSafeInteger(sourceContext.courseRevision) ||
      sourceContext.componentCatalogVersion !== COURSE_COMPONENT_CATALOG_VERSION ||
      !Array.isArray(sourceContext.instructionalAnalysisUnits) ||
      sourceContext.instructionalAnalysisUnits.length > 256 ||
      !Array.isArray(sourceContext.evidenceRequirements) ||
      sourceContext.evidenceRequirements.length > 256 ||
      !Array.isArray(sourceContext.guidanceRevisions) ||
      sourceContext.guidanceRevisions.length > 256 ||
      !Array.isArray(sourceContext.targets) || sourceContext.targets.length > 64 ||
      new TextEncoder().encode(JSON.stringify(sourceContext)).byteLength > 64 * 1024) {
    invalidMaterializationRead();
  }
  value = sourceContext;
  const instructionalAnalysisUnits = value.instructionalAnalysisUnits.map((item) => {
    if (!exactRecord(item, new Set(["id", "position", "statement", "version"])) ||
        !UUID_PATTERN.test(String(item.id || "")) ||
        !nonNegativeSafeInteger(item.position) || typeof item.statement !== "string" ||
        !item.statement.trim() || item.statement.length > 2_000 ||
        !positiveSafeInteger(item.version)) {
      invalidMaterializationRead();
    }
    return structuredClone(item);
  });
  const evidenceRequirements = value.evidenceRequirements.map((item) => {
    if (!exactRecord(item, new Set(["id", "position", "statement", "version"])) ||
        !UUID_PATTERN.test(String(item.id || "")) ||
        !nonNegativeSafeInteger(item.position) || typeof item.statement !== "string" ||
        !item.statement.trim() || item.statement.length > 2_000 ||
        !positiveSafeInteger(item.version)) {
      invalidMaterializationRead();
    }
    return structuredClone(item);
  });
  if (new Set(instructionalAnalysisUnits.map(({ id }) => id)).size !==
      instructionalAnalysisUnits.length ||
      new Set(evidenceRequirements.map(({ id }) => id)).size !== evidenceRequirements.length) {
    invalidMaterializationRead();
  }
  const instructionalAnalysisUnitIds = new Set(
    instructionalAnalysisUnits.map(({ id }) => id)
  );
  const evidenceRequirementIds = new Set(evidenceRequirements.map(({ id }) => id));
  const guidanceRevisions = value.guidanceRevisions.map((revision) => {
    if (!exactRecord(revision, new Set([
      "revisionId", "guidance", "origin", "reason", "sourceScope",
      "currentInterpretation"
    ])) || !UUID_PATTERN.test(String(revision.revisionId || "")) ||
        typeof revision.guidance !== "string" || !revision.guidance.trim() ||
        (revision.origin === "migration"
          ? [...revision.guidance].length > 16_384
          : revision.guidance.length > 8_192) ||
        !new Set(["migration", "automatic", "author", "research_condition"])
          .has(revision.origin) ||
        typeof revision.reason !== "string" || !revision.reason.trim() ||
        revision.reason.length > 1_000 || !normalizedDesignScope(revision.sourceScope)) {
      invalidMaterializationRead();
    }
    const interpretation = revision.currentInterpretation;
    if (interpretation != null) {
      if (!exactRecord(interpretation, new Set([
        "interpretationId", "guidanceRevisionId", "interpretation", "createdAt"
      ])) || !decimalIdentity(interpretation.interpretationId) ||
          interpretation.guidanceRevisionId !== revision.revisionId ||
          !validTimestamp(interpretation.createdAt) || !jsonRecord(interpretation.interpretation) ||
          new TextEncoder().encode(JSON.stringify(interpretation.interpretation)).byteLength >
            8 * 1024) {
        invalidMaterializationRead();
      }
      try {
        normalizeCourseAuthoringGuidanceInterpretation(interpretation.interpretation);
      } catch {
        invalidMaterializationRead();
      }
    }
    return structuredClone(revision);
  });
  if (new Set(guidanceRevisions.map(({ revisionId }) => revisionId)).size !==
      guidanceRevisions.length) {
    invalidMaterializationRead();
  }
  const guidanceRevisionIds = new Set(guidanceRevisions.map(({ revisionId }) => revisionId));
  const guidanceRevisionPositions = new Map(guidanceRevisions.map(({ revisionId }, index) => [
    revisionId,
    index
  ]));
  const referencedGuidanceRevisionIds = new Set();
  const targets = value.targets.map((target) => {
    if (!exactRecord(target, new Set([
      "didacticMicrosequenceId", "instructionalAnalysisUnitIds", "evidenceRequirementIds",
      "parameters", "guidanceRevisionIds", "componentPolicy", "sourceAttributions"
    ])) || typeof target.didacticMicrosequenceId !== "string" ||
        !target.didacticMicrosequenceId.trim() ||
        target.didacticMicrosequenceId.length > 240 ||
        !Array.isArray(target.parameters) || target.parameters.length !== 4 ||
        !Array.isArray(target.instructionalAnalysisUnitIds) ||
        target.instructionalAnalysisUnitIds.length > 256 ||
        target.instructionalAnalysisUnitIds.some((id) =>
          !UUID_PATTERN.test(String(id || "")) || !instructionalAnalysisUnitIds.has(id)) ||
        new Set(target.instructionalAnalysisUnitIds).size !==
          target.instructionalAnalysisUnitIds.length ||
        !Array.isArray(target.evidenceRequirementIds) ||
        target.evidenceRequirementIds.length > 256 ||
        target.evidenceRequirementIds.some((id) =>
          !UUID_PATTERN.test(String(id || "")) || !evidenceRequirementIds.has(id)) ||
        new Set(target.evidenceRequirementIds).size !== target.evidenceRequirementIds.length ||
        !Array.isArray(target.guidanceRevisionIds) || target.guidanceRevisionIds.length > 4 ||
        target.guidanceRevisionIds.some((id) => !UUID_PATTERN.test(String(id || "")) ||
          !guidanceRevisionIds.has(id)) ||
        new Set(target.guidanceRevisionIds).size !== target.guidanceRevisionIds.length ||
        target.guidanceRevisionIds.some((id, index, ids) => index > 0 &&
          guidanceRevisionPositions.get(ids[index - 1]) >= guidanceRevisionPositions.get(id))) {
      invalidMaterializationRead();
    }
    target.guidanceRevisionIds.forEach((id) => referencedGuidanceRevisionIds.add(id));
    const parameters = target.parameters.map((parameter) => {
      const sourceScope = normalizedDesignScope(parameter?.sourceScope, { nullable: true });
      if (!exactRecord(parameter, new Set([
        "parameterId", "value", "origin", "reason", "sourceScope"
      ])) || typeof parameter.parameterId !== "string" ||
          !new Set([
            "system_default", "automatic", "author", "research_condition"
          ]).has(parameter.origin) || typeof parameter.reason !== "string" ||
          !parameter.reason.trim() || parameter.reason.length > 1_000 ||
          (parameter.sourceScope != null && !sourceScope) ||
          (parameter.origin === "system_default") !== (sourceScope == null) ||
          new TextEncoder().encode(JSON.stringify(parameter.value)).byteLength > 4 * 1024) {
        invalidMaterializationRead();
      }
      let value;
      try {
        value = normalizeCourseDesignParameterValue(parameter.parameterId, parameter.value);
      } catch {
        invalidMaterializationRead();
      }
      if (parameter.origin === "system_default" && JSON.stringify(value) !==
          JSON.stringify(COURSE_DESIGN_PARAMETER_DEFAULTS.get(parameter.parameterId))) {
        invalidMaterializationRead();
      }
      return { ...structuredClone(parameter), value, sourceScope };
    });
    if (new Set(parameters.map(({ parameterId }) => parameterId)).size !== 4) {
      invalidMaterializationRead();
    }
    const sourceAttributions = structuredClone(target.sourceAttributions);
    const attributedInstructionalAnalysisUnitIds = sourceAttributions
      .instructionalAnalysisUnits.map(({ planItemId }) => planItemId);
    const attributedEvidenceRequirementIds = sourceAttributions
      .evidenceRequirements.map(({ planItemId }) => planItemId);
    if (JSON.stringify(attributedInstructionalAnalysisUnitIds) !==
          JSON.stringify(target.instructionalAnalysisUnitIds) ||
        JSON.stringify(attributedEvidenceRequirementIds) !==
          JSON.stringify(target.evidenceRequirementIds)) {
      invalidMaterializationRead();
    }
    return {
      didacticMicrosequenceId: target.didacticMicrosequenceId,
      instructionalAnalysisUnitIds: [...target.instructionalAnalysisUnitIds],
      evidenceRequirementIds: [...target.evidenceRequirementIds],
      parameters,
      guidanceRevisionIds: [...target.guidanceRevisionIds],
      componentPolicy: normalizeEffectiveComponentPolicy(target.componentPolicy),
      sourceAttributions
    };
  });
  if (new Set(targets.map(({ didacticMicrosequenceId }) =>
    didacticMicrosequenceId)).size !== targets.length ||
      guidanceRevisions.some(({ revisionId }) => !referencedGuidanceRevisionIds.has(revisionId))) {
    invalidMaterializationRead();
  }
  return {
    contract: value.contract,
    courseId,
    courseRevision: Number(value.courseRevision),
    authoringPartId,
    componentCatalogVersion: value.componentCatalogVersion,
    instructionalAnalysisUnits,
    evidenceRequirements,
    guidanceRevisions,
    targets
  };
}

function normalizeMaterializationStep(value) {
  if (!exactRecord(value, MATERIALIZATION_STEP_FIELDS)) invalidMaterializationRead();
  const id = String(value.id || "").trim().toLowerCase();
  const kind = String(value.kind || "").trim();
  const status = String(value.status || "").trim();
  const targetDidacticMicrosequenceId = value.targetDidacticMicrosequenceId == null
    ? null
    : String(value.targetDidacticMicrosequenceId).trim();
  const productionPosition = value.productionPosition == null
    ? null
    : Number(value.productionPosition);
  const resultFacts = publicMaterializationResultFacts(value.resultFacts);
  const didactic = kind === "didactic_microsequence_materialization";
  if (!UUID_PATTERN.test(id) || !nonNegativeSafeInteger(value.position) ||
      !new Set(["context_load", "didactic_microsequence_materialization", "validation"]).has(kind) ||
      !new Set(["pending", "completed", "failed"]).has(status) ||
      !positiveSafeInteger(value.version) || !resultFacts ||
      !validTimestamp(value.updatedAt) ||
      !validTimestamp(value.completedAt, { nullable: true }) ||
      (status === "pending") !== (value.completedAt == null) ||
      didactic !== (targetDidacticMicrosequenceId != null &&
        targetDidacticMicrosequenceId.length >= 1 &&
        targetDidacticMicrosequenceId.length <= 240 &&
        nonNegativeSafeInteger(productionPosition))) {
    invalidMaterializationRead();
  }
  return {
    id,
    position: Number(value.position),
    kind,
    targetDidacticMicrosequenceId,
    productionPosition,
    status,
    version: Number(value.version),
    resultFacts,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt
  };
}

function normalizePartMaterialization(
  value,
  { courseId, authoringPartId, materializationId }
) {
  const topFields = new Set([
    "contract", "courseId", "courseRevision", "authoringPartId", "materialization"
  ]);
  if (!exactRecord(value, topFields) ||
      value.contract !== "aralearn.course-authoring-part-materialization.v1" ||
      String(value.courseId || "").toLowerCase() !== courseId ||
      String(value.authoringPartId || "").toLowerCase() !== authoringPartId ||
      !positiveSafeInteger(value.courseRevision) ||
      !exactRecord(value.materialization, MATERIALIZATION_FIELDS)) {
    invalidMaterializationRead();
  }
  const source = value.materialization;
  const id = String(source.id || "").trim().toLowerCase();
  const status = String(source.status || "").trim();
  const channel = String(source.channel || "").trim();
  const resultFacts = publicMaterializationResultFacts(source.resultFacts);
  if (id !== materializationId || !UUID_PATTERN.test(id) ||
      !positiveSafeInteger(source.authoringPartVersion) ||
      !new Set(["application", "mcp", "actions"]).has(channel) ||
      !new Set(["running", "completed", "failed"]).has(status) ||
      !positiveSafeInteger(source.version) || !jsonRecord(source.designContext) ||
      typeof source.contextHash !== "string" || !CONTEXT_HASH_PATTERN.test(source.contextHash) ||
      !resultFacts ||
      !validTimestamp(source.startedAt) || !validTimestamp(source.updatedAt) ||
      !validTimestamp(source.completedAt, { nullable: true }) ||
      (status === "running") !== (source.completedAt == null) ||
      !Array.isArray(source.steps) || source.steps.length < 1 || source.steps.length > 64) {
    invalidMaterializationRead();
  }
  const designContext = normalizeMaterializationDesignContext(source.designContext, {
    courseId,
    authoringPartId
  });
  const steps = source.steps.map(normalizeMaterializationStep);
  if (steps.some((step, index) => step.position !== index) ||
      new Set(steps.map((step) => step.id)).size !== steps.length) {
    invalidMaterializationRead();
  }
  const expectedNext = status === "running" && !steps.some(
    ({ status: stepStatus }) => stepStatus === "failed"
  )
    ? steps.find(({ status: stepStatus }) => stepStatus === "pending") || null
    : null;
  const nextPendingStep = source.nextPendingStep == null
    ? null
    : normalizeMaterializationStep(source.nextPendingStep);
  if ((expectedNext?.id || null) !== (nextPendingStep?.id || null) ||
      nextPendingStep && JSON.stringify(nextPendingStep) !== JSON.stringify(expectedNext)) {
    invalidMaterializationRead();
  }
  return {
    contract: value.contract,
    courseId,
    courseRevision: Number(value.courseRevision),
    authoringPartId,
    materialization: {
      id,
      authoringPartVersion: Number(source.authoringPartVersion),
      channel,
      status,
      version: Number(source.version),
      designContext,
      contextHash: source.contextHash,
      resultFacts,
      startedAt: source.startedAt,
      updatedAt: source.updatedAt,
      completedAt: source.completedAt,
      steps,
      nextPendingStep
    }
  };
}

function normalizeMaterializationChangeNextStep(value) {
  if (value == null) return null;
  if (!exactRecord(value, MATERIALIZATION_CHANGE_NEXT_STEP_FIELDS)) {
    invalidMaterializationRead();
  }
  const id = String(value.id || "").trim().toLowerCase();
  const kind = String(value.kind || "").trim();
  const targetDidacticMicrosequenceId = value.targetDidacticMicrosequenceId == null
    ? null
    : String(value.targetDidacticMicrosequenceId).trim();
  const productionPosition = value.productionPosition == null
    ? null
    : Number(value.productionPosition);
  const didactic = kind === "didactic_microsequence_materialization";
  if (!UUID_PATTERN.test(id) || !nonNegativeSafeInteger(value.position) ||
      !new Set(["context_load", "didactic_microsequence_materialization", "validation"]).has(kind) ||
      didactic !== (targetDidacticMicrosequenceId != null &&
        targetDidacticMicrosequenceId.length >= 1 &&
        targetDidacticMicrosequenceId.length <= 240 &&
        nonNegativeSafeInteger(productionPosition))) {
    invalidMaterializationRead();
  }
  return {
    id,
    position: Number(value.position),
    kind,
    targetDidacticMicrosequenceId,
    productionPosition
  };
}

function normalizeMaterializationChange(value, {
  courseId,
  authoringPartId,
  materializationId,
  operation,
  channel,
  stepId = null
}) {
  if (!exactRecord(value, MATERIALIZATION_CHANGE_FIELDS) ||
      value.contract !== "aralearn.course-authoring-materialization-change.v1" ||
      String(value.courseId || "").trim().toLowerCase() !== courseId ||
      String(value.authoringPartId || "").trim().toLowerCase() !== authoringPartId ||
      value.operation !== operation || value.channel !== channel ||
      !positiveSafeInteger(value.courseRevision) ||
      typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean" ||
      !exactRecord(value.materialization, MATERIALIZATION_CHANGE_STATE_FIELDS) ||
      !exactRecord(value.entities, MATERIALIZATION_CHANGE_ENTITY_FIELDS)) {
    invalidMaterializationRead();
  }
  const source = value.materialization;
  const id = String(source.id || "").trim().toLowerCase();
  const status = String(source.status || "").trim();
  const completedStepCount = Number(source.completedStepCount);
  const failedStepCount = Number(source.failedStepCount);
  const totalStepCount = Number(source.totalStepCount);
  if (id !== materializationId || !UUID_PATTERN.test(id) ||
      !new Set(["running", "completed", "failed"]).has(status) ||
      !positiveSafeInteger(source.version) ||
      !positiveSafeInteger(source.authoringPartVersion) ||
      !nonNegativeSafeInteger(completedStepCount) ||
      !nonNegativeSafeInteger(failedStepCount) ||
      !positiveSafeInteger(totalStepCount) || totalStepCount > 64 ||
      completedStepCount + failedStepCount > totalStepCount ||
      !validTimestamp(source.updatedAt) ||
      !validTimestamp(source.completedAt, { nullable: true }) ||
      (status === "running") !== (source.completedAt == null) ||
      !jsonRecord(source.designContext) ||
      typeof source.contextHash !== "string" ||
      !CONTEXT_HASH_PATTERN.test(source.contextHash)) {
    invalidMaterializationRead();
  }
  if (status === "completed" &&
      (completedStepCount !== totalStepCount || failedStepCount !== 0)) {
    invalidMaterializationRead();
  }
  const nextPendingStep = normalizeMaterializationChangeNextStep(source.nextPendingStep);
  const expectsPending = status === "running" && failedStepCount === 0 &&
    completedStepCount < totalStepCount;
  if ((nextPendingStep != null) !== expectsPending) invalidMaterializationRead();
  const designContext = normalizeMaterializationDesignContext(source.designContext, {
    courseId,
    authoringPartId
  });

  let step = null;
  if (value.step != null) {
    if (!exactRecord(value.step, MATERIALIZATION_CHANGE_STEP_FIELDS)) {
      invalidMaterializationRead();
    }
    step = {
      id: String(value.step.id || "").trim().toLowerCase(),
      status: String(value.step.status || "").trim(),
      version: Number(value.step.version)
    };
    if (!UUID_PATTERN.test(step.id) ||
        !new Set(["completed", "failed"]).has(step.status) ||
        !positiveSafeInteger(step.version)) {
      invalidMaterializationRead();
    }
  }
  if ((operation === "record_step") !== (step != null) ||
      stepId != null && step?.id !== stepId) {
    invalidMaterializationRead();
  }

  const entities = {
    createdCount: Number(value.entities.createdCount),
    updatedCount: Number(value.entities.updatedCount),
    deletedCount: Number(value.entities.deletedCount),
    linkedDidacticMicrosequenceId: value.entities.linkedDidacticMicrosequenceId == null
      ? null
      : String(value.entities.linkedDidacticMicrosequenceId).trim()
  };
  if (![entities.createdCount, entities.updatedCount, entities.deletedCount].every(
    nonNegativeSafeInteger
  ) || entities.createdCount + entities.updatedCount + entities.deletedCount > 64 ||
      entities.linkedDidacticMicrosequenceId != null &&
      (!entities.linkedDidacticMicrosequenceId ||
        entities.linkedDidacticMicrosequenceId.length > 240)) {
    invalidMaterializationRead();
  }

  return {
    contract: value.contract,
    courseId,
    courseRevision: Number(value.courseRevision),
    authoringPartId,
    operation,
    channel,
    changed: value.changed,
    idempotent: value.idempotent,
    materialization: {
      id,
      status,
      version: Number(source.version),
      authoringPartVersion: Number(source.authoringPartVersion),
      completedStepCount,
      failedStepCount,
      totalStepCount,
      nextPendingStep,
      updatedAt: source.updatedAt,
      completedAt: source.completedAt,
      designContext,
      contextHash: source.contextHash
    },
    step,
    entities
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

function courseAuditCycleResponseFailure(error) {
  if (error instanceof AuthoringApiError && new Set([
    "payload_too_large", "course_response_too_large"
  ]).has(error.code)) {
    return new AuthoringApiError(
      413,
      "course_audit_cycle_response_too_large",
      "A resposta de auditoria excedeu 256 KiB. Use uma página menor."
    );
  }
  return error;
}

function courseVariantResponseFailure(error) {
  if (error instanceof AuthoringApiError && new Set([
    "payload_too_large", "course_response_too_large"
  ]).has(error.code)) {
    return new AuthoringApiError(
      413,
      "course_variant_response_too_large",
      "A resposta de variantes excedeu 256 KiB."
    );
  }
  return error;
}

function normalizeCourseVariantInputValue(callback) {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CourseVariantError) {
      throw new AuthoringApiError(422, error.code, error.message);
    }
    throw error;
  }
}

function normalizeCourseAuthoringPlanInputValue(callback) {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CourseAuthoringPlanError || error instanceof CourseSourcesError) {
      throw new AuthoringApiError(422, error.code, error.message, error.details);
    }
    throw error;
  }
}

function normalizeCourseVariantDatabaseValue(callback) {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CourseVariantError || error instanceof TypeError) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O serviço devolveu uma comparação de variantes inválida."
      );
    }
    throw error;
  }
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
        "O serviço devolveu fatos de Pesquisa inválidos."
      );
    }
    throw error;
  }
}

function courseAuditReplayProbeAllowed(error, commandType) {
  if (!(error instanceof AuthoringApiError)) return false;
  if (new Set(["stale_course_state", "PT404"]).has(error.code)) return true;
  return new Set(["record_audit", "verify_finding"]).has(commandType) &&
    error.code === "audit_context_changed";
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

function normalizeInspectionFocus(value, { courseId, inspectionFocusId = null } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.contract !== "aralearn.course-inspection-focus.v1" ||
      value.courseId !== courseId ||
      typeof value.inspectionFocusId !== "string" ||
      !UUID_PATTERN.test(value.inspectionFocusId) ||
      inspectionFocusId !== null && value.inspectionFocusId !== inspectionFocusId ||
      !Number.isSafeInteger(value.courseRevision) || value.courseRevision < 1 ||
      typeof value.title !== "string" || !value.title.trim() || value.title !== value.title.trim() ||
      !Array.isArray(value.studyUnitIds) || value.studyUnitIds.length < 1 ||
      value.studyUnitIds.length > 64 ||
      !Array.isArray(value.availableStudyUnitIds) || !Array.isArray(value.missingStudyUnitIds) ||
      value.studyUnitIds.some((id) => typeof id !== "string" || !id || id !== id.trim()) ||
      new Set(value.studyUnitIds).size !== value.studyUnitIds.length ||
      [...value.availableStudyUnitIds, ...value.missingStudyUnitIds]
        .some((id) => !value.studyUnitIds.includes(id))) {
    throw new AuthoringApiError(
      503,
      "invalid_inspection_focus_state",
      "O serviço devolveu um foco de inspeção inválido."
    );
  }
  return structuredClone(value);
}

function withInspectionFocusDeepLink(value, publicAppUrl) {
  return {
    ...value,
    deepLink: `${publicAppUrl}/#/authoring/courses/${encodeURIComponent(value.courseId)}` +
      `?section=content&inspectionFocusId=${encodeURIComponent(value.inspectionFocusId)}`
  };
}

function auditCourseHref(publicAppUrl, courseId, parameters) {
  try {
    const query = Object.entries(parameters)
      .filter(([, value]) => value != null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
    const href = `${publicAppUrl}/#/authoring/courses/${encodeURIComponent(courseId)}` +
      `?${query}`;
    return [...href].length <= 2_048 && new TextEncoder().encode(href).byteLength <= 8_192
      ? href
      : null;
  } catch {
    return null;
  }
}

function withCourseAuditDeepLinks(value, publicAppUrl) {
  if (!jsonRecord(value)) return value;
  const result = structuredClone(value);
  const encoder = new TextEncoder();
  const injectedLinks = [];
  const injectLink = (target, key, href, priority = 0) => {
    target[key] = href;
    if (href !== null) injectedLinks.push({ target, key, href, priority });
  };
  const courseId = String(result.courseId || "").trim();
  if (!courseId) return result;
  const attachFinding = (finding) => {
    if (!jsonRecord(finding)) return finding;
    const findingId = String(finding.findingId || "").trim();
    const studyUnitId = String(finding.target?.studyUnitId || "").trim();
    if (!findingId || !studyUnitId) return finding;
    if (Array.isArray(finding.annotationRefs)) {
      finding.annotationRefs = finding.annotationRefs.map((reference) => {
        if (!jsonRecord(reference)) return reference;
        const annotationId = String(reference.annotationId || "").trim();
        injectLink(reference, "deepLink", reference.available && annotationId
          ? auditCourseHref(publicAppUrl, courseId, {
              section: "review",
              annotationId
            })
          : null, 1);
        return reference;
      });
    }
    finding.deepLinks = {
      detail: null,
      target: null
    };
    injectLink(finding.deepLinks, "detail", auditCourseHref(publicAppUrl, courseId, {
      section: "review",
      findingId
    }), 3);
    injectLink(finding.deepLinks, "target", finding.target?.currentAvailable
      ? auditCourseHref(publicAppUrl, courseId, {
          section: "content",
          studyUnitId
        })
      : null, 2);
    return finding;
  };
  const attachCorrection = (correction, fallbackFindingId = null) => {
    if (!jsonRecord(correction)) return correction;
    const findingId = String(correction.findingId || fallbackFindingId || "").trim();
    const correctionId = String(correction.correctionId || "").trim();
    if (!findingId || !correctionId) return correction;
    injectLink(correction, "deepLink", auditCourseHref(publicAppUrl, courseId, {
      section: "review",
      findingId,
      correctionId
    }), 2);
    return correction;
  };
  const context = result.context;
  if (jsonRecord(context)) {
    if (Array.isArray(context.sources)) {
      context.sources = context.sources.map((source) => {
        if (!jsonRecord(source)) return source;
        const sourceId = typeof source.sourceId === "string" ? source.sourceId : "";
        if (!sourceId) return source;
        injectLink(source, "deepLink", auditCourseHref(publicAppUrl, courseId, {
          section: "sources",
          sourceId
        }), 2);
        if (Array.isArray(source.anchors)) {
          source.anchors = source.anchors.map((anchor) => {
            if (!jsonRecord(anchor)) return anchor;
            const anchorId = String(anchor.anchorId || "").trim();
            if (anchorId) {
              injectLink(anchor, "deepLink", auditCourseHref(publicAppUrl, courseId, {
                section: "sources",
                sourceId,
                anchorId
              }), 0);
            }
            return anchor;
          });
        }
        return source;
      });
    }
    if (Array.isArray(context.annotations)) {
      context.annotations = context.annotations.map((annotation) => {
        if (!jsonRecord(annotation)) return annotation;
        const annotationId = String(annotation.annotationId || "").trim();
        if (annotationId) {
          injectLink(annotation, "deepLink", auditCourseHref(publicAppUrl, courseId, {
            section: "review",
            annotationId
          }), 1);
        }
        return annotation;
      });
    }
  }
  if (Array.isArray(result.items)) result.items = result.items.map(attachFinding);
  if (Array.isArray(result.runs)) {
    result.runs = result.runs.map((run) => {
      if (!jsonRecord(run)) return run;
      const auditRunId = String(run.auditRunId || "").trim();
      injectLink(run, "deepLink", auditRunId
        ? auditCourseHref(publicAppUrl, courseId, {
            section: "review",
            auditRunId
          })
        : null, 3);
      return run;
    });
  }
  if (jsonRecord(result.detail)) {
    result.detail.finding = attachFinding(result.detail.finding);
    const detailFindingId = result.detail.finding?.findingId ?? null;
    if (Array.isArray(result.detail.corrections)) {
      result.detail.corrections = result.detail.corrections.map((correction) =>
        attachCorrection(correction, detailFindingId)
      );
    }
    if (Object.hasOwn(result.detail, "selectedCorrection")) {
      result.detail.selectedCorrection = attachCorrection(
        result.detail.selectedCorrection,
        detailFindingId
      );
    }
  }
  if (Object.hasOwn(result, "finding")) {
    result.finding = attachFinding(result.finding);
  }
  if (Object.hasOwn(result, "correction")) {
    result.correction = attachCorrection(result.correction);
  }
  let resultBytes = encoder.encode(JSON.stringify(result)).byteLength;
  if (resultBytes > COURSE_AUDIT_CYCLE_DTO_LIMIT_BYTES) {
    injectedLinks.sort((left, right) => (
      left.priority - right.priority ||
      encoder.encode(right.href).byteLength - encoder.encode(left.href).byteLength
    ));
    for (const link of injectedLinks) {
      link.target[link.key] = null;
      resultBytes = encoder.encode(JSON.stringify(result)).byteLength;
      if (resultBytes <= COURSE_AUDIT_CYCLE_DTO_LIMIT_BYTES) break;
    }
  }
  return result;
}

function normalizeCourseAuditCycleDatabaseValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAuditCycleError)) throw error;
    throw new AuthoringApiError(
      503,
      "course_service_unavailable",
      "O Supabase devolveu um contrato de auditoria inválido."
    );
  }
}

function normalizeCourseAuditCycleInputValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAuditCycleError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

async function deterministicAuditUuid(auditRunId, label) {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${auditRunId}\u0000${label}`)
  ));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const source = [...bytes.slice(0, 16)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return [
    source.slice(0, 8),
    source.slice(8, 12),
    source.slice(12, 16),
    source.slice(16, 20),
    source.slice(20)
  ].join("-");
}

function auditPublicEvidence(audit) {
  const fragments = [
    ...(Array.isArray(audit?.structural?.errors)
      ? audit.structural.errors.map((error) => `Contrato: ${String(error)}`)
      : []),
    ...(Array.isArray(audit?.warnings) ? audit.warnings.map(String) : []),
    ...(Array.isArray(audit?.selections)
      ? audit.selections
        .filter(({ fit }) => fit === "substitute")
        .map((selection) => {
          const identity = `${selection.slot}:${selection.instanceId}`;
          return `${identity} — ${String(selection.reason || "encaixe insuficiente")}`;
        })
      : [])
  ].filter((fragment) => fragment.trim());
  const fallback = audit?.overallFit === "canonical"
    ? "Os componentes satisfazem seus contratos e o encaixe representacional é canônico."
    : "Os componentes satisfazem seus contratos com limitações representacionais explícitas.";
  return [...(fragments.join("\n") || fallback)].slice(0, 2_000).join("");
}

async function deterministicRepresentationFacts(context, auditRunId) {
  const { RESOURCE_CATALOG } = await import(
    "../aralearn/runtime/resources/catalog/resourceCatalog.js"
  );
  const target = context?.target;
  const studyUnit = {
    id: target?.studyUnitId,
    position: target?.position,
    ...(jsonRecord(target?.content) ? structuredClone(target.content) : {})
  };
  const audit = RESOURCE_CATALOG.auditRepresentation({
    studyUnit,
    intent: context?.intent
  });
  const intent = jsonRecord(context?.intent) ? context.intent : {};
  const mechanicalRepresentationConstraint = [
    "structureIds", "taskOperationIds", "practiceModeIds", "mustPreserve"
  ].some((field) => Array.isArray(intent[field]) && intent[field].length > 0) ||
    intent.notationIsLearningObject === true;
  const result = !audit.structural.valid
    ? "failed"
    : mechanicalRepresentationConstraint && audit.overallFit === "substitute"
      ? "uncertain"
      : "passed";
  const checkId = await deterministicAuditUuid(
    auditRunId,
    "aralearn.course-audit.structural-check.v1"
  );
  const check = {
    checkId,
    dimension: "structural_conformance",
    criterion: {
      code: "resource_representation_contract",
      version: String(audit.catalogVersion),
      statement: "A Unidade de estudo satisfaz os contratos dos componentes e sua representação corresponde à intenção persistida."
    },
    result,
    publicEvidence: audit.structural.valid && !mechanicalRepresentationConstraint
      ? "A Unidade satisfaz os contratos estruturais dos componentes. Não há faceta representacional mecânica explícita; o encaixe semântico permanece para a auditoria humana."
      : auditPublicEvidence(audit),
    adequacy: result === "passed"
      ? "sufficient"
      : result === "failed"
        ? "insufficient"
        : "uncertain",
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: []
  };
  if (result === "passed") return { check, finding: null };
  return {
    check,
    finding: {
      findingId: await deterministicAuditUuid(
        auditRunId,
        "aralearn.course-audit.structural-finding.v1"
      ),
      checkId,
      code: "resource_representation_contract",
      severity: result === "failed" ? "high" : "medium",
      annotationRefs: []
    }
  };
}

async function validateCorrectionCandidate(context, command) {
  const [entityRuntime, resourceRuntime] = await Promise.all([
    import("../aralearn/runtime/domain/courseEntities.js"),
    import("../aralearn/runtime/resources/catalog/resourceCatalog.js")
  ]);
  const target = context?.target;
  const candidate = {
    id: target?.studyUnitId,
    position: target?.position,
    ...(jsonRecord(command.afterContent) ? structuredClone(command.afterContent) : {})
  };
  const entity = entityRuntime.validateCourseEntityContent("study_unit", candidate);
  const catalog = entity.valid
    ? resourceRuntime.RESOURCE_CATALOG.validateStudyUnit(entity.normalized)
    : null;
  if (!entity.valid || !catalog?.valid) {
    throw new AuthoringApiError(
      422,
      "invalid_course_audit_candidate",
      "A correção proposta não forma uma Unidade de estudo válida.",
      {
        errors: [
          ...(Array.isArray(entity.errors) ? entity.errors : []),
          ...(Array.isArray(catalog?.errors) ? catalog.errors : [])
        ].slice(0, 20)
      }
    );
  }
  return { ...command, afterContent: structuredClone(command.afterContent) };
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

function normalizeCourseSourcesDatabaseValue(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseSourcesError)) throw error;
    throw new AuthoringApiError(
      503,
      "course_service_unavailable",
      "O Supabase devolveu um contrato de Fontes inválido."
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
      "O Supabase devolveu um contrato de observações inválido."
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
    normalized.componentPolicy?.localChange?.policy,
    normalized.componentPolicy?.effectiveChange?.policy
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

function materializationChannel(principal) {
  if (principal?.authenticationKind === "action") return "actions";
  return authoringChannel(principal);
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

function editableInstructionalPlan(value) {
  const plan = value?.plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new AuthoringApiError(503, "course_service_unavailable", "O plano do Curso é inválido.");
  }
  return normalizeCourseAuthoringPlan({
    id: plan.id,
    title: plan.title,
    objective: plan.objective,
    audience: plan.audience ?? "",
    scope: plan.scope ?? "",
    preferredPartCount: plan.preferredPartCount,
    intendedLearningOutcomes: Array.isArray(plan.intendedLearningOutcomes)
      ? plan.intendedLearningOutcomes.map(({ id, position, statement, sourceLinks }) => ({
          id, position, statement, sourceLinks
        }))
      : [],
    instructionalAnalysisUnits: Array.isArray(plan.instructionalAnalysisUnits)
      ? plan.instructionalAnalysisUnits.map(({ id, position, statement, sourceLinks }) => ({
          id, position, statement, sourceLinks
        }))
      : [],
    evidenceRequirements: Array.isArray(plan.evidenceRequirements)
      ? plan.evidenceRequirements.map(({ id, position, statement, sourceLinks }) => ({
          id, position, statement, sourceLinks
        }))
      : [],
    parts: Array.isArray(plan.parts)
      ? plan.parts.map((part) => ({
          id: part.id,
          position: part.position,
          title: part.title,
          intent: part.intent ?? "",
          microsequenceIds: Array.isArray(part.microsequences)
            ? part.microsequences.map(({ id }) => id)
            : []
        }))
      : []
  });
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
    responseLimitBytes = this.responseLimitBytes
  } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      const remaining = deadlineAt == null ? timeoutMs : deadlineAt - Date.now();
      if (remaining <= 0) {
        throw new AuthoringApiError(503, "service_timeout", "O prazo da operação terminou.");
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
        const error = databaseError(response.status, body);
        lastError = error;
        if (!retry || !retryableStatus(error.status) || attempt === this.attempts) throw error;
      } catch (error) {
        const normalized = controller.signal.aborted
          ? new AuthoringApiError(503, "service_timeout", "O Supabase não respondeu a tempo.")
          : error instanceof AuthoringApiError
            ? error
            : new AuthoringApiError(503, "course_service_unavailable", "Não foi possível alcançar o Supabase.");
        lastError = normalized;
        if (!retry || !new Set(["service_timeout", "course_service_unavailable"]).has(normalized.code) ||
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
    const result = normalizeCourseSourcesDatabaseValue(() =>
      normalizeCourseSourcePdfIngestion(raw)
    );
    const expectedSourceRevision = sourceIntent.mode === "existing"
      ? sourceIntent.sourceRevision
      : sourceIntent.expectedSourceRevision + 1;
    const expectedResultRevision = expectedCourseRevision +
      (result.source.bibliographyChanged ? 1 : 0) +
      (result.change === null ? 0 : 1);
    if (result.courseId !== courseId || result.requestId !== requestId ||
        result.courseRevision !== expectedResultRevision ||
        result.source.sourceId !== sourceIntent.sourceId ||
        result.source.sourceRevision !== expectedSourceRevision ||
        attachment !== null && !courseSourcePdfAttachmentEquals(result.attachment, attachment) &&
          !(result.idempotent && courseSourcePdfAttachmentBinaryEquals(
            result.attachment,
            attachment
          ))) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação da ingestão não corresponde ao PDF e à Fonte solicitados."
      );
    }
    await this.#verifyCourseSourcePdf(result.attachment, {
      deadlineAt,
      requireStructure: true
    });
    return result;
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
    }, { deadlineAt }));
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
    }, { deadlineAt }));
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
    }, { deadlineAt }));
  }

  async getActionOAuthAuthorization({
    authorizationId,
    userId
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("get_authoring_action_oauth_authorization_v4", {
      p_authorization_id: authorizationId,
      p_user_id: userId
    }, { deadlineAt }));
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
    }, { deadlineAt }));
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
    }, { deadlineAt }));
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
    }, { deadlineAt }));
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
    recentLimit = 20,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("get_owned_course_instructional_plan_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_recent_limit: recentLimit
    }, { deadlineAt }));
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
      result = first(await this.rpc("get_owned_course_design_for_actor_v1", {
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
    limit = 10,
    deadlineAt = null
  }) {
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
        p_limit: limit
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

  async getCourseSourceAttachmentAccess({
    principal,
    courseId,
    expectedRevision,
    operation,
    sourceId,
    sourceRevision,
    contentHash,
    byteSize = null,
    mediaType = null,
    deadlineAt = null
  }) {
    const raw = first(await this.rpc("get_course_source_attachment_access_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_course_revision: expectedRevision,
      p_operation: operation,
      p_source_id: sourceId,
      p_source_revision: sourceRevision,
      p_content_hash: contentHash,
      p_byte_size: byteSize,
      p_media_type: mediaType
    }, {
      deadlineAt,
      responseLimitBytes: 32 * 1024
    }));
    const storageBaseUrl = `${this.supabaseUrl}/storage/v1`;
    const publicStorageBaseUrl = `${this.publicSupabaseUrl}/storage/v1`;
    let signedUrl = null;
    let expiresAt = null;
    if (operation === "download") {
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
      signedUrl = signedStorageUrl(publicStorageBaseUrl, signed?.signedURL, { download: true });
      expiresAt = new Date(Date.now() + COURSE_SOURCE_DOWNLOAD_EXPIRY_SECONDS * 1_000)
        .toISOString();
    }
    const normalized = normalizeCourseSourcesDatabaseValue(() =>
      normalizeCourseSourceAttachmentAccess({
        ...raw,
        signedUrl,
        expiresAt
      })
    );
    if (normalized.courseId !== courseId ||
        normalized.courseRevision !== expectedRevision ||
        normalized.operation !== operation || normalized.sourceId !== sourceId ||
        normalized.sourceRevision !== sourceRevision ||
        normalized.attachment.contentHash !== contentHash ||
        byteSize !== null && normalized.attachment.byteSize !== byteSize ||
        mediaType !== null && normalized.attachment.mediaType !== mediaType) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O acesso ao anexo não corresponde ao Curso e à Fonte solicitados."
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

  async getCourseAuditCycle({
    principal,
    courseId,
    expectedCourseRevision,
    auditSetVersion = null,
    query,
    cursor = null,
    limit = 12,
    deadlineAt = null
  }) {
    const options = normalizeCourseAuditCycleInputValue(() =>
      normalizeCourseAuditCycleReadOptions({
        expectedCourseRevision,
        auditSetVersion,
        query,
        cursor,
        limit
      })
    );
    let result;
    try {
      result = first(await this.rpc(
        "get_owned_course_audit_cycle_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_expected_course_revision: options.expectedCourseRevision,
          p_audit_set_version: options.auditSetVersion,
          p_query: options.query,
          p_cursor: options.cursor,
          p_limit: options.limit
        },
        {
          deadlineAt,
          responseLimitBytes: COURSE_AUDIT_CYCLE_RESPONSE_LIMIT_BYTES
        }
      ));
    } catch (error) {
      throw courseAuditCycleResponseFailure(error);
    }
    const normalized = normalizeCourseAuditCycleDatabaseValue(() =>
      normalizeCourseAuditCyclePage(
        withCourseAuditDeepLinks(result, this.publicAppUrl)
      )
    );
    if (normalized.courseId !== courseId ||
        normalized.courseRevision !== options.expectedCourseRevision ||
        options.auditSetVersion !== null &&
          normalized.auditSetVersion !== options.auditSetVersion ||
        JSON.stringify(normalizeCourseAuditCycleQuery(normalized.query)) !==
          JSON.stringify(options.query)) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A leitura de auditoria não corresponde ao Curso e à consulta solicitados."
      );
    }
    return normalized;
  }

  async getCourseVariantComparison({
    principal,
    courseId,
    comparisonSetId,
    expectedCourseRevision,
    deadlineAt = null
  }) {
    const options = normalizeCourseVariantInputValue(() => normalizeCourseVariantRead({
      comparisonSetId,
      expectedCourseRevision
    }));
    let result;
    try {
      result = first(await this.rpc(
        "get_owned_course_variant_comparison_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_source_course_id: courseId,
          p_expected_course_revision: options.expectedCourseRevision,
          p_comparison_set_id: options.comparisonSetId
        },
        { deadlineAt, responseLimitBytes: COURSE_VARIANT_RESPONSE_LIMIT_BYTES }
      ));
    } catch (error) {
      throw courseVariantResponseFailure(error);
    }
    const normalized = normalizeCourseVariantDatabaseValue(() =>
      normalizeCourseVariantComparison(result)
    );
    if (normalized.comparisonSetId !== options.comparisonSetId ||
        normalized.source.courseId !== courseId ||
        normalized.source.currentCourseRevision !== options.expectedCourseRevision) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A comparação de variantes não corresponde ao Curso solicitado."
      );
    }
    return normalized;
  }

  async listCourseVariantComparisons({ principal, courseId, expectedCourseRevision, deadlineAt = null }) {
    let result;
    try {
      result = first(await this.rpc(
        "list_owned_course_variant_comparisons_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_source_course_id: courseId,
          p_expected_course_revision: expectedCourseRevision
        },
        { deadlineAt, responseLimitBytes: COURSE_VARIANT_RESPONSE_LIMIT_BYTES }
      ));
    } catch (error) {
      throw courseVariantResponseFailure(error);
    }
    const normalized = normalizeCourseVariantDatabaseValue(() =>
      normalizeCourseVariantComparisonList(result)
    );
    if (normalized.sourceCourseId !== courseId ||
        normalized.sourceCourseRevision !== expectedCourseRevision) {
      throw new AuthoringApiError(503, "course_service_unavailable", "A lista de variantes não corresponde ao Curso solicitado.");
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
        "get_owned_course_authoring_analytics_for_actor_v1",
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
          "A página de Pesquisa excedeu 512 KiB. Use um recorte menor."
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

  async #auditContextForCommand({
    principal,
    courseId,
    expectedCourseRevision,
    command,
    deadlineAt
  }) {
    if (command.type === "record_audit") {
      const annotationIds = [...new Set(command.findings.flatMap((finding) =>
        finding.annotationRefs.map(({ annotationId }) => annotationId)
      ))];
      const page = await this.getCourseAuditCycle({
        principal,
        courseId,
        expectedCourseRevision,
        query: {
          mode: "context",
          targetStudyUnitId: command.targetStudyUnitId,
          findingId: null,
          correctionId: null,
          auditRunId: null,
          states: [],
          dimensions: [],
          severities: [],
          annotationIds
        },
        limit: 1,
        deadlineAt
      });
      return page.context;
    }
    const correctionId = command.type === "propose_authoring_correction" &&
      command.expectedCorrectionVersion === 0
      ? null
      : command.correctionId ?? null;
    const detailPage = await this.getCourseAuditCycle({
      principal,
      courseId,
      expectedCourseRevision,
      query: {
        mode: "detail",
        targetStudyUnitId: null,
        findingId: command.findingId,
        correctionId,
        auditRunId: null,
        states: [],
        dimensions: [],
        severities: [],
        annotationIds: []
      },
      limit: 1,
      deadlineAt
    });
    const finding = detailPage.detail?.finding;
    const targetStudyUnitId = finding?.target?.studyUnitId;
    if (!targetStudyUnitId) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O achado não contém um alvo de correção válido."
      );
    }
    const annotationIds = Array.isArray(finding.annotationRefs)
      ? finding.annotationRefs.map(({ annotationId }) => annotationId)
      : [];
    const contextPage = await this.getCourseAuditCycle({
      principal,
      courseId,
      expectedCourseRevision,
      auditSetVersion: detailPage.auditSetVersion,
      query: {
        mode: "context",
        targetStudyUnitId,
        findingId: null,
        correctionId: null,
        auditRunId: null,
        states: [],
        dimensions: [],
        severities: [],
        annotationIds
      },
      limit: 1,
      deadlineAt
    });
    return contextPage.context;
  }

  async getCourseAuthoringPartMaterialization({
    principal,
    courseId,
    authoringPartId,
    materializationId,
    deadlineAt = null
  }) {
    const result = first(await this.rpc(
      "get_owned_course_authoring_part_materialization_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_authoring_part_id: authoringPartId,
        p_materialization_id: materializationId
      },
      { deadlineAt }
    ));
    return normalizePartMaterialization(result, {
      courseId,
      authoringPartId,
      materializationId
    });
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
    inspectionVersion = 2,
    deadlineAt = null
  }) {
    if (![1, 2].includes(inspectionVersion)) {
      throw new TypeError("Versão da inspeção inválida.");
    }
    const result = first(await this.rpc(
      `list_owned_course_study_units_for_actor_v${inspectionVersion}`,
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
    const normalizePage = inspectionVersion === 2
      ? normalizeInspectionPage
      : normalizeLegacyInspectionPage;
    return withInspectionDeepLinks(normalizePage(result, {
      courseId,
      expectedRevision,
      scopeKind,
      scopeId
    }, validateCourseEntityContent), this.publicAppUrl);
  }

  async getCourseInspectionFocus({
    principal,
    courseId,
    inspectionFocusId,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("get_course_inspection_focus_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_inspection_focus_id: inspectionFocusId
    }, { deadlineAt }));
    return withInspectionFocusDeepLink(
      normalizeInspectionFocus(result, { courseId, inspectionFocusId }),
      this.publicAppUrl
    );
  }

  async createCourseInspectionFocus({
    principal,
    courseId,
    expectedRevision,
    title,
    studyUnitIds,
    requestId,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("create_course_inspection_focus_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedRevision,
      p_title: title,
      p_study_unit_ids: studyUnitIds,
      p_request_id: requestId
    }, { deadlineAt }));
    const focus = normalizeInspectionFocus(result, { courseId });
    if (focus.requestId !== requestId || typeof focus.idempotent !== "boolean") {
      throw new AuthoringApiError(
        503,
        "invalid_inspection_focus_state",
        "A confirmação do foco de inspeção não corresponde ao pedido."
      );
    }
    return withInspectionFocusDeepLink(focus, this.publicAppUrl);
  }

  async listCourseInspectionFocusStudyUnits({
    principal,
    courseId,
    inspectionFocusId,
    expectedRevision,
    cursorStudyUnitId = null,
    direction = "forward",
    limit = 12,
    maxBytes = 512 * 1024,
    deadlineAt = null
  }) {
    const [focusResult, pageResult] = await Promise.all([
      this.rpc("get_course_inspection_focus_for_actor_v1", {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_inspection_focus_id: inspectionFocusId
      }, { deadlineAt }),
      this.rpc("list_owned_course_inspection_focus_units_for_actor_v1", {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_inspection_focus_id: inspectionFocusId,
        p_expected_revision: expectedRevision,
        p_cursor_study_unit_id: cursorStudyUnitId,
        p_direction: direction,
        p_limit: limit,
        p_max_bytes: maxBytes
      }, { deadlineAt })
    ]);
    const focus = withInspectionFocusDeepLink(
      normalizeInspectionFocus(first(focusResult), { courseId, inspectionFocusId }),
      this.publicAppUrl
    );
    const { validateCourseEntityContent } = await import(
      "../aralearn/runtime/domain/courseEntities.js"
    );
    const page = withInspectionDeepLinks(normalizeInspectionPage(first(pageResult), {
      courseId,
      expectedRevision,
      scopeKind: "course",
      scopeId: null
    }, validateCourseEntityContent), this.publicAppUrl);
    return {
      ...page,
      inspectionFocus: {
        id: focus.inspectionFocusId,
        title: focus.title,
        deepLink: focus.deepLink,
        requestedCount: focus.studyUnitIds.length,
        availableCount: focus.availableStudyUnitIds.length,
        missingStudyUnitIds: focus.missingStudyUnitIds
      }
    };
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
    let fileCleanupPending = false;
    if (operation === "delete_owned_course" && result.changed) {
      try {
        await this.#deleteAccountStoragePrefix(
          COURSE_SOURCE_ATTACHMENT_BUCKET,
          `${courseId}/`,
          { deadlineAt }
        );
      } catch {
        fileCleanupPending = true;
      }
    }
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

  async commitCourseInstructionalPlan({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    expectedPlanVersion,
    command,
    deadlineAt = null
  }) {
    const normalizedCommand = normalizeCourseAuthoringPlanInputValue(() =>
      normalizeCourseAuthoringPlanCommand(command)
    );
    const current = await this.getCourseInstructionalPlan({
      principal,
      courseId,
      recentLimit: 1,
      deadlineAt
    });
    const currentPlan = editableInstructionalPlan(current);
    const matchesFence = Number(current?.courseRevision) === expectedCourseRevision &&
      Number(current?.plan?.version) === expectedPlanVersion;
    const targetPlan = matchesFence
      ? normalizeCourseAuthoringPlanInputValue(() =>
          applyCourseAuthoringPlanCommand(currentPlan, normalizedCommand)
        )
      : currentPlan;
    const result = first(await this.rpc("commit_course_instructional_plan_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_course_revision: expectedCourseRevision,
      p_expected_plan_version: expectedPlanVersion,
      p_command: normalizedCommand,
      p_plan: targetPlan,
      p_channel: authoringChannel(principal),
      p_request_id: requestId
    }, { deadlineAt, timeoutMs: 40_000 }));
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
    const result = first(await this.rpc("apply_course_design_command_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_course_revision: expectedCourseRevision,
      p_command: command,
      p_channel: authoringChannel(principal),
      p_request_id: requestId
    }, {
      deadlineAt,
      timeoutMs: 40_000,
      responseLimitBytes: COURSE_DESIGN_RESPONSE_LIMIT_BYTES
    }));
    const normalized = normalizeCourseDesignDatabaseValue(() => normalizeCourseDesignChange(result));
    const expectedScope = command.scope || null;
    if (normalized.courseId !== courseId || normalized.requestId !== requestId ||
        normalized.change != null && (
          normalized.change.type !== command.type || expectedScope != null && (
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
      normalizedCommand.type === "attach_pdf"
        ? "attach_course_source_pdf_for_actor_v1"
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
    let result;
    if (normalizedCommand.type === "attach_pdf") {
      try {
        const access = await this.getCourseSourceAttachmentAccess({
          principal,
          courseId,
          expectedRevision: expectedCourseRevision,
          operation: "prepare_upload",
          sourceId: normalizedCommand.sourceId,
          sourceRevision: normalizedCommand.sourceRevision,
          contentHash: normalizedCommand.attachment.contentHash,
          byteSize: normalizedCommand.attachment.byteSize,
          mediaType: normalizedCommand.attachment.mediaType,
          deadlineAt
        });
        if (access.uploadRequired) throw invalidCourseSourcePdf();
        await this.#verifyCourseSourcePdf(access.attachment, {
          deadlineAt,
          requireStructure: true
        });
      } catch (error) {
        if (!(error instanceof AuthoringApiError) || error.code !== "stale_course_state") {
          throw error;
        }
        result = first(await execute());
      }
    }
    result ??= first(await execute());
    const normalized = normalizeCourseSourcesDatabaseValue(() =>
      normalizeCourseSourceChange(result)
    );
    if (normalized.courseId !== courseId || normalized.requestId !== requestId ||
        normalized.courseRevision !==
          expectedCourseRevision + (normalized.changed ? 1 : 0) ||
        normalized.change != null && (
          normalized.change.type !== normalizedCommand.type ||
          normalized.change.subjectId !== courseSourceCommandSubjectId(normalizedCommand)
        )) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação de Fontes não corresponde ao comando solicitado."
      );
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

  async executeCourseAuditCycleCommand({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    command,
    deadlineAt = null
  }) {
    const publicCommand = normalizeCourseAuditCycleInputValue(() =>
      normalizeCourseAuditCycleCommand(command)
    );
    let serverCommand = publicCommand;
    let replayProbeError = null;
    try {
      if (new Set(["record_audit", "verify_finding"]).has(publicCommand.type)) {
        const context = await this.#auditContextForCommand({
          principal,
          courseId,
          expectedCourseRevision,
          command: publicCommand,
          deadlineAt
        });
        if (context?.contextHash !== publicCommand.contextHash) {
          throw new AuthoringApiError(
            409,
            "audit_context_changed",
            "O contexto da auditoria mudou; releia antes de registrar o resultado."
          );
        }
        const deterministic = await deterministicRepresentationFacts(
          context,
          publicCommand.auditRunId
        );
        serverCommand = {
          ...publicCommand,
          checks: [deterministic.check, ...publicCommand.checks],
          ...(publicCommand.type === "record_audit"
            ? {
                findings: [
                  ...(deterministic.finding === null ? [] : [deterministic.finding]),
                  ...publicCommand.findings
                ]
              }
            : {})
        };
      } else if (publicCommand.type === "propose_authoring_correction") {
        const context = await this.#auditContextForCommand({
          principal,
          courseId,
          expectedCourseRevision,
          command: publicCommand,
          deadlineAt
        });
        serverCommand = await validateCorrectionCandidate(context, publicCommand);
      }
    } catch (error) {
      if (!courseAuditReplayProbeAllowed(error, publicCommand.type)) throw error;
      replayProbeError = error;
      serverCommand = { ...publicCommand, __replayOnly: true };
    }
    if (replayProbeError === null) {
      serverCommand = normalizeCourseAuditCycleInputValue(() =>
        normalizeCourseAuditCycleServerCommand(serverCommand)
      );
    }
    let result;
    try {
      result = first(await this.rpc(
        "execute_course_audit_cycle_command_for_actor_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: courseId,
          p_expected_course_revision: expectedCourseRevision,
          p_command: serverCommand,
          p_channel: authoringChannel(principal),
          p_request_id: requestId
        },
        {
          deadlineAt,
          timeoutMs: 40_000,
          responseLimitBytes: COURSE_AUDIT_CYCLE_RESPONSE_LIMIT_BYTES
        }
      ));
    } catch (error) {
      if (replayProbeError !== null) throw replayProbeError;
      throw courseAuditCycleResponseFailure(error);
    }
    const normalized = normalizeCourseAuditCycleDatabaseValue(() =>
      normalizeCourseAuditCycleChange(
        withCourseAuditDeepLinks(result, this.publicAppUrl)
      )
    );
    const confirmedCommand = replayProbeError === null ? serverCommand : publicCommand;
    const changesCourseContent = new Set([
      "apply_authoring_correction",
      "rollback_authoring_correction"
    ]).has(confirmedCommand.type);
    const expectedResultRevision = expectedCourseRevision +
      (changesCourseContent && normalized.changed && !normalized.idempotent ? 1 : 0);
    if (normalized.courseId !== courseId || normalized.requestId !== requestId ||
        normalized.change !== null && normalized.change.type !== confirmedCommand.type ||
        (normalized.idempotent
          ? normalized.courseRevision < expectedCourseRevision
          : normalized.courseRevision !== expectedResultRevision) ||
        confirmedCommand.findingId != null && normalized.finding != null &&
          normalized.finding.findingId !== confirmedCommand.findingId ||
        confirmedCommand.correctionId != null && normalized.correction != null &&
          normalized.correction.correctionId !== confirmedCommand.correctionId ||
        replayProbeError !== null && !normalized.idempotent) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação da auditoria não corresponde ao comando solicitado."
      );
    }
    return normalized;
  }

  async executeCourseVariantCommand({
    principal,
    courseId,
    requestId,
    expectedCourseRevision = null,
    command,
    deadlineAt = null
  }) {
    const normalizedCommand = normalizeCourseVariantInputValue(() =>
      command?.type === "create_comparison_variants"
        ? normalizeCourseVariantCommand(command)
        : normalizeCourseVariantDetachCommand(command)
    );
    let result;
    try {
      if (normalizedCommand.type === "create_comparison_variants") {
        result = first(await this.rpc(
          "create_course_variants_for_actor_v1",
          {
            p_actor_id: principal.actorId,
            p_source_course_id: courseId,
            p_expected_course_revision: expectedCourseRevision,
            p_command: normalizedCommand,
            p_request_id: requestId
          },
          { deadlineAt, timeoutMs: 60_000, responseLimitBytes: COURSE_VARIANT_RESPONSE_LIMIT_BYTES }
        ));
      } else {
        result = first(await this.rpc(
          "detach_course_variant_for_actor_v1",
          {
            p_actor_id: principal.actorId,
            p_source_course_id: courseId,
            p_comparison_set_id: normalizedCommand.comparisonSetId,
            p_course_id: normalizedCommand.courseId,
            p_request_id: requestId
          },
          { deadlineAt, timeoutMs: 30_000, responseLimitBytes: COURSE_VARIANT_RESPONSE_LIMIT_BYTES }
        ));
      }
    } catch (error) {
      throw courseVariantResponseFailure(error);
    }
    const normalized = normalizeCourseVariantDatabaseValue(() =>
      normalizeCourseVariantChange(result)
    );
    if (normalized.sourceCourseId !== courseId ||
        normalized.comparisonSetId !== normalizedCommand.comparisonSetId ||
        normalizedCommand.type === "create_comparison_variants" && (
          normalized.sourceCourseRevision !== expectedCourseRevision ||
          normalized.members.length !== normalizedCommand.variants.length
        ) ||
        normalizedCommand.type === "detach_comparison_variant" &&
          normalized.courseId !== normalizedCommand.courseId) {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "A confirmação de variantes não corresponde ao comando solicitado."
      );
    }
    return normalized;
  }

  async advanceCourseAuthoringPartMaterialization({
    principal,
    courseId,
    authoringPartId,
    materializationId,
    requestId,
    expectedCourseRevision,
    expectedMaterializationVersion,
    operation,
    payload,
    deadlineAt = null
  }) {
    let payloadForRpc = payload;
    if (operation === "record_step") {
      const current = await this.getCourseAuthoringPartMaterialization({
        principal,
        courseId,
        authoringPartId,
        materializationId,
        deadlineAt
      });
      const materialization = current.materialization;
      const application = payload.designApplication;
      const sourceApplication = payload.sourceAttributionApplication == null
        ? null
        : normalizeCourseSourcesInputValue(() =>
            normalizeCourseSourceAttributionApplication(
              payload.sourceAttributionApplication
            ));
      payloadForRpc = {
        ...payload,
        sourceAttributionApplication: sourceApplication
      };
      const step = materialization.steps.find(({ id }) => id === payload.stepId);
      if (!step) {
        throw new AuthoringApiError(
          409,
          "materialization_step_not_found",
          "A etapa não pertence à materialização corrente."
        );
      }
      const requiresApplication = payload.status === "completed" &&
        step.kind === "didactic_microsequence_materialization";
      if ((application != null) !== requiresApplication ||
          (sourceApplication != null) !== requiresApplication) {
        throw new AuthoringApiError(
          409,
          "materialization_application_requirement_mismatch",
          "Os fatos de desenho e proveniência não correspondem ao tipo e ao resultado da etapa selada."
        );
      }
      if (application != null) {
        const target = materialization.designContext.targets.find(({ didacticMicrosequenceId }) =>
          didacticMicrosequenceId === application.didacticMicrosequenceId
        );
        if (application.contextHash !== materialization.contextHash ||
            step.targetDidacticMicrosequenceId !== application.didacticMicrosequenceId ||
            !target) {
          throw new AuthoringApiError(
            409,
            "design_context_mismatch",
            "Os fatos da etapa não correspondem ao contexto de desenho selado."
          );
        }
        const componentRefs = [...new Set(application.studyUnits.flatMap(
          (studyUnit) => studyUnit.componentRefs
        ))];
        assertComponentRefsAllowed(componentRefs, target.componentPolicy.policy);
        const designStudyUnitIds = application.studyUnits
          .map(({ studyUnitId }) => studyUnitId)
          .sort((left, right) => left.localeCompare(right, "en"));
        const sourceStudyUnitIds = sourceApplication.studyUnits
          .map(({ studyUnitId }) => studyUnitId)
          .sort((left, right) => left.localeCompare(right, "en"));
        const changedStudyUnits = Array.isArray(payload.entityChanges?.upserts)
          ? payload.entityChanges.upserts.filter(({ entityType }) => entityType === "study_unit")
          : [];
        const changedStudyUnitIds = changedStudyUnits
          .map(({ entityId }) => entityId)
          .sort((left, right) => left.localeCompare(right, "en"));
        if (sourceApplication.contextHash !== materialization.contextHash ||
            sourceApplication.didacticMicrosequenceId !==
              application.didacticMicrosequenceId ||
            JSON.stringify(sourceStudyUnitIds) !== JSON.stringify(designStudyUnitIds) ||
            JSON.stringify(sourceStudyUnitIds) !== JSON.stringify(changedStudyUnitIds) ||
            changedStudyUnits.some(({ parentType, parentId }) =>
              parentType !== "microsequence" ||
              parentId !== application.didacticMicrosequenceId)) {
          throw new AuthoringApiError(
            409,
            "source_context_mismatch",
            "Os fatos de proveniência não correspondem ao contexto e às Unidades seladas."
          );
        }
        assertSourceLinksAllowedByContext(sourceApplication.studyUnits, target);
      }
      const changedObjects = (Array.isArray(payload.entityChanges?.upserts)
        ? payload.entityChanges.upserts
        : [])
        .filter(({ entityType, entityId }) =>
          new Set(["module", "lesson", "microsequence", "study_unit"]).has(entityType) &&
          typeof entityId === "string" && entityId.length > 0)
        .map(({ entityType, entityId }) => ({ entityType, entityId }));
      payloadForRpc = {
        ...payloadForRpc,
        resultFacts: {
          ...payload.resultFacts,
          changedObjects
        }
      };
    }
    const channel = materializationChannel(principal);
    const result = first(await this.rpc(
      "advance_course_authoring_part_materialization_for_actor_v2",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_authoring_part_id: authoringPartId,
        p_materialization_id: materializationId,
        p_expected_course_revision: expectedCourseRevision,
        p_expected_materialization_version: expectedMaterializationVersion,
        p_operation: operation,
        p_payload: payloadForRpc,
        p_channel: channel,
        p_request_id: requestId
      },
      { deadlineAt, timeoutMs: 40_000 }
    ));
    const normalized = normalizeMaterializationChange(result, {
      courseId,
      authoringPartId,
      materializationId,
      operation,
      channel,
      stepId: operation === "record_step" ? payload.stepId : null
    });
    return withDeepLink(normalized, this.publicAppUrl, "planning");
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
      normalizeSourceAttributionApplications(sourceAttributionApplications, {
        allowLegacyCarry: contextualApplication
      })
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
