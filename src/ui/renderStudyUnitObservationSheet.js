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

const CATEGORY_LABELS = Object.freeze({
  none: "Sem categoria",
  question: "Dúvida",
  possible_error: "Possível erro",
  confusing: "Trecho confuso",
  suggestion: "Sugestão"
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
  human_audit: "Auditoria humana",
  automatic_audit: "Auditoria automática",
  unknown_legacy: "Origem legada"
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
  title = "Observações",
  listLabel = "Suas observações",
  emptyLabel = "Nenhuma observação nesta Unidade.",
  showContributor = false,
  collectionSummary = null,
  canonicalHref = ""
} = {}) {
  const category = draft.category ?? null;
  const categories = [null, ...COURSE_ANCHORED_ANNOTATION_CATEGORIES].map((value) => {
    const checked = value === category;
    return '<label class="study-observation-category-chip' + (checked ? " is-selected" : "") + '">' +
      '<input type="radio" name="observation-category" data-field="study-unit-observation-category" value="' +
      escapeHtml(value ?? "") + '"' + (checked ? " checked" : "") +
      (saving ? " disabled" : "") + "><span>" + escapeHtml(categoryLabel(value)) + "</span></label>";
  }).join("");
  const visibleItems = items.filter((item) => item && typeof item === "object");
  const matchingTotal = Number.isSafeInteger(collectionSummary?.matchingTotal)
    ? collectionSummary.matchingTotal
    : visibleItems.length;
  const activeTotal = Number.isSafeInteger(collectionSummary?.activeTotal)
    ? collectionSummary.activeTotal
    : visibleItems.filter(({ state }) => state !== "withdrawn").length;
  const truncated = collectionSummary?.truncated === true && matchingTotal > visibleItems.length;
  return '<section class="editor-overlay study-observation-overlay" aria-label="Observações da Unidade de estudo">' +
    '<article class="editor-sheet study-observation-sheet" role="dialog" aria-modal="true"' +
    ' aria-labelledby="study-observation-title">' +
    '<header class="editor-head"><button class="icon-ghost" type="button"' +
    ' data-observation-action="close" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") + "</button>" +
    '<p class="editor-title" id="study-observation-title">' + escapeHtml(title) + "</p>" +
    '<span class="study-observation-count" aria-label="Quantidade de observações">' +
    String(activeTotal) + "</span></header>" +
    '<div class="editor-body study-observation-body">' +
    (stale
      ? '<p class="study-observation-stale" role="status">Há mudanças em outra sessão. Seu texto não foi substituído.</p>'
      : "") +
    (loading
      ? '<p class="study-observation-loading" role="status">Atualizando observações…</p>'
      : "") +
    (truncated
      ? '<p class="study-observation-limited" role="status">Exibindo ' +
        String(visibleItems.length) + " de " + String(matchingTotal) +
        " observações correspondentes; " + String(activeTotal) + " ativas. " +
        '<a href="' + escapeHtml(canonicalHref) +
        '" data-inspection-route>Abrir todas na área Observações</a>.</p>'
      : "") +
    '<div class="study-observation-list" aria-label="' + escapeHtml(listLabel) + '">' +
    (visibleItems.length
      ? visibleItems.map((item) => renderItem(item, {
          saving, editingId, showContributor
        })).join("")
      : '<p class="study-observation-empty">' + escapeHtml(emptyLabel) + "</p>") + "</div>" +
    '<form class="study-observation-composer" data-observation-composer>' +
    '<h3>' + (editingId ? "Editar observação" : "Nova observação") + "</h3>" +
    '<div class="study-observation-category-list" role="radiogroup" aria-label="Categoria da observação">' +
    categories + "</div>" +
    '<label class="field"><span class="sr-only">Texto da observação</span>' +
    '<textarea data-field="study-unit-observation" class="study-observation-textarea" aria-label="Observação"' +
    ' data-max-scalars="' + String(STUDY_UNIT_OBSERVATION_MAX_SCALARS) +
    '" aria-describedby="study-observation-counter" placeholder="Escreva uma observação curta."' +
    (saving ? " disabled" : "") + ">" + escapeHtml(draft.rawText || "") + "</textarea>" +
    '<span class="study-observation-counter" id="study-observation-counter" aria-live="polite">' +
    escapeHtml(formatObservationTextBudget(draft.rawText)) + "</span></label>" +
    (error ? '<p class="field-error" role="alert">' + escapeHtml(error) + "</p>" : "") +
    '<div class="study-observation-composer-actions">' +
    (editingId
      ? '<button type="button" data-observation-action="cancel-edit"' +
        (saving ? " disabled" : "") + ">Cancelar edição</button>"
      : "") +
    '<button type="submit" class="open-mini" data-observation-action="save"' +
    (saving ? ' disabled aria-disabled="true"' : "") + ">" +
    renderUiIcon("ready-state", "home-tab-icon") +
    "<span>" + (saving ? "Salvando…" : editingId ? "Salvar edição" : "Adicionar") +
    "</span></button></div></form></div></article></section>";
}
