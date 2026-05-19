import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { addPracticeToMicrosequence } from "../src/generation/bottomUp/addPracticeToMicrosequence.js";
import { generateMicrosequenceCards } from "../src/generation/bottomUp/generateMicrosequenceCards.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";

const fakeProvider = createFakeProvider({
  script: {
    "plan-scope": {
      course: {
        title: "Git e GitHub",
        modules: [
          {
            title: "Comandos básicos",
            lessons: [
              {
                title: "Primeiros comandos",
                goal: "Criar repertório mínimo.",
                sourceGuideStructured: {
                  lessonGoal: "Introduzir o primeiro comando operacional do fluxo local.",
                  notationRules: "git status",
                  commonErrors: "Não confundir inspeção de estado com alteração do repositório."
                },
                microsequences: [
                  {
                    title: "git status",
                    goal: "Entender o estado do repositório.",
                    dependsOnTitles: [],
                    scopeLabels: ["git status"]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    "generate-microsequence": {
      summary: "Versão inicial da microssequência.",
      cards: [
        { key: "card-1", resourceType: "say", content: "O comando git status mostra o estado atual do repositório." },
        { key: "card-2", resourceType: "code", content: { code: "git status", language: "bash" } },
        { key: "card-3", resourceType: "say", content: "Use git status antes e depois de cada alteração relevante." },
        { key: "card-4", resourceType: "block_gap_fill", content: "Para inspecionar o estado do repositório, use [[git status::git status|git clone|git add]]." }
      ]
    },
    "add-practice": {
      summary: "Versão com mais prática.",
      cards: [
        { key: "card-1", resourceType: "say", content: "O comando git status mostra o estado atual do repositório." },
        { key: "card-2", resourceType: "code", content: { code: "git status", language: "bash" } },
        { key: "card-3", resourceType: "say", content: "Observe arquivos modificados, novos e já rastreados." },
        { key: "card-4", resourceType: "block_gap_fill", content: "Antes de fazer commit, rode [[git status::git status|git push|git clone]]." },
        { key: "card-5", resourceType: "say", content: "Compare o resultado antes e depois de git add." },
        { key: "card-6", resourceType: "say", content: "Use o comando até reconhecer rapidamente cada estado comum." }
      ]
    }
  }
});

const planned = await planCourseFromScope({
  scopeContract: {
    schemaVersion: "aralearn.scope.v1",
    course: { title: "Git e GitHub", evidencePriority: ["documentation"] },
    modules: [
      {
        title: "Comandos básicos",
        include: ["git status"],
        exclude: [],
        assessmentStyle: "practical"
      }
    ]
  },
  provider: fakeProvider,
  modelId: "fake:model",
  project: createEmptyProjectDocument()
});

const selection = {
  courseKey: planned.project.courses[0].key,
  moduleKey: planned.project.courses[0].modules[0].key,
  lessonKey: planned.project.courses[0].modules[0].lessons[0].key,
  microsequenceKey: planned.project.courses[0].modules[0].lessons[0].microsequences[0].key
};

const generated = await generateMicrosequenceCards({
  project: planned.project,
  selection,
  provider: fakeProvider,
  modelId: "fake:model"
});

const practiced = await addPracticeToMicrosequence({
  project: generated.project,
  selection,
  provider: fakeProvider,
  modelId: "fake:model",
  density: "deep"
});

console.log(JSON.stringify(practiced.project, null, 2));
