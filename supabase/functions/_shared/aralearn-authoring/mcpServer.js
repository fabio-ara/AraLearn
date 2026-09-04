import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  listCourseAuthoringKnowledgeResources,
  readCourseAuthoringKnowledgeResource
} from "./courseKnowledge.js";
import { readAuthoringOAuthAuthorization } from "./security.js";
import {
  COURSE_HUMAN_TASKS,
  COURSE_HUMAN_TASK_CATALOG_HEADER,
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  courseHumanTaskDefinition,
  courseHumanTaskIsAllowed,
  courseHumanTasksForPrincipal,
  executeHumanCourseTask
} from "./courseHumanTasks.js";

export const ARALEARN_MCP_PROTOCOL_VERSION = "2025-11-25";
export const ARALEARN_AUTHORING_CONTRACT_HEADER = COURSE_HUMAN_TASK_CATALOG_HEADER;
const JSON_RPC_VERSION = "2.0";
const SERVER_INFO = Object.freeze({
  name: "aralearn-authoring",
  version: COURSE_HUMAN_TASK_CATALOG_METADATA.version
});
const MCP_BODY_LIMIT = 1024 * 1024;
const MCP_RESPONSE_LIMIT = 2 * 1024 * 1024;
const WRITE_TOOLS = new Set(COURSE_HUMAN_TASKS
  .filter(({ annotations }) => annotations.readOnlyHint !== true)
  .map(({ name }) => name));
const MCP_OAUTH_SCOPES = Object.freeze(["offline_access"]);
const BASE_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-AraLearn-Authoring-Contract": ARALEARN_AUTHORING_CONTRACT_HEADER,
  "X-AraLearn-Authoring-Mcp-Catalog": COURSE_HUMAN_TASK_CATALOG_HEADER,
  "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
  Vary: "Origin"
});

function jsonRpcResponse(status, payload, headers = {}) {
  const body = payload == null ? null : JSON.stringify(payload);
  if (body != null && new TextEncoder().encode(body).byteLength > MCP_RESPONSE_LIMIT) {
    throw new AuthoringApiError(
      413,
      "mcp_response_too_large",
      "A resposta MCP excede o limite de 2 MiB; reduza a página solicitada."
    );
  }
  return new Response(body, {
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

function mcpPath(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/u, "") || "/";
  return new Set([
    "/",
    "/aralearn-authoring-mcp",
    "/functions/v1/aralearn-authoring-mcp"
  ]).has(normalized);
}

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/u, "");
}

function metadataPath(resourceUrl) {
  return `${normalizeEndpoint(resourceUrl)}/.well-known/oauth-protected-resource`;
}

function oauthChallenge(resourceUrl, {
  error = null,
  description = null
} = {}) {
  const fields = [
    `resource_metadata="${metadataPath(resourceUrl)}"`,
    `scope="${MCP_OAUTH_SCOPES.join(" ")}"`
  ];
  if (error) fields.push(`error="${String(error).replaceAll('"', "")}"`);
  if (description) {
    fields.push(`error_description="${String(description).replaceAll('"', "'").slice(0, 300)}"`);
  }
  return `Bearer ${fields.join(", ")}`;
}

function protectedResourceMetadata(resourceUrl, authorizationServer) {
  return {
    resource: normalizeEndpoint(resourceUrl),
    authorization_servers: [normalizeEndpoint(authorizationServer)],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"]
  };
}

function metadataResponse(resourceUrl, authorizationServer, headers = {}) {
  return new Response(JSON.stringify(protectedResourceMetadata(resourceUrl, authorizationServer)), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-AraLearn-Authoring-Contract": ARALEARN_AUTHORING_CONTRACT_HEADER,
      "X-AraLearn-Authoring-Mcp-Catalog": COURSE_HUMAN_TASK_CATALOG_HEADER,
      ...headers
    }
  });
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": [
        "Authorization",
        "Content-Type",
        "MCP-Protocol-Version"
      ].join(", "),
      "Access-Control-Max-Age": "600",
      "X-Content-Type-Options": "nosniff",
      "X-AraLearn-Authoring-Contract": ARALEARN_AUTHORING_CONTRACT_HEADER,
      "X-AraLearn-Authoring-Mcp-Catalog": COURSE_HUMAN_TASK_CATALOG_HEADER
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
  const reader = request.body?.getReader();
  if (!reader) throw new AuthoringApiError(400, "invalid_json_rpc", "A mensagem JSON-RPC é obrigatória.");
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MCP_BODY_LIMIT) {
      await reader.cancel();
      throw new AuthoringApiError(
        413,
        "mcp_message_too_large",
        "A mensagem MCP excede o limite de 1 MiB."
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

function exceedsMcpResponseLimit(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength > MCP_RESPONSE_LIMIT;
}

function toolSuccess(value) {
  const summary = typeof value?.result === "string"
    ? value.result.slice(0, 4000)
    : "A tarefa foi concluída.";
  const text = [
    summary,
    value?.deepLink ? `[Abrir no AraLearn](${value.deepLink})` : null,
    value?.nextDecision ?? null
  ].filter(Boolean).join(" ");
  return {
    content: [{ type: "text", text }],
    structuredContent: value,
    isError: false
  };
}

function toolFailure(
  error,
  challenge = null,
  failure = {}
) {
  const normalized = asAuthoringApiError(error);
  const retryable = normalized.code !== "course_source_pdf_write_uncertain" && (
    normalized.status === 408 || normalized.status === 429 ||
    normalized.status >= 500 || new Set([
      "course_service_unavailable", "request_timeout", "network_error"
    ]).has(normalized.code)
  );
  const publicError = {
    code: String(normalized.code || "human_task_failed"),
    message: String(normalized.message || "A tarefa não pôde ser concluída.").slice(0, 1000),
    retryable
  };
  let nextDecision = normalized.code === "ambiguous_human_reference"
    ? "Informe um título mais específico ou a posição humana do objeto."
    : normalized.code === "human_reference_not_found"
      ? "Confira o título ou a posição e tente novamente."
      : normalized.code === "human_task_result_too_large"
        ? "Escolha um curso, uma parte, uma microssequência ou uma unidade de estudo mais específica."
        : normalized.code === "course_source_pdf_write_uncertain"
          ? "Releia as fontes antes de decidir se ainda precisa incorporar o PDF."
          : normalized.code === "human_materialization_contextual_calibration_required"
            ? "Inclua a calibração contextual nas unidades e refaça a produção da parte."
            : retryable
              ? "Tente novamente sem mudar a intenção da tarefa."
              : null;
  if (failure.writeState === "complete") {
    publicError.message = "A escrita pode ter sido concluída, mas a resposta excedeu o limite.";
    publicError.retryable = false;
    nextDecision = "Releia o curso antes de decidir se ainda falta alguma mudança.";
  }
  const structuredContent = { error: publicError, nextDecision };
  return {
    content: [{ type: "text", text: normalized.message }],
    structuredContent,
    isError: true,
    ...(challenge
      ? { _meta: { "mcp/www_authenticate": [challenge] } }
      : {})
  };
}

async function executeTool({
  adapter,
  principal,
  name,
  rawArguments,
  deadlineAt
}) {
  const value = await executeHumanCourseTask({
    adapter,
    principal,
    name,
    rawArguments,
    deadlineAt
  });
  return toolSuccess(value);
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
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false }
        },
        serverInfo: SERVER_INFO,
        instructions: COURSE_AUTHORING_SERVER_INSTRUCTIONS,
        _meta: {
          humanTaskCatalog: COURSE_HUMAN_TASK_CATALOG_METADATA
        }
      }
    };
  }
  if (method === "ping") {
    return { jsonrpc: JSON_RPC_VERSION, id, result: {} };
  }
  if (method === "tools/list") {
    const unknown = Object.keys(params).find((field) =>
      field !== "cursor" && field !== "_meta");
    const invalidMeta = Object.hasOwn(params, "_meta") &&
      (!params._meta || typeof params._meta !== "object" || Array.isArray(params._meta));
    if (unknown || invalidMeta) {
      return jsonRpcError(id, -32602, "Parâmetros inválidos para tools/list.");
    }
    if (params.cursor != null) {
      return jsonRpcError(id, -32602, "A lista de ferramentas não usa paginação.", {
        field: "cursor"
      });
    }
    return {
      jsonrpc: JSON_RPC_VERSION,
      id,
      result: {
        tools: courseHumanTasksForPrincipal(context.principal),
        _meta: {
          humanTaskCatalog: COURSE_HUMAN_TASK_CATALOG_METADATA
        }
      }
    };
  }
  if (method === "resources/list") {
    const unknown = Object.keys(params).find((field) =>
      field !== "cursor" && field !== "_meta");
    const invalidMeta = Object.hasOwn(params, "_meta") &&
      (!params._meta || typeof params._meta !== "object" || Array.isArray(params._meta));
    if (unknown || invalidMeta || params.cursor != null) {
      return jsonRpcError(id, -32602, "A lista de conhecimentos não usa parâmetros.");
    }
    return {
      jsonrpc: JSON_RPC_VERSION,
      id,
      result: {
        resources: listCourseAuthoringKnowledgeResources()
      }
    };
  }
  if (method === "resources/read") {
    const invalidMeta = Object.hasOwn(params, "_meta") &&
      (!params._meta || typeof params._meta !== "object" || Array.isArray(params._meta));
    if (typeof params.uri !== "string" || invalidMeta ||
        Object.keys(params).some((field) => field !== "uri" && field !== "_meta")) {
      return jsonRpcError(id, -32602, "resources/read exige somente uri.");
    }
    const resource = readCourseAuthoringKnowledgeResource(params.uri);
    if (!resource) {
      return jsonRpcError(id, -32002, "Resource MCP inexistente.");
    }
    return {
      jsonrpc: JSON_RPC_VERSION,
      id,
      result: { contents: [resource] }
    };
  }
  if (method === "tools/call") {
    if (typeof params.name !== "string") {
      return jsonRpcError(id, -32602, "tools/call exige o nome da ferramenta.");
    }
    if (!courseHumanTaskDefinition(params.name)) {
      return jsonRpcError(id, -32602, "Ferramenta de autoria inexistente.");
    }
    const rawArguments = params.arguments ?? {};
    if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
      return jsonRpcError(id, -32602, "tools/call exige arguments como objeto.");
    }
    if (!courseHumanTaskIsAllowed(
      params.name,
      context.principal,
      rawArguments
    )) {
      const denied = new AuthoringApiError(
        403,
        "insufficient_scope",
        "A sessão OAuth não permite usar esta ferramenta."
      );
      return {
        jsonrpc: JSON_RPC_VERSION,
        id,
        result: toolFailure(denied, context.oauthChallenge)
      };
    }
    try {
      const result = await executeTool({
        ...context,
        name: params.name,
        rawArguments,
        deadlineAt: Date.now() + 40_000
      });
      const payload = { jsonrpc: JSON_RPC_VERSION, id, result };
      if (!exceedsMcpResponseLimit(payload)) return payload;
      const completedWrite = WRITE_TOOLS.has(params.name);
      const tooLarge = new AuthoringApiError(
        413,
        "mcp_response_too_large",
        completedWrite
          ? "A gravação foi concluída, mas a resposta excedeu o limite de 2 MiB."
          : "A resposta MCP excede o limite de 2 MiB; leia uma parcela menor."
      );
      return {
        jsonrpc: JSON_RPC_VERSION,
        id,
        result: toolFailure(
          tooLarge,
          null,
          completedWrite ? { writeState: "complete" } : {}
        )
      };
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      if (normalized.status === 429) throw normalized;
      const challenge = new Set([401, 403]).has(normalized.status)
        ? context.oauthChallenge
        : null;
      return {
        jsonrpc: JSON_RPC_VERSION,
        id,
        result: toolFailure(normalized, challenge)
      };
    }
  }
  return jsonRpcError(id, -32601, "Método JSON-RPC inexistente.");
}

function transportErrorResponse(error, cors = {}, resourceUrl = "") {
  const normalized = asAuthoringApiError(error);
  const rpcCode = normalized.code === "parse_error" ? -32700 : -32600;
  const headers = { ...cors };
  if (normalized.status === 401) {
    headers["WWW-Authenticate"] = oauthChallenge(resourceUrl, {
      error: normalized.code === "authentication_required" ? null : "invalid_token",
      description: normalized.message
    });
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
  resourceUrl = "",
  authorizationServer = adapter?.supabaseUrl
    ? `${normalizeEndpoint(adapter.supabaseUrl)}/auth/v1`
    : null
}) {
  if (!adapter) throw new TypeError("O gateway MCP exige um adaptador de autoria.");
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("O gateway MCP exige origens exatas e não aceita origem curinga.");
  }
  if (!authorizationServer) {
    throw new TypeError("O gateway MCP exige o issuer OAuth do servidor de autorização.");
  }
  return async function handleAuthoringMcpRequest(request) {
    let cors = {};
    let canonicalResource = normalizeEndpoint(resourceUrl);
    try {
      const url = new URL(request.url);
      canonicalResource ||= `${url.origin}${url.pathname
        .replace(/\/\.well-known\/oauth-protected-resource\/?$/u, "")
        .replace(/\/+$/u, "")}`;
      // A borda pode remover o prefixo /functions/v1/<slug> antes de entregar
      // a requisição. A identificação pelo sufixo mantém a rota de descoberta
      // OAuth estável sem alterar o resource canônico anunciado ao cliente.
      if (url.pathname.replace(/\/+$/u, "").endsWith("/.well-known/oauth-protected-resource")) {
        if (request.method !== "GET") {
          return jsonRpcResponse(
            405,
            jsonRpcError(null, -32600, "A metadata OAuth aceita somente GET."),
            { Allow: "GET, OPTIONS" }
          );
        }
        return metadataResponse(canonicalResource, authorizationServer);
      }
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
      const authentication = {
        ...readAuthoringOAuthAuthorization(request),
        resource: canonicalResource
      };
      const principal = await adapter.resolvePrincipal(authentication, { deadlineAt: Date.now() + 40_000 });
      if (principal?.authenticationKind !== "oauth" || !principal?.actorId) {
        throw new AuthoringApiError(401, "invalid_client", "Vínculo OAuth inválido ou revogado.");
      }
      const envelope = await readMcpEnvelope(request);
      assertProtocolHeader(request, envelope.method);
      const payload = await dispatchMcpRequest(envelope, {
        adapter,
        principal,
        oauthChallenge: oauthChallenge(canonicalResource, {
          error: "insufficient_scope",
          description: "Reconecte a conta para atualizar a autorização."
        })
      });
      if (payload == null) {
        return new Response(null, {
          status: 202,
          headers: {
            ...cors,
            "X-AraLearn-Authoring-Contract": ARALEARN_AUTHORING_CONTRACT_HEADER,
            "X-AraLearn-Authoring-Mcp-Catalog": COURSE_HUMAN_TASK_CATALOG_HEADER,
            Vary: "Origin"
          }
        });
      }
      return jsonRpcResponse(200, payload, cors);
    } catch (error) {
      return transportErrorResponse(error, cors, canonicalResource);
    }
  };
}
