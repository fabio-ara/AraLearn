import { AuthoringApiError } from "./errors.js";
import {
  EXPERIMENT_DIFFERENCE_CLASSIFICATIONS
} from "../aralearn/runtime/authoring/instructionalExperiment.js";
import {
  INSTRUCTIONAL_DESIGN_CONTRACTS
} from "../aralearn/runtime/authoring/instructionalDesignContracts.js";
const UUID = Object.freeze({ type: "string", format: "uuid" });
const ID = Object.freeze({ type: "string", minLength: 1, maxLength: 240, pattern: "\\S" });
const PACKAGE_ID = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: "^aralearn\\.(?:resource|response)\\.[a-z0-9_]+$"
});
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
  "author", "review", "comment", "publish", "research", "manage"
], Object.fromEntries([
  "author", "review", "comment", "publish", "research", "manage"
].map((capability) => [capability, { type: "boolean" }])));
const AUTHORING_INTENT = Object.freeze({
  type: "string",
  description: "audit audita ou reaudita sem alterar conteúdo ou estrutura; as demais intents nomeiam sua etapa.",
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
const VERSIONED_REFERENCE_SCHEMA = schema(["id", "version"], {
  id: ID,
  version: {
    type: "string",
    minLength: 1,
    maxLength: 80,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$"
  }
});
const NULLABLE_VERSIONED_REFERENCE_SCHEMA = Object.freeze({
  oneOf: [{ type: "null" }, VERSIONED_REFERENCE_SCHEMA]
});
const AUTHORING_AUDIT_CODE_SCHEMA = Object.freeze({
  type: "string",
  minLength: 2,
  maxLength: 120,
  pattern: "^[a-z][a-z0-9_.-]{1,119}$"
});
const AUTHORING_AUDIT_CATEGORY_SCHEMA = Object.freeze({
  type: "string",
  enum: [
    "structure", "design", "explanation", "practice", "resources",
    "coverage", "coherence", "dependencies", "redundancy", "integration"
  ]
});
const AUTHORING_AUDIT_RULE_REF_SCHEMA = schema(["kind", "id", "version"], {
  kind: NON_EMPTY_STRING,
  id: ID,
  version: { type: ["string", "null"], maxLength: 80 }
});
const AUTHORING_AUDIT_BOUNDED_REFS_SCHEMA = schema([
  "items", "count", "truncated"
], {
  items: {
    type: "array",
    maxItems: 20,
    uniqueItems: true,
    items: VERSIONED_REFERENCE_SCHEMA
  },
  count: NON_NEGATIVE_INTEGER,
  truncated: { type: "boolean" }
});
const AUTHORING_AUDIT_BOUNDED_IDS_SCHEMA = schema([
  "items", "count", "truncated"
], {
  items: {
    type: "array",
    maxItems: 20,
    uniqueItems: true,
    items: ID
  },
  count: NON_NEGATIVE_INTEGER,
  truncated: { type: "boolean" }
});
const AUTHORING_AUDIT_METRIC_REFS_SCHEMA = schema([
  "items", "count", "truncated"
], {
  items: {
    type: "array",
    maxItems: 5,
    uniqueItems: true,
    items: ID
  },
  count: NON_NEGATIVE_INTEGER,
  truncated: { type: "boolean" }
});
const AUTHORING_AUDIT_ARTIFACT_REFS_SCHEMA = schema([
  "analysisRef", "effectiveSnapshotRef", "blueprintRef", "bindingRef",
  "manifestRef", "resourceSetRefs", "microsequenceRefs"
], {
  analysisRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  effectiveSnapshotRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  blueprintRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  bindingRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  manifestRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  resourceSetRefs: AUTHORING_AUDIT_BOUNDED_REFS_SCHEMA,
  microsequenceRefs: AUTHORING_AUDIT_BOUNDED_IDS_SCHEMA
});
const RESOURCE_LIBRARY_OPERATIONS = Object.freeze([
  "explore",
  "search",
  "inspect",
  "contracts",
  "validate_card",
  "audit_representation",
  "preview_card"
]);
const RESOURCE_LIBRARY_CONTRACT = Object.freeze({
  const: "aralearn.resource-library.v1"
});
const RESOURCE_FIT = Object.freeze({
  type: "string",
  enum: ["canonical", "versatile", "substitute"]
});
const RESOURCE_COVERAGE_STATUS = Object.freeze({
  type: "string",
  enum: ["canonical", "versatile", "substitute", "blocked"]
});
const RESOURCE_LIBRARY_CATALOG_HEADER = Object.freeze({
  contract: RESOURCE_LIBRARY_CONTRACT,
  catalogVersion: NON_EMPTY_STRING
});
const RESOURCE_LIBRARY_COMPOSITION_ITEM_SCHEMA = schema([
  "slot", "index", "instanceId", "packageId", "version"
], {
  slot: { type: "string", enum: ["content", "response", "feedback"] },
  index: NON_NEGATIVE_INTEGER,
  instanceId: { type: "string" },
  packageId: { type: "string" },
  version: { type: "string" }
});
const RESOURCE_LIBRARY_VALIDATION_SCHEMA = schema([
  "contract", "catalogVersion", "valid", "errors", "composition"
], {
  ...RESOURCE_LIBRARY_CATALOG_HEADER,
  valid: { type: "boolean" },
  errors: { type: "array", maxItems: 100, items: { type: "string" } },
  composition: {
    type: "array",
    maxItems: 64,
    items: RESOURCE_LIBRARY_COMPOSITION_ITEM_SCHEMA
  }
});
const RESOURCE_LIBRARY_FACET_SCHEMA = schema([
  "id", "label", "aliases", "count"
], {
  id: ID,
  label: NON_EMPTY_STRING,
  aliases: { type: "array", maxItems: 24, items: NON_EMPTY_STRING },
  count: NON_NEGATIVE_INTEGER
});
const RESOURCE_LIBRARY_EXPLORE_SCHEMA = schema([
  "contract", "catalogVersion", "policyVersion", "policy", "packageCount",
  "families", "facets"
], {
  ...RESOURCE_LIBRARY_CATALOG_HEADER,
  policyVersion: { const: 1 },
  policy: schema([
    "contract", "decision", "interpretability", "theoryDensity",
    "practiceContext", "selectionEvidence"
  ], {
    contract: { const: "aralearn.resource-selection-policy.v1" },
    decision: NON_EMPTY_STRING,
    interpretability: NON_EMPTY_STRING,
    theoryDensity: NON_EMPTY_STRING,
    practiceContext: NON_EMPTY_STRING,
    selectionEvidence: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: NON_EMPTY_STRING
    }
  }),
  packageCount: NON_NEGATIVE_INTEGER,
  families: {
    type: "array",
    maxItems: 16,
    items: schema(["id", "label", "description", "order", "count"], {
      id: ID,
      label: NON_EMPTY_STRING,
      description: NON_EMPTY_STRING,
      order: NON_NEGATIVE_INTEGER,
      count: NON_NEGATIVE_INTEGER
    })
  },
  facets: schema([
    "disciplines", "structures", "operations", "practiceModes"
  ], Object.fromEntries([
    "disciplines", "structures", "operations", "practiceModes"
  ].map((field) => [field, {
    type: "array",
    maxItems: 64,
    items: RESOURCE_LIBRARY_FACET_SCHEMA
  }])) )
});
const RESOURCE_LIBRARY_SEARCH_SCHEMA = schema([
  "contract", "catalogVersion", "coverage", "candidates"
], {
  ...RESOURCE_LIBRARY_CATALOG_HEADER,
  coverage: schema(["status", "desiredResource", "chatDisclosure"], {
    status: RESOURCE_COVERAGE_STATUS,
    desiredResource: NON_EMPTY_STRING,
    chatDisclosure: { type: ["string", "null"] }
  }),
  candidates: {
    type: "array",
    maxItems: 8,
    items: schema([
      "packageId", "version", "label", "primaryFamilyId", "fit", "score",
      "matched", "missing", "reason", "useWhen", "avoidWhen",
      "responseCompatibility"
    ], {
      packageId: PACKAGE_ID,
      version: NON_EMPTY_STRING,
      label: NON_EMPTY_STRING,
      primaryFamilyId: ID,
      fit: RESOURCE_FIT,
      score: { type: "integer" },
      matched: { type: "array", maxItems: 64, items: NON_EMPTY_STRING },
      missing: { type: "array", maxItems: 64, items: NON_EMPTY_STRING },
      reason: NON_EMPTY_STRING,
      useWhen: { type: "array", maxItems: 24, items: NON_EMPTY_STRING },
      avoidWhen: { type: "array", maxItems: 24, items: NON_EMPTY_STRING },
      responseCompatibility: {
        type: "array",
        maxItems: 16,
        items: PACKAGE_ID
      },
      authorizedByResourceSetRef: VERSIONED_REFERENCE_SCHEMA,
      limitations: {
        type: "array",
        maxItems: 16,
        items: NON_EMPTY_STRING
      }
    })
  }
});
const RESOURCE_LIBRARY_INSPECT_SCHEMA = schema([
  "contract", "catalogVersion", "items"
], {
  ...RESOURCE_LIBRARY_CATALOG_HEADER,
  items: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: {
      oneOf: [
        schema(["status", "profile"], {
          status: { const: "ok" },
          profile: OPEN_CANONICAL_OBJECT
        }),
        schema(["status", "packageId"], {
          status: { const: "not_found" },
          packageId: { type: "string" },
          version: { type: "string" }
        })
      ]
    }
  }
});
const RESOURCE_LIBRARY_CONTRACTS_SCHEMA = schema([
  "contract", "catalogVersion", "items"
], {
  ...RESOURCE_LIBRARY_CATALOG_HEADER,
  items: {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: {
      oneOf: [
        schema(["status", "packageId", "version", "definition"], {
          status: { const: "ok" },
          packageId: PACKAGE_ID,
          version: NON_EMPTY_STRING,
          definition: OPEN_CANONICAL_OBJECT
        }),
        schema(["status", "packageId"], {
          status: { const: "not_found" },
          packageId: { type: "string" },
          version: { type: "string" }
        })
      ]
    }
  }
});
const RESOURCE_LIBRARY_AUDIT_SCHEMA = schema([
  "contract", "catalogVersion", "structural", "overallFit", "selections",
  "warnings", "accessibleText", "visualPreview"
], {
  ...RESOURCE_LIBRARY_CATALOG_HEADER,
  structural: RESOURCE_LIBRARY_VALIDATION_SCHEMA,
  overallFit: RESOURCE_FIT,
  selections: {
    type: "array",
    maxItems: 64,
    items: schema([
      "slot", "index", "instanceId", "packageId", "version", "basis", "fit",
      "reason", "matched", "missing"
    ], {
      ...RESOURCE_LIBRARY_COMPOSITION_ITEM_SCHEMA.properties,
      basis: {
        type: "string",
        enum: ["semantic_fit", "response_affordance", "feedback_legibility"]
      },
      fit: RESOURCE_FIT,
      reason: NON_EMPTY_STRING,
      matched: { type: "array", maxItems: 64, items: NON_EMPTY_STRING },
      missing: { type: "array", maxItems: 64, items: NON_EMPTY_STRING },
      authorizedByResourceSetRef: VERSIONED_REFERENCE_SCHEMA
    })
  },
  warnings: { type: "array", maxItems: 64, items: NON_EMPTY_STRING },
  accessibleText: { type: "string", maxLength: 80_000 },
  visualPreview: schema(["rendered", "reason"], {
    rendered: { const: false },
    reason: NON_EMPTY_STRING
  })
});
const RESOURCE_LIBRARY_PREVIEW_SCHEMA = schema([
  "contract", "catalogVersion", "rendered", "structural", "packages", "reason"
], {
  ...RESOURCE_LIBRARY_CATALOG_HEADER,
  rendered: { const: false },
  structural: RESOURCE_LIBRARY_VALIDATION_SCHEMA,
  packages: {
    type: "array",
    maxItems: 64,
    items: RESOURCE_LIBRARY_COMPOSITION_ITEM_SCHEMA
  },
  reason: NON_EMPTY_STRING
});
const RESOURCE_LIBRARY_RESULT_SCHEMAS = Object.freeze({
  explore: RESOURCE_LIBRARY_EXPLORE_SCHEMA,
  search: RESOURCE_LIBRARY_SEARCH_SCHEMA,
  inspect: RESOURCE_LIBRARY_INSPECT_SCHEMA,
  contracts: RESOURCE_LIBRARY_CONTRACTS_SCHEMA,
  validate_card: RESOURCE_LIBRARY_VALIDATION_SCHEMA,
  audit_representation: RESOURCE_LIBRARY_AUDIT_SCHEMA,
  preview_card: RESOURCE_LIBRARY_PREVIEW_SCHEMA
});
const RESOURCE_LIBRARY_AVAILABILITY_SCHEMA = schema([
  "mode", "snapshotRef", "resourceSetRefs"
], {
  mode: {
    type: "string",
    enum: ["legacy_unrestricted", "resource_set_restricted"]
  },
  snapshotRef: {
    oneOf: [{ type: "null" }, VERSIONED_REFERENCE_SCHEMA]
  },
  resourceSetRefs: {
    type: "array",
    maxItems: 128,
    uniqueItems: true,
    items: VERSIONED_REFERENCE_SCHEMA
  }
});
const RESOURCE_LIBRARY_DATA_SCHEMA = Object.freeze({
  ...schema(["contract", "operation", "availability", "result"], {
    contract: RESOURCE_LIBRARY_CONTRACT,
    operation: { type: "string", enum: RESOURCE_LIBRARY_OPERATIONS },
    availability: RESOURCE_LIBRARY_AVAILABILITY_SCHEMA,
    result: { type: "object" }
  }),
  allOf: RESOURCE_LIBRARY_OPERATIONS.map((operation) => ({
    if: { properties: { operation: { const: operation } } },
    then: { properties: { result: RESOURCE_LIBRARY_RESULT_SCHEMAS[operation] } }
  }))
});
const AUTHORING_GUIDANCE_SCHEMA = schema(["id", "title", "text"], {
  id: NON_EMPTY_STRING,
  title: NON_EMPTY_STRING,
  text: NON_EMPTY_STRING
});
const AUTHORING_PACKAGE_CONTRACT_SCHEMA = schema(["packageId", "version", "tool", "operation"], {
  packageId: PACKAGE_ID,
  version: { type: "string", pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$" },
  tool: { const: "consultarBibliotecaDeResources" },
  operation: { const: "contracts" }
});
const PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA = schema(["required", "rule"], {
  required: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    uniqueItems: true,
    items: NON_EMPTY_STRING
  },
  rule: NON_EMPTY_STRING
});
const PEDAGOGICAL_BLUEPRINT_SCHEMA = schema([
  "version", "principle", "requiredSections", "learningCondition",
  "contentDemand", "anticipatedDifficulty", "designResponse", "layer",
  "theoryStep", "practiceStep"
], {
  version: { const: 2 },
  principle: NON_EMPTY_STRING,
  requiredSections: {
    type: "array",
    minItems: 13,
    maxItems: 13,
    uniqueItems: true,
    items: {
      type: "string",
      enum: [
        "goal",
        "learnerSituation",
        "learningConditions",
        "contentDemands",
        "anticipatedDifficulties",
        "designResponses",
        "prerequisiteEvidence",
        "conceptualLayers",
        "theorySteps",
        "practiceSteps",
        "feedbackPlan",
        "termLedger",
        "packageCandidates"
      ]
    }
  },
  learningCondition: PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA,
  contentDemand: PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA,
  anticipatedDifficulty: PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA,
  designResponse: PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA,
  layer: PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA,
  theoryStep: PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA,
  practiceStep: PEDAGOGICAL_BLUEPRINT_COMPONENT_SCHEMA
});
const PROTECTED_AUTHORING_CORE_SCHEMA = schema(["version", "moduleIds"], {
  version: { const: 2 },
  moduleIds: {
    type: "array",
    minItems: 5,
    uniqueItems: true,
    items: NON_EMPTY_STRING
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
  "protectedCore",
  "blueprintContract",
  "packageContracts",
  "access"
], {
  briefVersion: { const: 3 },
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
  protectedCore: PROTECTED_AUTHORING_CORE_SCHEMA,
  blueprintContract: PEDAGOGICAL_BLUEPRINT_SCHEMA,
  packageContracts: {
    type: "array",
    maxItems: 16,
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
const REPRESENTATION_SELECTION_SCHEMA = Object.freeze({
  ...schema([
    "intent", "chosen", "fit", "desiredResource", "catalogVersion",
    "limitations", "chatDisclosure"
  ], {
    intent: { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" },
    chosen: schema(["packageId", "version"], {
      packageId: PACKAGE_ID,
      version: {
        type: "string",
        pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$"
      }
    }),
    fit: { type: "string", enum: ["canonical", "versatile", "substitute"] },
    desiredResource: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" },
        { type: "null" }
      ]
    },
    catalogVersion: {
      type: "string", minLength: 1, maxLength: 80, pattern: "\\S"
    },
    limitations: {
      type: "array",
      maxItems: 12,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" }
    },
    chatDisclosure: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" },
        { type: "null" }
      ]
    }
  }),
  allOf: [
    {
      if: { properties: { fit: { const: "substitute" } }, required: ["fit"] },
      then: {
        properties: {
          desiredResource: {
            type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S"
          },
          chatDisclosure: {
            type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S"
          }
        }
      },
      else: { properties: { chatDisclosure: { type: "null" } } }
    }
  ]
});
const PEDAGOGICAL_DIAGNOSIS_SCHEMA = schema(["difficultyResponses"], {
  difficultyResponses: {
    type: "array",
    minItems: 1,
    maxItems: 4,
    items: schema(["difficulty", "response"], {
      difficulty: {
        type: "string", minLength: 1, maxLength: 240, pattern: "\\S"
      },
      response: {
        type: "string", minLength: 1, maxLength: 400, pattern: "\\S"
      }
    })
  }
});
const CONTINUITY_DECISION_SCHEMA = Object.freeze({
  ...schema(["id", "summary"], {
    id: ID,
    summary: { type: "string", minLength: 1, maxLength: 1_000, pattern: "\\S" },
    entityType: ENTITY_TYPE,
    entityId: ID,
    representationSelection: REPRESENTATION_SELECTION_SCHEMA,
    pedagogicalDiagnosis: PEDAGOGICAL_DIAGNOSIS_SCHEMA
  }),
  allOf: [
    {
      if: { properties: { entityType: {} }, required: ["entityType"] },
      then: { properties: { entityId: ID }, required: ["entityId"] }
    },
    {
      if: { properties: { entityId: {} }, required: ["entityId"] },
      then: { properties: { entityType: ENTITY_TYPE }, required: ["entityType"] }
    },
    {
      if: {
        properties: { representationSelection: {} },
        required: ["representationSelection"]
      },
      then: {
        properties: {
          entityType: { type: "string", enum: ["microsequence", "card"] },
          entityId: ID
        },
        required: ["entityType", "entityId"]
      }
    },
    {
      if: {
        properties: { pedagogicalDiagnosis: {} },
        required: ["pedagogicalDiagnosis"]
      },
      then: {
        properties: {
          entityType: { const: "microsequence" },
          entityId: ID
        },
        required: ["entityType", "entityId"]
      }
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
    type: "string", minLength: 1, maxLength: 500, pattern: "^[ramfpx]+$"
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
  "summary", "proposedRepair", "code", "origin", "ruleRef", "publicEvidence",
  "auditPartId", "auditRunRef", "artifactRefs", "verificationAuditRunRef",
  "auditRevision", "pendingCorrectionRequestId", "pendingRevision",
  "correctionRequestId", "resultingRevision", "verification", "verifiedRevision",
  "createdAt", "updatedAt"
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
  proposedRepair: { type: ["string", "null"], minLength: 1, maxLength: 1_000 },
  code: { anyOf: [{ type: "null" }, AUTHORING_AUDIT_CODE_SCHEMA] },
  origin: {
    type: ["string", "null"],
    enum: ["deterministic", "semantic_audit", null]
  },
  ruleRef: { anyOf: [{ type: "null" }, AUTHORING_AUDIT_RULE_REF_SCHEMA] },
  publicEvidence: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
  auditPartId: { anyOf: [{ type: "null" }, ID] },
  auditRunRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  artifactRefs: { anyOf: [{ type: "null" }, AUTHORING_AUDIT_ARTIFACT_REFS_SCHEMA] },
  verificationAuditRunRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  auditRevision: REVISION,
  pendingCorrectionRequestId: { anyOf: [REQUEST_ID, { type: "null" }] },
  pendingRevision: { anyOf: [REVISION, { type: "null" }] },
  correctionRequestId: { anyOf: [REQUEST_ID, { type: "null" }] },
  resultingRevision: { anyOf: [REVISION, { type: "null" }] },
  verification: { type: ["string", "null"], minLength: 1, maxLength: 1_000 },
  verifiedRevision: { anyOf: [REVISION, { type: "null" }] },
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
  "outline", "unassignedMicrosequenceStateMap", "parts", "decisions", "mandate",
  "findings", "observations", "publications"
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
  unassignedMicrosequenceStateMap: {
    type: "object",
    maxProperties: 2_000,
    propertyNames: ID,
    additionalProperties: { type: "string", enum: ["p", "a", "m", "f", "r"] }
  },
  parts: { type: "array", maxItems: 64, items: CONTINUITY_PART_PROJECTION_SCHEMA },
  decisions: {
    type: "array", maxItems: 128, items: CONTINUITY_DECISION_PROJECTION_SCHEMA
  },
  mandate: { anyOf: [{ type: "null" }, CONTINUITY_MANDATE_SCHEMA] },
  findings: schema(["items", "summary", "truncated"], {
    items: { type: "array", maxItems: 5, items: CONTINUITY_FINDING_SCHEMA },
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
  "authoringState",
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
  authoringState: {
    type: "string", enum: ["planning", "building", "audit_pending", "ready"]
  },
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
    items: PACKAGE_ID
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
const CATALOG_REVIEW_ITEM_SCHEMA = Object.freeze({
  ...schema([
    "submissionId", "courseId", "sourceRevisionHash", "title",
    "status", "authorNote", "reviewerNote",
    "claimExpiresAt", "submittedAt", "decidedAt", "updatedAt"
  ], {
    submissionId: UUID,
    courseId: NULLABLE_UUID,
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
  }),
  allOf: [{
    if: {
      properties: {
        status: {
          enum: ["submitted", "in_review", "changes_requested"]
        }
      },
      required: ["status"]
    },
    then: {
      properties: { courseId: UUID }
    }
  }]
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
      required: [
        "read", "author", "review", "comment", "publish", "research", "manage",
        "transfer"
      ],
      properties: Object.fromEntries([
        "read", "author", "review", "comment", "publish", "research", "manage",
        "transfer"
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

const WORKSPACE_OBSERVATION_ITEM_SCHEMA = Object.freeze({
  ...schema([
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
  findingCode: { anyOf: [{ type: "null" }, AUTHORING_AUDIT_CODE_SCHEMA] },
  findingOrigin: {
    type: ["string", "null"],
    enum: ["deterministic", "semantic_audit", null]
  },
  ruleRef: { anyOf: [{ type: "null" }, AUTHORING_AUDIT_RULE_REF_SCHEMA] },
  publicEvidence: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
  auditPartId: { anyOf: [{ type: "null" }, ID] },
  auditRunRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  artifactRefs: { anyOf: [{ type: "null" }, AUTHORING_AUDIT_ARTIFACT_REFS_SCHEMA] },
  verificationAuditRunRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  authorId: NULLABLE_UUID,
  canDelete: { type: "boolean" },
  createdAt: DATE_TIME,
  updatedAt: DATE_TIME
  }),
  allOf: [{
    if: {
      required: ["auditRunRef"],
      properties: { auditRunRef: { not: { type: "null" } } }
    },
    then: { properties: { canDelete: { const: false } } }
  }]
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
      items: { type: "array", maxItems: 5, items: WORKSPACE_OBSERVATION_ITEM_SCHEMA },
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
      entityId: ID,
      representationSelection: REPRESENTATION_SELECTION_SCHEMA,
      pedagogicalDiagnosis: PEDAGOGICAL_DIAGNOSIS_SCHEMA
    }),
    allOf: [
      {
        if: { properties: { entityType: {} }, required: ["entityType"] },
        then: { properties: { entityId: ID }, required: ["entityId"] }
      },
      {
        if: { properties: { entityId: {} }, required: ["entityId"] },
        then: { properties: { entityType: ENTITY_TYPE }, required: ["entityType"] }
      },
      {
        if: {
          properties: { representationSelection: {} },
          required: ["representationSelection"]
        },
        then: {
          properties: {
            entityType: { type: "string", enum: ["microsequence", "card"] },
            entityId: ID
          },
          required: ["entityType", "entityId"]
        }
      },
      {
        if: {
          properties: { pedagogicalDiagnosis: {} },
          required: ["pedagogicalDiagnosis"]
        },
        then: {
          properties: {
            entityType: { const: "microsequence" },
            entityId: ID
          },
          required: ["entityType", "entityId"]
        }
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

const RESOURCE_LIBRARY_PACKAGE_REQUEST_SCHEMA = schema(["packageId"], {
  packageId: PACKAGE_ID,
  version: {
    type: "string",
    pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$"
  }
});
const AUTHORING_DESIGN_OPERATIONS = Object.freeze([
  "read_slice",
  "contracts",
  "save_analysis",
  "set_parameter",
  "remove_parameter",
  "save_resource_set",
  "resolve_effective",
  "save_blueprint",
  "register_manifest",
  "run_audit",
  "record_semantic_audit",
  "register_experiment_variant_evidence",
  "record_experiment_diff_classification"
]);
const AUTHORING_DESIGN_WRITE_OPERATIONS = Object.freeze(
  AUTHORING_DESIGN_OPERATIONS.filter(
    (operation) => !["read_slice", "contracts"].includes(operation)
  )
);
const AUTHORING_DESIGN_READ_VIEWS = Object.freeze([
  "overview", "analysis", "parameters", "resource_set", "blueprint", "binding",
  "materialization", "audit", "experiment_context"
]);
const AUTHORING_DESIGN_CONTRACT_NAMES = Object.freeze([
  "instructional_analysis",
  "design_parameter_definition",
  "design_parameter_assignment",
  "effective_design_snapshot",
  "materialization_manifest",
  "resource_set",
  "action_read_slice",
  "action_contracts",
  "action_save_analysis",
  "action_set_parameter",
  "action_remove_parameter",
  "action_save_resource_set",
  "action_resolve_effective",
  "action_save_blueprint",
  "action_register_manifest",
  "action_run_audit",
  "action_record_semantic_audit",
  "action_register_experiment_variant_evidence",
  "action_record_experiment_diff_classification"
]);
const AUTHORING_DESIGN_PAYLOAD_JSON = Object.freeze({
  type: "string",
  minLength: 2,
  maxLength: 72 * 1_024,
  description: "Contrato JIT em JSON; nunca inclua conversa ou raciocínio privado."
});
const AUTHORING_AUDIT_SCOPE_SCHEMA = schema(["kind", "ref"], {
  kind: { type: "string", enum: ["microsequence", "part"] },
  ref: ID
});
function forbidAuthoringDesignFields(fields) {
  return {
    not: {
      anyOf: fields.map((field) => ({ required: [field] }))
    }
  };
}
const AUTHORING_DESIGN_INPUT_SCHEMA = Object.freeze({
  ...schema(["operation", "workspaceId"], {
    operation: { type: "string", enum: AUTHORING_DESIGN_OPERATIONS },
    workspaceId: UUID,
    microsequencePath: MICROSEQUENCE_PATH,
    view: {
      type: "string",
      enum: AUTHORING_DESIGN_READ_VIEWS,
      default: "overview"
    },
    contractName: {
      type: "string",
      enum: AUTHORING_DESIGN_CONTRACT_NAMES
    },
    resourceSetRef: VERSIONED_REFERENCE_SCHEMA,
    auditRunRef: VERSIONED_REFERENCE_SCHEMA,
    auditScope: AUTHORING_AUDIT_SCOPE_SCHEMA,
    experimentRef: VERSIONED_REFERENCE_SCHEMA,
    variantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
    variantSetRef: VERSIONED_REFERENCE_SCHEMA,
    differenceRunRef: VERSIONED_REFERENCE_SCHEMA,
    collection: {
      type: "string",
      enum: [
        "factor_targets", "locks", "resource_sets", "target_paths",
        "difference_runs"
      ]
    },
    collectionSetRef: VERSIONED_REFERENCE_SCHEMA,
    collectionCursor: { type: "string", minLength: 1, maxLength: 240 },
    collectionLimit: { type: "integer", minimum: 1, maximum: 20, default: 20 },
    cursor: { type: "string", minLength: 1, maxLength: 240 },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    componentCursor: { type: "string", pattern: "^[1-9][0-9]{0,8}$" },
    componentLimit: { type: "integer", minimum: 1, maximum: 10, default: 10 },
    requestId: REQUEST_ID,
    expectedRevision: REVISION,
    payloadJson: AUTHORING_DESIGN_PAYLOAD_JSON
  }),
  oneOf: [
    {
      required: ["operation", "microsequencePath"],
      properties: {
        operation: { const: "read_slice" },
        view: {
          type: "string",
          enum: AUTHORING_DESIGN_READ_VIEWS.filter(
            (candidate) => candidate !== "experiment_context"
          ),
          default: "overview"
        }
      },
      ...forbidAuthoringDesignFields([
        "contractName", "requestId", "expectedRevision", "payloadJson",
        "experimentRef", "variantRevisionRef", "variantSetRef", "differenceRunRef",
        "collection", "collectionSetRef", "collectionCursor", "collectionLimit"
      ]),
      allOf: [
        {
          if: {
            required: ["view"],
            properties: { view: { const: "resource_set" } }
          },
          then: {
            required: ["resourceSetRef"],
            ...forbidAuthoringDesignFields([
              "auditRunRef", "auditScope", "componentCursor", "componentLimit"
            ])
          }
        },
        {
          if: {
            required: ["view"],
            properties: { view: { const: "audit" } }
          },
          then: {
            properties: {
              cursor: { type: "string", pattern: "^[1-9][0-9]{0,8}$" },
              limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
              componentCursor: {
                type: "string",
                pattern: "^[1-9][0-9]{0,8}$"
              },
              componentLimit: {
                type: "integer",
                minimum: 1,
                maximum: 10,
                default: 10
              }
            },
            not: {
              anyOf: [
                { required: ["resourceSetRef"] },
                { required: ["auditRunRef", "auditScope"] }
              ]
            }
          }
        },
        {
          if: {
            anyOf: [
              { required: ["view"], properties: { view: { const: "resource_set" } } },
              { required: ["view"], properties: { view: { const: "audit" } } }
            ]
          },
          then: {},
          else: forbidAuthoringDesignFields([
            "resourceSetRef", "auditRunRef", "auditScope", "cursor", "limit",
            "componentCursor", "componentLimit"
          ])
        }
      ]
    },
    {
      required: ["operation", "view"],
      properties: {
        operation: { const: "read_slice" },
        view: { const: "experiment_context" },
        cursor: { type: "string", minLength: 1, maxLength: 240 },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 20 }
      },
      ...forbidAuthoringDesignFields([
        "microsequencePath", "contractName", "requestId", "expectedRevision",
        "payloadJson", "resourceSetRef", "auditRunRef", "auditScope",
        "componentCursor", "componentLimit"
      ]),
      allOf: [
        {
          if: { required: ["experimentRef"] },
          then: { required: ["variantRevisionRef"] }
        },
        {
          if: { required: ["variantRevisionRef"] },
          then: { required: ["experimentRef"] }
        },
        {
          if: {
            required: ["cursor"],
            not: { required: ["experimentRef"] }
          },
          then: { required: ["variantSetRef"] }
        },
        {
          if: { required: ["experimentRef"] },
          then: { not: { required: ["variantSetRef"] } }
        },
        {
          if: { required: ["differenceRunRef"] },
          then: {
            required: ["experimentRef", "variantRevisionRef"],
            ...forbidAuthoringDesignFields([
              "collection", "collectionSetRef", "collectionCursor", "collectionLimit"
            ])
          }
        },
        {
          if: { required: ["collectionSetRef"] },
          then: { required: ["collection"] }
        },
        {
          if: { required: ["collectionCursor"] },
          then: { required: ["collection", "collectionSetRef"] }
        },
        {
          if: { required: ["collectionLimit"] },
          then: { required: ["collection"] }
        },
        {
          if: { required: ["collection"] },
          then: {
            ...forbidAuthoringDesignFields([
              "variantSetRef", "differenceRunRef", "cursor", "limit"
            ])
          },
          else: forbidAuthoringDesignFields([
            "collectionSetRef", "collectionCursor", "collectionLimit"
          ])
        }
      ]
    },
    {
      required: ["operation", "contractName"],
      properties: { operation: { const: "contracts" } },
      ...forbidAuthoringDesignFields([
        "microsequencePath", "view", "requestId", "expectedRevision",
        "payloadJson", "resourceSetRef", "auditRunRef", "auditScope", "cursor", "limit",
        "componentCursor", "componentLimit", "experimentRef", "variantRevisionRef",
        "variantSetRef", "differenceRunRef", "collection", "collectionSetRef",
        "collectionCursor", "collectionLimit"
      ])
    },
    {
      required: [
        "operation", "requestId", "expectedRevision", "microsequencePath",
        "payloadJson"
      ],
      properties: {
        operation: {
          type: "string",
          enum: AUTHORING_DESIGN_WRITE_OPERATIONS
        }
      },
      ...forbidAuthoringDesignFields([
        "view", "contractName", "resourceSetRef", "auditRunRef", "auditScope",
        "cursor", "limit", "componentCursor", "componentLimit", "experimentRef",
        "variantRevisionRef", "variantSetRef", "differenceRunRef", "collection",
        "collectionSetRef", "collectionCursor", "collectionLimit"
      ])
    }
  ]
});
const EXPERIMENT_PARAMETER_VALUE_SCHEMA = Object.freeze(
  INSTRUCTIONAL_DESIGN_CONTRACTS.designParameterAssignment.$defs.ParameterValue
);
const EXPERIMENT_SCOPE_SCHEMA = schema(["kind", "ref"], {
  kind: {
    type: "string",
    enum: ["course", "lesson", "microsequence"]
  },
  ref: ID
});
const EXPERIMENT_LOCK_SCOPE_SCHEMA = schema(["kind", "ref"], {
  kind: {
    type: "string",
    enum: ["workspace", "course", "module", "lesson", "microsequence"]
  },
  ref: ID
});
const EXPERIMENT_STATE_SCHEMA = Object.freeze({
  type: "string",
  enum: [
    "draft", "validated", "generating", "ready", "correction_required",
    "collecting", "paused", "closed", "invalidated"
  ]
});
const EXPERIMENT_CONTEXT_FACTOR_SCHEMA = schema([
  "factorId", "definitionRef", "kind", "targetCount", "value", "resourceSetRef"
], {
  factorId: ID,
  definitionRef: VERSIONED_REFERENCE_SCHEMA,
  kind: { type: "string", enum: ["parameter", "resource_set"] },
  targetCount: NON_NEGATIVE_INTEGER,
  value: { anyOf: [EXPERIMENT_PARAMETER_VALUE_SCHEMA, { type: "null" }] },
  resourceSetRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA
});
const EXPERIMENT_CONTEXT_LOCK_SCHEMA = schema([
  "assignmentRef", "definitionRef", "factorId", "targetOrdinal", "scope"
], {
  assignmentRef: VERSIONED_REFERENCE_SCHEMA,
  definitionRef: VERSIONED_REFERENCE_SCHEMA,
  factorId: ID,
  targetOrdinal: { type: "integer", minimum: 1, maximum: 500 },
  scope: EXPERIMENT_LOCK_SCOPE_SCHEMA
});
const EXPERIMENT_CONTEXT_FACTOR_TARGET_SCHEMA = schema([
  "factorId", "targetOrdinal", "kind", "ref"
], {
  factorId: ID,
  targetOrdinal: { type: "integer", minimum: 1, maximum: 500 },
  kind: { type: "string", enum: ["course", "lesson", "microsequence"] },
  ref: ID
});
function experimentContextCollectionSchema(itemSchema) {
  return schema(["setRef", "items", "count", "nextCursor", "truncated"], {
    setRef: VERSIONED_REFERENCE_SCHEMA,
    items: { type: "array", maxItems: 20, items: itemSchema },
    count: NON_NEGATIVE_INTEGER,
    nextCursor: { type: ["string", "null"], maxLength: 240 },
    truncated: { type: "boolean" }
  });
}
const EXPERIMENT_CONTEXT_DIFFERENCE_SCHEMA = schema([
  "differenceRef", "ordinal", "path", "kind", "summary", "beforeHash",
  "afterHash", "evidenceRefs", "classification"
], {
  differenceRef: VERSIONED_REFERENCE_SCHEMA,
  ordinal: { type: "integer", minimum: 1, maximum: 5_000 },
  path: { type: "string", minLength: 1, maxLength: 4_000 },
  kind: { type: "string", enum: ["added", "removed", "changed", "moved"] },
  summary: { type: "string", maxLength: 1_000 },
  beforeHash: SHA256,
  afterHash: SHA256,
  evidenceRefs: {
    type: "array",
    maxItems: 8,
    uniqueItems: true,
    items: { type: "string", minLength: 1, maxLength: 500 }
  },
  classification: {
    type: ["string", "null"],
    enum: [...EXPERIMENT_DIFFERENCE_CLASSIFICATIONS, null]
  }
});
const EXPERIMENT_CONTEXT_DIFFERENCES_SCHEMA = schema([
  "differenceRunRef", "items", "count", "nextCursor", "truncated"
], {
  differenceRunRef: VERSIONED_REFERENCE_SCHEMA,
  items: {
    type: "array",
    maxItems: 20,
    items: EXPERIMENT_CONTEXT_DIFFERENCE_SCHEMA
  },
  count: NON_NEGATIVE_INTEGER,
  nextCursor: { type: ["string", "null"], maxLength: 240 },
  truncated: { type: "boolean" }
});
const EXPERIMENT_CONTEXT_DIFFERENCE_RUN_SCHEMA = schema([
  "differenceRunRef", "baselineRef", "hunkCount", "recordedCount",
  "classifiedCount", "status"
], {
  differenceRunRef: VERSIONED_REFERENCE_SCHEMA,
  baselineRef: schema(["kind", "ref"], {
    kind: { type: "string", enum: ["base", "variant_revision"] },
    ref: VERSIONED_REFERENCE_SCHEMA
  }),
  hunkCount: { type: "integer", minimum: 0, maximum: 5_000 },
  recordedCount: { type: "integer", minimum: 0, maximum: 5_000 },
  classifiedCount: { type: "integer", minimum: 0, maximum: 5_000 },
  status: {
    type: "string",
    enum: ["partial", "classification_pending", "classified"]
  }
});
const EXPERIMENT_TARGET_CONTEXT_SCHEMA = schema([
  "experimentRef", "experimentRevision", "status", "baseRef", "protocolRef",
  "conditionRef", "variantRevisionRef", "scope", "factors", "factorTargets",
  "invariants", "locks", "resourceSetRefs", "currentness", "mandate",
  "targetWorkspaceId", "targetPaths", "differenceRuns", "collection",
  "collectionSetRef"
], {
  experimentRef: VERSIONED_REFERENCE_SCHEMA,
  experimentRevision: REVISION,
  status: EXPERIMENT_STATE_SCHEMA,
  baseRef: VERSIONED_REFERENCE_SCHEMA,
  protocolRef: VERSIONED_REFERENCE_SCHEMA,
  conditionRef: VERSIONED_REFERENCE_SCHEMA,
  variantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
  scope: EXPERIMENT_SCOPE_SCHEMA,
  factors: {
    type: "array",
    maxItems: 8,
    items: EXPERIMENT_CONTEXT_FACTOR_SCHEMA
  },
  factorTargets: experimentContextCollectionSchema(
    EXPERIMENT_CONTEXT_FACTOR_TARGET_SCHEMA
  ),
  invariants: {
    type: "array",
    minItems: 4,
    maxItems: 4,
    uniqueItems: true,
    items: {
      type: "string",
      enum: ["sources", "targets", "analysis", "structure"]
    }
  },
  locks: experimentContextCollectionSchema(EXPERIMENT_CONTEXT_LOCK_SCHEMA),
  resourceSetRefs: experimentContextCollectionSchema(VERSIONED_REFERENCE_SCHEMA),
  currentness: schema(["base", "protocol", "condition", "variant", "design"], {
    base: { type: "boolean" },
    protocol: { type: "boolean" },
    condition: { type: "boolean" },
    variant: { type: "boolean" },
    design: { type: "boolean" }
  }),
  mandate: {
    anyOf: [
      { type: "null" },
      schema(["mandateRef", "status", "conditionRef", "variantRevisionRef"], {
        mandateRef: VERSIONED_REFERENCE_SCHEMA,
        status: ID,
        conditionRef: VERSIONED_REFERENCE_SCHEMA,
        variantRevisionRef: VERSIONED_REFERENCE_SCHEMA
      })
    ]
  },
  targetWorkspaceId: UUID,
  targetPaths: experimentContextCollectionSchema(schema([
    "entityType", "entityPath", "label"
  ], {
    entityType: { type: "string", enum: ["course", "lesson", "microsequence"] },
    entityPath: { type: "array", minItems: 1, maxItems: 4, items: ID },
    label: { type: "string", minLength: 1, maxLength: 300 }
  })),
  differenceRuns: experimentContextCollectionSchema(
    EXPERIMENT_CONTEXT_DIFFERENCE_RUN_SCHEMA
  ),
  collection: {
    type: ["string", "null"],
    enum: [
      "factor_targets", "locks", "resource_sets", "target_paths",
      "difference_runs", null
    ]
  },
  collectionSetRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  differences: EXPERIMENT_CONTEXT_DIFFERENCES_SCHEMA
});
const EXPERIMENT_DISCOVERY_VARIANT_SCHEMA = schema([
  "experimentRef", "variantRevisionRef", "experimentLabel", "conditionLabel",
  "status", "scope", "targetLabel"
], {
  experimentRef: VERSIONED_REFERENCE_SCHEMA,
  variantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
  experimentLabel: { type: "string", minLength: 1, maxLength: 300 },
  conditionLabel: { type: "string", minLength: 1, maxLength: 300 },
  status: { type: "string", enum: ["generating", "ready", "frozen", "invalidated"] },
  scope: EXPERIMENT_SCOPE_SCHEMA,
  targetLabel: { type: "string", minLength: 1, maxLength: 300 }
});
const EXPERIMENT_CONTEXT_WORKSPACE_SCHEMA = schema(["id", "title", "revision"], {
  id: UUID,
  title: { type: "string", minLength: 1, maxLength: 300 },
  revision: REVISION
});
const EXPERIMENT_CONTEXT_DISCOVERY_SLICE_SCHEMA = schema([
  "contract", "view", "availableViews", "workspace", "mode", "variantSetRef",
  "variants", "nextAction"
], {
  contract: { const: "aralearn.authoring-design-slice.v1" },
  view: { const: "experiment_context" },
  availableViews: {
    type: "array",
    minItems: 1,
    maxItems: 1,
    uniqueItems: true,
    items: { const: "experiment_context" }
  },
  workspace: EXPERIMENT_CONTEXT_WORKSPACE_SCHEMA,
  mode: { const: "discovery" },
  variantSetRef: VERSIONED_REFERENCE_SCHEMA,
  variants: schema(["items", "count", "nextCursor", "truncated"], {
    items: { type: "array", maxItems: 20, items: EXPERIMENT_DISCOVERY_VARIANT_SCHEMA },
    count: NON_NEGATIVE_INTEGER,
    nextCursor: { type: ["string", "null"], maxLength: 240 },
    truncated: { type: "boolean" }
  }),
  nextAction: { const: "select_experiment_variant" }
});
const EXPERIMENT_CONTEXT_TARGET_SLICE_SCHEMA = schema([
  "contract", "view", "availableViews", "workspace", "mode",
  "experimentContext", "nextAction"
], {
  contract: { const: "aralearn.authoring-design-slice.v1" },
  view: { const: "experiment_context" },
  availableViews: {
    type: "array",
    minItems: 1,
    maxItems: 1,
    uniqueItems: true,
    items: { const: "experiment_context" }
  },
  workspace: EXPERIMENT_CONTEXT_WORKSPACE_SCHEMA,
  mode: { const: "target" },
  experimentContext: EXPERIMENT_TARGET_CONTEXT_SCHEMA,
  nextAction: {
    type: "string",
    enum: ["continue_in_target_workspace", "classify_experiment_diff"]
  }
});
const AUTHORING_DESIGN_ARTIFACT_REFS_SCHEMA = schema([
  "analysisRef", "effectiveSnapshotRef", "blueprintRef", "bindingRef",
  "manifestRef", "effectiveResourceSetRefs", "blueprintHash", "bindingHash",
  "scopeEntityVersion", "blueprintCreatedRevision"
], {
  analysisRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  effectiveSnapshotRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  blueprintRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  bindingRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  manifestRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  effectiveResourceSetRefs: {
    type: "array",
    maxItems: 128,
    uniqueItems: true,
    items: VERSIONED_REFERENCE_SCHEMA
  },
  blueprintHash: NULLABLE_SHA256,
  bindingHash: NULLABLE_SHA256,
  scopeEntityVersion: { type: ["integer", "null"], minimum: 1 },
  blueprintCreatedRevision: { type: ["integer", "null"], minimum: 1 }
});
const AUTHORING_DESIGN_SLICE_COMMON_PROPERTIES = Object.freeze({
  contract: { const: "aralearn.authoring-design-slice.v1" },
  view: { type: "string", enum: AUTHORING_DESIGN_READ_VIEWS },
  availableViews: {
    type: "array",
    minItems: 1,
    maxItems: AUTHORING_DESIGN_READ_VIEWS.length,
    uniqueItems: true,
    items: { type: "string", enum: AUTHORING_DESIGN_READ_VIEWS }
  },
  workspace: OPEN_CANONICAL_OBJECT,
  microsequence: OPEN_CANONICAL_OBJECT,
  coordination: OPEN_CANONICAL_OBJECT,
  states: OPEN_CANONICAL_OBJECT,
  artifacts: AUTHORING_DESIGN_ARTIFACT_REFS_SCHEMA,
  nextAction: NON_EMPTY_STRING
});
const AUTHORING_DESIGN_SLICE_COMMON_REQUIRED = Object.freeze([
  "contract", "view", "availableViews", "workspace", "microsequence",
  "coordination", "states", "artifacts", "nextAction"
]);
const AUTHORING_DESIGN_RESOURCE_SET_PAGE_SCHEMA = schema([
  "metadata", "facets", "constraints", "packages", "total", "nextCursor"
], {
  metadata: schema([
    "ref", "scope", "resolvedCatalogVersion", "provenanceRefs"
  ], {
    ref: VERSIONED_REFERENCE_SCHEMA,
    scope: schema(["kind", "ref"], {
      kind: {
        type: "string",
        enum: ["workspace", "course", "module", "lesson", "microsequence"]
      },
      ref: ID
    }),
    resolvedCatalogVersion: NON_EMPTY_STRING,
    provenanceRefs: STRING_LIST
  }),
  facets: schema([
    "catalogVersion", "families", "disciplines", "structures",
    "cognitiveOperations", "practiceModalities"
  ], {
    catalogVersion: NON_EMPTY_STRING,
    families: STRING_LIST,
    disciplines: STRING_LIST,
    structures: STRING_LIST,
    cognitiveOperations: STRING_LIST,
    practiceModalities: STRING_LIST
  }),
  constraints: schema([
    "allowedFits", "allowEmbeddedPractice", "allowResponsePackages",
    "onNoAdequateRepresentation"
  ], {
    allowedFits: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "string", enum: ["canonical", "versatile", "substitute"] }
    },
    allowEmbeddedPractice: { type: "boolean" },
    allowResponsePackages: { type: "boolean" },
    onNoAdequateRepresentation: {
      type: "string",
      enum: ["block", "record_limitation"]
    }
  }),
  packages: {
    type: "array",
    maxItems: 100,
    uniqueItems: true,
    items: schema(["packageId", "version"], {
      packageId: PACKAGE_ID,
      version: {
        type: "string",
        pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$"
      }
    })
  },
  total: NON_NEGATIVE_INTEGER,
  nextCursor: { type: ["string", "null"], minLength: 1, maxLength: 240 }
});
const AUTHORING_AUDIT_TARGET_SCHEMA = schema([
  "entityType", "entityPath", "resourceTargetId"
], {
  entityType: {
    type: "string",
    enum: [
      "workspace", "course", "module", "lesson", "microsequence", "card",
      "resource"
    ]
  },
  entityPath: { type: "array", minItems: 0, maxItems: 5, items: ID },
  resourceTargetId: { type: ["string", "null"], maxLength: 240 }
});
const AUTHORING_AUDIT_FINDING_SCHEMA = schema([
  "findingId", "code", "category", "origin", "severity", "status", "target",
  "currentEntityPath", "targetAvailable", "auditPartId", "ruleRef",
  "publicEvidence", "proposedRepair", "detectedRevision", "auditRunRef",
  "artifactRefs", "verificationAuditRunRef", "pendingCorrectionRequestId",
  "pendingRevision", "correctionRequestId", "resultingRevision", "verification",
  "verifiedRevision"
], {
  findingId: UUID,
  code: AUTHORING_AUDIT_CODE_SCHEMA,
  category: AUTHORING_AUDIT_CATEGORY_SCHEMA,
  origin: { type: "string", enum: ["deterministic", "semantic_audit"] },
  severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
  status: {
    type: "string",
    enum: ["open", "approved", "rejected", "repaired", "resolved"]
  },
  target: AUTHORING_AUDIT_TARGET_SCHEMA,
  currentEntityPath: { type: "array", minItems: 0, maxItems: 5, items: ID },
  targetAvailable: { type: "boolean" },
  auditPartId: { anyOf: [{ type: "null" }, ID] },
  ruleRef: AUTHORING_AUDIT_RULE_REF_SCHEMA,
  publicEvidence: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" },
  proposedRepair: { type: ["string", "null"], minLength: 1, maxLength: 1_000 },
  detectedRevision: REVISION,
  auditRunRef: VERSIONED_REFERENCE_SCHEMA,
  artifactRefs: AUTHORING_AUDIT_ARTIFACT_REFS_SCHEMA,
  verificationAuditRunRef: {
    anyOf: [{ type: "null" }, VERSIONED_REFERENCE_SCHEMA]
  },
  pendingCorrectionRequestId: { anyOf: [REQUEST_ID, { type: "null" }] },
  pendingRevision: { anyOf: [REVISION, { type: "null" }] },
  correctionRequestId: { anyOf: [REQUEST_ID, { type: "null" }] },
  resultingRevision: { anyOf: [REVISION, { type: "null" }] },
  verification: { type: ["string", "null"], minLength: 1, maxLength: 1_000 },
  verifiedRevision: { anyOf: [REVISION, { type: "null" }] }
});
const AUTHORING_AUDIT_DIMENSION_SCHEMA = schema(["status", "findingCount"], {
  status: {
    type: "string",
    enum: ["conformant", "finding", "not_checked"]
  },
  findingCount: NON_NEGATIVE_INTEGER
});
const AUTHORING_AUDIT_METRIC_SCHEMA = schema([
  "id", "kind", "value", "unit", "denominator", "algorithm"
], {
  id: ID,
  kind: { const: "derived" },
  value: { type: "number" },
  unit: NON_EMPTY_STRING,
  denominator: schema(["count", "unit", "refs"], {
    count: NON_NEGATIVE_INTEGER,
    unit: NON_EMPTY_STRING,
    refs: AUTHORING_AUDIT_METRIC_REFS_SCHEMA
  }),
  algorithm: schema(["id", "version", "inputRefs"], {
    id: ID,
    version: NON_EMPTY_STRING,
    inputRefs: AUTHORING_AUDIT_METRIC_REFS_SCHEMA
  })
});
const AUTHORING_AUDIT_SUMMARY_SCHEMA = schema([
  "dimensions", "checks", "findings", "metrics"
], {
  dimensions: schema([
    "structure", "design", "practice", "resources", "coverage", "coherence",
    "dependencies", "redundancy", "integration"
  ], {
    structure: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    design: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    practice: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    resources: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    coverage: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    coherence: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    dependencies: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    redundancy: AUTHORING_AUDIT_DIMENSION_SCHEMA,
    integration: AUTHORING_AUDIT_DIMENSION_SCHEMA
  }),
  checks: schema(["passed", "failed", "notApplicable"], {
    passed: NON_NEGATIVE_INTEGER,
    failed: NON_NEGATIVE_INTEGER,
    notApplicable: NON_NEGATIVE_INTEGER
  }),
  findings: schema(["deterministic", "semantic", "total"], {
    deterministic: NON_NEGATIVE_INTEGER,
    semantic: NON_NEGATIVE_INTEGER,
    total: NON_NEGATIVE_INTEGER
  }),
  metrics: {
    type: "array",
    maxItems: 64,
    items: AUTHORING_AUDIT_METRIC_SCHEMA
  }
});
const AUTHORING_LATEST_AUDIT_RUN_SCHEMA = schema([
  "ref", "kind", "status", "current", "scope", "startedRevision",
  "completedRevision", "createdAt", "completedAt"
], {
  ref: VERSIONED_REFERENCE_SCHEMA,
  kind: { type: "string", enum: ["audit", "reaudit"] },
  status: { type: "string", enum: ["semantic_pending", "complete"] },
  current: { type: "boolean" },
  scope: AUTHORING_AUDIT_SCOPE_SCHEMA,
  startedRevision: REVISION,
  completedRevision: { anyOf: [REVISION, { type: "null" }] },
  createdAt: DATE_TIME,
  completedAt: NULLABLE_DATE_TIME
});
const AUTHORING_AUDIT_COMPONENT_SCHEMA = Object.freeze({
  ...schema([
    "ordinal", "microsequenceRef", "microsequencePath", "childAuditRunRef",
    "auditedRevision", "contentHash", "status", "targetAvailable"
  ], {
    ordinal: { type: "integer", minimum: 1, maximum: 500 },
    microsequenceRef: ID,
    microsequencePath: {
      anyOf: [MICROSEQUENCE_PATH, { type: "null" }]
    },
    childAuditRunRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
    auditedRevision: { anyOf: [REVISION, { type: "null" }] },
    contentHash: { anyOf: [SHA256, { type: "null" }] },
    status: { type: "string", enum: ["complete", "not_audited"] },
    targetAvailable: { type: "boolean" }
  }),
  allOf: [{
    if: { required: ["status"], properties: { status: { const: "complete" } } },
    then: {
      properties: {
        microsequencePath: { not: { type: "null" } },
        childAuditRunRef: { not: { type: "null" } },
        auditedRevision: { not: { type: "null" } },
        contentHash: { not: { type: "null" } }
      }
    },
    else: {
      properties: {
        microsequencePath: { type: "null" },
        childAuditRunRef: { type: "null" },
        auditedRevision: { type: "null" },
        contentHash: { type: "null" }
      }
    }
  }]
});
const AUTHORING_AUDIT_COMPONENT_PAGE_SCHEMA = schema([
  "items", "count", "nextCursor", "truncated"
], {
  items: {
    type: "array",
    maxItems: 10,
    items: AUTHORING_AUDIT_COMPONENT_SCHEMA
  },
  count: { type: "integer", minimum: 0, maximum: 500 },
  nextCursor: { type: ["string", "null"], pattern: "^[1-9][0-9]{0,8}$" },
  truncated: { type: "boolean" }
});
const AUTHORING_AUDIT_PAGE_SCHEMA = schema([
  "latestAuditRun", "summary", "components", "findings", "total",
  "nextCursor", "truncated"
], {
  latestAuditRun: {
    anyOf: [{ type: "null" }, AUTHORING_LATEST_AUDIT_RUN_SCHEMA]
  },
  summary: AUTHORING_AUDIT_SUMMARY_SCHEMA,
  components: AUTHORING_AUDIT_COMPONENT_PAGE_SCHEMA,
  findings: {
    type: "array",
    maxItems: 2,
    items: AUTHORING_AUDIT_FINDING_SCHEMA
  },
  total: NON_NEGATIVE_INTEGER,
  nextCursor: { type: ["string", "null"], minLength: 1, maxLength: 240 },
  truncated: { type: "boolean" }
});
function authoringDesignSliceViewSchema(view, properties = {}) {
  return schema([
    ...AUTHORING_DESIGN_SLICE_COMMON_REQUIRED,
    ...Object.keys(properties)
  ], {
    ...AUTHORING_DESIGN_SLICE_COMMON_PROPERTIES,
    view: { const: view },
    ...properties
  });
}
const AUTHORING_DESIGN_READ_SLICE_SCHEMA = Object.freeze({
  oneOf: [
    authoringDesignSliceViewSchema("overview"),
    authoringDesignSliceViewSchema("analysis", {
      analysis: { type: ["object", "null"], additionalProperties: true }
    }),
    authoringDesignSliceViewSchema("parameters", {
      parameterDefinitions: OPEN_CANONICAL_OBJECT,
      assignments: {
        type: "array",
        maxItems: 128,
        items: OPEN_CANONICAL_OBJECT
      },
      locks: {
        type: "array",
        maxItems: 128,
        items: OPEN_CANONICAL_OBJECT
      },
      effectiveSnapshot: {
        type: ["object", "null"],
        additionalProperties: true
      },
      effectiveResourceSets: {
        type: "array",
        maxItems: 128,
        items: OPEN_CANONICAL_OBJECT
      }
    }),
    authoringDesignSliceViewSchema("resource_set", {
      resourceSet: AUTHORING_DESIGN_RESOURCE_SET_PAGE_SCHEMA
    }),
    authoringDesignSliceViewSchema("blueprint", {
      blueprintContract: OPEN_CANONICAL_OBJECT,
      blueprint: { type: ["object", "null"], additionalProperties: true }
    }),
    authoringDesignSliceViewSchema("binding", {
      blueprintBinding: {
        type: ["object", "null"],
        additionalProperties: true
      }
    }),
    authoringDesignSliceViewSchema("materialization", {
      materialization: OPEN_CANONICAL_OBJECT
    }),
    authoringDesignSliceViewSchema("audit", {
      audit: { anyOf: [{ type: "null" }, AUTHORING_AUDIT_PAGE_SCHEMA] }
    }),
    EXPERIMENT_CONTEXT_DISCOVERY_SLICE_SCHEMA,
    EXPERIMENT_CONTEXT_TARGET_SLICE_SCHEMA
  ]
});
const AUTHORING_DESIGN_CONTRACT_SCHEMA = schema(["contractName", "schema"], {
  contractName: { type: "string", enum: AUTHORING_DESIGN_CONTRACT_NAMES },
  schema: OPEN_CANONICAL_OBJECT
});
const AUTHORING_DESIGN_SCOPE_SCHEMA = schema(["kind", "ref"], {
  kind: {
    type: "string",
    enum: ["workspace", "course", "module", "lesson", "microsequence"]
  },
  ref: ID
});
const AUTHORING_DESIGN_ANALYSIS_RECEIPT_SCHEMA = schema([
  "analysisRef", "scope", "payloadHash"
], {
  analysisRef: VERSIONED_REFERENCE_SCHEMA,
  scope: AUTHORING_DESIGN_SCOPE_SCHEMA,
  payloadHash: SHA256
});
const AUTHORING_DESIGN_ASSIGNMENT_RECEIPT_SCHEMA = schema([
  "assignmentRef", "assignmentOperation", "definitionRef", "scope"
], {
  assignmentRef: VERSIONED_REFERENCE_SCHEMA,
  assignmentOperation: { type: "string", enum: ["set", "remove"] },
  definitionRef: VERSIONED_REFERENCE_SCHEMA,
  scope: AUTHORING_DESIGN_SCOPE_SCHEMA
});
const AUTHORING_DESIGN_RESOURCE_SET_RECEIPT_SCHEMA = schema([
  "resourceSetRef", "packageCount", "payloadHash"
], {
  resourceSetRef: VERSIONED_REFERENCE_SCHEMA,
  packageCount: NON_NEGATIVE_INTEGER,
  payloadHash: SHA256
});
const AUTHORING_DESIGN_RESOLUTION_RECEIPT_SCHEMA = Object.freeze({
  oneOf: [
    schema(["status", "snapshotRef", "payloadHash"], {
      status: { const: "resolved" },
      snapshotRef: VERSIONED_REFERENCE_SCHEMA,
      payloadHash: SHA256
    }),
    schema([
      "status", "conflicts", "conflictCount", "conflictsTruncated"
    ], {
      status: { const: "conflict" },
      conflicts: {
        type: "array",
        maxItems: 24,
        items: OPEN_CANONICAL_OBJECT
      },
      conflictCount: NON_NEGATIVE_INTEGER,
      conflictsTruncated: { type: "boolean" }
    })
  ]
});
const AUTHORING_DESIGN_BLUEPRINT_RECEIPT_SCHEMA = schema([
  "blueprintRef", "bindingRef", "analysisRef", "effectiveSnapshotRef",
  "blueprintHash", "bindingHash"
], {
  blueprintRef: VERSIONED_REFERENCE_SCHEMA,
  bindingRef: VERSIONED_REFERENCE_SCHEMA,
  analysisRef: VERSIONED_REFERENCE_SCHEMA,
  effectiveSnapshotRef: VERSIONED_REFERENCE_SCHEMA,
  blueprintHash: SHA256,
  bindingHash: SHA256
});
const AUTHORING_DESIGN_MANIFEST_RECEIPT_SCHEMA = schema([
  "manifestRef", "contentHash", "payloadHash", "registration",
  "resourceAuthorization"
], {
  manifestRef: VERSIONED_REFERENCE_SCHEMA,
  contentHash: SHA256,
  payloadHash: SHA256,
  registration: { const: "accepted" },
  resourceAuthorization: { const: "authorized" }
});
const AUTHORING_AUDIT_RUN_RECEIPT_SCHEMA = schema([
  "auditRunRef", "kind", "status", "scope", "startedRevision", "findingCount"
], {
  auditRunRef: VERSIONED_REFERENCE_SCHEMA,
  kind: { type: "string", enum: ["audit", "reaudit"] },
  status: { const: "semantic_pending" },
  scope: AUTHORING_AUDIT_SCOPE_SCHEMA,
  startedRevision: REVISION,
  findingCount: NON_NEGATIVE_INTEGER
});
const AUTHORING_SEMANTIC_AUDIT_RECEIPT_SCHEMA = schema([
  "auditRunRef", "status", "recordedCount", "verifiedCount", "findingIds",
  "verificationFindingIds"
], {
  auditRunRef: VERSIONED_REFERENCE_SCHEMA,
  status: { const: "complete" },
  recordedCount: NON_NEGATIVE_INTEGER,
  verifiedCount: NON_NEGATIVE_INTEGER,
  findingIds: {
    type: "array", maxItems: 100, uniqueItems: true, items: UUID
  },
  verificationFindingIds: {
    type: "array", maxItems: 100, uniqueItems: true, items: UUID
  }
});
const AUTHORING_EXPERIMENT_DIFF_CLASSIFICATION_RECEIPT_SCHEMA = schema([
  "variantRevisionRef", "differenceRunRef", "classificationRef", "status",
  "recordedCount", "pendingCount"
], {
  variantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
  differenceRunRef: VERSIONED_REFERENCE_SCHEMA,
  classificationRef: VERSIONED_REFERENCE_SCHEMA,
  status: { type: "string", enum: ["partial", "classified"] },
  recordedCount: NON_NEGATIVE_INTEGER,
  pendingCount: NON_NEGATIVE_INTEGER
});
const AUTHORING_EXPERIMENT_EVIDENCE_RECEIPT_SCHEMA = schema([
  "experimentRef", "variantRevisionRef", "differenceRunRefs", "recorded",
  "expected", "complete", "nextAction"
], {
  experimentRef: VERSIONED_REFERENCE_SCHEMA,
  variantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
  differenceRunRefs: {
    type: "array",
    maxItems: 32,
    uniqueItems: true,
    items: VERSIONED_REFERENCE_SCHEMA
  },
  recorded: NON_NEGATIVE_INTEGER,
  expected: NON_NEGATIVE_INTEGER,
  complete: { type: "boolean" },
  nextAction: {
    type: ["string", "null"],
    enum: ["reread_context_and_repeat_registration", null]
  }
});
function authoringDesignDataBranch(
  operation,
  result,
  { mutation = false, withRevision = mutation } = {}
) {
  return schema([
    "operation", "workspaceId", ...(withRevision ? ["revision"] : []),
    ...(mutation ? ["replayed"] : []),
    "result"
  ], {
    operation: { const: operation },
    workspaceId: UUID,
    ...(withRevision ? { revision: REVISION } : {}),
    ...(mutation ? {
      replayed: { type: "boolean" }
    } : {}),
    result
  });
}
const AUTHORING_DESIGN_DATA_SCHEMA = Object.freeze({
  oneOf: [
    authoringDesignDataBranch(
      "read_slice",
      AUTHORING_DESIGN_READ_SLICE_SCHEMA,
      { withRevision: true }
    ),
    authoringDesignDataBranch("contracts", AUTHORING_DESIGN_CONTRACT_SCHEMA),
    authoringDesignDataBranch(
      "save_analysis",
      AUTHORING_DESIGN_ANALYSIS_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "set_parameter",
      AUTHORING_DESIGN_ASSIGNMENT_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "remove_parameter",
      AUTHORING_DESIGN_ASSIGNMENT_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "save_resource_set",
      AUTHORING_DESIGN_RESOURCE_SET_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "resolve_effective",
      AUTHORING_DESIGN_RESOLUTION_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "save_blueprint",
      AUTHORING_DESIGN_BLUEPRINT_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "register_manifest",
      AUTHORING_DESIGN_MANIFEST_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "run_audit",
      AUTHORING_AUDIT_RUN_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "record_semantic_audit",
      AUTHORING_SEMANTIC_AUDIT_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "register_experiment_variant_evidence",
      AUTHORING_EXPERIMENT_EVIDENCE_RECEIPT_SCHEMA,
      { mutation: true }
    ),
    authoringDesignDataBranch(
      "record_experiment_diff_classification",
      AUTHORING_EXPERIMENT_DIFF_CLASSIFICATION_RECEIPT_SCHEMA,
      { mutation: true }
    )
  ]
});
const RESOURCE_LIBRARY_INPUT_SCHEMA = Object.freeze({
  ...readSchema(["operation"], {
    operation: { type: "string", enum: RESOURCE_LIBRARY_OPERATIONS },
    query: { type: "string", maxLength: 2_000 },
    limit: { type: "integer", minimum: 1, maximum: 8, default: 8 },
    slot: { type: "string", enum: ["content", "response", "feedback"] },
    cardRole: { type: "string", enum: ["theory", "practice"] },
    disciplineIds: { type: "array", maxItems: 12, uniqueItems: true, items: ID },
    structureIds: { type: "array", maxItems: 12, uniqueItems: true, items: ID },
    operationIds: { type: "array", maxItems: 12, uniqueItems: true, items: ID },
    practiceModeIds: { type: "array", maxItems: 8, uniqueItems: true, items: ID },
    knowledgeObjects: { type: "array", maxItems: 12, uniqueItems: true, items: NON_EMPTY_STRING },
    notationIsLearningObject: { type: "boolean" },
    mustPreserve: { type: "array", maxItems: 12, uniqueItems: true, items: NON_EMPTY_STRING },
    packages: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      uniqueItems: true,
      items: RESOURCE_LIBRARY_PACKAGE_REQUEST_SCHEMA
    },
    cardJson: {
      type: "string",
      minLength: 2,
      maxLength: 40_000,
      description: "Card canônico em JSON."
    },
    intent: {
      type: "string",
      maxLength: 4_000,
      description: "Intenção pedagógica e representacional."
    },
    workspaceId: UUID,
    snapshotRef: VERSIONED_REFERENCE_SCHEMA
  }),
  allOf: [
    {
      if: { properties: { operation: { enum: ["inspect", "contracts"] } } },
      then: { required: ["packages"] }
    },
    {
      if: { properties: { operation: { const: "contracts" } } },
      then: {
        properties: {
          packages: {
            type: "array",
            minItems: 1,
            maxItems: 1,
            items: schema(["packageId", "version"], {
              packageId: PACKAGE_ID,
              version: {
                type: "string",
                pattern: "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)$"
              }
            })
          }
        }
      }
    },
    {
      if: {
        properties: {
          operation: {
            enum: ["validate_card", "audit_representation", "preview_card"]
          }
        }
      },
      then: { required: ["cardJson"] }
    },
    {
      if: { required: ["workspaceId"] },
      then: { required: ["snapshotRef"] },
      else: { not: { required: ["snapshotRef"] } }
    }
  ]
});
const RESOURCE_LIBRARY_TOOL = tool(
  "consultarBibliotecaDeResources",
  "Consultar biblioteca de resources",
  "Explora facetas, busca pela intenção, inspeciona manifests, obtém um contrato exato, valida cards e audita a adequação representacional. Com workspace e snapshot, restringe tudo aos ResourceSets efetivos; sem representação adequada, bloqueia ou registra a limitação conforme a política.",
  RESOURCE_LIBRARY_INPUT_SCHEMA,
  RESOURCE_LIBRARY_DATA_SCHEMA,
  { readOnlyHint: true }
);
const AUTHORING_DESIGN_TOOL = tool(
  "gerirDesenhoInstrucional",
  "Gerir desenho instrucional",
  "Lê desenho e auditoria paginados, entrega um contrato JIT e persiste análise, parâmetros, ResourceSet, snapshot, blueprint, manifesto e audit run com CAS. Descubra caminhos no workspace; não peça ids técnicos ao autor.",
  AUTHORING_DESIGN_INPUT_SCHEMA,
  AUTHORING_DESIGN_DATA_SCHEMA,
  { actionConsequentialHint: true }
);

const INDIVIDUAL_AUTHORING_WORKSPACE_MCP_TOOLS = Object.freeze([
  tool(
    "prepararAutoriaAraLearn",
    "Preparar autoria AraLearn",
    "Use no início da etapa. Create e extend recuperam o mandato de diagnóstico contextual, planejamento dialogado e construção; audit confronta diagnóstico, plano e cards sem alterar conteúdo; repair repara; restructure reorganiza; publish prepara submissão ou distribui em Coleções.",
    readSchema(["intent"], {
      intent: AUTHORING_INTENT,
      targetEntity: {
        type: "string",
        enum: ["course", "module", "lesson", "microsequence", "card"]
      },
      context: {
        type: "string",
        maxLength: 8_000,
        description: "Contexto útil do pedido, sem credenciais."
      },
      packageIds: {
        type: "array",
        maxItems: 16,
        uniqueItems: true,
        items: PACKAGE_ID
      }
    }),
    AUTHORING_CONTEXT_DATA_SCHEMA,
    { readOnlyHint: true }
  ),
  RESOURCE_LIBRARY_TOOL,
  AUTHORING_DESIGN_TOOL,
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
    "Lê a árvore, uma entidade ou a biblioteca corrente de um curso acessível.",
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
        description: "Brief estável (até 16 KiB); identifique cada fonte aprovada como [source:id]."
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
    "No workspace, localiza cards por id, posição, papel pedagógico, packages e resumo. Para mostrar ou auditar práticas, releia como entidade só os alvos pedidos; abra ou importe antes uma publicação.",
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
        description: "Cards JSON de uma microssequência."
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
        description: "Card completo em JSON."
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
    "Mantém brief estável, Partes, decisões — inclusive diagnóstico aprovado por microssequência —, mandato e achados sem copiar árvore, conversa ou raciocínio privado. record_approved_plan grava o plano em uma escrita; replace_stable_brief substitui somente contexto estável.",
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
  const propertyVariants = new Map();
  for (const alternative of frozenAlternatives) {
    for (const [field, fieldSchema] of Object.entries(alternative.properties || {})) {
      const variants = propertyVariants.get(field) || new Map();
      variants.set(JSON.stringify(fieldSchema), fieldSchema);
      propertyVariants.set(field, variants);
    }
  }
  const sharedProperties = Object.freeze(Object.fromEntries(
    [...propertyVariants].map(([field, variants]) => {
      const schemas = [...variants.values()];
      if (field === "operation") {
        return [field, Object.freeze({ type: "string", enum: operations })];
      }
      return [field, schemas.length === 1
        ? schemas[0]
        : Object.freeze({ anyOf: Object.freeze(schemas) })];
    })
  ));
  const requiredByEveryAlternative = [...new Set(
    frozenAlternatives[0]?.required || []
  )].filter((field) => frozenAlternatives.every(
    (alternative) => alternative.required?.includes(field)
  ));
  const rootRequired = Object.freeze([...new Set([
    ...(write ? ["requestId"] : []),
    "operation",
    ...requiredByEveryAlternative
  ])]);
  const compactAlternatives = Object.freeze(frozenAlternatives.map((alternative) => {
    const allowedFields = Object.keys(alternative.properties || {});
    const variantProperties = Object.fromEntries(allowedFields
      .filter((field) => field === "operation" || propertyVariants.get(field)?.size > 1)
      .map((field) => [field, alternative.properties[field]]));
    const variantRequired = (alternative.required || [])
      .filter((field) => !rootRequired.includes(field));
    const constraints = { ...alternative };
    delete constraints.type;
    delete constraints.additionalProperties;
    delete constraints.required;
    delete constraints.properties;
    return Object.freeze({
      type: "object",
      ...(variantRequired.length ? { required: Object.freeze(variantRequired) } : {}),
      properties: Object.freeze(variantProperties),
      propertyNames: Object.freeze({ enum: Object.freeze(allowedFields) }),
      ...constraints
    });
  }));
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    required: rootRequired,
    properties: sharedProperties,
    oneOf: compactAlternatives
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
  ["listarColecoesDoCatalogo", CATALOG_QUERY_TOOL],
  ["criarColecaoNoCatalogo", CATALOG_EDIT_TOOL],
  ["retirarColecaoDoCatalogo", CATALOG_REMOVE_TOOL],
  ["copiarEntidadeNoWorkspace", WORKSPACE_REORGANIZATION_TOOL],
  ["excluirEntidadeDoWorkspace", WORKSPACE_DELETE_TOOL]
]);
const CONSOLIDATED_REMOVALS = new Set([
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
  "excluirWorkspaceDeAutoria",
  "revisarMicroteoriasDoWorkspace"
]);

export const AUTHORING_WORKSPACE_MCP_TOOLS = Object.freeze(
  INDIVIDUAL_AUTHORING_WORKSPACE_MCP_TOOLS.flatMap((definition) => {
    const replacement = CONSOLIDATED_REPLACEMENTS.get(definition.name);
    if (replacement) return [replacement];
    if (CONSOLIDATED_REMOVALS.has(definition.name)) return [];
    return [definition];
  })
);

const TOOL_BY_NAME = new Map([
  ...AUTHORING_WORKSPACE_MCP_TOOLS.map(
    (definition) => [definition.name, definition]
  ),
  ...INDIVIDUAL_AUTHORING_WORKSPACE_MCP_TOOLS
    .filter((definition) => definition.name === "revisarMicroteoriasDoWorkspace")
    .map((definition) => [definition.name, definition])
]);

const EXPERIMENT_PROTOCOL_FACTOR_SCHEMA = schema([
  "factorId", "definitionRef", "kind", "targets"
], {
  factorId: ID,
  definitionRef: VERSIONED_REFERENCE_SCHEMA,
  kind: { type: "string", enum: ["parameter", "resource_set"] },
  targets: {
    type: "array",
    minItems: 1,
    maxItems: 500,
    uniqueItems: true,
    items: EXPERIMENT_SCOPE_SCHEMA
  }
});
const EXPERIMENT_PROTOCOL_CONDITION_VALUE_SCHEMA = Object.freeze({
  oneOf: [
    schema(["factorId", "value"], {
      factorId: ID,
      value: EXPERIMENT_PARAMETER_VALUE_SCHEMA
    }),
    schema(["factorId", "resourceSetRef"], {
      factorId: ID,
      resourceSetRef: VERSIONED_REFERENCE_SCHEMA
    })
  ]
});
const EXPERIMENT_PROTOCOL_CONDITION_SCHEMA = schema([
  "conditionId", "label", "values"
], {
  conditionId: ID,
  label: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
  values: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: EXPERIMENT_PROTOCOL_CONDITION_VALUE_SCHEMA
  }
});
const EXPERIMENT_PROTOCOL_CONDITION_READ_SCHEMA = schema([
  "conditionId", "conditionRef", "label", "values"
], {
  conditionId: ID,
  conditionRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  label: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
  values: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: EXPERIMENT_PROTOCOL_CONDITION_VALUE_SCHEMA
  }
});
const EXPERIMENT_ASSIGNMENT_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    schema(["rule"], { rule: { const: "manual" } }),
    schema(["rule", "seed"], {
      rule: { const: "seeded_random" },
      seed: { type: "string", minLength: 1, maxLength: 512, pattern: "\\S" }
    }),
    schema(["rule"], { rule: { const: "balanced_simple" } })
  ]
});
const EXPERIMENT_PROTOCOL_INPUT_SCHEMA = schema([
  "title", "baseRef", "scope", "factors", "conditions", "invariants",
  "assignment", "consentPolicyRef", "instrumentRefs", "outcomeRefs"
], {
  title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
  hypothesis: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" },
  baseRef: VERSIONED_REFERENCE_SCHEMA,
  scope: EXPERIMENT_SCOPE_SCHEMA,
  factors: {
    type: "array",
    minItems: 1,
    maxItems: 8,
    items: EXPERIMENT_PROTOCOL_FACTOR_SCHEMA
  },
  conditions: {
    type: "array",
    minItems: 2,
    maxItems: 32,
    items: EXPERIMENT_PROTOCOL_CONDITION_SCHEMA
  },
  invariants: {
    type: "array",
    minItems: 4,
    maxItems: 4,
    uniqueItems: true,
    items: {
      type: "string",
      enum: ["sources", "targets", "analysis", "structure"]
    }
  },
  assignment: EXPERIMENT_ASSIGNMENT_INPUT_SCHEMA,
  consentPolicyRef: VERSIONED_REFERENCE_SCHEMA,
  instrumentRefs: {
    type: "array",
    maxItems: 32,
    uniqueItems: true,
    items: VERSIONED_REFERENCE_SCHEMA
  },
  outcomeRefs: {
    type: "array",
    maxItems: 32,
    uniqueItems: true,
    items: VERSIONED_REFERENCE_SCHEMA
  }
});
const EXPECTED_EXPERIMENT_REVISION_SCHEMA = Object.freeze({
  type: "integer",
  minimum: 0
});
const EXPERIMENT_ENROLLMENT_CODE_SCHEMA = Object.freeze({
  type: "string",
  minLength: 8,
  maxLength: 128,
  pattern: "^[A-Za-z0-9_-]{8,128}$"
});

function experimentMutationInput(
  operation,
  required,
  properties,
  { workspaceFence = false } = {}
) {
  return schemaWithOperation(writeSchema([
    "workspaceId", "expectedExperimentRevision",
    ...(workspaceFence ? ["expectedWorkspaceRevision"] : []),
    ...required
  ], {
    workspaceId: UUID,
    expectedExperimentRevision: EXPECTED_EXPERIMENT_REVISION_SCHEMA,
    ...(workspaceFence ? { expectedWorkspaceRevision: REVISION } : {}),
    ...properties
  }), operation);
}

const EXPERIMENT_APPLICATION_INPUT_SCHEMA = discriminatedInputSchema([
  schemaWithOperation(Object.freeze({
    ...readSchema(["workspaceId"], {
      workspaceId: UUID,
      experimentSetRef: VERSIONED_REFERENCE_SCHEMA,
      cursor: { type: "string", minLength: 1, maxLength: 240 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 }
    }),
    allOf: [{
      if: { required: ["cursor"] },
      then: { required: ["experimentSetRef"] }
    }]
  }), "list"),
  schemaWithOperation(Object.freeze({
    ...readSchema(["workspaceId", "kind"], {
      workspaceId: UUID,
      kind: {
        type: "string",
        enum: [
          "scope", "base", "factor_definition", "resource_set", "consent_policy",
          "instrument", "outcome"
        ]
      },
      query: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
      optionsSetRef: VERSIONED_REFERENCE_SCHEMA,
      cursor: { type: "string", minLength: 1, maxLength: 240 },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 }
    }),
    allOf: [{
      if: { required: ["cursor"] },
      then: { required: ["optionsSetRef"] }
    }]
  }), "list_options"),
  schemaWithOperation(readSchema(["workspaceId", "experimentId"], {
    workspaceId: UUID,
    experimentId: UUID,
    section: { const: "overview" }
  }), "read"),
  schemaWithOperation(readSchema(["workspaceId", "experimentId", "section"], {
    workspaceId: UUID,
    experimentId: UUID,
    section: { const: "protocol" },
    protocolRevision: REVISION
  }), "read"),
  schemaWithOperation(Object.freeze({
    ...readSchema(["workspaceId", "experimentId", "section"], {
      workspaceId: UUID,
      experimentId: UUID,
      section: { const: "variants" },
      variantSetRef: VERSIONED_REFERENCE_SCHEMA,
      variantCursor: { type: "string", minLength: 1, maxLength: 240 },
      variantLimit: { type: "integer", minimum: 1, maximum: 20, default: 20 }
    }),
    allOf: [{
      if: { required: ["variantCursor"] },
      then: { required: ["variantSetRef"] }
    }]
  }), "read"),
  schemaWithOperation(Object.freeze({
    ...readSchema(["workspaceId", "experimentId", "section"], {
      workspaceId: UUID,
      experimentId: UUID,
      section: { const: "participants" },
      participantSetRef: VERSIONED_REFERENCE_SCHEMA,
      participantCursor: { type: "string", minLength: 1, maxLength: 240 },
      participantLimit: { type: "integer", minimum: 1, maximum: 20, default: 20 }
    }),
    allOf: [{
      if: { required: ["participantCursor"] },
      then: { required: ["participantSetRef"] }
    }]
  }), "read"),
  schemaWithOperation(Object.freeze({
    ...readSchema(["workspaceId", "experimentId", "section"], {
      workspaceId: UUID,
      experimentId: UUID,
      section: { const: "differences" },
      differenceSetRef: VERSIONED_REFERENCE_SCHEMA,
      differenceRunCursor: { type: "string", minLength: 1, maxLength: 240 },
      differenceRunLimit: { type: "integer", minimum: 1, maximum: 20, default: 20 },
      differenceRunRef: VERSIONED_REFERENCE_SCHEMA,
      differenceCursor: { type: "string", minLength: 1, maxLength: 240 },
      differenceLimit: { type: "integer", minimum: 1, maximum: 20, default: 20 }
    }),
    allOf: [{
      if: { required: ["differenceRunCursor"] },
      then: { required: ["differenceSetRef"] }
    }, {
      if: { required: ["differenceCursor"] },
      then: { required: ["differenceRunRef"] }
    }, {
      not: {
        anyOf: [{
          required: ["differenceRunRef", "differenceSetRef"]
        }, {
          required: ["differenceRunRef", "differenceRunCursor"]
        }, {
          required: ["differenceRunRef", "differenceRunLimit"]
        }]
      }
    }]
  }), "read"),
  experimentMutationInput("save_protocol", ["protocol"], {
    experimentId: UUID,
    protocol: EXPERIMENT_PROTOCOL_INPUT_SCHEMA
  }),
  experimentMutationInput("validate", ["experimentId"], {
    experimentId: UUID
  }, { workspaceFence: true }),
  experimentMutationInput("generate_variants", ["experimentId"], {
    experimentId: UUID
  }, { workspaceFence: true }),
  Object.freeze({
    ...experimentMutationInput("decide_difference", [
      "experimentId", "differenceRunRef", "differenceRef", "decision"
    ], {
      experimentId: UUID,
      differenceRunRef: VERSIONED_REFERENCE_SCHEMA,
      differenceRef: VERSIONED_REFERENCE_SCHEMA,
      decision: { type: "string", enum: ["correct", "accept", "invalidate"] },
      note: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" },
      participantContinuity: { const: "retain_existing" }
    }),
    allOf: [{
      if: { required: ["participantContinuity"] },
      then: { properties: { decision: { const: "correct" } } }
    }, {
      if: {
        properties: { decision: { enum: ["accept", "invalidate"] } },
        required: ["decision"]
      },
      then: { required: ["note"] }
    }]
  }),
  experimentMutationInput("request_correction", [
    "experimentId", "variantRevisionRef", "reason", "participantContinuity"
  ], {
    experimentId: UUID,
    variantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
    reason: { type: "string", minLength: 1, maxLength: 2_000, pattern: "\\S" },
    participantContinuity: { const: "retain_existing" }
  }, { workspaceFence: true }),
  experimentMutationInput("freeze", ["experimentId", "variantRevisionRef"], {
    experimentId: UUID,
    variantRevisionRef: VERSIONED_REFERENCE_SCHEMA
  }, { workspaceFence: true }),
  experimentMutationInput("start_collection", ["experimentId"], {
    experimentId: UUID
  }),
  experimentMutationInput("rotate_enrollment_code", ["experimentId"], {
    experimentId: UUID
  }),
  experimentMutationInput("transition_collection", ["experimentId", "transition"], {
    experimentId: UUID,
    transition: { type: "string", enum: ["pause", "resume", "close", "invalidate"] }
  }),
  experimentMutationInput("assign_participant", ["experimentId", "enrollmentRef"], {
    experimentId: UUID,
    enrollmentRef: UUID,
    conditionRef: VERSIONED_REFERENCE_SCHEMA
  })
]);

const EXPERIMENT_LABELED_REF_SCHEMA = schema(["ref", "label"], {
  ref: VERSIONED_REFERENCE_SCHEMA,
  label: { type: "string", minLength: 1, maxLength: 300 }
});
const EXPERIMENT_FACTOR_OPTION_SCHEMA = schema(["label", "value"], {
  label: { type: "string", minLength: 1, maxLength: 300 },
  value: EXPERIMENT_PARAMETER_VALUE_SCHEMA
});
const EXPERIMENT_FACTOR_CONSTRAINTS_SCHEMA = schema([], {
  minimum: { type: "number" },
  maximum: { type: "number" },
  allowedEnumValues: {
    type: "array",
    maxItems: 32,
    uniqueItems: true,
    items: { type: "string", minLength: 1, maxLength: 240 }
  },
  setItemPattern: { type: "string", minLength: 1, maxLength: 240 },
  refNamespace: ID,
  vectorDimensions: {
    type: "array",
    maxItems: 32,
    uniqueItems: true,
    items: ID
  },
  allowedUnits: {
    type: "array",
    maxItems: 16,
    uniqueItems: true,
    items: ID
  },
  relationKinds: {
    type: "array",
    maxItems: 16,
    uniqueItems: true,
    items: ID
  }
});
const EXPERIMENT_FACTOR_DEFINITION_OPTION_SCHEMA = schema([
  "definitionRef", "label", "kind", "valueType", "unit", "supportedScopes",
  "constraints", "options"
], {
  definitionRef: VERSIONED_REFERENCE_SCHEMA,
  label: { type: "string", minLength: 1, maxLength: 300 },
  kind: { type: "string", enum: ["parameter", "resource_set"] },
  valueType: {
    type: "string",
    enum: ["integer", "range", "enum", "set", "vector", "relation", "resource_set"]
  },
  unit: {
    anyOf: [
      { type: "null" },
      schema(["numerator", "denominator"], {
        numerator: ID,
        denominator: ID
      })
    ]
  },
  supportedScopes: {
    type: "array",
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
    items: { type: "string", enum: ["course", "lesson", "microsequence"] }
  },
  constraints: EXPERIMENT_FACTOR_CONSTRAINTS_SCHEMA,
  options: {
    type: "array",
    maxItems: 8,
    items: EXPERIMENT_FACTOR_OPTION_SCHEMA
  }
});
const EXPERIMENT_ACTIONS_SCHEMA = schema([
  "saveProtocol", "validate", "generateVariants", "decideDifference", "freeze",
  "requestCorrection", "startCollection", "rotateEnrollmentCode", "transitionCollection",
  "assignParticipant"
], {
  saveProtocol: { type: "boolean" },
  validate: { type: "boolean" },
  generateVariants: { type: "boolean" },
  decideDifference: { type: "boolean" },
  requestCorrection: { type: "boolean" },
  freeze: { type: "boolean" },
  startCollection: { type: "boolean" },
  rotateEnrollmentCode: { type: "boolean" },
  transitionCollection: {
    type: "array",
    maxItems: 4,
    uniqueItems: true,
    items: {
      type: "string",
      enum: ["pause", "resume", "close", "invalidate"]
    }
  },
  assignParticipant: { type: "boolean" }
});
const EXPERIMENT_SUMMARY_SCHEMA = schema([
  "id", "experimentRevision", "title", "state", "conditionCount",
  "variantCount", "updatedAt"
], {
  id: UUID,
  experimentRevision: REVISION,
  title: { type: "string", minLength: 1, maxLength: 300 },
  state: EXPERIMENT_STATE_SCHEMA,
  conditionCount: NON_NEGATIVE_INTEGER,
  variantCount: NON_NEGATIVE_INTEGER,
  updatedAt: DATE_TIME
});
const EXPERIMENT_ASSIGNMENT_READ_SCHEMA = schema([
  "rule", "seedConfigured", "algorithm", "commitment"
], {
  rule: { type: "string", enum: ["manual", "seeded_random", "balanced_simple"] },
  seedConfigured: { type: "boolean" },
  algorithm: { type: ["string", "null"], maxLength: 120 },
  commitment: NULLABLE_SHA256
});
const EXPERIMENT_AUTHORING_READER_TARGET_SCHEMA = schema([
  "workspaceId", "entityPath", "courseId", "access", "contentHash"
], {
  workspaceId: UUID,
  entityPath: { type: "array", minItems: 1, maxItems: 4, items: ID },
  courseId: UUID,
  access: { const: "private" },
  contentHash: NULLABLE_SHA256
});
const EXPERIMENT_PARTICIPANT_READER_TARGET_SCHEMA = schema([
  "courseId", "access", "contentHash"
], {
  courseId: UUID,
  access: { const: "private" },
  contentHash: NULLABLE_SHA256
});
const EXPERIMENT_VARIANT_RESOURCE_SUMMARY_SCHEMA = schema([
  "items", "count", "nextCursor", "truncated"
], {
  items: {
    type: "array",
    maxItems: 2,
    items: schema(["ref", "label", "role"], {
      ref: VERSIONED_REFERENCE_SCHEMA,
      label: { type: "string", maxLength: 300 },
      role: { type: "string", maxLength: 80 }
    })
  },
  count: NON_NEGATIVE_INTEGER,
  nextCursor: { type: ["string", "null"], maxLength: 240 },
  truncated: { type: "boolean" }
});
const EXPERIMENT_VARIANT_READ_SCHEMA = schema([
  "variantRevisionRef", "conditionRef", "baseRef", "protocolRef", "state",
  "workspaceRevision", "readerTarget", "frozenAt", "limitationRefs",
  "snapshotRef", "materializationRef", "auditRunRef", "provenanceHash",
  "provenancePinCount", "currentness", "allowedResources",
  "materializedResources"
], {
  variantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
  conditionRef: VERSIONED_REFERENCE_SCHEMA,
  baseRef: VERSIONED_REFERENCE_SCHEMA,
  protocolRef: VERSIONED_REFERENCE_SCHEMA,
  state: ID,
  workspaceRevision: REVISION,
  readerTarget: {
    anyOf: [{ type: "null" }, EXPERIMENT_AUTHORING_READER_TARGET_SCHEMA]
  },
  frozenAt: NULLABLE_DATE_TIME,
  limitationRefs: {
    type: "array",
    maxItems: 16,
    uniqueItems: true,
    items: VERSIONED_REFERENCE_SCHEMA
  },
  snapshotRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  materializationRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  auditRunRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
  provenanceHash: NULLABLE_SHA256,
  provenancePinCount: NON_NEGATIVE_INTEGER,
  currentness: schema([
    "base", "protocol", "condition", "materialization", "audit"
  ], {
    base: { type: "boolean" },
    protocol: { type: "boolean" },
    condition: { type: "boolean" },
    materialization: { type: "boolean" },
    audit: { type: "boolean" }
  }),
  allowedResources: EXPERIMENT_VARIANT_RESOURCE_SUMMARY_SCHEMA,
  materializedResources: EXPERIMENT_VARIANT_RESOURCE_SUMMARY_SCHEMA
});
const EXPERIMENT_DIFFERENCE_READ_SCHEMA = schema([
  "differenceRef", "baselineRef", "candidateVariantRevisionRef", "state",
  "hunkCount", "classifiedCount", "decision", "requiresParticipantContinuity"
], {
  differenceRef: VERSIONED_REFERENCE_SCHEMA,
  baselineRef: schema(["kind", "ref"], {
    kind: { type: "string", enum: ["base", "variant_revision"] },
    ref: VERSIONED_REFERENCE_SCHEMA
  }),
  candidateVariantRevisionRef: VERSIONED_REFERENCE_SCHEMA,
  state: ID,
  hunkCount: NON_NEGATIVE_INTEGER,
  classifiedCount: NON_NEGATIVE_INTEGER,
  decision: { type: ["string", "null"], enum: ["correct", "accept", "invalidate", null] },
  requiresParticipantContinuity: { type: "boolean" }
});
const EXPERIMENT_PROTOCOL_READ_SCHEMA = schema([
  "title", "hypothesis", "baseRef", "scope", "factors", "conditions",
  "invariants", "assignment", "consentPolicyRef", "instrumentRefs", "outcomeRefs"
], {
  title: { type: "string", minLength: 1, maxLength: 300 },
  hypothesis: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
  baseRef: VERSIONED_REFERENCE_SCHEMA,
  scope: EXPERIMENT_SCOPE_SCHEMA,
  factors: {
    type: "array",
    maxItems: 8,
    items: EXPERIMENT_PROTOCOL_FACTOR_SCHEMA
  },
  conditions: {
    type: "array",
    maxItems: 32,
    items: EXPERIMENT_PROTOCOL_CONDITION_READ_SCHEMA
  },
  invariants: {
    type: "array",
    minItems: 4,
    maxItems: 4,
    uniqueItems: true,
    items: { type: "string", enum: ["sources", "targets", "analysis", "structure"] }
  },
  assignment: EXPERIMENT_ASSIGNMENT_READ_SCHEMA,
  consentPolicyRef: VERSIONED_REFERENCE_SCHEMA,
  instrumentRefs: {
    type: "array", maxItems: 32, uniqueItems: true, items: VERSIONED_REFERENCE_SCHEMA
  },
  outcomeRefs: {
    type: "array", maxItems: 32, uniqueItems: true, items: VERSIONED_REFERENCE_SCHEMA
  }
});
const EXPERIMENT_ENROLLMENT_READ_SCHEMA = schema(["configured", "expiresAt"], {
  configured: { type: "boolean" },
  expiresAt: NULLABLE_DATE_TIME
});
const EXPERIMENT_READ_BASE_PROPERTIES = Object.freeze({
  id: UUID,
  experimentRevision: REVISION,
  state: EXPERIMENT_STATE_SCHEMA
});
function experimentReadSectionSchema(section, required, properties) {
  return schema(
    ["id", "experimentRevision", "state", "section", ...required],
    {
      ...EXPERIMENT_READ_BASE_PROPERTIES,
      section: { const: section },
      ...properties
    }
  );
}
const EXPERIMENT_OVERVIEW_READ_SCHEMA = experimentReadSectionSchema(
  "overview",
  [
    "title", "hypothesis", "actions", "assignment", "enrollment",
    "conditionCount", "variantCount", "differenceCount"
  ],
  {
    title: { type: "string", minLength: 1, maxLength: 300 },
    hypothesis: { type: ["string", "null"], minLength: 1, maxLength: 2_000 },
    actions: EXPERIMENT_ACTIONS_SCHEMA,
    assignment: EXPERIMENT_ASSIGNMENT_READ_SCHEMA,
    enrollment: EXPERIMENT_ENROLLMENT_READ_SCHEMA,
    conditionCount: NON_NEGATIVE_INTEGER,
    variantCount: NON_NEGATIVE_INTEGER,
    differenceCount: NON_NEGATIVE_INTEGER
  }
);
const EXPERIMENT_PROTOCOL_SECTION_READ_SCHEMA = experimentReadSectionSchema(
  "protocol",
  ["protocolRef", "protocolRevision", "protocol"],
  {
    protocolRef: VERSIONED_REFERENCE_SCHEMA,
    protocolRevision: REVISION,
    protocol: EXPERIMENT_PROTOCOL_READ_SCHEMA
  }
);
const EXPERIMENT_VARIANTS_SECTION_READ_SCHEMA = experimentReadSectionSchema(
  "variants",
  ["variantSetRef", "items", "count", "nextCursor", "truncated"],
  {
    variantSetRef: VERSIONED_REFERENCE_SCHEMA,
    items: { type: "array", maxItems: 10, items: EXPERIMENT_VARIANT_READ_SCHEMA },
    count: NON_NEGATIVE_INTEGER,
    nextCursor: { type: ["string", "null"], maxLength: 240 },
    truncated: { type: "boolean" }
  }
);
const EXPERIMENT_DIFFERENCE_HUNK_READ_SCHEMA = schema([
  "differenceRef", "differenceId", "path", "kind", "beforeSummary", "afterSummary",
  "classification", "publicRationale", "evidenceRefs", "humanDecision",
  "requiresParticipantContinuity"
], {
  differenceRef: VERSIONED_REFERENCE_SCHEMA,
  differenceId: ID,
  path: { type: "string", minLength: 1, maxLength: 500 },
  kind: { type: "string", enum: ["added", "removed", "changed", "moved"] },
  beforeSummary: { type: ["string", "null"], maxLength: 500 },
  afterSummary: { type: ["string", "null"], maxLength: 500 },
  classification: {
    type: ["string", "null"],
    enum: [...EXPERIMENT_DIFFERENCE_CLASSIFICATIONS, null]
  },
  publicRationale: { type: ["string", "null"], maxLength: 500 },
  evidenceRefs: { type: "array", maxItems: 4, uniqueItems: true, items: ID },
  humanDecision: {
    type: ["string", "null"],
    enum: ["correct", "accept", "invalidate", null]
  },
  requiresParticipantContinuity: { type: "boolean" }
});
const EXPERIMENT_DIFFERENCES_SECTION_READ_SCHEMA = experimentReadSectionSchema(
  "differences",
  [
    "mode", "differenceSetRef", "differenceRunRef", "items", "count",
    "nextCursor", "truncated"
  ],
  {
    mode: { type: "string", enum: ["runs", "hunks"] },
    differenceSetRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
    differenceRunRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
    items: {
      type: "array",
      maxItems: 20,
      items: {
        anyOf: [
          EXPERIMENT_DIFFERENCE_READ_SCHEMA,
          EXPERIMENT_DIFFERENCE_HUNK_READ_SCHEMA
        ]
      }
    },
    count: NON_NEGATIVE_INTEGER,
    nextCursor: { type: ["string", "null"], maxLength: 240 },
    truncated: { type: "boolean" }
  }
);
const EXPERIMENT_PARTICIPANT_QUEUE_ITEM_SCHEMA = schema([
  "enrollmentRef", "pseudonymLabel", "status", "assignedConditionRef"
], {
  enrollmentRef: UUID,
  pseudonymLabel: { type: "string", minLength: 1, maxLength: 120 },
  status: { type: "string", enum: ["enrolled", "assigned"] },
  assignedConditionRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA
});
const EXPERIMENT_PARTICIPANTS_SECTION_READ_SCHEMA = experimentReadSectionSchema(
  "participants",
  ["participantSetRef", "items", "count", "nextCursor", "truncated"],
  {
    participantSetRef: VERSIONED_REFERENCE_SCHEMA,
    items: {
      type: "array",
      maxItems: 20,
      items: EXPERIMENT_PARTICIPANT_QUEUE_ITEM_SCHEMA
    },
    count: NON_NEGATIVE_INTEGER,
    nextCursor: { type: ["string", "null"], maxLength: 240 },
    truncated: { type: "boolean" }
  }
);
const EXPERIMENT_READ_SCHEMA = Object.freeze({
  oneOf: [
    EXPERIMENT_OVERVIEW_READ_SCHEMA,
    EXPERIMENT_PROTOCOL_SECTION_READ_SCHEMA,
    EXPERIMENT_VARIANTS_SECTION_READ_SCHEMA,
    EXPERIMENT_DIFFERENCES_SECTION_READ_SCHEMA,
    EXPERIMENT_PARTICIPANTS_SECTION_READ_SCHEMA
  ]
});
const EXPERIMENT_APPLICATION_LIST_DATA_SCHEMA = schema([
  "contract", "operation", "workspaceId", "workspaceRevision", "experimentSetRef",
  "items", "count", "nextCursor", "truncated"
], {
  contract: { const: "aralearn.instructional-experiment-action.v1" },
  operation: { const: "list" },
  workspaceId: UUID,
  workspaceRevision: REVISION,
  experimentSetRef: VERSIONED_REFERENCE_SCHEMA,
  items: { type: "array", maxItems: 50, items: EXPERIMENT_SUMMARY_SCHEMA },
  count: NON_NEGATIVE_INTEGER,
  nextCursor: { type: ["string", "null"], maxLength: 240 },
  truncated: { type: "boolean" }
});
const EXPERIMENT_SCOPE_OPTION_SCHEMA = schema(["scope", "label", "entityPath"], {
  scope: EXPERIMENT_SCOPE_SCHEMA,
  label: { type: "string", minLength: 1, maxLength: 300 },
  entityPath: { type: "array", minItems: 1, maxItems: 4, items: ID }
});
const EXPERIMENT_BASE_OPTION_SCHEMA = schema([
  "ref", "label", "approved", "scope"
], {
  ref: VERSIONED_REFERENCE_SCHEMA,
  label: { type: "string", minLength: 1, maxLength: 300 },
  approved: { type: "boolean" },
  scope: EXPERIMENT_SCOPE_SCHEMA
});
const EXPERIMENT_RESOURCE_SET_OPTION_SCHEMA = schema([
  "ref", "label", "memberCount", "scope"
], {
  ref: VERSIONED_REFERENCE_SCHEMA,
  label: { type: "string", minLength: 1, maxLength: 300 },
  memberCount: NON_NEGATIVE_INTEGER,
  scope: EXPERIMENT_SCOPE_SCHEMA
});
const EXPERIMENT_APPLICATION_OPTION_ITEM_SCHEMA = Object.freeze({
  anyOf: [
    EXPERIMENT_SCOPE_OPTION_SCHEMA,
    EXPERIMENT_BASE_OPTION_SCHEMA,
    EXPERIMENT_RESOURCE_SET_OPTION_SCHEMA,
    EXPERIMENT_LABELED_REF_SCHEMA,
    EXPERIMENT_FACTOR_DEFINITION_OPTION_SCHEMA
  ]
});
const EXPERIMENT_APPLICATION_OPTIONS_DATA_SCHEMA = schema([
  "contract", "operation", "workspaceId", "workspaceRevision", "optionsSetRef",
  "kind", "items", "count", "nextCursor", "truncated"
], {
  contract: { const: "aralearn.instructional-experiment-action.v1" },
  operation: { const: "list_options" },
  workspaceId: UUID,
  workspaceRevision: REVISION,
  optionsSetRef: VERSIONED_REFERENCE_SCHEMA,
  kind: {
    type: "string",
    enum: [
      "scope", "base", "factor_definition", "resource_set", "consent_policy",
      "instrument", "outcome"
    ]
  },
  items: { type: "array", maxItems: 50, items: EXPERIMENT_APPLICATION_OPTION_ITEM_SCHEMA },
  count: NON_NEGATIVE_INTEGER,
  nextCursor: { type: ["string", "null"], maxLength: 240 },
  truncated: { type: "boolean" }
});
const EXPERIMENT_APPLICATION_READ_DATA_SCHEMA = schema([
  "contract", "operation", "workspaceId", "workspaceRevision", "experiment"
], {
  contract: { const: "aralearn.instructional-experiment-action.v1" },
  operation: { const: "read" },
  workspaceId: UUID,
  workspaceRevision: REVISION,
  experiment: EXPERIMENT_READ_SCHEMA
});
const EXPERIMENT_APPLICATION_MUTATION_DATA_SCHEMA = Object.freeze({
  ...schema([
    "contract", "operation", "workspaceId", "workspaceRevision", "experimentId",
    "experimentRevision", "state", "idempotent", "resultRef"
  ], {
    contract: { const: "aralearn.instructional-experiment-action.v1" },
    operation: {
      type: "string",
      enum: [
        "save_protocol", "validate", "generate_variants", "decide_difference",
        "request_correction", "freeze", "start_collection", "rotate_enrollment_code",
        "transition_collection", "assign_participant"
      ]
    },
    workspaceId: UUID,
    workspaceRevision: REVISION,
    experimentId: UUID,
    experimentRevision: REVISION,
    state: EXPERIMENT_STATE_SCHEMA,
    idempotent: { type: "boolean" },
    resultRef: NULLABLE_VERSIONED_REFERENCE_SCHEMA,
    enrollmentCode: EXPERIMENT_ENROLLMENT_CODE_SCHEMA,
    expiresAt: DATE_TIME
  }),
  allOf: [{
    if: {
      properties: {
        operation: { enum: ["start_collection", "rotate_enrollment_code"] }
      }
    },
    then: { required: ["enrollmentCode", "expiresAt"] },
    else: {
      not: {
        anyOf: [{ required: ["enrollmentCode"] }, { required: ["expiresAt"] }]
      }
    }
  }]
});
const EXPERIMENT_APPLICATION_DATA_SCHEMA = Object.freeze({
  oneOf: [
    EXPERIMENT_APPLICATION_LIST_DATA_SCHEMA,
    EXPERIMENT_APPLICATION_OPTIONS_DATA_SCHEMA,
    EXPERIMENT_APPLICATION_READ_DATA_SCHEMA,
    EXPERIMENT_APPLICATION_MUTATION_DATA_SCHEMA
  ]
});
const EXPERIMENT_APPLICATION_TOOL = tool(
  "gerirExperimentoInstrucional",
  "Gerir experimento instrucional",
  "Action interna do aplicativo para protocolos, variantes, decisões, freeze, coleta e atribuição sob capacidade research.",
  EXPERIMENT_APPLICATION_INPUT_SCHEMA,
  EXPERIMENT_APPLICATION_DATA_SCHEMA,
  { actionConsequentialHint: true }
);
const EXPERIMENT_ENROLLMENT_INPUT_SCHEMA = discriminatedInputSchema([
  schemaWithOperation(readSchema(["enrollmentCode"], {
    enrollmentCode: EXPERIMENT_ENROLLMENT_CODE_SCHEMA
  }), "read_policy"),
  schemaWithOperation(writeSchema([
    "enrollmentCode", "consentPolicyRef", "consentAcknowledged"
  ], {
    enrollmentCode: EXPERIMENT_ENROLLMENT_CODE_SCHEMA,
    consentPolicyRef: VERSIONED_REFERENCE_SCHEMA,
    consentAcknowledged: { const: true }
  }), "enroll"),
  schemaWithOperation(writeSchema(["enrollmentRef"], {
    enrollmentRef: UUID
  }), "withdraw"),
  schemaWithOperation(readSchema(["enrollmentRef"], {
    enrollmentRef: UUID
  }), "status"),
  schemaWithOperation(writeSchema([
    "workspaceId", "enrollmentRef", "instrumentRef", "outcomeRef", "wave",
    "valueKind", "observedAt"
  ], {
    workspaceId: UUID,
    enrollmentRef: UUID,
    instrumentRef: VERSIONED_REFERENCE_SCHEMA,
    outcomeRef: VERSIONED_REFERENCE_SCHEMA,
    wave: ID,
    valueKind: {
      type: "string",
      enum: ["numeric", "category", "boolean", "text", "missing"]
    },
    value: {},
    missingReason: { type: "string", minLength: 1, maxLength: 500 },
    observedAt: DATE_TIME
  }), "record_outcome")
]);
const EXPERIMENT_ENROLLMENT_SELECTION_SCHEMA = schema([
  "selectionId", "courseId", "contentHash", "readerTarget"
], {
  selectionId: UUID,
  courseId: UUID,
  contentHash: SHA256,
  readerTarget: EXPERIMENT_PARTICIPANT_READER_TARGET_SCHEMA
});
const EXPERIMENT_ENROLLMENT_POLICY_DATA_SCHEMA = schema([
  "contract", "operation", "title", "policy"
], {
  contract: { const: "aralearn.instructional-experiment-enrollment.v1" },
  operation: { const: "read_policy" },
  title: { type: "string", minLength: 1, maxLength: 300 },
  policy: schema(["ref", "label", "publicText"], {
    ref: VERSIONED_REFERENCE_SCHEMA,
    label: { type: "string", minLength: 1, maxLength: 300 },
    publicText: { type: "string", minLength: 1, maxLength: 16_000 }
  })
});
const EXPERIMENT_ENROLLMENT_STATUS_DATA_SCHEMA = Object.freeze({
  ...schema([
    "contract", "operation", "enrollmentRef", "status", "selection"
  ], {
    contract: { const: "aralearn.instructional-experiment-enrollment.v1" },
    operation: { type: "string", enum: ["enroll", "withdraw", "status"] },
    enrollmentRef: UUID,
    status: { type: "string", enum: ["enrolled", "assigned", "withdrawn"] },
    selection: {
      anyOf: [{ type: "null" }, EXPERIMENT_ENROLLMENT_SELECTION_SCHEMA]
    }
  }),
  allOf: [{
    if: { properties: { status: { const: "withdrawn" } }, required: ["status"] },
    then: { properties: { selection: { const: null } } }
  }, {
    if: { properties: { operation: { const: "withdraw" } }, required: ["operation"] },
    then: {
      properties: { status: { const: "withdrawn" }, selection: { const: null } }
    }
  }]
});
const EXPERIMENT_ENROLLMENT_TOOL = tool(
  "ingressarEmExperimentoInstrucional",
  "Ingressar em experimento instrucional",
  "Action interna do aplicativo para ler a política pública, consentir e abrir somente a seleção privada já atribuída à conta atual.",
  EXPERIMENT_ENROLLMENT_INPUT_SCHEMA,
  {
    oneOf: [
      EXPERIMENT_ENROLLMENT_POLICY_DATA_SCHEMA,
      EXPERIMENT_ENROLLMENT_STATUS_DATA_SCHEMA,
      schema([
        "contract", "operation", "observationRef", "enrollmentRef",
        "experimentId", "datasetRevision", "idempotent"
      ], {
        contract: { const: "aralearn.authoring-analytics-outcome.v1" },
        operation: { const: "record_outcome" },
        observationRef: UUID,
        enrollmentRef: UUID,
        experimentId: UUID,
        datasetRevision: { type: "integer", minimum: 1 },
        idempotent: { type: "boolean" }
      })
    ]
  },
  { actionConsequentialHint: true }
);
const ANALYTICS_SCOPE_SCHEMA = schema(["kind"], {
  kind: {
    type: "string",
    enum: ["workspace", "course", "module", "lesson", "microsequence", "experiment"]
  },
  ref: ID,
  entityPath: ENTITY_PATH
});
const ANALYTICS_DATASET_SCHEMA = Object.freeze({
  type: "string",
  enum: [
    "authoring_design", "authoring_process",
    "experiment_assignments", "experiment_outcomes"
  ]
});
const ANALYTICS_APPLICATION_INPUT_SCHEMA = discriminatedInputSchema([
  schemaWithOperation(readSchema(["workspaceId", "scope"], {
    workspaceId: UUID,
    scope: ANALYTICS_SCOPE_SCHEMA
  }), "overview"),
  schemaWithOperation(Object.freeze({
    ...readSchema(["workspaceId", "scope", "dataset"], {
      workspaceId: UUID,
      scope: ANALYTICS_SCOPE_SCHEMA,
      dataset: ANALYTICS_DATASET_SCHEMA,
      datasetSetRef: VERSIONED_REFERENCE_SCHEMA,
      cursor: { type: "string", minLength: 1, maxLength: 240 },
      limit: { type: "integer", minimum: 1, maximum: 20, default: 20 }
    }),
    allOf: [{ if: { required: ["cursor"] }, then: { required: ["datasetSetRef"] } }]
  }), "dataset"),
  schemaWithOperation(Object.freeze({
    ...readSchema(["workspaceId", "scope", "dataset", "format"], {
      workspaceId: UUID,
      scope: ANALYTICS_SCOPE_SCHEMA,
      dataset: ANALYTICS_DATASET_SCHEMA,
      format: { type: "string", enum: ["csv", "json"] },
      datasetSetRef: VERSIONED_REFERENCE_SCHEMA,
      cursor: { type: "string", minLength: 1, maxLength: 240 },
      limit: { type: "integer", minimum: 1, maximum: 20, default: 20 }
    }),
    allOf: [{ if: { required: ["cursor"] }, then: { required: ["datasetSetRef"] } }]
  }), "export")
]);
const ANALYTICS_APPLICATION_DATA_SCHEMA = Object.freeze({
  oneOf: [
    schema([
      "contract", "schemaVersion", "operation", "workspaceId", "workspaceRevision",
      "scope", "overviewSetRef", "permissions", "sections"
    ], {
      contract: { const: "aralearn.authoring-analytics.v1" },
      schemaVersion: { const: "1.0.0" },
      operation: { const: "overview" },
      workspaceId: UUID,
      workspaceRevision: REVISION,
      scope: ANALYTICS_SCOPE_SCHEMA,
      overviewSetRef: VERSIONED_REFERENCE_SCHEMA,
      permissions: { type: "object" },
      sections: { type: "array", maxItems: 4, items: { type: "object" } }
    }),
    schema([
      "contract", "schemaVersion", "operation", "workspaceId", "dataset", "scope",
      "datasetSetRef", "dictionary", "page"
    ], {
      contract: { const: "aralearn.authoring-analytics.v1" },
      schemaVersion: { const: "1.0.0" },
      operation: { const: "dataset" },
      workspaceId: UUID,
      dataset: ANALYTICS_DATASET_SCHEMA,
      scope: ANALYTICS_SCOPE_SCHEMA,
      datasetSetRef: VERSIONED_REFERENCE_SCHEMA,
      dictionary: { type: "array", maxItems: 16, items: { type: "object" } },
      page: schema(["items", "count", "nextCursor", "truncated"], {
        items: { type: "array", maxItems: 20, items: { type: "object" } },
        count: { type: "integer", minimum: 0 },
        nextCursor: { type: ["string", "null"] },
        truncated: { type: "boolean" }
      })
    }),
    schema([
      "contract", "schemaVersion", "operation", "workspaceId", "dataset", "scope",
      "datasetSetRef", "format", "filename", "mimeType", "chunk", "checksum",
      "nextCursor", "complete"
    ], {
      contract: { const: "aralearn.authoring-analytics.v1" },
      schemaVersion: { const: "1.0.0" },
      operation: { const: "export" },
      workspaceId: UUID,
      dataset: ANALYTICS_DATASET_SCHEMA,
      scope: ANALYTICS_SCOPE_SCHEMA,
      datasetSetRef: VERSIONED_REFERENCE_SCHEMA,
      format: { type: "string", enum: ["csv", "json"] },
      filename: { type: "string", minLength: 1, maxLength: 300 },
      mimeType: { type: "string", minLength: 1, maxLength: 100 },
      chunk: { type: "string", maxLength: 90_000 },
      checksum: SHA256,
      nextCursor: { type: ["string", "null"] },
      complete: { type: "boolean" }
    })
  ]
});
const ANALYTICS_APPLICATION_TOOL = tool(
  "consultarAnalyticsInstrucional",
  "Consultar analytics instrucionais",
  "Action interna do aplicativo para visualizações e exportações versionadas, rastreáveis e não punitivas.",
  ANALYTICS_APPLICATION_INPUT_SCHEMA,
  ANALYTICS_APPLICATION_DATA_SCHEMA
);
const APPLICATION_ONLY_TOOL_BY_NAME = new Map([
  [EXPERIMENT_APPLICATION_TOOL.name, EXPERIMENT_APPLICATION_TOOL],
  [EXPERIMENT_ENROLLMENT_TOOL.name, EXPERIMENT_ENROLLMENT_TOOL],
  [ANALYTICS_APPLICATION_TOOL.name, ANALYTICS_APPLICATION_TOOL]
]);

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
  "consultarBibliotecaDeResources",
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
    if (definition.propertyNames) {
      Object.keys(value).forEach((property) => validateValue(
        property,
        definition.propertyNames,
        `${field}.${property}`
      ));
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
        "cardJson deve conter um único envelope JSON de card com packages."
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

export function authoringApplicationToolDefinition(name) {
  return APPLICATION_ONLY_TOOL_BY_NAME.get(name) || TOOL_BY_NAME.get(name) || null;
}

export function validateAuthoringMcpToolOutput(name, value) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) {
    throw new AuthoringApiError(404, "unknown_tool", "Ferramenta inexistente.");
  }
  validateValue(value, definition.outputSchema, "result");
  return value;
}

export function validateAuthoringApplicationToolOutput(name, value) {
  const definition = authoringApplicationToolDefinition(name);
  if (!definition) {
    throw new AuthoringApiError(404, "unknown_tool", "Action interna inexistente.");
  }
  validateValue(value, definition.outputSchema, "result");
  return value;
}

export function authoringMcpToolIsAllowed(name, principal, rawArguments = null) {
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
  if (name === "gerirDesenhoInstrucional") {
    const readAllowed = scopes.has("authoring:read")
      || scopes.has("authoring:private:read");
    const writeAllowed = scopes.has("authoring:write")
      || scopes.has("authoring:private:write");
    if (rawArguments == null) return readAllowed || writeAllowed;
    if (["read_slice", "contracts"].includes(rawArguments.operation)) {
      return readAllowed;
    }
    return writeAllowed;
  }
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

export function authoringApplicationToolIsAllowed(
  name,
  principal,
  rawArguments = null
) {
  if (!APPLICATION_ONLY_TOOL_BY_NAME.has(name)) {
    return authoringMcpToolIsAllowed(name, principal, rawArguments);
  }
  if (principal?.authenticationKind !== "application" || !principal?.actorId) {
    return false;
  }
  const scopes = new Set(principal.scopes || []);
  return scopes.has("*")
    || scopes.has("authoring:write")
    || scopes.has("authoring:private:write");
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

function mapExperimentApplicationCall(rawArguments) {
  const definition = APPLICATION_ONLY_TOOL_BY_NAME.get(
    "gerirExperimentoInstrucional"
  );
  const args = validateArguments(definition, rawArguments);
  const { workspaceId, operation } = args;
  const body = { operation };
  if (operation === "list" || operation === "list_options") {
    if (args.kind) body.kind = args.kind;
    if (args.query) body.query = args.query;
    if (args.experimentSetRef) body.experimentSetRef = args.experimentSetRef;
    if (args.optionsSetRef) body.optionsSetRef = args.optionsSetRef;
    if (args.cursor) body.cursor = args.cursor;
    if (args.limit != null) body.limit = args.limit;
  } else if (operation === "read") {
    body.experimentId = args.experimentId;
    body.section = args.section || "overview";
    if (args.protocolRevision != null) body.protocolRevision = args.protocolRevision;
    if (args.variantSetRef) body.variantSetRef = args.variantSetRef;
    if (args.variantCursor) body.variantCursor = args.variantCursor;
    if (args.variantLimit != null) body.variantLimit = args.variantLimit;
    if (args.differenceRunRef) body.differenceRunRef = args.differenceRunRef;
    if (args.differenceSetRef) body.differenceSetRef = args.differenceSetRef;
    if (args.differenceRunCursor) body.differenceRunCursor = args.differenceRunCursor;
    if (args.differenceRunLimit != null) body.differenceRunLimit = args.differenceRunLimit;
    if (args.differenceCursor) body.differenceCursor = args.differenceCursor;
    if (args.differenceLimit != null) body.differenceLimit = args.differenceLimit;
    if (args.participantSetRef) body.participantSetRef = args.participantSetRef;
    if (args.participantCursor) body.participantCursor = args.participantCursor;
    if (args.participantLimit != null) body.participantLimit = args.participantLimit;
  } else {
    body.requestId = args.requestId;
    body.expectedExperimentRevision = args.expectedExperimentRevision;
    if (args.expectedWorkspaceRevision != null) {
      body.expectedWorkspaceRevision = args.expectedWorkspaceRevision;
    }
    const payloadFields = {
      save_protocol: ["experimentId", "protocol"],
      validate: ["experimentId"],
      generate_variants: ["experimentId"],
      decide_difference: [
        "experimentId", "differenceRunRef", "differenceRef", "decision", "note",
        "participantContinuity"
      ],
      request_correction: [
        "experimentId", "variantRevisionRef", "reason", "participantContinuity"
      ],
      freeze: ["experimentId", "variantRevisionRef"],
      start_collection: ["experimentId"],
      rotate_enrollment_code: ["experimentId"],
      transition_collection: ["experimentId", "transition"],
      assign_participant: ["experimentId", "enrollmentRef", "conditionRef"]
    };
    body.payload = Object.fromEntries(
      payloadFields[operation]
        .filter((field) => args[field] != null)
        .map((field) => [field, args[field]])
    );
  }
  return {
    method: "POST",
    path: `/v1/workspaces/${encode(workspaceId)}/experiments/actions`,
    body,
    requestId: args.requestId ?? null
  };
}

function mapExperimentEnrollmentApplicationCall(rawArguments) {
  const definition = APPLICATION_ONLY_TOOL_BY_NAME.get(
    "ingressarEmExperimentoInstrucional"
  );
  const args = validateArguments(definition, rawArguments);
  const body = {
    operation: args.operation
  };
  if (args.enrollmentCode) body.enrollmentCode = args.enrollmentCode;
  if (args.enrollmentRef) body.enrollmentRef = args.enrollmentRef;
  if (args.requestId) body.requestId = args.requestId;
  if (args.consentPolicyRef) body.consentPolicyRef = args.consentPolicyRef;
  if (args.consentAcknowledged != null) {
    body.consentAcknowledged = args.consentAcknowledged;
  }
  for (const field of [
    "workspaceId", "instrumentRef", "outcomeRef", "wave", "valueKind", "value",
    "missingReason", "observedAt"
  ]) {
    if (args[field] != null) body[field] = args[field];
  }
  return {
    method: "POST",
    path: "/v1/experiments/enrollment/actions",
    body,
    requestId: args.requestId ?? null
  };
}

function mapAnalyticsApplicationCall(rawArguments) {
  const definition = APPLICATION_ONLY_TOOL_BY_NAME.get(
    "consultarAnalyticsInstrucional"
  );
  const args = validateArguments(definition, rawArguments);
  const { workspaceId, ...body } = args;
  return {
    method: "POST",
    path: `/v1/workspaces/${encode(workspaceId)}/analytics/actions`,
    body,
    requestId: null
  };
}

export function mapAuthoringApplicationToolCall(name, rawArguments) {
  if (name === "gerirExperimentoInstrucional") {
    return mapExperimentApplicationCall(rawArguments);
  }
  if (name === "ingressarEmExperimentoInstrucional") {
    return mapExperimentEnrollmentApplicationCall(rawArguments);
  }
  if (name === "consultarAnalyticsInstrucional") {
    return mapAnalyticsApplicationCall(rawArguments);
  }
  return mapAuthoringMcpToolCall(name, rawArguments);
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) throw new AuthoringApiError(404, "unknown_tool", "Ferramenta inexistente.");
  let args = validateArguments(definition, rawArguments);
  if (GROUPED_OPERATION_TARGETS[name]) {
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
  if (name === "consultarBibliotecaDeResources") {
    return {
      kind: "resource-library",
      body: args,
      requestId: null
    };
  }
  if (name === "gerirDesenhoInstrucional") {
    const { workspaceId, operation } = args;
    const body = { operation };
    if (args.microsequencePath) body.microsequencePath = args.microsequencePath;
    if (args.view) body.view = args.view;
    if (args.resourceSetRef) body.resourceSetRef = args.resourceSetRef;
    if (args.auditRunRef) body.auditRunRef = args.auditRunRef;
    if (args.auditScope) body.auditScope = args.auditScope;
    if (args.experimentRef) body.experimentRef = args.experimentRef;
    if (args.variantRevisionRef) body.variantRevisionRef = args.variantRevisionRef;
    if (args.variantSetRef) body.variantSetRef = args.variantSetRef;
    if (args.differenceRunRef) body.differenceRunRef = args.differenceRunRef;
    if (args.collection) body.collection = args.collection;
    if (args.collectionSetRef) body.collectionSetRef = args.collectionSetRef;
    if (args.collectionCursor) body.collectionCursor = args.collectionCursor;
    if (args.collectionLimit != null) body.collectionLimit = args.collectionLimit;
    if (args.cursor) body.cursor = args.cursor;
    if (args.limit != null) body.limit = args.limit;
    if (args.componentCursor) body.componentCursor = args.componentCursor;
    if (args.componentLimit != null) body.componentLimit = args.componentLimit;
    if (args.contractName) body.contractName = args.contractName;
    if (args.requestId) body.requestId = args.requestId;
    if (args.expectedRevision != null) {
      body.expectedRevision = args.expectedRevision;
    }
    if (args.payloadJson != null) {
      try {
        body.payload = JSON.parse(args.payloadJson);
      } catch {
        throw new AuthoringApiError(
          422,
          "invalid_tool_arguments",
          "payloadJson deve conter JSON válido."
        );
      }
      if (!body.payload || typeof body.payload !== "object"
          || Array.isArray(body.payload)) {
        throw new AuthoringApiError(
          422,
          "invalid_tool_arguments",
          "payloadJson deve serializar um objeto canônico."
        );
      }
    }
    return {
      method: "POST",
      path: `/v1/workspaces/${encode(workspaceId)}/design/actions`,
      body,
      requestId: args.requestId ?? null
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
