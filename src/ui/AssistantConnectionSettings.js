import { readSupabaseRuntimeConfig } from "../supabase/runtimeConfig.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import { renderUiIcon } from "./renderUiIcons.js";

export function mountAssistantConnectionSettings(root, { authClient = null, onSignIn = null } = {}) {
  const config = readSupabaseRuntimeConfig();
  const field = (name, label, { readonly = true, type = "text" } = {}) => `<div class="assistant-connection-field">
    <label for="assistant-${name}">${label}</label>
    <input id="assistant-${name}" data-openapi-field="${name}" type="${type}" ${readonly ? "readonly" : ""} autocomplete="off" spellcheck="false" autocapitalize="off">
    <button type="button" data-openapi-copy="${name}" title="Copiar ${label.toLowerCase()}" aria-label="Copiar ${label.toLowerCase()}">${renderUiIcon("copy", "account-settings-action-icon")}</button>
  </div>`;
  root.innerHTML = `<div class="assistant-connection">
    <div class="assistant-mcp" data-assistant-mcp>
    <p>Adicione este endereço nas conexões do seu assistente e autorize sua conta AraLearn.</p>
    <label for="assistant-server-address">Endereço MCP</label>
    <input id="assistant-server-address" data-assistant-address type="url" readonly spellcheck="false">
    <button type="button" data-assistant-copy title="Copiar endereço" aria-label="Copiar endereço">${renderUiIcon("copy", "account-settings-action-icon")}</button>
    <p data-assistant-status role="status" aria-live="polite"></p>
    <a href="https://github.com/fabio-ara/AraLearn/blob/main/docs/conectar-assistente.md" target="_blank" rel="noopener noreferrer">Como conectar (nova aba)</a>
    </div>
    <details data-openapi-details>
      <summary>Conexão por OpenAPI</summary>
      <div class="assistant-openapi">
        <p>Use esta opção se o seu assistente pedir uma especificação OpenAPI e credenciais OAuth.</p>
        <div data-openapi-signin>
          <p>Entre na sua conta AraLearn para configurar esta conexão.</p>
          <button type="button" data-openapi-login title="Entrar ou criar conta" aria-label="Entrar ou criar conta">${renderUiIcon("sign-in", "account-settings-action-icon")}</button>
        </div>
        <div data-openapi-account hidden>
          <h2>Credenciais da conexão</h2>
          <p>Gere credenciais para uma nova conexão ou informe o identificador do cliente que você já configurou. O segredo aparece somente nesta sessão: copie-o para a configuração do seu assistente antes de fechar esta tela.</p>
          <button type="button" data-openapi-register title="Gerar credenciais" aria-label="Gerar credenciais">${renderUiIcon("key", "account-settings-action-icon")}</button>
          ${field("client-id", "Identificador do cliente", { readonly: false })}
          <div data-openapi-secret hidden>
            ${field("client-secret", "Segredo do cliente", { type: "password" })}
            <button type="button" data-openapi-reveal aria-pressed="false" title="Mostrar segredo" aria-label="Mostrar segredo">${renderUiIcon("preview", "account-settings-action-icon")}</button>
          </div>
          <p>Se você já copiou o segredo para o assistente, retome apenas com o identificador do cliente. Se perdeu o segredo antes de configurá-lo, gere novas credenciais e substitua o par no assistente.</p>
          <h2>Configuração do assistente</h2>
          ${field("schema", "Endereço OpenAPI", { type: "url" })}
          ${field("authorization", "URL de autorização", { type: "url" })}
          ${field("token", "URL de token", { type: "url" })}
          ${field("scope", "Escopo")}
          <p>Escolha autenticação OAuth e envio das credenciais no corpo da requisição (POST).</p>
          <h2>Vincular o assistente</h2>
          <p>Depois de salvar a configuração no assistente, copie a URL de retorno exibida na autenticação. Use essa URL, não o endereço público da conversa. Também é possível informar diretamente o identificador que começa por g-.</p>
          <form data-openapi-link-form autocomplete="off">
            <label for="assistant-callback">Identificador ou URL de retorno do assistente</label>
            <input id="assistant-callback" data-openapi-callback type="text" required autocomplete="off" spellcheck="false" autocapitalize="off">
            <button type="submit" data-openapi-link title="Vincular assistente" aria-label="Vincular assistente">${renderUiIcon("ready-state", "account-settings-action-icon")}</button>
          </form>
        </div>
        <p data-openapi-status role="status" aria-live="polite"></p>
      </div>
    </details>
  </div>`;
  const address = root.querySelector("[data-assistant-address]");
  const button = root.querySelector("[data-assistant-copy]");
  const status = root.querySelector("[data-assistant-status]");
  const details = root.querySelector("[data-openapi-details]");
  const fields = Object.fromEntries([...root.querySelectorAll("[data-openapi-field]")]
    .map(input => [input.dataset.openapiField, input]));
  const callback = root.querySelector("[data-openapi-callback]");
  const secret = root.querySelector("[data-openapi-secret]");
  const reveal = root.querySelector("[data-openapi-reveal]");
  const register = root.querySelector("[data-openapi-register]");
  const link = root.querySelector("[data-openapi-link]");
  const connectionStatus = root.querySelector("[data-openapi-status]");
  const actionBase = config.configured ? `${config.projectUrl}/functions/v1/aralearn-authoring-action` : "";
  fields.schema.value = config.configured ? "https://fabio-ara.github.io/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml" : "";
  fields.authorization.value = actionBase ? `${actionBase}/oauth/authorize` : "";
  fields.token.value = actionBase ? `${actionBase}/oauth/token` : "";
  fields.scope.value = "openid email";
  let destroyed = false;
  let generation = 0;
  let busy = false;
  const authenticated = () => Boolean(authClient?.getSession?.()?.user);
  const updateControls = () => {
    const connected = authenticated();
    root.querySelector("[data-openapi-account]").hidden = !connected;
    root.querySelector("[data-openapi-signin]").hidden = connected;
    register.disabled = busy || !config.configured || !connected || Boolean(fields["client-id"].value.trim());
    link.disabled = busy || !config.configured || !connected;
    fields["client-id"].disabled = busy;
    fields["client-id"].readOnly = Boolean(fields["client-secret"].value);
    callback.disabled = busy;
    root.querySelectorAll("[data-openapi-copy]").forEach(control => {
      control.disabled = !fields[control.dataset.openapiCopy].value;
    });
  };
  const clear = () => {
    generation += 1;
    fields["client-id"].value = "";
    fields["client-secret"].value = "";
    fields["client-secret"].type = "password";
    secret.hidden = true;
    callback.value = "";
    connectionStatus.textContent = "";
    reveal.title = "Mostrar segredo";
    reveal.setAttribute("aria-label", "Mostrar segredo");
    reveal.setAttribute("aria-pressed", "false");
    details.open = false;
    updateControls();
  };
  const restoreRequestFocus = (control, current) => {
    if (destroyed || current !== generation || !details.open ||
        root.ownerDocument.activeElement !== root.ownerDocument.body) return;
    control.focus({ preventScroll: true });
    // O contorno de foco não pode ser cortado pela borda do contêiner de rolagem.
    control.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  address.value = config.configured ? `${config.projectUrl}/functions/v1/aralearn-authoring-mcp` : "";
  button.disabled = !address.value;
  if (!address.value) status.textContent = "A conexão não está disponível nesta instalação. Consulte a pessoa responsável pelo AraLearn.";
  button.addEventListener("click", async () => {
    try {
      await globalThis.navigator.clipboard.writeText(address.value);
      status.textContent = "Endereço copiado. Cole na conexão do seu assistente.";
    } catch {
      address.focus();
      address.select();
      status.textContent = "Selecione e copie o endereço acima. O navegador não permitiu a cópia automática.";
    }
  });
  details.addEventListener("toggle", () => { if (!details.open) clear(); });
  fields["client-id"].addEventListener("input", updateControls);
  root.querySelector("[data-openapi-login]").disabled = typeof onSignIn !== "function";
  root.querySelector("[data-openapi-login]").addEventListener("click", () => onSignIn?.());
  root.querySelectorAll("[data-openapi-copy]").forEach(control => control.addEventListener("click", async () => {
    const input = fields[control.dataset.openapiCopy];
    const current = generation;
    try {
      await globalThis.navigator.clipboard.writeText(input.value);
      if (!destroyed && current === generation) connectionStatus.textContent = "Valor copiado. Cole na configuração do seu assistente.";
    } catch {
      if (destroyed || current !== generation) return;
      input.focus();
      input.select();
      connectionStatus.textContent = "Selecione e copie o valor. O navegador não permitiu a cópia automática.";
    }
  }));
  reveal.addEventListener("click", () => {
    const visible = fields["client-secret"].type === "password";
    fields["client-secret"].type = visible ? "text" : "password";
    const label = visible ? "Ocultar segredo" : "Mostrar segredo";
    reveal.title = label;
    reveal.setAttribute("aria-label", label);
    reveal.setAttribute("aria-pressed", String(visible));
  });
  register.addEventListener("click", async () => {
    if (busy || destroyed || !authenticated() || fields["client-id"].value.trim()) return;
    busy = true;
    const current = generation;
    updateControls();
    connectionStatus.textContent = "Gerando credenciais…";
    try {
      const result = await authClient.registerActionOAuthClient();
      if (destroyed || current !== generation) return;
      fields["client-id"].value = result.client_id;
      fields["client-secret"].value = result.client_secret;
      secret.hidden = false;
      connectionStatus.textContent = "Credenciais geradas. Copie o identificador e o segredo antes de fechar esta tela.";
    } catch (error) {
      if (!destroyed && current === generation) connectionStatus.textContent = publicErrorMessage(error,
        "Não foi possível confirmar a geração. Nenhuma nova tentativa foi feita.");
    } finally {
      busy = false;
      if (!destroyed) {
        updateControls();
        restoreRequestFocus(fields["client-id"], current);
      }
    }
  });
  root.querySelector("[data-openapi-link-form]").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || destroyed || !authenticated()) return;
    busy = true;
    const current = generation;
    updateControls();
    connectionStatus.textContent = "Vinculando assistente…";
    try {
      await authClient.linkActionOAuthClient(fields["client-id"].value, callback.value);
      if (!destroyed && current === generation) connectionStatus.textContent = "Assistente vinculado. Volte a ele e conecte sua conta AraLearn para autorizar o acesso.";
    } catch (error) {
      if (!destroyed && current === generation) connectionStatus.textContent = publicErrorMessage(error,
        "Não foi possível vincular. Confira o identificador do cliente e a URL de retorno do assistente.");
    } finally {
      busy = false;
      if (!destroyed) {
        updateControls();
        restoreRequestFocus(link, current);
      }
    }
  });
  const unsubscribe = authClient?.onAuthStateChange?.((event) => {
    if (event !== "TOKEN_REFRESHED" && event !== "TOKEN_REFRESHED_REMOTE") clear();
  });
  updateControls();
  return Object.freeze({ clear, destroy() { destroyed = true; clear(); unsubscribe?.(); } });
}
