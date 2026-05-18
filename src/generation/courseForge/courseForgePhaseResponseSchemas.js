function objectSchema(properties = {}, required = []) {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {})
  };
}

function arrayOf(itemSchema = { type: "object" }) {
  return {
    type: "array",
    items: itemSchema
  };
}

const GENERIC_OBJECT = Object.freeze({ type: "object" });
const GENERIC_AUDIT_ITEM = Object.freeze({
  type: "object",
  properties: {
    target: { type: "string" },
    type: { type: "string" },
    severity: { type: "string" },
    evidence: { type: "string" },
    message: { type: "string" },
    requestedChangeId: { type: "string" },
    didacticInterventionType: { type: "string" },
    lessonKey: { type: "string" },
    microsequenceKey: { type: "string" },
    domainRef: { type: "string" },
    bridgeTargetRef: { type: "string" },
    relatedConceptRefs: { type: "array", items: { type: "string" } },
    prerequisiteRefs: { type: "array", items: { type: "string" } }
  }
});

const PHASE_RESPONSE_SCHEMAS = Object.freeze({
  answer_locally: objectSchema(
    {
      responseText: { type: "string" },
      studyTrackConnection: { type: "string" },
      recommendedAction: { type: "string" },
      rationale: { type: "string" }
    },
    ["responseText"]
  ),
  plan_architecture: objectSchema({
    architectureDraft: GENERIC_OBJECT,
    patch: GENERIC_OBJECT
  }),
  audit_architecture: objectSchema({
    approved: { type: "boolean" },
    blockingIssues: arrayOf(GENERIC_AUDIT_ITEM),
    warnings: arrayOf(GENERIC_AUDIT_ITEM)
  }),
  repair_architecture: objectSchema({
    architectureFinal: GENERIC_OBJECT
  }),
  plan_lessons: objectSchema({
    lessonPlans: arrayOf(GENERIC_OBJECT)
  }),
  audit_course_graph: objectSchema({
    approved: { type: "boolean" },
    blockingIssues: arrayOf(GENERIC_AUDIT_ITEM),
    warnings: arrayOf(GENERIC_AUDIT_ITEM)
  }),
  repair_course_graph: objectSchema({
    courseGraph: GENERIC_OBJECT
  }),
  plan_microsequences: objectSchema({
    microsequencePlans: arrayOf(GENERIC_OBJECT)
  }),
  audit_microsequences: objectSchema({
    approved: { type: "boolean" },
    issues: arrayOf(GENERIC_AUDIT_ITEM),
    warnings: arrayOf(GENERIC_AUDIT_ITEM)
  }),
  repair_microsequences: objectSchema({
    microsequencePlans: arrayOf(GENERIC_OBJECT)
  }),
  build_cards: objectSchema({
    cards: arrayOf(GENERIC_OBJECT)
  }),
  repair_cards: objectSchema({
    cards: arrayOf(GENERIC_OBJECT)
  }),
  repair_card_adherence: objectSchema({
    cards: arrayOf(GENERIC_OBJECT)
  })
});

export function getCourseForgePhaseResponseSchema(phaseId = "") {
  const normalizedPhaseId = typeof phaseId === "string" ? phaseId.trim() : "";
  return PHASE_RESPONSE_SCHEMAS[normalizedPhaseId] || null;
}
