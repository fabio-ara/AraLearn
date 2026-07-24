import { RESOURCE_TYPES } from "../domain/resources.js";
import {
  FLOW_STRUCTURED_PRACTICE_TARGETS,
  RESOURCE_GAP_CAPABILITIES
} from "./resourceGaps.js";

export const AUTHORING_RESOURCE_CONTRACT_VERSION = "aralearn.authoring-resources.v1";

const RESPONSE_MODES = Object.freeze([
  Object.freeze({
    value: "choice",
    useWhen: "As alternativas representam erros plausíveis da mesma operação.",
    requires: Object.freeze(["answer", "distractors"])
  }),
  Object.freeze({
    value: "text",
    useWhen: "A resposta admite normalização objetiva sem exigir grafia arbitrária.",
    requires: Object.freeze(["answer"]),
    optional: Object.freeze(["acceptedAnswers"])
  })
]);

const COMMON_CARD_FIELDS = Object.freeze([
  "id",
  "position",
  "resource",
  "kind",
  "exercise",
  "title",
  "after"
]);

const RESOURCE_SHAPES = Object.freeze({
  paragraph: Object.freeze({
    required: Object.freeze(["text"]),
    optional: Object.freeze(["languageTag", "textDirection", "sources", "topics"])
  }),
  choice: Object.freeze({
    required: Object.freeze(["question", "options", "answer"]),
    optional: Object.freeze(["languageTag", "textDirection", "sources", "topics"]),
    rules: Object.freeze([
      "options contém 3 ou 4 itens com id único.",
      "answer aponta para o id de uma opção.",
      "Cada opção usa text ou usa kind code com language e code."
    ])
  }),
  composite: Object.freeze({
    required: Object.freeze(["blocks"]),
    optional: Object.freeze(["afterBlocks", "languageTag", "textDirection", "sources", "topics"]),
    variants: Object.freeze({
      block: Object.freeze([
        "heading",
        "paragraph",
        "choice",
        "code",
        "table",
        "flow",
        "tree",
        "graph",
        "relation_map",
        "matrix",
        "plane",
        "formula"
      ])
    }),
    rules: Object.freeze([
      "Cada bloco declara kind e somente os campos do recurso correspondente.",
      "Um composite gap não contém bloco choice.",
      "Um composite choice contém exatamente um bloco choice."
    ])
  }),
  code: Object.freeze({
    required: Object.freeze(["prompt", "language", "code"]),
    optional: Object.freeze([
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    rules: Object.freeze([
      "Quebras de linha e indentação em code são significativas.",
      "Um gap ocupa somente o trecho substituível e não altera os espaços ao redor."
    ])
  }),
  table: Object.freeze({
    required: Object.freeze(["columns", "rows"]),
    optional: Object.freeze([
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    rules: Object.freeze([
      "Cada linha de rows tem exatamente o mesmo número de células de columns."
    ])
  }),
  flow: Object.freeze({
    required: Object.freeze(["structure"]),
    optional: Object.freeze([
      "prompt",
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    variants: Object.freeze({
      root: Object.freeze({ id: "identificador", kind: "sequence", items: "nós[]" }),
      leaf: Object.freeze({
        kinds: Object.freeze(["start", "end", "input", "output", "process"]),
        fields: Object.freeze(["id", "kind", "text"])
      }),
      branch: Object.freeze({
        if_then: Object.freeze(["id", "kind", "condition", "thenBranch"]),
        if_then_else: Object.freeze(["id", "kind", "condition", "thenBranch", "elseBranch"]),
        while: Object.freeze(["id", "kind", "condition", "body"]),
        do_while: Object.freeze(["id", "kind", "condition", "body"]),
        for: Object.freeze([
          "id",
          "kind",
          "init",
          "condition",
          "update",
          "iterator",
          "iterable",
          "body"
        ]),
        if_chain: Object.freeze(["id", "kind", "cases", "elseBranch"]),
        switch_case: Object.freeze(["id", "kind", "expression", "cases", "defaultBranch"])
      }),
      ifChainCase: Object.freeze(["id", "condition", "thenBranch", "practice"]),
      switchCase: Object.freeze(["id", "match", "body", "practice"]),
      practice: Object.freeze({
        fields: Object.freeze(["blankShape", "shapeOptions", "text", "labels"]),
        textOrLabelEntry: Object.freeze({
          required: Object.freeze(["blank"]),
          optional: Object.freeze(["mode", "options", "variants"]),
          mode: Object.freeze(["choice"]),
          option: Object.freeze(["id", "value", "enabled"]),
          variant: Object.freeze(["id", "value"])
        })
      })
    }),
    rules: Object.freeze([
      "structure tem uma única raiz sequence com items não vazio.",
      "Cada nó possui id estável e somente os campos de seu kind.",
      "Em text ou condition, {gap:id} ocupa sozinho o campo e possui definição em gaps.",
      "Forma e rótulo usam practice estruturado; não usam marcador nem definição em gaps.",
      "A forma correta deriva do kind do nó. O rótulo correto deriva da aresta projetada.",
      "variants contém somente respostas literais; a autoria não aceita regex."
    ])
  }),
  tree: Object.freeze({
    required: Object.freeze(["prompt", "nodes"]),
    optional: Object.freeze([
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    variants: Object.freeze({
      node: Object.freeze({
        required: Object.freeze(["id", "label", "type", "parentId"]),
        type: Object.freeze(["folder", "file"])
      })
    }),
    rules: Object.freeze([
      "Existe exatamente uma raiz com parentId null.",
      "Todo parentId não nulo aponta para outro nó e a árvore não contém ciclos."
    ])
  }),
  graph: Object.freeze({
    required: Object.freeze(["prompt", "vertices", "edges"]),
    optional: Object.freeze([
      "highlight",
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    variants: Object.freeze({
      vertex: Object.freeze({
        required: Object.freeze(["id", "label"]),
        optional: Object.freeze(["x", "y"])
      }),
      edge: Object.freeze({
        required: Object.freeze(["from", "to"]),
        optional: Object.freeze(["label", "weight", "directed"])
      })
    }),
    rules: Object.freeze([
      "from e to apontam para ids existentes em vertices.",
      "x e y, quando informados, ficam entre 0 e 100."
    ])
  }),
  relation_map: Object.freeze({
    required: Object.freeze(["prompt", "leftSet", "rightSet", "relations"]),
    optional: Object.freeze([
      "pairList",
      "relationTable",
      "highlight",
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    variants: Object.freeze({
      set: Object.freeze({
        required: Object.freeze(["label", "items"]),
        item: Object.freeze(["id", "label"])
      }),
      relation: Object.freeze({
        required: Object.freeze(["from", "to"]),
        optional: Object.freeze(["label"])
      })
    }),
    rules: Object.freeze([
      "from pertence a leftSet.items e to pertence a rightSet.items.",
      "relationTable, quando usado, tem duas colunas e duas células em cada linha."
    ])
  }),
  matrix: Object.freeze({
    requiredAlternatives: Object.freeze([
      Object.freeze(["values"]),
      Object.freeze(["sequence"])
    ]),
    optional: Object.freeze([
      "prompt",
      "name",
      "highlight",
      "dividerAfterColumn",
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    rules: Object.freeze([
      "values forma uma matriz retangular.",
      "sequence contém de 2 a 5 matrizes retangulares.",
      "dividerAfterColumn fica entre colunas existentes."
    ])
  }),
  plane: Object.freeze({
    requiredAlternatives: Object.freeze([
      Object.freeze(["x", "y"]),
      Object.freeze(["vector"]),
      Object.freeze(["vectors"]),
      Object.freeze(["sum"]),
      Object.freeze(["scale"]),
      Object.freeze(["distance"])
    ]),
    optional: Object.freeze([
      "prompt",
      "result",
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    rules: Object.freeze([
      "Cada coordenada usa o par numérico [x, y].",
      "Use somente um modo principal entre vector, vectors, sum, scale e distance.",
      "Quando x ou y é informado, os dois intervalos são obrigatórios."
    ])
  }),
  formula: Object.freeze({
    required: Object.freeze(["prompt", "notation", "accessibleText", "expression"]),
    optional: Object.freeze([
      "question",
      "options",
      "answer",
      "languageTag",
      "textDirection",
      "sources",
      "topics"
    ]),
    variants: Object.freeze({
      notation: Object.freeze(["mathematics", "chemistry"]),
      expressionLeaf: Object.freeze(["number", "identifier", "operator", "text"]),
      expressionContainer: Object.freeze([
        "row",
        "fraction",
        "root",
        "superscript",
        "subscript",
        "subsup",
        "fenced"
      ]),
      expressionShape: Object.freeze({
        number: Object.freeze(["type", "value"]),
        identifier: Object.freeze(["type", "value"]),
        operator: Object.freeze(["type", "value"]),
        text: Object.freeze(["type", "value"]),
        row: Object.freeze(["type", "children"]),
        fraction: Object.freeze(["type", "numerator", "denominator"]),
        root: Object.freeze(["type", "radicand", "index"]),
        superscript: Object.freeze(["type", "base", "exponent"]),
        subscript: Object.freeze(["type", "base", "subscript"]),
        subsup: Object.freeze(["type", "base", "subscript", "superscript"]),
        fenced: Object.freeze(["type", "open", "close", "content"])
      }),
      fencePairs: Object.freeze(["()", "[]", "{}", "||", "‖‖", "⟨⟩"])
    }),
    rules: Object.freeze([
      "expression é uma AST; não use fórmula livre em texto ou LaTeX.",
      "accessibleText descreve a mesma expressão e repete os marcadores de gap na mesma ordem."
    ])
  })
});

const GAP_LANGUAGE = Object.freeze({
  marker: "{gap:id}",
  targetRule:
    "O marcador identifica o alvo no próprio campo formal. Não descreva o alvo em linguagem natural.",
  definition: Object.freeze({
    required: Object.freeze(["id", "response", "answer"]),
    optionalByResponse: Object.freeze({
      choice: Object.freeze(["distractors"]),
      text: Object.freeze(["acceptedAnswers"])
    }),
    response: Object.freeze(["choice", "text"])
  }),
  rules: Object.freeze([
    "Cada id é declarado uma vez e seu marcador aparece uma única vez.",
    "choice exige de 1 a 5 distratores distintos da resposta.",
    "text omite distractors e pode declarar até 8 acceptedAnswers literais.",
    "acceptedAnswers enumera grafias equivalentes objetivas; não aceita regex nem inferência semântica.",
    "Não envie a sintaxe interna [[...]]; o servidor a produz após validar o card."
  ])
});

const DIDACTIC_SELECTION = Object.freeze({
  paragraph: Object.freeze({
    useWhen: Object.freeze([
      "A unidade de sentido é uma definição, regra, contraste ou inferência verbal.",
      "A resposta completa um trecho localizado sem perder a estrutura da proposição."
    ]),
    avoidWhen: Object.freeze([
      "Linhas, colunas, hierarquia, sequência, conectividade ou notação são parte do raciocínio."
    ]),
    variationAxes: Object.freeze(["exemplo", "contraste", "condição de aplicação", "consequência"])
  }),
  choice: Object.freeze({
    useWhen: Object.freeze([
      "A aprendizagem exige discriminar alternativas completas e erros plausíveis."
    ]),
    avoidWhen: Object.freeze([
      "A resposta pertence a uma representação que pode receber uma lacuna no próprio contexto."
    ]),
    variationAxes: Object.freeze(["distrator conceitual", "caso-limite", "classificação", "decisão"])
  }),
  composite: Object.freeze({
    useWhen: Object.freeze([
      "Duas ou mais representações precisam permanecer juntas para sustentar a mesma operação."
    ]),
    avoidWhen: Object.freeze([
      "Um único recurso comunica a ideia sem perda; não use composite apenas para ornamentar."
    ]),
    variationAxes: Object.freeze(["representações equivalentes", "regra e aplicação", "dados e interpretação"])
  }),
  code: Object.freeze({
    useWhen: Object.freeze([
      "Sintaxe, indentação, estado, ordem de execução ou resultado do programa são essenciais."
    ]),
    avoidWhen: Object.freeze([
      "O código seria apenas uma forma decorativa de apresentar uma proposição verbal."
    ]),
    variationAxes: Object.freeze(["entrada", "estado intermediário", "operador", "ramo", "saída"])
  }),
  table: Object.freeze({
    useWhen: Object.freeze([
      "O significado depende do cruzamento entre linha e coluna ou da comparação sistemática de casos."
    ]),
    avoidWhen: Object.freeze([
      "A ordem temporal, a hierarquia ou as conexões entre elementos são mais importantes que a grade."
    ]),
    variationAxes: Object.freeze(["linha", "coluna", "caso", "condição", "resultado"])
  }),
  flow: Object.freeze({
    useWhen: Object.freeze([
      "A operação envolve sequência, decisão, repetição ou caminhos alternativos."
    ]),
    avoidWhen: Object.freeze([
      "A relação é hierárquica, espacial ou independente de ordem."
    ]),
    variationAxes: Object.freeze(["etapa", "condição", "ramo", "iteração", "saída"])
  }),
  tree: Object.freeze({
    useWhen: Object.freeze([
      "A operação depende de ancestralidade, níveis, decomposição ou classificação hierárquica."
    ]),
    avoidWhen: Object.freeze([
      "Um elemento pode ter vários predecessores ou as conexões formam ciclos."
    ]),
    variationAxes: Object.freeze(["nível", "ancestral", "ramo", "folha", "classificação"])
  }),
  graph: Object.freeze({
    useWhen: Object.freeze([
      "Conectividade, caminho, direção, vizinhança ou peso entre entidades são essenciais."
    ]),
    avoidWhen: Object.freeze([
      "A estrutura é estritamente hierárquica ou uma correspondência entre dois conjuntos."
    ]),
    variationAxes: Object.freeze(["vértice", "aresta", "direção", "peso", "caminho"])
  }),
  relation_map: Object.freeze({
    useWhen: Object.freeze([
      "A operação envolve correspondência, domínio, contradomínio, imagem ou pares entre conjuntos."
    ]),
    avoidWhen: Object.freeze([
      "As entidades pertencem a uma única rede sem papéis distintos de origem e destino."
    ]),
    variationAxes: Object.freeze(["elemento", "par", "imagem", "domínio", "propriedade da relação"])
  }),
  matrix: Object.freeze({
    useWhen: Object.freeze([
      "Posição em grade, linhas, colunas, diagonais ou transformação matricial são essenciais."
    ]),
    avoidWhen: Object.freeze([
      "Os valores não formam uma grade retangular com significado posicional."
    ]),
    variationAxes: Object.freeze(["célula", "linha", "coluna", "diagonal", "transformação"])
  }),
  plane: Object.freeze({
    useWhen: Object.freeze([
      "Coordenadas, pontos, vetores, escala, soma ou distância no plano sustentam a operação."
    ]),
    avoidWhen: Object.freeze([
      "A posição visual não participa do raciocínio."
    ]),
    variationAxes: Object.freeze(["coordenada", "orientação", "magnitude", "soma", "distância"])
  }),
  formula: Object.freeze({
    useWhen: Object.freeze([
      "A estrutura matemática ou química, inclusive frações, índices e expoentes, precisa ser preservada."
    ]),
    avoidWhen: Object.freeze([
      "Texto simples ou código expressa a operação com maior precisão."
    ]),
    variationAxes: Object.freeze(["símbolo", "termo", "índice", "expoente", "operador"])
  })
});

const DEFINITIONS = Object.freeze({
  paragraph: Object.freeze({
    label: "Parágrafo",
    purpose: "Definição, regra, síntese, contraste ou enunciado textual.",
    operations: Object.freeze(["explicar", "completar uma proposição"]),
    fields: Object.freeze(["title", "text", "after"]),
    exercises: Object.freeze(["none", "gap"]),
    example: Object.freeze({
      resource: "paragraph",
      kind: "exercise",
      exercise: "gap",
      title: "Conjunção",
      text: "P ∧ Q só é verdadeira quando {gap:condition}.",
      gaps: Object.freeze([Object.freeze({
        id: "condition",
        response: "choice",
        answer: "P e Q são verdadeiras",
        distractors: Object.freeze(["apenas P é verdadeira", "ao menos uma é verdadeira"])
      })])
    })
  }),
  choice: Object.freeze({
    label: "Escolha",
    purpose: "Discriminação entre alternativas completas e mutuamente comparáveis.",
    operations: Object.freeze(["reconhecer", "classificar", "selecionar uma decisão"]),
    fields: Object.freeze(["title", "question", "options", "answer", "after"]),
    exercises: Object.freeze(["choice"]),
    example: Object.freeze({
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      title: "Operador de atribuição",
      question: "Qual operador atribui um valor em C?",
      options: Object.freeze([
        Object.freeze({ id: "assign", text: "=" }),
        Object.freeze({ id: "equal", text: "==" }),
        Object.freeze({ id: "different", text: "!=" })
      ]),
      answer: "assign"
    })
  }),
  composite: Object.freeze({
    label: "Composto",
    purpose: "Combinação inseparável de duas ou mais representações no mesmo card.",
    operations: Object.freeze(["comparar representações", "integrar explicação e aplicação"]),
    fields: Object.freeze(["title", "blocks", "afterBlocks", "after"]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "composite",
      kind: "exercise",
      exercise: "gap",
      title: "Regra e código",
      blocks: Object.freeze([
        Object.freeze({ kind: "paragraph", value: "Complete a condição." }),
        Object.freeze({
          kind: "code",
          prompt: "Complete a condição.",
          language: "python",
          code: "if {gap:condition}:\n    aprovar()"
        })
      ]),
      gaps: Object.freeze([Object.freeze({
        id: "condition",
        response: "choice",
        answer: "nota >= 6",
        distractors: Object.freeze(["nota < 6", "nota = 0"])
      })])
    })
  }),
  code: Object.freeze({
    label: "Código",
    purpose: "Sintaxe, comando, indentação, ordem de execução ou saída de programa.",
    operations: Object.freeze(["completar código", "prever execução", "corrigir sintaxe"]),
    fields: Object.freeze(["title", "prompt", "language", "code", "after"]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "code",
      kind: "exercise",
      exercise: "gap",
      title: "Condição em Python",
      prompt: "Complete a comparação.",
      language: "python",
      code: "if {gap:condition}:\n    print(\"aprovado\")",
      gaps: Object.freeze([Object.freeze({
        id: "condition",
        response: "text",
        answer: "nota >= 6",
        acceptedAnswers: Object.freeze(["nota>=6"])
      })])
    })
  }),
  table: Object.freeze({
    label: "Tabela",
    purpose: "Comparação ou relação cuja linha e coluna têm significado.",
    operations: Object.freeze(["completar célula", "comparar casos", "ler tabela-verdade"]),
    fields: Object.freeze(["title", "columns", "rows", "after"]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "table",
      kind: "exercise",
      exercise: "gap",
      title: "Tabela-verdade",
      columns: Object.freeze(["P", "Q", "P ∧ Q"]),
      rows: Object.freeze([Object.freeze(["V", "V", "{gap:result}"])]),
      gaps: Object.freeze([Object.freeze({
        id: "result",
        response: "choice",
        answer: "V",
        distractors: Object.freeze(["F"])
      })])
    })
  }),
  flow: Object.freeze({
    label: "Fluxo",
    purpose: "Sequência, decisão, repetição ou procedimento com ramificações.",
    operations: Object.freeze([
      "completar etapa",
      "completar condição",
      "reconhecer forma",
      "completar rótulo de ramo"
    ]),
    fields: Object.freeze(["title", "prompt", "structure", "after"]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    authoringNote: "Textos e condições usam {gap:id} com gaps. Formas e rótulos usam practice estruturado, cuja resposta correta deriva do kind do nó ou da aresta.",
    formalPracticeExample: Object.freeze({
      id: "decision-shape-and-labels",
      kind: "while",
      condition: "Continuar?",
      practice: Object.freeze({
        blankShape: true,
        shapeOptions: Object.freeze(["decision"]),
        labels: Object.freeze({
          yes: Object.freeze({
            blank: true,
            mode: "choice",
            options: Object.freeze(["Não"])
          }),
          no: Object.freeze({
            blank: true,
            variants: Object.freeze(["Nao"])
          })
        })
      }),
      body: Object.freeze([
        Object.freeze({ id: "process", kind: "process", text: "Executar" })
      ])
    }),
    example: Object.freeze({
      resource: "flow",
      kind: "exercise",
      exercise: "gap",
      title: "Decisão",
      structure: Object.freeze({
        id: "root",
        kind: "sequence",
        items: Object.freeze([
          Object.freeze({
            id: "decision",
            kind: "if_then",
            condition: "{gap:condition}",
            thenBranch: Object.freeze([
              Object.freeze({ id: "output", kind: "output", text: "Exibir aprovado" })
            ])
          })
        ])
      }),
      gaps: Object.freeze([Object.freeze({
        id: "condition",
        response: "choice",
        answer: "nota >= 6",
        distractors: Object.freeze(["nota < 6"])
      })])
    })
  }),
  tree: Object.freeze({
    label: "Árvore",
    purpose: "Hierarquia, taxonomia, sintaxe ou decomposição em níveis.",
    operations: Object.freeze(["completar nó", "identificar ancestral", "classificar ramo"]),
    fields: Object.freeze(["title", "prompt", "nodes", "after"]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "tree",
      kind: "exercise",
      exercise: "gap",
      title: "Classificação",
      prompt: "Complete o táxon.",
      nodes: Object.freeze([
        Object.freeze({ id: "root", label: "Animalia", type: "folder", parentId: null }),
        Object.freeze({ id: "child", label: "{gap:taxon}", type: "file", parentId: "root" })
      ]),
      gaps: Object.freeze([Object.freeze({
        id: "taxon",
        response: "choice",
        answer: "Chordata",
        distractors: Object.freeze(["Plantae", "Fungi"])
      })])
    })
  }),
  graph: Object.freeze({
    label: "Grafo",
    purpose: "Conectividade, dependência, rede ou relação entre vértices.",
    operations: Object.freeze(["completar vértice", "completar aresta", "calcular peso"]),
    fields: Object.freeze(["title", "prompt", "vertices", "edges", "highlight", "after"]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "graph",
      kind: "exercise",
      exercise: "gap",
      title: "Peso da aresta",
      prompt: "Complete o peso.",
      vertices: Object.freeze([
        Object.freeze({ id: "a", label: "A", x: 20, y: 50 }),
        Object.freeze({ id: "b", label: "B", x: 80, y: 50 })
      ]),
      edges: Object.freeze([
        Object.freeze({ from: "a", to: "b", weight: "{gap:weight}", directed: true })
      ]),
      gaps: Object.freeze([Object.freeze({
        id: "weight",
        response: "text",
        answer: "7"
      })])
    })
  }),
  relation_map: Object.freeze({
    label: "Mapa de relações",
    purpose: "Correspondência entre conjuntos, pares, domínio, contradomínio e imagem.",
    operations: Object.freeze(["completar elemento", "completar relação", "reconhecer par"]),
    fields: Object.freeze([
      "title",
      "prompt",
      "leftSet",
      "rightSet",
      "relations",
      "pairList",
      "relationTable",
      "highlight",
      "after"
    ]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "relation_map",
      kind: "exercise",
      exercise: "gap",
      title: "Imagem da relação",
      prompt: "Complete o elemento relacionado.",
      leftSet: Object.freeze({
        label: "U",
        items: Object.freeze([Object.freeze({ id: "a", label: "A" })])
      }),
      rightSet: Object.freeze({
        label: "V",
        items: Object.freeze([Object.freeze({ id: "one", label: "{gap:image}" })])
      }),
      relations: Object.freeze([Object.freeze({ from: "a", to: "one" })]),
      gaps: Object.freeze([Object.freeze({
        id: "image",
        response: "choice",
        answer: "1",
        distractors: Object.freeze(["2"])
      })])
    })
  }),
  matrix: Object.freeze({
    label: "Matriz",
    purpose: "Posição, linha, coluna, diagonal ou transformação matricial.",
    operations: Object.freeze(["completar célula", "calcular transformação", "reconhecer posição"]),
    fields: Object.freeze(["title", "prompt", "name", "values", "sequence", "highlight", "after"]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "matrix",
      kind: "exercise",
      exercise: "gap",
      title: "Soma matricial",
      values: Object.freeze([
        Object.freeze(["1", "2"]),
        Object.freeze(["3", "{gap:value}"])
      ]),
      gaps: Object.freeze([Object.freeze({
        id: "value",
        response: "text",
        answer: "4"
      })])
    })
  }),
  plane: Object.freeze({
    label: "Plano",
    purpose: "Ponto, vetor, soma, escala ou distância no plano cartesiano.",
    operations: Object.freeze(["completar coordenada", "calcular vetor", "calcular distância"]),
    fields: Object.freeze([
      "title",
      "prompt",
      "x",
      "y",
      "vector",
      "vectors",
      "sum",
      "scale",
      "distance",
      "result",
      "after"
    ]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    example: Object.freeze({
      resource: "plane",
      kind: "exercise",
      exercise: "gap",
      title: "Soma de vetores",
      sum: Object.freeze([Object.freeze([1, 2]), Object.freeze([2, 1])]),
      result: "{gap:result}",
      gaps: Object.freeze([Object.freeze({
        id: "result",
        response: "choice",
        answer: "(3, 3)",
        distractors: Object.freeze(["(2, 2)", "(3, 1)"])
      })])
    })
  }),
  formula: Object.freeze({
    label: "Fórmula",
    purpose: "Expressão matemática ou química com estrutura semântica e leitura acessível.",
    operations: Object.freeze(["completar símbolo", "completar termo", "completar índice"]),
    fields: Object.freeze([
      "title",
      "prompt",
      "notation",
      "accessibleText",
      "expression",
      "after"
    ]),
    exercises: Object.freeze(["none", "gap", "choice"]),
    authoringNote: "accessibleText repete os mesmos marcadores da expressão, na mesma ordem.",
    example: Object.freeze({
      resource: "formula",
      kind: "exercise",
      exercise: "gap",
      title: "Operador",
      prompt: "Complete o operador.",
      notation: "mathematics",
      accessibleText: "x {gap:operator} y",
      expression: Object.freeze({
        type: "row",
        children: Object.freeze([
          Object.freeze({ type: "identifier", value: "x" }),
          Object.freeze({ type: "operator", value: "{gap:operator}" }),
          Object.freeze({ type: "identifier", value: "y" })
        ])
      }),
      gaps: Object.freeze([Object.freeze({
        id: "operator",
        response: "choice",
        answer: "+",
        distractors: Object.freeze(["−"])
      })])
    })
  })
});

function clone(value) {
  return structuredClone(value);
}

function definition(resource) {
  const value = DEFINITIONS[resource];
  if (!value) return null;
  const cloned = clone(value);
  return {
    resource,
    ...cloned,
    example: {
      id: `example-${resource.replaceAll("_", "-")}`,
      position: 1,
      after: "Feedback explicativo.",
      ...cloned.example
    },
    selection: clone(DIDACTIC_SELECTION[resource]),
    shape: {
      commonRequired: clone(COMMON_CARD_FIELDS),
      ...(clone(RESOURCE_SHAPES[resource]) || {})
    },
    gapTargets: clone(RESOURCE_GAP_CAPABILITIES[resource] || []),
    structuredPracticeTargets:
      resource === "flow" ? clone(FLOW_STRUCTURED_PRACTICE_TARGETS) : null,
    responseModes: resource === "choice" ? [] : clone(RESPONSE_MODES),
    gapLanguage: resource === "choice" ? null : clone(GAP_LANGUAGE)
  };
}

export function listAuthoringResourceContracts() {
  return RESOURCE_TYPES.map((resource) => {
    const value = definition(resource);
    return {
      resource,
      label: value.label,
      purpose: value.purpose,
      operations: value.operations,
      selection: value.selection,
      exercises: value.exercises,
      gapTargets: value.gapTargets,
      structuredPracticeTargets: value.structuredPracticeTargets
        ? Object.keys(value.structuredPracticeTargets)
        : []
    };
  });
}

export function getAuthoringResourceContract(resource) {
  return definition(String(resource || "").trim());
}
