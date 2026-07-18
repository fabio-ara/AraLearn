function formMarkup(mode) {
  if (mode === "recover") {
    return `
      <h1>Recupere o acesso</h1>
      <p class="auth-copy">Enviaremos um link seguro para definir uma nova senha.</p>
      <label class="auth-field">E-mail<input name="email" type="email" autocomplete="email" required></label>
      <button class="auth-primary" type="submit" title="Enviar recuperação" aria-label="Enviar recuperação"><span aria-hidden="true">↗</span> Enviar link</button>
      <button class="auth-link" type="button" data-auth-mode="login" title="Voltar ao login" aria-label="Voltar ao login"><span aria-hidden="true">←</span> Voltar</button>
    `;
  }
  if (mode === "recovery-password") {
    return `
      <h1>Crie uma nova senha</h1>
      <p class="auth-copy">Escolha uma senha com pelo menos oito caracteres.</p>
      <label class="auth-field">Nova senha<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
      <label class="auth-field">Repita a senha<input name="passwordConfirmation" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="auth-primary" type="submit" title="Salvar nova senha" aria-label="Salvar nova senha"><span aria-hidden="true">✓</span> Salvar senha</button>
    `;
  }
  const signingUp = mode === "signup";
  return `
    <h1>${signingUp ? "Crie sua conta" : "Entre no AraLearn"}</h1>
    <p class="auth-copy">${signingUp ? "Seus cursos serão sincronizados com segurança entre os seus dispositivos." : "Acesse seus cursos, progresso e comentários."}</p>
    <label class="auth-field">E-mail<input name="email" type="email" autocomplete="email" required></label>
    <label class="auth-field">Senha<input name="password" type="password" minlength="8" autocomplete="${signingUp ? "new-password" : "current-password"}" required></label>
    <button class="auth-primary" type="submit" title="${signingUp ? "Criar conta" : "Entrar"}" aria-label="${signingUp ? "Criar conta" : "Entrar"}"><span aria-hidden="true">${signingUp ? "+" : "→"}</span> ${signingUp ? "Criar conta" : "Entrar"}</button>
    ${signingUp
      ? '<div class="auth-secondary-actions"><button class="auth-link" type="button" data-auth-mode="login" title="Já tenho conta" aria-label="Já tenho conta"><span aria-hidden="true">←</span> Já tenho conta</button><button class="auth-link" type="button" data-auth-resend title="Reenviar confirmação" aria-label="Reenviar confirmação"><span aria-hidden="true">↗</span> Reenviar confirmação</button></div>'
      : '<div class="auth-secondary-actions"><button class="auth-link" type="button" data-auth-mode="signup" title="Criar uma conta" aria-label="Criar uma conta"><span aria-hidden="true">+</span> Criar conta</button><button class="auth-link" type="button" data-auth-mode="recover" title="Recuperar senha" aria-label="Recuperar senha"><span aria-hidden="true">?</span> Esqueci a senha</button></div>'}
  `;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Não foi possível concluir a operação.");
}

export function renderAuthGate({ root, authClient = null, configured = true, onAuthenticated = () => {} } = {}) {
  if (!root) throw new TypeError("Elemento raiz da autenticação ausente.");
  let mode = authClient?.recoveryMode ? "recovery-password" : "login";
  let status = configured
    ? authClient?.redirectError || ""
    : "A configuração pública do Supabase está ausente neste ambiente.";
  let statusKind = status ? "error" : "";

  const render = () => {
    root.innerHTML = `
      <main class="auth-shell">
        <section class="auth-card" aria-labelledby="auth-title">
          <header class="auth-brand"><img src="assets/brand/aralearn-mark.png" alt=""><span>AraLearn</span></header>
          <form class="auth-form" data-auth-form>${formMarkup(mode)}</form>
          <p class="auth-status" data-auth-status data-kind="${statusKind}" role="status" aria-live="polite"></p>
        </section>
      </main>
    `;
    root.querySelector(".auth-form h1")?.setAttribute("id", "auth-title");
    const statusNode = root.querySelector("[data-auth-status]");
    if (statusNode) statusNode.textContent = status;
    root.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.authMode;
        status = "";
        statusKind = "";
        render();
      });
    });
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
      } catch (error) {
        status = errorMessage(error);
        statusKind = "error";
      }
      render();
    });
    const form = root.querySelector("[data-auth-form]");
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
        status = "Conta criada. Confirme o endereço pelo link enviado ao seu e-mail.";
        statusKind = "success";
      } else if (mode === "recover") {
        await authClient.requestPasswordReset({ email: values.get("email") });
        status = "Se o endereço estiver cadastrado, o link de recuperação chegará em instantes.";
        statusKind = "success";
      } else {
        const password = String(values.get("password") || "");
        if (password !== String(values.get("passwordConfirmation") || "")) {
          throw new Error("As duas senhas precisam ser iguais.");
        }
        await authClient.updatePassword(password);
        await onAuthenticated();
        return;
      }
    } catch (error) {
      status = errorMessage(error);
      statusKind = "error";
    }
    render();
  };

  render();
}
