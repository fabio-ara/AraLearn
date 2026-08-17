import { AuthoringApiError } from "./errors.js";

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

const authoringPlanCommandSchema = {
  ...objectSchema({
  type: stringSchema({ enum: [
    "update_plan",
    "add_plan_item",
    "update_plan_item",
    "remove_plan_item",
    "reorder_plan_items",
    "add_part",
    "update_part",
    "remove_part",
    "reorder_parts",
    "split_part",
    "join_parts",
    "assign_microsequence",
    "move_microsequence",
    "remove_microsequence"
  ] }),
  kind: stringSchema({ enum: [
    "intended_learning_outcome",
    "instructional_analysis_unit",
    "evidence_requirement"
  ] }),
  id: uuidSchema,
  position: { type: "integer", minimum: 0, maximum: 255 },
  statement: stringSchema({ minLength: 1, maxLength: 2_000 }),
  orderedIds: { type: "array", maxItems: 256, uniqueItems: true, items: uuidSchema },
  title: stringSchema({ minLength: 1, maxLength: 300 }),
  objective: stringSchema({ minLength: 1, maxLength: 2_000 }),
  audience: stringSchema({ maxLength: 4_000 }),
  scope: stringSchema({ maxLength: 8_000 }),
  authoringGuidance: stringSchema({ maxLength: 16_384 }),
  preferredPartCount: objectSchema({
    minimum: { type: "integer", minimum: 1, maximum: 64 },
    maximum: { type: "integer", minimum: 1, maximum: 64 },
    origin: stringSchema({ enum: ["automatic", "author", "research_condition"] })
  }),
  intent: stringSchema({ maxLength: 4_000 }),
  partId: uuidSchema,
  newPartId: uuidSchema,
  newPartPosition: { type: "integer", minimum: 0, maximum: 63 },
  microsequenceIds: {
    type: "array",
    maxItems: 64,
    uniqueItems: true,
    items: stringSchema({ minLength: 1, maxLength: 240 })
  },
  sourcePartId: uuidSchema,
  targetPartId: uuidSchema,
  microsequenceId: stringSchema({ minLength: 1, maxLength: 240 })
  }, ["type"]),
  allOf: [{
    if: { properties: { type: { const: "add_part" } }, required: ["type"] },
    then: { properties: { position: { maximum: 63 } } }
  }, {
    if: { properties: { type: { const: "reorder_parts" } }, required: ["type"] },
    then: { properties: { orderedIds: { maxItems: 64 } } }
  }]
};

const courseCursorSchema = objectSchema({
  beforeUpdatedAt: stringSchema({ format: "date-time" }),
  beforeId: uuidSchema
});

const courseEntityCursorSchema = objectSchema({
  entityType: stringSchema({
    enum: ["module", "lesson", "topic", "microsequence", "study_unit"]
  }),
  entityId: stringSchema({ minLength: 1, maxLength: 240 })
});

const courseStudyUnitCursorSchema = objectSchema({
  studyUnitId: stringSchema({ minLength: 1, maxLength: 240 })
});

const courseStudyUnitScopeSchema = objectSchema({
  kind: stringSchema({ enum: [
    "course", "authoring_part", "unassigned", "module", "lesson",
    "didactic_microsequence"
  ] }),
  id: nullableString(stringSchema({ minLength: 1, maxLength: 240 }))
});

const courseEntitySchema = {
  ...objectSchema({
    entityType: stringSchema({
      enum: ["module", "lesson", "topic", "microsequence", "study_unit"]
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
      properties: { entityType: { const: "study_unit" } },
      required: ["entityType"]
    },
    then: { properties: { position: { minimum: 1 } } }
  }]
};

const materializationStepSchema = objectSchema({
  id: uuidSchema,
  position: { type: "integer", minimum: 0, maximum: 63 },
  kind: stringSchema({ enum: [
    "context_load",
    "didactic_microsequence_materialization",
    "validation"
  ] }),
  targetDidacticMicrosequenceId: nullableString(
    stringSchema({ minLength: 1, maxLength: 240 })
  ),
  productionPosition: {
    anyOf: [{ type: "integer", minimum: 0, maximum: 63 }, { type: "null" }]
  }
});

const materializationCommandSchema = objectSchema({
  operation: stringSchema({ enum: ["start", "record_step", "finish"] }),
  authoringPartId: uuidSchema,
  materializationId: uuidSchema,
  expectedMaterializationVersion: { type: "integer", minimum: 0 },
  authoringPartVersion: { type: "integer", minimum: 1 },
  designContext: { type: "object" },
  steps: { type: "array", minItems: 1, maxItems: 64, items: materializationStepSchema },
  stepId: uuidSchema,
  expectedStepVersion: { type: "integer", minimum: 1 },
  status: stringSchema({ enum: ["completed", "failed"] }),
  resultFacts: { type: "object" },
  entityChanges: {
    ...objectSchema({
    upserts: { type: "array", maxItems: 64, items: courseEntitySchema },
    deletes: {
      type: "array",
      maxItems: 64,
      items: objectSchema({
        entityType: stringSchema({
          enum: ["module", "lesson", "topic", "microsequence", "study_unit"]
        }),
        entityId: stringSchema({ minLength: 1, maxLength: 240 })
      })
    }
    }),
    description: "Lote com no máximo 64 alterações somando upserts e deletes."
  }
}, ["operation", "authoringPartId", "materializationId", "expectedMaterializationVersion"]);

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
    description: "Lê o estado corrente de um Curso. Use instructional_plan para planejar por Partes, study_units para inspecionar Unidades de estudo em ordem curricular com links exatos, part_materialization para retomar uma materialização, outline para a hierarquia compacta e entities somente para alterações estruturais.",
    inputSchema: {
      ...objectSchema({
      courseId: uuidSchema,
      view: stringSchema({ enum: [
        "summary", "outline", "instructional_plan", "part_materialization", "study_units",
        "entities"
      ] }),
      authoringPartId: uuidSchema,
      materializationId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      cursor: {
        anyOf: [courseEntityCursorSchema, courseStudyUnitCursorSchema, { type: "null" }]
      },
      scope: courseStudyUnitScopeSchema,
      anchorStudyUnitId: stringSchema({ minLength: 1, maxLength: 240 }),
      direction: stringSchema({ enum: ["forward", "backward"] }),
      maxBytes: { type: "integer", minimum: 65_536, maximum: 1_500_000 }
      }, ["courseId"]),
      allOf: [{
        if: {
          properties: { view: { const: "part_materialization" } },
          required: ["view"]
        },
        then: { required: ["authoringPartId", "materializationId"] },
        else: {
          not: {
            anyOf: [
              { required: ["authoringPartId"] },
              { required: ["materializationId"] }
            ]
          }
        }
      }, {
        if: {
          properties: { view: { const: "study_units" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision"],
          properties: { limit: { maximum: 24 } }
        }
      }, {
        if: {
          properties: { view: { const: "entities" } },
          required: ["view"]
        },
        then: { required: ["expectedRevision"] }
      }]
    },
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
      objective: stringSchema({ minLength: 1, maxLength: 2_000 })
    }, ["requestId", "title", "objective"]),
    outputSchema,
    annotations: writeAnnotations
  }),
  Object.freeze({
    name: "alterarCurso",
    title: "Alterar Curso",
    description: "Altera o plano instrucional vivo, a composição ou uma materialização retomável de Parte. Releia a vista correspondente antes e use as versões correntes; o plano admite até 192 vínculos de microssequência no total, e cada lote de composição ou materialização permanece limitado e idempotente.",
    inputSchema: objectSchema({
      requestId: requestIdSchema,
      courseId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      expectedPlanVersion: { type: "integer", minimum: 1 },
      operation: stringSchema({ enum: [
        "update_instructional_plan",
        "commit_course_composition",
        "advance_part_materialization"
      ] }),
      planCommand: authoringPlanCommandSchema,
      materializationCommand: materializationCommandSchema,
      upserts: { type: "array", maxItems: 200, items: courseEntitySchema },
      deletes: {
        type: "array",
        maxItems: 200,
        items: objectSchema({
          entityType: stringSchema({
            enum: ["module", "lesson", "topic", "microsequence", "study_unit"]
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
        enum: ["explore", "search", "inspect", "contracts", "validate_study_unit", "audit_representation", "preview_study_unit"]
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
      studyUnitJson: stringSchema({ maxLength: 40_000 }),
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

function nonNegativeInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > maximum) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return normalized;
}

function boundedJsonObject(value, field, maximumBytes) {
  const normalized = structuredClone(object(value, field));
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > maximumBytes) {
    fail("invalid_tool_argument", `${field} excede o limite.`, { field });
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
    "courseId", "view", "authoringPartId", "materializationId",
    "expectedRevision", "limit", "cursor", "scope", "anchorStudyUnitId",
    "direction", "maxBytes"
  ]));
  const courseId = requiredUuid(raw.courseId, "courseId");
  const view = raw.view == null ? "outline" : requiredText(raw.view, "view", { maximum: 20 });
  if (!new Set([
    "summary", "outline", "instructional_plan", "part_materialization", "study_units",
    "entities"
  ]).has(view)) {
    fail("invalid_tool_argument", "view é inválida.", { field: "view" });
  }
  if (view === "entities") {
    if (raw.authoringPartId != null || raw.materializationId != null) {
      fail("invalid_tool_argument", "Identidades de materialização não pertencem às entidades.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    const limit = raw.limit == null ? 50 : positiveInteger(raw.limit, "limit", 100);
    let afterEntityType = null;
    let afterEntityId = null;
    if (raw.cursor != null) {
      const cursor = object(raw.cursor, "cursor");
      exactFields(cursor, new Set(["entityType", "entityId"]));
      afterEntityType = requiredText(cursor.entityType, "entityType", { maximum: 40 });
      if (!new Set(["module", "lesson", "topic", "microsequence", "study_unit"]).has(afterEntityType)) {
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
  if (view === "study_units") {
    if (raw.authoringPartId != null || raw.materializationId != null) {
      fail("invalid_tool_argument", "Identidades de materialização não pertencem à inspeção.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    const limit = raw.limit == null ? 12 : positiveInteger(raw.limit, "limit", 24);
    const maxBytes = raw.maxBytes == null
      ? 512 * 1024
      : positiveInteger(raw.maxBytes, "maxBytes", 1_500_000);
    if (maxBytes < 64 * 1024) {
      fail("invalid_tool_argument", "maxBytes é inválido.", { field: "maxBytes" });
    }
    const direction = raw.direction == null
      ? "forward"
      : requiredText(raw.direction, "direction", { maximum: 8 });
    if (!new Set(["forward", "backward"]).has(direction)) {
      fail("invalid_tool_argument", "direction é inválida.", { field: "direction" });
    }
    let scopeKind = "course";
    let scopeId = null;
    if (raw.scope != null) {
      const scope = object(raw.scope, "scope");
      exactFields(scope, new Set(["kind", "id"]));
      scopeKind = requiredText(scope.kind, "scope.kind", { maximum: 32 });
      if (!new Set([
        "course", "authoring_part", "unassigned", "module", "lesson",
        "didactic_microsequence"
      ]).has(scopeKind)) {
        fail("invalid_tool_argument", "scope.kind é inválido.", { field: "scope.kind" });
      }
      const idless = scopeKind === "course" || scopeKind === "unassigned";
      if (idless) {
        if (scope.id != null) {
          fail("invalid_tool_argument", "scope.id não pertence a este escopo.", {
            field: "scope.id"
          });
        }
      } else {
        scopeId = scopeKind === "authoring_part"
          ? requiredUuid(scope.id, "scope.id")
          : requiredText(scope.id, "scope.id", { maximum: 240 });
      }
    }
    const anchorStudyUnitId = raw.anchorStudyUnitId == null
      ? null
      : requiredText(raw.anchorStudyUnitId, "anchorStudyUnitId", { maximum: 240 });
    let cursorStudyUnitId = null;
    if (raw.cursor != null) {
      if (anchorStudyUnitId != null) {
        fail("invalid_tool_argument", "Âncora e cursor são mutuamente exclusivos.");
      }
      const cursor = object(raw.cursor, "cursor");
      exactFields(cursor, new Set(["studyUnitId"]));
      cursorStudyUnitId = requiredText(cursor.studyUnitId, "cursor.studyUnitId", {
        maximum: 240
      });
    }
    return route("GET", `/v1/courses/${courseId}/study-units${searchParams({
      expectedRevision,
      scopeKind,
      scopeId,
      anchorStudyUnitId,
      cursorStudyUnitId,
      direction,
      limit,
      maxBytes
    })}`);
  }
  if (view === "instructional_plan") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.expectedRevision != null || raw.limit != null || raw.cursor != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null) {
      fail("invalid_tool_argument", "Paginação não pertence ao plano instrucional.");
    }
    return route("GET", `/v1/courses/${courseId}/instructional-plan`);
  }
  if (view === "part_materialization") {
    if (raw.expectedRevision != null || raw.limit != null || raw.cursor != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null) {
      fail("invalid_tool_argument", "Paginação não pertence à materialização da Parte.");
    }
    const authoringPartId = requiredUuid(raw.authoringPartId, "authoringPartId");
    const materializationId = requiredUuid(raw.materializationId, "materializationId");
    return route(
      "GET",
      `/v1/courses/${courseId}/authoring-parts/${authoringPartId}` +
        `/materializations/${materializationId}`
    );
  }
  if (raw.authoringPartId != null || raw.materializationId != null ||
      raw.expectedRevision != null || raw.limit != null || raw.cursor != null ||
      raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
      raw.maxBytes != null) {
    fail("invalid_tool_argument", "Paginação só pertence à leitura de entidades.");
  }
  return route("GET", `/v1/courses/${courseId}${searchParams({ view })}`);
}

function mapCreate(raw) {
  exactFields(raw, new Set(["requestId", "title", "objective"]));
  const requestId = requiredRequestId(raw.requestId);
  return route("POST", "/v1/courses", requestId, {
    requestId,
    title: requiredText(raw.title, "title", { maximum: 300 }),
    objective: requiredText(raw.objective, "objective", { maximum: 2_000 })
  });
}

function mapChange(raw) {
  exactFields(raw, new Set([
    "requestId", "courseId", "expectedRevision", "expectedPlanVersion",
    "operation", "planCommand", "materializationCommand", "upserts", "deletes"
  ]));
  const requestId = requiredRequestId(raw.requestId);
  const courseId = requiredUuid(raw.courseId, "courseId");
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "update_instructional_plan",
    "commit_course_composition",
    "advance_part_materialization"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
  if (operation === "update_instructional_plan") {
    if (raw.materializationCommand != null || raw.upserts != null || raw.deletes != null) {
      fail("invalid_tool_argument", "O comando do plano recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.planCommand, "planCommand", 32 * 1024);
    return route("POST", `/v1/courses/${courseId}/instructional-plan/changes`, requestId, {
      requestId,
      expectedCourseRevision: expectedRevision,
      expectedPlanVersion: positiveInteger(raw.expectedPlanVersion, "expectedPlanVersion"),
      command
    });
  }
  if (operation === "commit_course_composition") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null || raw.materializationCommand != null) {
      fail("invalid_tool_argument", "A composição recebeu campos incompatíveis.");
    }
    const upserts = Array.isArray(raw.upserts) ? raw.upserts : [];
    const deletes = Array.isArray(raw.deletes) ? raw.deletes : [];
    if (!upserts.length && !deletes.length) {
      fail("invalid_tool_argument", "Informe entidades para inserir, alterar ou excluir.");
    }
    if (upserts.length > 200 || deletes.length > 200) {
      fail("invalid_tool_argument", "A alteração excede 200 entidades por grupo.");
    }
    return route("POST", `/v1/courses/${courseId}/composition`, requestId, {
      requestId,
      expectedRevision,
      upserts,
      deletes
    });
  }
  if (raw.expectedPlanVersion != null || raw.planCommand != null || raw.upserts != null || raw.deletes != null) {
    fail("invalid_tool_argument", "A materialização recebeu campos incompatíveis.");
  }
  const command = boundedJsonObject(
    raw.materializationCommand,
    "materializationCommand",
    512 * 1024
  );
  const authoringPartId = requiredUuid(command.authoringPartId, "authoringPartId");
  const materializationId = requiredUuid(command.materializationId, "materializationId");
  command.operation = requiredText(command.operation, "materializationCommand.operation", {
    maximum: 20
  });
  if (!new Set(["start", "record_step", "finish"]).has(command.operation)) {
    fail("invalid_tool_argument", "A operação de materialização é inválida.");
  }
  command.expectedMaterializationVersion = nonNegativeInteger(
    command.expectedMaterializationVersion,
    "expectedMaterializationVersion"
  );
  return route(
    "POST",
    `/v1/courses/${courseId}/authoring-parts/${authoringPartId}/materializations/${materializationId}/changes`,
    requestId,
    {
      requestId,
      expectedCourseRevision: expectedRevision,
      operation: command.operation,
      expectedMaterializationVersion: command.expectedMaterializationVersion,
      payload: Object.fromEntries(Object.entries(command).filter(([field]) => !new Set([
        "operation", "authoringPartId", "materializationId", "expectedMaterializationVersion"
      ]).has(field)))
    }
  );
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
    "operation", "query", "intent", "slot", "packages", "studyUnitJson", "limit"
  ]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "explore", "search", "inspect", "contracts", "validate_study_unit",
    "audit_representation", "preview_study_unit"
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
