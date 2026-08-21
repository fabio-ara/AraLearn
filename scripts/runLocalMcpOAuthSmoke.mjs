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
const MCP_OAUTH_SCOPE = "offline_access";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
        ? ["/d", "/s", "/c", "npx --yes supabase@2.115.0 status --output json"]
        : ["--yes", "supabase@2.115.0", "status", "--output", "json"],
      { cwd: path.resolve(fileURLToPath(import.meta.url), "..", ".."), encoding: "utf8" }
    ));
  } catch (error) {
    throw new Error(
      "Não foi possível obter as credenciais da stack Supabase local. "
      + "Inicie-a com 'npx --yes supabase@2.115.0 start' ou defina SUPABASE_URL, "
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

function assertMcpAccessTokenClaims(accessToken, {
  clientId,
  projectUrl,
  resourceUrl,
  userId,
  nowSeconds,
  label = "Access token OAuth"
}) {
  const claims = jwtClaims(accessToken);
  const expectedIssuer = `${projectUrl}/auth/v1`;
  assert.equal(claims.iss, expectedIssuer, `${label}: issuer inesperado.`);
  assert(
    audienceIncludes(claims.aud, resourceUrl),
    `${label}: audience não aponta para o MCP.`
  );
  assert.equal(claims.client_id, clientId, `${label}: client_id inesperado.`);
  assert.equal(claims.scope, MCP_OAUTH_SCOPE, `${label}: scope inesperado.`);
  assert.equal(claims.role, "authenticated", `${label}: role inesperado.`);
  assert.equal(claims.is_anonymous, false, `${label}: token anônimo.`);
  assert(Number.isFinite(claims.iat) && claims.iat <= nowSeconds() + 30);
  assert(Number.isFinite(claims.exp) && claims.exp > nowSeconds());

  const pairwiseSubject = String(claims.sub || "");
  const pairwiseSession = String(claims.session_id || "");
  const sourceSession = String(claims.aralearn_session_id || "");
  for (const [name, value] of [
    ["sub", pairwiseSubject],
    ["session_id", pairwiseSession],
    ["aralearn_session_id", sourceSession]
  ]) {
    assert.match(value, UUID_PATTERN, `${label}: ${name} não é UUID.`);
    assert.notEqual(value, userId, `${label}: ${name} expôs a identidade real.`);
    assert.notEqual(value, clientId, `${label}: ${name} reutilizou client_id.`);
  }
  assert.notEqual(pairwiseSubject, pairwiseSession, `${label}: aliases colidiram.`);
  assert.notEqual(pairwiseSubject, sourceSession, `${label}: sub expôs a sessão-fonte.`);
  assert.notEqual(pairwiseSession, sourceSession, `${label}: session_id expôs a sessão-fonte.`);
  assert.equal(claims.email, "", `${label}: email não foi removido.`);
  assert.equal(claims.phone, "", `${label}: telefone não foi removido.`);
  for (const key of [
    "app_metadata",
    "user_metadata",
    "identities",
    "aralearn_actor_id"
  ]) {
    assert.equal(Object.hasOwn(claims, key), false, `${label}: claim ${key} indevida.`);
  }
  const allowedClaims = new Set([
    "aal",
    "aralearn_session_id",
    "aud",
    "client_id",
    "email",
    "exp",
    "iat",
    "is_anonymous",
    "iss",
    "nbf",
    "phone",
    "role",
    "scope",
    "session_id",
    "sub"
  ]);
  assert.deepEqual(
    Object.keys(claims).filter((key) => !allowedClaims.has(key)),
    [],
    `${label}: claims adicionais não minimizadas.`
  );
  assert.equal(JSON.stringify(claims).includes(userId), false);
  return claims;
}

function storageObjectPath(value) {
  return String(value || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function rejectedOAuthBoundary(fetchImpl, url, init, label, {
  forbiddenValues = [],
  allowStorageEnvelope = false,
  allowEmptyNoop = false
} = {}) {
  const response = await fetchImpl(url, init);
  const payload = await responsePayload(response);
  const payloadStatus = Number(payload?.statusCode);
  const storageDenied =
    allowStorageEnvelope
    && response.status === 400
    && new Set([401, 403]).has(payloadStatus)
    && String(payload?.code || "") === "AccessDenied";
  const emptyNoop = allowEmptyNoop
    && response.status === 200
    && (
      (Array.isArray(payload) && payload.length === 0)
      || (payload && typeof payload === "object" && Object.keys(payload).length === 0)
    );
  assert(
    new Set([401, 403]).has(response.status) || storageDenied || emptyNoop,
    `${label}: esperada recusa 401/403, recebido HTTP ${response.status}${
      safeFailure(payload) ? ` — ${safeFailure(payload)}` : ""
    }.`
  );
  const serialized = JSON.stringify(payload);
  for (const value of forbiddenValues) {
    if (!String(value || "")) continue;
    assert.equal(
      serialized.includes(String(value)),
      false,
      `${label}: a resposta de recusa expôs dados protegidos.`
    );
  }
  return { response, payload };
}

async function verifyMcpOAuthGoTrueIsolation({
  provision,
  accessToken,
  fetchImpl,
  label = "bearer OAuth do MCP"
}) {
  const oauthHeaders = oauthUserHeaders(provision.publishableKey, accessToken);
  const applicationHeaders = oauthUserHeaders(
    provision.publishableKey,
    provision.userAccessToken
  );
  const applicationUser = async (requestLabel) => {
    const { payload } = await requestJson(
      fetchImpl,
      `${provision.projectUrl}/auth/v1/user`,
      { headers: applicationHeaders },
      requestLabel
    );
    assert.equal(payload?.id, provision.userId, `${requestLabel}: identidade inesperada.`);
    return payload;
  };
  await applicationUser(`Sessão normal antes da prova de ${label}`);
  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/user`,
    { headers: oauthHeaders },
    `Auth GET /user com ${label}`,
    { forbiddenValues: [provision.userId] }
  );
  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/oauth/userinfo`,
    { headers: oauthHeaders },
    `Auth GET /oauth/userinfo com ${label}`,
    { forbiddenValues: [provision.userId] }
  );
  const metadataSentinel = "oauth-mcp-metadata-must-not-change";
  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/user`,
    {
      method: "PUT",
      headers: { ...oauthHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ data: { oauth_auth_probe: metadataSentinel } })
    },
    `Auth PUT /user com ${label}`,
    { forbiddenValues: [provision.userId, metadataSentinel] }
  );
  const userAfterUpdate = await applicationUser(
    `Sessão normal após a recusa do PUT /user com ${label}`
  );
  assert.notEqual(userAfterUpdate.user_metadata?.oauth_auth_probe, metadataSentinel);
  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/user/oauth/grants`,
    { headers: oauthHeaders },
    `Auth GET /user/oauth/grants com ${label}`,
    { forbiddenValues: [provision.userId, provision.clientId] }
  );
  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/factors`,
    {
      method: "POST",
      headers: { ...oauthHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ factor_type: "totp", friendly_name: "probe descartável" })
    },
    `Auth POST /factors com ${label}`,
    { forbiddenValues: [provision.userId] }
  );
  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/reauthenticate`,
    { headers: oauthHeaders },
    `Auth GET /reauthenticate com ${label}`,
    { forbiddenValues: [provision.userId] }
  );
  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/logout?scope=local`,
    { method: "POST", headers: oauthHeaders },
    `Auth POST /logout com ${label}`,
    { forbiddenValues: [provision.userId] }
  );
  await applicationUser(`Sessão normal após a recusa do logout com ${label}`);
}

export async function verifyLocalMcpOAuthIsolation({
  provision,
  fetchImpl = globalThis.fetch,
  createId = randomUUID,
  allowHosted = false
} = {}) {
  assert.equal(typeof fetchImpl, "function", "fetch indisponível para a fronteira OAuth.");
  const projectUrl = String(provision?.projectUrl || "").trim();
  const explicitlyAllowedHostedProject =
    allowHosted === true
    && !isLocalSupabaseUrl(projectUrl)
    && /^https:\/\/[^/]+$/u.test(projectUrl);
  assert(
    projectUrl
    && (isLocalSupabaseUrl(projectUrl) || explicitlyAllowedHostedProject),
    "A prova destrutiva da fronteira OAuth só pode usar a stack Supabase local."
  );
  const accessToken = String(provision.accessToken || "").trim();
  const publishableKey = String(provision.publishableKey || "").trim();
  const serverApiKey = String(provision.serverApiKey || "").trim();
  const userId = String(provision.userId || "").trim();
  assert(accessToken && publishableKey && serverApiKey && userId);

  await verifyMcpOAuthGoTrueIsolation({
    provision,
    accessToken,
    fetchImpl
  });
  const oauthHeaders = oauthUserHeaders(publishableKey, accessToken);

  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/rest/v1/rpc/delete_my_account_v1`,
    {
      method: "POST",
      headers: { ...oauthHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ p_confirmation: "EXCLUIR MINHA CONTA" })
    },
    "Data API RPC com o bearer OAuth do MCP",
    { forbiddenValues: [userId] }
  );

  await rejectedOAuthBoundary(
    fetchImpl,
    `${provision.projectUrl}/rest/v1/person_profiles?select=user_id&user_id=eq.${
      encodeURIComponent(userId)
    }`,
    { headers: oauthHeaders },
    "Data API SELECT com o bearer OAuth do MCP",
    { forbiddenValues: [userId] }
  );

  const seededObjectPath = `${userId}/${createId()}.webp`;
  const attemptedObjectPath = `${userId}/${createId()}.webp`;
  const bucketUrl = `${provision.projectUrl}/storage/v1/object/person-avatars`;
  const seededObjectUrl = `${bucketUrl}/${storageObjectPath(seededObjectPath)}`;
  const attemptedObjectUrl = `${bucketUrl}/${storageObjectPath(attemptedObjectPath)}`;
  const authenticatedObjectUrl =
    `${provision.projectUrl}/storage/v1/object/authenticated/person-avatars/${
      storageObjectPath(seededObjectPath)
    }`;
  const applicationHeaders = {
    ...oauthUserHeaders(publishableKey, provision.userAccessToken),
    "Content-Type": "image/webp",
    "x-upsert": "false"
  };
  let storageCleanupFailure = null;
  try {
    await requestJson(
      fetchImpl,
      seededObjectUrl,
      {
        method: "POST",
        headers: applicationHeaders,
        body: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])
      },
      "Preparação local do objeto sentinela da fronteira OAuth"
    );

    await rejectedOAuthBoundary(
      fetchImpl,
      `${provision.projectUrl}/storage/v1/object/list/person-avatars`,
      {
        method: "POST",
        headers: { ...oauthHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: `${userId}/`, limit: 1, offset: 0 })
      },
      "Storage list com o bearer OAuth do MCP",
      { forbiddenValues: [userId], allowStorageEnvelope: true }
    );
    await rejectedOAuthBoundary(
      fetchImpl,
      authenticatedObjectUrl,
      { headers: oauthHeaders },
      "Storage GET com o bearer OAuth do MCP",
      { forbiddenValues: [userId], allowStorageEnvelope: true }
    );
    await rejectedOAuthBoundary(
      fetchImpl,
      attemptedObjectUrl,
      {
        method: "POST",
        headers: {
          ...oauthHeaders,
          "Content-Type": "image/webp",
          "x-upsert": "false"
        },
        body: new Uint8Array([82, 73, 70, 70, 87, 69, 66, 80])
      },
      "Storage POST com o bearer OAuth do MCP",
      { forbiddenValues: [userId], allowStorageEnvelope: true }
    );
    await rejectedOAuthBoundary(
      fetchImpl,
      bucketUrl,
      {
        method: "DELETE",
        headers: { ...oauthHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [seededObjectPath] })
      },
      "Storage DELETE com o bearer OAuth do MCP",
      {
        forbiddenValues: [userId],
        allowStorageEnvelope: true,
        // O Storage pode representar um DELETE filtrado pelo RLS como sucesso
        // vazio. O inventário service-role logo abaixo prova que nenhum objeto
        // foi removido, que é a fronteira material desta operação.
        allowEmptyNoop: true
      }
    );

    const { payload: serviceObjects } = await requestJson(
      fetchImpl,
      `${provision.projectUrl}/storage/v1/object/list/person-avatars`,
      {
        method: "POST",
        headers: supabaseServerHeaders(serverApiKey),
        body: JSON.stringify({ prefix: `${userId}/`, limit: 10, offset: 0 })
      },
      "Inventário administrativo dos objetos sentinela após as recusas OAuth"
    );
    assert(Array.isArray(serviceObjects));
    const serviceObjectNames = serviceObjects.map(({ name }) => String(name || ""));
    assert(
      serviceObjectNames.some((name) => (
        name === seededObjectPath || seededObjectPath.endsWith(`/${name}`)
      )),
      "O DELETE OAuth removeu o objeto sentinela."
    );
    assert.equal(
      serviceObjectNames.some((name) => (
        name === attemptedObjectPath || attemptedObjectPath.endsWith(`/${name}`)
      )),
      false,
      "O POST OAuth persistiu o objeto cuja escrita foi recusada."
    );
    await requestJson(
      fetchImpl,
      authenticatedObjectUrl,
      { headers: supabaseServerHeaders(serverApiKey, { contentType: false }) },
      "Confirmação de que o DELETE OAuth não removeu o objeto sentinela"
    );
  } finally {
    try {
      await requestJson(
        fetchImpl,
        bucketUrl,
        {
          method: "DELETE",
          headers: supabaseServerHeaders(serverApiKey),
          body: JSON.stringify({
            prefixes: [seededObjectPath, attemptedObjectPath]
          })
        },
        "Limpeza dos objetos sentinela da fronteira OAuth",
        { acceptedStatuses: [200, 204, 404] }
      );
    } catch (error) {
      storageCleanupFailure = error;
    }
  }
  if (storageCleanupFailure) throw storageCleanupFailure;
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
    discovery?.scopes_supported?.includes(MCP_OAUTH_SCOPE),
    `O OAuth Server local não anunciou o escopo ${MCP_OAUTH_SCOPE}.`
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
    scope: MCP_OAUTH_SCOPE,
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
  assert.equal(
    details?.scope,
    MCP_OAUTH_SCOPE,
    "O consentimento OAuth anunciou escopos além da fronteira MCP."
  );

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
  const refreshToken = String(grant?.refresh_token || "");
  assert(refreshToken, "O OAuth Server não emitiu refresh token.");
  assert.equal(
    Object.hasOwn(grant || {}, "id_token"),
    false,
    "O fluxo MCP não pode emitir ID token."
  );
  if (grant?.scope != null) assert.equal(grant.scope, MCP_OAUTH_SCOPE);
  assertMcpAccessTokenClaims(accessToken, {
    clientId: lifecycle.clientId,
    projectUrl: configuration.projectUrl,
    resourceUrl: configuration.resourceUrl,
    userId: lifecycle.userId,
    nowSeconds,
    label: "Access token OAuth inicial"
  });
  assert.notEqual(
    accessToken,
    configuration.serverApiKey,
    "A credencial administrativa não pode ser reutilizada como bearer do MCP."
  );
  return { ...lifecycle, accessToken, refreshToken };
}

export async function refreshLocalMcpOAuthToken({
  provision,
  fetchImpl = globalThis.fetch,
  nowSeconds = () => Math.floor(Date.now() / 1000)
} = {}) {
  assert.equal(typeof fetchImpl, "function", "fetch indisponível para renovar o OAuth.");
  const refreshToken = String(provision?.refreshToken || "").trim();
  assert(refreshToken, "Refresh token OAuth ausente.");
  const { payload: grant } = await requestJson(
    fetchImpl,
    `${provision.projectUrl}/auth/v1/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: provision.clientId,
        resource: provision.resourceUrl
      })
    },
    "Renovação do token OAuth MCP"
  );
  const accessToken = String(grant?.access_token || "");
  const nextRefreshToken = String(grant?.refresh_token || "");
  assert(accessToken && nextRefreshToken, "A renovação OAuth não devolveu o par de tokens.");
  assert.notEqual(accessToken, provision.accessToken, "A renovação reutilizou o access token.");
  assert.notEqual(nextRefreshToken, refreshToken, "A renovação não rotacionou o refresh token.");
  assert.equal(
    Object.hasOwn(grant || {}, "id_token"),
    false,
    "A renovação MCP não pode emitir ID token."
  );
  if (grant?.scope != null) assert.equal(grant.scope, MCP_OAUTH_SCOPE);
  assertMcpAccessTokenClaims(accessToken, {
    clientId: provision.clientId,
    projectUrl: provision.projectUrl,
    resourceUrl: provision.resourceUrl,
    userId: provision.userId,
    nowSeconds,
    label: "Access token OAuth renovado"
  });
  return {
    accessToken,
    refreshToken: nextRefreshToken
  };
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
  publishableKey = "",
  applicationAccessToken = ""
} = {}) {
  const previousToken =
    process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN;
  const previousRequirement =
    process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH;
  const previousProjectUrl = process.env.SUPABASE_URL;
  const previousPublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousApplicationToken = process.env.ARALEARN_APP_SESSION_TOKEN;
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN = accessToken;
  process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH = "1";
  if (projectUrl) process.env.SUPABASE_URL = projectUrl;
  if (publishableKey) process.env.SUPABASE_PUBLISHABLE_KEY = publishableKey;
  if (applicationAccessToken) {
    process.env.ARALEARN_APP_SESSION_TOKEN = applicationAccessToken;
  }
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
    if (previousApplicationToken === undefined) {
      delete process.env.ARALEARN_APP_SESSION_TOKEN;
    } else {
      process.env.ARALEARN_APP_SESSION_TOKEN = previousApplicationToken;
    }
  }
}

export async function executeRefreshedMcpProbe(accessToken, {
  projectUrl = "",
  origin = LOCAL_APP_ORIGIN,
  fetchImpl = globalThis.fetch
} = {}) {
  const edgeUrl = `${String(projectUrl || "").replace(/\/+$/u, "")}/functions/v1/aralearn-authoring-mcp`;
  const { payload } = await requestJson(
    fetchImpl,
    edgeUrl,
    {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: origin,
        "MCP-Protocol-Version": "2025-11-25"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "aralearn-refreshed-oauth-smoke", version: "1" }
        }
      })
    },
    "MCP com o access token renovado"
  );
  assert.equal(payload?.error, undefined, payload?.error?.message);
  assert.equal(payload?.result?.protocolVersion, "2025-11-25");
}

export async function runLocalMcpOAuthSmoke({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  executeSmoke = executeAuthenticatedSmoke,
  executeRefreshSmoke = executeRefreshedMcpProbe,
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
    await verifyLocalMcpOAuthIsolation({
      provision,
      fetchImpl,
      createId
    });
    await executeSmoke(provision.accessToken, {
      projectUrl: provision.projectUrl,
      publishableKey: provision.publishableKey,
      applicationAccessToken: provision.userAccessToken
    });
    const refreshed = await refreshLocalMcpOAuthToken({
      provision,
      fetchImpl,
      ...(nowSeconds ? { nowSeconds } : {})
    });
    await verifyMcpOAuthGoTrueIsolation({
      provision,
      accessToken: refreshed.accessToken,
      fetchImpl,
      label: "bearer OAuth renovado do MCP"
    });
    await executeRefreshSmoke(refreshed.accessToken, {
      projectUrl: provision.projectUrl,
      publishableKey: provision.publishableKey,
      applicationAccessToken: provision.userAccessToken,
      fetchImpl
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
