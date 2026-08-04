import test from "node:test";
import assert from "node:assert/strict";

import { buildEntityEditorModel } from "../../src/ui/entityEditorModel.js";

const project = {
  courses: [
    {
      id: "course-a",
      title: "Curso A",
      goal: "Objetivo A",
      modules: [
        {
          id: "module-a",
          title: "Módulo A",
          guide: { goal: "Guia A" },
          lessons: [
            {
              id: "lesson-a",
              title: "Lição A",
              guide: { goal: "Guia da lição", include: [], exclude: [], notation: [], avoid: [] },
              topics: [],
              microsequences: [
                {
                  id: "micro-base",
                  title: "Base",
                  goal: "Estabelecer a base",
                  role: "explain",
                  status: "ready",
                  dependsOn: [],
                  covers: [],
                  checks: [],
                  cards: [{ id: "card-base" }]
                },
                {
                  id: "micro-target",
                  title: "Aplicação",
                  goal: "Aplicar a base",
                  role: "practice",
                  status: "planned",
                  dependsOn: ["micro-base"],
                  covers: ["base"],
                  checks: ["aplica a base"],
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

test("o editor de microssequência oferece somente referências anteriores válidas", () => {
  const model = buildEntityEditorModel({
    project,
    selection: { courseKey: "course-a" },
    coursePermissionsById: {
      "course-a": { role: "editor", canEdit: true, canDelete: true }
    },
    entityEditor: {
      kind: "microsequence",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-target"
    }
  });
  const dependencyField = model.fields.find((field) => field.name === "dependsOn");

  assert.deepEqual(dependencyField.value, ["micro-base"]);
  assert.deepEqual(dependencyField.options.map((option) => option.id), ["micro-base"]);
});
