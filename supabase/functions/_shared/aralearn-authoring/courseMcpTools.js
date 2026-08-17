import { AuthoringApiError } from "./errors.js";
import { normalizeCourseAuthoringState } from "./courseAuthoringState.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required
});

const stringSchema = (options = {}) => ({ type: "string", ...options });
const uuidSchema = stringSchema({ pattern: UUID_PATTERN.source });
const requestIdSchema = stringSchema({ pattern: REQUEST_ID_PATTERN.source });
const nullableString = (schema) => ({ anyOf: [schema, { type: "null" }] });

const authoringStateSchema = objectSchema({
  version: { type: "integer", const: 1 },
  parts: { type: "array", maxItems: 64, items: { type: "object" } },
  decisions: { type: "array", maxItems: 512, items: { type: "object" } },
  mandate: { anyOf: [{ type: "object" }, { type: "null" }] }
});

const courseCursorSchema = objectSchema({
  beforeUpdatedAt: stringSchema({ format: "date-time" }),
  beforeId: uuidSchema
});

const courseEntityCursorSchema = objectSchema({
  entityType: stringSchema({
    enum: ["module", "lesson", "topic", "microsequence", "card"]
  }),
  entityId: stringSchema({ minLength: 1, maxLength: 240 })
});

const courseEntitySchema = {
  ...objectSchema({
    entityType: stringSchema({
      enum: ["module", "lesson", "topic", "microsequence", "card"]
    }),
    entityId: stringSchema({ minLength: 1, maxLength: 240 }),
    parentType: {
      anyOf: [{ type: "null" }, stringSchema({
        enum: ["module", "lesson", "microsequence"]
      })]
    },
    parentId: nullableString(stringSchema({ minLength: 1, maxLength: 240 })),
    position: { type: "integer", minimum: 0 },
    content: { type: "object" }
  }),
  allOf: [{
    if: {
      properties: { entityType: { const: "card" } },
      required: ["entityType"]
    },
    then: { properties: { position: { minimum: 1 } } }
  }]
};

const outputSchema = objectSchema({
  ok: { type: "boolean", const: true },
  requestId: {
    anyOf: [requestIdSchema, uuidSchema, { type: "null" }]
  },
  data: { anyOf: [{ type: "object" }, { type: "null" }] }
});

const readAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
});

const writeAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
});

const courseChangeAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
});

const peopleAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false
});

export const COURSE_MCP_TOOLS = Object.freeze([
  Object.freeze({
    name: "listarCursos",
    title: "Listar Cursos",
    description: "Lista somente os Cursos próprios disponíveis na Autoria. Use query para localizar por título; a resposta inclui links para a interface visual.",
    inputSchema: objectSchema({
      query: stringSchema({ maxLength: 120 }),
      limit: { type: "integer", minimum: 1, maximum: 50 },
      cursor: { anyOf: [courseCursorSchema, { type: "null" }] }
    }, []),
    outputSchema,
    annotations: readAnnotations
  }),
  Object.freeze({
    name: "lerCurso",
    title: "Ler Curso",
    description: "Lê o estado corrente de um Curso. Use outline para a hierarquia compacta e entities, com a versão recebida, para percorrer todo o conteúdo antes de auditar ou alterar.",
    inputSchema: objectSchema({
      courseId: uuidSchema,
      view: stringSchema({ enum: ["summary", "outline", "entities"] }),
      expectedRevision: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      cursor: { anyOf: [courseEntityCursorSchema, { type: "null" }] }
    }, ["courseId"]),
    outputSchema,
    annotations: readAnnotations
  }),
  Object.freeze({
    name: "criarCurso",
    title: "Criar Curso",
    description: "Cria atomicamente um Curso privado e vazio, pronto para receber planejamento e materialização, sem recipiente ou estágio intermediário.",
    inputSchema: objectSchema({
      requestId: requestIdSchema,
      title: stringSchema({ minLength: 1, maxLength: 300 }),
      goal: stringSchema({ minLength: 1, maxLength: 2_000 }),
      brief: stringSchema({ maxLength: 16_384 })
    }, ["requestId", "title", "goal"]),
    outputSchema,
    annotations: writeAnnotations
  }),
  Object.freeze({
    name: "alterarCurso",
    title: "Alterar Curso",
    description: "Altera metadados ou entidades do Curso vivo com controle de concorrência. Releia o Curso antes e use a versão de estado corrente.",
    inputSchema: objectSchema({
      requestId: requestIdSchema,
      courseId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      operation: stringSchema({ enum: ["update_metadata", "commit_entities"] }),
      title: stringSchema({ minLength: 1, maxLength: 300 }),
      goal: stringSchema({ minLength: 1, maxLength: 2_000 }),
      brief: stringSchema({ maxLength: 16_384 }),
      authoringState: authoringStateSchema,
      upserts: { type: "array", maxItems: 200, items: courseEntitySchema },
      deletes: {
        type: "array",
        maxItems: 200,
        items: objectSchema({
          entityType: stringSchema({
            enum: ["module", "lesson", "topic", "microsequence", "card"]
          }),
          entityId: stringSchema({ minLength: 1, maxLength: 240 })
        })
      }
    }, ["requestId", "courseId", "expectedRevision", "operation"]),
    outputSchema,
    annotations: courseChangeAnnotations
  }),
  Object.freeze({
    name: "gerirPessoas",
    title: "Gerir perfil e acesso ao Curso",
    description: "Lê ou atualiza o perfil humano mínimo e lista, concede ou revoga acesso direto para Estudo. Não pesquisa diretórios. Conceder exige o e-mail exato; conceder e revogar exigem confirmed=true depois de confirmação humana clara.",
    inputSchema: objectSchema({
      operation: stringSchema({
        enum: ["read_profile", "update_profile", "list_access", "grant_access", "revoke_access"]
      }),
      requestId: requestIdSchema,
      courseId: uuidSchema,
      email: stringSchema({ minLength: 3, maxLength: 254 }),
      userId: uuidSchema,
      displayName: stringSchema({ minLength: 1, maxLength: 120 }),
      avatarObjectKey: {
        anyOf: [stringSchema({
          pattern: "^[0-9a-f-]{36}/[0-9a-f-]{36}\\.(jpg|png|webp)$"
        }), { type: "null" }]
      },
      confirmed: { type: "boolean", const: true }
    }, ["operation"]),
    outputSchema,
    annotations: peopleAnnotations
  }),
  Object.freeze({
    name: "consultarComponentesDidaticos",
    title: "Consultar componentes didáticos",
    description: "Explora, pesquisa, inspeciona e valida os componentes didáticos instalados sem carregar contratos desnecessários no contexto.",
    inputSchema: objectSchema({
      operation: stringSchema({
        enum: ["explore", "search", "inspect", "contracts", "validate_card", "audit_representation", "preview_card"]
      }),
      query: stringSchema({ maxLength: 500 }),
      intent: stringSchema({ maxLength: 2_000 }),
      slot: stringSchema({ enum: ["content", "response", "feedback"] }),
      packages: {
        type: "array",
        maxItems: 8,
        uniqueItems: true,
        items: stringSchema({ minLength: 1, maxLength: 160 })
      },
      cardJson: stringSchema({ maxLength: 40_000 }),
      limit: { type: "integer", minimum: 1, maximum: 8 }
    }, ["operation"]),
    outputSchema,
    annotations: readAnnotations
  })
]);

const BY_NAME = new Map(COURSE_MCP_TOOLS.map((definition) => [definition.name, definition]));
const WRITE_TOOLS = new Set(["criarCurso", "alterarCurso", "gerirPessoas"]);

function fail(code, message, details = null) {
  throw new AuthoringApiError(422, code, message, details);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_tool_arguments", `${label} precisa ser um objeto.`);
  }
  return value;
}

function authoringState(value) {
  try {
    return normalizeCourseAuthoringState(value);
  } catch {
    fail("invalid_tool_argument", "authoringState é inválido.", {
      field: "authoringState"
    });
  }
}

function exactFields(value, allowed) {
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail("unknown_tool_argument", `O argumento ${unknown} não pertence à ferramenta.`, { field: unknown });
}

function requiredText(value, field, { maximum, optional = false } = {}) {
  if (value == null && optional) return null;
  const normalized = typeof value === "string" ? value.trim() : "";
  if ((!normalized && !optional) || normalized.length > maximum) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function requiredUuid(value, field) {
  const normalized = requiredText(value, field, { maximum: 36 });
  if (!UUID_PATTERN.test(normalized)) fail("invalid_tool_argument", `${field} não contém UUID válido.`, { field });
  return normalized.toLowerCase();
}

function requiredRequestId(value) {
  const normalized = requiredText(value, "requestId", { maximum: 128 });
  if (!REQUEST_ID_PATTERN.test(normalized) && !UUID_PATTERN.test(normalized)) {
    fail("invalid_tool_argument", "requestId é inválido.", { field: "requestId" });
  }
  return normalized;
}

function positiveInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function route(method, path, requestId = null, body = null) {
  return { kind: "route", method, path, requestId, body };
}

function searchParams(entries) {
  const params = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (value != null && value !== "") params.set(key, String(value));
  });
  const source = params.toString();
  return source ? `?${source}` : "";
}

function mapList(raw) {
  exactFields(raw, new Set(["query", "limit", "cursor"]));
  const query = raw.query == null ? "" : requiredText(raw.query, "query", { maximum: 120, optional: true });
  const limit = raw.limit == null ? 24 : positiveInteger(raw.limit, "limit", 50);
  let beforeUpdatedAt = null;
  let beforeId = null;
  if (raw.cursor != null) {
    const value = object(raw.cursor, "cursor");
    exactFields(value, new Set(["beforeUpdatedAt", "beforeId"]));
    beforeUpdatedAt = requiredText(value.beforeUpdatedAt, "beforeUpdatedAt", { maximum: 40 });
    beforeId = requiredUuid(value.beforeId, "beforeId");
  }
  return route("GET", `/v1/courses${searchParams({ query, limit, beforeUpdatedAt, beforeId })}`);
}

function mapRead(raw) {
  exactFields(raw, new Set([
    "courseId", "view", "expectedRevision", "limit", "cursor"
  ]));
  const courseId = requiredUuid(raw.courseId, "courseId");
  const view = raw.view == null ? "outline" : requiredText(raw.view, "view", { maximum: 20 });
  if (!new Set(["summary", "outline", "entities"]).has(view)) {
    fail("invalid_tool_argument", "view é inválida.", { field: "view" });
  }
  if (view === "entities") {
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    const limit = raw.limit == null ? 50 : positiveInteger(raw.limit, "limit", 100);
    let afterEntityType = null;
    let afterEntityId = null;
    if (raw.cursor != null) {
      const cursor = object(raw.cursor, "cursor");
      exactFields(cursor, new Set(["entityType", "entityId"]));
      afterEntityType = requiredText(cursor.entityType, "entityType", { maximum: 40 });
      if (!new Set(["module", "lesson", "topic", "microsequence", "card"]).has(afterEntityType)) {
        fail("invalid_tool_argument", "entityType é inválido.", { field: "cursor.entityType" });
      }
      afterEntityId = requiredText(cursor.entityId, "entityId", { maximum: 240 });
    }
    return route("GET", `/v1/courses/${courseId}/entities${searchParams({
      expectedRevision,
      limit,
      afterEntityType,
      afterEntityId
    })}`);
  }
  if (raw.expectedRevision != null || raw.limit != null || raw.cursor != null) {
    fail("invalid_tool_argument", "Paginação só pertence à leitura de entidades.");
  }
  return route("GET", `/v1/courses/${courseId}${searchParams({ view })}`);
}

function mapCreate(raw) {
  exactFields(raw, new Set(["requestId", "title", "goal", "brief"]));
  const requestId = requiredRequestId(raw.requestId);
  return route("POST", "/v1/courses", requestId, {
    requestId,
    title: requiredText(raw.title, "title", { maximum: 300 }),
    goal: requiredText(raw.goal, "goal", { maximum: 2_000 }),
    brief: raw.brief == null ? "" : requiredText(raw.brief, "brief", {
      maximum: 16_384,
      optional: true
    })
  });
}

function mapChange(raw) {
  exactFields(raw, new Set([
    "requestId", "courseId", "expectedRevision", "operation", "title", "goal",
    "brief", "authoringState", "upserts", "deletes"
  ]));
  const requestId = requiredRequestId(raw.requestId);
  const courseId = requiredUuid(raw.courseId, "courseId");
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set(["update_metadata", "commit_entities"]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  const body = {
    requestId,
    expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
    operation
  };
  if (operation === "update_metadata") {
    const supplied = ["title", "goal", "brief", "authoringState"].filter((field) => Object.hasOwn(raw, field));
    if (!supplied.length) fail("invalid_tool_argument", "Informe ao menos um metadado para alterar.");
    if (Object.hasOwn(raw, "title")) body.title = requiredText(raw.title, "title", { maximum: 300 });
    if (Object.hasOwn(raw, "goal")) body.goal = requiredText(raw.goal, "goal", { maximum: 2_000 });
    if (Object.hasOwn(raw, "brief")) body.brief = requiredText(raw.brief, "brief", { maximum: 16_384, optional: true });
    if (Object.hasOwn(raw, "authoringState")) body.authoringState = authoringState(raw.authoringState);
  } else {
    body.upserts = Array.isArray(raw.upserts) ? raw.upserts : [];
    body.deletes = Array.isArray(raw.deletes) ? raw.deletes : [];
    if (!body.upserts.length && !body.deletes.length) {
      fail("invalid_tool_argument", "Informe entidades para inserir, alterar ou excluir.");
    }
    if (body.upserts.length > 200 || body.deletes.length > 200) {
      fail("invalid_tool_argument", "A alteração excede 200 entidades por grupo.");
    }
  }
  return route("POST", `/v1/courses/${courseId}/changes`, requestId, body);
}

function mapPeople(raw) {
  exactFields(raw, new Set([
    "operation", "requestId", "courseId", "email", "userId", "displayName",
    "avatarObjectKey", "confirmed"
  ]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "read_profile", "update_profile", "list_access", "grant_access", "revoke_access"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  if (operation === "read_profile") {
    if (Object.keys(raw).length !== 1) {
      fail("invalid_tool_argument", "read_profile recebe somente operation.");
    }
    return route("GET", "/v1/profile");
  }
  if (operation === "update_profile") {
    if (Object.keys(raw).some((field) => !new Set([
      "operation", "displayName", "avatarObjectKey"
    ]).has(field))) {
      fail("invalid_tool_argument", "update_profile recebeu campos incompatíveis.");
    }
    const body = {};
    if (Object.hasOwn(raw, "displayName")) {
      body.displayName = requiredText(raw.displayName, "displayName", { maximum: 120 });
    }
    if (Object.hasOwn(raw, "avatarObjectKey")) {
      const value = raw.avatarObjectKey == null
        ? null
        : requiredText(raw.avatarObjectKey, "avatarObjectKey", { maximum: 78 });
      if (value !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u.test(value)) {
        fail("invalid_tool_argument", "avatarObjectKey é inválido.", {
          field: "avatarObjectKey"
        });
      }
      body.avatarObjectKey = value;
    }
    if (!Object.keys(body).length) {
      fail("invalid_tool_argument", "Informe ao menos um dado do perfil.");
    }
    return route("PATCH", "/v1/profile", null, body);
  }
  const courseId = requiredUuid(raw.courseId, "courseId");
  if (operation === "list_access") {
    if (Object.keys(raw).some((field) => !new Set(["operation", "courseId"]).has(field))) {
      fail("invalid_tool_argument", "list_access recebe somente courseId.");
    }
    return route("GET", `/v1/courses/${courseId}/access`);
  }
  if (raw.confirmed !== true) {
    fail("access_confirmation_required", "Confirme a alteração de acesso antes de chamar a ferramenta.");
  }
  const requestId = requiredRequestId(raw.requestId);
  if (operation === "grant_access") {
    if (Object.keys(raw).some((field) => !new Set([
      "operation", "requestId", "courseId", "email", "confirmed"
    ]).has(field))) {
      fail("invalid_tool_argument", "grant_access recebeu campos incompatíveis.");
    }
    const email = requiredText(raw.email, "email", { maximum: 254 });
    if (!/^[^\s@]+@[^\s@]+$/u.test(email)) {
      fail("invalid_tool_argument", "email precisa ser exato.", { field: "email" });
    }
    return route("POST", `/v1/courses/${courseId}/access`, requestId, {
      requestId,
      email: email.toLowerCase(),
      confirmed: true
    });
  }
  if (Object.keys(raw).some((field) => !new Set([
    "operation", "requestId", "courseId", "userId", "confirmed"
  ]).has(field))) {
    fail("invalid_tool_argument", "revoke_access recebeu campos incompatíveis.");
  }
  const userId = requiredUuid(raw.userId, "userId");
  return route("DELETE", `/v1/courses/${courseId}/access/${userId}`, requestId, {
    requestId,
    confirmed: true
  });
}

function mapResourceLibrary(raw) {
  exactFields(raw, new Set([
    "operation", "query", "intent", "slot", "packages", "cardJson", "limit"
  ]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "explore", "search", "inspect", "contracts", "validate_card",
    "audit_representation", "preview_card"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  return {
    kind: "resource-library",
    requestId: null,
    body: { ...raw, operation }
  };
}

export function authoringMcpToolDefinition(name) {
  return BY_NAME.get(String(name || "")) || null;
}

export function authoringApplicationToolDefinition(name) {
  return authoringMcpToolDefinition(name);
}

export function authoringMcpToolsForPrincipal(principal) {
  return COURSE_MCP_TOOLS.filter((definition) =>
    authoringMcpToolIsAllowed(definition.name, principal)
  ).map((definition) => structuredClone(definition));
}

export function authoringMcpToolIsAllowed(name, principal) {
  if (!principal?.actorId || !BY_NAME.has(name)) return false;
  if (!WRITE_TOOLS.has(name)) return true;
  const scopes = new Set(Array.isArray(principal.scopes) ? principal.scopes : []);
  return scopes.has("authoring:write");
}

export function authoringApplicationToolIsAllowed(name, principal) {
  return authoringMcpToolIsAllowed(name, principal);
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const raw = object(rawArguments ?? {}, "arguments");
  if (name === "listarCursos") return mapList(raw);
  if (name === "lerCurso") return mapRead(raw);
  if (name === "criarCurso") return mapCreate(raw);
  if (name === "alterarCurso") return mapChange(raw);
  if (name === "gerirPessoas") return mapPeople(raw);
  if (name === "consultarComponentesDidaticos") return mapResourceLibrary(raw);
  throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
}

export function mapAuthoringApplicationToolCall(name, rawArguments) {
  return mapAuthoringMcpToolCall(name, rawArguments);
}

function validateOutput(name, envelope) {
  if (!BY_NAME.has(name)) throw new TypeError("Ferramenta de autoria inexistente.");
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
      envelope.ok !== true || !("data" in envelope)) {
    throw new TypeError("A resposta da ferramenta não corresponde ao contrato.");
  }
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > 2 * 1024 * 1024) {
    throw new TypeError("A resposta da ferramenta excede o limite de 2 MiB.");
  }
  return envelope;
}

export function validateAuthoringMcpToolOutput(name, value) {
  return validateOutput(name, value);
}

export function validateAuthoringApplicationToolOutput(name, value) {
  return validateOutput(name, value);
}
