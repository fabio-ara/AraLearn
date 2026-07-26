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
  button.innerHTML = `${renderUiIcon(icon, "remote-library-action-icon")}<span>${label}</span>`;
  return button;
}

function downloadLink(documentValue, { href, icon, label }) {
  const link = documentValue.createElement("a");
  link.className = "remote-assistant-action";
  link.href = href;
  link.download = "";
  link.title = label;
  link.setAttribute("aria-label", label);
  link.innerHTML = `${renderUiIcon(icon, "remote-library-action-icon")}<span>${label}</span>`;
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
  element.dataset.assistantsPanel = "";
  element.setAttribute("aria-label", "Assistentes");
  const configuredProjectUrl = normalizedProjectUrl(projectUrl);
  let catalogAccess = false;
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

  const renderConnection = () => {
    const section = documentValue.createElement("section");
    section.className = "remote-assistant-setup";
    const heading = documentValue.createElement("h3");
    heading.textContent = "Assistente pessoal";
    const copy = documentValue.createElement("p");
    copy.textContent = "Baixe o material, crie sua chave e use-a somente no seu assistente.";
    const steps = documentValue.createElement("ol");
    steps.className = "remote-assistant-steps";
    ["Baixe o material do ChatGPT.", "Crie ou renove a chave abaixo.", "Cole a Action e a chave no ChatGPT."].forEach((label) => {
      const item = documentValue.createElement("li");
      item.textContent = label;
      steps.append(item);
    });
    const downloads = documentValue.createElement("div");
    downloads.className = "remote-assistant-actions";
    downloads.append(
      downloadLink(documentValue, {
        href: assetUrl(ASSETS.chatGptPackage, documentValue),
        icon: "save",
        label: "Pacote ChatGPT"
      }),
      downloadLink(documentValue, {
        href: assetUrl(ASSETS.chatGptPrompt, documentValue),
        icon: "save",
        label: "Instruções"
      }),
      downloadLink(documentValue, {
        href: assetUrl(ASSETS.chatGptKnowledge, documentValue),
        icon: "save",
        label: "Conhecimento"
      }),
      actionButton(documentValue, {
        action: "download-private-action",
        icon: "save",
        label: "Action"
      }),
      actionButton(documentValue, {
        action: "copy-private-action",
        icon: "copy",
        label: "Copiar Action"
      }),
      actionButton(documentValue, {
        action: "copy-private-mcp",
        icon: "copy",
        label: "Config. MCP"
      })
    );
    section.append(heading, copy, steps, downloads);
    return section;
  };

  const renderCatalog = () => {
    if (!catalogAccess) return null;
    const section = documentValue.createElement("section");
    section.className = "remote-assistant-setup remote-assistant-catalog";
    section.dataset.catalogAssistant = "";
    const heading = documentValue.createElement("h3");
    heading.textContent = "Catálogo";
    const copy = documentValue.createElement("p");
    copy.textContent = "Controle editorial das Coleções. Use somente a sua chave editorial já concedida.";
    const actions = documentValue.createElement("div");
    actions.className = "remote-assistant-actions";
    actions.append(
      actionButton(documentValue, {
        action: "download-catalog-action",
        icon: "save",
        label: "Action do catálogo"
      }),
      actionButton(documentValue, {
        action: "copy-catalog-action",
        icon: "copy",
        label: "Copiar Action"
      }),
      actionButton(documentValue, {
        action: "copy-catalog-mcp",
        icon: "copy",
        label: "Config. MCP"
      })
    );
    section.append(heading, copy, actions);
    return section;
  };

  const render = () => {
    const title = documentValue.createElement("header");
    title.className = "remote-assistants-heading";
    const heading = documentValue.createElement("h2");
    heading.textContent = "Assistentes";
    const description = documentValue.createElement("p");
    description.textContent = "Conecte um assistente sem mexer em arquivos do AraLearn.";
    title.append(heading, description);
    const catalog = renderCatalog();
    const statusNode = documentValue.createElement("p");
    statusNode.className = "remote-assistant-status";
    statusNode.dataset.assistantStatus = "";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.textContent = status;
    element.replaceChildren(title, renderConnection(), integrationsPanel.element, ...(catalog ? [catalog] : []), statusNode);
    element.querySelectorAll("[data-assistant-action]").forEach((button) => {
      button.disabled = busy;
    });
  };

  element.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-assistant-action]");
    if (!button || busy) return;
    const action = button.dataset.assistantAction;
    const profile = action.includes("catalog") ? "catalog" : "private";
    busy = true;
    setStatus(action.endsWith("-mcp") ? "Preparando conexão…" : "Preparando…");
    render();
    try {
      if (action.endsWith("-mcp")) {
        await navigatorValue.clipboard.writeText(mcpConfiguration(profile));
        setStatus("Configuração MCP copiada.");
        return;
      }
      const prepared = await prepareAction(profile);
      if (action.startsWith("copy")) {
        await navigatorValue.clipboard.writeText(prepared);
        setStatus("Action copiada.");
      } else {
        createPreparedDownload(
          documentValue,
          prepared,
          profile === "catalog" ? "aralearn-action-catalogo.yaml" : "aralearn-action-pessoal.yaml"
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
    },
    async open({ catalogAccess: nextCatalogAccess = false } = {}) {
      catalogAccess = Boolean(nextCatalogAccess);
      status = "";
      render();
      await integrationsPanel.open();
    },
    close() {
      status = "";
      busy = false;
      integrationsPanel.close();
      element.replaceChildren();
    }
  };
}
