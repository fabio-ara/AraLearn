import { renderUiIcon } from "./renderUiIcons.js";

const ASSETS = Object.freeze({
  chatGptPrompt: "docs/downloads/authoring/aralearn-chatgpt-system-prompt.md",
  chatGptKnowledgeCore: "docs/downloads/authoring/aralearn-chatgpt-knowledge-core.md",
  chatGptKnowledgeResources: "docs/downloads/authoring/aralearn-chatgpt-knowledge-resources.md"
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
  })
});

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

function selectorButton(documentValue, { action, icon, label, selected = false }) {
  const button = documentValue.createElement("button");
  button.type = "button";
  button.className = "remote-assistant-selector";
  button.dataset[action.kind] = action.value;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(selected));
  button.classList.toggle("is-active", selected);
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

function saveTextFile({ content, fileName, documentValue }) {
  if (
    globalThis.AndroidHost &&
    typeof globalThis.AndroidHost.saveExportFile === "function" &&
    typeof globalThis.btoa === "function"
  ) {
    const saved = globalThis.AndroidHost.saveExportFile(
      encodeBase64Utf8(content),
      fileName,
      "text/markdown;charset=utf-8"
    );
    if (saved) return;
    throw new Error("Não foi possível salvar o arquivo neste dispositivo.");
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
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
  documentValue = globalThis.document,
  navigatorValue = globalThis.navigator,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!documentValue?.createElement) throw new TypeError("Documento obrigatório.");

  const element = documentValue.createElement("section");
  element.className = "remote-assistants-panel";
  element.id = "remote-library-assistants";
  element.dataset.assistantsPanel = "";
  element.setAttribute("aria-label", "Chatbot");
  const configuredProjectUrl = normalizedProjectUrl(projectUrl);
  let catalogAccess = false;
  let profile = "personal";
  let selection = "";
  let status = "";
  let busy = false;

  const setStatus = (value) => {
    status = value;
    const node = element.querySelector("[data-assistant-status]");
    if (node) node.textContent = status;
  };

  const mcpEndpoint = () => {
    if (!configuredProjectUrl) throw new Error("A configuração desta instalação ainda não está disponível.");
    return `${configuredProjectUrl}/functions/v1/aralearn-authoring-mcp`;
  };

  const renderModeSelector = () => {
    if (!catalogAccess) return null;
    const selector = documentValue.createElement("nav");
    selector.className = "remote-assistant-selector-row";
    selector.setAttribute("aria-label", "Modo do chatbot");
    selector.append(
      selectorButton(documentValue, {
        action: { kind: "assistantMode", value: "personal" },
        icon: "account-add",
        label: "Pessoal",
        selected: profile === "personal"
      }),
      selectorButton(documentValue, {
        action: { kind: "assistantMode", value: "catalog" },
        icon: "folder",
        label: "Catálogo",
        selected: profile === "catalog"
      })
    );
    return selector;
  };

  const renderToolSelector = () => {
    const section = documentValue.createElement("section");
    section.className = "remote-assistant-selector-row remote-assistant-tools";
    section.setAttribute("aria-label", "Escolha o que deseja configurar");
    const tools = profile === "catalog"
      ? [
        { value: "action", icon: "edit", label: "ChatGPT" }
      ]
      : [
        { value: "material", icon: "folder", label: "Materiais" },
        { value: "action", icon: "edit", label: "ChatGPT" }
      ];
    section.dataset.toolCount = String(tools.length);
    tools.forEach((tool) => section.append(selectorButton(documentValue, {
      action: { kind: "assistantSection", value: tool.value },
      icon: tool.icon,
      label: tool.label,
      selected: selection === tool.value
    })));
    return section;
  };

  const renderSelectedTool = () => {
    if (!selection) return null;
    const section = documentValue.createElement("section");
    section.className = "remote-assistant-focus";
    section.setAttribute("aria-label", profile === "catalog" ? "Configuração editorial" : "Configuração pessoal");
    if (selection === "material") {
      section.append(
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
          label: MATERIALS.knowledgeResources.label
        })
      );
      return section;
    }
    if (selection === "action") {
      const hint = documentValue.createElement("p");
      hint.className = "remote-assistant-hint";
      hint.textContent = "MCP remoto · autenticação OAuth durante a conexão.";
      section.append(
        hint,
        actionButton(documentValue, {
          action: "copy-mcp-endpoint",
          icon: "copy",
          label: "Copiar endpoint MCP"
        })
      );
      return section;
    }
    return null;
  };

  const render = () => {
    const modeSelector = renderModeSelector();
    const selectedTool = renderSelectedTool();
    const statusNode = documentValue.createElement("p");
    statusNode.className = "remote-assistant-status";
    statusNode.dataset.assistantStatus = "";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.textContent = status;
    element.replaceChildren(...(modeSelector ? [modeSelector] : []), renderToolSelector(), ...(selectedTool ? [selectedTool] : []), statusNode);
    element.querySelectorAll("[data-assistant-action]").forEach((button) => {
      button.disabled = busy;
    });
  };

  element.addEventListener("click", async (event) => {
    const selector = event.target.closest("[data-assistant-mode], [data-assistant-section]");
    if (selector && !busy) {
      const nextProfile = selector.dataset.assistantMode;
      profile = nextProfile || profile;
      selection = selector.dataset.assistantSection || "";
      status = "";
      render();
      return;
    }
    const button = event.target.closest("[data-assistant-action]");
    if (!button || busy) return;
    const action = button.dataset.assistantAction;
    if (action.startsWith("download-")) {
      const material = MATERIALS[action.slice("download-".length)];
      if (!material) return;
      busy = true;
      setStatus("Preparando arquivo…");
      render();
      try {
        const response = await fetchImpl(assetUrl(material.asset, documentValue), { cache: "no-store" });
        if (!response?.ok) throw new Error("Não foi possível baixar o arquivo agora.");
        saveTextFile({ content: await response.text(), fileName: material.fileName, documentValue });
        setStatus("Arquivo salvo.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Não foi possível baixar o arquivo agora.");
      } finally {
        busy = false;
        render();
      }
      return;
    }
    busy = true;
    setStatus("Preparando endpoint…");
    render();
    try {
      await navigatorValue.clipboard.writeText(mcpEndpoint());
      setStatus("Endpoint MCP copiado.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível preparar o endpoint MCP.");
    } finally {
      busy = false;
      render();
    }
  });

  return {
    element,
    setCatalogAccess(value) {
      catalogAccess = Boolean(value);
      if (!catalogAccess && profile === "catalog") {
        profile = "personal";
        selection = "";
      }
    },
    async open({ catalogAccess: nextCatalogAccess = false } = {}) {
      catalogAccess = Boolean(nextCatalogAccess);
      profile = "personal";
      selection = "";
      status = "";
      render();
    },
    close() {
      status = "";
      busy = false;
      selection = "";
      element.replaceChildren();
    }
  };
}
