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

function buildHomeCoursePreviews(project, progress) {
  const primaryCourse = project.course;
  const primaryPreview = {
    key: primaryCourse.key,
    title: primaryCourse.title || "Curso",
    description: primaryCourse.description || "",
    moduleCount: (primaryCourse.modules || []).length,
    lessonCount: countLessons(primaryCourse),
    completedCount: countCompletedCardsInCourse(primaryCourse, progress),
    totalCount: countCardsInCourse(primaryCourse),
    isInteractive: true
  };

  const secondaryPreview = {
    key: "course-preview-matematica",
    title: "Matemática para Informática",
    description: "Disciplina ofertada em 2026 pelo Prof. João Vianei Tamanini para o curso de Tecnologia em Análise e Desenvolvimento de Sistemas no IFSP Campus São Paulo.",
    moduleCount: 2,
    lessonCount: 4,
    completedCount: 0,
    totalCount: 63,
    isInteractive: false
  };

  return [primaryPreview, secondaryPreview];
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
    '<button class="icon-ghost" type="button" data-action="edit-course" title="Ações" aria-label="Ações">&#9776;</button>' +
    "</header>"
  );
}

export function renderHomeScreen({ project, progress }) {
  const courses = buildHomeCoursePreviews(project, progress)
    .map((course) => {
      const actionButton =
        course.isInteractive
          ? '<button class="open-main" type="button" data-action="open-course" title="Abrir curso" aria-label="Abrir curso">&#9654;</button>'
          : '<button class="open-main" type="button" disabled aria-disabled="true" title="Prévia de curso" aria-label="Prévia de curso">&#9654;</button>';

      return (
        '<article class="clean-card course-card progress-card">' +
        '<div class="course-copy">' +
        '<h3 class="card-title">' +
        escapeHtml(course.title || "Curso") +
        "</h3>" +
        (course.description ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>" : "") +
        '<p class="muted tiny progress-meta">' +
        "Progresso: " +
        String(course.completedCount) +
        "/" +
        String(course.totalCount) +
        " · " +
        String(course.moduleCount) +
        " módulos · " +
        String(course.lessonCount) +
        " lições</p>" +
        "</div>" +
        '<div class="course-actions">' +
        '<button class="icon-ghost corner-btn" type="button" data-action="edit-course" title="Ações do curso" aria-label="Ações do curso">&ctdot;</button>' +
        actionButton +
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
