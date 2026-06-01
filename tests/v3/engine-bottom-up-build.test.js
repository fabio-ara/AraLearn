import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { runBottomUpCardBuild } from "../../src/generation/engine/bottomUpBuildRuntime.js";

test("build falha fechado quando o conteúdo obrigatório continua ausente", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_card_build: [
        { text: "CARD 1\n1: Título incompleto\n2: Pergunta sem alternativas" },
        { text: "CARD 1\n1: Título ainda incompleto" },
        { text: "CARD 1\n1: Título final sem conteúdo suficiente" }
      ]
    }
  });

  await assert.rejects(() => runBottomUpCardBuild({
    provider,
    modelId: "fake:model",
    generationContract: { microsequence: { title: "Teste" } },
    planItems: [
      {
        position: 1,
        templateId: "choice_exercise",
        goal: "Fechar prática",
        role: "practice"
      }
    ]
  }), /fail_closed/);
});
