import { executeAuthoringTool } from "./authoringToolExecutor.js";
import { createAuthoringActionOAuthHandler } from "./actionOAuthServer.js";
import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import {
  corsHeaders,
  preflightHeaders,
  readAuthoringOAuthAuthorization,
  sha256Hex
} from "./security.js";
import {
  authoringMcpToolDefinition,
  authoringMcpToolIsAllowed
} from "./workspaceMcpTools.js";
import { toolErrorData } from "./toolErrorEnvelope.js";

const ACTION_BODY_LIMIT = 96 * 1024;
const ACTION_RESPONSE_LIMIT = 96 * 1024;
const APPLICATION_AUTHORING_ACTIONS = new Set([
  "listarWorkspacesDeAutoria",
  "criarWorkspaceDeAutoria",
  "lerWorkspaceDeAutoria",
  "gerirContinuidadeDaAutoria",
  "criarEstruturaNoWorkspace",
  "salvarCardsNaMicrossequencia",
  "atualizarMetadadosDaEntidade",
  "consultarCatalogo",
  "editarCatalogo",
  "salvarCardNoWorkspace",
  "reorganizarWorkspace",
  "gerirWorkspaceEducacional",
  "retirarDoCatalogo",
  "excluirDoWorkspace",
  "publicarCursoDoWorkspace",
  "retirarCursoDasTrilhas"
]);
const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});

function encodedSize(value) {
  return new TextEncoder().encode(value).byteLength;
}

function jsonResponse(status, payload, headers = {}) {
  const source = JSON.stringify(payload);
  return new Response(source, {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function actionFailure(
  error,
  requestId = null,
  { actionName = null, rawArguments = null } = {}
) {
  return {
    ok: false,
    requestId,
    error: toolErrorData(error, {
      toolName: actionName,
      rawArguments,
      requestId
    })
  };
}

function routeFromPath(pathname) {
  const segments = String(pathname || "")
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean);
  const slugIndex = segments.lastIndexOf("aralearn-authoring-action");
  const route = slugIndex >= 0
    ? segments.slice(slugIndex + 1)
    : segments;
  return route.map((segment) => decodeURIComponent(segment));
}

async function readJsonBody(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new AuthoringApiError(415, "unsupported_media_type", "A Action exige application/json.");
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ACTION_BODY_LIMIT) {
      await reader.cancel();
      throw new AuthoringApiError(
        413,
        "action_payload_too_large",
        "Envie uma entidade menor ou divida a alteração em operações atômicas."
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  try {
    const body = total ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo da Action deve formar um objeto JSON.");
  }
}

export function createAuthoringActionHandler({
  adapter,
  allowedOrigins = new Set(),
  actionBaseUrl,
  publicAppUrl
}) {
  if (!adapter) throw new TypeError("A Action exige um adaptador de autoria.");
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("A Action exige origens exatas e não aceita origem curinga.");
  }
  const handleOAuth = createAuthoringActionOAuthHandler({
    adapter,
    actionBaseUrl,
    publicAppUrl
  });

  return async function handleAuthoringActionRequest(request) {
    let cors = { Vary: "Origin" };
    let requestId = null;
    let actionName = null;
    let rawArguments = null;
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: preflightHeaders(request, allowedOrigins)
        });
      }
      cors = corsHeaders(request, allowedOrigins);
      const route = routeFromPath(new URL(request.url).pathname);
      if (route[0] === "oauth") {
        return handleOAuth(request, route, cors);
      }
      if (request.method !== "POST") {
        return jsonResponse(
          405,
          actionFailure(new AuthoringApiError(405, "method_not_allowed", "A Action aceita somente POST.")),
          { ...cors, Allow: "POST, OPTIONS" }
        );
      }
      const applicationRequest = route[0] === "app";
      actionName = applicationRequest && route.length === 2
        ? route[1]
        : route.length === 1
          ? route[0]
          : "";
      if (!authoringMcpToolDefinition(actionName)) {
        throw new AuthoringApiError(404, "unknown_action", "Operação de autoria inexistente.");
      }
      if (applicationRequest && !APPLICATION_AUTHORING_ACTIONS.has(actionName)) {
        throw new AuthoringApiError(
          403,
          "application_action_forbidden",
          "Esta operação não pertence à autoria contextual do aplicativo."
        );
      }
      rawArguments = await readJsonBody(request);
      requestId = rawArguments.requestId ?? null;
      const authentication = readAuthoringOAuthAuthorization(request);
      const deadlineAt = Date.now() + 40_000;
      const principal = applicationRequest
        ? await adapter.resolveApplicationPrincipal(authentication.credential, { deadlineAt })
        : await adapter.resolveActionPrincipal(
            await sha256Hex(authentication.credential),
            { deadlineAt }
          );
      if (!authoringMcpToolIsAllowed(actionName, principal)) {
        throw new AuthoringApiError(
          403,
          "insufficient_scope",
          "A conta conectada não permite usar esta operação."
        );
      }
      const result = await executeAuthoringTool({
        adapter,
        principal,
        name: actionName,
        rawArguments,
        deadlineAt
      });
      const payload = {
        ok: true,
        requestId: result.requestId,
        data: result.data ?? null
      };
      if (encodedSize(JSON.stringify(payload)) >= ACTION_RESPONSE_LIMIT) {
        throw new AuthoringApiError(
          413,
          "action_response_too_large",
          "Leia outline ou uma entidade menor, sem descendentes, em vez do documento completo."
        );
      }
      return jsonResponse(200, payload, cors);
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const headers = { ...cors };
      if (normalized.status === 401) {
        headers["WWW-Authenticate"] = "Bearer";
      }
      if (normalized.status === 429) headers["Retry-After"] = "60";
      return jsonResponse(
        normalized.status,
        actionFailure(normalized, requestId, { actionName, rawArguments }),
        headers
      );
    }
  };
}
