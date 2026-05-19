import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeLessonPlans,
  normalizeMicrosequencePlans
} from "../src/generation/courseForge/courseForgePlanNormalization.js";

test("normalizeLessonPlans aceita array direto e deduplica entradas reconciliadas", () => {
  const lessonPlans = normalizeLessonPlans(
    [
      { title: "O que e um grafo", lessonDescription: "Base." },
      { lessonTitle: "O que é um grafo", learningActionTags: ["identificar"] },
      { lessonTitle: "Graus e contagem", sourceGuideStructured: { lessonGoal: "Contar incidências." } }
    ],
    {
      course: {
        key: "course-grafos",
        modules: [
          {
            key: "module-fundamentos",
            lessons: [
              { key: "lesson-o-que-e-um-grafo", title: "O que é um grafo", description: "Intro." },
              { key: "lesson-graus-e-contagem", title: "Graus e contagem", description: "Contagem." }
            ]
          }
        ]
      }
    },
    {}
  );

  assert.equal(lessonPlans.length, 2);
  assert.equal(lessonPlans[0].lessonKey, "lesson-o-que-e-um-grafo");
  assert.deepEqual(lessonPlans[0].learningActionTags, ["identificar"]);
  assert.equal(lessonPlans[1].lessonKey, "lesson-graus-e-contagem");
});

test("normalizeMicrosequencePlans aceita shape plano e cria fallback para lições omitidas", () => {
  const lessonPlans = [
    {
      courseKey: "course-grafos",
      moduleKey: "module-fundamentos",
      lessonKey: "lesson-o-que-e-um-grafo",
      lessonTitle: "O que é um grafo",
      lessonDescription: "Intro.",
      sourceGuideStructured: {
        lessonGoal: "Reconhecer vértices e arestas."
      },
      learningActionTags: ["identificar"],
      resourceTags: ["graph"]
    },
    {
      courseKey: "course-grafos",
      moduleKey: "module-fundamentos",
      lessonKey: "lesson-graus-e-contagem",
      lessonTitle: "Graus e contagem",
      lessonDescription: "Contagem.",
      sourceGuideStructured: {
        lessonGoal: "Calcular graus."
      },
      learningActionTags: ["calcular"],
      resourceTags: ["table"]
    }
  ];

  const plans = normalizeMicrosequencePlans(
    {
      microsequencePlans: [
        {
          lessonTitle: "O que e um grafo",
          microsequences: [
            { objective: "Reconhecer vértices e arestas." },
            { title: "Reconhecer vértices e arestas.", description: "Duplicata proposital." }
          ]
        }
      ]
    },
    lessonPlans
  );

  assert.equal(plans.length, 2);
  assert.equal(plans[0].lessonKey, "lesson-o-que-e-um-grafo");
  assert.equal(plans[0].microsequences.length, 1);
  assert.ok(plans[0].microsequences[0].title.length > 0);
  assert.equal(plans[1].lessonKey, "lesson-graus-e-contagem");
  assert.equal(plans[1].microsequences.length, 2);
  assert.match(plans[1].microsequences[0].title, /Panorama/);
});
