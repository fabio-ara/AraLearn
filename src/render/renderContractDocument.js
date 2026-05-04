function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCardHeader(card) {
  if (!card.title) {
    return "";
  }

  return '<header class="card-head"><h4>' + escapeHtml(card.title) + "</h4></header>";
}

function renderUnsupportedCard(card) {
  return (
    '<article class="card card-unsupported" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><p>Tipo ainda não renderizável nesta versão.</p></div>' +
    "</article>"
  );
}

function renderTextCard(card) {
  return (
    '<article class="card card-text" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><p>' +
    escapeHtml(card.text || "") +
    "</p></div></article>"
  );
}

function renderChoiceCard(card) {
  const options = [...(card.answer || []), ...(card.wrong || [])];
  const optionsHtml = options
    .map((option, index) => (
      '<label class="choice-option">' +
      '<input type="radio" disabled name="' +
      escapeHtml(card.id) +
      '" value="' +
      escapeHtml(String(index)) +
      '">' +
      '<span>' +
      escapeHtml(option) +
      "</span></label>"
    ))
    .join("");

  return (
    '<article class="card card-ask" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><p class="card-prompt">' +
    escapeHtml(card.ask || "") +
    '</p><form class="choice-group">' +
    optionsHtml +
    "</form></div></article>"
  );
}

function renderCompleteCard(card) {
  return (
    '<article class="card card-complete" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><p class="card-prompt">' +
    escapeHtml(card.text || "") +
    '</p><input class="card-input" type="text" disabled placeholder="' +
    escapeHtml(card.answer?.[0] || "") +
    '"></div></article>'
  );
}

function renderEditorCard(card) {
  return (
    '<article class="card card-code" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><pre><code data-language="' +
    escapeHtml(card.language || "text") +
    '">' +
    escapeHtml(card.code || "") +
    "</code></pre></div></article>"
  );
}

function renderTableCard(card) {
  const headHtml = (card.columns || []).map((column) => "<th>" + escapeHtml(column) + "</th>").join("");
  const rowsHtml = (card.rows || [])
    .map((row) => "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>")
    .join("");

  return (
    '<article class="card card-table" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><table>' +
    (headHtml ? "<thead><tr>" + headHtml + "</tr></thead>" : "") +
    "<tbody>" +
    rowsHtml +
    "</tbody></table></div></article>"
  );
}

function renderFlowCard(card) {
  const itemsHtml = (card.flow || [])
    .map((step) => {
      const [kind] = Object.keys(step);
      return "<li>" + escapeHtml(`${kind}: ${step[kind]}`) + "</li>";
    })
    .join("");

  return (
    '<article class="card card-flow" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><ol class="flow-list">' +
    itemsHtml +
    "</ol></div></article>"
  );
}

function renderImageCard(card) {
  return (
    '<article class="card card-image" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><figure><img src="' +
    escapeHtml(card.src || "") +
    '" alt="' +
    escapeHtml(card.alt || "") +
    '"></figure></div></article>'
  );
}

const CARD_RENDERERS = {
  text: renderTextCard,
  choice: renderChoiceCard,
  complete: renderCompleteCard,
  editor: renderEditorCard,
  table: renderTableCard,
  flow: renderFlowCard,
  image: renderImageCard
};

function renderCard(card) {
  const renderer = CARD_RENDERERS[card.type];
  return renderer ? renderer(card) : renderUnsupportedCard(card);
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
    microsequence.cards.map(renderCard).join("") +
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
