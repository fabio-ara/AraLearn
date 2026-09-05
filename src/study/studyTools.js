import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { escapePackageHtml as escape } from "../resources/sdk/html.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import { captureRenderState, restoreRenderState } from "../ui/renderState.js";

export function renderStudyToolActions(studyUnit, registry = RESOURCE_PACKAGE_REGISTRY) {
  const tools = registry.listStudyTools(studyUnit);
  if (!tools.length) return "";
  const button = ({ instance, label, icon }) =>
    `<button class="icon-ghost study-tool-button" type="button" data-study-tool-id="${escape(instance.id)}"` +
    ` aria-label="${escape(label)}" title="${escape(label)}" aria-haspopup="dialog">` +
    renderUiIcon(icon, "home-tab-icon") + "</button>";
  return '<div class="study-tool-actions" role="group" aria-label="Ferramentas da unidade">' +
    tools.slice(0, 2).map(button).join("") + (tools.length > 2
      ? '<button class="icon-ghost study-tool-button" type="button" data-study-tool-id=""' +
        ' aria-label="Mais ferramentas" title="Mais ferramentas" aria-haspopup="dialog">' +
        renderUiIcon("more", "home-tab-icon") + "</button>" : "") + "</div>";
}

export function openStudyResourceUrl(value, documentValue = globalThis.document) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new TypeError("O recurso precisa de um endereço web válido, sem credenciais.");
  }
  const anchor = documentValue.createElement("a");
  anchor.href = url.href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

/** A ferramenta mantém sua interação no pacote; este anfitrião cuida do retorno ao card. */
export function createStudyTools({ root, getStudyUnit, getContextKey, getHost,
  canOpen = () => true, onOpen = () => {}, registry = RESOURCE_PACKAGE_REGISTRY }) {
  let overlay = null;
  let cleanup = null;
  let contextKey = "";
  let unitKey = "";
  let returnState = null;
  let returnId = null;
  let epoch = 0;
  let activeToolId = "";

  function disposeInteraction() {
    if (typeof cleanup === "function") cleanup();
    cleanup = null;
  }

  function inertScreen(inert) {
    const screen = root.querySelector(".app-shell > .screen");
    if (!screen) return;
    screen.inert = inert;
    if (inert) screen.setAttribute("aria-hidden", "true");
    else screen.removeAttribute("aria-hidden");
  }

  function close({ restore = true } = {}) {
    if (!overlay) return false;
    ++epoch;
    disposeInteraction();
    overlay.remove();
    overlay = null;
    inertScreen(false);
    if (restore) {
      restoreRenderState(root, returnState, { restoreFocus: false, restorePageScroll: true });
      const button = [...root.querySelectorAll("[data-study-tool-id]")]
        .find((node) => node.dataset.studyToolId === returnId);
      button?.focus({ preventScroll: true });
    }
    return true;
  }

  function showError(message) {
    const error = overlay?.querySelector("[data-study-tool-error]");
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
  }

  async function showTool(toolId) {
    if (!overlay) return;
    const ownEpoch = ++epoch;
    disposeInteraction();
    activeToolId = toolId;
    const tools = registry.listStudyTools(getStudyUnit());
    const tool = tools.find(({ instance }) => instance.id === toolId);
    const body = overlay.querySelector(".study-tool-body");
    const title = overlay.querySelector("h2");
    if (!toolId) {
      title.textContent = "Ferramentas";
      body.innerHTML = '<ul class="study-tool-menu">' + tools.map(({ instance, label, icon }) =>
        `<li><button type="button" data-open-study-tool="${escape(instance.id)}">` +
        renderUiIcon(icon, "home-tab-icon") + `<span>${escape(label)}</span>` +
        (instance.data?.title ? `<small>${escape(instance.data.title)}</small>` : "") + "</button></li>")
        .join("") + "</ul>";
      body.querySelectorAll("[data-open-study-tool]").forEach((button) =>
        button.addEventListener("click", () => void showTool(button.dataset.openStudyTool)));
      return;
    }
    if (!tool) { close(); return; }
    title.textContent = tool.label;
    body.innerHTML = '<p role="status">Preparando ferramenta…</p>';
    try {
      const host = await getHost(tool.instance);
      if (epoch !== ownEpoch || !overlay) return;
      body.innerHTML = registry.renderInstance(tool.instance, "content", {
        studyUnit: getStudyUnit(), canRevealAnswers: host.canRevealAnswers === true,
        toolOpened: true
      }) + '<p class="study-tool-error" data-study-tool-error role="alert" hidden></p>';
      cleanup = registry.bindToolInteraction(tool.instance, body, {
        ...host, onError: showError
      });
    } catch (error) {
      if (epoch !== ownEpoch || !overlay) return;
      body.innerHTML = '<p class="study-tool-error" data-study-tool-error role="alert"></p>' +
        '<button type="button" data-retry-study-tool>Tentar novamente</button>';
      showError(error?.message || "Não foi possível abrir esta ferramenta.");
      body.querySelector("[data-retry-study-tool]").addEventListener("click", () => void showTool(toolId));
    }
  }

  function open(button) {
    if (!canOpen() || !getStudyUnit()) return false;
    onOpen();
    close({ restore: false });
    returnState = captureRenderState(root);
    returnId = button.dataset.studyToolId;
    contextKey = getContextKey();
    unitKey = JSON.stringify(getStudyUnit());
    overlay = root.ownerDocument.createElement("section");
    overlay.className = "editor-overlay study-tools-overlay";
    overlay.innerHTML = '<article class="editor-sheet study-tools-panel" role="dialog" aria-modal="true"' +
      ' aria-labelledby="study-tool-title"><header class="editor-head">' +
      '<button class="icon-ghost" type="button" data-close-study-tool aria-label="Fechar ferramenta" title="Fechar ferramenta">' +
      renderUiIcon("remove-state", "home-tab-icon") + '</button><h2 id="study-tool-title">Ferramenta</h2>' +
      '</header><div class="editor-body study-tool-body"></div></article>';
    root.querySelector(".app-shell").append(overlay);
    inertScreen(true);
    overlay.querySelector("[data-close-study-tool]").addEventListener("click", () => close());
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== "Tab") return;
      const focusable = [...overlay.querySelectorAll("button, a[href], input, select, textarea, [tabindex='0']")]
        .filter((node) => !node.disabled && !node.closest("[hidden]") && node.getClientRects().length);
      const index = focusable.indexOf(root.ownerDocument.activeElement);
      if (!focusable.length) return;
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) {
        event.preventDefault(); focusable[0].focus();
      }
    });
    overlay.querySelector("[data-close-study-tool]").focus();
    void showTool(returnId);
    return true;
  }

  return Object.freeze({
    isOpen: () => Boolean(overlay),
    close,
    beforeRender() { overlay?.remove(); },
    afterRender() {
      root.querySelectorAll("[data-study-tool-id]").forEach((button) =>
        button.addEventListener("click", () => open(button)));
      if (!overlay) return;
      if (!canOpen() || contextKey !== getContextKey() || unitKey !== JSON.stringify(getStudyUnit())) {
        close({ restore: false }); return;
      }
      root.querySelector(".app-shell")?.append(overlay);
      inertScreen(true);
    },
    refresh() { if (overlay) void showTool(activeToolId); },
    destroy() { close({ restore: false }); }
  });
}
