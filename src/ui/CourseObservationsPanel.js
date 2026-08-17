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
import { normalizeCourseAuthoringOutline } from "./courseAuthoringViewModel.js";
import { renderUiIcon } from "./renderUiIcons.js";
import {
  formatObservationTextBudget,
  isObservationTextOverLimit,
  validateStudyUnitObservationText
} from "./renderStudyUnitObservationSheet.js";

const PAGE_SIZE = 12;
const LABELS = Object.freeze({
  origins: Object.freeze({
    author: "Autoria",
    learner: "Estudante",
    human_audit: "Auditoria humana",
    automatic_audit: "Auditoria automática",
    unknown_legacy: "Origem legada"
  }),
  channels: Object.freeze({
    authoring_interface: "Interface de autoria",
    authoring_chat: "Assistência de autoria",
    study_interface: "Interface de estudo",
    audit_interface: "Interface de auditoria",
    audit_automation: "Automação de auditoria",
    unknown_legacy: "Canal legado"
  }),
  states: Object.freeze({
    open: "Aberta", considered: "Considerada", resolved: "Resolvida", withdrawn: "Retirada"
  }),
  categories: Object.freeze({
    question: "Dúvida", possible_error: "Possível erro", confusing: "Trecho confuso",
    suggestion: "Sugestão"
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
  return Object.freeze({ targets: Object.freeze([]), subjects: Object.freeze([]) });
}

function outlineCatalog(value, courseId, revision) {
  const normalized = normalizeCourseAuthoringOutline(value, {
    expectedCourseId: courseId,
    expectedRevision: revision
  });
  const targets = [{
    kind: "course",
    id: courseId,
    label: normalized.course.title,
    path: [{ kind: "course", id: courseId }],
    subjectIds: []
  }];
  const subjects = [];
  const raw = value.outline;
  for (const moduleValue of raw.modules) {
    const moduleTarget = {
      kind: "module",
      id: moduleValue.id,
      label: moduleValue.title,
      path: [{ kind: "course", id: courseId }, { kind: "module", id: moduleValue.id }],
      subjectIds: []
    };
    targets.push(moduleTarget);
    for (const lesson of moduleValue.lessons) {
      const lessonTarget = {
        kind: "lesson",
        id: lesson.id,
        label: `${moduleValue.title} › ${lesson.title}`,
        path: [...moduleTarget.path, { kind: "lesson", id: lesson.id }],
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
          label: `${moduleValue.title} › ${lesson.title} › ${topic.title}`,
          path: [...lessonTarget.path, { kind: "topic", id: topic.id }],
          subjectIds: [topic.id]
        });
      }
      for (const microsequence of lesson.microsequences) {
        targets.push({
          kind: "didactic_microsequence",
          id: microsequence.id,
          label: `${moduleValue.title} › ${lesson.title} › ${microsequence.title}`,
          path: [
            ...lessonTarget.path,
            { kind: "didactic_microsequence", id: microsequence.id }
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
    (state.filtersOpen ? " open" : "") + '><summary>Filtros e origens</summary>' +
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
  return '<details class="course-observation-author-composer"><summary>Nova observação autoral</summary>' +
    '<form data-observation-create-form><label><span>Contexto</span><select name="target" required>' +
    targets.map(({ kind, label: value }, index) =>
      `<option value="${index}">${escapeHtml(value)} · ${escapeHtml({
        course: "Curso",
        module: "Módulo",
        lesson: "Lição",
        topic: "Tópico",
        didactic_microsequence: "Microssequência didática"
      }[kind] || kind)}</option>`).join("") + '</select></label>' +
    '<label><span>Categoria</span><select name="category"><option value="">Sem categoria</option>' +
    COURSE_ANCHORED_ANNOTATION_CATEGORIES.map((value) =>
      `<option value="${value}">${escapeHtml(label("categories", value))}</option>`).join("") +
    '</select></label><label><span>Texto</span><textarea name="rawText"' +
    ' aria-describedby="course-author-observation-count"></textarea></label>' +
    '<span id="course-author-observation-count" class="course-observation-character-count">' +
    escapeHtml(formatObservationTextBudget("")) + "</span>" +
    '<button type="submit" class="course-authoring-primary">Adicionar observação</button>' +
    '</form></details>';
}

function renderItem(item, selected = false) {
  const withdrawn = item.state === "withdrawn";
  return `<article class="course-observation-card${selected ? " is-selected" : ""}">` +
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
      item.courseId, { section: "observations", annotationId: item.annotationId }
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

function renderDetail(state, item) {
  if (!item) {
    return '<section class="course-authoring-state is-error" role="alert"><h3>Observação não encontrada</h3>' +
      '<p>Ela pode ter sido retirada ou o endereço pode estar desatualizado.</p></section>';
  }
  const subjects = subjectsForItem(state, item);
  const actionButtons = [
    ["consider", "Considerar", item.capabilities.canConsider],
    ["resolve", "Resolver", item.capabilities.canResolve],
    ["reopen", "Reabrir", item.capabilities.canReopen],
    ["withdraw", "Retirar", item.capabilities.canWithdraw]
  ].filter(([, , allowed]) => allowed).map(([action, title]) =>
    `<button type="button" data-observations-action="${action}">${escapeHtml(title)}</button>`
  ).join("");
  return '<div class="course-observation-detail">' + renderItem(item, true) +
    (item.target.deepLink
      ? `<a class="course-authoring-primary course-observation-target-link" href="${escapeHtml(item.target.deepLink)}"` +
        ` data-observations-action="open-target">${escapeHtml(targetLinkLabel(item.target.kind))}</a>`
      : '<p class="course-authoring-notice">O contexto original não está mais disponível.</p>') +
    (actionButtons ? `<div class="course-observation-state-actions">${actionButtons}</div>` : "") +
    (item.capabilities.canRevise
      ? '<form class="course-observation-edit-form" data-observation-edit-form><h3>Editar observação</h3>' +
        '<label><span>Categoria</span><select name="category"><option value="">Sem categoria</option>' +
        COURSE_ANCHORED_ANNOTATION_CATEGORIES.map((value) =>
          `<option value="${value}"${item.category === value ? " selected" : ""}>` +
          `${escapeHtml(label("categories", value))}</option>`).join("") + '</select></label>' +
        `<label><span>Texto</span><textarea name="rawText">${escapeHtml(item.rawText || "")}</textarea></label>` +
        '<button type="submit">Salvar edição</button></form>'
      : "") +
    (item.capabilities.canRespond
      ? '<form class="course-observation-response-form" data-observation-response-form>' +
        '<h3>Retorno da autoria</h3><p>Resposta privada vinculada a esta observação.</p>' +
        `<textarea name="ownerResponse" aria-label="Retorno da autoria">${escapeHtml(
          item.ownerResponse?.text || ""
        )}</textarea><button type="submit">Salvar retorno</button></form>`
      : item.ownerResponse
        ? '<section class="course-observation-owner-response"><h3>Retorno da autoria</h3>' +
          `<p>${escapeHtml(item.ownerResponse.text)}</p></section>`
        : "") +
    renderClassification(item, subjects) + "</div>";
}

function renderPanel(state) {
  const detailMode = state.query.mode === "detail";
  const item = detailMode ? state.items[0] || null : null;
  return '<section class="course-authoring-section course-observations-panel"' +
    ' aria-labelledby="course-authoring-section-title">' +
    '<header class="course-authoring-section-heading"><div>' +
    '<h2 id="course-authoring-section-title">Observações</h2>' +
    `<p>${detailMode ? "Detalhe contextual" : "Inbox única do Curso"}</p></div>` +
    (detailMode
      ? `<a href="${escapeHtml(buildCourseAuthoringRoute(state.courseId, {
          section: "observations"
        }))}" data-observations-action="back-inbox">Voltar à inbox</a>`
      : '<button type="button" data-observations-action="reload" aria-label="Atualizar observações">' +
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
        : renderAuthorComposer(state) + renderFilters(state) +
          (state.summary
            ? '<dl class="course-observations-summary"><div><dt>Correspondentes</dt>' +
              `<dd>${state.summary.matchingTotal}</dd></div><div><dt>Sem assunto</dt>` +
              `<dd>${state.summary.unclassifiedTotal}</dd></div>${summaryRows(state.summary)}</dl>`
            : "") +
          `<div class="course-observations-list">${state.items.map((value) => renderItem(value)).join("") ||
            '<p class="course-authoring-empty-copy">Nenhuma observação corresponde aos filtros.</p>'}</div>` +
          (state.hasMore
            ? '<button type="button" class="course-observations-load-more" data-observations-action="load-more"' +
              `${state.loading ? " disabled" : ""}>Carregar mais</button>`
            : "")) + "</section>";
}

export function createCourseObservationsPanel({
  root,
  controller,
  course,
  routeTarget = null,
  onNavigate = () => {},
  clock = () => new Date(),
  confirmValue = globalThis.confirm?.bind(globalThis) || (() => false)
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
    destroyed: false
  };
  let epoch = 0;

  function render() {
    if (!state.destroyed) root.innerHTML = renderPanel(state);
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

  async function read({ append = false } = {}) {
    const currentEpoch = ++epoch;
    state.loading = true;
    state.error = "";
    if (!append) {
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
      const existingIds = new Set(state.items.map(({ annotationId }) => annotationId));
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
      if (page.hasMore && state.seenCursors.has(page.nextCursor)) {
        throw new Error("A paginação repetiu um cursor sem avançar.");
      }
      state.annotationSetVersion = page.annotationSetVersion;
      state.summary = page.summary;
      const items = new Map(state.items.map((item) => [item.annotationId, item]));
      page.items.forEach((item) => items.set(item.annotationId, item));
      state.items = [...items.values()];
      state.hasMore = page.hasMore;
      state.nextCursor = page.nextCursor;
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

  async function mutate(command, successMessage) {
    const normalized = normalizeCourseAnchoredAnnotationCommand(command);
    const expectedCourseRevision = new Set([
      "create_anchored_annotation", "correct_anchored_annotation_subjects"
    ]).has(normalized.type)
      ? state.courseRevision
      : null;
    state.loading = true;
    state.error = "";
    state.message = "Salvando…";
    render();
    try {
      const requestId = createUuid();
      const change = normalizeCourseAnchoredAnnotationChange(
        await controller.mutateCourseAnchoredAnnotations({
          requestId,
          courseId: state.courseId,
          expectedCourseRevision,
          command: normalized
        })
      );
      if (change.courseId !== state.courseId || change.requestId !== requestId ||
          change.annotation && change.annotation.annotationId !== normalized.annotationId) {
        throw new TypeError("A confirmação não corresponde à observação enviada.");
      }
      state.message = successMessage;
      await read();
      return true;
    } catch (error) {
      state.error = error instanceof Error ? error.message : "Não foi possível alterar a observação.";
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
      const issue = validateStudyUnitObservationText(rawText);
      const target = state.outlineCatalog.targets[Number(data.get("target"))] || null;
      if (issue || !target || target.kind === "study_unit") {
        state.error = issue || "Escolha um contexto válido para a observação.";
        render();
        return;
      }
      void mutate({
        type: "create_anchored_annotation",
        annotationId: createUuid(),
        target: { kind: target.kind, id: target.id },
        rawText,
        category: data.get("category") || null,
        capturedAt: (() => {
          const value = clock();
          return (value instanceof Date ? value : new Date(value)).toISOString();
        })(),
        briefSummary: null
      }, "Observação adicionada.");
      return;
    }
    const item = detailItem();
    if (!item) return;
    if (event.target.matches?.("[data-observation-edit-form]")) {
      event.preventDefault();
      const data = new FormData(event.target);
      const rawText = String(data.get("rawText") || "");
      const issue = validateStudyUnitObservationText(rawText);
      if (issue) {
        state.error = issue;
        render();
        return;
      }
      void mutate({
        type: "revise_anchored_annotation",
        annotationId: item.annotationId,
        expectedAnnotationVersion: item.annotationVersion,
        rawText,
        category: data.get("category") || null,
        briefSummary: item.briefSummary
      }, "Observação atualizada.");
    } else if (event.target.matches?.("[data-observation-response-form]")) {
      event.preventDefault();
      const ownerResponse = String(new FormData(event.target).get("ownerResponse") || "");
      const issue = validateStudyUnitObservationText(ownerResponse);
      if (issue) {
        state.error = issue;
        render();
        return;
      }
      void mutate({
        type: "respond_to_anchored_annotation",
        annotationId: item.annotationId,
        expectedAnnotationVersion: item.annotationVersion,
        ownerResponse
      }, "Retorno salvo.");
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
    if (!event.target.matches?.('[data-observation-create-form] textarea[name="rawText"]')) return;
    const counter = root.querySelector?.("#course-author-observation-count");
    if (counter) {
      counter.textContent = formatObservationTextBudget(event.target.value);
      counter.classList?.toggle("is-over-limit", isObservationTextOverLimit(event.target.value));
    }
  });

  root.addEventListener("click", (event) => {
    const node = event.target.closest?.("[data-observations-action]");
    if (!node || state.destroyed) return;
    const action = node.dataset.observationsAction;
    if (["open-detail", "open-target", "back-inbox"].includes(action)) {
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
      if (!item || action === "withdraw" && !confirmValue("Retirar esta observação?")) return;
      void mutate(stateCommand(action, item), {
        consider: "Observação considerada.",
        resolve: "Observação resolvida.",
        reopen: "Observação reaberta.",
        withdraw: "Observação retirada."
      }[action]);
    }
  });

  return Object.freeze({
    async open() {
      await loadOutlineCatalog();
      return read();
    },
    refresh: () => read(),
    destroy() {
      state.destroyed = true;
      ++epoch;
      root.innerHTML = "";
    }
  });
}
