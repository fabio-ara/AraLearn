import {
  getPackageStudyUnitFeedbackEntry,
  readPackageStudyUnitText,
  renderPackageStudyUnitBlocksWithDock,
  renderPackageStudyUnitFeedback
} from "../render/renderPackageStudyUnit.js";
import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import { renderHomeScreen } from "../ui/renderHomeScreen.js";
import { collectLessonStudyUnits } from "./CourseStudyNavigation.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function topbar(title, backTitle = "Voltar") {
  return (
    '<header class="topbar lesson-topbar navigation-topbar">' +
    '<button class="icon-ghost" type="button" data-action="go-back" title="' +
    escapeHtml(backTitle) + '" aria-label="' + escapeHtml(backTitle) + '">' +
    renderUiIcon("arrow-left", "home-tab-icon") + "</button>" +
    '<div class="topbar-heading"><div class="topbar-title">' + escapeHtml(title) +
    '</div></div><div class="lesson-top-actions">' +
    '<button class="icon-ghost" type="button" data-action="open-settings"' +
    ' title="Conta e aparência" aria-label="Conta e aparência">' +
    renderUiIcon("more", "home-tab-icon") + "</button></div></header>"
  );
}

function runtimeNotice(status) {
  if (status?.offline !== true && status?.stale !== true) return "";
  return '<p class="study-runtime-notice" role="status">' +
    renderUiIcon("offline", "home-tab-icon") +
    '<span>Sem conexão · alterações pessoais ficam salvas neste dispositivo.</span></p>';
}

function progressEntry(course, moduleValue, lesson, progress) {
  return readLessonProgressEntry(progress, {
    courseId: course.id,
    moduleId: moduleValue.id,
    lessonId: lesson.id
  });
}

function lessonTotal(lesson) {
  return collectLessonStudyUnits(lesson).length;
}

function lessonCompleted(course, moduleValue, lesson, progress) {
  return progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds?.length || 0;
}

function moduleTotal(moduleValue) {
  return (moduleValue.lessons || []).reduce((total, lesson) => total + lessonTotal(lesson), 0);
}

function moduleCompleted(course, moduleValue, progress) {
  return (moduleValue.lessons || []).reduce(
    (total, lesson) => total + lessonCompleted(course, moduleValue, lesson, progress),
    0
  );
}

function metric(icon, value, label) {
  return '<span class="progress-meta-item" aria-label="' + escapeHtml(label) +
    '" title="' + escapeHtml(label) + '">' +
    renderUiIcon(icon, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' + escapeHtml(value) + "</span></span>";
}

function navigationCard({
  level,
  ids,
  title,
  description = "",
  completed = 0,
  total = 0,
  detailIcon,
  detailCount,
  openAction,
  openLabel,
  resetLabel = "",
  studyUnitIndex = null
}) {
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  const attributes = Object.entries(ids).map(([name, value]) =>
    ` data-${name}="${escapeHtml(value)}"`).join("");
  return (
    '<article class="clean-card progress-card structure-list-card navigation-list-card" data-study-level="' +
    escapeHtml(level) + '"' + attributes + ">" +
    '<div class="card-progress-fill" style="width:' + String(percentage) + '%"></div>' +
    '<div class="lesson-copy structure-copy navigation-main">' +
    '<div class="structure-title-row navigation-title-row"><h3 class="card-title">' +
    escapeHtml(title) + "</h3></div>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    '<p class="muted tiny progress-meta">' +
    metric("progress", `${completed}/${total}`, `Progresso: ${completed} de ${total}`) +
    (detailIcon
      ? '<span class="progress-meta-separator" aria-hidden="true">·</span>' +
        metric(detailIcon, String(detailCount), "Quantidade")
      : "") + "</p></div>" +
    '<div class="lesson-actions structure-actions navigation-actions">' +
    (completed > 0 && resetLabel
      ? '<button class="icon-ghost" type="button" data-action="reset-study-progress"' +
        attributes + ' data-reset-level="' + escapeHtml(level) + '" title="' +
        escapeHtml(resetLabel) + '" aria-label="' + escapeHtml(resetLabel) + '">' +
        renderUiIcon("reset", "home-tab-icon") + "</button>"
      : "") +
    '<button class="open-mini" type="button" data-action="' + escapeHtml(openAction) + '"' +
    attributes + (studyUnitIndex == null ? "" : ` data-study-unit-index="${studyUnitIndex}"`) +
    ' title="' + escapeHtml(openLabel) + '" aria-label="' + escapeHtml(openLabel) + '">' +
    renderUiIcon("play", "home-tab-icon") + "</button></div></article>"
  );
}

function summary(title, description) {
  return '<section class="clean-card entity-summary-card"><h1 class="card-title">' +
    escapeHtml(title) + "</h1>" +
    (description ? '<p class="card-subtitle">' + escapeHtml(description) + "</p>" : "") +
    "</section>";
}

function renderCourse(course, progress, runtimeStatus) {
  const modules = (course.modules || []).map((moduleValue) => navigationCard({
    level: "module",
    ids: { "course-id": course.id, "module-id": moduleValue.id },
    title: moduleValue.title || moduleValue.id,
    description: moduleValue.guide?.goal || "",
    completed: moduleCompleted(course, moduleValue, progress),
    total: moduleTotal(moduleValue),
    detailIcon: "lesson",
    detailCount: (moduleValue.lessons || []).length,
    openAction: "open-module",
    openLabel: "Abrir módulo",
    resetLabel: "Zerar progresso deste Módulo"
  })).join("");
  return '<section class="screen">' + topbar("Curso", "Menu principal") + runtimeNotice(runtimeStatus) +
    '<main class="screen-content course-screen">' +
    summary(course.title || "Curso", course.goal || "") +
    '<h2 class="section-heading">Módulos</h2><section class="navigation-list">' +
    (modules || '<p class="empty-state-copy">Sem módulos.</p>') + "</section></main></section>";
}

function renderModule(course, moduleValue, progress, runtimeStatus) {
  const lessons = (moduleValue.lessons || []).map((lesson) => navigationCard({
    level: "lesson",
    ids: { "course-id": course.id, "module-id": moduleValue.id, "lesson-id": lesson.id },
    title: lesson.title || lesson.id,
    description: lesson.guide?.goal || "",
    completed: lessonCompleted(course, moduleValue, lesson, progress),
    total: lessonTotal(lesson),
    detailIcon: "microsequence",
    detailCount: (lesson.microsequences || []).length,
    openAction: "open-lesson",
    openLabel: "Abrir lição",
    resetLabel: "Zerar progresso desta Lição"
  })).join("");
  return '<section class="screen">' + topbar("Módulo") + runtimeNotice(runtimeStatus) +
    '<main class="screen-content course-screen">' +
    summary(moduleValue.title || "Módulo", moduleValue.guide?.goal || "") +
    '<h2 class="section-heading">Lições</h2><section class="navigation-list">' +
    (lessons || '<p class="empty-state-copy">Sem lições.</p>') + "</section></main></section>";
}

function renderLesson(course, moduleValue, lesson, progress, runtimeStatus) {
  const completedIds = new Set(
    progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds || []
  );
  const rows = (lesson.microsequences || []).map((microsequence) => {
    const units = microsequence.studyUnits || [];
    return navigationCard({
      level: "microsequence",
      ids: {
        "course-id": course.id,
        "module-id": moduleValue.id,
        "lesson-id": lesson.id,
        "microsequence-id": microsequence.id
      },
      title: microsequence.title || microsequence.id,
      description: microsequence.goal || "",
      completed: units.filter((unit) => completedIds.has(unit.id)).length,
      total: units.length,
      detailIcon: "study-unit",
      detailCount: units.length,
      openAction: "open-microsequence",
      openLabel: "Abrir microssequência didática",
      resetLabel: "Zerar progresso desta Microssequência didática"
    });
  }).join("");
  return '<section class="screen">' + topbar("Lição") + runtimeNotice(runtimeStatus) +
    '<main class="screen-content lesson-structure-screen navigation-screen">' +
    summary(lesson.title || "Lição", lesson.guide?.goal || "") +
    '<h2 class="section-heading">Microssequências didáticas</h2><section class="navigation-list">' +
    (rows || '<p class="empty-state-copy">Sem microssequências.</p>') + "</section></main></section>";
}

function renderMicrosequenceOverview(
  course,
  moduleValue,
  lesson,
  microsequence,
  progress,
  runtimeStatus
) {
  const completedIds = new Set(
    progressEntry(course, moduleValue, lesson, progress)?.completedStudyUnitIds || []
  );
  const units = (microsequence.studyUnits || []).map((studyUnit, index) => navigationCard({
    level: "study-unit",
    ids: {
      "course-id": course.id,
      "module-id": moduleValue.id,
      "lesson-id": lesson.id,
      "microsequence-id": microsequence.id,
      "study-unit-id": studyUnit.id
    },
    title: studyUnit.title || studyUnit.id,
    description: readPackageStudyUnitText(studyUnit).slice(0, 140),
    completed: completedIds.has(studyUnit.id) ? 1 : 0,
    total: 1,
    openAction: "open-study-unit",
    openLabel: "Abrir unidade",
    resetLabel: "Zerar progresso a partir desta Unidade de estudo",
    studyUnitIndex: index
  })).join("");
  return '<section class="screen microsequence-overview-screen">' +
    topbar("Microssequência didática", "Voltar para a lição") +
    runtimeNotice(runtimeStatus) +
    '<main class="screen-content microsequence-overview-content navigation-screen">' +
    summary(microsequence.title || "Microssequência didática", microsequence.goal || "") +
    '<h2 class="section-heading">Unidades</h2><section class="navigation-list">' +
    (units || '<p class="empty-state-copy">Sem unidades.</p>') + "</section></main></section>";
}

function renderStudyUnit({
  course,
  lesson,
  microsequence,
  studyUnit,
  studyUnitIndex,
  packageStudyUnitOptions,
  feedbackOpen,
  hasObservation,
  markedForReview,
  runtimeStatus
}) {
  const units = microsequence.studyUnits || [];
  const runtime = renderPackageStudyUnitBlocksWithDock(studyUnit, {
    omitRepeatedHeading: true,
    ...packageStudyUnitOptions
  });
  const feedbackEntry = getPackageStudyUnitFeedbackEntry(studyUnit);
  const feedback = feedbackOpen && feedbackEntry
    ? renderPackageStudyUnitFeedback(feedbackEntry, {
        studyUnit,
        ...packageStudyUnitOptions,
        blockKeyPrefix: "feedback"
      })
    : { bodyHtml: "", dockHtml: "" };
  const feedbackMarkup = feedbackOpen && feedbackEntry
    ? '<div class="study-continue-popup-shell"><section class="study-continue-popup">' +
      '<div class="study-continue-popup-body">' + feedback.bodyHtml + "</div>" +
      feedback.dockHtml + '<div class="study-continue-popup-actions">' +
      '<button class="open-mini study-continue-popup-btn" type="button" data-action="continue-feedback"' +
      ' title="Continuar" aria-label="Continuar">' +
      renderUiIcon("play", "home-tab-icon") + "</button></div></section></div>"
    : "";
  return '<section class="screen microsequence-workbench-screen">' +
    topbar(course.title || "Curso", "Voltar para a lição") +
    runtimeNotice(runtimeStatus) +
    '<main class="screen-content microsequence-generator-screen">' +
    '<section class="workbench-surface"><div class="workbench-surface-body">' +
    '<section class="workbench-surface-pane workbench-reader-pane study-reader-screen">' +
    '<section class="study-reader-context"><div class="study-reader-line">' +
    '<span class="study-reader-context-line study-reader-course-title">' +
    escapeHtml(microsequence.title || lesson.title || "Unidade") + "</span></div>" +
    '<div class="study-reader-progress"><span style="width:' +
    String(units.length ? ((studyUnitIndex + 1) / units.length) * 100 : 0) + '%"></span></div></section>' +
    '<section class="card-portrait editor-card-portrait study-stage">' +
    '<article class="card-portrait-body card-portrait-sheet runtime-card-sheet">' +
    '<div class="runtime-card-rendered-content"><div class="runtime-card-title">' +
    escapeHtml(studyUnit.title || studyUnit.id) + '</div><div class="card-sheet-content">' +
    runtime.bodyHtml + "</div>" + runtime.dockHtml + "</div></article></section>" +
    '<div class="study-reader-stage-meta"><span class="study-reader-count" aria-label="Unidade ' +
    String(studyUnitIndex + 1) + " de " + String(units.length) + '">' +
    renderUiIcon("study-unit", "study-reader-count-icon") +
    '<span class="study-reader-count-value">' + String(studyUnitIndex + 1) + "/" +
    String(units.length) + "</span></span></div>" +
    '<section class="study-reader-footer"><div class="study-action-dock"><div class="study-action-stack">' +
    '<div class="study-next-wrap runtime-card-external-dock">' +
    '<button class="icon-ghost study-comment-btn' + (hasObservation ? " has-comment" : "") +
    '" type="button" data-action="open-observation" title="Observação" aria-label="Observação">' +
    renderUiIcon("prompt", "home-tab-icon") + "</button>" +
    '<button class="icon-ghost study-review-btn' + (markedForReview ? " is-marked" : "") +
    '" type="button" data-action="toggle-review" aria-pressed="' + String(markedForReview) +
    '" title="Marcar para rever" aria-label="Marcar para rever">' +
    renderUiIcon("review", "home-tab-icon") + "</button>" +
    '<button class="icon-ghost" type="button" data-action="previous-study-unit"' +
    (studyUnitIndex <= 0 ? ' disabled aria-disabled="true"' : "") +
    ' title="Unidade anterior" aria-label="Unidade anterior">' +
    renderUiIcon("arrow-left", "home-tab-icon") + "</button>" +
    '<button class="open-mini study-continue-btn" type="button" data-action="next-study-unit"' +
    ' title="Continuar" aria-label="Continuar">' + renderUiIcon("play", "home-tab-icon") +
    "</button>" + feedbackMarkup + "</div></div></div></section></section></div></section>" +
    "</main></section>";
}

export function renderCourseStudyScreen({
  project,
  view,
  selection,
  course,
  moduleValue,
  lesson,
  microsequence,
  studyUnit,
  microsequenceMode,
  progress,
  reviewItems = [],
  reviewHasMore = false,
  runtimeStatus = {},
  coursePermissionsById,
  packageStudyUnitOptions = {},
  feedbackOpen = false,
  hasObservation = false,
  markedForReview = false
}) {
  if (view === "courses") {
    return renderHomeScreen({
      project,
      progress,
      reviewItems,
      reviewHasMore,
      runtimeStatus,
      editorSupport: { coursePermissionsById }
    });
  }
  if (view === "course") return renderCourse(course, progress, runtimeStatus);
  if (view === "module") return renderModule(course, moduleValue, progress, runtimeStatus);
  if (view === "lesson") return renderLesson(course, moduleValue, lesson, progress, runtimeStatus);
  if (microsequenceMode === "overview") {
    return renderMicrosequenceOverview(
      course,
      moduleValue,
      lesson,
      microsequence,
      progress,
      runtimeStatus
    );
  }
  return renderStudyUnit({
    course,
    lesson,
    microsequence,
    studyUnit,
    studyUnitIndex: selection.studyUnitIndex,
    packageStudyUnitOptions,
    feedbackOpen,
    hasObservation,
    markedForReview,
    runtimeStatus
  });
}
