import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("../../public/main.js", import.meta.url), "utf8");
const settingsModule = mainSource.slice(0, mainSource.indexOf('const root = document.getElementById("app-root");')) +
  "\nexport { renderSettings, clearAraLearnLocalState };";

async function mount(page, { visitor = false, administrator = false } = {}) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.route("**/common-settings-harness.js", route => route.fulfill({ contentType: "application/javascript", body: settingsModule }));
  await page.goto("/");
  await page.evaluate(async ({ visitor, administrator }) => {
    document.body.innerHTML = '<div id="app-root"><main id="origin" style="height: 450px; overflow: auto"><button id="settings-opener" data-action="open-settings">Configurações</button><textarea aria-label="Rascunho de origem">Texto preservado</textarea><div style="height: 1800px">Curso em estudo</div></main><div id="settings-root"></div></div>';
    const { renderSettings } = await import("/common-settings-harness.js");
    const { renderVisitorSettings } = await import("/src/ui/VisitorSettings.js");
    const domain = await import("/src/domain/authoringProcessPreferences.js");
    const h = window.settingsHarness = {
      profile: { userId: "10000000-0000-4000-8000-000000000001", handle: "sintetico", avatarObjectKey: null },
      read: { contract: domain.AUTHORING_PROCESS_PREFERENCES_CONTRACT, revision: 0, preferences: domain.defaultAuthoringProcessPreferences(), updatedAt: null },
      profileReads: [], profileWrites: [], preferenceWrites: [], maintenanceReads: 0,
      deferredProfileReads: false, deferredProfileWrites: false, deferredPreferenceWrites: false,
      losePreferenceResponse: false, clearCalls: 0, signInCalls: 0, confirmed: true
    };
    let synchronization = "automatic";
    const controller = {
      async getPersonProfile() {
        if (!h.deferredProfileReads) return structuredClone(h.profile);
        return new Promise((resolve, reject) => h.profileReads.push({ resolve, reject }));
      },
      async updatePersonProfile(command) {
        const saved = { ...h.profile, ...command };
        if (!h.deferredProfileWrites) { h.profile = saved; return structuredClone(saved); }
        return new Promise((resolve, reject) => h.profileWrites.push({ command, resolve() { h.profile = saved; resolve(structuredClone(saved)); }, reject }));
      },
      async loadCurrentMaintenance() {
        h.maintenanceReads += 1;
        return { role: "administrator", retention: { scheduled: true }, inventory: { items: [] } };
      }
    };
    const client = {
      getAuthoringProcessPreferences: async () => structuredClone(h.read),
      async saveAuthoringProcessPreferences(command) {
        const apply = () => {
          h.read = { contract: domain.AUTHORING_PROCESS_PREFERENCES_CONTRACT, revision: command.expectedRevision + 1,
            preferences: structuredClone(command.preferences), updatedAt: "2026-09-09T12:00:00.000Z" };
          return { ...h.read, contract: domain.AUTHORING_PROCESS_CHANGE_CONTRACT,
            requestId: command.requestId, changed: true, idempotent: false };
        };
        if (h.deferredPreferenceWrites) return new Promise((resolve, reject) => h.preferenceWrites.push({ command: structuredClone(command), resolve: () => resolve(apply()), reject }));
        h.preferenceWrites.push({ command: structuredClone(command) });
        const result = apply();
        if (h.losePreferenceResponse) throw new TypeError("Resposta perdida");
        return result;
      }
    };
    const root = document.querySelector("#settings-root");
    h.settings = visitor ? renderVisitorSettings(root, {
      onSignIn: () => { h.signInCalls += 1; }, onClearDeviceData: async () => { h.clearCalls += 1; },
      confirmValue: () => h.confirmed
    }) : renderSettings(root, { getSession: () => ({ user: { app_metadata: { aralearn_role: administrator ? "administrator" : "author" } } }) }, controller, {
      preferencesClient: client,
      synchronizationPreference: { get: () => synchronization, set: value => { synchronization = value; }, subscribe: () => () => {} },
      previewVisitorState: async () => ({ courses: [] }), adoptVisitorState: async () => {}
    });
    document.querySelector("#settings-opener").addEventListener("click", () => h.settings.open());
    await document.fonts.ready;
  }, { visitor, administrator });
  await page.locator("#settings-opener").click();
}

const groups = ["Conta", "Aparência", "Sincronização e dados deste dispositivo", "Preferências de autoria"];

test("Configurações mantém os quatro grupos, papel, retorno e rascunho de perfil entre reaberturas", async ({ page }, testInfo) => {
  await mount(page);
  await expect(page.locator("[data-settings-view='main'] button:not([hidden])")).toHaveText(groups);
  await expect(page.locator("[data-settings-maintenance]")).toBeHidden();
  await page.getByRole("button", { name: "Conta", exact: true }).click();
  await expect(page.locator("[data-profile-handle]")).toHaveValue("@sintetico");
  await page.locator("[data-profile-handle]").fill("@rascunho");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.locator("#settings-opener")).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Rascunho de origem" })).toHaveValue("Texto preservado");
  await page.locator("#settings-opener").click();
  await page.getByRole("button", { name: "Conta", exact: true }).click();
  await expect(page.locator("[data-profile-handle]")).toHaveValue("@rascunho");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Conta", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Aparência", exact: true }).click();
  await page.getByRole("button", { name: "Tema escuro", exact: true }).click();
  await expect(page.locator("[data-theme-choice='dark']")).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("common-settings-dark.png") });
  await expect(page.locator("[data-settings-view='appearance']")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.settingsHarness.maintenanceReads)).toBe(0);
});

test("perfil descarta leituras antigas e conserva edição posterior ao salvar em outro painel", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "Conta", exact: true }).click();
  await page.evaluate(() => {
    const h = window.settingsHarness;
    h.deferredProfileReads = true;
    void h.settings.loadProfile({ force: true });
    void h.settings.loadProfile({ force: true });
    h.profileReads[1].resolve({ ...h.profile, handle: "maisrecente" });
  });
  await expect(page.locator("[data-profile-handle]")).toHaveValue("@maisrecente");
  await page.locator("[data-profile-handle]").fill("@enviado");
  await page.evaluate(() => {
    const h = window.settingsHarness;
    h.profileReads[0].resolve({ ...h.profile, handle: "obsoleto" });
    h.deferredProfileReads = false;
    h.deferredProfileWrites = true;
  });
  await page.locator("[data-profile-save]").click();
  await page.locator("[data-profile-handle]").fill("@posterior");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Aparência", exact: true }).click();
  await page.locator("[data-theme-choice='light']").focus();
  await page.evaluate(() => window.settingsHarness.profileWrites[0].resolve());
  await expect(page.locator("[data-profile-save]")).toBeEnabled();
  await expect(page.locator("[data-settings-view='appearance']")).toBeVisible();
  await expect(page.locator("[data-theme-choice='light']")).toBeFocused();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Conta", exact: true }).click();
  await expect(page.locator("[data-profile-handle]")).toHaveValue("@posterior");
});

test("preferências têm dimensões independentes, com rascunho preservado após resposta tardia e conflito", async ({ page }, testInfo) => {
  await mount(page);
  await page.getByRole("button", { name: "Preferências de autoria", exact: true }).click();
  await expect(page.locator("[data-process-fields]")).toBeEnabled();
  await page.locator("[data-process-focus]").selectOption("content");
  await page.locator("[data-process-cadence]").selectOption("batch");
  await page.locator("[data-process-review='explanation']").uncheck();
  await page.locator("[data-process-mode='authoring_chat_interaction']").selectOption("fixed");
  const option = await page.locator("[data-process-value='authoring_chat_interaction'] option").last().getAttribute("value");
  await page.locator("[data-process-value='authoring_chat_interaction']").selectOption(option);
  await page.evaluate(() => { window.settingsHarness.deferredPreferenceWrites = true; });
  await page.locator("[data-process-save]").click();
  const command = await page.evaluate(() => window.settingsHarness.preferenceWrites[0].command);
  expect(command.preferences.focus).toBe("content");
  expect(command.preferences.cadence).toBe("batch");
  expect(command.preferences.reviewPoints).toEqual(["curricular_map", "study_unit"]);
  expect(command.preferences.parameters.find(p => p.parameterId === "authoring_chat_interaction")).toEqual({ parameterId: "authoring_chat_interaction", mode: "fixed", value: option });
  await page.locator("[data-process-focus]").selectOption("full_cycle");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Conta", exact: true }).click();
  await page.locator("[data-profile-handle]").focus();
  await page.evaluate(() => window.settingsHarness.preferenceWrites[0].resolve());
  await expect(page.locator("[data-process-save]")).toBeEnabled();
  await expect(page.locator("[data-settings-view='account']")).toBeVisible();
  await expect(page.locator("[data-profile-handle]")).toBeFocused();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Preferências de autoria", exact: true }).click();
  await expect(page.locator("[data-process-focus]")).toHaveValue("full_cycle");
  await page.evaluate(() => { window.settingsHarness.read.revision += 1; window.settingsHarness.read.preferences.cadence = "microsequence"; });
  await page.locator("[data-process-reload]").click();
  await expect(page.locator("[data-process-conflict]")).toBeVisible();
  await expect(page.locator("[data-process-focus]")).toHaveValue("full_cycle");
  await expect(page.locator("[data-process-save]")).toBeDisabled();
  await page.locator("[data-process-keep-draft]").click();
  await expect(page.locator("[data-process-cadence]")).toHaveValue("batch");
  await expect(page.locator("[data-process-save]")).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("authoring-preferences.png") });
});

test("preferências com resposta perdida confirmam por releitura sem repetir a gravação", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "Preferências de autoria", exact: true }).click();
  await page.locator("[data-process-focus]").selectOption("content");
  await page.evaluate(() => { window.settingsHarness.losePreferenceResponse = true; });
  await page.locator("[data-process-save]").click();
  await expect(page.locator("[data-process-status]")).toContainText("confirmadas pela releitura");
  await expect(page.locator("[data-process-save]")).toBeDisabled();
  expect(await page.evaluate(() => window.settingsHarness.preferenceWrites.length)).toBe(1);
});

test("visitante acessa os mesmos grupos com teclado, tema, retorno e limpeza expressa", async ({ page }, testInfo) => {
  await mount(page, { visitor: true });
  await expect(page.locator("[data-visitor-view='main'] button")).toHaveText(groups);
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Preferências de autoria", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-visitor-view='authoring']")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Preferências de autoria", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Sincronização e dados deste dispositivo", exact: true }).click();
  await page.evaluate(() => { window.settingsHarness.confirmed = false; });
  await page.locator("[data-visitor-clear-device]").click();
  expect(await page.evaluate(() => window.settingsHarness.clearCalls)).toBe(0);
  await page.evaluate(() => { window.settingsHarness.confirmed = true; });
  await page.locator("[data-visitor-clear-device]").click();
  expect(await page.evaluate(() => window.settingsHarness.clearCalls)).toBe(1);
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Aparência", exact: true }).click();
  await page.getByRole("button", { name: "Tema claro", exact: true }).click();
  await expect(page.locator("[data-visitor-theme='light']")).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("visitor-settings-light.png") });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.locator("#settings-opener")).toBeFocused();
});

test("Manutenção só aparece após leitura autorizada e limpeza visitante preserva banco de conta", async ({ page }) => {
  await mount(page, { administrator: true });
  await expect(page.getByRole("button", { name: "Manutenção", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Manutenção", exact: true }).click();
  await expect(page.locator("[data-settings-view='maintenance']")).toBeVisible();
  expect(await page.evaluate(() => window.settingsHarness.maintenanceReads)).toBe(1);
  const result = await page.evaluate(async () => {
    const { clearAraLearnLocalState } = await import("/common-settings-harness.js");
    const { CourseLocalStore } = await import("/src/persistence/CourseLocalStore.js");
    const userId = "10000000-0000-4000-8000-000000000001";
    const account = await CourseLocalStore.open(indexedDB, { userId });
    const visitor = await CourseLocalStore.open(indexedDB, { visitor: true });
    await account.putCache("synthetic-settings", { preserved: true });
    await visitor.putCache("synthetic-settings", { local: true });
    account.close(); visitor.close();
    await clearAraLearnLocalState({ removeSession: false, visitor: true });
    const afterAccount = await CourseLocalStore.open(indexedDB, { userId });
    const afterVisitor = await CourseLocalStore.open(indexedDB, { visitor: true });
    const result = { account: await afterAccount.getCache("synthetic-settings"), visitor: await afterVisitor.getCache("synthetic-settings") };
    afterAccount.close(); afterVisitor.close();
    return result;
  });
  expect(result.account).toEqual({ preserved: true });
  expect(result.visitor).toBeNull();
});
