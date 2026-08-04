import { LearningSpaces } from "../supabase/LearningSpaces.js";
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

function metric(documentValue, value, label) {
  const node = documentValue.createElement("span");
  node.className = "progress-meta-item";
  node.title = label;
  node.setAttribute("aria-label", label);
  node.textContent = String(value);
  return node;
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
  documentValue = globalThis.document
} = {}) {
  if (!root || !catalog || !authClient) throw new TypeError("Dependências do painel ausentes.");
  const spaces = new LearningSpaces({ catalog, authClient });
  let opened = false;
  let busy = false;
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
  const assistant = createAuthoringAssistantPanel({
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

  function setBusy(value, message = "") {
    busy = value;
    statusMessage = message;
    overlay.setAttribute("aria-busy", String(value));
    overlay.querySelectorAll("button, input").forEach((node) => {
      if (node.matches("[data-panel-close]")) return;
      if (value) {
        node.dataset.disabledBeforeBusy = String(node.disabled);
        node.disabled = true;
      } else {
        node.disabled = node.dataset.disabledBeforeBusy === "true";
        delete node.dataset.disabledBeforeBusy;
      }
    });
    status.textContent = message;
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
    const card = documentValue.createElement("article");
    card.className = "clean-card remote-central-item remote-trail-control-card";
    card.dataset.trailItemId = item.itemId;
    const copy = documentValue.createElement("div");
    copy.className = "remote-central-item-copy";
    const heading = documentValue.createElement("h3");
    heading.textContent = item.title;
    const kind = documentValue.createElement("span");
    kind.className = "remote-central-item-kind";
    kind.textContent = item.kind === "plan" ? "Plano" : "Curso";
    copy.append(heading, kind);
    if (item.description) {
      const description = documentValue.createElement("p");
      description.textContent = item.description;
      copy.append(description);
    }
    const meta = documentValue.createElement("div");
    meta.className = "progress-meta";
    meta.append(
      metric(documentValue, item.moduleCount, "Módulos"),
      metric(documentValue, item.lessonCount, "Lições"),
      metric(documentValue, item.cardCount, "Cards")
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
    if (item.workspaceId) {
      actions.append(button(documentValue, {
        action: "delete-workspace",
        iconName: "trash",
        label: "Excluir",
        disabled: !item.canDelete,
        data: { workspaceId: item.workspaceId, title: item.title }
      }));
    }
    card.append(copy, meta, actions);
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
    head.className = "remote-library-section-heading";
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
      group.courses.forEach((course) => {
        const card = documentValue.createElement("article");
        card.className = "clean-card remote-central-item";
        const title = documentValue.createElement("h3");
        title.textContent = text(course.course_title ?? course.courseTitle ?? course.title) || "Curso";
        const actions = documentValue.createElement("div");
        actions.className = "remote-central-item-actions";
        actions.append(button(documentValue, {
          action: "open-course",
          iconName: "play",
          label: "Abrir curso",
          className: "open-main",
          data: { courseId: text(course.course_id ?? course.courseId), courseKey: "" }
        }));
        card.append(title, actions);
        block.append(card);
      });
      if (!group.courses.length) block.append(empty(documentValue, "Sem cursos."));
      section.append(block);
    });
    if (!groups.size) section.append(empty(documentValue, "Nenhum resultado."));
    return section;
  }

  async function renderActive() {
    content.replaceChildren();
    syncTabs();
    if (activeView === "chatbot") {
      await assistant.open({ catalogAccess: trails?.capabilities?.catalogManage === true });
      content.append(assistant.element);
    } else if (activeView === "collections") {
      assistant.close();
      content.append(renderCollections());
    } else {
      assistant.close();
      content.append(selectedWorkspace ? renderWorkspaceTree(selectedWorkspace) : renderTrails());
    }
    status.textContent = statusMessage;
  }

  async function load({ synchronizeBeforeRead = true } = {}) {
    setBusy(true, "Consultando…");
    try {
      if (synchronizeBeforeRead) await beforeRemoteRead();
      const trailResult = await spaces.loadTrails();
      trails = trailResult.page;
      if (activeView === "collections") {
        collections = await catalog.listCollections(catalogQuery);
      }
      statusMessage = trailResult.stale ? "Último estado disponível." : "";
    } catch (error) {
      const cached = await spaces.loadTrails({ online: false });
      trails ||= cached.page;
      statusMessage = error instanceof Error ? error.message : "Não foi possível abrir o painel.";
    } finally {
      setBusy(false, statusMessage);
      await renderActive();
    }
  }

  async function createPlan(form) {
    const data = new FormData(form);
    const title = text(data.get("title")).trim();
    if (!title) return;
    setBusy(true, "Criando…");
    try {
      await spaces.createPlan({ title, description: text(data.get("description")).trim() });
      creatingPlan = false;
      selectedWorkspace = null;
      await load({ synchronizeBeforeRead: false });
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível criar o plano.");
    }
  }

  async function refreshSelectedWorkspace() {
    if (!selectedWorkspace?.workspaceId) return;
    selectedWorkspace = await spaces.loadWorkspace(selectedWorkspace.workspaceId, "outline");
    await renderActive();
  }

  async function saveWorkspaceEntity(form) {
    const data = new FormData(form);
    setBusy(true, "Salvando…");
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
      setBusy(false, "");
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  async function moveWorkspaceEntity(node) {
    const entityPath = JSON.parse(node.dataset.entityPath);
    setBusy(true, "Movendo…");
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
      setBusy(false, "");
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível mover.");
    }
  }

  async function deleteWorkspaceEntity(node) {
    if (!globalThis.confirm?.(`Excluir "${node.dataset.title || "Item"}" e todo o seu conteúdo?`)) return;
    setBusy(true, "Excluindo…");
    try {
      await spaces.deleteEntity({
        workspaceId: selectedWorkspace.workspaceId,
        revision: selectedWorkspace.revision,
        entityType: node.dataset.entityType,
        entityPath: JSON.parse(node.dataset.entityPath)
      });
      editingEntity = null;
      await refreshSelectedWorkspace();
      setBusy(false, "");
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  async function inspectWorkspace(workspaceId) {
    setBusy(true, "Abrindo…");
    try {
      const [workspace, notes, context] = await Promise.all([
        spaces.loadWorkspace(workspaceId, "outline"),
        spaces.listObservations(workspaceId),
        spaces.loadWorkspaceAccess(workspaceId)
      ]);
      selectedWorkspace = { ...workspace, access: context?.capabilities || {} };
      observations = array(notes?.items);
      activeView = "trails";
      setBusy(false, "");
      await renderActive();
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível abrir o plano.");
    }
  }

  async function saveObservation(form) {
    const data = new FormData(form);
    setBusy(true, "Salvando…");
    try {
      await spaces.createObservation({
        workspaceId: selectedWorkspace.workspaceId,
        entityType: form.dataset.entityType,
        entityPath: JSON.parse(form.dataset.entityPath),
        body: data.get("body")
      });
      observations = array((await spaces.listObservations(selectedWorkspace.workspaceId))?.items);
      setBusy(false, "");
      await renderActive();
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível salvar a observação.");
    }
  }

  async function deleteObservation(observationId) {
    setBusy(true, "Excluindo…");
    try {
      await spaces.deleteObservation({
        workspaceId: selectedWorkspace.workspaceId,
        observationId
      });
      observations = array((await spaces.listObservations(selectedWorkspace.workspaceId))?.items);
      setBusy(false, "");
      await renderActive();
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível excluir a observação.");
    }
  }

  async function deleteWorkspace(workspaceId, title) {
    if (!globalThis.confirm?.(`Excluir "${title || "Plano"}" e todo o conteúdo em construção?`)) return;
    setBusy(true, "Excluindo…");
    try {
      await spaces.deleteWorkspace(workspaceId);
      selectedWorkspace = null;
      await load({ synchronizeBeforeRead: false });
    } catch (error) {
      setBusy(false, error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  async function close() {
    if (busy) return;
    opened = false;
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
      activeView = node.dataset.panelView;
      selectedWorkspace = null;
      if (activeView === "collections" && !collections.length) {
        await load({ synchronizeBeforeRead: false });
      } else {
        await renderActive();
      }
    });
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
    else if (action === "back-to-trails") {
      selectedWorkspace = null;
      void renderActive();
    } else if (action === "delete-workspace") {
      void deleteWorkspace(node.dataset.workspaceId, node.dataset.title);
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
          setBusy(true, "Abrindo…");
          try {
            await catalog.selectCourse(node.dataset.courseId);
            await beforeRemoteRead({ expectedCourseIds: [node.dataset.courseId] });
            openedCourse = onOpenCourse?.({ courseId: node.dataset.courseId, courseKey: "" });
          } catch (error) {
            setBusy(false, error instanceof Error ? error.message : "Não foi possível abrir o curso.");
            return;
          }
        }
        if (openedCourse !== false) {
          if (busy) setBusy(false, "");
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
    const pending = await beforeSignOut();
    if (pending && !globalThis.confirm?.("Há alterações aguardando envio. Sair mesmo assim?")) return;
    setBusy(true, "Saindo…");
    await authClient.signOut();
    await onSignedOut();
  });
  root.querySelector("[data-panel-action='delete-account']")?.addEventListener("click", async () => {
    if (busy || !globalThis.confirm?.("Excluir a conta e todos os dados pessoais?")) return;
    setBusy(true, "Excluindo…");
    await catalog.deleteOwnAccount();
    await onAccountDeleted();
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
