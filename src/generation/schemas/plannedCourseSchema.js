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
        title: { type: "string", minLength: 1 },
        goal: { type: "string" },
        modules: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "lessons"],
            properties: {
              title: { type: "string", minLength: 1 },
              lessons: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "goal", "microsequences"],
                  properties: {
                    title: { type: "string", minLength: 1 },
                    goal: { type: "string", minLength: 1 },
                    sourceGuideStructured: {
                      type: "object",
                      additionalProperties: false,
                      required: ["lessonGoal", "notationRules", "commonErrors"],
                      properties: {
                        lessonGoal: { type: "string", minLength: 1 },
                        notationRules: { type: "string", minLength: 1 },
                        commonErrors: { type: "string", minLength: 1 }
                      }
                    },
                    microsequences: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["title", "goal", "dependsOnTitles", "scopeLabels"],
                        properties: {
                          title: { type: "string", minLength: 1 },
                          goal: { type: "string", minLength: 1 },
                          dependsOnTitles: { type: "array", items: { type: "string" } },
                          scopeLabels: { type: "array", minItems: 1, items: { type: "string" } }
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
