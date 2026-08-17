import { renderUiIcon } from "./renderUiIcons.js";
import { createUuid } from "../domain/identifiers.js";
import { captureRenderState, restoreRenderState } from "./renderState.js";
import {
  buildCourseAuthoringRoute,
  isCourseAuthoringRouteCandidate,
  parseCourseAuthoringRoute
} from "./courseAuthoringRoute.js";
import {
  classifyCourseAuthoringError,
  countCourseEntities,
  courseListCardinality,
  mergeCourseListPages,
  normalizeCourseDetail,
  normalizeCourseEntityPage,
  normalizeCourseListPage,
  projectCourseEntities,
  projectCoursePlanning
} from "./courseAuthoringViewModel.js";

const DEFAULT_COURSE_LIMIT = 24;
const DEFAULT_ENTITY_LIMIT = 500;
const EMPTY_AUTHORING_STATE = Object.freeze({
  version: 1,
  parts: Object.freeze([]),
  decisions: Object.freeze([]),
  mandate: null
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function editableAuthoringState(source) {
  let value;
  try {
    value = JSON.parse(String(source || ""));
  } catch {
    throw new TypeError("O estado estruturado não contém JSON válido.");
  }
  const fields = ["version", "parts", "decisions", "mandate"];
  const prototype = value && typeof value === "object" && !Array.isArray(value)
    ? Object.getPrototypeOf(value)
    : null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (prototype !== Object.prototype && prototype !== null) ||
      Object.keys(value).length !== fields.length ||
      fields.some((field) => !Object.hasOwn(value, field)) ||
      value.version !== 1 || !Array.isArray(value.parts) || value.parts.length > 64 ||
      !Array.isArray(value.decisions) || value.decisions.length > 512 ||
      (value.mandate !== null && (typeof value.mandate !== "object" ||
        Array.isArray(value.mandate))) ||
      new TextEncoder().encode(JSON.stringify(value)).byteLength > 1_048_576) {
    throw new TypeError("O estado estruturado precisa manter versão, partes, decisões e mandato.");
  }
  return value;
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
  const href = buildCourseAuthoringRoute(course.courseId, { section: "structure" });
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
      '<label for="course-authoring-create-goal">Objetivo</label>' +
      `<input id="course-authoring-create-goal" name="goal" maxlength="2000" required autocomplete="off" value="${escapeHtml(state.createDraft?.goal || "")}">` +
      '<label for="course-authoring-create-brief">Orientações</label>' +
      `<textarea id="course-authoring-create-brief" name="brief" maxlength="16384" rows="4">${escapeHtml(state.createDraft?.brief || "")}</textarea>` +
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
    { key: "content", label: "Conteúdo", icon: "card" },
    { key: "people", label: "Pessoas", icon: "account-add" }
  ];
  return `<nav class="course-authoring-sections has-people"` +
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

function renderPlanningMetric({ icon, count, label }) {
  return '<div class="course-authoring-planning-metric">' +
    renderUiIcon(icon, "course-authoring-section-icon") +
    `<div><strong>${escapeHtml(count)}</strong><span>${escapeHtml(label)}</span></div></div>`;
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
  const planning = projectCoursePlanning(course);
  const stateValue = course.authoringState || EMPTY_AUTHORING_STATE;
  const draft = state.planningDraft || {
    title: course.title,
    goal: course.goal || "",
    brief: course.brief || "",
    authoringState: JSON.stringify(stateValue, null, 2)
  };
  const editForm = state.planningEditOpen
    ? '<form class="course-authoring-write-form" data-course-authoring-planning>' +
      '<label for="course-authoring-edit-title">Título</label>' +
      `<input id="course-authoring-edit-title" name="title" maxlength="300" required value="${escapeHtml(draft.title)}">` +
      '<label for="course-authoring-edit-goal">Objetivo</label>' +
      `<textarea id="course-authoring-edit-goal" name="goal" maxlength="2000" rows="4" required>${escapeHtml(draft.goal)}</textarea>` +
      '<label for="course-authoring-edit-brief">Orientações</label>' +
      `<textarea id="course-authoring-edit-brief" name="brief" maxlength="16384" rows="6">${escapeHtml(draft.brief)}</textarea>` +
      '<details><summary>Estado estruturado</summary>' +
      '<label class="course-authoring-visually-hidden" for="course-authoring-edit-state">Estado estruturado em JSON</label>' +
      `<textarea id="course-authoring-edit-state" name="authoringState" rows="10" spellcheck="false">${escapeHtml(draft.authoringState)}</textarea>` +
      '</details><div class="course-authoring-write-actions">' +
      `<button type="submit"${state.writeBusy ? " disabled" : ""} aria-label="Salvar planejamento" title="Salvar planejamento">` +
      renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
      '<button type="button" data-course-authoring-action="cancel-planning-edit" aria-label="Cancelar" title="Cancelar">' +
      renderUiIcon("remove-state", "course-authoring-button-icon") + "</button></div></form>"
    : "";
  return '<section class="course-authoring-section course-authoring-planning"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div>' +
    '<h2 id="course-authoring-section-title">Planejamento</h2></div>' +
    '<button type="button" class="course-authoring-header-action"' +
    ' data-course-authoring-action="open-planning-edit" aria-label="Editar planejamento" title="Editar planejamento">' +
    renderUiIcon("edit", "course-authoring-button-icon") + "</button></header>" +
    editForm +
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
      label: "Orientações",
      value: planning?.orientations,
      emptyLabel: "Ainda não definidas."
    }) +
    '</div><div class="course-authoring-planning-metrics" aria-label="Dimensões do planejamento">' +
    renderPlanningMetric({
      icon: "module",
      count: planning?.partCount || 0,
      label: "Partes de autoria"
    }) +
    renderPlanningMetric({
      icon: "review",
      count: planning?.decisionCount || 0,
      label: "Decisões"
    }) +
    "</div>") + "</section>";
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
  if (state.loading && !state.entities) {
    return '<p class="course-authoring-loading" role="status">Carregando Curso…</p>';
  }
  if (state.failure && !state.entities) {
    return statusPanel({
      kind: state.failure.kind,
      title: state.failure.kind === "revision-changed" ? "Curso atualizado" : "Conteúdo indisponível",
      message: state.failure.message,
      action: state.failure.kind === "access-revoked" ? "" : "retry",
      actionLabel: "Recarregar"
    });
  }
  if (state.section === "planning") {
    return renderPlanningSection(state);
  }
  const page = state.entities;
  const items = projectCourseEntities(page?.items || [], { section: state.section });
  const loadedCounts = countCourseEntities(page?.items || []);
  const counts = state.course?.counts ? {
    microsequences: state.course.counts.microsequenceCount,
    units: state.course.counts.studyUnitCount
  } : loadedCounts;
  const heading = state.section === "content" ? "Conteúdo" : "Estrutura";
  const countLabel = countedLabel(
    counts.microsequences,
    "microssequência",
    "microssequências",
    false
  ) + " · " + countedLabel(counts.units, "unidade", "unidades", false);
  return `<section class="course-authoring-section" aria-labelledby="course-authoring-section-title">` +
    '<header class="course-authoring-section-heading">' +
    `<div><h2 id="course-authoring-section-title">${heading}</h2>` +
    `<p>${escapeHtml(countLabel)}</p></div></header>` +
    (page?.offlineKnown
      ? '<p class="course-authoring-notice" role="status">Exibindo o conteúdo disponível neste dispositivo.</p>'
      : "") +
    (items.length
      ? `<div class="course-authoring-entities">${items.map(renderEntityItem).join("")}</div>`
      : statusPanel({
          kind: "empty",
          title: state.section === "content" ? "Sem unidades" : "Estrutura vazia",
          message: state.section === "content"
            ? "Este Curso ainda não tem unidades."
            : "Este Curso ainda não tem itens estruturais."
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
    "listCourses", "getCourse", "loadCourseDocument", "createCourse", "updateCourse"
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
  entityLimit = DEFAULT_ENTITY_LIMIT,
  locationValue = globalThis.location || { hash: "", pathname: "", search: "" },
  historyValue = globalThis.history || null,
  windowValue = globalThis.window || null,
  urlValue = globalThis.URL || null,
  confirmValue = globalThis.confirm?.bind(globalThis) || (() => false),
  onClose = () => {}
} = {}) {
  if (!root || typeof root.addEventListener !== "function") {
    throw new TypeError("Elemento raiz da Autoria de Cursos ausente.");
  }
  assertController(controller);
  if (!Number.isSafeInteger(courseLimit) || courseLimit < 1 || courseLimit > 50 ||
      !Number.isSafeInteger(entityLimit) || entityLimit < 1 || entityLimit > 1_000) {
    throw new TypeError("Limite de paginação inválido.");
  }

  let listEpoch = 0;
  let courseEpoch = 0;
  let hashListening = false;
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
    entities: null,
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
    pendingCreateCommand: null,
    pendingPlanningCommand: null,
    writeBusy: false,
    writeMessage: "",
    writeFailure: "",
    avatarUrls
  };

  function clearAvatarUrls() {
    avatarUrls.forEach((source) => urlValue?.revokeObjectURL?.(source));
    avatarUrls.clear();
  }

  function render({ focus = "" } = {}) {
    if (!state.opened) return;
    root.innerHTML = renderCourseAuthoringSurface(state);
    root.setAttribute?.("aria-busy", String(state.loading));
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

  async function loadCourse(courseId, { force = false } = {}) {
    const needsEntities = ["structure", "content"].includes(state.section);
    if (!force && state.course?.courseId === courseId &&
        (!needsEntities || state.entities)) {
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
      clearAvatarUrls();
    }
    state.course = null;
    state.entities = null;
    state.failure = null;
    state.loading = true;
    render();
    try {
      const loaded = needsEntities
        ? await controller.loadCourseDocument(courseId, {
            entityPageSize: entityLimit,
            verifiedRevision: state.list?.offlineKnown === false
              ? state.knownCourse?.revision ?? null
              : null
          })
        : { course: await controller.getCourse(courseId), rows: null };
      const detail = normalizeCourseDetail(loaded?.course, {
        expectedCourseId: courseId
      });
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
      const entities = needsEntities
        ? normalizeCourseEntityPage({
          contract: "aralearn.course-entities.v1",
          courseId,
          revision: course.revision,
          items: Array.isArray(loaded?.rows) ? loaded.rows : [],
          hasMore: false,
          nextCursor: null,
          offline: loaded?.offline === true,
          stale: loaded?.stale === true
        }, {
          expectedCourseId: courseId,
          expectedRevision: course.revision
        })
        : null;
      if (!state.opened || epoch !== courseEpoch || state.view !== "course") return false;
      state.entities = entities;
      if (state.section === "people") await loadPeople(courseId);
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
      const nextKey = `${route.courseId}:${route.section}`;
      state.section = route.section;
      if (!force && state.routeKey === nextKey) {
        render();
        return true;
      }
      state.routeKey = nextKey;
      const needsEntities = ["structure", "content"].includes(route.section);
      if (!force && state.course?.courseId === route.courseId &&
          (!needsEntities || state.entities)) {
        state.view = "course";
        if (route.section === "people" && !state.people) {
          return loadPeople(route.courseId);
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
    state.entities = null;
    state.people = null;
    state.peopleFailure = "";
    state.peopleMessage = "";
    state.grantOpen = false;
    state.planningEditOpen = false;
    state.planningDraft = null;
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
    state.opened = false;
    state.loading = false;
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
    const preservedState = typeof root.querySelectorAll === "function"
      ? captureRenderState(root, {
          trackedScrollSelectors: [".course-authoring-surface", ".course-authoring-frame"],
          includePageScroll: true,
          includeFocus: true
        })
      : null;
    const route = parseCourseAuthoringRoute(locationValue.hash || "");
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

  root.addEventListener("submit", (event) => {
    if (!state.opened) return;
    if (event.target.matches?.("[data-course-authoring-create]")) {
      event.preventDefault();
      if (state.writeBusy) return;
      const title = String(event.target.elements?.title?.value || "").trim();
      const goal = String(event.target.elements?.goal?.value || "").trim();
      const brief = String(event.target.elements?.brief?.value || "");
      const draft = { title, goal, brief };
      if (!pendingWriteMatches(state.pendingCreateCommand, draft)) {
        state.pendingCreateCommand = null;
      }
      state.createDraft = draft;
      if (!title || title.length > 300 || !goal || goal.length > 2_000 ||
          brief.length > 16_384) {
        state.writeFailure = "Revise o título, o objetivo e as orientações.";
        render({ focus: "#course-authoring-create-title" });
        return;
      }
      const command = state.pendingCreateCommand?.command || {
        requestId: createUuid(),
        title,
        goal,
        brief
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
      if (!state.course || state.writeBusy) return;
      const title = String(event.target.elements?.title?.value || "").trim();
      const goal = String(event.target.elements?.goal?.value || "").trim();
      const brief = String(event.target.elements?.brief?.value || "");
      const authoringStateSource = String(
        event.target.elements?.authoringState?.value || ""
      );
      const courseId = state.course.courseId;
      const draft = {
        courseId,
        title,
        goal,
        brief,
        authoringState: authoringStateSource
      };
      if (!pendingWriteMatches(state.pendingPlanningCommand, draft)) {
        state.pendingPlanningCommand = null;
      }
      state.planningDraft = draft;
      let authoringState;
      try {
        if (!title || title.length > 300 || !goal || goal.length > 2_000 ||
            brief.length > 16_384) {
          throw new TypeError("Revise o título, o objetivo e as orientações.");
        }
        authoringState = editableAuthoringState(authoringStateSource);
      } catch (error) {
        state.writeFailure = writeFailureMessage(error);
        render({ focus: "#course-authoring-edit-title" });
        return;
      }
      const command = state.pendingPlanningCommand?.command || {
        requestId: createUuid(),
        courseId,
        expectedRevision: state.course.revision,
        operation: "update_metadata",
        title,
        goal,
        brief,
        authoringState
      };
      state.pendingPlanningCommand ||= {
        draft: structuredClone(draft),
        command: structuredClone(command)
      };
      state.writeBusy = true;
      state.writeFailure = "";
      state.writeMessage = "Salvando planejamento…";
      render();
      void Promise.resolve().then(() => controller.updateCourse(
        structuredClone(command)
      )).then(async () => {
        await controller.clearCourse?.(courseId);
        state.pendingPlanningCommand = null;
        state.planningEditOpen = false;
        state.planningDraft = null;
        state.writeMessage = "Planejamento salvo.";
        await loadCourse(courseId, { force: true });
      }).catch((error) => {
        const ambiguous = ambiguousWriteFailure(error);
        if (!ambiguous) state.pendingPlanningCommand = null;
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
      void navigate(buildCourseAuthoringRoute(node.dataset.courseId, { section: "structure" }));
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
    } else if (action === "open-planning-edit" && state.course) {
      state.planningEditOpen = true;
      state.planningDraft = null;
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
