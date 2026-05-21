function createCardBase(resourceType, contentSchema) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["key", "resourceType", "content"],
    properties: {
      key: { type: "string" },
      title: { type: "string" },
      resourceType: { type: "string", const: resourceType },
      content: contentSchema,
      after: { type: "string" }
    }
  };
}

export const sayCardSchema = createCardBase("say", { type: "string" });

const tableContentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["columns", "rows"],
  properties: {
    intro: { type: "string" },
    title: { type: "string" },
    columns: {
      type: "array",
      minItems: 1,
      items: { type: "string" }
    },
    rows: {
      type: "array",
      minItems: 1,
      items: {
        type: "array",
        minItems: 1,
        items: { type: "string" }
      }
    }
  }
};

export const tableCardSchema = createCardBase("table", tableContentSchema);

const codeContentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "language"],
  properties: {
    intro: { type: "string" },
    code: { type: "string" },
    language: { type: "string" }
  }
};

export const codeCardSchema = createCardBase("code", codeContentSchema);

const graphContentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["vertices", "edges"],
  properties: {
    intro: { type: "string" },
    vertices: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          x: { type: "number" },
          y: { type: "number" }
        }
      }
    },
    edges: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          weight: {
            anyOf: [{ type: "number" }, { type: "string" }]
          },
          label: { type: "string" }
        }
      }
    },
    highlight: {
      type: "object",
      additionalProperties: false,
      properties: {
        vertices: {
          type: "array",
          items: { type: "string" }
        },
        edges: {
          type: "array",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: { type: "string" }
          }
        }
      }
    }
  }
};

export const graphCardSchema = createCardBase("graph", graphContentSchema);

export const blockGapFillCardSchema = createCardBase("block_gap_fill", { type: "string" });

export const cardSchema = {
  anyOf: [
    sayCardSchema,
    tableCardSchema,
    codeCardSchema,
    graphCardSchema,
    blockGapFillCardSchema
  ]
};
