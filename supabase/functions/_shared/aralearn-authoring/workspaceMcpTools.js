import { AuthoringApiError } from "./errors.js";
import { listResourceIds } from "../aralearn/runtime/resources/registry/index.js";

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
const ENTITY_PATH = Object.freeze({
  type: "array",
  minItems: 1,
  maxItems: 5,
  items: ID
});
function fixedEntityPath(length) {
  return Object.freeze({
    type: "array",
    minItems: length,
    maxItems: length,
    items: ID
  });
}
const COURSE_PATH = fixedEntityPath(1);
const MODULE_PATH = fixedEntityPath(2);
const MICROSEQUENCE_PATH = fixedEntityPath(4);
const OPEN_OBJECT = Object.freeze({ type: "object", additionalProperties: true });
const AUTHORING_RESOURCE_IDS = Object.freeze([...listResourceIds()]);
const MCP_SECURITY_SCHEMES = Object.freeze([
  Object.freeze({ type: "oauth2", scopes: Object.freeze(["openid"]) })
]);
const ERROR_OUTPUT_BRANCH = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["ok", "requestId", "error"],
  properties: {
    ok: { const: false },
    requestId: { type: ["string", "null"] },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {}
      }
    }
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

function outputSchema(dataSchema, requestIdSchema) {
  if (!dataSchema || typeof dataSchema !== "object"
      || Array.isArray(dataSchema) || Object.keys(dataSchema).length === 0) {
    throw new TypeError("Cada ferramenta MCP exige um schema de sucesso especializado.");
  }
  return Object.freeze({
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["ok", "requestId", "data"],
        properties: {
          ok: { const: true },
          requestId: requestIdSchema,
          data: dataSchema
        }
      },
      ERROR_OUTPUT_BRANCH
    ]
  });
}

function readSchema(required = [], properties = {}) {
  return schema(required, properties);
}

function writeSchema(required = [], properties = {}) {
  return schema(["requestId", ...required], { requestId: REQUEST_ID, ...properties });
}

function entityShapeConditions({ pathField = null, parentField = null } = {}) {
  return ENTITY_TYPE.enum.map((entityType, index) => {
    const depth = index + 1;
    const properties = {};
    const required = [];
    if (pathField) properties[pathField] = fixedEntityPath(depth);
    if (parentField) {
      properties[parentField] = depth === 1
        ? { type: "null" }
        : fixedEntityPath(depth - 1);
      if (depth > 1) required.push(parentField);
    }
    return {
      if: {
        properties: { entityType: { const: entityType } },
        required: ["entityType"]
      },
      then: {
        ...(required.length ? { required } : {}),
        properties
      }
    };
  });
}

function entityWriteSchema(required, properties, shape) {
  return Object.freeze({
    ...writeSchema(required, properties),
    allOf: entityShapeConditions(shape)
  });
}

function publicationSchema() {
  return Object.freeze({
    ...writeSchema([
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
    }),
    allOf: [
      {
        if: {
          properties: { target: { const: "catalog" } },
          required: ["target"]
        },
        then: {
          required: ["collectionId"],
          properties: { completion: { const: "complete" } }
        },
        else: { not: { required: ["collectionId"] } }
      },
      {
        if: {
          properties: { publicationMode: { const: "update" } },
          required: ["publicationMode"]
        },
        then: { required: ["existingCourseId", "expectedContentHash"] },
        else: {
          allOf: [
            { not: { required: ["existingCourseId"] } },
            { not: { required: ["expectedContentHash"] } }
          ]
        }
      }
    ]
  });
}

const NON_EMPTY_STRING = Object.freeze({
  type: "string",
  minLength: 1,
  pattern: "\\S"
});
const SHA256 = Object.freeze({
  type: "string",
  pattern: "^[a-f0-9]{64}$"
});
const DATE_TIME = Object.freeze({ type: "string", format: "date-time" });
const NULLABLE_DATE_TIME = Object.freeze({
  type: ["string", "null"],
  format: "date-time"
});
const NULLABLE_UUID = Object.freeze({
  type: ["string", "null"],
  format: "uuid"
});
const NULLABLE_SHA256 = Object.freeze({
  type: ["string", "null"],
  pattern: "^[a-f0-9]{64}$"
});
const NON_NEGATIVE_INTEGER = Object.freeze({ type: "integer", minimum: 0 });
const STRING_LIST = Object.freeze({
  type: "array",
  items: { type: "string" }
});
const OPEN_CANONICAL_OBJECT = Object.freeze({
  type: "object",
  additionalProperties: true,
  description: "Objeto canônico integral cujo formato depende da entidade ou documento solicitado."
});
const RESOURCE_SELECTION_SCHEMA = schema([
  "useWhen", "avoidWhen", "variationAxes"
], {
  useWhen: STRING_LIST,
  avoidWhen: STRING_LIST,
  variationAxes: STRING_LIST
});
const RESOURCE_SUMMARY_SCHEMA = schema([
  "resource",
  "label",
  "purpose",
  "operations",
  "selection",
  "exercises",
  "gapTargets",
  "structuredPracticeTargets"
], {
  resource: { type: "string", enum: AUTHORING_RESOURCE_IDS },
  label: NON_EMPTY_STRING,
  purpose: NON_EMPTY_STRING,
  operations: STRING_LIST,
  selection: RESOURCE_SELECTION_SCHEMA,
  exercises: STRING_LIST,
  gapTargets: STRING_LIST,
  structuredPracticeTargets: STRING_LIST
});
const RESOURCE_LIST_DATA_SCHEMA = schema(["contract", "resources"], {
  contract: { const: "aralearn.authoring-resources.v4" },
  resources: {
    type: "array",
    items: RESOURCE_SUMMARY_SCHEMA
  }
});
const RESOURCE_DEFINITION_DATA_SCHEMA = schema(["contract", "definition"], {
  contract: { const: "aralearn.authoring-resources.v4" },
  definition: {
    type: "object",
    additionalProperties: true,
    description: "Contrato canônico integral do resource, incluindo exemplo e authoringSchema próprios."
  }
});
const PERSONAL_COURSE_SCHEMA = schema([
  "selectionId",
  "courseId",
  "kind",
  "contractKey",
  "title",
  "goal",
  "position",
  "publicationSeq",
  "catalogRevision",
  "contentHash",
  "moduleCount",
  "lessonCount",
  "pathId",
  "pathTitle",
  "lastActivityAt"
], {
  selectionId: UUID,
  courseId: UUID,
  kind: { type: "string", enum: ["official", "personal"] },
  contractKey: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  goal: NON_EMPTY_STRING,
  position: NON_NEGATIVE_INTEGER,
  publicationSeq: NON_NEGATIVE_INTEGER,
  catalogRevision: REVISION,
  contentHash: SHA256,
  moduleCount: NON_NEGATIVE_INTEGER,
  lessonCount: NON_NEGATIVE_INTEGER,
  pathId: NULLABLE_UUID,
  pathTitle: { type: ["string", "null"] },
  lastActivityAt: NULLABLE_DATE_TIME
});
const PERSONAL_COURSE_CURSOR_SCHEMA = schema([
  "afterPosition", "afterSelectionId"
], {
  afterPosition: NON_NEGATIVE_INTEGER,
  afterSelectionId: UUID
});
const PERSONAL_LIBRARY_DATA_SCHEMA = schema(["items", "nextCursor"], {
  items: {
    type: "array",
    items: PERSONAL_COURSE_SCHEMA
  },
  nextCursor: {
    anyOf: [
      { type: "null" },
      PERSONAL_COURSE_CURSOR_SCHEMA
    ]
  }
});
const CATALOG_COLLECTION_SCHEMA = schema([
  "collectionId",
  "contractKey",
  "title",
  "description",
  "position",
  "status",
  "revision",
  "courseCount",
  "createdAt",
  "updatedAt"
], {
  collectionId: UUID,
  contractKey: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  description: { type: "string" },
  position: NON_NEGATIVE_INTEGER,
  status: { const: "active" },
  revision: REVISION,
  courseCount: NON_NEGATIVE_INTEGER,
  createdAt: DATE_TIME,
  updatedAt: DATE_TIME
});
const POSITION_ID_CURSOR_SCHEMA = schema(["afterPosition", "afterId"], {
  afterPosition: NON_NEGATIVE_INTEGER,
  afterId: UUID
});
const CATALOG_COLLECTIONS_DATA_SCHEMA = schema(["items", "nextCursor"], {
  items: {
    type: "array",
    items: CATALOG_COLLECTION_SCHEMA
  },
  nextCursor: {
    anyOf: [
      { type: "null" },
      POSITION_ID_CURSOR_SCHEMA
    ]
  }
});
const CATALOG_COURSE_SCHEMA = schema([
  "placementId",
  "placementRevision",
  "position",
  "courseId",
  "contractKey",
  "title",
  "goal",
  "publicationSeq",
  "contentHash",
  "revision",
  "moduleCount",
  "lessonCount",
  "updatedAt"
], {
  placementId: UUID,
  placementRevision: REVISION,
  position: NON_NEGATIVE_INTEGER,
  courseId: UUID,
  contractKey: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  goal: NON_EMPTY_STRING,
  publicationSeq: NON_NEGATIVE_INTEGER,
  contentHash: SHA256,
  revision: REVISION,
  moduleCount: NON_NEGATIVE_INTEGER,
  lessonCount: NON_NEGATIVE_INTEGER,
  updatedAt: DATE_TIME
});
const CATALOG_COURSES_DATA_SCHEMA = schema([
  "collectionId", "items", "nextCursor"
], {
  collectionId: UUID,
  items: {
    type: "array",
    items: CATALOG_COURSE_SCHEMA
  },
  nextCursor: {
    anyOf: [
      { type: "null" },
      POSITION_ID_CURSOR_SCHEMA
    ]
  }
});
const OUTLINE_CARD_SCHEMA = schema([
  "id", "entityPath", "title", "resource", "kind", "position"
], {
  id: ID,
  entityPath: fixedEntityPath(5),
  title: NON_EMPTY_STRING,
  resource: { type: "string", enum: AUTHORING_RESOURCE_IDS },
  kind: { type: "string", enum: ["theory", "exercise"] },
  position: REVISION
});
const OUTLINE_MICROSEQUENCE_SCHEMA = schema([
  "id",
  "entityPath",
  "title",
  "goal",
  "role",
  "status",
  "cardCount",
  "cards"
], {
  id: ID,
  entityPath: fixedEntityPath(4),
  title: NON_EMPTY_STRING,
  goal: NON_EMPTY_STRING,
  role: {
    type: "string",
    enum: ["explain", "practice", "review", "support"]
  },
  status: {
    type: "string",
    enum: ["planned", "generated", "needs_review", "ready"]
  },
  cardCount: NON_NEGATIVE_INTEGER,
  cards: {
    type: "array",
    items: OUTLINE_CARD_SCHEMA
  }
});
const OUTLINE_LESSON_SCHEMA = schema([
  "id", "entityPath", "title", "microsequences"
], {
  id: ID,
  entityPath: fixedEntityPath(3),
  title: NON_EMPTY_STRING,
  microsequences: {
    type: "array",
    items: OUTLINE_MICROSEQUENCE_SCHEMA
  }
});
const OUTLINE_MODULE_SCHEMA = schema([
  "id", "entityPath", "title", "lessons"
], {
  id: ID,
  entityPath: MODULE_PATH,
  title: NON_EMPTY_STRING,
  lessons: {
    type: "array",
    items: OUTLINE_LESSON_SCHEMA
  }
});
const OUTLINE_COURSE_SCHEMA = schema([
  "id", "entityPath", "title", "goal", "modules"
], {
  id: ID,
  entityPath: COURSE_PATH,
  title: NON_EMPTY_STRING,
  goal: NON_EMPTY_STRING,
  modules: {
    type: "array",
    items: OUTLINE_MODULE_SCHEMA
  }
});
const WORKSPACE_OUTLINE_SCHEMA = schema(["courses"], {
  courses: {
    type: "array",
    items: OUTLINE_COURSE_SCHEMA
  }
});
const MICROTHEORY_REVIEW_ENTRY_SCHEMA = schema([
  "id", "entityPath", "title", "goal", "status", "content", "practiceCount"
], {
  id: ID,
  entityPath: fixedEntityPath(4),
  title: NON_EMPTY_STRING,
  goal: NON_EMPTY_STRING,
  status: {
    type: "string",
    enum: ["planned", "generated", "needs_review", "ready"]
  },
  content: { type: "string" },
  practiceCount: { type: "integer", minimum: 0 }
});
const MICROTHEORY_REVIEW_LESSON_SCHEMA = schema([
  "id", "entityPath", "title", "microtheories"
], {
  id: ID,
  entityPath: fixedEntityPath(3),
  title: NON_EMPTY_STRING,
  microtheories: {
    type: "array",
    items: MICROTHEORY_REVIEW_ENTRY_SCHEMA
  }
});
const MICROTHEORY_REVIEW_MODULE_SCHEMA = schema([
  "id", "entityPath", "title", "lessons"
], {
  id: ID,
  entityPath: MODULE_PATH,
  title: NON_EMPTY_STRING,
  lessons: {
    type: "array",
    items: MICROTHEORY_REVIEW_LESSON_SCHEMA
  }
});
const MICROTHEORY_REVIEW_COURSE_SCHEMA = schema([
  "id", "entityPath", "title", "modules"
], {
  id: ID,
  entityPath: COURSE_PATH,
  title: NON_EMPTY_STRING,
  modules: {
    type: "array",
    items: MICROTHEORY_REVIEW_MODULE_SCHEMA
  }
});
const WORKSPACE_ARTIFACT_SCHEMA = schema([
  "hash", "bucket", "objectKey", "artifactType", "mediaType", "sizeBytes"
], {
  hash: SHA256,
  bucket: {
    type: "string",
    enum: ["aralearn-authoring-artifacts", "aralearn-course-revisions"]
  },
  objectKey: {
    type: "string",
    pattern: "^artifacts/sha256/[a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]{64}\\.json$"
  },
  artifactType: {
    ...NON_EMPTY_STRING,
    maxLength: 120
  },
  mediaType: { const: "application/json" },
  sizeBytes: { type: "integer", minimum: 1 }
});
const WORKSPACE_CONTROL_REQUIRED = Object.freeze([
  "workspaceId",
  "title",
  "revision",
  "currentRevision",
  "sourceCourseId",
  "sourceRevisionHash",
  "createdAt",
  "updatedAt",
  "idempotent",
  "artifact"
]);
const WORKSPACE_CONTROL_PROPERTIES = Object.freeze({
  workspaceId: UUID,
  title: {
    ...NON_EMPTY_STRING,
    maxLength: 300
  },
  revision: REVISION,
  currentRevision: REVISION,
  sourceCourseId: NULLABLE_UUID,
  sourceRevisionHash: NULLABLE_SHA256,
  createdAt: DATE_TIME,
  updatedAt: DATE_TIME,
  idempotent: { type: "boolean" },
  artifact: WORKSPACE_ARTIFACT_SCHEMA
});
const WORKSPACE_REVISION_DATA_SCHEMA = schema(
  WORKSPACE_CONTROL_REQUIRED,
  WORKSPACE_CONTROL_PROPERTIES
);
const WORKSPACE_READ_DATA_SCHEMA = Object.freeze({
  ...schema(
    [...WORKSPACE_CONTROL_REQUIRED, "view", "content"],
    {
      ...WORKSPACE_CONTROL_PROPERTIES,
      idempotent: { const: false },
      view: {
        type: "string",
        enum: ["outline", "entity", "document"]
      },
      content: OPEN_CANONICAL_OBJECT
    }
  ),
  allOf: [{
    if: {
      properties: { view: { const: "outline" } },
      required: ["view"]
    },
    then: {
      properties: { content: WORKSPACE_OUTLINE_SCHEMA }
    }
  }]
});
const COURSE_READ_DATA_SCHEMA = Object.freeze({
  ...schema([
    "courseId",
    "title",
    "revisionHash",
    "completionState",
    "view",
    "content"
  ], {
    courseId: UUID,
    title: NON_EMPTY_STRING,
    revisionHash: SHA256,
    completionState: {
      type: "string",
      enum: ["partial", "complete"]
    },
    view: {
      type: "string",
      enum: ["outline", "entity", "document"]
    },
    content: OPEN_CANONICAL_OBJECT
  }),
  allOf: [{
    if: {
      properties: { view: { const: "outline" } },
      required: ["view"]
    },
    then: {
      properties: { content: WORKSPACE_OUTLINE_SCHEMA }
    }
  }]
});
const MICROTHEORY_REVIEW_DATA_SCHEMA = schema([
  ...WORKSPACE_CONTROL_REQUIRED,
  "view",
  "content"
], {
  ...WORKSPACE_CONTROL_PROPERTIES,
  idempotent: { const: false },
  view: { const: "microtheories" },
  content: schema(["courses"], {
    courses: {
      type: "array",
      items: MICROTHEORY_REVIEW_COURSE_SCHEMA
    }
  })
});
const WORKSPACE_LIST_ITEM_SCHEMA = schema([
  "workspaceId",
  "title",
  "revision",
  "sourceCourseId",
  "sourceRevisionHash",
  "updatedAt",
  "createdAt"
], {
  workspaceId: UUID,
  title: NON_EMPTY_STRING,
  revision: REVISION,
  sourceCourseId: NULLABLE_UUID,
  sourceRevisionHash: NULLABLE_SHA256,
  updatedAt: DATE_TIME,
  createdAt: DATE_TIME
});
const WORKSPACE_CURSOR_SCHEMA = schema(["beforeUpdatedAt", "beforeId"], {
  beforeUpdatedAt: DATE_TIME,
  beforeId: UUID
});
const WORKSPACE_LIST_DATA_SCHEMA = schema([
  "items", "hasMore", "nextCursor"
], {
  items: {
    type: "array",
    items: WORKSPACE_LIST_ITEM_SCHEMA
  },
  hasMore: { type: "boolean" },
  nextCursor: {
    anyOf: [
      { type: "null" },
      WORKSPACE_CURSOR_SCHEMA
    ]
  }
});
const WORKSPACE_HISTORY_ITEM_SCHEMA = schema([
  "revision",
  "parentRevision",
  "operation",
  "requestId",
  "actorId",
  "artifactHash",
  "createdAt"
], {
  revision: REVISION,
  parentRevision: {
    type: ["integer", "null"],
    minimum: 1
  },
  operation: {
    type: "string",
    enum: [
      "create",
      "import_course",
      "insert_entity",
      "replace_entity",
      "rename_entity",
      "move_entity",
      "delete_entity",
      "merge_microsequences",
      "split_microsequence",
      "promote_module",
      "demote_course",
      "restore_revision"
    ]
  },
  requestId: REQUEST_ID,
  actorId: NULLABLE_UUID,
  artifactHash: SHA256,
  createdAt: DATE_TIME
});
const WORKSPACE_HISTORY_CURSOR_SCHEMA = schema(["beforeRevision"], {
  beforeRevision: REVISION
});
const WORKSPACE_HISTORY_DATA_SCHEMA = schema([
  "items", "hasMore", "nextCursor"
], {
  items: {
    type: "array",
    items: WORKSPACE_HISTORY_ITEM_SCHEMA
  },
  hasMore: { type: "boolean" },
  nextCursor: {
    anyOf: [
      { type: "null" },
      WORKSPACE_HISTORY_CURSOR_SCHEMA
    ]
  }
});
const WORKSPACE_PUBLICATION_DATA_SCHEMA = schema([
  "workspaceId",
  "revision",
  "courseId",
  "contentHash",
  "completionState",
  "target",
  "idempotent"
], {
  workspaceId: UUID,
  revision: REVISION,
  courseId: UUID,
  contentHash: SHA256,
  completionState: {
    type: "string",
    enum: ["partial", "complete"]
  },
  target: {
    type: "string",
    enum: ["private", "catalog"]
  },
  idempotent: { type: "boolean" }
});
const WORKSPACE_DELETION_DATA_SCHEMA = schema([
  "workspaceId", "deleted", "idempotent"
], {
  workspaceId: UUID,
  deleted: { const: true },
  idempotent: { type: "boolean" }
});

function tool(
  name,
  title,
  description,
  inputSchema,
  dataSchema,
  annotations = {}
) {
  const successRequestIdSchema = inputSchema.required?.includes("requestId")
    ? REQUEST_ID
    : { const: null };
  return Object.freeze({
    name,
    title,
    description,
    inputSchema,
    outputSchema: outputSchema(dataSchema, successRequestIdSchema),
    securitySchemes: MCP_SECURITY_SCHEMES,
    _meta: Object.freeze({ securitySchemes: MCP_SECURITY_SCHEMES }),
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
  entityPath: ENTITY_PATH,
  includeDescendants: { type: "boolean", default: true }
});

const WORKSPACE_VIEW_PROPERTIES = VIEW_PROPERTIES;

export const AUTHORING_WORKSPACE_MCP_TOOLS = Object.freeze([
  tool(
    "listarRecursosDeCard",
    "Listar recursos de card",
    "Lista os recursos v4 disponíveis e a finalidade didática de cada um.",
    readSchema(),
    RESOURCE_LIST_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "consultarRecursoDeCard",
    "Consultar recurso de card",
    "Lê o contrato autoral e um exemplo válido do recurso informado.",
    readSchema(["resource"], {
      resource: {
        type: "string",
        enum: AUTHORING_RESOURCE_IDS
      }
    }),
    RESOURCE_DEFINITION_DATA_SCHEMA,
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
    PERSONAL_LIBRARY_DATA_SCHEMA,
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
    CATALOG_COLLECTIONS_DATA_SCHEMA,
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
    CATALOG_COURSES_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "lerConteudoDoCurso",
    "Ler conteúdo de curso",
    "Lê a árvore, uma entidade ou o documento v4 de um curso acessível.",
    readSchema(["courseId"], { courseId: UUID, ...VIEW_PROPERTIES }),
    COURSE_READ_DATA_SCHEMA,
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
    WORKSPACE_LIST_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "criarWorkspaceDeAutoria",
    "Criar workspace",
    "Cria um workspace vazio ou inicia um a partir de um curso existente.",
    writeSchema(["title"], {
      title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
      sourceCourseId: UUID
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "lerWorkspaceDeAutoria",
    "Ler workspace",
    "Lê a árvore, uma entidade ou o documento completo de uma revisão do workspace.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      revision: REVISION,
      ...WORKSPACE_VIEW_PROPERTIES
    }),
    WORKSPACE_READ_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "revisarMicroteoriasDoWorkspace",
    "Revisar microteorias",
    "Retorna cada microteoria como conteúdo conceitual agregado e somente a contagem de práticas; não enumera cards no chat.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      revision: REVISION,
      entityPath: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: ID
      }
    }),
    MICROTHEORY_REVIEW_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "listarHistoricoDoWorkspace",
    "Listar histórico",
    "Lista revisões imutáveis do workspace para auditoria ou restauração.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      beforeRevision: REVISION
    }),
    WORKSPACE_HISTORY_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "importarCursoNoWorkspace",
    "Importar curso",
    "Acrescenta um curso existente ao workspace para reaproveitar ou mover suas partes.",
    writeSchema(["workspaceId", "expectedRevision", "courseId", "workspaceCourseId"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      courseId: UUID,
      workspaceCourseId: ID,
      position: { type: "integer", minimum: 0 }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "inserirEntidadeNoWorkspace",
    "Inserir entidade",
    "Insere um curso, módulo, lição, microssequência ou card completo no pai informado.",
    entityWriteSchema(["workspaceId", "expectedRevision", "entityType", "entity"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      parentPath: {
        type: ["array", "null"],
        minItems: 1,
        maxItems: 4,
        items: ID
      },
      position: { type: "integer", minimum: 0 },
      entity: OPEN_OBJECT
    }, { parentField: "parentPath" }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "substituirEntidadeNoWorkspace",
    "Substituir entidade",
    "Substitui atomicamente uma entidade completa preservando seu id.",
    entityWriteSchema(["workspaceId", "expectedRevision", "entityType", "entityPath", "entity"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityPath: ENTITY_PATH,
      entity: OPEN_OBJECT
    }, { pathField: "entityPath" }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "renomearEntidadeNoWorkspace",
    "Renomear entidade",
    "Renomeia qualquer nível estrutural do workspace.",
    entityWriteSchema(["workspaceId", "expectedRevision", "entityType", "entityPath", "title"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityPath: ENTITY_PATH,
      title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" }
    }, { pathField: "entityPath" }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "moverEntidadeNoWorkspace",
    "Mover entidade",
    "Move ou reordena uma entidade; módulos, lições, microssequências e cards podem atravessar cursos.",
    entityWriteSchema(["workspaceId", "expectedRevision", "entityType", "entityPath"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityPath: ENTITY_PATH,
      targetParentPath: {
        type: ["array", "null"],
        minItems: 1,
        maxItems: 4,
        items: ID
      },
      position: { type: "integer", minimum: 0 }
    }, { pathField: "entityPath", parentField: "targetParentPath" }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "excluirEntidadeDoWorkspace",
    "Excluir entidade",
    "Exclui uma entidade e seus descendentes na nova revisão do workspace.",
    entityWriteSchema(["workspaceId", "expectedRevision", "entityType", "entityPath"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: ENTITY_TYPE,
      entityPath: ENTITY_PATH
    }, { pathField: "entityPath" }),
    WORKSPACE_REVISION_DATA_SCHEMA,
    { destructiveHint: true }
  ),
  tool(
    "juntarMicrossequencias",
    "Juntar microssequências",
    "Junta cards e metadados de microssequências da mesma lição e atualiza dependências.",
    writeSchema(["workspaceId", "expectedRevision", "targetPath", "sourcePaths"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      targetPath: MICROSEQUENCE_PATH,
      sourcePaths: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        uniqueItems: true,
        items: MICROSEQUENCE_PATH
      },
      title: { type: "string", minLength: 1, maxLength: 300 },
      goal: { type: "string", minLength: 1, maxLength: 2000 }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "separarMicrossequencia",
    "Separar microssequência",
    "Move cards selecionados para uma nova microssequência validada na mesma lição.",
    writeSchema([
      "workspaceId", "expectedRevision", "sourcePath", "newMicrosequence", "cardIds"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      sourcePath: MICROSEQUENCE_PATH,
      newMicrosequence: OPEN_OBJECT,
      cardIds: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        uniqueItems: true,
        items: ID
      },
      position: { type: "integer", minimum: 0 }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "promoverModuloACurso",
    "Transformar módulo em curso",
    "Cria um curso no workspace contendo o módulo indicado; pode mover ou copiar.",
    writeSchema(["workspaceId", "expectedRevision", "modulePath", "courseId", "goal"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      modulePath: MODULE_PATH,
      courseId: ID,
      title: { type: "string", minLength: 1, maxLength: 300 },
      goal: { type: "string", minLength: 1, maxLength: 2000 },
      mode: { type: "string", enum: ["move", "copy"], default: "move" }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "rebaixarCursoAModulo",
    "Transformar curso em módulo",
    "Achata os módulos do curso de origem em um novo módulo do curso de destino; pode mover ou copiar.",
    writeSchema([
      "workspaceId", "expectedRevision", "coursePath", "targetCoursePath", "moduleId"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      coursePath: COURSE_PATH,
      targetCoursePath: COURSE_PATH,
      moduleId: ID,
      title: { type: "string", minLength: 1, maxLength: 300 },
      mode: { type: "string", enum: ["move", "copy"], default: "move" }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "restaurarRevisaoDoWorkspace",
    "Restaurar revisão",
    "Cria uma nova revisão com o conteúdo exato de uma revisão anterior; não apaga histórico.",
    writeSchema(["workspaceId", "expectedRevision", "revision"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      revision: REVISION
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "publicarCursoDoWorkspace",
    "Publicar curso",
    "Publica um curso do workspace. partial cria uma prévia privada testável; o catálogo exige complete.",
    publicationSchema(),
    WORKSPACE_PUBLICATION_DATA_SCHEMA
  ),
  tool(
    "excluirWorkspaceDeAutoria",
    "Excluir workspace",
    "Remove o workspace da lista ativa; cursos já publicados e revisões de curso permanecem.",
    writeSchema(["workspaceId"], { workspaceId: UUID }),
    WORKSPACE_DELETION_DATA_SCHEMA,
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
  if (type == null) return true;
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === "null") return value === null;
    if (candidate === "object") return value && typeof value === "object" && !Array.isArray(value);
    if (candidate === "array") return Array.isArray(value);
    if (candidate === "integer") return Number.isInteger(value);
    if (candidate === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === candidate;
  });
}

function invalidValue(field, message, details = null) {
  throw new AuthoringApiError(
    422,
    "invalid_tool_arguments",
    `${field} ${message}.`,
    details || { field, path: field }
  );
}

function canonicalValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function valuesEqual(left, right) {
  return canonicalValue(left) === canonicalValue(right);
}

function validDateTime(value) {
  const match = String(value).match(
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
  );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(0);
  calendar.setUTCHours(0, 0, 0, 0);
  calendar.setUTCFullYear(year, month - 1, day);
  return calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day;
}

function schemaMatches(value, definition) {
  try {
    validateValue(value, definition, "arguments");
    return true;
  } catch (error) {
    if (error instanceof AuthoringApiError
        && error.code === "invalid_tool_arguments") return false;
    throw error;
  }
}

function validateValue(value, definition, field) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError(`Schema inválido em ${field}.`);
  }
  if (!matchesType(value, definition.type)) {
    invalidValue(field, "tem tipo inválido");
  }
  if (Object.hasOwn(definition, "const") && !valuesEqual(value, definition.const)) {
    invalidValue(field, "não corresponde ao valor obrigatório");
  }
  if (definition.enum && !definition.enum.some((candidate) => valuesEqual(value, candidate))) {
    invalidValue(field, "não usa um valor permitido");
  }
  if (typeof value === "string") {
    if (definition.minLength != null && value.length < definition.minLength) {
      invalidValue(field, "é curto demais");
    }
    if (definition.maxLength != null && value.length > definition.maxLength) {
      invalidValue(field, "é longo demais");
    }
    if (definition.pattern && !new RegExp(definition.pattern, "u").test(value)) {
      invalidValue(field, "tem formato inválido");
    }
    if (definition.format === "uuid"
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
      invalidValue(field, "deve ser UUID");
    }
    if (definition.format === "date-time" && !validDateTime(value)) {
      invalidValue(field, "deve usar data e hora RFC 3339");
    }
  }
  if (typeof value === "number") {
    if (definition.minimum != null && value < definition.minimum) {
      invalidValue(field, "é menor que o permitido");
    }
    if (definition.maximum != null && value > definition.maximum) {
      invalidValue(field, "é maior que o permitido");
    }
    if (definition.exclusiveMinimum != null && value <= definition.exclusiveMinimum) {
      invalidValue(field, "não supera o limite mínimo");
    }
    if (definition.exclusiveMaximum != null && value >= definition.exclusiveMaximum) {
      invalidValue(field, "não fica abaixo do limite máximo");
    }
  }
  if (Array.isArray(value)) {
    if (definition.minItems != null && value.length < definition.minItems) {
      invalidValue(field, "tem poucos itens");
    }
    if (definition.maxItems != null && value.length > definition.maxItems) {
      invalidValue(field, "tem itens demais");
    }
    if (definition.uniqueItems
        && new Set(value.map(canonicalValue)).size !== value.length) {
      invalidValue(field, "não aceita itens repetidos");
    }
    if (definition.items) {
      value.forEach(
        (item, index) => validateValue(item, definition.items, `${field}[${index}]`)
      );
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = definition.properties || {};
    const missing = (definition.required || []).find(
      (property) => !Object.hasOwn(value, property)
    );
    if (missing) {
      invalidValue(
        `${field}.${missing}`,
        "é obrigatório",
        { field: missing, path: `${field}.${missing}` }
      );
    }
    for (const [property, propertyValue] of Object.entries(value)) {
      if (Object.hasOwn(properties, property)) {
        validateValue(propertyValue, properties[property], `${field}.${property}`);
      } else if (definition.additionalProperties === false) {
        invalidValue(
          `${field}.${property}`,
          "não é aceito",
          { field: property, path: `${field}.${property}` }
        );
      } else if (definition.additionalProperties
          && typeof definition.additionalProperties === "object") {
        validateValue(
          propertyValue,
          definition.additionalProperties,
          `${field}.${property}`
        );
      }
    }
  }
  if (definition.not && schemaMatches(value, definition.not)) {
    invalidValue(field, "usa uma combinação não permitida");
  }
  for (const condition of definition.allOf || []) {
    validateValue(value, condition, field);
  }
  if (definition.if) {
    const branch = schemaMatches(value, definition.if)
      ? definition.then
      : definition.else;
    if (branch) validateValue(value, branch, field);
  }
}

function validateArguments(definition, rawArguments) {
  if (!rawArguments || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
    throw new AuthoringApiError(422, "invalid_tool_arguments", "arguments deve ser objeto.");
  }
  validateValue(rawArguments, definition.inputSchema, "arguments");
  return rawArguments;
}

function query(argumentsValue, fields) {
  const params = new URLSearchParams();
  for (const field of fields) {
    if (argumentsValue[field] != null) {
      params.set(
        field,
        Array.isArray(argumentsValue[field])
          ? JSON.stringify(argumentsValue[field])
          : String(argumentsValue[field])
      );
    }
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
  if (!definition || principal?.authenticationKind !== "oauth" || !principal?.actorId) {
    return false;
  }
  const scopes = new Set(principal.scopes || []);
  if (scopes.has("*")) return true;
  if (CATALOG_READ.has(name)) {
    return scopes.has("catalog:publish")
      || scopes.has("authoring:read")
      || scopes.has("authoring:private:read");
  }
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
        "view", "entityType", "entityPath", "includeDescendants"
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
        "revision", "view", "entityType", "entityPath", "includeDescendants"
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
      }, ["revision", "view", "entityPath"]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarHistoricoDoWorkspace") {
    return {
      method: "GET",
      path: `/v1/workspaces/${encode(args.workspaceId)}/history` + query(
        args,
        ["limit", "beforeRevision"]
      ),
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
