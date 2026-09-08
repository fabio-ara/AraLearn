import { normalizeMicrosequenceExplanation } from "../domain/courseExplanation.js";
import { listCourseSourceOccurrenceTargets, resolveCourseSourceOccurrences } from "../domain/courseSourceOccurrences.js";
import { formatCourseSourceReference } from "../domain/courseSourceReference.js";
import { renderPackageStudyUnitBlocks } from "../render/renderPackageStudyUnit.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { escapePackageHtml as escape } from "../resources/sdk/html.js";
import { renderUiIcon } from "../ui/renderUiIcons.js";
import { captureRenderState, restoreRenderState } from "../ui/renderState.js";
import { publicErrorMessage } from "../ui/publicErrorMessage.js";
import { placeStudyCitationMarkers, renderStudyCitations, renderStudySourceMarkers, studyCitationMarkers } from "./studyCitations.js";
import { createStudyTools, openStudyResourceUrl, renderStudyToolActions } from "./studyTools.js";

const SOURCE_OPTIONS = Object.freeze({ targetKind: "microsequence_explanation" });
const contentSignature = value => JSON.stringify(value && {
  courseId: value.courseId, courseRevision: value.courseRevision, microsequenceId: value.microsequenceId,
  explanation: value.explanation, contentReview: value.contentReview
});

/** Apenas entrada de apresentação para o renderer comum; nunca é persistida como unidade. */
export function explanationRenderingUnit(explanation, id = "explanation") {
  const content = normalizeMicrosequenceExplanation(explanation);
  return { id, position: 1, ...content, role: "theory", response: null, feedback: [], topics: [] };
}

export function explanationReviewMessage(review) {
  return {
    draft: "Rascunho: este conteúdo ainda aguarda revisão da autoria.",
    stale: "O conteúdo mudou depois da revisão. A autoria precisa revisá-lo novamente.",
    unregistered: "A revisão deste conteúdo não está registrada.",
    current: "Revisado pela autoria nesta versão."
  }[review?.state] || "A revisão deste conteúdo não está registrada.";
}

/** Folha de leitura: mantém o card montado e usa os mesmos componentes, fontes e ferramentas. */
export function createStudyExplanation({ root, repository, getContext, getReference, getContextKey,
  canOpen, canAuthorSources, onOpen, downloadPdf }) {
  let overlay = null;
  let tools = null;
  let captured = null;
  let contextKey = "";
  let contextValue = null;
  let renderingUnit = null;
  let signature = "";
  let epoch = 0;
  let citations = null;
  let references = {};
  let loading = false;
  let sourceError = "";
  let sourceNotice = "";
  let sourceOpen = false;
  let sourceReturn = null;
  let selectedLinkId = "";
  let selectedOccurrenceId = "";
  let downloadPending = false;
  let downloadError = "";
  let detachedFocus = null;
  let detachedState = null;
  const scrollByContext = new Map();

  const panel = () => overlay?.querySelector(".study-explanation-panel");
  const body = () => overlay?.querySelector(".study-explanation-body");
  const reference = () => ({ ...getReference(), targetKind: "microsequence_explanation",
    courseRevision: contextValue?.courseRevision,
    targetId: contextValue?.microsequenceId || getReference().microsequenceId });

  function setBackground(inert) {
    const screen = root.querySelector(".app-shell > .screen");
    if (!screen) return;
    screen.inert = inert;
    if (inert) screen.setAttribute("aria-hidden", "true");
    else screen.removeAttribute("aria-hidden");
    root.querySelector("[data-action='open-explanation']")?.setAttribute("aria-expanded", String(inert));
  }

  function close({ restore = true } = {}) {
    if (!overlay) return false;
    ++epoch;
    scrollByContext.set(contextKey, body()?.scrollTop || 0);
    if (scrollByContext.size > 32) scrollByContext.delete(scrollByContext.keys().next().value);
    tools?.destroy(); tools = null;
    overlay.remove(); overlay = null;
    root.ownerDocument.removeEventListener("keydown", handleKeyDown);
    setBackground(false);
    if (restore) {
      restoreRenderState(root, captured, { restoreFocus: false, restorePageScroll: true });
      root.querySelector("[data-action='open-explanation']")?.focus({ preventScroll: true });
    }
    return true;
  }

  function handleKeyDown(event) {
    if (!overlay || tools?.isOpen() || overlay.querySelector("dialog[open]")) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (sourceOpen) closeSources(); else close();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [...panel().querySelectorAll("button, a[href], input, textarea, select, [tabindex='0']")]
      .filter(node => !node.disabled && !node.closest("[hidden]") && node.getClientRects().length);
    if (!nodes.length) return;
    const index = nodes.indexOf(root.ownerDocument.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1).focus(); }
    else if (!event.shiftKey && (index < 0 || index === nodes.length - 1)) {
      event.preventDefault(); nodes[0].focus();
    }
  }

  function closeSources() {
    if (!sourceOpen) return false;
    sourceOpen = false;
    overlay.querySelector(".study-explanation-reading").hidden = false;
    overlay.querySelector(".study-explanation-sources").hidden = true;
    if (sourceReturn?.isConnected) sourceReturn.focus({ preventScroll: true });
    else overlay.querySelector("[data-explanation-sources]")?.focus({ preventScroll: true });
    return true;
  }

  function updateSources({ focus = false } = {}) {
    if (!overlay || !sourceOpen) return;
    const host = overlay.querySelector(".study-explanation-sources");
    const scrollTop = host.querySelector(".study-citations-body")?.scrollTop || 0;
    host.innerHTML = renderStudyCitations({ open: true, embedded: true, closeLabel: "Voltar à Explicação",
      loading, value: citations, error: sourceError, courseId: contextValue.courseId,
      canAuthorSources: canAuthorSources(), downloadPending, downloadError, selectedLinkId,
      selectedOccurrenceId, formattedReferences: references, studyUnit: contextValue.explanation,
      sourceOptions: SOURCE_OPTIONS });
    if (sourceNotice) host.querySelector(".study-citations-body").insertAdjacentHTML("afterbegin",
      `<p class="study-citations-status" role="status">${escape(sourceNotice)}</p>`);
    host.querySelector(".study-citations-body").scrollTop = scrollTop;
    host.querySelector("[data-action='toggle-citations']").addEventListener("click", closeSources);
    host.querySelector("[data-action='retry-citations']")?.addEventListener("click", () => void loadSources());
    host.querySelectorAll("[data-action='download-citation-attachment']").forEach(node =>
      node.addEventListener("click", () => void downloadAttachment(node)));
    if (focus) host.querySelector("[data-action='toggle-citations']").focus({ preventScroll: true });
  }

  function openSources(node) {
    sourceReturn = node || root.ownerDocument.activeElement;
    selectedLinkId = node?.dataset.citationLinkId || "";
    selectedOccurrenceId = node?.dataset.citationOccurrenceId || "";
    sourceOpen = true;
    overlay.querySelector(".study-explanation-reading").hidden = true;
    overlay.querySelector(".study-explanation-sources").hidden = false;
    updateSources({ focus: true });
  }

  function placeSources() {
    if (!overlay || !contextValue?.explanation) return;
    const reading = body();
    placeStudyCitationMarkers(reading, contextValue.explanation, citations, SOURCE_OPTIONS);
    const general = overlay.querySelector("[data-explanation-source-markers]");
    general.innerHTML = renderStudySourceMarkers(studyCitationMarkers(contextValue.explanation, citations, SOURCE_OPTIONS)
      .filter(marker => !marker.target));
    reading.querySelectorAll("[data-action='open-citation']").forEach(node =>
      node.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); openSources(node); }));
  }

  async function loadSources() {
    const ownEpoch = ++epoch;
    loading = true; sourceError = ""; sourceNotice = ""; updateSources();
    try {
      if (typeof repository.loadExplanationCitations !== "function") throw new Error("Fontes indisponíveis nesta cópia.");
      const result = await repository.loadExplanationCitations(reference());
      if (!overlay || ownEpoch !== epoch) return;
      citations = { ...result, citations: result.citations.map(citation => ({ ...citation,
        occurrences: resolveCourseSourceOccurrences(contextValue.explanation,
          (citation.occurrences || []).map(occurrence => Object.fromEntries(
            Object.entries(occurrence).filter(([field]) => field !== "status"))), SOURCE_OPTIONS) })) };
      const formatted = Object.fromEntries(await Promise.all(citations.citations.map(async citation => {
        try { return [citation.linkId, await formatCourseSourceReference(citation, { style: result.bibliographyStyle })]; }
        catch { return [citation.linkId, { text: citation.citationText || "Referência indisponível. Consulte a fonte.", runs: [] }]; }
      })));
      if (!overlay || ownEpoch !== epoch) return;
      references = formatted;
      const status = repository.loadExplanationCitationStatus?.(reference());
      sourceNotice = status?.serviceUnavailable ? "Serviço indisponível. Exibindo as fontes salvas desta revisão." :
        status?.offline ? "Sem conexão. Exibindo as fontes salvas nesta cópia; arquivos externos podem estar indisponíveis." :
        status?.source === "cache" ? "Fontes da revisão salva nesta cópia." : "";
      placeSources();
    } catch (error) {
      if (!overlay || ownEpoch !== epoch) return;
      sourceError = publicErrorMessage(error, "Não foi possível consultar as fontes da Explicação.", {
        conflict: "O curso mudou. Reabra a Explicação para consultar as fontes atuais.",
        network: "As fontes não estão salvas nesta cópia e não foi possível consultá-las."
      });
    } finally {
      if (overlay && ownEpoch === epoch) { loading = false; updateSources(); }
    }
  }

  async function downloadAttachment(node) {
    if (downloadPending) return;
    const citation = citations?.citations?.[Number(node.dataset.citationIndex)];
    const attachment = citation?.attachments?.[Number(node.dataset.attachmentIndex)];
    if (!attachment) return;
    const ownEpoch = epoch;
    downloadPending = true; downloadError = ""; updateSources();
    try {
      const result = await repository.getStudyCitationAttachmentDownload(reference(), {
        courseRevision: citations.courseRevision, sourceId: citation.sourceId,
        sourceRevision: citation.sourceRevision, attachment: structuredClone(attachment)
      });
      if (!overlay || ownEpoch !== epoch) return;
      const url = new URL(result.signedUrl);
      const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "10.0.2.2"].includes(url.hostname);
      if ((url.protocol !== "https:" && !local) || url.username || url.password) throw new TypeError("URL do PDF inválida.");
      const page = Number(node.dataset.citationPage);
      if (Number.isSafeInteger(page) && page > 0 && page <= 1_000_000) url.hash = `page=${page}`;
      downloadPdf(url.href, attachment);
    } catch (error) {
      if (!overlay || ownEpoch !== epoch) return;
      downloadError = publicErrorMessage(error, "Não foi possível abrir este PDF.", {
        network: "O texto está salvo, mas este PDF externo precisa de conexão e acesso autorizado.",
        conflict: "O curso mudou. Reabra a Explicação para consultar o PDF atual."
      });
    } finally {
      if (overlay && ownEpoch === epoch) { downloadPending = false; updateSources(); }
    }
  }

  function open() {
    if (!canOpen()) return false;
    onOpen();
    close({ restore: false });
    captured = captureRenderState(root, { includePageScroll: true });
    contextKey = getContextKey();
    citations = null; references = {}; loading = false; sourceError = ""; sourceNotice = "";
    sourceOpen = false; selectedLinkId = ""; selectedOccurrenceId = "";
    downloadPending = false; downloadError = "";
    contextValue = null; signature = "";
    let content;
    try {
      contextValue = getContext();
      signature = contentSignature(contextValue);
      renderingUnit = contextValue.explanation ? explanationRenderingUnit(contextValue.explanation, contextValue.microsequenceId) : null;
      content = renderingUnit ? `<h3>${escape(renderingUnit.title)}</h3>` +
        `<p class="study-explanation-review" role="status">${escape(explanationReviewMessage(contextValue.contentReview))}</p>` +
        renderPackageStudyUnitBlocks(renderingUnit, { toolsInActionBar: true,
          sourceTextTargets: listCourseSourceOccurrenceTargets(contextValue.explanation, SOURCE_OPTIONS),
          blockKeyPrefix: `explanation:${contextKey}` }) :
        '<p role="status">Esta microssequência ainda não tem Explicação. Você pode continuar o estudo.</p>';
    } catch (error) {
      renderingUnit = null;
      content = `<p role="alert">${escape(publicErrorMessage(error, "Não foi possível abrir a Explicação desta cópia."))}</p>`;
    }
    overlay = root.ownerDocument.createElement("section");
    overlay.className = "editor-overlay study-explanation-overlay";
    overlay.innerHTML = '<article class="editor-sheet study-explanation-panel" role="dialog" aria-modal="true" aria-labelledby="study-explanation-title">' +
      '<div class="study-explanation-reading"><header class="editor-head">' +
      '<button class="icon-ghost" type="button" data-close-explanation aria-label="Fechar Explicação" title="Fechar Explicação">' +
      renderUiIcon("remove-state", "home-tab-icon") + '</button><h2 id="study-explanation-title">Explicação</h2>' +
      '<button class="icon-ghost" type="button" data-explanation-sources aria-label="Fontes da Explicação" title="Fontes da Explicação"' +
      (renderingUnit ? "" : " disabled") + '>' + renderUiIcon("study", "home-tab-icon") + '</button></header>' +
      `<div class="editor-body study-explanation-body" tabindex="0">${content}<div data-explanation-source-markers></div></div>` +
      (renderingUnit ? `<footer class="study-explanation-tools">${renderStudyToolActions(renderingUnit, RESOURCE_PACKAGE_REGISTRY, { compact: true })}</footer>` : "") +
      '</div><div class="study-explanation-sources" hidden></div></article>';
    root.querySelector(".app-shell").append(overlay);
    setBackground(true);
    body().scrollTop = scrollByContext.get(contextKey) || 0;
    overlay.querySelector("[data-close-explanation]").addEventListener("click", () => close());
    overlay.querySelector("[data-explanation-sources]").addEventListener("click", event => openSources(event.currentTarget));
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    root.ownerDocument.addEventListener("keydown", handleKeyDown);
    overlay.querySelector("[data-close-explanation]").focus({ preventScroll: true });
    tools = createStudyTools({ root: overlay, getStudyUnit: () => renderingUnit, getContextKey: () => contextKey,
      getOverlayHost: () => overlay, getBackground: panel,
      canOpen: () => Boolean(overlay && renderingUnit && !sourceOpen), getHost: async () => ({
        canRevealAnswers: false,
        loadAudioConfiguration: () => repository.loadStudyAudioConfiguration(reference()),
        downloadMedia: (media, options) => repository.downloadExplanationMedia(reference(), media, options),
        openExternalUrl: url => openStudyResourceUrl(url, root.ownerDocument),
        openSourceAttachment: async target => {
          const result = await repository.getStudyInstructionalAttachmentDownload(reference(), target);
          downloadPdf(result.signedUrl, result.attachment);
        }
      }) });
    tools.afterRender();
    const currentOverlay = overlay;
    if (renderingUnit) void RESOURCE_PACKAGE_REGISTRY.hydrate(body()).then(() => {
      if (overlay === currentOverlay) placeSources();
    }).catch(() => {
      if (overlay === currentOverlay) body().insertAdjacentHTML("beforeend", '<p role="alert">Um componente não pôde ser preparado. Feche e reabra a Explicação para tentar novamente.</p>');
    });
    if (renderingUnit) void loadSources();
    return true;
  }

  return Object.freeze({
    open, close, isOpen: () => Boolean(overlay),
    handleBack() {
      const diagram = overlay?.querySelector("dialog[open]");
      if (diagram) { diagram.close(); return true; }
      return tools?.isOpen() ? tools.close() : sourceOpen ? closeSources() : close();
    },
    beforeRender() {
      detachedFocus = overlay?.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement : null;
      detachedState = overlay ? captureRenderState(overlay, { includeFocus: false }) : null;
      overlay?.remove();
    },
    afterRender() {
      if (!overlay) return;
      if (!canOpen() || contextKey !== getContextKey()) { close({ restore: false }); return; }
      let nextSignature;
      try { nextSignature = contentSignature(getContext()); } catch { nextSignature = "unavailable"; }
      if (signature !== nextSignature) { open(); return; }
      root.querySelector(".app-shell")?.append(overlay);
      setBackground(true);
      // Desanexar a folha tira diálogos nativos do top layer, embora conserve open.
      // Reabre a mesma instância para preservar o viewport e sua interação.
      overlay.querySelectorAll("dialog[open]").forEach(dialog => {
        if (!dialog.matches(":modal")) {
          dialog.removeAttribute("open");
          dialog.showModal();
        }
      });
      restoreRenderState(overlay, detachedState, { restoreFocus: false, restorePageScroll: false });
      if (detachedFocus?.isConnected) detachedFocus.focus({ preventScroll: true });
      detachedFocus = null;
    },
    destroy() { close({ restore: false }); scrollByContext.clear(); }
  });
}
