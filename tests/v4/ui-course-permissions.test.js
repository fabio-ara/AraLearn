import test from "node:test";
import assert from "node:assert/strict";

import { resolveCourseUiPermissions } from "../../src/ui/lessonEditorApp.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";

test("curso oficial só é editável quando a capacidade autenticada permite", () => {
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

test("ausência de adaptador de permissão falha fechada", () => {
  assert.deepEqual(resolveCourseUiPermissions({}, "course-unknown"), {
    role: "learner",
    canEdit: false,
    canDelete: false
  });
});

test("a home mantém somente a entrada para o painel integrado", () => {
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

  assert.match(markup, /data-action="open-central"/u);
  assert.doesNotMatch(markup, /open-authoring-assistant|quick-create-course|open-home-actions/u);
});

test("a home mostra ações diretas e desabilita autoria sem permissão", () => {
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

  assert.match(markup, /data-action="reset-course-progress-direct"/u);
  assert.match(markup, /data-action="edit-course"[^>]*disabled/u);
  assert.match(markup, /data-action="delete-course-direct"[^>]*disabled/u);
  assert.match(markup, /data-action="open-course"/u);
  assert.doesNotMatch(markup, /open-course-actions|open-generation-panel/u);
  assert.match(markup, /data-action="structure-drag-handle"/u);
});
