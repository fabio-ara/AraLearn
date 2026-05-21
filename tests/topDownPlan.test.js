import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";
import { buildTopDownUserPrompt } from "../src/generation/prompts/topDownPrompt.js";
import { createFakeProvider } from "../src/generation/providers/fakeProvider.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { validatePlannedCourse } from "../src/generation/topDown/validatePlannedCourse.js";

const scopeContract = {
  schemaVersion: "aralearn.scope.v1",
  course: {
    title: "Matemática para Informática",
    evidencePriority: ["exercise_list"]
  },
  modules: [
    {
      title: "Lógica Proposicional",
      include: ["conectivos", "tabela-verdade"],
      exclude: ["lógica de predicados"],
      assessmentStyle: "mixed"
    }
  ]
};

test("top-down gera microssequências planned sem cards", async () => {
  const provider = createFakeProvider({
    script: {
      "plan-scope": {
        course: {
          title: "Matemática para Informática",
          modules: [
            {
              title: "Lógica Proposicional",
              lessons: [
                {
                  title: "Conectivos",
                  goal: "Entender conectivos.",
                  sourceGuideStructured: {
                    lessonGoal: "Reconhecer o papel dos conectivos básicos.",
                    notationRules: "conectivos, tabela-verdade",
                    commonErrors: "Não confundir conectivo com tópico de lógica de predicados."
                  },
                  microsequences: [
                    {
                      title: "Ler proposições",
                      goal: "Ler proposições simples.",
                      dependsOnTitles: [],
                      scopeLabels: ["conectivos"],
                      didacticKind: "concept",
                      practiceMode: "recognition",
                      representationNeed: "text",
                      dependencyPolicy: "self_contained",
                      coverageRole: "introduce"
                    },
                    {
                      title: "Tabela-verdade básica",
                      goal: "Montar uma tabela-verdade.",
                      dependsOnTitles: ["Ler proposições"],
                      scopeLabels: ["tabela-verdade"],
                      didacticKind: "procedure",
                      practiceMode: "execution",
                      representationNeed: "table",
                      dependencyPolicy: "uses_previous",
                      coverageRole: "practice",
                      expectedEvidence: ["montar as quatro linhas", "ler a coluna final"]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  });

  const result = await planCourseFromScope({
    scopeContract,
    provider,
    modelId: "fake:model",
    project: createEmptyProjectDocument()
  });

  const microsequence = result.project.courses[0].modules[0].lessons[0].microsequences[0];
  const practiceMicrosequence = result.project.courses[0].modules[0].lessons[0].microsequences[1];
  const lessonGuide = result.project.courses[0].modules[0].lessons[0].sourceGuideStructured;
  assert.equal(microsequence.status, "planned");
  assert.deepEqual(microsequence.versions, []);
  assert.equal(microsequence.didacticKind, "concept");
  assert.equal(practiceMicrosequence.practiceMode, "execution");
  assert.equal(practiceMicrosequence.representationNeed, "table");
  assert.equal(practiceMicrosequence.dependencyPolicy, "uses_previous");
  assert.equal(practiceMicrosequence.coverageRole, "practice");
  assert.deepEqual(practiceMicrosequence.expectedEvidence, ["montar as quatro linhas", "ler a coluna final"]);
  assert.equal(lessonGuide.outOfScopeRules, undefined);
});

test("top-down rejeita cards e dependência futura", () => {
  const validation = validatePlannedCourse(
    {
      course: {
        title: "Matemática para Informática",
        modules: [
          {
            title: "Lógica Proposicional",
            lessons: [
              {
                title: "Conectivos",
                goal: "Entender conectivos.",
                sourceGuideStructured: {
                  lessonGoal: "Reconhecer o papel dos conectivos básicos.",
                  notationRules: "conectivos, tabela-verdade",
                  commonErrors: "Não confundir conectivo com tópico de lógica de predicados."
                },
                microsequences: [
                  {
                    title: "Tabela-verdade básica",
                    goal: "Montar tabela-verdade.",
                    dependsOnTitles: ["Ler proposições"],
                    scopeLabels: ["tabela-verdade"],
                    cards: []
                  },
                  {
                    title: "Ler proposições",
                    goal: "Ler proposições simples.",
                    dependsOnTitles: [],
                    scopeLabels: ["conectivos"]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    scopeContract
  );

  assert.equal(validation.ok, false);
});

test("top-down repara campo Incluir (notationRules) com base em scopeLabels", () => {
  const validation = validatePlannedCourse(
    {
      course: {
        title: "Matemática para Informática",
        modules: [
          {
            title: "Lógica Proposicional",
            lessons: [
              {
                title: "Conectivos",
                goal: "Entender conectivos.",
                sourceGuideStructured: {
                  lessonGoal: "Reconhecer o papel dos conectivos básicos.",
                  notationRules: "regras de notação genéricas",
                  commonErrors: "Não confundir conectivo com tópico de lógica de predicados."
                },
                microsequences: [
                  {
                    title: "Ler proposições",
                    goal: "Ler proposições simples.",
                    dependsOnTitles: [],
                    scopeLabels: ["conectivos"]
                  },
                  {
                    title: "Tabela-verdade básica",
                    goal: "Montar tabela-verdade.",
                    dependsOnTitles: ["Ler proposições"],
                    scopeLabels: ["tabela-verdade"]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    scopeContract
  );

  assert.equal(validation.ok, true);
  assert.match(
    validation.value.course.modules[0].lessons[0].sourceGuideStructured.notationRules,
    /(conectivos|tabela-verdade)/i
  );
});

test("top-down rejeita include sem microssequência correspondente", () => {
  const validation = validatePlannedCourse(
    {
      course: {
        title: "Matemática para Informática",
        modules: [
          {
            title: "Lógica Proposicional",
            lessons: [
              {
                title: "Conectivos",
                goal: "Entender conectivos.",
                sourceGuideStructured: {
                  lessonGoal: "Reconhecer o papel dos conectivos básicos.",
                  notationRules: "conectivos, tabela-verdade",
                  commonErrors: "Não confundir conectivo com tópico de lógica de predicados."
                },
                microsequences: [
                  {
                    title: "Ler proposições",
                    goal: "Ler proposições simples.",
                    dependsOnTitles: [],
                    scopeLabels: ["conectivos"]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    scopeContract
  );

  assert.equal(validation.ok, false);
  assert.match(
    validation.errors.map((error) => error.message).join(" "),
    /não cobre todos os itens do include do módulo/i
  );
});

test("prompt top-down exige reaproveitar literalmente itens de include em notationRules", () => {
  const prompt = buildTopDownUserPrompt(scopeContract);

  assert.match(prompt, /notationRules.*copiado literalmente de 'Entra'/i);
});

test("prompt top-down proíbe usar itens excluídos como contraste negativo", () => {
  const prompt = buildTopDownUserPrompt(scopeContract);

  assert.match(prompt, /Não mencione itens de 'Não entra' em nenhum campo da resposta/i);
  assert.match(prompt, /mecanismos avançados fora do escopo imediato/i);
});

test("top-down não repopula outOfScopeRules com a lista literal de exclude", () => {
  const validation = validatePlannedCourse(
    {
      course: {
        title: "Matemática para Informática",
        modules: [
          {
            title: "Lógica Proposicional",
            lessons: [
              {
                title: "Conectivos",
                goal: "Entender conectivos.",
                sourceGuideStructured: {
                  lessonGoal: "Reconhecer o papel dos conectivos básicos.",
                  notationRules: "conectivos, tabela-verdade",
                  commonErrors: "Não trocar a função de um conectivo por outra já estudada."
                },
                microsequences: [
                  {
                    title: "Ler proposições",
                    goal: "Ler proposições simples.",
                    dependsOnTitles: [],
                    scopeLabels: ["conectivos"]
                  },
                  {
                    title: "Tabela-verdade básica",
                    goal: "Montar uma tabela-verdade.",
                    dependsOnTitles: ["Ler proposições"],
                    scopeLabels: ["tabela-verdade"]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    scopeContract
  );

  assert.equal(validation.ok, true);
  assert.equal(validation.value.course.modules[0].lessons[0].sourceGuideStructured.outOfScopeRules, undefined);
});
