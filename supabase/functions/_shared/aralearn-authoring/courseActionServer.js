import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH
} from "./authoringProtocolV1.js";
import {
  authoringActionV1DedicatedProjection
} from "./authoringActionProjectionV1.js";
import { createAuthoringActionOAuthHandler } from "./actionOAuthServer.js";
import {
  corsHeaders,
  preflightHeaders,
  readAuthoringOAuthAuthorization,
  sha256Hex
} from "./security.js";
import {
  authoringProtocolV1ToolDefinition,
  authoringProtocolV1ToolIsAllowed
} from "./courseMcpTools.js";
import { executeCourseTool } from "./courseToolExecutor.js";
import { toolErrorData } from "./toolErrorEnvelope.js";
import {
  projectConversationalAuthoringError,
  projectConversationalAuthoringToolSuccess
} from "./conversationalAuthoringProjection.js";

const BODY_LIMIT = 96 * 1024;
const RESPONSE_LIMIT = 96 * 1024;
export const ARALEARN_ACTION_CONTRACT_HEADER = [
  AUTHORING_PROTOCOL_ID,
  `version=${AUTHORING_PROTOCOL_SCHEMA_VERSION}`,
  `hash=${AUTHORING_PROTOCOL_V1_SCHEMA_HASH}`
].join("; ");
const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-AraLearn-Authoring-Contract": ARALEARN_ACTION_CONTRACT_HEADER
});

function actionSuccessOutcome(actionName) {
  if (actionName === "listarCursos") return "Os Cursos próprios foram localizados.";
  if (actionName === "lerCurso") return "Reli o estado atual do Curso.";
  if (actionName === "criarCurso") return "O Curso foi criado.";
  if (actionName === "consultarComponentesDidaticos") {
    return "A biblioteca de componentes didáticos foi consultada.";
  }
  return "A alteração foi gravada e validada.";
}

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function withAuthoringContractHeader(response) {
  const headers = new Headers(response.headers);
  headers.set("X-AraLearn-Authoring-Contract", ARALEARN_ACTION_CONTRACT_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
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

function validateDedicatedProjection(rawArguments, projection) {
  if (rawArguments.operation !== projection.operation ||
      rawArguments[projection.commandProperty]?.type !== projection.commandType) {
    throw new AuthoringApiError(
      422,
      "invalid_action_projection",
      "A operação não corresponde à Action solicitada."
    );
  }
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
    let completedWrite = false;
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...preflightHeaders(request, allowedOrigins),
            "X-AraLearn-Authoring-Contract": ARALEARN_ACTION_CONTRACT_HEADER
          }
        });
      }
      cors = corsHeaders(request, allowedOrigins);
      const route = routeFromPath(new URL(request.url).pathname);
      if (route[0] === "oauth") {
        return withAuthoringContractHeader(await handleOAuth(request, route, cors));
      }
      if (request.method !== "POST") {
        throw new AuthoringApiError(405, "method_not_allowed", "A Action aceita somente POST.");
      }
      const requestedActionName = route.length === 1 ? route[0] : "";
      const dedicatedProjection = authoringActionV1DedicatedProjection(requestedActionName);
      actionName = dedicatedProjection?.canonicalToolName || requestedActionName;
      if (!authoringProtocolV1ToolDefinition(actionName)) {
        throw new AuthoringApiError(404, "unknown_action", "Operação de Curso inexistente.");
      }
      rawArguments = await readBody(request);
      requestId = rawArguments.requestId ?? null;
      if (dedicatedProjection) validateDedicatedProjection(rawArguments, dedicatedProjection);
      const authentication = readAuthoringOAuthAuthorization(request);
      const deadlineAt = Date.now() + 40_000;
      const principal = await adapter.resolveActionPrincipal(
        await sha256Hex(authentication.credential),
        { deadlineAt }
      );
      if (!authoringProtocolV1ToolIsAllowed(actionName, principal)) {
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
      completedWrite = new Set(["criarCurso", "alterarCurso"]).has(actionName);
      const envelope = { ok: true, requestId: result.requestId, data: result.data ?? null };
      const payload = {
        ...envelope,
        conversation: projectConversationalAuthoringToolSuccess({
          envelope,
          toolName: actionName,
          rawArguments,
          summary: { outcome: actionSuccessOutcome(actionName) }
        })
      };
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
      const failedAfterCompletedWrite = completedWrite &&
        normalized.code === "action_response_too_large";
      const publicError = toolErrorData(
        normalized,
        { toolName: actionName, rawArguments, requestId }
      );
      if (failedAfterCompletedWrite) {
        publicError.recovery = {
          strategy: "verify_state",
          retryable: false,
          requestIdMode: "none",
          steps: [
            "Releia o estado atual antes de continuar.",
            "Não repita a escrita apenas porque a resposta excedeu o limite."
          ]
        };
      }
      const envelope = {
        ok: false,
        requestId,
        error: publicError
      };
      return jsonResponse(normalized.status, {
        ...envelope,
        conversation: projectConversationalAuthoringError({
          envelope,
          failure: failedAfterCompletedWrite ? { writeState: "complete" } : {}
        })
      }, headers);
    }
  };
}
