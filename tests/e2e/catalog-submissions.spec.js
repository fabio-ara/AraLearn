import { test, expect } from "@playwright/test";

async function mountPanel(page, { editor = false, failure = "" } = {}) {
  await page.goto("/");
  await page.evaluate(async ({ editorValue, failureValue }) => {
    document.body.replaceChildren();
    const host = document.createElement("main");
    host.className = "remote-library-panel";
    const content = document.createElement("div");
    content.className = "remote-library-content";
    host.append(content);
    document.body.append(host);
    const { createCatalogSubmissionsPanel } = await import(
      "/src/ui/CatalogSubmissionsPanel.js"
    );
    const candidateCourseId = "22222222-2222-4222-8222-222222222222";
    const firstSubmissionId = "33333333-3333-4333-8333-333333333333";
    const secondSubmissionId = "44444444-4444-4444-8444-444444444444";
    const calls = [];
    let candidates = [{ courseId: candidateCourseId, title: "Curso pessoal" }];
    let submissions = [];
    let queue = editorValue
      ? [
        {
          submissionId: firstSubmissionId,
          title: "Curso para analisar",
          sourceContractKey: "curso-pessoal",
          license: "CC-BY-4.0",
          attribution: "Pessoa autora",
          provenance: "Fontes registradas.",
          status: "submitted"
        },
        {
          submissionId: secondSubmissionId,
          title: "Curso já em análise",
          sourceContractKey: "outro-curso",
          license: "CC-BY-SA-4.0",
          attribution: "Outra pessoa",
          provenance: "Materiais próprios.",
          status: "in_review"
        }
      ]
      : [];
    const authFailure = failureValue
      ? Object.assign(new Error(failureValue === "anon" ? "Sessão ausente" : "JWT expired"), {
        status: 401,
        authRequired: true,
        code: "AUTH_REQUIRED"
      })
      : null;
    const catalog = {
      async listCatalogSubmissionCandidates() {
        calls.push(["candidates"]);
        if (authFailure) throw authFailure;
        return { items: candidates };
      },
      async listMyCatalogSubmissions() {
        calls.push(["submissions"]);
        return { items: submissions };
      },
      async submitPersonalCourseToCatalog(payload) {
        calls.push(["submit", payload]);
        submissions = [{
          submissionId: firstSubmissionId,
          sourceCourseId: payload.courseId,
          title: "Curso pessoal",
          status: "submitted"
        }];
        candidates = [{
          courseId: candidateCourseId,
          title: "Curso pessoal",
          activeSubmissionId: firstSubmissionId,
          activeSubmissionStatus: "submitted"
        }];
        return { status: "submitted", submissionId: firstSubmissionId };
      },
      async withdrawCatalogSubmission(submissionId) {
        calls.push(["withdraw", submissionId]);
        submissions = submissions.map((item) => ({ ...item, status: "withdrawn" }));
        candidates = [{ courseId: candidateCourseId, title: "Curso pessoal" }];
        return { status: "withdrawn", submissionId };
      },
      async listCatalogSubmissionQueue() {
        calls.push(["queue"]);
        return { items: queue };
      },
      async startCatalogSubmissionReview(submissionId) {
        calls.push(["start", submissionId]);
        queue = queue.map((item) => item.submissionId === submissionId
          ? { ...item, status: "in_review" }
          : item);
        return { status: "in_review", submissionId };
      },
      async decideCatalogSubmission(payload) {
        calls.push(["decide", payload]);
        queue = queue.filter((item) => item.submissionId !== payload.submissionId);
        return { status: payload.decision === "accept" ? "accepted" : "rejected" };
      }
    };
    let authRequired = 0;
    const panel = createCatalogSubmissionsPanel({
      catalog,
      onAuthRequired() { authRequired += 1; }
    });
    content.append(panel.element);
    window.catalogSubmissionTest = {
      panel,
      calls,
      get authRequired() { return authRequired; }
    };
    await panel.open({
      canReview: editorValue,
      collectionRows: [
        {
          collection_id: "55555555-5555-4555-8555-555555555555",
          collection_title: "Programação"
        }
      ]
    });
  }, { editorValue: editor, failureValue: failure });
}

test("pessoa autora oferece um curso com consentimento e pode retirá-lo", async ({ page }) => {
  await mountPanel(page);
  await expect(page.getByText("Curso pessoal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Oferecer curso ao catálogo" }).click();
  const form = page.locator("[data-catalog-submission-offer]");
  const submit = form.getByRole("button", { name: "Oferecer curso ao catálogo" });
  await expect(submit).toBeDisabled();
  const compactLayout = await form.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    buttonSizes: [...node.querySelectorAll("button")].map((button) => ({
      width: Math.round(button.getBoundingClientRect().width),
      height: Math.round(button.getBoundingClientRect().height)
    }))
  }));
  expect(compactLayout.scrollWidth).toBeLessThanOrEqual(compactLayout.clientWidth + 1);
  expect(new Set(compactLayout.buttonSizes.map(({ width }) => width))).toEqual(new Set([30]));
  expect(new Set(compactLayout.buttonSizes.map(({ height }) => height))).toEqual(new Set([30]));
  await form.getByLabel("Crédito autoral").fill("Pessoa autora");
  await form.getByLabel("Procedência e fontes").fill("Materiais próprios e fontes registradas.");
  await form.getByRole("checkbox").check();
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.locator('[data-catalog-submission-state="submitted"]')).toContainText("Enviado");
  await expect.poll(() => page.evaluate(() => window.catalogSubmissionTest.calls.find(
    ([operation]) => operation === "submit"
  )?.[1])).toEqual({
    courseId: "22222222-2222-4222-8222-222222222222",
    consent: true,
    licenseCode: "CC-BY-4.0",
    attribution: "Pessoa autora",
    provenance: "Materiais próprios e fontes registradas."
  });
  await page.getByRole("button", { name: "Retirar oferta do catálogo" }).click();
  await expect(page.locator('[data-catalog-submission-state="withdrawn"]')).toContainText("Retirado");
  await expect.poll(() => page.evaluate(() => window.catalogSubmissionTest.calls.some(
    ([operation]) => operation === "withdraw"
  ))).toBe(true);

  const buttons = page.locator("[data-catalog-submissions-panel] button");
  for (let index = 0; index < await buttons.count(); index += 1) {
    await expect(buttons.nth(index)).not.toHaveAttribute("title", "");
    await expect(buttons.nth(index)).not.toHaveAttribute("aria-label", "");
  }
});

test("editor inicia análise, recusa sem exigir destino e aceita em coleção publicada", async ({ page }) => {
  await mountPanel(page, { editor: true });
  const first = page.locator('[data-catalog-submission-queue-item="33333333-3333-4333-8333-333333333333"]');
  await first.getByRole("button", { name: "Iniciar análise editorial" }).click();
  const firstDecision = page.locator(
    '[data-catalog-submission-decision="33333333-3333-4333-8333-333333333333"]'
  );
  await firstDecision.getByLabel("Nota editorial").fill("As fontes precisam ser revistas.");
  await firstDecision.getByRole("button", { name: "Recusar oferta" }).click();
  await expect.poll(() => page.evaluate(() => window.catalogSubmissionTest.calls.find(
    ([operation, payload]) => operation === "decide" && payload.decision === "reject"
  )?.[1])).toMatchObject({
    submissionId: "33333333-3333-4333-8333-333333333333",
    decision: "reject",
    collectionId: null,
    officialContractKey: null,
    note: "As fontes precisam ser revistas."
  });

  const secondDecision = page.locator(
    '[data-catalog-submission-decision="44444444-4444-4444-8444-444444444444"]'
  );
  await secondDecision.getByLabel("Coleção de destino").selectOption(
    "55555555-5555-4555-8555-555555555555"
  );
  await secondDecision.getByRole("button", { name: "Publicar curso no catálogo" }).click();
  await expect.poll(() => page.evaluate(() => window.catalogSubmissionTest.calls.find(
    ([operation, payload]) => operation === "decide" && payload.decision === "accept"
  )?.[1])).toMatchObject({
    submissionId: "44444444-4444-4444-8444-444444444444",
    decision: "accept",
    collectionId: "55555555-5555-4555-8555-555555555555",
    officialContractKey: "outro-curso"
  });
  await expect(page.locator("[data-catalog-submission-queue-item]")).toHaveCount(0);
});

for (const failure of ["anon", "expired"]) {
  test(`${failure === "anon" ? "sessão ausente" : "sessão expirada"} reabre o acesso`, async ({ page }) => {
    await mountPanel(page, { failure });
    await expect(page.locator("[data-catalog-submission-status]")).toHaveText(
      "Entre novamente para continuar."
    );
    await expect.poll(() => page.evaluate(() => window.catalogSubmissionTest.authRequired)).toBe(1);
  });
}

test("overlay libera análise apenas pela capacidade devolvida pelo banco", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const { createRemoteLibraryOverlay } = await import("/src/ui/RemoteLibraryOverlay.js");
    const calls = [];
    const catalog = {
      async listCollections() {
        return [{
          collection_id: "55555555-5555-4555-8555-555555555555",
          collection_title: "Programação"
        }];
      },
      async listLibrary() { return []; },
      async getCurrentUserCapabilities() {
        return { authoring: { catalogPublish: true } };
      },
      async listCatalogSubmissionCandidates() { return { items: [] }; },
      async listMyCatalogSubmissions() { return { items: [] }; },
      async submitPersonalCourseToCatalog() {},
      async withdrawCatalogSubmission() {},
      async listCatalogSubmissionQueue() {
        calls.push("queue");
        return { items: [] };
      },
      async startCatalogSubmissionReview() {},
      async decideCatalogSubmission() {}
    };
    const overlay = createRemoteLibraryOverlay({
      root,
      catalog,
      authClient: { async signOut() {} },
      syncEngine: {
        async listRejectedMutations() { return []; },
        async listPendingMutations() { return []; }
      },
      studyPathRepository: {
        loadStudyPaths() { return []; },
        loadCourseSummaries() { return []; }
      }
    });
    window.catalogSubmissionOverlayTest = { overlay, calls };
    await overlay.open();
  });

  const open = page.getByRole("button", { name: "Oferecer cursos ao catálogo" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByText("Análise editorial", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.catalogSubmissionOverlayTest.calls)).toEqual([
    "queue"
  ]);
});
