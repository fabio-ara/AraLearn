import {
  COURSE_ANCHORED_ANNOTATION_CATEGORIES,
  COURSE_ANCHORED_ANNOTATION_CHANNELS,
  COURSE_ANCHORED_ANNOTATION_ORIGINS,
  COURSE_ANCHORED_ANNOTATION_STATES,
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";
import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import { buildCourseAuthoringRoute } from "./courseAuthoringRoute.js";
import { trapAuthoringConfirmationTab } from "./courseAuthoringConfirmation.js";
import { normalizeCourseAuthoringOutline } from "./courseAuthoringViewModel.js";
import { renderUiIcon } from "./renderUiIcons.js";
import {
  formatObservationTextBudget,
  isObservationTextOverLimit,
  validateStudyUnitObservationText
} from "./renderStudyUnitObservationSheet.js";

const PAGE_SIZE = 12;
const DRAFT_FOCUS_SELECTORS = Object.freeze({
  create: '[data-observation-create-form] textarea[name="rawText"]',
  edit: '[data-observation-edit-form] textarea[name="rawText"]',
  response: '[data-observation-response-form] textarea[name="ownerResponse"]'
});
const LABELS = Object.freeze({
  origins: Object.freeze({
    author: "Autoria",
    learner: "Estudante",
    reviewer: "Pessoa revisora",
    imported: "Importada"
  }),
  channels: Object.freeze({
    authoring_interface: "Interface de autoria",
    authoring_chat: "Assistência de autoria",
    study_interface: "Interface de estudo",
    imported: "Importação"
  }),
  states: Object.freeze({
    open: "Aberta", considered: "Considerada", resolved: "Resolvida", withdrawn: "Retirada"
  }),
  categories: Object.freeze({
    question: "Dúvida", possible_error: "Possível erro", confusing: "Trecho confuso",
    suggestion: "Sugestão", reformulation_request: "Pedido de reformulação"
  })
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function label(group, value, fallback = "") {
  return LABELS[group]?.[value] || fallback || String(value || "");
}

function ambiguousMutationFailure(error) {
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
  if ([
    "40001", "access_revoked", "course_access_revoked", "course_not_found",
    "course_not_owned", "course_revision_changed", "forbidden",
    "invalid_course_command", "invalid_tool_argument", "pt404"
  ].includes(code) || code.startsWith("invalid_")) {
    return false;
  }
  return [
    "failed_to_fetch", "gateway_timeout", "network_error", "network_unavailable",
    "offline", "request_timeout", "service_unavailable"
  ].includes(code) ||
    /(?:failed to fetch|fetch failed|network|offline|load failed|connection|socket|timeout)/u
      .test(message) ||
    (status == null && !code);
}

function pendingMutationMatches(pending, draft) {
  return pending != null && JSON.stringify(pending.draft) === JSON.stringify(draft);
}

function defaultQuery(annotationId = null) {
  return normalizeCourseAnchoredAnnotationQuery({
    mode: annotationId ? "detail" : "inbox",
    origins: [],
    channels: [],
    states: [],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: null,
    annotationId
  });
}

function options(values, group, selected = "") {
  return '<option value="">Todos</option>' + values.map((value) =>
    `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>` +
    `${escapeHtml(label(group, value))}</option>`).join("");
}

function pathLabel(item) {
  const path = item.target.currentPath || item.target.observedPath;
  return path.map(({ label: value }) => value).filter(Boolean).join(" › ") || "Contexto indisponível";
}

function targetLinkLabel(kind) {
  return `Abrir ${({
    course: "Curso",
    module: "Módulo",
    lesson: "Lição",
    topic: "Tópico",
    didactic_microsequence: "Microssequência",
    study_unit: "Unidade"
  })[kind] || "contexto"}`;
}

function emptyOutlineCatalog() {
  return Object.freeze({
    targets: Object.freeze([]),
    subjects: Object.freeze([])
  });
}

function outlineCatalog(value, courseId, revision) {
  const normalized = normalizeCourseAuthoringOutline(value, {
    expectedCourseId: courseId,
    expectedRevision: revision
  });
  const targets = [{
    kind: "course",
    id: courseId,
    title: normalized.course.title,
    label: normalized.course.title,
    path: [{ kind: "course", id: courseId, label: normalized.course.title }],
    subjectIds: []
  }];
  const subjects = [];
  const raw = value.outline;
  for (const moduleValue of raw.modules) {
    const moduleTarget = {
      kind: "module",
      id: moduleValue.id,
      title: moduleValue.title,
      label: moduleValue.title,
      path: [
        { kind: "course", id: courseId, label: normalized.course.title },
        { kind: "module", id: moduleValue.id, label: moduleValue.title }
      ],
      subjectIds: []
    };
    targets.push(moduleTarget);
    for (const lesson of moduleValue.lessons) {
      const lessonTarget = {
        kind: "lesson",
        id: lesson.id,
        title: lesson.title,
        label: `${moduleValue.title} › ${lesson.title}`,
        path: [...moduleTarget.path, { kind: "lesson", id: lesson.id, label: lesson.title }],
        subjectIds: []
      };
      targets.push(lessonTarget);
      for (const topic of lesson.topics) {
        const subject = {
          id: topic.id,
          label: topic.title,
          lessonId: lesson.id,
          moduleId: moduleValue.id
        };
        subjects.push(subject);
        moduleTarget.subjectIds.push(topic.id);
        lessonTarget.subjectIds.push(topic.id);
        targets.push({
          kind: "topic",
          id: topic.id,
          title: topic.title,
          label: `${moduleValue.title} › ${lesson.title} › ${topic.title}`,
          path: [...lessonTarget.path, { kind: "topic", id: topic.id, label: topic.title }],
          subjectIds: [topic.id]
        });
      }
      for (const microsequence of lesson.microsequences) {
        targets.push({
          kind: "didactic_microsequence",
          id: microsequence.id,
          title: microsequence.title,
          label: `${moduleValue.title} › ${lesson.title} › ${microsequence.title}`,
          path: [
            ...lessonTarget.path,
            {
              kind: "didactic_microsequence",
              id: microsequence.id,
              label: microsequence.title
            }
          ],
          subjectIds: [...lessonTarget.subjectIds]
        });
      }
    }
  }
  targets[0].subjectIds = subjects.map(({ id }) => id);
  return Object.freeze({
    targets: Object.freeze(targets.map((target) => Object.freeze({
      ...target,
      path: Object.freeze(target.path.map(Object.freeze)),
      subjectIds: Object.freeze([...target.subjectIds])
    }))),
    subjects: Object.freeze(subjects
      .map((subject) => Object.freeze(subject))
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR")))
  });
}

function targetCatalogForFilters(state) {
  return state.outlineCatalog.targets.filter(({ kind }) => kind !== "course");
}

function subjectsForItem(state, item) {
  const path = item.target.currentPath || item.target.observedPath;
  const target = state.outlineCatalog.targets.find((candidate) =>
    candidate.kind === item.target.kind && candidate.id === item.target.id) ||
    state.outlineCatalog.targets.find((candidate) => {
      const lesson = path.find(({ kind }) => kind === "lesson");
      return candidate.kind === "lesson" && candidate.id === lesson?.id;
    }) || state.outlineCatalog.targets[0];
  const allowed = new Set(target?.subjectIds || []);
  return state.outlineCatalog.subjects.filter(({ id }) => allowed.has(id));
}

function summaryRows(summary) {
  const groups = [
    ["Por origem", "origins", COURSE_ANCHORED_ANNOTATION_ORIGINS, summary.byOrigin],
    ["Por canal", "channels", COURSE_ANCHORED_ANNOTATION_CHANNELS, summary.byChannel],
    ["Por estado", "states", COURSE_ANCHORED_ANNOTATION_STATES, summary.byState]
  ];
  return groups.map(([title, group, values, counts]) =>
    `<div><dt>${escapeHtml(title)}</dt><dd>${values.map((value) =>
      `${escapeHtml(label(group, value))}: ${Number(counts[value] || 0)}`).join(" · ")}</dd></div>`
  ).join("");
}

function renderFilters(state) {
  const subjects = state.outlineCatalog.subjects;
  const hierarchy = targetCatalogForFilters(state);
  const selectedSubject = state.query.subjectIds[0] || "";
  const selectedHierarchy = state.query.hierarchy
    ? hierarchy.findIndex(({ kind, id }) =>
        kind === state.query.hierarchy.target.kind && id === state.query.hierarchy.target.id)
    : -1;
  return '<details class="course-observations-filters"' +
    (state.filtersOpen ? " open" : "") +
    '><summary class="course-observations-tool-trigger" aria-label="Filtros" title="Filtros">' +
    renderUiIcon("tags", "course-authoring-button-icon") + "</summary>" +
    '<form data-course-observations-filters><div class="course-observations-filter-grid">' +
    '<label><span>Origem</span><select name="origin">' +
    options(COURSE_ANCHORED_ANNOTATION_ORIGINS, "origins", state.query.origins[0]) +
    '</select></label><label><span>Canal</span><select name="channel">' +
    options(COURSE_ANCHORED_ANNOTATION_CHANNELS, "channels", state.query.channels[0]) +
    '</select></label><label><span>Estado</span><select name="state">' +
    options(COURSE_ANCHORED_ANNOTATION_STATES, "states", state.query.states[0]) +
    '</select></label><label><span>Categoria</span><select name="category">' +
    options(COURSE_ANCHORED_ANNOTATION_CATEGORIES, "categories", state.query.categories[0]) +
    '</select></label><label><span>Assunto</span><select name="subject">' +
    '<option value="">Todos</option>' + subjects.map(({ id, label: value }) =>
      `<option value="${escapeHtml(id)}"${id === selectedSubject ? " selected" : ""}>` +
      `${escapeHtml(value)}</option>`).join("") + '</select></label>' +
    '<label><span>Contexto</span><select name="hierarchy"><option value="">Todo o Curso</option>' +
    hierarchy.map(({ label: value }, index) =>
      `<option value="${index}"${index === selectedHierarchy ? " selected" : ""}>` +
      `${escapeHtml(value)}</option>`).join("") + '</select></label></div>' +
    '<label class="course-observations-filter-check"><input type="checkbox" name="uncategorized"' +
    (state.query.includeUncategorized ? " checked" : "") + '><span>Incluir sem categoria</span></label>' +
    '<label class="course-observations-filter-check"><input type="checkbox" name="descendants"' +
    (state.query.hierarchy?.includeDescendants ? " checked" : "") +
    (selectedHierarchy < 0 ? " disabled" : "") + '><span>Incluir descendentes</span></label>' +
    '<div class="course-observations-filter-actions"><button type="reset" data-observations-action="clear-filters">Limpar</button>' +
    '<button type="submit" class="course-authoring-primary">Aplicar filtros</button></div></form></details>';
}

function renderAuthorComposer(state) {
  const targets = state.outlineCatalog.targets.filter(({ kind }) => kind !== "study_unit");
  if (!targets.length) return "";
  const draft = state.createDraft;
  const disabled = state.loading ? " disabled" : "";
  return '<details class="course-observation-author-composer"' + (draft ? " open" : "") +
    '><summary class="course-observations-tool-trigger" aria-label="Nova observação"' +
    ' title="Nova observação">' + renderUiIcon("add", "course-authoring-button-icon") +
    "</summary>" +
    `<form data-observation-create-form><label><span>Contexto</span><select name="target" required${disabled}>` +
    targets.map(({ kind, label: value }, index) =>
      `<option value="${index}"${String(index) === draft?.targetIndex ? " selected" : ""}>` +
      `${escapeHtml(value)} · ${escapeHtml({
        course: "Curso",
        module: "Módulo",
        lesson: "Lição",
        topic: "Tópico",
        didactic_microsequence: "Microssequência didática"
      }[kind] || kind)}</option>`).join("") + '</select></label>' +
    `<label><span>Categoria</span><select name="category"${disabled}><option value="">Sem categoria</option>` +
    COURSE_ANCHORED_ANNOTATION_CATEGORIES.map((value) =>
      `<option value="${value}"${value === draft?.category ? " selected" : ""}>` +
      `${escapeHtml(label("categories", value))}</option>`).join("") +
    '</select></label><label><span>Texto</span><textarea name="rawText"' +
    ` aria-describedby="course-author-observation-count"${disabled}>${escapeHtml(
      draft?.rawText || ""
    )}</textarea></label>` +
    '<span id="course-author-observation-count" class="course-observation-character-count">' +
    escapeHtml(formatObservationTextBudget(draft?.rawText || "")) + "</span>" +
    '<div class="course-observation-create-actions">' +
    `<button type="submit" class="course-authoring-primary"${disabled}>Registrar</button></div>` +
    '</form></details>';
}

function renderItem(item) {
  const withdrawn = item.state === "withdrawn";
  return '<article class="course-observation-card">' +
    '<header><div class="course-observation-badges">' +
    `<span>${escapeHtml(label("origins", item.provenance.origin))}</span>` +
    `<span>${escapeHtml(label("channels", item.provenance.channel))}</span>` +
    `<span>${escapeHtml(label("states", item.state))}</span>` +
    `<span>${escapeHtml(item.category ? label("categories", item.category) : "Sem categoria")}</span>` +
    `</div><strong>${escapeHtml(item.contributor.label)}</strong></header>` +
    `<p class="course-observation-path">${escapeHtml(pathLabel(item))}</p>` +
    (item.briefSummary
      ? `<p class="course-observation-summary">${escapeHtml(item.briefSummary)}</p>`
      : "") +
    (withdrawn
      ? '<p class="course-observation-withdrawn">Conteúdo retirado.</p>'
      : `<p class="course-observation-raw">${escapeHtml(item.rawText)}</p>`) +
    `<a class="course-observation-detail-link" href="${escapeHtml(buildCourseAuthoringRoute(
      item.courseId, { section: "review", annotationId: item.annotationId }
    ))}" data-observations-action="open-detail" data-annotation-id="${escapeHtml(item.annotationId)}">` +
    'Ver detalhe<span aria-hidden="true">›</span></a></article>';
}

function renderClassification(item, catalog) {
  const effective = new Set(item.subjectClassification.effective.subjects.map(({ topicId }) => topicId));
  return '<section class="course-observation-subjects"><h3>Assunto</h3>' +
    `<p>${item.subjectClassification.status === "classified" ? "Classificado" : "Não classificado"}` +
    `${item.subjectClassification.correctedAt ? " · corrigido pela autoria" : ""}</p>` +
    (catalog.length
      ? '<form data-observation-subject-form><fieldset><legend>Corrigir assuntos</legend>' +
        catalog.map(({ id, label: value }) =>
          `<label><input type="checkbox" name="subject" value="${escapeHtml(id)}"` +
          `${effective.has(id) ? " checked" : ""}><span>${escapeHtml(value)}</span></label>`).join("") +
        '</fieldset><button type="submit"' +
        `${item.capabilities.canCorrectSubjects ? "" : " disabled"}>Salvar assuntos</button></form>`
      : '<p>Nenhum assunto candidato neste contexto.</p>') + "</section>";
}

function renderOwnerResponseSources(sourceLinks) {
  if (!sourceLinks?.length) return "";
  return '<div class="course-observation-owner-response-sources">' +
    '<strong>Fontes e Âncoras consideradas</strong><ul>' +
    sourceLinks.map((link) => `<li>${escapeHtml(link.sourceId)}` +
      (link.anchors.length ? ` · ${link.anchors.map((anchor) =>
        escapeHtml(anchor.anchorId)).join(", ")}` : "") + "</li>"
    ).join("") + "</ul></div>";
}

function renderDetail(state, item) {
  if (!item) {
    return '<section class="course-authoring-state is-error" role="alert"><h3>Observação não encontrada</h3>' +
      '<p>Ela pode ter sido retirada ou o endereço pode estar desatualizado.</p></section>';
  }
  const subjects = subjectsForItem(state, item);
  const editDraft = state.editDraft?.annotationId === item.annotationId
    ? state.editDraft
    : null;
  const editCategory = editDraft ? editDraft.category : item.category;
  const responseDraft = state.responseDraft?.annotationId === item.annotationId
    ? state.responseDraft
    : null;
  const disabled = state.loading ? " disabled" : "";
  const actionButtons = [
    ["consider", "Considerar", item.capabilities.canConsider],
    ["resolve", "Resolver", item.capabilities.canResolve],
    ["reopen", "Reabrir", item.capabilities.canReopen],
    ["withdraw", "Retirar", item.capabilities.canWithdraw]
  ].filter(([, , allowed]) => allowed).map(([action, title]) =>
    `<button type="button" data-observations-action="${action}">${escapeHtml(title)}</button>`
  ).join("");
  return '<div class="course-observation-detail">' +
    renderItem(item, true) +
    (item.target.deepLink
      ? `<a class="course-authoring-primary course-observation-target-link" href="${escapeHtml(item.target.deepLink)}"` +
        ` data-observations-action="open-target">${escapeHtml(targetLinkLabel(item.target.kind))}</a>`
      : '<p class="course-authoring-notice">O contexto original não está mais disponível.</p>') +
    (actionButtons ? `<div class="course-observation-state-actions">${actionButtons}</div>` : "") +
    (item.capabilities.canRevise
      ? '<form class="course-observation-edit-form" data-observation-edit-form><h3>Editar observação</h3>' +
        `<label><span>Categoria</span><select name="category"${disabled}><option value="">Sem categoria</option>` +
        COURSE_ANCHORED_ANNOTATION_CATEGORIES.map((value) =>
          `<option value="${value}"${editCategory === value ? " selected" : ""}>` +
          `${escapeHtml(label("categories", value))}</option>`).join("") + '</select></label>' +
        `<label><span>Texto</span><textarea name="rawText"${disabled}>${escapeHtml(
          editDraft?.rawText ?? item.rawText ?? ""
        )}</textarea></label>` +
        `<button type="submit"${disabled}>Salvar edição</button></form>`
      : "") +
    (item.capabilities.canRespond
      ? '<form class="course-observation-response-form" data-observation-response-form>' +
        `<h3>${item.ownerResponse?.kind === "reformulation" ? "Reformulação" : "Retorno da autoria"}</h3>` +
        '<p>Resposta privada vinculada a esta observação.</p>' +
        `<textarea name="ownerResponse" aria-label="Retorno da autoria"${disabled}>${escapeHtml(
          responseDraft?.ownerResponse ?? item.ownerResponse?.text ?? ""
        )}</textarea>` + renderOwnerResponseSources(
          item.ownerResponse?.consideredSourceLinks
        ) + `<button type="submit"${disabled}>Salvar retorno</button></form>`
      : item.ownerResponse
        ? '<section class="course-observation-owner-response">' +
          `<h3>${item.ownerResponse.kind === "reformulation" ? "Reformulação" : "Retorno da autoria"}</h3>` +
          `<p>${escapeHtml(item.ownerResponse.text)}</p>` +
          renderOwnerResponseSources(item.ownerResponse.consideredSourceLinks) + "</section>"
        : "") +
    renderClassification(item, subjects) + "</div>";
}

function renderObservationConfirmation(state) {
  if (!state.confirmation) return "";
  return '<div class="course-authoring-confirm-backdrop" data-observation-confirmation-backdrop>' +
    '<section class="course-authoring-confirm-dialog" data-observation-confirmation role="alertdialog"' +
    ' aria-modal="true" aria-labelledby="course-observation-confirmation-title"' +
    ' aria-describedby="course-observation-confirmation-message">' +
    '<h2 id="course-observation-confirmation-title">Retirar observação?</h2>' +
    '<p id="course-observation-confirmation-message">Ela permanecerá no histórico como retirada.</p>' +
    '<div class="course-authoring-confirm-actions">' +
    '<button type="button" class="course-authoring-secondary" data-observations-action="cancel-confirmation">' +
    `${renderUiIcon("remove-state", "course-authoring-button-icon")}<span>Cancelar</span></button>` +
    '<button type="button" class="is-danger" data-observations-action="confirm-withdraw">' +
    `${renderUiIcon("trash", "course-authoring-button-icon")}<span>Retirar</span></button>` +
    "</div></section></div>";
}

function renderPanel(state) {
  const detailMode = state.query.mode === "detail";
  const item = detailMode ? state.items[0] || null : null;
  const element = "section";
  const titleId = "course-authoring-section-title";
  const titleTag = "h2";
  return `<${element} class="course-authoring-section course-observations-panel"` +
    ` aria-labelledby="${titleId}">` +
    '<header class="course-authoring-section-heading"><div>' +
    `<${titleTag} id="${titleId}">Observações</${titleTag}></div>` +
    (detailMode
      ? `<a href="${escapeHtml(buildCourseAuthoringRoute(state.courseId, {
          section: "review"
        }))}" data-observations-action="back-inbox">Voltar à inbox</a>`
      : '<button type="button" data-observations-action="reload" aria-label="Atualizar observações"' +
        ' title="Atualizar observações">' +
        renderUiIcon("rotate", "course-authoring-button-icon") + "</button>") + "</header>" +
    (state.error ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.error)}</p>` : "") +
    (state.outlineError
      ? `<p class="course-authoring-notice is-error" role="alert">${escapeHtml(state.outlineError)}</p>`
      : "") +
    (state.message ? `<p class="course-authoring-notice" role="status">${escapeHtml(state.message)}</p>` : "") +
    (state.loading && state.items.length === 0
      ? '<p class="course-authoring-loading" role="status">Carregando observações…</p>'
      : detailMode
        ? renderDetail(state, item)
        : '<div class="course-observations-tools">' + renderAuthorComposer(state) +
          renderFilters(state) + "</div>" +
          (state.summary?.matchingTotal > 0
            ? '<dl class="course-observations-summary"><div><dt>Correspondentes</dt>' +
              `<dd>${state.summary.matchingTotal}</dd></div><div><dt>Sem assunto</dt>` +
              `<dd>${state.summary.unclassifiedTotal}</dd></div>${summaryRows(state.summary)}</dl>`
            : "") +
          `<div class="course-observations-list">${state.items.map((value) =>
            renderItem(value)).join("") ||
            '<p class="course-authoring-empty-copy">Nenhuma observação.</p>'}</div>` +
          (state.hasMore
            ? '<button type="button" class="course-observations-load-more" data-observations-action="load-more"' +
              `${state.loading ? " disabled" : ""}>Carregar mais</button>`
            : "")) + renderObservationConfirmation(state) + `</${element}>`;
}

export function createCourseObservationsPanel({
  root,
  controller,
  course,
  routeTarget = null,
  onNavigate = () => {},
  clock = () => new Date(),
  documentValue = root?.ownerDocument || globalThis.document || null
} = {}) {
  if (!root || typeof root.addEventListener !== "function" ||
      typeof controller?.loadCourseAnchoredAnnotations !== "function" ||
      typeof controller?.mutateCourseAnchoredAnnotations !== "function" ||
      typeof controller?.loadAuthoringOutline !== "function" ||
      !UUID_PATTERN.test(String(course?.courseId || "")) ||
      !Number.isSafeInteger(course?.revision) || course.revision < 1 ||
      routeTarget && routeTarget.kind !== "anchored_annotation") {
    throw new TypeError("Dependências da inbox de observações são inválidas.");
  }
  const state = {
    courseId: course.courseId,
    courseRevision: course.revision,
    query: defaultQuery(routeTarget?.id || null),
    annotationSetVersion: null,
    items: [],
    summary: null,
    hasMore: false,
    nextCursor: null,
    seenCursors: new Set(),
    outlineCatalog: emptyOutlineCatalog(),
    outlineError: "",
    loading: false,
    error: "",
    message: "",
    filtersOpen: false,
    confirmation: null,
    createDraft: null,
    editDraft: null,
    responseDraft: null,
    pendingMutation: null,
    restoreDraftFocus: "",
    destroyed: false
  };
  let epoch = 0;

  function render() {
    if (state.destroyed) return;
    const focusKind = state.restoreDraftFocus;
    state.restoreDraftFocus = "";
    root.innerHTML = renderPanel(state);
    if (focusKind) focus(DRAFT_FOCUS_SELECTORS[focusKind]);
  }

  function focus(selector) {
    root.querySelector?.(selector)?.focus?.({ preventScroll: true });
  }

  function cancelConfirmation({ restoreFocus = true } = {}) {
    const confirmation = state.confirmation;
    if (!confirmation) return false;
    state.confirmation = null;
    render();
    if (restoreFocus) focus(confirmation.returnFocusSelector);
    return true;
  }

  function requestWithdraw(item) {
    state.confirmation = {
      command: stateCommand("withdraw", item),
      returnFocusSelector: '[data-observations-action="withdraw"]'
    };
    render();
    focus('[data-observations-action="cancel-confirmation"]');
  }

  function confirmWithdraw() {
    const confirmation = state.confirmation;
    if (!confirmation || state.loading) return;
    state.confirmation = null;
    void mutate(confirmation.command, "Observação retirada.");
  }

  function handleKeyDown(event) {
    if (state.confirmation && event.key === "Tab") {
      trapAuthoringConfirmationTab({
        event,
        root,
        confirmationSelector: "[data-observation-confirmation]",
        documentValue
      });
      return;
    }
    if (event.key !== "Escape" || !cancelConfirmation()) return;
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function handleDocumentClick(event) {
    if (!state.confirmation || !event.target?.matches?.("[data-observation-confirmation-backdrop]")) return;
    cancelConfirmation();
  }

  async function loadOutlineCatalog() {
    state.outlineError = "";
    try {
      state.outlineCatalog = outlineCatalog(
        await controller.loadAuthoringOutline(state.courseId),
        state.courseId,
        state.courseRevision
      );
      return true;
    } catch (error) {
      state.outlineCatalog = emptyOutlineCatalog();
      state.outlineError = error instanceof Error
        ? error.message
        : "Não foi possível carregar os contextos e assuntos do Curso.";
      return false;
    }
  }

  async function read({ append = false, preserveCurrent = false } = {}) {
    const currentEpoch = ++epoch;
    state.loading = true;
    state.error = "";
    if (!preserveCurrent) state.message = "";
    if (!append && !preserveCurrent) {
      state.items = [];
      state.summary = null;
      state.annotationSetVersion = null;
      state.nextCursor = null;
      state.seenCursors.clear();
    }
    render();
    try {
      const options = normalizeCourseAnchoredAnnotationReadOptions({
        expectedCourseRevision: state.courseRevision,
        annotationSetVersion: append ? state.annotationSetVersion : null,
        query: state.query,
        cursor: append ? state.nextCursor : null,
        limit: PAGE_SIZE
      });
      const page = normalizeCourseAnchoredAnnotationPage(
        await controller.loadCourseAnchoredAnnotations(state.courseId, options)
      );
      if (state.destroyed || currentEpoch !== epoch) return false;
      const existingIds = new Set((append ? state.items : [])
        .map(({ annotationId }) => annotationId));
      const pageIds = new Set();
      if (page.items.some(({ annotationId }) => {
        if (pageIds.has(annotationId) || append && existingIds.has(annotationId)) return true;
        pageIds.add(annotationId);
        return false;
      })) {
        throw new Error("A paginação repetiu uma observação entre páginas.");
      }
      if (page.hasMore && page.items.length === 0) {
        throw new Error("A paginação retornou uma página intermediária vazia.");
      }
      if (append && page.hasMore && state.seenCursors.has(page.nextCursor)) {
        throw new Error("A paginação repetiu um cursor sem avançar.");
      }
      state.annotationSetVersion = page.annotationSetVersion;
      state.summary = page.summary;
      const items = new Map((append ? state.items : [])
        .map((item) => [item.annotationId, item]));
      page.items.forEach((item) => items.set(item.annotationId, item));
      state.items = [...items.values()];
      state.hasMore = page.hasMore;
      state.nextCursor = page.nextCursor;
      if (!append) state.seenCursors.clear();
      if (page.hasMore) state.seenCursors.add(page.nextCursor);
      return true;
    } catch (error) {
      if (state.destroyed || currentEpoch !== epoch) return false;
      state.error = error instanceof Error ? error.message : "Não foi possível carregar as observações.";
      return false;
    } finally {
      if (!state.destroyed && currentEpoch === epoch) {
        state.loading = false;
        render();
      }
    }
  }

  function detailItem() {
    return state.items[0] || null;
  }

  function clearDraft(kind) {
    if (kind === "create") state.createDraft = null;
    if (kind === "edit") state.editDraft = null;
    if (kind === "response") state.responseDraft = null;
  }

  async function mutate(command, successMessage, {
    operationDraft = command,
    draftKind = ""
  } = {}) {
    const normalized = normalizeCourseAnchoredAnnotationCommand(command);
    const draft = structuredClone(operationDraft);
    if (!pendingMutationMatches(state.pendingMutation, draft)) state.pendingMutation = null;
    const expectedCourseRevision = new Set([
      "create_anchored_annotation", "correct_anchored_annotation_subjects"
    ]).has(normalized.type)
      ? state.courseRevision
      : null;
    const request = state.pendingMutation?.request || {
      requestId: createUuid(),
      courseId: state.courseId,
      expectedCourseRevision,
      command: normalized
    };
    state.pendingMutation ||= {
      draft,
      request: structuredClone(request)
    };
    state.loading = true;
    state.error = "";
    state.message = "Salvando…";
    render();
    let mutationConfirmed = false;
    let confirmedChange = null;
    const reconciliationNotice = state.query.mode === "detail"
      ? "O detalhe será atualizado na próxima sincronização."
      : "A lista será atualizada na próxima sincronização.";
    try {
      const change = normalizeCourseAnchoredAnnotationChange(
        await controller.mutateCourseAnchoredAnnotations(structuredClone(request))
      );
      if (change.courseId !== state.courseId || change.requestId !== request.requestId ||
          change.annotation && change.annotation.annotationId !== normalized.annotationId) {
        throw new TypeError("A confirmação não corresponde à observação enviada.");
      }
      mutationConfirmed = true;
      confirmedChange = change;
      state.pendingMutation = null;
      clearDraft(draftKind);
      state.message = successMessage;
      const reconciled = await read({ preserveCurrent: true });
      if (!reconciled && !state.destroyed) {
        state.error = "";
        state.message = `${successMessage} ${reconciliationNotice}`;
      }
      return change;
    } catch (error) {
      if (mutationConfirmed) {
        state.pendingMutation = null;
        clearDraft(draftKind);
        state.restoreDraftFocus = "";
        state.error = "";
        state.message = `${successMessage} ${reconciliationNotice}`;
        return confirmedChange;
      }
      const ambiguous = ambiguousMutationFailure(error);
      if (!ambiguous) state.pendingMutation = null;
      state.restoreDraftFocus = draftKind;
      const detail = error instanceof Error ? error.message : "Não foi possível alterar a observação.";
      state.error = ambiguous
        ? `${detail} Tente novamente para confirmar exatamente a mesma operação.`
        : detail;
      state.message = "";
      return false;
    } finally {
      state.loading = false;
      render();
    }
  }

  function stateCommand(action, item) {
    const types = {
      consider: "consider_anchored_annotation",
      resolve: "resolve_anchored_annotation",
      reopen: "reopen_anchored_annotation",
      withdraw: "withdraw_anchored_annotation"
    };
    return normalizeCourseAnchoredAnnotationCommand({
      type: types[action],
      annotationId: item.annotationId,
      expectedAnnotationVersion: item.annotationVersion
    });
  }

  root.addEventListener("submit", (event) => {
    if (state.destroyed) return;
    if (event.target.matches?.("[data-course-observations-filters]")) {
      event.preventDefault();
      const data = new FormData(event.target);
      const hierarchy = targetCatalogForFilters(state);
      const hierarchyIndex = data.get("hierarchy") === "" ? -1 : Number(data.get("hierarchy"));
      const selectedHierarchy = hierarchy[hierarchyIndex] || null;
      state.query = normalizeCourseAnchoredAnnotationQuery({
        mode: "inbox",
        origins: data.get("origin") ? [data.get("origin")] : [],
        channels: data.get("channel") ? [data.get("channel")] : [],
        states: data.get("state") ? [data.get("state")] : [],
        categories: data.get("category") ? [data.get("category")] : [],
        includeUncategorized: data.has("uncategorized"),
        subjectIds: data.get("subject") ? [data.get("subject")] : [],
        hierarchy: selectedHierarchy ? {
          target: { kind: selectedHierarchy.kind, id: selectedHierarchy.id },
          includeDescendants: data.has("descendants")
        } : null,
        annotationId: null
      });
      state.filtersOpen = true;
      void read();
      return;
    }
    if (event.target.matches?.("[data-observation-create-form]")) {
      event.preventDefault();
      const data = new FormData(event.target);
      const rawText = String(data.get("rawText") || "");
      const targetIndex = String(data.get("target") || "0");
      const category = data.get("category") || null;
      state.createDraft = { targetIndex, rawText, category };
      const issue = validateStudyUnitObservationText(rawText);
      const target = state.outlineCatalog.targets[Number(targetIndex)] || null;
      if (issue || !target || target.kind === "study_unit") {
        state.error = issue || "Escolha um contexto válido para a observação.";
        state.restoreDraftFocus = "create";
        render();
        return;
      }
      const operationDraft = {
        type: "create_anchored_annotation",
        target: { kind: target.kind, id: target.id },
        rawText,
        category
      };
      const command = pendingMutationMatches(state.pendingMutation, operationDraft)
        ? structuredClone(state.pendingMutation.request.command)
        : {
        type: "create_anchored_annotation",
        annotationId: createUuid(),
        target: { kind: target.kind, id: target.id },
        rawText,
        category,
        capturedAt: (() => {
          const value = clock();
          return (value instanceof Date ? value : new Date(value)).toISOString();
        })(),
        briefSummary: null
      };
      void mutate(command, "Observação registrada.", {
        operationDraft,
        draftKind: "create"
      });
      return;
    }
    const item = detailItem();
    if (!item) return;
    if (event.target.matches?.("[data-observation-edit-form]")) {
      event.preventDefault();
      const data = new FormData(event.target);
      const rawText = String(data.get("rawText") || "");
      const category = data.get("category") || null;
      state.editDraft = { annotationId: item.annotationId, rawText, category };
      const issue = validateStudyUnitObservationText(rawText);
      if (issue) {
        state.error = issue;
        state.restoreDraftFocus = "edit";
        render();
        return;
      }
      const command = {
        type: "revise_anchored_annotation",
        annotationId: item.annotationId,
        expectedAnnotationVersion: item.annotationVersion,
        rawText,
        category,
        briefSummary: item.briefSummary
      };
      void mutate(
        pendingMutationMatches(state.pendingMutation, command)
          ? state.pendingMutation.request.command
          : command,
        "Observação atualizada.",
        { operationDraft: command, draftKind: "edit" }
      );
    } else if (event.target.matches?.("[data-observation-response-form]")) {
      event.preventDefault();
      const ownerResponse = String(new FormData(event.target).get("ownerResponse") || "");
      state.responseDraft = { annotationId: item.annotationId, ownerResponse };
      const issue = validateStudyUnitObservationText(ownerResponse);
      if (issue) {
        state.error = issue;
        state.restoreDraftFocus = "response";
        render();
        return;
      }
      const command = {
        type: "respond_to_anchored_annotation",
        annotationId: item.annotationId,
        expectedAnnotationVersion: item.annotationVersion,
        ownerResponse,
        responseKind: item.ownerResponse?.kind || "answer",
        consideredSourceLinks: structuredClone(
          item.ownerResponse?.consideredSourceLinks || []
        )
      };
      void mutate(
        pendingMutationMatches(state.pendingMutation, command)
          ? state.pendingMutation.request.command
          : command,
        "Retorno salvo.",
        { operationDraft: command, draftKind: "response" }
      );
    } else if (event.target.matches?.("[data-observation-subject-form]")) {
      event.preventDefault();
      const subjectIds = new FormData(event.target).getAll("subject").map(String);
      void mutate({
        type: "correct_anchored_annotation_subjects",
        annotationId: item.annotationId,
        expectedAnnotationVersion: item.annotationVersion,
        subjectIds
      }, "Assuntos corrigidos.");
    }
  });

  root.addEventListener("input", (event) => {
    const item = detailItem();
    if (event.target.matches?.('[data-observation-create-form] textarea[name="rawText"]')) {
      state.createDraft ||= { targetIndex: "0", category: null, rawText: "" };
      state.createDraft.rawText = String(event.target.value || "");
      const counter = root.querySelector?.("#course-author-observation-count");
      if (counter) {
        counter.textContent = formatObservationTextBudget(event.target.value);
        counter.classList?.toggle("is-over-limit", isObservationTextOverLimit(event.target.value));
      }
    } else if (item && event.target.matches?.('[data-observation-edit-form] textarea[name="rawText"]')) {
      state.editDraft ||= {
        annotationId: item.annotationId,
        category: item.category,
        rawText: item.rawText || ""
      };
      state.editDraft.rawText = String(event.target.value || "");
    } else if (item && event.target.matches?.(
      '[data-observation-response-form] textarea[name="ownerResponse"]'
    )) {
      state.responseDraft ||= {
        annotationId: item.annotationId,
        ownerResponse: item.ownerResponse?.text || ""
      };
      state.responseDraft.ownerResponse = String(event.target.value || "");
    }
  });

  root.addEventListener("change", (event) => {
    const item = detailItem();
    if (event.target.matches?.('[data-observation-create-form] select[name="target"]')) {
      state.createDraft ||= { targetIndex: "0", category: null, rawText: "" };
      state.createDraft.targetIndex = String(event.target.value || "0");
    } else if (event.target.matches?.('[data-observation-create-form] select[name="category"]')) {
      state.createDraft ||= { targetIndex: "0", category: null, rawText: "" };
      state.createDraft.category = event.target.value || null;
    } else if (item && event.target.matches?.('[data-observation-edit-form] select[name="category"]')) {
      state.editDraft ||= {
        annotationId: item.annotationId,
        category: item.category,
        rawText: item.rawText || ""
      };
      state.editDraft.category = event.target.value || null;
    }
  });

  root.addEventListener("click", (event) => {
    const node = event.target.closest?.("[data-observations-action]");
    if (!node || state.destroyed) return;
    const action = node.dataset.observationsAction;
    if (action === "cancel-confirmation") {
      cancelConfirmation();
    } else if (action === "confirm-withdraw") {
      confirmWithdraw();
    } else if (["open-detail", "open-target", "back-inbox"].includes(action)) {
      event.preventDefault();
      onNavigate(node.getAttribute("href"));
    } else if (action === "reload") {
      void read();
    } else if (action === "load-more" && state.hasMore && !state.loading) {
      void read({ append: true });
    } else if (action === "clear-filters") {
      event.preventDefault();
      state.query = defaultQuery();
      state.filtersOpen = true;
      void read();
    } else if (["consider", "resolve", "reopen", "withdraw"].includes(action)) {
      const item = detailItem();
      if (!item) return;
      if (action === "withdraw") {
        requestWithdraw(item);
        return;
      }
      void mutate(stateCommand(action, item), {
        consider: "Observação considerada.",
        resolve: "Observação resolvida.",
        reopen: "Observação reaberta.",
        withdraw: "Observação retirada."
      }[action]);
    }
  });

  root.addEventListener("keydown", handleKeyDown);
  documentValue?.addEventListener?.("click", handleDocumentClick);

  function hasPendingDraft() {
    const createChanged = state.createDraft && (
      state.createDraft.targetIndex !== "0" || state.createDraft.category !== null ||
      state.createDraft.rawText !== ""
    );
    const editedItem = state.editDraft
      ? state.items.find(({ annotationId }) => annotationId === state.editDraft.annotationId)
      : null;
    const editChanged = state.editDraft && (!editedItem ||
      state.editDraft.category !== editedItem.category ||
      state.editDraft.rawText !== (editedItem.rawText || ""));
    const respondedItem = state.responseDraft
      ? state.items.find(({ annotationId }) => annotationId === state.responseDraft.annotationId)
      : null;
    const responseChanged = state.responseDraft && (!respondedItem ||
      state.responseDraft.ownerResponse !== (respondedItem.ownerResponse?.text || ""));
    return Boolean(
      state.pendingMutation || state.confirmation || createChanged || editChanged || responseChanged
    );
  }

  return Object.freeze({
    async open() {
      await loadOutlineCatalog();
      return read();
    },
    hasPendingDraft,
    async refresh(nextCourseRevision = state.courseRevision) {
      const revision = Number(nextCourseRevision);
      if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new TypeError("A revisão do Curso para atualizar as observações é inválida.");
      }
      if (revision !== state.courseRevision) {
        state.courseRevision = revision;
        await loadOutlineCatalog();
      }
      return read();
    },
    destroy() {
      state.destroyed = true;
      ++epoch;
      documentValue?.removeEventListener?.("click", handleDocumentClick);
      root.removeEventListener?.("keydown", handleKeyDown);
      root.innerHTML = "";
    }
  });
}
