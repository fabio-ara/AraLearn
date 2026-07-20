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

function text(value) {
  return typeof value === "string" ? value : "";
}

function setText(node, value) {
  if (node) node.textContent = value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Operação indisponível.");
}

export function libraryErrorMessage(error) {
  const message = errorMessage(error);
  if (/curso não selecionado|seleção não autorizada|authorization_denied/iu.test(message)) {
    return "O curso não está mais nos seus cursos.";
  }
  if (/statement timeout|canceling statement due to statement timeout|upstream request timeout/iu.test(message)) {
    return "A operação demorou mais que o esperado. Tente novamente.";
  }
  return message;
}

const ACTION_ICONS = Object.freeze({
  add: "add",
  close: "remove-state",
  detach: "remove-state",
  keepLocal: "save",
  edit: "edit",
  moveDown: "arrow-down",
  moveUp: "arrow-up",
  remove: "trash",
  rejectDiscard: "trash",
  deleteAccount: "trash",
  signout: "excluded-state",
  sync: "progress",
  trail: "trail",
  addCourse: "add",
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
  onAccountDeleted = onChanged,
  beforeRemoteRead = async () => {},
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
  let loadGeneration = 0;
  let cachedCollectionRows = [];
  let cachedLibraryCourses = [];

  root.innerHTML = `
    <section class="remote-library-overlay" data-library-overlay hidden aria-label="Biblioteca">
      <div class="remote-library-backdrop" data-library-close></div>
      <div class="remote-library-panel courses-home-screen" role="dialog" aria-modal="true">
        <header class="remote-library-header">
          <div class="remote-library-tab-row">
            <nav class="remote-library-tabs" role="tablist" aria-label="Biblioteca">
              <button class="remote-library-tab is-active" type="button" role="tab" data-library-view="collections" aria-controls="remote-library-collections" aria-selected="true">${iconMarkup("collection")}<span>Coleções</span></button>
              <button class="remote-library-tab" type="button" role="tab" data-library-view="paths" aria-controls="remote-library-paths" aria-selected="false" tabindex="-1">${iconMarkup("trail")}<span>Trilhas</span></button>
            </nav>
            <button class="icon-ghost remote-library-close" type="button" data-library-close title="Fechar biblioteca" aria-label="Fechar biblioteca">${iconMarkup("close")}</button>
          </div>
          <label class="remote-catalog-search" data-library-catalog-search>
            ${renderUiIcon("search", "remote-library-action-icon")}
            <input type="search" placeholder="Pesquisar cursos" data-catalog-search aria-label="Pesquisar cursos no catálogo">
          </label>
        </header>
        <div class="remote-library-content" data-library-content></div>
        <section class="remote-account-confirm" data-account-confirm hidden role="alertdialog" aria-modal="true" aria-label="Excluir conta">
          <p>Excluir a conta e todos os dados pessoais?</p>
          <span>Cursos, trilhas, progresso e comentários serão removidos.</span>
          <div class="remote-account-confirm-actions">
            <button class="icon-ghost" type="button" data-account-cancel title="Cancelar exclusão" aria-label="Cancelar exclusão">${iconMarkup("close")}</button>
            <button class="icon-ghost is-danger" type="button" data-account-confirm-action title="Excluir conta definitivamente" aria-label="Excluir conta definitivamente">${iconMarkup("deleteAccount")}</button>
          </div>
        </section>
        <div class="remote-library-progress" data-library-progress hidden>
          <div class="remote-library-progress-track" role="progressbar" aria-label="Progresso da adição do curso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-library-progress-bar><span data-library-progress-fill></span></div>
          <span class="remote-library-progress-percent" data-library-progress-percent>0%</span>
          <ol class="remote-library-progress-log" data-library-progress-log></ol>
        </div>
        <p class="remote-library-status" data-library-status role="status" aria-live="polite"></p>
        <footer class="remote-library-footer">
          <button class="icon-ghost" type="button" data-library-sync title="Sincronizar agora" aria-label="Sincronizar agora">${iconMarkup("sync")}</button>
          <div class="remote-library-account-actions">
            <button class="icon-ghost" type="button" data-library-signout title="Sair da conta" aria-label="Sair da conta">${iconMarkup("signout")}</button>
            <button class="icon-ghost is-danger" type="button" data-library-delete-account title="Excluir conta" aria-label="Excluir conta">${iconMarkup("deleteAccount")}</button>
          </div>
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
  const accountConfirm = root.querySelector("[data-account-confirm]");
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

  const applyButtonAvailability = () => {
    root.querySelectorAll("button").forEach((button) => {
      button.disabled = busy || button.dataset.fixedDisabled === "true";
    });
  };

  const setBusy = (value, message = "") => {
    busy = value;
    applyButtonAvailability();
    if (!value) {
      progressRoot.hidden = true;
      displayedProgress = 0;
      recordedProgressMessages.clear();
      progressLog.replaceChildren();
    }
    setText(status, message);
  };

  const setAccountConfirmationVisible = (value) => {
    accountConfirm.hidden = !value;
    content.toggleAttribute("inert", value);
    root.querySelector("[data-library-delete-account]")?.setAttribute("aria-expanded", String(value));
    if (value) root.querySelector("[data-account-cancel]")?.focus();
  };

  const courseCard = (
    course,
    { showGoal = true } = {}
  ) => {
    const id = text(field(course, "course_id", "courseId", "id"));
    const title = text(field(course, "title")) || "Curso sem título";
    const goal = text(field(course, "goal"));
    const selected = Boolean(field(course, "is_selected", "isSelected"));
    const wrapper = document.createElement("article");
    wrapper.className = "clean-card course-card progress-card navigation-list-card remote-course-card";
    wrapper.dataset.courseRow = "";
    wrapper.dataset.courseTitle = title;
    wrapper.classList.toggle("is-selected", selected);
    const copy = document.createElement("div");
    copy.className = "course-copy navigation-main";
    const titleRow = document.createElement("div");
    titleRow.className = "navigation-title-row";
    const heading = document.createElement("h3");
    heading.className = "card-title";
    heading.textContent = title;
    titleRow.append(heading);
    copy.append(titleRow);
    if (showGoal && goal) {
      const description = document.createElement("p");
      description.className = "card-subtitle";
      description.textContent = goal;
      copy.append(description);
    }
    const actions = document.createElement("div");
    actions.className = "course-actions navigation-actions remote-course-actions";
    actions.append(selected
      ? actionButton("Remover dos meus cursos", "remove", id)
      : actionButton("Adicionar aos meus cursos", "add", id));
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
    const createButton = pathActionButton("Criar trilha", "add", "");
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
      if (fixed) {
        rename.dataset.fixedDisabled = "true";
        remove.dataset.fixedDisabled = "true";
      }
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
      rowActions.append(actionButton("Remover dos meus cursos", "remove", courseId));
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
      details.open = true;
      const summary = document.createElement("summary");
      const title = document.createElement("span");
      title.textContent = `${collection.title} (${collection.courses.length})`;
      summary.append(title);
      details.append(summary);
      const rows = document.createElement("div");
      rows.className = "remote-collection-courses";
      collection.courses.forEach((course) => rows.append(courseCard(course, { showGoal: false })));
      if (!collection.courses.length) rows.append(emptyMessage("Sem cursos."));
      details.append(rows);
      section.list.append(details);
    });
    if (!collections.size) section.list.append(emptyMessage("Nenhum resultado."));
    return section.section;
  };

  const localLibraryCourses = () => {
    const local = array(studyPathRepository?.loadCourseSummaries?.());
    return local.length ? local : cachedLibraryCourses;
  };

  const renderLibraryState = ({ collectionRows, libraryCourses, rejected, pending }) => {
    content.replaceChildren();
    const pendingCourseIds = new Set(array(pending)
      .map((mutation) => text(field(mutation, "course_id", "courseId")))
      .filter(Boolean));
    const pendingLabel = pendingCourseIds.size
      ? "Enviar alterações deste dispositivo para a sua conta"
      : "Sincronizar este dispositivo com a sua conta";
    syncButton.title = pendingLabel;
    syncButton.setAttribute("aria-label", pendingLabel);
    content.append(
      renderCollections(collectionRows),
      renderStudyPaths(libraryCourses, pendingCourseIds)
    );
    if (rejected.length) {
      const issuesSection = document.createElement("section");
      issuesSection.className = "remote-sync-issues";
      const heading = document.createElement("h3");
      heading.textContent = "Atenção";
      issuesSection.append(heading);
      rejected.forEach((mutation) => {
        const issue = document.createElement("article");
        issue.className = "remote-sync-issue";
        const description = document.createElement("p");
        description.textContent = mutation.lastError || "Uma alteração não pôde ser sincronizada.";
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
    if (revealedPathId && revealedCourseId) {
      const revealedRow = root.querySelector(
        `[data-study-path-card="${CSS.escape(revealedPathId)}"] [data-course-id="${CSS.escape(revealedCourseId)}"]`
      );
      globalThis.requestAnimationFrame?.(() => revealedRow?.scrollIntoView?.({ block: "nearest" }));
      revealedPathId = "";
      revealedCourseId = "";
    }
    // A renderização pode criar novos controles enquanto uma leitura remota
    // ainda está em andamento. Eles precisam herdar o mesmo estado ocupado.
    applyButtonAvailability();
  };

  const load = async ({ synchronizeBeforeRead = true } = {}) => {
    const currentGeneration = ++loadGeneration;
    const query = catalogQuery;
    setBusy(true, "Consultando…");
    let remoteError = null;
    try {
      const renderedPaths = Array.from(root.querySelectorAll("[data-study-path-card]:not([data-study-path-card='default'])"));
      if (renderedPaths.length) {
        expandedPathIds = new Set(renderedPaths
          .filter((card) => card.open)
          .map((card) => card.dataset.studyPathCard));
      }
      if (revealedPathId) expandedPathIds.add(revealedPathId);
      const [rejected, pending] = await Promise.all([
        syncEngine?.listRejectedMutations?.() || [],
        syncEngine?.listPendingMutations?.() || []
      ]);
      if (currentGeneration !== loadGeneration) return;
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        rejected,
        pending
      });
      if (globalThis.navigator?.onLine === false) {
        setBusy(false, "Offline. Alterações pendentes serão enviadas depois.");
        return;
      }
      if (synchronizeBeforeRead) {
        try {
          await beforeRemoteRead();
        } catch (error) {
          remoteError = error;
        }
      }
      try {
        [cachedCollectionRows, cachedLibraryCourses] = await Promise.all([
          catalog.listCollections(query),
          catalog.listLibrary()
        ]);
      } catch (error) {
        remoteError ||= error;
      }
      if (currentGeneration !== loadGeneration) return;
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        rejected,
        pending
      });
      setBusy(false, remoteError ? "Offline. Alterações pendentes serão enviadas depois." : "");
    } catch (error) {
      if (currentGeneration !== loadGeneration) return;
      try {
        const [rejected, pending] = await Promise.all([
          syncEngine?.listRejectedMutations?.() || [],
          syncEngine?.listPendingMutations?.() || []
        ]);
        renderLibraryState({
          collectionRows: cachedCollectionRows,
          libraryCourses: localLibraryCourses(),
          rejected,
          pending
        });
      } catch {
        // A falha local permanece visível pelo estado de durabilidade do aplicativo.
      }
      setBusy(false, libraryErrorMessage(error));
    }
  };

  const emptyMessage = (message) => {
    const paragraph = document.createElement("p");
    paragraph.className = "remote-library-empty empty-state-copy";
    paragraph.textContent = message;
    return paragraph;
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
            const row = document.createElement("div");
            row.className = "remote-study-path-choice";
            const label = document.createElement("span");
            label.textContent = path.title || "Trilha";
            const add = pathActionButton(
              `Adicionar a ${path.title || "trilha"}`,
              "addCourse",
              path.id,
              "",
              courseId
            );
            row.append(label, add);
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
        await onStudyPathsChanged();
        await load({ synchronizeBeforeRead: true });
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
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
            "Há alterações pendentes ou rejeitadas preservadas neste dispositivo. " +
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
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-library-delete-account]")) {
      setAccountConfirmationVisible(true);
      return;
    }
    if (button.matches("[data-account-cancel]")) {
      setAccountConfirmationVisible(false);
      return;
    }
    if (button.matches("[data-account-confirm-action]")) {
      setBusy(true, "Excluindo conta…");
      try {
        await catalog.deleteOwnAccount();
        await onAccountDeleted();
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
        setAccountConfirmationVisible(false);
      }
      return;
    }
    if (button.matches("[data-library-sync]")) {
      setBusy(true, "Sincronizando alterações…");
      try {
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.dataset.rejectedMutationId) {
      if (!globalThis.confirm(
        "Descartar esta alteração e recuperar o estado confirmado da conta?"
      )) return;
      setBusy(true, "Descartando alteração rejeitada…");
      try {
        await syncEngine.discardRejectedMutation(button.dataset.rejectedMutationId);
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.dataset.courseAction === "remove") {
      const courseName = button.closest("[data-course-row]")?.dataset.courseTitle ||
        button.closest("article")?.querySelector(".card-title")?.textContent ||
        "este curso";
      if (!globalThis.confirm(
        `Remover "${courseName}" dos seus cursos? O catálogo não será alterado. ` +
        "O progresso e os comentários deste curso serão excluídos."
      )) return;
      setBusy(true, "Removendo curso…");
      try {
        await catalog.unselectCourse(button.dataset.courseId);
        await syncEngine.confirmSelectedCourseRemoval(button.dataset.courseId);
        await synchronizeAndReload();
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.dataset.courseAction === "add") {
      setBusy(true);
      beginProgress({ percent: 5, message: "Adicionando curso…" });
      try {
        const selection = await catalog.selectCourse(button.dataset.courseId);
        const selectedCourseId = text(field(selection, "courseId", "course_id")) || button.dataset.courseId;
        setProgress({ percent: 18, message: "Curso adicionado à sua conta." });
        await synchronizeAndReload({
          expectedCourseIds: [selectedCourseId],
          onProgress: setProgress
        });
        return;
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
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
      await onStudyPathsChanged();
      await load({ synchronizeBeforeRead: true });
    } catch (error) {
      setBusy(false, libraryErrorMessage(error));
    }
  });

  root.addEventListener("input", (event) => {
    const input = event.target.closest("[data-catalog-search]");
    if (!input) return;
    catalogQuery = input.value;
    loadGeneration += 1;
    globalThis.clearTimeout(searchTimer);
    searchTimer = globalThis.setTimeout(() => void load({ synchronizeBeforeRead: false }), 280);
  });

  document.addEventListener("aralearn:open-library", () => {
    void openLibrary();
  });

  return { open: openLibrary, refresh: load };
}
