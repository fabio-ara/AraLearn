import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_PKCE_STATE_KEY,
  SupabaseAuthClient
} from "../../src/supabase/SupabaseAuthClient.js";
import { SupabaseHttpClient } from "../../src/supabase/SupabaseHttpClient.js";
import {
  buildAuthRedirectUrl,
  readSupabaseRuntimeConfig
} from "../../src/supabase/runtimeConfig.js";

function response(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function createSessionStore() {
  const state = new Map();
  return {
    async getSyncState(key) {
      return state.get(key) ?? null;
    },
    async putSyncState(key, value) {
      state.set(key, structuredClone(value));
    },
    state
  };
}

function session(overrides = {}) {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    user: { id: "user-1", email: "pessoa@example.com" },
    ...overrides
  };
}

test("configuração pública aceita publishable key e rejeita service role", () => {
  const config = readSupabaseRuntimeConfig({
    supabaseUrl: "https://projeto.supabase.co/",
    supabasePublishableKey: "sb_publishable_exemplo"
  });
  assert.deepEqual(config, {
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "sb_publishable_exemplo",
    configured: true
  });

  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const serviceRoleJwt = `${encoded({ alg: "HS256" })}.${encoded({ role: "service_role" })}.assinatura`;
  assert.throws(
    () => readSupabaseRuntimeConfig({
      supabaseUrl: "https://projeto.supabase.co",
      supabasePublishableKey: serviceRoleJwt
    }),
    /service role/i
  );
  assert.throws(
    () => readSupabaseRuntimeConfig({
      supabaseUrl: "https://projeto.supabase.co",
      supabasePublishableKey: "sb_secret_nunca_no_runtime"
    }),
    /service role/i
  );
});

test("cliente HTTP encerra uma chamada remota que excede o prazo", async () => {
  const client = new SupabaseHttpClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })
  });

  await assert.rejects(
    () => client.request("/rest/v1/rpc/list_catalog_courses"),
    (error) => error.code === "request_timeout" && error.status === 0
  );
});

test("uma leitura extensa do Curso pode usar prazo explícito sem ampliar as chamadas comuns", async () => {
  const client = new SupabaseHttpClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response(200, { ok: true })), 20);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      }, { once: true });
    })
  });

  const result = await client.request(
    "/functions/v1/aralearn-course-api/v1/courses/11111111-1111-4111-8111-111111111111",
    { timeoutMs: 60 }
  );
  assert.deepEqual(result, { ok: true });
});

test("cliente HTTP preserva código e mensagem do envelope de erro da Edge Function", async () => {
  const client = new SupabaseHttpClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    fetchImpl: async () => response(422, {
      ok: false,
      error: {
        code: "course_revision_changed",
        message: "O Curso mudou durante a leitura.",
        details: { pointer: "/expectedRevision" }
      }
    })
  });

  await assert.rejects(
    () => client.request(
      "/functions/v1/aralearn-course-api/v1/courses/00000000-0000-4000-8000-000000000001"
    ),
    (error) => error.status === 422 &&
      error.code === "course_revision_changed" &&
      error.message === "O Curso mudou durante a leitura." &&
      error.details?.pointer === "/expectedRevision"
  );
});

test("login persiste a sessão e envia apenas a chave pública no cabeçalho", async () => {
  const requests = [];
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: createSessionStore(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response(200, session());
    },
    clock: () => 1_700_000_000_000
  });

  const result = await auth.signIn({ email: " Pessoa@Example.COM ", password: "segredo" });
  assert.equal(result.user.id, "user-1");
  assert.equal(requests[0].url, "https://projeto.supabase.co/auth/v1/token?grant_type=password");
  assert.equal(requests[0].options.headers.get("apikey"), "public-key");
  assert.equal(requests[0].options.headers.has("Authorization"), false);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    email: "pessoa@example.com",
    password: "segredo"
  });
});

test("cadastro, reenvio e recuperação passam redirect_to na URL do GoTrue", async () => {
  const requests = [];
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: createSessionStore(),
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return response(200, { user: { id: "pending" } });
    }
  });
  const redirectTo = "https://app.example.com/entrada";

  await auth.signUp({ email: "nova@example.com", password: "senha-segura", redirectTo });
  await auth.resendConfirmation({ email: "nova@example.com", redirectTo });
  await auth.requestPasswordReset({ email: "nova@example.com", redirectTo });

  assert.equal(requests.length, 3);
  requests.forEach(({ url }) => {
    const callback = new URL(new URL(url).searchParams.get("redirect_to"));
    assert.equal(`${callback.origin}${callback.pathname}`, redirectTo);
    assert.match(callback.searchParams.get("auth_state"), /^[A-Za-z0-9_-]{43}$/u);
  });
  assert.equal(new URL(requests[0].url).pathname, "/auth/v1/signup");
  assert.equal(new URL(requests[1].url).pathname, "/auth/v1/resend");
  assert.equal(new URL(requests[2].url).pathname, "/auth/v1/recover");
  assert.equal("options" in requests[0].body, false);
  assert.equal("redirect_to" in requests[2].body, false);
  assert.match(requests[0].body.code_challenge, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(requests[0].body.code_challenge_method, "s256");
  assert.match(requests[1].body.code_challenge, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(requests[1].body.code_challenge_method, "s256");
  assert.match(requests[2].body.code_challenge, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(requests[2].body.code_challenge_method, "s256");
  assert.equal((await auth.sessionStore.getSyncState(AUTH_PKCE_STATE_KEY)).type, "recovery");
});

test("sessão expirada é renovada uma única vez e permanece disponível offline", async () => {
  const store = createSessionStore();
  await store.putSyncState("auth.session", session({ expires_at: 100, expires_in: undefined }));
  let refreshes = 0;
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async (url) => {
      if (!url.includes("grant_type=refresh_token")) throw new Error(`Requisição inesperada: ${url}`);
      refreshes += 1;
      return response(200, session({ access_token: "renovado" }));
    },
    clock: () => 200_000
  });

  await auth.initialize();
  assert.equal(refreshes, 1);
  assert.equal(await auth.getAccessToken(), "renovado");

  const offlineStore = createSessionStore();
  await offlineStore.putSyncState("auth.session", session({ expires_at: 100, expires_in: undefined }));
  const offlineAuth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: offlineStore,
    fetchImpl: async () => { throw new TypeError("offline"); },
    clock: () => 200_000
  });
  const offlineSession = await offlineAuth.initialize();
  assert.equal(offlineSession.access_token, "access-token");

  const unavailableStore = createSessionStore();
  await unavailableStore.putSyncState("auth.session", session({ expires_at: 100, expires_in: undefined }));
  const unavailableAuth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: unavailableStore,
    fetchImpl: async () => response(503, { message: "indisponível" }),
    clock: () => 200_000
  });
  const unavailableSession = await unavailableAuth.initialize();
  assert.equal(unavailableSession.access_token, "access-token");
});

test("sessão expirada sem refresh token é descartada", async () => {
  const store = createSessionStore();
  await store.putSyncState("auth.session", session({
    refresh_token: "",
    expires_at: 100,
    expires_in: undefined
  }));
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async () => { throw new Error("não deveria consultar a rede"); },
    clock: () => 200_000
  });

  assert.equal(await auth.initialize(), null);
  assert.equal(await store.getSyncState("auth.session"), null);
});

test("saída limpa a sessão local mesmo se o servidor estiver indisponível", async () => {
  const store = createSessionStore();
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async (url) => {
      if (url.includes("grant_type=password")) return response(200, session());
      throw new TypeError("offline");
    }
  });
  await auth.signIn({ email: "pessoa@example.com", password: "segredo" });
  await auth.signOut();
  assert.equal(auth.getSession(), null);
  assert.equal(await store.getSyncState("auth.session"), null);
});

test("callback implícito com bearer no fragmento é rejeitado sem consultar a rede", async () => {
  const store = createSessionStore();
  let requests = 0;
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async () => { requests += 1; throw new Error("não deveria consultar a rede"); },
    locationValue: {
      hash: "#access_token=forjado&refresh_token=forjado&type=recovery&expires_in=3600",
      pathname: "/app/",
      search: ""
    },
    historyValue: { replaceState() {} }
  });

  assert.equal(await auth.initialize(), null);
  assert.match(auth.redirectError, /fluxo implícito inseguro/u);
  assert.equal(requests, 0);
  assert.equal(auth.getSession(), null);
  assert.equal(await store.getSyncState("auth.session"), null);
});

test("callback PKCE troca código com o verifier local e nunca recebe token no deep link", async () => {
  const store = createSessionStore();
  await store.putSyncState(AUTH_PKCE_STATE_KEY, {
    verifier: "verifier-local-secreto",
    state: "estado-local-secreto",
    createdAt: "2023-11-14T22:13:20.000Z",
    type: "recovery"
  });
  const requests = [];
  const historyCalls = [];
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return response(200, session());
    },
    locationValue: {
      hash: "",
      pathname: "/app/",
      search: "?code=codigo-curto&auth_state=estado-local-secreto&origem=email&authorization_id=authorization-123"
    },
    historyValue: {
      replaceState(...args) { historyCalls.push(args); }
    },
    clock: () => 1_700_000_000_000
  });

  const restored = await auth.initialize();
  assert.equal(restored.user.id, "user-1");
  assert.equal(auth.recoveryMode, true);
  assert.equal(requests[0].url, "https://projeto.supabase.co/auth/v1/token?grant_type=pkce");
  assert.deepEqual(requests[0].body, {
    auth_code: "codigo-curto",
    code_verifier: "verifier-local-secreto"
  });
  assert.deepEqual(
    historyCalls[0],
    [null, "", "/app/?origem=email&authorization_id=authorization-123"]
  );
  assert.equal(await store.getSyncState(AUTH_PKCE_STATE_KEY), null);
});

test("reenvio autônomo cria verifier compatível com a troca PKCE posterior", async () => {
  const store = createSessionStore();
  let exchangeBody = null;
  const sender = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async () => response(200, {})
  });
  await sender.resendConfirmation({
    email: "nova@example.com",
    redirectTo: "https://app.example.com/entrada"
  });
  const generatedState = await store.getSyncState(AUTH_PKCE_STATE_KEY);
  assert.equal(generatedState.type, "signup");

  const receiver = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async (_url, options) => {
      exchangeBody = JSON.parse(options.body);
      return response(200, session());
    },
    locationValue: {
      hash: "",
      pathname: "/app/",
      search: `?code=codigo-do-reenvio&auth_state=${generatedState.state}`
    },
    historyValue: { replaceState() {} }
  });
  assert.equal((await receiver.initialize()).user.id, "user-1");
  assert.equal(exchangeBody.code_verifier, generatedState.verifier);
});

test("callback PKCE rejeita state divergente ou expirado sem trocar o código", async () => {
  for (const pkce of [
    {
      verifier: "verifier-local",
      state: "estado-correto",
      createdAt: "2023-11-14T22:13:20.000Z",
      callbackState: "estado-forjado",
      now: 1_700_000_000_000
    },
    {
      verifier: "verifier-local",
      state: "estado-correto",
      createdAt: "2023-11-14T21:13:20.000Z",
      callbackState: "estado-correto",
      now: 1_700_000_000_000
    }
  ]) {
    const store = createSessionStore();
    await store.putSyncState(AUTH_PKCE_STATE_KEY, {
      verifier: pkce.verifier,
      state: pkce.state,
      createdAt: pkce.createdAt,
      type: "signup"
    });
    let requests = 0;
    const auth = new SupabaseAuthClient({
      projectUrl: "https://projeto.supabase.co",
      publishableKey: "public-key",
      sessionStore: store,
      fetchImpl: async () => { requests += 1; return response(200, session()); },
      locationValue: {
        hash: "",
        pathname: "/app/",
        search: `?code=codigo&auth_state=${pkce.callbackState}`
      },
      historyValue: { replaceState() {} },
      clock: () => pkce.now
    });

    assert.equal(await auth.initialize(), null);
    assert.equal(requests, 0);
    assert.match(auth.redirectError, /não pertence a este dispositivo ou expirou/u);
  }
});

test("callback Android aceita apenas o esquema exato atual ou App Link HTTPS", () => {
  assert.equal(
    buildAuthRedirectUrl(null, { androidHost: {}, androidRedirectUrl: "aralearn://auth/callback" }),
    "aralearn://auth/callback"
  );
  assert.equal(
    buildAuthRedirectUrl(null, {
      androidHost: {},
      androidRedirectUrl: "https://app.aralearn.example/auth/callback"
    }),
    "https://app.aralearn.example/auth/callback"
  );
  assert.throws(
    () => buildAuthRedirectUrl(null, {
      androidHost: {},
      androidRedirectUrl: "aralearn://outro/callback"
    }),
    /callback Android/u
  );
});

test("callback web preserva somente a solicitação de autorização OAuth", () => {
  assert.equal(
    buildAuthRedirectUrl({
      origin: "https://fabio-ara.github.io",
      pathname: "/AraLearn/",
      search: "?authorization_id=authorization-123&code=descartar&outro=descartar"
    }, { androidHost: null }),
    "https://fabio-ara.github.io/AraLearn/?authorization_id=authorization-123"
  );
});

test("consentimento OAuth usa a sessão renovável e os endpoints oficiais do Auth", async () => {
  const requests = [];
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: createSessionStore(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (options.method === "GET") {
        return response(200, {
          authorization_id: "authorization-123",
          client: { id: "client-1", name: "ChatGPT" },
          user: { id: "user-1", email: "pessoa@example.com" },
          scope: "openid email"
        });
      }
      return response(200, {
        redirect_url: "https://chatgpt.com/oauth/callback?code=resultado"
      });
    },
    clock: () => 1_700_000_000_000
  });
  await auth.persistSession(session());

  const details = await auth.getOAuthAuthorizationDetails("authorization-123");
  const decision = await auth.decideOAuthAuthorization("authorization-123", "approve");

  assert.equal(details.client.name, "ChatGPT");
  assert.equal(decision.redirect_url, "https://chatgpt.com/oauth/callback?code=resultado");
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].url,
    "https://projeto.supabase.co/auth/v1/oauth/authorizations/authorization-123"
  );
  assert.equal(
    requests[1].url,
    "https://projeto.supabase.co/auth/v1/oauth/authorizations/authorization-123/consent"
  );
  assert.equal(requests[0].options.headers.get("Authorization"), "Bearer access-token");
  assert.equal(requests[0].options.headers.get("apikey"), "public-key");
  assert.deepEqual(JSON.parse(requests[1].options.body), { action: "approve" });
  await assert.rejects(
    () => auth.decideOAuthAuthorization("authorization-123", "talvez"),
    /Decisão OAuth inválida/u
  );
  await assert.rejects(
    () => auth.getOAuthAuthorizationDetails("../invalido"),
    /Identificador de autorização OAuth inválido/u
  );
});

test("callback sem verifier não encerra uma sessão válida nem propaga logout", async () => {
  const store = createSessionStore();
  await store.putSyncState("auth.session", session());
  let requests = 0;
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async () => { requests += 1; throw new Error("não deveria consultar a rede"); },
    locationValue: { hash: "", pathname: "/app/", search: "?code=forjado" },
    historyValue: { replaceState() {} }
  });

  const restored = await auth.initialize();
  assert.equal(restored.user.id, "user-1");
  assert.match(auth.redirectError, /não pertence a este dispositivo/u);
  assert.equal(requests, 0);
  assert.equal((await store.getSyncState("auth.session")).access_token, "access-token");
});

test("erro de confirmação no callback é removido da URL e exposto à porta de autenticação", async () => {
  const store = createSessionStore();
  const historyCalls = [];
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async () => { throw new Error("não deveria consultar a rede"); },
    locationValue: {
      hash: "#error=access_denied&error_code=otp_expired&error_description=Link+expirado",
      pathname: "/app/",
      search: "?origem=email"
    },
    historyValue: {
      replaceState(...args) { historyCalls.push(args); }
    }
  });

  assert.equal(await auth.initialize(), null);
  assert.equal(auth.redirectError, "Link expirado");
  assert.deepEqual(historyCalls[0], [null, "", "/app/?origem=email"]);
});

test("renovação em voo não ressuscita a sessão depois de sair", async () => {
  const store = createSessionStore();
  let releaseRefresh;
  const refreshResponse = new Promise((resolve) => { releaseRefresh = resolve; });
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async (url) => {
      if (url.includes("grant_type=password")) return response(200, session());
      if (url.includes("grant_type=refresh_token")) return refreshResponse;
      if (url.endsWith("/auth/v1/logout")) return response(204, null);
      throw new Error(`Requisição inesperada: ${url}`);
    }
  });
  await auth.signIn({ email: "pessoa@example.com", password: "segredo" });
  const refreshing = auth.refreshSession();
  await Promise.resolve();
  await auth.signOut();
  releaseRefresh(response(200, session({ access_token: "não-deve-voltar" })));

  assert.equal(await refreshing, null);
  assert.equal(auth.getSession(), null);
  assert.equal(await store.getSyncState("auth.session"), null);
});

test("refresh token recusado encerra e remove a sessão persistida", async () => {
  const store = createSessionStore();
  await store.putSyncState("auth.session", session({ expires_at: 100, expires_in: undefined }));
  const auth = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl: async () => response(400, { code: "invalid_grant", message: "refresh token inválido" }),
    clock: () => 200_000
  });

  assert.equal(await auth.initialize(), null);
  assert.equal(auth.sessionInvalidated, true);
  assert.equal(auth.getSession(), null);
  assert.equal(await store.getSyncState("auth.session"), null);
});

test("abas concorrentes adotam a sessão rotacionada sem apagar a réplica", async () => {
  const store = createSessionStore();
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    if (requests === 1) {
      return response(200, session({
        access_token: "access-token-rotacionado",
        refresh_token: "refresh-token-rotacionado"
      }));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return response(400, { code: "refresh_token_already_used", message: "token já rotacionado" });
  };
  const first = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl,
    lockManager: null
  });
  const second = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: store,
    fetchImpl,
    lockManager: null
  });
  const secondEvents = [];
  second.onAuthStateChange((event) => secondEvents.push(event));
  await first.persistSession(session());
  await second.persistSession(session());

  const [firstSession, secondSession] = await Promise.all([
    first.refreshSession(),
    second.refreshSession()
  ]);

  assert.equal(requests, 2);
  assert.equal(firstSession.access_token, "access-token-rotacionado");
  assert.equal(secondSession.access_token, "access-token-rotacionado");
  assert.equal(second.getSession().refresh_token, "refresh-token-rotacionado");
  assert.deepEqual(secondEvents, ["TOKEN_REFRESHED_REMOTE"]);
});

test("saída é propagada para as demais abas sem compartilhar bearer", async () => {
  const channels = new Map();
  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.listeners = new Set();
      if (!channels.has(name)) channels.set(name, new Set());
      channels.get(name).add(this);
    }
    addEventListener(type, listener) {
      if (type === "message") this.listeners.add(listener);
    }
    postMessage(data) {
      channels.get(this.name).forEach((channel) => {
        if (channel === this) return;
        queueMicrotask(() => channel.listeners.forEach((listener) => listener({ data })));
      });
    }
  }
  const firstStore = createSessionStore();
  const secondStore = createSessionStore();
  const fetchImpl = async (url) => url.endsWith("/auth/v1/logout")
    ? response(204, null)
    : response(200, session());
  const first = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: firstStore,
    fetchImpl,
    broadcastChannelFactory: FakeBroadcastChannel
  });
  const second = new SupabaseAuthClient({
    projectUrl: "https://projeto.supabase.co",
    publishableKey: "public-key",
    sessionStore: secondStore,
    fetchImpl,
    broadcastChannelFactory: FakeBroadcastChannel
  });
  let remoteEvent = "";
  second.onAuthStateChange((event) => { remoteEvent = event; });
  await first.signIn({ email: "pessoa@example.com", password: "segredo" });
  await second.signIn({ email: "pessoa@example.com", password: "segredo" });

  await first.signOut();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(second.getSession(), null);
  assert.equal(await secondStore.getSyncState("auth.session"), null);
  assert.equal(remoteEvent, "SIGNED_OUT_REMOTE");
  assert.deepEqual([...channels.values()][0].size, 2);
});
