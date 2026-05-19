export function createMatematicaInformaticaGraphScopeContract() {
  return {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Matemática para Informática",
      goal: "Levar um estudante iniciante a resolver a lista introdutória de Teoria dos Grafos no estilo esperado em prova.",
      evidencePriority: ["notebook", "exercise_list", "exam"]
    },
    modules: [
      {
        title: "Teoria dos Grafos",
        include: [
          "pontes de Königsberg e modelagem por grafos",
          "definição formal de grafo",
          "vértices, arestas, adjacência e incidência",
          "grau de vértice e lista de graus",
          "soma dos graus",
          "número par de vértices de grau ímpar",
          "teste de listas de graus",
          "grafos isomorfos",
          "grafo completo",
          "fórmula de arestas de K_n",
          "grafos regulares",
          "grafo bipartido e bipartido completo",
          "matriz de adjacência",
          "passeio, trilha, caminho e ciclo",
          "menor caminho por Dijkstra",
          "grafos eulerianos e semieulerianos"
        ],
        exclude: [
          "grafos direcionados",
          "planaridade",
          "fórmula de Euler para planares",
          "coloração",
          "cliques",
          "acoplamentos",
          "Hamiltoniano",
          "caixeiro viajante",
          "árvores geradoras",
          "árvore geradora mínima",
          "algoritmo de Fleury",
          "complexidade em profundidade",
          "redes neurais",
          "Word2Vec"
        ],
        notes: [
          "Partir de problemas concretos, como as pontes de Königsberg, antes da formalização.",
          "Cada microssequência deve conter ideia central, treino guiado e consolidação próximos do formato da lista.",
          "Explicitar conjunto de vértices, conjunto de arestas, lista de graus, soma dos graus e conclusão simples quando o exercício exigir.",
          "Usar desenho de grafo, tabela de graus, matriz de adjacência e tabela de Dijkstra quando isso reduzir pressupostos ocultos.",
          "Não antecipar Dijkstra antes de caminho e grafo ponderado, nem Euleriano antes de trilha e grau."
        ].join(" "),
        assessmentStyle: "mixed"
      }
    ]
  };
}

export function createMatematicaInformaticaFullScopeContract() {
  return {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Matemática para Informática",
      goal: "Cobrir lógica proposicional, vetores, matrizes e teoria dos grafos com foco em resolução manual de exercícios típicos.",
      evidencePriority: ["notebook", "exercise_list", "exam"]
    },
    modules: [
      {
        title: "Lógica Proposicional",
        include: [
          "proposições",
          "conectivos",
          "tabelas-verdade",
          "equivalências lógicas",
          "leis de De Morgan",
          "implicação",
          "contrapositiva",
          "XOR",
          "bicondicional",
          "detecção de equivalência falsa"
        ],
        exclude: ["lógica de predicados"],
        notes: "Professor cobra resolução passo a passo e comparação entre expressões por linha divergente.",
        assessmentStyle: "mixed"
      },
      {
        title: "Vetores e Matrizes",
        include: [
          "vetor como lista e como seta",
          "soma de vetores",
          "multiplicação por escalar",
          "módulo",
          "distância",
          "produto escalar",
          "ortogonalidade",
          "cosseno",
          "matriz como arranjo",
          "transformações simples",
          "composição",
          "inversa em casos introdutórios"
        ],
        exclude: [],
        notes: "Preservar representação visual e aproximar o formato do app da forma como o estudante resolve no caderno.",
        assessmentStyle: "mixed"
      },
      ...createMatematicaInformaticaGraphScopeContract().modules
    ]
  };
}
