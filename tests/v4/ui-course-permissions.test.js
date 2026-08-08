import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  courseRemovalConfirmation,
  resolveCourseUiPermissions
} from "../../src/ui/lessonEditorApp.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";
import { homeTrailSnapshotForProject } from "../support/homeTrailSnapshot.js";

test("curso oficial só é editável quando a capacidade autenticada permite", () => {
  const storage = {
    coursePermissions(courseId) {
      assert.equal(courseId, "course-shared");
      return {
        role: "editor",
        canAuthorContent: true,
        writeTarget: "catalog",
        canOrganizeSelection: true,
        canRemoveSelection: true,
        canDeleteCourse: false
      };
    }
  };

  assert.deepEqual(resolveCourseUiPermissions(storage, "course-shared"), {
    role: "editor",
    canAuthorContent: true,
    writeTarget: "catalog",
    canOrganizeSelection: true,
    canRemoveSelection: true,
    canDeleteCourse: false,
    canEdit: true,
    canDelete: false
  });
});

test("ausência de adaptador de permissão falha fechada", () => {
  assert.deepEqual(resolveCourseUiPermissions({}, "course-unknown"), {
    role: "learner",
    canAuthorContent: false,
    writeTarget: null,
    canOrganizeSelection: false,
    canRemoveSelection: false,
    canDeleteCourse: false,
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

test("a home conserva estudo e omite autoria sem permissão", () => {
  const project = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-shared",
      title: "Curso compartilhado",
      goal: "Conteúdo oficial.",
      modules: []
    }]
  };
  const markup = renderHomeScreen({
    project,
    progress: { version: 1, lessons: {} },
    editorSupport: {
      trailSnapshot: homeTrailSnapshotForProject(project),
      coursePermissionsById: {
        "course-shared": { role: "learner", canEdit: false, canDelete: false }
      }
    }
  });

  assert.match(markup, /data-action="reset-course-progress-direct"/u);
  assert.doesNotMatch(markup, /data-action="edit-course"/u);
  assert.doesNotMatch(markup, /data-action="delete-course-direct"/u);
  assert.match(markup, /data-action="open-course"/u);
  assert.doesNotMatch(markup, /open-course-actions|open-generation-panel/u);
  assert.doesNotMatch(markup, /data-action="structure-drag-handle"/u);
});

test("curso com workspace oferece acesso contextual ao detalhe de autoria", () => {
  const project = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{ id: "course-private", title: "Curso privado", goal: "Objetivo", modules: [] }]
  };
  const trailSnapshot = homeTrailSnapshotForProject(project);
  trailSnapshot.items[0].workspaceId = "70000000-0000-4000-8000-000000000007";
  trailSnapshot.items[0].source = "workspace";
  trailSnapshot.items[0].origin = "workspace";
  const markup = renderHomeScreen({
    project,
    progress: { version: 1, lessons: {} },
    editorSupport: {
      trailSnapshot,
      loadedHomeTrailItemIds: [trailSnapshot.items[0].trailItemId],
      selectedHomeTrailItemId: trailSnapshot.items[0].trailItemId
    }
  });

  assert.match(markup, /data-action="open-home-workspace"/u);
  assert.match(markup, /data-workspace-id="70000000-0000-4000-8000-000000000007"/u);
});

test("ação contextual da Home encaminha o workspace ao painel existente", () => {
  const source = fs.readFileSync(
    new URL("../../src/ui/lessonEditorApp.js", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /open-home-workspace[\s\S]*aralearn:open-workspace[\s\S]*detail: \{ workspaceId \}/u
  );
});

test("snapshot local indica o estado offline e não oferece organização", () => {
  const project = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{ id: "course-local", title: "Curso local", goal: "", modules: [] }]
  };
  const trailSnapshot = homeTrailSnapshotForProject(project);
  trailSnapshot.stale = true;
  trailSnapshot.capabilities.organize = false;
  const markup = renderHomeScreen({
    project,
    progress: { version: 1, lessons: {} },
    editorSupport: {
      trailSnapshot,
      selectedHomeTrailItemId: trailSnapshot.items[0].trailItemId,
      homeOrganization: { active: true }
    }
  });

  assert.match(markup, /Neste dispositivo/u);
  assert.doesNotMatch(markup, /toggle-home-organize|home-trails-organizer-toolbar/u);
});

test("ações de curso separam retirada da seleção e exclusão por origem", () => {
  const project = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{ id: "course-actions", title: "Curso", goal: "", modules: [] }]
  };
  const privateSnapshot = homeTrailSnapshotForProject(project, {
    permissions: {
      "course-actions": {
        origin: "private",
        canEdit: true,
        canDelete: true,
        canRemove: true
      }
    }
  });
  const privateMarkup = renderHomeScreen({
    project,
    progress: { version: 1, lessons: {} },
    editorSupport: {
      trailSnapshot: privateSnapshot,
      selectedHomeTrailItemId: privateSnapshot.items[0].trailItemId
    }
  });
  assert.match(privateMarkup, /data-action="delete-course-direct"/u);
  assert.doesNotMatch(privateMarkup, /data-action="remove-home-trail-item"/u);

  const catalogSnapshot = homeTrailSnapshotForProject(project, {
    permissions: {
      "course-actions": {
        origin: "catalog",
        canEdit: true,
        canDelete: true,
        canRemove: true
      }
    }
  });
  const catalogMarkup = renderHomeScreen({
    project,
    progress: { version: 1, lessons: {} },
    editorSupport: {
      trailSnapshot: catalogSnapshot,
      selectedHomeTrailItemId: catalogSnapshot.items[0].trailItemId
    }
  });
  assert.match(catalogMarkup, /data-action="remove-home-trail-item"/u);
  assert.match(catalogMarkup, /aria-label="Retirar de Coleções"/u);
});
