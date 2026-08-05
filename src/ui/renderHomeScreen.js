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

function buildHomeCoursePreviews(
  project,
  progress,
  permissionsById = {},
  summaries = []
) {
  const originByCourseId = new Map();
  const summaryByCourseId = new Map();
  for (const summary of summaries) {
    const origin = summary?.courseOrigin === "catalog" ? "catalog" : "private";
    for (const identity of [summary?.courseId, summary?.courseKey]) {
      if (!identity) continue;
      originByCourseId.set(String(identity), origin);
      summaryByCourseId.set(String(identity), summary);
    }
  }
  return (project.courses || []).map((course) => {
    const summary = summaryByCourseId.get(entityId(course)) || {};
    const completedCount = countCompletedCardsInCourse(course, progress);
    const totalCount = countCardsInCourse(course);
    return {
      id: entityId(course),
      courseId: String(summary.courseId || entityId(course)),
      title: course.title || "Curso",
      description: course.goal || "",
      moduleCount: (course.modules || []).length,
      lessonCount: countLessons(course),
      completedCount,
      totalCount,
      permissions: permissionsById[entityId(course)] || {
        role: "learner",
        canEdit: false,
        canDelete: false
      },
      origin: originByCourseId.get(entityId(course)) || "private",
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
    '<img class="brand-mark" src="assets/brand/aralearn-mark-monochrome.svg" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span>' +
    "</span>" +
    "</h1>" +
    '<div class="lesson-top-actions">' +
    '<button class="icon-ghost" type="button" data-action="open-central" title="Abrir painel" aria-label="Abrir painel">' +
    renderUiIcon("cloud", "home-tab-icon") +
    "</button>" +
    "</div>" +
    "</header>"
  );
}

function renderCourseOrigin(course) {
  const catalog = course.origin === "catalog";
  return (
    '<span class="home-course-origin is-' + (catalog ? "catalog" : "private") +
    '" title="' + (catalog ? "Curso de Coleções" : "Curso privado") +
    '" aria-label="' + (catalog ? "Curso de Coleções" : "Curso privado") + '">' +
    renderUiIcon(catalog ? "folder" : "key", "home-course-origin-icon") +
    "</span>"
  );
}

function renderCourseUtilities(course) {
  const edit = course.permissions.canEdit
    ? '<button class="icon-ghost" type="button" data-action="edit-course" data-course-key="' +
      escapeHtml(course.id) + '" title="Editar curso" aria-label="Editar curso">' +
      renderUiIcon("edit", "home-tab-icon") + "</button>"
    : "";
  const remove = course.permissions.canDelete
    ? '<button class="icon-ghost is-danger" type="button" data-action="delete-course-direct" data-course-key="' +
      escapeHtml(course.id) + '" title="Excluir curso" aria-label="Excluir curso">' +
      renderUiIcon("trash", "home-tab-icon") + "</button>"
    : "";
  return (
    '<details class="home-course-context-menu">' +
    '<summary class="icon-ghost" title="Ações do curso" aria-label="Ações do curso">' +
    renderUiIcon("more", "home-tab-icon") + "</summary>" +
    '<div class="home-course-context-actions">' +
    '<button class="icon-ghost" type="button" data-action="reset-course-progress-direct" data-course-key="' +
    escapeHtml(course.id) + '" title="Zerar progresso do curso" aria-label="Zerar progresso do curso">' +
    renderUiIcon("rotate", "home-tab-icon") + "</button>" +
    edit + remove +
    "</div></details>"
  );
}

function reviewItemsForCourse(reviewItems, courseKey) {
  if (!Array.isArray(reviewItems)) return [];
  return reviewItems.flatMap((item) => {
    const entityPath = Array.isArray(item?.entityPath) ? item.entityPath : [];
    if (
      entityPath.length !== 5
      || entityPath.some((id) => typeof id !== "string" || !id)
      || entityPath[0] !== courseKey
    ) return [];
    return [{
      entityPath,
      title: typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : "Card para rever",
      context: typeof item.context === "string" ? item.context.trim() : ""
    }];
  });
}

function renderCourseReviewMenu(reviewItems) {
  if (!reviewItems.length) return "";
  return (
    '<details class="learning-spaces-context-menu home-course-review-menu">' +
    '<summary class="learning-spaces-context-menu-summary" title="Cards para rever" aria-label="Cards para rever">' +
    renderUiIcon("review", "home-tab-icon") + "</summary>" +
    '<div class="learning-spaces-context-menu-list home-course-review-list" role="menu" aria-label="Cards marcados para rever">' +
    reviewItems.map((item) => {
      const [courseKey, moduleKey, lessonKey, microsequenceKey, cardKey] = item.entityPath;
      const accessibleLabel = `Abrir card para rever: ${item.title}${item.context ? ` — ${item.context}` : ""}`;
      return (
        '<button class="learning-spaces-context-menu-item" type="button" role="menuitem" data-action="open-review-card"' +
        ' data-course-key="' + escapeHtml(courseKey) + '"' +
        ' data-module-key="' + escapeHtml(moduleKey) + '"' +
        ' data-lesson-key="' + escapeHtml(lessonKey) + '"' +
        ' data-microsequence-key="' + escapeHtml(microsequenceKey) + '"' +
        ' data-card-key="' + escapeHtml(cardKey) + '"' +
        ' title="' + escapeHtml(accessibleLabel) + '" aria-label="' + escapeHtml(accessibleLabel) + '">' +
        renderUiIcon("review", "home-tab-icon") +
        '<span>' + escapeHtml(item.title) + "</span></button>"
      );
    }).join("") +
    "</div></details>"
  );
}

function renderCoursePreview(course, reviewItems = []) {
  return (
    '<article class="home-course-selector-preview" data-course-key="' +
    escapeHtml(course.id) +
    '">' +
    '<div class="home-course-selector-heading">' + renderCourseOrigin(course) +
    '<h2>' + escapeHtml(course.title || "Curso") + "</h2></div>" +
    (course.description ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>" : "") +
    renderHomeCourseMeta(course) +
    '<div class="home-course-selector-actions">' + renderCourseReviewMenu(reviewItems) +
    renderCourseUtilities(course) +
    '<button class="open-main" type="button" data-action="open-course" data-course-key="' +
    escapeHtml(course.id) +
    '" title="Abrir curso" aria-label="Abrir curso">' +
    renderUiIcon("play", "home-tab-icon") +
    "</button>" +
    "</div>" +
    "</article>"
  );
}

function buildCourseGroups(courses, paths) {
  const coursesById = new Map();
  courses.forEach((course) => {
    coursesById.set(course.id, course);
    coursesById.set(course.courseId, course);
  });
  const assigned = new Set();
  const groups = [];
  for (const path of paths) {
    const items = (path.courses || [])
      .map((item) => coursesById.get(String(item.courseId || "")))
      .filter((course) => course && !assigned.has(course.id));
    items.forEach((course) => assigned.add(course.id));
    if (items.length) groups.push({ title: path.title || "Trilha", courses: items });
  }
  const remaining = courses.filter((course) => !assigned.has(course.id));
  if (remaining.length) groups.push({ title: paths.length ? "Outros" : "Trilhas", courses: remaining });
  return groups;
}

function renderCourseOptions(groups, selectedCourseId) {
  return groups.map((group) => (
    '<optgroup label="' + escapeHtml(group.title) + '">' +
    group.courses.map((course) => (
      '<option value="' + escapeHtml(course.id) + '"' +
      (course.id === selectedCourseId ? " selected" : "") + '>' +
      escapeHtml(course.title || "Curso") + "</option>"
    )).join("") + "</optgroup>"
  )).join("");
}

function renderCoursesPane({ project, progress, editorSupport }) {
  const courses = buildHomeCoursePreviews(
    project,
    progress,
    editorSupport.coursePermissionsById,
    editorSupport.courseSummaries
  );
  const paths = Array.isArray(editorSupport.studyPaths) ? editorSupport.studyPaths : [];
  if (!courses.length) {
    return '<article class="home-course-selector-empty"><p class="empty-state-copy">Nenhum curso em Trilhas.</p></article>';
  }
  const groups = buildCourseGroups(courses, paths);
  const requestedCourseId = String(editorSupport.selectedHomeCourseKey || "");
  const selected = courses.find((course) => course.id === requestedCourseId) || courses[0];
  const reviewItems = reviewItemsForCourse(editorSupport.reviewItems, selected.id);
  return (
    '<section class="home-course-selector-card">' +
    '<label class="sr-only" for="home-course-select">Curso</label>' +
    '<select id="home-course-select" data-field="home-course-select" aria-label="Selecionar curso">' +
    renderCourseOptions(groups, selected.id) + "</select>" +
    renderCoursePreview(selected, reviewItems) +
    "</section>"
  );
}

export function renderHomeScreen({ project, progress, editorSupport = {} }) {
  return (
    '<section class="screen">' +
    renderCoursesTopbar() +
    '<main class="screen-content courses-home-screen navigation-screen">' +
    '<section class="courses-home-list">' +
    renderCoursesPane({ project, progress, editorSupport }) +
    "</section>" +
    "</main></section>"
  );
}
