import { CourseAuthoringObservationQueue, observationTargetCatalog, observationDecisionSelection, filterAuthoringObservations, loadObservationComparison } from "./courseAuthoringObservationQueue.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { validateStudyUnitObservationText, renderStudyUnitObservationSheet, renderObservationComparison } from "./renderStudyUnitObservationSheet.js";
import { publicErrorMessage } from "./publicErrorMessage.js";

const targetFromKey = key => { const split = key.indexOf(":"); return { kind: key.slice(0, split), id: key.slice(split + 1) }; };

export function renderAuthoringObservationQueue({ label, items = [], total = null, opened = false,
  draft = "", category = null, editing = null, saving = false, loading = false, pending = false, error = "", message = "",
  availableTargets = [], selectedTargets = [], filters = {}, selectedObservationIds = [], selectedTargetKeysByAnnotation = {}, cancelReason = 'withdrawal', recoveryExpired = false }) {
  return '<div class="course-authoring-observation-context">' +
    `<button type="button" class="course-authoring-observation-toggle" data-author-queue-action="toggle" aria-expanded="${opened}"` +
    ` aria-label="Observações autorais do curso, ${total === null ? 'contagem ainda não disponível' : `${total} pendentes`}" title="Observações autorais do curso">` +
    renderUiIcon("prompt", "course-authoring-button-icon") +
    (total === 0 ? '' : `<span class="course-authoring-observation-count" aria-hidden="true">${total === null ? '…' : total}</span>`) + '</button>' +
    (opened ? renderStudyUnitObservationSheet({ items, authoringQueue: true, title: "Observações do curso",
      ariaLabel: "Central de observações autorais", listLabel: "Observações autorais pendentes", showContributor: false,
      draft: { rawText: draft, category }, editingId: editing?.annotationId, saving: saving || pending, pending, loading, error, recoveryExpired,
      collectionSummary: { matchingTotal: total ?? 0, activeTotal: total ?? 0 },
      contextMessage: message || `Contexto de criação: ${label}`, availableTargets, selectedTargets, filters, selectedObservationIds, selectedTargetKeysByAnnotation, cancelReason }) : '') + '</div>';
}

export function createAuthoringObservationQueue({ document, controller, courseId, targetKind, targetId, expectedRevision, label }) {
  const element = document.createElement("div"); element.dataset.authorQueue = "";
  const queue = new CourseAuthoringObservationQueue({ controller, courseId, targetKind, targetId, expectedRevision });
  let opened = false; let draft = ""; let category = null; let editing = null; let loading = false;
  let error = ""; let message = ""; let destroyed = false; let readEpoch = 0;
  let availableTargets = [{ kind: targetKind, id: targetId, label }];
  let selectedTargets = [{ kind: targetKind, id: targetId }];
  const filters = {}; let selectedObservationIds = []; let selectedTargetKeysByAnnotation = {}; let cancelReason = 'withdrawal';
  let recoveryExpired = false;
  function closePanel() {
    if (!opened) return false;
    if (!queue.busy && !queue.pending) {
      opened = false; render(); element.querySelector("[data-author-queue-action='toggle']")?.focus({ preventScroll: true });
    }
    return true;
  }
  function render({ focusText = false } = {}) {
    if (destroyed) return;
    const active = element.contains(document.activeElement) ? document.activeElement : null;
    const wasText = active?.matches("[data-field='study-unit-observation']");
    const selection = wasText ? [active.selectionStart, active.selectionEnd] : null;
    const scroll = element.querySelector(".study-observation-body")?.scrollTop || 0;
    element.innerHTML = renderAuthoringObservationQueue({ label, items: queue.items, total: queue.total, opened,
      draft, category, editing, saving: queue.busy, loading, pending: Boolean(queue.pending), error, message, availableTargets, selectedTargets,
      filters, selectedObservationIds, selectedTargetKeysByAnnotation, cancelReason, recoveryExpired });
    const body = element.querySelector(".study-observation-body"); if (body) body.scrollTop = scroll;
    const target = wasText || focusText ? element.querySelector("[data-field='study-unit-observation']") : null;
    if (target && !target.disabled) { target.focus({ preventScroll: true }); if (selection) target.setSelectionRange(...selection); }
  }
  async function refresh() {
    if (queue.busy) return;
    const current = ++readEpoch; loading = true; error = ""; render();
    try { await queue.load(); }
    catch (failure) { if (!destroyed && current === readEpoch) error = publicErrorMessage(failure, "Não foi possível atualizar a central. Seu rascunho foi preservado."); }
    finally { if (!destroyed && current === readEpoch) { loading = false; render(); } }
  }
  element.addEventListener("input", event => {
    if (event.target.matches("[data-field='study-unit-observation']")) draft = event.target.value;
  });
  element.addEventListener("change", event => {
    if (event.target.matches('[data-observation-filter]')) { filters[event.target.dataset.observationFilter] = event.target.value; render(); }
    if (event.target.matches('[data-observation-select]')) selectedObservationIds = [...element.querySelectorAll('[data-observation-select]:checked')].map(node => node.dataset.observationId);
    if (event.target.matches('[data-observation-target-select]')) selectedTargetKeysByAnnotation = { ...selectedTargetKeysByAnnotation, ...observationDecisionSelection(element) };
    if (event.target.matches('[data-observation-cancel-reason]')) cancelReason = event.target.value;
    if (event.target.matches("[data-field='study-unit-observation-category']")) category = event.target.value || null;
    if (event.target.matches("[data-observation-new-targets]")) selectedTargets = [...event.target.selectedOptions].map(option => targetFromKey(option.value));
  });
  element.addEventListener("click", event => {
    const button = event.target.closest("[data-author-queue-action], [data-observation-action]"); if (!button) return;
    const action = button.dataset.authorQueueAction || button.dataset.observationAction;
    if (action === "toggle") { opened = !opened; render(); if (opened) void refresh(); return; }
    if (action === "refresh") { void refresh(); return; }
    if (action === "retry") { void execute(async () => { await queue.resumeDecisions(); draft = ''; editing = null; category = null; }); return; }
    if (action === "abandon-expired") { void execute(async () => { await queue.abandonExpiredAttempt(); recoveryExpired = false; }, 'Tentativa encerrada. Seu rascunho foi preservado; um novo envio cria outra observação.'); return; }
    if (queue.busy || queue.pending) return;
    if (action === "close") { closePanel(); return; }
    if (action === "cancel-edit") { editing = null; draft = ""; category = null; error = ""; render({ focusText: true }); return; }
    const item = queue.items.find(value => value.annotationId === button.dataset.observationId);
    if (action === "compare") {
      const panel = button.closest('[data-observation-comparison]'); button.disabled = true;
      void loadObservationComparison(controller, courseId, item, button.dataset.observationTargetKey).then(target => {
        if (panel.isConnected) panel.innerHTML = renderObservationComparison(target);
      }).catch(failure => { button.disabled = false; button.textContent = publicErrorMessage(failure, 'Não foi possível carregar. Tente novamente.'); });
      return;
    }
    if (action === "edit") {
      if (!item?.capabilities.canRevise) return;
      if (draft && (!editing || draft !== editing.rawText)) { error = "Salve ou apague seu rascunho antes de abrir outra observação."; render(); return; }
      editing = structuredClone(item); draft = item.rawText; category = item.category; error = ""; message = ""; render({ focusText: true }); return;
    }
    if (action === "retarget") {
      const select = [...element.querySelectorAll("[data-observation-retarget]")].find(node => node.dataset.observationRetarget === item?.annotationId);
      const targets = [...(select?.selectedOptions || [])].map(option => targetFromKey(option.value));
      const command = { type: "retarget_anchored_annotation", annotationId: item.annotationId, expectedAnnotationVersion: item.annotationVersion,
        expectedTargetSetVersion: item.targetSetVersion, targets };
      void execute(() => queue.save({ command })); return;
    }
    if (/^(approve|cancel)(-|$)/u.test(action)) {
      const selectedIds = new Set([...element.querySelectorAll("[data-observation-select]:checked")].map(node => node.dataset.observationId));
      const presented = filterAuthoringObservations(queue.items, filters).filter(value => value.targetSetVersion);
      const items = item ? [item] : action.endsWith("-all") ? presented : presented.filter(value => selectedIds.has(value.annotationId));
      if (!items.length) { error = "Selecione as observações que deseja decidir."; render(); return; }
      const targetKeysByAnnotation = observationDecisionSelection(element);
      const decision = action.startsWith("approve") ? "approve" : "cancel";
      const reason = decision === "cancel" ? element.querySelector("[data-observation-cancel-reason]").value : null;
      void execute(() => queue.decide(items, { decision, reason, targetKeysByAnnotation }));
    }
  });
  element.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !opened) return;
    event.preventDefault(); event.stopPropagation();
    closePanel();
  });
  async function execute(operation, successMessage = "Decisão salva.") {
    error = ""; message = "";
    try { const promise = operation(); render(); await promise; if (destroyed) return; message = successMessage; await refresh(); }
    catch (failure) { if (!destroyed) { recoveryExpired = failure.code === 'observation_recovery_expired'; error = publicErrorMessage(failure, "Não foi possível confirmar a decisão. A seleção permanece pendente."); render(); } }
  }
  element.addEventListener("submit", event => {
    if (!event.target.matches("[data-observation-composer]")) return;
    event.preventDefault(); if (queue.busy) return;
    if (!queue.pending && (error = validateStudyUnitObservationText(draft))) { render({ focusText: true }); return; }
    void (async () => {
      error = ""; message = "";
      const save = queue.save({ rawText: draft, category, editing, targets: selectedTargets }); render();
      try {
        await save; if (destroyed) return;
        draft = ""; category = null; editing = null; message = "Observação salva. Você pode adicionar outra."; await refresh();
      } catch (failure) {
        if (destroyed) return;
        error = queue.pending ? "Não foi possível confirmar o envio. Retome o mesmo pedido; seu texto foi preservado."
          : publicErrorMessage(failure, "A observação não foi salva. Seu rascunho foi preservado."); render({ focusText: true });
      }
    })();
  });
  render();
  return { element, queue, closePanel,
    hasPendingDraft: () => Boolean(queue.busy || queue.pending || draft && (!editing || draft !== editing.rawText)),
    async load() {
      try {
        await queue.restorePending(); if (destroyed) return;
        if (queue.pending) { draft = queue.pending.command.rawText || ''; category = queue.pending.command.category || null; opened = true; }
        if (typeof controller.loadCourseDocument === "function") {
          const loaded = await controller.loadCourseDocument(courseId, { verifiedRevision: expectedRevision });
          const targets = observationTargetCatalog(loaded?.document, courseId); if (targets.length) availableTargets = targets;
        }
        await refresh();
      } catch (failure) { if (!destroyed) { error = publicErrorMessage(failure, "Não foi possível recuperar a central de observações."); opened = true; render(); } }
    },
    destroy() { destroyed = true; ++readEpoch; }
  };
}
