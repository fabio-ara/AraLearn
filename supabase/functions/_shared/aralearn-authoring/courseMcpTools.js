import { AuthoringApiError } from "./errors.js";
import { COURSE_COMPONENT_CATALOG_VERSION } from
  "../aralearn/runtime/domain/courseDesignParameters.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const COMPONENT_REF_PATTERN = /^[a-z][a-z0-9._-]{2,119}@[0-9]+\.[0-9]+\.[0-9]+$/u;

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
const courseDesignCommandSchema = {
  oneOf: [
    {
      ...objectSchema({
      type: { const: "set_parameter" },
      scope: courseDesignParameterScopeSchema,
      parameterId: parameterIdSchema,
      value: parameterValueSchema,
      origin: designWriteOriginSchema,
      reason: stringSchema({ minLength: 1, maxLength: 1_000 })
      }),
      allOf: [{
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
        items: stringSchema({ pattern: COMPONENT_REF_PATTERN.source, maxLength: 160 })
      }
    })
  }
});

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
  resultFacts: { type: "object" },
  designApplication: nullableString(designApplicationSchema),
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
  }, ["operation", "authoringPartId", "materializationId", "expectedMaterializationVersion"]),
  allOf: [{
    if: { properties: { operation: { const: "start" } }, required: ["operation"] },
    then: {
      required: ["authoringPartVersion", "steps"],
      properties: { expectedMaterializationVersion: { const: 0 } },
      ...forbidFields([
        "stepId", "expectedStepVersion", "status", "resultFacts",
        "designApplication", "entityChanges"
      ])
    }
  }, {
    if: { properties: { operation: { const: "record_step" } }, required: ["operation"] },
    then: {
      required: [
        "stepId", "expectedStepVersion", "status", "resultFacts", "entityChanges",
        "designApplication"
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
        "designApplication", "entityChanges"
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
    description: "Lê o estado corrente de um Curso. Use instructional_plan para planejar por Partes, course_design para parâmetros, orientações e regras de componentes no escopo, study_units para inspecionar Unidades de estudo, part_materialization para retomar uma materialização, outline para a hierarquia compacta e entities somente para alterações estruturais.",
    inputSchema: {
      ...objectSchema({
      courseId: uuidSchema,
      view: stringSchema({ enum: [
        "summary", "outline", "instructional_plan", "course_design",
        "part_materialization", "study_units", "entities"
      ] }),
      authoringPartId: uuidSchema,
      materializationId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
      cursor: {
        anyOf: [
          courseEntityCursorSchema,
          courseStudyUnitCursorSchema,
          stringSchema({ minLength: 1, maxLength: 240 }),
          { type: "null" }
        ]
      },
      scope: { anyOf: [courseStudyUnitScopeSchema, courseDesignScopeSchema] },
      anchorStudyUnitId: stringSchema({ minLength: 1, maxLength: 240 }),
      direction: stringSchema({ enum: ["forward", "backward"] }),
      maxBytes: { type: "integer", minimum: 65_536, maximum: 1_500_000 }
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
    description: "Altera o plano instrucional vivo, os parâmetros e regras de Autoria, a composição ou uma materialização retomável de Parte. Releia a vista correspondente antes e use as versões correntes; cada alteração é limitada e idempotente.",
    inputSchema: {
      ...objectSchema({
      requestId: requestIdSchema,
      courseId: uuidSchema,
      expectedRevision: { type: "integer", minimum: 1 },
      expectedPlanVersion: { type: "integer", minimum: 1 },
      operation: stringSchema({ enum: [
        "update_instructional_plan",
        "update_course_design",
        "commit_course_composition",
        "advance_part_materialization"
      ] }),
      planCommand: authoringPlanCommandSchema,
      designCommand: courseDesignCommandSchema,
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
      allOf: [{
        if: {
          properties: { operation: { const: "update_course_design" } },
          required: ["operation"]
        },
        then: {
          required: ["designCommand"],
          not: { anyOf: [
            { required: ["expectedPlanVersion"] },
            { required: ["planCommand"] },
            { required: ["materializationCommand"] },
            { required: ["upserts"] },
            { required: ["deletes"] }
          ] }
        }
      }, {
        if: {
          properties: { operation: { const: "update_instructional_plan" } },
          required: ["operation"]
        },
        then: {
          required: ["expectedPlanVersion", "planCommand"],
          ...forbidFields([
            "designCommand", "materializationCommand", "upserts", "deletes"
          ])
        }
      }, {
        if: {
          properties: { operation: { const: "commit_course_composition" } },
          required: ["operation"]
        },
        then: {
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand",
            "materializationCommand"
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
          required: ["materializationCommand"],
          ...forbidFields([
            "expectedPlanVersion", "planCommand", "designCommand", "upserts", "deletes"
          ])
        }
      }]
    },
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
    "summary", "outline", "instructional_plan", "course_design",
    "part_materialization", "study_units", "entities"
  ]).has(view)) {
    fail("invalid_tool_argument", "view é inválida.", { field: "view" });
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

function mapChange(raw) {
  exactFields(raw, new Set([
    "requestId", "courseId", "expectedRevision", "expectedPlanVersion",
    "operation", "planCommand", "designCommand", "materializationCommand",
    "upserts", "deletes"
  ]));
  const requestId = requiredRequestId(raw.requestId);
  const courseId = requiredUuid(raw.courseId, "courseId");
  const operation = requiredText(raw.operation, "operation", { maximum: 40 });
  if (!new Set([
    "update_instructional_plan",
    "update_course_design",
    "commit_course_composition",
    "advance_part_materialization"
  ]).has(operation)) {
    fail("invalid_tool_argument", "operation é inválida.", { field: "operation" });
  }
  const expectedRevision = positiveInteger(raw.expectedRevision, "expectedRevision");
  if (operation === "update_instructional_plan") {
    if (raw.designCommand != null || raw.materializationCommand != null ||
        raw.upserts != null || raw.deletes != null) {
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
  if (operation === "update_course_design") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.materializationCommand != null || raw.upserts != null || raw.deletes != null) {
      fail("invalid_tool_argument", "O comando dos parâmetros recebeu campos incompatíveis.");
    }
    const command = boundedJsonObject(raw.designCommand, "designCommand", 32 * 1024);
    return route("POST", `/v1/courses/${courseId}/course-design/changes`, requestId, {
      requestId,
      expectedCourseRevision: expectedRevision,
      command
    });
  }
  if (operation === "commit_course_composition") {
    if (raw.expectedPlanVersion != null || raw.planCommand != null ||
        raw.designCommand != null || raw.materializationCommand != null) {
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
  if (raw.expectedPlanVersion != null || raw.planCommand != null ||
      raw.designCommand != null || raw.upserts != null || raw.deletes != null) {
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
      "resultFacts", "entityChanges", "designApplication"
    ]));
    if (!Object.hasOwn(command, "designApplication")) {
      fail(
        "invalid_tool_argument",
        "record_step precisa declarar designApplication como objeto ou null."
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
