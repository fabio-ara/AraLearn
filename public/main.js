import {
  createEditorSession,
  importCourses as importCoursesDocument
} from "../src/editor/contractEditor.js";
import { IndexedDbRelationalStore } from "../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../src/persistence/RelationalProjectRepository.js";
import { registerAraLearnServiceWorker } from "../src/runtime/registerServiceWorker.js";
import {
  classifySyncFailure,
  RelationalSyncEngine,
  SupabaseSyncTransport,
  SYNC_FAILURE_KIND
} from "../src/sync/RelationalSyncEngine.js";
import { RemoteCourseCatalog } from "../src/supabase/RemoteCourseCatalog.js";
import { AuthoringApiClient } from "../src/supabase/AuthoringApiClient.js";
import { PersonalIntegrationClient } from "../src/supabase/PersonalIntegrationClient.js";
import { SupabaseAuthClient } from "../src/supabase/SupabaseAuthClient.js";
import { readSupabaseRuntimeConfig } from "../src/supabase/runtimeConfig.js";
import { renderAuthGate } from "../src/ui/AuthGate.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createRemoteLibraryOverlay } from "../src/ui/RemoteLibraryOverlay.js";
import { renderUiIcon } from "../src/ui/renderUiIcons.js";

let authStore = null;
let relationalStore = null;
let repository = null;
let authenticationShutdown = null;
let activeUserId = null;
let durabilityUnsubscribe = null;
let lifecycleAbortController = null;

const AUTOMATIC_SYNC_INTERVAL_MS = 60_000;
const AUTOMATIC_SYNC_AFTER_CHANGE_MS = 800;

function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function synchronizationFailureIsRetryable(error) {
  return classifySyncFailure(error).kind === SYNC_FAILURE_KIND.RETRYABLE;
}

async function closeAraLearnLocalConnections() {
  lifecycleAbortController?.abort();
  lifecycleAbortController = null;
  if (repository) {
    await repository.close();
    repository = null;
    relationalStore = null;
  } else if (relationalStore) {
    relationalStore.close();
    relationalStore = null;
  }
  durabilityUnsubscribe?.();
  durabilityUnsubscribe = null;
  if (authStore) {
    authStore.close();
    authStore = null;
  }
}

async function clearAraLearnLocalState() {
  const userId = activeUserId;
  await closeAraLearnLocalConnections();
  if (userId) {
    await IndexedDbRelationalStore.deleteDatabase(globalThis.indexedDB, { userId });
  }
  await IndexedDbRelationalStore.deleteDatabase(globalThis.indexedDB);
}

function renderShutdownDurabilityFailure(root, error) {
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card" aria-live="assertive">
        <header class="auth-brand"><img src="assets/brand/aralearn-mark.png" alt=""><span>AraLearn</span></header>
        <p class="auth-recovery-title">A saída foi interrompida.</p>
        <p class="auth-status" data-kind="error" data-shutdown-durability-error></p>
        <div class="auth-actions"><button class="auth-icon-button is-primary" type="button" data-shutdown-retry title="Tentar gravar novamente" aria-label="Tentar gravar novamente">${renderUiIcon("save", "auth-button-icon")}</button></div>
      </section>
    </main>
  `;
  const message = error instanceof Error ? error.message : String(error);
  root.querySelector("[data-shutdown-durability-error]").textContent =
    `O AraLearn não conseguiu concluir a gravação local: ${message}. Tente novamente antes de fechar.`;
  root.querySelector("[data-shutdown-retry]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await repository?.retryDurability();
      await shutDownAuthenticatedRuntime(root);
    } catch (retryError) {
      renderShutdownDurabilityFailure(root, retryError);
    }
  });
}

function shutDownAuthenticatedRuntime(root) {
  if (authenticationShutdown) return authenticationShutdown;
  authenticationShutdown = (async () => {
    root.setAttribute("aria-busy", "true");
    root.classList.add("is-signing-out");
    try {
      await closeAraLearnLocalConnections();
    } catch (error) {
      authenticationShutdown = null;
      root.removeAttribute("aria-busy");
      root.classList.remove("is-signing-out");
      renderShutdownDurabilityFailure(root, error);
      return;
    }
    // Dá às demais abas tempo para receber a revogação sem apagar nenhuma réplica.
    await wait(150);
    globalThis.location.reload();
  })();
  return authenticationShutdown;
}

function authSessionWasRejected(error, authClient) {
  const code = String(error?.code || error?.response?.code || "").toLowerCase();
  return !authClient.getSession() ||
    error?.status === 401 ||
    (error?.status === 400 && [
      "invalid_grant",
      "bad_jwt",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "session_not_found"
    ].includes(code));
}

function startupFailureMessage(error) {
  void error;
  return "Não foi possível abrir seus cursos neste dispositivo.";
}

function renderStartupFailure(root, error) {
  root.innerHTML = `
    <main class="startup-recovery-shell">
      <section class="startup-recovery-card" role="alert">
        <header class="auth-brand"><img src="assets/brand/aralearn-mark.png" alt=""><span>AraLearn</span></header>
        <p class="startup-recovery-message" data-startup-error-details></p>
        <div class="startup-recovery-actions">
          <button class="icon-pill" type="button" data-action="reload-page" title="Tentar novamente" aria-label="Tentar novamente">${renderUiIcon("progress", "startup-recovery-icon")}</button>
          <button class="icon-pill" type="button" data-action="reset-aralearn-local-state" title="Limpar dados deste dispositivo" aria-label="Limpar dados deste dispositivo">${renderUiIcon("trash", "startup-recovery-icon")}</button>
        </div>
      </section>
    </main>
  `;
  root.querySelector("[data-startup-error-details]").textContent = startupFailureMessage(error);
  root.querySelector('[data-action="reload-page"]')?.addEventListener("click", () => {
    globalThis.location.reload();
  });
  root.querySelector('[data-action="reset-aralearn-local-state"]')?.addEventListener("click", async (event) => {
    if (!globalThis.confirm("Limpar os dados deste dispositivo e descartar alterações offline ainda não enviadas?")) return;
    event.currentTarget.disabled = true;
    try {
      await clearAraLearnLocalState();
      globalThis.location.reload();
    } catch (clearError) {
      renderStartupFailure(root, clearError);
    }
  });
}

function renderStartupLoading(root) {
  root.innerHTML = `
    <main class="startup-loading-shell" aria-busy="true">
      <section class="startup-loading-card" role="status" aria-live="polite">
        <header class="auth-brand"><img src="assets/brand/aralearn-mark.png" alt=""><span>AraLearn</span></header>
        <div class="startup-loading-content">
          <ol class="startup-loading-steps" aria-label="Etapas da preparação">
            <li data-startup-loading-step data-threshold="4" data-state="active">
              <span class="startup-loading-step-icon">${renderUiIcon("save", "startup-loading-icon")}</span>
              <span>Dispositivo</span>
            </li>
            <li data-startup-loading-step data-threshold="36" data-state="waiting">
              <span class="startup-loading-step-icon">${renderUiIcon("sign-in", "startup-loading-icon")}</span>
              <span>Conta</span>
            </li>
            <li data-startup-loading-step data-threshold="68" data-state="waiting">
              <span class="startup-loading-step-icon">${renderUiIcon("card", "startup-loading-icon")}</span>
              <span>Cursos</span>
            </li>
          </ol>
          <div class="startup-loading-track" role="progressbar" aria-label="Progresso da sincronização inicial" aria-valuemin="0" aria-valuemax="100" aria-valuenow="4" data-startup-loading-progress>
            <span data-startup-loading-fill style="width:4%"></span>
          </div>
          <p class="startup-loading-percent" data-startup-loading-percent>4%</p>
        </div>
      </section>
    </main>
  `;
}

function updateStartupLoading(root, { percent, message = "" } = {}) {
  const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const progress = root.querySelector("[data-startup-loading-progress]");
  const fill = root.querySelector("[data-startup-loading-fill]");
  const percentLabel = root.querySelector("[data-startup-loading-percent]");
  if (!progress || !fill || !percentLabel) return;
  progress.setAttribute("aria-valuenow", String(safePercent));
  if (message) progress.setAttribute("aria-valuetext", message);
  fill.style.width = `${safePercent}%`;
  percentLabel.textContent = `${safePercent}%`;
  const steps = [...root.querySelectorAll("[data-startup-loading-step]")];
  steps.forEach((step, index) => {
    const threshold = Number(step.dataset.threshold || 0);
    const nextThreshold = Number(steps[index + 1]?.dataset.threshold || 101);
    const state = safePercent >= 100 || safePercent >= nextThreshold
      ? "complete"
      : safePercent >= threshold
        ? "active"
        : "waiting";
    step.dataset.state = state;
    if (state === "active") step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
}

function courseIdFromRpcResult(result) {
  const value = Array.isArray(result) && result.length === 1 ? result[0] : result;
  const courseId = typeof value === "string"
    ? value
    : value?.courseId || value?.course_id || value?.resultCourseId || value?.result_course_id;
  if (!courseId) throw new Error("O Supabase não retornou a identidade do curso pessoal.");
  return String(courseId);
}

async function renderAuthenticatedApplication(root, config, authClient, session) {
  const remoteCatalog = new RemoteCourseCatalog({
    projectUrl: config.projectUrl,
    publishableKey: config.publishableKey,
    authClient
  });
  const authoringApi = new AuthoringApiClient({
    projectUrl: config.projectUrl,
    publishableKey: config.publishableKey,
    authClient
  });
  const personalIntegrations = new PersonalIntegrationClient({
    projectUrl: config.projectUrl,
    publishableKey: config.publishableKey,
    authClient
  });
  const syncEngine = new RelationalSyncEngine({
    store: relationalStore,
    transport: new SupabaseSyncTransport(remoteCatalog),
    onProgress(progress) {
      updateStartupLoading(root, progress);
    }
  });
  let editorApp = null;
  let automaticSyncTimer = null;
  let automaticSyncRetryCount = 0;
  const synchronizationNeedsRetry = (result) => Boolean(
    result?.retryable || result?.pushed?.retryable ||
    result?.bootstrap?.status === "retryable_failure" ||
    result?.pulled?.status === "retryable_failure" ||
    result?.courseDownloadFailure
  );
  const canAttemptAutomaticSync = () =>
    document.visibilityState !== "hidden" && globalThis.navigator?.onLine !== false;
  const synchronizeReplica = async ({ reloadWhenDomainChanges = true, expectedCourseIds = [], onProgress = null } = {}) => {
    if (repository) await repository.flush();
    let result = null;
    let synchronizationError = null;
    try {
      result = await syncEngine.synchronize({ expectedCourseIds, onProgress });
    } catch (error) {
      synchronizationError = error;
    }
    if (repository) {
      try {
        // O push pode confirmar a raiz de um curso importado e remapear seus
        // UUIDs antes de uma falha posterior. A memória precisa acompanhar a
        // transação local mesmo quando a sessão expira ou a rede cai em seguida.
        const refreshed = await repository.refreshFromReplica();
        if (
          reloadWhenDomainChanges &&
          (refreshed.documentChanged || refreshed.progressChanged || refreshed.studyPathsChanged)
        ) {
          if (editorApp?.replaceProject) editorApp.replaceProject(refreshed.project);
          else globalThis.location.reload();
        }
      } catch (refreshError) {
        if (!synchronizationError) throw refreshError;
        console.warn("A réplica mudou durante uma sincronização interrompida.", refreshError);
      }
    }
    if (synchronizationError) throw synchronizationError;
    return result;
  };
  const runAutomaticSync = async () => {
    globalThis.clearTimeout(automaticSyncTimer);
    automaticSyncTimer = null;
    if (!canAttemptAutomaticSync()) return;
    try {
      const result = await synchronizeReplica();
      if (result?.authRequired) return;
      if (synchronizationNeedsRetry(result)) {
        automaticSyncRetryCount += 1;
        const delay = Math.min(30_000, 1_000 * (2 ** Math.min(automaticSyncRetryCount, 5)));
        if (canAttemptAutomaticSync()) {
          automaticSyncTimer = globalThis.setTimeout(() => void runAutomaticSync(), delay);
        }
        return;
      }
      automaticSyncRetryCount = 0;
      automaticSyncTimer = globalThis.setTimeout(
        () => void runAutomaticSync(),
        AUTOMATIC_SYNC_INTERVAL_MS
      );
    } catch (error) {
      if (authSessionWasRejected(error, authClient)) {
        if (authClient.getSession()) await authClient.clearSession();
        authClient.emit("SESSION_INVALID");
        return;
      }
      const retryable = synchronizationFailureIsRetryable(error);
      if (retryable && repository) {
        automaticSyncRetryCount += 1;
        const delay = Math.min(30_000, 1_000 * (2 ** Math.min(automaticSyncRetryCount, 5)));
        if (canAttemptAutomaticSync()) {
          automaticSyncTimer = globalThis.setTimeout(() => void runAutomaticSync(), delay);
        }
      }
      console.warn("Sincronização automática adiada.", error);
    }
  };
  const scheduleAutomaticSync = (delay = AUTOMATIC_SYNC_AFTER_CHANGE_MS) => {
    automaticSyncRetryCount = 0;
    globalThis.clearTimeout(automaticSyncTimer);
    automaticSyncTimer = null;
    if (canAttemptAutomaticSync()) {
      automaticSyncTimer = globalThis.setTimeout(() => void runAutomaticSync(), delay);
    }
  };
  let startupSyncError = null;
  try {
    const initialSync = await syncEngine.synchronize();
    if (initialSync.authRequired) return;
    if (synchronizationNeedsRetry(initialSync)) {
      startupSyncError = new Error("A sincronização inicial foi adiada.");
      startupSyncError.retryable = true;
    }
  } catch (error) {
    if (authSessionWasRejected(error, authClient)) {
      if (authClient.getSession()) await authClient.clearSession();
      authClient.emit("SESSION_INVALID");
      return;
    }
    const recoverable = synchronizationFailureIsRetryable(error);
    if (!recoverable) throw error;
    startupSyncError = error;
    console.warn("A inicialização continuará com a réplica offline.", error);
  }

  const materializePersonalAuthoringCourse = async (remoteOperation) => {
    const courseId = courseIdFromRpcResult(await remoteOperation());
    // A RPC troca/cria a seleção e confirma a árvore no PostgreSQL. O pull
    // e o download usam o mesmo ciclo serializado da sincronização automática.
    // Não use `synchronizeReplica` aqui: este callback é executado dentro da
    // fila de saveProject e aquele wrapper aguarda repository.flush(), criando
    // uma espera circular.
    const synchronization = await syncEngine.synchronize({ expectedCourseIds: [courseId] });
    if (synchronization?.authRequired) {
      const error = new Error("A sessão precisa ser renovada antes de editar o curso.");
      error.name = "AuthRequiredError";
      error.code = "AUTH_REQUIRED";
      error.status = 401;
      error.authRequired = true;
      throw error;
    }

    // Se este pedido compartilhou um ciclo que já estava em andamento antes da
    // RPC, `expectedCourseIds` não participou daquele ciclo. Nesse caso fazemos
    // uma única passagem complementar, já sem concorrência, e materializamos a
    // árvore retornada pela RPC.
    if (!await relationalStore.get("courses", courseId)) {
      await syncEngine.pull();
      await syncEngine.reconcileSelectedCourseReplicas(null, [courseId]);
    }
    if (!await relationalStore.get("courses", courseId)) {
      throw new Error("A cópia pessoal foi criada, mas não pôde ser materializada neste dispositivo.");
    }
    return courseId;
  };

  repository = new RelationalProjectRepository({
    store: relationalStore,
    userId: session.user?.id || null,
    onLocalCommit: scheduleAutomaticSync,
    forkCourseForEditing(sourceCourseId) {
      return materializePersonalAuthoringCourse(() =>
        remoteCatalog.forkCourseForEditing(sourceCourseId)
      );
    },
    createCourseForEditing(course) {
      return materializePersonalAuthoringCourse(() =>
        remoteCatalog.createPersonalCourse({
          contractKey: course.id,
          title: course.title,
          goal: course.goal,
          contractScope: course.contractScope
        })
      );
    }
  });
  await repository.initialize();
  const project = repository.loadProject();
  const editor = createEditorSession(repository);
  root.innerHTML = `
    <div id="aralearn-editor-root"></div>
    <div id="aralearn-remote-library-root"></div>
    <p class="startup-sync-warning" data-startup-sync-warning role="status" aria-live="polite"></p>
    <aside class="local-durability" data-local-durability data-state="saved" role="status" aria-live="polite" hidden>
      <span class="local-durability-progress" data-local-durability-progress hidden>${renderUiIcon("progress", "local-durability-icon")}</span>
      <span data-local-durability-message>Salvo neste dispositivo.</span>
      <button class="icon-ghost" type="button" data-local-durability-retry hidden title="Tentar gravar novamente" aria-label="Tentar gravar novamente">${renderUiIcon("save", "remote-library-action-icon")}</button>
      <button class="icon-ghost" type="button" data-local-durability-dismiss hidden title="Fechar aviso" aria-label="Fechar aviso">${renderUiIcon("remove-state", "remote-library-action-icon")}</button>
    </aside>
  `;
  const editorRoot = root.querySelector("#aralearn-editor-root");
  const libraryRoot = root.querySelector("#aralearn-remote-library-root");
  const durabilityRoot = root.querySelector("[data-local-durability]");
  const durabilityMessage = root.querySelector("[data-local-durability-message]");
  const durabilityProgress = root.querySelector("[data-local-durability-progress]");
  const durabilityRetry = root.querySelector("[data-local-durability-retry]");
  const durabilityDismiss = root.querySelector("[data-local-durability-dismiss]");
  let durabilityPendingTimer = null;
  let dismissedDurabilityError = null;
  durabilityUnsubscribe = repository.onDurabilityChange((state) => {
    globalThis.clearTimeout(durabilityPendingTimer);
    durabilityPendingTimer = null;
    durabilityRoot.dataset.state = state.status;
    durabilityRetry.hidden = state.status !== "error";
    durabilityDismiss.hidden = state.status !== "error";
    durabilityProgress.hidden = state.status !== "pending";
    if (state.status === "pending") {
      durabilityMessage.textContent = "Salvando neste dispositivo…";
      durabilityMessage.removeAttribute("title");
      durabilityRoot.hidden = true;
      durabilityPendingTimer = globalThis.setTimeout(() => {
        if (durabilityRoot.dataset.state === "pending") durabilityRoot.hidden = false;
      }, 900);
    } else if (state.status === "error") {
      const technicalMessage = state.error?.message || "erro desconhecido";
      durabilityMessage.textContent = "Não foi possível salvar.";
      durabilityMessage.title = technicalMessage;
      durabilityRoot.hidden = dismissedDurabilityError === technicalMessage;
      console.error("Falha ao salvar localmente.", state.error);
    } else {
      durabilityMessage.textContent = "Salvo neste dispositivo.";
      durabilityMessage.removeAttribute("title");
      durabilityRoot.hidden = true;
      dismissedDurabilityError = null;
    }
  });
  durabilityRetry.addEventListener("click", async () => {
    dismissedDurabilityError = null;
    durabilityRetry.disabled = true;
    try {
      await repository.retryDurability();
    } catch {
      // O estado persistente do repositório mantém a falha visível e repetível.
    } finally {
      durabilityRetry.disabled = false;
    }
  });
  durabilityDismiss.addEventListener("click", () => {
    dismissedDurabilityError = repository.getDurabilityState().error?.message || "erro desconhecido";
    durabilityRoot.hidden = true;
  });

  const bestEffortFlush = () => {
    if (!repository) return Promise.resolve();
    return repository.flush().catch(() => undefined);
  };
  lifecycleAbortController = new AbortController();
  lifecycleAbortController.signal.addEventListener("abort", () => {
    globalThis.clearTimeout(automaticSyncTimer);
    globalThis.clearTimeout(durabilityPendingTimer);
    automaticSyncTimer = null;
    durabilityPendingTimer = null;
  }, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      globalThis.clearTimeout(automaticSyncTimer);
      automaticSyncTimer = null;
      void bestEffortFlush();
    } else {
      scheduleAutomaticSync(100);
    }
  }, { signal: lifecycleAbortController.signal });
  globalThis.addEventListener("pagehide", () => {
    globalThis.clearTimeout(automaticSyncTimer);
    automaticSyncTimer = null;
    void bestEffortFlush();
  }, { signal: lifecycleAbortController.signal });
  globalThis.AraLearnAndroid = {
    flush: bestEffortFlush,
    handleBackPress() {
      void repository.flush()
        .then(() => globalThis.AndroidHost?.finishApp?.())
        .catch(() => undefined);
      return true;
    }
  };
  if (startupSyncError) {
    const warning = root.querySelector("[data-startup-sync-warning]");
    warning.textContent = "Modo offline: alterações pendentes serão sincronizadas quando a conexão voltar.";
  }

  editorApp = createLessonEditorApp({
    root: editorRoot,
    storage: repository,
    editor,
    initialProject: project
  });
  createRemoteLibraryOverlay({
    root: libraryRoot,
    catalog: remoteCatalog,
    authClient,
    integrationClient: personalIntegrations,
    projectUrl: config.projectUrl,
    syncEngine,
    studyPathRepository: repository,
    async beforeRemoteRead(options) {
      return synchronizeReplica(options);
    },
    async beforeSignOut() {
      await repository.flush();
      try {
        await synchronizeReplica();
      } catch (error) {
        console.warn("Não foi possível enviar toda a fila antes da saída.", error);
      }
      const [pending, rejected] = await Promise.all([
        relationalStore.listPendingOutbox(),
        relationalStore.listRejectedOutbox()
      ]);
      return pending.length + rejected.length;
    },
    async onChanged() {
      await repository.flush();
      globalThis.location.reload();
    },
    async onStudyPathsChanged() {
      editorApp?.replaceProject?.(repository.loadProject());
    },
    async onImportPrivateCourse(prepared, { onProgress = () => {} } = {}) {
      onProgress({ percent: 24, message: "Salvando o curso neste dispositivo…" });
      const nextProject = importCoursesDocument(repository.loadProject(), {
        document: prepared.parsed
      });
      const importedCourse = nextProject.courses.at(-1);
      const staged = await repository.importPrivateCourse(nextProject, {
        courseKey: importedCourse?.id
      });
      await repository.flush();
      let synchronization = null;
      let authenticationRequired = false;
      if (globalThis.navigator?.onLine !== false) {
        onProgress({ percent: 72, message: "Enviando o curso para a sua conta…" });
        try {
          synchronization = await synchronizeReplica();
          authenticationRequired = Boolean(synchronization?.authRequired);
        } catch (error) {
          const failure = classifySyncFailure(error);
          if (![SYNC_FAILURE_KIND.RETRYABLE, SYNC_FAILURE_KIND.AUTH_REQUIRED].includes(failure.kind)) {
            throw error;
          }
          authenticationRequired = failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED;
        }
      }
      const importState = await repository.getPrivateCourseImportState(staged.importId);
      if (importState.rejected > 0) {
        onProgress({
          percent: 96,
          message: "Curso salvo neste dispositivo. A sincronização exige atenção."
        });
        return {
          remoteConfirmed: false,
          pending: importState.pending,
          rejected: importState.rejected,
          importId: staged.importId
        };
      }
      if (authenticationRequired) {
        onProgress({
          percent: 96,
          message: "Curso salvo neste dispositivo. Entre novamente para concluir o envio."
        });
        return {
          remoteConfirmed: false,
          pending: importState.pending,
          authRequired: true,
          importId: staged.importId
        };
      }
      if (synchronizationNeedsRetry(synchronization) || importState.pending > 0) {
        onProgress({
          percent: 96,
          message: "Curso salvo neste dispositivo. O envio continuará quando houver conexão."
        });
        return {
          remoteConfirmed: false,
          pending: importState.pending,
          importId: staged.importId
        };
      }
      onProgress({ percent: 96, message: "Curso confirmado na sua conta." });
      return { remoteConfirmed: true, pending: 0, importId: staged.importId };
    },
    async onImportCatalogCourse(prepared, {
      onProgress = () => {},
      publicationIntent = null
    } = {}) {
      return authoringApi.importCatalogCourse(prepared.parsed, {
        onProgress,
        publicationIntent
      });
    },
    async onSignedOut() {
      globalThis.clearTimeout(automaticSyncTimer);
      await shutDownAuthenticatedRuntime(root);
    },
    async onAccountDeleted() {
      globalThis.clearTimeout(automaticSyncTimer);
      root.setAttribute("aria-busy", "true");
      root.classList.add("is-signing-out");
      await authClient.clearSession({ broadcast: false });
      try {
        await clearAraLearnLocalState();
      } finally {
        activeUserId = null;
        globalThis.location.reload();
      }
    }
  });

  globalThis.addEventListener("online", () => {
    scheduleAutomaticSync(100);
  }, { signal: lifecycleAbortController.signal });
  globalThis.addEventListener("offline", () => {
    globalThis.clearTimeout(automaticSyncTimer);
    automaticSyncTimer = null;
  }, { signal: lifecycleAbortController.signal });
  scheduleAutomaticSync(AUTOMATIC_SYNC_INTERVAL_MS);
}

async function start(root) {
  authStore = await IndexedDbRelationalStore.open(globalThis.indexedDB);
  const config = readSupabaseRuntimeConfig();
  if (!config.configured) {
    renderAuthGate({ root, configured: false });
    return;
  }
  const authClient = new SupabaseAuthClient({
    projectUrl: config.projectUrl,
    publishableKey: config.publishableKey,
    sessionStore: authStore
  });
  authClient.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT_REMOTE") {
      void shutDownAuthenticatedRuntime(root);
    } else if (event === "SESSION_INVALID") {
      void shutDownAuthenticatedRuntime(root);
    } else if (event === "SIGNED_OUT") {
      void shutDownAuthenticatedRuntime(root);
    }
  });
  const session = await authClient.initialize();
  if (!session && authClient.sessionInvalidated) {
    await shutDownAuthenticatedRuntime(root);
    return;
  }
  if (!session || authClient.recoveryMode) {
    renderAuthGate({
      root,
      authClient,
      configured: true,
      onAuthenticated() {
        globalThis.location.reload();
      }
    });
    return;
  }
  if (!session.user?.id) {
    await authClient.clearSession();
    renderAuthGate({ root, authClient, configured: true });
    return;
  }
  activeUserId = session.user.id;
  renderStartupLoading(root);
  relationalStore = await IndexedDbRelationalStore.open(globalThis.indexedDB, {
    userId: activeUserId
  });
  updateStartupLoading(root, { percent: 8 });
  await relationalStore.bindReplicaToUser(session.user.id, session);
  await renderAuthenticatedApplication(root, config, authClient, session);
}

const root = document.getElementById("app-root");
if (!root) throw new Error("Elemento raiz não encontrado.");

registerAraLearnServiceWorker().catch((error) => {
  console.warn("O shell offline não pôde ser registrado.", error);
});

start(root).catch((error) => {
  console.error("Falha fatal ao iniciar a UI do AraLearn.", error);
  renderStartupFailure(root, error);
});
