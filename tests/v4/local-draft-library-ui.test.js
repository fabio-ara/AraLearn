import assert from "node:assert/strict";
import test from "node:test";

import {
  localDraftCourseStatus,
  localDraftDiscardConfirmation,
  localDraftDiscardErrorMessage
} from "../../src/ui/RemoteLibraryOverlay.js";

test("estado da biblioteca distingue rascunho local de revisão oficial nova", () => {
  assert.deepEqual(localDraftCourseStatus({
    courseId: "course-catalog",
    courseOrigin: "catalog",
    reason: "local_draft",
    localDraftRevision: "draft-1",
    remoteUpdateAvailable: true
  }), {
    courseId: "course-catalog",
    courseOrigin: "catalog",
    localDraftRevision: "draft-1",
    remoteUpdateAvailable: true,
    label: "Alterações locais · revisão oficial nova",
    description: "Este dispositivo preservou alterações locais. Uma revisão oficial nova está disponível, mas não substituirá o trabalho automaticamente."
  });

  assert.deepEqual(localDraftCourseStatus({
    courseId: "course-private",
    courseOrigin: "private",
    reason: "local_draft",
    localDraftRevision: "draft-2",
    remoteUpdateAvailable: false
  }), {
    courseId: "course-private",
    courseOrigin: "private",
    localDraftRevision: "draft-2",
    remoteUpdateAvailable: false,
    label: "Alterações locais",
    description: "Este dispositivo preservou alterações locais que não serão substituídas automaticamente."
  });

  assert.equal(localDraftCourseStatus({
    courseId: "course-pending",
    reason: "pending_personal_mutations",
    localDraftRevision: null
  }), null);
});

test("confirmação explicita origem, revisão escolhida e irreversibilidade", () => {
  const catalog = localDraftDiscardConfirmation({
    title: "Biologia",
    courseOrigin: "catalog",
    remoteUpdateAvailable: true
  });
  assert.match(catalog, /Descartar todas as alterações locais de "Biologia"/u);
  assert.match(catalog, /nova revisão oficial do curso do catálogo/u);
  assert.match(catalog, /não pode ser desfeita/u);

  const privateCourse = localDraftDiscardConfirmation({
    title: "Meu curso",
    courseOrigin: "private",
    remoteUpdateAvailable: false
  });
  assert.match(privateCourse, /revisão oficial atual do curso privado/u);
});

test("falhas de rede, outbox e CAS afirmam que o trabalho não foi descartado", () => {
  assert.match(
    localDraftDiscardErrorMessage(new Error("qualquer"), { online: false }),
    /Nada foi descartado.*permanecem neste dispositivo/u
  );
  assert.match(
    localDraftDiscardErrorMessage(Object.assign(new Error("corrida"), {
      code: "local_course_draft_changed"
    })),
    /mudaram em outra aba.*Nada foi descartado/u
  );
  assert.match(
    localDraftDiscardErrorMessage(Object.assign(new Error("seleção mudou"), {
      code: "official_course_revision_changed",
      courseSelectionStale: true
    })),
    /revisão oficial mudou.*Nada foi descartado/u
  );
  assert.match(
    localDraftDiscardErrorMessage(Object.assign(new Error("reconciliação necessária"), {
      catalogReplicaReconciliationRequired: true
    })),
    /pendentes ou rejeitadas.*Nada foi descartado/u
  );
  assert.match(
    localDraftDiscardErrorMessage(new TypeError("Failed to fetch")),
    /baixar a revisão oficial.*Nada foi descartado/u
  );
});
