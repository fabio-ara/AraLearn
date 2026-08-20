import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isLocalSupabaseUrl,
  resolveSupabaseServerEnvironment,
  supabaseServerHeaders
} from "../supabase/functions/_shared/aralearn-authoring/supabaseEnvironment.js";

const LOCAL_APP_ORIGIN = "http://127.0.0.1:4182";
const CLIENT_REDIRECT_URI = "https://mcp-smoke.aralearn.invalid/callback";

function localEnvironmentFromStatus(environment = process.env) {
  if (
    environment.SUPABASE_URL
    || environment.ARALEARN_SUPABASE_URL
  ) return environment;

  let status;
  try {
    const useWindowsCommandShell = process.platform === "win32";
    status = JSON.parse(execFileSync(
      useWindowsCommandShell ? (process.env.ComSpec || "cmd.exe") : "npx",
      useWindowsCommandShell
        ? ["/d", "/s", "/c", "npx --yes supabase@2.109.1 status --output json"]
        : ["--yes", "supabase@2.109.1", "status", "--output", "json"],
      { cwd: path.resolve(fileURLToPath(import.meta.url), "..", ".."), encoding: "utf8" }
    ));
  } catch (error) {
    throw new Error(
      "Não foi possível obter as credenciais da stack Supabase local. "
      + "Inicie-a com 'npx --yes supabase@2.109.1 start' ou defina SUPABASE_URL, "
      + "SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY.",
      { cause: error }
    );
  }

  return {
    ...environment,
    SUPABASE_URL: status.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: status.ANON_KEY
  };
}

function normalizedEnvironment(environment) {
  return {
    ...environment,
    SUPABASE_URL:
      environment.SUPABASE_URL
      || environment.ARALEARN_SUPABASE_URL
      || environment.API_URL,
    SUPABASE_SERVICE_ROLE_KEY:
      environment.SUPABASE_SERVICE_ROLE_KEY
      || environment.SERVICE_ROLE_KEY,
    SUPABASE_PUBLISHABLE_KEY:
      environment.SUPABASE_PUBLISHABLE_KEY
      || environment.SUPABASE_ANON_KEY
      || environment.ANON_KEY
  };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function jwtClaims(token) {
  const segments = String(token || "").split(".");
  assert.equal(segments.length, 3, "O OAuth Server não emitiu um access token JWT.");
  try {
    return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    assert.fail("O access token OAuth não contém claims JSON válidos.");
  }
}

function audienceIncludes(audience, expected) {
  return (Array.isArray(audience) ? audience : [audience])
    .some((value) => String(value || "").trim() === expected);
}

async function responsePayload(response) {
  const source = await response.text();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

function safeFailure(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(
    payload.error_description
    || payload.msg
    || payload.message
    || payload.error_code
    || payload.code
    || (typeof payload.error === "string" ? payload.error : "")
    || ""
  ).trim().slice(0, 500);
}

async function requestJson(fetchImpl, url, init, label, {
  acceptedStatuses = null
} = {}) {
  const response = await fetchImpl(url, init);
  const payload = await responsePayload(response);
  const accepted = acceptedStatuses
    ? acceptedStatuses.includes(response.status)
    : response.ok;
  assert(
    accepted,
    `${label}: HTTP ${response.status}${safeFailure(payload) ? ` — ${safeFailure(payload)}` : ""}.`
  );
  return { response, payload };
}

function oauthUserHeaders(publishableKey, accessToken, {
  contentType = false,
  origin = LOCAL_APP_ORIGIN
} = {}) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Origin: origin,
    Referer: `${origin}/`,
    ...(contentType ? { "Content-Type": "application/json" } : {})
  };
}

function oauthConfiguration(environment, { allowHosted = false } = {}) {
  const normalized = normalizedEnvironment(environment);
  const configuration = resolveSupabaseServerEnvironment(normalized);
  if (allowHosted) {
    assert(
      !isLocalSupabaseUrl(configuration.supabaseUrl)
      && /^https:\/\/[^/]+$/u.test(configuration.supabaseUrl),
      "A provisão hospedada exige uma Project URL HTTPS não local."
    );
  } else {
    assert(
      isLocalSupabaseUrl(configuration.supabaseUrl),
      "A provisão OAuth destrutiva só pode usar a stack Supabase local."
    );
  }
  const projectUrl = configuration.supabaseUrl.replace(/\/+$/u, "");
  return {
    ...configuration,
    projectUrl,
    resourceUrl: `${projectUrl}/functions/v1/aralearn-authoring-mcp`
  };
}

export async function provisionLocalMcpOAuthToken({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  createId = randomUUID,
  createBytes = randomBytes,
  nowSeconds = () => Math.floor(Date.now() / 1000),
  lifecycle = {},
  allowHosted = false,
  consentOrigin = LOCAL_APP_ORIGIN,
  consentPath = "/"
} = {}) {
  assert.equal(typeof fetchImpl, "function", "fetch indisponível para a provisão OAuth.");
  const configuration = oauthConfiguration(environment, { allowHosted });
  Object.assign(lifecycle, configuration, {
    clientId: null,
    oauthGrantCreated: false,
    userAccessToken: null,
    userId: null
  });

  const discoveryUrl =
    `${configuration.projectUrl}/auth/v1/.well-known/oauth-authorization-server`;
  const { payload: discovery } = await requestJson(
    fetchImpl,
    discoveryUrl,
    { headers: { Accept: "application/json" }, redirect: "manual" },
    "Discovery do OAuth Server"
  );
  const expectedRegistrationUrl =
    `${configuration.projectUrl}/auth/v1/oauth/clients/register`;
  assert.equal(
    discovery?.issuer,
    `${configuration.projectUrl}/auth/v1`,
    "O OAuth Server local anunciou um issuer inesperado."
  );
  assert.equal(
    discovery?.registration_endpoint,
    expectedRegistrationUrl,
    "O OAuth Server local não anunciou o DCR esperado."
  );
  assert.equal(
    discovery?.authorization_endpoint,
    `${configuration.projectUrl}/auth/v1/oauth/authorize`,
    "O OAuth Server local anunciou um authorization endpoint inesperado."
  );
  assert.equal(
    discovery?.token_endpoint,
    `${configuration.projectUrl}/auth/v1/oauth/token`,
    "O OAuth Server local anunciou um token endpoint inesperado."
  );
  assert(
    discovery?.code_challenge_methods_supported?.includes("S256"),
    "O OAuth Server local não anunciou PKCE S256."
  );
  assert(
    discovery?.scopes_supported?.includes("openid"),
    "O OAuth Server local não anunciou o escopo openid."
  );

  const runId = createId().replaceAll("-", "");
  const password = `Arl!Mcp-${createId().replaceAll("-", "")}9a`;
  const email = `mcp-oauth-smoke-${runId}@aralearn.local`;
  const { payload: createdUser } = await requestJson(
    fetchImpl,
    `${configuration.projectUrl}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: supabaseServerHeaders(configuration.serverApiKey),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { test: "authoring-mcp-local-oauth-smoke" }
      })
    },
    "Criação do usuário OAuth local"
  );
  assert.match(String(createdUser?.id || ""), /^[0-9a-f-]{36}$/iu);
  lifecycle.userId = createdUser.id;

  const { payload: session } = await requestJson(
    fetchImpl,
    `${configuration.projectUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: configuration.publishableKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    },
    "Login do usuário OAuth local"
  );
  assert.equal(session?.user?.id, lifecycle.userId);
  assert.match(
    String(session?.access_token || ""),
    /^[^.]+\.[^.]+\.[^.]+$/u,
    "O login local não devolveu uma sessão JWT."
  );
  lifecycle.userAccessToken = session.access_token;

  const { payload: registeredClient } = await requestJson(
    fetchImpl,
    discovery.registration_endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "AraLearn MCP local smoke",
        client_type: "public",
        redirect_uris: [CLIENT_REDIRECT_URI],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"]
      })
    },
    "Registro dinâmico do cliente MCP",
    { acceptedStatuses: [201] }
  );
  assert.match(String(registeredClient?.client_id || ""), /^[0-9a-f-]{36}$/iu);
  lifecycle.clientId = registeredClient.client_id;
  assert.equal(registeredClient.token_endpoint_auth_method, "none");

  const verifier = base64Url(createBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = base64Url(createBytes(32));
  const authorizationUrl = new URL(discovery.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: lifecycle.clientId,
    redirect_uri: CLIENT_REDIRECT_URI,
    scope: "openid",
    state,
    resource: configuration.resourceUrl,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  const authorizationResponse = await fetchImpl(authorizationUrl, {
    headers: { Accept: "text/html" },
    redirect: "manual"
  });
  assert(
    new Set([302, 303]).has(authorizationResponse.status),
    `Início da autorização OAuth: HTTP ${authorizationResponse.status}.`
  );
  const consentLocation = authorizationResponse.headers.get("location");
  assert(consentLocation, "O OAuth Server não redirecionou para o consentimento.");
  const consentUrl = new URL(consentLocation, configuration.projectUrl);
  assert.equal(
    consentUrl.origin,
    consentOrigin,
    "O consentimento OAuth não aponta para a origem configurada."
  );
  if (consentPath) {
    assert.equal(
      consentUrl.pathname,
      consentPath,
      "O consentimento OAuth não aponta para o caminho configurado."
    );
  }
  const authorizationId = consentUrl.searchParams.get("authorization_id");
  assert.match(
    String(authorizationId || ""),
    /^[A-Za-z0-9._~-]{8,512}$/u,
    "O redirecionamento não contém authorization_id válido."
  );

  const authorizationPath =
    `/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`;
  const { payload: details } = await requestJson(
    fetchImpl,
    `${configuration.projectUrl}${authorizationPath}`,
    {
      headers: oauthUserHeaders(
        configuration.publishableKey,
        session.access_token,
        { origin: consentOrigin }
      )
    },
    "Leitura do consentimento OAuth"
  );
  assert.equal(details?.authorization_id, authorizationId);
  assert.equal(details?.client?.id, lifecycle.clientId);
  assert.equal(details?.user?.id, lifecycle.userId);
  assert.match(String(details?.scope || ""), /(?:^|\s)openid(?:\s|$)/u);

  const { payload: consent } = await requestJson(
    fetchImpl,
    `${configuration.projectUrl}${authorizationPath}/consent`,
    {
      method: "POST",
      headers: oauthUserHeaders(
        configuration.publishableKey,
        session.access_token,
        { contentType: true, origin: consentOrigin }
      ),
      body: JSON.stringify({ action: "approve" })
    },
    "Aprovação do consentimento OAuth"
  );
  const callback = new URL(String(consent?.redirect_url || ""));
  assert.equal(callback.origin + callback.pathname, CLIENT_REDIRECT_URI);
  assert.equal(callback.searchParams.get("state"), state);
  const code = callback.searchParams.get("code");
  assert(code, "O consentimento não emitiu o código de autorização.");

  const { payload: grant } = await requestJson(
    fetchImpl,
    discovery.token_endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: lifecycle.clientId,
        redirect_uri: CLIENT_REDIRECT_URI,
        code_verifier: verifier,
        resource: configuration.resourceUrl
      })
    },
    "Troca do código OAuth por token"
  );
  lifecycle.oauthGrantCreated = true;
  const accessToken = String(grant?.access_token || "");
  const claims = jwtClaims(accessToken);
  assert.equal(claims.iss, `${configuration.projectUrl}/auth/v1`);
  assert.equal(claims.sub, lifecycle.userId);
  assert.equal(claims.client_id, lifecycle.clientId);
  assert(
    audienceIncludes(claims.aud, configuration.resourceUrl),
    "O hook não destinou o access token ao endpoint MCP."
  );
  assert(Number.isFinite(claims.iat) && claims.iat <= nowSeconds() + 30);
  assert(Number.isFinite(claims.exp) && claims.exp > nowSeconds());
  assert.notEqual(
    accessToken,
    configuration.serverApiKey,
    "A credencial administrativa não pode ser reutilizada como bearer do MCP."
  );
  return { ...lifecycle, accessToken };
}

export async function provisionHostedMcpOAuthToken(options = {}) {
  return provisionLocalMcpOAuthToken({
    ...options,
    allowHosted: true,
    consentOrigin: "https://fabio-ara.github.io",
    consentPath: null
  });
}

export async function cleanupLocalMcpOAuthProvision({
  provision,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!provision?.projectUrl || !provision?.serverApiKey) return;
  const failures = [];
  const remove = async (
    label,
    url,
    acceptedStatuses,
    headers = supabaseServerHeaders(
      provision.serverApiKey,
      { contentType: false }
    )
  ) => {
    try {
      await requestJson(
        fetchImpl,
        url,
        {
          method: "DELETE",
          headers
        },
        label,
        { acceptedStatuses }
      );
    } catch (error) {
      failures.push(error);
    }
  };
  if (
    provision.clientId
    && provision.oauthGrantCreated
    && provision.userAccessToken
    && provision.publishableKey
  ) {
    await remove(
      "Revogação da concessão OAuth local",
      `${provision.projectUrl}/auth/v1/user/oauth/grants?client_id=${
        encodeURIComponent(provision.clientId)
      }`,
      [200, 204],
      oauthUserHeaders(
        provision.publishableKey,
        provision.userAccessToken
      )
    );
  }
  if (provision.clientId) {
    await remove(
      "Remoção do cliente OAuth local",
      `${provision.projectUrl}/auth/v1/admin/oauth/clients/${
        encodeURIComponent(provision.clientId)
      }`,
      [200, 204, 404]
    );
  }
  if (provision.userId) {
    await remove(
      "Remoção do usuário OAuth local",
      `${provision.projectUrl}/auth/v1/admin/users/${
        encodeURIComponent(provision.userId)
      }`,
      [200, 204, 404]
    );
  }
  if (failures.length) {
    throw new AggregateError(
      failures,
      "A limpeza das identidades temporárias do smoke MCP falhou."
    );
  }
}

async function executeAuthenticatedSmoke(accessToken, {
  projectUrl = "",
  publishableKey = ""
} = {}) {
  const previousToken =
    process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN;
  const previousRequirement =
    process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH;
  const previousProjectUrl = process.env.SUPABASE_URL;
  const previousPublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN = accessToken;
  process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH = "1";
  if (projectUrl) process.env.SUPABASE_URL = projectUrl;
  if (publishableKey) process.env.SUPABASE_PUBLISHABLE_KEY = publishableKey;
  try {
    const smokeUrl = new URL(
      "../supabase/tests/authoring-mcp-local-smoke.mjs",
      import.meta.url
    );
    smokeUrl.searchParams.set("run", randomUUID());
    await import(smokeUrl.href);
  } finally {
    if (previousToken === undefined) {
      delete process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN;
    } else {
      process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN = previousToken;
    }
    if (previousRequirement === undefined) {
      delete process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH;
    } else {
      process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH =
        previousRequirement;
    }
    if (previousProjectUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = previousProjectUrl;
    }
    if (previousPublishableKey === undefined) {
      delete process.env.SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.SUPABASE_PUBLISHABLE_KEY = previousPublishableKey;
    }
  }
}

export async function runLocalMcpOAuthSmoke({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  executeSmoke = executeAuthenticatedSmoke,
  createId = randomUUID,
  createBytes = randomBytes,
  nowSeconds
} = {}) {
  const lifecycle = {};
  let primaryFailure = null;
  try {
    const provision = await provisionLocalMcpOAuthToken({
      environment,
      fetchImpl,
      createId,
      createBytes,
      ...(nowSeconds ? { nowSeconds } : {}),
      lifecycle
    });
    await executeSmoke(provision.accessToken, {
      projectUrl: provision.projectUrl,
      publishableKey: provision.publishableKey
    });
  } catch (error) {
    primaryFailure = error;
  }

  let cleanupFailure = null;
  try {
    await cleanupLocalMcpOAuthProvision({
      provision: lifecycle,
      fetchImpl
    });
  } catch (error) {
    cleanupFailure = error;
  }
  if (primaryFailure && cleanupFailure) {
    throw new AggregateError(
      [primaryFailure, cleanupFailure],
      "O smoke MCP e sua limpeza falharam."
    );
  }
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailure) throw cleanupFailure;
}

const entryPoint = process.argv[1]
  ? path.resolve(process.argv[1])
  : "";
if (entryPoint === fileURLToPath(import.meta.url)) {
  await runLocalMcpOAuthSmoke({ environment: localEnvironmentFromStatus() });
}
