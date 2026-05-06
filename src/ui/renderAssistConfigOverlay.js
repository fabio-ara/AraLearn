function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderAssistConfigOverlay({ model, apiKey, modelOptions = [] }) {
  const options = modelOptions
    .map((item) => {
      return (
        '<option value="' +
        escapeHtml(item.value) +
        '"' +
        (item.value === model ? " selected" : "") +
        ">" +
        escapeHtml(item.label) +
        "</option>"
      );
    })
    .join("");

  return (
    '<section class="editor-overlay" aria-label="Configuração da API">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="assist-config-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Configuração da API</p>' +
    '<button class="icon-ghost" type="button" data-action="assist-config-save" title="Salvar" aria-label="Salvar">&#10003;</button>' +
    "</header>" +
    '<div class="editor-body">' +
    '<div class="field">' +
    "<label>Modelo</label>" +
    '<select data-field="assist-config-model">' +
    options +
    "</select>" +
    "</div>" +
    '<div class="field">' +
    "<label>Chave da API</label>" +
    '<input data-field="assist-config-api-key" type="password" value="' +
    escapeHtml(apiKey || "") +
    '" autocomplete="off" spellcheck="false">' +
    "</div>" +
    '<p class="tiny muted">A chave fica só no storage local deste navegador.</p>' +
    "</div>" +
    "</article></section>"
  );
}
