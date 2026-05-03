function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderUnsupportedCard(card) {
  return (
    '<article class="card card-unsupported" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    '<header class="card-head"><h4>' +
    escapeHtml(card.title || card.key) +
    "</h4></header>" +
    '<div class="card-body"><p>Intenção ainda não renderizável nesta fase.</p></div>' +
    "</article>"
  );
}

function renderTextCard(card) {
  const text = card.data && typeof card.data.text === "string" ? card.data.text : "";
  return (
    '<article class="card card-text" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><p>' +
    escapeHtml(text) +
    "</p></div></article>"
  );
}

function renderAskCard(card) {
  const prompt = card.data && typeof card.data.prompt === "string" ? card.data.prompt : "";
  const options = card.data && Array.isArray(card.data.options) ? card.data.options : [];

  const optionsHtml = options
    .map((option, index) => {
      return (
        '<label class="choice-option">' +
        '<input type="radio" disabled name="' +
        escapeHtml(card.id) +
        '" value="' +
        escapeHtml(String(index)) +
        '">' +
        '<span>' +
        escapeHtml(option) +
        "</span></label>"
      );
    })
    .join("");

  return (
    '<article class="card card-ask" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><p class="card-prompt">' +
    escapeHtml(prompt) +
    "</p>" +
    '<form class="choice-group">' +
    optionsHtml +
    "</form></div></article>"
  );
}

function renderCompleteCard(card) {
  const prompt = card.data && typeof card.data.prompt === "string" ? card.data.prompt : "";
  const placeholder = card.data && typeof card.data.placeholder === "string" ? card.data.placeholder : "";

  return (
    '<article class="card card-complete" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><p class="card-prompt">' +
    escapeHtml(prompt) +
    "</p>" +
    '<input class="card-input" type="text" disabled placeholder="' +
    escapeHtml(placeholder) +
    '">' +
    "</div></article>"
  );
}

function renderCodeCard(card) {
  const language = card.data && typeof card.data.language === "string" ? card.data.language : "text";
  const code = card.data && typeof card.data.code === "string" ? card.data.code : "";

  return (
    '<article class="card card-code" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><pre><code data-language="' +
    escapeHtml(language) +
    '">' +
    escapeHtml(code) +
    "</code></pre></div></article>"
  );
}

function renderTableCard(card) {
  const columns = card.data && Array.isArray(card.data.columns) ? card.data.columns : [];
  const rows = card.data && Array.isArray(card.data.rows) ? card.data.rows : [];

  const headHtml = columns.map((column) => "<th>" + escapeHtml(column) + "</th>").join("");
  const rowsHtml = rows
    .map((row) => {
      const cells = Array.isArray(row) ? row : [];
      return "<tr>" + cells.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>";
    })
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
  const steps = card.data && Array.isArray(card.data.steps) ? card.data.steps : [];
  const itemsHtml = steps.map((step) => "<li>" + escapeHtml(step) + "</li>").join("");

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
  const src = card.data && typeof card.data.src === "string" ? card.data.src : "";
  const alt = card.data && typeof card.data.alt === "string" ? card.data.alt : "";

  return (
    '<article class="card card-image" data-card-id="' +
    escapeHtml(card.id) +
    '">' +
    renderCardHeader(card) +
    '<div class="card-body"><figure><img src="' +
    escapeHtml(src) +
    '" alt="' +
    escapeHtml(alt) +
    '"></figure></div></article>'
  );
}

function renderCardHeader(card) {
  if (!card.title) return "";
  return '<header class="card-head"><h4>' + escapeHtml(card.title) + "</h4></header>";
}

const CARD_RENDERERS = {
  text: renderTextCard,
  ask: renderAskCard,
  complete: renderCompleteCard,
  code: renderCodeCard,
  table: renderTableCard,
  flow: renderFlowCard,
  image: renderImageCard
};

function renderCard(card) {
  const renderer = CARD_RENDERERS[card.intent];
  return renderer ? renderer(card) : renderUnsupportedCard(card);
}

function renderMicrosequence(microsequence) {
  const cardsHtml = microsequence.cards.map(renderCard).join("");

  return (
    '<section class="microsequence" data-microsequence-id="' +
    escapeHtml(microsequence.id) +
    '">' +
    '<header class="microsequence-head">' +
    (microsequence.title ? "<h3>" + escapeHtml(microsequence.title) + "</h3>" : "") +
    '<p class="microsequence-objective">' +
    escapeHtml(microsequence.objective) +
    "</p></header>" +
    '<div class="microsequence-cards">' +
    cardsHtml +
    "</div></section>"
  );
}

export function renderHtmlDocument(compiledDocument) {
  const course = compiledDocument.course;

  const modulesHtml = course.modules
    .map((moduleValue) => {
      const lessonsHtml = moduleValue.lessons
        .map((lesson) => {
          const sequencesHtml = lesson.microsequences.map(renderMicrosequence).join("");
          return (
            '<section class="lesson" data-lesson-id="' +
            escapeHtml(lesson.id) +
            '">' +
            "<header><h2>" +
            escapeHtml(lesson.title) +
            "</h2></header>" +
            sequencesHtml +
            "</section>"
          );
        })
        .join("");

      return (
        '<section class="module" data-module-id="' +
        escapeHtml(moduleValue.id) +
        '">' +
        "<header><h1>" +
        escapeHtml(moduleValue.title) +
        "</h1></header>" +
        lessonsHtml +
        "</section>"
      );
    })
    .join("");

  return (
    '<main class="aralearn-document" data-course-id="' +
    escapeHtml(course.id) +
    '">' +
    '<header class="course-head"><h1>' +
    escapeHtml(course.title) +
    "</h1></header>" +
    modulesHtml +
    "</main>"
  );
}
