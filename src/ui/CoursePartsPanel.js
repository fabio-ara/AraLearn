import { courseAuthoringPartDraft, splitCourseAuthoringPart, mergeCourseAuthoringParts,
  normalizeCourseAuthoringPartRequest, normalizeCourseAuthoringPartChange } from "../domain/courseAuthoringParts.js";
import { createUuid } from "../domain/identifiers.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import { renderUiIcon } from "./renderUiIcons.js";

const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function createCoursePartsPanel({ root, controller, courseId, onChanged = () => {},
  onFocusPart = () => {}, onDirtyChange = () => {}, onClose = () => {} }) {
  const state = { planning: null, selected: null, draft: null, request: null,
    mode: null, busy: false, error: "", message: "", closing: false, destroyed: false, metadataEdited: false };
  const parts = () => state.planning?.plan.parts || [];
  const selected = () => parts().find(part => part.id === state.selected) || parts()[0];
  const pending = () => Boolean(state.draft || state.busy);
  const dirty = () => onDirtyChange(pending());
  const label = id => parts().flatMap(part => part.microsequences).find(item => item.id === id)?.title || id;

  function begin(mode) {
    const part = selected();
    if (!part || state.busy || state.request) return;
    state.error = ""; state.message = ""; state.mode = mode; state.metadataEdited = false;
    try {
      state.draft = mode === "split" ? splitCourseAuthoringPart(part, 1)
        : mode === "merge" ? mergeCourseAuthoringParts([part, ...parts().filter(item => item.id !== part.id).slice(0, 1)])
        : courseAuthoringPartDraft(part);
    } catch (error) { state.error = error.message; state.mode = null; }
    dirty(); render();
  }
  function discard() {
    if (state.busy) return;
    state.draft = null; state.request = null; state.mode = null; state.error = "";
    state.closing = false; dirty(); render();
  }
  function close() {
    if (state.busy) return;
    if (pending()) { state.closing = true; render(); return; }
    root.hidden = true; onClose();
  }
  function draftHtml() {
    const draft = state.draft;
    if (!draft) return "";
    const part = selected();
    const disabled = state.busy || Boolean(state.request);
    const sourceDisabled = disabled || state.metadataEdited;
    const sourceControls = state.mode === "split"
      ? `<label>Dividir depois de<select name="splitAfter" aria-label="Dividir depois de"${sourceDisabled ? " disabled" : ""}>${part.microsequences.slice(0, -1).map((item, index) =>
        `<option value="${index + 1}"${draft.microsequences.length === part.microsequences.length - index - 1 ? " selected" : ""}>${index + 1}. ${escape(item.title)}</option>`).join("")}</select></label>`
      : state.mode === "merge" ? '<fieldset><legend>Lotes a reunir</legend>' + parts().map(item =>
        `<label class="course-parts-check"><input type="checkbox" name="mergePart" value="${item.id}"${item.microsequences.every(micro => draft.microsequences.some(member => member.microsequenceId === micro.id)) ? " checked" : ""}${sourceDisabled ? " disabled" : ""}>${escape(item.title)}</label>`).join("") + '</fieldset>' : "";
    return `<form data-parts-form><fieldset${disabled ? " disabled" : ""}><legend>${state.mode === "split" ? "Novo lote após a divisão" : state.mode === "merge" ? "Lote reunido" : "Posição do lote"}</legend>` + sourceControls +
      `<label>Posição<select name="position" aria-label="Posição">${Array.from({ length: Math.min(64, parts().length + (draft.partId === null ? 1 : 0)) }, (_, index) =>
        `<option value="${index}"${draft.position === index ? " selected" : ""}>${index + 1}</option>`).join("")}</select></label>` +
      `<label>Título<input name="title" value="${escape(draft.title)}" maxlength="300" required></label>` +
      `<label>Intenção<textarea name="intent" maxlength="4000" required>${escape(draft.intent)}</textarea></label>` +
      '<div class="course-parts-progression"><p>Progressão local</p>' + draft.progression.map((item, index) =>
        `<div><label>Passo ${index + 1}<textarea name="progression-${index}" maxlength="1000" required>${escape(item)}</textarea></label><button type="button" data-parts-action="remove-step" data-step="${index}"${draft.progression.length === 1 ? " disabled" : ""}>Retirar passo ${index + 1}</button></div>`).join("") + '</div></fieldset>' +
      '<section aria-label="Prévia da reorganização"><h3>Microssequências no lote</h3><ol>' + draft.microsequences.map(item => `<li>${escape(label(item.microsequenceId))}</li>`).join("") + '</ol>' +
      '<p>O mapa curricular, as unidades, suas fontes e as configurações aplicadas permanecem nas mesmas identidades.</p>' +
      (state.mode === "merge" ? '<p>Os lotes reunidos deixam de existir como grupos separados. Seus títulos, intenções e passos foram reunidos acima; revise o texto antes de salvar.</p>' : "") + '</section>' +
      '<div class="course-parts-actions"><button type="submit" aria-label="Salvar reorganização" title="Salvar reorganização"' + (state.busy ? ' disabled' : '') + '>' + renderUiIcon("save", "course-authoring-button-icon") + '</button>' +
      '<button type="button" data-parts-action="discard" aria-label="Descartar reorganização" title="Descartar reorganização"' + (state.busy ? ' disabled' : '') + '>' + renderUiIcon("remove-state", "course-authoring-button-icon") + '</button></div></form>';
  }
  function render() {
    if (state.destroyed) return;
    const part = selected();
    root.classList.add("course-parts-editor");
    root.innerHTML = '<div class="course-parts-heading"><h2>Reorganizar lotes</h2><button type="button" data-parts-action="close" aria-label="Fechar reorganização" title="Fechar reorganização">' +
      renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button></div>' +
      '<p>Divida, reúna ou reposicione grupos de microssequências existentes. A ordem curricular não muda.</p>' +
      (parts().length ? `<label>Lote<select aria-label="Lote" data-parts-selection${pending() ? " disabled" : ""}>` + parts().map(item => `<option value="${item.id}"${part?.id === item.id ? " selected" : ""}>${item.position + 1}. ${escape(item.title)}</option>`).join("") + '</select></label>' +
        '<div class="course-parts-actions"><button type="button" data-parts-action="split"' + (pending() || part.microsequences.length < 2 || parts().length >= 64 ? ' disabled' : '') + '>Dividir</button>' +
        '<button type="button" data-parts-action="merge"' + (pending() || parts().length < 2 ? ' disabled' : '') + '>Reunir</button>' +
        '<button type="button" data-parts-action="reorder"' + (pending() || parts().length < 2 ? ' disabled' : '') + '>Reordenar</button>' +
        '<button type="button" data-parts-action="inspect"' + (pending() ? ' disabled' : '') + '>Inspecionar lote</button></div>'
        : '<p>O planejamento ainda não tem lotes. Organize o mapa e forme o primeiro lote pela conversa de planejamento.</p>') +
      draftHtml() + (state.error ? `<p role="alert">${escape(state.error)}</p>` : '') +
      `<p role="status">${escape(state.busy ? "Salvando reorganização…" : state.message)}</p>` +
      (state.closing ? '<section role="alertdialog" aria-label="Rascunho da reorganização"><p>Há uma reorganização não salva. Descartá-la para fechar?</p><button type="button" data-parts-action="discard-close">Descartar e fechar</button><button type="button" data-parts-action="keep">Continuar editando</button></section>' : '');
  }
  async function save(event) {
    if (!event.target.matches("[data-parts-form]")) return;
    event.preventDefault();
    if (state.busy || !state.draft) return;
    try {
      state.request ||= normalizeCourseAuthoringPartRequest({ courseId,
        expectedCourseRevision: state.planning.courseRevision, expectedPlanVersion: state.planning.plan.version,
        requestId: createUuid(), part: state.draft });
      state.busy = true; state.error = ""; dirty(); render();
      const result = normalizeCourseAuthoringPartChange(await controller.saveCourseAuthoringPart(state.request), state.request);
      state.draft = null; state.request = null; state.mode = null; state.busy = false;
      state.message = result.changed ? "Reorganização salva." : "O lote já estava nessa configuração.";
      dirty(); render();
      await onChanged(result);
      onFocusPart({ partId: result.authoringPartId });
    } catch (error) {
      state.busy = false;
      state.error = publicErrorMessage(error);
      // Falha ambígua conserva o pedido exato. Conflito exige releitura deliberada,
      // preservando o rascunho para copiar/revisar antes de descartá-lo.
      if (Number(error?.status) >= 400 && Number(error?.status) < 500 && ![408, 429].includes(Number(error?.status))) state.request = null;
      dirty(); render();
    }
  }
  function input(event) {
    const field = event.target;
    if (!state.draft || state.busy || state.request) return;
    if (["title", "intent"].includes(field.name)) { state.draft[field.name] = field.value; state.metadataEdited = true; }
    if (field.name === "position") state.draft.position = Number(field.value);
    if (/^progression-\d+$/u.test(field.name)) { state.draft.progression[Number(field.name.slice(12))] = field.value; state.metadataEdited = true; }
    if (state.metadataEdited) root.querySelectorAll?.('[name="mergePart"], [name="splitAfter"]').forEach(control => { control.disabled = true; });
    dirty();
  }
  function change(event) {
    const field = event.target;
    if (field.matches("[data-parts-selection]") && !pending()) { state.selected = field.value; render(); }
    if (state.busy || state.request) return;
    try {
      if (field.name === "splitAfter") state.draft = splitCourseAuthoringPart(selected(), Number(field.value));
      if (field.name === "mergePart") {
        const ids = [...root.querySelectorAll('[name="mergePart"]:checked')].map(item => item.value);
        state.draft = mergeCourseAuthoringParts(parts().filter(item => ids.includes(item.id)));
      }
      if (["splitAfter", "mergePart"].includes(field.name)) { state.error = ""; dirty(); render(); }
    } catch (error) { state.error = error.message; render(); }
  }
  function click(event) {
    const action = event.target.closest("[data-parts-action]")?.dataset.partsAction;
    if (["split", "merge", "reorder"].includes(action)) begin(action);
    if (action === "discard") discard();
    if (action === "close") close();
    if (action === "keep") { state.closing = false; render(); }
    if (action === "discard-close") { discard(); close(); }
    if (action === "inspect" && !pending()) onFocusPart({ partId: selected().id });
    if (action === "remove-step" && state.draft && !state.busy && !state.request && state.draft.progression.length > 1) {
      const index = Number(event.target.closest("[data-parts-action]").dataset.step);
      if (Number.isSafeInteger(index) && index >= 0 && index < state.draft.progression.length) {
        state.draft.progression.splice(index, 1); state.metadataEdited = true; dirty(); render();
      }
    }
  }
  root.addEventListener("click", click); root.addEventListener("submit", save);
  root.addEventListener("input", input); root.addEventListener("change", change);
  return {
    open({ planning, partId = null }) {
      if (pending()) { root.hidden = false; return false; }
      if (planning?.courseId !== courseId || !Number.isSafeInteger(planning.courseRevision) ||
          !Number.isSafeInteger(planning.plan?.version) || !Array.isArray(planning.plan.parts)) throw new TypeError("Planejamento do lote inválido.");
      state.planning = structuredClone(planning); state.selected = partId; root.hidden = false; render(); return true;
    },
    hasPendingDraft: pending,
    close,
    destroy() { state.destroyed = true; root.removeEventListener("click", click); root.removeEventListener("submit", save);
      root.removeEventListener("input", input); root.removeEventListener("change", change); root.replaceChildren(); }
  };
}
