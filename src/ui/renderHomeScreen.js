import { readLessonProgressEntry } from "../storage/progressStore.js";
import { renderUiIcon } from "./renderUiIcons.js";

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
  return (lesson.microsequences || []).reduce((total, microsequence) => total + (microsequence.cards || []).length, 0);
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
  return (project.courses || []).map((course) => {
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

export function renderHomeScreen({ project, progress, selection, featuredCourseKey = "" }) {
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

  return (
    '<section class="screen">' +
    renderCoursesTopbar() +
    '<main class="screen-content">' +
    (courses || '<article class="clean-card"><p class="card-subtitle">Nenhum curso.</p></article>') +
    "</main>" +
    "</section>"
  );
}
