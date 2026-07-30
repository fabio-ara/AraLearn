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

  const setupStep = ({ number, title, hint, actions }) => {
    const section = documentValue.createElement("section");
    section.className = "remote-assistant-step";
    const heading = documentValue.createElement("h3");
    heading.textContent = `${number}. ${title}`;
    const copy = documentValue.createElement("p");
    copy.textContent = hint;
    const controls = documentValue.createElement("div");
    controls.className = "remote-assistant-step-actions";
    controls.append(...actions);
    section.append(heading, copy, controls);
    return section;
  };

  const renderSetup = () => {
    const title = documentValue.createElement("h2");
    title.className = "remote-assistant-title";
    title.textContent = "Configurar GPT";
    return [
      title,
      setupStep({
        number: 1,
        title: "Plugin",
        hint: "No ChatGPT: Plugins → Novo plugin → URL do servidor → OAuth.",
        actions: [actionButton(documentValue, {
          action: "copy-mcp-endpoint",
          icon: "copy",
          label: "Copiar URL do servidor"
        })]
      }),
      setupStep({
        number: 2,
        title: "GPT personalizado",
        hint: "Crie um GPT, ative o plugin AraLearn, cole as instruções e envie os dois conhecimentos.",
        actions: [
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
        ]
      })
    ];
  };

  const render = () => {
    const statusNode = documentValue.createElement("p");
    statusNode.className = "remote-assistant-status";
    statusNode.dataset.assistantStatus = "";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.textContent = status;
    element.replaceChildren(...renderSetup(), statusNode);
    element.querySelectorAll("[data-assistant-action]").forEach((button) => {
      button.disabled = busy;
    });
  };

  element.addEventListener("click", async (event) => {
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
      void value;
    },
    async open({ catalogAccess: nextCatalogAccess = false } = {}) {
      void nextCatalogAccess;
      status = "";
      render();
    },
    close() {
      status = "";
      busy = false;
      element.replaceChildren();
    }
  };
}
