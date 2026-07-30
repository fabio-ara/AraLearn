import { test, expect } from "@playwright/test";

test("evento de autoria abre a configuração guiada do plugin e do GPT", async ({ page }) => {
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
        async getCurrentUserCapabilities() { return {}; }
      },
      authClient: { async signOut() { window.assistantSignedOut = true; } },
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
    window.authoringAssistantTest = overlay;
    document.dispatchEvent(new CustomEvent("aralearn:open-authoring-assistant"));
  });

  await expect(page.locator("[data-library-overlay]")).toBeVisible();
  const manage = page.getByRole("tab", { name: "Abrir chatbot" });
  await expect(manage).toBeVisible();
  await expect(manage).toHaveText("Chatbot");
  await expect(manage).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Coleções" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("heading", { name: "Configurar GPT" })).toBeVisible();
  await expect(page.getByText("No ChatGPT: Plugins → Novo plugin → URL do servidor → OAuth.")).toBeVisible();
  await expect(page.getByText("Crie um GPT, cole as instruções e envie os dois conhecimentos.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar URL do servidor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Instruções" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conhecimento essencial" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resources didáticos" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar biblioteca" }).click();
  await expect(page.locator("[data-library-overlay]")).toBeHidden();

  await page.evaluate(() => window.authoringAssistantTest.open());
  await manage.click();
  await expect(page.getByRole("heading", { name: "Configurar GPT" })).toBeVisible();
  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantSignedOut)).toBe(true);
});

test("materiais do GPT usam o seletor nativo de arquivos no Android", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createAuthoringAssistantPanel } = await import("/src/ui/AuthoringAssistantPanel.js");
    const saved = [];
    window.AndroidHost = {
      saveExportFile(content, fileName, mimeType) {
        saved.push({ content, fileName, mimeType });
        return true;
      }
    };
    const panel = createAuthoringAssistantPanel({
      fetchImpl: async () => new Response("Instruções com acentuação.", { status: 200 })
    });
    document.body.replaceChildren(panel.element);
    window.assistantMaterialTest = { panel, saved };
    await panel.open();
  });

  await page.getByRole("button", { name: "Instruções" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantMaterialTest.saved)).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => {
    const [saved] = window.assistantMaterialTest.saved;
    const bytes = Uint8Array.from(atob(saved.content), (character) => character.charCodeAt(0));
    return {
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      content: new TextDecoder().decode(bytes)
    };
  })).toEqual({
    fileName: "INSTRUCTIONS.md",
    mimeType: "text/markdown;charset=utf-8",
    content: "Instruções com acentuação."
  });
  await expect(page.locator("[data-assistant-status]")).toHaveText("Arquivo salvo.");
});

test("Chatbot orienta a criação do plugin MCP", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createAuthoringAssistantPanel } = await import("/src/ui/AuthoringAssistantPanel.js");
    const panel = createAuthoringAssistantPanel({
      navigatorValue: { clipboard: { async writeText() {} } }
    });
    document.body.replaceChildren(panel.element);
    window.assistantActionHeaderTest = { panel };
    await panel.open();
  });

  await expect(page.getByText("No ChatGPT: Plugins → Novo plugin → URL do servidor → OAuth.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar URL do servidor" })).toBeVisible();
});

test("consentimento OAuth identifica cliente, permissões e conclui a autorização", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderOAuthAuthorizationConsent } = await import(
      "/src/ui/OAuthAuthorizationConsent.js"
    );
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    window.oauthConsentCalls = [];
    window.oauthConsentRedirect = "";
    await renderOAuthAuthorizationConsent({
      root,
      authorizationId: "authorization-123",
      authClient: {
        async getOAuthAuthorizationDetails(authorizationId) {
          window.oauthConsentCalls.push(["details", authorizationId]);
          return {
            authorization_id: authorizationId,
            client: { id: "client-1", name: "ChatGPT de autoria" },
            user: { id: "user-1", email: "autora@example.com" },
            scope: "openid email"
          };
        },
        async decideOAuthAuthorization(authorizationId, action) {
          window.oauthConsentCalls.push(["decision", authorizationId, action]);
          return {
            redirect_url: "https://chatgpt.com/oauth/callback?code=resultado"
          };
        }
      },
      locationValue: {
        assign(value) {
          window.oauthConsentRedirect = value;
        }
      }
    });
  });

  await expect(page.getByRole("heading", { name: "Autorizar conexão" })).toBeVisible();
  await expect(page.getByText("ChatGPT de autoria")).toBeVisible();
  await expect(page.getByText("autora@example.com")).toBeVisible();
  await expect(page.getByText("Confirmar sua identidade")).toBeVisible();
  await expect(page.getByText("Ler seu endereço de e-mail")).toBeVisible();
  await page.getByRole("button", { name: "Autorizar conexão" }).click();
  await expect.poll(() => page.evaluate(() => window.oauthConsentRedirect)).toBe(
    "https://chatgpt.com/oauth/callback?code=resultado"
  );
  await expect.poll(() => page.evaluate(() => window.oauthConsentCalls)).toEqual([
    ["details", "authorization-123"],
    ["decision", "authorization-123", "approve"]
  ]);
});

test("trilhas distinguem cursos de catálogo e privados sem inferir a origem", async ({ page }) => {
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
        async listLibrary() {
          return [
            { course_id: "catalog-course", title: "Curso de coleção", course_origin: "catalog" },
            { course_id: "private-course", title: "Curso pessoal", course_origin: "private" }
          ];
        },
        async getCurrentUserCapabilities() { return {}; }
      },
      authClient: { async signOut() {} },
      syncEngine: {
        async listRejectedMutations() { return []; },
        async listPendingMutations() { return []; }
      },
      studyPathRepository: {
        loadStudyPaths() { return []; },
        loadCourseSummaries() { return []; }
      }
    });
    await overlay.open();
  });

  await page.getByRole("tab", { name: "Trilhas" }).click();
  const catalogCourse = page.locator('[data-course-row][data-course-id="catalog-course"]');
  const privateCourse = page.locator('[data-course-row][data-course-id="private-course"]');
  await expect(catalogCourse).toHaveAttribute("data-course-origin", "catalog");
  await expect(privateCourse).toHaveAttribute("data-course-origin", "private");
  await expect(catalogCourse).toHaveClass(/is-catalog/u);
  await expect(privateCourse).toHaveClass(/is-private/u);
  await expect(page.locator(".remote-course-origin")).toHaveCount(0);
  const colors = await Promise.all([catalogCourse, privateCourse].map((row) => row.evaluate((node) => ({
    border: getComputedStyle(node).borderTopColor,
    background: getComputedStyle(node).backgroundColor
  }))));
  expect(colors[0]).not.toEqual(colors[1]);
});

test("configuração única do GPT também funciona para conta editorial", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createAuthoringAssistantPanel } = await import("/src/ui/AuthoringAssistantPanel.js");
    const panel = createAuthoringAssistantPanel({
      projectUrl: "https://jrfkphuhcseqmratijjr.supabase.co",
      navigatorValue: {
        clipboard: {
          async writeText(value) { window.assistantActionCopy = value; }
        }
      }
    });
    document.body.replaceChildren(panel.element);
    await panel.open({ catalogAccess: true });
  });

  await page.getByRole("button", { name: "Copiar URL do servidor" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantActionCopy)).toBe(
    "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-mcp"
  );
});
