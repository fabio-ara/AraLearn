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
  const heading = document.createElement("h3");
  heading.textContent = label;
  section.append(heading);
  return section;
}

export function createRemoteLibraryOverlay({
  root,
  catalog,
  authClient,
  syncEngine = null,
  onChanged = () => globalThis.location?.reload?.(),
  onSignedOut = onChanged,
  beforeRemoteRead = async () => {},
  beforeSignOut = async () => 0
} = {}) {
  if (!root || !catalog || !authClient) throw new TypeError("Dependências da biblioteca remota ausentes.");
  let open = false;
  let busy = false;

  root.innerHTML = `
    <section class="remote-library-overlay" data-library-overlay hidden aria-labelledby="remote-library-title">
      <div class="remote-library-backdrop" data-library-close></div>
      <div class="remote-library-panel" role="dialog" aria-modal="true">
        <header class="remote-library-header">
          <div><p>Fonte compartilhada</p><h2 id="remote-library-title">Biblioteca AraLearn</h2></div>
          <button class="icon-ghost" type="button" data-library-close title="Fechar biblioteca" aria-label="Fechar biblioteca">${iconMarkup("close")}</button>
        </header>
        <p class="remote-library-account" data-library-account></p>
        <p class="remote-library-status" data-library-status role="status" aria-live="polite"></p>
        <div class="remote-library-content" data-library-content></div>
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
  setText(root.querySelector("[data-library-account]"), authClient.getSession()?.user?.email || "Sessão autenticada");

  const setBusy = (value, message = "") => {
    busy = value;
    root.querySelectorAll("button").forEach((button) => { button.disabled = value; });
    setText(status, message);
  };

  const courseCard = (course, action = "clone") => {
    const id = text(field(course, "course_id", "courseId", "id"));
    const sourceId = text(field(course, "source_course_id", "sourceCourseId")) || id;
    const title = text(field(course, "title")) || "Curso sem título";
    const goal = text(field(course, "goal"));
    const personalized = Boolean(field(course, "is_personalized", "isPersonalized", "personalized"));
    const updateAction = resolveLibraryCourseUpdateAction(course);
    const wrapper = document.createElement("article");
    wrapper.className = "remote-course-card";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = goal;
    wrapper.append(heading, copy);
    if (personalized) {
      const badge = document.createElement("span");
      badge.className = "remote-course-badge";
      badge.textContent = "Personalizado";
      wrapper.append(badge);
    }
    if (action === "clone") {
      wrapper.append(actionButton("Adicionar curso", "clone", sourceId));
    } else if (updateAction.action === "clone") {
      wrapper.append(actionButton(updateAction.label, "clone", sourceId));
    } else if (updateAction.action === "refresh") {
      wrapper.append(actionButton(updateAction.label, "refresh", id));
    } else {
      const current = document.createElement("span");
      current.className = "remote-course-current";
      current.textContent = updateAction.label;
      wrapper.append(current);
    }
    return wrapper;
  };

  const actionButton = (label, action, id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "remote-course-action";
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
      const [catalogCourses, libraryCourses, conflicts, rejected] = await Promise.all([
        catalog.listCatalog(),
        catalog.listLibrary(),
        syncEngine?.listConflicts?.() || [],
        syncEngine?.listRejectedMutations?.() || []
      ]);
      content.replaceChildren();
      const personalIds = new Set(array(libraryCourses).map((course) => field(course, "source_course_id", "sourceCourseId")));
      const personalSection = sectionWithHeading("Meus cursos");
      array(libraryCourses).forEach((course) => personalSection.append(courseCard(course, "library")));
      const catalogSection = sectionWithHeading("Catálogo oficial");
      array(catalogCourses)
        .filter((course) => !personalIds.has(field(course, "course_id", "courseId", "id")))
        .forEach((course) => catalogSection.append(courseCard(course)));
      if (!personalSection.querySelector("article")) personalSection.append(emptyMessage("Você ainda não adicionou cursos."));
      if (!catalogSection.querySelector("article")) catalogSection.append(emptyMessage("Não há novos cursos publicados."));
      content.append(personalSection, catalogSection);
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
    button.className = "remote-course-action";
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
    button.className = "remote-course-action";
    button.dataset.rejectedMutationId = mutationId;
    button.title = "Descartar alteração rejeitada";
    button.setAttribute("aria-label", "Descartar alteração rejeitada");
    button.innerHTML = iconMarkup("rejectDiscard");
    return button;
  };

  const synchronizeAndReload = async (options = undefined) => {
    if (syncEngine?.synchronize) await syncEngine.synchronize(options);
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
    if (button.dataset.courseAction === "clone" || button.dataset.courseAction === "refresh") {
      setBusy(true, button.dataset.courseAction === "clone" ? "Criando cópia relacional…" : "Atualizando cópia…");
      try {
        if (button.dataset.courseAction === "clone") {
          const clonedCourseId = text(await catalog.cloneCourse(button.dataset.courseId));
          if (!clonedCourseId) throw new Error("A clonagem não retornou o UUID do curso pessoal.");
          await synchronizeAndReload({ expectedCourseIds: [clonedCourseId] });
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
