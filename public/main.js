import { IndexedDbRelationalStore } from "../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../src/persistence/RelationalProjectRepository.js";
import { registerAraLearnServiceWorker } from "../src/runtime/registerServiceWorker.js";
import { RelationalSyncEngine, SupabaseSyncTransport } from "../src/sync/RelationalSyncEngine.js";
import { RemoteCourseCatalog } from "../src/supabase/RemoteCourseCatalog.js";
import { SupabaseAuthClient } from "../src/supabase/SupabaseAuthClient.js";
import { readSupabaseRuntimeConfig } from "../src/supabase/runtimeConfig.js";
import { renderAuthGate } from "../src/ui/AuthGate.js";
import { createLearnerApp } from "../src/ui/LearnerApp.js";
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
        <div class="startup-loading-track" role="progressbar" aria-label="Progresso da sincronização inicial" aria-valuemin="0" aria-valuemax="100" aria-valuenow="4" data-startup-loading-progress>
          <span data-startup-loading-fill style="width:4%"></span>
        </div>
        <p class="startup-loading-percent" data-startup-loading-percent>4%</p>
      </section>
    </main>
  `;
}

function updateStartupLoading(root, { percent } = {}) {
  const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const progress = root.querySelector("[data-startup-loading-progress]");
  const fill = root.querySelector("[data-startup-loading-fill]");
  const percentLabel = root.querySelector("[data-startup-loading-percent]");
  if (!progress || !fill || !percentLabel) return;
  progress.setAttribute("aria-valuenow", String(safePercent));
  fill.style.width = `${safePercent}%`;
  percentLabel.textContent = `${safePercent}%`;
}

async function renderAuthenticatedApplication(root, config, authClient, session) {
  const remoteCatalog = new RemoteCourseCatalog({
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
  let learnerApp = null;
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
    const result = await syncEngine.synchronize({ expectedCourseIds, onProgress });
    if (result.authRequired) return result;
    if (repository) {
      const refreshed = await repository.refreshFromReplica();
      if (
        reloadWhenDomainChanges &&
        (refreshed.documentChanged || refreshed.progressChanged || refreshed.studyPathsChanged)
      ) {
        if (learnerApp?.replaceProject) learnerApp.replaceProject(refreshed.project);
        else globalThis.location.reload();
      }
    }
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
      const retryable =
        error instanceof TypeError ||
        error?.name === "AbortError" ||
        error?.status === 0 ||
        error?.status === 429 ||
        Number(error?.status) >= 500;
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
    const recoverable =
      error instanceof TypeError ||
      error?.name === "AbortError" ||
      error?.status === 0 ||
      error?.status === 429 ||
      Number(error?.status) >= 500;
    if (!recoverable) throw error;
    startupSyncError = error;
    console.warn("A inicialização continuará com a réplica offline.", error);
  }

  repository = new RelationalProjectRepository({
    store: relationalStore,
    userId: session.user?.id || null,
    onLocalCommit: scheduleAutomaticSync
  });
  await repository.initialize();
  const project = repository.loadProject();
  root.innerHTML = `
    <div id="aralearn-learner-root"></div>
    <div id="aralearn-remote-library-root"></div>
    <p class="startup-sync-warning" data-startup-sync-warning role="status" aria-live="polite"></p>
    <aside class="local-durability" data-local-durability data-state="saved" role="status" aria-live="polite" hidden>
      <span data-local-durability-message>Salvo neste dispositivo.</span>
      <button class="icon-ghost" type="button" data-local-durability-retry hidden title="Tentar gravar novamente" aria-label="Tentar gravar novamente">${renderUiIcon("save", "remote-library-action-icon")}</button>
    </aside>
  `;
  const learnerRoot = root.querySelector("#aralearn-learner-root");
  const libraryRoot = root.querySelector("#aralearn-remote-library-root");
  const durabilityRoot = root.querySelector("[data-local-durability]");
  const durabilityMessage = root.querySelector("[data-local-durability-message]");
  const durabilityRetry = root.querySelector("[data-local-durability-retry]");
  durabilityUnsubscribe = repository.onDurabilityChange((state) => {
    durabilityRoot.dataset.state = state.status;
    durabilityRoot.hidden = state.status === "saved";
    durabilityRetry.hidden = state.status !== "error";
    if (state.status === "pending") {
      durabilityMessage.textContent = "Salvando neste dispositivo…";
    } else if (state.status === "error") {
      durabilityMessage.textContent = `Falha ao salvar localmente: ${state.error?.message || "erro desconhecido"}.`;
    } else {
      durabilityMessage.textContent = "Salvo neste dispositivo.";
    }
  });
  durabilityRetry.addEventListener("click", async () => {
    durabilityRetry.disabled = true;
    try {
      await repository.retryDurability();
    } catch {
      // O estado persistente do repositório mantém a falha visível e repetível.
    } finally {
      durabilityRetry.disabled = false;
    }
  });

  const bestEffortFlush = () => {
    if (!repository) return Promise.resolve();
    return repository.flush().catch(() => undefined);
  };
  lifecycleAbortController = new AbortController();
  lifecycleAbortController.signal.addEventListener("abort", () => {
    globalThis.clearTimeout(automaticSyncTimer);
    automaticSyncTimer = null;
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

  learnerApp = createLearnerApp({
    root: learnerRoot,
    storage: repository,
    initialProject: project
  });
  createRemoteLibraryOverlay({
    root: libraryRoot,
    catalog: remoteCatalog,
    authClient,
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
      learnerApp?.replaceProject?.(repository.loadProject());
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
