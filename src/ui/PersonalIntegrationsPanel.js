import { normalizePersonalIntegration } from "../supabase/PersonalIntegrationClient.js";
import { renderUiIcon } from "./renderUiIcons.js";

function text(value) {
  return typeof value === "string" ? value : "";
}

function errorMessage(error) {
  if (error?.status === 403) return "Esta sessão não pode gerenciar integrações pessoais.";
  if (error?.authRequired || error?.status === 401) return "Entre novamente para continuar.";
  return error instanceof Error ? error.message : String(error || "Operação indisponível.");
}

function iconButton(documentValue, { icon, label, action, clientId = "", danger = false }) {
  const button = documentValue.createElement("button");
  button.type = "button";
  button.className = `icon-ghost remote-course-action${danger ? " is-danger" : ""}`;
  button.dataset.integrationAction = action;
  if (clientId) button.dataset.integrationClientId = clientId;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = renderUiIcon(icon, "remote-library-action-icon");
  return button;
}

function selectValidity(documentValue, value = 90) {
  const select = documentValue.createElement("select");
  select.name = "expires-in-days";
  select.className = "remote-integration-validity";
  select.setAttribute("aria-label", "Validade da chave");
  [30, 90, 180, 365].forEach((days) => {
    const option = documentValue.createElement("option");
    option.value = String(days);
    option.textContent = `${days} dias`;
    option.selected = days === value;
    select.append(option);
  });
  return select;
}

function dateLabel(value) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
}

function stateLabel(state) {
  if (state === "revoked") return "Revogada";
  if (state === "expired") return "Expirada";
  if (state === "inactive") return "Inativa";
  return "Ativa";
}

function stripSecret(result) {
  const normalized = normalizePersonalIntegration(result);
  return normalized.clientId ? normalized : null;
}

export function createPersonalIntegrationsPanel({
  client,
  documentValue = globalThis.document,
  navigatorValue = globalThis.navigator,
  onAuthRequired = () => {}
} = {}) {
  if (!client || typeof client.list !== "function") {
    throw new TypeError("Cliente de integrações pessoais obrigatório.");
  }
  if (!documentValue?.createElement) throw new TypeError("Documento obrigatório.");

  const element = documentValue.createElement("section");
  element.className = "remote-integrations-panel";
  element.dataset.integrationsPanel = "";
  element.setAttribute("aria-label", "Integrações pessoais");
  let active = false;
  let busy = false;
  let items = [];
  let activeCount = 0;
  let activeLimit = 5;
  let status = "";
  let secret = null;
  let rotatingClientId = "";

  const clearSecret = () => {
    const secretInput = element.querySelector("[data-integration-secret-value]");
    if (secretInput) secretInput.value = "";
    secret = null;
  };

  const setFailure = (error) => {
    status = errorMessage(error);
    if (error?.authRequired || error?.status === 401) {
      clearSecret();
      onAuthRequired(error);
    }
  };

  const upsert = (record) => {
    const normalized = stripSecret(record);
    if (!normalized) return;
    items = [normalized, ...items.filter((item) => item.clientId !== normalized.clientId)];
  };

  const renderSecret = () => {
    if (!secret) return null;
    const panel = documentValue.createElement("section");
    panel.className = "remote-integration-secret";
    panel.dataset.integrationSecret = "";
    panel.setAttribute("role", "alert");
    panel.setAttribute("aria-label", "Nova chave de integração");
    const notice = documentValue.createElement("p");
    notice.textContent = "Copie agora. A chave não será mostrada novamente.";
    const row = documentValue.createElement("div");
    row.className = "remote-integration-secret-row";
    const input = documentValue.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.value = secret.apiKey;
    input.dataset.integrationSecretValue = "";
    input.setAttribute("aria-label", "Chave de integração recém-criada");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    const actions = documentValue.createElement("div");
    actions.className = "remote-inline-actions";
    actions.append(
      iconButton(documentValue, {
        icon: "copy",
        label: "Copiar chave",
        action: "copy-secret"
      }),
      iconButton(documentValue, {
        icon: "remove-state",
        label: "Ocultar chave",
        action: "close-secret"
      })
    );
    row.append(input, actions);
    panel.append(notice, row);
    return panel;
  };

  const renderCreate = () => {
    const form = documentValue.createElement("form");
    form.className = "remote-integration-create";
    form.dataset.integrationCreate = "";
    const name = documentValue.createElement("input");
    name.type = "text";
    name.name = "integration-name";
    name.maxLength = 80;
    name.required = true;
    name.placeholder = "Nome da integração";
    name.setAttribute("aria-label", "Nome da integração");
    name.setAttribute("autocomplete", "off");
    const validity = selectValidity(documentValue);
    const submit = iconButton(documentValue, {
      icon: "add",
      label: "Criar integração",
      action: "create"
    });
    submit.type = "submit";
    form.append(name, validity, submit);
    return form;
  };

  const renderItem = (item) => {
    const card = documentValue.createElement("article");
    card.className = "remote-integration-card";
    card.dataset.integrationClientId = item.clientId;
    card.dataset.integrationState = item.state;
    const heading = documentValue.createElement("div");
    heading.className = "remote-integration-heading";
    const name = documentValue.createElement("h3");
    name.textContent = item.name || "Integração";
    const state = documentValue.createElement("span");
    state.className = "remote-integration-state";
    state.textContent = stateLabel(item.state);
    heading.append(name, state);

    const details = documentValue.createElement("div");
    details.className = "remote-integration-details";
    const prefix = documentValue.createElement("code");
    prefix.textContent = item.keyPrefix || "Prefixo indisponível";
    prefix.title = "Prefixo da chave";
    const expiry = documentValue.createElement("span");
    expiry.textContent = `Validade: ${dateLabel(item.expiresAt)}`;
    const lastUse = documentValue.createElement("span");
    lastUse.textContent = item.lastUsedAt
      ? `Último uso: ${dateLabel(item.lastUsedAt)}`
      : "Ainda não utilizada";
    details.append(prefix, expiry, lastUse);

    const actions = documentValue.createElement("div");
    actions.className = "remote-inline-actions remote-integration-actions";
    const rotate = iconButton(documentValue, {
      icon: "rotate",
      label: "Rotacionar chave",
      action: "show-rotate",
      clientId: item.clientId
    });
    const revoke = iconButton(documentValue, {
      icon: "trash",
      label: "Revogar integração",
      action: "revoke",
      clientId: item.clientId,
      danger: true
    });
    const unavailable = item.state === "revoked";
    rotate.disabled = unavailable;
    revoke.disabled = unavailable;
    if (unavailable) {
      rotate.dataset.fixedDisabled = "true";
      revoke.dataset.fixedDisabled = "true";
    }
    actions.append(rotate, revoke);
    card.append(heading, details, actions);

    if (rotatingClientId === item.clientId && !unavailable) {
      const form = documentValue.createElement("form");
      form.className = "remote-integration-rotate";
      form.dataset.integrationRotate = item.clientId;
      form.append(
        selectValidity(documentValue),
        iconButton(documentValue, {
          icon: "rotate",
          label: "Confirmar rotação",
          action: "rotate",
          clientId: item.clientId
        }),
        iconButton(documentValue, {
          icon: "remove-state",
          label: "Cancelar rotação",
          action: "cancel-rotate",
          clientId: item.clientId
        })
      );
      form.querySelector('[data-integration-action="rotate"]').type = "submit";
      card.append(form);
    }
    return card;
  };

  const render = () => {
    if (!active) {
      clearSecret();
      element.replaceChildren();
      return;
    }
    const header = documentValue.createElement("header");
    header.className = "remote-integration-panel-header";
    const title = documentValue.createElement("h3");
    title.textContent = "Integrações";
    const count = documentValue.createElement("span");
    count.textContent = `${activeCount}/${activeLimit}`;
    count.title = "Integrações ativas";
    header.append(title, count);
    const list = documentValue.createElement("div");
    list.className = "remote-integration-list";
    items.forEach((item) => list.append(renderItem(item)));
    if (!items.length && !busy) {
      const empty = documentValue.createElement("p");
      empty.className = "remote-library-empty empty-state-copy";
      empty.textContent = "Nenhuma integração.";
      list.append(empty);
    }
    const statusNode = documentValue.createElement("p");
    statusNode.className = "remote-integration-status";
    statusNode.dataset.integrationStatus = "";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.textContent = busy ? "Consultando…" : status;
    const secretNode = renderSecret();
    element.replaceChildren(header, renderCreate(), ...(secretNode ? [secretNode] : []), list, statusNode);
    element.querySelectorAll("button, input, select").forEach((control) => {
      if (busy && !control.matches('[data-integration-action="close-secret"]')) control.disabled = true;
    });
  };

  const load = async ({ preserveStatus = false } = {}) => {
    busy = true;
    if (!preserveStatus) status = "";
    render();
    try {
      const result = await client.list();
      if (!active) return;
      items = [...result.items].map((item) => normalizePersonalIntegration(item));
      activeCount = result.activeCount;
      activeLimit = result.activeLimit;
    } catch (error) {
      if (!active) return;
      setFailure(error);
    } finally {
      busy = false;
      render();
    }
  };

  const receiveSecret = (result, message) => {
    const apiKey = text(result?.apiKey ?? result?.api_key);
    upsert(result);
    if (apiKey && result?.secretAvailable !== false) {
      secret = { apiKey };
      status = message;
    } else {
      clearSecret();
      status = "A chave já havia sido emitida. Rotacione-a para receber uma nova.";
    }
  };

  element.addEventListener("submit", async (event) => {
    const createForm = event.target.closest("[data-integration-create]");
    const rotateForm = event.target.closest("[data-integration-rotate]");
    if ((!createForm && !rotateForm) || busy) return;
    event.preventDefault();
    const form = new FormData(createForm || rotateForm);
    busy = true;
    status = "";
    let mayRefresh = true;
    render();
    try {
      if (createForm) {
        const result = await client.create({
          name: form.get("integration-name"),
          expiresInDays: Number(form.get("expires-in-days"))
        });
        receiveSecret(result, "Integração criada.");
      } else {
        const clientId = rotateForm.dataset.integrationRotate;
        const result = await client.rotate(clientId, {
          expiresInDays: Number(form.get("expires-in-days"))
        });
        rotatingClientId = "";
        receiveSecret(result, "Chave rotacionada.");
      }
    } catch (error) {
      mayRefresh = !(error?.authRequired || error?.status === 401);
      setFailure(error);
    } finally {
      busy = false;
      render();
    }
    if (active && mayRefresh) await load({ preserveStatus: true });
  });

  element.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-integration-action]");
    if (!button || busy) return;
    const action = button.dataset.integrationAction;
    if (action === "close-secret") {
      clearSecret();
      status = "A chave foi ocultada.";
      render();
      return;
    }
    if (action === "copy-secret") {
      if (!secret?.apiKey) return;
      try {
        await navigatorValue.clipboard.writeText(secret.apiKey);
        status = "Chave copiada.";
      } catch {
        status = "Não foi possível copiar. Selecione a chave manualmente.";
      }
      render();
      return;
    }
    if (action === "show-rotate") {
      rotatingClientId = button.dataset.integrationClientId;
      render();
      element.querySelector("[data-integration-rotate] select")?.focus();
      return;
    }
    if (action === "cancel-rotate") {
      rotatingClientId = "";
      render();
      return;
    }
    if (action !== "revoke") return;
    const clientId = button.dataset.integrationClientId;
    if (!globalThis.confirm?.("Revogar esta integração? A chave deixará de funcionar.")) return;
    busy = true;
    status = "";
    let mayRefresh = true;
    render();
    try {
      const result = await client.revoke(clientId);
      const revokedAt = result?.revokedAt ?? result?.revoked_at ?? new Date().toISOString();
      items = items.map((item) => item.clientId === clientId
        ? normalizePersonalIntegration({ ...item, revokedAt, active: false })
        : item);
      status = "Integração revogada.";
    } catch (error) {
      mayRefresh = !(error?.authRequired || error?.status === 401);
      setFailure(error);
    } finally {
      busy = false;
      render();
    }
    if (active && mayRefresh) await load({ preserveStatus: true });
  });

  return {
    element,
    get isOpen() {
      return active;
    },
    async open() {
      active = true;
      clearSecret();
      rotatingClientId = "";
      await load();
    },
    close() {
      active = false;
      busy = false;
      status = "";
      rotatingClientId = "";
      clearSecret();
      render();
    },
    closeSecret() {
      clearSecret();
      if (active) render();
    }
  };
}
