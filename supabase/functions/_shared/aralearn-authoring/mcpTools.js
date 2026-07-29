import { AuthoringApiError } from "./errors.js";
import { validateRequestId, validateRunId } from "./protocol.js";
import { listAuthoringResourceContracts } from "../aralearn/runtime/core/authoringResourceContract.js";
import { FLOWCHART_STRUCTURE_INPUT_SCHEMA } from "../aralearn/runtime/flowchart/flowchartStructure.js";
import {
  COMPOSITE_BLOCK_INPUT_SCHEMA
} from "../aralearn/runtime/domain/cards.js";
import {
  FORMULA_EXPRESSION_INPUT_SCHEMA
} from "../aralearn/runtime/domain/formulaExpression.js";
import { AUTHORING_PLAN_LIMITS } from "./planLimits.js";
import {
  getResourceDefinition,
  listResourceIds
} from "../aralearn/runtime/resources/registry/index.js";

const REQUEST_ID = Object.freeze({
  type: "string",
  minLength: 8,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$",
  description: "Identificador estável desta operação. Repita-o somente com os mesmos dados."
});
const RUN_ID = Object.freeze({
  type: "string",
  format: "uuid",
  description: "Identificador da execução de autoria."
});
const CATALOG_UUID = Object.freeze({
  type: "string",
  format: "uuid",
  description: "Identificador UUID devolvido pela própria API do catálogo."
});
const PERSONAL_LIBRARY_UUID = Object.freeze({
  type: "string",
  format: "uuid",
  description: "Identificador UUID devolvido pela biblioteca pessoal."
});
const PART_KEY = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
  description: "Identificador da parte no plano."
});
const SHA256 = Object.freeze({ type: "string", pattern: "^[a-f0-9]{64}$" });

function objectSchema(required, properties) {
  return Object.freeze({
    type: "object",
    additionalProperties: false,
    required,
    properties
  });
}

function writeSchema(required, properties) {
  return objectSchema(["requestId", ...required], { requestId: REQUEST_ID, ...properties });
}

function readSchema(required, properties) {
  return objectSchema(required, properties);
}

function tool(name, title, description, inputSchema, annotations = {}) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema,
    annotations: Object.freeze({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      ...annotations
    })
  });
}

const IDENTIFIER = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
});
const NON_EMPTY_TEXT = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 20000,
  pattern: "\\S"
});
const CANONICAL_SET_ITEM = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: AUTHORING_PLAN_LIMITS.stringSetItemLength,
  pattern: "^\\S(?:[\\s\\S]*\\S)?$"
});
const CARD_RESOURCE_SCHEMA = Object.freeze({
  type: "string",
  enum: listResourceIds()
});
const LANGUAGE_TAG = Object.freeze({
  type: "string",
  minLength: 2,
  maxLength: 63,
  pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$"
});
const PUBLICATION_INTENT_CREATE_SCHEMA = objectSchema(["mode"], {
  mode: { type: "string", const: "create" }
});
const PUBLICATION_INTENT_UPDATE_SCHEMA = objectSchema(
  ["mode", "existingCourseId", "expectedContentHash"],
  {
    mode: { type: "string", const: "update" },
    existingCourseId: RUN_ID,
    expectedContentHash: SHA256
  }
);
const PUBLICATION_INTENT_SCHEMA = Object.freeze({
  oneOf: [
    PUBLICATION_INTENT_CREATE_SCHEMA,
    PUBLICATION_INTENT_UPDATE_SCHEMA
  ]
});
const AUDIT_GATE_NAMES = Object.freeze([
  "planAlignment",
  "contract",
  "outcomeCoverage",
  "sources",
  "continuity",
  "interactionCoherence",
  "language",
  "fieldPreservation",
  "structuredElements",
  "feedback"
]);
const AUDIT_GATES_SCHEMA = objectSchema(
  AUDIT_GATE_NAMES,
  Object.fromEntries(AUDIT_GATE_NAMES.map((gate) => [gate, { type: "boolean" }]))
);
const AUDIT_FINDING_SCHEMA = objectSchema(
  [
    "issueId",
    "severity",
    "gate",
    "pointer",
    "observed",
    "requiredChange",
    "preserveFields",
    "acceptanceTest"
  ],
  {
    issueId: IDENTIFIER,
    severity: { type: "string", enum: ["error", "warning"] },
    gate: { type: "string", enum: AUDIT_GATE_NAMES },
    pointer: { type: "string", minLength: 1, maxLength: 1000, pattern: "^/" },
    observed: { type: "string", minLength: 1, maxLength: 4000 },
    requiredChange: { type: "string", minLength: 1, maxLength: 4000 },
    preserveFields: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", minLength: 1, pattern: "^/" }
    },
    acceptanceTest: { type: "string", minLength: 1, maxLength: 4000 }
  }
);
const STRING_SET = Object.freeze({
  type: "array",
  maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
  uniqueItems: true,
  items: CANONICAL_SET_ITEM
});
const GUIDE_SCHEMA = objectSchema(
  ["goal", "include", "exclude", "notation", "avoid"],
  {
    goal: NON_EMPTY_TEXT,
    include: STRING_SET,
    exclude: STRING_SET,
    notation: STRING_SET,
    avoid: STRING_SET
  }
);
const TOPIC_SCHEMA = objectSchema(
  ["id", "label", "kind", "checks", "errors"],
  {
    id: IDENTIFIER,
    label: NON_EMPTY_TEXT,
    kind: {
      type: "string",
      enum: ["concept", "procedure", "representation", "term"]
    },
    checks: STRING_SET,
    errors: STRING_SET
  }
);
const OWNERSHIP_SCHEMA = objectSchema(
  ["courseId", "moduleId", "lessonId", "microsequenceIds"],
  {
    courseId: IDENTIFIER,
    moduleId: IDENTIFIER,
    lessonId: IDENTIFIER,
    microsequenceIds: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: IDENTIFIER
    }
  }
);
const LEDGER_MANIFEST_SECTION_SCHEMA = Object.freeze({
  ...objectSchema(["chunkCount", "itemCount"], {
    chunkCount: { type: "integer", minimum: 0, maximum: 1000 },
    itemCount: { type: "integer", minimum: 0, maximum: 100000 }
  }),
  allOf: [{
    if: {
      properties: { chunkCount: { const: 0 } },
      required: ["chunkCount"]
    },
    then: { properties: { itemCount: { const: 0 } } },
    else: { properties: { itemCount: { type: "integer", minimum: 1 } } }
  }]
});
const LEDGER_MANIFEST_SCHEMA = objectSchema(
  ["artifact", "version", "runId", "sections", "openIssues"],
  {
    artifact: { type: "string", const: "aralearn.course-ledger-manifest" },
    version: { type: "integer", const: 1 },
    runId: RUN_ID,
    sections: objectSchema(["sources", "claims", "terms"], {
      sources: LEDGER_MANIFEST_SECTION_SCHEMA,
      claims: LEDGER_MANIFEST_SECTION_SCHEMA,
      terms: LEDGER_MANIFEST_SECTION_SCHEMA
    }),
    openIssues: {
      type: "array",
      maxItems: 500,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
        maxLength: AUTHORING_PLAN_LIMITS.stringSetItemLength
      }
    }
  }
);
const PART_OUTLINE_SCHEMA = objectSchema(
  [
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys", "ownership", "cardIds",
    "outcomeIds", "conceptIds", "operationIds", "misconceptionIds"
  ],
  {
    key: PART_KEY,
    title: { type: "string", minLength: 1, maxLength: 300 },
    boundary: NON_EMPTY_TEXT,
    cutReason: NON_EMPTY_TEXT,
    dependsOnPartKeys: {
      type: "array",
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: PART_KEY
    },
    ownership: OWNERSHIP_SCHEMA,
    cardIds: { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true, items: IDENTIFIER },
    outcomeIds: { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true, items: IDENTIFIER },
    conceptIds: { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true, items: IDENTIFIER },
    operationIds: { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true, items: IDENTIFIER },
    misconceptionIds: { type: "array", maxItems: 1000, uniqueItems: true, items: IDENTIFIER }
  }
);
const PLAN_PROJECT_SCHEMA = objectSchema(["contract", "version", "kind", "courses"], {
  contract: { type: "string", const: "aralearn.contract" },
  version: { type: "integer", const: 4 },
  kind: { type: "string", const: "project" },
  courses: {
    type: "array",
    minItems: 1,
    maxItems: 1,
    items: objectSchema(["id", "title", "goal", "modules"], {
      id: IDENTIFIER,
      title: NON_EMPTY_TEXT,
      goal: NON_EMPTY_TEXT,
      modules: {
        type: "array",
        minItems: 1,
        maxItems: AUTHORING_PLAN_LIMITS.modules,
        items: objectSchema(["id", "title", "guide", "lessons"], {
          id: IDENTIFIER,
          title: NON_EMPTY_TEXT,
          guide: GUIDE_SCHEMA,
          lessons: {
            type: "array",
            minItems: 1,
            items: objectSchema(["id", "title", "guide", "topics", "microsequences"], {
              id: IDENTIFIER,
              title: NON_EMPTY_TEXT,
              guide: GUIDE_SCHEMA,
              topics: { type: "array", items: TOPIC_SCHEMA },
              microsequences: { type: "array", maxItems: 0 }
            })
          }
        })
      }
    })
  }
});
const PLAN_COURSE_SCHEMA = objectSchema(
  [
    "id", "title", "goal", "audience", "prerequisites", "depth", "language", "include",
    "exclude", "notation", "modules"
  ],
  {
    id: IDENTIFIER,
    title: { type: "string", minLength: 1, maxLength: 240 },
    goal: NON_EMPTY_TEXT,
    audience: NON_EMPTY_TEXT,
    prerequisites: STRING_SET,
    depth: NON_EMPTY_TEXT,
    language: LANGUAGE_TAG,
    include: STRING_SET,
    exclude: STRING_SET,
    notation: STRING_SET,
    modules: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.modules,
      items: objectSchema(["id", "title", "goal", "lessonIds"], {
        id: IDENTIFIER,
        title: { type: "string", minLength: 1, maxLength: 240 },
        goal: NON_EMPTY_TEXT,
        lessonIds: {
          type: "array",
          minItems: 1,
          maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
          uniqueItems: true,
          items: IDENTIFIER
        }
      })
    }
  }
);
const PLAN_SCHEMA = objectSchema(
  [
    "artifact", "version", "runId", "project", "ledgerManifest", "course",
    "learningOutcomes", "operations", "misconceptions", "conceptMap", "parts",
    "acceptanceCriteria"
  ],
  {
    artifact: { type: "string", const: "aralearn.course-plan" },
    version: { type: "integer", const: 1 },
    runId: RUN_ID,
    project: PLAN_PROJECT_SCHEMA,
    ledgerManifest: LEDGER_MANIFEST_SCHEMA,
    course: PLAN_COURSE_SCHEMA,
    learningOutcomes: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.learningOutcomes,
      items: objectSchema(["id", "statement", "evidence"], {
        id: IDENTIFIER,
        statement: NON_EMPTY_TEXT,
        evidence: NON_EMPTY_TEXT
      })
    },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.operations,
      items: objectSchema(["id", "label", "evidence", "representation"], {
        id: IDENTIFIER,
        label: {
          type: "string",
          minLength: 1,
          maxLength: AUTHORING_PLAN_LIMITS.labelLength
        },
        evidence: NON_EMPTY_TEXT,
        representation: objectSchema(
          ["preferredResources", "allowedResources", "rationale"],
          {
            preferredResources: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              uniqueItems: true,
              items: CARD_RESOURCE_SCHEMA
            },
            allowedResources: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              uniqueItems: true,
              items: CARD_RESOURCE_SCHEMA
            },
            rationale: NON_EMPTY_TEXT
          }
        )
      })
    },
    misconceptions: {
      type: "array",
      maxItems: AUTHORING_PLAN_LIMITS.misconceptions,
      items: objectSchema(["id", "statement", "correctionEvidence"], {
        id: IDENTIFIER,
        statement: NON_EMPTY_TEXT,
        correctionEvidence: NON_EMPTY_TEXT
      })
    },
    conceptMap: objectSchema(["concepts", "relations"], {
      concepts: {
        type: "array",
        minItems: 1,
        maxItems: AUTHORING_PLAN_LIMITS.concepts,
        items: objectSchema(["id", "label"], {
          id: IDENTIFIER,
          label: {
            type: "string",
            minLength: 1,
            maxLength: AUTHORING_PLAN_LIMITS.labelLength
          }
        })
      },
      relations: {
        type: "array",
        maxItems: AUTHORING_PLAN_LIMITS.conceptRelations,
        items: objectSchema(
          ["from", "to", "relation"],
          {
            from: IDENTIFIER,
            to: IDENTIFIER,
            relation: {
              type: "string",
              enum: ["requires", "part_of", "contrasts", "represents", "applies", "causes"]
            }
          }
        )
      }
    }),
    parts: { type: "array", minItems: 1, maxItems: 256, items: PART_OUTLINE_SCHEMA },
    acceptanceCriteria: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
        maxLength: AUTHORING_PLAN_LIMITS.stringSetItemLength
      }
    }
  }
);
const MICROSEQUENCE_SPECIFICATION_SCHEMA = {
  ...objectSchema(
    [
      "id", "title", "goal", "role", "status", "dependsOn",
      "dependencyRationale", "covers", "checks", "errors"
    ],
    {
      id: IDENTIFIER,
      title: NON_EMPTY_TEXT,
      goal: NON_EMPTY_TEXT,
      role: { type: "string", enum: ["explain", "practice", "review", "support"] },
      status: { type: "string", const: "planned" },
      dependsOn: STRING_SET,
      dependencyRationale: {
        type: "object",
        additionalProperties: { type: "string", minLength: 1, maxLength: 4000 },
        description: "Obrigatório quando dependsOn contém alguma microssequência."
      },
      covers: STRING_SET,
      checks: STRING_SET,
      errors: STRING_SET
    }
  ),
  allOf: [{
    if: { properties: { dependsOn: { type: "array", minItems: 1 } }, required: ["dependsOn"] },
    then: { required: ["dependencyRationale"] }
  }]
};
const CARD_PLAN_ITEM_SCHEMA = Object.freeze({
  ...objectSchema(
  [
    "cardId", "microsequenceId", "position", "resource", "kind", "exercise", "purpose",
    "evidence", "outcomeIds", "operationId", "conceptIds", "retrievedConceptIds",
    "misconceptionIds", "learningFunction", "resourceRationale", "contextAnchors",
    "introducedTermIds", "requiredTermIds", "sourceIds"
  ],
  {
    cardId: IDENTIFIER,
    microsequenceId: IDENTIFIER,
    position: { type: "integer", minimum: 1 },
    resource: CARD_RESOURCE_SCHEMA,
    kind: { type: "string", enum: ["theory", "exercise"] },
    exercise: { type: "string", enum: ["none", "gap", "choice"] },
    purpose: NON_EMPTY_TEXT,
    evidence: NON_EMPTY_TEXT,
    outcomeIds: { type: "array", minItems: 1, uniqueItems: true, items: IDENTIFIER },
    operationId: IDENTIFIER,
    conceptIds: { type: "array", minItems: 1, uniqueItems: true, items: IDENTIFIER },
    retrievedConceptIds: { type: "array", uniqueItems: true, items: IDENTIFIER },
    misconceptionIds: { type: "array", uniqueItems: true, items: IDENTIFIER },
    codeLanguage: { type: "string", minLength: 1, maxLength: 80 },
    notation: { type: "string", enum: ["mathematics", "chemistry"] },
    languageTag: LANGUAGE_TAG,
    textDirection: { type: "string", enum: ["auto", "ltr", "rtl"] },
    targetError: NON_EMPTY_TEXT,
    learningFunction: {
      type: "string",
      enum: [
        "foundation", "worked_example", "guided_practice", "independent_practice", "contrast",
        "error_diagnosis", "integration"
      ]
    },
    resourceRationale: NON_EMPTY_TEXT,
    variationFocus: NON_EMPTY_TEXT,
    contextAnchors: {
      type: "array",
      maxItems: 50,
      uniqueItems: true,
      items: CANONICAL_SET_ITEM,
      description: "Trechos visíveis no card antes da resposta; não use identificadores internos."
    },
    introducedTermIds: STRING_SET,
    requiredTermIds: STRING_SET,
    sourceIds: STRING_SET,
    claimIds: STRING_SET
  }
  ),
  allOf: [{
    if: {
      properties: { resource: { const: "code" } },
      required: ["resource"]
    },
    then: { required: ["codeLanguage"] },
    else: { not: { required: ["codeLanguage"] } }
  }, {
    if: {
      properties: { resource: { const: "formula" } },
      required: ["resource"]
    },
    then: { required: ["notation"] },
    else: { not: { required: ["notation"] } }
  }, {
    if: {
      properties: { kind: { const: "exercise" } },
      required: ["kind"]
    },
    then: {
      required: ["targetError", "variationFocus"],
      properties: {
        learningFunction: {
          enum: [
            "guided_practice", "independent_practice", "contrast",
            "error_diagnosis", "integration"
          ]
        },
        contextAnchors: { type: "array", minItems: 1 }
      }
    },
    else: {
      properties: {
        learningFunction: { enum: ["foundation", "worked_example"] }
      }
    }
  }, {
    if: {
      properties: { learningFunction: { const: "error_diagnosis" } },
      required: ["learningFunction"]
    },
    then: {
      properties: { misconceptionIds: { type: "array", minItems: 1 } }
    }
  }]
});
const PART_SPECIFICATION_SCHEMA = objectSchema(
  [
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys", "ownership", "outcomeIds",
    "conceptIds", "operationIds", "misconceptionIds", "structure", "cardPlan",
    "allowedSourceIds", "availableTermIds", "preserve"
  ],
  {
    key: PART_KEY,
    title: { type: "string", minLength: 1, maxLength: 300 },
    boundary: NON_EMPTY_TEXT,
    cutReason: NON_EMPTY_TEXT,
    dependsOnPartKeys: {
      type: "array",
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: PART_KEY
    },
    ownership: OWNERSHIP_SCHEMA,
    outcomeIds: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: IDENTIFIER
    },
    conceptIds: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: IDENTIFIER
    },
    operationIds: {
      type: "array",
      minItems: 1,
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: IDENTIFIER
    },
    misconceptionIds: {
      type: "array",
      maxItems: AUTHORING_PLAN_LIMITS.stringSetItems,
      uniqueItems: true,
      items: IDENTIFIER
    },
    structure: objectSchema(["course", "module", "lesson", "microsequences"], {
      course: objectSchema(["id", "title", "goal"], {
        id: IDENTIFIER,
        title: NON_EMPTY_TEXT,
        goal: NON_EMPTY_TEXT
      }),
      module: objectSchema(["id", "title", "guide"], {
        id: IDENTIFIER,
        title: NON_EMPTY_TEXT,
        guide: GUIDE_SCHEMA
      }),
      lesson: objectSchema(["id", "title", "guide", "topics"], {
        id: IDENTIFIER,
        title: NON_EMPTY_TEXT,
        guide: GUIDE_SCHEMA,
        topics: { type: "array", items: TOPIC_SCHEMA }
      }),
      microsequences: {
        type: "array",
        minItems: 1,
        items: MICROSEQUENCE_SPECIFICATION_SCHEMA
      }
    }),
    cardPlan: { type: "array", minItems: 1, maxItems: 1000, items: CARD_PLAN_ITEM_SCHEMA },
    allowedSourceIds: STRING_SET,
    availableTermIds: STRING_SET,
    preserve: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", minLength: 1, pattern: "^/" }
    }
  }
);
const LEDGER_SOURCE_SCHEMA = Object.freeze({
  ...objectSchema(
  ["sourceId", "title", "kind", "locator", "excerpt", "stability"],
  {
    sourceId: IDENTIFIER,
    title: NON_EMPTY_TEXT,
    author: { type: "string", maxLength: 500 },
    kind: {
      type: "string",
      enum: ["attachment", "book", "article", "standard", "documentation", "web", "dataset", "other"]
    },
    locator: NON_EMPTY_TEXT,
    publishedOn: { type: "string", format: "date" },
    publishedVersion: { type: "string", minLength: 1, maxLength: 500 },
    accessedOn: { type: "string", format: "date" },
    excerpt: NON_EMPTY_TEXT,
    stability: { type: "string", enum: ["stable", "versioned", "volatile"] },
    usageTerms: { type: "string", minLength: 1, maxLength: 4096 },
    usageNotes: { type: "string", maxLength: 4096 }
  }
  ),
  allOf: [{
    if: {
      properties: { stability: { const: "volatile" } },
      required: ["stability"]
    },
    then: { required: ["accessedOn"] }
  }]
});
const LEDGER_CLAIM_SCHEMA = objectSchema(
  ["claimId", "statement", "sourceIds", "support", "confidence"],
  {
    claimId: IDENTIFIER,
    statement: NON_EMPTY_TEXT,
    sourceIds: { type: "array", minItems: 1, uniqueItems: true, items: IDENTIFIER },
    support: NON_EMPTY_TEXT,
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    allowedPartKeys: { type: "array", uniqueItems: true, items: PART_KEY }
  }
);
const LEDGER_TERM_SCHEMA = objectSchema(
  ["termId", "form", "language", "explanation", "firstTeachingCardId"],
  {
    termId: IDENTIFIER,
    form: NON_EMPTY_TEXT,
    language: LANGUAGE_TAG,
    explanation: NON_EMPTY_TEXT,
    gloss: { type: "string", maxLength: 2000 },
    firstTeachingCardId: IDENTIFIER,
    requiredByCardIds: { type: "array", uniqueItems: true, items: IDENTIFIER },
    sourceIds: { type: "array", uniqueItems: true, items: IDENTIFIER }
  }
);
const LEDGER_ITEM_SCHEMA = Object.freeze({
  anyOf: [LEDGER_SOURCE_SCHEMA, LEDGER_CLAIM_SCHEMA, LEDGER_TERM_SCHEMA]
});
const GAP_ANSWER_SCHEMA = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 120,
  pattern: "^\\S(?:[^\\r\\n]*\\S)?$",
  description: [
    "Resposta literal em uma única linha e sem espaços nas extremidades.",
    "A unicidade entre answer e as demais respostas é verificada após NFKC,",
    "remoção de espaços nas extremidades e conversão para minúsculas."
  ].join(" ")
});
const GAP_DEFINITION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "response", "answer"],
  properties: {
    id: {
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$",
      description: "Identificador usado uma única vez no marcador {gap:id}."
    },
    response: {
      type: "string",
      enum: ["choice", "text"],
      description: "choice apresenta alternativas; text recebe digitação."
    },
    answer: GAP_ANSWER_SCHEMA,
    distractors: {
      type: "array",
      maxItems: 5,
      uniqueItems: true,
      description: [
        "Alternativas literais distintas de answer e entre si.",
        "A comparação usa NFKC, espaços removidos nas extremidades e minúsculas."
      ].join(" "),
      items: GAP_ANSWER_SCHEMA
    },
    acceptedAnswers: {
      type: "array",
      maxItems: 8,
      uniqueItems: true,
      description: [
        "Grafias equivalentes literais aceitas na digitação; não use regex.",
        "Devem ser distintas de answer e entre si após NFKC, remoção de espaços",
        "nas extremidades e conversão para minúsculas."
      ].join(" "),
      items: GAP_ANSWER_SCHEMA
    }
  },
  allOf: [{
    if: {
      properties: { response: { const: "choice" } },
      required: ["response"]
    },
    then: {
      required: ["distractors"],
      properties: { distractors: { type: "array", minItems: 1 } }
    }
  }, {
    if: {
      properties: { response: { const: "text" } },
      required: ["response"]
    },
    then: {
      properties: {
        distractors: { type: "array", maxItems: 0 },
        acceptedAnswers: { type: "array", maxItems: 8 }
      }
    }
  }, {
    if: {
      properties: { response: { const: "choice" } },
      required: ["response"]
    },
    then: {
      properties: { acceptedAnswers: { type: "array", maxItems: 0 } }
    }
  }]
});
const CARD_OPTION_SCHEMA = objectSchema(
  ["id"],
  {
    id: IDENTIFIER,
    kind: { type: "string", enum: ["text", "code"] },
    text: { type: "string", minLength: 1, maxLength: 20000 },
    language: { type: "string", minLength: 1, maxLength: 80 },
    code: { type: "string", minLength: 1, maxLength: 20000 },
    feedback: { type: "string", maxLength: 20000 },
    misconceptionId: IDENTIFIER
  }
);
const TREE_NODE_SCHEMA = objectSchema(
  ["id", "label", "type", "parentId"],
  {
    id: IDENTIFIER,
    label: { type: "string", minLength: 1, maxLength: 20000 },
    type: { type: "string", enum: ["folder", "file"] },
    parentId: { type: ["string", "null"], maxLength: 160 }
  }
);
const GRAPH_VERTEX_SCHEMA = objectSchema(
  ["id", "label"],
  {
    id: IDENTIFIER,
    label: { type: "string", minLength: 1, maxLength: 20000 },
    x: { type: "number", minimum: 0, maximum: 100 },
    y: { type: "number", minimum: 0, maximum: 100 }
  }
);
const GRAPH_EDGE_SCHEMA = objectSchema(
  ["from", "to"],
  {
    from: IDENTIFIER,
    to: IDENTIFIER,
    label: { type: "string", maxLength: 20000 },
    weight: { type: "string", maxLength: 20000 },
    directed: { type: "boolean" }
  }
);
const RELATION_SET_SCHEMA = objectSchema(
  ["label", "items"],
  {
    label: { type: "string", minLength: 1, maxLength: 20000 },
    items: {
      type: "array",
      minItems: 1,
      items: objectSchema(
        ["id", "label"],
        {
          id: IDENTIFIER,
          label: { type: "string", minLength: 1, maxLength: 20000 }
        }
      )
    }
  }
);
const COORDINATE_PAIR_SCHEMA = Object.freeze({
  type: "array",
  minItems: 2,
  maxItems: 2,
  items: { type: "number" }
});
const MATRIX_VALUES_SCHEMA = Object.freeze({
  type: "array",
  minItems: 1,
  items: {
    type: "array",
    minItems: 1,
    items: { type: ["string", "number", "boolean", "null"] }
  }
});
const CARD_COMMON_AUTHORING_FIELDS = Object.freeze([
  "id",
  "position",
  "resource",
  "kind",
  "exercise",
  "title",
  "after",
  "afterBlocks",
  "sources",
  "topics",
  "languageTag",
  "textDirection",
  "gaps"
]);
const CARD_FIELDS_BY_RESOURCE = Object.freeze({
  paragraph: Object.freeze(["text"]),
  choice: Object.freeze([
    "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  composite: Object.freeze(["blocks"]),
  code: Object.freeze([
    "prompt", "language", "code", "question", "selectionMode",
    "selectionCriterion", "options", "answerIds"
  ]),
  table: Object.freeze([
    "columns", "rows", "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  flow: Object.freeze([
    "prompt", "structure", "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  tree: Object.freeze([
    "prompt", "nodes", "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  graph: Object.freeze([
    "prompt", "vertices", "edges", "highlight", "question", "selectionMode",
    "selectionCriterion", "options", "answerIds"
  ]),
  relation_map: Object.freeze([
    "prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable",
    "highlight", "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  matrix: Object.freeze([
    "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence",
    "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  plane: Object.freeze([
    "prompt", "x", "y", "vector", "vectors", "sum", "scale", "distance", "result",
    "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  formula: Object.freeze([
    "prompt", "notation", "accessibleText", "expression", "question",
    "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  chart: Object.freeze([
    "prompt", "chartType", "xAxis", "yAxis", "series", "highlight", "question",
    "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  sequence: Object.freeze([
    "prompt", "variant", "items", "highlight", "question", "selectionMode",
    "selectionCriterion", "options", "answerIds"
  ]),
  annotated_text: Object.freeze([
    "prompt", "segments", "annotations", "question", "selectionMode",
    "selectionCriterion", "options", "answerIds"
  ]),
  linguistic_example: Object.freeze([
    "prompt", "writingMode", "alignment", "units", "question", "selectionMode",
    "selectionCriterion", "options", "answerIds"
  ])
});
const ALL_RESOURCE_CARD_FIELDS = Object.freeze(
  [...new Set(Object.values(CARD_FIELDS_BY_RESOURCE).flat())]
);

function cardResourceBranch(resource, required, alternatives = null) {
  const allowed = new Set([
    ...CARD_COMMON_AUTHORING_FIELDS,
    ...CARD_FIELDS_BY_RESOURCE[resource]
  ]);
  const forbidden = ALL_RESOURCE_CARD_FIELDS.filter((field) => !allowed.has(field));
  return Object.freeze({
    properties: { resource: { const: resource } },
    required: ["resource", ...required],
    ...(alternatives ? { anyOf: alternatives.map((fields) => ({ required: fields })) } : {}),
    ...(forbidden.length
      ? { not: { anyOf: forbidden.map((field) => ({ required: [field] })) } }
      : {})
  });
}

const PART_CARD_RESOURCE_BRANCHES = Object.freeze([
  cardResourceBranch("paragraph", ["text"]),
  cardResourceBranch("choice", [
    "question", "selectionMode", "selectionCriterion", "options", "answerIds"
  ]),
  cardResourceBranch("composite", ["blocks"]),
  cardResourceBranch("code", ["prompt", "language", "code"]),
  cardResourceBranch("table", ["columns", "rows"]),
  cardResourceBranch("flow", ["structure"]),
  cardResourceBranch("tree", ["prompt", "nodes"]),
  cardResourceBranch("graph", ["prompt", "vertices", "edges"]),
  cardResourceBranch("relation_map", ["prompt", "leftSet", "rightSet", "relations"]),
  cardResourceBranch("matrix", [], [["values"], ["sequence"]]),
  cardResourceBranch("plane", [], [
    ["x", "y"],
    ["vector"],
    ["vectors"],
    ["sum"],
    ["scale"],
    ["distance"]
  ]),
  cardResourceBranch("formula", ["prompt", "notation", "accessibleText", "expression"]),
  cardResourceBranch("chart", ["prompt", "chartType", "xAxis", "yAxis", "series"]),
  cardResourceBranch("sequence", ["prompt", "variant", "items"]),
  cardResourceBranch("annotated_text", ["prompt", "segments", "annotations"]),
  cardResourceBranch("linguistic_example", [
    "prompt", "languageTag", "writingMode", "alignment", "units"
  ])
]);
const NEW_RESOURCE_CARD_PROPERTIES = Object.freeze(
  Object.fromEntries(
    ["chart", "sequence", "annotated_text", "linguistic_example"].flatMap((resource) => {
      const properties = getResourceDefinition(resource).cardSchema.properties;
      return CARD_FIELDS_BY_RESOURCE[resource]
        .filter((field) => Object.hasOwn(properties, field))
        .map((field) => [field, properties[field]]);
    })
  )
);
export const PART_CARD_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "position", "resource", "kind", "exercise", "title", "after"],
  properties: {
    id: IDENTIFIER,
    position: { type: "integer", minimum: 1 },
    resource: CARD_PLAN_ITEM_SCHEMA.properties.resource,
    kind: CARD_PLAN_ITEM_SCHEMA.properties.kind,
    exercise: CARD_PLAN_ITEM_SCHEMA.properties.exercise,
    title: NON_EMPTY_TEXT,
    text: { type: "string" },
    prompt: { type: "string" },
    question: { type: "string" },
    selectionMode: { type: "string", enum: ["single", "multiple"] },
    selectionCriterion: { type: "string", enum: ["correct", "incorrect", "best"] },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 7,
      items: CARD_OPTION_SCHEMA
    },
    answerIds: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
      items: IDENTIFIER
    },
    after: { type: "string" },
    language: { type: "string", minLength: 1, maxLength: 80 },
    code: { type: "string" },
    columns: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
      description: "Cabeçalhos da tabela, na mesma ordem das células de cada linha."
    },
    rows: {
      type: "array",
      minItems: 1,
      items: {
        type: "array",
        minItems: 1,
        items: { type: ["string", "number", "boolean", "null"] }
      }
    },
    structure: FLOWCHART_STRUCTURE_INPUT_SCHEMA,
    nodes: { type: "array", minItems: 1, items: TREE_NODE_SCHEMA },
    vertices: { type: "array", minItems: 1, items: GRAPH_VERTEX_SCHEMA },
    edges: { type: "array", items: GRAPH_EDGE_SCHEMA },
    highlight: { type: "object" },
    leftSet: RELATION_SET_SCHEMA,
    rightSet: RELATION_SET_SCHEMA,
    relations: {
      type: "array",
      minItems: 1,
      items: objectSchema(
        ["from", "to"],
        {
          from: IDENTIFIER,
          to: IDENTIFIER,
          label: { type: "string", maxLength: 20000 }
        }
      )
    },
    pairList: { type: "array", items: { type: "string" } },
    relationTable: {
      type: "object",
      required: ["columns", "rows"],
      properties: {
        columns: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" } },
        rows: {
          type: "array",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: { type: ["string", "number", "boolean", "null"] }
          }
        }
      },
      additionalProperties: false
    },
    name: { type: "string", maxLength: 20000 },
    values: MATRIX_VALUES_SCHEMA,
    dividerAfterColumn: { type: "integer", minimum: 0 },
    sequence: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: objectSchema(
        ["values"],
        {
          name: { type: "string", maxLength: 20000 },
          connector: { type: "string", maxLength: 20 },
          values: MATRIX_VALUES_SCHEMA,
          highlight: { type: "object" }
        }
      )
    },
    x: COORDINATE_PAIR_SCHEMA,
    y: COORDINATE_PAIR_SCHEMA,
    vector: COORDINATE_PAIR_SCHEMA,
    vectors: { type: "array", minItems: 1, items: COORDINATE_PAIR_SCHEMA },
    sum: { type: "array", minItems: 2, maxItems: 2, items: COORDINATE_PAIR_SCHEMA },
    scale: objectSchema(
      ["k", "vector"],
      {
        k: { type: "number" },
        vector: COORDINATE_PAIR_SCHEMA
      }
    ),
    distance: { type: "array", minItems: 2, maxItems: 2, items: COORDINATE_PAIR_SCHEMA },
    result: {
      anyOf: [
        { type: "string", maxLength: 80 },
        COORDINATE_PAIR_SCHEMA
      ]
    },
    notation: { type: "string", enum: ["mathematics", "chemistry"] },
    accessibleText: { type: "string" },
    expression: FORMULA_EXPRESSION_INPUT_SCHEMA,
    ...NEW_RESOURCE_CARD_PROPERTIES,
    blocks: {
      type: "array",
      minItems: 1,
      description: "Blocos do composite; cada bloco usa kind e os campos do recurso correspondente.",
      items: COMPOSITE_BLOCK_INPUT_SCHEMA
    },
    languageTag: LANGUAGE_TAG,
    textDirection: { type: "string", enum: ["auto", "ltr", "rtl"] },
    afterBlocks: { type: "array", items: { type: "object" } },
    gaps: {
      type: "array",
      minItems: 1,
      maxItems: 120,
      items: GAP_DEFINITION_SCHEMA,
      description: "Notação autoral. Use {gap:id} uma única vez em um campo interativo; o servidor encontra o campo e compila a lacuna para o contrato v4."
    },
    sources: STRING_SET,
    topics: STRING_SET
  },
  additionalProperties: false,
  oneOf: PART_CARD_RESOURCE_BRANCHES,
  allOf: [{
    if: {
      properties: {
        kind: { const: "exercise" },
        exercise: { const: "gap" }
      },
      required: ["kind", "exercise"]
    },
    then: {
      anyOf: [{
        required: ["gaps"]
      }, {
        properties: {
          resource: { enum: ["flow", "composite"] }
        },
        required: ["resource"]
      }]
    }
  }, {
    if: { required: ["gaps"] },
    then: {
      properties: {
        kind: { const: "exercise" },
        exercise: { const: "gap" }
      },
      required: ["kind", "exercise"]
    }
  }],
  description: "Os campos do recurso seguem o contrato v4. Exercícios gap usam gaps e {gap:id}; flow também admite practice estruturado de forma ou rótulo sem marcador. A notação interna [[...]] não pertence à linguagem de autoria."
});
const PART_FRAGMENT_SCHEMA = objectSchema(
  ["courseId", "moduleId", "lessonId", "microsequences"],
  {
    courseId: IDENTIFIER,
    moduleId: IDENTIFIER,
    lessonId: IDENTIFIER,
    microsequences: {
      type: "array",
      minItems: 1,
      items: objectSchema(
        ["id", "title", "goal", "role", "status", "cards"],
        {
          id: IDENTIFIER,
          title: NON_EMPTY_TEXT,
          goal: NON_EMPTY_TEXT,
          role: { type: "string", enum: ["explain", "practice", "review", "support"] },
          status: { type: "string", enum: ["generated", "needs_review", "ready"] },
          dependsOn: STRING_SET,
          covers: STRING_SET,
          checks: STRING_SET,
          errors: STRING_SET,
          cards: { type: "array", minItems: 1, items: PART_CARD_SCHEMA }
        }
      )
    }
  }
);
const EVIDENCE_ITEM_SCHEMA = Object.freeze({
  type: "object",
  required: ["sourceId"],
  properties: {
    sourceId: IDENTIFIER,
    claimId: IDENTIFIER,
    cardIds: { type: "array", uniqueItems: true, items: IDENTIFIER }
  },
  additionalProperties: false
});
const STATE_DELTA_SCHEMA = objectSchema(
  ["introducedTermIds", "usedClaimIds", "coveredOutcomeIds", "resolvedErrorIds", "notes"],
  {
    introducedTermIds: { ...STRING_SET, maxItems: 1000 },
    usedClaimIds: { ...STRING_SET, maxItems: 1000 },
    coveredOutcomeIds: { ...STRING_SET, maxItems: 1000 },
    resolvedErrorIds: { ...STRING_SET, maxItems: 1000 },
    notes: { ...STRING_SET, maxItems: 1000 }
  }
);
const COLLECTION_ORDER_ITEM_SCHEMA = objectSchema(
  ["collectionId", "baseRevision"],
  {
    collectionId: CATALOG_UUID,
    baseRevision: { type: "integer", minimum: 1 }
  }
);
const COURSE_ORDER_ITEM_SCHEMA = objectSchema(
  ["courseId", "baseRevision"],
  {
    courseId: CATALOG_UUID,
    baseRevision: { type: "integer", minimum: 1 }
  }
);
const AUTHORING_RESOURCE_NAMES = Object.freeze(
  listAuthoringResourceContracts().map((entry) => entry.resource)
);
export const AUTHORING_MCP_TOOLS = Object.freeze([
  tool(
    "listarRecursosDeCard",
    "Listar recursos de card",
    "Lista as representações disponíveis, suas finalidades e os modos de exercício aceitos.",
    readSchema([], {}),
    { readOnlyHint: true }
  ),
  tool(
    "consultarRecursoDeCard",
    "Consultar recurso de card",
    "Obtém a forma autoral completa, os alvos de lacuna e um exemplo válido de um recurso.",
    readSchema(["resource"], {
      resource: { type: "string", enum: AUTHORING_RESOURCE_NAMES }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "listarCursosDaBibliotecaPessoal",
    "Listar cursos pessoais",
    "Lista os cursos selecionados pelo proprietário da integração, inclusive a trilha atual.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterSelectionId: PERSONAL_LIBRARY_UUID,
      query: { type: "string", maxLength: 160 }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "listarTrilhasPessoais",
    "Listar trilhas",
    "Lista as trilhas do proprietário e a quantidade de cursos ainda sem trilha.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterPathId: PERSONAL_LIBRARY_UUID
    }),
    { readOnlyHint: true }
  ),
  tool(
    "criarTrilhaPessoal",
    "Criar trilha",
    "Cria uma trilha vazia no fim da biblioteca pessoal.",
    writeSchema(["title"], {
      title: { type: "string", minLength: 1, maxLength: 120, pattern: "\\S" }
    })
  ),
  tool(
    "renomearTrilhaPessoal",
    "Renomear trilha",
    "Altera o título de uma trilha pertencente ao proprietário.",
    writeSchema(["pathId", "title"], {
      pathId: PERSONAL_LIBRARY_UUID,
      title: { type: "string", minLength: 1, maxLength: 120, pattern: "\\S" }
    })
  ),
  tool(
    "excluirTrilhaPessoal",
    "Excluir trilha",
    "Exclui uma trilha e deixa seus cursos em Sem trilha, sem apagar cursos, progresso ou comentários.",
    writeSchema(["pathId"], {
      pathId: PERSONAL_LIBRARY_UUID
    }),
    { destructiveHint: true }
  ),
  tool(
    "moverCursoParaTrilha",
    "Mover curso para trilha",
    "Move uma seleção para uma trilha do proprietário. Use targetPathId null para Sem trilha.",
    writeSchema(["selectionId", "targetPathId"], {
      selectionId: PERSONAL_LIBRARY_UUID,
      targetPathId: {
        type: ["string", "null"],
        format: "uuid"
      }
    })
  ),
  tool(
    "listarColecoesDoCatalogo",
    "Listar coleções",
    "Lista coleções oficiais, inclusive vazias, com busca e paginação estável.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterId: CATALOG_UUID,
      query: { type: "string", maxLength: 200 },
      includeRetired: { type: "boolean", default: false }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "listarCursosDaColecao",
    "Listar cursos da coleção",
    "Lista os cursos oficiais de uma coleção com posição, revisão e paginação estável.",
    readSchema(["collectionId"], {
      collectionId: CATALOG_UUID,
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      afterPosition: { type: "integer", minimum: 0 },
      afterId: CATALOG_UUID,
      query: { type: "string", maxLength: 200 }
    }),
    { readOnlyHint: true }
  ),
  tool(
    "consultarCursoDoCatalogo",
    "Consultar curso",
    "Consulta título, objetivo, coleção, revisão e contagens de um curso oficial.",
    readSchema(["courseId"], {
      courseId: CATALOG_UUID
    }),
    { readOnlyHint: true }
  ),
  tool(
    "criarColecaoDoCatalogo",
    "Criar coleção",
    "Cria uma coleção oficial vazia no fim da ordem atual. Exige o papel owner.",
    writeSchema(["contractKey", "title"], {
      contractKey: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        pattern: "^[a-z0-9][a-z0-9-]{0,119}$"
      },
      title: { type: "string", minLength: 1, maxLength: 160, pattern: "\\S" },
      description: { type: "string", maxLength: 1000 }
    })
  ),
  tool(
    "renomearColecaoDoCatalogo",
    "Renomear coleção",
    "Altera título e, quando informado, descrição de uma coleção. Exige owner e revisão atual.",
    writeSchema(["collectionId", "baseRevision", "title"], {
      collectionId: CATALOG_UUID,
      baseRevision: { type: "integer", minimum: 1 },
      title: { type: "string", minLength: 1, maxLength: 160, pattern: "\\S" },
      description: { type: "string", maxLength: 1000 }
    })
  ),
  tool(
    "aposentarColecaoDoCatalogo",
    "Aposentar coleção",
    "Move seus cursos para outra coleção e aposenta a coleção vazia na mesma transação. Exige owner.",
    writeSchema([
      "collectionId", "replacementCollectionId", "baseRevision"
    ], {
      collectionId: CATALOG_UUID,
      replacementCollectionId: CATALOG_UUID,
      baseRevision: { type: "integer", minimum: 1 }
    }),
    { destructiveHint: true }
  ),
  tool(
    "reordenarColecoesDoCatalogo",
    "Reordenar coleções",
    "Substitui a ordem completa das coleções ativas usando as revisões recém-lidas. Exige owner.",
    writeSchema(["order"], {
      order: {
        type: "array",
        minItems: 1,
        maxItems: 1000,
        items: COLLECTION_ORDER_ITEM_SCHEMA
      }
    })
  ),
  tool(
    "moverCursoNoCatalogo",
    "Mover curso",
    "Move um curso oficial para outra coleção usando a revisão atual de sua classificação.",
    writeSchema([
      "courseId", "targetCollectionId", "baseRevision"
    ], {
      courseId: CATALOG_UUID,
      targetCollectionId: CATALOG_UUID,
      baseRevision: { type: "integer", minimum: 1 }
    })
  ),
  tool(
    "reordenarCursosDaColecao",
    "Reordenar cursos",
    "Substitui a ordem completa dos cursos de uma coleção usando as revisões recém-lidas.",
    writeSchema(["collectionId", "order"], {
      collectionId: CATALOG_UUID,
      order: {
        type: "array",
        maxItems: 1000,
        items: COURSE_ORDER_ITEM_SCHEMA
      }
    })
  ),
  tool(
    "listarExecucoesDeAutoria",
    "Listar execuções",
    "Lista somente as execuções que a chave atual pode consultar, com paginação estável.",
    readSchema([], {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      beforeUpdatedAt: { type: "string", format: "date-time" },
      beforeRunId: RUN_ID
    }),
    { readOnlyHint: true }
  ),
  tool(
    "criarExecucaoDeAutoria",
    "Criar execução",
    "Inicia uma produção em partes no destino privado ou no catálogo, conforme os escopos da chave.",
    Object.freeze({
      ...writeSchema(["target", "title", "contractKey", "brief", "publicationIntent"], {
        target: { type: "string", enum: ["private", "catalog"] },
        collectionId: { type: ["string", "null"], format: "uuid" },
        title: { type: "string", minLength: 1, maxLength: 300, pattern: "\\S" },
        contractKey: { type: "string", minLength: 1, maxLength: 240 },
        brief: { type: "object", additionalProperties: true },
        publicationIntent: PUBLICATION_INTENT_SCHEMA
      }),
      allOf: [{
        if: {
          properties: { target: { const: "private" } },
          required: ["target"]
        },
        then: {
          properties: {
            collectionId: { type: "null" },
            publicationIntent: PUBLICATION_INTENT_CREATE_SCHEMA
          }
        }
      }, {
        if: {
          properties: {
            publicationIntent: {
              type: "object",
              properties: { mode: { const: "update" } },
              required: ["mode"]
            }
          },
          required: ["publicationIntent"]
        },
        then: {
          properties: { target: { const: "catalog" } }
        }
      }]
    })
  ),
  tool(
    "consultarExecucaoDeAutoria",
    "Consultar execução",
    "Lê o estado persistido, a próxima ação e o resumo das partes autorizadas.",
    readSchema(["runId"], { runId: RUN_ID }),
    { readOnlyHint: true }
  ),
  tool(
    "gravarPlanoDeAutoria",
    "Gravar plano",
    "Valida e grava o plano completo da execução antes da produção das partes.",
    writeSchema(["runId", "plan"], {
      runId: RUN_ID,
      plan: PLAN_SCHEMA
    })
  ),
  tool(
    "gravarTrechoDoRegistro",
    "Gravar trecho do registro",
    "Grava um trecho idempotente de fontes, afirmações ou termos declarado no plano.",
    Object.freeze({
      ...writeSchema(["runId", "planHash", "section", "position", "items"], {
        runId: RUN_ID,
        planHash: SHA256,
        section: { type: "string", enum: ["sources", "claims", "terms"] },
        position: { type: "integer", minimum: 0, maximum: 999 },
        items: { type: "array", minItems: 1, items: LEDGER_ITEM_SCHEMA }
      }),
      allOf: [
        {
          if: {
            properties: { section: { const: "sources" } },
            required: ["section"]
          },
          then: {
            properties: {
              items: { type: "array", minItems: 1, items: LEDGER_SOURCE_SCHEMA }
            }
          }
        },
        {
          if: {
            properties: { section: { const: "claims" } },
            required: ["section"]
          },
          then: {
            properties: {
              items: { type: "array", minItems: 1, items: LEDGER_CLAIM_SCHEMA }
            }
          }
        },
        {
          if: {
            properties: { section: { const: "terms" } },
            required: ["section"]
          },
          then: {
            properties: {
              items: { type: "array", minItems: 1, items: LEDGER_TERM_SCHEMA }
            }
          }
        }
      ]
    })
  ),
  tool(
    "finalizarPlanoDeAutoria",
    "Finalizar plano",
    "Confere o registro declarado e libera a primeira parte do plano.",
    writeSchema(["runId", "planHash"], { runId: RUN_ID, planHash: SHA256 })
  ),
  tool(
    "consultarProximaParte",
    "Consultar próxima parte",
    "Obtém a única parte liberada e o contexto necessário para produzi-la.",
    readSchema(["runId"], { runId: RUN_ID }),
    { readOnlyHint: true }
  ),
  tool(
    "gravarEspecificacaoDaParte",
    "Gravar especificação da parte",
    "Valida e grava a especificação da parte atualmente liberada.",
    writeSchema(["runId", "partKey", "planHash", "specification"], {
      runId: RUN_ID,
      partKey: PART_KEY,
      planHash: SHA256,
      specification: PART_SPECIFICATION_SCHEMA
    })
  ),
  tool(
    "gravarParteDoCurso",
    "Gravar parte",
    "Submete o fragmento produzido para revisão sem publicar conteúdo parcial.",
    writeSchema([
      "artifact", "version", "runId", "partKey", "mode", "attempt", "baseLedgerSha256",
      "fragment", "stateDelta"
    ], {
      artifact: { type: "string", const: "aralearn.part-submission" },
      version: { type: "integer", const: 1 },
      runId: RUN_ID,
      partKey: PART_KEY,
      mode: { type: "string", enum: ["build", "repair", "rebuild"] },
      attempt: { type: "integer", minimum: 1, maximum: 8 },
      baseLedgerSha256: SHA256,
      fragment: PART_FRAGMENT_SCHEMA,
      evidence: { type: "array", maxItems: 200, items: EVIDENCE_ITEM_SCHEMA },
      stateDelta: STATE_DELTA_SCHEMA
    })
  ),
  tool(
    "consultarEntregaDaParte",
    "Consultar entrega da parte",
    "Relê a entrega persistida e emite o comprovante exigido pela revisão.",
    readSchema(["runId", "partKey"], { runId: RUN_ID, partKey: PART_KEY }),
    { readOnlyHint: true }
  ),
  tool(
    "auditarParteDoCurso",
    "Revisar parte",
    "Registra revisão independente com aprovação, reparo, reconstrução ou bloqueio.",
    Object.freeze({
      ...writeSchema([
        "artifact", "version", "runId", "partKey", "attempt", "submissionSha256",
        "submissionReadReceipt", "decision", "gates", "findings"
      ], {
        artifact: { type: "string", const: "aralearn.part-audit" },
        version: { type: "integer", const: 1 },
        runId: RUN_ID,
        partKey: PART_KEY,
        attempt: { type: "integer", minimum: 1, maximum: 8 },
        submissionSha256: SHA256,
        submissionReadReceipt: {
          type: "string",
          minLength: 3,
          maxLength: 4096,
          pattern: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$"
        },
        decision: { type: "string", enum: ["approve", "repair", "rebuild", "blocked"] },
        gates: AUDIT_GATES_SCHEMA,
        findings: { type: "array", maxItems: 100, items: AUDIT_FINDING_SCHEMA },
        instructions: { type: "string", minLength: 1, maxLength: 4000 }
      }),
      allOf: [{
        if: {
          properties: { decision: { const: "approve" } },
          required: ["decision"]
        },
        then: {
          properties: {
            gates: objectSchema(
              AUDIT_GATE_NAMES,
              Object.fromEntries(AUDIT_GATE_NAMES.map((gate) => [gate, { const: true }]))
            ),
            findings: { type: "array", maxItems: 0 }
          }
        },
        else: {
          anyOf: [
            { properties: { findings: { type: "array", minItems: 1 } } },
            { required: ["instructions"] }
          ]
        }
      }]
    })
  ),
  tool(
    "reabrirParteDoCurso",
    "Reabrir parte",
    "Reabre uma parte responsável por falha posterior, preservando a decisão e a tentativa anteriores.",
    writeSchema([
      "artifact", "version", "runId", "partKey", "attempt", "submissionSha256", "decision",
      "findings"
    ], {
      artifact: { type: "string", const: "aralearn.final-validation-repair" },
      version: { type: "integer", const: 1 },
      runId: RUN_ID,
      partKey: PART_KEY,
      attempt: { type: "integer", minimum: 1, maximum: 8 },
      submissionSha256: SHA256,
      decision: { type: "string", enum: ["repair", "rebuild"] },
      findings: { type: "array", maxItems: 100, items: AUDIT_FINDING_SCHEMA },
      instructions: { type: "string", minLength: 1, maxLength: 4000 }
    })
  ),
  tool(
    "validarCursoProduzido",
    "Validar curso",
    "Remonta o documento e aplica o contrato, a integridade relacional e as condições editoriais.",
    writeSchema(["runId"], { runId: RUN_ID })
  ),
  tool(
    "concluirCurso",
    "Concluir curso",
    "Materializa o curso privado ou publica o curso editorial já validado, conforme o destino da execução.",
    writeSchema(["runId"], { runId: RUN_ID }),
    { destructiveHint: true }
  ),
  tool(
    "entregarFaseDeAutoria",
    "Entregar fase para revisão",
    "Registra a entrega concluída e pausa a execução até a decisão explícita do autor.",
    writeSchema(["runId", "phase", "summary"], {
      runId: RUN_ID,
      partKey: PART_KEY,
      phase: { type: "string", enum: ["plan", "part_specification", "part_build", "part_audit", "final_validation"] },
      summary: { type: "string", minLength: 1, maxLength: 1000 }
    })
  ),
  tool(
    "aprovarEntregaDeAutoria",
    "Aprovar entrega",
    "Registra a aprovação explícita da entrega pendente e libera somente a próxima fase persistida.",
    writeSchema(["runId", "phase"], {
      runId: RUN_ID,
      phase: { type: "string", enum: ["plan", "part_specification", "part_build", "part_audit", "final_validation"] }
    })
  ),
  tool(
    "bloquearExecucaoDeAutoria",
    "Bloquear execução",
    "Registra uma dúvida que impede prosseguir e as perguntas necessárias para resolvê-la.",
    writeSchema(["runId", "reason"], {
      runId: RUN_ID,
      partKey: PART_KEY,
      reason: { type: "string", minLength: 1, maxLength: 1000 },
      questions: { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 500 } }
    })
  ),
  tool(
    "retomarExecucaoDeAutoria",
    "Retomar execução",
    "Registra a resolução da dúvida e devolve a execução ao estado anterior.",
    writeSchema(["runId", "resolution"], {
      runId: RUN_ID,
      resolution: { type: "object", minProperties: 1, additionalProperties: true }
    })
  ),
  tool(
    "cancelarExecucaoDeAutoria",
    "Cancelar execução",
    "Cancela uma execução ainda não publicada e conserva o registro mínimo de auditoria.",
    writeSchema(["runId", "reason"], {
      runId: RUN_ID,
      reason: { type: "string", minLength: 1, maxLength: 500 }
    }),
    { destructiveHint: true }
  )
]);

const TOOL_BY_NAME = new Map(AUTHORING_MCP_TOOLS.map((definition) => [definition.name, definition]));
const CATALOG_ADMIN_TOOL_NAMES = new Set([
  "listarColecoesDoCatalogo",
  "listarCursosDaColecao",
  "consultarCursoDoCatalogo",
  "criarColecaoDoCatalogo",
  "renomearColecaoDoCatalogo",
  "aposentarColecaoDoCatalogo",
  "reordenarColecoesDoCatalogo",
  "moverCursoNoCatalogo",
  "reordenarCursosDaColecao"
]);
const PERSONAL_LIBRARY_READ_TOOL_NAMES = new Set([
  "listarCursosDaBibliotecaPessoal",
  "listarTrilhasPessoais"
]);
const PERSONAL_LIBRARY_WRITE_TOOL_NAMES = new Set([
  "criarTrilhaPessoal",
  "renomearTrilhaPessoal",
  "excluirTrilhaPessoal",
  "moverCursoParaTrilha"
]);
const AUTHORING_READ_TOOL_NAMES = new Set([
  "listarRecursosDeCard",
  "consultarRecursoDeCard",
  "listarExecucoesDeAutoria",
  "consultarExecucaoDeAutoria",
  "consultarProximaParte",
  "consultarEntregaDaParte"
]);
const AUTHORING_WRITE_TOOL_NAMES = new Set([
  "criarExecucaoDeAutoria",
  "gravarPlanoDeAutoria",
  "gravarTrechoDoRegistro",
  "finalizarPlanoDeAutoria",
  "gravarEspecificacaoDaParte",
  "gravarParteDoCurso",
  "entregarFaseDeAutoria",
  "aprovarEntregaDeAutoria",
  "bloquearExecucaoDeAutoria",
  "retomarExecucaoDeAutoria",
  "cancelarExecucaoDeAutoria"
]);
const AUTHORING_AUDIT_TOOL_NAMES = new Set([
  "auditarParteDoCurso",
  "reabrirParteDoCurso",
  "validarCursoProduzido"
]);
const AUTHORING_PUBLISH_TOOL_NAMES = new Set([
  "concluirCurso"
]);

function encodePath(value) {
  return encodeURIComponent(String(value));
}

function argumentsObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthoringApiError(422, "invalid_tool_arguments", "Os argumentos da ferramenta devem formar um objeto.");
  }
  return value;
}

function schemaTypeMatches(value, expected) {
  if (expected == null) return true;
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    return typeof value === type;
  });
}

function pointerToken(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function childPointer(pointer, value) {
  return `${pointer}/${pointerToken(value)}`;
}

function displayPath(pointer) {
  const tokens = pointer.split("/").slice(1).map(
    (token) => token.replaceAll("~1", "/").replaceAll("~0", "~")
  );
  return tokens.reduce((path, token) => {
    if (/^(?:0|[1-9]\d*)$/u.test(token)) return `${path}[${token}]`;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(token)) return `${path}.${token}`;
    return `${path}[${JSON.stringify(token)}]`;
  }, "$");
}

function invalidSchemaValue(pointer, reason, message, details = {}) {
  const tokens = pointer.split("/").slice(1);
  const field = tokens.length
    ? tokens.at(-1).replaceAll("~1", "/").replaceAll("~0", "~")
    : null;
  throw new AuthoringApiError(
    422,
    "invalid_tool_arguments",
    message,
    {
      path: displayPath(pointer),
      pointer,
      ...(field == null ? {} : { field }),
      reason,
      ...details
    }
  );
}

function jsonValueKey(value) {
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function decodeReferenceToken(token) {
  return decodeURIComponent(token).replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveLocalSchemaReference(reference, resourceRoot) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) {
    throw new Error(`Referência de schema não suportada: ${reference}.`);
  }
  return reference
    .slice(2)
    .split("/")
    .map(decodeReferenceToken)
    .reduce((current, token) => {
      if (!current || typeof current !== "object" || !Object.hasOwn(current, token)) {
        throw new Error(`Referência de schema inexistente: ${reference}.`);
      }
      return current[token];
    }, resourceRoot);
}

function schemaMatches(schema, value, pointer = "/arguments", context = null) {
  try {
    validateSchemaValue(schema, value, pointer, context);
    return true;
  } catch (error) {
    if (error instanceof AuthoringApiError && error.code === "invalid_tool_arguments") {
      return false;
    }
    throw error;
  }
}

function validateStringFormat(format, value) {
  if (format === "uuid") {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(value);
  }
  if (format === "date") {
    return /^\d{4}-\d{2}-\d{2}$/u.test(value)
      && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
  }
  if (format === "date-time") {
    return Number.isFinite(Date.parse(value));
  }
  return true;
}

function validateSchemaValue(schema, value, pointer, context = null) {
  if (schema === true || schema == null) return;
  if (schema === false) {
    invalidSchemaValue(pointer, "schema_false", `${displayPath(pointer)} não é permitido.`);
  }
  const resourceRoot = typeof schema?.$id === "string"
    ? schema
    : context?.resourceRoot || schema;
  const nestedContext = { resourceRoot };
  if (schema.$ref) {
    validateSchemaValue(
      resolveLocalSchemaReference(schema.$ref, resourceRoot),
      value,
      pointer,
      nestedContext
    );
    return;
  }
  if (!schemaTypeMatches(value, schema.type)) {
    invalidSchemaValue(
      pointer,
      "type",
      `${displayPath(pointer)} possui tipo inválido.`,
      { expected: schema.type }
    );
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    invalidSchemaValue(
      pointer,
      "const",
      `${displayPath(pointer)} deve usar o valor definido pelo contrato.`,
      { expected: schema.const }
    );
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    invalidSchemaValue(
      pointer,
      "enum",
      `${displayPath(pointer)} possui valor inválido.`,
      { allowed: schema.enum }
    );
  }
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) {
      invalidSchemaValue(pointer, "min_length", `${displayPath(pointer)} é muito pequeno.`);
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      invalidSchemaValue(pointer, "max_length", `${displayPath(pointer)} excede o tamanho permitido.`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) {
      invalidSchemaValue(pointer, "pattern", `${displayPath(pointer)} possui formato inválido.`);
    }
    if (schema.format && !validateStringFormat(schema.format, value)) {
      invalidSchemaValue(
        pointer,
        "format",
        `${displayPath(pointer)} não usa o formato ${schema.format}.`,
        { format: schema.format }
      );
    }
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) {
      invalidSchemaValue(pointer, "minimum", `${displayPath(pointer)} está abaixo do mínimo.`);
    }
    if (schema.maximum != null && value > schema.maximum) {
      invalidSchemaValue(pointer, "maximum", `${displayPath(pointer)} excede o máximo.`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) {
      invalidSchemaValue(pointer, "min_items", `${displayPath(pointer)} possui poucos itens.`);
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      invalidSchemaValue(pointer, "max_items", `${displayPath(pointer)} possui itens demais.`);
    }
    if (schema.uniqueItems) {
      const keys = value.map(jsonValueKey);
      if (new Set(keys).size !== keys.length) {
        invalidSchemaValue(pointer, "unique_items", `${displayPath(pointer)} repete itens.`);
      }
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateSchemaValue(
          schema.items,
          item,
          childPointer(pointer, index),
          nestedContext
        );
      });
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties || {};
    const missing = (schema.required || []).find((field) => !Object.hasOwn(value, field));
    if (missing) {
      const missingPointer = childPointer(pointer, missing);
      invalidSchemaValue(
        missingPointer,
        "required",
        `${displayPath(missingPointer)} é obrigatório.`
      );
    }
    if (schema.minProperties != null && Object.keys(value).length < schema.minProperties) {
      invalidSchemaValue(pointer, "min_properties", `${displayPath(pointer)} possui poucos campos.`);
    }
    if (schema.maxProperties != null && Object.keys(value).length > schema.maxProperties) {
      invalidSchemaValue(pointer, "max_properties", `${displayPath(pointer)} possui campos demais.`);
    }
    for (const [field, nestedValue] of Object.entries(value)) {
      if (Object.hasOwn(properties, field)) {
        validateSchemaValue(
          properties[field],
          nestedValue,
          childPointer(pointer, field),
          nestedContext
        );
      } else if (schema.additionalProperties === false) {
        const unknownPointer = childPointer(pointer, field);
        invalidSchemaValue(
          unknownPointer,
          "unknown_field",
          `${displayPath(pointer)} contém campo desconhecido: ${field}.`
        );
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateSchemaValue(
          schema.additionalProperties,
          nestedValue,
          childPointer(pointer, field),
          nestedContext
        );
      }
    }
  }
  for (const nested of schema.allOf || []) {
    validateSchemaValue(nested, value, pointer, nestedContext);
  }
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((candidate) =>
      schemaMatches(candidate, value, pointer, nestedContext)
    )) {
      invalidSchemaValue(
        pointer,
        "any_of",
        `${displayPath(pointer)} não corresponde a nenhuma forma permitida.`
      );
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) =>
      schemaMatches(candidate, value, pointer, nestedContext)
    ).length;
    if (matches !== 1) {
      invalidSchemaValue(
        pointer,
        "one_of",
        `${displayPath(pointer)} deve corresponder a uma única forma permitida.`,
        { matches }
      );
    }
  }
  if (schema.not && schemaMatches(schema.not, value, pointer, nestedContext)) {
    invalidSchemaValue(pointer, "not", `${displayPath(pointer)} usa uma forma proibida.`);
  }
  if (schema.if) {
    const branch = schemaMatches(schema.if, value, pointer, nestedContext)
      ? schema.then
      : schema.else;
    if (branch) validateSchemaValue(branch, value, pointer, nestedContext);
  }
}

function validateToolArguments(definition, args) {
  validateSchemaValue(definition.inputSchema, args, "/arguments");
}

function bodyWithout(argumentsValue, omitted) {
  return Object.fromEntries(
    Object.entries(argumentsValue).filter(([key]) => !omitted.has(key))
  );
}

function queryString(argumentsValue) {
  const query = new URLSearchParams();
  for (const field of ["limit", "beforeUpdatedAt", "beforeRunId"]) {
    if (argumentsValue[field] != null) query.set(field, String(argumentsValue[field]));
  }
  const source = query.toString();
  return source ? `?${source}` : "";
}

function catalogQueryString(argumentsValue, { retired = false } = {}) {
  const query = new URLSearchParams();
  for (const field of ["limit", "afterPosition", "afterId", "query"]) {
    if (argumentsValue[field] != null) query.set(field, String(argumentsValue[field]));
  }
  if (retired && argumentsValue.includeRetired != null) {
    query.set("includeRetired", String(argumentsValue.includeRetired));
  }
  const source = query.toString();
  return source ? `?${source}` : "";
}

function personalLibraryQueryString(argumentsValue, fields) {
  const query = new URLSearchParams();
  for (const field of fields) {
    if (argumentsValue[field] != null) query.set(field, String(argumentsValue[field]));
  }
  const source = query.toString();
  return source ? `?${source}` : "";
}

export function authoringMcpToolDefinition(name) {
  return TOOL_BY_NAME.get(name) || null;
}

function authoringMcpToolAllowedForPrincipal(definition, principal) {
  if (!definition
      || principal?.authenticationKind !== "api_key"
      || !principal?.actorId) {
    return false;
  }
  const scopes = new Set(Array.isArray(principal.scopes) ? principal.scopes : []);
  if (scopes.has("*")) return true;
  if (CATALOG_ADMIN_TOOL_NAMES.has(definition.name)) {
    return scopes.has("catalog:publish");
  }
  if (PERSONAL_LIBRARY_READ_TOOL_NAMES.has(definition.name)) {
    return scopes.has("authoring:private:read");
  }
  if (PERSONAL_LIBRARY_WRITE_TOOL_NAMES.has(definition.name)) {
    return scopes.has("authoring:private:write");
  }
  if (AUTHORING_READ_TOOL_NAMES.has(definition.name)) {
    return scopes.has("authoring:read")
      || scopes.has("authoring:private:read");
  }
  if (AUTHORING_WRITE_TOOL_NAMES.has(definition.name)) {
    return scopes.has("authoring:write")
      || scopes.has("authoring:private:write");
  }
  if (AUTHORING_AUDIT_TOOL_NAMES.has(definition.name)) {
    return scopes.has("authoring:audit")
      || scopes.has("authoring:private:audit");
  }
  if (AUTHORING_PUBLISH_TOOL_NAMES.has(definition.name)) {
    return scopes.has("catalog:publish")
      || scopes.has("authoring:private:write");
  }
  return false;
}

export function authoringMcpToolIsAllowed(name, principal) {
  return authoringMcpToolAllowedForPrincipal(TOOL_BY_NAME.get(name), principal);
}

export function authoringMcpToolsForPrincipal(principal) {
  return AUTHORING_MCP_TOOLS.filter((definition) =>
    authoringMcpToolAllowedForPrincipal(definition, principal)
  );
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) {
    throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
  }
  const args = argumentsObject(rawArguments);
  validateToolArguments(definition, args);
  const requestId = definition.annotations.readOnlyHint
    ? null
    : validateRequestId(args.requestId);
  const runId = args.runId == null ? null : validateRunId(args.runId);
  const collectionId = args.collectionId == null
    ? null
    : validateRunId(args.collectionId);
  const courseId = args.courseId == null ? null : validateRunId(args.courseId);
  const pathId = args.pathId == null ? null : validateRunId(args.pathId);
  const selectionId = args.selectionId == null
    ? null
    : validateRunId(args.selectionId);
  const routeFields = new Set(["runId"]);
  let method = "POST";
  let path;
  let body = bodyWithout(args, routeFields);
  switch (name) {
    case "listarRecursosDeCard":
      method = "GET";
      path = "/v1/contracts/resources";
      body = null;
      break;
    case "consultarRecursoDeCard":
      method = "GET";
      path = `/v1/contracts/resources/${encodePath(args.resource)}`;
      body = null;
      break;
    case "listarCursosDaBibliotecaPessoal":
      method = "GET";
      path = "/v1/library/courses" + personalLibraryQueryString(args, [
        "limit", "afterPosition", "afterSelectionId", "query"
      ]);
      body = null;
      break;
    case "listarTrilhasPessoais":
      method = "GET";
      path = "/v1/library/paths" + personalLibraryQueryString(args, [
        "limit", "afterPosition", "afterPathId"
      ]);
      body = null;
      break;
    case "criarTrilhaPessoal":
      path = "/v1/library/paths";
      break;
    case "renomearTrilhaPessoal":
      method = "PATCH";
      path = `/v1/library/paths/${encodePath(pathId)}`;
      delete body.pathId;
      break;
    case "excluirTrilhaPessoal":
      method = "DELETE";
      path = `/v1/library/paths/${encodePath(pathId)}`;
      delete body.pathId;
      break;
    case "moverCursoParaTrilha":
      method = "PUT";
      path = `/v1/library/selections/${encodePath(selectionId)}/path`;
      delete body.selectionId;
      break;
    case "listarColecoesDoCatalogo":
      method = "GET";
      path = `/v1/catalog/collections${catalogQueryString(args, { retired: true })}`;
      body = null;
      break;
    case "listarCursosDaColecao":
      method = "GET";
      path = `/v1/catalog/collections/${encodePath(collectionId)}/courses${catalogQueryString(args)}`;
      body = null;
      break;
    case "consultarCursoDoCatalogo":
      method = "GET";
      path = `/v1/catalog/courses/${encodePath(courseId)}`;
      body = null;
      break;
    case "criarColecaoDoCatalogo":
      path = "/v1/catalog/collections";
      break;
    case "renomearColecaoDoCatalogo":
      method = "PATCH";
      path = `/v1/catalog/collections/${encodePath(collectionId)}`;
      delete body.collectionId;
      break;
    case "aposentarColecaoDoCatalogo":
      path = `/v1/catalog/collections/${encodePath(collectionId)}/retire`;
      delete body.collectionId;
      break;
    case "reordenarColecoesDoCatalogo":
      method = "PUT";
      path = "/v1/catalog/collections/order";
      break;
    case "moverCursoNoCatalogo":
      method = "PUT";
      path = `/v1/catalog/courses/${encodePath(courseId)}/placement`;
      delete body.courseId;
      break;
    case "reordenarCursosDaColecao":
      method = "PUT";
      path = `/v1/catalog/collections/${encodePath(collectionId)}/courses/order`;
      delete body.collectionId;
      break;
    case "listarExecucoesDeAutoria":
      method = "GET";
      path = `/v1/runs${queryString(args)}`;
      body = null;
      break;
    case "criarExecucaoDeAutoria":
      path = "/v1/runs";
      break;
    case "consultarExecucaoDeAutoria":
      method = "GET";
      path = `/v1/runs/${encodePath(runId)}`;
      body = null;
      break;
    case "gravarPlanoDeAutoria":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/plan`;
      break;
    case "gravarTrechoDoRegistro":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/ledger/${encodePath(args.section)}/${encodePath(args.position)}`;
      delete body.section;
      delete body.position;
      break;
    case "finalizarPlanoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/plan/finalize`;
      break;
    case "consultarProximaParte":
      method = "GET";
      path = `/v1/runs/${encodePath(runId)}/next-part`;
      body = null;
      break;
    case "gravarEspecificacaoDaParte":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/specification`;
      delete body.partKey;
      break;
    case "gravarParteDoCurso":
      method = "PUT";
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}`;
      delete body.partKey;
      break;
    case "consultarEntregaDaParte":
      method = "GET";
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/submission`;
      body = null;
      break;
    case "auditarParteDoCurso":
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/audit`;
      delete body.partKey;
      break;
    case "reabrirParteDoCurso":
      path = `/v1/runs/${encodePath(runId)}/parts/${encodePath(args.partKey)}/reopen`;
      delete body.partKey;
      break;
    case "validarCursoProduzido":
      path = `/v1/runs/${encodePath(runId)}/validate`;
      break;
    case "concluirCurso":
      path = `/v1/runs/${encodePath(runId)}/publish`;
      break;
    case "bloquearExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/block`;
      break;
    case "entregarFaseDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/deliver`;
      break;
    case "retomarExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/resume`;
      break;
    case "aprovarEntregaDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/approve-delivery`;
      break;
    case "cancelarExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/cancel`;
      break;
    default:
      throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
  }
  return { method, path, body, requestId };
}
