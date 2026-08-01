import test from "node:test";
import assert from "node:assert/strict";

import { resolveCourseUiPermissions } from "../../src/ui/lessonEditorApp.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";

test("curso selecionado permanece editável localmente mesmo quando a origem é oficial", () => {
  const storage = {
    coursePermissions(courseId) {
      assert.equal(courseId, "course-shared");
      return { role: "learner", canEdit: true, canDelete: false };
    }
  };

  assert.deepEqual(resolveCourseUiPermissions(storage, "course-shared"), {
    role: "learner",
    canEdit: true,
    canDelete: false
  });
});

test("o shell completo preserva autoria quando não existe adaptador de permissão", () => {
  assert.deepEqual(resolveCourseUiPermissions({}, "course-unknown"), {
    role: "owner",
    canEdit: true,
    canDelete: true
  });
});

test("a home preserva criação manual, autoria via MCP, biblioteca e ações globais", () => {
  const markup = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: []
    },
    progress: { version: 1, lessons: {} },
    editorSupport: {}
  });

  for (const action of [
    "open-authoring-assistant",
    "quick-create-course",
    "open-central",
    "open-home-actions"
  ]) {
    assert.match(markup, new RegExp(`data-action="${action}"`, "u"));
  }
});

test("a home não esconde autoria nem reordenação de curso selecionado", () => {
  const markup = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [{
        id: "course-shared",
        title: "Curso compartilhado",
        goal: "Conteúdo oficial.",
        modules: []
      }]
    },
    progress: { version: 1, lessons: {} },
    editorSupport: {
      coursePermissionsById: {
        "course-shared": { role: "learner", canEdit: false, canDelete: false }
      }
    }
  });

  assert.match(markup, /data-action="open-course-actions"/u);
  assert.match(markup, /data-action="open-course"/u);
  assert.doesNotMatch(markup, /open-generation-panel/u);
  assert.match(markup, /data-action="structure-drag-handle"/u);
});
