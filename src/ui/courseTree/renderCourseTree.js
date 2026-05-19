function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMicrosequenceItem(selection, course, moduleValue, lesson, microsequence) {
  const selected = selection?.microsequenceKey === microsequence.key;
  return (
    '<button class="tree-item tree-item-microsequence' +
    (selected ? " is-selected" : "") +
    '" type="button" data-action="select-microsequence" data-course-key="' +
    escapeHtml(course.key) +
    '" data-module-key="' +
    escapeHtml(moduleValue.key) +
    '" data-lesson-key="' +
    escapeHtml(lesson.key) +
    '" data-microsequence-key="' +
    escapeHtml(microsequence.key) +
    '">' +
    '<span class="tree-item-main">' +
    escapeHtml(microsequence.title) +
    '</span><span class="tree-status-badge" data-status="' +
    escapeHtml(microsequence.status) +
    '">' +
    escapeHtml(microsequence.status) +
    "</span></button>"
  );
}

export function renderCourseTree(project, selection) {
  const courses = Array.isArray(project?.courses) ? project.courses : [];
  if (!courses.length) {
    return '<aside class="course-tree-panel"><div class="empty-panel"><p>Nenhuma trilha criada ainda.</p></div></aside>';
  }

  return (
    '<aside class="course-tree-panel">' +
    '<div class="panel-header"><div><p class="eyebrow">Trilha</p><h2>Cursos</h2></div></div>' +
    courses
      .map(
        (course) =>
          '<section class="tree-course-group"><h3>' +
          escapeHtml(course.title) +
          "</h3>" +
          (course.modules || [])
            .map(
              (moduleValue) =>
                '<div class="tree-module-group"><h4>' +
                escapeHtml(moduleValue.title) +
                "</h4>" +
                (moduleValue.lessons || [])
                  .map(
                    (lesson) =>
                      '<div class="tree-lesson-group"><h5>' +
                      escapeHtml(lesson.title) +
                      "</h5>" +
                      (lesson.microsequences || [])
                        .map((microsequence) => renderMicrosequenceItem(selection, course, moduleValue, lesson, microsequence))
                        .join("") +
                      "</div>"
                  )
                  .join("") +
                "</div>"
            )
            .join("") +
          "</section>"
      )
      .join("") +
    "</aside>"
  );
}

