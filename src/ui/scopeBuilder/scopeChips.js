function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderScopeChipList(moduleIndex, fieldName, chips = []) {
  return (
    '<div class="scope-chip-list">' +
    chips
      .map(
        (chip, chipIndex) =>
          '<button class="scope-chip" type="button" data-action="remove-scope-chip" data-module-index="' +
          escapeHtml(moduleIndex) +
          '" data-chip-field="' +
          escapeHtml(fieldName) +
          '" data-chip-index="' +
          escapeHtml(chipIndex) +
          '" title="Remover">' +
          '<span>' +
          escapeHtml(chip) +
          "</span><span aria-hidden=\"true\">×</span></button>"
      )
      .join("") +
    "</div>"
  );
}

