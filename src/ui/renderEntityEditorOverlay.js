import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEntityEditorOverlay({ title, helperText = "", fields, actions = [] }) {
  const inputs = fields
    .map((field) => {
      const value = field.value ? escapeHtml(field.value) : "";
      const placeholder = field.placeholder ? escapeHtml(field.placeholder) : "";
      const labelText = escapeHtml(field.label);
      const hintText = field.hint ? escapeHtml(field.hint) : "";
      const labelContent = field.iconName
        ? '<span class="field-label-content">' +
          '<span class="field-label-icon" aria-hidden="true">' +
          renderUiIcon(field.iconName, "field-label-svg-icon") +
          "</span>" +
          '<span class="field-label-text">' +
          labelText +
          "</span>" +
          "</span>"
        : labelText;
      if (field.type === "textarea") {
        return (
          '<div class="field' +
          (field.tone === "secondary" ? " is-secondary" : "") +
          '">' +
          "<label>" +
          labelContent +
          "</label>" +
          '<textarea data-field="' +
          escapeHtml(field.name) +
          '" aria-label="' +
          labelText +
          '" placeholder="' +
          placeholder +
          '">' +
          value +
          "</textarea>" +
          (hintText ? '<p class="field-hint">' + hintText + "</p>" : "") +
          "</div>"
        );
      }

      return (
        '<div class="field' +
        (field.tone === "secondary" ? " is-secondary" : "") +
        '">' +
        "<label>" +
        labelContent +
        "</label>" +
        '<input data-field="' +
        escapeHtml(field.name) +
        '" aria-label="' +
        labelText +
        '" placeholder="' +
        placeholder +
        '" type="text" value="' +
        value +
        '">' +
        (hintText ? '<p class="field-hint">' + hintText + "</p>" : "") +
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
    '<div class="topbar-space" aria-hidden="true"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    (helperText ? '<p class="editor-helper-text">' + escapeHtml(helperText) + "</p>" : "") +
    inputs +
    actionButtons +
    "</div>" +
    "</article></section>"
  );
}
