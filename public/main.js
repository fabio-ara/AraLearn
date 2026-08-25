import { AuthSessionStore } from "../src/persistence/AuthSessionStore.js";
import { createUuid } from "../src/domain/identifiers.js";
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
import { createCourseProviderSession } from
  "../src/ui/CourseProviderAssistance.js";

let authStore = null;
let courseLocalStore = null;
let repository = null;
let authenticationShutdown = null;
let activeUserId = null;
let lifecycleAbortController = null;
let localConnectionRefreshPending = false;
let courseProviderSession = null;
let pendingCompositionCleanup = null;
let authenticatedApplicationCleanup = null;
let removeLocalDataOnShutdown = false;

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

function quiesceAraLearnAuthenticatedInteractions() {
  const cleanupApplication = authenticatedApplicationCleanup;
  authenticatedApplicationCleanup = null;
  cleanupApplication?.();
  lifecycleAbortController?.abort();
  lifecycleAbortController = null;
  courseProviderSession?.destroy?.();
  courseProviderSession = null;
}

async function closeAraLearnLocalConnections() {
  quiesceAraLearnAuthenticatedInteractions();
  if (pendingCompositionCleanup) await pendingCompositionCleanup();
  pendingCompositionCleanup = null;
  if (repository) {
    await repository.close();
    repository = null;
  }
  courseLocalStore?.close();
  courseLocalStore = null;
  authStore?.close();
  authStore = null;
}

async function clearAraLearnLocalState({ removeSession = true } = {}) {
  const userId = activeUserId;
  quiesceAraLearnAuthenticatedInteractions();
  pendingCompositionCleanup = null;
  if (repository) {
    await repository.close({ flush: false });
    repository = null;
  }
  courseLocalStore?.close();
  courseLocalStore = null;
  authStore?.close();
  authStore = null;
  if (userId) await CourseLocalStore.deleteDatabase(globalThis.indexedDB, { userId });
  if (removeSession) await AuthSessionStore.deleteDatabase(globalThis.indexedDB);
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

function renderDeletedAccountCleanupFailure(root, error) {
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card" aria-live="assertive">
        <header class="auth-brand"><img src="assets/brand/aralearn-mark-monochrome.svg" alt=""><span>AraLearn</span></header>
        <p class="auth-recovery-title">Sua conta foi excluída.</p>
        <p>Alguns dados deste dispositivo ainda precisam ser removidos.</p>
        <p class="auth-status" data-kind="error" data-account-cleanup-error></p>
        <div class="auth-actions"><button class="auth-icon-button is-primary" type="button" data-account-cleanup-retry title="Tentar remover novamente" aria-label="Tentar remover novamente">${renderUiIcon("trash", "auth-button-icon")}</button></div>
      </section>
    </main>
  `;
  root.querySelector("[data-account-cleanup-error]").textContent =
    error instanceof Error ? error.message : String(error);
  root.querySelector("[data-account-cleanup-retry]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await clearAraLearnLocalState();
      globalThis.location.reload();
    } catch (retryError) {
      renderDeletedAccountCleanupFailure(root, retryError);
    }
  });
}

function renderQuiescedOperationRecovery(root, {
  title = "A ação foi interrompida.",
  message = "Recarregue o AraLearn para reconstruir a sessão e continuar.",
  error = null,
  actionLabel = "Recarregar",
  action = null
} = {}) {
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card" role="alert">
        <header class="auth-brand"><img src="assets/brand/aralearn-mark-monochrome.svg" alt=""><span>AraLearn</span></header>
        <p class="auth-recovery-title" data-quiesced-recovery-title></p>
        <p data-quiesced-recovery-message></p>
        <p class="auth-status" data-kind="error" data-quiesced-recovery-error></p>
        <div class="auth-actions"><button class="auth-icon-button is-primary" type="button" data-quiesced-recovery-reload title="Recarregar" aria-label="Recarregar">${renderUiIcon("progress", "auth-button-icon")}</button></div>
      </section>
    </main>
  `;
  root.querySelector("[data-quiesced-recovery-title]").textContent = title;
  root.querySelector("[data-quiesced-recovery-message]").textContent = message;
  root.querySelector("[data-quiesced-recovery-error]").textContent =
    error instanceof Error ? error.message : String(error || "");
  const actionButton = root.querySelector("[data-quiesced-recovery-reload]");
  actionButton?.setAttribute("title", actionLabel);
  actionButton?.setAttribute("aria-label", actionLabel);
  actionButton?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    if (!action) {
      globalThis.location.reload();
      return;
    }
    try {
      await action();
    } catch (actionError) {
      renderQuiescedOperationRecovery(root, {
        title,
        message,
        error: actionError,
        actionLabel,
        action
      });
    }
  });
}

function shutDownAuthenticatedRuntime(root) {
  if (authenticationShutdown) return authenticationShutdown;
  authenticationShutdown = (async () => {
    root.setAttribute("aria-busy", "true");
    root.classList.add("is-signing-out");
    try {
      if (removeLocalDataOnShutdown) await clearAraLearnLocalState();
      else await closeAraLearnLocalConnections();
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
              <li aria-label="Cursos" data-startup-loading-step data-threshold="68" data-state="waiting"><span class="startup-loading-step-icon">${renderUiIcon("study", "startup-loading-icon")}</span></li>
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
  onQuiescedFailure = ({ error } = {}) => renderQuiescedOperationRecovery(root, { error }),
  onDeletedAccountCleanupFailure = (error) => renderDeletedAccountCleanupFailure(root, error),
  confirmValue = globalThis.confirm?.bind(globalThis) || (() => false),
  promptValue = globalThis.prompt?.bind(globalThis) || (() => null)
} = {}) {
  root.innerHTML = `
    <section class="account-settings-overlay" data-settings hidden aria-label="Configurações">
      <div class="account-settings-backdrop" data-settings-close></div>
      <div class="account-settings-sheet courses-home-screen" role="dialog" aria-modal="true" aria-label="Conta e aparência" tabindex="-1">
        <header class="account-settings-header">
          <div class="account-settings-title-row">
            <button class="icon-ghost account-settings-back" type="button" data-settings-back title="Voltar" aria-label="Voltar" hidden>${renderUiIcon("arrow-left", "account-settings-action-icon")}</button>
            <h1 class="account-settings-title" data-settings-title>Conta e aparência</h1>
            <button class="icon-ghost account-settings-close" type="button" data-settings-close title="Fechar" aria-label="Fechar">${renderUiIcon("remove-state", "account-settings-action-icon")}</button>
          </div>
        </header>
        <div class="account-settings-content">
          <section class="account-settings-view" data-settings-view="main">
          <form class="account-profile-form" data-profile-form>
            <div class="account-profile-avatar">
              <button class="account-profile-avatar-target" type="button" data-settings-open-view="photo" title="Foto do perfil" aria-label="Abrir Foto do perfil">
                <span class="account-profile-avatar-fallback" data-profile-avatar-fallback>${renderUiIcon("account", "account-profile-avatar-icon")}</span>
                <img data-profile-avatar-image alt="" hidden>
              </button>
              <input data-profile-avatar-file type="file" accept="image/jpeg,image/png,image/webp" hidden>
            </div>
            <label for="account-profile-display-name">Nome</label>
            <div class="account-profile-name-row">
              <input id="account-profile-display-name" data-profile-name maxlength="120" autocomplete="name" required placeholder="Como deseja aparecer">
              <button class="icon-ghost is-primary" type="submit" data-profile-save title="Salvar perfil" aria-label="Salvar perfil">${renderUiIcon("save", "account-settings-action-icon")}</button>
            </div>
          </form>
          <button class="account-settings-subview-entry" type="button" data-settings-open-view="account">
            <span>${renderUiIcon("account", "account-settings-action-icon")}<strong>Dados e conta</strong></span>
            ${renderUiIcon("arrow-right", "account-settings-action-icon")}
          </button>
          <section class="account-maintenance account-settings-disclosure" data-settings-maintenance hidden>
            <div class="account-maintenance-heading">
              <div><h2 id="account-maintenance-title">Manutenção</h2></div>
              <button class="icon-ghost" type="button" data-maintenance-reload title="Atualizar Manutenção" aria-label="Atualizar Manutenção">${renderUiIcon("rotate", "account-settings-action-icon")}</button>
            </div>
            <p data-maintenance-status role="status" aria-live="polite"></p>
            <div data-maintenance-summary></div>
            <div class="account-maintenance-actions">
              <button type="button" data-maintenance-retention>${renderUiIcon("rotate", "account-settings-action-icon")}<span>Executar retenção corrente</span></button>
            </div>
            <div data-maintenance-inventory></div>
          </section>
          </section>
          <section class="account-settings-view account-profile-photo-view" data-settings-view="photo" hidden aria-labelledby="account-settings-photo-title">
            <h2 id="account-settings-photo-title" class="visually-hidden">Foto do perfil</h2>
            <div class="account-profile-photo-preview" aria-hidden="true">
              <span data-profile-avatar-view-fallback>${renderUiIcon("account", "account-profile-avatar-icon")}</span>
              <img data-profile-avatar-view-image alt="" hidden>
            </div>
            <div class="account-profile-photo-actions">
              <button type="button" data-profile-avatar-choose>${renderUiIcon("upload", "account-settings-action-icon")}<span data-profile-avatar-choose-label>Escolher foto</span></button>
              <button class="is-danger" type="button" data-profile-avatar-remove hidden>${renderUiIcon("trash", "account-settings-action-icon")}<span>Remover foto</span></button>
            </div>
          </section>
          <section class="account-settings-view account-device-data" data-settings-view="account" hidden aria-labelledby="account-settings-account-title">
            <h2 id="account-settings-account-title" class="visually-hidden">Dados e conta</h2>
            <div class="account-device-data-actions">
              <button type="button" data-settings-clear-device>${renderUiIcon("trash", "account-settings-action-icon")}<span>Remover dados deste dispositivo</span></button>
              <button type="button" data-settings-signout>${renderUiIcon("sign-out", "account-settings-action-icon")}<span>Sair</span></button>
              <button class="is-danger" type="button" data-settings-signout-clear>${renderUiIcon("sign-out", "account-settings-action-icon")}<span>Sair e remover dados deste dispositivo</span></button>
              <button class="is-danger" type="button" data-settings-delete-account>${renderUiIcon("trash", "account-settings-action-icon")}<span>Excluir conta</span></button>
            </div>
          </section>
        </div>
        <p class="account-settings-status" data-settings-status role="status" aria-live="polite"></p>
        <footer class="account-settings-footer">
          <div class="account-settings-primary-actions"></div>
          <div class="theme-choice" role="group" aria-label="Aparência">
            <button class="theme-choice-button" type="button" data-theme-choice="system" title="Tema do sistema" aria-label="Tema do sistema">${renderUiIcon("theme-system", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="light" title="Tema claro" aria-label="Tema claro">${renderUiIcon("theme-light", "theme-choice-icon")}</button>
            <button class="theme-choice-button" type="button" data-theme-choice="dark" title="Tema escuro" aria-label="Tema escuro">${renderUiIcon("theme-dark", "theme-choice-icon")}</button>
          </div>
          <div class="account-settings-account-actions" aria-hidden="true"></div>
        </footer>
      </div>
    </section>
  `;
  const overlay = root.querySelector("[data-settings]");
  const sheet = root.querySelector(".account-settings-sheet");
  const status = root.querySelector("[data-settings-status]");
  const settingsTitle = root.querySelector("[data-settings-title]");
  const settingsBack = root.querySelector("[data-settings-back]");
  const profileName = root.querySelector("[data-profile-name]");
  const profileFile = root.querySelector("[data-profile-avatar-file]");
  const profileImage = root.querySelector("[data-profile-avatar-image]");
  const profileFallback = root.querySelector("[data-profile-avatar-fallback]");
  const profileViewImage = root.querySelector("[data-profile-avatar-view-image]");
  const profileViewFallback = root.querySelector("[data-profile-avatar-view-fallback]");
  const profileRemove = root.querySelector("[data-profile-avatar-remove]");
  const profileChooseLabel = root.querySelector("[data-profile-avatar-choose-label]");
  const maintenance = root.querySelector("[data-settings-maintenance]");
  const maintenanceStatus = root.querySelector("[data-maintenance-status]");
  const maintenanceSummary = root.querySelector("[data-maintenance-summary]");
  const maintenanceInventory = root.querySelector("[data-maintenance-inventory]");
  let profile = null;
  let avatarUrl = "";
  let selectedFile = null;
  let pendingAvatarCleanupObjectKey = null;
  let pendingAvatarResolution = null;
  let profileLoading = null;
  let settingsOpener = null;
  let maintenanceState = null;
  let maintenanceLoading = false;
  let activeSettingsView = "main";
  let settingsSubviewOpener = null;

  const maintenanceLabels = Object.freeze({
    avatar_owner_missing: "Avatar sem conta",
    avatar_profile_unlinked: "Avatar sem vínculo de perfil",
    pdf_course_missing: "PDF de Curso ausente",
    pdf_unlinked: "PDF sem vínculo",
    pdf_object_missing: "Registro de PDF sem arquivo"
  });
  const removableMaintenanceClasses = new Set([
    "avatar_owner_missing", "avatar_profile_unlinked", "pdf_course_missing", "pdf_unlinked"
  ]);

  const renderMaintenance = () => {
    if (!maintenanceState || maintenanceState.role !== "administrator") return;
    maintenance.hidden = false;
    const retention = maintenanceState.retention || {};
    maintenanceSummary.replaceChildren();
    const retentionCopy = root.ownerDocument.createElement("p");
    retentionCopy.textContent = retention.scheduled
      ? `Retenção automática ativa${retention.schedule ? ` (${retention.schedule})` : ""}.`
      : "A retenção automática não está agendada.";
    maintenanceSummary.append(retentionCopy);
    maintenanceInventory.replaceChildren();
    const items = Array.isArray(maintenanceState.inventory?.items)
      ? maintenanceState.inventory.items
      : [];
    if (!items.length) {
      const empty = root.ownerDocument.createElement("p");
      empty.className = "muted tiny";
      empty.textContent = "Nenhum resíduo corrente foi encontrado.";
      maintenanceInventory.append(empty);
      return;
    }
    const list = root.ownerDocument.createElement("ul");
    list.className = "account-maintenance-list";
    for (const item of items) {
      const row = root.ownerDocument.createElement("li");
      const copy = root.ownerDocument.createElement("div");
      const title = root.ownerDocument.createElement("strong");
      title.textContent = maintenanceLabels[item.classification] || "Resíduo classificado";
      const path = root.ownerDocument.createElement("code");
      path.textContent = String(item.objectPath || "");
      copy.append(title, path);
      row.append(copy);
      if (removableMaintenanceClasses.has(item.classification) && item.objectPath) {
        const remove = root.ownerDocument.createElement("button");
        remove.type = "button";
        remove.className = "icon-ghost is-danger";
        remove.dataset.maintenanceRemove = "";
        remove.dataset.classification = item.classification;
        remove.dataset.objectPath = item.objectPath;
        remove.title = "Remover resíduo revalidado";
        remove.setAttribute("aria-label", `Remover ${title.textContent}`);
        remove.innerHTML = renderUiIcon("trash", "account-settings-action-icon");
        row.append(remove);
      }
      list.append(row);
    }
    maintenanceInventory.append(list);
  };

  const loadMaintenance = async ({ announce = false } = {}) => {
    if (maintenanceLoading) return maintenanceState;
    maintenanceLoading = true;
    if (announce) maintenanceStatus.textContent = "Atualizando Manutenção…";
    try {
      maintenanceState = await controller.loadCurrentMaintenance({ limit: 100 });
      maintenanceStatus.textContent = "";
      renderMaintenance();
      return maintenanceState;
    } catch (error) {
      if (Number(error?.status || 0) === 403) {
        maintenance.hidden = true;
        maintenanceState = null;
      } else if (!maintenance.hidden) {
        maintenanceStatus.textContent = error instanceof Error
          ? error.message
          : "Não foi possível atualizar a Manutenção.";
      }
      return null;
    } finally {
      maintenanceLoading = false;
    }
  };

  const focusableSettingsControls = () => [...sheet.querySelectorAll([
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([tabindex='-1'])"
  ].join(","))].filter((control) => !control.hidden && !control.closest("[hidden]"));

  const restoreSettingsFocus = () => {
    const documentValue = root.ownerDocument || globalThis.document;
    const currentOpener = settingsOpener && settingsOpener.isConnected !== false
      ? settingsOpener
      : [...documentValue.querySelectorAll("[data-action='open-settings']")]
        .find((candidate) => candidate.getClientRects?.().length > 0) ||
        documentValue.querySelector("[data-action='open-settings']");
    settingsOpener = null;
    currentOpener?.focus?.({ preventScroll: true });
  };

  const replaceAvatarUrl = (nextUrl) => {
    if (avatarUrl && avatarUrl !== nextUrl) globalThis.URL?.revokeObjectURL?.(avatarUrl);
    avatarUrl = nextUrl || "";
    profileImage.hidden = !avatarUrl;
    profileImage.src = avatarUrl;
    profileFallback.hidden = Boolean(avatarUrl);
    profileViewImage.hidden = !avatarUrl;
    profileViewImage.src = avatarUrl;
    profileViewFallback.hidden = Boolean(avatarUrl);
    profileRemove.hidden = !(avatarUrl || profile?.avatarObjectKey || selectedFile);
    profileChooseLabel.textContent = avatarUrl ? "Substituir foto" : "Escolher foto";
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
  const showSettingsView = (view, { restoreFocus = false } = {}) => {
    const nextView = new Set(["main", "photo", "account"]).has(view) ? view : "main";
    activeSettingsView = nextView;
    root.querySelectorAll("[data-settings-view]").forEach((section) => {
      section.hidden = section.dataset.settingsView !== nextView;
    });
    settingsBack.hidden = nextView === "main";
    settingsTitle.textContent = nextView === "photo"
      ? "Foto do perfil"
      : nextView === "account" ? "Dados e conta" : "Conta e aparência";
    if (restoreFocus && nextView === "main") {
      settingsSubviewOpener?.focus?.({ preventScroll: true });
      settingsSubviewOpener = null;
    } else if (nextView !== "main") {
      settingsBack.focus({ preventScroll: true });
    }
    root.querySelector(".account-settings-content")?.scrollTo?.({ top: 0, behavior: "instant" });
  };
  const close = ({ restoreFocus = true } = {}) => {
    if (overlay.hidden) return false;
    overlay.hidden = true;
    status.textContent = "";
    showSettingsView("main");
    settingsSubviewOpener = null;
    if (restoreFocus) restoreSettingsFocus();
    else settingsOpener = null;
    return true;
  };
  overlay.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (activeSettingsView === "main") close();
      else showSettingsView("main", { restoreFocus: true });
      return;
    }
    if (event.key !== "Tab") return;
    const controls = focusableSettingsControls();
    if (!controls.length) {
      event.preventDefault();
      sheet.focus({ preventScroll: true });
      return;
    }
    const documentValue = root.ownerDocument || globalThis.document;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (documentValue.activeElement === first ||
        !sheet.contains(documentValue.activeElement))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (documentValue.activeElement === last ||
        !sheet.contains(documentValue.activeElement))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });
  root.querySelector("[data-profile-avatar-choose]")?.addEventListener("click", () => {
    profileFile.click();
  });
  profileFile?.addEventListener("change", () => {
    selectedFile = profileFile.files?.[0] || null;
    if (!selectedFile) return;
    replaceAvatarUrl(globalThis.URL?.createObjectURL?.(selectedFile) || "");
  });
  root.querySelectorAll("[data-settings-open-view]").forEach((button) => {
    button.addEventListener("click", () => {
      settingsSubviewOpener = button;
      showSettingsView(button.dataset.settingsOpenView);
    });
  });
  settingsBack?.addEventListener("click", () => {
    showSettingsView("main", { restoreFocus: true });
  });
  const retryPendingAvatarCleanup = async () => {
    if (!pendingAvatarCleanupObjectKey) return true;
    const objectKey = pendingAvatarCleanupObjectKey;
    const removed = await controller.deleteOwnAvatar(objectKey)
      .then(() => true)
      .catch(() => false);
    if (removed && pendingAvatarCleanupObjectKey === objectKey) {
      pendingAvatarCleanupObjectKey = null;
    }
    return removed;
  };
  const resolvePendingAvatarUpload = async () => {
    if (!pendingAvatarResolution) return true;
    const pending = pendingAvatarResolution;
    const confirmedProfile = await loadProfile({ force: true });
    if (!confirmedProfile) {
      status.dataset.kind = "warning";
      status.textContent = "Ainda não foi possível confirmar se a foto enviada foi vinculada. Use Salvar novamente antes de outro envio.";
      return false;
    }
    pendingAvatarResolution = null;
    if (confirmedProfile.avatarObjectKey === pending.objectKey) {
      selectedFile = null;
      profileFile.value = "";
      if (pending.previousObjectKey && pending.previousObjectKey !== pending.objectKey) {
        pendingAvatarCleanupObjectKey = pending.previousObjectKey;
      }
    } else {
      pendingAvatarCleanupObjectKey = pending.objectKey;
    }
    return true;
  };
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
      if (!await resolvePendingAvatarUpload()) return;
      if (!await retryPendingAvatarCleanup()) {
        status.dataset.kind = "warning";
        status.textContent = "A foto não vinculada ainda precisa ser removida. Use Salvar novamente para repetir a limpeza antes de outro envio.";
        return;
      }
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
        if (avatarCleanupPending) {
          pendingAvatarCleanupObjectKey = previousAvatarObjectKey;
        }
      }
      await loadProfile({ force: true });
      status.dataset.kind = avatarCleanupPending ? "warning" : "success";
      status.textContent = avatarCleanupPending
        ? "Perfil salvo; a foto anterior ainda precisa ser removida. Use Salvar novamente para repetir a limpeza."
        : "Perfil salvo.";
    } catch (error) {
      let uploadedAvatarCleanupPending = false;
      if (uploadedObjectKey && !profileUpdated) {
        const confirmedProfile = await loadProfile({ force: true });
        if (confirmedProfile?.avatarObjectKey === uploadedObjectKey) {
          selectedFile = null;
          profileFile.value = "";
          if (previousAvatarObjectKey && previousAvatarObjectKey !== uploadedObjectKey) {
            pendingAvatarCleanupObjectKey = previousAvatarObjectKey;
            avatarCleanupPending = !await retryPendingAvatarCleanup();
          }
          status.dataset.kind = avatarCleanupPending ? "warning" : "success";
          status.textContent = avatarCleanupPending
            ? "Perfil salvo; a resposta se perdeu e a foto anterior ainda precisa ser removida. Use Salvar novamente para repetir a limpeza."
            : "Perfil salvo; a confirmação anterior foi recuperada.";
          return;
        }
        if (!confirmedProfile) {
          pendingAvatarResolution = {
            objectKey: uploadedObjectKey,
            previousObjectKey: previousAvatarObjectKey
          };
          status.dataset.kind = "warning";
          status.textContent = "Não foi possível confirmar se a foto enviada foi vinculada. O objeto foi preservado; use Salvar novamente para confirmar ou limpar antes de outro envio.";
          return;
        }
        uploadedAvatarCleanupPending = !await controller.deleteOwnAvatar(uploadedObjectKey)
          .then(() => true)
          .catch(() => false);
        if (uploadedAvatarCleanupPending) pendingAvatarCleanupObjectKey = uploadedObjectKey;
      }
      if (!uploadedObjectKey || profileUpdated) await loadProfile({ force: true });
      const failureMessage = error instanceof Error
        ? error.message
        : "Não foi possível salvar o perfil.";
      status.dataset.kind = uploadedAvatarCleanupPending ? "warning" : "error";
      status.textContent = uploadedAvatarCleanupPending
        ? `${failureMessage} A foto enviada não foi vinculada e ainda precisa ser removida. Use Salvar novamente para repetir a limpeza antes de outro envio.`
        : failureMessage;
    }
  });
  root.querySelector("[data-profile-avatar-remove]")?.addEventListener("click", async () => {
    if (selectedFile) {
      selectedFile = null;
      profileFile.value = "";
      if (profile?.avatarObjectKey) await loadProfile({ force: true });
      else replaceAvatarUrl("");
      status.textContent = "Foto não salva retirada.";
      return;
    }
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
      if (!removed) pendingAvatarCleanupObjectKey = previousAvatarObjectKey;
      status.dataset.kind = removed ? "success" : "warning";
      status.textContent = removed
        ? "Foto removida."
        : "A foto saiu do perfil, mas o objeto ainda precisa ser removido. Use Salvar novamente para repetir a limpeza.";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível remover a foto.";
    }
  });
  root.querySelector("[data-settings-delete-account]")?.addEventListener("click", async (event) => {
    const confirmation = promptValue(
      "Esta ação é irreversível: exclui sua conta, Cursos próprios, cópias pessoais e PDFs enviados. Digite EXCLUIR MINHA CONTA para continuar."
    );
    if (confirmation !== "EXCLUIR MINHA CONTA") return;
    event.currentTarget.disabled = true;
    status.textContent = "Excluindo conta…";
    quiesceAraLearnAuthenticatedInteractions();
    try {
      await controller.deleteMyAccount({ confirmation });
    } catch (error) {
      const deletionInProgress = error?.code === "account_deletion_in_progress";
      onQuiescedFailure({
        title: deletionInProgress
          ? "A exclusão precisa ser confirmada."
          : "Não foi possível confirmar a exclusão.",
        message: deletionInProgress
          ? "Alguns arquivos podem ter sido removidos, e a conta pode já ter sido excluída ou ainda aguardar a etapa final. Use a ação abaixo para confirmar ou concluir com a mesma sessão."
          : "A sessão foi interrompida com segurança. Recarregue o AraLearn antes de tentar novamente.",
        error,
        ...(deletionInProgress ? {
          actionLabel: "Confirmar ou concluir a exclusão",
          async action() {
            await controller.deleteMyAccount({ confirmation });
            try {
              await clearAraLearnLocalState();
              globalThis.location.reload();
            } catch (cleanupError) {
              onDeletedAccountCleanupFailure(cleanupError);
            }
          }
        } : {})
      });
      return;
    }
    status.textContent = "Conta excluída. Removendo dados deste dispositivo…";
    try {
      await clearAraLearnLocalState();
      globalThis.location.reload();
    } catch (error) {
      onDeletedAccountCleanupFailure(error);
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
  root.querySelector("[data-maintenance-reload]")?.addEventListener(
    "click",
    () => void loadMaintenance({ announce: true })
  );
  root.querySelector("[data-maintenance-retention]")?.addEventListener("click", async () => {
    if (maintenanceLoading || !confirmValue(
      "Executar agora a retenção corrente? Somente dados vencidos segundo a política instalada serão removidos."
    )) return;
    maintenanceLoading = true;
    maintenanceStatus.textContent = "Executando retenção corrente…";
    try {
      const result = await controller.executeCurrentMaintenance({
        operation: "run_retention",
        limit: 512,
        confirmed: true
      });
      maintenanceState = result.state;
      maintenanceStatus.textContent = "Retenção concluída e inventário atualizado.";
      renderMaintenance();
    } catch (error) {
      maintenanceStatus.textContent = error instanceof Error
        ? error.message
        : "Não foi possível executar a retenção.";
    } finally {
      maintenanceLoading = false;
    }
  });
  maintenanceInventory?.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-maintenance-remove]");
    if (!button || maintenanceLoading) return;
    const classification = button.dataset.classification;
    const objectPath = button.dataset.objectPath;
    if (!confirmValue(
      `Remover o resíduo ${maintenanceLabels[classification] || "classificado"}? O AraLearn revalidará exatamente este objeto antes da remoção.`
    )) return;
    maintenanceLoading = true;
    button.disabled = true;
    maintenanceStatus.textContent = "Revalidando e removendo o resíduo…";
    try {
      const result = await controller.executeCurrentMaintenance({
        operation: "remove_orphan_object",
        classification,
        objectPath,
        confirmed: true
      });
      maintenanceState = result.state;
      maintenanceStatus.textContent = "Resíduo removido e inventário atualizado.";
      renderMaintenance();
    } catch (error) {
      maintenanceStatus.textContent = error instanceof Error
        ? error.message
        : "Não foi possível remover o resíduo.";
      button.disabled = false;
    } finally {
      maintenanceLoading = false;
    }
  });
  const localDataControls = [
    root.querySelector("[data-settings-clear-device]"),
    root.querySelector("[data-settings-signout-clear]"),
    root.querySelector("[data-settings-signout]")
  ].filter(Boolean);
  const setLocalDataControlsDisabled = (disabled) => {
    localDataControls.forEach((button) => { button.disabled = disabled; });
  };
  root.querySelector("[data-settings-clear-device]")?.addEventListener("click", async () => {
    if (!confirmValue(
      "Remover os dados desta conta neste dispositivo? Cursos salvos para uso offline, progresso ainda não sincronizado e rascunhos ou edições pendentes serão perdidos. A conta continuará conectada; os dados de outras contas e os dados já enviados ao AraLearn permanecem."
    )) return;
    setLocalDataControlsDisabled(true);
    status.textContent = "Removendo os dados desta conta neste dispositivo…";
    try {
      await clearAraLearnLocalState({ removeSession: false });
      globalThis.location.reload();
    } catch (error) {
      onQuiescedFailure({
        title: "A limpeza local foi interrompida.",
        message: "Alguns dados podem já ter sido removidos. Recarregue o AraLearn para reconstruir a sessão antes de tentar novamente.",
        error
      });
    }
  });
  root.querySelector("[data-settings-signout-clear]")?.addEventListener("click", async () => {
    if (!confirmValue(
      "Sair e remover os dados desta conta neste dispositivo? Cursos salvos para uso offline, progresso ainda não sincronizado e rascunhos ou edições pendentes serão perdidos. Os dados de outras contas permanecem."
    )) return;
    removeLocalDataOnShutdown = true;
    setLocalDataControlsDisabled(true);
    status.textContent = "Saindo e removendo os dados desta conta neste dispositivo…";
    quiesceAraLearnAuthenticatedInteractions();
    try {
      await authClient.signOut();
    } catch (error) {
      removeLocalDataOnShutdown = false;
      onQuiescedFailure({
        title: "A saída foi interrompida.",
        message: "Recarregue o AraLearn para confirmar a sessão e o estado dos dados deste dispositivo.",
        error
      });
    }
  });
  root.querySelector("[data-settings-signout]")?.addEventListener("click", async () => {
    if (!confirmValue(
      "Sair desta conta? Cursos e dados já salvos permanecerão neste dispositivo. Alterações ainda abertas e não salvas serão perdidas."
    )) return;
    setLocalDataControlsDisabled(true);
    status.textContent = "Saindo. Os dados já salvos desta conta permanecerão neste dispositivo.";
    quiesceAraLearnAuthenticatedInteractions();
    try {
      await repository?.flush();
      await authClient.signOut();
    } catch (error) {
      onQuiescedFailure({
        title: "A saída foi interrompida.",
        message: "A sessão pode continuar ativa. Recarregue o AraLearn antes de tentar novamente.",
        error
      });
    }
  });
  syncTheme();
  return Object.freeze({
    loadProfile,
    open() {
      const documentValue = root.ownerDocument || globalThis.document;
      const activeElement = documentValue.activeElement;
      settingsOpener = activeElement && !overlay.contains(activeElement)
        ? activeElement
        : null;
      syncTheme();
      showSettingsView("main");
      overlay.hidden = false;
      void loadProfile();
      if (authClient.getSession?.()?.user?.app_metadata?.aralearn_role === "administrator") {
        void loadMaintenance();
      }
      root.querySelector("button[data-settings-close]")?.focus({ preventScroll: true });
    },
    close,
    handleBack() {
      if (overlay.hidden) return false;
      if (activeSettingsView !== "main") {
        showSettingsView("main", { restoreFocus: true });
        return true;
      }
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

async function deliverAuthoringRequest({ requestText } = {}) {
  const text = String(requestText || "").trim();
  if (!text) throw new TypeError("O pedido de Autoria está vazio.");
  if (typeof globalThis.navigator?.clipboard?.writeText !== "function") {
    throw new Error("Não foi possível copiar o pedido para o ChatGPT.");
  }
  await globalThis.navigator.clipboard.writeText(text);
  return {
    delivery: "clipboard",
    message: "Pedido copiado. Cole no ChatGPT para continuar a Autoria."
  };
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
    ownerOnly: true,
    deliverAuthoringRequest
  });
  pendingCompositionCleanup = () =>
    authoringController.clearPendingCourseCompositions();
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
    <div id="aralearn-authoring-root" class="course-authoring-root" hidden></div>
    <div id="aralearn-settings-root"></div>
  `;
  const editorRoot = root.querySelector("#aralearn-editor-root");
  const authoringRoot = root.querySelector("#aralearn-authoring-root");
  const settingsRoot = root.querySelector("#aralearn-settings-root");
  courseProviderSession = createCourseProviderSession();
  let editorApp = null;
  let authoringSurface = null;
  let authoringReturnFocus = null;
  const settings = renderSettings(settingsRoot, authClient, authoringController, {
    onProfileChange(profile) {
      editorApp?.setAccountProfile?.(profile);
    },
    onQuiescedFailure(details) {
      renderQuiescedOperationRecovery(root, details);
    },
    onDeletedAccountCleanupFailure(error) {
      renderDeletedAccountCleanupFailure(root, error);
    }
  });

  const refreshStudy = async () => {
    await repository.flush();
    if (await editorApp?.resumePendingManualEdit?.()) {
      return repository.loadProject();
    }
    const nextProject = await repository.refreshCourses();
    await editorApp?.replaceProject(nextProject);
    await editorApp?.refreshPersonalState?.();
    return nextProject;
  };
  const bestEffortFlush = () => Promise.all([
    repository?.flush() || Promise.resolve(),
    editorApp?.flushPersonalState?.() || Promise.resolve()
  ]).catch(() => undefined);

  let pendingStudyComposition = null;
  let pendingStudyStructure = null;
  let pendingStudyCourseMetadata = null;
  const saveStudyManualEdit = async (value) => {
    if (value.createsPersonalCopy === true) {
      return repository.commitPersonalCourseCopyEdit({
        sourceCourseId: value.courseId,
        expectedSourceCourseRevision: value.expectedCourseRevision,
        expectedStudyUnitVersion: value.expectedVersion,
        didacticMicrosequenceId: value.didacticMicrosequenceId,
        studyUnit: value.studyUnit,
        applicationOrigin: value.origin,
        targetId: value.targetId,
        sourceSelection: value.sourceSelection,
        replacesPendingRequestId: value.replacesPendingRequestId || null
      });
    }
    const intent = {
      courseId: value.courseId,
      expectedCourseRevision: value.expectedCourseRevision,
      expectedStudyUnitVersion: value.expectedVersion,
      didacticMicrosequenceId: value.didacticMicrosequenceId,
      studyUnit: value.studyUnit,
      origin: value.origin
    };
    const signature = JSON.stringify(intent);
    if (pendingStudyComposition?.signature !== signature) {
      pendingStudyComposition = { signature, requestId: createUuid() };
    }
    const result = await authoringController.commitCourseComposition({
      requestId: pendingStudyComposition.requestId,
      ...intent
    });
    pendingStudyComposition = null;
    return result;
  };

  const saveStudyAssistedStructure = async (value) => {
    let expectedCourseRevision = value.expectedCourseRevision;
    let result = null;
    if (value.scope === "course" && value.metadataChanged === true) {
      const authoringPlan = await authoringController.loadAuthoringPlan(value.courseId);
      const currentTitle = String(authoringPlan?.plan?.title || "");
      const currentObjective = String(authoringPlan?.plan?.objective || "");
      expectedCourseRevision = Number(authoringPlan?.courseRevision);
      if (currentTitle !== value.title || currentObjective !== value.objective) {
        const metadataIntent = {
          courseId: value.courseId,
          expectedCourseRevision,
          expectedPlanVersion: Number(authoringPlan?.plan?.version),
          operation: "update_plan",
          title: value.title,
          objective: value.objective
        };
        const metadataSignature = JSON.stringify(metadataIntent);
        if (pendingStudyCourseMetadata?.signature !== metadataSignature) {
          pendingStudyCourseMetadata = { signature: metadataSignature, requestId: createUuid() };
        }
        result = await authoringController.mutateAuthoringPlan({
          requestId: pendingStudyCourseMetadata.requestId,
          ...metadataIntent
        });
        pendingStudyCourseMetadata = null;
        expectedCourseRevision = Number(result?.courseRevision);
      }
    }
    const intent = {
      courseId: value.courseId,
      expectedCourseRevision,
      upserts: value.upserts,
      deletes: value.deletes
    };
    if (intent.upserts.length || intent.deletes.length) {
      const signature = JSON.stringify(intent);
      if (pendingStudyStructure?.signature !== signature) {
        pendingStudyStructure = { signature, requestId: createUuid() };
      }
      result = await authoringController.commitCourseStructuralComposition({
        requestId: pendingStudyStructure.requestId,
        ...intent
      });
      pendingStudyStructure = null;
    }
    await repository.refreshCourses();
    await repository.loadCourse(value.courseId);
    return {
      ...result,
      courseId: value.courseId,
      courseRevision: Number(result?.courseRevision || expectedCourseRevision),
      project: repository.loadProject()
    };
  };

  editorApp = createCourseStudyApplication({
    root: editorRoot,
    repository,
    initialProject: project,
    onSaveManualEdit: saveStudyManualEdit,
    onSaveAssistedStructure: saveStudyAssistedStructure,
    providerAssistanceSession: courseProviderSession
  });
  await editorApp.resumePendingManualEdit?.().catch((error) => {
    console.warn("A edição pessoal pendente poderá ser retomada na próxima conexão.", error);
  });
  void settings.loadProfile();
  authoringSurface = createCourseAuthoringSurface({
    root: authoringRoot,
    controller: authoringController,
    providerAssistanceSession: courseProviderSession,
    async onOpenStudyContent({ entityPath }) {
      const opened = await editorApp?.openEntityPath?.(entityPath);
      if (!opened) throw new Error("Não foi possível abrir este objeto no editor contextual.");
      authoringSurface?.destroy?.();
      authoringRoot.hidden = true;
      editorRoot.hidden = false;
    },
    onClose() {
      clearAuthoringRoute();
      authoringRoot.hidden = true;
      editorRoot.hidden = false;
      const returnOrigin = authoringReturnFocus;
      authoringReturnFocus = null;
      const restoreOriginFocus = () => {
        const current = returnOrigin?.element?.isConnected
          ? returnOrigin.element
          : [...editorRoot.querySelectorAll?.("[data-study-source-return]") || []]
              .find((node) => node.getAttribute("href") === returnOrigin?.href);
        current?.focus?.({ preventScroll: true });
      };
      globalThis.queueMicrotask?.(restoreOriginFocus);
      void refreshStudy().catch((error) => {
        console.warn("A lista de Cursos será atualizada na próxima conexão.", error);
      }).finally(() => globalThis.queueMicrotask?.(restoreOriginFocus));
    }
  });

  const openAuthoring = () => {
    settings.close();
    if (!editorRoot.hidden && editorRoot.contains(document.activeElement)) {
      const element = document.activeElement;
      authoringReturnFocus = {
        element,
        href: element.matches?.("[data-study-source-return]")
          ? element.getAttribute("href")
          : null
      };
    }
    editorRoot.hidden = true;
    authoringRoot.hidden = false;
    void authoringSurface.open();
  };
  const refreshVisibleApplication = () => authoringSurface?.opened && !authoringRoot.hidden
    ? authoringSurface.refresh()
    : refreshStudy();
  let visibleRefreshTimer = null;
  const cleanupApplication = () => {
    if (visibleRefreshTimer !== null) globalThis.clearTimeout(visibleRefreshTimer);
    visibleRefreshTimer = null;
    authoringSurface?.destroy?.();
    authoringSurface = null;
    editorApp?.destroy?.();
    editorApp = null;
  };
  authenticatedApplicationCleanup = cleanupApplication;
  const scheduleVisibleApplicationRefresh = () => {
    if (document.visibilityState === "hidden") return;
    if (visibleRefreshTimer !== null) globalThis.clearTimeout(visibleRefreshTimer);
    visibleRefreshTimer = globalThis.setTimeout(() => {
      visibleRefreshTimer = null;
      void refreshVisibleApplication().catch((error) => {
        console.warn("A área atual será atualizada na próxima conexão.", error);
      });
    }, 180);
  };
  editorRoot.addEventListener("aralearn:open-settings", () => settings.open());
  editorRoot.addEventListener("aralearn:open-authoring", openAuthoring);

  lifecycleAbortController = new AbortController();
  lifecycleAbortController.signal.addEventListener("abort", () => {
    if (authenticatedApplicationCleanup !== cleanupApplication) return;
    authenticatedApplicationCleanup = null;
    cleanupApplication();
  }, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void bestEffortFlush();
    else scheduleVisibleApplicationRefresh();
  }, { signal: lifecycleAbortController.signal });
  globalThis.addEventListener("focus", scheduleVisibleApplicationRefresh, {
    signal: lifecycleAbortController.signal
  });
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
