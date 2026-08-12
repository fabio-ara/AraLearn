import { AuthoringApiError } from "./errors.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../aralearn/runtime/resources/packages/index.js";

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
const EDUCATIONAL_WORKSPACE_ROLE = Object.freeze({
  type: "string",
  enum: ["owner", "admin", "author", "reviewer", "learner", "reader"]
});
const WORKSPACE_CONTEXT_CAPABILITIES_SCHEMA = schema([
  "author", "review", "comment", "publish", "manage"
], Object.fromEntries([
  "author", "review", "comment", "publish", "manage"
].map((capability) => [capability, { type: "boolean" }])));
const AUTHORING_INTENT = Object.freeze({
  type: "string",
  description: "inspect lê; create planeja/cria; extend amplia/constrói; audit audita ou reaudita sem alterar conteúdo ou estrutura; repair aplica reparos autorizados; revise revisa; restructure reorganiza; publish prepara submissão ou distribui em Coleções; study estuda.",
  enum: [
    "inspect", "create", "extend", "audit", "repair", "revise",
    "restructure", "publish", "study"
  ]
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
const AUTHORING_PACKAGE_IDS = Object.freeze(
  RESOURCE_PACKAGE_REGISTRY.listCatalog().map(({ id }) => id)
);
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
      required: ["code", "message", "issues", "recovery"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
        issues: {
          type: "array",
          maxItems: 20,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path", "message"],
            properties: {
              path: { type: "string" },
              message: { type: "string" },
              reason: { type: "string" },
              rule: { type: "string" },
              resource: { type: "string" }
            }
          }
        },
        recovery: {
          type: "object",
          additionalProperties: false,
          required: ["strategy", "retryable", "requestIdMode", "steps"],
          properties: {
            strategy: {
              type: "string",
              enum: [
                "correct_and_retry",
                "reread_and_retry",
                "split_and_retry",
                "repeat_identical",
                "reconnect",
                "stop"
              ]
            },
            retryable: { type: "boolean" },
            requestIdMode: {
              type: "string",
              enum: ["same", "new", "none"]
            },
            steps: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: { type: "string" }
            }
          }
        }
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
      "title", "goal", "role", "branchOf",
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
      return branch;
    })
  });
}

function publicationSchema() {
  return Object.freeze({
    ...writeSchema([
      "workspaceId", "expectedRevision", "courseId", "target"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      courseId: ID,
      target: { type: "string", enum: ["private", "catalog"] },
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
          required: ["collectionId"]
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
const PACKAGE_SUMMARY_SCHEMA = schema([
  "id",
  "version",
  "label",
  "purpose",
  "slots",
  "cognitiveOperations",
  "responseCompatibility",
  "limitations",
  "accessibility"
], {
  id: { type: "string", enum: AUTHORING_PACKAGE_IDS },
  version: { type: "string", pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$" },
  label: NON_EMPTY_STRING,
  purpose: NON_EMPTY_STRING,
  slots: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: ["content", "response", "feedback"] } },
  cognitiveOperations: STRING_LIST,
  responseCompatibility: STRING_LIST,
  limitations: STRING_LIST,
  accessibility: { type: "string" }
});
const PACKAGE_LIST_DATA_SCHEMA = schema(["contract", "packages"], {
  contract: { const: "aralearn.packages.v1" },
  packages: {
    type: "array",
    items: PACKAGE_SUMMARY_SCHEMA
  }
});
const PACKAGE_DEFINITION_DATA_SCHEMA = schema(["contract", "definition"], {
  contract: { const: "aralearn.packages.v1" },
  definition: {
    type: "object",
    additionalProperties: true,
    description: "Manifest, contrato autoral e schema da versão exata do package escolhido."
  }
});
const AUTHORING_GUIDANCE_SCHEMA = schema(["id", "title", "text"], {
  id: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  text: NON_EMPTY_STRING
});
const AUTHORING_PACKAGE_CONTRACT_SCHEMA = schema(["packageId", "version", "tool"], {
  packageId: { type: "string", enum: AUTHORING_PACKAGE_IDS },
  version: { type: "string", pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$" },
  tool: { const: "consultarPackagesDeCard" }
});
const PEDAGOGICAL_BLUEPRINT_SCHEMA = schema(["version", "principle", "requiredSections"], {
  version: { const: 1 },
  principle: NON_EMPTY_STRING,
  requiredSections: {
    type: "array",
    minItems: 8,
    uniqueItems: true,
    items: {
      type: "string",
      enum: [
        "learnerSituation",
        "prerequisiteEvidence",
        "conceptualLayers",
        "theorySteps",
        "practiceSteps",
        "feedbackPlan",
        "termLedger",
        "packageCandidates"
      ]
    }
  }
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
  "blueprintContract",
  "calibrationContract",
  "packageContracts",
  "access"
], {
  briefVersion: { const: 2 },
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
  blueprintContract: PEDAGOGICAL_BLUEPRINT_SCHEMA,
  calibrationContract: schema([
    "version",
    "presetId",
    "precedence",
    "protectedModuleIds",
    "editablePreferenceIds"
  ], {
    version: { const: 1 },
    presetId: { const: "aralearn-progressive-dense" },
    precedence: {
      type: "array",
      prefixItems: [
        { const: "protected_core" },
        { const: "protected_knowledge" },
        { const: "user_preferences" }
      ],
      minItems: 3,
      maxItems: 3
    },
    protectedModuleIds: STRING_LIST,
    editablePreferenceIds: STRING_LIST
  }),
  packageContracts: {
    type: "array",
    maxItems: AUTHORING_PACKAGE_IDS.length,
    items: AUTHORING_PACKAGE_CONTRACT_SCHEMA
  },
  access: AUTHORING_ACCESS_SCHEMA
});
const TRAIL_GROUP_SCHEMA = schema(["id", "title"], {
  id: UUID,
  title: NON_EMPTY_STRING
});
const TRAIL_ITEM_SCHEMA = schema([
  "trailItemId", "workspaceId", "courseKey", "courseId", "selectionId",
  "kind", "source", "origin", "title", "description", "moduleCount",
  "lessonCount", "microsequenceCount", "cardCount", "completedCardCount", "contentHash",
  "revision", "canEdit", "canDelete", "canRemove", "pathId", "pathTitle",
  "updatedAt"
], {
  trailItemId: UUID,
  workspaceId: NULLABLE_UUID,
  courseKey: { type: ["string", "null"], minLength: 1, maxLength: 240 },
  courseId: NULLABLE_UUID,
  selectionId: NULLABLE_UUID,
  kind: { type: "string", enum: ["plan", "course"] },
  source: { type: "string", enum: ["workspace", "selection"] },
  origin: { type: "string", enum: ["workspace", "private", "catalog"] },
  title: NON_EMPTY_STRING,
  description: { type: "string" },
  moduleCount: NON_NEGATIVE_INTEGER,
  lessonCount: NON_NEGATIVE_INTEGER,
  microsequenceCount: NON_NEGATIVE_INTEGER,
  cardCount: NON_NEGATIVE_INTEGER,
  completedCardCount: NON_NEGATIVE_INTEGER,
  contentHash: NULLABLE_SHA256,
  revision: { type: ["integer", "null"], minimum: 1 },
  canEdit: { type: "boolean" },
  canDelete: { type: "boolean" },
  canRemove: { type: "boolean" },
  pathId: NULLABLE_UUID,
  pathTitle: { type: ["string", "null"] },
  updatedAt: DATE_TIME
});
const TRAIL_CURSOR_SCHEMA = schema(["afterId"], {
  afterId: UUID
});
const PERSONAL_LIBRARY_DATA_SCHEMA = schema([
  "space", "groups", "items", "hasMore", "nextCursor", "capabilities"
], {
  space: { const: "trails" },
  groups: { type: "array", items: TRAIL_GROUP_SCHEMA },
  items: {
    type: "array",
    items: TRAIL_ITEM_SCHEMA
  },
  hasMore: { type: "boolean" },
  nextCursor: {
    anyOf: [
      { type: "null" },
      TRAIL_CURSOR_SCHEMA
    ]
  },
  capabilities: schema(["catalogManage", "catalogReview"], {
    catalogManage: { type: "boolean" },
    catalogReview: { type: "boolean" }
  })
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
  status: { const: "active" },
  revision: REVISION,
  courseCount: NON_NEGATIVE_INTEGER,
  createdAt: DATE_TIME,
  updatedAt: DATE_TIME
});
const ID_CURSOR_SCHEMA = schema(["afterId"], {
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
      ID_CURSOR_SCHEMA
    ]
  }
});
const CATALOG_COURSE_SCHEMA = schema([
  "placementId",
  "placementRevision",
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
      ID_CURSOR_SCHEMA
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
  "id", "entityPath", "title", "goal", "content", "covers",
  "checks", "errors", "resources", "topics", "practiceCount"
], {
  id: ID,
  entityPath: fixedEntityPath(4),
  title: NON_EMPTY_STRING,
  goal: NON_EMPTY_STRING,
  content: { type: "string" },
  covers: STRING_LIST,
  checks: STRING_LIST,
  errors: STRING_LIST,
  resources: STRING_LIST,
  topics: STRING_LIST,
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
const WORKSPACE_CHANGE_BASE_SCHEMA = schema([
  "operation", "created", "updated", "deleted"
], {
  operation: NON_EMPTY_STRING,
  operationFamily: { type: "string", enum: ["content", "structure"] },
  created: NON_NEGATIVE_INTEGER,
  updated: NON_NEGATIVE_INTEGER,
  deleted: NON_NEGATIVE_INTEGER,
  targetPath: ENTITY_PATH,
  entityPath: ENTITY_PATH,
  targetPaths: {
    type: "array",
    minItems: 0,
    maxItems: 20,
    uniqueItems: true,
    items: ENTITY_PATH
  },
  targetPathsTruncated: { type: "boolean" },
  continuityRemap: {
    oneOf: [
      schema(["kind", "sourceId", "newId"], {
        kind: { const: "split" },
        sourceId: ID,
        newId: ID
      }),
      schema(["kind", "targetId", "sourceIds"], {
        kind: { const: "merge" },
        targetId: ID,
        sourceIds: {
          type: "array", minItems: 1, maxItems: 100,
          uniqueItems: true, items: ID
        }
      })
    ]
  },
  resourceTargets: {
    type: "array",
    minItems: 0,
    maxItems: 10,
    uniqueItems: true,
    items: schema(["cardPath", "targetId"], {
      cardPath: fixedEntityPath(5),
      targetId: ID
    })
  },
  resourceTargetsTruncated: { type: "boolean" },
  changedCardPaths: {
    type: "array",
    minItems: 0,
    maxItems: 20,
    uniqueItems: true,
    items: fixedEntityPath(5)
  },
  changedCardPathsTruncated: { type: "boolean" },
  cardShellChangedPaths: {
    type: "array",
    minItems: 0,
    maxItems: 20,
    uniqueItems: true,
    items: fixedEntityPath(5)
  },
  cardShellChangedPathsTruncated: { type: "boolean" },
  entityType: ENTITY_TYPE,
  sourceCourseId: UUID,
  importedCourseId: ID,
  mode: { type: "string", enum: ["append", "replace"] },
  submittedCardCount: NON_NEGATIVE_INTEGER,
  positionsNormalized: { type: "boolean" },
  continuityAdjusted: { type: "boolean" },
  continuityAffectedPartCount: NON_NEGATIVE_INTEGER,
  continuityReferenceCount: NON_NEGATIVE_INTEGER,
  continuityMandateConsumed: { type: "boolean" }
});
const WORKSPACE_CHANGE_SCHEMA = Object.freeze({
  ...WORKSPACE_CHANGE_BASE_SCHEMA,
  allOf: [
    ["targetPaths", "targetPathsTruncated"],
    ["resourceTargets", "resourceTargetsTruncated"],
    ["changedCardPaths", "changedCardPathsTruncated"],
    ["cardShellChangedPaths", "cardShellChangedPathsTruncated"]
  ].map(([itemsField, truncatedField]) => ({
    if: {
      required: [itemsField],
      properties: { [itemsField]: {} }
    },
    then: {
      required: [truncatedField],
      properties: {
        [truncatedField]: { type: "boolean" }
      }
    }
  }))
});
const WORKSPACE_PUBLICATION_LINK_SCHEMA = schema([
  "workspaceCourseId",
  "target",
  "courseId",
  "contentHash",
  "updatedAt"
], {
  workspaceCourseId: ID,
  target: {
    type: "string",
    enum: ["private", "catalog"]
  },
  courseId: UUID,
  contentHash: SHA256,
  updatedAt: DATE_TIME
});
const WORKSPACE_CONTROL_PROPERTIES = Object.freeze({
  workspaceId: UUID,
  title: {
    ...NON_EMPTY_STRING,
    maxLength: 300
  },
  purpose: { type: "string", maxLength: 1_000 },
  workspaceKind: { type: "string", enum: ["personal", "class", "team"] },
  visibility: { type: "string", enum: ["private", "members"] },
  role: EDUCATIONAL_WORKSPACE_ROLE,
  capabilities: WORKSPACE_CONTEXT_CAPABILITIES_SCHEMA,
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
const CONTINUITY_DECISION_SCHEMA = Object.freeze({
  ...schema(["id", "summary"], {
    id: ID,
    summary: { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" },
    entityType: ENTITY_TYPE,
    entityId: ID
  }),
  allOf: [
    {
      if: { properties: { entityType: {} }, required: ["entityType"] },
      then: { properties: { entityId: ID }, required: ["entityId"] }
    },
    {
      if: { properties: { entityId: {} }, required: ["entityId"] },
      then: { properties: { entityType: ENTITY_TYPE }, required: ["entityType"] }
    }
  ]
});
const CONTINUITY_DECISION_PROJECTION_SCHEMA = Object.freeze({
  ...CONTINUITY_DECISION_SCHEMA,
  required: [
    ...CONTINUITY_DECISION_SCHEMA.required,
    "targetAvailable"
  ],
  properties: {
    ...CONTINUITY_DECISION_SCHEMA.properties,
    targetAvailable: { type: "boolean" }
  }
});
const CONTINUITY_MANDATE_SCHEMA = Object.freeze({
  ...schema([
    "id", "kind", "decidedAtRevision"
  ], {
    id: ID,
    kind: {
      type: "string",
      enum: ["build_part", "repair_findings", "audit", "restructure"]
    },
    targetPartId: ID,
    findingIds: {
      type: "array",
      maxItems: 50,
      uniqueItems: true,
      items: UUID
    },
    note: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" },
    decidedAtRevision: REVISION
  }),
  allOf: [
    {
      if: { properties: { kind: { const: "build_part" } }, required: ["kind"] },
      then: {
        properties: { targetPartId: {} },
        required: ["targetPartId"],
        not: { properties: { findingIds: {} }, required: ["findingIds"] }
      }
    },
    {
      if: {
        properties: { kind: { const: "repair_findings" } }, required: ["kind"]
      },
      then: {
        required: ["findingIds"],
        properties: { findingIds: { type: "array", minItems: 1 } },
        not: { properties: { targetPartId: {} }, required: ["targetPartId"] }
      }
    },
    {
      if: {
        properties: { kind: { enum: ["audit", "restructure"] } },
        required: ["kind"]
      },
      then: {
        not: { properties: { findingIds: {} }, required: ["findingIds"] }
      }
    }
  ]
});
const CONTINUITY_PART_PROJECTION_SCHEMA = schema([
  "id", "title", "microsequenceIds", "microsequenceStateMask", "microsequenceCount",
  "materializedCount", "readyCount", "cardCount", "missingCount"
], {
  id: ID,
  title: NON_EMPTY_STRING,
  microsequenceIds: {
    type: "array", minItems: 1, maxItems: 500, uniqueItems: true, items: ID
  },
  microsequenceStateMask: {
    type: "string", minLength: 1, maxLength: 500, pattern: "^[rmpx]+$"
  },
  microsequenceCount: NON_NEGATIVE_INTEGER,
  materializedCount: NON_NEGATIVE_INTEGER,
  readyCount: NON_NEGATIVE_INTEGER,
  cardCount: NON_NEGATIVE_INTEGER,
  missingCount: NON_NEGATIVE_INTEGER
});
const CONTINUITY_FINDING_SCHEMA = schema([
  "observationId", "entityType", "entityPath", "currentEntityPath",
  "targetAvailable", "resourceTargetId", "category", "severity", "status",
  "summary", "proposedRepair", "auditRevision", "pendingCorrectionRequestId",
  "pendingRevision", "resultingRevision", "createdAt", "updatedAt"
], {
  observationId: UUID,
  entityType: {
    type: "string",
    enum: ["workspace", "course", "module", "lesson", "microsequence", "card", "resource"]
  },
  entityPath: { type: "array", minItems: 0, maxItems: 5, items: ID },
  currentEntityPath: {
    anyOf: [
      { type: "array", minItems: 0, maxItems: 5, items: ID },
      { type: "null" }
    ]
  },
  targetAvailable: { type: "boolean" },
  resourceTargetId: { type: ["string", "null"], maxLength: 240 },
  category: { type: "string", minLength: 1, maxLength: 64 },
  severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
  status: {
    type: "string",
    enum: ["open", "approved", "rejected", "repaired", "resolved"]
  },
  summary: { type: "string", minLength: 1, maxLength: 1_000 },
  proposedRepair: { type: "string", minLength: 1, maxLength: 1_000 },
  auditRevision: REVISION,
  pendingCorrectionRequestId: { anyOf: [REQUEST_ID, { type: "null" }] },
  pendingRevision: { anyOf: [REVISION, { type: "null" }] },
  resultingRevision: { anyOf: [REVISION, { type: "null" }] },
  createdAt: DATE_TIME,
  updatedAt: NULLABLE_DATE_TIME
});
const CONTINUITY_FINDING_SUMMARY_SCHEMA = schema([
  "totalCount", "activeCount", "byStatus"
], {
  totalCount: NON_NEGATIVE_INTEGER,
  activeCount: NON_NEGATIVE_INTEGER,
  byStatus: schema(["open", "approved", "rejected", "repaired", "resolved"], {
    open: NON_NEGATIVE_INTEGER,
    approved: NON_NEGATIVE_INTEGER,
    rejected: NON_NEGATIVE_INTEGER,
    repaired: NON_NEGATIVE_INTEGER,
    resolved: NON_NEGATIVE_INTEGER
  })
});
const CONTINUITY_OBSERVATION_SUMMARY_SCHEMA = schema([
  "totalCount", "openCount", "focus"
], {
  totalCount: NON_NEGATIVE_INTEGER,
  openCount: NON_NEGATIVE_INTEGER,
  focus: { type: "array", maxItems: 20, items: OPEN_CANONICAL_OBJECT }
});
const WORKSPACE_RESUME_CONTENT_SCHEMA = schema([
  "outline", "parts", "decisions", "mandate", "findings", "observations",
  "publications"
], {
  outline: schema([
    "courseCount", "moduleCount", "lessonCount", "microsequenceCount", "cardCount",
    "unassignedMicrosequenceCount"
  ], {
    courseCount: NON_NEGATIVE_INTEGER,
    moduleCount: NON_NEGATIVE_INTEGER,
    lessonCount: NON_NEGATIVE_INTEGER,
    microsequenceCount: NON_NEGATIVE_INTEGER,
    cardCount: NON_NEGATIVE_INTEGER,
    unassignedMicrosequenceCount: NON_NEGATIVE_INTEGER
  }),
  parts: { type: "array", maxItems: 64, items: CONTINUITY_PART_PROJECTION_SCHEMA },
  decisions: {
    type: "array", maxItems: 128, items: CONTINUITY_DECISION_PROJECTION_SCHEMA
  },
  mandate: { anyOf: [{ type: "null" }, CONTINUITY_MANDATE_SCHEMA] },
  findings: schema(["items", "summary", "truncated"], {
    items: { type: "array", maxItems: 10, items: CONTINUITY_FINDING_SCHEMA },
    summary: CONTINUITY_FINDING_SUMMARY_SCHEMA,
    truncated: { type: "boolean" }
  }),
  observations: schema(["structural", "situated"], {
    structural: CONTINUITY_OBSERVATION_SUMMARY_SCHEMA,
    situated: CONTINUITY_OBSERVATION_SUMMARY_SCHEMA
  }),
  publications: schema(["items", "totalCount", "truncated"], {
    items: { type: "array", maxItems: 10, items: WORKSPACE_PUBLICATION_LINK_SCHEMA },
    totalCount: NON_NEGATIVE_INTEGER,
    truncated: { type: "boolean" }
  })
});
const WORKSPACE_READ_DATA_SCHEMA = Object.freeze({
  ...schema(
    [
      ...WORKSPACE_CONTROL_REQUIRED,
      "brief", "purpose", "workspaceKind", "visibility", "role",
      "capabilities", "view", "content"
    ],
    {
      ...WORKSPACE_CONTROL_PROPERTIES,
      idempotent: { const: false },
      brief: {
        type: "string",
        maxLength: 16_000,
        description: "Contexto estável, limitado também a 16 KiB em UTF-8."
      },
      view: {
        type: "string",
        enum: ["outline", "entity", "document", "resume"]
      },
      content: OPEN_CANONICAL_OBJECT
    }
  ),
  allOf: [
    {
      if: {
        properties: { view: { const: "outline" } },
        required: ["view"]
      },
      then: { properties: { content: WORKSPACE_OUTLINE_SCHEMA } }
    },
    {
      if: {
        properties: { view: { const: "resume" } },
        required: ["view"]
      },
      then: { properties: { content: WORKSPACE_RESUME_CONTENT_SCHEMA } },
      else: {
        properties: {
          publications: {
            type: "array",
            items: WORKSPACE_PUBLICATION_LINK_SCHEMA
          }
        },
        required: ["publications"]
      }
    }
  ]
});
const COURSE_READ_DATA_SCHEMA = Object.freeze({
  ...schema([
    "courseId",
    "title",
    "revisionHash",
    "view",
    "content"
  ], {
    courseId: UUID,
    title: NON_EMPTY_STRING,
    revisionHash: SHA256,
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
  brief: {
    type: "string",
    maxLength: 16_000,
    description: "Contexto estável, limitado também a 16 KiB em UTF-8."
  },
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
  "purpose",
  "workspaceKind",
  "visibility",
  "role",
  "revision",
  "sourceCourseId",
  "publicationCount",
  "updatedAt",
  "createdAt"
], {
  workspaceId: UUID,
  title: NON_EMPTY_STRING,
  purpose: { type: "string", maxLength: 1_000 },
  workspaceKind: { type: "string", enum: ["personal", "class", "team"] },
  visibility: { type: "string", enum: ["private", "members"] },
  role: EDUCATIONAL_WORKSPACE_ROLE,
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
const WORKSPACE_CONTINUITY_EVENT_SUMMARY_SCHEMA = schema([
  "continuityOperation", "stateVersion", "partCount", "decisionCount",
  "mandateId"
], {
  continuityOperation: {
    type: "string",
    enum: [
      "record_approved_plan", "define_part", "remove_part",
      "record_decision", "remove_decision", "set_mandate", "clear_mandate"
    ]
  },
  stateVersion: { const: 1 },
  partCount: NON_NEGATIVE_INTEGER,
  decisionCount: NON_NEGATIVE_INTEGER,
  mandateId: { anyOf: [{ type: "null" }, ID] }
});
const WORKSPACE_FINDING_CREATE_EVENT_SUMMARY_SCHEMA = schema([
  "findingId", "findingOperation", "entityType", "category", "severity",
  "status", "auditRevision"
], {
  findingId: UUID,
  findingOperation: { const: "create" },
  entityType: {
    type: "string",
    enum: [
      "workspace", "course", "module", "lesson", "microsequence", "card",
      "resource"
    ]
  },
  category: { type: "string", minLength: 1, maxLength: 64, pattern: "\\S" },
  severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
  status: { const: "open" },
  auditRevision: REVISION
});
const WORKSPACE_FINDING_LIFECYCLE_EVENT_SUMMARY_SCHEMA = schema([
  "findingId", "findingOperation", "status", "correctionRequestId",
  "resultingRevision", "verifiedRevision"
], {
  findingId: UUID,
  findingOperation: {
    type: "string",
    enum: ["decide", "link_correction", "verify", "delete"]
  },
  status: {
    type: "string",
    enum: ["open", "approved", "rejected", "repaired", "resolved", "deleted"]
  },
  correctionRequestId: { anyOf: [{ type: "null" }, REQUEST_ID] },
  resultingRevision: { anyOf: [{ type: "null" }, REVISION] },
  verifiedRevision: { anyOf: [{ type: "null" }, REVISION] }
});
const WORKSPACE_EVENT_SUMMARY_SCHEMA = Object.freeze({
  oneOf: [
    WORKSPACE_CHANGE_SCHEMA,
    WORKSPACE_CONTINUITY_EVENT_SUMMARY_SCHEMA,
    WORKSPACE_FINDING_CREATE_EVENT_SUMMARY_SCHEMA,
    WORKSPACE_FINDING_LIFECYCLE_EVENT_SUMMARY_SCHEMA
  ]
});
const WORKSPACE_EVENT_ITEM_SCHEMA = schema([
  "revision", "operation", "summary", "createdAt"
], {
  revision: REVISION,
  operation: NON_EMPTY_STRING,
  summary: WORKSPACE_EVENT_SUMMARY_SCHEMA,
  createdAt: DATE_TIME
});
const WORKSPACE_EVENTS_DATA_SCHEMA = schema(["items"], {
  items: {
    type: "array",
    items: WORKSPACE_EVENT_ITEM_SCHEMA
  }
});
const WORKSPACE_MICROSEQUENCE_CARD_ITEM_SCHEMA = schema([
  "id", "position", "role", "packages", "summary"
], {
  id: ID,
  position: REVISION,
  role: { type: "string", enum: ["theory", "practice"] },
  packages: {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: { type: "string", enum: AUTHORING_PACKAGE_IDS }
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
  "target",
  "submissionId",
  "idempotent"
], {
  workspaceId: UUID,
  revision: REVISION,
  courseId: UUID,
  contentHash: SHA256,
  target: {
    type: "string",
    enum: ["private", "catalog"]
  },
  submissionId: NULLABLE_UUID,
  publicationSeq: NON_NEGATIVE_INTEGER,
  idempotent: { type: "boolean" },
  unchanged: { type: "boolean" }
});
const CATALOG_REVIEW_ITEM_SCHEMA = schema([
  "submissionId", "courseId", "sourceRevisionHash", "title",
  "status", "authorNote", "reviewerNote",
  "claimExpiresAt", "submittedAt", "decidedAt", "updatedAt"
], {
  submissionId: UUID,
  courseId: UUID,
  sourceRevisionHash: SHA256,
  title: NON_EMPTY_STRING,
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
    submittedAt: DATE_TIME,
    reviewerId: NULLABLE_UUID,
    reviewWorkspaceId: NULLABLE_UUID,
    leaseExpiresAt: NULLABLE_DATE_TIME,
    idempotent: { type: "boolean" }
  }
);
const CATALOG_REVIEW_READ_DATA_SCHEMA = schema(
  [
    "submissionId", "courseId", "title", "goal",
    "status", "sourceRevisionHash", "authorNote", "reviewerNote",
    "reviewWorkspaceId", "view", "content"
  ],
  {
    submissionId: UUID,
    courseId: UUID,
    title: NON_EMPTY_STRING,
    goal: NON_EMPTY_STRING,
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
  "revision", "courseCount", "idempotent"
], {
  status: { type: "string", enum: ["created", "updated", "unchanged"] },
  collectionId: UUID,
  contractKey: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  description: { type: "string" },
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
  "placementRevision", "idempotent"
], {
  status: { type: "string", enum: ["moved", "unchanged"] },
  courseId: UUID,
  fromCollectionId: UUID,
  collectionId: UUID,
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

function schemaCanRequire(inputSchema, property) {
  if (inputSchema.required?.includes(property)) return true;
  return [
    ...(inputSchema.oneOf || []),
    ...(inputSchema.anyOf || []),
    ...(inputSchema.allOf || [])
  ].some((branch) => schemaCanRequire(branch, property));
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
    : schemaCanRequire(inputSchema, "requestId")
      ? { anyOf: [{ const: null }, REQUEST_ID] }
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

const WORKSPACE_VIEW_PROPERTIES = Object.freeze({
  ...VIEW_PROPERTIES,
  view: {
    type: "string",
    enum: ["outline", "entity", "document", "resume"],
    default: "outline"
  }
});
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
const EDUCATIONAL_WORKSPACE_MUTABLE_ROLE = Object.freeze({
  type: "string",
  enum: ["admin", "author", "reviewer", "learner", "reader"]
});
const EDUCATIONAL_WORKSPACE_DETAILS_DATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "workspaceId", "title", "purpose", "kind", "visibility", "role",
    "capabilities", "members", "invitations", "courses", "courseCount",
    "publicationCount", "updatedAt"
  ],
  properties: {
    workspaceId: UUID,
    title: { type: "string" },
    purpose: { type: "string" },
    kind: { type: "string", enum: ["personal", "class", "team"] },
    visibility: { type: "string", enum: ["private", "members"] },
    role: EDUCATIONAL_WORKSPACE_ROLE,
    capabilities: {
      type: "object",
      additionalProperties: false,
      required: ["read", "author", "review", "comment", "publish", "manage", "transfer"],
      properties: Object.fromEntries([
        "read", "author", "review", "comment", "publish", "manage", "transfer"
      ].map((name) => [name, { type: "boolean" }]))
    },
    members: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["userId", "email", "role", "primaryOwner", "joinedAt"],
        properties: {
          userId: UUID,
          email: { type: ["string", "null"] },
          role: EDUCATIONAL_WORKSPACE_ROLE,
          primaryOwner: { type: "boolean" },
          joinedAt: { type: "string", format: "date-time" }
        }
      }
    },
    invitations: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["invitationId", "email", "role", "expiresAt"],
        properties: {
          invitationId: UUID,
          email: { type: "string" },
          role: EDUCATIONAL_WORKSPACE_MUTABLE_ROLE,
          expiresAt: { type: "string", format: "date-time" }
        }
      }
    },
    courses: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "courseKey", "title", "goal", "position", "moduleCount", "lessonCount",
          "microsequenceCount", "readyMicrosequenceCount", "cardCount",
          "publicationTargets", "updatedAt"
        ],
        properties: {
          courseKey: ID,
          title: { type: "string" },
          goal: { type: "string" },
          position: { type: "integer", minimum: 0 },
          moduleCount: { type: "integer", minimum: 0 },
          lessonCount: { type: "integer", minimum: 0 },
          microsequenceCount: { type: "integer", minimum: 0 },
          readyMicrosequenceCount: { type: "integer", minimum: 0 },
          cardCount: { type: "integer", minimum: 0 },
          publicationTargets: {
            type: "array",
            uniqueItems: true,
            maxItems: 2,
            items: { type: "string", enum: ["private", "catalog"] }
          },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    },
    courseCount: { type: "integer", minimum: 0 },
    publicationCount: { type: "integer", minimum: 0 },
    updatedAt: { type: "string", format: "date-time" }
  }
});
const EDUCATIONAL_WORKSPACE_COMMAND_DATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "operation", "idempotent"],
  properties: {
    workspaceId: UUID,
    operation: {
      type: "string",
      enum: [
        "create", "update", "invite", "accept_invite", "cancel_invite",
        "set_role", "remove_member", "transfer_owner", "leave"
      ]
    },
    role: EDUCATIONAL_WORKSPACE_ROLE,
    userId: UUID,
    invitationId: UUID,
    code: { type: "string", minLength: 32, maxLength: 128 },
    expiresAt: { type: "string", format: "date-time" },
    idempotent: { type: "boolean" }
  }
});
const EDUCATIONAL_WORKSPACE_COMMENT_STATUS = Object.freeze({
  type: "string",
  enum: ["open", "considered", "resolved", "incorporated"]
});
const EDUCATIONAL_WORKSPACE_COMMENT_MUTABLE_STATUS = Object.freeze({
  type: "string",
  enum: ["open", "considered", "resolved"]
});
const EDUCATIONAL_WORKSPACE_COMMENT_CATEGORY = Object.freeze({
  type: "string",
  enum: ["question", "possible_error", "confusing", "suggestion", "observation"]
});
const EDUCATIONAL_WORKSPACE_COMMENT_CATEGORY_COUNTS = schema([
  "question", "possibleError", "confusing", "suggestion", "observation"
], {
  question: NON_NEGATIVE_INTEGER,
  possibleError: NON_NEGATIVE_INTEGER,
  confusing: NON_NEGATIVE_INTEGER,
  suggestion: NON_NEGATIVE_INTEGER,
  observation: NON_NEGATIVE_INTEGER
});
const EDUCATIONAL_WORKSPACE_COMMENT_STATUS_COUNTS = schema([
  "open", "considered", "resolved", "incorporated"
], {
  open: NON_NEGATIVE_INTEGER,
  considered: NON_NEGATIVE_INTEGER,
  resolved: NON_NEGATIVE_INTEGER,
  incorporated: NON_NEGATIVE_INTEGER
});
const EDUCATIONAL_WORKSPACE_COMMENTS_DATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "role", "summary", "items", "hasMore", "nextCursor"],
  properties: {
    workspaceId: UUID,
    role: EDUCATIONAL_WORKSPACE_ROLE,
    summary: schema([
      "totalCount", "openCount", "byCategory", "byStatus", "focusCards"
    ], {
      totalCount: NON_NEGATIVE_INTEGER,
      openCount: NON_NEGATIVE_INTEGER,
      byCategory: EDUCATIONAL_WORKSPACE_COMMENT_CATEGORY_COUNTS,
      byStatus: EDUCATIONAL_WORKSPACE_COMMENT_STATUS_COUNTS,
      focusCards: {
        type: "array",
        maxItems: 20,
        items: schema([
          "trailItemId", "courseId", "cardId", "courseTitle", "cardTitle", "entityPath",
          "targetAvailable", "totalCount", "openCount", "byCategory"
        ], {
          trailItemId: UUID,
          courseId: { anyOf: [UUID, { type: "null" }] },
          cardId: ID,
          courseTitle: { type: "string" },
          cardTitle: { type: ["string", "null"] },
          entityPath: {
            anyOf: [
              ENTITY_PATH,
              { type: "null" }
            ]
          },
          targetAvailable: { type: "boolean" },
          totalCount: NON_NEGATIVE_INTEGER,
          openCount: NON_NEGATIVE_INTEGER,
          byCategory: EDUCATIONAL_WORKSPACE_COMMENT_CATEGORY_COUNTS
        })
      }
    }),
    items: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "commentId", "workspaceId", "trailItemId", "courseId", "cardId", "entityPath",
          "courseTitle", "cardTitle", "author", "category", "body", "status",
          "response", "resolutionNote", "courseRevisionHash", "targetAvailable",
          "correction", "createdAt", "updatedAt", "respondedAt", "resolvedAt"
        ],
        properties: {
          commentId: UUID,
          workspaceId: UUID,
          trailItemId: UUID,
          courseId: { anyOf: [UUID, { type: "null" }] },
          cardId: ID,
          entityPath: { type: ["array", "null"], minItems: 5, maxItems: 5, items: ID },
          courseTitle: { type: "string" },
          cardTitle: { type: ["string", "null"] },
          author: {
            type: "object",
            additionalProperties: false,
            required: ["userId", "email"],
            properties: { userId: UUID, email: { type: "string" } }
          },
          category: EDUCATIONAL_WORKSPACE_COMMENT_CATEGORY,
          body: { type: "string", maxLength: 1000 },
          status: EDUCATIONAL_WORKSPACE_COMMENT_STATUS,
          response: { type: ["string", "null"], maxLength: 2000 },
          resolutionNote: { type: ["string", "null"], maxLength: 1000 },
          courseRevisionHash: { type: ["string", "null"], pattern: "^[a-f0-9]{64}$" },
          targetAvailable: { type: "boolean" },
          correction: {
            anyOf: [{ type: "null" }, {
              type: "object",
              additionalProperties: false,
              required: ["requestId", "entityPath", "linkedAt"],
              properties: {
                requestId: REQUEST_ID,
                entityPath: { type: "array", minItems: 1, maxItems: 5, items: ID },
                linkedAt: { type: "string", format: "date-time" }
              }
            }]
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          respondedAt: { type: ["string", "null"], format: "date-time" },
          resolvedAt: { type: ["string", "null"], format: "date-time" }
        }
      }
    },
    hasMore: { type: "boolean" },
    nextCursor: {
      anyOf: [{ type: "null" }, schema(["beforeUpdatedAt", "beforeId"], {
        beforeUpdatedAt: { type: "string", format: "date-time" }, beforeId: UUID
      })]
    }
  }
});
const EDUCATIONAL_WORKSPACE_COMMENT_COMMAND_DATA_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "commentId", "operation", "status", "updatedAt", "idempotent"],
  properties: {
    workspaceId: UUID,
    commentId: UUID,
    operation: {
      type: "string",
      enum: ["respond_comment", "set_comment_status", "link_comment_correction"]
    },
    status: EDUCATIONAL_WORKSPACE_COMMENT_STATUS,
    updatedAt: { type: "string", format: "date-time" },
    idempotent: { type: "boolean" },
    resultingRevision: { anyOf: [REVISION, { type: "null" }] }
  }
});

const EDUCATIONAL_WORKSPACE_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    readSchema(["operation", "workspaceId"], {
      operation: { const: "read" }, workspaceId: UUID
    }),
    writeSchema(["operation", "workspaceId", "title", "purpose", "kind", "visibility"], {
      operation: { const: "create" }, workspaceId: UUID,
      title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
      purpose: { type: "string", maxLength: 1000 },
      kind: { type: "string", enum: ["personal", "class", "team"] },
      visibility: { type: "string", enum: ["private", "members"] }
    }),
    writeSchema(["operation", "workspaceId", "title", "purpose", "kind", "visibility"], {
      operation: { const: "update" }, workspaceId: UUID,
      title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
      purpose: { type: "string", maxLength: 1000 },
      kind: { type: "string", enum: ["personal", "class", "team"] },
      visibility: { type: "string", enum: ["private", "members"] }
    }),
    writeSchema(["operation", "workspaceId", "email", "role"], {
      operation: { const: "invite" }, workspaceId: UUID,
      email: { type: "string", minLength: 3, maxLength: 320 },
      role: EDUCATIONAL_WORKSPACE_MUTABLE_ROLE
    }),
    writeSchema(["operation", "code"], {
      operation: { const: "accept_invite" },
      code: { type: "string", minLength: 32, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" }
    }),
    writeSchema(["operation", "workspaceId", "invitationId"], {
      operation: { const: "cancel_invite" }, workspaceId: UUID, invitationId: UUID
    }),
    writeSchema(["operation", "workspaceId", "userId", "role"], {
      operation: { const: "set_role" }, workspaceId: UUID, userId: UUID,
      role: EDUCATIONAL_WORKSPACE_MUTABLE_ROLE
    }),
    writeSchema(["operation", "workspaceId", "userId"], {
      operation: { const: "remove_member" }, workspaceId: UUID, userId: UUID
    }),
    writeSchema(["operation", "workspaceId", "userId"], {
      operation: { const: "transfer_owner" }, workspaceId: UUID, userId: UUID
    }),
    writeSchema(["operation", "workspaceId"], {
      operation: { const: "leave" }, workspaceId: UUID
    }),
    readSchema(["operation", "workspaceId"], {
      operation: { const: "list_comments" }, workspaceId: UUID,
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      beforeUpdatedAt: { type: "string", format: "date-time" },
      beforeId: UUID,
      categories: {
        type: "array", maxItems: 5, uniqueItems: true,
        items: EDUCATIONAL_WORKSPACE_COMMENT_CATEGORY
      },
      statuses: {
        type: "array", maxItems: 4, uniqueItems: true,
        items: EDUCATIONAL_WORKSPACE_COMMENT_STATUS
      }
    }),
    writeSchema(["operation", "workspaceId", "commentId", "response"], {
      operation: { const: "respond_comment" }, workspaceId: UUID, commentId: UUID,
      response: { type: "string", minLength: 1, maxLength: 2000, pattern: "\\S" }
    }),
    writeSchema(["operation", "workspaceId", "commentId", "status"], {
      operation: { const: "set_comment_status" }, workspaceId: UUID, commentId: UUID,
      status: EDUCATIONAL_WORKSPACE_COMMENT_MUTABLE_STATUS,
      note: { type: "string", maxLength: 1000 }
    }),
    writeSchema([
      "operation", "workspaceId", "commentId", "correctionRequestId", "entityPath"
    ], {
      operation: { const: "link_comment_correction" }, workspaceId: UUID, commentId: UUID,
      correctionRequestId: REQUEST_ID,
      entityPath: { type: "array", minItems: 1, maxItems: 5, items: ID }
    })
  ]
});

const WORKSPACE_OBSERVATION_ITEM_SCHEMA = schema([
  "observationId", "workspaceId", "kind", "entityType", "entityPath",
  "currentEntityPath", "targetAvailable", "body", "authorId", "canDelete",
  "createdAt", "updatedAt"
], {
  observationId: UUID,
  workspaceId: UUID,
  entityType: {
    type: "string",
    enum: ["workspace", "course", "module", "lesson", "microsequence", "card", "resource"]
  },
  entityPath: { type: "array", minItems: 0, maxItems: 5, items: ID },
  currentEntityPath: {
    anyOf: [
      { type: "array", minItems: 0, maxItems: 5, items: ID },
      { type: "null" }
    ]
  },
  targetAvailable: { type: "boolean" },
  resourceTargetId: { type: ["string", "null"], maxLength: 240 },
  body: { type: "string", minLength: 1, maxLength: 2000 },
  kind: { type: "string", enum: ["note", "audit_finding"] },
  category: { type: ["string", "null"], maxLength: 64 },
  severity: {
    type: ["string", "null"],
    enum: ["low", "medium", "high", "critical", null]
  },
  status: {
    type: ["string", "null"],
    enum: ["open", "approved", "rejected", "repaired", "resolved", null]
  },
  proposedRepair: { type: ["string", "null"], maxLength: 1_000 },
  auditRevision: { anyOf: [REVISION, { type: "null" }] },
  pendingCorrectionRequestId: { type: ["string", "null"], maxLength: 128 },
  pendingRevision: { anyOf: [REVISION, { type: "null" }] },
  correctionRequestId: { type: ["string", "null"], maxLength: 128 },
  resultingRevision: { anyOf: [REVISION, { type: "null" }] },
  verification: { type: ["string", "null"], maxLength: 1_000 },
  verifiedRevision: { anyOf: [REVISION, { type: "null" }] },
  authorId: UUID,
  canDelete: { type: "boolean" },
  createdAt: DATE_TIME,
  updatedAt: DATE_TIME
});
const WORKSPACE_OBSERVATION_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    pairedCursorReadSchema(
      ["operation", "workspaceId"],
      {
        operation: { const: "list_observations" },
        workspaceId: UUID,
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        beforeUpdatedAt: DATE_TIME,
        beforeId: UUID,
        entityTypes: {
          type: "array",
          maxItems: 7,
          uniqueItems: true,
          items: {
            type: "string",
            enum: [
              "workspace", "course", "module", "lesson",
              "microsequence", "card", "resource"
            ]
          }
        },
        kinds: {
          type: "array",
          maxItems: 2,
          uniqueItems: true,
          items: { type: "string", enum: ["note", "audit_finding"] }
        },
        statuses: {
          type: "array",
          maxItems: 5,
          uniqueItems: true,
          items: {
            type: "string",
            enum: ["open", "approved", "rejected", "repaired", "resolved"]
          }
        }
      },
      "beforeUpdatedAt",
      "beforeId"
    ),
    writeSchema(["operation", "workspaceId", "entityType", "entityPath", "body"], {
      operation: { const: "create_observation" },
      workspaceId: UUID,
      entityType: {
        type: "string",
        enum: ["workspace", "course", "module", "lesson", "microsequence", "card", "resource"]
      },
      entityPath: { type: "array", minItems: 0, maxItems: 5, items: ID },
      resourceTargetId: ID,
      body: { type: "string", minLength: 1, maxLength: 2000, pattern: "\\S" }
    }),
    writeSchema(["operation", "workspaceId", "observationId"], {
      operation: { const: "delete_observation" },
      workspaceId: UUID,
      observationId: UUID
    })
  ]
});
const WORKSPACE_OBSERVATION_DATA_SCHEMA = Object.freeze({
  type: "object",
  anyOf: [
    schema(["workspaceId", "items", "hasMore", "nextCursor", "summary"], {
      workspaceId: UUID,
      items: { type: "array", items: WORKSPACE_OBSERVATION_ITEM_SCHEMA },
      hasMore: { type: "boolean" },
      nextCursor: {
        anyOf: [{ type: "null" }, schema(["beforeUpdatedAt", "beforeId"], {
          beforeUpdatedAt: DATE_TIME,
          beforeId: UUID
        })]
      },
      summary: OPEN_CANONICAL_OBJECT
    }),
    schema(["operation", "observationId", "workspaceId", "updatedAt", "idempotent"], {
      operation: { type: "string", enum: ["create", "delete"] },
      observationId: UUID,
      workspaceId: UUID,
      updatedAt: DATE_TIME,
      idempotent: { type: "boolean" }
    })
  ]
});
const EDUCATIONAL_WORKSPACE_WITH_OBSERVATIONS_INPUT_SCHEMA = discriminatedInputSchema([
  ...EDUCATIONAL_WORKSPACE_INPUT_SCHEMA.oneOf,
  ...WORKSPACE_OBSERVATION_INPUT_SCHEMA.oneOf
]);
const EDUCATIONAL_WORKSPACE_WITH_OBSERVATIONS_DATA_SCHEMA = Object.freeze({
  type: "object",
  anyOf: Object.freeze([
    EDUCATIONAL_WORKSPACE_DETAILS_DATA_SCHEMA,
    EDUCATIONAL_WORKSPACE_COMMAND_DATA_SCHEMA,
    EDUCATIONAL_WORKSPACE_COMMENTS_DATA_SCHEMA,
    EDUCATIONAL_WORKSPACE_COMMENT_COMMAND_DATA_SCHEMA,
    ...WORKSPACE_OBSERVATION_DATA_SCHEMA.anyOf
  ])
});

const CONTINUITY_PLAN_PART_SCHEMA = schema(["id", "title", "microsequenceIds"], {
  id: ID,
  title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
  microsequenceIds: {
    type: "array", minItems: 1, maxItems: 500, uniqueItems: true, items: ID
  }
});
const CONTINUITY_MANDATE_ARGUMENT_SCHEMA = Object.freeze({
  ...schema(["id", "kind"], {
    id: ID,
    kind: {
      type: "string",
      enum: ["build_part", "repair_findings", "audit", "restructure"]
    },
    targetPartId: ID,
    findingIds: { type: "array", maxItems: 50, uniqueItems: true, items: UUID },
    note: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" }
  }),
  allOf: [
    {
      if: { properties: { kind: { const: "build_part" } }, required: ["kind"] },
      then: {
        properties: { targetPartId: {} },
        required: ["targetPartId"],
        not: { properties: { findingIds: {} }, required: ["findingIds"] }
      }
    },
    {
      if: {
        properties: { kind: { const: "repair_findings" } },
        required: ["kind"]
      },
      then: {
        required: ["findingIds"],
        properties: { findingIds: { type: "array", minItems: 1 } },
        not: { properties: { targetPartId: {} }, required: ["targetPartId"] }
      }
    },
    {
      if: {
        properties: { kind: { enum: ["audit", "restructure"] } },
        required: ["kind"]
      },
      then: {
        not: { properties: { findingIds: {} }, required: ["findingIds"] }
      }
    }
  ]
});

const CONTINUITY_INPUT_SCHEMA = discriminatedInputSchema([
  writeSchema(["operation", "workspaceId", "expectedRevision", "brief"], {
    operation: { const: "replace_stable_brief" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    brief: {
      type: "string",
      minLength: 1,
      maxLength: 16_000,
      pattern: "\\S",
      description: "Contexto estável completo; máximo de 16 KiB em UTF-8."
    }
  }),
  writeSchema([
    "operation", "workspaceId", "expectedRevision", "parts", "decisions", "mandate"
  ], {
    operation: { const: "record_approved_plan" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    parts: {
      type: "array", minItems: 1, maxItems: 64,
      items: CONTINUITY_PLAN_PART_SCHEMA
    },
    decisions: {
      type: "array", minItems: 1, maxItems: 128,
      items: CONTINUITY_DECISION_SCHEMA
    },
    mandate: {
      anyOf: [CONTINUITY_MANDATE_ARGUMENT_SCHEMA, { type: "null" }]
    }
  }),
  writeSchema([
    "operation", "workspaceId", "expectedRevision", "partId", "title",
    "microsequenceIds"
  ], {
    operation: { const: "define_part" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    partId: ID,
    title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
    microsequenceIds: {
      type: "array", minItems: 1, maxItems: 500, uniqueItems: true, items: ID
    }
  }),
  writeSchema(["operation", "workspaceId", "expectedRevision", "partId"], {
    operation: { const: "remove_part" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    partId: ID
  }),
  Object.freeze({
    ...writeSchema([
      "operation", "workspaceId", "expectedRevision", "decisionId", "summary"
    ], {
      operation: { const: "record_decision" },
      workspaceId: UUID,
      expectedRevision: REVISION,
      decisionId: ID,
      summary: { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" },
      entityType: ENTITY_TYPE,
      entityId: ID
    }),
    allOf: [
      {
        if: { properties: { entityType: {} }, required: ["entityType"] },
        then: { properties: { entityId: ID }, required: ["entityId"] }
      },
      {
        if: { properties: { entityId: {} }, required: ["entityId"] },
        then: { properties: { entityType: ENTITY_TYPE }, required: ["entityType"] }
      }
    ]
  }),
  writeSchema(["operation", "workspaceId", "expectedRevision", "decisionId"], {
    operation: { const: "remove_decision" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    decisionId: ID
  }),
  Object.freeze({
    ...writeSchema([
      "operation", "workspaceId", "expectedRevision", "mandateId", "kind"
    ], {
      operation: { const: "set_mandate" },
      workspaceId: UUID,
      expectedRevision: REVISION,
      mandateId: ID,
      kind: {
        type: "string",
        enum: ["build_part", "repair_findings", "audit", "restructure"]
      },
      targetPartId: ID,
      findingIds: { type: "array", maxItems: 50, uniqueItems: true, items: UUID },
      note: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" }
    }),
    allOf: [
      {
        if: { properties: { kind: { const: "build_part" } }, required: ["kind"] },
        then: {
          properties: { targetPartId: {} },
          required: ["targetPartId"],
          not: { properties: { findingIds: {} }, required: ["findingIds"] }
        }
      },
      {
        if: {
          properties: { kind: { const: "repair_findings" } },
          required: ["kind"]
        },
        then: {
          required: ["findingIds"],
          properties: { findingIds: { type: "array", minItems: 1 } },
          not: { properties: { targetPartId: {} }, required: ["targetPartId"] }
        }
      },
      {
        if: {
          properties: { kind: { enum: ["audit", "restructure"] } },
          required: ["kind"]
        },
        then: {
          not: { properties: { findingIds: {} }, required: ["findingIds"] }
        }
      }
    ]
  }),
  writeSchema(["operation", "workspaceId", "expectedRevision"], {
    operation: { const: "clear_mandate" },
    workspaceId: UUID,
    expectedRevision: REVISION
  }),
  Object.freeze({
    ...writeSchema([
      "operation", "workspaceId", "expectedRevision", "entityType", "entityPath",
      "category", "severity", "summary", "proposedRepair"
    ], {
      operation: { const: "record_finding" },
      workspaceId: UUID,
      expectedRevision: REVISION,
      entityType: {
        type: "string",
        enum: [
          "workspace", "course", "module", "lesson",
          "microsequence", "card", "resource"
        ]
      },
      entityPath: { type: "array", minItems: 0, maxItems: 5, items: ID },
      resourceTargetId: ID,
      category: { type: "string", minLength: 1, maxLength: 64, pattern: "\\S" },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      summary: { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" },
      proposedRepair: {
        type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S"
      }
    }),
    allOf: [
      ...[
        ["workspace", 0], ["course", 1], ["module", 2], ["lesson", 3],
        ["microsequence", 4], ["card", 5], ["resource", 5]
      ].map(([entityType, depth]) => ({
        if: { properties: { entityType: { const: entityType } }, required: ["entityType"] },
        then: { properties: { entityPath: fixedEntityPath(depth) } }
      })),
      {
        if: {
          properties: { entityType: { const: "resource" } },
          required: ["entityType"]
        },
        then: { required: ["resourceTargetId"] },
        else: { not: { required: ["resourceTargetId"] } }
      }
    ]
  }),
  writeSchema([
    "operation", "workspaceId", "expectedRevision", "observationId", "decision"
  ], {
    operation: { const: "decide_finding" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    observationId: UUID,
    decision: { type: "string", enum: ["approved", "rejected"] }
  }),
  writeSchema([
    "operation", "workspaceId", "expectedRevision", "observationId",
    "correctionRequestId"
  ], {
    operation: { const: "link_finding_correction" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    observationId: UUID,
    correctionRequestId: REQUEST_ID
  }),
  writeSchema([
    "operation", "workspaceId", "expectedRevision", "observationId", "outcome",
    "note"
  ], {
    operation: { const: "verify_finding" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    observationId: UUID,
    outcome: { type: "string", enum: ["resolved", "still_open"] },
    note: { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" }
  }),
  writeSchema(["operation", "workspaceId", "expectedRevision", "observationId"], {
    operation: { const: "delete_finding" },
    workspaceId: UUID,
    expectedRevision: REVISION,
    observationId: UUID
  })
], { write: true });

const CONTINUITY_STATE_MUTATION_DATA_SCHEMA = schema([
  "workspaceId", "revision", "continuityOperation", "stateVersion",
  "partCount", "decisionCount", "mandateId", "updatedAt", "idempotent"
], {
  workspaceId: UUID,
  revision: REVISION,
  continuityOperation: {
    type: "string",
    enum: [
      "define_part", "remove_part", "record_decision", "remove_decision",
      "record_approved_plan", "set_mandate", "clear_mandate"
    ]
  },
  stateVersion: { const: 1 },
  partCount: NON_NEGATIVE_INTEGER,
  decisionCount: NON_NEGATIVE_INTEGER,
  mandateId: { anyOf: [ID, { type: "null" }] },
  updatedAt: DATE_TIME,
  idempotent: { type: "boolean" }
});
const CONTINUITY_FINDING_MUTATION_DATA_SCHEMA = schema([
  "workspaceId", "revision", "observationId", "findingOperation", "status",
  "updatedAt", "idempotent"
], {
  workspaceId: UUID,
  revision: REVISION,
  observationId: UUID,
  findingOperation: {
    type: "string",
    enum: [
      "record_finding", "decide_finding", "link_finding_correction",
      "verify_finding", "delete_finding"
    ]
  },
  status: {
    type: "string",
    enum: ["open", "approved", "rejected", "repaired", "resolved", "deleted"]
  },
  updatedAt: DATE_TIME,
  idempotent: { type: "boolean" }
});
const CONTINUITY_MUTATION_DATA_SCHEMA = Object.freeze({
  type: "object",
  anyOf: [
    WORKSPACE_REVISION_DATA_SCHEMA,
    CONTINUITY_STATE_MUTATION_DATA_SCHEMA,
    CONTINUITY_FINDING_MUTATION_DATA_SCHEMA
  ]
});

const INDIVIDUAL_AUTHORING_WORKSPACE_MCP_TOOLS = Object.freeze([
  tool(
    "prepararAutoriaAraLearn",
    "Preparar autoria AraLearn",
    "Use no início da etapa: create planeja/cria, extend amplia/constrói, audit audita sem alterar conteúdo ou estrutura, repair repara, restructure reorganiza e publish prepara submissão ou distribui em Coleções.",
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
      packageIds: {
        type: "array",
        maxItems: AUTHORING_PACKAGE_IDS.length,
        uniqueItems: true,
        items: { type: "string", enum: AUTHORING_PACKAGE_IDS }
      }
    }),
    AUTHORING_CONTEXT_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "listarPackagesDeCard",
    "Listar packages de card",
    "Lista manifests compactos dos packages disponíveis, sem enviar schemas ou exemplos.",
    readSchema(),
    PACKAGE_LIST_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "consultarPackageDeCard",
    "Consultar package de card",
    "Lê o contrato autoral e o schema da versão exata de um package já escolhido.",
    readSchema(["packageId", "version"], {
      packageId: {
        type: "string",
        enum: AUTHORING_PACKAGE_IDS
      },
      version: { type: "string", pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$" }
    }),
    PACKAGE_DEFINITION_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "listarCursosDaBibliotecaPessoal",
    "Listar cursos de Trilhas",
    "Lista a projeção corrente de Trilhas: planos, cursos em materialização e cursos selecionados, sem exigir publicação.",
    groupedCursorReadSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 25, default: 20 },
      afterId: UUID
    }, ["afterId"]),
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
    "Transfere um curso oficial para outra Coleção usando a revisão da classificação lida.",
    writeSchema([
      "courseId", "expectedPlacementRevision", "targetCollectionId"
    ], {
      courseId: UUID,
      expectedPlacementRevision: REVISION,
      targetCollectionId: UUID
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
    "gerirWorkspaceEducacional",
    "Gerir workspace educacional",
    "Lê contexto e observações ou administra participantes e o ciclo de melhoria conforme operation e o papel local.",
    EDUCATIONAL_WORKSPACE_WITH_OBSERVATIONS_INPUT_SCHEMA,
    EDUCATIONAL_WORKSPACE_WITH_OBSERVATIONS_DATA_SCHEMA,
    { actionConsequentialHint: true }
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
        description: "Resumo do público, objetivo, escopo, fontes e restrições; máximo de 16 KiB em UTF-8. Declare cada fonte aprovada como [source:id] seguida de sua identificação."
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
    "Lê a árvore, uma entidade ou o documento composto; use view resume ao retomar outra sessão. Se findings.truncated for true, detalhe achados por list_observations com kind audit_finding.",
    readSchema(["workspaceId"], {
      workspaceId: UUID,
      ...WORKSPACE_VIEW_PROPERTIES
    }),
    WORKSPACE_READ_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  tool(
    "revisarMicroteoriasDoWorkspace",
    "Apresentar microteorias",
    "Projeta teoria, cobertura, checks, erros, resources, tópicos e contagem de práticas de uma lição ou microssequência; apresenta conteúdo, não faz auditoria.",
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
    "No workspace, localiza cards por id, posição, kind, resource e resumo. Para mostrar ou auditar práticas, releia como entidade só os alvos pedidos; abra ou importe antes uma publicação.",
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
    "Materializa uma microssequência imediatamente renderizável. append acrescenta cards; replace substitui e também pode esvaziar a sequência.",
    writeSchema([
      "workspaceId", "expectedRevision", "microsequencePath",
      "mode", "cardsJson"
    ], {
      workspaceId: UUID,
      expectedRevision: REVISION,
      microsequencePath: MICROSEQUENCE_PATH,
      mode: { type: "string", enum: ["append", "replace"] },
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
    "Altera somente os metadados informados a partir da leitura atual.",
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
    "Substitui somente o card autorizado, preservando id e posição, e conclui o reparo atômico da microssequência. Consulte antes o resource.",
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
    "Distribuir curso",
    "Trilhas já mostra e permite estudar o workspace sem esta operação. Materializa um artefato explícito: private prepara ou atualiza a revisão privada usada numa submissão editorial; catalog distribui ou atualiza o curso em Coleções quando a conta tem capacidade.",
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
    "gerirContinuidadeDaAutoria",
    "Gerir continuidade da autoria",
    "Mantém contexto estável, Partes, decisões, mandato e achados sem copiar árvore ou conversa. record_approved_plan persiste o plano aprovado em uma escrita; replace_stable_brief substitui somente público, objetivo, fontes, recorte e restrições.",
    CONTINUITY_INPUT_SCHEMA,
    CONTINUITY_MUTATION_DATA_SCHEMA
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
    writeSchema(["workspaceId", "expectedRevision"], {
      workspaceId: UUID,
      expectedRevision: REVISION
    }),
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

function discriminatedInputSchema(alternatives, { write = false } = {}) {
  const frozenAlternatives = Object.freeze([...alternatives]);
  const operations = Object.freeze(frozenAlternatives.map((alternative) => {
    const operation = alternative?.properties?.operation?.const;
    if (typeof operation !== "string" || !operation) {
      throw new TypeError("Variante discriminada sem operation constante.");
    }
    return operation;
  }));
  return Object.freeze({
    type: "object",
    required: Object.freeze(write
      ? ["requestId", "operation"]
      : ["operation"]),
    properties: Object.freeze({
      ...(write ? { requestId: REQUEST_ID } : {}),
      operation: Object.freeze({ type: "string", enum: operations })
    }),
    oneOf: frozenAlternatives
  });
}

function groupedCursorReadSchema(required, properties, fields) {
  return Object.freeze({
    ...readSchema(required, properties),
    allOf: fields.map((field) => ({
      if: { required: [field] },
      then: { required: fields }
    }))
  });
}

function groupedInputSchema(branches, { write = false } = {}) {
  return discriminatedInputSchema(branches.map(({ operation, toolName }) =>
    schemaWithOperation(individualTool(toolName).inputSchema, operation)
  ), { write });
}

function groupedDataSchema(branches) {
  return Object.freeze({
    type: "object",
    anyOf: Object.freeze(branches.map(({ toolName }) =>
      individualTool(toolName).outputSchema.oneOf[0].properties.data
    ))
  });
}

const PACKAGE_QUERY_TOOL = tool(
  "consultarPackagesDeCard",
  "Consultar packages de card",
  "Sem packageId, lista somente manifests compactos; depois de escolher pela operação cognitiva, informe packageId e version para receber apenas o contrato específico.",
  readSchema([], {
    packageId: {
      type: "string",
      enum: AUTHORING_PACKAGE_IDS
    },
    version: { type: "string", pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$" },
    slot: { type: "string", enum: ["content", "response", "feedback"] }
  }),
  Object.freeze({
    type: "object",
    anyOf: [PACKAGE_LIST_DATA_SCHEMA, PACKAGE_DEFINITION_DATA_SCHEMA]
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
  "Editar Coleções",
  "Cria ou atualiza uma Coleção, ou transfere um curso oficial entre Coleções, conforme operation.",
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
  ["listarPackagesDeCard", PACKAGE_QUERY_TOOL],
  ["listarColecoesDoCatalogo", CATALOG_QUERY_TOOL],
  ["criarColecaoNoCatalogo", CATALOG_EDIT_TOOL],
  ["retirarColecaoDoCatalogo", CATALOG_REMOVE_TOOL],
  ["copiarEntidadeNoWorkspace", WORKSPACE_REORGANIZATION_TOOL],
  ["excluirEntidadeDoWorkspace", WORKSPACE_DELETE_TOOL]
]);
const CONSOLIDATED_REMOVALS = new Set([
  "consultarPackageDeCard",
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
  "consultarPackagesDeCard",
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
        "cardsJson deve conter uma lista JSON válida de envelopes com packages."
      );
    }
    if (!Array.isArray(cards)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        "cardsJson deve conter uma lista JSON de envelopes com packages."
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
        "cardJson deve conter um envelope JSON válido de card com packages."
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

export function validateAuthoringMcpToolOutput(name, value) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) {
    throw new AuthoringApiError(404, "unknown_tool", "Ferramenta inexistente.");
  }
  validateValue(value, definition.outputSchema, "result");
  return value;
}

export function authoringMcpToolIsAllowed(name, principal) {
  const definition = TOOL_BY_NAME.get(name);
  if (
    !definition ||
    !new Set(["oauth", "application"]).has(principal?.authenticationKind) ||
    !principal?.actorId
  ) {
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
  if (name === "consultarPackagesDeCard") {
    if (Boolean(args.packageId) !== Boolean(args.version)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        "packageId e version precisam ser informados juntos."
      );
    }
    if (args.packageId && args.slot) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        "slot pertence somente à listagem compacta."
      );
    }
    name = args.packageId ? "consultarPackageDeCard" : "listarPackagesDeCard";
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
  if (name === "listarPackagesDeCard") {
    return {
      method: "GET",
      path: `/v1/packages${args.slot ? `?slot=${encode(args.slot)}` : ""}`,
      body: null,
      requestId: null
    };
  }
  if (name === "consultarPackageDeCard") {
    return {
      method: "GET",
      path: `/v1/packages/${encode(args.packageId)}?version=${encode(args.version)}`,
      body: null,
      requestId: null
    };
  }
  if (name === "listarCursosDaBibliotecaPessoal") {
    return {
      method: "GET",
      path: "/v1/library/courses" + query(args, [
        "limit", "afterId"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "gerirWorkspaceEducacional") {
    if (args.operation === "read") {
      return {
        method: "GET",
        path: `/v1/educational-workspaces/${encode(args.workspaceId)}`,
        body: null,
        requestId: null
      };
    }
    if (args.operation === "list_comments") {
      return {
        method: "GET",
        path: `/v1/educational-workspaces/${encode(args.workspaceId)}/comments` + query(args, [
          "limit", "beforeUpdatedAt", "beforeId", "categories", "statuses"
        ]),
        body: null,
        requestId: null
      };
    }
    if (args.operation === "list_observations") {
      return {
        method: "GET",
        path: `/v1/workspaces/${encode(args.workspaceId)}/observations` + query(args, [
          "limit", "beforeUpdatedAt", "beforeId", "entityTypes", "kinds", "statuses"
        ]),
        body: null,
        requestId: null
      };
    }
    if (["create_observation", "delete_observation"].includes(args.operation)) {
      const { requestId, operation, workspaceId, ...payload } = args;
      return {
        method: "POST",
        path: `/v1/workspaces/${encode(workspaceId)}/observations/actions`,
        body: {
          requestId,
          operation: operation === "create_observation" ? "create" : "delete",
          payload
        },
        requestId
      };
    }
    if (["respond_comment", "set_comment_status", "link_comment_correction"]
      .includes(args.operation)) {
      const { requestId, operation, workspaceId, commentId, ...payload } = args;
      return {
        method: "POST",
        path: `/v1/educational-workspaces/${encode(workspaceId)}/comments/${encode(commentId)}/actions`,
        body: { requestId, operation, payload },
        requestId
      };
    }
    const { requestId, operation, ...payload } = args;
    return {
      method: "POST",
      path: "/v1/educational-workspaces/actions",
      body: { requestId, operation, payload },
      requestId
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
        "limit", "afterId", "query", "includeRetired"
      ]),
      body: null,
      requestId: null
    };
  }
  if (name === "listarCursosDaColecao") {
    return {
      method: "GET",
      path: `/v1/catalog/collections/${encode(args.collectionId)}/courses` + query(args, [
        "limit", "afterId", "query"
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
  if (name === "gerirContinuidadeDaAutoria") {
    const { requestId, workspaceId, expectedRevision, operation, ...rawPayload } = args;
    const payload = { ...rawPayload };
    if (operation === "define_part") {
      payload.id = payload.partId;
      delete payload.partId;
    } else if (operation === "record_decision") {
      payload.id = payload.decisionId;
      delete payload.decisionId;
    } else if (operation === "set_mandate") {
      payload.id = payload.mandateId;
      delete payload.mandateId;
    }
    return {
      method: "POST",
      path: `/v1/workspaces/${encode(workspaceId)}/continuity/actions`,
      body: { requestId, expectedRevision, operation, arguments: payload },
      requestId
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
      body: {
        requestId: args.requestId,
        expectedRevision: args.expectedRevision
      },
      requestId: args.requestId
    };
  }
  throw new AuthoringApiError(404, "unknown_tool", "Ferramenta inexistente.");
}
