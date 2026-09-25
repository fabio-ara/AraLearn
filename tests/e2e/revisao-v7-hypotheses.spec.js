import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

// Local UI proof: existing project/analytics fixtures, real renderer/editor,
// explicit localStorage adapter. No account, remote course or shared fixture writes.
const artifacts = path.resolve(".tmp/agent/revisao-v7/hypotheses");
const projectFixture = JSON.parse(await fs.readFile(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
const warning = "Complete todas as lacunas.";
const gapSelector = '[data-action="complete-input"], [data-action="text-gap-open-choice"]';

test.beforeEach(async ({ page }) => {
  await fs.mkdir(artifacts, { recursive: true });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.route("**/src/**", async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const target = path.resolve(relative);
    if (!target.startsWith(path.resolve("src") + path.sep)) return route.abort();
    await route.fulfill({ contentType: relative.endsWith(".json") ? "application/json" : "application/javascript", body: await fs.readFile(target) });
  });
  await page.route("**/*.css", async route => {
    const target = path.resolve("public", path.basename(new URL(route.request().url()).pathname));
    try { await route.fulfill({ contentType: "text/css", body: await fs.readFile(target) }); }
    catch (error) { if (error.code === "ENOENT") await route.continue(); else throw error; }
  });
  await page.route("**/tests/helpers/courseAuthoringAnalyticsFixture.js", route => route.fulfill({
    contentType: "application/javascript", path: path.resolve("tests/helpers/courseAuthoringAnalyticsFixture.js")
  }));
});

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(artifacts, `${name}.png`) });
}

async function mountStudy(page, mode, reload = false) {
  if (reload) await page.reload(); else await page.goto("/");
  await page.evaluate(async ({ fixture, mode }) => {
    document.documentElement.dataset.colorMode = "light";
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const storageKey = `revisao-v7-hypotheses-${mode}`;
    const stored = localStorage.getItem(storageKey);
    const canonical = stored ? JSON.parse(stored) : { project: fixture, revision: 7, version: 3 };
    const course = canonical.project.courses[0];
    course.id = "10000000-0000-4000-8000-000000000001";
    const module = course.modules[0], lesson = module.lessons[0], ms = lesson.microsequences[0];
    const unit = ms.studyUnits[1];
    if (!stored && mode === "text") {
      unit.response.data.blanks[0].responseMode = "text";
      delete unit.response.data.blanks[0].distractors;
    }
    const probe = { requests: [], completions: [], snapshot: () => structuredClone(canonical) };
    const repository = {
      loadProject: () => structuredClone(canonical.project), loadCourse: async () => structuredClone(course),
      loadProgress: () => ({ version: 1, lessons: {} }), loadReviewItems: () => [],
      loadAnnotationsForPath: () => [], loadRuntimeStatus: () => ({}), isStudyUnitMarkedForReview: () => false,
      loadCourseSummaries: () => [{ courseId: course.id, title: course.title, revision: canonical.revision,
        ownership: "owned", canEdit: true, moduleCount: 1, lessonCount: 1, studyUnitCount: 2 }],
      loadStudyUnitCompositionContext: () => ({ courseId: course.id, courseRevision: canonical.revision,
        didacticMicrosequenceId: ms.id, studyUnitId: unit.id, studyUnitVersion: canonical.version }),
      setStudyUnitCompleted: async reference => { probe.completions.push(structuredClone(reference)); return true; },
      flush: async () => true
    };
    const app = createCourseStudyApplication({ root: document.querySelector("#aralearn-editor-root"),
      initialProject: structuredClone(canonical.project), repository,
      onSaveManualEdit: async request => {
        if (request.expectedVersion !== canonical.version || request.expectedCourseRevision !== canonical.revision) throw new Error("Fixture obsoleta.");
        probe.requests.push(structuredClone(request));
        ms.studyUnits[1] = structuredClone(request.studyUnit);
        canonical.version += 1; canonical.revision += 1;
        localStorage.setItem(storageKey, JSON.stringify(canonical));
        return { courseId: course.id, courseRevision: canonical.revision, studyUnitId: unit.id,
          studyUnitVersion: canonical.version, studyUnit: structuredClone(request.studyUnit),
          reconciled: true, changed: true, origin: request.origin };
      }
    });
    globalThis.__hypotheses = { app, probe, storageKey };
    await app.openCourse(course.id);
    await document.fonts.ready;
  }, { fixture: structuredClone(projectFixture), mode });
  await page.getByRole("button", { name: "Abrir módulo", exact: true }).click();
  await page.getByRole("button", { name: "Abrir lição", exact: true }).click();
  await page.getByRole("button", { name: "Abrir microssequência didática", exact: true }).click();
  await page.getByRole("button", { name: "Abrir unidade de estudo", exact: true }).last().click();
  await expect(page.locator(gapSelector)).toBeVisible();
}

async function gapGeometry(page) {
  return page.locator(gapSelector).evaluate(node => {
    const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
    const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      border: css.border, background: css.backgroundColor, shadow: css.boxShadow,
      outline: css.outline, display: css.display, minWidth: css.minWidth,
      role: node.getAttribute("role"), label: node.getAttribute("aria-label"),
      focused: document.activeElement === node, empty: node.dataset.empty,
      hitTarget: center === node || node.contains(center) };
  });
}

for (const width of [390, 1280]) for (const mode of ["choice", "text"]) {
  test(`H003/H004: lacuna ${mode}, salvar e recarregar em ${width}`, async ({ page }) => {
    test.setTimeout(60000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await mountStudy(page, mode);
    const before = await page.evaluate(() => globalThis.__hypotheses.probe.snapshot());
    const savedUnit = value => value.project.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[1];
    const initial = savedUnit(before);
    const gap = page.locator(gapSelector);
    await expect(gap).toHaveAccessibleName(mode === "choice" ? "Escolher resposta" : "Preencher resposta");
    await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
    const neutral = await gapGeometry(page);
    expect(neutral.empty).toBe("true");
    expect(neutral.width).toBeGreaterThan(0); expect(neutral.height).toBeGreaterThan(0);
    expect(neutral.hitTarget).toBe(true);
    await screenshot(page, `h004-${mode}-${width}-empty`);
    // Reach the gap by real sequential keyboard navigation, without locator.focus().
    for (let step = 0; step < 30 && !await gap.evaluate(node => document.activeElement === node); step++) await page.keyboard.press("Tab");
    await expect(gap).toBeFocused();
    const focused = await gapGeometry(page);
    expect(focused.shadow).not.toBe(neutral.shadow);
    await screenshot(page, `h004-${mode}-${width}-focus`);
    if (mode === "choice") {
      await gap.press("Enter");
      await expect(page.locator('[data-action="text-gap-set-choice"]').first()).toBeFocused();
      await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(3);
    }
    await page.locator('[data-action="next-study-unit"]').click();
    await expect(page.getByRole("alert")).toContainText(warning);
    await expect(page.locator(mode === "text" ? '[data-action="complete-input"]' : '[data-action="text-gap-set-choice"]').first()).toBeFocused();
    expect(await page.evaluate(() => globalThis.__hypotheses.probe.completions)).toEqual([]);
    await screenshot(page, `h003-${mode}-${width}-warning`);
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.locator('[data-study-manual-title]').fill("Complete — título revisado");
    await page.getByRole("button", { name: "Salvar edição", exact: true }).click();
    await expect(page.getByText("Edição salva.", { exact: true })).toBeAttached();
    await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
    const saved = await page.evaluate(() => globalThis.__hypotheses.probe.snapshot());
    expect(savedUnit(saved)).toEqual({ ...initial, title: "Complete — título revisado" });
    expect(await page.evaluate(() => globalThis.__hypotheses.probe.requests.length)).toBe(1);
    // Saving resets the attempt; validation must still block an empty answer.
    await page.locator('[data-action="next-study-unit"]').click();
    await expect(page.getByRole("alert")).toContainText(warning);
    await mountStudy(page, mode, true);
    await expect(page.locator('.runtime-card-title')).toHaveText("Complete — título revisado");
    await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.__hypotheses.probe.snapshot())).toEqual(saved);
    await screenshot(page, `h003-${mode}-${width}-reloaded`);
    await page.locator('[data-action="next-study-unit"]').click();
    await expect(page.getByRole("alert")).toContainText(warning);
    const answer = initial.response.data.blanks[0].answer;
    if (mode === "choice") await page.locator('[data-action="text-gap-set-choice"]').filter({ hasText: answer }).click();
    else await page.locator('[data-action="complete-input"]').fill(answer);
    await page.locator('[data-action="next-study-unit"]').click();
    await expect(page.getByText(warning, { exact: true })).toHaveCount(0);
    await expect(page.getByText(initial.feedback[0].data.text, { exact: true })).toBeVisible();
    await screenshot(page, `h003-${mode}-${width}-authored-feedback`);
    expect(errors).toEqual([]);
    await fs.writeFile(path.join(artifacts, `gap-${mode}-${width}.json`), JSON.stringify({ width, mode, neutral, focused,
      savedTitle: savedUnit(saved).title, authoredFeedbackPreserved: true, warningRegeneratedAfterSaveAndReload: true, errors }, null, 2));
  });
}

for (const width of [390, 1280]) test(`H008: rótulos e contagens em Dados e definições em ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/");
  await page.evaluate(async () => {
    document.documentElement.dataset.colorMode = "light";
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"><main class="course-authoring-root"><div id="analytics-probe"></div></main></div></div>';
    const { createCourseAnalyticsPanel } = await import("/src/ui/CourseAnalyticsPanel.js");
    const { courseAuthoringAnalyticsFixture, ANALYTICS_COURSE_ID } = await import("/tests/helpers/courseAuthoringAnalyticsFixture.js");
    const reading = courseAuthoringAnalyticsFixture({ title: "Curso de referência", studyUnits: [{ title: "Relação inicial" }, { title: "Aplicação" }] });
    const panel = createCourseAnalyticsPanel({ root: document.querySelector("#analytics-probe"),
      course: { courseId: ANALYTICS_COURSE_ID, revision: 7 },
      controller: { loadCourseAuthoringAnalytics: async () => structuredClone(reading) } });
    await panel.open(); await document.fonts.ready;
  });
  const origin = page.getByRole("button", { name: "Abrir dados e definições", exact: true });
  await origin.click();
  const dialog = page.getByRole("dialog", { name: "Dados e definições", exact: true });
  await expect(dialog).toBeVisible();
  const measurements = [];
  for (const [index, title] of ["Configuração aplicada", "Distribuição de explicação e prática"].entries()) {
    const details = dialog.locator('details').filter({ has: page.getByRole("table", { name: title, exact: true, includeHidden: true }) });
    const summary = details.locator(':scope > summary');
    await summary.click();
    await expect(details.getByRole("table", { name: title, exact: true })).toBeVisible();
    const geometry = await summary.evaluate(node => {
      const rects = selector => { const range = document.createRange(); range.selectNodeContents(node.querySelector(selector));
        return [...range.getClientRects()].map(rect => ({ x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height })); };
      const label = rects("span"), count = rects("small");
      return { label, count, text: node.textContent, display: getComputedStyle(node).display,
        declaredGap: getComputedStyle(node).gap, countMargin: getComputedStyle(node.querySelector("small")).marginInlineStart,
        gap: count[0].x - label.at(-1).right,
        overlaps: label.some(a => count.some(b => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y)) };
    });
    expect(geometry.overlaps).toBe(false);
    const count = await summary.locator("small").innerText();
    expect(count).toMatch(/^\d+ linhas?$/u);
    await screenshot(page, `h008-${width}-${index + 1}-open`);
    await summary.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(summary).toBeFocused();
    measurements.push({ title, ...geometry });
  }
  const missing = dialog.getByLabel("Dados ausentes", { exact: true });
  await missing.scrollIntoViewIfNeeded();
  await expect(missing).toContainText("Há unidades sem configuração aplicada.");
  await screenshot(page, `h008-${width}-missing-data`);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(origin).toBeFocused();
  await fs.writeFile(path.join(artifacts, `analytics-${width}.json`), JSON.stringify(measurements, null, 2));
  for (const measurement of measurements) expect(measurement.gap, measurement.title).toBeGreaterThan(0);
});
