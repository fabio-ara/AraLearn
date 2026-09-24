import { test, expect } from '@playwright/test';

const runtimeConfig = 'globalThis.__ARALEARN_ENV__ = { supabaseUrl: "https://project.supabase.test", supabasePublishableKey: "sb_publishable_test" };';
const approvedGroups = ['Conta', 'Aparência', 'Sincronização e dados deste dispositivo', 'Preferências de autoria', 'Conectar assistente'];

async function bootstrap(page) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: runtimeConfig }));
  await page.route('**/main.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('/');
}

async function expectIconOnly(locator, label, { icons = 1 } = {}) {
  await expect(locator).toHaveAttribute('aria-label', label);
  await expect(locator).toHaveAttribute('title', label);
  await expect(locator).toHaveText('');
  await expect(locator.locator('svg')).toHaveCount(icons);
}

async function mountVisitor(page, { clearDeviceData = true } = {}) {
  await bootstrap(page);
  await page.evaluate(async ({ clearDeviceData }) => {
    document.body.innerHTML = '<div id="app-root"><button id="settings-opener" data-action="open-settings">Abrir Configurações</button><div id="settings-root"></div></div>';
    const { renderVisitorSettings } = await import('/src/ui/VisitorSettings.js');
    window.settingsHarness = { signInCalls: 0, clearCalls: 0, confirmed: true };
    window.settings = renderVisitorSettings(document.querySelector('#settings-root'), {
      onSignIn: () => { window.settingsHarness.signInCalls += 1; },
      onClearDeviceData: clearDeviceData ? async () => { window.settingsHarness.clearCalls += 1; } : undefined,
      confirmValue: () => window.settingsHarness.confirmed
    });
    document.querySelector('#settings-opener').addEventListener('click', () => window.settings.open());
    await document.fonts.ready;
  }, { clearDeviceData });
  await page.locator('#settings-opener').click();
}

async function mountAssistant(page, { authenticated = true } = {}) {
  await bootstrap(page);
  await page.evaluate(async ({ authenticated }) => {
    document.body.innerHTML = '<div id="app-root"><section class="account-settings-overlay contextual-settings">' +
      '<div class="account-settings-sheet courses-home-screen" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1">' +
      '<header class="account-settings-header"><div class="account-settings-title-row">' +
      '<h1 class="account-settings-title" id="panel-title">Conectar assistente</h1></div></header>' +
      '<div class="account-settings-content"><div id="assistant-root"></div></div></div></section></div>';
    const { mountAssistantConnectionSettings } = await import('/src/ui/AssistantConnectionSettings.js');
    window.settingsHarness = { connectionRequests: [], signInCalls: 0, defer: false, connectionError: null };
    const authClient = {
      getSession: () => authenticated ? { user: { id: '10000000-0000-4000-8000-000000000001' } } : null,
      async registerActionOAuthClient() {
        window.settingsHarness.connectionRequests.push({ operation: 'register' });
        if (window.settingsHarness.defer) return new Promise(resolve => { window.settingsHarness.finishConnection = resolve; });
        return { client_id: '10000000-0000-4000-8000-000000000099', client_secret: 'ars_synthetic_secret_only_for_this_browser_fixture' };
      },
      async linkActionOAuthClient(clientId, assistantId) {
        window.settingsHarness.connectionRequests.push({ operation: 'link', clientId, assistantId });
        if (window.settingsHarness.connectionError) throw Object.assign(new Error('synthetic'), window.settingsHarness.connectionError);
        return { linked: true };
      }
    };
    window.assistantSettings = mountAssistantConnectionSettings(document.querySelector('#assistant-root'), {
      authClient, onSignIn: () => { window.settingsHarness.signInCalls += 1; }
    });
    await document.fonts.ready;
  }, { authenticated });
}

async function mountPreferences(page) {
  await bootstrap(page);
  await page.evaluate(async () => {
    document.body.innerHTML = '<div id="app-root"><section class="account-settings-overlay contextual-settings">' +
      '<div class="account-settings-sheet courses-home-screen" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1">' +
      '<header class="account-settings-header"><div class="account-settings-title-row">' +
      '<h1 class="account-settings-title" id="panel-title">Preferências de autoria</h1></div></header>' +
      '<div class="account-settings-content"><div id="preferences-root"></div></div></div></section></div>';
    const domain = await import('/src/domain/authoringProcessPreferences.js');
    const { mountAuthoringProcessPreferencesSettings } = await import('/src/ui/AuthoringProcessPreferencesSettings.js');
    window.settingsHarness = { writes: [], read: { contract: domain.AUTHORING_PROCESS_PREFERENCES_CONTRACT,
      revision: 0, preferences: domain.defaultAuthoringProcessPreferences(), updatedAt: null } };
    const client = {
      getAuthoringProcessPreferences: async () => structuredClone(window.settingsHarness.read),
      async saveAuthoringProcessPreferences(command) {
        window.settingsHarness.writes.push(structuredClone(command));
        window.settingsHarness.read = { contract: domain.AUTHORING_PROCESS_PREFERENCES_CONTRACT,
          revision: command.expectedRevision + 1, preferences: structuredClone(command.preferences), updatedAt: '2026-09-24T12:00:00.000Z' };
        return { ...window.settingsHarness.read, contract: domain.AUTHORING_PROCESS_CHANGE_CONTRACT,
          requestId: command.requestId, changed: true, idempotent: false };
      }
    };
    window.preferences = mountAuthoringProcessPreferencesSettings(document.querySelector('#preferences-root'), { client });
    window.preferences.open();
    await document.fonts.ready;
  });
}

test('P004/P005/O002: grupos aprovados permanecem e os dois destinos têm ícones distintos', async ({ page }, info) => {
  await mountVisitor(page);
  const rows = page.locator('[data-visitor-view="main"] [data-visitor-open-view]');
  await expect(rows).toHaveText(approvedGroups);
  const authoringIcon = await rows.nth(3).locator('svg').first().innerHTML();
  const assistantIcon = await rows.nth(4).locator('svg').first().innerHTML();
  expect(authoringIcon === assistantIcon).toBe(false);
  await expect(rows.nth(3).locator('svg').first()).toHaveAttribute('aria-hidden', 'true');
  await rows.nth(2).click();
  await page.keyboard.press('Escape');
  await expect(rows.nth(2)).toBeFocused();
  await page.screenshot({ path: info.outputPath('configuracoes-grupos.png'), fullPage: true });
});

test('D001/O035: ações do visitante são icon-only, nomeadas e ainda funcionais', async ({ page }, info) => {
  await mountVisitor(page);
  await page.getByRole('button', { name: 'Conta', exact: true }).click();
  const signIn = page.locator('[data-visitor-view="account"] [data-visitor-signin]');
  await expectIconOnly(signIn, 'Entrar ou criar conta', { icons: 2 });
  await signIn.click();
  expect(await page.evaluate(() => window.settingsHarness.signInCalls)).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Preferências de autoria', exact: true }).click();
  await expectIconOnly(page.locator('[data-visitor-view="authoring"] [data-visitor-signin]'),
    'Entrar para definir preferências de autoria', { icons: 2 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sincronização e dados deste dispositivo', exact: true }).click();
  await expectIconOnly(page.locator('[data-visitor-clear-device]'), 'Remover dados sem conta deste dispositivo');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Aparência', exact: true }).click();
  await expectIconOnly(page.locator('[data-visitor-theme="light"]'), 'Tema claro');
  await page.screenshot({ path: info.outputPath('configuracoes-visitante-acoes.png'), fullPage: true });
});

test('O036: a perda de dados sem conta sinaliza risco, confirma e mantém o retorno', async ({ page }) => {
  await mountVisitor(page);
  await page.getByRole('button', { name: 'Sincronização e dados deste dispositivo', exact: true }).click();
  const action = page.locator('[data-visitor-clear-device]');
  await expect(action).toHaveClass(/is-danger/u);
  await expect(page.locator('[data-visitor-view="device"] .account-device-data-actions button')).toHaveCount(1);
  const dangerColor = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--status-danger)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  const painted = await action.evaluate(node => ({ color: getComputedStyle(node).color, border: getComputedStyle(node).borderTopColor }));
  expect(painted.color).toBe(dangerColor);
  expect(painted.border).toBe(dangerColor);
  await page.evaluate(() => { window.settingsHarness.confirmed = false; });
  await action.click();
  expect(await page.evaluate(() => window.settingsHarness.clearCalls)).toBe(0);
  await page.evaluate(() => { window.settingsHarness.confirmed = true; });
  await action.click();
  expect(await page.evaluate(() => window.settingsHarness.clearCalls)).toBe(1);
  await expect(page.locator('[data-visitor-status]')).toContainText('Removendo os dados sem conta deste dispositivo');
  await expect(page.locator('[data-visitor-signin].is-danger')).toHaveCount(0);
  await expect(page.locator('[data-visitor-theme].is-danger')).toHaveCount(0);
});

test('D001: o painel do assistente é icon-only e conserva campos e explicações', async ({ page }, info) => {
  await mountAssistant(page);
  await expectIconOnly(page.locator('[data-assistant-copy]'), 'Copiar endereço');
  await page.getByText('Conexão por OpenAPI', { exact: true }).click();
  await expectIconOnly(page.locator('[data-openapi-register]'), 'Gerar credenciais');
  const copies = page.locator('[data-openapi-copy]');
  expect(await copies.count()).toBeGreaterThan(4);
  for (const index of await copies.evaluateAll(nodes => nodes.map((node, position) => position))) {
    const copy = copies.nth(index);
    if (!await copy.isVisible()) continue;
    await expect(copy).toHaveText('');
    await expect(copy).toHaveAttribute('aria-label', /^Copiar /u);
    await expect(copy).toHaveAttribute('title', /^Copiar /u);
  }
  await page.getByRole('button', { name: 'Gerar credenciais', exact: true }).click();
  const reveal = page.locator('[data-openapi-reveal]');
  await expectIconOnly(reveal, 'Mostrar segredo');
  await reveal.click();
  await expectIconOnly(reveal, 'Ocultar segredo');
  await expect(reveal).toHaveAttribute('aria-pressed', 'true');
  await reveal.click();
  await expect(reveal).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Identificador do cliente', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Segredo do cliente', { exact: true })).toBeVisible();
  await expect(page.locator('[data-openapi-details]')).toContainText('O segredo aparece somente nesta sessão');
  await page.getByLabel('Identificador ou URL de retorno do assistente', { exact: true }).fill('g-synthetic-assistant');
  const link = page.locator('[data-openapi-link]');
  await expectIconOnly(link, 'Vincular assistente');
  await link.click();
  await expect(page.locator('[data-openapi-status]')).toContainText('Assistente vinculado');
  await page.screenshot({ path: info.outputPath('configuracoes-assistente.png'), fullPage: true });
});

test('D001: o visitante sem conta vê a entrada de conexão icon-only e dispara a sessão', async ({ page }) => {
  await mountAssistant(page, { authenticated: false });
  await page.getByText('Conexão por OpenAPI', { exact: true }).click();
  await expectIconOnly(page.locator('[data-openapi-login]'), 'Entrar ou criar conta');
  await page.locator('[data-openapi-login]').click();
  expect(await page.evaluate(() => window.settingsHarness.signInCalls)).toBe(1);
  expect(await page.evaluate(() => window.settingsHarness.connectionRequests.length)).toBe(0);
});

test('O039: salvar e recarregar preferências distinguem ícone, agrupamento e efeito', async ({ page }, info) => {
  await mountPreferences(page);
  const save = page.locator('[data-process-save]');
  const reload = page.locator('[data-process-reload]');
  await expectIconOnly(save, 'Salvar preferências de autoria');
  await expectIconOnly(reload, 'Recarregar preferências salvas, mantendo alterações não salvas');
  const saveIcon = await save.locator('svg').innerHTML();
  const reloadIcon = await reload.locator('svg').innerHTML();
  expect(saveIcon === reloadIcon).toBe(false);
  await expect(page.locator('.authoring-process-actions')).toHaveAttribute('role', 'group');
  await expect(page.locator('.authoring-process-actions')).toHaveAttribute('aria-label', 'Ações das preferências de autoria');
  await expect(save).toBeDisabled();
  await page.locator('[data-process-cadence]').selectOption('batch');
  await expect(save).toBeEnabled();
  await reload.click();
  await expect(page.locator('[data-process-status]')).toContainText('Rascunho mantido');
  await expect(page.locator('[data-process-cadence]')).toHaveValue('batch');
  await page.screenshot({ path: info.outputPath('configuracoes-preferencias.png'), fullPage: true });
});

test('D002: o foco restaurado no painel do assistente não fica fora da rolagem', async ({ page }) => {
  const measure = () => page.evaluate(() => {
    const input = document.querySelector('[data-openapi-field="client-id"]');
    const content = document.querySelector('.account-settings-content');
    const rect = input.getBoundingClientRect();
    const box = content.getBoundingClientRect();
    return { focused: document.activeElement === input, contentScrolls: content.scrollHeight > content.clientHeight + 1,
      inside: rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5 };
  });
  const prepareDeferredGeneration = async () => {
    await page.evaluate(() => { window.settingsHarness.defer = true; });
    await page.locator('[data-openapi-register]').click();
    await page.evaluate(() => {
      document.activeElement.blur();
      const content = document.querySelector('.account-settings-content');
      content.scrollTop = content.scrollHeight;
    });
  };
  await mountAssistant(page);
  await page.getByText('Conexão por OpenAPI', { exact: true }).click();
  await prepareDeferredGeneration();
  await page.evaluate(() => {
    window.scrollIntoViewOriginal = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = () => {};
    window.settingsHarness.finishConnection({ client_id: '10000000-0000-4000-8000-000000000099', client_secret: 'ars_synthetic_secret' });
  });
  await expect(page.locator('[data-openapi-field="client-id"]')).toHaveValue('10000000-0000-4000-8000-000000000099');
  const withoutScroll = await measure();
  expect(withoutScroll.contentScrolls).toBe(true);
  expect(withoutScroll.focused).toBe(true);
  expect(withoutScroll.inside).toBe(false);
  await mountAssistant(page);
  await page.getByText('Conexão por OpenAPI', { exact: true }).click();
  await prepareDeferredGeneration();
  await page.evaluate(() => window.settingsHarness.finishConnection({ client_id: '10000000-0000-4000-8000-000000000099', client_secret: 'ars_synthetic_secret' }));
  await expect(page.locator('[data-openapi-field="client-id"]')).toHaveValue('10000000-0000-4000-8000-000000000099');
  const withScroll = await measure();
  expect(withScroll.focused).toBe(true);
  expect(withScroll.inside).toBe(true);
});
