export const INSTRUCTIONAL_DESIGN_MODEL_VERSION = "1.0.0";
export const DESIGN_PARAMETER_CATALOG_VERSION = "1.0.0";

export const INSTRUCTIONAL_DESIGN_CONTRACT_IDS = Object.freeze({
  instructionalAnalysis: "InstructionalAnalysis@1",
  designParameterDefinition: "DesignParameterDefinition@1",
  designParameterAssignment: "DesignParameterAssignment@1",
  effectiveDesignSnapshot: "EffectiveDesignSnapshot@1",
  materializationManifest: "MaterializationManifest@1",
  resourceSet: "ResourceSet@1"
});

const NON_EMPTY_STRING = Object.freeze({ type: "string", minLength: 1 });
const STRING_LIST = Object.freeze({
  type: "array",
  items: NON_EMPTY_STRING,
  uniqueItems: true
});
const SCALAR_VALUE = Object.freeze({
  oneOf: [
    { type: "string", minLength: 1 },
    { type: "number" },
    { type: "boolean" }
  ]
});

const CONTRACT_DEFINITIONS = {
  Scope: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "ref"],
    properties: {
      kind: {
        enum: ["workspace", "course", "module", "lesson", "microsequence"]
      },
      ref: NON_EMPTY_STRING
    }
  },
  MicrosequenceScope: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "ref"],
    properties: {
      kind: { const: "microsequence" },
      ref: NON_EMPTY_STRING
    }
  },
  VersionedRef: {
    type: "object",
    additionalProperties: false,
    required: ["id", "version"],
    properties: {
      id: NON_EMPTY_STRING,
      version: NON_EMPTY_STRING
    }
  },
  PackageRef: {
    type: "object",
    additionalProperties: false,
    required: ["packageId", "version"],
    properties: {
      packageId: NON_EMPTY_STRING,
      version: NON_EMPTY_STRING
    }
  },
  ParameterValue: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "value"],
        properties: {
          kind: { const: "integer" },
          value: { type: "integer" }
        }
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "minimum", "maximum"],
        properties: {
          kind: { const: "range" },
          minimum: { type: "number" },
          maximum: { type: "number" }
        }
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "value"],
        properties: {
          kind: { const: "enum" },
          value: NON_EMPTY_STRING
        }
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "values"],
        properties: {
          kind: { const: "set" },
          values: {
            type: "array",
            items: SCALAR_VALUE,
            uniqueItems: true
          }
        }
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "components"],
        properties: {
          kind: { const: "vector" },
          components: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["dimension", "value", "unit"],
              properties: {
                dimension: NON_EMPTY_STRING,
                value: SCALAR_VALUE,
                unit: NON_EMPTY_STRING
              }
            }
          }
        }
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "nodes", "edges"],
        properties: {
          kind: { const: "relation" },
          nodes: STRING_LIST,
          edges: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["from", "to", "kind"],
              properties: {
                from: NON_EMPTY_STRING,
                to: NON_EMPTY_STRING,
                kind: NON_EMPTY_STRING
              }
            }
          }
        }
      }
    ]
  },
  InstructionalAnalysis: {
    type: "object",
    additionalProperties: false,
    required: [
      "contract",
      "modelVersion",
      "id",
      "version",
      "scope",
      "objective",
      "sourceRefs",
      "derivedFrom",
      "learnerContext",
      "units",
      "relations",
      "coordinationRequirements",
      "explanationRequirements",
      "evidenceRequirements",
      "practiceVariationRequirements",
      "fidelityRequirements",
      "representationRequirements",
      "assumptions",
      "limitations"
    ],
    properties: {
      contract: { const: INSTRUCTIONAL_DESIGN_CONTRACT_IDS.instructionalAnalysis },
      modelVersion: { const: INSTRUCTIONAL_DESIGN_MODEL_VERSION },
      id: NON_EMPTY_STRING,
      version: NON_EMPTY_STRING,
      scope: { $ref: "#/$defs/Scope" },
      objective: NON_EMPTY_STRING,
      sourceRefs: STRING_LIST,
      derivedFrom: {
        type: "object",
        additionalProperties: false,
        required: ["workspaceRevision", "scopeEntityVersion"],
        properties: {
          workspaceRevision: { type: "integer", minimum: 1 },
          scopeEntityVersion: {
            oneOf: [{ type: "integer", minimum: 1 }, { type: "null" }]
          }
        }
      },
      learnerContext: {
        type: "object",
        additionalProperties: false,
        required: ["audience", "conditions", "uncertainties"],
        properties: {
          audience: NON_EMPTY_STRING,
          conditions: STRING_LIST,
          uncertainties: STRING_LIST
        }
      },
      units: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "kind", "priorKnowledge", "knowledgeFormHypothesis"],
          properties: {
            id: NON_EMPTY_STRING,
            label: NON_EMPTY_STRING,
            kind: NON_EMPTY_STRING,
            priorKnowledge: {
              type: "object",
              additionalProperties: false,
              required: ["state", "basis", "evidenceRefs", "note"],
              properties: {
                state: { enum: ["new", "partial", "integrated", "unknown"] },
                basis: {
                  enum: ["brief", "source", "author", "assessment", "inference"]
                },
                evidenceRefs: STRING_LIST,
                note: NON_EMPTY_STRING
              }
            },
            knowledgeFormHypothesis: {
              type: "object",
              additionalProperties: false,
              required: [
                "conditions",
                "responses",
                "expression",
                "rationaleAvailability",
                "basisRefs",
                "note"
              ],
              properties: {
                conditions: STRING_LIST,
                responses: STRING_LIST,
                expression: { enum: ["verbal", "nonverbal", "mixed", "unknown"] },
                rationaleAvailability: {
                  enum: ["available", "partial", "unavailable", "unknown"]
                },
                basisRefs: STRING_LIST,
                note: NON_EMPTY_STRING
              }
            }
          }
        }
      },
      relations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "fromUnitRef", "toUnitRef", "kind", "rationale"],
          properties: {
            id: NON_EMPTY_STRING,
            fromUnitRef: NON_EMPTY_STRING,
            toUnitRef: NON_EMPTY_STRING,
            kind: NON_EMPTY_STRING,
            rationale: NON_EMPTY_STRING
          }
        }
      },
      coordinationRequirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "unitRefs", "assumedNewUnitRefs", "rationale"],
          properties: {
            id: NON_EMPTY_STRING,
            unitRefs: {
              type: "array",
              minItems: 2,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            assumedNewUnitRefs: STRING_LIST,
            rationale: NON_EMPTY_STRING
          }
        }
      },
      explanationRequirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "targetUnitRefs", "features", "applicabilityRationale"],
          properties: {
            id: NON_EMPTY_STRING,
            targetUnitRefs: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            features: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            applicabilityRationale: NON_EMPTY_STRING
          }
        }
      },
      evidenceRequirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "targetUnitRefs",
            "operation",
            "claim",
            "acceptablePerformanceForms",
            "taskFeatures",
            "criterion",
            "fidelityRequirementRef"
          ],
          properties: {
            id: NON_EMPTY_STRING,
            targetUnitRefs: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            operation: NON_EMPTY_STRING,
            claim: NON_EMPTY_STRING,
            acceptablePerformanceForms: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            taskFeatures: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            criterion: {
              type: "object",
              additionalProperties: false,
              required: ["observable", "successCondition"],
              properties: {
                observable: NON_EMPTY_STRING,
                successCondition: NON_EMPTY_STRING
              }
            },
            fidelityRequirementRef: {
              oneOf: [NON_EMPTY_STRING, { type: "null" }]
            }
          }
        }
      },
      practiceVariationRequirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "evidenceRequirementRef", "dimensions", "rationale"],
          properties: {
            id: NON_EMPTY_STRING,
            evidenceRequirementRef: NON_EMPTY_STRING,
            dimensions: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            rationale: NON_EMPTY_STRING
          }
        }
      },
      fidelityRequirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "targetPerformanceForms",
            "offeredPerformanceForms",
            "unrepresentedAspects",
            "rationale"
          ],
          properties: {
            id: NON_EMPTY_STRING,
            targetPerformanceForms: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            offeredPerformanceForms: STRING_LIST,
            unrepresentedAspects: STRING_LIST,
            rationale: NON_EMPTY_STRING
          }
        }
      },
      representationRequirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "targetUnitRefs",
            "structures",
            "cognitiveOperations",
            "acceptableFits",
            "rationale"
          ],
          properties: {
            id: NON_EMPTY_STRING,
            targetUnitRefs: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            structures: STRING_LIST,
            cognitiveOperations: STRING_LIST,
            acceptableFits: {
              type: "array",
              minItems: 1,
              items: { enum: ["canonical", "versatile", "substitute"] },
              uniqueItems: true
            },
            rationale: NON_EMPTY_STRING
          }
        }
      },
      assumptions: STRING_LIST,
      limitations: STRING_LIST
    }
  },
  DesignParameterDefinition: {
    type: "object",
    additionalProperties: false,
    required: [
      "contract",
      "catalogVersion",
      "id",
      "version",
      "label",
      "description",
      "valueType",
      "unit",
      "supportedScopes",
      "epistemicClassification",
      "empiricalStatus",
      "theoreticalAnchors",
      "responsibility",
      "resolutionRule",
      "constraints"
    ],
    properties: {
      contract: { const: INSTRUCTIONAL_DESIGN_CONTRACT_IDS.designParameterDefinition },
      catalogVersion: { const: DESIGN_PARAMETER_CATALOG_VERSION },
      id: { type: "string", minLength: 1, pattern: "^[a-z][a-z0-9_]*$" },
      version: NON_EMPTY_STRING,
      label: NON_EMPTY_STRING,
      description: NON_EMPTY_STRING,
      valueType: { enum: ["integer", "range", "enum", "set", "vector", "relation"] },
      unit: {
        type: "object",
        additionalProperties: false,
        required: ["numerator", "denominator"],
        properties: {
          numerator: NON_EMPTY_STRING,
          denominator: NON_EMPTY_STRING
        }
      },
      supportedScopes: {
        type: "array",
        minItems: 1,
        items: { enum: ["workspace", "course", "module", "lesson", "microsequence"] },
        uniqueItems: true
      },
      epistemicClassification: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "claimBoundary"],
        properties: {
          kind: {
            enum: [
              "external_scientific_construct",
              "aralearn_operationalization",
              "software_property",
              "empirical_hypothesis"
            ]
          },
          claimBoundary: NON_EMPTY_STRING
        }
      },
      empiricalStatus: {
        enum: ["not_a_validated_measure", "candidate_for_validation", "software_definition"]
      },
      theoreticalAnchors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["citationKey", "relation", "limit"],
          properties: {
            citationKey: NON_EMPTY_STRING,
            relation: NON_EMPTY_STRING,
            limit: NON_EMPTY_STRING
          }
        }
      },
      responsibility: {
        type: "object",
        additionalProperties: false,
        required: ["proposedBy", "calculatedBy", "validatedBy"],
        properties: {
          proposedBy: { enum: ["gpt", "backend", "author", "research_protocol"] },
          calculatedBy: { enum: ["gpt", "backend", "none"] },
          validatedBy: {
            type: "array",
            minItems: 1,
            items: { enum: ["backend", "author", "researcher"] },
            uniqueItems: true
          }
        }
      },
      resolutionRule: {
        type: "object",
        additionalProperties: false,
        required: ["strategy", "sameScopeConflict", "assignmentValue", "researchLockAuthority"],
        properties: {
          strategy: { const: "nearest_scope_replaces" },
          sameScopeConflict: { const: "error" },
          assignmentValue: { const: "complete_value" },
          researchLockAuthority: { const: "separate_gate" }
        }
      },
      constraints: {
        type: "object",
        additionalProperties: false,
        properties: {
          minimum: { type: "number" },
          maximum: { type: "number" },
          allowedEnumValues: STRING_LIST,
          setItemPattern: NON_EMPTY_STRING,
          vectorDimensions: STRING_LIST,
          relationKinds: STRING_LIST
        }
      }
    }
  },
  DesignParameterAssignment: {
    type: "object",
    additionalProperties: false,
    required: [
      "contract",
      "modelVersion",
      "id",
      "version",
      "definitionRef",
      "scope",
      "mode",
      "value",
      "authority",
      "rationale",
      "provenanceRefs"
    ],
    properties: {
      contract: { const: INSTRUCTIONAL_DESIGN_CONTRACT_IDS.designParameterAssignment },
      modelVersion: { const: INSTRUCTIONAL_DESIGN_MODEL_VERSION },
      id: NON_EMPTY_STRING,
      version: NON_EMPTY_STRING,
      definitionRef: { $ref: "#/$defs/VersionedRef" },
      scope: { $ref: "#/$defs/Scope" },
      mode: { enum: ["auto", "manual_override", "research_lock"] },
      value: { $ref: "#/$defs/ParameterValue" },
      authority: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "actorRef", "locked"],
        properties: {
          kind: { enum: ["gpt", "author", "research_protocol"] },
          actorRef: { oneOf: [NON_EMPTY_STRING, { type: "null" }] },
          locked: { type: "boolean" }
        }
      },
      rationale: NON_EMPTY_STRING,
      provenanceRefs: STRING_LIST
    },
    allOf: [
      {
        if: { properties: { mode: { const: "auto" } }, required: ["mode"] },
        then: {
          properties: {
            authority: {
              properties: { kind: { const: "gpt" }, locked: { const: false } }
            }
          }
        }
      },
      {
        if: { properties: { mode: { const: "manual_override" } }, required: ["mode"] },
        then: {
          properties: {
            authority: {
              properties: { kind: { const: "author" }, locked: { const: false } }
            }
          }
        }
      },
      {
        if: { properties: { mode: { const: "research_lock" } }, required: ["mode"] },
        then: {
          properties: {
            authority: {
              properties: { kind: { const: "research_protocol" }, locked: { const: true } }
            }
          }
        }
      }
    ]
  },
  EffectiveDesignSnapshot: {
    type: "object",
    additionalProperties: false,
    required: [
      "contract",
      "modelVersion",
      "id",
      "version",
      "scope",
      "analysisRef",
      "parameterCatalogVersion",
      "basedOnWorkspaceRevision",
      "scopeEntityVersion",
      "resolutionVersion",
      "resolutionPath",
      "resolvedValues",
      "resourceSetRefs",
      "frozenAt"
    ],
    properties: {
      contract: { const: INSTRUCTIONAL_DESIGN_CONTRACT_IDS.effectiveDesignSnapshot },
      modelVersion: { const: INSTRUCTIONAL_DESIGN_MODEL_VERSION },
      id: NON_EMPTY_STRING,
      version: NON_EMPTY_STRING,
      scope: { $ref: "#/$defs/Scope" },
      analysisRef: { $ref: "#/$defs/VersionedRef" },
      parameterCatalogVersion: NON_EMPTY_STRING,
      basedOnWorkspaceRevision: { type: "integer", minimum: 1 },
      scopeEntityVersion: {
        oneOf: [{ type: "integer", minimum: 1 }, { type: "null" }]
      },
      resolutionVersion: NON_EMPTY_STRING,
      resolutionPath: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/$defs/Scope" }
      },
      resolvedValues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["definitionRef", "value", "resolution"],
          properties: {
            definitionRef: { $ref: "#/$defs/VersionedRef" },
            value: { $ref: "#/$defs/ParameterValue" },
            resolution: {
              type: "object",
              additionalProperties: false,
              required: [
                "assignmentMode",
                "inheritance",
                "assignmentRef",
                "sourceScope",
                "rationale",
                "provenanceRefs"
              ],
              properties: {
                assignmentMode: {
                  enum: ["auto", "manual_override", "research_lock", "default"]
                },
                inheritance: { enum: ["local", "inherited"] },
                assignmentRef: {
                  oneOf: [{ $ref: "#/$defs/VersionedRef" }, { type: "null" }]
                },
                sourceScope: { $ref: "#/$defs/Scope" },
                rationale: NON_EMPTY_STRING,
                provenanceRefs: STRING_LIST
              },
              allOf: [{
                if: {
                  properties: { assignmentMode: { const: "default" } },
                  required: ["assignmentMode"]
                },
                then: { properties: { assignmentRef: { type: "null" } } },
                else: { properties: { assignmentRef: { $ref: "#/$defs/VersionedRef" } } }
              }]
            }
          }
        }
      },
      resourceSetRefs: {
        type: "array",
        items: { $ref: "#/$defs/VersionedRef" },
        uniqueItems: true
      },
      frozenAt: NON_EMPTY_STRING
    }
  },
  ResourceSet: {
    type: "object",
    additionalProperties: false,
    required: [
      "contract",
      "modelVersion",
      "id",
      "version",
      "scope",
      "packages",
      "resolvedCatalogVersion",
      "facetBasis",
      "selectionConstraints",
      "provenanceRefs"
    ],
    properties: {
      contract: { const: INSTRUCTIONAL_DESIGN_CONTRACT_IDS.resourceSet },
      modelVersion: { const: INSTRUCTIONAL_DESIGN_MODEL_VERSION },
      id: NON_EMPTY_STRING,
      version: NON_EMPTY_STRING,
      scope: { $ref: "#/$defs/Scope" },
      packages: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/$defs/PackageRef" },
        uniqueItems: true
      },
      resolvedCatalogVersion: NON_EMPTY_STRING,
      facetBasis: {
        type: "object",
        additionalProperties: false,
        required: [
          "catalogVersion",
          "families",
          "disciplines",
          "structures",
          "cognitiveOperations",
          "practiceModalities"
        ],
        properties: {
          catalogVersion: NON_EMPTY_STRING,
          families: STRING_LIST,
          disciplines: STRING_LIST,
          structures: STRING_LIST,
          cognitiveOperations: STRING_LIST,
          practiceModalities: STRING_LIST
        }
      },
      selectionConstraints: {
        type: "object",
        additionalProperties: false,
        required: [
          "allowedFits",
          "allowEmbeddedPractice",
          "allowResponsePackages",
          "onNoAdequateRepresentation"
        ],
        properties: {
          allowedFits: {
            type: "array",
            minItems: 1,
            items: { enum: ["canonical", "versatile", "substitute"] },
            uniqueItems: true
          },
          allowEmbeddedPractice: { type: "boolean" },
          allowResponsePackages: { type: "boolean" },
          onNoAdequateRepresentation: {
            enum: ["block", "record_limitation"]
          }
        }
      },
      provenanceRefs: STRING_LIST
    }
  },
  MaterializationManifest: {
    type: "object",
    additionalProperties: false,
    required: [
      "contract",
      "modelVersion",
      "id",
      "version",
      "scope",
      "analysisRef",
      "effectiveSnapshotRef",
      "blueprintRef",
      "materializedWorkspaceRevision",
      "scopeEntityVersion",
      "contentHash",
      "blueprintHash",
      "createdAt",
      "resourceSetRefs",
      "plannedSteps",
      "materializedSteps",
      "explanationCoverage",
      "evidenceCoverage",
      "practiceOpportunities",
      "resourceSelections",
      "materializedResources",
      "derivedMetrics",
      "assumptions",
      "limitations"
    ],
    properties: {
      contract: { const: INSTRUCTIONAL_DESIGN_CONTRACT_IDS.materializationManifest },
      modelVersion: { const: INSTRUCTIONAL_DESIGN_MODEL_VERSION },
      id: NON_EMPTY_STRING,
      version: NON_EMPTY_STRING,
      scope: { $ref: "#/$defs/MicrosequenceScope" },
      analysisRef: { $ref: "#/$defs/VersionedRef" },
      effectiveSnapshotRef: { $ref: "#/$defs/VersionedRef" },
      blueprintRef: { $ref: "#/$defs/VersionedRef" },
      materializedWorkspaceRevision: { type: "integer", minimum: 1 },
      scopeEntityVersion: { type: "integer", minimum: 1 },
      contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      blueprintHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      createdAt: NON_EMPTY_STRING,
      resourceSetRefs: {
        type: "array",
        items: { $ref: "#/$defs/VersionedRef" },
        uniqueItems: true
      },
      plannedSteps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["stepRef", "kind", "unitRefs"],
          properties: {
            stepRef: NON_EMPTY_STRING,
            kind: { enum: ["theory", "practice"] },
            unitRefs: STRING_LIST
          }
        }
      },
      materializedSteps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["stepRef", "kind", "unitRefs", "artifactRefs"],
          properties: {
            stepRef: NON_EMPTY_STRING,
            kind: { enum: ["theory", "practice"] },
            unitRefs: STRING_LIST,
            artifactRefs: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            }
          }
        }
      },
      explanationCoverage: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["requirementRef", "status", "evidenceRefs"],
          properties: {
            requirementRef: NON_EMPTY_STRING,
            status: { enum: ["developed", "mentioned", "missing", "not_applicable"] },
            evidenceRefs: STRING_LIST
          }
        }
      },
      evidenceCoverage: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["requirementRef", "status", "practiceOpportunityRefs", "evidenceRefs"],
          properties: {
            requirementRef: NON_EMPTY_STRING,
            status: { enum: ["covered", "partial", "missing", "not_applicable"] },
            practiceOpportunityRefs: STRING_LIST,
            evidenceRefs: STRING_LIST
          }
        }
      },
      practiceOpportunities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "evidenceRequirementRefs",
            "semanticSignature",
            "variation",
            "artifactRefs"
          ],
          properties: {
            id: NON_EMPTY_STRING,
            evidenceRequirementRefs: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            },
            semanticSignature: NON_EMPTY_STRING,
            variation: { $ref: "#/$defs/ParameterValue" },
            artifactRefs: {
              type: "array",
              minItems: 1,
              items: NON_EMPTY_STRING,
              uniqueItems: true
            }
          }
        }
      },
      resourceSelections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "stepRef",
            "package",
            "authorizedByResourceSetRef",
            "role",
            "fit",
            "rationale",
            "limitations"
          ],
          properties: {
            id: NON_EMPTY_STRING,
            stepRef: NON_EMPTY_STRING,
            package: { $ref: "#/$defs/PackageRef" },
            authorizedByResourceSetRef: { $ref: "#/$defs/VersionedRef" },
            role: { enum: ["exposition", "embedded_practice", "response"] },
            fit: { enum: ["canonical", "versatile", "substitute"] },
            rationale: NON_EMPTY_STRING,
            limitations: STRING_LIST
          }
        }
      },
      materializedResources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "selectionRef", "artifactRef", "package", "role"],
          properties: {
            id: NON_EMPTY_STRING,
            selectionRef: NON_EMPTY_STRING,
            artifactRef: NON_EMPTY_STRING,
            package: { $ref: "#/$defs/PackageRef" },
            role: { enum: ["exposition", "embedded_practice", "response"] }
          }
        }
      },
      derivedMetrics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "kind",
            "value",
            "unit",
            "scope",
            "denominator",
            "algorithm"
          ],
          properties: {
            id: NON_EMPTY_STRING,
            kind: { enum: ["observed", "derived"] },
            value: { type: "number", minimum: 0 },
            unit: NON_EMPTY_STRING,
            scope: { $ref: "#/$defs/Scope" },
            denominator: {
              type: "object",
              additionalProperties: false,
              required: ["count", "unit", "refs"],
              properties: {
                count: { type: "integer", minimum: 1 },
                unit: NON_EMPTY_STRING,
                refs: {
                  type: "array",
                  minItems: 1,
                  items: NON_EMPTY_STRING,
                  uniqueItems: true
                }
              }
            },
            algorithm: {
              type: "object",
              additionalProperties: false,
              required: ["id", "version", "inputRefs"],
              properties: {
                id: NON_EMPTY_STRING,
                version: NON_EMPTY_STRING,
                inputRefs: {
                  type: "array",
                  minItems: 1,
                  items: NON_EMPTY_STRING,
                  uniqueItems: true
                }
              }
            }
          }
        }
      },
      assumptions: STRING_LIST,
      limitations: STRING_LIST
    }
  }
};

function schemaFor(name, slug) {
  return Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://aralearn.app/contracts/instructional-design/${slug}.schema.json`,
    title: name,
    $ref: `#/$defs/${name}`,
    $defs: structuredClone(CONTRACT_DEFINITIONS)
  });
}

export const INSTRUCTIONAL_DESIGN_CONTRACTS = Object.freeze({
  instructionalAnalysis: schemaFor("InstructionalAnalysis", "instructional-analysis-v1"),
  designParameterDefinition: schemaFor("DesignParameterDefinition", "design-parameter-definition-v1"),
  designParameterAssignment: schemaFor("DesignParameterAssignment", "design-parameter-assignment-v1"),
  effectiveDesignSnapshot: schemaFor("EffectiveDesignSnapshot", "effective-design-snapshot-v1"),
  materializationManifest: schemaFor("MaterializationManifest", "materialization-manifest-v1"),
  resourceSet: schemaFor("ResourceSet", "resource-set-v1")
});

const NOT_VALIDATED = "Esta é uma operacionalização de desenho do AraLearn, não uma medida científica validada do construto relacionado.";

function parameter({
  id,
  label,
  description,
  valueType,
  numerator,
  denominator,
  scopes = ["microsequence"],
  empiricalStatus = "candidate_for_validation",
  epistemicKind = "aralearn_operationalization",
  anchors,
  proposedBy = "gpt",
  calculatedBy = "gpt",
  validatedBy = ["backend", "author", "researcher"],
  constraints = {}
}) {
  return Object.freeze({
    contract: INSTRUCTIONAL_DESIGN_CONTRACT_IDS.designParameterDefinition,
    catalogVersion: DESIGN_PARAMETER_CATALOG_VERSION,
    id,
    version: "1.0.0",
    label,
    description,
    valueType,
    unit: { numerator, denominator },
    supportedScopes: scopes,
    epistemicClassification: {
      kind: epistemicKind,
      claimBoundary: epistemicKind === "software_property"
        ? "Esta é uma propriedade verificável do software, não uma medida educacional nem evidência de eficácia."
        : NOT_VALIDATED
    },
    empiricalStatus,
    theoreticalAnchors: anchors,
    responsibility: { proposedBy, calculatedBy, validatedBy },
    resolutionRule: {
      strategy: "nearest_scope_replaces",
      sameScopeConflict: "error",
      assignmentValue: "complete_value",
      researchLockAuthority: "separate_gate"
    },
    constraints
  });
}

export const DESIGN_PARAMETER_CATALOG = Object.freeze([
  parameter({
    id: "new_units_per_theory_step_ceiling",
    label: "Limite proposto de unidades novas por passo",
    description: "Limite contextual para a quantidade de unidades da análise tratadas como novas em um mesmo passo de teoria.",
    valueType: "integer",
    numerator: "assumed_new_analysis_unit",
    denominator: "theory_step",
    anchors: [{
      citationKey: "koedinger2012kli",
      relation: "O grain size da análise de conhecimento depende do conteúdo, da tarefa e da população-alvo.",
      limit: "Uma unidade de análise do AraLearn não é um knowledge component observado nem uma medida de aprendizagem."
    }],
    constraints: { minimum: 1 }
  }),
  parameter({
    id: "simultaneous_new_units_per_coordination_set_ceiling",
    label: "Limite proposto de coordenação simultânea",
    description: "Limite contextual de unidades assumidas como novas que precisam ser coordenadas simultaneamente em uma relação explícita.",
    valueType: "integer",
    numerator: "assumed_new_analysis_unit",
    denominator: "coordination_set",
    anchors: [{
      citationKey: "chen2023elementinteractivity",
      relation: "Element interactivity depende da estrutura da informação e do conhecimento prévio assumido.",
      limit: "A cardinalidade do conjunto não mede carga cognitiva, dificuldade nem aprendizagem."
    }],
    constraints: { minimum: 1 }
  }),
  parameter({
    id: "applicable_explanation_requirement_refs",
    label: "Requisitos de explicação aplicáveis",
    description: "Conjunto explícito de requisitos de explicação que o desenho deve desenvolver no escopo corrente.",
    valueType: "set",
    numerator: "explanation_requirement_ref",
    denominator: "microsequence",
    anchors: [{
      citationKey: "wittwer2008explanations",
      relation: "Explicações instrucionais precisam ser adaptadas ao conhecimento e integradas à atividade cognitiva em curso.",
      limit: "O conjunto é contextual e não constitui lista universal de componentes obrigatórios."
    }],
    constraints: { setItemPattern: "^[a-zA-Z0-9._:-]+$" }
  }),
  parameter({
    id: "evidence_alignment_relation",
    label: "Relação entre alvo e evidência",
    description: "Relação explícita entre unidades ou operações pretendidas e requisitos de evidência capazes de sustentá-las.",
    valueType: "relation",
    numerator: "evidence_alignment_edge",
    denominator: "microsequence",
    anchors: [{
      citationKey: "mislevy2003ecd",
      relation: "ECD separa a afirmação pretendida, a evidência observável e as tarefas que podem produzi-la.",
      limit: "A relação registrada não transforma desempenho em inferência válida de proficiência sem um modelo de evidência validado."
    }],
    constraints: { relationKinds: ["targets", "elicits", "supports"] }
  }),
  parameter({
    id: "distinct_practice_opportunities_per_evidence_requirement",
    label: "Faixa de oportunidades semanticamente distintas",
    description: "Faixa proposta de oportunidades com assinaturas semânticas distintas para cada requisito de evidência.",
    valueType: "range",
    numerator: "distinct_semantic_practice_opportunity",
    denominator: "evidence_requirement",
    anchors: [{
      citationKey: "koedinger2012kli",
      relation: "Eventos instrucionais e condições de prática precisam ser relacionados ao tipo de conhecimento e ao processo de aprendizagem pretendido.",
      limit: "A faixa é hipótese de desenho; repetição superficial não aumenta o numerador e a quantidade não prova aprendizagem."
    }],
    constraints: { minimum: 0 }
  }),
  parameter({
    id: "practice_variation_dimensions",
    label: "Dimensões de variação da prática",
    description: "Vetor categórico ou numérico das dimensões que devem variar por razão semântica entre oportunidades de prática.",
    valueType: "vector",
    numerator: "variation_dimension",
    denominator: "evidence_requirement",
    anchors: [{
      citationKey: "vanmerrienboer2019fourcomponent",
      relation: "Variação de tarefas pode apoiar transferência quando preserva relações relevantes da competência.",
      limit: "O vetor não é uma escala ordinal de qualidade nem torna 4C/ID pedagogia obrigatória."
    }],
    constraints: {}
  }),
  parameter({
    id: "accepted_performance_forms",
    label: "Formas de desempenho aceitas",
    description: "Conjunto de formas de desempenho que podem fornecer a evidência pretendida no ambiente disponível.",
    valueType: "set",
    numerator: "accepted_performance_form",
    denominator: "evidence_requirement",
    anchors: [{
      citationKey: "mislevy2003ecd",
      relation: "A tarefa deve permitir observações pertinentes à afirmação que se deseja sustentar.",
      limit: "As categorias não formam score de fidelidade e limitações de aproximação permanecem explícitas."
    }],
    constraints: {}
  }),
  parameter({
    id: "representation_fallback_policy",
    label: "Política para representação indisponível",
    description: "Decisão categórica sobre bloquear a materialização ou registrar a limitação quando a representação adequada não está disponível.",
    valueType: "enum",
    numerator: "fallback_policy_category",
    denominator: "resource_selection",
    scopes: ["workspace", "course", "module", "lesson", "microsequence"],
    anchors: [{
      citationKey: "ainsworth2006deft",
      relation: "Representações distintas oferecem funções e exigências cognitivas diferentes; multiplicidade não garante equivalência.",
      limit: "Permitir substituição não autoriza declarar equivalência entre representações."
    }],
    constraints: {
      allowedEnumValues: ["block", "allow_versatile_with_limitation", "allow_substitute_with_limitation"]
    }
  }),
  parameter({
    id: "available_resource_set_refs",
    label: "Conjuntos de resources disponíveis",
    description: "Conjunto de referências a ResourceSets versionados que restringem quais package@version podem ser escolhidos no escopo.",
    valueType: "set",
    numerator: "resource_set_ref",
    denominator: "scope",
    scopes: ["workspace", "course", "module", "lesson", "microsequence"],
    empiricalStatus: "software_definition",
    epistemicKind: "software_property",
    anchors: [{
      citationKey: "ainsworth2006deft",
      relation: "A disponibilidade de representações altera as funções representacionais possíveis no desenho.",
      limit: "ResourceSet expressa disponibilidade controlada, não seleção concreta nem uso materializado."
    }],
    constraints: { setItemPattern: "^[a-zA-Z0-9._:-]+@[a-zA-Z0-9._-]+$" }
  })
]);

export function instructionalDesignContracts() {
  return structuredClone(INSTRUCTIONAL_DESIGN_CONTRACTS);
}

export function designParameterCatalog() {
  return structuredClone(DESIGN_PARAMETER_CATALOG);
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function keyForPackage(value) {
  return JSON.stringify([normalizedText(value?.packageId), normalizedText(value?.version)]);
}

function keyForVersioned(value) {
  return JSON.stringify([normalizedText(value?.id), normalizedText(value?.version)]);
}

function keyForScope(value) {
  return `${normalizedText(value?.kind)}:${normalizedText(value?.ref)}`;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function duplicateIds(entries) {
  const seen = new Set();
  return list(entries)
    .map((entry) => normalizedText(entry?.id))
    .filter((id) => seen.has(id) || !seen.add(id));
}

function checkUniqueIds(errors, entries, path) {
  const duplicates = duplicateIds(entries);
  if (duplicates.length) errors.push(`${path} contém ids duplicados: ${[...new Set(duplicates)].join(", ")}.`);
}

function requireArrayFields(errors, value, keys, path) {
  keys.forEach((key) => {
    if (!Array.isArray(value?.[key])) {
      errors.push(`${path}.${key} precisa ser uma lista explícita.`);
    }
  });
}

function checkParameterValue(errors, definition, value, path) {
  if (!definition || !value) return;
  if (definition.valueType !== value.kind) {
    errors.push(`${path} usa ${value.kind}, mas ${definition.id}@${definition.version} exige ${definition.valueType}.`);
  }
  if (value.kind === "range" && value.minimum > value.maximum) {
    errors.push(`${path} possui intervalo invertido.`);
  }
  if (value.kind === "enum") {
    const allowed = list(definition.constraints?.allowedEnumValues);
    if (allowed.length && !allowed.includes(value.value)) {
      errors.push(`${path} usa enumeração fora do contrato de ${definition.id}.`);
    }
  }
  if (value.kind === "relation") {
    const nodes = new Set(list(value.nodes));
    list(value.edges).forEach((edge, index) => {
      if (!nodes.has(edge?.from) || !nodes.has(edge?.to)) {
        errors.push(`${path}.edges[${index}] referencia nó ausente.`);
      }
    });
  }
  if (value.kind === "vector") {
    const dimensions = list(value.components).map((component) => component?.dimension);
    if (new Set(dimensions).size !== dimensions.length) {
      errors.push(`${path} repete dimensão no vetor.`);
    }
  }
}

export function deriveInstructionalAnalysisObservations(analysis) {
  const knowledgeStateCounts = {
    new: 0,
    partial: 0,
    integrated: 0,
    unknown: 0
  };
  list(analysis?.units).forEach((unit) => {
    if (Object.hasOwn(knowledgeStateCounts, unit?.priorKnowledge?.state)) {
      knowledgeStateCounts[unit.priorKnowledge.state] += 1;
    }
  });
  const coordinationSets = list(analysis?.coordinationRequirements).map((requirement) => ({
    requirementRef: requirement.id,
    unitCount: list(requirement.unitRefs).length,
    assumedNewUnitCount: list(requirement.assumedNewUnitRefs).length
  }));
  return {
    analysisUnitCount: list(analysis?.units).length,
    knowledgeStateCounts,
    coordinationSets
  };
}

export function deriveMaterializationObservations(manifest) {
  const practiceOpportunities = list(manifest?.practiceOpportunities);
  const distinctSemanticSignatures = new Set(
    practiceOpportunities.map((opportunity) => normalizedText(opportunity?.semanticSignature))
  );
  const explanationCoverage = {
    developed: 0,
    mentioned: 0,
    missing: 0,
    not_applicable: 0
  };
  list(manifest?.explanationCoverage).forEach((entry) => {
    if (Object.hasOwn(explanationCoverage, entry?.status)) explanationCoverage[entry.status] += 1;
  });
  const evidenceCoverage = {
    covered: 0,
    partial: 0,
    missing: 0,
    not_applicable: 0
  };
  list(manifest?.evidenceCoverage).forEach((entry) => {
    if (Object.hasOwn(evidenceCoverage, entry?.status)) evidenceCoverage[entry.status] += 1;
  });
  return {
    practiceOpportunityCount: practiceOpportunities.length,
    distinctPracticeOpportunityCount: distinctSemanticSignatures.size,
    explanationCoverage: {
      denominator: list(manifest?.explanationCoverage).length,
      counts: explanationCoverage
    },
    evidenceCoverage: {
      denominator: list(manifest?.evidenceCoverage).length,
      counts: evidenceCoverage
    },
    availableResourceSetCount: list(manifest?.resourceSetRefs).length,
    selectedResourceCount: list(manifest?.resourceSelections).length,
    materializedResourceCount: list(manifest?.materializedResources).length
  };
}

export function evaluateInstructionalDesignBundle(raw) {
  const errors = [];
  const analysis = raw?.analysis;
  const definitions = list(raw?.parameterDefinitions);
  const assignments = list(raw?.parameterAssignments);
  const snapshot = raw?.effectiveSnapshot;
  const resourceSets = list(raw?.resourceSets);
  const manifest = raw?.materializationManifest;

  requireArrayFields(errors, raw, [
    "parameterDefinitions",
    "parameterAssignments",
    "resourceSets"
  ], "bundle");
  requireArrayFields(errors, analysis, [
    "sourceRefs",
    "units",
    "relations",
    "coordinationRequirements",
    "explanationRequirements",
    "evidenceRequirements",
    "practiceVariationRequirements",
    "fidelityRequirements",
    "representationRequirements",
    "assumptions",
    "limitations"
  ], "analysis");
  requireArrayFields(errors, snapshot, [
    "resolutionPath",
    "resolvedValues",
    "resourceSetRefs"
  ], "effectiveSnapshot");
  requireArrayFields(errors, manifest, [
    "resourceSetRefs",
    "plannedSteps",
    "materializedSteps",
    "explanationCoverage",
    "evidenceCoverage",
    "practiceOpportunities",
    "resourceSelections",
    "materializedResources",
    "derivedMetrics",
    "assumptions",
    "limitations"
  ], "materializationManifest");

  const analysisKey = keyForVersioned(analysis);
  const snapshotAnalysisKey = keyForVersioned(snapshot?.analysisRef);
  const manifestAnalysisKey = keyForVersioned(manifest?.analysisRef);
  const snapshotKey = keyForVersioned(snapshot);
  const manifestSnapshotKey = keyForVersioned(manifest?.effectiveSnapshotRef);
  if (snapshotAnalysisKey !== analysisKey) {
    errors.push(`effectiveSnapshot.analysisRef diverge da análise avaliada: ${snapshotAnalysisKey}.`);
  }
  if (manifestAnalysisKey !== analysisKey) {
    errors.push(`materializationManifest.analysisRef diverge da análise avaliada: ${manifestAnalysisKey}.`);
  }
  if (manifestSnapshotKey !== snapshotKey) {
    errors.push(`materializationManifest.effectiveSnapshotRef diverge do snapshot avaliado: ${manifestSnapshotKey}.`);
  }
  if (snapshot?.parameterCatalogVersion !== DESIGN_PARAMETER_CATALOG_VERSION) {
    errors.push("effectiveSnapshot.parameterCatalogVersion diverge do catálogo avaliado.");
  }
  if (Number.isInteger(snapshot?.basedOnWorkspaceRevision)
    && Number.isInteger(analysis?.derivedFrom?.workspaceRevision)
    && snapshot.basedOnWorkspaceRevision < analysis.derivedFrom.workspaceRevision) {
    errors.push("effectiveSnapshot.basedOnWorkspaceRevision antecede a revisão usada pela análise.");
  }
  if (snapshot?.scopeEntityVersion !== analysis?.derivedFrom?.scopeEntityVersion) {
    errors.push("effectiveSnapshot.scopeEntityVersion diverge da versão usada pela análise.");
  }
  if (Number.isInteger(manifest?.materializedWorkspaceRevision)
    && Number.isInteger(snapshot?.basedOnWorkspaceRevision)
    && manifest.materializedWorkspaceRevision < snapshot.basedOnWorkspaceRevision) {
    errors.push("materializationManifest.materializedWorkspaceRevision antecede o snapshot efetivo.");
  }
  if (Number.isInteger(manifest?.scopeEntityVersion)
    && Number.isInteger(snapshot?.scopeEntityVersion)
    && manifest.scopeEntityVersion !== snapshot.scopeEntityVersion) {
    errors.push("materializationManifest.scopeEntityVersion diverge da versão analisada.");
  }

  checkUniqueIds(errors, analysis?.units, "analysis.units");
  checkUniqueIds(errors, analysis?.relations, "analysis.relations");
  checkUniqueIds(errors, analysis?.coordinationRequirements, "analysis.coordinationRequirements");
  checkUniqueIds(errors, analysis?.explanationRequirements, "analysis.explanationRequirements");
  checkUniqueIds(errors, analysis?.evidenceRequirements, "analysis.evidenceRequirements");
  checkUniqueIds(errors, definitions, "parameterDefinitions");
  checkUniqueIds(errors, assignments, "parameterAssignments");
  checkUniqueIds(errors, resourceSets, "resourceSets");
  checkUniqueIds(errors, manifest?.practiceOpportunities, "materializationManifest.practiceOpportunities");
  checkUniqueIds(errors, manifest?.resourceSelections, "materializationManifest.resourceSelections");
  checkUniqueIds(errors, manifest?.materializedResources, "materializationManifest.materializedResources");

  const units = new Map(list(analysis?.units).map((unit) => [unit.id, unit]));
  list(analysis?.relations).forEach((relation, index) => {
    if (!units.has(relation?.fromUnitRef) || !units.has(relation?.toUnitRef)) {
      errors.push(`analysis.relations[${index}] referencia unidade ausente.`);
    }
  });
  list(analysis?.coordinationRequirements).forEach((requirement, index) => {
    const requirementUnits = new Set(list(requirement?.unitRefs));
    list(requirement?.unitRefs).forEach((unitRef) => {
      if (!units.has(unitRef)) errors.push(`analysis.coordinationRequirements[${index}] referencia unidade ausente: ${unitRef}.`);
    });
    list(requirement?.assumedNewUnitRefs).forEach((unitRef) => {
      if (!requirementUnits.has(unitRef)) {
        errors.push(`analysis.coordinationRequirements[${index}] trata como nova unidade fora do conjunto coordenado: ${unitRef}.`);
      } else if (units.get(unitRef)?.priorKnowledge?.state === "integrated") {
        errors.push(`analysis.coordinationRequirements[${index}] trata como nova unidade marcada como integrada: ${unitRef}.`);
      }
    });
  });
  list(analysis?.explanationRequirements).forEach((requirement, index) => {
    list(requirement?.targetUnitRefs).forEach((unitRef) => {
      if (!units.has(unitRef)) errors.push(`analysis.explanationRequirements[${index}] referencia unidade ausente: ${unitRef}.`);
    });
  });
  const fidelityRequirements = new Set(list(analysis?.fidelityRequirements).map((entry) => entry.id));
  const evidenceRequirements = new Set(list(analysis?.evidenceRequirements).map((entry) => entry.id));
  list(analysis?.evidenceRequirements).forEach((requirement, index) => {
    list(requirement?.targetUnitRefs).forEach((unitRef) => {
      if (!units.has(unitRef)) errors.push(`analysis.evidenceRequirements[${index}] referencia unidade ausente: ${unitRef}.`);
    });
    if (requirement?.fidelityRequirementRef && !fidelityRequirements.has(requirement.fidelityRequirementRef)) {
      errors.push(`analysis.evidenceRequirements[${index}] referencia requisito de fidelidade ausente.`);
    }
  });
  list(analysis?.practiceVariationRequirements).forEach((requirement, index) => {
    if (!evidenceRequirements.has(requirement?.evidenceRequirementRef)) {
      errors.push(`analysis.practiceVariationRequirements[${index}] referencia requisito de evidência ausente.`);
    }
  });
  list(analysis?.representationRequirements).forEach((requirement, index) => {
    list(requirement?.targetUnitRefs).forEach((unitRef) => {
      if (!units.has(unitRef)) errors.push(`analysis.representationRequirements[${index}] referencia unidade ausente: ${unitRef}.`);
    });
  });

  const definitionsByRef = new Map(
    definitions.map((definition) => [keyForVersioned(definition), definition])
  );
  const scopeOrder = ["workspace", "course", "module", "lesson", "microsequence"];
  const targetScopeIndex = scopeOrder.indexOf(snapshot?.scope?.kind);
  const expectedPathKinds = targetScopeIndex >= 0 ? scopeOrder.slice(0, targetScopeIndex + 1) : [];
  const resolutionPath = list(snapshot?.resolutionPath);
  const actualPathKinds = resolutionPath.map((scope) => scope?.kind);
  if (!sameValue(actualPathKinds, expectedPathKinds)) {
    errors.push(`effectiveSnapshot.resolutionPath precisa seguir ${expectedPathKinds.join(" → ")} até o alvo.`);
  }
  const pathTarget = resolutionPath.at(-1);
  if (keyForScope(pathTarget) !== keyForScope(snapshot?.scope)) {
    errors.push("effectiveSnapshot.resolutionPath precisa terminar no escopo do snapshot.");
  }
  const resolutionPathKeys = new Set(resolutionPath.map(keyForScope));
  const assignmentsByRef = new Map(
    assignments.map((assignment) => [keyForVersioned(assignment), assignment])
  );
  const assignmentSlots = new Set();
  assignments.forEach((assignment, index) => {
    const definitionKey = keyForVersioned(assignment?.definitionRef);
    const definition = definitionsByRef.get(definitionKey);
    if (!definition) errors.push(`parameterAssignments[${index}] referencia definição ausente: ${definitionKey}.`);
    if (!Object.hasOwn(assignment ?? {}, "value")) {
      errors.push(`parameterAssignments[${index}] precisa persistir o valor explícito.`);
    }
    checkParameterValue(errors, definition, assignment?.value, `parameterAssignments[${index}].value`);
    const slot = `${definitionKey}|${keyForScope(assignment?.scope)}`;
    if (assignmentSlots.has(slot)) {
      errors.push(`parameterAssignments[${index}] conflita com outro valor no mesmo escopo: ${slot}.`);
    }
    assignmentSlots.add(slot);
  });
  list(snapshot?.resolvedValues).forEach((resolved, index) => {
    const definitionKey = keyForVersioned(resolved?.definitionRef);
    const definition = definitionsByRef.get(definitionKey);
    if (!definition) errors.push(`effectiveSnapshot.resolvedValues[${index}] referencia definição ausente: ${definitionKey}.`);
    checkParameterValue(errors, definition, resolved?.value, `effectiveSnapshot.resolvedValues[${index}].value`);
    const assignmentRef = resolved?.resolution?.assignmentRef;
    const assignmentKey = assignmentRef ? keyForVersioned(assignmentRef) : "";
    if (assignmentRef && !assignmentsByRef.has(assignmentKey)) {
      errors.push(`effectiveSnapshot.resolvedValues[${index}] referencia assignment ausente: ${assignmentKey}.`);
    }
    const sourceAssignment = assignmentsByRef.get(assignmentKey);
    if (sourceAssignment && resolved?.resolution?.assignmentMode !== sourceAssignment.mode) {
      errors.push(`effectiveSnapshot.resolvedValues[${index}] perde o modo do assignment de origem.`);
    }
    if (sourceAssignment && !sameValue(resolved?.value, sourceAssignment.value)) {
      errors.push(`effectiveSnapshot.resolvedValues[${index}] precisa substituir pelo valor completo do assignment.`);
    }
    if (resolved?.resolution?.inheritance === "local" && keyForScope(resolved?.resolution?.sourceScope) !== keyForScope(snapshot?.scope)) {
      errors.push(`effectiveSnapshot.resolvedValues[${index}] local precisa usar o escopo do snapshot.`);
    }
    if (!resolutionPathKeys.has(keyForScope(resolved?.resolution?.sourceScope))) {
      errors.push(`effectiveSnapshot.resolvedValues[${index}] usa sourceScope fora do resolutionPath.`);
    }
    if (resolved?.resolution?.inheritance === "inherited" && !resolved?.resolution?.sourceScope) {
      errors.push(`effectiveSnapshot.resolvedValues[${index}] herdado precisa declarar o escopo de origem.`);
    }
  });

  const resourceSetsByRef = new Map();
  resourceSets.forEach((resourceSet, index) => {
    const resourceSetKey = keyForVersioned(resourceSet);
    resourceSetsByRef.set(resourceSetKey, resourceSet);
    const packageKeys = list(resourceSet?.packages).map(keyForPackage);
    if (new Set(packageKeys).size !== packageKeys.length) {
      errors.push(`resourceSets[${index}] repete package@version.`);
    }
    if (resourceSet?.resolvedCatalogVersion !== resourceSet?.facetBasis?.catalogVersion) {
      errors.push(`resourceSets[${index}] diverge entre catálogo resolvido e proveniência de facetas.`);
    }
  });
  const manifestResourceSetKeys = list(manifest?.resourceSetRefs).map(
    keyForVersioned
  );
  const snapshotResourceSetKeys = list(snapshot?.resourceSetRefs).map(
    keyForVersioned
  );
  const sortedManifestResourceSetKeys = [...manifestResourceSetKeys].sort();
  const sortedSnapshotResourceSetKeys = [...snapshotResourceSetKeys].sort();
  if (!sameValue(sortedManifestResourceSetKeys, sortedSnapshotResourceSetKeys)) {
    errors.push("effectiveSnapshot e materializationManifest precisam declarar exatamente os mesmos ResourceSets.");
  }
  manifestResourceSetKeys.forEach((key, index) => {
    if (!resourceSetsByRef.has(key)) {
      errors.push(`materializationManifest.resourceSetRefs[${index}] referencia ResourceSet ausente: ${key}.`);
    }
  });
  snapshotResourceSetKeys.forEach((key, index) => {
    if (!resourceSetsByRef.has(key)) {
      errors.push(`effectiveSnapshot.resourceSetRefs[${index}] referencia ResourceSet ausente: ${key}.`);
    }
  });
  const manifestResourceSetKeySet = new Set(manifestResourceSetKeys);
  const snapshotResourceSetKeySet = new Set(snapshotResourceSetKeys);
  const effectiveFallbackPolicy = list(snapshot?.resolvedValues).find(({ definitionRef }) => (
    definitionRef?.id === "representation_fallback_policy"
  ))?.value?.value;
  const plannedStepsByRef = new Map();
  list(manifest?.plannedSteps).forEach((step, index) => {
    if (plannedStepsByRef.has(step?.stepRef)) {
      errors.push(`materializationManifest.plannedSteps[${index}] repete stepRef.`);
    }
    plannedStepsByRef.set(step?.stepRef, step);
  });
  const materializedArtifactRefs = new Set();
  const artifactStepRefs = new Map();
  list(manifest?.materializedSteps).forEach((step, index) => {
    const planned = plannedStepsByRef.get(step?.stepRef);
    if (!planned) {
      errors.push(`materializationManifest.materializedSteps[${index}] referencia passo não planejado.`);
    } else if (planned.kind !== step?.kind) {
      errors.push(`materializationManifest.materializedSteps[${index}] diverge do tipo planejado.`);
    }
    list(step?.artifactRefs).forEach((artifactRef) => {
      if (materializedArtifactRefs.has(artifactRef)) {
        errors.push(`materializationManifest.materializedSteps[${index}] repete artefato materializado: ${artifactRef}.`);
      }
      materializedArtifactRefs.add(artifactRef);
      artifactStepRefs.set(artifactRef, step?.stepRef);
    });
  });
  const selectionsById = new Map();
  list(manifest?.resourceSelections).forEach((selection, index) => {
    selectionsById.set(selection.id, selection);
    if (!plannedStepsByRef.has(selection?.stepRef)) {
      errors.push(`materializationManifest.resourceSelections[${index}] referencia passo não planejado.`);
    }
    const packageKey = keyForPackage(selection?.package);
    const authorizerKey = keyForVersioned(selection?.authorizedByResourceSetRef);
    if (!manifestResourceSetKeySet.has(authorizerKey) || !snapshotResourceSetKeySet.has(authorizerKey)) {
      errors.push(`materializationManifest.resourceSelections[${index}] usa ResourceSet não declarado no snapshot e no manifesto: ${authorizerKey}.`);
    }
    const authorizer = resourceSetsByRef.get(authorizerKey);
    const authorizedPackages = new Set(list(authorizer?.packages).map(keyForPackage));
    if (!authorizer || !authorizedPackages.has(packageKey)) {
      errors.push(`materializationManifest.resourceSelections[${index}] escolhe package fora do ResourceSet autorizador: ${packageKey}.`);
    }
    if (!list(authorizer?.selectionConstraints?.allowedFits).includes(selection?.fit)) {
      errors.push(`materializationManifest.resourceSelections[${index}] usa fit não permitido pelo ResourceSet autorizador: ${selection?.fit}.`);
    }
    if (selection?.role === "embedded_practice" && authorizer?.selectionConstraints?.allowEmbeddedPractice !== true) {
      errors.push(`materializationManifest.resourceSelections[${index}] usa prática incorporada não permitida pelo ResourceSet autorizador.`);
    }
    if (selection?.role === "response" && authorizer?.selectionConstraints?.allowResponsePackages !== true) {
      errors.push(`materializationManifest.resourceSelections[${index}] usa response package não permitido pelo ResourceSet autorizador.`);
    }
    if (selection?.fit === "substitute") {
      if (!effectiveFallbackPolicy) {
        errors.push(`materializationManifest.resourceSelections[${index}] usa substitute sem política efetiva de representação.`);
      } else if (effectiveFallbackPolicy !== "allow_substitute_with_limitation") {
        errors.push(`materializationManifest.resourceSelections[${index}] usa substitute apesar da política efetiva ${effectiveFallbackPolicy}.`);
      }
      if (authorizer?.selectionConstraints?.onNoAdequateRepresentation === "block") {
        errors.push(`materializationManifest.resourceSelections[${index}] usa substitute apesar de bloqueio do ResourceSet autorizador.`);
      } else if (!list(selection?.limitations).length) {
        errors.push(`materializationManifest.resourceSelections[${index}] usa substitute sem registrar limitação.`);
      }
    }
  });
  list(manifest?.materializedResources).forEach((materialized, index) => {
    const selection = selectionsById.get(materialized?.selectionRef);
    if (!selection) {
      errors.push(`materializationManifest.materializedResources[${index}] referencia seleção ausente.`);
      return;
    }
    if (keyForPackage(selection.package) !== keyForPackage(materialized?.package)) {
      errors.push(`materializationManifest.materializedResources[${index}] diverge do package selecionado.`);
    }
    if (selection.role !== materialized?.role) {
      errors.push(`materializationManifest.materializedResources[${index}] diverge do papel selecionado.`);
    }
    if (!materializedArtifactRefs.has(materialized?.artifactRef)) {
      errors.push(`materializationManifest.materializedResources[${index}] referencia artefato ausente dos passos materializados.`);
    } else if (artifactStepRefs.get(materialized?.artifactRef) !== selection.stepRef) {
      errors.push(`materializationManifest.materializedResources[${index}] liga o artefato a um passo diferente da seleção.`);
    }
  });

  const explanationRequirements = new Set(list(analysis?.explanationRequirements).map((entry) => entry.id));
  list(manifest?.explanationCoverage).forEach((coverage, index) => {
    if (!explanationRequirements.has(coverage?.requirementRef)) {
      errors.push(`materializationManifest.explanationCoverage[${index}] referencia requisito ausente.`);
    }
    if (coverage?.status === "developed" && !list(coverage?.evidenceRefs).length) {
      errors.push(`materializationManifest.explanationCoverage[${index}] declara desenvolvimento sem evidência materializada.`);
    }
    list(coverage?.evidenceRefs).forEach((evidenceRef) => {
      if (!materializedArtifactRefs.has(evidenceRef)) {
        errors.push(`materializationManifest.explanationCoverage[${index}] referencia artefato não materializado: ${evidenceRef}.`);
      }
    });
  });
  const practiceOpportunities = new Set(list(manifest?.practiceOpportunities).map((entry) => entry.id));
  list(manifest?.practiceOpportunities).forEach((opportunity, index) => {
    list(opportunity?.evidenceRequirementRefs).forEach((requirementRef) => {
      if (!evidenceRequirements.has(requirementRef)) {
        errors.push(`materializationManifest.practiceOpportunities[${index}] referencia requisito de evidência ausente.`);
      }
    });
    list(opportunity?.artifactRefs).forEach((artifactRef) => {
      if (!materializedArtifactRefs.has(artifactRef)) {
        errors.push(`materializationManifest.practiceOpportunities[${index}] referencia artefato não materializado: ${artifactRef}.`);
      }
    });
  });
  list(manifest?.evidenceCoverage).forEach((coverage, index) => {
    if (!evidenceRequirements.has(coverage?.requirementRef)) {
      errors.push(`materializationManifest.evidenceCoverage[${index}] referencia requisito ausente.`);
    }
    list(coverage?.practiceOpportunityRefs).forEach((opportunityRef) => {
      if (!practiceOpportunities.has(opportunityRef)) {
        errors.push(`materializationManifest.evidenceCoverage[${index}] referencia oportunidade ausente: ${opportunityRef}.`);
      }
    });
    list(coverage?.evidenceRefs).forEach((evidenceRef) => {
      if (!materializedArtifactRefs.has(evidenceRef)) {
        errors.push(`materializationManifest.evidenceCoverage[${index}] referencia artefato não materializado: ${evidenceRef}.`);
      }
    });
  });
  list(manifest?.derivedMetrics).forEach((metric, index) => {
    if (metric?.id === "card_count" && metric?.value !== materializedArtifactRefs.size) {
      errors.push(`materializationManifest.derivedMetrics[${index}] diverge dos artefatos únicos materializados.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    observations: {
      analysis: deriveInstructionalAnalysisObservations(analysis),
      materialization: deriveMaterializationObservations(manifest)
    }
  };
}
