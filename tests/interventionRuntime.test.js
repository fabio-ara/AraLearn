import test from "node:test";
import assert from "node:assert/strict";
import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";

import {
  buildInterventionRequestFromDraft,
  buildMicrosequencePrompt,
  executeMicrosequenceGeneration,
  prepareMicrosequenceGeneration,
  resolveMicrosequenceRequestConfig
} from "../src/generation/runtime/interventionRuntime.js";

test("buildMicrosequencePrompt acrescenta hints locais sem perder o pedido principal", () => {
  const prompt = buildMicrosequencePrompt({
    promptText: "Reforce a explicação.",
    dependencyTitles: ["Introdução", "Pré-requisitos"],
    selectedDidacticTypeId: "guided_practice",
    preferredContainerLabel: "Pergunta"
  });

  assert.match(prompt, /Reforce a explicação\./);
  assert.match(prompt, /Introdução, Pré-requisitos/);
  assert.match(prompt, /guided_practice/);
  assert.match(prompt, /Pergunta/);
});

test("resolveMicrosequenceRequestConfig escolhe repair_only para pedidos de correção", () => {
  assert.deepEqual(
    resolveMicrosequenceRequestConfig({
      promptText: "Corrija a progressão desta microssequência."
    }),
    {
      operation: "repair",
      requestedGenerationDepth: "repair_only",
      interventionModeHint: "targeted_single_microsequence"
    }
  );

  assert.deepEqual(
    resolveMicrosequenceRequestConfig({
      promptText: "Expanda a prática guiada."
    }),
    {
      operation: "reinforce",
      requestedGenerationDepth: "reinforce_only",
      interventionModeHint: "targeted_single_microsequence"
    }
  );
});

test("buildInterventionRequestFromDraft monta pedido estruturado para nova microssequência", () => {
  const result = buildInterventionRequestFromDraft({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-atual"
    },
    draft: {
      promptText: "Insira uma ponte antes da prática principal.",
      interventionTargetMode: "new_after_current",
      operationMode: "reinforce",
      interventionType: "guided_practice_bridge",
      domainRef: "concept-main",
      bridgeTargetRef: "concept-main",
      prerequisiteRefs: ["concept-base"]
    },
    lessonContext: {
      microsequenceKeys: ["micro-atual", "micro-seguinte"],
      reusableMicrosequenceCount: 2
    }
  });

  assert.equal(result.recommendedAction, "needs_new_microsequence");
  assert.equal(result.target.level, "lesson");
  assert.equal(result.editorIntent.operation, "extend");
  assert.equal(result.editorIntent.interventionModeHint, "targeted_scope_expansion");
  assert.equal(result.requestedChanges[0].patchStrategy, "add_microsequence");
  assert.equal(result.requestedChanges[0].didacticInterventionType, "guided_practice_bridge");
  assert.deepEqual(result.contextSnapshot.microsequenceKeys, ["micro-atual", "micro-seguinte"]);
});

test("prepareMicrosequenceGeneration monta request local no escopo da microssequência", async () => {
  const prepared = await prepareMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Aprofunde a explicação.",
      attachments: [{ name: "apoio.md" }]
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    dependencyTitles: ["Base anterior"],
    selectedDidacticTypeId: "explain",
    preferredContainerLabel: "Parágrafo",
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({ ...item, textContent: "conteúdo" })),
      extractedCount: 1,
      warnings: []
    })
  });

  assert.equal(prepared.requestConfig.operation, "reinforce");
  assert.equal(prepared.requestConfig.requestedGenerationDepth, "reinforce_only");
  assert.deepEqual(prepared.request.intent.scope, {
    level: "microsequence",
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a"
  });
  assert.equal(prepared.request.intent.attachments[0].textContent, "conteúdo");
  assert.match(prepared.request.intent.promptText, /Base anterior/);
});

test("prepareMicrosequenceGeneration rejeita falta de alvo ou de entrada útil", async () => {
  await assert.rejects(
    () =>
      prepareMicrosequenceGeneration({
        selection: {},
        draft: { promptText: "Teste" },
        assistConfig: {},
        ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
      }),
    /Selecione uma microssequência válida/
  );

  await assert.rejects(
    () =>
      prepareMicrosequenceGeneration({
        selection: {
          courseKey: "course-a",
          moduleKey: "module-a",
          lessonKey: "lesson-a",
          microsequenceKey: "micro-a"
        },
        draft: {
          promptText: "",
          attachments: [{ name: "scan.pdf" }]
        },
        assistConfig: {},
        ingestAttachments: async (attachments) => ({
          attachments,
          extractedCount: 0,
          warnings: []
        })
      }),
    /Informe um pedido ou anexo com texto utilizável/
  );
});

test("executeMicrosequenceGeneration abre setup quando provider local nao responde", async () => {
  const result = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Corrija a progressão."
    },
    assistConfig: {
      model: "codex-cli-local",
      codexEndpoint: "http://127.0.0.1:4183/assist",
      codexToken: "segredo"
    },
    checkCodexLocalHealth: async () => ({
      ok: false,
      error: "bridge offline"
    })
  });

  assert.equal(result.status, "provider-unready");
  assert.equal(result.errorMessage, "bridge offline");
});

test("executeMicrosequenceGeneration executa fluxo local no runtime novo", async () => {
  const projectDocument = {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-a",
        title: "Curso A",
        modules: [
          {
            key: "module-a",
            title: "Módulo A",
            lessons: [
              {
                key: "lesson-a",
                title: "Lição A",
                microsequences: [{ key: "micro-a", title: "Microssequência A", status: "draft", included: false, cards: [] }]
              }
            ]
          }
        ]
      }
    ]
  };
  const provider = createFakeProvider({
    script: {
      "generate-microsequence": {
        summary: "Versão inicial.",
        cards: [
          { key: "card-1", resourceType: "say", content: "Primeiro card." },
          { key: "card-2", resourceType: "code", content: { code: "echo ok", language: "bash" } },
          { key: "card-3", resourceType: "say", content: "Terceiro card." },
          { key: "card-4", resourceType: "block_gap_fill", content: "Use [[echo ok::echo ok|echo no]]." }
        ]
      }
    }
  });

  const result = await executeMicrosequenceGeneration({
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    draft: {
      promptText: "Expanda a explicação.",
      attachments: [{ name: "apoio.md" }]
    },
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "chave"
    },
    dependencyTitles: ["Base anterior"],
    selectedDidacticTypeId: "explain",
    preferredContainerLabel: "Parágrafo",
    projectDocument,
    provider,
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({ ...item, textContent: "conteúdo" })),
      extractedCount: 1,
      warnings: []
    })
  });

  assert.equal(result.status, "success");
  assert.match(result.preparedIntervention.request.intent.promptText, /Base anterior/);
  const microsequence = result.generationResult.projectDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.status, "ready");
  assert.equal(microsequence.cards.length, 4);
});
