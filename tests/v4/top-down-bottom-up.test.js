import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import { generateMicrosequenceCards } from "../../src/generation/bottomUp/generateMicrosequenceCards.js";
import { planCourseFromScope } from "../../src/generation/topDown/planCourseFromScope.js";
import { validatePlannedCourse } from "../../src/generation/topDown/validatePlannedCourse.js";

function scopeContract() {
  return {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Curso A",
      goal: "Cobrir apenas conjunção.",
      evidencePriority: ["exercise_list"]
    },
    modules: [
      {
        title: "Lógica",
        include: ["conjunção", "tabela-verdade"],
        exclude: ["predicados"],
        notes: "Fechar cada passo com prática curta.",
        assessmentStyle: "mixed"
      }
    ]
  };
}

function projectWithPlannedMicrosequence() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [
      {
        id: "course-a",
        title: "Curso A",
        goal: "Cobrir apenas conjunção.",
        modules: [
          {
            id: "module-a",
            title: "Lógica",
            guide: {
              goal: "Explicar apenas conjunção.",
              include: ["conjunção", "tabela-verdade"],
              exclude: ["predicados"],
              notation: ["Use P e Q."],
              avoid: ["Não abrir outro tópico."]
            },
            lessons: [
              {
                id: "lesson-a",
                title: "Conjunção",
                guide: {
                  goal: "Explicar apenas conjunção.",
                  include: ["conjunção", "tabela-verdade"],
                  exclude: ["predicados"],
                  notation: ["Use P e Q."],
                  avoid: ["Não abrir outro tópico."]
                },
                topics: [],
                microsequences: [
                  {
                    id: "micro-a",
                    title: "Quando P e Q são verdadeiras",
                    goal: "Reconhecer a linha verdadeira da conjunção.",
                    role: "explain",
                    status: "planned",
                    dependsOn: [],
                    covers: ["conjunção"],
                    checks: ["o aluno reconhece a linha verdadeira"],
                    cards: []
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

test("top-down estruturado materializa apenas a trilha e preserva microssequências sem cards", async () => {
  const provider = createFakeProvider({
    script: {
      top_down_structure: {
        text: JSON.stringify({
          course: {
            title: "Curso A",
            goal: "Cobrir apenas conjunção.",
            modules: [
              {
                title: "Lógica",
                lessons: [
                  {
                    title: "Conjunção",
                    microsequences: [
                      {
                        title: "Regra central",
                        goal: "Reconhecer a linha verdadeira.",
                        role: "explain",
                        dependsOn: [],
                        covers: ["conjunção"],
                        checks: ["o aluno reconhece a linha verdadeira"]
                      },
                      {
                        title: "Tabela-verdade mínima",
                        goal: "Aplicar a leitura da linha verdadeira na tabela-verdade.",
                        role: "practice",
                        dependsOn: ["Regra central"],
                        covers: ["tabela-verdade"],
                        checks: ["o aluno aplica a leitura na tabela-verdade"]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }),
        usage: {}
      },
      top_down_structure_audit: {
        value: { patches: [] },
        usage: {}
      }
    }
  });

  const result = await planCourseFromScope({
    scopeContract: scopeContract(),
    provider,
    modelId: "fake:model",
    project: createEmptyProjectDocument()
  });

  const lesson = result.project.courses[0].modules[0].lessons[0];
  assert.deepEqual(Object.keys(lesson.guide), ["goal", "include", "exclude", "notation", "avoid"]);
  assert.deepEqual(lesson.microsequences[0].cards, []);
});

test("top-down continua rejeitando exclude usado como contraste negativo", () => {
  const invalidPlanned = {
    course: {
      title: "Curso A",
      modules: [
        {
          title: "Lógica",
          guide: {
            goal: "Introduzir conjunção e contrastar com predicados.",
            include: ["conjunção", "tabela-verdade"],
            exclude: ["predicados"],
            notation: [],
            avoid: []
          },
          lessons: [
            {
              title: "Conjunção",
              guide: {
                goal: "Explicar a conjunção sem predicados.",
                include: ["conjunção", "tabela-verdade"],
                exclude: ["predicados"],
                notation: [],
                avoid: []
              },
              microsequences: [
                {
                  title: "Regra central",
                  goal: "Comparar conjunção com predicados.",
                  role: "explain",
                  dependsOn: [],
                  covers: ["conjunção"],
                  checks: []
                }
              ]
            }
          ]
        }
      ]
    }
  };

  const validation = validatePlannedCourse(invalidPlanned, scopeContract());
  assert.equal(validation.ok, false);
  assert.match(validation.errors.map((error) => error.message).join("\n"), /proibido em exclude/);
});

test("bottom-up estruturado rejeita card inválido sem alterar o projeto", async () => {
  const project = projectWithPlannedMicrosequence();
  const provider = createFakeProvider({
    script: {
      bottom_up_micro_plan: {
        text: "CARD 1\n1: 101\n2: 201\n3: 1101\n4: 401\n5: 501\n6: abrir\nCARD 2\n1: 101\n2: 202\n3: 1103\n4: 401\n5: 501\n6: praticar",
        usage: {}
      },
      bottom_up_card_build: [
        { text: "CARD 1\n1: Regra da conjunção\n2: Esta explicação abre predicados fora do escopo da conjunção.\n3: Revise o escopo." },
        { text: "CARD 2\n1: Fixação\n2: Complete a regra da conjunção\n3: P e Q são verdadeiras\n4: só P é verdadeira\n5: só Q é verdadeira\n6: Releia a regra." }
      ],
      bottom_up_card_audit: {
        text: "AUDIT\nstatus: 1201",
        usage: {}
      }
    }
  });

  await assert.rejects(() => generateMicrosequenceCards({
    project,
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a"
    },
    provider,
    modelId: "fake:model"
  }));
  assert.equal(project.courses[0].modules[0].lessons[0].microsequences[0].cards.length, 0);
});
