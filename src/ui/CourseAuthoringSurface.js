import { renderUiIcon } from "./renderUiIcons.js";
import { renderRuntimeStatusControl } from "./renderHomeScreen.js";
import { createUuid } from "../domain/identifiers.js";
import { captureRenderState, restoreRenderState } from "./renderState.js";
import { createCourseInspectionSequence } from "./CourseInspectionSequence.js";
import { createCourseObservationsPanel } from "./CourseObservationsPanel.js";
import { renderCourseDesignPanel } from "./CourseDesignPanel.js";
import { createCourseSourcesPanel } from "./CourseSourcesPanel.js";
import { createCourseAnalyticsPanel } from "./CourseAnalyticsPanel.js";
import {
  buildCourseAuthoringRoute,
  isCourseAuthoringRouteCandidate,
  parseCourseAuthoringRoute
} from "./courseAuthoringRoute.js";
import {
  classifyCourseAuthoringError,
  courseListCardinality,
  mergeCourseDesignScopePages,
  mergeCourseListPages,
  normalizeCourseDesign,
  normalizeCourseDesignChange,
  normalizeCourseAuthoringPlan,
  normalizeCourseDetail,
  normalizeCourseListPage,
  projectCoursePlanning
} from "./courseAuthoringViewModel.js";

const DEFAULT_COURSE_LIMIT = 24;
const PART_STATUS_LABELS = Object.freeze({
  planned: "Planejado",
  partially_materialized: "Em desenvolvimento",
  materialized: "Conteúdo pronto"
});
const CURRICULUM_SCOPE_STATUS_LABELS = Object.freeze({
  planned: "Planejado",
  developed: "Desenvolvido"
});
const CURRICULUM_MAP_STATUS_LABELS = Object.freeze({
  absent: "Ainda não definido",
  draft: "Rascunho",
  approved: "Aprovado"
});
const AUTHORING_TASKS = Object.freeze([
  Object.freeze({ key: "content", label: "Conteúdo", icon: "module", primary: true }),
  Object.freeze({ key: "planning", label: "Planejamento", icon: "intent", ownerOnly: true, primary: true }),
  Object.freeze({ key: "parameters", label: "Parâmetros", icon: "tags", ownerOnly: true }),
  Object.freeze({ key: "sources", label: "Fontes", icon: "study", ownerOnly: true }),
  Object.freeze({ key: "review", label: "Revisão", icon: "preview" }),
  Object.freeze({ key: "research", label: "Dados de autoria", icon: "experiment", ownerOnly: true }),
  Object.freeze({ key: "people", label: "Pessoas e acesso", icon: "account-add" })
]);
const AUTHORING_SECTION_LABELS = Object.freeze({
  ...Object.fromEntries(AUTHORING_TASKS.map(({ key, label }) => [key, label])),
  parameters: "Parâmetros",
  research: "Dados de autoria"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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
    accessLabel(course),
    courseCountsLabel(course?.counts)
  ]
    .filter(Boolean);
  return values.length
    ? `<p class="course-authoring-meta">${values.map(escapeHtml).join(" · ")}</p>`
    : "";
}

function initialSectionForCourse() {
  return "content";
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
  const href = buildCourseAuthoringRoute(course.courseId, {
    section: initialSectionForCourse(course)
  });
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
    content = `<div class="course-authoring-course-list" data-cardinality="${cardinality}">` +
      page.items.map(renderCourseCard).join("") +
      "</div>" +
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
    '<div class="course-authoring-list-actions"><div class="course-authoring-runtime-status"' +
    ' data-authoring-runtime-status>' + renderRuntimeStatusControl({
      offline: state.syncOffline === true,
      stale: state.syncing === true || state.syncStale === true
    }, { popoverId: "authoring-runtime-status-popover" }) + "</div>" +
    '<button type="button" class="course-authoring-header-action"' +
    ' data-course-authoring-action="open-create" aria-label="Criar Curso" title="Criar Curso">' +
    renderUiIcon("add", "course-authoring-button-icon") + "</button></div></header>" +
    '<form class="course-authoring-search" role="search" data-course-authoring-search>' +
    '<label class="course-authoring-visually-hidden" for="course-authoring-query">Buscar Cursos</label>' +
    `<input id="course-authoring-query" type="search" maxlength="120" autocomplete="off"` +
    ` value="${escapeHtml(state.query)}" placeholder="Buscar Curso" data-course-authoring-query>` +
    '<button type="submit" aria-label="Buscar Cursos">' +
    renderUiIcon("search", "course-authoring-button-icon") + "</button></form>" +
    '<div class="course-authoring-feedback-layer"><p class="course-authoring-notice" data-course-authoring-request-feedback' +
    ' role="status" aria-live="polite" hidden></p>' +
    (page?.offlineKnown
      ? '<p class="course-authoring-notice" role="status">Exibindo o que já está neste dispositivo.</p>'
      : "") +
    (state.failure && page
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure.message)}</p>`
      : "") +
    (state.writeMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.writeMessage)}</p>`
      : "") +
    (state.writeFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.writeFailure)}</p>`
      : "") + "</div>" +
    createForm +
    `<main class="course-authoring-list-content">${content}</main></div>`;
}

function canAccessPlanning(course) {
  return course?.ownership === "owned" && course?.canEdit === true;
}

function availableTasks(course, { primary = null } = {}) {
  const owner = canAccessPlanning(course);
  return AUTHORING_TASKS.filter((task) =>
    (!task.ownerOnly || owner) && (primary == null || Boolean(task.primary) === primary)
  );
}

function renderTaskLinks(course, section, { primary = false } = {}) {
  return availableTasks(course, { primary }).map((task) => {
    const active = task.key === section;
    return `<a href="${escapeHtml(buildCourseAuthoringRoute(course.courseId, { section: task.key }))}"` +
      ` class="${primary ? "course-authoring-primary-destination" : ""}${active ? " is-active" : ""}"` +
      ' data-course-authoring-action="change-section"' +
      ` data-section="${task.key}" aria-label="${escapeHtml(task.label)}"` +
      ` title="${escapeHtml(task.label)}"${active ? ' aria-current="page"' : ""}>` +
      `<span class="course-authoring-task-icon">${renderUiIcon(task.icon, "course-authoring-section-icon")}</span>` +
      (primary ? "" : `<span><strong>${escapeHtml(task.label)}</strong></span>`) + "</a>";
  }).join("");
}

function renderCourseHeader(course, state) {
  const title = AUTHORING_SECTION_LABELS[state.section] || "Autoria";
  if (!course?.courseId) {
    return '<header class="course-authoring-course-header">' +
      '<button type="button" class="course-authoring-back" data-course-authoring-action="show-list"' +
      ' aria-label="Voltar aos Cursos" title="Voltar aos Cursos">' +
      renderUiIcon("arrow-left", "course-authoring-button-icon") + "</button>" +
      '<div class="course-authoring-course-heading"><p class="course-authoring-eyebrow">Autoria</p>' +
      `<h1>${escapeHtml(title)}</h1></div></header>`;
  }
  const backLabel = state.section !== "content" || state.routeTarget || state.contextualReturn
    ? "Voltar ao Conteúdo"
    : "Voltar aos Cursos";
  const back = '<button type="button" class="course-authoring-back"' +
    ' data-course-authoring-action="back" aria-label="' + backLabel + '" title="' +
    backLabel + '">' + renderUiIcon("arrow-left", "course-authoring-button-icon") +
    "</button>";
  return '<header class="course-authoring-course-header">' + back +
    '<div class="course-authoring-course-heading">' +
    `<h1 title="${escapeHtml(course?.title || "Curso")}">${escapeHtml(
      course?.title || "Curso"
    )}</h1>` +
    `<p class="course-authoring-context-title">${escapeHtml(title)}</p>` +
    '</div>' +
    '<div class="course-authoring-header-actions">' +
    '<nav class="course-authoring-primary-navigation" aria-label="Áreas principais">' +
    renderTaskLinks(course, state.section, { primary: true }) + "</nav>" +
    '<div class="course-authoring-runtime-status" data-authoring-runtime-status>' +
    renderRuntimeStatusControl({
      offline: state.syncOffline === true,
      stale: state.syncing === true || state.syncStale === true
    }, { popoverId: "authoring-runtime-status-popover" }) + "</div>" +
    '<details class="course-authoring-task-menu"><summary class="course-authoring-header-action"' +
    ' aria-label="Abrir tarefas do Curso" title="Tarefas">' +
    renderUiIcon("more", "course-authoring-button-icon") +
    '</summary><nav aria-label="Tarefas do Curso">' +
    '<button type="button" data-course-authoring-action="refresh-course">' +
    `${renderUiIcon("rotate", "course-authoring-button-icon")}<span>Atualizar Curso</span></button>` +
    (state.section === "content" && canAccessPlanning(course) && state.canOpenStudyContent
      ? '<button type="button" data-course-authoring-action="edit-content-entity"' +
        ' data-target-kind="course">' +
        `${renderUiIcon("edit", "course-authoring-button-icon")}<span>Editar Curso</span></button>`
      : "") +
    renderTaskLinks(course, state.section, { primary: false }) +
    "</nav></details></div></header>";
}

function renderActionConfirmation(confirmation) {
  if (!confirmation) return "";
  const tone = confirmation.tone || "danger";
  const confirmClass = tone === "danger"
    ? "is-danger"
    : tone === "primary"
      ? "is-primary"
      : "course-authoring-secondary";
  const icon = confirmation.icon || (tone === "danger" ? "trash" : "ready-state");
  return '<div class="course-authoring-confirm-backdrop" data-course-authoring-confirm-backdrop>' +
    '<section class="course-authoring-confirm-dialog" role="alertdialog" aria-modal="true"' +
    ` data-confirmation-tone="${escapeHtml(tone)}"` +
    ' aria-labelledby="course-authoring-confirm-title" aria-describedby="course-authoring-confirm-message">' +
    '<h2 id="course-authoring-confirm-title">Confirmar ação</h2>' +
    `<p id="course-authoring-confirm-message">${escapeHtml(confirmation.message)}</p>` +
    '<div class="course-authoring-confirm-actions">' +
    '<button type="button" data-course-authoring-action="cancel-action-confirmation">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}<span>Cancelar</span></button>` +
    `<button type="button" class="${confirmClass}"` +
    ' data-course-authoring-action="confirm-action-confirmation">' +
    `${renderUiIcon(icon, "course-authoring-button-icon")}<span>` +
    `${escapeHtml(confirmation.confirmLabel || "Confirmar")}</span></button></div></section></div>`;
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
      ` autocomplete="email" required placeholder="E-mail exato" value="${escapeHtml(
        state.grantDraftEmail
      )}">` +
      '<button type="submit" aria-label="Conceder acesso" title="Conceder acesso">' +
      renderUiIcon("save", "course-authoring-button-icon") + "</button>" +
      '<button type="button" data-course-authoring-action="cancel-grant" aria-label="Cancelar" title="Cancelar">' +
      renderUiIcon("remove-state", "course-authoring-button-icon") + "</button></form>"
    : "";
  return '<section class="course-authoring-section course-authoring-people"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Pessoas e acesso</h2>' +
    '<header class="course-authoring-section-toolbar" aria-label="Ações de acesso">' +
    '<button type="button" class="course-authoring-people-add"' +
    ' data-course-authoring-action="open-grant" aria-label="Conceder acesso" title="Conceder acesso">' +
    renderUiIcon("add", "course-authoring-button-icon") + "</button></header>" +
    grant + `<div class="course-authoring-people-content">${content}</div>` +
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

function renderActionButton({
  action,
  icon,
  label,
  data = "",
  disabled = false,
  className = "",
  visibleLabel = ""
}) {
  const classes = [className, visibleLabel ? "" : "course-authoring-icon-action"]
    .filter(Boolean)
    .join(" ");
  return `<button type="button"${classes ? ` class="${escapeHtml(classes)}"` : ""}` +
    ` data-course-authoring-action="${escapeHtml(action)}"${data}` +
    ` aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"` +
    `${disabled ? " disabled" : ""}>${renderUiIcon(icon, "course-authoring-button-icon")}` +
    (visibleLabel ? `<span>${escapeHtml(visibleLabel)}</span>` : "") + "</button>";
}

function renderPart(state, part, index, _parts, { detail = false } = {}) {
  const title = detail
    ? escapeHtml(part.title)
    : `<a href="${escapeHtml(planningPartRoute(state.course.courseId, part.id))}"` +
      ' data-course-authoring-action="change-section" data-section="planning">' +
      `${escapeHtml(part.title)}</a>`;
  const microsequences = part.microsequences.length
    ? '<details class="course-authoring-part-links"><summary>' +
      countedLabel(
        part.linkedMicrosequenceCount,
        "microssequência",
        "microssequências"
      ) + '</summary><ul>' + part.microsequences.map((microsequence) =>
        '<li><div><strong>' + escapeHtml(microsequence.title) + '</strong>' +
        '<span>' + escapeHtml(microsequence.curriculumPath.moduleTitle) + ' · ' +
        escapeHtml(microsequence.curriculumPath.lessonTitle) + '</span>' +
        '<small>' + escapeHtml(countedLabel(
          microsequence.studyUnitCount,
          "unidade",
          "unidades"
        )) + '</small></div></li>').join("") + '</ul></details>'
    : '<p class="course-authoring-empty-copy">Conteúdo ainda não materializado.</p>';
  const inspect = part.studyUnitCount > 0
    ? renderActionButton({
        action: "inspect-part",
        icon: "preview",
        label: `Abrir conteúdo de ${part.title}`,
        data: ` data-part-id="${escapeHtml(part.id)}"`,
        className: "course-authoring-part-primary"
      })
    : "";
  const progression = part.progression.length
    ? '<div class="course-authoring-part-progression"><strong>Progressão local</strong><ol>' +
      part.progression.map((step) => `<li>${escapeHtml(step)}</li>`).join("") + "</ol></div>"
    : "";
  return `<article class="course-authoring-part${detail ? " is-detail" : ""}"` +
    ` data-status="${escapeHtml(part.status)}" data-course-authoring-part-card="${escapeHtml(
      part.id
    )}" tabindex="-1">` +
    '<header><div class="course-authoring-part-heading">' +
    `<span>parte ${index + 1}</span><h4>${title}</h4>` +
    `<p class="course-authoring-part-status">${escapeHtml(PART_STATUS_LABELS[part.status])}</p>` +
    '</div></header>' +
    (part.intent ? `<p class="course-authoring-part-intent">${escapeHtml(part.intent)}</p>` : "") +
    progression +
    '<div class="course-authoring-part-counts" aria-label="Estrutura e conteúdo">' +
    `<span>${escapeHtml(countedLabel(
      part.linkedMicrosequenceCount,
      "microssequência",
      "microssequências"
    ))}</span>` +
    `<span>${escapeHtml(countedLabel(part.studyUnitCount, "unidade", "unidades"))}</span></div>` +
    microsequences +
    (inspect ? `<footer class="course-authoring-part-actions">${inspect}</footer>` : "") +
    '</article>';
}

function planningPartRoute(courseId, partId) {
  return buildCourseAuthoringRoute(courseId, {
    section: "planning",
    authoringPartId: partId
  });
}

function renderPartNavigator(state, parts, activePart) {
  if (!activePart || parts.length === 0) return "";
  const index = parts.findIndex(({ id }) => id === activePart.id);
  const link = (part, label, icon) => part
    ? `<a href="${escapeHtml(planningPartRoute(state.course.courseId, part.id))}"` +
      ' data-course-authoring-action="change-section" data-section="planning"' +
      ` aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">` +
      `${renderUiIcon(icon, "course-authoring-button-icon")}</a>`
    : '<span class="is-disabled" aria-hidden="true"></span>';
  const choices = parts.map((part, partIndex) =>
    `<li><a href="${escapeHtml(planningPartRoute(state.course.courseId, part.id))}"` +
      ' data-course-authoring-action="change-section" data-section="planning"' +
      `${part.id === activePart.id ? ' aria-current="page"' : ""}>` +
      `<span>Parte ${partIndex + 1}</span><strong>${escapeHtml(part.title)}</strong></a></li>`
  ).join("");
  return '<nav class="course-authoring-part-navigation" aria-label="Navegação entre Partes">' +
    link(parts[index - 1], "Parte anterior", "arrow-left") +
    `<details><summary aria-label="Escolher Parte. Parte ${index + 1} de ${parts.length}: ${escapeHtml(
      activePart.title
    )}" title="Escolher Parte">` +
    `<span>Parte ${index + 1} de ${parts.length}</span>` +
    `<strong>${escapeHtml(activePart.title)}</strong></summary>` +
    `<ol>${choices}</ol></details>` +
    link(parts[index + 1], "Próxima Parte", "arrow-right") + "</nav>";
}

function renderParts(state, planning) {
  return '<section class="course-authoring-parts" aria-labelledby="course-authoring-parts-title">' +
    '<header class="course-authoring-subsection-heading"><div>' +
    '<h3 id="course-authoring-parts-title">Lotes de produção</h3>' +
    '<p>Esta divisão organiza a produção em blocos manejáveis e pode ser ajustada sem mudar o mapa curricular.</p>' +
    "</div></header>" +
    (planning.parts.length
      ? `<div class="course-authoring-part-list">${planning.parts.map((part, index) =>
          renderPart(state, part, index, planning.parts)).join("")}</div>`
      : '<p class="course-authoring-empty-copy">Nenhum lote de produção foi definido ainda.</p>') +
    "</section>";
}

function renderUnlinkedContentNotice(state, planning) {
  const contentStudyUnits = Number(state.course?.counts?.studyUnitCount || 0);
  const plannedStudyUnits = Number(planning.studyUnitCount || 0);
  if (contentStudyUnits <= plannedStudyUnits) return "";
  const unlinkedCount = contentStudyUnits - plannedStudyUnits;
  const label = unlinkedCount === 1 ? "Unidade sem Parte" : "Unidades sem Parte";
  return `<aside class="course-authoring-unlinked-content" aria-label="${escapeHtml(
    `${unlinkedCount} ${label}`
  )}">` + renderUiIcon("reposition", "course-authoring-section-icon") +
    `<strong>${escapeHtml(unlinkedCount)}</strong><span>${escapeHtml(label)}</span></aside>`;
}

function renderPartDetailScreen(state, planning, part) {
  const index = planning.parts.findIndex(({ id }) => id === part.id);
  return '<section class="course-authoring-section course-authoring-part-detail"' +
    ' aria-labelledby="course-authoring-section-title">' +
    `<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">${escapeHtml(
      part.title
    )}</h2>` +
    renderPartNavigator(state, planning.parts, part) +
    renderPart(state, part, index, planning.parts, { detail: true }) + "</section>";
}

function renderCurriculumMicrosequence(microsequence, nodes) {
  const dependencies = microsequence.dependencyMicrosequenceIds.length
    ? '<p class="course-authoring-curriculum-dependencies"><span>Depende de:</span> ' +
      microsequence.dependencyMicrosequenceIds.map((id) =>
        escapeHtml(nodes.microsequences.get(id).title)).join(", ") + "</p>"
    : "";
  return '<li><strong>' + escapeHtml(microsequence.title) + '</strong>' +
    (microsequence.objective ? `<p>${escapeHtml(microsequence.objective)}</p>` : "") +
    dependencies + '</li>';
}

function renderCurriculumMap(planning) {
  const modules = planning.curriculum.modules;
  const nodes = curriculumNodes(planning.curriculum);
  const content = modules.length
    ? '<ol class="course-authoring-curriculum-modules">' + modules.map((module) =>
      '<li><section class="course-authoring-curriculum-module">' +
      `<h4>${escapeHtml(module.title)}</h4>` +
      (module.objective ? `<p>${escapeHtml(module.objective)}</p>` : "") +
      '<ol class="course-authoring-curriculum-lessons">' + module.lessons.map((lesson) =>
        '<li><section class="course-authoring-curriculum-lesson">' +
        `<h5>${escapeHtml(lesson.title)}</h5>` +
        (lesson.objective ? `<p>${escapeHtml(lesson.objective)}</p>` : "") +
        '<ol class="course-authoring-curriculum-microsequences">' +
        lesson.microsequences.map((microsequence) =>
          renderCurriculumMicrosequence(microsequence, nodes)).join("") +
        '</ol></section></li>').join("") +
      '</ol></section></li>').join("") + '</ol>'
    : '<p class="course-authoring-empty-copy">O mapa curricular ainda não foi definido.</p>';
  return '<section class="course-authoring-curriculum-map"' +
    ' aria-labelledby="course-authoring-curriculum-map-title">' +
    '<header class="course-authoring-subsection-heading"><div>' +
    '<h3 id="course-authoring-curriculum-map-title">Mapa curricular</h3>' +
    '<p>Visão global de módulos, lições e microssequências.</p></div>' +
    `<span class="course-authoring-curriculum-status">${escapeHtml(
      CURRICULUM_MAP_STATUS_LABELS[planning.curriculumMapStatus]
    )}</span></header>` +
    content + '</section>';
}

function curriculumNodes(curriculum) {
  const modules = new Map();
  const lessons = new Map();
  const microsequences = new Map();
  for (const module of curriculum.modules) {
    modules.set(module.id, module);
    for (const lesson of module.lessons) {
      lessons.set(lesson.id, lesson);
      for (const microsequence of lesson.microsequences) {
        microsequences.set(microsequence.id, microsequence);
      }
    }
  }
  return { modules, lessons, microsequences };
}

function renderCurriculumScopeTarget(target, nodes) {
  const module = nodes.modules.get(target.moduleId);
  const lesson = nodes.lessons.get(target.lessonId);
  return '<li><span>' + escapeHtml(module.title) + ' · ' + escapeHtml(lesson.title) +
    '</span><ul>' + target.didacticMicrosequenceIds.map((id) =>
      `<li>${escapeHtml(nodes.microsequences.get(id).title)}</li>`).join("") + '</ul></li>';
}

function renderCurriculumScopeItem(item, nodes) {
  const developedIn = item.developedIn.length
    ? '<div class="course-authoring-scope-developed"><strong>Desenvolvido em</strong><ul>' +
      item.developedIn.map(({ title }) => `<li>${escapeHtml(title)}</li>`).join("") +
      '</ul></div>'
    : "";
  return '<li><article class="course-authoring-scope-item">' +
    '<header><h4>' + escapeHtml(item.statement) + '</h4><span>' +
    escapeHtml(CURRICULUM_SCOPE_STATUS_LABELS[item.state]) + '</span></header>' +
    '<ul class="course-authoring-scope-targets">' + item.curriculumTargets.map((target) =>
      renderCurriculumScopeTarget(target, nodes)).join("") + '</ul>' + developedIn +
    '</article></li>';
}

function renderCurriculumScope(planning) {
  const items = planning.curriculumScopeItems;
  const nodes = curriculumNodes(planning.curriculum);
  return '<details class="course-authoring-scope-coverage">' +
    '<summary><span>Cobertura do escopo</span></summary>' +
    (items.length
      ? '<ol>' + items.map((item) => renderCurriculumScopeItem(item, nodes)).join("") + '</ol>'
      : '<p class="course-authoring-empty-copy">Nenhum item de cobertura foi definido.</p>') +
    '</details>';
}

function renderPlanningContext(planning) {
  if (!planning.audience && !planning.scope && !planning.declaredPrerequisites.length) return "";
  const prerequisites = planning.declaredPrerequisites.length
    ? '<section class="course-authoring-planning-card">' +
      '<span class="course-authoring-planning-icon" aria-hidden="true">' +
      renderUiIcon("prompt", "course-authoring-button-icon") + '</span><div>' +
      '<h3>Pré-requisitos declarados</h3><ul>' + planning.declaredPrerequisites.map((item) =>
        `<li>${escapeHtml(item)}</li>`).join("") + '</ul></div></section>'
    : "";
  return '<details class="course-authoring-planning-context"><summary>Contexto do plano</summary>' +
    '<div class="course-authoring-planning-details">' +
    (planning.audience ? renderPlanningCard({
      icon: "prompt",
      label: "Público",
      value: planning.audience
    }) : "") +
    (planning.scope ? renderPlanningCard({
      icon: "tags",
      label: "Escopo",
      value: planning.scope
    }) : "") + prerequisites + "</div></details>";
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
  const targetPart = state.routeTarget?.kind === "authoring_part"
    ? planning.parts.find(({ id }) => id === state.routeTarget.id) || null
    : null;
  if (targetPart) return renderPartDetailScreen(state, planning, targetPart);
  return '<section class="course-authoring-section course-authoring-planning"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Planejamento</h2>' +
    renderUnlinkedContentNotice(state, planning) +
    '<div class="course-authoring-planning-details is-objective">' +
    renderPlanningCard({
      icon: "intent",
      label: "Objetivo",
      value: planning?.objective,
      emptyLabel: "Ainda não definido."
    }) +
    "</div>" + renderCurriculumMap(planning) + renderCurriculumScope(planning) +
    renderParts(state, planning) + renderPlanningContext(planning) +
    "</section>";
}

function renderContentSection() {
  return '<section class="course-authoring-content-flow" aria-label="Conteúdo do Curso">' +
    '<div class="course-inspection-host" data-course-inspection-host></div></section>';
}

function renderResearchSection() {
  return '<section class="course-authoring-section course-authoring-research-workspace"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Dados de autoria</h2>' +
    '<div class="course-analytics-host" data-course-analytics-host></div>' +
    "</section>";
}

function renderCourseSection(state) {
  if (state.section === "people" && state.course) {
    return renderPeopleSection(state);
  }
  if (state.section === "planning") {
    return renderPlanningSection(state);
  }
  if (state.section === "parameters") {
    return renderCourseDesignPanel(state);
  }
  if (state.section === "sources" && state.course) {
    if (!canAccessPlanning(state.course)) {
      return statusPanel({
        kind: "error",
        title: "Fontes indisponíveis",
        message: "Somente a pessoa proprietária pode consultar e alterar as fontes deste Curso."
      });
    }
    return '<div class="course-sources-host" data-course-sources-host></div>';
  }
  if (state.section === "content" && state.course) {
    return renderContentSection(state);
  }
  if (state.section === "review" && state.course) {
    return '<div class="course-observations-host" data-course-observations-host></div>';
  }
  if (state.section === "research" && state.course) {
    return renderResearchSection(state);
  }
  if (state.loading && !state.course) {
    return '<p class="course-authoring-loading" role="status">Carregando Curso…</p>';
  }
  if (state.failure && !state.course) {
    return statusPanel({
      kind: state.failure.kind,
      title: state.failure.kind === "revision-changed" ? "Curso atualizado" : "Conteúdo indisponível",
      message: state.failure.message,
      action: state.failure.kind === "access-revoked" ? "" : "retry",
      actionLabel: "Recarregar"
    });
  }
  return statusPanel({
    kind: "error",
    title: "Curso indisponível",
    message: "Não foi possível abrir esta tarefa no Curso. Volte à Home e tente novamente."
  });
}

function renderCourseDetail(state) {
  const visibleCourse = state.course || state.knownCourse;
  return '<div class="course-authoring-frame">' +
    renderCourseHeader(visibleCourse, state) +
    '<div class="course-authoring-layout">' +
    '<div class="course-authoring-main-pane">' +
    '<div class="course-authoring-feedback-layer"><p class="course-authoring-notice" data-course-authoring-request-feedback' +
    ' role="status" aria-live="polite" hidden></p>' +
    (state.writeMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.writeMessage)}</p>`
      : "") +
    (state.writeFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.writeFailure)}</p>`
      : "") +
    (state.section === "people" && state.peopleMessage
      ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.peopleMessage)}</p>`
      : "") +
    (state.section === "people" && state.peopleFailure && state.people
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.peopleFailure)}</p>`
      : "") + "</div>" +
    `<main class="course-authoring-course-content">${renderCourseSection(state)}</main></div></div>` +
    (state.sourceTarget
      ? '<div class="course-source-target-overlay"><div data-course-source-target-host></div></div>'
      : "") +
    `<div data-course-authoring-confirm-host>${renderActionConfirmation(state.actionConfirmation)}</div></div>`;
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
    ` data-section="${escapeHtml(view === "course" ? state.section || "content" : "")}"` +
    ` aria-busy="${state.loading === true ? "true" : "false"}">${content}</section>`;
}

function cursorKey(value) {
  return value == null ? "" : JSON.stringify(value);
}

function designScopeForRoute(courseId, target = null) {
  return Object.freeze(target
    ? { kind: target.kind, ref: target.id }
    : { kind: "course", ref: courseId });
}

function sameDesignScope(left, right) {
  return left?.kind === right?.kind && left?.ref === right?.ref;
}

function designScopeRoute(courseId, scope) {
  const options = { section: "parameters" };
  if (scope.kind === "module") options.moduleId = scope.ref;
  if (scope.kind === "lesson") options.lessonId = scope.ref;
  if (scope.kind === "didactic_microsequence") {
    options.didacticMicrosequenceId = scope.ref;
  }
  if (scope.kind === "study_unit") options.studyUnitId = scope.ref;
  return buildCourseAuthoringRoute(courseId, options);
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
    "loadAuthoringPlan",
    "loadCourseDesign", "mutateCourseDesign"
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
  providerAssistanceSession = null,
  onOpenStudyContent = null,
  onClose = () => {}
} = {}) {
  if (!root || typeof root.addEventListener !== "function") {
    throw new TypeError("Elemento raiz da Autoria de Cursos ausente.");
  }
  assertController(controller);
  if (!Number.isSafeInteger(courseLimit) || courseLimit < 1 || courseLimit > 50) {
    throw new TypeError("Limite de paginação inválido.");
  }
  if (providerAssistanceSession !== null &&
      (typeof providerAssistanceSession?.read !== "function" ||
       typeof providerAssistanceSession?.update !== "function" ||
       typeof providerAssistanceSession?.snapshot !== "function")) {
    throw new TypeError("Sessão de assistência contextual inválida.");
  }
  if (onOpenStudyContent !== null && typeof onOpenStudyContent !== "function") {
    throw new TypeError("Abertura do editor contextual inválida.");
  }

  let listEpoch = 0;
  let courseEpoch = 0;
  let designEpoch = 0;
  let hashListening = false;
  let documentPointerListening = false;
  let inspectionSequence = null;
  let reviewPanel = null;
  let analyticsPanel = null;
  let sourcesPanel = null;
  let targetSourcesPanel = null;
  let pendingInspectionComposition = null;
  let refreshPromise = null;
  const knownCourses = new Map();
  const avatarUrls = new Map();
  const state = {
    opened: false,
    view: "list",
    routeKey: "",
    query: "",
    section: "content",
    contextualReturn: null,
    inspectionReturnFocus: null,
    inspectionReturnPosition: null,
    canOpenStudyContent: typeof onOpenStudyContent === "function",
    loading: false,
    list: null,
    course: null,
    knownCourse: null,
    routeTarget: null,
    failure: null,
    people: null,
    peopleLoading: false,
    peopleFailure: "",
    peopleMessage: "",
    peopleBusy: false,
    grantOpen: false,
    grantDraftEmail: "",
    pendingPeopleCommand: null,
    createOpen: false,
    createDraft: null,
    authoringPlan: null,
    planningLoading: false,
    planningFailure: "",
    courseDesign: null,
    designLoading: false,
    designFailure: "",
    designMessage: "",
    designBusy: false,
    designFormDrafts: new Map(),
    designFormFocus: null,
    pendingCreateCommand: null,
    pendingDesignCommands: new Map(),
    sourceTarget: null,
    actionConfirmation: null,
    writeBusy: false,
    writeMessage: "",
    writeFailure: "",
    syncing: false,
    syncOffline: navigatorValue?.onLine === false,
    syncStale: false,
    avatarUrls
  };

  function authoringRuntimeStatusMarkup() {
    return renderRuntimeStatusControl({
      offline: state.syncOffline === true,
      stale: state.syncing === true || state.syncStale === true
    }, { popoverId: "authoring-runtime-status-popover" });
  }

  function updateAuthoringRuntimeStatus() {
    const host = root.querySelector?.("[data-authoring-runtime-status]");
    if (!host) return false;
    host.innerHTML = authoringRuntimeStatusMarkup();
    return true;
  }

  function setAuthoringSyncState(next = {}) {
    if (Object.hasOwn(next, "syncing")) state.syncing = next.syncing === true;
    if (Object.hasOwn(next, "offline")) state.syncOffline = next.offline === true;
    if (Object.hasOwn(next, "stale")) state.syncStale = next.stale === true;
    return updateAuthoringRuntimeStatus();
  }

  function projectRefreshedCourse(detail, fallback = state.course || state.knownCourse) {
    return Object.freeze({
      ...detail,
      goal: detail.goal || fallback?.goal || null,
      ownership: detail.ownership || fallback?.ownership || null,
      canEdit: detail.canEdit ?? fallback?.canEdit ?? null,
      counts: detail.counts || fallback?.counts || null,
      offlineKnown: detail.offlineKnown || fallback?.offlineKnown === true
    });
  }

  function rememberCourse(course) {
    state.course = course;
    state.knownCourse = course;
    knownCourses.set(course.courseId, course);
  }

  function closeTransientMenus({ restoreFocus = false, except = null } = {}) {
    const menus = [...(root.querySelectorAll?.(
      ".course-authoring-task-menu[open], .course-authoring-part-tools[open]"
    ) || [])];
    let closed = false;
    for (const menu of menus) {
      if (menu === except) continue;
      menu.open = false;
      closed = true;
      if (restoreFocus) menu.querySelector?.("summary")?.focus?.({ preventScroll: true });
    }
    return closed;
  }

  function handleDocumentPointerDown(event) {
    if (!state.opened) return;
    const containingMenu = event?.target?.closest?.(
      ".course-authoring-task-menu"
    ) || null;
    closeTransientMenus({ except: containingMenu });
  }

  function handleRootKeyDown(event) {
    if (!state.opened) return;
    if (state.actionConfirmation) {
      if (event?.key === "Escape") {
        closeActionConfirmation();
        event.preventDefault?.();
        event.stopPropagation?.();
        return;
      }
      if (event?.key === "Tab") {
        const controls = [...(root.querySelectorAll?.(
          ".course-authoring-confirm-dialog button:not(:disabled)"
        ) || [])];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && documentValue?.activeElement === first) {
          last?.focus?.({ preventScroll: true });
          event.preventDefault?.();
        } else if (!event.shiftKey && documentValue?.activeElement === last) {
          first?.focus?.({ preventScroll: true });
          event.preventDefault?.();
        }
      }
      return;
    }
    if (event?.key !== "Escape") return;
    if (closeTransientMenus({ restoreFocus: true })) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
  }

  function clearAvatarUrls() {
    avatarUrls.forEach((source) => urlValue?.revokeObjectURL?.(source));
    avatarUrls.clear();
  }

  function destroyInspectionSequence() {
    inspectionSequence?.destroy?.();
    inspectionSequence = null;
  }

  function destroyReviewPanel() {
    reviewPanel?.destroy?.();
    reviewPanel = null;
  }
  function destroyAnalyticsPanel() { analyticsPanel?.destroy?.(); analyticsPanel = null; }

  function destroySourcesPanels() {
    sourcesPanel?.destroy?.();
    targetSourcesPanel?.destroy?.();
    sourcesPanel = null;
    targetSourcesPanel = null;
  }

  function acceptSourcesCourseRevision(nextRevision) {
    if (!state.course || !Number.isSafeInteger(nextRevision) || nextRevision < state.course.revision) {
      return;
    }
    state.course = Object.freeze({ ...state.course, revision: nextRevision });
    state.knownCourse = state.course;
    knownCourses.set(state.course.courseId, state.course);
    state.authoringPlan = null;
    state.courseDesign = null;
  }

  async function saveInspectionManualEdit(value) {
    const intent = {
      courseId: value.courseId,
      expectedCourseRevision: value.expectedCourseRevision,
      expectedStudyUnitVersion: value.expectedVersion,
      didacticMicrosequenceId: value.didacticMicrosequenceId,
      studyUnit: value.studyUnit,
      origin: value.origin
    };
    const signature = JSON.stringify(intent);
    if (pendingInspectionComposition?.signature !== signature) {
      pendingInspectionComposition = { signature, requestId: createUuid() };
    }
    const result = await controller.commitCourseComposition({
      requestId: pendingInspectionComposition.requestId,
      ...intent
    });
    pendingInspectionComposition = null;
    acceptSourcesCourseRevision(result.courseRevision);
    return result;
  }

  function openInspectionContentEditor({ entityPath, returnFocusKey = "" } = {}) {
    if (!onOpenStudyContent || !Array.isArray(entityPath) || entityPath.length === 0 ||
        entityPath.some((value) => !String(value || "").trim())) {
      return false;
    }
    void Promise.resolve(onOpenStudyContent({
      entityPath: entityPath.map((value) => String(value)),
      returnRoute: state.routeKey,
      ...(returnFocusKey ? { returnFocusKey: String(returnFocusKey) } : {})
    })).catch((error) => {
      state.writeFailure = writeFailureMessage(error);
      render();
    });
    return true;
  }

  function openTargetSources({
    targetKind,
    targetId,
    targetVersion,
    targetLabel,
    returnFocusKey = ""
  }) {
    if (!state.course || !canAccessPlanning(state.course)) return;
    state.sourceTarget = { targetKind, targetId, targetVersion, targetLabel, returnFocusKey };
    state.writeFailure = "";
    render();
  }

  function mountSourcesPanels() {
    if (!state.course) return;
    const shared = {
      controller,
      courseId: state.course.courseId,
      courseRevision: state.course.revision,
      onCourseRevisionChange: acceptSourcesCourseRevision,
      onNavigate: (hash) => navigate(hash)
    };
    if (state.section === "sources" && canAccessPlanning(state.course)) {
      const host = root.querySelector?.("[data-course-sources-host]");
      if (host) {
        try {
          const sourceTarget = state.routeTarget?.kind === "course_source"
            ? state.routeTarget
            : null;
          sourcesPanel = createCourseSourcesPanel({
            root: host,
            mode: "catalog",
            initialSourceId: sourceTarget?.id ?? null,
            initialAnchorId: sourceTarget?.anchorId ?? null,
            ...shared
          });
          void sourcesPanel.open();
        } catch (error) {
          host.innerHTML = statusPanel({
            kind: "error",
            title: "Fontes indisponíveis",
            message: writeFailureMessage(error)
          });
        }
      }
    }
    if (state.sourceTarget) {
      const host = root.querySelector?.("[data-course-source-target-host]");
      if (host) {
        try {
          targetSourcesPanel = createCourseSourcesPanel({
            root: host,
            mode: "target",
            ...shared,
            ...state.sourceTarget,
            onClose() {
              const returnFocusKey = state.sourceTarget?.returnFocusKey || "";
              if (returnFocusKey) {
                state.inspectionReturnFocus = { route: state.routeKey, key: returnFocusKey };
              }
              state.sourceTarget = null;
              render();
            },
            onTargetSaved() {
              if (state.sourceTarget?.targetKind === "study_unit") {
                state.inspectionReturnFocus = {
                  route: state.routeKey,
                  key: state.sourceTarget.returnFocusKey || `sources:${state.sourceTarget.targetId}`
                };
              }
              state.sourceTarget = null;
              void loadCourse(state.course.courseId, { force: true });
            }
          });
          void targetSourcesPanel.open();
        } catch (error) {
          host.innerHTML = statusPanel({
            kind: "error",
            title: "Atribuição indisponível",
            message: writeFailureMessage(error)
          });
        }
      }
    }
  }

  function mountInspectionSequence() {
    if (state.view !== "course" || state.section !== "content" || !state.course) return;
    const host = root.querySelector?.("[data-course-inspection-host]");
    if (!host) return;
    try {
      const initialFocusKey = state.inspectionReturnFocus?.key || "";
      inspectionSequence = createCourseInspectionSequence({
        root: host,
        controller,
        course: state.course,
        routeTarget: state.routeTarget,
        initialPosition: state.inspectionReturnPosition?.route === state.routeKey
          ? state.inspectionReturnPosition.position
          : null,
        initialFocusKey,
        onNavigate: (hash, options) => navigate(hash, options),
        onStudyUnitChange(studyUnitId) {
          const explicitTarget = Boolean(state.routeTarget);
          const hash = buildCourseAuthoringRoute(state.course.courseId, {
            section: "content",
            studyUnitId
          });
          if (hash === state.routeKey) return true;
          if (typeof historyValue?.pushState !== "function") {
            return navigate(hash);
          }
          historyValue.pushState(historyValue.state ?? null, "", locationUrl(hash));
          state.routeKey = hash;
          state.routeTarget = explicitTarget
            ? Object.freeze({ kind: "study_unit", id: studyUnitId })
            : null;
          return true;
        },
        onEditSources: (target) => openTargetSources(target),
        onEditContent: onOpenStudyContent ? openInspectionContentEditor : null,
        onSaveManualEdit: typeof controller.commitCourseComposition === "function"
          ? saveInspectionManualEdit
          : null,
        windowValue,
        documentValue,
        navigatorValue,
        providerAssistanceSession
      });
      const mountedSequence = inspectionSequence;
      void mountedSequence.open().then((opened) => {
        if (inspectionSequence === mountedSequence && opened &&
            state.inspectionReturnPosition?.route === state.routeKey) {
          state.inspectionReturnPosition = null;
        }
        if (inspectionSequence === mountedSequence && initialFocusKey) {
          const focused = mountedSequence.focusControl?.(initialFocusKey) === true;
          if (focused && !state.loading &&
              state.inspectionReturnFocus?.key === initialFocusKey) {
            state.inspectionReturnFocus = null;
          }
        }
      });
    } catch (error) {
      host.innerHTML = statusPanel({
        kind: "error",
        title: "Conteúdo indisponível",
        message: writeFailureMessage(error)
      });
    }
  }

  function mountReviewPanel() {
    if (state.view !== "course" || state.section !== "review" || !state.course) return;
    const host = root.querySelector?.("[data-course-observations-host]");
    if (!host) return;
    try {
      reviewPanel = createCourseObservationsPanel({
        root: host,
        controller,
        course: state.course,
        routeTarget: state.routeTarget?.kind === "anchored_annotation"
          ? state.routeTarget
          : null,
        onNavigate: (hash) => navigate(hash)
      });
      void reviewPanel.open();
    } catch (error) {
      host.innerHTML = statusPanel({
        kind: "error",
        title: "Observações indisponíveis",
        message: writeFailureMessage(error)
      });
    }
  }

  function mountAnalyticsPanel() {
    if (state.view !== "course" || state.section !== "research" || !state.course ||
        !canAccessPlanning(state.course)) return;
    const host = root.querySelector?.("[data-course-analytics-host]");
    if (!host) return;
    try {
      analyticsPanel = createCourseAnalyticsPanel({ root: host, controller, course: state.course });
      void analyticsPanel.open();
    } catch (error) {
      host.innerHTML = statusPanel({
        kind: "error",
        title: "Dados de autoria indisponíveis",
        message: writeFailureMessage(error)
      });
    }
  }

  function render({ focus = "" } = {}) {
    if (!state.opened) return;
    const rootScroll = {
      top: Number(root.scrollTop) || 0,
      left: Number(root.scrollLeft) || 0
    };
    destroyInspectionSequence();
    destroyReviewPanel();
    destroyAnalyticsPanel();
    destroySourcesPanels();
    root.innerHTML = renderCourseAuthoringSurface(state);
    root.setAttribute?.("aria-busy", String(state.loading));
    restoreDesignFormDrafts({ restoreFocus: !focus });
    mountInspectionSequence();
    mountReviewPanel();
    mountAnalyticsPanel();
    mountSourcesPanels();
    root.scrollTop = rootScroll.top;
    root.scrollLeft = rootScroll.left;
    if (state.section === "planning" && state.routeTarget?.kind === "authoring_part") {
      globalThis.queueMicrotask?.(() => {
        const target = [...(root.querySelectorAll?.("[data-course-authoring-part-card]") || [])]
          .find((node) => node.dataset.courseAuthoringPartCard === state.routeTarget.id);
        target?.scrollIntoView?.({ block: "center", behavior: "auto" });
        target?.focus?.({ preventScroll: true });
      });
    }
    if (focus && typeof root.querySelector === "function") {
      globalThis.queueMicrotask?.(() => root.querySelector(focus)?.focus?.({ preventScroll: true }));
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
      state.syncOffline = page.offline === true;
      state.syncStale = page.stale === true;
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

  async function runPeopleCommand({
    draft,
    request,
    method,
    startedMessage,
    successMessage,
    refreshAfterSuccess = true,
    afterSuccess = () => {}
  }) {
    if (!state.course || state.peopleBusy) return false;
    if (!pendingWriteMatches(state.pendingPeopleCommand, draft)) {
      state.pendingPeopleCommand = null;
    }
    state.pendingPeopleCommand ||= {
      draft: structuredClone(draft),
      request: {
        requestId: createUuid(),
        ...structuredClone(request)
      }
    };
    const pending = state.pendingPeopleCommand;
    const courseId = state.course.courseId;
    state.peopleBusy = true;
    state.peopleFailure = "";
    state.peopleMessage = startedMessage;
    render();
    try {
      await controller[method](structuredClone(pending.request));
      state.pendingPeopleCommand = null;
      afterSuccess();
      if (refreshAfterSuccess) await loadPeople(courseId);
      state.peopleMessage = successMessage;
      return true;
    } catch (error) {
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingPeopleCommand = null;
      state.peopleFailure = ambiguous
        ? ambiguousWriteFailureMessage(error)
        : writeFailureMessage(error);
      state.peopleMessage = "";
      return false;
    } finally {
      state.peopleBusy = false;
      render();
    }
  }

  async function loadPlanning(courseId, { expectedCourseRevision = state.course?.revision } = {}) {
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

  async function loadDesign(courseId, {
    scope = designScopeForRoute(courseId, state.routeTarget),
    cursor = null,
    append = false,
    preserveExisting = false,
    expectedCourseRevision = state.course?.revision
  } = {}) {
    const epoch = ++designEpoch;
    const reconcilingPendingWrite = state.pendingDesignCommands.size > 0;
    state.designLoading = true;
    state.designFailure = "";
    state.designMessage = append ? "Carregando mais escopos…" : "";
    if (!append && !preserveExisting) state.courseDesign = null;
    render();
    try {
      const page = normalizeCourseDesign(
        await controller.loadCourseDesign(courseId, { scope, limit: 32, cursor }),
        {
          expectedCourseId: courseId,
          expectedCourseRevision: reconcilingPendingWrite ? null : expectedCourseRevision,
          expectedScope: scope
        }
      );
      if (!state.opened || epoch !== designEpoch || state.course?.courseId !== courseId ||
          state.section !== "parameters") return false;
      if (reconcilingPendingWrite && page.courseRevision !== state.course.revision) {
        state.course = Object.freeze({ ...state.course, revision: page.courseRevision });
        state.knownCourse = state.course;
        knownCourses.set(courseId, state.course);
      }
      state.courseDesign = append && state.courseDesign
        ? mergeCourseDesignScopePages(state.courseDesign, page)
        : page;
      state.designMessage = "";
      return true;
    } catch (error) {
      if (!state.opened || epoch !== designEpoch || state.course?.courseId !== courseId ||
          state.section !== "parameters") return false;
      state.designFailure = classifyCourseAuthoringError(error, {
        knownCourse: state.course
      }).message;
      state.designMessage = "";
      return false;
    } finally {
      if (state.opened && epoch === designEpoch && state.course?.courseId === courseId &&
          state.section === "parameters") {
        state.designLoading = false;
        render();
      }
    }
  }


  async function loadCourse(courseId, { force = false } = {}) {
    const needsPlanning = state.section === "planning";
    const needsDesign = state.section === "parameters";
    const requestedDesignScope = designScopeForRoute(courseId, state.routeTarget);
    const needsTargetPlan = needsDesign &&
      requestedDesignScope.kind === "didactic_microsequence";
    const needsAuthoringPlan = needsPlanning || needsTargetPlan;
    if (!force && state.course?.courseId === courseId &&
        (!needsAuthoringPlan || state.authoringPlan) &&
        (!needsDesign || sameDesignScope(
          state.courseDesign?.scopeContext?.current,
          requestedDesignScope
        ))) {
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
      state.sourceTarget = null;
      state.people = null;
      state.peopleFailure = "";
      state.peopleMessage = "";
      state.grantOpen = false;
      state.grantDraftEmail = "";
      state.pendingPeopleCommand = null;
      state.authoringPlan = null;
      state.planningFailure = "";
      ++designEpoch;
      state.courseDesign = null;
      state.designLoading = false;
      state.designFailure = "";
      state.designMessage = "";
      state.pendingDesignCommands.clear();
      state.designFormDrafts.clear();
      state.designFormFocus = null;
      clearAvatarUrls();
    }
    if (needsPlanning) {
      state.authoringPlan = null;
      state.planningFailure = "";
    }
    if (needsDesign) {
      ++designEpoch;
      state.courseDesign = null;
      state.designFailure = "";
      state.designMessage = "";
    }
    state.course = null;
    state.failure = null;
    state.loading = true;
    render();
    try {
      const detail = normalizeCourseDetail(
        await controller.getCourse(courseId),
        { expectedCourseId: courseId }
      );
      if (!state.opened || epoch !== courseEpoch || state.view !== "course") return false;
      state.syncOffline = detail.offline === true;
      state.syncStale = detail.stale === true;
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
      if (state.section === "people") await loadPeople(courseId);
      if (state.section === "planning") {
        return loadPlanning(courseId, { expectedCourseRevision: course.revision });
      }
      if (state.section === "parameters") {
        if (needsTargetPlan) {
          const [planningLoaded, designLoaded] = await Promise.all([
            loadPlanning(courseId, { expectedCourseRevision: course.revision }),
            loadDesign(courseId, {
              scope: requestedDesignScope,
              expectedCourseRevision: course.revision
            })
          ]);
          return planningLoaded && designLoaded;
        }
        return loadDesign(courseId, {
          scope: requestedDesignScope,
          expectedCourseRevision: course.revision
        });
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
      destroyInspectionSequence();
      state.routeKey = `invalid:${hash}`;
      state.view = "invalid";
      state.loading = false;
      state.failure = null;
      root.scrollTop = 0;
      root.scrollLeft = 0;
      render();
      return false;
    }
    if (route) {
      const nextKey = hash;
      const routeChanged = Boolean(state.routeKey && state.routeKey !== nextKey);
      if (routeChanged) {
        destroyInspectionSequence();
        state.sourceTarget = null;
        state.actionConfirmation = null;
        root.scrollTop = 0;
        root.scrollLeft = 0;
      }
      state.section = route.section;
      state.routeTarget = route.target;
      if (!force && state.routeKey === nextKey) {
        if (route.section !== "content") render();
        return true;
      }
      state.routeKey = nextKey;
      const requestedDesignScope = designScopeForRoute(route.courseId, route.target);
      const needsTargetPlan = route.section === "parameters" &&
        requestedDesignScope.kind === "didactic_microsequence";
      if (!force && state.course?.courseId === route.courseId &&
          state.course) {
        state.view = "course";
        if (route.section === "content" && routeChanged) {
          return loadCourse(route.courseId, { force: true });
        }
        if (route.section === "people" && !state.people) {
          return loadPeople(route.courseId);
        }
        if (route.section === "planning" && !state.authoringPlan) {
          return loadPlanning(route.courseId);
        }
        if (route.section === "parameters") {
          const needsPlanningLoad = needsTargetPlan && !state.authoringPlan;
          const needsDesignLoad = !sameDesignScope(
            state.courseDesign?.scopeContext?.current,
            requestedDesignScope
          );
          if (needsPlanningLoad || needsDesignLoad) {
            const [planningLoaded, designLoaded] = await Promise.all([
              needsPlanningLoad ? loadPlanning(route.courseId) : Promise.resolve(true),
              needsDesignLoad
                ? loadDesign(route.courseId, { scope: requestedDesignScope })
                : Promise.resolve(true)
            ]);
            return planningLoaded && designLoaded;
          }
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
    state.routeTarget = null;
    state.contextualReturn = null;
    state.inspectionReturnPosition = null;
    state.sourceTarget = null;
    state.people = null;
    state.peopleFailure = "";
    state.peopleMessage = "";
    state.grantOpen = false;
    state.grantDraftEmail = "";
    state.pendingPeopleCommand = null;
    state.authoringPlan = null;
    state.planningFailure = "";
    ++designEpoch;
    state.courseDesign = null;
    state.designLoading = false;
    state.designFailure = "";
    state.designMessage = "";
    state.pendingDesignCommands.clear();
    state.designFormDrafts.clear();
    state.designFormFocus = null;
    clearAvatarUrls();
    state.failure = null;
    root.scrollTop = 0;
    root.scrollLeft = 0;
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

  function navigate(hash, {
    replace = false,
    returnTo = "",
    returnFocusKey = "",
    returnPosition = null
  } = {}) {
    const currentRoute = state.routeKey.startsWith?.("#/")
      ? state.routeKey
      : String(locationValue.hash || "");
    if (state.opened && hash !== currentRoute && hasPendingAuthoringDraft() &&
        !isPersistedDesignScopeNavigation(hash)) {
      closeTransientMenus({ restoreFocus: true });
      announcePendingDraftDeferral("Navegação");
      return "deferred";
    }
    if (!replace && returnTo && typeof historyValue?.replaceState === "function") {
      state.contextualReturn = { route: hash, returnTo };
      state.inspectionReturnFocus = returnFocusKey
        ? { route: returnTo, key: returnFocusKey }
        : null;
      state.inspectionReturnPosition = returnPosition
        ? { route: returnTo, position: structuredClone(returnPosition) }
        : null;
      historyValue.replaceState(historyValue.state ?? null, "", locationUrl(returnTo));
    }
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
    const hash = locationValue.hash || "";
    if (hash === state.routeKey) return;
    if (state.routeKey.startsWith?.("#/") && hash !== state.routeKey &&
        hasPendingAuthoringDraft() && !isPersistedDesignScopeNavigation(hash)) {
      if (typeof historyValue?.replaceState === "function") {
        historyValue.replaceState(historyValue.state ?? null, "", locationUrl(state.routeKey));
      }
      closeTransientMenus({ restoreFocus: true });
      announcePendingDraftDeferral("Navegação");
      return;
    }
    void applyHash(hash);
  }

  async function open() {
    if (!state.opened) {
      state.opened = true;
      if (!hashListening && typeof windowValue?.addEventListener === "function") {
        windowValue.addEventListener("hashchange", handleHashChange);
        hashListening = true;
      }
      if (!documentPointerListening && typeof documentValue?.addEventListener === "function") {
        documentValue.addEventListener("pointerdown", handleDocumentPointerDown);
        documentPointerListening = true;
      }
    }
    return applyHash(locationValue.hash || "", { force: state.routeKey === "" });
  }

  function teardown({ notifyClose = false } = {}) {
    ++listEpoch;
    ++courseEpoch;
    ++designEpoch;
    state.opened = false;
    state.routeKey = "";
    state.loading = false;
    state.actionConfirmation = null;
    state.inspectionReturnPosition = null;
    state.grantDraftEmail = "";
    state.pendingPeopleCommand = null;
    destroyInspectionSequence();
    destroyReviewPanel();
    destroyAnalyticsPanel();
    destroySourcesPanels();
    if (hashListening && typeof windowValue?.removeEventListener === "function") {
      windowValue.removeEventListener("hashchange", handleHashChange);
      hashListening = false;
    }
    if (documentPointerListening && typeof documentValue?.removeEventListener === "function") {
      documentValue.removeEventListener("pointerdown", handleDocumentPointerDown);
      documentPointerListening = false;
    }
    root.innerHTML = "";
    clearAvatarUrls();
    root.setAttribute?.("aria-busy", "false");
    if (notifyClose) onClose();
    return true;
  }

  function close() {
    if (state.opened && hasPendingAuthoringDraft()) {
      announcePendingDraftDeferral("Saída");
      return "deferred";
    }
    return teardown({ notifyClose: true });
  }

  function destroy() {
    return teardown({ notifyClose: false });
  }

  function rememberInspectionReturnFocus({ route, key } = {}) {
    if (!state.opened || route !== state.routeKey || typeof key !== "string" || !key) {
      return false;
    }
    state.inspectionReturnFocus = { route, key };
    return true;
  }

  function handleBack() {
    if (!state.opened) return false;
    if (closeActionConfirmation()) return true;
    if (closeTransientMenus({ restoreFocus: true })) return true;
    if (state.view === "course" && state.course) {
      if (state.contextualReturn && state.contextualReturn.route === state.routeKey) {
        void navigate(state.contextualReturn.returnTo);
        return true;
      }
      if (state.section === "planning" && state.routeTarget?.kind === "authoring_part") {
        void navigate(buildCourseAuthoringRoute(state.course.courseId, {
          section: "planning"
        }));
        return true;
      }
      if (state.routeTarget) {
        void navigate(buildCourseAuthoringRoute(state.course.courseId, { section: state.section }));
        return true;
      }
      if (state.section !== "content") {
        void navigate(buildCourseAuthoringRoute(state.course.courseId, { section: "content" }));
        return true;
      }
      void showList();
      return true;
    }
    if (state.view === "invalid") {
      void showList();
      return true;
    }
    close();
    return true;
  }

  function controlHasDraft(control) {
    if (!control || control.disabled || !String(control.name || control.id || "").trim()) {
      return false;
    }
    const type = String(control.type || "").toLowerCase();
    if (type === "file") return Number(control.files?.length) > 0;
    if (type === "checkbox" || type === "radio") {
      return Boolean(control.checked) !== Boolean(control.defaultChecked);
    }
    if (control.tagName === "SELECT") {
      const options = [...(control.options || [])];
      const hasExplicitDefault = options.some((option) => option.defaultSelected);
      const implicitDefaultIndex = control.multiple || hasExplicitDefault
        ? -1
        : options.findIndex((option) => !option.disabled);
      return options.some((option, index) => Boolean(option.selected) !==
        (Boolean(option.defaultSelected) || index === implicitDefaultIndex));
    }
    return String(control.value ?? "") !== String(control.defaultValue ?? "");
  }

  function hasTransientAuthoringDraft() {
    return Boolean(
      state.actionConfirmation || state.createOpen || state.grantOpen
    );
  }

  function hasPendingWriteEnvelope() {
    return Boolean(
      state.pendingCreateCommand ||
        state.pendingPeopleCommand || state.pendingDesignCommands.size > 0
    );
  }

  function mountedPanelHasPendingDraft() {
    return [
      sourcesPanel,
      targetSourcesPanel,
      inspectionSequence,
      reviewPanel
    ].some((panel) => panel?.hasPendingDraft?.());
  }

  function isPersistedDesignScopeNavigation(hash) {
    if (state.designBusy || hasTransientAuthoringDraft() ||
        mountedPanelHasPendingDraft() ||
        root.querySelector?.('[role="dialog"], [role="alertdialog"]')) {
      return false;
    }
    const current = parseCourseAuthoringRoute(
      state.routeKey.startsWith?.("#/") ? state.routeKey : locationValue.hash || ""
    );
    const next = parseCourseAuthoringRoute(hash);
    return Boolean(
      current && next && current.courseId === next.courseId &&
      current.section === "parameters" && next.section === "parameters"
    );
  }

  function hasPendingAuthoringDraft() {
    if (hasPendingWriteEnvelope() || hasTransientAuthoringDraft() ||
        mountedPanelHasPendingDraft()) return true;
    if (root.querySelector?.(
      '[role="alertdialog"], [role="dialog"]:not([data-course-authoring-readonly-dialog])'
    )) return true;
    return [...(root.querySelectorAll?.("form") || [])].some((form) =>
      [...(form.elements || [])].some(controlHasDraft));
  }

  function announcePendingDraftDeferral(subject = "Atualização") {
    setRequestFeedback(
      `${subject} adiada para preservar sua edição. ` +
      "Conclua ou cancele o rascunho e tente novamente."
    );
  }

  async function refreshCourseListAtomically() {
    const previousPage = state.list;
    try {
      const page = normalizeCourseListPage(await controller.listCourses({
        query: state.query,
        limit: courseLimit,
        cursor: null
      }));
      if (!state.opened || state.view !== "list" ||
          isCourseAuthoringRouteCandidate(locationValue.hash || "")) return false;
      const changed = JSON.stringify(previousPage) !== JSON.stringify(page);
      state.list = page;
      state.failure = null;
      state.syncOffline = page.offline === true;
      state.syncStale = page.stale === true;
      page.items.forEach((course) => knownCourses.set(course.courseId, course));
      if (changed) render();
      else updateAuthoringRuntimeStatus();
      return true;
    } catch (error) {
      if (!state.opened || state.view !== "list") return false;
      const code = String(error?.code || "").toLowerCase();
      const message = String(error?.message || "").toLowerCase();
      const offline = navigatorValue?.onLine === false ||
        ["offline", "network_error", "network_unavailable", "request_timeout",
          "service_unavailable", "failed_to_fetch"].includes(code) ||
        /failed to fetch|fetch failed|network|offline|connection|socket/u.test(message);
      const statusUpdated = setAuthoringSyncState({ offline, stale: true });
      if (!statusUpdated) render();
      return false;
    }
  }

  async function refreshCourseAtomically(route) {
    const previousCourse = state.course;
    const previousPlan = state.authoringPlan;
    const previousDesign = state.courseDesign;
    const previousPeople = state.people;
    try {
      let snapshot = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const detail = normalizeCourseDetail(await controller.getCourse(route.courseId), {
          expectedCourseId: route.courseId
        });
        setAuthoringSyncState({ offline: detail.offline, stale: detail.stale });
        const course = projectRefreshedCourse(detail, previousCourse);
        const designScope = designScopeForRoute(route.courseId, route.target);
        const needsTargetPlan = route.section === "parameters" &&
          designScope.kind === "didactic_microsequence";
        const needsPlan = route.section === "planning" || needsTargetPlan;
        let plan = needsPlan ? null : undefined;
        let planRead = null;
        let design;
        let designRead = null;
        let people;
        let peopleRead = null;
        let planningFailure = "";
        try {
          if (needsPlan) {
            planRead = await controller.loadAuthoringPlan(route.courseId);
            plan = normalizeCourseAuthoringPlan(planRead, {
              expectedCourseId: route.courseId,
              expectedCourseRevision: course.revision
            });
          }
          if (route.section === "parameters") {
            designRead = await controller.loadCourseDesign(route.courseId, {
              scope: designScope,
              limit: 32,
              cursor: null
            });
            design = normalizeCourseDesign(designRead, {
              expectedCourseId: route.courseId,
              expectedCourseRevision: course.revision,
              expectedScope: designScope
            });
          }
          if (route.section === "people") {
            peopleRead = await controller.listCourseAccess(route.courseId);
            people = normalizeCoursePeople(peopleRead, route.courseId);
          }
          snapshot = {
            course,
            detail,
            plan,
            planRead,
            design,
            designRead,
            people,
            peopleRead,
            planningFailure
          };
          break;
        } catch (error) {
          if (attempt === 0 && String(error?.code || "").toLowerCase() ===
              "course_revision_changed") continue;
          throw error;
        }
      }
      if (!snapshot || !state.opened || state.view !== "course" ||
          state.routeKey !== locationValue.hash || state.section !== route.section) {
        return false;
      }
      const changed = JSON.stringify(previousCourse) !== JSON.stringify(snapshot.course) ||
        (snapshot.plan !== undefined &&
          JSON.stringify(previousPlan) !== JSON.stringify(snapshot.plan)) ||
        (snapshot.design !== undefined &&
          JSON.stringify(previousDesign) !== JSON.stringify(snapshot.design)) ||
        (snapshot.people !== undefined &&
          JSON.stringify(previousPeople) !== JSON.stringify(snapshot.people));
      rememberCourse(snapshot.course);
      if (snapshot.plan !== undefined) state.authoringPlan = snapshot.plan;
      if (snapshot.design !== undefined) state.courseDesign = snapshot.design;
      if (snapshot.people !== undefined) state.people = snapshot.people;
      state.failure = null;
      if (snapshot.plan !== undefined) {
        state.planningFailure = snapshot.planningFailure;
        state.planningLoading = false;
      }
      if (snapshot.design !== undefined) {
        state.designFailure = "";
        state.designMessage = "";
        state.designLoading = false;
      }
      if (snapshot.people !== undefined) {
        state.peopleFailure = "";
        state.peopleMessage = "";
        state.peopleLoading = false;
      }
      const reads = [
        snapshot.detail,
        snapshot.planRead,
        snapshot.designRead,
        snapshot.peopleRead
      ];
      const offline = reads.some((read) => read?.offline === true);
      const stale = reads.some((read) => read?.stale === true);
      state.syncOffline = offline;
      state.syncStale = stale;
      if (changed) render();
      else updateAuthoringRuntimeStatus();
      return true;
    } catch (error) {
      if (!state.opened || state.view !== "course" ||
          state.routeKey !== locationValue.hash || state.section !== route.section) {
        return false;
      }
      const failure = classifyCourseAuthoringError(error, { knownCourse: previousCourse });
      const offline = failure.kind === "offline-known" || navigatorValue?.onLine === false;
      const statusUpdated = setAuthoringSyncState({ offline, stale: true });
      if (failure.kind === "access-revoked") {
        state.failure = failure;
        state.course = null;
        state.authoringPlan = null;
        state.courseDesign = null;
        state.people = null;
        clearAvatarUrls();
        render();
      } else if (!statusUpdated) {
        // O harness sem DOM aninhado ainda recebe o mesmo estado visível; no navegador,
        // somente o controle fixo é substituído.
        render();
      }
      return false;
    }
  }

  async function refreshCurrent() {
    if (hasPendingAuthoringDraft()) {
      announcePendingDraftDeferral();
      return "deferred";
    }
    const route = parseCourseAuthoringRoute(locationValue.hash || "");
    if (!route && state.view === "list" && state.list) {
      return refreshCourseListAtomically();
    }
    if (route?.section === "review" && reviewPanel) {
      const panel = reviewPanel;
      try {
        const detail = normalizeCourseDetail(await controller.getCourse(route.courseId), {
          expectedCourseId: route.courseId
        });
        setAuthoringSyncState({ offline: detail.offline, stale: detail.stale });
        if (!state.opened || panel !== reviewPanel || state.routeKey !== locationValue.hash) {
          return false;
        }
        const course = Object.freeze({
          ...detail,
          goal: detail.goal || state.course?.goal || null,
          ownership: detail.ownership || state.course?.ownership || null,
          canEdit: detail.canEdit ?? state.course?.canEdit ?? null,
          counts: detail.counts || state.course?.counts || null,
          offlineKnown: detail.offlineKnown || state.course?.offlineKnown === true
        });
        state.course = course;
        state.knownCourse = course;
        knownCourses.set(course.courseId, course);
        state.writeFailure = "";
        const refreshed = await panel.refresh(course.revision);
        if (panel === reviewPanel) {
          const header = root.querySelector?.(".course-authoring-course-header");
          if (header) header.outerHTML = renderCourseHeader(course, state);
        }
        return refreshed;
      } catch (error) {
        if (panel === reviewPanel) {
          state.writeFailure = classifyCourseAuthoringError(error, {
            knownCourse: state.course
          }).message;
          render();
        }
        return false;
      }
    }
    if (route?.section === "sources" && sourcesPanel && state.course) {
      const panel = sourcesPanel;
      try {
        const detail = normalizeCourseDetail(await controller.getCourse(route.courseId), {
          expectedCourseId: route.courseId
        });
        setAuthoringSyncState({ offline: detail.offline, stale: detail.stale });
        if (!state.opened || panel !== sourcesPanel || state.routeKey !== locationValue.hash) {
          return false;
        }
        const course = projectRefreshedCourse(detail);
        if (!canAccessPlanning(course)) {
          rememberCourse(course);
          render();
          return true;
        }
        const refreshed = await panel.refresh(course.revision);
        if (!refreshed || !state.opened || panel !== sourcesPanel ||
            state.routeKey !== locationValue.hash) return false;
        rememberCourse(course);
        const header = root.querySelector?.(".course-authoring-course-header");
        if (header) header.outerHTML = renderCourseHeader(course, state);
        return true;
      } catch (error) {
        if (panel === sourcesPanel) {
          const failure = classifyCourseAuthoringError(error, { knownCourse: state.course });
          setAuthoringSyncState({
            offline: failure.kind === "offline-known" || navigatorValue?.onLine === false,
            stale: true
          });
        }
        return false;
      }
    }
    if (route?.section === "research" && analyticsPanel) {
      const panel = analyticsPanel;
      try {
        const detail = normalizeCourseDetail(await controller.getCourse(route.courseId), {
          expectedCourseId: route.courseId
        });
        setAuthoringSyncState({ offline: detail.offline, stale: detail.stale });
        if (!state.opened || panel !== analyticsPanel || state.routeKey !== locationValue.hash) {
          return false;
        }
        const course = Object.freeze({
          ...detail,
          goal: detail.goal || state.course?.goal || null,
          ownership: detail.ownership || state.course?.ownership || null,
          canEdit: detail.canEdit ?? state.course?.canEdit ?? null,
          counts: detail.counts || state.course?.counts || null,
          offlineKnown: detail.offlineKnown || state.course?.offlineKnown === true
        });
        state.course = course;
        state.knownCourse = course;
        knownCourses.set(course.courseId, course);
        state.writeFailure = "";
        const refreshed = await panel.refresh(course.revision);
        if (panel === analyticsPanel) {
          const header = root.querySelector?.(".course-authoring-course-header");
          if (header) header.outerHTML = renderCourseHeader(course, state);
        }
        return refreshed;
      } catch (error) {
        if (panel === analyticsPanel) {
          state.writeFailure = classifyCourseAuthoringError(error, {
            knownCourse: state.course
          }).message;
          render();
        }
        return false;
      }
    }
    if (route?.section === "content" && inspectionSequence && state.course) {
      const sequence = inspectionSequence;
      try {
        const detail = normalizeCourseDetail(await controller.getCourse(route.courseId), {
          expectedCourseId: route.courseId
        });
        setAuthoringSyncState({ offline: detail.offline, stale: detail.stale });
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
          if (header) header.outerHTML = renderCourseHeader(course, state);
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
    if (route && state.course) return refreshCourseAtomically(route);
    const preservedRootScroll = {
      top: Number(root.scrollTop) || 0,
      left: Number(root.scrollLeft) || 0
    };
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
    root.scrollTop = preservedRootScroll.top;
    root.scrollLeft = preservedRootScroll.left;
    return refreshed;
  }

  function refresh() {
    if (refreshPromise) return refreshPromise;
    if (hasPendingAuthoringDraft()) {
      announcePendingDraftDeferral();
      return Promise.resolve("deferred");
    }
    setAuthoringSyncState({ syncing: true });
    refreshPromise = refreshCurrent().finally(() => {
      refreshPromise = null;
      setAuthoringSyncState({ syncing: false });
    });
    return refreshPromise;
  }



  function formValue(form, name) {
    const field = form?.elements?.[name] ?? form?.elements?.namedItem?.(name);
    return String(field?.value ?? "").trim();
  }

  function checkedFormValues(form, name) {
    const queried = typeof form?.querySelectorAll === "function"
      ? [...form.querySelectorAll(`[name="${name}"]`)]
      : [];
    if (queried.length > 0) {
      return queried.filter((field) => field.checked).map((field) => String(field.value));
    }
    const field = form?.elements?.[name];
    const candidates = Array.isArray(field) ? field : field ? [field] : [];
    return candidates.filter((item) => item.checked !== false).map((item) => String(item.value));
  }


  function activeDesignScope() {
    const current = state.courseDesign?.scopeContext?.current;
    return current ? { kind: current.kind, ref: current.ref } : null;
  }

  const DESIGN_FORM_SELECTOR = [
    "[data-course-design-parameter]",
    "[data-course-design-guidance]",
    "[data-course-design-policy]"
  ].join(",");

  function designDraftScopeKey() {
    const scope = activeDesignScope();
    return scope ? `${scope.kind}:${scope.ref}` : "unknown";
  }

  function designFormKey(form) {
    if (!form?.matches?.(DESIGN_FORM_SELECTOR)) return "";
    const scope = designDraftScopeKey();
    if (form.matches("[data-course-design-parameter]")) {
      return `${scope}:parameter:${formValue(form, "parameterId")}`;
    }
    if (form.matches("[data-course-design-guidance]")) {
      return `${scope}:guidance`;
    }
    return `${scope}:policy`;
  }

  function designFormControls(form) {
    return [...(form?.querySelectorAll?.("input[name], select[name], textarea[name]") || [])];
  }

  function captureDesignFormDraft(form, focusTarget = documentValue?.activeElement) {
    const key = designFormKey(form);
    if (!key) return "";
    const controls = designFormControls(form);
    const focusedIndex = controls.indexOf(focusTarget);
    state.designFormDrafts.set(key, {
      controls: controls.map((control) => ({
        name: String(control.name || ""),
        type: String(control.type || ""),
        value: String(control.value ?? ""),
        checked: control.checked === true
      })),
      detailsOpen: form.closest?.("details")?.open === true
    });
    if (focusedIndex >= 0) {
      const focused = controls[focusedIndex];
      state.designFormFocus = {
        key,
        index: focusedIndex,
        selectionStart: Number.isSafeInteger(focused.selectionStart)
          ? focused.selectionStart
          : null,
        selectionEnd: Number.isSafeInteger(focused.selectionEnd)
          ? focused.selectionEnd
          : null
      };
    }
    return key;
  }

  function forgetDesignFormDraft(key) {
    if (!key) return;
    state.designFormDrafts.delete(key);
    if (state.designFormFocus?.key === key) state.designFormFocus = null;
  }

  function restoreDesignFormDrafts({ restoreFocus = true } = {}) {
    const forms = [...(root.querySelectorAll?.(DESIGN_FORM_SELECTOR) || [])];
    let focusControl = null;
    let focusState = null;
    for (const form of forms) {
      const key = designFormKey(form);
      const draft = state.designFormDrafts.get(key);
      if (!draft) continue;
      const controls = designFormControls(form);
      controls.forEach((control, index) => {
        const saved = draft.controls[index];
        if (!saved || saved.name !== String(control.name || "") ||
            saved.type !== String(control.type || "")) return;
        if (["checkbox", "radio"].includes(saved.type)) {
          if (saved.value === String(control.value ?? "")) control.checked = saved.checked;
          return;
        }
        control.value = saved.value;
      });
      const details = form.closest?.("details");
      if (details && draft.detailsOpen) details.open = true;
      if (restoreFocus && state.designFormFocus?.key === key) {
        focusControl = controls[state.designFormFocus.index] || null;
        focusState = state.designFormFocus;
      }
    }
    if (focusControl) {
      globalThis.queueMicrotask?.(() => {
        focusControl.focus?.({ preventScroll: true });
        if (focusState.selectionStart != null && focusState.selectionEnd != null &&
            typeof focusControl.setSelectionRange === "function") {
          focusControl.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
        }
      });
    }
  }

  async function runDesignCommand({
    draft,
    command,
    formKey = "",
    startedMessage,
    successMessage
  }) {
    if (!state.course || !state.courseDesign || state.designBusy) return false;
    const pendingKey = formKey || `${designDraftScopeKey()}:command:${command.type}`;
    const pending = state.pendingDesignCommands.get(pendingKey);
    if (!pendingWriteMatches(pending, draft)) {
      state.pendingDesignCommands.delete(pendingKey);
    }
    const retained = state.pendingDesignCommands.get(pendingKey)?.request || {
      requestId: createUuid(),
      courseId: state.course.courseId,
      expectedCourseRevision: state.courseDesign.courseRevision,
      command: structuredClone(command)
    };
    if (!state.pendingDesignCommands.has(pendingKey)) {
      state.pendingDesignCommands.set(pendingKey, {
        draft: structuredClone(draft),
        request: structuredClone(retained)
      });
    }
    state.designBusy = true;
    state.designFailure = "";
    state.designMessage = startedMessage;
    render();
    let mutationConfirmed = false;
    try {
      const result = normalizeCourseDesignChange(
        await controller.mutateCourseDesign(structuredClone(retained)),
        {
          expectedCourseId: retained.courseId,
          expectedRequestId: retained.requestId
        }
      );
      mutationConfirmed = true;
      const scope = activeDesignScope();
      const [planningLoaded, loaded] = await Promise.all([
        scope?.kind === "didactic_microsequence"
          ? loadPlanning(state.course.courseId, {
            expectedCourseRevision: result.courseRevision
          })
          : true,
        loadDesign(state.course.courseId, {
          scope,
          preserveExisting: true,
          expectedCourseRevision: result.courseRevision
        })
      ]);
      state.pendingDesignCommands.delete(pendingKey);
      forgetDesignFormDraft(formKey);
      state.course = Object.freeze({ ...state.course, revision: result.courseRevision });
      state.knownCourse = state.course;
      knownCourses.set(state.course.courseId, state.course);
      const rereadComplete = Boolean(planningLoaded && loaded);
      state.designMessage = rereadComplete
        ? successMessage
        : `${successMessage} A gravação foi confirmada, mas a tela pode estar desatualizada.`;
      if (!rereadComplete && !state.courseDesign) state.designFailure = state.designMessage;
      return true;
    } catch (error) {
      if (mutationConfirmed) {
        state.pendingDesignCommands.delete(pendingKey);
        forgetDesignFormDraft(formKey);
        state.designMessage =
          `${successMessage} A gravação foi confirmada, mas a tela pode estar desatualizada.`;
        if (!state.courseDesign) state.designFailure = state.designMessage;
        return true;
      }
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingDesignCommands.delete(pendingKey);
      state.designFailure = ambiguous
        ? ambiguousWriteFailureMessage(error)
        : writeFailureMessage(error);
      state.designMessage = "";
      return false;
    } finally {
      state.designBusy = false;
      render();
    }
  }

  function runDirectDesignCommand(command, successMessage, formKey = "") {
    const draft = structuredClone(command);
    void runDesignCommand({
      draft,
      command,
      formKey,
      startedMessage: "Atualizando parâmetros…",
      successMessage
    });
  }

  function setRequestFeedback(message = "", { error = false } = {}) {
    const value = String(message || "").trim();
    root.querySelectorAll?.("[data-course-authoring-request-feedback]").forEach((notice) => {
      notice.hidden = !value;
      notice.textContent = value;
      notice.classList?.toggle("is-error", error);
      notice.setAttribute?.("role", error ? "alert" : "status");
    });
  }

  function updateActionConfirmationHost({ focus = false } = {}) {
    const host = root.querySelector?.("[data-course-authoring-confirm-host]");
    if (!host) return false;
    host.innerHTML = renderActionConfirmation(state.actionConfirmation);
    if (focus && state.actionConfirmation) {
      globalThis.queueMicrotask?.(() => {
        host.querySelector?.('[data-course-authoring-action="cancel-action-confirmation"]')
          ?.focus?.({ preventScroll: true });
      });
    }
    return true;
  }

  function closeActionConfirmation({ restoreFocus = true } = {}) {
    if (!state.actionConfirmation) return false;
    const trigger = state.actionConfirmation.trigger;
    state.actionConfirmation = null;
    updateActionConfirmationHost();
    if (restoreFocus) trigger?.focus?.({ preventScroll: true });
    return true;
  }

  function openActionConfirmation({
    message,
    confirmLabel,
    tone = "danger",
    icon = tone === "danger" ? "trash" : "ready-state",
    execute
  }) {
    if (!String(message || "").trim() || typeof execute !== "function") return false;
    state.actionConfirmation = {
      message: String(message).trim(),
      confirmLabel: String(confirmLabel || "Confirmar").trim(),
      tone,
      icon,
      execute,
      trigger: documentValue?.activeElement || null
    };
    return updateActionConfirmationHost({ focus: true });
  }

  function confirmAction() {
    const execute = state.actionConfirmation?.execute;
    if (typeof execute !== "function") return false;
    closeActionConfirmation({ restoreFocus: false });
    void Promise.resolve().then(execute);
    return true;
  }

  function preserveDesignFormDraft(event) {
    if (event.target?.matches?.("#course-authoring-access-email")) {
      state.grantDraftEmail = String(event.target.value || "");
      const draft = {
        operation: "grant_access",
        courseId: state.course?.courseId || "",
        email: state.grantDraftEmail.trim().toLowerCase()
      };
      if (!pendingWriteMatches(state.pendingPeopleCommand, draft)) {
        state.pendingPeopleCommand = null;
      }
      return;
    }
    const form = event.target?.closest?.(DESIGN_FORM_SELECTOR);
    if (!form) return;
    captureDesignFormDraft(form, event.target);
  }

  function resetDesignFormDraft(event) {
    const key = designFormKey(event.target);
    if (!key) return;
    event.preventDefault();
    forgetDesignFormDraft(key);
    state.pendingDesignCommands.delete(key);
    state.designFailure = "";
    state.designMessage = "";
    render();
  }

  root.addEventListener("keydown", handleRootKeyDown);
  root.addEventListener("input", preserveDesignFormDraft);
  root.addEventListener("change", preserveDesignFormDraft);
  root.addEventListener("reset", resetDesignFormDraft);

  root.addEventListener("submit", (event) => {
    if (!state.opened) return;
    const submittedDesignFormKey = captureDesignFormDraft(event.target);
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
        await navigate(buildCourseAuthoringRoute(courseId));
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
    if (event.target.matches?.("[data-course-design-scope]")) {
      event.preventDefault();
      if (!state.course || !state.courseDesign || state.designLoading) return;
      const kind = formValue(event.target, "scopeKind");
      const ref = formValue(event.target, "scopeRef");
      const child = state.courseDesign.scopeContext.children.find((scope) =>
        scope.kind === kind && scope.ref === ref);
      if (!child) {
        state.designFailure = "Selecione um escopo disponível.";
        render({ focus: "#course-design-child-scope" });
        return;
      }
      void navigate(designScopeRoute(state.course.courseId, child));
      return;
    }
    if (event.target.matches?.("[data-course-design-parameter]")) {
      event.preventDefault();
      if (!state.courseDesign || state.designBusy) return;
      const parameterId = formValue(event.target, "parameterId");
      const definition = state.courseDesign.definitions.find((item) => item.id === parameterId);
      const scope = activeDesignScope();
      if (!definition || !scope || !definition.supportedScopes.includes(scope.kind)) {
        state.designFailure = "Este parâmetro não pode ser definido no escopo atual.";
        render();
        return;
      }
      const origin = formValue(event.target, "origin");
      const reason = formValue(event.target, "reason");
      let value;
      if (definition.valueSchema.type === "integer") {
        value = Number(formValue(event.target, "parameterValue"));
        if (!Number.isSafeInteger(value) || value < definition.valueSchema.minimum ||
            value > definition.valueSchema.maximum) {
          state.designFailure = "Revise o valor do parâmetro.";
          render();
          return;
        }
      } else {
        value = checkedFormValues(event.target, "parameterValue");
        const allowed = new Set(definition.valueSchema.allowedValues);
        if (value.length < definition.valueSchema.minimumItems ||
            value.length > definition.valueSchema.maximumItems ||
            new Set(value).size !== value.length || value.some((item) => !allowed.has(item))) {
          state.designFailure = "Revise os valores exigidos pelo parâmetro.";
          render();
          return;
        }
      }
      if (!new Set(["author", "research_condition"]).has(origin) ||
          !reason || reason.length > 1_000) {
        state.designFailure = "Informe a origem e uma justificativa clara.";
        render();
        return;
      }
      const command = { type: "set_parameter", scope, parameterId, value, origin, reason };
      void runDesignCommand({
        draft: command,
        command,
        formKey: submittedDesignFormKey,
        startedMessage: "Salvando parâmetro…",
        successMessage: "Parâmetro salvo neste escopo."
      });
      return;
    }
    if (event.target.matches?.("[data-course-design-guidance]")) {
      event.preventDefault();
      if (!state.courseDesign || state.designBusy) return;
      const scope = activeDesignScope();
      const guidance = formValue(event.target, "guidance");
      const origin = formValue(event.target, "origin");
      const reason = formValue(event.target, "reason");
      if (!scope || !guidance || guidance.length > 8_192 ||
          new TextEncoder().encode(JSON.stringify(guidance)).byteLength > 8_192 ||
          !new Set(["automatic", "author", "research_condition"]).has(origin) ||
          !reason || reason.length > 1_000) {
        state.designFailure = "Revise a direção editorial, a origem e a justificativa.";
        render();
        return;
      }
      const command = { type: "set_guidance", scope, guidance, origin, reason };
      void runDesignCommand({
        draft: command,
        command,
        formKey: submittedDesignFormKey,
        startedMessage: "Salvando direção editorial…",
        successMessage: "Direção editorial salva neste escopo."
      });
      return;
    }
    if (event.target.matches?.("[data-course-design-policy]")) {
      event.preventDefault();
      if (!state.courseDesign || state.designBusy) return;
      const scope = activeDesignScope();
      const availability = formValue(event.target, "availability");
      const origin = formValue(event.target, "origin");
      const reason = formValue(event.target, "reason");
      const known = new Set(state.courseDesign.componentCatalog.options.map((option) => option.ref));
      const sortRefs = (refs) => refs.sort((left, right) => left.localeCompare(right, "en"));
      const excludedRefs = sortRefs(checkedFormValues(event.target, "excludedRefs"));
      const excluded = new Set(excludedRefs);
      const allowedRefs = availability === "all"
        ? []
        : sortRefs(checkedFormValues(event.target, "allowedRefs")
          .filter((ref) => !excluded.has(ref)));
      const preferredRefs = sortRefs(checkedFormValues(event.target, "preferredRefs")
        .filter((ref) => !excluded.has(ref)));
      const allowed = availability === "all" ? known : new Set(allowedRefs);
      const lists = [allowedRefs, excludedRefs, preferredRefs];
      if (!scope || !new Set(["all", "allow_only"]).has(availability) ||
          availability === "allow_only" && allowedRefs.length === 0 ||
          lists.some((list) => list.length > 32 || new Set(list).size !== list.length ||
            list.some((ref) => !known.has(ref))) ||
          preferredRefs.some((ref) => !allowed.has(ref) || excluded.has(ref)) ||
          !new Set(["automatic", "author", "research_condition"]).has(origin) ||
          !reason || reason.length > 1_000) {
        state.designFailure = "Revise disponibilidade, exclusões, preferências e justificativa.";
        render();
        return;
      }
      const command = {
        type: "set_component_policy",
        scope,
        policy: {
          catalogVersion: state.courseDesign.componentCatalog.version,
          availability,
          allowedRefs,
          excludedRefs,
          preferredRefs
        },
        origin,
        reason
      };
      void runDesignCommand({
        draft: command,
        command,
        formKey: submittedDesignFormKey,
        startedMessage: "Salvando política de componentes…",
        successMessage: "Política de componentes salva neste escopo."
      });
      return;
    }
    if (event.target.matches?.("[data-course-authoring-grant]")) {
      event.preventDefault();
      if (!state.course || state.peopleBusy) return;
      const email = String(event.target.elements?.email?.value || "").trim().toLowerCase();
      if (!email) return;
      const courseId = state.course.courseId;
      const draft = { operation: "grant_access", courseId, email };
      state.grantDraftEmail = email;
      if (!pendingWriteMatches(state.pendingPeopleCommand, draft)) {
        state.pendingPeopleCommand = null;
      }
      openActionConfirmation({
        message: `Conceder a ${email} acesso para Estudo neste Curso?`,
        confirmLabel: "Conceder acesso",
        tone: "primary",
        icon: "account-add",
        execute() {
          void runPeopleCommand({
            draft,
            request: { courseId, email, confirmed: true },
            method: "grantCourseAccess",
            startedMessage: "Concedendo acesso…",
            successMessage: "Solicitação recebida. Por segurança, o AraLearn não informa se o endereço corresponde a uma conta. Use Atualizar Curso depois para conferir o acesso.",
            refreshAfterSuccess: false,
            afterSuccess() {
              state.grantOpen = false;
              state.grantDraftEmail = "";
            }
          });
        }
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
    if (event.target.matches?.("[data-course-authoring-confirm-backdrop]")) {
      closeActionConfirmation();
      return;
    }
    const node = event.target.closest?.("[data-course-authoring-action]");
    if (!node || (typeof root.contains === "function" && !root.contains(node))) return;
    const action = node.dataset.courseAuthoringAction;
    if (["open-course", "change-section", "change-design-scope"].includes(action)) {
      event.preventDefault();
    }
    if (action === "open-course") {
      const course = knownCourses.get(node.dataset.courseId);
      void navigate(buildCourseAuthoringRoute(node.dataset.courseId, {
        section: initialSectionForCourse(course)
      }));
    } else if (action === "back") {
      handleBack();
    } else if (action === "change-section" && state.course) {
      const menu = node.closest?.(
        ".course-authoring-task-menu, .course-authoring-part-tools"
      );
      if (menu) menu.open = false;
      const href = node.getAttribute?.("href");
      void navigate(href || buildCourseAuthoringRoute(state.course.courseId, {
        section: node.dataset.section
      }));
    } else if (action === "cancel-action-confirmation") {
      closeActionConfirmation();
    } else if (action === "confirm-action-confirmation") {
      confirmAction();
    } else if (action === "refresh-course") {
      const menu = node.closest?.(".course-authoring-task-menu");
      if (menu) {
        menu.open = false;
        menu.querySelector?.(":scope > summary")?.focus?.({ preventScroll: true });
      }
      setRequestFeedback("");
      void refresh().catch((error) => {
        setRequestFeedback(writeFailureMessage(error), { error: true });
      });
    } else if (action === "change-design-scope" && state.course && state.courseDesign) {
      const scope = {
        kind: String(node.dataset.scopeKind || ""),
        ref: String(node.dataset.scopeRef || "")
      };
      const available = [
        ...state.courseDesign.scopeContext.ancestors,
        state.courseDesign.scopeContext.current,
        ...state.courseDesign.scopeContext.children
      ].some((candidate) => sameDesignScope(candidate, scope));
      if (available) {
        void navigate(designScopeRoute(state.course.courseId, scope));
      }
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
    } else if (action === "retry-design" && state.course) {
      void loadDesign(state.course.courseId, {
        scope: designScopeForRoute(state.course.courseId, state.routeTarget)
      });
    } else if (action === "retry-people" && state.course) {
      void loadPeople(state.course.courseId);
    } else if (action === "load-more-design-scopes" && state.courseDesign?.scopeContext.hasMoreChildren &&
        !state.designLoading) {
      void loadDesign(state.course.courseId, {
        scope: activeDesignScope(),
        cursor: state.courseDesign.scopeContext.nextChildCursor,
        append: true,
        expectedCourseRevision: state.courseDesign.courseRevision
      });
    } else if (action === "clear-design-parameter" && state.courseDesign && !state.designBusy) {
      const parameterId = String(node.dataset.parameterId || "");
      const resolution = state.courseDesign.parameters.find((item) =>
        item.parameterId === parameterId);
      if (resolution?.localAssignment) {
        openActionConfirmation({
          message: "Remover esta atribuição local e restaurar o valor herdado?",
          confirmLabel: "Restaurar herança",
          tone: "secondary",
          icon: "reset",
          execute: () => runDirectDesignCommand({
            type: "clear_parameter",
            scope: activeDesignScope(),
            parameterId
          }, "A atribuição local foi removida; o valor herdado voltou a valer.",
          `${designDraftScopeKey()}:parameter:${parameterId}`)
        });
      }
    } else if (action === "clear-design-guidance" && state.courseDesign?.guidance.localAssignment &&
        !state.designBusy) {
      openActionConfirmation({
        message: "Remover esta direção editorial local e restaurar a herdada?",
        confirmLabel: "Restaurar herança",
        tone: "secondary",
        icon: "reset",
        execute: () => runDirectDesignCommand({
          type: "clear_guidance",
          scope: activeDesignScope()
        }, "A direção editorial local foi removida; a pilha ancestral permanece.",
        `${designDraftScopeKey()}:guidance`)
      });
    } else if (action === "clear-design-policy" && state.courseDesign?.componentPolicy.localAssignment &&
        !state.designBusy) {
      openActionConfirmation({
        message: "Remover esta política local e restaurar a política herdada?",
        confirmLabel: "Restaurar herança",
        tone: "secondary",
        icon: "reset",
        execute: () => runDirectDesignCommand({
          type: "clear_component_policy",
          scope: activeDesignScope()
        }, "A política local foi removida; a política herdada voltou a valer.",
        `${designDraftScopeKey()}:policy`)
      });
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
    } else if (action === "inspect-part" && state.course) {
      const partId = String(node.dataset.partId || "");
      if (!state.authoringPlan?.plan.parts.some((part) => part.id === partId)) return;
      void navigate(buildCourseAuthoringRoute(state.course.courseId, {
        section: "content",
        authoringPartId: partId
      }));
    } else if (action === "edit-content-entity" && state.course && onOpenStudyContent) {
      const targetKind = String(node.dataset.targetKind || "course");
      const entityPath = targetKind === "course"
        ? [state.course.courseId]
        : [];
      openInspectionContentEditor({ entityPath });
    } else if (action === "open-grant") {
      if (state.pendingPeopleCommand?.draft?.operation !== "grant_access") {
        state.pendingPeopleCommand = null;
        state.grantDraftEmail = "";
      } else {
        state.grantDraftEmail = state.pendingPeopleCommand.draft.email;
      }
      state.grantOpen = true;
      state.peopleFailure = "";
      render({ focus: "#course-authoring-access-email" });
    } else if (action === "cancel-grant") {
      state.grantOpen = false;
      state.grantDraftEmail = "";
      state.pendingPeopleCommand = null;
      render();
    } else if (action === "revoke-access" && state.course && !state.peopleBusy) {
      const userId = String(node.dataset.userId || "");
      const displayName = String(node.dataset.displayName || "esta pessoa");
      const courseId = state.course.courseId;
      const draft = { operation: "revoke_access", courseId, userId };
      if (!pendingWriteMatches(state.pendingPeopleCommand, draft)) {
        state.pendingPeopleCommand = null;
      }
      openActionConfirmation({
        message: `Revogar o acesso de ${displayName}? O estado pessoal de Estudo será preservado.`,
        confirmLabel: "Revogar acesso",
        execute() {
          void runPeopleCommand({
            draft,
            request: { courseId, userId, confirmed: true },
            method: "revokeCourseAccess",
            startedMessage: "Revogando acesso…",
            successMessage: "Acesso revogado; o estado pessoal foi preservado."
          });
        }
      });
    }
  });

  return Object.freeze({
    open,
    close,
    destroy,
    refresh,
    setOfflineStatus(offline = true) {
      const updated = setAuthoringSyncState({
        offline,
        stale: offline === true || state.syncStale
      });
      if (!updated && state.opened && state.view === "course") render();
    },
    handleBack,
    rememberInspectionReturnFocus,
    get opened() {
      return state.opened;
    },
    get route() {
      return parseCourseAuthoringRoute(locationValue.hash || "");
    }
  });
}
