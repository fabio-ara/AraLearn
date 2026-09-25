import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("../../public/main.js", import.meta.url), "utf8");
const settingsModule = mainSource.slice(0, mainSource.indexOf('const root = document.getElementById("app-root");')) +
  "\nexport { renderSettings, clearAraLearnLocalState };";

async function mount(page, { visitor = false, administrator = false } = {}) {
  await page.route("**/runtime-config.js", route => route.fulfill({
    contentType: "application/javascript",
    body: 'globalThis.__ARALEARN_ENV__ = { supabaseUrl: "https://project.supabase.test", supabasePublishableKey: "sb_publishable_test" };'
  }));
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
      losePreferenceResponse: false, clearCalls: 0, signInCalls: 0, confirmed: true,
      connectionRequests: [], deferConnection: false, connectionError: null
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
    const authClient = {
      getSession: () => ({ user: { id: h.profile.userId, app_metadata: { aralearn_role: administrator ? "administrator" : "author" } } }),
      async registerActionOAuthClient() {
        h.connectionRequests.push({ operation: "register" });
        if (h.deferConnection) return new Promise(resolve => { h.finishConnection = resolve; });
        if (h.connectionError) throw Object.assign(new Error(h.connectionError.message), h.connectionError);
        return { client_id: "10000000-0000-4000-8000-000000000099", client_secret: "ars_synthetic_secret_only_for_this_browser_fixture" };
      },
      async linkActionOAuthClient(clientId, assistantId) {
        h.connectionRequests.push({ operation: "link", clientId, assistantId });
        if (h.connectionError) throw Object.assign(new Error(h.connectionError.message), h.connectionError);
        return { linked: true };
      }
    };
    h.settings = visitor ? renderVisitorSettings(root, {
      onSignIn: () => { h.signInCalls += 1; }, onClearDeviceData: async () => { h.clearCalls += 1; },
      confirmValue: () => h.confirmed
    }) : renderSettings(root, authClient, controller, {
      preferencesClient: client,
      synchronizationPreference: { get: () => synchronization, set: value => { synchronization = value; }, subscribe: () => () => {} },
      previewVisitorState: async () => ({ courses: [] }), adoptVisitorState: async () => {}
    });
    document.querySelector("#settings-opener").addEventListener("click", () => h.settings.open());
    await document.fonts.ready;
  }, { visitor, administrator });
  await page.locator("#settings-opener").click();
}

const groups = ["Conta", "Aparência", "Sincronização e dados deste dispositivo", "Preferências de autoria", "Conectar assistente"];

async function expectIconOnly(locator, label) {
  await expect(locator).toHaveAttribute("aria-label", label);
  await expect(locator).toHaveAttribute("title", label);
  await expect(locator).toHaveText("");
  await expect(locator.locator("svg")).toHaveCount(1);
}

for (const visitor of [false, true]) {
  test(`conectar assistente apresenta endereço e cópia sem gravar cursos (${visitor ? "visitante" : "conta"})`, async ({ page }, testInfo) => {
    await mount(page, { visitor });
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async value => { window.copiedAssistantAddress = value; }
    } }));
    await page.getByRole("button", { name: "Conectar assistente", exact: true }).click();
    await expect(page.getByLabel("Endereço MCP", { exact: true })).toHaveValue("https://project.supabase.test/functions/v1/aralearn-authoring-mcp");
    await page.getByRole("button", { name: "Copiar endereço", exact: true }).click();
    expect(await page.evaluate(() => window.copiedAssistantAddress)).toBe("https://project.supabase.test/functions/v1/aralearn-authoring-mcp");
    await expect(page.locator("[data-assistant-status]")).toContainText("Endereço copiado");
    const connection = page.locator("[data-assistant-mcp]");
    await expect(connection).toContainText("Adicione este endereço nas conexões do seu assistente");
    await expect(connection).not.toContainText(/GPT|ChatGPT|OAuth|OpenAPI|DCR|OIDC|offline_access|Developer Mode/iu);
    await expect(connection.getByRole("link")).toHaveCount(1);
    await expect(connection.getByRole("link", { name: "Como conectar (nova aba)", exact: true }))
      .toHaveAttribute("href", "https://github.com/fabio-ara/AraLearn/blob/main/docs/conectar-assistente.md");
    await page.screenshot({ path: testInfo.outputPath("conectar-assistente.png"), fullPage: true });
    expect(await page.evaluate(() => window.settingsHarness.preferenceWrites.length)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Conectar assistente", exact: true })).toBeFocused();
  });
}

test("OpenAPI gera credenciais temporárias, vincula e retoma sem gerar outro par", async ({ page }, testInfo) => {
  await mount(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: async value => { window.copiedConnectionValue = value; } } }));
  await page.getByRole("button", { name: "Conectar assistente", exact: true }).click();
  await page.getByText("Conexão por OpenAPI", { exact: true }).click();
  await page.getByRole("button", { name: "Gerar credenciais", exact: true }).click();
  const clientId = "10000000-0000-4000-8000-000000000099";
  await expect(page.getByLabel("Identificador do cliente", { exact: true })).toHaveValue(clientId);
  await expect(page.getByLabel("Identificador do cliente", { exact: true })).not.toBeEditable();
  await expect(page.getByLabel("Segredo do cliente", { exact: true })).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Gerar credenciais", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Copiar segredo do cliente", exact: true }).click();
  expect(await page.evaluate(() => window.copiedConnectionValue)).toBe("ars_synthetic_secret_only_for_this_browser_fixture");
  await page.getByRole("button", { name: "Mostrar segredo", exact: true }).click();
  await expect(page.getByLabel("Segredo do cliente", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar segredo", exact: true }).click();
  await expect(page.getByLabel("URL de autorização", { exact: true })).toHaveValue("https://project.supabase.test/functions/v1/aralearn-authoring-action/oauth/authorize");
  await expect(page.getByLabel("URL de token", { exact: true })).toHaveValue("https://project.supabase.test/functions/v1/aralearn-authoring-action/oauth/token");
  await expect(page.getByLabel("Endereço OpenAPI", { exact: true })).toHaveValue("https://fabio-ara.github.io/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml");
  await page.getByLabel("Identificador ou URL de retorno do assistente", { exact: true }).fill("https://chatgpt.com/aip/g-synthetic-assistant/oauth/callback");
  await page.getByRole("button", { name: "Vincular assistente", exact: true }).click();
  await expect(page.locator("[data-openapi-status]")).toContainText("Assistente vinculado");
  await page.screenshot({ path: testInfo.outputPath("openapi-conexao-sintetica.png"), fullPage: true });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.locator("[data-openapi-field='client-secret']")).toHaveValue("");
  await expect(page.locator("#settings-opener")).toBeFocused();
  await page.locator("#settings-opener").click();
  await page.getByRole("button", { name: "Conectar assistente", exact: true }).click();
  await page.getByText("Conexão por OpenAPI", { exact: true }).click();
  await expect(page.locator("[data-openapi-secret]")).toBeHidden();
  await expect(page.getByLabel("Identificador do cliente", { exact: true })).toBeEditable();
  await page.getByLabel("Identificador do cliente", { exact: true }).fill(clientId);
  await page.getByLabel("Identificador ou URL de retorno do assistente", { exact: true }).fill("g-synthetic-assistant");
  await page.getByRole("button", { name: "Vincular assistente", exact: true }).click();
  await expect(page.locator("[data-openapi-status]")).toContainText("Assistente vinculado");
  await expect(page.getByRole("button", { name: "Vincular assistente", exact: true })).toBeFocused();
  expect(await page.evaluate(() => window.settingsHarness.connectionRequests.map(item => item.operation))).toEqual(["register", "link", "link"]);
  expect(await page.evaluate(() => window.settingsHarness.preferenceWrites.length)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-openapi-field='client-id']")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Conectar assistente", exact: true })).toBeFocused();
});

test("OpenAPI protege visitante, erros de acesso e resposta tardia após fechar", async ({ page }) => {
  await mount(page, { visitor: true });
  await page.getByRole("button", { name: "Conectar assistente", exact: true }).click();
  await page.getByText("Conexão por OpenAPI", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Gerar credenciais", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Entrar ou criar conta", exact: true }).click();
  expect(await page.evaluate(() => window.settingsHarness.signInCalls)).toBe(1);
  expect(await page.evaluate(() => window.settingsHarness.connectionRequests)).toEqual([]);
  await mount(page);
  await page.getByRole("button", { name: "Conectar assistente", exact: true }).click();
  await page.getByText("Conexão por OpenAPI", { exact: true }).click();
  await page.evaluate(() => { window.settingsHarness.connectionError = { status: 403, message: "forbidden" }; });
  await page.getByLabel("Identificador do cliente", { exact: true }).fill("10000000-0000-4000-8000-000000000099");
  await page.getByLabel("Identificador ou URL de retorno do assistente", { exact: true }).fill("g-synthetic-assistant");
  await page.getByRole("button", { name: "Vincular assistente", exact: true }).click();
  await expect(page.locator("[data-openapi-status]")).toContainText("não tem permissão");
  expect(await page.evaluate(() => window.settingsHarness.connectionRequests.length)).toBe(1);
  await page.getByLabel("Identificador do cliente", { exact: true }).fill("");
  await page.evaluate(() => { window.settingsHarness.connectionError = null; window.settingsHarness.deferConnection = true; });
  await page.getByRole("button", { name: "Gerar credenciais", exact: true }).click();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.evaluate(() => window.settingsHarness.finishConnection({
    client_id: "10000000-0000-4000-8000-000000000099", client_secret: "ars_synthetic_late_secret" }));
  await expect(page.locator("[data-openapi-field='client-secret']")).toHaveValue("");
  await page.locator("#settings-opener").click();
  await page.getByRole("button", { name: "Conectar assistente", exact: true }).click();
  await page.getByText("Conexão por OpenAPI", { exact: true }).click();
  await expect(page.locator("[data-openapi-secret]")).toBeHidden();
  expect(await page.evaluate(() => window.settingsHarness.connectionRequests.length)).toBe(2);
});

test("conexão permite copiar manualmente quando clipboard é recusado e não inventa servidor sem configuração", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: async () => { throw new Error("Permission denied"); }
  } }));
  await page.getByRole("button", { name: "Conectar assistente", exact: true }).click();
  await page.getByRole("button", { name: "Copiar endereço", exact: true }).click();
  await expect(page.getByLabel("Endereço MCP", { exact: true })).toBeFocused();
  await expect(page.locator("[data-assistant-status]")).toContainText("cópia automática");
  await page.evaluate(async () => {
    globalThis.__ARALEARN_ENV__ = {};
    const { mountAssistantConnectionSettings } = await import("/src/ui/AssistantConnectionSettings.js");
    mountAssistantConnectionSettings(document.querySelector("[data-assistant-connection]"));
  });
  await expect(page.getByRole("button", { name: "Copiar endereço", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Endereço MCP", { exact: true })).toHaveValue("");
});

test("Configurações mantém os grupos, papel, retorno e rascunho de perfil entre reaberturas", async ({ page }, testInfo) => {
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

test("ações autenticadas de conta, foto e manutenção são icon-only e preservam o risco", async ({ page }) => {
  await mount(page, { administrator: true });
  await page.getByRole("button", { name: "Conta", exact: true }).click();
  for (const [selector, label] of [
    ["[data-settings-signout]", "Sair desta conta"],
    ["[data-settings-signout-clear]", "Sair e remover dados deste dispositivo"],
    ["[data-settings-delete-account]", "Excluir conta"]
  ]) await expectIconOnly(page.locator(selector), label);
  await expect(page.locator("[data-settings-signout-clear]")).toHaveClass(/is-danger/u);
  await expect(page.locator("[data-settings-delete-account]")).toHaveClass(/is-danger/u);
  await page.getByRole("button", { name: "Abrir Foto do perfil", exact: true }).click();
  await expectIconOnly(page.locator("[data-profile-avatar-choose]"), "Escolher foto");
  await expect(page.locator("[data-profile-avatar-remove]")).toHaveClass(/is-danger/u);
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Sincronização e dados deste dispositivo", exact: true }).click();
  await expectIconOnly(page.locator("[data-settings-clear-device]"), "Remover dados deste dispositivo");
  await expect(page.locator("[data-settings-clear-device]")).toHaveClass(/is-danger/u);
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await page.getByRole("button", { name: "Manutenção", exact: true }).click();
  await expectIconOnly(page.locator("[data-maintenance-retention]"), "Executar retenção corrente");
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
  await expect(page.getByRole("button", { name: "Conectar assistente", exact: true })).toBeFocused();
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

for (const width of [390, 430, 1280]) test(`Aparência centraliza opções em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); await mount(page);
  await page.getByRole("button", { name: "Aparência", exact: true }).click();
  const view = page.locator("[data-settings-view=appearance]");
  const choice = view.locator(".theme-choice");
  const copy = view;
  await expect(view.locator("p")).toHaveCount(0);
  const a = await choice.boundingBox(); const b = await copy.boundingBox();
  expect(Math.abs(a.x + a.width / 2 - b.x - b.width / 2)).toBeLessThanOrEqual(1);
  for (const theme of ["light", "dark"]) {
    await choice.locator(`[data-theme-choice=${theme}]`).click();
    await expect(choice.locator(`[data-theme-choice=${theme}]`)).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: info.outputPath(`appearance-${width}-${theme}.png`) });
  }
});

for (const width of [390, 430]) test(`Preferências vinculam ajuda ao campo em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); await mount(page);
  await page.getByRole("button", { name: "Preferências de autoria", exact: true }).click();
  const field = page.locator(".authoring-process-parameter").last();
  await field.scrollIntoViewIfNeeded();
  const help = field.locator("summary"); await help.click();
  await expect(help).toHaveText(""); await expect(field.locator("details p")).toBeVisible();
  const group = await field.locator("..").boundingBox(); const box = await field.boundingBox();
  expect(box.x - group.x).toBeGreaterThanOrEqual(16);
  expect(await field.locator("legend").evaluate(n => getComputedStyle(n).fontWeight)).toBe("500");
  expect(await field.locator("details p").evaluate(n => getComputedStyle(n).fontWeight)).toBe("400");
  const save = await page.locator("[data-process-save]").boundingBox();
  const reload = await page.locator("[data-process-reload]").boundingBox();
  expect(save.x).toBeLessThan(reload.x);
  await page.screenshot({ path: info.outputPath(`preferences-help-${width}.png`) });
});
