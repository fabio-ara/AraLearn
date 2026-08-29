import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import {
  AUTHORING_PROTOCOL_ID,
  AUTHORING_PROTOCOL_SCHEMA_VERSION,
  AUTHORING_PROTOCOL_V1_SCHEMA_HASH
} from "./authoringProtocolV1.js";
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  listCourseAuthoringKnowledgeResources,
  readCourseAuthoringKnowledgeResource
} from "./courseKnowledge.js";
import { executeCourseTool } from "./courseToolExecutor.js";
import {
  projectConversationalAuthoringError,
  projectConversationalAuthoringToolSuccess
} from "./conversationalAuthoringProjection.js";
import { readAuthoringOAuthAuthorization } from "./security.js";
import { toolErrorData } from "./toolErrorEnvelope.js";
import {
  authoringMcpToolDefinition,
  authoringMcpToolIsAllowed,
  authoringMcpToolsForPrincipal
} from "./courseMcpTools.js";
import {
  listCourseMcpAppResources,
  readCourseMcpAppResource
} from "./courseMcpAppResource.js";

export const ARALEARN_MCP_PROTOCOL_VERSION = "2025-11-25";
export const ARALEARN_AUTHORING_CONTRACT_HEADER = [
  AUTHORING_PROTOCOL_ID,
  `version=${AUTHORING_PROTOCOL_SCHEMA_VERSION}`,
  `hash=${AUTHORING_PROTOCOL_V1_SCHEMA_HASH}`
].join("; ");
const JSON_RPC_VERSION = "2.0";
const AUTHORING_CONTRACT_METADATA = Object.freeze({
  id: AUTHORING_PROTOCOL_ID,
  version: AUTHORING_PROTOCOL_SCHEMA_VERSION,
  hash: AUTHORING_PROTOCOL_V1_SCHEMA_HASH
});
const SERVER_INFO = Object.freeze({
  name: "aralearn-authoring",
  version: AUTHORING_PROTOCOL_SCHEMA_VERSION
});
const MCP_BODY_LIMIT = 1024 * 1024;
const MCP_RESPONSE_LIMIT = 2 * 1024 * 1024;
const WRITE_TOOLS = new Set([
  "criarCurso", "alterarCurso", "incorporarPdfComoFonte"
]);
const MCP_OAUTH_SCOPES = Object.freeze(["offline_access"]);
const BASE_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-AraLearn-Authoring-Contract": ARALEARN_AUTHORING_CONTRACT_HEADER,
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
      "X-AraLearn-Authoring-Contract": ARALEARN_AUTHORING_CONTRACT_HEADER
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

function arrayLength(value, field) {
  return Array.isArray(value?.[field]) ? value[field].length : null;
}

function firstText(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || null;
}

function appendPageSummary(parts, value) {
  const candidates = [
    ["facts", "fato nesta página", "fatos nesta página"],
    ["items", "item nesta página", "itens nesta página"],
    ["members", "variante comparável", "variantes comparáveis"],
    ["parts", "Parte", "Partes"],
    ["recentActivity", "registro de atividade recente", "registros de atividade recente"]
  ];
  const visible = candidates.find(([field]) => arrayLength(value, field) !== null);
  if (visible) {
    const count = arrayLength(value, visible[0]);
    parts.push(`${count} ${count === 1 ? visible[1] : visible[2]}.`);
  }
  if (value?.nextCursor) parts.push("Há outra página disponível para este recorte.");
}

function appendLimitations(parts, value) {
  const limitations = Array.isArray(value?.limitations)
    ? value.limitations.filter((entry) => typeof entry === "string" && entry.trim()).slice(0, 3)
    : [];
  if (limitations.length) parts.push(`Limites: ${limitations.join(" ")}`);
  const missing = Array.isArray(value?.missingData)
    ? value.missingData.filter((entry) => typeof entry === "string" && entry.trim()).slice(0, 3)
    : [];
  if (missing.length) parts.push(`Dados ausentes: ${missing.join(" ")}`);
}

function summarizeAnalytics(value) {
  const parts = ["Os fatos de pesquisa da Autoria foram lidos."];
  if (value.overview?.question) parts.push(String(value.overview.question));
  const completeSeries = Array.isArray(value.overview?.series) ? value.overview.series : [];
  const series = completeSeries.slice(0, 12);
  if (series.length) {
    const unitLabels = {
      count: "contagem",
      milliseconds: "milissegundos",
      ratio: "proporção",
      percentage: "porcentagem"
    };
    parts.push(series.map((entry) => {
      const valueText = entry?.value === null ? "dado ausente" : entry?.value;
      const unit = unitLabels[entry?.unit] || entry?.unit || "não informada";
      const denominator = entry?.denominator === null || entry?.denominator === undefined
        ? "ausente"
        : entry.denominator;
      return `${entry?.label || "Indicador"}: ${valueText} ` +
        `(unidade: ${unit}; denominador: ${denominator})`;
    }).join("; ") + ".");
  }
  if (completeSeries.length > series.length) {
    parts.push(
      `A síntese apresenta ${series.length} de ${completeSeries.length} categorias; ` +
      "As demais categorias continuam disponíveis se forem necessárias."
    );
  }
  appendPageSummary(parts, value);
  appendLimitations(parts, value);
  return parts.join(" ");
}

function exceedsMcpResponseLimit(payload) {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength > MCP_RESPONSE_LIMIT;
}

function summarizePreview(value) {
  const preview = value?.result;
  const parts = [preview?.structural?.valid
    ? "A Unidade de estudo passou pela validação estrutural e está pronta para pré-visualização."
    : "A Unidade de estudo não passou pela validação estrutural."];
  if (preview?.accessibleText) parts.push(String(preview.accessibleText));
  return parts.join(" ");
}

function summarizeComponentLibrary(value) {
  const operationLabels = {
    explore: "Exploração do catálogo",
    search: "Busca de componentes",
    inspect: "Inspeção de componentes",
    contracts: "Contrato de componente",
    validate_study_unit: "Validação de Unidade de estudo",
    audit_representation: "Auditoria da representação"
  };
  const result = value?.result || {};
  const parts = [
    "A biblioteca de componentes didáticos foi consultada.",
    `Operação: ${operationLabels[value?.operation] || "Consulta"}.`
  ];
  if (Number.isSafeInteger(result.packageCount)) {
    parts.push(`Componentes disponíveis no recorte: ${result.packageCount}.`);
  }
  const candidates = Array.isArray(result.candidates) ? result.candidates.slice(0, 8) : [];
  if (candidates.length) {
    parts.push("Candidatos: " + candidates.map((candidate) => {
      const identity = firstText(candidate?.label, candidate?.title) || "Componente";
      const fit = ({ canonical: "canônico", versatile: "versátil", substitute: "substituto" })[
        candidate?.fit
      ];
      return fit ? `${identity} (${fit})` : identity;
    }).join("; ") + ".");
  }
  const items = Array.isArray(result.items) ? result.items.slice(0, 8) : [];
  if (items.length) {
    parts.push("Itens: " + items.map((item) => {
      const identity = firstText(
        item?.profile?.label,
        item?.profile?.title
      ) || "Componente";
      return `${identity}: ${item?.status === "ok" ? "disponível" : "não encontrado"}`;
    }).join("; ") + ".");
  }
  if (typeof result.valid === "boolean") {
    parts.push(result.valid
      ? "A Unidade de estudo satisfaz os contratos estruturais."
      : "A Unidade de estudo não satisfaz os contratos estruturais.");
  }
  if (typeof result.structural?.valid === "boolean") {
    parts.push(result.structural.valid
      ? "A composição é estruturalmente válida."
      : "A composição é estruturalmente inválida.");
  }
  const overallFit = ({ canonical: "canônico", versatile: "versátil", substitute: "substituto" })[
    result.overallFit
  ];
  if (overallFit) parts.push(`Encaixe representacional: ${overallFit}.`);
  const notices = [
    ...(Array.isArray(result.errors) ? result.errors : []),
    ...(Array.isArray(result.warnings) ? result.warnings : [])
  ].filter((entry) => typeof entry === "string" && entry.trim()).slice(0, 3);
  if (notices.length) parts.push(`Observações: ${notices.join(" ")}`);
  return parts.join(" ");
}

function summarizeVariantComparison(value) {
  const parts = ["A comparação de variantes foi lida."];
  const members = Array.isArray(value?.members) ? value.members.slice(0, 8) : [];
  const referenceId = value?.differences?.referenceCourseId;
  const reference = members.find(({ courseId }) => courseId === referenceId) || members[0];
  if (reference) {
    const label = firstText(reference.label, reference.title) || "Primeira variante";
    parts.push(`Referência: ${label}.`);
  }
  if (members.length) {
    parts.push("Variantes: " + members.map((member) => {
      const label = firstText(member?.label, member?.title) || "Variante";
      const partCount = member?.materialization?.plannedPartCount;
      const unitCount = member?.materialization?.studyUnitCount;
      const partsText = Number.isSafeInteger(partCount)
        ? `${partCount} ${partCount === 1 ? "Parte" : "Partes"}`
        : "Partes: dados ausentes";
      const unitsText = Number.isSafeInteger(unitCount)
        ? `${unitCount} ${unitCount === 1 ? "Unidade" : "Unidades"}`
        : "Unidades: dados ausentes";
      return `${label}: ${partsText}; ${unitsText}`;
    }).join(". ") + ".");
  }
  const differences = value?.differences || {};
  const groups = [
    ["declared", "declaradas"],
    ["observedExpected", "observadas esperadas"],
    ["accidentalDeviations", "desvios acidentais"],
    ["factual", "diferenças factuais"],
    ["missingData", "dados ausentes"]
  ];
  parts.push("Diferenças: " + groups.map(([field, label]) =>
    `${label} ${Array.isArray(differences[field]) ? differences[field].length : 0}`
  ).join("; ") + ".");
  const explanations = groups.flatMap(([field]) => Array.isArray(differences[field])
    ? differences[field]
    : []).map(({ explanation }) => firstText(explanation))
    .filter(Boolean).slice(0, 4);
  if (explanations.length) parts.push(`Detalhes: ${explanations.join(" ")}`);
  return parts.join(" ");
}

function materializationFactLines(resultFacts) {
  const lines = [];
  for (const [field, label] of [
    ["warnings", "Avisos"],
    ["observations", "Observações"]
  ]) {
    const entries = Array.isArray(resultFacts?.[field])
      ? resultFacts[field]
          .filter((entry) => typeof entry === "string" && entry.trim())
          .slice(0, 3)
          .map((entry) => entry.trim().slice(0, 240))
      : [];
    if (entries.length) lines.push(`${label}: ${entries.join(" ")}`);
  }
  return lines;
}

function summarizeMaterialization(value) {
  const materialization = value?.materialization || {};
  const action = value.contract === "aralearn.course-authoring-materialization-change.v1"
    ? value.operation === "start"
      ? "A materialização da Parte foi iniciada."
      : value.operation === "record_step"
        ? "Uma etapa da materialização da Parte foi registrada."
        : materialization.status === "completed"
          ? "A materialização da Parte foi concluída."
          : "A materialização da Parte foi encerrada com falha."
    : "A materialização da Parte foi lida.";
  const parts = [action];
  const completed = materialization.completedStepCount;
  const failed = materialization.failedStepCount;
  const total = materialization.totalStepCount;
  if ([completed, failed, total].every(Number.isSafeInteger)) {
    parts.push(`Etapas: ${completed} de ${total} concluídas; ${failed} com falha.`);
  }
  const entities = value.entities;
  if (entities && [
    entities.createdCount,
    entities.updatedCount,
    entities.deletedCount
  ].every(Number.isSafeInteger)) {
    parts.push(
      `Entidades nesta operação: criadas ${entities.createdCount}; ` +
      `alteradas ${entities.updatedCount}; removidas ${entities.deletedCount}.`
    );
  }
  parts.push(...materializationFactLines(materialization.resultFacts));
  return parts.join(" ");
}

function summarizeMcpAnnotations(value) {
  const count = Array.isArray(value?.items)
    ? value.items.length
    : value?.annotation
      ? 1
      : 0;
  const disclosure = value?.dataDisclosure || {};
  const parts = [value?.contract === "aralearn.mcp-anchored-annotation-change.v1"
    ? "A operação de Observação foi concluída."
    : `${count} ${count === 1 ? "Observação foi lida" : "Observações foram lidas"}.`];
  parts.push(disclosure.rawObservationTextIncluded === true
    ? "Incluí o texto integral solicitado para esta triagem autoral; referências e rótulos pessoais, caminhos e links internos continuam omitidos."
    : "O recorte omite o texto integral, referências e rótulos pessoais, caminhos e links internos.");
  appendPageSummary(parts, value);
  return parts.join(" ").slice(0, 12000);
}

function summarizeToolResult(name, value) {
  if (new Set([
    "aralearn.mcp-anchored-annotation-page.v1",
    "aralearn.mcp-anchored-annotation-change.v1"
  ]).has(value?.contract)) {
    return summarizeMcpAnnotations(value);
  }
  if (new Set([
    "aralearn.course-authoring-materialization-change.v1",
    "aralearn.course-authoring-part-materialization.v1"
  ]).has(value?.contract)) {
    return summarizeMaterialization(value).slice(0, 12000);
  }
  if (value?.contract === "aralearn.course-authoring-analytics.v1") {
    return summarizeAnalytics(value).slice(0, 12000);
  }
  if (value?.contract === "aralearn.course-variant-comparison.v1") {
    return summarizeVariantComparison(value).slice(0, 12000);
  }
  if (value?.contract === "aralearn.instructional-component-library.v1" &&
      value?.operation === "preview_study_unit") {
    return summarizePreview(value).slice(0, 12000);
  }
  if (value?.contract === "aralearn.instructional-component-library.v1") {
    return summarizeComponentLibrary(value).slice(0, 12000);
  }
  const action = name === "criarCurso"
    ? "O Curso foi criado."
    : name === "alterarCurso"
      ? "A alteração foi concluída."
      : name === "incorporarPdfComoFonte"
        ? "O documento foi mantido entre as Fontes do Curso."
      : name === "consultarComponentesDidaticos"
        ? "A biblioteca de componentes didáticos foi consultada."
        : "A leitura foi concluída.";
  const parts = [action];
  const title = firstText(value?.course?.title, value?.title, value?.source?.title);
  if (title) parts.push(`Escopo: ${title}.`);
  appendPageSummary(parts, value);
  appendLimitations(parts, value);
  const warning = firstText(value?.warning, value?.summary?.warning);
  if (warning) parts.push(`Atenção: ${warning}`);
  if (value?.dataDisclosure?.purpose === "author_audit_context") {
    parts.push(value.dataDisclosure.rawObservationTextIncluded === true
      ? "Incluí os textos das Observações selecionadas para esta auditoria autoral; referências e rótulos pessoais, caminhos e links internos continuam omitidos."
      : "O contexto omite os textos das Observações, referências e rótulos pessoais, caminhos e links internos.");
  }
  return parts.join(" ").slice(0, 12000);
}

function toolSuccess(requestId, name, value, rawArguments = {}) {
  const envelope = { ok: true, requestId, data: value ?? null };
  const conversation = projectConversationalAuthoringToolSuccess({
    envelope,
    toolName: name,
    rawArguments,
    summary: { outcome: summarizeToolResult(name, value) }
  });
  const text = conversation.action?.label
    ? `${conversation.message} ${conversation.action.label}.`
    : conversation.message;
  return {
    content: [{
      type: "text",
      text
    }],
    structuredContent: envelope,
    isError: false
  };
}

function toolFailure(
  requestId,
  error,
  challenge = null,
  failure = {}
) {
  const normalized = asAuthoringApiError(error);
  const publicError = toolErrorData(normalized, { requestId });
  if (failure.writeState === "complete") {
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
  const structuredContent = {
    ok: false,
    requestId,
    error: publicError
  };
  const conversation = projectConversationalAuthoringError({
    envelope: structuredContent,
    failure
  });
  return {
    content: [{ type: "text", text: conversation.message }],
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
  deadlineAt,
  onRequestIdValidated
}) {
  const result = await executeCourseTool({
    adapter,
    principal,
    name,
    rawArguments,
    deadlineAt,
    onRequestIdValidated
  });
  return toolSuccess(result.requestId, name, result.data, rawArguments);
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
        _meta: { authoringContract: AUTHORING_CONTRACT_METADATA }
      }
    };
  }
  if (method === "ping") {
    return { jsonrpc: JSON_RPC_VERSION, id, result: {} };
  }
  if (method === "tools/list") {
    const unknown = Object.keys(params).find((field) => field !== "cursor");
    if (unknown) {
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
        tools: authoringMcpToolsForPrincipal(context.principal),
        _meta: { authoringContract: AUTHORING_CONTRACT_METADATA }
      }
    };
  }
  if (method === "resources/list") {
    const unknown = Object.keys(params).find((field) => field !== "cursor");
    if (unknown || params.cursor != null) {
      return jsonRpcError(id, -32602, "A lista de conhecimentos não usa parâmetros.");
    }
    return {
      jsonrpc: JSON_RPC_VERSION,
      id,
      result: {
        resources: [
          ...listCourseAuthoringKnowledgeResources(),
          ...listCourseMcpAppResources()
        ]
      }
    };
  }
  if (method === "resources/read") {
    if (typeof params.uri !== "string" || Object.keys(params).some((field) => field !== "uri")) {
      return jsonRpcError(id, -32602, "resources/read exige somente uri.");
    }
    const resource = readCourseAuthoringKnowledgeResource(params.uri) ||
      readCourseMcpAppResource(params.uri);
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
    if (!authoringMcpToolDefinition(params.name)) {
      return jsonRpcError(id, -32602, "Ferramenta de autoria inexistente.");
    }
    const rawArguments = params.arguments ?? {};
    if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
      return jsonRpcError(id, -32602, "tools/call exige arguments como objeto.");
    }
    if (!authoringMcpToolIsAllowed(
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
        result: toolFailure(null, denied, context.oauthChallenge)
      };
    }
    let requestId = null;
    try {
      const result = await executeTool({
        ...context,
        name: params.name,
        rawArguments,
        deadlineAt: Date.now() + 40_000,
        onRequestIdValidated(value) {
          requestId = value;
        }
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
          requestId,
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
        result: toolFailure(requestId, normalized, challenge)
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
