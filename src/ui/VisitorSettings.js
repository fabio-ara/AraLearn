import { renderUiIcon } from "./renderUiIcons.js";
import { publicErrorMessage } from "./publicErrorMessage.js";

export function renderVisitorSettings(root, {
  onSignIn,
  onClearDeviceData,
  confirmValue = globalThis.confirm?.bind(globalThis) || (() => false)
} = {}) {
  const groups = [["account", "account", "Conta"], ["appearance", "theme-system", "Aparência"],
    ["device", "offline", "Sincronização e dados deste dispositivo"], ["authoring", "intent", "Preferências de autoria"]];
  root.innerHTML = `<section class="account-settings-overlay contextual-settings" data-visitor-settings hidden aria-label="Configurações">
    <div class="account-settings-backdrop" data-visitor-close></div>
    <div class="account-settings-sheet courses-home-screen" role="dialog" aria-modal="true" aria-labelledby="visitor-settings-title" tabindex="-1">
      <header class="account-settings-header"><div class="account-settings-title-row">
        <button class="icon-ghost account-settings-back" type="button" data-visitor-back title="Voltar" aria-label="Voltar" hidden>${renderUiIcon("arrow-left", "account-settings-action-icon")}</button>
        <h1 class="account-settings-title" id="visitor-settings-title">Configurações</h1>
        <button class="icon-ghost account-settings-close" type="button" data-visitor-close title="Fechar" aria-label="Fechar">${renderUiIcon("remove-state", "account-settings-action-icon")}</button>
      </div></header>
      <div class="account-settings-content">
        <nav class="account-settings-view account-settings-groups" data-visitor-view="main" aria-label="Grupos de Configurações">
          ${groups.map(([view, icon, label]) => `<button class="account-settings-subview-entry" type="button" data-visitor-open-view="${view}"><span>${renderUiIcon(icon, "account-settings-action-icon")}<strong>${label}</strong></span>${renderUiIcon("arrow-right", "account-settings-action-icon")}</button>`).join("")}
        </nav>
        <section class="account-settings-view" data-visitor-view="account" hidden aria-label="Conta">
          <p class="account-settings-group-copy">Você está estudando sem conta. Seu progresso e as marcas Rever ficam neste dispositivo.</p>
          <button class="account-settings-subview-entry" type="button" data-visitor-signin><span>${renderUiIcon("sign-in", "account-settings-action-icon")}<strong>Entrar ou criar conta</strong></span>${renderUiIcon("arrow-right", "account-settings-action-icon")}</button>
        </section>
        <section class="account-settings-view" data-visitor-view="appearance" hidden aria-label="Aparência">
          <p class="account-settings-group-copy">Tema neste dispositivo</p>
          <div class="theme-choice" role="group" aria-label="Aparência">
            ${[["system", "do sistema"], ["light", "claro"], ["dark", "escuro"]].map(([value, label]) => `<button class="theme-choice-button" type="button" data-visitor-theme="${value}" title="Tema ${label}" aria-label="Tema ${label}">${renderUiIcon(`theme-${value}`, "theme-choice-icon")}</button>`).join("")}
          </div>
          <p class="account-settings-group-copy">Sistema acompanha o tema do dispositivo; claro e escuro mantêm a escolha indicada.</p>
        </section>
        <section class="account-settings-view account-device-data" data-visitor-view="device" hidden aria-label="Sincronização e dados deste dispositivo">
          <p class="account-settings-group-copy">O estudo sem conta fica neste dispositivo. Para sincronizar o progresso entre dispositivos, entre em uma conta e acrescente o progresso sem conta em Configurações.</p>
          <div class="account-device-data-actions"><button type="button" data-visitor-clear-device${typeof onClearDeviceData === "function" ? "" : " disabled"}>${renderUiIcon("trash", "account-settings-action-icon")}<span>Remover dados sem conta deste dispositivo</span></button></div>
        </section>
        <section class="account-settings-view" data-visitor-view="authoring" hidden aria-label="Preferências de autoria">
          <p class="account-settings-group-copy">Foco, cadência, pontos de revisão e diálogo com o assistente são preferências pessoais salvas na conta. As escolhas do curso e as condições de pesquisa permanecem no contexto do curso.</p>
          <button class="account-settings-subview-entry" type="button" data-visitor-signin><span>${renderUiIcon("sign-in", "account-settings-action-icon")}<strong>Entrar para definir preferências</strong></span>${renderUiIcon("arrow-right", "account-settings-action-icon")}</button>
        </section>
      </div>
      <p class="account-settings-status" data-visitor-status role="status" aria-live="polite"></p>
    </div></section>`;
  const overlay = root.querySelector("[data-visitor-settings]");
  const dialog = root.querySelector("[role='dialog']");
  const back = root.querySelector("[data-visitor-back]");
  const title = root.querySelector("#visitor-settings-title");
  const content = root.querySelector(".account-settings-content");
  const status = root.querySelector("[data-visitor-status]");
  const openers = new Map();
  const scrollPositions = new Map();
  let opener = null;
  let activeView = "main";
  let destroyed = false;
  let clearing = false;
  const syncTheme = () => {
    const preference = globalThis.AraLearnTheme?.getState?.().preference || "system";
    root.querySelectorAll("[data-visitor-theme]").forEach((button) => {
      const selected = button.dataset.visitorTheme === preference;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", selected ? `${button.title}, selecionado` : button.title);
    });
  };
  const showView = (view, { restoreFocus = false } = {}) => {
    const previousView = activeView;
    scrollPositions.set(previousView, content.scrollTop);
    activeView = view;
    root.querySelectorAll("[data-visitor-view]").forEach(node => { node.hidden = node.dataset.visitorView !== view; });
    back.hidden = view === "main";
    title.textContent = groups.find(([key]) => key === view)?.[2] || "Configurações";
    content.scrollTo?.({ top: scrollPositions.get(view) || 0, behavior: "instant" });
    if (restoreFocus) openers.get(previousView)?.focus({ preventScroll: true });
    else if (view !== "main") back.focus({ preventScroll: true });
  };
  const close = () => {
    if (overlay.hidden) return false;
    overlay.hidden = true;
    showView("main");
    const currentOpener = opener?.isConnected ? opener : [...root.ownerDocument.querySelectorAll("[data-action='open-settings']")]
      .find(node => !node.closest("[hidden]") && node.getClientRects().length);
    currentOpener?.focus({ preventScroll: true });
    opener = null;
    return true;
  };
  const handleBack = () => {
    if (overlay.hidden) return false;
    if (activeView === "main") return close();
    showView("main", { restoreFocus: true });
    return true;
  };
  root.querySelectorAll("[data-visitor-close]").forEach(button => button.addEventListener("click", close));
  root.querySelectorAll("[data-visitor-signin]").forEach(button => button.addEventListener("click", () => onSignIn?.()));
  root.querySelectorAll("[data-visitor-open-view]").forEach(button => button.addEventListener("click", () => {
    openers.set(button.dataset.visitorOpenView, button);
    showView(button.dataset.visitorOpenView);
  }));
  back.addEventListener("click", handleBack);
  root.querySelectorAll("[data-visitor-theme]").forEach(button => button.addEventListener("click", () => {
    globalThis.AraLearnTheme?.setPreference?.(button.dataset.visitorTheme);
    syncTheme();
  }));
  root.querySelector("[data-visitor-clear-device]").addEventListener("click", async event => {
    if (clearing || typeof onClearDeviceData !== "function" || !confirmValue("Remover os dados sem conta deste dispositivo? O progresso, as marcas Rever e os cursos públicos salvos para uso offline serão removidos. Os dados das contas neste dispositivo permanecem.")) return;
    clearing = true;
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = "Removendo os dados sem conta deste dispositivo…";
    try { await onClearDeviceData(); }
    catch (error) {
      if (!destroyed) status.textContent = publicErrorMessage(error, "Não foi possível concluir a limpeza. Recarregue para confirmar os dados deste dispositivo.");
    } finally {
      clearing = false;
      if (!destroyed) button.disabled = false;
    }
  });
  overlay.addEventListener("keydown", event => {
    if (overlay.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); handleBack(); }
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not([disabled])")].filter(node => !node.closest("[hidden]"));
    const first = controls[0];
    const last = controls.at(-1);
    const active = root.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault(); last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault(); first.focus({ preventScroll: true });
    }
  });
  return Object.freeze({
    open() {
      if (destroyed || !overlay.hidden) return;
      opener = root.ownerDocument.activeElement;
      syncTheme();
      showView("main");
      overlay.hidden = false;
      root.querySelector("button[data-visitor-close]").focus({ preventScroll: true });
    },
    close,
    handleBack,
    destroy() { destroyed = true; }
  });
}
