import { expect, test } from "@playwright/test";

async function openDraftLibrary(page, {
  mode = "success",
  online = true
} = {}) {
  await page.goto("/");
  await page.evaluate(async ({ initialMode, initialOnline }) => {
    document.body.replaceChildren();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => window.localDraftLibraryProbe?.online ?? initialOnline
    });
    const root = document.createElement("main");
    document.body.append(root);
    const { createRemoteLibraryOverlay } = await import("/src/ui/RemoteLibraryOverlay.js");
    const probe = {
      mode: initialMode,
      online: true,
      restoreCalls: [],
      projectionReloads: 0,
      updates: [
        {
          courseId: "catalog-course",
          courseOrigin: "catalog",
          courseKey: "catalog-key",
          title: "Curso de coleção",
          reason: "local_draft",
          localDraftRevision: "draft-catalog-1",
          remoteUpdateAvailable: true
        },
        {
          courseId: "private-course",
          courseOrigin: "private",
          courseKey: "private-key",
          title: "Curso privado",
          reason: "local_draft",
          localDraftRevision: "draft-private-1",
          remoteUpdateAvailable: false
        }
      ]
    };
    window.localDraftLibraryProbe = probe;
    const overlay = createRemoteLibraryOverlay({
      root,
      catalog: {
        async listCollections() { return []; },
        async listLibrary() {
          return [
            {
              course_id: "catalog-course",
              title: "Curso de coleção",
              course_origin: "catalog"
            },
            {
              course_id: "private-course",
              title: "Curso privado",
              course_origin: "private"
            }
          ];
        },
        async getCurrentUserCapabilities() {
          return {};
        }
      },
      authClient: { async signOut() {} },
      syncEngine: {
        async listRejectedMutations() { return []; },
        async listPendingMutations() { return []; },
        async listDeferredCourseUpdates() {
          return structuredClone(probe.updates);
        },
        async restoreDeferredCourseRevision(request) {
          probe.restoreCalls.push(structuredClone(request));
          const update = probe.updates.find((candidate) => candidate.courseId === request.courseId);
          if (probe.mode === "cas") {
            update.localDraftRevision = `${update.localDraftRevision}-outra-aba`;
            throw Object.assign(new Error("O localDraft mudou."), {
              code: "local_course_draft_changed",
              expectedRevision: request.expectedLocalDraftRevision,
              actualRevision: update.localDraftRevision
            });
          }
          if (probe.mode === "official-race") {
            throw Object.assign(new Error("A seleção oficial mudou."), {
              code: "official_course_revision_changed",
              courseSelectionStale: true
            });
          }
          if (probe.mode === "outbox") {
            throw Object.assign(new Error("Reconciliação necessária."), {
              catalogReplicaReconciliationRequired: true
            });
          }
          if (probe.mode === "network") {
            throw new TypeError("Failed to fetch");
          }
          probe.updates = probe.updates.filter(
            (candidate) => candidate.courseId !== request.courseId
          );
          return {
            status: "restored",
            courseId: request.courseId,
            remoteUpdateAvailable: update.remoteUpdateAvailable
          };
        }
      },
      studyPathRepository: {
        loadStudyPaths() { return []; },
        loadCourseSummaries() { return []; }
      },
      async onLocalDraftRestored() {
        probe.projectionReloads += 1;
      }
    });
    window.localDraftLibraryOverlay = overlay;
    await overlay.open();
    probe.online = initialOnline;
  }, { initialMode: mode, initialOnline: online });
  await page.getByRole("tab", { name: "Trilhas" }).click();
}

test("Trilhas identifica alterações locais e diferencia revisão oficial nova", async ({ page }) => {
  await openDraftLibrary(page);

  const catalog = page.locator('[data-course-row][data-course-id="catalog-course"]');
  const privateCourse = page.locator('[data-course-row][data-course-id="private-course"]');
  await expect(catalog.locator("[data-local-draft-status]"))
    .toHaveText("Alterações locais · revisão oficial nova");
  await expect(catalog.locator("[data-local-draft-status]"))
    .toHaveAttribute("data-local-draft-status", "remote-update");
  await expect(privateCourse.locator("[data-local-draft-status]"))
    .toHaveText("Alterações locais");
  await expect(privateCourse.locator("[data-local-draft-status]"))
    .toHaveAttribute("data-local-draft-status", "local-only");
  await expect(catalog.getByRole("button", {
    name: "Descartar alterações locais e usar a nova revisão oficial"
  })).toBeVisible();
  await expect(privateCourse.getByRole("button", {
    name: "Descartar alterações locais e restaurar a revisão oficial"
  })).toBeVisible();
});

test("cancelar preserva o rascunho; confirmar restaura catalog e private e recarrega a projeção", async ({
  page
}) => {
  await openDraftLibrary(page);
  const privateButton = page.getByRole("button", {
    name: "Descartar alterações locais e restaurar a revisão oficial"
  });

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain('Curso privado');
    expect(dialog.message()).toContain("revisão oficial atual do curso privado");
    expect(dialog.message()).toContain("não pode ser desfeita");
    await dialog.dismiss();
  });
  await privateButton.click();
  await expect(page.locator("[data-library-status]"))
    .toHaveText("Descarte cancelado. As alterações locais foram preservadas.");
  await expect.poll(() => page.evaluate(
    () => window.localDraftLibraryProbe.restoreCalls.length
  )).toBe(0);
  await expect(page.locator('[data-course-id="private-course"] [data-local-draft-status]'))
    .toBeVisible();

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("nova revisão oficial do curso do catálogo");
    await dialog.accept();
  });
  await page.getByRole("button", {
    name: "Descartar alterações locais e usar a nova revisão oficial"
  }).click();
  await expect.poll(() => page.evaluate(() => ({
    calls: window.localDraftLibraryProbe.restoreCalls,
    projectionReloads: window.localDraftLibraryProbe.projectionReloads
  }))).toEqual({
    calls: [{
      courseId: "catalog-course",
      expectedLocalDraftRevision: "draft-catalog-1"
    }],
    projectionReloads: 1
  });
  await expect(page.locator('[data-course-id="catalog-course"] [data-local-draft-status]'))
    .toHaveCount(0);
  await expect(page.locator("[data-library-status]"))
    .toHaveText("Alterações locais descartadas. A nova revisão oficial foi restaurada.");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", {
    name: "Descartar alterações locais e restaurar a revisão oficial"
  }).click();
  await expect.poll(() => page.evaluate(
    () => window.localDraftLibraryProbe.projectionReloads
  )).toBe(2);
  await expect(page.locator('[data-course-id="private-course"] [data-local-draft-status]'))
    .toHaveCount(0);
  await expect(page.locator("[data-library-status]"))
    .toHaveText("Alterações locais descartadas. A revisão oficial foi restaurada.");
});

test("offline não inicia download nem descarte", async ({ page }) => {
  await openDraftLibrary(page, { online: false });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", {
    name: "Descartar alterações locais e usar a nova revisão oficial"
  }).click();

  await expect.poll(() => page.evaluate(
    () => window.localDraftLibraryProbe.restoreCalls.length
  )).toBe(0);
  await expect(page.locator("[data-library-status]"))
    .toHaveText("Offline. Nada foi descartado; as alterações locais permanecem neste dispositivo.");
  await expect(page.locator('[data-course-id="catalog-course"] [data-local-draft-status]'))
    .toBeVisible();
});

test("corrida CAS atualiza a revisão exibida sem descartar o trabalho", async ({ page }) => {
  await openDraftLibrary(page, { mode: "cas" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", {
    name: "Descartar alterações locais e usar a nova revisão oficial"
  }).click();

  await expect(page.locator("[data-library-status]"))
    .toHaveText(
      "As alterações locais mudaram em outra aba. Nada foi descartado; revise o curso e confirme novamente."
    );
  await expect(page.locator(
    '[data-course-id="catalog-course"] [data-local-draft-discard]'
  )).toHaveAttribute("data-local-draft-revision", "draft-catalog-1-outra-aba");
  await expect.poll(() => page.evaluate(
    () => window.localDraftLibraryProbe.projectionReloads
  )).toBe(0);
});

test("falha de rede ou outbox bloqueada conserva o rascunho", async ({ page }) => {
  await openDraftLibrary(page, { mode: "network" });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", {
    name: "Descartar alterações locais e usar a nova revisão oficial"
  }).click();
  await expect(page.locator("[data-library-status]"))
    .toContainText("Nada foi descartado");
  await expect(page.locator('[data-course-id="catalog-course"] [data-local-draft-status]'))
    .toBeVisible();

  await page.evaluate(() => {
    window.localDraftLibraryProbe.mode = "outbox";
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", {
    name: "Descartar alterações locais e usar a nova revisão oficial"
  }).click();
  await expect(page.locator("[data-library-status]"))
    .toHaveText(
      "Há alterações pendentes ou rejeitadas para este curso. Nada foi descartado; resolva a sincronização antes de restaurar a revisão oficial."
    );
  await expect.poll(() => page.evaluate(
    () => window.localDraftLibraryProbe.projectionReloads
  )).toBe(0);
});
