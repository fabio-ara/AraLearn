import {
  prepareCourseAssistanceProposal,
  requestCourseAssistanceDiscussion,
  COURSE_ASSISTANCE_LIMITS
} from "../assist/courseContextualAssistance.js";
import { renderUiIcon } from "./renderUiIcons.js";

const PROVIDERS = Object.freeze({
  openai: Object.freeze({
    label: "OpenAI",
    keyLabel: "Chave da OpenAI"
  }),
  deepseek: Object.freeze({
    label: "DeepSeek",
    keyLabel: "Chave da DeepSeek"
  }),
  gemini: Object.freeze({
    label: "Gemini",
    keyLabel: "Chave do Gemini"
  })
});

const MODEL_PRESETS = Object.freeze([
  Object.freeze({ value: "gpt-5.6-luna", label: "OpenAI · GPT-5.6 Luna" }),
  Object.freeze({ value: "gemini-2.5-flash", label: "Gemini · 2.5 Flash" }),
  Object.freeze({ value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" }),
  Object.freeze({ value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" })
]);

const EMPTY_CONFIG = Object.freeze({
  providerId: "",
  model: "",
  apiKey: "",
  timeoutMs: 45_000
});

const SCOPE_LABELS = Object.freeze({
  study_unit: "Unidade",
  didactic_microsequence: "Microssequência",
  lesson: "Lição"
});

export const COURSE_ASSISTANCE_DISCLOSURE =
  "Para responder, o serviço escolhido (OpenAI, Gemini ou DeepSeek) recebe sua mensagem, " +
  "o conteúdo selecionado, o restante deste objeto como contexto e um resumo do Curso. " +
  "PDFs, Fontes e dados da conta não são enviados. Sua chave fica somente nesta sessão. " +
  "O serviço pode guardar o conteúdo conforme os próprios termos.";

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

function providerModelPrefix(providerId) {
  return providerId === "openai" ? "gpt-" : providerId === "gemini" ? "gemini-" : "deepseek-";
}

function modelOptions(selected, providerId) {
  const available = providerId
    ? MODEL_PRESETS.filter(({ value }) => value.startsWith(providerModelPrefix(providerId)))
    : MODEL_PRESETS;
  const known = available.some(({ value }) => value === selected);
  return '<option value="">Escolha o modelo</option>' +
    (!selected || known ? "" : `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`) +
    available.map(({ value, label }) =>
    `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>` +
    `${escapeHtml(label)}</option>`).join("");
}

function providerOptions(selected) {
  return '<option value="">Escolha o serviço</option>' + Object.entries(PROVIDERS)
    .map(([id, provider]) => `<option value="${id}"${selected === id ? " selected" : ""}>` +
      `${escapeHtml(provider.label)}</option>`).join("");
}

function conversationHtml(conversation) {
  if (!conversation.length) {
    return '<p class="course-assistance-empty">Diga o que deseja compreender ou mudar. Nada será aplicado sem sua confirmação.</p>';
  }
  return '<ol class="course-assistance-conversation" aria-label="Conversa desta sessão">' +
    conversation.map((turn) => `<li class="is-${turn.role}"><span>${turn.role === "user" ? "Você" : "Assistência"}</span>` +
      `<p>${escapeHtml(turn.message)}</p></li>`).join("") + "</ol>";
}

function selectedScopeLabel(scope, ids = []) {
  const count = ids.length;
  if (scope === "study_unit") {
    return ids.includes("study_unit")
      ? "Unidade inteira"
      : `${count} ${count === 1 ? "componente" : "componentes"}`;
  }
  if (scope === "didactic_microsequence") {
    return `${count} ${count === 1 ? "Unidade" : "Unidades"}`;
  }
  return `${count} ${count === 1 ? "Microssequência" : "Microssequências"}`;
}

function proposalHtml(proposal, pending) {
  if (!proposal) return "";
  return '<section class="course-assistance-plan" aria-labelledby="course-assistance-plan-title">' +
    '<p>Antes da mudança</p><h3 id="course-assistance-plan-title">Plano proposto</h3>' +
    `<p>${escapeHtml(proposal.summary)}</p>` +
    '<button class="open-mini" type="button" data-course-assistance-prepare' +
    `${pending ? ' disabled aria-disabled="true"' : ""}>` +
    `${renderUiIcon("play", "course-authoring-button-icon")}<span>Confirmar e preparar</span></button>` +
    '</section>';
}

function candidateHtml(candidate) {
  if (!candidate) return "";
  const unitCount = candidate.previews.length;
  return '<section class="course-assistance-candidate" aria-labelledby="course-assistance-preview-title">' +
    '<p>Proposta validada</p><h3 id="course-assistance-preview-title">Prévia pronta</h3>' +
    `<p>${escapeHtml(candidate.message)}</p>` +
    `<small>${unitCount} ${unitCount === 1 ? "Unidade pronta" : "Unidades prontas"} para conferência.</small>` +
    '<div class="course-assistance-actions">' +
    '<button class="open-mini" type="button" data-course-assistance-peek>' +
    `${renderUiIcon("preview", "course-authoring-button-icon")}<span>Ver prévia</span></button>` +
    '<button class="icon-ghost" type="button" data-course-assistance-discard aria-label="Descartar proposta" title="Descartar proposta">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` +
    '<button class="open-mini" type="button" data-course-assistance-apply>' +
    `${renderUiIcon("save", "course-authoring-button-icon")}<span>Aplicar ao rascunho</span></button>` +
    '</div></section>';
}

function focusable(sheet) {
  return [...(sheet?.querySelectorAll?.(
    'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
  ) || [])].filter((element) => {
    if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const closed = element.closest?.("details:not([open])");
    return !closed || element.tagName === "SUMMARY";
  });
}

export function createCourseProviderSession() {
  let config = { ...EMPTY_CONFIG };
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
        apiKey: text(value.apiKey),
        timeoutMs: Number.isFinite(Number(value.timeoutMs))
          ? Number(value.timeoutMs)
          : EMPTY_CONFIG.timeoutMs
      };
      return read();
    },
    snapshot() {
      return Object.freeze({
        providerId: config.providerId,
        model: config.model,
        hasCredential: Boolean(config.apiKey),
        destroyed
      });
    },
    clear() {
      if (destroyed) return false;
      config = { ...EMPTY_CONFIG };
      return true;
    },
    destroy() {
      config = { ...EMPTY_CONFIG };
      destroyed = true;
    }
  });
}

export function createCourseProviderAssistance({
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
  const session = injectedSession || createCourseProviderSession();
  if (typeof session?.read !== "function" || typeof session?.update !== "function") {
    throw new TypeError("Sessão inválida para a assistência contextual.");
  }
  let active = null;
  let overlay = null;
  let requestController = null;
  let requestEpoch = 0;
  let conversation = [];
  let proposal = null;
  let candidate = null;
  let messageDraft = "";
  let status = "";
  let error = "";
  let pending = false;
  let peeking = false;
  let connectionOpen = false;
  let destroyed = false;

  function abortPending() {
    requestEpoch += 1;
    requestController?.abort?.();
    requestController = null;
    pending = false;
  }

  function syncForm() {
    if (!overlay) return;
    const current = session.read();
    const credential = text(overlay.querySelector("[data-course-assistance-key]")?.value);
    session.update({
      ...current,
      providerId: text(overlay.querySelector("[data-course-assistance-provider]")?.value),
      model: text(overlay.querySelector("[data-course-assistance-model]")?.value),
      apiKey: credential || current.apiKey
    });
    messageDraft = text(overlay.querySelector("[data-course-assistance-message]")?.value);
  }

  function renderPeek() {
    overlay.classList.add("is-peeking");
    overlay.innerHTML = '<section class="course-assistance-peek" role="region" aria-label="Prévia no conteúdo">' +
      `<span>Prévia da ${escapeHtml(SCOPE_LABELS[active.scope])}</span>` +
      '<button class="open-mini" type="button" data-course-assistance-return>' +
      `${renderUiIcon("arrow-left", "course-authoring-button-icon")}<span>Voltar à conversa</span></button></section>`;
    overlay.querySelector("[data-course-assistance-return]")?.addEventListener("click", () => {
      peeking = false;
      render({
        focusSelector: "[data-course-assistance-message]",
        scrollBodyToEnd: true
      });
    });
  }

  function render({ focusSelector = "", scrollBodyToEnd = false, revealSelector = "" } = {}) {
    if (!overlay || !active) return;
    if (peeking) return renderPeek();
    const previousBody = overlay.querySelector("[data-course-assistance-body]");
    const previousScrollTop = previousBody?.scrollTop || 0;
    if (!focusSelector && overlay.contains?.(documentValue.activeElement)) {
      focusSelector = [
        "data-course-assistance-message",
        "data-course-assistance-provider",
        "data-course-assistance-model",
        "data-course-assistance-key",
        "data-course-assistance-send",
        "data-course-assistance-prepare",
        "data-course-assistance-discard",
        "data-course-assistance-apply"
      ].find((name) => documentValue.activeElement?.hasAttribute?.(name));
      if (focusSelector) focusSelector = `[${focusSelector}]`;
    }
    overlay.classList.remove("is-peeking");
    const config = session.read();
    const provider = PROVIDERS[config.providerId] || null;
    const providerField = '<label><span>Serviço</span><select data-course-assistance-provider' +
      `${pending ? " disabled" : ""}>${providerOptions(config.providerId)}</select></label>`;
    const credentialField = `<label><span>${escapeHtml(provider?.keyLabel || "Chave de API")}</span>` +
      `<input type="password" autocomplete="off" data-course-assistance-key ` +
      `placeholder="${config.apiKey ? "Chave informada nesta sessão" : "Somente nesta sessão"}"` +
      `${pending ? " disabled" : ""}></label>`;
    overlay.innerHTML = '<div class="course-assistance-backdrop" data-course-assistance-close></div>' +
      '<section class="course-assistance-sheet" role="dialog" aria-modal="true" ' +
      'aria-labelledby="course-assistance-title" aria-describedby="course-assistance-context">' +
      '<header><div><p class="course-assistance-eyebrow">Assistência por IA · ' +
      `${escapeHtml(SCOPE_LABELS[active.scope])}</p><h2 id="course-assistance-title">` +
      `${escapeHtml(active.targetTitle)}</h2>` +
      '<p id="course-assistance-context"><strong>' +
      `${escapeHtml(selectedScopeLabel(active.scope, active.writeTargetIds))}.</strong> ` +
      'A IA só poderá propor mudanças nessa seleção.</p></div>' +
      '<button class="icon-ghost" type="button" data-course-assistance-close aria-label="Fechar" title="Fechar">' +
      `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></header>` +
      '<div class="course-assistance-body" data-course-assistance-body>' +
      conversationHtml(conversation) + proposalHtml(proposal, pending) + candidateHtml(candidate) +
      `<details class="course-assistance-connection"${connectionOpen ? " open" : ""}>` +
      '<summary>Serviço e modelo</summary>' +
      providerField + '<label><span>Modelo</span><select data-course-assistance-model' +
      `${pending ? " disabled" : ""}>${modelOptions(config.model, config.providerId)}</select></label>` +
      `${credentialField}</details>` +
      (status
        ? `<p class="course-assistance-status" tabindex="-1" role="status" aria-live="polite">${escapeHtml(status)}</p>`
        : "") +
      (error
        ? `<p class="course-assistance-error" tabindex="-1" role="alert">${escapeHtml(error)}</p>`
        : "") +
      '<details class="course-assistance-disclosure"><summary>Privacidade e envio</summary><p>' +
      `${escapeHtml(COURSE_ASSISTANCE_DISCLOSURE)}</p></details></div>` +
      '<form data-course-assistance-form><label class="course-assistance-message"><span>Mensagem</span>' +
      `<textarea data-course-assistance-message maxlength="${COURSE_ASSISTANCE_LIMITS.maximumRequestLength}" ` +
      `placeholder="Discuta, peça uma explicação ou refine a mudança"${pending ? " disabled" : ""}>` +
      `${escapeHtml(messageDraft)}</textarea></label>` +
      '<button class="open-mini" type="submit" data-course-assistance-send' +
      `${pending ? ' disabled aria-disabled="true"' : ""}>` +
      `${renderUiIcon(pending ? "rotate" : "prompt", "course-authoring-button-icon")}` +
      `<span>${pending ? "Aguarde…" : "Enviar"}</span></button></form></section>`;
    bind();
    const nextBody = overlay.querySelector("[data-course-assistance-body]");
    if (nextBody) {
      nextBody.scrollTop = scrollBodyToEnd ? nextBody.scrollHeight : previousScrollTop;
      const revealTarget = revealSelector && overlay.querySelector(revealSelector);
      if (revealTarget?.getBoundingClientRect && nextBody.getBoundingClientRect) {
        const bodyBounds = nextBody.getBoundingClientRect();
        const targetBounds = revealTarget.getBoundingClientRect();
        nextBody.scrollTop += targetBounds.top - bodyBounds.top;
      }
    }
    const focusTarget = focusSelector && overlay.querySelector(focusSelector);
    if (focusTarget && !focusTarget.disabled) {
      try { focusTarget.focus({ preventScroll: true }); } catch { focusTarget.focus(); }
    }
  }

  async function restorePreview() {
    if (!active || !candidate) return;
    await Promise.resolve(active.onDiscardPreview?.());
  }

  async function close({ discard = true, restoreFocus = true } = {}) {
    if (!active) return false;
    const trigger = active.trigger;
    const onClosed = active.onClosed;
    abortPending();
    if (discard && candidate) {
      try { await restorePreview(); } catch { /* O consumidor informa mudança concorrente. */ }
    }
    overlay?.remove?.();
    documentValue?.removeEventListener?.("keydown", keydown);
    overlay = null;
    active = null;
    conversation = [];
    proposal = null;
    candidate = null;
    messageDraft = "";
    status = "";
    error = "";
    peeking = false;
    connectionOpen = false;
    if (typeof session.clear === "function") session.clear();
    else session.update({ ...EMPTY_CONFIG });
    if (!destroyed) onClosed?.();
    if (restoreFocus) trigger?.focus?.({ preventScroll: true });
    return true;
  }

  async function sendMessage() {
    if (!active || pending) return false;
    syncForm();
    if (!messageDraft) {
      error = "Escreva uma mensagem antes de enviar.";
      render({ focusSelector: "[data-course-assistance-message]" });
      return false;
    }
    const config = session.read();
    const missingSelector = !config.providerId
      ? "[data-course-assistance-provider]"
      : !config.model
        ? "[data-course-assistance-model]"
        : !config.apiKey
          ? "[data-course-assistance-key]"
          : "";
    if (missingSelector) {
      connectionOpen = true;
      status = "";
      error = "Escolha o serviço e informe a chave desta sessão antes de enviar.";
      render({
        focusSelector: missingSelector,
        revealSelector: ".course-assistance-connection > summary"
      });
      return false;
    }
    if (candidate) await restorePreview();
    candidate = null;
    const userMessage = messageDraft;
    conversation = [...conversation, { role: "user", message: userMessage }]
      .slice(-COURSE_ASSISTANCE_LIMITS.maximumConversationTurns * 2);
    messageDraft = "";
    proposal = null;
    pending = true;
    status = "Conversando sobre a mudança…";
    error = "";
    const epoch = ++requestEpoch;
    requestController = new AbortController();
    render({
      focusSelector: "[data-course-assistance-status]",
      scrollBodyToEnd: true
    });
    try {
      const response = await requestCourseAssistanceDiscussion({
        project: active.project,
        selection: active.selection,
        scope: active.scope,
        writeTargetId: active.writeTargetId,
        writeTargetIds: active.writeTargetIds,
        message: userMessage,
        conversation: conversation.slice(0, -1),
        providerConfig: session.read(),
        runtimeConfig,
        fetchImpl,
        signal: requestController.signal
      });
      if (!active || epoch !== requestEpoch) return false;
      conversation = [...conversation, { role: "assistant", message: response.message }]
        .slice(-COURSE_ASSISTANCE_LIMITS.maximumConversationTurns * 2);
      proposal = response.proposal;
      status = proposal
        ? "Revise o plano. Você pode refiná-lo na conversa ou confirmar a preparação."
        : "A conversa continua sem alterar o conteúdo.";
      return true;
    } catch (caught) {
      if (!active || epoch !== requestEpoch) return false;
      error = caught instanceof Error ? caught.message : "Não foi possível concluir a conversa.";
      status = "";
      return false;
    } finally {
      if (active && epoch === requestEpoch) {
        pending = false;
        requestController = null;
        render({
          focusSelector: "[data-course-assistance-message]",
          scrollBodyToEnd: true
        });
      }
    }
  }

  async function prepareProposal() {
    if (!active || !proposal || pending) return false;
    syncForm();
    pending = true;
    status = "Preparando a proposta para prévia…";
    error = "";
    const epoch = ++requestEpoch;
    requestController = new AbortController();
    render({ focusSelector: "[data-course-assistance-status]", scrollBodyToEnd: true });
    try {
      const prepared = await prepareCourseAssistanceProposal({
        project: active.project,
        selection: active.selection,
        confirmedProposal: proposal,
        conversation,
        writeTargetIds: active.writeTargetIds,
        providerConfig: session.read(),
        runtimeConfig,
        fetchImpl,
        signal: requestController.signal
      });
      if (!active || epoch !== requestEpoch) return false;
      await Promise.resolve(active.onPreview(prepared));
      candidate = prepared;
      status = "Prévia pronta. Confira o resultado antes de aplicar.";
      return true;
    } catch (caught) {
      if (!active || epoch !== requestEpoch) return false;
      error = caught instanceof Error ? caught.message : "A proposta não pôde ser preparada.";
      status = "O conteúdo original foi preservado.";
      candidate = null;
      return false;
    } finally {
      if (active && epoch === requestEpoch) {
        pending = false;
        requestController = null;
        render({ focusSelector: "[data-course-assistance-message]", scrollBodyToEnd: true });
      }
    }
  }

  async function discard() {
    if (!candidate) return false;
    await restorePreview();
    candidate = null;
    status = "Proposta descartada. A conversa continua disponível.";
    error = "";
    render({ focusSelector: "[data-course-assistance-message]", scrollBodyToEnd: true });
    return true;
  }

  async function apply() {
    if (!active || !candidate) return false;
    const applied = candidate;
    try {
      await Promise.resolve(active.onApplyDraft(applied));
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "A proposta não pôde ser aplicada ao rascunho.";
      render({ focusSelector: "[data-course-assistance-error]", scrollBodyToEnd: true });
      return false;
    }
    candidate = null;
    return close({ discard: false });
  }

  function changeProvider(event) {
    if (!event.target.matches?.("[data-course-assistance-provider]")) return;
    syncForm();
    const current = session.read();
    session.update({
      ...current,
      model: MODEL_PRESETS.find(({ value }) => value.startsWith(
        current.providerId === "openai" ? "gpt-" : current.providerId === "gemini" ? "gemini-" : "deepseek-"
      ))?.value || "",
      apiKey: ""
    });
    connectionOpen = true;
    render();
  }

  function keydown(event) {
    if (event.key === "Escape") {
      event.preventDefault?.();
      if (peeking) {
        peeking = false;
        render({
          focusSelector: "[data-course-assistance-message]",
          scrollBodyToEnd: true
        });
      } else void close();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusable(overlay?.querySelector(".course-assistance-sheet"));
    if (!elements.length) return;
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && documentValue.activeElement === first) {
      event.preventDefault?.(); last.focus?.();
    } else if (!event.shiftKey && documentValue.activeElement === last) {
      event.preventDefault?.(); first.focus?.();
    }
  }

  function bind() {
    overlay.querySelectorAll?.("[data-course-assistance-close]").forEach((node) =>
      node.addEventListener("click", () => void close()));
    overlay.querySelector("[data-course-assistance-form]")?.addEventListener("submit", (event) => {
      event.preventDefault?.(); void sendMessage();
    });
    overlay.querySelector("[data-course-assistance-prepare]")
      ?.addEventListener("click", () => void prepareProposal());
    overlay.querySelector("[data-course-assistance-discard]")
      ?.addEventListener("click", () => void discard());
    overlay.querySelector("[data-course-assistance-apply]")
      ?.addEventListener("click", () => void apply());
    overlay.querySelector("[data-course-assistance-peek]")?.addEventListener("click", () => {
      peeking = true; render(); active?.onFocusPreview?.();
    });
    overlay.querySelector("[data-course-assistance-provider]")
      ?.addEventListener("change", changeProvider);
    overlay.querySelector(".course-assistance-connection")?.addEventListener("toggle", (event) => {
      connectionOpen = event.currentTarget.open;
      if (connectionOpen) {
        const body = overlay.querySelector("[data-course-assistance-body]");
        const summary = event.currentTarget.querySelector("summary");
        if (body?.getBoundingClientRect && summary?.getBoundingClientRect) {
          body.scrollTop += summary.getBoundingClientRect().top - body.getBoundingClientRect().top;
        }
      }
    });
  }

  const handleOnline = () => {
    if (!active || pending || candidate) return;
    error = "";
    status = "Conexão restabelecida. A conversa foi preservada.";
    render();
  };
  windowValue?.addEventListener?.("online", handleOnline);

  return Object.freeze({
    get opened() { return Boolean(active); },
    get pending() { return pending; },
    open({
      trigger = null,
      project,
      selection,
      scope,
      targetTitle,
      writeTargetId = "",
      writeTargetIds = [],
      onPreview,
      onDiscardPreview,
      onApplyDraft,
      onFocusPreview = null,
      onClosed = null
    } = {}) {
      if (destroyed) throw new Error("A assistência contextual foi encerrada.");
      if (active || !project || !selection || !SCOPE_LABELS[scope] ||
          typeof onPreview !== "function" || typeof onDiscardPreview !== "function" ||
          typeof onApplyDraft !== "function") return false;
      active = {
        trigger, project: structuredClone(project), selection: structuredClone(selection),
        scope, targetTitle: text(targetTitle) || SCOPE_LABELS[scope], writeTargetId,
        writeTargetIds: (() => {
          const normalized = [...new Set((Array.isArray(writeTargetIds) ? writeTargetIds : [])
            .map(text).filter(Boolean))];
          return normalized.length ? normalized : scope === "study_unit" ? ["study_unit"] : [];
        })(),
        onPreview, onDiscardPreview, onApplyDraft, onFocusPreview, onClosed
      };
      overlay = documentValue.createElement("div");
      overlay.className = "course-assistance-overlay";
      overlay.setAttribute("data-course-assistance", "");
      documentValue.body.appendChild(overlay);
      documentValue.addEventListener?.("keydown", keydown);
      conversation = [];
      proposal = null;
      candidate = null;
      messageDraft = "";
      status = "";
      error = "";
      const config = session.read();
      const missingSelector = !config.providerId
        ? "[data-course-assistance-provider]"
        : !config.model
          ? "[data-course-assistance-model]"
          : !config.apiKey
            ? "[data-course-assistance-key]"
            : "";
      connectionOpen = Boolean(missingSelector);
      render({
        focusSelector: missingSelector || "[data-course-assistance-message]",
        revealSelector: missingSelector ? ".course-assistance-connection > summary" : ""
      });
      return true;
    },
    handleBack() {
      if (!active) return false;
      if (peeking) {
        peeking = false;
        render({
          focusSelector: "[data-course-assistance-message]",
          scrollBodyToEnd: true
        });
        return true;
      }
      void close();
      return true;
    },
    close,
    sessionSnapshot() {
      const config = session.snapshot();
      return Object.freeze({
        ...config,
        opened: Boolean(active),
        pending,
        peeking,
        conversationTurnCount: conversation.length,
        hasProposal: Boolean(proposal),
        hasCandidate: Boolean(candidate)
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      windowValue?.removeEventListener?.("online", handleOnline);
      documentValue?.removeEventListener?.("keydown", keydown);
      if (ownsSession) session.destroy?.();
      void close({ discard: false, restoreFocus: false });
    }
  });
}

export { MODEL_PRESETS as COURSE_ASSISTANCE_MODEL_PRESETS };
