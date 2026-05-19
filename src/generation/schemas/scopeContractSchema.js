export const scopeContractSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "course", "modules"],
  properties: {
    schemaVersion: { type: "string", const: "aralearn.scope.v1" },
    course: {
      type: "object",
      additionalProperties: false,
      required: ["title", "evidencePriority"],
      properties: {
        title: { type: "string", minLength: 1 },
        goal: { type: "string" },
        evidencePriority: {
          type: "array",
          items: {
            type: "string",
            enum: ["notebook", "exercise_list", "exam", "syllabus", "booklet", "documentation", "article", "manual", "mixed", "none"]
          }
        }
      }
    },
    modules: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "include", "exclude", "assessmentStyle"],
        properties: {
          title: { type: "string", minLength: 1 },
          include: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          exclude: { type: "array", items: { type: "string", minLength: 1 } },
          notes: { type: "string" },
          assessmentStyle: {
            type: "string",
            enum: ["theoretical", "practical", "mixed"]
          }
        }
      }
    }
  }
};

