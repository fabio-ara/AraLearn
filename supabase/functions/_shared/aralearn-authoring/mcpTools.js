import { AuthoringApiError } from "./errors.js";
import { validateRequestId, validateRunId } from "./protocol.js";

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
const NON_EMPTY_TEXT = Object.freeze({ type: "string", minLength: 1, maxLength: 20000 });
const LANGUAGE_TAG = Object.freeze({
  type: "string",
  minLength: 2,
  maxLength: 63,
  pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$"
});
const STRING_SET = Object.freeze({
  type: "array",
  uniqueItems: true,
  items: { type: "string", minLength: 1 }
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
const OWNERSHIP_SCHEMA = objectSchema(
  ["courseId", "moduleId", "lessonId", "microsequenceIds"],
  {
    courseId: IDENTIFIER,
    moduleId: IDENTIFIER,
    lessonId: IDENTIFIER,
    microsequenceIds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: IDENTIFIER
    }
  }
);
const LEDGER_MANIFEST_SECTION_SCHEMA = objectSchema(["chunkCount", "itemCount"], {
  chunkCount: { type: "integer", minimum: 0, maximum: 1000 },
  itemCount: { type: "integer", minimum: 0, maximum: 100000 }
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
    openIssues: { type: "array", maxItems: 500, uniqueItems: true, items: NON_EMPTY_TEXT }
  }
);
const PART_OUTLINE_SCHEMA = objectSchema(
  [
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys", "ownership", "cardIds",
    "outcomeIds"
  ],
  {
    key: PART_KEY,
    title: { type: "string", minLength: 1, maxLength: 300 },
    boundary: NON_EMPTY_TEXT,
    cutReason: NON_EMPTY_TEXT,
    dependsOnPartKeys: { type: "array", uniqueItems: true, items: PART_KEY },
    ownership: OWNERSHIP_SCHEMA,
    cardIds: { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true, items: IDENTIFIER },
    outcomeIds: { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true, items: IDENTIFIER }
  }
);
const PLAN_PROJECT_SCHEMA = objectSchema(["contract", "version", "kind", "courses"], {
  contract: { type: "string", const: "aralearn.contract" },
  version: { type: "integer", const: 3 },
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
              topics: { type: "array", items: { type: "object" } },
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
      items: objectSchema(["id", "title", "goal", "lessonIds"], {
        id: IDENTIFIER,
        title: { type: "string", minLength: 1, maxLength: 240 },
        goal: NON_EMPTY_TEXT,
        lessonIds: { type: "array", minItems: 1, uniqueItems: true, items: IDENTIFIER }
      })
    }
  }
);
const PLAN_SCHEMA = objectSchema(
  [
    "artifact", "version", "runId", "project", "ledgerManifest", "course",
    "learningOutcomes", "conceptMap", "parts", "acceptanceCriteria"
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
      items: objectSchema(["id", "statement", "evidence"], {
        id: IDENTIFIER,
        statement: NON_EMPTY_TEXT,
        evidence: NON_EMPTY_TEXT
      })
    },
    conceptMap: objectSchema(["concepts", "relations"], {
      concepts: {
        type: "array",
        minItems: 1,
        items: objectSchema(["id", "label"], { id: IDENTIFIER, label: NON_EMPTY_TEXT })
      },
      relations: {
        type: "array",
        items: objectSchema(
          ["from", "to", "relation"],
          { from: IDENTIFIER, to: IDENTIFIER, relation: NON_EMPTY_TEXT }
        )
      }
    }),
    parts: { type: "array", minItems: 1, maxItems: 256, items: PART_OUTLINE_SCHEMA },
    acceptanceCriteria: { type: "array", minItems: 1, items: NON_EMPTY_TEXT }
  }
);
const MICROSEQUENCE_SPECIFICATION_SCHEMA = {
  ...objectSchema(
    ["id", "title", "goal", "role", "status", "dependsOn", "covers", "checks", "errors"],
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
const CARD_PLAN_ITEM_SCHEMA = objectSchema(
  [
    "cardId", "microsequenceId", "position", "resource", "kind", "exercise", "purpose",
    "evidence", "outcomeIds", "operationId", "learningFunction", "resourceRationale",
    "contextAnchors", "introducedTermIds", "requiredTermIds", "sourceIds"
  ],
  {
    cardId: IDENTIFIER,
    microsequenceId: IDENTIFIER,
    position: { type: "integer", minimum: 1 },
    resource: {
      type: "string",
      enum: [
        "paragraph", "choice", "composite", "code", "table", "flow", "tree", "graph",
        "relation_map", "matrix", "plane", "formula"
      ]
    },
    kind: { type: "string", enum: ["theory", "exercise"] },
    exercise: { type: "string", enum: ["none", "gap", "choice"] },
    purpose: NON_EMPTY_TEXT,
    evidence: NON_EMPTY_TEXT,
    outcomeIds: { type: "array", minItems: 1, uniqueItems: true, items: IDENTIFIER },
    operationId: IDENTIFIER,
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
      items: { type: "string", minLength: 1, maxLength: 500 },
      description: "Trechos visíveis no card antes da resposta; não use identificadores internos."
    },
    singlePracticeRationale: NON_EMPTY_TEXT,
    introducedTermIds: STRING_SET,
    requiredTermIds: STRING_SET,
    sourceIds: STRING_SET,
    claimIds: STRING_SET
  }
);
const PART_SPECIFICATION_SCHEMA = objectSchema(
  [
    "key", "title", "boundary", "cutReason", "dependsOnPartKeys", "ownership", "outcomeIds",
    "structure", "cardPlan", "allowedSourceIds", "availableTermIds", "preserve"
  ],
  {
    key: PART_KEY,
    title: { type: "string", minLength: 1, maxLength: 300 },
    boundary: NON_EMPTY_TEXT,
    cutReason: NON_EMPTY_TEXT,
    dependsOnPartKeys: { type: "array", uniqueItems: true, items: PART_KEY },
    ownership: OWNERSHIP_SCHEMA,
    outcomeIds: { type: "array", minItems: 1, uniqueItems: true, items: IDENTIFIER },
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
        topics: { type: "array", items: { type: "object" } }
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
const LEDGER_SOURCE_SCHEMA = objectSchema(
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
);
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
const PART_CARD_SCHEMA = Object.freeze({
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
    options: {
      type: "array",
      items: objectSchema(["id", "text"], { id: IDENTIFIER, text: NON_EMPTY_TEXT })
    },
    answer: {
      description: "Resposta esperada; a forma concreta depende do recurso e do tipo de exercício."
    },
    after: { type: "string" },
    language: { type: "string", minLength: 1, maxLength: 80 },
    code: { type: "string" },
    notation: { type: "string", enum: ["mathematics", "chemistry"] },
    accessibleText: { type: "string" },
    expression: { type: "object" },
    sources: STRING_SET,
    topics: STRING_SET
  },
  additionalProperties: true,
  description: "Os demais campos dependem do recurso e seguem o contrato AraLearn v3."
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

export const AUTHORING_MCP_TOOLS = Object.freeze([
  tool(
    "listarExecucoesDeAutoria",
    "Listar execuções",
    "Lista somente as execuções que a chave atual pode consultar, com paginação estável.",
    writeSchema([], {
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
    writeSchema(["target", "title", "contractKey", "brief", "publicationIntent"], {
      target: { type: "string", enum: ["private", "catalog"] },
      collectionId: { type: ["string", "null"], format: "uuid" },
      title: { type: "string", minLength: 1, maxLength: 300 },
      contractKey: { type: "string", minLength: 1, maxLength: 240 },
      brief: { type: "object", additionalProperties: true },
      publicationIntent: { type: "object", additionalProperties: true }
    })
  ),
  tool(
    "consultarExecucaoDeAutoria",
    "Consultar execução",
    "Lê o estado persistido, a próxima ação e o resumo das partes autorizadas.",
    writeSchema(["runId"], { runId: RUN_ID }),
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
    writeSchema(["runId", "planHash", "section", "position", "items"], {
      runId: RUN_ID,
      planHash: SHA256,
      section: { type: "string", enum: ["sources", "claims", "terms"] },
      position: { type: "integer", minimum: 0, maximum: 999 },
      items: { type: "array", minItems: 1, items: LEDGER_ITEM_SCHEMA }
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
    writeSchema(["runId"], { runId: RUN_ID }),
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
      attempt: { type: "integer", minimum: 1 },
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
    writeSchema(["runId", "partKey"], { runId: RUN_ID, partKey: PART_KEY }),
    { readOnlyHint: true }
  ),
  tool(
    "auditarParteDoCurso",
    "Revisar parte",
    "Registra revisão independente com aprovação, reparo, reconstrução ou bloqueio.",
    writeSchema([
      "artifact", "version", "runId", "partKey", "attempt", "submissionSha256",
      "submissionReadReceipt", "decision", "gates", "findings"
    ], {
      artifact: { type: "string", const: "aralearn.part-audit" },
      version: { type: "integer", const: 1 },
      runId: RUN_ID,
      partKey: PART_KEY,
      attempt: { type: "integer", minimum: 1 },
      submissionSha256: SHA256,
      submissionReadReceipt: { type: "string", minLength: 3, maxLength: 4096 },
      decision: { type: "string", enum: ["approve", "repair", "rebuild", "blocked"] },
      gates: { type: "object", additionalProperties: true },
      findings: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
      instructions: { type: "string", maxLength: 4000 }
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
      attempt: { type: "integer", minimum: 1 },
      submissionSha256: SHA256,
      decision: { type: "string", enum: ["repair", "rebuild"] },
      findings: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
      instructions: { type: "string", maxLength: 4000 }
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
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    return typeof value === type;
  });
}

function validateTopLevelArguments(definition, args) {
  const schema = definition.inputSchema;
  const properties = schema.properties || {};
  const unknown = Object.keys(args).find((field) => !Object.hasOwn(properties, field));
  if (unknown) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_arguments",
      `arguments contém campo desconhecido: ${unknown}.`,
      { path: `$.arguments.${unknown}`, field: unknown, reason: "unknown_field" }
    );
  }
  const missing = schema.required.find((field) => !Object.hasOwn(args, field));
  if (missing) {
    throw new AuthoringApiError(
      422,
      "invalid_tool_arguments",
      `arguments.${missing} é obrigatório.`,
      { path: `$.arguments.${missing}`, field: missing, reason: "required" }
    );
  }
  for (const [field, value] of Object.entries(args)) {
    const fieldSchema = properties[field];
    if (!schemaTypeMatches(value, fieldSchema.type)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui tipo inválido.`,
        { path: `$.arguments.${field}`, field, reason: "type" }
      );
    }
    if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui valor inválido.`,
        { path: `$.arguments.${field}`, field, reason: "enum" }
      );
    }
    if (Object.hasOwn(fieldSchema, "const") && value !== fieldSchema.const) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui valor inválido.`,
        { path: `$.arguments.${field}`, field, reason: "const" }
      );
    }
    if (typeof value === "string" && fieldSchema.pattern
        && !(new RegExp(fieldSchema.pattern, "u")).test(value)) {
      throw new AuthoringApiError(
        422,
        "invalid_tool_arguments",
        `arguments.${field} possui formato inválido.`,
        { path: `$.arguments.${field}`, field, reason: "pattern" }
      );
    }
  }
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

export function authoringMcpToolDefinition(name) {
  return TOOL_BY_NAME.get(name) || null;
}

export function mapAuthoringMcpToolCall(name, rawArguments) {
  const definition = TOOL_BY_NAME.get(name);
  if (!definition) {
    throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
  }
  const args = argumentsObject(rawArguments);
  validateTopLevelArguments(definition, args);
  const requestId = validateRequestId(args.requestId);
  const runId = args.runId == null ? null : validateRunId(args.runId);
  const routeFields = new Set(["runId"]);
  let method = "POST";
  let path;
  let body = bodyWithout(args, routeFields);
  switch (name) {
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
    case "retomarExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/resume`;
      break;
    case "cancelarExecucaoDeAutoria":
      path = `/v1/runs/${encodePath(runId)}/cancel`;
      break;
    default:
      throw new AuthoringApiError(404, "unknown_tool", "Ferramenta de autoria inexistente.");
  }
  return { method, path, body, requestId };
}
