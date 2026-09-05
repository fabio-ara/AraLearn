import { createUuid } from "../domain/identifiers.js";
import {
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";
import { normalizeCourseSourceCommand, normalizeCourseSourceDocument } from "../domain/courseSources.js";
import { formatCourseSourceReference } from "../domain/courseSourceReference.js";
import { renderBibliographicReference } from "./renderBibliographicReference.js";
import { listCourseSourceOccurrenceTargets } from "../domain/courseSourceOccurrences.js";
import { renderSourceOccurrenceForm, sourceOccurrenceFromSelection } from "./sourceOccurrenceForm.js";
import {
  SOURCE_KIND_LABELS as SOURCE_KINDS,
  SOURCE_ROLE_LABELS as SOURCE_ROLES,
  BIBLIOGRAPHIC_FIELD_LABELS,
  createSourceBibliographyDraft as sourceDraft,
  captureSourceBibliographyDraft as sourceDraftFromForm,
  sourceDocumentFromBibliographyDraft,
  renderSourceBibliographyForm as renderSourceForm,
  appendSourceContributor
} from "./sourceBibliographyForm.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { downloadTextFile } from "./downloadTextFile.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { publicErrorMessage } from "./publicErrorMessage.js";
import {
  mergeCourseSourceCatalogPages,
  normalizeCourseSourceChange,
  normalizeCourseSourcesPage
} from "./courseAuthoringViewModel.js";

const CATALOG_PAGE_LIMIT = 10;
const SOURCE_VISIBILITIES = Object.freeze({
  hidden: "Não mostrar no estudo",
  citation: "Mostrar citação",
  citation_and_link: "Mostrar citação e link"
});
const PUBLIC_FILE_ACCESS = Object.freeze({
  inherit: "Herdar",
  restricted: "Restringir",
  available: "Disponibilizar"
});
const SOURCE_ORIGINS = Object.freeze({
  external: "Fonte externa",
  author_provided: "Fornecida pela autoria",
  imported: "Importada"
});
const SOURCE_AVAILABILITIES = Object.freeze({
  open_access: "Acesso aberto",
  restricted: "Acesso restrito",
  private: "Uso privado",
  unknown: "Não informada"
});
const SOURCE_VERIFICATIONS = Object.freeze({
  unverified: "Ainda não conferida",
  author_verified: "Conferida pela autoria"
});
const SOURCE_STATUSES = Object.freeze({
  active: "Ativa",
  retired: "Aposentada"
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
  quoted_from: "Citação direta",
  contrasted_with: "Contrasta com o conteúdo",
  exemplified_by: "Exemplifica o conteúdo",
  inspired_by: "Inspirou a elaboração",
  needs_verification: "Precisa de verificação"
});
const SOURCE_OBSERVATION_KINDS = Object.freeze({
  note: { label: "Acrescentar nota", category: null },
  contestation: { label: "Contestar interpretação", category: "possible_error" },
  reformulation: {
    label: "Solicitar reformulação",
    category: "reformulation_request"
  }
});
const SOURCE_OBSERVATION_STATES = Object.freeze({
  open: "Aberta",
  considered: "Considerada",
  resolved: "Resolvida",
  withdrawn: "Retirada"
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

function containsControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function validLiteralSourceId(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim() &&
    [...value].length <= 240 && new TextEncoder().encode(value).byteLength <= 960 &&
    !containsControlCharacters(value);
}

function validAnchorId(value) {
  return typeof value === "string" && value.length > 0 && value === value.trim() &&
    value.length <= 480 && [...value].length <= 240 &&
    new TextEncoder().encode(value).byteLength <= 960 && !containsControlCharacters(value);
}

function formFieldError(message, fieldName) {
  const error = new TypeError(message);
  error.fieldName = fieldName;
  return error;
}

function optionalFormValue(form, name, label = null, maximum = null) {
  const value = String(form?.elements?.[name]?.value || "").trim();
  if (value && maximum != null && !formValueWithinLimit(value, maximum)) {
    throw formFieldError(`${label} é inválido.`, name);
  }
  return value || null;
}

function requiredFormValue(form, name, label, maximum = 16_384) {
  const value = optionalFormValue(form, name);
  if (!value) throw formFieldError(`${label} é obrigatório.`, name);
  if (!formValueWithinLimit(value, maximum)) {
    throw formFieldError(`${label} é inválido.`, name);
  }
  return value;
}

function literalRequiredFormValue(form, name, label, maximum = 16_384) {
  const value = String(form?.elements?.[name]?.value ?? "");
  if (!value) throw formFieldError(`${label} é obrigatório.`, name);
  if (!formValueWithinLimit(value, maximum)) {
    throw formFieldError(`${label} é inválido.`, name);
  }
  return value;
}

function literalOptionalFormValue(form, name, label, maximum = 16_384) {
  const value = String(form?.elements?.[name]?.value ?? "");
  if (!value) return null;
  if (!formValueWithinLimit(value, maximum)) {
    throw formFieldError(`${label} é inválido.`, name);
  }
  return value;
}

function integerFormValue(form, name, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = String(form?.elements?.[name]?.value || "").trim();
  const value = Number(raw);
  if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw formFieldError(`${label} é inválido.`, name);
  }
  return value;
}

function secondsFormValue(form, name, label) {
  const raw = String(form?.elements?.[name]?.value || "").trim().replace(",", ".");
  const seconds = Number(raw);
  const milliseconds = Math.round(seconds * 1_000);
  if (!raw || !Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(milliseconds) ||
      milliseconds > 2_147_483_647) {
    throw formFieldError(`${label} é inválido.`, name);
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
    .test(message) || (status == null && !code && !(error instanceof TypeError));
}

function errorMessage(error, options = {}) {
  const context = typeof options === "string" ? { fallback: options } : options;
  const fallback = context.fallback || "Não foi possível concluir esta operação.";
  return publicErrorMessage(error, fallback, {
    conflict: "O curso mudou. Recarregue as fontes antes de salvar.",
    network: context.network || fallback
  });
}

function operationErrorContext(action) {
  return {
    fallback: `Não foi possível ${action}.`,
    network: `Sem conexão para ${action}.`
  };
}

function commandErrorContext(command) {
  const action = {
    save_source: "salvar a fonte",
    retire_source: "retirar a fonte",
    save_anchor: "salvar a âncora",
    retire_anchor: "retirar a âncora",
    remove_pdf: "remover o PDF",
    set_target_sources: "salvar as fontes deste item"
  }[command?.type] || "salvar a alteração";
  return operationErrorContext(action);
}

function sourceStatusMarkup(source) {
  const label = SOURCE_STATUSES[source.status] || source.status;
  return `<span class="course-source-status is-${escapeHtml(source.status)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
    renderUiIcon(source.status === "active" ? "ready-state" : "remove-state", "course-authoring-icon") + '</span>';
}

function sourceDisclosure(state, name) {
  return ` data-source-disclosure="${name}"${state.detailSections?.includes(name) || name === "anchors" && state.initialAnchorMatch ? " open" : ""}`;
}

function sourceTitle(source) {
  return source.title || `${SOURCE_KINDS[source.kind] || "Fonte"} sem título`;
}

function bibliographyStyle(state) {
  return state.catalog?.bibliographyStyle || state.detail?.bibliographyStyle || "abnt-2025";
}

function referenceKey(source, state) {
  return JSON.stringify([source.sourceId, source.revision, bibliographyStyle(state)]);
}

function referenceMarkup(source, state) {
  const key = referenceKey(source, state);
  const result = state.references?.get(key);
  return `<span class="source-formatted-reference" data-source-reference-key="${escapeHtml(key)}">` +
    (result ? renderBibliographicReference(result) || "A referência ainda não tem dados suficientes."
      : source.citationMode === "manual" ? escapeHtml(source.citationText || "Referência não informada.") : "Preparando referência…") + '</span>';
}

function renderNotice(state) {
  return (state.message
    ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.message)}</p>`
    : "") + (state.failure
    ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.failure)}</p>`
    : "") + (state.pendingFileAccess
    ? '<button type="button" class="course-source-retry" data-source-action="retry-file-access">' +
      `${renderUiIcon("rotate", "course-authoring-button-icon")}<span>Confirmar a mesma permissão</span></button>`
    : state.pendingCommand
    ? '<button type="button" class="course-source-retry" data-source-action="retry-command">' +
      `${renderUiIcon("rotate", "course-authoring-button-icon")}<span>Confirmar a mesma operação</span></button>`
    : state.pendingAnnotation?.sourceId === state.selectedSourceId
      ? '<button type="button" class="course-source-retry" data-source-action="retry-annotation">' +
        `${renderUiIcon("rotate", "course-authoring-button-icon")}<span>Confirmar a mesma observação</span></button>`
    : state.pendingAttachment
      ? '<button type="button" class="course-source-retry" data-source-action="retry-attachment">' +
        `${renderUiIcon("rotate", "course-authoring-button-icon")}<span>Confirmar o mesmo PDF</span></button>`
    : "");
}

function renderSourceConfirmation(state) {
  const confirmation = state.confirmation;
  if (!confirmation) return "";
  const confirmAction = confirmation.action || "confirm-retirement";
  return '<div class="course-authoring-confirm-backdrop" data-source-confirmation-backdrop>' +
    '<section class="course-authoring-confirm-dialog" data-source-confirmation role="alertdialog"' +
    ' aria-modal="true" aria-labelledby="course-source-confirmation-title"' +
    ' aria-describedby="course-source-confirmation-message">' +
    `<h2 id="course-source-confirmation-title">${escapeHtml(confirmation.title)}</h2>` +
    `<p id="course-source-confirmation-message">${escapeHtml(confirmation.message)}</p>` +
    '<div class="course-authoring-confirm-actions">' +
    '<button type="button" class="course-authoring-secondary" data-source-action="cancel-confirmation">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}<span>Cancelar</span></button>` +
    `<button type="button" class="${confirmation.action === "confirm-file-access" ? "course-authoring-secondary" : "is-danger"}" data-source-action="${escapeHtml(confirmAction)}"${state.busy ? " disabled" : ""}>` +
    `${renderUiIcon(confirmation.action === "confirm-file-access" ? "ready-state" : "trash", "course-authoring-button-icon")}<span>${escapeHtml(confirmation.confirmLabel)}</span>` +
    "</button></div></section></div>";
}

function sourceObservationTargetLabel(item, source) {
  if (item.target.kind === "source") return "fonte";
  const anchor = source.anchors.find(({ anchorId }) => anchorId === item.target.id);
  return anchor ? `âncora · ${anchorLabel(anchor)}` : "âncora não disponível";
}

function sourceObservationCategoryLabel(category) {
  if (category === "possible_error") return "Contestação";
  if (category === "reformulation_request") return "Pedido de reformulação";
  return category === null ? "Nota" : "Observação";
}

function renderConsideredSourceLinks(sourceLinks) {
  if (!sourceLinks.length) return "";
  return '<div class="course-source-observation-references"><strong>Fontes e âncoras consideradas</strong><ul>' +
    sourceLinks.map((link, index) => `<li>Fonte ${index + 1} · ${link.anchors.length} ` +
      `${link.anchors.length === 1 ? "âncora" : "âncoras"}</li>`).join("") + "</ul></div>";
}

function renderSourceObservation(item, source) {
  return '<article class="course-source-observation">' +
    '<header><div>' +
    `<strong>${escapeHtml(sourceObservationCategoryLabel(item.category))}</strong>` +
    `<span>${escapeHtml(sourceObservationTargetLabel(item, source))} · ${escapeHtml(SOURCE_OBSERVATION_STATES[item.state] || item.state)}</span>` +
    "</div></header>" +
    `<p>${escapeHtml(item.rawText || "Observação retirada.")}</p>` +
    (item.ownerResponse
      ? '<div class="course-source-observation-response"><strong>' +
        `${item.ownerResponse.kind === "reformulation" ? "Reformulação" : "Resposta"}</strong>` +
        `<p>${escapeHtml(item.ownerResponse.text)}</p>` +
        renderConsideredSourceLinks(item.ownerResponse.consideredSourceLinks) + "</div>"
      : "") + "</article>";
}

function renderSourceObservationForm(state, source) {
  if (source.status !== "active") return "";
  const editor = state.observationEditor?.sourceId === source.sourceId
    ? state.observationEditor
    : null;
  const values = editor?.draft || {
    observationKind: "note",
    targetId: "",
    rawText: ""
  };
  const anchorOptions = source.anchors.filter(({ status }) => status === "active").map((anchor) =>
    `<option value="${escapeHtml(anchor.anchorId)}"${values.targetId === anchor.anchorId ? " selected" : ""}>` +
      `Âncora · ${escapeHtml(anchorLabel(anchor))}</option>`
  ).join("");
  const kindOptions = Object.entries(SOURCE_OBSERVATION_KINDS).map(([value, entry]) =>
    `<option value="${value}"${values.observationKind === value ? " selected" : ""}>` +
      `${escapeHtml(entry.label)}</option>`
  ).join("");
  return '<form class="course-source-form course-source-observation-form" data-source-form="observation">' +
    '<h4>Observação</h4>' +
    '<div class="course-source-form-grid"><div><label for="course-source-observation-kind">Tipo</label>' +
    `<select id="course-source-observation-kind" name="observationKind" required>${kindOptions}</select></div>` +
    '<div><label for="course-source-observation-target">Alvo</label>' +
    '<select id="course-source-observation-target" name="targetId">' +
    `<option value=""${values.targetId ? "" : " selected"}>Fonte · ${escapeHtml(sourceTitle(source))}</option>` +
    `${anchorOptions}</select></div></div>` +
    '<label for="course-source-observation-text">Observação</label>' +
    '<textarea id="course-source-observation-text" name="rawText" maxlength="2000" rows="4" required ' +
    `placeholder="Escreva a observação.">${escapeHtml(values.rawText)}</textarea>` +
    '<div class="course-source-form-actions"><button type="submit" aria-label="Salvar observação" title="Salvar observação"' +
    `${state.busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button></div></form>`;
}

function observationClassificationForExport(value) {
  return {
    method: value.method,
    methodVersion: value.methodVersion,
    taxonomyRevision: value.taxonomyRevision,
    subjects: value.subjects.map((subject) => ({
      topicId: subject.topicId,
      label: subject.label,
      topicVersion: subject.topicVersion
    }))
  };
}

function observationSourceLinksForExport(value) {
  return value.map((link) => ({
    sourceId: link.sourceId,
    relation: link.relation,
    anchors: link.anchors.map((anchorValue) => ({
      anchorId: anchorValue.anchorId
    }))
  }));
}

function sourceObservationForExport(item) {
  return {
    annotationId: item.annotationId,
    annotationVersion: item.annotationVersion,
    provenance: {
      origin: item.provenance.origin,
      channel: item.provenance.channel
    },
    contributor: {
      kind: item.contributor.kind,
      role: item.contributor.role
    },
    target: {
      kind: item.target.kind,
      id: item.target.id,
      currentAvailable: item.target.currentAvailable
    },
    observedRevision: {
      certainty: item.observedRevision.certainty,
      courseRevision: item.observedRevision.courseRevision,
      targetVersion: item.observedRevision.targetVersion
    },
    rawText: item.rawText,
    category: item.category,
    briefSummary: item.briefSummary,
    subjectClassification: {
      status: item.subjectClassification.status,
      automatic: observationClassificationForExport(item.subjectClassification.automatic),
      effective: observationClassificationForExport(item.subjectClassification.effective),
      correctedAt: item.subjectClassification.correctedAt
    },
    state: item.state,
    ownerResponse: item.ownerResponse === null ? null : {
      text: item.ownerResponse.text,
      kind: item.ownerResponse.kind,
      consideredSourceLinks: observationSourceLinksForExport(
        item.ownerResponse.consideredSourceLinks
      ),
      updatedAt: item.ownerResponse.updatedAt
    },
    timestamps: {
      capturedAt: item.timestamps.capturedAt,
      createdAt: item.timestamps.createdAt,
      updatedAt: item.timestamps.updatedAt,
      firstConsideredAt: item.timestamps.firstConsideredAt,
      respondedAt: item.timestamps.respondedAt,
      resolvedAt: item.timestamps.resolvedAt,
      withdrawnAt: item.timestamps.withdrawnAt
    }
  };
}

function observationQueryForExport(query) {
  return {
    mode: query.mode,
    origins: [...query.origins],
    channels: [...query.channels],
    states: [...query.states],
    categories: [...query.categories],
    includeUncategorized: query.includeUncategorized,
    subjectIds: [...query.subjectIds],
    hierarchy: query.hierarchy === null ? null : {
      target: {
        kind: query.hierarchy.target.kind,
        id: query.hierarchy.target.id
      },
      includeDescendants: query.hierarchy.includeDescendants
    },
    annotationId: query.annotationId
  };
}

function buildSourceObservationsExport(state, exportedAt) {
  return {
    contract: "aralearn.course-source-observations-export.v2",
    exportedAt,
    dataNotice: {
      classification: "personal_or_pseudonymized_operational_data",
      message: "Exportação operacional privada. Pode conter dados pessoais no texto livre ou nos rótulos e inclui identificadores internos e horários; não é um conjunto anônimo.",
      included: {
        freeText: "Texto livre da observação, do resumo, da resposta e rótulos de assunto, quando houver.",
        internalIdentifiers: "Identificadores internos do curso, da fonte, da observação e dos assuntos relacionados.",
        timestamps: "Horários de criação e do ciclo da observação."
      },
      excluded: [
        "E-mail e nome do perfil da conta.",
        "Referência e rótulo protegidos da pessoa contribuinte.",
        "Caminhos internos e links de navegação.",
        "Capacidades calculadas para a interface."
      ]
    },
    courseId: state.courseId,
    courseRevision: state.courseRevision,
    sourceId: state.selectedSourceId,
    annotationSetVersion: state.annotations.annotationSetVersion,
    query: observationQueryForExport(state.annotations.query),
    summary: {
      matchingTotal: state.annotations.summary.matchingTotal,
      byOrigin: { ...state.annotations.summary.byOrigin },
      byChannel: { ...state.annotations.summary.byChannel },
      byState: { ...state.annotations.summary.byState },
      unclassifiedTotal: state.annotations.summary.unclassifiedTotal
    },
    items: state.annotations.items.map(sourceObservationForExport)
  };
}

function renderSourceObservations(state, source) {
  if (state.annotationsLoading && !state.annotations) {
    return '<section class="course-source-observations"><h4 class="visually-hidden">Observações</h4>' +
      '<p class="course-authoring-loading" role="status">Carregando observações…</p></section>';
  }
  const items = state.annotations?.items || [];
  return '<section class="course-source-observations"><header><div><h4 class="visually-hidden">Observações</h4>' +
    (items.length ? `<p>${items.length}${state.annotations?.hasMore ? "+" : ""} ` +
    `${items.length === 1 ? "observação" : "observações"}</p>` : '') + '</div>' +
    (!state.annotationsLoading && state.annotations && !state.annotations.hasMore
      ? '<button type="button" data-source-action="export-observations" aria-label="Exportar observações" title="Exportar observações">' +
        `${renderUiIcon("arrow-down", "course-authoring-button-icon")}</button>`
      : "") + "</header>" +
    (state.annotationsFailure
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.annotationsFailure)}</p>`
      : "") +
    renderSourceObservationForm(state, source) +
    (items.length
      ? `<div class="course-source-observation-list">${items.map((item) => renderSourceObservation(item, source)).join("")}</div>`
      : '') +
    (state.annotations?.hasMore
      ? `<button type="button" class="course-authoring-more" data-source-action="load-more-observations" aria-label="Carregar mais observações" title="Carregar mais observações"${state.annotationsLoading ? " disabled" : ""}>` +
        `${renderUiIcon("arrow-down", "course-authoring-button-icon")}</button>`
      : "") + "</section>";
}

function formDraft(form, current, names) {
  return Object.fromEntries(names.map((name) => [
    name,
    form?.elements?.[name] == null
      ? String(current?.[name] ?? "")
      : String(form.elements[name].value ?? "")
  ]));
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
    humanLocator: anchor?.humanLocator || "",
    verificationExcerpt: anchor?.verificationExcerpt || "",
    contentHash: anchor?.contentHash || ""
  };
}

function anchorDraftFromForm(form, current) {
  return formDraft(form, current, [
    "selectorKind", "startPage", "endPage", "startTime", "endTime", "fragment", "exact",
    "prefix", "suffix", "humanLocator", "verificationExcerpt", "contentHash"
  ]);
}

function observationDraftFromForm(form, current) {
  return formDraft(form, current, ["observationKind", "targetId", "rawText"]);
}

function renderAnchorForm(state) {
  const editor = state.anchorEditor;
  if (!editor) return "";
  const draft = editor.draft || anchorDraft(editor.anchor);
  const options = Object.entries(SELECTOR_KINDS).map(([value, label]) =>
    `<option value="${value}"${draft.selectorKind === value ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
  return '<form class="course-source-form" data-source-form="anchor">' +
    `<h4>${editor.anchor ? "Editar âncora" : "Nova âncora"}</h4>` +
    '<label for="course-anchor-kind">Como localizar</label>' +
    `<select id="course-anchor-kind" name="selectorKind" data-source-anchor-kind required>${options}</select>` +
    renderAnchorSelectorFields(draft) +
    '<label for="course-anchor-file">Arquivo a que este trecho se refere</label>' +
    `<select id="course-anchor-file" name="contentHash"><option value="">Obra sem arquivo específico</option>` +
    (state.detail?.items?.[0]?.attachments || []).map((attachment, index) =>
      `<option value="${escapeHtml(attachment.contentHash)}"${draft.contentHash === attachment.contentHash ? " selected" : ""}>PDF ${index + 1} · ${byteSizeLabel(attachment.byteSize)}</option>`).join("") +
    (draft.contentHash && !(state.detail?.items?.[0]?.attachments || []).some(file => file.contentHash === draft.contentHash)
      ? `<option value="${escapeHtml(draft.contentHash)}" selected>Arquivo anteriormente vinculado</option>` : "") + '</select>' +
    '<label for="course-anchor-human-locator">Localizador para pessoas</label>' +
    `<input id="course-anchor-human-locator" name="humanLocator" maxlength="1000" value="${escapeHtml(draft.humanLocator)}"` +
    ' placeholder="Capítulo 3 · Seção 2.1 · Figura 5">' +
    '<label for="course-anchor-excerpt">Trecho para conferência</label>' +
    `<textarea id="course-anchor-excerpt" name="verificationExcerpt" maxlength="4000" rows="3">${escapeHtml(draft.verificationExcerpt)}</textarea>` +
    '<div class="course-source-form-actions"><button type="submit" aria-label="Salvar âncora" title="Salvar âncora"' +
    `${state.busy ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button>` +
    '<button type="button" data-source-action="cancel-anchor-form" aria-label="Cancelar" title="Cancelar">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></div></form>`;
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

function anchorLabel(anchor) {
  const exact = selectorLabel(anchor.selector);
  return anchor.humanLocator ? `${anchor.humanLocator} · ${exact}` : exact;
}

function renderAnchor(anchor, sourceRevision, state) {
  const editable = sourceRevision === state.detail?.items?.[0]?.revision && anchor.status === "active";
  const deepLinked = state.initialAnchorMatch?.sourceRevision === sourceRevision &&
    state.initialAnchorMatch?.anchorId === anchor.anchorId &&
    state.initialAnchorMatch?.anchorRevision === anchor.revision;
  return `<article class="course-source-anchor${deepLinked ? " is-deep-linked" : ""}"` +
    (deepLinked ? ' data-source-deep-linked-anchor tabindex="-1"' : "") + ">" +
    `<div><strong>${escapeHtml(anchorLabel(anchor))}</strong>` +
    `<span>${anchor.status === "active" ? "Âncora ativa" : "Âncora aposentada"}</span>` +
    (anchor.needsReverification
      ? '<span class="course-source-deep-link-label">Reverificação necessária</span>'
      : "") +
    (deepLinked ? '<span class="course-source-deep-link-label">Âncora indicada</span>' : "") +
    "</div>" +
    (anchor.needsReverification
      ? '<p>O PDF mudou. Confira a paginação e o trecho antes de reutilizar esta âncora.</p>'
      : anchor.verificationExcerpt
      ? `<p>${escapeHtml(anchor.verificationExcerpt)}</p>`
      : '<p class="course-source-empty">Sem trecho adicional de conferência.</p>') +
    (editable ? '<div class="course-source-compact-actions">' +
      `<button type="button" data-source-action="edit-anchor" data-anchor-id="${escapeHtml(anchor.anchorId)}" data-source-revision="${sourceRevision}" aria-label="Editar âncora" title="Editar âncora">${renderUiIcon("edit", "course-authoring-button-icon")}</button>` +
          `<button type="button" data-source-action="retire-anchor" data-anchor-id="${escapeHtml(anchor.anchorId)}" data-anchor-revision="${anchor.revision}" aria-label="Aposentar âncora" title="Aposentar âncora">${renderUiIcon("trash", "course-authoring-button-icon")}</button>`
        + "</div>"
      : "") + "</article>";
}

function byteSizeLabel(value) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${Math.ceil(value / 1_024)} KiB`;
  return `${(value / (1_024 * 1_024)).toFixed(1).replace(".0", "")} MiB`;
}

function fileAccessDescription(policy, inheritedPolicy, inheritedLabel) {
  if (policy === "inherit") {
    const effective = PUBLIC_FILE_ACCESS[inheritedPolicy];
    return `Herdar ${inheritedLabel}${effective ? ` · ${effective.toLowerCase()}` : ""}`;
  }
  return policy === "available" ? "Disponível no curso público" : "Somente quem tem acesso concedido ao curso";
}

function renderFileAccessForm(source, attachment, state, label) {
  const contentHash = attachment?.contentHash ?? null;
  const policy = attachment?.publicFileAccess ?? source.publicFileAccess;
  const draft = state.fileAccessDraft;
  const selected = draft?.sourceId === source.sourceId && draft.contentHash === contentHash
    ? draft.publicFileAccess : policy;
  const inherited = contentHash === null ? state.coursePublicFileAccess
    : source.publicFileAccess === "inherit" ? state.coursePublicFileAccess : source.publicFileAccess;
  const disabled = state.busy || state.pendingFileAccess || state.fileAccessConflict || source.status !== "active";
  return '<form class="course-source-file-access-form" data-source-form="file-access">' +
    `<input type="hidden" name="sourceId" value="${escapeHtml(source.sourceId)}">` +
    `<input type="hidden" name="contentHash" value="${escapeHtml(contentHash ?? "")}">` +
    `<label><span>${escapeHtml(label)}</span><select name="publicFileAccess"${disabled ? " disabled" : ""}>` +
    Object.entries(PUBLIC_FILE_ACCESS).map(([value, title]) =>
      `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHtml(value === "inherit" ? `${title} ${contentHash === null ? "do curso" : "da fonte"}` : title)}</option>`
    ).join("") + "</select></label>" +
    `<button type="submit"${disabled ? " disabled" : ""}>Aplicar</button>` +
    `<small>${escapeHtml(fileAccessDescription(policy, inherited, contentHash === null ? "do curso" : "da fonte"))}</small></form>`;
}

function renderFileAccessSettings(source, attachments, state) {
  if (!state.canSetFileAccess) return "";
  const opened = state.fileAccessDraft?.sourceId === source.sourceId ||
    state.pendingFileAccess?.sourceId === source.sourceId;
  return `<details class="course-source-file-access"${opened ? " open" : ""}>` +
    '<summary>Acesso público aos PDFs</summary>' +
    '<p>Vale apenas com o curso público. Uma exceção no PDF prevalece sobre a fonte e o curso.</p>' +
    renderFileAccessForm(source, null, state, "Padrão desta fonte") +
    attachments.map((attachment, index) => renderFileAccessForm(source, attachment, state,
      `PDF ${index + 1} · ${byteSizeLabel(attachment.byteSize)}`)).join("") + "</details>";
}

function renderSourceAttachments(source, index, state) {
  if (index !== 0) return "";
  const attachments = Array.isArray(source.attachments) ? source.attachments : [];
  const canUpload = index === 0 && source.status === "active" && attachments.length < 8;
  return '<section class="course-source-attachments"><header><div><h4>PDFs</h4>' +
    `<p>${attachments.length ? "PDF disponível" : "Sem PDF"}</p></div>` +
    (canUpload
      ? `<label class="course-source-pdf-picker" title="${state.busy ? "Aguarde" : "Anexar PDF"}">` +
        `${renderUiIcon("upload", "course-authoring-button-icon")}<span class="visually-hidden">${state.busy ? "Aguarde" : "Anexar PDF"}</span>` +
        `<input type="file" accept="application/pdf,.pdf" aria-label="Anexar PDF" data-source-pdf-input${state.busy ? " disabled" : ""}>` +
        "</label>"
      : "") + "</header>" + renderFileAccessSettings(source, attachments, state) +
    (attachments.length
      ? '<div class="course-source-attachment-list">' + attachments.map((attachment) =>
        '<button type="button" data-source-action="download-attachment" ' +
          `data-source-revision="${source.revision}" data-content-hash="${escapeHtml(attachment.contentHash)}"` +
          `${state.busy ? " disabled" : ""}>${renderUiIcon("arrow-down", "course-authoring-button-icon")}` +
          `<span><strong>PDF disponível</strong><small>Baixar · ${escapeHtml(byteSizeLabel(attachment.byteSize))}</small></span></button>` +
        '<button type="button" data-source-action="remove-attachment" ' +
          `data-source-revision="${source.revision}" data-content-hash="${escapeHtml(attachment.contentHash)}"` +
          `${state.busy || source.status !== "active" ? " disabled" : ""}>${renderUiIcon("trash", "course-authoring-button-icon")}` +
          '<span><strong>Remover PDF</strong><small>Manter fonte e referências</small></span></button>'
      ).join("") + "</div>"
      : "") + "</section>";
}

function sourceAvailabilityNote(source) {
  const attachmentCount = Array.isArray(source.attachments) ? source.attachments.length : 0;
  if (attachmentCount > 0) {
    return safeHttpUrl(source.url)
      ? "A fonte oferece PDF e endereço web."
      : "PDF disponível como forma de acesso à fonte.";
  }
  if (safeHttpUrl(source.url)) {
    return "Referência remota: o endereço pode mudar ou deixar de estar disponível.";
  }
  return "A fonte continua registrada sem PDF ou endereço de acesso.";
}

function renderSource(source, state) {
  const url = safeHttpUrl(source.url);
  const deepLinked = state.initialAnchorMatch?.sourceRevision === source.revision;
  return `<article class="course-source-current${deepLinked ? " is-deep-linked" : ""}">` +
    '<header><div>' + sourceStatusMarkup(source) +
    '</div>' +
    (source.status !== "retired"
      ? '<div class="course-source-compact-actions">' +
      `<button type="button" data-source-action="edit-source" aria-label="Editar fonte" title="Editar fonte">${renderUiIcon("edit", "course-authoring-button-icon")}</button>` +
      (source.status === "active"
        ? `<button type="button" data-source-action="retire-source" aria-label="Aposentar fonte" title="Aposentar fonte">${renderUiIcon("trash", "course-authoring-button-icon")}</button>`
        : "") + "</div>" : "") + "</header>" +
    `<p class="course-source-display-title" tabindex="0">${escapeHtml(sourceTitle(source))}</p>` +
    `<details class="source-reference-fields"${sourceDisclosure(state, "reference")}><summary>Referência e dados</summary>` +
    referenceMarkup(source, state) + '<dl class="course-source-metadata">' +
        `<div><dt>Tipo</dt><dd>${escapeHtml(SOURCE_KINDS[source.kind] || "Fonte")}</dd></div>` +
        `<div><dt>Papéis sugeridos</dt><dd>${escapeHtml(source.defaultRoles.map(role => SOURCE_ROLES[role]).join(", ") || "Nenhum")}</dd></div>` +
        `<div><dt>Autoria</dt><dd>${escapeHtml(source.authors.map(name => name.literal || [name.given, name.family].filter(Boolean).join(" ")).join("; ") || "Não informada")}</dd></div>` +
        `<div><dt>Publicação</dt><dd>${escapeHtml(source.publicationDate || "Não informada")}</dd></div>` +
        `<div><dt>Identificador</dt><dd>${escapeHtml(source.identifier || "Não informado")}</dd></div>` +
        `<div><dt>Idioma</dt><dd>${escapeHtml(source.language || "Não informado")}</dd></div>` +
        `<div><dt>Referência</dt><dd>${source.citationMode === "manual" ? "Escrita pelo autor" : "Gerada no estilo do curso"}</dd></div>` +
        `<div><dt>Edição</dt><dd>${escapeHtml(source.editionOrVersion || "Não informada")}</dd></div>` +
        `<div><dt>Origem</dt><dd>${escapeHtml(SOURCE_ORIGINS[source.origin])}</dd></div>` +
        `<div><dt>Disponibilidade</dt><dd>${escapeHtml(SOURCE_AVAILABILITIES[source.availability])}</dd></div>` +
        `<div><dt>Verificação</dt><dd>${escapeHtml(SOURCE_VERIFICATIONS[source.verificationStatus])}</dd></div>` +
        `<div><dt>Estudo</dt><dd>${escapeHtml(SOURCE_VISIBILITIES[source.studyVisibility])}</dd></div>` +
        Object.entries(BIBLIOGRAPHIC_FIELD_LABELS).filter(([key]) => source.bibliographic[key]).map(([key, label]) =>
          `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(source.bibliographic[key])}</dd></div>`).join("") +
        `<div><dt>Link</dt><dd>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : escapeHtml(source.url || "Não informado")}</dd></div></dl>` +
        `<p class="course-source-availability-note">${escapeHtml(sourceAvailabilityNote(source))}</p></details>` +
    `<details class="course-source-detail-section"${sourceDisclosure(state, "files")}><summary>Arquivos</summary>` +
    renderSourceAttachments(source, 0, state) + '</details>' +
    `<details class="course-source-detail-section"${sourceDisclosure(state, "anchors")}><summary>Âncoras</summary>` +
    `<section class="course-source-anchors"><header><div><h4 class="visually-hidden">Âncoras</h4><p>${source.anchors.length}</p></div>` +
    (source.status === "active"
      ? '<button type="button" data-source-action="add-anchor" aria-label="Adicionar âncora" title="Adicionar âncora">' +
        `${renderUiIcon("add", "course-authoring-button-icon")}</button>`
      : "") + "</header>" +
    renderAnchorForm(state) +
    (source.anchors.length
      ? `<div class="course-source-anchor-list">${source.anchors.map((anchor) => renderAnchor(anchor, source.revision, state)).join("")}</div>`
      : '<p class="course-source-empty">Nenhuma âncora.</p>') + "</section></details>" +
    `<details class="course-source-detail-section"${sourceDisclosure(state, "observations")}><summary>Observações</summary>` +
    renderSourceObservations(state, source) + "</details></article>";
}

function renderSourceDetail(state) {
  const items = state.detail?.items || [];
  const content = state.detailLoading && !state.detail ? '<p role="status">Carregando fonte…</p>' :
    state.detailFailure && !state.detail ? `<p role="alert">${escapeHtml(state.detailFailure)}</p>` +
      '<button type="button" data-source-action="retry-detail" aria-label="Tentar novamente" title="Tentar novamente">' +
      `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>` : state.sourceEditor ? renderSourceForm(state) :
      items.length ? `<div class="course-source-current-view">${renderSource(items[0], state)}</div>` :
        '<p class="course-source-empty">A fonte não está disponível.</p>';
  return '<div class="course-source-detail-overlay" data-source-detail-backdrop>' +
    '<section class="course-source-detail" data-source-detail-dialog role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="course-source-detail-title">' +
    '<header class="course-source-detail-heading"><button type="button" data-source-action="close-detail" aria-label="Voltar ao catálogo" title="Voltar ao catálogo">' +
    `${renderUiIcon("arrow-left", "course-authoring-button-icon")}</button><div>` +
    '<h2 id="course-source-detail-title">Fonte</h2></div></header>' +
    '<div class="course-source-detail-body">' + renderNotice(state) + content + '</div>' +
    '</section>' + renderSourceConfirmation(state) + '</div>';
}

function renderCatalogCard(source, state, { selectable = false, selected = false } = {}) {
  const action = selectable ? "add-target-source" : "open-source";
  return `<article class="course-source-card${selected ? " is-selected" : ""}">` +
    '<div class="course-source-card-copy" tabindex="0" role="region" aria-label="Fonte">' +
    sourceStatusMarkup(source) + `<strong>${escapeHtml(sourceTitle(source))}</strong>` +
    (selectable && selected ? '<small>Já usada neste item</small>' : '') + '</div>' +
    `<button type="button" data-source-action="${action}" data-source-id="${escapeHtml(source.sourceId)}"` +
    ` aria-label="${selectable ? selected ? "Adicionar outro vínculo" : "Vincular fonte" : "Abrir fonte"}: ${escapeHtml(sourceTitle(source))}" title="${selectable ? "Vincular fonte" : "Abrir fonte"}">` +
    (selectable ? selected ? renderUiIcon("save", "course-authoring-arrow") : renderUiIcon("add", "course-authoring-arrow") : renderUiIcon("arrow-right", "course-authoring-arrow")) +
    "</button></article>";
}

function renderCatalog(state, { selectable = false } = {}) {
  if (state.catalogLoading && !state.catalog) {
    return '<p class="course-authoring-loading" role="status">Carregando fontes…</p>';
  }
  if (state.catalogFailure && !state.catalog) {
    return `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.catalogFailure)}</p>` +
      '<button type="button" data-source-action="retry-catalog" aria-label="Tentar novamente" title="Tentar novamente">' +
      `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>`;
  }
  const items = state.catalog?.items || [];
  const selected = new Set(state.sourceLinks.map(({ sourceId }) => sourceId));
  return (items.length
    ? `<div class="course-source-catalog" data-source-count="${items.length}">${items.map((source) =>
        renderCatalogCard(source, state, { selectable, selected: selected.has(source.sourceId) })).join("")}</div>`
    : '<p class="course-source-empty">Sem fontes cadastradas.</p>') +
    (state.catalog?.nextCursor
      ? `<button type="button" class="course-authoring-more" data-source-action="load-more-sources" aria-label="Carregar mais fontes" title="Carregar mais fontes"${state.catalogLoading ? " disabled" : ""}>` +
        `${renderUiIcon("arrow-down", "course-authoring-button-icon")}</button>`
      : "") + (state.catalogFailure && state.catalog
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.catalogFailure)}</p>`
      : "");
}

function renderCatalogPanel(state) {
  const pdfStorage = state.catalog?.pdfStorage;
  const overlay = state.selectedSourceId ? renderSourceDetail(state) : state.sourceEditor ?
    '<div class="course-source-detail-overlay" data-source-detail-backdrop><section class="course-source-detail" data-source-detail-dialog role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="course-source-new-title">' +
    '<header class="course-source-detail-heading"><button type="button" data-source-action="close-detail" aria-label="Voltar ao catálogo" title="Voltar ao catálogo">' +
    renderUiIcon("arrow-left", "course-authoring-button-icon") + '</button><div><h2 id="course-source-new-title">Nova fonte</h2></div></header>' +
    '<div class="course-source-detail-body">' + renderNotice(state) + renderSourceForm(state) + '</div></section>' + renderSourceConfirmation(state) + '</div>' : '';
  return `<section class="course-authoring-section course-sources-panel" aria-labelledby="course-authoring-section-title"${overlay ? ' inert aria-hidden="true"' : ''}>` +
    '<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Fontes</h2>' +
    '<header class="course-authoring-section-toolbar" aria-label="Ações de fontes">' +
    `<span class="course-source-catalog-summary">${state.catalog?.items.length || 0}${state.catalog?.nextCursor ? "+" : ""} ${state.catalog?.items.length === 1 && !state.catalog?.nextCursor ? "fonte" : "fontes"}</span>` +
    '<button type="button" class="course-source-primary-action" data-source-action="add-source" aria-label="Nova fonte" title="Nova fonte">' +
    `${renderUiIcon("add", "course-authoring-button-icon")}</button></header>` +
    renderNotice(state) +
    `<details class="source-reference-fields" data-source-bibliography-settings${state.styleSettingsOpen ? " open" : ""}><summary>Estilo das referências</summary>` +
    '<form data-source-form="bibliography-style"><label>Estilo do curso<select name="bibliographyStyle">' +
    Object.entries({ "abnt-2025": "ABNT · 2025", apa7: "APA · 7ª edição" }).map(([style, label]) =>
      `<option value="${style}"${style === (state.bibliographyStyleDraft || bibliographyStyle(state)) ? " selected" : ""}>${label}</option>`).join("") + '</select></label>' +
    `<button type="submit" aria-label="Salvar estilo" title="Salvar estilo"${state.busy || state.pendingCommand || state.sourceEditor ? " disabled" : ""}>${renderUiIcon("save", "course-authoring-button-icon")}</button></form>` +
    (state.sourceEditor ? '<p>Salve ou cancele a referência aberta antes de aplicar outro estilo.</p>' : "") +
    '<p>O estilo formata as referências geradas. As referências escritas pelo autor são preservadas.</p>' +
    (pdfStorage ? `<p>Arquivos do curso (PDFs e áudios): ${byteSizeLabel(pdfStorage.uniqueBytes)} de ${byteSizeLabel(pdfStorage.maxUniqueBytes)}.</p>` : "") + '</details>' +
    renderCatalog(state) + "</section>" + overlay;
}

function sourceForLink(state, link) {
  const detail = state.targetDetails.get(link.sourceId)?.items[0] || null;
  if (detail) return detail;
  const current = state.catalog?.items.find(({ sourceId }) => sourceId === link.sourceId);
  return current || null;
}

function anchorsForLink(state, link) {
  return sourceForLink(state, link)?.anchors || [];
}

function renderTargetLink(state, link, index) {
  const source = sourceForLink(state, link);
  const anchors = anchorsForLink(state, link);
  const selectedAnchors = new Set(link.anchors.map(({ anchorId }) => anchorId));
  const currentAnchors = new Map(anchors
    .map((anchor) => [anchor.anchorId, anchor]));
  const loading = state.targetDetailsLoading.has(link.sourceId);
  const unavailable = !source && !loading;
  const unavailableReference = !loading && source && (
    source.status !== "active" ||
    link.anchors.some(({ anchorId }) => {
      const currentAnchor = currentAnchors.get(anchorId);
      return currentAnchor?.status !== "active";
    })
  );
  const relationOptions = Object.entries(SOURCE_RELATIONS).map(([value, label]) =>
    `<option value="${value}"${link.relation === value ? " selected" : ""}>${escapeHtml(label)}</option>`
  ).join("");
  return '<article class="course-source-target-link">' +
    '<header><div>' + (source ? sourceStatusMarkup(source) : "") +
    `<strong>${escapeHtml(source ? sourceTitle(source) : "Fonte vinculada")}</strong>` +
    `<span>${unavailableReference || unavailable ? "Atualização necessária" : "Fonte corrente"}</span></div>` +
    '<div class="course-source-compact-actions">' +
    `<button type="button" data-source-action="move-target-source-up" data-link-id="${escapeHtml(link.linkId)}"${index === 0 ? " disabled" : ""} aria-label="Mover fonte para cima">${renderUiIcon("arrow-up", "course-authoring-button-icon")}</button>` +
    `<button type="button" data-source-action="move-target-source-down" data-link-id="${escapeHtml(link.linkId)}"${index === state.sourceLinks.length - 1 ? " disabled" : ""} aria-label="Mover fonte para baixo">${renderUiIcon("arrow-down", "course-authoring-button-icon")}</button>` +
    `<button type="button" data-source-action="open-source" data-source-id="${escapeHtml(link.sourceId)}" aria-label="Abrir fonte: ${escapeHtml(source ? sourceTitle(source) : "Fonte vinculada")}" title="Abrir fonte">${renderUiIcon("study", "course-authoring-button-icon")}</button>` +
    `<button type="button" data-source-action="remove-target-source" data-link-id="${escapeHtml(link.linkId)}" aria-label="Remover vínculo">${renderUiIcon("trash", "course-authoring-button-icon")}</button></div></header>` +
    (source ? referenceMarkup(source, state) : "") +
    (unavailableReference
      ? '<p class="course-authoring-notice is-error">A fonte ou uma âncora vinculada não está mais ativa. Ajuste o vínculo.</p>'
      : "") +
    `<label class="course-source-relation"><span>Relação com o item</span><select data-source-target-relation data-link-id="${escapeHtml(link.linkId)}">${relationOptions}</select></label>` +
    '<fieldset class="source-default-roles"><legend>Papéis neste uso</legend>' + Object.entries(SOURCE_ROLES).map(([role, label]) =>
      `<label><input type="checkbox" data-source-target-role="${role}" data-link-id="${escapeHtml(link.linkId)}"${link.roles.includes(role) ? " checked" : ""}>${escapeHtml(label)}</label>`).join("") + '</fieldset>' +
    (unavailable
      ? '<p class="course-authoring-notice is-error">A fonte corrente não está disponível. Remova este vínculo e escolha outra fonte.</p>'
      : loading
        ? '<p class="course-authoring-loading">Carregando âncoras…</p>'
        : anchors.filter(({ status }) => status === "active").length
          ? '<fieldset class="course-source-anchor-choices"><legend>Âncoras usadas</legend>' +
            anchors.filter(({ status }) => status === "active").map((anchor) =>
              `<label><input type="checkbox" data-source-target-anchor data-link-id="${escapeHtml(link.linkId)}" data-anchor-id="${escapeHtml(anchor.anchorId)}"${selectedAnchors.has(anchor.anchorId) ? " checked" : ""}>` +
              `<span>${escapeHtml(anchorLabel(anchor))}</span></label>`).join("") + "</fieldset>"
          : '<p class="course-source-empty">Referência à obra inteira. Uma citação direta exige um localizador na fonte.</p>') +
    renderSourceOccurrenceForm(state, link) +
    "</article>";
}

function renderTargetPanel(state) {
  const selected = state.sourceLinks.length
    ? `<div class="course-source-target-links">${state.sourceLinks.map((link, index) =>
        renderTargetLink(state, link, index)).join("")}</div>`
    : '<p class="course-source-empty">Sem fontes vinculadas.</p>';
  const header = '<section class="course-source-target-dialog" data-source-target-dialog tabindex="-1"' +
    ' role="dialog" aria-modal="true" aria-labelledby="course-source-target-title">' +
    '<header><span class="course-source-target-header-space" aria-hidden="true"></span>' +
    '<div>' +
    `<h2 id="course-source-target-title">${state.targetLabel
      ? `Fontes de ${escapeHtml(state.targetLabel)}`
      : "Fontes deste item"}</h2></div>` +
    '<button type="button" data-source-action="close-target" aria-label="Fechar" title="Fechar">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}</button></header>`;
  if (state.selectedSourceId) {
    return renderSourceDetail(state);
  }
  return header +
    '<div class="course-source-target-body">' +
    renderNotice(state) + renderSourceConfirmation(state) +
    (state.targetLoading
      ? '<p class="course-authoring-loading" role="status">Carregando atribuição…</p>'
      : state.targetFailure
        ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.targetFailure)}</p>` +
          '<button type="button" data-source-action="retry-target" aria-label="Tentar novamente" title="Tentar novamente">' +
          `${renderUiIcon("rotate", "course-authoring-button-icon")}</button>`
        : '<section class="course-source-selected"><h3>Vinculadas</h3>' + selected +
          '<div class="course-source-target-actions">' +
          `<button type="button" class="course-source-export-target" data-source-action="export-target" aria-label="Exportar proveniência" title="Exportar proveniência"${targetExportReady(state) && !state.busy ? "" : " disabled"}>` +
          `${renderUiIcon("arrow-down", "course-authoring-button-icon")}</button>` +
          `<button type="button" class="course-source-save-target" data-source-action="save-target" aria-label="Salvar fontes" title="Salvar fontes"${state.busy ? " disabled" : ""}>` +
          `${renderUiIcon("save", "course-authoring-button-icon")}</button></div></section>`) +
    '<section class="course-source-available"><h3>Catálogo</h3>' +
    renderCatalog(state, { selectable: true }) + "</section></div></section>";
}

function targetExportReady(state) {
  if (state.targetAttribution === undefined || state.targetLoading || state.targetFailure ||
      state.targetDetailsLoading.size ||
      JSON.stringify(state.sourceLinks) !== JSON.stringify(state.initialSourceLinks)) {
    return false;
  }
  return state.sourceLinks.every((link) => {
    const source = sourceForLink(state, link);
    return source && Array.isArray(source.anchors) &&
      link.anchors.every(({ anchorId }) =>
        source.anchors.some((anchor) => anchor.anchorId === anchorId));
  });
}

function buildTargetExport(state, exportedAt) {
  if (!targetExportReady(state)) {
    throw new TypeError("Salve e carregue a atribuição completa antes de exportar.");
  }
  return {
    contract: "aralearn.course-source-attribution-export.v3",
    exportedAt,
    course: { revision: state.courseRevision, bibliographyStyle: bibliographyStyle(state) },
    target: {
      kind: state.targetKind,
      version: state.targetVersion,
      label: state.targetLabel || null
    },
    sources: state.sourceLinks.map((link) => {
      const source = sourceForLink(state, link);
      const { anchors, attachments, ...metadata } = source;
      return {
        linkId: link.linkId,
        relation: link.relation,
        roles: [...link.roles],
        occurrences: structuredClone(link.occurrences),
        source: {
          sourceId: metadata.sourceId,
          status: metadata.status,
          kind: metadata.kind,
          title: metadata.title,
          authors: metadata.authors,
          bibliographic: metadata.bibliographic,
          citationMode: metadata.citationMode,
          defaultRoles: metadata.defaultRoles,
          publicationDate: metadata.publicationDate,
          identifier: metadata.identifier,
          language: metadata.language,
          citationText: metadata.citationText,
          url: metadata.url,
          editionOrVersion: metadata.editionOrVersion,
          origin: metadata.origin,
          availability: metadata.availability,
          verificationStatus: metadata.verificationStatus,
          studyVisibility: metadata.studyVisibility
        },
        anchors: link.anchors.map(({ anchorId }) => {
          const anchor = anchors.find((candidate) => candidate.anchorId === anchorId);
          return {
            anchorId: anchor.anchorId,
            status: anchor.status,
            selector: anchor.selector,
            humanLocator: anchor.humanLocator,
            contentHash: anchor.contentHash,
            verificationExcerpt: anchor.verificationExcerpt
          };
        }),
        attachments: attachments.map(({ contentHash, byteSize, mediaType, createdAt }) => ({
          contentHash, byteSize, mediaType, createdAt
        }))
      };
    })
  };
}

export function renderCourseSourcesPanel(state = {}) {
  return state.mode === "target" ? renderTargetPanel(state) : renderCatalogPanel(state);
}

function assertDependencies(root, controller, options) {
  if (!root || typeof root.addEventListener !== "function") {
    throw new TypeError("A área de fontes é inválida.");
  }
  const methods = ["loadCourseSources", "mutateCourseSources"];
  if (options?.mode === "catalog") {
    methods.push("loadCourseAnchoredAnnotations", "mutateCourseAnchoredAnnotations");
  }
  for (const method of methods) {
    if (typeof controller?.[method] !== "function") {
      throw new TypeError("O controle de cursos não oferece o recurso necessário.");
    }
  }
  if (!options?.courseId || !Number.isSafeInteger(options.courseRevision) ||
      options.courseRevision < 1 || !["catalog", "target"].includes(options.mode)) {
    throw new TypeError("O contexto de fontes é inválido.");
  }
  if (options.mode === "target" &&
      (!new Set(["plan_item", "study_unit"]).has(options.targetKind) || !options.targetId ||
       !Number.isSafeInteger(options.targetVersion) || options.targetVersion < 1)) {
    throw new TypeError("O item relacionado às fontes é inválido.");
  }
  if (options.initialSourceId !== null &&
      (options.mode !== "catalog" || !validLiteralSourceId(options.initialSourceId)) ||
      options.initialAnchorId !== null &&
      (options.initialSourceId === null || !validAnchorId(options.initialAnchorId))) {
    throw new TypeError("O endereço da fonte é inválido.");
  }
}

export function createCourseSourcesPanel({
  root,
  controller,
  courseId,
  courseRevision,
  coursePublicFileAccess = null,
  mode = "catalog",
  targetKind = null,
  targetId = null,
  targetVersion = null,
  targetLabel = "",
  targetStudyUnit = null,
  initialSourceId = null,
  initialAnchorId = null,
  returnFocusSourceId = null,
  onNavigate = null,
  documentValue = root?.ownerDocument || globalThis.document || null,
  downloadUrl = (url) => {
    const anchor = globalThis.document?.createElement?.("a");
    if (!anchor) throw new TypeError("O navegador não oferece download de arquivos.");
    anchor.href = url;
    anchor.download = "";
    anchor.rel = "noreferrer";
    anchor.click();
  },
  downloadJson = (value, filename) => downloadTextFile({
    name: filename,
    type: "application/json",
    content: `${JSON.stringify(value, null, 2)}\n`
  }),
  now = () => new Date().toISOString(),
  onCourseRevisionChange = () => {},
  onTargetSaved = () => {},
  onClose = () => {}
} = {}) {
  const options = {
    courseId, courseRevision, mode, targetKind, targetId, targetVersion,
    initialSourceId, initialAnchorId
  };
  assertDependencies(root, controller, options);
  if (onNavigate !== null && typeof onNavigate !== "function") {
    throw new TypeError("A navegação contextual de fontes é inválida.");
  }
  if (typeof downloadUrl !== "function") throw new TypeError("Abertura de anexo inválida.");
  if (typeof downloadJson !== "function" || typeof now !== "function") {
    throw new TypeError("Exportação de proveniência inválida.");
  }
  let epoch = 0;
  const state = {
    opened: false,
    mode,
    courseId,
    courseRevision,
    coursePublicFileAccess: ["restricted", "available"].includes(coursePublicFileAccess)
      ? coursePublicFileAccess : null,
    canSetFileAccess: typeof controller.setCourseSourceFileAccess === "function",
    catalog: null,
    catalogLoading: false,
    catalogFailure: "",
    selectedSourceId: initialSourceId ?? "",
    initialSourceId,
    initialAnchorId,
    initialAnchorMatch: null,
    detail: null,
    detailLoading: false,
    detailFailure: "",
    detailSections: [],
    sourceEditor: null,
    anchorEditor: null,
    targetKind,
    targetId,
    targetVersion,
    targetLabel,
    targetStudyUnit,
    occurrenceEditor: null,
    references: new Map(),
    bibliographyStyleDraft: null,
    styleSettingsOpen: false,
    targetAttribution: undefined,
    targetLoading: false,
    targetFailure: "",
    sourceLinks: [],
    initialSourceLinks: [],
    targetDetails: new Map(),
    targetDetailsLoading: new Set(),
    busy: false,
    message: "",
    failure: "",
    pendingCommand: null,
    annotations: null,
    annotationsLoading: false,
    annotationsFailure: "",
    pendingAnnotation: null,
    observationEditor: null,
    pendingAttachment: null,
    pendingFileAccess: null,
    fileAccessDraft: null,
    fileAccessConflict: null,
    confirmation: null
  };

  function render() {
    if (!state.opened) return;
    const active = documentValue?.activeElement;
    const detailBody = root.querySelector?.(".course-source-detail-body");
    const detailScroll = Number(detailBody?.scrollTop || 0);
    const activeAction = active?.dataset?.sourceAction;
    const detailAction = active?.closest?.("[data-source-detail-dialog]") && activeAction
      ? { action: activeAction, anchorId: active.dataset.anchorId } : null;
    if (typeof root.querySelectorAll === "function" && root.querySelector?.("[data-source-disclosure]")) {
      state.detailSections = [...root.querySelectorAll("[data-source-disclosure][open]")].map(node => node.dataset.sourceDisclosure);
    }
    const styleSettings = root.querySelector?.("[data-source-bibliography-settings]");
    if (typeof styleSettings?.open === "boolean") state.styleSettingsOpen = styleSettings.open;
    const currentForm = root.querySelector?.('[data-source-form="source"]');
    if (state.sourceEditor && currentForm?.elements?.sourceId?.value ===
        (state.sourceEditor.draft?.sourceId || state.sourceEditor.source?.sourceId)) {
      state.sourceEditor.openSections = [...(currentForm.querySelectorAll?.("details[data-source-section][open]") || [])]
        .map(node => node.dataset.sourceSection);
    }
    const editorFocus = root.contains?.(active) && active?.form?.dataset?.sourceForm && active.name ? {
      kind: active.form.dataset.sourceForm, name: active.name,
      selection: Number.isInteger(active.selectionStart) ? [active.selectionStart, active.selectionEnd] : null
    } : null;
    const targetFocus = state.mode === "target" && root.contains?.(active) ? {
      selector: ["data-source-action", "data-source-target-relation", "data-source-target-anchor", "data-source-occurrence-target", "data-source-occurrence-selection"]
        .find(attribute => active?.hasAttribute?.(attribute)),
      identity: Object.fromEntries(["sourceAction", "linkId", "anchorId", "sourceTargetRole"]
        .filter(key => active?.dataset?.[key] !== undefined).map(key => [key, active.dataset[key]]))
    } : null;
    const selection = root.querySelector?.("[data-source-occurrence-selection]");
    if (state.occurrenceEditor && selection?.dataset?.linkId === state.occurrenceEditor.linkId &&
        Number(selection.dataset.sourceOccurrenceIndex) === state.occurrenceEditor.targetIndex) {
      state.occurrenceEditor.selection = [selection.selectionStart, selection.selectionEnd];
    }
    root.innerHTML = renderCourseSourcesPanel(state);
    const nextDetailBody = root.querySelector?.(".course-source-detail-body");
    if (nextDetailBody) nextDetailBody.scrollTop = detailScroll;
    void hydrateReferences();
    const currentSelection = root.querySelector?.("[data-source-occurrence-selection]");
    if (state.occurrenceEditor?.selection && currentSelection?.setSelectionRange) {
      currentSelection.setSelectionRange(...state.occurrenceEditor.selection);
    }
    if (editorFocus && !state.confirmation && focusEditorField(editorFocus.kind, editorFocus.name)) {
      if (editorFocus.selection) root.querySelector?.(`[data-source-form="${editorFocus.kind}"] [name="${editorFocus.name}"]`)
        ?.setSelectionRange?.(...editorFocus.selection);
    } else if ((state.selectedSourceId || state.mode === "catalog" && state.sourceEditor) && !state.confirmation) {
      const restored = detailAction && [...(root.querySelectorAll?.("[data-source-action]") || [])]
        .find(node => node.dataset.sourceAction === detailAction.action && node.dataset.anchorId === detailAction.anchorId);
      if (restored) restored.focus?.({ preventScroll: true });
      else focus("[data-source-detail-dialog]");
    } else if (state.mode === "target" && !state.confirmation) {
      const restored = targetFocus?.selector && [...(root.querySelectorAll?.(`[${targetFocus.selector}]`) || [])]
        .find(node => Object.entries(targetFocus.identity).every(([key, value]) => node.dataset[key] === value));
      if (restored) restored.focus?.({ preventScroll: true });
      else focus("[data-source-target-dialog]");
    }
  }

  async function hydrateReferences() {
    const sources = [...(state.catalog?.items || []), ...(state.detail?.items || []),
      ...[...state.targetDetails.values()].flatMap(page => page.items)];
    const requests = new Map(sources.map(source => [referenceKey(source, state), source]));
    const style = bibliographyStyle(state);
    await Promise.all([...requests].map(async ([key, source]) => {
      if (!state.references.has(key)) {
        try { state.references.set(key, await formatCourseSourceReference(source, { style })); }
        catch { state.references.set(key, { text: "Não foi possível formatar esta referência. Confira os dados.", runs: [] }); }
      }
      if (!state.opened) return;
      for (const element of root.querySelectorAll?.("[data-source-reference-key]") || []) {
        if (element.dataset.sourceReferenceKey === key) {
          element.innerHTML = renderBibliographicReference(state.references.get(key)) || "A referência ainda não tem dados suficientes.";
        }
      }
    }));
  }

  function captureSourceDraft(form) {
    if (!state.sourceEditor || !form?.matches?.('[data-source-form="source"]')) return false;
    const current = state.sourceEditor.draft || sourceDraft(state.sourceEditor.source);
    state.sourceEditor.draft = sourceDraftFromForm(form, current);
    if (typeof form.querySelectorAll === "function") {
      state.sourceEditor.openSections = [...form.querySelectorAll("details[data-source-section][open]")]
        .map(node => node.dataset.sourceSection);
    }
    return true;
  }

  async function previewSourceReference() {
    const editor = state.sourceEditor;
    if (!editor) return false;
    captureSourceDraft(root.querySelector?.('[data-source-form="source"]'));
    const draft = structuredClone(editor.draft);
    const preview = root.querySelector?.("[data-source-reference-preview]");
    if (preview) preview.textContent = "Preparando referência…";
    try {
      const reference = await formatCourseSourceReference({ sourceId: draft.sourceId,
        ...normalizeCourseSourceDocument(sourceDocumentFromBibliographyDraft(draft)) }, {
        style: state.catalog?.bibliographyStyle || state.detail?.bibliographyStyle || "abnt-2025"
      });
      if (!state.opened || state.sourceEditor !== editor || JSON.stringify(editor.draft) !== JSON.stringify(draft)) return false;
      const current = root.querySelector?.("[data-source-reference-preview]");
      if (current) current.innerHTML = reference.text ? renderBibliographicReference(reference) : "A referência ainda não tem dados suficientes.";
      return true;
    } catch (error) {
      if (state.sourceEditor !== editor) return false;
      const current = root.querySelector?.("[data-source-reference-preview]");
      if (current) current.textContent = errorMessage(error, "Não foi possível preparar a referência. Confira os dados informados.");
      return false;
    }
  }

  function captureAnchorDraft(form) {
    if (!state.anchorEditor || !form?.matches?.('[data-source-form="anchor"]')) return false;
    const current = state.anchorEditor.draft || anchorDraft(state.anchorEditor.anchor);
    state.anchorEditor.draft = anchorDraftFromForm(form, current);
    return true;
  }

  function captureObservationDraft(form, focusField = "") {
    if (!form?.matches?.('[data-source-form="observation"]')) return false;
    const source = state.detail?.items?.[0] || null;
    if (!source || source.status !== "active") return false;
    const current = state.observationEditor?.sourceId === source.sourceId
      ? state.observationEditor
      : {
        sourceId: source.sourceId,
        draft: null,
        annotationId: null,
        capturedAt: null,
        focusField: ""
      };
    current.draft = observationDraftFromForm(form, current.draft || {
      observationKind: "note",
      targetId: "",
      rawText: ""
    });
    if (focusField) current.focusField = focusField;
    state.observationEditor = current;
    return true;
  }

  function captureEditorDraftFromControl(control) {
    const form = control?.form || control?.closest?.("form[data-source-form]");
    return captureSourceDraft(form) || captureAnchorDraft(form) ||
      captureObservationDraft(form, control?.name || "");
  }

  function focus(selector) {
    const control = root.querySelector?.(selector);
    control?.focus?.({ preventScroll: true });
    return Boolean(control);
  }

  function focusEditorField(kind, fieldName) {
    if (!/^(?:source|anchor|observation)$/u.test(kind) ||
        !/^[a-z][a-zA-Z0-9_]*$/u.test(fieldName || "")) {
      return false;
    }
    return focus(`[data-source-form="${kind}"] [name="${fieldName}"]`);
  }

  function restoreObservationDraftFocus() {
    const editor = state.observationEditor;
    if (!editor || editor.sourceId !== state.selectedSourceId) return false;
    return focusEditorField("observation", editor.focusField || "rawText");
  }

  function focusByIdentity({ selector, datasetKey, datasetValue } = {}) {
    if (!selector || !datasetKey || typeof root.querySelectorAll !== "function") return false;
    const control = [...root.querySelectorAll(selector)].find((candidate) =>
      String(candidate?.dataset?.[datasetKey] ?? "") === String(datasetValue ?? ""));
    control?.focus?.({ preventScroll: true });
    return Boolean(control);
  }

  function targetLinksChanged() {
    return state.mode === "target" &&
      JSON.stringify(state.sourceLinks) !== JSON.stringify(state.initialSourceLinks);
  }

  function focusTargetOpener() {
    if (typeof documentValue?.querySelectorAll !== "function") return false;
    const identity = state.targetKind === "plan_item"
      ? {
          selector: '[data-course-authoring-action="edit-plan-item-sources"]',
          datasetKey: "itemId"
        }
      : {
          selector: "[data-inspection-edit-sources]",
          datasetKey: "studyUnitId"
        };
    const control = [...documentValue.querySelectorAll(identity.selector)].find((candidate) =>
      String(candidate?.dataset?.[identity.datasetKey] ?? "") === String(state.targetId));
    if (!control) return false;
    let details = control.closest?.("details") || null;
    while (details) {
      details.open = true;
      details = details.parentElement?.closest?.("details") || null;
    }
    control.focus?.({ preventScroll: true });
    return true;
  }

  function closeTarget() {
    if (state.mode !== "target") return false;
    onClose();
    globalThis.queueMicrotask?.(() => focusTargetOpener());
    return true;
  }

  function closeDetail() {
    const sourceId = state.selectedSourceId;
    state.selectedSourceId = "";
    state.detail = null;
    state.detailFailure = "";
    state.annotations = null;
    state.annotationsFailure = "";
    state.initialSourceId = null;
    state.initialAnchorId = null;
    state.initialAnchorMatch = null;
    state.sourceEditor = null;
    state.anchorEditor = null;
    state.observationEditor = null;
    state.detailSections = [];
    if (typeof onNavigate === "function") {
      invokeSafely(onNavigate, buildCourseAuthoringRoute(state.courseId, { section: "sources" }), { sourceReturnFocusId: sourceId });
    } else {
      render();
      const restore = () => sourceId
        ? focusByIdentity({ selector: '[data-source-action="open-source"]', datasetKey: "sourceId", datasetValue: sourceId })
        : focus('[data-source-action="add-source"]');
      if (!state.catalog) void loadCatalog().then(restore);
      else restore();
    }
    return true;
  }

  function requestDetailClose() {
    if (state.busy || !state.selectedSourceId && !state.sourceEditor) return false;
    const active = documentValue?.activeElement;
    const activeForm = active?.closest?.("[data-source-form]");
    const returnEditorFocus = activeForm && active?.name ? {
      kind: activeForm.dataset.sourceForm, name: active.name,
      selection: typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null
    } : null;
    if (state.sourceEditor || state.anchorEditor || state.observationEditor?.draft || state.pendingAttachment ||
        state.pendingAnnotation || state.pendingFileAccess || state.fileAccessDraft ||
        state.pendingCommand && state.pendingCommand.command?.type !== "set_target_sources") {
      requestConfirmation({ action: "confirm-detail-discard", title: "Fechar fonte?",
        message: state.pendingCommand || state.pendingAttachment || state.pendingAnnotation || state.pendingFileAccess
          ? "A resposta não chegou. A alteração pode ter sido salva; fechar encerra a recuperação do pedido e não desfaz o que já foi aplicado."
          : "As alterações desta fonte ainda não foram salvas. Descartar e fechar?",
        confirmLabel: "Descartar e fechar", returnFocusSelector: '[data-source-action="close-detail"]', returnEditorFocus });
      return true;
    }
    return closeDetail();
  }

  function requestTargetClose() {
    if (state.mode !== "target" || state.busy) return false;
    if (!targetLinksChanged() && !state.pendingCommand && !state.pendingFileAccess && !state.fileAccessDraft) return closeTarget();
    const awaitingConfirmation = Boolean(state.pendingCommand || state.pendingFileAccess);
    requestConfirmation({
      action: "confirm-target-discard",
      title: awaitingConfirmation ? "Abandonar confirmação?" : "Descartar alterações?",
      message: awaitingConfirmation
        ? "A resposta da gravação não chegou. A operação pode ter sido aplicada; fechar abandona a repetição segura deste mesmo pedido."
        : "As mudanças neste conjunto de fontes ainda não foram salvas.",
      confirmLabel: awaitingConfirmation ? "Fechar mesmo assim" : "Descartar",
      returnFocusSelector: '[data-source-action="close-target"]'
    });
    return true;
  }

  function cancelConfirmation({ restoreFocus = true } = {}) {
    const confirmation = state.confirmation;
    if (!confirmation) return false;
    state.confirmation = null;
    render();
    if (restoreFocus && confirmation.returnEditorFocus && focusEditorField(confirmation.returnEditorFocus.kind, confirmation.returnEditorFocus.name)) {
      if (confirmation.returnEditorFocus.selection) documentValue?.activeElement?.setSelectionRange?.(...confirmation.returnEditorFocus.selection);
    } else if (restoreFocus && confirmation.returnFocusIdentity) {
      focusByIdentity(confirmation.returnFocusIdentity);
    } else if (restoreFocus) focus(confirmation.returnFocusSelector);
    return true;
  }

  function requestConfirmation(confirmation) {
    state.confirmation = confirmation;
    render();
    focus('[data-source-action="cancel-confirmation"]');
  }

  function confirmRetirement() {
    const confirmation = state.confirmation;
    if (!confirmation || state.busy) return;
    state.confirmation = null;
    void runCommand(confirmation.command, confirmation.draft);
  }

  function confirmTargetDiscard() {
    if (state.confirmation?.action !== "confirm-target-discard" || state.busy) return;
    state.confirmation = null;
    closeTarget();
  }

  function handleKeyDown(event) {
    if (state.confirmation && event.key === "Tab") {
      trapAuthoringConfirmationTab({
        event,
        root,
        confirmationSelector: "[data-source-confirmation]",
        documentValue
      });
      return;
    }
    if (!state.confirmation && (state.selectedSourceId || state.mode === "catalog" && state.sourceEditor || state.mode === "target") && event.key === "Tab") {
      trapAuthoringConfirmationTab({
        event,
        root,
        confirmationSelector: state.selectedSourceId || state.mode === "catalog" && state.sourceEditor
          ? "[data-source-detail-dialog]" : "[data-source-target-dialog]",
        documentValue
      });
      return;
    }
    if (event.key !== "Escape") return;
    const handled = state.confirmation ? cancelConfirmation() :
      state.selectedSourceId || state.mode === "catalog" && state.sourceEditor ? requestDetailClose() : requestTargetClose();
    if (handled) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
  }

  function handleDocumentClick(event) {
    if (state.confirmation && event.target?.matches?.("[data-source-confirmation-backdrop]")) {
      cancelConfirmation();
      return;
    }
    if (!state.confirmation && event.target?.matches?.("[data-source-detail-backdrop]")) {
      requestDetailClose();
      return;
    }
    if (!state.confirmation && state.mode === "target" &&
        event.target?.matches?.(".course-source-target-overlay")) {
      requestTargetClose();
    }
  }

  function invokeSafely(callback, value, options) {
    if (typeof callback !== "function") return false;
    try {
      Promise.resolve(callback(value, options)).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function routeToSource(sourceId, anchorId = null) {
    return buildCourseAuthoringRoute(state.courseId, {
      section: "sources",
      sourceId,
      ...(anchorId ? { anchorId } : {})
    });
  }

  function readOptions(readMode, values = {}, courseRevision = state.courseRevision) {
    return {
      mode: readMode,
      sourceId: null,
      targetKind: null,
      targetId: null,
      expectedRevision: courseRevision,
      limit: readMode === "catalog" ? CATALOG_PAGE_LIMIT : 1,
      cursor: null,
      ...values
    };
  }

  async function loadCatalog({
    cursor = null,
    append = false,
    preserveExisting = false,
    courseRevision = state.courseRevision
  } = {}) {
    const requestEpoch = epoch;
    state.catalogLoading = true;
    state.catalogFailure = "";
    if (!append && !preserveExisting) state.catalog = null;
    if (!preserveExisting) render();
    try {
      const page = normalizeCourseSourcesPage(
        await controller.loadCourseSources(
          state.courseId,
          readOptions("catalog", { cursor }, courseRevision)
        ),
        {
          expectedCourseId: state.courseId,
          expectedCourseRevision: courseRevision,
          expectedMode: "catalog"
        }
      );
      if (!state.opened || requestEpoch !== epoch) return false;
      state.courseRevision = courseRevision;
      state.catalog = append && state.catalog
        ? mergeCourseSourceCatalogPages(state.catalog, page)
        : page;
      return true;
    } catch (error) {
      if (!state.opened || requestEpoch !== epoch) return false;
      state.catalogFailure = errorMessage(error, "Não foi possível carregar as fontes.");
      return false;
    } finally {
      if (state.opened && requestEpoch === epoch) {
        state.catalogLoading = false;
        render();
      }
    }
  }

  function annotationQuery(sourceId) {
    return {
      mode: "target",
      origins: [],
      channels: [],
      states: [],
      categories: [],
      includeUncategorized: true,
      subjectIds: [],
      hierarchy: {
        target: { kind: "source", id: sourceId },
        includeDescendants: true
      },
      annotationId: null
    };
  }

  function mergeAnnotationPages(current, incoming) {
    if (!current) return incoming;
    if (current.courseId !== incoming.courseId ||
        current.courseRevision !== incoming.courseRevision ||
        current.annotationSetVersion !== incoming.annotationSetVersion ||
        JSON.stringify(current.query) !== JSON.stringify(incoming.query)) {
      throw new TypeError("A paginação das observações mudou durante a leitura.");
    }
    const items = [...current.items, ...incoming.items];
    if (new Set(items.map(({ annotationId }) => annotationId)).size !== items.length) {
      throw new TypeError("A paginação repetiu uma observação.");
    }
    return Object.freeze({ ...incoming, items: Object.freeze(items) });
  }

  async function loadAnnotations(sourceId, {
    cursor = null,
    append = false,
    preserveExisting = false,
    courseRevision = state.courseRevision
  } = {}) {
    const requestEpoch = epoch;
    state.annotationsLoading = true;
    state.annotationsFailure = "";
    if (!append && !preserveExisting) state.annotations = null;
    if (!preserveExisting) render();
    try {
      const options = normalizeCourseAnchoredAnnotationReadOptions({
        expectedCourseRevision: courseRevision,
        annotationSetVersion: append ? state.annotations?.annotationSetVersion ?? null : null,
        query: annotationQuery(sourceId),
        cursor,
        limit: 24
      });
      const page = normalizeCourseAnchoredAnnotationPage(
        await controller.loadCourseAnchoredAnnotations(state.courseId, options)
      );
      if (!state.opened || requestEpoch !== epoch || state.selectedSourceId !== sourceId) {
        return false;
      }
      state.annotations = append
        ? mergeAnnotationPages(state.annotations, page)
        : page;
      return true;
    } catch (error) {
      if (!state.opened || requestEpoch !== epoch || state.selectedSourceId !== sourceId) {
        return false;
      }
      state.annotationsFailure = errorMessage(error, "Não foi possível carregar as observações da fonte.");
      return false;
    } finally {
      if (!preserveExisting && state.opened && requestEpoch === epoch &&
          state.selectedSourceId === sourceId) {
        state.annotationsLoading = false;
        render();
      } else if (state.opened && requestEpoch === epoch &&
          state.selectedSourceId === sourceId) {
        state.annotationsLoading = false;
      }
    }
  }

  async function loadDetail(sourceId, {
    target = false,
    contextualTarget = false,
    preserveExisting = false,
    courseRevision = state.courseRevision
  } = {}) {
    const requestEpoch = epoch;
    if (target) state.targetDetailsLoading.add(sourceId);
    else {
      state.selectedSourceId = sourceId;
      state.detailLoading = true;
      state.detailFailure = "";
      if (!preserveExisting) state.detail = null;
    }
    if (!preserveExisting) render();
    try {
      const targetContext = contextualTarget
        ? { targetKind: state.targetKind, targetId: state.targetId }
        : {};
      const page = normalizeCourseSourcesPage(
        await controller.loadCourseSources(state.courseId, readOptions("source", {
          sourceId,
          ...targetContext
        }, courseRevision)),
        {
          expectedCourseId: state.courseId,
          expectedCourseRevision: courseRevision,
          expectedMode: "source",
          expectedSourceId: sourceId,
          ...(contextualTarget ? {
            expectedTargetKind: state.targetKind,
            expectedTargetId: state.targetId
          } : {})
        }
      );
      if (!state.opened || requestEpoch !== epoch) return null;
      if (target) {
        state.targetDetails.set(sourceId, page);
      }
      else {
        state.courseRevision = courseRevision;
        state.detail = page;
        await loadAnnotations(sourceId, { preserveExisting, courseRevision });
      }
      return page;
    } catch (error) {
      if (!state.opened || requestEpoch !== epoch) return null;
      if (!target) state.detailFailure = errorMessage(error, "Não foi possível carregar esta fonte.");
      return null;
    } finally {
      if (state.opened && requestEpoch === epoch) {
        state.targetDetailsLoading.delete(sourceId);
        if (!target) state.detailLoading = false;
        render();
      }
    }
  }

  function initialLinkFailure(message) {
    state.detail = null;
    state.detailLoading = false;
    state.detailFailure = message;
    state.initialAnchorMatch = null;
    render();
    return false;
  }

  function focusInitialAnchor() {
    if (!state.initialAnchorMatch) return;
    globalThis.queueMicrotask?.(() => {
      const anchor = root.querySelector?.("[data-source-deep-linked-anchor]");
      anchor?.focus?.({ preventScroll: true });
      anchor?.scrollIntoView?.({ block: "center", inline: "nearest" });
    });
  }

  async function loadInitialDetail({
    preserveExisting = false,
    courseRevision = state.courseRevision
  } = {}) {
    const sourceId = state.initialSourceId;
    const anchorId = state.initialAnchorId;
    if (sourceId === null) return false;
    const page = await loadDetail(sourceId, { preserveExisting, courseRevision });
    if (!page) return false;
    if (!page.items.length) {
      return initialLinkFailure("A fonte indicada não está disponível.");
    }
    if (anchorId === null) return true;
    const source = page.items[0];
    const anchor = source.anchors.find((item) => item.anchorId === anchorId);
    if (!anchor) return initialLinkFailure("A âncora indicada não existe na fonte.");
    state.initialAnchorMatch = {
      sourceRevision: source.revision,
      anchorId: anchor.anchorId,
      anchorRevision: anchor.revision
    };
    render();
    focusInitialAnchor();
    return true;
  }

  async function loadTarget({ preserveDraft = false } = {}) {
    const requestEpoch = epoch;
    const draft = preserveDraft && JSON.stringify(state.sourceLinks) !== JSON.stringify(state.initialSourceLinks)
      ? structuredClone(state.sourceLinks) : null;
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
      if (page.items.length > 1 || page.nextCursor !== null) {
        throw new TypeError("A leitura do alvo não corresponde ao estado corrente.");
      }
      const attribution = page.items[0] || null;
      state.targetAttribution = attribution;
      if (attribution && attribution.targetVersion !== state.targetVersion) {
        throw new TypeError("O item mudou. Feche esta janela e abra as fontes novamente.");
      }
      state.initialSourceLinks = structuredClone(attribution?.sourceLinks || []);
      state.sourceLinks = draft || structuredClone(state.initialSourceLinks);
      void Promise.all(state.sourceLinks.map(({ sourceId }) =>
        loadDetail(sourceId, {
          target: true,
          contextualTarget: true
        })
      ));
      return true;
    } catch (error) {
      if (!state.opened || requestEpoch !== epoch) return false;
      state.targetFailure = errorMessage(error, "Não foi possível carregar as fontes deste item.");
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

  function sourceChangeMessage(change) {
    return change.idempotent
      ? "A operação já estava confirmada."
      : change.changed ? "Alteração salva." : "Nada mudou.";
  }

  function reportConfirmedRefreshFailure(confirmedMessage) {
    state.message = confirmedMessage;
    state.failure = "A alteração foi confirmada, mas a lista está desatualizada. Recarregue as fontes para conferir o estado salvo.";
  }

  async function refreshAfterChange(change) {
    state.message = sourceChangeMessage(change);
    state.failure = "";
    state.sourceEditor = null;
    state.anchorEditor = null;
    state.targetDetails.clear();
    applyCourseRevision(change.courseRevision);
    if (state.mode === "target") {
      const refreshed = await Promise.all([loadCatalog(), loadTarget({ preserveDraft: true })]);
      const detailRefreshed = state.selectedSourceId ? Boolean(await loadDetail(state.selectedSourceId)) : true;
      return refreshed.every(Boolean) && detailRefreshed;
    }
    const selectedSourceId = state.selectedSourceId;
    const catalogRefreshed = await loadCatalog();
    const detailRefreshed = selectedSourceId
      ? Boolean(await loadDetail(selectedSourceId))
      : true;
    return catalogRefreshed && detailRefreshed;
  }

  function captureFileAccessDraft(form) {
    if (!form?.matches?.('[data-source-form="file-access"]') || state.pendingFileAccess) return null;
    const sourceId = optionalFormValue(form, "sourceId");
    const contentHash = optionalFormValue(form, "contentHash");
    const publicFileAccess = optionalFormValue(form, "publicFileAccess");
    const source = state.detail?.items?.[0];
    if (!source || source.sourceId !== sourceId || source.status !== "active" ||
        !Object.hasOwn(PUBLIC_FILE_ACCESS, publicFileAccess) ||
        contentHash !== null && !source.attachments.some((item) => item.contentHash === contentHash)) return null;
    state.fileAccessDraft = { sourceId, contentHash, publicFileAccess };
    return state.fileAccessDraft;
  }

  function requestFileAccess(form) {
    if (state.busy || state.pendingFileAccess || state.fileAccessConflict ||
        state.pendingCommand || state.pendingAttachment || state.pendingAnnotation || !state.canSetFileAccess) return;
    const draft = captureFileAccessDraft(form);
    if (!draft) return;
    const source = state.detail.items[0];
    const policy = draft.contentHash === null ? source.publicFileAccess
      : source.attachments.find((item) => item.contentHash === draft.contentHash).publicFileAccess;
    if (policy === draft.publicFileAccess) {
      state.fileAccessDraft = null;
      state.message = "A permissão já está definida assim.";
      render();
      return;
    }
    requestConfirmation({
      action: "confirm-file-access",
      title: draft.contentHash === null ? "Alterar acesso aos PDFs da fonte?" : "Alterar acesso a este PDF?",
      message: draft.publicFileAccess === "available"
        ? "O arquivo poderá ser baixado por visitantes enquanto o curso estiver público. Confirme que você pode disponibilizá-lo."
        : draft.publicFileAccess === "restricted"
          ? "O arquivo ficará disponível somente para quem tem acesso concedido ao curso."
          : `O acesso seguirá a escolha ${draft.contentHash === null ? "do curso" : "da fonte"}, respeitando as escolhas próprias de cada PDF.`,
      confirmLabel: "Confirmar permissão",
      request: { courseId: state.courseId, expectedRevision: state.courseRevision,
        sourceRevision: source.revision, ...structuredClone(draft), requestId: createUuid() },
      returnFocusSelector: '.course-source-file-access summary'
    });
  }

  function validateFileAccessReceipt(value, request) {
    const fields = ["contract", "courseId", "courseRevision", "sourceId", "sourceRevision",
      "contentHash", "publicFileAccess", "changed", "idempotent"];
    if (!value || typeof value !== "object" || Object.keys(value).length !== fields.length ||
        !fields.every((field) => Object.hasOwn(value, field)) ||
        value.contract !== "aralearn.course-source-file-access-change.v1" ||
        value.courseId !== request.courseId || value.sourceId !== request.sourceId ||
        value.contentHash !== request.contentHash || value.publicFileAccess !== request.publicFileAccess ||
        typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean" ||
        value.courseRevision !== request.expectedRevision + Number(value.changed) ||
        value.sourceRevision !== request.sourceRevision + Number(value.changed)) {
      throw Object.assign(new TypeError("Não foi possível confirmar a permissão recebida."), { ambiguous: true });
    }
    return value;
  }

  async function runFileAccess(request) {
    if (state.busy || !request || state.pendingFileAccess &&
        JSON.stringify(state.pendingFileAccess) !== JSON.stringify(request)) return false;
    const pending = state.pendingFileAccess || structuredClone(request);
    state.pendingFileAccess = pending;
    state.busy = true;
    state.failure = "";
    state.message = "Confirmando a permissão…";
    render();
    let result;
    try {
      result = validateFileAccessReceipt(
        await controller.setCourseSourceFileAccess(structuredClone(pending)), pending
      );
    } catch (error) {
      if (!state.opened) return false;
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingFileAccess = null;
      if (error?.status === 409 || error?.code === "course_revision_changed") {
        state.fileAccessConflict = pending.expectedRevision;
      }
      state.message = "";
      state.failure = ambiguous
        ? "A confirmação da permissão não chegou. Confirme a mesma permissão antes de fazer outra alteração."
        : errorMessage(error, operationErrorContext("alterar o acesso ao PDF"));
      state.busy = false;
      render();
      return false;
    }
    if (!state.opened) return false;
    state.pendingFileAccess = null;
    state.fileAccessDraft = null;
    state.fileAccessConflict = null;
    const refreshed = await refreshAfterChange({ ...result,
      courseRevision: Math.max(state.courseRevision, result.courseRevision)
    }).catch(() => false);
    if (!state.opened) return true;
    if (!refreshed) reportConfirmedRefreshFailure(sourceChangeMessage(result));
    state.busy = false;
    render();
    return true;
  }

  async function runCommand(command, draft) {
    if (state.busy || state.pendingFileAccess) return false;
    const failureContext = commandErrorContext(command);
    const matches = state.pendingCommand &&
      JSON.stringify(state.pendingCommand.draft) === JSON.stringify(draft);
    if (!matches) state.pendingCommand = null;
    let pending;
    try {
      pending = matches ? state.pendingCommand : {
        requestId: createUuid(),
        expectedCourseRevision: state.courseRevision,
        command: normalizeCourseSourceCommand(command),
        draft: structuredClone(draft)
      };
    } catch (error) {
      state.message = "";
      state.failure = errorMessage(error, failureContext);
      render();
      return false;
    }
    state.pendingCommand = pending;
    state.busy = true;
    state.failure = "";
    state.message = "Salvando…";
    render();
    let result;
    try {
      result = normalizeCourseSourceChange(
        await controller.mutateCourseSources({
          requestId: pending.requestId,
          courseId: state.courseId,
          expectedCourseRevision: pending.expectedCourseRevision,
          command: pending.command
        }),
        { expectedCourseId: state.courseId, expectedRequestId: pending.requestId }
      );
    } catch (error) {
      if (!state.opened) return false;
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingCommand = null;
      state.message = "";
      state.failure = ambiguous
        ? `${errorMessage(error, failureContext)} Confirme novamente para verificar o resultado com segurança.`
        : errorMessage(error, failureContext);
      state.busy = false;
      render();
      return false;
    }
    if (!state.opened) return false;
    state.pendingCommand = null;
    if (pending.command.type === "set_bibliography_style") state.bibliographyStyleDraft = null;
    if (state.mode === "target" && pending.command.type === "set_target_sources") {
      state.initialSourceLinks = structuredClone(state.sourceLinks);
    }
    const refreshed = await refreshAfterChange(result).catch(() => false);
    if (!state.opened) return true;
    if (!refreshed) {
      reportConfirmedRefreshFailure(sourceChangeMessage(result));
    } else if (state.mode === "target" && pending.command.type === "set_target_sources") {
      onTargetSaved(result);
    }
    state.busy = false;
    render();
    return true;
  }

  async function uploadPdf(file, pending = null) {
    if (state.busy || state.pendingFileAccess) return false;
    const source = state.detail?.items?.[0];
    if (!source || source.status !== "active") {
      state.failure = "A fonte corrente não está disponível.";
      render();
      return false;
    }
    const retained = pending || state.pendingAttachment;
    const operation = retained || {
      requestId: createUuid(),
      expectedCourseRevision: state.courseRevision,
      sourceId: source.sourceId,
      sourceRevision: source.revision,
      file
    };
    state.pendingAttachment = operation;
    state.busy = true;
    state.failure = "";
    state.message = "Enviando e confirmando o PDF…";
    render();
    let result;
    try {
      if (typeof controller.uploadCourseSourcePdf !== "function") {
        throw new TypeError("O envio de PDF não está disponível.");
      }
      result = normalizeCourseSourceChange(await controller.uploadCourseSourcePdf({
        requestId: operation.requestId,
        courseId: state.courseId,
        expectedCourseRevision: operation.expectedCourseRevision,
        sourceId: operation.sourceId,
        sourceRevision: operation.sourceRevision,
        file: operation.file
      }), {
        expectedCourseId: state.courseId,
        expectedRequestId: operation.requestId
      });
    } catch (error) {
      if (!state.opened) return false;
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingAttachment = null;
      state.message = "";
      state.failure = ambiguous
        ? `${errorMessage(error, operationErrorContext("enviar o PDF"))} Confirme novamente para verificar o resultado com segurança.`
        : errorMessage(error, operationErrorContext("enviar o PDF"));
      state.busy = false;
      render();
      return false;
    }
    if (!state.opened) return false;
    state.pendingAttachment = null;
    const refreshed = await refreshAfterChange(result).catch(() => false);
    if (!state.opened) return true;
    if (!refreshed) reportConfirmedRefreshFailure(sourceChangeMessage(result));
    state.busy = false;
    render();
    return true;
  }

  async function downloadAttachment(sourceRevision, contentHash) {
    if (state.busy) return false;
    const source = state.detail?.items.find(({ revision }) => revision === sourceRevision);
    const attachment = source?.attachments.find((item) => item.contentHash === contentHash);
    if (!source || !attachment) return false;
    state.busy = true;
    state.failure = "";
    state.message = "Preparando o download…";
    render();
    try {
      if (typeof controller.getCourseSourceAttachmentDownload !== "function") {
        throw new TypeError("O download de PDF não está disponível.");
      }
      const access = await controller.getCourseSourceAttachmentDownload({
        courseId: state.courseId,
        expectedCourseRevision: state.courseRevision,
        sourceId: source.sourceId,
        sourceRevision,
        contentHash
      });
      if (!state.opened) return false;
      downloadUrl(access.signedUrl, attachment);
      state.message = "Download iniciado.";
      return true;
    } catch (error) {
      if (!state.opened) return false;
      state.message = "";
      state.failure = errorMessage(error, operationErrorContext("baixar o PDF"));
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
      if (endMilliseconds <= startMilliseconds) {
        throw formFieldError("O fim deve vir depois do início.", "endTime");
      }
      return { kind, startMilliseconds, endMilliseconds };
    }
    if (kind === "uri_fragment") {
      const fragment = requiredFormValue(form, "fragment", "O identificador do trecho", 2_048);
      if (fragment.startsWith("#")) {
        throw formFieldError("Informe o identificador sem #.", "fragment");
      }
      return { kind, fragment };
    }
    if (kind !== "text_quote") {
      throw formFieldError("O tipo de âncora é inválido.", "selectorKind");
    }
    return {
      kind,
      exact: literalRequiredFormValue(form, "exact", "O trecho exato", 4_000),
      prefix: optionalFormValue(form, "prefix", "O contexto anterior", 500),
      suffix: optionalFormValue(form, "suffix", "O contexto posterior", 500)
    };
  }

  async function submitSource(form) {
    captureSourceDraft(form);
    const existing = state.sourceEditor?.source || null;
    const sourceId = existing
      ? existing.sourceId
      : requiredFormValue(form, "sourceId", "A identidade estável", 240);
    const source = sourceDocumentFromBibliographyDraft(state.sourceEditor.draft);
    if (source.url && !safeHttpUrl(source.url)) throw formFieldError("Use um link HTTPS válido.", "url");
    if (source.citationMode === "manual" && source.studyVisibility !== "hidden" && !source.citationText) {
      throw formFieldError("Escreva a referência ou escolha gerar no estilo do curso.", "citationText");
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
    captureAnchorDraft(form);
    const source = state.detail?.items?.[0];
    const editor = state.anchorEditor;
    const existing = editor?.anchor || null;
    if (!source || source.status !== "active") throw new TypeError("A fonte corrente não está disponível.");
    if (!existing && editor && !editor.anchorId) editor.anchorId = createUuid();
    const command = {
      type: "save_anchor",
      anchorId: existing?.anchorId || editor?.anchorId || createUuid(),
      sourceId: source.sourceId,
      sourceRevision: source.revision,
      expectedAnchorRevision: existing?.revision || 0,
      contentHash: optionalFormValue(form, "contentHash"),
      selector: selectorFromForm(form),
      humanLocator: optionalFormValue(form, "humanLocator", "O localizador para pessoas", 500),
      verificationExcerpt: literalOptionalFormValue(
        form,
        "verificationExcerpt",
        "O trecho de verificação",
        2_000
      )
    };
    return runCommand(command, command);
  }

  async function runAnnotationCommand(command, draft) {
    if (state.busy || state.pendingFileAccess) return false;
    const matches = state.pendingAnnotation &&
      state.pendingAnnotation.sourceId === state.selectedSourceId &&
      JSON.stringify(state.pendingAnnotation.draft) === JSON.stringify(draft);
    if (!matches) state.pendingAnnotation = null;
    let pending;
    try {
      pending = matches ? state.pendingAnnotation : {
        requestId: createUuid(),
        sourceId: state.selectedSourceId,
        command: normalizeCourseAnchoredAnnotationCommand(command),
        draft: structuredClone(draft)
      };
    } catch (error) {
      state.message = "";
      state.failure = errorMessage(error, operationErrorContext("salvar a observação"));
      render();
      restoreObservationDraftFocus();
      return false;
    }
    state.pendingAnnotation = pending;
    state.busy = true;
    state.failure = "";
    state.message = "Registrando observação…";
    render();
    let result;
    try {
      result = normalizeCourseAnchoredAnnotationChange(
        await controller.mutateCourseAnchoredAnnotations({
          requestId: pending.requestId,
          courseId: state.courseId,
          expectedCourseRevision: state.courseRevision,
          command: pending.command
        })
      );
      if (!state.opened) return false;
      if (result.courseId !== state.courseId || result.requestId !== pending.requestId ||
          result.courseRevision !== state.courseRevision ||
          result.annotation?.annotationId !== pending.command.annotationId) {
        throw new TypeError("A confirmação da observação não corresponde ao pedido.");
      }
    } catch (error) {
      if (!state.opened) return false;
      const ambiguous = ambiguousWriteFailure(error);
      if (!ambiguous) state.pendingAnnotation = null;
      state.message = "";
      state.failure = ambiguous
        ? `${errorMessage(error, operationErrorContext("salvar a observação"))} Confirme novamente para verificar o resultado com segurança.`
        : errorMessage(error, operationErrorContext("salvar a observação"));
      state.busy = false;
      render();
      restoreObservationDraftFocus();
      return false;
    }
    state.pendingAnnotation = null;
    if (state.observationEditor?.sourceId === pending.sourceId) {
      state.observationEditor = null;
    }
    const confirmedMessage = result.idempotent
      ? "A observação já estava registrada."
      : "Observação registrada.";
    state.message = confirmedMessage;
    state.failure = "";
    let refreshed = true;
    if (state.selectedSourceId === pending.sourceId) {
      try {
        refreshed = await loadAnnotations(pending.sourceId);
      } catch {
        refreshed = false;
      }
    }
    if (!state.opened) return true;
    if (!refreshed) reportConfirmedRefreshFailure(confirmedMessage);
    state.busy = false;
    render();
    return true;
  }

  async function submitObservation(form) {
    captureObservationDraft(form);
    const source = state.detail?.items?.[0];
    if (!source || source.status !== "active") {
      throw new TypeError("A fonte corrente não está disponível.");
    }
    const observationKind = requiredFormValue(
      form,
      "observationKind",
      "A intenção da observação",
      32
    );
    const observation = SOURCE_OBSERVATION_KINDS[observationKind];
    if (!observation) {
      throw formFieldError("A intenção da observação é inválida.", "observationKind");
    }
    const anchorId = optionalFormValue(form, "targetId", "A âncora", 240) || "";
    if (anchorId && !source.anchors.some((anchor) =>
      anchor.anchorId === anchorId && anchor.status === "active")) {
      throw formFieldError("A âncora escolhida não está ativa nesta fonte.", "targetId");
    }
    const editor = state.observationEditor;
    if (editor && !editor.annotationId) editor.annotationId = createUuid();
    if (editor && !editor.capturedAt) editor.capturedAt = now();
    const command = {
      type: "create_anchored_annotation",
      annotationId: editor?.annotationId || createUuid(),
      target: anchorId
        ? { kind: "source_anchor", id: anchorId }
        : { kind: "source", id: source.sourceId },
      rawText: literalRequiredFormValue(form, "rawText", "A observação", 2_000),
      category: observation.category,
      capturedAt: editor?.capturedAt || now(),
      briefSummary: null
    };
    return runAnnotationCommand(command, command);
  }

  function targetLinksValid() {
    if (JSON.stringify(state.sourceLinks) === JSON.stringify(state.initialSourceLinks)) {
      return true;
    }
    return state.sourceLinks.every((link) => {
      const source = sourceForLink(state, link);
      const activeAnchors = new Map(anchorsForLink(state, link)
        .filter(({ status }) => status === "active")
        .map((anchor) => [anchor.anchorId, anchor]));
      const anchorCountIsValid = link.anchors.length <= 8 &&
        (link.relation !== "quoted_from" || link.anchors.length >= 1);
      return source?.status === "active" &&
        Object.hasOwn(SOURCE_RELATIONS, link.relation) &&
        anchorCountIsValid &&
        link.anchors.every(({ anchorId }) => {
          const currentAnchor = activeAnchors.get(anchorId);
          return Boolean(currentAnchor);
        });
    });
  }

  root.addEventListener("submit", (event) => {
    if (!state.opened || state.busy) return;
    if (event.target.matches?.('[data-source-form="bibliography-style"]')) {
      event.preventDefault();
      if (state.sourceEditor) return;
      const style = optionalFormValue(event.target, "bibliographyStyle");
      void runCommand({ type: "set_bibliography_style", style }, { type: "set_bibliography_style", style });
    } else if (event.target.matches?.('[data-source-form="file-access"]')) {
      event.preventDefault();
      requestFileAccess(event.target);
    } else if (event.target.matches?.('[data-source-form="source"]')) {
      event.preventDefault();
      void submitSource(event.target).catch((error) => {
        state.failure = errorMessage(error, operationErrorContext("salvar a fonte"));
        render();
        focusEditorField("source", error?.fieldName);
      });
    } else if (event.target.matches?.('[data-source-form="anchor"]')) {
      event.preventDefault();
      void submitAnchor(event.target).catch((error) => {
        state.failure = errorMessage(error, operationErrorContext("salvar a âncora"));
        render();
        focusEditorField("anchor", error?.fieldName);
      });
    } else if (event.target.matches?.('[data-source-form="observation"]')) {
      event.preventDefault();
      void submitObservation(event.target).catch((error) => {
        state.failure = errorMessage(error, operationErrorContext("salvar a observação"));
        render();
        focusEditorField("observation", error?.fieldName || "rawText");
      });
    }
  });

  root.addEventListener("input", (event) => {
    if (!state.opened) return;
    if (event.target.name === "bibliographyStyle" && event.target.form?.dataset?.sourceForm === "bibliography-style") {
      state.bibliographyStyleDraft = event.target.value;
    }
    captureEditorDraftFromControl(event.target);
  });

  root.addEventListener("change", (event) => {
    if (!state.opened) return;
    captureFileAccessDraft(event.target.form);
    captureEditorDraftFromControl(event.target);
    if (event.target.matches?.("[data-source-citation-mode], [data-source-kind], [data-source-contributor-format]") && state.sourceEditor) {
      const name = event.target.name;
      render();
      focusEditorField("source", name);
      return;
    }
    if (event.target.matches?.("[data-source-pdf-input]")) {
      const file = event.target.files?.[0] || null;
      if (file) void uploadPdf(file);
      return;
    }
    if (event.target.matches?.("[data-source-anchor-kind]") && state.anchorEditor) {
      state.anchorEditor.draft = {
        ...(state.anchorEditor.draft || anchorDraft(state.anchorEditor.anchor)),
        selectorKind: event.target.value
      };
      render();
      focusEditorField("anchor", "selectorKind");
      return;
    }
    if (event.target.matches?.("[data-source-target-anchor]")) {
      const link = state.sourceLinks.find((item) => item.linkId === event.target.dataset.linkId);
      if (!link) return;
      const anchorId = String(event.target.dataset.anchorId || "");
      link.anchors = event.target.checked
        ? [...link.anchors.filter((anchor) => anchor.anchorId !== anchorId), { anchorId }]
        : link.anchors.filter((anchor) => anchor.anchorId !== anchorId);
      state.failure = "";
      render();
      return;
    }
    if (event.target.matches?.("[data-source-target-relation]")) {
      const link = state.sourceLinks.find((item) =>
        item.linkId === event.target.dataset.linkId);
      if (!link || !Object.hasOwn(SOURCE_RELATIONS, event.target.value)) return;
      link.relation = event.target.value;
      state.failure = "";
      render();
      return;
    }
    if (event.target.matches?.("[data-source-target-role]")) {
      const link = state.sourceLinks.find(item => item.linkId === event.target.dataset.linkId);
      const role = event.target.dataset.sourceTargetRole;
      if (!link || !Object.hasOwn(SOURCE_ROLES, role)) return;
      link.roles = Object.keys(SOURCE_ROLES).filter(value => value === role ? event.target.checked : link.roles.includes(value));
      state.failure = "";
      return;
    }
    if (event.target.matches?.("[data-source-occurrence-target]") && state.occurrenceEditor) {
      state.occurrenceEditor.targetIndex = Number(event.target.value);
      delete state.occurrenceEditor.selection;
      render();
      focus("[data-source-occurrence-selection]");
    }
  });

  root.addEventListener("click", (event) => {
    if (!state.opened) return;
    const node = event.target.closest?.("[data-source-action]");
    if (!node || (typeof root.contains === "function" && !root.contains(node))) return;
    event.preventDefault();
    const action = node.dataset.sourceAction;
    if (action === "cancel-confirmation") {
      cancelConfirmation();
    } else if (action === "confirm-file-access" && state.confirmation?.action === action) {
      const request = state.confirmation.request;
      state.confirmation = null;
      void runFileAccess(request);
    } else if (action === "retry-file-access" && state.pendingFileAccess) {
      void runFileAccess(state.pendingFileAccess);
    } else if (action === "confirm-retirement") {
      confirmRetirement();
    } else if (action === "confirm-target-discard") {
      confirmTargetDiscard();
    } else if (action === "confirm-detail-discard" && state.confirmation?.action === action && !state.busy) {
      state.confirmation = null;
      if (state.pendingCommand?.command?.type !== "set_target_sources") state.pendingCommand = null;
      state.pendingAnnotation = null;
      state.pendingAttachment = null;
      state.pendingFileAccess = null;
      state.fileAccessDraft = null;
      closeDetail();
    } else if (action === "preview-reference") {
      void previewSourceReference();
    } else if (["add-contributor", "remove-contributor"].includes(action) && state.sourceEditor) {
      captureSourceDraft(node.closest?.('[data-source-form="source"]'));
      const list = node.dataset.contributorList;
      const draft = state.sourceEditor.draft;
      if (action === "add-contributor") appendSourceContributor(draft, list);
      else {
        const values = list === "authors" ? draft.authors : list === "editors" ? draft.bibliographic.editors : null;
        const index = Number(node.dataset.contributorIndex);
        if (values && Number.isSafeInteger(index) && index >= 0 && index < values.length) values.splice(index, 1);
      }
      render();
      focus(`[data-source-action="add-contributor"][data-contributor-list="${list === "editors" ? "editors" : "authors"}"]`);
    } else if (action === "add-source") {
      state.sourceEditor = {
        source: null,
        draft: { ...sourceDraft(null), sourceId: createUuid() }
      };
      state.failure = "";
      render();
    } else if (action === "cancel-source-form") {
      state.sourceEditor = null;
      state.failure = "";
      render();
    } else if (action === "open-source") {
      state.sourceEditor = null;
      state.anchorEditor = null;
      const sourceId = String(node.dataset.sourceId || "");
      if (state.observationEditor?.sourceId !== sourceId) state.observationEditor = null;
      if (typeof onNavigate === "function") {
        invokeSafely(onNavigate, routeToSource(sourceId));
      } else {
        void loadDetail(sourceId);
      }
    } else if (action === "close-detail") {
      requestDetailClose();
    } else if (action === "retry-detail" && state.selectedSourceId) {
      void (state.initialSourceId === state.selectedSourceId
        ? loadInitialDetail()
        : loadDetail(state.selectedSourceId));
    } else if (action === "edit-source") {
      const source = state.detail?.items?.[0];
      if (!source) return;
      state.sourceEditor = { source, draft: null };
      state.failure = "";
      render();
    } else if (action === "retire-source") {
      const source = state.detail?.items?.[0];
      if (!source || source.status !== "active") return;
      const command = {
        type: "retire_source",
        sourceId: source.sourceId,
        expectedSourceRevision: source.revision
      };
      requestConfirmation({
        title: "Aposentar fonte?",
        message: "A fonte ficará indisponível para novos vínculos. O cadastro e as referências já vinculadas serão preservados. Remova os PDFs separadamente se quiser retirar o acesso aos arquivos.",
        confirmLabel: "Aposentar",
        command,
        draft: command,
        returnFocusSelector: '[data-source-action="retire-source"]'
      });
    } else if (action === "add-anchor") {
      state.anchorEditor = { anchor: null, draft: null };
      state.failure = "";
      render();
    } else if (action === "edit-anchor") {
      const anchorId = String(node.dataset.anchorId || "");
      const sourceRevision = Number(node.dataset.sourceRevision);
      const source = state.detail?.items?.[0];
      const anchor = source?.revision === sourceRevision
        ? source.anchors.find((item) => item.anchorId === anchorId)
        : null;
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
      const command = { type: "retire_anchor", anchorId, expectedAnchorRevision };
      requestConfirmation({
        title: "Aposentar âncora?",
        message: "A âncora deixará de estar ativa. Revise os vínculos que ainda dependem dela.",
        confirmLabel: "Aposentar",
        command,
        draft: command,
        returnFocusIdentity: {
          selector: '[data-source-action="retire-anchor"]',
          datasetKey: "anchorId",
          datasetValue: anchorId
        }
      });
    } else if (action === "load-more-sources" && state.catalog?.nextCursor && !state.catalogLoading) {
      void loadCatalog({ cursor: state.catalog.nextCursor, append: true });
    } else if (action === "retry-catalog") {
      void loadCatalog();
    } else if (action === "retry-target") {
      void loadTarget({ preserveDraft: true });
    } else if (action === "retry-command" && state.pendingCommand) {
      void runCommand(state.pendingCommand.command, state.pendingCommand.draft);
    } else if (action === "retry-annotation" && state.pendingAnnotation) {
      void runAnnotationCommand(
        state.pendingAnnotation.command,
        state.pendingAnnotation.draft
      );
    } else if (action === "retry-attachment" && state.pendingAttachment) {
      void uploadPdf(state.pendingAttachment.file, state.pendingAttachment);
    } else if (action === "load-more-observations" &&
        state.annotations?.nextCursor && !state.annotationsLoading) {
      void loadAnnotations(state.selectedSourceId, {
        cursor: state.annotations.nextCursor,
        append: true
      });
    } else if (action === "export-observations" && state.annotations &&
        !state.annotations.hasMore) {
      try {
        downloadJson(
          buildSourceObservationsExport(state, now()),
          "aralearn-observacoes-da-fonte.json"
        );
        state.failure = "";
        state.message = "A exportação das observações foi preparada para salvamento.";
      } catch (error) {
        state.message = "";
        state.failure = errorMessage(error, operationErrorContext("exportar as observações"));
      }
      render();
    } else if (action === "download-attachment") {
      void downloadAttachment(
        Number(node.dataset.sourceRevision),
        String(node.dataset.contentHash || "")
      );
    } else if (action === "remove-attachment") {
      const sourceRevision = Number(node.dataset.sourceRevision);
      const contentHash = String(node.dataset.contentHash || "");
      const source = state.detail?.items?.[0];
      const attachment = source?.attachments.find((item) => item.contentHash === contentHash);
      if (!source || source.status !== "active" || source.revision !== sourceRevision ||
          !attachment) return;
      const command = {
        type: "remove_pdf",
        sourceId: source.sourceId,
        expectedSourceRevision: source.revision,
        contentHash
      };
      requestConfirmation({
        title: "Remover PDF?",
        message: "Somente o arquivo PDF será removido. A fonte, sua citação, as âncoras e os vínculos pedagógicos serão preservados.",
        confirmLabel: "Remover PDF",
        command,
        draft: command,
        returnFocusIdentity: {
          selector: '[data-source-action="remove-attachment"]',
          datasetKey: "contentHash",
          datasetValue: contentHash
        }
      });
    } else if (action === "export-target") {
      try {
        const value = buildTargetExport(state, now());
        downloadJson(
          value,
          `aralearn-proveniencia-${state.targetKind}.json`
        );
        state.failure = "";
        state.message = "A exportação da proveniência foi preparada para salvamento.";
      } catch (error) {
        state.message = "";
        state.failure = errorMessage(error, operationErrorContext("exportar a proveniência"));
      }
      render();
    } else if (action === "close-target") {
      requestTargetClose();
    } else if (action === "add-target-source") {
      const sourceId = String(node.dataset.sourceId || "");
      const source = state.catalog?.items.find((item) => item.sourceId === sourceId);
      if (!source || source.status !== "active") return;
      if (state.sourceLinks.length >= 32) {
        state.failure = "Cada item aceita no máximo 32 vínculos com fontes.";
        render();
        return;
      }
      state.sourceLinks.push({
        linkId: createUuid(),
        sourceId,
        relation: "supported_by",
        roles: [...source.defaultRoles],
        anchors: [],
        occurrences: []
      });
      void loadDetail(sourceId, { target: true });
      render();
    } else if (action === "remove-target-source") {
      state.sourceLinks = state.sourceLinks.filter((link) => link.linkId !== node.dataset.linkId);
      state.failure = "";
      render();
    } else if (["move-target-source-up", "move-target-source-down"].includes(action)) {
      const index = state.sourceLinks.findIndex((link) => link.linkId === node.dataset.linkId);
      const target = index + (action.endsWith("up") ? -1 : 1);
      if (index < 0 || target < 0 || target >= state.sourceLinks.length) return;
      [state.sourceLinks[index], state.sourceLinks[target]] =
        [state.sourceLinks[target], state.sourceLinks[index]];
      render();
    } else if (["add-occurrence", "edit-occurrence", "remove-occurrence", "save-occurrence", "cancel-occurrence"].includes(action)) {
      if (action === "cancel-occurrence") {
        const linkId = state.occurrenceEditor?.linkId;
        state.occurrenceEditor = null;
        render();
        focusByIdentity({ selector: '[data-source-action="add-occurrence"]', datasetKey: "linkId", datasetValue: linkId });
        return;
      }
      const link = state.sourceLinks.find(item => item.linkId === node.dataset.linkId);
      if (!link) return;
      const targets = listCourseSourceOccurrenceTargets(state.targetStudyUnit);
      const occurrenceId = node.dataset.occurrenceId;
      const occurrence = link.occurrences.find(item => item.occurrenceId === occurrenceId);
      if (action === "remove-occurrence") link.occurrences = link.occurrences.filter(item => item.occurrenceId !== occurrenceId);
      else if (["add-occurrence", "edit-occurrence"].includes(action)) {
        if (action === "add-occurrence" && link.occurrences.length >= 16) return;
        state.occurrenceEditor = { linkId: link.linkId, occurrenceId: occurrence?.occurrenceId,
          targetIndex: Math.max(0, targets.findIndex(target => target.slot === occurrence?.slot &&
            target.resourceId === occurrence?.resourceId && target.path === occurrence?.path)) };
      } else {
        try {
          const editor = state.occurrenceEditor;
          if (editor?.linkId !== link.linkId) return;
          const selected = sourceOccurrenceFromSelection(targets[editor.targetIndex],
            root.querySelector?.("[data-source-occurrence-selection]"), editor.occurrenceId);
          const index = link.occurrences.findIndex(item => item.occurrenceId === selected.occurrenceId);
          if (index < 0) link.occurrences.push(selected); else link.occurrences[index] = selected;
          state.occurrenceEditor = null;
          state.failure = "";
        } catch (error) { state.failure = error.message; }
      }
      render();
      if (state.occurrenceEditor) focus("[data-source-occurrence-selection]");
      else focusByIdentity({ selector: '[data-source-action="add-occurrence"]', datasetKey: "linkId", datasetValue: link.linkId });
    } else if (action === "save-target") {
      if (!targetLinksValid()) {
        state.failure = "Confira as fontes e os localizadores ativos. Uma citação direta exige ao menos um localizador na fonte.";
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

  root.addEventListener("keydown", handleKeyDown);
  documentValue?.addEventListener?.("click", handleDocumentClick);

  async function open() {
    if (state.opened) return true;
    state.opened = true;
    ++epoch;
    render();
    if (state.mode === "target") {
      const [catalog, target] = await Promise.all([loadCatalog(), loadTarget()]);
      return catalog && target;
    }
    if (state.initialSourceId !== null) {
      const [catalog, detail] = await Promise.all([loadCatalog(), loadInitialDetail()]);
      return catalog && detail;
    }
    const loaded = await loadCatalog();
    if (loaded && returnFocusSourceId) focusByIdentity({ selector: '[data-source-action="open-source"]',
      datasetKey: "sourceId", datasetValue: returnFocusSourceId });
    return loaded;
  }

  async function refresh(courseRevision = state.courseRevision, nextCoursePublicFileAccess = state.coursePublicFileAccess) {
    if (!state.opened || !Number.isSafeInteger(courseRevision) || courseRevision < 1) {
      return false;
    }
    if (state.mode !== "catalog") return false;
    const refreshed = state.selectedSourceId
      ? state.initialSourceId === state.selectedSourceId
        ? await loadInitialDetail({ preserveExisting: true, courseRevision })
        : Boolean(await loadDetail(state.selectedSourceId, {
            preserveExisting: true,
            courseRevision
          }))
      : await loadCatalog({ preserveExisting: true, courseRevision });
    if (refreshed) {
      if (state.fileAccessConflict !== null && courseRevision > state.fileAccessConflict) {
        state.fileAccessConflict = null;
        state.failure = "";
        state.message = "Fontes atualizadas. Revise a permissão escolhida e confirme novamente.";
      }
      state.coursePublicFileAccess = ["restricted", "available"].includes(nextCoursePublicFileAccess)
        ? nextCoursePublicFileAccess : null;
      render();
    }
    return Boolean(refreshed);
  }

  function destroy() {
    state.opened = false;
    ++epoch;
    documentValue?.removeEventListener?.("click", handleDocumentClick);
    root.removeEventListener?.("keydown", handleKeyDown);
    root.innerHTML = "";
  }

  function hasPendingDraft() {
    const targetChanged = state.mode === "target" &&
      JSON.stringify(state.sourceLinks) !== JSON.stringify(state.initialSourceLinks);
    return Boolean(
      state.pendingCommand || state.pendingAnnotation || state.pendingAttachment || state.pendingFileAccess || state.fileAccessDraft ||
      state.confirmation || state.sourceEditor?.draft || state.anchorEditor?.draft ||
      state.observationEditor?.draft || targetChanged ||
      state.bibliographyStyleDraft && state.bibliographyStyleDraft !== bibliographyStyle(state)
    );
  }

  return Object.freeze({ open, refresh, hasPendingDraft, destroy });
}
