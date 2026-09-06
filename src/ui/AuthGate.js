import { renderUiIcon } from "./renderUiIcons.js";

function iconButton({ action, icon, label, type = "button", primary = false }) {
  const actionAttribute = action ? ` ${action}` : "";
  return `<button class="auth-icon-button${primary ? " is-primary" : ""}" type="${type}"${actionAttribute} title="${label}" aria-label="${label}">${renderUiIcon(icon, "auth-button-icon")}</button>`;
}

function fieldMarkup({ name, type, label, autocomplete, minlength = "" }) {
  return `
    <label class="auth-field">
      <span>${label}</span>
      <input name="${name}" type="${type}" placeholder="${label}" aria-label="${label}" autocomplete="${autocomplete}"${minlength ? ` minlength="${minlength}"` : ""} required>
    </label>
  `;
}

function formMarkup(mode) {
  if (mode === "recover") {
    return `
      <h1 class="auth-screen-reader-title">Recuperar acesso</h1>
      ${fieldMarkup({ name: "email", type: "email", label: "E-mail", autocomplete: "email" })}
      <div class="auth-actions">
        ${iconButton({ action: 'data-auth-mode="login"', icon: "arrow-left", label: "Voltar" })}
        ${iconButton({ icon: "mail", label: "Enviar recuperação", type: "submit", primary: true })}
      </div>
    `;
  }
  if (mode === "recovery-password") {
    return `
      <h1 class="auth-screen-reader-title">Nova senha</h1>
      ${fieldMarkup({ name: "password", type: "password", label: "Nova senha", autocomplete: "new-password", minlength: "8" })}
      ${fieldMarkup({ name: "passwordConfirmation", type: "password", label: "Repetir senha", autocomplete: "new-password", minlength: "8" })}
      <div class="auth-actions auth-actions-single">
        ${iconButton({ icon: "save", label: "Salvar nova senha", type: "submit", primary: true })}
      </div>
    `;
  }
  const signingUp = mode === "signup";
  return `
    <h1 class="auth-screen-reader-title">${signingUp ? "Criar conta" : "Acesso"}</h1>
    ${fieldMarkup({ name: "email", type: "email", label: "E-mail", autocomplete: "email" })}
    ${fieldMarkup({
      name: "password",
      type: "password",
      label: "Senha",
      autocomplete: signingUp ? "new-password" : "current-password",
      minlength: "8"
    })}
    <div class="auth-actions">
      ${signingUp
        ? iconButton({ action: 'data-auth-mode="login"', icon: "arrow-left", label: "Voltar" })
        : iconButton({ action: 'data-auth-mode="signup"', icon: "account-add", label: "Criar conta" })}
      ${iconButton({ icon: signingUp ? "account-add" : "sign-in", label: signingUp ? "Criar conta" : "Entrar", type: "submit", primary: true })}
      ${signingUp
        ? iconButton({ action: "data-auth-resend", icon: "mail", label: "Reenviar confirmação" })
        : iconButton({ action: 'data-auth-mode="recover"', icon: "key", label: "Recuperar senha" })}
    </div>
  `;
}

export function renderAuthGate({ root, authClient = null, configured = true, onAuthenticated = () => {}, onCancel = null } = {}) {
  if (!root) throw new TypeError("Elemento raiz da autenticação ausente.");
  let mode = authClient?.recoveryMode ? "recovery-password" : "login";
  let status = configured
    ? authClient?.redirectError
      ? "Não foi possível confirmar o acesso."
      : ""
    : "A configuração de acesso está ausente neste ambiente.";
  let statusKind = status ? "error" : "";

  const render = () => {
    root.innerHTML = `
      <main class="auth-shell">
        <section class="auth-card" aria-label="Acesso ao AraLearn">
          <div class="auth-panel">
            <header class="auth-brand"><img src="assets/brand/aralearn-mark-monochrome.svg" alt=""><span>AraLearn</span>${onCancel && !authClient?.recoveryMode ? iconButton({ action: "data-auth-cancel", icon: "arrow-left", label: "Voltar ao estudo" }) : ""}</header>
            <form class="auth-form" data-auth-form>${formMarkup(mode)}</form>
            <p class="auth-status" data-auth-status data-kind="${statusKind}" role="status" aria-live="polite"></p>
          </div>
        </section>
      </main>
    `;
    const statusNode = root.querySelector("[data-auth-status]");
    if (statusNode) statusNode.textContent = status;
    root.querySelector("[data-auth-cancel]")?.addEventListener("click", () => onCancel?.());
    root.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.authMode;
        status = "";
        statusKind = "";
        render();
      });
    });
    const form = root.querySelector("[data-auth-form]");
    root.querySelector("[data-auth-resend]")?.addEventListener("click", async (event) => {
      const emailInput = form?.elements?.namedItem("email");
      const email = String(emailInput?.value || "").trim();
      if (!email || !emailInput.checkValidity()) {
        emailInput?.reportValidity();
        return;
      }
      event.currentTarget.disabled = true;
      try {
        await authClient.resendConfirmation({ email });
        status = "Confirmação reenviada. Verifique também a caixa de spam.";
        statusKind = "success";
      } catch {
        status = "Não foi possível reenviar a confirmação.";
        statusKind = "error";
      }
      render();
    });
    if (!configured || !authClient) {
      form?.querySelectorAll("input, button").forEach((control) => { control.disabled = true; });
      return;
    }
    form?.addEventListener("submit", submit);
  };

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('[type="submit"]');
    const values = new FormData(form);
    submitButton.disabled = true;
    status = "Aguarde…";
    statusKind = "";
    const statusNode = root.querySelector("[data-auth-status]");
    if (statusNode) {
      statusNode.textContent = status;
      statusNode.dataset.kind = statusKind;
    }
    try {
      if (mode === "login") {
        await authClient.signIn({ email: values.get("email"), password: values.get("password") });
        await onAuthenticated();
        return;
      }
      if (mode === "signup") {
        const result = await authClient.signUp({ email: values.get("email"), password: values.get("password") });
        if (result?.access_token || result?.session?.access_token) {
          await onAuthenticated();
          return;
        }
        status = "Conta criada. Confirme pelo link enviado ao seu e-mail.";
        statusKind = "success";
      } else if (mode === "recover") {
        await authClient.requestPasswordReset({ email: values.get("email") });
        status = "Se o endereço estiver cadastrado, o link chegará em instantes.";
        statusKind = "success";
      } else {
        const password = String(values.get("password") || "");
        if (password !== String(values.get("passwordConfirmation") || "")) {
          status = "As duas senhas precisam ser iguais.";
          statusKind = "error";
          render();
          return;
        }
        await authClient.updatePassword(password);
        await onAuthenticated();
        return;
      }
    } catch {
      const fallback = {
        login: "Não foi possível entrar. Confira o e-mail e a senha.",
        signup: "Não foi possível criar a conta.",
        recover: "Não foi possível enviar a recuperação.",
        "recovery-password": "Não foi possível salvar a nova senha."
      }[mode] || "Não foi possível concluir o acesso.";
      status = fallback;
      statusKind = "error";
    }
    render();
  };

  render();
}
