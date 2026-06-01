const MICROSEQUENCE_ROLES = ["explain", "practice", "review", "support"];

export const plannedCourseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["course"],
  properties: {
    course: {
      type: "object",
      additionalProperties: false,
      required: ["title", "modules"],
      properties: {
        title: { type: "string" },
        goal: { type: "string" },
        modules: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "guide", "lessons"],
            properties: {
              title: { type: "string" },
              guide: {
                type: "object",
                additionalProperties: false,
                required: ["goal", "include", "exclude", "notation", "avoid"],
                properties: {
                  goal: { type: "string" },
                  include: { type: "array", items: { type: "string" } },
                  exclude: { type: "array", items: { type: "string" } },
                  notation: { type: "array", items: { type: "string" } },
                  avoid: { type: "array", items: { type: "string" } }
                }
              },
              lessons: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "guide", "microsequences"],
                  properties: {
                    title: { type: "string" },
                    guide: {
                      type: "object",
                      additionalProperties: false,
                      required: ["goal", "include", "exclude", "notation", "avoid"],
                      properties: {
                        goal: { type: "string" },
                        include: { type: "array", items: { type: "string" } },
                        exclude: { type: "array", items: { type: "string" } },
                        notation: { type: "array", items: { type: "string" } },
                        avoid: { type: "array", items: { type: "string" } }
                      }
                    },
                    microsequences: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["title", "goal", "role", "dependsOn", "covers", "checks"],
                        properties: {
                          title: { type: "string" },
                          goal: { type: "string" },
                          role: { type: "string", enum: MICROSEQUENCE_ROLES },
                          dependsOn: { type: "array", items: { type: "string" } },
                          covers: { type: "array", items: { type: "string" } },
                          checks: { type: "array", items: { type: "string" } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
