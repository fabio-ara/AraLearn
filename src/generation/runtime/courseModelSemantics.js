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

const LIST_FIELD_OPTIONS = Object.freeze({
  centralRepresentations: CENTRAL_REPRESENTATION_OPTIONS,
  cognitiveOperations: COGNITIVE_OPERATION_OPTIONS,
  expectedDifficulties: EXPECTED_DIFFICULTY_OPTIONS,
  practiceModes: PRACTICE_MODE_OPTIONS
});

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

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeList(values = [], options = []) {
  const allowed = new Set((options || []).map((entry) => entry.value));
  return unique(Array.isArray(values) ? values.map((item) => text(item)) : []).filter((item) => allowed.has(item));
}

function normalizeEnum(value = "", options = [], fallback = "") {
  const normalized = text(value);
  return (options || []).some((entry) => entry.value === normalized) ? normalized : fallback;
}

function optionLabel(options = [], value = "") {
  return (options || []).find((entry) => entry.value === value)?.label || "";
}

export function listCourseModelOptions() {
  return {
    materialNature: [...MATERIAL_NATURE_OPTIONS],
    progressionMode: [...PROGRESSION_MODE_OPTIONS],
    centralRepresentations: [...CENTRAL_REPRESENTATION_OPTIONS],
    cognitiveOperations: [...COGNITIVE_OPERATION_OPTIONS],
    expectedDifficulties: [...EXPECTED_DIFFICULTY_OPTIONS],
    practiceModes: [...PRACTICE_MODE_OPTIONS]
  };
}

export function createDefaultCourseModel(input = {}) {
  return {
    description: text(input?.description),
    materialNature: normalizeEnum(text(input?.materialNature), MATERIAL_NATURE_OPTIONS, ""),
    progressionMode: normalizeEnum(text(input?.progressionMode), PROGRESSION_MODE_OPTIONS, ""),
    centralRepresentations: normalizeList(input?.centralRepresentations, CENTRAL_REPRESENTATION_OPTIONS),
    cognitiveOperations: normalizeList(input?.cognitiveOperations, COGNITIVE_OPERATION_OPTIONS),
    expectedDifficulties: normalizeList(input?.expectedDifficulties, EXPECTED_DIFFICULTY_OPTIONS),
    practiceModes: normalizeList(input?.practiceModes, PRACTICE_MODE_OPTIONS)
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

  return createDefaultCourseModel({
    ...current,
    description: text(description) || current.description,
    materialNature: current.materialNature || materialNatureCandidates[0] || "",
    progressionMode: current.progressionMode || progressionCandidates[0] || "",
    centralRepresentations: [...current.centralRepresentations, ...representationCandidates],
    cognitiveOperations: [...current.cognitiveOperations, ...operationCandidates],
    expectedDifficulties: [...current.expectedDifficulties, ...difficultyCandidates],
    practiceModes: [...current.practiceModes, ...practiceCandidates]
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
  if (normalized.centralRepresentations.length) {
    lines.push(
      `Representações centrais do curso: ${normalized.centralRepresentations
        .map((value) => optionLabel(CENTRAL_REPRESENTATION_OPTIONS, value))
        .filter(Boolean)
        .join(", ")}.`
    );
  }
  if (normalized.cognitiveOperations.length) {
    lines.push(
      `Operações cognitivas prioritárias: ${normalized.cognitiveOperations
        .map((value) => optionLabel(COGNITIVE_OPERATION_OPTIONS, value))
        .filter(Boolean)
        .join(", ")}.`
    );
  }
  if (normalized.practiceModes.length) {
    lines.push(
      `Forma de prática preferida: ${normalized.practiceModes
        .map((value) => optionLabel(PRACTICE_MODE_OPTIONS, value))
        .filter(Boolean)
        .join(", ")}.`
    );
  }
  if (normalized.expectedDifficulties.length) {
    lines.push(
      `Dificuldades esperadas do estudante: ${normalized.expectedDifficulties
        .map((value) => optionLabel(EXPECTED_DIFFICULTY_OPTIONS, value))
        .filter(Boolean)
        .join(", ")}.`
    );
  }
  return lines;
}

export function buildCourseSemanticsForPolicy(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  return {
    description: normalized.description,
    materialNature: normalized.materialNature,
    progressionMode: normalized.progressionMode,
    centralRepresentations: [...normalized.centralRepresentations],
    cognitiveOperations: [...normalized.cognitiveOperations],
    expectedDifficulties: [...normalized.expectedDifficulties],
    practiceModes: [...normalized.practiceModes]
  };
}

export function buildResourcePreferencesFromCourseModel(courseModel = {}) {
  const normalized = createDefaultCourseModel(courseModel);
  const preferred = [];

  normalized.centralRepresentations.forEach((value) => preferred.push(...(RESOURCE_HINTS_BY_REPRESENTATION[value] || [])));
  normalized.cognitiveOperations.forEach((value) => preferred.push(...(RESOURCE_HINTS_BY_OPERATION[value] || [])));
  normalized.practiceModes.forEach((value) => preferred.push(...(RESOURCE_HINTS_BY_PRACTICE[value] || [])));

  const preferredResourceTypes = unique(preferred);
  const discouragedResourceTypes = [];

  if (normalized.centralRepresentations.includes("matrix")) {
    discouragedResourceTypes.push("table");
  }
  if (normalized.centralRepresentations.includes("flowchart")) {
    discouragedResourceTypes.push("tree");
  }

  return {
    preferredResourceTypes,
    discouragedResourceTypes: unique(discouragedResourceTypes)
  };
}
