function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PROVIDER_OPTIONS = [
  { id: "codex-cli", label: "Codex local" },
  { id: "gemini", label: "Gemini" },
  { id: "openai-compatible", label: "OpenAI compatível" },
  { id: "fake", label: "Fake" }
];

export function renderProviderSettings(settings, { visible = false, healthMessage = "" } = {}) {
  if (!visible) {
    return "";
  }
  return (
    '<section class="overlay-shell" data-action="toggle-provider-settings">' +
    '<aside class="overlay-panel overlay-panel-side provider-panel" data-stop-click="true">' +
    '<div class="panel-header"><div><p class="eyebrow">Provider</p><h2>Configuração</h2></div>' +
    '<button class="icon-pill" type="button" data-action="toggle-provider-settings" aria-label="Fechar">×</button></div>' +
    '<div class="provider-grid">' +
    '<label class="scope-field"><span>Provider</span><select data-provider-id>' +
    PROVIDER_OPTIONS.map((provider) => '<option value="' + provider.id + '"' + (settings.providerId === provider.id ? " selected" : "") + ">" + provider.label + "</option>").join("") +
    "</select></label>" +
    '<label class="scope-field"><span>Modelo</span><input type="text" data-provider-model-id value="' +
    escapeHtml(settings.modelId) +
    '"></label>' +
    '<label class="scope-field"><span>Densidade</span><select data-provider-density>' +
    ['standard', 'deep', 'exam']
      .map((density) => '<option value="' + density + '"' + (settings.density === density ? " selected" : "") + ">" + ({
        standard: "Standard",
        deep: "Deep",
        exam: "Exam"
      })[density] + "</option>")
      .join("") +
    "</select></label>" +
    '<label class="scope-field"><span>Chave / token</span><input type="password" data-provider-api-key value="' +
    escapeHtml(settings.apiKey) +
    '"></label>' +
    '<label class="scope-field"><span>Base URL</span><input type="text" data-provider-base-url value="' +
    escapeHtml(settings.baseUrl) +
    '" placeholder="Provider compatível com OpenAI"></label>' +
    '<label class="scope-field"><span>Endpoint local</span><input type="text" data-provider-endpoint value="' +
    escapeHtml(settings.endpoint) +
    '" placeholder="http://127.0.0.1:4183/assist"></label></div>' +
    '<div class="panel-actions provider-actions">' +
    '<button class="ghost-button" type="button" data-action="check-codex-health">Verificar</button>' +
    '<button class="primary-button" type="button" data-action="save-provider-settings">Salvar</button></div>' +
    (healthMessage ? '<p class="provider-health-message">' + escapeHtml(healthMessage) + "</p>" : "") +
    "</aside></section>"
  );
}
