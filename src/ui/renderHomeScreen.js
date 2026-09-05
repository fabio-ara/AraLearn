import { readLessonProgressEntry } from "../storage/progressStore.js";
import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";
import { renderUiIcon } from "./renderUiIcons.js";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function entityId(entity) {
  return typeof entity?.id === "string" ? entity.id : "";
}

function countLessons(course) {
  return (course.modules || []).reduce(
    (total, moduleValue) => total + (moduleValue.lessons || []).length,
    0
  );
}

function countStudyUnitsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) =>
    isRunnableMicrosequence(microsequence)
      ? total + (microsequence.studyUnits || []).length
      : total, 0);
}

function countStudyUnits(course) {
  return (course.modules || []).reduce((courseTotal, moduleValue) =>
    courseTotal + (moduleValue.lessons || []).reduce(
      (moduleTotal, lesson) => moduleTotal + countStudyUnitsInLesson(lesson),
      0
    ), 0);
}

function countCompletedStudyUnits(course, progress) {
  return (course.modules || []).reduce((courseTotal, moduleValue) =>
    courseTotal + (moduleValue.lessons || []).reduce((moduleTotal, lesson) => {
      const entry = readLessonProgressEntry(progress, {
        courseId: entityId(course),
        moduleId: entityId(moduleValue),
        lessonId: entityId(lesson)
      });
      return moduleTotal + (entry?.completedStudyUnitIds?.length || 0);
    }, 0), 0);
}

function metric(icon, value, label) {
  return (
    '<span class="progress-meta-item" aria-label="' + escapeHtml(label) +
    '" title="' + escapeHtml(label) + '">' +
    renderUiIcon(icon, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' + escapeHtml(value) + "</span></span>"
  );
}

function coursePresentation(course, progress, permissions = {}) {
  const hasLoadedComposition = (course.modules || []).length > 0;
  const total = hasLoadedComposition
    ? countStudyUnits(course)
    : Number(permissions.studyUnitCount || 0);
  const completed = hasLoadedComposition
    ? countCompletedStudyUnits(course, progress)
    : Number(permissions.completedStudyUnitCount || 0);
  const moduleCount = hasLoadedComposition
    ? (course.modules || []).length
    : Number(permissions.moduleCount || 0);
  const lessonCount = hasLoadedComposition
    ? countLessons(course)
    : Number(permissions.lessonCount || 0);
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  const owned = permissions.ownership === "owned";
  return {
    course,
    title: String(course.title || "Curso").trim() || "Curso",
    goal: String(course.goal || "").trim(),
    total,
    completed,
    moduleCount,
    lessonCount,
    percentage,
    owned,
    publicCourse: permissions.ownership === "public",
    ownershipLabel: owned ? "Curso próprio" : permissions.ownership === "public" ? "Curso público" : "Curso compartilhado",
    availableOffline: permissions.availableOffline === true
  };
}

function optionLabels(presentations) {
  const counts = new Map();
  for (const item of presentations) {
    const key = item.title.toLocaleLowerCase("pt-BR");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const occurrences = new Map();
  return presentations.map((item) => {
    const key = item.title.toLocaleLowerCase("pt-BR");
    const occurrence = (occurrences.get(key) || 0) + 1;
    occurrences.set(key, occurrence);
    const suffix = counts.get(key) > 1 ? ` · opção ${occurrence}` : "";
    return {
      visible: `${item.title}${suffix}`,
      accessible: `${item.title}, ${item.ownershipLabel}` +
        (suffix ? `, opção ${occurrence}` : "")
    };
  });
}

function renderCoursePreview({
  presentation,
  runtimeStatus,
  loading = false,
  error = ""
}) {
  const {
    course,
    title,
    goal,
    total,
    completed,
    moduleCount,
    lessonCount,
    percentage,
    owned,
    publicCourse,
    ownershipLabel,
    availableOffline
  } = presentation;
  const action = "Abrir";
  const offline = runtimeStatus?.offline === true;
  const unavailableOffline = offline && !availableOffline;
  const buttonCopy = loading ? "Abrindo…" : error ? "Tentar novamente" : action;
  const accessibleAction = `${buttonCopy} ${title}`;
  const lifecycleAction = owned
    ? {
        action: "delete-owned-course",
        label: "Excluir este curso",
      }
    : publicCourse ? { action: "clear-local-course", label: "Remover deste dispositivo" } : {
        action: "leave-shared-course",
        label: "Sair deste curso",
      };
  return (
    '<article class="progress-card home-course-selector-preview" data-course-id="' +
    escapeHtml(entityId(course)) + '">' +
    '<div class="card-progress-fill" style="width:' + String(percentage) +
    '%" role="progressbar" aria-label="Progresso de ' + escapeHtml(title) +
    '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
    String(percentage) + '"></div>' +
    '<div class="home-course-preview-copy">' +
    '<div class="home-course-title-row"><p class="home-course-ownership" aria-label="' +
    escapeHtml(ownershipLabel) + '">' +
    renderUiIcon(owned ? "key" : publicCourse ? "study" : "account-add", "home-course-origin-icon") +
    '<span class="visually-hidden">' + escapeHtml(ownershipLabel) + "</span></p>" +
    '<h2 class="card-title">' + escapeHtml(title) + "</h2></div>" +
    (goal ? '<p class="card-subtitle">' + escapeHtml(goal) + "</p>" : "") +
    '<p class="muted tiny progress-meta">' +
    metric("progress", `${completed}/${total}`, `Progresso: ${completed} de ${total}`) +
    '<span class="progress-meta-separator" aria-hidden="true">·</span>' +
    metric("module", String(moduleCount), "Módulos") +
    '<span class="progress-meta-separator" aria-hidden="true">·</span>' +
    metric("lesson", String(lessonCount), "Lições") +
    '</p></div>' +
    '<div class="home-course-preview-actions">' +
    '<button class="icon-ghost home-course-lifecycle-trigger" type="button"' +
    ' data-action="course-lifecycle-menu" data-course-id="' + escapeHtml(entityId(course)) +
    '" popovertarget="home-course-actions-menu" popovertargetaction="toggle"' +
    ' title="Ações deste curso" aria-label="Ações deste curso" aria-haspopup="menu">' +
    renderUiIcon("more", "home-tab-icon") + '</button>' +
    '<div class="home-course-lifecycle-menu" id="home-course-actions-menu" popover="auto" role="menu"' +
    ' aria-label="Ações deste curso">' +
    (completed > 0
      ? '<button type="button" role="menuitem" data-action="reset-course-progress" data-course-id="' +
        escapeHtml(entityId(course)) + '" popovertarget="home-course-actions-menu"' +
        ' popovertargetaction="hide" autofocus>' + renderUiIcon("rotate", "home-tab-icon") +
        '<span>Zerar progresso</span></button>'
      : "") +
    '<button class="is-danger" type="button" role="menuitem" data-action="' +
    lifecycleAction.action + '" data-course-id="' + escapeHtml(entityId(course)) + '"' +
    ' popovertarget="home-course-actions-menu" popovertargetaction="hide"' +
    (completed > 0 ? "" : " autofocus") + (loading ? ' disabled aria-disabled="true"' : '') + '>' +
    renderUiIcon(owned ? "trash" : "sign-out", "home-tab-icon") + '<span>' +
    escapeHtml(lifecycleAction.label) + '</span></button></div>' +
    '<button class="home-course-entry" type="button" data-action="open-course" data-course-id="' +
    escapeHtml(entityId(course)) + '" title="' + escapeHtml(accessibleAction) +
    '" aria-label="' + escapeHtml(accessibleAction) + '"' +
    (loading || unavailableOffline ? ' disabled aria-disabled="true"' : "") + ">" +
    renderUiIcon(loading ? "rotate" : "play", "home-tab-icon") + "</button></div>" +
    (loading
      ? '<p class="home-course-loading" role="status">Preparando este curso…</p>'
      : "") + "</article>"
  );
}

function validReviewItem(item) {
  return Array.isArray(item?.entityPath) && item.entityPath.length === 5 &&
    item.entityPath.every((value) => typeof value === "string" && value.length > 0);
}

function renderReviewQueue(
  reviewItems,
  hasMore = false,
  selectedCourseId = "",
  open = false
) {
  const items = (Array.isArray(reviewItems) ? reviewItems : [])
    .filter(validReviewItem)
    .filter((item) => item.entityPath[0] === selectedCourseId);
  if (!items.length && !hasMore) return "";
  return (
    '<details class="study-review-queue clean-card"' + (open ? " open" : "") + '>' +
    '<summary><span>' + renderUiIcon("review", "home-tab-icon") +
    '</span><strong>Rever</strong><span class="muted tiny">' +
    escapeHtml(items.length ? String(items.length) : "mais") + "</span></summary>" +
    '<div class="study-review-list">' + (items.length
      ? items.map((item) => {
      const [courseId, moduleId, lessonId, microsequenceId, studyUnitId] = item.entityPath;
      const title = String(item.title || "Unidade marcada");
      return (
        '<article class="study-review-item"><button class="study-review-open" type="button" data-action="open-review-item"' +
        ' data-course-id="' + escapeHtml(courseId) + '" data-module-id="' + escapeHtml(moduleId) +
        '" data-lesson-id="' + escapeHtml(lessonId) + '" data-microsequence-id="' +
        escapeHtml(microsequenceId) + '" data-study-unit-id="' + escapeHtml(studyUnitId) +
        '" aria-label="Abrir para rever: ' + escapeHtml(title) + '">' +
        renderUiIcon("review", "home-tab-icon") + '<span><strong>' + escapeHtml(title) +
        "</strong>" + (item.context ? '<small>' + escapeHtml(item.context) + "</small>" : "") +
        "</span></button>" +
        '<button class="icon-ghost study-review-remove" type="button" data-action="remove-review-item"' +
        ' data-course-id="' + escapeHtml(courseId) + '" data-module-id="' + escapeHtml(moduleId) +
        '" data-lesson-id="' + escapeHtml(lessonId) + '" data-microsequence-id="' +
        escapeHtml(microsequenceId) + '" data-study-unit-id="' + escapeHtml(studyUnitId) +
        '" title="Retirar de Rever" aria-label="Retirar de Rever: ' + escapeHtml(title) + '">' +
        renderUiIcon("remove-state", "home-tab-icon") + "</button></article>"
      );
    }).join("")
      : '<p class="muted tiny study-review-empty">Nenhuma unidade de estudo marcada neste curso.</p>') +
    (hasMore
      ? '<button class="open-mini study-review-more" type="button" data-action="load-more-review-items">' +
        renderUiIcon("add", "home-tab-icon") + "<span>Mostrar mais</span></button>"
      : "") + "</div></details>"
  );
}

export function renderRuntimeStatusControl(status = {}, {
  popoverId = "study-runtime-status-popover"
} = {}) {
  const offline = status.offline === true;
  const stale = status.stale === true;
  const pending = status.pending === true;
  const localOnly = status.localOnly === true || status.visitor === true;
  const state = localOnly ? "local" : offline ? "offline" : stale ? "stale" : pending ? "pending" : "synced";
  const label = localOnly ? "Neste dispositivo" : offline
    ? "Sem conexão"
    : stale
      ? "Sincronizando curso"
      : pending
        ? "Sincronização pendente"
        : "Sincronizado";
  const message = localOnly ? "Seu progresso e suas marcações ficam neste dispositivo enquanto você estuda como visitante." : offline
    ? status.availableOffline === false
      ? "Sem conexão. Conecte-se para abrir este curso."
      : pending
        ? "Sem conexão. Suas alterações aguardam sincronização."
        : "Sem conexão. A cópia deste dispositivo continua disponível."
    : stale
      ? pending
        ? "Versão salva em uso. Suas alterações aguardam sincronização."
        : "Versão salva em uso enquanto o AraLearn atualiza este curso."
      : pending
        ? "Suas alterações aguardam sincronização."
        : "Sincronizado com a nuvem.";
  return '<button class="icon-ghost study-runtime-status-control" type="button"' +
    ' data-runtime-state="' + state + '" popovertarget="' + escapeHtml(popoverId) + '"' +
    ' popovertargetaction="toggle" title="' + label + '" aria-label="' + label + '">' +
    renderUiIcon(localOnly || offline ? "offline" : "cloud", "home-tab-icon") + '</button>' +
    '<div class="study-runtime-status-popover" id="' + escapeHtml(popoverId) + '" popover="auto"' +
    ' role="status"><p>' + escapeHtml(message) + '</p></div>';
}

function renderTopbar(runtimeStatus) {
  return (
    '<header class="topbar home-topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title"><span class="brand-title">' +
    '<img class="brand-mark" src="assets/brand/aralearn-mark-monochrome.svg" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span></span></h1>' +
    '<div class="lesson-top-actions">' + renderRuntimeStatusControl(runtimeStatus) +
    '<button class="icon-ghost" type="button" data-action="open-settings"' +
    ' title="Conta e aparência" aria-label="Conta e aparência">' +
    renderUiIcon("more", "home-tab-icon") + "</button></div></header>"
  );
}

export function renderHomeScreen({
  project,
  progress,
  reviewItems = [],
  reviewHasMore = false,
  reviewQueueOpen = false,
  runtimeStatus = {},
  selectedCourseId = null,
  homeLoadingCourseId = "",
  homeError = "",
  homeNotice = "",
  reviewUndo = null,
  visitor = false,
  editorSupport = {}
}) {
  const courses = Array.isArray(project?.courses) ? project.courses : [];
  const presentations = courses.map((course) => coursePresentation(
    course,
    progress,
    editorSupport.coursePermissionsById?.[course.id] || {}
  ));
  const selected = presentations.find((item) => entityId(item.course) === selectedCourseId) ||
    presentations[0] || null;
  const labels = optionLabels(presentations);
  const selectedId = selected ? entityId(selected.course) : "";
  const loading = Boolean(selectedId && homeLoadingCourseId === selectedId);
  const topbarRuntimeStatus = selected
    ? { ...runtimeStatus, availableOffline: selected.availableOffline }
    : runtimeStatus;
  if (visitor) topbarRuntimeStatus.localOnly = true;
  const selectMarkup = selected
    ? '<section class="clean-card home-course-selector-card" aria-labelledby="home-course-selector-label">' +
      '<label id="home-course-selector-label" class="home-course-selector-label" for="home-course-select">' +
      renderUiIcon("study", "home-tab-icon") + '<span>Curso</span></label>' +
      '<select id="home-course-select" data-field="home-course-select" aria-label="Selecionar curso"' +
      (loading ? " disabled" : "") + ">" + presentations.map((item, index) =>
        '<option value="' + escapeHtml(entityId(item.course)) + '"' +
        ' aria-label="' + escapeHtml(labels[index].accessible) + '"' +
        (entityId(item.course) === selectedId ? " selected" : "") + ">" +
        escapeHtml(labels[index].visible) + "</option>").join("") + "</select>" +
      '<p class="visually-hidden" role="status" aria-live="polite">Curso selecionado: ' +
      escapeHtml(selected.title) + ".</p>" +
      renderCoursePreview({
        presentation: selected,
        runtimeStatus,
        loading,
        error: homeError
      }) + "</section>"
    : '<section class="clean-card home-course-selector-empty"><h2 class="card-title">' + (visitor ? "Cursos públicos" : "Seus cursos") + '</h2>' +
      '<p class="empty-state-copy">' + (visitor ? "Nenhum curso público está disponível para estudo." : "Nenhum curso está disponível para estudo nesta conta.") + '</p></section>';
  return (
    '<section class="screen">' + renderTopbar(topbarRuntimeStatus) +
    '<main class="screen-content courses-home-screen navigation-screen">' +
    '<nav class="home-product-switch" aria-label="Área principal">' +
    '<button class="is-active" type="button" aria-current="page" title="Estudo">' +
    renderUiIcon("study", "home-tab-icon") + '<span>Estudo</span></button>' +
    '<button type="button" data-action="' + (visitor ? "request-auth" : "open-authoring") + '" title="' + (visitor ? "Entrar para autoria" : "Abrir Autoria") + '">' +
    renderUiIcon("edit", "home-tab-icon") + '<span>Autoria</span></button></nav>' +
    '<div class="study-home-feedback-layer">' +
    (homeNotice ? '<div class="study-home-feedback is-notice" role="status"><span>' +
      escapeHtml(homeNotice) + "</span>" + (reviewUndo
        ? '<button class="open-mini" type="button" data-action="undo-review-removal">Desfazer</button>'
        : "") + "</div>" : "") +
    (homeError ? '<p class="study-home-feedback is-error" role="alert">' +
      escapeHtml(homeError) + "</p>" : "") +
    "</div>" +
    selectMarkup +
    renderReviewQueue(reviewItems, reviewHasMore, selectedId, reviewQueueOpen) +
    "</main></section>"
  );
}
