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

const TRAIL_DERIVED_SEMANTICS = Object.freeze({
  procedure: Object.freeze({
    primaryRepresentation: "flowchart",
    secondaryRepresentation: "code",
    primaryOperation: "apply",
    primaryDifficulty: "syntax",
    secondaryDifficulty: "many_steps",
    preferredPracticeMode: "guided_first",
    preferredResourceTypes: ["flowchart", "code_editor"],
    discouragedResourceTypes: ["tree"]
  }),
  technical_reading: Object.freeze({
    primaryRepresentation: "scientific_article",
    secondaryRepresentation: "table",
    primaryOperation: "interpret",
    primaryDifficulty: "vocabulary",
    secondaryDifficulty: "figure_reading",
    preferredPracticeMode: "commented_reading",
    preferredResourceTypes: ["paragraph", "table"],
    discouragedResourceTypes: []
  }),
  formalization: Object.freeze({
    primaryRepresentation: "formula",
    secondaryRepresentation: "matrix",
    primaryOperation: "compare",
    primaryDifficulty: "notation",
    secondaryDifficulty: "abstraction",
    preferredPracticeMode: "comparison",
    preferredResourceTypes: ["graph", "matrix", "plane", "table"],
    discouragedResourceTypes: []
  }),
  problem_solving: Object.freeze({
    primaryRepresentation: "diagram",
    secondaryRepresentation: "table",
    primaryOperation: "apply",
    primaryDifficulty: "abstraction",
    secondaryDifficulty: "transfer",
    preferredPracticeMode: "guided_first",
    preferredResourceTypes: ["table", "paragraph"],
    discouragedResourceTypes: []
  }),
  complex_project: Object.freeze({
    primaryRepresentation: "code",
    secondaryRepresentation: "diagram",
    primaryOperation: "build",
    primaryDifficulty: "transfer",
    secondaryDifficulty: "many_steps",
    preferredPracticeMode: "case_study",
    preferredResourceTypes: ["code_editor", "flowchart", "tree"],
    discouragedResourceTypes: []
  }),
  language_communication: Object.freeze({
    primaryRepresentation: "plain_text",
    secondaryRepresentation: "",
    primaryOperation: "build",
    primaryDifficulty: "vocabulary",
    secondaryDifficulty: "syntax",
    preferredPracticeMode: "guided_first",
    preferredResourceTypes: ["paragraph", "table"],
    discouragedResourceTypes: []
  }),
  argumentation_classification: Object.freeze({
    primaryRepresentation: "table",
    secondaryRepresentation: "tree",
    primaryOperation: "compare",
    primaryDifficulty: "fine_comparison",
    secondaryDifficulty: "abstraction",
    preferredPracticeMode: "comparison",
    preferredResourceTypes: ["table", "tree"],
    discouragedResourceTypes: []
  })
});

const TRAIL_KEYWORDS = Object.freeze({
  procedure: ["procedimento", "workflow", "algoritmo", "passo a passo", "comando", "operacional", "fluxograma", "pseudocodigo", "pseudocódigo", "portugol", "codigo", "código"],
  technical_reading: ["artigo", "paper", "leitura", "evidencia", "evidência", "figura", "metodo", "método", "hipotese", "hipótese"],
  formalization: ["notacao", "notação", "formula", "fórmula", "formal", "teorema", "matriz", "equacao", "equação", "grafo", "grafos", "vertice", "vértice", "aresta", "dijkstra"],
  problem_solving: ["problema", "exercicio", "exercício", "resolver", "heuristica", "heurística", "caso"],
  complex_project: ["projeto", "arquitetura", "produto", "sistema", "entrega", "implementacao", "implementação"],
  language_communication: ["idioma", "língua", "gramatica", "gramática", "vocabul", "comunica", "texto em"],
  argumentation_classification: ["argumento", "tese", "obje", "classifica", "taxonomia", "hipotese", "hipótese"]
});

const PROGRESSION_KEYWORDS = Object.freeze({
  demo_guided_autonomy: ["demonstracao", "demonstração", "guia", "autonomia"],
  worked_example_fading_execution: ["exemplo resolvido", "fading", "execucao", "execução"],
  isolated_operation_sequence_workflow: ["operacao isolada", "operação isolada", "workflow", "sequencia", "sequência"],
  orientation_guided_reading_interpretation: ["orientacao", "orientação", "leitura guiada", "interpretacao", "interpretação"],
  evidence_argument_conclusion: ["evidencia", "evidência", "argumento", "conclusao", "conclusão"],
  text_figure_comparison_synthesis: ["texto", "figura", "comparacao", "comparação", "sintese", "síntese"],
  concrete_visual_formal: ["concreto", "visual", "formal"],
  example_rule_generalization: ["exemplo", "regra", "generalizacao", "generalização"],
  contrast_criterion_abstraction: ["contraste", "criterio", "critério", "abstracao", "abstração"],
  worked_example_analogous_variation: ["análogo", "analogo", "variação", "variacao", "exemplo resolvido"],
  simple_case_heuristic_new_problem: ["caso simples", "heuristica", "heurística", "problema novo"],
  attempt_explication_transfer: ["tentativa", "explicitação", "explicitação", "transferencia", "transferência"],
  whole_task_simple_to_complex: ["tarefa inteira", "simples", "complexa", "complexo"],
  reference_case_adaptation_construction: ["referencia", "referência", "adaptacao", "adaptação", "construcao", "construção"],
  model_modification_project: ["modelo", "modificacao", "modificação", "projeto"],
  reception_mediation_production: ["recepcao", "recepção", "mediacao", "mediação", "producao", "produção"],
  comprehension_guided_interaction_autonomous_production: ["compreensao", "compreensão", "interacao", "interação", "autonoma", "autônoma"],
  contextual_input_focus_reuse: ["input contextual", "foco na forma", "reuso", "reuse"],
  cases_contrast_criterion_classification: ["casos", "contraste", "criterio", "critério", "classificacao", "classificação"],
  thesis_evidence_objection_position: ["tese", "evidencia", "evidência", "objecao", "objeção", "posição", "posicao"],
  example_distinction_taxonomy: ["exemplo", "distincao", "distinção", "taxonomia"]
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEnum(value = "", options = [], fallback = "") {
  const normalized = text(value);
  return (options || []).some((entry) => entry.value === normalized) ? normalized : fallback;
}

function optionLabel(options = [], value = "") {
  return (options || []).find((entry) => entry.value === value)?.label || "";
}

function normalizeDescription(value = "") {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferEnumFromKeywords(description = "", keywordMap = {}, allowedValues = []) {
  const normalized = normalizeDescription(description);
  return (allowedValues || []).find((value) =>
    (keywordMap?.[value] || []).some((keyword) => normalized.includes(keyword))
  ) || "";
}

export function listCourseModelOptions(trail = "") {
  const normalizedTrail = normalizeEnum(trail, LEARNING_TRAIL_OPTIONS, "");
  return {
    learningTrail: [...LEARNING_TRAIL_OPTIONS],
    microsequenceProgression: [...(MICROSEQUENCE_PROGRESSION_OPTIONS_BY_TRAIL[normalizedTrail] || [])]
  };
}

function resolveAllowedProgressionsForTrail(trail = "") {
  const normalizedTrail = normalizeEnum(trail, LEARNING_TRAIL_OPTIONS, "");
  return MICROSEQUENCE_PROGRESSION_OPTIONS_BY_TRAIL[normalizedTrail] || [];
}

function deriveSemanticsFromTrail(trail = "") {
  const normalizedTrail = normalizeEnum(trail, LEARNING_TRAIL_OPTIONS, "");
  return TRAIL_DERIVED_SEMANTICS[normalizedTrail] || {};
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
    ""
  );
  const derived = deriveSemanticsFromTrail(learningTrail);

  return {
    description,
    learningTrail,
    microsequenceProgression,
    primaryRepresentation: derived.primaryRepresentation || "",
    secondaryRepresentation: derived.secondaryRepresentation || "",
    primaryOperation: derived.primaryOperation || "",
    primaryDifficulty: derived.primaryDifficulty || "",
    secondaryDifficulty: derived.secondaryDifficulty || "",
    preferredPracticeMode: derived.preferredPracticeMode || ""
  };
}

export function inferCourseModelFromDescription(description = "", baseModel = {}) {
  const current = createDefaultCourseModel(baseModel);
  const nextDescription = text(description) || current.description;
  const learningTrail =
    current.learningTrail ||
    inferEnumFromKeywords(
      nextDescription,
      TRAIL_KEYWORDS,
      LEARNING_TRAIL_OPTIONS.map((entry) => entry.value)
    );
  const allowedProgressions = resolveAllowedProgressionsForTrail(learningTrail);
  const microsequenceProgression =
    normalizeEnum(current.microsequenceProgression, allowedProgressions, "") ||
    inferEnumFromKeywords(
      nextDescription,
      PROGRESSION_KEYWORDS,
      allowedProgressions.map((entry) => entry.value)
    ) ||
    TRAIL_DEFAULT_PROGRESSIONS[learningTrail] ||
    "";

  return createDefaultCourseModel({
    description: nextDescription,
    learningTrail,
    microsequenceProgression
  });
}

export function buildCourseModelPromptLines(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  const lines = [];
  if (normalized.description) {
    lines.push(`Pedido de modelagem do curso: ${normalized.description}.`);
  }
  if (normalized.learningTrail) {
    lines.push(`Trilha dominante do curso: ${optionLabel(LEARNING_TRAIL_OPTIONS, normalized.learningTrail)}.`);
  }
  if (normalized.microsequenceProgression) {
    lines.push(
      `Progressão de microssequências: ${optionLabel(
        resolveAllowedProgressionsForTrail(normalized.learningTrail),
        normalized.microsequenceProgression
      )}.`
    );
  }
  return lines;
}

export function buildCourseSemanticsForPolicy(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  return {
    description: normalized.description,
    learningTrail: normalized.learningTrail,
    microsequenceProgression: normalized.microsequenceProgression,
    primaryRepresentation: normalized.primaryRepresentation,
    secondaryRepresentation: normalized.secondaryRepresentation,
    primaryOperation: normalized.primaryOperation,
    primaryDifficulty: normalized.primaryDifficulty,
    secondaryDifficulty: normalized.secondaryDifficulty,
    preferredPracticeMode: normalized.preferredPracticeMode
  };
}

export function buildResourcePreferencesFromCourseModel(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  const derived = deriveSemanticsFromTrail(normalized.learningTrail);
  return {
    preferredResourceTypes: [...(derived.preferredResourceTypes || [])],
    discouragedResourceTypes: [...(derived.discouragedResourceTypes || [])]
  };
}

export function listCourseSemanticsRepresentations(courseSemantics = {}) {
  const normalized = createDefaultCourseModel(courseSemantics);
  return [normalized.primaryRepresentation, normalized.secondaryRepresentation].filter(Boolean);
}
