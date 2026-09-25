import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  AUTHORING_PROCESS_PREFERENCES_CONTRACT,
  defaultAuthoringProcessPreferences
} from "../../src/domain/authoringProcessPreferences.js";

const mainSource = await readFile(new URL("../../public/main.js", import.meta.url), "utf8");
const settingsModule = mainSource.slice(0, mainSource.indexOf('const root = document.getElementById("app-root");')) +
  "\nexport { renderSettings };";
const runtimeConfig = 'globalThis.__ARALEARN_ENV__ = { supabaseUrl: "https://project.supabase.test", supabasePublishableKey: "sb_publishable_test" };';

async function bootstrap(page) {
  await page.route("**/runtime-config.js", route => route.fulfill({ contentType: "application/javascript", body: runtimeConfig }));
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.route("**/account-device-settings-harness.js", route => route.fulfill({
    contentType: "application/javascript", body: settingsModule
  }));
  await page.goto("/");
}

async function expectIconOnly(locator, label) {
  await expect(locator).toHaveAttribute("aria-label", label);
  await expect(locator).toHaveAttribute("title", label);
  await expect(locator).toHaveText("");
  await expect(locator.locator("svg")).toHaveCount(1);
}

async function mountAccountDevice(page) {
  await bootstrap(page);
  await page.evaluate(async () => {
    document.body.innerHTML = '<div id="app-root"><button id="settings-opener" data-action="open-settings">Configurações</button><div id="settings-root"></div></div>';
    const { renderSettings } = await import("/account-device-settings-harness.js");
    const domain = await import("/src/domain/authoringProcessPreferences.js");
    const h = window.settingsHarness = { adopted: [], maintenanceReads: 0 };
    const profile = { userId: "10000000-0000-4000-8000-000000000001", handle: "sintetico", avatarObjectKey: null };
    const controller = {
      getPersonProfile: async () => structuredClone(profile),
      loadCurrentMaintenance: async () => { h.maintenanceReads += 1; return { role: "administrator", retention: { scheduled: true }, inventory: { items: [] } }; },
      previewVisitorState: async () => ({ courses: [] }),
      updatePersonProfile: async value => ({ ...profile, ...value }),
      loadAvatar: async () => { throw new Error("no avatar"); },
      deleteOwnAvatar: async () => true,
      uploadAvatar: async () => ({ objectKey: "synthetic-avatar" }),
      executeCurrentMaintenance: async () => ({ state: { role: "administrator", retention: { scheduled: true }, inventory: { items: [] } } }),
      deleteMyAccount: async () => ({ deleted: true })
    };
    const authClient = { getSession: () => ({ user: { id: profile.userId, app_metadata: { aralearn_role: "administrator" } } }), signOut: async () => {} };
    const settings = renderSettings(document.querySelector("#settings-root"), authClient, controller, {
      preferencesClient: {
        getAuthoringProcessPreferences: async () => ({ contract: domain.AUTHORING_PROCESS_PREFERENCES_CONTRACT, revision: 0,
          preferences: domain.defaultAuthoringProcessPreferences(), updatedAt: null }),
        saveAuthoringProcessPreferences: async () => ({ contract: domain.AUTHORING_PROCESS_CHANGE_CONTRACT, revision: 1,
          requestId: "10000000-0000-4000-8000-000000000099", changed: true, idempotent: false,
          preferences: domain.defaultAuthoringProcessPreferences(), updatedAt: "2026-09-24T12:00:00.000Z" })
      },
      synchronizationPreference: { get: () => "automatic", set: () => {}, subscribe: () => () => {} },
      previewVisitorState: async () => ({ courses: [{ courseId: "course-1", title: "Curso sintético", completedCount: 2, reviewCount: 1 }] }),
      adoptVisitorState: async value => { h.adopted.push(value); },
      confirmValue: () => true,
      promptValue: () => ""
    });
    h.settings = settings;
    document.querySelector("#settings-opener").addEventListener("click", () => settings.open());
    await document.fonts.ready;
  });
  await page.locator("#settings-opener").click();
}

test("D001/O002/O035/O036: conta, foto e dispositivo usam ícones nomeados e risco consistente", async ({ page }) => {
  await mountAccountDevice(page);
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
  await page.locator(".study-state-adoption summary").click();
  await expectIconOnly(page.locator("[data-study-adoption-preview]"), "Examinar progresso sem conta");
  await page.locator("[data-study-adoption-preview]").click();
  await expect(page.locator("[data-study-adoption-form]")).toBeVisible();
  await page.locator("input[name=visitorCourse]").check();
  await expectIconOnly(page.locator("[data-study-adoption-form] button[type=submit]"), "Acrescentar os cursos selecionados à minha conta");
  await page.locator("[data-study-adoption-form] button[type=submit]").click();
  await expect(page.locator("[data-study-adoption-message]")).toContainText("Progresso acrescentado à conta");
  expect(await page.evaluate(() => window.settingsHarness.adopted)).toEqual([{ courseIds: ["course-1"] }]);
});

test("O038: estados vazios do dispositivo não reservam altura fixa", async ({ page }) => {
  await mountAccountDevice(page);
  await page.getByRole("button", { name: "Sincronização e dados deste dispositivo", exact: true }).click();
  const messages = page.locator(".study-device-settings [data-study-sync-message], .study-device-settings [data-study-adoption-message]");
  await expect(messages).toHaveCount(2);
  for (const index of [0, 1]) {
    const box = await messages.nth(index).boundingBox();
    expect(box?.height || 0).toBeLessThan(20);
    await expect(messages.nth(index)).toHaveCSS("margin-top", "0px");
    await expect(messages.nth(index)).toHaveCSS("margin-bottom", "0px");
  }
});

test("H007: resposta de rede controlada mantém carregamento perceptível e aplica preferências depois", async ({ page }) => {
  let requestCount = 0;
  let release;
  await page.route("**/h007/authoring-process-preferences", route => {
    requestCount += 1;
    return new Promise(resolve => { release = () => resolve(route.fulfill({ contentType: "application/json", body: JSON.stringify({
      contract: AUTHORING_PROCESS_PREFERENCES_CONTRACT, revision: 1,
      preferences: defaultAuthoringProcessPreferences(), updatedAt: "2026-09-24T12:00:00.000Z"
    }) })); });
  });
  await bootstrap(page);
  await page.evaluate(async () => {
    document.body.innerHTML = '<div id="preferences-root"></div>';
    const { mountAuthoringProcessPreferencesSettings } = await import("/src/ui/AuthoringProcessPreferencesSettings.js");
    const client = { getAuthoringProcessPreferences: () => fetch("/h007/authoring-process-preferences").then(response => response.json()) };
    window.h007Settings = mountAuthoringProcessPreferencesSettings(document.querySelector("#preferences-root"), { client });
    window.h007Settings.open();
  });
  await expect.poll(() => requestCount).toBe(1);
  await expect(page.locator("[data-process-status]")).toHaveText("Consultando preferências salvas…");
  await expect(page.locator("[data-process-fields]")).toHaveAttribute("disabled", "");
  release();
  await expect(page.locator("[data-process-fields]")).not.toHaveAttribute("disabled", "");
  await expect(page.locator("[data-process-origin]")).toHaveText("Origem: preferências salvas na sua conta");
  await expect(page.locator("[data-process-status]")).toHaveText("Preferências salvas na conta.");
});
