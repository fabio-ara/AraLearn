import { listCourseSourceOccurrenceTargets, resolveCourseSourceOccurrence } from "../domain/courseSourceOccurrences.js";
import { renderPackageInline } from "../resources/sdk/html.js";
import { renderBibliographicReference } from "../ui/renderBibliographicReference.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import { buildCourseAuthoringRoute } from "../ui/courseAuthoringRoute.js";

const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const ROLE_LABELS = {
  curricular_scope: "Escopo do conteúdo", assessment_evidence: "Avaliação",
  technical_conceptual: "Sustentação conceitual", recommended_reading: "Leitura complementar"
};
const OCCURRENCE_FIELDS = ["occurrenceId", "slot", "resourceId", "path", "quote", "prefix", "suffix"];

export function studyCitationMarkers(studyUnit, citations, sourceOptions = {}) {
  return (citations?.citations || []).flatMap((citation, index) => {
    const base = { linkId: citation.linkId, number: index + 1 };
    if (!citation.occurrences?.length) return [];
    return citation.occurrences.map((value) => {
      const occurrence = resolveCourseSourceOccurrence(studyUnit,
        Object.fromEntries(OCCURRENCE_FIELDS.map((field) => [field, value[field]])), sourceOptions);
      return { ...base, occurrenceId: occurrence.occurrenceId,
        target: occurrence.status === "resolved" ? occurrence : null,
        needsReview: occurrence.status === "needs_review" };
    }).filter(marker => marker.target);
  });
}

export function renderStudySourceMarkers(markers) {
  if (!markers.length) return "";
  // Keep the superscript with the preceding word. The joiner stays inside the
  // transient marker group so copying/editing the authored text excludes it.
  return '<span class="source-marker-group">&#8288;' + markers.map(marker =>
    '<button type="button" class="source-marker" data-action="open-citation"' +
    ` data-citation-link-id="${escape(marker.linkId)}" data-citation-occurrence-id="${escape(marker.occurrenceId)}"` +
    ` aria-label="Referência ${marker.number}${marker.needsReview ? ", trecho a revisar" : ""}" title="Referência ${marker.number}">` +
    `<sup>${marker.number}</sup></button>`).join("") + "</span>";
}

function placeAfterQuote(field, occurrence, marker) {
  const template = field.ownerDocument.createElement("template");
  const renderedText = value => {
    if (value === null) return null;
    template.innerHTML = renderPackageInline(value);
    return template.content.textContent;
  };
  const quote = renderedText(occurrence.quote);
  const prefix = renderedText(occurrence.prefix);
  const suffix = renderedText(occurrence.suffix);
  const walker = field.ownerDocument.createTreeWalker(field, 4);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement.closest(".source-marker-group")) nodes.push(node);
  }
  const text = nodes.map(node => node.data).join("");
  const matches = [];
  for (let start = quote ? text.indexOf(quote) : -1; start >= 0; start = text.indexOf(quote, start + 1)) {
    if (prefix !== null && !text.slice(0, start).endsWith(prefix)) continue;
    if (suffix !== null && !text.slice(start + quote.length).startsWith(suffix)) continue;
    matches.push(start + quote.length);
  }
  if (matches.length !== 1) return false;
  let remaining = matches[0];
  for (const node of nodes) {
    if (remaining > node.data.length) { remaining -= node.data.length; continue; }
    const notation = node.parentElement.closest("math, svg");
    if (notation) notation.after(marker);
    else {
      const range = field.ownerDocument.createRange();
      range.setStart(node, remaining); range.collapse(true); range.insertNode(marker);
    }
    return true;
  }
  return false;
}

export function placeStudyCitationMarkers(root, studyUnit, citations, sourceOptions = {}) {
  root.querySelectorAll(".source-marker-group[data-source-marker-placement]").forEach(node => node.remove());
  for (const marker of studyCitationMarkers(studyUnit, citations, sourceOptions).filter(value => value.target)) {
    const instance = [...root.querySelectorAll(".package-instance")].find(node =>
      node.dataset.packageInstanceId === marker.target.resourceId && node.dataset.packageSlot === marker.target.slot);
    if (!instance) continue;
    const fields = [...instance.querySelectorAll("[data-package-manual-field-path]")].filter(node =>
      node.dataset.packageManualFieldPath === encodeURIComponent(marker.target.path));
    const field = fields.at(-1);
    const target = field && !field.closest("svg") ? field : instance;
    const group = root.ownerDocument.createElement("span");
    group.innerHTML = renderStudySourceMarkers([marker]);
    const rendered = group.firstElementChild;
    rendered.dataset.sourceMarkerPlacement = "true";
    rendered.setAttribute("contenteditable", "false");
    if (field?.matches("[data-manual-edit-path]") || instance.closest("[data-manual-target-id]")) {
      rendered.querySelector("button").disabled = true;
    }
    if (target === instance) instance.append(rendered);
    else if (!placeAfterQuote(target, marker.target, rendered)) target.after(rendered);
  }
}

function selectorLabel(selector) {
  if (selector.kind === "page_range") return selector.startPage === selector.endPage ? `p. ${selector.startPage}` : `pp. ${selector.startPage}–${selector.endPage}`;
  if (selector.kind === "time_range") return `${selector.startMilliseconds / 1_000}–${selector.endMilliseconds / 1_000} s`;
  if (selector.kind === "uri_fragment") return `trecho #${selector.fragment}`;
  return `“${selector.exact}”`;
}

function documentFormatIcon(kind, label) {
  return `<span class="study-citation-format" role="img" aria-label="${escape(label)}" title="${escape(label)}">` +
    renderUiIcon(kind === "pdf" ? "book-text" : "cloud", "study-citation-format-icon") + "</span>";
}

function pdfReferenceAction(citation, citationIndex, attachmentIndex, pending, content, anchorIndex = -1) {
  const anchor = citation.anchors?.[anchorIndex];
  const page = anchor?.selector?.kind === "page_range" ? anchor.selector.startPage : "";
  const label = `Abrir ${citation.title || "referência"}${anchor ? ` em ${selectorLabel(anchor.selector)}` : ""}`;
  return '<span class="study-citation-document"><button type="button" class="study-citation-link" data-action="download-citation-attachment"' +
    ` data-citation-index="${citationIndex}" data-attachment-index="${attachmentIndex}" data-citation-page="${page}"` +
    ` data-citation-anchor-index="${anchorIndex}" title="${escape(label)}"${pending ? ' disabled aria-disabled="true"' : ""}>` +
    content + "</button>" + documentFormatIcon("pdf", "Documento PDF") + "</span>";
}

export function renderStudyCitations({ open, loading, value, error, courseId, canAuthorSources,
  downloadPending, downloadError, selectedOccurrenceId = "", formattedReferences = {}, studyUnit = null,
  sourceOptions = {}, contextId = "explanation",
  heading = "Referências" }) {
  if (!open) return "";
  let content;
  if (loading) content = '<p class="study-citations-status" role="status">Carregando fontes…</p>';
  else if (error) content = `<p class="study-citations-status is-error" role="alert">${escape(error)}</p>` + '<button type="button" data-action="retry-citations">Tentar novamente</button>';
  else if (!value?.citations?.length) content = '<p class="study-citations-status">Nenhuma fonte.</p>';
  else content = '<ol class="study-citation-list">' + value.citations.flatMap((citation, citationIndex) => {
    const resolvedOccurrences = studyUnit ? (citation.occurrences || []).map(item => resolveCourseSourceOccurrence(studyUnit,
      Object.fromEntries(OCCURRENCE_FIELDS.map(field => [field, item[field]])), sourceOptions)) : [];
    const occurrence = resolvedOccurrences.find(item => item.occurrenceId === selectedOccurrenceId) ||
      resolvedOccurrences.find(item => item.status === "needs_review");
    const quoteTarget = occurrence && listCourseSourceOccurrenceTargets(studyUnit, sourceOptions).find(target =>
      target.slot === occurrence.slot && target.resourceId === occurrence.resourceId && target.path === occurrence.path);
    const reference = formattedReferences[citation.linkId];
    const references = citation.attachments || [];
    const anchoredHashes = new Set((citation.anchors || []).map(anchor => anchor.contentHash).filter(Boolean));
    const primaryAnchorIndex = (citation.anchors || []).findIndex(anchor => anchor.contentHash &&
      references.some(attachment => attachment.contentHash === anchor.contentHash));
    const primaryAttachmentIndex = primaryAnchorIndex >= 0
      ? references.findIndex(attachment => attachment.contentHash === citation.anchors[primaryAnchorIndex].contentHash)
      : references.length ? 0 : -1;
    const formattedText = reference ? renderBibliographicReference(reference) : citation.citationMode === "manual"
      ? escape(citation.citationText) : "";
    const referenceText = formattedText || escape(citation.title || "Referência sem identificação bibliográfica");
    const linkedReference = primaryAttachmentIndex >= 0
      ? pdfReferenceAction(citation, citationIndex, primaryAttachmentIndex, downloadPending, referenceText, primaryAnchorIndex)
      : citation.url ? `<a class="study-citation-link" href="${escape(citation.url)}" target="_blank" rel="noopener noreferrer">${referenceText}</a>` +
        documentFormatIcon("web", "Fonte na web") : referenceText;
    const anchors = (citation.anchors || []).map((anchor, anchorIndex) => {
      const locator = selectorLabel(anchor.selector);
      const label = anchor.humanLocator && anchor.humanLocator !== locator ? `${anchor.humanLocator} · ${locator}` : locator;
      const attachmentIndex = references.findIndex(attachment => attachment.contentHash === anchor.contentHash);
      return "<li>" + (anchor.contentHash && attachmentIndex >= 0 && anchorIndex !== primaryAnchorIndex
        ? pdfReferenceAction(citation, citationIndex, attachmentIndex, downloadPending, escape(label), anchorIndex)
        : `<span>${escape(label)}</span>` + (anchor.contentHash && attachmentIndex < 0
          ? '<span class="study-citations-status">Documento indisponível para abrir.</span>' : "")) + "</li>";
    }).join("");
    const backlinks = resolvedOccurrences.filter(item => item.status === "resolved")
      .map((item, index) => `<button type="button" class="study-citation-backlink" data-action="return-citation"` +
        ` data-citation-context="${escape(contextId)}" data-citation-link-id="${escape(citation.linkId)}"` +
        ` data-citation-occurrence-id="${escape(item.occurrenceId)}"` +
        ` aria-label="Voltar ao trecho ${index + 1} da referência ${citationIndex + 1}${contextId === "unit" ? " na unidade" : " na explicação"}"` +
        ` title="Voltar ao trecho ${index + 1}">${renderUiIcon("arrow-left", "home-tab-icon")}</button>`).join("");
    const useDetails = (citation.roles || []).length || !citation.occurrences?.length
      ? '<details class="study-citation-info">' +
        `<summary aria-label="Informações sobre o uso da referência ${citationIndex + 1}" title="Uso da referência"><span aria-hidden="true">ⓘ</span></summary>` +
        ((citation.roles || []).length ? `<p>${citation.roles.map(role => escape(ROLE_LABELS[role] || role)).join(" · ")}</p>` : "") +
        (!citation.occurrences?.length ? '<p>Referência do conteúdo; sem trecho específico vinculado.</p>' : "") + "</details>" : "";
    return `<li value="${citationIndex + 1}" data-citation-reference-id="${escape(citation.linkId)}" tabindex="-1"><article>` +
      (occurrence ? `<blockquote class="study-citation-quote">${quoteTarget?.preserveMarkup ? renderPackageInline(occurrence.quote) : escape(occurrence.quote)}</blockquote>` +
        (occurrence.status === "needs_review" ? `<p class="study-citations-status">${quoteTarget ? "O trecho mudou e precisa de revisão." : "O trecho citado não foi localizado nesta cópia."} A referência foi conservada.</p>` : "") : "") +
      `<p class="study-citation-reference">${linkedReference}</p>` +
      (citation.relation === "needs_verification" ? '<p class="study-citations-status">O uso desta fonte ainda precisa ser verificado.</p>' : "") +
      (anchors ? `<ul class="study-citation-locations">${anchors}</ul>` : "") +
      '<div class="study-citation-actions">' + useDetails +
      (citation.url && primaryAttachmentIndex >= 0 ? `<a class="study-citation-web-link" href="${escape(citation.url)}" target="_blank" rel="noopener noreferrer"` +
        ` aria-label="Endereço de ${escape(citation.title || "referência")}" title="Endereço da fonte">${renderUiIcon("cloud", "study-citation-format-icon")}</a>` : "") +
      references.map((attachment, attachmentIndex) => attachmentIndex === primaryAttachmentIndex || anchoredHashes.has(attachment.contentHash) ? "" :
        pdfReferenceAction(citation, citationIndex, attachmentIndex, downloadPending, escape(`${citation.title || "Referência"} · documento ${attachmentIndex + 1}`))).join("") +
      (canAuthorSources ? `<a href="${escape(buildCourseAuthoringRoute(courseId, { section: "sources", sourceId: citation.sourceId }))}" data-study-source-return>Revisar fonte</a>` : "") +
      backlinks +
      "</div></article></li>";
  }).join("") + "</ol>";
  return `<section class="study-bibliography" data-citation-context="${escape(contextId)}" aria-label="${escape(heading)}">` +
    `<h3>${escape(heading)}</h3>${content}` +
    (downloadPending ? '<p class="study-citations-status" role="status">Preparando PDF…</p>' : "") +
    (downloadError ? `<p class="study-citations-status is-error" role="alert">${escape(downloadError)}</p>` : "") + '</section>';
}
