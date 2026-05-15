const DIDACTIC_ISSUE_META = Object.freeze({
  practice_without_local_context: {
    basis: "structural",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  practice_without_feedback: {
    basis: "structural",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  answer_revealed_before_practice: {
    basis: "structural",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  unstable_or_backstage_reference: {
    basis: "pattern_policy",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  practice_before_explanation: {
    basis: "structural",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  local_doubt_unanswered: {
    basis: "study_track_policy",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  cognitive_drift_from_track: {
    basis: "study_track_policy",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  missing_return_to_track: {
    basis: "study_track_policy",
    severity: "heuristic_signal",
    blocksValidation: false,
    allowsAutoIteration: false
  },
  duplicate_microsequence_without_new_function: {
    basis: "declarative",
    severity: "hard_error",
    blocksValidation: true,
    allowsAutoIteration: false
  },
  conceptual_sequence_without_practice: {
    basis: "declarative",
    severity: "declarative_gap",
    blocksValidation: true,
    allowsAutoIteration: true
  },
  domain_items_without_practice: {
    basis: "declarative",
    severity: "declarative_gap",
    blocksValidation: false,
    allowsAutoIteration: false
  },
  practice_without_variation: {
    basis: "declarative",
    severity: "declarative_gap",
    blocksValidation: false,
    allowsAutoIteration: false
  },
  definition_without_example: {
    basis: "heuristic_text",
    severity: "heuristic_signal",
    blocksValidation: false,
    allowsAutoIteration: false
  },
  notation_without_preparation: {
    basis: "heuristic_text",
    severity: "heuristic_signal",
    blocksValidation: false,
    allowsAutoIteration: false
  },
  generic_content: {
    basis: "heuristic_text",
    severity: "heuristic_signal",
    blocksValidation: false,
    allowsAutoIteration: false
  },
  theory_to_exercise_without_example: {
    basis: "heuristic_text",
    severity: "heuristic_signal",
    blocksValidation: false,
    allowsAutoIteration: false
  }
});

export function getDidacticIssueMeta(type) {
  return (
    DIDACTIC_ISSUE_META[String(type || "").trim()] || {
      basis: "heuristic_text",
      severity: "heuristic_signal",
      blocksValidation: false,
      allowsAutoIteration: false
    }
  );
}

export function annotateDidacticIssue(issue = {}) {
  return {
    ...issue,
    ...getDidacticIssueMeta(issue?.type)
  };
}

