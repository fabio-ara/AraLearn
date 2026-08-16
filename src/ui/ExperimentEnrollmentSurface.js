import { renderUiIcon } from "./renderUiIcons.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function enrollmentCode(value) {
  const normalized = text(value);
  return /^[A-Za-z0-9_-]{8,128}$/u.test(normalized) ? normalized : "";
}

function online() {
  return globalThis.navigator?.onLine !== false;
}

export function consumeExperimentEnrollmentFragment({
  locationValue = globalThis.location,
  historyValue = globalThis.history
} = {}) {
  const raw = text(locationValue?.hash).replace(/^#/u, "");
  if (!raw) return "";
  const parameters = new URLSearchParams(raw);
  const code = enrollmentCode(parameters.get("experiment"));
  if (!parameters.has("experiment")) return "";
  parameters.delete("experiment");
  const remaining = parameters.toString();
  const cleanUrl = `${locationValue.pathname || "/"}${locationValue.search || ""}` +
    (remaining ? `#${remaining}` : "");
  historyValue?.replaceState?.(historyValue.state ?? null, "", cleanUrl);
  return code;
}

export function createExperimentEnrollmentSurface({
  root,
  controller,
  onOpenSelection = async () => false,
  onEnrollmentChanged = async () => {},
  onClose = () => {},
  documentValue = globalThis.document,
  locationValue = globalThis.location,
  historyValue = globalThis.history
} = {}) {
  if (!root || !controller) throw new TypeError("Dependências do ingresso experimental ausentes.");
  const state = {
    opened: false,
    loading: false,
    code: "",
    policy: null,
    consentAcknowledged: false,
    enrollment: null,
    handles: [],
    withdrawPrompt: false,
    errorMessage: "",
    statusMessage: ""
  };
  const backgroundState = new Map();

  function setBackgroundInert(enabled) {
    const siblings = [...(root.parentElement?.children || [])].filter((node) => node !== root);
    if (enabled) {
      siblings.forEach((node) => {
        if (!backgroundState.has(node)) {
          backgroundState.set(node, {
            inert: node.inert === true,
            ariaHidden: node.getAttribute?.("aria-hidden")
          });
        }
        node.inert = true;
        node.setAttribute?.("aria-hidden", "true");
      });
      return;
    }
    for (const [node, previous] of backgroundState) {
      node.inert = previous.inert;
      if (previous.ariaHidden == null) node.removeAttribute?.("aria-hidden");
      else node.setAttribute?.("aria-hidden", previous.ariaHidden);
    }
    backgroundState.clear();
  }

  function statusLabel(status) {
    return {
      enrolled: "Aguardando atribuição",
      assigned: "Variante disponível",
      withdrawn: "Participação encerrada"
    }[status] || "Participação em estudo";
  }

  function dialogContent() {
    if (state.withdrawPrompt) {
      return '<header><h2 id="experiment-enrollment-title">Retirar participação?</h2></header>' +
        '<p>A seleção privada será revogada deste dispositivo. O histórico mínimo permanece no servidor.</p>' +
        '<div class="experiment-enrollment-actions"><button type="button" class="authoring-text-button"' +
        ' data-experiment-enrollment-action="cancel-withdraw">Cancelar</button>' +
        '<button type="button" class="authoring-secondary-button"' +
        ' data-experiment-enrollment-action="confirm-withdraw">Retirar participação</button></div>';
    }
    if (state.policy) {
      return '<header><h2 id="experiment-enrollment-title">' + escapeHtml(state.policy.title) + '</h2></header>' +
        '<section class="experiment-enrollment-policy" aria-labelledby="experiment-enrollment-policy-title">' +
        '<h3 id="experiment-enrollment-policy-title">' + escapeHtml(state.policy.policy.label) + '</h3><p>' +
        escapeHtml(state.policy.policy.publicText) + '</p></section><label class="experiment-enrollment-consent">' +
        '<input type="checkbox" data-experiment-enrollment-consent' +
        (state.consentAcknowledged ? " checked" : "") +
        '><span>Li as informações e concordo em participar.</span></label>' +
        '<div class="experiment-enrollment-actions"><button type="button" class="authoring-text-button"' +
        ' data-experiment-enrollment-action="close">Cancelar</button><button type="button"' +
        ' class="authoring-apply-button" data-experiment-enrollment-action="enroll"' +
        (!state.consentAcknowledged || state.loading || !online() ? " disabled" : "") + '>Confirmar ingresso</button></div>';
    }
    if (state.enrollment) {
      const assigned = state.enrollment.status === "assigned" && state.enrollment.selection;
      return '<header><h2 id="experiment-enrollment-title">' +
        escapeHtml(statusLabel(state.enrollment.status)) + '</h2></header>' +
        (state.enrollment.status === "enrolled"
          ? '<p>Sua participação foi registrada. A atribuição será feita pelo servidor.</p>'
          : state.enrollment.status === "assigned"
            ? '<p>A variante atribuída está pronta e também poderá ser usada offline após a sincronização.</p>'
            : '<p>O acesso experimental foi retirado.</p>') +
        '<div class="experiment-enrollment-actions">' +
        (assigned
          ? '<button type="button" class="authoring-apply-button" data-experiment-enrollment-action="open-selection">' +
            "Abrir variante atribuída</button>"
          : state.enrollment.status === "enrolled"
            ? '<button type="button" class="authoring-apply-button" data-experiment-enrollment-action="refresh-status"' +
              (state.loading || !online() ? " disabled" : "") + '>Atualizar situação</button>'
            : "") +
        (["enrolled", "assigned"].includes(state.enrollment.status)
          ? '<button type="button" class="authoring-text-button" data-experiment-enrollment-action="withdraw"' +
            (!online() ? " disabled" : "") + '>' +
            "Retirar participação</button>"
          : "") +
        '<button type="button" class="authoring-text-button" data-experiment-enrollment-action="close">Fechar</button>' +
        "</div>";
    }
    return '<header><h2 id="experiment-enrollment-title">Participar de estudo</h2></header>' +
      '<label><span>Código de ingresso</span><input type="text" autocomplete="off" maxlength="128"' +
      ' data-experiment-enrollment-code value="' + escapeHtml(state.code) + '"></label>' +
      (state.handles.length
        ? '<section class="experiment-enrollment-handles"><h3>Participações neste dispositivo</h3>' +
          state.handles.map((handle, index) => '<button type="button" class="authoring-text-button"' +
            ' data-experiment-enrollment-action="open-handle" data-handle-index="' + index + '">' +
            escapeHtml(statusLabel(handle.status)) + "</button>").join("") + "</section>"
        : "") +
      '<div class="experiment-enrollment-actions"><button type="button" class="authoring-text-button"' +
      ' data-experiment-enrollment-action="close">Cancelar</button><button type="button"' +
      ' class="authoring-apply-button" data-experiment-enrollment-action="read-policy"' +
      (!enrollmentCode(state.code) || state.loading || !online() ? " disabled" : "") + '>Ler informações</button></div>';
  }

  function render({ focus = "" } = {}) {
    root.innerHTML = '<button type="button" class="experiment-enrollment-launcher"' +
      ' data-experiment-enrollment-action="open" title="Participar de estudo"' +
      ' aria-label="Participar de estudo">' + renderUiIcon("experiment", "home-tab-icon") +
      '</button>' + (state.opened
      ? '<div class="authoring-dialog-backdrop experiment-enrollment-backdrop">' +
        '<section class="authoring-dialog experiment-enrollment-dialog" role="dialog" aria-modal="true"' +
        ' aria-labelledby="experiment-enrollment-title" tabindex="-1" aria-busy="' +
        (state.loading ? "true" : "false") + '">' + dialogContent() +
        (state.loading ? '<p class="sr-only" role="status" aria-live="polite">Carregando…</p>' : "") +
        (state.errorMessage ? '<p class="authoring-error" role="alert">' + escapeHtml(state.errorMessage) + "</p>" : "") +
        (state.statusMessage ? '<p class="authoring-status" role="status">' + escapeHtml(state.statusMessage) + "</p>" : "") +
        "</section></div>"
      : "");
    const preferred = focus ? root.querySelector(focus) : null;
    if (preferred) preferred.focus();
    else if (state.opened && !root.contains(documentValue.activeElement)) {
      const dialog = root.querySelector('[role="dialog"]');
      dialog?.querySelector('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])')
        ?.focus();
      if (!root.contains(documentValue.activeElement)) dialog?.focus();
    }
  }

  async function loadHandles() {
    if (typeof controller.listInstructionalExperimentEnrollments !== "function") return;
    try {
      state.handles = await controller.listInstructionalExperimentEnrollments();
    } catch {
      state.handles = [];
    }
  }

  async function open(codeValue = "") {
    state.opened = true;
    setBackgroundInert(true);
    state.errorMessage = "";
    state.statusMessage = "";
    state.code = enrollmentCode(codeValue);
    state.policy = null;
    state.enrollment = null;
    state.consentAcknowledged = false;
    await loadHandles();
    render({ focus: state.code ? "[data-experiment-enrollment-code]" : "[data-experiment-enrollment-code]" });
    if (state.code) await readPolicy();
  }

  function close() {
    state.opened = false;
    state.code = "";
    state.policy = null;
    state.consentAcknowledged = false;
    state.withdrawPrompt = false;
    state.errorMessage = "";
    setBackgroundInert(false);
    render({ focus: "[data-experiment-enrollment-action=\"open\"]" });
    onClose();
  }

  async function readPolicy() {
    const code = enrollmentCode(state.code);
    if (!code || state.loading) return false;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      state.policy = await controller.loadInstructionalExperimentEnrollmentPolicy({
        enrollmentCode: code,
        online: true
      });
      return true;
    } catch (error) {
      state.errorMessage = text(error?.message) || "Não foi possível ler as informações do estudo.";
      return false;
    } finally {
      state.loading = false;
      render({ focus: state.policy ? "[data-experiment-enrollment-consent]" : "[data-experiment-enrollment-code]" });
    }
  }

  async function enroll() {
    if (!state.policy || !state.consentAcknowledged || state.loading) return false;
    const code = state.code;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      state.enrollment = await controller.enrollInInstructionalExperiment({
        enrollmentCode: code,
        consentPolicyRef: state.policy.policy.ref,
        consentAcknowledged: true,
        online: true
      });
      state.code = "";
      state.policy = null;
      state.consentAcknowledged = false;
      await onEnrollmentChanged(state.enrollment);
      return true;
    } catch (error) {
      state.errorMessage = text(error?.message) || "Não foi possível concluir o ingresso.";
      return false;
    } finally {
      state.loading = false;
      render({ focus: ".experiment-enrollment-actions button" });
    }
  }

  async function refreshStatus() {
    if (!state.enrollment?.enrollmentRef || state.loading) return false;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      state.enrollment = await controller.loadInstructionalExperimentEnrollmentStatus({
        enrollmentRef: state.enrollment.enrollmentRef,
        online: true
      });
      await onEnrollmentChanged(state.enrollment);
      return true;
    } catch (error) {
      state.errorMessage = text(error?.message) || "Não foi possível atualizar a participação.";
      return false;
    } finally {
      state.loading = false;
      render({ focus: ".experiment-enrollment-actions button" });
    }
  }

  async function withdraw() {
    if (!state.enrollment?.enrollmentRef || state.loading) return false;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      state.enrollment = await controller.withdrawAuthoringExperimentEnrollment({
        enrollmentRef: state.enrollment.enrollmentRef,
        online: true
      });
      state.withdrawPrompt = false;
      await onEnrollmentChanged(state.enrollment);
      return true;
    } catch (error) {
      state.errorMessage = text(error?.message) || "Não foi possível retirar a participação.";
      return false;
    } finally {
      state.loading = false;
      render({ focus: ".experiment-enrollment-actions button" });
    }
  }

  async function openSelection() {
    if (!state.enrollment?.selection || state.loading) return false;
    state.loading = true;
    state.errorMessage = "";
    render();
    try {
      const opened = await onOpenSelection(
        state.enrollment.selection.readerTarget,
        state.enrollment.selection
      );
      if (opened !== true) {
        state.errorMessage = "A variante ainda não está disponível neste dispositivo. Sincronize e tente novamente.";
        return false;
      }
      close();
      return true;
    } catch (error) {
      state.errorMessage = text(error?.message) ||
        "A variante ainda não pôde ser aberta. Sincronize e tente novamente.";
      return false;
    } finally {
      state.loading = false;
      if (state.opened) render({ focus: '[data-experiment-enrollment-action="open-selection"]' });
    }
  }

  root.addEventListener("input", (event) => {
    if (!event.target.matches?.("[data-experiment-enrollment-code]")) return;
    state.code = event.target.value;
    const button = root.querySelector('[data-experiment-enrollment-action="read-policy"]');
    if (button) button.disabled = !enrollmentCode(state.code);
  });
  root.addEventListener("change", (event) => {
    if (!event.target.matches?.("[data-experiment-enrollment-consent]")) return;
    state.consentAcknowledged = event.target.checked === true;
    render({ focus: "[data-experiment-enrollment-consent]" });
  });
  root.addEventListener("click", (event) => {
    const node = event.target.closest?.("[data-experiment-enrollment-action]");
    if (!node || state.loading) return;
    const action = node.dataset.experimentEnrollmentAction;
    if (action === "open") void open();
    else if (action === "close") close();
    else if (action === "read-policy") void readPolicy();
    else if (action === "enroll") void enroll();
    else if (action === "refresh-status") void refreshStatus();
    else if (action === "open-selection" && state.enrollment?.selection) void openSelection();
    else if (action === "withdraw") {
      state.withdrawPrompt = true;
      render({ focus: '[data-experiment-enrollment-action="cancel-withdraw"]' });
    } else if (action === "cancel-withdraw") {
      state.withdrawPrompt = false;
      render({ focus: '[data-experiment-enrollment-action="withdraw"]' });
    } else if (action === "confirm-withdraw") void withdraw();
    else if (action === "open-handle") {
      state.enrollment = state.handles[Number(node.dataset.handleIndex)] || null;
      render({ focus: ".experiment-enrollment-actions button" });
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && state.opened) {
      const focusable = [...root.querySelectorAll(
        '[role="dialog"] button:not([disabled]), [role="dialog"] input:not([disabled]), ' +
        '[role="dialog"] textarea:not([disabled]), [role="dialog"] select:not([disabled]), ' +
        '[role="dialog"] [href], [role="dialog"] [tabindex]:not([tabindex="-1"])'
      )].filter((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        root.querySelector('[role="dialog"]')?.focus();
      } else {
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && documentValue.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && documentValue.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (event.key === "Escape" && state.opened) {
      event.preventDefault();
      if (state.withdrawPrompt) {
        state.withdrawPrompt = false;
        render({ focus: '[data-experiment-enrollment-action="withdraw"]' });
      } else close();
    }
  });

  render();
  return Object.freeze({
    open,
    close,
    handleBack() {
      if (!state.opened) return false;
      if (state.withdrawPrompt) {
        state.withdrawPrompt = false;
        render({ focus: '[data-experiment-enrollment-action="withdraw"]' });
      } else close();
      return true;
    },
    async consumeFragment() {
      const code = consumeExperimentEnrollmentFragment({ locationValue, historyValue });
      if (!code) return false;
      await open(code);
      return true;
    },
    async refresh() {
      if (state.enrollment?.enrollmentRef) return refreshStatus();
      await loadHandles();
      render();
      return true;
    }
  });
}
