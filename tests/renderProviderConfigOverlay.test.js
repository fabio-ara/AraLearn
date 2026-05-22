import test from "node:test";
import assert from "node:assert/strict";

import { renderProviderConfigOverlay } from "../src/ui/renderProviderConfigOverlay.js";

test("renderProviderConfigOverlay mostra somente chave da API para Gemini", () => {
  const html = renderProviderConfigOverlay({
    selectedModel: "gemini-2.5-flash",
    selectedModelLabel: "Gemini 2.5 Flash",
    apiKey: "segredo"
  });

  assert.match(html, /Configuração de IA/);
  assert.match(html, /Gemini 2\.5 Flash/);
  assert.match(html, /data-field="assist-api-key"/);
  assert.doesNotMatch(html, /data-field="assist-config-course-model-description"/);
  assert.doesNotMatch(html, /data-field="provider-config-codex-endpoint"/);
});

test("renderProviderConfigOverlay mostra endpoint e token para Codex local", () => {
  const html = renderProviderConfigOverlay({
    selectedModel: "codex-cli-local",
    selectedModelLabel: "Codex local",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "token-local",
    codexStatus: { error: "bridge offline" }
  });

  assert.match(html, /Codex local/);
  assert.match(html, /data-field="provider-config-codex-endpoint"/);
  assert.match(html, /data-field="provider-config-codex-token"/);
  assert.match(html, /data-action="provider-config-check-codex"/);
  assert.match(html, /provider-config-footer-actions/);
  assert.match(html, /assist-config-action-icon/);
  assert.match(html, /bridge offline/);
  assert.doesNotMatch(html, /data-field="assist-api-key"/);
});

test("renderProviderConfigOverlay mostra chave e base URL para DeepSeek", () => {
  const html = renderProviderConfigOverlay({
    selectedModel: "deepseek-quality",
    selectedModelLabel: "DeepSeek Quality",
    apiKey: "segredo",
    baseUrl: "https://api.deepseek.com"
  });

  assert.match(html, /DeepSeek Quality/);
  assert.match(html, /data-field="assist-api-key"/);
  assert.match(html, /data-field="provider-config-base-url"/);
  assert.match(html, /https:\/\/api\.deepseek\.com/);
});
