import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

export const LOCAL_APPLICATION_ORIGIN = "http://127.0.0.1:4182";
export const CHATGPT_ACTION_ORIGIN = "https://chatgpt.com";
const MCP_PROTOCOL_VERSION = "2025-11-25";
const MCP_REDIRECT_URI = "https://mcp-e2e.aralearn.invalid/callback";
const ACTION_GPT_ID = "g-aralearn-e2e-metadata";
const ACTION_CALLBACK_ID = "g-aralearn-e2e-callback";
const ACTION_REDIRECT_URI =
  `https://chat.openai.com/aip/${ACTION_CALLBACK_ID}/oauth/callback`;

export function localSupabaseConfiguration(environment = process.env) {
  const projectUrl = String(environment.ARALEARN_SUPABASE_URL || "").replace(/\/+$/u, "");
  const publishableKey = String(
    environment.ARALEARN_SUPABASE_PUBLISHABLE_KEY || environment.SUPABASE_ANON_KEY || ""
  ).trim();
  const adminKey = String(
    environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(projectUrl)) {
    throw new Error("A prova E2E aceita somente uma stack Supabase local.");
  }
  if (!publishableKey || !adminKey) {
    throw new Error("As chaves efêmeras da stack Supabase local estão ausentes.");
  }
  return Object.freeze({ projectUrl, publishableKey, adminKey });
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

function safeRemoteFailure(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(
    payload.error_description || payload.msg || payload.message ||
    payload.error_code || payload.code ||
    (typeof payload.error === "string" ? payload.error : "") || ""
  ).trim().slice(0, 500);
}

async function checkedResponsePayload(response, label, acceptedStatuses = null) {
  const payload = await responsePayload(response);
  const accepted = acceptedStatuses
    ? acceptedStatuses.includes(response.status)
    : response.ok;
  if (!accepted) {
    const detail = safeRemoteFailure(payload);
    throw new Error(`${label}: HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return payload;
}

function jwtClaims(token) {
  const segments = String(token || "").split(".");
  if (segments.length !== 3) throw new Error("O OAuth local não emitiu um JWT válido.");
  try {
    return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("O JWT OAuth local não contém claims JSON válidos.");
  }
}

function audienceIncludes(value, expected) {
  return (Array.isArray(value) ? value : [value]).some((item) => item === expected);
}

export async function localSupabaseRequest(config, path, {
  method = "GET",
  token = config.publishableKey,
  body,
  rawBody,
  headers = {},
  origin = null
} = {}) {
  const requestHeaders = {
    apikey: token === config.adminKey ? config.adminKey : config.publishableKey,
    Authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    ...headers
  };
  if (origin) requestHeaders.Origin = origin;
  const response = await fetch(`${config.projectUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: rawBody === undefined
      ? body === undefined ? undefined : JSON.stringify(body)
      : rawBody
  });
  return { response, payload: await responsePayload(response) };
}

export function localSupabaseFailure(label, result) {
  return `${label}: HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`;
}

export async function createConfirmedLocalUser(config, { email, password, marker }) {
  return localSupabaseRequest(config, "/auth/v1/admin/users", {
    method: "POST",
    token: config.adminKey,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { test: marker }
    }
  });
}

export async function removeLocalUser(config, userId) {
  if (!userId) return null;
  return localSupabaseRequest(config, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    token: config.adminKey
  });
}

export async function signInLocalUser(config, { email, password }) {
  return localSupabaseRequest(config, "/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
}

export async function authorizeLocalMcpSession(config, {
  userAccessToken,
  userId,
  lifecycle = {}
}) {
  const resourceUrl = `${config.projectUrl}/functions/v1/aralearn-authoring-mcp`;
  Object.assign(lifecycle, {
    projectUrl: config.projectUrl,
    resourceUrl,
    publishableKey: config.publishableKey,
    userAccessToken,
    userId,
    clientId: null,
    oauthGrantCreated: false,
    accessToken: null
  });

  const metadata = await checkedResponsePayload(
    await fetch(`${resourceUrl}/.well-known/oauth-protected-resource`),
    "Metadata OAuth do MCP"
  );
  if (metadata?.resource !== resourceUrl ||
      !metadata.authorization_servers?.includes(`${config.projectUrl}/auth/v1`)) {
    throw new Error("A metadata OAuth do MCP não corresponde à stack local.");
  }
  const anonymousPing = await fetch(resourceUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Origin: LOCAL_APPLICATION_ORIGIN,
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} })
  });
  await checkedResponsePayload(anonymousPing, "Rejeição anônima do MCP", [401]);

  const discovery = await checkedResponsePayload(
    await fetch(`${config.projectUrl}/auth/v1/.well-known/oauth-authorization-server`, {
      headers: { Accept: "application/json" },
      redirect: "manual"
    }),
    "Discovery do OAuth Server"
  );
  const issuer = `${config.projectUrl}/auth/v1`;
  if (discovery?.issuer !== issuer ||
      discovery.authorization_endpoint !== `${issuer}/oauth/authorize` ||
      discovery.token_endpoint !== `${issuer}/oauth/token` ||
      discovery.registration_endpoint !== `${issuer}/oauth/clients/register` ||
      !discovery.code_challenge_methods_supported?.includes("S256") ||
      !discovery.scopes_supported?.includes("offline_access")) {
    throw new Error("O discovery OAuth local não anuncia o contrato necessário ao MCP.");
  }

  const registeredClient = await checkedResponsePayload(
    await fetch(discovery.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "AraLearn Autoria E2E",
        client_type: "public",
        redirect_uris: [MCP_REDIRECT_URI],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"]
      })
    }),
    "Registro dinâmico do cliente MCP",
    [201]
  );
  const clientId = String(registeredClient?.client_id || "");
  if (!/^[0-9a-f-]{36}$/iu.test(clientId)) {
    throw new Error("O OAuth Server não devolveu a identidade do cliente MCP.");
  }
  lifecycle.clientId = clientId;

  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(32).toString("base64url");
  const authorizationUrl = new URL(discovery.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: MCP_REDIRECT_URI,
    scope: "offline_access",
    state,
    resource: resourceUrl,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  const authorizationResponse = await fetch(authorizationUrl, {
    headers: { Accept: "text/html" },
    redirect: "manual"
  });
  if (![302, 303].includes(authorizationResponse.status)) {
    throw new Error(`Início da autorização OAuth: HTTP ${authorizationResponse.status}.`);
  }
  const consentLocation = authorizationResponse.headers.get("location");
  const consentUrl = new URL(String(consentLocation || ""), config.projectUrl);
  if (consentUrl.origin !== LOCAL_APPLICATION_ORIGIN || consentUrl.pathname !== "/") {
    throw new Error("O OAuth Server não redirecionou ao consentimento local do AraLearn.");
  }
  const authorizationId = String(consentUrl.searchParams.get("authorization_id") || "");
  if (!/^[A-Za-z0-9._~-]{8,512}$/u.test(authorizationId)) {
    throw new Error("O consentimento OAuth não contém uma identidade válida.");
  }
  const authorizationPath =
    `/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`;
  const detailsResult = await localSupabaseRequest(config, authorizationPath, {
    token: userAccessToken,
    origin: LOCAL_APPLICATION_ORIGIN
  });
  const details = await Promise.resolve(detailsResult.payload);
  if (detailsResult.response.status !== 200 || details?.authorization_id !== authorizationId ||
      details?.client?.id !== clientId || details?.user?.id !== userId) {
    throw new Error("A leitura do consentimento OAuth não corresponde à pessoa autora.");
  }
  const consentResult = await localSupabaseRequest(config, `${authorizationPath}/consent`, {
    method: "POST",
    token: userAccessToken,
    origin: LOCAL_APPLICATION_ORIGIN,
    body: { action: "approve" }
  });
  if (consentResult.response.status !== 200) {
    throw new Error(`Aprovação do consentimento OAuth: HTTP ${consentResult.response.status}.`);
  }
  const callback = new URL(String(consentResult.payload?.redirect_url || ""));
  if (callback.origin + callback.pathname !== MCP_REDIRECT_URI ||
      callback.searchParams.get("state") !== state || !callback.searchParams.get("code")) {
    throw new Error("O callback OAuth não corresponde ao pedido PKCE.");
  }

  const grant = await checkedResponsePayload(
    await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.searchParams.get("code"),
        client_id: clientId,
        redirect_uri: MCP_REDIRECT_URI,
        code_verifier: verifier,
        resource: resourceUrl
      })
    }),
    "Troca do código OAuth por token"
  );
  const accessToken = String(grant?.access_token || "");
  const claims = jwtClaims(accessToken);
  const uuidPattern = /^[0-9a-f-]{36}$/iu;
  if (grant?.id_token != null || claims.iss !== issuer || claims.client_id !== clientId ||
      claims.scope !== "offline_access" || claims.sub === userId ||
      claims.session_id === claims.aralearn_session_id ||
      !uuidPattern.test(String(claims.sub || "")) ||
      !uuidPattern.test(String(claims.session_id || "")) ||
      !uuidPattern.test(String(claims.aralearn_session_id || "")) ||
      !audienceIncludes(claims.aud, resourceUrl)) {
    throw new Error("O access token OAuth não foi blindado para o MCP esperado.");
  }
  lifecycle.oauthGrantCreated = true;
  lifecycle.accessToken = accessToken;
  return lifecycle;
}

export async function cleanupLocalMcpSession(config, lifecycle) {
  if (!lifecycle?.clientId) return;
  const failures = [];
  if (lifecycle.oauthGrantCreated && lifecycle.userAccessToken) {
    const grantRemoval = await localSupabaseRequest(
      config,
      `/auth/v1/user/oauth/grants?client_id=${encodeURIComponent(lifecycle.clientId)}`,
      {
        method: "DELETE",
        token: lifecycle.userAccessToken,
        origin: LOCAL_APPLICATION_ORIGIN
      }
    ).catch((error) => ({ error }));
    if (grantRemoval.error || ![200, 204].includes(grantRemoval.response.status)) {
      failures.push(grantRemoval.error || new Error(
        `Revogação OAuth: HTTP ${grantRemoval.response.status}.`
      ));
    }
  }
  const clientRemoval = await localSupabaseRequest(
    config,
    `/auth/v1/admin/oauth/clients/${encodeURIComponent(lifecycle.clientId)}`,
    { method: "DELETE", token: config.adminKey }
  ).catch((error) => ({ error }));
  if (clientRemoval.error || ![200, 204, 404].includes(clientRemoval.response.status)) {
    failures.push(clientRemoval.error || new Error(
      `Remoção do cliente OAuth: HTTP ${clientRemoval.response.status}.`
    ));
  }
  if (failures.length) {
    throw new AggregateError(failures, "A limpeza da autorização MCP local falhou.");
  }
}

export async function authorizeLocalActionSession(config, {
  userAccessToken,
  userId,
  lifecycle = {}
}) {
  const actionUrl = `${config.projectUrl}/functions/v1/aralearn-authoring-action`;
  Object.assign(lifecycle, {
    actionUrl,
    userAccessToken,
    userId,
    clientId: null,
    accessToken: null
  });

  const registeredResult = await localSupabaseRequest(
    config,
    "/functions/v1/aralearn-authoring-action/oauth/clients/register",
    {
      method: "POST",
      token: userAccessToken,
      body: {},
      origin: LOCAL_APPLICATION_ORIGIN
    }
  );
  if (registeredResult.response.status !== 201) {
    throw new Error(
      `Registro do cliente de Actions: HTTP ${registeredResult.response.status}: ` +
      safeRemoteFailure(registeredResult.payload)
    );
  }
  const registered = registeredResult.payload;
  const clientId = String(registered?.client_id || "");
  const clientSecret = String(registered?.client_secret || "");
  if (!/^[0-9a-f-]{36}$/iu.test(clientId) || !/^ars_[A-Za-z0-9_-]{40,}$/u.test(clientSecret)) {
    throw new Error("O cadastro de Actions não devolveu credenciais válidas.");
  }
  lifecycle.clientId = clientId;

  const linkedResult = await localSupabaseRequest(
    config,
    `/functions/v1/aralearn-authoring-action/oauth/clients/${encodeURIComponent(clientId)}/link`,
    {
      method: "POST",
      token: userAccessToken,
      body: { gptId: ACTION_GPT_ID },
      origin: LOCAL_APPLICATION_ORIGIN
    }
  );
  if (!linkedResult.response.ok) {
    throw new Error(
      `Vínculo do cliente ao GPT: HTTP ${linkedResult.response.status}: ` +
      safeRemoteFailure(linkedResult.payload)
    );
  }
  const linked = linkedResult.payload;
  if (linked?.client_id !== clientId || linked?.gpt_id !== ACTION_GPT_ID ||
      linked?.linked !== true) {
    throw new Error("O cliente de Actions não foi vinculado ao GPT de teste.");
  }

  const state = randomBytes(32).toString("base64url");
  const authorizationUrl = new URL(`${actionUrl}/oauth/authorize`);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: ACTION_REDIRECT_URI,
    scope: "openid email",
    state
  }).toString();
  const authorizationResponse = await fetch(authorizationUrl, {
    headers: {
      apikey: config.publishableKey,
      Origin: CHATGPT_ACTION_ORIGIN
    },
    redirect: "manual"
  });
  if (![302, 303].includes(authorizationResponse.status)) {
    throw new Error(`Início da autorização de Actions: HTTP ${authorizationResponse.status}.`);
  }
  const consentUrl = new URL(
    String(authorizationResponse.headers.get("location") || ""),
    LOCAL_APPLICATION_ORIGIN
  );
  if (consentUrl.origin !== LOCAL_APPLICATION_ORIGIN || consentUrl.pathname !== "/") {
    throw new Error("A autorização de Actions não abriu o consentimento do AraLearn.");
  }
  const authorizationId = String(
    consentUrl.searchParams.get("action_authorization_id") || ""
  );
  if (!/^[0-9a-f-]{36}$/iu.test(authorizationId)) {
    throw new Error("O consentimento de Actions não contém uma identidade válida.");
  }
  const authorizationPath =
    `/functions/v1/aralearn-authoring-action/oauth/authorizations/${authorizationId}`;
  const detailsResult = await localSupabaseRequest(config, authorizationPath, {
    token: userAccessToken,
    origin: LOCAL_APPLICATION_ORIGIN
  });
  if (!detailsResult.response.ok) {
    throw new Error(
      `Leitura do consentimento de Actions: HTTP ${detailsResult.response.status}: ` +
      safeRemoteFailure(detailsResult.payload)
    );
  }
  const details = detailsResult.payload;
  if (details?.authorization_id !== authorizationId || details?.client?.id !== clientId ||
      details?.user?.id !== userId || details?.scope !== "openid email") {
    throw new Error("O consentimento de Actions não corresponde à pessoa autora.");
  }

  const approvedResult = await localSupabaseRequest(config, authorizationPath, {
    method: "POST",
    token: userAccessToken,
    body: { action: "approve" },
    origin: LOCAL_APPLICATION_ORIGIN
  });
  if (!approvedResult.response.ok) {
    throw new Error(
      `Aprovação do consentimento de Actions: HTTP ${approvedResult.response.status}: ` +
      safeRemoteFailure(approvedResult.payload)
    );
  }
  const approved = approvedResult.payload;
  const callback = new URL(String(approved?.redirect_url || ""));
  if (callback.origin + callback.pathname !== ACTION_REDIRECT_URI ||
      callback.searchParams.get("state") !== state || !callback.searchParams.get("code")) {
    throw new Error("O callback de Actions não corresponde à autorização aprovada.");
  }

  const tokenResponse = await fetch(`${actionUrl}/oauth/token`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: CHATGPT_ACTION_ORIGIN
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: callback.searchParams.get("code"),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: ACTION_REDIRECT_URI
    })
  });
  const grant = await checkedResponsePayload(tokenResponse, "Troca do código de Actions");
  const accessToken = String(grant?.access_token || "");
  if (!/^ara_[A-Za-z0-9_-]{40,}$/u.test(accessToken) || grant?.token_type !== "Bearer" ||
      grant?.scope !== "openid email") {
    throw new Error("O OAuth de Actions não devolveu o bearer esperado.");
  }
  lifecycle.accessToken = accessToken;
  return lifecycle;
}

export async function createLocalMcpClient(config, accessToken) {
  const endpoint = `${config.projectUrl}/functions/v1/aralearn-authoring-mcp`;
  let rpcId = 0;
  const call = async (method, params = {}) => {
    rpcId += 1;
    const payload = await checkedResponsePayload(await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: LOCAL_APPLICATION_ORIGIN,
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params })
    }), `MCP ${method}`);
    if (payload?.error) {
      throw new Error(`MCP ${method}: ${safeRemoteFailure(payload.error) || "erro JSON-RPC"}.`);
    }
    return payload?.result;
  };
  const initialized = await call("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "aralearn-authoring-e2e", version: "1" }
  });
  if (initialized?.protocolVersion !== MCP_PROTOCOL_VERSION) {
    throw new Error("O MCP não negociou a versão de protocolo esperada.");
  }
  const listed = await call("tools/list");
  const toolDefinitions = structuredClone(listed?.tools || []);
  const toolNames = toolDefinitions.map(({ name }) => name);
  return Object.freeze({
    protocolVersion: initialized.protocolVersion,
    toolNames: Object.freeze(toolNames),
    toolDefinitions: Object.freeze(toolDefinitions),
    async callTool(name, argumentsValue = {}) {
      if (!toolNames.includes(name)) throw new Error(`A ferramenta MCP ${name} não foi anunciada.`);
      const result = await call("tools/call", { name, arguments: argumentsValue });
      if (result?.isError || result?.structuredContent?.ok === false) {
        throw new Error(
          `MCP ${name}: ${safeRemoteFailure(result?.structuredContent?.error) || "falha da ferramenta"}.`
        );
      }
      return result?.structuredContent?.data;
    }
  });
}

export async function courseAction(config, name, body, token) {
  return localSupabaseRequest(
    config,
    `/functions/v1/aralearn-course-api/app/${encodeURIComponent(name)}`,
    { method: "POST", token, body, origin: LOCAL_APPLICATION_ORIGIN }
  );
}

export async function chatGptAction(config, name, body, token) {
  return localSupabaseRequest(
    config,
    `/functions/v1/aralearn-authoring-action/${encodeURIComponent(name)}`,
    { method: "POST", token, body, origin: CHATGPT_ACTION_ORIGIN }
  );
}

export async function restRpc(config, name, body, token) {
  return localSupabaseRequest(config, `/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    token,
    body
  });
}

export function queryLocalPostgresJson(sql) {
  const result = spawnSync("docker", [
    "exec", "-i", "supabase_db_aralearn", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
    "--command", sql
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(result.stderr || "A inspeção do Postgres local falhou.");
  }
  return JSON.parse(result.stdout.trim());
}

export async function readCourseIndexedDb(page, userId) {
  return page.evaluate(async ({ requestedUserId }) => {
    const databaseName = `aralearn-course-v1-${requestedUserId}`;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("course_cache")) return [];
      const rows = await new Promise((resolve, reject) => {
        const transaction = database.transaction("course_cache", "readonly");
        const request = transaction.objectStore("course_cache").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return rows
        .map(({ key, value }) => ({ key, value }))
        .sort((left, right) => left.key.localeCompare(right.key));
    } finally {
      database.close();
    }
  }, { requestedUserId: userId });
}
