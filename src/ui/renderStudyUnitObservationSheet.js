import { COURSE_ANCHORED_ANNOTATION_CATEGORIES } from
  "../domain/courseAnchoredAnnotations.js";
import { renderUiIcon } from "./renderUiIcons.js";

export const STUDY_UNIT_OBSERVATION_MAX_SCALARS = 2_000;
export const STUDY_UNIT_OBSERVATION_MAX_BYTES = 16 * 1_024;

export function countObservationScalars(value) {
  return [...String(value ?? "")].length;
}

export function countObservationBytes(value) {
  return new TextEncoder().encode(String(value ?? "")).byteLength;
}

export function formatObservationTextBudget(value) {
  const scalars = countObservationScalars(value).toLocaleString("pt-BR");
  const bytes = countObservationBytes(value).toLocaleString("pt-BR");
  return `${scalars}/2.000 caracteres · ${bytes} B/16 KiB`;
}

export function isObservationTextOverLimit(value) {
  return countObservationScalars(value) > STUDY_UNIT_OBSERVATION_MAX_SCALARS ||
    countObservationBytes(value) > STUDY_UNIT_OBSERVATION_MAX_BYTES;
}

export function validateStudyUnitObservationText(value) {
  const rawText = String(value ?? "");
  if (!rawText.trim()) return "Escreva a observação antes de salvar.";
  if (countObservationScalars(rawText) > STUDY_UNIT_OBSERVATION_MAX_SCALARS) {
    return "A observação pode ter no máximo 2.000 caracteres.";
  }
  if (countObservationBytes(rawText) > STUDY_UNIT_OBSERVATION_MAX_BYTES) {
    return "A observação excede o limite seguro de 16 KiB.";
  }
  return "";
}

export function revealStudyObservationControl(control) {
  const body = control?.closest?.(".study-observation-body");
  if (!body || typeof control.getBoundingClientRect !== "function") return;
  const viewport = body.getBoundingClientRect();
  if (viewport.height <= 0) return;
  const composer = control.closest?.("[data-observation-composer]");
  const composerRect = composer?.getBoundingClientRect?.();
  const target = composerRect && composerRect.height <= viewport.height - 8
    ? composerRect : control.getBoundingClientRect();
  const delta = target.top < viewport.top + 4 ? target.top - viewport.top - 4
    : target.bottom > viewport.bottom - 4 ? target.bottom - viewport.bottom + 4 : 0;
  // Only this scrollport moves; the unit and the page retain their reading anchor.
  body.scrollTop += delta * (body.clientHeight / viewport.height);
}

const CATEGORY_LABELS = Object.freeze({
  none: "Sem categoria",
  question: "Dúvida",
  possible_error: "Possível erro",
  confusing: "Trecho confuso",
  suggestion: "Sugestão",
  reformulation_request: "Pedido de reformulação"
});
const STATE_LABELS = Object.freeze({
  open: "Aberta",
  considered: "Considerada",
  resolved: "Resolvida",
  withdrawn: "Retirada"
});
const SYNC_LABELS = Object.freeze({
  pending: "Pendente",
  synced: "Sincronizada",
  failed: "Falhou"
});
const ORIGIN_LABELS = Object.freeze({
  author: "Autoria",
  learner: "Estudante",
  reviewer: "Pessoa revisora",
  imported: "Importada"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function categoryLabel(value) {
  return CATEGORY_LABELS[value || "none"] || "Sem categoria";
}

export function renderStudyUnitObservationComposer({
  draft = { rawText: "", category: null },
  editingId = null,
  error = "",
  saving = false,
  compact = false,
  studyUnitId = ""
} = {}) {
  const category = draft.category ?? null;
  const categoryTitle = category
    ? `Categoria: ${categoryLabel(category)}`
    : "Escolher categoria";
  const categories = [null, ...COURSE_ANCHORED_ANNOTATION_CATEGORIES].map((value) => {
    const checked = value === category;
    return '<label class="study-observation-category-chip' + (checked ? " is-selected" : "") + '">' +
      '<input type="radio" name="observation-category" data-field="study-unit-observation-category" value="' +
      escapeHtml(value ?? "") + '"' + (checked ? " checked" : "") +
      (saving ? " disabled" : "") + "><span>" + escapeHtml(categoryLabel(value)) + "</span></label>";
  }).join("");
  return '<form class="study-observation-composer' + (compact ? " is-compact" : "") +
    '" data-observation-composer' + (studyUnitId
      ? ' data-study-unit-id="' + escapeHtml(studyUnitId) + '"'
      : "") + ">" +
    (editingId ? '<h3>Editar observação</h3>' : "") +
    '<details class="study-observation-category-disclosure' + (category ? " is-selected" : "") +
    '"><summary title="' + escapeHtml(categoryTitle) + '" aria-label="' +
    escapeHtml(categoryTitle) + '">' + renderUiIcon("tags", "home-tab-icon") + '</summary>' +
    '<div class="study-observation-category-list" role="radiogroup" aria-label="Categoria da observação">' +
    categories + "</div></details>" +
    '<label class="field">' +
    '<textarea data-field="study-unit-observation" class="study-observation-textarea" rows="4" aria-label="Observação"' +
    ' data-max-scalars="' + String(STUDY_UNIT_OBSERVATION_MAX_SCALARS) +
    '" aria-describedby="study-observation-counter' + (error ? ' study-observation-error' : '') +
    '"' + (error ? ' aria-invalid="true"' : '') + ' placeholder="Observação"' +
    (saving ? " disabled" : "") + ">" + escapeHtml(draft.rawText || "") + "</textarea>" +
    '<span class="study-observation-counter visually-hidden" id="study-observation-counter" aria-live="polite">' +
    escapeHtml(formatObservationTextBudget(draft.rawText)) + "</span></label>" +
    (error ? '<p class="field-error" id="study-observation-error" role="alert">' + escapeHtml(error) + "</p>" : "") +
    '<div class="study-observation-composer-actions">' +
    (editingId
      ? '<button type="button" data-observation-action="cancel-edit"' +
        (saving ? " disabled" : "") + ">Cancelar edição</button>"
      : "") +
    '<button type="submit" class="open-mini study-observation-submit" data-observation-action="save"' +
    ' title="' + (saving ? "Salvando observação" : editingId ? "Salvar edição" : "Enviar observação") +
    '" aria-label="' + (saving ? "Salvando observação" : editingId ? "Salvar edição" : "Enviar observação") + '"' +
    (saving ? ' disabled aria-disabled="true"' : "") + ">" +
    renderUiIcon("ready-state", "home-tab-icon") +
    "</button></div></form>";
}

function renderItem(item, { saving, editingId, showContributor }) {
  const withdrawn = item.state === "withdrawn";
  const canRevise = !withdrawn && item.capabilities?.canRevise === true;
  const canWithdraw = !withdrawn && item.capabilities?.canWithdraw === true;
  const syncStatus = item.syncStatus || "synced";
  const selected = item.annotationId === editingId;
  return '<article class="study-observation-item' + (selected ? " is-editing" : "") +
    '" data-observation-id="' + escapeHtml(item.annotationId) + '">' +
    '<header><div class="study-observation-badges">' +
    '<span>' + escapeHtml(categoryLabel(item.category)) + "</span>" +
    '<span data-state="' + escapeHtml(item.state) + '">' +
    escapeHtml(STATE_LABELS[item.state] || item.state) + "</span>" +
    '<span data-sync="' + escapeHtml(syncStatus) + '">' +
    escapeHtml(SYNC_LABELS[syncStatus] || syncStatus) + "</span></div>" +
    (showContributor
      ? '<p class="study-observation-contributor"><strong>' +
        escapeHtml(item.contributor?.label || "Contribuição protegida") + "</strong><span>" +
        escapeHtml(ORIGIN_LABELS[item.provenance?.origin] || "Observação") + "</span></p>"
      : "") +
    (canRevise || canWithdraw || syncStatus === "failed"
      ? '<div class="study-observation-item-actions">' +
        (canRevise
          ? '<button type="button" data-observation-action="edit" data-observation-id="' +
            escapeHtml(item.annotationId) + '" aria-label="Editar observação" title="Editar observação"' +
            (saving ? " disabled" : "") + '>' +
            renderUiIcon("edit", "home-tab-icon") + "</button>"
          : "") +
        (canWithdraw
          ? '<button type="button" data-observation-action="withdraw" data-observation-id="' +
            escapeHtml(item.annotationId) + '" aria-label="Retirar observação" title="Retirar observação"' +
            (saving ? " disabled" : "") + '>' +
            renderUiIcon("trash", "home-tab-icon") + "</button>"
          : "") +
        (syncStatus === "failed"
          ? '<button type="button" data-observation-action="discard-failed" data-observation-id="' +
            escapeHtml(item.annotationId) + '" aria-label="Descartar alteração com falha"' +
            ' title="Descartar alteração com falha"' + (saving ? " disabled" : "") + '>' +
            renderUiIcon("remove-state", "home-tab-icon") + "</button>"
          : "") + "</div>"
      : "") + "</header>" +
    (withdrawn
      ? '<p class="study-observation-withdrawn">Conteúdo retirado.</p>'
      : '<p class="study-observation-text">' + escapeHtml(item.rawText) + "</p>") +
    (!withdrawn && item.ownerResponse
      ? '<aside class="study-observation-owner-response" aria-label="Retorno da autoria">' +
        '<strong>Retorno da autoria</strong><p>' + escapeHtml(item.ownerResponse.text) + "</p></aside>"
      : "") +
    (item.syncError
      ? '<p class="field-error" role="alert">' + escapeHtml(item.syncError) + "</p>"
      : "") + "</article>";
}

export function renderStudyUnitObservationSheet({
  items = [],
  draft = { rawText: "", category: null },
  editingId = null,
  error = "",
  saving = false,
  loading = false,
  stale = false,
  title = "Observações da unidade",
  ariaLabel = "Observações da unidade de estudo",
  listLabel = "Suas observações",
  emptyLabel = "Nenhuma observação nesta unidade de estudo.",
  showContributor = false,
  collectionSummary = null,
  canonicalHref = "",
  showComposer = true,
  composerStudyUnitId = "",
  contextMessage = "",
  actionHref = "",
  actionLabel = "",
  actionControlKey = ""
} = {}) {
  const visibleItems = items.filter((item) => item && typeof item === "object");
  const matchingTotal = Number.isSafeInteger(collectionSummary?.matchingTotal)
    ? collectionSummary.matchingTotal
    : visibleItems.length;
  const activeTotal = Number.isSafeInteger(collectionSummary?.activeTotal)
    ? collectionSummary.activeTotal
    : visibleItems.filter(({ state }) => state !== "withdrawn").length;
  const truncated = collectionSummary?.truncated === true && matchingTotal > visibleItems.length;
  return `<section class="editor-overlay study-observation-overlay" aria-label="${escapeHtml(ariaLabel)}">` +
    '<article class="editor-sheet study-observation-sheet" role="dialog" aria-modal="true"' +
    ' aria-labelledby="study-observation-title">' +
    '<header class="editor-head"><button class="icon-ghost" type="button"' +
    ' data-observation-action="close" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") + "</button>" +
    '<p class="editor-title" id="study-observation-title">' + escapeHtml(title) + "</p>" +
    (activeTotal > 0
      ? '<span class="study-observation-count" aria-label="Quantidade de observações">' +
        String(activeTotal) + "</span>"
      : '<span class="study-observation-head-slot" aria-hidden="true"></span>') + "</header>" +
    '<div class="editor-body study-observation-body">' +
    (stale
      ? '<p class="study-observation-stale" role="status">Há mudanças em outra sessão. Seu texto não foi substituído.</p>'
      : "") +
    (loading
      ? '<p class="study-observation-loading" role="status">Atualizando observações…</p>'
      : "") +
    (contextMessage
      ? `<p class="study-observation-stale" role="status">${escapeHtml(contextMessage)}</p>`
      : "") +
    (actionHref && actionLabel
      ? `<a class="study-observation-review-action" href="${escapeHtml(actionHref)}"` +
        ` data-inspection-route${actionControlKey
          ? ` data-inspection-control-key="${escapeHtml(actionControlKey)}"`
          : ""}>${renderUiIcon("preview", "home-tab-icon")}<span>${escapeHtml(actionLabel)}</span></a>`
      : "") +
    (!showComposer && error
      ? '<p class="field-error" role="alert">' + escapeHtml(error) + "</p>"
      : "") +
    (truncated
      ? '<p class="study-observation-limited" role="status">Exibindo ' +
        String(visibleItems.length) + " de " + String(matchingTotal) +
        " observações correspondentes; " + String(activeTotal) + " ativas. " +
        '<a href="' + escapeHtml(canonicalHref) +
        '" data-inspection-route>Abrir todas na área Observações</a>.</p>'
      : "") +
    (visibleItems.length || (!showComposer && !loading && !error)
      ? '<div class="study-observation-list" aria-label="' + escapeHtml(listLabel) + '">' +
        (visibleItems.length
          ? visibleItems.map((item) => renderItem(item, {
              saving, editingId, showContributor
            })).join("")
          : '<p class="study-observation-empty">' + escapeHtml(emptyLabel) + "</p>") + "</div>"
      : "") +
    (showComposer ? renderStudyUnitObservationComposer({
      draft, editingId, error, saving, studyUnitId: composerStudyUnitId
    }) : "") + "</div></article></section>";
}
