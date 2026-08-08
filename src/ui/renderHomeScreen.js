import { readLessonProgressEntry } from "../storage/progressStore.js";
import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";
import { renderUiIcon } from "./renderUiIcons.js";
import {
  groupTrailItems,
  isStudyableTrailItem,
  normalizeHomeTrailSnapshot,
  preserveSelectedTrailItem,
  shouldOfferTrailRemoval,
  trailItemDeleteMode,
  trailItemCourseKey
} from "./homeTrailProjection.js";

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

function cardsOfMicrosequence(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

function countLessons(course) {
  return (course.modules || []).reduce((total, moduleValue) => total + (moduleValue.lessons || []).length, 0);
}

function countCardsInLesson(lesson) {
  return (lesson.microsequences || []).reduce((total, microsequence) => {
    if (!isRunnableMicrosequence(microsequence)) {
      return total;
    }
    return total + cardsOfMicrosequence(microsequence).length;
  }, 0);
}

function countCardsInCourse(course) {
  return (course.modules || []).reduce(
    (total, moduleValue) =>
      total +
      (moduleValue.lessons || []).reduce(
        (lessonTotal, lesson) => lessonTotal + countCardsInLesson(lesson),
        0
      ),
    0
  );
}

function countCompletedCardsInCourse(course, progress) {
  return (course.modules || []).reduce((total, moduleValue) => {
    return (
      total +
      (moduleValue.lessons || []).reduce((lessonTotal, lesson) => {
        const entry = readLessonProgressEntry(progress, {
          courseKey: entityId(course),
          moduleKey: entityId(moduleValue),
          lessonKey: entityId(lesson)
        });
        const completed = entry && Array.isArray(entry.completedCardKeys) ? entry.completedCardKeys.length : 0;
        return lessonTotal + completed;
      }, 0)
    );
  }, 0);
}

function formatCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeIconTitle(label) {
  const value = String(label || "").trim();
  const match = value.match(/^[^:]+:\s*(.+)$/);
  return match ? match[1].trim() : value;
}

function renderMetaMetric(iconName, value, label) {
  return (
    '<span class="progress-meta-item" aria-label="' +
    escapeHtml(label) +
    '" title="' +
    escapeHtml(summarizeIconTitle(label)) +
    '">' +
    renderUiIcon(iconName, "progress-meta-item-icon") +
    '<span class="progress-meta-item-value">' +
    escapeHtml(value) +
    "</span></span>"
  );
}

function renderHomeCourseMeta(course) {
  const structuralMetrics = [
    ["module", course.moduleCount, "módulo", "módulos"],
    ["lesson", course.lessonCount, "lição", "lições"],
    ["microsequence", course.microsequenceCount, "microssequência", "microssequências"],
    ["card", course.totalCount, "card", "cards"]
  ].filter(([, count]) => Number(count) > 0);
  const metrics = course.kind === "plan"
    ? structuralMetrics
    : [
        ["progress", `${course.completedCount}/${course.totalCount}`, null, null],
        ...structuralMetrics.slice(0, 2)
      ];
  if (!metrics.length) return "";
  return (
    '<p class="muted tiny progress-meta">' +
    metrics.map(([iconName, value, singular, plural]) => renderMetaMetric(
      iconName,
      String(value),
      iconName === "progress"
        ? `Progresso: ${value}`
        : formatCount(Number(value), singular, plural)
    )).join('<span class="progress-meta-separator" aria-hidden="true">·</span>') +
    "</p>"
  );
}

function buildHomeCoursePreviews(
  project,
  progress,
  trailSnapshot = null,
  progressTrailItemId = "",
  loadedTrailItemIds = [],
  courseKeyByTrailItemId = {}
) {
  const courses = Array.isArray(project?.courses) ? project.courses : [];
  const loadedWorkspaceItems = new Set(loadedTrailItemIds);
  if (!Array.isArray(trailSnapshot?.items)) return [];
  return trailSnapshot.items.filter((item) =>
    isStudyableTrailItem(item) || (item.kind === "plan" && item.workspaceId)
  ).map((item) => {
      const identity = String(courseKeyByTrailItemId?.[item.itemId] || trailItemCourseKey(item));
      const canUseProjectCourse = !item.workspaceId || loadedWorkspaceItems.has(item.itemId);
      const course = canUseProjectCourse
        ? courses.find((candidate) => [
            identity,
            item.courseId,
            item.courseKey
          ].filter(Boolean).includes(entityId(candidate))) || null
        : null;
      const completedCount = course && item.itemId === progressTrailItemId
        ? countCompletedCardsInCourse(course, progress)
        : item.completedCardCount;
      const totalCount = course ? countCardsInCourse(course) : item.cardCount;
      return {
        id: course ? entityId(course) : identity,
        trailItemId: item.itemId,
        courseId: String(item.courseId || ""),
        selectionId: String(item.selectionId || ""),
        workspaceId: String(item.workspaceId || ""),
        title: course?.title || item.title || "Curso",
        description: course?.goal || item.description || "",
        moduleCount: item.moduleCount || (course?.modules || []).length,
        lessonCount: item.lessonCount || (course ? countLessons(course) : 0),
        completedCount,
        totalCount,
        permissions: {
          role: item.canEdit ? "owner" : "learner",
          canEdit: item.canEdit,
          canDelete: item.canDelete,
          canRemove: item.canRemove,
          canAuthorContent: item.canEdit,
          canDeleteCourse: item.canDelete,
          writeTarget: item.origin === "catalog" ? "catalog" : "private"
        },
        origin: item.origin,
        kind: item.kind,
        loaded: Boolean(course),
        progressPercent: totalCount
          ? Math.max(0, Math.min(100, (completedCount / totalCount) * 100))
          : 0
      };
  });
}

function renderCoursesTopbar() {
  return (
    '<header class="topbar home-topbar navigation-topbar">' +
    '<div class="topbar-space"></div>' +
    '<h1 class="topbar-title">' +
    '<span class="brand-title">' +
    '<img class="brand-mark" src="assets/brand/aralearn-mark-monochrome.svg" alt="" aria-hidden="true">' +
    '<span class="brand-text">AraLearn</span>' +
    "</span>" +
    "</h1>" +
    '<div class="lesson-top-actions">' +
    '<button class="icon-ghost" type="button" data-action="open-central" title="Abrir painel" aria-label="Abrir painel">' +
    renderUiIcon("cloud", "home-tab-icon") +
    "</button>" +
    "</div>" +
    "</header>"
  );
}

function renderCourseOrigin(course) {
  const plan = course.kind === "plan";
  const catalog = course.origin === "catalog";
  const kind = plan ? "plan" : catalog ? "catalog" : "private";
  const label = plan ? "Planejamento" : catalog ? "Curso de Coleções" : "Curso privado";
  return (
    '<span class="home-course-origin is-' + kind +
    '" title="' + label + '" aria-label="' + label + '">' +
    renderUiIcon(plan ? "edit" : catalog ? "folder" : "key", "home-course-origin-icon") +
    "</span>"
  );
}

function renderCourseUtilities(course, { canOrganize = false } = {}) {
  const resetProgress = course.kind === "plan"
    ? ""
    : '<button class="icon-ghost" type="button" data-action="reset-course-progress-direct" data-course-key="' +
      escapeHtml(course.id) + '" data-trail-item-id="' + escapeHtml(course.trailItemId) +
      '" title="Zerar progresso do curso" aria-label="Zerar progresso do curso">' +
      renderUiIcon("rotate", "home-tab-icon") + "</button>";
  const edit = course.permissions.canEdit
    ? '<button class="icon-ghost" type="button" data-action="edit-course" data-course-key="' +
      escapeHtml(course.id) + '" data-trail-item-id="' + escapeHtml(course.trailItemId) +
      '" title="Editar curso" aria-label="Editar curso">' +
      renderUiIcon("edit", "home-tab-icon") + "</button>"
    : "";
  const removeFromTrails = shouldOfferTrailRemoval({
    origin: course.origin,
    canRemove: course.permissions.canRemove,
    canDelete: course.permissions.canDelete
  })
    ? '<button class="icon-ghost" type="button" data-action="remove-home-trail-item" data-trail-item-id="' +
      escapeHtml(course.trailItemId) +
      '" title="Retirar de Trilhas" aria-label="Retirar de Trilhas">' +
      renderUiIcon("remove-state", "home-tab-icon") + "</button>"
    : "";
  const moveToGroup = canOrganize
    ? '<button class="icon-ghost" type="button" data-action="choose-home-item-group" data-trail-item-id="' +
      escapeHtml(course.trailItemId) +
      '" title="Mudar grupo" aria-label="Mudar grupo">' +
      renderUiIcon("trail", "home-tab-icon") + "</button>"
    : "";
  const deleteMode = trailItemDeleteMode({
    origin: course.origin,
    kind: course.kind,
    canDelete: course.permissions.canDelete,
    courseId: course.courseId,
    selectionId: course.selectionId,
    workspaceId: course.workspaceId
  });
  const deleteLabel = course.kind === "plan" ? "Excluir plano" : "Excluir curso privado";
  const remove = deleteMode && deleteMode !== "catalog"
    ? '<button class="icon-ghost is-danger" type="button" data-action="delete-course-direct" data-course-key="' +
      escapeHtml(course.id) + '" data-trail-item-id="' + escapeHtml(course.trailItemId) +
      '" title="' + deleteLabel + '" aria-label="' + deleteLabel + '">' +
      renderUiIcon("trash", "home-tab-icon") + "</button>"
    : "";
  const openWorkspace = course.workspaceId
    ? '<button class="icon-ghost" type="button" data-action="open-home-workspace" data-workspace-id="' +
      escapeHtml(course.workspaceId) + '" title="Abrir detalhes da autoria" aria-label="Abrir detalhes da autoria">' +
      renderUiIcon("prompt", "home-tab-icon") + "</button>"
    : "";
  return (
    '<details class="home-course-context-menu">' +
    '<summary class="icon-ghost" title="Ações do curso" aria-label="Ações do curso">' +
    renderUiIcon("more", "home-tab-icon") + "</summary>" +
    '<div class="home-course-context-actions">' +
    resetProgress + openWorkspace + edit + moveToGroup + removeFromTrails + remove +
    "</div></details>"
  );
}

function inlineCourseTargetMatches(editorSupport, course) {
  const target = editorSupport?.inlineStructureEditor;
  return target?.level === "course" && String(target.courseKey || "") === String(course?.id || "");
}

function renderHomeEditableField({
  tag,
  value,
  field,
  label,
  className = "",
  editing = false,
  multiline = false
}) {
  const normalized = value || "";
  const classes = [className, "structure-edit-field-shell", normalized ? "" : "is-empty"]
    .filter(Boolean)
    .join(" ");
  return (
    '<' + tag + ' class="' + classes + '">' +
    '<span class="structure-edit-field-base' + (editing ? " is-concealed" : "") + '"' +
    (editing ? ' aria-hidden="true"' : "") + '>' + escapeHtml(normalized) + "</span>" +
    (editing
      ? '<span class="structure-edit-field-overlay" contenteditable="plaintext-only" role="textbox"' +
        (multiline ? ' aria-multiline="true"' : "") + ' data-field="' + escapeHtml(field) +
        '"' + (field === "inline-entity-title" ? ' data-card-authoring-focus="inline-structure-title"' : "") +
        ' aria-label="' + escapeHtml(label) + '" spellcheck="true">' + escapeHtml(normalized) + "</span>"
      : "") +
    "</" + tag + ">"
  );
}

function renderCourseGroupChooser(course, groups, currentGroupId, organization) {
  if (organization?.movingItemId !== course.trailItemId) return "";
  return (
    '<form class="home-course-group-form" data-home-item-move-form="' + escapeHtml(course.trailItemId) + '">' +
    '<label class="sr-only" for="home-course-group-target">Grupo</label>' +
    '<select id="home-course-group-target" name="groupId" aria-label="Grupo do curso">' +
    groups.map((group) => {
      const value = group.id === "others" ? "__others__" : group.id;
      return '<option value="' + escapeHtml(value) + '"' +
        (group.id === currentGroupId ? " selected" : "") + '>' + escapeHtml(group.title) + "</option>";
    }).join("") +
    "</select>" +
    '<div class="home-trails-inline-actions">' +
    renderIconButton({ action: "cancel-home-item-move", icon: "remove-state", label: "Cancelar" }) +
    renderIconButton({ action: "save-home-item-group", icon: "save", label: "Salvar grupo", className: "open-main" }) +
    "</div></form>"
  );
}

function reviewItemsForCourse(reviewItems, courseKey, trailItemId) {
  if (!Array.isArray(reviewItems)) return [];
  return reviewItems.flatMap((item) => {
    const entityPath = Array.isArray(item?.entityPath) ? item.entityPath : [];
    if (
      entityPath.length !== 5
      || entityPath.some((id) => typeof id !== "string" || !id)
      || entityPath[0] !== courseKey
      || (item?.trailItemId && item.trailItemId !== trailItemId)
    ) return [];
    return [{
      entityPath,
      title: typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : "Card para rever",
      context: typeof item.context === "string" ? item.context.trim() : "",
      trailItemId: item?.trailItemId || trailItemId
    }];
  });
}

function renderCourseReviewMenu(reviewItems) {
  if (!reviewItems.length) return "";
  return (
    '<details class="learning-spaces-context-menu home-course-review-menu">' +
    '<summary class="learning-spaces-context-menu-summary" title="Cards para rever" aria-label="Cards para rever">' +
    renderUiIcon("review", "home-tab-icon") + "</summary>" +
    '<div class="learning-spaces-context-menu-list home-course-review-list" aria-label="Cards marcados para rever">' +
    reviewItems.map((item) => {
      const [courseKey, moduleKey, lessonKey, microsequenceKey, cardKey] = item.entityPath;
      const accessibleLabel = `Abrir card para rever: ${item.title}${item.context ? ` — ${item.context}` : ""}`;
      return (
        '<button class="learning-spaces-context-menu-item" type="button" data-action="open-review-card"' +
        ' data-trail-item-id="' + escapeHtml(item.trailItemId) + '"' +
        ' data-course-key="' + escapeHtml(courseKey) + '"' +
        ' data-module-key="' + escapeHtml(moduleKey) + '"' +
        ' data-lesson-key="' + escapeHtml(lessonKey) + '"' +
        ' data-microsequence-key="' + escapeHtml(microsequenceKey) + '"' +
        ' data-card-key="' + escapeHtml(cardKey) + '"' +
        ' title="' + escapeHtml(accessibleLabel) + '" aria-label="' + escapeHtml(accessibleLabel) + '">' +
        renderUiIcon("review", "home-tab-icon") +
        '<span>' + escapeHtml(item.title) + "</span></button>"
      );
    }).join("") +
    "</div></details>"
  );
}

function renderCoursePreview(course, reviewItems = [], {
  groups = [],
  currentGroupId = "others",
  organization = {},
  canOrganize = false,
  editorSupport = {}
} = {}) {
  const plan = course.kind === "plan";
  const editing = inlineCourseTargetMatches(editorSupport, course);
  return (
    '<article class="home-course-selector-preview' + (editing ? " is-editing" : "") + '" data-course-key="' +
    escapeHtml(course.id) +
    '" data-trail-item-id="' + escapeHtml(course.trailItemId) + '"' +
    (editing
      ? ' data-inline-structure-editor="true" data-structure-level="course"'
      : "") + '>' +
    '<div class="home-course-selector-heading">' + renderCourseOrigin(course) +
    renderHomeEditableField({
      tag: "h2",
      value: course.title || "Curso",
      field: "inline-entity-title",
      label: "Título do curso",
      editing
    }) + "</div>" +
    (course.description || editing
      ? renderHomeEditableField({
          tag: "p",
          value: course.description,
          field: "inline-entity-description",
          label: "Descrição do curso",
          className: "card-subtitle",
          editing,
          multiline: true
        })
      : "") +
    renderHomeCourseMeta(course) +
    renderCourseGroupChooser(course, groups, currentGroupId, organization) +
    (editing
      ? ""
      : '<div class="home-course-selector-actions">' + renderCourseReviewMenu(reviewItems) +
        renderCourseUtilities(course, { canOrganize: canOrganize && groups.length > 1 }) +
        '<button class="open-main" type="button" data-action="open-course" data-course-key="' +
        escapeHtml(course.id) +
        '" data-trail-item-id="' + escapeHtml(course.trailItemId) +
        '" data-trail-kind="' + escapeHtml(course.kind) + '" data-can-edit="' +
        (course.permissions.canEdit ? "true" : "false") + '" title="' +
        (plan ? "Abrir planejamento" : "Abrir curso") + '" aria-label="' +
        (plan ? "Abrir planejamento" : "Abrir curso") + '">' +
        renderUiIcon(plan ? "edit" : "play", "home-tab-icon") +
        "</button></div>") +
    "</article>"
  );
}

function buildCourseGroups(courses, trailSnapshot) {
  const byItemId = new Map(courses.map((course) => [course.trailItemId, course]));
  return groupTrailItems(trailSnapshot, { includePlans: true }).map((group) => ({
    id: group.id,
    title: group.title,
    courses: group.items.map((item) => byItemId.get(item.itemId)).filter(Boolean)
  }));
}

function renderCourseOptions(group, selectedTrailItemId) {
  if (!group?.courses?.length) return '<option value="">Sem cursos neste grupo</option>';
  return group.courses.map((course) => (
    '<option value="' + escapeHtml(course.trailItemId) + '"' +
    (course.trailItemId === selectedTrailItemId ? " selected" : "") + '>' +
    escapeHtml(course.title || "Curso") + "</option>"
  )).join("");
}

function renderIconButton({ action, icon, label, className = "icon-ghost", data = {} }) {
  const attributes = Object.entries(data).map(([key, value]) =>
    ` data-${key}="${escapeHtml(value)}"`
  ).join("");
  return '<button class="' + className + '" type="button" data-action="' + action + '"' +
    attributes + ' title="' + escapeHtml(label) + '" aria-label="' + escapeHtml(label) + '">' +
    renderUiIcon(icon, "home-tab-icon") + "</button>";
}

function renderGroupForm(group = null) {
  return (
    '<form class="home-trails-inline-form home-group-inline-form" data-home-group-form="' + (group ? "rename" : "create") + '"' +
    (group ? ' data-group-id="' + escapeHtml(group.id) + '"' : "") + '>' +
    '<input name="title" required maxlength="120" value="' + escapeHtml(group?.title || "") +
    '" placeholder="Nome do grupo" aria-label="' + (group ? "Novo nome do grupo" : "Nome do novo grupo") +
    '" data-card-authoring-focus="home-group-title">' +
    '<div class="home-trails-inline-actions">' +
    renderIconButton({ action: "cancel-home-group-form", icon: "remove-state", label: "Cancelar" }) +
    renderIconButton({ action: "save-home-group", icon: "save", label: "Salvar", className: "open-main" }) +
    "</div></form>"
  );
}

function renderGroupActions(group, canOrganize) {
  if (!canOrganize) return "";
  const structural = !group || group.id === "others" ||
    String(group.title || "").localeCompare("Outros", "pt-BR", { sensitivity: "base" }) === 0;
  const actions = [renderIconButton({
    action: "start-home-group-create",
    icon: "add",
    label: "Criar grupo"
  })];
  if (!structural) {
    actions.push(renderIconButton({
      action: "edit-home-group",
      icon: "edit",
      label: "Renomear grupo",
      data: { "group-id": group.id }
    }));
    actions.push(renderIconButton({
      action: "delete-home-group",
      icon: "trash",
      label: "Excluir grupo",
      className: "icon-ghost is-danger",
      data: { "group-id": group.id }
    }));
  }
  return (
    '<details class="home-course-context-menu home-group-context-menu">' +
    '<summary class="icon-ghost" title="Ações do grupo" aria-label="Ações do grupo">' +
    renderUiIcon("more", "home-tab-icon") + "</summary>" +
    '<div class="home-course-context-actions">' + actions.join("") + "</div></details>"
  );
}

function renderHomeSelectToolbar(groups, selectedGroup, selectedTrailItemId, organization, canOrganize) {
  const editingGroup = groups.find((group) => group.id === organization?.editingGroupId) || null;
  const groupControl = organization?.creatingGroup
    ? renderGroupForm()
    : editingGroup
      ? renderGroupForm(editingGroup)
      : '<div class="home-group-select-row">' +
        '<label class="sr-only" for="home-group-select">Grupo</label>' +
        '<select id="home-group-select" data-field="home-group-select" aria-label="Selecionar grupo">' +
        groups.map((group) => '<option value="' + escapeHtml(group.id) + '"' +
          (group.id === selectedGroup?.id ? " selected" : "") + '>' + escapeHtml(group.title) + "</option>").join("") +
        "</select>" + renderGroupActions(selectedGroup, canOrganize) + "</div>";
  return (
    '<div class="home-library-controls">' +
    groupControl +
    '<div class="home-course-select-row">' +
    '<label class="sr-only" for="home-course-select">Curso</label>' +
    '<select id="home-course-select" data-field="home-course-select" aria-label="Selecionar curso"' +
    (!selectedGroup?.courses?.length ? " disabled" : "") + '>' +
    renderCourseOptions(selectedGroup, selectedTrailItemId) + "</select></div></div>"
  );
}

function renderCoursesPane({ project, progress, editorSupport }) {
  const hasRemoteSnapshot = editorSupport.trailSnapshot && Array.isArray(editorSupport.trailSnapshot.items);
  const snapshot = hasRemoteSnapshot ? normalizeHomeTrailSnapshot(editorSupport.trailSnapshot) : null;
  const selectedTrailItemId = preserveSelectedTrailItem(
    snapshot,
    editorSupport.selectedHomeTrailItemId
  );
  const courses = buildHomeCoursePreviews(
    project,
    progress,
    snapshot,
    selectedTrailItemId,
    editorSupport.loadedHomeTrailItemIds,
    editorSupport.courseKeyByHomeTrailItemId
  );
  if (!snapshot) {
    const message = editorSupport.homeOrganization?.error ||
      (editorSupport.trailLoading ? "Atualizando Trilhas…" : "Não foi possível carregar Trilhas.");
    return '<article class="home-course-selector-empty"><p class="empty-state-copy"' +
      (editorSupport.homeOrganization?.error ? ' role="alert"' : "") + '>' +
      escapeHtml(message) +
      "</p></article>";
  }
  const groups = buildCourseGroups(courses, snapshot);
  const courseGroup = groups.find((group) =>
    group.courses.some((course) => course.trailItemId === selectedTrailItemId)
  );
  const requestedGroupId = String(editorSupport.homeOrganization?.selectedGroupId || "");
  const selectedGroup = groups.find((group) => group.id === requestedGroupId) || courseGroup || groups[0];
  const selected = selectedGroup?.courses.find((course) => course.trailItemId === selectedTrailItemId) ||
    selectedGroup?.courses[0] || null;
  const reviewItems = selected
    ? reviewItemsForCourse(editorSupport.reviewItems, selected.id, selected.trailItemId)
    : [];
  return (
    '<section class="home-course-selector-card"' +
    (editorSupport.homeOrganization?.busy ? ' aria-busy="true" inert' : "") + '>' +
    renderHomeSelectToolbar(
      groups,
      selectedGroup,
      selected?.trailItemId || "",
      editorSupport.homeOrganization,
      Boolean(snapshot?.capabilities?.organize)
    ) +
    (snapshot?.stale
      ? '<p class="muted tiny home-trails-stale" role="status">Neste dispositivo</p>'
      : "") +
    (editorSupport.homeOrganization?.error
      ? '<p class="home-trails-error" role="alert">' +
        escapeHtml(editorSupport.homeOrganization.error) + "</p>"
      : "") +
    (selected
      ? renderCoursePreview(selected, reviewItems, {
          groups,
          currentGroupId: selectedGroup?.id || "others",
          organization: editorSupport.homeOrganization,
          canOrganize: Boolean(snapshot?.capabilities?.organize),
          editorSupport
        })
      : '<p class="empty-state-copy home-group-empty">Sem cursos neste grupo.</p>') +
    "</section>"
  );
}

function renderHomeCourseEditDock(editorSupport) {
  const target = editorSupport?.inlineStructureEditor;
  if (target?.level !== "course" || !target.courseKey) return "";
  const disabled = editorSupport.entitySaving ? ' disabled aria-disabled="true"' : "";
  return (
    '<nav class="study-reader-footer structure-edit-dock home-course-edit-dock" aria-label="Edição do curso">' +
    '<div class="study-action-dock"><div class="study-action-stack">' +
    (editorSupport.entityMutationError
      ? '<p class="card-assistance-message" role="status">' + escapeHtml(editorSupport.entityMutationError) + "</p>"
      : "") +
    '<div class="study-next-wrap structure-edit-dock-actions">' +
    '<button class="icon-ghost" type="button" data-action="close-inline-structure-entity" title="Cancelar edição" aria-label="Cancelar edição"' +
    disabled + '>' + renderUiIcon("remove-state", "home-tab-icon") + "</button>" +
    '<button class="open-main" type="button" data-action="save-inline-entity" data-structure-level="course" data-course-key="' +
    escapeHtml(target.courseKey) + '" title="Salvar" aria-label="Salvar"' + disabled + '>' +
    renderUiIcon("ready-state", "home-tab-icon") + "</button>" +
    "</div></div></div></nav>"
  );
}

export function renderHomeScreen({ project, progress, editorSupport = {} }) {
  return (
    '<section class="screen">' +
    renderCoursesTopbar() +
    '<main class="screen-content courses-home-screen navigation-screen">' +
    '<section class="courses-home-list">' +
    renderCoursesPane({ project, progress, editorSupport }) +
    "</section>" +
    "</main>" +
    renderHomeCourseEditDock(editorSupport) +
    "</section>"
  );
}
