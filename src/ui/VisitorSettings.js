import { renderUiIcon } from "./renderUiIcons.js";

export function renderVisitorSettings(root, { onSignIn } = {}) {
  root.innerHTML = `<section class="account-settings-overlay" data-visitor-settings hidden>
    <div class="account-settings-backdrop" data-visitor-close></div>
    <div class="account-settings-sheet courses-home-screen" role="dialog" aria-modal="true" aria-labelledby="visitor-settings-title" tabindex="-1">
      <header class="account-settings-header"><div class="account-settings-title-row">
        <h1 class="account-settings-title" id="visitor-settings-title">Conta e aparência</h1>
        <button class="icon-ghost account-settings-close" type="button" data-visitor-close title="Fechar" aria-label="Fechar">${renderUiIcon("remove-state", "account-settings-action-icon")}</button>
      </div></header>
      <div class="account-settings-content">
        <p>Você está estudando sem conta. Seu progresso e as marcas Rever ficam neste dispositivo.</p>
        <button class="account-settings-subview-entry" type="button" data-visitor-signin><span>${renderUiIcon("sign-in", "account-settings-action-icon")}<strong>Entrar ou criar conta</strong></span>${renderUiIcon("arrow-right", "account-settings-action-icon")}</button>
      </div>
      <footer class="account-settings-footer"><div class="theme-choice" role="group" aria-label="Aparência">
        ${[["system", "do sistema"], ["light", "claro"], ["dark", "escuro"]].map(([value, label]) => `<button class="theme-choice-button" type="button" data-visitor-theme="${value}" title="Tema ${label}" aria-label="Tema ${label}">${renderUiIcon(`theme-${value}`, "theme-choice-icon")}</button>`).join("")}
      </div></footer>
    </div></section>`;
  const overlay = root.querySelector("[data-visitor-settings]");
  const dialog = root.querySelector("[role='dialog']");
  let opener = null;
  const syncTheme = () => {
    const preference = globalThis.AraLearnTheme?.getState?.().preference || "system";
    root.querySelectorAll("[data-visitor-theme]").forEach((button) => {
      const selected = button.dataset.visitorTheme === preference;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  const close = () => {
    if (overlay.hidden) return false;
    overlay.hidden = true;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    return true;
  };
  root.querySelectorAll("[data-visitor-close]").forEach((button) => button.addEventListener("click", close));
  root.querySelector("[data-visitor-signin]").addEventListener("click", () => onSignIn?.());
  root.querySelectorAll("[data-visitor-theme]").forEach((button) => button.addEventListener("click", () => {
    globalThis.AraLearnTheme?.setPreference?.(button.dataset.visitorTheme);
    syncTheme();
  }));
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not([disabled])")];
    const first = controls[0];
    const last = controls.at(-1);
    const active = root.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault(); first.focus();
    }
  });
  return Object.freeze({
    open() {
      opener = root.ownerDocument.activeElement;
      syncTheme();
      overlay.hidden = false;
      root.querySelector("button[data-visitor-close]").focus({ preventScroll: true });
    },
    close,
    handleBack: close
  });
}
