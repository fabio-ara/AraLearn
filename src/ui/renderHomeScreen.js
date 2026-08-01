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

function getStructureHandleTitle(level) {
  if (level === "course") return "Arrastar curso";
  if (level === "module") return "Arrastar módulo";
  if (level === "lesson") return "Arrastar lição";
  if (level === "microsequence") return "Arrastar microssequência";
  return "Arrastar item";
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
    escapeHtml(getStructureHandleTitle(level)) +
    '" aria-label="' +
    escapeHtml(label) +
    '">' +
    renderUiIcon("drag", "home-tab-icon") +
    "</button>"
  );
}

function entityId(entity) {
  return typeof entity?.id === "string" ? entity.id : "";
}

function cardsOfMicrosequence(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

function countLessons(course) {
  return (course.modules || []).reduce((total, moduleValue) => total + (moduleValue.lessons || []).length, 0);
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) => {
    if (!isRunnableMicrosequence(microsequence)) {
      return total;
    }
    return total + cardsOfMicrosequence(microsequence).length;
  }, 0);
}

function countCardsInCourse(course) {
  return (course.modules || []).reduce(
    (total, moduleValue) =>
      total +
      (moduleValue.lessons || []).reduce(
        (lessonTotal, lesson) => lessonTotal + countCardsInLesson(lesson),
        0
      ),
    0
  );
}

function countCompletedCardsInCourse(course, progress) {
  return (course.modules || []).reduce((total, moduleValue) => {
    return (
      total +
      (moduleValue.lessons || []).reduce((lessonTotal, lesson) => {
        const entry = readLessonProgressEntry(progress, {
          courseKey: entityId(course),
          moduleKey: entityId(moduleValue),
          lessonKey: entityId(lesson)
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

function summarizeIconTitle(label) {
  const value = String(label || "").trim();
  const match = value.match(/^[^:]+:\s*(.+)$/);
  return match ? match[1].trim() : value;
}

function renderMetaMetric(iconName, value, label) {
  return (
    '<span class="progress-meta-item" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(summarizeIconTitle(label)) +
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
      renderMetaMetric(
        "progress",
        `${course.completedCount}/${course.totalCount}`,
        `Progresso: ${course.completedCount}/${course.totalCount}`
      ),
      renderMetaMetric("module", String(course.moduleCount), formatCount(course.moduleCount, "módulo", "módulos")),
      renderMetaMetric("lesson", String(course.lessonCount), formatCount(course.lessonCount, "lição", "lições"))
    ].join('<span class="progress-meta-separator" aria-hidden="true">·</span>') +
    "</p>"
  );
}

function renderHomeCourseTitle(course) {
  const title = '<h3 class="card-title">' + escapeHtml(course.title || "Curso") + "</h3>";
  return (
    '<div class="course-title-row navigation-title-row">' +
    renderStructureHandle({
      level: "course",
      courseKey: course.id,
      label: `Arrastar curso ${course.title || course.id}`
    }) +
    title +
    "</div>"
  );
}

function buildHomeCoursePreviews(project, progress) {
  return (project.courses || []).map((course) => {
    const completedCount = countCompletedCardsInCourse(course, progress);
    const totalCount = countCardsInCourse(course);
    return {
      id: entityId(course),
      title: course.title || "Curso",
      description: course.goal || "",
      moduleCount: (course.modules || []).length,
      lessonCount: countLessons(course),
      completedCount,
      totalCount,
      progressPercent: totalCount
        ? Math.max(0, Math.min(100, (completedCount / totalCount) * 100))
        : 0
    };
  });
}

function renderCoursesTopbar() {
  return (
    '<header class="topbar home-topbar navigation-topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title">' +
    '<span class="brand-title">' +
    '<img class="brand-mark" src="assets/brand/aralearn-mark.png" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span>' +
    "</span>" +
    "</h1>" +
    '<div class="lesson-top-actions">' +
    '<button class="icon-ghost" type="button" data-action="open-authoring-assistant" title="Abrir autoria por Chatbot/MCP" aria-label="Abrir autoria por Chatbot/MCP">' +
    renderUiIcon("sparkles", "home-tab-icon") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="quick-create-course" title="Criar curso vazio" aria-label="Criar curso vazio">' +
    renderUiIcon("add", "home-tab-icon") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="future-sync" title="Abrir biblioteca e sincronização" aria-label="Abrir biblioteca e sincronização">' +
    renderUiIcon("cloud", "home-tab-icon") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="open-home-actions" title="Ações do app" aria-label="Ações do app">' +
    renderUiIcon("more", "home-tab-icon") +
    "</button>" +
    "</div>" +
    "</header>"
  );
}

function renderNavigationContextHeading(title) {
  return (
    '<section class="section-heading-row centered-section-heading-row navigation-heading-row">' +
    '<h2 class="section-heading">' +
    escapeHtml(title) +
    "</h2></section>"
  );
}

function renderCoursePreview(course) {
  return (
    '<article class="clean-card course-card progress-card navigation-list-card" data-structure-target="course" data-course-key="' +
    escapeHtml(course.id) +
    '">' +
    '<div class="card-progress-fill" style="width:' +
    String(course.progressPercent) +
    '%"></div>' +
    '<div class="course-copy navigation-main">' +
    renderHomeCourseTitle(course) +
    (course.description ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>" : "") +
    "</div>" +
    renderHomeCourseMeta(course) +
    '<div class="course-actions navigation-actions">' +
    '<button class="icon-ghost corner-btn" type="button" data-action="open-course-actions" data-course-key="' +
    escapeHtml(course.id) +
    '" title="Ações do curso" aria-label="Ações do curso">' +
    renderUiIcon("more", "home-tab-icon") +
    "</button>" +
    '<button class="open-main" type="button" data-action="open-course" data-course-key="' +
    escapeHtml(course.id) +
    '" title="Abrir curso" aria-label="Abrir curso">' +
    renderUiIcon("play", "home-tab-icon") +
    "</button>" +
    "</div>" +
    "</article>"
  );
}

function renderCoursesPane({ project, progress, editorSupport }) {
  const courses = buildHomeCoursePreviews(project, progress);
  const paths = Array.isArray(editorSupport.studyPaths) ? editorSupport.studyPaths : [];
  if (paths.length) {
    const coursesById = new Map(courses.map((course) => [course.id, course]));
    const assigned = new Set();
    const pathSections = paths
      .map((path) => {
        const pathCourses = (path.courses || []).map((item) => coursesById.get(item.courseId)).filter(Boolean);
        pathCourses.forEach((course) => assigned.add(course.id));
        return (
          '<section class="home-study-path">' +
          '<div class="centered-section-heading-row home-study-path-heading">' +
          renderUiIcon("trail", "home-study-path-icon") +
          '<h2 class="section-heading">' +
          escapeHtml(path.title || "Trilha") +
          "</h2></div>" +
          '<div class="navigation-list home-study-path-courses">' +
          (pathCourses.map(renderCoursePreview).join("") ||
            '<p class="empty-state-copy home-study-path-empty">Sem cursos.</p>') +
          "</div></section>"
        );
      })
      .join("");
    const unassigned = courses.filter((course) => !assigned.has(course.id));
    return (
      pathSections +
      (unassigned.length
        ? '<section class="home-study-path"><div class="centered-section-heading-row home-study-path-heading">' +
          '<h2 class="section-heading">Outros</h2></div><div class="navigation-list home-study-path-courses">' +
          unassigned.map(renderCoursePreview).join("") +
          "</div></section>"
        : "")
    );
  }

  const courseMarkup = courses.map(renderCoursePreview).join("");
  return courseMarkup || '<article class="clean-card"><p class="empty-state-copy">Nenhum curso.</p></article>';
}

export function renderHomeScreen({ project, progress, editorSupport = {} }) {
  return (
    '<section class="screen">' +
    renderCoursesTopbar() +
    '<main class="screen-content courses-home-screen navigation-screen">' +
    renderNavigationContextHeading(editorSupport.studyPaths?.length ? "Trilhas" : "Cursos") +
    '<section class="courses-home-list navigation-list" data-structure-collection="course">' +
    renderCoursesPane({ project, progress, editorSupport }) +
    "</section>" +
    "</main></section>"
  );
}
