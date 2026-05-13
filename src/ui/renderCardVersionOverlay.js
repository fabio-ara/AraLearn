function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderActionButton(action, itemKey) {
  return (
    '<button class="history-item-action history-item-action-' +
    escapeHtml(action.tone || "default") +
    '" type="button" data-action="' +
    escapeHtml(action.action) +
    '" data-version-key="' +
    escapeHtml(itemKey) +
    '" title="' +
    escapeHtml(action.label) +
    '" aria-label="' +
    escapeHtml(action.label) +
    '"' +
    (action.disabled ? ' disabled aria-disabled="true"' : "") +
    ">" +
    (action.icon ? '<span class="history-item-action-icon" aria-hidden="true">' + escapeHtml(action.icon) + "</span>" : "") +
    '<span class="history-item-action-label">' +
    escapeHtml(action.label) +
    "</span></button>"
  );
}

function renderHistoryItem(item) {
  const actions = (Array.isArray(item.actions) ? item.actions : [])
    .map((action) => renderActionButton(action, item.key))
    .join("");
  const moreActions = (Array.isArray(item.moreActions) ? item.moreActions : [])
    .map((action) => renderActionButton(action, item.key))
    .join("");

  return (
    '<article class="history-item-card' +
    (item.selected ? " is-selected" : "") +
    (item.inUse ? " is-in-use" : "") +
    '">' +
    '<button class="history-item-card-body" type="button" data-action="select-version-history-item" data-version-key="' +
    escapeHtml(item.key) +
    '">' +
    '<span class="history-item-line history-item-line-primary">' +
    '<span class="history-item-origin">' +
    escapeHtml(item.origin || item.label || item.key) +
    "</span>" +
    '<span class="history-item-version">' +
    escapeHtml(item.versionLabel || item.label || item.key) +
    (item.inUse ? '<span class="history-item-state">Em uso</span>' : "") +
    "</span></span>" +
    '<span class="history-item-line history-item-line-secondary">' +
    escapeHtml(item.meta || "") +
    "</span>" +
    (item.summary
      ? '<span class="history-item-line history-item-line-summary">' + escapeHtml(item.summary) + "</span>"
      : "") +
    "</button>" +
    (actions ? '<div class="history-item-actions">' + actions + "</div>" : "") +
    (moreActions
      ? '<div class="history-item-more' + (item.moreExpanded ? " is-open" : "") + '">' +
        '<button class="history-item-action history-item-action-default" type="button" data-action="toggle-version-history-more" data-version-key="' +
        escapeHtml(item.key) +
        '" title="Mais" aria-label="Mais"><span class="history-item-action-icon" aria-hidden="true">⋯</span><span class="history-item-action-label">Mais</span></button>' +
        (item.moreExpanded ? '<div class="history-item-more-actions">' + moreActions + "</div>" : "") +
        "</div>"
      : "") +
    "</article>"
  );
}

export function renderCardVersionOverlay({
  versions,
  title = "Versões",
  emptyLabel = "Sem versões anteriores.",
  footer = "",
  primaryAction = null
}) {
  const items = (versions || []).map((item) => renderHistoryItem(item)).join("");
  const primaryActionHtml = primaryAction?.action
    ? '<button class="icon-ghost" type="button" data-action="' +
      escapeHtml(primaryAction.action) +
      '" title="' +
      escapeHtml(primaryAction.label || "Gravar snapshot") +
      '" aria-label="' +
      escapeHtml(primaryAction.label || "Gravar snapshot") +
      '">' +
      escapeHtml(primaryAction.icon || "+") +
      "</button>"
    : '<div class="topbar-space"></div>';

  return (
    '<section class="editor-overlay" aria-label="' + escapeHtml(title) + '">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="version-history-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">' + escapeHtml(title) + "</p>" +
    primaryActionHtml +
    "</header>" +
    '<div class="editor-body">' +
    (footer ? '<p class="tiny muted history-footer">' + escapeHtml(footer) + "</p>" : "") +
    '<div class="history-list">' +
    (items || '<p class="muted tiny">' + escapeHtml(emptyLabel) + "</p>") +
    "</div>" +
    "</div>" +
    "</article></section>"
  );
}
