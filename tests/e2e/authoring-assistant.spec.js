import { test, expect } from "@playwright/test";
import { homeTrailSnapshotForProject } from "../support/homeTrailSnapshot.js";

test("painel abre Chatbot e separa o Plugin", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const { createLearningSpacesPanel } = await import("/src/ui/LearningSpacesPanel.js");
    const overlay = createLearningSpacesPanel({
      root,
      catalog: {
        async listCollections() { return []; },
        async listTrailItems() {
          return { items: [], hasMore: false, nextCursor: null, capabilities: {} };
        }
      },
      authClient: {
        sessionStore: {},
        getSession: () => ({ user: { id: "10000000-0000-4000-8000-000000000001" } }),
        async getAccessToken() { return "token"; },
        async signOut() { window.assistantSignedOut = true; }
      },
      async onSignedOut() {}
    });
    window.authoringAssistantTest = overlay;
    await overlay.open("chatbot");
  });

  await expect(page.locator("[data-learning-panel]")).toBeVisible();
  const manage = page.getByRole("tab", { name: "Chatbot", exact: true });
  await expect(manage).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Coleções" })).toHaveAttribute("aria-selected", "false");
  await expect(page.locator('[data-assistant-action="surface-chatbot"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-assistant-action="surface-plugin"]')).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("button", { name: "Instruções" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conhecimento essencial" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resources" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Schema" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "ID do GPT salvo" })).toHaveCount(0);
  await page.locator('[data-assistant-action="surface-plugin"]').click();
  await expect(page.getByRole("button", { name: "Nome" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Descrição" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Endpoint" })).toBeVisible();
  await expect(page.getByRole("button", { name: "OAuth" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await expect(page.locator("[data-learning-panel]")).toBeHidden();

  await page.evaluate(() => window.authoringAssistantTest.open("chatbot"));
  await manage.click();
  await expect(page.locator('[data-assistant-action="surface-chatbot"]')).toBeVisible();
  await page.getByRole("button", { name: "Conta" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
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

test("Schema da Action está disponível no artefato público", async ({ page }) => {
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
    const panel = createAuthoringAssistantPanel();
    document.body.replaceChildren(panel.element);
    window.assistantSchemaMaterialTest = { panel, saved };
    await panel.open();
  });

  await page.getByRole("button", { name: "Schema" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantSchemaMaterialTest.saved)).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => {
    const [saved] = window.assistantSchemaMaterialTest.saved;
    const bytes = Uint8Array.from(atob(saved.content), (character) => character.charCodeAt(0));
    return {
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      content: new TextDecoder().decode(bytes)
    };
  })).toMatchObject({
    fileName: "ACTION_OPENAPI.yaml",
    mimeType: "application/yaml;charset=utf-8",
    content: expect.stringContaining("openapi: 3.1.0")
  });
  await expect(page.locator("[data-assistant-status]")).toHaveText("Arquivo salvo.");
});

test("Plugin oferece somente os valores necessários à criação", async ({ page }) => {
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

  await page.getByRole("tab", { name: "Abrir Plugin" }).click();
  await expect(page.getByRole("button", { name: "Nome" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Descrição" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Endpoint" })).toBeVisible();
  await expect(page.locator(".remote-assistant-step")).toHaveCount(0);
});

test("Calibração expõe detalhes editáveis, preserva o núcleo e funciona offline", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createAuthoringAssistantPanel } = await import("/src/ui/AuthoringAssistantPanel.js?calibration-lote-5");
    const saved = [];
    window.AndroidHost = {
      saveExportFile(content, fileName, mimeType) {
        saved.push({ content, fileName, mimeType });
        return true;
      }
    };
    const panel = createAuthoringAssistantPanel({
      fetchImpl: async () => new Response("# Núcleo protegido", { status: 200 })
    });
    document.body.replaceChildren(panel.element);
    window.assistantCalibrationTest = { panel, saved };
    await panel.open();
  });

  await page.getByRole("tab", { name: "Abrir Calibração" }).click();
  await expect(page.getByText("Preset: AraLearn — progressivo e denso")).toBeVisible();
  await expect(page.locator("[data-assistant-calibration-form] textarea")).toHaveCount(4);
  await expect(page.locator(".remote-assistant-protected-core textarea")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Exemplos e contexto" }).fill(
    "Use primeiro um exemplo de rede doméstica e depois amplie para uma organização."
  );
  await expect(page.locator('[data-calibration-badge="examples-and-context"]')).toHaveText("Personalizado");
  await expect(page.locator("[data-assistant-status]")).toContainText("guardada neste dispositivo");

  await page.evaluate(async () => {
    window.assistantCalibrationTest.panel.close();
    await window.assistantCalibrationTest.panel.open();
  });
  await page.getByRole("tab", { name: "Abrir Calibração" }).click();
  await expect(page.getByRole("textbox", { name: "Exemplos e contexto" })).toHaveValue(
    "Use primeiro um exemplo de rede doméstica e depois amplie para uma organização."
  );

  await page.getByRole("button", { name: "Instruções calibradas" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantCalibrationTest.saved.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const saved = window.assistantCalibrationTest.saved[0];
    const bytes = Uint8Array.from(atob(saved.content), (character) => character.charCodeAt(0));
    return { fileName: saved.fileName, content: new TextDecoder().decode(bytes) };
  })).toEqual({
    fileName: "INSTRUCTIONS-CALIBRADAS.md",
    content: expect.stringMatching(/# Núcleo protegido[\s\S]*núcleo pedagógico protegido[\s\S]*rede doméstica/iu)
  });

  await page.getByRole("button", { name: "Restaurar preset" }).click();
  await expect(page.locator('[data-calibration-badge="examples-and-context"]')).toHaveText("Preset");
  await expect(page.locator("[data-assistants-panel]")).toHaveCSS("overflow-x", "visible");
  const overflow = await page.locator("[data-assistants-panel]").evaluate(
    (element) => element.scrollWidth > element.clientWidth + 1
  );
  expect(overflow).toBe(false);
});

test("Chatbot cria OAuth antes de salvar o GPT e o vincula em seguida", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createAuthoringAssistantPanel } = await import("/src/ui/AuthoringAssistantPanel.js");
    window.actionOauthRequest = null;
    window.actionOauthCopied = "";
    const panel = createAuthoringAssistantPanel({
      projectUrl: "https://jrfkphuhcseqmratijjr.supabase.co",
      getAccessToken: async () => "app-session-token",
      navigatorValue: {
        clipboard: {
          async writeText(value) { window.actionOauthCopied = value; }
        }
      },
      fetchImpl: async (url, init) => {
        window.actionOauthRequest = {
          url,
          authorization: init.headers.Authorization,
          body: JSON.parse(init.body)
        };
        if (String(url).endsWith("/link")) {
          return new Response(JSON.stringify({
            client_id: "client-action",
            gpt_id: "g-abcdef123456",
            linked: true
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({
          client_id: "client-action",
          client_secret: "secret-action",
          authorization_url: "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action/oauth/authorize",
          token_url: "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action/oauth/token"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    });
    document.body.replaceChildren(panel.element);
    await panel.open();
  });

  await page.getByRole("button", { name: "Criar credenciais OAuth da Action" }).click();
  await expect(page.locator("[data-assistant-status]")).toContainText("Credenciais criadas");
  await expect.poll(() => page.evaluate(() => window.actionOauthRequest)).toEqual({
    url: "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action/oauth/clients/register",
    authorization: "Bearer app-session-token",
    body: {}
  });
  await page.getByRole("button", { name: "Segredo" }).click();
  await expect.poll(() => page.evaluate(() => window.actionOauthCopied)).toBe("secret-action");
  await page.getByRole("textbox", { name: "ID do GPT salvo" }).fill("g-abcdef123456");
  await page.getByRole("button", { name: "Vincular GPT salvo às credenciais OAuth" }).click();
  await expect(page.locator("[data-assistant-status]")).toHaveText("GPT vinculado.");
  await expect.poll(() => page.evaluate(() => window.actionOauthRequest)).toEqual({
    url: "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-action/oauth/clients/client-action/link",
    authorization: "Bearer app-session-token",
    body: { gptId: "g-abcdef123456" }
  });
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

test("Home distingue a origem dos cursos por ícones acessíveis sem expor estados técnicos", async ({ page }) => {
  const project = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-catalog",
      title: "Fundamentos oficiais",
      goal: "Curso distribuído em Coleções.",
      modules: []
    }, {
      id: "course-private",
      title: "Meu curso",
      goal: "Curso privado da pessoa.",
      modules: []
    }]
  };
  const trailSnapshot = homeTrailSnapshotForProject(project, {
    permissions: {
      "course-catalog": { origin: "catalog", canRemove: true, cardCount: 4 },
      "course-private": {
        origin: "private",
        canEdit: true,
        canDelete: true,
        canRemove: true,
        cardCount: 4
      }
    }
  });
  await page.goto("/");
  await page.evaluate(async ({ project, trailSnapshot }) => {
    document.body.replaceChildren();
    const root = document.createElement("main");
    document.body.append(root);
    const [{ renderHomeScreen }, { createEmptyProgressDocument }] = await Promise.all([
      import("/src/ui/renderHomeScreen.js"),
      import("/src/storage/progressStore.js")
    ]);
    window.renderHomeOriginFixture = (selectedHomeTrailItemId) => {
      root.innerHTML = renderHomeScreen({
        project,
        progress: createEmptyProgressDocument(),
        editorSupport: { trailSnapshot, selectedHomeTrailItemId }
      });
    };
    window.renderHomeOriginFixture(trailSnapshot.items[0].trailItemId);
  }, { project, trailSnapshot });

  await expect(page.getByRole("heading", { name: "Fundamentos oficiais" })).toBeVisible();
  await expect(page.getByLabel("Curso de Coleções", { exact: true })).toBeVisible();
  await page.evaluate((trailItemId) => window.renderHomeOriginFixture(trailItemId),
    trailSnapshot.items[1].trailItemId);
  await expect(page.getByRole("heading", { name: "Meu curso" })).toBeVisible();
  await expect(page.getByLabel("Curso privado", { exact: true })).toBeVisible();
  await expect(page.getByText(/De Coleções|Privado/u, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/publicado|parcial/iu)).toHaveCount(0);
});

test("Plugin copia o mesmo endpoint para conta editorial", async ({ page }) => {
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

  await page.getByRole("tab", { name: "Abrir Plugin" }).click();
  await page.getByRole("button", { name: "Endpoint" }).click();
  await expect.poll(() => page.evaluate(() => window.assistantActionCopy)).toBe(
    "https://jrfkphuhcseqmratijjr.supabase.co/functions/v1/aralearn-authoring-mcp"
  );
});
