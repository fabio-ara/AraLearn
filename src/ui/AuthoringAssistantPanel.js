import { renderUiIcon } from "./renderUiIcons.js";
import {
  AUTHORING_CALIBRATION_STORAGE_KEY,
  AUTHORING_DEFAULT_PRESET,
  AUTHORING_PREFERENCE_DEFINITIONS,
  PROTECTED_AUTHORING_CORE_MODULES,
  authoringProfileDiff,
  composeAuthoringPreferences,
  createDefaultAuthoringProfile,
  normalizeAuthoringProfile,
  serializeAuthoringProfile,
  validateAuthoringProfile
} from "../authoring/instructionProfile.js";

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
  fetchImpl = globalThis.fetch,
  storageValue = globalThis.localStorage
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
  let calibrationProfile = createDefaultAuthoringProfile();

  const readCalibration = () => {
    try {
      const stored = storageValue?.getItem?.(AUTHORING_CALIBRATION_STORAGE_KEY);
      calibrationProfile = normalizeAuthoringProfile(stored ? JSON.parse(stored) : null);
    } catch {
      calibrationProfile = createDefaultAuthoringProfile();
    }
  };

  const persistCalibration = () => {
    const validation = validateAuthoringProfile(calibrationProfile);
    if (!validation.valid) throw new TypeError(validation.errors.join(" "));
    storageValue?.setItem?.(
      AUTHORING_CALIBRATION_STORAGE_KEY,
      JSON.stringify(calibrationProfile)
    );
  };

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
    oauthForm.className = "remote-assistant-oauth-form is-setup";
    oauthForm.dataset.assistantOauthSetupForm = "";
    const register = actionButton(documentValue, {
      action: "register-action-oauth",
      icon: "key",
      label: "OAuth",
      accessibleLabel: "Criar credenciais OAuth da Action"
    });
    register.type = "submit";
    oauthForm.append(register);

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

      const linkForm = documentValue.createElement("form");
      linkForm.className = "remote-assistant-oauth-form";
      linkForm.dataset.assistantOauthLinkForm = "";
      const gptInput = documentValue.createElement("input");
      gptInput.type = "text";
      gptInput.name = "gpt-id";
      gptInput.placeholder = "ID do GPT: g-…";
      gptInput.autocomplete = "off";
      gptInput.maxLength = 160;
      gptInput.setAttribute("aria-label", "ID do GPT salvo");
      const link = actionButton(documentValue, {
        action: "link-action-oauth",
        icon: "key",
        label: oauthClient.linked ? "Vinculado" : "Vincular",
        accessibleLabel: "Vincular GPT salvo às credenciais OAuth"
      });
      link.type = "submit";
      if (oauthClient.linked) link.disabled = true;
      linkForm.append(gptInput, link);
      result.push(linkForm);
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

  const renderCalibration = () => {
    const fragment = documentValue.createDocumentFragment();

    const intro = documentValue.createElement("section");
    intro.className = "remote-assistant-calibration-intro";
    const preset = documentValue.createElement("p");
    preset.className = "remote-assistant-calibration-preset";
    preset.textContent = `Preset: ${AUTHORING_DEFAULT_PRESET.title}`;
    const precedence = documentValue.createElement("p");
    precedence.textContent = "Núcleo protegido > conhecimento protegido > preferências pessoais.";
    intro.append(preset, precedence);

    const protectedGroup = documentValue.createElement("details");
    protectedGroup.className = "remote-assistant-protected-core";
    const protectedSummary = documentValue.createElement("summary");
    protectedSummary.textContent = "Núcleo protegido — consultar";
    const protectedList = documentValue.createElement("ul");
    for (const module of PROTECTED_AUTHORING_CORE_MODULES) {
      const item = documentValue.createElement("li");
      const title = documentValue.createElement("strong");
      title.textContent = module.title;
      const description = documentValue.createElement("span");
      description.textContent = module.text;
      item.append(title, description);
      protectedList.append(item);
    }
    protectedGroup.append(protectedSummary, protectedList);

    const form = documentValue.createElement("form");
    form.className = "remote-assistant-calibration-form";
    form.dataset.assistantCalibrationForm = "";
    const changedIds = new Set(authoringProfileDiff(calibrationProfile));
    for (const definition of AUTHORING_PREFERENCE_DEFINITIONS) {
      const field = documentValue.createElement("label");
      field.className = "remote-assistant-calibration-field";
      const heading = documentValue.createElement("span");
      heading.className = "remote-assistant-calibration-heading";
      const title = documentValue.createElement("strong");
      title.textContent = definition.title;
      const badge = documentValue.createElement("small");
      badge.dataset.calibrationBadge = definition.id;
      badge.textContent = changedIds.has(definition.id) ? "Personalizado" : "Preset";
      heading.append(title, badge);
      const help = documentValue.createElement("span");
      help.className = "remote-assistant-calibration-help";
      help.textContent = definition.help;
      const textarea = documentValue.createElement("textarea");
      textarea.name = definition.id;
      textarea.rows = 4;
      textarea.maxLength = 1600;
      textarea.value = calibrationProfile.preferences[definition.id];
      textarea.setAttribute("aria-label", definition.title);
      const effect = documentValue.createElement("small");
      effect.className = "remote-assistant-calibration-effect";
      effect.textContent = definition.effect;
      field.append(heading, help, textarea, effect);
      form.append(field);
    }

    const actions = actionGrid([
      actionButton(documentValue, {
        action: "download-calibrated-instructions",
        icon: "prompt",
        label: "Instruções calibradas"
      }),
      actionButton(documentValue, {
        action: "download-calibration-profile",
        icon: "copy",
        label: "Perfil JSON"
      }),
      actionButton(documentValue, {
        action: "reset-calibration",
        icon: "reposition",
        label: "Restaurar preset"
      })
    ], "remote-assistant-calibration-actions");

    fragment.append(intro, protectedGroup, form, actions);
    return [fragment];
  };

  const render = () => {
    const surfaces = documentValue.createElement("nav");
    surfaces.className = "remote-assistant-surfaces";
    surfaces.setAttribute("role", "tablist");
    surfaces.setAttribute("aria-label", "Tipo de integração");
    surfaces.append(
      surfaceButton("chatbot", "Chatbot", "sparkles"),
      surfaceButton("plugin", "Plugin", "key"),
      surfaceButton("calibration", "Calibração", "prompt")
    );

    const content = documentValue.createElement("section");
    content.className = "remote-assistant-surface-content";
    content.setAttribute("role", "tabpanel");
    const surfaceLabels = { chatbot: "Chatbot", plugin: "Plugin", calibration: "Calibração" };
    content.setAttribute("aria-label", surfaceLabels[activeSurface]);
    const surfaceRenderers = {
      chatbot: renderChatbot,
      plugin: renderPlugin,
      calibration: renderCalibration
    };
    content.append(...surfaceRenderers[activeSurface]());

    const statusNode = documentValue.createElement("p");
    statusNode.className = "remote-assistant-status";
    statusNode.dataset.assistantStatus = "";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.textContent = status;
    element.replaceChildren(surfaces, content, statusNode);
    element.querySelectorAll("[data-assistant-action]").forEach((button) => {
      button.disabled = busy
        || (button.dataset.assistantAction === "link-action-oauth" && oauthClient?.linked === true);
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

  const registerActionOauth = async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Entre no AraLearn para criar as credenciais.");
    const response = await fetchImpl(actionEndpoint("oauth/clients/register"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
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

  const linkActionOauth = async (gptId) => {
    if (!oauthClient?.clientId) throw new Error("Crie as credenciais OAuth primeiro.");
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Entre no AraLearn para vincular o GPT.");
    const response = await fetchImpl(actionEndpoint(`oauth/clients/${oauthClient.clientId}/link`), {
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
    if (!response.ok || payload?.linked !== true) {
      throw new Error(
        typeof payload?.error_description === "string" && payload.error_description
          ? payload.error_description
          : "Não foi possível vincular o GPT salvo."
      );
    }
    oauthClient = Object.freeze({ ...oauthClient, linked: true });
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
    if (action === "reset-calibration") {
      calibrationProfile = createDefaultAuthoringProfile();
      try {
        persistCalibration();
        status = "Preset restaurado.";
      } catch {
        status = "Não foi possível guardar o preset neste dispositivo.";
      }
      render();
      return;
    }
    if (action === "download-calibration-profile") {
      try {
        persistCalibration();
        saveTextFile({
          content: serializeAuthoringProfile(calibrationProfile),
          fileName: "CALIBRACAO-ARALEARN.json",
          mimeType: "application/json;charset=utf-8",
          documentValue
        });
        setStatus("Perfil salvo.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Não foi possível salvar o perfil.");
      }
      return;
    }
    if (action === "download-calibrated-instructions") {
      busy = true;
      setStatus("Compondo instruções…");
      render();
      try {
        persistCalibration();
        const response = await fetchImpl(assetUrl(MATERIALS.instructions.asset, documentValue), {
          cache: "no-store"
        });
        if (!response?.ok) throw new Error("Não foi possível ler as instruções protegidas.");
        const protectedInstructions = (await response.text()).trimEnd();
        saveTextFile({
          content: `${protectedInstructions}\n\n${composeAuthoringPreferences(calibrationProfile)}\n`,
          fileName: "INSTRUCTIONS-CALIBRADAS.md",
          documentValue
        });
        setStatus("Instruções calibradas salvas.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Não foi possível compor as instruções.");
      } finally {
        busy = false;
        render();
      }
      return;
    }
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

  element.addEventListener("input", (event) => {
    const textarea = event.target.closest("[data-assistant-calibration-form] textarea");
    if (!textarea) return;
    calibrationProfile.preferences[textarea.name] = textarea.value;
    const validation = validateAuthoringProfile(calibrationProfile);
    try {
      if (validation.valid) {
        persistCalibration();
        setStatus("Calibração guardada neste dispositivo.");
      } else {
        setStatus(validation.errors[0]);
      }
    } catch {
      setStatus("A calibração continua nesta sessão, mas não pôde ser guardada.");
    }
    const changed = new Set(authoringProfileDiff(calibrationProfile));
    const badge = element.querySelector(`[data-calibration-badge="${textarea.name}"]`);
    if (badge) badge.textContent = changed.has(textarea.name) ? "Personalizado" : "Preset";
  });

  element.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-assistant-oauth-setup-form], [data-assistant-oauth-link-form]");
    if (!form || busy) return;
    event.preventDefault();
    busy = true;
    const linking = form.matches("[data-assistant-oauth-link-form]");
    setStatus(linking ? "Vinculando GPT…" : "Criando credenciais…");
    render();
    try {
      const data = new FormData(form);
      if (linking) {
        await linkActionOauth(normalizedGptId(data.get("gpt-id")));
        setStatus("GPT vinculado.");
      } else {
        await registerActionOauth();
        setStatus("Credenciais criadas.");
      }
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
      readCalibration();
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
