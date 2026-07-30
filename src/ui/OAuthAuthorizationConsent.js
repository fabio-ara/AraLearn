import { renderUiIcon } from "./renderUiIcons.js";

const SCOPE_LABELS = Object.freeze({
  openid: "Confirmar sua identidade",
  email: "Ler seu endereço de e-mail",
  profile: "Ler as informações básicas do perfil",
  phone: "Ler seu número de telefone"
});
export const OAUTH_AUTHORING_PERMISSION_LABELS = Object.freeze([
  "Ler os cursos acessíveis pela sua conta",
  "Criar, editar, reorganizar e excluir rascunhos de workspace",
  "Publicar versões completas ou parciais na sua biblioteca privada",
  "Publicar no catálogo somente se sua conta já tiver permissão editorial"
]);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function readOAuthAuthorizationId(locationValue = globalThis.location) {
  const value = new URLSearchParams(text(locationValue?.search).replace(/^\?/u, ""))
    .get("authorization_id");
  return text(value);
}

function parsedOAuthRedirect(rawUrl) {
  let target;
  try {
    target = new URL(text(rawUrl));
  } catch {
    throw new Error("O servidor OAuth devolveu um destino inválido.");
  }
  const localHttp = target.protocol === "http:" && LOCAL_HOSTS.has(target.hostname);
  if ((target.protocol !== "https:" && !localHttp) || target.username || target.password) {
    throw new Error("O servidor OAuth devolveu um destino inseguro.");
  }
  return target.toString();
}

export function redirectToOAuthClient(rawUrl, locationValue = globalThis.location) {
  const target = parsedOAuthRedirect(rawUrl);
  if (typeof locationValue?.assign !== "function") {
    throw new Error("Este ambiente não consegue concluir o redirecionamento OAuth.");
  }
  locationValue.assign(target);
  return target;
}

function scopeItems(scope) {
  return [...new Set(text(scope).split(/\s+/u).filter(Boolean))];
}

function decisionButton({ action, icon, label, primary = false }) {
  return `
    <button
      class="auth-icon-button${primary ? " is-primary" : ""}"
      type="button"
      data-oauth-decision="${action}"
      title="${label}"
      aria-label="${label}"
    >${renderUiIcon(icon, "auth-button-icon")}</button>
  `;
}

function renderLoading(root) {
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card" aria-busy="true">
        <div class="auth-panel oauth-consent-panel">
          <header class="auth-brand"><img src="assets/brand/aralearn-mark.png" alt=""><span>AraLearn</span></header>
          <p class="auth-copy oauth-consent-loading" role="status">Verificando a conexão…</p>
        </div>
      </section>
    </main>
  `;
}

function renderFailure(root, error) {
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="auth-panel oauth-consent-panel">
          <header class="auth-brand"><img src="assets/brand/aralearn-mark.png" alt=""><span>AraLearn</span></header>
          <h1 class="oauth-consent-title">Não foi possível revisar a conexão</h1>
          <p class="auth-status" data-kind="error" role="alert" data-oauth-consent-error></p>
        </div>
      </section>
    </main>
  `;
  root.querySelector("[data-oauth-consent-error]").textContent =
    error instanceof Error ? error.message : String(error);
}

export async function renderOAuthAuthorizationConsent({
  root,
  authClient,
  authorizationId,
  locationValue = globalThis.location
} = {}) {
  if (!root) throw new TypeError("Elemento raiz do consentimento OAuth ausente.");
  if (!authClient?.getOAuthAuthorizationDetails
      || !authClient?.decideOAuthAuthorization) {
    throw new TypeError("Cliente OAuth do AraLearn ausente.");
  }
  const requestedId = text(authorizationId);
  if (!requestedId) throw new Error("A solicitação OAuth não contém authorization_id.");
  renderLoading(root);

  let details;
  try {
    details = await authClient.getOAuthAuthorizationDetails(requestedId);
    if (text(details?.redirect_url)) {
      redirectToOAuthClient(details.redirect_url, locationValue);
      return { redirected: true };
    }
    if (text(details?.authorization_id) !== requestedId
        || !details?.client || typeof details.client !== "object") {
      throw new Error("O servidor OAuth devolveu uma solicitação incompatível.");
    }
  } catch (error) {
    renderFailure(root, error);
    return { redirected: false, error };
  }

  const scopes = scopeItems(details.scope);
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="auth-panel oauth-consent-panel">
          <header class="auth-brand"><img src="assets/brand/aralearn-mark.png" alt=""><span>AraLearn</span></header>
          <h1 class="oauth-consent-title">Autorizar conexão</h1>
          <p class="auth-copy oauth-consent-copy">
            <strong data-oauth-client-name></strong> quer acessar a autoria do AraLearn usando sua conta.
          </p>
          <dl class="oauth-consent-details">
            <div>
              <dt>Conta</dt>
              <dd data-oauth-user-email></dd>
            </div>
            <div>
              <dt>Identidade solicitada</dt>
              <dd><ul data-oauth-scopes></ul></dd>
            </div>
            <div>
              <dt>Acesso de autoria concedido pelo AraLearn</dt>
              <dd><ul data-oauth-authoring-permissions></ul></dd>
            </div>
          </dl>
          <p class="auth-copy oauth-consent-note">
            O aplicativo externo não recebe sua senha nem credenciais administrativas.
            Você pode negar a solicitação sem alterar seus cursos.
          </p>
          <div class="auth-actions">
            ${decisionButton({
              action: "deny",
              icon: "remove-state",
              label: "Negar conexão"
            })}
            ${decisionButton({
              action: "approve",
              icon: "sign-in",
              label: "Autorizar conexão",
              primary: true
            })}
          </div>
          <p class="auth-status" role="status" aria-live="polite" data-oauth-consent-status></p>
        </div>
      </section>
    </main>
  `;
  root.querySelector("[data-oauth-client-name]").textContent =
    text(details.client.name) || "Um aplicativo externo";
  root.querySelector("[data-oauth-user-email]").textContent =
    text(details.user?.email) || "Conta autenticada";
  const scopeList = root.querySelector("[data-oauth-scopes]");
  for (const scope of scopes) {
    const item = root.ownerDocument.createElement("li");
    item.textContent = SCOPE_LABELS[scope] || scope;
    scopeList.append(item);
  }
  if (scopes.length === 0) {
    const item = root.ownerDocument.createElement("li");
    item.textContent = "Confirmar a conexão solicitada";
    scopeList.append(item);
  }
  const permissionList = root.querySelector("[data-oauth-authoring-permissions]");
  for (const permission of OAUTH_AUTHORING_PERMISSION_LABELS) {
    const item = root.ownerDocument.createElement("li");
    item.textContent = permission;
    permissionList.append(item);
  }

  const status = root.querySelector("[data-oauth-consent-status]");
  const buttons = [...root.querySelectorAll("[data-oauth-decision]")];
  const decide = async (action) => {
    buttons.forEach((button) => { button.disabled = true; });
    status.textContent = action === "approve"
      ? "Autorizando…"
      : "Negando…";
    status.dataset.kind = "";
    try {
      const result = await authClient.decideOAuthAuthorization(requestedId, action);
      redirectToOAuthClient(result?.redirect_url, locationValue);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      status.dataset.kind = "error";
      buttons.forEach((button) => { button.disabled = false; });
    }
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => void decide(button.dataset.oauthDecision));
  });
  return { redirected: false, details };
}
