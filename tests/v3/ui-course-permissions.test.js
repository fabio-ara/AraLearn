import test from "node:test";
import assert from "node:assert/strict";

import { resolveLibraryCourseUpdateAction } from "../../src/ui/RemoteLibraryOverlay.js";
import { resolveCourseUiPermissions } from "../../src/ui/lessonEditorApp.js";

test("a UI normaliza as permissões fornecidas pelo repositório relacional", () => {
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

test("a biblioteca remota não oferece refresh de curso ao learner", () => {
  assert.deepEqual(resolveLibraryCourseUpdateAction({
    membership_role: "learner",
    update_available: true,
    is_personalized: false
  }), {
    action: "inform",
    label: "Atualização disponível ao proprietário ou editor"
  });
  assert.deepEqual(resolveLibraryCourseUpdateAction({
    membership_role: "editor",
    update_available: true,
    is_personalized: false
  }), {
    action: "refresh",
    label: "Atualizar curso"
  });
});

test("curso personalizado com publicação nova continua oferecendo uma cópia independente", () => {
  assert.deepEqual(resolveLibraryCourseUpdateAction({
    membership_role: "learner",
    update_available: true,
    is_personalized: true
  }), {
    action: "clone",
    label: "Criar nova cópia atualizada"
  });
});
