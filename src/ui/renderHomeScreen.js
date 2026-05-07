import { readLessonProgressEntry } from "../storage/progressStore.js";
import { isReadyMicrosequence } from "../model/microsequenceStatus.js";
import { renderUiIcon } from "./renderUiIcons.js";

const DRAFT_PLACEHOLDER_MICROSEQUENCE_KEY = "__draft-placeholder__";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function countLessons(course) {
  return (course.modules || []).reduce((total, moduleValue) => total + (moduleValue.lessons || []).length, 0);
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) => {
    if (microsequence?.key === DRAFT_PLACEHOLDER_MICROSEQUENCE_KEY) {
      return total;
    }
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

function buildHomeCoursePreviews(project, progress, featuredCourseKey = "") {
  return (project.courses || []).filter((course) => course?.key !== "__draft-course__").map((course) => {
    const completedCount = countCompletedCardsInCourse(course, progress);
    const totalCount = countCardsInCourse(course);
    return {
      key: course.key,
      title: course.title || "Curso",
      description: course.description || "",
      isFeatured: course.key === featuredCourseKey,
      moduleCount: (course.modules || []).length,
      lessonCount: countLessons(course),
      completedCount,
      totalCount,
      progressPercent: totalCount ? Math.max(0, Math.min(100, (completedCount / totalCount) * 100)) : 0
    };
  });
}

function getVisibleCourses(project) {
  return (project.courses || []).filter((course) => course?.key !== "__draft-course__");
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

function renderHomeTabs(activeHomeTab) {
  return (
    '<nav class="home-tabbar" aria-label="Tela inicial">' +
    '<button class="home-tab' +
    (activeHomeTab === "generate" ? " active" : "") +
    '" type="button" data-action="switch-home-tab" data-home-tab="generate" aria-pressed="' +
    (activeHomeTab === "generate" ? "true" : "false") +
    '">' +
    renderUiIcon("sparkles", "home-tab-icon") +
    '<span>Gerar</span></button>' +
    '<button class="home-tab' +
    (activeHomeTab === "courses" ? " active" : "") +
    '" type="button" data-action="switch-home-tab" data-home-tab="courses" aria-pressed="' +
    (activeHomeTab === "courses" ? "true" : "false") +
    '">' +
    renderUiIcon("lesson", "home-tab-icon") +
    '<span>Cursos</span></button>' +
    "</nav>"
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
        '</p><button type="button" data-action="view-generated-lesson">Ver na aba Cursos</button></section>'
      : "";

  return (
    '<section class="home-generate-pane">' +
    '<header class="generate-heading">' +
    '<h2>Gerar microssequências</h2>' +
    '<p>Escolha onde a dúvida se encaixa e gere rascunhos direto na estrutura do curso.</p>' +
    "</header>" +
    '<section class="clean-card generate-card">' +
    '<div class="generate-section-title">' + renderUiIcon("folder", "generate-section-icon") + "<h3>Contexto</h3></div>" +
    '<label class="field">Curso<select data-field="generate-course">' +
    renderCourseOptions(courses, draft.courseKey || "") +
    "</select></label>" +
    '<label class="field">Módulo<select data-field="generate-module"' +
    (!selectedCourse ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    renderModuleOptions(modules, draft.moduleKey || "") +
    "</select></label>" +
    '<label class="field">Lição<select data-field="generate-lesson"' +
    (!selectedModule ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    renderLessonOptions(lessons, draft.lessonKey || "") +
    "</select></label>" +
    '<div class="generate-divider"></div>' +
    '<div class="generate-section-title">' + renderUiIcon("prompt", "generate-section-icon") + "<h3>Dúvida ou comentário</h3></div>" +
    '<label class="field"><textarea data-field="generate-prompt" placeholder="Ex.: Como se faz soma de matrizes?">' +
    escapeHtml(draft.promptText || "") +
    "</textarea></label>" +
    '<div class="generate-divider"></div>' +
    '<div class="generate-section-title">' + renderUiIcon("intent", "generate-section-icon") + "<h3>Modelo</h3></div>" +
    '<label class="field"><select data-field="assist-model">' +
    modelOptions +
    "</select></label>" +
    '<button class="open-main generate-submit" type="button" data-action="generate-ladder"' +
    (!hasRequiredContext || draft.isSubmitting ? " disabled aria-disabled=\"true\"" : "") +
    ">" +
    renderUiIcon("sparkles", "generate-submit-icon") +
    '<span>Montar escada</span></button>' +
    "</section>" +
    status +
    "</section>"
  );
}

function renderCoursesPane({ project, progress, selection, featuredCourseKey = "" }) {
  const courses = buildHomeCoursePreviews(project, progress, featuredCourseKey)
    .map((course) => {
      return (
        '<article class="clean-card course-card progress-card' +
        (course.isFeatured ? " course-card-featured" : "") +
        '">' +
        '<div class="card-progress-fill" style="width:' +
        String(course.progressPercent) +
        '%"></div>' +
        '<div class="course-copy">' +
        '<h3 class="card-title' + (course.isFeatured ? " card-title-featured" : "") + '">' + escapeHtml(course.title || "Curso") + "</h3>" +
        (course.description
          ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>"
          : "") +
        renderHomeCourseMeta(course) +
        "</div>" +
        '<div class="course-actions">' +
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

export function renderHomeScreen({ project, progress, selection, featuredCourseKey = "", activeHomeTab = "generate", editorSupport = {} }) {
  const safeHomeTab = activeHomeTab === "courses" ? "courses" : "generate";

  return (
    '<section class="screen">' +
    renderCoursesTopbar() +
    '<main class="screen-content">' +
    renderHomeTabs(safeHomeTab) +
    (safeHomeTab === "generate"
      ? renderGeneratePane({ project, editorSupport })
      : renderCoursesPane({ project, progress, selection, featuredCourseKey })) +
    "</main>" +
    "</section>"
  );
}
