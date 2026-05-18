import test from "node:test";
import assert from "node:assert/strict";

import { renderAssistConfigOverlay } from "../src/ui/renderAssistConfigOverlay.js";
import { createCourseForgeProfileTuning } from "../src/generation/runtime/courseForgeProfileTuning.js";

test("renderAssistConfigOverlay expõe motor, perfil e parâmetros do perfil sem diretiva solta", () => {
  const html = renderAssistConfigOverlay({
    didacticProfileId: "aralearn.engine.ads.general.v3",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.general.v3", {
      targetStudentProfile: "estudante com base irregular"
    }),
    didacticProfileOptions: [
      { value: "aralearn.engine.ads.general.v3", label: "ADS geral" },
      { value: "aralearn.engine.ads.programming.v1", label: "ADS programação procedural" }
    ]
  });

  assert.match(html, /class="editor-overlay assist-config-overlay"/);
  assert.match(html, /editor-title">IA<\/p>/);
  assert.match(html, /data-field="assist-config-profile"/);
  assert.match(html, /data-field="assist-config-target-student-profile"/);
  assert.match(html, /data-field="assist-config-conceptual-reappearances"/);
  assert.match(html, /data-action="assist-config-reset-profile"/);
  assert.match(html, />Planejamento</);
  assert.match(html, />Ritmo</);
  assert.match(html, />Perfil</);
  assert.match(html, />Para quem</);
  assert.match(html, />Curso</);
  assert.match(html, />Natureza</);
  assert.match(html, />Formas</);
  assert.match(html, />Travas</);
  assert.match(html, />Retoma ideia</);
  assert.match(html, />Explica vocabulário</);
  assert.match(html, /assist-config-infer-course-model/);
  assert.doesNotMatch(html, /data-field="assist-config-model"/);
  assert.doesNotMatch(html, /data-field="assist-config-api-key"/);
  assert.doesNotMatch(html, />Acesso</);
  assert.doesNotMatch(html, /sourceGuideStructured/);
  assert.doesNotMatch(html, /Diretivas extras/);
  assert.doesNotMatch(html, /assist-config-guardrails-text/);
});

test("renderAssistConfigOverlay não mistura setup operacional com o contrato didático do top-down", () => {
  const html = renderAssistConfigOverlay({
    didacticProfileId: "aralearn.engine.ads.systems.v1",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.systems.v1"),
    didacticProfileOptions: [
      { value: "aralearn.engine.ads.systems.v1", label: "ADS terminal e ferramentas" }
    ]
  });

  assert.doesNotMatch(html, /data-field="assist-config-codex-endpoint"/);
  assert.doesNotMatch(html, /data-field="assist-config-codex-token"/);
  assert.doesNotMatch(html, /data-action="test-codex-cli-connection"/);
  assert.doesNotMatch(html, /data-action="copy-codex-cli-script"/);
  assert.doesNotMatch(html, />Motor</);
  assert.doesNotMatch(html, />API</);
});
