import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";

const OAUTH_BODY_LIMIT = 16 * 1024;
const OAUTH_SCOPE = "openid email";
const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function exactBaseUrl(value, label, { preserveTrailingSlash = false } = {}) {
  let parsed;
  try {
    parsed = new URL(text(value));
  } catch {
    throw new TypeError(`${label} exige uma URL pública válida.`);
  }
  const local = parsed.protocol === "http:"
    && new Set(["127.0.0.1", "localhost"]).has(parsed.hostname);
  if ((parsed.protocol !== "https:" && !local)
      || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError(`${label} exige HTTPS sem credenciais ou parâmetros.`);
  }
  const normalized = parsed.toString();
  return preserveTrailingSlash ? normalized : normalized.replace(/\/+$/u, "");
}

function uuid(value, label) {
  const result = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(result)) {
    throw new AuthoringApiError(400, "invalid_request", `${label} inválido.`);
  }
  return result;
}

function gptId(value) {
  const result = text(value);
  if (!/^g-[A-Za-z0-9-]{6,150}$/u.test(result)) {
    throw new AuthoringApiError(400, "invalid_request", "Informe o ID do GPT salvo.");
  }
  return result;
}

function credential(value, label) {
  const result = text(value);
  if (!/^[A-Za-z0-9_-]{24,512}$/u.test(result)) {
    throw new AuthoringApiError(400, "invalid_request", `${label} inválido.`);
  }
  return result;
}

function normalizeScope(value) {
  const scopes = [...new Set(text(value).split(/\s+/u).filter(Boolean))];
  if (!scopes.includes("openid") || scopes.some((scope) => !new Set(["openid", "email"]).has(scope))) {
    throw new AuthoringApiError(400, "invalid_scope", "Use somente o escopo openid email.");
  }
  return scopes.includes("email") ? OAUTH_SCOPE : "openid";
}

function base64Url(bytes) {
  let source = "";
  bytes.forEach((value) => { source += String.fromCharCode(value); });
  return globalThis.btoa(source)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function randomCredential(prefix, byteLength = 32) {
  return `${prefix}${base64Url(globalThis.crypto.getRandomValues(new Uint8Array(byteLength)))}`;
}

function readBearer(request) {
  const value = text(request.headers.get("authorization"));
  const bearer = value.match(/^Bearer\s+(.+)$/iu)?.[1]?.trim() || "";
  if (!bearer) {
    throw new AuthoringApiError(401, "authentication_required", "Entre no AraLearn para continuar.");
  }
  return bearer;
}

async function readBytes(request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > OAUTH_BODY_LIMIT) {
      await reader.cancel();
      throw new AuthoringApiError(413, "invalid_request", "Solicitação OAuth muito grande.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

async function readJson(request) {
  if (!text(request.headers.get("content-type")).toLowerCase().startsWith("application/json")) {
    throw new AuthoringApiError(415, "unsupported_media_type", "Envie application/json.");
  }
  try {
    const bytes = await readBytes(request);
    const body = bytes.byteLength ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) {
    if (error instanceof AuthoringApiError) throw error;
    throw new AuthoringApiError(400, "invalid_request", "O corpo JSON é inválido.");
  }
}

async function readForm(request) {
  if (!text(request.headers.get("content-type")).toLowerCase()
    .startsWith("application/x-www-form-urlencoded")) {
    throw new AuthoringApiError(
      415,
      "unsupported_media_type",
      "O token endpoint exige application/x-www-form-urlencoded."
    );
  }
  return new URLSearchParams(new TextDecoder().decode(await readBytes(request)));
}

function redirectResponse(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...headers
    }
  });
}

function appendOAuthResult(rawRedirectUri, values) {
  const redirect = new URL(rawRedirectUri);
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") {
      redirect.searchParams.set(key, String(value));
    }
  }
  return redirect.toString();
}

function publicFailure(error, headers = {}) {
  const normalized = asAuthoringApiError(error);
  const courseError = normalized.code === "invalid_course_command";
  const courseServiceError = normalized.code === "course_service_unavailable"
    || normalized.code === "course_response_too_large";
  return jsonResponse(courseError ? 400 : courseServiceError ? 503 : normalized.status, {
    error: courseError
      ? "invalid_request"
      : courseServiceError ? "temporarily_unavailable" : normalized.code,
    error_description: courseError
      ? "A solicitação OAuth é inválida."
      : courseServiceError
        ? "O serviço OAuth está temporariamente indisponível."
        : normalized.message
  }, headers);
}

function tokenFailure(error, headers = {}) {
  const normalized = asAuthoringApiError(error);
  const authenticationFailure = normalized.status === 401
    || normalized.code === "invalid_course_command";
  const courseServiceError = normalized.code === "course_service_unavailable"
    || normalized.code === "course_response_too_large";
  return jsonResponse(authenticationFailure ? 400 : courseServiceError ? 503 : normalized.status, {
    error: authenticationFailure
      ? "invalid_grant"
      : courseServiceError ? "temporarily_unavailable" : normalized.code,
    error_description: authenticationFailure
      ? "As credenciais ou a concessão OAuth são inválidas."
      : courseServiceError
        ? "O serviço OAuth está temporariamente indisponível."
        : normalized.message
  }, headers);
}

export function createAuthoringActionOAuthHandler({
  adapter,
  actionBaseUrl,
  publicAppUrl
}) {
  if (!adapter) throw new TypeError("O OAuth da Action exige um adaptador.");
  const baseUrl = exactBaseUrl(actionBaseUrl, "O OAuth da Action");
  const appUrl = exactBaseUrl(
    publicAppUrl,
    "O consentimento da Action",
    { preserveTrailingSlash: true }
  );

  return async function handleActionOAuthRequest(request, route, cors = {}) {
    const section = route[1] || "";
    const deadlineAt = Date.now() + 20_000;
    try {
      if (section === "clients" && route[2] === "register" && route.length === 3) {
        if (request.method !== "POST") {
          throw new AuthoringApiError(405, "method_not_allowed", "Cadastro OAuth exige POST.");
        }
        const user = await adapter.resolveApplicationUser(readBearer(request), { deadlineAt });
        await readJson(request);
        const rawSecret = randomCredential("ars_");
        const registered = await adapter.createActionOAuthClientSetup({
          creatorUserId: user.id,
          clientName: "AraLearn Chatbot",
          clientSecretHash: await sha256Hex(rawSecret)
        }, { deadlineAt });
        return jsonResponse(201, {
          client_id: registered.clientId || registered.client_id,
          client_secret: rawSecret,
          authorization_url: `${baseUrl}/oauth/authorize`,
          token_url: `${baseUrl}/oauth/token`,
          scope: OAUTH_SCOPE,
          token_endpoint_auth_method: "client_secret_post"
        }, cors);
      }

      if (section === "clients" && route[3] === "link" && route.length === 4) {
        if (request.method !== "POST") {
          throw new AuthoringApiError(405, "method_not_allowed", "Vínculo OAuth exige POST.");
        }
        const user = await adapter.resolveApplicationUser(readBearer(request), { deadlineAt });
        const body = await readJson(request);
        const linked = await adapter.linkActionOAuthClient({
          creatorUserId: user.id,
          clientId: uuid(route[2], "client_id"),
          gptId: gptId(body.gptId)
        }, { deadlineAt });
        return jsonResponse(200, {
          client_id: linked.clientId || linked.client_id,
          gpt_id: linked.gptId || linked.gpt_id,
          linked: linked.linked === true
        }, cors);
      }

      if (section === "authorize" && route.length === 2) {
        if (request.method !== "GET") {
          throw new AuthoringApiError(405, "method_not_allowed", "Autorização OAuth exige GET.");
        }
        const query = new URL(request.url).searchParams;
        if (query.get("response_type") !== "code") {
          throw new AuthoringApiError(400, "unsupported_response_type", "Use response_type=code.");
        }
        const state = text(query.get("state"));
        if (!/^[\u0021-\u007e]{8,1024}$/u.test(state)) {
          throw new AuthoringApiError(400, "invalid_request", "O parâmetro state é obrigatório.");
        }
        const created = await adapter.createActionOAuthAuthorization({
          clientId: uuid(query.get("client_id"), "client_id"),
          redirectUri: text(query.get("redirect_uri")),
          state,
          scope: normalizeScope(query.get("scope") || OAUTH_SCOPE)
        }, { deadlineAt });
        const consent = new URL(appUrl);
        consent.searchParams.set(
          "action_authorization_id",
          created.authorizationId || created.authorization_id
        );
        return redirectResponse(consent.toString(), cors);
      }

      if (section === "authorizations" && route.length === 3) {
        const authorizationId = uuid(route[2], "authorization_id");
        const user = await adapter.resolveApplicationUser(readBearer(request), { deadlineAt });
        if (request.method === "GET") {
          const details = await adapter.getActionOAuthAuthorization({
            authorizationId,
            userId: user.id
          }, { deadlineAt });
          return jsonResponse(200, details, cors);
        }
        if (request.method !== "POST") {
          throw new AuthoringApiError(405, "method_not_allowed", "Decisão OAuth exige POST.");
        }
        const body = await readJson(request);
        if (!new Set(["approve", "deny"]).has(body.action)) {
          throw new AuthoringApiError(400, "invalid_request", "Decisão OAuth inválida.");
        }
        const rawCode = body.action === "approve" ? randomCredential("arc_") : null;
        const result = await adapter.decideActionOAuthAuthorization({
          authorizationId,
          userId: user.id,
          action: body.action,
          codeHash: rawCode ? await sha256Hex(rawCode) : null
        }, { deadlineAt });
        const redirectUri = result.redirectUri || result.redirect_uri;
        const state = result.state;
        const redirectUrl = body.action === "approve"
          ? appendOAuthResult(redirectUri, { code: rawCode, state })
          : appendOAuthResult(redirectUri, {
            error: "access_denied",
            error_description: "A conexão foi negada.",
            state
          });
        return jsonResponse(200, { redirect_url: redirectUrl }, cors);
      }

      if (section === "token" && route.length === 2) {
        if (request.method !== "POST") {
          throw new AuthoringApiError(405, "method_not_allowed", "Token OAuth exige POST.");
        }
        const form = await readForm(request);
        const clientId = uuid(form.get("client_id"), "client_id");
        const clientSecret = credential(form.get("client_secret"), "client_secret");
        const accessToken = randomCredential("ara_");
        const refreshToken = randomCredential("arr_");
        const common = {
          clientId,
          clientSecretHash: await sha256Hex(clientSecret),
          accessTokenHash: await sha256Hex(accessToken)
        };
        let result;
        if (form.get("grant_type") === "authorization_code") {
          const code = credential(form.get("code"), "code");
          result = await adapter.exchangeActionOAuthCode({
            ...common,
            codeHash: await sha256Hex(code),
            redirectUri: text(form.get("redirect_uri")),
            refreshTokenHash: await sha256Hex(refreshToken),
            grantId: globalThis.crypto.randomUUID()
          }, { deadlineAt });
        } else if (form.get("grant_type") === "refresh_token") {
          const previousRefresh = credential(form.get("refresh_token"), "refresh_token");
          result = await adapter.exchangeActionOAuthRefresh({
            ...common,
            refreshTokenHash: await sha256Hex(previousRefresh),
            newRefreshTokenHash: await sha256Hex(refreshToken)
          }, { deadlineAt });
        } else {
          throw new AuthoringApiError(400, "unsupported_grant_type", "Grant OAuth não suportado.");
        }
        return jsonResponse(200, {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: "Bearer",
          expires_in: Number(result.expiresIn || result.expires_in || 3600),
          scope: result.scope || OAUTH_SCOPE
        }, cors);
      }

      throw new AuthoringApiError(404, "not_found", "Endpoint OAuth inexistente.");
    } catch (error) {
      return section === "token"
        ? tokenFailure(error, cors)
        : publicFailure(error, cors);
    }
  };
}
