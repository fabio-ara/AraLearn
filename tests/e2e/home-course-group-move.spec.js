import { expect, test } from "@playwright/test";

const FIRST_GROUP_ID = "41000000-0000-4000-8000-000000000041";
const SECOND_GROUP_ID = "42000000-0000-4000-8000-000000000042";
const TRAIL_ITEM_ID = "43000000-0000-4000-8000-000000000043";
const COURSE_ID = "course-home-group-move";

test.use({ viewport: { width: 390, height: 844 } });

test("mover curso é descobrível, acessível e não repete a mutação", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async ({ firstGroupId, secondGroupId, trailItemId, courseId }) => {
    const { createLessonEditorApp } = await import("/src/ui/lessonEditorApp.js");
    const project = {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [{
        id: courseId,
        title: "Curso para organizar",
        goal: "Validar a organização diretamente na Home.",
        modules: []
      }]
    };
    let snapshot = {
      space: "trails",
      groups: [
        { id: secondGroupId, title: "Projetos" },
        { id: firstGroupId, title: "Álgebra" }
      ],
      items: [{
        trailItemId,
        workspaceId: null,
        courseKey: courseId,
        courseId: "44000000-0000-4000-8000-000000000044",
        selectionId: "45000000-0000-4000-8000-000000000045",
        kind: "course",
        source: "selection",
        origin: "private",
        title: "Curso para organizar",
        description: "Validar a organização diretamente na Home.",
        moduleCount: 0,
        lessonCount: 0,
        microsequenceCount: 0,
        cardCount: 1,
        completedCardCount: 0,
        contentHash: "a".repeat(64),
        revision: null,
        canEdit: false,
        canDelete: false,
        canRemove: false,
        pathId: firstGroupId,
        pathTitle: "Álgebra",
        updatedAt: "2026-08-09T12:00:00Z"
      }],
      capabilities: { organize: true, catalogManage: false, catalogReview: false }
    };
    let placeCalls = 0;
    let removeCalls = 0;
    const waitForBusyState = () => new Promise((resolve) => setTimeout(resolve, 80));
    const homeTrails = {
      loadTrailSnapshot: async () => structuredClone(snapshot),
      async placeItem({ trailItemId: targetItemId, groupId }) {
        placeCalls += 1;
        await waitForBusyState();
        const targetGroup = snapshot.groups.find((group) => group.id === groupId);
        snapshot = {
          ...snapshot,
          items: snapshot.items.map((item) => item.trailItemId === targetItemId
            ? { ...item, pathId: groupId, pathTitle: targetGroup?.title || "" }
            : item)
        };
      },
      async removeItemFromGroup({ trailItemId: targetItemId }) {
        removeCalls += 1;
        await waitForBusyState();
        snapshot = {
          ...snapshot,
          items: snapshot.items.map((item) => item.trailItemId === targetItemId
            ? { ...item, pathId: null, pathTitle: "" }
            : item)
        };
      }
    };
    const storage = {
      loadProject: () => structuredClone(project),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      loadCourseSummaries: () => [],
      resolveCourseContractKey: () => courseId,
      loadCommentForPath: () => null,
      async loadCardAssistanceLocalState() { return {}; },
      coursePermissions: () => ({
        role: "learner",
        canAuthorContent: false,
        writeTarget: null,
        canOrganizeSelection: true,
        canRemoveSelection: false,
        canDeleteCourse: false
      })
    };
    const personalStorage = {
      setCourse() {},
      async initialize() {},
      async refresh() {},
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      async clearLocal() {},
      async flush() {}
    };
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    const app = createLessonEditorApp({
      root,
      storage,
      editor: {},
      initialProject: project,
      homeTrails,
      trailPersonalStateFactory: () => personalStorage
    });
    globalThis.__homeGroupMoveHarness = {
      read() {
        return {
          placeCalls,
          removeCalls,
          pathId: snapshot.items[0].pathId
        };
      }
    };
    await app.refreshTrails();
  }, {
    firstGroupId: FIRST_GROUP_ID,
    secondGroupId: SECOND_GROUP_ID,
    trailItemId: TRAIL_ITEM_ID,
    courseId: COURSE_ID
  });

  const groupMenu = page.locator('summary[aria-label="Ações do grupo"]');
  await groupMenu.click();
  await expect(page.getByRole("button", { name: "Criar grupo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar curso" })).toHaveCount(0);
  await groupMenu.click();

  const courseMenu = page.locator('summary[aria-label="Ações do curso"]');
  await courseMenu.focus();
  await page.keyboard.press("Enter");
  const resetAction = page.getByRole("button", { name: "Zerar progresso do curso" });
  const moveAction = page.getByRole("button", { name: "Mover para outro grupo" });
  await expect(moveAction).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(resetAction).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(moveAction).toBeFocused();
  await page.keyboard.press("Enter");

  const targetGroup = page.getByRole("combobox", { name: "Mover curso para o grupo" });
  await expect(targetGroup).toBeFocused();
  await expect(targetGroup.locator("option")).toHaveText(["Álgebra", "Outros", "Projetos"]);
  await page.getByRole("button", { name: "Cancelar mudança de grupo" }).click();
  await expect(courseMenu).toBeFocused();

  await courseMenu.click();
  await moveAction.click();
  await page.getByRole("button", { name: "Mover curso" }).click();
  await expect(courseMenu).toBeFocused();
  await expect.poll(() => page.evaluate(() => globalThis.__homeGroupMoveHarness.read()))
    .toEqual({ placeCalls: 0, removeCalls: 0, pathId: FIRST_GROUP_ID });

  await courseMenu.click();
  await moveAction.click();
  await targetGroup.selectOption(SECOND_GROUP_ID);
  const saveMove = page.getByRole("button", { name: "Mover curso" });
  await saveMove.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.locator(".home-course-selector-card")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#home-group-select")).toHaveValue(SECOND_GROUP_ID);
  await expect(courseMenu).toBeFocused();
  await expect.poll(() => page.evaluate(() => globalThis.__homeGroupMoveHarness.read()))
    .toEqual({ placeCalls: 1, removeCalls: 0, pathId: SECOND_GROUP_ID });

  await courseMenu.click();
  await moveAction.click();
  await targetGroup.selectOption("__others__");
  await page.getByRole("button", { name: "Mover curso" }).click();
  await expect(page.locator("#home-group-select")).toHaveValue("others");
  await expect(courseMenu).toBeFocused();
  await expect.poll(() => page.evaluate(() => globalThis.__homeGroupMoveHarness.read()))
    .toEqual({ placeCalls: 1, removeCalls: 1, pathId: null });
});
