import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { corsHeaders, preflightHeaders, readAuthoringOAuthAuthorization } from "./security.js";
import {
  authoringApplicationToolDefinition,
  authoringApplicationToolIsAllowed
} from "./courseMcpTools.js";
import { executeCourseTool } from "./courseToolExecutor.js";
import { toolErrorData } from "./toolErrorEnvelope.js";

const BODY_LIMIT = 512 * 1024;
const RESPONSE_LIMIT = 2 * 1024 * 1024;
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

function actionNameFromPath(pathname) {
  const segments = String(pathname || "")
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const slugIndex = segments.lastIndexOf("aralearn-course-api");
  const route = slugIndex >= 0 ? segments.slice(slugIndex + 1) : segments;
  if (route.length !== 2 || route[0] !== "app") {
    throw new AuthoringApiError(404, "not_found", "Endpoint do aplicativo inexistente.");
  }
  return route[1];
}

async function readBody(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new AuthoringApiError(415, "unsupported_media_type", "A operação exige application/json.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT) {
    throw new AuthoringApiError(413, "payload_too_large", "A alteração excede o limite aceito.");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém objeto JSON válido.");
  }
  const decoder = new TextDecoder();
  let source = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) {
      await reader.cancel();
      throw new AuthoringApiError(413, "payload_too_large", "A alteração excede o limite aceito.");
    }
    source += decoder.decode(value, { stream: true });
  }
  source += decoder.decode();
  try {
    const body = source ? JSON.parse(source) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém objeto JSON válido.");
  }
}

/**
 * @param {{
 *   adapter?: import("./courseSupabaseAdapter.js").CourseSupabaseAdapter,
 *   allowedOrigins?: Set<string>
 * }} [options]
 */
export function createCourseApiHandler({ adapter, allowedOrigins = new Set() } = {}) {
  if (!adapter) throw new TypeError("A borda do aplicativo exige um adaptador de Curso.");
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("A borda do aplicativo exige origens exatas.");
  }
  return async function handleCourseAction(request) {
    let cors = { Vary: "Origin" };
    let requestId = null;
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: preflightHeaders(request, allowedOrigins)
        });
      }
      cors = corsHeaders(request, allowedOrigins);
      if (request.method !== "POST") {
        return jsonResponse(405, {
          ok: false,
          requestId: null,
          error: { code: "method_not_allowed", message: "A operação aceita somente POST." }
        }, { ...cors, Allow: "POST, OPTIONS" });
      }
      const actionName = actionNameFromPath(new URL(request.url).pathname);
      if (!authoringApplicationToolDefinition(actionName)) {
        throw new AuthoringApiError(404, "unknown_action", "Operação de Curso inexistente.");
      }
      const authentication = readAuthoringOAuthAuthorization(request);
      const deadlineAt = Date.now() + 40_000;
      const principal = await adapter.resolveApplicationPrincipal(
        authentication.credential,
        { deadlineAt }
      );
      if (!authoringApplicationToolIsAllowed(actionName, principal)) {
        throw new AuthoringApiError(403, "insufficient_scope", "A sessão não permite esta operação.");
      }
      const rawArguments = await readBody(request);
      requestId = rawArguments.requestId ?? null;
      const result = await executeCourseTool({
        adapter,
        principal,
        name: actionName,
        rawArguments,
        deadlineAt,
        surface: "application"
      });
      const payload = { ok: true, requestId: result.requestId, data: result.data ?? null };
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > RESPONSE_LIMIT) {
        throw new AuthoringApiError(413, "response_too_large", "Leia uma parcela menor do Curso.");
      }
      return jsonResponse(200, payload, cors);
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const headers = { ...cors };
      if (normalized.status === 401) headers["WWW-Authenticate"] = "Bearer";
      if (normalized.status === 429) headers["Retry-After"] = "60";
      return jsonResponse(normalized.status, {
        ok: false,
        requestId,
        error: toolErrorData(normalized, { requestId })
      }, headers);
    }
  };
}
