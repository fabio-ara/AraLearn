import { getSourceGuideSchemaPropertiesForModel, getSourceGuideSchemaRequired, SOURCE_GUIDE_LEVELS } from "../sourceGuides/sourceGuideStructured.js";
import { getLessonGuidanceSchemaProperties, getLessonGuidanceSchemaRequired } from "../generation/guidance/lessonGuidance.js";

export function getCardSchemaVariants() {
  return [
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        after: { type: "string" },
        wrong: { type: "array", items: { type: "string" }, minItems: 1 }
      },
      required: ["say"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        ask: { type: "string" },
        answer: {
          anyOf: [
            { type: "string" },
            { type: "array", items: { type: "string" }, minItems: 1 }
          ]
        },
        wrong: { type: "array", items: { type: "string" }, minItems: 2 }
      },
      required: ["ask", "answer", "wrong"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        language: { type: "string" },
        code: { type: "string" },
        after: { type: "string" },
        wrong: { type: "array", items: { type: "string" }, minItems: 1 }
      },
      required: ["code"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        table: {
          type: "object",
          properties: {
            title: { type: "string" },
            columns: { type: "array", items: { type: "string" }, minItems: 1 },
            rows: {
              type: "array",
              minItems: 1,
              items: {
                type: "array",
                minItems: 1,
                items: { type: "string" }
              }
            }
          },
          required: ["columns", "rows"],
          additionalProperties: false
        },
        after: { type: "string" }
      },
      required: ["table"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        tree: {
          type: "object",
          properties: {
            base: { type: "string" },
            current: { type: "string" },
            selected: { type: "string" },
            closed: { type: "array", items: { type: "string" } },
            items: { type: "object" }
          },
          required: ["items"],
          additionalProperties: false
        },
        after: { type: "string" }
      },
      required: ["tree"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        title: { type: "string" },
        say: { type: "string" },
        flow: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              start: { type: "string" },
              input: { type: "string" },
              output: { type: "string" },
              process: { type: "string" },
              end: { type: "string" },
              if: { type: "string" },
              then: {
                type: "array",
                items: { type: "object" }
              },
              else: {
                type: "array",
                items: { type: "object" }
              },
              blank: {
                anyOf: [
                  { type: "boolean" },
                  { type: "string" },
                  { type: "object" }
                ]
              }
            },
            additionalProperties: false
          }
        },
        after: { type: "string" }
      },
      required: ["flow"],
      additionalProperties: false
    }
  ];
}

function getCardSchemaByKind(cardKind) {
  const variants = getCardSchemaVariants();
  const indexByKind = {
    say: 0,
    ask: 1,
    code: 2,
    table: 3,
    tree: 4,
    flow: 5
  };
  return variants[indexByKind[cardKind] ?? 0];
}

export function getEditSchema(cardKind) {
  return getCardSchemaByKind(cardKind || "say");
}

export function getRepositionSchema() {
  return {
    type: "object",
    properties: {
      slotId: { type: "string" },
      renames: {
        type: "array",
        items: {
          type: "object",
          properties: {
            microsequenceKey: { type: "string" },
            title: { type: "string" }
          },
          required: ["microsequenceKey", "title"],
          additionalProperties: false
        }
      }
    },
    required: ["slotId", "renames"],
    additionalProperties: false
  };
}

export function getLadderSchema() {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      steps: {
        type: "array",
        minItems: 2,
        maxItems: 7,
        items: {
          type: "object",
          properties: {
            title: { type: "string" }
          },
          required: ["title"],
          additionalProperties: false
        }
      }
    },
    required: ["title", "steps"],
    additionalProperties: false
  };
}

export function getStructureSchema() {
  return {
    type: "object",
    properties: {
      course: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          modules: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                lessons: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      sourceGuide: { type: "string" },
                      sourceGuideStructured: {
                        type: "object",
                        properties: getSourceGuideSchemaPropertiesForModel(SOURCE_GUIDE_LEVELS.LESSON),
                        required: getSourceGuideSchemaRequired(SOURCE_GUIDE_LEVELS.LESSON),
                        additionalProperties: false
                      },
                      ...getLessonGuidanceSchemaProperties()
                    },
                    required: ["title", "description", "sourceGuide", "sourceGuideStructured", ...getLessonGuidanceSchemaRequired()],
                    additionalProperties: false
                  }
                }
              },
              required: ["title", "description", "lessons"],
              additionalProperties: false
            }
          }
        },
        required: ["title", "description", "modules"],
        additionalProperties: false
      }
    },
    required: ["course"],
    additionalProperties: false
  };
}
