import { expect, test } from "@playwright/test";
import fs from "node:fs";

const USER_ID = "91000000-0000-4000-8000-000000000091";
const GROUP_ID = "92000000-0000-4000-8000-000000000092";
const TRAIL_ITEM_ID = "93000000-0000-4000-8000-000000000093";
const WORKSPACE_ID = "94000000-0000-4000-8000-000000000094";
const REMOTE_STATE_KEY = "aralearn.e2e.workspace-offline-authoring.remote";
const PROJECT_FIXTURE = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));

const EDITED_AFTER =
  "Mesmo sem conexão, esta explicação permanece legível, selecionável e pronta para sincronizar.";

async function bootWorkspaceApp(page, { reset = false } = {}) {
  await page.evaluate(async ({
    userId,
    groupId,
    trailItemId,
    workspaceId,
    remoteStateKey,
    initialCourse,
    reset
  }) => {
    const [
      { IndexedDbRelationalStore },
      { LearningSpaces },
      { createLessonEditorApp }
    ] = await Promise.all([
      import("/src/persistence/IndexedDbRelationalStore.js"),
      import("/src/supabase/LearningSpaces.js"),
      import("/src/ui/lessonEditorApp.js")
    ]);

    if (reset) {
      await IndexedDbRelationalStore.deleteDatabase(globalThis.indexedDB, { userId });
      localStorage.setItem(remoteStateKey, JSON.stringify({
        course: structuredClone(initialCourse),
        revision: 1,
        writes: []
      }));
    }

    const readRemote = () => JSON.parse(localStorage.getItem(remoteStateKey));
    const writeRemote = (value) => localStorage.setItem(remoteStateKey, JSON.stringify(value));
    const entityId = (value) => String(value?.id || value?.key || "");
    const partsFromCourse = (course) => {
      const parts = [];
      const add = (entityType, entity, parentType = null, parentId = null, position = 0) => {
        const content = structuredClone(entity);
        for (const key of ["id", "position"]) delete content[key];
        const childFields = {
          course: ["modules"],
          module: ["lessons"],
          lesson: ["topics", "microsequences"],
          microsequence: ["cards"]
        };
        for (const key of childFields[entityType] || []) delete content[key];
        parts.push({ entityType, id: entityId(entity), parentType, parentId, position, content });
      };
      add("course", course);
      course.modules.forEach((moduleValue, moduleIndex) => {
        add("module", moduleValue, "course", entityId(course), moduleIndex);
        moduleValue.lessons.forEach((lesson, lessonIndex) => {
          add("lesson", lesson, "module", entityId(moduleValue), lessonIndex);
          lesson.topics.forEach((topic, topicIndex) => {
            add("topic", topic, "lesson", entityId(lesson), topicIndex);
          });
          lesson.microsequences.forEach((microsequence, microsequenceIndex) => {
            add("microsequence", microsequence, "lesson", entityId(lesson), microsequenceIndex);
            microsequence.cards.forEach((card) => {
              add("card", card, "microsequence", entityId(microsequence), card.position);
            });
          });
        });
      });
      return parts;
    };
    const trailPage = () => {
      const remote = readRemote();
      const course = remote.course;
      const microsequences = course.modules.flatMap((moduleValue) =>
        moduleValue.lessons.flatMap((lesson) => lesson.microsequences)
      );
      return {
        space: "trails",
        groups: [{ id: groupId, title: "Lógica" }],
        items: [{
          trailItemId,
          workspaceId,
          courseKey: entityId(course),
          courseId: null,
          selectionId: null,
          contentHash: null,
          kind: "course",
          source: "workspace",
          origin: "workspace",
          title: course.title,
          description: course.goal,
          moduleCount: course.modules.length,
          lessonCount: course.modules.reduce(
            (total, moduleValue) => total + moduleValue.lessons.length,
            0
          ),
          microsequenceCount: microsequences.length,
          cardCount: microsequences.reduce(
            (total, microsequence) => total + microsequence.cards.length,
            0
          ),
          completedCardCount: 0,
          canEdit: true,
          canDelete: true,
          canRemove: false,
          pathId: groupId,
          pathTitle: "Lógica",
          revision: remote.revision,
          updatedAt: "2026-08-09T12:00:00Z"
        }],
        hasMore: false,
        nextCursor: null,
        capabilities: { organize: true, catalogManage: false, catalogReview: false }
      };
    };
    const workspaceResponse = () => {
      const remote = readRemote();
      return {
        trailItemId,
        workspaceId,
        courseKey: entityId(remote.course),
        revision: remote.revision,
        parts: partsFromCourse(remote.course),
        hasMore: false,
        nextCursor: null
      };
    };
    const requireOnline = () => {
      if (globalThis.navigator.onLine !== false) return;
      throw new TypeError("rede indisponível no cenário E2E");
    };
    const catalog = {
      async listTrailItems() {
        requireOnline();
        return trailPage();
      },
      async getTrailWorkspaceCourse() {
        requireOnline();
        return workspaceResponse();
      },
      async executeApplicationAuthoringAction(action, argumentsValue) {
        requireOnline();
        if (action !== "salvarCardsNaMicrossequencia") {
          throw new Error(`Ação estrutural inesperada no cenário: ${action}`);
        }
        const remote = readRemote();
        if (argumentsValue.expectedRevision !== remote.revision) {
          const error = new Error("A revisão remota mudou.");
          error.status = 409;
          throw error;
        }
        const [courseKey, moduleKey, lessonKey, microsequenceKey] =
          argumentsValue.microsequencePath;
        if (entityId(remote.course) !== courseKey) throw new Error("Curso remoto incorreto.");
        const moduleValue = remote.course.modules.find((value) => entityId(value) === moduleKey);
        const lesson = moduleValue?.lessons.find((value) => entityId(value) === lessonKey);
        const microsequence = lesson?.microsequences.find(
          (value) => entityId(value) === microsequenceKey
        );
        if (!microsequence) throw new Error("Microssequência remota não encontrada.");
        microsequence.cards = JSON.parse(argumentsValue.cardsJson);
        remote.revision += 1;
        remote.writes.push({
          action,
          requestId: argumentsValue.requestId,
          expectedRevision: argumentsValue.expectedRevision,
          revision: remote.revision
        });
        writeRemote(remote);
        return { revision: remote.revision };
      }
    };

    const store = await IndexedDbRelationalStore.open(globalThis.indexedDB, { userId });
    const authClient = {
      sessionStore: store,
      getSession: () => ({ user: { id: userId } })
    };
    const learningSpaces = new LearningSpaces({ catalog, authClient });
    const emptyProject = { contract: "aralearn.library.v1", scope: "course", courses: [] };
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
    const oldRoot = document.querySelector("#app-root");
    const root = document.createElement("main");
    root.id = "app-root";
    if (oldRoot) oldRoot.replaceWith(root);
    else document.body.replaceChildren(root);
    const app = createLessonEditorApp({
      root,
      storage,
      editor: {},
      initialProject: emptyProject,
      homeTrails: learningSpaces,
      workspaceCourseAdapter: {
        load({ item, courseRef }) {
          return learningSpaces.loadWorkspaceCourse(courseRef || item);
        },
        saveMetadata(argumentsValue) {
          return learningSpaces.queueWorkspaceMetadata(argumentsValue);
        },
        saveMicrosequenceCards(argumentsValue) {
          return learningSpaces.queueWorkspaceCards(argumentsValue);
        },
        moveEntity() {
          throw new Error("Mover não pode ser chamado offline.");
        },
        deleteEntity() {
          throw new Error("Excluir não pode ser chamado offline.");
        },
        deleteCourse() {
          throw new Error("Excluir não pode ser chamado offline.");
        }
      },
      trailPersonalStateFactory: () => personalStorage
    });
    const courseRef = {
      trailItemId,
      workspaceId,
      courseKey: entityId(readRemote().course),
      revision: readRemote().revision
    };
    const probe = {
      app,
      learningSpaces,
      store,
      courseRef,
      syncPromise: null,
      remote: readRemote,
      queue: () => learningSpaces.readWorkspaceAuthoringQueue(courseRef)
    };
    globalThis.__workspaceOfflineAuthoringProbe = probe;
    globalThis.addEventListener("online", () => {
      probe.syncPromise = learningSpaces.syncAllWorkspaceAuthoringQueues()
        .then(async (results) => {
          if (results.some(Boolean)) await app.refreshTrails();
          return results;
        });
    }, { once: true });
    await app.refreshTrails();
  }, {
    userId: USER_ID,
    groupId: GROUP_ID,
    trailItemId: TRAIL_ITEM_ID,
    workspaceId: WORKSPACE_ID,
    remoteStateKey: REMOTE_STATE_KEY,
    initialCourse: PROJECT_FIXTURE.courses[0],
    reset
  });
}

async function openFirstWorkspaceCard(page) {
  await expect(page.locator('[data-action="open-course"]')).toBeVisible();
  await page.locator('[data-action="open-course"]').click();
  await expect(page.locator('[data-action="open-module"]')).toBeVisible();
  await page.locator('[data-action="open-module"]').click();
  if (!await page.locator(".runtime-card-sheet").isVisible()) {
    const lesson = page.locator('[data-action="open-lesson"]').first();
    if (await lesson.isVisible()) await lesson.click();
    const overview = page.locator('[data-action="open-microsequence-overview"]').first();
    if (await overview.isVisible()) await overview.click();
    const card = page.locator(
      '[data-action="open-microsequence-card"][data-card-index="0"]'
    ).first();
    if (await card.isVisible()) await card.click();
  }
  await expect(page.locator(".runtime-card-sheet")).toBeVisible();
}

function cardMode(page, mode) {
  return page.locator(
    `[data-action="select-entity-mode"][data-entity-level="card"]` +
    `[data-entity-mode="${mode}"]`
  );
}

async function selectFeedbackForManualEdit(page) {
  if (await cardMode(page, "edit").getAttribute("aria-pressed") !== "true") {
    await cardMode(page, "edit").click();
  }
  await expect(page.locator(".workbench-surface")).toHaveClass(/is-editing/u);
  await page.getByRole("region", { name: "Explicações do card" })
    .getByRole("button", { name: /Selecionar/u })
    .click();
  const field = page.locator(
    '[data-resource-edit-target="feedback:card-fixture-minimal-regra-feedback-text"] ' +
    '[data-manual-edit-path="text"]'
  );
  await expect(field).toBeEditable();
  return field;
}

test("workspace preserva edição textual offline e sincroniza a fila após recarregar no Pixel 7", async ({
  page,
  context
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await bootWorkspaceApp(page, { reset: true });
  await openFirstWorkspaceCard(page);

  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(cardMode(page, "edit")).toBeVisible();
  await cardMode(page, "edit").click();
  await expect(cardMode(page, "ai")).toHaveCount(0);
  await expect(page.locator([
    '[data-action="move-inline-structure-up"]',
    '[data-action="move-inline-structure-down"]',
    '[data-action="delete-entity-direct"]',
    '[data-action="delete-course-direct"]'
  ].join(","))).toHaveCount(0);

  const afterField = await selectFeedbackForManualEdit(page);
  await afterField.fill(EDITED_AFTER);
  await page.locator('[data-action="save-manual-card-edit"]').click();
  await expect(page.locator(".card-assistance-message")).toContainText(
    "salva neste dispositivo"
  );

  const beforeReload = await page.evaluate(async () => {
    const probe = globalThis.__workspaceOfflineAuthoringProbe;
    const queue = await probe.queue();
    const card = queue.draftCourse.modules[0].lessons[0].microsequences[0].cards[0];
    return {
      requestId: queue.operations[0].requestId,
      after: card.feedback[0].data.text,
      cardIds: queue.draftCourse.modules[0].lessons[0].microsequences[0].cards
        .map((value) => value.id),
      positions: queue.draftCourse.modules[0].lessons[0].microsequences[0].cards
        .map((value) => value.position)
    };
  });
  expect(beforeReload.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(beforeReload.after).toBe(EDITED_AFTER);
  expect(beforeReload.cardIds).toEqual([
    "card-fixture-minimal-regra",
    "card-fixture-minimal-complete"
  ]);
  expect(beforeReload.positions).toEqual([1, 2]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await bootWorkspaceApp(page);

  await expect(page.locator(".home-trails-stale")).toContainText("Neste dispositivo");
  await page.locator(".home-course-context-menu summary").click();
  await expect(page.locator('[data-action="edit-course"]')).toBeVisible();
  await expect(page.locator('[data-action="choose-home-item-group"]')).toHaveCount(0);
  await expect(page.locator('[data-action="delete-course-direct"]')).toHaveCount(0);

  const afterReload = await page.evaluate(async () => {
    const queue = await globalThis.__workspaceOfflineAuthoringProbe.queue();
    return {
      requestId: queue.operations[0].requestId,
      after: queue.draftCourse.modules[0].lessons[0].microsequences[0].cards[0]
        .feedback[0].data.text
    };
  });
  expect(afterReload).toEqual({
    requestId: beforeReload.requestId,
    after: EDITED_AFTER
  });

  await openFirstWorkspaceCard(page);
  await expect(cardMode(page, "edit")).toBeVisible();
  await expect(cardMode(page, "ai")).toHaveCount(0);

  const restoredField = await selectFeedbackForManualEdit(page);
  await expect(restoredField).toContainText(EDITED_AFTER);
  const geometry = await restoredField.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);

  await cardMode(page, "view").click();
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
  await expect.poll(async () => page.evaluate(() =>
    globalThis.__workspaceOfflineAuthoringProbe.remote().writes.length
  )).toBe(1);
  await page.evaluate(() => globalThis.__workspaceOfflineAuthoringProbe.syncPromise);

  const synchronized = await page.evaluate(async () => {
    const probe = globalThis.__workspaceOfflineAuthoringProbe;
    const queue = await probe.queue();
    const remote = probe.remote();
    return {
      queue,
      writeRequestId: remote.writes[0].requestId,
      revision: remote.revision,
      after: remote.course.modules[0].lessons[0].microsequences[0].cards[0]
        .feedback[0].data.text,
      ids: remote.course.modules[0].lessons[0].microsequences[0].cards
        .map((value) => value.id),
      positions: remote.course.modules[0].lessons[0].microsequences[0].cards
        .map((value) => value.position)
    };
  });
  expect(synchronized.queue).toBeNull();
  expect(synchronized.writeRequestId).toBe(beforeReload.requestId);
  expect(synchronized.revision).toBe(2);
  expect(synchronized.after).toBe(EDITED_AFTER);
  expect(synchronized.ids).toEqual(beforeReload.cardIds);
  expect(synchronized.positions).toEqual(beforeReload.positions);
  await expect(page.locator(".runtime-card-sheet")).toBeVisible();
  const synchronizedField = await selectFeedbackForManualEdit(page);
  await expect(synchronizedField).toContainText(EDITED_AFTER);
});
