import { expect, test } from "@playwright/test";
import { homeTrailSnapshotForProject } from "../support/homeTrailSnapshot.js";

function projectFixture() {
  const guide = (goal) => ({
    goal,
    include: ["Conjunção"],
    exclude: [],
    notation: ["P ∧ Q"],
    avoid: []
  });
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Lógica",
      goal: "Compreender operadores lógicos.",
      modules: [{
        id: "module-a",
        title: "Operadores",
        guide: guide("Compreender operadores."),
        lessons: [{
          id: "lesson-a",
          title: "Conjunção",
          guide: guide("Aplicar a conjunção."),
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Regra",
            goal: "Reconhecer o caso verdadeiro.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: ["Conjunção"],
            checks: ["Identificar V e V"],
            cards: [{
              id: "card-a",
              position: 1,
              resource: "composite",
              kind: "theory",
              exercise: "none",
              title: "Conjunção",
              blocks: [
                {
                  id: "paragraph-1",
                  kind: "paragraph",
                  value: "P e Q precisam ser verdadeiras."
                },
                {
                  id: "code-1",
                  kind: "code",
                  prompt: "Notação",
                  language: "text",
                  code: "P ∧ Q"
                },
                {
                  id: "paragraph-2",
                  kind: "paragraph",
                  value: "Somente V e V produz V."
                }
              ],
              after: "",
              afterBlocks: [{
                id: "support-1",
                kind: "paragraph",
                value: "Compare com a disjunção."
              }]
            }, {
              id: "card-b",
              position: 2,
              resource: "paragraph",
              kind: "theory",
              exercise: "none",
              title: "Card vizinho",
              text: "Este card permanece somente leitura.",
              after: ""
            }]
          }]
        }]
      }]
    }]
  };
}

async function captureVisualStep(page, name) {
  if (process.env.ARALEARN_VISUAL_AUDIT !== "1") return;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(
    () => requestAnimationFrame(resolve)
  )));
  await page.screenshot({ path: `test-results/v9-audit/v9-${name}.png` });
}

function projectFixtureWithTwoMicrosequences() {
  const project = projectFixture();
  const lesson = project.courses[0].modules[0].lessons[0];
  const second = structuredClone(lesson.microsequences[0]);
  second.id = "micro-b";
  second.title = "Aplicação";
  second.goal = "";
  second.dependsOn = ["micro-a"];
  second.cards = second.cards.map((card, index) => ({
    ...card,
    id: `card-${String.fromCharCode(99 + index)}`,
    title: `Aplicação ${index + 1}`
  }));
  lesson.microsequences.push(second);
  return project;
}

async function openCardAssistance(page, {
  holdProvider = false,
  captureHierarchy = false,
  stopAtCourse = false,
  stopAtModule = false,
  stopAtLesson = false,
  stopAtMicrosequence = false,
  initialProject = projectFixture()
} = {}) {
  const trailSnapshot = homeTrailSnapshotForProject(initialProject, {
    permissions: Object.fromEntries(initialProject.courses.map((course) => [course.id, {
      origin: "private",
      canEdit: true,
      canDelete: true,
      canRemove: true,
      cardCount: course.modules.reduce((courseTotal, moduleValue) =>
        courseTotal + moduleValue.lessons.reduce((moduleTotal, lesson) =>
          moduleTotal + lesson.microsequences.reduce((lessonTotal, microsequence) =>
            lessonTotal + microsequence.cards.length, 0), 0), 0)
    }]))
  });
  await page.goto("/");
  await page.evaluate(async ({ initialProject, holdProvider, trailSnapshot }) => {
    const oldRoot = document.querySelector("#app-root");
    const root = document.createElement("div");
    root.id = "app-root";
    oldRoot.replaceWith(root);

    const probe = {
      project: structuredClone(initialProject),
      saveCalls: [],
      providerCalls: [],
      guardAttempts: [],
      localDraftRevision: null,
      localDraftSequence: 0,
      localState: null,
      reviewItems: [],
      holdNext: holdProvider,
      releaseProvider: null
    };

    const assertDraftGuard = (expectedRevision) => {
      probe.guardAttempts.push({
        expectedRevision,
        actualRevision: probe.localDraftRevision
      });
      if (expectedRevision === probe.localDraftRevision) return;
      const error = new Error("O curso mudou enquanto o reparo era preparado.");
      error.code = "local_course_draft_changed";
      throw error;
    };
    const advanceDraftRevision = () => {
      probe.localDraftSequence += 1;
      probe.localDraftRevision = `draft-revision-${probe.localDraftSequence}`;
    };

    const storage = {
      loadProject: () => structuredClone(probe.project),
      saveProject: async (next) => {
        probe.project = structuredClone(next);
      },
      flush: async () => undefined,
      createLocalCourseDraftGuard: (courseKey) => ({
        contract: "aralearn.local-course-draft-guard.v1",
        courseId: "11111111-1111-4111-8111-111111111111",
        courseKey,
        expectedRevision: probe.localDraftRevision
      }),
      getLocalCourseDraft: async () => probe.localDraftRevision ? ({
        courseId: "11111111-1111-4111-8111-111111111111",
        courseKey: "course-a",
        courseOrigin: "private",
        revision: probe.localDraftRevision,
        baseContentHash: "a".repeat(64)
      }) : null,
      loadCardAssistanceLocalState: async () => structuredClone(probe.localState),
      saveCardAssistanceLocalState: async (_courseKey, value) => {
        probe.localState = structuredClone(value);
        return structuredClone(value);
      },
      saveMicrosequenceGeneration: async (
        next,
        microsequenceId,
        {
          expectedLocalDraftRevision,
          cardAssistanceLocalState = null
        } = {}
      ) => {
        assertDraftGuard(expectedLocalDraftRevision);
        probe.saveCalls.push({
          method: "saveMicrosequenceGeneration",
          microsequenceId,
          expectedLocalDraftRevision,
          document: structuredClone(next)
        });
        probe.project = structuredClone(next);
        advanceDraftRevision();
        if (cardAssistanceLocalState) {
          probe.localState = structuredClone(cardAssistanceLocalState);
          if (probe.localState.undo) {
            probe.localState.undo.expectedRevision = probe.localDraftRevision;
          }
          if (probe.localState.sync?.pendingPaths?.length) {
            probe.localState.sync.expectedRevision = probe.localDraftRevision;
          }
        }
      },
      saveProjectWithCardAssistanceState: async (
        next,
        {
          courseIdentity,
          localState,
          expectedLocalDraftRevision
        } = {}
      ) => {
        assertDraftGuard(expectedLocalDraftRevision);
        probe.project = structuredClone(next);
        advanceDraftRevision();
        probe.localState = structuredClone(localState);
        if (probe.localState.undo) {
          probe.localState.undo.expectedRevision = probe.localDraftRevision;
        }
        if (probe.localState.sync?.pendingPaths?.length) {
          probe.localState.sync.expectedRevision = probe.localDraftRevision;
        }
        probe.saveCalls.push({
          method: "saveProjectWithCardAssistanceState",
          courseIdentity,
          expectedLocalDraftRevision,
          document: structuredClone(probe.project),
          localState: structuredClone(probe.localState)
        });
        return {
          projectDocument: structuredClone(probe.project),
          localState: structuredClone(probe.localState)
        };
      },
      coursePermissions: () => ({
        role: "owner",
        canAuthorContent: true,
        writeTarget: "private",
        canOrganizeSelection: true,
        canRemoveSelection: true,
        canDeleteCourse: true
      }),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress: async () => undefined,
      initialize: async () => undefined,
      refresh: async () => undefined,
      setCourse: () => undefined,
      clearLocal: async () => true,
      loadReviewItems: () => structuredClone(probe.reviewItems),
      isCardMarkedForReview: (selection) => probe.reviewItems.some((item) =>
        item.entityPath.join("/") === [
          selection.courseKey,
          selection.moduleKey,
          selection.lessonKey,
          selection.microsequenceKey,
          selection.cardKey
        ].join("/")),
      setCardReviewMark: async (selection, marked) => {
        const entityPath = [
          selection.courseKey,
          selection.moduleKey,
          selection.lessonKey,
          selection.microsequenceKey,
          selection.cardKey
        ];
        probe.reviewItems = probe.reviewItems.filter((item) =>
          item.entityPath.join("/") !== entityPath.join("/"));
        if (marked) {
          probe.reviewItems.push({ entityPath, title: "Conjunção", context: "Regra" });
        }
      },
      loadCommentForPath: () => null,
      saveCommentForPath: async () => undefined,
      deleteCommentForPath: async () => undefined
    };

    const assistProvider = {
      async generateStructured(request) {
        probe.providerCalls.push({
          phase: request.phase,
          task: request.engineContext?.task,
          didacticProfileId:
            request.engineContext?.didacticPolicy?.profileId ||
            request.engineContext?.readOnlyContext?.didacticPolicy?.profileId,
          writableTargetIds: (request.engineContext?.writableTargets || [])
            .map((target) => target.targetId)
        });
        if (probe.holdNext) {
          probe.holdNext = false;
          await new Promise((resolve) => {
            probe.releaseProvider = resolve;
          });
          probe.releaseProvider = null;
        }
        if (request.phase === "card_assistance_representation") {
          return { value: { representation: "paragraph:theory:none" } };
        }
        if (request.phase === "bottom_up_operation") {
          return { value: { operation: "update_cards" } };
        }
        if (request.phase === "bottom_up_targets") {
          return { value: { targetIds: ["card-a"] } };
        }
        if (request.phase === "card_assistance_build") {
          const target = request.engineContext.writableTarget;
          return {
            value: {
              card: {
                id: target.id,
                position: target.position,
                resource: "paragraph",
                kind: "theory",
                exercise: "none",
                title: "Conjunção revisada",
                text: "P e Q são verdadeiras ao mesmo tempo.",
                after: ""
              }
            }
          };
        }
        return {
          value: {
            replacements: request.engineContext.writableTargets.map((target) => ({
              targetId: target.targetId,
              value: {
                ...structuredClone(target.value),
                value: target.targetId === "body:paragraph-2"
                  ? "Apenas V e V produz resultado verdadeiro."
                  : "P e Q devem ser simultaneamente verdadeiras."
              },
              gaps: []
            }))
          }
        };
      }
    };

    globalThis.__cardAssistanceProbe = probe;
    const { createEditorSession } = await import("./src/editor/contractEditor.js");
    const { createLessonEditorApp } = await import("./src/ui/lessonEditorApp.js");
    globalThis.__cardAssistanceApp = createLessonEditorApp({
      root,
      storage,
      editor: createEditorSession(storage),
      initialProject: probe.project,
      assistProvider,
      homeTrails: {
        loadTrailSnapshot: async () => structuredClone(trailSnapshot)
      },
      trailPersonalStateFactory: () => storage
    });
  }, {
    initialProject,
    holdProvider,
    trailSnapshot
  });

  await expect(page.locator('[data-field="home-course-select"]')).toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "home");
  await page.locator('[data-action="open-course"]').click();
  await expect(page.locator('.navigation-list[data-structure-collection="module"]'))
    .toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "course");
  if (stopAtCourse) return;
  await page.locator('[data-action="open-module"]').click();
  await expect(page.locator('.navigation-list[data-structure-collection="lesson"]'))
    .toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "module");
  if (stopAtModule) return;
  await page.locator('[data-action="open-lesson"]').click();
  await expect(page.locator('.navigation-list[data-structure-collection="microsequence"]'))
    .toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "lesson");
  if (stopAtLesson) return;
  await page.locator(
    '[data-action="open-microsequence-overview"][data-structure-level="microsequence"]'
  ).click();
  await expect(page.locator(".microsequence-overview-screen")).toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "microsequence");
  if (stopAtMicrosequence) return;
  await page.locator(
    '[data-action="open-microsequence-card"][data-card-index="0"]'
  ).click();
  await expect(page.locator(".runtime-card-sheet")).toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "card-view");
}

async function selectCardMode(page, mode) {
  await page.locator(
    `[data-action="select-entity-mode"][data-entity-level="card"][data-entity-mode="${mode}"]`
  ).click();
  if (mode === "view") {
    await expect(page.locator(".workbench-surface")).not.toHaveClass(/is-editing/u);
  } else {
    await expect(page.locator(".workbench-surface")).toHaveClass(/is-editing/u);
  }
}

async function openCardAiComposer(page) {
  const toggle = page.locator('[data-action="toggle-card-assistance-composer"]');
  await expect(page.locator('[data-field="assist-prompt"]')).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-field="assist-prompt"]')).toBeVisible();
}

function selectedResource(page, targetId) {
  return page.locator(
    `[data-action="toggle-card-assistance-resource"][data-resource-target-id="${targetId}"]`
  );
}

function expectSameBox(current, reference, label = "caixa") {
  expect(current, `${label} atual`).not.toBeNull();
  expect(reference, `${label} de referência`).not.toBeNull();
  expect(Math.abs(current.x - reference.x), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.y - reference.y), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.width - reference.width), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.height - reference.height), label).toBeLessThanOrEqual(1);
}

async function editableTextMetrics(locator) {
  return locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft
    };
  });
}

async function probeSnapshot(page) {
  return page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    const cards = probe.project.courses[0].modules[0].lessons[0]
      .microsequences[0].cards;
    return {
      cards: structuredClone(cards),
      saveCalls: structuredClone(probe.saveCalls),
      providerCalls: structuredClone(probe.providerCalls),
      guardAttempts: structuredClone(probe.guardAttempts),
      localState: structuredClone(probe.localState),
      persisted: JSON.stringify(probe.saveCalls)
    };
  });
}

test("navega da seleção do curso ao card sem superfícies redundantes", async ({ page }) => {
  await openCardAssistance(page, { captureHierarchy: true });
  await expect(page.locator(".runtime-card-sheet")).toBeVisible();
  const topbarBox = await page.locator(".microsequence-workbench-screen > .topbar")
    .boundingBox();
  expect(topbarBox).not.toBeNull();
  expect(topbarBox.y).toBeGreaterThanOrEqual(0);
  await expect(page.locator(
    ".microsequence-workbench-screen > .topbar [data-action='go-back']"
  )).toBeInViewport();
  await expect(page.locator(
    ".microsequence-workbench-screen > .topbar [data-action='open-central']"
  )).toBeInViewport();
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.getByText(/permissão de escrita|contexto indexado/iu)).toHaveCount(0);
});

test("título e abas permanecem geometricamente centralizados e simétricos", async ({ page }) => {
  await openCardAssistance(page, { stopAtLesson: true });
  await expect(page.locator(".topbar-title")).toHaveText("Lições");
  const geometry = await page.evaluate(() => {
    const screen = document.querySelector(".screen");
    const topbar = document.querySelector(".navigation-topbar");
    const title = topbar?.querySelector(".topbar-title");
    const back = topbar?.querySelector('[data-action="go-back"]');
    const actions = topbar?.querySelector(".lesson-top-actions");
    const switcher = document.querySelector(".entity-mode-switcher");
    const buttons = [...(switcher?.querySelectorAll(".entity-mode-button") || [])];
    const titleRange = document.createRange();
    if (title) titleRange.selectNodeContents(title);
    return {
      screen: screen?.getBoundingClientRect(),
      topbar: topbar?.getBoundingClientRect(),
      title: title?.getBoundingClientRect(),
      titleText: title ? titleRange.getBoundingClientRect() : null,
      back: back?.getBoundingClientRect(),
      actions: actions?.getBoundingClientRect(),
      switcher: switcher?.getBoundingClientRect(),
      buttons: buttons.map((button) => button.getBoundingClientRect())
    };
  });

  expect(geometry.buttons).toHaveLength(3);
  expect(Math.abs(
    (geometry.title.left + geometry.title.width / 2) -
    (geometry.screen.left + geometry.screen.width / 2)
  )).toBeLessThanOrEqual(1);
  const geometryLabel = JSON.stringify(geometry);
  expect(geometry.titleText.left - geometry.back.right, geometryLabel).toBeGreaterThanOrEqual(8);
  expect(geometry.actions.left - geometry.titleText.right, geometryLabel).toBeGreaterThanOrEqual(8);
  expect(Math.abs(
    (geometry.switcher.left + geometry.switcher.width / 2) -
    (geometry.screen.left + geometry.screen.width / 2)
  )).toBeLessThanOrEqual(1);
  for (const button of geometry.buttons.slice(1)) {
    expect(Math.abs(button.width - geometry.buttons[0].width)).toBeLessThanOrEqual(0.5);
  }
});

test("Editar seleciona um alvo por vez e mantém as ações fora do card", async ({ page }) => {
  await openCardAssistance(page, { stopAtCourse: true });
  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="course"][data-entity-mode="edit"]'
  ).click();

  const moduleCards = page.locator('[data-structure-target="module"]');
  await expect(moduleCards).toHaveCount(1);
  const moduleCard = moduleCards.first();
  await expect(page.locator('[data-inline-structure-editor="true"]')).toHaveCount(0);
  await moduleCard.click();

  await expect(page.locator(".topbar-title")).toHaveText("Curso");
  await expect(page.locator('h2.section-heading')).toHaveText("Módulos");
  await expect(moduleCard).toHaveAttribute("data-inline-structure-editor", "true");
  await expect(moduleCard.locator('[data-field="inline-entity-title"]')).toHaveText("Operadores");
  await expect(moduleCard.locator('[data-field="inline-entity-title"]')).toBeEditable();
  await expect(page.locator('.entity-summary [data-field="inline-entity-title"]')).toHaveCount(0);
  await expect(page.locator(".microsequence-workbench-screen")).toHaveCount(0);
  await expect(moduleCard.locator('[data-action="reset-entity-progress-direct"]')).toHaveCount(1);
  await expect(moduleCard.locator('[data-action="open-module"]')).toHaveCount(1);
  await expect(page.locator("main .structure-edit-dock")).toHaveCount(0);
  await expect(page.locator(".structure-edit-dock")).toBeVisible();

  const titleEditor = moduleCard.locator('[data-field="inline-entity-title"]');
  await titleEditor.click();
  await expect(moduleCard).toHaveAttribute("aria-pressed", "true");

  await page.locator('.structure-edit-dock [data-action="close-inline-structure-entity"]').click();
  await expect(page.locator('[data-inline-structure-editor="true"]')).toHaveCount(0);
  await expect(page.locator(".topbar-title")).toHaveText("Curso");
});

for (const viewportWidth of [320, 360, 390, 412]) {
  test(`estrutura mantém caixa, tipografia e irmãos em ${viewportWidth}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await openCardAssistance(page, {
      stopAtLesson: true,
      initialProject: projectFixtureWithTwoMicrosequences()
    });
    if (viewportWidth === 390) {
      await page.evaluate(() => globalThis.AraLearnTheme.setPreference("dark"));
      await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
    }

    const cards = page.locator('[data-structure-target="microsequence"]');
    await expect(cards).toHaveCount(2);
    const snapshot = async () => cards.evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const title = node.querySelector(".card-title");
      const style = title ? getComputedStyle(title) : null;
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        padding: style
          ? [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
          : [],
        fontFamily: style?.fontFamily || "",
        fontSize: style?.fontSize || "",
        lineHeight: style?.lineHeight || ""
      };
    }));
    const expectSameStructure = (current, reference) => {
      expect(current).toHaveLength(reference.length);
      current.forEach((value, index) => {
        expectSameBox(value, reference[index], `card ${index + 1} em ${viewportWidth}px`);
        expect(value.padding).toEqual(reference[index].padding);
        expect(value.fontFamily).toBe(reference[index].fontFamily);
        expect(value.fontSize).toBe(reference[index].fontSize);
        expect(value.lineHeight).toBe(reference[index].lineHeight);
      });
    };

    const viewGeometry = await snapshot();
    await page.locator(
      '[data-action="select-entity-mode"][data-entity-level="lesson"][data-entity-mode="edit"]'
    ).click();
    await expect(page.locator('[data-inline-structure-editor="true"]')).toHaveCount(0);
    expectSameStructure(await snapshot(), viewGeometry);

    await cards.first().click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
    await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "false");
    await expect(cards.first().locator('[data-action="reset-entity-progress-direct"]')).toHaveCount(1);
    await expect(cards.first().locator('[data-action="open-microsequence-overview"]')).toHaveCount(1);
    const selectedGeometry = await snapshot();
    expectSameStructure(selectedGeometry, viewGeometry);

    const titleEditor = cards.first().locator('[data-field="inline-entity-title"]');
    await titleEditor.fill(
      "Um título deliberadamente muito longo que não pode aumentar o card nem deslocar o irmão seguinte"
    );
    await titleEditor.click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
    expectSameStructure(await snapshot(), viewGeometry);
    if (viewportWidth === 390) {
      await captureVisualStep(page, "structure-edit-selected-390");
    }

    await cards.nth(1).click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "false");
    await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-inline-structure-editor="true"]')).toHaveCount(1);
    const emptyDescription = cards.nth(1).locator('[data-field="inline-entity-description"]');
    await expect(emptyDescription).toBeEditable();
    const emptyDescriptionBox = await emptyDescription.boundingBox();
    expect(emptyDescriptionBox).not.toBeNull();
    expect(emptyDescriptionBox.height).toBeGreaterThan(0);

    await page.locator(
      '[data-action="select-entity-mode"][data-entity-level="lesson"][data-entity-mode="ai"]'
    ).click();
    expectSameStructure(await snapshot(), viewGeometry);
    await cards.first().click();
    await cards.nth(1).click();
    await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
    await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
    const main = page.locator("main.lesson-structure-screen");
    const scrollHeightBeforeComposer = await main.evaluate((node) => node.scrollHeight);
    await page.locator('[data-action="toggle-bottom-up-composer"]').click();
    await expect(main.locator(".bottom-up-composer")).toHaveCount(0);
    await expect(page.locator(".bottom-up-composer-shell .bottom-up-composer")).toBeVisible();
    await page.locator('[data-field="bottom-up-assist-prompt"]').fill(
      "Um pedido longo para confirmar que o campo externo não altera a geometria nem o fluxo dos cards."
    );
    expect(await main.evaluate((node) => node.scrollHeight)).toBe(scrollHeightBeforeComposer);
    expectSameStructure(await snapshot(), viewGeometry);
    const horizontalGeometry = await page.evaluate(() => {
      const dock = document.querySelector(".bottom-up-assistance-dock");
      const composer = document.querySelector(".bottom-up-composer");
      const toBounds = (node) => {
        const rect = node?.getBoundingClientRect();
        return rect ? { left: rect.left, right: rect.right } : null;
      };
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        dock: toBounds(dock),
        composer: toBounds(composer)
      };
    });
    expect(horizontalGeometry.scrollWidth).toBeLessThanOrEqual(horizontalGeometry.clientWidth + 1);
    for (const bounds of [horizontalGeometry.dock, horizontalGeometry.composer]) {
      expect(bounds).not.toBeNull();
      expect(bounds.left).toBeGreaterThanOrEqual(-1);
      expect(bounds.right).toBeLessThanOrEqual(horizontalGeometry.clientWidth + 1);
    }
  });
}

test("microssequência mantém o padrão estrutural e abre o card somente pelo Play", async ({ page }) => {
  await openCardAssistance(page, { stopAtLesson: true });
  const microsequenceCard = page.locator('[data-structure-target="microsequence"]');
  await expect(microsequenceCard.locator('[data-action="reset-entity-progress-direct"]')).toHaveCount(1);
  await expect(microsequenceCard.locator('[data-action="open-microsequence-overview"]')).toHaveCount(1);
  await microsequenceCard.locator('[data-action="open-microsequence-overview"]').click();

  await expect(page.locator(".topbar-title")).toHaveText("Microssequência");
  await expect(page.locator(".microsequence-overview-content.navigation-screen")).toBeVisible();
  await expect(page.locator('h2.section-heading')).toHaveText("Cards");
  const card = page.locator('[data-structure-target="card"]').first();
  await expect(card.locator(".card-subtitle")).toHaveCount(0);
  await expect(card.locator(".progress-meta")).toHaveCount(0);
  await expect(card.getByRole("progressbar", { name: "Conclusão do card" }))
    .toHaveAttribute("aria-valuetext", "Card não concluído");
  await expect(card.locator('[data-action="reset-entity-progress-direct"]')).toHaveCount(1);
  await card.locator('[data-action="open-microsequence-card"]').click();
  await expect(page.locator(".microsequence-workbench-screen")).toBeVisible();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção");
});

test("card marcado para rever reaparece como atalho no curso da tela inicial", async ({ page }) => {
  await openCardAssistance(page);
  const review = page.locator('[data-action="toggle-card-review"]');
  await review.click();
  await expect(review).toHaveAttribute("aria-pressed", "true");

  for (let level = 0; level < 4; level += 1) {
    await page.locator('[data-action="go-back"]').click();
  }
  const menu = page.locator(".home-course-review-menu");
  await expect(menu).toBeVisible();
  await menu.locator("summary").click();
  await menu.locator('[data-action="open-review-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção");
  await expect(page.locator('[data-action="toggle-card-review"]')).toHaveAttribute("aria-pressed", "true");
});

test("lição seleciona o escopo inteiro por contorno, sem controles explicativos", async ({ page }) => {
  await openCardAssistance(page, { stopAtLesson: true });
  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="lesson"]' +
    '[data-entity-mode="ai"]'
  ).click();

  const lesson = page.locator(
    '[data-action="toggle-bottom-up-container"][data-assistance-level="lesson"]'
  );
  await expect(lesson).toHaveAttribute("aria-pressed", "false");
  await lesson.click();
  await expect(lesson).toHaveAttribute("aria-pressed", "true");
  await expect(lesson).toHaveCSS("outline-style", "solid");
  await expect(lesson).toHaveCSS("outline-width", "2px");
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator(".scope-list, .permission-note, .context-note")).toHaveCount(0);
  await captureVisualStep(page, "lesson-ai-selection");
});

test("lição mantém seleção múltipla de microssequências após cada renderização", async ({ page }) => {
  await openCardAssistance(page, {
    stopAtLesson: true,
    initialProject: projectFixtureWithTwoMicrosequences()
  });
  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="lesson"]' +
    '[data-entity-mode="ai"]'
  ).click();

  const first = page.locator(
    '[data-action="toggle-bottom-up-item"][data-assistance-level="lesson"]' +
    '[data-assistance-item-id="micro-a"]'
  );
  const second = page.locator(
    '[data-action="toggle-bottom-up-item"][data-assistance-level="lesson"]' +
    '[data-assistance-item-id="micro-b"]'
  );
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "false");

  await second.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");

  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");
});

test("microssequência mantém seleção múltipla de cards e permite desselecionar", async ({ page }) => {
  await openCardAssistance(page, { stopAtMicrosequence: true });
  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="microsequence"]' +
    '[data-entity-mode="ai"]'
  ).click();

  const first = page.locator(
    '[data-action="toggle-bottom-up-item"][data-assistance-level="microsequence"]' +
    '[data-assistance-item-id="card-a"]'
  );
  const second = page.locator(
    '[data-action="toggle-bottom-up-item"][data-assistance-level="microsequence"]' +
    '[data-assistance-item-id="card-b"]'
  );
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "false");

  await second.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");

  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "true");

  await second.click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(second).toHaveAttribute("aria-pressed", "false");
});

test("modos da microssequência preservam a largura integral e o destaque interno", async ({ page }) => {
  await openCardAssistance(page, { stopAtMicrosequence: true });

  const cards = page.locator(
    '.navigation-list[data-structure-collection="card"] > .navigation-list-card'
  );
  const readCardGeometry = () => cards.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, width: box.width };
  }));
  const expectSameWidths = (current, reference) => {
    expect(current).toHaveLength(reference.length);
    current.forEach((box, index) => {
      expect(Math.abs(box.left - reference[index].left)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.right - reference[index].right)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - reference[index].width)).toBeLessThanOrEqual(1);
    });
  };

  const viewGeometry = await readCardGeometry();
  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="microsequence"]' +
    '[data-entity-mode="edit"]'
  ).click();
  expectSameWidths(await readCardGeometry(), viewGeometry);
  await captureVisualStep(page, "microsequence-edit-geometry");

  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="microsequence"]' +
    '[data-entity-mode="ai"]'
  ).click();
  const aiGeometry = await readCardGeometry();
  expectSameWidths(aiGeometry, viewGeometry);

  const first = cards.first();
  const beforeSelection = await first.boundingBox();
  await first.click();
  const afterSelection = await cards.first().boundingBox();
  expect(beforeSelection).not.toBeNull();
  expect(afterSelection).not.toBeNull();
  expect(Math.abs(afterSelection.x - beforeSelection.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterSelection.width - beforeSelection.width)).toBeLessThanOrEqual(1);
  await expect(cards.first()).toHaveCSS("outline-offset", "-2px");
  await captureVisualStep(page, "microsequence-ai-geometry");
});

test("card mantém a mesma moldura nos modos de leitura, edição e assistência", async ({ page }) => {
  await openCardAssistance(page);

  const sheet = page.locator(".runtime-card-sheet");
  const readSheetBox = async () => {
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    return box;
  };
  const expectSameFrame = (current, reference) => {
    expect(Math.abs(current.x - reference.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.y - reference.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.width - reference.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(current.height - reference.height)).toBeLessThanOrEqual(1);
  };

  const viewBox = await readSheetBox();
  await selectCardMode(page, "edit");
  expectSameFrame(await readSheetBox(), viewBox);
  await captureVisualStep(page, "card-edit-fixed-frame");

  await selectCardMode(page, "ai");
  expectSameFrame(await readSheetBox(), viewBox);
  await openCardAiComposer(page);
  expectSameFrame(await readSheetBox(), viewBox);
  await captureVisualStep(page, "card-ai-fixed-frame");
});

test("home harmoniza tipografia do curso e do seletor com a hierarquia", async ({ page }) => {
  await openCardAssistance(page, { stopAtCourse: true });
  const hierarchyTypography = await page.locator(
    '.navigation-list[data-structure-collection="module"] > .navigation-list-card'
  ).first().evaluate((card) => {
    const title = getComputedStyle(card.querySelector(".card-title"));
    const description = getComputedStyle(card.querySelector(".card-subtitle"));
    return {
      titleSize: title.fontSize,
      titleLineHeight: title.lineHeight,
      descriptionSize: description.fontSize,
      descriptionLineHeight: description.lineHeight
    };
  });

  await page.locator('[data-action="go-back"]').click();
  await expect(page.locator(".home-course-selector-preview")).toBeVisible();
  const homeTypography = await page.locator(".home-course-selector-card").evaluate((card) => {
    const title = getComputedStyle(card.querySelector(".home-course-selector-heading h2"));
    const description = getComputedStyle(card.querySelector(".card-subtitle"));
    const selector = getComputedStyle(card.querySelector("select"));
    return {
      titleSize: title.fontSize,
      titleLineHeight: title.lineHeight,
      descriptionSize: description.fontSize,
      descriptionLineHeight: description.lineHeight,
      selectorSize: selector.fontSize
    };
  });

  expect(homeTypography.titleSize).toBe(hierarchyTypography.titleSize);
  expect(homeTypography.titleLineHeight).toBe(hierarchyTypography.titleLineHeight);
  expect(homeTypography.descriptionSize).toBe(hierarchyTypography.descriptionSize);
  expect(homeTypography.descriptionLineHeight).toBe(hierarchyTypography.descriptionLineHeight);
  expect(homeTypography.selectorSize).toBe(hierarchyTypography.descriptionSize);
  await captureVisualStep(page, "home-harmonized-typography");
});

test("tipografia estrutural permanece uniforme do curso aos cards", async ({ page }) => {
  await openCardAssistance(page, {
    stopAtCourse: true,
    initialProject: projectFixtureWithTwoMicrosequences()
  });

  const expectCurrentLevelMatchesChild = async (collection, { compareDescription = true } = {}) => {
    const styles = await page.evaluate(({ collection, compareDescription }) => {
      const summary = document.querySelector(".entity-summary");
      const child = document.querySelector(
        `.navigation-list[data-structure-collection="${collection}"] > .navigation-list-card`
      );
      const readTypography = (node) => {
        const style = node ? getComputedStyle(node) : null;
        return style ? {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing
        } : null;
      };
      return {
        summaryTitle: readTypography(summary?.querySelector(":scope > strong")),
        childTitle: readTypography(child?.querySelector(".card-title")),
        summaryDescription: compareDescription
          ? readTypography(summary?.querySelector(":scope > p"))
          : null,
        childDescription: compareDescription
          ? readTypography(child?.querySelector(".card-subtitle"))
          : null
      };
    }, { collection, compareDescription });

    expect(styles.summaryTitle).not.toBeNull();
    expect(styles.childTitle).toEqual(styles.summaryTitle);
    if (compareDescription) {
      expect(styles.summaryDescription).not.toBeNull();
      expect(styles.childDescription).toEqual(styles.summaryDescription);
    }
  };

  await expectCurrentLevelMatchesChild("module");
  await page.locator('[data-action="open-module"]').click();
  await expectCurrentLevelMatchesChild("lesson");
  await page.locator('[data-action="open-lesson"]').click();
  await expectCurrentLevelMatchesChild("microsequence");

  const microsequenceTags = page.locator(
    '[data-structure-collection="microsequence"] .microsequence-tag-row .didactic-tag-text'
  );
  await expect(microsequenceTags).toHaveCount(1);
  await expect(microsequenceTags).toHaveText("Regra");

  await page.locator(
    '[data-action="open-microsequence-overview"][data-structure-level="microsequence"]'
  ).first().click();
  await expectCurrentLevelMatchesChild("card", { compareDescription: false });

  const cardList = page.locator('[data-structure-collection="card"]');
  await expect(cardList.locator(".progress-meta")).toHaveCount(0);
  await expect(cardList.locator(".didactic-tag")).toHaveCount(0);
});

test("configuração exige escolha explícita e não expõe contexto didático", async ({ page }) => {
  await openCardAssistance(page);
  await selectCardMode(page, "ai");
  await openCardAiComposer(page);
  await page.locator('[data-action="open-assist-config"]').click();

  const model = page.locator('[data-field="assist-model"]');
  await expect(model).toHaveValue("");
  await expect(model.locator('option[value="deepseek-v4-flash"]')).toHaveText(
    "DeepSeek V4 Flash"
  );
  await expect(model.locator('option[value="deepseek-v4-pro"]')).toHaveText(
    "DeepSeek V4 Pro"
  );
  await expect(page.getByText("Contexto didático", { exact: true })).toHaveCount(0);
  await model.selectOption("deepseek-v4-pro");
  await expect(page.locator('[data-field="assist-api-key"]')).toBeVisible();
  await expect(page.locator('[data-field="provider-config-base-url"]')).toBeVisible();
  await page.locator('[data-field="assist-api-key"]').fill("deepseek-key-volatil");
  await page.locator('[data-action="provider-config-close"]').click();
  await expect(page.locator('[aria-label="Configuração de IA"]')).toHaveCount(0);

  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  await page.locator('[data-action="open-assist-config"]').click();
  await expect(page.locator('[data-field="assist-model"]')).toHaveValue("deepseek-v4-pro");
  await expect(page.locator('[data-field="assist-api-key"]')).toHaveValue("deepseek-key-volatil");
  await expect(page.locator('[data-field="provider-config-base-url"]')).toHaveValue(
    "https://api.deepseek.com"
  );
  await page.locator('[data-field="assist-model"]').selectOption("gemini-3.6-flash");
  await expect(page.locator('[data-field="assist-api-key"]')).toHaveValue("");
  await page.locator('[data-field="assist-api-key"]').fill("gemini-key-volatil");
  await page.locator('[data-field="assist-model"]').selectOption("deepseek-v4-flash");
  await expect(page.locator('[data-field="assist-api-key"]')).toHaveValue("");
});

test("microssequência envia bottom-up direto, persiste atomicamente e desfaz uma vez", async ({ page }) => {
  await openCardAssistance(page, { stopAtMicrosequence: true });
  await page.locator(
    '[data-action="select-entity-mode"][data-entity-level="microsequence"]' +
    '[data-entity-mode="ai"]'
  ).click();

  const selectedCard = page.locator(
    '[data-action="toggle-bottom-up-item"][data-assistance-level="microsequence"]' +
    '[data-assistance-item-id="card-a"]'
  );
  await expect(selectedCard).toHaveAttribute("aria-pressed", "false");
  await selectedCard.click();
  await expect(selectedCard).toHaveAttribute("aria-pressed", "true");
  await expect(selectedCard).toHaveCSS("outline-style", "solid");
  await expect(selectedCard).toHaveCSS("outline-width", "2px");
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator(".scope-list, .permission-note, .context-note")).toHaveCount(0);
  await captureVisualStep(page, "microsequence-ai-selection");

  const prompt = "Reescreva somente o primeiro card com mais clareza.";
  const composerToggle = page.locator('[data-action="toggle-bottom-up-composer"]');
  await expect(page.locator('[data-field="bottom-up-assist-prompt"]')).toHaveCount(0);
  await composerToggle.click();
  await expect(composerToggle).toHaveAttribute("aria-expanded", "true");
  const submit = page.locator('[data-action="submit-bottom-up-assistance"]');
  await page.locator('[data-field="bottom-up-assist-prompt"]').fill(prompt);
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("Conjunção revisada", { exact: true })).toBeVisible();
  await expect.poll(async () => (await probeSnapshot(page)).saveCalls.length).toBe(1);
  const applied = await probeSnapshot(page);
  expect(applied.saveCalls[0].method).toBe("saveProjectWithCardAssistanceState");
  expect(applied.saveCalls[0].expectedLocalDraftRevision).toBeNull();
  expect(applied.saveCalls[0].localState.undo.kind).toBe("lesson");
  expect(applied.saveCalls[0].localState.undo.expectedRevision).toBe("draft-revision-1");
  expect(applied.saveCalls[0].localState.sync.expectedRevision).toBe("draft-revision-1");
  expect(applied.saveCalls[0].localState.sync.pendingPaths).toEqual([{
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a"
  }]);
  expect(applied.providerCalls.map(({ phase }) => phase)).toEqual([
    "bottom_up_operation",
    "card_assistance_representation",
    "card_assistance_build"
  ]);
  expect(applied.providerCalls
    .filter(({ phase }) => [
      "card_assistance_representation",
      "card_assistance_build"
    ].includes(phase))
    .every(({ didacticProfileId }) => didacticProfileId === "aralearn.engine.ads.general.v4")
  ).toBe(true);
  expect(applied.cards[1]).toEqual(
    projectFixture().courses[0].modules[0].lessons[0].microsequences[0].cards[1]
  );
  expect(applied.persisted).not.toContain(prompt);
  await expect(page.locator(
    '[data-action="apply-card-assistance-preview"], ' +
    '[data-action="discard-card-assistance-preview"]'
  )).toHaveCount(0);

  const undo = page.locator('[data-action="undo-bottom-up-assistance"]');
  await expect(undo).toHaveCount(1);
  await undo.click();
  await expect(page.getByText("Conjunção", { exact: true })).toBeVisible();
  await expect.poll(async () => (await probeSnapshot(page)).saveCalls.length).toBe(2);
  const restored = await probeSnapshot(page);
  expect(restored.saveCalls.map(({ method }) => method)).toEqual([
    "saveProjectWithCardAssistanceState",
    "saveProjectWithCardAssistanceState"
  ]);
  expect(restored.saveCalls[1].expectedLocalDraftRevision).toBe("draft-revision-1");
  expect(restored.localState.undo).toBeNull();
  expect(restored.cards).toEqual(
    projectFixture().courses[0].modules[0].lessons[0].microsequences[0].cards
  );
  await expect(page.locator('[data-action="undo-bottom-up-assistance"]')).toHaveCount(0);
});

test("repara recursos selecionados, persiste uma vez e desfaz", async ({ page }) => {
  await openCardAssistance(page);
  await selectCardMode(page, "ai");

  await expect(page.locator(".runtime-card-authoring")).toHaveCount(0);
  await expect(page.locator('[data-action="open-card-comment"]')).toHaveCount(0);
  await expect(page.locator('[data-action="toggle-card-review"]')).toHaveCount(0);
  await selectedResource(page, "body:paragraph-1").click();
  await selectedResource(page, "body:paragraph-2").click();
  await expect(selectedResource(page, "body:paragraph-1")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(selectedResource(page, "body:paragraph-2")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(selectedResource(page, "body:paragraph-1")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  );
  await expect(page.locator(
    '[data-resource-edit-target="body:paragraph-1"]'
  )).toHaveCSS("outline-style", "solid");
  await expect(page.locator(
    '[data-resource-edit-target="body:paragraph-1"]'
  )).toHaveCSS("outline-width", "2px");
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator(".scope-list, .permission-note, .context-note")).toHaveCount(0);
  await expect(page.getByText(/card inteiro|permissão de escrita|contexto indexado/iu))
    .toHaveCount(0);
  await captureVisualStep(page, "card-ai-selection");

  await openCardAiComposer(page);
  const authoring = page.locator(".runtime-card-authoring");
  await expect(authoring).toBeVisible();
  await expect(authoring.locator('input[type="file"]')).toHaveCount(0);
  const submit = page.locator('[data-action="submit-card-assistance"]');
  await expect(submit).toBeDisabled();
  const prompt = "Corrija apenas os dois recursos selecionados.";
  await page.locator('[data-field="assist-prompt"]').fill(prompt);
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("P e Q devem ser simultaneamente verdadeiras.", {
    exact: true
  })).toBeVisible();
  await expect(page.getByText("Apenas V e V produz resultado verdadeiro.", {
    exact: true
  })).toBeVisible();
  await expect.poll(async () => (await probeSnapshot(page)).saveCalls.length).toBe(1);

  const applied = await probeSnapshot(page);
  expect(applied.saveCalls.map((call) => call.method)).toEqual([
    "saveMicrosequenceGeneration"
  ]);
  expect(applied.providerCalls).toEqual([{
    phase: "card_assistance_resource_repair",
    task: "repair_selected_resources",
    writableTargetIds: ["body:paragraph-1", "body:paragraph-2"],
    didacticProfileId: "aralearn.engine.ads.general.v4"
  }]);
  expect(applied.cards[0].blocks[1].code).toBe("P ∧ Q");
  expect(applied.cards[0].afterBlocks[0].value).toBe("Compare com a disjunção.");
  expect(applied.cards[1].text).toBe("Este card permanece somente leitura.");
  expect(applied.persisted).not.toContain(prompt);

  await expect(page.locator('[data-action="undo-card-edit"]')).toHaveCount(1);
  await page.locator('[data-action="undo-card-edit"]').click();
  await expect(page.getByText("P e Q precisam ser verdadeiras.", { exact: true }))
    .toBeVisible();
  await expect.poll(async () => (await probeSnapshot(page)).saveCalls.length).toBe(2);
  const undone = await probeSnapshot(page);
  expect(undone.cards).toEqual(projectFixture().courses[0].modules[0].lessons[0]
    .microsequences[0].cards);
});

test("o escopo de card inteiro executa somente reparo e preserva identidade", async ({ page }) => {
  await openCardAssistance(page);
  await selectCardMode(page, "ai");

  const cardSurface = page.locator('[data-action="toggle-card-assistance-whole-card"]');
  await expect(cardSurface).toHaveAttribute("aria-pressed", "false");
  await cardSurface.click();
  await expect(cardSurface).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(
    '[data-action="toggle-card-assistance-resource"][aria-pressed="true"]'
  )).toHaveCount(0);

  await openCardAiComposer(page);
  await page.locator('[data-field="assist-prompt"]').fill(
    "Reescreva o card como uma explicação curta."
  );
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.getByText("Conjunção revisada", { exact: true })).toBeVisible();
  await expect(page.getByText("P e Q são verdadeiras ao mesmo tempo.", { exact: true }))
    .toBeVisible();

  const result = await probeSnapshot(page);
  expect(result.saveCalls).toHaveLength(1);
  expect(result.saveCalls[0].method).toBe("saveMicrosequenceGeneration");
  expect(result.providerCalls.map(({ phase, task }) => ({ phase, task }))).toEqual([
    {
      phase: "card_assistance_representation",
      task: "repair_whole_card"
    },
    {
      phase: "card_assistance_build",
      task: "rebuild_one_card"
    }
  ]);
  expect(result.cards[0].id).toBe("card-a");
  expect(result.cards[0].position).toBe(1);
  expect(result.cards[0].resource).toBe("paragraph");
  expect(result.cards[1]).toEqual(
    projectFixture().courses[0].modules[0].lessons[0].microsequences[0].cards[1]
  );
});

test("edição manual preserva o resource e usa ações no dock externo", async ({ page }) => {
  await openCardAssistance(page);
  await selectCardMode(page, "edit");

  const sheet = page.locator(".runtime-card-sheet");
  const sheetBefore = await sheet.boundingBox();
  const resource = page.locator(
    '[data-resource-edit-target="body:paragraph-1"]'
  );
  const geometryBefore = await resource.boundingBox();
  const typographyBefore = await resource.locator(".runtime-paragraph").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    };
  });
  await selectedResource(page, "body:paragraph-1").click();
  const geometryDuring = await resource.boundingBox();
  const sheetDuring = await sheet.boundingBox();
  expect(sheetBefore).not.toBeNull();
  expect(sheetDuring).not.toBeNull();
  expect(geometryBefore).not.toBeNull();
  expect(geometryDuring).not.toBeNull();
  expect(Math.abs(sheetDuring.width - sheetBefore.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(sheetDuring.height - sheetBefore.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometryDuring.width - geometryBefore.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometryDuring.height - geometryBefore.height)).toBeLessThanOrEqual(1);
  await expect(resource.locator(".runtime-resource-selection-content"))
    .toBeAttached();
  await expect(resource.locator('[data-action="open-resource-observation"]')).toHaveCount(0);
  for (const action of ["cancel-manual-card-edit", "save-manual-card-edit"]) {
    await expect(resource.locator(`[data-action="${action}"]`)).toHaveCount(0);
    await expect(sheet.locator(`[data-action="${action}"]`)).toHaveCount(0);
    await expect(page.locator(
      `.runtime-card-external-dock [data-action="${action}"]`
    )).toHaveCount(1);
  }
  await expect(page.locator('[data-action="open-card-comment"]')).toHaveCount(0);
  await expect(page.locator('[data-action="toggle-card-review"]')).toHaveCount(0);
  await expect(page.locator('[data-action="toggle-card-assistance-composer"]')).toHaveCount(0);
  await expect(page.locator('[data-action="prev-card"]')).toHaveCount(1);
  await expect(page.locator('[data-action="next-card"]')).toHaveCount(1);
  await expect(page.locator(
    ".microsequence-workbench-screen > .topbar [data-action='go-back']"
  )).toBeInViewport();
  await expect(page.locator(
    '.entity-mode-switcher [data-entity-mode="edit"]'
  )).toBeInViewport();
  await captureVisualStep(page, "card-resource-edit");
  const field = resource.locator('[data-manual-edit-path="value"]');
  await expect(field).toHaveJSProperty("tagName", "DIV");
  const typographyDuring = await field.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    };
  });
  expect(typographyDuring).toEqual(typographyBefore);
  await expect(field).toContainText("P e Q precisam ser verdadeiras.");
  await field.fill("Esta alteração será cancelada.");
  await page.locator('[data-action="cancel-manual-card-edit"]').click();
  await expect(page.getByText("P e Q precisam ser verdadeiras.", { exact: true })).toBeVisible();
  expect((await probeSnapshot(page)).saveCalls).toEqual([]);

  await selectedResource(page, "body:paragraph-1").click();
  await expect(field).toContainText("P e Q precisam ser verdadeiras.");
  await field.fill("P e Q precisam ser verdadeiras ao mesmo tempo.");
  await page.locator('[data-action="save-manual-card-edit"]').click();

  await expect(page.getByText("P e Q precisam ser verdadeiras ao mesmo tempo.", {
    exact: true
  })).toBeVisible();
  await expect.poll(async () => (await probeSnapshot(page)).saveCalls.length).toBe(1);
  let result = await probeSnapshot(page);
  expect(result.providerCalls).toEqual([]);
  expect(result.cards[0].blocks[1].code).toBe("P ∧ Q");
  expect(result.cards[1].text).toBe("Este card permanece somente leitura.");

  await expect(sheet.locator('[data-action="undo-card-edit"]')).toHaveCount(0);
  await page.locator('.runtime-card-external-dock [data-action="undo-card-edit"]').click();
  await expect(page.getByText("P e Q precisam ser verdadeiras.", { exact: true }))
    .toBeVisible();
  await expect.poll(async () => (await probeSnapshot(page)).saveCalls.length).toBe(2);
  result = await probeSnapshot(page);
  expect(result.cards[0].blocks[0].value).toBe("P e Q precisam ser verdadeiras.");
});

test("edição de heading mantém a caixa e deixa o CTA no dock", async ({ page }) => {
  const initialProject = projectFixture();
  initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks.unshift({
    id: "heading-1",
    kind: "heading",
    value: "Conceito-chave"
  });
  await openCardAssistance(page, { initialProject });
  await selectCardMode(page, "edit");

  const resource = page.locator('[data-resource-edit-target="body:heading-1"]');
  const before = await resource.boundingBox();
  await resource.locator('[data-action="toggle-card-assistance-resource"]').click();
  const during = await resource.boundingBox();
  expect(before).not.toBeNull();
  expect(during).not.toBeNull();
  expect(Math.abs(during.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(during.height - before.height)).toBeLessThanOrEqual(1);
  await expect(resource).toHaveCSS("outline-offset", "-2px");
  await expect(resource.locator('[data-action="save-manual-card-edit"]')).toHaveCount(0);
  await expect(page.locator(
    '.runtime-card-external-dock [data-action="save-manual-card-edit"]'
  )).toHaveCount(1);
  await expect(resource.locator('[data-manual-edit-path="value"]')).toHaveJSProperty(
    "tagName",
    "H3"
  );
});

test("edição in-place preserva Markdown que não foi removido pelo usuário", async ({ page }) => {
  const initialProject = projectFixture();
  initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0]
    .blocks[0].value = "Use **forte** e `código`.";
  await openCardAssistance(page, { initialProject });
  await selectCardMode(page, "edit");
  await selectedResource(page, "body:paragraph-1").click();

  const field = page.locator(
    '[data-resource-edit-target="body:paragraph-1"] [data-manual-edit-path="value"]'
  );
  await field.evaluate((node) => {
    const firstText = node.querySelector("p")?.firstChild;
    if (!(firstText instanceof Text)) throw new Error("Texto editável não encontrado.");
    firstText.data = firstText.data.replace("Use", "Adote");
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  });
  await page.locator('[data-action="save-manual-card-edit"]').click();
  await expect(page.getByText("Adote forte e código.", { exact: true })).toBeVisible();

  const result = await probeSnapshot(page);
  expect(result.cards[0].blocks[0].value).toBe("Adote **forte** e `código`.");
});

test("resource vetorial conserva a projeção até o texto ser realmente alterado", async ({ page }) => {
  const initialProject = projectFixture();
  initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks.unshift({
    id: "relation-map-1",
    kind: "relation_map",
    prompt: "Observe os conjuntos.",
    leftSet: {
      label: "Universo esquerdo",
      items: [{ id: "u1", label: "Rótulo extenso" }]
    },
    rightSet: {
      label: "Universo direito",
      items: [{ id: "v1", label: "Destino" }]
    },
    relations: [{ from: "u1", to: "v1", label: "associa" }],
    pairList: ["(Rótulo extenso, Destino)"]
  });
  await openCardAssistance(page, { initialProject });
  const block = page.locator(".runtime-relation-map-block");
  const sourceBeforeNode = block.locator(".runtime-relation-map-set-label").first();
  const resourceBefore = await block.boundingBox();
  const sourceBefore = await sourceBeforeNode.boundingBox();

  await selectCardMode(page, "edit");
  const resource = page.locator('[data-resource-edit-target="body:relation-map-1"]');
  await selectedResource(page, "body:relation-map-1").click();
  const source = resource.locator(".runtime-relation-map-set-label").first();
  expectSameBox(await block.boundingBox(), resourceBefore, "relation_map selecionado");
  expectSameBox(await source.boundingBox(), sourceBefore, "rótulo SVG preservado");
  await expect(source).toHaveCSS("visibility", "visible");

  const overlay = resource.locator(
    '.runtime-manual-svg-field[data-manual-edit-path="leftSet.label"]'
  );
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await overlay.fill("Conjunto de origem");
  await expect(source).toHaveCSS("visibility", "hidden");
  expectSameBox(await block.boundingBox(), resourceBefore, "relation_map durante digitação");
  const vectorTypography = await overlay.evaluate((node) => ({
    color: getComputedStyle(node).color,
    fontSize: Number.parseFloat(getComputedStyle(node).fontSize)
  }));
  expect(vectorTypography.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(vectorTypography.fontSize).toBeGreaterThan(8);
});

for (const viewportWidth of [320, 360, 390, 412]) {
  test(`runtime preserva card composite e textos editáveis em ${viewportWidth}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewportWidth, height: 800 });
    const initialProject = projectFixture();
    initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks.unshift({
      id: "heading-1",
      kind: "heading",
      value: "Conceito-chave"
    });
    initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0].title =
      "Conjunção lógica aplicada a uma situação conceitual extensa";
    await openCardAssistance(page, { initialProject });
    if (viewportWidth === 390) {
      await page.evaluate(() => globalThis.AraLearnTheme.setPreference("dark"));
      await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
    }

    const sheet = page.locator(".runtime-card-sheet");
    const renderedContent = page.locator(".runtime-card-rendered-content");
    const content = page.locator(".card-sheet-content");
    const viewSheetBox = await sheet.boundingBox();
    const viewRenderedBox = await renderedContent.boundingBox();
    const viewContentBox = await content.boundingBox();

    await selectCardMode(page, "edit");
    expectSameBox(await sheet.boundingBox(), viewSheetBox, `frame ${viewportWidth}px`);
    expectSameBox(
      await renderedContent.boundingBox(),
      viewRenderedBox,
      `conteúdo renderizado ${viewportWidth}px`
    );
    expectSameBox(await content.boundingBox(), viewContentBox, `conteúdo do card ${viewportWidth}px`);

    const paragraph = page.locator('[data-resource-edit-target="body:paragraph-1"]');
    const paragraphBox = await paragraph.boundingBox();
    const paragraphTypography = await editableTextMetrics(paragraph.locator(".runtime-paragraph"));
    await selectedResource(page, "body:paragraph-1").click();
    expectSameBox(
      await paragraph.boundingBox(),
      paragraphBox,
      `resource paragraph selecionado ${viewportWidth}px`
    );
    const paragraphField = paragraph.locator('[data-manual-edit-path="value"]');
    expect(await editableTextMetrics(paragraphField)).toEqual(paragraphTypography);
    const paragraphFieldBox = await paragraphField.boundingBox();
    await paragraphField.fill(
      "P e Q precisam permanecer verdadeiras mesmo quando esta frase ocupa mais de uma linha."
    );
    expectSameBox(
      await paragraphField.boundingBox(),
      paragraphFieldBox,
      `texto do paragraph durante digitação ${viewportWidth}px`
    );
    expectSameBox(
      await paragraph.boundingBox(),
      paragraphBox,
      `resource paragraph durante digitação ${viewportWidth}px`
    );
    await page.locator('[data-action="cancel-manual-card-edit"]').click();

    const heading = page.locator('[data-resource-edit-target="body:heading-1"]');
    const headingBox = await heading.boundingBox();
    const headingTypography = await editableTextMetrics(heading.locator(".runtime-heading"));
    await selectedResource(page, "body:heading-1").click();
    expectSameBox(
      await heading.boundingBox(),
      headingBox,
      `resource heading selecionado ${viewportWidth}px`
    );
    const headingField = heading.locator('[data-manual-edit-path="value"]');
    expect(await editableTextMetrics(headingField)).toEqual(headingTypography);
    const headingFieldBox = await headingField.boundingBox();
    await headingField.fill("Conceito-chave ajustado");
    expectSameBox(
      await headingField.boundingBox(),
      headingFieldBox,
      `texto do heading durante digitação ${viewportWidth}px`
    );
    expectSameBox(
      await heading.boundingBox(),
      headingBox,
      `resource heading durante digitação ${viewportWidth}px`
    );
    await page.locator('[data-action="cancel-manual-card-edit"]').click();

    const title = page.locator("button.runtime-card-title");
    const titleBox = await title.boundingBox();
    await title.click();
    const titleEditor = page.locator(".runtime-card-manual-editor.is-card-title-editor");
    expectSameBox(
      await titleEditor.boundingBox(),
      titleBox,
      `título do card selecionado ${viewportWidth}px`
    );
    const titleField = titleEditor.locator('[data-manual-edit-key="title"]');
    const titleFieldBox = await titleField.boundingBox();
    await titleField.fill(
      "Conjunção lógica ajustada sem alterar a altura reservada pelo título original"
    );
    expectSameBox(
      await titleField.boundingBox(),
      titleFieldBox,
      `título durante digitação ${viewportWidth}px`
    );
    expectSameBox(
      await titleEditor.boundingBox(),
      titleBox,
      `card durante edição do título ${viewportWidth}px`
    );
    await captureVisualStep(page, `runtime-title-edit-${viewportWidth}`);
    await page.locator('[data-action="cancel-manual-card-edit"]').click();

    await selectCardMode(page, "ai");
    const aiSheetBox = await sheet.boundingBox();
    const aiRenderedBox = await renderedContent.boundingBox();
    const aiContentBox = await content.boundingBox();
    const aiParagraphBox = await page.locator(
      '[data-resource-edit-target="body:paragraph-1"]'
    ).boundingBox();
    await openCardAiComposer(page);
    await expect(sheet.locator(".runtime-card-authoring")).toHaveCount(0);
    await expect(page.locator(
      ".study-reader-footer > .runtime-card-authoring"
    )).toBeVisible();
    expectSameBox(await sheet.boundingBox(), aiSheetBox, `frame com prompt ${viewportWidth}px`);
    expectSameBox(
      await renderedContent.boundingBox(),
      aiRenderedBox,
      `conteúdo renderizado com prompt ${viewportWidth}px`
    );
    expectSameBox(
      await content.boundingBox(),
      aiContentBox,
      `conteúdo do composite com prompt ${viewportWidth}px`
    );
    expectSameBox(
      await page.locator('[data-resource-edit-target="body:paragraph-1"]').boundingBox(),
      aiParagraphBox,
      `resource com prompt ${viewportWidth}px`
    );
    await page.locator('[data-field="assist-prompt"]').fill(
      "Reescreva apenas os resources selecionados, mantendo a intenção didática e a notação do card."
    );
    expectSameBox(await sheet.boundingBox(), aiSheetBox, `frame ao digitar prompt ${viewportWidth}px`);
    expectSameBox(
      await renderedContent.boundingBox(),
      aiRenderedBox,
      `conteúdo renderizado ao digitar prompt ${viewportWidth}px`
    );
    expectSameBox(
      await content.boundingBox(),
      aiContentBox,
      `conteúdo do composite ao digitar prompt ${viewportWidth}px`
    );
    const viewportGeometry = await page.evaluate(() => {
      const bounds = (node) => {
        const rect = node?.getBoundingClientRect();
        return rect
          ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
          : null;
      };
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        innerHeight: window.innerHeight,
        dock: bounds(document.querySelector(".study-reader-footer")),
        composer: bounds(document.querySelector(".runtime-card-authoring"))
      };
    });
    expect(viewportGeometry.scrollWidth).toBeLessThanOrEqual(viewportGeometry.clientWidth + 1);
    for (const bounds of [viewportGeometry.dock, viewportGeometry.composer]) {
      expect(bounds).not.toBeNull();
      expect(bounds.left).toBeGreaterThanOrEqual(-1);
      expect(bounds.right).toBeLessThanOrEqual(viewportGeometry.clientWidth + 1);
      expect(bounds.top).toBeGreaterThanOrEqual(-1);
      expect(bounds.bottom).toBeLessThanOrEqual(viewportGeometry.innerHeight + 1);
    }
    await captureVisualStep(page, `runtime-ai-overlay-${viewportWidth}`);
  });
}

test("mudança concorrente durante o reparo não produz gravação parcial", async ({ page }) => {
  await openCardAssistance(page, { holdProvider: true });
  await selectCardMode(page, "ai");
  await selectedResource(page, "body:paragraph-1").click();
  await openCardAiComposer(page);
  await page.locator('[data-field="assist-prompt"]').fill("Corrija o parágrafo.");
  await page.locator('[data-action="submit-card-assistance"]').click();

  await expect.poll(() => page.evaluate(
    () => globalThis.__cardAssistanceProbe.providerCalls.length
  )).toBe(1);
  await expect.poll(() => page.evaluate(
    () => typeof globalThis.__cardAssistanceProbe.releaseProvider
  )).toBe("function");
  await page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    probe.localDraftRevision = "external-revision";
    probe.releaseProvider();
  });

  await expect(page.getByText("O curso mudou enquanto o reparo era preparado.", {
    exact: true
  })).toBeVisible();
  const result = await probeSnapshot(page);
  expect(result.saveCalls).toEqual([]);
  expect(result.cards[0].blocks[0].value).toBe("P e Q precisam ser verdadeiras.");
  expect(result.guardAttempts).toEqual([{
    expectedRevision: null,
    actualRevision: "external-revision"
  }]);
});

test("table preserva a moldura e oferece rolagem interna durante edição longa", async ({ page }) => {
  const initialProject = projectFixture();
  initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks.unshift({
    id: "table-1",
    kind: "table",
    columns: ["Conceito", "Descrição"],
    rows: [
      ["Conjunção", "Verdadeira somente quando as duas proposições são verdadeiras."],
      ["Disjunção", "Verdadeira quando ao menos uma proposição é verdadeira."]
    ]
  });
  await openCardAssistance(page, { initialProject });
  await selectCardMode(page, "edit");

  const resource = page.locator('[data-resource-edit-target="body:table-1"]');
  const frameBefore = await resource.boundingBox();
  await selectedResource(page, "body:table-1").click();
  expectSameBox(await resource.boundingBox(), frameBefore, "table selecionada");

  const longText = Array.from(
    { length: 28 },
    (_value, index) => `Linha ${index + 1} com uma explicação suficientemente longa.`
  ).join("\n");
  await resource.locator('[data-manual-edit-path="rows[0][1]"]').fill(longText);
  expectSameBox(await resource.boundingBox(), frameBefore, "table após texto longo");

  const scrollState = await resource.evaluate((root) => {
    const scrollable = [...root.querySelectorAll("*")].find((node) => {
      const style = getComputedStyle(node);
      return (
        node.scrollHeight > node.clientHeight + 1 &&
        [style.overflowY, style.overflow].some((value) => /^(auto|scroll)$/u.test(value))
      );
    });
    if (!(scrollable instanceof HTMLElement)) return null;
    scrollable.scrollTop = scrollable.scrollHeight;
    return {
      clientHeight: scrollable.clientHeight,
      scrollHeight: scrollable.scrollHeight,
      scrollTop: scrollable.scrollTop
    };
  });
  expect(scrollState).not.toBeNull();
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight + 1);
  expect(scrollState.scrollTop).toBeGreaterThan(0);
});

test("flow preserva a moldura e edita nós e rótulos de ramo na própria superfície", async ({ page }) => {
  const initialProject = projectFixture();
  initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks.unshift({
    id: "flow-1",
    kind: "flow",
    prompt: "Acompanhe a decisão.",
    structure: {
      id: "flow-root",
      kind: "sequence",
      items: [{
        id: "decision-1",
        kind: "if_then_else",
        condition: "Usuário autenticado?",
        thenBranch: [{
          id: "allow-1",
          kind: "process",
          text: "Liberar acesso"
        }],
        elseBranch: [{
          id: "deny-1",
          kind: "process",
          text: "Negar acesso"
        }]
      }]
    }
  });
  await openCardAssistance(page, { initialProject });
  await selectCardMode(page, "edit");

  const resource = page.locator('[data-resource-edit-target="body:flow-1"]');
  const frameBefore = await resource.boundingBox();
  await selectedResource(page, "body:flow-1").click();
  expectSameBox(await resource.boundingBox(), frameBefore, "flow selecionado");

  const expectedPaths = [
    "prompt",
    "structure.items[0].condition",
    "structure.items[0].branchLabels.yes",
    "structure.items[0].branchLabels.no",
    "structure.items[0].thenBranch[0].text",
    "structure.items[0].elseBranch[0].text"
  ];
  for (const path of expectedPaths) {
    await expect(resource.locator(`[data-manual-edit-path="${path}"]`).first()).toBeVisible();
  }

  await resource.locator(
    '[data-manual-edit-path="structure.items[0].branchLabels.yes"]:not(.is-manual-edit-proxied-source)'
  ).fill("Autorizado");
  await resource.locator(
    '[data-manual-edit-path="structure.items[0].branchLabels.no"]:not(.is-manual-edit-proxied-source)'
  ).fill("Recusado");
  await resource.locator(
    '[data-manual-edit-path="structure.items[0].thenBranch[0].text"]:not(.is-manual-edit-proxied-source)'
  ).fill("Abrir sessão");
  expectSameBox(await resource.boundingBox(), frameBefore, "flow após editar rótulos");

  await page.locator('[data-action="save-manual-card-edit"]').click();
  await expect.poll(() => page.evaluate(() => {
    const flow = globalThis.__cardAssistanceProbe.project.courses[0].modules[0]
      .lessons[0].microsequences[0].cards[0].blocks
      .find((block) => block.id === "flow-1");
    return flow?.structure?.items?.[0]?.branchLabels || null;
  })).toEqual({ yes: "Autorizado", no: "Recusado" });

  await selectCardMode(page, "ai");
  const aiFrameBefore = await resource.boundingBox();
  await selectedResource(page, "body:flow-1").click();
  await expect(resource).toHaveClass(/is-selected/u);
  expectSameBox(await resource.boundingBox(), aiFrameBefore, "flow selecionado para IA");
});

test("draft de paragraph com gap restaura a lacuna visual sem expor o contrato", async ({ page }) => {
  const initialProject = projectFixture();
  const card = initialProject.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  card.kind = "exercise";
  card.exercise = "gap";
  card.blocks[0].value = "Use [[conjunção::disjunção|negação]] neste contexto.";
  await openCardAssistance(page, { initialProject });
  await selectCardMode(page, "edit");
  await selectedResource(page, "body:paragraph-1").click();

  const resource = page.locator('[data-resource-edit-target="body:paragraph-1"]');
  const field = resource.locator('[data-manual-edit-path="value"]');
  await expect(field.locator(".runtime-text-gap-blank")).toHaveCount(1);
  await field.evaluate((node) => {
    const paragraph = node.matches("p") ? node : node.querySelector("p");
    const firstText = paragraph?.firstChild;
    if (!(firstText instanceof Text)) throw new Error("Texto anterior à lacuna não encontrado.");
    firstText.data = firstText.data.replace("Use", "Aplique");
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  });

  await page.evaluate(() => globalThis.__cardAssistanceApp.refreshPersonalState());

  const restored = resource.locator('[data-manual-edit-path="value"]');
  await expect(restored).toContainText("Aplique");
  await expect(restored.locator(".runtime-text-gap-blank")).toHaveCount(1);
  await expect(restored).not.toContainText("[[");
  await expect(restored).not.toContainText("]]");
});
