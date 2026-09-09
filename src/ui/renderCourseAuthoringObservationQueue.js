import { CourseAuthoringObservationQueue } from "./courseAuthoringObservationQueue.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { validateStudyUnitObservationText, formatObservationTextBudget } from "./renderStudyUnitObservationSheet.js";
import { publicErrorMessage } from "./publicErrorMessage.js";

const escape = value => String(value ?? "").replace(/[&<>"']/gu, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function renderAuthoringObservationQueue({ label, items = [], total = null, opened = false,
  draft = "", editing = null, saving = false, loading = false, pending = false, error = "", message = "" }) {
  const count = total === null ? "…" : String(total);
  const accessibleCount = total === null ? "contagem ainda não disponível" : `${total} pendentes`;
  const disabled = saving || pending ? " disabled" : "";
  return '<div class="course-authoring-observation-context">' +
    `<button type="button" class="course-authoring-observation-toggle" data-author-queue-action="toggle"` +
    ` aria-expanded="${opened}" aria-label="Observações autorais de ${escape(label)}, ${accessibleCount}" title="Observações autorais pendentes">` +
    renderUiIcon("prompt", "course-authoring-button-icon") + `<span aria-hidden="true">${count}</span></button>` +
    (opened ? `<section class="course-authoring-observation-panel" aria-label="Observações autorais de ${escape(label)}">` +
      `<header><h3>Observações autorais · ${escape(label)}</h3>` +
      '<button type="button" data-author-queue-action="refresh" title="Atualizar fila" aria-label="Atualizar fila"' +
      (saving || loading ? " disabled" : "") + '>' + renderUiIcon("rotate", "course-authoring-button-icon") + '</button></header>' +
      (loading ? '<p role="status">Atualizando observações…</p>' : "") +
      (error ? `<p role="alert">${escape(error)}</p>` : "") +
      (message ? `<p role="status">${escape(message)}</p>` : "") +
      '<ol class="course-authoring-observation-entries">' + items.map((item, index) =>
        `<li data-author-queue-id="${escape(item.annotationId)}" data-author-queue-version="${item.annotationVersion}">` +
        `<p>${escape(item.rawText)}</p><div><small>Observação ${index + 1} · versão ${item.annotationVersion}</small>` +
        (item.capabilities?.canRevise ? `<button type="button" data-author-queue-action="edit" data-author-queue-id="${escape(item.annotationId)}"` +
          ` aria-label="Editar observação ${index + 1}, versão ${item.annotationVersion}" title="Editar observação"${disabled}>` +
          renderUiIcon("edit", "course-authoring-button-icon") + '</button>' : '') + '</div></li>').join("") + '</ol>' +
      (!loading && total === 0 ? '<p>Nenhuma observação autoral pendente.</p>' : '') +
      '<form data-author-queue-form><label><span>' + (editing ? `Editar observação · versão ${editing.annotationVersion}` : 'Adicionar observação') +
      `</span><textarea data-author-queue-text rows="3"${disabled}>${escape(draft)}</textarea></label>` +
      `<small data-author-queue-budget>${escape(formatObservationTextBudget(draft))}</small><div class="course-authoring-observation-actions">` +
      (editing ? `<button type="button" data-author-queue-action="cancel-edit"${disabled}>Cancelar edição</button>` : '') +
      `<button type="submit" title="${pending ? "Confirmar envio pendente" : editing ? "Salvar edição da observação" : "Adicionar observação"}"` +
      ` aria-label="${pending ? "Confirmar envio pendente" : editing ? "Salvar edição da observação" : "Adicionar observação"}"${saving ? " disabled" : ""}>` +
      renderUiIcon("ready-state", "course-authoring-button-icon") + '</button></div></form></section>' : '') + '</div>';
}

export function createAuthoringObservationQueue({ document, controller, courseId, targetKind, targetId, expectedRevision, label }) {
  const element = document.createElement("div"); element.dataset.authorQueue = "";
  const queue = new CourseAuthoringObservationQueue({ controller, courseId, targetKind, targetId, expectedRevision });
  let opened = false; let draft = ""; let editing = null; let loading = false;
  let error = ""; let message = ""; let destroyed = false; let readEpoch = 0;
  function render({ focusText = false } = {}) {
    if (destroyed) return;
    const active = element.contains(document.activeElement) ? document.activeElement : null;
    const wasText = active?.matches("[data-author-queue-text]");
    const action = active?.dataset.authorQueueAction;
    const selectedId = active?.dataset.authorQueueId;
    const selection = wasText ? [active.selectionStart, active.selectionEnd] : null;
    element.innerHTML = renderAuthoringObservationQueue({ label, items: queue.items, total: queue.total, opened,
      draft, editing, saving: queue.busy, loading, pending: Boolean(queue.pending), error, message });
    const target = wasText || focusText ? element.querySelector("[data-author-queue-text]")
      : action ? [...element.querySelectorAll("[data-author-queue-action]")].find(node =>
        node.dataset.authorQueueAction === action && node.dataset.authorQueueId === selectedId) : null;
    if (target && !target.disabled) { target.focus({ preventScroll: true }); if (selection) target.setSelectionRange(...selection); }
  }
  async function refresh() {
    if (queue.busy) return;
    const current = ++readEpoch; loading = true; error = ""; render();
    try { await queue.load(); }
    catch (failure) { if (!destroyed && current === readEpoch) error = publicErrorMessage(failure, "Não foi possível atualizar a fila. Seu rascunho foi preservado."); }
    finally { if (!destroyed && current === readEpoch) { loading = false; render(); } }
  }
  element.addEventListener("input", event => {
    if (!event.target.matches("[data-author-queue-text]")) return;
    draft = event.target.value;
    element.querySelector("[data-author-queue-budget]").textContent = formatObservationTextBudget(draft);
  });
  element.addEventListener("click", event => {
    const button = event.target.closest("[data-author-queue-action]"); if (!button) return;
    const action = button.dataset.authorQueueAction;
    if (action === "toggle") { opened = !opened; render(); if (opened) void refresh(); return; }
    if (action === "refresh") { void refresh(); return; }
    if (queue.busy || queue.pending) return;
    if (action === "cancel-edit") { editing = null; draft = ""; error = ""; render({ focusText: true }); }
    if (action === "edit") {
      const item = queue.items.find(value => value.annotationId === button.dataset.authorQueueId);
      if (!item?.capabilities.canRevise) return;
      if (draft && (!editing || draft !== editing.rawText)) { error = "Salve ou apague seu rascunho antes de abrir outra observação."; render(); return; }
      editing = structuredClone(item); draft = item.rawText; error = ""; message = ""; render({ focusText: true });
    }
  });
  element.addEventListener("submit", event => {
    if (!event.target.matches("[data-author-queue-form]")) return;
    event.preventDefault();
    if (queue.busy) return;
    if (!queue.pending && (error = validateStudyUnitObservationText(draft))) { render({ focusText: true }); return; }
    void (async () => {
      error = ""; message = "";
      const save = queue.save({ rawText: draft, category: editing?.category || null, editing }); render();
      try {
        await save; if (destroyed) return;
        draft = ""; editing = null;
        message = "Observação salva. Você pode adicionar outra.";
        await refresh();
      } catch (failure) {
        if (destroyed) return;
        error = queue.pending ? "Não foi possível confirmar o envio. Confirme o resultado do mesmo pedido; seu texto foi preservado."
          : publicErrorMessage(failure, "A observação não foi salva. Seu rascunho foi preservado.");
        render({ focusText: true });
      }
    })();
  });
  render();
  return { element, queue,
    hasPendingDraft: () => Boolean(queue.busy || queue.pending || draft && (!editing || draft !== editing.rawText)),
    async load() {
      try {
        await queue.restorePending(); if (destroyed) return;
        if (queue.pending) { draft = queue.pending.command.rawText; opened = true; }
        await refresh();
      } catch (failure) { if (!destroyed) { error = publicErrorMessage(failure, "Não foi possível recuperar a observação em envio."); opened = true; render(); } }
    },
    destroy() { destroyed = true; ++readEpoch; }
  };
}
