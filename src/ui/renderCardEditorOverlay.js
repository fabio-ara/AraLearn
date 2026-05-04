import { normalizeCardBlocks } from "../core/cardBlockModel.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BLOCK_META = {
  heading: {
    label: "Título",
    glyph: "H",
    inputLabel: "Título",
    placeholder: "Título do card"
  },
  paragraph: {
    label: "Parágrafo",
    glyph: "¶",
    inputLabel: "Markdown",
    placeholder: "Texto em markdown"
  },
  list: {
    label: "Lista",
    glyph: "≡",
    inputLabel: "Itens",
    placeholder: "Um item por linha"
  },
  choice: {
    label: "Escolha",
    glyph: "◫",
    inputLabel: "Pergunta-guia",
    placeholder: "Enunciado ou pergunta"
  },
  table: {
    label: "Tabela",
    glyph: "▦",
    inputLabel: "Quadro",
    placeholder: "Título ou foco da tabela"
  },
  flowchart: {
    label: "Fluxo",
    glyph: "⇆",
    inputLabel: "Etapas",
    placeholder: "Etapas separadas por linha, vírgula ou ponto e vírgula"
  },
  popup: {
    label: "Botão",
    glyph: "→",
    inputLabel: "Rótulo do botão",
    placeholder: "Botão"
  }
};

const PALETTE_TYPES = ["paragraph", "list", "choice", "table", "flowchart"];

function normalizeBlocks(card) {
  return normalizeCardBlocks({
    title: card?.title || "",
    text: card?.data?.text || "",
    blocks: card?.data?.blocks || []
  });
}

function getBlockMeta(kind) {
  return BLOCK_META[kind] || BLOCK_META.paragraph;
}

function renderStepStrip(cards, activeIndex) {
  return cards
    .map((item, index) => {
      const titleText = item.title || `Card ${index + 1}`;
      return (
        '<button class="editor-step-chip' +
        (index === activeIndex ? " active" : "") +
        '" type="button" data-action="open-card-index" data-card-index="' +
        String(index) +
        '" title="' +
        escapeHtml(titleText) +
        '" aria-label="Abrir card ' +
        String(index + 1) +
        '">' +
        '<span class="chip-index">' +
        String(index + 1) +
        "</span>" +
        '<span class="chip-text">' +
        escapeHtml(titleText) +
        "</span>" +
        "</button>"
      );
    })
    .join("");
}

function renderPalette(parentPath, compact = false) {
  return PALETTE_TYPES.map((kind) => {
    const meta = getBlockMeta(kind);
    return (
      '<button class="palette-icon' +
      (compact ? " inline-palette-icon" : "") +
      '" type="button" data-action="add-block" data-block-parent="' +
      escapeHtml(parentPath) +
      '" data-block-kind="' +
      escapeHtml(kind) +
      '" data-block-type="' +
      escapeHtml(kind) +
      '" title="Adicionar ' +
      escapeHtml(meta.label) +
      '" aria-label="Adicionar ' +
      escapeHtml(meta.label) +
      '">' +
      escapeHtml(meta.glyph) +
      "</button>"
    );
  }).join("");
}

function renderBlockField(block, path, options = {}) {
  const meta = getBlockMeta(block.kind);
  const fieldName = options.popupLabel ? "block-popup-label" : "block-label";

  if (block.kind === "heading") {
    return (
      '<div class="field compact-field">' +
      "<label>" +
      escapeHtml(meta.inputLabel) +
      "</label>" +
      '<input class="block-input title-block-input" data-field="' +
      fieldName +
      '" data-block-path="' +
      escapeHtml(path) +
      '" type="text" value="' +
      escapeHtml(block.label || "") +
      '" placeholder="' +
      escapeHtml(meta.placeholder) +
      '">' +
      "</div>"
    );
  }

  if (block.kind === "popup") {
    return (
      '<div class="field compact-field">' +
      "<label>" +
      escapeHtml(meta.inputLabel) +
      "</label>" +
      '<input class="block-input" data-field="' +
      fieldName +
      '" data-block-path="' +
      escapeHtml(path) +
      '" type="text" value="' +
      escapeHtml(block.label || "") +
      '" placeholder="' +
      escapeHtml(meta.placeholder) +
      '">' +
      "</div>"
    );
  }

  return (
    '<div class="field compact-field grow-field">' +
    "<label>" +
    escapeHtml(meta.inputLabel) +
    "</label>" +
    '<textarea class="inline-editor-textarea block-markdown-textarea" data-field="' +
    fieldName +
    '" data-block-path="' +
    escapeHtml(path) +
    '" placeholder="' +
    escapeHtml(meta.placeholder) +
    '">' +
    escapeHtml(block.label || "") +
    "</textarea>" +
    "</div>"
  );
}

function renderBlockActions(path, { fixed = false } = {}) {
  if (fixed) {
    return "";
  }

  return (
    '<button class="icon-ghost tiny-icon" type="button" data-action="move-block-up" data-block-path="' +
    escapeHtml(path) +
    '" title="Subir" aria-label="Subir">&uarr;</button>' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="move-block-down" data-block-path="' +
    escapeHtml(path) +
    '" title="Descer" aria-label="Descer">&darr;</button>' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="remove-block" data-block-path="' +
    escapeHtml(path) +
    '" title="Remover" aria-label="Remover">&times;</button>'
  );
}

function renderBlockShell(block, path, innerHtml, options = {}) {
  const meta = getBlockMeta(block.kind);
  const fixed = !!options.fixed;
  const handleButton = fixed
    ? '<button class="icon-ghost tiny-icon builder-tool-handle disabled-icon" type="button" disabled title="Bloco fixo" aria-label="Bloco fixo">&#128274;</button>'
    : '<button class="icon-ghost tiny-icon builder-tool-handle" type="button" disabled title="Mover bloco" aria-label="Mover bloco">&#9776;</button>';

  return (
    '<article class="builder-block builder-block-kind-' +
    escapeHtml(block.kind || "paragraph") +
    '" data-block-path="' +
    escapeHtml(path) +
    '" data-block-kind="' +
    escapeHtml(block.kind || "paragraph") +
    '">' +
    '<div class="builder-tools">' +
    handleButton +
    '<div class="builder-meta"><span class="builder-kind-pill">' +
    escapeHtml(meta.label) +
    "</span></div>" +
    '<div class="builder-tool-right">' +
    renderBlockActions(path, { fixed }) +
    "</div></div>" +
    innerHtml +
    "</article>"
  );
}

function renderEditableBlock(block, path, options = {}) {
  if (!block || typeof block !== "object") {
    return "";
  }

  if (block.kind === "popup") {
    const children = Array.isArray(block.children) ? block.children : [];
    const popupEnabled = !!block.popupEnabled;
    const body =
      '<section class="button-config card-editor-button-config">' +
      '<div class="block-fixed block-fixed-button">' +
      '<div class="study-next-wrap">' +
      '<button class="next-icon step-main-btn" type="button" disabled aria-disabled="true" tabindex="-1" title="Continuar" aria-label="Continuar">&#10140;</button>' +
      "</div></div>" +
      '<label class="toggle-row tiny">' +
      '<input type="checkbox" data-action="toggle-popup-enabled" data-block-path="' +
      escapeHtml(path) +
      '" ' +
      (popupEnabled ? "checked" : "") +
      "> Abrir popup antes de avançar" +
      "</label>" +
      '<div class="button-popup-meta' +
      (popupEnabled ? "" : " disabled") +
      '">' +
      '<p class="tiny muted">' +
      String(children.length) +
      " bloco" +
      (children.length === 1 ? "" : "s") +
      "</p>" +
      "</div>" +
      (popupEnabled
        ? renderBlockField(block, path, { popupLabel: true }) +
          '<div class="builder-nested-stack">' +
          (children.length
            ? children.map((child, index) => renderEditableBlock(child, `${path}.children.${index}`)).join("")
            : '<div class="canvas-empty">O popup ainda não tem contêineres.</div>') +
          "</div>" +
          '<div class="builder-inline-palette">' +
          renderPalette(path, true) +
          "</div>"
        : "") +
      "</section>";

    return renderBlockShell(block, path, body, { fixed: options.fixed });
  }

  return renderBlockShell(block, path, renderBlockField(block, path), { fixed: options.fixed });
}

export function renderInlineCardEditor({ cards, card, selection }) {
  const activeIndex = Number.isInteger(selection.cardIndex) ? selection.cardIndex : 0;
  const prevDisabled = activeIndex <= 0;
  const nextDisabled = activeIndex >= cards.length - 1;
  const blocks = normalizeBlocks(card);
  const titleBlock = blocks[0] || { kind: "heading", label: card?.title || "" };
  const popupBlock = blocks[1] || { kind: "popup", label: "Botão", children: [] };

  return (
    '<section class="editor-step-nav inline-editor-step-nav" aria-label="Navegação de cards">' +
    '<div class="editor-step-nav-head">' +
    '<button class="icon-ghost tiny-icon" type="button" data-action="editor-prev-card" ' +
    (prevDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Card anterior" aria-label="Card anterior">&larr;</button>' +
    '<p class="chip-muted">Card ' +
    String(activeIndex + 1) +
    " de " +
    String(cards.length) +
    "</p>" +
    '<button class="icon-ghost tiny-icon" type="button" data-action="editor-next-card" ' +
    (nextDisabled ? 'disabled aria-disabled="true"' : "") +
    ' title="Próximo card" aria-label="Próximo card">&rarr;</button>' +
    "</div>" +
    '<div class="editor-step-strip">' +
    renderStepStrip(cards, activeIndex) +
    "</div></section>" +
    '<section class="builder-layout card-editor-layout">' +
    '<aside class="palette-col card-editor-palette" aria-label="Paleta de contêineres">' +
    '<button class="palette-icon is-fixed" type="button" disabled title="Título fixo" aria-label="Título fixo">H</button>' +
    renderPalette("1") +
    "</aside>" +
    '<section class="canvas-col card-editor-canvas" data-dropzone="canvas">' +
    renderEditableBlock(titleBlock, "0", { fixed: true }) +
    renderEditableBlock(popupBlock, "1", { fixed: true }) +
    "</section></section>"
  );
}

export function renderCardEditorOverlay({ cards, card, selection }) {
  return renderInlineCardEditor({ cards, card, selection });
}
