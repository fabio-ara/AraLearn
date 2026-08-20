const FAMILY_RECORDS = [
  {
    id: "family.text_language",
    label: "Texto, código e linguagem",
    description: "Representações lineares, anotadas, linguísticas e de código.",
    order: 10
  },
  {
    id: "family.quantitative_symbolic",
    label: "Dados, grandezas e notação",
    description: "Tabelas, expressões, grandezas, coordenadas e séries quantitativas.",
    order: 20
  },
  {
    id: "family.relational",
    label: "Relações, conjuntos e hierarquias",
    description: "Estruturas cujo sentido depende de vínculos, pertencimento ou descendência.",
    order: 30
  },
  {
    id: "family.process_state",
    label: "Processos, execução e estados",
    description: "Sequências, decisões, transições e mudanças observáveis durante a execução.",
    order: 40
  },
  {
    id: "family.software_data",
    label: "Dados e sistemas de software",
    description: "Modelos de dados, componentes, contêineres e contextos de software.",
    order: 50
  },
  {
    id: "family.infrastructure",
    label: "Infraestrutura, redes e layouts",
    description: "Topologias, memória, pacotes e organização física ou binária.",
    order: 60
  },
  {
    id: "family.response",
    label: "Respostas e operações de prática",
    description: "Interações avaliáveis coordenadas com as representações de conteúdo.",
    order: 70
  }
];

const DISCIPLINE_RECORDS = [
  { id: "discipline.transversal", label: "Transversal", aliases: ["geral", "interdisciplinar"] },
  { id: "discipline.language", label: "Linguagens e linguística", aliases: ["linguística", "morfologia", "sintaxe", "idiomas", "linguagens"] },
  { id: "discipline.mathematics", label: "Matemática e lógica", aliases: ["matemática", "álgebra", "geometria", "lógica", "teoria dos conjuntos", "teoria dos grafos", "probabilidade"] },
  { id: "discipline.statistics", label: "Estatística e métodos quantitativos", aliases: ["estatística", "ciência de dados", "métodos quantitativos"] },
  { id: "discipline.computing", label: "Computação", aliases: ["computação", "programação", "algoritmos", "compiladores", "sistemas operacionais", "bancos de dados"] },
  { id: "discipline.engineering", label: "Engenharias e sistemas", aliases: ["engenharia", "arquitetura", "infraestrutura", "redes", "sistemas embarcados", "protocolos"] },
  { id: "discipline.natural_sciences", label: "Ciências da natureza", aliases: ["física", "química", "biologia", "ecologia", "genética"] },
  { id: "discipline.business", label: "Negócios e processos", aliases: ["gestão", "administração", "análise de negócios", "processos"] },
  { id: "discipline.humanities", label: "Humanidades e direito", aliases: ["humanidades", "direito", "história", "geografia", "ciências sociais"] }
];

const STRUCTURE_RECORDS = [
  { id: "structure.prose", label: "Prosa explicativa", aliases: ["texto", "explicação", "narrativa"] },
  { id: "structure.code", label: "Código e notação literal", aliases: ["código", "programa", "consulta", "configuração"] },
  { id: "structure.annotation", label: "Anotação localizada", aliases: ["anotação", "trecho anotado", "evidência localizada"] },
  { id: "structure.interlinear", label: "Alinhamento interlinear", aliases: ["glosa", "morfema", "alinhamento interlinear"] },
  { id: "structure.table", label: "Grade tabular", aliases: ["tabela", "registros", "linhas e colunas"] },
  { id: "structure.symbolic", label: "Expressão simbólica", aliases: ["fórmula", "matriz", "equação", "reação", "proposição"] },
  { id: "structure.coordinate_space", label: "Espaço coordenado", aliases: ["plano", "coordenada", "vetor", "trajetória"] },
  { id: "structure.quantitative_series", label: "Série quantitativa", aliases: ["gráfico", "série", "tendência", "distribuição"] },
  { id: "structure.hierarchy", label: "Hierarquia enraizada", aliases: ["árvore", "raiz", "pai", "filho", "taxonomia"] },
  { id: "structure.graph", label: "Rede abstrata", aliases: ["grafo", "vértice", "aresta", "adjacência"] },
  { id: "structure.correspondence", label: "Correspondência", aliases: ["relação", "domínio de relação", "contradomínio", "pares ordenados"] },
  { id: "structure.set_regions", label: "Regiões de conjuntos", aliases: ["diagrama de conjuntos", "interseção", "união", "venn", "euler"] },
  { id: "structure.data_model", label: "Modelo de dados", aliases: ["entidade", "relacionamento", "chave primária", "chave estrangeira", "esquema relacional"] },
  { id: "structure.process", label: "Processo e decisão", aliases: ["processo", "fluxograma", "atividade", "gateway", "decisão"] },
  { id: "structure.state_transition", label: "Estado e transição", aliases: ["transição", "autômato", "máquina de estados"] },
  { id: "structure.terminal_session", label: "Sessão textual observável", aliases: ["sessão de terminal", "sessão textual", "interação textual", "comando e saída", "terminal", "stdout", "stderr"] },
  { id: "structure.call_stack", label: "Pilha de execução", aliases: ["pilha de chamadas", "pilha de execução", "quadro de ativação"] },
  { id: "structure.system_architecture", label: "Arquitetura de sistema", aliases: ["sistema", "contêiner", "bloco", "porta", "dependência"] },
  { id: "structure.memory_layout", label: "Layout de memória", aliases: ["memória", "endereço de memória", "segmento de memória"] },
  { id: "structure.network_topology", label: "Topologia de rede", aliases: ["topologia", "equipamento", "enlace", "segmento de rede"] },
  { id: "structure.binary_layout", label: "Layout binário", aliases: ["layout de pacote", "cabeçalho binário", "campo de bits", "offset"] },
  { id: "structure.response_options", label: "Seleção de alternativas", aliases: ["alternativas", "distratores", "escolha"] },
  { id: "structure.response_gap", label: "Preenchimento de lacuna", aliases: ["lacuna", "resposta curta", "completamento"] },
  { id: "structure.response_order", label: "Reconstrução de ordem", aliases: ["ordenação", "ordem de itens", "sequência reconstruída"] }
];

const TASK_OPERATION_RECORDS = [
  { id: "task_operation.explain", label: "Explicar e situar", aliases: ["explicar", "situar", "exemplificar"] },
  { id: "task_operation.identify", label: "Identificar e localizar", aliases: ["identificar", "localizar", "reconhecer", "inspecionar"] },
  { id: "task_operation.compare", label: "Comparar e contrastar", aliases: ["comparar", "contrastar", "distinguir"] },
  { id: "task_operation.trace", label: "Acompanhar e percorrer", aliases: ["acompanhar", "percorrer", "rastrear", "prever caminho"] },
  { id: "task_operation.calculate", label: "Calcular e avaliar", aliases: ["calcular", "avaliar", "balancear"] },
  { id: "task_operation.transform", label: "Transformar e reconstruir", aliases: ["transformar", "derivar", "normalizar", "reconstruir"] },
  { id: "task_operation.classify", label: "Classificar e associar", aliases: ["classificar", "associar", "mapear", "encaixar"] },
  { id: "task_operation.recall", label: "Recordar e completar", aliases: ["recordar", "recuperar", "completar"] },
  { id: "task_operation.decide", label: "Decidir e discriminar", aliases: ["decidir", "selecionar", "discriminar", "diagnosticar"] },
  { id: "task_operation.order", label: "Ordenar e sequenciar", aliases: ["ordenar", "sequenciar"] },
  { id: "task_operation.annotate", label: "Anotar e rotular", aliases: ["anotar", "rotular", "conectar evidência"] }
];

const PRACTICE_MODE_RECORDS = [
  { id: "practice.exposition", label: "Exposição", aliases: ["exposition", "teoria"] },
  { id: "practice.gap", label: "Lacuna", aliases: ["gap", "lacuna"] },
  { id: "practice.typing", label: "Digitação", aliases: ["typing", "digitação"] },
  { id: "practice.selection", label: "Seleção", aliases: ["selection", "escolha"] },
  { id: "practice.ordering", label: "Ordenação", aliases: ["ordering", "ordenação"] },
  { id: "practice.classification", label: "Classificação", aliases: ["classification", "classificação"] }
];

function normalized(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function freezeRecords(records) {
  return Object.freeze(records.map((record) => Object.freeze({
    ...record,
    ...(record.aliases ? { aliases: Object.freeze([...record.aliases]) } : {})
  })));
}

export const RESOURCE_FAMILIES = freezeRecords(FAMILY_RECORDS);
export const RESOURCE_VOCABULARIES = Object.freeze({
  disciplines: freezeRecords(DISCIPLINE_RECORDS),
  structures: freezeRecords(STRUCTURE_RECORDS),
  taskOperations: freezeRecords(TASK_OPERATION_RECORDS),
  practiceModes: freezeRecords(PRACTICE_MODE_RECORDS)
});

const VOCABULARY_BY_KIND = new Map(Object.entries(RESOURCE_VOCABULARIES));

function recordTerms(record) {
  return [record.id, record.label, ...(record.aliases || [])].map(normalized).filter(Boolean);
}

function includesTerm(input, term) {
  return input === term || ` ${input} `.includes(` ${term} `);
}

export function controlledVocabularyIds(kind, values = []) {
  const records = VOCABULARY_BY_KIND.get(kind);
  if (!records) throw new RangeError(`Vocabulário desconhecido: ${kind}.`);
  const inputs = (Array.isArray(values) ? values : [values]).map(normalized).filter(Boolean);
  return records.filter((record) => {
    const terms = recordTerms(record);
    return inputs.some((input) => terms.some((term) => includesTerm(input, term)));
  }).map(({ id }) => id);
}

function taskOperationIds(taskOperations) {
  const values = (Array.isArray(taskOperations) ? taskOperations : [])
    .flatMap((value) => String(value).split(/[-_]/u));
  const direct = controlledVocabularyIds("taskOperations", values);
  const prefixRules = [
    [/^(?:explain|situate|exemplify)/u, "task_operation.explain"],
    [/^(?:identify|interpret|locate|recognize|inspect|lookup|read)/u, "task_operation.identify"],
    [/^(?:compare|contrast|distinguish)/u, "task_operation.compare"],
    [/^(?:trace|predict|relate)/u, "task_operation.trace"],
    [/^(?:calculate|evaluate|balance|test)/u, "task_operation.calculate"],
    [/^(?:transform|derive|normalize|reconstruct)/u, "task_operation.transform"],
    [/^(?:classify|associate|map|match)/u, "task_operation.classify"],
    [/^(?:recall|complete)/u, "task_operation.recall"],
    [/^(?:decide|select|discriminate|diagnose)/u, "task_operation.decide"],
    [/^(?:order|sequence)/u, "task_operation.order"],
    [/^(?:annotate|label|connect)/u, "task_operation.annotate"]
  ];
  for (const value of taskOperations || []) {
    for (const [pattern, id] of prefixRules) {
      if (pattern.test(String(value))) direct.push(id);
    }
  }
  return [...new Set(direct)];
}

function familyId({ structureIds, disciplineIds, practiceModeIds }) {
  if (!practiceModeIds.includes("practice.exposition")) return "family.response";
  if (structureIds.some((id) => new Set([
    "structure.process", "structure.state_transition", "structure.terminal_session",
    "structure.call_stack"
  ]).has(id))) return "family.process_state";
  if (structureIds.some((id) => new Set([
    "structure.system_architecture", "structure.data_model"
  ]).has(id))) return "family.software_data";
  if (structureIds.some((id) => new Set([
    "structure.memory_layout", "structure.network_topology", "structure.binary_layout"
  ]).has(id))) return "family.infrastructure";
  if (structureIds.some((id) => new Set([
    "structure.hierarchy", "structure.graph", "structure.correspondence",
    "structure.set_regions"
  ]).has(id))) return "family.relational";
  if (structureIds.some((id) => new Set([
    "structure.table", "structure.symbolic", "structure.coordinate_space",
    "structure.quantitative_series"
  ]).has(id))) return "family.quantitative_symbolic";
  if (disciplineIds.includes("discipline.language")) return "family.text_language";
  return "family.text_language";
}

export function inferAcademicTaxonomy({
  domains = [],
  knowledgeObjects = [],
  conventions = [],
  taskOperations = [],
  practiceModes = [],
  taxonomy = {}
} = {}) {
  const disciplineIds = taxonomy.disciplineIds?.length
    ? [...taxonomy.disciplineIds]
    : controlledVocabularyIds("disciplines", domains);
  const structureIds = taxonomy.structureIds?.length
    ? [...taxonomy.structureIds]
    : controlledVocabularyIds("structures", [...knowledgeObjects, ...conventions]);
  const resolvedTaskOperationIds = taxonomy.taskOperationIds?.length
    ? [...taxonomy.taskOperationIds]
    : taskOperationIds(taskOperations);
  const practiceModeIds = taxonomy.practiceModeIds?.length
    ? [...taxonomy.practiceModeIds]
    : controlledVocabularyIds("practiceModes", practiceModes);
  const primaryFamilyId = taxonomy.primaryFamilyId || familyId({
    structureIds,
    disciplineIds,
    practiceModeIds
  });
  return Object.freeze({
    primaryFamilyId,
    familyIds: Object.freeze([...new Set([
      primaryFamilyId,
      ...(taxonomy.familyIds || [])
    ])]),
    disciplineIds: Object.freeze([...new Set(disciplineIds)]),
    structureIds: Object.freeze([...new Set(structureIds)]),
    taskOperationIds: Object.freeze([...new Set(resolvedTaskOperationIds)]),
    practiceModeIds: Object.freeze([...new Set(practiceModeIds)]),
    specificity: taxonomy.specificity || (
      domains.includes("transversal") || domains.length >= 4 ? "versatile" : "disciplinary"
    )
  });
}

export function validateAcademicTaxonomy(taxonomy, label = "taxonomy") {
  if (!taxonomy || typeof taxonomy !== "object" || Array.isArray(taxonomy)) {
    return [`${label} precisa ser um objeto.`];
  }
  const errors = [];
  const familyIds = new Set(RESOURCE_FAMILIES.map(({ id }) => id));
  if (!familyIds.has(taxonomy.primaryFamilyId)) {
    errors.push(`${label}.primaryFamilyId não pertence ao vocabulário.`);
  }
  const checks = [
    ["familyIds", familyIds],
    ...Object.entries(RESOURCE_VOCABULARIES).map(([field, records]) => [
      field === "practiceModes" ? "practiceModeIds" : `${field.slice(0, -1)}Ids`,
      new Set(records.map(({ id }) => id))
    ])
  ];
  for (const [field, allowed] of checks) {
    if (!Array.isArray(taxonomy[field]) || taxonomy[field].some((id) => !allowed.has(id))) {
      errors.push(`${label}.${field} contém identificador fora do vocabulário.`);
    }
  }
  if (!new Set(["versatile", "disciplinary"]).has(taxonomy.specificity)) {
    errors.push(`${label}.specificity precisa ser versatile ou disciplinary.`);
  }
  return errors;
}

export function normalizeFacetText(value) {
  return normalized(value);
}
