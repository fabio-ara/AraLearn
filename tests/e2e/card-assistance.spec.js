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

async function openCardAssistance(page, {
  courseOrigin = "private",
  holdProvider = false
} = {}) {
  await page.goto("/");
  await page.evaluate(async ({ initialProject, courseOrigin, holdProvider }) => {
    const oldRoot = document.querySelector("#app-root");
    const root = document.createElement("div");
    root.id = "app-root";
    oldRoot.replaceWith(root);
    const probe = {
      project: structuredClone(initialProject),
      courseOrigin,
      saveCalls: [],
      providerCalls: [],
      guardAttempts: [],
      failNext: false,
      holdNext: holdProvider,
      releaseProvider: null,
      localDraftRevision: null,
      localDraftSequence: 0
    };
    const assertDraftGuard = (expectedRevision) => {
      probe.guardAttempts.push({
        expectedRevision,
        actualRevision: probe.localDraftRevision
      });
      if (expectedRevision === probe.localDraftRevision) return;
      const error = new Error(
        "O localDraft mudou desde a consulta e não pode ser gravado com segurança."
      );
      error.code = "local_course_draft_changed";
      throw error;
    };
    const advanceDraftRevision = () => {
      probe.localDraftSequence += 1;
      probe.localDraftRevision = `draft-revision-${probe.localDraftSequence}`;
    };
    const storage = {
      loadProject: () => structuredClone(probe.project),
      flush: async () => undefined,
      createLocalCourseDraftGuard: (courseKey) => ({
        contract: "aralearn.local-course-draft-guard.v1",
        courseId: "course-persistent-a",
        courseKey,
        expectedRevision: probe.localDraftRevision
      }),
      saveProject: async (next) => {
        probe.saveCalls.push({
          method: "saveProject",
          document: structuredClone(next)
        });
        probe.project = structuredClone(next);
      },
      saveMicrosequenceGeneration: async (
        next,
        microsequenceId,
        { expectedLocalDraftRevision } = {}
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
      },
      saveMicrosequenceCreation: async (next, scope) => {
        assertDraftGuard(scope.expectedLocalDraftRevision);
        const createdMicrosequence = next.courses[0].modules[0].lessons[0]
          .microsequences.find((microsequence) =>
            microsequence.id === scope.microsequenceId
          );
        if (
          JSON.stringify(createdMicrosequence?.cards?.[0]) !==
            JSON.stringify(scope.expectedCreatedCard)
        ) {
          throw new Error("O card criado diverge do guard da prévia.");
        }
        probe.saveCalls.push({
          method: "saveMicrosequenceCreation",
          scope: structuredClone(scope),
          document: structuredClone(next)
        });
        probe.project = structuredClone(next);
        advanceDraftRevision();
      },
      coursePermissions: () => ({
        role: courseOrigin === "private" ? "owner" : "learner",
        canEdit: true,
        canDelete: false,
        requiresFork: false
      }),
      loadProgress: () => ({ version: 1, lessons: {} }),
      saveProgress: async () => undefined,
      loadStudyPaths: () => [],
      recordCardView: async () => undefined,
      recordCardAttempt: async () => undefined,
      loadCommentForPath: () => ({ body: "" }),
      saveCommentForPath: async () => undefined
    };
    const assistProvider = {
      async generateStructured(request) {
        probe.providerCalls.push({
          phase: request.phase,
          engineContext: structuredClone(request.engineContext)
        });
        if (probe.failNext) {
          probe.failNext = false;
          throw new Error("Falha transitória simulada.");
        }
        if (probe.holdNext) {
          probe.holdNext = false;
          await new Promise((resolve) => {
            probe.releaseProvider = resolve;
          });
          probe.releaseProvider = null;
        }
        if (request.phase === "card_assistance_representation") {
          const createsMicrosequence =
            request.engineContext.task === "create_one_card" &&
            request.schema.required.includes("microsequenceTitle");
          return {
            value: {
              representation: "paragraph:theory:none",
              ...(createsMicrosequence
                ? {
                    microsequenceTitle: "Aplicação",
                    microsequenceGoal: "Aplicar a conjunção em um caso curto."
                  }
                : {})
            }
          };
        }
        if (request.phase === "card_assistance_build") {
          const target = request.engineContext.writableTarget;
          return {
            value: {
              card: {
                ...structuredClone(target),
                title: "Novo exemplo",
                text: "P e Q são verdadeiras no caso apresentado.",
                after: ""
              }
            }
          };
        }
        const replacements = request.engineContext.writableTargets.map((target) => ({
          targetId: target.targetId,
          value: {
            ...structuredClone(target.value),
            value: target.location === "after"
              ? "Apoio corrigido."
              : "P e Q devem ser simultaneamente verdadeiras."
          },
          gaps: []
        }));
        return { value: { replacements } };
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
    courseOrigin,
    holdProvider
  });

  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="play-microsequence"]').click();
  await page.locator(
    '[data-action="select-workbench-pane"][data-workbench-pane="edit"]'
  ).click();
  await expect(page.locator(".workbench-surface")).toHaveAttribute(
    "data-workbench-pane",
    "edit"
  );
}

async function requestTwoResourceRepairs(page, promptText) {
  await page.locator(
    '[data-action="select-card-repair-scope"][data-repair-scope="resources"]'
  ).click();
  await page.locator(
    '[data-action="toggle-card-assistance-resource"][data-resource-target-id="body:paragraph-1"]'
  ).click();
  await page.locator(
    '[data-action="toggle-card-assistance-resource"][data-resource-target-id="after:support-1"]'
  ).click();
  await page.locator('[data-field="assist-prompt"]').fill(promptText);
  const submit = page.locator('[data-action="submit-card-assistance"]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.locator('[data-role="card-assistance-preview"]')).toBeVisible();
}

for (const courseOrigin of ["catalog", "private"]) {
  test(`reparo seletivo em curso ${courseOrigin} só persiste após confirmação`, async ({ page }) => {
    const ephemeralPrompt = `PEDIDO_EFEMERO_${courseOrigin.toUpperCase()}`;
    await openCardAssistance(page, { courseOrigin });
    await requestTwoResourceRepairs(page, ephemeralPrompt);

    await expect.poll(() => page.evaluate(
      () => globalThis.__cardAssistanceProbe.saveCalls.length
    )).toBe(0);
    await page.locator('[data-action="discard-card-assistance-preview"]').click();
    await expect(page.locator('[data-role="card-assistance-preview"]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(
      () => globalThis.__cardAssistanceProbe.saveCalls.length
    )).toBe(0);

    await page.locator('[data-action="submit-card-assistance"]').click();
    await expect(page.locator('[data-role="card-assistance-preview"]')).toBeVisible();
    await page.locator('[data-action="apply-card-assistance-preview"]').click();
    await expect(page.locator('[data-role="card-assistance-preview"]')).toHaveCount(0);

    const result = await page.evaluate(() => {
      const probe = globalThis.__cardAssistanceProbe;
      const card = probe.project.courses[0].modules[0].lessons[0]
        .microsequences[0].cards[0];
      return {
        courseOrigin: probe.courseOrigin,
        saveMethods: probe.saveCalls.map((call) => call.method),
        body: card.blocks.map((block) => block.value || block.code),
        after: card.afterBlocks.map((block) => block.value),
        neighbor: probe.project.courses[0].modules[0].lessons[0]
          .microsequences[0].cards[1].text,
        persisted: JSON.stringify(probe.saveCalls)
      };
    });
    expect(result.courseOrigin).toBe(courseOrigin);
    expect(result.saveMethods).toEqual(["saveMicrosequenceGeneration"]);
    expect(result.body).toEqual([
      "P e Q devem ser simultaneamente verdadeiras.",
      "P ∧ Q",
      "Somente V e V produz V."
    ]);
    expect(result.after).toEqual(["Apoio corrigido."]);
    expect(result.neighbor).toBe("Este card permanece somente leitura.");
    expect(result.persisted).not.toContain(ephemeralPrompt);
    expect(result.persisted).not.toContain("aralearn.card-assistance-preview");
  });
}

test("reparo do card inteiro substitui a representação sem tocar no card vizinho", async ({ page }) => {
  await openCardAssistance(page, { courseOrigin: "catalog" });
  await expect(page.locator('[data-action="future-sync"]')).toBeVisible();
  await expect(page.locator('[data-action="open-microsequence-actions"]')).toBeVisible();
  await expect(page.getByText("Disponível somente para estudo nesta conta")).toHaveCount(0);
  await expect(page.locator('[data-action="structure-drag-handle"]')).toHaveCount(0);
  await page.locator(
    '[data-action="select-workbench-pane"][data-workbench-pane="preview"]'
  ).click();
  await expect(page.locator(".workbench-surface")).toHaveAttribute(
    "data-workbench-pane",
    "preview"
  );
  await expect(page.locator(".authoring-card-drag-handle")).toHaveCount(1);
  await expect(page.locator(".authoring-card-drag-handle")).toHaveAttribute("aria-hidden", "true");
  await page.locator(
    '[data-action="select-workbench-pane"][data-workbench-pane="edit"]'
  ).click();
  await expect(page.locator(".workbench-surface")).toHaveAttribute(
    "data-workbench-pane",
    "edit"
  );

  await page.locator('[data-field="assist-prompt"]').fill(
    "Reconstrua este card como uma explicação curta."
  );
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.locator('[data-role="card-assistance-preview"]')).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => globalThis.__cardAssistanceProbe.saveCalls.length
  )).toBe(0);
  await page.locator('[data-action="apply-card-assistance-preview"]').click();

  const result = await page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    const cards = probe.project.courses[0].modules[0].lessons[0]
      .microsequences[0].cards;
    return {
      saveMethods: probe.saveCalls.map((call) => call.method),
      repaired: cards[0],
      neighbor: cards[1]
    };
  });
  expect(result.saveMethods).toEqual(["saveMicrosequenceGeneration"]);
  expect(result.repaired.id).toBe("card-a");
  expect(result.repaired.position).toBe(1);
  expect(result.repaired.resource).toBe("paragraph");
  expect(result.repaired.title).toBe("Novo exemplo");
  expect(result.neighbor.id).toBe("card-b");
  expect(result.neighbor.text).toBe("Este card permanece somente leitura.");
});

for (const [placement, expectedOrder] of [
  ["before_current", ["Novo exemplo", "Conjunção", "Card vizinho"]],
  ["after_current", ["Conjunção", "Novo exemplo", "Card vizinho"]],
  ["end_current", ["Conjunção", "Card vizinho", "Novo exemplo"]]
]) {
  test(`criação ${placement} persiste somente a microssequência atual`, async ({ page }) => {
    await openCardAssistance(page);
    await page.locator(
      '[data-action="select-card-assistance-operation"][data-operation="create"]'
    ).click();
    await page.locator(
      `[data-action="select-card-creation-placement"][data-placement="${placement}"]`
    ).click();
    await page.locator('[data-field="assist-prompt"]').fill(
      "Crie um exemplo curto para consolidar a conjunção."
    );
    await page.locator('[data-action="submit-card-assistance"]').click();
    await expect(page.locator('[data-role="card-assistance-preview"]')).toBeVisible();
    await expect.poll(() => page.evaluate(
      () => globalThis.__cardAssistanceProbe.saveCalls.length
    )).toBe(0);
    await page.locator('[data-action="apply-card-assistance-preview"]').click();

    const result = await page.evaluate(() => {
      const probe = globalThis.__cardAssistanceProbe;
      const cards = probe.project.courses[0].modules[0].lessons[0]
        .microsequences[0].cards;
      return {
        saveMethods: probe.saveCalls.map((call) => call.method),
        titles: cards.map((card) => card.title),
        positions: cards.map((card) => card.position)
      };
    });
    expect(result.saveMethods).toEqual(["saveMicrosequenceGeneration"]);
    expect(result.titles).toEqual(expectedOrder);
    expect(result.positions).toEqual([1, 2, 3]);
  });
}

test("criação em nova microssequência usa prévia efêmera e persistência estrutural", async ({ page }) => {
  const ephemeralPrompt = "PEDIDO_EFEMERO_NOVA_MICRO";
  await openCardAssistance(page);
  await page.locator(
    '[data-action="select-card-assistance-operation"][data-operation="create"]'
  ).click();
  await page.locator(
    '[data-action="select-card-creation-placement"][data-placement="new_microsequence"]'
  ).click();
  await page.locator('[data-field="assist-prompt"]').fill(ephemeralPrompt);
  await page.locator('[data-action="submit-card-assistance"]').click();

  const preview = page.locator('[data-role="card-assistance-preview"]');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Aplicação");
  await expect.poll(() => page.evaluate(
    () => globalThis.__cardAssistanceProbe.saveCalls.length
  )).toBe(0);
  await page.locator('[data-action="apply-card-assistance-preview"]').click();

  const result = await page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    const micros = probe.project.courses[0].modules[0].lessons[0].microsequences;
    return {
      saveMethods: probe.saveCalls.map((call) => call.method),
      microsequenceCount: micros.length,
      newTitle: micros[1].title,
      newCardTitle: micros[1].cards[0].title,
      newCardPosition: micros[1].cards[0].position,
      scope: probe.saveCalls[0]?.scope,
      persisted: JSON.stringify(probe.saveCalls)
    };
  });
  expect(result.saveMethods).toEqual(["saveMicrosequenceCreation"]);
  expect(result.microsequenceCount).toBe(2);
  expect(result.newTitle).toBe("Aplicação");
  expect(result.newCardTitle).toBe("Novo exemplo");
  expect(result.newCardPosition).toBe(1);
  expect(result.scope).toMatchObject({
    lessonId: "lesson-a",
    microsequenceId: "microsequence-aplicacao",
    expectedLocalDraftRevision: null,
    expectedCreatedCard: {
      title: "Novo exemplo"
    }
  });
  expect(result.persisted).not.toContain(ephemeralPrompt);
  expect(result.persisted).not.toContain("aralearn.card-assistance-preview");
});

test("falha do provider e resposta atrasada sobre alvo alterado não gravam conteúdo", async ({ page }) => {
  await openCardAssistance(page);
  await page.evaluate(() => {
    globalThis.__cardAssistanceProbe.failNext = true;
  });
  await page.locator('[data-field="assist-prompt"]').fill("Revise o card.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.locator('[data-role="card-assistance-preview"]')).toHaveCount(0);
  await expect(page.locator(".card-assistance-message")).toContainText(
    "Falha transitória simulada"
  );
  await expect.poll(() => page.evaluate(
    () => globalThis.__cardAssistanceProbe.saveCalls.length
  )).toBe(0);

  await page.evaluate(() => {
    globalThis.__cardAssistanceProbe.holdNext = true;
  });
  await page.locator('[data-field="assist-prompt"]').fill("Revise novamente.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect.poll(() => page.evaluate(
    () => globalThis.__cardAssistanceProbe.providerCalls.length
  )).toBe(2);
  await page.evaluate(() => {
    const changed = structuredClone(globalThis.__cardAssistanceProbe.project);
    changed.courses[0].modules[0].lessons[0].microsequences[0]
      .cards[0].blocks[0].value = "Mudança concorrente.";
    globalThis.__cardAssistanceProbe.project = structuredClone(changed);
    globalThis.__cardAssistanceApp.replaceProject(changed);
    globalThis.__cardAssistanceProbe.releaseProvider();
  });

  await expect(page.locator('[data-role="card-assistance-preview"]')).toHaveCount(0);
  await expect(page.locator(".card-assistance-message")).toContainText("alvo mudou");
  await expect.poll(() => page.evaluate(
    () => globalThis.__cardAssistanceProbe.saveCalls.length
  )).toBe(0);
});

test("CAS do localDraft recusa a prévia quando outra aba gravou depois da geração", async ({ page }) => {
  await openCardAssistance(page, { courseOrigin: "private" });
  await page.locator('[data-field="assist-prompt"]').fill(
    "Repare o card preservando sua intenção."
  );
  await page.locator('[data-action="submit-card-assistance"]').click();
  const preview = page.locator('[data-role="card-assistance-preview"]');
  await expect(preview).toBeVisible();

  await page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    const concurrent = structuredClone(probe.project);
    concurrent.courses[0].modules[0].lessons[0].microsequences[0]
      .cards[0].blocks[0].value = "Alteração confirmada em outra aba.";
    probe.project = concurrent;
    probe.localDraftRevision = "draft-revision-outra-aba";
  });
  await page.locator('[data-action="apply-card-assistance-preview"]').click();

  await expect(preview).toHaveAttribute("data-stale", "true");
  await expect(
    page.locator('[data-action="apply-card-assistance-preview"]')
  ).toBeDisabled();
  await expect(page.locator(".card-assistance-message")).toContainText(
    "localDraft mudou"
  );
  const result = await page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    return {
      saved: probe.saveCalls.length,
      text: probe.project.courses[0].modules[0].lessons[0]
        .microsequences[0].cards[0].blocks[0].value
    };
  });
  expect(result).toEqual({
    saved: 0,
    text: "Alteração confirmada em outra aba."
  });
});
