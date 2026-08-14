import { renderUiIcon } from "./renderUiIcons.js";
import {
  CUSTOM_PROVIDER_MODEL_ID,
  PROVIDER_PROTOCOL,
  PROVIDER_PROTOCOL_OPTIONS
} from "../generation/providers/providerRegistry.js";
import { isDeepSeekModelId } from "../generation/providers/deepSeekPolicy.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderField(label, inputHtml, hint = "") {
  return (
    '<label class="field assist-config-field">' +
    `<span class="assist-config-inline-label"><span>${escapeHtml(label)}</span></span>` +
    inputHtml +
    (hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : "") +
    "</label>"
  );
}

function renderModelOptions(modelOptions = [], selectedModel = "") {
  const options = (Array.isArray(modelOptions) ? modelOptions : [])
    .filter((entry) => String(entry?.value || "").trim())
    .map((entry) => {
      const value = String(entry.value).trim();
      return `<option value="${escapeHtml(value)}"${value === selectedModel ? " selected" : ""}>${escapeHtml(entry.label || value)}</option>`;
    });
  return [
    `<option value=""${selectedModel ? "" : " selected"}>Escolher provider e modelo</option>`,
    ...options
  ].join("");
}

export function renderProviderConfigOverlay({
  selectedModel = "",
  modelOptions = [],
  apiKey = "",
  baseUrl = "",
  codexEndpoint = "",
  codexToken = "",
  providerProtocol = "",
  customModelId = "",
  providerEndpoint = "",
  providerSecret = "",
  codexStatus = null
} = {}) {
  const isCodexLocal = String(selectedModel || "").trim() === "codex-cli-local";
  const normalizedModel = String(selectedModel || "").trim();
  const isDeepSeek = isDeepSeekModelId(normalizedModel);
  const isCustom = normalizedModel === CUSTOM_PROVIDER_MODEL_ID;
  const isCustomOpenAi = isCustom && providerProtocol === PROVIDER_PROTOCOL.OPENAI_COMPATIBLE;
  const isCustomLocal = isCustom && providerProtocol === PROVIDER_PROTOCOL.LOCAL_BRIDGE;
  const protocolOptions = [
    '<option value="">Protocolo</option>',
    ...PROVIDER_PROTOCOL_OPTIONS.map((entry) => (
      `<option value="${escapeHtml(entry.value)}"${entry.value === providerProtocol ? " selected" : ""}>${escapeHtml(entry.label)}</option>`
    ))
  ].join("");
  const statusMessage = String(codexStatus?.error || codexStatus?.message || "").trim();
  const statusClass = codexStatus?.ok ? "is-success" : statusMessage ? "is-warning" : "";
  const modelSelector = renderField(
    "Provider e modelo",
    `<select data-field="assist-model" aria-label="Provider e modelo" title="Provider e modelo">${renderModelOptions(modelOptions, normalizedModel)}</select>`
  );

  return (
    '<section class="editor-overlay assist-config-overlay" aria-label="Configuração de IA">' +
    '<article class="editor-sheet comment-sheet assist-config-sheet" role="dialog" aria-modal="true">' +
    '<header class="editor-head">' +
    '<button class="icon-ghost" type="button" data-action="provider-config-close" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") +
    "</button>" +
    '<p class="editor-title">Configuração de IA</p>' +
    "</header>" +
    '<div class="editor-body assist-config-body">' +
    '<section class="assist-config-panel assist-config-panel-inline" aria-label="Provider">' +
    '<header class="assist-config-inline-head">' +
    '<div class="assist-config-inline-heading">' +
    '<p class="assist-config-section-label"><span>Assistência por IA</span></p>' +
    "</div></header>" +
    modelSelector +
    (normalizedModel && isCustom
      ? renderField(
          "Protocolo",
          `<select data-field="provider-config-protocol" aria-label="Protocolo" title="Protocolo">${protocolOptions}</select>`
        ) +
        renderField(
          "Modelo",
          `<input data-field="provider-config-model" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(customModelId)}" placeholder="Identificador do modelo" title="Identificador do modelo">`
        ) +
        ((isCustomOpenAi || isCustomLocal)
          ? renderField(
              isCustomLocal ? "Endpoint do serviço local" : "Endpoint da operação",
              `<input data-field="provider-config-endpoint" type="url" autocomplete="off" spellcheck="false" value="${escapeHtml(providerEndpoint)}" placeholder="${isCustomLocal ? "http://127.0.0.1:4183/assist" : "https://servico.example/v1/chat/completions"}" title="Endpoint">`,
              isCustomLocal
                ? "HTTP só é aceito no próprio dispositivo."
                : "Informe a URL HTTPS completa da operação."
            )
          : "") +
        (providerProtocol
          ? renderField(
              isCustomLocal ? "Token" : "Chave da API",
              `<input data-field="provider-config-secret" type="password" autocomplete="off" spellcheck="false" value="${escapeHtml(providerSecret)}" placeholder="${isCustomLocal ? "Token obrigatório (32–512 bytes)" : "Chave da API"}" title="${isCustomLocal ? "Token obrigatório do serviço local" : "Chave da API"}"${isCustomLocal ? ' required minlength="32" maxlength="512"' : ""}>`,
              isCustomLocal
                ? "Obrigatório: use o mesmo token de 32 a 512 bytes configurado no serviço local."
                : "O valor permanece somente nesta página."
            )
          : "") +
        (isCustomLocal
          ? '<div class="assist-config-footer"><div class="assist-config-footer-actions provider-config-footer-actions">' +
            '<button class="icon-ghost assist-config-icon-action provider-config-check-action" type="button" data-action="provider-config-check-codex" title="Verificar serviço local" aria-label="Verificar serviço local">' +
            renderUiIcon("ready-state", "assist-config-action-icon") +
            "</button></div>" +
            (statusMessage ? `<p class="field-hint ${escapeHtml(statusClass)}">${escapeHtml(statusMessage)}</p>` : "") +
            "</div>"
          : "")
      : normalizedModel && isCodexLocal
      ? renderField(
          "Endpoint local",
          `<input data-field="provider-config-codex-endpoint" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(codexEndpoint)}" placeholder="http://127.0.0.1:4183/assist" title="Endpoint local">`,
          "Use o endpoint do serviço HTTP local do Codex CLI."
        ) +
        renderField(
          "Token",
          `<input data-field="provider-config-codex-token" type="password" autocomplete="off" spellcheck="false" value="${escapeHtml(codexToken)}" placeholder="Token obrigatório (32–512 bytes)" title="Token obrigatório do serviço local" required minlength="32" maxlength="512">`,
          "Obrigatório: use o mesmo token de 32 a 512 bytes configurado no serviço local."
        ) +
        '<div class="assist-config-footer">' +
        '<div class="assist-config-footer-actions provider-config-footer-actions">' +
        '<button class="icon-ghost assist-config-icon-action provider-config-check-action" type="button" data-action="provider-config-check-codex" title="Verificar serviço local" aria-label="Verificar serviço local">' +
        renderUiIcon("ready-state", "assist-config-action-icon") +
        "</button>" +
        "</div>" +
        (statusMessage
          ? `<p class="field-hint ${escapeHtml(statusClass)}">${escapeHtml(statusMessage)}</p>`
          : "") +
        "</div>"
      : normalizedModel
      ? renderField(
          "Chave da API",
          `<input data-field="assist-api-key" type="password" autocomplete="off" spellcheck="false" value="${escapeHtml(apiKey)}" placeholder="Chave da API" title="Chave da API">`,
          "O valor permanece somente nesta página."
        ) +
        (isDeepSeek
          ? renderField(
              "Base URL",
              `<input data-field="provider-config-base-url" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(baseUrl)}" placeholder="https://..." title="Base URL">`,
              "O padrão do DeepSeek é https://api.deepseek.com."
            )
          : "")
      : "") +
    "</section></div></article></section>"
  );
}
