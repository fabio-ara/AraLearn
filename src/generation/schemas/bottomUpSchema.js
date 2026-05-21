import { cardSchema } from "./cardSchema.js";

export const DIDACTIC_KIND_ENUM = ["concept", "procedure", "discrimination", "formalization", "representation_reading", "cumulative_practice"];
export const PRACTICE_MODE_ENUM = ["recognition", "guided_production", "execution", "classification", "calculation", "explanation", "construction", "correction", "variation"];
export const REPRESENTATION_NEED_ENUM = ["none", "text", "table", "code", "visual_structure", "sequence", "formula"];
export const DEPENDENCY_POLICY_ENUM = ["self_contained", "uses_previous", "cumulative"];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildTechnicalCardBudget(density = "standard", modelCapabilities = {}) {
  const absolute = Math.max(1, Number(modelCapabilities?.absoluteMaxCards) || 8);
  const recommended = Math.max(1, Number(modelCapabilities?.recommendedMaxCards) || Math.min(absolute, 6));
  const densityMultiplier = density === "exam" ? 1.5 : density === "deep" ? 1.25 : 1;
  const suggested = Math.max(1, Math.min(absolute, Math.round(recommended * densityMultiplier)));
  return {
    minCardsPerCall: 1,
    suggestedCardsPerCall: suggested,
    maxCardsPerCall: absolute,
    budgetLabel: text(modelCapabilities?.model) || "generic-provider"
  };
}

function buildExpectedEvidenceSchema() {
  return {
    type: "array",
    items: { type: "string" }
  };
}

function buildDraftStepSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["role", "resourceType", "purpose", "inCardContext", "usesDependency", "expectedEvidence"],
    properties: {
      role: {
        type: "string",
        enum: [
          "microtheory",
          "guided_example",
          "example_reading",
          "contrast",
          "active_practice",
          "analogous_practice",
          "cumulative_review",
          "correction",
          "bridge_or_consolidation"
        ]
      },
      resourceType: {
        type: "string",
        enum: ["say", "table", "code", "graph", "block_gap_fill"]
      },
      purpose: { type: "string", minLength: 1 },
      inCardContext: { type: "array", items: { type: "string" } },
      usesDependency: { type: "array", items: { type: "string" } },
      expectedEvidence: buildExpectedEvidenceSchema()
    }
  };
}

export function buildBottomUpDidacticDraftSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["steps", "coverageNotes", "continuationNeeded", "continuationReason", "continuationMode", "continuationPrompt"],
    properties: {
      steps: {
        type: "array",
        minItems: 1,
        items: buildDraftStepSchema()
      },
      coverageNotes: { type: "array", items: { type: "string" } },
      continuationNeeded: { type: "boolean" },
      continuationReason: { type: "string" },
      continuationMode: {
        type: "string",
        enum: ["none", "same_microsequence", "support_microsequence", "next_microsequence"]
      },
      continuationPrompt: { type: "string" }
    }
  };
}

export function buildMicrosequenceCardsSchema(density = "standard", options = {}) {
  const budget = buildTechnicalCardBudget(density, options?.modelCapabilities);
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "cards"],
    properties: {
      summary: { type: "string" },
      cards: {
        type: "array",
        minItems: budget.minCardsPerCall,
        maxItems: budget.maxCardsPerCall,
        items: cardSchema
      }
    }
  };
}

export const microsequenceCardsSchema = buildMicrosequenceCardsSchema();

export function buildSupportMicrosequenceSchema(density = "standard", options = {}) {
  const budget = buildTechnicalCardBudget(density, options?.modelCapabilities);
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "goal",
      "supportReason",
      "didacticKind",
      "practiceMode",
      "representationNeed",
      "dependencyPolicy",
      "expectedEvidence",
      "summary",
      "cards"
    ],
    properties: {
      title: { type: "string", minLength: 1 },
      goal: { type: "string", minLength: 1 },
      supportReason: { type: "string", minLength: 1 },
      didacticKind: { type: "string", enum: DIDACTIC_KIND_ENUM },
      practiceMode: { type: "string", enum: PRACTICE_MODE_ENUM },
      representationNeed: { type: "string", enum: REPRESENTATION_NEED_ENUM },
      dependencyPolicy: { type: "string", enum: DEPENDENCY_POLICY_ENUM },
      expectedEvidence: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 }
      },
      summary: { type: "string" },
      cards: {
        type: "array",
        minItems: Math.max(4, budget.minCardsPerCall),
        maxItems: budget.maxCardsPerCall,
        items: cardSchema
      }
    }
  };
}

export const supportMicrosequenceSchema = buildSupportMicrosequenceSchema();
