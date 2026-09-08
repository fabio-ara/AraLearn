import { createUuid } from "../domain/identifiers.js";
import { normalizeCourseAuthoringExport } from "../domain/courseAuthoringComparison.js";
import { normalizeMicrosequenceExplanation } from "../domain/courseExplanation.js";
import { explanationRenderingUnit, explanationReviewMessage } from "../study/studyExplanation.js";
import { renderPackageStudyUnitBlocks } from "../render/renderPackageStudyUnit.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { applyManualStudyUnitEdit, isAmbiguousManualStudyUnitWriteFailure,
  listManualStudyUnitEditablePaths, listManualStudyUnitTargetIds } from "./manualStudyUnitEdit.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { bindCourseAuthoringDebate, renderCourseAuthoringDebate } from "./courseAuthoringDebate.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { formatCourseSourceReference } from "../domain/courseSourceReference.js";
import { renderBibliographicReference } from "./renderBibliographicReference.js";
import { renderCourseAuthoringInspectionEvidence } from "./CourseAnalyticsPanel.js";

const clone = value => structuredClone(value);
const escape = value => String(value ?? "").replace(/[&<>"']/gu, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
function changed() {
  return Object.assign(new Error("O conteúdo ou suas fontes mudaram. Reinspecione a versão atual antes de aprovar."), {
    code: "course_revision_changed", status: 409
  });
}
function checkedReview(value, courseId, microsequenceId) {
  if (value?.courseId !== courseId || value.microsequenceId !== microsequenceId ||
      !/^[a-f0-9]{64}$/u.test(value.basisHash || "") ||
      !["unregistered", "draft", "current", "stale"].includes(value.contentReview?.state)) {
    throw new TypeError("A revisão não corresponde à microssequência inspecionada.");
  }
  return clone(value);
}

/** Duas leituras da base cercam um export remoto estrito; um hash novo nunca aprova um cache antigo. */
export async function loadMicrosequenceReviewSnapshot(controller, { courseId, microsequenceId, expectedRevision }) {
  const before = checkedReview(await controller.getMicrosequenceReview(courseId, microsequenceId), courseId, microsequenceId);
  const selection = { courseId, expectedRevision, scope: { kind: "didactic_microsequence", ref: microsequenceId } };
  const exported = normalizeCourseAuthoringExport(await controller.exportCourseAuthoring(selection), { expectedSelection: selection });
  const provenance = exported.artifact.explanationSources.find(value => value.query.targetId === microsequenceId);
  const entityVersion = provenance?.items[0]?.targetVersion ??
    (await controller.getMicrosequenceForExplanation?.(courseId, microsequenceId, { expectedRevision }))?.version ?? null;
  const after = checkedReview(await controller.getMicrosequenceReview(courseId, microsequenceId), courseId, microsequenceId);
  if (before.basisHash !== after.basisHash) throw changed();
  const candidates = exported.artifact.document.courses[0].modules.flatMap(module => module.lessons.flatMap(lesson =>
    lesson.microsequences.filter(ms => ms.id === microsequenceId).map(microsequence => ({ module, lesson, microsequence }))));
  if (candidates.length !== 1) throw new TypeError("O recorte não contém a microssequência solicitada.");
  const { module, lesson, microsequence } = candidates[0];
  const sources = exported.artifact.explanationSources.find(value => value.query.targetId === microsequenceId);
  const references = await Promise.all(exported.analytics.basis.sources.map(async source => ({ sourceId: source.sourceRef,
    reference: await formatCourseSourceReference({ ...source.document, sourceId: source.sourceRef }, {
      style: sources?.bibliographyStyle || "abnt-2025"
    }) })));
  return { courseId, courseRevision: expectedRevision, microsequenceId, courseTitle: exported.course.title,
    moduleTitle: module.title, lessonTitle: lesson.title, microsequence: clone(microsequence),
    basisHash: after.basisHash, contentReview: after.contentReview,
    entityVersion, references, analytics: clone(exported.analytics),
    sources: clone(exported.analytics.basis.sources), explanationSources: clone(sources?.items[0]?.sourceLinks || []),
    unitSources: clone(exported.analytics.basis.studyUnits.map(unit => ({ studyUnitId: unit.studyUnitRef, sourceLinks: unit.sourceLinks }))) };
}

/** A decisão incerta permanece com a mesma identidade no armazenamento da conta. */
export class CourseMicrosequenceReviewSession {
  constructor({ controller, courseId, microsequenceId, expectedRevision, uuid = createUuid }) {
    this.controller = controller; this.courseId = courseId; this.microsequenceId = microsequenceId;
    this.expectedRevision = expectedRevision; this.uuid = uuid; this.snapshot = null;
    this.pending = null; this.pendingEdit = null; this.busy = false; this.needsReinspection = false;
    this.key = `course.v1.pending-content-review:${courseId}:${microsequenceId}`;
  }
  async load() {
    this.pending = await this.controller.store?.getCache(this.key) || null;
    this.pendingEdit = await this.controller.loadPendingMicrosequenceExplanationEdit?.(this.courseId, this.microsequenceId) || null;
    for (const pending of [this.pending, this.pendingEdit].filter(Boolean)) {
      if (pending.courseId !== this.courseId || pending.microsequenceId !== this.microsequenceId ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(pending.requestId || "")) {
        throw new TypeError("O pedido local pendente não corresponde a este recorte.");
      }
    }
    this.snapshot = await loadMicrosequenceReviewSnapshot(this.controller, {
      courseId: this.courseId, microsequenceId: this.microsequenceId, expectedRevision: this.expectedRevision
    });
    this.needsReinspection = false;
    return clone(this.snapshot);
  }
  async approve({ confirmed = false } = {}) {
    if (this.busy || this.pendingEdit || !this.snapshot && !this.pending || !this.pending && !confirmed) {
      throw new Error("Confirme explicitamente a revisão do conjunto antes de aprovar.");
    }
    this.busy = true;
    try {
      if (!this.pending) {
        if (this.needsReinspection) throw changed();
        const current = checkedReview(await this.controller.getMicrosequenceReview(this.courseId, this.microsequenceId), this.courseId, this.microsequenceId);
        if (current.basisHash !== this.snapshot.basisHash) throw changed();
        this.pending = { courseId: this.courseId, microsequenceId: this.microsequenceId,
          expectedBasisHash: this.snapshot.basisHash, requestId: this.uuid() };
        await this.controller.store?.putCache(this.key, this.pending);
      }
      const receipt = await this.controller.approveMicrosequenceContent(clone(this.pending));
      if (receipt?.courseId !== this.courseId || receipt.microsequenceId !== this.microsequenceId ||
          receipt.basisHash !== this.pending.expectedBasisHash || !Number.isSafeInteger(receipt.courseRevision)) {
        throw Object.assign(new Error("A confirmação recebida não corresponde à decisão enviada."), { ambiguous: true });
      }
      this.pending = null; await this.controller.store?.putCache(this.key, null);
      let current = null;
      try { current = checkedReview(await this.controller.getMicrosequenceReview(this.courseId, this.microsequenceId), this.courseId, this.microsequenceId); }
      catch { /* O recibo confirma a decisão; não afirma que a base ainda é a corrente. */ }
      const stillCurrent = current?.basisHash === receipt.basisHash && current.contentReview.state === "current";
      this.needsReinspection = !stillCurrent;
      return { receipt: clone(receipt), current, stillCurrent };
    } catch (error) {
      if (!isAmbiguousManualStudyUnitWriteFailure(error)) {
        this.pending = null; await this.controller.store?.putCache(this.key, null);
      }
      throw error;
    } finally { this.busy = false; }
  }
  async saveExplanation(explanation) {
    if (this.busy || this.pending || !this.snapshot && !this.pendingEdit || typeof this.controller.saveMicrosequenceExplanation !== "function") {
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
          expectedRevision: this.snapshot.courseRevision, expectedEntityVersion: this.snapshot.entityVersion,
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
  onFeedback = () => {}, navigatorValue = globalThis.navigator, locationValue = globalThis.location }) {
  let dialog = null; let session = null; let returnButton = null; let editing = false;
  let fields = []; let preview = null; let confirmed = false; let message = ""; let failure = false;
  let epoch = 0; let changedRevision = null; let debate = null;
  let componentsReady = false;
  const dirty = () => editing || Boolean(session?.pending || session?.pendingEdit || session?.busy);
  function status(value, error = false) { message = value; failure = error; }
  function close({ force = false } = {}) {
    if (!dialog) return true;
    if (!force && dirty()) { if (editing) captureFields(); status("Conclua ou cancele a edição; confirme o resultado de qualquer pedido pendente antes de sair.", true); render(); return false; }
    ++epoch; debate?.destroy(); debate = null;
    dialog.close(); dialog.remove(); dialog = null;
    returnButton?.isConnected && returnButton.focus({ preventScroll: true });
    if (changedRevision) onChanged(changedRevision);
    return true;
  }
  function sourceLinks(links) {
    const inventory = session.snapshot.sources;
    return links.length ? '<ul>' + links.map(link => {
      const record = inventory.find(value => value.sourceRef === (link.sourceId || link.sourceRef));
      const source = record?.document;
      const reference = session.snapshot.references.find(value => value.sourceId === record?.sourceRef)?.reference;
      return `<li>${renderBibliographicReference(reference) || escape(source?.title || "Fonte vinculada")}` +
        (link.anchors || []).map(({ anchorId }) => {
          const anchor = record?.anchors.find(value => value.anchorRef === anchorId);
          const selector = anchor?.selector;
          const locator = anchor?.humanLocator || (selector?.kind === "page_range" ? `p. ${selector.startPage}–${selector.endPage}` :
            selector?.kind === "text_quote" ? selector.exact : selector?.kind === "uri_fragment" ? selector.fragment : "Consulte a localização em Fontes");
          return `<p>Localização: ${escape(locator)}</p>`;
        }).join("") + (link.occurrences || []).map(value => `<blockquote>${escape(value.quote)}</blockquote>`).join("") + '</li>';
    }).join("") + '</ul>' : '<p>Nenhuma fonte vinculada a este conteúdo.</p>';
  }
  function render() {
    if (!dialog) return;
    const active = dialog.contains(dialog.ownerDocument.activeElement) ? dialog.ownerDocument.activeElement : null;
    const openedDetails = [...dialog.querySelectorAll("details[open]")].map(node => node.querySelector(":scope > summary")?.textContent);
    const focusAttribute = active && [...active.attributes].find(attribute =>
      attribute.name.startsWith("data-review-") || attribute.name === "data-inspection-edit-explanation-sources");
    const restoreFocus = () => {
      const candidates = focusAttribute ? [...dialog.querySelectorAll(`[${focusAttribute.name}]`)] : [];
      const target = candidates.find(node => node.getAttribute(focusAttribute.name) === focusAttribute.value && !node.disabled);
      (target || dialog.querySelector("[data-review-close]"))?.focus({ preventScroll: true });
    };
    componentsReady = false;
    const snapshot = session?.snapshot; const busy = session?.busy;
    let content = message ? '<p>Não há recorte coerente disponível para uma nova decisão.</p>' : '<p role="status">Carregando o conteúdo e suas fontes para inspeção…</p>';
    if (!snapshot && session?.pending) content += `<button type="button" data-review-approve${busy ? " disabled" : ""}>Confirmar resultado da mesma aprovação</button>`;
    if (!snapshot && session?.pendingEdit) content += `<button type="button" data-review-save${busy ? " disabled" : ""}>Confirmar resultado da gravação</button>`;
    if (snapshot) {
      const ms = snapshot.microsequence; const explanation = preview || ms.explanation;
      const route = buildCourseAuthoringRoute(snapshot.courseId, { section: "content", didacticMicrosequenceId: snapshot.microsequenceId });
      content = `<p>${escape(snapshot.moduleTitle)} › ${escape(snapshot.lessonTitle)} › ${escape(ms.title)}</p>` +
        `<p>Revisão ${snapshot.courseRevision}. ${escape(explanationReviewMessage(snapshot.contentReview))}</p>` +
        '<p>A aprovação abrange as unidades abaixo, a Explicação e seus vínculos de fontes. Aprovar o mapa não aprova texto produzido depois.</p>' +
        `<details><summary>Objetivo e proposta da microssequência</summary><p>${escape(ms.goal)}</p>` +
        (ms.explanationPlan ? `<p>Propósito: ${escape(ms.explanationPlan.purpose)}</p>` +
          [["Pressupostos", ms.explanationPlan.prerequisites], ["Relações", ms.explanationPlan.relations],
            ["Fontes previstas", ms.explanationPlan.sourceIds.map(id => snapshot.sources.find(value => value.sourceRef === id)?.document.title || id)]]
            .map(([label, values]) => `<h4>${label}</h4>` + (values.length ? '<ul>' + values.map(value => `<li>${escape(value)}</li>`).join("") + '</ul>' : '<p>Nenhum registro.</p>')).join("")
          : '<p>Proposta da Explicação não registrada.</p>') + '</details>' +
        '<section aria-label="Explicação compartilhada"><h3>Explicação compartilhada</h3>' +
        (explanation ? `<h4>${escape(explanation.title)}</h4>` + renderPackageStudyUnitBlocks(explanationRenderingUnit(explanation), { revealPracticeAnswers: true })
          : '<p>Esta microssequência ainda não tem Explicação.</p>') + sourceLinks(snapshot.explanationSources) +
        (explanation ? `<button type="button" data-inspection-edit-explanation-sources data-microsequence-id="${escape(snapshot.microsequenceId)}"${busy || editing || session.pending || session.pendingEdit ? " disabled" : ""}>Fontes da Explicação</button>` : "") +
        (explanation && typeof controller.saveMicrosequenceExplanation === "function" && !editing
          ? `<button type="button" data-review-edit${busy || session.pending ? " disabled" : ""}>Editar Explicação</button>` : "") + '</section>' +
        (editing ? '<section aria-label="Edição manual da Explicação"><h3>Editar texto da Explicação</h3>' + fields.map((field, index) =>
          `<label>${escape(field.label)}<textarea data-review-field="${index}" rows="3"${busy || session.pendingEdit ? " readonly" : ""}>${escape(field.value)}</textarea></label>`).join("") +
          `<button type="button" data-review-preview${busy ? " disabled" : ""}>Visualizar alterações</button>` +
          `<button type="button" data-review-save${busy ? " disabled" : ""}>${session.pendingEdit ? "Confirmar resultado da gravação" : "Salvar Explicação"}</button>` +
          `<button type="button" data-review-cancel-edit${busy || session.pendingEdit ? " disabled" : ""}>Cancelar edição</button></section>` : "") +
        `<section aria-label="Unidades desta microssequência"><h3>Unidades (${ms.studyUnits.length})</h3>` + ms.studyUnits.map((unit, index) =>
          `<article><h4>${index + 1}. ${escape(unit.title)} · ${unit.role === "practice" ? "Prática" : "Teoria"}</h4>` +
          renderPackageStudyUnitBlocks(unit, { revealPracticeAnswers: true }) +
          sourceLinks(snapshot.unitSources.find(value => value.studyUnitId === unit.id)?.sourceLinks || []) +
          (typeof controller.loadAuthoringStudyUnits === "function" ? `<button type="button" data-review-unit-sources="${escape(unit.id)}"${busy || editing || session.pending || session.pendingEdit ? " disabled" : ""}>Fontes de ${escape(unit.title)}</button>` : "") + '</article>').join("") + '</section>' +
        renderCourseAuthoringInspectionEvidence(snapshot.analytics) +
        renderCourseAuthoringDebate({ courseId: snapshot.courseId, courseRevision: snapshot.courseRevision, title: snapshot.courseTitle,
          route, contextLabel: "a Explicação compartilhada e as unidades desta microssequência" }) +
        '<section aria-label="Revisão humana do conteúdo"><h3>Revisão humana do conteúdo</h3>' +
        `<p><strong>${escape(ms.title)}</strong> · ${ms.studyUnits.length} ${ms.studyUnits.length === 1 ? "unidade" : "unidades"}` +
        ` · Explicação ${ms.explanation ? "compartilhada" : "ausente"} · vínculos de fontes.</p>` +
        `<label><input type="checkbox" data-review-confirm${confirmed ? " checked" : ""} disabled> Revisei o conjunto exibido, incluindo suas fontes, e aprovo este conteúdo.</label>` +
        `<button type="button" data-review-approve disabled>${session.pending ? "Confirmar resultado da mesma aprovação" : "Aprovar conteúdo revisado"}</button></section>`;
    }
    const scroll = dialog.querySelector(".editor-body")?.scrollTop || 0;
    dialog.innerHTML = `<header class="editor-head"><button type="button" data-review-close aria-label="Fechar inspeção da Explicação" title="Fechar inspeção da Explicação">${renderUiIcon("remove-state", "course-authoring-button-icon")}</button><h2>Explicação e revisão do conteúdo</h2></header>` +
      `<div class="editor-body"><p role="${failure ? "alert" : "status"}" data-review-status>${escape(message)}</p>${content}</div>`;
    dialog.querySelector(".editor-body").scrollTop = scroll;
    dialog.querySelectorAll("details").forEach(node => {
      if (openedDetails.includes(node.querySelector(":scope > summary")?.textContent)) node.open = true;
    });
    dialog.querySelectorAll('.package-instance[data-package^="aralearn.response."], .card-answer-dock').forEach(container => {
      container.setAttribute("aria-disabled", "true"); container.setAttribute("inert", "");
      container.querySelectorAll("button, input, select, textarea, [contenteditable]").forEach(control => {
        if ("disabled" in control) control.disabled = true;
        control.setAttribute("tabindex", "-1"); control.removeAttribute("contenteditable");
      });
    });
    const current = ++epoch;
    void RESOURCE_PACKAGE_REGISTRY.hydrate(dialog).then(() => {
      if (!dialog || current !== epoch) return;
      componentsReady = true;
      const confirm = dialog.querySelector("[data-review-confirm]");
      if (confirm) confirm.disabled = Boolean(busy || editing || session.pending || session.needsReinspection);
      const approve = dialog.querySelector("[data-review-approve]");
      if (approve) approve.disabled = Boolean(busy || editing || session.pendingEdit || !session.pending &&
        (!confirmed || session.needsReinspection || snapshot?.contentReview.state === "current"));
      restoreFocus();
    }).catch(() => {
      if (!dialog || current !== epoch) return;
      status("Um componente não pôde ser preparado. Reabra para inspecionar antes de aprovar.", true);
      const live = dialog.querySelector("[data-review-status]"); live.textContent = message; live.setAttribute("role", "alert");
    });
  }
  function captureFields() {
    dialog.querySelectorAll("[data-review-field]").forEach(node => { fields[Number(node.dataset.reviewField)].value = node.value; });
  }
  async function click(event) {
    if (event.target.closest("[data-review-close]")) return close();
    if (!session || session.busy) return;
    if (event.target.closest("[data-review-edit]")) {
      editing = true; confirmed = false; preview = null;
      fields = editingFields(session.pendingEdit?.explanation || session.snapshot.microsequence.explanation); render(); return;
    }
    if (event.target.closest("[data-review-cancel-edit]")) { editing = false; preview = null; fields = []; status("Edição cancelada; o conteúdo salvo foi preservado."); render(); return; }
    if (event.target.closest("[data-review-preview]")) { captureFields(); try { preview = applyExplanationTextFields(session.snapshot.microsequence.explanation, fields); status("Prévia local: nada foi salvo."); } catch (error) { status(publicErrorMessage(error, "A prévia não pôde ser preparada."), true); } render(); return; }
    if (event.target.closest("[data-review-save]")) {
      captureFields();
      try {
        const value = session.pendingEdit?.explanation || applyExplanationTextFields(session.snapshot.microsequence.explanation, fields);
        const pending = session.saveExplanation(value); render();
        const result = await pending; changedRevision = result.courseRevision;
        editing = false; preview = null; confirmed = false; fields = [];
        await session.load(); status("Explicação salva como rascunho. Reinspecione o conjunto antes de aprovar.");
      } catch (error) { status(session.pendingEdit ? "Não foi possível confirmar a gravação. Confirme o resultado do mesmo pedido; seu texto foi preservado." : publicErrorMessage(error, "A edição não foi salva. Seu rascunho foi preservado."), true); }
      render(); return;
    }
    if (event.target.closest("[data-inspection-edit-explanation-sources]")) {
      const snapshot = session.snapshot;
      const target = { mode: "target", targetKind: "microsequence_explanation", targetId: snapshot.microsequenceId,
        targetVersion: snapshot.entityVersion, targetLabel: `Explicação · ${snapshot.microsequence.title}`,
        targetExplanation: clone(snapshot.microsequence.explanation) };
      if (close()) onEditSources(target); return;
    }
    const unitSources = event.target.closest("[data-review-unit-sources]");
    if (unitSources) {
      try {
        const snapshot = session.snapshot; const id = unitSources.dataset.reviewUnitSources;
        const page = await controller.loadAuthoringStudyUnits(snapshot.courseId, { expectedRevision: snapshot.courseRevision,
          scope: { kind: "didactic_microsequence", id: snapshot.microsequenceId }, anchorStudyUnitId: id, limit: 1 });
        const item = page.items.find(value => value.studyUnit.id === id);
        if (page.courseRevision !== snapshot.courseRevision || page.stale || page.offline || !item ||
            JSON.stringify(item.studyUnit) !== JSON.stringify(snapshot.microsequence.studyUnits.find(value => value.id === id))) throw changed();
        if (close()) onEditSources({ targetKind: "study_unit", targetId: id, targetVersion: item.version,
          targetLabel: item.studyUnit.title, targetStudyUnit: clone(item.studyUnit), returnFocusKey: `explanation:${id}` });
      } catch (error) { status(publicErrorMessage(error, "Não foi possível abrir as fontes desta revisão."), true); render(); }
      return;
    }
    if (event.target.closest("[data-review-approve]")) {
      if (!componentsReady && !session.pending) return;
      try {
        const pending = session.approve({ confirmed }); render();
        const result = await pending; changedRevision = result.receipt.courseRevision; confirmed = false;
        if (result.current && session.snapshot) session.snapshot.contentReview = result.current.contentReview;
        status(result.stillCurrent ? "Conteúdo aprovado pela sua decisão nesta versão." : result.current
          ? "A decisão foi registrada, mas o conteúdo mudou depois. Reinspecione a versão atual."
          : "A decisão foi registrada. Não foi possível conferir o estado atual; atualize antes de outra decisão.", !result.stillCurrent);
      } catch (error) { status(session.pending ? "Não foi possível confirmar a aprovação. Consulte o resultado da mesma decisão; nenhum novo pedido será criado." : publicErrorMessage(error, "O conteúdo não foi aprovado."), true); }
      render();
    }
  }
  return { hasPendingDraft: dirty, close,
    async open({ courseId, microsequenceId, expectedRevision, button = null }) {
      if (dialog && !close()) return false;
      session = new CourseMicrosequenceReviewSession({ controller, courseId, microsequenceId, expectedRevision });
      editing = false; fields = []; preview = null; confirmed = false; message = ""; failure = false; changedRevision = null;
      returnButton = button;
      dialog = root.ownerDocument.createElement("dialog"); dialog.className = "editor-sheet course-microsequence-review";
      dialog.setAttribute("aria-label", "Explicação e revisão do conteúdo"); root.ownerDocument.body.append(dialog);
      dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
      dialog.addEventListener("click", event => void click(event));
      dialog.addEventListener("change", event => { if (event.target.matches("[data-review-confirm]")) { confirmed = event.target.checked; render(); } });
      debate = bindCourseAuthoringDebate(dialog, { navigatorValue, locationValue, onFeedback });
      render(); dialog.showModal();
      try { await session.load(); if (dialog) { if (session.pendingEdit) { editing = true; fields = editingFields(session.pendingEdit.explanation); } render(); } }
      catch (error) { status(publicErrorMessage(error, "Não foi possível carregar um recorte coerente para inspeção."), true); render(); }
      return true;
    }, destroy() { close({ force: true }); }
  };
}
