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

async function mountStudy(page, { savedView = "course", projectValue = fixture } = {}) {
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
  }, { project: projectValue, savedView });
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

test("jornada por cliques mantém voltar e modos contextuais distintos", async ({ page }) => {
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
  await page.locator("[data-study-structure-field='title']").fill("");
  await page.locator("[data-action='save-study-structure']").click();
  await expect(page.getByRole("alert")).toContainText("Título e objetivo são obrigatórios");
  await expect(page.locator("[data-study-structure-field='title']")).toBeFocused();
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
  const lessonSelectionDock = page.locator(".study-assistance-selection-dock");
  await expect(lessonSelectionDock.getByRole("button", { name: "Conversar" })).toBeVisible();
  expect(await lessonSelectionDock.evaluate((dock) => ({
    dockOverflow: dock.scrollWidth - dock.clientWidth,
    actionOverflow: dock.querySelector("[data-action='start-assistance-chat']").scrollWidth -
      dock.querySelector("[data-action='start-assistance-chat']").clientWidth
  }))).toEqual({ dockOverflow: 0, actionOverflow: 0 });
  await page.locator("[data-action='start-assistance-chat']").click();
  await page.locator("[data-course-assistance]").getByRole("dialog")
    .getByRole("button", { name: "Fechar" }).click();
  await expect(modeButton(page, "Assistência por IA")).toBeFocused();
  await page.locator("[data-action='open-microsequence']").click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Regra central");
  await expect(modeButton(page, "Editar")).toBeVisible();
  await capture(page, "390-microssequencia");
  await modeButton(page, "Assistência por IA").click();
  await page.locator("[data-action='start-assistance-chat']").click();
  await page.locator("[data-course-assistance]").getByRole("dialog")
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
    const content = document.querySelector(".card-sheet-content");
    return {
      mainOverflowY: getComputedStyle(main).overflowY,
      cardOverflowY: getComputedStyle(card).overflowY,
      contentOverflowY: getComputedStyle(content).overflowY,
      mainScrollable: main.scrollHeight > main.clientHeight,
      cardScrollable: card.scrollHeight > card.clientHeight
    };
  });
  expect(overflow.mainOverflowY).toBe("hidden");
  expect(overflow.cardOverflowY).toBe("hidden");
  expect(overflow.contentOverflowY).toBe("auto");
  expect(overflow.cardScrollable).toBe(false);

  await modeButton(page, "Assistência por IA").click();
  await page.locator("[data-action='start-assistance-chat']").click();
  const assistanceDialog = page.locator("[data-course-assistance]").getByRole("dialog");
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
      modes: bounds("header .study-mode-actions"),
      viewport: innerWidth
    };
  });
  expect(editTopbar.back.visible).toBe(true);
  expect(editTopbar.back.left).toBeGreaterThanOrEqual(0);
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

});

test("topbar cotidiana oferece Voltar e Home", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountStudy(page, { savedView: "course" });
  await page.locator("[data-action='open-course']").click();
  await page.locator("[data-action='open-module']").click();

  await expect(page.locator("[data-action='go-back']")).toBeVisible();
  await expect(page.locator("[data-action='go-home']")).toBeVisible();

  await page.locator("[data-action='go-home']").click();
  await expect(page.locator("[data-action='open-course']")).toBeVisible();
});

test("topbar cotidiana não mantém ação permanente ao pai", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountStudy(page, { savedView: "course" });
  await page.locator("[data-action='open-course']").click();
  await page.locator("[data-action='open-module']").click();
  await expect(page.locator("[data-action='go-up']")).toHaveCount(0);
});

test("títulos de Curso não recebem sufixo textual de propriedade", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><body><main id="study-root"></main></body></html>');
  await page.evaluate(async (project) => {
    const { renderHomeScreen } = await import("/src/ui/renderHomeScreen.js");
    const base = project.courses[0];
    const courses = [
      { ...structuredClone(base), id: "owned-course", title: "Curso homônimo" },
      { ...structuredClone(base), id: "shared-course", title: "Curso homônimo" },
      { ...structuredClone(base), id: "copy-course", title: "Curso homônimo" }
    ];
    document.querySelector("#study-root").innerHTML = renderHomeScreen({
      project: { ...project, courses },
      progress: { version: 1, lessons: {} },
      selectedCourseId: courses[0].id,
      editorSupport: {
        coursePermissionsById: {
          [courses[0].id]: { ownership: "owned", canEdit: true },
          [courses[1].id]: { ownership: "shared", canEdit: false, canDerive: true },
          [courses[2].id]: {
            ownership: "owned", canEdit: true, isPersonalCopy: true,
            sourceCourseId: courses[1].id
          }
        }
      }
    });
  }, fixture);
  const labels = await page.locator("select[aria-label='Selecionar Curso'] option")
    .allTextContents();
  expect(labels).toHaveLength(3);
  labels.forEach((label) => {
    expect(label).not.toMatch(/· (?:Seu Curso|Compartilhado com você|Sua cópia)/u);
  });
  expect(labels).toEqual([
    "Curso homônimo · opção 1",
    "Curso homônimo · opção 2",
    "Curso homônimo · opção 3"
  ]);
  expect(await page.locator("select[aria-label='Selecionar Curso'] option")
    .evaluateAll((options) => options.map((option) => option.getAttribute("aria-label"))))
    .toEqual([
      "Curso homônimo, Curso próprio, opção 1",
      "Curso homônimo, Curso compartilhado, opção 2",
      "Curso homônimo, Cópia pessoal, opção 3"
    ]);
});

test("trocar Visualizar e Editar preserva topbar e rolagem", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountStudy(page, { savedView: "course" });
  await page.locator("[data-action='open-course']").click();
  await page.locator("[data-action='open-module']").click();
  await page.locator("[data-action='open-lesson']").click();
  await page.locator("[data-action='open-microsequence']").click();
  await page.locator("[data-action='open-study-unit']").first().click();

  const geometry = () => page.evaluate(() => {
    const rect = document.querySelector(".navigation-topbar").getBoundingClientRect();
    const scroller = document.querySelector(".screen-content");
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      scrollTop: scroller.scrollTop
    };
  });
  await page.locator(".screen-content").evaluate((node) => {
    node.scrollTop = Math.min(40, Math.max(0, node.scrollHeight - node.clientHeight));
  });
  const before = await geometry();
  await modeButton(page, "Editar").click();
  expect(await geometry()).toEqual(before);
  await modeButton(page, "Visualizar").click();
  expect(await geometry()).toEqual(before);
});

test("trocar Visualizar e Editar preserva foco no modo acionado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountStudy(page, { savedView: "course" });
  await page.locator("[data-action='open-course']").click();
  await page.locator("[data-action='open-module']").click();
  await page.locator("[data-action='open-lesson']").click();
  await page.locator("[data-action='open-microsequence']").click();
  await page.locator("[data-action='open-study-unit']").first().click();
  await modeButton(page, "Editar").click();
  await expect(modeButton(page, "Editar")).toBeFocused();
});

test("Unidade curta e longa usam a altura útil com um único scroller e dock estável", async ({ page }) => {
  const openUnit = async () => {
    await page.locator("[data-action='open-course']").click();
    await page.locator("[data-action='open-module']").click();
    await page.locator("[data-action='open-lesson']").click();
    await page.locator("[data-action='open-microsequence']").click();
    await page.locator("[data-action='open-study-unit']").first().click();
  };
  const geometry = () => page.evaluate(() => {
    const bounds = (selector) => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        overflowY: getComputedStyle(node).overflowY,
        scrollable: node.scrollHeight > node.clientHeight + 1
      };
    };
    return {
      viewport: innerHeight,
      documentFits: document.documentElement.scrollHeight <= innerHeight + 1,
      screen: bounds(".microsequence-workbench-screen"),
      main: bounds(".microsequence-generator-screen"),
      content: bounds(".card-sheet-content"),
      stage: bounds(".study-stage"),
      dock: bounds(".study-reader-footer"),
      verticalScrollers: [...document.querySelectorAll(".microsequence-workbench-screen *")]
        .filter((node) => {
          const overflow = getComputedStyle(node).overflowY;
          return ["auto", "scroll"].includes(overflow) &&
            node.scrollHeight > node.clientHeight + 1;
        })
        .map((node) => node.className)
    };
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await mountStudy(page);
  await openUnit();
  const short = await geometry();
  expect(short.documentFits).toBe(true);
  expect(short.main.overflowY).toBe("hidden");
  expect(short.stage.overflowY).toBe("hidden");
  expect(short.dock.bottom).toBeLessThanOrEqual(short.viewport + 1);

  const longProject = structuredClone(fixture);
  const longUnit = longProject.courses[0].modules[0].lessons[0]
    .microsequences[0].studyUnits[0];
  longUnit.title = "Título extenso da Unidade ".repeat(12).slice(0, 300);
  longUnit.content[0].data.text = `Conteúdo longo. ${"Linha de leitura contínua. ".repeat(180)}`;
  await mountStudy(page, { projectValue: longProject });
  await openUnit();
  const long = await geometry();
  expect(long.documentFits).toBe(true);
  expect(long.main.scrollable).toBe(false);
  expect(long.stage.scrollable).toBe(false);
  expect(long.content.overflowY).toBe("auto");
  expect(long.content.scrollable).toBe(true);
  expect(long.verticalScrollers).toEqual(["card-sheet-content"]);
  expect(Math.abs(long.dock.top - short.dock.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(long.dock.bottom - short.dock.bottom)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 640 });
  const compact = await geometry();
  expect(compact.documentFits).toBe(true);
  expect(compact.dock.bottom).toBeLessThanOrEqual(compact.viewport + 1);
});

test("Abrir ignora a Unidade salva, mostra os Módulos e volta ao controle de origem", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mountStudy(page, { savedView: "microsequence" });
  const open = page.locator("[data-action='open-course']");
  await expect(open).toContainText("Abrir");
  await open.click();
  await expect(page.locator("[data-study-destination-heading]")).toContainText("Fixture Minimal");
  await expect(page.locator("[data-action='open-module']")).toBeVisible();
  await expect(page.locator(".runtime-card-title")).toHaveCount(0);
  await page.locator("[data-action='go-back']").click();
  await expect(page.locator("[data-action='open-course']")).toBeFocused();
  await capture(page, "1280-home-retorno");
});

test("Home e toolbar preservam responsividade, tema e alvos de toque", async ({ page }) => {
  for (const [width, colorScheme] of [[360, "light"], [390, "dark"], [430, "light"], [1280, "dark"]]) {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width, height: 800 });
    await mountStudy(page, { savedView: "course" });
    await page.evaluate((mode) => {
      document.documentElement.dataset.colorMode = mode;
    }, colorScheme);
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
      const account = document.querySelector("[data-action='open-settings']").getBoundingClientRect();
      const buttons = [...document.querySelectorAll(".study-mode-button")]
        .map((button) => button.getBoundingClientRect());
      return {
        barFits: bar.left >= 0 && bar.right <= innerWidth,
        controlsFit: [back, account].every(({ left, right }) =>
          left >= 0 && right <= innerWidth),
        documentFits: document.documentElement.scrollWidth <= innerWidth,
        overlap: Math.max(0, heading.right - actions.left),
        buttonWidths: buttons.map(({ width: value }) => value),
        buttonHeights: buttons.map(({ height: value }) => value),
        targetsMeetMinimum: [back, account, ...buttons]
          .every(({ width: valueWidth, height: valueHeight }) =>
            valueWidth >= 24 && valueHeight >= 24)
      };
      });
      expect(topbar.barFits, label).toBe(true);
      expect(topbar.controlsFit, label).toBe(true);
      expect(topbar.documentFits, label).toBe(true);
      expect(topbar.overlap, label).toBe(0);
      expect(new Set(topbar.buttonWidths).size, label).toBe(1);
      expect(new Set(topbar.buttonHeights).size, label).toBe(1);
      expect(topbar.targetsMeetMinimum, label).toBe(true);
    };
    await assertTopbarFits("Lição");
    await page.locator("[data-action='open-microsequence']").click();
    await assertTopbarFits("Microssequência");
    await page.locator("[data-action='open-study-unit']").first().click();
    const runtimeDock = await page.evaluate(() => {
      const dock = document.querySelector(".study-next-wrap").getBoundingClientRect();
      const next = document.querySelector(".study-continue-btn").getBoundingClientRect();
      const nextStyle = getComputedStyle(document.querySelector(".study-continue-btn"));
      return {
        display: nextStyle.display,
        fitsDock: next.left >= dock.left && next.right <= dock.right + 1,
        fitsViewport: next.left >= 0 && next.right <= innerWidth,
        singleLine: next.height <= 48,
        documentFits: document.documentElement.scrollWidth <= innerWidth
      };
    });
    expect(runtimeDock.display, `Runtime ${width}px`).toBe("flex");
    expect(runtimeDock.fitsDock, `Runtime ${width}px`).toBe(true);
    expect(runtimeDock.fitsViewport, `Runtime ${width}px`).toBe(true);
    expect(runtimeDock.singleLine, `Runtime ${width}px`).toBe(true);
    expect(runtimeDock.documentFits, `Runtime ${width}px`).toBe(true);
  }
});
