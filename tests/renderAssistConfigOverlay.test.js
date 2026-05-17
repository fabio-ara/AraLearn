import test from "node:test";
import assert from "node:assert/strict";

import { renderAssistConfigOverlay } from "../src/ui/renderAssistConfigOverlay.js";
import { createCourseForgeProfileTuning } from "../src/generation/runtime/courseForgeProfileTuning.js";

test("renderAssistConfigOverlay expõe motor, perfil e parâmetros do perfil sem diretiva solta", () => {
  const html = renderAssistConfigOverlay({
    model: "gemini-2.5-flash",
    apiKey: "abc",
    didacticProfileId: "aralearn.engine.ads.general.v3",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.general.v3", {
      targetStudentProfile: "estudante com base irregular",
      guardrailsText: "Priorize contraste."
    }),
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
  assert.match(html, /data-field="assist-config-target-student-profile"/);
  assert.match(html, /data-field="assist-config-conceptual-reappearances"/);
  assert.match(html, /data-field="assist-config-guardrails-text"/);
  assert.match(html, /data-action="assist-config-reset-profile"/);
  assert.match(html, /Priorize contraste\./);
  assert.doesNotMatch(html, /Diretivas extras/);
});

test("renderAssistConfigOverlay concentra o setup local no mesmo overlay quando Codex local está ativo", () => {
  const html = renderAssistConfigOverlay({
    model: "codex-cli-local",
    apiKey: "",
    didacticProfileId: "aralearn.engine.ads.systems.v1",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.systems.v1"),
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
