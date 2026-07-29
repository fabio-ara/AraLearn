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
                { id: "paragraph-1", kind: "paragraph", value: "P e Q precisam ser verdadeiras." },
                { id: "code-1", kind: "code", prompt: "Notação", language: "text", code: "P ∧ Q" },
                { id: "paragraph-2", kind: "paragraph", value: "Somente V e V produz V." }
              ],
              after: ""
            }, {
              id: "card-b",
              position: 2,
              resource: "paragraph",
              kind: "theory",
              exercise: "none",
              title: "Card vizinho",
              text: "Este card não pertence ao pedido granular.",
              after: ""
            }]
          }]
        }]
      }]
    }]
  };
}

async function openGranularWorkbench(page, { granularPersistence = true } = {}) {
  await page.goto("/");
  await page.evaluate(async ({ initialProject, granularPersistence }) => {
    const oldRoot = document.querySelector("#app-root");
    const root = document.createElement("div");
    root.id = "app-root";
    oldRoot.replaceWith(root);
    const probe = {
      project: structuredClone(initialProject),
      saveCalls: 0,
      providerCalls: 0,
      failNext: false,
      holdNext: false,
      releaseProvider: null
    };
    const storage = {
      loadProject: () => structuredClone(probe.project),
      saveProject: async (next) => {
        probe.saveCalls += 1;
        probe.project = structuredClone(next);
      },
      coursePermissions: () => ({ role: "owner", canEdit: true, canDelete: false }),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress: async () => undefined,
      loadStudyPaths: () => [],
      recordCardView: async () => undefined,
      recordCardAttempt: async () => undefined,
      loadCommentForPath: () => ({ body: "" }),
      saveCommentForPath: async () => undefined
    };
    if (granularPersistence) {
      storage.saveMicrosequenceGeneration = async (next) => {
        probe.saveCalls += 1;
        probe.project = structuredClone(next);
      };
    }
    const assistProvider = {
      async generateText(request) {
        probe.providerCalls += 1;
        if (probe.failNext) {
          probe.failNext = false;
          throw new Error("Falha transitória simulada.");
        }
        if (probe.holdNext) {
          probe.holdNext = false;
          await new Promise((resolve) => { probe.releaseProvider = resolve; });
          probe.releaseProvider = null;
        }
        const target = request.engineContext?.target;
        if (target?.level === "card") {
          const card = structuredClone(target.card);
          card.title = "Conjunção revista";
          return { text: JSON.stringify({ card }), usage: {} };
        }
        const blocks = (target?.selectedBlocks || []).map(({ blockIndex, block }) => ({
          blockIndex,
          block: {
            ...structuredClone(block),
            ...(block.kind === "paragraph"
              ? { value: `Alteração granular ${blockIndex + 1}.` }
              : {})
          }
        }));
        return { text: JSON.stringify({ blocks }), usage: {} };
      }
    };
    globalThis.__granularProbe = probe;
    const { createEditorSession } = await import("./src/editor/contractEditor.js");
    const { createLessonEditorApp } = await import("./src/ui/lessonEditorApp.js");
    globalThis.__granularApp = createLessonEditorApp({
      root,
      storage,
      editor: createEditorSession(storage),
      initialProject: probe.project,
      assistProvider
    });
  }, { initialProject: projectFixture(), granularPersistence });

  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="play-microsequence"]').click();
  await page.locator('[data-action="select-workbench-pane"][data-workbench-pane="edit"]').click();
  await expect(page.locator(".workbench-surface")).toHaveAttribute("data-workbench-pane", "edit");
}

async function requestBlockPreview(page) {
  await page.locator('[data-action="select-assist-scope"][data-scope-mode="microsequence"]').click();
  await page.locator('[data-action="select-assist-scope"][data-scope-mode="blocks"]').click();
  const submit = page.locator('[data-action="apply-assist"]');
  await expect(submit).toBeDisabled();
  await page.locator('[data-action="toggle-assist-block"][data-block-index="0"]').click();
  await page.locator('[data-action="toggle-assist-block"][data-block-index="2"]').click();
  await page.locator('[data-field="assist-prompt"]').fill("Aprimore somente os blocos selecionados.");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('[data-role="granular-preview"]')).toBeVisible();
}

test("prévia granular só persiste depois de aplicar e pode ser descartada", async ({ page }) => {
  await openGranularWorkbench(page);
  await requestBlockPreview(page);

  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.saveCalls)).toBe(0);
  await expect.poll(() => page.evaluate(() =>
    globalThis.__granularProbe.project.courses[0].modules[0].lessons[0]
      .microsequences[0].cards[0].blocks[0].value
  )).toBe("P e Q precisam ser verdadeiras.");
  await page.locator('[data-action="discard-granular-preview"]').click();
  await expect(page.locator('[data-role="granular-preview"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.saveCalls)).toBe(0);

  await requestBlockPreview(page);
  await page.locator('[data-action="apply-granular-preview"]').click();
  await expect(page.locator('[data-role="granular-preview"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.saveCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() =>
    globalThis.__granularProbe.project.courses[0].modules[0].lessons[0]
      .microsequences[0].cards[0].blocks[0].value
  )).toBe("Alteração granular 1.");
  await expect.poll(() => page.evaluate(() =>
    globalThis.__granularProbe.project.courses[0].modules[0].lessons[0]
      .microsequences[0].cards[0].blocks[2].value
  )).toBe("Alteração granular 3.");
  await expect(page.locator(".workbench-surface")).toHaveAttribute("data-workbench-pane", "preview");
  await expect(page.locator('[data-action="next-card"]')).toBeVisible();
  await expect(page.locator('[data-action="select-workbench-pane"]')).toHaveCount(2);
});

test("falha do provedor não cria prévia nem grava o curso", async ({ page }) => {
  await openGranularWorkbench(page);
  await page.evaluate(() => { globalThis.__granularProbe.failNext = true; });
  await page.locator('[data-action="select-assist-scope"][data-scope-mode="card"]').click();
  await page.locator('[data-field="assist-prompt"]').fill("Revise o card.");
  await page.locator('[data-action="apply-assist"]').click();

  await expect(page.locator('[data-role="granular-preview"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.saveCalls)).toBe(0);
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.providerCalls)).toBe(1);
  await expect(page.locator('[data-field="assist-feedback"]')).toContainText("Falha transitória simulada");
});

test("prévia não pode ser aplicada quando o card mudou depois da chamada", async ({ page }) => {
  await openGranularWorkbench(page);
  await page.locator('[data-action="select-assist-scope"][data-scope-mode="card"]').click();
  await page.locator('[data-field="assist-prompt"]').fill("Revise o card.");
  await page.locator('[data-action="apply-assist"]').click();
  await expect(page.locator('[data-role="granular-preview"]')).toBeVisible();

  await page.evaluate(() => {
    const changed = structuredClone(globalThis.__granularProbe.project);
    changed.courses[0].modules[0].lessons[0].microsequences[0]
      .cards[0].blocks[0].value = "Mudança concorrente.";
    globalThis.__granularProbe.project = structuredClone(changed);
    globalThis.__granularApp.replaceProject(changed);
  });
  await page.locator('[data-action="apply-granular-preview"]').click();

  await expect(page.locator('[data-role="granular-preview"]')).toHaveAttribute("data-stale", "true");
  await expect(page.locator('[data-action="apply-granular-preview"]')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.saveCalls)).toBe(0);
  await expect(page.locator('[data-role="granular-preview"]')).toContainText("mudaram desde a tentativa anterior");
  await page.locator('[data-action="discard-granular-preview"]').click();
  await expect(page.locator('[data-role="granular-preview"]')).toHaveCount(0);
});

test("ausência de persistência granular preserva a prévia e não usa saveProject", async ({ page }) => {
  await openGranularWorkbench(page, { granularPersistence: false });
  await page.locator('[data-action="select-assist-scope"][data-scope-mode="card"]').click();
  await page.locator('[data-field="assist-prompt"]').fill("Revise o card.");
  await page.locator('[data-action="apply-assist"]').click();
  await expect(page.locator('[data-role="granular-preview"]')).toBeVisible();

  await page.locator('[data-action="apply-granular-preview"]').click();

  await expect(page.locator('[data-role="granular-preview"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.saveCalls)).toBe(0);
  await expect(page.locator('[data-role="granular-preview"]')).toContainText(
    "persistência relacional granular não está disponível"
  );
});

test("resposta atrasada não cria prévia sobre um card que mudou durante a chamada", async ({ page }) => {
  await openGranularWorkbench(page);
  await page.evaluate(() => { globalThis.__granularProbe.holdNext = true; });
  await page.locator('[data-action="select-assist-scope"][data-scope-mode="card"]').click();
  await page.locator('[data-field="assist-prompt"]').fill("Revise o card.");
  await page.locator('[data-action="apply-assist"]').click();
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.providerCalls)).toBe(1);

  await page.evaluate(() => {
    const changed = structuredClone(globalThis.__granularProbe.project);
    changed.courses[0].modules[0].lessons[0].microsequences[0]
      .cards[0].blocks[0].value = "Mudança durante a chamada.";
    globalThis.__granularProbe.project = structuredClone(changed);
    globalThis.__granularApp.replaceProject(changed);
    globalThis.__granularProbe.releaseProvider();
  });

  await expect(page.locator('[data-role="granular-preview"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.__granularProbe.saveCalls)).toBe(0);
  await expect(page.locator('[data-field="assist-feedback"]')).toContainText(
    "mudaram desde a tentativa anterior"
  );
});
