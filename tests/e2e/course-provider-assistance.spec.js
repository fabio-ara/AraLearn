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
    const assistance = createCourseProviderAssistance({
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
    });
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
      onApplyDraft(prepared) { probe.drafts += 1; paint(prepared.candidate); }
    }));
    globalThis.__courseAssistanceProbe = probe;
    globalThis.__courseAssistance = assistance;
    globalThis.__courseAssistanceSession = session;
  }, { project: fixture, delayed, configured });
}

test("minichat refina a proposta e só gera e aplica ao rascunho após aceite", async ({ page }) => {
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
  await expect(dialog.getByRole("button", { name: "Aceitar e aplicar" })).toBeDisabled();
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

  await dialog.getByRole("button", { name: "Aceitar e aplicar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#preview")).toContainText("consequências observáveis");
  expect(await page.evaluate(() => ({
    calls: globalThis.__courseAssistanceProbe.calls,
    discussions: globalThis.__courseAssistanceProbe.discussionCalls,
    generations: globalThis.__courseAssistanceProbe.generationCalls,
    drafts: globalThis.__courseAssistanceProbe.drafts
  }))).toEqual({ calls: 4, discussions: 3, generations: 1, drafts: 1 });
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
