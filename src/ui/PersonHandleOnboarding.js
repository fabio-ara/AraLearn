import { renderUiIcon } from "./renderUiIcons.js";
import { publicErrorMessage } from "./publicErrorMessage.js";

export function renderPersonHandleOnboarding({ root, controller, onComplete, onSignOut } = {}) {
  if (!root || typeof controller?.updatePersonProfile !== "function") {
    throw new TypeError("Perfil autenticado obrigatório para escolher identificador.");
  }
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card" aria-labelledby="handle-onboarding-title">
        <div class="auth-panel">
          <header class="auth-brand"><img src="assets/brand/aralearn-mark-monochrome.svg" alt=""><span>AraLearn</span></header>
          <h1 id="handle-onboarding-title" class="handle-onboarding-title">Escolha seu identificador</h1>
          <p class="handle-onboarding-description">Seu identificador é público e permite que outras pessoas compartilhem cursos com você.</p>
          <form class="auth-form" data-handle-onboarding>
            <label class="auth-field"><span>Identificador</span>
              <input name="handle" aria-label="Identificador" placeholder="@identificador" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="31" required aria-describedby="handle-onboarding-help">
            </label>
            <p id="handle-onboarding-help" class="handle-onboarding-description">Use de 3 a 30 letras sem acentos, números, pontos, traços ou sublinhados. Comece e termine com letra ou número.</p>
            <div class="auth-actions">
              <button class="auth-icon-button" type="button" data-handle-signout title="Sair da conta" aria-label="Sair da conta">${renderUiIcon("sign-out", "auth-button-icon")}</button>
              <button class="auth-icon-button is-primary" type="submit" title="Salvar identificador" aria-label="Salvar identificador">${renderUiIcon("save", "auth-button-icon")}</button>
            </div>
          </form>
          <p class="auth-status" data-handle-status role="status" aria-live="polite"></p>
        </div>
      </section>
    </main>`;
  const form = root.querySelector("[data-handle-onboarding]");
  const input = form.elements.namedItem("handle");
  const status = root.querySelector("[data-handle-status]");
  let busy = false;
  const setBusy = (value) => {
    busy = value;
    form.querySelectorAll("button").forEach((button) => { button.disabled = value; });
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const handle = String(input.value || "").trim().replace(/^@/u, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/u.test(handle)) {
      status.dataset.kind = "error";
      status.textContent = "Confira o identificador: de 3 a 30 caracteres, começando e terminando com letra ou número.";
      input.focus();
      return;
    }
    setBusy(true);
    status.dataset.kind = "";
    status.textContent = "Salvando…";
    try {
      const profile = await controller.updatePersonProfile({ handle });
      await onComplete?.(profile);
    } catch (error) {
      status.dataset.kind = "error";
      status.textContent = publicErrorMessage(error, "Não foi possível salvar o identificador. Tente outro ou repita.");
      input.focus();
    } finally { setBusy(false); }
  });
  root.querySelector("[data-handle-signout]").addEventListener("click", async () => {
    if (busy) return;
    setBusy(true);
    try { await onSignOut?.(); }
    catch (error) {
      status.dataset.kind = "error";
      status.textContent = publicErrorMessage(error, "Não foi possível sair da conta.");
    } finally { setBusy(false); }
  });
  input.focus();
}
