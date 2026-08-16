import { expect, test } from "@playwright/test";
import fs from "node:fs";

const PROJECT = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));

test("conteúdo transitório da Autoria retorna ao Estudo sem contaminar o projeto ou o DOM", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async ({ project, workspaceId }) => {
    const { createLessonEditorApp } = await import("/src/ui/lessonEditorApp.js");
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const previewCourse = structuredClone(project.courses[0]);
    previewCourse.title = "Prévia transitória da Autoria";
    previewCourse.modules[0].lessons[0].microsequences[0].cards[0].title = "Card transitório da Autoria";
    const storage = {
      loadProject: () => structuredClone(project),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress() {},
      loadReviewItems: () => [],
      loadCourseSummaries: () => [],
      loadCommentForPath: () => null,
      async loadCardAssistanceLocalState() { return {}; },
      coursePermissions: () => ({
        role: "owner",
        canAuthorContent: true,
        canComment: true,
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
      loadCommentForPath: () => null,
      async clearLocal() {},
      async flush() {}
    };
    const app = createLessonEditorApp({
      root,
      storage,
      editor: {},
      initialProject: structuredClone(project),
      homeTrails: {
        async loadTrailSnapshot() {
          return {
            space: "trails",
            groups: [],
            items: [],
            hasMore: false,
            nextCursor: null,
            capabilities: { organize: false, catalogManage: false, catalogReview: false }
          };
        }
      },
      trailPersonalStateFactory: () => personalStorage,
      async authoringWorkspaceReader() {
        return { workspaceId, course: structuredClone(previewCourse), transient: true };
      }
    });
    const course = project.courses[0];
    const cardPath = [
      course.id,
      course.modules[0].id,
      course.modules[0].lessons[0].id,
      course.modules[0].lessons[0].microsequences[0].id,
      course.modules[0].lessons[0].microsequences[0].cards[0].id
    ];
    window.authoringReaderProbe = { app, cardPath };
    window.authoringReaderProbe.opened = await app.openWorkspaceEntityPath(workspaceId, cardPath);
  }, {
    project: PROJECT,
    workspaceId: "30000000-0000-4000-8000-000000000105"
  });

  expect(await page.evaluate(() => window.authoringReaderProbe.opened)).toBe(true);
  await expect(page.locator(".runtime-card-title")).toHaveText("Card transitório da Autoria");
  await expect(page.locator('[data-action="edit-course"], [data-action="edit-lesson"]')).toHaveCount(0);

  const restored = await page.evaluate(() => {
    const { app, cardPath } = window.authoringReaderProbe;
    const closed = app.closeAuthoringPreview();
    const previewStillInDom = document.body.textContent.includes("Prévia transitória da Autoria") ||
      document.body.textContent.includes("Card transitório da Autoria");
    const reopened = app.openEntityPath(cardPath);
    return { closed, previewStillInDom, reopened };
  });
  expect(restored).toEqual({ closed: true, previewStillInDom: false, reopened: true });
  await expect(page.locator(".runtime-card-title")).toHaveText("Regra central");
  await expect(page.getByText("Card transitório da Autoria")).toHaveCount(0);
});
