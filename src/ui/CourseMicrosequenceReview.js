import { createUuid } from "../domain/identifiers.js";
import { normalizeCourseAuthoringExport } from "../domain/courseAuthoringComparison.js";
import { normalizeMicrosequenceExplanation } from "../domain/courseExplanation.js";
import { normalizeCourseContentReview, normalizeCourseContentReviewChange } from "../domain/courseContentReview.js";
import { explanationRenderingUnit, explanationReviewMessage } from "../study/studyExplanation.js";
import { placeStudyCitationMarkers, renderStudyCitations, renderStudySourceMarkers, studyCitationMarkers } from "../study/studyCitations.js";
import { openStudyResourceUrl } from "../study/studyTools.js";
import { buildSourceDocumentUrl } from "../study/sourceDocumentUrl.js";
import { listCourseSourceOccurrenceTargets, resolveCourseSourceOccurrences } from "../domain/courseSourceOccurrences.js";
import { renderPackageStudyUnitBlocks } from "../render/renderPackageStudyUnit.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { activateManualStudyUnitEdit, applyManualStudyUnitEdit, isAmbiguousManualStudyUnitWriteFailure,
  listManualStudyUnitEditablePaths, listManualStudyUnitTargetIds, readManualStudyUnitEditPathValues } from "./manualStudyUnitEdit.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { formatCourseSourceReference } from "../domain/courseSourceReference.js";
import { renderCourseAuthoringInspectionEvidence } from "./CourseAnalyticsPanel.js";
import { createAuthoringObservationQueue } from "./renderCourseAuthoringObservationQueue.js";

const clone = value => structuredClone(value);
const escape = value => String(value ?? "").replace(/[&<>"']/gu, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
function changed() {
  return Object.assign(new Error("O conteúdo ou suas fontes mudaram. Reinspecione a versão atual antes de declarar a revisão."), {
    code: "course_revision_changed", status: 409
  });
}
function readReview(controller, target) {
  return controller.getContentReview(target.courseId, target.targetKind, target.targetId)
    .then(value => normalizeCourseContentReview(value, target));
}

/** O recorte de contexto é cercado por leituras do objeto cuja revisão será declarada. */
export async function loadMicrosequenceReviewSnapshot(controller, { courseId, microsequenceId, expectedRevision,
  targetKind = "microsequence_explanation", targetId = microsequenceId }) {
  const target = { courseId, targetKind, targetId };
  if (targetKind === "microsequence_explanation" && targetId !== microsequenceId) throw new TypeError("Base fora da microssequência solicitada.");
  const before = await readReview(controller, target);
  if (before.courseRevision !== expectedRevision) throw changed();
  const selection = { courseId, expectedRevision, scope: { kind: "didactic_microsequence", ref: microsequenceId } };
  const exported = normalizeCourseAuthoringExport(await controller.exportCourseAuthoring(selection), { expectedSelection: selection });
  const provenance = exported.artifact.explanationSources.find(value => value.query.targetId === microsequenceId);
  const microsequenceVersion = targetKind === "microsequence_explanation" ? before.entityVersion : provenance?.items[0]?.targetVersion ??
    (await controller.getMicrosequenceForExplanation?.(courseId, microsequenceId, { expectedRevision }))?.version ?? null;
  const after = await readReview(controller, target);
  if (before.basisHash !== after.basisHash || after.courseRevision !== expectedRevision) throw changed();
  const candidates = exported.artifact.document.courses[0].modules.flatMap(module => module.lessons.flatMap(lesson =>
    lesson.microsequences.filter(ms => ms.id === microsequenceId).map(microsequence => ({ module, lesson, microsequence }))));
  if (candidates.length !== 1) throw new TypeError("O recorte não contém a microssequência solicitada.");
  const { module, lesson, microsequence } = candidates[0];
  const targetUnit = targetKind === "study_unit" ? microsequence.studyUnits.find(unit => unit.id === targetId) : null;
  if (targetKind === "study_unit" && !targetUnit) throw new TypeError("A unidade não pertence à microssequência inspecionada.");
  const sources = exported.artifact.explanationSources.find(value => value.query.targetId === microsequenceId);
  const references = await Promise.all(exported.analytics.basis.sources.map(async source => ({ sourceId: source.sourceRef,
    reference: await formatCourseSourceReference({ ...source.document, sourceId: source.sourceRef }, {
      style: sources?.bibliographyStyle || "abnt-2025"
    }) })));
  return { courseId, courseRevision: expectedRevision, microsequenceId, targetKind, targetId, targetUnit: clone(targetUnit), courseTitle: exported.course.title,
    moduleTitle: module.title, lessonTitle: lesson.title, microsequence: clone(microsequence),
    basisHash: after.basisHash, contentReview: after.contentReview,
    entityVersion: after.entityVersion, microsequenceVersion, reviewPolicy: after.reviewPolicy, references, analytics: clone(exported.analytics),
    sources: clone(exported.analytics.basis.sources), explanationSources: clone(sources?.items[0]?.sourceLinks || []),
    unitSources: clone(exported.analytics.basis.studyUnits.map(unit => ({ studyUnitId: unit.studyUnitRef, sourceLinks: unit.sourceLinks }))) };
}

/** A decisão incerta permanece com a mesma identidade no armazenamento da conta. */
export class CourseMicrosequenceReviewSession {
  constructor({ controller, courseId, microsequenceId, targetKind = "microsequence_explanation", targetId = microsequenceId,
    expectedRevision, uuid = createUuid }) {
    this.controller = controller; this.courseId = courseId; this.microsequenceId = microsequenceId;
    this.targetKind = targetKind; this.targetId = targetId;
    this.expectedRevision = expectedRevision; this.uuid = uuid; this.snapshot = null;
    this.pending = null; this.pendingEdit = null; this.busy = false; this.needsReinspection = false;
    this.key = `course.v2.pending-content-review:${courseId}:${targetKind}:${targetId}`;
  }
  async load() {
    this.pending = await this.controller.store?.getCache(this.key) || null;
    this.pendingEdit = this.targetKind === "microsequence_explanation"
      ? await this.controller.loadPendingMicrosequenceExplanationEdit?.(this.courseId, this.microsequenceId) || null : null;
    if (this.pending && (this.pending.courseId !== this.courseId || this.pending.targetKind !== this.targetKind ||
        this.pending.targetId !== this.targetId || typeof this.pending.reviewed !== "boolean" ||
        !/^[a-f0-9]{64}$/u.test(this.pending.expectedBasisHash || "") ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(this.pending.requestId || "")) ||
        this.pendingEdit && (this.pendingEdit.courseId !== this.courseId || this.pendingEdit.microsequenceId !== this.microsequenceId)) {
      throw new TypeError("O pedido local pendente não corresponde a este objeto.");
    }
    this.snapshot = await loadMicrosequenceReviewSnapshot(this.controller, {
      courseId: this.courseId, microsequenceId: this.microsequenceId, targetKind: this.targetKind,
      targetId: this.targetId, expectedRevision: this.expectedRevision
    });
    this.needsReinspection = false;
    return clone(this.snapshot);
  }
  async setReviewed({ reviewed = true, confirmed = false, hasPendingEdits = false } = {}) {
    if (this.busy || this.pendingEdit || hasPendingEdits || !this.snapshot && !this.pending ||
        !this.pending && (typeof reviewed !== "boolean" || reviewed && !confirmed)) {
      throw new Error("Salve ou descarte a edição e confirme explicitamente a revisão deste objeto.");
    }
    this.busy = true;
    try {
      if (!this.pending) {
        if (this.needsReinspection) throw changed();
        const current = await readReview(this.controller, this);
        if (current.basisHash !== this.snapshot.basisHash) throw changed();
        this.pending = { courseId: this.courseId, targetKind: this.targetKind, targetId: this.targetId,
          expectedBasisHash: this.snapshot.basisHash, reviewed, requestId: this.uuid() };
        await this.controller.store?.putCache(this.key, this.pending);
      }
      let receipt;
      try { receipt = normalizeCourseContentReviewChange(await this.controller.setContentReview(clone(this.pending)), this.pending); }
      catch (error) { if (error?.code === "invalid_course_content_review") error.ambiguous = true; throw error; }
      this.pending = null; await this.controller.store?.putCache(this.key, null);
      let current = null;
      try { current = await readReview(this.controller, this); }
      catch { /* O recibo confirma a decisão; não afirma que a base ainda é a corrente. */ }
      const stillCurrent = current?.basisHash === receipt.basisHash && current.contentReview.state === receipt.contentReview.state;
      this.needsReinspection = !stillCurrent;
      this.expectedRevision = current?.courseRevision || receipt.courseRevision;
      if (this.snapshot && stillCurrent) {
        this.snapshot.courseRevision = this.expectedRevision;
        this.snapshot.contentReview = clone(current.contentReview);
      }
      return { receipt: clone(receipt), current, stillCurrent };
    } catch (error) {
      if (!isAmbiguousManualStudyUnitWriteFailure(error)) {
        this.pending = null; await this.controller.store?.putCache(this.key, null);
      }
      throw error;
    } finally { this.busy = false; }
  }
  async saveExplanation(explanation) {
    if (this.targetKind !== "microsequence_explanation" || this.busy || this.pending || !this.snapshot && !this.pendingEdit || typeof this.controller.saveMicrosequenceExplanation !== "function") {
      throw new Error("A edição da explicação não está disponível neste momento.");
    }
    const normalized = normalizeMicrosequenceExplanation(explanation);
    if (this.pendingEdit && JSON.stringify(this.pendingEdit.explanation) !== JSON.stringify(normalized)) {
      throw new Error("Confirme o resultado da gravação pendente antes de alterar o rascunho.");
    }
    this.busy = true;
    try {
      if (!this.pendingEdit) {
        this.pendingEdit = { courseId: this.courseId, microsequenceId: this.microsequenceId,
          expectedRevision: this.snapshot.courseRevision, expectedEntityVersion: this.snapshot.microsequenceVersion,
          explanation: normalized, requestId: this.uuid() };
      }
      const result = await this.controller.saveMicrosequenceExplanation(clone(this.pendingEdit));
      if (result?.courseId !== this.courseId || !Number.isSafeInteger(result.revision)) {
        throw Object.assign(new Error("A confirmação da edição não corresponde ao curso."), { ambiguous: true });
      }
      this.pendingEdit = null;
      this.expectedRevision = result.revision;
      return { ...clone(result), courseRevision: result.revision };
    } catch (error) {
      if (!isAmbiguousManualStudyUnitWriteFailure(error)) {
        this.pendingEdit = null;
      }
      throw error;
    } finally { this.busy = false; }
  }
}

function editingFields(explanation) {
  const unit = explanationRenderingUnit(explanation);
  return ["study_unit", ...listManualStudyUnitTargetIds(unit)].flatMap(targetId =>
    listManualStudyUnitEditablePaths(unit, targetId).map(field => ({ ...field, targetId })));
}
export function applyExplanationTextFields(explanation, fields) {
  let unit = explanationRenderingUnit(explanation);
  for (const targetId of new Set(fields.map(field => field.targetId))) {
    unit = applyManualStudyUnitEdit(unit, targetId, { pathValues: Object.fromEntries(fields
      .filter(field => field.targetId === targetId).map(field => [field.path, field.value])) });
  }
  return normalizeMicrosequenceExplanation({ title: unit.title, content: unit.content });
}

export function createCourseMicrosequenceReview({ root, controller, onEditSources, onChanged = () => {},
  openSourceUrl = url => openStudyResourceUrl(url, root.ownerDocument) }) {
  let dialog = null; let session = null; let returnButton = null; let editing = false;
  let fields = []; let confirmed = false; let message = ""; let failure = false;
  let epoch = 0; let changedRevision = null;
  let componentsReady = false; let observationQueue = null;
  let inlineEditors = [];
  let focusEditing = false; let focusEditAction = false;
  function stopInlineEditors() { inlineEditors.forEach(editor => editor?.destroy()); inlineEditors = []; }
  const dirty = () => editing || Boolean(session?.pending || session?.pendingEdit || session?.busy || observationQueue?.hasPendingDraft());
  function status(value, error = false) { message = value; failure = error; }
  function close({ force = false } = {}) {
    if (!dialog) return true;
    if (!force && dirty()) { if (editing) captureFields(); status("Conclua ou cancele a edição; confirme o resultado de qualquer pedido pendente antes de sair.", true); render(); return false; }
    ++epoch; observationQueue?.destroy(); observationQueue = null; stopInlineEditors();
    dialog.close(); dialog.remove(); dialog = null;
    returnButton?.isConnected && returnButton.focus({ preventScroll: true });
    if (changedRevision) onChanged(changedRevision);
    return true;
  }
  function citationsFor(links, content) {
    const inventory = session.snapshot.sources;
    return { citations: links.map(link => {
      const record = inventory.find(value => value.sourceRef === (link.sourceId || link.sourceRef));
      return { ...(record?.document || { citationMode: "manual", citationText: "Fonte vinculada ainda não localizada nesta leitura." }),
        ...link, sourceId: link.sourceId || link.sourceRef, sourceRevision: record?.revision,
        attachments: record?.attachments || [],
        anchors: (link.anchors || []).map(({ anchorId }) => record?.anchors.find(value => value.anchorRef === anchorId)).filter(Boolean),
        occurrences: resolveCourseSourceOccurrences(content, link.occurrences || [], { targetKind: "microsequence_explanation" }) };
    }) };
  }
  function sourceLinks(links, content) {
    const value = citationsFor(links, content);
    const formattedReferences = Object.fromEntries(value.citations.map(citation => [citation.linkId,
      session.snapshot.references.find(item => item.sourceId === citation.sourceId)?.reference]));
    const options = { targetKind: "microsequence_explanation" };
    return renderStudySourceMarkers(studyCitationMarkers(content, value, options).filter(marker => !marker.target)) +
      renderStudyCitations({ open: true, value, courseId: session.snapshot.courseId,
        studyUnit: content, sourceOptions: options, formattedReferences,
        contextId: "explanation", heading: "Referências da explicação" });
  }
  function render() {
    if (!dialog) return;
    if (editing) captureFields();
    const active = dialog.contains(dialog.ownerDocument.activeElement) ? dialog.ownerDocument.activeElement : null;
    const manualPath = active?.dataset.manualEditPath;
    const manualTarget = active?.closest?.("[data-review-edit-target]")?.dataset.reviewEditTarget;
    const detailKey = node => {
      const summary = node.querySelector(":scope > summary");
      return summary?.getAttribute("aria-label") || summary?.textContent;
    };
    const openedDetails = [...dialog.querySelectorAll("details[open]")].map(detailKey);
    const focusAttribute = active && [...active.attributes].find(attribute =>
      attribute.name.startsWith("data-review-") || attribute.name === "data-inspection-edit-explanation-sources");
    const restoreFocus = () => {
      if (focusEditing) {
        focusEditing = false;
        (inlineEditors.flatMap(editor => editor?.fields || [])[0] || dialog.querySelector("[data-review-title]"))?.focus({ preventScroll: true }); return;
      }
      if (focusEditAction) { focusEditAction = false; dialog.querySelector("[data-review-edit]")?.focus({ preventScroll: true }); return; }
      if (active?.isConnected && observationQueue?.element.contains(active)) {
        active.focus({ preventScroll: true }); return;
      }
      if (dialog.contains(dialog.ownerDocument.activeElement) && dialog.ownerDocument.activeElement !== active) return;
      if (manualPath && manualTarget) {
        const container = [...dialog.querySelectorAll("[data-review-edit-target]")].find(node => node.dataset.reviewEditTarget === manualTarget);
        const field = [...(container?.querySelectorAll("[data-manual-edit-path]") || [])].find(node => node.dataset.manualEditPath === manualPath);
        if (field) { field.focus({ preventScroll: true }); return; }
      }
      const candidates = focusAttribute ? [...dialog.querySelectorAll(`[${focusAttribute.name}]`)] : [];
      const target = candidates.find(node => node.getAttribute(focusAttribute.name) === focusAttribute.value && !node.disabled);
      (target || dialog.querySelector("[data-review-close]"))?.focus({ preventScroll: true });
    };
    componentsReady = false;
    const snapshot = session?.snapshot; const busy = session?.busy;
    let content = message ? '<p>Não há recorte coerente disponível para uma nova decisão.</p>' : '<p role="status">Carregando o conteúdo e suas fontes para inspeção…</p>';
    if (!snapshot && session?.pending) content += `<button type="button" data-review-set${busy ? " disabled" : ""}>Confirmar resultado da mesma decisão</button>`;
    if (!snapshot && session?.pendingEdit) content += `<button type="button" data-review-save${busy ? " disabled" : ""}>Confirmar resultado da gravação</button>`;
    if (snapshot) {
      const ms = snapshot.microsequence; const explanation = ms.explanation;
      const baseTarget = snapshot.targetKind === "microsequence_explanation";
      const reviewLabel = baseTarget ? `Base explicativa · ${ms.title}` : `Unidade · ${snapshot.targetUnit.title}`;
      const hasSavedContent = baseTarget ? Boolean(ms.explanation) : Boolean(snapshot.targetUnit);
      const reviewState = session.pending ? "pending" : snapshot.contentReview.state;
      const reviewStateLabel = { current: "Revisão autoral atual", stale: "Revisão autoral desatualizada",
        pending: "Resultado da revisão ainda não confirmado" }[reviewState] || "Revisão autoral pendente";
      const reviewStateIcon = { current: "ready-state", stale: "rotate", pending: "cloud-alert" }[reviewState] || "draft-state";
      const reviewDeclaration = '<section class="course-review-context-body" aria-label="Revisão humana do conteúdo">' +
        `<div class="course-review-target-heading"><h3>${escape(reviewLabel)}</h3>` +
        `<span class="course-review-state" data-content-review-state="${escape(reviewState)}" role="img" aria-label="${reviewStateLabel}" title="${reviewStateLabel}">${renderUiIcon(reviewStateIcon, "course-authoring-button-icon")}</span></div>` +
        (hasSavedContent ? `<label title="A marca registra sua declaração de revisão do conteúdo salvo e de suas fontes."><input type="checkbox" data-review-confirm${confirmed ? " checked" : ""} disabled> Revisei esta versão e suas fontes.</label>` : '<p>Salve a base explicativa antes de declarar sua revisão.</p>') +
        (hasSavedContent || session.pending ? `<button type="button" data-review-set aria-label="${session.pending ? "Confirmar resultado da mesma decisão" : "Marcar como revisado"}" title="${session.pending ? "Confirmar resultado da mesma decisão" : "Marcar como revisado"}" disabled>${renderUiIcon(session.pending ? "rotate" : "ready-state", "course-authoring-button-icon")}</button>` : '') +
        (["current", "stale"].includes(snapshot.contentReview.state) && !session.pending
          ? `<button type="button" data-review-withdraw aria-label="Retirar marca de revisão" title="Retirar marca de revisão" disabled>${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` : '') + '</section>';
      content = !baseTarget
        ? '<section class="course-review-unit-declaration">' + reviewDeclaration + '</section>'
        : '<section class="course-review-authoring-context" aria-label="Contexto autoral">' +
        `<p class="course-review-authoring-path">${escape(snapshot.moduleTitle)} › ${escape(snapshot.lessonTitle)} › ${escape(ms.title)}</p>` +
        `<details><summary data-review-context="metadata" aria-label="Contexto autoral" title="Contexto autoral">${renderUiIcon("intent", "course-authoring-button-icon")}</summary>` +
        '<dl class="course-review-authoring-state">' +
        `<div><dt>Versão do curso</dt><dd>${snapshot.courseRevision}</dd></div>` +
        `<div><dt>Revisão autoral</dt><dd>${escape(explanationReviewMessage(snapshot.contentReview))}</dd></div></dl>` +
        `<h4>Objetivo e proposta da microssequência</h4><p>${escape(ms.goal)}</p>` +
        (ms.explanationPlan ? `<p>Propósito: ${escape(ms.explanationPlan.purpose)}</p>` +
          [["Pressupostos", ms.explanationPlan.prerequisites], ["Relações", ms.explanationPlan.relations],
            ["Fontes previstas", ms.explanationPlan.sourceIds.map(id => snapshot.sources.find(value => value.sourceRef === id)?.document.title || id)]]
            .map(([label, values]) => `<h4>${label}</h4>` + (values.length ? '<ul>' + values.map(value => `<li>${escape(value)}</li>`).join("") + '</ul>' : '<p>Nenhum registro.</p>')).join("")
          : '<p>Proposta da explicação não registrada.</p>') + '</details></section>' +
        '<section aria-label="Base explicativa" class="course-explanation-context">' +
        '<div class="course-explanation-tools"><nav class="course-explanation-actions" aria-label="Ações da explicação">' +
        (explanation ? `<button type="button" data-inspection-edit-explanation-sources data-microsequence-id="${escape(snapshot.microsequenceId)}" aria-label="Fontes da explicação" title="Fontes da explicação"${busy || editing || session.pending || session.pendingEdit ? " disabled" : ""}>${renderUiIcon("study", "course-authoring-button-icon")}</button>` : "") +
        (explanation && typeof controller.saveMicrosequenceExplanation === "function" && !editing
          ? `<button type="button" data-review-edit aria-label="Editar explicação" title="Editar explicação"${busy || session.pending ? " disabled" : ""}>${renderUiIcon("edit", "course-authoring-button-icon")}</button>` : "") +
        (editing ? `<button type="button" data-review-save aria-label="${session.pendingEdit ? "Confirmar resultado da gravação" : "Salvar explicação"}" title="${session.pendingEdit ? "Confirmar resultado da gravação" : "Salvar explicação"}"${busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
          `<button type="button" data-review-cancel-edit aria-label="Cancelar edição" title="Cancelar edição"${busy || session.pendingEdit ? " disabled" : ""}>${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` : '') + '</nav>' +
        '<div data-review-observation-queue></div></div>' +
        (explanation ? renderExplanation(explanation, { editable: editing, busy })
          : '<p>Esta microssequência ainda não tem explicação.</p>') + sourceLinks(snapshot.explanationSources, explanation) +
        '</section>' +
        '<section class="course-review-authoring-tools" aria-label="Contexto e revisão"><h3>Contexto e revisão</h3><div class="course-review-authoring-panels">' +
        renderCourseAuthoringInspectionEvidence(snapshot.analytics, { compact: true }) +
        `<details class="course-review-context-panel"${session.pending ? ' open' : ''}><summary data-review-context="review" data-content-review-state="${escape(reviewState)}" aria-label="Revisão autoral do conteúdo" title="${reviewStateLabel}">${renderUiIcon(reviewStateIcon, "course-authoring-button-icon")}</summary>` +
        reviewDeclaration + '</details></div></section>';
    }
    const scroll = dialog.querySelector(".editor-body")?.scrollTop || 0;
    stopInlineEditors();
    dialog.innerHTML = `<header class="editor-head"><h2>${snapshot?.targetKind === "study_unit" ? "Revisão da unidade" : "Explicação"}</h2><button type="button" data-review-close aria-label="Fechar inspeção ${snapshot?.targetKind === "study_unit" ? "da unidade" : "da explicação"}" title="Fechar">${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></header>` +
      `<div class="editor-body"><p role="${failure ? "alert" : "status"}" data-review-status>${escape(message)}</p>${content}</div>`;
    const queueHost = dialog.querySelector("[data-review-observation-queue]");
    if (queueHost && snapshot && typeof controller.loadCourseAnchoredAnnotations === "function") {
      if (!observationQueue) {
        observationQueue = createAuthoringObservationQueue({ document: dialog.ownerDocument, controller,
          courseId: snapshot.courseId, targetKind: snapshot.targetKind, targetId: snapshot.targetId,
          expectedRevision: snapshot.courseRevision, label: snapshot.targetKind === "microsequence_explanation"
            ? `explicação · ${snapshot.microsequence.title}` : snapshot.targetUnit.title });
        void observationQueue.load();
      }
      observationQueue.queue.expectedRevision = snapshot.courseRevision;
      queueHost.append(observationQueue.element);
    }
    dialog.querySelector(".editor-body").scrollTop = scroll;
    dialog.querySelectorAll("details").forEach(node => {
      if (openedDetails.includes(detailKey(node))) node.open = true;
    });
    dialog.querySelectorAll('.package-instance[data-package^="aralearn.response."], .card-answer-dock').forEach(container => {
      container.querySelectorAll("button, input, select, textarea, [contenteditable]").forEach(control => {
        if ("disabled" in control) control.disabled = true;
        control.setAttribute("tabindex", "-1"); control.removeAttribute("contenteditable");
      });
    });
    const current = ++epoch;
    void RESOURCE_PACKAGE_REGISTRY.hydrate(dialog).then(() => {
      if (!dialog || current !== epoch) return;
      componentsReady = true;
      const explanation = snapshot?.microsequence.explanation;
      const explanationHost = dialog.querySelector(".course-explanation-context");
      if (explanation && explanationHost) placeStudyCitationMarkers(explanationHost, explanation,
        citationsFor(snapshot.explanationSources, explanation), { targetKind: "microsequence_explanation" });
      if (editing) explanationHost?.querySelectorAll("[data-action='open-citation']").forEach(node => { node.disabled = true; });
      if (editing) {
        const original = editingFields(snapshot.microsequence.explanation);
        inlineEditors = [...dialog.querySelectorAll("[data-review-edit-target]")].map(container => {
          const targetId = container.dataset.reviewEditTarget;
          const pathValues = Object.fromEntries(fields.filter(field => field.targetId === targetId &&
            field.value !== original.find(value => value.targetId === targetId && value.path === field.path)?.value)
            .map(field => [field.path, field.value]));
          const editor = activateManualStudyUnitEdit(container, { pathValues });
          if (busy || session.pendingEdit) container.setAttribute("inert", "");
          return editor;
        });
      }
      const confirm = dialog.querySelector("[data-review-confirm]");
      if (confirm) confirm.disabled = Boolean(busy || editing || session.pending || session.pendingEdit || session.needsReinspection || snapshot?.contentReview.state === "current");
      const review = dialog.querySelector("[data-review-set]");
      if (review) review.disabled = Boolean(busy || editing || session.pendingEdit || !session.pending &&
        (!confirmed || session.needsReinspection || snapshot?.contentReview.state === "current"));
      const withdraw = dialog.querySelector("[data-review-withdraw]");
      if (withdraw) withdraw.disabled = Boolean(busy || editing || session.pendingEdit || session.pending || session.needsReinspection);
      restoreFocus();
    }).catch(() => {
      if (!dialog || current !== epoch) return;
      status("Um componente não pôde ser preparado. Reabra para inspecionar antes de declarar a revisão.", true);
      const live = dialog.querySelector("[data-review-status]"); live.textContent = message; live.setAttribute("role", "alert");
    });
  }
  function captureFields() {
    const title = dialog.querySelector("[data-review-title]");
    if (title?.isContentEditable) {
      const field = fields.find(value => value.targetId === "study_unit" && value.path === "title");
      if (field) field.value = title.textContent;
    }
    dialog.querySelectorAll("[data-review-edit-target]").forEach(container => {
      const values = readManualStudyUnitEditPathValues(container);
      fields.filter(field => field.targetId === container.dataset.reviewEditTarget && Object.hasOwn(values, field.path))
        .forEach(field => { field.value = values[field.path]; });
    });
  }
  function renderExplanation(explanation, { editable, busy }) {
    const unit = explanationRenderingUnit(explanation);
    const title = editable ? fields.find(field => field.targetId === "study_unit" && field.path === "title")?.value ?? explanation.title : explanation.title;
    return '<div class="course-explanation-inline" data-review-explanation-content>' +
      `<h3 data-review-title${editable ? ` contenteditable="${busy || session.pendingEdit ? "false" : "plaintext-only"}" role="textbox" aria-label="Título da explicação"` : ''}>${escape(title)}</h3>` +
      unit.content.map(instance => {
        const targetId = `content:${instance.id}`;
        return `<div class="course-explanation-component${editable ? ' is-editing' : ''}" data-review-edit-target="${escape(targetId)}">` +
          renderPackageStudyUnitBlocks({ ...unit, content: [instance] }, { revealPracticeAnswers: true,
            sourceTextTargets: listCourseSourceOccurrenceTargets(explanation, { targetKind: "microsequence_explanation" }),
            blockKeyPrefix: "review-explanation", manualEditingTargetId: editable ? targetId : "" }) + '</div>';
      }).join('') + '</div>';
  }
  async function click(event) {
    if (event.target.closest("[data-review-close]")) return close();
    if (!session || session.busy) return;
    const clickedSession = session; const clickedDialog = dialog;
    const stillOpen = () => session === clickedSession && dialog === clickedDialog;
    const citationAction = event.target.closest("[data-action='open-citation'], [data-action='return-citation'], [data-action='download-citation-attachment']");
    if (citationAction) {
      event.preventDefault();
      if (editing || citationAction.getAttribute("aria-disabled") === "true") return;
      const container = citationAction.closest(".course-explanation-context");
      if (!container) return;
      if (citationAction.dataset.action === "open-citation" || citationAction.dataset.action === "return-citation") {
        const backwards = citationAction.dataset.action === "return-citation";
        const targets = [...container.querySelectorAll(backwards ? "[data-action='open-citation']" : "[data-citation-reference-id]")];
        const target = targets.find(node => backwards ? node.dataset.citationLinkId === citationAction.dataset.citationLinkId &&
          node.dataset.citationOccurrenceId === citationAction.dataset.citationOccurrenceId : node.dataset.citationReferenceId === citationAction.dataset.citationLinkId);
        target?.scrollIntoView({ block: "nearest" }); target?.focus({ preventScroll: true }); return;
      }
      const snapshot = session.snapshot;
      const citation = citationsFor(snapshot.explanationSources, snapshot.microsequence.explanation)
        .citations[Number(citationAction.dataset.citationIndex)];
      const attachment = citation?.attachments[Number(citationAction.dataset.attachmentIndex)];
      if (!attachment || typeof controller.getCourseSourceAttachmentDownload !== "function") return;
      citationAction.disabled = true;
      citationAction.setAttribute("aria-disabled", "true");
      try {
        const result = await controller.getCourseSourceAttachmentDownload({ courseId: snapshot.courseId,
          expectedCourseRevision: snapshot.courseRevision, sourceId: citation.sourceId,
          sourceRevision: citation.sourceRevision, contentHash: attachment.contentHash });
        if (!stillOpen() || session.snapshot !== snapshot) return;
        const rawAnchorIndex = citationAction.dataset.citationAnchorIndex;
        const anchorIndex = typeof rawAnchorIndex === "string" && /^\d+$/u.test(rawAnchorIndex) ? Number(rawAnchorIndex) : null;
        const anchor = Number.isSafeInteger(anchorIndex) ? citation.anchors[anchorIndex] ?? null : null;
        openSourceUrl(buildSourceDocumentUrl(result.signedUrl, { attachment, anchor }), attachment);
      } catch (error) {
        if (!stillOpen()) return;
        status(publicErrorMessage(error, "Não foi possível abrir este PDF. A referência foi preservada."), true);
        const live = dialog.querySelector("[data-review-status]"); live.textContent = message; live.setAttribute("role", "alert");
      } finally { if (stillOpen() && citationAction.isConnected) { citationAction.disabled = false; citationAction.removeAttribute("aria-disabled"); } }
      return;
    }
    if (event.target.closest("[data-review-edit]")) {
      editing = true; confirmed = false; focusEditing = true;
      fields = editingFields(session.pendingEdit?.explanation || session.snapshot.microsequence.explanation); render(); return;
    }
    if (event.target.closest("[data-review-cancel-edit]")) {
      const original = editingFields(session.snapshot.microsequence.explanation);
      const changed = fields.some(field => field.value !== original.find(value => value.targetId === field.targetId && value.path === field.path)?.value);
      editing = false; fields = []; focusEditAction = true;
      if (changed) status("Edição cancelada; o conteúdo salvo foi preservado."); render(); return;
    }
    if (event.target.closest("[data-review-save]")) {
      captureFields();
      try {
        const value = session.pendingEdit?.explanation || applyExplanationTextFields(session.snapshot.microsequence.explanation, fields);
        if (!session.pendingEdit && JSON.stringify(value) === JSON.stringify(session.snapshot.microsequence.explanation)) {
          editing = false; fields = []; focusEditAction = true; render(); return;
        }
        const pending = session.saveExplanation(value); render();
        const result = await pending; if (!stillOpen()) return;
        changedRevision = result.courseRevision;
        editing = false; confirmed = false; fields = []; focusEditAction = true;
        await clickedSession.load(); if (!stillOpen()) return;
        status("Explicação salva. O salvamento não declara revisão autoral.");
      } catch (error) { if (!stillOpen()) return; status(session.pendingEdit ? "Não foi possível confirmar a gravação. Confirme o resultado do mesmo pedido; seu texto foi preservado." : publicErrorMessage(error, "A edição não foi salva. Seu rascunho foi preservado."), true); }
      render(); return;
    }
    if (event.target.closest("[data-inspection-edit-explanation-sources]")) {
      const snapshot = session.snapshot;
      const target = { mode: "target", targetKind: "microsequence_explanation", targetId: snapshot.microsequenceId,
        targetVersion: snapshot.microsequenceVersion, targetLabel: `explicação · ${snapshot.microsequence.title}`,
        targetExplanation: clone(snapshot.microsequence.explanation) };
      if (close()) onEditSources(target); return;
    }
    if (event.target.closest("[data-review-set], [data-review-withdraw]")) {
      if (!componentsReady && !session.pending) return;
      try {
        const pending = session.setReviewed({ reviewed: !event.target.closest("[data-review-withdraw]"), confirmed, hasPendingEdits: editing }); render();
        const result = await pending; if (!stillOpen()) return;
        changedRevision = result.receipt.courseRevision; confirmed = false;
        if (result.current && session.snapshot) session.snapshot.contentReview = result.current.contentReview;
        status(result.stillCurrent ? result.receipt.contentReview.state === "current"
          ? "Revisão declarada para este objeto nesta versão." : "Marca de revisão retirada deste objeto." : result.current
          ? "A decisão foi registrada, mas o conteúdo mudou depois. Reinspecione a versão atual."
          : "A decisão foi registrada. Não foi possível conferir o estado atual; atualize antes de outra decisão.", !result.stillCurrent);
      } catch (error) { if (!stillOpen()) return; status(session.pending ? "Não foi possível confirmar a revisão. Consulte o resultado da mesma decisão; nenhum novo pedido será criado." : publicErrorMessage(error, "A revisão não foi alterada."), true); }
      render();
    }
  }
  return { hasPendingDraft: dirty, close,
    async open({ courseId, microsequenceId, targetKind = "microsequence_explanation", targetId = microsequenceId, expectedRevision, button = null }) {
      if (dialog && !close()) return false;
      session = new CourseMicrosequenceReviewSession({ controller, courseId, microsequenceId, targetKind, targetId, expectedRevision });
      editing = false; fields = []; confirmed = false; message = ""; failure = false; changedRevision = null;
      focusEditing = false; focusEditAction = false;
      returnButton = button;
      dialog = root.ownerDocument.createElement("dialog");
      dialog.className = "editor-sheet course-microsequence-review" + (targetKind === "study_unit" ? " is-unit-review" : "");
      dialog.setAttribute("aria-label", targetKind === "study_unit" ? "Revisão da unidade de estudo" : "Explicação e revisão do conteúdo"); root.ownerDocument.body.append(dialog);
      dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
      dialog.addEventListener("click", event => void click(event));
      dialog.addEventListener("change", event => { if (event.target.matches("[data-review-confirm]")) { confirmed = event.target.checked; render(); } });
      dialog.addEventListener("input", event => { if (event.target.closest("[data-review-explanation-content]")) captureFields(); });
      render(); dialog.showModal();
      const openingSession = session; const openingDialog = dialog;
      try { await openingSession.load(); if (dialog === openingDialog && session === openingSession) { if (session.pendingEdit) { editing = true; fields = editingFields(session.pendingEdit.explanation); } render(); } }
      catch (error) { if (dialog === openingDialog && session === openingSession) { status(publicErrorMessage(error, "Não foi possível carregar um recorte coerente para inspeção."), true); render(); } }
      return true;
    }, destroy() { close({ force: true }); }
  };
}
