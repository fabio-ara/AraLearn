import {
  INSTRUCTIONAL_DESIGN_CONTRACTS
} from "../aralearn/runtime/authoring/instructionalDesignContracts.js";
import {
  createPedagogicalBlueprintBinding,
  diffInstructionalIntentToMaterialization
} from "../aralearn/runtime/authoring/instructionalDesignBinding.js";
import {
  assertInstructionalDesignPersistenceSafety,
  normalizeDesignParameterAssignment,
  normalizeInstructionalAnalysis,
  normalizeMaterializationManifest,
  normalizeResourceSet
} from "../aralearn/runtime/authoring/instructionalDesignValidation.js";
import {
  pedagogicalBlueprintContract
} from "../aralearn/runtime/authoring/pedagogicalBlueprint.js";
import {
  validateManifestResourceAuthorizations
} from "../aralearn/runtime/authoring/resourceSetResolution.js";
import {
  RESOURCE_CATALOG,
  RESOURCE_PACKAGE_REGISTRY
} from "../aralearn/runtime/resources/catalog/resourceCatalog.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import {
  createRestrictedResourceCatalogAccess,
  legacyResourceCatalogAccess,
  resolveResourceCatalogAccess
} from "./resourceCatalogAccess.js";
import { sha256Hex } from "./security.js";

const DESIGN_SLICE_CONTRACT = "aralearn.authoring-design-slice.v1";
const DESIGN_RESPONSE_LIMIT_BYTES = 96 * 1024;
const RESOURCE_SET_PAGE_DEFAULT_LIMIT = 50;
const RESOURCE_SET_PAGE_MAX_LIMIT = 100;
const DESIGN_SLICE_VIEWS = new Set([
  "overview",
  "analysis",
  "parameters",
  "resource_set",
  "blueprint",
  "binding",
  "materialization"
]);
const CONTRACTS = Object.freeze({
  instructional_analysis: "instructionalAnalysis",
  design_parameter_definition: "designParameterDefinition",
  design_parameter_assignment: "designParameterAssignment",
  effective_design_snapshot: "effectiveDesignSnapshot",
  materialization_manifest: "materializationManifest",
  resource_set: "resourceSet"
});
const DATABASE_OPERATIONS = Object.freeze({
  save_analysis: "save_instructional_analysis",
  set_parameter: "set_design_parameter",
  remove_parameter: "remove_design_parameter",
  save_resource_set: "save_resource_set",
  resolve_effective: "resolve_effective_design",
  save_blueprint: "save_pedagogical_blueprint",
  register_manifest: "register_materialization_manifest"
});
const ACTION_CONTRACT_NAMES = Object.freeze([
  "action_read_slice",
  "action_contracts",
  "action_save_analysis",
  "action_set_parameter",
  "action_remove_parameter",
  "action_save_resource_set",
  "action_resolve_effective",
  "action_save_blueprint",
  "action_register_manifest"
]);
const ALL_CONTRACT_NAMES = Object.freeze([
  ...Object.keys(CONTRACTS),
  ...ACTION_CONTRACT_NAMES
]);
const NON_EMPTY_SCHEMA = Object.freeze({ type: "string", minLength: 1 });
const STRING_LIST_SCHEMA = Object.freeze({
  type: "array",
  items: NON_EMPTY_SCHEMA,
  uniqueItems: true
});
const VERSIONED_REF_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "version"],
  properties: { id: NON_EMPTY_SCHEMA, version: NON_EMPTY_SCHEMA }
});
const MICROSEQUENCE_PATH_SCHEMA = Object.freeze({
  type: "array",
  minItems: 4,
  maxItems: 4,
  items: NON_EMPTY_SCHEMA
});

function actionMutationSchema(operation, payloadSchema) {
  return {
    ...payloadSchema,
    title: `payloadJson de ${operation}`,
    description: `Schema exato do objeto serializado em payloadJson para ${operation}; não inclua o envelope HTTP/MCP.`
  };
}

function closedListEntry(required, properties) {
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties
  };
}

const BLUEPRINT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: pedagogicalBlueprintContract().requiredSections,
  properties: {
    goal: NON_EMPTY_SCHEMA,
    learnerSituation: NON_EMPTY_SCHEMA,
    feedbackPlan: NON_EMPTY_SCHEMA,
    learningConditions: {
      type: "array",
      items: closedListEntry(["id", "description", "designRelevance"], {
        id: NON_EMPTY_SCHEMA, description: NON_EMPTY_SCHEMA, designRelevance: NON_EMPTY_SCHEMA
      })
    },
    contentDemands: {
      type: "array",
      items: closedListEntry(["id", "description", "cognitiveOperations"], {
        id: NON_EMPTY_SCHEMA, description: NON_EMPTY_SCHEMA, cognitiveOperations: STRING_LIST_SCHEMA
      })
    },
    anticipatedDifficulties: {
      type: "array",
      items: closedListEntry([
        "id", "description", "contentDemandIds", "learningConditionIds"
      ], {
        id: NON_EMPTY_SCHEMA,
        description: NON_EMPTY_SCHEMA,
        contentDemandIds: STRING_LIST_SCHEMA,
        learningConditionIds: STRING_LIST_SCHEMA
      })
    },
    designResponses: {
      type: "array",
      items: closedListEntry([
        "id", "difficultyIds", "decision", "theoryStepIds", "practiceStepIds",
        "packageCandidateIds", "materializationChecks"
      ], {
        id: NON_EMPTY_SCHEMA,
        difficultyIds: STRING_LIST_SCHEMA,
        decision: NON_EMPTY_SCHEMA,
        theoryStepIds: STRING_LIST_SCHEMA,
        practiceStepIds: STRING_LIST_SCHEMA,
        packageCandidateIds: STRING_LIST_SCHEMA,
        materializationChecks: STRING_LIST_SCHEMA
      })
    },
    prerequisiteEvidence: {
      type: "array",
      items: closedListEntry(["term", "evidence"], {
        term: NON_EMPTY_SCHEMA,
        evidence: NON_EMPTY_SCHEMA
      })
    },
    conceptualLayers: {
      type: "array",
      items: closedListEntry([
        "id", "plainLanguageReferent", "formalTerms", "requiresLayerIds"
      ], {
        id: NON_EMPTY_SCHEMA,
        plainLanguageReferent: NON_EMPTY_SCHEMA,
        formalTerms: STRING_LIST_SCHEMA,
        requiresLayerIds: STRING_LIST_SCHEMA
      })
    },
    theorySteps: {
      type: "array",
      items: closedListEntry([
        "id", "layerIds", "purpose", "cognitiveOperation", "packageCandidateIds"
      ], {
        id: NON_EMPTY_SCHEMA,
        layerIds: STRING_LIST_SCHEMA,
        purpose: NON_EMPTY_SCHEMA,
        cognitiveOperation: NON_EMPTY_SCHEMA,
        packageCandidateIds: STRING_LIST_SCHEMA
      })
    },
    practiceSteps: {
      type: "array",
      items: closedListEntry([
        "id", "targetLayerIds", "decision", "cognitiveOperation",
        "packageCandidateIds", "feedback"
      ], {
        id: NON_EMPTY_SCHEMA,
        targetLayerIds: STRING_LIST_SCHEMA,
        decision: NON_EMPTY_SCHEMA,
        cognitiveOperation: NON_EMPTY_SCHEMA,
        packageCandidateIds: STRING_LIST_SCHEMA,
        feedback: NON_EMPTY_SCHEMA
      })
    },
    termLedger: {
      type: "array",
      items: closedListEntry(["term", "introducedInLayerId", "plainMeaning"], {
        term: NON_EMPTY_SCHEMA,
        introducedInLayerId: NON_EMPTY_SCHEMA,
        plainMeaning: NON_EMPTY_SCHEMA
      })
    },
    packageCandidates: {
      type: "array",
      items: closedListEntry(["id", "packageId", "version", "reason"], {
        id: NON_EMPTY_SCHEMA,
        packageId: NON_EMPTY_SCHEMA,
        version: NON_EMPTY_SCHEMA,
        reason: NON_EMPTY_SCHEMA
      })
    }
  }
});

function mappingList(idKey, otherKeys) {
  const required = [idKey, ...otherKeys];
  return {
    type: "array",
    items: closedListEntry(required, Object.fromEntries(required.map((key) => [
      key,
      key === idKey ? NON_EMPTY_SCHEMA : STRING_LIST_SCHEMA
    ])))
  };
}

function embeddedSchema(schema) {
  const body = structuredClone(schema);
  delete body.$schema;
  delete body.$id;
  delete body.$defs;
  return body;
}

const BLUEPRINT_MAPPINGS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "conceptualLayers", "contentDemands", "designResponses", "theorySteps", "practiceSteps"
  ],
  properties: {
    conceptualLayers: mappingList("layerId", ["unitRefs"]),
    contentDemands: mappingList("contentDemandId", ["unitRefs", "evidenceRequirementRefs"]),
    designResponses: mappingList(
      "designResponseId",
      ["explanationRequirementRefs", "evidenceRequirementRefs"]
    ),
    theorySteps: mappingList("stepId", ["unitRefs", "explanationRequirementRefs"]),
    practiceSteps: mappingList("stepId", ["unitRefs", "evidenceRequirementRefs"])
  }
});

const RESOURCE_SET_FACETS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "families", "disciplines", "structures", "cognitiveOperations", "practiceModalities"
  ],
  properties: {
    families: STRING_LIST_SCHEMA,
    disciplines: STRING_LIST_SCHEMA,
    structures: STRING_LIST_SCHEMA,
    cognitiveOperations: STRING_LIST_SCHEMA,
    practiceModalities: STRING_LIST_SCHEMA
  }
});
const RESOURCE_SET_CONSTRAINTS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "allowedFits", "allowEmbeddedPractice", "allowResponsePackages",
    "onNoAdequateRepresentation"
  ],
  properties: {
    allowedFits: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["canonical", "versatile", "substitute"] }
    },
    allowEmbeddedPractice: { type: "boolean" },
    allowResponsePackages: { type: "boolean" },
    onNoAdequateRepresentation: { enum: ["block", "record_limitation"] }
  }
});

const ACTION_CONTRACTS = Object.freeze({
  action_read_slice: {
    description: "Argumentos específicos de read_slice; operation pertence ao envelope MCP.",
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["microsequencePath"],
        properties: {
          microsequencePath: MICROSEQUENCE_PATH_SCHEMA,
          view: {
            enum: [...DESIGN_SLICE_VIEWS].filter((view) => view !== "resource_set")
          }
        }
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["microsequencePath", "view", "resourceSetRef"],
        properties: {
          microsequencePath: MICROSEQUENCE_PATH_SCHEMA,
          view: { const: "resource_set" },
          resourceSetRef: VERSIONED_REF_SCHEMA,
          cursor: { type: "string", minLength: 1, maxLength: 240 },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: RESOURCE_SET_PAGE_MAX_LIMIT,
            default: RESOURCE_SET_PAGE_DEFAULT_LIMIT
          }
        }
      }
    ]
  },
  action_contracts: {
    type: "object",
    additionalProperties: false,
    required: ["contractName"],
    description: "Argumentos específicos de contracts; operation pertence ao envelope MCP.",
    properties: {
      contractName: { enum: ALL_CONTRACT_NAMES }
    }
  },
  action_save_analysis: actionMutationSchema(
    "save_analysis",
    INSTRUCTIONAL_DESIGN_CONTRACTS.instructionalAnalysis
  ),
  action_set_parameter: actionMutationSchema(
    "set_parameter",
    INSTRUCTIONAL_DESIGN_CONTRACTS.designParameterAssignment
  ),
  action_remove_parameter: actionMutationSchema("remove_parameter", {
    type: "object",
    additionalProperties: false,
    required: ["assignmentRef", "definitionRef", "rationale", "provenanceRefs"],
    properties: {
      assignmentRef: VERSIONED_REF_SCHEMA,
      definitionRef: VERSIONED_REF_SCHEMA,
      rationale: NON_EMPTY_SCHEMA,
      provenanceRefs: STRING_LIST_SCHEMA
    }
  }),
  action_save_resource_set: actionMutationSchema("save_resource_set", {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: INSTRUCTIONAL_DESIGN_CONTRACTS.resourceSet.$defs,
    oneOf: [
      embeddedSchema(INSTRUCTIONAL_DESIGN_CONTRACTS.resourceSet),
      {
        type: "object",
        additionalProperties: false,
        required: ["mode", "facets", "provenanceRefs"],
        properties: {
          mode: { const: "auto" },
          facets: RESOURCE_SET_FACETS_SCHEMA,
          selectionConstraints: {
            oneOf: [RESOURCE_SET_CONSTRAINTS_SCHEMA, { type: "null" }]
          },
          provenanceRefs: STRING_LIST_SCHEMA
        }
      }
    ]
  }),
  action_resolve_effective: actionMutationSchema("resolve_effective", {
    type: "object",
    additionalProperties: false,
    maxProperties: 0
  }),
  action_save_blueprint: actionMutationSchema("save_blueprint", {
    type: "object",
    additionalProperties: false,
    required: ["blueprint", "mappings"],
    properties: {
      id: NON_EMPTY_SCHEMA,
      version: NON_EMPTY_SCHEMA,
      blueprint: BLUEPRINT_SCHEMA,
      mappings: BLUEPRINT_MAPPINGS_SCHEMA
    }
  }),
  action_register_manifest: actionMutationSchema(
    "register_manifest",
    INSTRUCTIONAL_DESIGN_CONTRACTS.materializationManifest
  )
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function decodeJsonPointerSegment(value) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function collectLocalDefinitionRefs(value, target, { ignoreDefinitions = false } = {}) {
  if (Array.isArray(value)) {
    for (const entry of value) collectLocalDefinitionRefs(entry, target);
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (ignoreDefinitions && key === "$defs") continue;
    if (key === "$ref" && typeof entry === "string") {
      const match = /^#\/\$defs\/([^/]+)(?:\/.*)?$/u.exec(entry);
      if (match) target.add(decodeJsonPointerSegment(match[1]));
      continue;
    }
    collectLocalDefinitionRefs(entry, target);
  }
}

function pruneLocalDefinitions(schema) {
  const result = clone(schema);
  if (!plainObject(result?.$defs)) return result;
  const definitions = result.$defs;
  delete result.$defs;
  const pending = new Set();
  collectLocalDefinitionRefs(result, pending, { ignoreDefinitions: true });
  const retained = {};
  for (const definitionName of pending) {
    if (Object.hasOwn(retained, definitionName)
        || !Object.hasOwn(definitions, definitionName)) {
      continue;
    }
    retained[definitionName] = definitions[definitionName];
    collectLocalDefinitionRefs(definitions[definitionName], pending);
  }
  if (Object.keys(retained).length) result.$defs = retained;
  return result;
}

function utf8Size(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function ref(value) {
  return { id: text(value?.id), version: text(value?.version) };
}

function refKey(value) {
  return `${text(value?.id)}\u0000${text(value?.version)}`;
}

function packageKey(value) {
  return `${text(value?.packageId || value?.package)}\u0000${text(value?.version)}`;
}

function scopeMatchesMicrosequence(scope, microsequencePath) {
  return scope?.kind === "microsequence"
    && text(scope?.ref) === microsequencePath[3];
}

function domainError(cause, fallbackCode = "invalid_design_payload") {
  if (cause instanceof AuthoringApiError) return cause;
  const errors = Array.isArray(cause?.errors) ? cause.errors : null;
  return new AuthoringApiError(
    422,
    fallbackCode,
    cause instanceof Error && cause.message
      ? cause.message
      : "O estado de desenho enviado é inválido.",
    errors ? { errors } : undefined
  );
}

function requireClosedObject(value, keys, label) {
  if (!plainObject(value)) {
    throw new AuthoringApiError(422, "invalid_design_payload", `${label} deve ser um objeto.`);
  }
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) {
    throw new AuthoringApiError(
      422,
      "invalid_design_payload",
      `${label} precisa ser fechado e completo.`,
      { unknown, missing }
    );
  }
}

function requireVersionedRef(value, label) {
  requireClosedObject(value, ["id", "version"], label);
  if (!text(value.id) || !text(value.version)) {
    throw new AuthoringApiError(
      422,
      "invalid_design_reference",
      `${label} deve conter id e version.`
    );
  }
}

function assertExpectedRevision(state, expectedRevision) {
  if (state?.workspaceRevision !== expectedRevision) {
    throw new AuthoringApiError(
      409,
      "stale_authoring_state",
      "O estado da autoria mudou; releia a microssequência e tente novamente.",
      {
        expectedRevision,
        currentRevision: state?.workspaceRevision ?? null
      }
    );
  }
}

function assertMicrosequenceScope(value, microsequencePath, label) {
  if (!scopeMatchesMicrosequence(value?.scope, microsequencePath)) {
    throw new AuthoringApiError(
      422,
      "design_scope_mismatch",
      `${label} não pertence à microssequência indicada pela operação.`
    );
  }
}

async function mutationPayloadHash(operation, microsequencePath, payload) {
  return sha256Hex(canonicalJsonStringify({
    operation,
    microsequencePath,
    payload
  }));
}

function compactConflicts(value, maximum = 24) {
  const conflicts = list(value);
  return {
    items: conflicts.slice(0, maximum).map((conflict) => ({
      code: text(conflict?.code) || "unresolved_design_parameter",
      ...(text(conflict?.parameterId)
        ? { parameterId: text(conflict.parameterId) }
        : {}),
      ...(text(conflict?.parameterVersion)
        ? { parameterVersion: text(conflict.parameterVersion) }
        : {}),
      ...(text(conflict?.resourceSetRef)
        ? { resourceSetRef: text(conflict.resourceSetRef) }
        : {}),
      ...(plainObject(conflict?.definitionRef)
        ? { definitionRef: ref(conflict.definitionRef) }
        : {}),
      ...(plainObject(conflict?.scope) ? { scope: clone(conflict.scope) } : {}),
      ...(Number.isInteger(conflict?.count) ? { count: conflict.count } : {})
    })),
    total: conflicts.length,
    truncated: conflicts.length > maximum
  };
}

function compactMutationReceipt(operation, value) {
  if (operation === "save_analysis") {
    return {
      analysisRef: clone(value.analysisRef),
      scope: clone(value.scope),
      payloadHash: text(value.payloadHash)
    };
  }
  if (operation === "set_parameter" || operation === "remove_parameter") {
    return {
      assignmentRef: clone(value.assignmentRef),
      assignmentOperation: text(value.assignmentOperation),
      definitionRef: clone(value.definitionRef),
      scope: clone(value.scope)
    };
  }
  if (operation === "save_resource_set") {
    return {
      resourceSetRef: clone(value.resourceSetRef),
      packageCount: Number.isInteger(value.packageCount) ? value.packageCount : 0,
      payloadHash: text(value.payloadHash)
    };
  }
  if (operation === "resolve_effective") {
    const conflicts = compactConflicts(value.conflicts);
    return value.status === "conflict"
      ? {
          status: "conflict",
          conflicts: conflicts.items,
          conflictCount: conflicts.total,
          conflictsTruncated: conflicts.truncated
        }
      : {
          status: "resolved",
          snapshotRef: clone(value.snapshotRef),
          payloadHash: text(value.payloadHash)
        };
  }
  if (operation === "save_blueprint") {
    return {
      blueprintRef: clone(value.blueprintRef),
      bindingRef: clone(value.bindingRef),
      analysisRef: clone(value.analysisRef),
      effectiveSnapshotRef: clone(value.effectiveSnapshotRef),
      blueprintHash: text(value.blueprintHash),
      bindingHash: text(value.bindingHash)
    };
  }
  if (operation === "register_manifest") {
    return {
      manifestRef: clone(value.manifestRef),
      contentHash: text(value.contentHash),
      payloadHash: text(value.payloadHash),
      conformance: "accepted",
      resourceAuthorization: "authorized"
    };
  }
  return {};
}

function assertDesignResponseBudget(response) {
  const bytes = utf8Size(response);
  if (bytes >= DESIGN_RESPONSE_LIMIT_BYTES) {
    throw new AuthoringApiError(
      413,
      "design_response_too_large",
      "A resposta de desenho excede o teto técnico seguro da Action.",
      { bytes, maximumBytes: DESIGN_RESPONSE_LIMIT_BYTES }
    );
  }
  return response;
}

function normalizedMutationResult(
  operation,
  workspaceId,
  rawResult,
  fallbackRevision = null
) {
  const value = plainObject(rawResult) ? clone(rawResult) : {};
  const revision = Number.isInteger(value.revision)
    ? value.revision
    : (Number.isInteger(fallbackRevision) ? fallbackRevision : undefined);
  const replayed = value.idempotent === true;
  delete value.workspaceId;
  delete value.revision;
  delete value.idempotent;
  return assertDesignResponseBudget({
    operation,
    workspaceId,
    ...(revision == null ? {} : { revision }),
    replayed,
    result: compactMutationReceipt(operation, value)
  });
}

function nextAction(state, { assignments, relevantIds }) {
  if (state.analysisState !== "current") return "save_analysis";
  const assignedDefinitionIds = new Set(list(assignments).map(({ definitionRef }) => (
    text(definitionRef?.id)
  )));
  if ([...relevantIds].some((definitionId) => !assignedDefinitionIds.has(definitionId))) {
    return "set_parameter";
  }
  if (state.parameterState !== "resolved") return "set_parameter";
  if (state.effectiveDesignState !== "resolved") return "resolve_effective";
  if (state.blueprintState !== "current") return "save_blueprint";
  if (state.materializationState !== "tracked") return "materialize_then_register_manifest";
  return "continue_to_next_microsequence";
}

function relevantDefinitionIds(analysis, assignments, snapshot, conflicts = []) {
  const ids = new Set([
    "representation_fallback_policy",
    "available_resource_set_refs"
  ]);
  if (plainObject(analysis)) {
    if (list(analysis.units).some(({ priorKnowledge }) => (
      priorKnowledge?.state === "new" || priorKnowledge?.state === "unknown"
    ))) ids.add("new_units_per_theory_step_ceiling");
    if (list(analysis.coordinationRequirements).length) {
      ids.add("simultaneous_new_units_per_coordination_set_ceiling");
    }
    if (list(analysis.explanationRequirements).length) {
      ids.add("applicable_explanation_requirement_refs");
    }
    if (list(analysis.evidenceRequirements).length) {
      ids.add("evidence_alignment_relation");
      ids.add("distinct_practice_opportunities_per_evidence_requirement");
      ids.add("accepted_performance_forms");
    }
    if (list(analysis.practiceVariationRequirements).length) {
      ids.add("practice_variation_dimensions");
    }
  }
  list(assignments).filter(({ mode }) => mode === "research_lock")
    .forEach(({ definitionRef }) => ids.add(text(definitionRef?.id)));
  list(snapshot?.resolvedValues)
    .forEach(({ definitionRef }) => ids.add(text(definitionRef?.id)));
  list(conflicts).forEach((conflict) => {
    ids.add(text(conflict?.parameterId));
    ids.add(text(conflict?.definitionRef?.id));
    if (text(conflict?.resourceSetRef)) ids.add("available_resource_set_refs");
  });
  ids.delete("");
  return ids;
}

function definitionIndex(definitions) {
  return definitions.map((definition) => ({
    id: definition.id,
    version: definition.version,
    label: definition.label,
    valueType: definition.valueType,
    unit: clone(definition.unit),
    supportedScopes: clone(definition.supportedScopes)
  }));
}

function resourceSetSummary(resourceSet) {
  return {
    ref: ref(resourceSet),
    scope: clone(resourceSet.scope),
    resolvedCatalogVersion: resourceSet.resolvedCatalogVersion,
    packageCount: list(resourceSet.packages).length
  };
}

function manifestSummary(manifest) {
  if (!plainObject(manifest)) return null;
  return {
    ref: ref(manifest),
    analysisRef: clone(manifest.analysisRef),
    effectiveSnapshotRef: clone(manifest.effectiveSnapshotRef),
    blueprintRef: clone(manifest.blueprintRef),
    materializedWorkspaceRevision: manifest.materializedWorkspaceRevision,
    contentHash: manifest.contentHash,
    counts: {
      plannedSteps: list(manifest.plannedSteps).length,
      materializedSteps: list(manifest.materializedSteps).length,
      resourceSelections: list(manifest.resourceSelections).length,
      materializedResources: list(manifest.materializedResources).length,
      explanationRequirements: list(manifest.explanationCoverage).length,
      evidenceRequirements: list(manifest.evidenceCoverage).length,
      practiceOpportunities: list(manifest.practiceOpportunities).length
    },
    limitationCount: list(manifest.limitations).length
  };
}

function microsequenceFindings(resume, microsequencePath) {
  const items = list(resume?.content?.findings?.items).filter((finding) => {
    const path = list(finding?.currentEntityPath).length
      ? finding.currentEntityPath
      : finding?.entityPath;
    return microsequencePath.every((id, index) => path?.[index] === id);
  });
  return {
    items,
    truncated: Boolean(resume?.content?.findings?.truncated)
  };
}

function coordinationSlice(resume, microsequencePath) {
  const microsequenceId = microsequencePath[3];
  const part = list(resume?.content?.parts).find(({ microsequenceIds }) => (
    list(microsequenceIds).includes(microsequenceId)
  )) || null;
  const allDecisions = list(resume?.content?.decisions).filter((decision) => (
    !decision.entityType || (
      decision.entityType === "microsequence" && decision.entityId === microsequenceId
    )
  ));
  const decisions = allDecisions.slice(-12).map((decision) => ({
    id: text(decision?.id),
    summary: text(decision?.summary).slice(0, 500),
    entityType: decision?.entityType ?? null,
    entityId: decision?.entityId ?? null,
    hasRepresentationSelection: plainObject(decision?.representationSelection),
    hasPedagogicalDiagnosis: plainObject(decision?.pedagogicalDiagnosis)
  }));
  const findings = microsequenceFindings(resume, microsequencePath);
  return {
    part: part == null ? null : {
      id: text(part?.id),
      title: text(part?.title),
      status: text(part?.status),
      microsequenceCount: list(part?.microsequenceIds).length
    },
    hasMandate: resume?.content?.mandate != null,
    decisions: clone(decisions),
    decisionsTruncated: allDecisions.length > decisions.length,
    findings: findings.items.slice(0, 20).map((finding) => ({
      id: text(finding?.id),
      status: text(finding?.status),
      severity: text(finding?.severity),
      summary: text(finding?.summary || finding?.message).slice(0, 500)
    })),
    findingsTruncated: findings.truncated
      || findings.items.length > 20
  };
}

function workspaceSlice(resume, revision) {
  return {
    id: resume?.workspaceId || resume?.id || null,
    title: text(resume?.title),
    revision,
    brief: text(resume?.brief)
  };
}

function microsequenceSlice(entity, microsequencePath) {
  return {
    path: clone(microsequencePath),
    id: text(entity?.id),
    title: text(entity?.title),
    goal: text(entity?.goal),
    role: entity?.role ?? null,
    dependsOn: clone(list(entity?.dependsOn)),
    covers: clone(list(entity?.covers)),
    checks: clone(list(entity?.checks)),
    errors: clone(list(entity?.errors)),
    cardCount: Number.isInteger(entity?.cardCount) ? entity.cardCount : 0
  };
}

function stateSlice(state) {
  return {
    analysis: state.analysisState,
    parameters: state.parameterState,
    effectiveDesign: state.effectiveDesignState,
    blueprint: state.blueprintState,
    materialization: state.materializationState,
    resourceAvailability: state.resourceAvailabilityState
  };
}

async function stableSliceInputs({ adapter, principal, workspaceId, microsequencePath }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const scopeRef = microsequencePath[3];
    const firstState = await adapter.getAuthoringDesignState({
      principal,
      workspaceId,
      scopeKind: "microsequence",
      scopeRef
    });
    const [resume, entityResult, definitionsResult, assignmentsResult] = await Promise.all([
      adapter.getWorkspace({ principal, workspaceId, view: "resume" }),
      adapter.getWorkspace({
        principal,
        workspaceId,
        view: "entity",
        entityType: "microsequence",
        entityPath: microsequencePath,
        includeDescendants: false
      }),
      adapter.listAuthoringDesignParameterDefinitions({
        principal,
        workspaceId,
        scopeKind: null
      }),
      adapter.listAuthoringDesignParameterAssignments({
        principal,
        workspaceId,
        scopeKind: "microsequence",
        scopeRef
      })
    ]);
    const fencedState = await adapter.getAuthoringDesignState({
      principal,
      workspaceId,
      scopeKind: "microsequence",
      scopeRef
    });
    const revision = fencedState?.workspaceRevision;
    if (Number.isInteger(revision)
      && firstState?.workspaceRevision === revision
      && resume?.revision === revision
      && entityResult?.revision === revision) {
      return {
        resume,
        entity: entityResult.content,
        state: fencedState,
        definitions: list(definitionsResult?.items),
        definitionCatalogVersion: definitionsResult?.catalogVersion || null,
        assignments: list(assignmentsResult?.items)
      };
    }
  }
  throw new AuthoringApiError(
    409,
    "stale_authoring_state",
    "O workspace mudou durante a leitura. Releia a microssequência."
  );
}

async function effectiveResourceSets({ adapter, principal, workspaceId, snapshot }) {
  return Promise.all(list(snapshot?.resourceSetRefs).map((resourceSetRef) => (
    adapter.getAuthoringResourceSet({
      principal,
      workspaceId,
      resourceSetRef
    })
  )));
}

function resourceSetPackageCursor(packageRef) {
  return `${text(packageRef?.packageId)}@${text(packageRef?.version)}`;
}

function stableResourceSetPackages(resourceSet) {
  return list(resourceSet?.packages)
    .map((packageRef) => ({
      packageId: text(packageRef?.packageId),
      version: text(packageRef?.version)
    }))
    .sort((left, right) => {
      const leftKey = resourceSetPackageCursor(left);
      const rightKey = resourceSetPackageCursor(right);
      return leftKey < rightKey ? -1 : (leftKey > rightKey ? 1 : 0);
    });
}

async function effectiveResourceSetPage({
  adapter,
  principal,
  workspaceId,
  snapshot,
  resourceSetRef,
  cursor,
  limit
}) {
  try {
    requireVersionedRef(resourceSetRef, "resourceSetRef");
  } catch (cause) {
    throw domainError(cause, "invalid_resource_set_reference");
  }
  const requestedRef = ref(resourceSetRef);
  if (!list(snapshot?.resourceSetRefs).some(
    (effectiveRef) => refKey(effectiveRef) === refKey(requestedRef)
  )) {
    throw new AuthoringApiError(
      409,
      "resource_set_not_effective",
      "O ResourceSet solicitado não pertence ao snapshot efetivo corrente."
    );
  }
  if (cursor != null && (!text(cursor) || text(cursor) !== cursor || cursor.length > 240)) {
    throw new AuthoringApiError(
      422,
      "invalid_resource_set_cursor",
      "O cursor da página de ResourceSet é inválido."
    );
  }
  const pageLimit = limit == null ? RESOURCE_SET_PAGE_DEFAULT_LIMIT : limit;
  if (!Number.isInteger(pageLimit)
      || pageLimit < 1
      || pageLimit > RESOURCE_SET_PAGE_MAX_LIMIT) {
    throw new AuthoringApiError(
      422,
      "invalid_resource_set_limit",
      `limit deve ser um inteiro entre 1 e ${RESOURCE_SET_PAGE_MAX_LIMIT}.`
    );
  }
  let resourceSet;
  try {
    resourceSet = normalizeResourceSet(await adapter.getAuthoringResourceSet({
      principal,
      workspaceId,
      resourceSetRef: requestedRef
    }));
  } catch (cause) {
    throw domainError(cause, "invalid_effective_resource_set");
  }
  if (refKey(resourceSet) !== refKey(requestedRef)) {
    throw new AuthoringApiError(
      409,
      "resource_set_identity_mismatch",
      "O ResourceSet persistido não corresponde à referência efetiva solicitada."
    );
  }
  const packages = stableResourceSetPackages(resourceSet);
  const cursorIndex = cursor == null
    ? -1
    : packages.findIndex((packageRef) => resourceSetPackageCursor(packageRef) === cursor);
  if (cursor != null && cursorIndex < 0) {
    throw new AuthoringApiError(
      422,
      "invalid_resource_set_cursor",
      "O cursor não pertence ao ResourceSet efetivo solicitado."
    );
  }
  const start = cursorIndex + 1;
  const page = packages.slice(start, start + pageLimit);
  const hasMore = start + page.length < packages.length;
  return {
    metadata: {
      ref: requestedRef,
      scope: clone(resourceSet.scope),
      resolvedCatalogVersion: resourceSet.resolvedCatalogVersion,
      provenanceRefs: clone(resourceSet.provenanceRefs)
    },
    facets: clone(resourceSet.facetBasis),
    constraints: clone(resourceSet.selectionConstraints),
    packages: page,
    total: packages.length,
    nextCursor: hasMore && page.length
      ? resourceSetPackageCursor(page.at(-1))
      : null
  };
}

export async function readAuthoringDesignSlice({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  view = "overview",
  resourceSetRef = null,
  cursor = null,
  limit = null
}) {
  if (!DESIGN_SLICE_VIEWS.has(view)) {
    throw new AuthoringApiError(422, "invalid_design_slice_view", "A view de desenho é inválida.");
  }
  if (view !== "resource_set"
      && (resourceSetRef != null || cursor != null || limit != null)) {
    throw new AuthoringApiError(
      422,
      "invalid_resource_set_slice_arguments",
      "resourceSetRef, cursor e limit pertencem somente à view resource_set."
    );
  }
  if (view === "resource_set" && resourceSetRef == null) {
    throw new AuthoringApiError(
      422,
      "invalid_resource_set_reference",
      "resourceSetRef é obrigatório para a view resource_set."
    );
  }
  const inputs = await stableSliceInputs({
    adapter,
    principal,
    workspaceId,
    microsequencePath
  });
  const { state, definitions, assignments } = inputs;
  const blueprintArtifact = state.blueprintRef
    ? await adapter.getAuthoringPedagogicalBlueprintArtifact({
        principal,
        workspaceId,
        blueprintRef: ref(state.blueprintRef)
      })
    : null;
  if (blueprintArtifact
    && (refKey(blueprintArtifact.blueprintRef) !== refKey(state.blueprintRef)
      || (state.blueprintBindingRef
        && refKey(blueprintArtifact.bindingRef) !== refKey(state.blueprintBindingRef)))) {
    throw new AuthoringApiError(
      409,
      "blueprint_artifact_identity_mismatch",
      "O receipt imutável não corresponde ao blueprint corrente."
    );
  }
  const relevantIds = relevantDefinitionIds(
    state.analysis,
    assignments,
    state.effectiveSnapshot,
    state.resolution?.conflicts
  );
  const action = nextAction(state, { assignments, relevantIds });
  const availableViews = [
    "overview",
    ...(state.analysis ? ["analysis"] : []),
    "parameters",
    ...(list(state.effectiveSnapshot?.resourceSetRefs).length ? ["resource_set"] : []),
    ...(state.blueprint ? ["blueprint"] : []),
    ...(state.blueprintBinding ? ["binding"] : []),
    ...(state.materializationManifest || state.materializationContentHash
      ? ["materialization"]
      : [])
  ].flat();
  const result = {
    contract: DESIGN_SLICE_CONTRACT,
    view,
    availableViews,
    workspace: workspaceSlice(inputs.resume, state.workspaceRevision),
    microsequence: microsequenceSlice(inputs.entity, microsequencePath),
    coordination: coordinationSlice(inputs.resume, microsequencePath),
    states: stateSlice(state),
    artifacts: {
      analysisRef: state.analysis ? ref(state.analysis) : null,
      effectiveSnapshotRef: state.effectiveSnapshot ? ref(state.effectiveSnapshot) : null,
      blueprintRef: state.blueprintRef ? ref(state.blueprintRef) : null,
      bindingRef: state.blueprintBindingRef ? ref(state.blueprintBindingRef) : null,
      manifestRef: state.materializationManifest ? ref(state.materializationManifest) : null,
      effectiveResourceSetRefs: list(state.effectiveSnapshot?.resourceSetRefs).map(ref),
      blueprintHash: blueprintArtifact?.blueprintHash ?? null,
      bindingHash: blueprintArtifact?.bindingHash ?? null,
      scopeEntityVersion: blueprintArtifact?.scopeEntityVersion ?? null,
      blueprintCreatedRevision: blueprintArtifact?.createdRevision ?? null
    },
    nextAction: action
  };
  if (view === "analysis") {
    result.analysis = clone(state.analysis);
  } else if (view === "parameters") {
    const resourceSets = await effectiveResourceSets({
      adapter,
      principal,
      workspaceId,
      snapshot: state.effectiveSnapshot
    });
    result.parameterDefinitions = {
      catalogVersion: inputs.definitionCatalogVersion,
      index: definitionIndex(definitions.filter(({ id }) => relevantIds.has(id))),
      relevant: clone(definitions.filter(({ id }) => relevantIds.has(id))),
      conflicts: compactConflicts(state.resolution?.conflicts)
    };
    result.assignments = clone(assignments);
    result.locks = clone(assignments.filter(({ mode }) => mode === "research_lock"));
    result.effectiveSnapshot = clone(state.effectiveSnapshot);
    result.effectiveResourceSets = resourceSets.map(resourceSetSummary);
  } else if (view === "resource_set") {
    result.resourceSet = await effectiveResourceSetPage({
      adapter,
      principal,
      workspaceId,
      snapshot: state.effectiveSnapshot,
      resourceSetRef,
      cursor,
      limit
    });
  } else if (view === "blueprint") {
    result.blueprintContract = pedagogicalBlueprintContract();
    result.blueprint = clone(state.blueprint);
  } else if (view === "binding") {
    result.blueprintBinding = clone(state.blueprintBinding);
  } else if (view === "materialization") {
    result.materialization = {
      contentHash: state.materializationContentHash ?? null,
      manifest: manifestSummary(state.materializationManifest)
    };
  }
  const response = {
    operation: "read_slice",
    workspaceId,
    revision: state.workspaceRevision,
    result
  };
  return assertDesignResponseBudget(response);
}

export function readInstructionalDesignContract({ workspaceId, contractName }) {
  const key = CONTRACTS[contractName];
  const schema = key
    ? INSTRUCTIONAL_DESIGN_CONTRACTS[key]
    : ACTION_CONTRACTS[contractName];
  if (!schema) {
    throw new AuthoringApiError(
      422,
      "invalid_design_contract",
      "O contrato de desenho solicitado não existe."
    );
  }
  return assertDesignResponseBudget({
    operation: "contracts",
    workspaceId,
    result: {
      contractName,
      schema: pruneLocalDefinitions(schema)
    }
  });
}

function validateRemoveAssignment(raw) {
  requireClosedObject(raw, [
    "id", "version", "definitionRef", "scope", "rationale", "provenanceRefs"
  ], "payload");
  requireVersionedRef(raw.definitionRef, "payload.definitionRef");
  requireClosedObject(raw.scope, ["kind", "ref"], "payload.scope");
  if (!text(raw.id) || !text(raw.version) || !text(raw.rationale)
    || !Array.isArray(raw.provenanceRefs)
    || raw.provenanceRefs.some((entry) => !text(entry))) {
    throw new AuthoringApiError(
      422,
      "invalid_design_parameter_removal",
      "A remoção do parâmetro precisa de identidade, escopo e justificativa explícitos."
    );
  }
  assertInstructionalDesignPersistenceSafety(raw);
  return clone(raw);
}

function validateSnapshotSeed(raw) {
  requireClosedObject(raw, [
    "contract", "modelVersion", "id", "version", "scope", "analysisRef"
  ], "payload");
  requireVersionedRef(raw.analysisRef, "payload.analysisRef");
  requireClosedObject(raw.scope, ["kind", "ref"], "payload.scope");
  if (raw.contract !== "EffectiveDesignSnapshot@1"
    || raw.modelVersion !== "1.0.0"
    || !text(raw.id)
    || !text(raw.version)) {
    throw new AuthoringApiError(
      422,
      "invalid_effective_design_seed",
      "A identidade do snapshot efetivo é inválida."
    );
  }
  assertInstructionalDesignPersistenceSafety(raw);
  return clone(raw);
}

async function designStateForWrite({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  expectedRevision
}) {
  const state = await adapter.getAuthoringDesignState({
    principal,
    workspaceId,
    scopeKind: "microsequence",
    scopeRef: microsequencePath[3]
  });
  assertExpectedRevision(state, expectedRevision);
  return state;
}

function overlaps(left, right) {
  const rightSet = new Set(list(right).map(text));
  return list(left).some((value) => rightSet.has(text(value)));
}

function operationFacetIds(values) {
  const requested = new Set(list(values).map(text).filter(Boolean));
  const ids = new Set();
  for (const manifest of RESOURCE_PACKAGE_REGISTRY.listCatalog()) {
    if (list(manifest.cognitiveOperations).some((value) => requested.has(text(value)))) {
      list(manifest.academic?.taxonomy?.operationIds).forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

function knownFacetIds(values, records) {
  const requested = new Set(list(values).map(text).filter(Boolean));
  return list(records).filter((record) => (
    requested.has(record.id)
    || requested.has(text(record.label))
    || list(record.aliases).some((alias) => requested.has(text(alias)))
  )).map(({ id }) => id);
}

function blueprintUseIntent({ analysis, binding, step, stepKind }) {
  const mapping = list(binding?.mappings?.[
    stepKind === "theory" ? "theorySteps" : "practiceSteps"
  ]).find(({ stepId }) => text(stepId) === text(step.id));
  const unitRefs = list(mapping?.unitRefs);
  const representationRequirements = list(analysis?.representationRequirements).filter(
    (requirement) => overlaps(requirement.targetUnitRefs, unitRefs)
  );
  const evidenceRefSet = new Set(list(mapping?.evidenceRequirementRefs).map(text));
  const evidenceRequirements = list(analysis?.evidenceRequirements).filter(({ id }) => (
    evidenceRefSet.has(text(id))
  ));
  const structures = representationRequirements.flatMap((requirement) => (
    list(requirement.structures)
  ));
  const operations = [
    text(step?.cognitiveOperation),
    ...representationRequirements.flatMap((requirement) => (
      list(requirement.cognitiveOperations)
    )),
    ...evidenceRequirements.map(({ operation }) => text(operation))
  ].filter(Boolean);
  const explore = RESOURCE_CATALOG.explore();
  const taskFeatures = evidenceRequirements.flatMap((requirement) => [
    ...list(requirement.taskFeatures),
    ...list(requirement.acceptablePerformanceForms)
  ]);
  return {
    cardRole: stepKind === "theory" ? "theory" : "practice",
    ...(stepKind === "theory" ? { slot: "content" } : {}),
    structureIds: knownFacetIds(structures, explore.facets.structures),
    operationIds: [...new Set([
      ...knownFacetIds(operations, explore.facets.operations),
      ...operationFacetIds(operations)
    ])],
    knowledgeObjects: [...new Set([...structures, ...taskFeatures])],
    mustPreserve: [...new Set(structures)],
    notationIsLearningObject: representationRequirements.length > 0
  };
}

function validateBlueprintResourceAuthorizations({
  access,
  analysis,
  binding,
  blueprint
}) {
  const candidates = new Map(list(blueprint?.packageCandidates).map((candidate) => [
    text(candidate?.id), candidate
  ]));
  const uses = [
    ...list(blueprint?.theorySteps).flatMap((step) => (
      list(step?.packageCandidateIds).map((candidateId) => ({
        candidateId: text(candidateId),
        stepId: text(step?.id),
        stepKind: "theory",
        step
      }))
    )),
    ...list(blueprint?.practiceSteps).flatMap((step) => (
      list(step?.packageCandidateIds).map((candidateId) => ({
        candidateId: text(candidateId),
        stepId: text(step?.id),
        stepKind: "practice",
        step
      }))
    ))
  ];
  const usedCandidateIds = new Set(uses.map(({ candidateId }) => candidateId));
  const violations = [];
  for (const use of uses) {
    const candidate = candidates.get(use.candidateId);
    const intent = blueprintUseIntent({
      analysis,
      binding,
      step: use.step,
      stepKind: use.stepKind
    });
    let assessment = null;
    try {
      assessment = candidate
        ? access.catalog.assessCandidate({
            packageId: candidate.packageId,
            version: candidate.version
          }, intent)
        : null;
    } catch {
      assessment = null;
    }
    const applicableRequirements = list(analysis?.representationRequirements).filter(
      (requirement) => overlaps(
        requirement.targetUnitRefs,
        list(binding?.mappings?.[
          use.stepKind === "theory" ? "theorySteps" : "practiceSteps"
        ]).find(({ stepId }) => text(stepId) === use.stepId)?.unitRefs
      )
    );
    const fitAccepted = assessment?.candidate?.fit
      && applicableRequirements.every((requirement) => (
        list(requirement.acceptableFits).includes(assessment.candidate.fit)
      ));
    if (assessment?.status !== "authorized" || !fitAccepted) {
      violations.push({
        candidateId: use.candidateId,
        package: candidate
          ? `${candidate.packageId}@${candidate.version}`
          : null,
        stepId: use.stepId,
        stepKind: use.stepKind,
        status: assessment?.status || "blocked",
        fit: assessment?.candidate?.fit || null
      });
    }
  }
  for (const candidateId of candidates.keys()) {
    if (!usedCandidateIds.has(candidateId)) {
      const candidate = candidates.get(candidateId);
      violations.push({
        candidateId,
        package: `${candidate.packageId}@${candidate.version}`,
        stepId: null,
        stepKind: "unused"
      });
    }
  }
  if (violations.length) {
    throw new AuthoringApiError(
      422,
      "resource_set_violation",
      "Cada uso do blueprint precisa ser autorizado integralmente por um mesmo ResourceSet efetivo.",
      {
        violations: violations.slice(0, 32),
        violationCount: violations.length,
        truncated: violations.length > 32
      }
    );
  }
}

async function validateBlueprintPayload({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  expectedRevision,
  payload
}) {
  requireClosedObject(payload, [
    "id", "version", "modelVersion", "contractVersion", "scope", "analysisRef",
    "effectiveSnapshotRef", "blueprint", "binding"
  ], "payload");
  assertInstructionalDesignPersistenceSafety(payload);
  assertMicrosequenceScope(payload, microsequencePath, "O blueprint");
  requireVersionedRef(payload.analysisRef, "payload.analysisRef");
  requireVersionedRef(payload.effectiveSnapshotRef, "payload.effectiveSnapshotRef");
  if (!text(payload.id) || !text(payload.version)
    || payload.modelVersion !== "1.0.0"
    || payload.contractVersion !== 2) {
    throw new AuthoringApiError(422, "invalid_blueprint", "A identidade do blueprint é inválida.");
  }
  const state = await designStateForWrite({
    adapter,
    principal,
    workspaceId,
    microsequencePath,
    expectedRevision
  });
  if (state.analysisState !== "current"
    || state.effectiveDesignState !== "resolved"
    || !state.analysis
    || !state.effectiveSnapshot) {
    throw new AuthoringApiError(
      409,
      "design_prerequisite_stale",
      "Análise e snapshot efetivo precisam estar correntes antes do blueprint."
    );
  }
  if (refKey(payload.analysisRef) !== refKey(state.analysis)
    || refKey(payload.effectiveSnapshotRef) !== refKey(state.effectiveSnapshot)) {
    throw new AuthoringApiError(
      409,
      "design_reference_stale",
      "O blueprint referencia análise ou snapshot diferente do estado corrente."
    );
  }
  let generatedBinding;
  try {
    generatedBinding = createPedagogicalBlueprintBinding({
      id: payload.binding?.id,
      version: payload.binding?.version,
      blueprint: payload.blueprint,
      blueprintRef: { id: payload.id, version: payload.version },
      packageRegistry: RESOURCE_PACKAGE_REGISTRY,
      analysis: state.analysis,
      effectiveSnapshot: state.effectiveSnapshot,
      mappings: payload.binding?.mappings
    });
  } catch (cause) {
    throw domainError(cause, "invalid_blueprint_binding");
  }
  if (canonicalJsonStringify(generatedBinding) !== canonicalJsonStringify(payload.binding)) {
    throw new AuthoringApiError(
      422,
      "invalid_blueprint_binding",
      "O binding não corresponde integralmente ao blueprint e ao estado corrente."
    );
  }
  const resourceSets = await effectiveResourceSets({
    adapter,
    principal,
    workspaceId,
    snapshot: state.effectiveSnapshot
  });
  // Resolve o conjunto efetivo inteiro antes de autorizar qualquer candidato.
  // O gate abaixo ainda exige que um único set autorize cada uso; não combina
  // membership de um set com permissões de outro.
  const access = createRestrictedResourceCatalogAccess({
    effectiveSnapshot: state.effectiveSnapshot,
    resourceSets
  });
  validateBlueprintResourceAuthorizations({
    access,
    analysis: state.analysis,
    binding: generatedBinding,
    blueprint: payload.blueprint
  });
  return clone(payload);
}

function criticalManifestDifferences(diff) {
  return diff.identityMismatches.length > 0
    || diff.steps.missingFromPlan.length > 0
    || diff.steps.plannedOutsideBinding.length > 0
    || diff.steps.missingMaterialization.length > 0
    || diff.steps.materializedOutsidePlan.length > 0
    || diff.steps.plannedBindingMismatches.length > 0
    || diff.steps.stepContractMismatches.length > 0
    || diff.resources.resourceSetRefMismatch
    || diff.resources.selectionsOutsideResourceSets.length > 0
    || diff.resources.materializedWithoutSelection.length > 0
    || diff.resources.selectionMaterializationMismatches.length > 0;
}

function summarizeManifestDifferences(diff) {
  const countListFields = (record) => Object.fromEntries(
    Object.entries(record).filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, value.length])
  );
  return {
    hasDifferences: diff.hasDifferences === true,
    identityMismatchCount: list(diff.identityMismatches).length,
    stepCounts: countListFields(diff.steps || {}),
    explanationCounts: {
      ...countListFields(diff.explanations || {}),
      denominator: Number.isInteger(diff.explanations?.denominator)
        ? diff.explanations.denominator
        : 0
    },
    evidenceCounts: {
      ...countListFields(diff.evidence || {}),
      denominator: Number.isInteger(diff.evidence?.denominator)
        ? diff.evidence.denominator
        : 0
    },
    resourceCounts: countListFields(diff.resources || {}),
    resourceSetRefMismatch: diff.resources?.resourceSetRefMismatch === true,
    packageSetMismatch: diff.resources?.packageSetMismatch === true
  };
}

function compactAuthorizationErrors(errors, maximum = 32) {
  const values = list(errors);
  return {
    items: values.slice(0, maximum).map((entry) => ({
      code: text(entry?.code) || "resource_authorization_failed",
      message: text(entry?.message).slice(0, 500),
      ...(Number.isInteger(entry?.selectionIndex)
        ? { selectionIndex: entry.selectionIndex }
        : {}),
      ...(Number.isInteger(entry?.materializedIndex)
        ? { materializedIndex: entry.materializedIndex }
        : {})
    })),
    total: values.length,
    truncated: values.length > maximum
  };
}

async function validateManifestPayload({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  expectedRevision,
  payload
}) {
  let manifest;
  try {
    manifest = normalizeMaterializationManifest(payload);
  } catch (cause) {
    throw domainError(cause, "invalid_materialization_manifest");
  }
  assertMicrosequenceScope(manifest, microsequencePath, "O manifesto");
  if (manifest.materializedWorkspaceRevision !== expectedRevision) {
    throw new AuthoringApiError(
      409,
      "materialization_revision_mismatch",
      "O manifesto deve declarar a revisão exata dos cards materializados."
    );
  }
  const state = await designStateForWrite({
    adapter,
    principal,
    workspaceId,
    microsequencePath,
    expectedRevision
  });
  if (state.analysisState !== "current"
    || state.effectiveDesignState !== "resolved"
    || state.blueprintState !== "current"
    || !state.analysis
    || !state.effectiveSnapshot
    || !state.blueprintBinding) {
    throw new AuthoringApiError(
      409,
      "materialization_design_stale",
      "Análise, snapshot e blueprint precisam estar correntes antes do manifesto."
    );
  }
  let diff;
  try {
    diff = diffInstructionalIntentToMaterialization({
      analysis: state.analysis,
      effectiveSnapshot: state.effectiveSnapshot,
      binding: state.blueprintBinding,
      materializationManifest: manifest
    });
  } catch (cause) {
    throw domainError(cause, "invalid_materialization_manifest");
  }
  if (criticalManifestDifferences(diff)) {
    throw new AuthoringApiError(
      422,
      "materialization_contract_mismatch",
      "O manifesto diverge estruturalmente do desenho persistido.",
      { differences: summarizeManifestDifferences(diff) }
    );
  }
  const resourceSets = await effectiveResourceSets({
    adapter,
    principal,
    workspaceId,
    snapshot: state.effectiveSnapshot
  });
  const resourceAuthorization = validateManifestResourceAuthorizations({
    effectiveSnapshot: state.effectiveSnapshot,
    materializationManifest: manifest,
    resourceSets,
    packageRegistry: RESOURCE_PACKAGE_REGISTRY
  });
  if (!resourceAuthorization.ok) {
    throw new AuthoringApiError(
      422,
      "materialization_resource_not_authorized",
      "O manifesto contém seleção de resource sem autorização efetiva.",
      { errors: compactAuthorizationErrors(resourceAuthorization.errors) }
    );
  }
  return {
    manifest,
    differences: summarizeManifestDifferences(diff),
    resourceAuthorization: {
      status: "authorized",
      selectionCount: list(manifest.resourceSelections).length,
      resourceSetCount: resourceSets.length
    }
  };
}

function microsequenceScope(microsequencePath) {
  return { kind: "microsequence", ref: microsequencePath[3] };
}

function stringArray(value, label) {
  if (!Array.isArray(value)
    || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new AuthoringApiError(422, "invalid_design_payload", `${label} deve ser uma lista de textos.`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

export async function deriveAutoResourceSet({
  payload,
  microsequencePath,
  expectedRevision,
  catalog = RESOURCE_CATALOG,
  packageRegistry = RESOURCE_PACKAGE_REGISTRY
}) {
  const autoKeys = ["mode", "facets", "selectionConstraints", "provenanceRefs"];
  if (!plainObject(payload)
    || Object.keys(payload).some((key) => !autoKeys.includes(key))
    || ["mode", "facets", "provenanceRefs"].some((key) => !Object.hasOwn(payload, key))) {
    throw new AuthoringApiError(
      422,
      "invalid_design_payload",
      "payload Auto deve ser fechado e conter mode, facets e provenanceRefs."
    );
  }
  if (payload.mode !== "auto") {
    throw new AuthoringApiError(422, "invalid_resource_set_mode", "mode deve ser auto.");
  }
  requireClosedObject(payload.facets, [
    "families", "disciplines", "structures", "cognitiveOperations", "practiceModalities"
  ], "payload.facets");
  const facets = {
    families: stringArray(payload.facets.families, "payload.facets.families"),
    disciplines: stringArray(payload.facets.disciplines, "payload.facets.disciplines"),
    structures: stringArray(payload.facets.structures, "payload.facets.structures"),
    cognitiveOperations: stringArray(
      payload.facets.cognitiveOperations,
      "payload.facets.cognitiveOperations"
    ),
    practiceModalities: stringArray(
      payload.facets.practiceModalities,
      "payload.facets.practiceModalities"
    )
  };
  // O search valida os ids contra os vocabulários canônicos sem expor o
  // catálogo inteiro no recorte enviado ao modelo. Famílias pertencem ao
  // explore, não ao intent de search, e são validadas separadamente.
  try {
    const knownFamilies = new Set(catalog.explore().families.map(({ id }) => id));
    const unknownFamily = facets.families.find((familyId) => !knownFamilies.has(familyId));
    if (unknownFamily) throw new RangeError(`families contém identificador desconhecido: ${unknownFamily}.`);
    catalog.search({
      disciplineIds: facets.disciplines,
      structureIds: facets.structures,
      operationIds: facets.cognitiveOperations,
      practiceModeIds: facets.practiceModalities,
      limit: 1
    });
  } catch (cause) {
    throw domainError(cause, "invalid_resource_set_facets");
  }
  const intersects = (requested, available) => (
    requested.length === 0 || requested.some((value) => list(available).includes(value))
  );
  const packages = packageRegistry.listCatalog().filter((manifest) => {
    const taxonomy = manifest.academic?.taxonomy || {};
    return intersects(facets.families, taxonomy.familyIds)
      && intersects(facets.disciplines, taxonomy.disciplineIds)
      && intersects(facets.structures, taxonomy.structureIds)
      && intersects(facets.cognitiveOperations, taxonomy.operationIds)
      && intersects(facets.practiceModalities, taxonomy.practiceModeIds);
  }).map((manifest) => ({ packageId: manifest.id, version: manifest.version }));
  if (!packages.length) {
    throw new AuthoringApiError(
      422,
      "resource_set_no_adequate_representation",
      "As facetas informadas não encontram representação instalada; refine a disponibilidade ou registre a limitação.",
      { facets }
    );
  }
  if (packages.length > 4096) {
    throw new AuthoringApiError(
      422,
      "resource_set_auto_too_broad",
      "A seleção automática excede 4096 packages; informe facetas mais específicas.",
      { packageCount: packages.length }
    );
  }
  const selectionConstraints = payload.selectionConstraints == null
    ? {
        allowedFits: ["canonical"],
        allowEmbeddedPractice: true,
        allowResponsePackages: true,
        onNoAdequateRepresentation: "block"
      }
    : clone(payload.selectionConstraints);
  const identityHash = await sha256Hex(canonicalJsonStringify({
    scope: microsequenceScope(microsequencePath),
    facets,
    selectionConstraints,
    packages
  }));
  return normalizeResourceSet({
    contract: "ResourceSet@1",
    modelVersion: "1.0.0",
    id: `auto-resource-set-${identityHash.slice(0, 20)}`,
    version: `1.0.${expectedRevision}`,
    scope: microsequenceScope(microsequencePath),
    packages,
    resolvedCatalogVersion: catalog.catalogVersion,
    facetBasis: {
      catalogVersion: catalog.catalogVersion,
      ...facets
    },
    selectionConstraints,
    provenanceRefs: stringArray(payload.provenanceRefs, "payload.provenanceRefs")
  });
}

function validateInstalledResourceSet(resourceSet) {
  if (resourceSet.resolvedCatalogVersion !== RESOURCE_CATALOG.catalogVersion
    || resourceSet.facetBasis?.catalogVersion !== RESOURCE_CATALOG.catalogVersion) {
    throw new AuthoringApiError(
      409,
      "resource_catalog_version_stale",
      "O ResourceSet precisa ser resolvido contra a versão corrente do catálogo.",
      {
        expectedCatalogVersion: RESOURCE_CATALOG.catalogVersion,
        receivedCatalogVersion: resourceSet.resolvedCatalogVersion
      }
    );
  }
  const unknown = list(resourceSet.packages).filter((packageRef) => (
    !RESOURCE_PACKAGE_REGISTRY.get(packageRef.packageId, packageRef.version)
  ));
  if (unknown.length) {
    throw new AuthoringApiError(
      422,
      "resource_set_package_not_installed",
      "O ResourceSet contém package@version não instalado.",
      {
        packages: unknown.slice(0, 32),
        packageCount: unknown.length,
        truncated: unknown.length > 32
      }
    );
  }
}

async function expandSnapshotSeed({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  expectedRevision,
  payload
}) {
  if (Object.keys(payload).length !== 0) return validateSnapshotSeed(payload);
  const state = await designStateForWrite({
    adapter,
    principal,
    workspaceId,
    microsequencePath,
    expectedRevision
  });
  if (state.analysisState !== "current" || !state.analysis) {
    throw new AuthoringApiError(
      409,
      "design_prerequisite_stale",
      "A análise precisa estar corrente antes de resolver o desenho efetivo."
    );
  }
  const identityHash = await sha256Hex(canonicalJsonStringify({
    scope: microsequenceScope(microsequencePath),
    analysisRef: ref(state.analysis),
    expectedRevision
  }));
  return validateSnapshotSeed({
    contract: "EffectiveDesignSnapshot@1",
    modelVersion: "1.0.0",
    id: `effective-design-${identityHash.slice(0, 20)}`,
    version: `1.0.${expectedRevision}`,
    scope: microsequenceScope(microsequencePath),
    analysisRef: ref(state.analysis)
  });
}

async function expandBlueprintPayload({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  expectedRevision,
  payload
}) {
  if (Object.hasOwn(payload, "scope")) return clone(payload);
  const allowed = ["id", "version", "blueprint", "mappings"];
  if (!plainObject(payload)
    || Object.keys(payload).some((key) => !allowed.includes(key))
    || !plainObject(payload.blueprint)
    || !plainObject(payload.mappings)) {
    throw new AuthoringApiError(
      422,
      "invalid_blueprint_action",
      "save_blueprint aceita blueprint e mappings em um payload fechado."
    );
  }
  const state = await designStateForWrite({
    adapter,
    principal,
    workspaceId,
    microsequencePath,
    expectedRevision
  });
  if (state.analysisState !== "current"
    || state.effectiveDesignState !== "resolved"
    || !state.analysis
    || !state.effectiveSnapshot) {
    throw new AuthoringApiError(
      409,
      "design_prerequisite_stale",
      "Análise e snapshot efetivo precisam estar correntes antes do blueprint."
    );
  }
  const identityHash = await sha256Hex(canonicalJsonStringify({
    blueprint: payload.blueprint,
    mappings: payload.mappings,
    analysisRef: ref(state.analysis),
    effectiveSnapshotRef: ref(state.effectiveSnapshot)
  }));
  const blueprintId = text(payload.id) || `blueprint-${identityHash.slice(0, 20)}`;
  const blueprintVersion = text(payload.version) || `1.0.${expectedRevision}`;
  const binding = createPedagogicalBlueprintBinding({
    id: `binding-${identityHash.slice(0, 20)}`,
    version: blueprintVersion,
    blueprint: payload.blueprint,
    blueprintRef: { id: blueprintId, version: blueprintVersion },
    packageRegistry: RESOURCE_PACKAGE_REGISTRY,
    analysis: state.analysis,
    effectiveSnapshot: state.effectiveSnapshot,
    mappings: payload.mappings
  });
  return {
    id: blueprintId,
    version: blueprintVersion,
    modelVersion: "1.0.0",
    contractVersion: 2,
    scope: microsequenceScope(microsequencePath),
    analysisRef: ref(state.analysis),
    effectiveSnapshotRef: ref(state.effectiveSnapshot),
    blueprint: clone(payload.blueprint),
    binding
  };
}

async function expandRemoveParameter({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  expectedRevision,
  payload
}) {
  if (Object.hasOwn(payload, "id")) return validateRemoveAssignment(payload);
  requireClosedObject(
    payload,
    ["assignmentRef", "definitionRef", "rationale", "provenanceRefs"],
    "payload"
  );
  requireVersionedRef(payload.assignmentRef, "payload.assignmentRef");
  requireVersionedRef(payload.definitionRef, "payload.definitionRef");
  const assignments = list((await adapter.listAuthoringDesignParameterAssignments({
    principal,
    workspaceId,
    scopeKind: "microsequence",
    scopeRef: microsequencePath[3]
  }))?.items);
  const current = assignments.find((assignment) => (
    refKey(assignment) === refKey(payload.assignmentRef)
  ));
  if (!current || refKey(current.definitionRef) !== refKey(payload.definitionRef)) {
    throw new AuthoringApiError(
      409,
      "design_assignment_not_current",
      "A atribuição indicada não é a atribuição corrente desse parâmetro."
    );
  }
  return validateRemoveAssignment({
    id: current.id,
    version: `1.0.${expectedRevision}`,
    definitionRef: clone(current.definitionRef),
    scope: clone(current.scope),
    rationale: payload.rationale,
    provenanceRefs: payload.provenanceRefs
  });
}

async function assertCanonicalMicrosequencePath({
  adapter,
  principal,
  workspaceId,
  microsequencePath,
  expectedRevision
}) {
  if (typeof adapter?.getWorkspace !== "function") {
    throw new AuthoringApiError(
      500,
      "design_backend_unavailable",
      "O backend não oferece a leitura canônica da microssequência."
    );
  }
  const entityResult = await adapter.getWorkspace({
    principal,
    workspaceId,
    view: "entity",
    entityType: "microsequence",
    entityPath: microsequencePath,
    includeDescendants: false
  });
  if (entityResult?.revision !== expectedRevision) {
    throw new AuthoringApiError(
      409,
      "stale_authoring_state",
      "O workspace mudou. Releia a microssequência antes de alterar o desenho."
    );
  }
  if (text(entityResult?.content?.id) !== microsequencePath[3]) {
    throw new AuthoringApiError(
      404,
      "workspace_entity_not_found",
      "A microssequência não pertence ao caminho informado."
    );
  }
}

async function executeDesignMutation({
  adapter,
  principal,
  workspaceId,
  operation,
  requestId,
  expectedRevision,
  microsequencePath,
  payload
}) {
  const databaseOperation = DATABASE_OPERATIONS[operation];
  const methodByOperation = {
    save_analysis: "saveAuthoringInstructionalAnalysis",
    set_parameter: "setAuthoringDesignParameter",
    remove_parameter: "removeAuthoringDesignParameter",
    save_resource_set: "saveAuthoringResourceSet",
    resolve_effective: "resolveAuthoringEffectiveDesign",
    save_blueprint: "saveAuthoringPedagogicalBlueprint",
    register_manifest: "registerAuthoringMaterializationManifest"
  };
  const method = methodByOperation[operation];
  if (!databaseOperation || !method
    || typeof adapter?.[method] !== "function"
    || typeof adapter?.replayAuthoringDesignMutation !== "function") {
    throw new AuthoringApiError(
      500,
      "design_backend_unavailable",
      "O backend não oferece a operação de desenho solicitada."
    );
  }
  // O hash externo representa exatamente o comando recebido. O ledger é
  // consultado antes de qualquer leitura dependente da revisão, preservando o
  // replay após resposta perdida sem abrir caminho para payload divergente.
  const payloadHash = await mutationPayloadHash(
    databaseOperation,
    microsequencePath,
    payload
  );
  const replay = await adapter.replayAuthoringDesignMutation({
    principal,
    requestId,
    payloadHash,
    operation: databaseOperation
  });
  if (replay != null) {
    if (text(replay.workspaceId) !== text(workspaceId)) {
      throw new AuthoringApiError(
        409,
        "idempotency_key_reused",
        "O requestId já foi usado em outro workspace."
      );
    }
    return normalizedMutationResult(
      operation,
      workspaceId,
      replay,
      expectedRevision
    );
  }
  // A leitura de entidade percorre course -> module -> lesson -> microsequence
  // no documento canônico. Ela acontece somente após o replay para que uma
  // resposta perdida continue recuperável mesmo com a revisão já avançada.
  await assertCanonicalMicrosequencePath({
    adapter,
    principal,
    workspaceId,
    microsequencePath,
    expectedRevision
  });
  let normalizedPayload;
  try {
    if (operation === "save_analysis") {
      normalizedPayload = normalizeInstructionalAnalysis(payload);
      assertMicrosequenceScope(normalizedPayload, microsequencePath, "A análise");
      if (normalizedPayload.derivedFrom.workspaceRevision !== expectedRevision) {
        throw new AuthoringApiError(
          409,
          "analysis_revision_mismatch",
          "A análise precisa derivar da revisão corrente informada."
        );
      }
    } else if (operation === "set_parameter") {
      normalizedPayload = normalizeDesignParameterAssignment(payload);
    } else if (operation === "remove_parameter") {
      normalizedPayload = await expandRemoveParameter({
        adapter,
        principal,
        workspaceId,
        microsequencePath,
        expectedRevision,
        payload
      });
    } else if (operation === "save_resource_set") {
      normalizedPayload = payload.mode === "auto"
        ? await deriveAutoResourceSet({ payload, microsequencePath, expectedRevision })
        : normalizeResourceSet(payload);
      validateInstalledResourceSet(normalizedPayload);
    } else if (operation === "resolve_effective") {
      normalizedPayload = await expandSnapshotSeed({
        adapter,
        principal,
        workspaceId,
        microsequencePath,
        expectedRevision,
        payload
      });
      assertMicrosequenceScope(normalizedPayload, microsequencePath, "O snapshot");
    } else if (operation === "save_blueprint") {
      const expandedPayload = await expandBlueprintPayload({
        adapter,
        principal,
        workspaceId,
        microsequencePath,
        expectedRevision,
        payload
      });
      normalizedPayload = await validateBlueprintPayload({
        adapter,
        principal,
        workspaceId,
        microsequencePath,
        expectedRevision,
        payload: expandedPayload
      });
    } else if (operation === "register_manifest") {
      const validated = await validateManifestPayload({
        adapter,
        principal,
        workspaceId,
        microsequencePath,
        expectedRevision,
        payload
      });
      normalizedPayload = validated.manifest;
    }
  } catch (cause) {
    throw domainError(cause);
  }
  if (new Set(["set_parameter", "remove_parameter", "save_resource_set"]).has(operation)) {
    const payloadScope = normalizedPayload.scope;
    const scopePath = {
      workspace: workspaceId,
      course: microsequencePath[0],
      module: microsequencePath[1],
      lesson: microsequencePath[2],
      microsequence: microsequencePath[3]
    };
    if (!payloadScope || scopePath[payloadScope.kind] !== payloadScope.ref) {
      throw new AuthoringApiError(
        422,
        "design_scope_mismatch",
        "O escopo da operação não pertence ao caminho da microssequência corrente."
      );
    }
  }
  const rawResult = await adapter[method]({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    payloadHash,
    payload: normalizedPayload
  });
  return normalizedMutationResult(
    operation,
    workspaceId,
    rawResult,
    expectedRevision
  );
}

export async function executeWorkspaceDesignAction(options) {
  if (options.operation === "read_slice") return readAuthoringDesignSlice(options);
  if (options.operation === "contracts") return readInstructionalDesignContract(options);
  return executeDesignMutation(options);
}

function cardInstances(card) {
  return [
    ...list(card?.content).map((instance) => ({ instance, slot: "content" })),
    ...(card?.response ? [{ instance: card.response, slot: "response" }] : []),
    ...list(card?.feedback).map((instance) => ({ instance, slot: "feedback" }))
  ];
}

function plannedPackagesForCard(blueprint, cardRole) {
  const candidates = new Map(list(blueprint?.packageCandidates).map((candidate) => [
    candidate.id,
    candidate
  ]));
  const steps = cardRole === "practice"
    ? list(blueprint?.practiceSteps)
    : list(blueprint?.theorySteps);
  const selected = steps.flatMap((step) => list(step.packageCandidateIds).map((candidateId) => ({
    candidate: candidates.get(candidateId),
    cognitiveOperation: step.cognitiveOperation
  }))).filter(({ candidate }) => candidate);
  const rawOperations = [...new Set(selected
    .map(({ cognitiveOperation }) => text(cognitiveOperation))
    .filter(Boolean))];
  const operationIds = [...new Set([
    ...knownFacetIds(rawOperations, RESOURCE_CATALOG.explore().facets.operations),
    ...operationFacetIds(rawOperations)
  ])];
  return {
    keys: new Set(selected.map(({ candidate }) => packageKey(candidate))),
    operations: operationIds
  };
}

export async function validateWorkspaceCardDesignAccess({
  adapter,
  principal,
  workspaceId,
  expectedRevision,
  operation,
  arguments: operationArguments
}) {
  if (!new Set(["save_microsequence_cards", "save_card"]).has(operation)) {
    return null;
  }
  const microsequencePath = operation === "save_card"
    ? operationArguments.cardPath.slice(0, 4)
    : operationArguments.microsequencePath;
  const cards = operation === "save_card"
    ? [operationArguments.card]
    : operationArguments.cards;
  const state = await adapter.getAuthoringDesignState({
    principal,
    workspaceId,
    scopeKind: "microsequence",
    scopeRef: microsequencePath[3]
  });
  assertExpectedRevision(state, expectedRevision);
  if (!state?.effectiveSnapshot) {
    if (state?.materializationState === "legacy_untracked"
      || state?.resourceAvailabilityState === "legacy_unrestricted") {
      // O validator histórico do workspace continua sendo a autoridade de
      // compatibilidade. Este gate só declara a ausência explícita de tracking.
      return legacyResourceCatalogAccess().availability;
    }
    throw new AuthoringApiError(
      409,
      "materialization_design_required",
      "Conclua análise, parâmetros, snapshot e blueprint antes de salvar novos cards."
    );
  }
  if (state.effectiveDesignState !== "resolved"
    || state.blueprintState !== "current"
    || !state.blueprint
    || !state.blueprintBinding) {
    throw new AuthoringApiError(
      409,
      "materialization_design_stale",
      "Snapshot e blueprint precisam estar correntes antes de salvar cards."
    );
  }
  const access = await resolveResourceCatalogAccess({
    adapter,
    principal,
    workspaceId,
    snapshotRef: ref(state.effectiveSnapshot)
  });
  const reports = [];
  cards.forEach((card, cardIndex) => {
    const validation = access.catalog.validateCard(card);
    const planned = plannedPackagesForCard(state.blueprint, card?.role);
    const outsideBlueprint = cardInstances(card)
      .filter(({ slot }) => slot !== "feedback")
      .filter(({ instance }) => !planned.keys.has(packageKey(instance)))
      .map(({ instance }) => `${instance?.package}@${instance?.version}`);
    const audit = access.catalog.auditRepresentation({
      card,
      intent: {
        cardRole: card?.role,
        operationIds: planned.operations,
        limit: 8
      }
    });
    const unavailable = list(audit.selections).filter((selection) => (
      list(selection.missing).includes("availability:resource_set")
    ));
    if (!validation.valid || outsideBlueprint.length || unavailable.length) {
      throw new AuthoringApiError(
        422,
        "materialization_not_authorized",
        "O card usa representação fora do blueprint ou dos ResourceSets efetivos.",
        {
          cardIndex,
          cardId: card?.id || null,
          errors: validation.errors,
          outsideBlueprint: [...new Set(outsideBlueprint)],
          unavailableSelections: unavailable,
          availability: access.availability
        }
      );
    }
    reports.push({
      cardId: card?.id || null,
      overallFit: audit.overallFit,
      selections: audit.selections
    });
  });
  return { ...access.availability, reports };
}
