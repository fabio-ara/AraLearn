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
const AUTHORING_INTENT = Object.freeze({
  type: "string",
  enum: ["inspect", "create", "extend", "revise", "restructure", "publish", "study"]
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

function pairedCursorReadSchema(required, properties, leftField, rightField) {
  return Object.freeze({
    ...readSchema(required, properties),
    allOf: [
      {
        if: { required: [leftField] },
        then: { required: [rightField] }
      },
      {
        if: { required: [rightField] },
        then: { required: [leftField] }
      }
    ]
  });
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

function structuralMetadataWriteSchema(required, properties) {
  const fieldsByType = Object.freeze({
    course: ["title", "goal"],
    module: ["title", "goal", "include", "exclude", "notation", "avoid"],
    lesson: [
      "title", "goal", "include", "exclude", "notation", "avoid", "topics"
    ],
    microsequence: [
      "title", "goal", "role", "status", "branchOf",
      "dependsOn", "covers", "checks", "errors"
    ]
  });
  const baseFields = ["workspaceId", "expectedRevision"];
  const metadataFields = [...new Set(Object.values(fieldsByType).flat())];
  return Object.freeze({
    type: "object",
    required: ["requestId", ...required],
    properties: {
      requestId: REQUEST_ID,
      ...Object.fromEntries(required.map((field) => [field, properties[field]])),
      ...Object.fromEntries(metadataFields.map((field) => [field, properties[field]]))
    },
    oneOf: STRUCTURAL_ENTITY_TYPE.enum.map((entityType, index) => {
      const fieldsForEntityType = fieldsByType[entityType];
      const branch = {
        ...writeSchema(required, {
          ...Object.fromEntries(baseFields.map((field) => [field, properties[field]])),
          entityType: { const: entityType },
          entityPath: fixedEntityPath(index + 1),
          ...Object.fromEntries(
            fieldsForEntityType.map((field) => [field, properties[field]])
          )
        }),
        anyOf: fieldsForEntityType.map((field) => ({ required: [field] }))
      };
      if (entityType !== "microsequence") return branch;
      return {
        ...branch,
        allOf: [{
          if: {
            required: ["status"],
            properties: { status: { const: "ready" } }
          },
          then: {
            not: {
              anyOf: fieldsForEntityType
                .filter((field) => field !== "status")
                .map((field) => ({ required: [field] }))
            }
          }
        }]
      };
    })
  });
}

function publicationSchema() {
  return Object.freeze({
    ...writeSchema([
      "workspaceId", "expectedRevision", "courseId", "target",
      "completion"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      courseId: ID,
      target: { type: "string", enum: ["private", "catalog"] },
      completion: { type: "string", enum: ["partial", "complete"] },
      existingCourseId: UUID,
      expectedContentHash: {
        type: "string",
        pattern: "^[a-f0-9]{64}$"
      },
      collectionId: UUID,
      submissionId: UUID
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
        else: {
          allOf: [
            { not: { required: ["collectionId"] } },
            { not: { required: ["submissionId"] } }
          ]
        }
      },
      {
        if: {
          anyOf: [
            { required: ["existingCourseId"] },
            { required: ["expectedContentHash"] }
          ]
        },
        then: { required: ["existingCourseId", "expectedContentHash"] }
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
const AUTHORING_GUIDANCE_SCHEMA = schema(["id", "title", "text"], {
  id: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  text: NON_EMPTY_STRING
});
const AUTHORING_RESOURCE_CONTRACT_SCHEMA = schema(["resource", "tool"], {
  resource: { type: "string", enum: AUTHORING_RESOURCE_IDS },
  tool: { const: "consultarRecursosDeCard" }
});
const STRUCTURAL_ENTITY_TYPE = Object.freeze({
  type: "string",
  enum: ["course", "module", "lesson", "microsequence"]
});
const AUTHORING_ACCESS_SCHEMA = schema([
  "profile",
  "privateAuthoring",
  "submitForCatalogReview",
  "reviewSubmissions",
  "publishCatalog",
  "manageCatalog",
  "availableTools"
], {
  profile: {
    type: "string",
    enum: ["private_author", "catalog_editor"]
  },
  privateAuthoring: { type: "boolean" },
  submitForCatalogReview: { type: "boolean" },
  reviewSubmissions: { type: "boolean" },
  publishCatalog: { type: "boolean" },
  manageCatalog: { type: "boolean" },
  availableTools: {
    type: "array",
    uniqueItems: true,
    items: NON_EMPTY_STRING
  }
});
const AUTHORING_CONTEXT_DATA_SCHEMA = schema([
  "briefVersion",
  "intent",
  "targetEntity",
  "workflow",
  "recommendedTools",
  "guidance",
  "resourceContracts",
  "access"
], {
  briefVersion: { const: 1 },
  intent: AUTHORING_INTENT,
  targetEntity: {
    type: ["string", "null"],
    enum: ["course", "module", "lesson", "microsequence", "card", null]
  },
  workflow: STRING_LIST,
  recommendedTools: STRING_LIST,
  guidance: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: AUTHORING_GUIDANCE_SCHEMA
  },
  resourceContracts: {
    type: "array",
    maxItems: AUTHORING_RESOURCE_IDS.length,
    items: AUTHORING_RESOURCE_CONTRACT_SCHEMA
  },
  access: AUTHORING_ACCESS_SCHEMA
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
const PERSONAL_LIBRARY_REMOVE_DATA_SCHEMA = schema([
  "status", "selectionId", "courseId", "kind", "courseArchived",
  "idempotent"
], {
  status: { const: "removed" },
  selectionId: UUID,
  courseId: UUID,
  kind: { type: "string", enum: ["official", "personal"] },
  courseArchived: { type: "boolean" },
  idempotent: { type: "boolean" }
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
const CATALOG_SEARCH_COLLECTION_SCHEMA = schema([
  "collectionId", "contractKey", "title"
], {
  collectionId: UUID,
  contractKey: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING
});
const CATALOG_SEARCH_COURSE_SCHEMA = schema([
  "placementId",
  "courseId",
  "contractKey",
  "title",
  "goal",
  "contentHash",
  "revision",
  "moduleCount",
  "lessonCount",
  "microsequenceCount",
  "cardCount",
  "updatedAt",
  "collection"
], {
  placementId: UUID,
  courseId: UUID,
  contractKey: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  goal: NON_EMPTY_STRING,
  contentHash: SHA256,
  revision: REVISION,
  moduleCount: NON_NEGATIVE_INTEGER,
  lessonCount: NON_NEGATIVE_INTEGER,
  microsequenceCount: NON_NEGATIVE_INTEGER,
  cardCount: NON_NEGATIVE_INTEGER,
  updatedAt: DATE_TIME,
  collection: CATALOG_SEARCH_COLLECTION_SCHEMA
});
const CATALOG_SEARCH_CURSOR_SCHEMA = schema([
  "afterTitle", "afterCourseId"
], {
  afterTitle: NON_EMPTY_STRING,
  afterCourseId: UUID
});
const CATALOG_SEARCH_DATA_SCHEMA = schema(["query", "items", "nextCursor"], {
  query: {
    type: "string",
    minLength: 2,
    maxLength: 200,
    pattern: "\\S"
  },
  items: {
    type: "array",
    items: CATALOG_SEARCH_COURSE_SCHEMA
  },
  nextCursor: {
    anyOf: [
      { type: "null" },
      CATALOG_SEARCH_CURSOR_SCHEMA
    ]
  }
});
const OUTLINE_MICROSEQUENCE_SCHEMA = schema([
  "id",
  "entityPath",
  "title",
  "goal",
  "role",
  "status",
  "cardCount"
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
  cardCount: NON_NEGATIVE_INTEGER
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
const WORKSPACE_CONTROL_REQUIRED = Object.freeze([
  "workspaceId",
  "title",
  "revision",
  "currentRevision",
  "entityCount",
  "createdAt",
  "updatedAt",
  "idempotent"
]);
const WORKSPACE_CHANGE_SCHEMA = schema([
  "operation", "created", "updated", "deleted"
], {
  operation: NON_EMPTY_STRING,
  created: NON_NEGATIVE_INTEGER,
  updated: NON_NEGATIVE_INTEGER,
  deleted: NON_NEGATIVE_INTEGER,
  targetPath: ENTITY_PATH,
  entityType: ENTITY_TYPE,
  sourceCourseId: UUID,
  importedCourseId: ID
});
const WORKSPACE_PUBLICATION_LINK_SCHEMA = schema([
  "workspaceCourseId",
  "target",
  "courseId",
  "contentHash",
  "completionState",
  "updatedAt"
], {
  workspaceCourseId: ID,
  target: {
    type: "string",
    enum: ["private", "catalog"]
  },
  courseId: UUID,
  contentHash: SHA256,
  completionState: {
    type: "string",
    enum: ["partial", "complete"]
  },
  updatedAt: DATE_TIME
});
const WORKSPACE_CONTROL_PROPERTIES = Object.freeze({
  workspaceId: UUID,
  title: {
    ...NON_EMPTY_STRING,
    maxLength: 300
  },
  revision: REVISION,
  currentRevision: REVISION,
  entityCount: NON_NEGATIVE_INTEGER,
  sourceCourseId: NULLABLE_UUID,
  sourceRevisionHash: NULLABLE_SHA256,
  sourceSubmissionId: NULLABLE_UUID,
  publications: {
    type: "array",
    items: WORKSPACE_PUBLICATION_LINK_SCHEMA
  },
  createdAt: DATE_TIME,
  updatedAt: DATE_TIME,
  idempotent: { type: "boolean" },
  change: WORKSPACE_CHANGE_SCHEMA
});
const WORKSPACE_REVISION_DATA_SCHEMA = schema(
  WORKSPACE_CONTROL_REQUIRED,
  WORKSPACE_CONTROL_PROPERTIES
);
const WORKSPACE_READ_DATA_SCHEMA = Object.freeze({
  ...schema(
    [...WORKSPACE_CONTROL_REQUIRED, "brief", "publications", "view", "content"],
    {
      ...WORKSPACE_CONTROL_PROPERTIES,
      idempotent: { const: false },
      brief: { type: "string", maxLength: 16_000 },
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
  "brief",
  "publications",
  "view",
  "content"
], {
  ...WORKSPACE_CONTROL_PROPERTIES,
  idempotent: { const: false },
  brief: { type: "string", maxLength: 16_000 },
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
  "publicationCount",
  "updatedAt",
  "createdAt"
], {
  workspaceId: UUID,
  title: NON_EMPTY_STRING,
  revision: REVISION,
  sourceCourseId: NULLABLE_UUID,
  sourceRevisionHash: NULLABLE_SHA256,
  sourceSubmissionId: NULLABLE_UUID,
  publicationCount: NON_NEGATIVE_INTEGER,
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
const WORKSPACE_EVENT_ITEM_SCHEMA = schema([
  "revision", "operation", "summary", "createdAt"
], {
  revision: REVISION,
  operation: NON_EMPTY_STRING,
  summary: WORKSPACE_CHANGE_SCHEMA,
  createdAt: DATE_TIME
});
const WORKSPACE_EVENTS_DATA_SCHEMA = schema(["items"], {
  items: {
    type: "array",
    items: WORKSPACE_EVENT_ITEM_SCHEMA
  }
});
const WORKSPACE_MICROSEQUENCE_CARD_ITEM_SCHEMA = schema([
  "id", "position", "kind", "resources", "summary"
], {
  id: ID,
  position: REVISION,
  kind: { type: "string", enum: ["theory", "exercise"] },
  resources: {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: { type: "string", enum: AUTHORING_RESOURCE_IDS }
  },
  summary: {
    type: "string",
    minLength: 1,
    maxLength: 240,
    pattern: "\\S"
  }
});
const WORKSPACE_CARD_CURSOR_SCHEMA = schema(["afterPosition", "afterId"], {
  afterPosition: REVISION,
  afterId: ID
});
const WORKSPACE_MICROSEQUENCE_CARDS_DATA_SCHEMA = schema([
  "workspaceId", "revision", "microsequencePath",
  "items", "hasMore", "nextCursor"
], {
  workspaceId: UUID,
  revision: REVISION,
  microsequencePath: MICROSEQUENCE_PATH,
  items: {
    type: "array",
    items: WORKSPACE_MICROSEQUENCE_CARD_ITEM_SCHEMA
  },
  hasMore: { type: "boolean" },
  nextCursor: {
    anyOf: [
      { type: "null" },
      WORKSPACE_CARD_CURSOR_SCHEMA
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
  "submissionId",
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
  submissionId: NULLABLE_UUID,
  idempotent: { type: "boolean" }
});
const CATALOG_REVIEW_ITEM_SCHEMA = schema([
  "submissionId", "courseId", "sourceRevisionHash", "title",
  "completionState", "status", "authorNote", "reviewerNote",
  "claimExpiresAt", "submittedAt", "decidedAt", "updatedAt"
], {
  submissionId: UUID,
  courseId: UUID,
  sourceRevisionHash: SHA256,
  title: NON_EMPTY_STRING,
  completionState: { type: "string", enum: ["partial", "complete"] },
  status: {
    type: "string",
    enum: [
      "submitted", "in_review", "changes_requested",
      "rejected", "accepted", "withdrawn", "superseded"
    ]
  },
  authorNote: { type: ["string", "null"] },
  authorId: NULLABLE_UUID,
  reviewerId: NULLABLE_UUID,
  reviewWorkspaceId: NULLABLE_UUID,
  claimExpiresAt: NULLABLE_DATE_TIME,
  reviewerNote: { type: ["string", "null"] },
  officialCourseId: NULLABLE_UUID,
  submittedAt: DATE_TIME,
  decidedAt: NULLABLE_DATE_TIME,
  updatedAt: DATE_TIME
});
const CATALOG_REVIEW_CURSOR_SCHEMA = schema([
  "beforeSubmittedAt", "beforeId"
], {
  beforeSubmittedAt: DATE_TIME,
  beforeId: UUID
});
const CATALOG_REVIEW_LIST_DATA_SCHEMA = schema([
  "view", "items", "hasMore", "nextCursor"
], {
  view: { type: "string", enum: ["mine", "queue"] },
  items: { type: "array", items: CATALOG_REVIEW_ITEM_SCHEMA },
  hasMore: { type: "boolean" },
  nextCursor: {
    anyOf: [
      { type: "null" },
      CATALOG_REVIEW_CURSOR_SCHEMA
    ]
  }
});
const REVIEW_STATUS_SCHEMA = Object.freeze({
  type: "string",
  enum: [
    "submitted", "in_review", "changes_requested",
    "rejected", "accepted", "withdrawn", "superseded"
  ]
});
const CATALOG_REVIEW_COMMAND_DATA_SCHEMA = schema(
  ["submissionId", "status"],
  {
    submissionId: UUID,
    courseId: UUID,
    title: NON_EMPTY_STRING,
    status: REVIEW_STATUS_SCHEMA,
    completionState: { type: "string", enum: ["partial", "complete"] },
    submittedAt: DATE_TIME,
    reviewerId: NULLABLE_UUID,
    reviewWorkspaceId: NULLABLE_UUID,
    leaseExpiresAt: NULLABLE_DATE_TIME,
    idempotent: { type: "boolean" }
  }
);
const CATALOG_REVIEW_READ_DATA_SCHEMA = schema(
  [
    "submissionId", "courseId", "title", "goal", "completionState",
    "status", "sourceRevisionHash", "authorNote", "reviewerNote",
    "reviewWorkspaceId", "view", "content"
  ],
  {
    submissionId: UUID,
    courseId: UUID,
    title: NON_EMPTY_STRING,
    goal: NON_EMPTY_STRING,
    completionState: { type: "string", enum: ["partial", "complete"] },
    status: REVIEW_STATUS_SCHEMA,
    sourceRevisionHash: SHA256,
    authorNote: { type: ["string", "null"] },
    reviewerNote: { type: ["string", "null"] },
    reviewWorkspaceId: NULLABLE_UUID,
    view: { type: "string", enum: ["outline", "entity", "document"] },
    content: OPEN_CANONICAL_OBJECT
  }
);
const CATALOG_COLLECTION_COMMAND_DATA_SCHEMA = schema([
  "status", "collectionId", "contractKey", "title", "description",
  "position", "revision", "courseCount", "idempotent"
], {
  status: { type: "string", enum: ["created", "updated", "unchanged"] },
  collectionId: UUID,
  contractKey: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  description: { type: "string" },
  position: NON_NEGATIVE_INTEGER,
  revision: REVISION,
  courseCount: NON_NEGATIVE_INTEGER,
  idempotent: { type: "boolean" }
});
const CATALOG_COLLECTION_RETIRE_DATA_SCHEMA = schema([
  "status", "collectionId", "replacementCollectionId",
  "movedCourseCount", "revision", "idempotent"
], {
  status: { const: "retired" },
  collectionId: UUID,
  replacementCollectionId: NULLABLE_UUID,
  movedCourseCount: NON_NEGATIVE_INTEGER,
  revision: REVISION,
  idempotent: { type: "boolean" }
});
const CATALOG_COURSE_MOVE_DATA_SCHEMA = schema([
  "status", "courseId", "fromCollectionId", "collectionId",
  "position", "placementRevision", "idempotent"
], {
  status: { type: "string", enum: ["moved", "unchanged"] },
  courseId: UUID,
  fromCollectionId: UUID,
  collectionId: UUID,
  position: NON_NEGATIVE_INTEGER,
  placementRevision: REVISION,
  idempotent: { type: "boolean" }
});
const CATALOG_COURSE_REMOVE_DATA_SCHEMA = schema([
  "status", "courseId", "collectionId", "idempotent"
], {
  status: { const: "removed" },
  courseId: UUID,
  collectionId: UUID,
  idempotent: { type: "boolean" }
});
const WORKSPACE_DELETION_DATA_SCHEMA = schema([
  "workspaceId", "deleted", "idempotent"
], {
  workspaceId: UUID,
  deleted: { const: true },
  idempotent: { type: "boolean" }
});

function schemaAlwaysRequires(inputSchema, property) {
  if (inputSchema.required?.includes(property)) return true;
  if (inputSchema.oneOf?.length
      && inputSchema.oneOf.every(
        (branch) => schemaAlwaysRequires(branch, property)
      )) {
    return true;
  }
  if (inputSchema.anyOf?.length
      && inputSchema.anyOf.every(
        (branch) => schemaAlwaysRequires(branch, property)
      )) {
    return true;
  }
  return (inputSchema.allOf || []).some(
    (branch) => schemaAlwaysRequires(branch, property)
  );
}

function tool(
  name,
  title,
  description,
  inputSchema,
  dataSchema,
  annotations = {}
) {
  const {
    actionConsequentialHint = false,
    ...protocolAnnotations
  } = annotations;
  const readOnlyHint = protocolAnnotations.readOnlyHint ?? false;
  const destructiveHint = protocolAnnotations.destructiveHint ?? !readOnlyHint;
  const successRequestIdSchema = schemaAlwaysRequires(inputSchema, "requestId")
    ? REQUEST_ID
    : { const: null };
  return Object.freeze({
    name,
    title,
    description,
    inputSchema,
    outputSchema: outputSchema(dataSchema, successRequestIdSchema),
    securitySchemes: MCP_SECURITY_SCHEMES,
    _meta: Object.freeze({
      securitySchemes: MCP_SECURITY_SCHEMES,
      "aralearn/actionConsequentialHint": Boolean(actionConsequentialHint)
    }),
    annotations: Object.freeze({
      readOnlyHint,
      destructiveHint,
      idempotentHint: true,
      openWorldHint: false,
      ...protocolAnnotations
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
const OPTIONAL_TEXT_LIST = Object.freeze({
  type: "array",
  maxItems: 200,
  uniqueItems: true,
  items: {
    type: "string",
    minLength: 1,
    maxLength: 4_000,
    pattern: "\\S"
  }
});
const STRUCTURE_TITLE = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 300,
  pattern: "\\S"
});
const STRUCTURE_GOAL = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 2_000,
  pattern: "\\S"
});
const TOPIC_SCHEMA = Object.freeze(schema([
  "id", "label", "kind"
], {
  id: ID,
  label: STRUCTURE_TITLE,
  kind: {
    type: "string",
    enum: ["concept", "procedure", "representation", "term"]
  },
  checks: OPTIONAL_TEXT_LIST,
  errors: OPTIONAL_TEXT_LIST
}));
const STRUCTURE_COMMON_PROPERTIES = Object.freeze({
  id: ID,
  title: STRUCTURE_TITLE,
  goal: STRUCTURE_GOAL,
  position: { type: "integer", minimum: 0 }
});
const STRUCTURE_GUIDE_PROPERTIES = Object.freeze({
  include: OPTIONAL_TEXT_LIST,
  exclude: OPTIONAL_TEXT_LIST,
  notation: OPTIONAL_TEXT_LIST,
  avoid: OPTIONAL_TEXT_LIST
});
const STRUCTURE_PART_SCHEMA = Object.freeze({
  oneOf: [
    schema(["entityType", "id", "title", "goal"], {
      entityType: { const: "course" },
      parentPath: { type: "null" },
      ...STRUCTURE_COMMON_PROPERTIES
    }),
    schema(["entityType", "parentPath", "id", "title", "goal"], {
      entityType: { const: "module" },
      parentPath: fixedEntityPath(1),
      ...STRUCTURE_COMMON_PROPERTIES,
      ...STRUCTURE_GUIDE_PROPERTIES
    }),
    schema(["entityType", "parentPath", "id", "title", "goal"], {
      entityType: { const: "lesson" },
      parentPath: fixedEntityPath(2),
      ...STRUCTURE_COMMON_PROPERTIES,
      ...STRUCTURE_GUIDE_PROPERTIES,
      topics: {
        type: "array",
        maxItems: 200,
        items: TOPIC_SCHEMA
      }
    }),
    schema(["entityType", "parentPath", "id", "title", "goal"], {
      entityType: { const: "microsequence" },
      parentPath: fixedEntityPath(3),
      ...STRUCTURE_COMMON_PROPERTIES,
      role: {
        type: "string",
        enum: ["explain", "practice", "review", "support"]
      },
      status: { const: "planned" },
      branchOf: ID,
      dependsOn: OPTIONAL_TEXT_LIST,
      covers: OPTIONAL_TEXT_LIST,
      checks: OPTIONAL_TEXT_LIST,
      errors: OPTIONAL_TEXT_LIST
    })
  ]
});
const REVIEW_VIEW_PROPERTIES = Object.freeze({
  view: {
    type: "string",
    enum: ["outline", "entity", "document"],
    default: "outline"
  },
  entityType: ENTITY_TYPE,
  entityPath: ENTITY_PATH,
  includeDescendants: { type: "boolean", default: true }
});

const INDIVIDUAL_AUTHORING_WORKSPACE_MCP_TOOLS = Object.freeze([
  tool(
    "prepararAutoriaAraLearn",
    "Preparar autoria AraLearn",
    "Use antes de criar, ampliar, revisar pedagogicamente, reorganizar ou publicar. Recupera somente as regras e o fluxo pertinentes ao pedido atual.",
    readSchema(["intent"], {
      intent: AUTHORING_INTENT,
      targetEntity: {
        type: "string",
        enum: ["course", "module", "lesson", "microsequence", "card"]
      },
      context: {
        type: "string",
        maxLength: 8_000,
        description: "Resumo fiel do pedido e do contexto útil da conversa, sem credenciais."
      },
      resourceIds: {
        type: "array",
        maxItems: AUTHORING_RESOURCE_IDS.length,
        uniqueItems: true,
        items: { type: "string", enum: AUTHORING_RESOURCE_IDS }
      }
    }),
    AUTHORING_CONTEXT_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
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
    "Listar cursos de Trilhas",
    "Lista publicações privadas e cursos oficiais selecionados em Trilhas, com ids e revisões.",
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
    "retirarCursoDasTrilhas",
    "Retirar curso de Trilhas",
    "Retira a seleção informada de Trilhas. Se for uma publicação privada própria, também a arquiva e libera seu artefato atual.",
    writeSchema(["selectionId", "courseId", "expectedContentHash"], {
      selectionId: UUID,
      courseId: UUID,
      expectedContentHash: SHA256
    }),
    PERSONAL_LIBRARY_REMOVE_DATA_SCHEMA,
    { destructiveHint: true, actionConsequentialHint: true }
  ),
  tool(
    "listarColecoesDoCatalogo",
    "Listar coleções",
    "Lista as coleções do catálogo para localizar cursos existentes.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterId: UUID,
      query: { type: "string", maxLength: 200 },
      includeRetired: {
        type: "boolean",
        default: false,
        description: "Inclui coleções retiradas somente para quem pode publicar no catálogo."
      }
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
    "buscarCursosNoCatalogo",
    "Buscar cursos no catálogo",
    "Localiza cursos em todas as Coleções por termos obrigatórios, sem carregar o conteúdo dos cursos.",
    pairedCursorReadSchema(["query"], {
      query: {
        type: "string",
        minLength: 2,
        maxLength: 200,
        pattern: "\\S",
        description: "Termos de busca; todos precisam ocorrer nos metadados do curso ou da coleção."
      },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      afterTitle: {
        type: "string",
        minLength: 1,
        maxLength: 300,
        pattern: "\\S"
      },
      afterCourseId: UUID
    }, "afterTitle", "afterCourseId"),
    CATALOG_SEARCH_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "criarColecaoNoCatalogo",
    "Criar coleção",
    "Cria uma coleção oficial ativa; disponível somente para conta editorial.",
    writeSchema(["contractKey", "title"], {
      contractKey: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        pattern: "^[a-z0-9][a-z0-9-]{0,119}$"
      },
      title: {
        type: "string",
        minLength: 1,
        maxLength: 160,
        pattern: "\\S"
      },
      description: { type: "string", maxLength: 1_000 }
    }),
    CATALOG_COLLECTION_COMMAND_DATA_SCHEMA
  ),
  tool(
    "atualizarColecaoDoCatalogo",
    "Atualizar coleção",
    "Atualiza título e, opcionalmente, descrição da coleção lida na revisão informada.",
    writeSchema(["collectionId", "expectedRevision", "title"], {
      collectionId: UUID,
      expectedRevision: REVISION,
      title: {
        type: "string",
        minLength: 1,
        maxLength: 160,
        pattern: "\\S"
      },
      description: { type: "string", maxLength: 1_000 }
    }),
    CATALOG_COLLECTION_COMMAND_DATA_SCHEMA
  ),
  tool(
    "retirarColecaoDoCatalogo",
    "Retirar coleção",
    "Retira uma coleção; se houver cursos, informe outra coleção ativa para recebê-los.",
    writeSchema(["collectionId", "expectedRevision"], {
      collectionId: UUID,
      expectedRevision: REVISION,
      replacementCollectionId: UUID
    }),
    CATALOG_COLLECTION_RETIRE_DATA_SCHEMA,
    { destructiveHint: true }
  ),
  tool(
    "moverCursoNoCatalogo",
    "Mover curso no catálogo",
    "Move ou reordena um curso oficial usando a revisão da classificação lida.",
    writeSchema([
      "courseId", "expectedPlacementRevision", "targetCollectionId"
    ], {
      courseId: UUID,
      expectedPlacementRevision: REVISION,
      targetCollectionId: UUID,
      position: { type: "integer", minimum: 0 }
    }),
    CATALOG_COURSE_MOVE_DATA_SCHEMA
  ),
  tool(
    "retirarCursoDoCatalogo",
    "Retirar curso do catálogo",
    "Retira o curso oficial e sua classificação depois de conferir revisão e hash atuais.",
    writeSchema([
      "courseId", "expectedPlacementRevision", "expectedContentHash"
    ], {
      courseId: UUID,
      expectedPlacementRevision: REVISION,
      expectedContentHash: SHA256
    }),
    CATALOG_COURSE_REMOVE_DATA_SCHEMA,
    { destructiveHint: true }
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
    "Cria um workspace vazio, parte de um curso acessível ou abre uma revisão editorial assumida.",
    writeSchema(["title"], {
      title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
      brief: {
        type: "string",
        minLength: 1,
        maxLength: 16_000,
        pattern: "\\S",
        description: "Resumo do público, objetivo, fontes, escopo e restrições úteis."
      },
      sourceCourseId: UUID,
      sourceSubmissionId: UUID
    }),
    WORKSPACE_REVISION_DATA_SCHEMA,
    { destructiveHint: false }
  ),
  tool(
    "lerWorkspaceDeAutoria",
    "Ler workspace",
    "Lê a árvore, uma entidade ou o documento composto atual do workspace.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      ...WORKSPACE_VIEW_PROPERTIES
    }),
    WORKSPACE_READ_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "revisarMicroteoriasDoWorkspace",
    "Revisar microteorias",
    "Retorna as microteorias de uma lição ou uma microssequência, com conteúdo conceitual agregado e contagem de práticas; não enumera cards.",
    readSchema(["workspaceId", "entityPath"], {
      workspaceId: UUID,
      entityPath: {
        type: "array",
        minItems: 3,
        maxItems: 4,
        items: ID
      }
    }),
    MICROTHEORY_REVIEW_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "listarCardsDaMicrossequencia",
    "Listar cards da microssequência",
    "Lista ids, posições, kinds, resources e resumos curtos dos cards diretamente das partes atuais de um workspace. Para curso publicado, abra ou importe primeiro em um workspace.",
    pairedCursorReadSchema(
      ["workspaceId", "microsequencePath"],
      {
        workspaceId: UUID,
        microsequencePath: MICROSEQUENCE_PATH,
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        afterPosition: REVISION,
        afterId: ID
      },
      "afterPosition",
      "afterId"
    ),
    WORKSPACE_MICROSEQUENCE_CARDS_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "listarAlteracoesRecentesDoWorkspace",
    "Listar alterações recentes",
    "Lista resumos pequenos das alterações recentes, sem guardar cópias anteriores do curso.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      beforeRevision: REVISION
    }),
    WORKSPACE_EVENTS_DATA_SCHEMA,
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
    WORKSPACE_REVISION_DATA_SCHEMA,
    { destructiveHint: false }
  ),
  tool(
    "criarEstruturaNoWorkspace",
    "Criar estrutura planejada",
    "Cria cursos, módulos, lições e microssequências planejadas em um lote pequeno; o servidor completa os campos canônicos previsíveis.",
    writeSchema(["workspaceId", "expectedRevision", "parts"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      parts: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: STRUCTURE_PART_SCHEMA
      }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA,
    { destructiveHint: false }
  ),
  tool(
    "salvarCardsNaMicrossequencia",
    "Salvar cards da microssequência",
    "Materializa uma microssequência por vez. Consulte os resources usados e envie em cardsJson uma lista JSON de cards v4 completos.",
    writeSchema([
      "workspaceId", "expectedRevision", "microsequencePath",
      "mode", "status", "cardsJson"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      microsequencePath: MICROSEQUENCE_PATH,
      mode: { type: "string", enum: ["append", "replace"] },
      status: {
        type: "string",
        enum: ["generated", "needs_review", "ready"]
      },
      cardsJson: {
        type: "string",
        minLength: 2,
        maxLength: 80_000,
        description: "Array JSON de cards completos; use uma microssequência por chamada."
      }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "atualizarMetadadosDaEntidade",
    "Atualizar conteúdo pedagógico",
    "Altera somente os metadados informados de um curso, módulo, lição ou microssequência; use a leitura atual como base.",
    structuralMetadataWriteSchema(
      ["workspaceId", "expectedRevision", "entityType", "entityPath"],
      {
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: STRUCTURAL_ENTITY_TYPE,
      entityPath: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: ID
      },
      title: {
        type: "string",
        minLength: 1,
        maxLength: 300,
        pattern: "\\S"
      },
      goal: {
        type: "string",
        minLength: 1,
        maxLength: 2_000,
        pattern: "\\S"
      },
      include: OPTIONAL_TEXT_LIST,
      exclude: OPTIONAL_TEXT_LIST,
      notation: OPTIONAL_TEXT_LIST,
      avoid: OPTIONAL_TEXT_LIST,
      role: {
        type: "string",
        enum: ["explain", "practice", "review", "support"]
      },
      status: {
        type: "string",
        enum: ["planned", "generated", "needs_review", "ready"]
      },
      branchOf: { type: ["string", "null"], minLength: 1, maxLength: 240 },
      dependsOn: OPTIONAL_TEXT_LIST,
      covers: OPTIONAL_TEXT_LIST,
      checks: OPTIONAL_TEXT_LIST,
      errors: OPTIONAL_TEXT_LIST,
      topics: {
        type: "array",
        maxItems: 200,
        items: TOPIC_SCHEMA
      }
      }
    ),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "salvarCardNoWorkspace",
    "Corrigir um card",
    "Substitui um card pelo objeto v4 completo em cardJson, preservando o id e a posição; consulte antes o contrato do resource.",
    writeSchema([
      "workspaceId", "expectedRevision", "cardPath", "cardJson"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      cardPath: fixedEntityPath(5),
      cardJson: {
        type: "string",
        minLength: 2,
        maxLength: 40_000,
        description: "Objeto JSON completo de um único card v4."
      }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "copiarEntidadeNoWorkspace",
    "Copiar parte do curso",
    "Copia profundamente uma parte para outro pai compatível e cria ids novos; a origem permanece inalterada.",
    entityWriteSchema([
      "workspaceId", "expectedRevision", "entityType", "entityPath", "newRootId"
    ], {
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
      newRootId: ID,
      position: { type: "integer", minimum: 0 }
    }, { pathField: "entityPath", parentField: "targetParentPath" }),
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
      "workspaceId", "expectedRevision", "sourcePath", "newId",
      "title", "goal", "role", "cardIds"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      sourcePath: MICROSEQUENCE_PATH,
      newId: ID,
      title: {
        type: "string",
        minLength: 1,
        maxLength: 300,
        pattern: "\\S"
      },
      goal: {
        type: "string",
        minLength: 1,
        maxLength: 2_000,
        pattern: "\\S"
      },
      role: {
        type: "string",
        enum: ["explain", "practice", "review", "support"]
      },
      covers: OPTIONAL_TEXT_LIST,
      checks: OPTIONAL_TEXT_LIST,
      errors: OPTIONAL_TEXT_LIST,
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
    "publicarCursoDoWorkspace",
    "Publicar curso",
    "Publica um curso do workspace. O vínculo corrente decide entre criar e atualizar; partial cria prévia privada e catálogo exige complete.",
    publicationSchema(),
    WORKSPACE_PUBLICATION_DATA_SCHEMA
  ),
  tool(
    "submeterCursoParaRevisaoEditorial",
    "Enviar curso para revisão",
    "Envia a revisão privada corrente. Uma revisão nova substitui envio ainda na fila; envio já assumido precisa ser concluído ou retirado antes.",
    writeSchema(["courseId", "expectedContentHash"], {
      courseId: UUID,
      expectedContentHash: SHA256,
      note: { type: "string", minLength: 1, maxLength: 4_000 }
    }),
    CATALOG_REVIEW_COMMAND_DATA_SCHEMA
  ),
  tool(
    "listarRevisoesEditoriais",
    "Listar revisões editoriais",
    "Lista uma página pequena dos próprios envios, incluindo decisões e pedidos de ajuste, ou da fila administrativa.",
    Object.freeze({
      ...readSchema([], {
        view: { type: "string", enum: ["mine", "queue"], default: "mine" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        beforeSubmittedAt: DATE_TIME,
        beforeId: UUID
      }),
      allOf: [
        {
          if: { required: ["beforeSubmittedAt"] },
          then: { required: ["beforeId"] }
        },
        {
          if: { required: ["beforeId"] },
          then: { required: ["beforeSubmittedAt"] }
        }
      ]
    }),
    CATALOG_REVIEW_LIST_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "atualizarContextoDoWorkspace",
    "Atualizar contexto de autoria",
    "Substitui o resumo curto que orienta decisões posteriores sem copiar a árvore do curso.",
    writeSchema(["workspaceId", "expectedRevision", "brief"], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      brief: {
        type: "string",
        minLength: 1,
        maxLength: 16_000,
        pattern: "\\S"
      }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "lerRevisaoEditorial",
    "Ler revisão editorial",
    "Lê somente a revisão privada explicitamente enviada ao fluxo editorial.",
    readSchema(["submissionId"], {
      submissionId: UUID,
      ...REVIEW_VIEW_PROPERTIES
    }),
    CATALOG_REVIEW_READ_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "criarWorkspaceDeRevisaoEditorial",
    "Abrir revisão em workspace",
    "Assume por tempo limitado um envio disponível e cria ou retoma sua cópia editorial independente para inspeção e correção.",
    writeSchema(["submissionId", "title"], {
      submissionId: UUID,
      title: {
        type: "string",
        minLength: 1,
        maxLength: 300,
        pattern: "\\S"
      }
    }),
    WORKSPACE_REVISION_DATA_SCHEMA
  ),
  tool(
    "decidirRevisaoEditorial",
    "Solicitar ajustes ou rejeitar",
    "Registra pedido de ajustes ou rejeição com uma justificativa curta.",
    writeSchema(["submissionId", "decision", "note"], {
      submissionId: UUID,
      decision: {
        type: "string",
        enum: ["request_changes", "reject"]
      },
      note: {
        type: "string",
        minLength: 1,
        maxLength: 4_000,
        pattern: "\\S"
      }
    }),
    CATALOG_REVIEW_COMMAND_DATA_SCHEMA
  ),
  tool(
    "retirarCursoDaRevisaoEditorial",
    "Retirar envio editorial",
    "Retira da fila um envio próprio que ainda não foi aceito nem rejeitado.",
    writeSchema(["submissionId"], { submissionId: UUID }),
    CATALOG_REVIEW_COMMAND_DATA_SCHEMA
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

const INDIVIDUAL_TOOL_BY_NAME = new Map(
  INDIVIDUAL_AUTHORING_WORKSPACE_MCP_TOOLS.map(
    (definition) => [definition.name, definition]
  )
);

function individualTool(name) {
  const definition = INDIVIDUAL_TOOL_BY_NAME.get(name);
  if (!definition) throw new TypeError(`Ferramenta interna inexistente: ${name}.`);
  return definition;
}

function schemaWithOperation(inputSchema, operation) {
  return Object.freeze({
    ...inputSchema,
    required: Object.freeze([
      ...new Set([...(inputSchema.required || []), "operation"])
    ]),
    properties: Object.freeze({
      ...(inputSchema.properties || {}),
      operation: Object.freeze({ const: operation })
    })
  });
}

function groupedInputSchema(branches, { write = false } = {}) {
  const operations = Object.freeze(branches.map(({ operation }) => operation));
  return Object.freeze({
    type: "object",
    required: Object.freeze(write
      ? ["requestId", "operation"]
      : ["operation"]),
    properties: Object.freeze({
      ...(write ? { requestId: REQUEST_ID } : {}),
      operation: Object.freeze({ type: "string", enum: operations })
    }),
    oneOf: Object.freeze(branches.map(({ operation, toolName }) =>
      schemaWithOperation(individualTool(toolName).inputSchema, operation)
    ))
  });
}

function groupedDataSchema(branches) {
  return Object.freeze({
    type: "object",
    anyOf: Object.freeze(branches.map(({ toolName }) =>
      individualTool(toolName).outputSchema.oneOf[0].properties.data
    ))
  });
}

const RESOURCE_QUERY_TOOL = tool(
  "consultarRecursosDeCard",
  "Consultar recursos de card",
  "Sem resource, lista os recursos v4 e suas finalidades; com resource, lê o contrato autoral e um exemplo válido.",
  readSchema([], {
    resource: {
      type: "string",
      enum: AUTHORING_RESOURCE_IDS
    }
  }),
  Object.freeze({
    type: "object",
    anyOf: [RESOURCE_LIST_DATA_SCHEMA, RESOURCE_DEFINITION_DATA_SCHEMA]
  }),
  { readOnlyHint: true }
);

const CATALOG_QUERY_BRANCHES = Object.freeze([
  Object.freeze({
    operation: "list_collections",
    toolName: "listarColecoesDoCatalogo"
  }),
  Object.freeze({
    operation: "list_collection_courses",
    toolName: "listarCursosDaColecao"
  }),
  Object.freeze({
    operation: "search_courses",
    toolName: "buscarCursosNoCatalogo"
  })
]);
const CATALOG_QUERY_TOOL = tool(
  "consultarCatalogo",
  "Consultar Coleções",
  "Lista Coleções, lista cursos de uma Coleção ou busca cursos em todo o catálogo, conforme operation.",
  groupedInputSchema(CATALOG_QUERY_BRANCHES),
  groupedDataSchema(CATALOG_QUERY_BRANCHES),
  { readOnlyHint: true }
);

const CATALOG_EDIT_BRANCHES = Object.freeze([
  Object.freeze({
    operation: "create_collection",
    toolName: "criarColecaoNoCatalogo"
  }),
  Object.freeze({
    operation: "update_collection",
    toolName: "atualizarColecaoDoCatalogo"
  }),
  Object.freeze({
    operation: "move_course",
    toolName: "moverCursoNoCatalogo"
  })
]);
const CATALOG_EDIT_TOOL = tool(
  "editarCatalogo",
  "Organizar Coleções",
  "Cria ou atualiza uma Coleção, ou move e reordena um curso oficial, conforme operation.",
  groupedInputSchema(CATALOG_EDIT_BRANCHES, { write: true }),
  groupedDataSchema(CATALOG_EDIT_BRANCHES)
);

const CATALOG_REMOVE_BRANCHES = Object.freeze([
  Object.freeze({
    operation: "retire_collection",
    toolName: "retirarColecaoDoCatalogo"
  }),
  Object.freeze({
    operation: "remove_course",
    toolName: "retirarCursoDoCatalogo"
  })
]);
const CATALOG_REMOVE_TOOL = tool(
  "retirarDoCatalogo",
  "Retirar do catálogo",
  "Retira uma Coleção ou um curso oficial do catálogo, conforme operation.",
  groupedInputSchema(CATALOG_REMOVE_BRANCHES, { write: true }),
  groupedDataSchema(CATALOG_REMOVE_BRANCHES),
  { destructiveHint: true, actionConsequentialHint: true }
);

const WORKSPACE_REORGANIZATION_BRANCHES = Object.freeze([
  Object.freeze({
    operation: "copy_entity",
    toolName: "copiarEntidadeNoWorkspace"
  }),
  Object.freeze({
    operation: "rename_entity",
    toolName: "renomearEntidadeNoWorkspace"
  }),
  Object.freeze({
    operation: "move_entity",
    toolName: "moverEntidadeNoWorkspace"
  }),
  Object.freeze({
    operation: "merge_microsequences",
    toolName: "juntarMicrossequencias"
  }),
  Object.freeze({
    operation: "split_microsequence",
    toolName: "separarMicrossequencia"
  }),
  Object.freeze({
    operation: "promote_module",
    toolName: "promoverModuloACurso"
  }),
  Object.freeze({
    operation: "demote_course",
    toolName: "rebaixarCursoAModulo"
  })
]);
const WORKSPACE_REORGANIZATION_TOOL = tool(
  "reorganizarWorkspace",
  "Reorganizar workspace",
  "Copia, renomeia, move, junta, separa, promove ou rebaixa partes do workspace, conforme operation.",
  groupedInputSchema(WORKSPACE_REORGANIZATION_BRANCHES, { write: true }),
  groupedDataSchema(WORKSPACE_REORGANIZATION_BRANCHES)
);

const WORKSPACE_DELETE_BRANCHES = Object.freeze([
  Object.freeze({
    operation: "delete_entity",
    toolName: "excluirEntidadeDoWorkspace"
  }),
  Object.freeze({
    operation: "delete_workspace",
    toolName: "excluirWorkspaceDeAutoria"
  })
]);
const WORKSPACE_DELETE_TOOL = tool(
  "excluirDoWorkspace",
  "Excluir do workspace",
  "Exclui uma entidade com seus descendentes ou remove o workspace ativo, conforme operation.",
  groupedInputSchema(WORKSPACE_DELETE_BRANCHES, { write: true }),
  groupedDataSchema(WORKSPACE_DELETE_BRANCHES),
  { destructiveHint: true, actionConsequentialHint: true }
);

const CONSOLIDATED_REPLACEMENTS = new Map([
  ["listarRecursosDeCard", RESOURCE_QUERY_TOOL],
  ["listarColecoesDoCatalogo", CATALOG_QUERY_TOOL],
  ["criarColecaoNoCatalogo", CATALOG_EDIT_TOOL],
  ["retirarColecaoDoCatalogo", CATALOG_REMOVE_TOOL],
  ["copiarEntidadeNoWorkspace", WORKSPACE_REORGANIZATION_TOOL],
  ["excluirEntidadeDoWorkspace", WORKSPACE_DELETE_TOOL]
]);
const CONSOLIDATED_REMOVALS = new Set([
  "consultarRecursoDeCard",
  "listarCursosDaColecao",
  "buscarCursosNoCatalogo",
  "atualizarColecaoDoCatalogo",
  "moverCursoNoCatalogo",
  "retirarCursoDoCatalogo",
  "renomearEntidadeNoWorkspace",
  "moverEntidadeNoWorkspace",
  "juntarMicrossequencias",
  "separarMicrossequencia",
  "promoverModuloACurso",
  "rebaixarCursoAModulo",
  "excluirWorkspaceDeAutoria"
]);

export const AUTHORING_WORKSPACE_MCP_TOOLS = Object.freeze(
  INDIVIDUAL_AUTHORING_WORKSPACE_MCP_TOOLS.flatMap((definition) => {
    const replacement = CONSOLIDATED_REPLACEMENTS.get(definition.name);
    if (replacement) return [replacement];
    if (CONSOLIDATED_REMOVALS.has(definition.name)) return [];
    return [definition];
  })
);

const TOOL_BY_NAME = new Map(
  AUTHORING_WORKSPACE_MCP_TOOLS.map((definition) => [definition.name, definition])
);

const CATALOG_READ = new Set([
  "consultarCatalogo"
]);
const PRIVATE_READ = new Set(["listarCursosDaBibliotecaPessoal"]);
const CATALOG_SUBMIT = new Set([
  "submeterCursoParaRevisaoEditorial",
  "retirarCursoDaRevisaoEditorial"
]);
const CATALOG_REVIEW = new Set([
  "criarWorkspaceDeRevisaoEditorial",
  "decidirRevisaoEditorial"
]);
const CATALOG_MANAGE = new Set([
  "editarCatalogo",
  "retirarDoCatalogo"
]);
const AUTHORING_READ = new Set([
  "prepararAutoriaAraLearn",
  "consultarRecursosDeCard",
  "lerConteudoDoCurso",
  "listarWorkspacesDeAutoria",
  "lerWorkspaceDeAutoria",
  "revisarMicroteoriasDoWorkspace",
  "listarCardsDaMicrossequencia",
  "listarAlteracoesRecentesDoWorkspace",
  "lerRevisaoEditorial"
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

function discriminatedSchema(value, alternatives) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidates = alternatives.filter((alternative) => {
    const properties = alternative?.properties || {};
    const discriminants = Object.entries(properties).filter(
      ([field, property]) => Object.hasOwn(property || {}, "const")
        && Object.hasOwn(value, field)
    );
    return discriminants.length > 0 && discriminants.every(
      ([field, property]) => valuesEqual(value[field], property.const)
    );
  });
  return candidates.length === 1 ? candidates[0] : null;
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
  if (definition.oneOf) {
    const matches = definition.oneOf.filter(
      (alternative) => schemaMatches(value, alternative)
    );
    if (matches.length !== 1) {
      const selected = discriminatedSchema(value, definition.oneOf);
      if (selected) validateValue(value, selected, field);
      invalidValue(field, "não corresponde a uma única variante permitida");
    }
    validateValue(value, matches[0], field);
  }
  if (definition.anyOf) {
    const matches = definition.anyOf.filter(
      (alternative) => schemaMatches(value, alternative)
    );
    if (matches.length === 0) {
      const selected = discriminatedSchema(value, definition.anyOf);
      if (selected) validateValue(value, selected, field);
      invalidValue(field, "não corresponde a nenhuma variante permitida");
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
    criarEstruturaNoWorkspace: "create_structure",
    salvarCardsNaMicrossequencia: "save_microsequence_cards",
    atualizarMetadadosDaEntidade: "update_metadata",
    salvarCardNoWorkspace: "save_card",
    copiarEntidadeNoWorkspace: "copy_entity",
    renomearEntidadeNoWorkspace: "rename_entity",
    moverEntidadeNoWorkspace: "move_entity",
    excluirEntidadeDoWorkspace: "delete_entity",
    juntarMicrossequencias: "merge_microsequences",
    separarMicrossequencia: "split_microsequence",
    promoverModuloACurso: "promote_module",
    rebaixarCursoAModulo: "demote_course"
  };
  const { workspaceId, requestId, expectedRevision, ...operationArguments } = args;
  if (name === "salvarCardsNaMicrossequencia") {
    let cards;
    try {
      cards = JSON.parse(operationArguments.cardsJson);
    } catch {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        "cardsJson deve conter uma lista JSON válida de cards v4."
      );
    }
    if (!Array.isArray(cards)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        "cardsJson deve conter uma lista JSON de cards v4."
      );
    }
    delete operationArguments.cardsJson;
    operationArguments.cards = cards;
  }
  if (name === "salvarCardNoWorkspace") {
    let card;
    try {
      card = JSON.parse(operationArguments.cardJson);
    } catch {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        "cardJson deve conter um objeto JSON válido de card v4."
      );
    }
    if (!card || typeof card !== "object" || Array.isArray(card)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        "cardJson deve conter um único objeto JSON de card v4."
      );
    }
    delete operationArguments.cardJson;
    operationArguments.card = card;
  }
  if (name === "separarMicrossequencia") {
    const {
      newId,
      title,
      goal,
      role,
      covers = [],
      checks = [],
      errors = [],
      ...splitArguments
    } = operationArguments;
    return {
      method: "POST",
      path: `/v1/workspaces/${encode(workspaceId)}/mutations`,
      body: {
        requestId,
        expectedRevision,
        operation: operations[name],
        arguments: {
          ...splitArguments,
          newMicrosequence: {
            id: newId,
            title,
            goal,
            role,
            status: "needs_review",
            branchOf: null,
            dependsOn: [],
            covers,
            checks,
            errors,
            cards: []
          }
        }
      },
      requestId
    };
  }
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
    return scopes.has("catalog:read");
  }
  if (PRIVATE_READ.has(name)) return scopes.has("authoring:private:read");
  if (CATALOG_SUBMIT.has(name)) return scopes.has("catalog:submit");
  if (name === "listarRevisoesEditoriais") {
    return scopes.has("catalog:submit") || scopes.has("catalog:review");
  }
  if (CATALOG_REVIEW.has(name)) return scopes.has("catalog:review");
  if (CATALOG_MANAGE.has(name)) return scopes.has("catalog:manage");
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

const GROUPED_OPERATION_TARGETS = Object.freeze({
  consultarCatalogo: Object.freeze(Object.fromEntries(
    CATALOG_QUERY_BRANCHES.map(({ operation, toolName }) => [operation, toolName])
  )),
  editarCatalogo: Object.freeze(Object.fromEntries(
    CATALOG_EDIT_BRANCHES.map(({ operation, toolName }) => [operation, toolName])
  )),
  retirarDoCatalogo: Object.freeze(Object.fromEntries(
    CATALOG_REMOVE_BRANCHES.map(({ operation, toolName }) => [operation, toolName])
  )),
  reorganizarWorkspace: Object.freeze(Object.fromEntries(
    WORKSPACE_REORGANIZATION_BRANCHES.map(
      ({ operation, toolName }) => [operation, toolName]
    )
  )),
  excluirDoWorkspace: Object.freeze(Object.fromEntries(
    WORKSPACE_DELETE_BRANCHES.map(({ operation, toolName }) => [operation, toolName])
  ))
});

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) throw new AuthoringApiError(404, "unknown_tool", "Ferramenta inexistente.");
  let args = validateArguments(definition, rawArguments);
  if (name === "consultarRecursosDeCard") {
    name = args.resource ? "consultarRecursoDeCard" : "listarRecursosDeCard";
  } else if (GROUPED_OPERATION_TARGETS[name]) {
    const targetName = GROUPED_OPERATION_TARGETS[name][args.operation];
    const operationArguments = { ...args };
    delete operationArguments.operation;
    name = targetName;
    args = operationArguments;
  }
  if (name === "prepararAutoriaAraLearn") {
    return {
      kind: "knowledge",
      body: args,
      requestId: null
    };
  }
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
  if (name === "retirarCursoDasTrilhas") {
    return {
      method: "POST",
      path: `/v1/library/courses/${encode(args.courseId)}/remove`,
      body: {
        requestId: args.requestId,
        selectionId: args.selectionId,
        expectedContentHash: args.expectedContentHash
      },
      requestId: args.requestId
    };
  }
  if (name === "listarColecoesDoCatalogo") {
    return {
      method: "GET",
      path: "/v1/catalog/collections" + query(args, [
        "limit", "afterPosition", "afterId", "query", "includeRetired"
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
  if (name === "buscarCursosNoCatalogo") {
    return {
      method: "GET",
      path: "/v1/catalog/courses/search" + query(args, [
        "query", "limit", "afterTitle", "afterCourseId"
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
        "view", "entityType", "entityPath", "includeDescendants"
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
      }, ["view", "entityPath"]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarCardsDaMicrossequencia") {
    return {
      method: "GET",
      path: `/v1/workspaces/${encode(args.workspaceId)}/microsequence-cards`
        + query(args, [
          "microsequencePath", "limit", "afterPosition", "afterId"
        ]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarAlteracoesRecentesDoWorkspace") {
    return {
      method: "GET",
      path: `/v1/workspaces/${encode(args.workspaceId)}/events` + query(
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
  if (name === "criarColecaoNoCatalogo") {
    return {
      method: "POST",
      path: "/v1/catalog/manage/collections",
      body: args,
      requestId: args.requestId
    };
  }
  if (name === "atualizarColecaoDoCatalogo") {
    const { collectionId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/catalog/manage/collections/${encode(collectionId)}/update`,
      body,
      requestId: args.requestId
    };
  }
  if (name === "retirarColecaoDoCatalogo") {
    const { collectionId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/catalog/manage/collections/${encode(collectionId)}/retire`,
      body,
      requestId: args.requestId
    };
  }
  if (name === "moverCursoNoCatalogo") {
    const { courseId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/catalog/manage/courses/${encode(courseId)}/move`,
      body,
      requestId: args.requestId
    };
  }
  if (name === "retirarCursoDoCatalogo") {
    const { courseId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/catalog/manage/courses/${encode(courseId)}/remove`,
      body,
      requestId: args.requestId
    };
  }
  if (name === "atualizarContextoDoWorkspace") {
    const { workspaceId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/workspaces/${encode(workspaceId)}/context`,
      body,
      requestId: args.requestId
    };
  }
  if (new Set([
    "criarEstruturaNoWorkspace",
    "salvarCardsNaMicrossequencia",
    "atualizarMetadadosDaEntidade",
    "salvarCardNoWorkspace",
    "copiarEntidadeNoWorkspace",
    "renomearEntidadeNoWorkspace",
    "moverEntidadeNoWorkspace",
    "excluirEntidadeDoWorkspace",
    "juntarMicrossequencias",
    "separarMicrossequencia",
    "promoverModuloACurso",
    "rebaixarCursoAModulo"
  ]).has(name)) return mutation(name, args);
  if (name === "submeterCursoParaRevisaoEditorial") {
    return {
      method: "POST",
      path: "/v1/catalog/reviews",
      body: args,
      requestId: args.requestId
    };
  }
  if (name === "listarRevisoesEditoriais") {
    return {
      method: "GET",
      path: "/v1/catalog/reviews" + query(args, [
        "view", "limit", "beforeSubmittedAt", "beforeId"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "lerRevisaoEditorial") {
    const { submissionId, ...view } = args;
    return {
      method: "GET",
      path: `/v1/catalog/reviews/${encode(submissionId)}` + query(view, [
        "view", "entityType", "entityPath", "includeDescendants"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "criarWorkspaceDeRevisaoEditorial") {
    const { submissionId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/catalog/reviews/${encode(submissionId)}/workspace`,
      body,
      requestId: args.requestId
    };
  }
  if (name === "decidirRevisaoEditorial") {
    const { submissionId, ...body } = args;
    return {
      method: "POST",
      path: `/v1/catalog/reviews/${encode(submissionId)}/decision`,
      body,
      requestId: args.requestId
    };
  }
  if (name === "retirarCursoDaRevisaoEditorial") {
    return {
      method: "DELETE",
      path: `/v1/catalog/reviews/${encode(args.submissionId)}`,
      body: { requestId: args.requestId },
      requestId: args.requestId
    };
  }
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
