export const AUTHORING_PROTOCOL_ID = "aralearn.authoring-protocol.v1";
export const AUTHORING_PROTOCOL_SCHEMA_VERSION = "1.6.0";

export const COURSE_COMPONENT_CATALOG_VERSION = "1-3e5629f8";

export const COURSE_ANCHORED_ANNOTATION_CATEGORIES = Object.freeze([
  "question",
  "possible_error",
  "confusing",
  "suggestion",
  "reformulation_request"
]);
export const COURSE_ANCHORED_ANNOTATION_CHANNELS = Object.freeze([
  "authoring_interface",
  "authoring_chat",
  "study_interface",
  "audit_interface",
  "audit_automation",
  "unknown_legacy"
]);
export const COURSE_ANCHORED_ANNOTATION_ORIGINS = Object.freeze([
  "author",
  "learner",
  "human_audit",
  "automatic_audit",
  "unknown_legacy"
]);
export const COURSE_ANCHORED_ANNOTATION_STATES = Object.freeze([
  "open",
  "considered",
  "resolved",
  "withdrawn"
]);
export const COURSE_ANCHORED_ANNOTATION_TARGET_KINDS = Object.freeze([
  "course",
  "module",
  "lesson",
  "topic",
  "didactic_microsequence",
  "study_unit",
  "source",
  "source_anchor"
]);

export const COURSE_AUDIT_ADEQUACY = Object.freeze([
  "sufficient",
  "insufficient",
  "uncertain",
  "not_applicable",
  "not_assessed"
]);
export const COURSE_AUDIT_DIMENSIONS = Object.freeze([
  "structural_conformance",
  "pedagogical_quality",
  "factual_quality",
  "editorial_quality"
]);
export const COURSE_AUDIT_FINDING_STATES = Object.freeze([
  "open",
  "awaiting_verification",
  "resolved",
  "dismissed"
]);
export const COURSE_AUDIT_HUMAN_DIMENSIONS = Object.freeze([
  "pedagogical_quality",
  "factual_quality",
  "editorial_quality"
]);
export const COURSE_AUDIT_ORIGINS = Object.freeze([
  "human_audit",
  "automatic_audit"
]);
export const COURSE_AUDIT_RESULTS = Object.freeze([
  "passed",
  "failed",
  "uncertain",
  "not_applicable",
  "not_checked"
]);
export const COURSE_AUDIT_SEVERITIES = Object.freeze([
  "low",
  "medium",
  "high",
  "critical"
]);

export const COURSE_AUTHORING_ANALYTICS_CHANNELS = Object.freeze([
  "authoring_interface",
  "authoring_chat",
  "study_interface",
  "audit_process"
]);
export const COURSE_AUTHORING_ANALYTICS_DATASETS = Object.freeze([
  "activity",
  "materializations",
  "design",
  "sources",
  "annotations",
  "audits",
  "variants"
]);

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
export const COMPONENT_REF_PATTERN = /^[a-z][a-z0-9._-]{2,119}@[0-9]+\.[0-9]+\.[0-9]+$/u;
export const RFC3339_PATTERN =
  "^(?!0000-)\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])" +
  "T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?" +
  "(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$";
export const ANCHORED_ANNOTATIONS_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;
export const AUDIT_CYCLE_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;
export const AUTHORING_ANALYTICS_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;
const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required
});

const forbidFields = (fields) => ({
  not: { anyOf: fields.map((field) => ({ required: [field] })) }
});

const identityRequiredUnlessNew = (identityField, revisionField) => ({
  anyOf: [
    { required: [identityField] },
    {
      properties: { [revisionField]: { const: 0 } },
      required: [revisionField]
    }
  ]
});

const exactlyOneReference = (identityField, indexField) => ({
  oneOf: [
    { required: [identityField], ...forbidFields([indexField]) },
    { required: [indexField], ...forbidFields([identityField]) }
  ]
});

const stringSchema = (options = {}) => ({ type: "string", ...options });
const uuidSchema = stringSchema({ pattern: UUID_PATTERN.source });
const generatedUuidSchema = stringSchema({
  pattern: UUID_PATTERN.source,
  description:
    "Opcional somente por compatibilidade. Ao criar, omita: a camada confiável gera a identidade."
});
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
const generatedCourseSourceIdSchema = stringSchema({
  minLength: 1,
  maxLength: 2_048,
  pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F]+$",
  description:
    "Quando expectedSourceRevision=0, omita: a camada confiável gera a identidade. " +
    "Em revisão maior que zero, preserve a identidade lida da Fonte existente."
});
const generatedCourseSourceAnchorIdSchema = stringSchema({
  minLength: 1,
  maxLength: 240,
  pattern: COURSE_SOURCE_NO_CONTROL_PATTERN,
  description:
    "Quando expectedAnchorRevision=0, omita: a camada confiável gera a identidade. " +
    "Em revisão maior que zero, preserve a identidade lida da Âncora existente."
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
      annotationId: generatedUuidSchema,
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
    }, ["type", "target", "rawText", "category", "capturedAt", "briefSummary", "confirmed"]),
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

const pdfSourceInputSchema = {
  ...objectSchema(sourceDocumentSchema.properties, ["title"]),
  description:
    "Ao criar uma Fonte para o PDF, informe o título e somente os metadados conhecidos. " +
    "O AraLearn registra lacunas com valores conservadores; nunca invente dados bibliográficos. " +
    "Ao revisar uma Fonte existente, preserve e envie o documento bibliográfico completo."
};

const sourceCommandSchema = {
  oneOf: [
    {
      ...objectSchema({
      type: { const: "save_source" },
      sourceId: generatedCourseSourceIdSchema,
      expectedSourceRevision: { type: "integer", minimum: 0 },
      source: sourceDocumentSchema
      }, ["type", "expectedSourceRevision", "source"]),
      ...identityRequiredUnlessNew("sourceId", "expectedSourceRevision")
    },
    objectSchema({
      type: { const: "retire_source" },
      sourceId: legacySourceIdSchema,
      expectedSourceRevision: { type: "integer", minimum: 1 }
    }),
    {
      ...objectSchema({
      type: { const: "save_anchor" },
      anchorId: generatedCourseSourceAnchorIdSchema,
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
      }, ["type", "sourceId", "sourceRevision", "expectedAnchorRevision", "selector", "verificationExcerpt"]),
      ...identityRequiredUnlessNew("anchorId", "expectedAnchorRevision")
    },
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
    {
      ...objectSchema({
        type: { const: "remove_pdf" },
        sourceId: {
          ...legacySourceIdSchema,
          description: "Use a identidade da Fonte lida."
        },
        expectedSourceRevision: {
          type: "integer",
          minimum: 1,
          description: "Use a revisão corrente lida."
        },
        contentHash: stringSchema({
          pattern: "^[a-f0-9]{64}$",
          description: "Use o identificador do PDF ativo lido."
        })
      }),
      description:
        "Remove só o PDF ativo; mantém Fonte, citação, bibliografia, Âncoras e vínculos."
    },
    objectSchema({
      type: { const: "set_target_sources" },
      targetKind: stringSchema({ enum: ["plan_item", "study_unit"] }),
      targetId: legacySourceIdSchema,
      expectedTargetVersion: { type: "integer", minimum: 1 },
      sourceLinks: sourceLinksSchemaReference
    })
  ]
};

const courseSourcePdfIntentSchema = {
  oneOf: [
    objectSchema({
      mode: { const: "existing" },
      sourceId: legacySourceIdSchema,
      sourceRevision: { type: "integer", minimum: 1 }
    }),
    objectSchema({
      mode: { const: "save" },
      sourceId: {
        anyOf: [legacySourceIdSchema, { type: "null" }],
        description:
          "Use null somente ao criar, com expectedSourceRevision=0; " +
          "em revisão maior que zero, preserve a identidade lida da Fonte."
      },
      expectedSourceRevision: { type: "integer", minimum: 0 },
      source: pdfSourceInputSchema
    })
  ]
};

const temporaryPdfFileSchema = objectSchema({
  download_url: stringSchema({
    minLength: 8,
    maxLength: 8_192,
    pattern: "^https://[^\\s]+$"
  }),
  file_id: stringSchema({
    minLength: 1,
    maxLength: 240,
    pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
  }),
  mime_type: stringSchema({ enum: ["application/pdf"] }),
  file_name: stringSchema({
    minLength: 1,
    maxLength: 500,
    pattern: COURSE_SOURCE_NO_CONTROL_PATTERN
  })
}, ["download_url", "file_id"]);

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
  checkId: generatedUuidSchema,
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
}, [
  "dimension", "criterion", "result", "publicEvidence", "adequacy",
  "planItemRefs", "parameterRefs", "sourceLinks"
]);
const auditChecksSchema = {
  type: "array", minItems: 3, maxItems: 31, uniqueItems: true,
  items: auditCheckSchema
};
const auditFindingInputSchema = {
  ...objectSchema({
  findingId: generatedUuidSchema,
  checkId: stringSchema({
    pattern: UUID_PATTERN.source,
    description:
      "Use somente para uma verificação do mesmo comando cujo ID foi fornecido " +
      "explicitamente por compatibilidade; para verificação nova sem ID, use checkIndex."
  }),
  checkIndex: {
    type: "integer",
    minimum: 0,
    maximum: 30,
    description:
      "Índice zero-based da verificação nova no mesmo comando; use exatamente " +
      "um de checkId ou checkIndex."
  },
  code: auditCodeSchema,
  severity: stringSchema({ enum: [...COURSE_AUDIT_SEVERITIES] }),
  annotationRefs: {
    type: "array", maxItems: 12, uniqueItems: true,
    items: objectSchema({
      annotationId: uuidSchema,
      annotationVersion: { type: "integer", minimum: 1 }
    })
  }
  }, ["code", "severity", "annotationRefs"]),
  ...exactlyOneReference("checkId", "checkIndex")
};
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
      auditRunId: generatedUuidSchema,
      targetStudyUnitId: anchoredAnnotationOpaqueIdSchema,
      contextHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
      origin: stringSchema({ enum: [...COURSE_AUDIT_ORIGINS] }),
      method: auditMethodSchema,
      checks: auditChecksSchema,
      findings: {
        type: "array", maxItems: 15, uniqueItems: true,
        items: auditFindingInputSchema
      }
    }, ["type", "targetStudyUnitId", "contextHash", "origin", "method", "checks", "findings"]),
    {
      ...objectSchema({
      type: { const: "propose_authoring_correction" },
      correctionId: stringSchema({
        pattern: UUID_PATTERN.source,
        description:
          "Quando expectedCorrectionVersion=0, omita: a camada confiável gera a identidade. " +
          "Em versão maior que zero, preserve a identidade lida da correção existente."
      }),
      findingId: uuidSchema,
      expectedFindingVersion: { type: "integer", minimum: 1 },
      expectedCorrectionVersion: { type: "integer", minimum: 0 },
      afterContent: { type: "object" },
      afterSourceLinks: sourceLinksSchemaReference,
      rationale: auditLayoutTextSchema(2_000)
    }, [
      "type", "findingId", "expectedFindingVersion", "expectedCorrectionVersion",
      "afterContent", "afterSourceLinks", "rationale"
      ]),
      ...identityRequiredUnlessNew("correctionId", "expectedCorrectionVersion")
    },
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
      auditRunId: generatedUuidSchema,
      ...auditCommandRefsSchema,
      contextHash: stringSchema({ pattern: "^[a-f0-9]{64}$" }),
      origin: stringSchema({ enum: [...COURSE_AUDIT_ORIGINS] }),
      method: auditMethodSchema,
      checks: auditChecksSchema,
      outcome: stringSchema({ enum: ["resolved", "still_open"] })
    }, [
      "type", "findingId", "expectedFindingVersion", "correctionId",
      "expectedCorrectionVersion", "contextHash", "origin", "method", "checks", "outcome"
    ])
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
      type: { const: "add_plan_item" }, kind: planItemKindSchema, id: generatedUuidSchema,
      position: { type: "integer", minimum: 0, maximum: 255 },
      statement: stringSchema({ minLength: 1, maxLength: 2_000 }),
      sourceLinks: sourceLinksSchemaReference
    }, ["type", "kind", "position", "statement", "sourceLinks"]),
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
      type: { const: "add_part" }, id: generatedUuidSchema,
      position: {
        type: "integer",
        minimum: 0,
        maximum: 63,
        description: "Índice zero-based na lista atual; use 0 para a primeira Parte."
      },
      title: stringSchema({ minLength: 1, maxLength: 300 }), intent: partIntentSchema
    }, ["type", "position", "title", "intent"]),
    objectSchema({
      type: { const: "update_part" }, id: uuidSchema,
      title: stringSchema({ minLength: 1, maxLength: 300 }), intent: partIntentSchema
    }, ["type", "id", "title", "intent"]),
    objectSchema({ type: { const: "remove_part" }, id: uuidSchema }),
    objectSchema({ type: { const: "reorder_parts" }, orderedIds: planItemIdListSchema(64) }),
    objectSchema({
      type: { const: "split_part" }, partId: uuidSchema, newPartId: generatedUuidSchema,
      newPartPosition: { type: "integer", minimum: 0, maximum: 63 },
      title: stringSchema({ minLength: 1, maxLength: 300 }), intent: partIntentSchema,
      microsequenceIds: {
        type: "array", maxItems: 64, uniqueItems: true, items: microsequenceIdSchema
      }
    }, [
      "type", "partId", "newPartPosition", "title", "intent",
      "microsequenceIds"
    ]),
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

const courseStudyUnitScopeSchema = {
  oneOf: [
    objectSchema({ kind: { const: "course" } }),
    objectSchema({ kind: { const: "unassigned" } }),
    objectSchema({ kind: { const: "authoring_part" }, id: uuidSchema }),
    ...["module", "lesson", "didactic_microsequence"].map((kind) => objectSchema({
      kind: { const: kind },
      id: stringSchema({ minLength: 1, maxLength: 240 })
    }))
  ]
};

const courseDesignScopeSchema = objectSchema({
  kind: stringSchema({ enum: [
    "course", "module", "lesson", "didactic_microsequence"
  ] }),
  ref: stringSchema({
    minLength: 1,
    maxLength: 240,
    description: "Quando kind é course, repete courseId."
  })
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
      comparisonSetId: generatedUuidSchema,
      expectedCourseRevision: {
        type: "integer",
        minimum: 1,
        description: "Repete expectedRevision do envelope da alteração."
      },
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
    }, ["type", "expectedCourseRevision", "variants"]),
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
  branchOf: nullableString(stringSchema({
    minLength: 1,
    maxLength: 240,
    description:
      "Identidade de uma Microssequência existente da mesma Lição; para uma nova " +
      "no mesmo lote, use branchOfUpsertIndex."
  })),
  branchOfUpsertIndex: {
    type: "integer",
    minimum: 0,
    maximum: 199,
    description:
      "Índice zero-based de outra Microssequência nova da mesma Lição no mesmo lote."
  },
  dependsOn: {
    ...entityTextListSchema,
    description:
      "Identidades de Microssequências existentes e anteriores da mesma Lição; " +
      "para novas no mesmo lote, use dependsOnUpsertIndexes."
  },
  dependsOnUpsertIndexes: {
    type: "array",
    maxItems: 200,
    uniqueItems: true,
    items: { type: "integer", minimum: 0, maximum: 199 },
    description:
      "Índices zero-based de Microssequências novas, anteriores e da mesma Lição, " +
      "adicionados às referências de dependsOn."
  },
  covers: entityTextListSchema,
  checks: entityTextListSchema,
  errors: entityTextListSchema
}, ["title", "goal", "role", "dependsOn", "covers", "checks"]);
const generatedCourseEntityIdSchema = stringSchema({
  minLength: 1,
  maxLength: 240,
  description:
    "Presente significa entidade existente; ausente cria uma identidade na camada confiável."
});
const courseEntitySchemaFor = ({ entityType, parentType, positionMinimum = 0, content }) => ({
  ...objectSchema({
    entityType: { const: entityType },
    entityId: generatedCourseEntityIdSchema,
    parentType: parentType == null ? { type: "null" } : { const: parentType },
    parentId: parentType == null ? { type: "null" } : stringSchema({
      minLength: 1,
      maxLength: 240,
      description:
        "Use somente para um pai existente; para um pai novo no mesmo lote, " +
        "omita parentId e use parentUpsertIndex."
    }),
    ...(parentType == null ? {} : {
      parentUpsertIndex: {
        type: "integer",
        minimum: 0,
        maximum: 199,
        description:
          "Índice zero-based do pai novo no mesmo lote; use exatamente um de " +
          "parentId ou parentUpsertIndex."
      }
    }),
    position: { type: "integer", minimum: positionMinimum },
    content
  }, ["entityType", "parentType", "position", "content"]),
  ...(parentType == null ? {} : exactlyOneReference("parentId", "parentUpsertIndex"))
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
  id: generatedUuidSchema,
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
}, ["position", "kind", "targetDidacticMicrosequenceId", "productionPosition"]);
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
    items: {
      ...objectSchema({
      studyUnitId: stringSchema({
        minLength: 1,
        maxLength: 240,
        description:
          "Use somente para uma Unidade existente; para uma Unidade nova no mesmo lote, " +
          "omita studyUnitId e use studyUnitUpsertIndex."
      }),
      studyUnitUpsertIndex: {
        type: "integer",
        minimum: 0,
        maximum: 63,
        description:
          "Índice zero-based da Unidade nova em entityChanges.upserts; use exatamente " +
          "um de studyUnitId ou studyUnitUpsertIndex."
      },
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
      }, [
        "mode", "introducedInstructionalAnalysisUnitIds", "explanationApplications",
        "practiceApplications", "componentRefs"
      ]),
      ...exactlyOneReference("studyUnitId", "studyUnitUpsertIndex")
    }
  }
});
designApplicationSchema.description =
  "Na conclusão didática, descreve as mesmas Unidades de entityChanges.";

const sourceAttributionStudyUnitSchema = {
  ...objectSchema({
    studyUnitId: stringSchema({
      minLength: 1,
      maxLength: 240,
      description:
        "Use somente para uma Unidade existente; para uma Unidade nova no mesmo lote, " +
        "omita studyUnitId e use studyUnitUpsertIndex."
    }),
    studyUnitUpsertIndex: {
      type: "integer",
      minimum: 0,
      maximum: 199,
      description:
        "Índice zero-based da Unidade nova em upserts; use exatamente um de " +
        "studyUnitId ou studyUnitUpsertIndex."
    },
    sourceLinks: sourceLinksSchemaReference
  }, ["sourceLinks"]),
  ...exactlyOneReference("studyUnitId", "studyUnitUpsertIndex")
};
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
  materializationId: stringSchema({
    pattern: UUID_PATTERN.source,
    description:
      "Ao iniciar, omita: a camada confiável gera a identidade. " +
      "Em record_step ou finish, preserve o UUID lido da materialização existente."
  }),
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
  }, ["operation", "authoringPartId", "expectedMaterializationVersion"]),
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
        "materializationId", "stepId", "expectedStepVersion", "status", "entityChanges",
        "designApplication", "sourceAttributionApplication"
      ],
      properties: {
        materializationId: uuidSchema,
        expectedMaterializationVersion: { minimum: 1 }
      },
      ...forbidFields(["authoringPartVersion", "steps"])
    }
  }, {
    if: { properties: { operation: { const: "finish" } }, required: ["operation"] },
    then: {
      required: ["materializationId", "status"],
      properties: {
        materializationId: uuidSchema,
        expectedMaterializationVersion: { minimum: 1 }
      },
      ...forbidFields([
        "authoringPartVersion", "steps", "stepId", "expectedStepVersion",
        "designApplication", "sourceAttributionApplication", "entityChanges"
      ])
    }
  }]
};

export const AUTHORING_CONVERSATION_SCHEMA = Object.freeze(objectSchema({
  contract: { const: "aralearn.conversational-authoring-projection.v1" },
  kind: stringSchema({ enum: [
    "resumption_not_found", "resumption_disambiguation", "resumption",
    "confirmation", "success", "error"
  ] }),
  level: stringSchema({ enum: ["standard", "operational", "diagnostic", "technical"] }),
  message: stringSchema({ minLength: 1, maxLength: 12_000 }),
  needsHumanDecision: { type: "boolean" },
  choices: {
    type: "array", maxItems: 50,
    items: stringSchema({ minLength: 1, maxLength: 500 })
  },
  success: { type: "boolean" },
  action: objectSchema({
    label: stringSchema({ minLength: 1, maxLength: 160 })
  }, ["label"]),
  classification: stringSchema({ enum: [
    "conflict", "limit", "validation", "access", "uncertain", "failure"
  ] }),
  writeState: stringSchema({ enum: ["none", "partial", "complete", "unknown"] }),
  retrySafe: { type: "boolean" },
  reloadRequired: { type: "boolean" },
  concurrencyConflict: { type: "boolean" },
  technicalDetails: { type: "object" }
}, ["contract", "kind", "level", "message"]));

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

export const AUTHORING_PROTOCOL_V1_TOOLS = Object.freeze([
  Object.freeze({
    name: "listarCursos",
    title: "Listar Cursos",
    description: "Lista os Cursos próprios. Na retomada, localize por título, use a correspondência única plausível e peça desambiguação humana se houver duplicidade; mantenha IDs e links apenas no estado estruturado.",
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
    description: "Lê o menor recorte necessário do Curso vivo. Use phaseGuidance focal, revisões e links silenciosamente; converse em linguagem de domínio e só revele detalhes técnicos sob pedido. Observação integral e download de PDF exigem as declarações do schema.",
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
      inspectionFocusId: uuidSchema,
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
          }, {
            if: {
              properties: { targetKind: { const: "plan_item" } },
              required: ["targetKind"]
            },
            then: { properties: { targetId: uuidSchema } }
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
            "annotationIds", "comparisonSetId", "byteSize", "mediaType"
          ])
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
          allOf: [
            forbidFields(["authoringPartId", "materializationId"]),
            { not: { required: ["cursor", "anchorStudyUnitId"] } }
          ],
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
          ]),
          properties: { limit: { maximum: 100 } }
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
    annotations: readAnnotations
  }),
  Object.freeze({
    name: "criarCurso",
    title: "Criar Curso",
    description: "Cria atomicamente um Curso privado e vazio. Confirme título, objetivo e próximo passo autoral; mantenha controles somente no estado estruturado.",
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
    description: "Altera o Curso por operação tipada. Em criações, omita a identidade opcional: a camada confiável a gera; preserve IDs apenas para entidades já lidas. Proponha antes de aplicar e verifique depois. Confirme efeitos pedagógicos e só revele detalhes técnicos sob pedido.",
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
        "advance_part_materialization",
        "create_inspection_focus"
      ] }),
      planCommand: authoringPlanCommandSchema,
      designCommand: courseDesignCommandSchema,
      sourceCommand: sourceCommandSchema,
      annotationCommand: anchoredAnnotationCommandSchema,
      auditCommand: auditCommandSchema,
      variantCommand: courseVariantCommandSchema,
      materializationCommand: materializationCommandSchema,
      inspectionFocus: objectSchema({
        title: stringSchema({ minLength: 1, maxLength: 160 }),
        studyUnitIds: {
          type: "array", minItems: 1, maxItems: 64, uniqueItems: true,
          items: stringSchema({ minLength: 1, maxLength: 240 })
        }
      }, ["title", "studyUnitIds"]),
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
          properties: { operation: { const: "create_inspection_focus" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedRevision", "inspectionFocus"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand", "sourceCommand",
            "annotationCommand", "auditCommand", "variantCommand", "materializationCommand",
            "upserts", "deletes", "sourceAttributionApplications"
          ])
        },
        else: forbidFields(["inspectionFocus"])
      }, {
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
          ]),
          allOf: [{
            if: {
              properties: {
                variantCommand: {
                  properties: { type: { const: "create_comparison_variants" } },
                  required: ["type"]
                }
              },
              required: ["variantCommand"]
            },
            then: { required: ["expectedRevision"] }
          }, {
            if: {
              properties: {
                variantCommand: {
                  properties: { type: { const: "detach_comparison_variant" } },
                  required: ["type"]
                }
              },
              required: ["variantCommand"]
            },
            then: forbidFields(["expectedRevision"])
          }]
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
    name: "incorporarPdfComoFonte",
    title: "Incorporar PDF como Fonte",
    description: "Mantém um PDF anexado entre as Fontes permanentes do Curso quando esse efeito estiver inequívoco ou confirmado. Não use para análise descartável; diante de ambiguidade real, faça uma única pergunta curta. Referência e metadados são machine-facing: nunca os fabrique nem os mostre por padrão.",
    inputSchema: objectSchema({
      requestId: requestIdSchema,
      courseId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      sourceIntent: courseSourcePdfIntentSchema,
      pdf: temporaryPdfFileSchema
    }),
    outputSchema,
    annotations: courseChangeAnnotations
  }),
  Object.freeze({
    name: "consultarComponentesDidaticos",
    title: "Consultar componentes didáticos",
    description: "Explora, pesquisa, inspeciona, valida e abre a prévia dos componentes didáticos instalados sem carregar contratos desnecessários no contexto. contracts aceita exatamente um package por chamada.",
    inputSchema: {
      oneOf: [
        objectSchema({
          operation: { const: "explore" },
          slot: stringSchema({ enum: ["content", "response", "feedback"] })
        }, ["operation"]),
        objectSchema({
          operation: { const: "search" },
          query: stringSchema({ maxLength: 500 }),
          intent: stringSchema({ maxLength: 2_000 }),
          slot: stringSchema({ enum: ["content", "response", "feedback"] }),
          limit: { type: "integer", minimum: 1, maximum: 8 }
        }, ["operation"]),
        objectSchema({
          operation: { const: "inspect" },
          packages: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            uniqueItems: true,
            items: stringSchema({ minLength: 1, maxLength: 160 })
          }
        }, ["operation", "packages"]),
        objectSchema({
          operation: { const: "contracts" },
          packages: {
            type: "array",
            minItems: 1,
            maxItems: 1,
            uniqueItems: true,
            items: stringSchema({ minLength: 1, maxLength: 160 })
          }
        }, ["operation", "packages"]),
        objectSchema({
          operation: { const: "validate_study_unit" },
          studyUnitJson: stringSchema({ minLength: 2, maxLength: 40_000 })
        }, ["operation", "studyUnitJson"]),
        objectSchema({
          operation: { const: "audit_representation" },
          studyUnitJson: stringSchema({ minLength: 2, maxLength: 40_000 }),
          query: stringSchema({ maxLength: 500 }),
          intent: stringSchema({ maxLength: 2_000 }),
          slot: stringSchema({ enum: ["content", "response", "feedback"] })
        }, ["operation", "studyUnitJson"]),
        objectSchema({
          operation: { const: "preview_study_unit" },
          studyUnitJson: stringSchema({ minLength: 2, maxLength: 40_000 })
        }, ["operation", "studyUnitJson"]),
        objectSchema({
          operation: { const: "preview_study_unit" },
          studyUnitJson: stringSchema({ minLength: 2, maxLength: 40_000 }),
          courseId: uuidSchema,
          studyUnitId: stringSchema({ minLength: 1, maxLength: 240 })
        }, ["operation", "studyUnitJson", "courseId", "studyUnitId"])
      ]
    },
    outputSchema,
    annotations: readAnnotations
  })
]);

export const AUTHORING_PROTOCOL_V1_SCHEMA_HASH =
  "sha256:739ad6a53a1f3488165706f4246ad28cbc2607a0174038e5c526a349e93e904f";

const protocolTool = (name) =>
  AUTHORING_PROTOCOL_V1_TOOLS.find((tool) => tool.name === name);

const discriminatorValues = (schema, property = "type") =>
  Object.freeze([...new Set((schema?.oneOf || []).map((branch) =>
    branch?.properties?.[property]?.const
      ?? branch?.properties?.[property]?.enum?.[0]
  ).filter((value) => typeof value === "string"))]);

const readSchema = protocolTool("lerCurso").inputSchema;
const changeSchema = protocolTool("alterarCurso").inputSchema;
const componentSchema = protocolTool("consultarComponentesDidaticos").inputSchema;

export const AUTHORING_PROTOCOL_V1_VOCABULARY = Object.freeze({
  tools: Object.freeze(AUTHORING_PROTOCOL_V1_TOOLS.map(({ name }) => name)),
  readViews: Object.freeze([...readSchema.properties.view.enum]),
  changeOperations: Object.freeze([...changeSchema.properties.operation.enum]),
  planCommandTypes: discriminatorValues(changeSchema.properties.planCommand),
  designCommandTypes: discriminatorValues(changeSchema.properties.designCommand),
  sourceCommandTypes: discriminatorValues(changeSchema.properties.sourceCommand),
  annotationCommandTypes: discriminatorValues(changeSchema.properties.annotationCommand),
  auditCommandTypes: discriminatorValues(changeSchema.properties.auditCommand),
  variantCommandTypes: discriminatorValues(changeSchema.properties.variantCommand),
  materializationOperations: Object.freeze([
    ...changeSchema.properties.materializationCommand.properties.operation.enum
  ]),
  componentOperations: discriminatorValues(componentSchema, "operation")
});
