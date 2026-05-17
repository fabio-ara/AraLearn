import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOptionList(items = [], selectedValue = "") {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const value = escapeHtml(item?.value || "");
      const label = escapeHtml(item?.label || item?.value || "");
      return `<option value="${value}"${item?.value === selectedValue ? " selected" : ""}>${label}</option>`;
    })
    .join("");
}

function renderProviderStatusChip({ localStatus = {}, isLocalModel = false, hasApiKey = false } = {}) {
  if (isLocalModel) {
    const statusName = localStatus.checking ? "checking" : localStatus.ok ? "ready" : "offline";
    const label = localStatus.checking ? "Local: testando" : localStatus.ok ? "Local: ativo" : "Local: offline";
    return (
      `<button class="assist-config-status-chip is-${statusName}" type="button" data-action="test-codex-cli-connection" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
      renderUiIcon(localStatus.ok ? "ready-state" : localStatus.checking ? "progress" : "remove-state", "assist-config-status-icon") +
      `<span>${escapeHtml(label)}</span>` +
      "</button>"
    );
  }

  const label = hasApiKey ? "API: pronta" : "API: chave pendente";
  return (
    `<span class="assist-config-status-chip is-${hasApiKey ? "ready" : "idle"}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
    renderUiIcon(hasApiKey ? "ready-state" : "intent", "assist-config-status-icon") +
    `<span>${escapeHtml(label)}</span>` +
    "</span>"
  );
}

function renderIconAction(action, iconName, title) {
  return (
    `<button class="icon-ghost assist-config-icon-action" type="button" data-action="${escapeHtml(action)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">` +
    renderUiIcon(iconName, "assist-config-action-icon") +
    "</button>"
  );
}

export function renderAssistConfigOverlay({
  model,
  apiKey,
  didacticProfileId,
  customPromptGuidance,
  codexEndpoint,
  codexToken,
  modelOptions = [],
  didacticProfileOptions = [],
  localStatus = {}
} = {}) {
  const isCodexLocal = model === "codex-cli-local";
  const statusChip = renderProviderStatusChip({
    localStatus,
    isLocalModel: isCodexLocal,
    hasApiKey: Boolean(String(apiKey || "").trim())
  });

  return (
    '<section class="editor-overlay assist-config-overlay" aria-label="Ajustes da IA">' +
    '<article class="editor-sheet comment-sheet assist-config-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="assist-config-close" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">IA</p>' +
    '<div class="lesson-top-actions assist-config-head-actions">' +
    statusChip +
    "</div></header>" +
    '<div class="editor-body assist-config-body">' +
    '<div class="assist-config-grid">' +
    '<label class="field assist-config-field">' +
    renderUiIcon("sparkles", "assist-config-field-icon") +
    '<select data-field="assist-config-model" aria-label="Motor">' +
    renderOptionList(modelOptions, model) +
    "</select></label>" +
    '<label class="field assist-config-field">' +
    renderUiIcon("tags", "assist-config-field-icon") +
    '<select data-field="assist-config-profile" aria-label="Perfil didático">' +
    renderOptionList(didacticProfileOptions, didacticProfileId) +
    "</select></label>" +
    "</div>" +
    '<label class="field assist-config-field assist-config-secret-field">' +
    renderUiIcon("intent", "assist-config-field-icon") +
    '<input data-field="assist-config-api-key" type="password" value="' +
    escapeHtml(apiKey || "") +
    '" autocomplete="off" spellcheck="false" placeholder="Chave da API">' +
    "</label>" +
    '<label class="field assist-config-field assist-config-guidance-field">' +
    renderUiIcon("prompt", "assist-config-field-icon") +
    '<textarea data-field="assist-config-custom-prompt-guidance" aria-label="Diretivas extras" title="Diretivas extras" placeholder="Diretivas extras, uma por linha.">' +
    escapeHtml(customPromptGuidance || "") +
    "</textarea></label>" +
    (isCodexLocal
      ? '<section class="assist-config-local-panel">' +
        '<div class="assist-config-local-grid">' +
        '<label class="field assist-config-field assist-config-secret-field">' +
        renderUiIcon("folder", "assist-config-field-icon") +
        '<input data-field="assist-config-codex-endpoint" type="text" value="' +
        escapeHtml(codexEndpoint || "") +
        '" autocomplete="off" spellcheck="false" placeholder="Endpoint local">' +
        "</label>" +
        '<label class="field assist-config-field assist-config-secret-field">' +
        renderUiIcon("card", "assist-config-field-icon") +
        '<input data-field="assist-config-codex-token" type="password" value="' +
        escapeHtml(codexToken || "") +
        '" autocomplete="off" spellcheck="false" placeholder="Token local">' +
        "</label>" +
        "</div>" +
        '<div class="assist-config-local-actions">' +
        renderIconAction("test-codex-cli-connection", "progress", "Testar local") +
        renderIconAction("copy-codex-cli-script", "lesson", "Copiar script local") +
        renderIconAction("copy-codex-cli-endpoint", "module", "Copiar endpoint") +
        renderIconAction("copy-codex-cli-health-command", "prompt", "Copiar teste local") +
        "</div>" +
        (localStatus.error && !localStatus.checking
          ? `<p class="tiny muted assist-config-status-text">${escapeHtml(localStatus.error)}</p>`
          : "") +
        "</section>"
      : "") +
    "</div>" +
    "</article></section>"
  );
}
