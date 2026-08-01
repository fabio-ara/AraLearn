import { expect, test } from "@playwright/test";

async function mountCentral(page, { editorial = false } = {}) {
  await page.goto("/");
  await page.evaluate(async ({ editorialAccess }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const stored = new Map();
    const probe = {
      online: true,
      calls: { overview: 0, collections: 0, trails: 0, sections: [] }
    };
    window.centralProbe = probe;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => probe.online
    });
    const authClient = {
      getSession: () => ({ user: { id: "10000000-0000-4000-8000-000000000001" } }),
      sessionStore: {
        async getSyncState(key) { return stored.get(key) ?? null; },
        async putSyncState(key, value) {
          if (value === null) stored.delete(key);
          else stored.set(key, structuredClone(value));
        }
      },
      async signOut() {}
    };
    const catalog = {
      async getCurrentStateCentral() {
        probe.calls.overview += 1;
        return {
          counts: {
            construction: 2,
            trails: 3,
            evaluationMine: 1,
            evaluationQueue: editorialAccess ? 4 : 0,
            collections: 1
          },
          capabilities: {
            authoringPrivate: true,
            catalogSubmit: true,
            catalogReview: editorialAccess,
            catalogPublish: editorialAccess,
            catalogManage: editorialAccess
          }
        };
      },
      async listCurrentStateCentral(options) {
        probe.calls.sections.push(structuredClone(options));
        return {
          section: options.section,
          audience: options.audience,
          items: options.section === "evaluation"
            ? [{
              submissionId: "20000000-0000-4000-8000-000000000001",
              title: options.audience === "queue" ? "Curso da fila" : "Meu curso enviado",
              status: "submitted",
              completionState: "partial",
              revision: 47,
              contentHash: "hash-interno"
            }]
            : [{
              workspaceId: "30000000-0000-4000-8000-000000000001",
              title: "Curso em construção",
              publicationCount: 0,
              revision: 47,
              contentHash: "hash-interno"
            }],
          hasMore: false,
          nextCursor: null
        };
      },
      async listCollections() {
        probe.calls.collections += 1;
        return [];
      },
      async listLibrary() {
        probe.calls.trails += 1;
        return [];
      }
    };
    const { createRemoteLibraryOverlay } = await import("/src/ui/RemoteLibraryOverlay.js");
    const overlay = createRemoteLibraryOverlay({
      root,
      catalog,
      authClient,
      syncEngine: {
        async listRejectedMutations() { return []; },
        async listPendingMutations() { return []; },
        async listDeferredCourseUpdates() { return []; }
      },
      studyPathRepository: {
        loadStudyPaths() { return []; },
        loadCourseSummaries() { return []; }
      }
    });
    probe.overlay = overlay;
    await overlay.open();
  }, { editorialAccess: editorial });
}

test("Central comum consulta detalhes, Coleções e Trilhas somente quando abertos", async ({ page }) => {
  await mountCentral(page);
  await expect(page.getByRole("tab", { name: "Central" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Em construção: 2" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls)).toMatchObject({
    overview: 1,
    collections: 0,
    trails: 0,
    sections: []
  });
  const summaryLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    panel: document.querySelector(".remote-library-panel")?.scrollWidth || 0,
    panelClient: document.querySelector(".remote-library-panel")?.clientWidth || 0
  }));
  expect(summaryLayout.document).toBeLessThanOrEqual(summaryLayout.viewport);
  expect(summaryLayout.panel).toBeLessThanOrEqual(summaryLayout.panelClient);
  await page.locator('[data-theme-choice="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");

  await page.getByRole("button", { name: "Em construção: 2" }).click();
  await expect(page.getByText("Curso em construção", { exact: true })).toBeVisible();
  await expect(page.getByText("hash-interno")).toHaveCount(0);
  await expect(page.getByText("47", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.sections)).toHaveLength(1);

  await page.getByRole("button", { name: "Voltar à Central" }).click();
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.collections)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.trails)).toBe(0);
  await page.getByRole("tab", { name: "Trilhas" }).click();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.trails)).toBe(1);
});

test("Central editorial revela a fila sem misturá-la às submissões próprias", async ({ page }) => {
  await mountCentral(page, { editorial: true });
  await page.getByRole("button", { name: "Em avaliação: 1" }).click();
  await expect(page.getByText("Meu curso enviado", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fila" })).toBeVisible();
  await page.getByRole("button", { name: "Fila" }).click();
  await expect(page.getByText("Curso da fila", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.sections)).toEqual([
    expect.objectContaining({ section: "evaluation", audience: "mine" }),
    expect.objectContaining({ section: "evaluation", audience: "queue" })
  ]);
});

test("Central offline usa somente o último estado conhecido e dados do dispositivo", async ({ page }) => {
  await mountCentral(page);
  const callsBefore = await page.evaluate(() => window.centralProbe.calls.overview);
  await page.evaluate(async () => {
    window.centralProbe.online = false;
    await window.centralProbe.overlay.refresh();
  });
  await expect(page.getByText("Último estado conhecido.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Em Trilhas: 3" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.overview)).toBe(callsBefore);
  await page.getByRole("button", { name: "Em avaliação: 1" }).click();
  await expect(page.getByRole("button", { name: "Fila" })).toHaveCount(0);
});
