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
    const opener = document.createElement("button");
    opener.type = "button";
    opener.className = "learning-spaces-opener-probe";
    opener.textContent = "Abrir painel";
    const root = document.createElement("main");
    document.body.append(homeRoot, opener, root);
    const stored = new Map();
    const probe = {
      collectionReads: 0,
      managedCatalogReads: 0,
      trailReads: 0,
      createCalls: 0,
      catalogActions: [],
      observationCalls: [],
      observations: [],
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
      homeCourseVisible: true,
      selectedCourseIds: new Set(["70000000-0000-4000-8000-000000000007"]),
      catalogCollections: [{
        collectionId: "50000000-0000-4000-8000-000000000005",
        contractKey: "dataprev",
        title: "Dataprev",
        description: "Concursos públicos",
        position: 0,
        revision: 2,
        courses: [{
          courseId: "70000000-0000-4000-8000-000000000007",
          title: "Curso oficial",
          goal: "Preparação",
          contentHash: "b".repeat(64),
          placementRevision: 4,
          position: 0,
          moduleCount: 3,
          lessonCount: 8
        }, {
          courseId: "71000000-0000-4000-8000-000000000017",
          title: "Curso para adicionar",
          goal: "Novo curso",
          contentHash: "d".repeat(64),
          placementRevision: 2,
          position: 1,
          moduleCount: 1,
          lessonCount: 2
        }]
      }, {
        collectionId: "60000000-0000-4000-8000-000000000006",
        contractKey: "tecnologia",
        title: "Tecnologia",
        description: "Tecnologia e dados",
        position: 1,
        revision: 1,
        courses: []
      }, {
        collectionId: "61000000-0000-4000-8000-000000000016",
        contractKey: "outros",
        title: "Outros cursos",
        description: "Destino estrutural",
        position: 2,
        revision: 1,
        courses: []
      }]
    };
    window.learningSpacesProbe = probe;
    const trailGroupId = "a1000000-0000-4000-8000-000000000001";
    const planTrailItemId = "a2000000-0000-4000-8000-000000000001";
    const privateTrailItemId = "a2000000-0000-4000-8000-000000000002";
    const catalogTrailItemId = "a2000000-0000-4000-8000-000000000003";
    const addedTrailItemId = "a2000000-0000-4000-8000-000000000004";
    if (shouldSeedAdminTrailCache) {
      stored.set(`learning.spaces.v1:${userId}`, {
        version: 4,
        cachedAt: "2026-08-04T12:00:00Z",
        page: {
          space: "trails",
          groups: [{ id: trailGroupId, title: "Concursos", position: 0 }],
          items: [{
            trailItemId: "a2000000-0000-4000-8000-000000000009",
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
            pathId: trailGroupId,
            pathTitle: "Concursos",
            pathPosition: 0,
            itemPosition: 0,
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
          space: "trails",
          groups: [{ id: trailGroupId, title: "Concursos", position: 0 }],
          items: [{
            trailItemId: planTrailItemId,
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
            pathId: trailGroupId,
            pathTitle: "Concursos",
            pathPosition: 0,
            itemPosition: 0,
            updatedAt: "2026-08-03T12:00:00Z"
          }, {
            trailItemId: privateTrailItemId,
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
            pathId: trailGroupId,
            pathTitle: "Concursos",
            pathPosition: 0,
            itemPosition: 1,
            updatedAt: "2026-08-03T12:00:00Z"
          }, {
            trailItemId: catalogTrailItemId,
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
            pathId: trailGroupId,
            pathTitle: "Concursos",
            pathPosition: 0,
            itemPosition: 2,
            updatedAt: "2026-08-03T12:00:00Z"
          }].concat(probe.selectedCourseIds.has("71000000-0000-4000-8000-000000000017") ? [{
            trailItemId: addedTrailItemId,
            workspaceId: null,
            courseKey: "course-added",
            courseId: "71000000-0000-4000-8000-000000000017",
            selectionId: "81000000-0000-4000-8000-000000000018",
            contentHash: "d".repeat(64),
            kind: "course",
            source: "selection",
            origin: "catalog",
            title: "Curso para adicionar",
            description: "Novo curso",
            moduleCount: 1,
            lessonCount: 2,
            microsequenceCount: 2,
            cardCount: 6,
            canEdit: isAdmin,
            canDelete: isAdmin,
            canRemove: true,
            pathId: trailGroupId,
            pathTitle: "Concursos",
            pathPosition: 0,
            itemPosition: 3,
            updatedAt: "2026-08-03T12:00:00Z"
          }] : []).filter((item) =>
            !probe.removedSelectionIds.has(item.selectionId)
            && !probe.removedCatalogCourseIds.has(item.courseId)
          ),
          hasMore: false,
          nextCursor: null,
          capabilities: { catalogManage: isAdmin, catalogReview: isAdmin }
        };
        if (shouldFailTrailSecondPage) {
          response.hasMore = true;
          response.nextCursor = {
            afterPathPosition: 0,
            afterItemPosition: 2,
            afterId: catalogTrailItemId
          };
        }
        return response;
      },
      async listCollections() {
        probe.collectionReads += 1;
        return probe.catalogCollections.flatMap((collection) => collection.courses.map((course) => ({
          collection_id: collection.collectionId,
          collection_contract_key: collection.contractKey,
          collection_title: collection.title,
          collection_description: collection.description,
          collection_position: collection.position,
          course_id: course.courseId,
          title: course.title,
          goal: course.goal,
          content_hash: course.contentHash,
          module_count: course.moduleCount,
          lesson_count: course.lessonCount,
          is_selected: probe.selectedCourseIds.has(course.courseId),
          selection_id: course.courseId === "70000000-0000-4000-8000-000000000007"
            ? "80000000-0000-4000-8000-000000000008"
            : probe.selectedCourseIds.has(course.courseId)
              ? "81000000-0000-4000-8000-000000000018"
              : null
        }))).filter((item) => !probe.removedCatalogCourseIds.has(item.course_id));
      },
      async executeApplicationAuthoringAction(name, args) {
        if (name === "editarCatalogo" || name === "retirarDoCatalogo") {
          probe.catalogActions.push({ name, args: structuredClone(args) });
        }
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
                modules: [{
                  id: "module-plan",
                  title: "Computação em nuvem",
                  lessons: [{
                    id: "lesson-plan",
                    title: "Elasticidade",
                    microsequences: [{
                      id: "micro-plan",
                      title: "Escala sob demanda",
                      cards: [{ id: "card-plan", title: "Elasticidade automática" }]
                    }]
                  }]
                }]
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
        if (name === "gerirWorkspaceEducacional" && args.operation === "list_observations") {
          return { items: structuredClone(probe.observations) };
        }
        if (name === "gerirWorkspaceEducacional" && args.operation === "create_observation") {
          probe.observationCalls.push(structuredClone(args));
          probe.observations.push({
            observationId: `observation-${probe.observations.length + 1}`,
            entityType: args.entityType,
            entityPath: structuredClone(args.entityPath),
            resourceTargetId: args.resourceTargetId || null,
            body: args.body,
            canDelete: true
          });
          return { observationId: `observation-${probe.observations.length}` };
        }
        if (name === "gerirWorkspaceEducacional") return { items: [] };
        if (name === "retirarCursoDasTrilhas") {
          probe.removedCourses.push(structuredClone(args));
          probe.removedSelectionIds.add(args.selectionId);
          probe.selectedCourseIds.delete(args.courseId);
          return { status: "removed", selectionId: args.selectionId, courseId: args.courseId };
        }
        if (name === "consultarCatalogo" && args.operation === "list_collections") {
          probe.managedCatalogReads += 1;
          return {
            items: probe.catalogCollections.map((collection) => ({
              collectionId: collection.collectionId,
              contractKey: collection.contractKey,
              title: collection.title,
              description: collection.description,
              position: collection.position,
              status: "active",
              revision: collection.revision,
              courseCount: collection.courses.length,
              createdAt: "2026-08-01T12:00:00Z",
              updatedAt: "2026-08-03T12:00:00Z"
            })),
            nextCursor: null
          };
        }
        if (name === "consultarCatalogo" && args.operation === "list_collection_courses") {
          probe.managedCatalogReads += 1;
          const collection = probe.catalogCollections.find((item) => item.collectionId === args.collectionId);
          return {
            items: (collection?.courses || []).filter((course) =>
              !probe.removedCatalogCourseIds.has(course.courseId)
            ).map((course) => ({
              placementId: `placement-${course.courseId}`,
              placementRevision: course.placementRevision,
              position: course.position,
              courseId: course.courseId,
              contractKey: course.title.toLowerCase(),
              title: course.title,
              goal: course.goal,
              publicationSeq: 1,
              contentHash: course.contentHash,
              revision: 1,
              moduleCount: course.moduleCount,
              lessonCount: course.lessonCount,
              updatedAt: "2026-08-03T12:00:00Z"
            })),
            nextCursor: null
          };
        }
        if (name === "editarCatalogo" && args.operation === "create_collection") {
          const othersIndex = probe.catalogCollections.findIndex((collection) => collection.contractKey === "outros");
          const collection = {
            collectionId: "62000000-0000-4000-8000-000000000026",
            contractKey: args.contractKey,
            title: args.title,
            description: args.description || "",
            position: othersIndex,
            revision: 1,
            courses: []
          };
          probe.catalogCollections.splice(othersIndex, 0, collection);
          probe.catalogCollections.forEach((item, position) => { item.position = position; });
          return { collectionId: "62000000-0000-4000-8000-000000000026", revision: 1 };
        }
        if (name === "editarCatalogo" && args.operation === "update_collection") {
          const collection = probe.catalogCollections.find((item) => item.collectionId === args.collectionId);
          collection.title = args.title;
          collection.revision += 1;
          return { collectionId: collection.collectionId, revision: collection.revision };
        }
        if (name === "editarCatalogo" && args.operation === "move_collection") {
          const index = probe.catalogCollections.findIndex((item) => item.collectionId === args.collectionId);
          const [collection] = probe.catalogCollections.splice(index, 1);
          probe.catalogCollections.splice(args.position, 0, collection);
          probe.catalogCollections.forEach((item, position) => { item.position = position; });
          collection.revision += 1;
          return { collectionId: collection.collectionId, revision: collection.revision };
        }
        if (name === "editarCatalogo" && args.operation === "move_course") {
          let moved = null;
          probe.catalogCollections.forEach((collection) => {
            const index = collection.courses.findIndex((course) => course.courseId === args.courseId);
            if (index >= 0) [moved] = collection.courses.splice(index, 1);
          });
          const target = probe.catalogCollections.find((collection) => collection.collectionId === args.targetCollectionId);
          target.courses.splice(Number.isInteger(args.position) ? args.position : target.courses.length, 0, moved);
          probe.catalogCollections.forEach((collection) => collection.courses.forEach((course, position) => {
            course.position = position;
            if (course.courseId === args.courseId) course.placementRevision += 1;
          }));
          return { courseId: args.courseId, collectionId: target.collectionId };
        }
        if (name === "retirarDoCatalogo" && args.operation === "retire_collection") {
          const sourceIndex = probe.catalogCollections.findIndex((item) => item.collectionId === args.collectionId);
          const [source] = probe.catalogCollections.splice(sourceIndex, 1);
          const replacement = probe.catalogCollections.find((item) => item.collectionId === args.replacementCollectionId);
          if (replacement) replacement.courses.push(...source.courses);
          return { status: "retired", collectionId: args.collectionId };
        }
        if (name === "retirarDoCatalogo" && args.operation === "remove_course") {
          probe.removedCatalogCourses.push(structuredClone(args));
          probe.removedCatalogCourseIds.add(args.courseId);
          return { status: "removed", courseId: args.courseId };
        }
        return { workspaceId, revision: 3 };
      },
      async selectCourse(courseId) {
        probe.selectedCourseIds.add(courseId);
      },
      async deleteOwnAccount() {}
    };
    const { renderHomeScreen } = await import("/src/ui/renderHomeScreen.js");
    const renderHomeProbe = () => {
      const homeTrailItemId = "a2000000-0000-4000-8000-000000000010";
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
          selectedHomeTrailItemId: homeTrailItemId,
          trailSnapshot: {
            space: "trails",
            groups: [],
            items: probe.homeCourseVisible ? [{
              itemId: homeTrailItemId,
              trailItemId: homeTrailItemId,
              workspaceId: null,
              courseKey: "course-official-home",
              courseId: "70000000-0000-4000-8000-000000000007",
              selectionId: "80000000-0000-4000-8000-000000000008",
              contentHash: "b".repeat(64),
              kind: "course",
              source: "selection",
              origin: "catalog",
              title: "Curso oficial na home",
              description: "Curso administrativo",
              moduleCount: 0,
              lessonCount: 0,
              microsequenceCount: 0,
              cardCount: 1,
              completedCardCount: 0,
              canEdit: probe.catalogManagementAllowed === true,
              canDelete: probe.catalogManagementAllowed === true,
              canRemove: true,
              pathId: null,
              pathTitle: "",
              pathPosition: Number.MAX_SAFE_INTEGER,
              itemPosition: 0,
              revision: null,
              updatedAt: "2026-08-07T12:00:00Z"
            }] : [],
            capabilities: {
              organize: true,
              catalogManage: probe.catalogManagementAllowed === true,
              catalogReview: probe.catalogManagementAllowed === true
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
    opener.focus();
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

async function revealPanelAction(scope, action, index = 0) {
  const target = scope.locator(`[data-panel-action="${action}"]`).nth(index);
  const menu = target.locator("xpath=ancestor::details[1]");
  if (await menu.count() && !await menu.evaluate((node) => node.open)) {
    await menu.locator(":scope > summary").click();
  }
  return target;
}

async function clickPanelAction(scope, action, index = 0) {
  const target = await revealPanelAction(scope, action, index);
  await target.click();
}

test("painel administra foco entre Coleções e Chatbot sem reintroduzir Organizar", async ({ page }) => {
  await mountPanel(page);
  const collections = page.getByRole("tab", { name: "Coleções" });
  const chatbot = page.getByRole("tab", { name: "Chatbot", exact: true });

  await expect(page.getByRole("dialog", { name: "Painel AraLearn" })).toBeVisible();
  const headerGeometry = await page.evaluate(() => {
    const panel = document.querySelector(".remote-library-panel");
    const controls = [...document.querySelectorAll(".remote-library-tab, .remote-library-close")];
    return {
      panel: panel?.getBoundingClientRect(),
      scrollWidth: panel?.scrollWidth || 0,
      clientWidth: panel?.clientWidth || 0,
      controls: controls.map((control) => control.getBoundingClientRect())
    };
  });
  expect(headerGeometry.scrollWidth).toBeLessThanOrEqual(headerGeometry.clientWidth);
  for (const control of headerGeometry.controls) {
    expect(control.left).toBeGreaterThanOrEqual(headerGeometry.panel.left);
    expect(control.right).toBeLessThanOrEqual(headerGeometry.panel.right);
  }
  await expect(collections).toBeFocused();
  await collections.press("ArrowRight");
  await expect(chatbot).toHaveAttribute("aria-selected", "true");
  await expect(chatbot).toBeFocused();
  await chatbot.press("ArrowRight");
  await expect(collections).toHaveAttribute("aria-selected", "true");
  await expect(collections).toBeFocused();
  await collections.press("End");
  await expect(chatbot).toBeFocused();
  await chatbot.press("Home");
  await expect(collections).toBeFocused();
  await expect(page.getByRole("tab", { name: "Organizar" })).toHaveCount(0);

  const lastControl = page.getByRole("button", { name: "Conta" });
  await lastControl.focus();
  await lastControl.press("Tab");
  await expect(collections).toBeFocused();
  await collections.press("Shift+Tab");
  await expect(lastControl).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-learning-panel]")).toBeHidden();
  await expect(page.locator(".learning-spaces-opener-probe")).toBeFocused();
  const invalidViewMessage = await page.evaluate(async () => {
    try {
      await window.learningSpacesPanel.open("trails");
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(invalidViewMessage).toBe("Área do painel inválida.");
  await expect(page.locator("[data-learning-panel]")).toBeHidden();
});

test("Coleções carrega sob demanda sem consultar Trilhas novamente", async ({ page }) => {
  await mountPanel(page);
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("heading", { name: "Curso oficial", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar Coleção" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Renomear Dataprev" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Organizar Coleções" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.managedCatalogReads)).toBe(0);
  const officialCard = page.locator(".remote-catalog-course-card");
  await expect(officialCard.first()).toHaveAttribute("data-course-origin", "catalog");
  await expect(officialCard.first().getByText("Preparação", { exact: true })).toHaveCount(0);
  if (process.env.ARALEARN_VISUAL_AUDIT === "1") {
    await page.screenshot({ path: "test-results/learning-spaces-collections.png", fullPage: true });
  }
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.collectionReads)).toBe(1);
  const trailReadsBeforeSearch = await page.evaluate(() => window.learningSpacesProbe.trailReads);
  await page.getByRole("searchbox", { name: "Pesquisar cursos em Coleções" }).fill("oficial");
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.collectionReads)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.trailReads)).toBe(
    trailReadsBeforeSearch
  );
});

test("curso de Coleções entra explicitamente em Trilhas antes de poder ser aberto", async ({ page }) => {
  await mountPanel(page);
  await page.getByRole("tab", { name: "Coleções" }).click();
  const course = page.locator(".remote-catalog-course-card").filter({
    has: page.getByRole("heading", { name: "Curso para adicionar", exact: true })
  });
  const add = course.locator('[data-panel-action="add-course-to-trails"]');
  await expect(add).toHaveAttribute("aria-label", "Adicionar a Trilhas");
  await expect(add.locator("xpath=ancestor::details[1]")).toHaveCount(0);
  await expect(course.locator('[data-panel-action="open-course"]')).toHaveCount(0);

  await add.click();
  const selected = page.locator(".remote-catalog-course-card").filter({
    has: page.getByRole("heading", { name: "Curso para adicionar", exact: true })
  });
  const remove = await revealPanelAction(selected, "remove-course-from-trails");
  await expect(remove).toHaveAttribute("aria-label", "Retirar de Trilhas");
  const play = selected.locator('[data-panel-action="open-course"]');
  await expect(play.locator("xpath=ancestor::details[1]")).toHaveCount(0);
  await play.click();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.openCourse)).toEqual({
    courseId: "71000000-0000-4000-8000-000000000017",
    courseKey: ""
  });
});

test("Criar Coleção abre uma nova linha no mesmo eixo dos títulos existentes", async ({ page }) => {
  await mountPanel(page, { admin: true });
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.managedCatalogReads
  )).toBeGreaterThan(0);

  const create = page.getByRole("button", { name: "Criar Coleção" });
  await create.click();

  const newGroup = page.locator('[data-new-catalog-collection="true"]');
  const form = newGroup.locator('[data-catalog-collection-form="create"]');
  const input = form.getByRole("textbox", { name: "Nome da nova Coleção" });
  await expect(newGroup).toBeVisible();
  await expect(form).toHaveClass(/learning-spaces-new-collection-form/u);
  await expect(input).toBeFocused();
  await expect(page.locator(
    ".learning-spaces-collections-heading [data-catalog-collection-form='create']"
  )).toHaveCount(0);
  await expect(page.locator(
    ".learning-spaces-collections > [data-catalog-collection-form='create']"
  )).toHaveCount(0);

  const alignment = await page.evaluate(() => {
    const inputNode = document.querySelector(
      '[data-new-catalog-collection="true"] input[name="title"]'
    );
    const firstTitle = document.querySelector(
      '.learning-spaces-collections .remote-course-group:not(.learning-spaces-new-collection) ' +
      '.learning-spaces-outline-group-heading h2'
    );
    const newRow = document.querySelector('[data-new-catalog-collection="true"]');
    const firstGroup = document.querySelector(
      '.learning-spaces-collections .remote-course-group:not(.learning-spaces-new-collection)'
    );
    const inputBounds = inputNode.getBoundingClientRect();
    const titleBounds = firstTitle.getBoundingClientRect();
    const newRowBounds = newRow.getBoundingClientRect();
    const firstGroupBounds = firstGroup.getBoundingClientRect();
    return {
      horizontalOffset: Math.abs(inputBounds.left - titleBounds.left),
      newRowTop: newRowBounds.top,
      firstGroupTop: firstGroupBounds.top
    };
  });
  expect(alignment.horizontalOffset).toBeLessThanOrEqual(2);
  expect(alignment.newRowTop).toBeLessThan(alignment.firstGroupTop);

  await form.getByRole("button", { name: "Cancelar" }).click();
  await expect(newGroup).toHaveCount(0);
  await expect(create).toBeFocused();
});

test("formulários de Coleções transferem e restauram o foco pelo teclado", async ({ page }) => {
  await mountPanel(page, { admin: true });
  await expect(page.getByRole("button", { name: "Organizar Coleções" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.managedCatalogReads)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Criar Coleção" }).click();
  const newCollectionInput = page.getByRole("textbox", { name: "Nome da nova Coleção" });
  await expect(newCollectionInput).toBeFocused();
  await newCollectionInput.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Criar Coleção" })).toBeFocused();

  const dataprev = page.locator('[data-course-group-id="50000000-0000-4000-8000-000000000005"]');
  await clickPanelAction(dataprev, "edit-catalog-collection");
  const renameCollectionInput = page.getByRole("textbox", { name: "Novo nome de Dataprev" });
  await expect(renameCollectionInput).toBeFocused();
  await renameCollectionInput.fill("Dataprev atualizada");
  await renameCollectionInput.press("Enter");
  await expect(page.locator("summary[aria-label='Ações de Dataprev atualizada']")).toBeFocused();

  const officialCourse = page.locator(".remote-catalog-course-card").filter({
    has: page.getByRole("heading", { name: "Curso oficial", exact: true })
  });
  await clickPanelAction(officialCourse, "choose-catalog-course-collection");
  const collectionSelect = page.getByRole("combobox", { name: "Nova Coleção de Curso oficial" });
  await expect(collectionSelect).toBeFocused();
  await collectionSelect.press("Tab");
  await page.keyboard.press("Enter");
  await expect(officialCourse.locator("summary[aria-label='Ações de Curso oficial']")).toBeFocused();

  const updatedDataprev = page.locator('[data-course-group-id="50000000-0000-4000-8000-000000000005"]');
  await clickPanelAction(updatedDataprev, "retire-catalog-collection");
  const replacementSelect = page.getByRole("combobox", {
    name: "Destino dos cursos de Dataprev atualizada"
  });
  await expect(replacementSelect).toBeFocused();
  await replacementSelect.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("summary[aria-label='Ações de Dataprev atualizada']")).toBeFocused();
});

test("falha ao sair não mantém overlay nem navegação ocupados", async ({ page }) => {
  await mountPanel(page, { failSignOut: true });
  await page.getByRole("button", { name: "Conta" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page.getByText("Não foi possível encerrar a sessão.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.signOutCalls)).toBe(1);
  await expect(page.getByRole("tab", { name: "Coleções" })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Chatbot", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Chatbot", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("alvo contextual abre a observação da entidade e preserva o resource exato", async ({ page }) => {
  await mountPanel(page);

  const lessonOpened = await page.evaluate(() => window.learningSpacesPanel.openObservationTarget({
    courseKey: "course-ready",
    entityType: "lesson",
    entityPath: ["course-plan", "module-plan", "lesson-plan"],
    title: "Elasticidade"
  }));
  expect(lessonOpened).toBe(true);

  const lessonRow = page.locator(".remote-workspace-tree-item.is-lesson").filter({
    has: page.getByRole("heading", { name: "Elasticidade", exact: true })
  });
  const lessonForm = lessonRow.locator("form[data-observation-form]");
  await expect(lessonForm).toBeVisible();
  await expect(lessonForm).toHaveAttribute("data-entity-type", "lesson");
  await expect(lessonForm).toHaveAttribute(
    "data-entity-path",
    '["course-plan","module-plan","lesson-plan"]'
  );
  await expect(lessonForm).not.toHaveAttribute("data-resource-target-id", /.+/u);

  const resourceOpened = await page.evaluate(() => window.learningSpacesPanel.openObservationTarget({
    courseId: "30000000-0000-4000-8000-000000000003",
    entityType: "resource",
    entityPath: ["course-plan", "module-plan", "lesson-plan", "micro-plan", "card-plan"],
    title: "Parágrafo 1",
    resourceTargetId: "body:paragraph-1"
  }));
  expect(resourceOpened).toBe(true);

  const resourcePanel = page.locator(".remote-observation-panel.is-contextual-target");
  const resourceForm = resourcePanel.locator("form[data-observation-form]");
  await expect(resourcePanel.getByRole("heading", { name: "Parágrafo 1" })).toBeVisible();
  await expect(resourceForm).toHaveAttribute("data-entity-type", "resource");
  await expect(resourceForm).toHaveAttribute(
    "data-entity-path",
    '["course-plan","module-plan","lesson-plan","micro-plan","card-plan"]'
  );
  await expect(resourceForm).toHaveAttribute("data-resource-target-id", "body:paragraph-1");
  if (process.env.ARALEARN_VISUAL_AUDIT === "1") {
    await page.screenshot({ path: ".pages/v9-audit/v9-resource-observation.png" });
  }

  await resourceForm.getByRole("textbox", { name: "Observação sobre Parágrafo 1" })
    .fill("Rever o exemplo deste parágrafo.");
  await resourceForm.getByRole("button", { name: "Salvar" }).click();

  await expect.poll(() => page.evaluate(
    () => window.learningSpacesProbe.observationCalls.length
  )).toBe(1);
  const call = await page.evaluate(() => window.learningSpacesProbe.observationCalls[0]);
  expect(call).toMatchObject({
    operation: "create_observation",
    workspaceId: WORKSPACE_ID,
    entityType: "resource",
    entityPath: ["course-plan", "module-plan", "lesson-plan", "micro-plan", "card-plan"],
    resourceTargetId: "body:paragraph-1",
    body: "Rever o exemplo deste parágrafo."
  });
  expect(call.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  await expect(resourcePanel.getByText("Rever o exemplo deste parágrafo.")).toBeVisible();
});

test("curso selecionado é retirado de Trilhas pelo contrato contextual corrente", async ({ page }) => {
  await mountPanel(page);
  const catalogCourse = page.locator('[data-course-origin="catalog"]');
  page.once("dialog", (dialog) => dialog.accept());
  await clickPanelAction(catalogCourse, "remove-course-from-trails");
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
  expect(await page.evaluate(
    () => window.learningSpacesProbe.catalogManagementAllowed
  )).not.toBe(true);
  await expect(page.getByText("Último estado disponível.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar Coleção" })).toHaveCount(0);
  await expect(page.locator('[data-panel-action="remove-course-from-catalog"]')).toHaveCount(0);
  await expect(page.locator(
    '.learning-spaces-home-probe [data-action="delete-course-direct"]'
  )).toHaveCount(0);
});

test("admin organiza Coleções sem alterar Outros nem reordenar resultados filtrados", async ({ page }) => {
  await mountPanel(page, { admin: true });
  await page.getByRole("tab", { name: "Coleções" }).click();
  await expect(page.getByRole("button", { name: "Organizar Coleções" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.managedCatalogReads)).toBeGreaterThan(0);

  if (process.env.ARALEARN_VISUAL_AUDIT === "1") {
    await page.screenshot({ path: "test-results/learning-spaces-collections-admin.png", fullPage: true });
  }

  const others = page.locator('[data-course-group-id="61000000-0000-4000-8000-000000000016"]');
  await expect(others.getByRole("heading", { name: "Outros cursos", exact: true })).toBeVisible();
  await expect(others.getByRole("button", { name: /Mover Outros|Renomear Outros|Retirar Outros/u })).toHaveCount(0);

  const technology = page.locator('[data-course-group-id="60000000-0000-4000-8000-000000000006"]');
  await revealPanelAction(technology, "move-catalog-collection-up");
  await expect(technology.locator('[data-panel-action="move-catalog-collection-down"]')).toBeDisabled();
  await technology.locator('[data-panel-action="move-catalog-collection-up"]').click();
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.catalogActions.at(-1))).toMatchObject({
    name: "editarCatalogo",
    args: {
      operation: "move_collection",
      collectionId: "60000000-0000-4000-8000-000000000006",
      expectedRevision: 1,
      position: 0
    }
  });
  await expect(page.locator(".remote-course-group-heading h2")).toHaveText(["Tecnologia", "Dataprev", "Outros cursos"]);

  const readsBeforeSearch = await page.evaluate(() => ({
    collections: window.learningSpacesProbe.collectionReads,
    managed: window.learningSpacesProbe.managedCatalogReads,
    trails: window.learningSpacesProbe.trailReads
  }));
  await page.getByRole("searchbox", { name: "Pesquisar cursos em Coleções" }).fill("Curso oficial");
  await page.waitForTimeout(350);
  await expect.poll(() => page.evaluate(() => ({
    collections: window.learningSpacesProbe.collectionReads,
    managed: window.learningSpacesProbe.managedCatalogReads,
    trails: window.learningSpacesProbe.trailReads
  }))).toEqual(readsBeforeSearch);
  const dataprev = page.locator('[data-course-group-id="50000000-0000-4000-8000-000000000005"]');
  await expect(dataprev.getByRole("button", { name: "Mover Dataprev para cima" })).toHaveCount(0);
  await expect(dataprev.getByRole("button", { name: "Mover Dataprev para baixo" })).toHaveCount(0);
  const course = dataprev.locator(".remote-catalog-course-card").filter({
    has: page.getByRole("heading", { name: "Curso oficial", exact: true })
  });
  await expect(course.getByRole("button", { name: "Mover Curso oficial para cima" })).toHaveCount(0);
  await expect(course.getByRole("button", { name: "Mover Curso oficial para baixo" })).toHaveCount(0);
});

test("admin conclui o ciclo de grupos e usa Outros como destino da última Coleção temática", async ({ page }) => {
  await mountPanel(page, { admin: true });
  await page.getByRole("tab", { name: "Coleções" }).click();

  await page.getByRole("button", { name: "Criar Coleção" }).click();
  await page.getByRole("textbox", { name: "Nome da nova Coleção" }).fill("Linguagens");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  let created = page.locator(".remote-course-group").filter({
    has: page.getByRole("heading", { name: "Linguagens", exact: true })
  });
  await expect(created).toBeVisible();

  await clickPanelAction(created, "edit-catalog-collection");
  await page.getByRole("textbox", { name: "Novo nome de Linguagens" }).fill("Linguagens e comunicação");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  created = page.locator(".remote-course-group").filter({
    has: page.getByRole("heading", { name: "Linguagens e comunicação", exact: true })
  });
  await expect(created).toBeVisible();

  let dataprev = page.locator('[data-course-group-id="50000000-0000-4000-8000-000000000005"]');
  const official = dataprev.locator(".remote-catalog-course-card").filter({
    has: page.getByRole("heading", { name: "Curso oficial", exact: true })
  });
  await clickPanelAction(official, "move-catalog-course-down");
  await expect.poll(() => page.evaluate(() => window.learningSpacesProbe.catalogActions.at(-1))).toMatchObject({
    name: "editarCatalogo",
    args: { operation: "move_course", position: 1 }
  });

  dataprev = page.locator('[data-course-group-id="50000000-0000-4000-8000-000000000005"]');
  const courseToMove = dataprev.locator(".remote-catalog-course-card").filter({
    has: page.getByRole("heading", { name: "Curso para adicionar", exact: true })
  });
  await clickPanelAction(courseToMove, "choose-catalog-course-collection");
  await page.getByRole("combobox", { name: "Nova Coleção de Curso para adicionar" })
    .selectOption({ label: "Linguagens e comunicação" });
  await page.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(created.getByRole("heading", { name: "Curso para adicionar", exact: true })).toBeVisible();

  const technology = page.locator('[data-course-group-id="60000000-0000-4000-8000-000000000006"]');
  page.once("dialog", (dialog) => dialog.accept());
  await clickPanelAction(technology, "retire-catalog-collection");
  await expect(technology).toHaveCount(0);

  created = page.locator(".remote-course-group").filter({
    has: page.getByRole("heading", { name: "Linguagens e comunicação", exact: true })
  });
  await clickPanelAction(created, "retire-catalog-collection");
  await page.getByRole("combobox", { name: "Destino dos cursos de Linguagens e comunicação" })
    .selectOption({ label: "Outros cursos" });
  page.once("dialog", (dialog) => dialog.accept());
  await created.getByRole("button", { name: "Retirar Coleção" }).click();
  await expect(created).toHaveCount(0);

  const others = page.locator('[data-course-group-id="61000000-0000-4000-8000-000000000016"]');
  await expect(others.getByRole("heading", { name: "Curso para adicionar", exact: true })).toBeVisible();

  dataprev = page.locator('[data-course-group-id="50000000-0000-4000-8000-000000000005"]');
  await revealPanelAction(dataprev, "retire-catalog-collection");
  await expect(dataprev.locator('[data-panel-action="retire-catalog-collection"]')).toBeEnabled();
  await dataprev.locator('[data-panel-action="retire-catalog-collection"]').click();
  await page.getByRole("combobox", { name: "Destino dos cursos de Dataprev" })
    .selectOption({ label: "Outros cursos" });
  page.once("dialog", (dialog) => dialog.accept());
  await dataprev.getByRole("button", { name: "Retirar Coleção" }).click();
  await expect(dataprev).toHaveCount(0);
  await expect(others.getByRole("heading", { name: "Curso oficial", exact: true })).toBeVisible();

  const operations = await page.evaluate(() => window.learningSpacesProbe.catalogActions.map(
    ({ args }) => args.operation
  ));
  expect(operations).toEqual(expect.arrayContaining([
    "create_collection",
    "update_collection",
    "move_course",
    "retire_collection"
  ]));
});

test("conta administrativa distingue retirada pessoal de exclusão global do curso oficial", async ({ page }) => {
  await mountPanel(page, { admin: true });
  const catalogCourse = page.locator('[data-course-origin="catalog"]').filter({
    has: page.getByRole("heading", { name: "Curso oficial", exact: true })
  });
  await revealPanelAction(catalogCourse, "remove-course-from-catalog");
  await expect(catalogCourse.locator('[data-panel-action="remove-course-from-trails"]')).toBeVisible();
  await expect(catalogCourse.locator('[data-panel-action="remove-course-from-catalog"]')).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await catalogCourse.locator('[data-panel-action="remove-course-from-catalog"]').click();

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
