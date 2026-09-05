import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = JSON.parse(await readFile(new URL(
  "../fixtures/package/project-minimal.json",
  import.meta.url
), "utf8"));

async function installHarness(page, { delayed = false, configured = true } = {}) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async ({ project, delayed, configured }) => {
    const {
      createCourseProviderAssistance,
      createCourseProviderSession
    } = await import("/src/ui/CourseProviderAssistance.js");
    const selection = {
      courseId: "course-fixture-minimal",
      moduleId: "module-fixture-minimal",
      lessonId: "lesson-fixture-minimal",
      microsequenceId: "micro-fixture-minimal",
      studyUnitId: "card-fixture-minimal-regra",
      studyUnitIndex: 0
    };
    const original = structuredClone(project.courses[0].modules[0].lessons[0]
      .microsequences[0].studyUnits[0]);
    const candidate = structuredClone(original);
    candidate.title = "Regra central discutida";
    candidate.content[0].data.text = "Uma regra liga condições a consequências observáveis.";
    document.body.innerHTML = '<main><button id="trigger" type="button">Assistir</button>' +
      `<article id="preview" tabindex="-1">${original.content[0].data.text}</article></main>`;
    const probe = {
      calls: 0,
      discussionCalls: 0,
      generationCalls: 0,
      drafts: 0,
      current: original
    };
    const session = createCourseProviderSession();
    if (configured) {
      session.update({
        providerId: "openai",
        model: "gpt-5.6-luna",
        apiKey: "stub-credential"
      });
    }
    const response = (value) => ({
      ok: true,
      status: 200,
      async json() {
        return { output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] };
      }
    });
    const assistanceOptions = {
      documentValue: document,
      windowValue: window,
      session,
      runtimeConfig: {
        developmentRuntime: true,
        assistAllowedOrigins: ["https://api.openai.com"]
      },
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        const prompt = JSON.parse(request.input);
        const generation = Boolean(prompt.confirmedProposal);
        probe.calls += 1;
        if (generation) probe.generationCalls += 1;
        else probe.discussionCalls += 1;
        if (!generation && (delayed || globalThis.__delayNextDiscussion)) {
          globalThis.__delayNextDiscussion = false;
          await new Promise((resolve) => { globalThis.__resolveCourseAssistance = resolve; });
        }
        if (!generation && globalThis.__rejectNextDiscussion) {
          globalThis.__rejectNextDiscussion = false;
          return {
            ok: true,
            status: 200,
            async json() {
              return { output: [{ content: [{ type: "output_text", text: "resposta sem estrutura" }] }] };
            }
          };
        }
        if (!generation && globalThis.__discussOnly) {
          return response({ message: "Podemos discutir a explicação sem alterar o conteúdo.", proposal: null });
        }
        if (generation && globalThis.__rejectGeneration) {
          return response({ message: "Inválida", candidate: { ...candidate, content: [] } });
        }
        if (generation) return response({ message: "A explicação foi revisada.", candidate });
        return probe.discussionCalls === 1
          ? response({
            message: "Podemos tornar a relação causal mais explícita.",
            proposal: {
              summary: "Reescrever a explicação preservando o componente de parágrafo.",
              changes: ["Explicitar a relação entre condição e consequência."],
              scope: "study_unit",
              componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
            }
          })
          : response({
            message: "A proposta agora preserva também o exemplo atual.",
            proposal: {
              summary: "Reescrever a explicação e preservar o exemplo atual.",
              changes: [
                "Explicitar a relação entre condição e consequência.",
                "Preservar o exemplo atual."
              ],
              scope: "study_unit",
              componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
            }
          });
      }
    };
    const assistance = createCourseProviderAssistance(assistanceOptions);
    globalThis.__courseAssistanceFetch = assistanceOptions.fetchImpl;
    const preview = document.querySelector("#preview");
    const paint = (unit) => {
      probe.current = structuredClone(unit);
      preview.textContent = unit.content[0].data.text;
    };
    document.querySelector("#trigger").addEventListener("click", (event) => assistance.open({
      trigger: event.currentTarget,
      project,
      selection,
      scope: "study_unit",
      targetTitle: original.title,
      writeTargetId: "study_unit",
      onApplyDraft(prepared) {
        if (globalThis.__rejectApply) throw new Error("Falha de contrato simulada ao aplicar");
        probe.drafts += 1; paint(prepared.candidate);
      }
    }));
    globalThis.__courseAssistanceProbe = probe;
    globalThis.__courseAssistance = assistance;
    globalThis.__courseAssistanceSession = session;
  }, { project: fixture, delayed, configured });
}

test("minichat refina, prepara prévia comparável e aplica somente por escolha explícita", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await installHarness(page);
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: "Edição com IA" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Unidade: Regra central/u))
    .toHaveClass(/visually-hidden/u);
  const initialHeight = (await dialog.boundingBox()).height;
  await dialog.getByRole("button", { name: "Configurar IA" }).click();
  expect((await dialog.boundingBox()).height).toBe(initialHeight);
  const connectionLayout = await dialog.evaluate((sheet) => {
    const body = sheet.querySelector(".course-assistance-body").getBoundingClientRect();
    const controls = [
      sheet.querySelector("[data-course-assistance-connection-toggle]"),
      ...sheet.querySelectorAll(".course-assistance-connection label")
    ].map((node) => {
      const bounds = node.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        within: bounds.top >= body.top && bounds.bottom <= body.bottom
      };
    });
    return { body: { top: body.top, bottom: body.bottom }, controls };
  });
  expect(connectionLayout.controls).toEqual(connectionLayout.controls.map((control) => ({
    ...control,
    within: true
  })));
  await dialog.getByRole("button", { name: "Configurar IA" }).click();
  await dialog.getByLabel("Mensagem").fill("Explique e proponha uma revisão.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("heading", { name: "Proposta" })).toBeVisible();
  await expect(dialog.getByText("Reescrever a explicação", { exact: false })).toBeVisible();
  expect((await dialog.boundingBox()).height).toBe(initialHeight);
  await expect(dialog.getByLabel("Mensagem")).toBeFocused();
  expect(await dialog.evaluate((sheet) => {
    const composer = sheet.querySelector("form").getBoundingClientRect();
    const bounds = sheet.getBoundingClientRect();
    return composer.bottom <= bounds.bottom && composer.top >= bounds.top;
  })).toBe(true);
  await expect(page.locator("#preview")).toContainText("conjunção");
  expect(await page.evaluate(() => globalThis.__courseAssistanceProbe.drafts)).toBe(0);

  await page.evaluate(() => { globalThis.__delayNextDiscussion = true; });
  await dialog.getByLabel("Mensagem").fill("Preserve também o exemplo atual.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("heading", { name: "Proposta" })).toBeVisible();
  await expect(dialog.getByText("Reescrever a explicação preservando", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Preparar prévia" })).toBeDisabled();
  await expect(page.locator("#preview")).toContainText("conjunção");
  await page.evaluate(() => globalThis.__resolveCourseAssistance?.());
  await expect(dialog.getByText("Preservar o exemplo atual.", { exact: true })).toBeVisible();

  await page.evaluate(() => { globalThis.__rejectNextDiscussion = true; });
  await dialog.getByLabel("Mensagem").fill("Dê outra justificativa.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("Não foi possível concluir a conversa.");
  await expect(dialog.getByRole("alert")).not.toContainText(/formato estruturado|endpoint/iu);
  await expect(dialog.getByText("Reescrever a explicação e preservar", { exact: false })).toBeVisible();
  await expect(page.locator("#preview")).toContainText("conjunção");

  await dialog.getByRole("button", { name: "Preparar prévia" }).click();
  const preview = dialog.getByRole("region", { name: "Prévia da alteração" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("consequências observáveis");
  expect((await dialog.boundingBox()).height).toBe(initialHeight);
  const screenshotPath = testInfo.outputPath("minichat-previa-390.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("minichat-previa-390.png", { path: screenshotPath, contentType: "image/png" });
  await expect(page.locator("#preview")).toContainText("conjunção");
  expect(await page.evaluate(() => globalThis.__courseAssistanceProbe.drafts)).toBe(0);
  await preview.getByRole("button", { name: "Original", exact: true }).click();
  await expect(preview).toContainText("conjunção");
  await preview.getByRole("button", { name: "Prévia", exact: true }).click();
  await expect(preview).toContainText("consequências observáveis");
  await page.evaluate(() => { globalThis.__rejectApply = true; });
  await preview.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível aplicar");
  await expect(page.locator("#preview")).toContainText("conjunção");
  await page.evaluate(() => { globalThis.__rejectApply = false; });
  await preview.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#preview")).toContainText("consequências observáveis");
  expect(await page.evaluate(() => ({
    calls: globalThis.__courseAssistanceProbe.calls,
    discussions: globalThis.__courseAssistanceProbe.discussionCalls,
    generations: globalThis.__courseAssistanceProbe.generationCalls,
    drafts: globalThis.__courseAssistanceProbe.drafts
  }))).toEqual({ calls: 4, discussions: 3, generations: 1, drafts: 1 });
});

test("debate não cria proposta e prévia descartada ou inválida preserva original", async ({ page }) => {
  await installHarness(page);
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: "Edição com IA" });
  await page.evaluate(() => { globalThis.__discussOnly = true; });
  await dialog.getByLabel("Mensagem").fill("Explique sem alterar.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByText("Podemos discutir a explicação sem alterar o conteúdo.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Preparar prévia" })).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__courseAssistanceProbe.generationCalls)).toBe(0);
  await page.evaluate(() => { globalThis.__discussOnly = false; });
  await dialog.getByLabel("Mensagem").fill("Agora proponha uma revisão.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await dialog.getByRole("button", { name: "Preparar prévia" }).click();
  await dialog.getByRole("button", { name: "Descartar prévia" }).click();
  await expect(dialog.getByRole("region", { name: "Prévia da alteração" })).toHaveCount(0);
  await expect(page.locator("#preview")).toContainText("conjunção");
  await page.evaluate(() => { globalThis.__rejectGeneration = true; });
  await dialog.getByRole("button", { name: "Preparar prévia" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Aplicar ao rascunho" })).toHaveCount(0);
  await expect(page.locator("#preview")).toContainText("conjunção");
  expect(await page.evaluate(() => globalThis.__courseAssistanceProbe.drafts)).toBe(0);
});

test("rascunho de assistência conserva revisão original, bloqueia refresh e mantém conteúdo em conflito", async ({ page }) => {
  await installHarness(page);
  await page.evaluate(async (project) => {
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    globalThis.fetch = globalThis.__courseAssistanceFetch;
    globalThis.__ARALEARN_ENV__ = { assistAllowedOrigins: ["https://api.openai.com"] };
    document.body.innerHTML = '<main id="study-proof"></main>';
    const course = project.courses[0];
    const moduleValue = course.modules[0];
    const lesson = moduleValue.lessons[0];
    const microsequence = lesson.microsequences[0];
    const unit = microsequence.studyUnits[0];
    const state = { revision: 1, version: 1, ownership: "owned", writes: [], refreshes: 0 };
    const repository = {
      loadProgress: () => ({ version: 1, lessons: {} }), loadStudyNavigation: () => null,
      loadCourseSummaries: () => [{ courseId: course.id, title: course.title, revision: state.revision,
        ownership: state.ownership, canEdit: state.ownership === "owned", canObserve: true }],
      loadStudyUnitCompositionContext: () => ({ courseRevision: state.revision,
        studyUnitVersion: state.version, didacticMicrosequenceId: microsequence.id }),
      loadRuntimeStatus: () => ({}), loadReviewItems: () => [], hasMoreReviewItems: () => false,
      loadAnnotationsForPath: () => [], isStudyUnitMarkedForReview: () => false,
      loadProject: () => structuredClone(project), loadCourse: async () => structuredClone(project),
      refreshPersonalState: async () => { state.refreshes += 1; return structuredClone(project); }
    };
    const app = createCourseStudyApplication({ root: document.querySelector("main"), repository,
      initialProject: project, providerAssistanceSession: globalThis.__courseAssistanceSession,
      onSaveManualEdit: async (value) => {
        state.writes.push(value);
        if (state.unknown) throw Object.assign(new Error("Falha de rede simulada"), { code: "NETWORK_ERROR" });
        throw Object.assign(new Error("Conflito de revisão"), { status: 409 });
      }
    });
    await app.openEntityPath([course.id, moduleValue.id, lesson.id, microsequence.id, unit.id]);
    globalThis.__assistanceStudyProof = { app, state };
  }, fixture);
  await page.getByRole("button", { name: "Assistência por IA", exact: true }).click();
  await page.getByRole("button", { name: "Abrir edição com IA", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edição com IA" });
  await dialog.getByLabel("Mensagem").fill("Proponha uma revisão da explicação.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await dialog.getByRole("button", { name: "Preparar prévia" }).click();
  await expect(dialog.getByRole("button", { name: "Aplicar ao rascunho" })).toBeVisible();
  await page.evaluate(() => {
    globalThis.__assistanceStudyProof.state.revision = 2;
    globalThis.__assistanceStudyProof.state.version = 2;
  });
  expect(await page.evaluate(() => globalThis.__assistanceStudyProof.app.refreshPersonalState())).toBe(false);
  await dialog.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  expect(await page.evaluate(() => globalThis.__assistanceStudyProof.app.hasPendingManualEdit())).toBe(true);
  expect(await page.evaluate(() => globalThis.__assistanceStudyProof.app.refreshPersonalState())).toBe(false);
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("#study-proof")).toContainText("consequências observáveis");
  expect(await page.evaluate(() => globalThis.__assistanceStudyProof.state.writes.map((value) => ({
    revision: value.expectedCourseRevision, version: value.expectedVersion
  })))).toEqual([{ revision: 1, version: 1 }]);
  await page.evaluate(() => { globalThis.__assistanceStudyProof.state.unknown = true; });
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.getByRole("button", { name: "Descartar rascunho", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Descartar rascunho", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("não desfaz uma gravação no curso");
  await expect(page.locator("#study-proof")).toContainText("consequências observáveis");
  await page.evaluate(() => { globalThis.__assistanceStudyProof.state.ownership = "shared"; });
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  expect(await page.evaluate(() => globalThis.__assistanceStudyProof.state.writes.length)).toBe(2);
  await page.getByRole("button", { name: "Confirmar descarte local sem confirmação da gravação" }).click();
  await expect(page.locator("#study-proof")).toContainText("conjunção");
  expect(await page.evaluate(() => globalThis.__assistanceStudyProof.state.refreshes)).toBe(0);
});

test("sessão fecha por Escape, restaura foco e não persiste credencial", async ({ page }) => {
  await installHarness(page);
  await page.locator("#trigger").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#trigger")).toBeFocused();
  const snapshot = await page.evaluate(() => globalThis.__courseAssistance.sessionSnapshot());
  expect(snapshot.hasCredential).toBe(false);
  expect(snapshot.conversationTurnCount).toBe(0);
  const destroyed = await page.evaluate(() => {
    globalThis.__courseAssistanceSession.destroy();
    return globalThis.__courseAssistance.sessionSnapshot();
  });
  expect(destroyed.hasCredential).toBe(false);
});

test("configuração ausente preserva a mensagem e revela o primeiro campo necessário", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await installHarness(page, { configured: false });
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: "Edição com IA" });
  const connection = dialog.locator(".course-assistance-connection");
  const initialHeight = (await dialog.boundingBox()).height;

  await expect(connection.getByRole("button", {
    name: "Configurar IA"
  })).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.locator("[data-course-assistance-provider]"))
    .toBeFocused();
  await dialog.getByRole("button", { name: "Configurar IA" }).click();
  await expect(connection.getByRole("button", {
    name: "Configurar IA"
  })).toHaveAttribute("aria-expanded", "false");

  const draft = "Explique o problema antes de sugerir qualquer mudança.";
  await dialog.getByLabel("Mensagem").fill(draft);
  await dialog.getByRole("button", { name: "Enviar" }).click();

  await expect(connection.getByRole("button", {
    name: "Configurar IA"
  })).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.locator("[data-course-assistance-provider]"))
    .toBeFocused();
  await expect(dialog.getByLabel("Mensagem")).toHaveValue(draft);
  await expect(dialog.getByRole("alert")).toContainText("Escolha o serviço");
  expect((await dialog.boundingBox()).height).toBe(initialHeight);
  expect(await page.evaluate(() => ({
    calls: globalThis.__courseAssistanceProbe.calls,
    turns: globalThis.__courseAssistance.sessionSnapshot().conversationTurnCount
  }))).toEqual({ calls: 0, turns: 0 });
});

test("trocar provider ajusta modelos, apaga a chave anterior e não expõe endpoint", async ({ page }) => {
  await installHarness(page);
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: "Edição com IA" });
  await dialog.getByRole("button", { name: "Configurar IA" }).click();
  await dialog.locator("[data-course-assistance-provider]").selectOption("gemini");
  await expect(dialog.getByLabel("Modelo")).toHaveValue("gemini-2.5-flash");
  await dialog.getByLabel("Chave do Gemini").fill("gemini-stub");
  await dialog.locator("[data-course-assistance-provider]").selectOption("deepseek");
  await expect(dialog.getByLabel("Modelo")).toHaveValue("deepseek-v4-pro");
  await expect(dialog.getByLabel("Chave da DeepSeek")).toHaveValue("");
  await expect(dialog.getByText(/endpoint|relay|servidor local/iu)).toHaveCount(0);
  await expect(dialog.getByText("Privacidade e envio", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => globalThis.__courseAssistance.sessionSnapshot())).toMatchObject({
    providerId: "",
    model: "",
    hasCredential: false,
    conversationTurnCount: 0
  });
});

test("resposta tardia depois de fechar não reabre conversa nem produz rascunho", async ({ page }) => {
  await installHarness(page, { delayed: true });
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: "Edição com IA" });
  await dialog.getByLabel("Mensagem").fill("Prepare uma mudança.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => globalThis.__resolveCourseAssistance?.());
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => ({
    snapshot: globalThis.__courseAssistance.sessionSnapshot(),
    drafts: globalThis.__courseAssistanceProbe.drafts
  }))).toEqual({
    snapshot: expect.objectContaining({
      opened: false,
      conversationTurnCount: 0,
      hasProposal: false
    }),
    drafts: 0
  });
});
