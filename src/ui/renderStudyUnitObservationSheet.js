import { COURSE_ANCHORED_ANNOTATION_CATEGORIES, courseObservationTargets } from
  "../domain/courseAnchoredAnnotations.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { filterAuthoringObservations } from "./courseAuthoringObservationQueue.js";
import { renderPackageStudyUnitBlocks } from "../render/renderPackageStudyUnit.js";

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

function renderObservationReviewAction({ actionHref, actionLabel, actionControlKey }) {
  if (!actionHref || !actionLabel) return "";
  return `<a class="study-observation-review-action" href="${escapeHtml(actionHref)}"` +
    ` aria-label="${escapeHtml(actionLabel)}" title="${escapeHtml(actionLabel)}"` +
    ` data-inspection-route${actionControlKey
      ? ` data-inspection-control-key="${escapeHtml(actionControlKey)}"`
      : ""}>${renderUiIcon("preview", "home-tab-icon")}</a>`;
}

export function renderStudyUnitObservationComposer({
  draft = { rawText: "", category: null },
  editingId = null,
  error = "",
  saving = false,
  compact = false,
  studyUnitId = "",
  actionHref = "",
  actionLabel = "",
  actionControlKey = ""
} = {}) {
  const category = draft.category ?? null;
  const categories = [null, ...COURSE_ANCHORED_ANNOTATION_CATEGORIES].map((value) =>
    '<option value="' + escapeHtml(value ?? "") + '"' + (value === category ? " selected" : "") +
    ">" + escapeHtml(categoryLabel(value)) + "</option>"
  ).join("");
  return '<form class="study-observation-composer' + (compact ? " is-compact" : "") +
    '" data-observation-composer' + (studyUnitId
      ? ' data-study-unit-id="' + escapeHtml(studyUnitId) + '"'
      : "") + ">" +
    (editingId ? '<h3>Editar observação</h3>' : "") +
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
    '<label class="study-observation-category-direct"><span class="visually-hidden">Categoria (opcional)</span>' +
    '<select data-field="study-unit-observation-category" aria-label="Categoria da observação (opcional)"' +
    (saving ? " disabled" : "") + ">" + categories + "</select></label>" +
    renderObservationReviewAction({ actionHref, actionLabel, actionControlKey }) +
    '<span class="study-observation-action-spacer" aria-hidden="true"></span>' +
    (editingId
      ? '<button type="button" data-observation-action="cancel-edit" title="Cancelar edição" aria-label="Cancelar edição"' +
        (saving ? " disabled" : "") + ">" + renderUiIcon("remove-state", "home-tab-icon") + "</button>"
      : "") +
    '<button type="submit" class="open-mini study-observation-submit" data-observation-action="save"' +
    ' title="' + (saving ? "Salvando observação" : editingId ? "Salvar edição" : "Enviar observação") +
    '" aria-label="' + (saving ? "Salvando observação" : editingId ? "Salvar edição" : "Enviar observação") + '"' +
    (saving ? ' disabled aria-disabled="true"' : "") + ">" +
    renderUiIcon("ready-state", "home-tab-icon") +
    "</button></div></form>";
}

function comparisonSnapshot(snapshot) {
  if (!snapshot) return '<p>Conteúdo anterior indisponível neste registro legado.</p>';
  const content = snapshot.content;
  let rendered;
  if (Array.isArray(content.content)) {
    const unit = { id: content.id || 'comparison', position: content.position || 1, title: content.title || 'Conteúdo',
      role: content.role || 'theory', content: content.content, response: content.response || null, feedback: content.feedback || [], topics: content.topics || [] };
    try { rendered = renderPackageStudyUnitBlocks(unit, { revealPracticeAnswers: true, blockKeyPrefix: `comparison:${snapshot.hash}` }); }
    catch { rendered = '<p>Este conteúdo usa um formato anterior. Os textos preservados aparecem abaixo.</p>' +
      [...unit.content, ...(unit.response ? [unit.response] : []), ...unit.feedback].map(instance => '<p>' +
        escapeHtml([instance.data?.text, instance.data?.question, instance.data?.answer, ...(instance.data?.options || []).map(option => option.text)].filter(Boolean).join('\n')) + '</p>').join(''); }
  } else rendered = '<p>' + escapeHtml(content.text || '') + '</p>';
  return '<div class="study-observation-comparison-content">' + (content.title ? `<h5>${escapeHtml(content.title)}</h5>` : '') + rendered + '</div>' +
    (snapshot.sourceLinks.length ? '<details><summary>Fontes e citações</summary>' + snapshot.sourceLinks.map(link => {
      const source = snapshot.sources.find(value => (value.source_id || value.sourceId) === link.sourceId) || {};
      const anchors = (link.anchors || []).map(selected => source.anchors?.find(value => (value.anchor_id || value.anchorId) === selected.anchorId)).filter(Boolean);
      const relation = ({quoted_from: 'Citação direta', adapted_from: 'Adaptado da fonte', based_on: 'Baseado na fonte', needs_verification: 'Relação a verificar'})[link.relation] || 'Referência vinculada';
      const people = source.authors?.map(author => author.literal || [author.given, author.family].filter(Boolean).join(' ')).join('; ');
      return '<article><strong>' + escapeHtml(source.title || source.metadata?.title || 'Fonte preservada') + '</strong>' +
        '<p>' + escapeHtml([source.citation_text || source.formattedReference, people || source.authorship, source.publication_date, source.edition_or_version, source.identifier, source.url].filter(Boolean).join(' · ')) + '</p><p>' + escapeHtml(relation) + '</p>' +
        anchors.map(anchor => '<blockquote>' + escapeHtml(anchor.verification_excerpt || anchor.excerpt || '') + '</blockquote><p>' +
          escapeHtml(anchor.selector?.kind === 'page_range' ? `Páginas ${anchor.selector.startPage}–${anchor.selector.endPage}` :
            anchor.selector?.heading || anchor.selector?.quote || anchor.selector?.label || '') + '</p>').join('') +
        (link.occurrences || []).map(occurrence => '<p>' + escapeHtml(typeof occurrence.quote === 'string' ? occurrence.quote : occurrence.quote?.exact || '') + '</p>').join('') + '</article>';
    }).join('') + '</details>' : '');
}
export function renderObservationComparison(target) {
  return '<div class="study-observation-comparison"><section><h4>Antes</h4>' + comparisonSnapshot(target.basis) +
    '</section><section><h4>Vigente</h4>' + comparisonSnapshot(target.current) + '</section></div>';
}
export function renderObservationIncidences(item, { saving = false, availableTargets = [], selectedTargetKeysByAnnotation = {} } = {}) {
  if (!item.targetSetVersion) return '<p>Registro legado: ' + escapeHtml((item.target.currentPath || item.target.observedPath || []).map(entry => entry.label).filter(Boolean).join(' › ')) +
    '. A decisão deste registro continua disponível na área Observações.</p>' + (item.deepLink ? `<a href="${escapeHtml(item.deepLink)}" data-inspection-route>Revisar registro legado</a>` : '');
  const targets = courseObservationTargets(item);
  const disabled = saving ? ' disabled' : '';
  const pending = targets.filter(t => t.state === 'pending');
  const paths = target => (target.path || target.currentPath || target.observedPath || [])
    .map(entry => entry.label).filter(Boolean).join(' › ') || target.id;
  return '<fieldset class="study-observation-targets"><legend>Alvos desta observação</legend>' +
    targets.map(target => '<div class="study-observation-target">' +
      '<label><input type="checkbox" data-observation-target-select data-observation-id="' + escapeHtml(item.annotationId) +
      '" data-observation-target-key="' + escapeHtml(`${target.kind}:${target.id}`) + '"' +
      (target.state === 'pending' ? (selectedTargetKeysByAnnotation[item.annotationId]?.includes(`${target.kind}:${target.id}`) ?? true ? ' checked' : '') + disabled : ' disabled') + '><span>' + escapeHtml(paths(target)) +
      (target.kind === 'microsequence_explanation' ? ' · Explicação' : '') + '</span></label>' +
      (target.state !== 'pending' ? '<small>' + (target.state === 'approved' ? 'Aprovado' : 'Encerrado sem alteração') + '</small>' :
        '<details><summary>Comparar antes e vigente</summary><div data-observation-comparison>' +
        (target.basis?.deferred || target.current?.deferred ? `<button type="button" data-observation-action="compare" data-observation-id="${escapeHtml(item.annotationId)}" data-observation-target-key="${escapeHtml(`${target.kind}:${target.id}`)}">Carregar comparação deste alvo</button>` : renderObservationComparison(target)) + '</div></details>') + '</div>').join('') +
    '</fieldset>' + (pending.length && item.targetSetVersion ? '<div class="study-observation-decisions">' +
      `<button type="button" data-observation-action="approve" data-observation-id="${escapeHtml(item.annotationId)}"${disabled}>Aprovar alvos selecionados</button>` +
      `<button type="button" data-observation-action="cancel" data-observation-id="${escapeHtml(item.annotationId)}"${disabled}>Encerrar sem alteração</button>` +
      '</div><small>Encerrar mantém o conteúdo vigente e retira somente a pendência selecionada.</small>' : '') +
    (availableTargets.length && item.targetSetVersion ? '<details class="study-observation-target-editor"><summary>Alterar alvos</summary>' +
      '<select multiple data-observation-retarget="' + escapeHtml(item.annotationId) + '" aria-label="Alvos da observação"' + disabled + '>' +
      availableTargets.map(target => `<option value="${escapeHtml(`${target.kind}:${target.id}`)}"` +
        (pending.some(t => t.kind === target.kind && t.id === target.id) ? ' selected' : '') + '>' + escapeHtml(target.label || target.id) + '</option>').join('') + '</select>' +
      `<button type="button" data-observation-action="retarget" data-observation-id="${escapeHtml(item.annotationId)}"${disabled}>Salvar alvos</button>` +
      '<small>Retirar um alvo não restaura seu conteúdo. Para retirar todos, encerre a observação.</small></details>' : '');
}

function renderItem(item, { saving, editingId, showContributor, authoringQueue, availableTargets, selectedObservationIds, selectedTargetKeysByAnnotation }) {
  const withdrawn = item.state === "withdrawn";
  const canRevise = !withdrawn && item.capabilities?.canRevise === true;
  const canWithdraw = !authoringQueue && !withdrawn && item.capabilities?.canWithdraw === true;
  const syncStatus = item.syncStatus || "synced";
  const selected = item.annotationId === editingId;
  return '<article class="study-observation-item' + (selected ? " is-editing" : "") +
    '" data-observation-id="' + escapeHtml(item.annotationId) + '" data-observation-version="' + item.annotationVersion + '">' +
    '<header><div class="study-observation-badges">' +
    '<span>' + escapeHtml(categoryLabel(item.category)) + "</span>" +
    '<span data-state="' + escapeHtml(item.state) + '">' +
    escapeHtml(STATE_LABELS[item.state] || item.state) + "</span>" +
    '<span data-sync="' + escapeHtml(syncStatus) + '">' +
    escapeHtml(SYNC_LABELS[syncStatus] || syncStatus) + "</span></div>" +
    (authoringQueue && item.targetSetVersion ? `<label><input type="checkbox" data-observation-select data-observation-id="${escapeHtml(item.annotationId)}" aria-label="Selecionar observação"${selectedObservationIds.includes(item.annotationId) ? ' checked' : ''}${saving ? ' disabled' : ''}>Selecionar</label>` : '') +
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
      : "") + (authoringQueue ? renderObservationIncidences(item, { saving, availableTargets, selectedTargetKeysByAnnotation }) : '') + "</article>";
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
  actionControlKey = "",
  authoringQueue = false,
  pending = false,
  recoveryExpired = false,
  availableTargets = [],
  selectedTargets = [],
  filters = {},
  selectedObservationIds = [],
  selectedTargetKeysByAnnotation = {},
  cancelReason = "withdrawal"
} = {}) {
  const visibleItems = filterAuthoringObservations(items.filter((item) => item && typeof item === "object"), filters);
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
    '<header class="editor-head">' +
    (activeTotal > 0
      ? '<span class="study-observation-count" aria-label="Quantidade de observações">' +
        String(activeTotal) + "</span>"
      : '<span class="study-observation-head-slot" aria-hidden="true"></span>') +
    '<p class="editor-title" id="study-observation-title">' + escapeHtml(title) + "</p>" +
    '<button class="icon-ghost" type="button" data-observation-action="close" title="Fechar" aria-label="Fechar">' +
    renderUiIcon("remove-state", "home-tab-icon") + "</button></header>" +
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
    (authoringQueue ? '<div class="study-observation-central-controls"><button type="button" data-observation-action="refresh" aria-label="Atualizar central"' + (saving ? ' disabled' : '') + '>Atualizar</button>' +
      (pending ? '<button type="button" data-observation-action="retry">Retomar envio pendente</button>' : '') +
      (recoveryExpired ? '<button type="button" data-observation-action="abandon-expired">Encerrar tentativa antiga e conservar rascunho</button>' : '') +
      '<label>Filtrar por alvo<select data-observation-filter="target"><option value="">Todos os alvos</option>' +
      availableTargets.map(target => `<option value="${escapeHtml(`${target.kind}:${target.id}`)}"${filters.target === `${target.kind}:${target.id}` ? ' selected' : ''}>${escapeHtml(target.label || target.id)}</option>`).join('') + '</select></label>' +
      '<label>Filtrar por categoria<select data-observation-filter="category"><option value="">Todas as categorias</option>' +
      ["none", ...COURSE_ANCHORED_ANNOTATION_CATEGORIES].map(value => `<option value="${value}"${filters.category === value ? ' selected' : ''}>${escapeHtml(categoryLabel(value))}</option>`).join('') + '</select></label>' +
      `<p data-observation-filter-count>${visibleItems.length} apresentadas · ${matchingTotal} pendentes no curso</p>` +
      (visibleItems.some(item => !item.targetSetVersion) ? '<p>O lote abaixo abrange somente os alvos com decisão nesta central. Registros legados estruturais têm acesso próprio na lista.</p>' : '') +
      '<label>Encerramento por <select data-observation-cancel-reason>' +
      Object.entries({withdrawal: 'Retirada', test: 'Teste', mistake: 'Engano', superseded: 'Duplicidade ou superação', answered: 'Dúvida respondida', keep_current: 'Manter conteúdo'})
        .map(([value, label]) => `<option value="${value}"${cancelReason === value ? ' selected' : ''}>${label}</option>`).join('') + '</select></label>' +
      '<div>' + Object.entries({'approve-selected': 'Aprovar selecionadas', 'cancel-selected': 'Encerrar selecionadas', 'approve-all': 'Aprovar todas apresentadas', 'cancel-all': 'Encerrar todas apresentadas'})
        .map(([action, label]) => `<button type="button" data-observation-action="${action}"${saving ? ' disabled' : ''}>${label}</button>`).join('') + '</div></div>' : '') +
    (!showComposer && actionHref && actionLabel
      ? renderObservationReviewAction({ actionHref, actionLabel, actionControlKey })
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
              saving, editingId, showContributor, authoringQueue, availableTargets, selectedObservationIds, selectedTargetKeysByAnnotation
            })).join("")
          : '<p class="study-observation-empty">' + escapeHtml(emptyLabel) + "</p>") + "</div>"
      : "") +
    (showComposer && authoringQueue && !editingId && availableTargets.length ? '<label class="study-observation-new-targets">Alvos da nova observação' +
      '<select multiple data-observation-new-targets aria-label="Alvos da nova observação">' + availableTargets.map(target =>
        `<option value="${escapeHtml(`${target.kind}:${target.id}`)}"${selectedTargets.some(t => t.kind === target.kind && t.id === target.id) ? ' selected' : ''}>${escapeHtml(target.label || target.id)}</option>`).join('') + '</select></label>' : '') +
    (showComposer ? renderStudyUnitObservationComposer({
      draft, editingId, error, saving, studyUnitId: composerStudyUnitId,
      actionHref, actionLabel, actionControlKey
    }) : "") + "</div></article></section>";
}
