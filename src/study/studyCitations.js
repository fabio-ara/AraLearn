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

export function studyCitationMarkers(studyUnit, citations) {
  return (citations?.citations || []).flatMap((citation, index) => {
    const base = { linkId: citation.linkId, number: index + 1 };
    if (!citation.occurrences?.length) return [{ ...base, occurrenceId: "", target: null }];
    return citation.occurrences.map((value) => {
      const occurrence = resolveCourseSourceOccurrence(studyUnit,
        Object.fromEntries(OCCURRENCE_FIELDS.map((field) => [field, value[field]])));
      return { ...base, occurrenceId: occurrence.occurrenceId,
        target: occurrence.status === "resolved" ? occurrence : null,
        needsReview: occurrence.status === "needs_review" };
    });
  });
}

export function renderStudySourceMarkers(markers) {
  if (!markers.length) return "";
  return '<span class="source-marker-group">' + markers.map(marker =>
    '<button type="button" class="source-marker" data-action="open-citation"' +
    ` data-citation-link-id="${escape(marker.linkId)}" data-citation-occurrence-id="${escape(marker.occurrenceId)}"` +
    ` aria-label="Referência ${marker.number}${marker.needsReview ? ", trecho a revisar" : ""}" title="Referência ${marker.number}">` +
    `<sup>${marker.number}</sup></button>`).join("") + "</span>";
}

export function placeStudyCitationMarkers(root, studyUnit, citations) {
  root.querySelectorAll(".source-marker-group[data-source-marker-placement]").forEach(node => node.remove());
  for (const marker of studyCitationMarkers(studyUnit, citations).filter(value => value.target)) {
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
    if (target === instance) instance.append(rendered);
    else target.after(rendered);
  }
}

function selectorLabel(selector) {
  if (selector.kind === "page_range") return selector.startPage === selector.endPage ? `p. ${selector.startPage}` : `pp. ${selector.startPage}–${selector.endPage}`;
  if (selector.kind === "time_range") return `${selector.startMilliseconds / 1_000}–${selector.endMilliseconds / 1_000} s`;
  if (selector.kind === "uri_fragment") return `trecho #${selector.fragment}`;
  return `“${selector.exact}”`;
}

function pdfButton(citation, citationIndex, attachmentIndex, pending, anchor = null) {
  const page = anchor?.selector?.kind === "page_range" ? anchor.selector.startPage : "";
  const label = anchor ? `Abrir PDF em ${selectorLabel(anchor.selector)}` : `Abrir PDF ${attachmentIndex + 1}`;
  return '<button class="study-citation-download" type="button" data-action="download-citation-attachment"' +
    ` data-citation-index="${citationIndex}" data-attachment-index="${attachmentIndex}" data-citation-page="${page}"` +
    ` aria-label="${escape(label)}${citation.title ? ` de ${escape(citation.title)}` : ""}"${pending ? " disabled" : ""}>` +
    renderUiIcon("download", "home-tab-icon") + `<span>${escape(label)}</span></button>`;
}

export function renderStudyCitations({ open, loading, value, error, courseId, canAuthorSources,
  downloadPending, downloadError, selectedLinkId = "", selectedOccurrenceId = "", formattedReferences = {}, studyUnit = null }) {
  if (!open) return "";
  let content;
  if (loading) content = '<p class="study-citations-status" role="status">Carregando fontes…</p>';
  else if (error) content = `<p class="study-citations-status is-error" role="alert">${escape(error)}</p>` + '<button type="button" data-action="retry-citations">Tentar novamente</button>';
  else if (!value?.citations?.length) content = '<p class="study-citations-status">Nenhuma fonte.</p>';
  else content = '<ol class="study-citation-list">' + value.citations.flatMap((citation, citationIndex) => {
    if (selectedLinkId && citation.linkId !== selectedLinkId) return [];
    const occurrence = citation.occurrences?.find(item => item.occurrenceId === selectedOccurrenceId);
    const quoteTarget = occurrence && listCourseSourceOccurrenceTargets(studyUnit).find(target =>
      target.slot === occurrence.slot && target.resourceId === occurrence.resourceId && target.path === occurrence.path);
    const reference = formattedReferences[citation.linkId];
    const references = citation.attachments || [];
    const anchoredHashes = new Set((citation.anchors || []).map(anchor => anchor.contentHash).filter(Boolean));
    const anchors = (citation.anchors || []).map(anchor => {
      const locator = selectorLabel(anchor.selector);
      const label = anchor.humanLocator && anchor.humanLocator !== locator ? `${anchor.humanLocator} · ${locator}` : locator;
      const attachmentIndex = references.findIndex(attachment => attachment.contentHash === anchor.contentHash);
      return `<li><span>${escape(label)}</span>` + (anchor.contentHash && attachmentIndex >= 0
        ? pdfButton(citation, citationIndex, attachmentIndex, downloadPending, anchor)
        : anchor.contentHash ? '<span class="study-citations-status">PDF indisponível para abrir.</span>' : "") + "</li>";
    }).join("");
    return `<li value="${citationIndex + 1}"><article>` +
      `<h3>${escape(citation.title || "Referência")}</h3>` +
      (occurrence ? `<blockquote class="study-citation-quote">${quoteTarget?.preserveMarkup ? renderPackageInline(occurrence.quote) : escape(occurrence.quote)}</blockquote>` +
        (occurrence.status === "needs_review" ? '<p class="study-citations-status">O trecho mudou e precisa de revisão. A referência foi conservada.</p>' : "") : "") +
      `<p class="study-citation-reference">${reference ? renderBibliographicReference(reference) : citation.citationMode === "manual"
        ? escape(citation.citationText) : '<span role="status">Preparando referência…</span>'}</p>` +
      ((citation.roles || []).length ? `<p class="study-citation-roles">${citation.roles.map(role => escape(ROLE_LABELS[role] || role)).join(" · ")}</p>` : "") +
      (citation.relation === "needs_verification" ? '<p class="study-citations-status">O uso desta fonte ainda precisa ser verificado.</p>' : "") +
      (anchors ? `<ul class="study-citation-locations">${anchors}</ul>` : "") +
      '<div class="study-citation-actions">' +
      (citation.url ? `<a href="${escape(citation.url)}" target="_blank" rel="noopener noreferrer">Abrir fonte</a>` : "") +
      references.map((attachment, attachmentIndex) => anchoredHashes.has(attachment.contentHash) ? "" : pdfButton(citation, citationIndex, attachmentIndex, downloadPending)).join("") +
      (canAuthorSources ? `<a href="${escape(buildCourseAuthoringRoute(courseId, { section: "sources", sourceId: citation.sourceId }))}" data-study-source-return>Revisar fonte</a>` : "") +
      "</div></article></li>";
  }).join("") + "</ol>";
  return '<section class="editor-overlay study-citations-overlay">' +
    '<article class="editor-sheet study-citations-panel" role="dialog" aria-modal="true" aria-labelledby="study-citations-title">' +
    '<header class="editor-head"><button class="icon-ghost" type="button" data-action="toggle-citations" aria-label="Fechar fontes" title="Fechar fontes">' +
    renderUiIcon("remove-state", "home-tab-icon") + `</button><h2 id="study-citations-title">${selectedLinkId ? "Referência" : "Fontes"}</h2></header>` +
    `<div class="editor-body study-citations-body">${content}` +
    (downloadPending ? '<p class="study-citations-status" role="status">Preparando PDF…</p>' : "") +
    (downloadError ? `<p class="study-citations-status is-error" role="alert">${escape(downloadError)}</p>` : "") + "</div></article></section>";
}
