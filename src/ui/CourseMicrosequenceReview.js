import { createUuid } from "../domain/identifiers.js";
import { normalizeCourseAuthoringExport } from "../domain/courseAuthoringComparison.js";
import { normalizeMicrosequenceExplanation } from "../domain/courseExplanation.js";
import { normalizeCourseContentReview, normalizeCourseContentReviewChange } from "../domain/courseContentReview.js";
import { explanationRenderingUnit, explanationReviewMessage } from "../study/studyExplanation.js";
import { placeStudyCitationMarkers, renderStudyCitations, renderStudySourceMarkers, studyCitationMarkers } from "../study/studyCitations.js";
import { openStudyResourceUrl } from "../study/studyTools.js";
import { listCourseSourceOccurrenceTargets, resolveCourseSourceOccurrences } from "../domain/courseSourceOccurrences.js";
import { renderPackageStudyUnitBlocks } from "../render/renderPackageStudyUnit.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { activateManualStudyUnitEdit, applyManualStudyUnitEdit, isAmbiguousManualStudyUnitWriteFailure,
  listManualStudyUnitEditablePaths, listManualStudyUnitTargetIds, readManualStudyUnitEditPathValues } from "./manualStudyUnitEdit.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { bindCourseAuthoringDebate, renderCourseAuthoringDebate } from "./courseAuthoringDebate.js";
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
      throw new Error("A edição da Explicação não está disponível neste momento.");
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
  onFeedback = () => {}, navigatorValue = globalThis.navigator, locationValue = globalThis.location,
  openSourceUrl = url => openStudyResourceUrl(url, root.ownerDocument) }) {
  let dialog = null; let session = null; let returnButton = null; let editing = false;
  let fields = []; let confirmed = false; let message = ""; let failure = false;
  let epoch = 0; let changedRevision = null; let debate = null;
  let componentsReady = false; let observationQueue = null;
  let inlineEditors = [];
  let focusEditing = false; let focusEditAction = false;
  function stopInlineEditors() { inlineEditors.forEach(editor => editor?.destroy()); inlineEditors = []; }
  const dirty = () => editing || Boolean(session?.pending || session?.pendingEdit || session?.busy || observationQueue?.hasPendingDraft());
  function status(value, error = false) { message = value; failure = error; }
  function close({ force = false } = {}) {
    if (!dialog) return true;
    if (!force && dirty()) { if (editing) captureFields(); status("Conclua ou cancele a edição; confirme o resultado de qualquer pedido pendente antes de sair.", true); render(); return false; }
    ++epoch; debate?.destroy(); debate = null; observationQueue?.destroy(); observationQueue = null; stopInlineEditors();
    dialog.close(); dialog.remove(); dialog = null;
    returnButton?.isConnected && returnButton.focus({ preventScroll: true });
    if (changedRevision) onChanged(changedRevision);
    return true;
  }
  function citationsFor(links, content, base) {
    const inventory = session.snapshot.sources;
    return { citations: links.map(link => {
      const record = inventory.find(value => value.sourceRef === (link.sourceId || link.sourceRef));
      return { ...(record?.document || { citationMode: "manual", citationText: "Fonte vinculada ainda não localizada nesta leitura." }),
        ...link, sourceId: link.sourceId || link.sourceRef, sourceRevision: record?.revision,
        attachments: record?.attachments || [],
        anchors: (link.anchors || []).map(({ anchorId }) => record?.anchors.find(value => value.anchorRef === anchorId)).filter(Boolean),
        occurrences: resolveCourseSourceOccurrences(content, link.occurrences || [], base ? { targetKind: "microsequence_explanation" } : {}) };
    }) };
  }
  function sourceLinks(links, content, base) {
    const value = citationsFor(links, content, base);
    const formattedReferences = Object.fromEntries(value.citations.map(citation => [citation.linkId,
      session.snapshot.references.find(item => item.sourceId === citation.sourceId)?.reference]));
    const options = base ? { targetKind: "microsequence_explanation" } : {};
    return renderStudySourceMarkers(studyCitationMarkers(content, value, options).filter(marker => !marker.target)) +
      renderStudyCitations({ open: true, value, courseId: session.snapshot.courseId,
        studyUnit: content, sourceOptions: options, formattedReferences,
        contextId: base ? "explanation" : "unit", heading: base ? "Referências da Explicação" : "Referências desta unidade" });
  }
  function render() {
    if (!dialog) return;
    if (editing) captureFields();
    const active = dialog.contains(dialog.ownerDocument.activeElement) ? dialog.ownerDocument.activeElement : null;
    const manualPath = active?.dataset.manualEditPath;
    const manualTarget = active?.closest?.("[data-review-edit-target]")?.dataset.reviewEditTarget;
    const openedDetails = [...dialog.querySelectorAll("details[open]")].map(node => node.querySelector(":scope > summary")?.textContent);
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
      const units = baseTarget ? ms.studyUnits : [snapshot.targetUnit];
      const hasSavedContent = baseTarget ? Boolean(ms.explanation) : Boolean(snapshot.targetUnit);
      const route = buildCourseAuthoringRoute(snapshot.courseId, { section: "content", didacticMicrosequenceId: snapshot.microsequenceId });
      content = `<p>${escape(snapshot.moduleTitle)} › ${escape(snapshot.lessonTitle)} › ${escape(ms.title)}</p>` +
        `<p>Revisão ${snapshot.courseRevision}. ${escape(explanationReviewMessage(snapshot.contentReview))}</p>` +
        `<details><summary>Objetivo e proposta da microssequência</summary><p>${escape(ms.goal)}</p>` +
        (ms.explanationPlan ? `<p>Propósito: ${escape(ms.explanationPlan.purpose)}</p>` +
          [["Pressupostos", ms.explanationPlan.prerequisites], ["Relações", ms.explanationPlan.relations],
            ["Fontes previstas", ms.explanationPlan.sourceIds.map(id => snapshot.sources.find(value => value.sourceRef === id)?.document.title || id)]]
            .map(([label, values]) => `<h4>${label}</h4>` + (values.length ? '<ul>' + values.map(value => `<li>${escape(value)}</li>`).join("") + '</ul>' : '<p>Nenhum registro.</p>')).join("")
          : '<p>Proposta da Explicação não registrada.</p>') + '</details>' +
        (!baseTarget ? '<details><summary>Base explicativa usada como apoio à inspeção</summary>' : '') +
        '<section aria-label="Base explicativa" class="course-explanation-context">' +
        (explanation ? renderExplanation(explanation, { editable: baseTarget && editing, busy })
          : '<p>Esta microssequência ainda não tem Explicação.</p>') + sourceLinks(snapshot.explanationSources, explanation, true) +
        '<nav class="course-explanation-actions" aria-label="Ações da Explicação">' +
        (explanation ? `<button type="button" data-inspection-edit-explanation-sources data-microsequence-id="${escape(snapshot.microsequenceId)}" aria-label="Fontes da Explicação" title="Fontes da Explicação"${busy || editing || session.pending || session.pendingEdit ? " disabled" : ""}>${renderUiIcon("study", "course-authoring-button-icon")}</button>` : "") +
        (baseTarget && explanation && typeof controller.saveMicrosequenceExplanation === "function" && !editing
          ? `<button type="button" data-review-edit aria-label="Editar Explicação" title="Editar Explicação"${busy || session.pending ? " disabled" : ""}>${renderUiIcon("edit", "course-authoring-button-icon")}</button>` : "") +
        (editing ? `<button type="button" data-review-save aria-label="${session.pendingEdit ? "Confirmar resultado da gravação" : "Salvar Explicação"}" title="${session.pendingEdit ? "Confirmar resultado da gravação" : "Salvar Explicação"}"${busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
          `<button type="button" data-review-cancel-edit aria-label="Cancelar edição" title="Cancelar edição"${busy || session.pendingEdit ? " disabled" : ""}>${renderUiIcon("remove-state", "course-authoring-button-icon")}</button>` : '') + '</nav>' +
        (baseTarget ? '<div data-review-observation-queue></div>' : '') + '</section>' + (!baseTarget ? '</details>' : '') +
        `<section aria-label="${baseTarget ? 'Unidades desta microssequência para contexto' : 'Unidade em revisão'}"><h3>${baseTarget ? `Unidades (${units.length}) · contexto` : 'Unidade em revisão'}</h3>` + units.map((unit, index) =>
          `<article data-review-unit-context="${escape(unit.id)}"><h4>${index + 1}. ${escape(unit.title)} · ${unit.role === "practice" ? "Prática" : "Teoria"}</h4>` +
          renderPackageStudyUnitBlocks(unit, { revealPracticeAnswers: true, sourceTextTargets: listCourseSourceOccurrenceTargets(unit) }) +
          (!baseTarget ? '<div data-review-observation-queue></div>' : '') +
          sourceLinks(snapshot.unitSources.find(value => value.studyUnitId === unit.id)?.sourceLinks || [], unit, false) +
          (typeof controller.loadAuthoringStudyUnits === "function" ? `<button type="button" data-review-unit-sources="${escape(unit.id)}"${busy || editing || session.pending || session.pendingEdit ? " disabled" : ""}>Fontes de ${escape(unit.title)}</button>` : "") + '</article>').join("") + '</section>' +
        renderCourseAuthoringInspectionEvidence(snapshot.analytics) +
        renderCourseAuthoringDebate({ courseId: snapshot.courseId, courseRevision: snapshot.courseRevision, title: snapshot.courseTitle,
          route, contextLabel: reviewLabel }) +
        '<section aria-label="Revisão humana do conteúdo"><h3>Revisão humana do conteúdo</h3>' +
        `<p><strong>${escape(reviewLabel)}</strong> · conteúdo salvo e vínculos de fontes.</p>` +
        '<p>Esta declaração registra uma inspeção, sem atestar correção ou eficácia.</p>' +
        (hasSavedContent ? `<label><input type="checkbox" data-review-confirm${confirmed ? " checked" : ""} disabled> Inspecionei este objeto e suas fontes nesta versão salva.</label>` : '<p>Salve a base explicativa antes de declarar sua revisão.</p>') +
        (hasSavedContent || session.pending ? `<button type="button" data-review-set disabled>${session.pending ? "Confirmar resultado da mesma decisão" : "Marcar como revisado"}</button>` : '') +
        (["current", "stale"].includes(snapshot.contentReview.state) && !session.pending
          ? '<button type="button" data-review-withdraw disabled>Retirar marca de revisão</button>' : '') + '</section>';
    }
    const scroll = dialog.querySelector(".editor-body")?.scrollTop || 0;
    stopInlineEditors();
    dialog.innerHTML = `<header class="editor-head"><h2>${snapshot?.targetKind === "study_unit" ? "Unidade de estudo" : "Explicação"}</h2><button type="button" data-review-close aria-label="Fechar inspeção ${snapshot?.targetKind === "study_unit" ? "da unidade" : "da Explicação"}" title="Fechar">${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></header>` +
      `<div class="editor-body"><p role="${failure ? "alert" : "status"}" data-review-status>${escape(message)}</p>${content}</div>`;
    const queueHost = dialog.querySelector("[data-review-observation-queue]");
    if (queueHost && snapshot && typeof controller.loadCourseAnchoredAnnotations === "function") {
      if (!observationQueue) {
        observationQueue = createAuthoringObservationQueue({ document: dialog.ownerDocument, controller,
          courseId: snapshot.courseId, targetKind: snapshot.targetKind, targetId: snapshot.targetId,
          expectedRevision: snapshot.courseRevision, label: snapshot.targetKind === "microsequence_explanation"
            ? `Explicação · ${snapshot.microsequence.title}` : snapshot.targetUnit.title });
        void observationQueue.load();
      }
      observationQueue.queue.expectedRevision = snapshot.courseRevision;
      queueHost.append(observationQueue.element);
    }
    dialog.querySelector(".editor-body").scrollTop = scroll;
    dialog.querySelectorAll("details").forEach(node => {
      if (openedDetails.includes(node.querySelector(":scope > summary")?.textContent)) node.open = true;
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
        citationsFor(snapshot.explanationSources, explanation, true), { targetKind: "microsequence_explanation" });
      if (editing) explanationHost?.querySelectorAll("[data-action='open-citation']").forEach(node => { node.disabled = true; });
      dialog.querySelectorAll("[data-review-unit-context]").forEach(container => {
        const unit = snapshot.microsequence.studyUnits.find(item => item.id === container.dataset.reviewUnitContext);
        const links = snapshot.unitSources.find(item => item.studyUnitId === unit.id)?.sourceLinks || [];
        placeStudyCitationMarkers(container, unit, citationsFor(links, unit, false));
      });
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
      `<h3 data-review-title${editable ? ` contenteditable="${busy || session.pendingEdit ? "false" : "plaintext-only"}" role="textbox" aria-label="Título da Explicação"` : ''}>${escape(title)}</h3>` +
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
      if (editing) return;
      const container = citationAction.closest(".course-explanation-context, [data-review-unit-context]");
      if (!container) return;
      if (citationAction.dataset.action === "open-citation" || citationAction.dataset.action === "return-citation") {
        const backwards = citationAction.dataset.action === "return-citation";
        const targets = [...container.querySelectorAll(backwards ? "[data-action='open-citation']" : "[data-citation-reference-id]")];
        const target = targets.find(node => backwards ? node.dataset.citationLinkId === citationAction.dataset.citationLinkId &&
          node.dataset.citationOccurrenceId === citationAction.dataset.citationOccurrenceId : node.dataset.citationReferenceId === citationAction.dataset.citationLinkId);
        target?.scrollIntoView({ block: "nearest" }); target?.focus({ preventScroll: true }); return;
      }
      const snapshot = session.snapshot; const base = container.classList.contains("course-explanation-context");
      const unit = base ? snapshot.microsequence.explanation : snapshot.microsequence.studyUnits.find(item => item.id === container.dataset.reviewUnitContext);
      const links = base ? snapshot.explanationSources : snapshot.unitSources.find(item => item.studyUnitId === unit.id)?.sourceLinks || [];
      const citation = citationsFor(links, unit, base).citations[Number(citationAction.dataset.citationIndex)];
      const attachment = citation?.attachments[Number(citationAction.dataset.attachmentIndex)];
      if (!attachment || typeof controller.getCourseSourceAttachmentDownload !== "function") return;
      citationAction.disabled = true;
      try {
        const result = await controller.getCourseSourceAttachmentDownload({ courseId: snapshot.courseId,
          expectedCourseRevision: snapshot.courseRevision, sourceId: citation.sourceId,
          sourceRevision: citation.sourceRevision, contentHash: attachment.contentHash });
        if (!stillOpen() || session.snapshot !== snapshot) return;
        const url = new URL(result.signedUrl);
        if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "10.0.2.2"].includes(url.hostname)) || url.username || url.password) throw new TypeError("Endereço do PDF inválido.");
        const page = Number(citationAction.dataset.citationPage);
        if (Number.isSafeInteger(page) && page > 0 && page <= 1_000_000) url.hash = `page=${page}`;
        openSourceUrl(url.href, attachment);
      } catch (error) {
        if (!stillOpen()) return;
        status(publicErrorMessage(error, "Não foi possível abrir este PDF. A referência foi preservada."), true);
        const live = dialog.querySelector("[data-review-status]"); live.textContent = message; live.setAttribute("role", "alert");
      } finally { if (stillOpen() && citationAction.isConnected) citationAction.disabled = false; }
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
        targetVersion: snapshot.microsequenceVersion, targetLabel: `Explicação · ${snapshot.microsequence.title}`,
        targetExplanation: clone(snapshot.microsequence.explanation) };
      if (close()) onEditSources(target); return;
    }
    const unitSources = event.target.closest("[data-review-unit-sources]");
    if (unitSources) {
      try {
        const snapshot = session.snapshot; const id = unitSources.dataset.reviewUnitSources;
        const page = await controller.loadAuthoringStudyUnits(snapshot.courseId, { expectedRevision: snapshot.courseRevision,
          scope: { kind: "didactic_microsequence", id: snapshot.microsequenceId }, anchorStudyUnitId: id, limit: 1 });
        if (!stillOpen()) return;
        const item = page.items.find(value => value.studyUnit.id === id);
        if (page.courseRevision !== snapshot.courseRevision || page.stale || page.offline || !item ||
            JSON.stringify(item.studyUnit) !== JSON.stringify(snapshot.microsequence.studyUnits.find(value => value.id === id))) throw changed();
        if (close()) onEditSources({ targetKind: "study_unit", targetId: id, targetVersion: item.version,
          targetLabel: item.studyUnit.title, targetStudyUnit: clone(item.studyUnit), returnFocusKey: `explanation:${id}` });
      } catch (error) { if (!stillOpen()) return; status(publicErrorMessage(error, "Não foi possível abrir as fontes desta revisão."), true); render(); }
      return;
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
      dialog = root.ownerDocument.createElement("dialog"); dialog.className = "editor-sheet course-microsequence-review";
      dialog.setAttribute("aria-label", "Explicação e revisão do conteúdo"); root.ownerDocument.body.append(dialog);
      dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
      dialog.addEventListener("click", event => void click(event));
      dialog.addEventListener("change", event => { if (event.target.matches("[data-review-confirm]")) { confirmed = event.target.checked; render(); } });
      dialog.addEventListener("input", event => { if (event.target.closest("[data-review-explanation-content]")) captureFields(); });
      debate = bindCourseAuthoringDebate(dialog, { navigatorValue, locationValue, onFeedback });
      render(); dialog.showModal();
      const openingSession = session; const openingDialog = dialog;
      try { await openingSession.load(); if (dialog === openingDialog && session === openingSession) { if (session.pendingEdit) { editing = true; fields = editingFields(session.pendingEdit.explanation); } render(); } }
      catch (error) { if (dialog === openingDialog && session === openingSession) { status(publicErrorMessage(error, "Não foi possível carregar um recorte coerente para inspeção."), true); render(); } }
      return true;
    }, destroy() { close({ force: true }); }
  };
}
