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
  if (state.targetKind !== "study_unit") return "";
  const targets = listCourseSourceOccurrenceTargets(state.targetStudyUnit);
  const editor = state.occurrenceEditor?.linkId === link.linkId ? state.occurrenceEditor : null;
  const target = targets[editor?.targetIndex ?? 0];
  return '<section class="source-occurrences"><h4>Onde aparece no item</h4>' +
    (link.occurrences.length ? '<ul>' + link.occurrences.map(occurrence => {
      const resolved = state.targetStudyUnit && resolveCourseSourceOccurrence(state.targetStudyUnit, occurrence).status === "resolved";
      return `<li><blockquote>${escape(occurrence.quote)}</blockquote><span>${resolved ? "Trecho localizado" : "Trecho a conferir"}</span>` +
        `<button type="button" data-source-action="edit-occurrence" data-link-id="${escape(link.linkId)}" data-occurrence-id="${escape(occurrence.occurrenceId)}" aria-label="Localizar trecho">${renderUiIcon("edit", "course-authoring-button-icon")}</button>` +
        `<button type="button" data-source-action="remove-occurrence" data-link-id="${escape(link.linkId)}" data-occurrence-id="${escape(occurrence.occurrenceId)}" aria-label="Remover trecho">${renderUiIcon("trash", "course-authoring-button-icon")}</button></li>`;
    }).join("") + '</ul>' : '<p>A referência vale para o item inteiro.</p>') +
    (editor ? '<div class="source-occurrence-editor">' +
      `<label>Parte do item<select data-source-occurrence-target data-link-id="${escape(link.linkId)}">` + targets.map((item, index) =>
        `<option value="${index}"${index === (editor.targetIndex ?? 0) ? " selected" : ""}>${escape(SLOT_LABELS[item.slot])} · ${escape(item.label)} · ${escape(item.text.slice(0, 70))}</option>`).join("") + '</select></label>' +
      `<label>Selecione o trecho<textarea data-source-occurrence-selection data-link-id="${escape(link.linkId)}" data-source-occurrence-index="${editor.targetIndex ?? 0}" rows="6" readonly>${escape(target?.text || "")}</textarea></label>` +
      `<button type="button" data-source-action="save-occurrence" data-link-id="${escape(link.linkId)}">Usar trecho selecionado</button>` +
      '<button type="button" data-source-action="cancel-occurrence">Cancelar</button></div>' :
      targets.length ? `<button type="button" data-source-action="add-occurrence" data-link-id="${escape(link.linkId)}"${link.occurrences.length >= 16 ? " disabled" : ""}>Vincular a um trecho</button>` : '') + '</section>';
}
