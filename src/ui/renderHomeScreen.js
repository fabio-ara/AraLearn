import { readLessonProgressEntry } from "../storage/progressStore.js";
import { isReadyMicrosequence } from "../model/microsequenceStatus.js";
import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStructureHandle({ level, courseKey, moduleKey = "", lessonKey = "", microsequenceKey = "", label }) {
  return (
    '<button class="icon-ghost tiny-icon builder-tool-handle" type="button" draggable="true" data-action="structure-drag-handle" data-structure-level="' +
    escapeHtml(level) +
    '" data-course-key="' +
    escapeHtml(courseKey || "") +
    '" data-module-key="' +
    escapeHtml(moduleKey) +
    '" data-lesson-key="' +
    escapeHtml(lessonKey) +
    '" data-microsequence-key="' +
    escapeHtml(microsequenceKey) +
    '" title="' +
    escapeHtml(label) +
    '" aria-label="' +
    escapeHtml(label) +
    '">&#9776;</button>'
  );
}

function countLessons(course) {
  return (course.modules || []).reduce((total, moduleValue) => total + (moduleValue.lessons || []).length, 0);
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) => {
    if (!isReadyMicrosequence(microsequence)) {
      return total;
    }
    return total + (microsequence.cards || []).length;
  }, 0);
}

function countCardsInCourse(course) {
  return (course.modules || []).reduce(
    (total, moduleValue) => total + (moduleValue.lessons || []).reduce((lessonTotal, lesson) => lessonTotal + countCardsInLesson(lesson), 0),
    0
  );
}

function countCompletedCardsInCourse(course, progress) {
  return (course.modules || []).reduce((total, moduleValue) => {
    return (
      total +
      (moduleValue.lessons || []).reduce((lessonTotal, lesson) => {
        const entry = readLessonProgressEntry(progress, {
          courseKey: course.key,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key
        });
        const completed = entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys.length : 0;
        return lessonTotal + completed;
      }, 0)
    );
  }, 0);
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderMetaMetric(iconName, value, label) {
  return (
    '<span class="progress-meta-item" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(label) +
    '">' +
    renderUiIcon(iconName, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' +
    escapeHtml(value) +
    "</span></span>"
  );
}

function renderHomeCourseMeta(course) {
  return (
    '<p class="muted tiny progress-meta">' +
    [
      renderMetaMetric("progress", `${course.completedCount}/${course.totalCount}`, `Progresso: ${course.completedCount}/${course.totalCount}`),
      renderMetaMetric("module", String(course.moduleCount), formatCount(course.moduleCount, "módulo", "módulos")),
      renderMetaMetric("lesson", String(course.lessonCount), formatCount(course.lessonCount, "lição", "lições"))
    ].join('<span class="progress-meta-separator" aria-hidden="true">·</span>') +
    "</p>"
  );
}

function buildHomeCoursePreviews(project, progress) {
  return (project.courses || []).map((course) => {
    const completedCount = countCompletedCardsInCourse(course, progress);
    const totalCount = countCardsInCourse(course);
    return {
      key: course.key,
      title: course.title || "Curso",
      description: course.description || "",
      moduleCount: (course.modules || []).length,
      lessonCount: countLessons(course),
      completedCount,
      totalCount,
      progressPercent: totalCount ? Math.max(0, Math.min(100, (completedCount / totalCount) * 100)) : 0
    };
  });
}

function getVisibleCourses(project) {
  return project.courses || [];
}

function renderCoursesTopbar() {
  return (
    '<header class="topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title">' +
    '<span class="brand-title">' +
    '<img class="brand-mark" src="/public/assets/brand/aralearn-mark.png" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span>' +
    "</span>" +
    "</h1>" +
    '<button class="icon-ghost" type="button" data-action="open-home-actions" title="Ações" aria-label="Ações">&#9776;</button>' +
    "</header>"
  );
}

export function renderHomeTabs(activeHomeTab) {
  return (
    '<nav class="home-tabbar" role="tablist" aria-label="Tela inicial">' +
    '<button class="home-tab' +
    (activeHomeTab === "generate" ? " active" : "") +
    '" id="home-tab-generate" type="button" role="tab" data-action="switch-home-tab" data-home-tab="generate" aria-controls="home-panel-generate" aria-selected="' +
    (activeHomeTab === "generate" ? "true" : "false") +
    '" aria-label="Gerar" title="Gerar">' +
    renderUiIcon("sparkles", "home-tab-icon") +
    "</button>" +
    '<button class="home-tab' +
    (activeHomeTab === "courses" ? " active" : "") +
    '" id="home-tab-courses" type="button" role="tab" data-action="switch-home-tab" data-home-tab="courses" aria-controls="home-panel-courses" aria-selected="' +
    (activeHomeTab === "courses" ? "true" : "false") +
    '" aria-label="Cursos" title="Cursos">' +
    renderUiIcon("lesson", "home-tab-icon") +
    "</button>" +
    "</nav>"
  );
}

function renderGenerateIconLabel(iconName, label) {
  return (
    '<span class="generate-icon-label" aria-hidden="true" title="' +
    escapeHtml(label) +
    '">' +
    renderUiIcon(iconName, "generate-field-icon") +
    "</span>"
  );
}

function renderCourseOptions(courses, selectedCourseKey) {
  return [
    '<option value="">Selecione um curso</option>',
    ...courses.map((course) => (
      '<option value="' +
      escapeHtml(course.key) +
      '"' +
      (course.key === selectedCourseKey ? " selected" : "") +
      ">" +
      escapeHtml(course.title || course.key) +
      "</option>"
    ))
  ].join("");
}

function renderModuleOptions(modules, selectedModuleKey) {
  return [
    '<option value="">Selecione um módulo</option>',
    ...modules.map((moduleValue) => (
      '<option value="' +
      escapeHtml(moduleValue.key) +
      '"' +
      (moduleValue.key === selectedModuleKey ? " selected" : "") +
      ">" +
      escapeHtml(moduleValue.title || moduleValue.key) +
      "</option>"
    ))
  ].join("");
}

function renderLessonOptions(lessons, selectedLessonKey) {
  return [
    '<option value="">Selecione uma lição</option>',
    ...lessons.map((lesson) => (
      '<option value="' +
      escapeHtml(lesson.key) +
      '"' +
      (lesson.key === selectedLessonKey ? " selected" : "") +
      ">" +
      escapeHtml(lesson.title || lesson.key) +
      "</option>"
    ))
  ].join("");
}

function renderGeneratePane({ project, editorSupport }) {
  const courses = getVisibleCourses(project);
  const draft = editorSupport.generationDraft || {};
  const selectedCourse = courses.find((course) => course.key === draft.courseKey) || null;
  const modules = selectedCourse?.modules || [];
  const selectedModule = modules.find((moduleValue) => moduleValue.key === draft.moduleKey) || null;
  const lessons = selectedModule?.lessons || [];
  const hasRequiredContext = !!draft.courseKey && !!draft.moduleKey && !!draft.lessonKey && !!String(draft.promptText || "").trim();
  const modelOptions = (editorSupport.modelOptions || [])
    .map((item) => (
      '<option value="' +
      escapeHtml(item.value) +
      '"' +
      (item.value === editorSupport.selectedModel ? " selected" : "") +
      ">" +
      escapeHtml(item.label) +
      "</option>"
    ))
    .join("");
  const status = draft.errorMessage
    ? '<section class="generate-feedback is-warning"><p>' + escapeHtml(draft.errorMessage) + "</p></section>"
    : draft.lastResult
      ? '<section class="generate-feedback"><p>' +
        escapeHtml(draft.lastResult.message || "") +
        '</p><button type="button" data-action="view-generated-lesson">Abrir em Cursos</button></section>'
      : "";

  return (
    '<section class="home-generate-pane" id="home-panel-generate" role="tabpanel" aria-labelledby="home-tab-generate">' +
    '<section class="clean-card generate-card">' +
    '<label class="field generate-icon-field">' +
    renderGenerateIconLabel("folder", "Curso") +
    '<select data-field="generate-course" aria-label="Curso" title="Curso">' +
    renderCourseOptions(courses, draft.courseKey || "") +
    "</select></label>" +
    '<label class="field generate-icon-field">' +
    renderGenerateIconLabel("module", "Módulo") +
    '<select data-field="generate-module" aria-label="Módulo" title="Módulo"' +
    (!selectedCourse ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    renderModuleOptions(modules, draft.moduleKey || "") +
    "</select></label>" +
    '<label class="field generate-icon-field">' +
    renderGenerateIconLabel("lesson", "Lição") +
    '<select data-field="generate-lesson" aria-label="Lição" title="Lição"' +
    (!selectedModule ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    renderLessonOptions(lessons, draft.lessonKey || "") +
    "</select></label>" +
    '<div class="generate-divider"></div>' +
    '<label class="field generate-icon-field generate-prompt-field">' +
    renderGenerateIconLabel("prompt", "Dúvida ou comentário") +
    '<textarea data-field="generate-prompt" aria-label="Dúvida ou comentário" title="Dúvida ou comentário" placeholder="Ex.: Como se faz soma de matrizes?">' +
    escapeHtml(draft.promptText || "") +
    "</textarea></label>" +
    '<div class="generate-divider"></div>' +
    '<div class="generate-action-row">' +
    '<label class="field generate-icon-field generate-model-field">' +
    renderGenerateIconLabel("intent", "Modelo") +
    '<select data-field="assist-model" aria-label="Modelo" title="Modelo">' +
    modelOptions +
    "</select></label>" +
    '<button class="open-main generate-submit" type="button" data-action="generate-ladder" aria-label="Gerar microssequências" title="Gerar microssequências"' +
    (!hasRequiredContext || draft.isSubmitting ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    renderUiIcon("sparkles", "generate-submit-icon") +
    "</button>" +
    "</div>" +
    "</section>" +
    status +
    "</section>"
  );
}

function renderCoursesPane({ project, progress, selection }) {
  const courses = buildHomeCoursePreviews(project, progress)
    .map((course) => {
      return (
        '<article class="clean-card course-card progress-card" data-structure-target="course" data-course-key="' +
        escapeHtml(course.key) +
        '">' +
        '<div class="card-progress-fill" style="width:' +
        String(course.progressPercent) +
        '%"></div>' +
        '<div class="course-copy">' +
        '<h3 class="card-title">' + escapeHtml(course.title || "Curso") + "</h3>" +
        (course.description
          ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>"
          : "") +
        renderHomeCourseMeta(course) +
        "</div>" +
        '<div class="course-actions">' +
        renderStructureHandle({
          level: "course",
          courseKey: course.key,
          label: `Arrastar curso ${course.title || course.key}`
        }) +
        '<button class="icon-ghost corner-btn" type="button" data-action="open-course-actions" data-course-key="' +
        escapeHtml(course.key) +
        '" title="Ações do curso" aria-label="Ações do curso">&ctdot;</button>' +
        '<button class="open-main" type="button" data-action="open-course" data-course-key="' +
        escapeHtml(course.key) +
        '" title="Abrir curso" aria-label="Abrir curso">&#9654;</button>' +
        "</div>" +
        "</article>"
      );
    })
    .join("");

  return courses || '<article class="clean-card"><p class="card-subtitle">Nenhum curso.</p></article>';
}

export function renderHomeScreen({ project, progress, selection, activeHomeTab = "generate", editorSupport = {} }) {
  const safeHomeTab = activeHomeTab === "courses" ? "courses" : "generate";

  return (
    '<section class="screen">' +
    renderCoursesTopbar() +
    renderHomeTabs(safeHomeTab) +
    '<main class="screen-content">' +
    (safeHomeTab === "generate"
      ? renderGeneratePane({ project, editorSupport })
      : '<section id="home-panel-courses" role="tabpanel" aria-labelledby="home-tab-courses" data-structure-collection="course">' +
        renderCoursesPane({ project, progress, selection }) +
        "</section>") +
    "</main>" +
    "</section>"
  );
}
