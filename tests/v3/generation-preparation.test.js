import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { prepareStructureGeneration } from "../../src/generation/runtime/generationRuntime.js";
import { generateStructureProjectDocument } from "../../src/generation/runtime/projectGenerationRuntime.js";

test("top-down usa os anexos extraídos e o perfil didático realmente selecionado", async () => {
  const prompts = [];
  const provider = createFakeProvider({
    script: {
      top_down_structure: ({ prompt }) => {
        prompts.push(prompt);
        return {
          text: JSON.stringify({
            course: {
              title: "Curso de teste",
              goal: "Compreender criptografia.",
              modules: [
                {
                  title: "Módulo de teste",
                  lessons: [
                    {
                      title: "Lição de teste",
                      microsequences: [
                        {
                          title: "Vocabulário inicial",
                          goal: "Explicar confidencialidade com base na fonte.",
                          role: "explain",
                          dependsOn: [],
                          covers: ["confidencialidade"],
                          checks: ["o aluno explica confidencialidade"]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          }),
          usage: {}
        };
      },
      top_down_structure_audit: ({ prompt }) => {
        prompts.push(prompt);
        return { text: "STATUS OK", usage: {} };
      }
    }
  });
  const draft = {
    courseInput: "Curso de teste",
    moduleInput: "Módulo de teste",
    lessonInput: "Lição de teste",
    includeTopics: ["confidencialidade"],
    excludeTopics: [],
    promptText: "Monte a estrutura delimitada.",
    attachments: [{ name: "ementa.txt" }]
  };
  const scopeState = {
    course: { title: "Curso de teste" },
    moduleValue: { title: "Módulo de teste" },
    lesson: { title: "Lição de teste" }
  };
  const prepared = await prepareStructureGeneration({
    scopeState,
    draft,
    assistConfig: {
      model: "fake:model",
      didacticProfileId: "academic",
      profileTuning: {
        targetStudentProfile: "Pessoa iniciante, sem conhecimento prévio",
        minMicrosequences: 2,
        targetMicrosequences: 3,
        maxMicrosequences: 5
      }
    },
    provider,
    ingestAttachments: async () => ({
      attachments: [
        {
          name: "ementa.txt",
          displayName: "Ementa",
          textContent: "FONTE DISTINTIVA: confidencialidade protege contra leitura indevida."
        }
      ],
      warnings: [],
      extractedCount: 1
    })
  });

  const result = await generateStructureProjectDocument({
    draft,
    scopeState,
    projectDocument: createEmptyProjectDocument(),
    preparedGeneration: prepared
  });

  assert.equal(result.projectDocument.courses.length, 1);
  assert.equal(prompts.length, 2);
  prompts.forEach((prompt) => {
    assert.match(prompt, /FONTE DISTINTIVA/);
    assert.match(prompt, /Pessoa iniciante, sem conhecimento prévio/);
  });
});
