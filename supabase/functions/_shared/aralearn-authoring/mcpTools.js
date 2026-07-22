import { AuthoringApiError } from "./errors.js";
import { validateRequestId, validateRunId } from "./protocol.js";

const REQUEST_ID = Object.freeze({
  type: "string",
  minLength: 8,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
  description: "Identificador estável desta operação. Repita-o somente com os mesmos dados."
});
const RUN_ID = Object.freeze({
  type: "string",
  format: "uuid",
  description: "Identificador da execução de autoria."
});
const PART_KEY = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
  description: "Identificador da parte no plano."
});
const SHA256 = Object.freeze({ type: "string", pattern: "^[a-f0-9]{64}$" });

function objectSchema(required, properties) {
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    required,
    properties
  });
}

function writeSchema(required, properties) {
  return objectSchema(["requestId", ...required], { requestId: REQUEST_ID, ...properties });
}

function tool(name, title, description, inputSchema, annotations = {}) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema,
    annotations: Object.freeze({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      ...annotations
    })
  });
}

export const AUTHORING_MCP_TOOLS = Object.freeze([
  tool(
    "listarExecucoesDeAutoria",
    "Listar execuções",
    "Lista somente as execuções que a chave atual pode consultar, com paginação estável.",
    writeSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      beforeUpdatedAt: { type: "string", format: "date-time" },
      beforeRunId: RUN_ID
    }),
    { readOnlyHint: true }
  ),
  tool(
    "criarExecucaoDeAutoria",
    "Criar execução",
    "Inicia uma produção em partes no destino privado ou no catálogo, conforme os escopos da chave.",
    writeSchema(["target", "title", "contractKey", "brief", "publicationIntent"], {
      target: { type: "string", enum: ["private", "catalog"] },
      collectionId: { type: ["string", "null"], format: "uuid" },
      title: { type: "string", minLength: 1, maxLength: 300 },
      contractKey: { type: "string", minLength: 1, maxLength: 240 },
      brief: { type: "object", additionalProperties: true },
      publicationIntent: { type: "object", additionalProperties: true }
    })
  ),
  tool(
    "consultarExecucaoDeAutoria",
    "Consultar execução",
    "Lê o estado persistido, a próxima ação e o resumo das partes autorizadas.",
    writeSchema(["runId"], { runId: RUN_ID }),
    { readOnlyHint: true }
  ),
  tool(
    "gravarPlanoDeAutoria",
    "Gravar plano",
    "Valida e grava o plano completo da execução antes da produção das partes.",
    writeSchema(["runId", "plan"], {
      runId: RUN_ID,
      plan: { type: "object", additionalProperties: true }
    })
  ),
  tool(
    "gravarTrechoDoRegistro",
    "Gravar trecho do registro",
    "Grava um trecho idempotente de fontes, afirmações ou termos declarado no plano.",
    writeSchema(["runId", "planHash", "section", "position", "items"], {
      runId: RUN_ID,
      planHash: SHA256,
      section: { type: "string", enum: ["sources", "claims", "terms"] },
      position: { type: "integer", minimum: 0, maximum: 999 },
      items: { type: "array", minItems: 1, items: { type: "object", additionalProperties: true } }
    })
  ),
  tool(
    "finalizarPlanoDeAutoria",
    "Finalizar plano",
    "Confere o registro declarado e libera a primeira parte do plano.",
    writeSchema(["runId", "planHash"], { runId: RUN_ID, planHash: SHA256 })
  ),
  tool(
    "consultarProximaParte",
    "Consultar próxima parte",
    "Obtém a única parte liberada e o contexto necessário para produzi-la.",
    writeSchema(["runId"], { runId: RUN_ID }),
    { readOnlyHint: true }
  ),
  tool(
    "gravarEspecificacaoDaParte",
    "Gravar especificação da parte",
    "Valida e grava a especificação da parte atualmente liberada.",
    writeSchema(["runId", "partKey", "planHash", "specification"], {
      runId: RUN_ID,
      partKey: PART_KEY,
      planHash: SHA256,
      specification: { type: "object", additionalProperties: true }
    })
  ),
  tool(
    "gravarParteDoCurso",
    "Gravar parte",
    "Submete o fragmento produzido para revisão sem publicar conteúdo parcial.",
    writeSchema([
      "artifact", "version", "runId", "partKey", "mode", "attempt", "baseLedgerSha256",
      "fragment", "stateDelta"
    ], {
      artifact: { type: "string", const: "aralearn.part-submission" },
      version: { type: "integer", const: 1 },
      runId: RUN_ID,
      partKey: PART_KEY,
      mode: { type: "string", enum: ["build", "repair", "rebuild"] },
      attempt: { type: "integer", minimum: 1 },
      baseLedgerSha256: SHA256,
      fragment: { type: "object", additionalProperties: true },
      evidence: { type: "array", maxItems: 200, items: { type: "object", additionalProperties: true } },
      stateDelta: { type: "object", additionalProperties: true }
    })
  ),
  tool(
    "consultarEntregaDaParte",
    "Consultar entrega da parte",
    "Relê a entrega persistida e emite o comprovante exigido pela revisão.",
    writeSchema(["runId", "partKey"], { runId: RUN_ID, partKey: PART_KEY }),
    { readOnlyHint: true }
  ),
  tool(
    "auditarParteDoCurso",
    "Revisar parte",
    "Registra revisão independente com aprovação, reparo, reconstrução ou bloqueio.",
    writeSchema([
      "artifact", "version", "runId", "partKey", "attempt", "submissionSha256",
      "submissionReadReceipt", "decision", "gates", "findings"
    ], {
      artifact: { type: "string", const: "aralearn.part-audit" },
      version: { type: "integer", const: 1 },
      runId: RUN_ID,
      partKey: PART_KEY,
      attempt: { type: "integer", minimum: 1 },
      submissionSha256: SHA256,
      submissionReadReceipt: { type: "string", minLength: 3, maxLength: 4096 },
      decision: { type: "string", enum: ["approve", "repair", "rebuild", "blocked"] },
      gates: { type: "object", additionalProperties: true },
      findings: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
      instructions: { type: "string", maxLength: 4000 }
    })
  ),
  tool(
    "reabrirParteDoCurso",
    "Reabrir parte",
    "Reabre uma parte responsável por falha posterior, preservando a decisão e a tentativa anteriores.",
    writeSchema([
      "artifact", "version", "runId", "partKey", "attempt", "submissionSha256", "decision",
      "findings"
    ], {
      artifact: { type: "string", const: "aralearn.final-validation-repair" },
      version: { type: "integer", const: 1 },
      runId: RUN_ID,
      partKey: PART_KEY,
      attempt: { type: "integer", minimum: 1 },
      submissionSha256: SHA256,
      decision: { type: "string", enum: ["repair", "rebuild"] },
      findings: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
      instructions: { type: "string", maxLength: 4000 }
    })
  ),
  tool(
    "validarCursoProduzido",
    "Validar curso",
    "Remonta o documento e aplica o contrato, a integridade relacional e as condições editoriais.",
    writeSchema(["runId"], { runId: RUN_ID })
  ),
  tool(
    "concluirCurso",
    "Concluir curso",
    "Materializa o curso privado ou publica o curso editorial já validado, conforme o destino da execução.",
    writeSchema(["runId"], { runId: RUN_ID }),
    { destructiveHint: true }
  ),
  tool(
    "bloquearExecucaoDeAutoria",
    "Bloquear execução",
    "Registra uma dúvida que impede prosseguir e as perguntas necessárias para resolvê-la.",
    writeSchema(["runId", "reason"], {
      runId: RUN_ID,
      partKey: PART_KEY,
      reason: { type: "string", minLength: 1, maxLength: 1000 },
      questions: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 500 } }
    })
  ),
  tool(
    "retomarExecucaoDeAutoria",
    "Retomar execução",
    "Registra a resolução da dúvida e devolve a execução ao estado anterior.",
    writeSchema(["runId", "resolution"], {
      runId: RUN_ID,
      resolution: { type: "object", minProperties: 1, additionalProperties: true }
    })
  ),
  tool(
    "cancelarExecucaoDeAutoria",
    "Cancelar execução",
    "Cancela uma execução ainda não publicada e conserva o registro mínimo de auditoria.",
    writeSchema(["runId", "reason"], {
      runId: RUN_ID,
      reason: { type: "string", minLength: 1, maxLength: 500 }
    }),
    { destructiveHint: true }
  )
]);

const TOOL_BY_NAME = new Map(AUTHORING_MCP_TOOLS.map((definition) => [definition.name, definition]));

function encodePath(value) {
  return encodeURIComponent(String(value));
}

function argumentsObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthoringApiError(422, "invalid_tool_arguments", "Os argumentos da ferramenta devem formar um objeto.");
  }
  return value;
}

function schemaTypeMatches(value, expected) {
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    return typeof value === type;
  });
}

function validateTopLevelArguments(definition, args) {
  const schema = definition.inputSchema;
  const properties = schema.properties || {};
  const unknown = Object.keys(args).find((field) => !Object.hasOwn(properties, field));
  if (unknown) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_arguments",
      `arguments contém campo desconhecido: ${unknown}.`,
      { path: `$.arguments.${unknown}`, field: unknown, reason: "unknown_field" }
    );
  }
  const missing = schema.required.find((field) => !Object.hasOwn(args, field));
  if (missing) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_arguments",
      `arguments.${missing} é obrigatório.`,
      { path: `$.arguments.${missing}`, field: missing, reason: "required" }
    );
  }
  for (const [field, value] of Object.entries(args)) {
    const fieldSchema = properties[field];
    if (!schemaTypeMatches(value, fieldSchema.type)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui tipo inválido.`,
        { path: `$.arguments.${field}`, field, reason: "type" }
      );
    }
    if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui valor inválido.`,
        { path: `$.arguments.${field}`, field, reason: "enum" }
      );
    }
    if (Object.hasOwn(fieldSchema, "const") && value !== fieldSchema.const) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui valor inválido.`,
        { path: `$.arguments.${field}`, field, reason: "const" }
      );
    }
    if (typeof value === "string" && fieldSchema.pattern
        && !(new RegExp(fieldSchema.pattern, "u")).test(value)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui formato inválido.`,
        { path: `$.arguments.${field}`, field, reason: "pattern" }
      );
    }
  }
}

function bodyWithout(argumentsValue, omitted) {
  return Object.fromEntries(
    Object.entries(argumentsValue).filter(([key]) => !omitted.has(key))
  );
}

function queryString(argumentsValue) {
  const query = new URLSearchParams();
  for (const field of ["limit", "beforeUpdatedAt", "beforeRunId"]) {
    if (argumentsValue[field] != null) query.set(field, String(argumentsValue[field]));
  }
  const source = query.toString();
  return source ? `?${source}` : "";
}

export function authoringMcpToolDefinition(name) {
  return TOOL_BY_NAME.get(name) || null;
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) {
    throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
  }
  const args = argumentsObject(rawArguments);
  validateTopLevelArguments(definition, args);
  const requestId = validateRequestId(args.requestId);
  const runId = args.runId == null ? null : validateRunId(args.runId);
  const routeFields = new Set(["runId"]);
  let method = "POST";
  let path;
  let body = bodyWithout(args, routeFields);
  switch (name) {
    case "listarExecucoesDeAutoria":
      method = "GET";
      path = `/v1/runs${queryString(args)}`;
      body = null;
      break;
    case "criarExecucaoDeAutoria":
      path = "/v1/runs";
      break;
    case "consultarExecucaoDeAutoria":
      method = "GET";
      path = `/v1/runs/${encodePath(runId)}`;
      body = null;
      break;
    case "gravarPlanoDeAutoria":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/plan`;
      break;
    case "gravarTrechoDoRegistro":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/ledger/${encodePath(args.section)}/${encodePath(args.position)}`;
      delete body.section;
      delete body.position;
      break;
    case "finalizarPlanoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/plan/finalize`;
      break;
    case "consultarProximaParte":
      method = "GET";
      path = `/v1/runs/${encodePath(runId)}/next-part`;
      body = null;
      break;
    case "gravarEspecificacaoDaParte":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/specification`;
      delete body.partKey;
      break;
    case "gravarParteDoCurso":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}`;
      delete body.partKey;
      break;
    case "consultarEntregaDaParte":
      method = "GET";
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/submission`;
      body = null;
      break;
    case "auditarParteDoCurso":
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/audit`;
      delete body.partKey;
      break;
    case "reabrirParteDoCurso":
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/reopen`;
      delete body.partKey;
      break;
    case "validarCursoProduzido":
      path = `/v1/runs/${encodePath(runId)}/validate`;
      break;
    case "concluirCurso":
      path = `/v1/runs/${encodePath(runId)}/publish`;
      break;
    case "bloquearExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/block`;
      break;
    case "retomarExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/resume`;
      break;
    case "cancelarExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/cancel`;
      break;
    default:
      throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
  }
  return { method, path, body, requestId };
}
