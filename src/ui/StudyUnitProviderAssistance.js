import {
  requestStudyUnitAssistanceCandidate,
  STUDY_UNIT_ASSISTANCE_LIMITS
} from "../assist/studyUnitProviderAssistance.js";
import { createAndroidLocalAssistFetch } from "../assist/androidLocalAssistBridge.js";
import { listManualStudyUnitEditablePaths } from "./manualStudyUnitEdit.js";
import { renderUiIcon } from "./renderUiIcons.js";

const PROVIDERS = Object.freeze({
  openai: Object.freeze({
    label: "OpenAI Responses",
    endpoint: "https://api.openai.com/v1/responses",
    keyLabel: "Chave da OpenAI",
    keyRequired: true
  }),
  gemini: Object.freeze({
    label: "Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    keyLabel: "Chave do Gemini",
    keyRequired: true
  }),
  deepseek: Object.freeze({
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    keyLabel: "Chave do DeepSeek",
    keyRequired: true
  }),
  local: Object.freeze({
    label: "Serviço local",
    endpoint: "http://127.0.0.1:4183/v1/chat/completions",
    keyLabel: "Token local, se exigido",
    keyRequired: false
  })
});

const EMPTY_PROVIDER_CONFIG = Object.freeze({
  providerId: "",
  model: "",
  endpoint: "",
  apiKey: "",
  timeoutMs: 45_000
});

export const STUDY_UNIT_ASSISTANCE_DISCLOSURE =
  "Serão enviados ao serviço escolhido: seu pedido, o texto editável selecionado, " +
  "o título, o papel e os tópicos desta Unidade, além das mensagens anteriores desta janela. " +
  "PDFs, Fontes, identidades internas e outras Unidades não são enviados. " +
  "O AraLearn mantém a configuração e o histórico somente na memória desta sessão. " +
  "O serviço local pode encaminhar esses dados ao provedor configurado; o processamento e " +
  "a eventual retenção seguem a política desse provedor.";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function currentPathValues(studyUnit, targetId, supplied = {}) {
  return Object.fromEntries(
    listManualStudyUnitEditablePaths(studyUnit, targetId).map(({ path, value }) => [
      path,
      Object.hasOwn(supplied || {}, path) ? String(supplied[path] ?? "") : value
    ])
  );
}

function providerOptions(selected, runtimeConfig) {
  const developmentRuntime = runtimeConfig?.developmentRuntime === true;
  return '<option value="">Escolha o serviço</option>' +
    Object.entries(PROVIDERS).filter(([id]) => developmentRuntime || id === "local")
      .map(([id, provider]) =>
      `<option value="${id}"${selected === id ? " selected" : ""}>${escapeHtml(provider.label)}</option>`
    ).join("");
}

function focusableElements(sheet) {
  return [...(sheet?.querySelectorAll?.(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
  ) || [])].filter((element) => {
    if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const closedDetails = element.closest?.("details:not([open])");
    if (closedDetails && element.tagName !== "SUMMARY") return false;
    if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) {
      return false;
    }
    return true;
  });
}

function historyHtml(turns) {
  if (!turns.length) return "";
  const items = turns.slice().reverse().map((turn) =>
    '<li><strong>' + escapeHtml(turn.request) + '</strong><span>' +
      escapeHtml(turn.response) + '</span><small>' +
      escapeHtml(({
        applied: "Aplicado ao rascunho",
        discarded: "Descartado",
        "no-op": "Sem alteração"
      })[turn.outcome] || "Concluído") + '</small></li>'
  ).join("");
  return '<details class="study-unit-assistance-history"><summary>Histórico desta sessão</summary>' +
    `<ol>${items}</ol></details>`;
}

export function renderStudyUnitAssistanceTrigger({
  context = "study",
  studyUnitId = "",
  disabled = false,
  unavailableReason = "",
  label = "Assistência por API"
} = {}) {
  const reason = text(unavailableReason);
  const accessibleLabel = reason
    ? `Assistência por API indisponível: ${reason}`
    : label;
  const attribute = context === "inspection"
    ? 'data-inspection-provider-assistance'
    : 'data-action="study-provider-assistance"';
  const unitAttribute = context === "inspection" && studyUnitId
    ? ` data-study-unit-id="${escapeHtml(studyUnitId)}"`
    : "";
  return '<button class="icon-ghost study-unit-assistance-trigger" type="button" ' +
    `${attribute}${unitAttribute} aria-label="${escapeHtml(accessibleLabel)}" ` +
    `title="${escapeHtml(accessibleLabel)}"` +
    `${disabled || reason ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon("prompt", "course-authoring-button-icon")}</button>`;
}

export function createStudyUnitProviderSession() {
  let config = { ...EMPTY_PROVIDER_CONFIG };
  let destroyed = false;
  const read = () => {
    if (destroyed) throw new Error("A sessão de assistência foi encerrada.");
    return Object.freeze({ ...config });
  };
  return Object.freeze({
    read,
    update(value = {}) {
      if (destroyed) throw new Error("A sessão de assistência foi encerrada.");
      config = {
        providerId: text(value.providerId),
        model: text(value.model),
        endpoint: text(value.endpoint),
        apiKey: text(value.apiKey),
        timeoutMs: Number.isFinite(Number(value.timeoutMs))
          ? Number(value.timeoutMs)
          : EMPTY_PROVIDER_CONFIG.timeoutMs
      };
      return read();
    },
    destroy() {
      config = { ...EMPTY_PROVIDER_CONFIG };
      destroyed = true;
    },
    snapshot() {
      return Object.freeze({
        providerId: config.providerId,
        model: config.model,
        endpoint: config.endpoint,
        hasCredential: Boolean(config.apiKey),
        destroyed
      });
    }
  });
}

export function createStudyUnitProviderAssistance({
  documentValue = globalThis.document,
  windowValue = globalThis.window,
  runtimeConfig = globalThis.__ARALEARN_ENV__ || {},
  fetchImpl = globalThis.fetch,
  session: injectedSession = null
} = {}) {
  if (!documentValue?.body?.appendChild || !documentValue?.createElement) {
    throw new TypeError("Documento inválido para a assistência contextual.");
  }
  const ownsSession = injectedSession === null;
  const providerFetch = createAndroidLocalAssistFetch({
    enabled: runtimeConfig?.nativeAssistBridge === true,
    bridge: globalThis.AraLearnNativeAssist,
    fallbackFetch: fetchImpl
  });
  const session = injectedSession || createStudyUnitProviderSession();
  if (typeof session?.read !== "function" || typeof session?.update !== "function" ||
      typeof session?.snapshot !== "function") {
    throw new TypeError("Sessão inválida para a assistência contextual.");
  }
  const histories = new Map();
  let active = null;
  let overlay = null;
  let requestController = null;
  let requestEpoch = 0;
  let candidate = null;
  let pending = false;
  let peeking = false;
  let instruction = "";
  let status = "";
  let error = "";
  let destroyed = false;

  function historyKey(context) {
    return `${context.studyUnit?.id || ""}::${context.targetId}`;
  }

  function activeHistory() {
    return active ? histories.get(historyKey(active)) || [] : [];
  }

  function rememberTurn(turn) {
    if (!active) return;
    const key = historyKey(active);
    const next = [...activeHistory(), {
      request: String(turn.request || "").slice(0, 1_000),
      response: String(turn.response || "").slice(0, 800),
      outcome: turn.outcome
    }].slice(-STUDY_UNIT_ASSISTANCE_LIMITS.maximumConversationTurns);
    histories.set(key, next);
  }

  function abortPending() {
    ++requestEpoch;
    requestController?.abort?.();
    requestController = null;
    pending = false;
  }

  function setInputValues() {
    if (!overlay) return;
    const config = session.read();
    const model = overlay.querySelector("[data-assistance-model]");
    const endpoint = overlay.querySelector("[data-assistance-endpoint]");
    const key = overlay.querySelector("[data-assistance-key]");
    const request = overlay.querySelector("[data-assistance-instruction]");
    if (model) model.value = config.model;
    if (endpoint) endpoint.value = config.endpoint;
    if (key) key.value = config.apiKey;
    if (request) request.value = instruction;
  }

  function render() {
    if (!overlay || !active) return;
    if (peeking) {
      overlay.classList.add("is-peeking");
      overlay.innerHTML = '<section class="study-unit-assistance-peek" role="region" ' +
        'aria-label="Prévia no conteúdo"><span>Prévia no conteúdo</span>' +
        '<button class="open-mini" type="button" data-assistance-return>' +
        `${renderUiIcon("arrow-left", "course-authoring-button-icon")}` +
        '<span>Voltar à sugestão</span></button></section>';
      overlay.querySelector?.("[data-assistance-return]")?.addEventListener("click", () => {
        returnFromPreview();
      });
      return;
    }
    overlay.classList.remove("is-peeking");
    const config = session.read();
    const provider = PROVIDERS[config.providerId] || null;
    const developmentRuntime = runtimeConfig?.developmentRuntime === true;
    const nativeAssistBridge = runtimeConfig?.nativeAssistBridge === true;
    const providerField = developmentRuntime
      ? '<label><span>Serviço</span>' +
        `<select data-assistance-provider required${pending ? " disabled" : ""}>` +
        `${providerOptions(config.providerId, runtimeConfig)}</select></label>`
      : '<p class="study-unit-assistance-fixed-provider"><span>Serviço</span>' +
        '<strong>Serviço local</strong></p>' +
        '<input data-assistance-provider type="hidden" value="local">';
    const credentialField = developmentRuntime
      ? `<label><span>${escapeHtml(provider?.keyLabel || "Chave ou token")}</span>` +
        '<input data-assistance-key type="password" autocomplete="off" spellcheck="false" ' +
        `${provider?.keyRequired ? "required " : ""}${pending ? "disabled" : ""}></label>` +
        '<p>Modo de desenvolvimento: use somente credenciais descartáveis. ' +
        'A credencial informada é enviada no cabeçalho da requisição ao serviço escolhido; ' +
        'uma aplicação no navegador não protege chaves longas de provedor.</p>'
      : '<p>Configure a credencial no serviço local. O AraLearn não recebe nem armazena a chave do provedor.</p>';
    const candidateCopy = candidate
      ? '<section class="study-unit-assistance-candidate" aria-label="Prévia da sugestão">' +
          `<p>${escapeHtml(candidate.message)}</p>` +
          (candidate.noOp
            ? '<p class="study-unit-assistance-muted">O serviço não propôs alteração neste trecho.</p>'
            : '<p class="study-unit-assistance-muted">A prévia está visível no conteúdo atrás desta janela.</p>') +
          '<div class="study-unit-assistance-actions">' +
          (!candidate.noOp
            ? '<button class="open-mini" type="button" data-assistance-peek>' +
              `${renderUiIcon("preview", "course-authoring-button-icon")}` +
              '<span>Ver no conteúdo</span></button>'
            : "") +
          '<button class="icon-ghost" type="button" data-assistance-discard ' +
          'aria-label="Descartar sugestão" title="Descartar sugestão">' +
          `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` +
          `<button class="open-mini" type="button" data-assistance-apply${candidate.noOp ? " disabled aria-disabled=\"true\"" : ""}>` +
          `${renderUiIcon("save", "course-authoring-button-icon")}<span>Aplicar ao rascunho</span></button>` +
          '</div></section>'
      : "";
    overlay.innerHTML =
      '<div class="study-unit-assistance-backdrop" data-assistance-close></div>' +
      '<section class="study-unit-assistance-sheet" role="dialog" aria-modal="true" ' +
      'aria-labelledby="study-unit-assistance-title" aria-describedby="study-unit-assistance-description">' +
      '<header><div><h2 id="study-unit-assistance-title">Assistência por API</h2>' +
      '<p id="study-unit-assistance-description">Sugestão para o trecho em edição</p></div>' +
      '<button class="icon-ghost" type="button" data-assistance-close aria-label="Fechar" title="Fechar">' +
      `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></header>` +
      `<form data-assistance-form>${providerField}` +
      '<label><span>Modelo</span><input data-assistance-model required maxlength="160" ' +
      `autocomplete="off" spellcheck="false"${pending ? " disabled" : ""}></label>` +
      '<label class="study-unit-assistance-instruction"><span>Pedido</span>' +
      `<textarea data-assistance-instruction required maxlength="${STUDY_UNIT_ASSISTANCE_LIMITS.maximumInstructionLength}" ` +
      `placeholder="O que deve melhorar neste trecho?"${pending ? " disabled" : ""}></textarea></label>` +
      '<details class="study-unit-assistance-connection"' +
      `${provider?.keyRequired && !config.apiKey ? " open" : ""}><summary>Conexão</summary>` +
      '<label><span>Endpoint</span><input data-assistance-endpoint required type="url" ' +
      `autocomplete="off" spellcheck="false"${nativeAssistBridge ? ' readonly aria-readonly="true"' : ""}` +
      `${pending ? " disabled" : ""}></label>` +
      `${credentialField}</details>` +
      `<p class="study-unit-assistance-status" role="status" aria-live="polite">${escapeHtml(status)}</p>` +
      `<p class="study-unit-assistance-error" role="alert">${escapeHtml(error)}</p>` +
      candidateCopy + historyHtml(activeHistory()) +
      `<p class="study-unit-assistance-disclosure">${escapeHtml(STUDY_UNIT_ASSISTANCE_DISCLOSURE)}</p>` +
      '<footer><button class="open-mini" type="submit" data-assistance-generate' +
      `${pending ? " disabled aria-disabled=\"true\"" : ""}>` +
      `${renderUiIcon(pending ? "rotate" : "prompt", "course-authoring-button-icon")}` +
      `<span>${pending ? "Gerando…" : "Gerar prévia"}</span></button></footer></form></section>`;
    setInputValues();
    bindOverlay();
  }

  function syncConfigFromForm() {
    if (!overlay) return;
    const current = session.read();
    session.update({
      ...current,
      providerId: text(overlay.querySelector("[data-assistance-provider]")?.value).toLowerCase(),
      model: text(overlay.querySelector("[data-assistance-model]")?.value),
      endpoint: text(overlay.querySelector("[data-assistance-endpoint]")?.value),
      apiKey: text(overlay.querySelector("[data-assistance-key]")?.value)
    });
    instruction = text(overlay.querySelector("[data-assistance-instruction]")?.value);
  }

  async function restoreBaseline() {
    if (!active || !candidate || candidate.noOp) return;
    await Promise.resolve(active.onPreview({
      targetId: active.targetId,
      pathValues: { ...active.baselinePathValues },
      origin: active.baselineOrigin
    }));
  }

  async function close({ discard = true, restoreFocus = true } = {}) {
    if (!active) return false;
    const trigger = active.trigger;
    abortPending();
    if (discard) {
      try {
        await restoreBaseline();
      } catch {
        // O editor corrente decide como apresentar uma invalidação de contexto.
      }
    }
    overlay?.remove?.();
    overlay = null;
    histories.clear();
    active = null;
    candidate = null;
    peeking = false;
    instruction = "";
    status = "";
    error = "";
    if (restoreFocus) trigger?.focus?.({ preventScroll: true });
    return true;
  }

  async function generate() {
    if (!active || pending) return false;
    syncConfigFromForm();
    instruction = text(overlay.querySelector("[data-assistance-instruction]")?.value);
    if (candidate) await restoreBaseline();
    candidate = null;
    pending = true;
    status = "Consultando o serviço…";
    error = "";
    const epoch = ++requestEpoch;
    requestController = new AbortController();
    render();
    try {
      const generated = await requestStudyUnitAssistanceCandidate({
        studyUnit: active.studyUnit,
        targetId: active.targetId,
        currentPathValues: active.baselinePathValues,
        instruction,
        conversationTurns: activeHistory(),
        providerConfig: session.read(),
        runtimeConfig,
        fetchImpl: providerFetch,
        signal: requestController.signal
      });
      if (!active || epoch !== requestEpoch) return false;
      if (!generated.noOp) {
        await Promise.resolve(active.onPreview({
          targetId: active.targetId,
          pathValues: { ...generated.pathValues },
          origin: "provider_assistance"
        }));
      }
      candidate = generated;
      status = generated.noOp ? "Nenhuma alteração sugerida." : "Prévia pronta.";
      return true;
    } catch (caught) {
      if (!active || epoch !== requestEpoch) return false;
      error = caught instanceof Error
        ? caught.message
        : "Não foi possível gerar a prévia.";
      status = "";
      return false;
    } finally {
      if (active && epoch === requestEpoch) {
        pending = false;
        requestController = null;
        render();
        overlay?.querySelector?.(candidate
          ? candidate.noOp ? "[data-assistance-discard]" : "[data-assistance-apply]"
          : "[data-assistance-instruction]")?.focus?.({ preventScroll: true });
      }
    }
  }

  async function discardCandidate() {
    if (!active || !candidate) return false;
    const discarded = candidate;
    try {
      await restoreBaseline();
    } catch {
      error = "A prévia não pôde ser retirada porque o trecho mudou.";
      render();
      return false;
    }
    rememberTurn({
      request: instruction || "Pedido",
      response: discarded.message,
      outcome: discarded.noOp ? "no-op" : "discarded"
    });
    candidate = null;
    status = discarded.noOp ? "Sugestão encerrada." : "Sugestão descartada.";
    error = "";
    render();
    overlay?.querySelector?.("[data-assistance-instruction]")?.focus?.({ preventScroll: true });
    return true;
  }

  async function applyCandidate() {
    if (!active || !candidate || candidate.noOp) return false;
    const applied = candidate;
    const request = instruction || "Pedido";
    try {
      await Promise.resolve(active.onPreview({
        targetId: active.targetId,
        pathValues: { ...applied.pathValues },
        origin: "provider_assistance"
      }));
    } catch {
      error = "A sugestão não pôde ser aplicada porque o trecho mudou.";
      render();
      return false;
    }
    rememberTurn({ request, response: applied.message, outcome: "applied" });
    active.onApplied?.({ candidate: applied });
    return close({ discard: false });
  }

  function previewFocusTarget() {
    const supplied = active?.onFocusPreview?.();
    if (supplied?.focus) return supplied;
    if (active?.targetId === "study_unit") {
      return documentValue.querySelector?.(
        "[data-study-manual-title], [data-inspection-manual-title]"
      );
    }
    return documentValue.querySelector?.(
      ".runtime-resource-edit-target.is-inline-editing [data-package-manual-field-path], " +
      ".runtime-resource-edit-target.is-inline-editing"
    ) || documentValue.querySelector?.("[data-assistance-preview-focus]");
  }

  function peekAtContent() {
    if (!active || !candidate || candidate.noOp) return false;
    peeking = true;
    render();
    const target = previewFocusTarget();
    target?.focus?.({ preventScroll: true });
    target?.scrollIntoView?.({ block: "center", behavior: "auto" });
    return true;
  }

  function returnFromPreview() {
    if (!active || !peeking) return false;
    peeking = false;
    render();
    overlay?.querySelector?.("[data-assistance-peek]")?.focus?.({ preventScroll: true });
    return true;
  }

  function handleProviderChange(event) {
    if (!event.target.matches?.("[data-assistance-provider]")) return;
    syncConfigFromForm();
    const config = session.read();
    const selected = PROVIDERS[config.providerId];
    session.update({
      ...config,
      endpoint: selected?.endpoint || "",
      apiKey: ""
    });
    candidate = null;
    status = "";
    error = "";
    render();
    overlay?.querySelector?.("[data-assistance-model]")?.focus?.({ preventScroll: true });
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault?.();
      if (peeking) returnFromPreview();
      else void close();
      return;
    }
    if (event.key !== "Tab") return;
    const sheet = overlay?.querySelector?.(".study-unit-assistance-sheet");
    const focusable = focusableElements(sheet);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && documentValue.activeElement === first) {
      event.preventDefault?.();
      last.focus?.();
    } else if (!event.shiftKey && documentValue.activeElement === last) {
      event.preventDefault?.();
      first.focus?.();
    }
  }

  function bindOverlay() {
    overlay?.querySelectorAll?.("[data-assistance-close]").forEach((node) =>
      node.addEventListener("click", () => void close()));
    overlay?.querySelector?.("[data-assistance-provider]")
      ?.addEventListener("change", handleProviderChange);
    overlay?.querySelector?.("[data-assistance-form]")?.addEventListener("submit", (event) => {
      event.preventDefault?.();
      void generate();
    });
    overlay?.querySelector?.("[data-assistance-discard]")
      ?.addEventListener("click", () => void discardCandidate());
    overlay?.querySelector?.("[data-assistance-apply]")
      ?.addEventListener("click", () => void applyCandidate());
    overlay?.querySelector?.("[data-assistance-peek]")
      ?.addEventListener("click", peekAtContent);
    if (overlay) overlay.onkeydown = handleKeyDown;
  }

  const handleDocumentKeyDown = (event) => {
    if (!active || !peeking || event.key !== "Escape") return;
    event.preventDefault?.();
    event.stopPropagation?.();
    returnFromPreview();
  };

  const handleOnline = () => {
    if (!active || pending || candidate) return;
    error = "";
    status = "Conexão restabelecida. O rascunho foi preservado.";
    render();
  };
  windowValue?.addEventListener?.("online", handleOnline);
  documentValue.addEventListener?.("keydown", handleDocumentKeyDown, true);

  return Object.freeze({
    get opened() { return Boolean(active); },
    get pending() { return pending; },
    open({
      trigger = null,
      studyUnit,
      targetId,
      pathValues = {},
      baselineOrigin = "manual",
      onPreview,
      onApplied = null,
      onFocusPreview = null
    } = {}) {
      if (destroyed) throw new Error("A assistência contextual foi encerrada.");
      if (!studyUnit || !targetId || typeof onPreview !== "function" ||
          (onFocusPreview !== null && typeof onFocusPreview !== "function") ||
          !new Set(["manual", "provider_assistance"]).has(baselineOrigin)) {
        throw new TypeError("Contexto inválido para a assistência por API.");
      }
      const baselinePathValues = currentPathValues(studyUnit, targetId, pathValues);
      if (!Object.keys(baselinePathValues).length) {
        throw new Error("O trecho selecionado não oferece texto editável.");
      }
      if (active) return false;
      if (runtimeConfig?.developmentRuntime !== true && !session.read().providerId) {
        session.update({
          ...session.read(),
          providerId: "local",
          endpoint: PROVIDERS.local.endpoint,
          apiKey: ""
        });
      }
      active = {
        trigger,
        studyUnit: structuredClone(studyUnit),
        targetId,
        baselinePathValues,
        baselineOrigin,
        onPreview,
        onApplied,
        onFocusPreview
      };
      candidate = null;
      instruction = "";
      status = globalThis.navigator?.onLine === false
        ? "Sem conexão. O rascunho continuará disponível."
        : "";
      error = "";
      overlay = documentValue.createElement("div");
      overlay.className = "study-unit-assistance-overlay";
      overlay.setAttribute("data-study-unit-assistance", "");
      documentValue.body.appendChild(overlay);
      render();
      const initialConfig = session.read();
      overlay.querySelector?.(!initialConfig.providerId
        ? "[data-assistance-provider]"
        : initialConfig.model
          ? "[data-assistance-instruction]"
          : "[data-assistance-model]")?.focus?.({ preventScroll: true });
      return true;
    },
    handleBack() {
      if (!active) return false;
      if (peeking) return returnFromPreview();
      void close();
      return true;
    },
    close,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      windowValue?.removeEventListener?.("online", handleOnline);
      documentValue.removeEventListener?.("keydown", handleDocumentKeyDown, true);
      histories.clear();
      if (ownsSession) session.destroy?.();
      void close({ discard: false, restoreFocus: false });
    },
    sessionSnapshot() {
      const config = session.snapshot();
      return Object.freeze({
        providerId: config.providerId,
        model: config.model,
        endpoint: config.endpoint,
        hasCredential: config.hasCredential,
        historyCount: activeHistory().length,
        opened: Boolean(active),
        pending,
        peeking,
        destroyed: config.destroyed
      });
    }
  });
}
