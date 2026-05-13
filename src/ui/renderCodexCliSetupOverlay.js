function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStatus(status = {}) {
  if (status.checking) {
    return "Testando conexão...";
  }
  if (status.ok) {
    return "Bridge local ativo";
  }
  if (status.error) {
    return "Bridge local não encontrado";
  }
  return "Aguardando teste de conexão";
}

export function renderCodexCliSetupOverlay({
  endpoint,
  status = {},
  setupScript,
  presentation = {}
} = {}) {
  const detail = status.ok
    ? escapeHtml(status.data?.service || "Resposta de saúde recebida.")
    : status.error
      ? escapeHtml(status.error)
      : "Use os botões abaixo para copiar o setup e testar o bridge local.";
  const quickSteps = Array.isArray(presentation.quickSteps)
    ? presentation.quickSteps
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")
    : "";

  return (
    '<section class="editor-overlay" aria-label="Configurar Codex CLI">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="close-codex-cli-setup" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Configurar Codex CLI</p>' +
    '<div class="topbar-space" aria-hidden="true"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    `<p class="tiny muted">${escapeHtml(presentation.introText || "")}</p>` +
    '<div class="field">' +
    "<label>Status da conexão</label>" +
    `<p>${escapeHtml(renderStatus(status))}</p>` +
    `<p class="tiny muted">${detail}</p>` +
    "</div>" +
    '<div class="field">' +
    "<label>Plataforma detectada</label>" +
    `<input type="text" value="${escapeHtml(presentation.platformLabel || "")}" readonly spellcheck="false">` +
    "</div>" +
    '<div class="field">' +
    "<label>Endpoint atual</label>" +
    `<input type="text" value="${escapeHtml(endpoint || "")}" readonly spellcheck="false">` +
    "</div>" +
    '<div class="field">' +
    "<label>Instruções rápidas</label>" +
    `<ol class="tiny muted">${quickSteps}</ol>` +
    "</div>" +
    '<div class="generate-action-row assist-actions assist-actions-wide">' +
    '<button class="icon-ghost" type="button" data-action="test-codex-cli-connection">Testar conexão</button>' +
    '<button class="icon-ghost" type="button" data-action="copy-codex-cli-script">' +
    escapeHtml(presentation.copyScriptButtonLabel || "Copiar script") +
    "</button>" +
    '<button class="icon-ghost" type="button" data-action="copy-codex-cli-endpoint">Copiar endpoint</button>' +
    '<button class="icon-ghost" type="button" data-action="copy-codex-cli-health-command">' +
    escapeHtml(presentation.healthCommandButtonLabel || "Copiar comando de teste") +
    "</button>" +
    '<button class="open-main" type="button" data-action="close-codex-cli-setup">Fechar</button>' +
    "</div>" +
    '<div class="field">' +
    `<label>${escapeHtml(presentation.scriptFieldLabel || "Script")}</label>` +
    `<textarea readonly spellcheck="false" style="min-height:320px">${escapeHtml(setupScript || "")}</textarea>` +
    "</div>" +
    "</div>" +
    "</article></section>"
  );
}
