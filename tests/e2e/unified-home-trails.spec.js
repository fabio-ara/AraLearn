import { expect, test } from "@playwright/test";
import fs from "node:fs";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_GROUP_ID = "10000000-0000-4000-8000-000000000002";
const ITEM_ID = "20000000-0000-4000-8000-000000000002";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_FIXTURE = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v4/project-minimal.json", import.meta.url),
  "utf8"
));

function workspacePartsForCourse(course) {
  const parts = [];
  const add = (entityType, entity, parentType, parentId, position) => {
    const content = structuredClone(entity);
    for (const field of [
      "id", "position", "modules", "lessons", "topics", "microsequences", "cards"
    ]) delete content[field];
    parts.push({ entityType, id: entity.id, parentType, parentId, position, content });
  };
  add("course", course, "project", "project", 0);
  course.modules.forEach((moduleValue, moduleIndex) => {
    add("module", moduleValue, "course", course.id, moduleIndex);
    moduleValue.lessons.forEach((lesson, lessonIndex) => {
      add("lesson", lesson, "module", moduleValue.id, lessonIndex);
      lesson.topics.forEach((topic, topicIndex) => {
        add("topic", topic, "lesson", lesson.id, topicIndex);
      });
      lesson.microsequences.forEach((microsequence, microsequenceIndex) => {
        add("microsequence", microsequence, "lesson", lesson.id, microsequenceIndex);
        microsequence.cards.forEach((card) => {
          add("card", card, "microsequence", microsequence.id, card.position);
        });
      });
    });
  });
  return parts;
}

function trailSnapshot(items = []) {
  return {
    space: "trails",
    groups: [
      { id: GROUP_ID, title: "Dataprev" },
      { id: SECOND_GROUP_ID, title: "Estudos" }
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
    updatedAt: "2026-08-07T12:00:00Z"
  };
}

test("materialização aparece na Home única e muda de grupo pelo trailItemId", async ({ page }) => {
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
      async placeItem(argumentsValue) {
        moved = structuredClone(argumentsValue);
        snapshot = {
          ...snapshot,
          items: snapshot.items.map((item) => item.trailItemId === itemId
            ? {
                ...item,
                pathId: argumentsValue.groupId,
                pathTitle: "Estudos"
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
        homeOrganization: { selectedGroupId: populatedSnapshot.groups[0].id, movingItemId: itemId }
      }
    });
    const organizerVisible = Boolean(document.querySelector(".home-trails-organizer"));
    const integratedMove = Boolean(document.querySelector(
      `[data-home-item-move-form="${itemId}"]`
    ));
    const emptyOthersVisible = Boolean(document.querySelector('#home-group-select option[value="others"]'));
    const groupLabels = [...document.querySelectorAll("#home-group-select option")]
      .map((node) => node.textContent.trim());
    const course = await controller.loadCourse(itemId);
    await controller.mutate("placeItem", {
      trailItemId: itemId,
      groupId: secondGroupId
    });
    return {
      option,
      courseId: course.id,
      moved,
      pathId: controller.item(itemId)?.pathId,
      organizerVisible,
      integratedMove,
      emptyOthersVisible,
      groupLabels,
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
  expect(result.moved).toEqual({ trailItemId: ITEM_ID, groupId: SECOND_GROUP_ID });
  expect(result.pathId).toBe(SECOND_GROUP_ID);
  expect(result.organizerVisible).toBe(false);
  expect(result.integratedMove).toBe(true);
  expect(result.emptyOthersVisible).toBe(true);
  expect(result.groupLabels).toEqual(["Dataprev", "Estudos", "Outros"]);
  expect(result.workspaceAction).toBe(WORKSPACE_ID);
  expect(result.hasReset).toBe(false);
});

test("Play recompõe a posição do card da linha remota e abre o runtime", async ({ page }) => {
  const course = structuredClone(PROJECT_FIXTURE.courses[0]);
  const courseItem = {
    ...plan(),
    kind: "course",
    title: course.title,
    description: course.goal,
    cardCount: course.modules[0].lessons[0].microsequences[0].cards.length
  };
  await page.goto("/");
  await page.evaluate(async ({ remoteSnapshot, remoteParts }) => {
    const { createLessonEditorApp } = await import("/src/ui/lessonEditorApp.js");
    const emptyProject = {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: []
    };
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    const storage = {
      loadProject: () => structuredClone(emptyProject),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      loadCourseSummaries: () => [],
      loadCommentForPath: () => null,
      async loadCardAssistanceLocalState() { return {}; },
      coursePermissions: () => ({
        role: "owner",
        canAuthorContent: true,
        writeTarget: "private",
        canOrganizeSelection: true,
        canRemoveSelection: false,
        canDeleteCourse: true
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
    const app = createLessonEditorApp({
      root,
      storage,
      editor: {},
      initialProject: emptyProject,
      homeTrails: {
        loadTrailSnapshot: async () => structuredClone(remoteSnapshot),
        loadWorkspaceCourse: async () => ({
          trailItemId: remoteSnapshot.items[0].trailItemId,
          workspaceId: remoteSnapshot.items[0].workspaceId,
          courseKey: remoteSnapshot.items[0].courseKey,
          revision: remoteSnapshot.items[0].revision,
          parts: structuredClone(remoteParts)
        }),
        async cacheWorkspaceCourse() {}
      },
      trailPersonalStateFactory: () => personalStorage
    });
    await app.refreshTrails();
  }, {
    remoteSnapshot: trailSnapshot([courseItem]),
    remoteParts: workspacePartsForCourse(course)
  });

  await page.locator('[data-action="open-course"]').click();
  await expect(page.locator('[data-action="open-module"]')).toBeVisible();
  await page.locator('[data-action="open-module"]').click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').click();
  await page.locator(
    '[data-action="open-microsequence-card"][data-card-index="0"]'
  ).click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Regra central");
  await expect(page.locator(".home-trails-error")).toHaveCount(0);
});

test("workspace usa a mesma capacidade no render e nos modos de autoria", async ({ page }) => {
  const course = structuredClone(PROJECT_FIXTURE.courses[0]);
  const courseItem = {
    ...plan(),
    kind: "course",
    title: course.title,
    description: course.goal,
    cardCount: course.modules[0].lessons[0].microsequences[0].cards.length
  };
  const cardPath = [
    course.id,
    course.modules[0].id,
    course.modules[0].lessons[0].id,
    course.modules[0].lessons[0].microsequences[0].id,
    course.modules[0].lessons[0].microsequences[0].cards[0].id
  ];

  await page.goto("/");
  await page.evaluate(async ({ initialSnapshot, remoteParts, exactCardPath }) => {
    const { createLessonEditorApp } = await import("/src/ui/lessonEditorApp.js");
    const emptyProject = {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: []
    };
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    let snapshot = structuredClone(initialSnapshot);
    let authoritativeCourse = null;
    const metadataCalls = [];
    const storage = {
      loadProject: () => structuredClone(emptyProject),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      loadCourseSummaries: () => [],
      loadCommentForPath: () => null,
      async loadCardAssistanceLocalState() { return {}; },
      coursePermissions: () => ({
        role: "learner",
        canAuthorContent: false,
        canComment: false,
        writeTarget: null,
        canOrganizeSelection: false,
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
      loadCommentForPath: () => null,
      async clearLocal() {},
      async flush() {}
    };
    const nextRevision = () => {
      snapshot.items[0].revision += 1;
      return snapshot.items[0].revision;
    };
    const app = createLessonEditorApp({
      root,
      storage,
      editor: {},
      initialProject: emptyProject,
      homeTrails: {
        loadTrailSnapshot: async () => structuredClone(snapshot),
        loadWorkspaceCourse: async () => ({
          trailItemId: snapshot.items[0].trailItemId,
          workspaceId: snapshot.items[0].workspaceId,
          courseKey: snapshot.items[0].courseKey,
          revision: snapshot.items[0].revision,
          parts: structuredClone(remoteParts),
          ...(authoritativeCourse
            ? { draftCourse: structuredClone(authoritativeCourse) }
            : {})
        }),
        async cacheWorkspaceCourse() {}
      },
      workspaceCourseAdapter: {
        async saveMetadata(argumentsValue) {
          metadataCalls.push(structuredClone(argumentsValue));
          authoritativeCourse = structuredClone(argumentsValue.draftCourse);
          authoritativeCourse.title = `${argumentsValue.metadata.title} · confirmada`;
          return { revision: nextRevision(), course: authoritativeCourse };
        },
        async saveMicrosequenceCards() { return { revision: nextRevision() }; },
        async moveEntity() { return { revision: nextRevision() }; },
        async deleteEntity() { return { revision: nextRevision() }; },
        async deleteCourse() { return { revision: nextRevision() }; }
      },
      trailPersonalStateFactory: () => personalStorage
    });
    globalThis.__workspaceCapabilitiesProbe = {
      app,
      exactCardPath,
      metadataCalls,
      async revoke() {
        snapshot.items[0].canEdit = false;
        snapshot.items[0].canDelete = false;
        await app.refreshTrails();
      }
    };
    await app.refreshTrails();
  }, {
    initialSnapshot: trailSnapshot([courseItem]),
    remoteParts: workspacePartsForCourse(course),
    exactCardPath: cardPath
  });

  const editMode = (level) => page.locator(
    `[data-action="select-entity-mode"][data-entity-level="${level}"][data-entity-mode="edit"]`
  );
  const aiMode = (level) => page.locator(
    `[data-action="select-entity-mode"][data-entity-level="${level}"][data-entity-mode="ai"]`
  );
  const expectCurrentLabelEditing = async (level) => {
    const summary = page.locator(
      `.entity-summary[data-structure-level="${level}"][data-inline-structure-editor="true"]`
    );
    await expect(summary).toHaveCount(1);
    await expect(summary.locator('[data-field="inline-entity-title"]')).toBeEditable();
    await expect(summary.locator('[data-field="inline-entity-title"]')).toBeFocused();
  };

  await page.locator('[data-action="open-course"]').click();
  await editMode("course").click();
  await expectCurrentLabelEditing("course");
  await page.locator('.entity-summary [data-field="inline-entity-title"]').fill("Curso do workspace");
  await page.locator('[data-action="save-inline-entity"]').click();
  await expect.poll(() => page.evaluate(
    () => globalThis.__workspaceCapabilitiesProbe.metadataCalls.length
  )).toBe(1);
  await expect(page.getByText("Curso do workspace · confirmada", { exact: true })).toBeVisible();

  await page.locator('[data-action="open-module"]').click();
  await editMode("module").click();
  await expectCurrentLabelEditing("module");

  await page.locator('[data-action="open-lesson"]').click();
  await editMode("lesson").click();
  await expectCurrentLabelEditing("lesson");
  await expect(aiMode("lesson")).toHaveCount(0);

  await page.locator('[data-action="open-microsequence-overview"]').click();
  await editMode("microsequence").click();
  await expectCurrentLabelEditing("microsequence");
  await expect(aiMode("microsequence")).toHaveCount(0);

  await page.locator('[data-action="open-microsequence-card"]').first().click();
  await editMode("card").click();
  const cardTitle = page.locator(
    '.runtime-card-manual-editor.is-card-title-editor [data-manual-edit-key="title"]'
  );
  await expect(cardTitle).toBeEditable();
  await expect(cardTitle).toBeFocused();
  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="card"][data-entity-mode="view"]'
  ).click();
  await aiMode("card").click();
  await expect(page.locator(".workbench-surface")).toHaveClass(/is-editing/u);
  await expect(page.locator('[data-action="toggle-card-assistance-composer"]')).toBeVisible();

  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="card"][data-entity-mode="view"]'
  ).click();
  await page.evaluate(() => globalThis.__workspaceCapabilitiesProbe.revoke());
  await expect(page.locator(".workbench-surface")).not.toHaveClass(/is-editing/u);
  await expect(editMode("card")).toHaveCount(0);
  await expect(aiMode("card")).toHaveCount(0);
  const openedForEditing = await page.evaluate(() => globalThis.__workspaceCapabilitiesProbe.app.openCardPath(
    globalThis.__workspaceCapabilitiesProbe.exactCardPath,
    { edit: true }
  ));
  expect(openedForEditing).toBe(false);
});

test("Home mantém eixo central e tipografia simétrica entre os seletores", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async ({ populatedSnapshot, itemId }) => {
    const { renderHomeScreen } = await import("/src/ui/renderHomeScreen.js");
    const snapshot = structuredClone(populatedSnapshot);
    snapshot.items[0] = {
      ...snapshot.items[0],
      kind: "course",
      cardCount: 1,
      courseId: "22000000-0000-4000-8000-000000000022",
      selectionId: "23000000-0000-4000-8000-000000000023",
      workspaceId: null,
      source: "selection",
      origin: "private"
    };
    document.body.innerHTML = renderHomeScreen({
      project: { contract: "aralearn.contract", version: 4, kind: "project", courses: [] },
      progress: { version: 1, lessons: {} },
      editorSupport: {
        trailSnapshot: snapshot,
        selectedHomeTrailItemId: itemId,
        homeOrganization: { selectedGroupId: snapshot.groups[0].id }
      }
    });
    const header = document.querySelector(".home-topbar").getBoundingClientRect();
    const heading = document.querySelector(".home-topbar .topbar-title").getBoundingClientRect();
    const groupSelect = getComputedStyle(document.querySelector("#home-group-select"));
    const courseSelect = getComputedStyle(document.querySelector("#home-course-select"));
    return {
      centerDelta: Math.abs(
        (heading.left + heading.width / 2) - (header.left + header.width / 2)
      ),
      groupTypography: [groupSelect.fontSize, groupSelect.fontWeight, groupSelect.lineHeight],
      courseTypography: [courseSelect.fontSize, courseSelect.fontWeight, courseSelect.lineHeight],
      groupHeight: document.querySelector("#home-group-select").getBoundingClientRect().height,
      courseHeight: document.querySelector("#home-course-select").getBoundingClientRect().height
    };
  }, { populatedSnapshot: trailSnapshot([plan()]), itemId: ITEM_ID });

  expect(result.centerDelta).toBeLessThanOrEqual(0.5);
  expect(result.groupTypography).toEqual(result.courseTypography);
  expect(result.groupHeight).toBe(result.courseHeight);
});

test("editar curso mantém a Home e torna o próprio resumo editável", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createLessonEditorApp } = await import("/src/ui/lessonEditorApp.js");
    const project = {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [{
        id: "course-inline-home",
        title: "Curso antes",
        goal: "Descrição antes",
        modules: []
      }]
    };
    const trailItemId = "24000000-0000-4000-8000-000000000024";
    const courseId = "25000000-0000-4000-8000-000000000025";
    const selectionId = "26000000-0000-4000-8000-000000000026";
    const groupId = "27000000-0000-4000-8000-000000000027";
    let snapshot = {
      space: "trails",
      groups: [{ id: groupId, title: "Estudos" }],
      items: [{
        trailItemId,
        workspaceId: null,
        courseKey: "course-inline-home",
        courseId,
        selectionId,
        kind: "course",
        source: "selection",
        origin: "private",
        title: "Curso antes",
        description: "Descrição antes",
        moduleCount: 0,
        lessonCount: 0,
        microsequenceCount: 0,
        cardCount: 1,
        completedCardCount: 0,
        contentHash: "a".repeat(64),
        revision: null,
        canEdit: true,
        canDelete: true,
        canRemove: false,
        pathId: groupId,
        pathTitle: "Estudos",
        updatedAt: "2026-08-08T12:00:00Z"
      }],
      capabilities: { organize: true, catalogManage: false, catalogReview: false }
    };
    let currentProject = structuredClone(project);
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    const storage = {
      loadProject: () => structuredClone(currentProject),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      loadCommentForPath: () => null,
      async loadCardAssistanceLocalState() { return {}; },
      resolveCourseContractKey: () => "course-inline-home",
      coursePermissions: () => ({
        role: "owner",
        canAuthorContent: true,
        writeTarget: "private",
        canOrganizeSelection: true,
        canRemoveSelection: false,
        canDeleteCourse: true
      }),
      createLocalCourseDraftGuard: () => ({
        contract: "aralearn.local-course-draft-guard.v1",
        courseId,
        courseKey: "course-inline-home",
        expectedRevision: null
      }),
      async saveProject(nextProject) {
        currentProject = structuredClone(nextProject);
      },
      async saveProjectWithCardAssistanceState(nextProject, { localState }) {
        currentProject = structuredClone(nextProject);
        return { localState: structuredClone(localState) };
      },
      async flush() {}
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
    const createdGroupId = "28000000-0000-4000-8000-000000000028";
    let createGroupCalls = 0;
    const homeTrails = {
      loadTrailSnapshot: async () => structuredClone(snapshot),
      async createGroup({ title }) {
        createGroupCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        snapshot = {
          ...snapshot,
          groups: [...snapshot.groups, { id: createdGroupId, title, revision: 1 }]
        };
      },
      async renameGroup({ groupId: targetGroupId, title }) {
        snapshot = {
          ...snapshot,
          groups: snapshot.groups.map((group) => group.id === targetGroupId
            ? { ...group, title, revision: group.revision + 1 }
            : group)
        };
      },
      async deleteGroup({ groupId: targetGroupId }) {
        snapshot = {
          ...snapshot,
          groups: snapshot.groups.filter((group) => group.id !== targetGroupId),
          items: snapshot.items.map((item) => item.pathId === targetGroupId
            ? { ...item, pathId: null, pathTitle: "" }
            : item)
        };
      },
      async placeItem({ trailItemId: targetItemId, groupId: targetGroupId }) {
        const targetGroup = snapshot.groups.find((group) => group.id === targetGroupId);
        snapshot = {
          ...snapshot,
          items: snapshot.items.map((item) => item.trailItemId === targetItemId
            ? { ...item, pathId: targetGroupId, pathTitle: targetGroup?.title || "" }
            : item)
        };
      },
      async removeItemFromGroup({ trailItemId: targetItemId }) {
        snapshot = {
          ...snapshot,
          items: snapshot.items.map((item) => item.trailItemId === targetItemId
            ? { ...item, pathId: null, pathTitle: "" }
            : item)
        };
      }
    };
    const app = createLessonEditorApp({
      root,
      storage,
      editor: {},
      initialProject: currentProject,
      homeTrails,
      trailPersonalStateFactory: () => personalStorage
    });
    await app.refreshTrails();
    for (let attempt = 0; attempt < 40 && !root.querySelector('[data-action="edit-course"]'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const editButton = root.querySelector('[data-action="edit-course"]');
    editButton?.click();
    for (let attempt = 0; attempt < 40 && !root.querySelector('[data-inline-structure-editor="true"]'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const editor = root.querySelector('[data-inline-structure-editor="true"]');
    const title = editor?.querySelector('[data-field="inline-entity-title"]');
    const description = editor?.querySelector('[data-field="inline-entity-description"]');
    if (title) title.innerText = "Curso depois";
    if (description) description.innerText = "Descrição depois";
    root.querySelector('[data-action="save-inline-entity"]')?.click();
    for (let attempt = 0; attempt < 40 && root.querySelector('[data-inline-structure-editor="true"]'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const renderedTitleAfterSave = root.querySelector('.home-course-selector-heading h2')?.textContent.trim();
    const renderedDescriptionAfterSave = root.querySelector('.home-course-selector-preview .card-subtitle')?.textContent.trim();
    root.querySelector('[data-action="start-home-group-create"]')?.click();
    let groupInput = root.querySelector('[data-home-group-form="create"] input[name="title"]');
    if (groupInput) groupInput.value = "Álgebra";
    const createGroupButton = root.querySelector(
      '[data-home-group-form="create"] [data-action="save-home-group"]'
    );
    createGroupButton?.click();
    createGroupButton?.click();
    for (let attempt = 0; attempt < 40 && ![...root.querySelectorAll('#home-group-select option')]
      .some((option) => option.textContent.trim() === "Álgebra"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    root.querySelector('[data-action="edit-home-group"]')?.click();
    groupInput = root.querySelector('[data-home-group-form="rename"] input[name="title"]');
    if (groupInput) groupInput.value = "Projetos";
    root.querySelector('[data-home-group-form="rename"] [data-action="save-home-group"]')?.click();
    for (let attempt = 0; attempt < 40 && ![...root.querySelectorAll('#home-group-select option')]
      .some((option) => option.textContent.trim() === "Projetos"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const groupSelect = root.querySelector('#home-group-select');
    if (groupSelect) {
      groupSelect.value = groupId;
      groupSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    root.querySelector('[data-action="choose-home-item-group"]')?.click();
    const moveSelect = root.querySelector('[data-home-item-move-form] select[name="groupId"]');
    if (moveSelect) moveSelect.value = createdGroupId;
    root.querySelector('[data-action="save-home-item-group"]')?.click();
    for (let attempt = 0; attempt < 40 && root.querySelector('#home-group-select')?.value !== createdGroupId; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const groupLabels = [...root.querySelectorAll('#home-group-select option')]
      .map((option) => option.textContent.trim());
    return {
      hadInlineEditor: Boolean(editor && title && description),
      hadEditButton: Boolean(editButton),
      savedTitle: currentProject.courses[0].title,
      savedDescription: currentProject.courses[0].goal,
      remainsOnHome: Boolean(root.querySelector('[data-field="home-course-select"]')),
      openedHierarchy: Boolean(root.querySelector("[data-structure-collection='module']")),
      inlineEditorClosed: !root.querySelector('[data-inline-structure-editor="true"]'),
      renderedTitleAfterSave,
      renderedDescriptionAfterSave,
      renderedTitle: root.querySelector('.home-course-selector-heading h2')?.textContent.trim(),
      renderedDescription: root.querySelector('.home-course-selector-preview .card-subtitle')?.textContent.trim(),
      groupLabels,
      createGroupCalls,
      selectedGroupId: root.querySelector('#home-group-select')?.value,
      itemGroupId: snapshot.items[0].pathId
    };
  });

  expect(result).toEqual({
    hadInlineEditor: true,
    hadEditButton: true,
    savedTitle: "Curso depois",
    savedDescription: "Descrição depois",
    remainsOnHome: true,
    openedHierarchy: false,
    inlineEditorClosed: true,
    renderedTitleAfterSave: "Curso depois",
    renderedDescriptionAfterSave: "Descrição depois",
    renderedTitle: "Curso depois",
    renderedDescription: "Descrição depois",
    groupLabels: ["Estudos", "Outros", "Projetos"],
    createGroupCalls: 1,
    selectedGroupId: "28000000-0000-4000-8000-000000000028",
    itemGroupId: "28000000-0000-4000-8000-000000000028"
  });
});

test("zerar curso de workspace carrega a composição antes de remover o progresso", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createLessonEditorApp } = await import("/src/ui/lessonEditorApp.js");
    const courseKey = "course-lazy-reset";
    const trailItemId = "29000000-0000-4000-8000-000000000029";
    const workspaceId = "30000000-0000-4000-8000-000000000030";
    const groupId = "31000000-0000-4000-8000-000000000031";
    const emptyProject = {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: []
    };
    const snapshot = {
      space: "trails",
      groups: [{ id: groupId, title: "Estudos" }],
      items: [{
        trailItemId,
        workspaceId,
        courseKey,
        courseId: null,
        selectionId: null,
        kind: "course",
        source: "workspace",
        origin: "workspace",
        title: "Curso remoto",
        description: "Ainda não carregado neste dispositivo.",
        moduleCount: 1,
        lessonCount: 1,
        microsequenceCount: 0,
        cardCount: 1,
        completedCardCount: 0,
        contentHash: null,
        revision: 3,
        canEdit: true,
        canDelete: true,
        canRemove: false,
        pathId: groupId,
        pathTitle: "Estudos",
        updatedAt: "2026-08-08T12:00:00Z"
      }],
      capabilities: { organize: true, catalogManage: false, catalogReview: false }
    };
    let loadCalls = 0;
    let initialized = 0;
    let removedReferences = null;
    const homeTrails = {
      loadTrailSnapshot: async () => structuredClone(snapshot),
      async loadWorkspaceCourse() {
        loadCalls += 1;
        return {
          trailItemId,
          workspaceId,
          courseKey,
          revision: 3,
          parts: [{
            entityType: "course",
            id: courseKey,
            parentType: null,
            parentId: null,
            position: 0,
            content: { title: "Curso remoto", goal: "Objetivo remoto" }
          }, {
            entityType: "module",
            id: "module-lazy-reset",
            parentType: "course",
            parentId: courseKey,
            position: 0,
            content: {
              title: "Módulo remoto",
              guide: {
                goal: "Cobrir um conceito.",
                include: ["conceito"],
                exclude: [],
                notation: [],
                avoid: []
              }
            }
          }, {
            entityType: "lesson",
            id: "lesson-lazy-reset",
            parentType: "module",
            parentId: "module-lazy-reset",
            position: 0,
            content: {
              title: "Lição remota",
              guide: {
                goal: "Explicar um conceito.",
                include: ["conceito"],
                exclude: [],
                notation: [],
                avoid: []
              }
            }
          }]
        };
      }
    };
    const personalStorage = {
      setCourse() {},
      async initialize() { initialized += 1; },
      async refresh() {},
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      async removeProgressEntries(references) {
        removedReferences = structuredClone(references);
      },
      async clearLocal() {},
      async flush() {}
    };
    const storage = {
      loadProject: () => structuredClone(emptyProject),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      loadCommentForPath: () => null,
      async loadCardAssistanceLocalState() { return {}; },
      resolveCourseContractKey: (value) => value,
      coursePermissions: () => ({
        role: "owner",
        canAuthorContent: true,
        writeTarget: "private",
        canOrganizeSelection: true,
        canRemoveSelection: false,
        canDeleteCourse: true
      })
    };
    const root = document.createElement("main");
    document.body.replaceChildren(root);
    globalThis.confirm = () => true;
    const app = createLessonEditorApp({
      root,
      storage,
      editor: {},
      initialProject: emptyProject,
      homeTrails,
      trailPersonalStateFactory: () => personalStorage
    });
    await app.refreshTrails();
    for (let attempt = 0; attempt < 80 && !root.querySelector('[data-action="reset-course-progress-direct"]'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const reset = root.querySelector('[data-action="reset-course-progress-direct"]');
    reset?.click();
    for (let attempt = 0; attempt < 80 && !removedReferences; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return {
      hadReset: Boolean(reset),
      loadCalls,
      initialized,
      removedReferences,
      remainsOnHome: Boolean(root.querySelector('[data-field="home-course-select"]')),
      error: root.querySelector(".home-trails-error")?.textContent.trim() || ""
    };
  });

  expect(result).toEqual({
    hadReset: true,
    loadCalls: 1,
    initialized: 1,
    removedReferences: [{
      courseKey: "course-lazy-reset",
      moduleKey: "module-lazy-reset",
      lessonKey: "lesson-lazy-reset"
    }],
    remainsOnHome: true,
    error: ""
  });
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
