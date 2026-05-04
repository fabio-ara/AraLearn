function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEntityEditorOverlay({ title, fields, actions = [] }) {
  const inputs = fields
    .map((field) => {
      const value = field.value ? escapeHtml(field.value) : "";
      if (field.type === "textarea") {
        return (
          '<div class="field">' +
          "<label>" +
          escapeHtml(field.label) +
          "</label>" +
          '<textarea data-field="' +
          escapeHtml(field.name) +
          '">' +
          value +
          "</textarea>" +
          "</div>"
        );
      }

      return (
        '<div class="field">' +
        "<label>" +
        escapeHtml(field.label) +
        "</label>" +
        '<input data-field="' +
        escapeHtml(field.name) +
        '" type="text" value="' +
        value +
        '">' +
        "</div>"
      );
    })
    .join("");

  const actionButtons = actions.length
    ? '<section class="entity-action-group">' +
      '<p class="tiny muted">Ações</p>' +
      '<div class="entity-action-list">' +
      actions
        .map((action) => {
          return (
            '<button class="entity-action-btn' +
            (action.tone === "danger" ? " is-danger" : "") +
            '" type="button" data-action="run-entity-action" data-entity-action="' +
            escapeHtml(action.key) +
            '">' +
            escapeHtml(action.label) +
            "</button>"
          );
        })
        .join("") +
      "</div></section>"
    : "";

  return (
    '<section class="editor-overlay" aria-label="Editor">' +
    '<article class="editor-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="entity-editor-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">' +
    escapeHtml(title) +
    "</p>" +
    '<button class="icon-ghost" type="button" data-action="entity-editor-save" title="Salvar" aria-label="Salvar">&#10003;</button>' +
    "</header>" +
    '<div class="editor-body">' +
    inputs +
    actionButtons +
    "</div>" +
    "</article></section>"
  );
}
