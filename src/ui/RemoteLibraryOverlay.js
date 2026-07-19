import { renderUiIcon } from "./renderUiIcons.js";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function field(record, ...names) {
  for (const name of names) {
    if (record?.[name] !== undefined) return record[name];
  }
  return undefined;
}

export function resolveLibraryCourseUpdateAction(course) {
  const update = Boolean(field(
    course,
    "has_source_update",
    "hasSourceUpdate",
    "update_available",
    "updateAvailable"
  ));
  if (!update) return { action: "current", label: "Atual" };
  const personalized = Boolean(field(course, "is_personalized", "isPersonalized", "personalized"));
  if (personalized) {
    return { action: "clone", label: "Criar nova cópia atualizada" };
  }
  const role = text(field(course, "membership_role", "membershipRole", "role")) || "learner";
  if (role === "owner" || role === "editor") {
    return { action: "refresh", label: "Atualizar curso" };
  }
  return {
    action: "inform",
    label: "Atualização disponível ao proprietário ou editor"
  };
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function setText(node, value) {
  if (node) node.textContent = value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Operação indisponível.");
}

const ACTION_ICONS = Object.freeze({
  acceptRemote: "ready-state",
  clone: "add",
  close: "remove-state",
  detach: "remove-state",
  keepLocal: "save",
  edit: "edit",
  moveDown: "arrow-down",
  moveUp: "arrow-up",
  remove: "trash",
  rejectDiscard: "trash",
  refresh: "reposition",
  signout: "excluded-state",
  sync: "progress",
  trail: "trail",
  collection: "folder"
});

function iconMarkup(action, className = "remote-library-action-icon") {
  return renderUiIcon(ACTION_ICONS[action] || "preview", className);
}

function sectionWithHeading(label) {
  const section = document.createElement("section");
  section.className = "remote-library-section";
  const headingRow = document.createElement("div");
  headingRow.className = "centered-section-heading-row";
  const heading = document.createElement("h3");
  heading.className = "section-heading";
  heading.textContent = label;
  headingRow.append(heading);
  const list = document.createElement("div");
  list.className = "navigation-list remote-library-course-list";
  section.append(headingRow, list);
  return { section, list };
}

export function createRemoteLibraryOverlay({
  root,
  catalog,
  authClient,
  syncEngine = null,
  studyPathRepository = null,
  onChanged = () => globalThis.location?.reload?.(),
  onStudyPathsChanged = onChanged,
  onSignedOut = onChanged,
  beforeRemoteRead = async () => {},
  getCourseRevision = null,
  beforeSignOut = async () => 0
} = {}) {
  if (!root || !catalog || !authClient) throw new TypeError("Dependências da biblioteca remota ausentes.");
  let open = false;
  let busy = false;
  let catalogQuery = "";
  let activeView = "collections";
  let expandedPathIds = new Set();
  let revealedPathId = "";
  let revealedCourseId = "";
  let searchTimer = null;

  root.innerHTML = `
    <section class="remote-library-overlay" data-library-overlay hidden aria-label="Biblioteca">
      <div class="remote-library-backdrop" data-library-close></div>
      <div class="remote-library-panel courses-home-screen" role="dialog" aria-modal="true">
        <header class="remote-library-header">
          <nav class="remote-library-tabs" role="tablist" aria-label="Biblioteca">
            <button class="remote-library-tab is-active" type="button" role="tab" data-library-view="collections" aria-controls="remote-library-collections" aria-selected="true">${iconMarkup("collection")}<span>Coleções</span></button>
            <button class="remote-library-tab" type="button" role="tab" data-library-view="paths" aria-controls="remote-library-paths" aria-selected="false" tabindex="-1">${iconMarkup("trail")}<span>Trilhas</span></button>
          </nav>
          <label class="remote-catalog-search" data-library-catalog-search>
            ${renderUiIcon("search", "remote-library-action-icon")}
            <input type="search" placeholder="Pesquisar cursos" data-catalog-search aria-label="Pesquisar cursos no catálogo">
          </label>
        </header>
        <div class="remote-library-content" data-library-content></div>
        <div class="remote-library-progress" data-library-progress hidden>
          <div class="remote-library-progress-track" role="progressbar" aria-label="Progresso da adição do curso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-library-progress-bar><span data-library-progress-fill></span></div>
          <span class="remote-library-progress-percent" data-library-progress-percent>0%</span>
          <ol class="remote-library-progress-log" data-library-progress-log></ol>
        </div>
        <p class="remote-library-status" data-library-status role="status" aria-live="polite"></p>
        <footer class="remote-library-footer">
          <button class="icon-ghost" type="button" data-library-sync title="Sincronizar agora" aria-label="Sincronizar agora">${iconMarkup("sync")}</button>
          <button class="icon-ghost" type="button" data-library-signout title="Sair da conta" aria-label="Sair da conta">${iconMarkup("signout")}</button>
        </footer>
      </div>
    </section>
  `;

  const overlay = root.querySelector("[data-library-overlay]");
  const content = root.querySelector("[data-library-content]");
  const status = root.querySelector("[data-library-status]");
  const progressRoot = root.querySelector("[data-library-progress]");
  const progressBar = root.querySelector("[data-library-progress-bar]");
  const progressFill = root.querySelector("[data-library-progress-fill]");
  const progressPercent = root.querySelector("[data-library-progress-percent]");
  const progressLog = root.querySelector("[data-library-progress-log]");
  const syncButton = root.querySelector("[data-library-sync]");
  const searchRoot = root.querySelector("[data-library-catalog-search]");
  const searchInput = root.querySelector("[data-catalog-search]");
  let displayedProgress = 0;
  const recordedProgressMessages = new Set();

  const setProgress = ({ percent = 0, message = "" } = {}) => {
    const requestedPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const safePercent = Math.max(displayedProgress, requestedPercent);
    displayedProgress = safePercent;
    progressRoot.hidden = false;
    progressBar.setAttribute("aria-valuenow", String(safePercent));
    progressFill.style.width = `${safePercent}%`;
    setText(progressPercent, `${safePercent}%`);
    if (message && !recordedProgressMessages.has(message)) {
      recordedProgressMessages.add(message);
      const entry = document.createElement("li");
      const value = document.createElement("span");
      value.className = "remote-library-progress-log-value";
      value.textContent = `${safePercent}%`;
      const label = document.createElement("span");
      label.textContent = message;
      entry.append(value, label);
      progressLog.append(entry);
    }
  };

  const beginProgress = (progress) => {
    displayedProgress = 0;
    recordedProgressMessages.clear();
    progressLog.replaceChildren();
    setProgress(progress);
  };

  const setBusy = (value, message = "") => {
    busy = value;
    root.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    if (!value) {
      progressRoot.hidden = true;
      displayedProgress = 0;
      recordedProgressMessages.clear();
      progressLog.replaceChildren();
    }
    setText(status, message);
  };

  const courseCard = (course, action = "clone", { hasPendingLocalChange = false } = {}) => {
    const id = text(field(course, "course_id", "courseId", "id"));
    const sourceId = text(field(course, "source_course_id", "sourceCourseId")) || id;
    const title = text(field(course, "title")) || "Curso sem título";
    const goal = text(field(course, "goal"));
    const role = text(field(course, "membership_role", "membershipRole", "role")) || "learner";
    const installed = Boolean(field(course, "is_installed", "isInstalled"));
    const updateAction = resolveLibraryCourseUpdateAction(course);
    const wrapper = document.createElement("article");
    wrapper.className = "clean-card course-card progress-card navigation-list-card remote-course-card";
    const copy = document.createElement("div");
    copy.className = "course-copy navigation-main";
    const titleRow = document.createElement("div");
    titleRow.className = "navigation-title-row";
    const heading = document.createElement("h3");
    heading.className = "card-title";
    heading.textContent = title;
    titleRow.append(heading);
    copy.append(titleRow);
    if (goal) {
      const description = document.createElement("p");
      description.className = "card-subtitle";
      description.textContent = goal;
      copy.append(description);
    }
    const actions = document.createElement("div");
    actions.className = "course-actions navigation-actions remote-course-actions";
    if (action === "clone") {
      if (installed) {
        const ready = document.createElement("span");
        ready.className = "remote-course-installed";
        ready.title = "Adicionado";
        ready.setAttribute("aria-label", "Adicionado");
        ready.innerHTML = renderUiIcon("ready-state", "remote-library-action-icon");
        actions.append(ready);
      } else {
        actions.append(actionButton("Adicionar aos meus cursos", "clone", sourceId));
      }
    } else {
      if (hasPendingLocalChange) {
        const pending = document.createElement("span");
        pending.className = "remote-course-pending";
        pending.title = "Há alterações deste dispositivo aguardando sincronização.";
        pending.setAttribute("role", "status");
        pending.setAttribute("aria-label", "Há alterações deste dispositivo aguardando sincronização.");
        pending.innerHTML = iconMarkup("sync");
        actions.append(pending);
      }
      if (updateAction.action === "clone") {
        actions.append(actionButton(updateAction.label, "clone", sourceId));
      } else if (updateAction.action === "refresh") {
        actions.append(actionButton("Atualizar cópia com a publicação oficial", "refresh", id));
      }
      if (role === "owner") {
        actions.append(actionButton("Remover minha cópia deste curso", "remove", id));
      }
    }
    wrapper.append(copy);
    if (actions.childElementCount) wrapper.append(actions);
    return wrapper;
  };

  const actionButton = (label, action, id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-ghost remote-course-action";
    button.dataset.courseAction = action;
    button.dataset.courseId = id;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = iconMarkup(action);
    return button;
  };

  const pathActionButton = (label, action, pathId, itemId = "", courseId = "") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-ghost remote-course-action compact-icon";
    button.dataset.pathAction = action;
    button.dataset.pathId = pathId;
    if (itemId) button.dataset.pathItemId = itemId;
    if (courseId) button.dataset.courseId = courseId;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = iconMarkup(action);
    return button;
  };

  const applyActiveView = () => {
    root.querySelectorAll("[data-library-view]").forEach((button) => {
      const selected = button.dataset.libraryView === activeView;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    root.querySelectorAll("[data-library-view-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.libraryViewPanel !== activeView;
    });
    searchRoot.hidden = activeView !== "collections";
  };

  const renderStudyPaths = (libraryCourses, pendingCourseIds) => {
    const section = sectionWithHeading("Trilhas");
    section.section.classList.add("remote-study-paths", "remote-library-view");
    section.section.id = "remote-library-paths";
    section.section.dataset.libraryViewPanel = "paths";
    section.section.setAttribute("role", "tabpanel");
    const createRow = document.createElement("form");
    createRow.className = "remote-study-path-create";
    createRow.dataset.pathCreate = "";
    const input = document.createElement("input");
    input.type = "text";
    input.name = "path-title";
    input.maxLength = 120;
    input.placeholder = "Nova trilha";
    input.setAttribute("aria-label", "Nome da nova trilha");
    const createButton = pathActionButton("Criar trilha", "clone", "");
    createButton.type = "submit";
    delete createButton.dataset.pathAction;
    createRow.append(input, createButton);
    section.section.insertBefore(createRow, section.list);

    const courseById = new Map(array(libraryCourses).map((course) => [
      text(field(course, "course_id", "courseId", "id")), course
    ]));
    const paths = studyPathRepository?.loadStudyPaths?.() || [];
    const assignedCourseIds = new Set(paths.flatMap((path) =>
      array(path.courses).map((item) => item.persistentCourseId || item.courseId)
    ));
    const looseCourses = array(libraryCourses).filter((course) =>
      !assignedCourseIds.has(text(field(course, "course_id", "courseId", "id")))
    );

    const headerForPath = (label, pathId, { fixed = false } = {}) => {
      const header = document.createElement("summary");
      header.className = "remote-study-path-header";
      const title = document.createElement("h3");
      title.className = "card-title";
      title.textContent = label;
      const actions = document.createElement("div");
      actions.className = "remote-inline-actions";
      const rename = pathActionButton(
        fixed ? "A trilha padrão não pode ser renomeada" : "Renomear trilha",
        "edit",
        pathId
      );
      const remove = pathActionButton(
        fixed ? "A trilha padrão não pode ser excluída" : "Excluir trilha",
        "remove",
        pathId
      );
      rename.disabled = fixed;
      remove.disabled = fixed;
      actions.append(rename, remove);
      header.append(title, actions);
      return header;
    };

    const rowForCourse = (course, { path = null, item = null, index = 0, items = [] } = {}) => {
      const courseId = text(field(course, "course_id", "courseId", "id"));
      const row = document.createElement("div");
      row.className = "remote-study-path-course-row";
      row.dataset.courseRow = "";
      row.dataset.courseId = courseId;
      const label = document.createElement("span");
      label.textContent = text(field(course, "title")) || "Curso";
      label.title = label.textContent;
      row.dataset.courseTitle = label.textContent;
      const rowActions = document.createElement("div");
      rowActions.className = "remote-inline-actions";
      if (pendingCourseIds.has(courseId)) {
        const pending = document.createElement("span");
        pending.className = "remote-course-pending compact-pending";
        pending.title = "Alterações aguardando sincronização";
        pending.setAttribute("aria-label", pending.title);
        pending.innerHTML = iconMarkup("sync");
        rowActions.append(pending);
      }
      const update = resolveLibraryCourseUpdateAction(course);
      if (update.action === "refresh") {
        rowActions.append(actionButton("Atualizar cópia com a publicação oficial", "refresh", courseId));
      } else if (update.action === "clone") {
        rowActions.append(actionButton(update.label, "clone", text(field(course, "source_course_id", "sourceCourseId"))));
      }
      if (path && item) {
        if (index > 0) rowActions.append(pathActionButton("Mover para cima", "moveUp", path.id, item.id));
        if (index < items.length - 1) rowActions.append(pathActionButton("Mover para baixo", "moveDown", path.id, item.id));
        rowActions.append(pathActionButton("Retirar da trilha", "detach", path.id, item.id));
        if (revealedPathId === path.id && revealedCourseId === courseId) {
          row.classList.add("is-recently-moved");
        }
      } else if (paths.length) {
        rowActions.append(pathActionButton("Adicionar a uma trilha", "trail", "", "", courseId));
      }
      if (text(field(course, "membership_role", "membershipRole", "role")) === "owner") {
        rowActions.append(actionButton("Remover minha cópia deste curso", "remove", courseId));
      }
      row.append(label, rowActions);
      return row;
    };

    const defaultCard = document.createElement("details");
    defaultCard.className = "clean-card remote-study-path-card remote-study-path-default";
    defaultCard.dataset.studyPathCard = "default";
    defaultCard.open = true;
    defaultCard.append(headerForPath(`Sem trilha (${looseCourses.length})`, "default", { fixed: true }));
    const defaultBody = document.createElement("div");
    defaultBody.className = "remote-study-path-body";
    const defaultList = document.createElement("div");
    defaultList.className = "remote-study-path-course-list";
    looseCourses.forEach((course) => {
      const courseId = text(field(course, "course_id", "courseId", "id"));
      const wrapper = document.createElement("div");
      wrapper.className = "remote-loose-course";
      const chooser = document.createElement("div");
      chooser.className = "remote-loose-course-paths";
      chooser.dataset.coursePathChooser = courseId;
      chooser.hidden = true;
      wrapper.append(rowForCourse(course), chooser);
      defaultList.append(wrapper);
    });
    if (!defaultList.childElementCount) defaultList.append(emptyMessage("Sem cursos."));
    defaultBody.append(defaultList);
    defaultCard.append(defaultBody);
    section.list.append(defaultCard);

    paths.forEach((path) => {
      const card = document.createElement("details");
      card.className = "clean-card remote-study-path-card";
      card.dataset.studyPathCard = path.id;
      card.open = expandedPathIds.has(path.id) || revealedPathId === path.id;
      card.append(headerForPath(`${path.title || "Trilha"} (${array(path.courses).length})`, path.id));
      const body = document.createElement("div");
      body.className = "remote-study-path-body";
      const renameRow = document.createElement("form");
      renameRow.className = "remote-study-path-create remote-study-path-rename";
      renameRow.dataset.pathRename = path.id;
      renameRow.hidden = true;
      const renameInput = document.createElement("input");
      renameInput.type = "text";
      renameInput.name = "path-title";
      renameInput.maxLength = 120;
      renameInput.value = path.title || "";
      renameInput.setAttribute("aria-label", "Novo nome da trilha");
      const saveButton = pathActionButton("Salvar nome", "keepLocal", path.id);
      saveButton.type = "submit";
      delete saveButton.dataset.pathAction;
      renameRow.append(renameInput, saveButton);
      body.append(renameRow);

      const list = document.createElement("div");
      list.className = "remote-study-path-course-list";
      array(path.courses).forEach((item, index, items) => {
        const persistentCourseId = item.persistentCourseId || item.courseId;
        const course = courseById.get(persistentCourseId);
        if (!course) return;
        list.append(rowForCourse(course, { path, item, index, items }));
      });
      if (!list.childElementCount) list.append(emptyMessage("Sem cursos."));
      body.append(list);
      card.append(body);
      section.list.append(card);
    });
    return section.section;
  };

  const renderCollections = (collectionRows) => {
    const section = sectionWithHeading("Coleções");
    section.section.classList.add("remote-library-view", "remote-library-collections");
    section.section.id = "remote-library-collections";
    section.section.dataset.libraryViewPanel = "collections";
    section.section.setAttribute("role", "tabpanel");

    const collections = new Map();
    array(collectionRows).forEach((row) => {
      const collectionId = text(field(row, "collection_id", "collectionId"));
      if (!collections.has(collectionId)) {
        collections.set(collectionId, {
          id: collectionId,
          title: text(field(row, "collection_title", "collectionTitle")) || "Coleção",
          description: text(field(row, "collection_description", "collectionDescription")),
          courses: []
        });
      }
      if (field(row, "course_id", "courseId")) collections.get(collectionId).courses.push(row);
    });
    collections.forEach((collection) => {
      const details = document.createElement("details");
      details.className = "remote-catalog-collection";
      details.open = Boolean(catalogQuery);
      const summary = document.createElement("summary");
      const title = document.createElement("span");
      title.textContent = collection.title;
      const count = document.createElement("span");
      count.className = "remote-collection-count";
      count.textContent = String(collection.courses.length);
      summary.append(title, count);
      details.append(summary);
      const rows = document.createElement("div");
      rows.className = "remote-collection-courses";
      collection.courses.forEach((course) => rows.append(courseCard(course, "clone")));
      if (!collection.courses.length) rows.append(emptyMessage("Sem cursos."));
      details.append(rows);
      section.list.append(details);
    });
    if (!collections.size) section.list.append(emptyMessage("Nenhum resultado."));
    return section.section;
  };

  const load = async () => {
    setBusy(true, "Consultando…");
    try {
      const renderedPaths = Array.from(root.querySelectorAll("[data-study-path-card]:not([data-study-path-card='default'])"));
      if (renderedPaths.length) {
        expandedPathIds = new Set(renderedPaths
          .filter((card) => card.open)
          .map((card) => card.dataset.studyPathCard));
      }
      if (revealedPathId) expandedPathIds.add(revealedPathId);
      await beforeRemoteRead();
      const [collectionRows, libraryCourses, conflicts, rejected, pending] = await Promise.all([
        catalog.listCollections(catalogQuery),
        catalog.listLibrary(),
        syncEngine?.listConflicts?.() || [],
        syncEngine?.listRejectedMutations?.() || [],
        syncEngine?.listPendingMutations?.() || []
      ]);
      content.replaceChildren();
      const pendingCourseIds = new Set(array(pending).map((mutation) => text(field(mutation, "course_id", "courseId"))).filter(Boolean));
      const pendingLabel = pendingCourseIds.size
        ? "Enviar alterações deste dispositivo para a sua conta"
        : "Sincronizar este dispositivo com a sua conta";
      syncButton.title = pendingLabel;
      syncButton.setAttribute("aria-label", pendingLabel);
      content.append(
        renderCollections(collectionRows),
        renderStudyPaths(libraryCourses, pendingCourseIds)
      );
      if (conflicts.length || rejected.length) {
        const issuesSection = document.createElement("section");
        issuesSection.className = "remote-sync-issues";
        const heading = document.createElement("h3");
        heading.textContent = "Sincronização requer atenção";
        issuesSection.append(heading);
        conflicts.forEach((conflict) => {
          const issue = document.createElement("article");
          issue.className = "remote-sync-issue";
          const description = document.createElement("p");
          description.textContent = `Conflito em ${conflict.entityType}:${conflict.entityId}. Escolha qual versão preservar.`;
          issue.append(
            description,
            conflictResolutionButton("Aceitar versão remota", conflict.id, "acceptRemote"),
            conflictResolutionButton("Manter versão local", conflict.id, "keepLocal")
          );
          issuesSection.append(issue);
        });
        rejected.forEach((mutation) => {
          const issue = document.createElement("article");
          issue.className = "remote-sync-issue";
          const description = document.createElement("p");
          description.textContent = `Mutação rejeitada em ${mutation.entityType}:${mutation.entityId}: ${mutation.lastError || "payload inválido"}. Ela não será reenviada; corrija ou descarte explicitamente a alteração.`;
          issue.append(description);
          const mutationId = text(field(mutation, "mutationId", "mutation_id", "id"));
          if (mutationId && syncEngine?.discardRejectedMutation) {
            issue.append(rejectedMutationButton(mutationId));
          }
          issuesSection.append(issue);
        });
        content.append(issuesSection);
      }
      applyActiveView();
      setBusy(false, "");
      if (revealedPathId && revealedCourseId) {
        const revealedRow = root.querySelector(
          `[data-study-path-card="${CSS.escape(revealedPathId)}"] [data-course-id="${CSS.escape(revealedCourseId)}"]`
        );
        globalThis.requestAnimationFrame?.(() => revealedRow?.scrollIntoView?.({ block: "nearest" }));
        revealedPathId = "";
        revealedCourseId = "";
      }
    } catch (error) {
      setBusy(false, errorMessage(error));
    }
  };

  const emptyMessage = (message) => {
    const paragraph = document.createElement("p");
    paragraph.className = "remote-library-empty";
    paragraph.textContent = message;
    return paragraph;
  };

  const conflictResolutionButton = (label, conflictId, resolution) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-ghost remote-course-action";
    button.dataset.conflictId = conflictId;
    button.dataset.conflictResolution = resolution;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = iconMarkup(resolution);
    return button;
  };

  const rejectedMutationButton = (mutationId) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-ghost remote-course-action";
    button.dataset.rejectedMutationId = mutationId;
    button.title = "Descartar alteração rejeitada";
    button.setAttribute("aria-label", "Descartar alteração rejeitada");
    button.innerHTML = iconMarkup("rejectDiscard");
    return button;
  };

  const synchronizeAndReload = async (options = undefined) => {
    await beforeRemoteRead(options);
    await onChanged();
  };

  const openLibrary = async () => {
    if (open) return;
    open = true;
    overlay.hidden = false;
    await load();
  };

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-library-close]")) {
      open = false;
      overlay.hidden = true;
      return;
    }
    const button = event.target.closest("button");
    if (!button || busy) return;
    if (button.dataset.libraryView) {
      activeView = button.dataset.libraryView;
      applyActiveView();
      if (activeView === "collections") searchInput.focus();
      return;
    }
    if (button.dataset.pathAction) {
      event.preventDefault();
      const action = button.dataset.pathAction;
      const pathId = button.dataset.pathId;
      if (action === "trail") {
        const courseId = button.dataset.courseId;
        const chooser = root.querySelector(`[data-course-path-chooser="${CSS.escape(courseId)}"]`);
        if (!chooser) return;
        const shouldOpen = chooser.hidden;
        root.querySelectorAll("[data-course-path-chooser]").forEach((candidate) => {
          candidate.hidden = true;
          candidate.replaceChildren();
        });
        if (shouldOpen) {
          array(studyPathRepository?.loadStudyPaths?.()).forEach((path) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "remote-study-path-choice";
            row.dataset.pathAction = "addCourse";
            row.dataset.pathId = path.id;
            row.dataset.courseId = courseId;
            row.title = `Adicionar a ${path.title || "trilha"}`;
            row.setAttribute("aria-label", row.title);
            const label = document.createElement("span");
            label.textContent = path.title || "Trilha";
            row.append(label);
            row.insertAdjacentHTML("beforeend", iconMarkup("trail"));
            chooser.append(row);
          });
          chooser.hidden = false;
        }
        return;
      }
      try {
        if (action === "edit") {
          const card = button.closest("[data-study-path-card]");
          const form = card?.querySelector("[data-path-rename]");
          if (form) {
            card.open = true;
            expandedPathIds.add(pathId);
            form.hidden = !form.hidden;
            if (!form.hidden) form.querySelector("input")?.focus();
          }
          return;
        } else if (action === "detach" && button.dataset.pathItemId) {
          expandedPathIds.add(pathId);
          setBusy(true, "Salvando…");
          await studyPathRepository.removeCourseFromStudyPath(button.dataset.pathItemId);
        } else if (action === "remove") {
          if (!globalThis.confirm("Excluir esta trilha? Os cursos serão mantidos.")) return;
          setBusy(true, "Salvando…");
          await studyPathRepository.deleteStudyPath(pathId);
          expandedPathIds.delete(pathId);
        } else if (action === "addCourse") {
          revealedPathId = pathId;
          revealedCourseId = button.dataset.courseId;
          expandedPathIds.add(pathId);
          setBusy(true, "Salvando…");
          await studyPathRepository.addCourseToStudyPath(pathId, button.dataset.courseId);
        } else if (action === "moveUp" || action === "moveDown") {
          expandedPathIds.add(pathId);
          setBusy(true, "Salvando…");
          await studyPathRepository.moveCourseInStudyPath(
            button.dataset.pathItemId,
            action === "moveUp" ? "up" : "down"
          );
        }
        await studyPathRepository.flush();
        await beforeRemoteRead({ reloadWhenDomainChanges: false });
        await onStudyPathsChanged();
        await load();
      } catch (error) {
        setBusy(false, errorMessage(error));
      }
      return;
    }
    if (button.matches("[data-library-signout]")) {
      setBusy(true, "Verificando alterações pendentes…");
      try {
        const pendingCount = Number(await beforeSignOut()) || 0;
        if (
          pendingCount > 0 &&
          !globalThis.confirm(
            "Há alterações, conflitos ou rejeições preservados neste dispositivo. " +
            "Eles permanecerão associados a esta conta e voltarão quando ela entrar novamente. Deseja sair?"
          )
        ) {
          setBusy(false, "Saída cancelada; as alterações locais foram preservadas.");
          return;
        }
        setBusy(true, "Encerrando sessão…");
        await authClient.signOut();
        await onSignedOut();
      } catch (error) {
        setBusy(false, errorMessage(error));
      }
      return;
    }
    if (button.matches("[data-library-sync]")) {
      setBusy(true, "Sincronizando alterações…");
      try {
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, errorMessage(error));
      }
      return;
    }
    if (button.dataset.conflictId && button.dataset.conflictResolution) {
      setBusy(true, "Resolvendo conflito…");
      try {
        await syncEngine.resolveConflict(
          button.dataset.conflictId,
          button.dataset.conflictResolution
        );
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, errorMessage(error));
      }
      return;
    }
    if (button.dataset.rejectedMutationId) {
      if (!globalThis.confirm(
        "Descartar esta alteração rejeitada e restaurar localmente o último estado confirmado?"
      )) return;
      setBusy(true, "Descartando alteração rejeitada…");
      try {
        await syncEngine.discardRejectedMutation(
          button.dataset.rejectedMutationId,
          { rollbackLocal: true }
        );
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, errorMessage(error));
      }
      return;
    }
    if (button.dataset.courseAction === "remove") {
      const courseName = button.closest("[data-course-row]")?.dataset.courseTitle ||
        button.closest("article")?.querySelector(".card-title")?.textContent ||
        "este curso";
      if (!globalThis.confirm(
        `Remover a sua cópia de "${courseName}"? O curso oficial continuará publicado no catálogo. ` +
        "Serão removidos apenas a sua cópia, o seu progresso e os seus comentários."
      )) return;
      setBusy(true, "Removendo sua cópia…");
      try {
        let baseRevision = Number(await getCourseRevision?.(button.dataset.courseId));
        if (!Number.isInteger(baseRevision) || baseRevision < 0) {
          const graph = await catalog.downloadCourseGraph(button.dataset.courseId);
          const course = array(graph?.courses)[0];
          baseRevision = Number(field(course, "revision"));
        }
        if (!Number.isInteger(baseRevision) || baseRevision < 0) {
          throw new Error("Não foi possível confirmar a revisão atual da sua cópia.");
        }
        const result = await catalog.deleteCourse(button.dataset.courseId, baseRevision);
        if (String(result?.status || "applied").toLowerCase() === "conflict") {
          throw new Error("A cópia foi alterada no Supabase. Sincronize e tente removê-la novamente.");
        }
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, errorMessage(error));
      }
      return;
    }
    if (button.dataset.courseAction === "clone" || button.dataset.courseAction === "refresh") {
      const cloning = button.dataset.courseAction === "clone";
      setBusy(true);
      if (cloning) beginProgress({ percent: 5, message: "Criando cópia pessoal…" });
      else setText(status, "Atualizando cópia…");
      try {
        if (cloning) {
          const clonedCourseId = text(await catalog.cloneCourse(button.dataset.courseId));
          if (!clonedCourseId) throw new Error("A clonagem não retornou o UUID do curso pessoal.");
          setProgress({ percent: 18, message: "Cópia criada na sua conta." });
          await synchronizeAndReload({
            expectedCourseIds: [clonedCourseId],
            onProgress: setProgress
          });
          return;
        } else {
          await beforeRemoteRead();
          await catalog.refreshCourse(button.dataset.courseId);
        }
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, errorMessage(error));
      }
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-path-create], [data-path-rename]");
    if (!form || busy) return;
    event.preventDefault();
    const title = new FormData(form).get("path-title");
    if (!String(title || "").trim()) return;
    setBusy(true, "Salvando…");
    try {
      if (form.dataset.pathRename) {
        expandedPathIds.add(form.dataset.pathRename);
        await studyPathRepository.renameStudyPath(form.dataset.pathRename, title);
      } else {
        const created = await studyPathRepository.createStudyPath(title);
        if (created?.id) expandedPathIds.add(created.id);
      }
      await studyPathRepository.flush();
      await beforeRemoteRead({ reloadWhenDomainChanges: false });
      await onStudyPathsChanged();
      await load();
    } catch (error) {
      setBusy(false, errorMessage(error));
    }
  });

  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-catalog-search]");
    if (!input || busy) return;
    catalogQuery = input.value;
    globalThis.clearTimeout(searchTimer);
    searchTimer = globalThis.setTimeout(() => void load(), 280);
  });

  document.addEventListener("aralearn:open-library", () => {
    void openLibrary();
  });

  return { open: openLibrary, refresh: load };
}
