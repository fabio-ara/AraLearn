import { renderCardRuntimeArticle } from "./renderCardRuntime.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMicrosequence(microsequence) {
  return (
    '<section class="microsequence" data-microsequence-id="' +
    escapeHtml(microsequence.id) +
    '">' +
    '<header class="microsequence-head"><h3>' +
    escapeHtml(microsequence.title) +
    "</h3></header>" +
    '<div class="microsequence-cards">' +
    microsequence.cards.map((card) => renderCardRuntimeArticle(card)).join("") +
    "</div></section>"
  );
}

export function renderContractDocument(compiledDocument) {
  const coursesHtml = compiledDocument.courses
    .map((course) => (
      '<section class="course" data-course-id="' +
      escapeHtml(course.id) +
      '">' +
      '<header class="course-head"><h1>' +
      escapeHtml(course.title) +
      "</h1></header>" +
      course.modules
        .map((moduleValue) => (
          '<section class="module" data-module-id="' +
          escapeHtml(moduleValue.id) +
          '">' +
          "<header><h1>" +
          escapeHtml(moduleValue.title) +
          "</h1></header>" +
          moduleValue.lessons
            .map((lesson) => (
              '<section class="lesson" data-lesson-id="' +
              escapeHtml(lesson.id) +
              '">' +
              "<header><h2>" +
              escapeHtml(lesson.title) +
              "</h2></header>" +
              lesson.microsequences.map(renderMicrosequence).join("") +
              "</section>"
            ))
            .join("") +
          "</section>"
        ))
        .join("") +
      "</section>"
    ))
    .join("");

  return '<main class="aralearn-document">' + coursesHtml + "</main>";
}
