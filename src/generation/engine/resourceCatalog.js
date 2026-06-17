export const RESOURCE_CATALOG = Object.freeze([
  {
    id: "paragraph",
    code: 101,
    didacticFunction: "Explicação curta ou lacuna textual fechada.",
    useWhen: ["regra local", "síntese", "transição", "completar frase"],
    avoidWhen: ["conteúdo espacial", "grafo", "matriz quando a forma importa"],
    operations: [201, 202],
    templates: ["paragraph_theory", "paragraph_gap"],
    compilers: ["paragraphCompiler"],
    supportedExercises: ["none", "gap"]
  },
  {
    id: "choice",
    code: 102,
    didacticFunction: "Pergunta objetiva textual.",
    useWhen: ["reconhecimento", "comparação", "distratores plausíveis"],
    avoidWhen: ["caso visual mais adequado está disponível"],
    operations: [203],
    templates: ["choice_exercise"],
    compilers: ["choiceCompiler"],
    supportedExercises: ["choice"]
  },
  {
    id: "composite",
    code: 111,
    didacticFunction: "Card composto com múltiplos blocos e recursos repetidos dentro da mesma unidade didática.",
    useWhen: ["comparar dois grafos", "comparar dois casos paralelos", "mostrar enunciado curto + dois recursos + escolha"],
    avoidWhen: ["caso simples resolvido por um recurso único", "conteúdo linear sem comparação explícita"],
    operations: [218],
    templates: ["composite_graph_compare_choice"],
    compilers: ["compositeCompiler"],
    supportedExercises: ["choice"]
  },
  {
    id: "matrix",
    code: 103,
    didacticFunction: "Linhas, colunas, posição e sequência matricial.",
    useWhen: ["linhas e colunas", "posição por linha/coluna", "sequência matricial", "operação matricial pequena"],
    avoidWhen: ["relação entre conjuntos", "grafo se o foco for vértice/aresta"],
    operations: [204, 205, 206, 207],
    templates: ["matrix_theory", "matrix_locate_cell_choice"],
    compilers: ["matrixCompiler"],
    supportedExercises: ["none", "choice"]
  },
  {
    id: "table",
    code: 104,
    didacticFunction: "Comparação e casos em linhas/colunas.",
    useWhen: ["tabela-verdade", "classificação", "comparação de casos"],
    avoidWhen: ["vetor no plano", "grafo estrutural"],
    operations: [206, 208, 217],
    templates: ["table_theory", "table_choice"],
    compilers: ["tableCompiler"],
    supportedExercises: ["none", "choice"]
  },
  {
    id: "code",
    code: 105,
    didacticFunction: "Trecho de código, comando ou completamento sintático controlado.",
    useWhen: ["leitura de código", "saída de código", "rastreio simples", "completar uma linha ou bloco curto"],
    avoidWhen: ["assunto não depende de sintaxe"],
    operations: [209, 216],
    templates: ["code_theory", "code_gap", "code_choice"],
    compilers: ["codeCompiler"],
    supportedExercises: ["none", "gap", "choice"]
  },
  {
    id: "flow",
    code: 106,
    didacticFunction: "Sequência, decisão ou processo.",
    useWhen: ["passos", "fluxo condicional", "algoritmo linear"],
    avoidWhen: ["grafo geral", "hierarquia"],
    operations: [210],
    templates: ["flow_linear"],
    compilers: ["flowCompiler"],
    supportedExercises: ["none", "choice"]
  },
  {
    id: "tree",
    code: 107,
    didacticFunction: "Hierarquia e parentId.",
    useWhen: ["caminho hierárquico", "pastas", "conceitos em níveis"],
    avoidWhen: ["fluxo temporal", "grafo geral"],
    operations: [211],
    templates: ["tree_path"],
    compilers: ["treeCompiler"],
    supportedExercises: ["none", "choice"]
  },
  {
    id: "graph",
    code: 108,
    didacticFunction: "Vértices, arestas e caminho.",
    useWhen: ["adjacência", "caminho", "nó e aresta"],
    avoidWhen: ["hierarquia pura", "dois conjuntos com foco em pares"],
    operations: [212],
    templates: ["graph_simple"],
    compilers: ["graphCompiler"],
    supportedExercises: ["none", "choice"]
  },
  {
    id: "plane",
    code: 109,
    didacticFunction: "Plano cartesiano, vetor e soma vetorial.",
    useWhen: ["vetor 2D", "coordenada", "soma de vetores", "pontos no plano"],
    avoidWhen: ["matriz", "fluxo"],
    operations: [214, 215],
    templates: ["plane_vector", "plane_sum"],
    compilers: ["planeCompiler"],
    supportedExercises: ["none", "choice"]
  },
  {
    id: "relation_map",
    code: 110,
    didacticFunction: "Dois conjuntos e relações entre itens.",
    useWhen: ["pares ordenados", "relação entre conjuntos", "lista de pares"],
    avoidWhen: ["hierarquia", "grafo geral sem bipartição"],
    operations: [213],
    templates: ["relation_map_simple"],
    compilers: ["relationMapCompiler"],
    supportedExercises: ["none", "choice"]
  }
]);

export function listResourceCatalog() {
  return RESOURCE_CATALOG.map((item) => structuredClone(item));
}

export function getResourceCatalogItemByCode(code) {
  return RESOURCE_CATALOG.find((item) => item.code === Number(code)) || null;
}

export function getResourceCatalogItemById(id = "") {
  return RESOURCE_CATALOG.find((item) => item.id === id) || null;
}
