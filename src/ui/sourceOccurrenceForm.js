import { createUuid } from "../domain/identifiers.js";
import { listCourseSourceOccurrenceTargets, resolveCourseSourceOccurrence } from "../domain/courseSourceOccurrences.js";
import { renderUiIcon } from "./renderUiIcons.js";

const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const SLOT_LABELS = { content: "Conteúdo", response: "Resposta", feedback: "Retorno" };

export function sourceOccurrenceFromSelection(target, textArea, occurrenceId = createUuid()) {
  const start = textArea?.selectionStart;
  const end = textArea?.selectionEnd;
  if (!target || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > target.text.length) {
    throw new TypeError("Selecione no texto o trecho associado à fonte.");
  }
  const quote = target.text.slice(start, end);
  if ([...quote].length > 4_000) throw new TypeError("Selecione um trecho de até 4.000 caracteres.");
  return { occurrenceId, slot: target.slot, resourceId: target.resourceId, path: target.path, quote,
    prefix: [...target.text.slice(0, start)].slice(-80).join("") || null,
    suffix: [...target.text.slice(end)].slice(0, 80).join("") || null };
}

export function renderSourceOccurrenceForm(state, link) {
  if (!["study_unit", "microsequence_explanation"].includes(state.targetKind)) return "";
  const content = state.targetKind === "microsequence_explanation" ? state.targetExplanation : state.targetStudyUnit;
  const options = { targetKind: state.targetKind };
  const targets = listCourseSourceOccurrenceTargets(content, options);
  const editor = state.occurrenceEditor?.linkId === link.linkId ? state.occurrenceEditor : null;
  const target = targets[editor?.targetIndex ?? 0];
  const location = item => {
    const instances = Array.isArray(content?.[item.slot]) ? content[item.slot] : [content?.[item.slot]];
    const position = instances.findIndex(instance => instance?.id === item.resourceId) + 1;
    const fieldLabel = item.path === "text" ? "Texto" : item.label.replace(/^Editar\s+/iu, "");
    return `${SLOT_LABELS[item.slot]} · Bloco ${position} · ${fieldLabel}`;
  };
  const referenceNumber = (state.sourceLinks || []).findIndex(item => item.linkId === link.linkId) + 1;
  const previouslyGeneral = state.initialSourceLinks?.some(item => item.linkId === link.linkId && !item.occurrences.length);
  return '<section class="source-occurrences" aria-label="Trecho citado neste texto">' +
    (link.occurrences.length ? '<ul>' + link.occurrences.map(occurrence => {
      const resolved = content && resolveCourseSourceOccurrence(content, occurrence, options).status === "resolved";
      return `<li><blockquote>${escape(occurrence.quote)}</blockquote><span>${resolved ? "Trecho localizado" : "Trecho a conferir"}</span>` +
        `<button type="button" data-source-action="edit-occurrence" data-link-id="${escape(link.linkId)}" data-occurrence-id="${escape(occurrence.occurrenceId)}" aria-label="Localizar trecho">${renderUiIcon("edit", "course-authoring-button-icon")}</button>` +
        `<button type="button" data-source-action="remove-occurrence" data-link-id="${escape(link.linkId)}" data-occurrence-id="${escape(occurrence.occurrenceId)}" aria-label="Remover trecho">${renderUiIcon("trash", "course-authoring-button-icon")}</button></li>`;
    }).join("") + '</ul>' : `<p>${previouslyGeneral ? "Vínculo geral já salvo, sem trecho indicado." : "Selecione o trecho que esta fonte sustenta."}</p>`) +
    (editor ? '<div class="source-occurrence-editor">' +
      (targets.length > 1 ? `<label>Parte do texto<select data-source-occurrence-target data-link-id="${escape(link.linkId)}">` + targets.map((item, index) =>
        `<option value="${index}"${index === (editor.targetIndex ?? 0) ? " selected" : ""}>${escape(location(item))} · ${escape(item.text.slice(0, 70))}</option>`).join("") + '</select></label>' : '') +
      (target ? `<p class="source-occurrence-location" data-source-occurrence-location>${escape(location(target))}</p>` : '') +
      `<label>Selecione o trecho<textarea data-source-occurrence-selection data-link-id="${escape(link.linkId)}" data-source-occurrence-index="${editor.targetIndex ?? 0}" rows="6" readonly>${escape(target?.text || "")}</textarea></label>` +
      `<p>O número${referenceNumber > 0 ? ` ${referenceNumber}` : " da referência"} aparecerá automaticamente após o trecho.</p>` +
      '<div class="course-source-compact-actions">' +
      `<button type="button" data-source-action="save-occurrence" data-link-id="${escape(link.linkId)}" aria-label="Vincular trecho selecionado" title="Vincular trecho selecionado">${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
      `<button type="button" data-source-action="cancel-occurrence" aria-label="Cancelar seleção" title="Cancelar seleção">${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></div></div>` :
      targets.length ? `<button type="button" data-source-action="add-occurrence" data-link-id="${escape(link.linkId)}" aria-label="Selecionar trecho citado" title="Selecionar trecho citado"${link.occurrences.length >= 16 ? " disabled" : ""}>${renderUiIcon("add", "course-authoring-button-icon")}</button>` :
        '<p>Este conteúdo ainda não tem um trecho textual disponível para selecionar.</p>') + '</section>';
}
