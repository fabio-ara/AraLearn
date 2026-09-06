export function escapeDesignHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function formatDesignValue(definition, value) {
  if (value == null) return "Automático · escolha contextual pendente";
  const label = (item) => definition.optionLabels[item] || String(item);
  return Array.isArray(value) ? value.map(label).join(" · ") : label(value);
}

export function renderDesignValueInput(definition, value, {
  disabled = false, prefix = "course-design", name = "parameterValue"
} = {}) {
  const id = `${prefix}-value-${definition.id}`;
  const attrs = ` name="${escapeDesignHtml(name)}"${disabled ? " disabled" : ""}`;
  const title = `Valor · ${definition.unitLabel}`;
  const schema = definition.valueSchema;
  if (schema.type === "integer") {
    return `<label for="${id}">${escapeDesignHtml(title)}</label>` +
      `<input id="${id}"${attrs} type="number" min="${schema.minimum}"` +
      ` max="${schema.maximum}" required value="${escapeDesignHtml(value)}">`;
  }
  if (schema.type === "enum") {
    return `<label for="${id}">${escapeDesignHtml(title)}</label><select id="${id}"${attrs} required>` +
      '<option value="">Selecione…</option>' + schema.allowedValues.map((allowed) =>
        `<option value="${escapeDesignHtml(allowed)}"${value === allowed ? " selected" : ""}>` +
        `${escapeDesignHtml(definition.optionLabels[allowed])}</option>`).join("") + "</select>";
  }
  const selected = new Set(Array.isArray(value) ? value : []);
  return `<fieldset class="course-design-value-options"${disabled ? " disabled" : ""}>` +
    `<legend>${escapeDesignHtml(title)}</legend>` + schema.allowedValues.map((allowed) =>
      `<label><input type="checkbox"${attrs} value="${escapeDesignHtml(allowed)}"` +
      `${selected.has(allowed) ? " checked" : ""}><span>` +
      `${escapeDesignHtml(definition.optionLabels[allowed])}</span></label>`).join("") + "</fieldset>";
}

export function readDesignValue(form, definition, name = "parameterValue") {
  const controls = [...(form.querySelectorAll?.("[name]") || [])].filter((control) => control.name === name);
  const raw = form.elements?.[name]?.value ?? controls[0]?.value ?? "";
  if (definition.valueSchema.type === "integer") return raw === "" ? null : Number(raw);
  if (definition.valueSchema.type === "enum") return raw;
  return controls.filter((control) => control.checked).map((control) => control.value);
}

export function updateDesignModeControl(form) {
  for (const mode of form.querySelectorAll?.("[data-design-mode]") || []) {
    const holder = mode.closest("[data-design-value-owner]");
    const inputs = holder?.querySelector("[data-design-values]");
    if (!inputs) continue;
    inputs.hidden = mode.value !== "fixed";
    for (const control of inputs.querySelectorAll("input, select, textarea, fieldset")) {
      control.disabled = mode.value !== "fixed";
    }
  }
}
