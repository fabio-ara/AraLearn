import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { createAuthoringActionOAuthHandler } from "./actionOAuthServer.js";
import {
  corsHeaders,
  preflightHeaders,
  readAuthoringOAuthAuthorization,
  sha256Hex
} from "./security.js";
import { authoringMcpToolDefinition, authoringMcpToolIsAllowed } from "./courseMcpTools.js";
import { executeCourseTool } from "./courseToolExecutor.js";
import { toolErrorData } from "./toolErrorEnvelope.js";

const BODY_LIMIT = 96 * 1024;
const RESPONSE_LIMIT = 96 * 1024;
const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function routeFromPath(pathname) {
  const segments = String(pathname || "")
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const slugIndex = segments.lastIndexOf("aralearn-authoring-action");
  return slugIndex >= 0 ? segments.slice(slugIndex + 1) : segments;
}

async function readBody(request) {
  if (!String(request.headers.get("content-type") || "").toLowerCase()
    .startsWith("application/json")) {
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
    if (total > BODY_LIMIT) {
      await reader.cancel();
      throw new AuthoringApiError(
        413,
        "action_payload_too_large",
        "Divida a operação em alterações menores."
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
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
  if (!adapter) throw new TypeError("A Action exige um adaptador de Curso.");
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("A Action exige origens exatas.");
  }
  const handleOAuth = createAuthoringActionOAuthHandler({ adapter, actionBaseUrl, publicAppUrl });

  return async function handleAction(request) {
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
      if (route[0] === "oauth") return handleOAuth(request, route, cors);
      if (request.method !== "POST") {
        throw new AuthoringApiError(405, "method_not_allowed", "A Action aceita somente POST.");
      }
      actionName = route.length === 1 ? route[0] : "";
      if (!authoringMcpToolDefinition(actionName)) {
        throw new AuthoringApiError(404, "unknown_action", "Operação de Curso inexistente.");
      }
      rawArguments = await readBody(request);
      requestId = rawArguments.requestId ?? null;
      const authentication = readAuthoringOAuthAuthorization(request);
      const deadlineAt = Date.now() + 40_000;
      const principal = await adapter.resolveActionPrincipal(
        await sha256Hex(authentication.credential),
        { deadlineAt }
      );
      if (!authoringMcpToolIsAllowed(actionName, principal)) {
        throw new AuthoringApiError(
          403,
          "insufficient_scope",
          "A conta conectada não permite esta operação."
        );
      }
      const result = await executeCourseTool({
        adapter,
        principal,
        name: actionName,
        rawArguments,
        deadlineAt,
        surface: "mcp",
        projectionRecipient: "connected_actions_gpt",
        onRequestIdValidated(value) {
          requestId = value;
        }
      });
      const payload = { ok: true, requestId: result.requestId, data: result.data ?? null };
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength >= RESPONSE_LIMIT) {
        throw new AuthoringApiError(
          413,
          "action_response_too_large",
          "Leia uma parcela menor do Curso."
        );
      }
      return jsonResponse(200, payload, cors);
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const headers = { ...cors };
      if (normalized.status === 401) headers["WWW-Authenticate"] = "Bearer";
      if (normalized.status === 429) headers["Retry-After"] = "60";
      if (normalized.status === 405) headers.Allow = "POST, OPTIONS";
      return jsonResponse(normalized.status, {
        ok: false,
        requestId,
        error: toolErrorData(normalized, { toolName: actionName, rawArguments, requestId })
      }, headers);
    }
  };
}
