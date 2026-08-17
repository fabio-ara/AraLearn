import { renderUiIcon } from "./renderUiIcons.js";
import { createUuid } from "../domain/identifiers.js";
import { captureRenderState, restoreRenderState } from "./renderState.js";
import { createCourseInspectionSequence } from "./CourseInspectionSequence.js";
import {
  buildCourseAuthoringRoute,
  isCourseAuthoringRouteCandidate,
  parseCourseAuthoringRoute
} from "./courseAuthoringRoute.js";
import {
  classifyCourseAuthoringError,
  courseListCardinality,
  mergeCourseListPages,
  normalizeCourseAuthoringOutline,
  normalizeCourseAuthoringPlan,
  normalizeCourseDetail,
  normalizeCourseListPage,
  projectCoursePlanning
} from "./courseAuthoringViewModel.js";

const DEFAULT_COURSE_LIMIT = 24;
const PART_RANGE_ORIGIN_LABELS = Object.freeze({
  automatic: "Escolha automática",
  author: "Definida pelo autor",
  research_condition: "Condição de pesquisa"
});
const PLAN_ITEM_LABELS = Object.freeze({
  intendedLearningOutcomes: "Resultados de aprendizagem",
  instructionalAnalysisUnits: "Unidades de análise instrucional",
  evidenceRequirements: "Requisitos de evidência"
});
const PLAN_ITEM_KINDS = Object.freeze({
  intendedLearningOutcomes: "intended_learning_outcome",
  instructionalAnalysisUnits: "instructional_analysis_unit",
  evidenceRequirements: "evidence_requirement"
});
const PART_STATUS_LABELS = Object.freeze({
  planned: "Planejada",
  materializing: "Em materialização",
  attention_required: "Precisa de atenção",
  partially_materialized: "Parcial",
  materialized: "Materializada"
});
const ACTIVITY_LABELS = Object.freeze({
  plan_changed: "Planejamento alterado",
  materialization_started: "Materialização iniciada",
  materialization_step_recorded: "Etapa de materialização registrada",
  materialization_finished: "Materialização finalizada"
});
const MATERIALIZATION_STATUS_LABELS = Object.freeze({
  running: "Em andamento",
  completed: "Concluída",
  failed: "Falhou"
});
const MATERIALIZATION_STEP_STATUS_LABELS = Object.freeze({
  pending: "Pendente",
  completed: "Concluída",
  failed: "Falhou"
});
const MATERIALIZATION_STEP_KIND_LABELS = Object.freeze({
  context_load: "Carregar contexto",
  didactic_microsequence_materialization: "Produzir microssequência",
  validation: "Validar produção"
});
const MATERIALIZATION_FIELDS = new Set([
  "id", "authoringPartVersion", "channel", "status", "version", "designContext",
  "resultFacts", "startedAt", "updatedAt", "completedAt", "steps", "nextPendingStep"
]);
const MATERIALIZATION_STEP_FIELDS = new Set([
  "id", "position", "kind", "targetDidacticMicrosequenceId", "productionPosition",
  "status", "version", "resultFacts", "updatedAt", "completedAt"
]);
const MATERIALIZATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function exactRecord(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.size &&
    Object.keys(value).every((field) => fields.has(field));
}

function materializationReadError() {
  return new TypeError("A leitura das etapas da materialização é inválida.");
}

function normalizeMaterializationStep(value) {
  if (!exactRecord(value, MATERIALIZATION_STEP_FIELDS)) throw materializationReadError();
  const step = structuredClone(value);
  step.id = String(step.id || "").trim().toLowerCase();
  step.kind = String(step.kind || "").trim();
  step.status = String(step.status || "").trim();
  if (!MATERIALIZATION_UUID.test(step.id) ||
      !Number.isSafeInteger(step.position) || step.position < 0 || step.position > 63 ||
      !Object.hasOwn(MATERIALIZATION_STEP_KIND_LABELS, step.kind) ||
      !Object.hasOwn(MATERIALIZATION_STEP_STATUS_LABELS, step.status) ||
      !Number.isSafeInteger(step.version) || step.version < 1 ||
      !step.resultFacts || typeof step.resultFacts !== "object" ||
      Array.isArray(step.resultFacts)) {
    throw materializationReadError();
  }
  return Object.freeze(step);
}

function normalizePartMaterializationRead(value, {
  expectedCourseId,
  expectedAuthoringPartId,
  expectedMaterializationId
} = {}) {
  const topFields = new Set([
    "contract", "courseId", "courseRevision", "authoringPartId", "materialization"
  ]);
  if (!exactRecord(value, topFields) ||
      value.contract !== "aralearn.course-authoring-part-materialization.v1" ||
      value.courseId !== expectedCourseId || value.authoringPartId !== expectedAuthoringPartId ||
      !Number.isSafeInteger(value.courseRevision) || value.courseRevision < 1 ||
      !exactRecord(value.materialization, MATERIALIZATION_FIELDS)) {
    throw materializationReadError();
  }
  const materialization = structuredClone(value.materialization);
  materialization.id = String(materialization.id || "").trim().toLowerCase();
  if (materialization.id !== expectedMaterializationId ||
      !MATERIALIZATION_UUID.test(materialization.id) ||
      !Number.isSafeInteger(materialization.authoringPartVersion) ||
      materialization.authoringPartVersion < 1 ||
      !Object.hasOwn(MATERIALIZATION_STATUS_LABELS, materialization.status) ||
      !new Set(["application", "mcp"]).has(materialization.channel) ||
      !Number.isSafeInteger(materialization.version) || materialization.version < 1 ||
      !materialization.designContext || typeof materialization.designContext !== "object" ||
      Array.isArray(materialization.designContext) ||
      !materialization.resultFacts || typeof materialization.resultFacts !== "object" ||
      Array.isArray(materialization.resultFacts) ||
      !Array.isArray(materialization.steps) || materialization.steps.length < 1 ||
      materialization.steps.length > 64) {
    throw materializationReadError();
  }
  const steps = materialization.steps.map(normalizeMaterializationStep);
  if (steps.some((step, index) => step.position !== index) ||
      new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw materializationReadError();
  }
  const nextPendingStep = materialization.nextPendingStep == null
    ? null
    : normalizeMaterializationStep(materialization.nextPendingStep);
  if (nextPendingStep && !steps.some((step) =>
    step.id === nextPendingStep.id && step.version === nextPendingStep.version &&
    step.status === "pending")) {
    throw materializationReadError();
  }
  return Object.freeze({
    contract: value.contract,
    courseId: value.courseId,
    courseRevision: value.courseRevision,
    authoringPartId: value.authoringPartId,
    materialization: Object.freeze({ ...materialization, steps, nextPendingStep })
  });
}

function normalizePerson(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} inválida.`);
  }
  const userId = String(value.userId || "").trim().toLowerCase();
  const displayName = String(value.displayName || "").trim() || null;
  const avatarObjectKey = String(value.avatarObjectKey || "").trim() || null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(userId) ||
      (displayName && displayName.length > 120)) {
    throw new TypeError(`${label} inválida.`);
  }
  return Object.freeze({
    userId,
    displayName,
    avatarObjectKey,
    grantedAt: String(value.grantedAt || "").trim() || null
  });
}

function normalizeCoursePeople(value, courseId) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.courseId !== courseId || !Array.isArray(value.people)) {
    throw new TypeError("A lista de pessoas do Curso é inválida.");
  }
  const owner = normalizePerson(value.owner, "Pessoa proprietária");
  const people = value.people.map((person) => normalizePerson(person, "Pessoa com acesso"));
  if (people.some((person) => person.userId === owner.userId) ||
      new Set(people.map((person) => person.userId)).size !== people.length) {
    throw new TypeError("A lista de pessoas do Curso é inconsistente.");
  }
  return Object.freeze({ owner, people: Object.freeze(people) });
}

function ownershipLabel(value) {
  if (value === "owned") return "Seu Curso";
  if (value === "shared") return "Compartilhado";
  return "";
}

function accessLabel(course) {
  if (course?.ownership === "shared" || course?.canEdit === false) return "Somente leitura";
  return "";
}

function countedLabel(count, singular, plural, partial = false) {
  return `${count}${partial ? "+" : ""} ${count === 1 && !partial ? singular : plural}`;
}

function courseCountsLabel(value) {
  if (!value) return "";
  return countedLabel(value.microsequenceCount, "microssequência", "microssequências") +
    " · " + countedLabel(value.studyUnitCount, "unidade", "unidades");
}

function courseMeta(course) {
  const values = [
    ownershipLabel(course?.ownership),
    accessLabel(course),
    courseCountsLabel(course?.counts)
  ]
    .filter(Boolean);
  return values.length
    ? `<p class="course-authoring-meta">${values.map(escapeHtml).join(" · ")}</p>`
    : "";
}

function statusPanel({ kind = "status", title, message, action = "", actionLabel = "" }) {
  const icon = kind === "error" || kind === "access-revoked" ? "remove-state" :
    kind === "offline-known" ? "cloud" : "folder";
  const role = kind === "error" || kind === "access-revoked" ? "alert" : "status";
  return `<section class="course-authoring-state is-${escapeHtml(kind)}" role="${role}">` +
    renderUiIcon(icon, "course-authoring-state-icon") +
    `<h2>${escapeHtml(title)}</h2>` +
    `<p>${escapeHtml(message)}</p>` +
    (action && actionLabel
      ? `<button type="button" data-course-authoring-action="${escapeHtml(action)}">` +
        `${renderUiIcon("rotate", "course-authoring-button-icon")}<span>${escapeHtml(actionLabel)}</span></button>`
      : "") +
    "</section>";
}

function renderCourseCard(course) {
  const href = buildCourseAuthoringRoute(course.courseId, { section: "inspection" });
  return `<a class="course-authoring-course-card" href="${escapeHtml(href)}"` +
    ` data-course-authoring-action="open-course" data-course-id="${escapeHtml(course.courseId)}"` +
    ` aria-label="Abrir ${escapeHtml(course.title)}">` +
    `<span class="course-authoring-course-icon">${renderUiIcon("folder", "course-authoring-icon")}</span>` +
    '<div class="course-authoring-course-copy">' +
    `<strong>${escapeHtml(course.title)}</strong>` +
    (course.goal ? `<span>${escapeHtml(course.goal)}</span>` : "") +
    courseMeta(course) +
    "</div>" +
    renderUiIcon("arrow-right", "course-authoring-arrow") +
    "</a>";
}

function renderCourseList(state) {
  const page = state.list;
  const cardinality = page ? courseListCardinality(page) : "zero";
  let content;
  if (state.loading && !page) {
    content = '<p class="course-authoring-loading" role="status">Carregando Cursos…</p>';
  } else if (state.failure && !page) {
    content = statusPanel({
      kind: state.failure.kind,
      title: state.failure.kind === "offline-known" ? "Sem conexão" : "Cursos indisponíveis",
      message: state.failure.message,
      action: "retry",
      actionLabel: "Tentar novamente"
    });
  } else if (!page || page.items.length === 0) {
    content = statusPanel({
      kind: page?.offlineKnown ? "offline-known" : "empty",
      title: page?.offlineKnown ? "Nenhum Curso salvo" : "Nenhum Curso ainda",
      message: page?.offlineKnown
        ? "Conecte-se para consultar os Cursos disponíveis."
        : state.query ? "A busca não encontrou Cursos." : "Seus Cursos aparecerão aqui."
    });
  } else {
    content = (page.offlineKnown
      ? '<p class="course-authoring-notice" role="status">Exibindo o que já está neste dispositivo.</p>'
      : "") +
      `<div class="course-authoring-course-list" data-cardinality="${cardinality}">` +
      page.items.map(renderCourseCard).join("") +
      "</div>" +
      (state.failure
        ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure.message)}</p>`
        : "") +
      (page.hasMore
        ? '<button type="button" class="course-authoring-more" data-course-authoring-action="load-more-courses"' +
          (state.loading ? " disabled" : "") + ">" +
          renderUiIcon("arrow-down", "course-authoring-button-icon") +
          `<span>${state.loading ? "Carregando…" : "Carregar mais"}</span></button>`
        : "");
  }
  const createForm = state.createOpen
    ? '<form class="course-authoring-write-form" data-course-authoring-create>' +
      '<label for="course-authoring-create-title">Título</label>' +
      `<input id="course-authoring-create-title" name="title" maxlength="300" required autocomplete="off" value="${escapeHtml(state.createDraft?.title || "")}">` +
      '<label for="course-authoring-create-objective">Objetivo</label>' +
      `<input id="course-authoring-create-objective" name="objective" maxlength="2000" required autocomplete="off" value="${escapeHtml(state.createDraft?.objective || "")}">` +
      '<div class="course-authoring-write-actions">' +
      `<button type="submit"${state.writeBusy ? " disabled" : ""} aria-label="Criar Curso" title="Criar Curso">` +
      renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
      '<button type="button" data-course-authoring-action="cancel-create" aria-label="Cancelar" title="Cancelar">' +
      renderUiIcon("remove-state", "course-authoring-button-icon") + "</button></div></form>"
    : "";
  return '<div class="course-authoring-frame">' +
    '<header class="course-authoring-list-header">' +
    '<button type="button" class="course-authoring-back"' +
    ' data-course-authoring-action="close-surface" aria-label="Voltar ao Estudo"' +
    ' title="Voltar ao Estudo">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + "</button><div>" +
    '<p class="course-authoring-eyebrow">Autoria</p><h1>Meus cursos</h1></div>' +
    '<button type="button" class="course-authoring-header-action"' +
    ' data-course-authoring-action="open-create" aria-label="Criar Curso" title="Criar Curso">' +
    renderUiIcon("add", "course-authoring-button-icon") + "</button></header>" +
    '<form class="course-authoring-search" role="search" data-course-authoring-search>' +
    '<label class="course-authoring-visually-hidden" for="course-authoring-query">Buscar Cursos</label>' +
    `<input id="course-authoring-query" type="search" maxlength="120" autocomplete="off"` +
    ` value="${escapeHtml(state.query)}" placeholder="Buscar Curso" data-course-authoring-query>` +
    '<button type="submit" aria-label="Buscar Cursos">' +
    renderUiIcon("search", "course-authoring-button-icon") + "</button></form>" +
    createForm +
    (state.writeMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.writeMessage)}</p>`
      : "") +
    (state.writeFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.writeFailure)}</p>`
      : "") +
    `<main class="course-authoring-list-content">${content}</main></div>`;
}

function renderCourseHeader(course) {
  return '<header class="course-authoring-course-header">' +
    '<button type="button" class="course-authoring-back" data-course-authoring-action="show-list"' +
    ' aria-label="Voltar aos Cursos" title="Voltar aos Cursos">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + "</button>" +
    '<div class="course-authoring-course-heading"><p class="course-authoring-eyebrow">Curso</p>' +
    `<h1>${escapeHtml(course?.title || "Curso")}</h1>${courseMeta(course)}</div></header>`;
}

function canAccessPlanning(course) {
  return course?.ownership === "owned" && course?.canEdit === true;
}

function renderSectionNavigation(course, section) {
  const definitions = [
    ...(canAccessPlanning(course)
      ? [{ key: "planning", label: "Planejamento", icon: "intent" }]
      : []),
    { key: "structure", label: "Estrutura", icon: "module" },
    { key: "inspection", label: "Inspeção", icon: "preview" },
    { key: "people", label: "Pessoas", icon: "account-add" }
  ];
  return `<nav class="course-authoring-sections ${definitions.length === 4 ? "has-people" : "has-planning"}"` +
    ' aria-label="Áreas do Curso">' +
    definitions.map((definition) => {
      const active = definition.key === section;
      return `<a href="${escapeHtml(buildCourseAuthoringRoute(course.courseId, { section: definition.key }))}"` +
        ` class="${active ? "is-active" : ""}" data-course-authoring-action="change-section"` +
        ` data-section="${definition.key}" aria-label="${escapeHtml(definition.label)}"` +
        ` title="${escapeHtml(definition.label)}"${active ? ' aria-current="page"' : ""}>` +
        renderUiIcon(definition.icon, "course-authoring-section-icon") +
        `<span>${definition.label}</span></a>`;
    }).join("") + "</nav>";
}

function renderPersonAvatar(person, avatarUrls) {
  const source = person?.avatarObjectKey
    ? avatarUrls?.get?.(person.avatarObjectKey) || ""
    : "";
  return source
    ? `<img class="course-authoring-person-avatar" src="${escapeHtml(source)}" alt="">`
    : `<span class="course-authoring-person-avatar is-fallback">${renderUiIcon(
        "account", "course-authoring-icon"
      )}</span>`;
}

function renderPersonRow(person, { owner = false, avatarUrls = null } = {}) {
  const name = person.displayName || (owner ? "Proprietário sem nome" : "Pessoa sem nome");
  return '<article class="course-authoring-person">' +
    renderPersonAvatar(person, avatarUrls) +
    `<div><strong>${escapeHtml(name)}</strong><span>${owner ? "Proprietário" : "Acesso ao Estudo"}</span></div>` +
    (owner ? "" : '<button type="button" data-course-authoring-action="revoke-access"' +
      ` data-user-id="${escapeHtml(person.userId)}" data-display-name="${escapeHtml(name)}"` +
      ` aria-label="Revogar acesso de ${escapeHtml(name)}" title="Revogar acesso">` +
      renderUiIcon("trash", "course-authoring-button-icon") + "</button>") +
    "</article>";
}

function renderPeopleSection(state) {
  const people = state.people;
  const content = state.peopleLoading && !people
    ? '<p class="course-authoring-loading" role="status">Carregando pessoas…</p>'
    : !people
      ? statusPanel({
          kind: "error",
          title: "Pessoas indisponíveis",
          message: state.peopleFailure || "Não foi possível consultar os acessos.",
          action: "retry-people",
          actionLabel: "Tentar novamente"
        })
      : renderPersonRow(people.owner, { owner: true, avatarUrls: state.avatarUrls }) +
        (people.people.length
          ? `<div class="course-authoring-people-list">${people.people.map((person) =>
              renderPersonRow(person, { avatarUrls: state.avatarUrls })).join("")}</div>`
          : '<p class="course-authoring-people-empty">Somente você tem acesso.</p>');
  const grant = state.grantOpen
    ? '<form class="course-authoring-grant" data-course-authoring-grant>' +
      '<label class="course-authoring-visually-hidden" for="course-authoring-access-email">E-mail exato</label>' +
      '<input id="course-authoring-access-email" name="email" type="email" maxlength="254"' +
      ' autocomplete="email" required placeholder="E-mail exato">' +
      '<button type="submit" aria-label="Conceder acesso" title="Conceder acesso">' +
      renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
      '<button type="button" data-course-authoring-action="cancel-grant" aria-label="Cancelar" title="Cancelar">' +
      renderUiIcon("remove-state", "course-authoring-button-icon") + "</button></form>"
    : "";
  return '<section class="course-authoring-section course-authoring-people"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div>' +
    '<h2 id="course-authoring-section-title">Pessoas</h2>' +
    '<p>Acesso direto ao Estudo</p></div>' +
    '<button type="button" class="course-authoring-people-add"' +
    ' data-course-authoring-action="open-grant" aria-label="Conceder acesso" title="Conceder acesso">' +
    renderUiIcon("add", "course-authoring-button-icon") + "</button></header>" +
    grant + `<div class="course-authoring-people-content">${content}</div>` +
    (state.peopleMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.peopleMessage)}</p>`
      : "") +
    (state.peopleFailure && people
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.peopleFailure)}</p>`
      : "") +
    "</section>";
}

function renderPlanningCard({ icon, label, value, emptyLabel }) {
  return '<article class="course-authoring-planning-card">' +
    `<span class="course-authoring-planning-icon">${renderUiIcon(icon, "course-authoring-icon")}</span>` +
    '<div class="course-authoring-planning-copy">' +
    `<h3>${escapeHtml(label)}</h3>` +
    `<p${value ? "" : ' class="is-empty"'}>${escapeHtml(value || emptyLabel)}</p>` +
    "</div></article>";
}

function renderPlanningMetric({ icon, count, label, detail = "" }) {
  return '<div class="course-authoring-planning-metric">' +
    renderUiIcon(icon, "course-authoring-section-icon") +
    `<div><strong>${escapeHtml(count)}</strong><span>${escapeHtml(label)}</span>` +
    (detail ? `<small>${escapeHtml(detail)}</small>` : "") + "</div></div>";
}

function renderActionButton({ action, icon, label, data = "", disabled = false, className = "" }) {
  return `<button type="button"${className ? ` class="${escapeHtml(className)}"` : ""}` +
    ` data-course-authoring-action="${escapeHtml(action)}"${data}` +
    ` aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"` +
    `${disabled ? " disabled" : ""}>${renderUiIcon(icon, "course-authoring-button-icon")}</button>`;
}

function renderPlanningEditForm(state, planning) {
  if (!state.planningEditOpen) return "";
  const draft = state.planningDraft || {
    title: state.course.title,
    objective: planning.objective || "",
    audience: planning.audience || "",
    scope: planning.scope || "",
    authoringGuidance: planning.authoringGuidance || "",
    rangeMinimum: planning.preferredPartCount.minimum,
    rangeMaximum: planning.preferredPartCount.maximum,
    rangeOrigin: planning.preferredPartCount.origin
  };
  const originOptions = Object.entries(PART_RANGE_ORIGIN_LABELS).map(([value, label]) =>
    `<option value="${value}"${draft.rangeOrigin === value ? " selected" : ""}>${label}</option>`
  ).join("");
  return '<form class="course-authoring-write-form course-authoring-plan-form"' +
    ' data-course-authoring-planning>' +
    '<label for="course-authoring-edit-title">Título do Curso</label>' +
    `<input id="course-authoring-edit-title" name="title" maxlength="300" required value="${escapeHtml(draft.title)}">` +
    '<label for="course-authoring-edit-objective">Objetivo</label>' +
    `<textarea id="course-authoring-edit-objective" name="objective" maxlength="2000" rows="3" required>${escapeHtml(draft.objective)}</textarea>` +
    '<label for="course-authoring-edit-audience">Público</label>' +
    `<textarea id="course-authoring-edit-audience" name="audience" maxlength="4000" rows="3">${escapeHtml(draft.audience)}</textarea>` +
    '<label for="course-authoring-edit-scope">Escopo</label>' +
    `<textarea id="course-authoring-edit-scope" name="scope" maxlength="8000" rows="4">${escapeHtml(draft.scope)}</textarea>` +
    '<label for="course-authoring-edit-guidance">Orientação para a autoria</label>' +
    `<textarea id="course-authoring-edit-guidance" name="authoringGuidance" maxlength="16384" rows="5">${escapeHtml(draft.authoringGuidance)}</textarea>` +
    '<fieldset class="course-authoring-range-fields"><legend>Faixa preferencial de Partes</legend>' +
    '<label for="course-authoring-range-minimum">Mínimo</label>' +
    `<input id="course-authoring-range-minimum" name="rangeMinimum" type="number" min="1" max="64" required value="${escapeHtml(draft.rangeMinimum)}">` +
    '<label for="course-authoring-range-maximum">Máximo</label>' +
    `<input id="course-authoring-range-maximum" name="rangeMaximum" type="number" min="1" max="64" required value="${escapeHtml(draft.rangeMaximum)}">` +
    '<label for="course-authoring-range-origin">Origem</label>' +
    `<select id="course-authoring-range-origin" name="rangeOrigin" required>${originOptions}</select></fieldset>` +
    '<div class="course-authoring-write-actions">' +
    `<button type="submit"${state.writeBusy ? " disabled" : ""} aria-label="Salvar planejamento" title="Salvar planejamento">` +
    renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
    renderActionButton({ action: "cancel-planning-edit", icon: "remove-state", label: "Cancelar" }) +
    "</div></form>";
}

function renderPlanItemForm(state, item = null) {
  const editing = item != null;
  const draft = state.planItemDraft || {
    id: item?.id || "",
    listName: state.planItemEditor?.listName || "intendedLearningOutcomes",
    statement: item?.statement || ""
  };
  const options = Object.entries(PLAN_ITEM_LABELS).map(([value, label]) =>
    `<option value="${value}"${draft.listName === value ? " selected" : ""}>${label}</option>`
  ).join("");
  return '<form class="course-authoring-inline-form" data-course-authoring-plan-item>' +
    `<input type="hidden" name="id" value="${escapeHtml(draft.id)}">` +
    '<label class="course-authoring-visually-hidden" for="course-authoring-item-kind">Tipo</label>' +
    `<select id="course-authoring-item-kind"${editing ? " disabled" : ' name="listName" required'}>${options}</select>` +
    (editing ? `<input type="hidden" name="listName" value="${escapeHtml(draft.listName)}">` : "") +
    '<label class="course-authoring-visually-hidden" for="course-authoring-item-text">Descrição</label>' +
    `<textarea id="course-authoring-item-text" name="statement" maxlength="2000" rows="3" required placeholder="Descreva em linguagem natural">${escapeHtml(draft.statement)}</textarea>` +
    '<div class="course-authoring-write-actions">' +
    `<button type="submit"${state.writeBusy ? " disabled" : ""} aria-label="${editing ? "Salvar item" : "Adicionar item"}" title="${editing ? "Salvar item" : "Adicionar item"}">` +
    renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
    renderActionButton({ action: "cancel-plan-item", icon: "remove-state", label: "Cancelar" }) +
    "</div></form>";
}

function renderPlanItems(state, planning) {
  const editor = state.planItemEditor;
  const groups = Object.entries(PLAN_ITEM_LABELS).map(([listName, label]) => {
    const list = planning[listName];
    const items = list.map((item, index) => {
      if (editor?.mode === "edit" && editor.id === item.id && editor.listName === listName) {
        return renderPlanItemForm(state, item);
      }
      const data = ` data-item-id="${escapeHtml(item.id)}" data-plan-list="${escapeHtml(listName)}"`;
      return '<article class="course-authoring-plan-item">' +
        `<p>${escapeHtml(item.statement)}</p>` +
        '<div class="course-authoring-compact-actions">' +
        renderActionButton({ action: "move-plan-item-up", icon: "arrow-up", label: "Mover item para cima", data, disabled: state.writeBusy || index === 0 }) +
        renderActionButton({ action: "move-plan-item-down", icon: "arrow-down", label: "Mover item para baixo", data, disabled: state.writeBusy || index === list.length - 1 }) +
        renderActionButton({ action: "edit-plan-item", icon: "edit", label: "Editar item", data, disabled: state.writeBusy }) +
        renderActionButton({ action: "remove-plan-item", icon: "trash", label: "Remover item", data, disabled: state.writeBusy }) +
        "</div></article>";
    }).join("");
    return `<section class="course-authoring-plan-item-group"><h4>${escapeHtml(label)}</h4>` +
      (items || '<p class="course-authoring-empty-copy">Nenhum item.</p>') + "</section>";
  }).join("");
  return '<section class="course-authoring-plan-items" aria-labelledby="course-authoring-plan-items-title">' +
    '<header class="course-authoring-subsection-heading"><div><h3 id="course-authoring-plan-items-title">Referências do plano</h3>' +
    '<p>Enunciados versionados em linguagem natural.</p></div>' +
    renderActionButton({ action: "add-plan-item", icon: "add", label: "Adicionar item ao plano", disabled: state.writeBusy }) +
    "</header>" +
    (editor?.mode === "add" ? renderPlanItemForm(state) : "") +
    groups + "</section>";
}

function renderPartForm(state, part = null) {
  const editing = part != null;
  const draft = state.partDraft || {
    partId: part?.id || "",
    title: part?.title || "",
    intent: part?.intent || ""
  };
  return '<form class="course-authoring-inline-form" data-course-authoring-part>' +
    `<input type="hidden" name="partId" value="${escapeHtml(draft.partId)}">` +
    '<label for="course-authoring-part-title">Título da Parte</label>' +
    `<input id="course-authoring-part-title" name="title" maxlength="300" required value="${escapeHtml(draft.title)}">` +
    '<label for="course-authoring-part-intent">Intenção operacional</label>' +
    `<textarea id="course-authoring-part-intent" name="intent" maxlength="4000" rows="3" placeholder="O que esta Parte deve produzir">${escapeHtml(draft.intent)}</textarea>` +
    '<div class="course-authoring-write-actions">' +
    `<button type="submit"${state.writeBusy ? " disabled" : ""} aria-label="${editing ? "Salvar Parte" : "Adicionar Parte"}" title="${editing ? "Salvar Parte" : "Adicionar Parte"}">` +
    renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
    renderActionButton({ action: "cancel-part-edit", icon: "remove-state", label: "Cancelar" }) +
    "</div></form>";
}

function renderLinkMoveForm(state, microsequence, parts) {
  const sourcePart = parts.find((part) =>
    part.microsequences.some((value) => value.id === microsequence.id));
  const options = ['<option value="">Sem Parte</option>'].concat(parts
    .filter((part) => part.id !== sourcePart?.id)
    .map((part) =>
    `<option value="${escapeHtml(part.id)}"${state.linkEditor?.targetPartId === part.id ? " selected" : ""}>${escapeHtml(part.title)}</option>`
  )).join("");
  return '<form class="course-authoring-link-form" data-course-authoring-link>' +
    `<input type="hidden" name="microsequenceId" value="${escapeHtml(microsequence.id)}">` +
    `<label for="course-authoring-link-target">Mover “${escapeHtml(microsequence.title)}” para</label>` +
    `<select id="course-authoring-link-target" name="partId">${options}</select>` +
    '<div class="course-authoring-write-actions">' +
    `<button type="submit"${state.writeBusy ? " disabled" : ""} aria-label="Salvar vínculo" title="Salvar vínculo">` +
    renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
    renderActionButton({ action: "cancel-link-edit", icon: "remove-state", label: "Cancelar" }) +
    "</div></form>";
}

function microsequenceAssignmentOptions(microsequences, authoringPlan) {
  const source = Array.isArray(microsequences) ? microsequences : [];
  const linked = new Set(authoringPlan.plan.parts.flatMap((part) =>
    part.microsequences.map((microsequence) => microsequence.id)));
  return source.filter((microsequence) => !linked.has(microsequence.id));
}

function renderPartLinks(state, part, allParts) {
  if (part.microsequences.length === 0) {
    return '<p class="course-authoring-empty-copy">Nenhuma microssequência vinculada.</p>';
  }
  return '<details class="course-authoring-part-links"><summary>' +
    `${part.linkedMicrosequenceCount} ${part.linkedMicrosequenceCount === 1 ? "microssequência vinculada" : "microssequências vinculadas"}` +
    '</summary><ul>' + part.microsequences.map((microsequence) => {
      const editing = state.linkEditor?.microsequenceId === microsequence.id;
      return `<li><div><strong>${escapeHtml(microsequence.title)}</strong>` +
        `<span>${escapeHtml(microsequence.curriculumPath.moduleTitle)} · ${escapeHtml(microsequence.curriculumPath.lessonTitle)}</span>` +
        `<small>${escapeHtml(microsequence.studyUnitCount)} unidades materializadas</small></div>` +
        (editing ? renderLinkMoveForm(state, microsequence, allParts) : renderActionButton({
          action: "edit-part-link",
          icon: "reposition",
          label: `Mover vínculo de ${microsequence.title}`,
          data: ` data-microsequence-id="${escapeHtml(microsequence.id)}" data-part-id="${escapeHtml(part.id)}"`,
          disabled: state.writeBusy
        })) + "</li>";
    }).join("") + "</ul></details>";
}

function renderMicrosequenceAssignment(state, parts) {
  const editor = state.microsequenceAssignment;
  if (!editor) return "";
  if (editor.loading) {
    return '<p class="course-authoring-loading" role="status">Carregando microssequências…</p>';
  }
  if (editor.failure) {
    return '<div class="course-authoring-inline-form" role="alert"><p>' +
      escapeHtml(editor.failure) + "</p>" +
      renderActionButton({ action: "cancel-microsequence-assignment", icon: "remove-state", label: "Fechar" }) +
      "</div>";
  }
  if (editor.options.length === 0) {
    return '<div class="course-authoring-inline-form"><p>Todas as microssequências já estão vinculadas.</p>' +
      renderActionButton({ action: "cancel-microsequence-assignment", icon: "remove-state", label: "Fechar" }) +
      "</div>";
  }
  const microsequenceOptions = editor.options.map((option) =>
    `<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`
  ).join("");
  const partOptions = parts.map((part) =>
    `<option value="${escapeHtml(part.id)}">${escapeHtml(part.title)}</option>`
  ).join("");
  return '<form class="course-authoring-inline-form" data-course-authoring-assignment>' +
    '<label for="course-authoring-unlinked-microsequence">Microssequência existente</label>' +
    `<select id="course-authoring-unlinked-microsequence" name="microsequenceId">${microsequenceOptions}</select>` +
    '<label for="course-authoring-assignment-part">Parte de destino</label>' +
    `<select id="course-authoring-assignment-part" name="partId">${partOptions}</select>` +
    '<div class="course-authoring-write-actions">' +
    `<button type="submit"${state.writeBusy ? " disabled" : ""} aria-label="Vincular microssequência" title="Vincular microssequência">` +
    renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
    renderActionButton({ action: "cancel-microsequence-assignment", icon: "remove-state", label: "Cancelar" }) +
    "</div></form>";
}

function humanizeFactLabel(value) {
  const source = String(value || "")
    .replace(/([a-zà-ÿ])([A-Z])/gu, "$1 $2")
    .replaceAll("_", " ")
    .trim();
  return source ? source.charAt(0).toLocaleUpperCase("pt-BR") + source.slice(1) : "Fato";
}

function readableFactValue(value) {
  if (value == null) return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Não informado";
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/gu, " ").trim();
    return normalized.length > 240 ? `${normalized.slice(0, 237)}…` : normalized || "Não informado";
  }
  if (Array.isArray(value)) {
    const simple = value.length <= 3 && value.every((item) =>
      item == null || ["boolean", "number", "string"].includes(typeof item)
    );
    return simple
      ? value.map(readableFactValue).join(" · ") || "Nenhum item"
      : `${value.length} ${value.length === 1 ? "item" : "itens"}`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    const simple = entries.length <= 3 && entries.every(([, item]) =>
      item == null || ["boolean", "number", "string"].includes(typeof item)
    );
    return simple
      ? entries.map(([key, item]) =>
          `${humanizeFactLabel(key)}: ${readableFactValue(item)}`).join(" · ") || "Nenhum campo"
      : `${entries.length} ${entries.length === 1 ? "campo" : "campos"}`;
  }
  return "Não informado";
}

function renderFactGroup(label, facts, emptyLabel) {
  const allEntries = Object.entries(facts);
  const entries = allEntries.slice(0, 8);
  return `<section class="course-authoring-materialization-facts"><h5>${escapeHtml(label)}</h5>` +
    (entries.length
      ? `<dl>${entries.map(([key, value]) =>
          `<div><dt>${escapeHtml(humanizeFactLabel(key))}</dt>` +
          `<dd>${escapeHtml(readableFactValue(value))}</dd></div>`).join("")}</dl>` +
        (allEntries.length > entries.length
          ? `<p>Mostrando ${entries.length} de ${allEntries.length} campos registrados.</p>`
          : "")
      : `<p>${escapeHtml(emptyLabel)}</p>`) + "</section>";
}

function renderMaterializationDetails(state, part) {
  const selected = state.partMaterialization;
  const latest = part.progress.lastMaterialization;
  if (!selected || selected.partId !== part.id ||
      selected.materializationId !== latest?.id) return "";
  if (selected.loading) {
    return '<p class="course-authoring-loading" role="status">Carregando etapas…</p>';
  }
  if (selected.failure) {
    return '<div class="course-authoring-materialization-failure" role="alert"><p>' +
      escapeHtml(selected.failure) + '</p><div class="course-authoring-materialization-actions">' +
      '<button type="button" data-course-authoring-action="view-materialization"' +
      ` data-part-id="${escapeHtml(part.id)}"><span>Tentar novamente</span></button>` +
      '<button type="button" data-course-authoring-action="hide-materialization">' +
      '<span>Fechar</span></button></div></div>';
  }
  const value = selected.value?.materialization;
  if (!value) return "";
  const next = value.nextPendingStep;
  return '<section class="course-authoring-materialization-details"' +
    ' aria-label="Etapas da materialização"><header><div><strong>Etapas da materialização</strong>' +
    `<span>Versão ${escapeHtml(value.version)} · ${escapeHtml(
      value.channel === "mcp" ? "Chat conectado" : "AraLearn"
    )}</span></div><button type="button" data-course-authoring-action="hide-materialization">` +
    '<span>Ocultar etapas</span></button></header>' +
    (next
      ? `<p class="course-authoring-materialization-next">Próxima: etapa ${escapeHtml(next.position + 1)} · ${escapeHtml(MATERIALIZATION_STEP_KIND_LABELS[next.kind])}</p>`
      : "") +
    `<ol>${value.steps.map((step) => '<li data-status="' + escapeHtml(step.status) + '">' +
      '<div><strong>' + escapeHtml(`Etapa ${step.position + 1} · ${MATERIALIZATION_STEP_KIND_LABELS[step.kind]}`) +
      `</strong><span>${escapeHtml(MATERIALIZATION_STEP_STATUS_LABELS[step.status])}</span></div>` +
      (step.targetDidacticMicrosequenceId
        ? `<small>Microssequência ${escapeHtml(step.targetDidacticMicrosequenceId)}</small>`
        : "") +
      renderFactGroup("Fatos da etapa", step.resultFacts, "Nenhum fato registrado.") +
      "</li>").join("")}</ol>` +
    renderFactGroup("Contexto usado", value.designContext, "Nenhum contexto adicional registrado.") +
    renderFactGroup("Fatos finais", value.resultFacts, "Nenhum fato final registrado.") +
    "</section>";
}

function renderLastMaterialization(state, part) {
  const value = part.progress.lastMaterialization;
  if (!value) return "";
  const selected = state.partMaterialization?.partId === part.id &&
    state.partMaterialization?.materializationId === value.id;
  return '<section class="course-authoring-materialization-read"><div class="course-authoring-last-materialization">' +
    `<span>${escapeHtml(MATERIALIZATION_STATUS_LABELS[value.status])}</span>` +
    `<strong>${escapeHtml(value.completedStepCount)} de ${escapeHtml(value.totalStepCount)} etapas</strong>` +
    (value.failedStepCount
      ? `<small>${escapeHtml(value.failedStepCount)} com falha</small>`
      : "") +
    `<button type="button" data-course-authoring-action="${selected ? "hide-materialization" : "view-materialization"}"` +
    ` data-part-id="${escapeHtml(part.id)}"><span>${selected ? "Ocultar etapas" : "Ver etapas"}</span></button>` +
    "</div>" + renderMaterializationDetails(state, part) + "</section>";
}

function renderPart(state, part, index, parts) {
  const data = ` data-part-id="${escapeHtml(part.id)}"`;
  if (state.partEditor?.mode === "edit" && state.partEditor.partId === part.id) {
    return renderPartForm(state, part);
  }
  const splitBoundary = part.microsequences.length >= 2
    ? part.microsequences[Math.ceil(part.microsequences.length / 2) - 1].id
    : "";
  const previousPart = index > 0 ? parts[index - 1] : null;
  return `<article class="course-authoring-part" data-status="${escapeHtml(part.status)}">` +
    '<header><div class="course-authoring-part-heading">' +
    `<span>Parte ${index + 1}</span><h4>${escapeHtml(part.title)}</h4>` +
    `<p class="course-authoring-part-status">${escapeHtml(PART_STATUS_LABELS[part.status])}</p></div>` +
    '<div class="course-authoring-compact-actions">' +
    renderActionButton({ action: "move-part-up", icon: "arrow-up", label: "Mover Parte para cima", data, disabled: state.writeBusy || index === 0 }) +
    renderActionButton({ action: "move-part-down", icon: "arrow-down", label: "Mover Parte para baixo", data, disabled: state.writeBusy || index === parts.length - 1 }) +
    renderActionButton({ action: "edit-part", icon: "edit", label: "Editar Parte", data, disabled: state.writeBusy }) +
    renderActionButton({ action: "remove-part", icon: "trash", label: "Remover Parte", data, disabled: state.writeBusy }) +
    "</div></header>" +
    (part.intent ? `<p class="course-authoring-part-intent">${escapeHtml(part.intent)}</p>` : "") +
    '<div class="course-authoring-part-counts" aria-label="Planejado e produzido">' +
    `<span><strong>${escapeHtml(part.linkedMicrosequenceCount)}</strong> micros no plano</span>` +
    `<span><strong>${escapeHtml(part.studyUnitCount)}</strong> unidades materializadas</span></div>` +
    renderLastMaterialization(state, part) + renderPartLinks(state, part, parts) +
    '<footer class="course-authoring-part-actions">' +
    (splitBoundary ? renderActionButton({
      action: "split-part",
      icon: "reposition",
      label: "Dividir Parte ao meio",
      data: `${data} data-after-microsequence-id="${escapeHtml(splitBoundary)}"`,
      disabled: state.writeBusy
    }) : "") +
    (previousPart ? renderActionButton({
      action: "join-parts",
      icon: "module",
      label: `Unir com ${previousPart.title}`,
      data: `${data} data-previous-part-id="${escapeHtml(previousPart.id)}"`,
      disabled: state.writeBusy
    }) : "") +
    renderActionButton({
      action: "materialize-part",
      icon: "prompt",
      label: "Levar pedido ao chat conectado",
      data,
      disabled: state.writeBusy || state.materializationBusyPartId === part.id,
      className: "course-authoring-chat-action"
    }) + "</footer></article>";
}

function renderParts(state, planning) {
  return '<section class="course-authoring-parts" aria-labelledby="course-authoring-parts-title">' +
    '<header class="course-authoring-subsection-heading"><div><h3 id="course-authoring-parts-title">Partes</h3>' +
    '<p>Lotes operacionais ligados à estrutura didática.</p></div><div class="course-authoring-compact-actions">' +
    renderActionButton({
      action: "open-microsequence-assignment",
      icon: "reposition",
      label: "Vincular microssequência existente",
      disabled: state.writeBusy || planning.parts.length === 0
    }) +
    renderActionButton({ action: "add-part", icon: "add", label: "Adicionar Parte", disabled: state.writeBusy }) +
    "</div>" +
    "</header>" +
    renderMicrosequenceAssignment(state, planning.parts) +
    (state.partEditor?.mode === "add" ? renderPartForm(state) : "") +
    (planning.parts.length
      ? `<div class="course-authoring-part-list">${planning.parts.map((part, index) =>
          renderPart(state, part, index, planning.parts)).join("")}</div>`
      : '<p class="course-authoring-empty-copy">Nenhuma Parte planejada.</p>') + "</section>";
}

function formatActivityDate(value) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function renderRecentActivity(planning) {
  if (planning.recentActivity.length === 0) return "";
  const parts = new Map(planning.parts.map((part) => [part.id, part]));
  const items = new Map([
    ...planning.intendedLearningOutcomes,
    ...planning.instructionalAnalysisUnits,
    ...planning.evidenceRequirements
  ].map((item) => [item.id, item]));
  return '<details class="course-authoring-recent-activity"><summary>Atividade recente</summary><ol>' +
    planning.recentActivity.map((activity) => {
      const part = activity.partId ? parts.get(activity.partId) : null;
      const item = activity.instructionalPlanItemId
        ? items.get(activity.instructionalPlanItemId)
        : null;
      const channel = activity.channel === "mcp" ? "Chat conectado" : "AraLearn";
      return '<li><div><strong>' + escapeHtml(ACTIVITY_LABELS[activity.kind]) + "</strong>" +
        (part ? `<span>${escapeHtml(part.title)}</span>` :
          item ? `<span>${escapeHtml(item.statement)}</span>` : "") +
        `</div><small>${escapeHtml(channel)} · <time datetime="${escapeHtml(activity.createdAt)}">${escapeHtml(formatActivityDate(activity.createdAt))}</time></small></li>`;
    }).join("") + "</ol></details>";
}

function renderPlanningSection(state) {
  const course = state.course;
  if (!canAccessPlanning(course)) {
    return statusPanel({
      kind: "status",
      title: "Planejamento indisponível",
      message: "Somente o proprietário pode acessar esta área."
    });
  }
  if (state.planningLoading && !state.authoringPlan) {
    return '<p class="course-authoring-loading" role="status">Carregando planejamento…</p>';
  }
  if (!state.authoringPlan) {
    return statusPanel({
      kind: "error",
      title: "Planejamento indisponível",
      message: state.planningFailure || "Não foi possível carregar o planejamento.",
      action: "retry-planning",
      actionLabel: "Tentar novamente"
    });
  }
  const planning = projectCoursePlanning(course, state.authoringPlan);
  return '<section class="course-authoring-section course-authoring-planning"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div>' +
    '<h2 id="course-authoring-section-title">Planejamento</h2></div>' +
    '<button type="button" class="course-authoring-header-action"' +
    ' data-course-authoring-action="open-planning-edit" aria-label="Editar planejamento" title="Editar planejamento">' +
    renderUiIcon("edit", "course-authoring-button-icon") + "</button></header>" +
    renderPlanningEditForm(state, planning) +
    (state.writeMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.writeMessage)}</p>`
      : "") +
    (state.writeFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.writeFailure)}</p>`
      : "") +
    (state.planningEditOpen ? "" : '<div class="course-authoring-planning-details">' +
    renderPlanningCard({
      icon: "intent",
      label: "Objetivo",
      value: planning?.objective,
      emptyLabel: "Ainda não definido."
    }) +
    renderPlanningCard({
      icon: "prompt",
      label: "Público",
      value: planning.audience,
      emptyLabel: "Ainda não definido."
    }) +
    renderPlanningCard({
      icon: "tags",
      label: "Escopo",
      value: planning.scope,
      emptyLabel: "Ainda não definido."
    }) +
    renderPlanningCard({
      icon: "prompt",
      label: "Orientação",
      value: planning.authoringGuidance,
      emptyLabel: "Ainda não definida."
    }) +
    '</div><div class="course-authoring-planning-metrics" aria-label="Dimensões do planejamento">' +
    renderPlanningMetric({
      icon: "module",
      count: `${planning.preferredPartCount.minimum}–${planning.preferredPartCount.maximum}`,
      label: "Partes preferenciais",
      detail: PART_RANGE_ORIGIN_LABELS[planning.preferredPartCount.origin]
    }) +
    renderPlanningMetric({
      icon: "progress",
      count: planning.studyUnitCount,
      label: "Unidades materializadas",
      detail: `${planning.linkedMicrosequenceCount} microssequências no plano`
    }) +
    "</div>" + renderPlanItems(state, planning) + renderParts(state, planning) +
    renderRecentActivity(planning)) + "</section>";
}

function renderEntityItem(item) {
  return '<article class="course-authoring-entity">' +
    '<div class="course-authoring-entity-heading"><span class="course-authoring-entity-icon">' +
    renderUiIcon(item.icon, "course-authoring-icon") + "</span><div>" +
    `<p>${escapeHtml(item.label)}</p><h3>${escapeHtml(item.title)}</h3></div></div>` +
    (item.context ? `<p class="course-authoring-context">${escapeHtml(item.context)}</p>` : "") +
    (item.summary ? `<p class="course-authoring-summary">${escapeHtml(item.summary)}</p>` : "") +
    "</article>";
}

function renderCourseSection(state) {
  if (state.section === "people" && state.course) {
    return renderPeopleSection(state);
  }
  if (state.section === "planning") {
    return renderPlanningSection(state);
  }
  if (state.section === "inspection" && state.course) {
    return '<div class="course-inspection-host" data-course-inspection-host></div>';
  }
  if (state.loading && !state.outline) {
    return '<p class="course-authoring-loading" role="status">Carregando Curso…</p>';
  }
  if (state.failure && !state.outline) {
    return statusPanel({
      kind: state.failure.kind,
      title: state.failure.kind === "revision-changed" ? "Curso atualizado" : "Estrutura indisponível",
      message: state.failure.message,
      action: state.failure.kind === "access-revoked" ? "" : "retry",
      actionLabel: "Recarregar"
    });
  }
  const outline = state.outline;
  const items = outline?.rows || [];
  const counts = {
    microsequences: state.course?.counts?.microsequenceCount || 0,
    units: state.course?.counts?.studyUnitCount || 0
  };
  const countLabel = countedLabel(
    counts.microsequences,
    "microssequência",
    "microssequências",
    false
  ) + " · " + countedLabel(counts.units, "unidade", "unidades", false);
  return `<section class="course-authoring-section" aria-labelledby="course-authoring-section-title">` +
    '<header class="course-authoring-section-heading">' +
    '<div><h2 id="course-authoring-section-title">Estrutura</h2>' +
    `<p>${escapeHtml(countLabel)}</p></div></header>` +
    (outline?.offlineKnown
      ? '<p class="course-authoring-notice" role="status">Exibindo a estrutura disponível neste dispositivo.</p>'
      : "") +
    (items.length
      ? `<div class="course-authoring-entities">${items.map(renderEntityItem).join("")}</div>`
      : statusPanel({
          kind: "empty",
          title: "Estrutura vazia",
          message: "Este Curso ainda não tem itens estruturais."
        })) +
    (state.failure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure.message)}</p>`
      : "") +
    "</section>";
}

function renderCourseDetail(state) {
  const visibleCourse = state.course || state.knownCourse;
  const navigation = state.course
    ? renderSectionNavigation(state.course, state.section)
    : "";
  return '<div class="course-authoring-frame">' +
    renderCourseHeader(visibleCourse) +
    (state.section !== "planning" && visibleCourse?.goal
      ? `<p class="course-authoring-course-goal">${escapeHtml(visibleCourse.goal)}</p>`
      : "") + navigation +
    `<main class="course-authoring-course-content">${renderCourseSection(state)}</main></div>`;
}

function renderInvalidRoute() {
  return '<div class="course-authoring-frame">' +
    '<header class="course-authoring-list-header"><div><p class="course-authoring-eyebrow">Autoria</p>' +
    '<h1>Curso indisponível</h1></div></header>' +
    '<main class="course-authoring-course-content">' + statusPanel({
      kind: "error",
      title: "Endereço inválido",
      message: "Abra um Curso pela lista para continuar."
    }) +
    '<button type="button" class="course-authoring-primary" data-course-authoring-action="show-list">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + "<span>Ver Cursos</span></button></main></div>";
}

export function renderCourseAuthoringSurface(state = {}) {
  const view = state.view === "course" || state.view === "invalid" ? state.view : "list";
  const content = view === "course" ? renderCourseDetail(state) :
    view === "invalid" ? renderInvalidRoute() : renderCourseList(state);
  return `<section class="course-authoring-surface" data-view="${view}"` +
    ` data-section="${escapeHtml(view === "course" ? state.section || "structure" : "")}"` +
    ` aria-busy="${state.loading === true ? "true" : "false"}">${content}</section>`;
}

function cursorKey(value) {
  return value == null ? "" : JSON.stringify(value);
}

function writeFailureMessage(error) {
  if (error instanceof TypeError && error.message) return error.message;
  return classifyCourseAuthoringError(error).message;
}

function ambiguousWriteFailure(error) {
  const rawStatus = error?.status ?? error?.response?.status;
  const status = rawStatus == null || rawStatus === "" ? null : Number(rawStatus);
  const code = String(error?.code || error?.response?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  if (error?.ambiguous === true ||
      error?.name === "AbortError" || error?.name === "TimeoutError") {
    return true;
  }
  if (status != null && Number.isFinite(status)) {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  if ([
    "40001",
    "access_revoked",
    "course_access_revoked",
    "course_not_found",
    "course_not_owned",
    "course_revision_changed",
    "forbidden",
    "invalid_course_command",
    "invalid_tool_argument",
    "pt404"
  ].includes(code) || code.startsWith("invalid_")) {
    return false;
  }
  return [
    "failed_to_fetch",
    "gateway_timeout",
    "network_error",
    "network_unavailable",
    "offline",
    "request_timeout",
    "service_unavailable"
  ].includes(code) ||
    /(?:failed to fetch|fetch failed|network|offline|load failed|connection|socket|timeout)/u
      .test(message) ||
    // Sem resposta HTTP ou código de domínio não há evidência de que a escrita
    // deixou de ser confirmada pelo servidor antes da falha local.
    (status == null && !code);
}

function pendingWriteMatches(pending, draft) {
  return pending != null && JSON.stringify(pending.draft) === JSON.stringify(draft);
}

function ambiguousWriteFailureMessage(error) {
  const message = writeFailureMessage(error);
  return `${message} Tente novamente para confirmar a mesma operação.`;
}

function assertController(controller) {
  for (const method of [
    "listCourses", "getCourse", "loadAuthoringOutline", "loadAuthoringStudyUnits",
    "loadAuthoringInspectionPosition", "saveAuthoringInspectionPosition", "createCourse",
    "loadAuthoringPlan", "loadPartMaterialization", "mutateAuthoringPlan",
    "requestPartMaterialization"
  ]) {
    if (typeof controller?.[method] !== "function") {
      throw new TypeError(`Controller de Cursos sem ${method}.`);
    }
  }
}

export function createCourseAuthoringSurface({
  root,
  controller,
  courseLimit = DEFAULT_COURSE_LIMIT,
  locationValue = globalThis.location || { hash: "", pathname: "", search: "" },
  historyValue = globalThis.history || null,
  windowValue = globalThis.window || null,
  documentValue = globalThis.document || null,
  navigatorValue = globalThis.navigator || null,
  urlValue = globalThis.URL || null,
  confirmValue = globalThis.confirm?.bind(globalThis) || (() => false),
  onClose = () => {}
} = {}) {
  if (!root || typeof root.addEventListener !== "function") {
    throw new TypeError("Elemento raiz da Autoria de Cursos ausente.");
  }
  assertController(controller);
  if (!Number.isSafeInteger(courseLimit) || courseLimit < 1 || courseLimit > 50) {
    throw new TypeError("Limite de paginação inválido.");
  }

  let listEpoch = 0;
  let courseEpoch = 0;
  let materializationEpoch = 0;
  let hashListening = false;
  let inspectionSequence = null;
  const knownCourses = new Map();
  const avatarUrls = new Map();
  const state = {
    opened: false,
    view: "list",
    routeKey: "",
    query: "",
    section: "structure",
    loading: false,
    list: null,
    course: null,
    knownCourse: null,
    outline: null,
    routeTarget: null,
    failure: null,
    people: null,
    peopleLoading: false,
    peopleFailure: "",
    peopleMessage: "",
    peopleBusy: false,
    grantOpen: false,
    createOpen: false,
    createDraft: null,
    planningEditOpen: false,
    planningDraft: null,
    authoringPlan: null,
    planningLoading: false,
    planningFailure: "",
    planItemEditor: null,
    planItemDraft: null,
    partEditor: null,
    partDraft: null,
    linkEditor: null,
    microsequenceAssignment: null,
    pendingCreateCommand: null,
    pendingPlanningCommand: null,
    pendingMaterializationCommand: null,
    materializationBusyPartId: null,
    partMaterialization: null,
    writeBusy: false,
    writeMessage: "",
    writeFailure: "",
    avatarUrls
  };

  function clearAvatarUrls() {
    avatarUrls.forEach((source) => urlValue?.revokeObjectURL?.(source));
    avatarUrls.clear();
  }

  function destroyInspectionSequence() {
    inspectionSequence?.destroy?.();
    inspectionSequence = null;
  }

  function mountInspectionSequence() {
    if (state.view !== "course" || state.section !== "inspection" || !state.course) return;
    const host = root.querySelector?.("[data-course-inspection-host]");
    if (!host) return;
    try {
      inspectionSequence = createCourseInspectionSequence({
        root: host,
        controller,
        course: state.course,
        routeTarget: state.routeTarget,
        onNavigate: (hash) => navigate(hash),
        windowValue,
        documentValue,
        navigatorValue
      });
      void inspectionSequence.open();
    } catch (error) {
      host.innerHTML = statusPanel({
        kind: "error",
        title: "Inspeção indisponível",
        message: writeFailureMessage(error)
      });
    }
  }

  function render({ focus = "" } = {}) {
    if (!state.opened) return;
    destroyInspectionSequence();
    root.innerHTML = renderCourseAuthoringSurface(state);
    root.setAttribute?.("aria-busy", String(state.loading));
    mountInspectionSequence();
    if (focus && typeof root.querySelector === "function") {
      globalThis.queueMicrotask?.(() => root.querySelector(focus)?.focus());
    }
  }

  async function loadCourseList({ query = state.query, cursor = null, append = false } = {}) {
    const epoch = ++listEpoch;
    state.view = "list";
    state.query = String(query || "").trim();
    state.loading = true;
    state.failure = null;
    if (!append) state.list = null;
    render();
    try {
      const result = await controller.listCourses({
        query: state.query,
        limit: courseLimit,
        cursor
      });
      if (!state.opened || epoch !== listEpoch || state.view !== "list") return false;
      const page = normalizeCourseListPage(result);
      if (page.hasMore && cursorKey(page.nextCursor) === cursorKey(cursor)) {
        const error = new Error("A paginação não avançou.");
        error.code = "invalid_course_cursor";
        throw error;
      }
      state.list = append ? mergeCourseListPages(state.list, page) : page;
      state.list.items.forEach((course) => knownCourses.set(course.courseId, course));
      return true;
    } catch (error) {
      if (!state.opened || epoch !== listEpoch || state.view !== "list") return false;
      state.failure = classifyCourseAuthoringError(error);
      return false;
    } finally {
      if (state.opened && epoch === listEpoch && state.view === "list") {
        state.loading = false;
        render();
      }
    }
  }

  async function loadPeople(courseId, { announce = false } = {}) {
    state.peopleLoading = true;
    state.peopleFailure = "";
    state.peopleMessage = announce ? "Atualizando acessos…" : "";
    render();
    try {
      const result = normalizeCoursePeople(
        await controller.listCourseAccess(courseId),
        courseId
      );
      if (!state.opened || state.course?.courseId !== courseId) return false;
      state.people = result;
      clearAvatarUrls();
      if (typeof controller.loadAvatar === "function" &&
          typeof urlValue?.createObjectURL === "function") {
        const objectKeys = [result.owner, ...result.people]
          .map((person) => person.avatarObjectKey)
          .filter(Boolean);
        await Promise.all(objectKeys.map(async (objectKey) => {
          try {
            const blob = await controller.loadAvatar(objectKey);
            if (!state.opened || state.course?.courseId !== courseId) return;
            avatarUrls.set(objectKey, urlValue.createObjectURL(blob));
          } catch {
            // O nome acessível permanece disponível quando a imagem não carrega.
          }
        }));
      }
      state.peopleMessage = "";
      return true;
    } catch (error) {
      if (!state.opened || state.course?.courseId !== courseId) return false;
      state.peopleFailure = classifyCourseAuthoringError(error).message;
      state.peopleMessage = "";
      return false;
    } finally {
      if (state.opened && state.course?.courseId === courseId) {
        state.peopleLoading = false;
        render();
      }
    }
  }

  async function loadPlanning(courseId, { expectedCourseRevision = state.course?.revision } = {}) {
    ++materializationEpoch;
    state.partMaterialization = null;
    state.planningLoading = true;
    state.planningFailure = "";
    render();
    try {
      const result = normalizeCourseAuthoringPlan(
        await controller.loadAuthoringPlan(courseId),
        { expectedCourseId: courseId, expectedCourseRevision }
      );
      if (!state.opened || state.course?.courseId !== courseId) return false;
      state.authoringPlan = result;
      return true;
    } catch (error) {
      if (!state.opened || state.course?.courseId !== courseId) return false;
      state.planningFailure = classifyCourseAuthoringError(error, {
        knownCourse: state.course
      }).message;
      return false;
    } finally {
      if (state.opened && state.course?.courseId === courseId) {
        state.planningLoading = false;
        render();
      }
    }
  }

  async function loadPartMaterialization(part) {
    const latest = part?.progress?.lastMaterialization;
    if (!state.course || !state.authoringPlan || !part || !latest) return false;
    const epoch = ++materializationEpoch;
    const courseId = state.course.courseId;
    state.partMaterialization = {
      partId: part.id,
      materializationId: latest.id,
      loading: true,
      failure: "",
      value: null
    };
    render();
    try {
      const result = normalizePartMaterializationRead(
        await controller.loadPartMaterialization(courseId, part.id, latest.id),
        {
          expectedCourseId: courseId,
          expectedAuthoringPartId: part.id,
          expectedMaterializationId: latest.id
        }
      );
      if (!state.opened || epoch !== materializationEpoch ||
          state.course?.courseId !== courseId) return false;
      state.partMaterialization = {
        partId: part.id,
        materializationId: latest.id,
        loading: false,
        failure: "",
        value: result
      };
      return true;
    } catch (error) {
      if (!state.opened || epoch !== materializationEpoch ||
          state.course?.courseId !== courseId) return false;
      state.partMaterialization = {
        partId: part.id,
        materializationId: latest.id,
        loading: false,
        failure: classifyCourseAuthoringError(error, {
          knownCourse: state.course
        }).message,
        value: null
      };
      return false;
    } finally {
      if (state.opened && epoch === materializationEpoch &&
          state.course?.courseId === courseId) render();
    }
  }

  async function openMicrosequenceAssignment() {
    if (!state.course || !state.authoringPlan || state.writeBusy) return false;
    const courseId = state.course.courseId;
    const expectedRevision = state.authoringPlan.courseRevision;
    state.microsequenceAssignment = { loading: true, failure: "", options: [] };
    state.writeFailure = "";
    state.writeMessage = "";
    render();
    try {
      const outline = normalizeCourseAuthoringOutline(
        await controller.loadAuthoringOutline(courseId),
        { expectedCourseId: courseId }
      );
      const course = outline.course;
      if (!state.opened || state.course?.courseId !== courseId) return false;
      if (course.revision !== expectedRevision) {
        state.microsequenceAssignment = null;
        await loadCourse(courseId, { force: true });
        state.writeMessage = "O Curso mudou; o planejamento foi atualizado.";
        return false;
      }
      state.microsequenceAssignment = {
        loading: false,
        failure: "",
        options: microsequenceAssignmentOptions(outline.microsequences, state.authoringPlan)
      };
      return true;
    } catch (error) {
      if (!state.opened || state.course?.courseId !== courseId) return false;
      state.microsequenceAssignment = {
        loading: false,
        failure: classifyCourseAuthoringError(error, { knownCourse: state.course }).message,
        options: []
      };
      return false;
    } finally {
      if (state.opened && state.course?.courseId === courseId) render();
    }
  }

  async function loadCourse(courseId, { force = false } = {}) {
    const needsOutline = state.section === "structure";
    const needsPlanning = state.section === "planning";
    if (!force && state.course?.courseId === courseId &&
        (!needsOutline || state.outline) && (!needsPlanning || state.authoringPlan)) {
      if (state.section === "people" && !state.people) {
        return loadPeople(courseId);
      }
      render();
      return true;
    }
    const epoch = ++courseEpoch;
    state.view = "course";
    state.knownCourse = knownCourses.get(courseId) ||
      (state.course?.courseId === courseId ? state.course : null);
    if (state.course?.courseId !== courseId) {
      state.people = null;
      state.peopleFailure = "";
      state.peopleMessage = "";
      state.grantOpen = false;
      state.planningEditOpen = false;
      state.planningDraft = null;
      state.authoringPlan = null;
      state.planningFailure = "";
      state.planItemEditor = null;
      state.planItemDraft = null;
      state.partEditor = null;
      state.partDraft = null;
      state.linkEditor = null;
      state.microsequenceAssignment = null;
      ++materializationEpoch;
      state.partMaterialization = null;
      clearAvatarUrls();
    }
    if (needsPlanning) {
      state.authoringPlan = null;
      state.planningFailure = "";
      ++materializationEpoch;
      state.partMaterialization = null;
    }
    state.course = null;
    state.outline = null;
    state.failure = null;
    state.loading = true;
    render();
    try {
      const outline = needsOutline
        ? normalizeCourseAuthoringOutline(
            await controller.loadAuthoringOutline(courseId),
            { expectedCourseId: courseId }
          )
        : null;
      const detail = outline?.course || normalizeCourseDetail(
        await controller.getCourse(courseId),
        { expectedCourseId: courseId }
      );
      if (!state.opened || epoch !== courseEpoch || state.view !== "course") return false;
      const course = Object.freeze({
        ...detail,
        goal: detail.goal || state.knownCourse?.goal || null,
        ownership: detail.ownership || state.knownCourse?.ownership || null,
        canEdit: detail.canEdit ?? state.knownCourse?.canEdit ?? null,
        counts: detail.counts || state.knownCourse?.counts || null,
        offlineKnown: detail.offlineKnown || state.knownCourse?.offlineKnown === true
      });
      state.course = course;
      state.knownCourse = course;
      knownCourses.set(courseId, course);
      if (!state.opened || epoch !== courseEpoch || state.view !== "course") return false;
      state.outline = outline;
      if (state.section === "people") await loadPeople(courseId);
      if (state.section === "planning") {
        return loadPlanning(courseId, { expectedCourseRevision: course.revision });
      }
      return true;
    } catch (error) {
      if (!state.opened || epoch !== courseEpoch || state.view !== "course") return false;
      state.failure = classifyCourseAuthoringError(error, { knownCourse: state.knownCourse });
      return false;
    } finally {
      if (state.opened && epoch === courseEpoch && state.view === "course") {
        state.loading = false;
        render();
      }
    }
  }

  async function applyHash(hashValue, { force = false } = {}) {
    const hash = typeof hashValue === "string" ? hashValue : "";
    const route = parseCourseAuthoringRoute(hash);
    if (!route && isCourseAuthoringRouteCandidate(hash)) {
      ++listEpoch;
      ++courseEpoch;
      state.routeKey = `invalid:${hash}`;
      state.view = "invalid";
      state.loading = false;
      state.failure = null;
      render();
      return false;
    }
    if (route) {
      const nextKey = hash;
      state.section = route.section;
      state.routeTarget = route.target;
      if (!force && state.routeKey === nextKey) {
        if (route.section !== "inspection") render();
        return true;
      }
      state.routeKey = nextKey;
      const needsOutline = route.section === "structure";
      if (!force && state.course?.courseId === route.courseId &&
          (!needsOutline || state.outline)) {
        state.view = "course";
        if (route.section === "people" && !state.people) {
          return loadPeople(route.courseId);
        }
        if (route.section === "planning" && !state.authoringPlan) {
          return loadPlanning(route.courseId);
        }
        render({ focus: "#course-authoring-section-title" });
        return true;
      }
      return loadCourse(route.courseId, { force });
    }
    ++courseEpoch;
    state.routeKey = "list";
    state.view = "list";
    state.course = null;
    state.knownCourse = null;
    state.outline = null;
    state.routeTarget = null;
    state.people = null;
    state.peopleFailure = "";
    state.peopleMessage = "";
    state.grantOpen = false;
    state.planningEditOpen = false;
    state.planningDraft = null;
    state.authoringPlan = null;
    state.planningFailure = "";
    state.planItemEditor = null;
    state.planItemDraft = null;
    state.partEditor = null;
    state.partDraft = null;
    state.linkEditor = null;
    state.microsequenceAssignment = null;
    ++materializationEpoch;
    state.partMaterialization = null;
    clearAvatarUrls();
    state.failure = null;
    if (!force && state.list) {
      state.loading = false;
      render();
      return true;
    }
    return loadCourseList({ query: state.query });
  }

  function locationUrl(hash = "") {
    return `${locationValue.pathname || ""}${locationValue.search || ""}${hash}` || hash;
  }

  function navigate(hash, { replace = false } = {}) {
    if (replace && typeof historyValue?.replaceState === "function") {
      historyValue.replaceState(historyValue.state ?? null, "", locationUrl(hash));
      if (locationValue.hash !== hash) locationValue.hash = hash;
    } else {
      locationValue.hash = hash;
    }
    return applyHash(hash);
  }

  function showList() {
    return navigate("", { replace: true });
  }

  function handleHashChange() {
    void applyHash(locationValue.hash || "");
  }

  async function open() {
    if (!state.opened) {
      state.opened = true;
      if (!hashListening && typeof windowValue?.addEventListener === "function") {
        windowValue.addEventListener("hashchange", handleHashChange);
        hashListening = true;
      }
    }
    return applyHash(locationValue.hash || "", { force: state.routeKey === "" });
  }

  function close() {
    ++listEpoch;
    ++courseEpoch;
    ++materializationEpoch;
    state.opened = false;
    state.loading = false;
    destroyInspectionSequence();
    if (hashListening && typeof windowValue?.removeEventListener === "function") {
      windowValue.removeEventListener("hashchange", handleHashChange);
      hashListening = false;
    }
    root.innerHTML = "";
    clearAvatarUrls();
    root.setAttribute?.("aria-busy", "false");
    onClose();
  }

  function handleBack() {
    if (!state.opened) return false;
    if (state.view === "course" || state.view === "invalid") {
      void showList();
      return true;
    }
    close();
    return true;
  }

  async function refresh() {
    const route = parseCourseAuthoringRoute(locationValue.hash || "");
    if (route?.section === "inspection" && inspectionSequence && state.course) {
      const sequence = inspectionSequence;
      try {
        const detail = normalizeCourseDetail(await controller.getCourse(route.courseId), {
          expectedCourseId: route.courseId
        });
        if (!state.opened || sequence !== inspectionSequence || state.routeKey !== locationValue.hash) {
          return false;
        }
        const course = Object.freeze({
          ...detail,
          goal: detail.goal || state.course.goal || null,
          ownership: detail.ownership || state.course.ownership || null,
          canEdit: detail.canEdit ?? state.course.canEdit ?? null,
          counts: detail.counts || state.course.counts || null,
          offlineKnown: detail.offlineKnown || state.course.offlineKnown === true
        });
        state.course = course;
        state.knownCourse = course;
        knownCourses.set(course.courseId, course);
        const refreshed = await sequence.refresh(course.revision);
        if (sequence === inspectionSequence) {
          const header = root.querySelector?.(".course-authoring-course-header");
          if (header) header.outerHTML = renderCourseHeader(course);
        }
        return refreshed;
      } catch (error) {
        const notice = root.querySelector?.(".course-inspection-copy-status");
        if (notice) notice.textContent = classifyCourseAuthoringError(error, {
          knownCourse: state.course
        }).message;
        return false;
      }
    }
    const preservedState = typeof root.querySelectorAll === "function"
      ? captureRenderState(root, {
          trackedScrollSelectors: [".course-authoring-surface", ".course-authoring-frame"],
          includePageScroll: true,
          includeFocus: true
        })
      : null;
    const refreshed = route
      ? await loadCourse(route.courseId, { force: true })
      : await loadCourseList({ query: state.query });
    if (preservedState) {
      restoreRenderState(root, preservedState, {
        restorePageScroll: true,
        restoreFocus: true
      });
    }
    return refreshed;
  }

  async function runPlanningCommand({
    draft,
    command,
    startedMessage,
    successMessage,
    afterSuccess = () => {}
  }) {
    if (!state.course || !state.authoringPlan || state.writeBusy) return false;
    if (!pendingWriteMatches(state.pendingPlanningCommand, draft)) {
      state.pendingPlanningCommand = null;
    }
    const retainedCommand = state.pendingPlanningCommand?.command || command;
    state.pendingPlanningCommand ||= {
      draft: structuredClone(draft),
      command: structuredClone(retainedCommand)
    };
    state.writeBusy = true;
    state.writeFailure = "";
    state.writeMessage = startedMessage;
    render();
    try {
      await controller.mutateAuthoringPlan(structuredClone(retainedCommand));
      const courseId = state.course.courseId;
      state.pendingPlanningCommand = null;
      afterSuccess();
      await loadCourse(courseId, { force: true });
      state.writeMessage = successMessage;
      return true;
    } catch (error) {
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingPlanningCommand = null;
      state.writeFailure = ambiguous
        ? ambiguousWriteFailureMessage(error)
        : writeFailureMessage(error);
      state.writeMessage = "";
      return false;
    } finally {
      state.writeBusy = false;
      render();
    }
  }

  function planCommand(operation, payload = {}) {
    return {
      requestId: createUuid(),
      courseId: state.course.courseId,
      expectedCourseRevision: state.authoringPlan.courseRevision,
      expectedPlanVersion: state.authoringPlan.plan.version,
      operation,
      ...payload
    };
  }

  function runDirectPlanningCommand(operation, payload, successMessage) {
    const draft = { operation, ...payload };
    const command = pendingWriteMatches(state.pendingPlanningCommand, draft)
      ? state.pendingPlanningCommand.command
      : planCommand(operation, payload);
    void runPlanningCommand({
      draft,
      command,
      startedMessage: "Atualizando planejamento…",
      successMessage
    });
  }

  async function requestPartMaterialization(part) {
    if (!part || state.writeBusy || state.materializationBusyPartId) return false;
    const hash = buildCourseAuthoringRoute(state.course.courseId, { section: "planning" });
    const deepLink = `${locationValue.origin || ""}${locationUrl(hash)}`;
    const requestText = `Quero materializar a Parte de autoria “${part.title}” do Curso ` +
      `“${state.course.title}”. Use somente o planejamento persistido, os vínculos e os ` +
      `contratos disponíveis. Registre somente o que for realmente produzido e ` +
      `devolva um resumo breve com contagens, avisos e próximos passos. ` +
      `Parte: ${part.id}. Abra: ${deepLink}`;
    const retained = state.pendingMaterializationCommand?.authoringPartId === part.id
      ? state.pendingMaterializationCommand.payload
      : {
          requestId: createUuid(),
          courseId: state.course.courseId,
          authoringPartId: part.id,
          expectedCourseRevision: state.authoringPlan.courseRevision,
          deepLink,
          requestText
        };
    state.pendingMaterializationCommand = {
      authoringPartId: part.id,
      payload: structuredClone(retained)
    };
    state.materializationBusyPartId = part.id;
    state.writeFailure = "";
    state.writeMessage = "Entregando pedido ao chat conectado…";
    render();
    try {
      const result = await controller.requestPartMaterialization(structuredClone(retained));
      if (!["chat", "clipboard"].includes(result?.delivery)) {
        throw new TypeError("O chat conectado não confirmou a entrega do pedido.");
      }
      state.pendingMaterializationCommand = null;
      state.writeMessage = result.message || (result.delivery === "chat"
        ? "Pedido entregue ao chat conectado."
        : "Pedido copiado para levar ao chat conectado.");
      return true;
    } catch (error) {
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingMaterializationCommand = null;
      state.writeFailure = ambiguous
        ? ambiguousWriteFailureMessage(error)
        : writeFailureMessage(error);
      state.writeMessage = "";
      return false;
    } finally {
      state.materializationBusyPartId = null;
      render();
    }
  }

  root.addEventListener("submit", (event) => {
    if (!state.opened) return;
    if (event.target.matches?.("[data-course-authoring-create]")) {
      event.preventDefault();
      if (state.writeBusy) return;
      const title = String(event.target.elements?.title?.value || "").trim();
      const objective = String(event.target.elements?.objective?.value || "").trim();
      const draft = { title, objective };
      if (!pendingWriteMatches(state.pendingCreateCommand, draft)) {
        state.pendingCreateCommand = null;
      }
      state.createDraft = draft;
      if (!title || title.length > 300 || !objective || objective.length > 2_000) {
        state.writeFailure = "Revise o título e o objetivo.";
        render({ focus: "#course-authoring-create-title" });
        return;
      }
      const command = state.pendingCreateCommand?.command || {
        requestId: createUuid(),
        title,
        objective
      };
      state.pendingCreateCommand ||= {
        draft: structuredClone(draft),
        command: structuredClone(command)
      };
      state.writeBusy = true;
      state.writeFailure = "";
      state.writeMessage = "Criando Curso…";
      render();
      void Promise.resolve().then(() => controller.createCourse(
        structuredClone(command)
      )).then(async (result) => {
        const courseId = String(result?.courseId || "").trim().toLowerCase();
        await controller.clearCourse?.(courseId);
        state.pendingCreateCommand = null;
        state.createOpen = false;
        state.createDraft = null;
        state.writeMessage = "Curso criado.";
        await navigate(buildCourseAuthoringRoute(courseId, { section: "planning" }));
      }).catch((error) => {
        const ambiguous = ambiguousWriteFailure(error);
        if (!ambiguous) state.pendingCreateCommand = null;
        state.writeFailure = ambiguous
          ? ambiguousWriteFailureMessage(error)
          : writeFailureMessage(error);
        state.writeMessage = "";
      }).finally(() => {
        state.writeBusy = false;
        render();
      });
      return;
    }
    if (event.target.matches?.("[data-course-authoring-planning]")) {
      event.preventDefault();
      if (!state.course || !state.authoringPlan || state.writeBusy) return;
      const title = String(event.target.elements?.title?.value || "").trim();
      const objective = String(event.target.elements?.objective?.value || "").trim();
      const audience = String(event.target.elements?.audience?.value || "").trim();
      const scope = String(event.target.elements?.scope?.value || "").trim();
      const authoringGuidance = String(
        event.target.elements?.authoringGuidance?.value || ""
      ).trim();
      const rangeMinimum = Number(event.target.elements?.rangeMinimum?.value);
      const rangeMaximum = Number(event.target.elements?.rangeMaximum?.value);
      const rangeOrigin = String(event.target.elements?.rangeOrigin?.value || "");
      const draft = {
        title,
        objective,
        audience,
        scope,
        authoringGuidance,
        rangeMinimum,
        rangeMaximum,
        rangeOrigin
      };
      state.planningDraft = draft;
      if (!title || title.length > 300 || !objective || objective.length > 2_000 ||
          audience.length > 4_000 || scope.length > 8_000 || authoringGuidance.length > 16_384 ||
          !Number.isSafeInteger(rangeMinimum) || !Number.isSafeInteger(rangeMaximum) ||
          rangeMinimum < 1 || rangeMaximum > 64 || rangeMinimum > rangeMaximum ||
          !Object.hasOwn(PART_RANGE_ORIGIN_LABELS, rangeOrigin)) {
        state.writeFailure = "Revise o título, o plano e a faixa preferencial de Partes.";
        render({ focus: "#course-authoring-edit-title" });
        return;
      }
      const command = pendingWriteMatches(state.pendingPlanningCommand, draft)
        ? state.pendingPlanningCommand.command
        : planCommand("update_plan", {
          title,
          objective,
          audience,
          scope,
          authoringGuidance,
          preferredPartCount: {
            minimum: rangeMinimum,
            maximum: rangeMaximum,
            origin: rangeOrigin
          }
        });
      void runPlanningCommand({
        draft,
        command,
        startedMessage: "Salvando planejamento…",
        successMessage: "Planejamento salvo.",
        afterSuccess() {
          state.planningEditOpen = false;
          state.planningDraft = null;
        }
      });
      return;
    }
    if (event.target.matches?.("[data-course-authoring-plan-item]")) {
      event.preventDefault();
      if (!state.course || !state.authoringPlan || state.writeBusy) return;
      const id = String(event.target.elements?.id?.value || "").trim().toLowerCase();
      const listName = String(event.target.elements?.listName?.value || "").trim();
      const statement = String(event.target.elements?.statement?.value || "").trim();
      const list = state.authoringPlan.plan[listName];
      const current = id && Array.isArray(list) ? list.find((item) => item.id === id) : null;
      state.planItemDraft = { id, listName, statement };
      if (!Object.hasOwn(PLAN_ITEM_LABELS, listName) || !statement || statement.length > 2_000 ||
          (id && !current)) {
        state.writeFailure = "Revise o tipo e o enunciado do item.";
        render({ focus: "#course-authoring-item-text" });
        return;
      }
      const operation = current ? "update_plan_item" : "add_plan_item";
      const payload = current ? {
        kind: PLAN_ITEM_KINDS[listName],
        id,
        statement
      } : {
        kind: PLAN_ITEM_KINDS[listName],
        id: createUuid(),
        statement,
        position: list.length
      };
      const draft = { operation, listName, id, statement };
      const command = pendingWriteMatches(state.pendingPlanningCommand, draft)
        ? state.pendingPlanningCommand.command
        : planCommand(operation, payload);
      void runPlanningCommand({
        draft,
        command,
        startedMessage: "Salvando item…",
        successMessage: "Item do planejamento salvo.",
        afterSuccess() {
          state.planItemEditor = null;
          state.planItemDraft = null;
        }
      });
      return;
    }
    if (event.target.matches?.("[data-course-authoring-part]")) {
      event.preventDefault();
      if (!state.course || !state.authoringPlan || state.writeBusy) return;
      const partId = String(event.target.elements?.partId?.value || "").trim().toLowerCase();
      const title = String(event.target.elements?.title?.value || "").trim();
      const intent = String(event.target.elements?.intent?.value || "").trim();
      const current = partId
        ? state.authoringPlan.plan.parts.find((part) => part.id === partId)
        : null;
      state.partDraft = { partId, title, intent };
      if (!title || title.length > 300 || intent.length > 4_000 || (partId && !current)) {
        state.writeFailure = "Revise o título e a intenção da Parte.";
        render({ focus: "#course-authoring-part-title" });
        return;
      }
      const operation = current ? "update_part" : "add_part";
      const payload = current ? {
        id: partId,
        title,
        intent
      } : {
        id: createUuid(),
        title,
        intent,
        position: state.authoringPlan.plan.parts.length
      };
      const draft = { operation, partId, title, intent };
      const command = pendingWriteMatches(state.pendingPlanningCommand, draft)
        ? state.pendingPlanningCommand.command
        : planCommand(operation, payload);
      void runPlanningCommand({
        draft,
        command,
        startedMessage: "Salvando Parte…",
        successMessage: "Parte salva.",
        afterSuccess() {
          state.partEditor = null;
          state.partDraft = null;
        }
      });
      return;
    }
    if (event.target.matches?.("[data-course-authoring-assignment]")) {
      event.preventDefault();
      if (!state.course || !state.authoringPlan || state.writeBusy) return;
      const microsequenceId = String(
        event.target.elements?.microsequenceId?.value || ""
      ).trim();
      const partId = String(event.target.elements?.partId?.value || "")
        .trim().toLowerCase();
      const option = state.microsequenceAssignment?.options.find(
        (value) => value.id === microsequenceId
      );
      const part = state.authoringPlan.plan.parts.find((value) => value.id === partId);
      if (!option || !part) {
        state.writeFailure = "Escolha uma microssequência e uma Parte válidas.";
        render({ focus: "#course-authoring-unlinked-microsequence" });
        return;
      }
      const draft = { operation: "assign_microsequence", microsequenceId, partId };
      const command = pendingWriteMatches(state.pendingPlanningCommand, draft)
        ? state.pendingPlanningCommand.command
        : planCommand("assign_microsequence", { microsequenceId, partId });
      void runPlanningCommand({
        draft,
        command,
        startedMessage: "Vinculando microssequência…",
        successMessage: "Microssequência vinculada à Parte.",
        afterSuccess() {
          state.microsequenceAssignment = null;
        }
      });
      return;
    }
    if (event.target.matches?.("[data-course-authoring-link]")) {
      event.preventDefault();
      if (!state.course || !state.authoringPlan || state.writeBusy) return;
      const microsequenceId = String(
        event.target.elements?.microsequenceId?.value || ""
      ).trim();
      const partId = String(event.target.elements?.partId?.value || "").trim().toLowerCase();
      if (!microsequenceId || (partId && !state.authoringPlan.plan.parts.some(
        (part) => part.id === partId
      ))) {
        state.writeFailure = "Escolha um destino válido para a microssequência.";
        render();
        return;
      }
      const targetPart = partId
        ? state.authoringPlan.plan.parts.find((part) => part.id === partId)
        : null;
      const operation = targetPart ? "move_microsequence" : "remove_microsequence";
      const payload = targetPart ? {
        partId,
        microsequenceId,
        position: targetPart.microsequences.length
      } : { microsequenceId };
      const draft = { operation, ...payload };
      const command = pendingWriteMatches(state.pendingPlanningCommand, draft)
        ? state.pendingPlanningCommand.command
        : planCommand(operation, payload);
      void runPlanningCommand({
        draft,
        command,
        startedMessage: "Atualizando vínculo…",
        successMessage: "Vínculo atualizado.",
        afterSuccess() {
          state.linkEditor = null;
        }
      });
      return;
    }
    if (event.target.matches?.("[data-course-authoring-grant]")) {
      event.preventDefault();
      if (!state.course || state.peopleBusy) return;
      const email = String(event.target.elements?.email?.value || "").trim().toLowerCase();
      if (!email || !confirmValue(
        `Conceder a ${email} acesso para Estudo neste Curso?`
      )) return;
      state.peopleBusy = true;
      state.peopleFailure = "";
      state.peopleMessage = "Concedendo acesso…";
      render();
      void controller.grantCourseAccess({
        courseId: state.course.courseId,
        email,
        confirmed: true
      }).then(async () => {
        state.grantOpen = false;
        await loadPeople(state.course.courseId);
        state.peopleMessage = "Acesso concedido.";
      }).catch((error) => {
        state.peopleFailure = classifyCourseAuthoringError(error).message;
      }).finally(() => {
        state.peopleBusy = false;
        render();
      });
      return;
    }
    if (!event.target.matches?.("[data-course-authoring-search]")) return;
    event.preventDefault();
    const query = event.target.querySelector?.("[data-course-authoring-query]")?.value || "";
    void loadCourseList({ query });
  });

  root.addEventListener("click", (event) => {
    if (!state.opened) return;
    const node = event.target.closest?.("[data-course-authoring-action]");
    if (!node || (typeof root.contains === "function" && !root.contains(node))) return;
    const action = node.dataset.courseAuthoringAction;
    if (["open-course", "change-section"].includes(action)) event.preventDefault();
    if (action === "open-course") {
      void navigate(buildCourseAuthoringRoute(node.dataset.courseId, { section: "inspection" }));
    } else if (action === "change-section" && state.course) {
      void navigate(buildCourseAuthoringRoute(state.course.courseId, {
        section: node.dataset.section
      }));
    } else if (action === "show-list") {
      void showList();
    } else if (action === "close-surface") {
      close();
    } else if (action === "load-more-courses" && state.list?.hasMore && !state.loading) {
      void loadCourseList({
        query: state.query,
        cursor: state.list.nextCursor,
        append: true
      });
    } else if (action === "retry") {
      void refresh();
    } else if (action === "retry-planning" && state.course) {
      void loadPlanning(state.course.courseId);
    } else if (action === "retry-people" && state.course) {
      void loadPeople(state.course.courseId);
    } else if (action === "open-create") {
      state.createOpen = true;
      state.createDraft = null;
      state.pendingCreateCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render({ focus: "#course-authoring-create-title" });
    } else if (action === "cancel-create") {
      state.createOpen = false;
      state.createDraft = null;
      state.pendingCreateCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render();
    } else if (action === "add-plan-item" && !state.writeBusy) {
      state.planItemEditor = { mode: "add", listName: "intendedLearningOutcomes" };
      state.planItemDraft = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render({ focus: "#course-authoring-item-kind" });
    } else if (action === "edit-plan-item" && !state.writeBusy) {
      const listName = String(node.dataset.planList || "");
      const id = String(node.dataset.itemId || "");
      const item = state.authoringPlan?.plan?.[listName]?.find?.((value) => value.id === id);
      if (!item) return;
      state.planItemEditor = { mode: "edit", listName, id };
      state.planItemDraft = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render({ focus: "#course-authoring-item-text" });
    } else if (action === "cancel-plan-item") {
      state.planItemEditor = null;
      state.planItemDraft = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render();
    } else if (["move-plan-item-up", "move-plan-item-down"].includes(action) &&
        !state.writeBusy) {
      const listName = String(node.dataset.planList || "");
      const id = String(node.dataset.itemId || "");
      const list = state.authoringPlan?.plan?.[listName];
      const index = list?.findIndex?.((item) => item.id === id) ?? -1;
      const item = index >= 0 ? list[index] : null;
      const position = index + (action.endsWith("up") ? -1 : 1);
      if (!item || position < 0 || position >= list.length) return;
      const orderedIds = list.map((value) => value.id);
      [orderedIds[index], orderedIds[position]] = [orderedIds[position], orderedIds[index]];
      runDirectPlanningCommand("reorder_plan_items", {
        kind: PLAN_ITEM_KINDS[listName],
        orderedIds
      }, "Item reordenado.");
    } else if (action === "remove-plan-item" && !state.writeBusy) {
      const listName = String(node.dataset.planList || "");
      const id = String(node.dataset.itemId || "");
      const item = state.authoringPlan?.plan?.[listName]?.find?.((value) => value.id === id);
      if (!item || !confirmValue("Remover este item do planejamento?")) return;
      runDirectPlanningCommand("remove_plan_item", {
        kind: PLAN_ITEM_KINDS[listName],
        id
      }, "Item removido.");
    } else if (action === "add-part" && !state.writeBusy) {
      state.partEditor = { mode: "add" };
      state.partDraft = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render({ focus: "#course-authoring-part-title" });
    } else if (action === "edit-part" && !state.writeBusy) {
      const partId = String(node.dataset.partId || "");
      if (!state.authoringPlan?.plan.parts.some((part) => part.id === partId)) return;
      state.partEditor = { mode: "edit", partId };
      state.partDraft = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render({ focus: "#course-authoring-part-title" });
    } else if (action === "cancel-part-edit") {
      state.partEditor = null;
      state.partDraft = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render();
    } else if (["move-part-up", "move-part-down"].includes(action) && !state.writeBusy) {
      const partId = String(node.dataset.partId || "");
      const index = state.authoringPlan?.plan.parts.findIndex((part) => part.id === partId) ?? -1;
      const part = index >= 0 ? state.authoringPlan.plan.parts[index] : null;
      const position = index + (action.endsWith("up") ? -1 : 1);
      if (!part || position < 0 || position >= state.authoringPlan.plan.parts.length) return;
      const orderedIds = state.authoringPlan.plan.parts.map((value) => value.id);
      [orderedIds[index], orderedIds[position]] = [orderedIds[position], orderedIds[index]];
      runDirectPlanningCommand("reorder_parts", {
        orderedIds
      }, "Parte reordenada.");
    } else if (action === "remove-part" && !state.writeBusy) {
      const partId = String(node.dataset.partId || "");
      const part = state.authoringPlan?.plan.parts.find((value) => value.id === partId);
      if (!part || !confirmValue(
        "Remover esta Parte do plano? O conteúdo didático permanece e seus vínculos ficam sem Parte."
      )) return;
      runDirectPlanningCommand("remove_part", {
        id: partId
      }, "Parte removida; o conteúdo didático foi preservado.");
    } else if (action === "split-part" && !state.writeBusy) {
      const partId = String(node.dataset.partId || "");
      const afterMicrosequenceId = String(node.dataset.afterMicrosequenceId || "");
      const part = state.authoringPlan?.plan.parts.find((value) => value.id === partId);
      if (!part || !afterMicrosequenceId) return;
      const draft = { operation: "split_part", partId, afterMicrosequenceId };
      const boundary = part.microsequences.findIndex(
        (microsequence) => microsequence.id === afterMicrosequenceId
      );
      const movedMicrosequenceIds = part.microsequences.slice(boundary + 1)
        .map((microsequence) => microsequence.id);
      if (boundary < 0 || movedMicrosequenceIds.length === 0) return;
      const command = pendingWriteMatches(state.pendingPlanningCommand, draft)
        ? state.pendingPlanningCommand.command
        : planCommand("split_part", {
            partId,
            newPartId: createUuid(),
            newPartPosition: part.position + 1,
            title: `${part.title} — continuação`,
            intent: part.intent || "",
            microsequenceIds: movedMicrosequenceIds
          });
      void runPlanningCommand({
        draft,
        command,
        startedMessage: "Dividindo Parte…",
        successMessage: "Parte dividida."
      });
    } else if (action === "join-parts" && !state.writeBusy) {
      const firstPartId = String(node.dataset.previousPartId || "");
      const secondPartId = String(node.dataset.partId || "");
      const firstPart = state.authoringPlan?.plan.parts.find((part) => part.id === firstPartId);
      const secondPart = state.authoringPlan?.plan.parts.find((part) => part.id === secondPartId);
      if (!firstPart || !secondPart || !confirmValue(
        `Unir “${firstPart.title}” e “${secondPart.title}” em uma Parte?`
      )) return;
      runDirectPlanningCommand("join_parts", {
        sourcePartId: secondPartId,
        targetPartId: firstPartId
      }, "Partes unidas.");
    } else if (action === "open-microsequence-assignment" && !state.writeBusy) {
      void openMicrosequenceAssignment();
    } else if (action === "cancel-microsequence-assignment") {
      state.microsequenceAssignment = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render();
    } else if (action === "edit-part-link" && !state.writeBusy) {
      const microsequenceId = String(node.dataset.microsequenceId || "");
      const partId = String(node.dataset.partId || "");
      if (!microsequenceId || !partId) return;
      state.linkEditor = { microsequenceId, targetPartId: partId };
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render({ focus: "#course-authoring-link-target" });
    } else if (action === "cancel-link-edit") {
      state.linkEditor = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render();
    } else if (action === "view-materialization") {
      const partId = String(node.dataset.partId || "");
      const part = state.authoringPlan?.plan.parts.find((value) => value.id === partId);
      void loadPartMaterialization(part);
    } else if (action === "hide-materialization") {
      ++materializationEpoch;
      state.partMaterialization = null;
      render();
    } else if (action === "materialize-part" && !state.writeBusy) {
      const partId = String(node.dataset.partId || "");
      const part = state.authoringPlan?.plan.parts.find((value) => value.id === partId);
      void requestPartMaterialization(part);
    } else if (action === "open-planning-edit" && state.course) {
      state.planningEditOpen = true;
      state.planningDraft = null;
      state.planItemEditor = null;
      state.partEditor = null;
      state.linkEditor = null;
      state.microsequenceAssignment = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render({ focus: "#course-authoring-edit-title" });
    } else if (action === "cancel-planning-edit") {
      state.planningEditOpen = false;
      state.planningDraft = null;
      state.pendingPlanningCommand = null;
      state.writeFailure = "";
      state.writeMessage = "";
      render();
    } else if (action === "open-grant") {
      state.grantOpen = true;
      state.peopleFailure = "";
      render({ focus: "#course-authoring-access-email" });
    } else if (action === "cancel-grant") {
      state.grantOpen = false;
      render();
    } else if (action === "revoke-access" && state.course && !state.peopleBusy) {
      const userId = String(node.dataset.userId || "");
      const displayName = String(node.dataset.displayName || "esta pessoa");
      if (!confirmValue(
        `Revogar o acesso de ${displayName}? O estado pessoal de Estudo será preservado.`
      )) return;
      state.peopleBusy = true;
      state.peopleFailure = "";
      state.peopleMessage = "Revogando acesso…";
      render();
      void controller.revokeCourseAccess({
        courseId: state.course.courseId,
        userId,
        confirmed: true
      }).then(async () => {
        await loadPeople(state.course.courseId);
        state.peopleMessage = "Acesso revogado; o estado pessoal foi preservado.";
      }).catch((error) => {
        state.peopleFailure = classifyCourseAuthoringError(error).message;
      }).finally(() => {
        state.peopleBusy = false;
        render();
      });
    }
  });

  return Object.freeze({
    open,
    close,
    refresh,
    handleBack,
    get opened() {
      return state.opened;
    },
    get route() {
      return parseCourseAuthoringRoute(locationValue.hash || "");
    }
  });
}
