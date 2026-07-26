import { renderUiIcon } from "./renderUiIcons.js";

const ASSETS = Object.freeze({
  chatGptPackage: "docs/downloads/authoring/aralearn-authoring-chatgpt.zip",
  chatGptPrompt: "docs/downloads/authoring/aralearn-chatgpt-system-prompt.md",
  chatGptKnowledge: "docs/downloads/authoring/aralearn-chatgpt-knowledge.md",
  privateAction: "docs/openapi/aralearn-authoring-api-chatgpt-private-action.yaml",
  editorialAction: "docs/openapi/aralearn-authoring-api-chatgpt-editorial.yaml"
});

function normalizedProjectUrl(value) {
  const candidate = String(value || "").trim().replace(/\/+$/u, "");
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/iu.test(candidate)) return "";
  return candidate;
}

function assetUrl(path, documentValue) {
  return new URL(path, documentValue.baseURI).href;
}

function actionButton(documentValue, { action, icon, label }) {
  const button = documentValue.createElement("button");
  button.type = "button";
  button.className = "remote-assistant-action";
  button.dataset.assistantAction = action;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = renderUiIcon(icon, "remote-library-action-icon");
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
  button.innerHTML = renderUiIcon(icon, "remote-library-action-icon");
  return button;
}

function downloadLink(documentValue, { href, icon, label }) {
  const link = documentValue.createElement("a");
  link.className = "remote-assistant-action";
  link.href = href;
  link.download = "";
  link.title = label;
  link.setAttribute("aria-label", label);
  link.innerHTML = renderUiIcon(icon, "remote-library-action-icon");
  return link;
}

function createPreparedDownload(documentValue, content, fileName) {
  const blob = new Blob([content], { type: "application/yaml;charset=utf-8" });
  const href = globalThis.URL.createObjectURL(blob);
  const link = documentValue.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(href), 0);
}

export function createAuthoringAssistantPanel({
  integrationsPanel,
  projectUrl,
  documentValue = globalThis.document,
  navigatorValue = globalThis.navigator,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!integrationsPanel?.element || typeof integrationsPanel.open !== "function") {
    throw new TypeError("Painel de integrações pessoais obrigatório.");
  }
  if (!documentValue?.createElement) throw new TypeError("Documento obrigatório.");

  const element = documentValue.createElement("section");
  element.className = "remote-assistants-panel";
  element.id = "remote-library-assistants";
  element.dataset.assistantsPanel = "";
  element.setAttribute("aria-label", "Assistentes");
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

  const actionTemplate = (profile) => (
    assetUrl(profile === "catalog" ? ASSETS.editorialAction : ASSETS.privateAction, documentValue)
  );

  const mcpConfiguration = (profile) => {
    if (!configuredProjectUrl) throw new Error("A configuração desta instalação ainda não está disponível.");
    const editorial = profile === "catalog";
    return JSON.stringify({
      mcpServers: {
        [editorial ? "AraLearn — catálogo" : "AraLearn — pessoal"]: {
          url: `${configuredProjectUrl}/functions/v1/aralearn-authoring-mcp`,
          headers: {
            "X-AraLearn-API-Key": editorial
              ? "COLE_SUA_CHAVE_EDITORIAL"
              : "COLE_SUA_CHAVE_PESSOAL"
          }
        }
      }
    }, null, 2);
  };

  const prepareAction = async (profile) => {
    if (!configuredProjectUrl) throw new Error("A configuração desta instalação ainda não está disponível.");
    const response = await fetchImpl(actionTemplate(profile), { cache: "no-store" });
    if (!response?.ok) throw new Error("Não foi possível preparar a Action agora.");
    const template = await response.text();
    const prepared = template.replaceAll("https://seu-projeto.supabase.co", configuredProjectUrl);
    if (prepared.includes("seu-projeto.supabase.co")) {
      throw new Error("A Action preparada contém um endereço incompleto.");
    }
    return prepared;
  };

  const renderModeSelector = () => {
    if (!catalogAccess) return null;
    const selector = documentValue.createElement("nav");
    selector.className = "remote-assistant-selector-row";
    selector.setAttribute("aria-label", "Modo do assistente");
    selector.append(
      selectorButton(documentValue, {
        action: { kind: "assistantMode", value: "personal" },
        icon: "account-add",
        label: "Assistente pessoal",
        selected: profile === "personal"
      }),
      selectorButton(documentValue, {
        action: { kind: "assistantMode", value: "catalog" },
        icon: "folder",
        label: "Assistente do catálogo",
        selected: profile === "catalog"
      })
    );
    return selector;
  };

  const renderToolSelector = () => {
    const section = documentValue.createElement("section");
    section.className = "remote-assistant-selector-row";
    section.setAttribute("aria-label", "Escolha o que deseja configurar");
    const tools = profile === "catalog"
      ? [
        { value: "action", icon: "edit", label: "Action do catálogo" },
        { value: "mcp", icon: "graph", label: "Conexão MCP do catálogo" }
      ]
      : [
        { value: "material", icon: "folder", label: "Material do ChatGPT" },
        { value: "action", icon: "edit", label: "Action" },
        { value: "mcp", icon: "graph", label: "Conexão MCP" },
        { value: "key", icon: "key", label: "Chave pessoal" }
      ];
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
    if (selection === "key") return integrationsPanel.element;
    const section = documentValue.createElement("section");
    section.className = "remote-assistant-focus";
    section.setAttribute("aria-label", profile === "catalog" ? "Configuração editorial" : "Configuração pessoal");
    if (selection === "material") {
      section.append(
        downloadLink(documentValue, {
          href: assetUrl(ASSETS.chatGptPackage, documentValue),
          icon: "folder",
          label: "Pacote ChatGPT"
        }),
        downloadLink(documentValue, {
          href: assetUrl(ASSETS.chatGptPrompt, documentValue),
          icon: "prompt",
          label: "Instruções"
        }),
        downloadLink(documentValue, {
          href: assetUrl(ASSETS.chatGptKnowledge, documentValue),
          icon: "card",
          label: "Conhecimento"
        })
      );
      return section;
    }
    if (selection === "action") {
      section.append(
        actionButton(documentValue, {
          action: `download-${profile}-action`,
          icon: "save",
          label: profile === "catalog" ? "Baixar Action do catálogo" : "Baixar Action"
        }),
        actionButton(documentValue, {
          action: `copy-${profile}-action`,
          icon: "copy",
          label: "Copiar Action"
        })
      );
      return section;
    }
    section.append(actionButton(documentValue, {
      action: `copy-${profile}-mcp`,
      icon: "copy",
      label: "Copiar conexão MCP"
    }));
    return section;
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
      integrationsPanel.close();
      render();
      if (selection === "key") await integrationsPanel.open();
      return;
    }
    const button = event.target.closest("[data-assistant-action]");
    if (!button || busy) return;
    const action = button.dataset.assistantAction;
    const actionProfile = action.includes("catalog") ? "catalog" : "private";
    busy = true;
    setStatus(action.endsWith("-mcp") ? "Preparando conexão…" : "Preparando…");
    render();
    try {
      if (action.endsWith("-mcp")) {
        await navigatorValue.clipboard.writeText(mcpConfiguration(actionProfile));
        setStatus("Conexão MCP copiada.");
        return;
      }
      const prepared = await prepareAction(actionProfile);
      if (action.startsWith("copy")) {
        await navigatorValue.clipboard.writeText(prepared);
        setStatus("Action copiada.");
      } else {
        createPreparedDownload(
          documentValue,
          prepared,
          actionProfile === "catalog" ? "aralearn-action-catalogo.yaml" : "aralearn-action-pessoal.yaml"
        );
        setStatus("Action baixada.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível preparar a Action.");
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
      integrationsPanel.close();
      render();
    },
    close() {
      status = "";
      busy = false;
      selection = "";
      integrationsPanel.close();
      element.replaceChildren();
    }
  };
}
