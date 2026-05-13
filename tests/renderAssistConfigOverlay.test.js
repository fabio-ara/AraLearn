import test from "node:test";
import assert from "node:assert/strict";

import { renderAssistConfigOverlay } from "../src/ui/renderAssistConfigOverlay.js";

test("renderAssistConfigOverlay prioriza Gemini como caminho normal e marca Codex local como avançado", () => {
  const html = renderAssistConfigOverlay({
    model: "gemini-2.5-flash",
    apiKey: "abc",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "",
    modelOptions: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "codex-cli-local", label: "Codex CLI local · avançado" }
    ]
  });

  assert.match(html, /class="editor-overlay assist-config-overlay"/);
  assert.match(html, /<label>Modelo principal<\/label>/);
  assert.match(html, /<label>Chave Gemini\/API<\/label>/);
  assert.match(html, /Codex local/);
  assert.doesNotMatch(html, /Gemini\/API comum é o caminho normal/);
  assert.doesNotMatch(html, /Preencha estes campos apenas se você realmente for usar Codex CLI local/);
});

test("renderAssistConfigOverlay destaca quando o modo local avançado está ativo", () => {
  const html = renderAssistConfigOverlay({
    model: "codex-cli-local",
    apiKey: "",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "segredo",
    modelOptions: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "codex-cli-local", label: "Codex CLI local · avançado" }
    ]
  });

  assert.match(html, /Modo avançado ativo/);
  assert.doesNotMatch(html, /bridge local antes de gerar ou editar/);
});
