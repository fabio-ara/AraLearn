import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { addPracticeToMicrosequence } from "../src/generation/bottomUp/addPracticeToMicrosequence.js";
import { createSupportMicrosequence } from "../src/generation/bottomUp/createSupportMicrosequence.js";
import { generateMicrosequenceCards } from "../src/generation/bottomUp/generateMicrosequenceCards.js";
import { generateNextMicrosequence } from "../src/generation/bottomUp/generateNextMicrosequence.js";

function createProject() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-1",
        title: "Git e GitHub",
        evidencePriority: ["documentation"],
        modules: [
          {
            key: "module-1",
            title: "Comandos básicos",
            include: [{ id: "scope-git-status", label: "git status", normalizedLabel: "git status" }],
            exclude: [],
            assessmentStyle: "practical",
            lessons: [
              {
                key: "lesson-1",
                title: "Primeiros comandos",
                goal: "Criar repertório mínimo.",
                microsequences: [
                  {
                    key: "micro-1",
                    title: "git status",
                    goal: "Ler o estado do repositório.",
                    type: "main",
                    status: "planned",
                    dependsOn: [],
                    scopeRefs: ["scope-git-status"],
                    versions: []
                  },
                  {
                    key: "micro-2",
                    title: "git add",
                    goal: "Adicionar arquivos ao staging.",
                    type: "main",
                    status: "planned",
                    dependsOn: ["micro-1"],
                    scopeRefs: ["scope-git-status"],
                    versions: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

const selection = {
  courseKey: "course-1",
  moduleKey: "module-1",
  lessonKey: "lesson-1",
  microsequenceKey: "micro-1"
};

test("bottom-up gera nova versão sem apagar a anterior", async () => {
  const provider = createFakeProvider({
    script: {
      "generate-microsequence": {
        summary: "Versão inicial.",
        cards: [
          { key: "card-1", resourceType: "say", content: "git status mostra o estado do repositório." },
          { key: "card-2", resourceType: "code", content: { code: "git status", language: "bash" } },
          { key: "card-3", resourceType: "say", content: "Observe arquivos novos, modificados e rastreados." },
          { key: "card-4", resourceType: "block_gap_fill", content: "Use [[git status::git status|git add|git push]]." }
        ]
      },
      "add-practice": {
        summary: "Versão com prática.",
        cards: [
          { key: "card-1", resourceType: "say", content: "git status mostra o estado do repositório." },
          { key: "card-2", resourceType: "code", content: { code: "git status", language: "bash" } },
          { key: "card-3", resourceType: "say", content: "Use antes e depois de git add." },
          { key: "card-4", resourceType: "block_gap_fill", content: "Rode [[git status::git status|git clone|git commit]]." },
          { key: "card-5", resourceType: "say", content: "Compare a saída." },
          { key: "card-6", resourceType: "say", content: "Repita até reconhecer os estados comuns." }
        ]
      },
      "create-support": {
        title: "Suporte: repositório e staging",
        goal: "Explicar a diferença entre working tree e staging.",
        supportReason: "Pré-requisito local",
        summary: "Microssequência de apoio.",
        cards: [
          { key: "card-1", resourceType: "say", content: "A working tree é o estado editável; o staging prepara o commit." },
          { key: "card-2", resourceType: "say", content: "git add move a seleção para o staging." },
          { key: "card-3", resourceType: "code", content: { code: "git add arquivo.txt", language: "bash" } },
          { key: "card-4", resourceType: "say", content: "Volte depois para retomar git status." }
        ]
      }
    }
  });

  const generated = await generateMicrosequenceCards({
    project: createProject(),
    selection,
    provider,
    modelId: "fake:model"
  });
  const firstMicro = generated.project.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(firstMicro.versions.length, 1);
  assert.equal(firstMicro.status, "generated");

  const practiced = await addPracticeToMicrosequence({
    project: generated.project,
    selection,
    provider,
    modelId: "fake:model",
    density: "deep"
  });
  const practicedMicro = practiced.project.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(practicedMicro.versions.length, 2);
  assert.equal(practicedMicro.title, "git status");

  const supported = await createSupportMicrosequence({
    project: practiced.project,
    selection,
    provider,
    modelId: "fake:model"
  });
  const lessonMicrosequences = supported.project.courses[0].modules[0].lessons[0].microsequences;
  assert.equal(lessonMicrosequences[1].type, "support");
});

test("gerar próxima não exige prompt livre", async () => {
  const provider = createFakeProvider({
    script: {
      "generate-microsequence": [
        {
          summary: "Versão inicial.",
          cards: [
            { key: "card-1", resourceType: "say", content: "git status mostra o estado do repositório." },
            { key: "card-2", resourceType: "code", content: { code: "git status", language: "bash" } },
            { key: "card-3", resourceType: "say", content: "Observe a saída." },
            { key: "card-4", resourceType: "block_gap_fill", content: "Use [[git status::git status|git add|git push]]." }
          ]
        },
        {
          summary: "Próxima etapa.",
          cards: [
            { key: "card-1", resourceType: "say", content: "git add leva arquivos ao staging." },
            { key: "card-2", resourceType: "code", content: { code: "git add arquivo.txt", language: "bash" } },
            { key: "card-3", resourceType: "say", content: "Depois, verifique novamente com git status." },
            { key: "card-4", resourceType: "block_gap_fill", content: "Rode [[git add::git add|git push|git status]]." }
          ]
        }
      ]
    }
  });

  const generated = await generateMicrosequenceCards({
    project: createProject(),
    selection,
    provider,
    modelId: "fake:model"
  });

  const next = await generateNextMicrosequence({
    project: generated.project,
    selection,
    provider,
    modelId: "fake:model"
  });

  assert.equal(next.selection.microsequenceKey, "micro-2");
});
