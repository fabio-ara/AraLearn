import { cardSchema, graphCardSchema } from "./cardSchema.js";

function densityBounds(density = "standard") {
  if (density === "deep") {
    return { min: 6, max: 10 };
  }
  if (density === "exam") {
    return { min: 8, max: 14 };
  }
  return { min: 4, max: 6 };
}

export function buildMicrosequenceCardsSchema(density = "standard", options = {}) {
  const bounds = densityBounds(density);
  const requireLeadingGraph = options?.requireLeadingGraph === true;
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "cards"],
    properties: {
      summary: { type: "string" },
      cards: {
        type: "array",
        minItems: bounds.min,
        maxItems: bounds.max,
        ...(requireLeadingGraph ? { prefixItems: [graphCardSchema] } : {}),
        items: cardSchema
      }
    }
  };
}

export const microsequenceCardsSchema = buildMicrosequenceCardsSchema();

export function buildSupportMicrosequenceSchema(density = "standard") {
  const bounds = densityBounds(density);
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "goal", "supportReason", "summary", "cards"],
    properties: {
      title: { type: "string", minLength: 1 },
      goal: { type: "string", minLength: 1 },
      supportReason: { type: "string", minLength: 1 },
      summary: { type: "string" },
      cards: {
        type: "array",
        minItems: bounds.min,
        maxItems: bounds.max,
        items: cardSchema
      }
    }
  };
}

export const supportMicrosequenceSchema = buildSupportMicrosequenceSchema();
