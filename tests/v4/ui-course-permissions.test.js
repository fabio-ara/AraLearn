import test from "node:test";
import assert from "node:assert/strict";

import {
  courseRemovalConfirmation,
  resolveCourseUiPermissions
} from "../../src/ui/lessonEditorApp.js";
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

test("confirmação de exclusão usa a origem canônica em vez do botão disponível", () => {
  const summaries = [{
    courseId: "course-official-id",
    courseOrigin: "catalog"
  }, {
    courseId: "course-private-id",
    courseOrigin: "private"
  }];
  const contractKeys = new Map([
    ["course-official-id", "course-official"],
    ["course-private-id", "course-private"]
  ]);
  const storage = {
    loadCourseSummaries: () => summaries,
    resolveCourseContractKey(value) {
      return contractKeys.get(value) || value;
    }
  };

  assert.equal(
    courseRemovalConfirmation(storage, "course-official", "Dataprev"),
    "Retirar o curso oficial \"Dataprev\" de Coleções? Ele deixará de ser distribuído pelo catálogo."
  );
  assert.equal(
    courseRemovalConfirmation(storage, "course-private", "Fundamentos"),
    "Excluir o curso privado \"Fundamentos\" de Trilhas?"
  );
  assert.throws(
    () => courseRemovalConfirmation(storage, "course-missing", "Ausente"),
    /identificar a origem do curso/iu
  );
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
