function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCardVersionOverlay({ versions }) {
  const items = (versions || [])
    .map((item) => {
      return (
        '<button class="history-item" type="button" data-action="restore-version" data-version-key="' +
        escapeHtml(item.key) +
        '">' +
        '<span class="history-item-title">' +
        escapeHtml(item.label) +
        "</span>" +
        '<span class="history-item-meta">' +
        escapeHtml(item.meta || "") +
        "</span>" +
        "</button>"
      );
    })
    .join("");

  return (
    '<section class="editor-overlay" aria-label="Versões do card">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="version-history-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Versões do card</p>' +
    '<div class="topbar-space"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    '<div class="history-list">' +
    (items || '<p class="muted tiny">Sem versões anteriores.</p>') +
    "</div>" +
    "</div>" +
    "</article></section>"
  );
}
