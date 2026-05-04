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
  const lessons = progress && progress.lessons ? progress.lessons : {};

  return (course.modules || []).reduce((total, moduleValue) => {
    return (
      total +
      (moduleValue.lessons || []).reduce((lessonTotal, lesson) => {
        const entry = lessons[lesson.key];
        const completed = entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys.length : 0;
        return lessonTotal + completed;
      }, 0)
    );
  }, 0);
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildHomeCoursePreviews(project, progress, featuredCourseKey = "") {
  return (project.courses || []).map((course) => {
    return {
      key: course.key,
      title: course.title || "Curso",
      description: course.description || "",
      isFeatured: course.key === featuredCourseKey,
      moduleCount: (course.modules || []).length,
      lessonCount: countLessons(course),
      completedCount: countCompletedCardsInCourse(course, progress),
      totalCount: countCardsInCourse(course)
    };
  });
}

function renderCoursesTopbar(currentCourseKey = "") {
  return (
    '<header class="topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title">' +
    '<span class="brand-title">' +
    '<img class="brand-mark" src="/public/assets/brand/aralearn-mark.png" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span>' +
    "</span>" +
    "</h1>" +
    '<button class="icon-ghost" type="button" data-action="edit-course" data-course-key="' +
    escapeHtml(currentCourseKey) +
    '" title="Ações" aria-label="Ações">&#9776;</button>' +
    "</header>"
  );
}

export function renderHomeScreen({ project, progress, selection, featuredCourseKey = "" }) {
  const currentCourseKey = selection?.courseKey || ((project.courses || [])[0]?.key ?? "");
  const courses = buildHomeCoursePreviews(project, progress, featuredCourseKey)
    .map((course) => {
      return (
        '<article class="clean-card course-card progress-card' +
        (course.isFeatured ? " course-card-featured" : "") +
        '">' +
        '<div class="course-copy">' +
        '<h3 class="card-title' + (course.isFeatured ? " card-title-featured" : "") + '">' + escapeHtml(course.title || "Curso") + "</h3>" +
        (course.description
          ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>"
          : "") +
        '<p class="muted tiny progress-meta">' +
        "Progresso: " +
        String(course.completedCount) +
        "/" +
        String(course.totalCount) +
        " · " +
        formatCount(course.moduleCount, "módulo", "módulos") +
        " · " +
        formatCount(course.lessonCount, "lição", "lições") +
        "</p>" +
        "</div>" +
        '<div class="course-actions">' +
        '<button class="icon-ghost corner-btn" type="button" data-action="edit-course" data-course-key="' +
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
    renderCoursesTopbar(currentCourseKey) +
    '<main class="screen-content">' +
    (courses || '<article class="clean-card"><p class="card-subtitle">Nenhum curso.</p></article>') +
    "</main>" +
    "</section>"
  );
}
