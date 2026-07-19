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
  keepLocal: "save",
  remove: "trash",
  rejectDiscard: "trash",
  refresh: "reposition",
  signout: "excluded-state",
  sync: "progress"
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
  onChanged = () => globalThis.location?.reload?.(),
  onSignedOut = onChanged,
  beforeRemoteRead = async () => {},
  getCourseRevision = null,
  beforeSignOut = async () => 0
} = {}) {
  if (!root || !catalog || !authClient) throw new TypeError("Dependências da biblioteca remota ausentes.");
  let open = false;
  let busy = false;

  root.innerHTML = `
    <section class="remote-library-overlay" data-library-overlay hidden aria-label="Biblioteca">
      <div class="remote-library-backdrop" data-library-close></div>
      <div class="remote-library-panel courses-home-screen" role="dialog" aria-modal="true">
        <p class="remote-library-status" data-library-status role="status" aria-live="polite"></p>
        <div class="remote-library-content" data-library-content></div>
        <div class="remote-library-progress" data-library-progress hidden>
          <div class="remote-library-progress-track" role="progressbar" aria-label="Progresso da adição do curso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-library-progress-bar><span data-library-progress-fill></span></div>
          <span class="remote-library-progress-percent" data-library-progress-percent>0%</span>
          <ol class="remote-library-progress-log" data-library-progress-log></ol>
        </div>
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
      actions.append(actionButton("Adicionar aos meus cursos", "clone", sourceId));
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

  const load = async () => {
    setBusy(true, "Consultando o catálogo remoto…");
    try {
      await beforeRemoteRead();
      const [catalogCourses, libraryCourses, conflicts, rejected, pending] = await Promise.all([
        catalog.listCatalog(),
        catalog.listLibrary(),
        syncEngine?.listConflicts?.() || [],
        syncEngine?.listRejectedMutations?.() || [],
        syncEngine?.listPendingMutations?.() || []
      ]);
      content.replaceChildren();
      const personalIds = new Set(array(libraryCourses).map((course) => field(course, "source_course_id", "sourceCourseId")));
      const pendingCourseIds = new Set(array(pending).map((mutation) => text(field(mutation, "course_id", "courseId"))).filter(Boolean));
      const pendingLabel = pendingCourseIds.size
        ? "Enviar alterações deste dispositivo para a sua conta"
        : "Sincronizar este dispositivo com a sua conta";
      syncButton.title = pendingLabel;
      syncButton.setAttribute("aria-label", pendingLabel);
      const personalSection = sectionWithHeading("Meus cursos");
      array(libraryCourses).forEach((course) => {
        const courseId = text(field(course, "course_id", "courseId", "id"));
        personalSection.list.append(courseCard(course, "library", {
          hasPendingLocalChange: pendingCourseIds.has(courseId)
        }));
      });
      const catalogSection = sectionWithHeading("Catálogo oficial");
      array(catalogCourses)
        .filter((course) => !personalIds.has(field(course, "course_id", "courseId", "id")))
        .forEach((course) => catalogSection.list.append(courseCard(course)));
      if (!personalSection.list.querySelector("article")) personalSection.list.append(emptyMessage("Você ainda não adicionou cursos."));
      if (!catalogSection.list.querySelector("article")) catalogSection.list.append(emptyMessage("Não há novos cursos publicados."));
      content.append(personalSection.section, catalogSection.section);
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
      setBusy(false, "");
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
      const courseName = button.closest("article")?.querySelector(".card-title")?.textContent || "este curso";
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

  document.addEventListener("aralearn:open-library", () => {
    void openLibrary();
  });

  return { open: openLibrary, refresh: load };
}
