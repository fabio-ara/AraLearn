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

export function renderCodexTermuxSetupOverlay({ endpoint, token, status = {}, setupScript }) {
  const healthCommandButtonLabel = token ? "Copiar comando de teste" : "Copiar comando de teste";
  const detail = status.ok
    ? escapeHtml(status.data?.service || "Resposta de saúde recebida.")
    : status.error
      ? escapeHtml(status.error)
      : "Use os botões abaixo para copiar o setup e testar o bridge local.";

  return (
    '<section class="editor-overlay" aria-label="Configurar Codex CLI · Termux">' +
    '<article class="editor-sheet comment-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="close-codex-termux-setup" title="Fechar" aria-label="Fechar">&times;</button>' +
    '<p class="editor-title">Configurar Codex CLI · Termux</p>' +
    '<div class="topbar-space" aria-hidden="true"></div>' +
    "</header>" +
    '<div class="editor-body">' +
    '<p class="tiny muted">O AraLearn não pode instalar Termux nem executar shell diretamente por restrições do Android. Para usar Codex como API local, rode o bridge abaixo no Termux.</p>' +
    '<div class="field">' +
    "<label>Status da conexão</label>" +
    `<p>${escapeHtml(renderStatus(status))}</p>` +
    `<p class="tiny muted">${detail}</p>` +
    "</div>" +
    '<div class="field">' +
    "<label>Endpoint atual</label>" +
    `<input type="text" value="${escapeHtml(endpoint || "")}" readonly spellcheck="false">` +
    "</div>" +
    '<div class="field">' +
    "<label>Instruções rápidas</label>" +
    '<ol class="tiny muted">' +
    "<li>Instale/abra Termux.</li>" +
    "<li>Cole o script copiado.</li>" +
    "<li>Aguarde o bridge iniciar.</li>" +
    "<li>Volte ao AraLearn e toque em Testar conexão.</li>" +
    "<li>Se ficar ativo, use o modelo normalmente.</li>" +
    "</ol>" +
    "</div>" +
    '<div class="generate-action-row assist-actions assist-actions-wide">' +
    '<button class="icon-ghost" type="button" data-action="test-codex-termux-connection">Testar conexão</button>' +
    '<button class="icon-ghost" type="button" data-action="copy-codex-termux-script">Copiar script para Termux</button>' +
    '<button class="icon-ghost" type="button" data-action="copy-codex-termux-endpoint">Copiar endpoint</button>' +
    `<button class="icon-ghost" type="button" data-action="copy-codex-termux-health-command">${escapeHtml(healthCommandButtonLabel)}</button>` +
    '<button class="open-main" type="button" data-action="close-codex-termux-setup">Fechar</button>' +
    "</div>" +
    '<div class="field">' +
    "<label>Script para colar no Termux</label>" +
    `<textarea readonly spellcheck="false" style="min-height:320px">${escapeHtml(setupScript || "")}</textarea>` +
    "</div>" +
    "</div>" +
    "</article></section>"
  );
}
