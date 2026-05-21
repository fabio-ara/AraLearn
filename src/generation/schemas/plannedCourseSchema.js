const DIDACTIC_KIND_ENUM = ["concept", "procedure", "discrimination", "formalization", "representation_reading", "cumulative_practice"];
const PRACTICE_MODE_ENUM = ["recognition", "guided_production", "execution", "classification", "calculation", "explanation", "construction", "correction", "variation"];
const REPRESENTATION_NEED_ENUM = ["none", "text", "table", "code", "visual_structure", "sequence", "formula"];
const DEPENDENCY_POLICY_ENUM = ["self_contained", "uses_previous", "cumulative"];
const COVERAGE_ROLE_ENUM = ["introduce", "explain", "practice", "review", "repair_gap", "extend_practice"];

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
                          scopeLabels: { type: "array", minItems: 1, items: { type: "string" } },
                          didacticKind: { type: "string", enum: DIDACTIC_KIND_ENUM },
                          practiceMode: { type: "string", enum: PRACTICE_MODE_ENUM },
                          representationNeed: { type: "string", enum: REPRESENTATION_NEED_ENUM },
                          dependencyPolicy: { type: "string", enum: DEPENDENCY_POLICY_ENUM },
                          coverageRole: { type: "string", enum: COVERAGE_ROLE_ENUM },
                          expectedEvidence: {
                            type: "array",
                            items: { type: "string", minLength: 1 }
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
  }
};
