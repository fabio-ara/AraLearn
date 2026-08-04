import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTagCombobox(field, { allowCustom = false } = {}) {
  const labelText = escapeHtml(field.label);
  const placeholder = field.placeholder ? escapeHtml(field.placeholder) : "";
  const hintText = field.hint ? escapeHtml(field.hint) : "";
  const values = Array.isArray(field.value) ? field.value : [];
  const options = Array.isArray(field.options) ? field.options : [];
  const optionsJson = escapeHtml(JSON.stringify(options));
  const valuesJson = escapeHtml(JSON.stringify(values));
  const listId = "entity-tag-options-" + String(field.name || "field").replace(/[^a-zA-Z0-9_-]/g, "-");
  const chips = values
    .map((item) => {
      const option = options.find((entry) => entry.id === item);
      const label = escapeHtml(option?.label || item);
      const value = escapeHtml(item);
      return (
        '<button class="didactic-tag dependency-tag-chip dependency-chip-button entity-tag-chip" type="button" data-action="remove-entity-tag" data-value="' +
        value +
        '">' +
        '<span class="didactic-tag-text dependency-chip-label">' +
        label +
        "</span>" +
        '<span class="dependency-chip-remove" aria-hidden="true">' +
        renderUiIcon("remove-state", "dependency-chip-remove-icon") +
        "</span>" +
        "</button>"
      );
    })
    .join("");

  return (
    '<div class="field' +
    (field.tone === "secondary" ? " is-secondary" : "") +
    '">' +
    "<label>" +
    (field.iconName
      ? '<span class="field-label-content"><span class="field-label-icon" aria-hidden="true">' +
        renderUiIcon(field.iconName, "field-label-svg-icon") +
        '</span><span class="field-label-text">' +
        labelText +
        "</span></span>"
      : labelText) +
    "</label>" +
    '<div class="entity-tag-combobox" data-field="' +
    escapeHtml(field.name) +
    '" data-allow-custom="' +
    (allowCustom ? "true" : "false") +
    '" data-values="' +
    valuesJson +
    '" data-options="' +
    optionsJson +
    '">' +
    '<div class="entity-tag-combobox-entry">' +
    '<input class="entity-tag-combobox-input" data-role="tag-input" aria-label="' +
    labelText +
    '" placeholder="' +
    placeholder +
    '" type="text" list="' +
    listId +
    '" value="">' +
    '<datalist id="' +
    listId +
    '">' +
    options
      .map((option) => {
        const optionId = escapeHtml(option.id);
        const optionLabel = escapeHtml(option.label);
        return `<option value="${optionLabel}" data-option-id="${optionId}">${optionId}</option>`;
      })
      .join("") +
    "</datalist>" +
    '<button class="icon-ghost entity-tag-combobox-add" type="button" data-action="add-entity-tag" aria-label="Adicionar item" title="Adicionar item">+</button>' +
    "</div>" +
    '<div class="dependency-chip-row workbench-tag-chip-row entity-tag-chip-row" data-role="selected-tags">' +
    chips +
    "</div>" +
    "</div>" +
    (hintText ? '<p class="field-hint">' + hintText + "</p>" : "") +
    "</div>"
  );
}

export function renderEntityEditorOverlay({
  title,
  helperText = "",
  fields,
  actions = [],
  saving = false,
  error = ""
}) {
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
          '" maxlength="' +
          escapeHtml(String(field.maxLength || 1000)) +
          '">' +
          value +
          "</textarea>" +
          (hintText ? '<p class="field-hint">' + hintText + "</p>" : "") +
          "</div>"
        );
      }

      if (field.type === "select") {
        return (
          '<div class="field' +
          (field.tone === "secondary" ? " is-secondary" : "") +
          '">' +
          "<label>" +
          labelContent +
          "</label>" +
          '<select data-field="' +
          escapeHtml(field.name) +
          '" aria-label="' +
          labelText +
          '">' +
          (field.options || [])
            .map((option) => {
              const optionValue = escapeHtml(option.id);
              const optionLabel = escapeHtml(option.label);
              const selected = option.id === field.value ? ' selected="selected"' : "";
              return `<option value="${optionValue}"${selected}>${optionLabel}</option>`;
            })
            .join("") +
          "</select>" +
          (hintText ? '<p class="field-hint">' + hintText + "</p>" : "") +
          "</div>"
        );
      }

      if (field.type === "multiselect") {
        return renderTagCombobox(field, { allowCustom: false });
      }

      if (field.type === "tokenlist") {
        return renderTagCombobox(field, { allowCustom: true });
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
        '" maxlength="' +
        escapeHtml(String(field.maxLength || 240)) +
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
    '<button class="icon-ghost" type="button" data-action="entity-editor-close" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") +
    "</button>" +
    '<p class="editor-title">' +
    escapeHtml(title) +
    "</p>" +
    '<div class="topbar-space" aria-hidden="true"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    (helperText ? '<p class="editor-helper-text">' + escapeHtml(helperText) + "</p>" : "") +
    inputs +
    actionButtons +
    (error ? '<p class="editor-error" role="alert">' + escapeHtml(error) + "</p>" : "") +
    "</div>" +
    '<footer class="editor-footer">' +
    '<button class="icon-ghost" type="button" data-action="entity-editor-close" title="Cancelar" aria-label="Cancelar"' +
    (saving ? ' disabled aria-disabled="true"' : "") +
    '>' + renderUiIcon("remove-state", "home-tab-icon") + "</button>" +
    '<button class="open-main" type="button" data-action="entity-editor-save" title="Salvar" aria-label="Salvar"' +
    (saving ? ' disabled aria-disabled="true"' : "") +
    '>' + renderUiIcon(saving ? "progress" : "save", "home-tab-icon") + "</button>" +
    "</footer>" +
    "</article></section>"
  );
}
