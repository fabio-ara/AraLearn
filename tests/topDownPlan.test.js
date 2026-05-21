import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";
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
  const lessonGuide = result.project.courses[0].modules[0].lessons[0].sourceGuideStructured;
  assert.equal(microsequence.status, "planned");
  assert.deepEqual(microsequence.versions, []);
  assert.equal(lessonGuide.outOfScopeRules, "lógica de predicados");
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
