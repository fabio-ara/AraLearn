import { SupabaseHttpClient } from "./SupabaseHttpClient.js";
import { buildAuthRedirectUrl } from "./runtimeConfig.js";

export const AUTH_SESSION_STATE_KEY = "auth.session";
export const AUTH_PKCE_STATE_KEY = "auth.pkce";
const AUTH_BROADCAST_CHANNEL = "aralearn-auth-v1";
const AUTH_REFRESH_LOCK = "aralearn-auth-refresh-v1";
const AUTH_CALLBACK_QUERY_FIELDS = ["code", "auth_state", "error", "error_code", "error_description"];
const AUTH_PKCE_MAX_AGE_MS = 15 * 60 * 1000;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function authorizationId(value) {
  const result = text(value);
  if (!/^[A-Za-z0-9._~-]{8,512}$/u.test(result)) {
    throw new Error("Identificador de autorização OAuth inválido.");
  }
  return result;
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function sessionExpiry(session, nowSeconds) {
  const explicit = Number(session?.expires_at);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const lifetime = Number(session?.expires_in);
  return Number.isFinite(lifetime) && lifetime > 0 ? nowSeconds + lifetime : 0;
}

function userFromAccessToken(accessToken) {
  const parts = text(accessToken).split(".");
  if (parts.length !== 3 || typeof globalThis.atob !== "function") return null;
  try {
    const source = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(globalThis.atob(source + "=".repeat((4 - source.length % 4) % 4)));
    const id = text(payload?.sub);
    return id ? { id } : null;
  } catch {
    return null;
  }
}

function normalizeSession(rawSession, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!rawSession || typeof rawSession !== "object" || !text(rawSession.access_token)) return null;
  const userId = text(rawSession.user?.id) || userFromAccessToken(rawSession.access_token)?.id || "";
  return {
    access_token: text(rawSession.access_token),
    refresh_token: text(rawSession.refresh_token),
    token_type: text(rawSession.token_type) || "bearer",
    expires_at: sessionExpiry(rawSession, nowSeconds),
    user: userId ? { id: userId } : null
  };
}

function isNetworkFailure(error) {
  return (
    error instanceof TypeError ||
    error?.name === "AbortError" ||
    error?.status === 0 ||
    error?.status === 429 ||
    Number(error?.status) >= 500
  );
}

function authParameters(locationValue) {
  const query = new URLSearchParams(text(locationValue?.search).replace(/^\?/, ""));
  const hash = text(locationValue?.hash).replace(/^#/, "");
  const fragment = new URLSearchParams(hash);
  const error =
    query.get("error_description") || query.get("error") ||
    fragment.get("error_description") || fragment.get("error");
  if (error) {
    return {
      error: String(error).replaceAll("+", " "),
      errorCode: query.get("error_code") || fragment.get("error_code") || "auth_callback_error"
    };
  }
  const code = query.get("code");
  if (code) return { code, state: query.get("auth_state") || "" };
  if (fragment.get("access_token")) return { implicitToken: true };
  return null;
}

function callbackFreePath(locationValue) {
  const query = new URLSearchParams(text(locationValue?.search).replace(/^\?/, ""));
  AUTH_CALLBACK_QUERY_FIELDS.forEach((fieldName) => query.delete(fieldName));
  const serialized = query.toString();
  return `${locationValue?.pathname || "/"}${serialized ? `?${serialized}` : ""}`;
}

function base64Url(bytes) {
  if (typeof globalThis.btoa !== "function") {
    throw new Error("PKCE exige codificação base64 disponível no runtime.");
  }
  let source = "";
  bytes.forEach((value) => { source += String.fromCharCode(value); });
  return globalThis.btoa(source)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function createPkcePair(cryptoValue) {
  if (
    !cryptoValue?.getRandomValues ||
    !cryptoValue?.subtle?.digest ||
    typeof globalThis.TextEncoder !== "function"
  ) {
    throw new Error("PKCE exige Web Crypto com SHA-256.");
  }
  const verifier = base64Url(cryptoValue.getRandomValues(new Uint8Array(32)));
  const state = base64Url(cryptoValue.getRandomValues(new Uint8Array(32)));
  const digest = await cryptoValue.subtle.digest(
    "SHA-256",
    new globalThis.TextEncoder().encode(verifier)
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)), state };
}

function redirectWithAuthState(redirectTo, state) {
  if (!redirectTo) return "";
  const redirect = new URL(redirectTo);
  redirect.searchParams.set("auth_state", state);
  return redirect.toString();
}

function authPath(path, redirectTo) {
  if (!redirectTo) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}redirect_to=${encodeURIComponent(redirectTo)}`;
}

export class SupabaseAuthClient {
  constructor({
    projectUrl,
    publishableKey,
    sessionStore,
    fetchImpl = globalThis.fetch,
    clock = () => Date.now(),
    locationValue = globalThis.location,
    historyValue = globalThis.history,
    cryptoValue = globalThis.crypto,
    lockManager = globalThis.navigator?.locks,
    broadcastChannelFactory = typeof globalThis.window !== "undefined"
      ? globalThis.BroadcastChannel
      : null
  } = {}) {
    if (
      !sessionStore ||
      typeof sessionStore.getSyncState !== "function" ||
      typeof sessionStore.putSyncState !== "function" ||
      typeof sessionStore.updateSyncState !== "function"
    ) {
      throw new TypeError("O armazenamento relacional de sessão é obrigatório.");
    }
    this.http = new SupabaseHttpClient({ projectUrl, publishableKey, fetchImpl });
    this.sessionStore = sessionStore;
    this.clock = clock;
    this.locationValue = locationValue;
    this.historyValue = historyValue;
    this.cryptoValue = cryptoValue;
    this.lockManager = lockManager;
    this.session = null;
    this.recoveryMode = false;
    this.redirectError = "";
    this.listeners = new Set();
    this.refreshPromise = null;
    this.sessionGeneration = 0;
    this.sessionInvalidated = false;
    this.authChannel = null;
    if (typeof broadcastChannelFactory === "function") {
      try {
        this.authChannel = new broadcastChannelFactory(AUTH_BROADCAST_CHANNEL);
        this.authChannel.addEventListener("message", (event) => {
          if (event?.data?.event !== "SIGNED_OUT") return;
          void this.clearSession({ broadcast: false })
            .then(() => this.emit("SIGNED_OUT_REMOTE"))
            .catch((error) => console.error("Falha ao encerrar a sessão em outra aba.", error));
        });
      } catch {
        this.authChannel = null;
      }
    }
  }

  nowSeconds() {
    return Math.floor(this.clock() / 1000);
  }

  onAuthStateChange(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener de autenticação inválido.");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    this.listeners.forEach((listener) => listener(event, this.getSession()));
  }

  broadcast(event) {
    this.authChannel?.postMessage?.({ event, sentAt: this.clock() });
  }

  cleanCallbackUrl() {
    if (this.historyValue?.replaceState && this.locationValue?.pathname) {
      this.historyValue.replaceState(null, "", callbackFreePath(this.locationValue));
    }
  }

  async createPkceState(type) {
    const pair = await createPkcePair(this.cryptoValue);
    await this.sessionStore.putSyncState(AUTH_PKCE_STATE_KEY, {
      verifier: pair.verifier,
      state: pair.state,
      type,
      createdAt: new Date(this.clock()).toISOString()
    });
    return pair;
  }

  getSession() {
    return this.session ? structuredClone(this.session) : null;
  }

  async persistSession(session) {
    this.session = normalizeSession(session, this.nowSeconds());
    this.sessionGeneration += 1;
    this.http.setAccessToken(this.session?.access_token || null);
    await this.sessionStore.putSyncState(AUTH_SESSION_STATE_KEY, this.session);
    return this.getSession();
  }

  async initialize() {
    const callback = authParameters(this.locationValue);
    if (callback?.error || callback?.implicitToken) {
      this.redirectError = callback?.error ||
        "Este link usa um fluxo implícito inseguro. Solicite um novo link de confirmação ou recuperação.";
      this.cleanCallbackUrl();
    } else if (callback?.code) {
      const pkce = await this.sessionStore.getSyncState(AUTH_PKCE_STATE_KEY);
      const createdAt = Date.parse(pkce?.createdAt || "");
      const stateMatches = Boolean(
        callback.state && pkce?.state && callback.state === pkce.state
      );
      const stateIsFresh = Number.isFinite(createdAt) &&
        createdAt <= this.clock() + 60_000 &&
        this.clock() - createdAt <= AUTH_PKCE_MAX_AGE_MS;
      if (!pkce?.verifier || !stateMatches || !stateIsFresh) {
        this.redirectError = "O código de autenticação não pertence a este dispositivo ou expirou.";
        this.cleanCallbackUrl();
      } else {
        let payload = null;
        try {
          payload = await this.http.request("/auth/v1/token?grant_type=pkce", {
            method: "POST",
            body: { auth_code: callback.code, code_verifier: pkce.verifier },
            accessToken: null
          });
        } catch (error) {
          if (isNetworkFailure(error)) throw error;
          await this.sessionStore.putSyncState(AUTH_PKCE_STATE_KEY, null);
          this.redirectError = error instanceof Error ? error.message : String(error);
          this.cleanCallbackUrl();
        }
        if (payload) {
          await this.sessionStore.putSyncState(AUTH_PKCE_STATE_KEY, null);
          this.recoveryMode = pkce.type === "recovery";
          await this.persistSession(payload);
          this.cleanCallbackUrl();
          this.emit(this.recoveryMode ? "PASSWORD_RECOVERY" : "SIGNED_IN");
          return this.getSession();
        }
      }
    }

    this.session = await this.sessionStore.updateSyncState(
      AUTH_SESSION_STATE_KEY,
      (stored) => normalizeSession(stored?.value ?? stored, this.nowSeconds())
    );
    this.http.setAccessToken(this.session?.access_token || null);
    if (!this.session) return null;
    // Sessões gravadas por versões anteriores podem conter o objeto inteiro do usuário.
    // A primeira leitura as reduz atomicamente à mesma projeção mínima usada nas
    // novas gravações, sem regravar uma sessão renovada ou removida por outra aba.

    if (this.session.expires_at && this.session.expires_at <= this.nowSeconds() + 60) {
      if (!this.session.refresh_token) {
        this.sessionInvalidated = true;
        await this.clearSession();
        return null;
      }
      try {
        await this.refreshSession();
      } catch (error) {
        if (!isNetworkFailure(error)) {
          this.sessionInvalidated = true;
          await this.clearSession();
          return null;
        }
        this.emit("OFFLINE_SESSION");
      }
    }
    return this.getSession();
  }

  async clearSession({ broadcast = true } = {}) {
    this.session = null;
    this.sessionGeneration += 1;
    this.recoveryMode = false;
    this.http.setAccessToken(null);
    await this.sessionStore.putSyncState(AUTH_SESSION_STATE_KEY, null);
    if (broadcast) this.broadcast("SIGNED_OUT");
  }

  async signIn({ email, password }) {
    const payload = await this.http.request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: normalizeEmail(email), password: String(password || "") },
      accessToken: null
    });
    await this.persistSession(payload);
    this.emit("SIGNED_IN");
    return this.getSession();
  }

  async signUp({ email, password, redirectTo = buildAuthRedirectUrl() }) {
    const pkce = await this.createPkceState("signup");
    let payload;
    try {
      payload = await this.http.request(authPath(
        "/auth/v1/signup",
        redirectWithAuthState(redirectTo, pkce.state)
      ), {
        method: "POST",
        body: {
          email: normalizeEmail(email),
          password: String(password || ""),
          data: {},
          gotrue_meta_security: {},
          code_challenge: pkce.challenge,
          code_challenge_method: "s256"
        },
        accessToken: null
      });
    } catch (error) {
      await this.sessionStore.putSyncState(AUTH_PKCE_STATE_KEY, null);
      throw error;
    }
    const returnedSession = payload?.session ?? payload;
    if (returnedSession?.access_token) {
      await this.sessionStore.putSyncState(AUTH_PKCE_STATE_KEY, null);
      await this.persistSession(returnedSession);
      this.emit("SIGNED_IN");
    }
    return payload;
  }

  async resendConfirmation({ email, redirectTo = buildAuthRedirectUrl() }) {
    const pkce = await this.createPkceState("signup");
    try {
      return await this.http.request(authPath(
        "/auth/v1/resend",
        redirectWithAuthState(redirectTo, pkce.state)
      ), {
        method: "POST",
        body: {
          type: "signup",
          email: normalizeEmail(email),
          gotrue_meta_security: {},
          code_challenge: pkce.challenge,
          code_challenge_method: "s256"
        },
        accessToken: null
      });
    } catch (error) {
      await this.sessionStore.putSyncState(AUTH_PKCE_STATE_KEY, null);
      throw error;
    }
  }

  async requestPasswordReset({ email, redirectTo = buildAuthRedirectUrl() }) {
    const pkce = await this.createPkceState("recovery");
    try {
      return await this.http.request(authPath(
        "/auth/v1/recover",
        redirectWithAuthState(redirectTo, pkce.state)
      ), {
        method: "POST",
        body: {
          email: normalizeEmail(email),
          gotrue_meta_security: {},
          code_challenge: pkce.challenge,
          code_challenge_method: "s256"
        },
        accessToken: null
      });
    } catch (error) {
      await this.sessionStore.putSyncState(AUTH_PKCE_STATE_KEY, null);
      throw error;
    }
  }

  async updatePassword(password) {
    if (!this.session?.access_token) throw new Error("Sessão de recuperação ausente.");
    const user = await this.http.request("/auth/v1/user", {
      method: "PUT",
      body: { password: String(password || "") }
    });
    const updatedUser = user?.user ?? user;
    this.session.user = { id: text(updatedUser?.id) || this.session.user?.id || "" };
    this.recoveryMode = false;
    await this.persistSession(this.session);
    this.emit("PASSWORD_UPDATED");
    return this.getSession()?.user || null;
  }

  async refreshSession() {
    if (this.refreshPromise) return this.refreshPromise;
    if (!this.session?.refresh_token) throw new Error("Refresh token ausente.");
    const refreshToken = this.session.refresh_token;
    const accessToken = this.session.access_token;
    const refreshGeneration = this.sessionGeneration;
    const adoptNewerStoredSession = async () => {
      const stored = await this.sessionStore.getSyncState(AUTH_SESSION_STATE_KEY);
      const candidate = normalizeSession(stored?.value ?? stored, this.nowSeconds());
      if (!candidate?.access_token || (
        candidate.refresh_token === refreshToken && candidate.access_token === accessToken
      )) return null;
      this.session = candidate;
      this.sessionGeneration += 1;
      this.http.setAccessToken(candidate.access_token);
      this.emit("TOKEN_REFRESHED_REMOTE");
      return this.getSession();
    };
    const refresh = async () => {
      const sharedSession = await adoptNewerStoredSession();
      if (sharedSession) return sharedSession;
      let payload;
      try {
        payload = await this.http.request("/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          body: { refresh_token: refreshToken },
          accessToken: null
        });
      } catch (error) {
        const recoveredSession = await adoptNewerStoredSession();
        if (recoveredSession) return recoveredSession;
        throw error;
      }
      if (
        this.sessionGeneration !== refreshGeneration ||
        this.session?.refresh_token !== refreshToken
      ) {
        return null;
      }
      await this.persistSession(payload);
      this.emit("TOKEN_REFRESHED");
      return this.getSession();
    };
    const request = typeof this.lockManager?.request === "function"
      ? this.lockManager.request(AUTH_REFRESH_LOCK, refresh)
      : refresh();
    this.refreshPromise = Promise.resolve(request).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async getAccessToken() {
    if (!this.session) return null;
    if (this.session.expires_at && this.session.expires_at <= this.nowSeconds() + 60) {
      if (!this.session.refresh_token) {
        await this.clearSession();
        return null;
      }
      try {
        await this.refreshSession();
      } catch (error) {
        if (isNetworkFailure(error)) throw error;
        this.sessionInvalidated = true;
        await this.clearSession();
        this.emit("SESSION_INVALID");
        throw error;
      }
    }
    return this.session?.access_token || null;
  }

  async getOAuthAuthorizationDetails(rawAuthorizationId) {
    const accessToken = await this.getAccessToken();
    if (!accessToken) throw new Error("Entre na sua conta para revisar esta conexão.");
    const id = authorizationId(rawAuthorizationId);
    return this.http.request(
      `/auth/v1/oauth/authorizations/${encodeURIComponent(id)}`,
      { method: "GET", accessToken }
    );
  }

  async decideOAuthAuthorization(rawAuthorizationId, action) {
    const accessToken = await this.getAccessToken();
    if (!accessToken) throw new Error("Entre na sua conta para revisar esta conexão.");
    const id = authorizationId(rawAuthorizationId);
    if (!new Set(["approve", "deny"]).has(action)) {
      throw new Error("Decisão OAuth inválida.");
    }
    return this.http.request(
      `/auth/v1/oauth/authorizations/${encodeURIComponent(id)}/consent`,
      {
        method: "POST",
        accessToken,
        body: { action }
      }
    );
  }

  async signOut() {
    const accessToken = this.session?.access_token || null;
    if (accessToken) {
      try {
        await this.http.request("/auth/v1/logout", { method: "POST", accessToken });
      } catch {
        // A revogação remota pode falhar offline; o token local nunca deve sobreviver ao pedido de saída.
      }
    }
    await this.clearSession();
    this.emit("SIGNED_OUT");
  }
}
