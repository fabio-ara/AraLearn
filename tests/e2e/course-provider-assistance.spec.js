import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = JSON.parse(await readFile(new URL(
  "../fixtures/package/project-minimal.json",
  import.meta.url
), "utf8"));

async function installHarness(page, { delayed = false } = {}) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async ({ project, delayed }) => {
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
    const probe = { calls: 0, previews: 0, discards: 0, drafts: 0, current: original };
    const session = createCourseProviderSession();
    session.update({
      providerId: "openai",
      model: "gpt-5.6-luna",
      apiKey: "stub-credential"
    });
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
      fetchImpl: async () => {
        if (delayed) {
          await new Promise((resolve) => { globalThis.__resolveCourseAssistance = resolve; });
        }
        probe.calls += 1;
        return probe.calls % 2 === 1
          ? response({
              message: "Podemos tornar a relação causal mais explícita.",
              proposal: {
                summary: "Reescrever a explicação preservando o componente de parágrafo.",
                scope: "study_unit",
                componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
              }
            })
          : response({ message: "A explicação foi revisada.", candidate });
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
      onFocusPreview: () => preview.focus(),
      onPreview(prepared) { probe.previews += 1; paint(prepared.candidate); },
      onDiscardPreview() { probe.discards += 1; paint(original); },
      onApplyDraft(prepared) { probe.drafts += 1; paint(prepared.candidate); }
    }));
    globalThis.__courseAssistanceProbe = probe;
    globalThis.__courseAssistance = assistance;
    globalThis.__courseAssistanceSession = session;
  }, { project: fixture, delayed });
}

test("minichat discute, confirma, renderiza, descarta e aplica só ao rascunho", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await installHarness(page);
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: /Unidade: Regra central/u });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Unidade inteira", { exact: false })).toBeVisible();
  const initialHeight = (await dialog.boundingBox()).height;
  await dialog.getByText("Serviço e modelo", { exact: true }).click();
  expect((await dialog.boundingBox()).height).toBe(initialHeight);
  await dialog.getByText("Serviço e modelo", { exact: true }).click();
  await dialog.getByLabel("Mensagem").fill("Explique e proponha uma revisão.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByText("Plano discutível")).toBeVisible();
  await expect(dialog.getByText("Reescrever a explicação", { exact: false })).toBeVisible();
  expect((await dialog.boundingBox()).height).toBeGreaterThanOrEqual(initialHeight);
  await expect(dialog.getByLabel("Mensagem")).toBeFocused();
  expect(await dialog.evaluate((sheet) => {
    const composer = sheet.querySelector("form").getBoundingClientRect();
    const bounds = sheet.getBoundingClientRect();
    return composer.bottom <= bounds.bottom && composer.top >= bounds.top;
  })).toBe(true);
  await dialog.getByRole("button", { name: "Confirmar e preparar" }).click();
  await expect(dialog.getByText("Proposta validada")).toBeVisible();
  await expect(dialog.getByLabel("Mensagem")).toBeFocused();
  await expect(page.locator("#preview")).toContainText("consequências observáveis");
  expect(await page.evaluate(() => globalThis.__courseAssistanceProbe.drafts)).toBe(0);

  await dialog.getByRole("button", { name: "Descartar proposta" }).click();
  await expect(page.locator("#preview")).toContainText("conjunção");
  await dialog.getByLabel("Mensagem").fill("Prepare novamente a mesma mudança.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await dialog.getByRole("button", { name: "Confirmar e preparar" }).click();
  await expect(dialog.getByText("Proposta validada")).toBeVisible();
  await dialog.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#preview")).toContainText("consequências observáveis");
  expect(await page.evaluate(() => ({
    calls: globalThis.__courseAssistanceProbe.calls,
    previews: globalThis.__courseAssistanceProbe.previews,
    discards: globalThis.__courseAssistanceProbe.discards,
    drafts: globalThis.__courseAssistanceProbe.drafts
  }))).toEqual({ calls: 4, previews: 2, discards: 1, drafts: 1 });
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

test("trocar provider ajusta modelos, apaga a chave anterior e não expõe endpoint", async ({ page }) => {
  await installHarness(page);
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: /Unidade: Regra central/u });
  await dialog.getByText("Serviço e modelo", { exact: true }).click();
  await dialog.getByLabel("Serviço").selectOption("gemini");
  await expect(dialog.getByLabel("Modelo")).toHaveValue("gemini-2.5-flash");
  await dialog.getByLabel("Chave do Gemini").fill("gemini-stub");
  await dialog.getByLabel("Serviço").selectOption("deepseek");
  await expect(dialog.getByLabel("Modelo")).toHaveValue("deepseek-v4-pro");
  await expect(dialog.getByLabel("Chave da DeepSeek")).toHaveValue("");
  await expect(dialog.getByText(/endpoint|relay|servidor local/iu)).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => globalThis.__courseAssistance.sessionSnapshot())).toMatchObject({
    providerId: "",
    model: "",
    hasCredential: false,
    conversationTurnCount: 0
  });
});

test("resposta tardia depois de fechar não reabre conversa nem produz prévia", async ({ page }) => {
  await installHarness(page, { delayed: true });
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: /Unidade: Regra central/u });
  await dialog.getByLabel("Mensagem").fill("Prepare uma mudança.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => globalThis.__resolveCourseAssistance?.());
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => ({
    snapshot: globalThis.__courseAssistance.sessionSnapshot(),
    previews: globalThis.__courseAssistanceProbe.previews,
    drafts: globalThis.__courseAssistanceProbe.drafts
  }))).toEqual({
    snapshot: expect.objectContaining({
      opened: false,
      conversationTurnCount: 0,
      hasProposal: false,
      hasCandidate: false
    }),
    previews: 0,
    drafts: 0
  });
});
