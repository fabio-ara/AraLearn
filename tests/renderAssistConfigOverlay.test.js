import test from "node:test";
import assert from "node:assert/strict";

import { renderAssistConfigOverlay } from "../src/ui/renderAssistConfigOverlay.js";
import { createCourseForgeProfileTuning } from "../src/generation/runtime/courseForgeProfileTuning.js";

test("renderAssistConfigOverlay expõe contrato discreto do top-down sem setup operacional", () => {
  const html = renderAssistConfigOverlay({
    didacticProfileId: "aralearn.engine.ads.general.v3",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.general.v3", {
      targetStudentProfile: "estudante com base irregular"
    }),
    didacticProfileOptions: [
      { value: "aralearn.engine.ads.general.v3", label: "Geral" },
      { value: "aralearn.engine.ads.programming.v1", label: "Programação procedural" }
    ]
  });

  assert.match(html, /class="editor-overlay assist-config-overlay"/);
  assert.match(html, /editor-title">Planejamento didático<\/p>/);
  assert.match(html, /data-field="assist-config-profile"/);
  assert.match(html, /data-field="assist-config-target-student-profile"/);
  assert.match(html, /data-action="assist-config-create-custom-profile"/);
  assert.match(html, /data-field="assist-config-course-model-description"/);
  assert.match(html, /data-field="assist-config-course-learning-trail"/);
  assert.match(html, /data-field="assist-config-course-microsequence-progression"/);
  assert.match(html, /data-action="assist-config-reset-profile"/);
  assert.match(html, />Planejamento</);
  assert.match(html, />Estrutura</);
  assert.match(html, />Perfil</);
  assert.match(html, />Para quem</);
  assert.match(html, />Curso</);
  assert.match(html, />Trilha</);
  assert.match(html, />Progressão de microssequências</);
  assert.match(html, />Microssequências por lição</);
  assert.match(html, /data-field="assist-config-min-microsequences"/);
  assert.match(html, /data-field="assist-config-target-microsequences"/);
  assert.match(html, /data-field="assist-config-max-microsequences"/);
  assert.match(html, />Esgotar assunto antes de expandir</);
  assert.match(html, /assist-config-infer-course-model/);
  assert.doesNotMatch(html, />Ler pedido</);
  assert.doesNotMatch(html, /data-field="assist-config-model"/);
  assert.doesNotMatch(html, /data-field="assist-config-api-key"/);
  assert.doesNotMatch(html, /data-field="assist-config-course-primary-representation"/);
  assert.doesNotMatch(html, /data-field="assist-config-course-secondary-representation"/);
  assert.doesNotMatch(html, /data-field="assist-config-course-primary-operation"/);
  assert.doesNotMatch(html, /data-field="assist-config-course-primary-difficulty"/);
  assert.doesNotMatch(html, /data-field="assist-config-course-secondary-difficulty"/);
  assert.doesNotMatch(html, /data-field="assist-config-course-preferred-practice-mode"/);
  assert.doesNotMatch(html, /data-field="assist-config-conceptual-reappearances"/);
  assert.doesNotMatch(html, /data-field="assist-config-operational-reappearances"/);
  assert.doesNotMatch(html, />Acesso</);
  assert.doesNotMatch(html, />Forma principal</);
  assert.doesNotMatch(html, />Prática preferida</);
  assert.doesNotMatch(html, />Trava principal</);
  assert.doesNotMatch(html, />Retomada conceitual</);
  assert.doesNotMatch(html, />Explica vocabulário</);
  assert.doesNotMatch(html, /sourceGuideStructured/);
  assert.doesNotMatch(html, /Diretivas extras/);
  assert.doesNotMatch(html, /assist-config-guardrails-text/);
});

test("renderAssistConfigOverlay não mistura setup operacional com o contrato didático do top-down", () => {
  const html = renderAssistConfigOverlay({
    didacticProfileId: "aralearn.engine.ads.systems.v1",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.systems.v1"),
    didacticProfileOptions: [
      { value: "aralearn.engine.ads.systems.v1", label: "Script em terminal" }
    ]
  });

  assert.doesNotMatch(html, /data-field="assist-config-codex-endpoint"/);
  assert.doesNotMatch(html, /data-field="assist-config-codex-token"/);
  assert.doesNotMatch(html, /data-action="test-codex-cli-connection"/);
  assert.doesNotMatch(html, /data-action="copy-codex-cli-script"/);
  assert.doesNotMatch(html, />Motor</);
  assert.doesNotMatch(html, />API</);
});

test("renderAssistConfigOverlay expõe nome editável quando o perfil derivado está selecionado", () => {
  const html = renderAssistConfigOverlay({
    didacticProfileId: "assist.custom.demo",
    profileTuning: createCourseForgeProfileTuning("aralearn.engine.ads.general.v3"),
    didacticProfileOptions: [
      { value: "aralearn.engine.ads.general.v3", label: "Geral" },
      { value: "assist.custom.demo", label: "Geral personalizado" }
    ],
    isCustomProfileSelected: true,
    customProfileLabel: "Geral personalizado"
  });

  assert.match(html, /data-field="assist-config-custom-profile-label"/);
  assert.match(html, />Nome do perfil</);
  assert.match(html, /value="Geral personalizado"/);
});
