function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderActionMenuOverlay({ title, placement = "bottom", actions = [] }) {
  const safePlacement = placement === "side" ? "side" : "bottom";
  const buttons = actions
    .map((action) => {
      return (
        '<button class="action-menu-btn' +
        (action.tone === "danger" ? " is-danger" : "") +
        '" type="button" data-action="run-entity-action" data-entity-action="' +
        escapeHtml(action.key) +
        '" title="' +
        escapeHtml(action.label) +
        '" aria-label="' +
        escapeHtml(action.label) +
        '">' +
        '<span class="action-menu-icon" aria-hidden="true">' +
        String(action.icon || "") +
        "</span>" +
        "</button>"
      );
    })
    .join("");

  return (
    '<section class="action-menu-overlay action-menu-overlay-' +
    safePlacement +
    '" data-action="dismiss-action-menu" aria-label="' +
    escapeHtml(title || "Ações") +
    '">' +
    '<div class="action-menu-sheet action-menu-sheet-' +
    safePlacement +
    '" role="dialog" aria-modal="true" data-action-menu-sheet="true">' +
    buttons +
    "</div></section>"
  );
}
