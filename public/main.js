import { AuthSessionStore } from "../src/persistence/AuthSessionStore.js";
import { CourseLocalStore } from "../src/persistence/CourseLocalStore.js";
import { registerAraLearnServiceWorker } from "../src/runtime/registerServiceWorker.js";
import { createCourseStudyApplication } from "../src/study/CourseStudyApplication.js";
import { CourseStudyBridge } from "../src/study/CourseStudyBridge.js";
import { CourseStudyRepository } from "../src/study/CourseStudyRepository.js";
import { CourseApiClient } from "../src/supabase/CourseApiClient.js";
import { CourseController } from "../src/supabase/CourseController.js";
import { SupabaseAuthClient } from "../src/supabase/SupabaseAuthClient.js";
import { readSupabaseRuntimeConfig } from "../src/supabase/runtimeConfig.js";
import { renderAuthGate } from "../src/ui/AuthGate.js";
import { createCourseAuthoringSurface } from "../src/ui/CourseAuthoringSurface.js";
import { dispatchApplicationBack } from "../src/ui/applicationBackNavigation.js";
import { isCourseAuthoringRouteCandidate } from "../src/ui/courseAuthoringRoute.js";
import {
  readOAuthAuthorizationId,
  renderOAuthAuthorizationConsent
} from "../src/ui/OAuthAuthorizationConsent.js";
import { renderUiIcon } from "../src/ui/renderUiIcons.js";

let authStore = null;
let courseLocalStore = null;
let repository = null;
let authenticationShutdown = null;
let activeUserId = null;
let lifecycleAbortController = null;
let localConnectionRefreshPending = false;

function wait(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function reloadAfterLocalConnectionReplacement() {
  if (localConnectionRefreshPending || authenticationShutdown) return;
  localConnectionRefreshPending = true;
  lifecycleAbortController?.abort();
  globalThis.setTimeout(() => globalThis.location.reload(), 250);
}

function watchLocalConnection(store) {
  return store.onConnectionInvalidated(() => reloadAfterLocalConnectionReplacement());
}

async function closeAraLearnLocalConnections() {
  lifecycleAbortController?.abort();
  lifecycleAbortController = null;
  if (repository) {
    await repository.close();
    repository = null;
  }
  courseLocalStore?.close();
  courseLocalStore = null;
  authStore?.close();
  authStore = null;
}

async function clearAraLearnLocalState() {
  const userId = activeUserId;
  lifecycleAbortController?.abort();
  lifecycleAbortController = null;
  if (repository) {
    await repository.close();
    repository = null;
  }
  courseLocalStore?.close();
  courseLocalStore = null;
  authStore?.close();
  authStore = null;
  if (userId) await CourseLocalStore.deleteDatabase(globalThis.indexedDB, { userId });
  await AuthSessionStore.deleteDatabase(globalThis.indexedDB);
}

function renderShutdownFailure(root, error) {
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card" aria-live="assertive">
        <header class="auth-brand"><img src="assets/brand/aralearn-mark-monochrome.svg" alt=""><span>AraLearn</span></header>
        <p class="auth-recovery-title">A saída foi interrompida.</p>
        <p class="auth-status" data-kind="error" data-shutdown-error></p>
        <div class="auth-actions"><button class="auth-icon-button is-primary" type="button" data-shutdown-retry title="Tentar novamente" aria-label="Tentar novamente">${renderUiIcon("save", "auth-button-icon")}</button></div>
      </section>
    </main>
  `;
  root.querySelector("[data-shutdown-error]").textContent =
    error instanceof Error ? error.message : String(error);
  root.querySelector("[data-shutdown-retry]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await repository?.flush();
      await shutDownAuthenticatedRuntime(root);
    } catch (retryError) {
      renderShutdownFailure(root, retryError);
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
      renderShutdownFailure(root, error);
      return;
    }
    await wait(150);
    globalThis.location.reload();
  })();
  return authenticationShutdown;
}

function authSessionWasRejected(error, authClient) {
  const code = String(error?.code || error?.response?.code || "").toLowerCase();
  return !authClient.getSession() || error?.status === 401 ||
    (error?.status === 400 && [
      "invalid_grant",
      "bad_jwt",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "session_not_found"
    ].includes(code));
}

function renderStartupFailure(root, error) {
  void error;
  root.innerHTML = `
    <main class="startup-recovery-shell">
      <section class="startup-recovery-card" role="alert">
        <header class="auth-brand"><img src="assets/brand/aralearn-mark-monochrome.svg" alt=""><span>AraLearn</span></header>
        <p class="startup-recovery-message">Não foi possível abrir seus Cursos neste dispositivo.</p>
        <div class="startup-recovery-actions">
          <button class="icon-pill" type="button" data-action="reload-page" title="Tentar novamente" aria-label="Tentar novamente">${renderUiIcon("progress", "startup-recovery-icon")}</button>
          <button class="icon-pill" type="button" data-action="reset-local-state" title="Limpar dados deste dispositivo" aria-label="Limpar dados deste dispositivo">${renderUiIcon("trash", "startup-recovery-icon")}</button>
        </div>
      </section>
    </main>
  `;
  root.querySelector('[data-action="reload-page"]')?.addEventListener("click", () => {
    globalThis.location.reload();
  });
  root.querySelector('[data-action="reset-local-state"]')?.addEventListener("click", async (event) => {
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
        <div class="startup-loading-panel">
          <header class="auth-brand"><img src="assets/brand/aralearn-mark-monochrome.svg" alt=""><span>AraLearn</span></header>
          <div class="startup-loading-content">
            <ol class="startup-loading-steps" aria-label="Etapas da preparação">
              <li aria-label="Dispositivo" data-startup-loading-step data-threshold="4" data-state="active"><span class="startup-loading-step-icon">${renderUiIcon("save", "startup-loading-icon")}</span></li>
              <li aria-label="Conta" data-startup-loading-step data-threshold="36" data-state="waiting"><span class="startup-loading-step-icon">${renderUiIcon("sign-in", "startup-loading-icon")}</span></li>
              <li aria-label="Cursos" data-startup-loading-step data-threshold="68" data-state="waiting"><span class="startup-loading-step-icon">${renderUiIcon("card", "startup-loading-icon")}</span></li>
            </ol>
            <div class="startup-loading-track" role="progressbar" aria-label="Progresso da abertura" aria-valuemin="0" aria-valuemax="100" aria-valuenow="4" data-startup-loading-progress><span data-startup-loading-fill style="width:4%"></span></div>
            <p class="startup-loading-percent" data-startup-loading-percent>4%</p>
          </div>
        </div>
      </section>
    </main>
  `;
}

function updateStartupLoading(root, percent) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const progress = root.querySelector("[data-startup-loading-progress]");
  const fill = root.querySelector("[data-startup-loading-fill]");
  const label = root.querySelector("[data-startup-loading-percent]");
  if (!progress || !fill || !label) return;
  progress.setAttribute("aria-valuenow", String(value));
  fill.style.width = `${value}%`;
  label.textContent = `${value}%`;
  const steps = [...root.querySelectorAll("[data-startup-loading-step]")];
  steps.forEach((step, index) => {
    const threshold = Number(step.dataset.threshold || 0);
    const nextThreshold = Number(steps[index + 1]?.dataset.threshold || 101);
    const state = value >= 100 || value >= nextThreshold
      ? "complete"
      : value >= threshold ? "active" : "waiting";
    step.dataset.state = state;
    if (state === "active") step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
}

function renderSettings(root, authClient, controller, {
  onProfileChange = () => {},
  confirmValue = globalThis.confirm?.bind(globalThis) || (() => false),
  promptValue = globalThis.prompt?.bind(globalThis) || (() => null)
} = {}) {
  root.innerHTML = `
    <section class="account-settings-overlay" data-settings hidden aria-label="Configurações">
      <div class="account-settings-backdrop" data-settings-close></div>
      <div class="account-settings-sheet courses-home-screen" role="dialog" aria-modal="true" aria-label="Conta e aparência">
        <header class="account-settings-header">
          <div class="account-settings-title-row">
            <h1 class="account-settings-title">Conta e aparência</h1>
            <button class="icon-ghost account-settings-close" type="button" data-settings-close title="Fechar" aria-label="Fechar">${renderUiIcon("remove-state", "account-settings-action-icon")}</button>
          </div>
        </header>
        <div class="account-settings-content">
          <form class="account-profile-form" data-profile-form>
            <div class="account-profile-avatar">
              <span class="account-profile-avatar-fallback" data-profile-avatar-fallback>${renderUiIcon("account", "account-profile-avatar-icon")}</span>
              <img data-profile-avatar-image alt="" hidden>
              <input data-profile-avatar-file type="file" accept="image/jpeg,image/png,image/webp" hidden>
              <button class="icon-ghost" type="button" data-profile-avatar-choose title="Escolher foto" aria-label="Escolher foto">${renderUiIcon("edit", "account-settings-action-icon")}</button>
              <button class="icon-ghost" type="button" data-profile-avatar-remove title="Remover foto" aria-label="Remover foto">${renderUiIcon("trash", "account-settings-action-icon")}</button>
            </div>
            <label for="account-profile-display-name">Nome</label>
            <div class="account-profile-name-row">
              <input id="account-profile-display-name" data-profile-name maxlength="120" autocomplete="name" required placeholder="Como deseja aparecer">
              <button class="icon-ghost is-primary" type="submit" data-profile-save title="Salvar perfil" aria-label="Salvar perfil">${renderUiIcon("save", "account-settings-action-icon")}</button>
            </div>
          </form>
          <div class="account-danger-zone">
            <button class="icon-ghost is-danger" type="button" data-settings-delete-account title="Excluir conta" aria-label="Excluir conta">${renderUiIcon("trash", "account-settings-action-icon")}</button>
            <span>Excluir conta e dados ativos</span>
          </div>
        </div>
        <p class="account-settings-status" data-settings-status role="status" aria-live="polite"></p>
        <footer class="account-settings-footer">
          <div class="account-settings-primary-actions"></div>
          <div class="theme-choice" role="group" aria-label="Aparência">
            <button class="theme-choice-button" type="button" data-theme-choice="system" title="Tema do sistema" aria-label="Tema do sistema">${renderUiIcon("theme-system", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="light" title="Tema claro" aria-label="Tema claro">${renderUiIcon("theme-light", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="dark" title="Tema escuro" aria-label="Tema escuro">${renderUiIcon("theme-dark", "theme-choice-icon")}</button>
          </div>
          <div class="account-settings-account-actions">
            <button class="icon-ghost" type="button" data-settings-signout title="Sair" aria-label="Sair">${renderUiIcon("sign-out", "account-settings-action-icon")}</button>
          </div>
        </footer>
      </div>
    </section>
  `;
  const overlay = root.querySelector("[data-settings]");
  const status = root.querySelector("[data-settings-status]");
  const profileName = root.querySelector("[data-profile-name]");
  const profileFile = root.querySelector("[data-profile-avatar-file]");
  const profileImage = root.querySelector("[data-profile-avatar-image]");
  const profileFallback = root.querySelector("[data-profile-avatar-fallback]");
  let profile = null;
  let avatarUrl = "";
  let selectedFile = null;
  let profileLoading = null;

  const replaceAvatarUrl = (nextUrl) => {
    if (avatarUrl && avatarUrl !== nextUrl) globalThis.URL?.revokeObjectURL?.(avatarUrl);
    avatarUrl = nextUrl || "";
    profileImage.hidden = !avatarUrl;
    profileImage.src = avatarUrl;
    profileFallback.hidden = Boolean(avatarUrl);
    onProfileChange({
      displayName: profile?.displayName || null,
      avatarUrl
    });
  };

  const loadProfile = async ({ force = false } = {}) => {
    if (profileLoading && !force) return profileLoading;
    const task = (async () => {
      status.textContent = "Carregando perfil…";
      try {
        profile = await controller.getPersonProfile();
        profileName.value = profile?.displayName || "";
        let nextAvatarUrl = "";
        if (profile?.avatarObjectKey) {
          try {
            const blob = await controller.loadAvatar(profile.avatarObjectKey);
            nextAvatarUrl = globalThis.URL?.createObjectURL?.(blob) || "";
          } catch {
            nextAvatarUrl = "";
          }
        }
        replaceAvatarUrl(nextAvatarUrl);
        status.textContent = "";
        return profile;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Não foi possível carregar o perfil.";
        return null;
      }
    })();
    profileLoading = task;
    try {
      return await task;
    } finally {
      if (profileLoading === task) profileLoading = null;
    }
  };
  const syncTheme = () => {
    const preference = globalThis.AraLearnTheme?.getState?.().preference || "system";
    root.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const selected = button.dataset.themeChoice === preference;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  const close = () => {
    overlay.hidden = true;
    status.textContent = "";
  };
  root.querySelector("[data-profile-avatar-choose]")?.addEventListener("click", () => {
    profileFile.click();
  });
  profileFile?.addEventListener("change", () => {
    selectedFile = profileFile.files?.[0] || null;
    if (!selectedFile) return;
    replaceAvatarUrl(globalThis.URL?.createObjectURL?.(selectedFile) || "");
  });
  root.querySelector("[data-profile-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = String(profileName.value || "").trim();
    if (!displayName) {
      status.textContent = "Informe seu nome.";
      profileName.focus();
      return;
    }
    const previousAvatarObjectKey = profile?.avatarObjectKey || null;
    let uploadedObjectKey = null;
    let profileUpdated = false;
    let avatarCleanupPending = false;
    status.textContent = "Salvando perfil…";
    try {
      if (selectedFile) {
        uploadedObjectKey = (await controller.uploadAvatar(selectedFile)).objectKey;
      }
      profile = await controller.updatePersonProfile({
        displayName,
        ...(uploadedObjectKey ? { avatarObjectKey: uploadedObjectKey } : {})
      });
      profileUpdated = true;
      selectedFile = null;
      profileFile.value = "";
      if (uploadedObjectKey && previousAvatarObjectKey &&
          previousAvatarObjectKey !== uploadedObjectKey) {
        avatarCleanupPending = !await controller.deleteOwnAvatar(previousAvatarObjectKey)
          .then(() => true)
          .catch(() => false);
      }
      await loadProfile({ force: true });
      status.textContent = avatarCleanupPending
        ? "Perfil salvo; a limpeza da foto anterior ficou pendente."
        : "Perfil salvo.";
    } catch (error) {
      if (uploadedObjectKey && !profileUpdated) {
        await controller.deleteOwnAvatar(uploadedObjectKey).catch(() => undefined);
      }
      await loadProfile({ force: true });
      status.textContent = error instanceof Error ? error.message : "Não foi possível salvar o perfil.";
    }
  });
  root.querySelector("[data-profile-avatar-remove]")?.addEventListener("click", async () => {
    if (!profile?.avatarObjectKey ||
        !confirmValue("Remover sua foto de perfil?")) return;
    const previousAvatarObjectKey = profile.avatarObjectKey;
    status.textContent = "Removendo foto…";
    try {
      profile = await controller.updatePersonProfile({ avatarObjectKey: null });
      replaceAvatarUrl("");
      const removed = await controller.deleteOwnAvatar(previousAvatarObjectKey)
        .then(() => true)
        .catch(() => false);
      status.textContent = removed
        ? "Foto removida."
        : "A foto saiu do perfil; a limpeza do objeto ficou pendente.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível remover a foto.";
    }
  });
  root.querySelector("[data-settings-delete-account]")?.addEventListener("click", async (event) => {
    const confirmation = promptValue(
      "Esta ação exclui a conta e os dados ativos. Digite EXCLUIR MINHA CONTA para continuar."
    );
    if (confirmation !== "EXCLUIR MINHA CONTA") return;
    event.currentTarget.disabled = true;
    status.textContent = "Excluindo conta…";
    try {
      await repository?.flush();
      await controller.deleteMyAccount({ confirmation });
      await clearAraLearnLocalState();
      globalThis.location.reload();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível excluir a conta.";
      event.currentTarget.disabled = false;
    }
  });
  root.querySelectorAll("[data-settings-close]").forEach((button) => {
    button.addEventListener("click", close);
  });
  root.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      globalThis.AraLearnTheme?.setPreference?.(button.dataset.themeChoice);
      syncTheme();
    });
  });
  root.querySelector("[data-settings-signout]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    status.textContent = "";
    try {
      await repository?.flush();
      await authClient.signOut();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível sair.";
      event.currentTarget.disabled = false;
    }
  });
  syncTheme();
  return Object.freeze({
    loadProfile,
    open() {
      syncTheme();
      overlay.hidden = false;
      void loadProfile();
      root.querySelector("[data-settings-close]")?.focus();
    },
    close,
    handleBack() {
      if (overlay.hidden) return false;
      close();
      return true;
    }
  });
}

function clearAuthoringRoute() {
  if (!isCourseAuthoringRouteCandidate(globalThis.location.hash)) return;
  globalThis.history.replaceState(
    globalThis.history.state ?? null,
    "",
    `${globalThis.location.pathname}${globalThis.location.search}`
  );
}

async function renderAuthenticatedApplication(root, config, authClient) {
  const courseApi = new CourseApiClient({
    projectUrl: config.projectUrl,
    publishableKey: config.publishableKey,
    authClient
  });
  const studyController = new CourseController({ api: courseApi, store: courseLocalStore });
  const authoringController = new CourseController({
    api: courseApi,
    store: courseLocalStore,
    ownerOnly: true
  });
  const studyBridge = new CourseStudyBridge({ controller: studyController });
  repository = new CourseStudyRepository({
    bridge: studyBridge,
    api: courseApi,
    cache: courseLocalStore
  });
  updateStartupLoading(root, 68);
  try {
    await repository.initialize();
  } catch (error) {
    if (authSessionWasRejected(error, authClient)) {
      if (authClient.getSession()) await authClient.clearSession();
      authClient.emit("SESSION_INVALID");
      return;
    }
    throw error;
  }
  updateStartupLoading(root, 100);
  const project = repository.loadProject();
  root.innerHTML = `
    <div id="aralearn-editor-root"></div>
    <div id="aralearn-authoring-root" hidden></div>
    <div id="aralearn-settings-root"></div>
  `;
  const editorRoot = root.querySelector("#aralearn-editor-root");
  const authoringRoot = root.querySelector("#aralearn-authoring-root");
  const settingsRoot = root.querySelector("#aralearn-settings-root");
  let editorApp = null;
  let authoringSurface = null;
  const settings = renderSettings(settingsRoot, authClient, authoringController, {
    onProfileChange(profile) {
      editorApp?.setAccountProfile?.(profile);
    }
  });

  const refreshStudy = async () => {
    await repository.flush();
    const nextProject = await repository.refreshCourses();
    await editorApp?.replaceProject(nextProject);
    await editorApp?.refreshPersonalState?.();
    return nextProject;
  };
  const bestEffortFlush = () => Promise.all([
    repository?.flush() || Promise.resolve(),
    editorApp?.flushPersonalState?.() || Promise.resolve()
  ]).catch(() => undefined);

  editorApp = createCourseStudyApplication({
    root: editorRoot,
    repository,
    initialProject: project
  });
  void settings.loadProfile();
  authoringSurface = createCourseAuthoringSurface({
    root: authoringRoot,
    controller: authoringController,
    onClose() {
      clearAuthoringRoute();
      authoringRoot.hidden = true;
      editorRoot.hidden = false;
      void refreshStudy().catch((error) => {
        console.warn("A lista de Cursos será atualizada na próxima conexão.", error);
      });
    }
  });

  const openAuthoring = () => {
    settings.close();
    editorRoot.hidden = true;
    authoringRoot.hidden = false;
    void authoringSurface.open();
  };
  const refreshVisibleApplication = () => authoringSurface?.opened
    ? authoringSurface.refresh()
    : refreshStudy();
  editorRoot.addEventListener("aralearn:open-settings", () => settings.open());
  editorRoot.addEventListener("aralearn:open-authoring", openAuthoring);

  lifecycleAbortController = new AbortController();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void bestEffortFlush();
    else void refreshVisibleApplication().catch((error) => {
      console.warn("A área atual será atualizada na próxima conexão.", error);
    });
  }, { signal: lifecycleAbortController.signal });
  globalThis.addEventListener("pagehide", () => void bestEffortFlush(), {
    signal: lifecycleAbortController.signal
  });
  globalThis.addEventListener("online", () => {
    void refreshVisibleApplication().catch((error) => {
      console.warn("A atualização da área atual foi adiada.", error);
    });
  }, { signal: lifecycleAbortController.signal });
  globalThis.addEventListener("offline", () => {
    editorApp?.setOfflineStatus?.(true);
  }, { signal: lifecycleAbortController.signal });
  globalThis.addEventListener("hashchange", () => {
    if (isCourseAuthoringRouteCandidate(globalThis.location.hash) && !authoringSurface.opened) {
      openAuthoring();
    }
  }, { signal: lifecycleAbortController.signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") settings.handleBack();
  }, { signal: lifecycleAbortController.signal });

  globalThis.AraLearnAndroid = {
    flush: bestEffortFlush,
    handleBackPress() {
      const destination = dispatchApplicationBack({
        closeOverlay: () => settings.handleBack(),
        handleAuthoringBack: () => authoringSurface?.handleBack?.() === true,
        handleStudyBack: () => editorApp?.handleBack?.() === true
      });
      if (destination !== "exit") return true;
      void bestEffortFlush().then(() => globalThis.AndroidHost?.finishApp?.());
      return true;
    }
  };
  if (isCourseAuthoringRouteCandidate(globalThis.location.hash)) openAuthoring();
}

async function start(root) {
  authStore = await AuthSessionStore.open(globalThis.indexedDB);
  watchLocalConnection(authStore);
  const oauthAuthorizationId = readOAuthAuthorizationId();
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
    if (["SIGNED_OUT_REMOTE", "SESSION_INVALID", "SIGNED_OUT"].includes(event)) {
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
      onAuthenticated() { globalThis.location.reload(); }
    });
    return;
  }
  if (!session.user?.id) {
    await authClient.clearSession();
    renderAuthGate({ root, authClient, configured: true });
    return;
  }
  if (oauthAuthorizationId) {
    await renderOAuthAuthorizationConsent({ root, authClient, authorizationId: oauthAuthorizationId });
    return;
  }
  activeUserId = session.user.id;
  renderStartupLoading(root);
  updateStartupLoading(root, 36);
  courseLocalStore = await CourseLocalStore.open(globalThis.indexedDB, { userId: activeUserId });
  watchLocalConnection(courseLocalStore);
  await renderAuthenticatedApplication(root, config, authClient);
}

const root = document.getElementById("app-root");
if (!root) throw new Error("Elemento raiz não encontrado.");

registerAraLearnServiceWorker().catch((error) => {
  console.warn("O shell offline não pôde ser registrado.", error);
});

start(root).catch((error) => {
  console.error("Falha fatal ao iniciar a UI do AraLearn.", error);
  if (localConnectionRefreshPending || authenticationShutdown) return;
  renderStartupFailure(root, error);
});
