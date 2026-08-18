import { AuthoringApiError } from "./errors.js";
import { decodeJwtClaims } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";
import { validateCourseEntityContent } from
  "../aralearn/runtime/domain/courseEntities.js";
import {
  applyCourseAuthoringPlanCommand,
  normalizeCourseAuthoringPlan,
  normalizeCourseAuthoringPlanCommand
} from "../aralearn/runtime/domain/courseAuthoringPlan.js";
import {
  COURSE_DESIGN_PARAMETER_DEFINITIONS,
  CourseDesignParametersError,
  normalizeCourseAuthoringGuidanceInterpretation,
  normalizeCourseDesignChange,
  normalizeCourseDesignParameterValue,
  normalizeCourseDesignRead
} from "../aralearn/runtime/domain/courseDesignParameters.js";
import {
  COURSE_DESIGN_CONTEXT_V2_CONTRACT,
  CourseSourcesError,
  normalizeCourseSourceAttributionApplication,
  normalizeCourseSourceChange,
  normalizeCourseSourceCommand,
  normalizeCourseSourceContext,
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
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantRead
} from "../aralearn/runtime/domain/courseVariants.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../aralearn/runtime/resources/catalog/resourceCatalog.js";

const DEFAULT_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const COURSE_VARIANT_RESPONSE_LIMIT_BYTES = 256 * 1024;
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
const COURSE_DESIGN_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_SOURCES_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_ANCHORED_ANNOTATIONS_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_AUDIT_CYCLE_RESPONSE_LIMIT_BYTES = 256 * 1024;
const COURSE_AUDIT_CYCLE_DTO_LIMIT_BYTES = 240 * 1024;
const COMPONENT_CATALOG_OPTIONS = Object.freeze(
  RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .map((manifest) => Object.freeze({
      ref: `${manifest.id}@${manifest.version}`,
      label: manifest.label,
      purpose: manifest.purpose
    }))
);
const COMPONENT_REFS = new Set(COMPONENT_CATALOG_OPTIONS.map(({ ref }) => ref));
const COURSE_DESIGN_PARAMETER_DEFAULTS = new Map(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id, defaultValue }) => [id, defaultValue])
);
const CONTEXT_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;

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

function normalizeComponentPolicy(value) {
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
        refs.some((ref) => typeof ref !== "string" || !COMPONENT_REFS.has(ref))) {
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
  return command.type === "save_source" || command.type === "retire_source"
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

function normalizeInspectionPage(value, { courseId, expectedRevision, scopeKind, scopeId }) {
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
    if (!exactRecord(item, INSPECTION_ITEM_FIELDS) || !jsonRecord(item.studyUnit) ||
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
    policy = normalizeComponentPolicy(value.policy);
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

function normalizeMaterializationDesignContext(value, { courseId, authoringPartId }) {
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
      sourceContext.componentCatalogVersion !== RESOURCE_CATALOG.catalogVersion ||
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
  const didactic = kind === "didactic_microsequence_materialization";
  if (!UUID_PATTERN.test(id) || !nonNegativeSafeInteger(value.position) ||
      !new Set(["context_load", "didactic_microsequence_materialization", "validation"]).has(kind) ||
      !new Set(["pending", "completed", "failed"]).has(status) ||
      !positiveSafeInteger(value.version) || !jsonRecord(value.resultFacts) ||
      duplicatesMaterializationPayload(value.resultFacts) ||
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
    resultFacts: structuredClone(value.resultFacts),
    updatedAt: value.updatedAt,
    completedAt: value.completedAt
  };
}

function normalizePartMaterialization(value, { courseId, authoringPartId, materializationId }) {
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
  if (id !== materializationId || !UUID_PATTERN.test(id) ||
      !positiveSafeInteger(source.authoringPartVersion) ||
      !new Set(["application", "mcp"]).has(channel) ||
      !new Set(["running", "completed", "failed"]).has(status) ||
      !positiveSafeInteger(source.version) || !jsonRecord(source.designContext) ||
      typeof source.contextHash !== "string" || !CONTEXT_HASH_PATTERN.test(source.contextHash) ||
      !jsonRecord(source.resultFacts) || duplicatesMaterializationPayload(source.resultFacts) ||
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
      resultFacts: structuredClone(source.resultFacts),
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
  const clientId = claimText(claims?.client_id);
  if (claimText(claims?.iss) !== issuer ||
      !audienceIncludes(claims?.aud, resource) ||
      !clientId || !claimText(claims?.sub) ||
      !Number.isFinite(claims?.iat) || claims.iat > now + 30 ||
      !Number.isFinite(claims?.exp) || claims.exp <= now ||
      (claims?.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30))) {
    throw new AuthoringApiError(
      401,
      "invalid_oauth_token",
      "O access token não foi emitido para este recurso MCP."
    );
  }
  return clientId;
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
        `?section=inspection&studyUnitId=${encodeURIComponent(studyUnitId)}`
    };
  });
  return result;
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
              section: "observations",
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
      section: "observations",
      findingId
    }), 3);
    injectLink(finding.deepLinks, "target", finding.target?.currentAvailable
      ? auditCourseHref(publicAppUrl, courseId, {
          section: "inspection",
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
      section: "observations",
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
            section: "observations",
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
            section: "observations",
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
  const result = !audit.structural.valid
    ? "failed"
    : audit.overallFit === "substitute"
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
    publicEvidence: auditPublicEvidence(audit),
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

function validateCorrectionCandidate(context, command) {
  const target = context?.target;
  const candidate = {
    id: target?.studyUnitId,
    position: target?.position,
    ...(jsonRecord(command.afterContent) ? structuredClone(command.afterContent) : {})
  };
  const entity = validateCourseEntityContent("study_unit", candidate);
  const catalog = entity.valid
    ? RESOURCE_CATALOG.validateStudyUnit(entity.normalized)
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

function validateComponentCatalogProjection(value) {
  const catalog = value?.componentCatalog;
  const options = Array.isArray(catalog?.options) ? catalog.options : [];
  const validOptions = options.length === COMPONENT_CATALOG_OPTIONS.length &&
    options.every((option, index) => {
      const expected = COMPONENT_CATALOG_OPTIONS[index];
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
  policies.forEach(normalizeComponentPolicy);
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength >
      COURSE_DESIGN_RESPONSE_LIMIT_BYTES) {
    throw responseTooLarge();
  }
  return normalized;
}

function authoringChannel(principal) {
  if (principal?.authenticationKind === "application") return "application";
  if (principal?.authenticationKind === "oauth") return "mcp";
  throw new AuthoringApiError(401, "authentication_required", "A origem da Autoria é inválida.");
}

function anchoredAnnotationChannel(principal) {
  if (principal?.authenticationKind === "application") return "authoring_interface";
  if (principal?.authenticationKind === "oauth") return "authoring_chat";
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
   *   oauthIssuer?: string,
   *   serverApiKey?: string,
   *   publishableKey?: string,
   *   publicAppUrl?: string,
   *   fetchImpl?: typeof globalThis.fetch,
   *   attempts?: number,
   *   requestTimeoutMs?: number,
   *   responseLimitBytes?: number
   * }} [options]
   */
  constructor({
    supabaseUrl,
    oauthIssuer = "",
    serverApiKey,
    publishableKey,
    publicAppUrl,
    fetchImpl = globalThis.fetch,
    attempts = 3,
    requestTimeoutMs = 8_000,
    responseLimitBytes = DEFAULT_RESPONSE_LIMIT_BYTES
  } = {}) {
    this.supabaseUrl = requiredUrl(supabaseUrl, "SUPABASE_URL");
    this.oauthIssuer = requiredUrl(oauthIssuer || `${this.supabaseUrl}/auth/v1`, "Issuer OAuth");
    this.serverApiKey = String(serverApiKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
    this.publicAppUrl = requiredUrl(publicAppUrl, "URL pública do AraLearn");
    this.fetchImpl = fetchImpl;
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
        if (!retry || !retryableStatus(response.status) || attempt === this.attempts) throw error;
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

  async resolveApplicationPrincipal(jwt, { deadlineAt = null } = {}) {
    const user = await this.#userForJwt(jwt, { deadlineAt });
    return {
      actorId: String(user.id),
      authenticationKind: "application",
      scopes: ["authoring:read", "authoring:write"]
    };
  }

  async resolvePrincipal(authentication, { deadlineAt = null } = {}) {
    if (authentication?.kind !== "oauth") {
      throw new AuthoringApiError(401, "oauth_required", "Conecte sua conta para usar a autoria.");
    }
    const user = await this.#userForJwt(authentication.credential, { deadlineAt });
    const claims = decodeJwtClaims(authentication.credential);
    const oauthClientId = assertMcpClaims(claims, {
      issuer: this.oauthIssuer,
      resource: String(authentication.resource || "").trim()
    });
    if (claimText(claims.sub) !== String(user.id)) {
      throw new AuthoringApiError(401, "invalid_oauth_token", "O token não corresponde à sessão.");
    }
    return {
      actorId: String(user.id),
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"],
      oauthClientId
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
    const normalized = validateComponentCatalogProjection(result);
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
    deadlineAt = null
  }) {
    const result = first(await this.rpc(
      "list_owned_course_study_units_for_actor_v1",
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
    return withInspectionDeepLinks(normalizeInspectionPage(result, {
      courseId,
      expectedRevision,
      scopeKind,
      scopeId
    }), this.publicAppUrl);
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
    const normalizedCommand = normalizeCourseAuthoringPlanCommand(command);
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
      ? applyCourseAuthoringPlanCommand(currentPlan, normalizedCommand)
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
    const result = first(await this.rpc(
      "execute_course_source_command_for_actor_v1",
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
    ));
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
        serverCommand = validateCorrectionCandidate(context, publicCommand);
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
        normalizedCommand.type === "detach_course_variant" &&
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
    }
    const result = first(await this.rpc(
      "advance_course_authoring_part_materialization_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_authoring_part_id: authoringPartId,
        p_materialization_id: materializationId,
        p_expected_course_revision: expectedCourseRevision,
        p_expected_materialization_version: expectedMaterializationVersion,
        p_operation: operation,
        p_payload: payloadForRpc,
        p_channel: authoringChannel(principal),
        p_request_id: requestId
      },
      { deadlineAt, timeoutMs: 40_000 }
    ));
    const normalized = normalizeMaterializationChange(result, {
      courseId,
      authoringPartId,
      materializationId,
      operation,
      channel: authoringChannel(principal),
      stepId: operation === "record_step" ? payload.stepId : null
    });
    return withDeepLink(normalized, this.publicAppUrl, "planning");
  }

  async commitCourseComposition({
    principal,
    courseId,
    requestId,
    expectedRevision,
    upserts = [],
    deletes = [],
    sourceAttributionApplications = [],
    deadlineAt = null
  }) {
    const normalizedApplications = normalizeCourseSourcesInputValue(() =>
      normalizeSourceAttributionApplications(sourceAttributionApplications)
    );
    const result = first(await this.rpc("commit_course_composition_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedRevision,
      p_upserts: upserts,
      p_deletes: deletes,
      p_source_attribution_applications: normalizedApplications,
      p_request_id: requestId
    }, { deadlineAt, timeoutMs: 40_000 }));
    return withDeepLink(result, this.publicAppUrl);
  }
}
