import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import {
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import {
  readPackageStudyUnitText,
  renderPackageStudyUnitBlocksWithDock
} from
  "../render/renderPackageStudyUnit.js";
import {
  activateManualStudyUnitEdit,
  applyManualStudyUnitEdit,
  isAmbiguousManualStudyUnitWriteFailure,
  listManualStudyUnitEditablePaths,
  listManualStudyUnitTargetIds,
  readManualStudyUnitEditPathValues
} from "./manualStudyUnitEdit.js";
import { createCourseProviderAssistance } from "./CourseProviderAssistance.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";
import {
  formatObservationTextBudget,
  isObservationTextOverLimit,
  renderStudyUnitObservationSheet,
  validateStudyUnitObservationText
} from "./renderStudyUnitObservationSheet.js";

const PAGE_CONTRACT = "aralearn.course-study-unit-inspection-page.v2";
const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const MAX_WINDOW_ITEMS = 36;
const MAX_PAGE_BYTES = 1_500_000;
const ANNOTATION_PAGE_SIZE = 24;
const MAX_ANNOTATIONS_PER_TARGET = 128;
const MAX_ANNOTATION_PAGES_PER_TARGET = 128;
const ENTITY_ID_MAX_LENGTH = 240;
const DEEP_LINK_MAX_LENGTH = 2_048;
const POSITION_CHANNEL_NAME = "aralearn.course-authoring-inspection.v1";
const SEARCH_RESULT_LIMIT = 12;
const COMPACT_PREVIEW_MAX_CHARACTERS = 160;
const INSPECTION_ACTIVE_LINE_OFFSET = 16;
const SEARCH_KIND_LABELS = Object.freeze({
  course: "Curso",
  module: "Módulo",
  lesson: "Lição",
  didactic_microsequence: "Microssequência",
  study_unit: "Unidade"
});
const INSPECTION_MENU_SELECTOR =
  "details.course-inspection-context-selector, details.course-inspection-item-details";
const PART_STATES = new Set([
  "planned", "materializing", "attention_required", "partially_materialized", "materialized"
]);
const SCOPE_KINDS = new Set([
  "course", "authoring_part", "unassigned", "module", "lesson", "didactic_microsequence"
]);
const DESIGN_SNAPSHOT_ORIGINS = new Set([
  "automatic", "author", "research_condition", "migration", "system_default"
]);
const DESIGN_SNAPSHOT_SCOPES = new Set([
  "course", "module", "lesson", "didactic_microsequence"
]);
const DESIGN_PARAMETER_LABELS = Object.freeze({
  new_analysis_unit_ceiling_per_expository_study_unit:
    "Novas unidades de análise por Unidade expositiva",
  required_explanation_forms: "Formas de explicação requeridas",
  minimum_distinct_practice_opportunities_per_evidence_requirement:
    "Oportunidades distintas por requisito",
  required_practice_variation_dimensions: "Dimensões de variação da prática"
});
const DESIGN_VALUE_LABELS = Object.freeze({
  plain_definition: "definição direta",
  concrete_example: "exemplo concreto",
  mechanism: "mecanismo",
  contrast: "contraste",
  application_condition: "condição de aplicação",
  limit_or_exception: "limite ou exceção",
  worked_example: "exemplo resolvido",
  representation_link: "ligação entre representações",
  case_or_data: "caso ou dados",
  context: "contexto",
  task_feature: "característica da tarefa",
  external_representation: "representação externa",
  support_level: "nível de apoio"
});

export const COURSE_INSPECTION_PAGE_SIZE = PAGE_SIZE;
export const COURSE_INSPECTION_MAX_WINDOW_ITEMS = MAX_WINDOW_ITEMS;

function containsControlCharacters(value) {
  return [...String(value)].some((character) => {
    const code = character.codePointAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(value, fields, message) {
  if (!isPlainObject(value) || Object.keys(value).some((field) => !fields.includes(field))) {
    throw new TypeError(message);
  }
}

function canonicalId(value, label, { uuid = false } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const valid = normalized && normalized === value && normalized.length <= ENTITY_ID_MAX_LENGTH &&
    !containsControlCharacters(normalized) &&
    (uuid ? UUID_PATTERN.test(normalized) : /\S/u.test(normalized));
  if (!valid) throw new TypeError(`${label} é inválida.`);
  return normalized;
}

function requiredText(value, label, maximum = 300) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized !== value || normalized.length > maximum ||
      containsControlCharacters(normalized)) {
    throw new TypeError(`${label} é inválido.`);
  }
  return normalized;
}

function natural(value, label, { minimum = 0, maximum = 1_000_000 } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new TypeError(`${label} é inválido.`);
  }
  return number;
}

function normalizeScope(value) {
  exactRecord(value, ["kind", "id"], "O escopo de Conteúdo é inválido.");
  const kind = String(value.kind || "");
  const id = value.id == null ? null : canonicalId(value.id, "A identidade do escopo", {
    uuid: kind === "authoring_part"
  });
  if (!SCOPE_KINDS.has(kind) || ((kind === "course" || kind === "unassigned") !== (id === null))) {
    throw new TypeError("O escopo de Conteúdo é inválido.");
  }
  return Object.freeze({ kind, id });
}

function sameScope(left, right) {
  return left?.kind === right?.kind && left?.id === right?.id;
}

function normalizePart(value, label = "A Parte") {
  exactRecord(value, ["id", "position", "title", "state"], `${label} é inválida.`);
  const state = String(value.state || "");
  if (!PART_STATES.has(state)) throw new TypeError(`${label} possui estado inválido.`);
  return Object.freeze({
    id: canonicalId(value.id, `A identidade de ${label.toLowerCase()}`, { uuid: true }),
    position: natural(value.position, `A posição de ${label.toLowerCase()}`, { maximum: 63 }),
    title: requiredText(value.title, `O título de ${label.toLowerCase()}`),
    state
  });
}

function normalizeScopeOptions(value) {
  exactRecord(
    value,
    ["authoringParts", "unassignedStudyUnitCount"],
    "As opções de escopo de Conteúdo são inválidas."
  );
  if (!Array.isArray(value.authoringParts) || value.authoringParts.length > 64) {
    throw new TypeError("As opções de Parte em Conteúdo são inválidas.");
  }
  const parts = value.authoringParts.map((part, index) => normalizePart(part, `A Parte ${index + 1}`));
  if (new Set(parts.map(({ id }) => id)).size !== parts.length ||
      parts.some((part, index) => part.position !== index)) {
    throw new TypeError("A ordem das Partes em Conteúdo é inválida.");
  }
  return Object.freeze({
    authoringParts: Object.freeze(parts),
    unassignedStudyUnitCount: natural(
      value.unassignedStudyUnitCount,
      "A quantidade de Unidades de estudo sem Parte"
    )
  });
}

function normalizePathNode(value, kind) {
  exactRecord(value, ["id", "position", "title"], `O caminho de ${kind} é inválido.`);
  return Object.freeze({
    id: canonicalId(value.id, `A identidade de ${kind}`),
    position: natural(value.position, `A posição de ${kind}`),
    title: requiredText(value.title, `O título de ${kind}`)
  });
}

function normalizeStudyUnit(value) {
  exactRecord(
    value,
    ["id", "position", "title", "role", "content", "response", "feedback", "topics"],
    "Uma Unidade de estudo de Conteúdo é inválida."
  );
  const cloned = structuredClone(value);
  cloned.id = canonicalId(cloned.id, "A identidade da Unidade de estudo");
  cloned.position = natural(cloned.position, "A posição da Unidade de estudo", { minimum: 1 });
  cloned.title = requiredText(cloned.title, "O título da Unidade de estudo");
  if (!new Set(["theory", "practice"]).has(cloned.role) || !Array.isArray(cloned.content) ||
      !Array.isArray(cloned.feedback) || !Array.isArray(cloned.topics)) {
    throw new TypeError("O envelope da Unidade de estudo é inválido.");
  }
  return Object.freeze(cloned);
}

function normalizeAuthorship(value) {
  exactRecord(
    value,
    ["pendingObservationCount", "production", "design"],
    "O estado autoral da Unidade é inválido."
  );
  const pendingObservationCount = natural(
    value.pendingObservationCount,
    "A quantidade de Observações pendentes",
    { maximum: 512 }
  );
  let production = null;
  if (value.production !== null) {
    exactRecord(
      value.production,
      ["materializationId", "recordedAt", "state", "currentMaterialization"],
      "A proveniência de produção é inválida."
    );
    const recordedAt = String(value.production.recordedAt || "");
    if (!UUID_PATTERN.test(String(value.production.materializationId || "")) ||
        Number.isNaN(Date.parse(recordedAt)) ||
        !new Set(["produced", "changed"]).has(value.production.state) ||
        typeof value.production.currentMaterialization !== "boolean") {
      throw new TypeError("A proveniência de produção é inválida.");
    }
    production = Object.freeze({
      materializationId: value.production.materializationId,
      recordedAt,
      state: value.production.state,
      currentMaterialization: value.production.currentMaterialization
    });
  }
  let design = null;
  if (value.design !== null) {
    exactRecord(
      value.design,
      ["used", "current", "state"],
      "A comparação de desenho é inválida."
    );
    if (!new Set(["current", "changed", "verified"]).has(value.design.state)) {
      throw new TypeError("A comparação de desenho é inválida.");
    }
    design = Object.freeze({
      used: normalizeDesignSnapshot(value.design.used),
      current: normalizeDesignSnapshot(value.design.current),
      state: value.design.state
    });
  }
  return Object.freeze({ pendingObservationCount, production, design });
}

function normalizeDesignSnapshot(value) {
  exactRecord(
    value,
    ["parameters", "guidance", "componentPolicy"],
    "O desenho contextual da Unidade é inválido."
  );
  if (!Array.isArray(value.parameters) || value.parameters.length !== 4 ||
      !Array.isArray(value.guidance) || value.guidance.length > 4) {
    throw new TypeError("O desenho contextual da Unidade é inválido.");
  }
  const parameters = value.parameters.map((parameter) => {
    exactRecord(
      parameter,
      ["parameterId", "value", "origin", "sourceScopeKind"],
      "Um parâmetro contextual da Unidade é inválido."
    );
    const parameterId = String(parameter.parameterId || "");
    const normalizedValue = structuredClone(parameter.value);
    if (!Object.hasOwn(DESIGN_PARAMETER_LABELS, parameterId) ||
        !(Number.isSafeInteger(normalizedValue) ||
          Array.isArray(normalizedValue) && normalizedValue.length <= 16 &&
          normalizedValue.every((item) => typeof item === "string" && item.length <= 80)) ||
        !DESIGN_SNAPSHOT_ORIGINS.has(parameter.origin) ||
        !(parameter.sourceScopeKind === null ||
          DESIGN_SNAPSHOT_SCOPES.has(parameter.sourceScopeKind))) {
      throw new TypeError("Um parâmetro contextual da Unidade é inválido.");
    }
    return Object.freeze({ ...parameter, value: normalizedValue });
  });
  if (new Set(parameters.map(({ parameterId }) => parameterId)).size !== 4) {
    throw new TypeError("O desenho contextual repete ou omite parâmetros.");
  }
  const guidance = value.guidance.map((revision) => {
    exactRecord(
      revision,
      ["guidance", "origin", "sourceScopeKind"],
      "Uma orientação contextual da Unidade é inválida."
    );
    if (typeof revision.guidance !== "string" || revision.guidance.length > 16_384 ||
        containsControlCharacters(revision.guidance.replace(/[\n\r\t]/gu, "")) ||
        !DESIGN_SNAPSHOT_ORIGINS.has(revision.origin) ||
        !DESIGN_SNAPSHOT_SCOPES.has(revision.sourceScopeKind)) {
      throw new TypeError("Uma orientação contextual da Unidade é inválida.");
    }
    return Object.freeze({ ...revision });
  });
  exactRecord(
    value.componentPolicy,
    [
      "availability", "allowedCount", "excludedCount", "preferredCount",
      "origin", "sourceScopeKind"
    ],
    "A política contextual da Unidade é inválida."
  );
  const policy = value.componentPolicy;
  if (!new Set(["all", "allow_only"]).has(policy.availability) ||
      ![policy.allowedCount, policy.excludedCount, policy.preferredCount].every(
        (count) => Number.isSafeInteger(count) && count >= 0 && count <= 128
      ) || !DESIGN_SNAPSHOT_ORIGINS.has(policy.origin) ||
      !(policy.sourceScopeKind === null || DESIGN_SNAPSHOT_SCOPES.has(policy.sourceScopeKind))) {
    throw new TypeError("A política contextual da Unidade é inválida.");
  }
  return Object.freeze({
    parameters: Object.freeze(parameters),
    guidance: Object.freeze(guidance),
    componentPolicy: Object.freeze({ ...policy })
  });
}

function normalizeInspectionItem(value, totalCount) {
  exactRecord(
    value,
    [
      "studyUnit", "version", "updatedAt", "ordinal", "curriculumPath",
      "authoringPart", "authorship", "deepLink"
    ],
    "Um item de Conteúdo é inválido."
  );
  exactRecord(
    value.curriculumPath,
    ["module", "lesson", "didacticMicrosequence"],
    "O caminho curricular de uma Unidade de estudo é inválido."
  );
  const updatedAt = String(value.updatedAt || "");
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    throw new TypeError("A atualização de uma Unidade de estudo é inválida.");
  }
  const deepLink = String(value.deepLink || "").trim();
  if (!deepLink || deepLink.length > DEEP_LINK_MAX_LENGTH || containsControlCharacters(deepLink)) {
    throw new TypeError("O link de uma Unidade de estudo é inválido.");
  }
  return Object.freeze({
    studyUnit: normalizeStudyUnit(value.studyUnit),
    version: natural(value.version, "A versão da Unidade de estudo", { minimum: 1 }),
    updatedAt,
    ordinal: natural(value.ordinal, "A posição da Unidade de estudo no escopo", {
      minimum: 1,
      maximum: totalCount
    }),
    curriculumPath: Object.freeze({
      module: normalizePathNode(value.curriculumPath.module, "Módulo"),
      lesson: normalizePathNode(value.curriculumPath.lesson, "Lição"),
      didacticMicrosequence: normalizePathNode(
        value.curriculumPath.didacticMicrosequence,
        "Microssequência didática"
      )
    }),
    authoringPart: value.authoringPart == null ? null : normalizePart(value.authoringPart),
    authorship: normalizeAuthorship(value.authorship),
    deepLink
  });
}

function normalizeCursor(value, expected) {
  if (!expected) {
    if (value != null) throw new TypeError("O cursor de Conteúdo é inconsistente.");
    return null;
  }
  exactRecord(value, ["studyUnitId"], "O cursor de Conteúdo é inválido.");
  return Object.freeze({
    studyUnitId: canonicalId(value.studyUnitId, "A Unidade de estudo do cursor")
  });
}

export function normalizeCourseInspectionPage(value, {
  expectedCourseId = "",
  expectedRevision = null,
  expectedScope = null,
  expectedInspectionFocusId = null
} = {}) {
  const topLevelFields = [
    "contract", "courseId", "courseRevision", "scope", "totalCount", "scopeOptions", "items",
    "hasPrevious", "hasMore", "previousCursor", "nextCursor", "pageBytes",
    "inspectionFocus", "offline", "stale", "offlineKnown"
  ];
  exactRecord(value, topLevelFields, "A página de Conteúdo é inválida.");
  if (value.contract !== PAGE_CONTRACT || !Array.isArray(value.items) ||
      value.items.length > MAX_PAGE_SIZE || typeof value.hasPrevious !== "boolean" ||
      typeof value.hasMore !== "boolean") {
    throw new TypeError("A página de Conteúdo é inválida.");
  }
  const courseId = canonicalId(value.courseId, "A identidade do Curso", { uuid: true });
  const courseRevision = natural(value.courseRevision, "A revisão do Curso", { minimum: 1 });
  const totalCount = natural(value.totalCount, "A quantidade de Unidades de estudo");
  const scope = normalizeScope(value.scope);
  if ((expectedCourseId && courseId !== expectedCourseId) ||
      (expectedRevision !== null && courseRevision !== expectedRevision) ||
      (expectedScope && !sameScope(scope, expectedScope))) {
    const error = new Error("O Curso mudou durante a leitura de Conteúdo.");
    error.code = "course_revision_changed";
    throw error;
  }
  const items = value.items.map((item) => normalizeInspectionItem(item, totalCount));
  if (new Set(items.map(({ studyUnit }) => studyUnit.id)).size !== items.length ||
      items.some((item, index) => index > 0 && item.ordinal !== items[index - 1].ordinal + 1)) {
    throw new TypeError("A ordem da página de Conteúdo é inválida.");
  }
  let inspectionFocus = null;
  if (value.inspectionFocus != null) {
    exactRecord(value.inspectionFocus, [
      "id", "title", "deepLink", "requestedCount", "availableCount", "missingStudyUnitIds"
    ], "O foco de inspeção é inválido.");
    const id = canonicalId(value.inspectionFocus.id, "O foco de inspeção", { uuid: true });
    const requestedCount = natural(
      value.inspectionFocus.requestedCount,
      "A quantidade solicitada pelo foco",
      { minimum: 1, maximum: 64 }
    );
    const availableCount = natural(
      value.inspectionFocus.availableCount,
      "A quantidade disponível no foco",
      { maximum: requestedCount }
    );
    if (!Array.isArray(value.inspectionFocus.missingStudyUnitIds) ||
        value.inspectionFocus.missingStudyUnitIds.length !== requestedCount - availableCount) {
      throw new TypeError("O foco de inspeção é inválido.");
    }
    inspectionFocus = Object.freeze({
      id,
      title: requiredText(value.inspectionFocus.title, "O título do foco", 160),
      deepLink: requiredText(value.inspectionFocus.deepLink, "O link do foco", DEEP_LINK_MAX_LENGTH),
      requestedCount,
      availableCount,
      missingStudyUnitIds: Object.freeze(value.inspectionFocus.missingStudyUnitIds.map((studyUnitId) =>
        canonicalId(studyUnitId, "Uma Unidade ausente do foco")
      ))
    });
  }
  if ((expectedInspectionFocusId !== null) !== (inspectionFocus !== null) ||
      expectedInspectionFocusId !== null && inspectionFocus.id !== expectedInspectionFocusId) {
    throw new TypeError("O foco de inspeção não corresponde ao pedido.");
  }
  return Object.freeze({
    contract: PAGE_CONTRACT,
    courseId,
    courseRevision,
    scope,
    totalCount,
    scopeOptions: normalizeScopeOptions(value.scopeOptions),
    items: Object.freeze(items),
    hasPrevious: value.hasPrevious,
    hasMore: value.hasMore,
    previousCursor: normalizeCursor(value.previousCursor, value.hasPrevious),
    nextCursor: normalizeCursor(value.nextCursor, value.hasMore),
    pageBytes: natural(value.pageBytes, "O tamanho da página", { maximum: MAX_PAGE_BYTES }),
    inspectionFocus,
    offlineKnown: value.offline === true || value.stale === true || value.offlineKnown === true
  });
}

export function inspectionRequestFromTarget(target) {
  if (!target) return Object.freeze({ scope: Object.freeze({ kind: "course", id: null }), anchorStudyUnitId: null });
  if (target.kind === "inspection_focus") {
    return Object.freeze({
      scope: Object.freeze({ kind: "course", id: null }),
      anchorStudyUnitId: null,
      inspectionFocusId: canonicalId(target.id, "O foco de inspeção", { uuid: true })
    });
  }
  if (target.kind === "study_unit") {
    return Object.freeze({
      scope: Object.freeze({ kind: "course", id: null }),
      anchorStudyUnitId: target.id
    });
  }
  if (!SCOPE_KINDS.has(target.kind)) throw new TypeError("O alvo de Conteúdo é inválido.");
  return Object.freeze({
    scope: normalizeScope({ kind: target.kind, id: target.id }),
    anchorStudyUnitId: null
  });
}

function statusMessage(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code === "course_revision_changed") return "O Curso mudou durante a leitura.";
  if (["pt404", "p0002"].includes(code) || code.includes("not_found") ||
      Number(error?.status) === 404) return "Ponto não encontrado.";
  if (/offline|network|failed to fetch|connection/iu.test(`${code} ${error?.message || ""}`)) {
    return "Sem conexão para carregar este trecho.";
  }
  return "Não foi possível carregar este trecho de Conteúdo.";
}

function ambiguousObservationFailure(error) {
  const rawStatus = error?.status ?? error?.response?.status;
  const status = rawStatus == null || rawStatus === "" ? null : Number(rawStatus);
  const code = String(error?.code || error?.response?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  if (error?.ambiguous === true || error?.name === "AbortError" || error?.name === "TimeoutError") {
    return true;
  }
  if (status != null && Number.isFinite(status)) {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  if ([
    "40001", "access_revoked", "course_access_revoked", "course_not_found",
    "course_not_owned", "course_revision_changed", "forbidden",
    "invalid_course_command", "invalid_tool_argument", "pt404"
  ].includes(code) || code.startsWith("invalid_")) {
    return false;
  }
  return [
    "failed_to_fetch", "gateway_timeout", "network_error", "network_unavailable",
    "offline", "request_timeout", "service_unavailable"
  ].includes(code) ||
    /(?:failed to fetch|fetch failed|network|offline|load failed|connection|socket|timeout)/u
      .test(message) ||
    (status == null && !code);
}

function pendingObservationMatches(pending, draft) {
  return pending != null && JSON.stringify(pending.draft) === JSON.stringify(draft);
}

function scopeRouteOptions(scope) {
  if (scope.kind === "course") return {};
  if (scope.kind === "authoring_part") return { authoringPartId: scope.id };
  if (scope.kind === "unassigned") return { unassigned: true };
  if (scope.kind === "module") return { moduleId: scope.id };
  if (scope.kind === "lesson") return { lessonId: scope.id };
  if (scope.kind === "didactic_microsequence") return { didacticMicrosequenceId: scope.id };
  throw new TypeError("Escopo sem rota canônica.");
}

function routeForPath(courseId, kind, id) {
  const options = kind === "module" ? { moduleId: id } :
    kind === "lesson" ? { lessonId: id } :
      kind === "didactic_microsequence" ? { didacticMicrosequenceId: id } :
        { studyUnitId: id };
  return buildCourseAuthoringRoute(courseId, { section: "content", ...options });
}

function renderContextEditControl(state, kind, id) {
  if (!state.canEditContent) return "";
  const label = SEARCH_KIND_LABELS[kind] || "Conteúdo";
  return `<button type="button" data-inspection-edit-content="${escapeHtml(kind)}"` +
    ` data-inspection-control-key="edit:${escapeHtml(kind)}"` +
    ` data-target-id="${escapeHtml(id)}" aria-label="Editar ${escapeHtml(label)}"` +
    ` title="Editar ${escapeHtml(label)}">${renderUiIcon(
      "edit",
      "course-authoring-button-icon"
    )}</button>`;
}

function renderContext(state, item) {
  if (!item) {
    if (state.emptyScopeContext) {
      const context = state.emptyScopeContext;
      const kindLabel = SEARCH_KIND_LABELS[context.kind] || "Conteúdo";
      return '<div class="course-inspection-empty-context">' +
        '<span class="course-inspection-context-copy"><small>' +
        `${escapeHtml(kindLabel)}</small><strong>${escapeHtml(context.title)}</strong></span>` +
        renderContextEditControl(state, context.kind, context.id) + "</div>";
    }
    return '<span class="course-inspection-context-copy" data-inspection-context-summary>' +
      'Nenhuma Unidade de estudo</span>';
  }
  const path = item.curriculumPath;
  return '<details class="course-inspection-context-selector"><summary data-inspection-control-key="context"' +
    ` aria-label="Localização: ${escapeHtml(path.module.title)}, ${escapeHtml(path.lesson.title)}, ` +
    `${escapeHtml(path.didacticMicrosequence.title)}, Unidade ${item.ordinal}">` +
    '<span class="course-inspection-context-copy"><small data-inspection-context-parent>' +
    `${escapeHtml(path.module.title)} · ${escapeHtml(path.lesson.title)}</small>` +
    `<strong data-inspection-context-summary>${escapeHtml(path.didacticMicrosequence.title)}</strong>` +
    `<span data-inspection-context-position>${item.ordinal}/${state.totalCount}</span></span></summary>` +
    '<nav aria-label="Escopos do ponto atual">' +
    '<span class="course-inspection-context-level">' +
    `<a href="${escapeHtml(buildCourseAuthoringRoute(state.courseId, { section: "content" }))}"` +
    ' data-inspection-route data-inspection-context-course>Curso</a>' +
    renderContextEditControl(state, "course", state.courseId) + "</span>" +
    '<span class="course-inspection-context-level">' +
    `<a href="${escapeHtml(routeForPath(state.courseId, "module", path.module.id))}" data-inspection-route` +
    ` data-inspection-context-module>Módulo · ${escapeHtml(path.module.title)}</a>` +
    renderContextEditControl(state, "module", path.module.id) + "</span>" +
    '<span class="course-inspection-context-level">' +
    `<a href="${escapeHtml(routeForPath(state.courseId, "lesson", path.lesson.id))}" data-inspection-route` +
    ` data-inspection-context-lesson>Lição · ${escapeHtml(path.lesson.title)}</a>` +
    renderContextEditControl(state, "lesson", path.lesson.id) + "</span>" +
    '<span class="course-inspection-context-level">' +
    `<a href="${escapeHtml(routeForPath(state.courseId, "didactic_microsequence", path.didacticMicrosequence.id))}"` +
    ` data-inspection-route data-inspection-context-microsequence>Microssequência · ${escapeHtml(path.didacticMicrosequence.title)}</a>` +
    renderContextEditControl(state, "didactic_microsequence", path.didacticMicrosequence.id) +
    "</span>" +
    '<span class="course-inspection-context-level">' +
    `<a href="${escapeHtml(routeForPath(state.courseId, "study_unit", item.studyUnit.id))}" data-inspection-route` +
    ` data-inspection-context-study-unit>Unidade · ${escapeHtml(item.studyUnit.title)}</a>` +
    "</span></nav></details>";
}

function sameStudyUnit(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function renderManualTitle(item, state, editing, targetId) {
  const title = escapeHtml(item.studyUnit.title);
  if (!editing) {
    return `<h3 id="inspection-study-unit-${escapeHtml(item.studyUnit.id)}">${title}</h3>`;
  }
  if (targetId !== "study_unit") {
    return `<button class="course-inspection-title-edit-target" type="button"` +
      ` data-inspection-manual-target="study_unit" data-study-unit-id="${escapeHtml(item.studyUnit.id)}"` +
      ` aria-label="Editar título de ${title}" title="Editar título">${title}</button>`;
  }
  const draftTitle = Object.hasOwn(state.manualDraft.pathValues, "title")
    ? state.manualDraft.pathValues.title
    : item.studyUnit.title;
  return `<h3 id="inspection-study-unit-${escapeHtml(item.studyUnit.id)}"` +
    ' class="course-inspection-manual-title" contenteditable="plaintext-only" role="textbox"' +
    ' aria-multiline="false" spellcheck="true" data-inspection-manual-title' +
    ` data-inspection-control-key="manual-title:${escapeHtml(item.studyUnit.id)}"` +
    ` aria-label="Título da Unidade de estudo" title="Editar título">${escapeHtml(draftTitle)}</h3>`;
}

function renderManualModeActions(item, state, editing) {
  const id = escapeHtml(item.studyUnit.id);
  const designRoute = buildCourseAuthoringRoute(state.courseId, {
    section: "parameters",
    didacticMicrosequenceId: item.curriculumPath.didacticMicrosequence.id
  });
  const canUndo = state.manualUndo.at(-1)?.studyUnitId === item.studyUnit.id && !state.manualSaving;
  const canRedo = state.manualRedo.at(-1)?.studyUnitId === item.studyUnit.id && !state.manualSaving;
  return '<nav class="course-inspection-mode-actions" role="group" aria-label="Ações da Unidade de estudo">' +
    `<button type="button" data-inspection-unit-mode="view" data-study-unit-id="${id}"` +
    ` aria-pressed="${editing ? "false" : "true"}" aria-label="Visualizar" title="Visualizar"` +
    `${state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon("preview", "course-authoring-button-icon")}</button>` +
    (state.canAccessDesign
      ? `<a href="${escapeHtml(designRoute)}" data-inspection-route` +
        ` data-inspection-control-key="design:${id}" aria-label="Parâmetros aplicáveis a ${escapeHtml(
          item.studyUnit.title
        )}" title="Parâmetros da Microssequência">` +
        `${renderUiIcon("tags", "course-authoring-button-icon")}</a>`
      : "") +
    (state.canEditManually
      ? `<button type="button" data-inspection-unit-mode="edit" data-study-unit-id="${id}"` +
        ` aria-pressed="${editing ? "true" : "false"}" aria-label="Editar" title="Editar"` +
        `${state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
        `${renderUiIcon("edit", "course-authoring-button-icon")}</button>`
      : "") +
    (state.canUseProviderAssistance
      ? `<button type="button" data-inspection-provider-assistance data-study-unit-id="${id}"` +
        ` aria-pressed="${state.assistanceActiveStudyUnitId === item.studyUnit.id}"` +
        ' aria-label="Assistência por IA" title="Assistência por IA"' +
        `${state.manualSaving || state.assistanceSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
        `${renderUiIcon("sparkles", "course-authoring-button-icon")}</button>`
      : "") +
    (state.canEditManually && canUndo
      ? `<button type="button" data-inspection-manual-history="undo" data-study-unit-id="${id}"` +
        ' aria-label="Desfazer última edição" title="Desfazer">' +
        `${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button>`
      : "") +
    (state.canEditManually && canRedo
      ? `<button type="button" data-inspection-manual-history="redo" data-study-unit-id="${id}"` +
        ' aria-label="Refazer edição" title="Refazer">' +
        `${renderUiIcon("arrow-right", "course-authoring-button-icon")}</button>`
      : "") +
    "</nav>";
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function curriculumSearchTitle(value, kind, fallbackPosition = 0) {
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  if (title) return title;
  const label = SEARCH_KIND_LABELS[kind] || "Item";
  const position = Number.isSafeInteger(Number(fallbackPosition))
    ? Number(fallbackPosition)
    : 0;
  return `${label} ${position + 1}`;
}

function compactTextExcerpt(value, maximum = COMPACT_PREVIEW_MAX_CHARACTERS) {
  const normalized = String(value || "").trim().replace(/\s+/gu, " ");
  const characters = [...normalized];
  if (characters.length <= maximum) return normalized;
  const available = characters.slice(0, Math.max(1, maximum - 1)).join("");
  const boundary = available.replace(/\s+\S*$/u, "").trimEnd();
  return `${boundary || available.trimEnd()}…`;
}

function previewPackageLabels(studyUnit) {
  const instances = [
    ...(Array.isArray(studyUnit?.content) ? studyUnit.content : []),
    ...(studyUnit?.response ? [studyUnit.response] : [])
  ];
  return [...new Set(instances.map((instance) =>
    RESOURCE_PACKAGE_REGISTRY.get(instance?.package, instance?.version)?.manifest?.label || ""
  ).filter(Boolean))];
}

export function projectCourseInspectionStudyUnitPreview(studyUnit) {
  const contentCount = Array.isArray(studyUnit?.content) ? studyUnit.content.length : 0;
  const packageLabels = previewPackageLabels(studyUnit);
  const visiblePackageLabels = packageLabels.slice(0, 2);
  const remainingPackageCount = Math.max(0, packageLabels.length - visiblePackageLabels.length);
  return Object.freeze({
    title: String(studyUnit?.title || "Unidade de estudo"),
    metadata: Object.freeze([
      studyUnit?.role === "practice" ? "Prática" : "Teoria",
      `${contentCount} ${contentCount === 1 ? "recurso" : "recursos"}`,
      ...visiblePackageLabels,
      ...(remainingPackageCount ? [`+${remainingPackageCount} tipo${remainingPackageCount === 1 ? "" : "s"}`] : [])
    ]),
    excerpt: compactTextExcerpt(readPackageStudyUnitText(studyUnit))
  });
}

const SEARCH_CONTENT_METADATA_KEYS = new Set([
  "id", "package", "version", "ref", "languageTag", "textDirection", "kind", "type"
]);

function searchContentSegments(value, key = "", depth = 0, segments = []) {
  if (depth > 12 || segments.length >= 96 || value === null || value === undefined) return segments;
  if (typeof value === "string") {
    const text = value.trim().replace(/\s+/gu, " ");
    if (text && !SEARCH_CONTENT_METADATA_KEYS.has(key)) segments.push(text);
    return segments;
  }
  if (Array.isArray(value)) {
    for (const item of value) searchContentSegments(item, key, depth + 1, segments);
    return segments;
  }
  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (!SEARCH_CONTENT_METADATA_KEYS.has(childKey)) {
        searchContentSegments(childValue, childKey, depth + 1, segments);
      }
    }
  }
  return segments;
}

function contentSearchExcerpt(segments, normalizedQuery) {
  const segment = segments.find((value) => normalizeSearchText(value).includes(normalizedQuery));
  if (!segment) return "";
  if ([...segment].length <= COMPACT_PREVIEW_MAX_CHARACTERS) return segment;
  const words = segment.split(/\s+/u);
  const matchingWord = words.findIndex((word) => normalizeSearchText(word).includes(normalizedQuery));
  const start = Math.max(0, matchingWord - 8);
  const excerpt = words.slice(start, start + 22).join(" ");
  return compactTextExcerpt(
    `${start > 0 ? "…" : ""}${excerpt}${start + 22 < words.length ? "…" : ""}`
  );
}

function courseSearchEntry({
  kind,
  id,
  title,
  path,
  entityPath,
  order,
  ordinal = null,
  contentSegments = []
}) {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedPath = normalizeSearchText(path.join(" · "));
  const safeContentSegments = contentSegments.filter((value) => typeof value === "string" && value.trim());
  return Object.freeze({
    key: `${kind}:${id}`,
    kind,
    id,
    title,
    path: Object.freeze([...path]),
    entityPath: Object.freeze([...entityPath]),
    order,
    ordinal,
    normalizedTitle,
    normalizedPath,
    contentSegments: Object.freeze(safeContentSegments),
    normalizedContent: normalizeSearchText(safeContentSegments.join(" "))
  });
}

export function buildCourseInspectionSearchIndex(project, courseId, {
  courseTitle = ""
} = {}) {
  const course = (Array.isArray(project?.courses) ? project.courses : [])
    .find((candidate) => candidate?.id === courseId || candidate?.courseId === courseId);
  if (!course) throw new TypeError("O Curso do índice de Conteúdo não está disponível.");
  const entries = [];
  let order = 0;
  let ordinal = 0;
  const resolvedCourseTitle = curriculumSearchTitle(
    { title: course.title || courseTitle },
    "course",
    0
  );
  entries.push(courseSearchEntry({
    kind: "course",
    id: courseId,
    title: resolvedCourseTitle,
    path: [resolvedCourseTitle],
    entityPath: [courseId],
    order: order++
  }));
  for (const moduleValue of Array.isArray(course.modules) ? course.modules : []) {
    const moduleTitle = curriculumSearchTitle(moduleValue, "module", moduleValue.position);
    entries.push(courseSearchEntry({
      kind: "module",
      id: moduleValue.id,
      title: moduleTitle,
      path: [resolvedCourseTitle, moduleTitle],
      entityPath: [courseId, moduleValue.id],
      order: order++
    }));
    for (const lesson of Array.isArray(moduleValue.lessons) ? moduleValue.lessons : []) {
      const lessonTitle = curriculumSearchTitle(lesson, "lesson", lesson.position);
      entries.push(courseSearchEntry({
        kind: "lesson",
        id: lesson.id,
        title: lessonTitle,
        path: [resolvedCourseTitle, moduleTitle, lessonTitle],
        entityPath: [courseId, moduleValue.id, lesson.id],
        order: order++
      }));
      for (const microsequence of Array.isArray(lesson.microsequences)
        ? lesson.microsequences
        : []) {
        const microsequenceTitle = curriculumSearchTitle(
          microsequence,
          "didactic_microsequence",
          microsequence.position
        );
        entries.push(courseSearchEntry({
          kind: "didactic_microsequence",
          id: microsequence.id,
          title: microsequenceTitle,
          path: [resolvedCourseTitle, moduleTitle, lessonTitle, microsequenceTitle],
          entityPath: [courseId, moduleValue.id, lesson.id, microsequence.id],
          order: order++
        }));
        for (const unit of Array.isArray(microsequence.studyUnits)
          ? microsequence.studyUnits
          : []) {
          ordinal += 1;
          const unitTitle = curriculumSearchTitle(unit, "study_unit", unit.position);
          entries.push(courseSearchEntry({
            kind: "study_unit",
            id: unit.id,
            title: unitTitle,
            path: [
              resolvedCourseTitle,
              moduleTitle,
              lessonTitle,
              microsequenceTitle,
              unitTitle
            ],
            entityPath: [
              courseId,
              moduleValue.id,
              lesson.id,
              microsequence.id,
              unit.id
            ],
            order: order++,
            ordinal,
            contentSegments: searchContentSegments([
              unit.content,
              unit.response,
              unit.feedback
            ])
          }));
        }
      }
    }
  }
  return Object.freeze(entries);
}

export function searchCourseInspectionIndex(index, query, limit = SEARCH_RESULT_LIMIT) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || !Array.isArray(index)) return Object.freeze([]);
  const numericMatch = /^(?:unidade )?(\d+)$/u.exec(normalizedQuery);
  const requestedOrdinal = numericMatch ? Number(numericMatch[1]) : null;
  const matches = [];
  for (const entry of index) {
    let rank = Number.POSITIVE_INFINITY;
    if (entry.kind === "study_unit" && requestedOrdinal === entry.ordinal) rank = -1;
    else if (entry.normalizedTitle === normalizedQuery) rank = 0;
    else if (entry.normalizedTitle.startsWith(normalizedQuery)) rank = 1;
    else if (entry.normalizedTitle.includes(normalizedQuery)) rank = 2;
    else if (entry.normalizedPath.includes(normalizedQuery)) rank = 3;
    else if (entry.kind === "study_unit" && entry.normalizedContent.includes(normalizedQuery)) rank = 4;
    if (Number.isFinite(rank)) {
      matches.push({
        entry,
        rank,
        matchExcerpt: rank === 4
          ? contentSearchExcerpt(entry.contentSegments, normalizedQuery)
          : ""
      });
    }
  }
  matches.sort((left, right) => left.rank - right.rank ||
    left.entry.order - right.entry.order);
  return Object.freeze(matches.slice(0, Math.max(1, limit)).map(({ entry, matchExcerpt }) =>
    Object.freeze({ ...entry, matchExcerpt })));
}

function renderStudyUnitContextActions(item, state, observationCount) {
  const studyUnitId = escapeHtml(item.studyUnit.id);
  const part = item.authoringPart;
  return `<nav class="course-inspection-item-menu" aria-label="Mais ações para ${escapeHtml(item.studyUnit.title)}">` +
    `<button type="button" data-inspection-copy-link data-deep-link="${escapeHtml(item.deepLink)}"` +
    ` data-inspection-control-key="copy:${studyUnitId}">` +
    `${renderUiIcon("copy", "course-authoring-button-icon")}<span>Copiar link</span></button>` +
    `<button type="button" data-inspection-observations data-study-unit-id="${studyUnitId}"` +
    ` data-inspection-control-key="observations:${studyUnitId}">` +
    `${renderUiIcon("prompt", "course-authoring-button-icon")}<span>Observações${
      Number(observationCount) > 0 ? ` · ${Number(observationCount)}` : ""
    }</span></button>` +
    (part && item.authorship.production
      ? `<a href="${escapeHtml(buildCourseAuthoringRoute(state.courseId, {
          section: "planning",
          authoringPartId: part.id,
          materializationId: item.authorship.production.materializationId
        }))}" data-inspection-route data-inspection-control-key="production:${studyUnitId}">` +
        `${renderUiIcon("progress", "course-authoring-button-icon")}<span>Produção</span></a>`
      : "") +
    (state.canEditSources
      ? `<button type="button" data-inspection-edit-sources data-study-unit-id="${studyUnitId}"` +
        ` data-inspection-control-key="sources:${studyUnitId}">` +
        `${renderUiIcon("study", "course-authoring-button-icon")}<span>Fontes</span></button>`
      : "") +
    `<a href="${escapeHtml(buildCourseAuthoringRoute(state.courseId, {
      section: "review",
      studyUnitId: item.studyUnit.id
    }))}" data-inspection-route data-inspection-control-key="audit:${studyUnitId}">` +
    `${renderUiIcon("review", "course-authoring-button-icon")}<span>Auditoria</span></a></nav>`;
}

function renderAssistanceDraftDock(item, state) {
  if (state.assistanceDraft?.studyUnitId !== item.studyUnit.id) return "";
  return '<footer class="course-inspection-manual-dock" aria-label="Rascunho da Assistência por IA">' +
    `<p><strong>${escapeHtml(state.assistanceDraft.summary || "Proposta preparada")}</strong></p>` +
    (state.assistanceError
      ? `<p class="course-inspection-manual-error" role="alert">${escapeHtml(state.assistanceError)}</p>`
      : "") +
    '<div><button type="button" data-inspection-assistance-action="discard"' +
    ` aria-label="Descartar proposta" title="Descartar proposta"${state.assistanceSaving ? " disabled" : ""}>` +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` +
    '<button type="button" data-inspection-assistance-action="save"' +
    ` aria-label="Salvar proposta" title="Salvar proposta"${state.assistanceSaving ? " disabled" : ""}>` +
    `${renderUiIcon(state.assistanceSaving ? "rotate" : "save", "course-authoring-button-icon")}` +
    '<span>Salvar</span></button></div></footer>';
}

function renderManualEditDock(item, state, editing, resourceTargetIds) {
  if (!editing) return "";
  const hasTarget = state.manualTargetId === "study_unit" ||
    resourceTargetIds.includes(state.manualTargetId);
  if (state.manualDiscardArmed) {
    return '<footer class="course-inspection-manual-dock" aria-label="Resultado incerto da edição">' +
      `<p class="course-inspection-manual-error" role="alert">${escapeHtml(state.manualError)}</p>` +
      '<div>' +
      '<button type="button" data-inspection-manual-action="keep-unknown"' +
      ' aria-label="Manter rascunho" title="Manter rascunho">' +
      `${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button>` +
      '<button type="button" data-inspection-manual-action="discard-unknown"' +
      ' aria-label="Descartar rascunho com resultado incerto" title="Descartar rascunho">' +
      `${renderUiIcon("remove-state", "course-authoring-button-icon")}<span>Descartar</span></button>` +
      '</div></footer>';
  }
  return '<footer class="course-inspection-manual-dock" aria-label="Edição manual">' +
    `<p>${hasTarget ? "Edite diretamente no conteúdo." : "Toque no título ou em um conteúdo."}</p>` +
    (state.manualError
      ? `<p class="course-inspection-manual-error" role="alert">${escapeHtml(state.manualError)}</p>`
      : "") +
    '<div>' +
    `<button type="button" data-inspection-manual-action="cancel" aria-label="Cancelar edição" title="Cancelar"` +
    `${state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` +
    `<button type="button" data-inspection-manual-action="save" aria-label="Salvar edição" title="Salvar"` +
    `${!hasTarget || state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon(state.manualSaving ? "rotate" : "save", "course-authoring-button-icon")}</button>` +
    "</div></footer>";
}

function renderStudyUnitPreview(item, {
  expanded,
  forced,
  runtime
}) {
  const id = escapeHtml(item.studyUnit.id);
  const descriptionId = `inspection-preview-description-${id}`;
  const preview = projectCourseInspectionStudyUnitPreview(item.studyUnit);
  const actionLabel = forced ? "Conteúdo integral em uso" : expanded ? "Recolher" : "Abrir";
  const accessibleAction = forced
    ? `Conteúdo integral de ${preview.title} em uso`
    : `${expanded ? "Recolher" : "Abrir"} conteúdo integral de ${preview.title}`;
  const metadata = preview.metadata.map((value) =>
    `<span>${escapeHtml(value)}</span>`
  ).join("");
  return `<details class="course-inspection-preview" data-inspection-preview="${id}"` +
    `${expanded ? " open" : ""}${forced ? ' data-inspection-preview-forced="true"' : ""}>` +
    `<summary data-inspection-preview-toggle="${id}" data-inspection-control-key="preview:${id}"` +
    ` aria-label="${escapeHtml(accessibleAction)}" aria-describedby="${descriptionId}"` +
    `${forced ? ' aria-disabled="true"' : ""}>` +
    `<span class="course-inspection-preview-icon">${renderUiIcon(
      "preview",
      "course-authoring-button-icon"
    )}</span>` +
    `<span class="course-inspection-preview-copy" id="${descriptionId}">` +
    `<span class="course-inspection-preview-metadata">${metadata}</span>` +
    `<span class="course-inspection-preview-excerpt">${escapeHtml(preview.excerpt)}</span></span>` +
    `<span class="course-inspection-preview-action">${escapeHtml(actionLabel)}</span></summary>` +
    (expanded
      ? (runtime.dockHtml
          ? '<p class="course-inspection-response-notice">Prática exibida com as respostas esperadas.</p>'
          : "") +
        '<div class="runtime-card-rendered-content course-inspection-runtime">' +
        `<div class="card-sheet-content">${runtime.bodyHtml}</div>${runtime.dockHtml}</div>`
      : "") +
    "</details>";
}

function renderStudyUnit(
  item,
  totalCount,
  state,
  observationCount = null
) {
  const path = item.curriculumPath;
  const editing = state.manualStudyUnitId === item.studyUnit.id;
  const resourceTargetIds = listManualStudyUnitTargetIds(item.studyUnit);
  const selectedResourceTargetIds = resourceTargetIds.includes(state.manualTargetId)
    ? [state.manualTargetId]
    : [];
  const assistanceActive = state.assistanceActiveStudyUnitId === item.studyUnit.id ||
    state.assistanceDraft?.studyUnitId === item.studyUnit.id;
  const previewForced = editing || assistanceActive;
  const previewExpanded = previewForced || state.expandedStudyUnitIds.has(item.studyUnit.id);
  const runtime = previewExpanded
    ? renderPackageStudyUnitBlocksWithDock(item.studyUnit, {
        omitRepeatedHeading: true,
        blockKeyPrefix: `inspection:${item.studyUnit.id}`,
        resourceSelectionEnabled: editing,
        resourceSelectionDisabled: state.manualSaving,
        resourceSelectionTargetIds: resourceTargetIds,
        selectedResourceTargetIds,
        revealPracticeAnswers: !editing,
        manualEditingTargetId: editing && selectedResourceTargetIds.length
          ? state.manualTargetId
          : ""
      })
    : { bodyHtml: "", dockHtml: "" };
  const selected = state.selectedStudyUnitId === item.studyUnit.id;
  return `<li class="course-inspection-item${selected ? " is-selected" : ""}" data-inspection-study-unit="${escapeHtml(item.studyUnit.id)}"` +
    ` data-inspection-ordinal="${item.ordinal}" aria-posinset="${item.ordinal}" aria-setsize="${totalCount}">` +
    `<article aria-labelledby="inspection-study-unit-${escapeHtml(item.studyUnit.id)}"` +
    `${selected ? ' aria-current="true"' : ""}>` +
    '<header class="course-inspection-item-heading"><div>' +
    `<p>${escapeHtml(path.didacticMicrosequence.title)} · Unidade ${item.ordinal} de ${totalCount}</p>` +
    `${renderManualTitle(item, state, editing, state.manualTargetId)}</div>` +
    `<details class="course-inspection-item-details"><summary aria-label="Abrir detalhes de ${escapeHtml(item.studyUnit.title)}"` +
    ` title="Abrir detalhes" data-inspection-control-key="details:${escapeHtml(item.studyUnit.id)}">` +
    `${renderUiIcon("more", "course-authoring-button-icon")}</summary>` +
    '<div class="course-inspection-item-detail-panel"><dl>' +
    `<div><dt>Módulo</dt><dd>${escapeHtml(path.module.title)}</dd></div>` +
    `<div><dt>Lição</dt><dd>${escapeHtml(path.lesson.title)}</dd></div>` +
    `<div><dt>Microssequência</dt><dd>${escapeHtml(path.didacticMicrosequence.title)}</dd></div>` +
    `<div><dt>Versão</dt><dd>${item.version}</dd></div></dl>` +
    renderStudyUnitContextActions(item, state, observationCount) +
    "</div></details></header>" +
    '<div class="course-inspection-item-actions" aria-label="Ações contextuais">' +
    renderManualModeActions(item, state, editing) +
    "</div>" +
    renderAuthorshipState(item, observationCount) +
    renderDesignComparison(item) +
    renderStudyUnitPreview(item, {
      expanded: previewExpanded,
      forced: previewForced,
      runtime
    }) +
    renderManualEditDock(item, state, editing, resourceTargetIds) +
    renderAssistanceDraftDock(item, state) +
    `<footer><small>Unidade ${item.ordinal}</small></footer></article></li>`;
}

function renderAuthorshipState(item, observationCount = null) {
  const production = item.authorship.production;
  const design = item.authorship.design;
  const states = [];
  const pendingObservations = observationCount ?? item.authorship.pendingObservationCount;
  if (pendingObservations > 0) {
    states.push({
      kind: "observations",
      icon: "prompt",
      label: `${pendingObservations} ${pendingObservations === 1
        ? "observação pendente"
        : "observações pendentes"}`
    });
  }
  if (production) {
    if (production.state === "produced" && production.currentMaterialization) {
      states.push({
        kind: "materialization",
        icon: "review",
        label: "Materialização atual — revisar"
      });
    } else if (production.state === "changed") {
      states.push({
        kind: "changed",
        icon: "review",
        label: "Alteração após a materialização — revisar"
      });
    }
  }
  if (design?.state === "changed") {
    states.push({
      kind: "design",
      icon: "edit",
      label: "Desenho vigente diferente — revisar"
    });
  }
  if (design?.state === "verified") {
    states.push({
      kind: "verified",
      icon: "ready-state",
      label: "Reparo verificado no desenho vigente"
    });
  }
  return states.length
    ? `<p class="course-inspection-authorship" aria-label="Estado da revisão">${states.map((state) =>
        `<span data-inspection-review-state="${escapeHtml(state.kind)}"` +
        ` aria-label="${escapeHtml(state.label)}" title="${escapeHtml(state.label)}">` +
        `${renderUiIcon(state.icon, "course-authoring-button-icon")}</span>`).join("")}</p>`
    : "";
}

function designOriginLabel(origin) {
  return ({
    automatic: "Automático",
    author: "Autoria",
    research_condition: "Condição de pesquisa",
    migration: "Decisão preservada",
    system_default: "Padrão do produto"
  })[origin] || "Origem preservada";
}

function designScopeLabel(kind) {
  return ({
    course: "Curso",
    module: "Módulo",
    lesson: "Lição",
    didactic_microsequence: "Microssequência"
  })[kind] || "Padrão geral";
}

function designValueLabel(value) {
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => DESIGN_VALUE_LABELS[item] || item).join("; ")
      : "Nenhum";
  }
  return String(value);
}

function renderDesignSnapshot(snapshot, title) {
  const parameters = snapshot.parameters.map((parameter) =>
    `<li><strong>${escapeHtml(DESIGN_PARAMETER_LABELS[parameter.parameterId])}</strong>` +
    `<span>${escapeHtml(designValueLabel(parameter.value))}</span>` +
    `<small>${escapeHtml(designOriginLabel(parameter.origin))} · ${escapeHtml(
      designScopeLabel(parameter.sourceScopeKind)
    )}</small></li>`).join("");
  const guidance = snapshot.guidance.length
    ? snapshot.guidance.map((revision) =>
      `<blockquote><p>${escapeHtml(revision.guidance)}</p><footer>${escapeHtml(
        designOriginLabel(revision.origin)
      )} · ${escapeHtml(designScopeLabel(revision.sourceScopeKind))}</footer></blockquote>`
    ).join("")
    : "<p>Nenhuma direção editorial adicional.</p>";
  const policy = snapshot.componentPolicy;
  const availability = policy.availability === "all"
    ? "Todos os componentes instalados"
    : `${policy.allowedCount} componentes permitidos`;
  return `<section><h4>${escapeHtml(title)}</h4><ul>${parameters}</ul>` +
    `<div><strong>Direção editorial</strong>${guidance}</div>` +
    `<p><strong>Política de componentes</strong><span>${escapeHtml(availability)}; ` +
    `${policy.excludedCount} excluídos; ${policy.preferredCount} preferidos.</span>` +
    `<small>${escapeHtml(designOriginLabel(policy.origin))} · ${escapeHtml(
      designScopeLabel(policy.sourceScopeKind)
    )}</small></p></section>`;
}

function renderDesignComparison(item) {
  const design = item.authorship.design;
  if (!design) return "";
  return '<details class="course-inspection-design-comparison">' +
    '<summary>Configuração usada nesta versão × vigente agora</summary>' +
    `<p>${design.state === "current"
      ? "O desenho relevante permanece igual ao usado na produção."
      : design.state === "verified"
        ? "A Unidade foi verificada novamente diante do desenho vigente."
        : "O conteúdo produzido ainda precisa ser confrontado com o desenho vigente."}</p>` +
    '<div class="course-inspection-design-comparison-grid">' +
    renderDesignSnapshot(design.used, "Usado nesta versão") +
    renderDesignSnapshot(design.current, "Vigente agora") +
    "</div></details>";
}

function renderBoundaryButton(direction, state) {
  const previous = direction === "backward";
  const available = previous ? state.hasPrevious : state.hasMore;
  if (!available) return "";
  const loading = state.loadingDirection === direction;
  const failure = previous ? state.previousFailure : state.nextFailure;
  return `<li class="course-inspection-boundary is-${direction}">` +
    (failure ? `<p role="alert">${escapeHtml(failure)}</p>` : "") +
    `<button type="button" data-inspection-load="${direction}"${loading ? " disabled" : ""}` +
    ` data-inspection-control-key="load:${direction}">${renderUiIcon(
      loading ? "rotate" : previous ? "arrow-up" : "arrow-down",
      "course-authoring-button-icon"
    )}<span>${loading ? "Carregando…" : failure ? "Tentar novamente" :
      previous ? "Carregar anteriores" : "Carregar próximas"}</span></button></li>`;
}

function renderInspectionConfirmation(state) {
  if (!state.confirmation) return "";
  return '<div class="course-authoring-confirm-backdrop" data-inspection-confirmation-backdrop>' +
    '<section class="course-authoring-confirm-dialog" data-inspection-confirmation role="alertdialog"' +
    ' aria-modal="true" aria-labelledby="course-inspection-confirmation-title"' +
    ' aria-describedby="course-inspection-confirmation-message">' +
    '<h2 id="course-inspection-confirmation-title">Retirar observação?</h2>' +
    '<p id="course-inspection-confirmation-message">Ela permanecerá no histórico como retirada.</p>' +
    '<div class="course-authoring-confirm-actions">' +
    '<button type="button" class="course-authoring-secondary" data-observation-action="cancel-confirmation">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}<span>Cancelar</span></button>` +
    '<button type="button" class="is-danger" data-observation-action="confirm-withdraw">' +
    `${renderUiIcon("trash", "course-authoring-button-icon")}<span>Retirar</span></button>` +
    "</div></section></div>";
}

function renderInspectionObservationSheet(state) {
  if (!state.observationSheetOpen || !state.observationStudyUnitId) return "";
  const sheet = renderStudyUnitObservationSheet({
    items: state.observationItems,
    draft: state.observationDraft,
    editingId: state.observationEditingId,
    error: state.observationError,
    saving: state.observationSaving,
    loading: state.observationLoading,
    title: "Observações da Unidade",
    listLabel: "Observações deste contexto",
    emptyLabel: "Nenhuma observação neste contexto.",
    showContributor: true,
    collectionSummary: state.observationCollectionSummary,
    canonicalHref: buildCourseAuthoringRoute(state.courseId, { section: "review" }),
    showComposer: true
  });
  const confirmation = renderInspectionConfirmation(state);
  if (!confirmation) return sheet;
  const inactiveSheet = sheet.replace(
    '<section class="editor-overlay study-observation-overlay"',
    '<section class="editor-overlay study-observation-overlay" inert aria-hidden="true"'
  );
  return `${inactiveSheet}${confirmation}`;
}

function renderInspectionSearchResults(state) {
  if (!state.searchOpen) {
    return '<ul id="course-inspection-search-results" class="course-inspection-search-results"' +
      ' role="listbox" aria-label="Pontos do Curso" hidden></ul>';
  }
  let content;
  if (state.searchLoading) {
    content = '<li class="course-inspection-search-state" role="status">Buscando…</li>';
  } else if (state.searchError) {
    content = `<li class="course-inspection-search-state is-error" role="alert">${escapeHtml(
      state.searchError
    )}</li>`;
  } else if (state.searchResults.length === 0) {
    content = '<li class="course-inspection-search-state" role="status">Nenhum resultado</li>';
  } else {
    content = state.searchResults.map((result, index) => {
      const path = result.path.slice(0, -1).join(" · ");
      return `<li id="course-inspection-search-option-${index}" role="option"` +
        ` aria-selected="${index === state.searchActiveIndex}"` +
        ` data-inspection-search-option="${escapeHtml(result.key)}">` +
        `<strong>${escapeHtml(result.title)}</strong>` +
        `<small>${escapeHtml(SEARCH_KIND_LABELS[result.kind])}${path
          ? ` · ${escapeHtml(path)}`
          : ""}</small>` +
        (result.matchExcerpt
          ? `<span class="course-inspection-search-excerpt">${escapeHtml(result.matchExcerpt)}</span>`
          : "") + "</li>";
    }).join("");
  }
  return `<ul id="course-inspection-search-results" class="course-inspection-search-results"` +
    ` role="listbox" aria-label="Pontos do Curso">${content}</ul>`;
}

function renderInspectionSearch(state) {
  const activeDescendant = state.searchOpen && state.searchActiveIndex >= 0 &&
    state.searchResults[state.searchActiveIndex]
    ? ` aria-activedescendant="course-inspection-search-option-${state.searchActiveIndex}"`
    : "";
  return '<div class="course-inspection-search" data-inspection-search>' +
    '<label for="course-inspection-search-input" aria-label="Ir para">' +
    `${renderUiIcon("search", "course-authoring-button-icon")}</label>` +
    `<input id="course-inspection-search-input" type="search" role="combobox"` +
    ' data-inspection-search-input data-inspection-control-key="search"' +
    ' aria-label="Ir para" aria-autocomplete="list" aria-controls="course-inspection-search-results"' +
    ` aria-expanded="${state.searchOpen}" autocomplete="off" placeholder="Ir para"` +
    `${activeDescendant} value="${escapeHtml(state.searchQuery)}">` +
    '<div class="course-inspection-search-results-host">' +
    renderInspectionSearchResults(state) + "</div></div>";
}

function renderInspectionSyncState(state) {
  const offline = state.offlineKnown;
  const updating = !offline && state.stale;
  const label = offline
    ? "Sem sincronização com a nuvem"
    : updating
      ? "Atualizando conteúdo"
    : "Sincronização com a nuvem disponível";
  return `<span class="course-inspection-sync-state${offline
    ? " is-offline"
    : updating ? " is-updating" : ""}"` +
    ` role="status" aria-label="${label}" title="${label}">` +
    `${renderUiIcon(
      offline ? "offline" : updating ? "rotate" : "cloud",
      "course-authoring-button-icon"
    )}</span>`;
}

function renderInspectionFocus(state, active) {
  const focus = state.inspectionFocus;
  if (!focus) return "";
  const available = focus.availableCount;
  const missing = focus.requestedCount - available;
  const route = buildCourseAuthoringRoute(state.courseId, {
    section: "content",
    ...(active ? { studyUnitId: active.studyUnit.id } : {})
  });
  return '<section class="course-inspection-focus" aria-label="Filtro de inspeção ativo">' +
    '<div><small>Foco de inspeção</small>' +
    `<strong>${escapeHtml(focus.title)}</strong>` +
    `<span>${available} ${available === 1 ? "Unidade" : "Unidades"}${missing
      ? ` · ${missing} ${missing === 1 ? "indisponível" : "indisponíveis"}`
      : ""}</span></div>` +
    `<a href="${escapeHtml(route)}" data-inspection-route data-inspection-exit-focus` +
    ' aria-label="Remover o filtro e ver o Curso">' +
    `${renderUiIcon("preview", "course-authoring-button-icon")}<span>Ver no Curso</span></a></section>`;
}

function renderSequence(state) {
  const active = state.items.find(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId) ||
    state.items[0] || null;
  const beforeCount = state.items.length ? Math.max(0, state.items[0].ordinal - 1) : 0;
  const afterCount = state.items.length
    ? Math.max(0, state.totalCount - state.items[state.items.length - 1].ordinal)
    : 0;
  const notice = state.initialFailure && state.items.length > 0
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.initialFailure)}</p>`
      : state.hydrationFailure
          ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.hydrationFailure)}</p>`
          : "";
  let body;
  if (state.initialLoading && state.items.length === 0) {
    body = '<p class="course-authoring-loading" role="status">Carregando Unidades…</p>';
  } else if (state.targetMissing) {
    body = '<section class="course-authoring-state is-error" role="alert">' +
      `${renderUiIcon("remove-state", "course-authoring-state-icon")}<h3>Ponto não encontrado</h3>` +
      '<p>Esta Unidade não pertence mais à sequência corrente de Conteúdo.</p>' +
      '<button type="button" data-inspection-action="start" aria-label="Ir ao início da sequência"' +
      ` title="Ir ao início da sequência">${renderUiIcon(
        "arrow-left",
        "course-authoring-button-icon"
      )}</button></section>`;
  } else if (state.initialFailure && state.items.length === 0) {
    body = '<section class="course-authoring-state is-error" role="alert">' +
      `${renderUiIcon("remove-state", "course-authoring-state-icon")}<h3>Conteúdo indisponível</h3>` +
      `<p>${escapeHtml(state.initialFailure)}</p>` +
      '<button type="button" data-inspection-action="retry" aria-label="Tentar novamente"' +
      ` title="Tentar novamente">${renderUiIcon(
        "rotate",
        "course-authoring-button-icon"
      )}</button></section>`;
  } else if (state.items.length === 0) {
    body = '<section class="course-authoring-state is-empty" role="status">' +
      `${renderUiIcon("folder", "course-authoring-state-icon")}` +
      '<h3>Nenhuma Unidade de estudo materializada</h3>' +
      '<p>Este escopo ainda não possui materialização para conferir.</p></section>';
  } else {
    body = '<ol class="course-inspection-sequence" aria-label="Sequência curricular de Unidades">' +
      `<li class="course-inspection-spacer" aria-hidden="true" style="height:${Math.round(beforeCount * state.averageHeight)}px"></li>` +
      renderBoundaryButton("backward", state) +
      state.items.map((item) => renderStudyUnit(
        item,
        state.totalCount,
        state,
        Object.hasOwn(state.observationCounts, item.studyUnit.id)
          ? state.observationCounts[item.studyUnit.id]
          : null
      )).join("") +
      renderBoundaryButton("forward", state) +
      `<li class="course-inspection-spacer" aria-hidden="true" style="height:${Math.round(afterCount * state.averageHeight)}px"></li></ol>`;
  }
  return '<section class="course-authoring-section course-authoring-inspection"' +
    ' aria-label="Unidades de estudo">' +
    `<nav class="course-inspection-sticky-context" aria-label="Navegação entre Unidades">` +
    `<button type="button" data-inspection-action="previous" data-inspection-control-key="previous"` +
    `${!active || (active.ordinal <= 1 && !state.hasPrevious) ? " disabled aria-disabled=\"true\"" : ""}` +
    ` aria-label="Unidade anterior">${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button>` +
    `<div class="course-inspection-active-context">${renderContext(state, active)}</div>` +
    `<button type="button" data-inspection-action="next" data-inspection-control-key="next"` +
    `${!active || (active.ordinal >= state.totalCount && !state.hasMore) ? " disabled aria-disabled=\"true\"" : ""}` +
    ` aria-label="Próxima Unidade">${renderUiIcon("arrow-right", "course-authoring-button-icon")}</button>` +
    '<div class="course-inspection-navigation-tools">' +
    renderInspectionSearch(state) + renderInspectionSyncState(state) + "</div></nav>" +
    renderInspectionFocus(state, active) + notice + body +
    '<p class="course-inspection-copy-status" role="status" aria-live="polite">' +
    `${escapeHtml(state.manualStatus)}</p>` +
    renderInspectionObservationSheet(state) + "</section>";
}

function annotationTargetQuery(studyUnitId) {
  return normalizeCourseAnchoredAnnotationQuery({
    mode: "target",
    origins: [],
    channels: [],
    states: [],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: {
      target: { kind: "study_unit", id: studyUnitId },
      includeDescendants: false
    },
    annotationId: null
  });
}

function normalizeInspectionPosition(value, expectedCourseRevision = null) {
  if (value == null) return null;
  exactRecord(
    value,
    ["scope", "studyUnitId", "offsetFromStickyTop", "courseRevision"],
    "A posição local de Conteúdo é inválida."
  );
  const offset = Number(value.offsetFromStickyTop);
  const courseRevision = natural(value.courseRevision, "A revisão da posição local", { minimum: 1 });
  if (!Number.isFinite(offset) || Math.abs(offset) > 100_000 ||
      (expectedCourseRevision !== null && courseRevision !== expectedCourseRevision)) {
    throw new TypeError("A posição local de Conteúdo é inválida.");
  }
  return Object.freeze({
    scope: normalizeScope(value.scope),
    studyUnitId: canonicalId(value.studyUnitId, "A Unidade de estudo da posição local"),
    offsetFromStickyTop: offset,
    courseRevision
  });
}

export function createCourseInspectionSequence({
  root,
  controller,
  course,
  routeTarget = null,
  initialPosition = null,
  initialFocusKey = "",
  onNavigate = () => {},
  onEditSources = () => {},
  onEditContent = null,
  onSaveManualEdit = null,
  windowValue = globalThis.window || null,
  documentValue = root?.ownerDocument || globalThis.document || null,
  navigatorValue = globalThis.navigator || null,
  providerAssistanceSession = null
} = {}) {
  if (!root || typeof root.addEventListener !== "function" ||
      typeof controller?.loadAuthoringStudyUnits !== "function" ||
      typeof controller?.loadAuthoringInspectionPosition !== "function" ||
      typeof controller?.saveAuthoringInspectionPosition !== "function" ||
      !UUID_PATTERN.test(String(course?.courseId || "")) ||
      !Number.isSafeInteger(course?.revision) || course.revision < 1 ||
      typeof onNavigate !== "function" || typeof onEditSources !== "function" ||
      (onEditContent !== null && typeof onEditContent !== "function") ||
      (onSaveManualEdit !== null && typeof onSaveManualEdit !== "function") ||
      (providerAssistanceSession !== null &&
       (typeof providerAssistanceSession?.read !== "function" ||
        typeof providerAssistanceSession?.update !== "function" ||
        typeof providerAssistanceSession?.snapshot !== "function"))) {
    throw new TypeError("Dependências da sequência de Conteúdo são inválidas.");
  }
  const scrollTarget = root.closest?.(".course-authoring-root") || windowValue;
  const returnPosition = initialPosition == null
    ? null
    : normalizeInspectionPosition(initialPosition);
  let pendingInitialFocusKey = typeof initialFocusKey === "string" ? initialFocusKey : "";
  const requested = inspectionRequestFromTarget(routeTarget);
  const state = {
    courseId: course.courseId,
    courseTitle: typeof course.title === "string" ? course.title.trim() : "",
    pinnedRevision: course.revision,
    canEditSources: course.ownership === "owned" && course.canEdit === true,
    canAccessDesign: course.ownership === "owned" && course.canEdit === true,
    canEditContent: course.ownership === "owned" && course.canEdit === true &&
      typeof onEditContent === "function",
    canEditManually: course.ownership === "owned" && course.canEdit === true &&
      typeof onSaveManualEdit === "function",
    canUseProviderAssistance: course.ownership === "owned" && course.canEdit === true &&
      typeof onSaveManualEdit === "function" &&
      typeof controller.loadCourseDocument === "function",
    scope: requested.scope,
    inspectionFocusId: requested.inspectionFocusId ?? null,
    inspectionFocus: null,
    explicitTarget: Boolean(routeTarget),
    explicitAnchor: routeTarget?.kind === "study_unit",
    requestedAnchorStudyUnitId: requested.anchorStudyUnitId,
    items: [],
    emptyScopeContext: null,
    totalCount: 0,
    scopeOptions: Object.freeze({ authoringParts: Object.freeze([]), unassignedStudyUnitCount: 0 }),
    hasPrevious: false,
    hasMore: false,
    previousCursor: null,
    nextCursor: null,
    averageHeight: 320,
    activeStudyUnitId: requested.anchorStudyUnitId,
    selectedStudyUnitId: requested.anchorStudyUnitId,
    expandedStudyUnitIds: new Set(),
    initialLoading: false,
    loadingDirection: "",
    initialFailure: "",
    previousFailure: "",
    nextFailure: "",
    targetMissing: false,
    offlineKnown: false,
    stale: false,
    hydrationFailure: "",
    observationCounts: {},
    observationStudyUnitId: null,
    observationSheetOpen: false,
    observationDraftStudyUnitId: requested.anchorStudyUnitId,
    observationItems: [],
    observationCollectionSummary: null,
    observationDraft: { category: null, rawText: "" },
    observationEditingId: null,
    observationLoading: false,
    observationSaving: false,
    observationError: "",
    pendingObservationMutation: null,
    restoreObservationFocus: false,
    confirmation: null,
    manualStudyUnitId: null,
    manualTargetId: "",
    manualDraft: { pathValues: {} },
    manualOrigin: "manual",
    manualSaving: false,
    manualError: "",
    manualStatus: "",
    manualRestoreFocus: "",
    manualUndo: [],
    manualRedo: [],
    manualHistoryPreview: null,
    manualUnknownSignature: "",
    manualDiscardArmed: false,
    assistanceActiveStudyUnitId: "",
    assistanceDraft: null,
    assistanceSaving: false,
    assistanceError: "",
    searchQuery: "",
    searchResults: [],
    searchOpen: false,
    searchLoading: false,
    searchError: "",
    searchActiveIndex: -1,
    destroyed: false
  };
  let observer = null;
  let scrollFrame = null;
  let viewportUpdateBlockedUntil = 0;
  let renderEpoch = 0;
  let saveTimer = null;
  let requestEpoch = 0;
  let positionChannel = null;
  let lastInteractionAt = 0;
  let suppressBroadcastStudyUnitId = "";
  let observationEpoch = 0;
  let searchEpoch = 0;
  let courseSearchIndexRevision = null;
  let courseSearchIndexPromise = null;
  let courseSearchIndexFailed = false;
  let manualInlineController = null;
  let providerAssistance = null;

  function keepOnlyExpandedStudyUnit(studyUnitId) {
    state.expandedStudyUnitIds.clear();
    if (studyUnitId) state.expandedStudyUnitIds.add(studyUnitId);
  }

  function markInteraction() {
    lastInteractionAt = Date.now();
  }

  function cancelScrollFrame() {
    if (scrollFrame == null) return;
    if (typeof windowValue?.cancelAnimationFrame === "function") {
      windowValue.cancelAnimationFrame(scrollFrame);
    } else {
      clearTimeout(scrollFrame);
    }
    scrollFrame = null;
  }

  function blockViewportUpdates() {
    viewportUpdateBlockedUntil = Date.now() + 500;
    cancelScrollFrame();
  }

  function handlePointerDown(event) {
    markInteraction();
    const context = event?.target?.closest?.(".course-inspection-context-selector");
    const summary = event?.target?.closest?.(".course-inspection-context-selector > summary");
    const route = event?.target?.closest?.(
      ".course-inspection-context-selector > nav [data-inspection-route]"
    );
    if (context || summary || route) {
      blockViewportUpdates();
    }
    if (summary || route) {
      event.preventDefault?.();
    }
  }

  function handleFocusIn(event) {
    markInteraction();
    if (event?.target?.closest?.(".course-inspection-context-selector")) {
      blockViewportUpdates();
    }
  }

  function focus(selector) {
    root.querySelector?.(selector)?.focus?.({ preventScroll: true });
  }

  function cancelConfirmation({ restoreFocus = true } = {}) {
    const confirmation = state.confirmation;
    if (!confirmation) return false;
    state.confirmation = null;
    render({ restorePosition: false });
    if (restoreFocus) focus(confirmation.returnFocusSelector);
    return true;
  }

  function requestWithdraw(item) {
    state.confirmation = {
      command: {
        type: "withdraw_anchored_annotation",
        annotationId: item.annotationId,
        expectedAnnotationVersion: item.annotationVersion
      },
      returnFocusSelector: `[data-observation-action="withdraw"][data-observation-id="${item.annotationId}"]`
    };
    render({ restorePosition: false });
    focus('[data-observation-action="cancel-confirmation"]');
  }

  function confirmWithdraw() {
    const confirmation = state.confirmation;
    if (!confirmation || state.observationSaving) return false;
    state.confirmation = null;
    return mutateObservation(confirmation.command, "Observação retirada.");
  }

  function closeOpenMenus({ except = null, restoreFocus = false } = {}) {
    const openMenus = [...(root.querySelectorAll?.(INSPECTION_MENU_SELECTOR) || [])]
      .filter((menu) => menu.open);
    let closed = false;
    for (const menu of openMenus) {
      if (menu === except) continue;
      menu.open = false;
      closed = true;
      if (restoreFocus) menu.querySelector?.("summary")?.focus?.({ preventScroll: true });
    }
    return closed;
  }

  function handleDocumentClick(event) {
    if (event?.target && typeof documentValue?.documentElement?.contains === "function" &&
        !documentValue.documentElement.contains(event.target)) {
      return;
    }
    if (state.confirmation &&
        event?.target?.matches?.("[data-inspection-confirmation-backdrop]")) {
      cancelConfirmation();
    }
    const containingMenu = event?.target?.closest?.(INSPECTION_MENU_SELECTOR) || null;
    closeOpenMenus({ except: containingMenu });
    if (state.searchOpen && !event?.target?.closest?.("[data-inspection-search]")) {
      closeSearch();
    }
  }

  function handleKeyDown(event) {
    markInteraction();
    if (event?.target?.matches?.("[data-inspection-search-input]")) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault?.();
        if (!state.searchOpen || state.searchResults.length === 0) return;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        state.searchActiveIndex = (state.searchActiveIndex + delta + state.searchResults.length) %
          state.searchResults.length;
        updateSearchUi({ focusInput: true });
        return;
      }
      if (event.key === "Enter" && state.searchOpen && state.searchActiveIndex >= 0) {
        event.preventDefault?.();
        const result = state.searchResults[state.searchActiveIndex];
        if (result) void selectSearchResult(result.key);
        return;
      }
      if (event.key === "Escape" && state.searchOpen) {
        event.preventDefault?.();
        event.stopPropagation?.();
        closeSearch({ focusInput: true });
        return;
      }
    }
    if (event?.target?.matches?.("[data-inspection-manual-title]") && event.key === "Enter") {
      event.preventDefault?.();
      void saveManualEdit();
      return;
    }
    if (state.confirmation && event?.key === "Tab") {
      trapAuthoringConfirmationTab({
        event,
        root,
        confirmationSelector: "[data-inspection-confirmation]",
        documentValue
      });
      return;
    }
    if (event?.key !== "Escape") return;
    if (cancelConfirmation()) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    if (state.manualStudyUnitId && !state.manualSaving) {
      resetManualEditor({ status: "Edição cancelada.", focusEdit: true });
      event.preventDefault?.();
      event.stopPropagation?.();
      return;
    }
    const focusedMenu = documentValue?.activeElement?.closest?.(INSPECTION_MENU_SELECTOR) || null;
    const activeMenu = focusedMenu?.open ? focusedMenu :
      [...(root.querySelectorAll?.(INSPECTION_MENU_SELECTOR) || [])]
        .find((menu) => menu.open) || null;
    if (!activeMenu) return;
    activeMenu.open = false;
    activeMenu.querySelector?.("summary")?.focus?.({ preventScroll: true });
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function stickyTop() {
    const toolbar = root.querySelector?.(".course-inspection-sticky-context");
    return toolbar?.getBoundingClientRect?.().bottom || 0;
  }

  function captureAnchor() {
    const activeElement = documentValue?.activeElement;
    const focusedUnit = activeElement?.closest?.("[data-inspection-study-unit]");
    const threshold = stickyTop() + INSPECTION_ACTIVE_LINE_OFFSET;
    const viewportUnit = [...(root.querySelectorAll?.("[data-inspection-study-unit]") || [])]
      .find((element) => element.getBoundingClientRect?.().bottom > threshold);
    const selectedId = focusedUnit?.dataset?.inspectionStudyUnit ||
      viewportUnit?.dataset?.inspectionStudyUnit || state.activeStudyUnitId;
    const escapedId = selectedId && globalThis.CSS?.escape
      ? globalThis.CSS.escape(selectedId)
      : String(selectedId || "").replace(/["\\]/gu, "\\$&");
    const element = selectedId
      ? root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`)
      : null;
    return {
      studyUnitId: selectedId || null,
      offsetFromStickyTop: element?.getBoundingClientRect
        ? element.getBoundingClientRect().top - stickyTop()
        : 0,
      controlKey: activeElement?.closest?.("[data-inspection-control-key]")?.dataset?.inspectionControlKey || "",
      openControlKeys: [...(root.querySelectorAll?.("details[open] > [data-inspection-control-key]") || [])]
        .map((control) => control.dataset.inspectionControlKey)
        .filter(Boolean)
    };
  }

  function controlForKey(controlKey) {
    if (!controlKey) return null;
    const control = [...(root.querySelectorAll?.("[data-inspection-control-key]") || [])]
      .find((candidate) => candidate.dataset?.inspectionControlKey === controlKey);
    if (control) return control;
    const selectorValue = controlKey.replace(/["\\]/gu, "\\$&");
    return root.querySelector?.(`[data-inspection-control-key="${selectorValue}"]`) || null;
  }

  function restoreControlState(snapshot, { focus = true } = {}) {
    for (const controlKey of snapshot?.openControlKeys || []) {
      const details = controlForKey(controlKey)?.closest?.("details");
      const previewId = details?.dataset?.inspectionPreview;
      if (details && (!previewId || details.dataset.inspectionPreviewForced === "true" ||
          state.expandedStudyUnitIds.has(previewId))) {
        details.open = true;
      }
    }
    const control = controlForKey(snapshot?.controlKey);
    const details = control?.closest?.("details");
    const previewId = details?.dataset?.inspectionPreview;
    if (details && (!previewId || details.dataset.inspectionPreviewForced === "true" ||
        state.expandedStudyUnitIds.has(previewId))) {
      details.open = true;
    }
    if (focus) control?.focus?.({ preventScroll: true });
    return Boolean(control);
  }

  function restoreAnchor(snapshot, { initial = false } = {}) {
    const id = snapshot?.studyUnitId || state.activeStudyUnitId;
    if (!id) return;
    const escapedId = globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id.replace(/["\\]/gu, "\\$&");
    const element = root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`);
    if (!element?.getBoundingClientRect) return;
    const expectedOffset = Number(snapshot?.offsetFromStickyTop || 0);
    const delta = element.getBoundingClientRect().top - stickyTop() - expectedOffset;
    if ((initial || Math.abs(delta) > 0.5) && typeof scrollTarget?.scrollBy === "function") {
      scrollTarget.scrollBy({ top: delta, left: 0, behavior: "auto" });
      const remaining = element.getBoundingClientRect().top - stickyTop() - expectedOffset;
      if (Math.abs(remaining) > 0.5 && Math.abs(remaining - delta) > 0.5) {
        scrollTarget.scrollBy({ top: remaining, left: 0, behavior: "auto" });
      }
    }
    restoreControlState(snapshot);
  }

  function measureItems() {
    const heights = [...(root.querySelectorAll?.("[data-inspection-study-unit]") || [])]
      .map((element) => element.getBoundingClientRect?.().height || 0)
      .filter((height) => height > 0);
    if (heights.length) {
      state.averageHeight = Math.max(120, Math.min(1_600,
        heights.reduce((sum, height) => sum + height, 0) / heights.length + 12));
      const spacers = [...(root.querySelectorAll?.(".course-inspection-spacer") || [])];
      if (spacers.length === 2 && state.items.length > 0) {
        spacers[0].style.height = `${Math.round(
          Math.max(0, state.items[0].ordinal - 1) * state.averageHeight
        )}px`;
        spacers[1].style.height = `${Math.round(
          Math.max(0, state.totalCount - state.items[state.items.length - 1].ordinal) *
            state.averageHeight
        )}px`;
      }
    }
  }

  function deactivateResponses() {
    root.querySelectorAll?.(
      '.package-instance[data-package^="aralearn.response."], .card-answer-dock'
    ).forEach((container) => {
      if (container.closest?.(".runtime-resource-edit-target.is-inline-editing")) return;
      container.setAttribute("aria-disabled", "true");
      container.setAttribute("inert", "");
      container.querySelectorAll?.("button, input, select, textarea, [contenteditable]").forEach((control) => {
        if ("disabled" in control) control.disabled = true;
        control.setAttribute("aria-disabled", "true");
        control.setAttribute("tabindex", "-1");
        control.removeAttribute("contenteditable");
      });
    });
  }

  function observeBoundaries() {
    observer?.disconnect?.();
    observer = null;
    if (typeof windowValue?.IntersectionObserver !== "function") return;
    observer = new windowValue.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const direction = entry.target.dataset.inspectionLoad;
        if (direction) void loadDirection(direction);
      }
    }, { root: null, rootMargin: "480px 0px", threshold: 0.01 });
    root.querySelectorAll?.("[data-inspection-load]").forEach((element) => observer.observe(element));
  }

  async function hydrate(epoch) {
    try {
      if (state.destroyed || epoch !== renderEpoch) return;
      deactivateResponses();
      await RESOURCE_PACKAGE_REGISTRY.hydrate(root);
      if (state.destroyed || epoch !== renderEpoch) return;
      activateManualEditing();
      deactivateResponses();
      measureItems();
    } catch {
      if (state.destroyed || epoch !== renderEpoch) return;
      state.hydrationFailure = "Uma representação não pôde ser materializada.";
      const notice = root.querySelector?.(".course-inspection-copy-status");
      if (notice) notice.textContent = state.hydrationFailure;
    }
  }

  function render({
    anchor = null,
    initial = false,
    restorePosition = true,
    captureDraft = true
  } = {}) {
    if (state.destroyed) return;
    const epoch = ++renderEpoch;
    if (captureDraft) captureManualDraft();
    const snapshot = anchor || captureAnchor();
    const restoreObservationFocus = state.restoreObservationFocus;
    state.restoreObservationFocus = false;
    manualInlineController?.destroy?.();
    manualInlineController = null;
    observer?.disconnect?.();
    observer = null;
    root.innerHTML = renderSequence(state);
    if (snapshot?.controlKey || snapshot?.openControlKeys?.length) {
      restoreControlState(snapshot, { focus: false });
    }
    if (state.manualRestoreFocus === "discard-unknown" || state.manualRestoreFocus === "save") {
      const action = state.manualRestoreFocus === "discard-unknown"
        ? "discard-unknown"
        : "save";
      root.querySelector?.(`[data-inspection-manual-action="${action}"]`)
        ?.focus?.({ preventScroll: true });
      state.manualRestoreFocus = "";
    }
    if (restoreObservationFocus) {
      focus("[data-field='study-unit-observation']");
    }
    root.setAttribute?.("aria-busy", String(state.initialLoading || Boolean(state.loadingDirection)));
    void hydrate(epoch).then(() => {
      if (state.destroyed || epoch !== renderEpoch) return;
      if (restorePosition) restoreAnchor(snapshot, { initial });
      else restoreControlState(snapshot);
      updateActiveFromViewport();
      if (!restorePosition && scrollTarget && "scrollTop" in scrollTarget) {
        scrollTarget.scrollTop = 0;
      }
      observeBoundaries();
    });
  }

  function mergePage(page, direction) {
    if (page.totalCount !== state.totalCount && state.items.length > 0) {
      throw new TypeError("A quantidade de Conteúdo mudou sem nova revisão.");
    }
    const items = new Map(state.items.map((item) => [item.studyUnit.id, item]));
    page.items.forEach((item) => {
      items.set(item.studyUnit.id, item);
      state.observationCounts[item.studyUnit.id] = item.authorship.pendingObservationCount;
    });
    const ordered = [...items.values()].sort((left, right) => left.ordinal - right.ordinal);
    if (ordered.some((item, index) => index > 0 && item.ordinal !== ordered[index - 1].ordinal + 1)) {
      throw new TypeError("As páginas de Conteúdo não são contíguas.");
    }
    while (ordered.length > MAX_WINDOW_ITEMS) {
      if (direction === "backward") ordered.pop();
      else ordered.shift();
    }
    const retainedStudyUnitIds = new Set(ordered.map(({ studyUnit }) => studyUnit.id));
    for (const studyUnitId of state.expandedStudyUnitIds) {
      if (!retainedStudyUnitIds.has(studyUnitId)) state.expandedStudyUnitIds.delete(studyUnitId);
    }
    if (state.activeStudyUnitId &&
        !ordered.some(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId)) {
      state.activeStudyUnitId = direction === "backward"
        ? ordered[ordered.length - 1]?.studyUnit.id || null
        : ordered[0]?.studyUnit.id || null;
    }
    if (state.selectedStudyUnitId &&
        !ordered.some(({ studyUnit }) => studyUnit.id === state.selectedStudyUnitId) &&
        !hasObservationDraft()) {
      state.selectedStudyUnitId = state.activeStudyUnitId;
      state.observationDraftStudyUnitId = state.selectedStudyUnitId;
    }
    state.items = ordered;
    state.totalCount = page.totalCount;
    state.scopeOptions = page.scopeOptions;
    state.inspectionFocus = page.inspectionFocus;
    state.offlineKnown = page.offlineKnown;
    if (direction === "backward") {
      state.hasPrevious = page.hasPrevious;
      state.previousCursor = page.previousCursor;
      state.hasMore = ordered.length > 0 && ordered[ordered.length - 1].ordinal < page.totalCount;
      state.nextCursor = state.hasMore ? { studyUnitId: ordered[ordered.length - 1].studyUnit.id } : null;
    } else if (direction === "forward") {
      state.hasMore = page.hasMore;
      state.nextCursor = page.nextCursor;
      state.hasPrevious = ordered.length > 0 && ordered[0].ordinal > 1;
      state.previousCursor = state.hasPrevious ? { studyUnitId: ordered[0].studyUnit.id } : null;
    } else {
      state.hasPrevious = page.hasPrevious;
      state.hasMore = page.hasMore;
      state.previousCursor = page.previousCursor;
      state.nextCursor = page.nextCursor;
    }
  }

  function pageOptions({ anchorStudyUnitId = null, cursor = null, direction = "forward" } = {}) {
    return {
      expectedRevision: state.pinnedRevision,
      scope: state.scope,
      ...(state.inspectionFocusId === null ? {} : { inspectionFocusId: state.inspectionFocusId }),
      ...(anchorStudyUnitId ? { anchorStudyUnitId } : {}),
      cursor,
      direction,
      limit: PAGE_SIZE,
      maxBytes: MAX_PAGE_BYTES
    };
  }

  async function readPage(options) {
    return normalizeCourseInspectionPage(
      await controller.loadAuthoringStudyUnits(state.courseId, options),
      {
        expectedCourseId: state.courseId,
        expectedRevision: state.pinnedRevision,
        expectedScope: state.scope,
        expectedInspectionFocusId: state.inspectionFocusId
      }
    );
  }

  function loadCourseSearchIndex() {
    const revision = state.pinnedRevision;
    if (courseSearchIndexRevision === revision && courseSearchIndexPromise) {
      return courseSearchIndexPromise;
    }
    if (typeof controller.loadCourseDocument !== "function") {
      return Promise.reject(new TypeError("O índice curricular deste Curso não está disponível."));
    }
    courseSearchIndexRevision = revision;
    courseSearchIndexFailed = false;
    const pending = Promise.resolve(
      controller.loadCourseDocument(state.courseId, { verifiedRevision: revision })
    ).then((loaded) => Object.freeze({
      project: loaded?.document,
      index: buildCourseInspectionSearchIndex(loaded?.document, state.courseId, {
        courseTitle: state.courseTitle
      })
    }));
    courseSearchIndexPromise = pending.catch((error) => {
      if (courseSearchIndexRevision === revision) courseSearchIndexFailed = true;
      throw error;
    });
    return courseSearchIndexPromise;
  }

  function resetFailedCourseSearchIndex() {
    if (!courseSearchIndexFailed) return;
    courseSearchIndexRevision = null;
    courseSearchIndexPromise = null;
    courseSearchIndexFailed = false;
  }

  async function readAnnotationPage(query, {
    annotationSetVersion = null,
    cursor = null,
    limit = ANNOTATION_PAGE_SIZE
  } = {}) {
    if (typeof controller.loadCourseAnchoredAnnotations !== "function") {
      throw new TypeError("A inbox de observações não está disponível.");
    }
    const options = normalizeCourseAnchoredAnnotationReadOptions({
      expectedCourseRevision: state.pinnedRevision,
      annotationSetVersion,
      query,
      cursor,
      limit
    });
    return normalizeCourseAnchoredAnnotationPage(
      await controller.loadCourseAnchoredAnnotations(state.courseId, options)
    );
  }

  async function loadTargetObservations(studyUnitId) {
    const query = annotationTargetQuery(studyUnitId);
    const items = [];
    let annotationSetVersion = null;
    let cursor = null;
    let summary = null;
    const seenCursors = new Set();
    const seenAnnotationIds = new Set();
    for (let index = 0; index < MAX_ANNOTATION_PAGES_PER_TARGET; index += 1) {
      const page = await readAnnotationPage(query, {
        annotationSetVersion,
        cursor,
        limit: ANNOTATION_PAGE_SIZE
      });
      summary ??= page.summary;
      if (page.items.some(({ annotationId }) => {
        if (seenAnnotationIds.has(annotationId)) return true;
        seenAnnotationIds.add(annotationId);
        return false;
      }) || page.hasMore && page.items.length === 0 ||
          page.hasMore && seenCursors.has(page.nextCursor)) {
        throw new Error("A paginação de observações não avançou de forma válida.");
      }
      const available = MAX_ANNOTATIONS_PER_TARGET - items.length;
      items.push(...page.items.slice(0, available));
      annotationSetVersion = page.annotationSetVersion;
      const pendingTotal = (summary.byState.open || 0) + (summary.byState.considered || 0);
      const activeTotal = pendingTotal + (summary.byState.resolved || 0);
      if (items.length === MAX_ANNOTATIONS_PER_TARGET || !page.hasMore) {
        return {
          items,
          matchingTotal: summary.matchingTotal,
          activeTotal,
          pendingTotal,
          truncated: summary.matchingTotal > items.length
        };
      }
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new Error("Este contexto excedeu o limite seguro de observações.");
  }

  async function openObservations(studyUnitId) {
    const item = state.items.find(({ studyUnit }) => studyUnit.id === studyUnitId);
    if (!item) return false;
    if (hasObservationDraft() && state.observationDraftStudyUnitId &&
        state.observationDraftStudyUnitId !== studyUnitId) {
      state.observationError = "Salve ou apague a observação em rascunho antes de mudar de alvo.";
      state.restoreObservationFocus = true;
      render();
      return false;
    }
    const anchor = captureAnchor();
    anchor.controlKey = "";
    anchor.openControlKeys = [];
    const epoch = ++observationEpoch;
    state.observationStudyUnitId = studyUnitId;
    state.observationSheetOpen = true;
    state.observationItems = [];
    state.observationCollectionSummary = null;
    if (!hasObservationDraft()) state.observationDraft = { category: null, rawText: "" };
    state.observationDraftStudyUnitId = studyUnitId;
    state.observationEditingId = null;
    state.observationError = "";
    state.observationLoading = true;
    render({ anchor });
    try {
      const observations = await loadTargetObservations(studyUnitId);
      if (state.destroyed || epoch !== observationEpoch) return false;
      state.observationItems = observations.items;
      state.observationCollectionSummary = observations;
      state.observationCounts[studyUnitId] = observations.pendingTotal;
      return true;
    } catch (error) {
      if (!state.destroyed && epoch === observationEpoch) {
        state.observationError = error instanceof Error
          ? error.message
          : "Não foi possível carregar as observações.";
      }
      return false;
    } finally {
      if (!state.destroyed && epoch === observationEpoch) {
        state.observationLoading = false;
        render();
      }
    }
  }

  async function mutateObservation(command, successMessage, { operationDraft = command } = {}) {
    if (typeof controller.mutateCourseAnchoredAnnotations !== "function") return false;
    const normalized = normalizeCourseAnchoredAnnotationCommand(command);
    const draft = structuredClone(operationDraft);
    if (!pendingObservationMatches(state.pendingObservationMutation, draft)) {
      state.pendingObservationMutation = null;
    }
    const expectedCourseRevision = normalized.type === "create_anchored_annotation"
      ? state.pinnedRevision
      : null;
    const request = state.pendingObservationMutation?.request || {
      requestId: createUuid(),
      courseId: state.courseId,
      expectedCourseRevision,
      command: normalized
    };
    state.pendingObservationMutation ||= {
      draft,
      request: structuredClone(request)
    };
    state.observationSaving = true;
    state.observationError = "";
    render();
    let mutationConfirmed = false;
    try {
      const change = normalizeCourseAnchoredAnnotationChange(
        await controller.mutateCourseAnchoredAnnotations(structuredClone(request))
      );
      if (change.courseId !== state.courseId || change.requestId !== request.requestId ||
          change.annotation && change.annotation.annotationId !== normalized.annotationId) {
        throw new TypeError("A confirmação não corresponde à observação enviada.");
      }
      mutationConfirmed = true;
      state.pendingObservationMutation = null;
      const studyUnitId = state.observationStudyUnitId;
      state.observationDraft = { category: null, rawText: "" };
      state.observationDraftStudyUnitId = state.selectedStudyUnitId;
      state.observationEditingId = null;
      const observations = await loadTargetObservations(studyUnitId);
      state.observationItems = observations.items;
      state.observationCollectionSummary = observations;
      state.observationCounts[studyUnitId] = observations.pendingTotal;
      const status = root.querySelector?.(".course-inspection-copy-status");
      if (status) status.textContent = successMessage;
      return true;
    } catch (error) {
      if (mutationConfirmed) {
        state.observationError = `${successMessage} Não foi possível atualizar a lista agora.`;
        return true;
      }
      const ambiguous = ambiguousObservationFailure(error);
      if (!ambiguous) state.pendingObservationMutation = null;
      const detail = error instanceof Error
        ? error.message
        : "Não foi possível alterar a observação.";
      state.observationError = ambiguous
        ? `${detail} Tente novamente para confirmar exatamente a mesma operação.`
        : detail;
      state.restoreObservationFocus = true;
      return false;
    } finally {
      state.observationSaving = false;
      render();
    }
  }

  async function loadInitial({
    anchorStudyUnitId = state.requestedAnchorStudyUnitId,
    offset = 0,
    allowRebase = true
  } = {}) {
    const hasRequestedPosition = Boolean(anchorStudyUnitId);
    const epoch = ++requestEpoch;
    state.loadingDirection = "";
    state.initialLoading = true;
    state.initialFailure = "";
    state.targetMissing = false;
    render({ anchor: { studyUnitId: anchorStudyUnitId, offsetFromStickyTop: offset }, initial: true });
    try {
      const page = await readPage(pageOptions({ anchorStudyUnitId }));
      if (state.destroyed || epoch !== requestEpoch) return false;
      if (anchorStudyUnitId && page.items.length === 0 && page.totalCount > 0) {
        if (state.explicitAnchor) {
          state.targetMissing = true;
          state.totalCount = page.totalCount;
          state.scopeOptions = page.scopeOptions;
          return false;
        }
        return loadInitial({ anchorStudyUnitId: null, offset: 0 });
      }
      state.items = [];
      mergePage(page, "initial");
      if (anchorStudyUnitId && page.items.length > 0 && page.hasPrevious) {
        const previous = await readPage(pageOptions({
          cursor: { studyUnitId: page.items[0].studyUnit.id },
          direction: "backward"
        }));
        if (state.destroyed || epoch !== requestEpoch) return false;
        mergePage(previous, "backward");
      }
      state.emptyScopeContext = null;
      if (state.items.length === 0) {
        try {
          const { index } = await loadCourseSearchIndex();
          if (state.destroyed || epoch !== requestEpoch) return false;
          const scopeId = state.scope.kind === "course" ? state.courseId : state.scope.id;
          state.emptyScopeContext = index.find(({ kind, id }) =>
            kind === state.scope.kind && id === scopeId) || null;
        } catch {
          state.emptyScopeContext = null;
        }
      }
      state.activeStudyUnitId = page.items.some(({ studyUnit }) => studyUnit.id === anchorStudyUnitId)
        ? anchorStudyUnitId
        : page.items[0]?.studyUnit.id || null;
      state.selectedStudyUnitId = state.activeStudyUnitId;
      state.observationDraftStudyUnitId = state.activeStudyUnitId;
      keepOnlyExpandedStudyUnit(state.activeStudyUnitId);
      return true;
    } catch (error) {
      if (state.destroyed || epoch !== requestEpoch) return false;
      const message = statusMessage(error);
      if (message === "Ponto não encontrado." && state.explicitTarget) {
        state.targetMissing = true;
      } else if (message === "Ponto não encontrado." && allowRebase) {
        state.scope = Object.freeze({ kind: "course", id: null });
        state.requestedAnchorStudyUnitId = null;
        return loadInitial({ anchorStudyUnitId: null, offset: 0, allowRebase: false });
      } else {
        state.initialFailure = message;
      }
      return false;
    } finally {
      if (!state.destroyed && epoch === requestEpoch) {
        state.initialLoading = false;
        render({
          anchor: {
            studyUnitId: state.activeStudyUnitId || anchorStudyUnitId,
            offsetFromStickyTop: offset,
            controlKey: pendingInitialFocusKey
          },
          initial: true,
          restorePosition: hasRequestedPosition
        });
        pendingInitialFocusKey = "";
        if (!hasRequestedPosition && scrollTarget && "scrollTop" in scrollTarget) {
          scrollTarget.scrollTop = 0;
        }
      }
    }
  }

  async function loadDirection(direction) {
    if (!new Set(["forward", "backward"]).has(direction) || state.loadingDirection) return false;
    const available = direction === "forward" ? state.hasMore : state.hasPrevious;
    const cursor = direction === "forward" ? state.nextCursor : state.previousCursor;
    if (!available || !cursor) return false;
    const epoch = requestEpoch;
    const anchor = captureAnchor();
    state.loadingDirection = direction;
    if (direction === "forward") state.nextFailure = "";
    else state.previousFailure = "";
    render({ anchor });
    try {
      const page = await readPage(pageOptions({ cursor, direction }));
      if (state.destroyed || epoch !== requestEpoch) return false;
      mergePage(page, direction);
      return true;
    } catch (error) {
      if (state.destroyed || epoch !== requestEpoch) return false;
      if (direction === "forward") state.nextFailure = statusMessage(error);
      else state.previousFailure = statusMessage(error);
      return false;
    } finally {
      if (!state.destroyed && epoch === requestEpoch) {
        state.loadingDirection = "";
        render({ anchor });
      }
    }
  }

  function updateSearchUi({ focusInput = false } = {}) {
    const input = root.querySelector?.("[data-inspection-search-input]");
    const host = root.querySelector?.(".course-inspection-search-results-host");
    if (!input || !host) {
      render({ anchor: captureAnchor() });
      return;
    }
    host.innerHTML = renderInspectionSearchResults(state);
    input.value = state.searchQuery;
    input.setAttribute("aria-expanded", String(state.searchOpen));
    if (state.searchOpen && state.searchActiveIndex >= 0 &&
        state.searchResults[state.searchActiveIndex]) {
      input.setAttribute(
        "aria-activedescendant",
        `course-inspection-search-option-${state.searchActiveIndex}`
      );
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    if (focusInput) {
      input.focus?.({ preventScroll: true });
      input.setSelectionRange?.(state.searchQuery.length, state.searchQuery.length);
    }
  }

  function closeSearch({ clear = false, focusInput = false } = {}) {
    ++searchEpoch;
    state.searchOpen = false;
    state.searchLoading = false;
    state.searchError = "";
    state.searchActiveIndex = -1;
    if (clear) {
      state.searchQuery = "";
      state.searchResults = [];
    }
    updateSearchUi({ focusInput });
  }

  async function searchCourse(query) {
    const currentEpoch = ++searchEpoch;
    state.searchQuery = String(query || "");
    state.searchError = "";
    state.searchResults = [];
    state.searchActiveIndex = -1;
    if (!normalizeSearchText(state.searchQuery)) {
      resetFailedCourseSearchIndex();
      state.searchOpen = false;
      state.searchLoading = false;
      updateSearchUi({ focusInput: true });
      return true;
    }
    state.searchOpen = true;
    state.searchLoading = true;
    updateSearchUi({ focusInput: true });
    try {
      const { index } = await loadCourseSearchIndex();
      if (state.destroyed || currentEpoch !== searchEpoch) return false;
      state.searchResults = [...searchCourseInspectionIndex(index, state.searchQuery)];
      state.searchActiveIndex = state.searchResults.length ? 0 : -1;
      return true;
    } catch (error) {
      if (state.destroyed || currentEpoch !== searchEpoch) return false;
      state.searchError = statusMessage(error);
      return false;
    } finally {
      if (!state.destroyed && currentEpoch === searchEpoch) {
        state.searchLoading = false;
        updateSearchUi({ focusInput: true });
      }
    }
  }

  async function selectSearchResult(key) {
    const result = state.searchResults.find((candidate) => candidate.key === key);
    if (!result) return false;
    if (result.kind !== "study_unit") {
      closeSearch({ clear: true });
      const scope = result.kind === "course"
        ? Object.freeze({ kind: "course", id: null })
        : Object.freeze({ kind: result.kind, id: result.id });
      return navigateScope(scope);
    }
    if (hasObservationDraft() && state.observationDraftStudyUnitId &&
        state.observationDraftStudyUnitId !== result.id) {
      state.observationError = "Salve ou apague a observação em rascunho antes de mudar de alvo.";
      state.restoreObservationFocus = true;
      render();
      return false;
    }
    if (state.manualStudyUnitId || state.assistanceDraft) {
      state.manualError = "Salve ou cancele a edição antes de mudar de Unidade.";
      render();
      return false;
    }
    closeSearch({ clear: true });
    const localTarget = state.items.find(({ studyUnit }) => studyUnit.id === result.id);
    if (localTarget) {
      const targetAnchor = {
        ...captureAnchor(),
        studyUnitId: result.id,
        offsetFromStickyTop: 0,
        controlKey: "search"
      };
      if (!selectStudyUnit(result.id, { anchor: targetAnchor })) return false;
      blockViewportUpdates();
      restoreAnchor(targetAnchor, { initial: true });
    } else {
      const scopePathIndex = { module: 1, lesson: 2, didactic_microsequence: 3 }[state.scope.kind];
      const resultBelongsToScope = state.scope.kind === "course" ||
        (scopePathIndex !== undefined && result.entityPath[scopePathIndex] === state.scope.id);
      if (!resultBelongsToScope) {
        state.scope = Object.freeze({ kind: "course", id: null });
      }
      state.explicitTarget = false;
      state.explicitAnchor = false;
      state.requestedAnchorStudyUnitId = result.id;
      pendingInitialFocusKey = "search";
      if (!await loadInitial({ anchorStudyUnitId: result.id, allowRebase: false })) return false;
    }
    scheduleSave();
    return true;
  }

  function activeItem() {
    return state.items.find(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId) ||
      state.items[0] || null;
  }

  function updateActiveFromViewport() {
    scrollFrame = null;
    if (Date.now() < viewportUpdateBlockedUntil) return;
    if (state.destroyed || state.items.length === 0) return;
    const threshold = stickyTop() + INSPECTION_ACTIVE_LINE_OFFSET;
    const elements = [...(root.querySelectorAll?.("[data-inspection-study-unit]") || [])];
    const current = elements.find((element) => element.getBoundingClientRect().bottom > threshold) ||
      elements[elements.length - 1];
    const id = current?.dataset?.inspectionStudyUnit;
    if (!id) return;
    const changed = id !== state.activeStudyUnitId;
    state.activeStudyUnitId = id;
    const item = activeItem();
    if (changed && !hasObservationDraft()) {
      state.selectedStudyUnitId = id;
      state.observationDraftStudyUnitId = id;
    }
    elements.forEach((element) => {
      const currentUnit = element.dataset.inspectionStudyUnit === id;
      element.classList?.toggle("is-selected", currentUnit);
      const article = element.querySelector?.("article");
      if (currentUnit) article?.setAttribute?.("aria-current", "true");
      else article?.removeAttribute?.("aria-current");
    });
    const position = root.querySelector?.("[data-inspection-context-position]");
    const parent = root.querySelector?.("[data-inspection-context-parent]");
    const summary = root.querySelector?.("[data-inspection-context-summary]");
    if (position) position.textContent = `${item.ordinal}/${state.totalCount}`;
    if (parent) parent.textContent = `${item.curriculumPath.module.title} · ${item.curriculumPath.lesson.title}`;
    if (summary) summary.textContent = item.curriculumPath.didacticMicrosequence.title;
    const selectorSummary = root.querySelector?.(".course-inspection-context-selector > summary");
    selectorSummary?.setAttribute?.(
      "aria-label",
      `Localização: ${item.curriculumPath.module.title}, ${item.curriculumPath.lesson.title}, ` +
        `${item.curriculumPath.didacticMicrosequence.title}, Unidade ${item.ordinal}`
    );
    const previousButton = root.querySelector?.('[data-inspection-action="previous"]');
    const nextButton = root.querySelector?.('[data-inspection-action="next"]');
    const updateButton = (button, disabled) => {
      if (!button) return;
      button.disabled = disabled;
      button.setAttribute("aria-disabled", String(disabled));
    };
    updateButton(previousButton, item.ordinal <= 1 && !state.hasPrevious);
    updateButton(nextButton, item.ordinal >= state.totalCount && !state.hasMore);
    const links = [
      ["[data-inspection-context-module]", "module", item.curriculumPath.module, "Módulo"],
      ["[data-inspection-context-lesson]", "lesson", item.curriculumPath.lesson, "Lição"],
      ["[data-inspection-context-microsequence]", "didactic_microsequence",
        item.curriculumPath.didacticMicrosequence, "Microssequência"],
      ["[data-inspection-context-study-unit]", "study_unit", item.studyUnit, "Unidade"]
    ];
    links.forEach(([selector, kind, target, label]) => {
      const link = root.querySelector?.(selector);
      link?.setAttribute?.("href", routeForPath(state.courseId, kind, target.id));
      if (link) link.textContent = `${label} · ${target.title}`;
      const edit = root.querySelector?.(`[data-inspection-edit-content="${kind}"]`);
      if (edit) edit.dataset.targetId = target.id;
    });
    if (changed) scheduleSave();
  }

  function onScroll() {
    markInteraction();
    if (Date.now() < viewportUpdateBlockedUntil) return;
    if (scrollFrame != null) return;
    scrollFrame = typeof windowValue?.requestAnimationFrame === "function"
      ? windowValue.requestAnimationFrame(updateActiveFromViewport)
      : setTimeout(updateActiveFromViewport, 0);
  }

  function savePositionNow(snapshot = null) {
    if (saveTimer != null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const anchor = snapshot || captureAnchor();
    if (!anchor.studyUnitId) return Promise.resolve(false);
    return Promise.resolve(controller.saveAuthoringInspectionPosition(state.courseId, {
      scope: state.scope,
      studyUnitId: anchor.studyUnitId,
      offsetFromStickyTop: anchor.offsetFromStickyTop,
      courseRevision: state.pinnedRevision
    })).then(() => {
      if (suppressBroadcastStudyUnitId === anchor.studyUnitId) {
        suppressBroadcastStudyUnitId = "";
      } else {
        positionChannel?.postMessage?.({
          courseId: state.courseId,
          revision: state.pinnedRevision,
          studyUnitId: anchor.studyUnitId
        });
      }
      return true;
    }).catch(() => false);
  }

  function scheduleSave() {
    if (saveTimer != null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void savePositionNow(), 250);
  }

  async function moveActive(direction) {
    const current = activeItem();
    if (!current) return false;
    const interactionAnchor = captureAnchor();
    const delta = direction === "next" ? 1 : -1;
    let target = state.items.find((item) => item.ordinal === current.ordinal + delta);
    if (!target) {
      await loadDirection(direction === "next" ? "forward" : "backward");
      target = state.items.find((item) => item.ordinal === current.ordinal + delta);
    }
    if (!target) return false;
    const targetAnchor = {
      ...interactionAnchor,
      studyUnitId: target.studyUnit.id,
      offsetFromStickyTop: 0
    };
    if (!selectStudyUnit(target.studyUnit.id, { anchor: targetAnchor })) return false;
    blockViewportUpdates();
    restoreAnchor(targetAnchor, { initial: true });
    scheduleSave();
    return true;
  }

  function hasObservationDraft() {
    return state.observationDraft.rawText !== "" || state.observationDraft.category !== null;
  }

  function selectStudyUnit(studyUnitId, { anchor = null } = {}) {
    const target = state.items.find(({ studyUnit }) => studyUnit.id === studyUnitId);
    if (!target) return false;
    if (hasObservationDraft() && state.observationDraftStudyUnitId &&
        state.observationDraftStudyUnitId !== studyUnitId) {
      state.observationError = "Salve ou apague a observação em rascunho antes de mudar de alvo.";
      state.restoreObservationFocus = true;
      render();
      return false;
    }
    state.activeStudyUnitId = studyUnitId;
    state.selectedStudyUnitId = studyUnitId;
    state.observationDraftStudyUnitId = studyUnitId;
    state.observationError = "";
    keepOnlyExpandedStudyUnit(studyUnitId);
    render({ anchor: anchor || captureAnchor() });
    return true;
  }

  async function navigateFromCurrentPoint(route, { studyUnitId = "", controlKey = "" } = {}) {
    const returnItem = state.items.find(({ studyUnit }) => studyUnit.id === studyUnitId) ||
      activeItem();
    const captured = captureAnchor();
    const escapedId = returnItem && (globalThis.CSS?.escape
      ? globalThis.CSS.escape(returnItem.studyUnit.id)
      : returnItem.studyUnit.id.replace(/["\\]/gu, "\\$&"));
    const activeElement = escapedId
      ? root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`)
      : null;
    const anchor = returnItem
      ? {
          ...captured,
          studyUnitId: returnItem.studyUnit.id,
          offsetFromStickyTop: activeElement?.getBoundingClientRect
            ? activeElement.getBoundingClientRect().top - stickyTop()
            : captured.offsetFromStickyTop
        }
      : captured;
    await savePositionNow(anchor);
    const returnTo = returnItem
      ? buildCourseAuthoringRoute(state.courseId, {
          section: "content",
          studyUnitId: returnItem.studyUnit.id
        })
      : null;
    return onNavigate(route, {
      returnTo,
      ...(returnItem ? {
        returnPosition: {
          scope: state.scope,
          studyUnitId: returnItem.studyUnit.id,
          offsetFromStickyTop: anchor.offsetFromStickyTop,
          courseRevision: state.pinnedRevision
        }
      } : {}),
      ...(controlKey || captured.controlKey
        ? { returnFocusKey: controlKey || captured.controlKey }
        : {})
    });
  }

  async function navigateScope(scope) {
    const route = buildCourseAuthoringRoute(state.courseId, {
      section: "content",
      ...scopeRouteOptions(scope)
    });
    return navigateFromCurrentPoint(route);
  }

  function restoreManualHistoryPreview() {
    const preview = state.manualHistoryPreview;
    if (!preview) return;
    const source = preview.direction === "undo" ? state.manualRedo : state.manualUndo;
    const destination = preview.direction === "undo" ? state.manualUndo : state.manualRedo;
    if (source.at(-1) === preview.entry) {
      source.pop();
      destination.push(preview.entry);
    }
    state.manualHistoryPreview = null;
  }

  function resetManualEditor({
    status = "",
    focusEdit = false,
    confirmUnknownDiscard = false,
    keepHistoryPreview = false
  } = {}) {
    const studyUnitId = state.manualStudyUnitId;
    if (state.manualUnknownSignature && !confirmUnknownDiscard) {
      state.manualDiscardArmed = true;
      state.manualError = "A gravação pode ter sido aceita. Salve novamente para confirmar ou descarte explicitamente este rascunho.";
      state.manualRestoreFocus = "discard-unknown";
      render({ captureDraft: false });
      return false;
    }
    if (keepHistoryPreview) state.manualHistoryPreview = null;
    else restoreManualHistoryPreview();
    manualInlineController?.destroy?.();
    manualInlineController = null;
    state.manualStudyUnitId = null;
    state.manualTargetId = "";
    state.manualDraft = { pathValues: {} };
    state.manualOrigin = "manual";
    state.manualSaving = false;
    state.manualError = "";
    state.manualStatus = status;
    state.manualRestoreFocus = "";
    state.manualUnknownSignature = "";
    state.manualDiscardArmed = false;
    render();
    if (focusEdit && studyUnitId) {
      [...(root.querySelectorAll?.('[data-inspection-unit-mode="edit"]') || [])]
        .find((button) => button.dataset.studyUnitId === studyUnitId)
        ?.focus?.({ preventScroll: true });
    }
    return true;
  }

  function beginManualEdit(
    studyUnitId,
    targetId = "study_unit",
    { pathValues = {}, origin = "manual", restoreFocus = true, status = "" } = {}
  ) {
    if (!state.canEditManually || state.manualSaving) return false;
    const item = manualItem(studyUnitId);
    if (!item) return false;
    state.manualStudyUnitId = studyUnitId;
    state.manualTargetId = targetId;
    state.manualDraft = { pathValues: structuredClone(pathValues) };
    state.manualOrigin = origin;
    state.manualError = "";
    state.manualStatus = status;
    state.manualRestoreFocus = restoreFocus ? "field" : "";
    keepOnlyExpandedStudyUnit(studyUnitId);
    render({ captureDraft: false });
    return true;
  }

  function previewManualDraft({
    studyUnitId,
    targetId,
    pathValues,
    origin = "provider_assistance",
    restoreFocus = true
  } = {}) {
    if (!new Set(["manual", "provider_assistance"]).has(origin) ||
        !isPlainObject(pathValues)) {
      throw new TypeError("O rascunho contextual de edição é inválido.");
    }
    const item = manualItem(canonicalId(studyUnitId, "A Unidade do rascunho"));
    const normalizedTargetId = String(targetId || "").trim();
    if (!item || !normalizedTargetId) {
      throw new TypeError("O alvo do rascunho contextual não existe.");
    }
    applyManualStudyUnitEdit(item.studyUnit, normalizedTargetId, { pathValues });
    return beginManualEdit(item.studyUnit.id, normalizedTargetId, {
      pathValues,
      origin,
      restoreFocus
    });
  }

  function ensureProviderAssistance() {
    if (providerAssistance) return providerAssistance;
    providerAssistance = createCourseProviderAssistance({
      documentValue,
      windowValue,
      session: providerAssistanceSession
    });
    return providerAssistance;
  }

  function providerTriggerFocus(studyUnitId) {
    return Object.freeze({
      focus(options) {
        [...(root.querySelectorAll?.("[data-inspection-provider-assistance]") || [])]
          .find((button) => button.dataset.studyUnitId === studyUnitId)
          ?.focus?.(options);
      }
    });
  }

  async function openProviderAssistance(trigger) {
    if (!state.canUseProviderAssistance || state.manualSaving || state.assistanceSaving ||
        state.assistanceDraft || providerAssistance?.opened) return false;
    if (state.manualUnknownSignature) {
      state.manualDiscardArmed = true;
      state.manualError = "Confirme a mesma gravação ou descarte o pedido incerto antes de pedir outra alteração.";
      render({ captureDraft: false });
      return false;
    }
    const studyUnitId = String(trigger?.dataset?.studyUnitId || "");
    const item = manualItem(studyUnitId);
    if (!item) return false;
    if (state.manualStudyUnitId && manualDraftChanged()) {
      state.manualError = "Salve ou cancele a edição atual antes de usar a assistência.";
      render();
      return false;
    }
    if (state.manualStudyUnitId) resetManualEditor({ focusEdit: false });
    state.assistanceActiveStudyUnitId = studyUnitId;
    state.assistanceError = "";
    keepOnlyExpandedStudyUnit(studyUnitId);
    render({ captureDraft: false });
    try {
      const loaded = await controller.loadCourseDocument(state.courseId, {
        verifiedRevision: state.pinnedRevision
      });
      if (state.destroyed || state.assistanceActiveStudyUnitId !== studyUnitId) return false;
      const project = loaded?.document;
      const selection = {
        courseId: state.courseId,
        moduleId: item.curriculumPath.module.id,
        lessonId: item.curriculumPath.lesson.id,
        microsequenceId: item.curriculumPath.didacticMicrosequence.id,
        studyUnitId,
        studyUnitIndex: Math.max(0, Number(item.studyUnit.position) - 1)
      };
      const baselineItem = structuredClone(item);
      return ensureProviderAssistance().open({
        trigger: providerTriggerFocus(studyUnitId),
        project,
        selection,
        scope: "study_unit",
        targetTitle: item.studyUnit.title,
        writeTargetId: "study_unit",
        onApplyDraft: (prepared) => {
          replaceManualItem(baselineItem, prepared.candidate, baselineItem.version);
          state.assistanceDraft = {
            studyUnitId,
            baselineItem,
            proposedStudyUnit: structuredClone(prepared.candidate),
            summary: prepared.message
          };
          state.assistanceError = "";
          render({ captureDraft: false });
        },
        onClosed: () => {
          state.assistanceActiveStudyUnitId = "";
          render({ captureDraft: false });
        }
      });
    } catch (error) {
      state.assistanceActiveStudyUnitId = "";
      state.manualError = error instanceof Error
        ? error.message
        : "A assistência por API não está disponível.";
      render({ captureDraft: false });
      return false;
    }
  }

  function discardAssistanceDraft() {
    const draft = state.assistanceDraft;
    if (!draft || state.assistanceSaving) return false;
    replaceManualItem(draft.baselineItem, draft.baselineItem.studyUnit, draft.baselineItem.version);
    state.assistanceDraft = null;
    state.assistanceError = "";
    state.manualStatus = "Proposta descartada.";
    render({ captureDraft: false });
    return true;
  }

  async function saveAssistanceDraft() {
    const draft = state.assistanceDraft;
    if (!draft || state.assistanceSaving) return false;
    state.assistanceSaving = true;
    state.assistanceError = "";
    render({ captureDraft: false });
    try {
      const committed = await commitManualStudyUnit(
        draft.baselineItem,
        draft.proposedStudyUnit,
        "provider_assistance"
      );
      replaceManualItem(
        draft.baselineItem,
        committed.item.studyUnit,
        committed.item.version
      );
      state.manualUndo.push({
        studyUnitId: draft.studyUnitId,
        targetId: "study_unit",
        before: structuredClone(draft.baselineItem.studyUnit),
        after: structuredClone(committed.item.studyUnit)
      });
      if (state.manualUndo.length > 20) state.manualUndo.shift();
      state.manualRedo = [];
      state.assistanceDraft = null;
      state.assistanceSaving = false;
      state.manualStatus = "Proposta salva.";
      render({ captureDraft: false });
      return true;
    } catch (error) {
      state.assistanceSaving = false;
      state.assistanceError = error instanceof Error
        ? error.message
        : "Não foi possível salvar a proposta.";
      render({ captureDraft: false });
      return false;
    }
  }

  function manualDraftChanged() {
    const item = manualItem();
    if (!item || !state.manualTargetId) return false;
    captureManualDraft();
    const original = new Map(
      listManualStudyUnitEditablePaths(item.studyUnit, state.manualTargetId)
        .map(({ path, value }) => [path, value])
    );
    return Object.entries(state.manualDraft.pathValues)
      .some(([path, value]) => original.has(path) && original.get(path) !== value);
  }

  function selectManualTarget(studyUnitId, targetId) {
    if (!state.canEditManually || state.manualSaving) return false;
    if (state.manualUnknownSignature) {
      state.manualDiscardArmed = true;
      state.manualError = "Confirme a mesma gravação ou descarte o pedido incerto antes de mudar de conteúdo.";
      render();
      return false;
    }
    if (state.manualStudyUnitId !== studyUnitId) return beginManualEdit(studyUnitId, targetId);
    if (state.manualTargetId === targetId) return true;
    if (manualDraftChanged()) {
      state.manualError = "Salve ou cancele a edição atual antes de escolher outro conteúdo.";
      render();
      return false;
    }
    const item = manualItem();
    if (!item || (targetId !== "study_unit" &&
        !listManualStudyUnitTargetIds(item.studyUnit).includes(targetId))) return false;
    state.manualTargetId = targetId;
    state.manualDraft = { pathValues: {} };
    state.manualError = "";
    state.manualRestoreFocus = "field";
    render({ captureDraft: false });
    return true;
  }

  function replaceManualItem(current, studyUnit, version) {
    const replacement = normalizeInspectionItem({
      ...current,
      studyUnit,
      version,
      updatedAt: new Date().toISOString()
    }, state.totalCount);
    state.items = state.items.map((item) =>
      item.studyUnit.id === current.studyUnit.id ? replacement : item
    );
    return replacement;
  }

  async function commitManualStudyUnit(current, studyUnit, origin = "manual") {
    const result = await onSaveManualEdit({
      courseId: state.courseId,
      expectedCourseRevision: state.pinnedRevision,
      didacticMicrosequenceId: current.curriculumPath.didacticMicrosequence.id,
      studyUnitId: current.studyUnit.id,
      expectedVersion: current.version,
      studyUnit: structuredClone(studyUnit),
      origin
    });
    if (result != null && (!isPlainObject(result) ||
        result.courseId && result.courseId !== state.courseId ||
        result.studyUnitId && result.studyUnitId !== current.studyUnit.id ||
        result.origin && result.origin !== origin ||
        result.reconciled != null && typeof result.reconciled !== "boolean")) {
      throw new TypeError("A confirmação não corresponde à edição enviada.");
    }
    const confirmedStudyUnit = applyManualStudyUnitEdit(
      result?.studyUnit ?? studyUnit,
      "study_unit",
      { pathValues: {} }
    );
    if (confirmedStudyUnit.id !== current.studyUnit.id) {
      throw new TypeError("A Unidade confirmada não corresponde à edição enviada.");
    }
    const resultVersion = result?.version ?? result?.studyUnitVersion;
    const version = resultVersion == null
      ? current.version + 1
      : natural(resultVersion, "A versão salva da Unidade", { minimum: 1 });
    if (result?.courseRevision != null) {
      state.pinnedRevision = natural(
        result.courseRevision,
        "A revisão salva do Curso",
        { minimum: 1 }
      );
    }
    return {
      item: replaceManualItem(current, confirmedStudyUnit, version),
      reconciled: result?.reconciled !== false
    };
  }

  async function saveManualEdit() {
    if (!state.canEditManually || state.manualSaving) return false;
    const current = manualItem();
    if (!current || !state.manualTargetId) return false;
    captureManualDraft();
    let edited;
    try {
      edited = applyManualStudyUnitEdit(
        current.studyUnit,
        state.manualTargetId,
        state.manualDraft
      );
    } catch (error) {
      state.manualError = error instanceof Error
        ? error.message
        : "A edição não pôde ser validada.";
      state.manualRestoreFocus = "field";
      render({ captureDraft: false });
      return false;
    }
    if (sameStudyUnit(current.studyUnit, edited)) {
      resetManualEditor({ status: "Nenhuma alteração para salvar.", focusEdit: true });
      return true;
    }
    const attemptSignature = JSON.stringify({
      targetId: state.manualTargetId,
      studyUnit: edited,
      origin: state.manualOrigin
    });
    if (state.manualUnknownSignature && state.manualUnknownSignature !== attemptSignature) {
      state.manualDiscardArmed = true;
      state.manualError = "O rascunho mudou depois de uma gravação incerta. Descarte o pedido anterior antes de salvar outra alteração.";
      render({ captureDraft: false });
      return false;
    }
    const before = structuredClone(current.studyUnit);
    state.manualSaving = true;
    state.manualError = "";
    render({ captureDraft: false });
    try {
      const committed = await commitManualStudyUnit(current, edited, state.manualOrigin);
      const saved = committed.item;
      const historyPreview = state.manualHistoryPreview;
      const previewValue = historyPreview
        ? historyPreview.direction === "undo"
          ? historyPreview.entry.before
          : historyPreview.entry.after
        : null;
      const acceptedPreview = previewValue && sameStudyUnit(previewValue, saved.studyUnit);
      if (!acceptedPreview) {
        restoreManualHistoryPreview();
        state.manualUndo.push({
          studyUnitId: saved.studyUnit.id,
          targetId: state.manualTargetId,
          before,
          after: structuredClone(saved.studyUnit)
        });
        if (state.manualUndo.length > 20) state.manualUndo.shift();
        state.manualRedo = [];
      }
      state.manualUnknownSignature = "";
      resetManualEditor({
        status: committed.reconciled
          ? "Edição salva."
          : "Edição salva. A atualização completa ocorrerá na próxima sincronização.",
        focusEdit: true,
        keepHistoryPreview: acceptedPreview
      });
      return true;
    } catch (error) {
      state.manualSaving = false;
      const ambiguous = isAmbiguousManualStudyUnitWriteFailure(error);
      state.manualUnknownSignature = ambiguous ? attemptSignature : "";
      state.manualDiscardArmed = false;
      state.manualError = ambiguous
        ? "Não foi possível confirmar se a edição foi salva. Tente Salvar novamente para consultar o mesmo pedido."
        : error instanceof Error ? error.message : "Não foi possível salvar a edição.";
      state.manualRestoreFocus = "field";
      render({ captureDraft: false });
      return false;
    }
  }

  function moveManualHistory(direction, studyUnitId) {
    if (!state.canEditManually || state.manualSaving) return false;
    const source = direction === "undo" ? state.manualUndo : state.manualRedo;
    const destination = direction === "undo" ? state.manualRedo : state.manualUndo;
    const entry = source.at(-1);
    const current = manualItem(studyUnitId);
    if (!entry || entry.studyUnitId !== studyUnitId || !current) return false;
    if (state.manualStudyUnitId && manualDraftChanged()) {
      state.manualError = "Salve ou cancele a edição atual antes de continuar.";
      render();
      return false;
    }
    const desired = direction === "undo" ? entry.before : entry.after;
    const targetId = entry.targetId || "study_unit";
    const pathValues = Object.fromEntries(
      listManualStudyUnitEditablePaths(desired, targetId)
        .map(({ path, value }) => [path, value])
    );
    source.pop();
    destination.push(entry);
    state.manualHistoryPreview = { direction, entry };
    const opened = beginManualEdit(studyUnitId, targetId, {
      pathValues,
      origin: "manual",
      status: direction === "undo"
        ? "Desfazer preparado. Confira e salve."
        : "Refazer preparado. Confira e salve."
    });
    if (!opened) restoreManualHistoryPreview();
    return opened;
  }

  async function handleClick(event) {
    if (event.target.closest?.(".course-inspection-context-selector")) {
      blockViewportUpdates();
    }
    const contextSummary = event.target.closest?.(
      ".course-inspection-context-selector > summary"
    );
    if (contextSummary) {
      event.preventDefault?.();
      const menu = contextSummary.closest?.("details");
      if (!menu) return false;
      menu.open = !menu.open;
      contextSummary.focus?.({ preventScroll: true });
      return true;
    }
    const previewToggle = event.target.closest?.("[data-inspection-preview-toggle]");
    if (previewToggle) {
      event.preventDefault?.();
      const details = previewToggle.closest?.("[data-inspection-preview]");
      const studyUnitId = String(
        details?.dataset?.inspectionPreview || previewToggle.dataset.inspectionPreviewToggle || ""
      );
      if (!studyUnitId) return false;
      previewToggle.focus?.({ preventScroll: true });
      if (details?.dataset?.inspectionPreviewForced === "true") return true;
      const anchor = captureAnchor();
      const controlKey = `preview:${studyUnitId}`;
      anchor.studyUnitId = studyUnitId;
      anchor.controlKey = controlKey;
      anchor.openControlKeys = (anchor.openControlKeys || [])
        .filter((key) => key !== controlKey);
      if (state.expandedStudyUnitIds.has(studyUnitId)) {
        state.expandedStudyUnitIds.delete(studyUnitId);
      } else {
        keepOnlyExpandedStudyUnit(studyUnitId);
      }
      blockViewportUpdates();
      render({ anchor });
      return true;
    }
    const searchOption = event.target.closest?.("[data-inspection-search-option]");
    if (searchOption) {
      event.preventDefault?.();
      return selectSearchResult(String(searchOption.dataset.inspectionSearchOption || ""));
    }
    const editContent = event.target.closest?.("[data-inspection-edit-content]");
    if (editContent && state.canEditContent) {
      const item = activeItem();
      const kind = String(editContent.dataset.inspectionEditContent || "");
      const ids = item ? {
        course: [state.courseId],
        module: [state.courseId, item.curriculumPath.module.id],
        lesson: [
          state.courseId,
          item.curriculumPath.module.id,
          item.curriculumPath.lesson.id
        ],
        didactic_microsequence: [
          state.courseId,
          item.curriculumPath.module.id,
          item.curriculumPath.lesson.id,
          item.curriculumPath.didacticMicrosequence.id
        ]
      }[kind] : state.emptyScopeContext?.kind === kind
        ? state.emptyScopeContext.entityPath
        : null;
      if (!ids) return false;
      closeOpenMenus();
      try {
        await Promise.resolve(onEditContent({
          kind,
          id: ids.at(-1),
          entityPath: [...ids],
          returnFocusKey: String(editContent.dataset.inspectionControlKey || "")
        }));
        return true;
      } catch (error) {
        state.manualStatus = error instanceof Error
          ? error.message
          : "Não foi possível abrir a edição.";
        render();
        return false;
      }
    }
    const assistanceAction = event.target.closest?.("[data-inspection-assistance-action]");
    if (assistanceAction) {
      return assistanceAction.dataset.inspectionAssistanceAction === "save"
        ? saveAssistanceDraft()
        : discardAssistanceDraft();
    }
    if (state.assistanceDraft) {
      state.assistanceError = "Salve ou descarte a proposta antes de mudar de contexto.";
      render({ captureDraft: false });
      return false;
    }
    const providerTrigger = event.target.closest?.("[data-inspection-provider-assistance]");
    if (providerTrigger) return openProviderAssistance(providerTrigger);
    const mode = event.target.closest?.("[data-inspection-unit-mode]");
    if (mode) {
      const studyUnitId = String(mode.dataset.studyUnitId || "");
      const value = mode.dataset.inspectionUnitMode;
      if (value === "edit") return beginManualEdit(studyUnitId);
      if (value === "view") {
        keepOnlyExpandedStudyUnit(studyUnitId);
        if (state.manualStudyUnitId) {
          resetManualEditor({ status: "Edição cancelada.", focusEdit: false });
        } else {
          const anchor = captureAnchor();
          anchor.studyUnitId = studyUnitId;
          anchor.controlKey = `preview:${studyUnitId}`;
          render({ anchor });
        }
        return true;
      }
    }
    const manualTarget = event.target.closest?.(
      "[data-inspection-manual-target], [data-action='toggle-study-unit-assistance-resource']"
    );
    if (manualTarget) {
      const unit = manualTarget.closest?.("[data-inspection-study-unit]");
      const studyUnitId = String(unit?.dataset?.inspectionStudyUnit || "");
      const targetId = manualTarget.dataset.inspectionManualTarget ||
        manualTarget.dataset.resourceTargetId || "";
      return selectManualTarget(studyUnitId, targetId);
    }
    const manualAction = event.target.closest?.("[data-inspection-manual-action]");
    if (manualAction) {
      const action = manualAction.dataset.inspectionManualAction;
      if (action === "save") return saveManualEdit();
      if (action === "keep-unknown") {
        state.manualDiscardArmed = false;
        state.manualError = "Tente Salvar novamente para confirmar a mesma gravação.";
        state.manualRestoreFocus = "save";
        render();
        return true;
      }
      if (action === "discard-unknown") {
        resetManualEditor({
          status: "Edição descartada.",
          focusEdit: true,
          confirmUnknownDiscard: true
        });
        return true;
      }
      resetManualEditor({ status: "Edição cancelada.", focusEdit: true });
      return true;
    }
    const manualHistory = event.target.closest?.("[data-inspection-manual-history]");
    if (manualHistory) {
      return moveManualHistory(
        manualHistory.dataset.inspectionManualHistory,
        String(manualHistory.dataset.studyUnitId || "")
      );
    }
    const observations = event.target.closest?.("[data-inspection-observations]");
    if (observations) {
      const studyUnitId = String(observations.dataset.studyUnitId || "");
      if (state.observationSheetOpen && state.observationStudyUnitId === studyUnitId) {
        ++observationEpoch;
        state.observationSheetOpen = false;
        state.observationStudyUnitId = null;
        state.observationItems = [];
        state.observationCollectionSummary = null;
        render();
        return true;
      }
      closeOpenMenus();
      return openObservations(studyUnitId);
    }
    const observationAction = event.target.closest?.("[data-observation-action]");
    if (observationAction) {
      const action = observationAction.dataset.observationAction;
      const annotationId = observationAction.dataset.observationId;
      if (action === "cancel-confirmation") {
        cancelConfirmation();
      } else if (action === "confirm-withdraw") {
        return confirmWithdraw();
      } else if (action === "close") {
        ++observationEpoch;
        const studyUnitId = state.observationStudyUnitId;
        const anchor = captureAnchor();
        if (studyUnitId) {
          anchor.studyUnitId = studyUnitId;
          anchor.controlKey = `observations:${studyUnitId}`;
        }
        const preserveCreationDraft = !state.observationEditingId && hasObservationDraft();
        state.observationSheetOpen = false;
        state.observationStudyUnitId = null;
        state.observationItems = [];
        state.observationCollectionSummary = null;
        if (!preserveCreationDraft) state.observationDraft = { category: null, rawText: "" };
        state.observationEditingId = null;
        render({ anchor });
      } else if (action === "edit") {
        const item = state.observationItems.find((candidate) =>
          candidate.annotationId === annotationId);
        if (item?.capabilities?.canRevise) {
          state.observationEditingId = annotationId;
          state.observationDraft = { category: item.category, rawText: item.rawText || "" };
          render();
        }
      } else if (action === "cancel-edit") {
        state.observationEditingId = null;
        state.observationDraft = { category: null, rawText: "" };
        render();
      } else if (action === "withdraw") {
        const item = state.observationItems.find((candidate) =>
          candidate.annotationId === annotationId);
        if (item?.capabilities?.canWithdraw) requestWithdraw(item);
      }
      return true;
    }
    const route = event.target.closest?.("[data-inspection-route]");
    if (route) {
      event.preventDefault?.();
      const unit = route.closest?.("[data-inspection-study-unit]");
      return navigateFromCurrentPoint(route.getAttribute("href"), {
        studyUnitId: String(unit?.dataset?.inspectionStudyUnit || ""),
        controlKey: String(route.dataset?.inspectionControlKey || "")
      });
    }
    const copy = event.target.closest?.("[data-inspection-copy-link]");
    if (copy) {
      const status = root.querySelector?.(".course-inspection-copy-status");
      try {
        if (typeof navigatorValue?.clipboard?.writeText !== "function") {
          throw new Error("Clipboard indisponível.");
        }
        await navigatorValue.clipboard.writeText(copy.dataset.deepLink);
        if (status) status.textContent = "Link copiado.";
      } catch {
        if (status) status.textContent = "Não foi possível copiar o link.";
      }
      return;
    }
    const editSources = event.target.closest?.("[data-inspection-edit-sources]");
    if (editSources) {
      const item = state.items.find(({ studyUnit }) =>
        studyUnit.id === String(editSources.dataset.studyUnitId || ""));
      if (item) {
        closeOpenMenus();
        state.activeStudyUnitId = item.studyUnit.id;
        state.selectedStudyUnitId = item.studyUnit.id;
        await savePositionNow(captureAnchor());
        onEditSources({
          targetKind: "study_unit",
          targetId: item.studyUnit.id,
          targetVersion: item.version,
          targetLabel: item.studyUnit.title,
          ...(editSources.dataset.inspectionControlKey
            ? { returnFocusKey: String(editSources.dataset.inspectionControlKey) }
            : {})
        });
      }
      return;
    }
    const load = event.target.closest?.("[data-inspection-load]");
    if (load) return loadDirection(load.dataset.inspectionLoad);
    const action = event.target.closest?.("[data-inspection-action]")?.dataset?.inspectionAction;
    if (action === "previous" || action === "next") return moveActive(action);
    if (action === "retry") return loadInitial();
    if (action === "start") {
      state.explicitTarget = false;
      state.explicitAnchor = false;
      state.requestedAnchorStudyUnitId = null;
      return onNavigate(buildCourseAuthoringRoute(state.courseId, { section: "content" }));
    }
  }

  function handleChange(event) {
    if (event.target.matches?.("[data-field='study-unit-observation-category']")) {
      state.observationDraft.category = event.target.value || null;
      state.observationDraftStudyUnitId = String(
        event.target.closest?.("[data-observation-composer]")?.dataset?.studyUnitId ||
        state.observationStudyUnitId || state.selectedStudyUnitId || ""
      );
      return;
    }
  }

  async function handleInput(event) {
    if (event.target.matches?.("[data-inspection-search-input]")) {
      return searchCourse(event.target.value);
    }
    if (event.target.matches?.("[data-inspection-manual-title]")) {
      state.manualDraft.pathValues.title = event.target.textContent || "";
      return;
    }
    if (event.target.matches?.("[data-field='study-unit-observation']")) {
      state.observationDraft.rawText = event.target.value;
      state.observationDraftStudyUnitId = String(
        event.target.closest?.("[data-observation-composer]")?.dataset?.studyUnitId ||
        state.observationStudyUnitId || state.selectedStudyUnitId || ""
      );
      const counter = root.querySelector?.("#study-observation-counter");
      if (counter) {
        counter.textContent = formatObservationTextBudget(event.target.value);
        counter.classList?.toggle("is-over-limit", isObservationTextOverLimit(event.target.value));
      }
    }
  }

  function handleSubmit(event) {
    if (!event.target.matches?.("[data-observation-composer]")) return;
    event.preventDefault?.();
    const submittedStudyUnitId = String(
      event.target.dataset?.studyUnitId || state.observationStudyUnitId || state.selectedStudyUnitId || ""
    );
    if (!state.items.some(({ studyUnit }) => studyUnit.id === submittedStudyUnitId)) {
      state.observationError = "A Unidade selecionada não está mais disponível.";
      render();
      return;
    }
    state.observationStudyUnitId = submittedStudyUnitId;
    const rawText = state.observationDraft.rawText;
    const issue = validateStudyUnitObservationText(rawText);
    if (issue) {
      state.observationError = issue;
      state.restoreObservationFocus = true;
      render();
      return;
    }
    const editing = state.observationItems.find(({ annotationId }) =>
      annotationId === state.observationEditingId);
    const operationDraft = editing ? {
      type: "revise_anchored_annotation",
      annotationId: editing.annotationId,
      expectedAnnotationVersion: editing.annotationVersion,
      rawText,
      category: state.observationDraft.category,
      briefSummary: editing.briefSummary
    } : {
      type: "create_anchored_annotation",
      target: { kind: "study_unit", id: submittedStudyUnitId },
      rawText,
      category: state.observationDraft.category,
      briefSummary: null
    };
    const command = pendingObservationMatches(state.pendingObservationMutation, operationDraft)
      ? structuredClone(state.pendingObservationMutation.request.command)
      : editing
        ? operationDraft
        : {
          ...operationDraft,
          annotationId: createUuid(),
          capturedAt: new Date().toISOString(),
        };
    void mutateObservation(
      command,
      editing ? "Observação atualizada." : "Observação adicionada.",
      { operationDraft }
    );
  }

  async function handlePositionSignal(event) {
    const signal = event?.data;
    if (!isPlainObject(signal) || Object.keys(signal).length !== 3 ||
        signal.courseId !== state.courseId || signal.revision !== state.pinnedRevision ||
        typeof signal.studyUnitId !== "string" || state.inspectionFocusId !== null ||
        Date.now() - lastInteractionAt < 1_500 || state.initialLoading || state.loadingDirection ||
        state.manualStudyUnitId) {
      return;
    }
    let position;
    try {
      position = normalizeInspectionPosition(
        await controller.loadAuthoringInspectionPosition(state.courseId),
        state.pinnedRevision
      );
    } catch {
      return;
    }
    if (state.destroyed || !position || position.studyUnitId !== signal.studyUnitId ||
        Date.now() - lastInteractionAt < 1_500) return;
    suppressBroadcastStudyUnitId = position.studyUnitId;
    state.scope = position.scope;
    state.explicitTarget = false;
    state.explicitAnchor = false;
    state.requestedAnchorStudyUnitId = position.studyUnitId;
    await loadInitial({
      anchorStudyUnitId: position.studyUnitId,
      offset: position.offsetFromStickyTop
    });
  }

  function manualItem(studyUnitId = state.manualStudyUnitId) {
    return state.items.find(({ studyUnit }) => studyUnit.id === studyUnitId) || null;
  }

  function captureManualDraft() {
    if (!state.manualStudyUnitId || !state.manualTargetId) return;
    if (state.manualTargetId === "study_unit") {
      const title = root.querySelector?.("[data-inspection-manual-title]");
      if (title) state.manualDraft.pathValues.title = title.textContent || "";
      return;
    }
    const unit = root.querySelector?.(
      `[data-inspection-study-unit="${state.manualStudyUnitId}"]`
    );
    const container = unit?.querySelector?.(".runtime-resource-edit-target.is-inline-editing");
    if (container) state.manualDraft.pathValues = readManualStudyUnitEditPathValues(container);
  }

  function placeManualCaretAtEnd(field) {
    const selection = field?.ownerDocument?.getSelection?.();
    if (!selection || !field?.ownerDocument?.createRange) return;
    const range = field.ownerDocument.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function activateManualEditing() {
    manualInlineController?.destroy?.();
    manualInlineController = null;
    if (!state.manualStudyUnitId || !state.manualTargetId) return;
    const unit = root.querySelector?.(
      `[data-inspection-study-unit="${state.manualStudyUnitId}"]`
    );
    if (!unit) return;
    if (state.manualTargetId === "study_unit") {
      const title = unit.querySelector?.("[data-inspection-manual-title]");
      if (state.manualRestoreFocus === "field") {
        title?.focus?.({ preventScroll: true });
        placeManualCaretAtEnd(title);
        state.manualRestoreFocus = "";
      }
      return;
    }
    const container = unit.querySelector?.(".runtime-resource-edit-target.is-inline-editing");
    if (!container) return;
    manualInlineController = activateManualStudyUnitEdit(container, state.manualDraft);
    if (state.manualRestoreFocus === "field") {
      const field = manualInlineController?.fields?.[0];
      field?.focus?.({ preventScroll: true });
      placeManualCaretAtEnd(field);
      state.manualRestoreFocus = "";
    }
  }

  function hasPendingDraft() {
    const editing = state.observationEditingId
      ? state.observationItems.find(({ annotationId }) =>
          annotationId === state.observationEditingId)
      : null;
    const draftChanged = editing
      ? state.observationDraft.category !== editing.category ||
        state.observationDraft.rawText !== (editing.rawText || "")
      : state.observationDraft.category !== null || state.observationDraft.rawText !== "";
    return Boolean(
      state.pendingObservationMutation || state.confirmation ||
      state.observationSaving || draftChanged || state.manualSaving ||
      state.manualStudyUnitId || manualDraftChanged() || providerAssistance?.opened ||
      state.assistanceDraft || state.assistanceSaving
    );
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  root.addEventListener("input", handleInput);
  root.addEventListener("submit", handleSubmit);
  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("keydown", handleKeyDown);
  root.addEventListener("focusin", handleFocusIn);
  documentValue?.addEventListener?.("click", handleDocumentClick);
  scrollTarget?.addEventListener?.("scroll", onScroll, { passive: true });
  const BroadcastChannelValue = windowValue?.BroadcastChannel;
  if (typeof BroadcastChannelValue === "function") {
    try {
      positionChannel = new BroadcastChannelValue(POSITION_CHANNEL_NAME);
      positionChannel.addEventListener?.("message", handlePositionSignal);
    } catch {
      positionChannel = null;
    }
  }

  return Object.freeze({
    hasPendingDraft,
    async open() {
      let position = returnPosition;
      if (!position && (!routeTarget || routeTarget.kind === "study_unit")) {
        try {
          position = normalizeInspectionPosition(
            await controller.loadAuthoringInspectionPosition(state.courseId)
          );
        } catch {
          position = null;
        }
      }
      const restorePersistedPosition = Boolean(
        position?.scope && position.studyUnitId &&
        (!routeTarget || routeTarget.id === position.studyUnitId)
      );
      if (restorePersistedPosition) {
        state.scope = normalizeScope(position.scope);
        state.requestedAnchorStudyUnitId = canonicalId(
          position.studyUnitId,
          "A Unidade de estudo da posição"
        );
      }
      return loadInitial({
        anchorStudyUnitId: state.requestedAnchorStudyUnitId,
        offset: restorePersistedPosition ? Number(position.offsetFromStickyTop || 0) : 0
      });
    },
    loadMore(direction = "forward") {
      return loadDirection(direction);
    },
    focusControl(controlKey) {
      return restoreControlState({ controlKey });
    },
    previewManualEdit({
      studyUnitId,
      targetId,
      pathValues,
      origin = "provider_assistance"
    } = {}) {
      return previewManualDraft({ studyUnitId, targetId, pathValues, origin });
    },
    async refresh(nextRevision = state.pinnedRevision) {
      const revision = natural(nextRevision, "A revisão do Curso", { minimum: 1 });
      resetFailedCourseSearchIndex();
      const epoch = ++requestEpoch;
      const anchor = captureAnchor();
      const previousRevision = state.pinnedRevision;
      state.stale = true;
      state.loadingDirection = "refresh";
      state.pinnedRevision = revision;
      try {
        let page = await readPage(pageOptions({ anchorStudyUnitId: anchor.studyUnitId }));
        if (state.destroyed || epoch !== requestEpoch) return false;
        if (anchor.studyUnitId && page.items.length === 0 && page.totalCount > 0) {
          if (state.explicitTarget) {
            state.items = [];
            state.totalCount = page.totalCount;
            state.scopeOptions = page.scopeOptions;
            state.targetMissing = true;
            state.stale = false;
            state.loadingDirection = "";
            render({ anchor });
            return false;
          }
          page = await readPage(pageOptions());
          if (state.destroyed || epoch !== requestEpoch) return false;
        }
        state.items = [];
        mergePage(page, "initial");
        state.activeStudyUnitId = page.items.some(({ studyUnit }) => studyUnit.id === anchor.studyUnitId)
          ? anchor.studyUnitId
          : page.items[0]?.studyUnit.id || null;
        if (!hasObservationDraft()) {
          state.selectedStudyUnitId = state.activeStudyUnitId;
          state.observationDraftStudyUnitId = state.activeStudyUnitId;
        }
        state.stale = false;
        state.targetMissing = false;
        state.initialFailure = "";
        state.previousFailure = "";
        state.nextFailure = "";
        state.hydrationFailure = "";
        state.loadingDirection = "";
        render({ anchor });
        return true;
      } catch (error) {
        if (state.destroyed || epoch !== requestEpoch) return false;
        let refreshError = error;
        if (statusMessage(error) === "Ponto não encontrado.") {
          if (state.explicitTarget) {
            state.items = [];
            state.totalCount = 0;
            state.targetMissing = true;
            state.stale = false;
            state.loadingDirection = "";
            render({ anchor });
            return false;
          }
          try {
            let page;
            try {
              page = await readPage(pageOptions());
            } catch (scopeError) {
              if (statusMessage(scopeError) !== "Ponto não encontrado.") throw scopeError;
              state.scope = Object.freeze({ kind: "course", id: null });
              page = await readPage(pageOptions());
            }
            if (state.destroyed || epoch !== requestEpoch) return false;
            state.items = [];
            mergePage(page, "initial");
            state.activeStudyUnitId = page.items[0]?.studyUnit.id || null;
            if (!hasObservationDraft()) {
              state.selectedStudyUnitId = state.activeStudyUnitId;
              state.observationDraftStudyUnitId = state.activeStudyUnitId;
            }
            state.targetMissing = false;
            state.stale = false;
            state.initialFailure = "";
            state.previousFailure = "";
            state.nextFailure = "";
            state.hydrationFailure = "";
            state.loadingDirection = "";
            render({ anchor: { studyUnitId: state.activeStudyUnitId, offsetFromStickyTop: 0 } });
            return true;
          } catch (rebaseError) {
            refreshError = rebaseError;
          }
        }
        state.pinnedRevision = previousRevision;
        state.initialFailure = statusMessage(refreshError);
        state.stale = true;
        state.loadingDirection = "";
        render({ anchor });
        return false;
      }
    },
    snapshot() {
      const anchor = captureAnchor();
      return Object.freeze({
        scope: state.scope,
        studyUnitId: anchor.studyUnitId,
        offsetFromStickyTop: anchor.offsetFromStickyTop,
        courseRevision: state.pinnedRevision,
        itemCount: state.items.length
      });
    },
    savePosition: savePositionNow,
    destroy() {
      if (state.destroyed) return;
      void savePositionNow();
      state.destroyed = true;
      ++requestEpoch;
      observer?.disconnect?.();
      manualInlineController?.destroy?.();
      manualInlineController = null;
      providerAssistance?.destroy?.();
      providerAssistance = null;
      scrollTarget?.removeEventListener?.("scroll", onScroll);
      root.removeEventListener?.("click", handleClick);
      root.removeEventListener?.("change", handleChange);
      root.removeEventListener?.("input", handleInput);
      root.removeEventListener?.("submit", handleSubmit);
      root.removeEventListener?.("pointerdown", handlePointerDown);
      root.removeEventListener?.("keydown", handleKeyDown);
      root.removeEventListener?.("focusin", handleFocusIn);
      documentValue?.removeEventListener?.("click", handleDocumentClick);
      positionChannel?.removeEventListener?.("message", handlePositionSignal);
      positionChannel?.close?.();
      positionChannel = null;
      cancelScrollFrame();
    }
  });
}
