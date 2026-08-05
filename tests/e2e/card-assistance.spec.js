import { expect, test } from "@playwright/test";

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
  await page.screenshot({ path: `.pages/v9-audit/v9-${name}.png` });
}

async function openCardAssistance(page, {
  holdProvider = false,
  captureHierarchy = false,
  stopAtLesson = false,
  stopAtMicrosequence = false
} = {}) {
  await page.goto("/");
  await page.evaluate(async ({ initialProject, holdProvider }) => {
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
      loadStudyPaths: () => [],
      isCardMarkedForReview: () => false,
      setCardReviewMark: async () => undefined,
      loadCommentForPath: () => null,
      saveCommentForPath: async () => undefined,
      deleteCommentForPath: async () => undefined
    };

    const assistProvider = {
      async generateStructured(request) {
        probe.providerCalls.push({
          phase: request.phase,
          task: request.engineContext?.task,
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
      assistProvider
    });
  }, {
    initialProject: projectFixture(),
    holdProvider
  });

  await expect(page.locator('[data-field="home-course-select"]')).toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "home");
  await page.locator('[data-action="open-course"]').click();
  await expect(page.locator('.navigation-list[data-structure-collection="module"]'))
    .toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "course");
  await page.locator('[data-action="open-module"]').click();
  await expect(page.locator('.navigation-list[data-structure-collection="lesson"]'))
    .toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "module");
  await page.locator('[data-action="open-lesson"]').click();
  await expect(page.locator('.navigation-list[data-structure-collection="microsequence"]'))
    .toBeVisible();
  if (captureHierarchy) await captureVisualStep(page, "lesson");
  if (stopAtLesson) return;
  await page.locator('[data-action="open-microsequence-overview"]').click();
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

function selectedResource(page, targetId) {
  return page.locator(
    `[data-action="toggle-card-assistance-resource"][data-resource-target-id="${targetId}"]`
  );
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
    "bottom_up_targets",
    "card_assistance_representation",
    "card_assistance_build"
  ]);
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

  const authoring = page.locator(".runtime-card-authoring");
  await expect(authoring).toBeVisible();
  await expect(authoring.locator('input[type="file"]')).toHaveCount(0);

  const submit = page.locator('[data-action="submit-card-assistance"]');
  await expect(submit).toBeDisabled();
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
    writableTargetIds: ["body:paragraph-1", "body:paragraph-2"]
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

test("edição manual ocorre no recurso e compartilha o desfazer direto", async ({ page }) => {
  await openCardAssistance(page);
  await selectCardMode(page, "edit");

  const resource = page.locator(
    '[data-resource-edit-target="body:paragraph-1"]'
  );
  const geometryBefore = await resource.boundingBox();
  await selectedResource(page, "body:paragraph-1").click();
  const geometryDuring = await resource.boundingBox();
  expect(geometryBefore).not.toBeNull();
  expect(geometryDuring).not.toBeNull();
  expect(Math.abs(geometryDuring.width - geometryBefore.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometryDuring.height - geometryBefore.height)).toBeLessThanOrEqual(1);
  await expect(resource.locator(".runtime-resource-selection-content.is-editing-base"))
    .toBeAttached();
  for (const action of ["open-resource-observation", "save-manual-card-edit"]) {
    const actionBox = await resource.locator(`[data-action="${action}"]`).boundingBox();
    expect(actionBox).not.toBeNull();
    expect(actionBox.x).toBeGreaterThanOrEqual(geometryDuring.x - 1);
    expect(actionBox.y).toBeGreaterThanOrEqual(geometryDuring.y - 1);
    expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(
      geometryDuring.x + geometryDuring.width + 1
    );
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(
      geometryDuring.y + geometryDuring.height + 1
    );
  }
  await expect(page.locator(
    ".microsequence-workbench-screen > .topbar [data-action='go-back']"
  )).toBeInViewport();
  await expect(page.locator(
    '.entity-mode-switcher [data-entity-mode="edit"]'
  )).toBeInViewport();
  await captureVisualStep(page, "card-resource-edit");
  const field = page.locator('[data-manual-edit-key="value"]');
  await expect(field).toHaveValue("P e Q precisam ser verdadeiras.");
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

  await page.locator('[data-action="undo-card-edit"]').click();
  await expect(page.getByText("P e Q precisam ser verdadeiras.", { exact: true }))
    .toBeVisible();
  await expect.poll(async () => (await probeSnapshot(page)).saveCalls.length).toBe(2);
  result = await probeSnapshot(page);
  expect(result.cards[0].blocks[0].value).toBe("P e Q precisam ser verdadeiras.");
});

test("mudança concorrente durante o reparo não produz gravação parcial", async ({ page }) => {
  await openCardAssistance(page, { holdProvider: true });
  await selectCardMode(page, "ai");
  await selectedResource(page, "body:paragraph-1").click();
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
