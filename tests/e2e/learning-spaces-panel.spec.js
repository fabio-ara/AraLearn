import { expect, test } from "@playwright/test";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";

async function mountPanel(page, { failFirstCreate = false, readOnly = false } = {}) {
  await page.goto("/");
  await page.evaluate(async ({ userId, workspaceId, shouldFailFirstCreate, isReadOnly }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const stored = new Map();
    const probe = {
      collectionReads: 0,
      trailReads: 0,
      createCalls: 0,
      shouldFailFirstCreate,
      openCourse: null
    };
    window.learningSpacesProbe = probe;
    const authClient = {
      sessionStore: {
        async getSyncState(key) { return stored.get(key) ?? null; },
        async putSyncState(key, value) {
          if (value === null) stored.delete(key);
          else stored.set(key, structuredClone(value));
        }
      },
      getSession: () => ({ user: { id: userId } }),
      async getAccessToken() { return "token"; },
      async signOut() {}
    };
    const catalog = {
      async listTrailItems() {
        probe.trailReads += 1;
        return {
          items: [{
            itemId: `workspace:${workspaceId}`,
            workspaceId,
            courseKey: null,
            courseId: null,
            selectionId: null,
            kind: "plan",
            source: "workspace",
            origin: "workspace",
            title: "Plano Dataprev",
            description: "Computação em nuvem",
            moduleCount: 1,
            lessonCount: 2,
            microsequenceCount: 4,
            cardCount: 7,
            canEdit: true,
            canDelete: true,
            position: 0,
            updatedAt: "2026-08-03T12:00:00Z"
          }, {
            itemId: "selection:course-ready",
            workspaceId,
            courseKey: "course-ready",
            courseId: "30000000-0000-4000-8000-000000000003",
            selectionId: "40000000-0000-4000-8000-000000000004",
            kind: "course",
            source: "selection",
            origin: "private",
            title: "Curso em Trilhas",
            description: "Conteúdo estudável",
            moduleCount: 2,
            lessonCount: 5,
            microsequenceCount: 8,
            cardCount: 24,
            canEdit: true,
            canDelete: true,
            position: 1,
            updatedAt: "2026-08-03T12:00:00Z"
          }],
          hasMore: false,
          nextCursor: null,
          capabilities: { catalogManage: false, catalogReview: false }
        };
      },
      async listCollections() {
        probe.collectionReads += 1;
        return [{
          collection_id: "50000000-0000-4000-8000-000000000005",
          collection_title: "Dataprev",
          course_id: "60000000-0000-4000-8000-000000000006",
          title: "Curso oficial",
          goal: "Preparação",
          is_selected: false
        }];
      },
      async executeApplicationAuthoringAction(name, args) {
        if (name === "criarWorkspaceDeAutoria") {
          probe.createCalls += 1;
          if (probe.shouldFailFirstCreate && probe.createCalls === 1) {
            throw new Error("Não foi possível salvar.");
          }
          return { workspaceId, revision: 1 };
        }
        if (name === "lerWorkspaceDeAutoria") {
          return {
            workspaceId,
            revision: 2,
            title: "Plano Dataprev",
            content: {
              courses: [{
                id: "course-plan",
                title: "Dataprev: Teste",
                goal: "Preparação",
                modules: []
              }]
            }
          };
        }
        if (name === "gerirWorkspaceEducacional" && args.operation === "read") {
          return {
            capabilities: {
              read: true,
              author: !isReadOnly,
              review: !isReadOnly,
              comment: !isReadOnly,
              publish: !isReadOnly,
              manage: !isReadOnly,
              transfer: !isReadOnly
            }
          };
        }
        if (name === "gerirWorkspaceEducacional") return { items: [] };
        return { workspaceId, revision: 3 };
      },
      async selectCourse() {},
      async deleteOwnAccount() {}
    };
    const { createLearningSpacesPanel } = await import("/src/ui/LearningSpacesPanel.js");
    const panel = createLearningSpacesPanel({
      root,
      catalog,
      authClient,
      onOpenCourse(target) {
        probe.openCourse = structuredClone(target);
        return true;
      },
      onChanged() {}
    });
    window.learningSpacesPanel = panel;
    await panel.open();
  }, {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    shouldFailFirstCreate: failFirstCreate,
    isReadOnly: readOnly
  });
}

test("painel integra planos e cursos em Trilhas sem categorias de ciclo de vida", async ({ page }) => {
  await mountPanel(page);
  await expect(page.getByRole("tab", { name: "Trilhas" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Plano Dataprev" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso em Trilhas" })).toBeVisible();
  await expect(page.getByText(/Em construção|Em avaliação|Publicação parcial/iu)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.collectionReads)).toBe(0);

  await page.getByRole("button", { name: "Abrir curso" }).click();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.openCourse)).toEqual({
    courseId: "30000000-0000-4000-8000-000000000003",
    courseKey: "course-ready"
  });
});

test("Coleções carrega sob demanda e o erro ao criar plano não prende a interface", async ({ page }) => {
  await mountPanel(page, { failFirstCreate: true });
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("heading", { name: "Curso oficial" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.collectionReads)).toBe(1);

  await page.getByRole("tab", { name: "Trilhas" }).click();
  await page.getByRole("button", { name: "Criar plano" }).click();
  await page.getByRole("textbox", { name: "Título do plano" }).fill("Novo plano");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Não foi possível salvar.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Título do plano" })).toBeEnabled();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("textbox", { name: "Título do plano" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.createCalls)).toBe(2);
});

test("plano abre a árvore corrente sem expor revisões ou estados internos", async ({ page }) => {
  await mountPanel(page);
  await page.getByRole("button", { name: "Abrir plano" }).click();
  await expect(page.getByRole("heading", { name: "Dataprev: Teste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Dataprev: Teste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Observar Dataprev: Teste" })).toBeVisible();
  await expect(page.getByText(/revision|ready|partial|complete/iu)).toHaveCount(0);
});

test("árvore permanece auditável e falha fechada sem poder de edição", async ({ page }) => {
  await mountPanel(page, { readOnly: true });
  await page.getByRole("button", { name: "Abrir plano" }).click();
  await expect(page.getByRole("heading", { name: "Dataprev: Teste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Dataprev: Teste" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Observar Dataprev: Teste" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Excluir Dataprev: Teste" })).toBeDisabled();
});
