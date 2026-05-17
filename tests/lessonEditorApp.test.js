import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCourseForgeProviderReadiness,
  resolveGenerationAssistMode,
  resolveGenerationPanelScopeFromAction,
  resolveGenerationScopeState
} from "../src/generation/runtime/courseForgeGenerationViewModel.js";

test("resolveGenerationPanelScopeFromAction abre painel global sem escopo", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-global",
      dataset: {},
      selection: {}
    }),
    {}
  );
});

test("resolveGenerationPanelScopeFromAction resolve curso pelo dataset", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-course",
      dataset: { courseKey: "course-a" },
      selection: {}
    }),
    { courseKey: "course-a" }
  );
});

test("resolveGenerationPanelScopeFromAction resolve módulo pelo dataset completo", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-module",
      dataset: { courseKey: "course-a", moduleKey: "module-a" },
      selection: {}
    }),
    { courseKey: "course-a", moduleKey: "module-a" }
  );
});

test("resolveGenerationPanelScopeFromAction resolve lição pelo dataset completo", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-lesson",
      dataset: { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" },
      selection: {}
    }),
    { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" }
  );
});

test("resolveGenerationPanelScopeFromAction usa fallback da seleção nas telas internas", () => {
  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-module",
      dataset: {},
      selection: { courseKey: "course-a", moduleKey: "module-a" }
    }),
    { courseKey: "course-a", moduleKey: "module-a" }
  );

  assert.deepEqual(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-lesson",
      dataset: {},
      selection: { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" }
    }),
    { courseKey: "course-a", moduleKey: "module-a", lessonKey: "lesson-a" }
  );
});

test("resolveGenerationPanelScopeFromAction rejeita ação sem escopo suficiente", () => {
  assert.equal(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-course",
      dataset: {},
      selection: {}
    }),
    null
  );

  assert.equal(
    resolveGenerationPanelScopeFromAction({
      action: "open-generation-panel-lesson",
      dataset: { courseKey: "course-a" },
      selection: {}
    }),
    null
  );
});

test("resolveGenerationAssistMode mantém a geração estrutural mesmo com lição resolvida", () => {
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: true,
      hasResolvedLesson: true
    }),
    "generate-top-down-structure"
  );
});

test("resolveGenerationAssistMode mantém geração estrutural fora da lição resolvida", () => {
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: true,
      hasResolvedLesson: false
    }),
    "generate-top-down-structure"
  );
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: false,
      hasResolvedLesson: true
    }),
    "generate-top-down-structure"
  );
});

test("resolveGenerationScopeState monta o view-model de escopo fora da UI", () => {
  const projectDocument = {
    courses: [
      {
        key: "course-a",
        modules: [
          {
            key: "module-a",
            lessons: [{ key: "lesson-a" }]
          }
        ]
      }
    ]
  };

  const state = resolveGenerationScopeState({
    draft: {
      courseFixed: true,
      moduleFixed: true,
      lessonFixed: true,
      courseInput: "Curso A",
      moduleInput: "Módulo A",
      lessonInput: "Lição A",
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      promptText: "Gerar estrutura.",
      attachments: []
    },
    projectDocument,
    visibleCourses: projectDocument.courses,
    findCourse: (project, key) => project.courses.find((item) => item.key === key) || null,
    findModule: (project, courseKey, moduleKey) =>
      project.courses.find((item) => item.key === courseKey)?.modules.find((item) => item.key === moduleKey) || null,
    findLesson: (project, courseKey, moduleKey, lessonKey) =>
      project.courses
        .find((item) => item.key === courseKey)
        ?.modules.find((item) => item.key === moduleKey)
        ?.lessons.find((item) => item.key === lessonKey) || null
  });

  assert.equal(state.canSubmit, true);
  assert.equal(state.actionSummary, "Lição, microssequências e cards");
  assert.equal(state.lessonInputEnabled, true);
  assert.equal(state.generationMode, "generate-top-down-structure");
});

test("resolveCourseForgeProviderReadiness só valida provider local", async () => {
  const gemini = await resolveCourseForgeProviderReadiness({
    selectedModel: "gemini-2.5-flash"
  });
  assert.equal(gemini.ok, true);

  const codex = await resolveCourseForgeProviderReadiness({
    selectedModel: "codex-cli-local",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "segredo",
    checkCodexLocalHealth: async ({ endpoint, token }) => ({
      ok: endpoint === "http://127.0.0.1:4183/assist" && token === "segredo",
      error: "",
      data: { ok: true }
    })
  });
  assert.equal(codex.ok, true);
});
