import { resolveCardRuntime } from "../core/cardRuntime.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function renderMarkdownInline(text) {
  return escapeHtml(text || "")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function renderMarkdownParagraph(text) {
  return renderMarkdownInline(text);
}

function renderFlowStep(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  const [kind] = Object.keys(item);
  if (!kind) {
    return "";
  }

  const value = item[kind];
  if (kind === "if") {
    const thenBranch = Array.isArray(item.then) ? item.then.map(renderFlowStep).join("") : "";
    const elseBranch = Array.isArray(item.else) ? item.else.map(renderFlowStep).join("") : "";
    return (
      '<details class="runtime-flow-branch" open>' +
      '<summary class="runtime-flow-node runtime-flow-node-decision">' +
      renderMarkdownInline(value) +
      "</summary>" +
      (thenBranch ? '<div class="runtime-flow-branch-group"><div class="runtime-flow-branch-label">Sim</div>' + thenBranch + "</div>" : "") +
      (elseBranch ? '<div class="runtime-flow-branch-group"><div class="runtime-flow-branch-label">Não</div>' + elseBranch + "</div>" : "") +
      "</details>"
    );
  }

  const kindLabelByType = {
    start: "Início",
    end: "Fim",
    process: "Processo",
    input: "Entrada",
    output: "Saída",
    while: "Enquanto",
    do_while: "Repita",
    switch: "Escolha",
    for: "Para"
  };

  return (
    '<span class="runtime-flow-node" data-kind="' +
    escapeHtml(kind) +
    '">' +
    '<span class="runtime-flow-node-kind">' +
    escapeHtml(kindLabelByType[kind] || kind) +
    "</span>" +
    '<span class="runtime-flow-node-text">' +
    renderMarkdownInline(typeof value === "string" ? value : JSON.stringify(value)) +
    "</span>" +
    "</span>"
  );
}

function renderFlowchartBlock(block) {
  const items = Array.isArray(block?.flow) ? block.flow : [];
  if (!items.length) {
    return '<div class="runtime-block runtime-flow-block"><p class="runtime-paragraph">Fluxograma vazio.</p></div>';
  }

  const flowItems = items
    .map((item) => renderFlowStep(item))
    .filter(Boolean)
    .join('<span class="runtime-flow-arrow">→</span>');

  return '<div class="runtime-block runtime-flow-block">' + flowItems + "</div>";
}

function renderTableBlock(block) {
  const title = normalizeInlineText(block?.title);
  const headers = (Array.isArray(block?.headers) ? block.headers : [])
    .map((header) => "<th>" + renderMarkdownInline(header?.value || "") + "</th>")
    .join("");
  const rows = (Array.isArray(block?.rows) ? block.rows : [])
    .map((row) => {
      const cells = (Array.isArray(row) ? row : [])
        .map((cell) => "<td>" + renderMarkdownInline(cell?.value || "") + "</td>")
        .join("");
      return "<tr>" + cells + "</tr>";
    })
    .join("");

  return (
    '<div class="runtime-block runtime-table-block">' +
    (title ? '<div class="runtime-table-title">' + renderMarkdownInline(title) + "</div>" : "") +
    '<div class="runtime-table-wrap"><table class="runtime-table">' +
    (headers ? "<thead><tr>" + headers + "</tr></thead>" : "") +
    "<tbody>" +
    rows +
    "</tbody></table></div></div>"
  );
}

function renderMultipleChoiceBlock(block) {
  const optionsHtml = (Array.isArray(block?.options) ? block.options : [])
    .map((option, index) => {
      return (
        '<label class="choice-option">' +
        '<input type="' +
        (block?.answerState === "multiple" ? "checkbox" : "radio") +
        '" disabled name="choice-' +
        String(index) +
        '">' +
        "<span>" +
        renderMarkdownInline(option?.value || "") +
        "</span></label>"
      );
    })
    .join("");

  return (
    '<div class="runtime-block runtime-choice-block">' +
    '<div class="runtime-choice-label">Pergunta-guia</div>' +
    '<div class="runtime-choice-body">' +
    renderMarkdownParagraph(block?.ask || "") +
    "</div>" +
    '<div class="choice-group">' +
    optionsHtml +
    "</div></div>"
  );
}

function renderEditorBlock(block) {
  return (
    '<div class="runtime-block runtime-code-block">' +
    '<pre><code data-language="' +
    escapeHtml(block?.language || "text") +
    '">' +
    escapeHtml(block?.value || "") +
    "</code></pre></div>"
  );
}

function renderImageBlock(block) {
  return (
    '<figure class="runtime-block runtime-image-block">' +
    '<img src="' +
    escapeHtml(block?.src || "") +
    '" alt="' +
    escapeHtml(block?.alt || "") +
    '">' +
    (block?.alt ? '<figcaption class="runtime-image-caption">' + renderMarkdownInline(block.alt) + "</figcaption>" : "") +
    "</figure>"
  );
}

function renderPopupButtonBlock(block) {
  const popupBlocks = Array.isArray(block?.popupBlocks) ? block.popupBlocks : [];
  if (!block?.popupEnabled || !popupBlocks.length) {
    return "";
  }

  return (
    '<details class="runtime-block runtime-popup-block" open>' +
    '<summary class="runtime-popup-summary">Continuar</summary>' +
    '<div class="runtime-popup-body">' +
    renderRuntimeBlockList(popupBlocks, "") +
    "</div></details>"
  );
}

function renderRuntimeBlock(block) {
  if (!block || typeof block !== "object") {
    return "";
  }

  if (block.kind === "heading") {
    return '<h3 class="runtime-block runtime-heading">' + renderMarkdownInline(block.value || "") + "</h3>";
  }
  if (block.kind === "paragraph") {
    return '<p class="runtime-block runtime-paragraph">' + renderMarkdownParagraph(block.value || "") + "</p>";
  }
  if (block.kind === "multiple_choice") {
    return renderMultipleChoiceBlock(block);
  }
  if (block.kind === "editor") {
    return renderEditorBlock(block);
  }
  if (block.kind === "table") {
    return renderTableBlock(block);
  }
  if (block.kind === "flowchart") {
    return renderFlowchartBlock(block);
  }
  if (block.kind === "image") {
    return renderImageBlock(block);
  }
  if (block.kind === "button") {
    return renderPopupButtonBlock(block);
  }

  return '<p class="runtime-block runtime-paragraph" data-kind="' + escapeHtml(block.kind || "paragraph") + '">' + renderMarkdownParagraph(block.value || "") + "</p>";
}

export function renderRuntimeBlockList(blocks, fallbackText = "Sem conteúdo.") {
  const safeBlocks = Array.isArray(blocks) ? blocks : [];
  if (!safeBlocks.length) {
    return '<p class="runtime-paragraph">' + escapeHtml(fallbackText) + "</p>";
  }

  return safeBlocks.map((block) => renderRuntimeBlock(block)).join("");
}

export function renderCardRuntimeBlocks(card, options = {}) {
  const runtime = resolveCardRuntime(card);
  const title = normalizeInlineText(options.title || card?.title || runtime?.title);
  const blocks = Array.isArray(runtime?.blocks) ? runtime.blocks : [];
  const normalizedBlocks =
    options.omitRepeatedHeading !== false &&
    blocks.length &&
    blocks[0]?.kind === "heading" &&
    normalizeInlineText(blocks[0].value).toLowerCase() === title.toLowerCase()
      ? blocks.slice(1)
      : blocks;

  return renderRuntimeBlockList(normalizedBlocks, options.fallbackText || runtime?.fallbackText || "");
}

export function renderCardRuntimeArticle(card) {
  const cardClassByType = {
    text: "card-text",
    choice: "card-ask",
    complete: "card-complete",
    editor: "card-code",
    table: "card-table",
    flow: "card-flow",
    image: "card-image"
  };
  const cardClass = cardClassByType[card?.type] || `card-${escapeHtml(card?.type || "text")}`;

  return (
    '<article class="card ' +
    cardClass +
    '" data-card-id="' +
    escapeHtml(card?.id || card?.key || "") +
    '">' +
    '<header class="card-head"><h4>' +
    escapeHtml(card?.title || card?.key || "Card") +
    "</h4></header>" +
    '<div class="card-body">' +
    renderCardRuntimeBlocks(card, {
      omitRepeatedHeading: true
    }) +
    "</div></article>"
  );
}
