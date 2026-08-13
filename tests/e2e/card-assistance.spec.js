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
        const envelope = JSON.parse(request.prompt);
        if (request.phase === "card_assistance_representation") {
          const candidate = envelope.candidates.find(({ id }) => (
            id.includes("aralearn.resource.code") &&
            id.endsWith("+theory")
          ));
          if (!candidate) throw new Error("O catálogo não ofereceu Código expositivo.");
          return { value: { candidateId: candidate.id } };
        }
        if (request.phase === "card_assistance_build") {
          const contentSpec = envelope.selectedComposition.resources.find(
            ({ slot }) => slot === "content"
          );
          return {
            value: {
              message: "Troquei a prosa por um exemplo curto de código.",
              card: {
                id: "card-a",
                position: 1,
                title: "Conjunção em código",
                role: "theory",
                content: [{
                  id: "card-a-content-1",
                  package: contentSpec.package,
                  version: contentSpec.version,
                  data: {
                    prompt: "Observe quando a conjunção é verdadeira.",
                    language: "javascript",
                    code: "const resultado = P && Q;"
                  }
                }],
                response: null,
                feedback: [],
                topics: ["conjunção"],
                sources: []
              }
            }
          };
        }
        if (request.phase !== "card_assistance_text_edit") {
          throw new Error(`Fase inesperada: ${request.phase}`);
        }
        const requestedText = envelope.userRequest;
        if (requestedText.startsWith("Explique sem alterar")) {
          return {
            value: {
              message: "A formulação atual já apresenta a distinção solicitada.",
              edits: []
            }
          };
        }
        const nextText = requestedText.startsWith("Primeiro")
          ? "Antes de aplicar a regra, identifique os valores de P e Q."
          : requestedText.startsWith("Agora")
            ? "Antes de aplicar a regra, identifique P e Q; por exemplo, V ∧ V produz V."
            : envelope.scope === "card"
              ? "P e Q são verdadeiras ao mesmo tempo."
              : "P e Q devem ser simultaneamente verdadeiras.";
        const edits = [{ path: "content[0].data.text", value: nextText }];
        if (envelope.scope === "card") {
          edits.unshift({ path: "title", value: "Conjunção revisada" });
        }
        return {
          value: {
            message: envelope.scope === "card"
              ? "Reescrevi o título e a explicação do card."
              : "Reescrevi o texto selecionado e preservei o restante do card.",
            edits
          }
        };
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
  if (!await page.locator(".runtime-card-title").isVisible()) {
    const lesson = page.locator('[data-action="open-lesson"]').first();
    if (await lesson.isVisible()) await lesson.click();
    const overview = page.locator('[data-action="open-microsequence-overview"]').first();
    if (await overview.isVisible()) await overview.click();
    const card = page.locator(
      '[data-action="open-microsequence-card"][data-card-index="0"]'
    ).first();
    if (await card.isVisible()) await card.click();
  }
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
  await expect(page.locator(".package-manual-editor-head")).toContainText("Textos editáveis");
  await expect(page.locator(".package-manual-editor-head")).toContainText("Texto explicado");
  await expect(page.locator(".package-manual-context")).not.toHaveAttribute("open", "");
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

test("chat edita o card e restaura versões anteriores e posteriores sem nova chamada", async ({ page }) => {
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
    "card_assistance_text_edit"
  ]);
  expect(applied.card.content[0].package).toBe("aralearn.resource.paragraph");
  const prompt = page.locator('[data-field="assist-prompt"]');
  await prompt.fill("Volte à versão anterior.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção");
  await expect.poll(() => page.evaluate(
    () => globalThis.__packageAuthoringProbe.providerCalls.length
  )).toBe(1);
  await prompt.fill("Refaça a versão seguinte.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção revisada");
  await page.locator('[data-action="undo-card-edit"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção");
  await page.locator('[data-action="redo-card-edit"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção revisada");
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

test("chat mantém conversa iterativa no mesmo card sem persistir o diálogo", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "ai");
  await packageTarget(page, "content:paragraph-1").click();
  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  await expect(page.locator(".card-assistance-scope")).toContainText("A IA pode alterar");
  await expect(page.locator(".card-assistance-scope")).toContainText("Texto");
  await expect(page.locator(".card-assistance-scope")).toContainText("Contexto somente leitura");
  const prompt = page.locator('[data-field="assist-prompt"]');
  await prompt.fill("Primeiro, situe o conceito.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(prompt).toBeVisible();
  await expect(prompt).toHaveValue("");
  await expect(page.locator(".card-assistance-conversation")).toContainText("Primeiro, situe o conceito.");
  await expect(page.locator(".card-assistance-conversation")).toContainText(
    "Reescrevi o texto selecionado e preservei o restante do card."
  );
  await expect(page.locator(".card-assistance-message-bubble.is-user")).toHaveCount(1);
  await expect(page.locator(".card-assistance-message-bubble.is-assistant")).toHaveCount(1);
  await prompt.fill("Agora acrescente um exemplo curto.");
  await page.locator('[data-action="submit-card-assistance"]').click();

  const probe = await page.evaluate(() => ({
    calls: structuredClone(globalThis.__packageAuthoringProbe.providerCalls),
    localState: structuredClone(globalThis.__packageAuthoringProbe.localState)
  }));
  expect(probe.calls).toHaveLength(2);
  const secondEnvelope = JSON.parse(probe.calls[1].prompt);
  expect(secondEnvelope.priorConversation).toHaveLength(1);
  expect(secondEnvelope.priorConversation[0].userRequest)
    .toBe("Primeiro, situe o conceito.");
  expect(secondEnvelope.priorConversation[0].assistantResponse)
    .toBe("Reescrevi o texto selecionado e preservei o restante do card.");
  expect(secondEnvelope.userRequest).toBe("Agora acrescente um exemplo curto.");
  expect(JSON.stringify(probe.localState)).not.toContain("Primeiro, situe o conceito.");
  expect(JSON.stringify(probe.localState)).not.toContain("Agora acrescente um exemplo curto.");
});

test("chat mantém explicação sem alteração na conversa e não persiste o curso", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "ai");
  await page.locator('[data-action="toggle-card-assistance-whole-card"]').click();
  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  const prompt = page.locator('[data-field="assist-prompt"]');
  await prompt.fill("Explique sem alterar por que este texto está adequado.");
  await page.locator('[data-action="submit-card-assistance"]').click();

  const conversation = page.locator(".card-assistance-conversation");
  await expect(conversation).toContainText(
    "Explique sem alterar por que este texto está adequado."
  );
  await expect(conversation).toContainText(
    "A formulação atual já apresenta a distinção solicitada."
  );
  await expect(conversation).not.toContainText("Aplicado ao");
  const probe = await page.evaluate(() => ({
    card: structuredClone(globalThis.__packageAuthoringProbe.project.courses[0]
      .modules[0].lessons[0].microsequences[0].cards[0]),
    saves: structuredClone(globalThis.__packageAuthoringProbe.saves),
    localState: structuredClone(globalThis.__packageAuthoringProbe.localState)
  }));
  expect(probe.card.title).toBe("Conjunção");
  expect(probe.card.content[0].data.text).toBe("P e Q precisam ser verdadeiras.");
  expect(probe.saves).toHaveLength(0);
  expect(probe.localState).toBeNull();
});

test("chat recompõe estruturalmente o card com um package escolhido no catálogo", async ({ page }) => {
  await bootAuthoring(page);
  await openFirstCard(page);
  await selectMode(page, "ai");
  await page.locator('[data-action="toggle-card-assistance-whole-card"]').click();
  await page.locator('[data-action="toggle-card-assistance-composer"]').click();
  await expect(page.locator(".card-assistance-scope"))
    .toContainText("Recomposição permitida");
  await expect(page.locator(".card-assistance-scope"))
    .toContainText("a identidade e a posição do card são preservadas");
  await page.locator('[data-field="assist-prompt"]')
    .fill("Troque a representação por código.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.getByText("Conjunção em código", { exact: true })).toBeVisible();
  const probe = await page.evaluate(() => ({
    card: structuredClone(globalThis.__packageAuthoringProbe.project.courses[0]
      .modules[0].lessons[0].microsequences[0].cards[0]),
    phases: globalThis.__packageAuthoringProbe.providerCalls.map(({ phase }) => phase)
  }));
  expect(probe.phases).toEqual([
    "card_assistance_representation",
    "card_assistance_build"
  ]);
  expect(probe.card.content[0].package).toBe("aralearn.resource.code");
  expect(probe.card.content[0].data.code).toBe("const resultado = P && Q;");
  await page.locator('[data-action="undo-card-edit"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Conjunção");
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
