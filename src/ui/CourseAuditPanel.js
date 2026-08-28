import {
  COURSE_AUDIT_DIMENSIONS,
  COURSE_AUDIT_FINDING_STATES,
  COURSE_AUDIT_HUMAN_DIMENSIONS,
  COURSE_AUDIT_RESULTS,
  COURSE_AUDIT_SEVERITIES,
  normalizeCourseAuditCycleCommand,
  normalizeCourseAuditCyclePage,
  normalizeCourseAuditCycleQuery,
  normalizeCourseAuditCycleReadOptions,
  normalizeCourseAuditCycleChange
} from "../domain/courseAuditCycle.js";
import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import {
  applyCourseAuditEditableFields,
  hydrateCourseAuditStudyUnitPreviews,
  listCourseAuditEditableFields,
  renderCourseAuditStudyUnitPreview
} from "./courseAuditStudyUnit.js";
import {
  buildCourseAuthoringRoute,
  parseCourseAuthoringRoute
} from "./courseAuthoringRoute.js";
import { createCourseObservationsPanel } from "./CourseObservationsPanel.js";
import { renderUiIcon } from "./renderUiIcons.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";

const PAGE_SIZE = 12;
const MAX_FINDING_PAGES = 1024;
const MAX_RUN_PAGES = 22;
const METHOD = Object.freeze({
  id: "aralearn.authoring-interface.course-audit",
  version: "1"
});
const ADEQUACY_BY_RESULT = Object.freeze({
  passed: "sufficient",
  failed: "insufficient",
  uncertain: "uncertain",
  not_applicable: "not_applicable",
  not_checked: "not_assessed"
});
const LABELS = Object.freeze({
  dimensions: Object.freeze({
    structural_conformance: "Conformidade estrutural",
    pedagogical_quality: "Qualidade pedagógica",
    factual_quality: "Qualidade factual",
    editorial_quality: "Qualidade editorial"
  }),
  results: Object.freeze({
    passed: "Atende",
    failed: "Não atende",
    uncertain: "Incerto",
    not_applicable: "Não se aplica",
    not_checked: "Não verificado"
  }),
  findingStates: Object.freeze({
    open: "Aberto",
    awaiting_verification: "Aguardando verificação",
    resolved: "Resolvido",
    dismissed: "Dispensado"
  }),
  correctionStates: Object.freeze({
    proposed: "Proposta",
    rejected: "Rejeitada",
    applied: "Aplicada",
    verified: "Verificada",
    rolled_back: "Revertida"
  }),
  severities: Object.freeze({
    low: "Baixa",
    medium: "Média",
    high: "Alta",
    critical: "Crítica"
  }),
  sourceRelations: Object.freeze({
    informed_by: "Informa o conteúdo",
    supported_by: "Sustenta o conteúdo",
    adapted_from: "Origem da adaptação",
    quoted_from: "Origem da citação",
    legacy_reference: "Referência legada"
  }),
  runKinds: Object.freeze({
    audit: "Auditoria",
    verification: "Verificação"
  }),
  origins: Object.freeze({
    human_audit: "Rodada humana",
    automatic_audit: "Rodada automática"
  }),
  historyDecisions: Object.freeze({
    recorded: "Achado registrado",
    dismissed: "Achado dispensado",
    reopened: "Achado reaberto",
    correction_applied: "Correção aplicada",
    resolved: "Verificação resolveu o achado",
    still_open: "Verificação manteve o achado aberto",
    rolled_back: "Correção revertida"
  })
});
const CRITERIA = Object.freeze({
  pedagogical_quality: Object.freeze({
    code: "human_review.pedagogical_quality",
    statement: "A Unidade apresenta progressão e atividade de aprendizagem coerentes com seu objetivo."
  }),
  factual_quality: Object.freeze({
    code: "human_review.factual_quality",
    statement: "As afirmações factuais da Unidade são sustentadas pelas Fontes e Âncoras indicadas."
  }),
  editorial_quality: Object.freeze({
    code: "human_review.editorial_quality",
    statement: "A redação e a representação são claras, consistentes e adequadas ao contexto."
  })
});
const AUDIT_DRAFT_CONTROL_SELECTOR = [
  "[name]",
  "[data-audit-edit-field]",
  "[data-audit-source-ref]",
  "[data-audit-plan-ref]",
  "[data-audit-parameter-ref]",
  "[data-audit-annotation-ref]"
].join(",");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function label(group, value) {
  return LABELS[group]?.[value] || String(value || "");
}

function errorMessage(error) {
  return String(error?.message || error || "A operação de auditoria falhou.");
}

function errorCode(error) {
  return String(error?.code || "").toLowerCase();
}

function isPrivacyFailure(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = errorCode(error);
  return [401, 403, 404].includes(status) ||
    ["unauthorized", "forbidden", "not_found", "pt401", "pt403", "pt404"].includes(code);
}

function isAmbiguousNetworkFailure(error) {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return [
    "failed_to_fetch", "gateway_timeout", "network_error", "network_unavailable",
    "offline", "request_timeout", "service_unavailable"
  ].includes(code) || /failed to fetch|fetch failed|network|offline|connection|socket|timeout/u.test(message);
}

function formattedInstant(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formattedRecordedDuration(timestamps) {
  const startedAt = new Date(timestamps?.createdAt || "").getTime();
  const endedAt = new Date(
    timestamps?.resolvedAt || timestamps?.dismissedAt || timestamps?.updatedAt || ""
  ).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return "Não calculável";
  const minutes = Math.floor((endedAt - startedAt) / 60000);
  if (minutes < 1) return "Menos de 1 minuto";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

function pathLabel(path = []) {
  return path.map(({ label: value }) => value).filter(Boolean).join(" › ") ||
    "Caminho preservado sem rótulos";
}

function summaryValue(value) {
  if (value === null || value === undefined) return "Não informado";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value) && value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
    return value.join(", ");
  }
  return "Valor estruturado";
}

function deepLinkHash(value, courseId) {
  if (typeof value !== "string" || !value) return null;
  let hash;
  try {
    hash = value.startsWith("#/")
      ? value
      : new URL(value, "https://aralearn.invalid/").hash;
  } catch {
    return null;
  }
  const route = parseCourseAuthoringRoute(hash);
  return route?.courseId === courseId ? hash : null;
}

function renderDeepLink(value, courseId, text, className = "course-audit-link") {
  const hash = deepLinkHash(value, courseId);
  return hash
    ? `<a class="${escapeHtml(className)}" href="${escapeHtml(hash)}" data-audit-action="navigate-deep-link">${escapeHtml(text)}</a>`
    : `<span class="course-audit-meta">${escapeHtml(text)} indisponível</span>`;
}

function defaultQuery(mode, values = {}) {
  return normalizeCourseAuditCycleQuery({
    mode,
    targetStudyUnitId: null,
    findingId: null,
    correctionId: null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: [],
    ...values
  });
}

function queryEquals(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function runsAreStrictlyNewestFirst(items) {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    const previousTime = new Date(previous.createdAt).getTime();
    const currentTime = new Date(current.createdAt).getTime();
    if (previousTime < currentTime ||
        previousTime === currentTime && previous.auditRunId <= current.auditRunId) {
      return false;
    }
  }
  return true;
}

function disabled(state) {
  return state.busy || !state.networkOnline ? " disabled" : "";
}

function preview(snapshot, target, heading) {
  try {
    return renderCourseAuditStudyUnitPreview(snapshot, {
      studyUnitId: target.studyUnitId,
      position: target.position || 1,
      heading
    });
  } catch (error) {
    return '<article class="course-audit-preview-card"><header><div>' +
      `<p class="course-audit-caption">${escapeHtml(heading)}</p><h4>Prévia indisponível</h4></div></header>` +
      `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(errorMessage(error))}</p></article>`;
  }
}

function renderSummary(summary) {
  if (!summary || summary.matchingTotal === 0) return "";
  return '<dl class="course-audit-summary">' +
    `<div><dt>Correspondentes</dt><dd>${summary.matchingTotal}</dd></div>` +
    `<div><dt>Abertos</dt><dd>${summary.byState.open}</dd></div>` +
    `<div><dt>Críticos</dt><dd>${summary.bySeverity.critical}</dd></div></dl>`;
}

function renderBadges(finding) {
  return '<div class="course-audit-badges" aria-label="Classificação do achado">' +
    `<span class="course-audit-badge">${escapeHtml(label("findingStates", finding.status))}</span>` +
    `<span class="course-audit-badge">${escapeHtml(label("dimensions", finding.check.dimension))}</span>` +
    `<span class="course-audit-badge">Gravidade ${escapeHtml(label("severities", finding.severity).toLowerCase())}</span>` +
    "</div>";
}

function recordDraftId(context) {
  return `record:${context.contextHash}`;
}

function verificationDraftId(finding, correction) {
  return `verify:${finding.findingId}:${finding.findingVersion}:` +
    `${correction.correctionId}:${correction.correctionVersion}`;
}

function correctionDraftId(editor) {
  return `correction:${editor.correctionId}:${editor.expectedCorrectionVersion}`;
}

function namedDraftKey(name) {
  return `name:${name}`;
}

function editFieldDraftKey(key) {
  return `edit:${key}`;
}

function sourceDraftKey({
  dimension,
  sourceId,
  sourceRevision,
  anchorId,
  anchorRevision
}) {
  return `source:${dimension}:${sourceId}:${sourceRevision}:${anchorId}:${anchorRevision}`;
}

function planDraftKey({ dimension, planItemId, planVersion }) {
  return `plan:${dimension}:${planItemId}:${planVersion}`;
}

function parameterDraftKey({ dimension, parameterId, changeId }) {
  return `parameter:${dimension}:${parameterId}:${changeId || ""}`;
}

function annotationDraftKey({ annotationId, annotationVersion }) {
  return `annotation:${annotationId}:${annotationVersion}`;
}

function auditDraftControlKey(control) {
  if (typeof control?.name === "string" && control.name) return namedDraftKey(control.name);
  const data = control?.dataset || {};
  if (data.auditEditField !== undefined) return editFieldDraftKey(data.auditEditField);
  if (data.auditSourceRef !== undefined) return sourceDraftKey(data);
  if (data.auditPlanRef !== undefined) return planDraftKey(data);
  if (data.auditParameterRef !== undefined) return parameterDraftKey(data);
  if (data.auditAnnotationRef !== undefined) return annotationDraftKey(data);
  return null;
}

function draftControl(draft, key) {
  return draft?.controls?.get?.(key) || null;
}

function draftValue(draft, key, fallback = "") {
  const control = draftControl(draft, key);
  return control ? control.value : String(fallback ?? "");
}

function draftChecked(draft, key, fallback = false) {
  const control = draftControl(draft, key);
  return control ? control.checked : fallback;
}

function selectedAttribute(value, expected) {
  return value === expected ? " selected" : "";
}

function checkedAttribute(value) {
  return value ? " checked" : "";
}

function renderFindingCard(finding, courseId) {
  return `<article class="course-audit-finding-card" data-audit-finding-id="${escapeHtml(finding.findingId)}">` +
    '<header><div>' + renderBadges(finding) +
    `<h3>${escapeHtml(finding.check.criterion.statement)}</h3></div>` +
    `<span class="course-audit-result" data-result="${escapeHtml(finding.check.result)}">${escapeHtml(label("results", finding.check.result))}</span></header>` +
    `<p class="course-audit-path">${escapeHtml(pathLabel(finding.target.path))}</p>` +
    `<p>${escapeHtml(finding.check.publicEvidence)}</p>` +
    '<div class="course-audit-links">' +
    renderDeepLink(finding.deepLinks.detail, courseId, "Abrir achado") +
    renderDeepLink(finding.deepLinks.target, courseId, "Abrir Unidade") +
    "</div></article>";
}

function sourceForLink(context, link) {
  return context?.sources?.find((source) =>
    source.sourceId === link.sourceId && source.sourceRevision === link.sourceRevision) || null;
}

function renderSourceReferences(sourceLinks, context, courseId) {
  if (!sourceLinks.length) return '<p class="course-audit-meta">Nenhuma Fonte foi declarada neste check.</p>';
  return '<ul class="course-audit-reference-list">' + sourceLinks.map((link, sourceIndex) => {
    const source = sourceForLink(context, link);
    const sourceLabel = source?.title || `Fonte preservada ${sourceIndex + 1}`;
    const sourceMarkup = source
      ? renderDeepLink(source.deepLink, courseId, sourceLabel)
      : `<span>${escapeHtml(sourceLabel)} (revisão preservada)</span>`;
    const anchors = link.anchors.map((anchorRef, anchorIndex) => {
      const anchor = source?.anchors.find((item) =>
        item.anchorId === anchorRef.anchorId && item.anchorRevision === anchorRef.anchorRevision);
      return `<li>${anchor
        ? renderDeepLink(anchor.deepLink, courseId, `Abrir Âncora ${anchorIndex + 1}`)
        : `<span>Âncora preservada ${anchorIndex + 1}</span>`}</li>`;
    }).join("");
    return `<li><div>${sourceMarkup}<span class="course-audit-meta">` +
      `${escapeHtml(LABELS.sourceRelations[link.relation] || link.relation)}</span></div>` +
      (anchors ? `<ul>${anchors}</ul>` : "") + "</li>";
  }).join("") + "</ul>";
}

function renderPlanAndParameterReferences(check, context) {
  const plan = check.planItemRefs.map((ref, index) => {
    const item = context?.plan?.items.find((candidate) =>
      candidate.planItemId === ref.planItemId && candidate.version === ref.version);
    return `<li><strong>Plano</strong> · ${escapeHtml(item?.statement || `Item preservado ${index + 1}`)}</li>`;
  });
  const parameters = check.parameterRefs.map((ref, index) => {
    const parameter = context?.design?.parameters.find(({ parameterId }) => parameterId === ref.parameterId);
    return `<li><strong>Parâmetro ${index + 1}</strong> · ` +
      `${escapeHtml(parameter ? summaryValue(parameter.value) : "valor histórico preservado")}</li>`;
  });
  const items = [...plan, ...parameters];
  return items.length
    ? `<ul class="course-audit-reference-list">${items.join("")}</ul>`
    : '<p class="course-audit-meta">Sem referências de plano ou parâmetros.</p>';
}

function renderCheck(check, context, courseId) {
  return '<section class="course-audit-check">' +
    '<div class="course-audit-criterion"><p class="course-audit-caption">Critério público</p>' +
    `<h4>${escapeHtml(check.criterion.statement)}</h4>` +
    '<p class="course-audit-meta">Critério registrado para esta rodada</p></div>' +
    `<div class="course-audit-badges"><span class="course-audit-result" data-result="${escapeHtml(check.result)}">` +
    `${escapeHtml(label("results", check.result))}</span>` +
    `<span class="course-audit-badge">${escapeHtml(label("dimensions", check.dimension))}</span></div>` +
    `<p><strong>Evidência pública:</strong> ${escapeHtml(check.publicEvidence)}</p>` +
    '<div><h4>Fontes e Âncoras do critério</h4>' +
    renderSourceReferences(check.sourceLinks, context, courseId) + "</div>" +
    '<div><h4>Plano e parâmetros considerados</h4>' +
    renderPlanAndParameterReferences(check, context) + "</div></section>";
}

function renderContextReferenceChoices(context, dimension, draft) {
  const sourceChoices = dimension === "factual_quality"
    ? context.sources.flatMap((source) => source.anchors
      .filter((anchor) => source.status === "active" && anchor.status === "active")
      .map((anchor, anchorIndex) => {
        const key = sourceDraftKey({
          dimension,
          sourceId: source.sourceId,
          sourceRevision: source.sourceRevision,
          anchorId: anchor.anchorId,
          anchorRevision: anchor.anchorRevision
        });
        return '<label class="course-audit-reference-choice">' +
          `<input type="checkbox" data-audit-source-ref data-dimension="${dimension}"` +
          ` data-source-id="${escapeHtml(source.sourceId)}" data-source-revision="${source.sourceRevision}"` +
          ` data-anchor-id="${escapeHtml(anchor.anchorId)}" data-anchor-revision="${anchor.anchorRevision}"` +
          `${checkedAttribute(draftChecked(draft, key))}>` +
          `<span>${escapeHtml(source.title)} · Âncora ${anchorIndex + 1}</span></label>`;
      })).join("")
    : "";
  const planChoices = context.plan.items.map((item) => {
    const key = planDraftKey({
      dimension,
      planItemId: item.planItemId,
      planVersion: item.version
    });
    return '<label class="course-audit-reference-choice">' +
      `<input type="checkbox" data-audit-plan-ref data-dimension="${dimension}"` +
      ` data-plan-item-id="${escapeHtml(item.planItemId)}" data-plan-version="${item.version}"` +
      `${checkedAttribute(draftChecked(draft, key))}>` +
      `<span>${escapeHtml(item.statement)}</span></label>`;
  }).join("");
  const parameterChoices = context.design.parameters.map((parameter, index) => {
    const key = parameterDraftKey({
      dimension,
      parameterId: parameter.parameterId,
      changeId: parameter.changeId
    });
    return '<label class="course-audit-reference-choice">' +
      `<input type="checkbox" data-audit-parameter-ref data-dimension="${dimension}"` +
      ` data-parameter-id="${escapeHtml(parameter.parameterId)}"` +
      ` data-change-id="${escapeHtml(parameter.changeId ?? "")}"` +
      `${checkedAttribute(draftChecked(draft, key))}>` +
      `<span>${escapeHtml(parameter.reason || `Parâmetro efetivo ${index + 1}`)} · ${escapeHtml(summaryValue(parameter.value))}</span></label>`;
  }).join("");
  const detailsOpen = draft?.referenceDetailsOpen?.has?.(dimension) ? " open" : "";
  return `<details class="course-audit-form-references" data-audit-reference-details="${dimension}"${detailsOpen}>` +
    "<summary>Vincular contexto ao critério</summary>" +
    (sourceChoices ? `<fieldset><legend>Fontes e Âncoras exatas</legend>${sourceChoices}</fieldset>` : "") +
    `<fieldset><legend>Itens do plano</legend>${planChoices || "Nenhum item disponível."}</fieldset>` +
    `<fieldset><legend>Parâmetros efetivos</legend>${parameterChoices || "Nenhum parâmetro disponível."}</fieldset>` +
    "</details>";
}

function renderChecksForm(context, {
  verification = false,
  finding = null,
  correction = null,
  draft = null
} = {}) {
  const draftId = verification
    ? verificationDraftId(finding, correction)
    : recordDraftId(context);
  const annotations = context.annotations.length
    ? '<fieldset class="course-audit-form-annotations"><legend>Observações que originaram o contexto</legend>' +
      context.annotations.map((annotation) => {
        const key = annotationDraftKey(annotation);
        return '<label class="course-audit-reference-choice">' +
          `<input type="checkbox" data-audit-annotation-ref data-annotation-id="${escapeHtml(annotation.annotationId)}"` +
          ` data-annotation-version="${annotation.annotationVersion}"` +
          `${checkedAttribute(draftChecked(draft, key, true))}>` +
          `<span>${escapeHtml(annotation.briefSummary || annotation.rawText || annotation.annotationId)}</span></label>`;
      }).join("") +
      "</fieldset>"
    : "";
  const checks = COURSE_AUDIT_HUMAN_DIMENSIONS.map((dimension) => {
    const focalCriterion = verification && finding?.check.dimension === dimension
      ? finding.check.criterion
      : null;
    const criterion = focalCriterion || { ...CRITERIA[dimension], version: "1" };
    const locked = focalCriterion ? " readonly aria-readonly=\"true\"" : "";
    const code = draftValue(draft, namedDraftKey(`criterion-code:${dimension}`), criterion.code);
    const version = draftValue(draft, namedDraftKey(`criterion-version:${dimension}`), criterion.version);
    const statement = draftValue(
      draft,
      namedDraftKey(`criterion-statement:${dimension}`),
      criterion.statement
    );
    const selectedResult = draftValue(draft, namedDraftKey(`result:${dimension}`), "not_checked");
    const evidence = draftValue(
      draft,
      namedDraftKey(`evidence:${dimension}`),
      "Não verificado nesta rodada."
    );
    const selectedSeverity = draftValue(draft, namedDraftKey(`severity:${dimension}`), "medium");
    return `<fieldset class="course-audit-check-form" data-audit-check-dimension="${dimension}">` +
      `<legend>${escapeHtml(label("dimensions", dimension))}</legend>` +
      `<input type="hidden" name="criterion-code:${dimension}" value="${escapeHtml(code)}">` +
      `<input type="hidden" name="criterion-version:${dimension}" value="${escapeHtml(version)}">` +
      `<label><span>Critério público</span><textarea name="criterion-statement:${dimension}" required maxlength="1000"${locked}>${escapeHtml(statement)}</textarea></label>` +
      (focalCriterion ? '<p class="course-audit-meta">Critério focal preservado.</p>' : "") +
      `<label><span>Resultado</span><select name="result:${dimension}">` +
      COURSE_AUDIT_RESULTS.map((result) =>
        `<option value="${result}"${selectedAttribute(result, selectedResult)}>${escapeHtml(label("results", result))}</option>`
      ).join("") + "</select></label>" +
      `<label><span>${verification ? "Evidência desta verificação" : "Evidência pública"}</span>` +
      `<textarea name="evidence:${dimension}" required maxlength="2000">${escapeHtml(evidence)}</textarea></label>` +
      (!verification
        ? `<label><span>Gravidade se houver achado</span><select name="severity:${dimension}">` +
          COURSE_AUDIT_SEVERITIES.map((severity) =>
            `<option value="${severity}"${selectedAttribute(severity, selectedSeverity)}>${escapeHtml(label("severities", severity))}</option>`
          ).join("") + "</select></label>"
        : "") + renderContextReferenceChoices(context, dimension, draft) + "</fieldset>";
  }).join("");
  const verificationFields = verification
    ? '<label><span>Conclusão da verificação</span><select name="verification-outcome">' +
      `<option value="still_open"${selectedAttribute("still_open", draftValue(draft, namedDraftKey("verification-outcome"), "still_open"))}>O achado continua aberto</option>` +
      `<option value="resolved"${selectedAttribute("resolved", draftValue(draft, namedDraftKey("verification-outcome"), "still_open"))}>O achado foi resolvido</option></select></label>` +
      '<p class="course-audit-meta">Correção vinculada ao achado</p>'
    : "";
  return `<form class="course-audit-round-form" data-audit-form="${verification ? "verify" : "record"}"` +
    ` data-audit-draft-id="${escapeHtml(draftId)}">` +
    `<header><div><h3>${verification ? "Verificar correção" : "Registrar auditoria"}</h3></div></header>` +
    annotations + checks + verificationFields +
    `<div class="course-audit-editor-actions"><button type="button" data-audit-action="cancel-round">Cancelar</button>` +
    `<button type="submit" class="is-primary"${context ? "" : " disabled"}>${verification ? "Registrar verificação" : "Registrar rodada"}</button></div></form>`;
}

function renderContext(state) {
  const context = state.contextPage?.context;
  if (!context) return '<p class="course-authoring-loading" role="status">Carregando contexto de auditoria…</p>';
  const target = context.target;
  const snapshot = { content: target.content, sourceLinks: target.sourceLinks, hash: target.hash };
  return '<section class="course-audit-context" data-audit-context-study-unit="' +
    escapeHtml(target.studyUnitId) + '">' +
    '<header class="course-audit-detail-heading"><div><p class="course-audit-caption">Unidade existente</p>' +
    `<h3>${escapeHtml(target.content.title || "Unidade de estudo")}</h3>` +
    `<p class="course-audit-path">${escapeHtml(pathLabel(target.path))}</p></div>` +
    '<button type="button" data-audit-action="back-findings">Ver achados</button></header>' +
    '<div class="course-audit-context-card"><dl class="course-audit-summary">' +
    `<div><dt>Fontes</dt><dd>${context.sources.length}</dd></div>` +
    `<div><dt>Observações</dt><dd>${context.annotations.length}</dd></div>` +
    `<div><dt>Itens do plano</dt><dd>${context.plan.items.length}</dd></div></dl>` +
    '<div class="course-audit-links">' +
    renderDeepLink(target.path.at(-1)?.id === target.studyUnitId
      ? buildCourseAuthoringRoute(state.courseId, { section: "content", studyUnitId: target.studyUnitId })
      : null, state.courseId, "Abrir Unidade") + "</div></div>" +
    `<div class="course-audit-preview-grid is-single">${preview(snapshot, target, "Estado atual")}</div>` +
    (state.recordOpen
      ? renderChecksForm(context, { draft: state.formDrafts.get(recordDraftId(context)) })
      : `<div class="course-audit-actions"><button type="button" class="is-primary" data-audit-action="open-record"${disabled(state)}>Registrar auditoria</button></div>`) +
    "</section>";
}

function isStructuralSplitFinding(finding) {
  return finding?.check.dimension === "structural_conformance" &&
    /split|separ|multiple[_-]?concept|atomic/iu.test(finding.code);
}

function renderFindingActions(state, finding, correction) {
  const structuralSplit = isStructuralSplitFinding(finding);
  const actions = [];
  if (finding.capabilities.canDismiss) {
    actions.push(`<button type="button" class="is-danger" data-audit-action="dismiss-finding"${disabled(state)}>Dispensar achado</button>`);
  }
  if (finding.capabilities.canReopen) {
    actions.push(`<button type="button" data-audit-action="reopen-finding"${disabled(state)}>Reabrir achado</button>`);
  }
  if (finding.capabilities.canProposeCorrection && !structuralSplit) {
    actions.push(`<button type="button" class="is-primary" data-audit-action="open-correction-editor"${disabled(state)}>` +
      `${correction?.capabilities.canAdjust ? "Ajustar correção" : "Propor correção"}</button>`);
  }
  if (correction?.capabilities.canReject) {
    actions.push(`<button type="button" class="is-danger" data-audit-action="reject-correction"${disabled(state)}>Rejeitar correção</button>`);
  }
  if (correction?.capabilities.canApply && !structuralSplit) {
    actions.push(`<button type="button" class="is-primary" data-audit-action="apply-correction"${disabled(state)}>Aplicar</button>`);
  }
  if (finding.capabilities.canVerify && correction?.capabilities.canVerify && !structuralSplit) {
    actions.push(`<button type="button" data-audit-action="open-verification"${disabled(state)}>Verificar</button>`);
  }
  if (correction?.capabilities.canRollback) {
    actions.push(`<button type="button" class="is-danger" data-audit-action="rollback-correction"${disabled(state)}>Reverter aplicação</button>`);
  }
  return (structuralSplit
    ? '<p class="course-audit-structural-note">A divisão estrutural permanece pendente.</p>'
    : "") + (actions.length ? `<div class="course-audit-actions">${actions.join("")}</div>` : "");
}

function renderCorrection(state, detail) {
  const correction = detail.selectedCorrection;
  if (!correction) {
    return detail.corrections.length
      ? '<section class="course-audit-history"><h3>Correções</h3><div class="course-audit-links">' +
        detail.corrections.map((item) => renderDeepLink(
          item.deepLink,
          state.courseId,
          label("correctionStates", item.status)
        )).join("") + "</div></section>"
      : '<p class="course-audit-meta">Nenhuma correção foi proposta.</p>';
  }
  return '<section class="course-audit-correction" data-audit-correction-id="' +
    escapeHtml(correction.correctionId) + '"><header><div><p class="course-audit-caption">Correção autoral</p>' +
    `<h3>${escapeHtml(label("correctionStates", correction.status))}</h3></div>` +
    '<div class="course-authoring-header-actions">' +
    '<span class="course-audit-badge">Base preservada</span></div></header>' +
    `<p>${escapeHtml(correction.rationale)}</p>` +
    '<div class="course-audit-links">' +
    renderDeepLink(correction.deepLink, state.courseId, "Link da correção") + "</div>" +
    '<div class="course-audit-preview-grid" data-audit-preview-grid>' +
    preview(correction.checkpoint.before, correction.target, "Antes") +
    preview(correction.checkpoint.after, correction.target, "Depois") + "</div>" +
    '<div class="course-audit-checkpoint-sources"><section><h4>Fontes antes</h4>' +
    renderSourceReferences(
      correction.checkpoint.before.sourceLinks,
      state.detailContextPage?.context,
      state.courseId
    ) + '</section><section><h4>Fontes depois</h4>' +
    renderSourceReferences(
      correction.checkpoint.after.sourceLinks,
      state.detailContextPage?.context,
      state.courseId
    ) + "</section></div>" +
    (correction.application
      ? `<p class="course-audit-meta">Aplicada na Unidade em ${escapeHtml(formattedInstant(correction.application.appliedAt))}.</p>`
      : "") +
    (correction.verification
      ? `<p class="course-audit-meta">Verificação: ${escapeHtml(correction.verification.outcome === "resolved" ? "resolvido" : "continua aberto")}.</p>`
      : "") +
    (correction.rollback
      ? `<p class="course-audit-meta">Revertida em ${escapeHtml(formattedInstant(correction.rollback.rolledBackAt))}.</p>`
      : "") + "</section>";
}

function renderHistory(detail) {
  const findingItems = detail.findingHistory.map((entry) =>
    `<li><div><strong>${escapeHtml(LABELS.historyDecisions[entry.decision] || entry.decision)}</strong>` +
    `<p class="course-audit-meta">${escapeHtml(formattedInstant(entry.createdAt))}</p></div></li>`
  );
  const correctionItems = detail.selectedCorrectionHistory.map((entry) =>
    `<li><div><strong>Correção ${escapeHtml(label("correctionStates", entry.status).toLowerCase())}</strong>` +
    `<p>${escapeHtml(entry.rationale)}</p>` +
    `<p class="course-audit-meta">${escapeHtml(formattedInstant(entry.createdAt))}</p></div></li>`
  );
  return '<section class="course-audit-history"><h3>Histórico</h3>' +
    `<ol class="course-audit-history-list">${[...findingItems, ...correctionItems].join("") ||
      "<li><div>Nenhuma transição registrada.</div></li>"}</ol>` +
    (detail.auditRuns.length
      ? '<details><summary>Rodadas preservadas</summary>' + detail.auditRuns.map((run) =>
        `<section class="course-audit-check"><h4>${run.runKind === "verification" ? "Verificação" : "Auditoria"} · ${escapeHtml(formattedInstant(run.createdAt))}</h4>` +
        `<p>${run.metrics.checksTotal} checks · ${run.metrics.findingsCreated} achados criados</p></section>`
      ).join("") + "</details>"
      : "") + "</section>";
}

function renderDetail(state) {
  const detail = state.detailPage?.detail;
  if (!detail) return '<p class="course-authoring-loading" role="status">Carregando achado…</p>';
  const finding = detail.finding;
  const correction = detail.selectedCorrection;
  const annotationLinks = finding.annotationRefs.map((annotation) =>
    renderDeepLink(annotation.deepLink, state.courseId, "Abrir observação relacionada")
  ).join("");
  return '<section class="course-audit-detail" data-audit-detail-id="' + escapeHtml(finding.findingId) + '">' +
    '<header class="course-audit-detail-heading"><div><p class="course-audit-caption">Achado</p>' +
    `<h3>${escapeHtml(finding.check.criterion.statement)}</h3>${renderBadges(finding)}</div>` +
    '<div class="course-authoring-header-actions"><button type="button"' +
    ' data-audit-action="back-findings">Voltar aos achados</button></div></header>' +
    `<p class="course-audit-path">${escapeHtml(pathLabel(finding.target.path))}</p>` +
    '<div class="course-audit-links">' +
    renderDeepLink(finding.deepLinks.detail, state.courseId, "Link do achado") +
    renderDeepLink(finding.deepLinks.target, state.courseId, "Abrir Unidade") + annotationLinks + "</div>" +
    '<dl class="course-audit-summary" aria-label="Métricas do ciclo">' +
    '<div><dt>Unidades afetadas</dt><dd>1</dd></div>' +
    `<div><dt>Tempo registrado</dt><dd>${escapeHtml(formattedRecordedDuration(finding.timestamps))}</dd></div></dl>` +
    renderCheck(finding.check, state.detailContextPage?.context, state.courseId) +
    (state.detailContextError
      ? `<p class="course-authoring-notice" role="status">Contexto corrente indisponível: ${escapeHtml(state.detailContextError)}. As referências históricas foram preservadas.</p>`
      : "") +
    renderCorrection(state, detail) + renderFindingActions(state, finding, correction) +
    (state.verifyOpen && state.detailContextPage?.context && correction
      ? renderChecksForm(state.detailContextPage.context, {
          verification: true,
          finding,
          correction,
          draft: state.formDrafts.get(verificationDraftId(finding, correction))
        })
      : "") + renderHistory(detail) + "</section>";
}

function renderFilters(state) {
  const option = (value, current, group) =>
    `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(label(group, value))}</option>`;
  return '<div class="course-audit-toolbar" aria-label="Filtros de achados">' +
    '<label><span>Estado</span><select data-audit-filter="state"><option value="">Todos</option>' +
    COURSE_AUDIT_FINDING_STATES.map((value) => option(value, state.filters.state, "findingStates")).join("") +
    '</select></label><label><span>Dimensão</span><select data-audit-filter="dimension"><option value="">Todas</option>' +
    COURSE_AUDIT_DIMENSIONS.map((value) => option(value, state.filters.dimension, "dimensions")).join("") +
    '</select></label><label><span>Gravidade</span><select data-audit-filter="severity"><option value="">Todas</option>' +
    COURSE_AUDIT_SEVERITIES.map((value) => option(value, state.filters.severity, "severities")).join("") +
    '</select></label><button type="button" class="course-authoring-icon-action"' +
    ' data-audit-action="reload-findings" aria-label="Atualizar achados" title="Atualizar achados">' +
    `${renderUiIcon("rotate", "course-authoring-button-icon")}</button></div>`;
}

function renderFindings(state) {
  const items = state.findingItems;
  const pageNumber = state.findingPageIndex + 1;
  const pagination = state.summary?.matchingTotal > 0 && state.findingPageIndex >= 0
    ? '<nav class="course-audit-actions" aria-label="Paginação de achados">' +
      (state.findingPageIndex > 0
        ? `<button type="button" class="course-audit-load-more" data-audit-action="previous-findings"${disabled(state)}>Página anterior</button>`
        : "") +
      `<span class="course-audit-meta" aria-live="polite">Página ${pageNumber}</span>` +
      (state.hasMore
        ? `<button type="button" class="course-audit-load-more" data-audit-action="load-more"${disabled(state)}>Próxima página</button>`
        : "") + "</nav>"
    : "";
  return '<section class="course-audit-findings">' + renderAuditIndexSwitch(state, "findings") +
    '<header class="course-audit-detail-heading"><div>' +
    '<h3>Achados</h3></div></header>' +
    renderFilters(state) + renderSummary(state.summary) +
    `<div class="course-audit-finding-list">${items.map((finding) =>
      renderFindingCard(finding, state.courseId)).join("") ||
      (state.loading ? "" : '<p class="course-authoring-empty-copy">Nenhum achado corresponde aos filtros.</p>')}</div>` +
    (state.loading ? '<p class="course-authoring-loading" role="status">Carregando achados…</p>' : "") +
    pagination + "</section>";
}

function renderAuditIndexSwitch(state, current) {
  return '<div class="course-audit-index-switch" role="group" aria-label="Índice de auditoria">' +
    `<button type="button" data-audit-action="show-findings" aria-pressed="${current === "findings"}"${disabled(state)}>Achados</button>` +
    `<button type="button" data-audit-action="show-runs" aria-pressed="${current === "runs"}"${disabled(state)}>Rodadas</button></div>`;
}

function renderResultCounts(counts) {
  return '<dl class="course-audit-result-counts" aria-label="Resultados da rodada">' +
    `<div><dt>Atende</dt><dd>${counts.passed}</dd></div>` +
    `<div><dt>Não atende</dt><dd>${counts.failed}</dd></div>` +
    `<div><dt>Incerto</dt><dd>${counts.uncertain}</dd></div>` +
    `<div><dt>Não se aplica</dt><dd>${counts.not_applicable}</dd></div>` +
    `<div><dt>Não verificado</dt><dd>${counts.not_checked}</dd></div></dl>`;
}

function renderRunCard(run, courseId) {
  return `<article class="course-audit-run-card" data-audit-run-id="${escapeHtml(run.auditRunId)}">` +
    '<header><div>' +
    `<p class="course-audit-caption">${escapeHtml(label("origins", run.origin))}</p>` +
    `<h4>${escapeHtml(label("runKinds", run.runKind))} · ${escapeHtml(formattedInstant(run.createdAt))}</h4>` +
    `<p class="course-audit-meta">${escapeHtml(pathLabel(run.target.path))}</p></div>` +
    `<span class="course-audit-badge">${run.findingsCreated === 0
      ? "Nenhum achado criado"
      : `${run.findingsCreated} ${run.findingsCreated === 1 ? "achado criado" : "achados criados"}`}</span></header>` +
    renderResultCounts(run.resultCounts) +
    '<div class="course-audit-links">' +
    renderDeepLink(run.deepLink, courseId, "Abrir rodada") + "</div></article>";
}

function renderRuns(state) {
  return '<section class="course-audit-runs">' + renderAuditIndexSwitch(state, "runs") +
    '<header class="course-audit-detail-heading"><div><h3>Rodadas</h3></div>' +
    '<button type="button" class="course-authoring-icon-action" data-audit-action="reload-runs"' +
    ` aria-label="Atualizar rodadas" title="Atualizar rodadas"${disabled(state)}>` +
    `${renderUiIcon("rotate", "course-authoring-button-icon")}</button></header>` +
    `<div class="course-audit-run-list">${state.runItems.map((run) =>
      renderRunCard(run, state.courseId)).join("") ||
      (state.loading ? "" : '<p class="course-authoring-empty-copy">Nenhuma rodada foi registrada.</p>')}</div>` +
    (state.loading ? '<p class="course-authoring-loading" role="status">Carregando rodadas…</p>' : "") +
    (state.runsHasMore
      ? `<button type="button" class="course-audit-load-more" data-audit-action="load-more-runs"${disabled(state)}>Carregar mais rodadas</button>`
      : "") + "</section>";
}

function renderRunDetail(state) {
  const run = state.runDetailPage?.runDetail;
  if (!run) return '<p class="course-authoring-loading" role="status">Carregando rodada…</p>';
  const selfLink = buildCourseAuthoringRoute(state.courseId, {
    section: "review",
    auditRunId: run.auditRunId
  });
  const targetLink = buildCourseAuthoringRoute(state.courseId, {
    section: "content",
    studyUnitId: run.target.studyUnitId
  });
  return '<section class="course-audit-run-detail" data-audit-run-detail-id="' +
    escapeHtml(run.auditRunId) + '"><header class="course-audit-detail-heading"><div>' +
    `<p class="course-audit-caption">${escapeHtml(label("origins", run.origin))}</p>` +
    `<h3>${escapeHtml(label("runKinds", run.runKind))} · ${escapeHtml(formattedInstant(run.createdAt))}</h3></div>` +
    '<div class="course-authoring-header-actions"><button type="button"' +
    ' data-audit-action="back-runs">Voltar às rodadas</button></div></header>' +
    `<p class="course-audit-path">${escapeHtml(pathLabel(run.target.path))}</p>` +
    '<div class="course-audit-links">' +
    renderDeepLink(selfLink, state.courseId, "Link da rodada") +
    renderDeepLink(targetLink, state.courseId, "Inspecionar Unidade") + "</div>" +
    '<section class="course-audit-context-card"><h4>Resumo da rodada</h4>' +
    '<dl class="course-audit-summary">' +
    `<div><dt>Checks</dt><dd>${run.metrics.checksTotal}</dd></div>` +
    `<div><dt>Achados criados</dt><dd>${run.metrics.findingsCreated}</dd></div></dl>` +
    renderResultCounts(run.metrics.byResult) + "</section>" +
    '<section class="course-audit-run-checks"><h4>Checks da rodada</h4>' +
    run.checks.map((check) => renderCheck(check, null, state.courseId)).join("") +
    "</section></section>";
}

function renderEditor(state) {
  const editor = state.editor;
  if (!editor) return "";
  const draftId = correctionDraftId(editor);
  const draft = state.formDrafts.get(draftId);
  return '<div class="course-audit-editor-overlay" data-audit-editor-overlay>' +
    '<section class="course-audit-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="course-audit-editor-title">' +
    `<header><p class="course-audit-caption">${editor.expectedCorrectionVersion ? "Ajuste versionado" : "Nova proposta"}</p>` +
    '<h3 id="course-audit-editor-title">Editar título e folhas da Unidade</h3></header>' +
    `<form data-audit-form="correction" data-audit-draft-id="${escapeHtml(draftId)}">` +
    '<div class="course-audit-editor-fields">' +
    editor.fields.map((field) => '<label>' +
      `<span>${escapeHtml(field.label)} <small>${escapeHtml(field.slot === "study_unit" ? "Unidade" : field.slot)}</small></span>` +
      `<textarea data-audit-edit-field="${escapeHtml(field.key)}"${field.preserveWhitespace ? ' class="preserve-whitespace"' : ""}>` +
      `${escapeHtml(draftValue(draft, editFieldDraftKey(field.key), field.value))}</textarea></label>`
    ).join("") + "</div>" +
    '<label><span>Justificativa da correção</span><textarea name="rationale" required maxlength="2000">' +
    `${escapeHtml(draftValue(draft, namedDraftKey("rationale"), editor.rationale))}</textarea></label>` +
    '<div class="course-audit-editor-actions"><button type="button" data-audit-action="close-editor">Cancelar</button>' +
    `<button type="submit" class="is-primary"${disabled(state)}>Salvar proposta</button></div></form></section></div>`;
}

function renderAuditConfirmation(state) {
  const confirmation = state.confirmation;
  if (!confirmation) return "";
  const tone = confirmation.tone || "secondary";
  const buttonClass = tone === "danger"
    ? "is-danger"
    : tone === "primary"
      ? "is-primary"
      : "course-authoring-secondary";
  const icon = confirmation.icon || "remove-state";
  return '<div class="course-authoring-confirm-backdrop" data-audit-confirmation-backdrop>' +
    '<section class="course-authoring-confirm-dialog" data-audit-confirmation role="alertdialog"' +
    ` data-confirmation-tone="${escapeHtml(tone)}"` +
    ' aria-modal="true" aria-labelledby="course-audit-confirmation-title"' +
    ' aria-describedby="course-audit-confirmation-message">' +
    `<h2 id="course-audit-confirmation-title">${escapeHtml(confirmation.title)}</h2>` +
    `<p id="course-audit-confirmation-message">${escapeHtml(confirmation.message)}</p>` +
    '<div class="course-authoring-confirm-actions">' +
    '<button type="button" class="course-authoring-secondary" data-audit-action="cancel-confirmation">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}<span>Cancelar</span></button>` +
    `<button type="button" class="${buttonClass}" data-audit-action="confirm-mutation"${state.busy ? " disabled" : ""}>` +
    `${renderUiIcon(icon, "course-authoring-button-icon")}<span>${escapeHtml(confirmation.confirmLabel)}</span>` +
    "</button></div></section></div>";
}

function renderAuditView(state) {
  const content = state.mode === "context"
    ? renderContext(state)
    : state.mode === "detail"
      ? renderDetail(state)
      : state.mode === "runs"
        ? renderRuns(state)
        : state.mode === "run_detail"
          ? renderRunDetail(state)
          : renderFindings(state);
  return (state.networkOnline
    ? ""
    : '<p class="course-audit-network-note" role="alert">Sem conexão.</p>') +
    '<p class="course-authoring-notice is-error" data-audit-hydration-error hidden role="alert"></p>' +
    (state.error ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.error)}</p>` : "") +
    (state.pendingMutation
      ? `<button type="button" class="course-audit-load-more" data-audit-action="retry-mutation"${disabled(state)}>Confirmar a mesma operação</button>`
      : "") +
    (state.message ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.message)}</p>` : "") +
    (state.suggestedAnnotationActions.length
      ? '<section class="course-audit-context-card"><h3>Observações sugeridas</h3>' +
        '<ul>' +
        state.suggestedAnnotationActions.map((suggestion) => {
          const label = suggestion.action === "resolve" ? "Revisar sugestão de resolução" :
            "Revisar sugestão de reabertura";
          const href = buildCourseAuthoringRoute(state.courseId, {
            section: "review",
            annotationId: suggestion.annotationId
          });
          return `<li><a href="${escapeHtml(href)}" data-audit-action="navigate-deep-link">` +
            `${escapeHtml(label)}</a></li>`;
        }).join("") + "</ul></section>"
      : "") + content + renderAuditConfirmation(state) + renderEditor(state);
}

function formValue(form, name) {
  const control = form?.elements?.namedItem?.(name) || form?.elements?.[name];
  return String(control?.value ?? "");
}

function selectedNodes(form, selector, dimension = null) {
  return [...(form.querySelectorAll?.(selector) || [])].filter((node) =>
    node.checked && (dimension === null || node.dataset.dimension === dimension));
}

function checksFromForm(form) {
  return COURSE_AUDIT_HUMAN_DIMENSIONS.map((dimension) => {
    const result = formValue(form, `result:${dimension}`);
    const sourceGroups = new Map();
    for (const node of selectedNodes(form, "[data-audit-source-ref]", dimension)) {
      const key = `${node.dataset.sourceId}\u0000${node.dataset.sourceRevision}`;
      if (!sourceGroups.has(key)) {
        sourceGroups.set(key, {
          sourceId: node.dataset.sourceId,
          sourceRevision: Number(node.dataset.sourceRevision),
          relation: "supported_by",
          anchors: []
        });
      }
      sourceGroups.get(key).anchors.push({
        anchorId: node.dataset.anchorId,
        anchorRevision: Number(node.dataset.anchorRevision)
      });
    }
    return {
      checkId: createUuid(),
      dimension,
      criterion: {
        code: formValue(form, `criterion-code:${dimension}`).trim(),
        version: formValue(form, `criterion-version:${dimension}`),
        statement: formValue(form, `criterion-statement:${dimension}`)
      },
      result,
      publicEvidence: formValue(form, `evidence:${dimension}`),
      adequacy: ADEQUACY_BY_RESULT[result],
      planItemRefs: selectedNodes(form, "[data-audit-plan-ref]", dimension).map((node) => ({
        planItemId: node.dataset.planItemId,
        version: Number(node.dataset.planVersion)
      })),
      parameterRefs: selectedNodes(form, "[data-audit-parameter-ref]", dimension).map((node) => ({
        parameterId: node.dataset.parameterId,
        changeId: node.dataset.changeId || null
      })),
      sourceLinks: [...sourceGroups.values()]
    };
  });
}

function annotationRefsFromForm(form) {
  return selectedNodes(form, "[data-audit-annotation-ref]").map((node) => ({
    annotationId: node.dataset.annotationId,
    annotationVersion: Number(node.dataset.annotationVersion)
  }));
}

function auditMutationOperationDraft(command) {
  const draft = structuredClone(command);
  if (["record_audit", "verify_finding"].includes(draft.type)) {
    draft.auditRunId = "<generated-audit-run>";
    const checkIds = new Map((draft.checks || []).map(({ checkId }, index) => [
      checkId,
      `<generated-check-${index}>`
    ]));
    draft.checks = (draft.checks || []).map((check, index) => ({
      ...check,
      checkId: checkIds.get(check.checkId) || `<generated-check-${index}>`
    }));
    if (draft.type === "record_audit") {
      draft.findings = (draft.findings || []).map((finding, index) => ({
        ...finding,
        findingId: `<generated-finding-${index}>`,
        checkId: checkIds.get(finding.checkId) || finding.checkId
      }));
    }
  }
  if (draft.type === "propose_authoring_correction" &&
      draft.expectedCorrectionVersion === 0) {
    draft.correctionId = "<generated-correction>";
  }
  return draft;
}

export function createCourseAuditPanel({
  root,
  controller,
  course,
  routeTarget = null,
  onNavigate = () => {},
  onCourseRevisionChange = () => {},
  navigatorValue = globalThis.navigator || null,
  windowValue = globalThis.window || null,
  documentValue = root?.ownerDocument || globalThis.document || null
} = {}) {
  if (!root || typeof root.addEventListener !== "function" ||
      typeof controller?.loadCourseAuditCycle !== "function" ||
      typeof controller?.mutateCourseAuditCycle !== "function" ||
      !UUID_PATTERN.test(String(course?.courseId || "")) ||
      !Number.isSafeInteger(course?.revision) || course.revision < 1 ||
      routeTarget && !["anchored_annotation", "audit_finding", "audit_run", "study_unit"].includes(routeTarget.kind) ||
      typeof onNavigate !== "function" || typeof onCourseRevisionChange !== "function") {
    throw new TypeError("Dependências de Auditoria e correções são inválidas.");
  }

  let observationsPanel = null;
  let auditHost = null;
  let observationsHost = null;
  let listEpoch = 0;
  let runListEpoch = 0;
  let contextEpoch = 0;
  let detailEpoch = 0;
  let mutationEpoch = 0;
  const state = {
    destroyed: false,
    courseId: course.courseId,
    courseRevision: course.revision,
    routeTarget,
    activeView: ["audit_finding", "audit_run", "study_unit"].includes(routeTarget?.kind)
      ? "findings"
      : "observations",
    mode: routeTarget?.kind === "audit_finding"
      ? "detail"
      : routeTarget?.kind === "audit_run"
        ? "run_detail"
        : routeTarget?.kind === "study_unit"
          ? "context"
        : "findings",
    networkOnline: navigatorValue?.onLine !== false,
    auditSetVersion: null,
    findingItems: [],
    summary: null,
    hasMore: false,
    nextCursor: null,
    findingPageIndex: -1,
    findingPageCursors: [],
    findingPageIds: [],
    runItems: [],
    runsHasMore: false,
    runsNextCursor: null,
    runPages: 0,
    seenRunCursors: new Set(),
    filters: { state: "", dimension: "", severity: "" },
    contextPage: null,
    contextAnnotationIds: [],
    detailPage: null,
    runDetailPage: null,
    detailContextPage: null,
    detailContextError: "",
    loading: false,
    busy: false,
    error: "",
    message: "",
    recordOpen: false,
    verifyOpen: false,
    editor: null,
    formDrafts: new Map(),
    dirtyDraftIds: new Set(),
    draftFocus: null,
    pendingMutation: null,
    confirmation: null,
    suggestedAnnotationActions: []
  };

  function clearSensitiveAuditState() {
    state.findingItems = [];
    state.summary = null;
    state.hasMore = false;
    state.nextCursor = null;
    state.findingPageIndex = -1;
    state.findingPageCursors = [];
    state.findingPageIds = [];
    state.runItems = [];
    state.runsHasMore = false;
    state.runsNextCursor = null;
    state.runPages = 0;
    state.seenRunCursors = new Set();
    state.contextPage = null;
    state.detailPage = null;
    state.runDetailPage = null;
    state.detailContextPage = null;
    state.editor = null;
    state.formDrafts.clear();
    state.dirtyDraftIds.clear();
    state.draftFocus = null;
    state.confirmation = null;
    state.verifyOpen = false;
    state.recordOpen = false;
    state.auditSetVersion = null;
    state.suggestedAnnotationActions = [];
  }

  function assertOnline() {
    if (!state.networkOnline || navigatorValue?.onLine === false) {
      throw Object.assign(new TypeError("Auditoria exige conexão de rede."), { code: "offline" });
    }
  }

  function formForDraftControl(control) {
    const form = control?.closest?.("[data-audit-form][data-audit-draft-id]") ||
      control?.closest?.("[data-audit-form]");
    return form?.dataset?.auditDraftId ? form : null;
  }

  function draftControlSnapshot(control) {
    const type = String(control?.type || "").toLowerCase();
    return {
      value: String(control?.value ?? ""),
      checked: ["checkbox", "radio"].includes(type) ? Boolean(control.checked) : false
    };
  }

  function captureAuditFormDraft(form, focusControl = null) {
    const draftId = form?.dataset?.auditDraftId;
    if (!draftId) return null;
    const previous = state.formDrafts.get(draftId);
    const controls = new Map(previous?.controls || []);
    for (const control of form.querySelectorAll?.(AUDIT_DRAFT_CONTROL_SELECTOR) || []) {
      const key = auditDraftControlKey(control);
      if (key) controls.set(key, draftControlSnapshot(control));
    }
    const referenceDetailsOpen = new Set();
    for (const details of form.querySelectorAll?.("[data-audit-reference-details]") || []) {
      if (details.open) referenceDetailsOpen.add(details.dataset.auditReferenceDetails);
    }
    state.formDrafts.set(draftId, { controls, referenceDetailsOpen });

    const focusedKey = auditDraftControlKey(focusControl);
    if (focusedKey) {
      state.draftFocus = {
        draftId,
        controlKey: focusedKey,
        selectionStart: Number.isInteger(focusControl.selectionStart)
          ? focusControl.selectionStart
          : null,
        selectionEnd: Number.isInteger(focusControl.selectionEnd)
          ? focusControl.selectionEnd
          : null
      };
    }
    return draftId;
  }

  function captureVisibleAuditDrafts() {
    const activeElement = documentValue?.activeElement || null;
    const activeForm = formForDraftControl(activeElement);
    for (const form of auditHost?.querySelectorAll?.(
      "[data-audit-form][data-audit-draft-id]"
    ) || []) {
      captureAuditFormDraft(form, form === activeForm ? activeElement : null);
    }
    if (activeElement && auditHost?.contains?.(activeElement) && !activeForm) {
      state.draftFocus = null;
    }
  }

  function restoreAuditDraftFocus() {
    const focus = state.draftFocus;
    if (!focus) return;
    for (const form of auditHost?.querySelectorAll?.(
      "[data-audit-form][data-audit-draft-id]"
    ) || []) {
      if (form.dataset.auditDraftId !== focus.draftId) continue;
      const control = [...(form.querySelectorAll?.(AUDIT_DRAFT_CONTROL_SELECTOR) || [])]
        .find((candidate) => auditDraftControlKey(candidate) === focus.controlKey);
      if (!control) return;
      control.focus?.({ preventScroll: true });
      if (focus.selectionStart !== null && focus.selectionEnd !== null) {
        try {
          control.setSelectionRange?.(focus.selectionStart, focus.selectionEnd);
        } catch {
          // Controles sem seleção textual ainda recebem o foco restaurado.
        }
      }
      return;
    }
  }

  function clearFormDraft(draftId) {
    if (!draftId) return;
    state.formDrafts.delete(draftId);
    state.dirtyDraftIds.delete(draftId);
    if (state.draftFocus?.draftId === draftId) state.draftFocus = null;
  }

  function markFormDraftDirty(form) {
    const draftId = form?.dataset?.auditDraftId;
    if (draftId) state.dirtyDraftIds.add(draftId);
  }

  function clearFormDraftsByKind(kind) {
    const prefix = `${kind}:`;
    for (const draftId of state.formDrafts.keys()) {
      if (draftId.startsWith(prefix)) clearFormDraft(draftId);
    }
  }

  function renderAudit({ captureDrafts = true } = {}) {
    if (state.destroyed || !auditHost) return;
    if (captureDrafts) captureVisibleAuditDrafts();
    auditHost.innerHTML = renderAuditView(state);
    auditHost.setAttribute?.("aria-busy", String(state.loading || state.busy));
    restoreAuditDraftFocus();
    void hydrateCourseAuditStudyUnitPreviews(auditHost).catch((error) => {
      if (!state.destroyed) {
        state.error = `Uma prévia não pôde ser materializada: ${errorMessage(error)}`;
        const notice = auditHost.querySelector?.("[data-audit-hydration-error]");
        if (notice) {
          notice.textContent = state.error;
          notice.hidden = false;
        }
      }
    });
  }

  function focusAudit(selector) {
    auditHost?.querySelector?.(selector)?.focus?.({ preventScroll: true });
  }

  function cancelConfirmation({ restoreFocus = true } = {}) {
    const confirmation = state.confirmation;
    if (!confirmation) return false;
    state.confirmation = null;
    renderAudit();
    if (restoreFocus) focusAudit(confirmation.returnFocusSelector);
    return true;
  }

  function requestConfirmation(confirmation) {
    state.confirmation = confirmation;
    renderAudit();
    focusAudit('[data-audit-action="cancel-confirmation"]');
  }

  function confirmMutation() {
    const confirmation = state.confirmation;
    if (!confirmation || state.busy) return;
    state.confirmation = null;
    void runMutation(confirmation.input, confirmation.successMessage);
  }

  function handleDocumentClick(event) {
    if (!state.confirmation || !event.target?.matches?.("[data-audit-confirmation-backdrop]")) return;
    cancelConfirmation();
  }

  function syncView() {
    if (!auditHost || !observationsHost) return;
    const observations = state.activeView === "observations";
    observationsHost.hidden = !observations;
    auditHost.hidden = observations;
    root.querySelectorAll?.("[data-audit-tab]").forEach((tab) => {
      const selected = tab.dataset.auditTab === state.activeView;
      tab.setAttribute?.("aria-selected", String(selected));
      tab.setAttribute?.("tabindex", selected ? "0" : "-1");
    });
  }

  async function ensureObservations() {
    if (observationsPanel || state.destroyed) return true;
    observationsPanel = createCourseObservationsPanel({
      root: observationsHost,
      controller,
      course: { ...course, revision: state.courseRevision },
      routeTarget: state.routeTarget?.kind === "anchored_annotation" ? state.routeTarget : null,
      embedded: true,
      onNavigate,
      onAuditTarget({ studyUnitId, annotationId }) {
        state.activeView = "findings";
        state.mode = "context";
        syncView();
        void loadContext(studyUnitId, { annotationIds: annotationId ? [annotationId] : [], fresh: true });
      },
      documentValue
    });
    return observationsPanel.open();
  }

  async function readPage(query, { cursor = null, limit = PAGE_SIZE, auditSetVersion = state.auditSetVersion } = {}) {
    assertOnline();
    const options = normalizeCourseAuditCycleReadOptions({
      expectedCourseRevision: state.courseRevision,
      auditSetVersion,
      query,
      cursor,
      limit
    });
    const page = normalizeCourseAuditCyclePage(
      await controller.loadCourseAuditCycle(state.courseId, options)
    );
    if (page.courseId !== state.courseId || page.courseRevision !== options.expectedCourseRevision ||
        options.auditSetVersion !== null && page.auditSetVersion !== options.auditSetVersion ||
        !queryEquals(page.query, options.query)) {
      throw new TypeError("A leitura de auditoria não corresponde ao pedido literal.");
    }
    return page;
  }

  function acceptPageSet(page) {
    if (state.auditSetVersion !== null && state.auditSetVersion !== page.auditSetVersion) {
      throw new TypeError("A versão do conjunto de auditoria mudou durante a leitura.");
    }
    state.auditSetVersion = page.auditSetVersion;
  }

  function handleFailure(error, { sensitive = false } = {}) {
    if (isPrivacyFailure(error) || sensitive) clearSensitiveAuditState();
    state.error = errorMessage(error);
    state.loading = false;
    state.busy = false;
    renderAudit();
  }

  async function loadFindings({ direction = "reset", fresh = false } = {}) {
    const epoch = ++listEpoch;
    state.mode = "findings";
    state.runDetailPage = null;
    state.loading = true;
    state.error = "";
    state.message = "";
    if (direction === "reset") {
      state.findingItems = [];
      state.summary = null;
      state.hasMore = false;
      state.nextCursor = null;
      state.findingPageIndex = -1;
      state.findingPageCursors = [];
      state.findingPageIds = [];
      if (fresh) state.auditSetVersion = null;
    }
    renderAudit();
    try {
      if (!new Set(["reset", "next", "previous"]).has(direction)) {
        throw new TypeError("A direção da paginação de achados é inválida.");
      }
      const targetPageIndex = direction === "reset"
        ? 0
        : state.findingPageIndex + (direction === "next" ? 1 : -1);
      if (targetPageIndex < 0 || targetPageIndex >= MAX_FINDING_PAGES) {
        throw new TypeError("A paginação de achados excedeu o limite seguro.");
      }
      if (direction === "next" && !state.nextCursor) {
        throw new TypeError("A paginação de achados não forneceu um cursor de avanço.");
      }
      const cursor = direction === "reset"
        ? null
        : direction === "next"
          ? state.nextCursor
          : state.findingPageCursors[targetPageIndex];
      if (direction === "previous" && targetPageIndex > 0 && !cursor) {
        throw new TypeError("A paginação de achados não preservou o cursor da página.");
      }
      const recordedCursorIndex = state.findingPageCursors.indexOf(cursor);
      if (direction === "next" && recordedCursorIndex >= 0 && recordedCursorIndex !== targetPageIndex) {
        throw new TypeError("A paginação repetiu um cursor de achados.");
      }
      if (state.findingPageCursors[targetPageIndex] !== undefined &&
          state.findingPageCursors[targetPageIndex] !== cursor) {
        throw new TypeError("A paginação alterou um cursor de achados já observado.");
      }
      const query = defaultQuery("findings", {
        states: state.filters.state ? [state.filters.state] : [],
        dimensions: state.filters.dimension ? [state.filters.dimension] : [],
        severities: state.filters.severity ? [state.filters.severity] : []
      });
      const page = await readPage(query, { cursor, auditSetVersion: fresh ? null : state.auditSetVersion });
      if (state.destroyed || epoch !== listEpoch) return false;
      acceptPageSet(page);
      if (page.hasMore && page.items.length === 0) {
        throw new TypeError("A paginação retornou uma página vazia intermediária.");
      }
      if (page.hasMore && targetPageIndex + 1 >= MAX_FINDING_PAGES) {
        throw new TypeError("A paginação de achados excedeu o limite seguro.");
      }
      const pageIds = page.items.map(({ findingId }) => findingId);
      if (new Set(pageIds).size !== pageIds.length) {
        throw new TypeError("A paginação repetiu um achado.");
      }
      const recordedPageIds = state.findingPageIds[targetPageIndex];
      if (recordedPageIds && JSON.stringify(recordedPageIds) !== JSON.stringify(pageIds)) {
        throw new TypeError("A paginação alterou uma página de achados já observada.");
      }
      if (!recordedPageIds) {
        const priorIds = new Set(state.findingPageIds.flat());
        if (pageIds.some((findingId) => priorIds.has(findingId))) {
          throw new TypeError("A paginação repetiu um achado.");
        }
      }
      if (state.summary && JSON.stringify(state.summary) !== JSON.stringify(page.summary)) {
        throw new TypeError("O resumo de achados mudou durante a paginação.");
      }
      const expectedNextCursor = state.findingPageCursors[targetPageIndex + 1];
      if (expectedNextCursor !== undefined &&
          (!page.hasMore || page.nextCursor !== expectedNextCursor)) {
        throw new TypeError("A paginação alterou o encadeamento de cursores de achados.");
      }
      const nextPageCursors = [...state.findingPageCursors];
      const nextPageIds = [...state.findingPageIds];
      nextPageCursors[targetPageIndex] = cursor;
      nextPageIds[targetPageIndex] = pageIds;
      if (page.hasMore && nextPageCursors[targetPageIndex + 1] === undefined) {
        nextPageCursors[targetPageIndex + 1] = page.nextCursor;
      }
      state.findingItems = page.items;
      state.summary = page.summary;
      state.hasMore = page.hasMore;
      state.nextCursor = page.nextCursor;
      state.findingPageIndex = targetPageIndex;
      state.findingPageCursors = nextPageCursors;
      state.findingPageIds = nextPageIds;
      return true;
    } catch (error) {
      if (!state.destroyed && epoch === listEpoch) handleFailure(error);
      return false;
    } finally {
      if (!state.destroyed && epoch === listEpoch) {
        state.loading = false;
        renderAudit();
      }
    }
  }

  async function loadRuns({ append = false, fresh = false } = {}) {
    const epoch = ++runListEpoch;
    state.mode = "runs";
    state.runDetailPage = null;
    state.loading = true;
    state.error = "";
    state.message = "";
    if (!append) {
      state.runItems = [];
      state.runsHasMore = false;
      state.runsNextCursor = null;
      state.runPages = 0;
      state.seenRunCursors = new Set();
      if (fresh) state.auditSetVersion = null;
    }
    renderAudit();
    try {
      if (append && (state.runPages >= MAX_RUN_PAGES || !state.runsNextCursor)) {
        throw new TypeError("A paginação de rodadas excedeu o limite seguro.");
      }
      const query = defaultQuery("runs");
      const cursor = append ? state.runsNextCursor : null;
      if (cursor && state.seenRunCursors.has(cursor)) {
        throw new TypeError("A paginação repetiu um cursor de rodadas.");
      }
      const page = await readPage(query, { cursor, auditSetVersion: fresh ? null : state.auditSetVersion });
      if (state.destroyed || epoch !== runListEpoch) return false;
      acceptPageSet(page);
      if (page.hasMore && page.runs.length === 0) {
        throw new TypeError("A paginação retornou uma página vazia intermediária de rodadas.");
      }
      const merged = append ? [...state.runItems, ...page.runs] : page.runs;
      if (new Set(merged.map(({ auditRunId }) => auditRunId)).size !== merged.length) {
        throw new TypeError("A paginação repetiu uma rodada.");
      }
      if (!runsAreStrictlyNewestFirst(merged)) {
        throw new TypeError("A paginação de rodadas não avançou na ordem newest-first.");
      }
      if (cursor) state.seenRunCursors.add(cursor);
      state.runItems = merged;
      state.runsHasMore = page.hasMore;
      state.runsNextCursor = page.nextCursor;
      state.runPages += 1;
      return true;
    } catch (error) {
      if (!state.destroyed && epoch === runListEpoch) handleFailure(error);
      return false;
    } finally {
      if (!state.destroyed && epoch === runListEpoch) {
        state.loading = false;
        renderAudit();
      }
    }
  }

  async function loadContext(studyUnitId, { annotationIds = [], fresh = false, detail = false } = {}) {
    const epoch = ++contextEpoch;
    if (!detail) {
      state.mode = "context";
      state.contextPage = null;
      state.contextAnnotationIds = [...annotationIds];
      state.recordOpen = false;
      state.loading = true;
      state.error = "";
      state.message = "";
      if (fresh) state.auditSetVersion = null;
      renderAudit();
    } else {
      state.detailContextPage = null;
      state.detailContextError = "";
    }
    try {
      const query = defaultQuery("context", {
        targetStudyUnitId: studyUnitId,
        annotationIds
      });
      const page = await readPage(query, { auditSetVersion: fresh ? null : state.auditSetVersion });
      if (state.destroyed || epoch !== contextEpoch) return false;
      acceptPageSet(page);
      if (detail) state.detailContextPage = page;
      else state.contextPage = page;
      return true;
    } catch (error) {
      if (state.destroyed || epoch !== contextEpoch) return false;
      if (detail && !isPrivacyFailure(error)) {
        state.detailContextError = errorMessage(error);
        return false;
      }
      handleFailure(error);
      return false;
    } finally {
      if (!state.destroyed && epoch === contextEpoch) {
        if (!detail) state.loading = false;
        renderAudit();
      }
    }
  }

  async function loadDetail(findingId, { correctionId = null, fresh = false } = {}) {
    const epoch = ++detailEpoch;
    state.mode = "detail";
    state.detailPage = null;
    state.runDetailPage = null;
    state.detailContextPage = null;
    state.detailContextError = "";
    state.verifyOpen = false;
    state.editor = null;
    state.loading = true;
    state.error = "";
    state.message = "";
    if (fresh) state.auditSetVersion = null;
    renderAudit();
    try {
      const query = defaultQuery("detail", { findingId, correctionId });
      const page = await readPage(query, { auditSetVersion: fresh ? null : state.auditSetVersion });
      if (state.destroyed || epoch !== detailEpoch) return false;
      acceptPageSet(page);
      state.detailPage = page;
      state.loading = false;
      renderAudit();
      const finding = page.detail.finding;
      if (finding.target.currentAvailable) {
        await loadContext(finding.target.studyUnitId, {
          annotationIds: finding.annotationRefs.filter(({ available }) => available)
            .map(({ annotationId }) => annotationId),
          detail: true
        });
      } else {
        state.detailContextError = "A Unidade atual não está disponível.";
      }
      return true;
    } catch (error) {
      if (!state.destroyed && epoch === detailEpoch) handleFailure(error);
      return false;
    } finally {
      if (!state.destroyed && epoch === detailEpoch) {
        state.loading = false;
        renderAudit();
      }
    }
  }

  async function loadRunDetail(auditRunId, { fresh = false } = {}) {
    const epoch = ++detailEpoch;
    state.mode = "run_detail";
    state.detailPage = null;
    state.runDetailPage = null;
    state.detailContextPage = null;
    state.detailContextError = "";
    state.verifyOpen = false;
    state.editor = null;
    state.loading = true;
    state.error = "";
    state.message = "";
    if (fresh) state.auditSetVersion = null;
    renderAudit();
    try {
      const query = defaultQuery("detail", { auditRunId });
      const page = await readPage(query, { auditSetVersion: fresh ? null : state.auditSetVersion });
      if (state.destroyed || epoch !== detailEpoch) return false;
      acceptPageSet(page);
      state.runDetailPage = page;
      return true;
    } catch (error) {
      if (!state.destroyed && epoch === detailEpoch) handleFailure(error);
      return false;
    } finally {
      if (!state.destroyed && epoch === detailEpoch) {
        state.loading = false;
        renderAudit();
      }
    }
  }

  function mutationInput(command, requestId = createUuid()) {
    return {
      requestId,
      courseId: state.courseId,
      expectedCourseRevision: state.courseRevision,
      command: normalizeCourseAuditCycleCommand(command)
    };
  }

  async function refreshCurrentAfterMutation() {
    const snapshot = {
      mode: state.mode,
      contextPage: state.contextPage,
      contextAnnotationIds: state.contextAnnotationIds,
      detailPage: state.detailPage,
      runDetailPage: state.runDetailPage,
      detailContextPage: state.detailContextPage,
      detailContextError: state.detailContextError,
      findingItems: state.findingItems,
      summary: state.summary,
      hasMore: state.hasMore,
      nextCursor: state.nextCursor,
      findingPageIndex: state.findingPageIndex,
      findingPageCursors: state.findingPageCursors,
      findingPageIds: state.findingPageIds,
      recordOpen: state.recordOpen,
      verifyOpen: state.verifyOpen,
      editor: state.editor
    };
    let reconciled;
    if (state.mode === "detail" && state.detailPage?.query.findingId) {
      reconciled = await loadDetail(state.detailPage.query.findingId, {
        correctionId: state.detailPage.detail?.selectedCorrection?.correctionId ||
          state.detailPage.query.correctionId
      });
    } else if (state.mode === "context" && state.contextPage?.context) {
      reconciled = await loadContext(state.contextPage.context.target.studyUnitId, {
        annotationIds: state.contextAnnotationIds
      });
    } else {
      reconciled = await loadFindings();
    }
    if (!reconciled && !state.destroyed) Object.assign(state, snapshot);
    return reconciled;
  }

  function pendingMutationMatches(draftId, operationDraft) {
    return state.pendingMutation?.draftId === draftId &&
      JSON.stringify(state.pendingMutation.operationDraft) === JSON.stringify(operationDraft);
  }

  async function runMutation(input, message, {
    draftId = null,
    operationDraft = auditMutationOperationDraft(input.command)
  } = {}) {
    const epoch = ++mutationEpoch;
    const normalizedDraft = structuredClone(operationDraft);
    const pending = pendingMutationMatches(draftId, normalizedDraft)
      ? state.pendingMutation
      : {
          input: structuredClone(input),
          message,
          draftId,
          operationDraft: normalizedDraft
        };
    state.busy = true;
    state.error = "";
    state.message = "";
    state.pendingMutation = pending;
    renderAudit();
    let mutationConfirmed = false;
    const reconciliationNotice = state.mode === "findings" || state.mode === "runs"
      ? "A lista será atualizada na próxima sincronização."
      : "O detalhe será atualizado na próxima sincronização.";
    try {
      assertOnline();
      const change = normalizeCourseAuditCycleChange(
        await controller.mutateCourseAuditCycle(structuredClone(pending.input))
      );
      if (state.destroyed || epoch !== mutationEpoch) return false;
      if (change.courseId !== state.courseId ||
          change.requestId !== pending.input.requestId ||
          change.courseRevision < state.courseRevision) {
        throw new TypeError("A confirmação da auditoria não corresponde ao comando.");
      }
      mutationConfirmed = true;
      const revisionChanged = change.courseRevision !== state.courseRevision;
      state.courseRevision = change.courseRevision;
      state.auditSetVersion = change.auditSetVersion;
      state.suggestedAnnotationActions = change.suggestedAnnotationActions;
      state.pendingMutation = null;
      clearFormDraft(pending.draftId);
      const confirmedMessage = change.changed
        ? `${pending.message} O Estudo só refletirá a observação do próprio estudante após recarregar; achados e evidências permanecem privados.`
        : "A operação já estava confirmada; nenhuma mudança adicional foi necessária.";
      if (revisionChanged) onCourseRevisionChange(change.courseRevision);
      const reconciled = await refreshCurrentAfterMutation();
      state.error = "";
      state.message = reconciled
        ? confirmedMessage
        : `${confirmedMessage} ${reconciliationNotice}`;
      renderAudit();
      return true;
    } catch (error) {
      if (state.destroyed || epoch !== mutationEpoch) return false;
      if (mutationConfirmed) {
        state.pendingMutation = null;
        clearFormDraft(pending.draftId);
        state.error = "";
        state.message = `${pending.message} ${reconciliationNotice}`;
        return true;
      }
      if (!isAmbiguousNetworkFailure(error)) state.pendingMutation = null;
      if (isPrivacyFailure(error)) clearSensitiveAuditState();
      state.error = isAmbiguousNetworkFailure(error)
        ? `${errorMessage(error)} Tente novamente para confirmar exatamente a mesma operação.`
        : errorMessage(error);
      return false;
    } finally {
      if (!state.destroyed && epoch === mutationEpoch) {
        state.busy = false;
        renderAudit();
      }
    }
  }

  function currentDetail() {
    return state.detailPage?.detail || null;
  }

  async function openCorrectionEditor() {
    const detail = currentDetail();
    if (!detail) return;
    const finding = detail.finding;
    if (!finding.capabilities.canProposeCorrection || isStructuralSplitFinding(finding)) return;
    if (!state.detailContextPage?.context && finding.target.currentAvailable) {
      await loadContext(finding.target.studyUnitId, {
        annotationIds: finding.annotationRefs.filter(({ available }) => available)
          .map(({ annotationId }) => annotationId),
        detail: true
      });
    }
    const selectedCorrection = detail.selectedCorrection;
    const correction = selectedCorrection?.capabilities.canAdjust ? selectedCorrection : null;
    const snapshot = correction?.checkpoint.after || (state.detailContextPage?.context
      ? {
          content: state.detailContextPage.context.target.content,
          sourceLinks: state.detailContextPage.context.target.sourceLinks
        }
      : null);
    if (!snapshot) {
      state.error = "O estado atual da Unidade não está disponível para uma proposta lossless.";
      renderAudit();
      return;
    }
    try {
      const pendingCorrection = state.pendingMutation?.input?.command;
      const pendingCorrectionId = pendingCorrection?.type === "propose_authoring_correction" &&
        pendingCorrection.findingId === finding.findingId &&
        pendingCorrection.expectedFindingVersion === finding.findingVersion &&
        pendingCorrection.expectedCorrectionVersion === (correction?.correctionVersion || 0)
        ? pendingCorrection.correctionId
        : null;
      state.editor = {
        correctionId: correction?.correctionId || pendingCorrectionId || createUuid(),
        expectedCorrectionVersion: correction?.correctionVersion || 0,
        baseContent: structuredClone(snapshot.content),
        sourceLinks: structuredClone(snapshot.sourceLinks),
        fields: listCourseAuditEditableFields(snapshot.content, {
          studyUnitId: finding.target.studyUnitId
        }),
        rationale: correction?.rationale || ""
      };
      const hasDraft = state.formDrafts.has(correctionDraftId(state.editor));
      renderAudit();
      if (!hasDraft) {
        globalThis.queueMicrotask?.(() =>
          auditHost?.querySelector?.("[data-audit-edit-field]")?.focus?.());
      }
    } catch (error) {
      state.error = errorMessage(error);
      renderAudit();
    }
  }

  function submitRecord(form) {
    const context = state.contextPage?.context;
    if (!context) return;
    try {
      const checks = checksFromForm(form);
      const annotationRefs = annotationRefsFromForm(form);
      const findings = checks.filter(({ result }) => ["failed", "uncertain"].includes(result))
        .map((check) => ({
          findingId: createUuid(),
          checkId: check.checkId,
          code: check.criterion.code,
          severity: formValue(form, `severity:${check.dimension}`),
          annotationRefs
        }));
      const command = {
        type: "record_audit",
        auditRunId: createUuid(),
        targetStudyUnitId: context.target.studyUnitId,
        contextHash: context.contextHash,
        origin: "human_audit",
        method: METHOD,
        checks,
        findings
      };
      state.recordOpen = false;
      void runMutation(mutationInput(command), "Auditoria registrada.", {
        draftId: form.dataset.auditDraftId || null
      });
    } catch (error) {
      state.error = errorMessage(error);
      renderAudit();
    }
  }

  function submitVerification(form) {
    const detail = currentDetail();
    const context = state.detailContextPage?.context;
    const correction = detail?.selectedCorrection;
    if (!detail || !context || !correction) return;
    try {
      const command = {
        type: "verify_finding",
        auditRunId: createUuid(),
        findingId: detail.finding.findingId,
        expectedFindingVersion: detail.finding.findingVersion,
        correctionId: correction.correctionId,
        expectedCorrectionVersion: correction.correctionVersion,
        contextHash: context.contextHash,
        origin: "human_audit",
        method: METHOD,
        checks: checksFromForm(form),
        outcome: formValue(form, "verification-outcome")
      };
      state.verifyOpen = false;
      void runMutation(
        mutationInput(command),
        "Verificação registrada; as Observações vinculadas foram atualizadas conforme o resultado.",
        {
        draftId: form.dataset.auditDraftId || null
        }
      );
    } catch (error) {
      state.error = errorMessage(error);
      renderAudit();
    }
  }

  function submitCorrection(form) {
    const detail = currentDetail();
    const editor = state.editor;
    if (!detail || !editor) return;
    try {
      const values = Object.fromEntries([...(form.querySelectorAll?.("[data-audit-edit-field]") || [])]
        .map((field) => [field.dataset.auditEditField, field.value]));
      const afterContent = applyCourseAuditEditableFields(editor.baseContent, values, {
        studyUnitId: detail.finding.target.studyUnitId
      });
      const command = {
        type: "propose_authoring_correction",
        correctionId: editor.correctionId,
        findingId: detail.finding.findingId,
        expectedFindingVersion: detail.finding.findingVersion,
        expectedCorrectionVersion: editor.expectedCorrectionVersion,
        afterContent,
        afterSourceLinks: editor.sourceLinks,
        rationale: formValue(form, "rationale")
      };
      state.editor = null;
      void runMutation(mutationInput(command), editor.expectedCorrectionVersion
        ? "Correção ajustada."
        : "Correção proposta.", { draftId: form.dataset.auditDraftId || null });
    } catch (error) {
      state.error = errorMessage(error);
      renderAudit();
    }
  }

  function refsCommand(type) {
    const detail = currentDetail();
    const correction = detail?.selectedCorrection;
    if (!detail || !correction) return null;
    return {
      type,
      findingId: detail.finding.findingId,
      expectedFindingVersion: detail.finding.findingVersion,
      correctionId: correction.correctionId,
      expectedCorrectionVersion: correction.correctionVersion
    };
  }

  function switchTab(view) {
    if (!new Set(["observations", "findings"]).has(view)) return;
    state.activeView = view;
    syncView();
    if (view === "observations") void ensureObservations();
    else if (
      state.mode === "run_detail" && state.runDetailPage ||
      state.mode === "runs" && state.runItems.length > 0 ||
      state.mode === "detail" && state.detailPage ||
      state.mode === "context" && state.contextPage
    ) {
      renderAudit();
    } else if (state.findingItems.length === 0) {
      void loadFindings();
    } else renderAudit();
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest?.("[data-audit-tab]");
    if (tab) {
      event.preventDefault();
      switchTab(tab.dataset.auditTab);
      return;
    }
    const node = event.target.closest?.("[data-audit-action]");
    if (!node || state.destroyed) return;
    const action = node.dataset.auditAction;
    if (action === "cancel-confirmation") {
      cancelConfirmation();
    } else if (action === "confirm-mutation") {
      confirmMutation();
    } else if (action === "navigate-deep-link") {
      const hash = deepLinkHash(node.getAttribute("href"), state.courseId);
      if (!hash) return;
      event.preventDefault();
      onNavigate(hash);
    } else if (action === "load-more" && state.hasMore && !state.loading) {
      void loadFindings({ direction: "next" });
    } else if (action === "previous-findings" && state.findingPageIndex > 0 && !state.loading) {
      void loadFindings({ direction: "previous" });
    } else if (action === "load-more-runs" && state.runsHasMore && !state.loading) {
      void loadRuns({ append: true });
    } else if (action === "reload-findings") {
      void loadFindings({ fresh: true });
    } else if (action === "reload-runs") {
      void loadRuns({ fresh: true });
    } else if (action === "show-findings") {
      void loadFindings();
    } else if (action === "show-runs") {
      void loadRuns();
    } else if (action === "back-findings") {
      state.contextPage = null;
      state.detailPage = null;
      state.runDetailPage = null;
      state.detailContextPage = null;
      state.mode = "findings";
      void loadFindings();
    } else if (action === "back-runs") {
      state.runDetailPage = null;
      state.mode = "runs";
      void loadRuns();
    } else if (action === "open-record") {
      state.recordOpen = true;
      renderAudit();
    } else if (action === "cancel-round") {
      if (state.recordOpen) clearFormDraftsByKind("record");
      if (state.verifyOpen) clearFormDraftsByKind("verify");
      state.recordOpen = false;
      state.verifyOpen = false;
      renderAudit({ captureDrafts: false });
    } else if (action === "close-editor") {
      if (state.editor) clearFormDraft(correctionDraftId(state.editor));
      state.editor = null;
      renderAudit({ captureDrafts: false });
    } else if (action === "open-correction-editor") {
      void openCorrectionEditor();
    } else if (action === "dismiss-finding") {
      const finding = currentDetail()?.finding;
      if (finding) {
        requestConfirmation({
          title: "Dispensar achado?",
          message: "A decisão ficará no histórico.",
          confirmLabel: "Dispensar",
          tone: "secondary",
          icon: "remove-state",
          input: mutationInput({
          type: "decide_finding",
          findingId: finding.findingId,
          expectedFindingVersion: finding.findingVersion,
          decision: "dismiss"
          }),
          successMessage: "Achado dispensado.",
          returnFocusSelector: '[data-audit-action="dismiss-finding"]'
        });
      }
    } else if (action === "reopen-finding") {
      const finding = currentDetail()?.finding;
      if (finding) void runMutation(mutationInput({
        type: "decide_finding",
        findingId: finding.findingId,
        expectedFindingVersion: finding.findingVersion,
        decision: "reopen"
      }), "Achado reaberto.");
    } else if (action === "reject-correction") {
      const command = refsCommand("reject_authoring_correction");
      if (command) {
        requestConfirmation({
          title: "Rejeitar proposta?",
          message: "O achado continuará aberto.",
          confirmLabel: "Rejeitar",
          tone: "danger",
          icon: "trash",
          input: mutationInput(command),
          successMessage: "Correção rejeitada; o achado permanece aberto.",
          returnFocusSelector: '[data-audit-action="reject-correction"]'
        });
      }
    } else if (action === "apply-correction") {
      const command = refsCommand("apply_authoring_correction");
      if (command && !isStructuralSplitFinding(currentDetail()?.finding)) {
        requestConfirmation({
          title: "Aplicar correção?",
          message: "A proposta será aplicada à Unidade atual.",
          confirmLabel: "Aplicar",
          tone: "primary",
          icon: "ready-state",
          input: mutationInput(command),
          successMessage: "Correção aplicada; verifique o resultado antes de resolver o achado.",
          returnFocusSelector: '[data-audit-action="apply-correction"]'
        });
      }
    } else if (action === "open-verification") {
      const detail = currentDetail();
      if (!detail?.selectedCorrection || isStructuralSplitFinding(detail.finding)) return;
      if (state.detailContextPage?.context) {
        state.verifyOpen = true;
        renderAudit();
      } else {
        void loadContext(detail.finding.target.studyUnitId, {
          annotationIds: detail.finding.annotationRefs.filter(({ available }) => available)
            .map(({ annotationId }) => annotationId),
          detail: true
        }).then((loaded) => {
          if (loaded) {
            state.verifyOpen = true;
            renderAudit();
          }
        });
      }
    } else if (action === "rollback-correction") {
      const command = refsCommand("rollback_authoring_correction");
      if (command) {
        requestConfirmation({
          title: "Reverter aplicação?",
          message: "A Unidade voltará ao checkpoint anterior.",
          confirmLabel: "Reverter",
          tone: "secondary",
          icon: "reset",
          input: mutationInput(command),
          successMessage: "Aplicação revertida.",
          returnFocusSelector: '[data-audit-action="rollback-correction"]'
        });
      }
    } else if (action === "retry-mutation" && state.pendingMutation) {
      void runMutation(state.pendingMutation.input, state.pendingMutation.message, {
        draftId: state.pendingMutation.draftId,
        operationDraft: state.pendingMutation.operationDraft
      });
    }
  });

  root.addEventListener("input", (event) => {
    const form = formForDraftControl(event.target);
    if (form) {
      captureAuditFormDraft(form, event.target);
      markFormDraftDirty(form);
    }
  });

  root.addEventListener("change", (event) => {
    const form = formForDraftControl(event.target);
    if (form) {
      captureAuditFormDraft(form, event.target);
      markFormDraftDirty(form);
    }
    const filter = event.target.dataset?.auditFilter;
    if (!filter || !Object.hasOwn(state.filters, filter)) return;
    state.filters[filter] = event.target.value;
    void loadFindings({ fresh: true });
  });

  root.addEventListener("submit", (event) => {
    const kind = event.target.dataset?.auditForm;
    if (!kind) return;
    event.preventDefault();
    captureAuditFormDraft(event.target, documentValue?.activeElement || null);
    if (!state.networkOnline) {
      state.error = "Auditoria exige conexão de rede.";
      renderAudit();
      return;
    }
    if (kind === "record") submitRecord(event.target);
    else if (kind === "verify") submitVerification(event.target);
    else if (kind === "correction") submitCorrection(event.target);
  });

  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.("[data-audit-tab]");
    if (state.confirmation && event.key === "Tab") {
      trapAuthoringConfirmationTab({
        event,
        root: auditHost,
        confirmationSelector: "[data-audit-confirmation]",
        documentValue
      });
    } else if (event.key === "Escape" && cancelConfirmation()) {
      event.preventDefault();
      event.stopPropagation?.();
    } else if (tab && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const view = tab.dataset.auditTab === "observations" ? "findings" : "observations";
      switchTab(view);
      root.querySelector?.(`[data-audit-tab="${view}"]`)?.focus?.();
    } else if (event.key === "Escape" && state.editor) {
      clearFormDraft(correctionDraftId(state.editor));
      state.editor = null;
      renderAudit({ captureDrafts: false });
    }
  });

  documentValue?.addEventListener?.("click", handleDocumentClick);

  function handleNetworkChange() {
    state.networkOnline = navigatorValue?.onLine !== false;
    renderAudit();
  }

  async function open() {
    root.innerHTML = '<section class="course-authoring-section course-audit-panel" aria-labelledby="course-authoring-section-title">' +
      '<h2 class="course-authoring-visually-hidden" id="course-authoring-section-title">Revisão</h2>' +
      '<div class="course-audit-tabs" role="tablist" aria-label="Auditoria e correções">' +
      '<button type="button" role="tab" data-audit-tab="observations" aria-controls="course-audit-observations"' +
      ' aria-label="Observações" title="Observações">' +
      `${renderUiIcon("prompt", "course-authoring-button-icon")}</button>` +
      '<button type="button" role="tab" data-audit-tab="findings" aria-controls="course-audit-findings"' +
      ' aria-label="Achados" title="Achados">' +
      `${renderUiIcon("review", "course-authoring-button-icon")}</button></div>` +
      '<div id="course-audit-observations" class="course-audit-view" role="tabpanel" data-course-audit-observations></div>' +
      '<div id="course-audit-findings" class="course-audit-view" role="tabpanel" data-course-audit-findings></div>' +
      "</section>";
    observationsHost = root.querySelector?.("[data-course-audit-observations]");
    auditHost = root.querySelector?.("[data-course-audit-findings]");
    if (!observationsHost || !auditHost) throw new TypeError("Hosts de Auditoria ausentes.");
    windowValue?.addEventListener?.("online", handleNetworkChange);
    windowValue?.addEventListener?.("offline", handleNetworkChange);
    syncView();
    renderAudit();
    if (state.activeView === "observations") return ensureObservations();
    if (state.routeTarget.kind === "study_unit") {
      return loadContext(state.routeTarget.id, { fresh: true });
    }
    return state.routeTarget.kind === "audit_run"
      ? loadRunDetail(state.routeTarget.id, { fresh: true })
      : loadDetail(state.routeTarget.id, {
          correctionId: state.routeTarget.correctionId || null,
          fresh: true
        });
  }

  async function refresh(nextCourseRevision = state.courseRevision) {
    const revision = Number(nextCourseRevision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new TypeError("A revisão do Curso para atualizar a Auditoria é inválida.");
    }
    if (revision !== state.courseRevision) {
      state.courseRevision = revision;
      state.auditSetVersion = null;
    }
    if (state.activeView === "observations") {
      return observationsPanel?.refresh?.(revision) || ensureObservations();
    }
    if (state.mode === "detail" && state.detailPage?.query.findingId) {
      return loadDetail(state.detailPage.query.findingId, {
        correctionId: state.detailPage.query.correctionId,
        fresh: true
      });
    }
    if (state.mode === "run_detail" && state.runDetailPage?.query.auditRunId) {
      return loadRunDetail(state.runDetailPage.query.auditRunId, { fresh: true });
    }
    if (state.mode === "context" && state.contextPage?.context) {
      return loadContext(state.contextPage.context.target.studyUnitId, {
        annotationIds: state.contextAnnotationIds,
        fresh: true
      });
    }
    if (state.mode === "runs") return loadRuns({ fresh: true });
    return loadFindings({ fresh: true });
  }

  function hasPendingDraft() {
    return Boolean(
      state.pendingMutation || state.confirmation || state.dirtyDraftIds.size > 0 ||
      observationsPanel?.hasPendingDraft?.()
    );
  }

  function destroy() {
    state.destroyed = true;
    ++listEpoch;
    ++runListEpoch;
    ++contextEpoch;
    ++detailEpoch;
    ++mutationEpoch;
    observationsPanel?.destroy?.();
    observationsPanel = null;
    documentValue?.removeEventListener?.("click", handleDocumentClick);
    windowValue?.removeEventListener?.("online", handleNetworkChange);
    windowValue?.removeEventListener?.("offline", handleNetworkChange);
    root.innerHTML = "";
  }

  return Object.freeze({ open, refresh, hasPendingDraft, destroy });
}
