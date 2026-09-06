import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const project = JSON.parse(readFileSync(new URL(
  "../fixtures/package/project-minimal.json", import.meta.url
), "utf8"));

async function openObservationSheet(page, { existing = false } = {}) {
  await page.route("**/main.js", route => route.fulfill({
    contentType: "text/javascript", body: ""
  }));
  // Exercise the current study controller without replacing the served artifact.
  await page.route("**/src/study/CourseStudyApplication.js", route => route.fulfill({
    path: fileURLToPath(new URL("../../src/study/CourseStudyApplication.js", import.meta.url)),
    contentType: "text/javascript"
  }));
  const html = '<!doctype html><html lang="pt-BR"><head>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    ["styles-tokens.css", "styles-shell-baseline.css", "styles.css", "course-authoring.css"]
      .map(name => `<link rel="stylesheet" href="/${name}">`).join("") +
    '</head><body><main id="study-root"></main></body></html>';
  await page.route(url => url.pathname === "/", route => route.fulfill({
    contentType: "text/html", body: html
  }));
  await page.goto("/");
  await page.evaluate(async ({ documentValue, existing }) => {
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const course = documentValue.courses[0];
    const items = existing ? [{
      annotationId: "focus-observation", state: "open", rawText: "Observação já registrada.",
      category: "question", capabilities: {}, timestamps: {}
    }] : [];
    globalThis.observationFocusProbe = {};
    createCourseStudyApplication({
      root: document.querySelector("#study-root"), initialProject: documentValue,
      repository: {
        loadProject: () => structuredClone(documentValue),
        loadProgress: () => ({ version: 1, lessons: {} }),
        loadReviewItems: () => [],
        loadCourseSummaries: () => [{
          courseId: course.id, canEdit: true, moduleCount: 1, lessonCount: 1,
          studyUnitCount: 2, completedStudyUnitCount: 0
        }],
        loadAnnotationsForPath: () => structuredClone(items),
        refreshAnnotationsForPath: () => new Promise((resolve, reject) => {
          globalThis.observationFocusProbe.finish = () => resolve(structuredClone(items));
          globalThis.observationFocusProbe.fail = () => reject(Object.assign(
            new Error("Não foi possível atualizar as observações."), { status: 503 }
          ));
        }),
        subscribeToAnnotations: () => () => {},
        isStudyUnitMarkedForReview: () => false
      }
    });
  }, { documentValue: project, existing });
  await page.getByRole("button", { name: "Abrir Fixture Minimal" }).click();
  for (const name of ["Abrir módulo", "Abrir lição", "Abrir microssequência didática"]) {
    await page.getByRole("button", { name }).click();
  }
  await page.getByRole("button", { name: "Abrir unidade de estudo" }).first().click();
  await page.getByRole("button", { name: /^Observações/u }).click();
  await expect(page.getByText("Atualizando observações…", { exact: true })).toBeVisible();
}

test("Observações vazias recebem escrita imediatamente e conservam foco após atualizar", async ({ page }) => {
  await openObservationSheet(page);
  const field = page.getByRole("textbox", { name: "Observação", exact: true });
  await expect(field).toBeFocused();
  await page.keyboard.type("Rascunho durante a leitura.");
  await expect(field).toHaveValue("Rascunho durante a leitura.");
  await page.keyboard.press("Home");
  await page.evaluate(() => globalThis.observationFocusProbe.finish());
  await expect(page.getByText("Atualizando observações…", { exact: true })).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Rascunho durante a leitura.");
  await page.keyboard.type("Novo ");
  await expect(field).toHaveValue("Novo Rascunho durante a leitura.");
  await expect(page.locator(".app-shell > .screen")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Observações/u })).toBeFocused();
});

test("Observações existentes preservam consulta e foco escolhido enquanto a leitura falha", async ({ page }) => {
  await openObservationSheet(page, { existing: true });
  const close = page.getByRole("button", { name: "Fechar", exact: true });
  await expect(close).toBeFocused();
  const field = page.getByRole("textbox", { name: "Observação", exact: true });
  await field.click();
  await page.keyboard.type("Texto preservado diante da falha.");
  await page.evaluate(() => globalThis.observationFocusProbe.fail());
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Texto preservado diante da falha.");
  await expect(page.getByText("Observação já registrada.", { exact: true })).toBeVisible();
  await close.click();
  await expect(page.getByRole("button", { name: /^Observações/u })).toBeFocused();
});
