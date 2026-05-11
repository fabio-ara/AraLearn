import test from "node:test";
import assert from "node:assert/strict";

import { resolveGenerationAssistMode, resolveGenerationPanelScopeFromAction } from "../src/ui/lessonEditorApp.js";

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

test("resolveGenerationAssistMode usa geração contextual de microssequências quando a lição existe", () => {
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: true,
      hasResolvedLesson: true
    }),
    "generate-lesson-microsequences"
  );
});

test("resolveGenerationAssistMode usa modo combinado quando a lição existe e o reposicionamento está ligado", () => {
  assert.equal(
    resolveGenerationAssistMode({
      lessonFixed: true,
      hasResolvedLesson: true,
      repositionMicrosequences: true
    }),
    "generate-and-reposition-lesson-microsequences"
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
