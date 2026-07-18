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
    <div class="remote-library-tools">
      <button class="remote-library-trigger" type="button" data-library-open title="Abrir biblioteca de cursos" aria-label="Abrir biblioteca de cursos"><span aria-hidden="true">☁</span></button>
    </div>
    <section class="remote-library-overlay" data-library-overlay hidden aria-labelledby="remote-library-title">
      <div class="remote-library-backdrop" data-library-close></div>
      <div class="remote-library-panel" role="dialog" aria-modal="true">
        <header class="remote-library-header">
          <div><p>Fonte compartilhada</p><h2 id="remote-library-title">Biblioteca AraLearn</h2></div>
          <button class="icon-ghost" type="button" data-library-close title="Fechar biblioteca" aria-label="Fechar biblioteca"><span aria-hidden="true">×</span></button>
        </header>
        <p class="remote-library-account" data-library-account></p>
        <p class="remote-library-status" data-library-status role="status" aria-live="polite"></p>
        <div class="remote-library-content" data-library-content></div>
        <footer class="remote-library-footer">
          <button class="auth-link" type="button" data-library-sync title="Sincronizar agora" aria-label="Sincronizar agora"><span aria-hidden="true">↻</span> Sincronizar</button>
          <button class="auth-link" type="button" data-library-signout title="Sair da conta" aria-label="Sair da conta"><span aria-hidden="true">⇥</span> Sair</button>
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
      wrapper.append(actionButton("+", "Adicionar curso", "clone", sourceId));
    } else if (updateAction.action === "clone") {
      wrapper.append(actionButton("⧉", updateAction.label, "clone", sourceId));
    } else if (updateAction.action === "refresh") {
      wrapper.append(actionButton("↻", updateAction.label, "refresh", id));
    } else {
      const current = document.createElement("span");
      current.className = "remote-course-current";
      current.textContent = updateAction.label;
      wrapper.append(current);
    }
    return wrapper;
  };

  const actionButton = (icon, label, action, id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "remote-course-action";
    button.dataset.courseAction = action;
    button.dataset.courseId = id;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<span aria-hidden="true">${icon}</span> ${label}`;
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
      const personalSection = document.createElement("section");
      personalSection.innerHTML = "<h3>Meus cursos</h3>";
      array(libraryCourses).forEach((course) => personalSection.append(courseCard(course, "library")));
      const catalogSection = document.createElement("section");
      catalogSection.innerHTML = "<h3>Catálogo oficial</h3>";
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
            conflictResolutionButton("↓", "Aceitar versão remota", conflict.id, "acceptRemote"),
            conflictResolutionButton("↑", "Manter versão local", conflict.id, "keepLocal")
          );
          issuesSection.append(issue);
        });
        rejected.forEach((mutation) => {
          const issue = document.createElement("article");
          issue.className = "remote-sync-issue";
          const description = document.createElement("p");
          description.textContent = `Mutação rejeitada em ${mutation.entityType}:${mutation.entityId}: ${mutation.lastError || "payload inválido"}.`;
          issue.append(description);
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

  const conflictResolutionButton = (icon, label, conflictId, resolution) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "remote-course-action";
    button.dataset.conflictId = conflictId;
    button.dataset.conflictResolution = resolution;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<span aria-hidden="true">${icon}</span> ${label}`;
    return button;
  };

  const synchronizeAndReload = async () => {
    if (syncEngine?.synchronize) await syncEngine.synchronize();
    await onChanged();
  };

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-library-close]")) {
      open = false;
      overlay.hidden = true;
      return;
    }
    const button = event.target.closest("button");
    if (!button || busy) return;
    if (button.matches("[data-library-open]")) {
      open = true;
      overlay.hidden = false;
      await load();
      return;
    }
    if (button.matches("[data-library-signout]")) {
      setBusy(true, "Verificando alterações pendentes…");
      try {
        const pendingCount = Number(await beforeSignOut()) || 0;
        if (
          pendingCount > 0 &&
          !globalThis.confirm(
            "Há alterações, conflitos ou rejeições ainda preservados somente neste dispositivo. " +
            "Sair agora descartará esse estado local. Deseja continuar?"
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
    if (button.dataset.courseAction === "clone" || button.dataset.courseAction === "refresh") {
      setBusy(true, button.dataset.courseAction === "clone" ? "Criando cópia relacional…" : "Atualizando cópia…");
      try {
        if (button.dataset.courseAction === "clone") await catalog.cloneCourse(button.dataset.courseId);
        else {
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
    if (!open) root.querySelector("[data-library-open]")?.click();
  });

  return { open: () => root.querySelector("[data-library-open]")?.click(), refresh: load };
}
