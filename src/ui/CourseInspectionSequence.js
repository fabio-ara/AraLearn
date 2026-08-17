import { UUID_PATTERN } from "../domain/identifiers.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { renderPackageStudyUnitBlocksWithDock } from
  "../render/renderPackageStudyUnit.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";

const PAGE_CONTRACT = "aralearn.course-study-unit-inspection-page.v1";
const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const MAX_WINDOW_ITEMS = 36;
const MAX_PAGE_BYTES = 1_500_000;
const ENTITY_ID_MAX_LENGTH = 240;
const DEEP_LINK_MAX_LENGTH = 2_048;
const POSITION_CHANNEL_NAME = "aralearn.course-authoring-inspection.v1";
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
    ["id", "position", "title", "role", "content", "response", "feedback", "topics", "sources"],
    "Uma Unidade de estudo da Inspeção é inválida."
  );
  const cloned = structuredClone(value);
  cloned.id = canonicalId(cloned.id, "A identidade da Unidade de estudo");
  cloned.position = natural(cloned.position, "A posição da Unidade de estudo", { minimum: 1 });
  cloned.title = requiredText(cloned.title, "O título da Unidade de estudo");
  if (!new Set(["theory", "practice"]).has(cloned.role) || !Array.isArray(cloned.content) ||
      !Array.isArray(cloned.feedback) || !Array.isArray(cloned.topics) || !Array.isArray(cloned.sources)) {
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

function renderStudyUnit(item, totalCount) {
  const path = item.curriculumPath;
  const runtime = renderPackageStudyUnitBlocksWithDock(item.studyUnit, {
    omitRepeatedHeading: true,
    blockKeyPrefix: `inspection:${item.studyUnit.id}`
  });
  const part = item.authoringPart;
  return `<li class="course-inspection-item" data-inspection-study-unit="${escapeHtml(item.studyUnit.id)}"` +
    ` data-inspection-ordinal="${item.ordinal}"><article aria-labelledby="inspection-study-unit-${escapeHtml(item.studyUnit.id)}">` +
    '<header class="course-inspection-item-heading"><div>' +
    `<p>${escapeHtml(path.module.title)} · ${escapeHtml(path.lesson.title)}</p>` +
    `<span>${escapeHtml(path.didacticMicrosequence.title)} · Unidade ${item.ordinal} de ${totalCount}</span>` +
    `<h3 id="inspection-study-unit-${escapeHtml(item.studyUnit.id)}">${escapeHtml(item.studyUnit.title)}</h3></div>` +
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
    "</div></details></header>" +
    (runtime.dockHtml
      ? '<p class="course-inspection-response-notice">Respostas desativadas durante a inspeção.</p>'
      : "") +
    '<div class="runtime-card-rendered-content course-inspection-runtime">' +
    `<div class="card-sheet-content">${runtime.bodyHtml}</div>${runtime.dockHtml}</div>` +
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

function renderSequence(state) {
  const active = state.items.find(({ studyUnit }) => studyUnit.id === state.activeStudyUnitId) ||
    state.items[0] || null;
  const beforeCount = state.items.length ? Math.max(0, state.items[0].ordinal - 1) : 0;
  const afterCount = state.items.length
    ? Math.max(0, state.totalCount - state.items[state.items.length - 1].ordinal)
    : 0;
  const notice = state.offlineKnown
    ? '<p class="course-authoring-notice" role="status">Sem conexão · exibindo Unidades de estudo salvas neste dispositivo.</p>'
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
      state.items.map((item) => renderStudyUnit(item, state.totalCount)).join("") +
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
    notice + body + '<p class="course-inspection-copy-status" role="status" aria-live="polite"></p></section>';
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
  windowValue = globalThis.window || null,
  documentValue = globalThis.document || null,
  navigatorValue = globalThis.navigator || null
} = {}) {
  if (!root || typeof root.addEventListener !== "function" ||
      typeof controller?.loadAuthoringStudyUnits !== "function" ||
      typeof controller?.loadAuthoringInspectionPosition !== "function" ||
      typeof controller?.saveAuthoringInspectionPosition !== "function" ||
      !UUID_PATTERN.test(String(course?.courseId || "")) ||
      !Number.isSafeInteger(course?.revision) || course.revision < 1) {
    throw new TypeError("Dependências da sequência de Inspeção são inválidas.");
  }
  const requested = inspectionRequestFromTarget(routeTarget);
  const state = {
    courseId: course.courseId,
    pinnedRevision: course.revision,
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
    destroyed: false
  };
  let observer = null;
  let scrollFrame = null;
  let saveTimer = null;
  let requestEpoch = 0;
  let positionChannel = null;
  let lastInteractionAt = 0;
  let suppressBroadcastStudyUnitId = "";

  function markInteraction() {
    lastInteractionAt = Date.now();
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
    if ((initial || Math.abs(delta) > 0.5) && typeof windowValue?.scrollBy === "function") {
      windowValue.scrollBy({ top: delta, left: 0, behavior: "auto" });
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

  function render({ anchor = null, initial = false } = {}) {
    if (state.destroyed) return;
    const snapshot = anchor || captureAnchor();
    root.innerHTML = renderSequence(state);
    root.setAttribute?.("aria-busy", String(state.initialLoading || Boolean(state.loadingDirection)));
    void hydrate().then(() => {
      restoreAnchor(snapshot, { initial });
      updateActiveFromViewport();
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

  async function loadInitial({
    anchorStudyUnitId = state.requestedAnchorStudyUnitId,
    offset = 0,
    allowRebase = true
  } = {}) {
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
          initial: true
        });
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

  function savePositionNow() {
    if (saveTimer != null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const anchor = captureAnchor();
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

  async function navigateScope(scope) {
    const route = buildCourseAuthoringRoute(state.courseId, {
      section: "inspection",
      ...scopeRouteOptions(scope)
    });
    return onNavigate(route);
  }

  async function handleClick(event) {
    const route = event.target.closest?.("[data-inspection-route]");
    if (route) {
      event.preventDefault?.();
      return onNavigate(route.getAttribute("href"));
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
    if (!event.target.matches?.("[data-inspection-scope]")) return;
    void navigateScope(parseScopeSelection(event.target.value));
  }

  async function handlePositionSignal(event) {
    const signal = event?.data;
    if (!isPlainObject(signal) || Object.keys(signal).length !== 3 ||
        signal.courseId !== state.courseId || signal.revision !== state.pinnedRevision ||
        typeof signal.studyUnitId !== "string" ||
        Date.now() - lastInteractionAt < 1_500 || state.initialLoading || state.loadingDirection) {
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

  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  root.addEventListener("pointerdown", markInteraction, { passive: true });
  root.addEventListener("keydown", markInteraction);
  root.addEventListener("focusin", markInteraction);
  windowValue?.addEventListener?.("scroll", onScroll, { passive: true });
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
    async refresh(nextRevision = state.pinnedRevision) {
      const revision = natural(nextRevision, "A revisão do Curso", { minimum: 1 });
      if (revision === state.pinnedRevision) return true;
      const anchor = captureAnchor();
      const previousRevision = state.pinnedRevision;
      state.stale = true;
      state.pinnedRevision = revision;
      try {
        let page = await readPage(pageOptions({ anchorStudyUnitId: anchor.studyUnitId }));
        if (anchor.studyUnitId && page.items.length === 0 && page.totalCount > 0) {
          if (state.explicitTarget) {
            state.items = [];
            state.totalCount = page.totalCount;
            state.scopeOptions = page.scopeOptions;
            state.targetMissing = true;
            state.stale = false;
            render({ anchor });
            return false;
          }
          page = await readPage(pageOptions());
        }
        state.items = [];
        mergePage(page, "initial");
        state.activeStudyUnitId = page.items.some(({ studyUnit }) => studyUnit.id === anchor.studyUnitId)
          ? anchor.studyUnitId
          : page.items[0]?.studyUnit.id || null;
        state.stale = false;
        state.targetMissing = false;
        render({ anchor });
        return true;
      } catch (error) {
        let refreshError = error;
        if (statusMessage(error) === "Ponto não encontrado.") {
          if (state.explicitTarget) {
            state.items = [];
            state.totalCount = 0;
            state.targetMissing = true;
            state.stale = false;
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
            state.items = [];
            mergePage(page, "initial");
            state.activeStudyUnitId = page.items[0]?.studyUnit.id || null;
            state.targetMissing = false;
            state.stale = false;
            render({ anchor: { studyUnitId: state.activeStudyUnitId, offsetFromStickyTop: 0 } });
            return true;
          } catch (rebaseError) {
            refreshError = rebaseError;
          }
        }
        state.pinnedRevision = previousRevision;
        state.initialFailure = statusMessage(refreshError);
        state.stale = true;
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
      windowValue?.removeEventListener?.("scroll", onScroll);
      root.removeEventListener?.("click", handleClick);
      root.removeEventListener?.("change", handleChange);
      root.removeEventListener?.("pointerdown", markInteraction);
      root.removeEventListener?.("keydown", markInteraction);
      root.removeEventListener?.("focusin", markInteraction);
      positionChannel?.removeEventListener?.("message", handlePositionSignal);
      positionChannel?.close?.();
      positionChannel = null;
      if (scrollFrame != null && typeof windowValue?.cancelAnimationFrame === "function") {
        windowValue.cancelAnimationFrame(scrollFrame);
      }
    }
  });
}
