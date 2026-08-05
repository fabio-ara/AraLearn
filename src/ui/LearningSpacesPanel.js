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
  hidden = false,
  data = {}
}) {
  const node = documentValue.createElement("button");
  node.type = "button";
  node.className = className;
  node.dataset.panelAction = action;
  node.title = label;
  node.setAttribute("aria-label", label);
  node.disabled = disabled;
  node.hidden = hidden;
  if (disabled) node.setAttribute("aria-disabled", "true");
  for (const [key, value] of Object.entries(data)) node.dataset[key] = value;
  node.innerHTML = icon(iconName);
  return node;
}

function menuButton(documentValue, options) {
  const node = button(documentValue, {
    ...options,
    className: `learning-spaces-context-menu-item${options.className?.includes("is-danger") ? " is-danger" : ""}`
  });
  const label = documentValue.createElement("span");
  label.textContent = options.label;
  node.innerHTML = icon(options.iconName);
  node.append(label);
  return node;
}

function contextualMenu(documentValue, {
  label,
  items,
  className = ""
}) {
  const availableItems = array(items).filter(Boolean);
  if (!availableItems.length) return null;
  const details = documentValue.createElement("details");
  details.className = `learning-spaces-context-menu learning-spaces-icon-menu ${className}`.trim();
  const summary = documentValue.createElement("summary");
  summary.className = "learning-spaces-context-menu-summary";
  summary.title = label;
  summary.setAttribute("aria-label", label);
  summary.innerHTML = icon("more");
  const list = documentValue.createElement("div");
  list.className = "learning-spaces-context-menu-list";
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", label);
  list.append(...availableItems);
  details.append(summary, list);
  return details;
}

function empty(documentValue, message) {
  const node = documentValue.createElement("p");
  node.className = "empty-state-copy";
  node.textContent = message;
  return node;
}

function trailOrigin(item) {
  if (item.kind === "plan") {
    return {
      key: "plan",
      iconName: "edit",
      description: "Planejamento privado em Trilhas"
    };
  }
  if (item.origin === "catalog") {
    return {
      key: "catalog",
      iconName: "folder",
      description: "Curso de Coleções selecionado em Trilhas"
    };
  }
  return {
    key: "private",
    iconName: "key",
    description: "Curso disponível somente em Trilhas"
  };
}

function value(object, ...names) {
  for (const name of names) {
    if (object?.[name] !== undefined && object?.[name] !== null) return object[name];
  }
  return null;
}

function integer(valueToRead) {
  const parsed = Number(valueToRead);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function includesQuery(valueToRead, query) {
  return text(valueToRead).toLocaleLowerCase("pt-BR").includes(query);
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
  let activeView = "organize";
  let trails = null;
  let collections = [];
  let managedCollections = [];
  let catalogManagementReady = false;
  let selectedWorkspace = null;
  let creatingTrailGroup = false;
  let editingTrailGroupId = "";
  let movingTrailCourseId = "";
  let creatingCatalogCollection = false;
  let editingCatalogCollectionId = "";
  let retiringCatalogCollectionId = "";
  let movingCatalogCourseId = "";
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
  let pendingFocusResolver = null;
  let returnFocusTarget = null;
  let renderEpoch = 0;
  let loadEpoch = 0;
  let collectionLoadEpoch = 0;

  root.innerHTML = `
    <section class="remote-library-overlay" data-learning-panel hidden aria-label="Painel">
      <div class="remote-library-backdrop" data-panel-close></div>
      <div class="remote-library-panel courses-home-screen" role="dialog" aria-modal="true" aria-label="Painel AraLearn">
        <header class="remote-library-header">
          <div class="remote-library-tab-row">
            <nav class="remote-library-tabs" role="tablist" aria-label="Painel">
              <button class="remote-library-tab is-active" type="button" role="tab" data-panel-view="organize" aria-selected="true">${icon("edit")}<span>Organizar</span></button>
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
            <details class="learning-spaces-context-menu learning-spaces-account-menu">
              <summary class="learning-spaces-context-menu-summary" role="button" aria-haspopup="menu" title="Conta" aria-label="Conta">${icon("more")}</summary>
              <div class="learning-spaces-context-menu-list" role="menu">
                <button class="learning-spaces-context-menu-item" type="button" role="menuitem" data-panel-action="signout" title="Sair" aria-label="Sair">${icon("sign-out")}<span>Sair</span></button>
                <button class="learning-spaces-context-menu-item is-danger" type="button" role="menuitem" data-panel-action="delete-account" title="Excluir conta" aria-label="Excluir conta">${icon("trash")}<span>Excluir conta</span></button>
              </div>
            </details>
          </div>
        </footer>
      </div>
    </section>
  `;

  const overlay = root.querySelector("[data-learning-panel]");
  const panel = root.querySelector(".remote-library-panel");
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

  function queueFocus(resolver) {
    pendingFocusResolver = typeof resolver === "function" ? resolver : null;
  }

  function panelAction(action, data = {}) {
    return [...content.querySelectorAll(`[data-panel-action="${action}"]`)]
      .find((node) => Object.entries(data).every(([key, expected]) => (
        node.dataset[key] === String(expected)
      ))) || null;
  }

  function queueActionFocus(action, data = {}, fallbackAction = "") {
    queueFocus(() => panelAction(action, data) || (fallbackAction ? panelAction(fallbackAction) : null));
  }

  function queueFormControlFocus(selector, name) {
    queueFocus(() => content.querySelector(selector)?.elements?.namedItem(name) || null);
  }

  function queueEntityFormControlFocus(selector, entityPath, name) {
    queueFocus(() => [...content.querySelectorAll(selector)]
      .find((form) => form.dataset.entityPath === entityPath)
      ?.elements?.namedItem(name) || null);
  }

  function closeOtherContextMenus(currentMenu = null) {
    content.querySelectorAll("details.learning-spaces-context-menu[open]").forEach((menu) => {
      if (menu !== currentMenu) menu.open = false;
    });
  }

  function applyPendingFocus() {
    if (busy || !pendingFocusResolver) return;
    const resolver = pendingFocusResolver;
    pendingFocusResolver = null;
    const target = resolver();
    if (typeof target?.focus === "function" && !target.hidden) {
      const menu = target.closest?.("details");
      if (menu) {
        closeOtherContextMenus(menu);
        menu.open = false;
        menu.querySelector(":scope > summary")?.focus();
      } else if (!target.disabled) {
        target.focus();
      }
    }
  }

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
    applyPendingFocus();
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
    if (!nextValue) {
      catalogManagementReady = false;
      managedCollections = [];
    }
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

  function panelFocusableElements() {
    return [...panel.querySelectorAll(
      'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
    )].filter((node) => {
      const closedDetails = node.closest("details:not([open])");
      const isClosedDetailsSummary = closedDetails
        && node.matches("summary")
        && node.parentElement === closedDetails;
      return !node.disabled
        && !node.hidden
        && !node.closest("[hidden]")
        && (!closedDetails || isClosedDetailsSummary)
        && node.tabIndex >= 0;
    });
  }

  function focusActiveTab() {
    root.querySelector(`[data-panel-view="${activeView}"]`)?.focus();
  }

  function restoreOpeningFocus() {
    const target = returnFocusTarget;
    returnFocusTarget = null;
    if (
      typeof target?.focus === "function"
      && target.isConnected !== false
      && !target.disabled
      && !target.hidden
    ) target.focus();
  }

  function currentStudyPaths() {
    try {
      return array(studyPathRepository?.loadStudyPaths?.());
    } catch {
      return [];
    }
  }

  function canMutateStudyPaths(...names) {
    return typeof studyPathRepository?.flush === "function"
      && names.every((name) => typeof studyPathRepository?.[name] === "function");
  }

  function renderCourseGroup({
    id,
    kind,
    title,
    entries = [],
    menuItems = [],
    form = null,
    emptyMessage = "Sem cursos."
  }) {
    const section = documentValue.createElement("section");
    section.className = `remote-course-group learning-spaces-outline-group is-${kind}`;
    section.dataset.courseGroupId = id;
    section.dataset.courseGroupKind = kind;
    const heading = documentValue.createElement("header");
    heading.className = "remote-course-group-heading learning-spaces-outline-group-heading";
    const titleRow = documentValue.createElement("div");
    titleRow.className = "remote-course-group-title-row learning-spaces-outline-group-title";
    const headingTitle = documentValue.createElement("h2");
    headingTitle.textContent = title;
    const count = documentValue.createElement("span");
    count.className = "remote-course-group-count";
    count.textContent = String(entries.length);
    count.title = `${entries.length} ${entries.length === 1 ? "item" : "itens"}`;
    count.setAttribute("aria-label", count.title);
    titleRow.append(headingTitle, count);
    heading.append(titleRow);
    const menu = contextualMenu(documentValue, {
      label: `Ações de ${title}`,
      items: menuItems,
      className: "learning-spaces-outline-group-menu"
    });
    if (menu) heading.append(menu);
    section.append(heading);
    if (form) section.append(form);
    const list = documentValue.createElement("div");
    list.className = "remote-course-group-list learning-spaces-outline-list";
    list.setAttribute("role", "list");
    entries.forEach((entry) => list.append(entry));
    if (!entries.length) {
      const emptyItem = empty(documentValue, emptyMessage);
      emptyItem.setAttribute("role", "listitem");
      list.append(emptyItem);
    }
    section.append(list);
    return section;
  }

  function renderTrailGroupForm(path = null) {
    const form = documentValue.createElement("form");
    form.className = "remote-group-form learning-spaces-inline-form";
    form.dataset.trailGroupForm = path ? "rename" : "create";
    if (path) form.dataset.pathId = path.id;
    const input = documentValue.createElement("input");
    input.name = "title";
    input.required = true;
    input.maxLength = 120;
    input.value = path?.title || "";
    input.placeholder = "Nome do grupo";
    input.setAttribute("aria-label", path ? `Novo nome de ${path.title}` : "Nome do novo grupo");
    const actions = documentValue.createElement("div");
    actions.className = "remote-central-item-actions";
    actions.append(
      button(documentValue, {
        action: path ? "cancel-trail-group-edit" : "cancel-trail-group-create",
        iconName: "remove-state",
        label: "Cancelar"
      }),
      button(documentValue, {
        action: path ? "submit-trail-group-edit" : "submit-trail-group-create",
        iconName: "save",
        label: "Salvar",
        className: "open-main"
      })
    );
    form.append(input, actions);
    return form;
  }

  function renderTrailCourseChooser(item, paths, currentPathId = "") {
    const form = documentValue.createElement("form");
    form.className = "remote-group-choice-form learning-spaces-inline-form";
    form.dataset.trailCourseGroupForm = item.courseId;
    const select = documentValue.createElement("select");
    select.name = "pathId";
    select.required = true;
    select.setAttribute("aria-label", `Grupo de ${item.title}`);
    const loose = documentValue.createElement("option");
    loose.value = "__others__";
    loose.textContent = "Outros";
    loose.selected = !currentPathId;
    select.append(loose);
    paths.forEach((path) => {
      const option = documentValue.createElement("option");
      option.value = path.id;
      option.textContent = path.title || "Grupo";
      option.selected = path.id === currentPathId;
      select.append(option);
    });
    const actions = documentValue.createElement("div");
    actions.className = "remote-central-item-actions";
    actions.append(
      button(documentValue, {
        action: "cancel-trail-course-move",
        iconName: "remove-state",
        label: "Cancelar"
      }),
      button(documentValue, {
        action: "submit-trail-course-move",
        iconName: "save",
        label: "Mover",
        className: "open-main"
      })
    );
    form.append(select, actions);
    return form;
  }

  function renderOrganizerItem(item, { paths = [], path = null, pathItem = null, index = 0, count = 0 } = {}) {
    const origin = trailOrigin(item);
    const row = documentValue.createElement("article");
    row.className = `learning-spaces-outline-item learning-spaces-organizer-item is-origin-${origin.key}`;
    row.setAttribute("role", "listitem");
    row.dataset.trailItemId = item.itemId;
    row.dataset.courseOrigin = origin.key;
    const identity = documentValue.createElement("div");
    identity.className = "learning-spaces-outline-item-identity";
    const heading = documentValue.createElement("h3");
    heading.textContent = item.title;
    const originLabel = documentValue.createElement("span");
    originLabel.className = "remote-course-origin learning-spaces-outline-item-kind";
    originLabel.innerHTML = icon(origin.iconName);
    originLabel.title = origin.description;
    originLabel.setAttribute("aria-label", origin.description);
    identity.append(heading, originLabel);
    const menuItems = [];
    if (path && pathItem && canMutateStudyPaths("moveCourseInStudyPath")) {
      menuItems.push(
        menuButton(documentValue, {
          action: "move-trail-course-up",
          iconName: "arrow-up",
          label: `Mover ${item.title} para cima`,
          disabled: index === 0,
          data: { pathItemId: pathItem.id }
        }),
        menuButton(documentValue, {
          action: "move-trail-course-down",
          iconName: "arrow-down",
          label: `Mover ${item.title} para baixo`,
          disabled: index >= count - 1,
          data: { pathItemId: pathItem.id }
        })
      );
    }
    if (
      item.courseId
      && paths.length
      && canMutateStudyPaths("addCourseToStudyPath", "removeCourseFromStudyPath")
    ) {
      menuItems.push(menuButton(documentValue, {
        action: "choose-trail-course-group",
        iconName: "trail",
        label: path ? "Mover para outro grupo" : "Adicionar a um grupo",
        data: { courseId: item.courseId }
      }));
    }
    if (pathItem && canMutateStudyPaths("removeCourseFromStudyPath")) {
      menuItems.push(menuButton(documentValue, {
        action: "detach-trail-course-group",
        iconName: "remove-state",
        label: "Retirar do grupo",
        data: { pathItemId: pathItem.id }
      }));
    }
    if (item.workspaceId) {
      menuItems.push(menuButton(documentValue, {
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
      menuItems.push(menuButton(documentValue, {
        action: "create-course-workspace",
        iconName: "folder",
        label: "Organizar curso",
        data: { courseId: item.courseId, title: item.title }
      }));
    }
    if (
      item.kind === "course"
      && item.selectionId
      && item.courseId
      && item.contentHash
    ) {
      const removesPrivateCourse = origin.key === "private";
      menuItems.push(menuButton(documentValue, {
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
      menuItems.push(menuButton(documentValue, {
        action: "remove-course-from-catalog",
        iconName: "trash",
        label: "Retirar de Coleções",
        className: "icon-ghost is-danger",
        data: { courseId: item.courseId, title: item.title }
      }));
    } else if (!item.courseId && item.workspaceId) {
      menuItems.push(menuButton(documentValue, {
        action: "delete-workspace",
        iconName: "trash",
        label: item.kind === "plan" ? "Excluir plano" : "Excluir plano de autoria",
        disabled: !item.canDelete,
        data: { workspaceId: item.workspaceId, title: item.title }
      }));
    }
    row.append(identity);
    const menu = contextualMenu(documentValue, {
      label: `Ações de ${item.title}`,
      items: menuItems,
      className: "learning-spaces-outline-item-menu"
    });
    if (menu) row.append(menu);
    if (movingTrailCourseId === item.courseId) {
      row.append(renderTrailCourseChooser(item, paths, path?.id || ""));
    }
    return row;
  }

  function renderOrganizer() {
    const section = documentValue.createElement("section");
    section.className = "remote-library-view remote-central-view learning-spaces-organizer";
    section.setAttribute("aria-label", "Organizar");
    if (canMutateStudyPaths("createStudyPath")) {
      const head = documentValue.createElement("div");
      head.className = "remote-library-section-heading learning-spaces-organizer-heading";
      head.append(button(documentValue, {
        action: "create-trail-group",
        iconName: "add",
        label: "Criar grupo",
        className: "learning-spaces-create-trail-group"
      }));
      section.append(head);
    }
    if (creatingTrailGroup) section.append(renderTrailGroupForm());

    const paths = currentStudyPaths();
    const trailItems = array(trails?.items);
    const itemsByCourseId = new Map(trailItems
      .filter((item) => item.courseId)
      .map((item) => [item.courseId, item]));
    const assignedItemIds = new Set();
    paths.forEach((path, pathIndex) => {
      const pathEntries = array(path.courses).flatMap((pathItem) => {
        const courseId = text(pathItem.persistentCourseId || pathItem.courseId);
        const item = itemsByCourseId.get(courseId);
        if (!item || assignedItemIds.has(item.itemId)) return [];
        assignedItemIds.add(item.itemId);
        return [{ item, pathItem }];
      });
      const menuItems = [];
      if (canMutateStudyPaths("moveStudyPath")) {
        menuItems.push(
          menuButton(documentValue, {
            action: "move-trail-group-up",
            iconName: "arrow-up",
            label: `Mover ${path.title || "grupo"} para cima`,
            disabled: pathIndex === 0,
            data: { pathId: path.id }
          }),
          menuButton(documentValue, {
            action: "move-trail-group-down",
            iconName: "arrow-down",
            label: `Mover ${path.title || "grupo"} para baixo`,
            disabled: pathIndex >= paths.length - 1,
            data: { pathId: path.id }
          })
        );
      }
      if (canMutateStudyPaths("renameStudyPath")) {
        menuItems.push(menuButton(documentValue, {
          action: "edit-trail-group",
          iconName: "edit",
          label: `Renomear ${path.title || "grupo"}`,
          data: { pathId: path.id }
        }));
      }
      if (canMutateStudyPaths("deleteStudyPath")) {
        menuItems.push(menuButton(documentValue, {
          action: "delete-trail-group",
          iconName: "trash",
          label: `Excluir ${path.title || "grupo"}`,
          className: "icon-ghost is-danger",
          data: { pathId: path.id, title: path.title || "Grupo" }
        }));
      }
      section.append(renderCourseGroup({
        id: path.id,
        kind: "trail",
        title: path.title || "Grupo",
        entries: pathEntries.map(({ item, pathItem }, index) => renderOrganizerItem(item, {
          paths,
          path,
          pathItem,
          index,
          count: pathEntries.length
        })),
        menuItems,
        form: editingTrailGroupId === path.id ? renderTrailGroupForm(path) : null
      }));
    });
    const looseItems = trailItems.filter((item) => !assignedItemIds.has(item.itemId));
    section.append(renderCourseGroup({
      id: "others",
      kind: "trail",
      title: "Outros",
      entries: looseItems.map((item) => renderOrganizerItem(item, { paths })),
      emptyMessage: paths.length ? "Sem itens." : "Nenhum plano ou curso."
    }));
    return section;
  }

  function renderWorkspaceObservationPanel({
    entityType,
    entityPath,
    title = "",
    resourceTargetId = "",
    detached = false
  }) {
    const pathKey = JSON.stringify(entityPath);
    const notePanel = documentValue.createElement("section");
    notePanel.className = "remote-observation-panel learning-spaces-inline-panel" +
      (detached ? " is-contextual-target" : "");
    if (detached) {
      const heading = documentValue.createElement("h3");
      heading.textContent = title || "Observações";
      notePanel.append(heading);
    }
    const form = documentValue.createElement("form");
    form.className = "remote-workspace-metadata-form remote-observation-form learning-spaces-inline-form";
    form.dataset.observationForm = "true";
    form.dataset.entityType = entityType;
    form.dataset.entityPath = pathKey;
    if (resourceTargetId) form.dataset.resourceTargetId = resourceTargetId;
    const input = documentValue.createElement("textarea");
    input.name = "body";
    input.required = true;
    input.maxLength = 2000;
    input.rows = 2;
    input.placeholder = "Observação";
    input.setAttribute("aria-label", `Observação sobre ${title || entityType}`);
    const formActions = documentValue.createElement("div");
    formActions.className = "remote-central-item-actions";
    formActions.append(
      button(documentValue, { action: "cancel-observation", iconName: "remove-state", label: "Fechar" }),
      button(documentValue, { action: "submit-observation", iconName: "save", label: "Salvar", className: "open-main" })
    );
    form.append(input, formActions);
    notePanel.append(form);
    observations
      .filter((note) =>
        JSON.stringify(note.entityPath || []) === pathKey &&
        text(note.resourceTargetId) === text(resourceTargetId)
      )
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
    return notePanel;
  }

  function renderWorkspaceTree(workspace) {
    const section = documentValue.createElement("section");
    section.className = "remote-library-view remote-workspace-view learning-spaces-workspace-outline";
    const head = documentValue.createElement("div");
    head.className = "remote-library-section-heading remote-workspace-heading";
    head.append(
      button(documentValue, { action: "back-to-organize", iconName: "arrow-left", label: "Voltar" }),
      Object.assign(documentValue.createElement("h2"), { textContent: workspace.title || "Plano" })
    );
    section.append(head);
    if (observingEntity && ["card", "resource"].includes(observingEntity.entityType)) {
      section.append(renderWorkspaceObservationPanel({
        entityType: observingEntity.entityType,
        entityPath: JSON.parse(observingEntity.pathKey),
        title: observingEntity.title,
        resourceTargetId: observingEntity.resourceTargetId,
        detached: true
      }));
    }
    const contentValue = workspace.content || {};
    const access = workspace.access || {};
    const canAuthor = access.author === true;
    const canComment = access.comment === true;
    const canManage = access.manage === true;
    const courses = array(contentValue.courses);
    const list = documentValue.createElement("div");
    list.className = "remote-workspace-tree learning-spaces-outline-list";
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", `Conteúdo de ${workspace.title || "Plano"}`);
    const appendEntity = (entity, level, parent, path, position, siblingCount) => {
      const row = documentValue.createElement("article");
      row.className = `remote-workspace-tree-item learning-spaces-outline-item learning-spaces-workspace-item is-${level}`;
      row.setAttribute("role", "listitem");
      row.dataset.entityPath = JSON.stringify(path);
      const entityTitle = entity.title || entity.id || level;
      const headingLevel = { course: 3, module: 4, lesson: 5, microsequence: 6 }[level] || 3;
      const title = documentValue.createElement(`h${headingLevel}`);
      title.setAttribute("aria-level", String(headingLevel));
      title.textContent = entityTitle;
      const menuItems = [
        menuButton(documentValue, {
          action: "move-entity-up", iconName: "arrow-up", label: `Mover ${entityTitle} para cima`,
          disabled: !canAuthor || position === 0,
          data: { entityType: level, entityPath: JSON.stringify(path), position: String(position - 1) }
        }),
        menuButton(documentValue, {
          action: "move-entity-down", iconName: "arrow-down", label: `Mover ${entityTitle} para baixo`,
          disabled: !canAuthor || position >= siblingCount - 1,
          data: { entityType: level, entityPath: JSON.stringify(path), position: String(position + 1) }
        }),
        menuButton(documentValue, {
          action: "edit-workspace-entity", iconName: "edit", label: `Editar ${entityTitle}`,
          disabled: !canAuthor,
          data: {
            entityType: level,
            entityPath: JSON.stringify(path),
            title: entity.title || "",
            goal: entity.goal || ""
          }
        }),
        menuButton(documentValue, {
          action: "observe-workspace-entity", iconName: "review", label: `Observar ${entityTitle}`,
          disabled: !canComment,
          data: { entityType: level, entityPath: JSON.stringify(path), title: entity.title || "" }
        }),
        menuButton(documentValue, {
          action: "delete-workspace-entity", iconName: "trash", label: `Excluir ${entityTitle}`,
          className: "icon-ghost is-danger",
          disabled: !canManage,
          data: { entityType: level, entityPath: JSON.stringify(path), title: entity.title || "" }
        })
      ];
      row.append(title, contextualMenu(documentValue, {
        label: `Ações de ${entityTitle}`,
        items: menuItems,
        className: "learning-spaces-workspace-item-menu"
      }));
      parent.append(row);
      if (editingEntity?.pathKey === JSON.stringify(path)) {
        const form = documentValue.createElement("form");
        form.className = "remote-workspace-metadata-form remote-entity-form learning-spaces-inline-form";
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
        row.append(form);
      }
      if (observingEntity?.pathKey === JSON.stringify(path)) {
        row.append(renderWorkspaceObservationPanel({
          entityType: level,
          entityPath: path,
          title: entity.title || level
        }));
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
    if (!courses.length) {
      const emptyItem = empty(documentValue, "Plano vazio.");
      emptyItem.setAttribute("role", "listitem");
      list.append(emptyItem);
    }
    section.append(list);
    return section;
  }

  function catalogGroupsForRender({ applyQuery = true } = {}) {
    const publicRows = array(collections);
    const publicByCourseId = new Map(publicRows
      .filter((row) => value(row, "course_id", "courseId"))
      .map((row) => [text(value(row, "course_id", "courseId")).toLowerCase(), row]));
    let groups;
    const useManagedCatalog = authenticatedCapabilities.catalogManage && catalogManagementReady;
    if (useManagedCatalog) {
      groups = array(managedCollections).map((group) => ({
        collectionId: text(group.collectionId).toLowerCase(),
        contractKey: text(group.contractKey).trim().toLowerCase(),
        title: text(group.title) || "Coleção",
        description: text(group.description),
        position: integer(group.position),
        revision: integer(group.revision),
        courseCount: integer(group.courseCount),
        courses: array(group.courses).map((course) => {
          const courseId = text(course.courseId).toLowerCase();
          const publicRow = publicByCourseId.get(courseId) || {};
          return {
            ...course,
            courseId,
            title: text(course.title) || "Curso",
            goal: text(course.goal),
            contentHash: text(course.contentHash || value(publicRow, "content_hash", "contentHash")),
            selectionId: text(value(publicRow, "selection_id", "selectionId")).toLowerCase(),
            isSelected: value(publicRow, "is_selected", "isSelected") === true,
            moduleCount: integer(course.moduleCount),
            lessonCount: integer(course.lessonCount),
            position: integer(course.position),
            placementRevision: integer(course.placementRevision)
          };
        })
      }));
    } else {
      const byId = new Map();
      publicRows.forEach((row) => {
        const collectionId = text(value(row, "collection_id", "collectionId")).toLowerCase();
        if (!collectionId) return;
        if (!byId.has(collectionId)) {
          byId.set(collectionId, {
            collectionId,
            contractKey: text(value(row, "collection_contract_key", "collectionContractKey")).trim().toLowerCase(),
            title: text(value(row, "collection_title", "collectionTitle")) || "Coleção",
            description: text(value(row, "collection_description", "collectionDescription")),
            position: integer(value(row, "collection_position", "collectionPosition")),
            revision: 0,
            courseCount: 0,
            courses: []
          });
        }
        const courseId = text(value(row, "course_id", "courseId")).toLowerCase();
        if (!courseId) return;
        byId.get(collectionId).courses.push({
          courseId,
          title: text(value(row, "course_title", "courseTitle", "title")) || "Curso",
          goal: text(value(row, "goal", "description")),
          contentHash: text(value(row, "content_hash", "contentHash")),
          selectionId: text(value(row, "selection_id", "selectionId")).toLowerCase(),
          isSelected: value(row, "is_selected", "isSelected") === true,
          moduleCount: integer(value(row, "module_count", "moduleCount")),
          lessonCount: integer(value(row, "lesson_count", "lessonCount")),
          position: byId.get(collectionId).courses.length,
          placementRevision: 0
        });
      });
      groups = [...byId.values()].map((group) => ({
        ...group,
        courseCount: group.courses.length
      }));
    }

    const query = catalogQuery.toLocaleLowerCase("pt-BR");
    if (applyQuery && query && useManagedCatalog) {
      groups = groups.flatMap((group) => {
        if (includesQuery(group.title, query) || includesQuery(group.description, query)) return [group];
        const courses = group.courses.filter((course) =>
          includesQuery(course.title, query) || includesQuery(course.goal, query)
        );
        return courses.length ? [{ ...group, courses }] : [];
      });
    }
    return groups.sort((left, right) => left.position - right.position || left.title.localeCompare(right.title, "pt-BR"));
  }

  function renderCatalogCollectionForm(group = null) {
    const form = documentValue.createElement("form");
    form.className = "remote-group-form learning-spaces-inline-form";
    form.dataset.catalogCollectionForm = group ? "rename" : "create";
    if (group) form.dataset.collectionId = group.collectionId;
    const input = documentValue.createElement("input");
    input.name = "title";
    input.required = true;
    input.maxLength = 160;
    input.value = group?.title || "";
    input.placeholder = "Nome da Coleção";
    input.setAttribute("aria-label", group ? `Novo nome de ${group.title}` : "Nome da nova Coleção");
    const actions = documentValue.createElement("div");
    actions.className = "remote-central-item-actions";
    actions.append(
      button(documentValue, {
        action: group ? "cancel-catalog-collection-edit" : "cancel-catalog-collection-create",
        iconName: "remove-state",
        label: "Cancelar"
      }),
      button(documentValue, {
        action: group ? "submit-catalog-collection-edit" : "submit-catalog-collection-create",
        iconName: "save",
        label: "Salvar",
        className: "open-main"
      })
    );
    form.append(input, actions);
    return form;
  }

  function renderNewCatalogCollectionGroup() {
    const section = documentValue.createElement("section");
    section.className = "remote-course-group learning-spaces-outline-group is-catalog learning-spaces-new-collection";
    section.dataset.newCatalogCollection = "true";
    section.setAttribute("aria-label", "Nova Coleção");
    const heading = documentValue.createElement("header");
    heading.className = "remote-course-group-heading learning-spaces-outline-group-heading learning-spaces-new-collection-heading";
    const form = renderCatalogCollectionForm();
    form.classList.add("learning-spaces-new-collection-form");
    heading.append(form);
    section.append(heading);
    return section;
  }

  function renderCatalogRetireForm(group, groups) {
    const form = documentValue.createElement("form");
    form.className = "remote-group-choice-form learning-spaces-inline-form";
    form.dataset.catalogCollectionRetireForm = group.collectionId;
    const select = documentValue.createElement("select");
    select.name = "replacementCollectionId";
    select.required = true;
    select.setAttribute("aria-label", `Destino dos cursos de ${group.title}`);
    const placeholder = documentValue.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Mover cursos para…";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);
    groups.filter((candidate) => candidate.collectionId !== group.collectionId).forEach((candidate) => {
      const option = documentValue.createElement("option");
      option.value = candidate.collectionId;
      option.textContent = candidate.title;
      select.append(option);
    });
    const actions = documentValue.createElement("div");
    actions.className = "remote-central-item-actions";
    actions.append(
      button(documentValue, {
        action: "cancel-catalog-collection-retire",
        iconName: "remove-state",
        label: "Cancelar"
      }),
      button(documentValue, {
        action: "submit-catalog-collection-retire",
        iconName: "trash",
        label: "Retirar Coleção",
        className: "icon-ghost is-danger"
      })
    );
    form.append(select, actions);
    return form;
  }

  function renderCatalogCourseChooser(course, groups, currentCollectionId) {
    const form = documentValue.createElement("form");
    form.className = "remote-group-choice-form learning-spaces-inline-form";
    form.dataset.catalogCourseMoveForm = course.courseId;
    const select = documentValue.createElement("select");
    select.name = "targetCollectionId";
    select.required = true;
    select.setAttribute("aria-label", `Nova Coleção de ${course.title}`);
    const placeholder = documentValue.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Mover para…";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.append(placeholder);
    groups.filter((group) => group.collectionId !== currentCollectionId).forEach((group) => {
      const option = documentValue.createElement("option");
      option.value = group.collectionId;
      option.textContent = group.title;
      select.append(option);
    });
    const actions = documentValue.createElement("div");
    actions.className = "remote-central-item-actions";
    actions.append(
      button(documentValue, {
        action: "cancel-catalog-course-move",
        iconName: "remove-state",
        label: "Cancelar"
      }),
      button(documentValue, {
        action: "submit-catalog-course-move",
        iconName: "save",
        label: "Mover",
        className: "open-main"
      })
    );
    form.append(select, actions);
    return form;
  }

  function renderCatalogCourse(course, group, groups, index, { allowReorder = true } = {}) {
    const row = documentValue.createElement("article");
    row.className = "remote-catalog-course-card learning-spaces-outline-item learning-spaces-catalog-item is-origin-catalog";
    row.setAttribute("role", "listitem");
    row.dataset.courseOrigin = "catalog";
    row.dataset.courseSelected = String(course.isSelected);
    const identity = documentValue.createElement("div");
    identity.className = "learning-spaces-outline-item-identity";
    const title = documentValue.createElement("h3");
    title.textContent = course.title;
    identity.append(title);
    const menuItems = [];
    let primaryAction;
    if (course.isSelected && course.selectionId && course.contentHash) {
      menuItems.push(menuButton(documentValue, {
        action: "remove-course-from-trails",
        iconName: "review",
        label: "Retirar de Trilhas",
        data: {
          selectionId: course.selectionId,
          courseId: course.courseId,
          contentHash: course.contentHash,
          title: course.title
        }
      }));
    } else if (!course.isSelected) {
      primaryAction = button(documentValue, {
        action: "add-course-to-trails",
        iconName: "add",
        label: "Adicionar a Trilhas",
        className: "learning-spaces-catalog-primary-action open-main",
        data: { courseId: course.courseId, title: course.title }
      });
    }
    if (course.isSelected) {
      primaryAction = button(documentValue, {
        action: "open-course",
        iconName: "play",
        label: "Abrir curso",
        className: "learning-spaces-catalog-primary-action open-main",
        data: { courseId: course.courseId, courseKey: "", selected: "true" }
      });
    }
    if (authenticatedCapabilities.catalogManage && catalogManagementReady) {
      if (allowReorder) {
        menuItems.push(
          menuButton(documentValue, {
            action: "move-catalog-course-up",
            iconName: "arrow-up",
            label: `Mover ${course.title} para cima`,
            disabled: index === 0,
            data: {
              courseId: course.courseId,
              placementRevision: String(course.placementRevision),
              collectionId: group.collectionId,
              position: String(index - 1)
            }
          }),
          menuButton(documentValue, {
            action: "move-catalog-course-down",
            iconName: "arrow-down",
            label: `Mover ${course.title} para baixo`,
            disabled: index >= group.courses.length - 1,
            data: {
              courseId: course.courseId,
              placementRevision: String(course.placementRevision),
              collectionId: group.collectionId,
              position: String(index + 1)
            }
          })
        );
      }
      if (groups.length > 1) {
        menuItems.push(menuButton(documentValue, {
          action: "choose-catalog-course-collection",
          iconName: "folder",
          label: "Mover para outra Coleção",
          data: { courseId: course.courseId }
        }));
      }
      menuItems.push(menuButton(documentValue, {
        action: "create-course-workspace",
        iconName: "edit",
        label: "Organizar curso",
        data: { courseId: course.courseId, title: course.title }
      }));
      menuItems.push(menuButton(documentValue, {
        action: "remove-course-from-catalog",
        iconName: "trash",
        label: "Retirar de Coleções",
        className: "icon-ghost is-danger",
        data: { courseId: course.courseId, title: course.title }
      }));
    }
    row.append(identity);
    const menu = contextualMenu(documentValue, {
      label: `Ações de ${course.title}`,
      items: menuItems,
      className: "learning-spaces-catalog-item-menu"
    });
    if (menu) row.append(menu);
    if (primaryAction) row.append(primaryAction);
    if (movingCatalogCourseId === course.courseId) {
      row.append(renderCatalogCourseChooser(course, groups, group.collectionId));
    }
    return row;
  }

  function renderCollections() {
    const section = documentValue.createElement("section");
    section.className = "remote-library-view remote-central-view remote-library-collections learning-spaces-collections";
    section.setAttribute("aria-label", "Coleções");
    const head = documentValue.createElement("div");
    head.className = "remote-library-section-heading learning-spaces-collections-heading";
    if (authenticatedCapabilities.catalogManage && catalogManagementReady) {
      const create = button(documentValue, {
        action: "create-catalog-collection",
        iconName: "add",
        label: "Criar Coleção",
        className: "learning-spaces-create-collection"
      });
      create.innerHTML = `${icon("add")}<span>Criar Coleção</span>`;
      head.append(create);
    }
    if (head.childElementCount) section.append(head);
    if (creatingCatalogCollection) section.append(renderNewCatalogCollectionGroup());
    const allGroups = catalogGroupsForRender({ applyQuery: false });
    const groups = catalogGroupsForRender();
    const movableGroups = allGroups.filter((group) => group.contractKey !== "outros");
    const filtering = Boolean(catalogQuery.trim());
    groups.forEach((group) => {
      const movableIndex = movableGroups.findIndex((candidate) => candidate.collectionId === group.collectionId);
      const isStructural = group.contractKey === "outros";
      if (isStructural && !group.courses.length && !catalogManagementReady) return;
      const hasRetirementDestination = allGroups.some(
        (candidate) => candidate.collectionId !== group.collectionId
      );
      const menuItems = authenticatedCapabilities.catalogManage && catalogManagementReady && !isStructural ? [
        menuButton(documentValue, {
          action: "move-catalog-collection-up",
          iconName: "arrow-up",
          label: `Mover ${group.title} para cima`,
          hidden: filtering,
          disabled: movableIndex <= 0,
          data: {
            collectionId: group.collectionId,
            revision: String(group.revision)
          }
        }),
        menuButton(documentValue, {
          action: "move-catalog-collection-down",
          iconName: "arrow-down",
          label: `Mover ${group.title} para baixo`,
          hidden: filtering,
          disabled: movableIndex < 0 || movableIndex >= movableGroups.length - 1,
          data: {
            collectionId: group.collectionId,
            revision: String(group.revision)
          }
        }),
        menuButton(documentValue, {
          action: "edit-catalog-collection",
          iconName: "edit",
          label: `Renomear ${group.title}`,
          data: { collectionId: group.collectionId }
        }),
        menuButton(documentValue, {
          action: "retire-catalog-collection",
          iconName: "trash",
          label: group.courseCount && !hasRetirementDestination
            ? "Crie outra Coleção antes de retirar esta"
            : `Retirar ${group.title}`,
          className: "icon-ghost is-danger",
          disabled: group.courseCount > 0 && !hasRetirementDestination,
          data: {
            collectionId: group.collectionId,
            title: group.title,
            revision: String(group.revision),
            courseCount: String(group.courseCount)
          }
        })
      ] : [];
      let form = null;
      if (editingCatalogCollectionId === group.collectionId) {
        form = renderCatalogCollectionForm(group);
      } else if (retiringCatalogCollectionId === group.collectionId) {
        form = renderCatalogRetireForm(group, allGroups);
      }
      section.append(renderCourseGroup({
        id: group.collectionId,
        kind: "catalog",
        title: group.title,
        entries: group.courses.map((course, index) => renderCatalogCourse(
          course,
          group,
          allGroups,
          index,
          { allowReorder: !filtering }
        )),
        menuItems: menuItems.filter((action) => !action.hidden),
        form
      }));
    });
    if (!groups.length && !creatingCatalogCollection) {
      section.append(empty(documentValue, "Nenhum resultado."));
    }
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
        content.append(selectedWorkspace ? renderWorkspaceTree(selectedWorkspace) : renderOrganizer());
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
    const collectionEpoch = ++collectionLoadEpoch;
    const operation = beginBusy("Consultando…");
    try {
      if (synchronizeBeforeRead) await beforeRemoteRead();
      const trailResult = await spaces.loadTrails();
      if (epoch !== loadEpoch || !opened) return;
      trails = trailResult.page;
      await applyAuthenticatedCapabilities(trails, { trusted: trailResult.stale !== true });
      let catalogWarning = "";
      if (activeView === "collections") {
        const nextCollections = await catalog.listCollections(catalogQuery);
        if (epoch !== loadEpoch || collectionEpoch !== collectionLoadEpoch || !opened) return;
        collections = nextCollections;
        catalogManagementReady = false;
        managedCollections = [];
        if (authenticatedCapabilities.catalogManage) {
          try {
            const nextManagedCollections = await spaces.loadManagedCatalog();
            if (epoch !== loadEpoch || collectionEpoch !== collectionLoadEpoch || !opened) return;
            managedCollections = nextManagedCollections;
            catalogManagementReady = true;
          } catch (error) {
            catalogWarning = error instanceof Error
              ? error.message
              : "A administração de Coleções está indisponível.";
          }
        }
      }
      reportStatus(catalogWarning || (trailResult.stale ? "Último estado disponível." : ""));
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

  async function completeTrailGroupMutation() {
    await studyPathRepository.flush();
    await onStudyPathsChanged();
    await load();
  }

  async function createTrailGroup(form) {
    const title = text(new FormData(form).get("title")).trim();
    if (!title) return;
    const operation = beginBusy("Criando…");
    try {
      await studyPathRepository.createStudyPath(title);
      creatingTrailGroup = false;
      queueActionFocus("create-trail-group");
      await completeTrailGroupMutation();
    } catch (error) {
      queueFormControlFocus('[data-trail-group-form="create"]', "title");
      reportStatus(error instanceof Error ? error.message : "Não foi possível criar o grupo.");
    } finally {
      endBusy(operation);
    }
  }

  async function refreshCollectionsForSearch() {
    const epoch = ++collectionLoadEpoch;
    const query = catalogQuery;
    try {
      const nextCollections = await catalog.listCollections(query);
      if (
        epoch !== collectionLoadEpoch
        || query !== catalogQuery
        || activeView !== "collections"
        || !opened
      ) return;
      collections = nextCollections;
      await renderActive();
    } catch (error) {
      if (epoch !== collectionLoadEpoch || query !== catalogQuery || !opened) return;
      reportStatus(error instanceof Error ? error.message : "Não foi possível pesquisar em Coleções.");
    }
  }

  async function renameTrailGroup(form) {
    const title = text(new FormData(form).get("title")).trim();
    if (!title) return;
    const operation = beginBusy("Salvando…");
    try {
      await studyPathRepository.renameStudyPath(form.dataset.pathId, title);
      editingTrailGroupId = "";
      queueActionFocus("edit-trail-group", { pathId: form.dataset.pathId });
      await completeTrailGroupMutation();
    } catch (error) {
      queueFormControlFocus(
        `[data-trail-group-form="rename"][data-path-id="${form.dataset.pathId}"]`,
        "title"
      );
      reportStatus(error instanceof Error ? error.message : "Não foi possível renomear o grupo.");
    } finally {
      endBusy(operation);
    }
  }

  async function moveTrailGroup(pathId, direction) {
    const operation = beginBusy("Movendo…");
    try {
      await studyPathRepository.moveStudyPath(pathId, direction);
      await completeTrailGroupMutation();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível mover o grupo.");
    } finally {
      endBusy(operation);
    }
  }

  async function deleteTrailGroup(pathId, title) {
    if (!globalThis.confirm?.(`Excluir o grupo "${title || "Grupo"}"? Os cursos serão mantidos em Outros.`)) return;
    const operation = beginBusy("Excluindo…");
    try {
      await studyPathRepository.deleteStudyPath(pathId);
      editingTrailGroupId = "";
      movingTrailCourseId = "";
      await completeTrailGroupMutation();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível excluir o grupo.");
    } finally {
      endBusy(operation);
    }
  }

  async function moveTrailCourseInGroup(pathItemId, direction) {
    const operation = beginBusy("Movendo…");
    try {
      await studyPathRepository.moveCourseInStudyPath(pathItemId, direction);
      await completeTrailGroupMutation();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível mover o curso.");
    } finally {
      endBusy(operation);
    }
  }

  async function detachTrailCourse(pathItemId) {
    const operation = beginBusy("Movendo…");
    try {
      await studyPathRepository.removeCourseFromStudyPath(pathItemId);
      movingTrailCourseId = "";
      await completeTrailGroupMutation();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível retirar o curso do grupo.");
    } finally {
      endBusy(operation);
    }
  }

  async function moveTrailCourseToGroup(form) {
    const data = new FormData(form);
    const courseId = form.dataset.trailCourseGroupForm;
    const pathId = text(data.get("pathId"));
    const operation = beginBusy("Movendo…");
    try {
      if (pathId === "__others__") {
        const pathItem = currentStudyPaths()
          .flatMap((path) => array(path.courses))
          .find((item) => text(item.persistentCourseId || item.courseId) === courseId);
        if (pathItem) await studyPathRepository.removeCourseFromStudyPath(pathItem.id);
      } else {
        await studyPathRepository.addCourseToStudyPath(pathId, courseId);
      }
      movingTrailCourseId = "";
      queueActionFocus("choose-trail-course-group", { courseId });
      await completeTrailGroupMutation();
    } catch (error) {
      queueFormControlFocus(`[data-trail-course-group-form="${courseId}"]`, "pathId");
      reportStatus(error instanceof Error ? error.message : "Não foi possível mover o curso.");
    } finally {
      endBusy(operation);
    }
  }

  async function refreshCatalogAfterMutation() {
    editingCatalogCollectionId = "";
    retiringCatalogCollectionId = "";
    movingCatalogCourseId = "";
    await load({ synchronizeBeforeRead: false });
  }

  async function createCatalogCollection(form) {
    const title = text(new FormData(form).get("title")).trim();
    if (!title) return;
    const operation = beginBusy("Criando…");
    try {
      await spaces.createCatalogCollection({ title });
      creatingCatalogCollection = false;
      queueActionFocus("create-catalog-collection");
      await refreshCatalogAfterMutation();
    } catch (error) {
      queueFormControlFocus('[data-catalog-collection-form="create"]', "title");
      reportStatus(error instanceof Error ? error.message : "Não foi possível criar a Coleção.");
    } finally {
      endBusy(operation);
    }
  }

  async function renameCatalogCollection(form) {
    const groups = catalogGroupsForRender();
    const group = groups.find((entry) => entry.collectionId === form.dataset.collectionId);
    const title = text(new FormData(form).get("title")).trim();
    if (!group || !title) return;
    const operation = beginBusy("Salvando…");
    try {
      await spaces.updateCatalogCollection({
        collectionId: group.collectionId,
        revision: group.revision,
        title,
        description: group.description
      });
      queueActionFocus("edit-catalog-collection", { collectionId: group.collectionId });
      await refreshCatalogAfterMutation();
    } catch (error) {
      queueFormControlFocus(
        `[data-catalog-collection-form="rename"][data-collection-id="${form.dataset.collectionId}"]`,
        "title"
      );
      reportStatus(error instanceof Error ? error.message : "Não foi possível renomear a Coleção.");
    } finally {
      endBusy(operation);
    }
  }

  async function moveCatalogCollection(node, direction) {
    const groups = catalogGroupsForRender({ applyQuery: false })
      .filter((group) => group.contractKey !== "outros");
    const currentIndex = groups.findIndex((group) => group.collectionId === node.dataset.collectionId);
    const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    const targetPosition = Math.max(0, Math.min(groups.length - 1, currentIndex + delta));
    if (!delta || currentIndex < 0 || targetPosition === currentIndex) return;
    const operation = beginBusy("Movendo…");
    try {
      await spaces.moveCatalogCollection({
        collectionId: node.dataset.collectionId,
        revision: Number(node.dataset.revision),
        position: targetPosition
      });
      await refreshCatalogAfterMutation();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível mover a Coleção.");
    } finally {
      endBusy(operation);
    }
  }

  async function retireCatalogCollection(formOrNode) {
    const collectionId = formOrNode.dataset.catalogCollectionRetireForm
      || formOrNode.dataset.collectionId;
    const group = catalogGroupsForRender().find((entry) => entry.collectionId === collectionId);
    if (!group) return;
    const replacementCollectionId = formOrNode.matches("form")
      ? text(new FormData(formOrNode).get("replacementCollectionId"))
      : "";
    if (!globalThis.confirm?.(`Retirar a Coleção "${group.title}"?`)) return;
    const operation = beginBusy("Retirando…");
    try {
      await spaces.retireCatalogCollection({
        collectionId,
        revision: group.revision,
        replacementCollectionId: replacementCollectionId || null
      });
      queueActionFocus("create-catalog-collection");
      await refreshCatalogAfterMutation();
    } catch (error) {
      if (formOrNode.matches("form")) {
        queueFormControlFocus(
          `[data-catalog-collection-retire-form="${collectionId}"]`,
          "replacementCollectionId"
        );
      }
      reportStatus(error instanceof Error ? error.message : "Não foi possível retirar a Coleção.");
    } finally {
      endBusy(operation);
    }
  }

  async function moveCatalogCourse(node) {
    const operation = beginBusy("Movendo…");
    try {
      await spaces.moveCatalogCourse({
        courseId: node.dataset.courseId,
        placementRevision: Number(node.dataset.placementRevision),
        targetCollectionId: node.dataset.collectionId,
        position: Number(node.dataset.position)
      });
      await refreshCatalogAfterMutation();
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível mover o curso.");
    } finally {
      endBusy(operation);
    }
  }

  async function moveCatalogCourseToCollection(form) {
    const courseId = form.dataset.catalogCourseMoveForm;
    const course = catalogGroupsForRender()
      .flatMap((group) => group.courses)
      .find((entry) => entry.courseId === courseId);
    const targetCollectionId = text(new FormData(form).get("targetCollectionId"));
    if (!course || !targetCollectionId) return;
    const operation = beginBusy("Movendo…");
    try {
      await spaces.moveCatalogCourse({
        courseId,
        placementRevision: course.placementRevision,
        targetCollectionId
      });
      queueActionFocus("choose-catalog-course-collection", { courseId });
      await refreshCatalogAfterMutation();
    } catch (error) {
      queueFormControlFocus(`[data-catalog-course-move-form="${courseId}"]`, "targetCollectionId");
      reportStatus(error instanceof Error ? error.message : "Não foi possível mover o curso.");
    } finally {
      endBusy(operation);
    }
  }

  async function addCourseToTrails(node) {
    const courseId = node.dataset.courseId;
    const operation = beginBusy("Adicionando…");
    try {
      await spaces.addCourseToTrails(courseId);
      await beforeRemoteRead({ expectedCourseIds: [courseId] });
      await onStudyPathsChanged();
      await load({ synchronizeBeforeRead: false });
      reportStatus("");
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "Não foi possível adicionar o curso.");
    } finally {
      endBusy(operation);
    }
  }

  async function refreshSelectedWorkspace() {
    if (!selectedWorkspace?.workspaceId) return;
    const access = selectedWorkspace.access;
    selectedWorkspace = {
      ...(await spaces.loadWorkspace(selectedWorkspace.workspaceId, "outline")),
      access
    };
    await renderActive();
  }

  async function saveWorkspaceEntity(form) {
    const data = new FormData(form);
    const entityPath = form.dataset.entityPath;
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
      queueActionFocus("edit-workspace-entity", { entityPath });
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
    const entityPathKey = node.dataset.entityPath;
    const action = node.dataset.panelAction;
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
      queueActionFocus(action, { entityPath: entityPathKey });
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
      queueActionFocus("back-to-organize");
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
      activeView = "organize";
      reportStatus("");
      queueActionFocus("back-to-organize");
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
    const entityPath = form.dataset.entityPath;
    const operation = beginBusy("Salvando…");
    try {
      await spaces.createObservation({
        workspaceId: selectedWorkspace.workspaceId,
        entityType: form.dataset.entityType,
        entityPath: JSON.parse(form.dataset.entityPath),
        resourceTargetId: form.dataset.resourceTargetId || null,
        body: data.get("body")
      });
      observations = array((await spaces.listObservations(selectedWorkspace.workspaceId))?.items);
      reportStatus("");
      queueEntityFormControlFocus("[data-observation-form]", entityPath, "body");
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
      if (observingEntity?.pathKey) {
        queueEntityFormControlFocus("[data-observation-form]", observingEntity.pathKey, "body");
      }
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
    pendingFocusResolver = null;
    renderEpoch += 1;
    loadEpoch += 1;
    collectionLoadEpoch += 1;
    assistant.close();
    overlay.hidden = true;
    selectedWorkspace = null;
    creatingCatalogCollection = false;
    editingCatalogCollectionId = "";
    retiringCatalogCollectionId = "";
    movingCatalogCourseId = "";
    restoreOpeningFocus();
  }

  async function openObservationTarget({
    courseId = "",
    courseKey = "",
    entityType = "",
    entityPath = [],
    title = "",
    resourceTargetId = ""
  } = {}) {
    const normalizedCourseId = text(courseId).trim();
    const normalizedCourseKey = text(courseKey).trim();
    const normalizedEntityType = text(entityType).trim();
    const normalizedEntityPath = array(entityPath).map((item) => text(item).trim()).filter(Boolean);
    const normalizedResourceTargetId = text(resourceTargetId).trim();
    const expectedPathLength = {
      course: 1,
      module: 2,
      lesson: 3,
      microsequence: 4,
      card: 5,
      resource: 5
    }[normalizedEntityType];
    if (
      !expectedPathLength ||
      normalizedEntityPath.length !== expectedPathLength ||
      ((normalizedEntityType === "resource") !== Boolean(normalizedResourceTargetId)) ||
      (!normalizedCourseId && !normalizedCourseKey)
    ) {
      throw new TypeError("Destino da observação inválido.");
    }

    await open("organize");
    const item = array(trails?.items).find((candidate) =>
      candidate?.kind === "course" && (
        (normalizedCourseId && text(candidate.courseId) === normalizedCourseId) ||
        (normalizedCourseKey && text(candidate.courseKey) === normalizedCourseKey)
      )
    );
    if (!item?.workspaceId) {
      reportStatus("Este curso ainda não possui um plano de autoria para receber observações.");
      return false;
    }
    if (!await inspectWorkspace(item.workspaceId)) return false;
    const pathKey = JSON.stringify(normalizedEntityPath);
    editingEntity = null;
    observingEntity = {
      pathKey,
      title: text(title).trim(),
      entityType: normalizedEntityType,
      resourceTargetId: normalizedResourceTargetId
    };
    queueEntityFormControlFocus("[data-observation-form]", pathKey, "body");
    await renderActive();
    return true;
  }

  async function open(view) {
    const requestedView = view === undefined ? "organize" : view;
    if (!["organize", "collections", "chatbot"].includes(requestedView)) {
      throw new TypeError("Área do painel inválida.");
    }
    if (!opened) returnFocusTarget = documentValue.activeElement;
    activeView = requestedView;
    opened = true;
    overlay.hidden = false;
    await load();
    if (opened) focusActiveTab();
  }

  root.querySelectorAll("[data-panel-close]").forEach((node) => {
    node.addEventListener("click", () => void close());
  });
  root.querySelectorAll("[data-panel-view]").forEach((node) => {
    node.addEventListener("keydown", (event) => {
      if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...root.querySelectorAll("[data-panel-view]")];
      const currentIndex = tabs.indexOf(node);
      if (currentIndex < 0) return;
      let nextIndex = currentIndex;
      if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
      event.preventDefault();
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    });
    node.addEventListener("click", async () => {
      if (busy) return;
      try {
        activeView = node.dataset.panelView;
        queueFocus(() => root.querySelector(`[data-panel-view="${activeView}"]`));
        selectedWorkspace = null;
        movingTrailCourseId = "";
        movingCatalogCourseId = "";
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
  panel.addEventListener("keydown", (event) => {
    if (!opened) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = panelFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    const current = documentValue.activeElement;
    if (event.shiftKey && (!panel.contains(current) || current === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!panel.contains(current) || current === last)) {
      event.preventDefault();
      first.focus();
    }
  });
  content.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form?.reportValidity()) return;
    if (form.matches("[data-trail-group-form='create']")) void createTrailGroup(form);
    else if (form.matches("[data-trail-group-form='rename']")) void renameTrailGroup(form);
    else if (form.matches("[data-trail-course-group-form]")) void moveTrailCourseToGroup(form);
    else if (form.matches("[data-catalog-collection-form='create']")) void createCatalogCollection(form);
    else if (form.matches("[data-catalog-collection-form='rename']")) void renameCatalogCollection(form);
    else if (form.matches("[data-catalog-collection-retire-form]")) void retireCatalogCollection(form);
    else if (form.matches("[data-catalog-course-move-form]")) void moveCatalogCourseToCollection(form);
    else if (form.matches("[data-entity-form]")) void saveWorkspaceEntity(form);
    else if (form.matches("[data-observation-form]")) void saveObservation(form);
  });
  content.addEventListener("toggle", (event) => {
    const menu = event.target;
    if (menu instanceof HTMLDetailsElement
      && menu.matches("details.learning-spaces-context-menu")
      && menu.open) {
      closeOtherContextMenus(menu);
    }
  }, true);
  content.addEventListener("click", (event) => {
    const summary = event.target instanceof Element
      ? event.target.closest("summary.learning-spaces-context-menu-summary")
      : null;
    if (summary && !summary.parentElement.open) closeOtherContextMenus(summary.parentElement);
    const node = event.target instanceof Element
      ? event.target.closest("[data-panel-action]")
      : null;
    if (!node || busy) return;
    const action = node.dataset.panelAction;
    if (action === "create-trail-group") {
      creatingTrailGroup = true;
      queueFormControlFocus('[data-trail-group-form="create"]', "title");
      void renderActive();
    } else if (action === "cancel-trail-group-create") {
      creatingTrailGroup = false;
      queueActionFocus("create-trail-group");
      void renderActive();
    } else if (action === "submit-trail-group-create") {
      const form = node.closest("[data-trail-group-form='create']");
      if (form?.reportValidity()) void createTrailGroup(form);
    } else if (action === "edit-trail-group") {
      editingTrailGroupId = node.dataset.pathId;
      queueFormControlFocus(
        `[data-trail-group-form="rename"][data-path-id="${node.dataset.pathId}"]`,
        "title"
      );
      void renderActive();
    } else if (action === "cancel-trail-group-edit") {
      const pathId = node.closest("[data-trail-group-form]")?.dataset.pathId || editingTrailGroupId;
      editingTrailGroupId = "";
      queueActionFocus("edit-trail-group", { pathId });
      void renderActive();
    } else if (action === "submit-trail-group-edit") {
      const form = node.closest("[data-trail-group-form='rename']");
      if (form?.reportValidity()) void renameTrailGroup(form);
    } else if (action === "move-trail-group-up" || action === "move-trail-group-down") {
      void moveTrailGroup(node.dataset.pathId, action.endsWith("up") ? "up" : "down");
    } else if (action === "delete-trail-group") {
      void deleteTrailGroup(node.dataset.pathId, node.dataset.title);
    } else if (action === "choose-trail-course-group") {
      movingTrailCourseId = node.dataset.courseId;
      queueFormControlFocus(
        `[data-trail-course-group-form="${node.dataset.courseId}"]`,
        "pathId"
      );
      void renderActive();
    } else if (action === "cancel-trail-course-move") {
      const courseId = node.closest("[data-trail-course-group-form]")?.dataset.trailCourseGroupForm
        || movingTrailCourseId;
      movingTrailCourseId = "";
      queueActionFocus("choose-trail-course-group", { courseId });
      void renderActive();
    } else if (action === "submit-trail-course-move") {
      const form = node.closest("[data-trail-course-group-form]");
      if (form?.reportValidity()) void moveTrailCourseToGroup(form);
    } else if (action === "detach-trail-course-group") {
      void detachTrailCourse(node.dataset.pathItemId);
    } else if (action === "move-trail-course-up" || action === "move-trail-course-down") {
      void moveTrailCourseInGroup(node.dataset.pathItemId, action.endsWith("up") ? "up" : "down");
    } else if (action === "create-catalog-collection") {
      creatingCatalogCollection = true;
      queueFormControlFocus('[data-catalog-collection-form="create"]', "title");
      void renderActive();
    } else if (action === "cancel-catalog-collection-create") {
      creatingCatalogCollection = false;
      queueActionFocus("create-catalog-collection");
      void renderActive();
    } else if (action === "submit-catalog-collection-create") {
      const form = node.closest("[data-catalog-collection-form='create']");
      if (form?.reportValidity()) void createCatalogCollection(form);
    } else if (action === "edit-catalog-collection") {
      editingCatalogCollectionId = node.dataset.collectionId;
      retiringCatalogCollectionId = "";
      queueFormControlFocus(
        `[data-catalog-collection-form="rename"][data-collection-id="${node.dataset.collectionId}"]`,
        "title"
      );
      void renderActive();
    } else if (action === "cancel-catalog-collection-edit") {
      const collectionId = node.closest("[data-catalog-collection-form]")?.dataset.collectionId
        || editingCatalogCollectionId;
      editingCatalogCollectionId = "";
      queueActionFocus("edit-catalog-collection", { collectionId });
      void renderActive();
    } else if (action === "submit-catalog-collection-edit") {
      const form = node.closest("[data-catalog-collection-form='rename']");
      if (form?.reportValidity()) void renameCatalogCollection(form);
    } else if (action === "move-catalog-collection-up" || action === "move-catalog-collection-down") {
      void moveCatalogCollection(node, action.endsWith("up") ? "up" : "down");
    } else if (action === "retire-catalog-collection") {
      if (Number(node.dataset.courseCount) > 0) {
        retiringCatalogCollectionId = node.dataset.collectionId;
        editingCatalogCollectionId = "";
        queueFormControlFocus(
          `[data-catalog-collection-retire-form="${node.dataset.collectionId}"]`,
          "replacementCollectionId"
        );
        void renderActive();
      } else {
        void retireCatalogCollection(node);
      }
    } else if (action === "cancel-catalog-collection-retire") {
      const collectionId = node.closest("[data-catalog-collection-retire-form]")
        ?.dataset.catalogCollectionRetireForm || retiringCatalogCollectionId;
      retiringCatalogCollectionId = "";
      queueActionFocus("retire-catalog-collection", { collectionId });
      void renderActive();
    } else if (action === "submit-catalog-collection-retire") {
      const form = node.closest("[data-catalog-collection-retire-form]");
      if (form?.reportValidity()) void retireCatalogCollection(form);
    } else if (action === "choose-catalog-course-collection") {
      movingCatalogCourseId = node.dataset.courseId;
      queueFormControlFocus(
        `[data-catalog-course-move-form="${node.dataset.courseId}"]`,
        "targetCollectionId"
      );
      void renderActive();
    } else if (action === "cancel-catalog-course-move") {
      const courseId = node.closest("[data-catalog-course-move-form]")?.dataset.catalogCourseMoveForm
        || movingCatalogCourseId;
      movingCatalogCourseId = "";
      queueActionFocus("choose-catalog-course-collection", { courseId });
      void renderActive();
    } else if (action === "submit-catalog-course-move") {
      const form = node.closest("[data-catalog-course-move-form]");
      if (form?.reportValidity()) void moveCatalogCourseToCollection(form);
    } else if (action === "move-catalog-course-up" || action === "move-catalog-course-down") {
      void moveCatalogCourse(node);
    } else if (action === "add-course-to-trails") {
      void addCourseToTrails(node);
    }
    else if (action === "inspect-workspace") void inspectWorkspace(node.dataset.workspaceId);
    else if (action === "create-course-workspace") {
      void createCourseWorkspace(node.dataset.courseId, node.dataset.title);
    }
    else if (action === "back-to-organize") {
      const workspaceId = selectedWorkspace?.workspaceId || "";
      selectedWorkspace = null;
      if (workspaceId) queueActionFocus("inspect-workspace", { workspaceId });
      void renderActive();
    } else if (action === "delete-workspace") {
      void deleteWorkspace(node.dataset.workspaceId, node.dataset.title);
    } else if (action === "remove-course-from-trails") {
      void removeCourseFromTrails(node);
    } else if (action === "remove-course-from-catalog") {
      void removeCourseFromCatalog(node);
    } else if (action === "edit-workspace-entity") {
      observingEntity = null;
      editingEntity = {
        pathKey: node.dataset.entityPath,
        title: node.dataset.title || "",
        goal: node.dataset.goal || ""
      };
      queueEntityFormControlFocus("[data-entity-form]", node.dataset.entityPath, "title");
      void renderActive();
    } else if (action === "observe-workspace-entity") {
      editingEntity = null;
      observingEntity = {
        pathKey: node.dataset.entityPath,
        title: node.dataset.title || "",
        entityType: node.dataset.entityType || ""
      };
      queueEntityFormControlFocus("[data-observation-form]", node.dataset.entityPath, "body");
      void renderActive();
    } else if (action === "cancel-observation") {
      const entityPath = node.closest("[data-observation-form]")?.dataset.entityPath
        || observingEntity?.pathKey
        || "";
      observingEntity = null;
      if (entityPath) queueActionFocus("observe-workspace-entity", { entityPath });
      void renderActive();
    } else if (action === "submit-observation") {
      const form = node.closest("[data-observation-form]");
      if (form?.reportValidity()) void saveObservation(form);
    } else if (action === "delete-observation") {
      void deleteObservation(node.dataset.observationId);
    } else if (action === "cancel-entity-edit") {
      const entityPath = node.closest("[data-entity-form]")?.dataset.entityPath
        || editingEntity?.pathKey
        || "";
      editingEntity = null;
      if (entityPath) queueActionFocus("edit-workspace-entity", { entityPath });
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
            await beforeRemoteRead({ expectedCourseIds: [node.dataset.courseId] });
            openedCourse = onOpenCourse?.({ courseId: node.dataset.courseId, courseKey: "" });
            if (openedCourse === false) {
              reportStatus("Não foi possível abrir o curso neste dispositivo.");
            }
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
    if (
      activeView === "collections"
      && authenticatedCapabilities.catalogManage
      && catalogManagementReady
    ) {
      void renderActive();
      return;
    }
    searchInput._aralearnTimer = globalThis.setTimeout(
      () => void (catalogManagementAllowed === null
        ? load({ synchronizeBeforeRead: false })
        : refreshCollectionsForSearch()),
      250
    );
  });

  return {
    open,
    openObservationTarget,
    openAuthoringAssistant() {
      return open("chatbot");
    },
    refresh: load,
    get opened() {
      return opened;
    }
  };
}
