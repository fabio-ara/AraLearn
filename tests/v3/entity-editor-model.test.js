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

test("o modelo do editor de entidades isola menus e metadados da orquestração da tela", () => {
  const state = {
    project,
    selection: { courseKey: "course-a" },
    coursePermissionsById: {
      "course-a": { role: "editor", canEdit: true, canDelete: true }
    },
    entityEditor: { kind: "course-actions", courseKey: "course-a" }
  };

  const model = buildEntityEditorModel(state);

  assert.equal(model.variant, "action-menu");
  assert.equal(model.placement, "bottom");
  assert.deepEqual(model.actions.map((action) => action.key), [
    "edit-course-metadata",
    "reset-course-progress",
    "export-course",
    "delete-course"
  ]);
});

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

test("learner mantém somente ações de estudo e exportação nos menus do curso", () => {
  const permissions = {
    "course-a": { role: "learner", canEdit: false, canDelete: false }
  };
  const courseModel = buildEntityEditorModel({
    project,
    selection: { courseKey: "course-a" },
    coursePermissionsById: permissions,
    entityEditor: { kind: "course-actions", courseKey: "course-a" }
  });
  const moduleModel = buildEntityEditorModel({
    project,
    selection: { courseKey: "course-a" },
    coursePermissionsById: permissions,
    entityEditor: { kind: "module-actions", courseKey: "course-a", moduleKey: "module-a" }
  });

  assert.deepEqual(courseModel.actions.map((action) => action.key), [
    "reset-course-progress",
    "export-course"
  ]);
  assert.deepEqual(moduleModel.actions.map((action) => action.key), [
    "reset-module-progress",
    "export-module"
  ]);
  assert.equal(buildEntityEditorModel({
    project,
    selection: { courseKey: "course-a" },
    coursePermissionsById: permissions,
    entityEditor: { kind: "course-screen-actions", courseKey: "course-a" }
  }), null);
});

test("editor pode alterar o curso compartilhado sem receber a exclusão reservada ao owner", () => {
  const model = buildEntityEditorModel({
    project,
    selection: { courseKey: "course-a" },
    coursePermissionsById: {
      "course-a": { role: "editor", canEdit: true, canDelete: false }
    },
    entityEditor: { kind: "course-actions", courseKey: "course-a" }
  });

  assert.deepEqual(model.actions.map((action) => action.key), [
    "edit-course-metadata",
    "reset-course-progress",
    "export-course"
  ]);
});
