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
  holdProvider = false,
  keyboardActivation = false,
  contextualSync = false
} = {}) {
  await page.goto("/");
  await page.evaluate(async ({ initialProject, courseOrigin, holdProvider, contextualSync }) => {
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
      remoteCalls: [],
      restoredDrafts: [],
      unselectedCourses: [],
      replicaSyncs: [],
      localDraftRevision: null,
      localDraftSequence: 0,
      cardAssistanceLocalState: null
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
      loadCardAssistanceLocalState: async () =>
        structuredClone(probe.cardAssistanceLocalState),
      saveCardAssistanceLocalState: async (_courseKey, value) => {
        probe.cardAssistanceLocalState = structuredClone(value);
        return structuredClone(value);
      },
      getLocalCourseDraft: async () => probe.localDraftRevision ? ({
        courseId: "11111111-1111-4111-8111-111111111111",
        courseKey: initialProject.courses[0].id,
        courseOrigin,
        revision: probe.localDraftRevision,
        baseContentHash: "a".repeat(64)
      }) : null,
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
      saveMicrosequenceRemoval: async (next, scope) => {
        assertDraftGuard(scope.expectedLocalDraftRevision);
        const removedMicrosequence = next.courses[0].modules[0].lessons[0]
          .microsequences.find((microsequence) =>
            microsequence.id === scope.microsequenceId
          );
        if (removedMicrosequence) {
          throw new Error("A microssequência ainda existe após a reversão.");
        }
        probe.saveCalls.push({
          method: "saveMicrosequenceRemoval",
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
      isCardMarkedForReview: () => false,
      setCardReviewMark: async () => undefined,
      loadCommentForPath: () => null,
      saveCommentForPath: async () => undefined,
      deleteCommentForPath: async () => undefined
    };
    let remoteRevision = 1;
    const outline = () => ({
      courses: probe.project.courses.map((course) => ({
        id: course.id,
        modules: course.modules.map((moduleValue) => ({
          id: moduleValue.id,
          lessons: moduleValue.lessons.map((lesson) => ({
            id: lesson.id,
            microsequences: lesson.microsequences.map((microsequence) => ({
              id: microsequence.id,
              status: microsequence.status,
              cardCount: microsequence.cards.length
            }))
          }))
        }))
      }))
    });
    const remoteCatalog = {
      async executeApplicationAuthoringAction(name, args) {
        probe.remoteCalls.push({ name, args: structuredClone(args) });
        if (name === "criarWorkspaceDeAutoria") {
          return { workspaceId: "22222222-2222-4222-8222-222222222222", revision: 1 };
        }
        if (name === "lerWorkspaceDeAutoria") return {
          workspaceId: "22222222-2222-4222-8222-222222222222",
          revision: remoteRevision,
          content: outline(),
          publications: []
        };
        if (name === "salvarCardsNaMicrossequencia") {
          remoteRevision += 1;
          return { revision: remoteRevision };
        }
        if (name === "publicarCursoDoWorkspace") return {
          courseId: courseOrigin === "private"
            ? "11111111-1111-4111-8111-111111111111"
            : "33333333-3333-4333-8333-333333333333",
          contentHash: "b".repeat(64),
          completionState: "partial",
          target: "private"
        };
        throw new Error(`Operação inesperada: ${name}`);
      },
      async unselectCourse(courseId) {
        probe.unselectedCourses.push(courseId);
      }
    };
    const syncEngine = {
      async restoreDeferredCourseRevision(value) {
        probe.restoredDrafts.push(structuredClone(value));
        probe.localDraftRevision = null;
      }
    };
    const synchronizeReplica = async (value) => {
      probe.replicaSyncs.push(structuredClone(value));
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
      assistProvider,
      ...(contextualSync ? {
        contextualAuthoring: { remoteCatalog, syncEngine, synchronizeReplica }
      } : {})
    });
  }, {
    initialProject: projectFixture(),
    courseOrigin,
    holdProvider,
    contextualSync
  });

  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="play-microsequence"]').click();
  const editToggle = page.locator('[data-action="toggle-card-edit-mode"]');
  if (keyboardActivation) {
    await editToggle.focus();
    await editToggle.press("Enter");
  } else {
    await editToggle.click();
  }
  await expect(page.locator(".workbench-surface")).toHaveClass(/is-editing/u);
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

test("modo contextual abre pelo teclado e mantém seletores no card", async ({ page }) => {
  await openCardAssistance(page, { keyboardActivation: true });
  await expect(page.locator(".runtime-card-sheet")).toBeVisible();
  await expect(page.locator(".contextual-card-editor")).toBeVisible();
  await page.locator(
    '[data-action="select-card-repair-scope"][data-repair-scope="resources"]'
  ).click();
  await expect(page.locator(".runtime-resource-edit-target")).toHaveCount(3);
});

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
  await expect(page.locator('[data-action="open-central"]')).toBeVisible();
  await expect(page.locator('[data-action="open-microsequence-actions"]')).toHaveCount(0);
  await expect(page.getByText("Disponível somente para estudo nesta conta")).toHaveCount(0);
  await expect(page.locator('[data-action="structure-drag-handle"]')).toHaveCount(0);
  await page.locator('[data-action="toggle-card-edit-mode"]').click();
  await expect(page.locator(".contextual-card-editor")).toHaveCount(0);
  await expect(page.locator(".authoring-card-drag-handle")).toHaveCount(0);
  await page.locator('[data-action="toggle-card-edit-mode"]').click();
  await expect(page.locator(".workbench-surface")).toHaveClass(/is-editing/u);

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

test("reparo de vários cards gera prévia conjunta e um único commit", async ({ page }) => {
  await openCardAssistance(page, { courseOrigin: "private" });
  await page.locator('[data-action="toggle-card-assistance-card"][data-card-key="card-b"]')
    .first().click();
  await expect(page.locator('.card-assistance-card-chip[aria-pressed="true"]')).toHaveCount(2);
  await page.locator('[data-field="assist-prompt"]').fill(
    "Uniformize pontualmente estes dois cards."
  );
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.locator('[data-role="card-assistance-preview"]')).toBeVisible();
  await expect(page.locator(".card-assistance-preview-card")).toHaveCount(2);
  await page.locator('[data-action="apply-card-assistance-preview"]').click();

  const result = await page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    return {
      calls: probe.saveCalls.map((call) => call.method),
      cards: probe.project.courses[0].modules[0].lessons[0]
        .microsequences[0].cards.map((card) => ({
          title: card.title,
          resource: card.resource,
          text: card.text
        }))
    };
  });
  expect(result.calls).toEqual(["saveMicrosequenceGeneration"]);
  expect(result.cards).toEqual([
    {
      title: "Novo exemplo",
      resource: "paragraph",
      text: "P e Q são verdadeiras no caso apresentado."
    },
    {
      title: "Novo exemplo",
      resource: "paragraph",
      text: "P e Q são verdadeiras no caso apresentado."
    }
  ]);
});

test("edição manual do recurso salva e desfaz no próprio card", async ({ page }) => {
  await openCardAssistance(page, { courseOrigin: "private" });
  await page.locator(
    '[data-action="select-card-repair-scope"][data-repair-scope="resources"]'
  ).click();
  await page.locator(
    '[data-action="toggle-card-assistance-resource"][data-resource-target-id="body:paragraph-1"]'
  ).first().click();
  await page.locator(".manual-card-editor > summary").click();
  await page.locator('[data-manual-edit-key="value"]').fill(
    "P e Q precisam ser verdadeiras ao mesmo tempo."
  );
  await page.locator('[data-action="save-manual-card-edit"]').click();
  await expect(page.locator(".runtime-markdown-paragraph").filter({
    hasText: "P e Q precisam ser verdadeiras ao mesmo tempo."
  })).toBeVisible();

  await page.locator(".manual-card-editor > summary").click();
  await page.locator('[data-action="undo-card-edit"]').click();
  await expect(page.locator(".runtime-markdown-paragraph").filter({
    hasText: "P e Q precisam ser verdadeiras."
  })).toBeVisible();
  const calls = await page.evaluate(() =>
    globalThis.__cardAssistanceProbe.saveCalls.map((call) => call.method)
  );
  expect(calls).toEqual([
    "saveMicrosequenceGeneration",
    "saveMicrosequenceGeneration"
  ]);
});

test("edição de curso do catálogo publica fork privado e troca a seleção", async ({ page }) => {
  await openCardAssistance(page, { courseOrigin: "catalog", contextualSync: true });
  await page.locator(
    '[data-action="select-card-repair-scope"][data-repair-scope="resources"]'
  ).click();
  await page.locator(
    '[data-action="toggle-card-assistance-resource"][data-resource-target-id="body:paragraph-1"]'
  ).first().click();
  await page.locator(".manual-card-editor > summary").click();
  await page.locator('[data-manual-edit-key="value"]')
    .fill("Correção que deve chegar à publicação privada.");
  await page.locator('[data-action="save-manual-card-edit"]').click();

  await expect.poll(() => page.evaluate(() =>
    globalThis.__cardAssistanceProbe.replicaSyncs.length
  )).toBe(1);
  const result = await page.evaluate(() => ({
    remoteCalls: globalThis.__cardAssistanceProbe.remoteCalls.map((call) => call.name),
    restored: globalThis.__cardAssistanceProbe.restoredDrafts,
    unselected: globalThis.__cardAssistanceProbe.unselectedCourses,
    syncs: globalThis.__cardAssistanceProbe.replicaSyncs,
    localState: globalThis.__cardAssistanceProbe.cardAssistanceLocalState
  }));
  expect(result.remoteCalls).toContain("salvarCardsNaMicrossequencia");
  expect(result.remoteCalls).toContain("publicarCursoDoWorkspace");
  expect(result.restored).toHaveLength(1);
  expect(result.unselected).toEqual(["11111111-1111-4111-8111-111111111111"]);
  expect(result.syncs[0].expectedCourseIds).toEqual([
    "33333333-3333-4333-8333-333333333333"
  ]);
  expect(result.localState.sync).toEqual({ pendingPaths: [], replacement: null });
});

test("pedido sem conexão entra em fila compacta e vira prévia ao reconectar", async ({ page }) => {
  await openCardAssistance(page, { courseOrigin: "private" });
  await page.context().setOffline(true);
  await page.locator('[data-field="assist-prompt"]').fill(
    "Corrija este card quando a conexão voltar."
  );
  await page.locator('[data-action="submit-card-assistance"]').click();
  await expect(page.getByText("Pedido guardado neste dispositivo.")).toBeVisible();
  expect(await page.evaluate(() => ({
    queue: globalThis.__cardAssistanceProbe.cardAssistanceLocalState.queue.length,
    providerCalls: globalThis.__cardAssistanceProbe.providerCalls.length
  }))).toEqual({ queue: 1, providerCalls: 0 });

  await page.context().setOffline(false);
  await expect(page.locator('[data-role="card-assistance-preview"]')).toBeVisible();
  expect(await page.evaluate(() =>
    globalThis.__cardAssistanceProbe.cardAssistanceLocalState.queue.length
  )).toBe(0);
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

test("criação de microssequência pode ser desfeita sem snapshot do curso", async ({ page }) => {
  await openCardAssistance(page);
  await page.locator(
    '[data-action="select-card-assistance-operation"][data-operation="create"]'
  ).click();
  await page.locator(
    '[data-action="select-card-creation-placement"][data-placement="new_microsequence"]'
  ).click();
  await page.locator('[data-field="assist-prompt"]').fill("Crie uma aplicação curta.");
  await page.locator('[data-action="submit-card-assistance"]').click();
  await page.locator('[data-action="apply-card-assistance-preview"]').click();

  await expect(page.locator('[data-action="undo-card-edit"]')).toBeVisible();
  await page.locator('[data-action="undo-card-edit"]').click();

  const result = await page.evaluate(() => {
    const probe = globalThis.__cardAssistanceProbe;
    const localStateText = JSON.stringify(probe.cardAssistanceLocalState);
    return {
      saveMethods: probe.saveCalls.map((call) => call.method),
      microsequenceIds: probe.project.courses[0].modules[0].lessons[0]
        .microsequences.map((microsequence) => microsequence.id),
      localStateText
    };
  });
  expect(result.saveMethods).toEqual([
    "saveMicrosequenceCreation",
    "saveMicrosequenceRemoval"
  ]);
  expect(result.microsequenceIds).toEqual(["micro-a"]);
  expect(result.localStateText).not.toContain("beforeMicrosequence");
  expect(result.localStateText).not.toContain("microsequence-aplicacao");
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
