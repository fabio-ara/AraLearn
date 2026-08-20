import { readLessonProgressEntry } from "../storage/progressStore.js";
import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";
import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function entityId(entity) {
  return typeof entity?.id === "string" ? entity.id : "";
}

function countLessons(course) {
  return (course.modules || []).reduce(
    (total, moduleValue) => total + (moduleValue.lessons || []).length,
    0
  );
}

function countStudyUnitsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) =>
    isRunnableMicrosequence(microsequence)
      ? total + (microsequence.studyUnits || []).length
      : total, 0);
}

function countStudyUnits(course) {
  return (course.modules || []).reduce((courseTotal, moduleValue) =>
    courseTotal + (moduleValue.lessons || []).reduce(
      (moduleTotal, lesson) => moduleTotal + countStudyUnitsInLesson(lesson),
      0
    ), 0);
}

function countCompletedStudyUnits(course, progress) {
  return (course.modules || []).reduce((courseTotal, moduleValue) =>
    courseTotal + (moduleValue.lessons || []).reduce((moduleTotal, lesson) => {
      const entry = readLessonProgressEntry(progress, {
        courseId: entityId(course),
        moduleId: entityId(moduleValue),
        lessonId: entityId(lesson)
      });
      return moduleTotal + (entry?.completedStudyUnitIds?.length || 0);
    }, 0), 0);
}

function metric(icon, value, label) {
  return (
    '<span class="progress-meta-item" aria-label="' + escapeHtml(label) +
    '" title="' + escapeHtml(label) + '">' +
    renderUiIcon(icon, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' + escapeHtml(value) + "</span></span>"
  );
}

function renderCourse(course, progress, permissions = {}) {
  const hasLoadedComposition = (course.modules || []).length > 0;
  const total = hasLoadedComposition
    ? countStudyUnits(course)
    : Number(permissions.studyUnitCount || 0);
  const completed = hasLoadedComposition
    ? countCompletedStudyUnits(course, progress)
    : Number(permissions.completedStudyUnitCount || 0);
  const moduleCount = hasLoadedComposition
    ? (course.modules || []).length
    : Number(permissions.moduleCount || 0);
  const lessonCount = hasLoadedComposition
    ? countLessons(course)
    : Number(permissions.lessonCount || 0);
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  const ownership = permissions.canEdit === true ? "Curso próprio" : "Curso compartilhado";
  return (
    '<article class="clean-card progress-card navigation-list-card home-course-selector-preview" data-course-id="' +
    escapeHtml(entityId(course)) + '">' +
    '<div class="card-progress-fill" style="width:' + String(percentage) +
    '%" role="progressbar" aria-label="Progresso do Curso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    String(percentage) + '"></div>' +
    '<div class="lesson-copy navigation-main">' +
    '<div class="structure-title-row navigation-title-row"><h2 class="card-title">' +
    escapeHtml(course.title || "Curso") + "</h2></div>" +
    (course.goal ? '<p class="card-subtitle">' + escapeHtml(course.goal) + "</p>" : "") +
    '<p class="muted tiny progress-meta">' +
    metric("progress", `${completed}/${total}`, `Progresso: ${completed} de ${total}`) +
    '<span class="progress-meta-separator" aria-hidden="true">·</span>' +
    metric("module", String(moduleCount), "Módulos") +
    '<span class="progress-meta-separator" aria-hidden="true">·</span>' +
    metric("lesson", String(lessonCount), "Lições") +
    "</p></div>" +
    '<div class="lesson-actions navigation-actions">' +
    '<span class="home-course-origin" title="' + escapeHtml(ownership) +
    '" aria-label="' + escapeHtml(ownership) + '">' +
    renderUiIcon(permissions.canEdit === true ? "key" : "account-add", "home-course-origin-icon") +
    "</span>" +
    (completed > 0
      ? '<button class="icon-ghost study-course-reset" type="button" data-action="reset-course-progress" data-course-id="' +
        escapeHtml(entityId(course)) + '" title="Zerar progresso do Curso" aria-label="Zerar progresso do Curso">' +
        renderUiIcon("rotate", "home-tab-icon") + "</button>"
      : "") +
    '<button class="open-main" type="button" data-action="open-course" data-course-id="' +
    escapeHtml(entityId(course)) + '" title="Abrir Curso" aria-label="Abrir Curso">' +
    renderUiIcon("play", "home-tab-icon") + "</button></div></article>"
  );
}

function validReviewItem(item) {
  return Array.isArray(item?.entityPath) && item.entityPath.length === 5 &&
    item.entityPath.every((value) => typeof value === "string" && value.length > 0);
}

function renderReviewQueue(reviewItems, hasMore = false) {
  const items = (Array.isArray(reviewItems) ? reviewItems : []).filter(validReviewItem);
  if (!items.length) return "";
  return (
    '<details class="study-review-queue clean-card" open>' +
    '<summary><span>' + renderUiIcon("review", "home-tab-icon") +
    '</span><strong>Rever</strong><span class="muted tiny">' + String(items.length) + "</span></summary>" +
    '<div class="study-review-list">' + items.map((item) => {
      const [courseId, moduleId, lessonId, microsequenceId, studyUnitId] = item.entityPath;
      const title = String(item.title || "Unidade marcada");
      return (
        '<button class="study-review-item" type="button" data-action="open-review-item"' +
        ' data-course-id="' + escapeHtml(courseId) + '" data-module-id="' + escapeHtml(moduleId) +
        '" data-lesson-id="' + escapeHtml(lessonId) + '" data-microsequence-id="' +
        escapeHtml(microsequenceId) + '" data-study-unit-id="' + escapeHtml(studyUnitId) +
        '" aria-label="Abrir para rever: ' + escapeHtml(title) + '">' +
        renderUiIcon("review", "home-tab-icon") + '<span><strong>' + escapeHtml(title) +
        "</strong>" + (item.context ? '<small>' + escapeHtml(item.context) + "</small>" : "") +
        "</span></button>"
      );
    }).join("") + (hasMore
      ? '<button class="open-mini study-review-more" type="button" data-action="load-more-review-items">' +
        renderUiIcon("add", "home-tab-icon") + "<span>Mostrar mais</span></button>"
      : "") + "</div></details>"
  );
}

function renderTopbar() {
  return (
    '<header class="topbar home-topbar navigation-topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title"><span class="brand-title">' +
    '<img class="brand-mark" src="assets/brand/aralearn-mark-monochrome.svg" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span></span></h1>' +
    '<button class="icon-ghost" type="button" data-action="open-settings"' +
    ' title="Conta e aparência" aria-label="Conta e aparência">' +
    renderUiIcon("more", "home-tab-icon") + "</button></header>"
  );
}

function renderRuntimeNotice(status) {
  if (status?.offline !== true && status?.stale !== true) return "";
  return '<p class="study-runtime-notice" role="status">' +
    renderUiIcon("offline", "home-tab-icon") +
    '<span>Sem conexão · alterações pessoais ficam salvas neste dispositivo.</span></p>';
}

export function renderHomeScreen({
  project,
  progress,
  reviewItems = [],
  reviewHasMore = false,
  runtimeStatus = {},
  editorSupport = {}
}) {
  const courses = Array.isArray(project?.courses) ? project.courses : [];
  const courseMarkup = courses.map((course) => renderCourse(
    course,
    progress,
    editorSupport.coursePermissionsById?.[course.id] || {}
  )).join("");
  return (
    '<section class="screen">' + renderTopbar() +
    '<main class="screen-content courses-home-screen navigation-screen">' +
    '<nav class="home-product-switch" aria-label="Área principal">' +
    '<button class="is-active" type="button" aria-current="page" title="Estudo">' +
    renderUiIcon("study", "home-tab-icon") + '<span>Estudo</span></button>' +
    '<button type="button" data-action="open-authoring" title="Abrir Autoria">' +
    renderUiIcon("edit", "home-tab-icon") + '<span>Autoria</span></button></nav>' +
    renderRuntimeNotice(runtimeStatus) +
    renderReviewQueue(reviewItems, reviewHasMore) +
    '<section class="courses-home-list navigation-list">' +
    (courseMarkup || '<article class="home-course-selector-empty"><p class="empty-state-copy">Nenhum Curso acessível.</p></article>') +
    "</section></main></section>"
  );
}
