import { renderUiIcon } from "./renderUiIcons.js";
import { createAuthoringAssistantPanel } from "./AuthoringAssistantPanel.js";
import { CurrentStateCentral } from "../supabase/CurrentStateCentral.js";
import {
  EDUCATIONAL_WORKSPACE_ROLES,
  educationalWorkspaceRoleLabel
} from "../domain/educationalWorkspace.js";
import {
  PEDAGOGICAL_COMMENT_CATEGORIES,
  PEDAGOGICAL_COMMENT_STATUSES,
  pedagogicalCommentCategoryLabel,
  pedagogicalCommentStatusLabel
} from "../domain/pedagogicalComment.js";

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

export function localDraftCourseStatus(update) {
  if (
    !update ||
    update.reason !== "local_draft" ||
    !text(update.localDraftRevision).trim()
  ) {
    return null;
  }
  const remoteUpdateAvailable = update.remoteUpdateAvailable === true;
  return Object.freeze({
    courseId: text(update.courseId).trim(),
    courseOrigin: text(update.courseOrigin).trim(),
    localDraftRevision: text(update.localDraftRevision).trim(),
    remoteUpdateAvailable,
    label: remoteUpdateAvailable
      ? "Alterações locais · revisão oficial nova"
      : "Alterações locais",
    description: remoteUpdateAvailable
      ? "Este dispositivo preservou alterações locais. Uma revisão oficial nova está disponível, mas não substituirá o trabalho automaticamente."
      : "Este dispositivo preservou alterações locais que não serão substituídas automaticamente."
  });
}

export function localDraftDiscardConfirmation({
  title = "Curso",
  courseOrigin = "",
  remoteUpdateAvailable = false
} = {}) {
  const normalizedTitle = text(title).trim() || "Curso";
  const originLabel = courseOrigin === "private"
    ? "curso privado"
    : "curso do catálogo";
  const revisionLabel = remoteUpdateAvailable
    ? "a nova revisão oficial"
    : "a revisão oficial atual";
  return (
    `Descartar todas as alterações locais de "${normalizedTitle}" e restaurar ` +
    `${revisionLabel} do ${originLabel}?\n\n` +
    "Essa ação não pode ser desfeita. A revisão oficial na sua conta não será alterada."
  );
}

export function localDraftDiscardErrorMessage(
  error,
  { online = globalThis.navigator?.onLine !== false } = {}
) {
  if (!online) {
    return "Offline. Nada foi descartado; as alterações locais permanecem neste dispositivo.";
  }
  if (error?.code === "local_course_draft_changed") {
    return "As alterações locais mudaram em outra aba. Nada foi descartado; revise o curso e confirme novamente.";
  }
  if (error?.code === "official_course_revision_changed" || error?.courseSelectionStale === true) {
    return "A revisão oficial mudou durante a operação. Nada foi descartado; sincronize e confirme novamente.";
  }
  if (
    error?.catalogReplicaReconciliationRequired === true ||
    /alteraç(?:ão|ões).*(?:pendente|rejeitada)|reconcilia(?:ção|r)/iu.test(errorMessage(error))
  ) {
    return "Há alterações pendentes ou rejeitadas para este curso. Nada foi descartado; resolva a sincronização antes de restaurar a revisão oficial.";
  }
  if (
    error instanceof TypeError &&
    /failed to fetch|fetch failed|network|offline|load failed|connection/iu.test(errorMessage(error))
  ) {
    return "Não foi possível baixar a revisão oficial. Nada foi descartado; as alterações locais permanecem neste dispositivo.";
  }
  return `${libraryErrorMessage(error)} Nada foi descartado; as alterações locais foram preservadas.`;
}

function remoteReadStatus(error) {
  const message = errorMessage(error).toLowerCase();
  const offline = globalThis.navigator?.onLine === false ||
    (error instanceof TypeError && /failed to fetch|fetch failed|network|offline|load failed|connection/u.test(message));
  return offline
    ? "Offline. Alterações pendentes serão enviadas depois."
    : "Não foi possível atualizar a biblioteca.";
}

function workspaceRequestId(operation) {
  return `workspace:${operation}:${globalThis.crypto.randomUUID()}`;
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
  discardLocalDraft: "trash",
  deleteAccount: "trash",
  signout: "excluded-state",
  sync: "progress",
  trail: "trail",
  addCourse: "add",
  collection: "folder",
  sparkles: "sparkles",
  central: "graph",
  construction: "edit",
  evaluation: "preview",
  review: "review",
  observations: "prompt",
  play: "play",
  device: "cloud",
  back: "arrow-left",
  more: "arrow-down",
  copy: "copy"
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
  projectUrl = "",
  syncEngine = null,
  studyPathRepository = null,
  onChanged = () => globalThis.location?.reload?.(),
  onStudyPathsChanged = onChanged,
  onLocalDraftRestored = onChanged,
  onOpenCommentTarget = null,
  onOpenStudyTarget = null,
  onSignedOut = onChanged,
  onAccountDeleted = onChanged,
  beforeRemoteRead = async () => {},
  beforeSignOut = async () => 0
} = {}) {
  if (!root || !catalog || !authClient) throw new TypeError("Dependências da biblioteca remota ausentes.");
  let open = false;
  let busy = false;
  let catalogQuery = "";
  let activeView = "central";
  let expandedPathIds = new Set();
  let revealedPathId = "";
  let revealedCourseId = "";
  let searchTimer = null;
  let loadGeneration = 0;
  let cachedCollectionRows = [];
  let cachedLibraryCourses = [];
  let centralOverview = null;
  let centralDetail = null;
  let centralWorkspace = null;
  let centralWorkspaceComments = null;
  let workspaceCommentCategory = "";
  let workspaceCommentStatus = "";
  let workspaceInviteCode = "";
  let capabilities = Object.freeze({
    catalogPromotion: false
  });
  let assistantOpen = false;
  let accountConfirmationReturnToLibrary = false;
  const central = new CurrentStateCentral({ catalog, authClient });

  root.innerHTML = `
    <section class="remote-library-overlay" data-library-overlay hidden aria-label="Central">
      <div class="remote-library-backdrop" data-library-close></div>
      <div class="remote-library-panel courses-home-screen" role="dialog" aria-modal="true">
        <header class="remote-library-header">
          <div class="remote-library-tab-row">
            <nav class="remote-library-tabs" role="tablist" aria-label="Central">
              <button class="remote-library-tab is-active" type="button" role="tab" data-library-view="central" aria-controls="remote-library-central" aria-selected="true">${iconMarkup("central")}<span>Central</span></button>
              <button class="remote-library-tab" type="button" role="tab" data-library-view="collections" aria-controls="remote-library-collections" aria-selected="false" tabindex="-1">${iconMarkup("collection")}<span>Coleções</span></button>
              <button class="remote-library-tab" type="button" role="tab" data-library-view="paths" aria-controls="remote-library-paths" aria-selected="false" tabindex="-1">${iconMarkup("trail")}<span>Trilhas</span></button>
              <button class="remote-library-assistants-trigger" type="button" role="tab" data-library-assistant aria-controls="remote-library-assistants" aria-selected="false" tabindex="-1" aria-label="Abrir chatbot">${iconMarkup("sparkles")}<span>Chatbot</span></button>
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
          <div class="remote-library-progress-track" role="progressbar" aria-label="Progresso da operação na biblioteca" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-library-progress-bar><span data-library-progress-fill></span></div>
          <span class="remote-library-progress-percent" data-library-progress-percent>0%</span>
          <ol class="remote-library-progress-log" data-library-progress-log></ol>
        </div>
        <p class="remote-library-status" data-library-status role="status" aria-live="polite"></p>
        <footer class="remote-library-footer">
          <div class="remote-library-primary-actions">
            <button class="icon-ghost" type="button" data-library-sync title="Sincronizar agora" aria-label="Sincronizar agora">${iconMarkup("sync")}</button>
          </div>
          <div class="theme-choice" role="group" aria-label="Aparência">
            <button class="theme-choice-button" type="button" data-theme-choice="system" title="Usar tema do sistema" aria-label="Usar tema do sistema">${renderUiIcon("theme-system", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="light" title="Usar tema claro" aria-label="Usar tema claro">${renderUiIcon("theme-light", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="dark" title="Usar tema escuro" aria-label="Usar tema escuro">${renderUiIcon("theme-dark", "theme-choice-icon")}</button>
          </div>
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
  const assistantButton = root.querySelector("[data-library-assistant]");
  const themeButtons = [...root.querySelectorAll("[data-theme-choice]")];
  const accountConfirm = root.querySelector("[data-account-confirm]");
  const searchRoot = root.querySelector("[data-library-catalog-search]");
  const searchInput = root.querySelector("[data-catalog-search]");
  const assistantsPanel = createAuthoringAssistantPanel({
    projectUrl,
    getAccessToken: () => authClient.getAccessToken()
  });
  let displayedProgress = 0;
  const recordedProgressMessages = new Set();

  const syncThemeButtons = () => {
    const preference = globalThis.AraLearnTheme?.getState?.().preference || "system";
    themeButtons.forEach((button) => {
      const selected = button.dataset.themeChoice === preference;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("is-active", selected);
    });
  };
  syncThemeButtons();
  globalThis.addEventListener?.("aralearn:themechange", syncThemeButtons);

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

  const courseOrigin = (course) => {
    const origin = text(field(course, "course_origin", "courseOrigin"));
    if (origin === "catalog" || origin === "private") return origin;
    throw new TypeError("A origem do curso é obrigatória.");
  };

  const hasCourseOrigin = (course) => {
    const origin = text(field(course, "course_origin", "courseOrigin"));
    return origin === "catalog" || origin === "private";
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
    const assistantSelected = assistantOpen;
    root.querySelectorAll("[data-library-view]").forEach((button) => {
      const selected = !assistantSelected && button.dataset.libraryView === activeView;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    assistantButton?.classList.toggle("is-active", assistantSelected);
    assistantButton?.setAttribute("aria-selected", String(assistantSelected));
    if (assistantButton) assistantButton.tabIndex = assistantSelected ? 0 : -1;
    root.querySelectorAll("[data-library-view-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.libraryViewPanel !== activeView;
    });
    const auxiliaryPanelOpen = assistantOpen;
    searchRoot.hidden = auxiliaryPanelOpen || activeView !== "collections";
  };

  const closeAssistant = () => {
    if (!assistantOpen) return;
    assistantOpen = false;
    assistantsPanel?.close();
    assistantButton?.setAttribute("aria-expanded", "false");
  };

  const openAssistant = async () => {
    if (assistantOpen) return;
    assistantOpen = true;
    assistantButton?.setAttribute("aria-expanded", "true");
    searchRoot.hidden = true;
    setText(status, "");
    content.replaceChildren(assistantsPanel.element);
    await assistantsPanel.open({ catalogAccess: capabilities.catalogPromotion });
    applyActiveView();
    applyButtonAvailability();
  };

  const renderStudyPaths = (libraryCourses, pendingCourseIds, deferredUpdates) => {
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
    const localDraftByCourseId = new Map(array(deferredUpdates)
      .map(localDraftCourseStatus)
      .filter(Boolean)
      .map((draft) => [draft.courseId, draft]));
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
      const origin = courseOrigin(course);
      row.classList.add(`is-${origin}`);
      row.dataset.courseRow = "";
      row.dataset.courseId = courseId;
      row.dataset.courseOrigin = origin;
      const copy = document.createElement("div");
      copy.className = "remote-study-path-course-copy";
      const label = document.createElement("span");
      label.className = "remote-study-path-course-title";
      label.textContent = text(field(course, "title")) || "Curso";
      label.title = label.textContent;
      row.dataset.courseTitle = label.textContent;
      copy.append(label);
      const localDraft = localDraftByCourseId.get(courseId) || null;
      if (localDraft) {
        const draftStatus = document.createElement("span");
        draftStatus.className = "remote-course-local-draft";
        draftStatus.dataset.localDraftStatus = localDraft.remoteUpdateAvailable
          ? "remote-update"
          : "local-only";
        draftStatus.textContent = localDraft.label;
        draftStatus.title = localDraft.description;
        copy.append(draftStatus);
      }
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
      if (localDraft && typeof syncEngine?.restoreDeferredCourseRevision === "function") {
        const discard = actionButton(
          localDraft.remoteUpdateAvailable
            ? "Descartar alterações locais e usar a nova revisão oficial"
            : "Descartar alterações locais e restaurar a revisão oficial",
          "discardLocalDraft",
          courseId
        );
        delete discard.dataset.courseAction;
        discard.classList.add("is-danger");
        discard.dataset.localDraftDiscard = "";
        discard.dataset.localDraftRevision = localDraft.localDraftRevision;
        discard.dataset.courseOrigin = origin;
        discard.dataset.courseTitle = label.textContent;
        discard.dataset.remoteUpdateAvailable = String(localDraft.remoteUpdateAvailable);
        rowActions.append(discard);
      }
      rowActions.append(actionButton("Remover dos meus cursos", "remove", courseId));
      row.append(copy, rowActions);
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

  const centralDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  };

  const centralDeviceCount = ({ rejected, pending, deferredUpdates }) => {
    const courseIds = new Set();
    for (const entry of [...array(pending), ...array(deferredUpdates)]) {
      const id = text(field(entry, "course_id", "courseId"));
      if (id) courseIds.add(id);
    }
    return courseIds.size + array(rejected).length;
  };

  const centralSummaryCard = ({ section, label, count, icon, note = "" }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "remote-central-summary-card";
    button.dataset.centralSection = section;
    button.setAttribute("aria-label", `${label}: ${count}`);
    const symbol = document.createElement("span");
    symbol.className = "remote-central-summary-icon";
    symbol.innerHTML = iconMarkup(icon);
    const copy = document.createElement("span");
    copy.className = "remote-central-summary-copy";
    const title = document.createElement("strong");
    title.textContent = label;
    const description = document.createElement("span");
    description.textContent = note || `${count} ${count === 1 ? "item" : "itens"}`;
    copy.append(title, description);
    const value = document.createElement("span");
    value.className = "remote-central-summary-count";
    value.textContent = String(count);
    button.append(symbol, copy, value);
    return button;
  };

  const centralItemCopy = (section, item) => {
    const article = document.createElement(section === "construction" ? "button" : "article");
    article.className = "remote-central-item";
    if (section === "construction") {
      article.type = "button";
      article.dataset.centralWorkspace = text(item.workspaceId);
      article.setAttribute("aria-label", `Abrir ${text(item.title) || "workspace"}`);
    }
    const title = document.createElement("strong");
    title.textContent = text(item.title) || "Sem título";
    const meta = document.createElement("span");
    if (section === "construction") {
      const publications = Number(item.publicationCount) || 0;
      const publicationCopy = publications
        ? `${publications} ${publications === 1 ? "publicação" : "publicações"}`
        : "Em construção";
      meta.textContent = `${educationalWorkspaceRoleLabel(item.role)} · ${publicationCopy}`;
    } else if (section === "trails") {
      const modules = Number(item.moduleCount) || 0;
      const lessons = Number(item.lessonCount) || 0;
      meta.textContent = `${modules} ${modules === 1 ? "módulo" : "módulos"} · ${lessons} ${lessons === 1 ? "lição" : "lições"}`;
    } else if (section === "evaluation") {
      const statusLabel = item.status === "in_review" ? "Em revisão" : "Enviado";
      meta.textContent = item.claimedByMe ? `${statusLabel} por você` : statusLabel;
    } else {
      meta.textContent = text(item.completionState) === "complete" ? "Completo" : "Parcial";
    }
    const date = centralDate(item.updatedAt || item.lastStudyStateAt || item.submittedAt);
    if (date) meta.textContent += ` · ${date}`;
    article.append(title, meta);
    return article;
  };

  const workspaceRoleSelect = (member) => {
    const select = document.createElement("select");
    select.dataset.workspaceMemberRole = member.userId;
    select.setAttribute("aria-label", `Papel de ${member.email || "membro"}`);
    for (const role of EDUCATIONAL_WORKSPACE_ROLES.filter((value) => value !== "owner")) {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = educationalWorkspaceRoleLabel(role);
      option.selected = member.role === role;
      select.append(option);
    }
    return select;
  };

  const renderWorkspace = () => {
    const section = document.createElement("section");
    section.className = "remote-library-view remote-central-view remote-workspace-view";
    section.id = "remote-library-central";
    section.dataset.libraryViewPanel = "central";
    section.setAttribute("role", "tabpanel");
    const header = document.createElement("header");
    header.className = "remote-central-detail-header";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "icon-ghost";
    back.dataset.centralWorkspaceBack = "";
    back.title = "Voltar";
    back.setAttribute("aria-label", back.title);
    back.innerHTML = iconMarkup("back");
    const heading = document.createElement("h2");
    heading.textContent = centralWorkspace?.title || "Workspace";
    header.append(back, heading);
    section.append(header);
    if (!centralWorkspace) {
      section.append(emptyMessage("Workspace indisponível."));
      return section;
    }
    const summary = document.createElement("article");
    summary.className = "remote-workspace-summary";
    if (centralWorkspace.purpose) {
      const purpose = document.createElement("p");
      purpose.textContent = centralWorkspace.purpose;
      summary.append(purpose);
    }
    const meta = document.createElement("span");
    meta.textContent = `${educationalWorkspaceRoleLabel(centralWorkspace.role)} · ` +
      `${centralWorkspace.courseCount} ${centralWorkspace.courseCount === 1 ? "curso" : "cursos"}`;
    summary.append(meta);
    section.append(summary);

    if (array(centralWorkspace.courses).length) {
      const courses = sectionWithHeading("Cursos");
      courses.section.classList.add("remote-workspace-courses");
      for (const course of centralWorkspace.courses) {
        const row = document.createElement("article");
        row.className = "remote-workspace-course";
        const title = document.createElement("strong");
        title.textContent = course.title || "Curso";
        const progress = document.createElement("span");
        progress.textContent = course.microsequenceCount
          ? `${course.readyMicrosequenceCount} de ${course.microsequenceCount} microssequências prontas`
          : "Planejamento sem microssequências";
        const structure = document.createElement("small");
        structure.textContent = `${course.moduleCount} ${course.moduleCount === 1 ? "módulo" : "módulos"} · ` +
          `${course.lessonCount} ${course.lessonCount === 1 ? "lição" : "lições"} · ` +
          `${course.cardCount} ${course.cardCount === 1 ? "card" : "cards"}`;
        row.append(title, progress, structure);
        if (array(course.publicationTargets).length) {
          const targets = document.createElement("small");
          targets.textContent = course.publicationTargets
            .map((target) => target === "catalog" ? "Em Coleções" : "Em Trilhas")
            .join(" · ");
          row.append(targets);
        }
        courses.list.append(row);
      }
      if (centralWorkspace.courseCount > centralWorkspace.courses.length) {
        courses.list.append(emptyMessage(
          `${centralWorkspace.courseCount - centralWorkspace.courses.length} cursos adicionais.`
        ));
      }
      section.append(courses.section);
    }

    const canAct = !centralWorkspace.stale && globalThis.navigator?.onLine !== false;
    if (centralWorkspace.capabilities.manage && canAct) {
      const form = document.createElement("form");
      form.className = "remote-workspace-metadata-form";
      form.dataset.workspaceUpdate = centralWorkspace.workspaceId;
      const title = document.createElement("input");
      title.type = "text";
      title.name = "workspace-title";
      title.required = true;
      title.maxLength = 300;
      title.value = centralWorkspace.title;
      title.placeholder = "Nome";
      title.setAttribute("aria-label", "Nome do workspace");
      const purpose = document.createElement("textarea");
      purpose.name = "workspace-purpose";
      purpose.maxLength = 1000;
      purpose.rows = 2;
      purpose.value = centralWorkspace.purpose;
      purpose.placeholder = "Finalidade";
      purpose.setAttribute("aria-label", "Finalidade do workspace");
      const kind = document.createElement("select");
      kind.name = "workspace-kind";
      kind.setAttribute("aria-label", "Tipo do workspace");
      for (const [value, label] of [["personal", "Pessoal"], ["class", "Turma"], ["team", "Equipe"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = centralWorkspace.kind === value;
        kind.append(option);
      }
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "icon-ghost";
      save.title = "Salvar workspace";
      save.setAttribute("aria-label", save.title);
      save.innerHTML = iconMarkup("edit");
      form.append(title, purpose, kind, save);
      section.append(form);
    }

    const people = sectionWithHeading("Pessoas");
    people.section.classList.add("remote-workspace-people");
    for (const member of array(centralWorkspace.members)) {
      const row = document.createElement("article");
      row.className = "remote-workspace-member";
      const copy = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = member.email || (member.userId === authClient.getSession?.()?.user?.id
        ? "Você"
        : "Membro");
      const role = document.createElement("span");
      role.textContent = educationalWorkspaceRoleLabel(member.role);
      copy.append(name, role);
      row.append(copy);
      const canManageMember = canAct && centralWorkspace.capabilities.manage &&
        !member.primaryOwner && (centralWorkspace.role === "owner" ||
          !["owner", "admin"].includes(member.role));
      const canTransferToMember = canAct && centralWorkspace.capabilities.transfer &&
        !member.primaryOwner;
      if (canManageMember || canTransferToMember) {
        const actions = document.createElement("div");
        actions.className = "remote-workspace-member-actions";
        if (canManageMember) {
          actions.append(workspaceRoleSelect(member));
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "icon-ghost";
          remove.dataset.workspaceRemoveMember = member.userId;
          remove.title = "Remover membro";
          remove.setAttribute("aria-label", remove.title);
          remove.innerHTML = iconMarkup("remove");
          actions.append(remove);
        }
        if (canTransferToMember) {
          const transfer = document.createElement("button");
          transfer.type = "button";
          transfer.className = "icon-ghost";
          transfer.dataset.workspaceTransferOwner = member.userId;
          transfer.title = "Transferir propriedade";
          transfer.setAttribute("aria-label", transfer.title);
          transfer.innerHTML = iconMarkup("trail");
          actions.append(transfer);
        }
        row.append(actions);
      }
      people.list.append(row);
    }
    section.append(people.section);

    if (centralWorkspace.capabilities.comment && canAct) {
      const comments = document.createElement("button");
      comments.type = "button";
      comments.className = "remote-central-related";
      comments.dataset.workspaceComments = centralWorkspace.workspaceId;
      comments.innerHTML = `${iconMarkup("evaluation")}<span>Observações</span>`;
      section.append(comments);
    }

    if (centralWorkspace.capabilities.manage && canAct) {
      const form = document.createElement("form");
      form.className = "remote-workspace-inline-form";
      form.dataset.workspaceInvite = centralWorkspace.workspaceId;
      const email = document.createElement("input");
      email.type = "email";
      email.name = "workspace-email";
      email.required = true;
      email.maxLength = 320;
      email.placeholder = "email@exemplo.pt";
      email.setAttribute("aria-label", "E-mail do novo membro");
      const role = document.createElement("select");
      role.name = "workspace-role";
      role.setAttribute("aria-label", "Papel do novo membro");
      for (const value of EDUCATIONAL_WORKSPACE_ROLES.filter((item) => item !== "owner")) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = educationalWorkspaceRoleLabel(value);
        option.selected = value === "learner";
        role.append(option);
      }
      const invite = document.createElement("button");
      invite.type = "submit";
      invite.className = "icon-ghost";
      invite.title = "Criar convite";
      invite.setAttribute("aria-label", invite.title);
      invite.innerHTML = iconMarkup("add");
      form.append(email, role, invite);
      section.append(form);

      for (const invitation of array(centralWorkspace.invitations)) {
        const row = document.createElement("article");
        row.className = "remote-workspace-member remote-workspace-invitation";
        const copy = document.createElement("div");
        const emailCopy = document.createElement("strong");
        emailCopy.textContent = invitation.email;
        const roleCopy = document.createElement("span");
        roleCopy.textContent = `${educationalWorkspaceRoleLabel(invitation.role)} · convite pendente`;
        copy.append(emailCopy, roleCopy);
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "icon-ghost";
        cancel.dataset.workspaceCancelInvite = invitation.invitationId;
        cancel.title = "Cancelar convite";
        cancel.setAttribute("aria-label", cancel.title);
        cancel.innerHTML = iconMarkup("close");
        row.append(copy, cancel);
        section.append(row);
      }
    }
    if (workspaceInviteCode) {
      const code = document.createElement("button");
      code.type = "button";
      code.className = "remote-workspace-invite-code";
      code.dataset.workspaceCopyInvite = workspaceInviteCode;
      code.innerHTML = `${iconMarkup("copy")}<span>Copiar convite</span>`;
      section.append(code);
    }
    if (centralWorkspace.role !== "owner" && canAct) {
      const leave = document.createElement("button");
      leave.type = "button";
      leave.className = "remote-central-related";
      leave.dataset.workspaceLeave = centralWorkspace.workspaceId;
      leave.innerHTML = `${iconMarkup("signout")}<span>Sair do workspace</span>`;
      section.append(leave);
    }
    if (centralWorkspace.stale) {
      const note = document.createElement("p");
      note.className = "remote-central-cache-note";
      note.textContent = "Último estado conhecido.";
      section.append(note);
    }
    return section;
  };

  const renderWorkspaceComments = () => {
    const optionNode = (label, value, selected = false) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = selected;
      return option;
    };
    const section = document.createElement("section");
    section.className = "remote-library-view remote-central-view remote-workspace-comments-view";
    section.id = "remote-library-central";
    section.dataset.libraryViewPanel = "central";
    section.setAttribute("role", "tabpanel");
    const header = document.createElement("header");
    header.className = "remote-central-detail-header";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "icon-ghost";
    back.dataset.workspaceCommentsBack = "";
    back.title = "Voltar ao workspace";
    back.setAttribute("aria-label", back.title);
    back.innerHTML = iconMarkup("back");
    const heading = document.createElement("h2");
    heading.textContent = "Observações";
    header.append(back, heading);
    section.append(header);

    const filters = document.createElement("div");
    filters.className = "remote-workspace-comment-filters";
    const category = document.createElement("select");
    category.dataset.workspaceCommentFilter = "category";
    category.setAttribute("aria-label", "Filtrar por tipo");
    category.append(optionNode("Todos os tipos", "", !workspaceCommentCategory));
    for (const item of PEDAGOGICAL_COMMENT_CATEGORIES) {
      category.append(optionNode(
        item.label,
        item.value,
        workspaceCommentCategory === item.value
      ));
    }
    const statusSelect = document.createElement("select");
    statusSelect.dataset.workspaceCommentFilter = "status";
    statusSelect.setAttribute("aria-label", "Filtrar por estado");
    statusSelect.append(optionNode("Todos os estados", "", !workspaceCommentStatus));
    for (const item of PEDAGOGICAL_COMMENT_STATUSES) {
      statusSelect.append(optionNode(
        item.label,
        item.value,
        workspaceCommentStatus === item.value
      ));
    }
    filters.append(category, statusSelect);
    section.append(filters);

    if (centralWorkspace.capabilities.review && centralWorkspaceComments?.summary) {
      const summary = centralWorkspaceComments.summary;
      const indicators = document.createElement("div");
      indicators.className = "remote-workspace-comment-summary";
      for (const [count, label] of [
        [summary.openCount, "abertas"],
        [summary.byCategory?.possibleError, "possíveis erros"],
        [summary.byCategory?.confusing, "confusas"],
        [summary.byCategory?.suggestion, "sugestões"]
      ]) {
        const indicator = document.createElement("span");
        indicator.textContent = `${Number(count) || 0} ${label}`;
        indicators.append(indicator);
      }
      section.append(indicators);

      if (array(summary.focusCards).length) {
        const focus = document.createElement("details");
        focus.className = "remote-workspace-comment-focus";
        const focusHeading = document.createElement("summary");
        focusHeading.textContent = `Pontos de melhoria (${summary.focusCards.length})`;
        focus.append(focusHeading);
        const focusList = document.createElement("div");
        for (const card of array(summary.focusCards)) {
          const item = document.createElement("span");
          const title = document.createElement("strong");
          title.textContent = card.cardTitle || card.courseTitle || "Card indisponível";
          const count = document.createElement("small");
          count.textContent = `${card.openCount} abertas · ${card.totalCount} no total`;
          item.append(title, count);
          if (
            card.targetAvailable === true &&
            Array.isArray(card.entityPath) &&
            typeof onOpenCommentTarget === "function"
          ) {
            const openTarget = document.createElement("button");
            openTarget.type = "button";
            openTarget.className = "icon-ghost";
            openTarget.dataset.workspaceCommentFocusOpen = card.cardId;
            openTarget.title = "Abrir card para editar";
            openTarget.setAttribute(
              "aria-label",
              `Abrir ponto de melhoria ${card.cardTitle || "do card"} para editar`
            );
            openTarget.innerHTML = iconMarkup("edit");
            item.append(openTarget);
          }
          focusList.append(item);
        }
        focus.append(focusList);
        section.append(focus);
      }
    }

    const list = document.createElement("div");
    list.className = "remote-workspace-comment-list";
    for (const comment of array(centralWorkspaceComments?.items)) {
      const article = document.createElement("article");
      article.className = "remote-workspace-comment";
      const meta = document.createElement("span");
      meta.textContent = `${pedagogicalCommentCategoryLabel(comment.category)} · ` +
        `${pedagogicalCommentStatusLabel(comment.status)}`;
      const title = document.createElement("strong");
      title.textContent = comment.cardTitle || comment.courseTitle || "Card indisponível";
      const body = document.createElement("p");
      body.textContent = comment.body;
      const author = document.createElement("small");
      author.textContent = comment.author?.email || "Participante";
      article.append(meta, title, body, author);
      if (
        comment.targetAvailable === true &&
        Array.isArray(comment.entityPath) &&
        typeof onOpenCommentTarget === "function"
      ) {
        const openTarget = document.createElement("button");
        openTarget.type = "button";
        openTarget.className = "icon-ghost remote-workspace-comment-open";
        openTarget.dataset.workspaceCommentOpen = comment.commentId;
        openTarget.title = "Abrir card para editar";
        openTarget.setAttribute(
          "aria-label",
          `Abrir card ${comment.cardTitle || "da observação"} para editar`
        );
        openTarget.innerHTML = iconMarkup("edit");
        article.append(openTarget);
      }
      if (comment.response) {
        const response = document.createElement("blockquote");
        response.textContent = comment.response;
        article.append(response);
      }
      if (centralWorkspace.capabilities.review) {
        const form = document.createElement("form");
        form.className = "remote-workspace-comment-response";
        form.dataset.workspaceCommentResponse = comment.commentId;
        const input = document.createElement("textarea");
        input.name = "comment-response";
        input.rows = 2;
        input.maxLength = 2000;
        input.required = true;
        input.placeholder = "Responder";
        input.setAttribute("aria-label", `Responder a ${comment.author?.email || "participante"}`);
        const send = document.createElement("button");
        send.type = "submit";
        send.className = "icon-ghost";
        send.title = "Enviar resposta";
        send.setAttribute("aria-label", send.title);
        send.innerHTML = iconMarkup("add");
        const state = document.createElement("select");
        state.dataset.workspaceCommentStatus = comment.commentId;
        state.setAttribute("aria-label", `Estado da observação de ${comment.author?.email || "participante"}`);
        for (const item of PEDAGOGICAL_COMMENT_STATUSES) {
          state.append(optionNode(item.label, item.value, comment.status === item.value));
        }
        form.append(input, send, state);
        article.append(form);
      }
      list.append(article);
    }
    if (!list.childElementCount) list.append(emptyMessage("Nenhuma observação."));
    section.append(list);
    if (centralWorkspaceComments?.hasMore) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "remote-central-more";
      more.dataset.workspaceCommentsMore = "";
      more.textContent = "Ver mais";
      section.append(more);
    }
    return section;
  };

  const renderCentralDetail = (localState) => {
    const section = document.createElement("section");
    section.className = "remote-library-view remote-central-view";
    section.id = "remote-library-central";
    section.dataset.libraryViewPanel = "central";
    section.setAttribute("role", "tabpanel");
    const header = document.createElement("header");
    header.className = "remote-central-detail-header";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "icon-ghost";
    back.dataset.centralBack = "";
    back.title = "Voltar à Central";
    back.setAttribute("aria-label", back.title);
    back.innerHTML = iconMarkup("back");
    const heading = document.createElement("h2");
    heading.textContent = centralDetail.label;
    header.append(back, heading);
    section.append(header);

    if (centralDetail.section === "evaluation" && capabilities.catalogReview) {
      const audience = document.createElement("div");
      audience.className = "remote-central-audience";
      for (const [value, label] of [["mine", "Meus"], ["queue", "Fila"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.centralAudience = value;
        button.className = value === centralDetail.audience ? "is-active" : "";
        button.textContent = label;
        button.setAttribute("aria-pressed", String(value === centralDetail.audience));
        audience.append(button);
      }
      section.append(audience);
    }

    const list = document.createElement("div");
    list.className = "remote-central-list";
    if (centralDetail.section === "review" || centralDetail.section === "observations") {
      for (const reviewItem of array(centralDetail.items)) {
        const item = document.createElement("article");
        item.className = "remote-central-item";
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = reviewItem.title || "Card";
        const context = document.createElement("small");
        context.textContent = reviewItem.context || "";
        copy.append(title, context);
        if (centralDetail.section === "observations") {
          const observation = document.createElement("small");
          observation.textContent = `${pedagogicalCommentCategoryLabel(reviewItem.category)} · ${reviewItem.body}`;
          copy.append(observation);
        }
        const openTarget = document.createElement("button");
        openTarget.type = "button";
        openTarget.className = "icon-ghost";
        openTarget.dataset.studyStateOpen = reviewItem.commentId || reviewItem.cardId;
        openTarget.title = "Abrir card";
        openTarget.setAttribute("aria-label", `Abrir ${reviewItem.title || "card"}`);
        openTarget.innerHTML = iconMarkup("play");
        item.append(copy, openTarget);
        list.append(item);
      }
    } else if (centralDetail.section === "device") {
      const deviceItems = [
        [array(localState.pending).length, "Aguardando envio"],
        [array(localState.rejected).length, "Precisam de atenção"],
        [array(localState.deferredUpdates).length, "Alterações locais"]
      ].filter(([count]) => count > 0);
      for (const [count, label] of deviceItems) {
        const item = document.createElement("article");
        item.className = "remote-central-item";
        const title = document.createElement("strong");
        title.textContent = label;
        const meta = document.createElement("span");
        meta.textContent = `${count} ${count === 1 ? "item" : "itens"}`;
        item.append(title, meta);
        list.append(item);
      }
    } else {
      array(centralDetail.items).forEach((item) => {
        list.append(centralItemCopy(centralDetail.section, item));
      });
    }
    if (!list.childElementCount) list.append(emptyMessage("Nada aqui."));
    section.append(list);

    if (centralDetail.hasMore) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "remote-central-more";
      more.dataset.centralMore = "";
      more.innerHTML = `${iconMarkup("more")}<span>Mais</span>`;
      section.append(more);
    }

    if (centralDetail.section === "construction") {
      const create = document.createElement("form");
      create.className = "remote-workspace-inline-form";
      create.dataset.workspaceCreate = "";
      const title = document.createElement("input");
      title.name = "workspace-title";
      title.required = true;
      title.maxLength = 300;
      title.placeholder = "Novo workspace";
      title.setAttribute("aria-label", "Nome do workspace");
      const kind = document.createElement("select");
      kind.name = "workspace-kind";
      kind.setAttribute("aria-label", "Tipo do workspace");
      for (const [value, label] of [["personal", "Pessoal"], ["class", "Turma"], ["team", "Equipe"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        kind.append(option);
      }
      const add = document.createElement("button");
      add.type = "submit";
      add.className = "icon-ghost";
      add.title = "Criar workspace";
      add.setAttribute("aria-label", add.title);
      add.innerHTML = iconMarkup("add");
      create.append(title, kind, add);
      const accept = document.createElement("form");
      accept.className = "remote-workspace-inline-form";
      accept.dataset.workspaceAccept = "";
      const code = document.createElement("input");
      code.name = "workspace-code";
      code.required = true;
      code.pattern = "[A-Za-z0-9_-]{32,128}";
      code.placeholder = "Código de convite";
      code.setAttribute("aria-label", "Código de convite");
      const enter = document.createElement("button");
      enter.type = "submit";
      enter.className = "icon-ghost";
      enter.title = "Entrar no workspace";
      enter.setAttribute("aria-label", enter.title);
      enter.innerHTML = iconMarkup("trail");
      accept.append(code, enter);
      section.append(create, accept);
      const continueButton = document.createElement("button");
      continueButton.type = "button";
      continueButton.className = "remote-central-related";
      continueButton.dataset.libraryAssistant = "";
      continueButton.innerHTML = `${iconMarkup("construction")}<span>Continuar no Chatbot</span>`;
      section.append(continueButton);
    } else if (centralDetail.section === "trails" || centralDetail.section === "collections") {
      const target = document.createElement("button");
      target.type = "button";
      target.className = "remote-central-related";
      target.dataset.centralTargetView = centralDetail.section === "trails" ? "paths" : "collections";
      target.innerHTML = `${iconMarkup(centralDetail.section === "trails" ? "trail" : "collection")}<span>Abrir ${centralDetail.label}</span>`;
      section.append(target);
    }
    return section;
  };

  const renderCentral = (localState) => {
    if (centralWorkspaceComments) return renderWorkspaceComments();
    if (centralWorkspace) return renderWorkspace();
    if (centralDetail) return renderCentralDetail(localState);
    const section = document.createElement("section");
    section.className = "remote-library-view remote-central-view";
    section.id = "remote-library-central";
    section.dataset.libraryViewPanel = "central";
    section.setAttribute("role", "tabpanel");
    const summary = centralOverview?.summary;
    const counts = summary?.counts || {};
    const cards = document.createElement("div");
    cards.className = "remote-central-summary";
    cards.append(
      centralSummaryCard({
        section: "construction",
        label: "Em construção",
        count: Number(counts.construction) || 0,
        icon: "construction"
      }),
      centralSummaryCard({
        section: "trails",
        label: "Em Trilhas",
        count: Number(counts.trails) || 0,
        icon: "trail"
      }),
      centralSummaryCard({
        section: "evaluation",
        label: "Em avaliação",
        count: Number(counts.evaluationMine) || 0,
        icon: "evaluation",
        note: capabilities.catalogReview && Number(counts.evaluationQueue) > 0
          ? `${Number(counts.evaluationQueue)} na fila`
          : ""
      }),
      centralSummaryCard({
        section: "collections",
        label: "Em Coleções",
        count: Number(counts.collections) || 0,
        icon: "collection"
      }),
      centralSummaryCard({
        section: "review",
        label: "Rever",
        count: array(localState.reviewItems).length,
        icon: "review"
      }),
      centralSummaryCard({
        section: "observations",
        label: "Minhas observações",
        count: array(localState.observationItems).length,
        icon: "observations"
      }),
      centralSummaryCard({
        section: "device",
        label: "Neste dispositivo",
        count: centralDeviceCount(localState),
        icon: "device"
      })
    );
    section.append(cards);
    if (centralOverview?.stale) {
      const note = document.createElement("p");
      note.className = "remote-central-cache-note";
      note.textContent = summary ? "Último estado conhecido." : "Somente dados deste dispositivo.";
      section.append(note);
    }
    return section;
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
    // Uma réplica anterior ao contrato de origem não é exibível nem pode ser
    // interpretada por ausência de campo. Aguarde a lista remota autoritativa,
    // que traz course_origin explicitamente, em vez de inferir uma origem local.
    if (local.some((course) => !hasCourseOrigin(course))) return cachedLibraryCourses;
    return local.length ? local : cachedLibraryCourses;
  };

  const renderLibraryState = ({
    collectionRows,
    libraryCourses,
    rejected,
    pending,
    deferredUpdates = [],
    reviewItems = [],
    observationItems = []
  }) => {
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
      renderCentral({ rejected, pending, deferredUpdates, reviewItems, observationItems }),
      renderCollections(collectionRows),
      renderStudyPaths(libraryCourses, pendingCourseIds, deferredUpdates)
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
        description.textContent = /changedFields de update contém campo imutável/i.test(
          String(mutation.lastError || "")
        )
          ? "Uma organização anterior precisa ser reenviada."
          : mutation.lastError || "Uma alteração não pôde ser sincronizada.";
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

  const readLocalSynchronizationState = async () => {
    const [rejected, pending, deferredUpdates] = await Promise.all([
      syncEngine?.listRejectedMutations?.() || [],
      syncEngine?.listPendingMutations?.() || [],
      syncEngine?.listDeferredCourseUpdates?.() || []
    ]);
    return {
      rejected,
      pending,
      deferredUpdates,
      reviewItems: studyPathRepository?.loadReviewItems?.() || [],
      observationItems: studyPathRepository?.loadPersonalObservationItems?.() || []
    };
  };

  const load = async ({ synchronizeBeforeRead = true } = {}) => {
    const currentGeneration = ++loadGeneration;
    const query = catalogQuery;
    setBusy(true, "Consultando…");
    capabilities = Object.freeze({
      catalogPromotion: false,
      catalogReview: false
    });
    applyActiveView();
    let remoteError = null;
    try {
      const renderedPaths = Array.from(root.querySelectorAll("[data-study-path-card]:not([data-study-path-card='default'])"));
      if (renderedPaths.length) {
        expandedPathIds = new Set(renderedPaths
          .filter((card) => card.open)
          .map((card) => card.dataset.studyPathCard));
      }
      if (revealedPathId) expandedPathIds.add(revealedPathId);
      let localSynchronizationState = await readLocalSynchronizationState();
      if (currentGeneration !== loadGeneration) return;
      centralOverview = await central.loadOverview({ online: false });
      const overviewCapabilities = centralOverview?.summary?.capabilities || {};
      capabilities = Object.freeze({
        catalogPromotion: overviewCapabilities.catalogPublish === true,
        catalogReview: overviewCapabilities.catalogReview === true
      });
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        ...localSynchronizationState
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
        try {
          centralOverview = await central.loadOverview({ online: true });
          const remoteOverviewCapabilities = centralOverview?.summary?.capabilities || {};
          capabilities = Object.freeze({
            catalogPromotion: remoteOverviewCapabilities.catalogPublish === true,
            catalogReview: remoteOverviewCapabilities.catalogReview === true
          });
        } catch (error) {
          if (error?.authRequired === true) {
            centralOverview = null;
            capabilities = Object.freeze({
              catalogPromotion: false,
              catalogReview: false
            });
            throw error;
          }
          remoteError ||= error;
        }
        if (activeView === "collections") {
          cachedCollectionRows = await catalog.listCollections(query);
        } else if (activeView === "paths") {
          cachedLibraryCourses = await catalog.listLibrary();
        }
      } catch (error) {
        remoteError ||= error;
      }
      if (currentGeneration !== loadGeneration) return;
      localSynchronizationState = await readLocalSynchronizationState();
      if (currentGeneration !== loadGeneration) return;
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        ...localSynchronizationState
      });
      setBusy(false, remoteError ? remoteReadStatus(remoteError) : "");
    } catch (error) {
      if (currentGeneration !== loadGeneration) return;
      try {
        const localSynchronizationState = await readLocalSynchronizationState();
        renderLibraryState({
          collectionRows: cachedCollectionRows,
          libraryCourses: localLibraryCourses(),
          ...localSynchronizationState
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

  const centralSectionLabel = (section) => ({
    construction: "Em construção",
    trails: "Em Trilhas",
    evaluation: "Em avaliação",
    collections: "Em Coleções",
    review: "Rever",
    observations: "Minhas observações",
    device: "Neste dispositivo"
  })[section] || "Central";

  const showCentralSection = async (section, {
    audience = "mine",
    append = false
  } = {}) => {
    const currentGeneration = ++loadGeneration;
    setBusy(true, "Consultando…");
    try {
      const localState = await readLocalSynchronizationState();
      if (currentGeneration !== loadGeneration) return;
      if (section === "device" || section === "review" || section === "observations") {
        centralDetail = {
          section,
          audience: "mine",
          label: centralSectionLabel(section),
          items: section === "review"
            ? array(localState.reviewItems)
            : section === "observations"
              ? array(localState.observationItems)
              : [],
          hasMore: false,
          nextCursor: null
        };
        renderLibraryState({
          collectionRows: cachedCollectionRows,
          libraryCourses: localLibraryCourses(),
          ...localState
        });
        setBusy(false, "");
        return;
      }
      const cursor = append ? centralDetail?.nextCursor : null;
      const result = await central.loadSection({
        section,
        audience,
        cursor,
        online: globalThis.navigator?.onLine !== false
      });
      if (currentGeneration !== loadGeneration) return;
      const nextPage = result.page;
      centralDetail = {
        section,
        audience,
        label: centralSectionLabel(section),
        items: append
          ? [...array(centralDetail?.items), ...array(nextPage?.items)]
          : array(nextPage?.items),
        hasMore: nextPage?.hasMore === true,
        nextCursor: nextPage?.nextCursor || null
      };
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        ...localState
      });
      setBusy(false, result.stale ? "Último estado conhecido." : "");
    } catch (error) {
      if (currentGeneration !== loadGeneration) return;
      if (error?.authRequired === true) centralDetail = null;
      setBusy(false, libraryErrorMessage(error));
    }
  };

  const showWorkspace = async (workspaceId) => {
    const currentGeneration = ++loadGeneration;
    setBusy(true, "Consultando…");
    try {
      const localState = await readLocalSynchronizationState();
      const result = await central.loadWorkspace({
        workspaceId,
        online: globalThis.navigator?.onLine !== false
      });
      if (currentGeneration !== loadGeneration) return;
      centralWorkspace = result.workspace
        ? { ...result.workspace, stale: result.stale === true }
        : null;
      centralWorkspaceComments = null;
      centralDetail = null;
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        ...localState
      });
      setBusy(false, result.stale ? "Último estado conhecido." : "");
    } catch (error) {
      if (currentGeneration !== loadGeneration) return;
      setBusy(false, libraryErrorMessage(error));
    }
  };

  const showWorkspaceComments = async ({ append = false } = {}) => {
    if (!centralWorkspace) return;
    const currentGeneration = ++loadGeneration;
    setBusy(true, "Consultando…");
    try {
      const localState = await readLocalSynchronizationState();
      const result = await central.loadWorkspaceComments({
        workspaceId: centralWorkspace.workspaceId,
        cursor: append ? centralWorkspaceComments?.nextCursor : null,
        categories: workspaceCommentCategory ? [workspaceCommentCategory] : null,
        statuses: workspaceCommentStatus ? [workspaceCommentStatus] : null
      });
      if (currentGeneration !== loadGeneration) return;
      centralWorkspaceComments = {
        ...result,
        items: append
          ? [...array(centralWorkspaceComments?.items), ...array(result.items)]
          : array(result.items)
      };
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        ...localState
      });
      setBusy(false, "");
    } catch (error) {
      if (currentGeneration !== loadGeneration) return;
      setBusy(false, libraryErrorMessage(error));
    }
  };

  const mutateWorkspaceComment = async ({ commentId, operation, payload }) => {
    setBusy(true, "Salvando…");
    await central.manageWorkspaceComment({
      requestId: workspaceRequestId(operation),
      workspaceId: centralWorkspace.workspaceId,
      commentId,
      operation,
      payload
    });
    centralWorkspaceComments = null;
    await showWorkspaceComments();
  };

  const mutateWorkspace = async ({ operation, payload, reopen = true }) => {
    setBusy(true, "Salvando…");
    const result = await central.manageWorkspace({
      requestId: workspaceRequestId(operation),
      operation,
      payload
    });
    workspaceInviteCode = text(result?.code);
    const workspaceId = text(result?.workspaceId || payload?.workspaceId);
    centralOverview = null;
    if (reopen && workspaceId) {
      await showWorkspace(workspaceId);
    } else {
      centralWorkspace = null;
      centralDetail = null;
      await load({ synchronizeBeforeRead: false });
    }
    return result;
  };

  const openLibrary = async () => {
    if (open) return;
    open = true;
    overlay.hidden = false;
    await load();
  };

  const openAuthoringAssistant = async () => {
    if (!open) {
      open = true;
      overlay.hidden = false;
      await load();
    }
    await openAssistant();
  };

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-library-close]")) {
      closeAssistant();
      setAccountConfirmationVisible(false);
      accountConfirmationReturnToLibrary = false;
      open = false;
      overlay.hidden = true;
      return;
    }
    const button = event.target.closest("button");
    if (!button || busy) return;
    if (button.dataset.themeChoice) {
      globalThis.AraLearnTheme?.setPreference?.(button.dataset.themeChoice);
      syncThemeButtons();
      return;
    }
    if (button.dataset.libraryView) {
      closeAssistant();
      activeView = button.dataset.libraryView;
      if (activeView === "central") {
        centralDetail = null;
        centralWorkspace = null;
        centralWorkspaceComments = null;
      }
      await load({ synchronizeBeforeRead: false });
      if (activeView === "collections") searchInput.focus();
      return;
    }
    if (button.matches("[data-central-section]")) {
      centralWorkspace = null;
      centralWorkspaceComments = null;
      await showCentralSection(button.dataset.centralSection);
      return;
    }
    if (button.matches("[data-central-workspace]")) {
      workspaceInviteCode = "";
      workspaceCommentCategory = "";
      workspaceCommentStatus = "";
      await showWorkspace(button.dataset.centralWorkspace);
      return;
    }
    if (button.matches("[data-workspace-comments]")) {
      await showWorkspaceComments();
      return;
    }
    if (button.matches("[data-workspace-comments-back]")) {
      centralWorkspaceComments = null;
      const localState = await readLocalSynchronizationState();
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        ...localState
      });
      return;
    }
    if (button.matches("[data-workspace-comments-more]")) {
      await showWorkspaceComments({ append: true });
      return;
    }
    if (button.matches("[data-workspace-comment-open]")) {
      const comment = array(centralWorkspaceComments?.items)
        .find((item) => item.commentId === button.dataset.workspaceCommentOpen);
      if (!comment?.targetAvailable || !Array.isArray(comment.entityPath)) {
        setText(status, "O card não está mais disponível.");
        return;
      }
      setBusy(true, "Abrindo card…");
      try {
        const opened = await onOpenCommentTarget({
          workspaceId: centralWorkspace?.workspaceId || "",
          commentId: comment.commentId,
          courseId: comment.courseId,
          courseRevisionHash: comment.courseRevisionHash,
          entityPath: [...comment.entityPath]
        });
        if (opened === false) throw new Error("O card mudou desde a observação.");
        open = false;
        overlay.hidden = true;
        setBusy(false, "");
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-workspace-comment-focus-open]")) {
      const card = array(centralWorkspaceComments?.summary?.focusCards)
        .find((item) => item.cardId === button.dataset.workspaceCommentFocusOpen);
      if (!card?.targetAvailable || !Array.isArray(card.entityPath)) {
        setText(status, "O card não está mais disponível.");
        return;
      }
      setBusy(true, "Abrindo card…");
      try {
        const opened = await onOpenCommentTarget({
          workspaceId: centralWorkspace?.workspaceId || "",
          courseId: card.courseId,
          entityPath: [...card.entityPath]
        });
        if (opened === false) throw new Error("O card mudou desde a observação.");
        open = false;
        overlay.hidden = true;
        setBusy(false, "");
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-study-state-open]")) {
      const reviewItem = array(centralDetail?.items)
        .find((item) => String(item.commentId || item.cardId) === button.dataset.studyStateOpen);
      if (!reviewItem || !Array.isArray(reviewItem.entityPath) || typeof onOpenStudyTarget !== "function") {
        setText(status, "O card não está mais disponível.");
        return;
      }
      setBusy(true, "Abrindo card…");
      try {
        const opened = await onOpenStudyTarget({
          cardId: reviewItem.cardId,
          entityPath: [...reviewItem.entityPath]
        });
        if (opened === false) throw new Error("O card mudou desde a marcação.");
        open = false;
        overlay.hidden = true;
        setBusy(false, "");
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-central-workspace-back]")) {
      centralWorkspace = null;
      centralWorkspaceComments = null;
      workspaceInviteCode = "";
      await showCentralSection("construction");
      return;
    }
    if (button.matches("[data-central-back]")) {
      centralDetail = null;
      centralWorkspace = null;
      centralWorkspaceComments = null;
      const localState = await readLocalSynchronizationState();
      renderLibraryState({
        collectionRows: cachedCollectionRows,
        libraryCourses: localLibraryCourses(),
        ...localState
      });
      return;
    }
    if (button.matches("[data-workspace-copy-invite]")) {
      try {
        await globalThis.navigator?.clipboard?.writeText(button.dataset.workspaceCopyInvite);
        setText(status, "Convite copiado.");
      } catch {
        setText(status, "Não foi possível copiar. Selecione o código manualmente.");
      }
      return;
    }
    if (button.matches("[data-workspace-cancel-invite]")) {
      try {
        await mutateWorkspace({
          operation: "cancel_invite",
          payload: {
            workspaceId: centralWorkspace.workspaceId,
            invitationId: button.dataset.workspaceCancelInvite
          }
        });
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-workspace-transfer-owner]")) {
      if (!globalThis.confirm("Transferir a propriedade deste workspace?")) return;
      try {
        await mutateWorkspace({
          operation: "transfer_owner",
          payload: {
            workspaceId: centralWorkspace.workspaceId,
            userId: button.dataset.workspaceTransferOwner
          }
        });
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-workspace-remove-member]")) {
      if (!globalThis.confirm("Remover este membro do workspace?")) return;
      try {
        await mutateWorkspace({
          operation: "remove_member",
          payload: {
            workspaceId: centralWorkspace.workspaceId,
            userId: button.dataset.workspaceRemoveMember
          }
        });
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-workspace-leave]")) {
      if (!globalThis.confirm("Sair deste workspace?")) return;
      try {
        await mutateWorkspace({
          operation: "leave",
          payload: { workspaceId: button.dataset.workspaceLeave },
          reopen: false
        });
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    if (button.matches("[data-central-audience]")) {
      await showCentralSection("evaluation", {
        audience: button.dataset.centralAudience
      });
      return;
    }
    if (button.matches("[data-central-more]")) {
      await showCentralSection(centralDetail?.section, {
        audience: centralDetail?.audience || "mine",
        append: true
      });
      return;
    }
    if (button.matches("[data-central-target-view]")) {
      activeView = button.dataset.centralTargetView;
      centralDetail = null;
      await load({ synchronizeBeforeRead: false });
      if (activeView === "collections") searchInput.focus();
      return;
    }
    if (button.matches("[data-library-assistant]")) {
      if (assistantOpen) {
        closeAssistant();
        await load({ synchronizeBeforeRead: false });
      } else {
        await openAssistant();
      }
      return;
    }
    if (button.matches("[data-local-draft-discard]")) {
      const courseId = text(button.dataset.courseId).trim();
      const expectedLocalDraftRevision = text(button.dataset.localDraftRevision).trim();
      const title = text(button.dataset.courseTitle).trim() || "Curso";
      const courseOrigin = text(button.dataset.courseOrigin).trim();
      const remoteUpdateAvailable = button.dataset.remoteUpdateAvailable === "true";
      if (!courseId || !expectedLocalDraftRevision) {
        setText(
          status,
          "Não foi possível identificar a versão das alterações locais. Nada foi descartado."
        );
        return;
      }
      if (!globalThis.confirm(localDraftDiscardConfirmation({
        title,
        courseOrigin,
        remoteUpdateAvailable
      }))) {
        setText(status, "Descarte cancelado. As alterações locais foram preservadas.");
        return;
      }
      if (globalThis.navigator?.onLine === false) {
        setText(status, localDraftDiscardErrorMessage(null, { online: false }));
        return;
      }
      setBusy(true, remoteUpdateAvailable
        ? "Restaurando a nova revisão oficial…"
        : "Restaurando a revisão oficial…");
      let restored = null;
      try {
        restored = await syncEngine.restoreDeferredCourseRevision({
          courseId,
          expectedLocalDraftRevision
        });
        await onLocalDraftRestored(restored);
        await load({ synchronizeBeforeRead: false });
        setText(
          status,
          remoteUpdateAvailable
            ? "Alterações locais descartadas. A nova revisão oficial foi restaurada."
            : "Alterações locais descartadas. A revisão oficial foi restaurada."
        );
      } catch (error) {
        if (restored) {
          setBusy(
            false,
            "A revisão oficial foi restaurada, mas a projeção da tela não pôde ser recarregada. Reabra o aplicativo."
          );
          return;
        }
        try {
          await load({ synchronizeBeforeRead: false });
        } catch {
          setBusy(false);
        }
        setText(status, localDraftDiscardErrorMessage(error));
      }
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
      closeAssistant();
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
      accountConfirmationReturnToLibrary = assistantOpen;
      closeAssistant();
      setAccountConfirmationVisible(true);
      return;
    }
    if (button.matches("[data-account-cancel]")) {
      setAccountConfirmationVisible(false);
      if (accountConfirmationReturnToLibrary) {
        accountConfirmationReturnToLibrary = false;
        await load({ synchronizeBeforeRead: false });
      }
      return;
    }
    if (button.matches("[data-account-confirm-action]")) {
      closeAssistant();
      accountConfirmationReturnToLibrary = false;
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
    const commentForm = event.target.closest("[data-workspace-comment-response]");
    if (commentForm && !busy) {
      event.preventDefault();
      const response = String(new FormData(commentForm).get("comment-response") || "").trim();
      if (!response) return;
      try {
        await mutateWorkspaceComment({
          commentId: commentForm.dataset.workspaceCommentResponse,
          operation: "respond_comment",
          payload: { response }
        });
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
    const workspaceForm = event.target.closest(
      "[data-workspace-create], [data-workspace-accept], [data-workspace-invite], " +
      "[data-workspace-update]"
    );
    if (workspaceForm && !busy) {
      event.preventDefault();
      const values = new FormData(workspaceForm);
      try {
        if (workspaceForm.matches("[data-workspace-create]")) {
          const workspaceId = globalThis.crypto.randomUUID();
          await mutateWorkspace({
            operation: "create",
            payload: {
              workspaceId,
              title: String(values.get("workspace-title") || "").trim(),
              purpose: "",
              kind: String(values.get("workspace-kind") || "personal"),
              visibility: "members"
            }
          });
        } else if (workspaceForm.matches("[data-workspace-update]")) {
          await mutateWorkspace({
            operation: "update",
            payload: {
              workspaceId: workspaceForm.dataset.workspaceUpdate,
              title: String(values.get("workspace-title") || "").trim(),
              purpose: String(values.get("workspace-purpose") || "").trim(),
              kind: String(values.get("workspace-kind") || "personal"),
              visibility: centralWorkspace.visibility
            }
          });
        } else if (workspaceForm.matches("[data-workspace-accept]")) {
          await mutateWorkspace({
            operation: "accept_invite",
            payload: { code: String(values.get("workspace-code") || "").trim() }
          });
        } else {
          await mutateWorkspace({
            operation: "invite",
            payload: {
              workspaceId: workspaceForm.dataset.workspaceInvite,
              email: String(values.get("workspace-email") || "").trim(),
              role: String(values.get("workspace-role") || "learner")
            }
          });
        }
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
      }
      return;
    }
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

  root.addEventListener("change", async (event) => {
    const filter = event.target.closest("[data-workspace-comment-filter]");
    if (filter && !busy) {
      if (filter.dataset.workspaceCommentFilter === "category") {
        workspaceCommentCategory = filter.value;
      } else {
        workspaceCommentStatus = filter.value;
      }
      centralWorkspaceComments = null;
      await showWorkspaceComments();
      return;
    }
    const commentStatus = event.target.closest("[data-workspace-comment-status]");
    if (commentStatus && !busy) {
      try {
        await mutateWorkspaceComment({
          commentId: commentStatus.dataset.workspaceCommentStatus,
          operation: "set_comment_status",
          payload: { status: commentStatus.value, note: "" }
        });
      } catch (error) {
        setBusy(false, libraryErrorMessage(error));
        await showWorkspaceComments();
      }
      return;
    }
    const select = event.target.closest("[data-workspace-member-role]");
    if (!select || busy || !centralWorkspace) return;
    try {
      await mutateWorkspace({
        operation: "set_role",
        payload: {
          workspaceId: centralWorkspace.workspaceId,
          userId: select.dataset.workspaceMemberRole,
          role: select.value
        }
      });
    } catch (error) {
      setBusy(false, libraryErrorMessage(error));
      await showWorkspace(centralWorkspace.workspaceId);
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
  document.addEventListener("aralearn:open-authoring-assistant", () => {
    void openAuthoringAssistant();
  });

  return { open: openLibrary, openAuthoringAssistant, refresh: load };
}
