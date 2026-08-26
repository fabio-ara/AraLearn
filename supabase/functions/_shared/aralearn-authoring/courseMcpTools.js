import { AuthoringApiError } from "./errors.js";
import { COURSE_COMPONENT_CATALOG_VERSION } from
  "../aralearn/runtime/domain/courseDesignParameters.js";
import {
  COURSE_ANCHORED_ANNOTATION_CATEGORIES,
  COURSE_ANCHORED_ANNOTATION_CHANNELS,
  COURSE_ANCHORED_ANNOTATION_ORIGINS,
  COURSE_ANCHORED_ANNOTATION_STATES,
  COURSE_ANCHORED_ANNOTATION_TARGET_KINDS,
  CourseAnchoredAnnotationsError,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../aralearn/runtime/domain/courseAnchoredAnnotations.js";
import {
  COURSE_AUDIT_ADEQUACY,
  COURSE_AUDIT_DIMENSIONS,
  COURSE_AUDIT_FINDING_STATES,
  COURSE_AUDIT_HUMAN_DIMENSIONS,
  COURSE_AUDIT_ORIGINS,
  COURSE_AUDIT_RESULTS,
  COURSE_AUDIT_SEVERITIES,
  CourseAuditCycleError,
  normalizeCourseAuditCycleCommand,
  normalizeCourseAuditCycleReadOptions
} from "../aralearn/runtime/domain/courseAuditCycle.js";
import {
  CourseVariantError,
  normalizeCourseVariantCommand,
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantRead
} from "../aralearn/runtime/domain/courseVariants.js";
import {
  COURSE_AUTHORING_ANALYTICS_CHANNELS,
  COURSE_AUTHORING_ANALYTICS_DATASETS,
  CourseAuthoringAnalyticsError,
  normalizeCourseAuthoringAnalyticsQuery
} from "../aralearn/runtime/domain/courseAuthoringAnalytics.js";
import { courseMcpAppToolMeta } from "./courseMcpAppResource.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const COMPONENT_REF_PATTERN = /^[a-z][a-z0-9._-]{2,119}@[0-9]+\.[0-9]+\.[0-9]+$/u;
const RFC3339_PATTERN =
  "^(?!0000-)\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])" +
  "T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?" +
  "(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$";
const ANCHORED_ANNOTATIONS_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;
const AUDIT_CYCLE_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;
const AUTHORING_ANALYTICS_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;
const MCP_OAUTH_SECURITY_SCHEMES = Object.freeze([
  Object.freeze({ type: "oauth2", scopes: Object.freeze(["offline_access"]) })
]);

const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required
});

const forbidFields = (fields) => ({
  not: { anyOf: fields.map((field) => ({ required: [field] })) }
});

const stringSchema = (options = {}) => ({ type: "string", ...options });
const uuidSchema = stringSchema({ pattern: UUID_PATTERN.source });
const requestIdSchema = stringSchema({ pattern: REQUEST_ID_PATTERN.source });
const nullableString = (schema) => ({ anyOf: [schema, { type: "null" }] });
const COURSE_SOURCE_NO_CONTROL_PATTERN =
  "^(?!\\s)(?![\\s\\S]*\\s$)[^\\u0000-\\u001F\\u007F-\\u009F]+$";
const COURSE_SOURCE_LAYOUT_TEXT_PATTERN =
  "^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]+$";
const COURSE_SOURCE_TRIMMED_LAYOUT_TEXT_PATTERN =
  "^(?!\\s)(?![\\s\\S]*\\s$)[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]+$";
const courseSourceOpaqueIdSchema = stringSchema({
  minLength: 1,
  maxLength: 240,
  pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
});
const legacySourceIdSchema = stringSchema({
  minLength: 1,
  maxLength: 2_048,
  pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F]+$"
});
const anchoredAnnotationSourceIdSchema = stringSchema({
  minLength: 1,
  maxLength: 2_048,
  pattern: "^(?=[\\s\\S]*\\S)[^\\u0000-\\u001F\\u007F-\\u009F]+$"
});

const anchoredAnnotationOpaqueIdSchema = stringSchema({
  minLength: 1,
  maxLength: 240,
  pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
});
const anchoredAnnotationLayoutTextSchema = stringSchema({
  minLength: 1,
  maxLength: 2_000,
  pattern: COURSE_SOURCE_LAYOUT_TEXT_PATTERN
});
const anchoredAnnotationCategorySchema = {
  anyOf: [
    stringSchema({ enum: [...COURSE_ANCHORED_ANNOTATION_CATEGORIES] }),
    { type: "null" }
  ]
};
const anchoredAnnotationTargetSchema = {
  ...objectSchema({
    kind: stringSchema({ enum: [...COURSE_ANCHORED_ANNOTATION_TARGET_KINDS] }),
    id: legacySourceIdSchema
  }),
  allOf: [{
    if: { properties: { kind: { const: "course" } }, required: ["kind"] },
    then: { properties: { id: uuidSchema } }
  }, {
    if: { properties: { kind: { const: "source" } }, required: ["kind"] },
    then: { properties: { id: anchoredAnnotationSourceIdSchema } },
    else: { properties: { id: anchoredAnnotationOpaqueIdSchema } }
  }]
};

const sourceAnchorLinkSchema = objectSchema({
  anchorId: courseSourceOpaqueIdSchema,
  anchorRevision: { type: "integer", minimum: 1 }
});
const sourceLinkSchema = {
  ...objectSchema({
    sourceId: legacySourceIdSchema,
    sourceRevision: { type: "integer", minimum: 1 },
    relation: stringSchema({ enum: [
      "informed_by", "supported_by", "adapted_from", "quoted_from",
      "contrasted_with", "exemplified_by", "inspired_by", "needs_verification"
    ] }),
    anchors: {
      type: "array", minItems: 1, maxItems: 8, uniqueItems: true,
      items: sourceAnchorLinkSchema
    }
  }),
  allOf: [{
    if: { properties: { relation: { const: "quoted_from" } }, required: ["relation"] },
    then: { properties: { anchors: { minItems: 1 } } }
  }]
};
const sourceLinksSchema = {
  type: "array", maxItems: 32, uniqueItems: true, items: sourceLinkSchema
};
const sourceLinksSchemaReference = { $ref: "#/$defs/sourceLinks" };

const anchoredAnnotationCommandSchema = {
  oneOf: [
    objectSchema({
      type: { const: "create_anchored_annotation" },
      annotationId: uuidSchema,
      target: anchoredAnnotationTargetSchema,
      rawText: anchoredAnnotationLayoutTextSchema,
      category: anchoredAnnotationCategorySchema,
      capturedAt: { anyOf: [stringSchema({ pattern: RFC3339_PATTERN }), { type: "null" }] },
      briefSummary: stringSchema({
        minLength: 1,
        maxLength: 500,
        pattern: COURSE_SOURCE_LAYOUT_TEXT_PATTERN
      }),
      confirmed: { type: "boolean", const: true }
    }),
    objectSchema({
      type: { const: "revise_anchored_annotation" },
      annotationId: uuidSchema,
      expectedAnnotationVersion: { type: "integer", minimum: 1 },
      rawText: anchoredAnnotationLayoutTextSchema,
      category: anchoredAnnotationCategorySchema,
      briefSummary: {
        anyOf: [
          stringSchema({
            minLength: 1,
            maxLength: 500,
            pattern: COURSE_SOURCE_LAYOUT_TEXT_PATTERN
          }),
          { type: "null" }
        ]
      }
    }),
    ...[
      "withdraw_anchored_annotation",
      "consider_anchored_annotation",
      "resolve_anchored_annotation",
      "reopen_anchored_annotation"
    ].map((type) => objectSchema({
      type: { const: type },
      annotationId: uuidSchema,
      expectedAnnotationVersion: { type: "integer", minimum: 1 }
    })),
    {
      ...objectSchema({
      type: { const: "respond_to_anchored_annotation" },
      annotationId: uuidSchema,
      expectedAnnotationVersion: { type: "integer", minimum: 1 },
      ownerResponse: anchoredAnnotationLayoutTextSchema,
      responseKind: stringSchema({ enum: ["answer", "reformulation"] }),
      consideredSourceLinks: sourceLinksSchemaReference
      }),
      allOf: [{
        if: {
          properties: { responseKind: { const: "reformulation" } },
          required: ["responseKind"]
        },
        then: { properties: { consideredSourceLinks: { minItems: 1 } } },
        else: { properties: { consideredSourceLinks: { maxItems: 0 } } }
      }]
    },
    objectSchema({
      type: { const: "correct_anchored_annotation_subjects" },
      annotationId: uuidSchema,
      expectedAnnotationVersion: { type: "integer", minimum: 1 },
      subjectIds: {
        type: "array",
        maxItems: 64,
        uniqueItems: true,
        items: anchoredAnnotationOpaqueIdSchema
      }
    })
  ]
};

const sourceSelectorSchema = {
  oneOf: [
    objectSchema({
      kind: { const: "page_range" },
      startPage: { type: "integer", minimum: 1, maximum: 1_000_000 },
      endPage: { type: "integer", minimum: 1, maximum: 1_000_000 }
    }),
    objectSchema({
      kind: { const: "time_range" },
      startMilliseconds: { type: "integer", minimum: 0, maximum: 2_147_483_647 },
      endMilliseconds: { type: "integer", minimum: 1, maximum: 2_147_483_647 }
    }),
    objectSchema({
      kind: { const: "uri_fragment" },
      fragment: stringSchema({
        minLength: 1,
        maxLength: 2_048,
        pattern: "^(?!#)(?!\\s)(?![\\s\\S]*\\s$)[^\\u0000-\\u001F\\u007F-\\u009F]+$"
      })
    }),
    objectSchema({
      kind: { const: "text_quote" },
      exact: stringSchema({
        minLength: 1, maxLength: 4_000, pattern: COURSE_SOURCE_LAYOUT_TEXT_PATTERN
      }),
      prefix: nullableString(stringSchema({
        minLength: 1, maxLength: 500, pattern: COURSE_SOURCE_TRIMMED_LAYOUT_TEXT_PATTERN
      })),
      suffix: nullableString(stringSchema({
        minLength: 1, maxLength: 500, pattern: COURSE_SOURCE_TRIMMED_LAYOUT_TEXT_PATTERN
      }))
    })
  ]
};

const sourceDocumentSchema = {
  ...objectSchema({
    kind: stringSchema({ enum: ["web_page", "article", "book", "document", "media", "other"] }),
    title: stringSchema({
      minLength: 1, maxLength: 300, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
    }),
    authorship: nullableString(stringSchema({
      minLength: 1, maxLength: 500, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
    })),
    publicationDate: nullableString(stringSchema({
      pattern: "^[0-9]{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12][0-9]|3[01]))?)?$"
    })),
    identifier: nullableString(stringSchema({
      minLength: 1, maxLength: 240, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
    })),
    language: nullableString(stringSchema({
      maxLength: 35,
      pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$"
    })),
    citationText: nullableString(stringSchema({
      minLength: 1, maxLength: 2_048, pattern: COURSE_SOURCE_TRIMMED_LAYOUT_TEXT_PATTERN
    })),
    url: nullableString(stringSchema({ minLength: 8, maxLength: 2_048, pattern: "^https://[^\\s]+$" })),
    editionOrVersion: nullableString(stringSchema({
      minLength: 1, maxLength: 120, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
    })),
    origin: stringSchema({ enum: ["external", "author_provided", "imported_legacy"] }),
    availability: stringSchema({ enum: ["open_access", "restricted", "private", "unknown"] }),
    verificationStatus: stringSchema({ enum: ["unverified", "author_verified"] }),
    studyVisibility: stringSchema({ enum: ["hidden", "citation", "citation_and_link"] })
  }),
  allOf: [{
    if: {
      properties: { studyVisibility: { enum: ["citation", "citation_and_link"] } },
      required: ["studyVisibility"]
    },
    then: { properties: { citationText: {
      type: "string",
      minLength: 1,
      maxLength: 2_048,
      pattern: COURSE_SOURCE_TRIMMED_LAYOUT_TEXT_PATTERN
    } } }
  }]
};

const sourceCommandSchema = {
  oneOf: [
    objectSchema({
      type: { const: "save_source" },
      sourceId: legacySourceIdSchema,
      expectedSourceRevision: { type: "integer", minimum: 0 },
      source: sourceDocumentSchema
    }),
    objectSchema({
      type: { const: "retire_source" },
      sourceId: legacySourceIdSchema,
      expectedSourceRevision: { type: "integer", minimum: 1 }
    }),
    objectSchema({
      type: { const: "save_anchor" },
      anchorId: courseSourceOpaqueIdSchema,
      sourceId: legacySourceIdSchema,
      sourceRevision: { type: "integer", minimum: 1 },
      expectedAnchorRevision: { type: "integer", minimum: 0 },
      selector: sourceSelectorSchema,
      humanLocator: nullableString(stringSchema({
        minLength: 1, maxLength: 500, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
      })),
      verificationExcerpt: nullableString(stringSchema({
        minLength: 1, maxLength: 2_000, pattern: COURSE_SOURCE_LAYOUT_TEXT_PATTERN
      }))
    }, ["type", "anchorId", "sourceId", "sourceRevision", "expectedAnchorRevision", "selector", "verificationExcerpt"]),
    objectSchema({
      type: { const: "retire_anchor" },
      anchorId: courseSourceOpaqueIdSchema,
      expectedAnchorRevision: { type: "integer", minimum: 1 }
    }),
    objectSchema({
      type: { const: "attach_pdf" },
      sourceId: legacySourceIdSchema,
      sourceRevision: { type: "integer", minimum: 1 },
      attachment: objectSchema({
        contentHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
        byteSize: { type: "integer", minimum: 1, maximum: 20 * 1024 * 1024 },
        mediaType: { const: "application/pdf" },
        storagePath: stringSchema({
          pattern: "^[0-9a-f-]{36}/[a-f0-9]{64}\\.pdf$"
        })
      })
    }),
    objectSchema({
      type: { const: "set_target_sources" },
      targetKind: stringSchema({ enum: ["plan_item", "study_unit"] }),
      targetId: legacySourceIdSchema,
      expectedTargetVersion: { type: "integer", minimum: 1 },
      sourceLinks: sourceLinksSchemaReference
    })
  ]
};

const auditCodeSchema = stringSchema({
  minLength: 3,
  maxLength: 120,
  pattern: "^[a-z][a-z0-9._:-]{2,119}$"
});
const auditLayoutTextSchema = (maximum) => stringSchema({
  minLength: 1,
  maxLength: maximum,
  pattern: COURSE_SOURCE_LAYOUT_TEXT_PATTERN
});
const auditMethodSchema = objectSchema({
  id: stringSchema({ minLength: 1, maxLength: 200, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN }),
  version: stringSchema({ minLength: 1, maxLength: 80, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN })
});
const auditCheckSchema = objectSchema({
  checkId: uuidSchema,
  dimension: stringSchema({ enum: [...COURSE_AUDIT_HUMAN_DIMENSIONS] }),
  criterion: objectSchema({
    code: auditCodeSchema,
    version: stringSchema({
      minLength: 1, maxLength: 80, pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
    }),
    statement: auditLayoutTextSchema(1_000)
  }),
  result: stringSchema({ enum: [...COURSE_AUDIT_RESULTS] }),
  publicEvidence: auditLayoutTextSchema(2_000),
  adequacy: stringSchema({ enum: [...COURSE_AUDIT_ADEQUACY] }),
  planItemRefs: {
    type: "array", maxItems: 16, uniqueItems: true,
    items: objectSchema({
      planItemId: uuidSchema,
      version: { type: "integer", minimum: 1 }
    })
  },
  parameterRefs: {
    type: "array", maxItems: 8, uniqueItems: true,
    items: objectSchema({
      parameterId: stringSchema({
        minLength: 1, maxLength: 160, pattern: "^[a-z][a-z0-9_]{0,159}$"
      }),
      changeId: {
        anyOf: [stringSchema({ pattern: "^[1-9][0-9]{0,18}$" }), { type: "null" }]
      }
    })
  },
  sourceLinks: sourceLinksSchemaReference
});
const auditChecksSchema = {
  type: "array", minItems: 3, maxItems: 31, uniqueItems: true,
  items: auditCheckSchema
};
const auditFindingInputSchema = objectSchema({
  findingId: uuidSchema,
  checkId: uuidSchema,
  code: auditCodeSchema,
  severity: stringSchema({ enum: [...COURSE_AUDIT_SEVERITIES] }),
  annotationRefs: {
    type: "array", maxItems: 12, uniqueItems: true,
    items: objectSchema({
      annotationId: uuidSchema,
      annotationVersion: { type: "integer", minimum: 1 }
    })
  }
});
const auditCommandRefsSchema = {
  findingId: uuidSchema,
  expectedFindingVersion: { type: "integer", minimum: 1 },
  correctionId: uuidSchema,
  expectedCorrectionVersion: { type: "integer", minimum: 1 }
};
const auditCommandSchema = {
  oneOf: [
    objectSchema({
      type: { const: "record_audit" },
      auditRunId: uuidSchema,
      targetStudyUnitId: anchoredAnnotationOpaqueIdSchema,
      contextHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
      origin: stringSchema({ enum: [...COURSE_AUDIT_ORIGINS] }),
      method: auditMethodSchema,
      checks: auditChecksSchema,
      findings: {
        type: "array", maxItems: 15, uniqueItems: true,
        items: auditFindingInputSchema
      }
    }),
    objectSchema({
      type: { const: "propose_authoring_correction" },
      correctionId: uuidSchema,
      findingId: uuidSchema,
      expectedFindingVersion: { type: "integer", minimum: 1 },
      expectedCorrectionVersion: { type: "integer", minimum: 0 },
      afterContent: { type: "object" },
      afterSourceLinks: sourceLinksSchemaReference,
      rationale: auditLayoutTextSchema(2_000)
    }),
    objectSchema({
      type: { const: "reject_authoring_correction" },
      ...auditCommandRefsSchema
    }),
    ...["apply_authoring_correction", "rollback_authoring_correction"].map((type) => objectSchema({
      type: { const: type },
      ...auditCommandRefsSchema,
      confirmed: { type: "boolean", const: true }
    })),
    objectSchema({
      type: { const: "decide_finding" },
      findingId: uuidSchema,
      expectedFindingVersion: { type: "integer", minimum: 1 },
      decision: stringSchema({ enum: ["dismiss", "reopen"] })
    }),
    objectSchema({
      type: { const: "verify_finding" },
      auditRunId: uuidSchema,
      ...auditCommandRefsSchema,
      contextHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
      origin: stringSchema({ enum: [...COURSE_AUDIT_ORIGINS] }),
      method: auditMethodSchema,
      checks: auditChecksSchema,
      outcome: stringSchema({ enum: ["resolved", "still_open"] })
    })
  ]
};

const planItemKindSchema = stringSchema({ enum: [
  "intended_learning_outcome",
  "instructional_analysis_unit",
  "evidence_requirement"
] });
const planItemIdListSchema = (maximum) => ({
  type: "array", maxItems: maximum, uniqueItems: true, items: uuidSchema
});
const microsequenceIdSchema = stringSchema({ minLength: 1, maxLength: 240 });
const partIntentSchema = stringSchema({ maxLength: 4_000 });
const authoringPlanCommandSchema = {
  oneOf: [
    {
      ...objectSchema({
        type: { const: "update_plan" },
        title: stringSchema({ minLength: 1, maxLength: 300 }),
        objective: stringSchema({ minLength: 1, maxLength: 2_000 }),
        audience: stringSchema({ maxLength: 4_000 }),
        scope: stringSchema({ maxLength: 8_000 }),
        preferredPartCount: objectSchema({
          minimum: { type: "integer", minimum: 1, maximum: 64 },
          maximum: { type: "integer", minimum: 1, maximum: 64 },
          origin: stringSchema({ enum: ["automatic", "author", "research_condition"] })
        })
      }, ["type"]),
      anyOf: ["title", "objective", "audience", "scope", "preferredPartCount"]
        .map((field) => ({ required: [field] }))
    },
    objectSchema({
      type: { const: "add_plan_item" }, kind: planItemKindSchema, id: uuidSchema,
      position: { type: "integer", minimum: 0, maximum: 255 },
      statement: stringSchema({ minLength: 1, maxLength: 2_000 }),
      sourceLinks: sourceLinksSchemaReference
    }),
    objectSchema({
      type: { const: "update_plan_item" }, kind: planItemKindSchema, id: uuidSchema,
      statement: stringSchema({ minLength: 1, maxLength: 2_000 }),
      sourceLinks: sourceLinksSchemaReference
    }),
    objectSchema({ type: { const: "remove_plan_item" }, kind: planItemKindSchema, id: uuidSchema }),
    objectSchema({
      type: { const: "reorder_plan_items" }, kind: planItemKindSchema,
      orderedIds: planItemIdListSchema(256)
    }),
    objectSchema({
      type: { const: "add_part" }, id: uuidSchema,
      position: { type: "integer", minimum: 0, maximum: 63 },
      title: stringSchema({ minLength: 1, maxLength: 300 }), intent: partIntentSchema
    }, ["type", "id", "position", "title"]),
    objectSchema({
      type: { const: "update_part" }, id: uuidSchema,
      title: stringSchema({ minLength: 1, maxLength: 300 }), intent: partIntentSchema
    }, ["type", "id", "title"]),
    objectSchema({ type: { const: "remove_part" }, id: uuidSchema }),
    objectSchema({ type: { const: "reorder_parts" }, orderedIds: planItemIdListSchema(64) }),
    objectSchema({
      type: { const: "split_part" }, partId: uuidSchema, newPartId: uuidSchema,
      newPartPosition: { type: "integer", minimum: 0, maximum: 63 },
      title: stringSchema({ minLength: 1, maxLength: 300 }), intent: partIntentSchema,
      microsequenceIds: {
        type: "array", maxItems: 64, uniqueItems: true, items: microsequenceIdSchema
      }
    }, ["type", "partId", "newPartId", "newPartPosition", "title", "microsequenceIds"]),
    objectSchema({ type: { const: "join_parts" }, sourcePartId: uuidSchema, targetPartId: uuidSchema }),
    ...["assign_microsequence", "move_microsequence"].map((type) => objectSchema({
      type: { const: type }, partId: uuidSchema, microsequenceId: microsequenceIdSchema,
      position: { type: "integer", minimum: 0, maximum: 63 }
    })),
    objectSchema({ type: { const: "remove_microsequence" }, microsequenceId: microsequenceIdSchema })
  ]
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

const courseDesignScopeSchema = objectSchema({
  kind: stringSchema({ enum: [
    "course", "module", "lesson", "didactic_microsequence"
  ] }),
  ref: stringSchema({ minLength: 1, maxLength: 240 })
});
const courseDesignParameterScopeSchema = objectSchema({
  kind: stringSchema({ enum: ["course", "lesson", "didactic_microsequence"] }),
  ref: stringSchema({ minLength: 1, maxLength: 240 })
});

const explanationFormSchema = stringSchema({ enum: [
  "plain_definition", "concrete_example", "mechanism", "contrast",
  "application_condition", "limit_or_exception", "worked_example",
  "representation_link"
] });
const variationDimensionSchema = stringSchema({ enum: [
  "case_or_data", "context", "task_feature", "external_representation",
  "support_level"
] });
const parameterIdSchema = stringSchema({ enum: [
  "new_analysis_unit_ceiling_per_expository_study_unit",
  "required_explanation_forms",
  "minimum_distinct_practice_opportunities_per_evidence_requirement",
  "required_practice_variation_dimensions"
] });
const designWriteOriginSchema = stringSchema({ enum: [
  "automatic", "author", "research_condition"
] });
const explicitDesignWriteOriginSchema = stringSchema({ enum: [
  "author", "research_condition"
] });
const integerParameterValueSchema = { type: "integer", minimum: 1, maximum: 64 };
const explanationFormsParameterValueSchema = {
  type: "array", minItems: 1, maxItems: 8, uniqueItems: true,
  items: explanationFormSchema
};
const practiceVariationParameterValueSchema = {
  type: "array", minItems: 1, maxItems: 5, uniqueItems: true,
  items: variationDimensionSchema
};
const parameterValueSchema = {
  anyOf: [
    integerParameterValueSchema,
    explanationFormsParameterValueSchema,
    practiceVariationParameterValueSchema
  ]
};
const componentPolicySchema = objectSchema({
  catalogVersion: { const: COURSE_COMPONENT_CATALOG_VERSION },
  availability: stringSchema({ enum: ["all", "allow_only"] }),
  allowedRefs: {
    type: "array", maxItems: 32, uniqueItems: true,
    items: stringSchema({ pattern: COMPONENT_REF_PATTERN.source, maxLength: 160 })
  },
  excludedRefs: {
    type: "array", maxItems: 32, uniqueItems: true,
    items: stringSchema({ pattern: COMPONENT_REF_PATTERN.source, maxLength: 160 })
  },
  preferredRefs: {
    type: "array", maxItems: 32, uniqueItems: true,
    items: stringSchema({ pattern: COMPONENT_REF_PATTERN.source, maxLength: 160 })
  }
});
componentPolicySchema.allOf = [{
  if: {
    properties: { availability: { const: "all" } },
    required: ["availability"]
  },
  then: { properties: { allowedRefs: { maxItems: 0 } } }
}, {
  if: {
    properties: { availability: { const: "allow_only" } },
    required: ["availability"]
  },
  then: { properties: { allowedRefs: { minItems: 1 } } }
}];
const courseVariantParameterDifferenceSchema = objectSchema({
  scopeKind: stringSchema({ enum: ["course", "lesson", "didactic_microsequence"] }),
  scopeId: stringSchema({ minLength: 1, maxLength: 240 }),
  parameterId: parameterIdSchema,
  value: parameterValueSchema,
  rationale: stringSchema({ minLength: 1, maxLength: 1_000 })
});
const courseVariantCommandSchema = {
  oneOf: [
    objectSchema({
      type: { const: "create_comparison_variants" },
      comparisonSetId: uuidSchema,
      expectedCourseRevision: { type: "integer", minimum: 1 },
      variants: {
        type: "array", minItems: 2, maxItems: 8,
        items: objectSchema({
          label: stringSchema({ minLength: 1, maxLength: 80 }),
          title: stringSchema({ minLength: 1, maxLength: 300 }),
          goal: stringSchema({ minLength: 1, maxLength: 2_000 }),
          parameterDifferences: {
            type: "array", maxItems: 16,
            items: courseVariantParameterDifferenceSchema
          },
          componentPolicyDifference: {
            anyOf: [componentPolicySchema, { type: "null" }]
          }
        })
      }
    }),
    objectSchema({
      type: { const: "detach_comparison_variant" },
      comparisonSetId: uuidSchema,
      courseId: uuidSchema
    })
  ]
};
const courseDesignCommandSchema = {
  oneOf: [
    {
      ...objectSchema({
      type: { const: "set_parameter" },
      scope: courseDesignParameterScopeSchema,
      parameterId: parameterIdSchema,
      value: parameterValueSchema,
      mode: stringSchema({
        enum: ["automatic", "explicit"],
        description: "automatic delega a resolução; explicit fixa a origem autoral ou de pesquisa."
      }),
      origin: explicitDesignWriteOriginSchema,
      reason: stringSchema({
        minLength: 1,
        maxLength: 1_000,
        description: "Justificativa pública breve, sem raciocínio privado."
      })
      }, ["type", "scope", "parameterId", "value", "mode", "reason"]),
      allOf: [{
        if: {
          properties: { mode: { const: "automatic" } },
          required: ["mode"]
        },
        then: forbidFields(["origin"]),
        else: { required: ["origin"] }
      }, {
        if: {
          properties: { parameterId: { const:
            "new_analysis_unit_ceiling_per_expository_study_unit" } },
          required: ["parameterId"]
        },
        then: { properties: { value: integerParameterValueSchema } }
      }, {
        if: {
          properties: { parameterId: { const:
            "minimum_distinct_practice_opportunities_per_evidence_requirement" } },
          required: ["parameterId"]
        },
        then: { properties: { value: integerParameterValueSchema } }
      }, {
        if: {
          properties: { parameterId: { const: "required_explanation_forms" } },
          required: ["parameterId"]
        },
        then: { properties: { value: explanationFormsParameterValueSchema } }
      }, {
        if: {
          properties: { parameterId: { const:
            "required_practice_variation_dimensions" } },
          required: ["parameterId"]
        },
        then: { properties: { value: practiceVariationParameterValueSchema } }
      }]
    },
    objectSchema({
      type: { const: "clear_parameter" },
      scope: courseDesignParameterScopeSchema,
      parameterId: parameterIdSchema
    }),
    objectSchema({
      type: { const: "set_guidance" },
      scope: courseDesignScopeSchema,
      guidance: stringSchema({ minLength: 1, maxLength: 8_192 }),
      origin: designWriteOriginSchema,
      reason: stringSchema({ minLength: 1, maxLength: 1_000 })
    }),
    objectSchema({
      type: { const: "clear_guidance" },
      scope: courseDesignScopeSchema
    }),
    objectSchema({
      type: { const: "interpret_guidance" },
      guidanceRevisionId: uuidSchema,
      interpretation: objectSchema({
        summary: stringSchema({ minLength: 1, maxLength: 1_000 }),
        directives: {
          type: "array",
          maxItems: 16,
          uniqueItems: true,
          items: objectSchema({
            kind: stringSchema({ enum: ["require", "avoid", "prefer"] }),
            statement: stringSchema({ minLength: 1, maxLength: 500 })
          })
        },
        divergences: {
          type: "array", maxItems: 16, uniqueItems: true,
          items: stringSchema({ minLength: 1, maxLength: 500 })
        },
        questions: {
          type: "array", maxItems: 16, uniqueItems: true,
          items: stringSchema({ minLength: 1, maxLength: 500 })
        }
      })
    }),
    objectSchema({
      type: { const: "set_component_policy" },
      scope: courseDesignScopeSchema,
      policy: componentPolicySchema,
      origin: designWriteOriginSchema,
      reason: stringSchema({ minLength: 1, maxLength: 1_000 })
    }),
    objectSchema({
      type: { const: "clear_component_policy" },
      scope: courseDesignScopeSchema
    }),
    objectSchema({
      type: { const: "set_target_plan_items" },
      scope: objectSchema({
        kind: { const: "didactic_microsequence" },
        ref: stringSchema({ minLength: 1, maxLength: 240 })
      }),
      instructionalAnalysisUnitIds: {
        type: "array", maxItems: 256, uniqueItems: true, items: uuidSchema
      },
      evidenceRequirementIds: {
        type: "array", maxItems: 256, uniqueItems: true, items: uuidSchema
      }
    })
  ]
};

const entityTextListSchema = {
  type: "array", maxItems: 256, items: stringSchema({ minLength: 1, maxLength: 2_000 })
};
const courseGuideSchema = objectSchema({
  goal: stringSchema({ minLength: 1, maxLength: 8_000 }),
  include: entityTextListSchema,
  exclude: entityTextListSchema,
  notation: entityTextListSchema,
  avoid: entityTextListSchema
});
const courseModuleContentSchema = objectSchema({
  title: stringSchema({ minLength: 1, maxLength: 300 }),
  guide: courseGuideSchema
});
const courseLessonContentSchema = objectSchema({
  title: stringSchema({ minLength: 1, maxLength: 300 }),
  guide: courseGuideSchema
});
const courseTopicContentSchema = objectSchema({
  label: stringSchema({ minLength: 1, maxLength: 2_000 }),
  kind: stringSchema({ enum: ["concept", "procedure", "representation", "term"] }),
  checks: entityTextListSchema,
  errors: entityTextListSchema
});
const courseMicrosequenceContentSchema = objectSchema({
  title: stringSchema({ minLength: 1, maxLength: 300 }),
  goal: stringSchema({ minLength: 1, maxLength: 8_000 }),
  role: stringSchema({ enum: ["explain", "practice", "review", "support"] }),
  branchOf: nullableString(stringSchema({ minLength: 1, maxLength: 240 })),
  dependsOn: entityTextListSchema,
  covers: entityTextListSchema,
  checks: entityTextListSchema,
  errors: entityTextListSchema
}, ["title", "goal", "role", "dependsOn", "covers", "checks"]);
const courseEntityIdSchema = stringSchema({ minLength: 1, maxLength: 240 });
const courseEntitySchemaFor = ({ entityType, parentType, positionMinimum = 0, content }) => objectSchema({
  entityType: { const: entityType },
  entityId: courseEntityIdSchema,
  parentType: parentType == null ? { type: "null" } : { const: parentType },
  parentId: parentType == null ? { type: "null" } : courseEntityIdSchema,
  position: { type: "integer", minimum: positionMinimum },
  content
});
const courseEntitySchema = {
  oneOf: [
    courseEntitySchemaFor({ entityType: "module", parentType: null, content: courseModuleContentSchema }),
    courseEntitySchemaFor({ entityType: "lesson", parentType: "module", content: courseLessonContentSchema }),
    courseEntitySchemaFor({ entityType: "topic", parentType: "lesson", content: courseTopicContentSchema }),
    courseEntitySchemaFor({
      entityType: "microsequence", parentType: "lesson", content: courseMicrosequenceContentSchema
    }),
    courseEntitySchemaFor({
      entityType: "study_unit", parentType: "microsequence", positionMinimum: 1,
      content: {
        type: "object",
        description: "Conteúdo validado pelo contrato consultado; id e position ficam no invólucro."
      }
    })
  ]
};
const courseEntitySchemaReference = { $ref: "#/$defs/courseEntity" };
const courseEntityDeleteSchema = objectSchema({
  entityType: stringSchema({
    enum: ["module", "lesson", "topic", "microsequence", "study_unit"]
  }),
  entityId: stringSchema({ minLength: 1, maxLength: 240 })
});
const courseEntityDeleteSchemaReference = { $ref: "#/$defs/courseEntityDelete" };

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
materializationStepSchema.allOf = [{
  if: {
    properties: { kind: { const: "didactic_microsequence_materialization" } },
    required: ["kind"]
  },
  then: {
    properties: {
      targetDidacticMicrosequenceId: stringSchema({ minLength: 1, maxLength: 240 }),
      productionPosition: { type: "integer", minimum: 0, maximum: 63 }
    }
  },
  else: {
    properties: {
      targetDidacticMicrosequenceId: { type: "null" },
      productionPosition: { type: "null" }
    }
  }
}];

const designApplicationSchema = objectSchema({
  contextHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
  didacticMicrosequenceId: stringSchema({ minLength: 1, maxLength: 240 }),
  studyUnits: {
    type: "array",
    maxItems: 64,
    items: objectSchema({
      studyUnitId: stringSchema({ minLength: 1, maxLength: 240 }),
      mode: stringSchema({ enum: ["expository", "practice", "mixed"] }),
      introducedInstructionalAnalysisUnitIds: {
        type: "array", maxItems: 256, uniqueItems: true, items: uuidSchema
      },
      explanationApplications: {
        type: "array",
        maxItems: 256,
        items: objectSchema({
          instructionalAnalysisUnitId: uuidSchema,
          developedForms: {
            type: "array", maxItems: 8, uniqueItems: true, items: explanationFormSchema
          },
          notApplicable: {
            type: "array",
            maxItems: 8,
            items: objectSchema({
              form: explanationFormSchema,
              reason: stringSchema({ minLength: 1, maxLength: 240 })
            })
          }
        })
      },
      practiceApplications: {
        type: "array",
        maxItems: 256,
        items: objectSchema({
          evidenceRequirementId: uuidSchema,
          opportunityId: stringSchema({ minLength: 1, maxLength: 120 }),
          invariantTaskOperation: stringSchema({ minLength: 1, maxLength: 240 }),
          variedDimensions: {
            type: "array", maxItems: 5, uniqueItems: true, items: variationDimensionSchema
          }
        })
      },
      componentRefs: {
        type: "array",
        maxItems: 32,
        uniqueItems: true,
        items: stringSchema({ pattern: COMPONENT_REF_PATTERN.source, maxLength: 160 }),
        description: "Refs package@version usados na mesma Unidade de entityChanges."
      }
    })
  }
});
designApplicationSchema.description =
  "Na conclusão didática, descreve as mesmas Unidades de entityChanges.";

const sourceAttributionStudyUnitSchema = objectSchema({
  studyUnitId: stringSchema({ minLength: 1, maxLength: 240 }),
  sourceLinks: sourceLinksSchemaReference
});
const sourceAttributionApplicationsSchema = {
  type: "array",
  maxItems: 64,
  items: sourceAttributionStudyUnitSchema
};
const sourceAttributionApplicationsSchemaReference = {
  $ref: "#/$defs/sourceAttributionApplications"
};
const sourceAttributionApplicationSchema = objectSchema({
  contract: { const: "aralearn.course-source-attribution-application.v1" },
  contextHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
  didacticMicrosequenceId: stringSchema({ minLength: 1, maxLength: 240 }),
  studyUnits: sourceAttributionApplicationsSchemaReference
});
sourceAttributionApplicationSchema.description =
  "Na conclusão didática, atribui Fontes às mesmas Unidades do lote.";

const materializationCommandSchema = {
  ...objectSchema({
  operation: stringSchema({ enum: ["start", "record_step", "finish"] }),
  authoringPartId: uuidSchema,
  materializationId: uuidSchema,
  expectedMaterializationVersion: { type: "integer", minimum: 0 },
  authoringPartVersion: { type: "integer", minimum: 1 },
  steps: { type: "array", minItems: 1, maxItems: 64, items: materializationStepSchema },
  stepId: uuidSchema,
  expectedStepVersion: { type: "integer", minimum: 1 },
  status: stringSchema({ enum: ["completed", "failed"] }),
  resultFacts: {
    type: "object",
    ...forbidFields([
      "designApplication", "sourceAttributionApplication", "entityChanges", "content"
    ])
  },
  designApplication: nullableString(designApplicationSchema),
  sourceAttributionApplication: nullableString(sourceAttributionApplicationSchema),
  entityChanges: {
    ...objectSchema({
    upserts: { type: "array", maxItems: 64, items: courseEntitySchemaReference },
    deletes: {
      type: "array",
      maxItems: 64,
      items: courseEntityDeleteSchemaReference
    }
    }),
    description: "Lote atômico da etapa. Na conclusão, os IDs coincidem com as duas aplicações."
  }
  }, ["operation", "authoringPartId", "materializationId", "expectedMaterializationVersion"]),
  allOf: [{
    if: { properties: { operation: { const: "start" } }, required: ["operation"] },
    then: {
      required: ["authoringPartVersion", "steps"],
      properties: { expectedMaterializationVersion: { const: 0 } },
      ...forbidFields([
        "stepId", "expectedStepVersion", "status", "resultFacts",
        "designApplication", "sourceAttributionApplication", "entityChanges"
      ])
    }
  }, {
    if: { properties: { operation: { const: "record_step" } }, required: ["operation"] },
    then: {
      required: [
        "stepId", "expectedStepVersion", "status", "resultFacts", "entityChanges",
        "designApplication", "sourceAttributionApplication"
      ],
      properties: { expectedMaterializationVersion: { minimum: 1 } },
      ...forbidFields(["authoringPartVersion", "steps"])
    }
  }, {
    if: { properties: { operation: { const: "finish" } }, required: ["operation"] },
    then: {
      required: ["status", "resultFacts"],
      properties: { expectedMaterializationVersion: { minimum: 1 } },
      ...forbidFields([
        "authoringPartVersion", "steps", "stepId", "expectedStepVersion",
        "designApplication", "sourceAttributionApplication", "entityChanges"
      ])
    }
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
    description: "Lê uma vista delimitada do Curso vivo. Escolha o menor recorte necessário; a primeira página pertinente inclui phaseGuidance focal. Preserve revisões e deep links. Texto integral de Observação e download temporário de PDF exigem as declarações explícitas do schema.",
    inputSchema: {
      ...objectSchema({
      courseId: uuidSchema,
      view: stringSchema({ enum: [
        "summary", "outline", "instructional_plan", "course_design",
        "course_sources", "course_source_attachment", "anchored_annotations", "part_materialization",
        "study_units", "entities", "audit_cycle", "research",
        "variant_comparison", "variant_comparisons"
      ] }),
      authoringPartId: uuidSchema,
      materializationId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 200 },
      cursor: {
        anyOf: [
          courseEntityCursorSchema,
          courseStudyUnitCursorSchema,
          stringSchema({ minLength: 1, maxLength: 2_048 }),
          { type: "null" }
        ]
      },
      scope: { anyOf: [courseStudyUnitScopeSchema, courseDesignScopeSchema] },
      anchorStudyUnitId: stringSchema({ minLength: 1, maxLength: 240 }),
      direction: stringSchema({ enum: ["forward", "backward"] }),
      maxBytes: { type: "integer", minimum: 65_536, maximum: 1_500_000 },
      mode: stringSchema({ enum: [
        "catalog", "source", "target", "inbox", "detail", "context", "findings", "runs"
      ] }),
      sourceId: legacySourceIdSchema,
      attachmentOperation: stringSchema({ enum: ["download"] }),
      sourceRevision: { type: "integer", minimum: 1 },
      contentHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
      byteSize: { type: "integer", minimum: 1, maximum: 20 * 1024 * 1024 },
      mediaType: { const: "application/pdf" },
      targetKind: stringSchema({ enum: [
        "plan_item", ...COURSE_ANCHORED_ANNOTATION_TARGET_KINDS
      ] }),
      targetId: legacySourceIdSchema,
      annotationSetVersion: {
        anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }]
      },
      auditSetVersion: {
        anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }]
      },
      origins: {
        type: "array", maxItems: 16, uniqueItems: true,
        items: stringSchema({ pattern: "^[a-z][a-z0-9._:-]{0,79}$" })
      },
      channels: {
        type: "array", maxItems: 6, uniqueItems: true,
        items: stringSchema({ pattern: "^[a-z][a-z0-9._:-]{0,79}$" })
      },
      states: {
        type: "array", maxItems: 24, uniqueItems: true,
        items: stringSchema({ pattern: "^[a-z][a-z0-9._:-]{0,79}$" })
      },
      categories: {
        type: "array", maxItems: 5, uniqueItems: true,
        items: stringSchema({ enum: [...COURSE_ANCHORED_ANNOTATION_CATEGORIES] })
      },
      includeUncategorized: { type: "boolean" },
      subjectIds: {
        type: "array", maxItems: 16, uniqueItems: true,
        items: anchoredAnnotationOpaqueIdSchema
      },
      includeDescendants: { type: "boolean" },
      annotationId: uuidSchema,
      includeObservationText: { type: "boolean", const: true },
      includeAttachmentDownloadUrl: {
        type: "boolean",
        const: true,
        description: "Confirma o envio ao cliente MCP conectado de uma URL assinada de download, válida por 60 segundos e utilizável como credencial temporária."
      },
      targetStudyUnitId: anchoredAnnotationOpaqueIdSchema,
      findingId: uuidSchema,
      correctionId: uuidSchema,
      auditRunId: uuidSchema,
      dimensions: {
        type: "array", maxItems: 4, uniqueItems: true,
        items: stringSchema({ enum: [...COURSE_AUDIT_DIMENSIONS] })
      },
      severities: {
        type: "array", maxItems: 4, uniqueItems: true,
        items: stringSchema({ enum: [...COURSE_AUDIT_SEVERITIES] })
      },
      annotationIds: {
        type: "array", minItems: 1, maxItems: 12, uniqueItems: true, items: uuidSchema
      },
      comparisonSetId: uuidSchema,
      datasets: {
        type: "array", minItems: 1,
        maxItems: COURSE_AUTHORING_ANALYTICS_DATASETS.length,
        uniqueItems: true,
        items: stringSchema({ enum: [...COURSE_AUTHORING_ANALYTICS_DATASETS] })
      },
      from: stringSchema({ pattern: RFC3339_PATTERN }),
      to: stringSchema({ pattern: RFC3339_PATTERN })
      }, ["courseId"]),
      allOf: [{
        if: {
          properties: { view: { const: "part_materialization" } },
          required: ["view"]
        },
        then: {
          required: ["authoringPartId", "materializationId"],
          ...forbidFields([
            "expectedRevision", "limit", "cursor", "scope", "anchorStudyUnitId",
            "direction", "maxBytes"
          ])
        },
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
          properties: { view: { const: "variant_comparisons" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision"],
          ...forbidFields([
            "authoringPartId", "materializationId", "limit", "cursor", "scope",
            "anchorStudyUnitId", "direction", "maxBytes", "mode", "sourceId",
            "targetKind", "targetId", "comparisonSetId", "annotationSetVersion", "auditSetVersion",
            "origins", "channels", "states", "categories", "includeUncategorized",
            "subjectIds", "includeDescendants", "annotationId", "targetStudyUnitId",
            "findingId", "correctionId", "auditRunId", "dimensions", "severities", "annotationIds"
          ])
        }
      }, {
        if: {
          properties: { view: { const: "variant_comparison" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision", "comparisonSetId"],
          ...forbidFields([
            "authoringPartId", "materializationId", "limit", "cursor", "scope",
            "anchorStudyUnitId", "direction", "maxBytes", "mode", "sourceId",
            "targetKind", "targetId", "annotationSetVersion", "auditSetVersion",
            "origins", "channels", "states", "categories", "includeUncategorized",
            "subjectIds", "includeDescendants", "annotationId", "targetStudyUnitId",
            "findingId", "correctionId", "auditRunId", "dimensions", "severities",
            "annotationIds"
          ])
        },
        else: forbidFields(["comparisonSetId"])
      }, {
        if: {
          properties: { view: { const: "course_sources" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision"],
          ...forbidFields([
            "authoringPartId", "materializationId", "scope", "anchorStudyUnitId",
            "direction", "maxBytes"
          ]),
          properties: {
            mode: { enum: ["catalog", "source", "target"] },
            targetKind: { enum: ["plan_item", "study_unit"] },
            targetId: courseSourceOpaqueIdSchema,
            limit: { maximum: 24 },
            cursor: {
              anyOf: [
                stringSchema({ minLength: 1, maxLength: 240,
                  pattern: "^[A-Za-z0-9+/_-]+={0,2}$" }),
                { type: "null" }
              ]
            }
          },
          allOf: [{
            if: { properties: { mode: { const: "source" } }, required: ["mode"] },
            then: {
              required: ["sourceId"],
              allOf: [{
                if: { required: ["targetKind"] },
                then: { required: ["targetId"], ...forbidFields(["cursor"]) }
              }, {
                if: { required: ["targetId"] },
                then: { required: ["targetKind"], ...forbidFields(["cursor"]) }
              }]
            }
          }, {
            if: { properties: { mode: { const: "target" } }, required: ["mode"] },
            then: {
              required: ["targetKind", "targetId"],
              ...forbidFields(["sourceId"])
            }
          }, {
            if: {
              anyOf: [
                { not: { required: ["mode"] } },
                { properties: { mode: { const: "catalog" } }, required: ["mode"] }
              ]
            },
            then: { ...forbidFields(["sourceId", "targetKind", "targetId"]) }
          }]
        },
        else: {
          if: {
            properties: { view: { const: "course_source_attachment" } },
            required: ["view"]
          },
          then: {},
          else: forbidFields(["sourceId"])
        }
      }, {
        if: {
          properties: { view: { const: "course_source_attachment" } },
          required: ["view"]
        },
        then: {
          required: [
            "expectedRevision", "attachmentOperation", "sourceId",
            "sourceRevision", "contentHash", "includeAttachmentDownloadUrl"
          ],
          ...forbidFields([
            "authoringPartId", "materializationId", "limit", "cursor", "scope",
            "anchorStudyUnitId", "direction", "maxBytes", "mode", "targetKind",
            "targetId", "annotationSetVersion", "auditSetVersion", "origins",
            "channels", "states", "categories", "includeUncategorized",
            "subjectIds", "includeDescendants", "annotationId", "targetStudyUnitId",
            "findingId", "correctionId", "auditRunId", "dimensions", "severities",
            "annotationIds", "comparisonSetId"
          ]),
          ...forbidFields(["byteSize", "mediaType"])
        },
        else: forbidFields([
          "attachmentOperation", "sourceRevision", "contentHash", "byteSize", "mediaType",
          "includeAttachmentDownloadUrl"
        ])
      }, {
        if: {
          properties: { view: { const: "anchored_annotations" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision"],
          ...forbidFields([
            "authoringPartId", "materializationId", "scope", "anchorStudyUnitId",
            "direction", "maxBytes", "sourceId"
          ]),
          properties: {
            mode: { enum: ["inbox", "target", "detail"] },
            targetKind: { enum: [...COURSE_ANCHORED_ANNOTATION_TARGET_KINDS] },
            origins: {
              type: "array", maxItems: 5, uniqueItems: true,
              items: stringSchema({ enum: [...COURSE_ANCHORED_ANNOTATION_ORIGINS] })
            },
            channels: {
              type: "array", maxItems: 6, uniqueItems: true,
              items: stringSchema({ enum: [...COURSE_ANCHORED_ANNOTATION_CHANNELS] })
            },
            states: {
              type: "array", maxItems: 4, uniqueItems: true,
              items: stringSchema({ enum: [...COURSE_ANCHORED_ANNOTATION_STATES] })
            },
            limit: { maximum: 24 },
            cursor: {
              anyOf: [
                stringSchema({ minLength: 1, maxLength: 240,
                  pattern: "^[A-Za-z0-9+/_-]+={0,2}$" }),
                { type: "null" }
              ]
            }
          },
          allOf: [{
            if: { properties: { mode: { const: "target" } }, required: ["mode"] },
            then: { required: ["targetKind", "targetId"] }
          }, {
            if: { properties: { mode: { const: "detail" } }, required: ["mode"] },
            then: {
              required: ["annotationId", "includeObservationText"],
              ...forbidFields(["targetKind", "targetId", "includeDescendants"])
            },
            else: forbidFields(["annotationId", "includeObservationText"])
          }, {
            if: { required: ["targetKind"] },
            then: { required: ["targetId"] }
          }, {
            if: { required: ["targetId"] },
            then: { required: ["targetKind"] }
          }, {
            if: { required: ["includeDescendants"] },
            then: { required: ["targetKind", "targetId"] }
          }, {
            if: {
              properties: { targetKind: { const: "course" } },
              required: ["targetKind"]
            },
            then: { properties: { targetId: uuidSchema } }
          }, {
            if: {
              properties: { targetKind: { const: "source" } },
              required: ["targetKind"]
            },
            then: { properties: { targetId: anchoredAnnotationSourceIdSchema } },
            else: { properties: { targetId: courseSourceOpaqueIdSchema } }
          }]
        },
        else: forbidFields([
          "annotationSetVersion", "categories",
          "includeUncategorized", "subjectIds", "includeDescendants", "annotationId"
        ])
      }, {
        if: {
          properties: { view: { const: "audit_cycle" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision", "mode"],
          ...forbidFields([
            "authoringPartId", "materializationId", "scope", "anchorStudyUnitId",
            "direction", "maxBytes", "sourceId", "targetKind", "targetId",
            "annotationSetVersion", "origins", "channels", "categories",
            "includeUncategorized", "subjectIds", "includeDescendants", "annotationId"
          ]),
          properties: {
            mode: { enum: ["context", "findings", "runs", "detail"] },
            states: {
              type: "array", maxItems: 4, uniqueItems: true,
              items: stringSchema({ enum: [...COURSE_AUDIT_FINDING_STATES] })
            },
            limit: { maximum: 24 },
            cursor: {
              anyOf: [
                stringSchema({ minLength: 1, maxLength: 240,
                  pattern: "^[A-Za-z0-9+/_-]+={0,2}$" }),
                { type: "null" }
              ]
            }
          },
          allOf: [{
            if: { properties: { mode: { const: "context" } }, required: ["mode"] },
            then: {
              required: ["targetStudyUnitId"],
              ...forbidFields([
                "findingId", "correctionId", "auditRunId", "states", "dimensions", "severities",
                "cursor"
              ]),
              allOf: [{
                if: { required: ["annotationIds"] },
                then: { required: ["includeObservationText"] },
                else: forbidFields(["includeObservationText"])
              }]
            }
          }, {
            if: { properties: { mode: { const: "findings" } }, required: ["mode"] },
            then: { ...forbidFields([
              "findingId", "correctionId", "auditRunId", "annotationIds",
              "includeObservationText"
            ]) }
          }, {
            if: { properties: { mode: { const: "runs" } }, required: ["mode"] },
            then: { ...forbidFields([
              "findingId", "correctionId", "auditRunId", "states", "dimensions",
              "severities", "annotationIds", "includeObservationText"
            ]) }
          }, {
            if: { properties: { mode: { const: "detail" } }, required: ["mode"] },
            then: {
              ...forbidFields([
                "targetStudyUnitId", "states", "dimensions", "severities",
                "annotationIds", "cursor", "includeObservationText"
              ]),
              oneOf: [{
                required: ["findingId"],
                ...forbidFields(["auditRunId"])
              }, {
                required: ["auditRunId"],
                ...forbidFields(["findingId", "correctionId"])
              }]
            }
          }]
        },
        else: forbidFields([
          "auditSetVersion", "targetStudyUnitId", "findingId", "correctionId", "auditRunId",
          "dimensions", "severities", "annotationIds"
        ])
      }, {
        if: {
          properties: { view: { enum: ["anchored_annotations", "audit_cycle"] } },
          required: ["view"]
        },
        else: forbidFields(["includeObservationText"])
      }, {
        if: {
          properties: { view: { const: "research" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision"],
          ...forbidFields([
            "authoringPartId", "materializationId", "scope", "anchorStudyUnitId",
            "direction", "maxBytes", "mode", "sourceId", "attachmentOperation",
            "sourceRevision", "contentHash", "byteSize", "mediaType", "targetKind",
            "targetId", "annotationSetVersion", "auditSetVersion", "categories",
            "includeUncategorized", "subjectIds", "includeDescendants", "annotationId",
            "targetStudyUnitId", "findingId", "correctionId", "auditRunId",
            "dimensions", "severities", "annotationIds", "comparisonSetId"
          ]),
          properties: {
            channels: {
              type: "array",
              maxItems: COURSE_AUTHORING_ANALYTICS_CHANNELS.length,
              uniqueItems: true,
              items: stringSchema({ enum: [...COURSE_AUTHORING_ANALYTICS_CHANNELS] })
            },
            limit: { maximum: 200 },
            cursor: {
              anyOf: [
                stringSchema({
                  minLength: 1,
                  maxLength: 2_048,
                  pattern: "^[A-Za-z0-9_-]+$"
                }),
                { type: "null" }
              ]
            }
          }
        },
        else: forbidFields(["datasets", "from", "to"])
      }, {
        if: {
          properties: {
            view: { enum: ["course_sources", "anchored_annotations", "audit_cycle", "variant_comparison", "variant_comparisons"] }
          },
          required: ["view"]
        },
        else: forbidFields(["mode", "targetKind", "targetId"])
      }, {
        if: {
          properties: { view: { enum: ["anchored_annotations", "audit_cycle", "research"] } },
          required: ["view"]
        },
        else: forbidFields(["states"])
      }, {
        if: {
          properties: { view: { enum: ["anchored_annotations", "research"] } },
          required: ["view"]
        },
        else: forbidFields(["origins", "channels"])
      }, {
        if: {
          properties: { view: { const: "course_design" } },
          required: ["view"]
        },
        then: {
          ...forbidFields([
            "authoringPartId", "materializationId", "expectedRevision",
            "anchorStudyUnitId", "direction", "maxBytes"
          ]),
          properties: {
            limit: { maximum: 64 },
            scope: courseDesignScopeSchema,
            cursor: {
              anyOf: [
                stringSchema({ minLength: 1, maxLength: 240 }),
                { type: "null" }
              ]
            }
          }
        }
      }, {
        if: {
          properties: { view: { const: "study_units" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision"],
          ...forbidFields(["authoringPartId", "materializationId"]),
          properties: { limit: { maximum: 24 } }
        }
      }, {
        if: {
          properties: { view: { const: "entities" } },
          required: ["view"]
        },
        then: {
          required: ["expectedRevision"],
          ...forbidFields([
            "authoringPartId", "materializationId", "scope", "anchorStudyUnitId",
            "direction", "maxBytes"
          ])
        }
      }, {
        if: {
          properties: { view: { enum: ["summary", "outline", "instructional_plan"] } },
          required: ["view"]
        },
        then: { ...forbidFields([
          "authoringPartId", "materializationId", "expectedRevision", "limit",
          "cursor", "scope", "anchorStudyUnitId", "direction", "maxBytes"
        ]) }
      }, {
        if: { not: { required: ["view"] } },
        then: { ...forbidFields([
          "authoringPartId", "materializationId", "expectedRevision", "limit",
          "cursor", "scope", "anchorStudyUnitId", "direction", "maxBytes"
        ]) }
      }]
    },
    outputSchema,
    _meta: courseMcpAppToolMeta(),
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
    description: "Altera o Curso por operação tipada. Releia a vista, preserve requestId e versões e siga phaseGuidance. Proponha antes de aplicar e verifique depois.",
    inputSchema: {
      ...objectSchema({
      requestId: requestIdSchema,
      courseId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      expectedPlanVersion: { type: "integer", minimum: 1 },
      operation: stringSchema({ enum: [
        "update_instructional_plan",
        "update_course_design",
        "update_course_sources",
        "update_anchored_annotations",
        "update_audit_cycle", "update_course_variants",
        "commit_course_composition",
        "advance_part_materialization"
      ] }),
      planCommand: authoringPlanCommandSchema,
      designCommand: courseDesignCommandSchema,
      sourceCommand: sourceCommandSchema,
      annotationCommand: anchoredAnnotationCommandSchema,
      auditCommand: auditCommandSchema,
      variantCommand: courseVariantCommandSchema,
      materializationCommand: materializationCommandSchema,
      upserts: { type: "array", maxItems: 200, items: courseEntitySchemaReference },
      sourceAttributionApplications: sourceAttributionApplicationsSchemaReference,
      deletes: {
        type: "array",
        maxItems: 200,
        items: courseEntityDeleteSchemaReference
      }
      }, ["requestId", "courseId", "operation"]),
      $defs: {
        sourceLinks: sourceLinksSchema,
        courseEntity: courseEntitySchema,
        courseEntityDelete: courseEntityDeleteSchema,
        sourceAttributionApplications: sourceAttributionApplicationsSchema
      },
      allOf: [{
        if: {
          properties: { operation: { const: "update_course_design" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedRevision", "designCommand"],
          not: { anyOf: [
            { required: ["expectedPlanVersion"] },
            { required: ["planCommand"] },
            { required: ["sourceCommand"] },
            { required: ["annotationCommand"] },
            { required: ["materializationCommand"] },
            { required: ["upserts"] },
            { required: ["deletes"] },
            { required: ["sourceAttributionApplications"] }
          ] }
        }
      }, {
        if: {
          properties: { operation: { const: "update_course_variants" } },
          required: ["operation"]
        },
        then: {
          required: ["variantCommand"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand", "sourceCommand",
            "annotationCommand", "auditCommand", "materializationCommand", "upserts",
            "deletes", "sourceAttributionApplications"
          ])
        },
        else: forbidFields(["variantCommand"])
      }, {
        if: {
          properties: { operation: { const: "update_course_sources" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedRevision", "sourceCommand"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand",
            "annotationCommand", "materializationCommand", "upserts", "deletes",
            "sourceAttributionApplications"
          ])
        }
      }, {
        if: {
          properties: { operation: { const: "update_anchored_annotations" } },
          required: ["operation"]
        },
        then: {
          required: ["annotationCommand"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand", "sourceCommand",
            "materializationCommand", "upserts", "deletes",
            "sourceAttributionApplications"
          ]),
          allOf: [{
            if: {
              properties: {
                annotationCommand: {
                  properties: {
                    type: { enum: [
                      "create_anchored_annotation",
                      "correct_anchored_annotation_subjects"
                    ] }
                  },
                  required: ["type"]
                }
              },
              required: ["annotationCommand"]
            },
            then: { required: ["expectedRevision"] },
            else: forbidFields(["expectedRevision"])
          }]
        }
      }, {
        if: {
          properties: { operation: { const: "update_audit_cycle" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedRevision", "auditCommand"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand", "sourceCommand",
            "annotationCommand", "materializationCommand", "upserts", "deletes",
            "sourceAttributionApplications"
          ])
        },
        else: forbidFields(["auditCommand"])
      }, {
        if: {
          properties: { operation: { const: "update_instructional_plan" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedRevision", "expectedPlanVersion", "planCommand"],
          ...forbidFields([
            "designCommand", "sourceCommand", "annotationCommand",
            "materializationCommand", "upserts",
            "deletes", "sourceAttributionApplications"
          ])
        }
      }, {
        if: {
          properties: { operation: { const: "commit_course_composition" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedRevision", "sourceAttributionApplications"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand",
            "sourceCommand", "annotationCommand", "materializationCommand"
          ]),
          anyOf: [{
            required: ["upserts"],
            properties: { upserts: { minItems: 1 } }
          }, {
            required: ["deletes"],
            properties: { deletes: { minItems: 1 } }
          }]
        }
      }, {
        if: {
          properties: { operation: { const: "advance_part_materialization" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedRevision", "materializationCommand"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand", "sourceCommand",
            "annotationCommand",
            "upserts", "deletes", "sourceAttributionApplications"
          ])
        }
      }]
    },
    outputSchema,
    annotations: courseChangeAnnotations
  }),
  Object.freeze({
    name: "consultarComponentesDidaticos",
    title: "Consultar componentes didáticos",
    description: "Explora, pesquisa, inspeciona, valida e abre a prévia dos componentes didáticos instalados sem carregar contratos desnecessários no contexto. contracts aceita exatamente um package por chamada.",
    inputSchema: {
      ...objectSchema({
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
      courseId: uuidSchema,
      studyUnitId: stringSchema({ minLength: 1, maxLength: 240 }),
      limit: { type: "integer", minimum: 1, maximum: 8 }
      }, ["operation"]),
      allOf: [{
        if: {
          properties: { operation: { const: "preview_study_unit" } },
          required: ["operation"]
        },
        then: {
          allOf: [{
            if: { required: ["courseId"] },
            then: { required: ["studyUnitId"] }
          }, {
            if: { required: ["studyUnitId"] },
            then: { required: ["courseId"] }
          }]
        },
        else: forbidFields(["courseId", "studyUnitId"])
      }, {
        if: {
          properties: { operation: { const: "contracts" } },
          required: ["operation"]
        },
        then: {
          required: ["packages"],
          properties: {
            packages: { minItems: 1, maxItems: 1 }
          }
        }
      }]
    },
    outputSchema,
    _meta: courseMcpAppToolMeta(),
    annotations: readAnnotations
  })
]);

const BY_NAME = new Map(COURSE_MCP_TOOLS.map((definition) => [definition.name, definition]));
const WRITE_TOOLS = new Set(["criarCurso", "alterarCurso"]);
export const COURSE_APPLICATION_ONLY_TOOLS = Object.freeze([
  Object.freeze({ name: "gerirPessoas" }),
  Object.freeze({ name: "criarCopiaPessoalDoCurso" }),
  Object.freeze({ name: "manterCursos" }),
  Object.freeze({ name: "manterAraLearn" })
]);
const APPLICATION_BY_NAME = new Map([
  ...BY_NAME,
  ...COURSE_APPLICATION_ONLY_TOOLS.map((definition) => [definition.name, definition])
]);
const APPLICATION_WRITE_TOOLS = new Set([
  ...WRITE_TOOLS,
  ...COURSE_APPLICATION_ONLY_TOOLS.map(({ name }) => name)
]);

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

function requiredOpaqueText(value, field, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum * 2 ||
      [...value].length > maximum ||
      new TextEncoder().encode(value).byteLength > maximum * 4 ||
      [...value].some((character) => {
        const point = character.codePointAt(0);
        return point < 32 || point >= 127 && point <= 159;
      })) {
    fail("invalid_tool_argument", `${field} é inválido.`, { field });
  }
  return value;
}

function requiredCourseSourceText(value, field, maximum) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized !== value || normalized.length > maximum * 2 ||
      [...normalized].length > maximum ||
      new TextEncoder().encode(normalized).byteLength > maximum * 4 ||
      [...normalized].some((character) => {
        const point = character.codePointAt(0);
        return point < 32 || point >= 127 && point <= 159;
      })) {
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

function normalizeCourseAnchoredAnnotationDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAnchoredAnnotationsError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseAuditCycleDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAuditCycleError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseVariantDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseVariantError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseAuthoringAnalyticsDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAuthoringAnalyticsError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message);
  }
}

function route(method, path, requestId = null, body = null) {
  return { kind: "route", method, path, requestId, body };
}

function boundedAnchoredAnnotationsReadRoute(path) {
  if (new TextEncoder().encode(path).byteLength >
      ANCHORED_ANNOTATIONS_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_anchored_annotations_query_too_large",
      "Os filtros de observação excedem o limite transportável de 8 KiB."
    );
  }
  return route("GET", path);
}

function boundedAuditCycleReadRoute(path) {
  if (new TextEncoder().encode(path).byteLength >
      AUDIT_CYCLE_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_audit_cycle_query_too_large",
      "Os filtros de auditoria excedem o limite transportável de 8 KiB."
    );
  }
  return route("GET", path);
}

function boundedCourseAuthoringAnalyticsReadRoute(path) {
  if (new TextEncoder().encode(path).byteLength >
      AUTHORING_ANALYTICS_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_authoring_analytics_query_too_large",
      "Os filtros de Pesquisa excedem o limite transportável de 8 KiB."
    );
  }
  return route("GET", path);
}

function searchParams(entries) {
  const params = new URLSearchParams();
  Object.entries(entries).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else if (value != null && value !== "") {
      params.set(key, String(value));
    }
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

function mapRead(raw, {
  requireObservationTextDisclosure = true,
  requireAttachmentDownloadUrlDisclosure = true,
  allowAttachmentUploadPreparation = false,
  inspectionVersion = 2
} = {}) {
  exactFields(raw, new Set([
    "courseId", "view", "authoringPartId", "materializationId",
    "expectedRevision", "limit", "cursor", "scope", "anchorStudyUnitId",
    "direction", "maxBytes", "mode", "sourceId", "targetKind", "targetId",
    "annotationSetVersion", "origins", "channels", "states", "categories",
    "includeUncategorized", "subjectIds", "includeDescendants", "annotationId",
    "auditSetVersion", "targetStudyUnitId", "findingId", "correctionId", "auditRunId",
    "dimensions", "severities", "annotationIds", "comparisonSetId",
    "includeObservationText", "includeAttachmentDownloadUrl",
    "attachmentOperation", "sourceRevision", "contentHash", "byteSize", "mediaType",
    "datasets", "from", "to"
  ]));
  const courseId = requiredUuid(raw.courseId, "courseId");
  const view = raw.view == null ? "outline" : requiredText(raw.view, "view", { maximum: 32 });
  if (!new Set([
    "summary", "outline", "instructional_plan", "course_design",
    "course_sources", "course_source_attachment", "anchored_annotations", "part_materialization",
    "study_units", "entities", "audit_cycle", "research",
    "variant_comparison", "variant_comparisons"
  ]).has(view)) {
    fail("invalid_tool_argument", "view é inválida.", { field: "view" });
  }
  if (!["course_sources", "course_source_attachment", "anchored_annotations", "audit_cycle"].includes(view) && [
    raw.mode, raw.sourceId, raw.targetKind, raw.targetId
  ].some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu campos contextuais incompatíveis.");
  }
  if (!["course_sources", "course_source_attachment"].includes(view) && raw.sourceId != null) {
    fail("invalid_tool_argument", "sourceId pertence somente à leitura de Fontes.");
  }
  const annotationFields = [
    raw.annotationSetVersion, raw.categories,
    raw.includeUncategorized, raw.subjectIds, raw.includeDescendants, raw.annotationId
  ];
  if (view !== "anchored_annotations" && annotationFields.some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de observação incompatíveis.");
  }
  if (!["anchored_annotations", "audit_cycle", "research"].includes(view) && raw.states != null) {
    fail("invalid_tool_argument", "A leitura recebeu estados incompatíveis.");
  }
  if (!["anchored_annotations", "research"].includes(view) &&
      [raw.origins, raw.channels].some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de origem ou canal incompatíveis.");
  }
  if (view !== "research" && [raw.datasets, raw.from, raw.to].some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de Pesquisa incompatíveis.");
  }
  const auditFields = [
    raw.auditSetVersion, raw.targetStudyUnitId, raw.findingId, raw.correctionId, raw.auditRunId,
    raw.dimensions, raw.severities, raw.annotationIds
  ];
  if (view !== "audit_cycle" && auditFields.some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu filtros de auditoria incompatíveis.");
  }
  if (view !== "variant_comparison" && raw.comparisonSetId != null) {
    fail("invalid_tool_argument", "comparisonSetId pertence somente às variantes.");
  }
  if (!["anchored_annotations", "audit_cycle"].includes(view) &&
      raw.includeObservationText != null) {
    fail(
      "invalid_tool_argument",
      "includeObservationText pertence somente às leituras de Observações.",
      { field: "includeObservationText" }
    );
  }
  const attachmentFields = [
    raw.attachmentOperation, raw.sourceRevision, raw.contentHash, raw.byteSize,
    raw.mediaType
  ];
  if (view !== "course_source_attachment" && attachmentFields.some((value) => value != null)) {
    fail("invalid_tool_argument", "A leitura recebeu campos de anexo incompatíveis.");
  }
  if (view !== "course_source_attachment" && raw.includeAttachmentDownloadUrl != null) {
    fail(
      "invalid_tool_argument",
      "includeAttachmentDownloadUrl pertence somente ao download de um anexo PDF.",
      { field: "includeAttachmentDownloadUrl" }
    );
  }
  if (view === "research") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null || raw.mode != null || raw.sourceId != null ||
        raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null) ||
        auditFields.some((value) => value != null) || raw.comparisonSetId != null) {
      fail("invalid_tool_argument", "A leitura de Pesquisa recebeu campos incompatíveis.");
    }
    const query = normalizeCourseAuthoringAnalyticsDomain(() =>
      normalizeCourseAuthoringAnalyticsQuery({
        ...(raw.datasets == null ? {} : { datasets: raw.datasets }),
        channels: raw.channels ?? [],
        origins: raw.origins ?? [],
        states: raw.states ?? [],
        from: raw.from ?? null,
        to: raw.to ?? null,
        limit: raw.limit ?? 100,
        cursor: raw.cursor ?? null
      })
    );
    return boundedCourseAuthoringAnalyticsReadRoute(
      `/v1/courses/${courseId}/research${searchParams({
        expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
        dataset: query.datasets,
        channel: query.channels,
        origin: query.origins,
        state: query.states,
        from: query.from,
        to: query.to,
        limit: query.limit,
        cursor: query.cursor
      })}`
    );
  }
  if (view === "variant_comparison") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.limit != null ||
        raw.cursor != null || raw.scope != null || raw.anchorStudyUnitId != null ||
        raw.direction != null || raw.maxBytes != null || raw.mode != null ||
        raw.sourceId != null || raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null) || auditFields.some((value) => value != null)) {
      fail("invalid_tool_argument", "A leitura de variantes recebeu campos incompatíveis.");
    }
    const options = normalizeCourseVariantDomain(() => normalizeCourseVariantRead({
      comparisonSetId: raw.comparisonSetId,
      expectedCourseRevision: raw.expectedRevision
    }));
    return route("GET", `/v1/courses/${courseId}/variant-comparisons/${options.comparisonSetId}` +
      searchParams({ expectedRevision: options.expectedCourseRevision }));
  }
  if (view === "variant_comparisons") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.limit != null ||
        raw.cursor != null || raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null || raw.mode != null || raw.sourceId != null || raw.targetKind != null ||
        raw.targetId != null || raw.comparisonSetId != null || annotationFields.some((value) => value != null) ||
        auditFields.some((value) => value != null)) {
      fail("invalid_tool_argument", "A lista de variantes recebeu campos incompatíveis.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    return route("GET", `/v1/courses/${courseId}/variant-comparisons` + searchParams({ expectedRevision }));
  }
  if (view === "anchored_annotations") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.scope != null ||
        raw.anchorStudyUnitId != null || raw.direction != null || raw.maxBytes != null ||
        raw.sourceId != null) {
      fail("invalid_tool_argument", "A leitura de observações recebeu campos incompatíveis.");
    }
    const hierarchyPresent = raw.targetKind != null || raw.targetId != null;
    if (hierarchyPresent && (raw.targetKind == null || raw.targetId == null) ||
        !hierarchyPresent && raw.includeDescendants != null) {
      fail("invalid_tool_argument", "O filtro hierárquico de observações está incompleto.");
    }
    const mode = raw.mode == null
      ? "inbox"
      : requiredText(raw.mode, "mode", { maximum: 16 });
    if (requireObservationTextDisclosure && mode === "detail" &&
        raw.includeObservationText !== true) {
      fail(
        "observation_text_disclosure_required",
        "A leitura de detalhe exige declarar includeObservationText=true porque o texto da Observação será enviado ao cliente MCP conectado.",
        { field: "includeObservationText" }
      );
    }
    if (mode !== "detail" && raw.includeObservationText != null) {
      fail(
        "invalid_tool_argument",
        "includeObservationText pertence somente à leitura de detalhe de uma Observação.",
        { field: "includeObservationText" }
      );
    }
    const query = normalizeCourseAnchoredAnnotationDomain(() =>
      normalizeCourseAnchoredAnnotationQuery({
        mode,
        origins: raw.origins ?? [],
        channels: raw.channels ?? [],
        states: raw.states ?? [],
        categories: raw.categories ?? [],
        includeUncategorized: raw.includeUncategorized ?? true,
        subjectIds: raw.subjectIds ?? [],
        hierarchy: hierarchyPresent
          ? {
              target: {
                kind: requiredText(raw.targetKind, "targetKind", { maximum: 32 }),
                id: raw.targetKind === "source"
                  ? requiredOpaqueText(raw.targetId, "targetId", 2_048)
                  : requiredCourseSourceText(raw.targetId, "targetId", 240)
              },
              includeDescendants: raw.includeDescendants ?? false
            }
          : null,
        annotationId: raw.annotationId == null
          ? null
          : requiredUuid(raw.annotationId, "annotationId")
      })
    );
    const options = normalizeCourseAnchoredAnnotationDomain(() =>
      normalizeCourseAnchoredAnnotationReadOptions({
        expectedCourseRevision: raw.expectedRevision,
        annotationSetVersion: raw.annotationSetVersion ?? null,
        query,
        cursor: raw.cursor ?? null,
        limit: raw.limit ?? 12
      })
    );
    return boundedAnchoredAnnotationsReadRoute(
      `/v1/courses/${courseId}/anchored-annotations${searchParams({
        expectedRevision: options.expectedCourseRevision,
        annotationSetVersion: options.annotationSetVersion,
        mode: query.mode,
        origin: query.origins,
        channel: query.channels,
        state: query.states,
        category: query.categories,
        includeUncategorized: query.includeUncategorized,
        subjectId: query.subjectIds,
        targetKind: query.hierarchy?.target.kind,
        targetId: query.hierarchy?.target.id,
        includeDescendants: query.hierarchy?.includeDescendants,
        annotationId: query.annotationId,
        cursor: options.cursor,
        limit: options.limit
      })}`
    );
  }
  if (view === "audit_cycle") {
    if (raw.authoringPartId != null || raw.materializationId != null || raw.scope != null ||
        raw.anchorStudyUnitId != null || raw.direction != null || raw.maxBytes != null ||
        raw.sourceId != null || raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null)) {
      fail("invalid_tool_argument", "A leitura de auditoria recebeu campos incompatíveis.");
    }
    const mode = raw.mode == null
      ? "findings"
      : requiredText(raw.mode, "mode", { maximum: 16 });
    const annotationIds = raw.annotationIds ?? [];
    if (requireObservationTextDisclosure && mode === "context" &&
        annotationIds.length > 0 && raw.includeObservationText !== true) {
      fail(
        "observation_text_disclosure_required",
        "O contexto de auditoria com Observações exige declarar includeObservationText=true porque os textos serão enviados ao cliente MCP conectado.",
        { field: "includeObservationText" }
      );
    }
    if ((mode !== "context" || annotationIds.length === 0) &&
        raw.includeObservationText != null) {
      fail(
        "invalid_tool_argument",
        "includeObservationText pertence somente ao contexto de auditoria com Observações selecionadas.",
        { field: "includeObservationText" }
      );
    }
    const options = normalizeCourseAuditCycleDomain(() =>
      normalizeCourseAuditCycleReadOptions({
        expectedCourseRevision: raw.expectedRevision,
        auditSetVersion: raw.auditSetVersion ?? null,
        query: {
          mode,
          targetStudyUnitId: raw.targetStudyUnitId ?? null,
          findingId: raw.findingId ?? null,
          correctionId: raw.correctionId ?? null,
          auditRunId: raw.auditRunId ?? null,
          states: raw.states ?? [],
          dimensions: raw.dimensions ?? [],
          severities: raw.severities ?? [],
          annotationIds
        },
        cursor: raw.cursor ?? null,
        limit: raw.limit ?? 12
      })
    );
    const query = options.query;
    return boundedAuditCycleReadRoute(
      `/v1/courses/${courseId}/audit-cycle${searchParams({
        expectedRevision: options.expectedCourseRevision,
        auditSetVersion: options.auditSetVersion,
        mode: query.mode,
        targetStudyUnitId: query.targetStudyUnitId,
        findingId: query.findingId,
        correctionId: query.correctionId,
        auditRunId: query.auditRunId,
        state: query.states,
        dimension: query.dimensions,
        severity: query.severities,
        annotationId: query.annotationIds,
        cursor: options.cursor,
        limit: options.limit
      })}`
    );
  }
  if (view === "course_design") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.expectedRevision != null || raw.anchorStudyUnitId != null ||
        raw.direction != null || raw.maxBytes != null) {
      fail("invalid_tool_argument", "A leitura dos parâmetros recebeu campos incompatíveis.");
    }
    const scope = raw.scope == null
      ? { kind: "course", ref: courseId }
      : object(raw.scope, "scope");
    exactFields(scope, new Set(["kind", "ref"]));
    const scopeKind = requiredText(scope.kind, "scope.kind", { maximum: 32 });
    if (!new Set([
      "course", "module", "lesson", "didactic_microsequence"
    ]).has(scopeKind)) {
      fail("invalid_tool_argument", "scope.kind é inválido.", { field: "scope.kind" });
    }
    const scopeRef = requiredText(scope.ref, "scope.ref", { maximum: 240 });
    if (scopeKind === "course" && scopeRef !== courseId) {
      fail("invalid_tool_argument", "scope.ref não identifica este Curso.", {
        field: "scope.ref"
      });
    }
    const limit = raw.limit == null ? 32 : positiveInteger(raw.limit, "limit", 64);
    const cursor = raw.cursor == null
      ? null
      : requiredText(raw.cursor, "cursor", { maximum: 240 });
    return route("GET", `/v1/courses/${courseId}/course-design${searchParams({
      scopeKind,
      scopeRef,
      limit,
      cursor
    })}`);
  }
  if (view === "course_source_attachment") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.limit != null || raw.cursor != null || raw.scope != null ||
        raw.anchorStudyUnitId != null || raw.direction != null || raw.maxBytes != null ||
        raw.mode != null || raw.targetKind != null || raw.targetId != null ||
        annotationFields.some((value) => value != null) ||
        auditFields.some((value) => value != null) || raw.comparisonSetId != null) {
      fail("invalid_tool_argument", "A leitura do anexo recebeu campos incompatíveis.");
    }
    const operation = requiredText(
      raw.attachmentOperation,
      "attachmentOperation",
      { maximum: 24 }
    );
    if (!["prepare_upload", "download"].includes(operation)) {
      fail("invalid_tool_argument", "attachmentOperation é inválida.", {
        field: "attachmentOperation"
      });
    }
    if (operation === "prepare_upload" && !allowAttachmentUploadPreparation) {
      fail(
        "application_session_required",
        "O envio de PDF exige a sessão autenticada da aplicação.",
        { field: "attachmentOperation" }
      );
    }
    const contentHash = requiredText(raw.contentHash, "contentHash", { maximum: 64 });
    if (!/^[a-f0-9]{64}$/u.test(contentHash)) {
      fail("invalid_tool_argument", "contentHash é inválido.", { field: "contentHash" });
    }
    const byteSize = operation === "prepare_upload"
      ? positiveInteger(raw.byteSize, "byteSize", 20 * 1024 * 1024)
      : null;
    const mediaType = operation === "prepare_upload"
      ? requiredText(raw.mediaType, "mediaType", { maximum: 32 })
      : null;
    if (operation === "prepare_upload" && mediaType !== "application/pdf" ||
        operation === "download" && (raw.byteSize != null || raw.mediaType != null)) {
      fail("invalid_tool_argument", "Os metadados do anexo são inválidos.");
    }
    if (operation === "download" && requireAttachmentDownloadUrlDisclosure &&
        raw.includeAttachmentDownloadUrl !== true) {
      fail(
        "attachment_download_url_disclosure_required",
        "O download exige declarar includeAttachmentDownloadUrl=true porque uma URL assinada, válida por 60 segundos, será enviada ao cliente MCP conectado.",
        { field: "includeAttachmentDownloadUrl" }
      );
    }
    const attachmentDownloadDisclosureSupplied =
      raw.includeAttachmentDownloadUrl != null;
    if (attachmentDownloadDisclosureSupplied && (
      operation !== "download" || !requireAttachmentDownloadUrlDisclosure
    )) {
      fail(
        "invalid_tool_argument",
        "includeAttachmentDownloadUrl pertence somente ao download solicitado pela superfície MCP.",
        { field: "includeAttachmentDownloadUrl" }
      );
    }
    return route("GET", `/v1/courses/${courseId}/source-attachments/access${searchParams({
      expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      operation,
      sourceId: requiredOpaqueText(raw.sourceId, "sourceId", 2_048),
      sourceRevision: positiveInteger(raw.sourceRevision, "sourceRevision"),
      contentHash,
      byteSize,
      mediaType
    })}`);
  }
  if (view === "course_sources") {
    if (raw.authoringPartId != null || raw.materializationId != null ||
        raw.scope != null || raw.anchorStudyUnitId != null || raw.direction != null ||
        raw.maxBytes != null) {
      fail("invalid_tool_argument", "A leitura de Fontes recebeu campos incompatíveis.");
    }
    const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    const mode = raw.mode == null
      ? "catalog"
      : requiredText(raw.mode, "mode", { maximum: 16 });
    if (!new Set(["catalog", "source", "target"]).has(mode)) {
      fail("invalid_tool_argument", "mode é inválido.", { field: "mode" });
    }
    const sourceId = raw.sourceId == null
      ? null
      : requiredOpaqueText(raw.sourceId, "sourceId", 2_048);
    const targetKind = raw.targetKind == null
      ? null
      : requiredText(raw.targetKind, "targetKind", { maximum: 16 });
    const targetId = raw.targetId == null
      ? null
      : requiredCourseSourceText(raw.targetId, "targetId", 240);
    const hasTargetContext = targetKind !== null || targetId !== null;
    const validTargetContext = targetKind !== null && targetId !== null;
    if ((mode === "source") !== (sourceId !== null) ||
        mode === "catalog" && hasTargetContext ||
        mode === "target" && (sourceId !== null || !validTargetContext) ||
        mode === "source" && hasTargetContext && !validTargetContext ||
        (targetKind !== null && !new Set(["plan_item", "study_unit"]).has(targetKind)) ||
        (targetKind === "plan_item" && !UUID_PATTERN.test(targetId))) {
      fail("invalid_tool_argument", "A consulta de Fontes é inválida.");
    }
    const cursor = raw.cursor == null
      ? null
      : requiredText(raw.cursor, "cursor", { maximum: 240 });
    if (cursor != null && !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(cursor)) {
      fail("invalid_tool_argument", "cursor é inválido.", { field: "cursor" });
    }
    if (mode === "source" && hasTargetContext && cursor !== null) {
      fail("invalid_tool_argument", "A revisão contextual não aceita cursor.", {
        field: "cursor"
      });
    }
    const limit = raw.limit == null ? 10 : positiveInteger(raw.limit, "limit", 24);
    return route("GET", `/v1/courses/${courseId}/sources${searchParams({
      expectedRevision,
      mode,
      sourceId,
      targetKind,
      targetId,
      cursor,
      limit
    })}`);
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
    return route("GET", `/v${inspectionVersion}/courses/${courseId}/study-units${searchParams({
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
    fail("invalid_tool_argument", "A leitura recebeu campos incompatíveis com a vista.");
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

function mapPersonalCourseCopy(raw) {
  exactFields(raw, new Set([
    "requestId", "sourceCourseId", "expectedSourceCourseRevision",
    "expectedStudyUnitVersion", "didacticMicrosequenceId", "studyUnit",
    "applicationOrigin"
  ]));
  const requestId = requiredRequestId(raw.requestId);
  const sourceCourseId = requiredUuid(raw.sourceCourseId, "sourceCourseId");
  const applicationOrigin = raw.applicationOrigin;
  if (!new Set(["manual", "provider_assistance"]).has(applicationOrigin)) {
    fail(
      "invalid_tool_argument",
      "applicationOrigin é inválida.",
      { field: "applicationOrigin" }
    );
  }
  return route(
    "POST",
    `/v1/courses/${sourceCourseId}/personal-copy/composition`,
    requestId,
    {
      requestId,
      sourceCourseId,
      expectedSourceCourseRevision: positiveInteger(
        raw.expectedSourceCourseRevision,
        "expectedSourceCourseRevision"
      ),
      expectedStudyUnitVersion: positiveInteger(
        raw.expectedStudyUnitVersion,
        "expectedStudyUnitVersion"
      ),
      didacticMicrosequenceId: requiredOpaqueText(
        raw.didacticMicrosequenceId,
        "didacticMicrosequenceId",
        240
      ),
      studyUnit: boundedJsonObject(raw.studyUnit, "studyUnit", 480 * 1024),
      applicationOrigin
    }
  );
}

function mapChange(raw, {
  requireAnnotationConfirmation = true,
  requireAuditConfirmation = true,
  allowApplicationCompositionMetadata = false,
  normalizeExternalDesignDecision = true
} = {}) {
  const allowedFields = new Set([
    "requestId", "courseId", "expectedRevision", "expectedPlanVersion",
    "operation", "planCommand", "designCommand", "materializationCommand",
    "sourceCommand", "annotationCommand", "auditCommand", "upserts", "deletes",
    "sourceAttributionApplications", "variantCommand"
  ]);
  if (allowApplicationCompositionMetadata) {
    allowedFields.add("expectedStudyUnitVersion");
    allowedFields.add("applicationOrigin");
  }
  exactFields(raw, allowedFields);
  const requestId = requiredRequestId(raw.requestId);
  const courseId = requiredUuid(raw.courseId, "courseId");
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "update_instructional_plan",
    "update_course_design",
    "update_course_sources",
    "update_anchored_annotations",
    "update_audit_cycle",
    "update_course_variants",
    "commit_course_composition",
    "advance_part_materialization"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  if (operation !== "commit_course_composition" && (
    raw.expectedStudyUnitVersion != null || raw.applicationOrigin != null
  )) {
    fail(
      "invalid_tool_argument",
      "Os metadados da edição pertencem somente à composição contextual."
    );
  }
  if (operation !== "update_audit_cycle" && raw.auditCommand != null) {
    fail("invalid_tool_argument", "auditCommand pertence somente ao ciclo de auditoria.");
  }
  if (operation !== "update_course_variants" && raw.variantCommand != null) {
    fail("invalid_tool_argument", "variantCommand pertence somente às variantes.");
  }
  if (operation === "update_course_variants") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null ||
        raw.annotationCommand != null || raw.auditCommand != null ||
        raw.materializationCommand != null || raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de variantes recebeu campos incompatíveis.");
    }
    const supplied = boundedJsonObject(raw.variantCommand, "variantCommand", 128 * 1024);
    const command = normalizeCourseVariantDomain(() =>
      supplied.type === "create_comparison_variants"
        ? normalizeCourseVariantCommand(supplied)
        : normalizeCourseVariantDetachCommand(supplied)
    );
    if (command.type === "create_comparison_variants") {
      const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
      if (expectedRevision !== command.expectedCourseRevision) {
        fail("invalid_tool_argument", "expectedRevision não corresponde ao comando de variantes.");
      }
      return route("POST", `/v1/courses/${courseId}/variant-comparisons/changes`, requestId, {
        requestId, expectedCourseRevision: expectedRevision, command
      });
    }
    if (raw.expectedRevision != null) {
      fail("invalid_tool_argument", "expectedRevision não pertence à desvinculação.");
    }
    return route("POST", `/v1/courses/${courseId}/variant-comparisons/changes`, requestId, {
      requestId, command
    });
  }
  if (operation === "update_audit_cycle") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null ||
        raw.annotationCommand != null || raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de auditoria recebeu campos incompatíveis.");
    }
    const supplied = boundedJsonObject(raw.auditCommand, "auditCommand", 192 * 1024);
    const requiresConfirmation = new Set([
      "apply_authoring_correction", "rollback_authoring_correction"
    ]).has(supplied.type);
    if (requiresConfirmation && requireAuditConfirmation && supplied.confirmed !== true) {
      fail(
        "authoring_correction_confirmation_required",
        "Confirme explicitamente antes de aplicar ou desfazer uma correção autoral."
      );
    }
    if ((!requiresConfirmation || !requireAuditConfirmation) &&
        Object.hasOwn(supplied, "confirmed")) {
      fail(
        "invalid_tool_argument",
        requireAuditConfirmation
          ? "confirmed pertence somente à aplicação ou ao rollback da correção."
          : "confirmed não pertence ao comando da interface."
      );
    }
    const commandInput = { ...supplied };
    delete commandInput.confirmed;
    const command = normalizeCourseAuditCycleDomain(() =>
      normalizeCourseAuditCycleCommand(
        commandInput
      )
    );
    return route("POST", `/v1/courses/${courseId}/audit-cycle/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      command
    });
  }
  if (operation === "update_instructional_plan") {
    if (raw.designCommand != null || raw.sourceCommand != null ||
        raw.annotationCommand != null || raw.materializationCommand != null || raw.upserts != null ||
        raw.deletes != null || raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando do plano recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.planCommand, "planCommand", 192 * 1024);
    return route("POST", `/v1/courses/${courseId}/instructional-plan/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      expectedPlanVersion: positiveInteger(raw.expectedPlanVersion, "expectedPlanVersion"),
      command
    });
  }
  if (operation === "update_course_design") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.sourceCommand != null || raw.annotationCommand != null ||
        raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando dos parâmetros recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.designCommand, "designCommand", 32 * 1024);
    if (normalizeExternalDesignDecision && command.type === "set_parameter") {
      const mode = requiredText(command.mode, "designCommand.mode", { maximum: 16 });
      if (!new Set(["automatic", "explicit"]).has(mode)) {
        fail("invalid_tool_argument", "designCommand.mode é inválido.", {
          field: "designCommand.mode"
        });
      }
      if (mode === "automatic") {
        if (command.origin != null) {
          fail(
            "invalid_tool_argument",
            "Uma decisão automática não recebe origin explícita.",
            { field: "designCommand.origin" }
          );
        }
        command.origin = "automatic";
      } else if (!new Set(["author", "research_condition"]).has(command.origin)) {
        fail(
          "invalid_tool_argument",
          "Uma decisão explícita exige origin author ou research_condition.",
          { field: "designCommand.origin" }
        );
      }
      delete command.mode;
    }
    return route("POST", `/v1/courses/${courseId}/course-design/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      command
    });
  }
  if (operation === "update_course_sources") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.annotationCommand != null ||
        raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null ||
        raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de Fontes recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.sourceCommand, "sourceCommand", 192 * 1024);
    return route("POST", `/v1/courses/${courseId}/sources/changes`, requestId, {
      requestId,
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      command
    });
  }
  if (operation === "update_anchored_annotations") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null ||
        raw.materializationCommand != null || raw.upserts != null ||
        raw.deletes != null || raw.sourceAttributionApplications != null) {
      fail("invalid_tool_argument", "O comando de observação recebeu campos incompatíveis.");
    }
    const supplied = boundedJsonObject(
      raw.annotationCommand,
      "annotationCommand",
      32 * 1024
    );
    if (supplied.type === "create_anchored_annotation") {
      if (requireAnnotationConfirmation && (
        supplied.confirmed !== true || typeof supplied.briefSummary !== "string" ||
        !supplied.briefSummary.trim()
      )) {
        fail(
          "anchored_annotation_confirmation_required",
          "Confirme o alvo e informe uma síntese breve antes de registrar a observação."
        );
      }
      if (!requireAnnotationConfirmation && Object.hasOwn(supplied, "confirmed")) {
        fail("invalid_tool_argument", "confirmed não pertence ao comando da interface.");
      }
    } else if (Object.hasOwn(supplied, "confirmed")) {
      fail("invalid_tool_argument", "confirmed pertence somente à criação de observação.");
    }
    const commandInput = { ...supplied };
    delete commandInput.confirmed;
    const command = normalizeCourseAnchoredAnnotationDomain(() =>
      normalizeCourseAnchoredAnnotationCommand(commandInput)
    );
    const requiresCourseRevision = new Set([
      "create_anchored_annotation",
      "correct_anchored_annotation_subjects"
    ]).has(command.type);
    let expectedCourseRevision = null;
    if (requiresCourseRevision) {
      expectedCourseRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
    } else if (raw.expectedRevision != null) {
      fail(
        "invalid_tool_argument",
        "expectedRevision não pertence a este comando de observação.",
        { field: "expectedRevision" }
      );
    }
    return route(
      "POST",
      `/v1/courses/${courseId}/anchored-annotations/changes`,
      requestId,
      { requestId, expectedCourseRevision, command }
    );
  }
  if (operation === "commit_course_composition") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.sourceCommand != null || raw.annotationCommand != null ||
        raw.materializationCommand != null) {
      fail("invalid_tool_argument", "A composição recebeu campos incompatíveis.");
    }
    const upserts = Array.isArray(raw.upserts) ? raw.upserts : [];
    const deletes = Array.isArray(raw.deletes) ? raw.deletes : [];
    const sourceAttributionApplications = Array.isArray(raw.sourceAttributionApplications)
      ? raw.sourceAttributionApplications
      : null;
    if (sourceAttributionApplications == null) {
      fail(
        "invalid_tool_argument",
        "A composição precisa declarar sourceAttributionApplications."
      );
    }
    if (!upserts.length && !deletes.length) {
      fail("invalid_tool_argument", "Informe entidades para inserir, alterar ou excluir.");
    }
    if (upserts.length > 200 || deletes.length > 200) {
      fail("invalid_tool_argument", "A alteração excede 200 entidades por grupo.");
    }
    const hasExpectedStudyUnitVersion = raw.expectedStudyUnitVersion != null;
    const hasApplicationOrigin = raw.applicationOrigin != null;
    if (allowApplicationCompositionMetadata &&
        hasExpectedStudyUnitVersion !== hasApplicationOrigin) {
      fail(
        "invalid_tool_argument",
        "A edição contextual precisa informar versão e origem em conjunto."
      );
    }
    const applicationMetadata = allowApplicationCompositionMetadata &&
      hasExpectedStudyUnitVersion
      ? {
          expectedStudyUnitVersion: positiveInteger(
            raw.expectedStudyUnitVersion,
            "expectedStudyUnitVersion"
          ),
          applicationOrigin: new Set(["manual", "provider_assistance"]).has(
            raw.applicationOrigin
          )
            ? raw.applicationOrigin
            : fail(
                "invalid_tool_argument",
                "applicationOrigin é inválida.",
                { field: "applicationOrigin" }
              )
        }
      : {};
    return route("POST", `/v1/courses/${courseId}/composition`, requestId, {
      requestId,
      expectedRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
      upserts,
      deletes,
      sourceAttributionApplications,
      ...applicationMetadata
    });
  }
  if (raw.expectedPlanVersion != null || raw.planCommand != null ||
      raw.designCommand != null || raw.sourceCommand != null || raw.annotationCommand != null ||
      raw.upserts != null ||
      raw.deletes != null || raw.sourceAttributionApplications != null) {
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
  const materializationBaseFields = [
    "operation", "authoringPartId", "materializationId",
    "expectedMaterializationVersion"
  ];
  if (command.operation === "start") {
    exactFields(command, new Set([
      ...materializationBaseFields, "authoringPartVersion", "steps"
    ]));
  } else if (command.operation === "record_step") {
    exactFields(command, new Set([
      ...materializationBaseFields, "stepId", "expectedStepVersion", "status",
      "resultFacts", "entityChanges", "designApplication",
      "sourceAttributionApplication"
    ]));
    if (!Object.hasOwn(command, "designApplication") ||
        !Object.hasOwn(command, "sourceAttributionApplication")) {
      fail(
        "invalid_tool_argument",
        "record_step precisa declarar as aplicações de desenho e proveniência como objeto ou null."
      );
    }
  } else {
    exactFields(command, new Set([
      ...materializationBaseFields, "status", "resultFacts"
    ]));
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
      expectedCourseRevision: positiveInteger(raw.expectedRevision, "expectedRevision"),
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

function mapCourseLifecycle(raw) {
  exactFields(raw, new Set(["operation", "requestId", "courseId", "confirmed"]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set(["delete_owned_course", "leave_shared_course"]).has(operation) ||
      raw.confirmed !== true) {
    fail("invalid_tool_argument", "A operação de ciclo de vida do Curso é inválida.");
  }
  const requestId = requiredRequestId(raw.requestId);
  const courseId = requiredUuid(raw.courseId, "courseId");
  return route("DELETE", `/v1/courses/${courseId}`, requestId, {
    requestId,
    operation,
    confirmed: true
  });
}

function mapCurrentMaintenance(raw) {
  exactFields(raw, new Set([
    "operation", "limit", "classification", "objectPath", "confirmed"
  ]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (operation === "inspect") {
    if (Object.keys(raw).some((field) => !new Set(["operation", "limit"]).has(field))) {
      fail("invalid_tool_argument", "A consulta de Manutenção recebeu campos incompatíveis.");
    }
    const limit = raw.limit == null ? 100 : positiveInteger(raw.limit, "limit", 500);
    return route("GET", `/v1/maintenance?limit=${limit}`);
  }
  if (!new Set(["run_retention", "remove_orphan_object"]).has(operation) ||
      raw.confirmed !== true) {
    fail("invalid_tool_argument", "A ação de Manutenção é inválida.");
  }
  if (operation === "run_retention") {
    if (Object.keys(raw).some((field) => !new Set([
      "operation", "limit", "confirmed"
    ]).has(field))) {
      fail("invalid_tool_argument", "A retenção recebeu campos incompatíveis.");
    }
    return route("POST", "/v1/maintenance/actions", null, {
      operation,
      limit: positiveInteger(raw.limit, "limit", 1000),
      confirmed: true
    });
  }
  if (Object.keys(raw).some((field) => !new Set([
    "operation", "classification", "objectPath", "confirmed"
  ]).has(field))) {
    fail("invalid_tool_argument", "A remoção de resíduo recebeu campos incompatíveis.");
  }
  const classification = requiredText(raw.classification, "classification", { maximum: 80 });
  if (!new Set([
    "avatar_owner_missing", "avatar_profile_unlinked",
    "pdf_course_missing", "pdf_unlinked"
  ]).has(classification)) {
    fail("invalid_tool_argument", "A classe de resíduo não pode ser removida.");
  }
  return route("POST", "/v1/maintenance/actions", null, {
    operation,
    classification,
    objectPath: requiredText(raw.objectPath, "objectPath", { maximum: 500 }),
    confirmed: true
  });
}

function mapResourceLibrary(raw) {
  exactFields(raw, new Set([
    "operation", "query", "intent", "slot", "packages", "studyUnitJson", "courseId",
    "studyUnitId", "limit"
  ]));
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "explore", "search", "inspect", "contracts", "validate_study_unit",
    "audit_representation", "preview_study_unit"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  const hasCourseId = raw.courseId != null;
  const hasStudyUnitId = raw.studyUnitId != null;
  if (operation !== "preview_study_unit" && (hasCourseId || hasStudyUnitId)) {
    fail("invalid_tool_argument", "O alvo da prévia só pertence a preview_study_unit.");
  }
  if (hasCourseId !== hasStudyUnitId) {
    fail("invalid_tool_argument", "courseId e studyUnitId precisam ser informados juntos.");
  }
  return {
    kind: "resource-library",
    requestId: null,
    body: {
      ...raw,
      operation,
      ...(hasCourseId
        ? {
          courseId: requiredUuid(raw.courseId, "courseId"),
          studyUnitId: requiredText(raw.studyUnitId, "studyUnitId", { maximum: 240 })
        }
        : {})
    }
  };
}

export function authoringMcpToolDefinition(name) {
  return BY_NAME.get(String(name || "")) || null;
}

export function authoringApplicationToolDefinition(name) {
  return APPLICATION_BY_NAME.get(String(name || "")) || null;
}

export function authoringMcpToolsForPrincipal(principal) {
  return COURSE_MCP_TOOLS.filter((definition) =>
    authoringMcpToolIsAllowed(definition.name, principal)
  ).map((definition) => {
    const tool = structuredClone(definition);
    const securitySchemes = structuredClone(MCP_OAUTH_SECURITY_SCHEMES);
    return {
      ...tool,
      securitySchemes,
      _meta: {
        ...(tool._meta || {}),
        securitySchemes: structuredClone(securitySchemes)
      }
    };
  });
}

export function authoringMcpToolIsAllowed(name, principal) {
  if (!principal?.actorId || !BY_NAME.has(name)) return false;
  if (!WRITE_TOOLS.has(name)) return true;
  const scopes = new Set(Array.isArray(principal.scopes) ? principal.scopes : []);
  return scopes.has("authoring:write");
}

export function authoringApplicationToolIsAllowed(name, principal) {
  if (!principal?.actorId || !APPLICATION_BY_NAME.has(name)) return false;
  if (!APPLICATION_WRITE_TOOLS.has(name)) return true;
  const scopes = new Set(Array.isArray(principal.scopes) ? principal.scopes : []);
  return scopes.has("authoring:write");
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const raw = object(rawArguments ?? {}, "arguments");
  if (name === "listarCursos") return mapList(raw);
  if (name === "lerCurso") return mapRead(raw);
  if (name === "criarCurso") return mapCreate(raw);
  if (name === "alterarCurso") return mapChange(raw);
  if (name === "consultarComponentesDidaticos") return mapResourceLibrary(raw);
  throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
}

export function mapAuthoringApplicationToolCall(
  name,
  rawArguments,
  { inspectionVersion = 1 } = {}
) {
  const raw = object(rawArguments ?? {}, "arguments");
  if (name === "gerirPessoas") return mapPeople(raw);
  if (name === "criarCopiaPessoalDoCurso") return mapPersonalCourseCopy(raw);
  if (name === "manterCursos") return mapCourseLifecycle(raw);
  if (name === "manterAraLearn") return mapCurrentMaintenance(raw);
  if (name === "lerCurso") {
    return mapRead(raw, {
      requireObservationTextDisclosure: false,
      requireAttachmentDownloadUrlDisclosure: false,
      allowAttachmentUploadPreparation: true,
      inspectionVersion
    });
  }
  if (name === "alterarCurso") {
    return mapChange(raw, {
      requireAnnotationConfirmation: false,
      requireAuditConfirmation: false,
      allowApplicationCompositionMetadata: true,
      normalizeExternalDesignDecision: false
    });
  }
  return mapAuthoringMcpToolCall(name, raw);
}

function validateOutput(name, envelope, definitions = BY_NAME) {
  if (!definitions.has(name)) throw new TypeError("Ferramenta de autoria inexistente.");
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
  return validateOutput(name, value, APPLICATION_BY_NAME);
}
