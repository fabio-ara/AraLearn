import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCourseForgeMicrosequencePrompt,
  executeCourseForgeMicrosequenceGeneration,
  prepareCourseForgeMicrosequenceGeneration,
  resolveCourseForgeMicrosequenceRequestConfig
} from "../src/generation/runtime/courseForgeInterventionRuntime.js";

test("buildCourseForgeMicrosequencePrompt acrescenta hints locais sem perder o pedido principal", () => {
  const prompt = buildCourseForgeMicrosequencePrompt({
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

test("resolveCourseForgeMicrosequenceRequestConfig escolhe repair_only para pedidos de correção", () => {
  assert.deepEqual(
    resolveCourseForgeMicrosequenceRequestConfig({
      promptText: "Corrija a progressão desta microssequência."
    }),
    {
      operation: "repair",
      requestedGenerationDepth: "repair_only"
    }
  );

  assert.deepEqual(
    resolveCourseForgeMicrosequenceRequestConfig({
      promptText: "Expanda a prática guiada."
    }),
    {
      operation: "reinforce",
      requestedGenerationDepth: "reinforce_only"
    }
  );
});

test("prepareCourseForgeMicrosequenceGeneration monta request local no escopo da microssequência", async () => {
  const prepared = await prepareCourseForgeMicrosequenceGeneration({
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

test("prepareCourseForgeMicrosequenceGeneration rejeita falta de alvo ou de entrada útil", async () => {
  await assert.rejects(
    () =>
      prepareCourseForgeMicrosequenceGeneration({
        selection: {},
        draft: { promptText: "Teste" },
        assistConfig: {},
        ingestAttachments: async () => ({ attachments: [], extractedCount: 0, warnings: [] })
      }),
    /Selecione uma microssequência válida/
  );

  await assert.rejects(
    () =>
      prepareCourseForgeMicrosequenceGeneration({
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

test("executeCourseForgeMicrosequenceGeneration abre setup quando provider local nao responde", async () => {
  const result = await executeCourseForgeMicrosequenceGeneration({
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
    }),
    runCourseForge: async () => {
      throw new Error("nao deveria executar");
    }
  });

  assert.equal(result.status, "provider-unready");
  assert.equal(result.errorMessage, "bridge offline");
});

test("executeCourseForgeMicrosequenceGeneration executa fluxo local no runtime novo", async () => {
  const projectDocument = {
    courses: [
      {
        key: "course-a",
        modules: [
          {
            key: "module-a",
            lessons: [
              {
                key: "lesson-a",
                microsequences: [{ key: "micro-a", cards: [] }]
              }
            ]
          }
        ]
      }
    ]
  };

  const result = await executeCourseForgeMicrosequenceGeneration({
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
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({ ...item, textContent: "conteúdo" })),
      extractedCount: 1,
      warnings: []
    }),
    runCourseForge: async (request) => ({
      projectDocument: {
        ...projectDocument,
        generated: request.intent.promptText
      },
      patch: {
        target: {
          courseKey: "course-a",
          moduleKey: "module-a",
          lessonKey: "lesson-a",
          microsequenceKey: "micro-a"
        }
      }
    })
  });

  assert.equal(result.status, "success");
  assert.match(result.preparedIntervention.request.intent.promptText, /Base anterior/);
  assert.equal(result.courseForgeResult.projectDocument.generated.includes("Expanda a explicação."), true);
});
