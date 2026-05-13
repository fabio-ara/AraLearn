function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderAssistConfigOverlay({ model, apiKey, codexEndpoint, codexToken, modelOptions = [] }) {
  const isCodexLocal = model === "codex-cli-local";
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
    '<section class="editor-overlay assist-config-overlay" aria-label="Configuração da IA">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="assist-config-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Configuração da IA</p>' +
    '<div class="topbar-space" aria-hidden="true"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    '<div class="field">' +
    "<label>Modelo principal</label>" +
    '<select data-field="assist-config-model">' +
    options +
    "</select>" +
    "</div>" +
    '<div class="field">' +
    "<label>Chave Gemini/API</label>" +
    '<input data-field="assist-config-api-key" type="password" value="' +
    escapeHtml(apiKey || "") +
    '" autocomplete="off" spellcheck="false">' +
    "</div>" +
    '<section class="entity-action-group">' +
    '<p class="tiny muted">Codex local</p>' +
    (isCodexLocal ? '<p class="tiny muted">Modo avançado ativo.</p>' : "") +
    "</section>" +
    '<div class="field">' +
    "<label>Endpoint Codex local</label>" +
    '<input data-field="assist-config-codex-endpoint" type="text" value="' +
    escapeHtml(codexEndpoint || "") +
    '" autocomplete="off" spellcheck="false">' +
    "</div>" +
    '<div class="field">' +
    "<label>Token Codex local</label>" +
    '<input data-field="assist-config-codex-token" type="password" value="' +
    escapeHtml(codexToken || "") +
    '" autocomplete="off" spellcheck="false">' +
    "</div>" +
    "</div>" +
    "</article></section>"
  );
}
