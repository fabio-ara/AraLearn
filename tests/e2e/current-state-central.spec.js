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
      calls: {
        overview: 0,
        collections: 0,
        trails: 0,
        sections: [],
        workspaces: [],
        actions: [],
        commentReads: [],
        commentActions: []
      },
      commentState: { status: "open", response: null }
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
      async getEducationalWorkspace(workspaceId) {
        probe.calls.workspaces.push(workspaceId);
        return {
          workspaceId,
          title: "Curso em construção",
          purpose: "Preparação compartilhada.",
          kind: "team",
          visibility: "members",
          role: "owner",
          capabilities: {
            read: true,
            author: true,
            review: true,
            comment: true,
            publish: true,
            manage: true,
            transfer: true
          },
          members: [{
            userId: "10000000-0000-4000-8000-000000000001",
            email: "dono@example.test",
            role: "owner",
            primaryOwner: true,
            joinedAt: "2026-08-01T10:00:00Z"
          }, {
            userId: "10000000-0000-4000-8000-000000000002",
            email: "autor@example.test",
            role: "author",
            primaryOwner: false,
            joinedAt: "2026-08-01T11:00:00Z"
          }],
          invitations: [{
            invitationId: "50000000-0000-4000-8000-000000000001",
            email: "aluno@example.test",
            role: "learner",
            expiresAt: "2026-08-08T10:00:00Z"
          }],
          courseCount: 1,
          publicationCount: 0,
          updatedAt: "2026-08-01T12:00:00Z"
        };
      },
      async manageEducationalWorkspace(command) {
        probe.calls.actions.push(structuredClone(command));
        return {
          workspaceId: command.payload.workspaceId,
          operation: command.operation,
          ...(command.operation === "invite" ? { code: "convite-seguro" } : {})
        };
      },
      async listEducationalWorkspaceComments(options) {
        probe.calls.commentReads.push(structuredClone(options));
        return {
          workspaceId: options.workspaceId,
          role: "owner",
          items: [{
            commentId: "60000000-0000-4000-8000-000000000001",
            courseId: "70000000-0000-4000-8000-000000000001",
            cardId: "80000000-0000-4000-8000-000000000001",
            entityPath: ["course", "module", "lesson", "micro", "card"],
            courseTitle: "Curso em construção",
            cardTitle: "Elasticidade",
            author: {
              userId: "10000000-0000-4000-8000-000000000003",
              email: "aluno@example.test"
            },
            category: "question",
            body: "Qual é a diferença para escalabilidade?",
            status: probe.commentState.status,
            response: probe.commentState.response,
            resolutionNote: null,
            courseRevisionHash: "a".repeat(64),
            targetAvailable: true,
            correction: null,
            createdAt: "2026-08-01T12:00:00Z",
            updatedAt: "2026-08-01T13:00:00Z",
            respondedAt: probe.commentState.response ? "2026-08-01T13:00:00Z" : null,
            resolvedAt: probe.commentState.status === "resolved"
              ? "2026-08-01T14:00:00Z"
              : null
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      async manageEducationalWorkspaceComment(command) {
        probe.calls.commentActions.push(structuredClone(command));
        if (command.operation === "respond_comment") {
          probe.commentState.response = command.payload.response;
          if (probe.commentState.status === "open") probe.commentState.status = "considered";
        } else if (command.operation === "set_comment_status") {
          probe.commentState.status = command.payload.status;
        }
        return {
          workspaceId: command.workspaceId,
          commentId: command.commentId,
          operation: command.operation,
          status: probe.commentState.status,
          updatedAt: "2026-08-01T14:00:00Z",
          idempotent: false
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

test("workspace permite governança contextual sem expor detalhes internos", async ({ page }) => {
  await mountCentral(page);
  await page.getByRole("button", { name: "Em construção: 2" }).click();
  await page.getByRole("button", { name: "Abrir Curso em construção" }).click();
  await expect(page.getByRole("heading", { name: "Curso em construção" })).toBeVisible();
  await expect(page.getByText("Preparação compartilhada.")).toBeVisible();
  await expect(page.getByText("autor@example.test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Transferir propriedade" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar convite" })).toBeVisible();
  await expect(page.getByText("hash-interno")).toHaveCount(0);

  await page.getByLabel("Nome do workspace").fill("Curso colaborativo");
  await page.getByRole("button", { name: "Salvar workspace" }).click();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.actions.at(-1))).toMatchObject({
    operation: "update",
    payload: { title: "Curso colaborativo", kind: "team", visibility: "members" }
  });

  await page.getByLabel("E-mail do novo membro").fill("novo@example.test");
  await page.getByRole("button", { name: "Criar convite" }).click();
  await expect(page.getByRole("button", { name: "Copiar convite" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.actions.at(-1))).toMatchObject({
    operation: "invite",
    payload: { email: "novo@example.test", role: "learner" }
  });
});

test("responsável filtra, responde e resolve observação no workspace", async ({ page }) => {
  await mountCentral(page);
  await page.getByRole("button", { name: "Em construção: 2" }).click();
  await page.getByRole("button", { name: "Abrir Curso em construção" }).click();
  await page.getByRole("button", { name: "Observações" }).click();

  await expect(page.getByRole("heading", { name: "Observações" })).toBeVisible();
  await expect(page.getByText("Qual é a diferença para escalabilidade?")).toBeVisible();
  await expect(page.getByText("aluno@example.test")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.commentReads)).toEqual([
    expect.objectContaining({
      workspaceId: "30000000-0000-4000-8000-000000000001",
      categories: null,
      statuses: null
    })
  ]);

  await page.getByLabel("Responder a aluno@example.test").fill(
    "Elasticidade ajusta capacidade dinamicamente; escalabilidade é a capacidade de crescer."
  );
  await page.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(page.getByText(/Elasticidade ajusta capacidade dinamicamente/u)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.commentActions.at(-1)))
    .toMatchObject({
      operation: "respond_comment",
      payload: {
        response: "Elasticidade ajusta capacidade dinamicamente; escalabilidade é a capacidade de crescer."
      }
    });

  await page.getByLabel("Estado da observação de aluno@example.test").selectOption("resolved");
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.commentActions.at(-1)))
    .toMatchObject({ operation: "set_comment_status", payload: { status: "resolved", note: "" } });
  await expect(page.getByText(/Dúvida · Resolvida/u)).toBeVisible();

  await page.getByLabel("Filtrar por tipo").selectOption("possible_error");
  await expect.poll(() => page.evaluate(() => window.centralProbe.calls.commentReads.at(-1)))
    .toMatchObject({ categories: ["possible_error"], statuses: null });
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
