import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const project = JSON.parse(readFileSync(new URL(
  "../fixtures/package/project-minimal.json", import.meta.url
), "utf8"));

async function openObservationSheet(page, { existing = false, controlledSave = false } = {}) {
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
  await page.evaluate(async ({ documentValue, existing, controlledSave }) => {
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const course = documentValue.courses[0];
    const items = existing ? [{
      annotationId: "focus-observation", state: "open", rawText: "Observação já registrada.",
      category: "question", capabilities: {}, timestamps: {}
    }] : [];
    globalThis.observationFocusProbe = { saves: [] };
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
        createAnnotationForPath: (reference, draft) => {
          const probe = globalThis.observationFocusProbe;
          probe.saves.push(structuredClone({ reference, draft }));
          if (!controlledSave) throw new Error("Envio não previsto neste cenário.");
          return new Promise((resolve, reject) => {
            probe.rejectSave = () => reject(Object.assign(new Error("Falha sintética de envio."), { status: 503 }));
            probe.completeSave = () => {
              items.push({ annotationId: "retry-observation", state: "open", rawText: draft.rawText,
                category: draft.category, capabilities: {}, timestamps: {} });
              resolve();
            };
          });
        },
        subscribeToAnnotations: () => () => {},
        isStudyUnitMarkedForReview: () => false
      }
    });
  }, { documentValue: project, existing, controlledSave });
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

for (const theme of ["light", "dark"]) {
  test(`Envio após erro mantém contraste em hover e permite repetir no tema ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await openObservationSheet(page, { controlledSave: true });
    await page.evaluate(theme => { document.documentElement.dataset.colorMode = theme; }, theme);
    await page.evaluate(() => globalThis.observationFocusProbe.finish());
    await expect(page.getByText("Atualizando observações…", { exact: true })).toHaveCount(0);
    const field = page.getByRole("textbox", { name: "Observação", exact: true });
    const submit = page.getByRole("button", { name: "Enviar observação", exact: true });
    const text = "Rascunho sintético preservado para repetir após erro.";
    await field.fill(text);
    await submit.click();
    await expect(page.getByRole("button", { name: "Salvando observação", exact: true })).toBeDisabled();
    await page.evaluate(() => globalThis.observationFocusProbe.rejectSave());
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(field).toHaveValue(text);
    await expect(submit).toBeEnabled();
    await field.click();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    const measure = async () => {
      await submit.evaluate(async element => {
        getComputedStyle(element).backgroundColor;
        await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
      });
      return submit.evaluate(element => {
        const style = getComputedStyle(element);
        const iconColor = getComputedStyle(element.querySelector("svg")).color;
        const luminance = value => {
          const channels = value.match(/[\d.]+/gu).slice(0, 3).map(Number)
            .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const foreground = luminance(iconColor), background = luminance(style.backgroundColor);
        const rect = element.getBoundingClientRect();
        return { foreground: iconColor, background: style.backgroundColor, enabled: !element.disabled,
          opacity: Number(style.opacity), hover: element.matches(":hover"), focus: document.activeElement === element,
          contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
          hit: element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
          documentFits: document.documentElement.scrollWidth <= innerWidth + 1 };
      });
    };
    await page.mouse.move(0, 0);
    const rest = await measure();
    await submit.hover();
    const hover = await measure();
    const screenshotPath = info.outputPath("enabled-submit-after-error.png");
    const metricsPath = info.outputPath("enabled-submit-colors.json");
    await page.screenshot({ path: screenshotPath });
    writeFileSync(metricsPath, JSON.stringify({ theme, rest, hover }, null, 2) + "\n");
    await info.attach("enabled-submit-colors", { path: metricsPath, contentType: "application/json" });
    await info.attach("enabled-submit-after-error", { path: screenshotPath, contentType: "image/png" });
    expect(hover).toMatchObject({ enabled: true, opacity: 1, hover: true, focus: true, hit: true, documentFits: true });
    expect(rest).toMatchObject({ enabled: true, hover: false, focus: true });
    expect.soft(rest.contrast).toBeGreaterThanOrEqual(4.5);
    expect.soft(hover.contrast).toBeGreaterThanOrEqual(4.5);
    await submit.click();
    await expect(page.getByRole("button", { name: "Salvando observação", exact: true })).toBeDisabled();
    await page.evaluate(() => globalThis.observationFocusProbe.completeSave());
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    await expect(field).toHaveValue("");
    await expect(submit).toBeEnabled();
    const saves = await page.evaluate(() => globalThis.observationFocusProbe.saves);
    expect(saves).toHaveLength(2);
    expect(saves[1]).toEqual(saves[0]);
  });
}
