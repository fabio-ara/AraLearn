import test from "node:test";
import assert from "node:assert/strict";

import { renderAssistConfigOverlay } from "../src/ui/renderAssistConfigOverlay.js";

test("renderAssistConfigOverlay expõe motor, perfil e diretivas extras sem texto de bastidor", () => {
  const html = renderAssistConfigOverlay({
    model: "gemini-2.5-flash",
    apiKey: "abc",
    didacticProfileId: "aralearn.engine.ads.general.v3",
    customPromptGuidance: "Priorize contraste.",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "",
    localStatus: { ok: false, checking: false, error: "" },
    modelOptions: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "codex-cli-local", label: "Codex local" }
    ],
    didacticProfileOptions: [
      { value: "aralearn.engine.ads.general.v3", label: "ADS geral" },
      { value: "aralearn.engine.ads.programming.v1", label: "ADS programação procedural" }
    ]
  });

  assert.match(html, /class="editor-overlay assist-config-overlay"/);
  assert.match(html, /editor-title">IA<\/p>/);
  assert.match(html, /data-field="assist-config-model"/);
  assert.match(html, /data-field="assist-config-profile"/);
  assert.match(html, /data-field="assist-config-api-key"/);
  assert.match(html, /data-field="assist-config-custom-prompt-guidance"/);
  assert.match(html, /Priorize contraste\./);
  assert.doesNotMatch(html, /Modo avançado ativo/);
});

test("renderAssistConfigOverlay concentra o setup local no mesmo overlay quando Codex local está ativo", () => {
  const html = renderAssistConfigOverlay({
    model: "codex-cli-local",
    apiKey: "",
    didacticProfileId: "aralearn.engine.ads.systems.v1",
    customPromptGuidance: "",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "segredo",
    localStatus: { ok: false, checking: false, error: "bridge offline" },
    modelOptions: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "codex-cli-local", label: "Codex local" }
    ],
    didacticProfileOptions: [
      { value: "aralearn.engine.ads.systems.v1", label: "ADS terminal e ferramentas" }
    ]
  });

  assert.match(html, /Local: offline/);
  assert.match(html, /data-field="assist-config-codex-endpoint"/);
  assert.match(html, /data-field="assist-config-codex-token"/);
  assert.match(html, /data-action="test-codex-cli-connection"/);
  assert.match(html, /data-action="copy-codex-cli-script"/);
  assert.match(html, /bridge offline/);
});
