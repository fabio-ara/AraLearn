import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const styles = [
  "/styles-tokens.css",
  "/styles-shell-baseline.css",
  "/styles.css",
  "/course-authoring.css"
];

async function mountStudy(page, { savedView = "course" } = {}) {
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head><meta name="viewport" ' +
    'content="width=device-width,initial-scale=1">' +
    styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("") +
    '</head><body><div id="study-root"></div></body></html>');
  await page.evaluate(async ({ project, savedView }) => {
    const { createCourseStudyApplication } = await import(
      "/src/study/CourseStudyApplication.js"
    );
    const course = project.courses[0];
    const moduleValue = course.modules[0];
    const lesson = moduleValue.lessons[0];
    const microsequence = lesson.microsequences[0];
    const studyUnit = microsequence.studyUnits[0];
    let canonicalProject = structuredClone(project);
    let revision = 7;
    let navigation = {
      selectedCourseId: course.id,
      positions: {
        [course.id]: savedView === "microsequence"
          ? {
              view: "microsequence",
              entityPath: [
                course.id,
                moduleValue.id,
                lesson.id,
                microsequence.id,
                studyUnit.id
              ],
              microsequenceMode: "play"
            }
          : {
              view: "course",
              entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id, studyUnit.id],
              microsequenceMode: "play"
            }
      }
    };
    const progress = { version: 1, lessons: {} };
    const repository = {
      loadProgress: () => structuredClone(progress),
      loadCourseSummaries: () => [{
        courseId: course.id,
        revision,
        ownership: "owned",
        canEdit: true,
        canDerive: false,
        moduleCount: course.modules.length,
        lessonCount: moduleValue.lessons.length,
        studyUnitCount: microsequence.studyUnits.length,
        completedStudyUnitCount: 0,
        availableOffline: true
      }],
      loadAnnotationsForPath: () => [],
      loadRuntimeStatus: () => ({}),
      loadReviewItems: () => [],
      hasMoreReviewItems: () => false,
      loadStudyNavigation: () => structuredClone(navigation),
      saveStudyNavigation: async (value) => {
        navigation = {
          ...navigation,
          selectedCourseId: value.selectedCourseId,
          positions: value.position
            ? { ...navigation.positions, [value.selectedCourseId]: value.position }
            : navigation.positions
        };
      },
      loadCourse: async () => structuredClone(canonicalProject),
      loadProject: () => structuredClone(canonicalProject),
      refreshCourseOfflineAvailability: async () => true,
      loadStudyUnitCompositionContext: () => ({
        courseRevision: revision,
        studyUnitVersion: 3,
        didacticMicrosequenceId: microsequence.id
      }),
      isStudyUnitMarkedForReview: () => false,
      setStudyUnitCompleted: async () => true,
      loadCourseSummariesFromCache: () => []
    };
    const saveStructure = async ({ proposedProject }) => {
      canonicalProject = structuredClone(proposedProject);
      revision += 1;
      return { courseId: course.id, courseRevision: revision, project: canonicalProject };
    };
    const saveUnit = async ({ studyUnit: changed }) => ({
      courseId: course.id,
      courseRevision: ++revision,
      studyUnitId: changed.id,
      studyUnitVersion: 4,
      studyUnit: structuredClone(changed),
      reconciled: true,
      project: canonicalProject
    });
    globalThis.__studyApp = createCourseStudyApplication({
      root: document.querySelector("#study-root"),
      repository,
      initialProject: canonicalProject,
      onSaveManualEdit: saveUnit,
      onSaveAssistedStructure: saveStructure
    });
  }, { project: fixture, savedView });
}

async function capture(page, name) {
  if (process.env.ARALEARN_CAPTURE_152 !== "1") return;
  const directory = path.resolve("..", "AraLearn_private", "evidence", "152");
  fs.mkdirSync(directory, { recursive: true });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll(".screen-content").forEach((node) => {
      node.scrollTop = 0;
      node.scrollLeft = 0;
    });
  });
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: true });
}

function modeButton(page, name) {
  return page.locator("header .study-mode-actions").getByRole("button", { name });
}

test("jornada por cliques mantém voltar, subir e modos contextuais distintos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountStudy(page, { savedView: "course" });
  const homeGeometry = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    };
    return {
      topbar: box(".home-topbar"),
      productSwitch: box(".home-product-switch"),
      selector: box(".home-course-selector-card")
    };
  });
  expect(Math.abs(homeGeometry.topbar.left - homeGeometry.productSwitch.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeGeometry.topbar.right - homeGeometry.productSwitch.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeGeometry.selector.left - homeGeometry.productSwitch.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeGeometry.selector.right - homeGeometry.productSwitch.right)).toBeLessThanOrEqual(1);
  await capture(page, "390-home");

  await page.locator("[data-action='open-course']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Fixture Minimal");
  await expect(modeButton(page, "Visualizar")).toHaveAttribute("aria-pressed", "true");
  await expect(modeButton(page, "Editar")).toBeVisible();
  await capture(page, "390-curso");
  await modeButton(page, "Editar").click();
  await page.locator("[data-study-structure-field='title']").fill("Fixture contextual");
  await page.locator("[data-study-structure-field='goal']").fill(
    "Validar metadados e composição pelo modo contextual."
  );
  await page.locator("[data-action='save-study-structure']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText(
    "Fixture contextual"
  );

  await page.locator("[data-action='open-module']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Módulo");
  await modeButton(page, "Editar").click();
  await expect(page.locator(".study-structure-editor")).toBeVisible();
  await page.locator("[data-study-structure-field='title']").fill("Módulo contextual");
  await page.locator("[data-action='save-study-structure']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Módulo contextual");

  await page.locator("[data-action='open-lesson']").click();
  await expect(modeButton(page, "Assistência por IA")).toBeVisible();
  await capture(page, "390-licao");
  await modeButton(page, "Assistência por IA").click();
  await page.getByRole("dialog", { name: /Lição:/ })
    .getByRole("button", { name: "Fechar" }).click();
  await expect(modeButton(page, "Assistência por IA")).toBeFocused();
  await page.locator("[data-action='open-microsequence']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Regra central");
  await expect(modeButton(page, "Editar")).toBeVisible();
  await capture(page, "390-microssequencia");
  await modeButton(page, "Assistência por IA").click();
  await page.getByRole("dialog", { name: /Microssequência:/ })
    .getByRole("button", { name: "Fechar" }).click();
  await expect(modeButton(page, "Assistência por IA")).toBeFocused();
  await page.locator("[data-action='open-study-unit']").first().click();
  await expect(modeButton(page, "Assistência por IA")).toBeVisible();
  const modeGeometry = await page.locator("header .study-mode-button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height, center: rect.top + rect.height / 2 };
    })
  );
  expect(new Set(modeGeometry.map(({ width }) => width)).size).toBe(1);
  expect(new Set(modeGeometry.map(({ height }) => height)).size).toBe(1);
  expect(Math.max(...modeGeometry.map(({ center }) => center)) -
    Math.min(...modeGeometry.map(({ center }) => center))).toBeLessThanOrEqual(1);
  await capture(page, "390-unidade-visualizar");

  const overflow = await page.evaluate(() => {
    const main = document.querySelector(".microsequence-workbench-screen > .screen-content");
    const card = document.querySelector(".study-stage");
    return {
      mainOverflowY: getComputedStyle(main).overflowY,
      cardOverflowY: getComputedStyle(card).overflowY,
      mainScrollable: main.scrollHeight > main.clientHeight,
      cardScrollable: card.scrollHeight > card.clientHeight
    };
  });
  expect(overflow.mainOverflowY).toBe("auto");
  expect(overflow.cardOverflowY).toBe("visible");
  expect(overflow.cardScrollable).toBe(false);

  await modeButton(page, "Assistência por IA").click();
  const assistanceDialog = page.getByRole("dialog", { name: /Unidade:/ });
  await expect(assistanceDialog).toBeVisible();
  await capture(page, "390-unidade-assistencia");
  await assistanceDialog.getByRole("button", { name: "Fechar" }).click();

  await modeButton(page, "Editar").click();
  await expect(page.locator("[data-study-manual-title]")).toBeVisible();
  const editTopbar = await page.evaluate(() => {
    const bounds = (selector) => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        visible: getComputedStyle(node).visibility !== "hidden" && rect.width > 0 && rect.height > 0
      };
    };
    return {
      back: bounds("[data-action='go-back']"),
      up: bounds("[data-action='go-up']"),
      modes: bounds("header .study-mode-actions"),
      viewport: innerWidth
    };
  });
  expect(editTopbar.back.visible).toBe(true);
  expect(editTopbar.up.visible).toBe(true);
  expect(editTopbar.back.left).toBeGreaterThanOrEqual(0);
  expect(editTopbar.up.left).toBeGreaterThanOrEqual(0);
  expect(editTopbar.modes.right).toBeLessThanOrEqual(editTopbar.viewport);
  await capture(page, "390-unidade-editar");
  await modeButton(page, "Visualizar").click();

  await page.locator("[data-action='go-back']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Regra central");
  await expect(page.locator("[data-action='open-study-unit']").first()).toBeFocused();
  await page.locator("[data-action='go-back']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Lição");
  await expect(page.locator("[data-action='open-microsequence']")).toBeFocused();
  await page.locator("[data-action='go-back']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Módulo contextual");
  await expect(page.locator("[data-action='open-lesson']")).toBeFocused();
  await page.locator("[data-action='go-back']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Fixture contextual");
  await expect(page.locator("[data-action='open-module']")).toBeFocused();
  await page.locator("[data-action='go-back']").click();
  await expect(page.locator("[data-action='open-course']")).toBeFocused();

  await page.locator("[data-action='open-course']").click();
  await page.locator("[data-action='open-module']").click();
  await page.locator("[data-action='open-lesson']").click();
  await page.locator("[data-action='open-microsequence']").click();
  await page.locator("[data-action='open-study-unit']").first().click();
  await page.locator("[data-action='go-up']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Regra central");
  await page.locator("[data-action='go-up']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Lição");
  await page.locator("[data-action='go-up']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Módulo contextual");
  await page.locator("[data-action='go-up']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Fixture contextual");
  await expect(page.locator("[data-action='go-up']")).toHaveAttribute("aria-label", "Subir para a Home");
  await page.locator("[data-action='go-up']").click();
  await expect(page.locator("[data-action='open-course']")).toBeVisible();
});

test("Retomar uma Unidade volta para a mesma Home e para o controle de origem", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mountStudy(page, { savedView: "microsequence" });
  const resume = page.locator("[data-action='open-course']");
  await expect(resume).toContainText("Retomar");
  await resume.click();
  await expect(page.locator(".runtime-card-title")).toBeVisible();
  await page.locator("[data-action='go-back']").click();
  await expect(page.locator("[data-action='open-course']")).toBeFocused();
  await capture(page, "1280-home-retorno");
});

test("Home e toolbar permanecem dentro das arestas em 360 e 430 px", async ({ page }) => {
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await mountStudy(page, { savedView: "course" });
    const home = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      const top = rect(".home-topbar");
      const product = rect(".home-product-switch");
      const card = rect(".home-course-selector-card");
      return {
        edges: [top.left, top.right, product.left, product.right, card.left, card.right],
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth
      };
    });
    expect(new Set(home.edges.map((value) => Math.round(value))).size).toBe(2);
    expect(home.scrollWidth).toBeLessThanOrEqual(home.viewport);

    await page.locator("[data-action='open-course']").click();
    await page.locator("[data-action='open-module']").click();
    await page.locator("[data-action='open-lesson']").click();
    const assertTopbarFits = async (label) => {
      const topbar = await page.evaluate(() => {
      const bar = document.querySelector(".navigation-topbar").getBoundingClientRect();
      const heading = document.querySelector(".topbar-heading").getBoundingClientRect();
      const actions = document.querySelector(".lesson-top-actions").getBoundingClientRect();
      const back = document.querySelector("[data-action='go-back']").getBoundingClientRect();
      const up = document.querySelector("[data-action='go-up']").getBoundingClientRect();
      const account = document.querySelector("[data-action='open-settings']").getBoundingClientRect();
      const buttons = [...document.querySelectorAll(".study-mode-button")]
        .map((button) => button.getBoundingClientRect());
      return {
        barFits: bar.left >= 0 && bar.right <= innerWidth,
        controlsFit: [back, up, account].every(({ left, right }) =>
          left >= 0 && right <= innerWidth),
        documentFits: document.documentElement.scrollWidth <= innerWidth,
        overlap: Math.max(0, heading.right - actions.left),
        buttonWidths: buttons.map(({ width: value }) => value),
        buttonHeights: buttons.map(({ height: value }) => value)
      };
      });
      expect(topbar.barFits, label).toBe(true);
      expect(topbar.controlsFit, label).toBe(true);
      expect(topbar.documentFits, label).toBe(true);
      expect(topbar.overlap, label).toBe(0);
      expect(new Set(topbar.buttonWidths).size, label).toBe(1);
      expect(new Set(topbar.buttonHeights).size, label).toBe(1);
    };
    await assertTopbarFits("Lição");
    await page.locator("[data-action='open-microsequence']").click();
    await assertTopbarFits("Microssequência");
  }
});
