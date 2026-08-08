import { expect, test } from "@playwright/test";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_GROUP_ID = "10000000-0000-4000-8000-000000000002";
const ITEM_ID = "20000000-0000-4000-8000-000000000002";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

function trailSnapshot(items = []) {
  return {
    space: "trails",
    groups: [
      { id: GROUP_ID, title: "Dataprev", position: 0 },
      { id: SECOND_GROUP_ID, title: "Estudos", position: 1 }
    ],
    items,
    hasMore: false,
    nextCursor: null,
    capabilities: { organize: true, catalogManage: false, catalogReview: false }
  };
}

function plan(pathId = GROUP_ID) {
  return {
    trailItemId: ITEM_ID,
    workspaceId: WORKSPACE_ID,
    courseKey: "course-fixture-minimal",
    courseId: null,
    selectionId: null,
    kind: "plan",
    source: "workspace",
    origin: "workspace",
    title: "Dataprev: Teste",
    description: "Plano materializado no chat.",
    moduleCount: 1,
    lessonCount: 1,
    microsequenceCount: 1,
    cardCount: 0,
    completedCardCount: 0,
    contentHash: null,
    revision: 1,
    canEdit: true,
    canDelete: true,
    canRemove: false,
    pathId,
    pathTitle: pathId === GROUP_ID ? "Dataprev" : "Estudos",
    pathPosition: pathId === GROUP_ID ? 0 : 1,
    itemPosition: 0,
    updatedAt: "2026-08-07T12:00:00Z"
  };
}

test("materialização aparece na home, abre a composição e move o plano pelo trailItemId", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async ({ emptySnapshot, populatedSnapshot, itemId, secondGroupId }) => {
    const [{ HomeTrailsController }, { renderHomeScreen }, { createEmptyProgressDocument }] = await Promise.all([
      import("/src/ui/HomeTrailsController.js"),
      import("/src/ui/renderHomeScreen.js"),
      import("/src/storage/progressStore.js")
    ]);
    let snapshot = emptySnapshot;
    let moved = null;
    const adapter = {
      async loadTrailSnapshot() {
        return structuredClone(snapshot);
      },
      async loadWorkspaceCourse() {
        return {
          trailItemId: itemId,
          workspaceId: populatedSnapshot.items[0].workspaceId,
          courseKey: "course-fixture-minimal",
          revision: 1,
          parts: [
            {
              entityType: "course",
              id: "course-fixture-minimal",
              parentType: null,
              parentId: null,
              position: 0,
              content: {
                title: "Dataprev: Teste",
                goal: "Validar a navegação do planejamento materializado."
              }
            },
            {
              entityType: "module",
              id: "module-fixture-minimal",
              parentType: "course",
              parentId: "course-fixture-minimal",
              position: 0,
              content: {
                title: "Módulo",
                guide: {
                  goal: "Cobrir um único conceito.",
                  include: ["conceito"],
                  exclude: [],
                  notation: [],
                  avoid: []
                }
              }
            },
            {
              entityType: "lesson",
              id: "lesson-fixture-minimal",
              parentType: "module",
              parentId: "module-fixture-minimal",
              position: 0,
              content: {
                title: "Lição",
                guide: {
                  goal: "Explicar um conceito.",
                  include: ["conceito"],
                  exclude: [],
                  notation: [],
                  avoid: []
                }
              }
            }
          ]
        };
      },
      async moveItem(argumentsValue) {
        moved = structuredClone(argumentsValue);
        snapshot = {
          ...snapshot,
          items: snapshot.items.map((item) => item.trailItemId === itemId
            ? {
                ...item,
                pathId: argumentsValue.groupId,
                pathTitle: "Estudos",
                pathPosition: 1,
                itemPosition: argumentsValue.targetPosition
              }
            : item)
        };
      }
    };
    const controller = new HomeTrailsController({ adapter });
    await controller.refresh();
    snapshot = populatedSnapshot;
    await controller.refresh();
    document.body.innerHTML = renderHomeScreen({
      project: { contract: "aralearn.contract", version: 4, kind: "project", courses: [] },
      progress: createEmptyProgressDocument(),
      editorSupport: {
        trailSnapshot: controller.snapshot,
        selectedHomeTrailItemId: controller.selectedItemId
      }
    });
    const option = document.querySelector(`option[value="${itemId}"]`)?.textContent?.trim();
    const workspaceAction = document.querySelector('[data-action="open-home-workspace"]')
      ?.getAttribute("data-workspace-id");
    document.body.innerHTML = renderHomeScreen({
      project: { contract: "aralearn.contract", version: 4, kind: "project", courses: [] },
      progress: createEmptyProgressDocument(),
      editorSupport: {
        trailSnapshot: controller.snapshot,
        selectedHomeTrailItemId: controller.selectedItemId,
        homeOrganization: { active: true }
      }
    });
    const organizerVisible = Boolean(document.querySelector(".home-trails-organizer"));
    const organizerUsesTrailItemId = Boolean(document.querySelector(
      `[data-trail-item-id="${itemId}"] [data-action="choose-home-item-group"]`
    ));
    const emptyOthersVisible = Boolean(document.querySelector('[data-group-id="others"]'));
    const course = await controller.loadCourse(itemId);
    await controller.mutate("moveItem", {
      trailItemId: itemId,
      groupId: secondGroupId,
      targetPosition: 0
    });
    return {
      option,
      courseId: course.id,
      moved,
      pathId: controller.item(itemId)?.pathId,
      organizerVisible,
      organizerUsesTrailItemId,
      emptyOthersVisible,
      workspaceAction,
      hasReset: Boolean(document.querySelector('[data-action="reset-course-progress-direct"]'))
    };
  }, {
    emptySnapshot: trailSnapshot(),
    populatedSnapshot: trailSnapshot([plan()]),
    itemId: ITEM_ID,
    secondGroupId: SECOND_GROUP_ID
  });

  expect(result.option).toBe("Dataprev: Teste");
  expect(result.courseId).toBe("course-fixture-minimal");
  expect(result.moved).toEqual({ trailItemId: ITEM_ID, groupId: SECOND_GROUP_ID, targetPosition: 0 });
  expect(result.pathId).toBe(SECOND_GROUP_ID);
  expect(result.organizerVisible).toBe(true);
  expect(result.organizerUsesTrailItemId).toBe(true);
  expect(result.emptyOthersVisible).toBe(false);
  expect(result.workspaceAction).toBe(WORKSPACE_ID);
  expect(result.hasReset).toBe(false);
});

test("painel expõe apenas Coleções e Chatbot e rejeita a rota Organizar", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async ({ emptySnapshot }) => {
    const { createLearningSpacesPanel } = await import("/src/ui/LearningSpacesPanel.js");
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const assistantElement = document.createElement("section");
    assistantElement.textContent = "Chatbot";
    const store = new Map();
    const authClient = {
      sessionStore: {
        getSyncState: async (key) => store.get(key) || null,
        putSyncState: async (key, value) => store.set(key, value)
      },
      getSession: () => ({ user: { id: "40000000-0000-4000-8000-000000000004" } }),
      getAccessToken: async () => "token"
    };
    const catalog = {
      listTrailItems: async () => emptySnapshot,
      listCollections: async () => []
    };
    const panel = createLearningSpacesPanel({
      root,
      catalog,
      authClient,
      beforeRemoteRead: async () => {},
      assistantPanel: {
        element: assistantElement,
        open: async () => {},
        close: () => {}
      },
      documentValue: document
    });
    await panel.open("collections");
    const collectionSelected = root.querySelector('[data-panel-view="collections"]')?.getAttribute("aria-selected");
    await panel.open("chatbot");
    const chatbotSelected = root.querySelector('[data-panel-view="chatbot"]')?.getAttribute("aria-selected");
    let rejected = false;
    try {
      await panel.open("organize");
    } catch (error) {
      rejected = error instanceof TypeError;
    }
    return {
      tabs: [...root.querySelectorAll("[data-panel-view]")].map((node) => node.dataset.panelView),
      collectionSelected,
      chatbotSelected,
      rejected
    };
  }, { emptySnapshot: trailSnapshot() });

  expect(result.tabs).toEqual(["collections", "chatbot"]);
  expect(result.collectionSelected).toBe("true");
  expect(result.chatbotSelected).toBe("true");
  expect(result.rejected).toBe(true);
});
