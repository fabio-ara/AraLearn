import { expect, test } from "@playwright/test";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000002";

async function mountPanel(page, {
  failFirstCreate = false,
  failSignOut = false,
  readOnly = false,
  admin = false,
  assistantDelayMs = 0,
  failTrailSecondPage = false,
  seedAdminTrailCache = false
} = {}) {
  await page.goto("/");
  await page.evaluate(async ({
    userId,
    workspaceId,
    shouldFailFirstCreate,
    shouldFailSignOut,
    isReadOnly,
    isAdmin,
    assistantDelay,
    shouldFailTrailSecondPage,
    shouldSeedAdminTrailCache
  }) => {
    document.body.replaceChildren();
    const homeRoot = document.createElement("section");
    homeRoot.className = "learning-spaces-home-probe";
    const root = document.createElement("main");
    document.body.append(homeRoot, root);
    const stored = new Map();
    const probe = {
      collectionReads: 0,
      trailReads: 0,
      createCalls: 0,
      shouldFailFirstCreate,
      createdSourceCourseId: null,
      openCourse: null,
      catalogManagementAllowed: null,
      permissionRefreshes: 0,
      removedCourses: [],
      removedCatalogCourses: [],
      removedSelectionIds: new Set(),
      removedCatalogCourseIds: new Set(),
      signOutCalls: 0,
      confirmedCourseRemovals: [],
      replicaRefreshes: 0,
      beforeRemoteReads: 0,
      beforeRemoteReadOptions: [],
      repositoryFlushes: 0,
      homeCourseVisible: true
    };
    window.learningSpacesProbe = probe;
    if (shouldSeedAdminTrailCache) {
      stored.set(`learning.spaces.v1:${userId}`, {
        version: 3,
        cachedAt: "2026-08-04T12:00:00Z",
        page: {
          items: [{
            itemId: "cached:catalog-course",
            workspaceId: null,
            courseKey: "cached-catalog-course",
            courseId: "90000000-0000-4000-8000-000000000009",
            selectionId: "91000000-0000-4000-8000-000000000019",
            contentHash: "c".repeat(64),
            kind: "course",
            source: "selection",
            origin: "catalog",
            title: "Curso administrativo em cache",
            description: "Projeção completa anterior",
            moduleCount: 1,
            lessonCount: 1,
            microsequenceCount: 1,
            cardCount: 1,
            canEdit: true,
            canDelete: true,
            canRemove: true,
            position: 0,
            updatedAt: "2026-08-04T12:00:00Z"
          }],
          hasMore: false,
          nextCursor: null,
          capabilities: { catalogManage: true, catalogReview: true }
        }
      });
    }
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
      async signOut() {
        probe.signOutCalls += 1;
        if (shouldFailSignOut) throw new Error("Não foi possível encerrar a sessão.");
      }
    };
    const catalog = {
      async listTrailItems(options = {}) {
        probe.trailReads += 1;
        if (shouldFailTrailSecondPage && options.afterId) {
          throw new Error("Página seguinte indisponível.");
        }
        const response = {
          items: [{
            itemId: `workspace:${workspaceId}`,
            workspaceId,
            courseKey: null,
            courseId: null,
            selectionId: null,
            contentHash: null,
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
            canRemove: false,
            position: 0,
            updatedAt: "2026-08-03T12:00:00Z"
          }, {
            itemId: "selection:course-ready",
            workspaceId,
            courseKey: "course-ready",
            courseId: "30000000-0000-4000-8000-000000000003",
            selectionId: "40000000-0000-4000-8000-000000000004",
            contentHash: "a".repeat(64),
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
            canRemove: true,
            position: 1,
            updatedAt: "2026-08-03T12:00:00Z"
          }, {
            itemId: "selection:course-catalog",
            workspaceId: null,
            courseKey: "course-catalog",
            courseId: "70000000-0000-4000-8000-000000000007",
            selectionId: "80000000-0000-4000-8000-000000000008",
            contentHash: "b".repeat(64),
            kind: "course",
            source: "selection",
            origin: "catalog",
            title: "Curso vindo de Coleções",
            description: "Cópia privada do curso público selecionado em Coleções.",
            moduleCount: 3,
            lessonCount: 8,
            microsequenceCount: 16,
            cardCount: 48,
            canEdit: isAdmin,
            canDelete: isAdmin,
            canRemove: true,
            position: 2,
            updatedAt: "2026-08-03T12:00:00Z"
          }].filter((item) =>
            !probe.removedSelectionIds.has(item.selectionId)
            && !probe.removedCatalogCourseIds.has(item.courseId)
          ),
          hasMore: false,
          nextCursor: null,
          capabilities: { catalogManage: isAdmin, catalogReview: isAdmin }
        };
        if (shouldFailTrailSecondPage) {
          response.hasMore = true;
          response.nextCursor = { afterPosition: 2, afterId: "course:cursor" };
        }
        return response;
      },
      async listCollections() {
        probe.collectionReads += 1;
        return [{
          collection_id: "50000000-0000-4000-8000-000000000005",
          collection_title: "Dataprev",
          course_id: "70000000-0000-4000-8000-000000000007",
          title: "Curso oficial",
          goal: "Preparação",
          is_selected: false
        }].filter((item) => !probe.removedCatalogCourseIds.has(item.course_id));
      },
      async executeApplicationAuthoringAction(name, args) {
        if (name === "criarWorkspaceDeAutoria") {
          probe.createCalls += 1;
          probe.createdSourceCourseId = args.sourceCourseId || null;
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
        if (name === "retirarCursoDasTrilhas") {
          probe.removedCourses.push(structuredClone(args));
          probe.removedSelectionIds.add(args.selectionId);
          return { status: "removed", selectionId: args.selectionId, courseId: args.courseId };
        }
        if (name === "consultarCatalogo" && args.operation === "list_collection_courses") {
          return {
            items: probe.removedCatalogCourseIds.has("70000000-0000-4000-8000-000000000007")
              ? []
              : [{
                  courseId: "70000000-0000-4000-8000-000000000007",
                  placementRevision: 4,
                  contentHash: "b".repeat(64)
                }],
            hasMore: false,
            nextCursor: null
          };
        }
        if (name === "retirarDoCatalogo" && args.operation === "remove_course") {
          probe.removedCatalogCourses.push(structuredClone(args));
          probe.removedCatalogCourseIds.add(args.courseId);
          return { status: "removed", courseId: args.courseId };
        }
        return { workspaceId, revision: 3 };
      },
      async selectCourse() {},
      async deleteOwnAccount() {}
    };
    const { renderHomeScreen } = await import("/src/ui/renderHomeScreen.js");
    const renderHomeProbe = () => {
      homeRoot.innerHTML = renderHomeScreen({
        project: {
          contract: "aralearn.course",
          version: 4,
          kind: "project",
          courses: probe.homeCourseVisible ? [{
            id: "course-official-home",
            title: "Curso oficial na home",
            goal: "Curso administrativo",
            modules: []
          }] : []
        },
        progress: { version: 1, lessons: {} },
        editorSupport: {
          coursePermissionsById: {
            "course-official-home": {
              role: probe.catalogManagementAllowed ? "editor" : "learner",
              canEdit: probe.catalogManagementAllowed === true,
              canDelete: probe.catalogManagementAllowed === true
            }
          }
        }
      });
    };
    renderHomeProbe();
    const { createLearningSpacesPanel } = await import("/src/ui/LearningSpacesPanel.js");
    const syncEngine = {
      async confirmSelectedCourseRemoval(courseId) {
        probe.confirmedCourseRemovals.push(courseId);
        probe.homeCourseVisible = false;
      }
    };
    const assistantElement = document.createElement("section");
    assistantElement.textContent = "Assistente carregado";
    const assistantPanel = assistantDelay > 0 ? {
      element: assistantElement,
      async open() {
        await new Promise((resolve) => setTimeout(resolve, assistantDelay));
      },
      close() {
        assistantElement.remove();
      }
    } : null;
    const panel = createLearningSpacesPanel({
      root,
      catalog,
      authClient,
      onOpenCourse(target) {
        probe.openCourse = structuredClone(target);
        return true;
      },
      syncEngine,
      assistantPanel,
      studyPathRepository: {
        setCatalogManagementAllowed(value) {
          probe.catalogManagementAllowed = value;
        },
        async refreshFromReplica() {
          probe.replicaRefreshes += 1;
          return { documentChanged: true };
        },
        async flush() { probe.repositoryFlushes += 1; },
        loadCourseSummaries() {
          return probe.homeCourseVisible
            ? [{ courseId: "70000000-0000-4000-8000-000000000007" }]
            : [];
        }
      },
      async beforeRemoteRead(options = {}) {
        probe.beforeRemoteReads += 1;
        probe.beforeRemoteReadOptions.push(structuredClone(options));
      },
      async onStudyPathsChanged() {
        probe.permissionRefreshes += 1;
        renderHomeProbe();
      },
      onChanged() {}
    });
    window.learningSpacesPanel = panel;
    await panel.open();
  }, {
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    shouldFailFirstCreate: failFirstCreate,
    shouldFailSignOut: failSignOut,
    isReadOnly: readOnly,
    isAdmin: admin,
    assistantDelay: assistantDelayMs,
    shouldFailTrailSecondPage: failTrailSecondPage,
    shouldSeedAdminTrailCache: seedAdminTrailCache
  });
}

test("painel integra planos e cursos em Trilhas sem categorias de ciclo de vida", async ({ page }) => {
  await mountPanel(page);
  await expect(page.getByRole("tab", { name: "Trilhas" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Plano Dataprev" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso em Trilhas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso vindo de Coleções" })).toBeVisible();
  const plan = page.locator('[data-course-origin="plan"]');
  const privateCourse = page.locator('[data-course-origin="private"]');
  const catalogCourse = page.locator('[data-course-origin="catalog"]');
  await expect(plan.getByText("Plano", { exact: true })).toBeVisible();
  await expect(privateCourse.getByText("Privado", { exact: true })).toBeVisible();
  await expect(catalogCourse.getByText("De Coleções", { exact: true })).toBeVisible();
  const originColors = await Promise.all([privateCourse, catalogCourse].map((card) => card.evaluate((node) => ({
    border: getComputedStyle(node).borderLeftColor,
    background: getComputedStyle(node).backgroundImage
  }))));
  expect(originColors[0]).not.toEqual(originColors[1]);
  await expect(privateCourse.getByText("2 módulos", { exact: true })).toBeVisible();
  await expect(privateCourse.getByText("5 lições", { exact: true })).toBeVisible();
  await expect(privateCourse.getByText("24 cards", { exact: true })).toBeVisible();
  await expect(privateCourse.getByRole("button", { name: "Excluir curso privado" })).toBeVisible();
  await expect(page.getByText(/Em construção|Em avaliação|Publicação parcial/iu)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.collectionReads)).toBe(0);

  const privateBox = await privateCourse.boundingBox();
  expect(privateBox?.height).toBeLessThan(190);
  if (process.env.ARALEARN_VISUAL_AUDIT === "1") {
    await page.screenshot({ path: "test-results/learning-spaces-trails.png", fullPage: true });
    await page.getByRole("button", { name: "Tema escuro" }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: "test-results/learning-spaces-trails-dark.png", fullPage: true });
  }
  await privateCourse.getByRole("button", { name: "Abrir curso" }).click();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.openCourse)).toEqual({
    courseId: "30000000-0000-4000-8000-000000000003",
    courseKey: "course-ready"
  });
});

test("Coleções carrega sob demanda e o erro ao criar plano não prende a interface", async ({ page }) => {
  await mountPanel(page, { failFirstCreate: true });
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("heading", { name: "Curso oficial", exact: true })).toBeVisible();
  const officialCard = page.locator(".remote-catalog-course-card");
  await expect(officialCard).toHaveAttribute("data-course-origin", "catalog");
  const officialBox = await officialCard.boundingBox();
  expect(officialBox?.height).toBeLessThan(110);
  if (process.env.ARALEARN_VISUAL_AUDIT === "1") {
    await page.screenshot({ path: "test-results/learning-spaces-collections.png", fullPage: true });
  }
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.collectionReads)).toBe(1);

  await page.getByRole("tab", { name: "Trilhas" }).click();
  await page.getByRole("button", { name: "Criar plano" }).click();
  await page.getByRole("textbox", { name: "Título do plano" }).fill("Novo plano");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Não foi possível salvar.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Título do plano" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Trilhas" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Coleções" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Chatbot", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("tab", { name: "Coleções" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Trilhas" }).click();
  await page.getByRole("textbox", { name: "Título do plano" }).fill("Novo plano");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("textbox", { name: "Título do plano" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.createCalls)).toBe(2);
  await expect(page.getByRole("tab", { name: "Trilhas" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Coleções" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Chatbot", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("falha ao sair não mantém overlay nem navegação ocupados", async ({ page }) => {
  await mountPanel(page, { failSignOut: true });
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByText("Não foi possível encerrar a sessão.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.signOutCalls)).toBe(1);
  await expect(page.getByRole("tab", { name: "Coleções" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Chatbot", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("plano abre a árvore corrente sem expor revisões ou estados internos", async ({ page }) => {
  await mountPanel(page);
  await page.getByRole("button", { name: "Abrir plano" }).click();
  await expect(page.getByRole("heading", { name: "Dataprev: Teste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Dataprev: Teste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Observar Dataprev: Teste" })).toBeVisible();
  await expect(page.getByText(/revision|ready|partial|complete/iu)).toHaveCount(0);
  const courseRow = page.locator(".remote-workspace-tree-item.is-course");
  const courseRowBox = await courseRow.boundingBox();
  expect(courseRowBox?.height).toBeLessThan(110);
  const disabledMoves = courseRow.locator('[data-panel-action^="move-entity"]');
  await expect(disabledMoves).toHaveCount(2);
  await expect(disabledMoves.first()).toBeHidden();
  if (process.env.ARALEARN_VISUAL_AUDIT === "1") {
    await page.screenshot({ path: "test-results/learning-spaces-workspace.png", fullPage: true });
  }
});

test("árvore permanece auditável e falha fechada sem poder de edição", async ({ page }) => {
  await mountPanel(page, { readOnly: true });
  await page.getByRole("button", { name: "Abrir plano" }).click();
  await expect(page.getByRole("heading", { name: "Dataprev: Teste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar Dataprev: Teste" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Observar Dataprev: Teste" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Excluir Dataprev: Teste" })).toBeDisabled();
});

test("curso selecionado é retirado de Trilhas pelo contrato contextual corrente", async ({ page }) => {
  await mountPanel(page);
  const catalogCourse = page.locator('[data-course-origin="catalog"]');
  page.once("dialog", (dialog) => dialog.accept());
  await catalogCourse.getByRole("button", { name: "Retirar de Trilhas" }).click();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.removedCourses.length)).toBe(1);
  const call = await page.evaluate(() => window.learningSpacesProbe.removedCourses[0]);
  expect(call).toMatchObject({
    selectionId: "80000000-0000-4000-8000-000000000008",
    courseId: "70000000-0000-4000-8000-000000000007",
    expectedContentHash: "b".repeat(64)
  });
  expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.confirmedCourseRemovals
  )).toEqual(["70000000-0000-4000-8000-000000000007"]);
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.replicaRefreshes
  )).toBe(1);
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.beforeRemoteReads
  )).toBe(3);
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.repositoryFlushes
  )).toBe(1);
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.beforeRemoteReadOptions.slice(-2)
  )).toEqual([{ guaranteeFresh: true }, { guaranteeFresh: true }]);
  await expect(page.getByRole("heading", { name: "Curso oficial na home" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Curso vindo de Coleções" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Coleções" })).toBeEnabled();
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("heading", { name: "Curso oficial", exact: true })).toBeVisible();
});

test("troca de aba invalida renderização assíncrona anterior do Chatbot", async ({ page }) => {
  await mountPanel(page, { assistantDelayMs: 120 });
  await page.getByRole("tab", { name: "Chatbot", exact: true }).click();
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("tab", { name: "Coleções" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Curso oficial", exact: true })).toBeVisible();
  await page.waitForTimeout(180);
  await expect(page.getByText("Assistente carregado")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Curso oficial", exact: true })).toBeVisible();
});

test("página posterior com falha não transforma capacidade administrativa em cache", async ({ page }) => {
  await mountPanel(page, {
    admin: true,
    failTrailSecondPage: true,
    seedAdminTrailCache: true
  });
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.trailReads
  )).toBe(2);
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.catalogManagementAllowed
  )).toBe(false);
  await expect(page.getByRole("heading", { name: "Curso administrativo em cache" })).toBeVisible();
  const cachedCourse = page.locator('[data-course-origin="catalog"]');
  await expect(cachedCourse.getByRole("button", { name: "Organizar curso" })).toHaveCount(0);
  await expect(page.locator(
    '.learning-spaces-home-probe [data-action="delete-course-direct"]'
  )).toBeDisabled();
});

test("conta administrativa abre curso oficial em workspace sem criar cópia avulsa", async ({ page }) => {
  await mountPanel(page, { admin: true });
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.catalogManagementAllowed)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.permissionRefreshes)).toBe(1);
  await expect(page.locator(
    '.learning-spaces-home-probe [data-action="delete-course-direct"]'
  )).toBeEnabled();
  const catalogCourse = page.locator('[data-course-origin="catalog"]');
  await catalogCourse.getByRole("button", { name: "Organizar curso" }).click();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.createdSourceCourseId)).toBe(
    "70000000-0000-4000-8000-000000000007"
  );
  await expect(page.getByRole("heading", { name: "Dataprev: Teste" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Coleções" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("heading", { name: "Curso oficial", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Chatbot", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("conta administrativa distingue retirada pessoal de exclusão global do curso oficial", async ({ page }) => {
  await mountPanel(page, { admin: true });
  const catalogCourse = page.locator('[data-course-origin="catalog"]');
  await expect(catalogCourse.getByRole("button", { name: "Retirar de Trilhas" })).toBeVisible();
  await expect(catalogCourse.getByRole("button", { name: "Retirar de Coleções" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await catalogCourse.getByRole("button", { name: "Retirar de Coleções" }).click();

  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.removedCatalogCourses.length
  )).toBe(1);
  const call = await page.evaluate(() => window.learningSpacesProbe.removedCatalogCourses[0]);
  expect(call).toMatchObject({
    operation: "remove_course",
    courseId: "70000000-0000-4000-8000-000000000007",
    expectedPlacementRevision: 4,
    expectedContentHash: "b".repeat(64)
  });
  expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(page.getByRole("heading", { name: "Curso vindo de Coleções" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Curso oficial na home" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Coleções" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Chatbot", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toHaveAttribute("aria-selected", "true");
});
