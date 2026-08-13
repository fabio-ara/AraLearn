import { expect, test } from "@playwright/test";

import { homeTrailSnapshotForProject } from "../support/homeTrailSnapshot.js";

function guide(goal) {
  return {
    goal,
    include: ["conjunção"],
    exclude: ["lógica de predicados"],
    notation: ["Use P ∧ Q."],
    avoid: ["Não pressupor lógica formal."]
  };
}

function projectFixture() {
  return {
    contract: "aralearn.library.v1",
    scope: "course",
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
          topics: [{
            id: "topic-conjuncao",
            label: "conjunção",
            kind: "concept",
            checks: ["reconhece o caso verdadeiro"],
            errors: ["confunde com disjunção"]
          }],
          microsequences: [{
            id: "micro-a",
            title: "Regra",
            goal: "Reconhecer o caso verdadeiro.",
            role: "explain",
            branchOf: null,
            dependsOn: [],
            covers: ["conjunção"],
            checks: ["identifica V e V"],
            errors: [],
            cards: [{
              id: "card-a",
              position: 1,
              title: "Conjunção",
              role: "theory",
              content: [{
                id: "paragraph-1",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "P e Q precisam ser verdadeiras." }
              }, {
                id: "code-1",
                package: "aralearn.resource.code",
                version: "1.0.0",
                data: { prompt: "Notação", language: "text", code: "P ∧ Q" }
              }, {
                id: "paragraph-2",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Somente V e V produz V." }
              }],
              response: null,
              feedback: [{
                id: "support-1",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Compare com a disjunção." }
              }],
              topics: ["conjunção"],
              sources: []
            }, {
              id: "card-b",
              position: 2,
              title: "Card vizinho",
              role: "theory",
              content: [{
                id: "paragraph-b",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Este card permanece somente leitura." }
              }],
              response: null,
              feedback: [],
              topics: ["conjunção"],
              sources: []
            }]
          }]
        }]
      }]
    }]
  };
}

async function bootAuthoring(page) {
  const initialProject = projectFixture();
  const trailSnapshot = homeTrailSnapshotForProject(initialProject, {
    permissions: {
      "course-a": {
        origin: "private",
        canEdit: true,
        canDelete: true,
        canRemove: true,
        cardCount: 2
      }
    }
  });
  // O cenário monta o editor diretamente: carregue um documento mínimo para
  // que o bootstrap completo do aplicativo não dispute a mesma raiz.
  await page.route("**/", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles-tokens.css"><link rel="stylesheet" href="/styles-shell-baseline.css"><link rel="stylesheet" href="/styles.css"></head><body><div id="app-root"></div></body></html>'
    });
  });
  await page.goto("/");
  try {
    await page.evaluate(async ({ initialProject, trailSnapshot }) => {
    const oldRoot = document.querySelector("#app-root");
    const root = document.createElement("div");
    root.id = "app-root";
    oldRoot.replaceWith(root);
    const probe = {
      project: structuredClone(initialProject),
      saves: [],
      providerCalls: [],
      localState: null,
      revision: null
    };
    const storage = {
      loadProject: () => structuredClone(probe.project),
      saveProject: async (next) => { probe.project = structuredClone(next); },
      flush: async () => undefined,
      createLocalCourseDraftGuard: (courseKey) => ({
        contract: "aralearn.local-course-draft-guard.v1",
        courseId: "11111111-1111-4111-8111-111111111111",
        courseKey,
        expectedRevision: probe.revision
      }),
      getLocalCourseDraft: async () => probe.revision ? ({
        courseId: "11111111-1111-4111-8111-111111111111",
        courseKey: "course-a",
        revision: probe.revision,
        baseContentHash: "a".repeat(64)
      }) : null,
      loadCardAssistanceLocalState: async () => structuredClone(probe.localState),
      saveCardAssistanceLocalState: async (_courseKey, value) => {
        probe.localState = structuredClone(value);
        return structuredClone(value);
      },
      saveMicrosequenceGeneration: async (next, microsequenceId, options = {}) => {
        probe.project = structuredClone(next);
        probe.revision = `revision-${probe.saves.length + 1}`;
        probe.localState = structuredClone(options.cardAssistanceLocalState);
        if (probe.localState?.undo) probe.localState.undo.expectedRevision = probe.revision;
        probe.saves.push({ method: "saveMicrosequenceGeneration", microsequenceId });
      },
      saveProjectWithCardAssistanceState: async (next, options = {}) => {
        probe.project = structuredClone(next);
        probe.revision = `revision-${probe.saves.length + 1}`;
        probe.localState = structuredClone(options.localState);
        if (probe.localState?.undo) probe.localState.undo.expectedRevision = probe.revision;
        probe.saves.push({ method: "saveProjectWithCardAssistanceState" });
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
      loadReviewItems: () => [],
      isCardMarkedForReview: () => false,
      setCardReviewMark: async () => undefined,
      loadCommentForPath: () => null,
      saveCommentForPath: async () => undefined,
      deleteCommentForPath: async () => undefined
    };
    const assistProvider = {
      async generateStructured(request) {
        probe.providerCalls.push({ phase: request.phase, prompt: request.prompt });
        if (request.phase !== "package_card_assistance_repair") {
          throw new Error(`Fase inesperada: ${request.phase}`);
        }
        const envelope = JSON.parse(request.prompt);
        const current = structuredClone(probe.project.courses[0].modules[0]
          .lessons[0].microsequences[0].cards[0]);
        if (envelope.repairScope === "card") {
          current.title = "Conjunção revisada";
          current.content[0].data.text = "P e Q são verdadeiras ao mesmo tempo.";
        } else {
          current.content[0].data.text = "P e Q devem ser simultaneamente verdadeiras.";
        }
        return { value: { card: current } };
      }
    };
    globalThis.__packageAuthoringProbe = probe;
    const [{ createEditorSession }, { createLessonEditorApp }] = await Promise.all([
      import("/src/editor/contractEditor.js"),
      import("/src/ui/lessonEditorApp.js")
    ]);
      createLessonEditorApp({
        root,
        storage,
        editor: createEditorSession(storage),
        initialProject: probe.project,
        assistProvider,
        homeTrails: { loadTrailSnapshot: async () => structuredClone(trailSnapshot) },
        trailPersonalStateFactory: () => storage
      });
    }, { initialProject, trailSnapshot });
  } catch (error) {
    // O Chromium móvel pode substituir o mundo de execução ao concluir imports
    // dinâmicos. Só aceite esse caso se a montagem abaixo tiver sobrevivido.
    if (!String(error?.message || error).includes("Execution context was destroyed")) throw error;
  }
  await expect(page.locator('[data-action="open-course"]')).toBeVisible();
}

async function openFirstCard(page) {
  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').click();
  await page.locator('[data-action="open-microsequence-card"][data-card-index="0"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção");
}

async function selectMode(page, mode) {
  await page.locator(
    `[data-action="select-entity-mode"][data-entity-level="card"]` +
    `[data-entity-mode="${mode}"]`
  ).click();
}

function packageTarget(page, targetId) {
  return page.locator(
    `[data-action="toggle-card-assistance-resource"]` +
    `[data-resource-target-id="${targetId}"]`
  );
}

test("autoria navega até o mesmo card renderizado no Estudo", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await expect(page.getByText("P e Q precisam ser verdadeiras.", { exact: true })).toBeVisible();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.getByText("Compare com a disjunção.", { exact: true })).toBeVisible();
});

test("Editar seleciona instâncias por identidade de package", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "edit");
  await expect(packageTarget(page, "content:paragraph-1")).toBeVisible();
  await expect(packageTarget(page, "content:code-1")).toBeVisible();
  await expect(packageTarget(page, "feedback:support-1")).toBeVisible();
  await expect(page.locator('[data-resource-target-id^="body:"]')).toHaveCount(0);
  await expect(page.locator('[data-resource-target-id="after:text"]')).toHaveCount(0);
});

test("edição manual altera só data e preserva o package", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "edit");
  await packageTarget(page, "content:paragraph-1").click();
  const field = page.locator(
    '[data-resource-edit-target="content:paragraph-1"] [data-manual-edit-path="text"]'
  );
  await expect(field).toBeEditable();
  await field.fill("As duas proposições precisam ser verdadeiras.");
  await page.locator('[data-action="save-manual-card-edit"]').click();
  const result = await page.evaluate(() => {
    const card = globalThis.__packageAuthoringProbe.project.courses[0].modules[0]
      .lessons[0].microsequences[0].cards[0];
    return { instance: card.content[0], saves: globalThis.__packageAuthoringProbe.saves };
  });
  expect(result.instance).toEqual({
    id: "paragraph-1",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "As duas proposições precisam ser verdadeiras." }
  });
  expect(result.saves).toHaveLength(1);
});

test("edição manual alcança feedback sem projeção after", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "edit");
  await packageTarget(page, "feedback:support-1").click();
  const field = page.locator(
    '[data-resource-edit-target="feedback:support-1"] [data-manual-edit-path="text"]'
  );
  await field.fill("Compare agora com a operação de disjunção.");
  await page.locator('[data-action="save-manual-card-edit"]').click();
  expect(await page.evaluate(() => globalThis.__packageAuthoringProbe.project.courses[0]
    .modules[0].lessons[0].microsequences[0].cards[0].feedback[0].data.text))
    .toBe("Compare agora com a operação de disjunção.");
});

test("IA repara o card inteiro no contrato por packages e permite desfazer", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "ai");
  await page.locator('[data-action="toggle-card-assistance-whole-card"]').click();
  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  await page.locator('[data-field="assist-prompt"]').fill("Torne a explicação mais direta.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.getByText("Conjunção revisada", { exact: true })).toBeVisible();
  const applied = await page.evaluate(() => ({
    card: structuredClone(globalThis.__packageAuthoringProbe.project.courses[0]
      .modules[0].lessons[0].microsequences[0].cards[0]),
    calls: structuredClone(globalThis.__packageAuthoringProbe.providerCalls)
  }));
  expect(applied.calls.map(({ phase }) => phase)).toEqual([
    "package_card_assistance_repair"
  ]);
  expect(applied.card.content[0].package).toBe("aralearn.resource.paragraph");
  await page.locator('[data-action="undo-card-edit"]').click();
  await expect(page.getByText("Conjunção", { exact: true })).toBeVisible();
});

test("IA limitada ao resource não altera título nem feedback", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "ai");
  await packageTarget(page, "content:paragraph-1").click();
  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  await page.locator('[data-field="assist-prompt"]').fill("Simplifique somente este texto.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.getByText(
    "P e Q devem ser simultaneamente verdadeiras.", { exact: true }
  )).toBeVisible();
  const card = await page.evaluate(() => structuredClone(
    globalThis.__packageAuthoringProbe.project.courses[0].modules[0]
      .lessons[0].microsequences[0].cards[0]
  ));
  expect(card.title).toBe("Conjunção");
  expect(card.feedback[0].data.text).toBe("Compare com a disjunção.");
});

test("IA mantém conversa de reparo no mesmo card sem persistir o diálogo", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "ai");
  await packageTarget(page, "content:paragraph-1").click();
  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  const prompt = page.locator('[data-field="assist-prompt"]');
  await prompt.fill("Primeiro, situe o conceito.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveValue("");
  await expect(page.locator(".card-assistance-conversation")).toContainText("Primeiro, situe o conceito.");
  await prompt.fill("Agora acrescente um exemplo curto.");
  await page.locator('[data-action="submit-card-assistance"]').click();

  const probe = await page.evaluate(() => ({
    calls: structuredClone(globalThis.__packageAuthoringProbe.providerCalls),
    localState: structuredClone(globalThis.__packageAuthoringProbe.localState)
  }));
  expect(probe.calls).toHaveLength(2);
  const secondEnvelope = JSON.parse(probe.calls[1].prompt);
  expect(secondEnvelope.priorRepairConversation).toHaveLength(1);
  expect(secondEnvelope.priorRepairConversation[0].userRequest)
    .toBe("Primeiro, situe o conceito.");
  expect(secondEnvelope.userRequest).toBe("Agora acrescente um exemplo curto.");
  expect(JSON.stringify(probe.localState)).not.toContain("Primeiro, situe o conceito.");
  expect(JSON.stringify(probe.localState)).not.toContain("Agora acrescente um exemplo curto.");
});

for (const width of [320, 360, 390, 412]) {
  test(`autoria por packages permanece contida em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await bootAuthoring(page);
    await openFirstCard(page);
    await selectMode(page, "edit");
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      card: document.querySelector(".runtime-card-sheet")?.getBoundingClientRect().width || 0
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.card).toBeLessThanOrEqual(geometry.viewport + 1);
  });
}
