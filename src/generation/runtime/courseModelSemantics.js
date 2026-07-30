const LEARNING_TRAIL_OPTIONS = Object.freeze([
  { value: "procedure", label: "Procedimento" },
  { value: "technical_reading", label: "Leitura técnica" },
  { value: "formalization", label: "Formalização" },
  { value: "problem_solving", label: "Resolução de problema" },
  { value: "complex_project", label: "Projeto/competência complexa" },
  { value: "language_communication", label: "Línguas/comunicação" },
  { value: "argumentation_classification", label: "Argumentação/classificação" }
]);

const MICROSEQUENCE_PROGRESSION_OPTIONS_BY_TRAIL = Object.freeze({
  procedure: Object.freeze([
    { value: "demo_guided_autonomy", label: "Demonstração -> guia -> autonomia" },
    { value: "worked_example_fading_execution", label: "Exemplo resolvido -> fading -> execução" },
    { value: "isolated_operation_sequence_workflow", label: "Operação isolada -> sequência -> workflow" }
  ]),
  technical_reading: Object.freeze([
    { value: "orientation_guided_reading_interpretation", label: "Orientação -> leitura guiada -> interpretação" },
    { value: "evidence_argument_conclusion", label: "Evidência -> argumento -> conclusão" },
    { value: "text_figure_comparison_synthesis", label: "Texto/figura -> comparação -> síntese" }
  ]),
  formalization: Object.freeze([
    { value: "concrete_visual_formal", label: "Concreto/visual -> representacional -> formal" },
    { value: "example_rule_generalization", label: "Exemplo -> regra -> generalização" },
    { value: "contrast_criterion_abstraction", label: "Casos contrastivos -> critério -> abstração" }
  ]),
  problem_solving: Object.freeze([
    { value: "worked_example_analogous_variation", label: "Exemplo resolvido -> problema análogo -> variação" },
    { value: "simple_case_heuristic_new_problem", label: "Caso simples -> heurística -> problema novo" },
    { value: "attempt_explication_transfer", label: "Tentativa inicial -> explicitação -> transferência" }
  ]),
  complex_project: Object.freeze([
    { value: "whole_task_simple_to_complex", label: "Tarefa inteira simples -> tarefa inteira mais complexa" },
    { value: "reference_case_adaptation_construction", label: "Caso de referência -> adaptação -> construção" },
    { value: "model_modification_project", label: "Modelo -> modificação -> projeto" }
  ]),
  language_communication: Object.freeze([
    { value: "reception_mediation_production", label: "Recepção -> mediação -> produção" },
    { value: "comprehension_guided_interaction_autonomous_production", label: "Compreensão -> interação guiada -> produção autônoma" },
    { value: "contextual_input_focus_reuse", label: "Input contextual -> foco na forma -> reuso comunicativo" }
  ]),
  argumentation_classification: Object.freeze([
    { value: "cases_contrast_criterion_classification", label: "Casos -> contraste -> critério -> classificação" },
    { value: "thesis_evidence_objection_position", label: "Tese -> evidência -> objeção -> posição" },
    { value: "example_distinction_taxonomy", label: "Exemplo -> distinção -> taxonomia" }
  ])
});

const TRAIL_DEFAULT_PROGRESSIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(MICROSEQUENCE_PROGRESSION_OPTIONS_BY_TRAIL).map(([trail, options]) => [trail, options[0]?.value || ""])
  )
);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEnum(value = "", options = [], fallback = "") {
  const normalized = text(value);
  return (options || []).some((entry) => entry.value === normalized) ? normalized : fallback;
}

function resolveAllowedProgressionsForTrail(trail = "") {
  const normalizedTrail = normalizeEnum(trail, LEARNING_TRAIL_OPTIONS, "");
  return MICROSEQUENCE_PROGRESSION_OPTIONS_BY_TRAIL[normalizedTrail] || [];
}

export function listCourseModelOptions(trail = "") {
  const normalizedTrail = normalizeEnum(trail, LEARNING_TRAIL_OPTIONS, "");
  return {
    learningTrail: [...LEARNING_TRAIL_OPTIONS],
    microsequenceProgression: [...(MICROSEQUENCE_PROGRESSION_OPTIONS_BY_TRAIL[normalizedTrail] || [])]
  };
}

export function createDefaultCourseModel(input = {}) {
  const description = text(input?.description);
  const learningTrail = normalizeEnum(
    input?.learningTrail || input?.trail || input?.materialNature,
    LEARNING_TRAIL_OPTIONS,
    ""
  );
  const allowedProgressions = resolveAllowedProgressionsForTrail(learningTrail);
  const microsequenceProgression = normalizeEnum(
    input?.microsequenceProgression || input?.progressionMode,
    allowedProgressions,
    TRAIL_DEFAULT_PROGRESSIONS[learningTrail] || ""
  );

  return {
    description,
    learningTrail,
    microsequenceProgression
  };
}

export function buildCourseSemanticsForPolicy(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  return {
    description: normalized.description,
    learningTrail: normalized.learningTrail,
    microsequenceProgression: normalized.microsequenceProgression
  };
}
