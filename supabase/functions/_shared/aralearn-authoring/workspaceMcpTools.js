import { AuthoringApiError } from "./errors.js";

const UUID = Object.freeze({ type: "string", format: "uuid" });
const ID = Object.freeze({ type: "string", minLength: 1, maxLength: 240, pattern: "\\S" });
const REQUEST_ID = Object.freeze({
  type: "string",
  minLength: 8,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
});
const REVISION = Object.freeze({ type: "integer", minimum: 1 });
const ENTITY_TYPE = Object.freeze({
  type: "string",
  enum: ["course", "module", "lesson", "microsequence", "card"]
});
const OPEN_OBJECT = Object.freeze({ type: "object", additionalProperties: true });
const OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["ok", "requestId", "data"],
  properties: {
    ok: { type: "boolean" },
    requestId: { type: ["string", "null"] },
    data: {}
  }
});

function schema(required, properties) {
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    required,
    properties
  });
}

function readSchema(required = [], properties = {}) {
  return schema(required, properties);
}

function writeSchema(required = [], properties = {}) {
  return schema(["requestId", ...required], { requestId: REQUEST_ID, ...properties });
}

function tool(name, title, description, inputSchema, annotations = {}) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema,
    outputSchema: OUTPUT_SCHEMA,
    annotations: Object.freeze({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      ...annotations
    })
  });
}

const VIEW_PROPERTIES = Object.freeze({
  view: {
    type: "string",
    enum: ["outline", "entity", "document"],
    default: "outline"
  },
  entityType: ENTITY_TYPE,
  entityId: ID,
  includeDescendants: { type: "boolean", default: true }
});

export const AUTHORING_WORKSPACE_MCP_TOOLS = Object.freeze([
  tool(
    "listarRecursosDeCard",
    "Listar recursos de card",
    "Lista os recursos v4 disponíveis e a finalidade didática de cada um.",
    readSchema(),
    { readOnlyHint: true }
  ),
  tool(
    "consultarRecursoDeCard",
    "Consultar recurso de card",
    "Lê o contrato autoral e um exemplo válido do recurso informado.",
    readSchema(["resource"], {
      resource: {
        type: "string",
        enum: [
          "paragraph", "choice", "composite", "code", "table", "flow", "tree",
          "graph", "relation_map", "matrix", "plane", "formula", "chart",
          "sequence", "annotated_text", "linguistic_example"
        ]
      }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "listarCursosDaBibliotecaPessoal",
    "Listar cursos pessoais",
    "Lista os cursos acessíveis na biblioteca pessoal, com ids e revisões.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterSelectionId: UUID,
      query: { type: "string", maxLength: 160 }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "listarColecoesDoCatalogo",
    "Listar coleções",
    "Lista as coleções do catálogo para localizar cursos existentes.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterId: UUID,
      query: { type: "string", maxLength: 200 }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "listarCursosDaColecao",
    "Listar cursos da coleção",
    "Lista cursos de uma coleção com ids, títulos e revisões.",
    readSchema(["collectionId"], {
      collectionId: UUID,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterId: UUID,
      query: { type: "string", maxLength: 200 }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "lerConteudoDoCurso",
    "Ler conteúdo de curso",
    "Lê a árvore, uma entidade ou o documento v4 de um curso acessível.",
    readSchema(["courseId"], { courseId: UUID, ...VIEW_PROPERTIES }),
    { readOnlyHint: true }
  ),
  tool(
    "listarWorkspacesDeAutoria",
    "Listar workspaces",
    "Lista os workspaces mutáveis do autor, sem carregar os documentos.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      beforeUpdatedAt: { type: "string", format: "date-time" },
      beforeId: UUID
    }),
    { readOnlyHint: true }
  ),
  tool(
    "criarWorkspaceDeAutoria",
    "Criar workspace",
    "Cria um workspace vazio ou inicia um a partir de um curso existente.",
    writeSchema(["title"], {
      title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
      sourceCourseId: UUID
    })
  ),
  tool(
    "lerWorkspaceDeAutoria",
    "Ler workspace",
    "Lê a árvore, uma entidade ou o documento completo de uma revisão do workspace.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      revision: REVISION,
      ...VIEW_PROPERTIES
    }),
    { readOnlyHint: true }
  ),
  tool(
    "revisarMicroteoriasDoWorkspace",
    "Revisar microteorias",
    "Retorna somente cards teóricos e a contagem de práticas; use esta saída para a revisão conceitual no chat.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      revision: REVISION,
      courseId: ID
    }),
    { readOnlyHint: true }
  ),
  tool(
    "listarHistoricoDoWorkspace",
    "Listar histórico",
    "Lista revisões imutáveis do workspace para auditoria ou restauração.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "importarCursoNoWorkspace",
    "Importar curso",
    "Acrescenta um curso existente ao workspace para reaproveitar ou mover suas partes.",
    writeSchema(["workspaceId", "expectedRevision", "courseId"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      courseId: UUID,
      position: { type: "integer", minimum: 0 }
    })
  ),
  tool(
    "inserirEntidadeNoWorkspace",
    "Inserir entidade",
    "Insere um curso, módulo, lição, microssequência ou card completo no pai informado.",
    writeSchema(["workspaceId", "expectedRevision", "entityType", "entity"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      parentId: { type: ["string", "null"], maxLength: 240 },
      position: { type: "integer", minimum: 0 },
      entity: OPEN_OBJECT
    })
  ),
  tool(
    "substituirEntidadeNoWorkspace",
    "Substituir entidade",
    "Substitui atomicamente uma entidade completa preservando seu id.",
    writeSchema(["workspaceId", "expectedRevision", "entityType", "entityId", "entity"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityId: ID,
      entity: OPEN_OBJECT
    })
  ),
  tool(
    "renomearEntidadeNoWorkspace",
    "Renomear entidade",
    "Renomeia qualquer nível estrutural do workspace.",
    writeSchema(["workspaceId", "expectedRevision", "entityType", "entityId", "title"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityId: ID,
      title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" }
    })
  ),
  tool(
    "moverEntidadeNoWorkspace",
    "Mover entidade",
    "Move ou reordena uma entidade; módulos, lições, microssequências e cards podem atravessar cursos.",
    writeSchema(["workspaceId", "expectedRevision", "entityType", "entityId"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityId: ID,
      targetParentId: { type: ["string", "null"], maxLength: 240 },
      position: { type: "integer", minimum: 0 }
    })
  ),
  tool(
    "excluirEntidadeDoWorkspace",
    "Excluir entidade",
    "Exclui uma entidade e seus descendentes na nova revisão do workspace.",
    writeSchema(["workspaceId", "expectedRevision", "entityType", "entityId"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityId: ID
    }),
    { destructiveHint: true }
  ),
  tool(
    "juntarMicrossequencias",
    "Juntar microssequências",
    "Junta cards e metadados de microssequências da mesma lição e atualiza dependências.",
    writeSchema(["workspaceId", "expectedRevision", "targetId", "sourceIds"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      targetId: ID,
      sourceIds: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        uniqueItems: true,
        items: ID
      },
      title: { type: "string", minLength: 1, maxLength: 300 },
      goal: { type: "string", minLength: 1, maxLength: 2000 }
    })
  ),
  tool(
    "separarMicrossequencia",
    "Separar microssequência",
    "Move cards selecionados para uma nova microssequência validada na mesma lição.",
    writeSchema([
      "workspaceId", "expectedRevision", "sourceId", "newMicrosequence", "cardIds"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      sourceId: ID,
      newMicrosequence: OPEN_OBJECT,
      cardIds: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        uniqueItems: true,
        items: ID
      },
      position: { type: "integer", minimum: 0 }
    })
  ),
  tool(
    "promoverModuloACurso",
    "Transformar módulo em curso",
    "Cria um curso no workspace contendo o módulo indicado; pode mover ou copiar.",
    writeSchema(["workspaceId", "expectedRevision", "moduleId", "courseId", "goal"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      moduleId: ID,
      courseId: ID,
      title: { type: "string", minLength: 1, maxLength: 300 },
      goal: { type: "string", minLength: 1, maxLength: 2000 },
      mode: { type: "string", enum: ["move", "copy"], default: "move" }
    })
  ),
  tool(
    "rebaixarCursoAModulo",
    "Transformar curso em módulo",
    "Achata os módulos do curso de origem em um novo módulo do curso de destino; pode mover ou copiar.",
    writeSchema([
      "workspaceId", "expectedRevision", "courseId", "targetCourseId", "moduleId"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      courseId: ID,
      targetCourseId: ID,
      moduleId: ID,
      title: { type: "string", minLength: 1, maxLength: 300 },
      mode: { type: "string", enum: ["move", "copy"], default: "move" }
    })
  ),
  tool(
    "restaurarRevisaoDoWorkspace",
    "Restaurar revisão",
    "Cria uma nova revisão com o conteúdo exato de uma revisão anterior; não apaga histórico.",
    writeSchema(["workspaceId", "expectedRevision", "revision"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      revision: REVISION
    })
  ),
  tool(
    "publicarCursoDoWorkspace",
    "Publicar curso",
    "Publica um curso do workspace. partial cria uma prévia privada testável; o catálogo exige complete.",
    writeSchema([
      "workspaceId", "expectedRevision", "courseId", "target",
      "completion", "publicationMode"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      courseId: ID,
      target: { type: "string", enum: ["private", "catalog"] },
      completion: { type: "string", enum: ["partial", "complete"] },
      publicationMode: { type: "string", enum: ["create", "update"] },
      existingCourseId: UUID,
      expectedContentHash: {
        type: "string",
        pattern: "^[a-f0-9]{64}$"
      },
      collectionId: UUID
    })
  ),
  tool(
    "excluirWorkspaceDeAutoria",
    "Excluir workspace",
    "Remove o workspace da lista ativa; cursos já publicados e revisões de curso permanecem.",
    writeSchema(["workspaceId"], { workspaceId: UUID }),
    { destructiveHint: true }
  )
]);

const TOOL_BY_NAME = new Map(
  AUTHORING_WORKSPACE_MCP_TOOLS.map((definition) => [definition.name, definition])
);

const CATALOG_READ = new Set(["listarColecoesDoCatalogo", "listarCursosDaColecao"]);
const PRIVATE_READ = new Set(["listarCursosDaBibliotecaPessoal"]);
const AUTHORING_READ = new Set([
  "listarRecursosDeCard",
  "consultarRecursoDeCard",
  "lerConteudoDoCurso",
  "listarWorkspacesDeAutoria",
  "lerWorkspaceDeAutoria",
  "revisarMicroteoriasDoWorkspace",
  "listarHistoricoDoWorkspace"
]);
const PUBLISH = new Set(["publicarCursoDoWorkspace"]);

function matchesType(value, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === "null") return value === null;
    if (candidate === "object") return value && typeof value === "object" && !Array.isArray(value);
    if (candidate === "array") return Array.isArray(value);
    if (candidate === "integer") return Number.isInteger(value);
    return typeof value === candidate;
  });
}

function validateValue(value, definition, field) {
  if (!matchesType(value, definition.type)) {
    throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} tem tipo inválido.`);
  }
  if (typeof value === "string") {
    if (definition.minLength != null && value.length < definition.minLength) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} é curto demais.`);
    }
    if (definition.maxLength != null && value.length > definition.maxLength) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} é longo demais.`);
    }
    if (definition.pattern && !new RegExp(definition.pattern, "u").test(value)) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} tem formato inválido.`);
    }
    if (definition.format === "uuid"
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} deve ser UUID.`);
    }
  }
  if (typeof value === "number") {
    if (definition.minimum != null && value < definition.minimum) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} é menor que o permitido.`);
    }
    if (definition.maximum != null && value > definition.maximum) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} é maior que o permitido.`);
    }
  }
  if (definition.enum && !definition.enum.includes(value)) {
    throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} não usa um valor permitido.`);
  }
  if (Array.isArray(value)) {
    if (definition.minItems != null && value.length < definition.minItems) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} tem poucos itens.`);
    }
    if (definition.maxItems != null && value.length > definition.maxItems) {
      throw new AuthoringApiError(422, "invalid_tool_arguments", `${field} tem itens demais.`);
    }
    value.forEach((item, index) => validateValue(item, definition.items || {}, `${field}[${index}]`));
  }
}

function validateArguments(definition, rawArguments) {
  if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
    throw new AuthoringApiError(422, "invalid_tool_arguments", "arguments deve ser objeto.");
  }
  const properties = definition.inputSchema.properties;
  const unknown = Object.keys(rawArguments).find((field) => !Object.hasOwn(properties, field));
  if (unknown) {
    throw new AuthoringApiError(
      422, "invalid_tool_arguments", `Campo não aceito: ${unknown}.`, { field: unknown }
    );
  }
  const missing = definition.inputSchema.required.find(
    (field) => !Object.hasOwn(rawArguments, field)
  );
  if (missing) {
    throw new AuthoringApiError(
      422, "invalid_tool_arguments", `Campo obrigatório ausente: ${missing}.`, { field: missing }
    );
  }
  for (const [field, value] of Object.entries(rawArguments)) {
    validateValue(value, properties[field], field);
  }
  return rawArguments;
}

function query(argumentsValue, fields) {
  const params = new URLSearchParams();
  for (const field of fields) {
    if (argumentsValue[field] != null) params.set(field, String(argumentsValue[field]));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function encode(value) {
  return encodeURIComponent(String(value));
}

function mutation(name, args) {
  const operations = {
    inserirEntidadeNoWorkspace: "insert_entity",
    substituirEntidadeNoWorkspace: "replace_entity",
    renomearEntidadeNoWorkspace: "rename_entity",
    moverEntidadeNoWorkspace: "move_entity",
    excluirEntidadeDoWorkspace: "delete_entity",
    juntarMicrossequencias: "merge_microsequences",
    separarMicrossequencia: "split_microsequence",
    promoverModuloACurso: "promote_module",
    rebaixarCursoAModulo: "demote_course",
    restaurarRevisaoDoWorkspace: "restore_revision"
  };
  const { workspaceId, requestId, expectedRevision, ...operationArguments } = args;
  return {
    method: "POST",
    path: `/v1/workspaces/${encode(workspaceId)}/mutations`,
    body: {
      requestId,
      expectedRevision,
      operation: operations[name],
      arguments: operationArguments
    },
    requestId
  };
}

export function authoringMcpToolDefinition(name) {
  return TOOL_BY_NAME.get(name) || null;
}

export function authoringMcpToolIsAllowed(name, principal) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition || principal?.authenticationKind !== "api_key" || !principal?.actorId) {
    return false;
  }
  const scopes = new Set(principal.scopes || []);
  if (scopes.has("*")) return true;
  if (CATALOG_READ.has(name)) return scopes.has("catalog:publish");
  if (PRIVATE_READ.has(name)) return scopes.has("authoring:private:read");
  if (AUTHORING_READ.has(name)) {
    return scopes.has("authoring:read") || scopes.has("authoring:private:read");
  }
  if (PUBLISH.has(name)) {
    return scopes.has("catalog:publish") || scopes.has("authoring:private:write");
  }
  return scopes.has("authoring:write") || scopes.has("authoring:private:write");
}

export function authoringMcpToolsForPrincipal(principal) {
  return AUTHORING_WORKSPACE_MCP_TOOLS.filter(
    (definition) => authoringMcpToolIsAllowed(definition.name, principal)
  );
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) throw new AuthoringApiError(404, "unknown_tool", "Ferramenta inexistente.");
  const args = validateArguments(definition, rawArguments);
  if (name === "listarRecursosDeCard") {
    return { method: "GET", path: "/v1/contracts/resources", body: null, requestId: null };
  }
  if (name === "consultarRecursoDeCard") {
    return {
      method: "GET",
      path: `/v1/contracts/resources/${encode(args.resource)}`,
      body: null,
      requestId: null
    };
  }
  if (name === "listarCursosDaBibliotecaPessoal") {
    return {
      method: "GET",
      path: "/v1/library/courses" + query(args, [
        "limit", "afterPosition", "afterSelectionId", "query"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarColecoesDoCatalogo") {
    return {
      method: "GET",
      path: "/v1/catalog/collections" + query(args, [
        "limit", "afterPosition", "afterId", "query"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarCursosDaColecao") {
    return {
      method: "GET",
      path: `/v1/catalog/collections/${encode(args.collectionId)}/courses` + query(args, [
        "limit", "afterPosition", "afterId", "query"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "lerConteudoDoCurso") {
    return {
      method: "GET",
      path: `/v1/courses/${encode(args.courseId)}/content` + query(args, [
        "view", "entityType", "entityId", "includeDescendants"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarWorkspacesDeAutoria") {
    return {
      method: "GET",
      path: "/v1/workspaces" + query(args, ["limit", "beforeUpdatedAt", "beforeId"]),
      body: null,
      requestId: null
    };
  }
  if (name === "criarWorkspaceDeAutoria") {
    return { method: "POST", path: "/v1/workspaces", body: args, requestId: args.requestId };
  }
  if (name === "lerWorkspaceDeAutoria") {
    return {
      method: "GET",
      path: `/v1/workspaces/${encode(args.workspaceId)}` + query(args, [
        "revision", "view", "entityType", "entityId", "includeDescendants"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "revisarMicroteoriasDoWorkspace") {
    return {
      method: "GET",
      path: `/v1/workspaces/${encode(args.workspaceId)}` + query({
        ...args,
        view: "microtheories"
      }, ["revision", "view", "courseId"]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarHistoricoDoWorkspace") {
    return {
      method: "GET",
      path: `/v1/workspaces/${encode(args.workspaceId)}/history` + query(args, ["limit"]),
      body: null,
      requestId: null
    };
  }
  if (name === "importarCursoNoWorkspace") {
    const { workspaceId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/workspaces/${encode(workspaceId)}/imports`,
      body,
      requestId: args.requestId
    };
  }
  if (new Set([
    "inserirEntidadeNoWorkspace",
    "substituirEntidadeNoWorkspace",
    "renomearEntidadeNoWorkspace",
    "moverEntidadeNoWorkspace",
    "excluirEntidadeDoWorkspace",
    "juntarMicrossequencias",
    "separarMicrossequencia",
    "promoverModuloACurso",
    "rebaixarCursoAModulo",
    "restaurarRevisaoDoWorkspace"
  ]).has(name)) return mutation(name, args);
  if (name === "publicarCursoDoWorkspace") {
    const { workspaceId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/workspaces/${encode(workspaceId)}/publications`,
      body,
      requestId: args.requestId
    };
  }
  if (name === "excluirWorkspaceDeAutoria") {
    return {
      method: "DELETE",
      path: `/v1/workspaces/${encode(args.workspaceId)}`,
      body: { requestId: args.requestId },
      requestId: args.requestId
    };
  }
  throw new AuthoringApiError(404, "unknown_tool", "Ferramenta inexistente.");
}
