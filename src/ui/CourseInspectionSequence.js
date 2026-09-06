import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import {
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { normalizeCourseMediaRead } from "../domain/courseMedia.js";
import { normalizeCourseSourcePdfDownload } from "../domain/courseSources.js";
import { readCourseMediaBlob } from "../supabase/readCourseMediaBlob.js";
import { createStudyTools, openStudyResourceUrl, renderStudyToolActions } from "../study/studyTools.js";
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
import { publicErrorMessage } from "./publicErrorMessage.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";
import {
  formatObservationTextBudget,
  isObservationTextOverLimit,
  renderStudyUnitObservationSheet,
  revealStudyObservationControl,
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
const SEARCH_KIND_LABELS = Object.freeze({
  course: "Curso",
  authoring_part: "Parte",
  module: "Módulo",
  lesson: "Lição",
  didactic_microsequence: "Microssequência",
  study_unit: "Unidade"
});
const INSPECTION_MENU_SELECTOR =
  "details.course-inspection-context-selector, details.course-inspection-item-details";
const PART_STATES = new Set([
  "planned", "partially_materialized", "materialized"
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
  exactRecord(value, ["kind", "id"], "O escopo de conteúdo é inválido.");
  const kind = String(value.kind || "");
  const id = value.id == null ? null : canonicalId(value.id, "A identidade do escopo", {
    uuid: kind === "authoring_part"
  });
  if (!SCOPE_KINDS.has(kind) || ((kind === "course" || kind === "unassigned") !== (id === null))) {
    throw new TypeError("O escopo de conteúdo é inválido.");
  }
  return Object.freeze({ kind, id });
}

function sameScope(left, right) {
  return left?.kind === right?.kind && left?.id === right?.id;
}

function normalizePart(value, label = "A parte") {
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
    "As opções de escopo de conteúdo são inválidas."
  );
  if (!Array.isArray(value.authoringParts) || value.authoringParts.length > 64) {
    throw new TypeError("As opções de parte em conteúdo são inválidas.");
  }
  const parts = value.authoringParts.map((part, index) => normalizePart(part, `A parte ${index + 1}`));
  if (new Set(parts.map(({ id }) => id)).size !== parts.length ||
      parts.some((part, index) => part.position !== index)) {
    throw new TypeError("A ordem das partes em conteúdo é inválida.");
  }
  return Object.freeze({
    authoringParts: Object.freeze(parts),
    unassignedStudyUnitCount: natural(
      value.unassignedStudyUnitCount,
      "A quantidade de unidades de estudo sem parte"
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
    "Uma unidade de estudo de conteúdo é inválida."
  );
  const cloned = structuredClone(value);
  cloned.id = canonicalId(cloned.id, "A identidade da unidade de estudo");
  cloned.position = natural(cloned.position, "A posição da unidade de estudo", { minimum: 1 });
  cloned.title = requiredText(cloned.title, "O título da unidade de estudo");
  if (!new Set(["theory", "practice"]).has(cloned.role) || !Array.isArray(cloned.content) ||
      !Array.isArray(cloned.feedback) || !Array.isArray(cloned.topics)) {
    throw new TypeError("O envelope da unidade de estudo é inválido.");
  }
  return Object.freeze(cloned);
}

function normalizeAnalysisIdea(value, label) {
  exactRecord(value, ["name", "description"], `${label} é inválida.`);
  const description = value.description == null || value.description === ""
    ? null
    : requiredText(value.description, `A descrição de ${label.toLowerCase()}`, 2_000);
  return Object.freeze({
    name: requiredText(value.name, `O nome de ${label.toLowerCase()}`, 300),
    description
  });
}

function normalizeAnalysisIdeas(value) {
  exactRecord(
    value,
    ["introduced", "used", "revisited"],
    "A apresentação das ideias da unidade é inválida."
  );
  return Object.freeze(Object.fromEntries([
    ["introduced", "Uma ideia introduzida"],
    ["used", "Uma ideia utilizada"],
    ["revisited", "Uma ideia retomada"]
  ].map(([field, label]) => {
    if (!Array.isArray(value[field]) || value[field].length > 128) {
      throw new TypeError("A apresentação das ideias da unidade é inválida.");
    }
    return [field, Object.freeze(value[field].map((idea) => normalizeAnalysisIdea(idea, label)))];
  })));
}

function normalizeAuthorship(value) {
  exactRecord(
    value,
    ["createdOrigin", "lastRevisionOrigin", "design"],
    "O estado autoral da unidade é inválido."
  );
  if (![null, "human", "gpt"].includes(value.createdOrigin) ||
      ![null, "human", "gpt"].includes(value.lastRevisionOrigin)) {
    throw new TypeError("A origem autoral da unidade é inválida.");
  }
  exactRecord(value.design, ["application"], "O desenho aplicado é inválido.");
  const application = value.design.application === null
    ? null
    : structuredClone(value.design.application);
  if (application) {
    exactRecord(
      application,
      ["mode", "componentRefs", "analysisIdeas"],
      "A aplicação do desenho é inválida."
    );
    if (!["expository", "practice", "mixed"].includes(application.mode) ||
        !Array.isArray(application.componentRefs)) {
      throw new TypeError("A aplicação do desenho é inválida.");
    }
    application.analysisIdeas = normalizeAnalysisIdeas(application.analysisIdeas);
  }
  return Object.freeze({
    createdOrigin: value.createdOrigin,
    lastRevisionOrigin: value.lastRevisionOrigin,
    design: Object.freeze({ application })
  });
}

function normalizeInspectionItem(value, totalCount) {
  exactRecord(
    value,
    [
      "studyUnit", "version", "updatedAt", "ordinal", "curriculumPath",
      "authoringPart", "authorship", "deepLink"
    ],
    "Um item de conteúdo é inválido."
  );
  exactRecord(
    value.curriculumPath,
    ["module", "lesson", "didacticMicrosequence"],
    "O caminho curricular de uma unidade de estudo é inválido."
  );
  const updatedAt = String(value.updatedAt || "");
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    throw new TypeError("A atualização de uma unidade de estudo é inválida.");
  }
  const deepLink = String(value.deepLink || "").trim();
  if (!deepLink || deepLink.length > DEEP_LINK_MAX_LENGTH || containsControlCharacters(deepLink)) {
    throw new TypeError("O link de uma unidade de estudo é inválido.");
  }
  const authoringPart = value.authoringPart === null
    ? null
    : normalizePart(value.authoringPart);
  return Object.freeze({
    studyUnit: normalizeStudyUnit(value.studyUnit),
    version: natural(value.version, "A versão da unidade de estudo", { minimum: 1 }),
    updatedAt,
    ordinal: natural(value.ordinal, "A posição da unidade de estudo no escopo", {
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
    authoringPart,
    authorship: normalizeAuthorship(value.authorship),
    deepLink
  });
}

function normalizeCursor(value, expected) {
  if (!expected) {
    if (value != null) throw new TypeError("O cursor de conteúdo é inconsistente.");
    return null;
  }
  exactRecord(value, ["studyUnitId"], "O cursor de conteúdo é inválido.");
  return Object.freeze({
    studyUnitId: canonicalId(value.studyUnitId, "A unidade de estudo do cursor")
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
    "offline", "stale", "offlineKnown", "readFailure"
  ];
  exactRecord(value, topLevelFields, "A página de conteúdo é inválida.");
  if (value.contract !== PAGE_CONTRACT || !Array.isArray(value.items) ||
      value.items.length > MAX_PAGE_SIZE || typeof value.hasPrevious !== "boolean" ||
      typeof value.hasMore !== "boolean") {
    throw new TypeError("A página de conteúdo é inválida.");
  }
  const courseId = canonicalId(value.courseId, "A identidade do curso", { uuid: true });
  const courseRevision = natural(value.courseRevision, "A revisão do curso", { minimum: 1 });
  const totalCount = natural(value.totalCount, "A quantidade de unidades de estudo");
  const scope = normalizeScope(value.scope);
  if ((expectedCourseId && courseId !== expectedCourseId) ||
      (expectedRevision !== null && courseRevision !== expectedRevision) ||
      (expectedScope && !sameScope(scope, expectedScope))) {
    const error = new Error("O curso mudou durante a leitura de conteúdo.");
    error.code = "course_revision_changed";
    throw error;
  }
  const items = value.items.map((item) => normalizeInspectionItem(item, totalCount));
  if (new Set(items.map(({ studyUnit }) => studyUnit.id)).size !== items.length ||
      items.some((item, index) => index > 0 && item.ordinal !== items[index - 1].ordinal + 1)) {
    throw new TypeError("A ordem da página de conteúdo é inválida.");
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
    offlineKnown: value.offline === true || value.offlineKnown === true,
    stale: value.stale === true
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
  if (!SCOPE_KINDS.has(target.kind)) throw new TypeError("O alvo de conteúdo é inválido.");
  return Object.freeze({
    scope: normalizeScope({ kind: target.kind, id: target.id }),
    anchorStudyUnitId: null
  });
}

function statusMessage(error) {
  const code = String(error?.code || "").toLowerCase();
  if (code === "course_revision_changed") return "O curso mudou durante a leitura.";
  if (["pt404", "p0002"].includes(code) || code.includes("not_found") ||
      Number(error?.status) === 404) return "Ponto não encontrado.";
  if (Number(error?.status) === 401) return "Sua sessão precisa ser renovada. Entre novamente e tente carregar o conteúdo.";
  if (Number(error?.status) === 403) return "Você não tem acesso a este conteúdo.";
  if (code === "auth_timeout") return "Não foi possível conferir sua sessão a tempo. Entre novamente e tente carregar o conteúdo.";
  if (error?.name === "AbortError") return "Leitura cancelada. Tente novamente.";
  if (/timeout/iu.test(`${code} ${error?.name || ""}`)) return "O serviço demorou para responder. Tente novamente.";
  if (Number(error?.status) === 429) return "O serviço recebeu muitas solicitações. Aguarde e tente novamente.";
  if (Number(error?.status) >= 500) return "O serviço está temporariamente indisponível. Tente novamente.";
  if (/offline|network|failed to fetch|connection/iu.test(`${code} ${error?.message || ""}`)) {
    return "Não foi possível alcançar o serviço. Verifique a conexão e tente novamente.";
  }
  return "Não foi possível carregar este trecho de conteúdo.";
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
    if (state.initialLoading || state.initialFailure || state.targetMissing) {
      return '<span class="course-inspection-context-copy" data-inspection-context-summary>' +
        (state.initialLoading ? "Lendo conteúdo" : "Conteúdo indisponível") + '</span>';
    }
    if (state.emptyScopeContext) {
      const context = state.emptyScopeContext;
      const kindLabel = SEARCH_KIND_LABELS[context.kind] || "Conteúdo";
      return '<div class="course-inspection-empty-context">' +
        '<span class="course-inspection-context-copy"><small>' +
        `${escapeHtml(kindLabel)}</small><strong>${escapeHtml(context.title)}</strong></span>` +
        renderContextEditControl(state, context.kind, context.id) + "</div>";
    }
    return '<span class="course-inspection-context-copy" data-inspection-context-summary>' +
      'Nenhuma unidade de estudo</span>';
  }
  const path = item.curriculumPath;
  return '<details class="course-inspection-context-selector"><summary data-inspection-control-key="context"' +
    ` aria-label="Localização: ${escapeHtml(path.module.title)}, ${escapeHtml(path.lesson.title)}, ` +
    `${escapeHtml(path.didacticMicrosequence.title)}, unidade ${item.ordinal}">` +
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
    '</span><button type="button" data-inspection-action="latest-updated"' +
    ' data-inspection-control-key="latest-updated"' +
    `${state.initialLoading || state.loadingDirection ? ' disabled aria-disabled="true"' : ""}>` +
    'Ir à atualização mais recente</button></nav></details>';
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
    ` aria-label="Título da unidade de estudo" title="Editar título">${escapeHtml(draftTitle)}</h3>`;
}

function renderManualModeActions(item, state, editing, observationCount) {
  const id = escapeHtml(item.studyUnit.id);
  const selectedForBatch = state.selectedStudyUnitIds.has(item.studyUnit.id);
  return '<nav class="course-inspection-mode-actions" role="group" aria-label="Ações da unidade de estudo">' +
    `<button type="button" class="course-inspection-view-action" data-inspection-unit-mode="view" data-study-unit-id="${id}"` +
    ` aria-pressed="${editing ? "false" : "true"}" aria-label="Visualizar" title="Visualizar"` +
    `${state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
    `${renderUiIcon("preview", "course-authoring-button-icon")}</button>` +
    (state.canAccessDesign
      ? `<button type="button" data-inspection-open-parameters data-study-unit-id="${id}"` +
        ` data-inspection-control-key="design:${id}" aria-label="Parâmetros aplicáveis a ${escapeHtml(
          item.studyUnit.title
        )}" title="Parâmetros da unidade de estudo">` +
        `${renderUiIcon("tags", "course-authoring-button-icon")}</button>`
      : "") +
    `<button type="button" data-inspection-observations data-study-unit-id="${id}"` +
    ` data-inspection-control-key="observations:${id}" aria-label="Observações de ${escapeHtml(
      item.studyUnit.title
    )}${Number(observationCount) > 0 ? `, ${Number(observationCount)} pendentes` : ""}"` +
    ' title="Observações">' +
    `${renderUiIcon("prompt", "course-authoring-button-icon")}</button>` +
    (state.canEditSources
      ? `<button type="button" data-inspection-edit-sources data-study-unit-id="${id}"` +
        ` data-inspection-control-key="sources:${id}" aria-label="Fontes e âncoras de ${escapeHtml(
          item.studyUnit.title
        )}" title="Fontes e âncoras">` +
        `${renderUiIcon("study", "course-authoring-button-icon")}</button>`
      : "") +
    `<button type="button" data-inspection-view-action="toggle-multiple"` +
    ` data-study-unit-id="${id}" data-inspection-control-key="view:${id}"` +
    ` aria-pressed="${state.multipleView}"` +
    ` aria-label="${state.multipleView ? "Mostrar somente esta unidade" : "Mostrar várias unidades"}"` +
    ` title="${state.multipleView ? "Mostrar somente esta unidade" : "Mostrar várias unidades"}">` +
    `${renderUiIcon("study-unit", "course-authoring-button-icon")}</button>` +
    (state.multipleView
      ? `<button type="button" data-inspection-selection-action="toggle-unit" data-study-unit-id="${id}"` +
        ` data-inspection-control-key="selection:${id}" role="checkbox" aria-checked="${selectedForBatch}"` +
        ` aria-label="${selectedForBatch ? "Remover" : "Adicionar"} ${escapeHtml(item.studyUnit.title)}` +
        ` ${selectedForBatch ? "da" : "à"} seleção para observação" title="Selecionar para observação">` +
        `${renderUiIcon(selectedForBatch ? "ready-state" : "add", "course-authoring-button-icon")}</button>`
      : "") +
    (state.canEditManually
      ? `<button type="button" data-inspection-unit-mode="edit" data-study-unit-id="${id}"` +
        ` aria-pressed="${editing ? "true" : "false"}" aria-label="Editar" title="Editar"` +
        `${state.manualSaving ? " disabled aria-disabled=\"true\"" : ""}>` +
        `${renderUiIcon("edit", "course-authoring-button-icon")}</button>`
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
  courseTitle = "",
  authoringParts = []
} = {}) {
  const course = (Array.isArray(project?.courses) ? project.courses : [])
    .find((candidate) => candidate?.id === courseId || candidate?.courseId === courseId);
  if (!course) throw new TypeError("O curso do índice de conteúdo não está disponível.");
  if (!Array.isArray(authoringParts) || authoringParts.length > 64) {
    throw new TypeError("As partes do índice de conteúdo são inválidas.");
  }
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
  for (const part of authoringParts) {
    const id = canonicalId(part?.id, "A identidade da parte do índice", { uuid: true });
    const title = requiredText(part?.title, "O título da parte do índice");
    const position = natural(part?.position, "A posição da parte do índice", { maximum: 63 });
    entries.push(courseSearchEntry({
      kind: "authoring_part",
      id,
      title,
      path: [resolvedCourseTitle, `parte ${position + 1}`, title],
      entityPath: [courseId, id],
      order: order++
    }));
  }
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

function renderStudyUnitContextActions(item, state) {
  const studyUnitId = escapeHtml(item.studyUnit.id);
  return `<nav class="course-inspection-item-menu" aria-label="Mais ações para ${escapeHtml(item.studyUnit.title)}">` +
    `<button type="button" data-inspection-copy-link data-deep-link="${escapeHtml(item.deepLink)}"` +
    ` data-inspection-control-key="copy:${studyUnitId}">` +
    `${renderUiIcon("copy", "course-authoring-button-icon")}<span>Copiar link</span></button>` +
    `<a href="${escapeHtml(buildCourseAuthoringRoute(state.courseId, { section: "review", studyUnitId: item.studyUnit.id }))}"` +
    ` data-inspection-route data-inspection-control-key="review:${studyUnitId}">` +
    `${renderUiIcon("review", "course-authoring-button-icon")}<span>Revisar unidade</span></a>` +
    `<button type="button" class="course-inspection-view-menu" data-inspection-unit-mode="view"` +
    ` data-study-unit-id="${studyUnitId}"${state.manualSaving ? " disabled" : ""}>` +
    `${renderUiIcon("preview", "course-authoring-button-icon")}<span>Visualizar</span></button>` +
    [
      ["undo", state.manualUndo, "Desfazer última edição", "arrow-left"],
      ["redo", state.manualRedo, "Refazer edição", "arrow-right"]
    ].map(([action, history, label, icon]) => state.canEditManually && history.at(-1)?.studyUnitId === item.studyUnit.id
      ? `<button type="button" data-inspection-manual-history="${action}" data-study-unit-id="${studyUnitId}"` +
        `${state.manualSaving ? " disabled" : ""}>${renderUiIcon(icon, "course-authoring-button-icon")}<span>${label}</span></button>` : "").join("") +
    "</nav>";
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

function renderAnalysisIdeaGroup(label, ideas) {
  if (!ideas.length) return "";
  return '<section class="course-inspection-analysis-idea-group">' +
    `<h4>${escapeHtml(label)}</h4><ul>` + ideas.map((idea) =>
      '<li><strong>' + escapeHtml(idea.name) + '</strong>' +
      (idea.description ? `<p>${escapeHtml(idea.description)}</p>` : "") +
      '</li>').join("") + '</ul></section>';
}

function renderAnalysisIdeas(item) {
  const ideas = item.authorship.design.application?.analysisIdeas;
  if (!ideas) return "";
  const content = [
    renderAnalysisIdeaGroup("Ideias introduzidas aqui", ideas.introduced),
    renderAnalysisIdeaGroup("Ideias já estabelecidas usadas aqui", ideas.used),
    renderAnalysisIdeaGroup("Ideias retomadas", ideas.revisited)
  ].join("");
  return content
    ? `<div class="course-inspection-analysis-ideas">${content}</div>`
    : "";
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
    revealPracticeAnswers: true,
    toolsInActionBar: !editing,
    manualEditingTargetId: editing && selectedResourceTargetIds.length
      ? state.manualTargetId
      : ""
  });
  const selected = state.multipleView
    ? state.selectedStudyUnitIds.has(item.studyUnit.id)
    : state.selectedStudyUnitId === item.studyUnit.id;
  return `<li class="course-inspection-item${selected ? " is-selected" : ""}" data-inspection-study-unit="${escapeHtml(item.studyUnit.id)}"` +
    ` data-inspection-ordinal="${item.ordinal}" aria-posinset="${item.ordinal}" aria-setsize="${totalCount}">` +
    `<article aria-labelledby="inspection-study-unit-${escapeHtml(item.studyUnit.id)}"` +
    `${state.activeStudyUnitId === item.studyUnit.id ? ' aria-current="true"' : ""}>` +
    '<header class="course-inspection-item-heading"><div tabindex="0">' +
    `<p>${escapeHtml(path.didacticMicrosequence.title)} · unidade ${item.ordinal} de ${totalCount}</p>` +
    `${renderManualTitle(item, state, editing, state.manualTargetId)}</div>` +
    `<details class="course-inspection-item-details"><summary aria-label="Abrir detalhes de ${escapeHtml(item.studyUnit.title)}"` +
    ` title="Abrir detalhes" data-inspection-control-key="details:${escapeHtml(item.studyUnit.id)}">` +
    `${renderUiIcon("more", "course-authoring-button-icon")}</summary>` +
    '<div class="course-inspection-item-detail-panel"><dl>' +
    `<div><dt>Módulo</dt><dd>${escapeHtml(path.module.title)}</dd></div>` +
    `<div><dt>Lição</dt><dd>${escapeHtml(path.lesson.title)}</dd></div>` +
    `<div><dt>Microssequência</dt><dd>${escapeHtml(path.didacticMicrosequence.title)}</dd></div>` +
    `<div><dt>Atualizado em</dt><dd><time datetime="${escapeHtml(item.updatedAt)}">` +
    `${escapeHtml(new Date(item.updatedAt).toLocaleString("pt-BR"))}</time></dd></div></dl>` +
    renderAnalysisIdeas(item) +
    renderStudyUnitContextActions(item, state) +
    "</div></details></header>" +
    '<div class="course-inspection-item-actions" aria-label="Ações contextuais">' +
    (renderStudyToolActions(item.studyUnit, RESOURCE_PACKAGE_REGISTRY, {
      disabled: Boolean(state.manualStudyUnitId), compact: true
    }) || '<div class="study-tool-actions" aria-hidden="true"></div>') +
    renderManualModeActions(item, state, editing, observationCount) +
    "</div>" +
    (state.modeBlock?.studyUnitId === item.studyUnit.id
      ? '<aside class="course-inspection-mode-block course-authoring-notice is-error" role="alert">' +
        `<p>${escapeHtml(state.modeBlock.message)}</p><button type="button" data-inspection-pending-action="resume" ` +
        `data-inspection-control-key="pending:${escapeHtml(item.studyUnit.id)}">` +
        `${state.modeBlock.kind === "observation" ? "Retomar observação" : "Retomar edição"}</button></aside>` : "") +
    renderAuthorshipState(item, observationCount) +
    (item.studyUnit.response
      ? '<p class="course-inspection-response-notice">Prática exibida com as respostas esperadas.</p>'
      : "") +
    '<div class="runtime-card-rendered-content course-inspection-runtime">' +
    `<div class="card-sheet-content">${runtime.bodyHtml}</div>${runtime.dockHtml}</div>` +
    renderManualEditDock(item, state, editing, resourceTargetIds) +
    `<footer><small>Unidade ${item.ordinal}</small></footer></article></li>`;
}

function renderAuthorshipState(item, observationCount = null) {
  const states = [];
  const pendingObservations = observationCount ?? 0;
  if (pendingObservations > 0) {
    states.push({
      kind: "observations",
      icon: "prompt",
      label: `${pendingObservations} ${pendingObservations === 1
        ? "observação pendente"
        : "observações pendentes"}`
    });
  }
  return states.length
    ? `<p class="course-inspection-authorship" aria-label="Estado da revisão">${states.map((state) =>
        `<span data-inspection-review-state="${escapeHtml(state.kind)}"` +
        ` aria-label="${escapeHtml(state.label)}" title="${escapeHtml(state.label)}">` +
        `${renderUiIcon(state.icon, "course-authoring-button-icon")}</span>`).join("")}</p>`
    : "";
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
  const targetCount = state.observationTargetIds.length || 1;
  const batch = targetCount > 1;
  const reviewHref = batch
    ? buildCourseAuthoringRoute(state.courseId, { section: "review" })
    : buildCourseAuthoringRoute(state.courseId, {
        section: "review",
        studyUnitId: state.observationStudyUnitId
      });
  const sheet = renderStudyUnitObservationSheet({
    items: batch ? [] : state.observationItems,
    draft: state.observationDraft,
    editingId: state.observationEditingId,
    error: state.observationError,
    saving: state.observationSaving,
    loading: batch ? false : state.observationLoading,
    title: batch ? `Observação em ${targetCount} unidades` : "Observações da unidade",
    ariaLabel: batch
      ? `Observação em ${targetCount} unidades de estudo`
      : "Observações da unidade de estudo",
    listLabel: "Observações deste contexto",
    emptyLabel: "Nenhuma observação neste contexto.",
    showContributor: true,
    collectionSummary: state.observationCollectionSummary,
    canonicalHref: buildCourseAuthoringRoute(state.courseId, { section: "review" }),
    showComposer: true,
    composerStudyUnitId: batch ? "" : state.observationStudyUnitId,
    contextMessage: state.observationMessage || (batch
      ? "O mesmo texto será registrado separadamente em cada unidade selecionada."
      : ""),
    actionHref: reviewHref,
    actionLabel: batch
      ? "Revisar observações abertas no curso"
      : "Revisar observações abertas desta unidade",
    actionControlKey: batch
      ? "selection:observe"
      : `observations:${state.observationStudyUnitId}`
  });
  const confirmation = renderInspectionConfirmation(state);
  const managedSheet = sheet.replace('role="dialog"', 'role="dialog" data-course-authoring-draft-managed');
  if (!confirmation) return managedSheet;
  const inactiveSheet = managedSheet.replace(
    '<section class="editor-overlay study-observation-overlay"',
    '<section class="editor-overlay study-observation-overlay" inert aria-hidden="true"'
  );
  return `${inactiveSheet}${confirmation}`;
}

function renderInspectionSearchResults(state) {
  if (!state.searchOpen) {
    return '<ul id="course-inspection-search-results" class="course-inspection-search-results"' +
      ' role="listbox" aria-label="Pontos do curso" hidden></ul>';
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
    ` role="listbox" aria-label="Pontos do curso">${content}</ul>`;
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
  const updating = state.initialLoading || Boolean(state.loadingDirection);
  const label = updating
    ? "Lendo conteúdo"
    : offline
    ? "Sem sincronização com a nuvem"
    : state.stale
      ? "Cópia local; atualização pendente"
    : state.initialFailure
      ? "Falha ao carregar conteúdo"
    : "Sincronização com a nuvem disponível";
  return `<span class="course-inspection-sync-state${offline
    ? " is-offline"
    : updating ? " is-updating" : ""}"` +
    ` role="status" aria-label="${label}" title="${label}">` +
    `${renderUiIcon(
      updating ? "rotate" : offline ? "offline" : "cloud",
      "course-authoring-button-icon"
    )}</span>`;
}


function renderTemporarySelection(state) {
  if (!state.multipleView) return "";
  const count = state.selectedStudyUnitIds.size;
  return '<aside class="course-inspection-selection" data-inspection-selection-bar' +
    ' aria-label="Seleção temporária de unidades de estudo">' +
    `<div><span role="status">${count > 0
      ? `${count} ${count === 1 ? "unidade selecionada" : "unidades selecionadas"}`
      : "Selecione ao menos duas unidades"}</span></div>` +
    '<div class="course-authoring-compact-actions">' +
    `<button type="button" class="course-authoring-icon-action"` +
    ' data-inspection-selection-action="observe-selected"' +
    ' data-inspection-control-key="selection:observe"' +
    ' aria-label="Registrar observação nas unidades selecionadas" title="Observar seleção"' +
    `${count < 2 ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon("prompt", "course-authoring-button-icon")}</button>` +
    '<button type="button" class="course-authoring-icon-action"' +
    ' data-inspection-selection-action="clear" data-inspection-control-key="selection:clear"' +
    ' aria-label="Limpar seleção" title="Limpar seleção">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` +
    "</div></aside>";
}

function renderSelectionPagination(state, direction) {
  const previous = direction === "backward";
  const available = previous ? state.hasPrevious : state.hasMore;
  if (!available) return "";
  const label = previous ? "Carregar unidades anteriores" : "Carregar unidades posteriores";
  return '<div class="course-inspection-selection-pagination">' +
    `<button type="button" data-inspection-selection-action="${direction}"` +
    ` data-inspection-control-key="selection:${direction}" aria-label="${label}"` +
    `${state.loadingDirection ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon(previous ? "arrow-left" : "arrow-right", "course-authoring-button-icon")}` +
    `<span>${label}</span></button></div>`;
}

function renderSequence(state) {
  const active = state.items.find(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId) ||
    state.items[0] || null;
  const notice = state.initialFailure && state.items.length > 0
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.initialFailure)}</p>`
      : state.hydrationFailure
          ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.hydrationFailure)}</p>`
          : "";
  const navigationFailure = state.previousFailure || state.nextFailure;
  let body;
  if (state.initialLoading && state.items.length === 0) {
    body = '<p class="course-authoring-loading" role="status">Carregando unidades…</p>';
  } else if (state.targetMissing) {
    body = '<section class="course-authoring-state is-error" role="alert">' +
      `${renderUiIcon("remove-state", "course-authoring-state-icon")}<h3>Ponto não encontrado</h3>` +
      '<p>Esta unidade não pertence mais à sequência corrente de conteúdo.</p>' +
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
      '<h3>Nenhuma unidade de estudo materializada</h3>' +
      '<p>Consulte o mapa para localizar a próxima microssequência a produzir.</p>' +
      `<a href="${escapeHtml(buildCourseAuthoringRoute(state.courseId, { section: "planning" }))}"` +
      ' data-inspection-route data-inspection-control-key="empty:curriculum">Abrir mapa curricular</a></section>';
  } else {
    body = (state.multipleView ? renderSelectionPagination(state, "backward") : "") +
      `<ol class="course-inspection-sequence${state.multipleView ? " course-inspection-selection-sequence" : ""}"` +
      ' aria-label="Sequência curricular de unidades">' +
      (state.multipleView ? state.items : [active]).map((item) => renderStudyUnit(
        item,
        state.totalCount,
        state,
        Object.hasOwn(state.observationCounts, item.studyUnit.id)
          ? state.observationCounts[item.studyUnit.id]
          : null
      )).join("") + "</ol>" +
      (state.multipleView ? renderSelectionPagination(state, "forward") : "");
  }
  return '<section class="course-authoring-section course-authoring-inspection"' +
    ' aria-label="Unidades de estudo">' +
    `<nav class="course-inspection-sticky-context" aria-label="Navegação entre unidades">` +
    `<button type="button" data-inspection-action="previous" data-inspection-control-key="previous"` +
    `${state.loadingDirection || !active || active.ordinal <= 1
      ? " disabled aria-disabled=\"true\""
      : ""}` +
    ` aria-label="Unidade anterior">${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button>` +
    `<div class="course-inspection-active-context">${renderContext(state, active)}</div>` +
    `<button type="button" data-inspection-action="next" data-inspection-control-key="next"` +
    `${state.loadingDirection || !active || active.ordinal >= state.totalCount
      ? " disabled aria-disabled=\"true\""
      : ""}` +
    ` aria-label="Próxima unidade">${renderUiIcon("arrow-right", "course-authoring-button-icon")}</button>` +
    '<div class="course-inspection-navigation-tools">' +
    renderInspectionSearch(state) + renderInspectionSyncState(state) + "</div></nav>" +
    renderTemporarySelection(state) + notice +
    (navigationFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(navigationFailure)}</p>`
      : "") + body +
    '<p class="course-inspection-copy-status course-authoring-visually-hidden" role="status" aria-live="polite">' +
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
    "A posição local de conteúdo é inválida."
  );
  const offset = Number(value.offsetFromStickyTop);
  const courseRevision = natural(value.courseRevision, "A revisão da posição local", { minimum: 1 });
  if (!Number.isFinite(offset) || Math.abs(offset) > 100_000 ||
      (expectedCourseRevision !== null && courseRevision !== expectedCourseRevision)) {
    throw new TypeError("A posição local de conteúdo é inválida.");
  }
  return Object.freeze({
    scope: normalizeScope(value.scope),
    studyUnitId: canonicalId(value.studyUnitId, "A unidade de estudo da posição local"),
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
  onStudyUnitChange = () => true,
  onEditSources = () => {},
  onOpenParameters = null,
  onEditContent = null,
  onSaveManualEdit = null,
  onFeedback = () => {},
  onCourseRead = () => {},
  onReadState = () => {},
  windowValue = globalThis.window || null,
  documentValue = root?.ownerDocument || globalThis.document || null,
  navigatorValue = globalThis.navigator || null
} = {}) {
  if (!root || typeof root.addEventListener !== "function" ||
      typeof controller?.loadAuthoringStudyUnits !== "function" ||
      typeof controller?.loadAuthoringInspectionPosition !== "function" ||
      typeof controller?.saveAuthoringInspectionPosition !== "function" ||
      !UUID_PATTERN.test(String(course?.courseId || "")) ||
      !Number.isSafeInteger(course?.revision) || course.revision < 1 ||
      typeof onNavigate !== "function" || typeof onStudyUnitChange !== "function" ||
      typeof onEditSources !== "function" || typeof onFeedback !== "function" || typeof onCourseRead !== "function" ||
      typeof onReadState !== "function" ||
      (onOpenParameters !== null && typeof onOpenParameters !== "function") ||
      (onEditContent !== null && typeof onEditContent !== "function") ||
      (onSaveManualEdit !== null && typeof onSaveManualEdit !== "function")) {
    throw new TypeError("Dependências da sequência de conteúdo são inválidas.");
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
    canAccessDesign: course.ownership === "owned" && course.canEdit === true &&
      typeof onOpenParameters === "function",
    canEditContent: course.ownership === "owned" && course.canEdit === true &&
      typeof onEditContent === "function",
    canEditManually: course.ownership === "owned" && course.canEdit === true &&
      typeof onSaveManualEdit === "function",
    scope: requested.scope,
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
    activeStudyUnitId: requested.anchorStudyUnitId,
    selectedStudyUnitId: requested.anchorStudyUnitId,
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
    multipleView: false,
    modeBlock: null,
    selectedStudyUnitIds: new Set(),
    observationStudyUnitId: null,
    observationTargetIds: [],
    observationSheetOpen: false,
    observationDraftStudyUnitId: requested.anchorStudyUnitId,
    observationItems: [],
    observationCollectionSummary: null,
    observationDraft: { category: null, rawText: "" },
    observationEditingId: null,
    observationLoading: false,
    observationSaving: false,
    observationError: "",
    observationMessage: "",
    pendingObservationMutation: null,
    pendingBatchObservation: null,
    restoreObservationFocus: false,
    restoreObservationCloseFocus: false,
    confirmation: null,
    manualStudyUnitId: null,
    manualTargetId: "",
    manualDraft: { pathValues: {} },
    manualOrigin: "manual",
    manualSaving: false,
    manualError: "",
    manualStatus: "",
    manualStatusError: false,
    manualRestoreFocus: "",
    manualUndo: [],
    manualRedo: [],
    manualHistoryPreview: null,
    manualUnknownSignature: "",
    manualDiscardArmed: false,
    searchQuery: "",
    searchResults: [],
    searchOpen: false,
    searchLoading: false,
    searchError: "",
    searchActiveIndex: -1,
    destroyed: false
  };
  let renderEpoch = 0;
  let lastFeedbackKey = "";

  function reportFeedback(message, { error = false } = {}) {
    if (state.destroyed) return;
    state.manualStatus = message;
    state.manualStatusError = error;
    const live = root.querySelector?.(".course-inspection-copy-status");
    if (live) live.textContent = message;
    lastFeedbackKey = JSON.stringify([message, error]);
    onFeedback(message, { error });
  }
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
  let toolStudyUnitId = "";
  let toolReturnScroll = null;
  const studyTools = createStudyTools({
    root,
    getStudyUnit(button) {
      if (button) toolStudyUnitId = button.closest("[data-inspection-study-unit]")?.dataset.inspectionStudyUnit || "";
      return state.items.find(({ studyUnit }) => studyUnit.id === toolStudyUnitId)?.studyUnit || null;
    },
    getContextKey: () => `${state.courseId}:${state.pinnedRevision}:${toolStudyUnitId}`,
    canOpen: () => !state.destroyed && !state.manualStudyUnitId,
    getOverlayHost: () => root.closest?.(".course-authoring-root") || root,
    getBackground: () => root.closest?.(".course-authoring-surface") || root.querySelector(".course-authoring-inspection"),
    onOpen() {
      toolReturnScroll = scrollTarget && "scrollTop" in scrollTarget ? scrollTarget.scrollTop : null;
    },
    getReturnControl(toolId) {
      if (toolReturnScroll !== null) scrollTarget.scrollTop = toolReturnScroll;
      return [...root.querySelectorAll("[data-study-tool-id]")].find((button) =>
        button.dataset.studyToolId === toolId &&
        button.closest("[data-inspection-study-unit]")?.dataset.inspectionStudyUnit === toolStudyUnitId);
    },
    getHost(_instance, { signal }) {
      const courseId = state.courseId;
      const revision = state.pinnedRevision;
      const studyUnitId = toolStudyUnitId;
      const assertContext = () => {
        if (signal.aborted || state.destroyed || state.pinnedRevision !== revision || studyUnitId !== toolStudyUnitId) {
          throw new Error("A unidade mudou. Abra a ferramenta novamente.");
        }
      };
      return {
        canRevealAnswers: true,
        async loadAudioConfiguration() {
          assertContext();
          const result = normalizeCourseMediaRead(await controller.loadCourseMedia(courseId, {
            expectedRevision: revision, mode: "configuration"
          }));
          assertContext();
          if (result.courseId !== courseId || result.courseRevision !== revision || result.mode !== "configuration") {
            throw new Error("A configuração de áudio não corresponde a esta revisão do curso.");
          }
          return result.audioConfig;
        },
        async downloadMedia(media, options) {
          assertContext();
          const result = await controller.getCourseMediaDownload({
            courseId, expectedRevision: revision, studyUnitId, contentHash: media.contentHash
          });
          assertContext();
          if (result.courseId !== courseId || result.courseRevision !== revision || result.studyUnitId !== studyUnitId) {
            throw new Error("O áudio autorizado não corresponde a esta unidade.");
          }
          const file = await readCourseMediaBlob(result, media, options);
          assertContext();
          return file;
        },
        openExternalUrl: (url) => { assertContext(); openStudyResourceUrl(url, documentValue); },
        async openSourceAttachment(target) {
          assertContext();
          const result = normalizeCourseSourcePdfDownload(await controller.getCourseSourceAttachmentDownload({
            courseId, expectedCourseRevision: revision, ...target
          }));
          assertContext();
          if (result.courseId !== courseId || result.courseRevision !== revision ||
              result.sourceId !== target.sourceId || result.sourceRevision !== target.sourceRevision ||
              result.attachment.contentHash !== target.contentHash) {
            throw new Error("O PDF autorizado não corresponde à referência escolhida.");
          }
          openStudyResourceUrl(result.signedUrl, documentValue);
        }
      };
    }
  });

  function markInteraction() {
    lastInteractionAt = Date.now();
  }

  function handlePointerDown(event) {
    markInteraction();
    const summary = event?.target?.closest?.(".course-inspection-context-selector > summary");
    const route = event?.target?.closest?.(
      ".course-inspection-context-selector > nav [data-inspection-route]"
    );
    if (summary || route) {
      event.preventDefault?.();
    }
  }

  function handleFocusIn(event) {
    markInteraction();
    revealStudyObservationControl(event?.target);
  }

  function focus(selector) {
    const control = root.querySelector?.(selector);
    control?.focus?.({ preventScroll: true });
    revealStudyObservationControl(control);
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
    if (state.observationSheetOpen && event?.key === "Tab") {
      trapAuthoringConfirmationTab({
        event,
        root,
        confirmationSelector: ".study-observation-sheet",
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
    if (state.observationSheetOpen) {
      root.querySelector?.('[data-observation-action="close"]')?.click?.();
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
    const visibleUnit = state.multipleView
      ? [...(root.querySelectorAll?.("[data-inspection-study-unit]") || [])]
        .find((element) => element.getBoundingClientRect?.().bottom > stickyTop())
      : null;
    const selectedId = focusedUnit?.dataset?.inspectionStudyUnit ||
      visibleUnit?.dataset?.inspectionStudyUnit ||
      state.activeStudyUnitId;
    const escapedId = selectedId && globalThis.CSS?.escape
      ? globalThis.CSS.escape(selectedId)
      : String(selectedId || "").replace(/["\\]/gu, "\\$&");
    const element = selectedId
      ? root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`)
      : null;
    const content = element?.querySelector?.(".card-sheet-content");
    return {
      studyUnitId: selectedId || null,
      contentScroll: content ? {
        studyUnitId: selectedId,
        top: content.scrollTop,
        left: content.scrollLeft
      } : null,
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
      if (details) details.open = true;
    }
    const control = controlForKey(snapshot?.controlKey);
    const details = control?.closest?.("details");
    if (details) details.open = true;
    let focusControl = control;
    if (focus && control?.disabled) {
      const fallbackKey = snapshot?.controlKey === "next"
        ? "previous"
        : snapshot?.controlKey === "previous"
          ? "next"
          : "";
      focusControl = controlForKey(fallbackKey) || control;
    }
    if (focus) focusControl?.focus?.({ preventScroll: true });
    return Boolean(control);
  }

  function restoreAnchor(snapshot, { initial = false } = {}) {
    const id = snapshot?.studyUnitId || state.activeStudyUnitId;
    if (!id) return;
    const escapedId = globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id.replace(/["\\]/gu, "\\$&");
    const element = root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`);
    if (!element?.getBoundingClientRect) return;
    const content = element.querySelector?.(".card-sheet-content");
    if (content && snapshot?.contentScroll?.studyUnitId === id) {
      content.scrollTop = snapshot.contentScroll.top;
      content.scrollLeft = snapshot.contentScroll.left;
    }
    if (Number.isFinite(snapshot?.containerScrollTop) && scrollTarget && "scrollTop" in scrollTarget) {
      scrollTarget.scrollTop = snapshot.containerScrollTop;
    }
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

  async function hydrate(epoch) {
    try {
      if (state.destroyed || epoch !== renderEpoch) return;
      deactivateResponses();
      await RESOURCE_PACKAGE_REGISTRY.hydrate(root);
      if (state.destroyed || epoch !== renderEpoch) return;
      activateManualEditing();
      deactivateResponses();
    } catch {
      if (state.destroyed || epoch !== renderEpoch) return;
      state.hydrationFailure = "Uma representação não pôde ser materializada.";
      reportFeedback(state.hydrationFailure, { error: true });
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
    const restoreObservationCloseFocus = state.restoreObservationCloseFocus;
    state.restoreObservationFocus = false;
    state.restoreObservationCloseFocus = false;
    manualInlineController?.destroy?.();
    manualInlineController = null;
    studyTools.beforeRender();
    root.innerHTML = renderSequence(state);
    const feedbackKey = JSON.stringify([state.manualStatus, state.manualStatusError]);
    if (!state.manualStatus) lastFeedbackKey = "";
    else if (feedbackKey !== lastFeedbackKey) {
      reportFeedback(state.manualStatus, { error: state.manualStatusError });
    }
    studyTools.afterRender();
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
    } else if (restoreObservationCloseFocus) {
      focus('[data-observation-action="close"]');
    }
    root.setAttribute?.("aria-busy", String(state.initialLoading || Boolean(state.loadingDirection)));
    onReadState({
      syncing: state.initialLoading || Boolean(state.loadingDirection),
      offline: state.offlineKnown,
      stale: state.stale || Boolean(state.initialFailure || state.previousFailure || state.nextFailure),
      syncError: state.initialLoading || state.loadingDirection ? "" :
        state.initialFailure || state.previousFailure || state.nextFailure
    });
    void hydrate(epoch).then(() => {
      if (state.destroyed || epoch !== renderEpoch) return;
      if (restorePosition) restoreAnchor(snapshot, { initial });
      else restoreControlState(snapshot);
      revealStudyObservationControl(documentValue?.activeElement);
      if (!restorePosition && scrollTarget && "scrollTop" in scrollTarget) {
        scrollTarget.scrollTop = 0;
      }
    });
  }

  function mergePage(page, direction) {
    if (page.totalCount !== state.totalCount && state.items.length > 0) {
      throw new TypeError("A quantidade de conteúdo mudou sem nova revisão.");
    }
    const items = new Map(state.items.map((item) => [item.studyUnit.id, item]));
    page.items.forEach((item) => {
      items.set(item.studyUnit.id, item);
      if (!Object.hasOwn(state.observationCounts, item.studyUnit.id)) {
        state.observationCounts[item.studyUnit.id] = 0;
      }
    });
    const ordered = [...items.values()].sort((left, right) => left.ordinal - right.ordinal);
    if (ordered.some((item, index) => index > 0 && item.ordinal !== ordered[index - 1].ordinal + 1)) {
      throw new TypeError("As páginas de conteúdo não são contíguas.");
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
    if (state.selectedStudyUnitId &&
        !ordered.some(({ studyUnit }) => studyUnit.id === state.selectedStudyUnitId) &&
        !hasObservationDraft()) {
      state.selectedStudyUnitId = state.activeStudyUnitId;
      state.observationDraftStudyUnitId = state.selectedStudyUnitId;
    }
    state.items = ordered;
    state.totalCount = page.totalCount;
    state.scopeOptions = page.scopeOptions;
    state.offlineKnown = page.offlineKnown;
    state.stale = page.stale;
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

  function pageOptions({ anchorStudyUnitId = null, cursor = null, direction = "forward", entry = null } = {}) {
    return {
      expectedRevision: state.pinnedRevision,
      scope: state.scope,
      ...(anchorStudyUnitId ? { anchorStudyUnitId } : {}),
      ...(entry ? { entry } : {}),
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
        expectedRevision: options.expectedRevision,
        expectedScope: options.scope
      }
    );
  }

  async function readCoherentPage(options, epoch) {
    try {
      return await readPage(options);
    } catch (error) {
      if (error?.code !== "course_revision_changed" || state.destroyed || epoch !== requestEpoch ||
          typeof controller.getCourse !== "function") throw error;
      // A cursor belongs to one revision. Reconcile from the current anchor only.
      const detail = await controller.getCourse(state.courseId);
      if (state.destroyed || epoch !== requestEpoch) throw error;
      if (detail?.stale === true || detail?.offline === true) throw error;
      if (detail?.courseId !== state.courseId || !Number.isSafeInteger(detail.revision) || detail.revision < 1) {
        throw new TypeError("A revisão corrente do curso é inválida.", { cause: error });
      }
      const page = await readPage({ ...options, cursor: null, expectedRevision: detail.revision });
      if (state.destroyed || epoch !== requestEpoch) throw error;
      state.pinnedRevision = detail.revision;
      onCourseRead(detail);
      return page;
    }
  }

  function loadCourseSearchIndex() {
    const revision = state.pinnedRevision;
    if (courseSearchIndexRevision === revision && courseSearchIndexPromise) {
      return courseSearchIndexPromise;
    }
    if (typeof controller.loadCourseDocument !== "function") {
      return Promise.reject(new TypeError("O índice curricular deste curso não está disponível."));
    }
    courseSearchIndexRevision = revision;
    courseSearchIndexFailed = false;
    const pending = Promise.resolve(
      controller.loadCourseDocument(state.courseId, { verifiedRevision: revision })
    ).then((loaded) => Object.freeze({
      project: loaded?.document,
      index: buildCourseInspectionSearchIndex(loaded?.document, state.courseId, {
        courseTitle: state.courseTitle,
        authoringParts: state.scopeOptions.authoringParts
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
    state.observationTargetIds = [studyUnitId];
    state.observationSheetOpen = true;
    state.observationItems = [];
    state.observationCollectionSummary = null;
    if (!hasObservationDraft()) state.observationDraft = { category: null, rawText: "" };
    state.observationDraftStudyUnitId = studyUnitId;
    state.observationEditingId = null;
    state.observationError = "";
    state.observationMessage = "";
    state.pendingBatchObservation = null;
    state.observationLoading = true;
    state.restoreObservationFocus = true;
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
        state.observationError = publicErrorMessage(
          error,
          "Não foi possível carregar as observações."
        );
      }
      return false;
    } finally {
      if (!state.destroyed && epoch === observationEpoch) {
        state.observationLoading = false;
        state.restoreObservationFocus = true;
        render();
      }
    }
  }

  function openBatchObservations() {
    const targetIds = [...state.selectedStudyUnitIds];
    if (targetIds.length < 2 || state.observationSaving) return false;
    if (state.manualSaving || state.manualUnknownSignature || state.manualStudyUnitId && manualDraftChanged()) {
      return blockModeChange(state.manualStudyUnitId || state.activeStudyUnitId, "manual",
        "Retome a edição para salvar ou cancelar antes de iniciar a observação em lote.");
    }
    if (state.manualStudyUnitId) resetManualEditor({ renderNow: false });
    const preserveDraft = hasObservationDraft() || Boolean(state.pendingBatchObservation);
    if (preserveDraft && state.observationDraftStudyUnitId !== targetIds[0]) {
      state.observationError = "Conclua a observação em rascunho antes de mudar de alvo.";
      state.observationSheetOpen = true;
      state.restoreObservationFocus = true;
      render();
      return false;
    }
    const anchor = captureAnchor();
    anchor.controlKey = "";
    anchor.openControlKeys = [];
    ++observationEpoch;
    state.observationStudyUnitId = targetIds[0];
    state.observationTargetIds = targetIds;
    state.observationSheetOpen = true;
    state.observationItems = [];
    state.observationCollectionSummary = null;
    if (!preserveDraft) state.observationDraft = { category: null, rawText: "" };
    state.observationDraftStudyUnitId = targetIds[0];
    state.observationEditingId = null;
    state.observationError = "";
    state.observationMessage = "";
    state.pendingObservationMutation = null;
    if (!preserveDraft) state.pendingBatchObservation = null;
    state.observationLoading = false;
    state.restoreObservationFocus = true;
    render({ anchor });
    return true;
  }

  async function mutateBatchObservation(targetIds, rawText, category) {
    if (typeof controller.mutateCourseAnchoredAnnotations !== "function" ||
        !Array.isArray(targetIds) || targetIds.length < 2) return false;
    const draft = { targetIds: [...targetIds], rawText, category };
    if (state.pendingBatchObservation &&
        !pendingObservationMatches(state.pendingBatchObservation, draft)) {
      state.observationError =
        "Um envio parcial ainda precisa ser concluído com o mesmo texto antes de iniciar outro.";
      state.restoreObservationFocus = true;
      render();
      return false;
    }
    if (state.manualStudyUnitId) {
      state.manualError = "Salve ou cancele a edição antes de mudar de unidade.";
      render();
      return false;
    }
    state.pendingBatchObservation ||= {
      draft: structuredClone(draft),
      requests: targetIds.map((targetId) => {
        const command = normalizeCourseAnchoredAnnotationCommand({
          type: "create_anchored_annotation",
          annotationId: createUuid(),
          target: { kind: "study_unit", id: targetId },
          rawText,
          category,
          briefSummary: null,
          capturedAt: new Date().toISOString()
        });
        return {
          targetId,
          request: {
            requestId: createUuid(),
            courseId: state.courseId,
            expectedCourseRevision: state.pinnedRevision,
            command
          }
        };
      }),
      completedTargetIds: []
    };
    const pending = state.pendingBatchObservation;
    const completed = new Set(pending.completedTargetIds);
    state.observationSaving = true;
    state.observationError = "";
    state.observationMessage = "";
    state.restoreObservationCloseFocus = true;
    render();
    try {
      for (const entry of pending.requests) {
        if (completed.has(entry.targetId)) continue;
        const change = normalizeCourseAnchoredAnnotationChange(
          await controller.mutateCourseAnchoredAnnotations(structuredClone(entry.request))
        );
        if (change.courseId !== state.courseId ||
            change.requestId !== entry.request.requestId ||
            change.annotation &&
              change.annotation.annotationId !== entry.request.command.annotationId) {
          throw new TypeError("A confirmação não corresponde à observação enviada.");
        }
        completed.add(entry.targetId);
        pending.completedTargetIds = [...completed];
        state.observationCounts[entry.targetId] =
          Number(state.observationCounts[entry.targetId] || 0) + 1;
      }
      state.pendingBatchObservation = null;
      state.observationDraft = { category: null, rawText: "" };
      state.observationDraftStudyUnitId = targetIds[0];
      state.observationMessage =
        `Observação registrada separadamente em ${targetIds.length} unidades. Você pode registrar outra.`;
      return true;
    } catch (error) {
      const detail = publicErrorMessage(
        error,
        "Não foi possível concluir todas as observações."
      );
      state.observationError = completed.size > 0
        ? `${completed.size} de ${targetIds.length} observações foram registradas. ${detail} Tente novamente sem alterar o texto.`
        : detail;
      state.restoreObservationFocus = true;
      return false;
    } finally {
      state.observationSaving = false;
      state.restoreObservationFocus = true;
      render();
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
    state.restoreObservationCloseFocus = true;
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
      reportFeedback(successMessage);
      state.observationMessage = `${successMessage} Você pode registrar outra Observação.`;
      return true;
    } catch (error) {
      if (mutationConfirmed) {
        state.observationError = `${successMessage} Não foi possível atualizar a lista agora.`;
        return true;
      }
      const ambiguous = ambiguousObservationFailure(error);
      if (!ambiguous) state.pendingObservationMutation = null;
      const detail = publicErrorMessage(error, "Não foi possível alterar a observação.");
      state.observationError = ambiguous
        ? `${detail} Tente novamente para confirmar exatamente a mesma operação.`
        : detail;
      state.restoreObservationFocus = true;
      return false;
    } finally {
      state.observationSaving = false;
      state.restoreObservationFocus = true;
      render();
    }
  }

  async function loadInitial({
    anchorStudyUnitId = state.requestedAnchorStudyUnitId,
    offset = 0,
    allowRebase = true,
    entry = null
  } = {}) {
    const hasRequestedPosition = Boolean(anchorStudyUnitId);
    const epoch = ++requestEpoch;
    state.loadingDirection = "";
    state.initialLoading = true;
    state.initialFailure = "";
    state.targetMissing = false;
    render({ anchor: { studyUnitId: anchorStudyUnitId, offsetFromStickyTop: offset }, initial: true });
    try {
      const page = await readCoherentPage(pageOptions({ anchorStudyUnitId, entry }), epoch);
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
      return true;
    } catch (error) {
      if (state.destroyed || epoch !== requestEpoch) return false;
      const message = statusMessage(error);
      if ([401, 403].includes(Number(error?.status))) {
        state.items = [];
        state.totalCount = 0;
        state.offlineKnown = false;
      }
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
    if (state.manualStudyUnitId && manualDraftChanged()) {
      return blockModeChange(state.manualStudyUnitId, "manual", "Salve ou cancele sua edição antes de carregar outras unidades. Seu texto foi preservado.");
    }
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
      if (error?.code === "course_revision_changed" && !hasPendingDraft()) {
        return loadInitial({ anchorStudyUnitId: anchor.studyUnitId, offset: anchor.offsetFromStickyTop });
      }
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
    if (state.manualStudyUnitId) {
      state.manualError = "Salve ou cancele a edição antes de mudar de unidade.";
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
    await Promise.resolve(onStudyUnitChange(result.id));
    scheduleSave();
    return true;
  }

  function activeItem() {
    return state.items.find(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId) ||
      state.items[0] || null;
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
      offsetFromStickyTop: state.multipleView ? 0 : interactionAnchor.offsetFromStickyTop,
      containerScrollTop: state.multipleView ? undefined : scrollTarget?.scrollTop
    };
    if (!selectStudyUnit(target.studyUnit.id, { anchor: targetAnchor })) return false;
    restoreAnchor(targetAnchor, { initial: true });
    if (!state.multipleView) await Promise.resolve(onStudyUnitChange(target.studyUnit.id));
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
    if (state.manualStudyUnitId && state.manualStudyUnitId !== studyUnitId) {
      state.manualError = "Salve ou cancele a edição antes de mudar de unidade.";
      render();
      return false;
    }
    state.activeStudyUnitId = studyUnitId;
    state.selectedStudyUnitId = studyUnitId;
    state.observationDraftStudyUnitId = studyUnitId;
    state.observationError = "";
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

  async function openUnitContext(control, kind) {
    const item = state.items.find(({ studyUnit }) =>
      studyUnit.id === String(control.dataset.studyUnitId || ""));
    if (!item || (kind === "parameters" ? !state.canAccessDesign : !state.canEditSources)) return false;
    if (state.manualSaving) return false;
    captureManualDraft();
    closeOpenMenus();
    const anchor = captureAnchor();
    anchor.studyUnitId = item.studyUnit.id;
    const escapedId = item.studyUnit.id.replace(/["\\]/gu, "\\$&");
    const element = root.querySelector?.(`[data-inspection-study-unit="${escapedId}"]`);
    if (element?.getBoundingClientRect) {
      anchor.offsetFromStickyTop = element.getBoundingClientRect().top - stickyTop();
    }
    const returnFocusKey = String(control.dataset.inspectionControlKey ||
      `${kind === "parameters" ? "design" : "sources"}:${item.studyUnit.id}`);
    const returnPosition = {
      scope: state.scope,
      studyUnitId: item.studyUnit.id,
      offsetFromStickyTop: anchor.offsetFromStickyTop,
      courseRevision: state.pinnedRevision
    };
    await savePositionNow(anchor);
    try {
      return await Promise.resolve(kind === "parameters"
        ? onOpenParameters({
          studyUnitId: item.studyUnit.id,
          targetScope: { kind: "study_unit", ref: item.studyUnit.id },
          targetLabel: item.studyUnit.title,
          returnFocusKey,
          returnPosition
        })
        : onEditSources({
          targetKind: "study_unit",
          targetId: item.studyUnit.id,
          targetVersion: item.version,
          targetLabel: item.studyUnit.title,
          targetStudyUnit: structuredClone(item.studyUnit),
          returnFocusKey,
          returnPosition
        }));
    } catch (error) {
      state.manualStatus = publicErrorMessage(error, "Não foi possível abrir este contexto.");
      state.manualStatusError = true;
      render({ anchor: { ...anchor, controlKey: returnFocusKey }, captureDraft: false });
      return false;
    }
  }

  function blockModeChange(studyUnitId, kind, message) {
    state.modeBlock = { studyUnitId, kind, message };
    render({ anchor: { ...captureAnchor(), studyUnitId, controlKey: `pending:${studyUnitId}` } });
    return false;
  }

  function canFocusUnit(studyUnitId, { editing = false } = {}) {
    if (state.pendingBatchObservation || state.pendingObservationMutation || state.observationSaving ||
        hasObservationDraft() && (editing || state.observationTargetIds.length > 1 ||
          state.observationDraftStudyUnitId !== studyUnitId)) {
      return blockModeChange(studyUnitId, "observation",
        "Sua observação foi preservada. Retome o rascunho ou conclua o envio antes de mudar de alvo.");
    }
    if (state.manualSaving || state.manualUnknownSignature || state.manualStudyUnitId &&
        state.manualStudyUnitId !== studyUnitId && manualDraftChanged()) {
      return blockModeChange(studyUnitId, "manual",
        "Sua edição foi preservada. Retome a unidade em edição para salvar ou cancelar antes de mudar de alvo.");
    }
    return true;
  }

  function focusUnit(studyUnitId, { renderNow = true, controlKey = `view:${studyUnitId}` } = {}) {
    if (!state.items.some(({ studyUnit }) => studyUnit.id === studyUnitId)) return false;
    if (!canFocusUnit(studyUnitId)) return false;
    if (state.manualStudyUnitId && state.manualStudyUnitId !== studyUnitId) resetManualEditor({ renderNow: false });
    const epoch = ++requestEpoch;
    state.loadingDirection = "";
    state.initialLoading = false;
    state.multipleView = false;
    if (!hasObservationDraft()) state.selectedStudyUnitIds.clear();
    state.activeStudyUnitId = studyUnitId;
    state.selectedStudyUnitId = studyUnitId;
    state.requestedAnchorStudyUnitId = studyUnitId;
    if (!hasObservationDraft()) state.observationDraftStudyUnitId = studyUnitId;
    state.modeBlock = null;
    const anchor = { ...captureAnchor(), studyUnitId, offsetFromStickyTop: 0, controlKey };
    if (renderNow) render({ anchor });
    void Promise.resolve(onStudyUnitChange(studyUnitId)).then(() =>
      !state.destroyed && epoch === requestEpoch ? savePositionNow(anchor) : false).catch(() => false);
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
    keepHistoryPreview = false,
    renderNow = true
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
    state.manualStatusError = false;
    state.manualRestoreFocus = "";
    state.manualUnknownSignature = "";
    state.manualDiscardArmed = false;
    if (renderNow) render();
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
    if (!state.canEditManually) return false;
    if (!canFocusUnit(studyUnitId, { editing: true })) return false;
    if (state.multipleView && !focusUnit(studyUnitId, { renderNow: false, controlKey: "" })) return false;
    if (state.manualStudyUnitId === studyUnitId && manualDraftChanged()) {
      state.manualRestoreFocus = "field";
      render();
      return true;
    }
    const item = manualItem(studyUnitId);
    if (!item) return false;
    state.manualStudyUnitId = studyUnitId;
    state.manualTargetId = targetId;
    state.manualDraft = { pathValues: structuredClone(pathValues) };
    state.manualOrigin = origin;
    state.manualError = "";
    state.manualStatus = status;
    state.manualStatusError = false;
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
    const item = manualItem(canonicalId(studyUnitId, "A unidade do rascunho"));
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
      throw new TypeError("A unidade confirmada não corresponde à edição enviada.");
    }
    const resultVersion = result?.version ?? result?.studyUnitVersion;
    const version = resultVersion == null
      ? current.version + 1
      : natural(resultVersion, "A versão salva da unidade", { minimum: 1 });
    if (result?.courseRevision != null) {
      state.pinnedRevision = natural(
        result.courseRevision,
        "A revisão salva do curso",
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
      state.manualError = publicErrorMessage(error, "A edição não pôde ser validada.");
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
        : publicErrorMessage(error, "Não foi possível salvar a edição.");
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
    const parameters = event.target.closest?.("[data-inspection-open-parameters]");
    if (parameters) return openUnitContext(parameters, "parameters");
    const sources = event.target.closest?.("[data-inspection-edit-sources]");
    if (sources) return openUnitContext(sources, "sources");
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
        state.manualStatus = publicErrorMessage(error, "Não foi possível abrir a edição.");
        state.manualStatusError = true;
        render();
        return false;
      }
    }
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
    const pendingAction = event.target.closest?.("[data-inspection-pending-action]");
    if (pendingAction && state.modeBlock) {
      const kind = state.modeBlock.kind;
      state.modeBlock = null;
      if (kind === "observation") {
        if (state.pendingBatchObservation || state.observationTargetIds.length > 1 ||
            !hasObservationDraft() && state.selectedStudyUnitIds.size > 1) return openBatchObservations();
        return openObservations(state.observationDraftStudyUnitId);
      }
      const studyUnitId = state.manualStudyUnitId;
      state.multipleView = false;
      state.activeStudyUnitId = studyUnitId;
      state.manualRestoreFocus = "field";
      render({ anchor: { studyUnitId, offsetFromStickyTop: 0 } });
      return true;
    }
    const viewAction = event.target.closest?.("[data-inspection-view-action]");
    if (viewAction) {
      const studyUnitId = String(viewAction.dataset.studyUnitId || "");
      if (!state.items.some(({ studyUnit }) => studyUnit.id === studyUnitId)) return false;
      if (state.multipleView) return focusUnit(studyUnitId);
      const anchor = { ...captureAnchor(), studyUnitId, controlKey: `view:${studyUnitId}` };
      state.multipleView = true;
      state.modeBlock = null;
      render({ anchor });
      return true;
    }
    const selectionAction = event.target.closest?.("[data-inspection-selection-action]");
    if (selectionAction) {
      const action = selectionAction.dataset.inspectionSelectionAction;
      if (action === "toggle-unit" && state.multipleView) {
        const studyUnitId = String(selectionAction.dataset.studyUnitId || "");
        if (!state.items.some(({ studyUnit }) => studyUnit.id === studyUnitId)) return false;
        if (state.pendingBatchObservation || state.pendingObservationMutation || state.observationSaving || hasObservationDraft()) {
          return blockModeChange(studyUnitId, "observation",
            "Conclua a observação em rascunho ou o envio parcial antes de mudar os alvos da seleção.");
        }
        const anchor = captureAnchor();
        anchor.controlKey = `selection:${studyUnitId}`;
        if (state.selectedStudyUnitIds.has(studyUnitId)) {
          state.selectedStudyUnitIds.delete(studyUnitId);
        } else if (state.selectedStudyUnitIds.size < 64) {
          state.selectedStudyUnitIds.add(studyUnitId);
        } else {
          return blockModeChange(studyUnitId, "observation", "A seleção aceita até 64 unidades. Conclua este lote antes de selecionar mais alvos.");
        }
        state.modeBlock = null;
        render({ anchor });
        return true;
      }
      if (action === "observe-selected") return openBatchObservations();
      if (action === "clear" && state.multipleView) {
        if (state.pendingBatchObservation || state.pendingObservationMutation || state.observationSaving || hasObservationDraft()) {
          return blockModeChange(state.activeStudyUnitId, "observation", "Retome a observação antes de limpar os alvos do rascunho ou envio parcial.");
        }
        state.selectedStudyUnitIds.clear();
        state.modeBlock = null;
        render({ anchor: captureAnchor() });
        return true;
      }
      if (state.multipleView && ["forward", "backward"].includes(action)) return loadDirection(action);
    }
    const observations = event.target.closest?.("[data-inspection-observations]");
    if (observations) {
      const studyUnitId = String(observations.dataset.studyUnitId || "");
      if (state.observationSheetOpen && state.observationStudyUnitId === studyUnitId) {
        if (state.pendingBatchObservation || state.pendingObservationMutation || state.observationSaving) {
          state.observationError = "Conclua o envio pendente antes de fechar esta observação.";
          render();
          return false;
        }
        ++observationEpoch;
        state.observationSheetOpen = false;
        state.observationStudyUnitId = null;
        if (!hasObservationDraft()) state.observationTargetIds = [];
        state.observationItems = [];
        state.observationCollectionSummary = null;
        state.observationMessage = "";
        state.pendingBatchObservation = null;
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
        if (state.pendingBatchObservation || state.pendingObservationMutation || state.observationSaving) {
          state.observationError = state.pendingBatchObservation
            ? "Conclua o envio parcial antes de fechar esta observação em lote."
            : "Conclua o envio pendente antes de fechar esta observação.";
          state.restoreObservationFocus = true;
          render();
          return true;
        }
        ++observationEpoch;
        const studyUnitId = state.observationStudyUnitId;
        const batch = state.observationTargetIds.length > 1;
        const anchor = captureAnchor();
        if (batch) {
          anchor.controlKey = "selection:observe";
        } else if (studyUnitId) {
          anchor.studyUnitId = studyUnitId;
          anchor.controlKey = `observations:${studyUnitId}`;
        }
        const preserveCreationDraft = !state.observationEditingId && hasObservationDraft();
        state.observationSheetOpen = false;
        state.observationStudyUnitId = null;
        if (!preserveCreationDraft) state.observationTargetIds = [];
        state.observationItems = [];
        state.observationCollectionSummary = null;
        if (!preserveCreationDraft) state.observationDraft = { category: null, rawText: "" };
        state.observationEditingId = null;
        state.observationMessage = "";
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
      try {
        if (typeof navigatorValue?.clipboard?.writeText !== "function") {
          throw new Error("Clipboard indisponível.");
        }
        await navigatorValue.clipboard.writeText(copy.dataset.deepLink);
        reportFeedback("Link copiado.");
      } catch {
        reportFeedback("Não foi possível copiar o link.", { error: true });
      }
      return;
    }
    const action = event.target.closest?.("[data-inspection-action]")?.dataset?.inspectionAction;
    if (action === "latest-updated") {
      if (hasPendingDraft() || state.multipleView) {
        state.manualStatus = "Conclua a edição, observação ou seleção antes de mudar de ponto.";
        state.manualStatusError = true;
        render();
        return false;
      }
      closeOpenMenus();
      state.explicitAnchor = false;
      state.requestedAnchorStudyUnitId = null;
      pendingInitialFocusKey = "context";
      const loaded = await loadInitial({ anchorStudyUnitId: null, entry: "latest_updated" });
      if (loaded && state.activeStudyUnitId) {
        await Promise.resolve(onStudyUnitChange(state.activeStudyUnitId));
        scheduleSave();
      }
      return loaded;
    }
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
    const rawText = state.observationDraft.rawText;
    const issue = validateStudyUnitObservationText(rawText);
    if (issue) {
      state.observationError = issue;
      state.restoreObservationFocus = true;
      render();
      return;
    }
    if (state.observationTargetIds.length > 1) {
      void mutateBatchObservation(
        state.observationTargetIds,
        rawText,
        state.observationDraft.category
      );
      return;
    }
    const submittedStudyUnitId = String(
      event.target.dataset?.studyUnitId || state.observationStudyUnitId || state.selectedStudyUnitId || ""
    );
    if (!state.items.some(({ studyUnit }) => studyUnit.id === submittedStudyUnitId)) {
      state.observationError = "A unidade selecionada não está mais disponível.";
      render();
      return;
    }
    state.observationStudyUnitId = submittedStudyUnitId;
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
        typeof signal.studyUnitId !== "string" ||
        Date.now() - lastInteractionAt < 1_500 || state.initialLoading || state.loadingDirection ||
        hasPendingDraft() || state.multipleView) {
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
      state.pendingObservationMutation || state.pendingBatchObservation || state.confirmation ||
      state.observationSaving || draftChanged || state.manualSaving ||
      manualDraftChanged()
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
          "A unidade de estudo da posição"
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
    refreshContext(nextRevision, { returnPosition = null, returnFocusKey = "" } = {}) {
      return this.refresh(nextRevision, { contextual: true, returnPosition, returnFocusKey });
    },
    previewManualEdit({
      studyUnitId,
      targetId,
      pathValues,
      origin = "provider_assistance"
    } = {}) {
      return previewManualDraft({ studyUnitId, targetId, pathValues, origin });
    },
    async refresh(nextRevision = state.pinnedRevision, {
      contextual = false, returnPosition = null, returnFocusKey = ""
    } = {}) {
      const revision = natural(nextRevision, "A revisão do curso", { minimum: 1 });
      if (state.manualSaving || state.manualUnknownSignature ||
          state.pendingBatchObservation || state.pendingObservationMutation) return false;
      resetFailedCourseSearchIndex();
      const epoch = ++requestEpoch;
      const position = returnPosition == null ? null : normalizeInspectionPosition(returnPosition);
      const anchor = {
        ...(position || captureAnchor()),
        ...(returnFocusKey ? { controlKey: returnFocusKey } : {})
      };
      captureManualDraft();
      const manualEditId = state.manualStudyUnitId;
      const localEditItem = manualEditId
        ? state.items.find(({ studyUnit }) => studyUnit.id === manualEditId) || null : null;
      const previousRevision = state.pinnedRevision;
      state.stale = true;
      state.loadingDirection = "refresh";
      state.pinnedRevision = revision;
      try {
        let page = await readCoherentPage(pageOptions({ anchorStudyUnitId: anchor.studyUnitId }), epoch);
        if (state.destroyed || epoch !== requestEpoch) return false;
        if (localEditItem) {
          const refreshed = page.items.find(({ studyUnit }) =>
            studyUnit.id === localEditItem.studyUnit.id) || null;
          const sameContext = refreshed && ["module", "lesson", "didacticMicrosequence"]
            .every((kind) => refreshed.curriculumPath[kind].id === localEditItem.curriculumPath[kind].id);
          if (!refreshed || (!contextual && refreshed.version !== localEditItem.version) ||
              !sameContext || !sameStudyUnit(refreshed.studyUnit, localEditItem.studyUnit)) {
            state.pinnedRevision = previousRevision;
            state.stale = true;
            state.loadingDirection = "";
            const message =
              "Esta unidade mudou fora desta tela. Cancele a edição local para carregar a versão atual.";
            state.manualError = message;
            render({ anchor, captureDraft: false });
            return false;
          }
        }
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
        state.stale = page.stale;
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
        if (localEditItem) {
          state.pinnedRevision = previousRevision;
          state.stale = true;
          state.loadingDirection = "";
          const message = "Não foi possível conferir a unidade atual. Seu rascunho foi preservado. " +
            statusMessage(error);
          state.manualError = message;
          render({ anchor, captureDraft: false });
          return false;
        }
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
        if ([401, 403].includes(Number(refreshError?.status))) {
          state.items = [];
          state.totalCount = 0;
          state.offlineKnown = false;
        }
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
      state.initialLoading = false;
      state.loadingDirection = "";
      root.setAttribute?.("aria-busy", "false");
      onReadState({ syncing: false });
      studyTools.destroy();
      ++requestEpoch;
      manualInlineController?.destroy?.();
      manualInlineController = null;
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
    }
  });
}
