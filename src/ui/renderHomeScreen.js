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
        title: item.title || course?.title || "Curso",
        description: item.description || course?.goal || "",
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

function renderCourseUtilities(course) {
  const resetProgress = course.kind === "plan"
    ? ""
    : '<button class="icon-ghost" type="button" data-action="reset-course-progress-direct" data-course-key="' +
      escapeHtml(course.id) + '" title="Zerar progresso do curso" aria-label="Zerar progresso do curso">' +
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
  const deleteMode = trailItemDeleteMode({
    origin: course.origin,
    kind: course.kind,
    canDelete: course.permissions.canDelete,
    courseId: course.courseId,
    selectionId: course.selectionId,
    workspaceId: course.workspaceId
  });
  const remove = deleteMode
    ? '<button class="icon-ghost is-danger" type="button" data-action="delete-course-direct" data-course-key="' +
      escapeHtml(course.id) + '" data-trail-item-id="' + escapeHtml(course.trailItemId) +
      '" title="' + (deleteMode === "catalog" ? "Retirar de Coleções" : "Excluir curso") +
      '" aria-label="' + (deleteMode === "catalog" ? "Retirar de Coleções" : "Excluir curso") + '">' +
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
    resetProgress + openWorkspace + edit + removeFromTrails + remove +
    "</div></details>"
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
    '<div class="learning-spaces-context-menu-list home-course-review-list" role="menu" aria-label="Cards marcados para rever">' +
    reviewItems.map((item) => {
      const [courseKey, moduleKey, lessonKey, microsequenceKey, cardKey] = item.entityPath;
      const accessibleLabel = `Abrir card para rever: ${item.title}${item.context ? ` — ${item.context}` : ""}`;
      return (
        '<button class="learning-spaces-context-menu-item" type="button" role="menuitem" data-action="open-review-card"' +
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

function renderCoursePreview(course, reviewItems = []) {
  const plan = course.kind === "plan";
  return (
    '<article class="home-course-selector-preview" data-course-key="' +
    escapeHtml(course.id) +
    '" data-trail-item-id="' + escapeHtml(course.trailItemId) + '">' +
    '<div class="home-course-selector-heading">' + renderCourseOrigin(course) +
    '<h2>' + escapeHtml(course.title || "Curso") + "</h2></div>" +
    (course.description ? '<p class="card-subtitle">' + escapeHtml(course.description) + "</p>" : "") +
    renderHomeCourseMeta(course) +
    '<div class="home-course-selector-actions">' + renderCourseReviewMenu(reviewItems) +
    renderCourseUtilities(course) +
    '<button class="open-main" type="button" data-action="open-course" data-course-key="' +
    escapeHtml(course.id) +
    '" data-trail-item-id="' + escapeHtml(course.trailItemId) +
    '" data-trail-kind="' + escapeHtml(course.kind) + '" data-can-edit="' +
    (course.permissions.canEdit ? "true" : "false") + '" title="' +
    (plan ? "Abrir planejamento" : "Abrir curso") + '" aria-label="' +
    (plan ? "Abrir planejamento" : "Abrir curso") + '">' +
    renderUiIcon(plan ? "edit" : "play", "home-tab-icon") +
    "</button>" +
    "</div>" +
    "</article>"
  );
}

function buildCourseGroups(courses, trailSnapshot) {
  const byItemId = new Map(courses.map((course) => [course.trailItemId, course]));
  return groupTrailItems(trailSnapshot, { includePlans: true }).map((group) => ({
    id: group.id,
    title: group.title,
    courses: group.items.map((item) => byItemId.get(item.itemId)).filter(Boolean)
  })).filter((group) => group.courses.length);
}

function renderCourseOptions(groups, selectedTrailItemId) {
  return groups.map((group) => (
    '<optgroup label="' + escapeHtml(group.title) + '">' +
    group.courses.map((course) => (
      '<option value="' + escapeHtml(course.trailItemId) + '"' +
      (course.trailItemId === selectedTrailItemId ? " selected" : "") + '>' +
      escapeHtml(course.title || "Curso") + "</option>"
    )).join("") + "</optgroup>"
  )).join("");
}

function renderHomeSelectToolbar(groups, selectedTrailItemId, canOrganize) {
  return (
    '<div class="home-course-select-row">' +
    '<label class="sr-only" for="home-course-select">Curso</label>' +
    '<select id="home-course-select" data-field="home-course-select" aria-label="Selecionar curso">' +
    renderCourseOptions(groups, selectedTrailItemId) + "</select>" +
    (canOrganize
      ? '<button class="icon-ghost" type="button" data-action="toggle-home-organize" title="Organizar Trilhas" aria-label="Organizar Trilhas">' +
        renderUiIcon("trail", "home-tab-icon") + "</button>"
      : "") +
    "</div>"
  );
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
    '<form class="home-trails-inline-form" data-home-group-form="' + (group ? "rename" : "create") + '"' +
    (group ? ' data-group-id="' + escapeHtml(group.id) + '"' : "") + '>' +
    '<input name="title" required maxlength="120" value="' + escapeHtml(group?.title || "") +
    '" placeholder="Nome do grupo" aria-label="' + (group ? "Novo nome do grupo" : "Nome do novo grupo") + '">' +
    '<div class="home-trails-inline-actions">' +
    renderIconButton({ action: "cancel-home-group-form", icon: "remove-state", label: "Cancelar" }) +
    renderIconButton({ action: "save-home-group", icon: "save", label: "Salvar", className: "open-main" }) +
    "</div></form>"
  );
}

function renderHomeTrailItem(item, group, index, groups, organization) {
  const studyable = isStudyableTrailItem(item);
  const originIcon = item.kind === "plan" ? "edit" : item.origin === "catalog" ? "folder" : "key";
  const originKind = item.kind === "plan" ? "plan" : item.origin === "catalog" ? "catalog" : "private";
  const groupData = { "trail-item-id": item.itemId };
  const actions = [];
  if (item.workspaceId) {
    actions.push(renderIconButton({
      action: "open-home-workspace", icon: "prompt", label: "Abrir detalhes da autoria",
      data: { "workspace-id": item.workspaceId }
    }));
  }
  if (group.id !== "others") {
    actions.push(renderIconButton({
      action: "move-home-item-up", icon: "arrow-up", label: "Mover para cima",
      data: { ...groupData, "group-id": group.id }
    }));
    actions.push(renderIconButton({
      action: "move-home-item-down", icon: "arrow-down", label: "Mover para baixo",
      data: { ...groupData, "group-id": group.id }
    }));
  }
  if (groups.some((candidate) => candidate.id !== "others")) {
    actions.push(renderIconButton({
      action: "choose-home-item-group", icon: "trail", label: "Mover para outro grupo",
      data: groupData
    }));
  }
  if (group.id !== "others") {
    actions.push(renderIconButton({
      action: "detach-home-item", icon: "remove-state", label: "Retirar do grupo",
      data: groupData
    }));
  }
  const deleteMode = trailItemDeleteMode(item);
  if (deleteMode) {
    actions.push(renderIconButton({
      action: "delete-home-trail-item", icon: "trash",
      label: deleteMode === "catalog"
        ? "Retirar de Coleções"
        : item.kind === "plan" ? "Excluir plano" : "Excluir curso",
      className: "icon-ghost is-danger", data: groupData
    }));
  }
  if (shouldOfferTrailRemoval(item)) {
    actions.unshift(renderIconButton({
      action: "remove-home-trail-item", icon: "remove-state", label: "Retirar de Trilhas",
      data: groupData
    }));
  }
  const chooser = organization.movingItemId === item.itemId
    ? '<form class="home-trails-inline-form home-trails-move-form" data-home-item-move-form="' + escapeHtml(item.itemId) + '">' +
      '<select name="groupId" aria-label="Novo grupo">' +
      '<option value="__others__">Outros</option>' +
      groups.filter((candidate) => candidate.id !== "others").map((candidate) =>
        '<option value="' + escapeHtml(candidate.id) + '"' + (candidate.id === group.id ? " selected" : "") + '>' +
        escapeHtml(candidate.title) + "</option>"
      ).join("") + "</select>" +
      '<div class="home-trails-inline-actions">' +
      renderIconButton({ action: "cancel-home-item-move", icon: "remove-state", label: "Cancelar" }) +
      renderIconButton({ action: "save-home-item-group", icon: "save", label: "Mover", className: "open-main" }) +
      "</div></form>"
    : "";
  return (
    '<article class="home-trails-organizer-item" data-trail-item-id="' + escapeHtml(item.itemId) + '">' +
    '<span class="home-course-origin is-' + originKind +
    '" title="' + escapeHtml(item.kind === "plan" ? "Planejamento" : item.origin === "catalog" ? "Curso de Coleções" : "Curso privado") + '">' +
    renderUiIcon(originIcon, "home-course-origin-icon") + "</span>" +
    '<span class="home-trails-organizer-item-title">' + escapeHtml(item.title) + "</span>" +
    (studyable ? renderIconButton({
      action: "open-course", icon: "play", label: "Abrir curso", className: "open-main",
      data: { "trail-item-id": item.itemId, "course-key": trailItemCourseKey(item) }
    }) : item.workspaceId ? renderIconButton({
      action: "open-course", icon: "edit", label: "Abrir planejamento", className: "open-main",
      data: {
        "trail-item-id": item.itemId,
        "course-key": trailItemCourseKey(item),
        "trail-kind": "plan",
        "can-edit": item.canEdit ? "true" : "false"
      }
    }) : "") +
    '<details class="home-course-context-menu"><summary class="icon-ghost" title="Ações" aria-label="Ações">' +
    renderUiIcon("more", "home-tab-icon") + '</summary><div class="home-course-context-actions">' +
    actions.join("") + "</div></details>" + chooser +
    '<span class="sr-only">Posição ' + escapeHtml(index + 1) + "</span>" +
    "</article>"
  );
}

function renderOrganizerGroup(group, index, groups, organization) {
  const structural = group.id === "others";
  const groupActions = structural ? "" : [
    renderIconButton({ action: "move-home-group-up", icon: "arrow-up", label: "Mover grupo para cima", data: { "group-id": group.id } }),
    renderIconButton({ action: "move-home-group-down", icon: "arrow-down", label: "Mover grupo para baixo", data: { "group-id": group.id } }),
    renderIconButton({ action: "edit-home-group", icon: "edit", label: "Renomear grupo", data: { "group-id": group.id } }),
    renderIconButton({ action: "delete-home-group", icon: "trash", label: "Excluir grupo", className: "icon-ghost is-danger", data: { "group-id": group.id } })
  ].join("");
  return (
    '<section class="home-trails-organizer-group" data-group-id="' + escapeHtml(group.id) + '">' +
    '<header class="home-trails-organizer-group-heading"><h2>' + escapeHtml(group.title) +
    '</h2><span class="home-trails-group-count">' + group.items.length + "</span>" +
    (groupActions ? '<details class="home-course-context-menu"><summary class="icon-ghost" title="Ações do grupo" aria-label="Ações do grupo">' +
      renderUiIcon("more", "home-tab-icon") + '</summary><div class="home-course-context-actions">' + groupActions + "</div></details>" : "") +
    "</header>" +
    (organization.editingGroupId === group.id ? renderGroupForm(group) : "") +
    '<div class="home-trails-organizer-list">' +
    (group.items.length
      ? group.items.map((item, itemIndex) => renderHomeTrailItem(item, group, itemIndex, groups, organization)).join("")
      : '<p class="empty-state-copy">Sem itens.</p>') +
    "</div>" + '<span class="sr-only">Grupo ' + escapeHtml(index + 1) + "</span></section>"
  );
}

function renderHomeOrganizer(snapshot, organization = {}) {
  const groups = groupTrailItems(snapshot, { includePlans: true });
  return (
    '<section class="home-trails-organizer" aria-label="Organizar Trilhas"' + (organization.busy ? ' aria-busy="true"' : "") + '>' +
    '<header class="home-trails-organizer-toolbar"><h2>Trilhas</h2><div>' +
    renderIconButton({ action: "start-home-group-create", icon: "add", label: "Criar grupo" }) +
    renderIconButton({ action: "finish-home-organize", icon: "remove-state", label: "Concluir organização" }) +
    "</div></header>" +
    (organization.creatingGroup ? renderGroupForm() : "") +
    (organization.error ? '<p class="home-trails-error" role="alert">' + escapeHtml(organization.error) + "</p>" : "") +
    groups.map((group, index) => renderOrganizerGroup(group, index, groups, organization)).join("") +
    "</section>"
  );
}

function renderCoursesPane({ project, progress, editorSupport }) {
  const hasRemoteSnapshot = editorSupport.trailSnapshot && Array.isArray(editorSupport.trailSnapshot.items);
  const snapshot = hasRemoteSnapshot ? normalizeHomeTrailSnapshot(editorSupport.trailSnapshot) : null;
  if (
    editorSupport.homeOrganization?.active &&
    snapshot?.capabilities?.organize
  ) {
    return renderHomeOrganizer(snapshot, editorSupport.homeOrganization);
  }
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
  if (!courses.length) {
    return '<article class="home-course-selector-empty"><p class="empty-state-copy">' +
      (editorSupport.trailLoading ? "Atualizando Trilhas…" : "Nenhum curso materializado em Trilhas.") +
      "</p></article>";
  }
  const groups = buildCourseGroups(courses, snapshot);
  const selected = courses.find((course) => course.trailItemId === selectedTrailItemId) || courses[0];
  const reviewItems = reviewItemsForCourse(
    editorSupport.reviewItems,
    selected.id,
    selected.trailItemId
  );
  return (
    '<section class="home-course-selector-card">' +
    renderHomeSelectToolbar(groups, selected.trailItemId, Boolean(snapshot?.capabilities?.organize)) +
    (snapshot?.stale
      ? '<p class="muted tiny home-trails-stale" role="status">Neste dispositivo</p>'
      : "") +
    (editorSupport.homeOrganization?.error
      ? '<p class="home-trails-error" role="alert">' +
        escapeHtml(editorSupport.homeOrganization.error) + "</p>"
      : "") +
    renderCoursePreview(selected, reviewItems) +
    "</section>"
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
    "</main></section>"
  );
}
