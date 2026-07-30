import { renderUiIcon } from "./renderUiIcons.js";

const ASSETS = Object.freeze({
  chatGptPrompt: "docs/downloads/authoring/aralearn-chatgpt-system-prompt.md",
  chatGptKnowledgeCore: "docs/downloads/authoring/aralearn-chatgpt-knowledge-core.md",
  chatGptKnowledgeResources: "docs/downloads/authoring/aralearn-chatgpt-knowledge-resources.md",
  chatGptActionSchema: "docs/downloads/authoring/aralearn-chatgpt-action-openapi.yaml"
});

const MATERIALS = Object.freeze({
  instructions: Object.freeze({
    asset: ASSETS.chatGptPrompt,
    fileName: "INSTRUCTIONS.md",
    label: "Instruções"
  }),
  knowledgeCore: Object.freeze({
    asset: ASSETS.chatGptKnowledgeCore,
    fileName: "KNOWLEDGE_CORE.md",
    label: "Conhecimento essencial"
  }),
  knowledgeResources: Object.freeze({
    asset: ASSETS.chatGptKnowledgeResources,
    fileName: "KNOWLEDGE_RESOURCES.md",
    label: "Resources didáticos"
  }),
  actionSchema: Object.freeze({
    asset: ASSETS.chatGptActionSchema,
    fileName: "ACTION_OPENAPI.yaml",
    label: "Schema",
    mimeType: "application/yaml;charset=utf-8"
  })
});

const PLUGIN_DESCRIPTION = "Lê, cria, reorganiza, revisa e publica cursos AraLearn autorizados.";
const CHATGPT_OAUTH_SCOPE = "openid email";

function normalizedProjectUrl(value) {
  const candidate = String(value || "").trim().replace(/\/+$/u, "");
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/iu.test(candidate)) return "";
  return candidate;
}

function assetUrl(path, documentValue) {
  return new URL(path, documentValue.baseURI).href;
}

function actionButton(documentValue, { action, icon, label, accessibleLabel = label }) {
  const button = documentValue.createElement("button");
  button.type = "button";
  button.className = "remote-assistant-action";
  button.dataset.assistantAction = action;
  button.title = accessibleLabel;
  button.setAttribute("aria-label", accessibleLabel);
  button.innerHTML = `${renderUiIcon(icon, "remote-library-action-icon")}<span>${label}</span>`;
  return button;
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return globalThis.btoa(binary);
}

function saveTextFile({
  content,
  fileName,
  mimeType = "text/markdown;charset=utf-8",
  documentValue
}) {
  if (
    globalThis.AndroidHost &&
    typeof globalThis.AndroidHost.saveExportFile === "function" &&
    typeof globalThis.btoa === "function"
  ) {
    const saved = globalThis.AndroidHost.saveExportFile(
      encodeBase64Utf8(content),
      fileName,
      mimeType
    );
    if (saved) return;
    throw new Error("Não foi possível salvar o arquivo neste dispositivo.");
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = documentValue.createElement("a");
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  documentValue.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function createAuthoringAssistantPanel({
  projectUrl,
  getAccessToken = async () => null,
  documentValue = globalThis.document,
  navigatorValue = globalThis.navigator,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!documentValue?.createElement) throw new TypeError("Documento obrigatório.");

  const element = documentValue.createElement("section");
  element.className = "remote-assistants-panel";
  element.id = "remote-library-assistants";
  element.dataset.assistantsPanel = "";
  element.setAttribute("aria-label", "Autoria com ChatGPT");
  const configuredProjectUrl = normalizedProjectUrl(projectUrl);
  let status = "";
  let busy = false;
  let activeSurface = "chatbot";
  let oauthClient = null;

  const setStatus = (value) => {
    status = value;
    const node = element.querySelector("[data-assistant-status]");
    if (node) node.textContent = status;
  };

  const mcpEndpoint = () => {
    if (!configuredProjectUrl) throw new Error("A configuração desta instalação ainda não está disponível.");
    return `${configuredProjectUrl}/functions/v1/aralearn-authoring-mcp`;
  };

  const actionEndpoint = (path) => {
    if (!configuredProjectUrl) throw new Error("A configuração desta instalação ainda não está disponível.");
    return `${configuredProjectUrl}/functions/v1/aralearn-authoring-action/${path}`;
  };

  const surfaceButton = (surface, label, icon) => {
    const button = actionButton(documentValue, {
      action: `surface-${surface}`,
      icon,
      label,
      accessibleLabel: `Abrir ${label}`
    });
    button.classList.add("remote-assistant-surface");
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(activeSurface === surface));
    button.tabIndex = activeSurface === surface ? 0 : -1;
    if (activeSurface === surface) button.classList.add("is-active");
    return button;
  };

  const actionGrid = (buttons, className = "") => {
    const grid = documentValue.createElement("div");
    grid.className = `remote-assistant-actions${className ? ` ${className}` : ""}`;
    grid.append(...buttons);
    return grid;
  };

  const renderChatbot = () => {
    const materials = actionGrid([
      actionButton(documentValue, {
        action: "download-instructions",
        icon: "prompt",
        label: MATERIALS.instructions.label
      }),
      actionButton(documentValue, {
        action: "download-knowledgeCore",
        icon: "card",
        label: MATERIALS.knowledgeCore.label
      }),
      actionButton(documentValue, {
        action: "download-knowledgeResources",
        icon: "card",
        label: "Resources"
      }),
      actionButton(documentValue, {
        action: "download-actionSchema",
        icon: "copy",
        label: MATERIALS.actionSchema.label
      })
    ], "remote-assistant-chatbot-materials");

    const oauthForm = documentValue.createElement("form");
    oauthForm.className = "remote-assistant-oauth-form";
    oauthForm.dataset.assistantOauthForm = "";
    const input = documentValue.createElement("input");
    input.type = "text";
    input.name = "gpt-id";
    input.placeholder = "ID do GPT: g-…";
    input.autocomplete = "off";
    input.maxLength = 160;
    input.setAttribute("aria-label", "ID do GPT personalizado");
    const register = actionButton(documentValue, {
      action: "register-action-oauth",
      icon: "key",
      label: "OAuth",
      accessibleLabel: "Criar credenciais OAuth da Action"
    });
    register.type = "submit";
    oauthForm.append(input, register);

    const result = [materials, oauthForm];
    if (oauthClient) {
      result.push(actionGrid([
        actionButton(documentValue, {
          action: "copy-oauth-client-id",
          icon: "copy",
          label: "ID do cliente"
        }),
        actionButton(documentValue, {
          action: "copy-oauth-client-secret",
          icon: "key",
          label: "Segredo"
        }),
        actionButton(documentValue, {
          action: "copy-oauth-authorization-url",
          icon: "copy",
          label: "Autorização"
        }),
        actionButton(documentValue, {
          action: "copy-oauth-token-url",
          icon: "copy",
          label: "Token URL"
        }),
        actionButton(documentValue, {
          action: "copy-oauth-scope",
          icon: "copy",
          label: "Escopo"
        }),
        actionButton(documentValue, {
          action: "copy-oauth-method",
          icon: "copy",
          label: "POST"
        })
      ], "remote-assistant-oauth-values"));
    }
    return result;
  };

  const renderPlugin = () => [
    actionGrid([
      actionButton(documentValue, {
        action: "copy-plugin-name",
        icon: "copy",
        label: "Nome"
      }),
      actionButton(documentValue, {
        action: "copy-plugin-description",
        icon: "copy",
        label: "Descrição"
      }),
      actionButton(documentValue, {
        action: "copy-mcp-endpoint",
        icon: "copy",
        label: "Endpoint"
      }),
      actionButton(documentValue, {
        action: "copy-plugin-auth",
        icon: "key",
        label: "OAuth"
      })
    ], "remote-assistant-plugin-values")
  ];

  const render = () => {
    const surfaces = documentValue.createElement("nav");
    surfaces.className = "remote-assistant-surfaces";
    surfaces.setAttribute("role", "tablist");
    surfaces.setAttribute("aria-label", "Tipo de integração");
    surfaces.append(
      surfaceButton("chatbot", "Chatbot", "sparkles"),
      surfaceButton("plugin", "Plugin", "key")
    );

    const content = documentValue.createElement("section");
    content.className = "remote-assistant-surface-content";
    content.setAttribute("role", "tabpanel");
    content.setAttribute("aria-label", activeSurface === "chatbot" ? "Chatbot" : "Plugin");
    content.append(...(activeSurface === "chatbot" ? renderChatbot() : renderPlugin()));

    const statusNode = documentValue.createElement("p");
    statusNode.className = "remote-assistant-status";
    statusNode.dataset.assistantStatus = "";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.textContent = status;
    element.replaceChildren(surfaces, content, statusNode);
    element.querySelectorAll("[data-assistant-action]").forEach((button) => {
      button.disabled = busy;
    });
  };

  const copyValue = async (value, message) => {
    await navigatorValue.clipboard.writeText(value);
    setStatus(message);
  };

  const normalizedGptId = (value) => {
    const candidate = String(value || "").trim();
    if (!/^g-[A-Za-z0-9-]{6,150}$/u.test(candidate)) {
      throw new Error("Informe o ID do GPT salvo.");
    }
    return candidate;
  };

  const registerActionOauth = async (gptId) => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Entre no AraLearn para criar as credenciais.");
    const response = await fetchImpl(actionEndpoint("oauth/clients/register"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ gptId })
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // A mensagem pública abaixo não depende de detalhes internos do provedor.
    }
    if (!response.ok || !payload?.client_id || !payload?.client_secret) {
      throw new Error("Não foi possível criar as credenciais OAuth.");
    }
    oauthClient = Object.freeze({
      clientId: String(payload.client_id),
      clientSecret: String(payload.client_secret),
      authorizationUrl: String(
        payload.authorization_url || actionEndpoint("oauth/authorize")
      ),
      tokenUrl: String(payload.token_url || actionEndpoint("oauth/token")),
      scope: String(payload.scope || CHATGPT_OAUTH_SCOPE),
      method: "Padrão (solicitação POST)"
    });
  };

  element.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-assistant-action]");
    if (!button || busy) return;
    const action = button.dataset.assistantAction;
    if (action.startsWith("surface-")) {
      activeSurface = action.slice("surface-".length);
      status = "";
      render();
      return;
    }
    if (action === "register-action-oauth") return;
    if (action.startsWith("download-")) {
      const material = MATERIALS[action.slice("download-".length)];
      if (!material) return;
      busy = true;
      setStatus("Preparando arquivo…");
      render();
      try {
        const response = await fetchImpl(assetUrl(material.asset, documentValue), { cache: "no-store" });
        if (!response?.ok) throw new Error("Não foi possível baixar o arquivo agora.");
        saveTextFile({
          content: await response.text(),
          fileName: material.fileName,
          mimeType: material.mimeType,
          documentValue
        });
        setStatus("Arquivo salvo.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Não foi possível baixar o arquivo agora.");
      } finally {
        busy = false;
        render();
      }
      return;
    }
    const values = {
      "copy-plugin-name": ["AraLearn", "Nome copiado."],
      "copy-plugin-description": [PLUGIN_DESCRIPTION, "Descrição copiada."],
      "copy-mcp-endpoint": [null, "Endpoint copiado."],
      "copy-plugin-auth": ["OAuth", "Autenticação copiada."],
      "copy-oauth-client-id": [oauthClient?.clientId, "ID do cliente copiado."],
      "copy-oauth-client-secret": [oauthClient?.clientSecret, "Segredo copiado."],
      "copy-oauth-authorization-url": [oauthClient?.authorizationUrl, "URL de autorização copiada."],
      "copy-oauth-token-url": [oauthClient?.tokenUrl, "Token URL copiada."],
      "copy-oauth-scope": [oauthClient?.scope, "Escopo copiado."],
      "copy-oauth-method": [oauthClient?.method, "Método copiado."]
    };
    if (!Object.hasOwn(values, action)) return;
    busy = true;
    render();
    try {
      const [configuredValue, message] = values[action];
      await copyValue(action === "copy-mcp-endpoint" ? mcpEndpoint() : configuredValue, message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível copiar este valor.");
    } finally {
      busy = false;
      render();
    }
  });

  element.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-assistant-oauth-form]");
    if (!form || busy) return;
    event.preventDefault();
    busy = true;
    setStatus("Criando credenciais…");
    render();
    try {
      const data = new FormData(form);
      await registerActionOauth(normalizedGptId(data.get("gpt-id")));
      setStatus("Credenciais criadas. Copie o segredo agora.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível criar as credenciais OAuth.");
    } finally {
      busy = false;
      render();
    }
  });

  return {
    element,
    setCatalogAccess(value) {
      void value;
    },
    async open({ catalogAccess: nextCatalogAccess = false } = {}) {
      void nextCatalogAccess;
      status = "";
      activeSurface = "chatbot";
      render();
    },
    close() {
      status = "";
      busy = false;
      oauthClient = null;
      element.replaceChildren();
    }
  };
}
