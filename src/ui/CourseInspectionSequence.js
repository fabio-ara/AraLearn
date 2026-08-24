import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import {
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { renderPackageStudyUnitBlocksWithDock } from
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

const PAGE_CONTRACT = "aralearn.course-study-unit-inspection-page.v1";
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
const INSPECTION_MENU_SELECTOR =
  "details.course-inspection-context-selector, details.course-inspection-item-details";
const PART_STATES = new Set([
  "planned", "materializing", "attention_required", "partially_materialized", "materialized"
]);
const SCOPE_KINDS = new Set([
  "course", "authoring_part", "unassigned", "module", "lesson", "didactic_microsequence"
]);

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
  exactRecord(value, ["kind", "id"], "O escopo da Inspeção é inválido.");
  const kind = String(value.kind || "");
  const id = value.id == null ? null : canonicalId(value.id, "A identidade do escopo", {
    uuid: kind === "authoring_part"
  });
  if (!SCOPE_KINDS.has(kind) || ((kind === "course" || kind === "unassigned") !== (id === null))) {
    throw new TypeError("O escopo da Inspeção é inválido.");
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
    "As opções de escopo da Inspeção são inválidas."
  );
  if (!Array.isArray(value.authoringParts) || value.authoringParts.length > 64) {
    throw new TypeError("As opções de Parte da Inspeção são inválidas.");
  }
  const parts = value.authoringParts.map((part, index) => normalizePart(part, `A Parte ${index + 1}`));
  if (new Set(parts.map(({ id }) => id)).size !== parts.length ||
      parts.some((part, index) => part.position !== index)) {
    throw new TypeError("A ordem das Partes da Inspeção é inválida.");
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
    "Uma Unidade de estudo da Inspeção é inválida."
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

function normalizeInspectionItem(value, totalCount) {
  exactRecord(
    value,
    ["studyUnit", "version", "updatedAt", "ordinal", "curriculumPath", "authoringPart", "deepLink"],
    "Um item da Inspeção é inválido."
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
    deepLink
  });
}

function normalizeCursor(value, expected) {
  if (!expected) {
    if (value != null) throw new TypeError("O cursor da Inspeção é inconsistente.");
    return null;
  }
  exactRecord(value, ["studyUnitId"], "O cursor da Inspeção é inválido.");
  return Object.freeze({
    studyUnitId: canonicalId(value.studyUnitId, "A Unidade de estudo do cursor")
  });
}

export function normalizeCourseInspectionPage(value, {
  expectedCourseId = "",
  expectedRevision = null,
  expectedScope = null
} = {}) {
  const topLevelFields = [
    "contract", "courseId", "courseRevision", "scope", "totalCount", "scopeOptions", "items",
    "hasPrevious", "hasMore", "previousCursor", "nextCursor", "pageBytes",
    "offline", "stale", "offlineKnown"
  ];
  exactRecord(value, topLevelFields, "A página da Inspeção é inválida.");
  if (value.contract !== PAGE_CONTRACT || !Array.isArray(value.items) ||
      value.items.length > MAX_PAGE_SIZE || typeof value.hasPrevious !== "boolean" ||
      typeof value.hasMore !== "boolean") {
    throw new TypeError("A página da Inspeção é inválida.");
  }
  const courseId = canonicalId(value.courseId, "A identidade do Curso", { uuid: true });
  const courseRevision = natural(value.courseRevision, "A revisão do Curso", { minimum: 1 });
  const totalCount = natural(value.totalCount, "A quantidade de Unidades de estudo");
  const scope = normalizeScope(value.scope);
  if ((expectedCourseId && courseId !== expectedCourseId) ||
      (expectedRevision !== null && courseRevision !== expectedRevision) ||
      (expectedScope && !sameScope(scope, expectedScope))) {
    const error = new Error("O Curso mudou durante a Inspeção.");
    error.code = "course_revision_changed";
    throw error;
  }
  const items = value.items.map((item) => normalizeInspectionItem(item, totalCount));
  if (new Set(items.map(({ studyUnit }) => studyUnit.id)).size !== items.length ||
      items.some((item, index) => index > 0 && item.ordinal !== items[index - 1].ordinal + 1)) {
    throw new TypeError("A ordem da página da Inspeção é inválida.");
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
    offlineKnown: value.offline === true || value.stale === true || value.offlineKnown === true
  });
}

export function inspectionRequestFromTarget(target) {
  if (!target) return Object.freeze({ scope: Object.freeze({ kind: "course", id: null }), anchorStudyUnitId: null });
  if (target.kind === "study_unit") {
    return Object.freeze({
      scope: Object.freeze({ kind: "course", id: null }),
      anchorStudyUnitId: target.id
    });
  }
  if (!SCOPE_KINDS.has(target.kind)) throw new TypeError("O alvo da Inspeção é inválido.");
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
  return "Não foi possível carregar este trecho da Inspeção.";
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

function partStateLabel(value) {
  return ({
    planned: "Planejada",
    materializing: "Em materialização",
    attention_required: "Requer atenção",
    partially_materialized: "Parcialmente materializada",
    materialized: "Materializada"
  })[value] || "Materializada";
}

function scopeLabel(scope, scopeOptions) {
  if (scope.kind === "course") return "Todas as Partes";
  if (scope.kind === "unassigned") return "Sem Parte";
  if (scope.kind === "authoring_part") {
    return scopeOptions?.authoringParts.find(({ id }) => id === scope.id)?.title || "Parte";
  }
  return "Escopo curricular";
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
  return buildCourseAuthoringRoute(courseId, { section: "inspection", ...options });
}

function renderScopeSelect(state) {
  const currentValue = `${state.scope.kind}:${state.scope.id || ""}`;
  const options = [{ value: "course:", label: "Todas as Partes" },
    ...state.scopeOptions.authoringParts.map((part) => ({
      value: `authoring_part:${part.id}`,
      label: part.title
    })),
    ...(state.scopeOptions.unassignedStudyUnitCount > 0
      ? [{ value: "unassigned:", label: "Sem Parte" }]
      : [])];
  if (!options.some(({ value }) => value === currentValue)) {
    options.unshift({ value: currentValue, label: scopeLabel(state.scope, state.scopeOptions) });
  }
  return '<label class="course-inspection-part-filter"><span>Parte</span>' +
    '<select data-inspection-scope data-inspection-control-key="scope" aria-label="Filtrar por Parte">' +
    `${options.map((option) =>
      `<option value="${escapeHtml(option.value)}"${option.value === currentValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    ).join("")}</select></label>`;
}

function renderContext(state, item) {
  if (!item) {
    return '<span class="course-inspection-context-copy" data-inspection-context-summary>' +
      'Nenhuma Unidade de estudo</span>';
  }
  const path = item.curriculumPath;
  return '<details class="course-inspection-context-selector"><summary data-inspection-control-key="context">' +
    '<span class="course-inspection-context-copy"><small data-inspection-context-parent>' +
    `${escapeHtml(path.module.title)} · ${escapeHtml(path.lesson.title)}</small>` +
    `<strong data-inspection-context-summary>${escapeHtml(path.didacticMicrosequence.title)}</strong>` +
    `<span data-inspection-context-position>${item.ordinal}/${state.totalCount}</span></span></summary>` +
    '<nav aria-label="Escopos do ponto atual">' +
    `<a href="${escapeHtml(routeForPath(state.courseId, "module", path.module.id))}" data-inspection-route` +
    ` data-inspection-context-module>Este Módulo</a>` +
    `<a href="${escapeHtml(routeForPath(state.courseId, "lesson", path.lesson.id))}" data-inspection-route` +
    ` data-inspection-context-lesson>Esta Lição</a>` +
    `<a href="${escapeHtml(routeForPath(state.courseId, "didactic_microsequence", path.didacticMicrosequence.id))}"` +
    ` data-inspection-route data-inspection-context-microsequence>Esta Microssequência</a>` +
    `<a href="${escapeHtml(routeForPath(state.courseId, "study_unit", item.studyUnit.id))}" data-inspection-route` +
    ` data-inspection-context-study-unit>Esta Unidade</a></nav></details>`;
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
  const canUndo = state.manualUndo.at(-1)?.studyUnitId === item.studyUnit.id && !state.manualSaving;
  const canRedo = state.manualRedo.at(-1)?.studyUnitId === item.studyUnit.id && !state.manualSaving;
  return '<nav class="course-inspection-mode-actions" role="group" aria-label="Modo da Unidade de estudo">' +
    `<button type="button" data-inspection-unit-mode="view" data-study-unit-id="${id}"` +
    ` aria-pressed="${editing ? "false" : "true"}" aria-label="Visualizar" title="Visualizar"` +
    `${state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon("preview", "course-authoring-button-icon")}</button>` +
    (state.canEditManually
      ? `<button type="button" data-inspection-unit-mode="edit" data-study-unit-id="${id}"` +
        ` aria-pressed="${editing ? "true" : "false"}" aria-label="Editar" title="Editar"` +
        `${state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
        `${renderUiIcon("edit", "course-authoring-button-icon")}</button>`
      : "") +
    (state.canRequestChat
      ? `<button type="button" data-inspection-unit-mode="ai" data-study-unit-id="${id}"` +
        " data-inspection-request-chat" +
        ` aria-pressed="false" aria-label="Trabalhar com o ChatGPT sobre ${escapeHtml(item.studyUnit.title)}"` +
        ' title="Assistência pelo ChatGPT">' +
        `${renderUiIcon("prompt", "course-authoring-button-icon")}</button>`
      : "") +
    (state.canUseProviderAssistance
      ? `<button type="button" data-inspection-provider-assistance data-study-unit-id="${id}"` +
        ` aria-pressed="${state.assistanceActiveStudyUnitId === item.studyUnit.id}"` +
        ' aria-label="Assistência por API" title="Assistência por API"' +
        `${state.manualSaving || state.assistanceSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
        `${renderUiIcon("prompt", "course-authoring-button-icon")}</button>`
      : "") +
    (state.canEditManually
      ? `<button type="button" data-inspection-manual-history="undo" data-study-unit-id="${id}"` +
        ` aria-label="Desfazer última edição" title="Desfazer"${canUndo ? "" : " disabled aria-disabled=\"true\""}>` +
        `${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button>` +
        `<button type="button" data-inspection-manual-history="redo" data-study-unit-id="${id}"` +
        ` aria-label="Refazer edição" title="Refazer"${canRedo ? "" : " disabled aria-disabled=\"true\""}>` +
        `${renderUiIcon("arrow-right", "course-authoring-button-icon")}</button>`
      : "") +
    "</nav>";
}

function renderAssistanceDraftDock(item, state) {
  if (state.assistanceDraft?.studyUnitId !== item.studyUnit.id) return "";
  return '<footer class="course-inspection-manual-dock" aria-label="Rascunho da Assistência por API">' +
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
  const runtime = renderPackageStudyUnitBlocksWithDock(item.studyUnit, {
    omitRepeatedHeading: true,
    blockKeyPrefix: `inspection:${item.studyUnit.id}`,
    resourceSelectionEnabled: editing,
    resourceSelectionDisabled: state.manualSaving,
    resourceSelectionTargetIds: resourceTargetIds,
    selectedResourceTargetIds,
    manualEditingTargetId: editing && selectedResourceTargetIds.length
      ? state.manualTargetId
      : ""
  });
  const part = item.authoringPart;
  return `<li class="course-inspection-item" data-inspection-study-unit="${escapeHtml(item.studyUnit.id)}"` +
    ` data-inspection-ordinal="${item.ordinal}" aria-posinset="${item.ordinal}" aria-setsize="${totalCount}">` +
    `<article aria-labelledby="inspection-study-unit-${escapeHtml(item.studyUnit.id)}">` +
    '<header class="course-inspection-item-heading"><div>' +
    `<p>${escapeHtml(path.module.title)} · ${escapeHtml(path.lesson.title)}</p>` +
    `<span>${escapeHtml(path.didacticMicrosequence.title)} · Unidade ${item.ordinal} de ${totalCount}</span>` +
    `${renderManualTitle(item, state, editing, state.manualTargetId)}</div>` +
    `<details class="course-inspection-item-details"><summary aria-label="Abrir detalhes de ${escapeHtml(item.studyUnit.title)}"` +
    ` title="Abrir detalhes" data-inspection-control-key="details:${escapeHtml(item.studyUnit.id)}">` +
    `${renderUiIcon("more", "course-authoring-button-icon")}</summary>` +
    '<div class="course-inspection-item-detail-panel"><dl>' +
    `<div><dt>Módulo</dt><dd>${escapeHtml(path.module.title)}</dd></div>` +
    `<div><dt>Lição</dt><dd>${escapeHtml(path.lesson.title)}</dd></div>` +
    `<div><dt>Microssequência</dt><dd>${escapeHtml(path.didacticMicrosequence.title)}</dd></div>` +
    `<div><dt>Parte</dt><dd>${escapeHtml(part?.title || "Sem Parte")}</dd></div>` +
    `<div><dt>Versão</dt><dd>${item.version}</dd></div></dl>` +
    `<button type="button" data-inspection-copy-link data-deep-link="${escapeHtml(item.deepLink)}"` +
    ` data-inspection-control-key="copy:${escapeHtml(item.studyUnit.id)}">` +
    `${renderUiIcon("copy", "course-authoring-button-icon")}<span>Copiar link</span></button>` +
    (state.canEditSources
      ? `<button type="button" data-inspection-edit-sources data-study-unit-id="${escapeHtml(item.studyUnit.id)}"` +
        ` data-inspection-control-key="sources:${escapeHtml(item.studyUnit.id)}">` +
        `${renderUiIcon("study", "course-authoring-button-icon")}<span>Definir fontes</span></button>`
      : "") +
    "</div></details></header>" +
    '<div class="course-inspection-item-actions" aria-label="Ações contextuais">' +
    renderManualModeActions(item, state, editing) +
    `<button type="button" data-inspection-observations data-study-unit-id="${escapeHtml(
      item.studyUnit.id
    )}" data-inspection-control-key="observations:${escapeHtml(item.studyUnit.id)}">` +
    `${renderUiIcon("prompt", "course-authoring-button-icon")}<span>Observações${
      observationCount === null ? "" : ` · ${Number(observationCount)}`
    }</span></button>` +
    "</div>" +
    (runtime.dockHtml
      ? '<p class="course-inspection-response-notice">Respostas desativadas durante a inspeção.</p>'
      : "") +
    '<div class="runtime-card-rendered-content course-inspection-runtime">' +
    `<div class="card-sheet-content">${runtime.bodyHtml}</div>${runtime.dockHtml}</div>` +
    renderManualEditDock(item, state, editing, resourceTargetIds) +
    renderAssistanceDraftDock(item, state) +
    `<footer><span>${escapeHtml(part ? partStateLabel(part.state) : "Materializada")}</span>` +
    `<small>Unidade ${item.ordinal}</small></footer></article></li>`;
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
  if (!state.observationStudyUnitId) return "";
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
    canonicalHref: buildCourseAuthoringRoute(state.courseId, { section: "observations" })
  });
  const confirmation = renderInspectionConfirmation(state);
  if (!confirmation) return sheet;
  const inactiveSheet = sheet.replace(
    '<section class="editor-overlay study-observation-overlay"',
    '<section class="editor-overlay study-observation-overlay" inert aria-hidden="true"'
  );
  return `${inactiveSheet}${confirmation}`;
}

function renderSequence(state) {
  const active = state.items.find(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId) ||
    state.items[0] || null;
  const beforeCount = state.items.length ? Math.max(0, state.items[0].ordinal - 1) : 0;
  const afterCount = state.items.length
    ? Math.max(0, state.totalCount - state.items[state.items.length - 1].ordinal)
    : 0;
  const notice = state.offlineKnown
    ? '<p class="course-authoring-notice" role="status">Sem conexão · exibindo Unidades de estudo salvas neste dispositivo.</p>'
    : state.initialFailure && state.items.length > 0
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.initialFailure)}</p>`
      : state.stale
        ? '<p class="course-authoring-notice" role="status">O Curso mudou. Mantendo seu ponto…</p>'
        : state.hydrationFailure
          ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.hydrationFailure)}</p>`
          : "";
  let body;
  if (state.initialLoading && state.items.length === 0) {
    body = '<p class="course-authoring-loading" role="status">Carregando inspeção…</p>';
  } else if (state.targetMissing) {
    body = '<section class="course-authoring-state is-error" role="alert">' +
      `${renderUiIcon("remove-state", "course-authoring-state-icon")}<h3>Ponto não encontrado</h3>` +
      '<p>Esta identidade não pertence mais à Inspeção corrente.</p>' +
      '<button type="button" data-inspection-action="start">Ir ao início da inspeção</button></section>';
  } else if (state.initialFailure && state.items.length === 0) {
    body = '<section class="course-authoring-state is-error" role="alert">' +
      `${renderUiIcon("remove-state", "course-authoring-state-icon")}<h3>Inspeção indisponível</h3>` +
      `<p>${escapeHtml(state.initialFailure)}</p>` +
      '<button type="button" data-inspection-action="retry">Tentar novamente</button></section>';
  } else if (state.items.length === 0) {
    const partScope = state.scope.kind === "authoring_part";
    body = '<section class="course-authoring-state is-empty" role="status">' +
      `${renderUiIcon("folder", "course-authoring-state-icon")}<h3>${partScope
        ? "Parte sem Unidades de estudo"
        : "Nenhuma Unidade de estudo materializada"}</h3>` +
      `<p>${partScope ? "Esta Parte ainda não tem Unidades de estudo." :
        "Este escopo ainda não possui materialização para inspecionar."}</p></section>`;
  } else {
    body = '<ol class="course-inspection-sequence" aria-label="Sequência vertical de inspeção">' +
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
    ' aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div>' +
    '<h2 id="course-authoring-section-title">Inspeção</h2>' +
    `<p>${state.totalCount} ${state.totalCount === 1 ? "Unidade de estudo" : "Unidades de estudo"}</p></div>` +
    (state.scopeOptions ? renderScopeSelect(state) : "") + "</header>" +
    `<nav class="course-inspection-sticky-context" aria-label="Navegação na Inspeção">` +
    `<button type="button" data-inspection-action="previous" data-inspection-control-key="previous"` +
    `${!active || (active.ordinal <= 1 && !state.hasPrevious) ? " disabled aria-disabled=\"true\"" : ""}` +
    ` aria-label="Unidade anterior">${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button>` +
    `<div class="course-inspection-active-context">${renderContext(state, active)}</div>` +
    `<button type="button" data-inspection-action="next" data-inspection-control-key="next"` +
    `${!active || (active.ordinal >= state.totalCount && !state.hasMore) ? " disabled aria-disabled=\"true\"" : ""}` +
    ` aria-label="Próxima Unidade">${renderUiIcon("arrow-right", "course-authoring-button-icon")}</button></nav>` +
    notice + body + '<p class="course-inspection-copy-status" role="status" aria-live="polite">' +
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

function parseScopeSelection(value) {
  const source = String(value || "");
  const separator = source.indexOf(":");
  if (separator < 0) throw new TypeError("Escopo selecionado inválido.");
  const kind = source.slice(0, separator);
  const rawId = source.slice(separator + 1);
  return normalizeScope({ kind, id: rawId || null });
}

function normalizeInspectionPosition(value, expectedCourseRevision = null) {
  if (value == null) return null;
  exactRecord(
    value,
    ["scope", "studyUnitId", "offsetFromStickyTop", "courseRevision"],
    "A posição local da Inspeção é inválida."
  );
  const offset = Number(value.offsetFromStickyTop);
  const courseRevision = natural(value.courseRevision, "A revisão da posição local", { minimum: 1 });
  if (!Number.isFinite(offset) || Math.abs(offset) > 100_000 ||
      (expectedCourseRevision !== null && courseRevision !== expectedCourseRevision)) {
    throw new TypeError("A posição local da Inspeção é inválida.");
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
  onNavigate = () => {},
  onEditSources = () => {},
  onRequestChat = null,
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
      (onRequestChat !== null && typeof onRequestChat !== "function") ||
      (onSaveManualEdit !== null && typeof onSaveManualEdit !== "function") ||
      (providerAssistanceSession !== null &&
       (typeof providerAssistanceSession?.read !== "function" ||
        typeof providerAssistanceSession?.update !== "function" ||
        typeof providerAssistanceSession?.snapshot !== "function"))) {
    throw new TypeError("Dependências da sequência de Inspeção são inválidas.");
  }
  const scrollTarget = root.closest?.(".course-authoring-root") || windowValue;
  const requested = inspectionRequestFromTarget(routeTarget);
  const state = {
    courseId: course.courseId,
    pinnedRevision: course.revision,
    canEditSources: course.ownership === "owned" && course.canEdit === true,
    canRequestChat: typeof onRequestChat === "function",
    canEditManually: course.ownership === "owned" && course.canEdit === true &&
      typeof onSaveManualEdit === "function",
    canUseProviderAssistance: course.ownership === "owned" && course.canEdit === true &&
      typeof onSaveManualEdit === "function" &&
      typeof controller.loadCourseDocument === "function",
    scope: requested.scope,
    explicitTarget: Boolean(routeTarget),
    explicitAnchor: routeTarget?.kind === "study_unit",
    requestedAnchorStudyUnitId: requested.anchorStudyUnitId,
    items: [],
    totalCount: 0,
    scopeOptions: Object.freeze({ authoringParts: Object.freeze([]), unassignedStudyUnitCount: 0 }),
    hasPrevious: false,
    hasMore: false,
    previousCursor: null,
    nextCursor: null,
    averageHeight: 320,
    activeStudyUnitId: requested.anchorStudyUnitId,
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
    destroyed: false
  };
  let observer = null;
  let scrollFrame = null;
  let saveTimer = null;
  let requestEpoch = 0;
  let positionChannel = null;
  let lastInteractionAt = 0;
  let suppressBroadcastStudyUnitId = "";
  let observationEpoch = 0;
  let manualInlineController = null;
  let providerAssistance = null;

  function markInteraction() {
    lastInteractionAt = Date.now();
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
    if (state.confirmation &&
        event?.target?.matches?.("[data-inspection-confirmation-backdrop]")) {
      cancelConfirmation();
    }
    const containingMenu = event?.target?.closest?.(INSPECTION_MENU_SELECTOR) || null;
    closeOpenMenus({ except: containingMenu });
  }

  function handleKeyDown(event) {
    markInteraction();
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
    const threshold = stickyTop() + 8;
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

  function restoreAnchor(snapshot, { initial = false } = {}) {
    const id = snapshot?.studyUnitId || state.activeStudyUnitId;
    if (!id) return;
    const escapedId = globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id.replace(/["\\]/gu, "\\$&");
    const element = root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`);
    if (!element?.getBoundingClientRect) return;
    const delta = element.getBoundingClientRect().top - stickyTop() - Number(snapshot?.offsetFromStickyTop || 0);
    if ((initial || Math.abs(delta) > 0.5) && typeof scrollTarget?.scrollBy === "function") {
      scrollTarget.scrollBy({ top: delta, left: 0, behavior: "auto" });
    }
    for (const controlKey of snapshot?.openControlKeys || []) {
      const escapedOpenKey = globalThis.CSS?.escape
        ? globalThis.CSS.escape(controlKey)
        : controlKey.replace(/["\\]/gu, "\\$&");
      const control = root.querySelector?.(
        `[data-inspection-control-key="${escapedOpenKey}"]`
      );
      const details = control?.closest?.("details");
      if (details) details.open = true;
    }
    if (snapshot?.controlKey) {
      const escapedKey = globalThis.CSS?.escape
        ? globalThis.CSS.escape(snapshot.controlKey)
        : snapshot.controlKey.replace(/["\\]/gu, "\\$&");
      root.querySelector?.(`[data-inspection-control-key="${escapedKey}"]`)?.focus?.({ preventScroll: true });
    }
  }

  function measureItems() {
    const heights = [...(root.querySelectorAll?.("[data-inspection-study-unit]") || [])]
      .map((element) => element.getBoundingClientRect?.().height || 0)
      .filter((height) => height > 0);
    if (heights.length) {
      state.averageHeight = Math.max(120, Math.min(1_600,
        heights.reduce((sum, height) => sum + height, 0) / heights.length + 12));
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

  async function hydrate() {
    try {
      deactivateResponses();
      await RESOURCE_PACKAGE_REGISTRY.hydrate(root);
      if (state.destroyed) return;
      activateManualEditing();
      deactivateResponses();
      measureItems();
      observeBoundaries();
    } catch {
      if (state.destroyed) return;
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
    if (captureDraft) captureManualDraft();
    const snapshot = anchor || captureAnchor();
    const restoreObservationFocus = state.restoreObservationFocus;
    state.restoreObservationFocus = false;
    manualInlineController?.destroy?.();
    manualInlineController = null;
    root.innerHTML = renderSequence(state);
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
    void hydrate().then(() => {
      if (restorePosition) restoreAnchor(snapshot, { initial });
      updateActiveFromViewport();
      if (!restorePosition && scrollTarget && "scrollTop" in scrollTarget) {
        scrollTarget.scrollTop = 0;
      }
    });
  }

  function mergePage(page, direction) {
    if (page.totalCount !== state.totalCount && state.items.length > 0) {
      throw new TypeError("A quantidade da Inspeção mudou sem nova revisão.");
    }
    const items = new Map(state.items.map((item) => [item.studyUnit.id, item]));
    page.items.forEach((item) => items.set(item.studyUnit.id, item));
    const ordered = [...items.values()].sort((left, right) => left.ordinal - right.ordinal);
    if (ordered.some((item, index) => index > 0 && item.ordinal !== ordered[index - 1].ordinal + 1)) {
      throw new TypeError("As páginas da Inspeção não são contíguas.");
    }
    while (ordered.length > MAX_WINDOW_ITEMS) {
      if (direction === "backward") ordered.pop();
      else ordered.shift();
    }
    if (state.activeStudyUnitId &&
        !ordered.some(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId)) {
      state.activeStudyUnitId = direction === "backward"
        ? ordered[ordered.length - 1]?.studyUnit.id || null
        : ordered[0]?.studyUnit.id || null;
    }
    state.items = ordered;
    state.totalCount = page.totalCount;
    state.scopeOptions = page.scopeOptions;
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
        expectedScope: state.scope
      }
    );
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
      const activeTotal = Object.entries(summary.byState)
        .filter(([annotationState]) => annotationState !== "withdrawn")
        .reduce((total, [, count]) => total + count, 0);
      if (items.length === MAX_ANNOTATIONS_PER_TARGET || !page.hasMore) {
        return {
          items,
          matchingTotal: summary.matchingTotal,
          activeTotal,
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
    const epoch = ++observationEpoch;
    state.observationStudyUnitId = studyUnitId;
    state.observationItems = [];
    state.observationCollectionSummary = null;
    state.observationDraft = { category: null, rawText: "" };
    state.observationEditingId = null;
    state.observationError = "";
    state.observationLoading = true;
    render();
    try {
      const observations = await loadTargetObservations(studyUnitId);
      if (state.destroyed || epoch !== observationEpoch) return false;
      state.observationItems = observations.items;
      state.observationCollectionSummary = observations;
      state.observationCounts[studyUnitId] = observations.activeTotal;
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
      state.observationEditingId = null;
      const observations = await loadTargetObservations(studyUnitId);
      state.observationItems = observations.items;
      state.observationCollectionSummary = observations;
      state.observationCounts[studyUnitId] = observations.activeTotal;
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
      state.activeStudyUnitId = page.items.some(({ studyUnit }) => studyUnit.id === anchorStudyUnitId)
        ? anchorStudyUnitId
        : page.items[0]?.studyUnit.id || null;
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
          anchor: { studyUnitId: state.activeStudyUnitId || anchorStudyUnitId, offsetFromStickyTop: offset },
          initial: true,
          restorePosition: hasRequestedPosition
        });
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

  function activeItem() {
    return state.items.find(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId) ||
      state.items[0] || null;
  }

  function updateActiveFromViewport() {
    scrollFrame = null;
    if (state.destroyed || state.items.length === 0) return;
    const threshold = stickyTop() + 8;
    const elements = [...(root.querySelectorAll?.("[data-inspection-study-unit]") || [])];
    const current = elements.find((element) => element.getBoundingClientRect().bottom > threshold) ||
      elements[elements.length - 1];
    const id = current?.dataset?.inspectionStudyUnit;
    if (!id || id === state.activeStudyUnitId) return;
    state.activeStudyUnitId = id;
    const item = activeItem();
    const position = root.querySelector?.("[data-inspection-context-position]");
    const parent = root.querySelector?.("[data-inspection-context-parent]");
    const summary = root.querySelector?.("[data-inspection-context-summary]");
    if (position) position.textContent = `${item.ordinal}/${state.totalCount}`;
    if (parent) parent.textContent = `${item.curriculumPath.module.title} · ${item.curriculumPath.lesson.title}`;
    if (summary) summary.textContent = item.curriculumPath.didacticMicrosequence.title;
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
      ["[data-inspection-context-module]", "module", item.curriculumPath.module.id],
      ["[data-inspection-context-lesson]", "lesson", item.curriculumPath.lesson.id],
      ["[data-inspection-context-microsequence]", "didactic_microsequence",
        item.curriculumPath.didacticMicrosequence.id],
      ["[data-inspection-context-study-unit]", "study_unit", item.studyUnit.id]
    ];
    links.forEach(([selector, kind, id]) => {
      root.querySelector?.(selector)?.setAttribute?.("href", routeForPath(state.courseId, kind, id));
    });
    scheduleSave();
  }

  function onScroll() {
    markInteraction();
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
    const delta = direction === "next" ? 1 : -1;
    let target = state.items.find((item) => item.ordinal === current.ordinal + delta);
    if (!target) {
      await loadDirection(direction === "next" ? "forward" : "backward");
      target = state.items.find((item) => item.ordinal === current.ordinal + delta);
    }
    if (!target) return false;
    state.activeStudyUnitId = target.studyUnit.id;
    const escapedId = globalThis.CSS?.escape
      ? globalThis.CSS.escape(target.studyUnit.id)
      : target.studyUnit.id.replace(/["\\]/gu, "\\$&");
    const element = root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`);
    const reducedMotion = windowValue?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    element?.scrollIntoView?.({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
    scheduleSave();
    return true;
  }

  async function navigateFromCurrentPoint(route) {
    updateActiveFromViewport();
    const returnItem = activeItem();
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
          section: "inspection",
          studyUnitId: returnItem.studyUnit.id
        })
      : null;
    return onNavigate(route, { returnTo });
  }

  async function navigateScope(scope) {
    const route = buildCourseAuthoringRoute(state.courseId, {
      section: "inspection",
      ...scopeRouteOptions(scope)
    });
    return navigateFromCurrentPoint(route);
  }

  function requestChatForItem(item) {
    if (!item || typeof onRequestChat !== "function") return false;
    const path = item.curriculumPath;
    try {
      Promise.resolve(onRequestChat({
        target: {
          type: "study_unit",
          id: item.studyUnit.id,
          title: item.studyUnit.title,
          path: [
            path.module.title,
            path.lesson.title,
            path.didacticMicrosequence.title,
            item.studyUnit.title
          ]
        },
        action: "correct_study_unit",
        instruction: "Revise esta Unidade de estudo comigo. Aponte problemas antes de propor qualquer correção e limite eventuais alterações a este alvo.",
        deepLink: item.deepLink
      })).catch(() => {});
    } catch {
      // O integrador apresenta a própria falha sem interromper a Inspeção.
    }
    return true;
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

  function providerPreviewFocus(studyUnitId) {
    const escapedId = windowValue?.CSS?.escape
      ? windowValue.CSS.escape(studyUnitId)
      : studyUnitId.replace(/["\\]/gu, "\\$&");
    const unit = root.querySelector?.(
      `[data-inspection-study-unit="${escapedId}"]`
    );
    return unit?.querySelector?.("h3") || unit;
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
        onFocusPreview: () => providerPreviewFocus(studyUnitId),
        onPreview: (prepared) => {
          replaceManualItem(baselineItem, prepared.candidate, baselineItem.version);
          render({ captureDraft: false });
        },
        onDiscardPreview: () => {
          replaceManualItem(baselineItem, baselineItem.studyUnit, baselineItem.version);
          render({ captureDraft: false });
        },
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
        if (state.manualStudyUnitId) {
          resetManualEditor({ status: "Edição cancelada.", focusEdit: false });
        }
        return true;
      }
      if (value === "ai") {
        if (state.manualStudyUnitId && manualDraftChanged()) {
          state.manualError = "Salve ou cancele a edição atual antes de abrir o ChatGPT.";
          render();
          return false;
        }
        if (state.manualStudyUnitId) resetManualEditor();
        return requestChatForItem(manualItem(studyUnitId));
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
    const requestChat = event.target.closest?.("[data-inspection-request-chat]");
    if (requestChat) {
      const item = state.items.find(({ studyUnit }) =>
        studyUnit.id === String(requestChat.dataset.studyUnitId || ""));
      return requestChatForItem(item);
    }
    const observations = event.target.closest?.("[data-inspection-observations]");
    if (observations) {
      const studyUnitId = String(observations.dataset.studyUnitId || "");
      if (state.observationStudyUnitId === studyUnitId) {
        ++observationEpoch;
        state.observationStudyUnitId = null;
        state.observationItems = [];
        state.observationCollectionSummary = null;
        render();
        return true;
      }
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
        state.observationStudyUnitId = null;
        state.observationItems = [];
        state.observationCollectionSummary = null;
        state.observationDraft = { category: null, rawText: "" };
        state.observationEditingId = null;
        render();
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
      return navigateFromCurrentPoint(route.getAttribute("href"));
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
        onEditSources({
          targetKind: "study_unit",
          targetId: item.studyUnit.id,
          targetVersion: item.version,
          targetLabel: item.studyUnit.title
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
      return onNavigate(buildCourseAuthoringRoute(state.courseId, { section: "inspection" }));
    }
  }

  function handleChange(event) {
    if (event.target.matches?.("[data-field='study-unit-observation-category']")) {
      state.observationDraft.category = event.target.value || null;
      return;
    }
    if (event.target.matches?.("[data-inspection-scope]")) {
      void navigateScope(parseScopeSelection(event.target.value));
    }
  }

  function handleInput(event) {
    if (event.target.matches?.("[data-inspection-manual-title]")) {
      state.manualDraft.pathValues.title = event.target.textContent || "";
      return;
    }
    if (event.target.matches?.("[data-field='study-unit-observation']")) {
      state.observationDraft.rawText = event.target.value;
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
      target: { kind: "study_unit", id: state.observationStudyUnitId },
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
        typeof signal.studyUnitId !== "string" ||
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
  root.addEventListener("pointerdown", markInteraction, { passive: true });
  root.addEventListener("keydown", handleKeyDown);
  root.addEventListener("focusin", markInteraction);
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
      let position = null;
      if (!routeTarget) {
        try {
          position = normalizeInspectionPosition(
            await controller.loadAuthoringInspectionPosition(state.courseId)
          );
        } catch {
          position = null;
        }
      }
      if (position?.scope && position.studyUnitId) {
        state.scope = normalizeScope(position.scope);
        state.requestedAnchorStudyUnitId = canonicalId(
          position.studyUnitId,
          "A Unidade de estudo da posição"
        );
      }
      return loadInitial({
        anchorStudyUnitId: state.requestedAnchorStudyUnitId,
        offset: Number(position?.offsetFromStickyTop || 0)
      });
    },
    loadMore(direction = "forward") {
      return loadDirection(direction);
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
      if (revision === state.pinnedRevision && !state.offlineKnown && !state.stale &&
          !state.initialFailure && !state.hydrationFailure) return true;
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
      root.removeEventListener?.("pointerdown", markInteraction);
      root.removeEventListener?.("keydown", handleKeyDown);
      root.removeEventListener?.("focusin", markInteraction);
    documentValue?.removeEventListener?.("click", handleDocumentClick);
      positionChannel?.removeEventListener?.("message", handlePositionSignal);
      positionChannel?.close?.();
      positionChannel = null;
      if (scrollFrame != null && typeof windowValue?.cancelAnimationFrame === "function") {
        windowValue.cancelAnimationFrame(scrollFrame);
      }
    }
  });
}
