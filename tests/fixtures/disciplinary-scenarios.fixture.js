function options(correct, distractorA, distractorB) {
  return [
    { id: "a", text: correct },
    { id: "b", text: distractorA },
    { id: "c", text: distractorB }
  ];
}

const scenarios = [
  {
    id: "programacao",
    area: "Programação",
    goal: "Completar uma expressão usando os dados fornecidos no próprio card.",
    cards: [
      {
        id: "card-programacao-exemplo",
        resource: "code",
        kind: "theory",
        exercise: "none",
        title: "Soma de uma lista",
        prompt: "O trecho define a lista antes de calcular a soma.",
        language: "python",
        code: "valores = [4, 7, 9]\ntotal = sum(valores)",
        after: "A função recebe a lista declarada na primeira linha."
      },
      {
        id: "card-programacao-pratica",
        resource: "code",
        kind: "exercise",
        exercise: "gap",
        title: "Complete o cálculo",
        prompt: "Considere valores = [4, 7, 9] e complete a expressão que produz total = 20.",
        language: "python",
        code: "valores = [4, 7, 9]\ntotal = [[sum(valores)::sum(valores)|len(valores)|max(valores)]]",
        after: "A soma de 4, 7 e 9 é 20."
      }
    ],
    exerciseEvidence: {
      "card-programacao-pratica": ["[4, 7, 9]", "total = 20"]
    }
  },
  {
    id: "calculo",
    area: "Cálculo e álgebra",
    goal: "Ler uma derivada expressa por uma árvore simbólica.",
    cards: [
      {
        id: "card-calculo-formula",
        resource: "formula",
        kind: "theory",
        exercise: "none",
        title: "Derivada de uma potência",
        prompt: "Observe a derivada de x ao quadrado.",
        notation: "mathematics",
        accessibleText: "A derivada de x ao quadrado é igual a dois x.",
        expression: {
          type: "row",
          children: [
            { type: "fraction", numerator: { type: "identifier", value: "d" }, denominator: { type: "identifier", value: "dx" } },
            { type: "superscript", base: { type: "identifier", value: "x" }, exponent: { type: "number", value: "2" } },
            { type: "operator", value: "=" },
            { type: "number", value: "2" },
            { type: "identifier", value: "x" }
          ]
        },
        after: "A potência desce como coeficiente e o expoente diminui uma unidade."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "quimica",
    area: "Química",
    goal: "Preservar índices químicos sem aceitar marcação livre.",
    cards: [
      {
        id: "card-quimica-formula",
        resource: "formula",
        kind: "theory",
        exercise: "none",
        title: "Molécula de água",
        prompt: "Observe o índice que indica dois átomos de hidrogênio.",
        notation: "chemistry",
        accessibleText: "H dois O: dois átomos de hidrogênio e um átomo de oxigênio.",
        expression: {
          type: "row",
          children: [
            { type: "subscript", base: { type: "identifier", value: "H" }, subscript: { type: "number", value: "2" } },
            { type: "identifier", value: "O" }
          ]
        },
        after: "O índice 2 pertence ao símbolo H; a ausência de índice em O representa uma unidade."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "estatistica",
    area: "Estatística",
    goal: "Comparar medidas de uma amostra apresentada no card.",
    cards: [
      {
        id: "card-estatistica-tabela",
        resource: "table",
        kind: "exercise",
        exercise: "choice",
        title: "Mediana da amostra",
        columns: ["Observação", "Tempo (min)"],
        rows: [["1", "8"], ["2", "9"], ["3", "11"], ["4", "15"], ["5", "27"]],
        question: "Considerando somente os valores 8, 9, 11, 15 e 27, qual é a mediana?",
        options: options("11 minutos", "14 minutos", "15 minutos"),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "Com cinco valores ordenados, a mediana é o terceiro: 11."
      }
    ],
    exerciseEvidence: {
      "card-estatistica-tabela": ["8", "9", "11", "15", "27"]
    }
  },
  {
    id: "algebra-linear",
    area: "Álgebra linear",
    goal: "Ler uma posição em uma matriz fornecida.",
    cards: [
      {
        id: "card-algebra-matriz",
        resource: "matrix",
        kind: "exercise",
        exercise: "choice",
        title: "Entrada da matriz",
        prompt: "Considere A = [[2, 5], [7, 1]], com linhas e colunas numeradas a partir de 1.",
        name: "A",
        values: [["2", "5"], ["7", "1"]],
        highlight: { cells: [[1, 0]] },
        question: "Qual valor ocupa a linha 2 e a coluna 1 da matriz A?",
        options: options("7", "5", "1"),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "Na segunda linha, o primeiro valor é 7."
      }
    ],
    exerciseEvidence: {
      "card-algebra-matriz": ["[[2, 5], [7, 1]]", "linha 2", "coluna 1"]
    }
  },
  {
    id: "redes",
    area: "Teoria dos grafos e redes",
    goal: "Identificar um caminho usando a rede apresentada.",
    cards: [
      {
        layout: "auto",
        id: "card-redes-grafo",
        resource: "graph",
        kind: "exercise",
        exercise: "choice",
        title: "Caminho na rede",
        prompt: "A rede tem as ligações A-B, B-C e A-D; não há outras arestas.",
        vertices: [
          { id: "A", label: "A" },
          { id: "B", label: "B" },
          { id: "C", label: "C" },
          { id: "D", label: "D" }
        ],
        edges: [
          { id: "edge-1", from: "A", to: "B", label: "A-B" },
          { id: "edge-2", from: "B", to: "C", label: "B-C" },
          { id: "edge-3", from: "A", to: "D", label: "A-D" }
        ],
          highlight: { edges: ["edge-1", "edge-2"] },
        question: "Qual sequência forma um caminho de A até C usando apenas as arestas informadas?",
        options: options("A-B-C", "A-D-C", "A-C"),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "A-B e B-C existem; portanto, A-B-C é um caminho."
      }
    ],
    exerciseEvidence: {
      "card-redes-grafo": ["A-B", "B-C", "A-D"]
    }
  },
  {
    id: "geometria-analitica",
    area: "Geometria analítica",
    goal: "Interpretar um vetor no plano cartesiano.",
    cards: [
      {
        id: "card-plano-vetor",
        resource: "plane",
        kind: "exercise",
        exercise: "choice",
        title: "Extremidade do vetor",
        prompt: "O vetor v parte da origem e tem componentes (3, -2).",
        xAxis: { label: "Coordenada x", domain: [-1, 4] },
        yAxis: { label: "Coordenada y", domain: [-3, 2] },
        vectors: [{ id: "v", label: "v", from: [0, 0], to: [3, -2] }],
        question: "Em qual ponto termina v quando sua origem é (0, 0)?",
        options: options("(3, -2)", "(-2, 3)", "(3, 2)"),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "As componentes deslocam três unidades no eixo x e menos duas no eixo y."
      }
    ],
    exerciseEvidence: {
      "card-plano-vetor": ["(3, -2)", "(0, 0)"]
    }
  },
  {
    id: "processos",
    area: "Processos e algoritmos",
    goal: "Seguir uma decisão com dados declarados no fluxo.",
    cards: [
      {
        id: "card-processo-fluxo",
        resource: "flow",
        kind: "exercise",
        exercise: "choice",
        title: "Decisão de inspeção",
        prompt: "Para o lote L-17, a medição é 12 mg/L e o limite é 10 mg/L.",
        structure: {
          id: "fluxo-l17",
          kind: "sequence",
          items: [
            { id: "inicio", kind: "start", text: "Receber medição do lote L-17" },
            {
              id: "decisao",
              kind: "if_then_else",
              condition: "medição > 10 mg/L",
              thenBranch: [{ id: "reter", kind: "process", text: "Reter lote para inspeção" }],
              elseBranch: [{ id: "liberar", kind: "process", text: "Liberar lote" }]
            },
            { id: "fim", kind: "end", text: "Registrar decisão" }
          ]
        },
        question: "Com medição de 12 mg/L, qual ramo é executado?",
        options: options("Reter o lote para inspeção", "Liberar o lote", "Ignorar o registro"),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "Como 12 é maior que 10, o ramo de retenção é executado."
      }
    ],
    exerciseEvidence: {
      "card-processo-fluxo": ["L-17", "12 mg/L", "10 mg/L"]
    }
  },
  {
    id: "biologia",
    area: "Biologia",
    goal: "Ler uma hierarquia taxonômica simples.",
    cards: [
      {
        variant: "taxonomy",
        id: "card-biologia-arvore",
        resource: "tree",
        kind: "theory",
        exercise: "none",
        title: "Hierarquia de primatas",
        prompt: "A árvore mostra uma parte da classificação biológica.",
        nodes: [
          { id: "primates", label: "Ordem Primates", parentId: null },
          { id: "hominidae", label: "Família Hominidae", parentId: "primates" },
          { id: "homo", label: "Gênero Homo", parentId: "hominidae" }
        ],
        after: "O gênero Homo está contido na família Hominidae, que pertence à ordem Primates."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "contabilidade",
    area: "Contabilidade e economia",
    goal: "Relacionar contas a seus grupos usando os pares fornecidos.",
    cards: [
      {
        id: "card-contabilidade-relacoes",
        resource: "relation_map",
        kind: "exercise",
        exercise: "choice",
        title: "Classificação de contas",
        prompt: "Use somente as contas Caixa e Empréstimos e os grupos Ativo e Passivo.",
        leftSet: {
          label: "Contas",
          items: [{ id: "caixa", label: "Caixa" }, { id: "emprestimos", label: "Empréstimos" }]
        },
        rightSet: {
          label: "Grupos",
          items: [{ id: "ativo", label: "Ativo" }, { id: "passivo", label: "Passivo" }]
        },
        relations: [{ from: "caixa", to: "ativo" }, { from: "emprestimos", to: "passivo" }],
        pairList: ["(Caixa, Ativo)", "(Empréstimos, Passivo)"],
        relationTable: { columns: ["Conta", "Grupo"], rows: [["Caixa", "Ativo"], ["Empréstimos", "Passivo"]] },
        question: "Qual par coincide com a classificação apresentada?",
        options: options("Caixa pertence ao Ativo", "Caixa pertence ao Passivo", "Empréstimos pertence ao Ativo"),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "Caixa é um recurso controlado pela entidade; empréstimos representam obrigação."
      }
    ],
    exerciseEvidence: {
      "card-contabilidade-relacoes": ["Caixa", "Empréstimos", "Ativo", "Passivo"]
    }
  },
  {
    id: "linguas-unicode",
    area: "Línguas e sistemas de escrita",
    goal: "Preservar caracteres CJK, grego antigo e diacríticos.",
    cards: [
      {
        id: "card-linguas-unicode",
        resource: "paragraph",
        kind: "exercise",
        exercise: "gap",
        title: "Saudações em diferentes sistemas",
        text: "No conjunto mandarim 你好 (nǐ hǎo), japonês こんにちは (konnichiwa) e grego antigo χαῖρε (khaîre), a forma japonesa é [[こんにちは::こんにちは|你好|χαῖρε]].",
        after: "こんにちは é a forma japonesa apresentada no enunciado."
      }
    ],
    exerciseEvidence: {
      "card-linguas-unicode": ["你好", "nǐ hǎo", "こんにちは", "χαῖρε", "khaîre"]
    }
  },
  {
    id: "texto-rtl",
    area: "Escritas da direita para a esquerda",
    goal: "Renderizar texto bidirecional sem controles invisíveis fornecidos pelo conteúdo.",
    cards: [
      {
        id: "card-texto-rtl",
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Correspondência em árabe",
        question: "No próprio enunciado: كتاب (kitāb) significa livro; قلم (qalam) significa caneta. Qual termo significa livro?",
        options: options("O primeiro termo", "O segundo termo", "O terceiro termo"),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "كتاب é o termo apresentado com o significado de livro."
      }
    ],
    exerciseEvidence: {
      "card-texto-rtl": ["كتاب", "kitāb", "قلم", "qalam"]
    }
  },
  {
    id: "direito-administracao",
    area: "Direito e administração",
    goal: "Decidir com base em um caso integralmente descrito.",
    cards: [
      {
        id: "card-administracao-principio",
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Segregação de funções",
        text: "A segregação de funções distribui autorização, execução e conferência entre pessoas ou papéis distintos para reduzir erro e fraude.",
        after: "A divisão evita que uma única pessoa controle todas as etapas críticas."
      },
      {
        id: "card-direito-caso",
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Decisão motivada",
        question: "No processo P-204, a autoridade negou o pedido apenas com a frase 'indeferido', embora a norma exija indicação dos fatos e fundamentos. Qual providência atende à exigência descrita?",
        options: options(
          "Registrar os fatos considerados e os fundamentos da decisão",
          "Manter apenas a palavra indeferido",
          "Apagar o processo P-204"
        ),
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: "A motivação torna explícitos os fatos e fundamentos usados na decisão."
      }
    ],
    exerciseEvidence: {
      "card-direito-caso": ["P-204", "fatos", "fundamentos"]
    }
  },
  {
    id: "engenharia-ambiental",
    area: "Engenharia ambiental",
    goal: "Integrar dados, critério e decisão em um único card composto.",
    cards: [
      {
        id: "card-ambiental-composto",
        resource: "composite",
        kind: "exercise",
        exercise: "choice",
        title: "Avaliação do ponto R-3",
        blocks: [
          { id: "heading-1", kind: "heading", value: "Amostra R-3" },
          { id: "paragraph-1", kind: "paragraph", value: "A amostra R-3 apresentou pH 5,2. O intervalo operacional informado para este exercício é de 6,0 a 9,0." },
          { id: "table-1", kind: "table", columns: ["Dado", "Valor"], rows: [["pH medido", "5,2"], ["mínimo", "6,0"], ["máximo", "9,0"]] },
          {
            id: "choice-1",
            kind: "choice",
            question: "Qual decisão decorre exclusivamente dos dados apresentados?",
            options: options("Investigar a acidez de R-3", "Classificar R-3 como dentro do intervalo", "Ignorar a medição"),
            selectionMode: "single",
            selectionCriterion: "correct",
            answerIds: ["a"]
          }
        ],
        after: "O valor 5,2 está abaixo do mínimo informado, 6,0."
      }
    ],
    exerciseEvidence: {
      "card-ambiental-composto": ["R-3", "5,2", "6,0", "9,0"]
    }
  },
  {
    id: "estatistica-climatica",
    area: "Estatística climática",
    goal: "Interpretar uma tendência temporal em uma visualização de dados autocontida.",
    cards: [
      {
        id: "card-grafico-temperatura",
        resource: "chart",
        kind: "theory",
        exercise: "none",
        title: "Anomalia térmica anual",
        prompt: "Observe a evolução da anomalia térmica média entre 2022 e 2025.",
        chartType: "line",
        xAxis: { label: "Ano", unit: "ano", type: "quantitative", domain: [2022, 2025] },
        yAxis: { label: "Anomalia", unit: "°C", type: "quantitative", domain: [0, 1] },
        series: [
          {
            id: "serie-anomalia",
            name: "Anomalia térmica",
            values: [{ x: 2022, y: 0.2 }, { x: 2023, y: 0.4 }, { x: 2024, y: 0.7 }, { x: 2025, y: 0.8 }]
          }
        ],
        after: "A série cresce em todos os intervalos e atinge 0,8 °C em 2025."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "historia-processual",
    area: "História e processos",
    goal: "Representar uma cadeia de acontecimentos com ordem e relações explícitas.",
    cards: [
      {
        id: "card-sequencia-imprensa",
        resource: "sequence",
        kind: "theory",
        exercise: "none",
        title: "Circulação de um impresso",
        prompt: "Acompanhe a sequência simplificada de produção e circulação.",
        variant: "timeline",
        items: [
          { id: "compor", label: "Composição", detail: "Os tipos móveis são organizados." },
          { id: "imprimir", label: "Impressão", detail: "A prensa transfere o texto ao papel." },
          { id: "distribuir", label: "Distribuição", detail: "Os exemplares chegam aos leitores." }
        ],
        highlight: { itemIds: ["imprimir"] },
        after: "A impressão ocupa a etapa intermediária entre composição e distribuição."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "leitura-argumentativa",
    area: "Leitura e argumentação",
    goal: "Relacionar trechos delimitados de um texto às funções argumentativas anotadas.",
    cards: [
      {
        id: "card-texto-anotado",
        resource: "annotated_text",
        kind: "theory",
        exercise: "none",
        title: "Partes de um argumento",
        prompt: "Leia o enunciado e examine a função indicada para cada segmento.",
        segments: [
          { id: "segmento-tese", text: "A biblioteca deve ampliar o horário." },
          { id: "segmento-razao", text: "Muitos estudantes trabalham durante o dia." }
        ],
        annotations: [
          { id: "anotacao-tese", targetIds: ["segmento-tese"], label: "Tese", note: "Apresenta a proposta defendida." },
          { id: "anotacao-razao", targetIds: ["segmento-razao"], label: "Razão", note: "Oferece apoio à tese." }
        ],
        after: "A primeira sentença formula a tese; a segunda oferece uma razão."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "linguistica-interlinear",
    area: "Linguística e línguas",
    goal: "Alinhar forma, segmentação, glosa e tradução sem perder a direção de escrita.",
    cards: [
      {
        id: "card-exemplo-linguistico",
        resource: "interlinear_gloss",
        kind: "theory",
        exercise: "none",
        title: "Exemplo interlinear em português",
        prompt: "Compare as unidades da oração com suas glosas.",
        languageTag: "pt-BR",
        units: [
          { id: "unidade-1", form: "A-s", gloss: "DET-PL" },
          { id: "unidade-2", form: "criança-s", gloss: "criança-PL" },
          { id: "unidade-3", form: "brinc-a-m", gloss: "brincar-PRS-3PL" }
        ],
        translation: "As crianças brincam.",
        abbreviations: [
          { code: "DET", meaning: "determinante" },
          { code: "PL", meaning: "plural" },
          { code: "PRS", meaning: "presente" },
          { code: "3PL", meaning: "terceira pessoa do plural" }
        ],
        after: "A segmentação mantém cada forma alinhada à glosa e à tradução."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "arquitetura-sistemas",
    area: "Arquitetura de sistemas",
    goal: "Preservar limites, pertencimento e conexões de uma arquitetura lógica.",
    cards: [
      {
        id: "card-arquitetura-mapa-sistema",
        resource: "system_map",
        kind: "theory",
        exercise: "none",
        title: "Fluxo de uma solicitação",
        prompt: "Observe os componentes, seus limites e as conexões identificadas.",
        groups: [
          {
            id: "rede-producao",
            label: "Rede de produção",
            kind: "network",
            parentId: null
          },
          {
            id: "espaco-aplicacao",
            label: "Espaço da aplicação",
            kind: "namespace",
            parentId: "rede-producao"
          }
        ],
        nodes: [
          {
            id: "cliente-web",
            label: "Cliente web",
            kind: "client",
            groupId: null
          },
          {
            id: "gateway-publico",
            label: "Gateway público",
            kind: "gateway",
            groupId: "rede-producao"
          },
          {
            id: "servico-pedidos",
            label: "Serviço de pedidos",
            kind: "service",
            groupId: "espaco-aplicacao"
          },
          {
            id: "banco-pedidos",
            label: "Banco de pedidos",
            kind: "database",
            groupId: "espaco-aplicacao"
          }
        ],
        links: [
          {
            id: "entrada",
            from: "cliente-web",
            to: "gateway-publico",
            label: "HTTPS",
            directed: true
          },
          {
            id: "roteamento",
            from: "gateway-publico",
            to: "servico-pedidos",
            label: "requisição",
            directed: true
          },
          {
            id: "persistencia",
            from: "servico-pedidos",
            to: "banco-pedidos",
            label: "gravação",
            directed: true
          }
        ],
        highlight: {
          groupIds: ["espaco-aplicacao"],
          nodeIds: ["servico-pedidos"],
          linkIds: ["roteamento"]
        },
        after: "A solicitação atravessa o gateway, chega ao serviço dentro do espaço da aplicação e então alcança o banco."
      }
    ],
    exerciseEvidence: {}
  },
  {
    id: "quimica-reacao",
    area: "Química de reações",
    goal: "Representar reagentes, produtos, coeficientes, estados e condições sem marcação livre.",
    cards: [
      {
        id: "card-quimica-reacao-agua",
        resource: "reaction",
        kind: "theory",
        exercise: "none",
        title: "Formação de água",
        prompt: "Leia a equação química balanceada e os estados físicos indicados.",
        reactionType: "forward",
        reactants: [
          {
            id: "hidrogenio",
            formula: "H2",
            name: "hidrogênio",
            coefficient: 2,
            state: "g",
            charge: 0
          },
          {
            id: "oxigenio",
            formula: "O2",
            name: "oxigênio",
            coefficient: 1,
            state: "g",
            charge: 0
          }
        ],
        products: [
          {
            id: "agua",
            formula: "H2O",
            name: "água",
            coefficient: 2,
            state: "l",
            charge: 0
          }
        ],
        conditions: ["ignição controlada"],
        highlight: {
          speciesIds: ["agua"]
        },
        after: "Dois mols de hidrogênio reagem com um mol de oxigênio e formam dois mols de água."
      }
    ],
    exerciseEvidence: {}
  }
];

function normalizeScenario(scenario) {
  return {
    ...scenario,
    cards: scenario.cards.map((card, index) => ({ ...card, position: index + 1 }))
  };
}

export const DISCIPLINARY_SCENARIOS = Object.freeze(scenarios.map(normalizeScenario));

export function buildDisciplinaryScenarioProject() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [
      {
        id: "course-disciplinary-scenarios",
        title: "Matriz disciplinar",
        goal: "Verificar recursos didáticos em diferentes áreas do conhecimento.",
        modules: [
          {
            id: "module-disciplinary-scenarios",
            title: "Cenários",
            guide: {
              goal: "Preservar conteúdo estruturado, internacional e autocontido.",
              include: DISCIPLINARY_SCENARIOS.map((scenario) => scenario.area),
              exclude: ["dependência de dados de cards anteriores"],
              notation: ["Preservar Unicode e notação estruturada."],
              avoid: ["Não inserir HTML livre."]
            },
            lessons: [
              {
                id: "lesson-disciplinary-scenarios",
                title: "Recursos por área",
                guide: {
                  goal: "Exercitar cada recurso com dados suficientes no próprio card.",
                  include: DISCIPLINARY_SCENARIOS.map((scenario) => scenario.area),
                  exclude: ["referências a exemplos anteriores"],
                  notation: ["Usar os símbolos próprios de cada área."],
                  avoid: ["Não depender de conteúdo externo ao card."]
                },
                topics: [],
                microsequences: DISCIPLINARY_SCENARIOS.map((scenario) => ({
                  id: `micro-${scenario.id}`,
                  title: scenario.area,
                  goal: scenario.goal,
                  role: "practice",
                  status: "ready",
                  dependsOn: [],
                  covers: [scenario.id],
                  checks: [`o aluno realiza a operação proposta em ${scenario.area}`],
                  cards: structuredClone(scenario.cards)
                }))
              }
            ]
          }
        ]
      }
    ]
  };
}
