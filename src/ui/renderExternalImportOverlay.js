import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderExternalImportOverlay({ sourceName, detectedFormat, error } = {}) {
  const hasError = typeof error === "string" && error.trim().length > 0;
  const formatLabel = hasError ? "Não reconhecido" : escapeHtml(detectedFormat || "Desconhecido");
  const detail = hasError
    ? escapeHtml(error)
    : "Revise a origem e confirme a importação antes de incorporar o conteúdo ao projeto local.";

  return (
    '<section class="editor-overlay" aria-label="Importar conteúdo recebido">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="cancel-external-import" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") +
    "</button>" +
    '<p class="editor-title">Importar conteúdo recebido</p>' +
    '<div class="topbar-space" aria-hidden="true"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    '<p class="tiny muted">O AraLearn recebeu um arquivo ou texto compartilhado por outro app.</p>' +
    '<div class="field">' +
    "<label>Origem</label>" +
    `<p>${escapeHtml(sourceName || "Compartilhamento Android")}</p>` +
    "</div>" +
    '<div class="field">' +
    "<label>Formato detectado</label>" +
    `<p>${formatLabel}</p>` +
    `<p class="tiny muted">${detail}</p>` +
    "</div>" +
    '<div class="generate-action-row assist-actions assist-actions-wide">' +
    (hasError
      ? ""
      : '<button class="open-main" type="button" data-action="confirm-external-import">Importar</button>') +
    '<button class="icon-ghost" type="button" data-action="cancel-external-import">Cancelar</button>' +
    "</div>" +
    "</div>" +
    "</article></section>"
  );
}
