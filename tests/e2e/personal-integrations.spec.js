import { test, expect } from "@playwright/test";

async function mountPanel(page, { failure = null } = {}) {
  await page.goto("/");
  await page.evaluate(async ({ failureValue }) => {
    document.body.replaceChildren();
    const host = document.createElement("main");
    host.id = "integration-test-host";
    host.className = "remote-library-panel";
    const content = document.createElement("div");
    content.className = "remote-library-content";
    host.append(content);
    document.body.append(host);
    const { createPersonalIntegrationsPanel } = await import(
      "/src/ui/PersonalIntegrationsPanel.js"
    );
    const calls = [];
    const items = [
      {
        clientId: "22222222-2222-4222-8222-222222222222",
        name: "Integração expirada",
        keyPrefix: "arl_expirada",
        expiresAt: "2020-01-01T00:00:00.000Z",
        active: false
      },
      {
        clientId: "33333333-3333-4333-8333-333333333333",
        name: "Integração revogada",
        keyPrefix: "arl_revogada",
        expiresAt: "2099-01-01T00:00:00.000Z",
        revokedAt: "2026-07-01T00:00:00.000Z",
        active: false
      }
    ];
    const error = failureValue
      ? Object.assign(new Error(failureValue === "401" ? "JWT expired" : "Acesso negado."), {
        status: Number(failureValue),
        ...(failureValue === "401" ? { authRequired: true, code: "AUTH_REQUIRED" } : {})
      })
      : null;
    const client = {
      async list() {
        calls.push(["list"]);
        if (error) throw error;
        return { items, activeCount: 0, activeLimit: 5 };
      },
      async create(payload) {
        calls.push(["create", payload]);
        return {
          clientId: "44444444-4444-4444-8444-444444444444",
          name: payload.name,
          keyPrefix: "arl_nova",
          expiresAt: "2099-01-01T00:00:00.000Z",
          active: true,
          apiKey: "test-secret-create-once",
          secretAvailable: true
        };
      },
      async rotate(clientId, payload) {
        calls.push(["rotate", clientId, payload]);
        return {
          clientId: "55555555-5555-4555-8555-555555555555",
          name: "Integração renovada",
          keyPrefix: "arl_renovada",
          expiresAt: "2099-01-01T00:00:00.000Z",
          active: true,
          apiKey: "test-secret-rotate-once",
          secretAvailable: true
        };
      },
      async revoke(clientId) {
        calls.push(["revoke", clientId]);
        return { clientId, active: false, revokedAt: new Date().toISOString() };
      }
    };
    let authRequired = 0;
    const copied = [];
    const panel = createPersonalIntegrationsPanel({
      client,
      navigatorValue: { clipboard: { async writeText(value) { copied.push(value); } } },
      onAuthRequired() {
        authRequired += 1;
      }
    });
    content.append(panel.element);
    window.integrationTest = {
      panel,
      calls,
      copied,
      get authRequired() {
        return authRequired;
      }
    };
    await panel.open();
  }, { failureValue: failure });
}

test("painel revela a chave somente até o fechamento e mantém ações acessíveis", async ({ page }) => {
  await mountPanel(page);
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();
  await expect(page.locator('[data-integration-state="expired"]')).toContainText("Expirada");
  const revoked = page.locator('[data-integration-state="revoked"]');
  await expect(revoked.getByRole("button", { name: "Rotacionar chave" })).toBeDisabled();
  await expect(revoked.getByRole("button", { name: "Revogar integração" })).toBeDisabled();
  await expect(page.locator('[data-integration-state="expired"]')
    .getByRole("button", { name: "Rotacionar chave" })).toBeEnabled();
  const createLayout = await page.locator("[data-integration-create]").evaluate((node) => ({
    grid: getComputedStyle(node).gridTemplateColumns.split(" ").length,
    heights: [...node.children].map((child) => Math.round(child.getBoundingClientRect().height)),
    centers: [...node.children].map((child) => Math.round(
      child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2
    ))
  }));
  expect(createLayout.grid).toBe(3);
  expect(new Set(createLayout.heights)).toEqual(new Set([30, 34]));
  expect(Math.max(...createLayout.centers) - Math.min(...createLayout.centers)).toBeLessThanOrEqual(1);

  await page.getByLabel("Nome da integração").fill("Meu agente");
  await page.getByRole("button", { name: "Criar integração" }).click();
  const secret = page.getByLabel("Chave de integração recém-criada");
  await expect(secret).toHaveValue("test-secret-create-once");
  await page.getByRole("button", { name: "Copiar chave" }).click();
  await expect.poll(() => page.evaluate(() => window.integrationTest.copied.at(-1)))
    .toBe("test-secret-create-once");
  await page.getByRole("button", { name: "Ocultar chave" }).click();
  await expect(secret).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.innerHTML.includes(
    "test-secret-create-once"
  ))).toBe(false);

  const expired = page.locator('[data-integration-state="expired"]');
  await expired.getByRole("button", { name: "Rotacionar chave" }).click();
  await expired.getByLabel("Validade da chave").selectOption("180");
  await expired.getByRole("button", { name: "Confirmar rotação" }).click();
  const rotatedSecret = page.getByLabel("Chave de integração recém-criada");
  await expect(rotatedSecret).toHaveValue("test-secret-rotate-once");
  await page.getByRole("button", { name: "Ocultar chave" }).click();
  await expect(rotatedSecret).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.innerHTML.includes(
    "test-secret-rotate-once"
  ))).toBe(false);

  const buttons = page.locator("[data-integrations-panel] button");
  const buttonCount = await buttons.count();
  for (let index = 0; index < buttonCount; index += 1) {
    await expect(buttons.nth(index)).not.toHaveAttribute("title", "");
    await expect(buttons.nth(index)).not.toHaveAttribute("aria-label", "");
  }
  await page.evaluate(() => window.integrationTest.panel.close());
  await expect(page.locator("[data-integration-secret-value]")).toHaveCount(0);
  await expect(page.locator("[data-integrations-panel]")).toBeEmpty();
});

test("401 pede novo acesso e 403 não é tratado como expiração de sessão", async ({ page }) => {
  await mountPanel(page, { failure: "401" });
  await expect(page.locator("[data-integration-status]")).toHaveText("Entre novamente para continuar.");
  await expect.poll(() => page.evaluate(() => window.integrationTest.authRequired)).toBe(1);

  await mountPanel(page, { failure: "403" });
  await expect(page.locator("[data-integration-status]")).toHaveText(
    "Esta sessão não pode gerenciar integrações pessoais."
  );
  await expect.poll(() => page.evaluate(() => window.integrationTest.authRequired)).toBe(0);
});

test("401 durante uma criação não dispara nova leitura remota", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const host = document.createElement("main");
    host.className = "remote-library-panel";
    document.body.append(host);
    const { createPersonalIntegrationsPanel } = await import(
      "/src/ui/PersonalIntegrationsPanel.js"
    );
    const calls = [];
    let authRequired = 0;
    const panel = createPersonalIntegrationsPanel({
      client: {
        async list() {
          calls.push("list");
          return { items: [], activeCount: 0, activeLimit: 5 };
        },
        async create() {
          calls.push("create");
          throw Object.assign(new Error("JWT expired"), { status: 401, authRequired: true });
        }
      },
      onAuthRequired() { authRequired += 1; }
    });
    host.append(panel.element);
    window.integrationAuthTest = { panel, calls, get authRequired() { return authRequired; } };
    await panel.open();
  });
  await page.getByLabel("Nome da integração").fill("Agente");
  await page.getByRole("button", { name: "Criar integração" }).click();
  await expect.poll(() => page.evaluate(() => window.integrationAuthTest.authRequired)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.integrationAuthTest.calls)).toEqual([
    "list",
    "create"
  ]);
});

test("biblioteca abre o painel de assistentes e elimina a chave ao fechar", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const { createRemoteLibraryOverlay } = await import("/src/ui/RemoteLibraryOverlay.js");
    const overlay = createRemoteLibraryOverlay({
      root,
      catalog: {
        async listCollections() { return []; },
        async listLibrary() { return []; },
        async getCurrentUserCapabilities() {
          return { privateImport: true, catalogImport: false };
        }
      },
      authClient: { async signOut() { window.integrationSignedOut = true; } },
      integrationClient: {
        async list() { return { items: [], activeCount: 0, activeLimit: 5 }; },
        async create(payload) {
          return {
            clientId: "44444444-4444-4444-8444-444444444444",
            name: payload.name,
            keyPrefix: "arl_nova",
            expiresAt: "2099-01-01T00:00:00.000Z",
            active: true,
            apiKey: "test-secret-overlay-close",
            secretAvailable: true
          };
        },
        async rotate() {},
        async revoke() {}
      },
      syncEngine: {
        async listRejectedMutations() { return []; },
        async listPendingMutations() { return []; }
      },
      studyPathRepository: {
        loadStudyPaths() { return []; },
        loadCourseSummaries() { return []; }
      },
      async onSignedOut() {}
    });
    window.libraryIntegrationTest = overlay;
    await overlay.open();
  });

  const manage = page.getByRole("tab", { name: "Conectar assistente" });
  await expect(manage).toBeVisible();
  await expect(manage).toHaveText("Assistente");
  await expect(manage).toHaveAttribute("aria-selected", "false");
  await manage.click();
  await expect(manage).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Coleções" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("link", { name: "Instruções" })).toHaveCount(0);
  await expect(page.locator("[data-assistant-mode]")).toHaveCount(0);
  const assistantControls = page.locator("[data-assistant-section]");
  await expect(assistantControls).toHaveCount(4);
  await expect.poll(() => assistantControls.evaluateAll((controls) => controls.every(
    (control) => control.textContent.trim() !== "" && Boolean(control.querySelector("svg"))
  ))).toBe(true);
  await page.getByRole("button", { name: "Materiais" }).click();
  await expect(page.getByRole("link", { name: "Instruções" })).toHaveAttribute(
    "download", "INSTRUCTIONS.md"
  );
  await expect(page.getByRole("link", { name: "Conhecimento" })).toHaveAttribute(
    "download", "KNOWLEDGE.md"
  );
  await page.getByRole("button", { name: "Chave" }).click();
  await page.getByLabel("Nome da integração").fill("Agente do curso");
  await page.getByRole("button", { name: "Criar integração" }).click();
  await expect(page.getByLabel("Chave de integração recém-criada"))
    .toHaveValue("test-secret-overlay-close");
  await page.getByRole("button", { name: "Fechar biblioteca" }).click();
  await expect(page.locator("[data-library-overlay]")).toBeHidden();
  await expect(page.locator("[data-integration-secret-value]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.innerHTML.includes(
    "test-secret-overlay-close"
  ))).toBe(false);

  await page.evaluate(() => window.libraryIntegrationTest.open());
  await manage.click();
  await page.getByRole("button", { name: "Chave" }).click();
  await page.getByLabel("Nome da integração").fill("Outra integração");
  await page.getByRole("button", { name: "Criar integração" }).click();
  await expect(page.getByLabel("Chave de integração recém-criada")).toBeVisible();
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect.poll(() => page.evaluate(() => window.integrationSignedOut)).toBe(true);
  await expect(page.locator("[data-integration-secret-value]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.innerHTML.includes(
    "test-secret-overlay-close"
  ))).toBe(false);
});

test("assistente de catálogo só aparece quando a conta já tem capacidade editorial", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createPersonalIntegrationsPanel } = await import("/src/ui/PersonalIntegrationsPanel.js");
    const { createAuthoringAssistantPanel } = await import("/src/ui/AuthoringAssistantPanel.js");
    const integrations = createPersonalIntegrationsPanel({
      client: {
        async list() { return { items: [], activeCount: 0, activeLimit: 5 }; }
      }
    });
    const panel = createAuthoringAssistantPanel({
      integrationsPanel: integrations,
      projectUrl: "https://jrfkphuhcseqmratijjr.supabase.co",
      navigatorValue: {
        clipboard: {
          async writeText(value) { window.assistantActionCopy = value; }
        }
      },
      fetchImpl: async () => new Response(
        "servers:\n  - url: https://seu-projeto.supabase.co\n",
        { status: 200 }
      )
    });
    document.body.replaceChildren(panel.element);
    await panel.open({ catalogAccess: true });
  });

  await expect(page.getByRole("button", { name: "Catálogo" })).toBeVisible();
  await page.getByRole("button", { name: "Catálogo" }).click();
  await page.getByRole("button", { name: "YAML" }).click();
  await page.getByRole("button", { name: "Copiar YAML" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantActionCopy)).toContain(
    "https://jrfkphuhcseqmratijjr.supabase.co"
  );
  await page.getByRole("button", { name: "MCP" }).click();
  await page.getByRole("button", { name: "Copiar MCP" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantActionCopy)).toContain(
    "aralearn-authoring-mcp"
  );
  await expect.poll(() => page.evaluate(() => window.assistantActionCopy)).toContain(
    "COLE_SUA_CHAVE_EDITORIAL"
  );
});
