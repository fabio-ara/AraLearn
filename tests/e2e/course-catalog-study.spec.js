import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

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
        tools: RESOURCE_PACKAGE_REGISTRY.listStudyTools(studyUnit),
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
const inlinePackages = (unit) => unit.packages.filter((id) => !unit.tools.some(({ instance }) => instance.package === id));
const screenshotTheory = theoryUnits.find(({ packages }) =>
  packages.includes("aralearn.resource.software_container"));
const screenshotPractice = practiceUnits.find(({ packages }) =>
  packages.includes("aralearn.resource.software_container"));

const visualCases = [
  { width: 320, height: 800 },
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
    const { createDefaultCourseAudioConfig } = await import("/src/domain/courseMedia.js");
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
      // Contraste sintético dos mesmos componentes nos dois hosts. Não é uma
      // Explicação produzida por GPT nem evidência de conteúdo hospedado.
      loadExplanationContext: reference => {
        const microsequence = project.courses.flatMap(item => item.modules)
          .flatMap(item => item.lessons).flatMap(item => item.microsequences)
          .find(item => item.id === reference.microsequenceId);
        const theory = microsequence.studyUnits.find(item => item.role === "theory");
        return {
          courseId: reference.courseId, courseRevision: 1,
          microsequenceId: microsequence.id, targetKind: "microsequence_explanation",
          targetId: microsequence.id,
          explanation: { title: microsequence.title, content: structuredClone(theory.content) },
          contentReview: { state: "current" }, state: "available", availableRevision: 1,
          retainedForReview: false, offline: probe.offline
        };
      },
      loadExplanationCitations: async reference => ({
        contract: "aralearn.course-study-citations.v2", bibliographyStyle: "abnt-2025",
        courseId: reference.courseId, courseRevision: 1,
        targetKind: "microsequence_explanation", targetId: reference.microsequenceId, citations: []
      }),
      loadExplanationCitationStatus: () => ({ courseRevision: 1, source: "fixture", offline: false }),
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
      flush: async () => undefined,
      loadStudyAudioConfiguration: async () => createDefaultCourseAudioConfig()
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
  await expect(page.locator(".package-instance")).toHaveCount(inlinePackages(unit).length);
  expect(await page.locator(".package-instance").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-package")))).toEqual(inlinePackages(unit));
  for (const { instance, label } of unit.tools) {
    let trigger = page.locator(`[data-study-tool-id="${instance.id}"]`);
    if (!await trigger.count()) {
      trigger = page.getByRole("button", { name: "Mais ferramentas", exact: true });
      await trigger.click();
      await page.locator(`[data-open-study-tool="${instance.id}"]`).click();
    } else await trigger.click();
    const dialog = page.getByRole("dialog", { name: label, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".runtime-block")).toHaveCount(1);
    await expect(dialog.getByRole("heading", {
      name: instance.data.title || instance.data.tracks[0].label, exact: true
    })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await dialog.getByRole("button", { name: "Fechar ferramenta", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
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
    const moveUp = page.locator(
      `[data-action="ordering-move"][data-ordering-item-id="${firstId}"]` +
      '[data-ordering-direction="up"]'
    );
    await moveUp.focus();
    await moveUp.press("Enter");
  }
  await expect(page.locator(".runtime-ordering-slot").first())
    .toHaveAttribute("data-ordering-item-id", firstId);
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

async function captureReadingSegments(page, testInfo, selector, name) {
  const body = page.locator(selector);
  const segments = [];
  await body.evaluate(node => { node.scrollTop = 0; });
  while (true) {
    const bounds = await body.evaluate(node => ({
      top: node.scrollTop, height: node.clientHeight, total: node.scrollHeight
    }));
    expect(bounds.height).toBeGreaterThan(0);
    const filename = `${name}-${segments.length + 1}.png`;
    const path = testInfo.outputPath(filename);
    await page.screenshot({ path });
    segments.push({ file: filename, scrollTop: bounds.top, viewportHeight: bounds.height,
      contentHeight: bounds.total });
    if (bounds.top + bounds.height >= bounds.total - 1) break;
    await body.evaluate(node => { node.scrollTop += Math.max(1, Math.floor(node.clientHeight * 0.8)); });
    expect(await body.evaluate(node => node.scrollTop)).toBeGreaterThan(bounds.top);
  }
  await body.evaluate(node => { node.scrollTop = 0; });
  return segments;
}

async function inspectExplanation(page, unit) {
  const trigger = page.getByRole("button", { name: "Explicação", exact: true });
  await trigger.click();
  const overlay = page.getByRole("dialog", { name: "Explicação", exact: true });
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole("button", { name: "Fechar explicação", exact: true })).toBeFocused();
  await expect.poll(() => overlay.locator(
    '[data-graphviz-status]:not([data-graphviz-status="ready"]), ' +
    '[data-vega-status]:not([data-vega-status="ready"]), ' +
    '[data-flow-layout-status]:not([data-flow-layout-status="ready"])'
  ).count()).toBe(0);
  const rendered = await overlay.locator(".study-explanation-body .package-instance")
    .evaluateAll(nodes => nodes.map(node => node.dataset.package));
  expect(rendered).toEqual(inlinePackages(unit));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await overlay.locator(".study-explanation-body").evaluate(node =>
    node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  return { trigger, overlay, rendered };
}

test("Curso de catálogo exercita todos os pacotes no Estudo e permanece disponível sem conexão", async ({
  context,
  page
}) => {
  test.setTimeout(120_000);
  expect(packageIds).toHaveLength(34);
  for (const removed of ["aralearn.response.open", "aralearn.resource.dictionary", "aralearn.resource.grammar", "aralearn.resource.reading"]) {
    expect(packageIds).not.toContain(removed);
  }
  expect(packageIds).toEqual(RESOURCE_PACKAGE_REGISTRY.listCatalog()
    .filter(({ authoringEligibility }) => authoringEligibility === "current")
    .map(({ id }) => id).sort());
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
    } else {
      throw new Error(`Resposta sem exercício funcional: ${unit.response.package}`);
    }
    const completedBefore = await page.evaluate(() =>
      globalThis.__catalogStudyProbe.completed.size);
    const continueButton = page.locator('[data-action="next-study-unit"]');
    await continueButton.focus();
    await continueButton.press("Enter");
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
    // Inclui agora dois hosts e segmentos sobrepostos de cada leitura.
    test.setTimeout(240_000);
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
    const evidence = [];
    for (const unit of studyUnits) {
      await openStudyUnit(page, unit);
      const audit = await auditVisibleStudyUnit(page);
      expect(audit.colorMode).toBe(theme);
      expect(audit.packageCount).toBe(inlinePackages(unit).length);
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
      if (theme === "light") {
        evidence.push({ unit: unit.id, packages: unit.packages, host: "unidade",
          segments: await captureReadingSegments(page, testInfo, ".card-sheet-content",
            `${width}-${unit.id}`) });
      }
      if (unit.role === "theory") {
        const explanation = await inspectExplanation(page, unit);
        if (theme === "light") {
          evidence.push({ unit: unit.id, packages: explanation.rendered, host: "explicacao",
            segments: await captureReadingSegments(page, testInfo, ".study-explanation-body",
              `${width}-${unit.id}-explicacao`) });
        }
        await explanation.overlay.getByRole("button", { name: "Fechar explicação", exact: true }).click();
        await expect(explanation.overlay).toHaveCount(0);
        await expect(explanation.trigger).toBeFocused();
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
      evidenceKind: "fixture sintética local; sem persistência hospedada ou julgamento humano",
      explanationHosts: theoryUnits.length,
      evidence,
      maximumDocumentOverflow,
      minimumDockTarget
    }, null, 2));
    await testInfo.attach("medidas", { path: measuresPath, contentType: "application/json" });
    expect(minimumDockTarget).toBeGreaterThanOrEqual(28);
    expect(await page.evaluate(() => globalThis.__catalogStudyProbe.hydrationErrors)).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
