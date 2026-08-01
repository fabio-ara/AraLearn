import { renderUiIcon } from "./renderUiIcons.js";
import {
  PEDAGOGICAL_COMMENT_CATEGORIES,
  PEDAGOGICAL_COMMENT_MAX_CHARACTERS,
  pedagogicalCommentStatusLabel
} from "../domain/pedagogicalComment.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCardCommentOverlay({
  draft = {},
  exists = false,
  error = "",
  saving = false
}) {
  const category = String(draft.category || "observation");
  const body = String(draft.body || "");
  const response = String(draft.response || "").trim();
  const resolutionNote = String(draft.resolutionNote || "").trim();
  const status = pedagogicalCommentStatusLabel(draft.status);
  const categories = PEDAGOGICAL_COMMENT_CATEGORIES.map((item) =>
    '<label class="comment-category-chip' +
    (item.value === category ? " is-selected" : "") + '">' +
    '<input type="radio" name="comment-category" data-field="card-comment-category" value="' +
    escapeHtml(item.value) + '"' + (item.value === category ? " checked" : "") +
    (saving ? " disabled" : "") + '><span>' + escapeHtml(item.label) + "</span></label>"
  ).join("");
  return (
    '<section class="editor-overlay" aria-label="Observação do card">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="comment-close" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") +
    "</button>" +
    '<p class="editor-title">Observação do card</p>' +
    '<button class="icon-ghost" type="button" data-action="comment-save" title="Salvar" aria-label="Salvar"' +
    (saving ? ' disabled aria-disabled="true"' : "") +
    ">" +
    renderUiIcon("ready-state", "home-tab-icon") +
    "</button>" +
    "</header>" +
    '<div class="editor-body">' +
    (exists && (response || resolutionNote || draft.status)
      ? '<aside class="comment-follow-up" aria-label="Retorno da equipe">' +
        '<span>' + escapeHtml(status) + '</span>' +
        (response ? '<p>' + escapeHtml(response) + '</p>' : '') +
        (resolutionNote ? '<small>' + escapeHtml(resolutionNote) + '</small>' : '') +
        '</aside>'
      : '') +
    '<div class="comment-category-list" role="radiogroup" aria-label="Tipo de observação">' +
    categories + "</div>" +
    '<div class="field">' +
    '<textarea data-field="card-comment" class="comment-textarea" aria-label="Observação" maxlength="' +
    String(PEDAGOGICAL_COMMENT_MAX_CHARACTERS) + '" placeholder="Escreva uma observação curta."' +
    (saving ? ' disabled aria-disabled="true"' : "") +
    ">" +
    escapeHtml(body) +
    "</textarea>" +
    (error ? '<p class="field-error" role="alert">' + escapeHtml(error) + "</p>" : "") +
    "</div>" +
    (exists
      ? '<button class="icon-ghost comment-delete" type="button" data-action="comment-delete" title="Retirar observação" aria-label="Retirar observação"' +
        (saving ? ' disabled aria-disabled="true"' : "") + ">" +
        renderUiIcon("trash", "home-tab-icon") + "</button>"
      : "") +
    "</div>" +
    "</article></section>"
  );
}
