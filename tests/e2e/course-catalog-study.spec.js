import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const catalogCourse = JSON.parse(readFileSync(new URL(
  "../../supabase/fixtures/catalog/aralearn-catalogo-recursos-course.json",
  import.meta.url
), "utf8"));

const course = catalogCourse.courses[0];
const studyUnits = course.modules.flatMap((moduleValue) =>
  moduleValue.lessons.flatMap((lesson) =>
    lesson.microsequences.flatMap((microsequence) =>
      microsequence.studyUnits.map((studyUnit) => ({
        path: [course.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id],
        id: studyUnit.id,
        title: studyUnit.title,
        role: studyUnit.role,
        packages: [
          ...studyUnit.content.map((instance) => instance.package),
          ...(studyUnit.response ? [studyUnit.response.package] : [])
        ],
        response: studyUnit.response
      }))
    )
  )
);
const theoryUnits = studyUnits.filter(({ role }) => role === "theory");
const practiceUnits = studyUnits.filter(({ role }) => role === "practice");
const packageIds = [...new Set(studyUnits.flatMap(({ packages }) => packages))].sort();
const screenshotTheory = theoryUnits.find(({ packages }) =>
  packages.includes("aralearn.resource.software_container"));
const screenshotPractice = practiceUnits.find(({ packages }) =>
  packages.includes("aralearn.resource.software_container"));

const visualCases = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 800 }
].flatMap((viewport) => ["light", "dark"].map((theme) => ({ ...viewport, theme })));

function summary() {
  return {
    courseId: course.id,
    canEdit: false,
    moduleCount: course.modules.length,
    lessonCount: course.modules.reduce(
      (total, moduleValue) => total + moduleValue.lessons.length,
      0
    ),
    studyUnitCount: studyUnits.length,
    completedStudyUnitCount: 0
  };
}

async function installStudyRuntime(page) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async ({ project, courseSummary }) => {
    document.body.innerHTML = '<main id="study-root"></main>';
    const { createCourseStudyApplication } = await import(
      "/src/study/CourseStudyApplication.js"
    );
    const progress = { version: 1, lessons: {} };
    const completed = new Set();
    const probe = {
      completed,
      hydrationErrors: [],
      offline: false,
      review: new Set()
    };
    const root = document.querySelector("#study-root");
    root.addEventListener("aralearn:package-hydration-error", (event) => {
      probe.hydrationErrors.push(String(event.detail?.message || event.detail || "erro"));
    });
    const repository = {
      loadProject: () => structuredClone(project),
      loadProgress: () => structuredClone(progress),
      loadCourseSummaries: () => [{
        ...courseSummary,
        completedStudyUnitCount: completed.size
      }],
      loadAnnotationsForPath: () => [],
      loadReviewItems: () => [],
      isStudyUnitMarkedForReview: ({ studyUnitId }) => probe.review.has(studyUnitId),
      setStudyUnitReviewMark: async ({ studyUnitId }, marked) => {
        if (marked) probe.review.add(studyUnitId);
        else probe.review.delete(studyUnitId);
      },
      setStudyUnitCompleted: async (reference) => {
        completed.add(reference.studyUnitId);
        const key = [reference.courseId, reference.moduleId, reference.lessonId].join("::");
        const entry = progress.lessons[key] || {
          cursorStudyUnitId: null,
          completedStudyUnitIds: []
        };
        entry.cursorStudyUnitId = reference.studyUnitId;
        entry.completedStudyUnitIds = [...new Set([
          ...entry.completedStudyUnitIds,
          reference.studyUnitId
        ])];
        progress.lessons[key] = entry;
      },
      loadRuntimeStatus: () => ({
        offline: probe.offline,
        stale: probe.offline,
        readOnly: false
      }),
      flush: async () => undefined
    };
    globalThis.__catalogStudyProbe = probe;
    globalThis.__catalogStudyApp = createCourseStudyApplication({
      root,
      repository,
      initialProject: project
    });
  }, { project: catalogCourse, courseSummary: summary() });
}

async function openStudyUnit(page, unit) {
  expect(await page.evaluate(async (path) =>
    globalThis.__catalogStudyApp.openEntityPath(path), unit.path)).toBe(true);
  await expect(page.locator(".runtime-card-title")).toHaveText(unit.title);
  await page.waitForFunction(() => {
    const states = [...document.querySelectorAll(
      "[data-graphviz-status], [data-vega-status], [data-flow-layout-status]"
    )].map((node) => node.getAttribute("data-graphviz-status") ||
      node.getAttribute("data-vega-status") ||
      node.getAttribute("data-flow-layout-status"));
    return states.every((state) => state === "ready");
  });
  await expect(page.locator(".package-instance")).toHaveCount(unit.packages.length);
  expect(await page.locator(".package-instance").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-package")))).toEqual(unit.packages);
}

async function solveGapWithKeyboard(page, response) {
  for (const [index, blank] of response.data.blanks.entries()) {
    if (blank.responseMode === "choice") {
      const control = page.locator(
        `[data-action="text-gap-open-choice"][data-complete-blank-index="${index}"]`
      );
      await control.focus();
      await control.press("Enter");
      const options = page.locator('[data-action="text-gap-set-choice"]');
      const answerIndex = await options.evaluateAll((nodes, answer) =>
        nodes.findIndex((node) => node.getAttribute("data-text-gap-value") === answer),
      blank.answer);
      expect(answerIndex).toBeGreaterThanOrEqual(0);
      await options.nth(answerIndex).focus();
      await options.nth(answerIndex).press("Enter");
      continue;
    }
    const control = page.locator(
      `[data-action="complete-input"][data-complete-blank-index="${index}"]`
    );
    await control.focus();
    await page.keyboard.insertText(blank.answer);
  }
}

async function solveChoiceWithKeyboard(page, response) {
  for (const answerId of response.data.answerIds) {
    const option = page.locator(
      `[data-action="choice-toggle"][data-choice-option-id="${answerId}"]`
    );
    await option.focus();
    await option.press("Space");
    await expect(option).toHaveAttribute("aria-checked", "true");
  }
}

async function solveOrderingWithKeyboard(page, response) {
  const firstId = response.data.targets[0].id;
  for (let index = 1; index < response.data.targets.length; index += 1) {
    const moveLeft = page.locator(
      `[data-action="ordering-move"][data-ordering-item-id="${firstId}"]` +
      '[data-ordering-direction="left"]'
    );
    await moveLeft.focus();
    await moveLeft.press("Enter");
  }
  await expect(page.locator(".runtime-ordering-slot").first())
    .toHaveAttribute("data-ordering-item-id", firstId);
}

async function solveOpenResponseWithKeyboard(page) {
  const input = page.locator('[data-action="open-response-input"]');
  await input.focus();
  await page.keyboard.insertText(
    "Minha explicação relaciona a situação apresentada ao mecanismo estudado."
  );
  await expect(input).toHaveValue(/Minha explicação relaciona/iu);
}

async function auditVisibleStudyUnit(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const bounds = node.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height
      };
    };
    const dockTargets = [...document.querySelectorAll(
      ".study-action-dock button, .card-answer-dock button, " +
      ".card-answer-dock [contenteditable='true']"
    )].filter((node) => {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" &&
        bounds.width > 0 && bounds.height > 0;
    }).map((node) => {
      const bounds = node.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
    return {
      documentOverflowX: document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
      screen: rect(".screen"),
      card: rect(".runtime-card-sheet"),
      footer: rect(".study-reader-footer"),
      dockTargets,
      colorMode: document.documentElement.dataset.colorMode,
      packageCount: document.querySelectorAll(".package-instance").length
    };
  });
}

test("Curso de catálogo exercita os 33 packages no Estudo e permanece disponível sem conexão", async ({
  context,
  page
}) => {
  test.setTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await installStudyRuntime(page);

  const renderedPackages = new Set();
  for (const unit of theoryUnits) {
    await openStudyUnit(page, unit);
    unit.packages.forEach((packageId) => renderedPackages.add(packageId));
  }

  for (const unit of practiceUnits) {
    await openStudyUnit(page, unit);
    unit.packages.forEach((packageId) => renderedPackages.add(packageId));
    if (unit.response.package === "aralearn.response.gap") {
      await solveGapWithKeyboard(page, unit.response);
    } else if (unit.response.package === "aralearn.response.choice") {
      await solveChoiceWithKeyboard(page, unit.response);
    } else if (unit.response.package === "aralearn.response.ordering") {
      await solveOrderingWithKeyboard(page, unit.response);
    } else if (unit.response.package === "aralearn.response.open") {
      await solveOpenResponseWithKeyboard(page);
    } else {
      throw new Error(`Resposta sem exercício funcional: ${unit.response.package}`);
    }
    const completedBefore = await page.evaluate(() =>
      globalThis.__catalogStudyProbe.completed.size);
    const continueButton = page.locator('[data-action="next-study-unit"]');
    await continueButton.focus();
    await continueButton.press("Enter");
    if (unit.response.package === "aralearn.response.open") {
      await expect(page.getByRole("status")).toContainText("Resposta preenchida.");
      await expect(page.locator(".inline-feedback.ok, .inline-feedback.err")).toHaveCount(0);
    }
    const continueFeedback = page.locator('[data-action="continue-feedback"]');
    if (await continueFeedback.isVisible()) {
      await continueFeedback.focus();
      await continueFeedback.press("Enter");
    }
    await expect.poll(() => page.evaluate(() =>
      globalThis.__catalogStudyProbe.completed.size)).toBe(completedBefore + 1);
  }

  expect([...renderedPackages].sort()).toEqual(packageIds);
  expect(await page.evaluate(() => globalThis.__catalogStudyProbe.completed.size))
    .toBe(practiceUnits.length);

  await openStudyUnit(page, screenshotTheory);
  await context.setOffline(true);
  await page.evaluate(() => {
    globalThis.__catalogStudyProbe.offline = true;
    globalThis.__catalogStudyApp.setOfflineStatus(true);
  });
  await openStudyUnit(page, screenshotPractice);
  const offlineStatus = page.getByRole("button", { name: "Sem conexão" });
  await expect(offlineStatus).toBeVisible();
  await expect(offlineStatus).toHaveAttribute("data-runtime-state", "offline");
  await expect(offlineStatus).toHaveText("");
  await expect(page.locator(
    '[data-package="aralearn.resource.software_container"]'
  )).toBeVisible();
  const reviewButton = page.getByRole("button", { name: "Marcar para rever" });
  await reviewButton.focus();
  await reviewButton.press("Enter");
  await expect(reviewButton).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => globalThis.__catalogStudyProbe.review.size)).toBe(1);
  await context.setOffline(false);

  expect(await page.evaluate(() => globalThis.__catalogStudyProbe.hydrationErrors)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

for (const { width, height, theme } of visualCases) {
  test(`Curso de catálogo cabe em ${width} px no tema ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height });
    await installStudyRuntime(page);
    await page.evaluate((selectedTheme) => {
      globalThis.AraLearnTheme.setPreference(selectedTheme);
    }, theme);
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", theme);

    let maximumDocumentOverflow = 0;
    let minimumDockTarget = Number.POSITIVE_INFINITY;
    for (const unit of studyUnits) {
      await openStudyUnit(page, unit);
      const audit = await auditVisibleStudyUnit(page);
      expect(audit.colorMode).toBe(theme);
      expect(audit.packageCount).toBe(unit.packages.length);
      expect(audit.documentOverflowX).toBeLessThanOrEqual(1);
      expect(audit.bodyOverflowX).toBeLessThanOrEqual(1);
      expect(audit.screen.left).toBeGreaterThanOrEqual(-1);
      expect(audit.screen.right).toBeLessThanOrEqual(width + 1);
      expect(audit.card.left).toBeGreaterThanOrEqual(-1);
      expect(audit.card.right).toBeLessThanOrEqual(width + 1);
      expect(audit.footer.left).toBeGreaterThanOrEqual(-1);
      expect(audit.footer.right).toBeLessThanOrEqual(width + 1);
      maximumDocumentOverflow = Math.max(
        maximumDocumentOverflow,
        audit.documentOverflowX,
        audit.bodyOverflowX
      );
      for (const target of audit.dockTargets) {
        minimumDockTarget = Math.min(minimumDockTarget, target.width, target.height);
      }
    }

    await openStudyUnit(page, screenshotTheory);
    const theoryPath = testInfo.outputPath(
      `${width}-${theme}-teoria-conteineres-software.png`
    );
    await page.screenshot({ path: theoryPath });
    await testInfo.attach("teoria", { path: theoryPath, contentType: "image/png" });

    await openStudyUnit(page, screenshotPractice);
    const gap = page.locator('[data-action="text-gap-open-choice"]').first();
    await gap.focus();
    await gap.press("Enter");
    const practicePath = testInfo.outputPath(
      `${width}-${theme}-pratica-conteineres-software.png`
    );
    await page.screenshot({ path: practicePath });
    await testInfo.attach("prática", { path: practicePath, contentType: "image/png" });

    const measuresPath = testInfo.outputPath(`${width}-${theme}-medidas.json`);
    writeFileSync(measuresPath, JSON.stringify({
      width,
      height,
      theme,
      units: studyUnits.length,
      theoryUnits: theoryUnits.length,
      practiceUnits: practiceUnits.length,
      packages: packageIds.length,
      maximumDocumentOverflow,
      minimumDockTarget
    }, null, 2));
    await testInfo.attach("medidas", { path: measuresPath, contentType: "application/json" });
    expect(minimumDockTarget).toBeGreaterThanOrEqual(28);
    expect(await page.evaluate(() => globalThis.__catalogStudyProbe.hydrationErrors)).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
