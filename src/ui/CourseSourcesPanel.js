import { createUuid } from "../domain/identifiers.js";
import { normalizeCourseSourceCommand } from "../domain/courseSources.js";
import { renderUiIcon } from "./renderUiIcons.js";
import {
  mergeCourseSourceCatalogPages,
  normalizeCourseSourceChange,
  normalizeCourseSourcesPage
} from "./courseAuthoringViewModel.js";

const CATALOG_PAGE_LIMIT = 10;
const HISTORY_PAGE_LIMIT = 1;
const SOURCE_KINDS = Object.freeze({
  web_page: "Página web",
  article: "Artigo",
  book: "Livro",
  document: "Documento",
  media: "Áudio ou vídeo",
  other: "Outro"
});
const SOURCE_VISIBILITIES = Object.freeze({
  hidden: "Não mostrar no Estudo",
  citation: "Mostrar citação",
  citation_and_link: "Mostrar citação e link"
});
const SOURCE_STATUSES = Object.freeze({
  active: "Ativa",
  retired: "Aposentada",
  unresolved_legacy: "Legado não resolvido"
});
const SELECTOR_KINDS = Object.freeze({
  page_range: "Páginas",
  time_range: "Intervalo de tempo",
  uri_fragment: "Trecho identificado",
  text_quote: "Trecho textual"
});
const SOURCE_RELATIONS = Object.freeze({
  informed_by: "Informou a elaboração",
  supported_by: "Sustenta o conteúdo",
  adapted_from: "Conteúdo adaptado",
  quoted_from: "Citação direta"
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formValueWithinLimit(value, maximum) {
  return value.length <= maximum * 2 && [...value].length <= maximum &&
    new TextEncoder().encode(value).byteLength <= maximum * 4;
}

function optionalFormValue(form, name, label = null, maximum = null) {
  const value = String(form?.elements?.[name]?.value || "").trim();
  if (value && maximum != null && !formValueWithinLimit(value, maximum)) {
    throw new TypeError(`${label} é inválido.`);
  }
  return value || null;
}

function requiredFormValue(form, name, label, maximum = 16_384) {
  const value = optionalFormValue(form, name);
  if (!value) throw new TypeError(`${label} é obrigatório.`);
  if (!formValueWithinLimit(value, maximum)) throw new TypeError(`${label} é inválido.`);
  return value;
}

function literalRequiredFormValue(form, name, label, maximum = 16_384) {
  const value = String(form?.elements?.[name]?.value ?? "");
  if (!value) throw new TypeError(`${label} é obrigatório.`);
  if (!formValueWithinLimit(value, maximum)) throw new TypeError(`${label} é inválido.`);
  return value;
}

function literalOptionalFormValue(form, name, label, maximum = 16_384) {
  const value = String(form?.elements?.[name]?.value ?? "");
  if (!value) return null;
  if (!formValueWithinLimit(value, maximum)) throw new TypeError(`${label} é inválido.`);
  return value;
}

function integerFormValue(form, name, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = String(form?.elements?.[name]?.value || "").trim();
  const value = Number(raw);
  if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} é inválido.`);
  }
  return value;
}

function secondsFormValue(form, name, label) {
  const raw = String(form?.elements?.[name]?.value || "").trim().replace(",", ".");
  const seconds = Number(raw);
  const milliseconds = Math.round(seconds * 1_000);
  if (!raw || !Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(milliseconds) ||
      milliseconds > 2_147_483_647) {
    throw new TypeError(`${label} é inválido.`);
  }
  return milliseconds;
}

function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function ambiguousWriteFailure(error) {
  const rawStatus = error?.status ?? error?.response?.status;
  const status = rawStatus == null || rawStatus === "" ? null : Number(rawStatus);
  const code = String(error?.code || error?.response?.code || "").trim().toLowerCase();
  const message = String(error?.message || "").trim().toLowerCase();
  if (error?.ambiguous === true || error?.name === "AbortError" || error?.name === "TimeoutError") {
    return true;
  }
  if (status != null && Number.isFinite(status)) {
    return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
  if (status === 409 || code.startsWith("invalid_course_source_") ||
      code.startsWith("course_source_") || code === "course_revision_changed") {
    return false;
  }
  return [
    "failed_to_fetch", "gateway_timeout", "network_error", "network_unavailable", "offline",
    "request_timeout", "service_unavailable"
  ].includes(code) || /(?:failed to fetch|fetch failed|network|offline|connection|socket|timeout)/u
    .test(message) || (status == null && !code);
}

function errorMessage(error) {
  if (error instanceof TypeError && error.message) return error.message;
  const code = String(error?.code || "").toLowerCase();
  if (code === "course_revision_changed" || Number(error?.status) === 409) {
    return "O Curso mudou. Recarregue as fontes antes de salvar.";
  }
  if (/offline|network|failed to fetch|connection/iu.test(`${code} ${error?.message || ""}`)) {
    return "Sem conexão para concluir esta operação.";
  }
  return String(error?.message || "Não foi possível concluir esta operação.");
}

function sourceStatusMarkup(source) {
  return `<span class="course-source-status is-${escapeHtml(source.status)}">` +
    `${escapeHtml(SOURCE_STATUSES[source.status] || source.status)}</span>`;
}

function sourceTitle(source) {
  return source.title || source.sourceId;
}

function renderNotice(state) {
  return (state.message
    ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.message)}</p>`
    : "") + (state.failure
    ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>`
    : "") + (state.pendingCommand
    ? '<button type="button" class="course-source-retry" data-source-action="retry-command">' +
      `${renderUiIcon("rotate", "course-authoring-button-icon")}<span>Confirmar a mesma operação</span></button>`
    : "");
}

function renderSourceForm(state) {
  const editor = state.sourceEditor;
  if (!editor) return "";
  const source = editor.source;
  const resolving = source?.status === "unresolved_legacy";
  const values = editor.draft || {
    sourceId: source?.sourceId || "",
    kind: source?.kind === "other" && resolving ? "document" : source?.kind || "web_page",
    title: source?.title || "",
    citationText: source?.citationText || "",
    url: source?.url || "",
    editionOrVersion: source?.editionOrVersion || "",
    studyVisibility: resolving ? "hidden" : source?.studyVisibility || "citation"
  };
  const kindOptions = Object.entries(SOURCE_KINDS).map(([value, label]) =>
    `<option value="${value}"${values.kind === value ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
  const visibilityOptions = Object.entries(SOURCE_VISIBILITIES).map(([value, label]) =>
    `<option value="${value}"${values.studyVisibility === value ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
  return '<form class="course-source-form" data-source-form="source">' +
    `<h3>${source ? resolving ? "Resolver fonte legada" : "Nova revisão da fonte" : "Nova fonte"}</h3>` +
    '<label for="course-source-id">Identidade estável</label>' +
    `<input id="course-source-id" name="sourceId" maxlength="${source ? 4_096 : 480}" required value="${escapeHtml(values.sourceId)}"` +
    `${source ? " readonly" : ""} placeholder="ex.: freire-pedagogia-autonomia">` +
    '<label for="course-source-kind">Tipo</label>' +
    `<select id="course-source-kind" name="kind" required>${kindOptions}</select>` +
    '<label for="course-source-title">Título</label>' +
    `<input id="course-source-title" name="title" maxlength="600" required value="${escapeHtml(values.title)}">` +
    '<label for="course-source-citation">Citação legível</label>' +
    `<textarea id="course-source-citation" name="citationText" maxlength="4096" rows="3"` +
    ` placeholder="Autores, título, ano e publicação">${escapeHtml(values.citationText)}</textarea>` +
    '<div class="course-source-form-grid"><div><label for="course-source-url">Link canônico</label>' +
    `<input id="course-source-url" name="url" type="url" maxlength="4096" value="${escapeHtml(values.url)}"` +
    ' placeholder="https://…"></div><div><label for="course-source-edition">Edição ou versão</label>' +
    `<input id="course-source-edition" name="editionOrVersion" maxlength="240" value="${escapeHtml(values.editionOrVersion)}"></div></div>` +
    '<label for="course-source-visibility">Visibilidade no Estudo</label>' +
    `<select id="course-source-visibility" name="studyVisibility" required>${visibilityOptions}</select>` +
    '<p class="course-source-form-help">A autoria vê o registro completo. O Estudo recebe somente o que esta visibilidade permite.</p>' +
    '<div class="course-source-form-actions"><button type="submit"' +
    `${state.busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}<span>Salvar fonte</span></button>` +
    '<button type="button" data-source-action="cancel-source-form">Cancelar</button></div></form>';
}

function millisecondsToSeconds(value) {
  return Number.isInteger(value) ? String(value / 1_000) : "";
}

function renderAnchorSelectorFields(draft) {
  if (draft.selectorKind === "page_range") {
    return '<div class="course-source-form-grid"><div><label for="course-anchor-start-page">Página inicial</label>' +
      `<input id="course-anchor-start-page" name="startPage" type="number" min="1" max="1000000" required value="${escapeHtml(draft.startPage || "")}"></div>` +
      '<div><label for="course-anchor-end-page">Página final</label>' +
      `<input id="course-anchor-end-page" name="endPage" type="number" min="1" max="1000000" required value="${escapeHtml(draft.endPage || "")}"></div></div>`;
  }
  if (draft.selectorKind === "time_range") {
    return '<div class="course-source-form-grid"><div><label for="course-anchor-start-time">Início (segundos)</label>' +
      `<input id="course-anchor-start-time" name="startTime" inputmode="decimal" required value="${escapeHtml(draft.startTime || "")}"></div>` +
      '<div><label for="course-anchor-end-time">Fim (segundos)</label>' +
      `<input id="course-anchor-end-time" name="endTime" inputmode="decimal" required value="${escapeHtml(draft.endTime || "")}"></div></div>`;
  }
  if (draft.selectorKind === "uri_fragment") {
    return '<label for="course-anchor-fragment">Identificador do trecho, sem #</label>' +
      `<input id="course-anchor-fragment" name="fragment" maxlength="4096" required value="${escapeHtml(draft.fragment || "")}">`;
  }
  return '<label for="course-anchor-exact">Trecho exato</label>' +
    `<textarea id="course-anchor-exact" name="exact" maxlength="8000" rows="3" required>${escapeHtml(draft.exact || "")}</textarea>` +
    '<div class="course-source-form-grid"><div><label for="course-anchor-prefix">Contexto anterior</label>' +
    `<textarea id="course-anchor-prefix" name="prefix" maxlength="1000" rows="2">${escapeHtml(draft.prefix || "")}</textarea></div>` +
    '<div><label for="course-anchor-suffix">Contexto posterior</label>' +
    `<textarea id="course-anchor-suffix" name="suffix" maxlength="1000" rows="2">${escapeHtml(draft.suffix || "")}</textarea></div></div>`;
}

function anchorDraft(anchor = null) {
  const selector = anchor?.selector || { kind: "page_range", startPage: 1, endPage: 1 };
  return {
    selectorKind: selector.kind,
    startPage: selector.startPage || "",
    endPage: selector.endPage || "",
    startTime: millisecondsToSeconds(selector.startMilliseconds),
    endTime: millisecondsToSeconds(selector.endMilliseconds),
    fragment: selector.fragment || "",
    exact: selector.exact || "",
    prefix: selector.prefix || "",
    suffix: selector.suffix || "",
    verificationExcerpt: anchor?.verificationExcerpt || ""
  };
}

function renderAnchorForm(state) {
  const editor = state.anchorEditor;
  if (!editor) return "";
  const draft = editor.draft || anchorDraft(editor.anchor);
  const options = Object.entries(SELECTOR_KINDS).map(([value, label]) =>
    `<option value="${value}"${draft.selectorKind === value ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
  return '<form class="course-source-form" data-source-form="anchor">' +
    `<h4>${editor.anchor ? "Nova revisão da âncora" : "Nova âncora"}</h4>` +
    '<label for="course-anchor-kind">Como localizar</label>' +
    `<select id="course-anchor-kind" name="selectorKind" data-source-anchor-kind required>${options}</select>` +
    renderAnchorSelectorFields(draft) +
    '<label for="course-anchor-excerpt">Trecho para conferência</label>' +
    `<textarea id="course-anchor-excerpt" name="verificationExcerpt" maxlength="4000" rows="3">${escapeHtml(draft.verificationExcerpt)}</textarea>` +
    '<p class="course-source-form-help">Use apenas o trecho mínimo necessário para confirmar a localização.</p>' +
    '<div class="course-source-form-actions"><button type="submit"' +
    `${state.busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}<span>Salvar âncora</span></button>` +
    '<button type="button" data-source-action="cancel-anchor-form">Cancelar</button></div></form>';
}

function selectorLabel(selector) {
  if (selector.kind === "page_range") {
    return selector.startPage === selector.endPage
      ? `Página ${selector.startPage}`
      : `Páginas ${selector.startPage}–${selector.endPage}`;
  }
  if (selector.kind === "time_range") {
    return `${millisecondsToSeconds(selector.startMilliseconds)}–${millisecondsToSeconds(selector.endMilliseconds)} s`;
  }
  if (selector.kind === "uri_fragment") return `Trecho #${selector.fragment}`;
  return `“${selector.exact}”`;
}

function renderAnchor(anchor, sourceRevision, state) {
  const editable = sourceRevision === state.detail?.items?.[0]?.revision && anchor.status === "active";
  return '<article class="course-source-anchor">' +
    `<div><strong>${escapeHtml(selectorLabel(anchor.selector))}</strong>` +
    `<span>Âncora v${anchor.revision} · ${anchor.status === "active" ? "ativa" : "aposentada"}</span></div>` +
    (anchor.verificationExcerpt
      ? `<p>${escapeHtml(anchor.verificationExcerpt)}</p>`
      : '<p class="course-source-empty">Sem trecho adicional de conferência.</p>') +
    (editable ? '<div class="course-source-compact-actions">' +
      `<button type="button" data-source-action="edit-anchor" data-anchor-id="${escapeHtml(anchor.anchorId)}" data-source-revision="${sourceRevision}" aria-label="Revisar âncora" title="Revisar âncora">${renderUiIcon("edit", "course-authoring-button-icon")}</button>` +
      `<button type="button" data-source-action="retire-anchor" data-anchor-id="${escapeHtml(anchor.anchorId)}" data-anchor-revision="${anchor.revision}" aria-label="Aposentar âncora" title="Aposentar âncora">${renderUiIcon("trash", "course-authoring-button-icon")}</button></div>`
      : "") + "</article>";
}

function renderSourceRevision(source, index, state) {
  const current = index === 0;
  const url = safeHttpUrl(source.url);
  return '<article class="course-source-revision">' +
    '<header><div>' + sourceStatusMarkup(source) +
    `<h3>${escapeHtml(sourceTitle(source))}</h3><p>${escapeHtml(source.sourceId)} · revisão ${source.revision}</p></div>` +
    (current && source.status !== "retired" ? '<div class="course-source-compact-actions">' +
      `<button type="button" data-source-action="edit-source" aria-label="${source.status === "unresolved_legacy" ? "Resolver" : "Revisar"} fonte" title="${source.status === "unresolved_legacy" ? "Resolver" : "Revisar"} fonte">${renderUiIcon("edit", "course-authoring-button-icon")}</button>` +
      (source.status === "active"
        ? `<button type="button" data-source-action="retire-source" aria-label="Aposentar fonte" title="Aposentar fonte">${renderUiIcon("trash", "course-authoring-button-icon")}</button>`
        : "") + "</div>" : "") + "</header>" +
    (source.status === "unresolved_legacy"
      ? '<p class="course-source-unresolved">Este identificador foi preservado da migração. Título, autoria, link e âncoras ainda não foram comprovados.</p>'
      : '<dl class="course-source-metadata">' +
        `<div><dt>Tipo</dt><dd>${escapeHtml(SOURCE_KINDS[source.kind] || "Não informado")}</dd></div>` +
        `<div><dt>Citação</dt><dd>${escapeHtml(source.citationText || "Não informada")}</dd></div>` +
        `<div><dt>Edição</dt><dd>${escapeHtml(source.editionOrVersion || "Não informada")}</dd></div>` +
        `<div><dt>Estudo</dt><dd>${escapeHtml(SOURCE_VISIBILITIES[source.studyVisibility])}</dd></div>` +
        `<div><dt>Link</dt><dd>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : escapeHtml(source.url || "Não informado")}</dd></div></dl>`) +
    `<section class="course-source-anchors"><header><div><h4>Âncoras desta revisão</h4><p>${source.anchors.length} carregadas</p></div>` +
    (current && source.status === "active"
      ? '<button type="button" data-source-action="add-anchor">' +
        `${renderUiIcon("add", "course-authoring-button-icon")}<span>Adicionar</span></button>`
      : "") + "</header>" +
    (current ? renderAnchorForm(state) : "") +
    (source.anchors.length
      ? `<div class="course-source-anchor-list">${source.anchors.map((anchor) => renderAnchor(anchor, source.revision, state)).join("")}</div>`
      : '<p class="course-source-empty">Nenhuma âncora nesta revisão.</p>') + "</section></article>";
}

function renderSourceDetail(state) {
  if (state.detailLoading && !state.detail) {
    return '<p class="course-authoring-loading" role="status">Carregando fonte…</p>';
  }
  if (state.detailFailure && !state.detail) {
    return `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.detailFailure)}</p>` +
      '<button type="button" data-source-action="retry-detail">Tentar novamente</button>';
  }
  const items = state.detail?.items || [];
  return '<section class="course-source-detail" aria-labelledby="course-source-detail-title">' +
    '<header class="course-source-detail-heading"><button type="button" data-source-action="close-detail" aria-label="Voltar ao catálogo" title="Voltar ao catálogo">' +
    `${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button><div><p>Fonte versionada</p>` +
    `<h2 id="course-source-detail-title">${escapeHtml(items[0] ? sourceTitle(items[0]) : state.selectedSourceId)}</h2></div></header>` +
    renderNotice(state) + renderSourceForm(state) +
    (items.length
      ? `<div class="course-source-revisions">${items.map((source, index) => renderSourceRevision(source, index, state)).join("")}</div>`
      : '<p class="course-source-empty">A fonte não possui revisões disponíveis.</p>') +
    (state.detail?.nextCursor
      ? `<button type="button" class="course-authoring-more" data-source-action="load-more-revisions"${state.detailLoading ? " disabled" : ""}>` +
        `${renderUiIcon("arrow-down", "course-authoring-button-icon")}<span>${state.detailLoading ? "Carregando…" : "Carregar revisões anteriores"}</span></button>`
      : "") + "</section>";
}

function renderCatalogCard(source, { selectable = false, selected = false } = {}) {
  const action = selectable ? selected ? "" : "add-target-source" : "open-source";
  return `<article class="course-source-card${selected ? " is-selected" : ""}">` +
    `<button type="button"${action ? ` data-source-action="${action}"` : " disabled"} data-source-id="${escapeHtml(source.sourceId)}"` +
    ` aria-label="${selectable ? selected ? "Fonte já vinculada" : "Vincular fonte" : "Abrir fonte"}: ${escapeHtml(sourceTitle(source))}">` +
    '<span class="course-source-card-icon">' + renderUiIcon("study", "course-authoring-icon") +
    '</span><span class="course-source-card-copy">' +
    sourceStatusMarkup(source) + `<strong>${escapeHtml(sourceTitle(source))}</strong>` +
    `<small>${escapeHtml(source.sourceId)} · v${source.revision} · ${source.anchorCount} ${source.anchorCount === 1 ? "âncora" : "âncoras"}</small></span>` +
    (selectable ? selected ? renderUiIcon("save", "course-authoring-arrow") : renderUiIcon("add", "course-authoring-arrow") : renderUiIcon("arrow-right", "course-authoring-arrow")) +
    "</button></article>";
}

function renderCatalog(state, { selectable = false } = {}) {
  if (state.catalogLoading && !state.catalog) {
    return '<p class="course-authoring-loading" role="status">Carregando fontes…</p>';
  }
  if (state.catalogFailure && !state.catalog) {
    return `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.catalogFailure)}</p>` +
      '<button type="button" data-source-action="retry-catalog">Tentar novamente</button>';
  }
  const items = state.catalog?.items || [];
  const selected = new Set(state.sourceLinks.map(({ sourceId }) => sourceId));
  return (items.length
    ? `<div class="course-source-catalog" data-source-count="${items.length}">${items.map((source) =>
        renderCatalogCard(source, { selectable, selected: selected.has(source.sourceId) })).join("")}</div>`
    : '<p class="course-source-empty">Nenhuma fonte cadastrada.</p>') +
    (state.catalog?.nextCursor
      ? `<button type="button" class="course-authoring-more" data-source-action="load-more-sources"${state.catalogLoading ? " disabled" : ""}>` +
        `${renderUiIcon("arrow-down", "course-authoring-button-icon")}<span>${state.catalogLoading ? "Carregando…" : "Carregar mais fontes"}</span></button>`
      : "") + (state.catalogFailure && state.catalog
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.catalogFailure)}</p>`
      : "");
}

function renderCatalogPanel(state) {
  if (state.selectedSourceId) return renderSourceDetail(state);
  return '<section class="course-authoring-section course-sources-panel" aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div><h2 id="course-authoring-section-title">Fontes</h2>' +
    `<p>${state.catalog?.items.length || 0}${state.catalog?.nextCursor ? "+" : ""} carregadas</p></div>` +
    '<button type="button" class="course-source-primary-action" data-source-action="add-source">' +
    `${renderUiIcon("add", "course-authoring-button-icon")}<span>Nova fonte</span></button></header>` +
    '<p class="course-source-intro">Identifique a obra uma vez, registre localizadores exatos e vincule somente o conjunto que sustenta cada item.</p>' +
    renderNotice(state) + renderSourceForm(state) + renderCatalog(state) + "</section>";
}

function sourceForLink(state, link) {
  const pinned = state.targetDetails.get(link.sourceId)?.items.find(({ revision }) =>
    revision === link.sourceRevision);
  if (pinned) return pinned;
  const current = state.catalog?.items.find(({ sourceId }) => sourceId === link.sourceId);
  return current?.revision === link.sourceRevision ? current : null;
}

function anchorsForLink(state, link) {
  return state.targetDetails.get(link.sourceId)?.items
    .find(({ revision }) => revision === link.sourceRevision)?.anchors || [];
}

function currentSourceForLink(state, link) {
  return state.targetCurrentDetails.get(link.sourceId)?.items[0] ||
    state.catalog?.items.find(({ sourceId }) => sourceId === link.sourceId) || null;
}

function currentAnchorsForLink(state, link) {
  return currentSourceForLink(state, link)?.anchors || [];
}

function renderTargetLink(state, link, index) {
  const source = sourceForLink(state, link);
  const currentSource = currentSourceForLink(state, link);
  const anchors = anchorsForLink(state, link);
  const selectedAnchors = new Set(link.anchors.map(({ anchorId }) => anchorId));
  const currentAnchors = new Map(currentAnchorsForLink(state, link)
    .map((anchor) => [anchor.anchorId, anchor]));
  const loading = state.targetDetailsLoading.has(link.sourceId) ||
    state.targetCurrentDetailsLoading.has(link.sourceId);
  const unresolved = source?.status === "unresolved_legacy" || (!source && !loading);
  const stale = !loading && source && (
    currentSource?.status !== "active" || currentSource.revision !== link.sourceRevision ||
    link.anchors.some(({ anchorId, anchorRevision }) => {
      const currentAnchor = currentAnchors.get(anchorId);
      return currentAnchor?.status !== "active" || currentAnchor.revision !== anchorRevision;
    })
  );
  const relationOptions = [
    ...(link.relation === "legacy_reference"
      ? ['<option value="legacy_reference" selected>Legado — escolha uma relação</option>']
      : []),
    ...Object.entries(SOURCE_RELATIONS).map(([value, label]) =>
      `<option value="${value}"${link.relation === value ? " selected" : ""}>${escapeHtml(label)}</option>`)
  ].join("");
  return '<article class="course-source-target-link">' +
    '<header><div>' + (source ? sourceStatusMarkup(source) : "") +
    `<strong>${escapeHtml(source ? sourceTitle(source) : link.sourceId)}</strong>` +
    `<span>${escapeHtml(link.sourceId)} · fonte v${link.sourceRevision}</span></div>` +
    '<div class="course-source-compact-actions">' +
    `<button type="button" data-source-action="move-target-source-up" data-source-id="${escapeHtml(link.sourceId)}"${index === 0 ? " disabled" : ""} aria-label="Mover fonte para cima">${renderUiIcon("arrow-up", "course-authoring-button-icon")}</button>` +
    `<button type="button" data-source-action="move-target-source-down" data-source-id="${escapeHtml(link.sourceId)}"${index === state.sourceLinks.length - 1 ? " disabled" : ""} aria-label="Mover fonte para baixo">${renderUiIcon("arrow-down", "course-authoring-button-icon")}</button>` +
    `<button type="button" data-source-action="remove-target-source" data-source-id="${escapeHtml(link.sourceId)}" aria-label="Remover vínculo">${renderUiIcon("trash", "course-authoring-button-icon")}</button></div></header>` +
    (stale
      ? '<p class="course-authoring-notice is-error">Este vínculo preserva uma revisão histórica. Sem alterações ele continua válido; para mudar o conjunto, remova-o e vincule novamente somente Fonte e Âncoras correntes.</p>'
      : "") +
    `<label class="course-source-relation"><span>Relação com o item</span><select data-source-target-relation data-source-id="${escapeHtml(link.sourceId)}">${relationOptions}</select></label>` +
    (unresolved
      ? '<p class="course-source-unresolved">Vínculo legado preservado sem âncora comprovada. Remova-o ou resolva a fonte no catálogo.</p>'
      : loading
        ? '<p class="course-authoring-loading">Carregando âncoras…</p>'
        : anchors.filter(({ status }) => status === "active").length
          ? '<fieldset class="course-source-anchor-choices"><legend>Âncoras usadas</legend>' +
            anchors.filter(({ status }) => status === "active").map((anchor) =>
              `<label><input type="checkbox" data-source-target-anchor data-source-id="${escapeHtml(link.sourceId)}" data-anchor-id="${escapeHtml(anchor.anchorId)}" data-anchor-revision="${anchor.revision}"${selectedAnchors.has(anchor.anchorId) ? " checked" : ""}>` +
              `<span>${escapeHtml(selectorLabel(anchor.selector))}${selectedAnchors.has(anchor.anchorId) &&
                (currentAnchors.get(anchor.anchorId)?.status !== "active" ||
                 currentAnchors.get(anchor.anchorId)?.revision !== anchor.revision)
                ? " · revisão histórica"
                : ""}</span></label>`).join("") + "</fieldset>"
          : '<p class="course-source-empty">Esta revisão não tem âncora ativa; um vínculo novo exige um localizador exato.</p>') +
    "</article>";
}

function renderTargetPanel(state) {
  const selected = state.sourceLinks.length
    ? `<div class="course-source-target-links">${state.sourceLinks.map((link, index) =>
        renderTargetLink(state, link, index)).join("")}</div>`
    : '<p class="course-source-empty">Nenhuma fonte vinculada. O conjunto vazio será salvo explicitamente.</p>';
  return '<section class="course-source-target-dialog" role="dialog" aria-modal="true" aria-labelledby="course-source-target-title">' +
    '<header><div><p>Atribuição completa</p>' +
    `<h2 id="course-source-target-title">Fontes de ${escapeHtml(state.targetLabel || "este item")}</h2></div>` +
    '<button type="button" data-source-action="close-target" aria-label="Fechar" title="Fechar">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></header>` +
    '<p class="course-source-intro">Salvar substitui o conjunto inteiro deste item. Fontes removidas continuam no histórico.</p>' +
    renderNotice(state) +
    (state.targetLoading
      ? '<p class="course-authoring-loading" role="status">Carregando atribuição…</p>'
      : state.targetFailure
        ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.targetFailure)}</p>` +
          '<button type="button" data-source-action="retry-target">Tentar novamente</button>'
        : '<section class="course-source-selected"><h3>Conjunto atual</h3>' + selected +
          `<button type="button" class="course-source-save-target" data-source-action="save-target"${state.busy ? " disabled" : ""}>` +
          `${renderUiIcon("save", "course-authoring-button-icon")}<span>Salvar conjunto completo</span></button></section>`) +
    '<section class="course-source-available"><h3>Adicionar do catálogo</h3>' +
    renderCatalog(state, { selectable: true }) + "</section></section>";
}

export function renderCourseSourcesPanel(state = {}) {
  return state.mode === "target" ? renderTargetPanel(state) : renderCatalogPanel(state);
}

function assertDependencies(root, controller, options) {
  if (!root || typeof root.addEventListener !== "function") {
    throw new TypeError("Raiz de Fontes inválida.");
  }
  for (const method of ["loadCourseSources", "mutateCourseSources"]) {
    if (typeof controller?.[method] !== "function") {
      throw new TypeError(`Controller de Cursos sem ${method}.`);
    }
  }
  if (!options?.courseId || !Number.isSafeInteger(options.courseRevision) ||
      options.courseRevision < 1 || !["catalog", "target"].includes(options.mode)) {
    throw new TypeError("Contexto de Fontes inválido.");
  }
  if (options.mode === "target" &&
      (!new Set(["plan_item", "study_unit"]).has(options.targetKind) || !options.targetId ||
       !Number.isSafeInteger(options.targetVersion) || options.targetVersion < 1)) {
    throw new TypeError("Alvo de Fontes inválido.");
  }
}

export function createCourseSourcesPanel({
  root,
  controller,
  courseId,
  courseRevision,
  mode = "catalog",
  targetKind = null,
  targetId = null,
  targetVersion = null,
  targetLabel = "",
  confirmValue = globalThis.confirm?.bind(globalThis) || (() => false),
  onCourseRevisionChange = () => {},
  onTargetSaved = () => {},
  onClose = () => {}
} = {}) {
  const options = { courseId, courseRevision, mode, targetKind, targetId, targetVersion };
  assertDependencies(root, controller, options);
  let epoch = 0;
  const state = {
    opened: false,
    mode,
    courseId,
    courseRevision,
    catalog: null,
    catalogLoading: false,
    catalogFailure: "",
    selectedSourceId: "",
    detail: null,
    detailLoading: false,
    detailFailure: "",
    sourceEditor: null,
    anchorEditor: null,
    targetKind,
    targetId,
    targetVersion,
    targetLabel,
    targetHistory: null,
    targetLoading: false,
    targetFailure: "",
    sourceLinks: [],
    initialSourceLinks: [],
    targetDetails: new Map(),
    targetCurrentDetails: new Map(),
    targetDetailsLoading: new Set(),
    targetCurrentDetailsLoading: new Set(),
    busy: false,
    message: "",
    failure: "",
    pendingCommand: null
  };

  function render() {
    if (!state.opened) return;
    root.innerHTML = renderCourseSourcesPanel(state);
  }

  function readOptions(readMode, values = {}) {
    return {
      mode: readMode,
      sourceId: null,
      targetKind: null,
      targetId: null,
      expectedRevision: state.courseRevision,
      limit: readMode === "catalog" ? CATALOG_PAGE_LIMIT : HISTORY_PAGE_LIMIT,
      cursor: null,
      ...values
    };
  }

  async function loadCatalog({ cursor = null, append = false } = {}) {
    const requestEpoch = epoch;
    state.catalogLoading = true;
    state.catalogFailure = "";
    if (!append) state.catalog = null;
    render();
    try {
      const page = normalizeCourseSourcesPage(
        await controller.loadCourseSources(state.courseId, readOptions("catalog", { cursor })),
        {
          expectedCourseId: state.courseId,
          expectedCourseRevision: state.courseRevision,
          expectedMode: "catalog"
        }
      );
      if (!state.opened || requestEpoch !== epoch) return false;
      state.catalog = append && state.catalog
        ? mergeCourseSourceCatalogPages(state.catalog, page)
        : page;
      return true;
    } catch (error) {
      if (!state.opened || requestEpoch !== epoch) return false;
      state.catalogFailure = errorMessage(error);
      return false;
    } finally {
      if (state.opened && requestEpoch === epoch) {
        state.catalogLoading = false;
        render();
      }
    }
  }

  function mergeDetailPages(current, incoming) {
    if (!current) return incoming;
    const items = [...current.items, ...incoming.items];
    if (new Set(items.map(({ revision }) => revision)).size !== items.length) {
      throw new TypeError("A paginação repetiu uma revisão da fonte.");
    }
    return Object.freeze({ ...incoming, items: Object.freeze(items) });
  }

  async function loadDetail(sourceId, {
    cursor = null,
    append = false,
    target = false,
    requiredRevision = null,
    contextualTarget = false,
    currentTarget = false
  } = {}) {
    const requestEpoch = epoch;
    const targetLoading = currentTarget
      ? state.targetCurrentDetailsLoading
      : state.targetDetailsLoading;
    if (target) targetLoading.add(sourceId);
    else {
      state.selectedSourceId = sourceId;
      state.detailLoading = true;
      state.detailFailure = "";
      if (!append) state.detail = null;
    }
    render();
    try {
      const targetContext = contextualTarget
        ? { targetKind: state.targetKind, targetId: state.targetId }
        : {};
      const page = normalizeCourseSourcesPage(
        await controller.loadCourseSources(state.courseId, readOptions("source", {
          sourceId,
          cursor,
          ...targetContext
        })),
        {
          expectedCourseId: state.courseId,
          expectedCourseRevision: state.courseRevision,
          expectedMode: "source",
          expectedSourceId: sourceId,
          ...(contextualTarget ? {
            expectedTargetKind: state.targetKind,
            expectedTargetId: state.targetId
          } : {})
        }
      );
      if (requiredRevision !== null && page.items.length &&
          !page.items.some(({ revision }) => revision === requiredRevision)) {
        throw new TypeError("A revisão vinculada da fonte não corresponde ao alvo.");
      }
      if (!state.opened || requestEpoch !== epoch) return null;
      if (target) {
        if (currentTarget) state.targetCurrentDetails.set(sourceId, page);
        else {
          state.targetDetails.set(sourceId, page);
          if (!contextualTarget) state.targetCurrentDetails.set(sourceId, page);
        }
      }
      else state.detail = append ? mergeDetailPages(state.detail, page) : page;
      return page;
    } catch (error) {
      if (!state.opened || requestEpoch !== epoch) return null;
      if (!target) state.detailFailure = errorMessage(error);
      return null;
    } finally {
      if (state.opened && requestEpoch === epoch) {
        targetLoading.delete(sourceId);
        if (!target) state.detailLoading = false;
        render();
      }
    }
  }

  async function loadTarget() {
    const requestEpoch = epoch;
    state.targetLoading = true;
    state.targetFailure = "";
    render();
    try {
      const page = normalizeCourseSourcesPage(
        await controller.loadCourseSources(state.courseId, readOptions("target", {
          targetKind: state.targetKind,
          targetId: state.targetId
        })),
        {
          expectedCourseId: state.courseId,
          expectedCourseRevision: state.courseRevision,
          expectedMode: "target",
          expectedTargetKind: state.targetKind,
          expectedTargetId: state.targetId
        }
      );
      if (!state.opened || requestEpoch !== epoch) return false;
      state.targetHistory = page;
      const effective = page.items.find(({ effective }) => effective) || null;
      if (effective && effective.targetVersion !== state.targetVersion) {
        throw new TypeError("O item mudou. Feche esta janela e abra as fontes novamente.");
      }
      state.sourceLinks = structuredClone(effective?.sourceLinks || []);
      state.initialSourceLinks = structuredClone(state.sourceLinks);
      void Promise.all(state.sourceLinks.flatMap(({ sourceId, sourceRevision }) => [
        loadDetail(sourceId, {
          target: true,
          requiredRevision: sourceRevision,
          contextualTarget: true
        }),
        loadDetail(sourceId, { target: true, currentTarget: true })
      ]));
      return true;
    } catch (error) {
      if (!state.opened || requestEpoch !== epoch) return false;
      state.targetFailure = errorMessage(error);
      return false;
    } finally {
      if (state.opened && requestEpoch === epoch) {
        state.targetLoading = false;
        render();
      }
    }
  }

  function applyCourseRevision(nextRevision) {
    state.courseRevision = nextRevision;
    onCourseRevisionChange(nextRevision);
  }

  async function refreshAfterChange(change) {
    state.message = change.idempotent
      ? "A operação já estava confirmada."
      : change.changed ? "Alteração salva." : "Nada mudou.";
    state.failure = "";
    state.sourceEditor = null;
    state.anchorEditor = null;
    state.targetDetails.clear();
    state.targetCurrentDetails.clear();
    applyCourseRevision(change.courseRevision);
    if (state.mode === "target") {
      await Promise.all([loadCatalog(), loadTarget()]);
    } else {
      const selectedSourceId = state.selectedSourceId;
      await loadCatalog();
      if (selectedSourceId) await loadDetail(selectedSourceId);
    }
  }

  async function runCommand(command, draft) {
    if (state.busy) return false;
    const matches = state.pendingCommand &&
      JSON.stringify(state.pendingCommand.draft) === JSON.stringify(draft);
    if (!matches) state.pendingCommand = null;
    let pending;
    try {
      pending = matches ? state.pendingCommand : {
        requestId: createUuid(),
        command: normalizeCourseSourceCommand(command),
        draft: structuredClone(draft)
      };
    } catch (error) {
      state.message = "";
      state.failure = errorMessage(error);
      render();
      return false;
    }
    state.pendingCommand = pending;
    state.busy = true;
    state.failure = "";
    state.message = "Salvando…";
    render();
    try {
      const result = normalizeCourseSourceChange(
        await controller.mutateCourseSources({
          requestId: pending.requestId,
          courseId: state.courseId,
          expectedCourseRevision: state.courseRevision,
          command: pending.command
        }),
        { expectedCourseId: state.courseId, expectedRequestId: pending.requestId }
      );
      if (!state.opened) return false;
      state.pendingCommand = null;
      await refreshAfterChange(result);
      if (state.mode === "target") onTargetSaved(result);
      return true;
    } catch (error) {
      if (!state.opened) return false;
      if (!ambiguousWriteFailure(error)) state.pendingCommand = null;
      state.message = "";
      state.failure = ambiguousWriteFailure(error)
        ? `${errorMessage(error)} Confirme novamente para consultar o mesmo requestId.`
        : errorMessage(error);
      return false;
    } finally {
      if (state.opened) {
        state.busy = false;
        render();
      }
    }
  }

  function selectorFromForm(form) {
    const kind = requiredFormValue(form, "selectorKind", "O tipo de âncora", 32);
    if (kind === "page_range") {
      const startPage = integerFormValue(form, "startPage", "A página inicial", {
        minimum: 1,
        maximum: 1_000_000
      });
      const endPage = integerFormValue(form, "endPage", "A página final", {
        minimum: startPage,
        maximum: 1_000_000
      });
      return { kind, startPage, endPage };
    }
    if (kind === "time_range") {
      const startMilliseconds = secondsFormValue(form, "startTime", "O início");
      const endMilliseconds = secondsFormValue(form, "endTime", "O fim");
      if (endMilliseconds <= startMilliseconds) throw new TypeError("O fim deve vir depois do início.");
      return { kind, startMilliseconds, endMilliseconds };
    }
    if (kind === "uri_fragment") {
      const fragment = requiredFormValue(form, "fragment", "O identificador do trecho", 2_048);
      if (fragment.startsWith("#")) throw new TypeError("Informe o identificador sem #.");
      return { kind, fragment };
    }
    if (kind !== "text_quote") throw new TypeError("O tipo de âncora é inválido.");
    return {
      kind,
      exact: literalRequiredFormValue(form, "exact", "O trecho exato", 4_000),
      prefix: optionalFormValue(form, "prefix", "O contexto anterior", 500),
      suffix: optionalFormValue(form, "suffix", "O contexto posterior", 500)
    };
  }

  async function submitSource(form) {
    const existing = state.sourceEditor?.source || null;
    const sourceId = existing
      ? existing.sourceId
      : requiredFormValue(form, "sourceId", "A identidade estável", 240);
    const url = optionalFormValue(form, "url", "O link canônico", 2_048);
    if (url && !safeHttpUrl(url)) throw new TypeError("Use um link HTTPS válido.");
    const source = {
      kind: requiredFormValue(form, "kind", "O tipo", 32),
      title: requiredFormValue(form, "title", "O título", 300),
      citationText: optionalFormValue(form, "citationText", "A citação legível", 2_048),
      url,
      editionOrVersion: optionalFormValue(form, "editionOrVersion", "A edição ou versão", 120),
      studyVisibility: requiredFormValue(form, "studyVisibility", "A visibilidade", 32)
    };
    if (source.studyVisibility !== "hidden" && !source.citationText) {
      throw new TypeError("Informe uma citação para tornar a fonte visível no Estudo.");
    }
    const command = {
      type: "save_source",
      sourceId,
      expectedSourceRevision: existing?.revision || 0,
      source
    };
    return runCommand(command, command);
  }

  async function submitAnchor(form) {
    const source = state.detail?.items?.[0];
    const existing = state.anchorEditor?.anchor || null;
    if (!source || source.status !== "active") throw new TypeError("A fonte ativa não está disponível.");
    const command = {
      type: "save_anchor",
      anchorId: existing?.anchorId || createUuid(),
      sourceId: source.sourceId,
      sourceRevision: source.revision,
      expectedAnchorRevision: existing?.revision || 0,
      selector: selectorFromForm(form),
      verificationExcerpt: literalOptionalFormValue(
        form,
        "verificationExcerpt",
        "O trecho de verificação",
        2_000
      )
    };
    return runCommand(command, command);
  }

  function targetLinksValid() {
    if (JSON.stringify(state.sourceLinks) === JSON.stringify(state.initialSourceLinks)) {
      return true;
    }
    return state.sourceLinks.every((link) => {
      const source = sourceForLink(state, link);
      const currentSource = currentSourceForLink(state, link);
      const currentAnchors = new Map(currentAnchorsForLink(state, link)
        .map((anchor) => [anchor.anchorId, anchor]));
      const activeAnchors = new Map(anchorsForLink(state, link)
        .filter(({ status }) => status === "active")
        .map((anchor) => [anchor.anchorId, anchor.revision]));
      return source?.status === "active" && currentSource?.status === "active" &&
        currentSource.revision === link.sourceRevision &&
        Object.hasOwn(SOURCE_RELATIONS, link.relation) &&
        link.anchors.length >= 1 && link.anchors.length <= 8 &&
        link.anchors.every(({ anchorId, anchorRevision }) => {
          const currentAnchor = currentAnchors.get(anchorId);
          return activeAnchors.get(anchorId) === anchorRevision &&
            currentAnchor?.status === "active" && currentAnchor.revision === anchorRevision;
        });
    });
  }

  root.addEventListener("submit", (event) => {
    if (!state.opened || state.busy) return;
    if (event.target.matches?.('[data-source-form="source"]')) {
      event.preventDefault();
      void submitSource(event.target).catch((error) => {
        state.failure = errorMessage(error);
        render();
      });
    } else if (event.target.matches?.('[data-source-form="anchor"]')) {
      event.preventDefault();
      void submitAnchor(event.target).catch((error) => {
        state.failure = errorMessage(error);
        render();
      });
    }
  });

  root.addEventListener("change", (event) => {
    if (!state.opened) return;
    if (event.target.matches?.("[data-source-anchor-kind]") && state.anchorEditor) {
      state.anchorEditor.draft = {
        ...anchorDraft(state.anchorEditor.anchor),
        selectorKind: event.target.value
      };
      render();
      return;
    }
    if (event.target.matches?.("[data-source-target-anchor]")) {
      const sourceId = String(event.target.dataset.sourceId || "");
      const link = state.sourceLinks.find((item) => item.sourceId === sourceId);
      if (!link) return;
      const anchorId = String(event.target.dataset.anchorId || "");
      const anchorRevision = Number(event.target.dataset.anchorRevision);
      link.anchors = event.target.checked
        ? [...link.anchors.filter((anchor) => anchor.anchorId !== anchorId), { anchorId, anchorRevision }]
        : link.anchors.filter((anchor) => anchor.anchorId !== anchorId);
      state.failure = "";
      render();
      return;
    }
    if (event.target.matches?.("[data-source-target-relation]")) {
      const link = state.sourceLinks.find((item) =>
        item.sourceId === String(event.target.dataset.sourceId || ""));
      if (!link || !Object.hasOwn(SOURCE_RELATIONS, event.target.value)) return;
      link.relation = event.target.value;
      state.failure = "";
      render();
    }
  });

  root.addEventListener("click", (event) => {
    if (!state.opened) return;
    const node = event.target.closest?.("[data-source-action]");
    if (!node || (typeof root.contains === "function" && !root.contains(node))) return;
    event.preventDefault();
    const action = node.dataset.sourceAction;
    if (action === "add-source") {
      state.sourceEditor = { source: null, draft: null };
      state.failure = "";
      render();
    } else if (action === "cancel-source-form") {
      state.sourceEditor = null;
      state.failure = "";
      render();
    } else if (action === "open-source") {
      state.sourceEditor = null;
      state.anchorEditor = null;
      void loadDetail(String(node.dataset.sourceId || ""));
    } else if (action === "close-detail") {
      state.selectedSourceId = "";
      state.detail = null;
      state.detailFailure = "";
      state.sourceEditor = null;
      state.anchorEditor = null;
      render();
    } else if (action === "retry-detail" && state.selectedSourceId) {
      void loadDetail(state.selectedSourceId);
    } else if (action === "load-more-revisions" && state.detail?.nextCursor && !state.detailLoading) {
      void loadDetail(state.selectedSourceId, { cursor: state.detail.nextCursor, append: true });
    } else if (action === "edit-source") {
      const source = state.detail?.items?.[0];
      if (!source) return;
      state.sourceEditor = { source, draft: null };
      state.failure = "";
      render();
    } else if (action === "retire-source") {
      const source = state.detail?.items?.[0];
      if (!source || source.status !== "active" || !confirmValue(
        "Aposentar esta fonte? O histórico e as atribuições existentes serão preservados."
      )) return;
      const command = {
        type: "retire_source",
        sourceId: source.sourceId,
        expectedSourceRevision: source.revision
      };
      void runCommand(command, command);
    } else if (action === "add-anchor") {
      state.anchorEditor = { anchor: null, draft: null };
      state.failure = "";
      render();
    } else if (action === "edit-anchor") {
      const anchorId = String(node.dataset.anchorId || "");
      const sourceRevision = Number(node.dataset.sourceRevision);
      const anchor = state.detail?.items.find(({ revision }) => revision === sourceRevision)
        ?.anchors.find((item) => item.anchorId === anchorId);
      if (!anchor) return;
      state.anchorEditor = { anchor, draft: null };
      state.failure = "";
      render();
    } else if (action === "cancel-anchor-form") {
      state.anchorEditor = null;
      state.failure = "";
      render();
    } else if (action === "retire-anchor") {
      const anchorId = String(node.dataset.anchorId || "");
      const expectedAnchorRevision = Number(node.dataset.anchorRevision);
      if (!confirmValue("Aposentar esta âncora? As atribuições históricas serão preservadas.")) return;
      const command = { type: "retire_anchor", anchorId, expectedAnchorRevision };
      void runCommand(command, command);
    } else if (action === "load-more-sources" && state.catalog?.nextCursor && !state.catalogLoading) {
      void loadCatalog({ cursor: state.catalog.nextCursor, append: true });
    } else if (action === "retry-catalog") {
      void loadCatalog();
    } else if (action === "retry-target") {
      void loadTarget();
    } else if (action === "retry-command" && state.pendingCommand) {
      void runCommand(state.pendingCommand.command, state.pendingCommand.draft);
    } else if (action === "close-target") {
      onClose();
    } else if (action === "add-target-source") {
      const sourceId = String(node.dataset.sourceId || "");
      const source = state.catalog?.items.find((item) => item.sourceId === sourceId);
      if (!source || source.status !== "active" || state.sourceLinks.some((link) =>
        link.sourceId === sourceId)) return;
      if (state.sourceLinks.length >= 32) {
        state.failure = "Cada item aceita no máximo 32 fontes.";
        render();
        return;
      }
      state.sourceLinks.push({
        sourceId,
        sourceRevision: source.revision,
        relation: "supported_by",
        anchors: []
      });
      void loadDetail(sourceId, { target: true, requiredRevision: source.revision });
      render();
    } else if (action === "remove-target-source") {
      const sourceId = String(node.dataset.sourceId || "");
      state.sourceLinks = state.sourceLinks.filter((link) => link.sourceId !== sourceId);
      state.failure = "";
      render();
    } else if (["move-target-source-up", "move-target-source-down"].includes(action)) {
      const sourceId = String(node.dataset.sourceId || "");
      const index = state.sourceLinks.findIndex((link) => link.sourceId === sourceId);
      const target = index + (action.endsWith("up") ? -1 : 1);
      if (index < 0 || target < 0 || target >= state.sourceLinks.length) return;
      [state.sourceLinks[index], state.sourceLinks[target]] =
        [state.sourceLinks[target], state.sourceLinks[index]];
      render();
    } else if (action === "save-target") {
      if (!targetLinksValid()) {
        state.failure = "Cada fonte precisa usar a revisão corrente ativa, ter uma relação explícita e ao menos uma âncora exata. Remova e vincule novamente fontes alteradas; referências legadas devem ser resolvidas ou removidas.";
        render();
        return;
      }
      const command = {
        type: "set_target_sources",
        targetKind: state.targetKind,
        targetId: state.targetId,
        expectedTargetVersion: state.targetVersion,
        sourceLinks: structuredClone(state.sourceLinks)
      };
      void runCommand(command, command);
    }
  });

  async function open() {
    if (state.opened) return true;
    state.opened = true;
    ++epoch;
    render();
    if (state.mode === "target") {
      const [catalog, target] = await Promise.all([loadCatalog(), loadTarget()]);
      return catalog && target;
    }
    return loadCatalog();
  }

  function destroy() {
    state.opened = false;
    ++epoch;
    root.innerHTML = "";
  }

  return Object.freeze({ open, destroy });
}
