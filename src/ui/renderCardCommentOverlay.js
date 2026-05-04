function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCardCommentOverlay({ value }) {
  return (
    '<section class="editor-overlay" aria-label="Anotação pessoal">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="comment-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Anotação pessoal</p>' +
    '<button class="icon-ghost" type="button" data-action="comment-save" title="Salvar" aria-label="Salvar">&#10003;</button>' +
    "</header>" +
    '<div class="editor-body">' +
    '<div class="field">' +
    "<label>Nota do card</label>" +
    '<textarea data-field="card-comment" class="comment-textarea">' +
    escapeHtml(value || "") +
    "</textarea>" +
    "</div>" +
    "</div>" +
    "</article></section>"
  );
}
