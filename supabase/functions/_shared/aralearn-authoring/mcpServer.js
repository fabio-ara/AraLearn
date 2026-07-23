import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { routeRequest } from "./protocol.js";
import { executeAuthoringRoute } from "./router.js";
import { readAuthorization } from "./security.js";
import {
  authoringMcpToolDefinition,
  authoringMcpToolIsAllowed,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "./mcpTools.js";

export const ARALEARN_MCP_PROTOCOL_VERSION = "2025-11-25";
const MAX_MCP_BODY_BYTES = 128 * 1024;
const JSON_RPC_VERSION = "2.0";
const SERVER_INFO = Object.freeze({ name: "aralearn-authoring", version: "0.0.9" });
const BASE_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
  Vary: "Origin"
});

function jsonRpcResponse(status, payload, headers = {}) {
  return new Response(payload == null ? null : JSON.stringify(payload), {
    status,
    headers: { ...BASE_HEADERS, ...headers }
  });
}

function jsonRpcError(id, code, message, data = undefined) {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function safeErrorData(error) {
  const normalized = asAuthoringApiError(error);
  return {
    code: normalized.code,
    message: normalized.message,
    ...(normalized.details === undefined ? {} : { details: normalized.details })
  };
}

function mcpPath(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/u, "") || "/";
  return new Set([
    "/",
    "/aralearn-authoring-mcp",
    "/functions/v1/aralearn-authoring-mcp"
  ]).has(normalized);
}

function normalizedOrigin(request) {
  return String(request.headers.get("origin") || "").trim().replace(/\/+$/u, "");
}

function validatedOriginHeaders(request, allowedOrigins, { required = false } = {}) {
  const origin = normalizedOrigin(request);
  if (!origin) {
    if (required) {
      throw new AuthoringApiError(403, "origin_not_allowed", "A requisição do navegador não informou Origin.");
    }
    return { Vary: "Origin" };
  }
  if (!allowedOrigins.has(origin)) {
    throw new AuthoringApiError(403, "origin_not_allowed", "Origem não autorizada.");
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin"
  };
}

function preflightResponse(request, allowedOrigins) {
  const cors = validatedOriginHeaders(request, allowedOrigins, { required: true });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": [
        "Authorization",
        "Content-Type",
        "MCP-Protocol-Version",
        "X-AraLearn-API-Key"
      ].join(", "),
      "Access-Control-Max-Age": "600",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function assertTransportHeaders(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new AuthoringApiError(415, "unsupported_media_type", "O transporte MCP exige application/json.");
  }
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    throw new AuthoringApiError(
      406,
      "unsupported_accept",
      "O cliente MCP deve aceitar application/json e text/event-stream."
    );
  }
}

async function readMcpEnvelope(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_MCP_BODY_BYTES) {
    throw new AuthoringApiError(413, "payload_too_large", "A mensagem MCP excede o limite permitido.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthoringApiError(400, "invalid_json_rpc", "A mensagem JSON-RPC é obrigatória.");
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MCP_BODY_BYTES) {
      await reader.cancel("payload_too_large").catch(() => null);
      throw new AuthoringApiError(413, "payload_too_large", "A mensagem MCP excede o limite permitido.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let envelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AuthoringApiError(400, "parse_error", "A mensagem não contém JSON válido.");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new AuthoringApiError(400, "invalid_json_rpc", "A mensagem JSON-RPC deve formar um objeto.");
  }
  if (envelope.jsonrpc !== JSON_RPC_VERSION || typeof envelope.method !== "string") {
    throw new AuthoringApiError(400, "invalid_json_rpc", "A mensagem JSON-RPC é inválida.");
  }
  if (Object.hasOwn(envelope, "id")
      && typeof envelope.id !== "string"
      && typeof envelope.id !== "number") {
    throw new AuthoringApiError(400, "invalid_json_rpc", "O id JSON-RPC deve ser texto ou número.");
  }
  if (Object.hasOwn(envelope, "params")
      && (!envelope.params || typeof envelope.params !== "object" || Array.isArray(envelope.params))) {
    throw new AuthoringApiError(400, "invalid_json_rpc", "params deve formar um objeto.");
  }
  return envelope;
}

function assertProtocolHeader(request, method) {
  if (method === "initialize") return;
  const version = String(request.headers.get("mcp-protocol-version") || "").trim();
  if (version !== ARALEARN_MCP_PROTOCOL_VERSION) {
    throw new AuthoringApiError(
      400,
      "unsupported_protocol_version",
      `Use MCP-Protocol-Version: ${ARALEARN_MCP_PROTOCOL_VERSION}.`
    );
  }
}

function toolSuccess(requestId, value) {
  const structuredContent = { ok: true, requestId, data: value ?? null };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: false
  };
}

function toolFailure(requestId, error) {
  const normalized = asAuthoringApiError(error);
  const structuredContent = {
    ok: false,
    requestId,
    error: safeErrorData(normalized)
  };
  return {
    content: [{ type: "text", text: `${normalized.code}: ${normalized.message}` }],
    structuredContent,
    isError: true
  };
}

async function executeTool({
  adapter,
  principal,
  receiptSecret,
  receiptClock,
  name,
  rawArguments,
  deadlineAt
}) {
  const operation = mapAuthoringMcpToolCall(name, rawArguments);
  const headers = new Headers({
    "Idempotency-Key": operation.requestId,
    "Content-Type": "application/json"
  });
  const request = new Request(`https://aralearn.invalid${operation.path}`, {
    method: operation.method,
    headers,
    ...(operation.body == null ? {} : { body: JSON.stringify(operation.body) })
  });
  const route = routeRequest(operation.method, new URL(request.url).pathname);
  const result = await executeAuthoringRoute({
    request,
    route,
    adapter,
    principal,
    deadlineAt,
    receiptSecret,
    receiptClock
  });
  return toolSuccess(operation.requestId, result.data);
}

async function dispatchMcpRequest(envelope, context) {
  const { method, params = {}, id } = envelope;
  if (!Object.hasOwn(envelope, "id")) {
    if (method === "notifications/initialized" || method.startsWith("notifications/")) {
      return null;
    }
    throw new AuthoringApiError(400, "invalid_json_rpc", "Uma requisição JSON-RPC deve informar id.");
  }
  if (method === "initialize") {
    const clientInfo = params.clientInfo;
    if (typeof params.protocolVersion !== "string"
        || !params.capabilities || typeof params.capabilities !== "object"
        || Array.isArray(params.capabilities)
        || !clientInfo || typeof clientInfo !== "object" || Array.isArray(clientInfo)
        || typeof clientInfo.name !== "string" || !clientInfo.name.trim()
        || typeof clientInfo.version !== "string" || !clientInfo.version.trim()) {
      return jsonRpcError(
        id,
        -32602,
        "initialize exige protocolVersion, capabilities e clientInfo válidos."
      );
    }
    return {
      jsonrpc: JSON_RPC_VERSION,
      id,
      result: {
        protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Use a próxima ação persistida pela execução e repita requestId apenas para a mesma operação."
      }
    };
  }
  if (method === "ping") {
    return { jsonrpc: JSON_RPC_VERSION, id, result: {} };
  }
  if (method === "tools/list") {
    const unknown = Object.keys(params).find((field) => field !== "cursor");
    if (unknown) {
      return jsonRpcError(id, -32602, "Parâmetros inválidos para tools/list.", { field: unknown });
    }
    if (params.cursor != null) {
      return jsonRpcError(id, -32602, "A lista de ferramentas não usa paginação.", {
        field: "cursor"
      });
    }
    return {
      jsonrpc: JSON_RPC_VERSION,
      id,
      result: { tools: authoringMcpToolsForPrincipal(context.principal) }
    };
  }
  if (method === "tools/call") {
    if (typeof params.name !== "string") {
      return jsonRpcError(id, -32602, "tools/call exige o nome da ferramenta.");
    }
    if (!authoringMcpToolDefinition(params.name)) {
      return jsonRpcError(id, -32602, "Ferramenta de autoria inexistente.", { name: params.name });
    }
    if (!authoringMcpToolIsAllowed(params.name, context.principal)) {
      throw new AuthoringApiError(
        403,
        "insufficient_scope",
        "A credencial não permite usar esta ferramenta."
      );
    }
    if (!params.arguments || typeof params.arguments !== "object" || Array.isArray(params.arguments)) {
      return jsonRpcError(id, -32602, "tools/call exige arguments como objeto.");
    }
    const requestId = params.arguments?.requestId ?? null;
    try {
      const result = await executeTool({
        ...context,
        name: params.name,
        rawArguments: params.arguments,
        deadlineAt: Date.now() + 40_000
      });
      return { jsonrpc: JSON_RPC_VERSION, id, result };
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      if (new Set([401, 403, 429]).has(normalized.status)) throw normalized;
      return { jsonrpc: JSON_RPC_VERSION, id, result: toolFailure(requestId, normalized) };
    }
  }
  return jsonRpcError(id, -32601, "Método JSON-RPC inexistente.", { method });
}

function transportErrorResponse(error, cors = {}) {
  const normalized = asAuthoringApiError(error);
  const rpcCode = normalized.code === "parse_error" ? -32700 : -32600;
  const headers = { ...cors };
  if (normalized.status === 401) {
    headers["WWW-Authenticate"] = 'Bearer realm="AraLearn authoring MCP"';
  }
  if (normalized.status === 429) headers["Retry-After"] = "60";
  return jsonRpcResponse(
    normalized.status,
    jsonRpcError(null, rpcCode, normalized.message, { code: normalized.code }),
    headers
  );
}

export function createAuthoringMcpHandler({
  adapter,
  allowedOrigins = new Set(),
  receiptSecret = adapter?.receiptSecret || adapter?.serverApiKey,
  receiptClock = () => Date.now()
}) {
  if (!adapter) throw new TypeError("O gateway MCP exige um adaptador de autoria.");
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("O gateway MCP exige origens exatas e não aceita origem curinga.");
  }
  return async function handleAuthoringMcpRequest(request) {
    let cors = {};
    try {
      const url = new URL(request.url);
      if (!mcpPath(url.pathname)) {
        throw new AuthoringApiError(404, "not_found", "Endpoint MCP inexistente.");
      }
      if (request.method === "OPTIONS") return preflightResponse(request, allowedOrigins);
      cors = validatedOriginHeaders(request, allowedOrigins);
      if (request.method !== "POST") {
        return jsonRpcResponse(
          405,
          jsonRpcError(null, -32600, "O transporte MCP aceita somente POST."),
          { ...cors, Allow: "POST, OPTIONS" }
        );
      }
      assertTransportHeaders(request);
      const authentication = readAuthorization(request);
      if (authentication.kind !== "api_key") {
        throw new AuthoringApiError(401, "api_key_required", "O gateway MCP exige uma chave arl_.");
      }
      const principal = await adapter.resolvePrincipal(authentication, { deadlineAt: Date.now() + 40_000 });
      if (principal?.authenticationKind !== "api_key" || !principal?.actorId) {
        throw new AuthoringApiError(401, "invalid_client", "Cliente de autoria inválido ou revogado.");
      }
      const envelope = await readMcpEnvelope(request);
      assertProtocolHeader(request, envelope.method);
      const payload = await dispatchMcpRequest(envelope, {
        adapter,
        principal,
        receiptSecret,
        receiptClock
      });
      if (payload == null) return new Response(null, { status: 202, headers: { ...cors, Vary: "Origin" } });
      return jsonRpcResponse(200, payload, cors);
    } catch (error) {
      return transportErrorResponse(error, cors);
    }
  };
}
