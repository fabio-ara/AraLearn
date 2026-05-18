const MATERIAL_NATURE_OPTIONS = Object.freeze([
  { value: "procedure", label: "Procedimento" },
  { value: "technical_reading", label: "Leitura técnica" },
  { value: "problem_solving", label: "Resolução de problema" },
  { value: "formal_language", label: "Linguagem formal" },
  { value: "visual_interpretation", label: "Interpretação visual" },
  { value: "applied_tool", label: "Ferramenta aplicada" },
  { value: "conceptual_argument", label: "Argumentação conceitual" }
]);

const PROGRESSION_MODE_OPTIONS = Object.freeze([
  { value: "concrete_to_abstract", label: "Concreto -> abstrato" },
  { value: "visual_to_formal", label: "Visual -> formal" },
  { value: "example_to_rule", label: "Exemplo -> regra" },
  { value: "reading_to_application", label: "Leitura -> aplicação" },
  { value: "theory_to_exercise", label: "Teoria -> exercício" },
  { value: "structure_to_detail", label: "Estrutura -> detalhe" }
]);

const CENTRAL_REPRESENTATION_OPTIONS = Object.freeze([
  { value: "plain_text", label: "Texto" },
  { value: "formula", label: "Fórmula" },
  { value: "table", label: "Tabela" },
  { value: "matrix", label: "Matriz" },
  { value: "diagram", label: "Diagrama" },
  { value: "flowchart", label: "Fluxograma" },
  { value: "pseudocode", label: "Pseudocódigo" },
  { value: "code", label: "Código" },
  { value: "tree", label: "Árvore" },
  { value: "graph", label: "Gráfico" },
  { value: "spreadsheet", label: "Planilha" },
  { value: "scientific_article", label: "Artigo" }
]);

const COGNITIVE_OPERATION_OPTIONS = Object.freeze([
  { value: "recognize", label: "Reconhecer" },
  { value: "define", label: "Definir" },
  { value: "compare", label: "Comparar" },
  { value: "classify", label: "Classificar" },
  { value: "translate", label: "Traduzir" },
  { value: "decompose", label: "Decompor" },
  { value: "trace", label: "Executar passo a passo" },
  { value: "diagnose", label: "Diagnosticar erro" },
  { value: "apply", label: "Aplicar" },
  { value: "interpret", label: "Interpretar evidência" },
  { value: "build", label: "Construir solução" }
]);

const EXPECTED_DIFFICULTY_OPTIONS = Object.freeze([
  { value: "vocabulary", label: "Vocabulário" },
  { value: "notation", label: "Notação" },
  { value: "syntax", label: "Sintaxe" },
  { value: "abstraction", label: "Abstração" },
  { value: "figure_reading", label: "Leitura de figura" },
  { value: "fine_comparison", label: "Comparação fina" },
  { value: "transfer", label: "Transferência" },
  { value: "many_steps", label: "Muitos passos" }
]);

const PRACTICE_MODE_OPTIONS = Object.freeze([
  { value: "guided_first", label: "Guiada antes" },
  { value: "short_frequent", label: "Curta e frequente" },
  { value: "comparison", label: "Comparação" },
  { value: "error_correction", label: "Correção de erro" },
  { value: "translation", label: "Tradução" },
  { value: "case_study", label: "Caso" },
  { value: "partial_reconstruction", label: "Reconstrução" },
  { value: "commented_reading", label: "Leitura comentada" }
]);

const RESOURCE_HINTS_BY_REPRESENTATION = Object.freeze({
  matrix: ["matrix"],
  table: ["table"],
  flowchart: ["flowchart"],
  pseudocode: ["code_editor"],
  code: ["code_editor"],
  tree: ["tree"],
  graph: ["plane"],
  formula: ["matrix", "plane"],
  spreadsheet: ["table"],
  diagram: ["flowchart", "tree"],
  scientific_article: ["table"],
  plain_text: ["paragraph"]
});

const RESOURCE_HINTS_BY_OPERATION = Object.freeze({
  compare: ["table"],
  classify: ["tree", "table"],
  translate: ["code_editor", "flowchart"],
  trace: ["flowchart", "code_editor", "matrix"],
  diagnose: ["multiple_choice", "code_editor"],
  interpret: ["table", "plane"],
  build: ["code_editor", "flowchart"],
  decompose: ["tree", "table"]
});

const RESOURCE_HINTS_BY_PRACTICE = Object.freeze({
  guided_first: ["paragraph"],
  short_frequent: ["block_gap_fill", "multiple_choice"],
  comparison: ["table"],
  error_correction: ["code_editor", "multiple_choice"],
  translation: ["code_editor", "flowchart"],
  case_study: ["paragraph", "table"],
  partial_reconstruction: ["block_gap_fill"],
  commented_reading: ["paragraph", "table"]
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

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeDistinctPrimarySecondary(primary, secondary, options = []) {
  const normalizedPrimary = normalizeEnum(primary, options, "");
  const normalizedSecondary = normalizeEnum(secondary, options, "");
  return {
    primary: normalizedPrimary,
    secondary: normalizedSecondary && normalizedSecondary !== normalizedPrimary ? normalizedSecondary : ""
  };
}

function inferKeywordList(description = "", table = {}) {
  const normalized = text(description)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return Object.entries(table)
    .filter(([, matchers]) => (matchers || []).some((matcher) => normalized.includes(matcher)))
    .map(([value]) => value);
}

function twoDistinct(items = []) {
  const uniqueItems = unique(items.map((item) => text(item)));
  return {
    primary: uniqueItems[0] || "",
    secondary: uniqueItems[1] || ""
  };
}

function flattenPreferencePair(primary = "", secondary = "") {
  return unique([text(primary), text(secondary)]);
}

export function listCourseModelOptions() {
  return {
    materialNature: [...MATERIAL_NATURE_OPTIONS],
    progressionMode: [...PROGRESSION_MODE_OPTIONS],
    representations: [...CENTRAL_REPRESENTATION_OPTIONS],
    operations: [...COGNITIVE_OPERATION_OPTIONS],
    difficulties: [...EXPECTED_DIFFICULTY_OPTIONS],
    practiceModes: [...PRACTICE_MODE_OPTIONS]
  };
}

export function createDefaultCourseModel(input = {}) {
  const formPreference = normalizeDistinctPrimarySecondary(
    input?.primaryRepresentation || input?.formPrimary,
    input?.secondaryRepresentation || input?.formSecondary,
    CENTRAL_REPRESENTATION_OPTIONS
  );
  const difficultyPreference = normalizeDistinctPrimarySecondary(
    input?.primaryDifficulty || input?.difficultyPrimary,
    input?.secondaryDifficulty || input?.difficultySecondary,
    EXPECTED_DIFFICULTY_OPTIONS
  );

  return {
    description: text(input?.description),
    materialNature: normalizeEnum(text(input?.materialNature), MATERIAL_NATURE_OPTIONS, ""),
    progressionMode: normalizeEnum(text(input?.progressionMode), PROGRESSION_MODE_OPTIONS, ""),
    primaryRepresentation: formPreference.primary,
    secondaryRepresentation: formPreference.secondary,
    primaryOperation: normalizeEnum(text(input?.primaryOperation), COGNITIVE_OPERATION_OPTIONS, ""),
    primaryDifficulty: difficultyPreference.primary,
    secondaryDifficulty: difficultyPreference.secondary,
    preferredPracticeMode: normalizeEnum(text(input?.preferredPracticeMode), PRACTICE_MODE_OPTIONS, "")
  };
}

export function inferCourseModelFromDescription(description = "", baseModel = {}) {
  const current = createDefaultCourseModel(baseModel);
  const materialNatureCandidates = inferKeywordList(description, {
    procedure: ["passo a passo", "algoritmo", "procedimento", "workflow", "comando"],
    technical_reading: ["artigo", "paper", "texto tecnico", "leitura tecnica", "leitura academica"],
    problem_solving: ["exercicio", "problema", "resolver", "calculo"],
    formal_language: ["notacao", "linguagem formal", "sintaxe", "gramatica", "formula"],
    visual_interpretation: ["figura", "diagrama", "grafico", "fluxograma", "arvore"],
    applied_tool: ["excel", "shell", "terminal", "ferramenta", "software", "planilha"],
    conceptual_argument: ["hipotese", "argumento", "teoria", "comparar hipoteses", "conceitual"]
  });
  const representationCandidates = inferKeywordList(description, {
    plain_text: ["texto", "texto corrido"],
    formula: ["formula", "equacao", "notacao"],
    table: ["tabela", "quadro comparativo"],
    matrix: ["matriz", "matrizes", "determinante", "vetor"],
    diagram: ["diagrama"],
    flowchart: ["fluxograma"],
    pseudocode: ["pseudocodigo", "portugol", "pseudo codigo"],
    code: ["codigo", "linguagem c", "python", "java", "javascript"],
    tree: ["arvore", "taxonomia", "filogen", "diretorio"],
    graph: ["grafico", "plano cartesiano"],
    spreadsheet: ["excel", "planilha"],
    scientific_article: ["artigo", "paper", "metodo", "hipotese"]
  });
  const operationCandidates = inferKeywordList(description, {
    recognize: ["reconhecer", "identificar"],
    define: ["definir", "conceito", "explicar o que e"],
    compare: ["comparar", "distinguir", "diferenca"],
    classify: ["classificar", "categorizar", "taxonomia"],
    translate: ["traduzir", "traducao", "converter", "passar de"],
    decompose: ["decompor", "quebrar", "separar em partes"],
    trace: ["rastrear", "passo a passo", "executar", "simular"],
    diagnose: ["erro", "depurar", "corrigir"],
    apply: ["aplicar", "usar em caso", "resolver"],
    interpret: ["interpretar", "ler evidencia", "analisar"],
    build: ["construir", "montar", "projetar", "escrever"]
  });
  const difficultyCandidates = inferKeywordList(description, {
    vocabulary: ["vocabulario", "termos tecnicos", "jargao"],
    notation: ["notacao", "simbolo", "formula"],
    syntax: ["sintaxe", "palavra-chave", "palavra chave"],
    abstraction: ["abstracao", "muito abstrato"],
    figure_reading: ["figura", "grafico", "diagrama", "arvore"],
    fine_comparison: ["comparar", "distinguir", "hipotese"],
    transfer: ["aplicar", "transferir", "usar em contexto"],
    many_steps: ["muitos passos", "procedimento longo", "sequencia longa"]
  });
  const practiceCandidates = inferKeywordList(description, {
    guided_first: ["guiada", "passo a passo", "antes de sozinho"],
    short_frequent: ["curta", "frequente", "muitas praticas"],
    comparison: ["comparacao", "comparar alternativas"],
    error_correction: ["corrigir erro", "diagnosticar erro", "depurar"],
    translation: ["traduzir", "traducao", "converter"],
    case_study: ["caso", "cenario"],
    partial_reconstruction: ["completar", "reconstruir", "preencher"],
    commented_reading: ["leitura comentada", "ler com comentario"]
  });
  const progressionCandidates = inferKeywordList(description, {
    concrete_to_abstract: ["concreto", "abstrato"],
    visual_to_formal: ["visual", "formal", "fluxograma", "diagrama"],
    example_to_rule: ["exemplo", "regra"],
    reading_to_application: ["leitura", "aplicacao"],
    theory_to_exercise: ["teoria", "exercicio"],
    structure_to_detail: ["estrutura", "detalhe"]
  });
  const representationPreference = twoDistinct([
    current.primaryRepresentation,
    current.secondaryRepresentation,
    ...representationCandidates
  ]);
  const difficultyPreference = twoDistinct([
    current.primaryDifficulty,
    current.secondaryDifficulty,
    ...difficultyCandidates
  ]);

  return createDefaultCourseModel({
    ...current,
    description: text(description) || current.description,
    materialNature: current.materialNature || materialNatureCandidates[0] || "",
    progressionMode: current.progressionMode || progressionCandidates[0] || "",
    primaryRepresentation: representationPreference.primary,
    secondaryRepresentation: representationPreference.secondary,
    primaryOperation: current.primaryOperation || operationCandidates[0] || "",
    primaryDifficulty: difficultyPreference.primary,
    secondaryDifficulty: difficultyPreference.secondary,
    preferredPracticeMode: current.preferredPracticeMode || practiceCandidates[0] || ""
  });
}

export function buildCourseModelPromptLines(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  const lines = [];
  if (normalized.description) {
    lines.push(`Pedido de modelagem do curso: ${normalized.description}.`);
  }
  if (normalized.materialNature) {
    lines.push(`Natureza dominante do curso: ${optionLabel(MATERIAL_NATURE_OPTIONS, normalized.materialNature)}.`);
  }
  if (normalized.progressionMode) {
    lines.push(`Progressão preferida: ${optionLabel(PROGRESSION_MODE_OPTIONS, normalized.progressionMode)}.`);
  }
  if (normalized.primaryRepresentation) {
    lines.push(`Forma principal do curso: ${optionLabel(CENTRAL_REPRESENTATION_OPTIONS, normalized.primaryRepresentation)}.`);
  }
  if (normalized.secondaryRepresentation) {
    lines.push(`Forma secundária de apoio: ${optionLabel(CENTRAL_REPRESENTATION_OPTIONS, normalized.secondaryRepresentation)}.`);
  }
  if (normalized.primaryOperation) {
    lines.push(`Operação principal do estudante: ${optionLabel(COGNITIVE_OPERATION_OPTIONS, normalized.primaryOperation)}.`);
  }
  if (normalized.primaryDifficulty) {
    lines.push(`Trava principal esperada: ${optionLabel(EXPECTED_DIFFICULTY_OPTIONS, normalized.primaryDifficulty)}.`);
  }
  if (normalized.secondaryDifficulty) {
    lines.push(`Trava secundária esperada: ${optionLabel(EXPECTED_DIFFICULTY_OPTIONS, normalized.secondaryDifficulty)}.`);
  }
  if (normalized.preferredPracticeMode) {
    lines.push(`Prática preferida: ${optionLabel(PRACTICE_MODE_OPTIONS, normalized.preferredPracticeMode)}.`);
  }
  return lines;
}

export function buildCourseSemanticsForPolicy(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  return {
    description: normalized.description,
    materialNature: normalized.materialNature,
    progressionMode: normalized.progressionMode,
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
  const preferred = [];
  flattenPreferencePair(normalized.primaryRepresentation, normalized.secondaryRepresentation).forEach((value) => {
    preferred.push(...(RESOURCE_HINTS_BY_REPRESENTATION[value] || []));
  });
  if (normalized.primaryOperation) {
    preferred.push(...(RESOURCE_HINTS_BY_OPERATION[normalized.primaryOperation] || []));
  }
  if (normalized.preferredPracticeMode) {
    preferred.push(...(RESOURCE_HINTS_BY_PRACTICE[normalized.preferredPracticeMode] || []));
  }

  const preferredResourceTypes = unique(preferred);
  const discouragedResourceTypes = [];

  if (normalized.primaryRepresentation === "matrix") {
    discouragedResourceTypes.push("table");
  }
  if (normalized.primaryRepresentation === "flowchart") {
    discouragedResourceTypes.push("tree");
  }

  return {
    preferredResourceTypes,
    discouragedResourceTypes: unique(discouragedResourceTypes)
  };
}

export function listCourseSemanticsRepresentations(courseSemantics = {}) {
  return flattenPreferencePair(courseSemantics?.primaryRepresentation, courseSemantics?.secondaryRepresentation);
}
