import { LearningSpaces } from "../supabase/LearningSpaces.js";
import {
  courseRemovalWasCommitted,
  prepareIntegratedCourseRemoval,
  reconcileCommittedCourseRemoval
} from "../assist/integratedCourseSync.js";
import { createAuthoringAssistantPanel } from "./AuthoringAssistantPanel.js";
import { renderUiIcon } from "./renderUiIcons.js";

function text(value) {
  return typeof value === "string" ? value : "";
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function icon(name, className = "remote-library-action-icon") {
  return renderUiIcon(name, className);
}

function button(documentValue, {
  action,
  iconName,
  label,
  className = "icon-ghost",
  disabled = false,
  data = {}
}) {
  const node = documentValue.createElement("button");
  node.type = "button";
  node.className = className;
  node.dataset.panelAction = action;
  node.title = label;
  node.setAttribute("aria-label", label);
  node.disabled = disabled;
  if (disabled) node.setAttribute("aria-disabled", "true");
  for (const [key, value] of Object.entries(data)) node.dataset[key] = value;
  node.innerHTML = icon(iconName);
  return node;
}

function empty(documentValue, message) {
  const node = documentValue.createElement("p");
  node.className = "empty-state-copy";
  node.textContent = message;
  return node;
}

function metric(documentValue, value, singular, plural) {
  const label = value === 1 ? singular : plural;
  const node = documentValue.createElement("span");
  node.className = "progress-meta-item";
  node.title = `${value} ${label}`;
  node.setAttribute("aria-label", `${value} ${label}`);
  node.textContent = `${value} ${label}`;
  return node;
}

function trailOrigin(item) {
  if (item.kind === "plan") {
    return {
      key: "plan",
      label: "Plano",
      description: "Planejamento privado em Trilhas"
    };
  }
  if (item.origin === "catalog") {
    return {
      key: "catalog",
      label: "De Coleções",
      description: "Cópia privada de um curso público de Coleções"
    };
  }
  return {
    key: "private",
    label: "Privado",
    description: "Curso disponível somente em Trilhas"
  };
}

export async function confirmCourseRemovalInReplica({
  syncEngine,
  repository,
  synchronizeReplica,
  courseId
} = {}) {
  return reconcileCommittedCourseRemoval({
    syncEngine,
    repository,
    synchronizeReplica,
    courseId
  });
}

export function createLearningSpacesPanel({
  root,
  catalog,
  authClient,
  projectUrl = "",
  onOpenCourse = null,
  onChanged = () => globalThis.location?.reload?.(),
  onSignedOut = onChanged,
  onAccountDeleted = onChanged,
  beforeRemoteRead = async () => {},
  beforeSignOut = async () => 0,
  syncEngine = null,
  studyPathRepository = null,
  onStudyPathsChanged = async () => {},
  assistantPanel = null,
  documentValue = globalThis.document
} = {}) {
  if (!root || !catalog || !authClient) throw new TypeError("Dependências do painel ausentes.");
  const spaces = new LearningSpaces({ catalog, authClient });
  let opened = false;
  let busy = false;
  const busyOperations = new Map();
  let activeView = "trails";
  let trails = null;
  let collections = [];
  let selectedWorkspace = null;
  let creatingPlan = false;
  let editingEntity = null;
  let observingEntity = null;
  let observations = [];
  let statusMessage = "";
  let catalogQuery = "";
  let catalogManagementAllowed = null;
  let authenticatedCapabilities = Object.freeze({
    catalogManage: false,
    catalogReview: false
  });
  let renderEpoch = 0;
  let loadEpoch = 0;

  root.innerHTML = `
    <section class="remote-library-overlay" data-learning-panel hidden aria-label="Painel">
      <div class="remote-library-backdrop" data-panel-close></div>
      <div class="remote-library-panel courses-home-screen" role="dialog" aria-modal="true">
        <header class="remote-library-header">
          <div class="remote-library-tab-row">
            <nav class="remote-library-tabs" role="tablist" aria-label="Painel">
              <button class="remote-library-tab is-active" type="button" role="tab" data-panel-view="trails" aria-selected="true">${icon("trail")}<span>Trilhas</span></button>
              <button class="remote-library-tab" type="button" role="tab" data-panel-view="collections" aria-selected="false" tabindex="-1">${icon("folder")}<span>Coleções</span></button>
              <button class="remote-library-tab" type="button" role="tab" data-panel-view="chatbot" aria-selected="false" tabindex="-1">${icon("sparkles")}<span>Chatbot</span></button>
            </nav>
            <button class="icon-ghost remote-library-close" type="button" data-panel-close title="Fechar painel" aria-label="Fechar painel">${icon("remove-state")}</button>
          </div>
          <label class="remote-catalog-search" data-panel-search hidden>
            ${icon("search")}
            <input type="search" placeholder="Pesquisar cursos" data-panel-search-input aria-label="Pesquisar cursos em Coleções">
          </label>
        </header>
        <div class="remote-library-content" data-panel-content></div>
        <p class="remote-library-status" data-panel-status role="status" aria-live="polite"></p>
        <footer class="remote-library-footer">
          <div class="remote-library-primary-actions">
            <button class="icon-ghost" type="button" data-panel-action="sync" title="Sincronizar" aria-label="Sincronizar">${icon("rotate")}</button>
          </div>
          <div class="theme-choice" role="group" aria-label="Aparência">
            <button class="theme-choice-button" type="button" data-theme-choice="system" title="Tema do sistema" aria-label="Tema do sistema">${icon("theme-system", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="light" title="Tema claro" aria-label="Tema claro">${icon("theme-light", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="dark" title="Tema escuro" aria-label="Tema escuro">${icon("theme-dark", "theme-choice-icon")}</button>
          </div>
          <div class="remote-library-account-actions">
            <button class="icon-ghost" type="button" data-panel-action="signout" title="Sair" aria-label="Sair">${icon("sign-out")}</button>
            <button class="icon-ghost is-danger" type="button" data-panel-action="delete-account" title="Excluir conta" aria-label="Excluir conta">${icon("trash")}</button>
          </div>
        </footer>
      </div>
    </section>
  `;

  const overlay = root.querySelector("[data-learning-panel]");
  const content = root.querySelector("[data-panel-content]");
  const status = root.querySelector("[data-panel-status]");
  const search = root.querySelector("[data-panel-search]");
  const searchInput = root.querySelector("[data-panel-search-input]");
  const assistant = assistantPanel || createAuthoringAssistantPanel({
    projectUrl,
    getAccessToken: () => authClient.getAccessToken(),
    documentValue
  });

  function syncThemeChoice(preference = globalThis.AraLearnTheme?.getState?.().preference || "system") {
    root.querySelectorAll("[data-theme-choice]").forEach((node) => {
      const selected = node.dataset.themeChoice === preference;
      node.classList.toggle("is-active", selected);
      node.setAttribute("aria-pressed", String(selected));
    });
  }

  syncThemeChoice();

  function currentBusyMessage() {
    return Array.from(busyOperations.values()).at(-1) || "";
  }

  function syncBusyState() {
    busy = busyOperations.size > 0;
    overlay.setAttribute("aria-busy", String(busy));
    overlay.querySelectorAll("button, input, textarea, select").forEach((node) => {
      if (node.matches("[data-panel-close]")) return;
      if (busy) {
        if (!("disabledBeforeBusy" in node.dataset)) {
          node.dataset.disabledBeforeBusy = String(node.disabled);
        }
        node.disabled = true;
      } else if ("disabledBeforeBusy" in node.dataset) {
        node.disabled = node.dataset.disabledBeforeBusy === "true";
        delete node.dataset.disabledBeforeBusy;
      }
    });
    status.textContent = currentBusyMessage() || statusMessage;
  }

  function beginBusy(message) {
    const operation = Symbol("learning-spaces-operation");
    busyOperations.set(operation, message);
    syncBusyState();
    return operation;
  }

  function endBusy(operation) {
    busyOperations.delete(operation);
    syncBusyState();
  }

  function reportStatus(message = "") {
    statusMessage = message;
    status.textContent = currentBusyMessage() || statusMessage;
  }

  async function applyAuthenticatedCapabilities(page, { trusted = false } = {}) {
    if (!trusted) return;
    const nextValue = page?.capabilities?.catalogManage === true;
    authenticatedCapabilities = Object.freeze({
      catalogManage: nextValue,
      catalogReview: page?.capabilities?.catalogReview === true
    });
    const changed = catalogManagementAllowed !== nextValue;
    studyPathRepository?.setCatalogManagementAllowed?.(nextValue);
    catalogManagementAllowed = nextValue;
    if (!changed) return;
    try {
      await onStudyPathsChanged();
    } catch (error) {
      console.warn("Não foi possível atualizar as permissões exibidas.", error);
    }
  }

  function syncTabs() {
    root.querySelectorAll("[data-panel-view]").forEach((node) => {
      const selected = node.dataset.panelView === activeView;
      node.classList.toggle("is-active", selected);
      node.setAttribute("aria-selected", String(selected));
      node.tabIndex = selected ? 0 : -1;
    });
    search.hidden = activeView !== "collections";
  }

  function renderTrailCard(item) {
    const origin = trailOrigin(item);
    const card = documentValue.createElement("article");
    card.className = `remote-space-card remote-trail-control-card is-origin-${origin.key}`;
    card.dataset.trailItemId = item.itemId;
    card.dataset.courseOrigin = origin.key;
    const copy = documentValue.createElement("div");
    copy.className = "remote-central-item-copy";
    const identity = documentValue.createElement("div");
    identity.className = "remote-space-card-identity";
    const heading = documentValue.createElement("h3");
    heading.textContent = item.title;
    const originLabel = documentValue.createElement("span");
    originLabel.className = "remote-course-origin";
    originLabel.textContent = origin.label;
    originLabel.title = origin.description;
    originLabel.setAttribute("aria-label", origin.description);
    identity.append(heading, originLabel);
    copy.append(identity);
    if (item.description) {
      const description = documentValue.createElement("p");
      description.textContent = item.description;
      copy.append(description);
    }
    const meta = documentValue.createElement("div");
    meta.className = "progress-meta";
    meta.append(
      metric(documentValue, item.moduleCount, "módulo", "módulos"),
      metric(documentValue, item.lessonCount, "lição", "lições"),
      metric(documentValue, item.cardCount, "card", "cards")
    );
    const actions = documentValue.createElement("div");
    actions.className = "remote-central-item-actions";
    if (item.workspaceId) {
      actions.append(button(documentValue, {
        action: "inspect-workspace",
        iconName: "folder",
        label: item.kind === "plan" ? "Abrir plano" : "Organizar curso",
        data: { workspaceId: item.workspaceId }
      }));
    } else if (
      item.kind === "course"
      && item.courseId
      && (item.canEdit || (item.origin === "catalog" && authenticatedCapabilities.catalogManage))
    ) {
      actions.append(button(documentValue, {
        action: "create-course-workspace",
        iconName: "folder",
        label: "Organizar curso",
        data: { courseId: item.courseId, title: item.title }
      }));
    }
    if (item.kind === "course" && (item.courseId || item.courseKey)) {
      actions.append(button(documentValue, {
        action: "open-course",
        iconName: "play",
        label: "Abrir curso",
        className: "open-main",
        data: {
          courseId: item.courseId || "",
          courseKey: item.courseKey || ""
        }
      }));
    }
    if (
      item.kind === "course"
      && item.selectionId
      && item.courseId
      && item.contentHash
    ) {
      const removesPrivateCourse = origin.key === "private";
      actions.append(button(documentValue, {
        action: "remove-course-from-trails",
        iconName: removesPrivateCourse ? "trash" : "review",
        label: removesPrivateCourse ? "Excluir curso privado" : "Retirar de Trilhas",
        className: removesPrivateCourse ? "icon-ghost is-danger" : "icon-ghost",
        disabled: !item.canRemove,
        data: {
          selectionId: item.selectionId,
          courseId: item.courseId,
          contentHash: item.contentHash,
          title: item.title
        }
      }));
    }
    if (
      item.kind === "course"
      && origin.key === "catalog"
      && item.courseId
      && item.canDelete
    ) {
      actions.append(button(documentValue, {
        action: "remove-course-from-catalog",
        iconName: "trash",
        label: "Retirar de Coleções",
        className: "icon-ghost is-danger",
        data: { courseId: item.courseId, title: item.title }
      }));
    } else if (!item.courseId && item.workspaceId) {
      actions.append(button(documentValue, {
        action: "delete-workspace",
        iconName: "trash",
        label: item.kind === "plan" ? "Excluir plano" : "Excluir plano de autoria",
        disabled: !item.canDelete,
        data: { workspaceId: item.workspaceId, title: item.title }
      }));
    }
    const footer = documentValue.createElement("div");
    footer.className = "remote-space-card-footer";
    footer.append(meta, actions);
    card.append(copy, footer);
    return card;
  }

  function renderTrails() {
    const section = documentValue.createElement("section");
    section.className = "remote-library-view remote-central-view";
    const head = documentValue.createElement("div");
    head.className = "remote-library-section-heading";
    const title = documentValue.createElement("h2");
    title.textContent = "Trilhas";
    head.append(title, button(documentValue, {
      action: "create-plan",
      iconName: "add",
      label: "Criar plano"
    }));
    section.append(head);
    if (creatingPlan) {
      const form = documentValue.createElement("form");
      form.className = "remote-workspace-metadata-form remote-plan-form";
      form.dataset.planForm = "true";
      const titleInput = documentValue.createElement("input");
      titleInput.name = "title";
      titleInput.required = true;
      titleInput.maxLength = 300;
      titleInput.placeholder = "Título";
      titleInput.setAttribute("aria-label", "Título do plano");
      const descriptionInput = documentValue.createElement("textarea");
      descriptionInput.name = "description";
      descriptionInput.maxLength = 16000;
      descriptionInput.rows = 2;
      descriptionInput.placeholder = "Objetivo";
      descriptionInput.setAttribute("aria-label", "Objetivo do plano");
      const actions = documentValue.createElement("div");
      actions.className = "remote-central-item-actions";
      actions.append(
        button(documentValue, { action: "cancel-plan", iconName: "remove-state", label: "Cancelar" }),
        button(documentValue, { action: "submit-plan", iconName: "save", label: "Salvar", className: "open-main" })
      );
      form.append(titleInput, descriptionInput, actions);
      section.append(form);
      globalThis.setTimeout(() => titleInput.focus(), 0);
    }
    const list = documentValue.createElement("div");
    list.className = "navigation-list remote-library-course-list";
    array(trails?.items).forEach((item) => list.append(renderTrailCard(item)));
    if (!list.children.length) list.append(empty(documentValue, "Nenhum plano ou curso."));
    section.append(list);
    return section;
  }

  function renderWorkspaceTree(workspace) {
    const section = documentValue.createElement("section");
    section.className = "remote-library-view remote-workspace-view";
    const head = documentValue.createElement("div");
    head.className = "remote-library-section-heading remote-workspace-heading";
    head.append(
      button(documentValue, { action: "back-to-trails", iconName: "arrow-left", label: "Voltar" }),
      Object.assign(documentValue.createElement("h2"), { textContent: workspace.title || "Plano" })
    );
    section.append(head);
    const contentValue = workspace.content || {};
    const access = workspace.access || {};
    const canAuthor = access.author === true;
    const canComment = access.comment === true;
    const canManage = access.manage === true;
    const courses = array(contentValue.courses);
    const list = documentValue.createElement("div");
    list.className = "remote-workspace-tree";
    const appendEntity = (entity, level, parent, path, position, siblingCount) => {
      const row = documentValue.createElement("article");
      row.className = `remote-workspace-tree-item is-${level}`;
      row.dataset.entityPath = JSON.stringify(path);
      const entityTitle = entity.title || entity.id || level;
      const title = documentValue.createElement("h3");
      title.textContent = entityTitle;
      const actions = documentValue.createElement("div");
      actions.className = "remote-central-item-actions";
      actions.append(
        button(documentValue, {
          action: "move-entity-up", iconName: "arrow-up", label: `Mover ${entityTitle} para cima`,
          disabled: !canAuthor || position === 0,
          data: { entityType: level, entityPath: JSON.stringify(path), position: String(position - 1) }
        }),
        button(documentValue, {
          action: "move-entity-down", iconName: "arrow-down", label: `Mover ${entityTitle} para baixo`,
          disabled: !canAuthor || position >= siblingCount - 1,
          data: { entityType: level, entityPath: JSON.stringify(path), position: String(position + 1) }
        }),
        button(documentValue, {
          action: "edit-workspace-entity", iconName: "edit", label: `Editar ${entityTitle}`,
          disabled: !canAuthor,
          data: {
            entityType: level,
            entityPath: JSON.stringify(path),
            title: entity.title || "",
            goal: entity.goal || ""
          }
        }),
        button(documentValue, {
          action: "observe-workspace-entity", iconName: "review", label: `Observar ${entityTitle}`,
          disabled: !canComment,
          data: { entityType: level, entityPath: JSON.stringify(path), title: entity.title || "" }
        }),
        button(documentValue, {
          action: "delete-workspace-entity", iconName: "trash", label: `Excluir ${entityTitle}`,
          className: "icon-ghost is-danger",
          disabled: !canManage,
          data: { entityType: level, entityPath: JSON.stringify(path), title: entity.title || "" }
        })
      );
      row.append(title, actions);
      parent.append(row);
      if (editingEntity?.pathKey === JSON.stringify(path)) {
        const form = documentValue.createElement("form");
        form.className = "remote-workspace-metadata-form remote-entity-form";
        form.dataset.entityForm = "true";
        form.dataset.entityType = level;
        form.dataset.entityPath = JSON.stringify(path);
        const titleInput = documentValue.createElement("input");
        titleInput.name = "title";
        titleInput.required = true;
        titleInput.maxLength = 300;
        titleInput.value = editingEntity.title;
        titleInput.setAttribute("aria-label", "Título");
        const goalInput = documentValue.createElement("textarea");
        goalInput.name = "goal";
        goalInput.maxLength = 2000;
        goalInput.rows = 2;
        goalInput.value = editingEntity.goal;
        goalInput.setAttribute("aria-label", "Descrição");
        const formActions = documentValue.createElement("div");
        formActions.className = "remote-central-item-actions";
        formActions.append(
          button(documentValue, { action: "cancel-entity-edit", iconName: "remove-state", label: "Cancelar" }),
          button(documentValue, { action: "submit-entity-edit", iconName: "save", label: "Salvar", className: "open-main" })
        );
        form.append(titleInput, goalInput, formActions);
        parent.append(form);
      }
      if (observingEntity?.pathKey === JSON.stringify(path)) {
        const notePanel = documentValue.createElement("section");
        notePanel.className = "remote-observation-panel";
        const form = documentValue.createElement("form");
        form.className = "remote-workspace-metadata-form remote-observation-form";
        form.dataset.observationForm = "true";
        form.dataset.entityType = level;
        form.dataset.entityPath = JSON.stringify(path);
        const input = documentValue.createElement("textarea");
        input.name = "body";
        input.required = true;
        input.maxLength = 2000;
        input.rows = 2;
        input.placeholder = "Observação";
        input.setAttribute("aria-label", `Observação sobre ${entity.title || level}`);
        const formActions = documentValue.createElement("div");
        formActions.className = "remote-central-item-actions";
        formActions.append(
          button(documentValue, { action: "cancel-observation", iconName: "remove-state", label: "Fechar" }),
          button(documentValue, { action: "submit-observation", iconName: "save", label: "Salvar", className: "open-main" })
        );
        form.append(input, formActions);
        notePanel.append(form);
        observations
          .filter((note) => JSON.stringify(note.entityPath || []) === JSON.stringify(path))
          .forEach((note) => {
            const item = documentValue.createElement("article");
            item.className = "remote-observation-item";
            const body = documentValue.createElement("p");
            body.textContent = note.body;
            item.append(body);
            if (note.canDelete) {
              item.append(button(documentValue, {
                action: "delete-observation",
                iconName: "trash",
                label: "Excluir observação",
                className: "icon-ghost is-danger",
                data: { observationId: note.observationId }
              }));
            }
            notePanel.append(item);
          });
        parent.append(notePanel);
      }
      const children = level === "course"
        ? array(entity.modules)
        : level === "module"
          ? array(entity.lessons)
          : level === "lesson"
            ? array(entity.microsequences)
            : [];
      const nextLevel = { course: "module", module: "lesson", lesson: "microsequence" }[level];
      children.forEach((child, childPosition) => appendEntity(
        child,
        nextLevel,
        parent,
        [...path, child.id],
        childPosition,
        children.length
      ));
    };
    courses.forEach((course, position) => appendEntity(
      course,
      "course",
      list,
      [course.id],
      position,
      courses.length
    ));
    if (!courses.length) list.append(empty(documentValue, "Plano vazio."));
    section.append(list);
    return section;
  }

  function renderCollections() {
    const section = documentValue.createElement("section");
    section.className = "remote-library-view remote-library-collections";
    const groups = new Map();
    array(collections).forEach((row) => {
      const id = text(row.collection_id ?? row.collectionId);
      if (!groups.has(id)) groups.set(id, {
        title: text(row.collection_title ?? row.collectionTitle) || "Coleção",
        courses: []
      });
      if (row.course_id ?? row.courseId) groups.get(id).courses.push(row);
    });
    groups.forEach((group) => {
      const block = documentValue.createElement("section");
      block.className = "remote-catalog-collection";
      const heading = documentValue.createElement("h2");
      heading.textContent = group.title;
      block.append(heading);
      const courseList = documentValue.createElement("div");
      courseList.className = "remote-catalog-course-list";
      group.courses.forEach((course) => {
        const card = documentValue.createElement("article");
        card.className = "remote-space-card remote-catalog-course-card is-origin-catalog";
        card.dataset.courseOrigin = "catalog";
        const copy = documentValue.createElement("div");
        copy.className = "remote-central-item-copy";
        const title = documentValue.createElement("h3");
        title.textContent = text(course.course_title ?? course.courseTitle ?? course.title) || "Curso";
        copy.append(title);
        const descriptionValue = text(course.goal ?? course.description);
        if (descriptionValue) {
          const description = documentValue.createElement("p");
          description.textContent = descriptionValue;
          copy.append(description);
        }
        const actions = documentValue.createElement("div");
        actions.className = "remote-central-item-actions";
        if (authenticatedCapabilities.catalogManage) {
          actions.append(button(documentValue, {
            action: "create-course-workspace",
            iconName: "folder",
            label: "Organizar curso",
            data: {
              courseId: text(course.course_id ?? course.courseId),
              title: title.textContent
            }
          }));
        }
        actions.append(button(documentValue, {
          action: "open-course",
          iconName: "play",
          label: "Abrir curso",
          className: "open-main",
          data: { courseId: text(course.course_id ?? course.courseId), courseKey: "" }
        }));
        card.append(copy, actions);
        courseList.append(card);
      });
      if (!group.courses.length) courseList.append(empty(documentValue, "Sem cursos."));
      block.append(courseList);
      section.append(block);
    });
    if (!groups.size) section.append(empty(documentValue, "Nenhum resultado."));
    return section;
  }

  async function renderActive() {
    const epoch = ++renderEpoch;
    const view = activeView;
    if (!opened) return false;
    content.replaceChildren();
    syncTabs();
    try {
      if (view === "chatbot") {
        await assistant.open({ catalogAccess: authenticatedCapabilities.catalogManage });
        if (epoch !== renderEpoch || view !== activeView || !opened) return false;
        content.append(assistant.element);
      } else if (view === "collections") {
        assistant.close();
        content.append(renderCollections());
      } else {
        assistant.close();
        content.append(selectedWorkspace ? renderWorkspaceTree(selectedWorkspace) : renderTrails());
      }
    } catch (error) {
      if (epoch !== renderEpoch || view !== activeView || !opened) return false;
      assistant.close();
      content.replaceChildren(empty(documentValue, "Não foi possível abrir esta área."));
      reportStatus(error instanceof Error ? error.message : "Não foi possível abrir esta área.");
    }
    if (epoch !== renderEpoch || view !== activeView || !opened) return false;
    syncBusyState();
    return true;
  }

  async function load({ synchronizeBeforeRead = true } = {}) {
    const epoch = ++loadEpoch;
    const operation = beginBusy("Consultando…");
    try {
      if (synchronizeBeforeRead) await beforeRemoteRead();
      const trailResult = await spaces.loadTrails();
      if (epoch !== loadEpoch || !opened) return;
      trails = trailResult.page;
      await applyAuthenticatedCapabilities(trails, { trusted: trailResult.stale !== true });
      if (activeView === "collections") {
        const nextCollections = await catalog.listCollections(catalogQuery);
        if (epoch !== loadEpoch || !opened) return;
        collections = nextCollections;
      }
      reportStatus(trailResult.stale ? "Último estado disponível." : "");
    } catch (error) {
      if (epoch !== loadEpoch || !opened) return;
      await applyAuthenticatedCapabilities(null, { trusted: true });
      try {
        const cached = await spaces.loadTrails({ online: false, fallbackPage: trails });
        trails = cached.page;
      } catch {
        // A falha do cache não pode manter o painel ocupado.
      }
      reportStatus(error instanceof Error ? error.message : "Não foi possível abrir o painel.");
    } finally {
      try {
        if (epoch === loadEpoch && opened) await renderActive();
      } finally {
        endBusy(operation);
      }
    }
  }

  async function createPlan(form) {
    const data = new FormData(form);
    const title = text(data.get("title")).trim();
    if (!title) return;
    const operation = beginBusy("Criando…");
    try {
      await spaces.createPlan({ title, description: text(data.get("description")).trim() });
      creatingPlan = false;
      selectedWorkspace = null;
      await load({ synchronizeBeforeRead: false });
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível criar o plano.");
    } finally {
      endBusy(operation);
    }
  }

  async function refreshSelectedWorkspace() {
    if (!selectedWorkspace?.workspaceId) return;
    selectedWorkspace = await spaces.loadWorkspace(selectedWorkspace.workspaceId, "outline");
    await renderActive();
  }

  async function saveWorkspaceEntity(form) {
    const data = new FormData(form);
    const operation = beginBusy("Salvando…");
    try {
      await spaces.updateEntity({
        workspaceId: selectedWorkspace.workspaceId,
        revision: selectedWorkspace.revision,
        entityType: form.dataset.entityType,
        entityPath: JSON.parse(form.dataset.entityPath),
        title: data.get("title"),
        goal: data.get("goal")
      });
      editingEntity = null;
      await refreshSelectedWorkspace();
      reportStatus("");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      endBusy(operation);
    }
  }

  async function moveWorkspaceEntity(node) {
    const entityPath = JSON.parse(node.dataset.entityPath);
    const operation = beginBusy("Movendo…");
    try {
      await spaces.moveEntity({
        workspaceId: selectedWorkspace.workspaceId,
        revision: selectedWorkspace.revision,
        entityType: node.dataset.entityType,
        entityPath,
        targetParentPath: entityPath.length === 1 ? null : entityPath.slice(0, -1),
        position: Number(node.dataset.position)
      });
      await refreshSelectedWorkspace();
      reportStatus("");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível mover.");
    } finally {
      endBusy(operation);
    }
  }

  async function deleteWorkspaceEntity(node) {
    if (!globalThis.confirm?.(`Excluir "${node.dataset.title || "Item"}" e todo o seu conteúdo?`)) return;
    const operation = beginBusy("Excluindo…");
    try {
      await spaces.deleteEntity({
        workspaceId: selectedWorkspace.workspaceId,
        revision: selectedWorkspace.revision,
        entityType: node.dataset.entityType,
        entityPath: JSON.parse(node.dataset.entityPath)
      });
      editingEntity = null;
      await refreshSelectedWorkspace();
      reportStatus("");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      endBusy(operation);
    }
  }

  async function inspectWorkspace(workspaceId) {
    const operation = beginBusy("Abrindo…");
    try {
      const [workspace, notes, context] = await Promise.all([
        spaces.loadWorkspace(workspaceId, "outline"),
        spaces.listObservations(workspaceId),
        spaces.loadWorkspaceAccess(workspaceId)
      ]);
      selectedWorkspace = { ...workspace, access: context?.capabilities || {} };
      observations = array(notes?.items);
      activeView = "trails";
      reportStatus("");
      await renderActive();
      return true;
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível abrir o plano.");
      return false;
    } finally {
      endBusy(operation);
    }
  }

  async function createCourseWorkspace(courseId, title) {
    const operation = beginBusy("Abrindo…");
    try {
      const created = await spaces.createCourseWorkspace({ courseId, title });
      await inspectWorkspace(created.workspaceId);
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível organizar o curso.");
    } finally {
      endBusy(operation);
    }
  }

  async function saveObservation(form) {
    const data = new FormData(form);
    const operation = beginBusy("Salvando…");
    try {
      await spaces.createObservation({
        workspaceId: selectedWorkspace.workspaceId,
        entityType: form.dataset.entityType,
        entityPath: JSON.parse(form.dataset.entityPath),
        body: data.get("body")
      });
      observations = array((await spaces.listObservations(selectedWorkspace.workspaceId))?.items);
      reportStatus("");
      await renderActive();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível salvar a observação.");
    } finally {
      endBusy(operation);
    }
  }

  async function deleteObservation(observationId) {
    const operation = beginBusy("Excluindo…");
    try {
      await spaces.deleteObservation({
        workspaceId: selectedWorkspace.workspaceId,
        observationId
      });
      observations = array((await spaces.listObservations(selectedWorkspace.workspaceId))?.items);
      reportStatus("");
      await renderActive();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível excluir a observação.");
    } finally {
      endBusy(operation);
    }
  }

  async function deleteWorkspace(workspaceId, title) {
    if (!globalThis.confirm?.(`Excluir "${title || "Plano"}" e todo o conteúdo em construção?`)) return;
    const operation = beginBusy("Excluindo…");
    try {
      await spaces.deleteWorkspace(workspaceId);
      selectedWorkspace = null;
      await load({ synchronizeBeforeRead: false });
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      endBusy(operation);
    }
  }

  async function removeCourseFromTrails(node) {
    const privateCourse = node.closest("[data-course-origin]")?.dataset.courseOrigin === "private";
    const question = privateCourse
      ? `Excluir o curso privado "${node.dataset.title || "Curso"}" de Trilhas?`
      : `Retirar "${node.dataset.title || "Curso"}" de Trilhas?`;
    if (!globalThis.confirm?.(question)) return;
    const operation = beginBusy("Retirando…");
    let remoteCommitted = false;
    try {
      if (
        typeof syncEngine?.confirmSelectedCourseRemoval !== "function"
        || typeof studyPathRepository?.refreshFromReplica !== "function"
        || typeof studyPathRepository?.flush !== "function"
      ) {
        throw new TypeError("Sincronização local indisponível para retirar o curso.");
      }
      await prepareIntegratedCourseRemoval({
        repository: studyPathRepository,
        synchronizeReplica: beforeRemoteRead
      });
      await spaces.removeCourseFromTrails({
        selectionId: node.dataset.selectionId,
        courseId: node.dataset.courseId,
        expectedContentHash: node.dataset.contentHash
      });
      remoteCommitted = true;
      await confirmCourseRemovalInReplica({
        syncEngine,
        repository: studyPathRepository,
        synchronizeReplica: beforeRemoteRead,
        courseId: node.dataset.courseId
      });
      try {
        await onStudyPathsChanged();
      } catch (error) {
        console.warn("Não foi possível atualizar os cursos exibidos.", error);
      }
      if (trails) {
        trails = {
          ...trails,
          items: array(trails.items).filter((item) => item.selectionId !== node.dataset.selectionId)
        };
      }
      selectedWorkspace = null;
      await load({ synchronizeBeforeRead: false });
    } catch (error) {
      if (remoteCommitted || courseRemovalWasCommitted(error)) {
        if (trails) {
          trails = {
            ...trails,
            items: array(trails.items).filter((item) => item.selectionId !== node.dataset.selectionId)
          };
        }
        selectedWorkspace = null;
        try {
          await onStudyPathsChanged();
        } catch (refreshError) {
          console.warn("Não foi possível atualizar os cursos exibidos.", refreshError);
        }
        await load({ synchronizeBeforeRead: false });
        reportStatus(
          error instanceof Error
            ? error.message
            : "O curso foi retirado no servidor; sincronize este dispositivo."
        );
      } else {
        reportStatus(error instanceof Error ? error.message : "Não foi possível retirar o curso.");
      }
    } finally {
      endBusy(operation);
    }
  }

  async function removeCourseFromCatalog(node) {
    if (!globalThis.confirm?.(
      `Retirar o curso oficial "${node.dataset.title || "Curso"}" de Coleções? Ele deixará de ser distribuído pelo catálogo.`
    )) return;
    const operation = beginBusy("Retirando…");
    let remoteCommitted = false;
    try {
      if (
        typeof syncEngine?.confirmSelectedCourseRemoval !== "function"
        || typeof studyPathRepository?.refreshFromReplica !== "function"
        || typeof studyPathRepository?.flush !== "function"
      ) {
        throw new TypeError("Sincronização local indisponível para retirar o curso.");
      }
      await prepareIntegratedCourseRemoval({
        repository: studyPathRepository,
        synchronizeReplica: beforeRemoteRead
      });
      await spaces.removeCourseFromCatalog(node.dataset.courseId);
      remoteCommitted = true;
      await confirmCourseRemovalInReplica({
        syncEngine,
        repository: studyPathRepository,
        synchronizeReplica: beforeRemoteRead,
        courseId: node.dataset.courseId
      });
      try {
        await onStudyPathsChanged();
      } catch (error) {
        console.warn("Não foi possível atualizar os cursos exibidos.", error);
      }
      if (trails) {
        trails = {
          ...trails,
          items: array(trails.items).filter((item) => item.courseId !== node.dataset.courseId)
        };
      }
      selectedWorkspace = null;
      await load({ synchronizeBeforeRead: false });
    } catch (error) {
      if (remoteCommitted || courseRemovalWasCommitted(error)) {
        if (trails) {
          trails = {
            ...trails,
            items: array(trails.items).filter((item) => item.courseId !== node.dataset.courseId)
          };
        }
        selectedWorkspace = null;
        try {
          await onStudyPathsChanged();
        } catch (refreshError) {
          console.warn("Não foi possível atualizar os cursos exibidos.", refreshError);
        }
        await load({ synchronizeBeforeRead: false });
        reportStatus(
          error instanceof Error
            ? error.message
            : "O curso foi retirado no servidor; sincronize este dispositivo."
        );
      } else {
        reportStatus(error instanceof Error ? error.message : "Não foi possível retirar o curso.");
      }
    } finally {
      endBusy(operation);
    }
  }

  async function close() {
    opened = false;
    renderEpoch += 1;
    loadEpoch += 1;
    assistant.close();
    overlay.hidden = true;
    selectedWorkspace = null;
  }

  async function open(view = "trails") {
    activeView = ["trails", "collections", "chatbot"].includes(view) ? view : "trails";
    opened = true;
    overlay.hidden = false;
    await load();
  }

  root.querySelectorAll("[data-panel-close]").forEach((node) => {
    node.addEventListener("click", () => void close());
  });
  root.querySelectorAll("[data-panel-view]").forEach((node) => {
    node.addEventListener("click", async () => {
      if (busy) return;
      try {
        activeView = node.dataset.panelView;
        selectedWorkspace = null;
        if (activeView === "collections" && !collections.length) {
          await load({ synchronizeBeforeRead: false });
        } else {
          await renderActive();
        }
      } catch (error) {
        reportStatus(error instanceof Error ? error.message : "Não foi possível abrir esta área.");
        syncBusyState();
      }
    });
  });
  content.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form?.reportValidity()) return;
    if (form.matches("[data-plan-form]")) void createPlan(form);
    else if (form.matches("[data-entity-form]")) void saveWorkspaceEntity(form);
    else if (form.matches("[data-observation-form]")) void saveObservation(form);
  });
  content.addEventListener("click", (event) => {
    const node = event.target instanceof Element
      ? event.target.closest("[data-panel-action]")
      : null;
    if (!node || busy) return;
    const action = node.dataset.panelAction;
    if (action === "create-plan") {
      creatingPlan = true;
      void renderActive();
    } else if (action === "cancel-plan") {
      creatingPlan = false;
      void renderActive();
    } else if (action === "submit-plan") {
      const form = node.closest("[data-plan-form]");
      if (form?.reportValidity()) void createPlan(form);
    }
    else if (action === "inspect-workspace") void inspectWorkspace(node.dataset.workspaceId);
    else if (action === "create-course-workspace") {
      void createCourseWorkspace(node.dataset.courseId, node.dataset.title);
    }
    else if (action === "back-to-trails") {
      selectedWorkspace = null;
      void renderActive();
    } else if (action === "delete-workspace") {
      void deleteWorkspace(node.dataset.workspaceId, node.dataset.title);
    } else if (action === "remove-course-from-trails") {
      void removeCourseFromTrails(node);
    } else if (action === "remove-course-from-catalog") {
      void removeCourseFromCatalog(node);
    } else if (action === "edit-workspace-entity") {
      editingEntity = {
        pathKey: node.dataset.entityPath,
        title: node.dataset.title || "",
        goal: node.dataset.goal || ""
      };
      void renderActive();
    } else if (action === "observe-workspace-entity") {
      observingEntity = {
        pathKey: node.dataset.entityPath,
        title: node.dataset.title || ""
      };
      void renderActive();
    } else if (action === "cancel-observation") {
      observingEntity = null;
      void renderActive();
    } else if (action === "submit-observation") {
      const form = node.closest("[data-observation-form]");
      if (form?.reportValidity()) void saveObservation(form);
    } else if (action === "delete-observation") {
      void deleteObservation(node.dataset.observationId);
    } else if (action === "cancel-entity-edit") {
      editingEntity = null;
      void renderActive();
    } else if (action === "submit-entity-edit") {
      const form = node.closest("[data-entity-form]");
      if (form?.reportValidity()) void saveWorkspaceEntity(form);
    } else if (action === "move-entity-up" || action === "move-entity-down") {
      void moveWorkspaceEntity(node);
    } else if (action === "delete-workspace-entity") {
      void deleteWorkspaceEntity(node);
    } else if (action === "open-course") {
      void (async () => {
        let openedCourse = onOpenCourse?.({
          courseId: node.dataset.courseId || "",
          courseKey: node.dataset.courseKey || ""
        });
        if (openedCourse === false && node.dataset.courseId) {
          const operation = beginBusy("Abrindo…");
          try {
            await catalog.selectCourse(node.dataset.courseId);
            await beforeRemoteRead({ expectedCourseIds: [node.dataset.courseId] });
            openedCourse = onOpenCourse?.({ courseId: node.dataset.courseId, courseKey: "" });
          } catch (error) {
            reportStatus(error instanceof Error ? error.message : "Não foi possível abrir o curso.");
            return;
          } finally {
            endBusy(operation);
          }
        }
        if (openedCourse !== false) {
          void close();
        }
      })();
    }
  });
  root.querySelector("[data-panel-action='sync']")?.addEventListener("click", async () => {
    if (busy) return;
    await load();
  });
  root.querySelector("[data-panel-action='signout']")?.addEventListener("click", async () => {
    if (busy) return;
    const operation = beginBusy("Saindo…");
    try {
      const pending = await beforeSignOut();
      if (pending && !globalThis.confirm?.("Há alterações aguardando envio. Sair mesmo assim?")) return;
      await authClient.signOut();
      await onSignedOut();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível sair.");
    } finally {
      endBusy(operation);
    }
  });
  root.querySelector("[data-panel-action='delete-account']")?.addEventListener("click", async () => {
    if (busy || !globalThis.confirm?.("Excluir a conta e todos os dados pessoais?")) return;
    const operation = beginBusy("Excluindo…");
    try {
      await catalog.deleteOwnAccount();
      await onAccountDeleted();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível excluir a conta.");
    } finally {
      endBusy(operation);
    }
  });
  root.querySelectorAll("[data-theme-choice]").forEach((node) => {
    node.addEventListener("click", () => {
      const state = globalThis.AraLearnTheme?.setPreference?.(node.dataset.themeChoice);
      syncThemeChoice(state?.preference || node.dataset.themeChoice);
    });
  });
  globalThis.addEventListener?.("aralearn:themechange", (event) => {
    syncThemeChoice(event.detail?.preference);
  });
  searchInput.addEventListener("input", () => {
    catalogQuery = searchInput.value.trim();
    globalThis.clearTimeout(searchInput._aralearnTimer);
    searchInput._aralearnTimer = globalThis.setTimeout(() => void load({ synchronizeBeforeRead: false }), 250);
  });

  return {
    open,
    openAuthoringAssistant() {
      return open("chatbot");
    },
    refresh: load,
    get opened() {
      return opened;
    }
  };
}
