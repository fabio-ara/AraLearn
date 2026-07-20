import test from "node:test";
import assert from "node:assert/strict";

import { resolveCourseUiPermissions } from "../../src/ui/lessonEditorApp.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";

test("curso oficial selecionado permanece somente para estudo", () => {
  const storage = {
    coursePermissions(courseId) {
      assert.equal(courseId, "course-shared");
      return { role: "learner", canEdit: false, canDelete: false };
    }
  };

  assert.deepEqual(resolveCourseUiPermissions(storage, "course-shared"), {
    role: "learner",
    canEdit: false,
    canDelete: false
  });
});

test("ausência de permissão explícita nunca concede autoria por padrão", () => {
  assert.deepEqual(resolveCourseUiPermissions({}, "course-unknown"), {
    role: "learner",
    canEdit: false,
    canDelete: false
  });
});

test("home estudantil não expõe criação, importação ou geração de curso", () => {
  const markup = renderHomeScreen({
    project: {
      contract: "aralearn.contract",
      version: 3,
      kind: "project",
      courses: []
    },
    progress: { version: 1, lessons: {} },
    editorSupport: {}
  });

  assert.doesNotMatch(markup, /quick-create-course|open-generation-panel-global/u);
  assert.match(markup, /Abrir biblioteca e sincronização/u);
});
