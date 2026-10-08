import {
  asAuthoringApiError,
  authoringErrorClass,
  authoringErrorIsRetryable,
  AuthoringApiError,
  readDependencyDiagnostic,
  closedAuthoringRpcName
} from "./errors.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  listCourseAuthoringKnowledgeResources,
  readCourseAuthoringKnowledgeResource
} from "./courseKnowledge.js";
import { readAuthoringOAuthAuthorization } from "./security.js";
import { projectExplanationReconciliationBlockers, projectHumanWriteRecovery,
  projectHumanMaterializationPreflight } from "./toolErrorEnvelope.js";
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
const REQUEST_ID_HEADER = "X-AraLearn-Request-Id";
// Falhas rotineiras de validação (entrada) e de conflito de base não poluem o log
// de erro do serviço; indisponibilidade, escrita incerta e falha interna, sim.
const LOGGED_ERROR_CLASSES = new Set(["transitorio", "interno", "incerto"]);
// Vocabulário fechado do único evento de diagnóstico. Qualquer valor fora destes
// conjuntos vira `null` (ou o literal `unclassified` para código desconhecido), de
// modo que entrada do cliente, token, cursor, id JSON-RPC, corpo, ator ou curso
// nunca são refletidos no log.
const LOG_EVENT = "aralearn.authoring.error";
const LOG_PHASES = new Set([
  "transporte", "autenticacao", "resolucao_principal", "protocolo", "execucao"
]);
const LOG_CLASSES = new Set([
  "transitorio", "interno", "incerto", "conflito", "autorizacao", "entrada", "definitivo"
]);
const LOG_CODES = new Set([
  "temporarily_unavailable", "service_timeout", "request_timeout", "network_error",
  "course_service_unavailable", "oauth_verification_unavailable", "internal_error",
  "course_write_uncertain", "course_source_pdf_write_uncertain", "course_media_write_uncertain"
]);
const LOG_UNCLASSIFIED_CODE = "unclassified";
const LOG_TOOL_NAMES = new Set(COURSE_HUMAN_TASKS.map(({ name }) => name));
const LOG_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const LOG_MAX_DURATION_MS = 600_000;
// Motivos transitórios fechados do diagnóstico de dependência. Quem diz se a
// dependência chegou a iniciar é `attemptsStarted`, não o tempo. "deadline_exhausted"
// = orçamento já esgotado antes do fetch; "budget_abort" = tentativa abortada
// porque o orçamento global acabou; "attempt_abort" = a tentativa individual
// estourou o próprio tempo; "attempt_error" = transporte/HTTP encerrou as tentativas.
const LOG_DEPENDENCY_REASONS = new Set([
  "deadline_exhausted", "budget_abort", "attempt_abort", "attempt_error"
]);
const LOG_MAX_ATTEMPT = 16;
const AUTHENTICATION_ERROR_CODES = new Set([
  "oauth_verification_unavailable", "invalid_oauth_token", "oauth_required",
  "invalid_client", "authentication_required"
]);
const PRINCIPAL_RESOLUTION_ERROR_CODES = new Set([
  "service_timeout", "course_service_unavailable"
]);
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

function newRequestId() {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return null;
  }
}

// Correlação pública: somente identificador da requisição, fase, status e o id
// JSON-RPC. Nunca token, cursor, ator ou conteúdo do curso.
function publicDiagnostico({ requestId, fase, status }) {
  const fields = {};
  if (requestId) fields.requestId = requestId;
  if (fase) fields.fase = fase;
  if (Number.isFinite(status)) fields.status = status;
  return Object.keys(fields).length ? fields : null;
}

function transportPhase(fase, error) {
  const code = String(error?.code || "");
  if (AUTHENTICATION_ERROR_CODES.has(code)) return "autenticacao";
  if (PRINCIPAL_RESOLUTION_ERROR_CODES.has(code)) return "resolucao_principal";
  return fase || "transporte";
}

// Códigos JSON-RPC do transporte: -32700 só para parse; -32600 só para requisição
// ou protocolo inválidos; -32001 para recusa de autorização; e -32000 (faixa
// definida pelo servidor) para indisponibilidade transitória e falha interna, para
// não confundir a causa com o -32603 genérico sugerido por clientes.
function transportRpcCode(error) {
  if (error.code === "parse_error") return -32700;
  const status = Number(error.status);
  if (status === 401 || status === 403) return -32001;
  if (status === 408 || status === 429 || status >= 500) return -32000;
  if (status === 400 || status === 404 || status === 405 || status === 406 ||
      status === 413 || status === 415 || status === 422) return -32600;
  return -32000;
}

function closedLogValue(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function boundedLogMs(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= LOG_MAX_DURATION_MS ? value : null;
}

function boundedLogCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= LOG_MAX_ATTEMPT ? value : null;
}

// Projeção fechada e best-effort do diagnóstico de dependência anexado à exceção.
// Toda a leitura vive no try: um getter hostil não pode derrubar a resposta. O
// nome do RPC vem do enum compartilhado (nunca URL/payload/header/token/ator/
// curso/cursor/mensagem). Sem RPC nem motivo reconhecidos, o campo não é emitido.
function closedDependency(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rpc = closedAuthoringRpcName(value.rpc);
    const reason = closedLogValue(value.reason, LOG_DEPENDENCY_REASONS);
    if (rpc === null && reason === null) return null;
    return {
      rpc,
      reason,
      attemptsStarted: boundedLogCount(value.attemptsStarted),
      attemptsAllowed: boundedLogCount(value.attemptsAllowed),
      elapsedMs: boundedLogMs(value.elapsedMs),
      remainingMs: boundedLogMs(value.remainingMs)
    };
  } catch {
    return null;
  }
}

function logAuthoringError({ requestId, fase, status, code, classe, tool, duracaoMs, dependency } = {}) {
  if (!LOGGED_ERROR_CLASSES.has(classe)) return;
  const dependencyFields = closedDependency(dependency);
  const record = {
    event: LOG_EVENT,
    requestId: typeof requestId === "string" && LOG_REQUEST_ID.test(requestId) ? requestId : null,
    fase: closedLogValue(fase, LOG_PHASES),
    status: Number.isSafeInteger(status) && status >= 400 && status <= 599 ? status : null,
    code: closedLogValue(code, LOG_CODES) ?? LOG_UNCLASSIFIED_CODE,
    classe: closedLogValue(classe, LOG_CLASSES),
    tool: closedLogValue(tool, LOG_TOOL_NAMES),
    duracaoMs: Number.isSafeInteger(duracaoMs) && duracaoMs >= 0 && duracaoMs <= LOG_MAX_DURATION_MS
      ? duracaoMs
      : null,
    ...(dependencyFields ? { dependency: dependencyFields } : {})
  };
  try {
    console.error(JSON.stringify(record));
  } catch {
    // O log de diagnóstico nunca pode derrubar a resposta da ferramenta.
  }
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

// Única comparação da versão vigente de protocolo: serve a validação normal do
// transporte e a rota de falha transitória, sem lista paralela divergente.
function protocolHeaderIsCurrent(request) {
  return String(request.headers.get("mcp-protocol-version") || "").trim()
    === ARALEARN_MCP_PROTOCOL_VERSION;
}

function assertProtocolHeader(request, method) {
  if (method === "initialize") return;
  if (!protocolHeaderIsCurrent(request)) {
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
  id,
  error,
  challenge = null,
  failure = {},
  diagnostico = null
) {
  const normalized = asAuthoringApiError(error);
  const retryable = authoringErrorIsRetryable(normalized);
  const recovery = projectHumanWriteRecovery(normalized);
  const preflight = projectHumanMaterializationPreflight(normalized);
  const reconciliationBlockers = projectExplanationReconciliationBlockers(normalized);
  // Projeções públicas já sanitizadas: o preflight agregado e os bloqueadores da
  // reconciliação inválida chegam ao cliente no structuredContent e no texto.
  const errorDetails = {
    ...(preflight ? { preflight } : {}),
    ...(reconciliationBlockers ? { blockers: reconciliationBlockers } : {})
  };
  const uncertain = ["course_write_uncertain", "course_source_pdf_write_uncertain", "course_media_write_uncertain"].includes(normalized.code);
  const derivableMaterialization = normalized.code === "human_materialization_contextual_calibration_required";
  const publicError = {
    code: retryable
      ? "temporarily_unavailable"
      : String(normalized.code || "human_task_failed"),
    message: uncertain
      ? "O resultado desta tentativa ainda não foi confirmado. Preserve a mesma tentativa e releia o estado salvo."
      : retryable
      ? "Não consegui concluir esta etapa."
      : preflight || derivableMaterialization
        ? "Ainda há uma dependência a resolver antes desta produção."
        : String(normalized.message || "A tarefa não pôde ser concluída.").slice(0, 1000),
    retryable,
    ...(recovery ? { recovery } : {}),
    ...(Object.keys(errorDetails).length ? { details: errorDetails } : {})
  };
  let nextDecision = normalized.code === "ambiguous_human_reference"
    ? "Informe um título completo e único ou qualifique o escopo pai aceito pela ferramenta; repetir a mesma posição não distingue objetos."
    : normalized.code === "human_reference_not_found"
      ? "Confira o título ou a posição e tente novamente."
      : normalized.code === "human_task_result_too_large"
        ? "Escolha um curso, uma parte, uma microssequência ou uma unidade de estudo mais específica."
        : normalized.code === "course_source_pdf_write_uncertain"
          ? "Releia as fontes antes de decidir se ainda precisa incorporar o PDF."
          : normalized.code === "course_media_write_uncertain"
            ? "Consulte os áudios do curso antes de decidir se ainda precisa guardar o arquivo."
          : retryable
            ? "Refaça a mesma etapa em silêncio, sem mudar a intenção."
            : null;
  if (preflight || derivableMaterialization) {
    nextDecision = "Resolva autonomamente tudo que já estiver determinado pelo curso e repita a verificação. Se restar uma escolha que altere o percurso de aprendizagem, consolide as pendências relacionadas, explique ao autor o que precisa ser decidido e por que isso importa, faça uma única pergunta e, após a resposta, retome a produção original.";
  }
  if (normalized.code === "course_write_uncertain") {
    nextDecision = "Retome a mesma tentativa após reler o conteúdo e suas pendências, sem reaplicar a alteração.";
  } else if (recovery) {
    nextDecision += " Preserve a mesma tentativa durante a conferência, sem reaplicar a alteração.";
  }
  if (failure.writeState === "complete") {
    publicError.message = "A escrita pode ter sido concluída, mas a resposta excedeu o limite.";
    publicError.retryable = false;
    nextDecision = "Releia o curso antes de decidir se ainda falta alguma mudança.";
  }
  if (diagnostico) {
    const fields = publicDiagnostico({
      requestId: diagnostico.requestId,
      fase: diagnostico.fase,
      status: normalized.status
    });
    if (fields) publicError.diagnostico = fields;
    logAuthoringError({
      requestId: diagnostico.requestId,
      fase: diagnostico.fase,
      status: normalized.status,
      code: normalized.code,
      classe: authoringErrorClass(normalized),
      tool: diagnostico.tool,
      duracaoMs: Number.isFinite(diagnostico.startedAt) ? Date.now() - diagnostico.startedAt : null,
      dependency: readDependencyDiagnostic(normalized)
    });
  }
  const structuredContent = { error: publicError, nextDecision };
  // Compatibilidade reversa do MCP 2025-11-25 (tools#structured-content): o
  // structuredContent é a fonte de verdade, mas há clientes que leem apenas o
  // bloco textual e perderiam code/retryable/diagnostico/preflight/orientação.
  // O texto espelha a MESMA projeção pública já sanitizada, como JSON analisável.
  const result = {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: true,
    ...(challenge
      ? { _meta: { "mcp/www_authenticate": [challenge] } }
      : {})
  };
  // A duplicação não pode derrubar uma resposta entregável. A guarda mede o
  // envelope JSON-RPC exatamente como jsonRpcResponse o serializa — jsonrpc, id
  // e result — inclusive o id real do cliente. Quando o espelho completo o
  // excederia, o texto passa a um JSON compacto com os campos públicos
  // essenciais e o aviso explícito do limite. Nada é cortado em silêncio:
  // bloqueadores e recuperação permanecem íntegros em structuredContent.
  if (exceedsMcpResponseLimit({ jsonrpc: JSON_RPC_VERSION, id, result })) {
    result.content = [{ type: "text", text: JSON.stringify({
      error: {
        code: publicError.code,
        message: publicError.message,
        retryable: publicError.retryable,
        ...(publicError.diagnostico ? { diagnostico: publicError.diagnostico } : {})
      },
      nextDecision,
      aviso: "Erro compactado pelo limite de tamanho desta resposta; os detalhes completos de bloqueios e recuperação não cabem no texto e permanecem em structuredContent."
    }) }];
  }
  return result;
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

// Mesma regra de forma aplicada ao despacho: `arguments` ausente ou nulo vira
// objeto vazio; qualquer outro valor precisa ser objeto e não array. É forma de
// protocolo, não validação de negócio dos argumentos.
function toolArgumentsAreValid(params) {
  const rawArguments = params?.arguments ?? {};
  return Boolean(rawArguments)
    && typeof rawArguments === "object"
    && !Array.isArray(rawArguments);
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
    if (!toolArgumentsAreValid(params)) {
      return jsonRpcError(id, -32602, "tools/call exige arguments como objeto.");
    }
    const rawArguments = params.arguments ?? {};
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
        result: toolFailure(id, denied, context.oauthChallenge, {}, {
          ...context.diagnostico, fase: "execucao", tool: params.name
        })
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
          id,
          tooLarge,
          null,
          completedWrite ? { writeState: "complete" } : {},
          { ...context.diagnostico, fase: "execucao", tool: params.name }
        )
      };
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      if (normalized.status === 429) throw normalized;
      const challenge = normalized.status === 401 ||
          (normalized.status === 403 && normalized.code === "insufficient_scope")
        ? context.oauthChallenge
        : null;
      return {
        jsonrpc: JSON_RPC_VERSION,
        id,
        result: toolFailure(id, normalized, challenge, {}, {
          ...context.diagnostico, fase: "execucao", tool: params.name
        })
      };
    }
  }
  return jsonRpcError(id, -32601, "Método JSON-RPC inexistente.");
}

function transportErrorResponse(error, cors = {}, resourceUrl = "", diagnostico = {}) {
  const normalized = asAuthoringApiError(error);
  const retryable = authoringErrorIsRetryable(normalized);
  const classe = authoringErrorClass(normalized);
  const fase = transportPhase(diagnostico.fase, normalized);
  const rpcCode = transportRpcCode(normalized);
  const headers = { ...cors };
  if (diagnostico.requestId) headers[REQUEST_ID_HEADER] = diagnostico.requestId;
  if (normalized.status === 401) {
    headers["WWW-Authenticate"] = oauthChallenge(resourceUrl, {
      error: normalized.code === "authentication_required" ? null : "invalid_token",
      description: normalized.message
    });
  }
  if (normalized.status === 429) headers["Retry-After"] = "60";
  // Enquanto resolve o principal, a chamada já está bem formada no protocolo —
  // envelope com id, método tools/call, ferramenta do catálogo, arguments em
  // objeto e MCP-Protocol-Version vigente — e nenhuma ferramenta foi executada.
  // É forma de protocolo, não validação de negócio dos arguments. Uma falha
  // transitória da dependência é devolvida como falha da própria ferramenta
  // (result.isError), no mesmo envelope público de `fase=execucao`, para que
  // code, retryable e diagnostico alcancem o cliente. O HTTP 200 aqui carrega
  // apenas erro público válido — nunca sucesso de domínio — e o status original
  // da dependência permanece no diagnostico. Só este caso entra na rota: recusa
  // de credencial (401/403), limite de taxa, entrada inválida, id ausente,
  // protocolo divergente, método ou ferramenta desconhecida e falha interna
  // seguem o contrato atual. A falha transitória do JWKS chega como
  // `oauth_verification_unavailable` na mesma resolução do principal e entra pela
  // mesma rota, sem renomear o código nem o rótulo público de fase.
  const envelope = diagnostico.envelope;
  const hasJsonRpcId = diagnostico.jsonRpcId !== null && diagnostico.jsonRpcId !== undefined;
  // A rota usa a fase REAL (`diagnostico.fase`), anterior ao rótulo de transporte.
  const principalResolutionFailure = fase === "resolucao_principal"
    || (diagnostico.fase === "resolucao_principal" && normalized.code === "oauth_verification_unavailable");
  const routeAsToolFailure = retryable
    && (normalized.status === 503 || normalized.status === 408)
    && principalResolutionFailure
    && hasJsonRpcId
    && envelope?.method === "tools/call"
    && typeof envelope?.params?.name === "string"
    && courseHumanTaskDefinition(envelope.params.name) != null
    && toolArgumentsAreValid(envelope.params)
    && diagnostico.protocolHeaderCurrent === true;
  if (routeAsToolFailure) {
    return jsonRpcResponse(
      200,
      {
        jsonrpc: JSON_RPC_VERSION,
        id: diagnostico.jsonRpcId,
        result: toolFailure(diagnostico.jsonRpcId, normalized, null, {}, {
          requestId: diagnostico.requestId,
          fase,
          startedAt: diagnostico.startedAt
        })
      },
      headers
    );
  }
  const publicMessage = retryable
    ? "Não consegui concluir esta etapa."
    : normalized.message;
  const publicCode = retryable
    ? "temporarily_unavailable"
    : normalized.code;
  logAuthoringError({
    requestId: diagnostico.requestId,
    fase,
    status: normalized.status,
    code: normalized.code,
    classe,
    duracaoMs: Number.isFinite(diagnostico.startedAt) ? Date.now() - diagnostico.startedAt : null,
    dependency: readDependencyDiagnostic(normalized)
  });
  return jsonRpcResponse(
    normalized.status,
    jsonRpcError(diagnostico.jsonRpcId ?? null, rpcCode, publicMessage, {
      code: publicCode,
      retryable,
      ...(retryable
        ? { nextDecision: "Refaça a mesma etapa em silêncio, sem mudar a intenção." }
        : {}),
      ...(publicDiagnostico({
        requestId: diagnostico.requestId,
        fase,
        status: normalized.status
      }) || {})
    }),
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
    const startedAt = Date.now();
    const requestId = newRequestId();
    let cors = {};
    let canonicalResource = normalizeEndpoint(resourceUrl);
    let fase = "transporte";
    let jsonRpcId = null;
    let envelope = null;
    const withRequestId = (extra = {}) => ({
      ...extra,
      ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {})
    });
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
            withRequestId({ Allow: "GET, OPTIONS" })
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
          withRequestId({ ...cors, Allow: "POST, OPTIONS" })
        );
      }
      assertTransportHeaders(request);
      // O envelope limitado é lido antes da autenticação para preservar o id
      // JSON-RPC em falhas de auth; limite, protocolo e autorização continuam
      // sendo verificados antes de qualquer despacho.
      envelope = await readMcpEnvelope(request);
      if (Object.hasOwn(envelope, "id")) jsonRpcId = envelope.id;
      fase = "autenticacao";
      const authentication = {
        ...readAuthoringOAuthAuthorization(request),
        resource: canonicalResource
      };
      fase = "resolucao_principal";
      const principal = await adapter.resolvePrincipal(authentication, { deadlineAt: Date.now() + 40_000 });
      if (principal?.authenticationKind !== "oauth" || !principal?.actorId) {
        throw new AuthoringApiError(401, "invalid_client", "Vínculo OAuth inválido ou revogado.");
      }
      fase = "protocolo";
      assertProtocolHeader(request, envelope.method);
      fase = "execucao";
      const payload = await dispatchMcpRequest(envelope, {
        adapter,
        principal,
        oauthChallenge: oauthChallenge(canonicalResource, {
          error: "insufficient_scope",
          description: "Reconecte a conta para atualizar a autorização."
        }),
        diagnostico: { requestId, startedAt }
      });
      if (payload == null) {
        return new Response(null, {
          status: 202,
          headers: withRequestId({
            ...cors,
            "X-AraLearn-Authoring-Contract": ARALEARN_AUTHORING_CONTRACT_HEADER,
            "X-AraLearn-Authoring-Mcp-Catalog": COURSE_HUMAN_TASK_CATALOG_HEADER,
            Vary: "Origin"
          })
        });
      }
      return jsonRpcResponse(200, payload, withRequestId(cors));
    } catch (error) {
      return transportErrorResponse(error, cors, canonicalResource, {
        requestId,
        jsonRpcId,
        fase,
        startedAt,
        envelope,
        protocolHeaderCurrent: protocolHeaderIsCurrent(request)
      });
    }
  };
}
