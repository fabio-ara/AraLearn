import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = JSON.parse(await readFile(new URL(
  "../fixtures/package/project-minimal.json",
  import.meta.url
), "utf8"));

async function installHarness(page) {
  await page.route("**/main.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  await page.goto("/");
  await page.evaluate(async (project) => {
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
      endpoint: "https://api.openai.com/v1/responses",
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
  }, fixture);
}

test("minichat discute, confirma, renderiza, descarta e aplica só ao rascunho", async ({ page }) => {
  await installHarness(page);
  await page.locator("#trigger").click();
  const dialog = page.getByRole("dialog", { name: /Unidade: Regra central/u });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Contexto somente leitura", { exact: false })).toBeVisible();
  await dialog.getByLabel("Mensagem").fill("Explique e proponha uma revisão.");
  await dialog.getByRole("button", { name: "Enviar" }).click();
  await expect(dialog.getByText("Plano discutível")).toBeVisible();
  await expect(dialog.getByText("Reescrever a explicação", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar e preparar" }).click();
  await expect(dialog.getByText("Proposta validada")).toBeVisible();
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
  expect(snapshot.hasCredential).toBe(true);
  expect(snapshot.conversationTurnCount).toBe(0);
  const destroyed = await page.evaluate(() => {
    globalThis.__courseAssistanceSession.destroy();
    return globalThis.__courseAssistance.sessionSnapshot();
  });
  expect(destroyed.hasCredential).toBe(false);
});
