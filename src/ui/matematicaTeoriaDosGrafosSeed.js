export const matematicaTeoriaDosGrafosModule = {
  "key": "module-teoria-dos-grafos",
  "title": "Teoria dos Grafos",
  "include": [
    "pontes de Königsberg e modelagem por grafos",
    "definição formal de grafo",
    "vértices, arestas, adjacência e incidência",
    "grau de vértice e sequência de graus",
    "soma dos graus e paridade",
    "número par de vértices de grau ímpar",
    "teste de listas de graus",
    "grafos isomorfos",
    "grafo completo",
    "fórmula de arestas de K_n",
    "grafos regulares",
    "grafo bipartido",
    "grafo bipartido completo",
    "matriz de adjacência",
    "passeio, trilha, caminho e ciclo",
    "menor caminho por Dijkstra",
    "grafos eulerianos e semieulerianos"
  ],
  "exclude": [
    "grafos direcionados",
    "planaridade",
    "redes neurais",
    "Word2Vec",
    "coloração",
    "Hamiltoniano",
    "árvore geradora mínima",
    "algoritmo de Fleury"
  ],
  "notes": "## BSI Grafos.pdf Mostre que um grafo sempre possui um número par de vértices de grau ímpar, conforme demonstrado em sala de aula. Qual é a fórmula que relaciona o número de arestas de um grafo com o número de vértices? Quais das listas abaixo representam grafos? a) {3,2,2,1} b) {3,3,3,2} c) {1,2,3,1} d) {2,2,1,1} 4) Segundo o material estudado em sala, qual é a definição de grafo isomorfo? 5) Desenhe um grafo completo. 6) Qual é a fórmula, usando combinações, utilizada para encontrar o número de arestas em um grafo completo com n vértices ( Kn )? 7) Quantos vértices um grafo completo precisa ter para possuir 380 arestas? 8) É possível construir um grafo 3-regular com 5 vértices? 9) Construa o grafo cuja lista de graus é {2, 2, 2, 1, 1}. Esse grafo é bipartido? 10) Construa um grafo bipartido completo qualquer. 11) Dada a matriz de adjacência: 0 1 1 1 1 0 1 0 1 1 0 1 1 0 1 0. a) Desenhe o gráfico. b) Esse grafo é bipartido? c) Desenhe um subgrafo que represente uma trilha. d) Desenhe um subgrafo que represente um caminho. Dada a Matriz de adjacência, qual o menor caminho do vértice A até o vértice F? A B C D E F A 0 2 1 0 0 0 B 2 0 0 4 5 0 C 1 0 0 3 0 8 D 0 4 3 0 6 0 E 0 5 0 6 0 1 F 0 0 8 0 1 0 Qual a definição de grafo Euleriano? Marque as afirmações como falsas ou verdadeiras a) Se todo vértice de um grafo tem grau maior ou igual a 2, então o grafo contém ciclos. b) Um grafo conexo com grau par em todos os vértices é euleriano. c) Um grafo conexo e semi euleriano tem no máximo dois vértices com grau ímpar?",
  "assessmentStyle": "mixed",
  "lessons": [
    {
      "key": "lesson-modelagem-e-definicao-de-grafos",
      "title": "Modelagem e definição de grafos",
      "description": "Representar situações simples como grafos e identificar seus elementos formais.",
      "sourceGuideStructured": {
        "lessonGoal": "Representar situações simples como grafos e identificar seus elementos formais.",
        "notationRules": "Usar apenas pontes de Königsberg e modelagem por grafos; definição formal de grafo; vértices, arestas, adjacência e incidência.",
        "commonErrors": "Não confundir vértice com aresta nem adjacência com incidência.",
        "outOfScopeRules": "grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury"
      },
      "sourceGuide": "Meta da lição: Representar situações simples como grafos e identificar seus elementos formais.\nIncluir: Usar apenas pontes de Königsberg e modelagem por grafos; definição formal de grafo; vértices, arestas, adjacência e incidência.\nNão incluir: grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury\nNão confundir com: Não confundir vértice com aresta nem adjacência com incidência.",
      "microsequences": [
        {
          "key": "microsequence-modelar-as-pontes-de-konigsberg",
          "title": "Modelar as pontes de Königsberg",
          "description": "Transformar regiões e pontes em vértices e arestas de um grafo.",
          "tags": [
            "pontes de Königsberg e modelagem por grafos"
          ],
          "didacticPurpose": "Transformar regiões e pontes em vértices e arestas de um grafo.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "konigsberg-grafo-local",
              "title": "Modelo das pontes de Königsberg",
              "after": "Observe que o desenho não precisa copiar o mapa real: ele guarda apenas quais regiões estão ligadas por pontes.",
              "graph": {
                "vertices": [
                  {
                    "id": "N",
                    "label": "Margem norte",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "S",
                    "label": "Margem sul",
                    "x": 0,
                    "y": 4
                  },
                  {
                    "id": "I1",
                    "label": "Ilha central",
                    "x": 3,
                    "y": 1.4
                  },
                  {
                    "id": "I2",
                    "label": "Ilha leste",
                    "x": 6,
                    "y": 2.2
                  }
                ],
                "edges": [
                  {
                    "from": "N",
                    "to": "I1",
                    "weight": 1,
                    "label": "ponte 1"
                  },
                  {
                    "from": "N",
                    "to": "I1",
                    "weight": 1,
                    "label": "ponte 2"
                  },
                  {
                    "from": "S",
                    "to": "I1",
                    "weight": 1,
                    "label": "ponte 3"
                  },
                  {
                    "from": "S",
                    "to": "I1",
                    "weight": 1,
                    "label": "ponte 4"
                  },
                  {
                    "from": "N",
                    "to": "I2",
                    "weight": 1,
                    "label": "ponte 5"
                  },
                  {
                    "from": "S",
                    "to": "I2",
                    "weight": 1,
                    "label": "ponte 6"
                  },
                  {
                    "from": "I1",
                    "to": "I2",
                    "weight": 1,
                    "label": "ponte 7"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "N",
                    "S",
                    "I1",
                    "I2"
                  ],
                  "edges": [
                    [
                      "N",
                      "I1"
                    ],
                    [
                      "S",
                      "I1"
                    ],
                    [
                      "N",
                      "I2"
                    ],
                    [
                      "S",
                      "I2"
                    ],
                    [
                      "I1",
                      "I2"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-do-modelo",
              "title": "Leitura didática",
              "after": "A ideia central é simples: região vira ponto; ponte vira ligação.",
              "say": "Para modelar as pontes de Königsberg, trocamos cada região de terra por um vértice. Cada ponte vira uma aresta ligando os dois vértices das regiões que ela conecta. Se duas regiões têm mais de uma ponte entre elas, aparecem mais de uma aresta entre o mesmo par de vértices. Nesta etapa, o objetivo é montar o modelo, não resolver ainda uma rota."
            },
            {
              "key": "tabela-prova-modelagem",
              "title": "O que cada parte representa",
              "after": "Essa tabela é útil em prova porque ajuda a justificar por que o desenho é um grafo do problema.",
              "table": {
                "columns": [
                  "No problema real",
                  "No grafo",
                  "Como conferir"
                ],
                "rows": [
                  [
                    "Região de terra",
                    "Vértice",
                    "Cada região deve aparecer uma única vez como ponto."
                  ],
                  [
                    "Ponte",
                    "Aresta",
                    "Cada ponte deve aparecer uma única vez como ligação."
                  ],
                  [
                    "Duas pontes entre as mesmas regiões",
                    "Duas arestas entre os mesmos vértices",
                    "Não junte pontes diferentes em uma só ligação."
                  ],
                  [
                    "Ponte encostando em uma região",
                    "Aresta ligada ao vértice dessa região",
                    "A ligação deve tocar exatamente os vértices das duas regiões conectadas."
                  ]
                ]
              }
            },
            {
              "key": "treino-guiado-koningberg",
              "title": "Complete o raciocínio",
              "after": "As respostas esperadas reforçam a tradução direta entre situação real e grafo.",
              "say": "No modelo das pontes de Königsberg, cada região de terra é representada por um [[vértice::ponto|nó]]. Cada ponte é representada por uma [[aresta::ligação|ponte no desenho]]. Se uma ponte liga a margem norte à ilha central, então a aresta deve ligar os vértices [[margem norte e ilha central::margem norte e margem sul|ilha central e ilha leste]]."
            },
            {
              "key": "consolidacao-formato-lista",
              "title": "Exercício de consolidação",
              "after": "Resposta esperada: os vértices são as regiões; as arestas são as pontes; uma ponte vira aresta porque ela conecta duas regiões.",
              "say": "Responda no formato da lista: Dado o caso das pontes de Königsberg, represente o problema como um grafo. Primeiro, nomeie os vértices como regiões de terra. Depois, indique as arestas como pontes entre essas regiões. Por fim, explique em uma frase por que cada ponte deve virar uma aresta, e não um vértice."
            }
          ],
          "dependsOn": []
        },
        {
          "key": "microsequence-escrever-a-definicao-formal",
          "title": "Escrever a definição formal",
          "description": "Descrever um grafo por conjunto de vértices e conjunto de arestas.",
          "tags": [
            "definição formal de grafo"
          ],
          "didacticPurpose": "Descrever um grafo por conjunto de vértices e conjunto de arestas.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "formal-graph-caso-local",
              "title": "Caso local em grafo",
              "after": "Este desenho representa um caso simples de modelagem: regiões viram vértices, e pontes entre regiões viram arestas.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "Região A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "Região B",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "Região C",
                    "x": 1,
                    "y": 1.5
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "p1"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "p2"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "p3"
                  }
                ]
              }
            },
            {
              "key": "formal-graph-leitura",
              "title": "Leitura formal do desenho",
              "after": "A escrita formal troca o desenho por uma descrição precisa em conjuntos.",
              "say": "Para escrever a definição formal, damos um nome ao grafo e listamos seus dois conjuntos principais. Neste caso: G = (V, E), com V = {A, B, C} e E = {{A,B}, {B,C}, {A,C}}. O conjunto V guarda os vértices; o conjunto E guarda as arestas, cada uma escrita como um par de vértices."
            },
            {
              "key": "formal-graph-tabela-prova",
              "title": "Como montar a resposta",
              "after": "Em prova ou exercício, a resposta completa precisa mostrar os dois conjuntos, não apenas o desenho.",
              "table": {
                "columns": [
                  "Parte da resposta",
                  "O que escrever",
                  "No caso local"
                ],
                "rows": [
                  [
                    "Nome do grafo",
                    "Use uma letra, geralmente G",
                    "G"
                  ],
                  [
                    "Conjunto de vértices",
                    "Liste todos os pontos do grafo",
                    "V = {A, B, C}"
                  ],
                  [
                    "Conjunto de arestas",
                    "Liste os pares ligados por arestas",
                    "E = {{A,B}, {B,C}, {A,C}}"
                  ],
                  [
                    "Definição completa",
                    "Junte nome, vértices e arestas",
                    "G = (V, E)"
                  ]
                ]
              }
            },
            {
              "key": "formal-graph-lacunas",
              "title": "Complete a definição",
              "after": "Atenção: vértices aparecem sozinhos em V; arestas aparecem como pares dentro de E.",
              "say": "Um grafo pode ser descrito formalmente como G = [[(V, E)::(V, E)|V + E]], em que V é o conjunto de [[vértices::vértices|arestas]] e E é o conjunto de [[arestas::arestas|vértices]]. No caso com V = {A, B, C}, se A está ligado a B e B está ligado a C, então uma escrita possível é E = [[{{A,B}, {B,C}}::{{A,B}, {B,C}}|{A, B, C}]]."
            },
            {
              "key": "formal-graph-consolidacao-lista",
              "title": "Treino no formato da lista",
              "after": "Esta etapa fecha a definição formal: um grafo fica descrito por conjunto de vértices e conjunto de arestas.",
              "say": "Exercício: descreva formalmente o grafo com vértices A, B, C e D, e arestas entre A e B, A e C, C e D. Resposta esperada: G = (V, E), V = {A, B, C, D} e E = {{A,B}, {A,C}, {C,D}}. Linguagem manual: primeiro escreva quem são os vértices; depois escreva quais pares formam as arestas; por fim, apresente G = (V, E)."
            }
          ],
          "dependsOn": [
            "microsequence-modelar-as-pontes-de-konigsberg"
          ]
        },
        {
          "key": "microsequence-identificar-relacoes-basicas",
          "title": "Identificar relações básicas",
          "description": "Distinguir vértices, arestas, adjacência e incidência em um desenho ou descrição.",
          "tags": [
            "vértices, arestas, adjacência e incidência"
          ],
          "didacticPurpose": "Distinguir vértices, arestas, adjacência e incidência em um desenho ou descrição.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "card-1-grafo-local",
              "title": "Caso local: vértices e arestas",
              "after": "Observe que B está destacado porque participa de duas arestas: uma com C e outra com D.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 1,
                    "y": 1.5
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 3,
                    "y": 1.5
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "e1"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "e2"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "e3"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "label": "e4"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "B"
                  ],
                  "edges": [
                    [
                      "B",
                      "C"
                    ],
                    [
                      "B",
                      "D"
                    ]
                  ]
                }
              }
            },
            {
              "key": "card-2-leitura-didatica",
              "title": "Como ler o desenho",
              "after": "A leitura correta separa objeto de relação: vértice é ponto, aresta é ligação, adjacência é relação entre vértices e incidência é relação entre aresta e vértice.",
              "say": "No grafo mostrado, A, B, C e D são vértices. As ligações AB, AC, BC e BD são arestas. Dois vértices são adjacentes quando existe uma aresta ligando um ao outro. Uma aresta é incidente aos vértices que ela liga. Por exemplo, a aresta BD é incidente a B e a D; por isso, B e D são adjacentes."
            },
            {
              "key": "card-3-tabela-prova",
              "title": "Relações que costumam cair",
              "after": "Para responder exercícios, procure primeiro a aresta desenhada ou descrita. Se ela existe, os dois vértices das extremidades são adjacentes; a própria aresta é incidente a essas extremidades.",
              "table": {
                "columns": [
                  "Pergunta",
                  "Resposta no grafo do card 1",
                  "Motivo"
                ],
                "rows": [
                  [
                    "B e C são adjacentes?",
                    "Sim",
                    "Existe a aresta BC."
                  ],
                  [
                    "C e D são adjacentes?",
                    "Não",
                    "Não existe aresta CD."
                  ],
                  [
                    "A aresta AB é incidente a quais vértices?",
                    "A e B",
                    "A aresta AB liga exatamente A a B."
                  ],
                  [
                    "A aresta BD é incidente a C?",
                    "Não",
                    "BD liga B a D, não passa por C."
                  ],
                  [
                    "Quais arestas são incidentes a B?",
                    "AB, BC e BD",
                    "Todas essas arestas têm B como uma das extremidades."
                  ]
                ]
              }
            },
            {
              "key": "card-4-treino-guiado",
              "title": "Complete as relações",
              "after": "Use as lacunas para fixar a diferença principal: adjacência compara vértice com vértice; incidência relaciona aresta com vértice.",
              "say": "No grafo com V = {A, B, C, D} e E = {AB, AC, BC, BD}, os vértices A e C são [[adjacentes::adjacentes|incidentes]], pois existe a aresta AC. A aresta BC é [[incidente::incidente|adjacente]] aos vértices B e C. Os vértices C e D [[não são adjacentes::não são adjacentes|são adjacentes]], pois não existe a aresta CD. Arestas ligam [[vértices::vértices|arestas]], enquanto vértices podem ser adjacentes entre si."
            },
            {
              "key": "card-5-consolidacao-lista",
              "title": "Consolidação no formato de lista",
              "after": "Fechamento: em qualquer desenho ou descrição, leia primeiro os conjuntos V e E. Depois, teste adjacência procurando uma aresta entre dois vértices e teste incidência olhando as extremidades de uma aresta.",
              "say": "Considere o grafo definido por V = {P, Q, R, S} e E = {PQ, PR, QS}. Responda manualmente: a) Quais são os vértices? b) Quais são as arestas? c) P e Q são adjacentes? d) R e S são adjacentes? e) A aresta PR é incidente a quais vértices? f) Quais arestas são incidentes a Q? Gabarito: a) P, Q, R, S. b) PQ, PR, QS. c) Sim. d) Não. e) P e R. f) PQ e QS."
            }
          ],
          "dependsOn": [
            "microsequence-escrever-a-definicao-formal"
          ]
        }
      ]
    },
    {
      "key": "lesson-graus-e-listas-de-graus",
      "title": "Graus e listas de graus",
      "description": "Calcular graus, aplicar a soma dos graus e testar listas de graus em exercícios curtos.",
      "sourceGuideStructured": {
        "lessonGoal": "Calcular graus, aplicar a soma dos graus e testar listas de graus em exercícios curtos.",
        "notationRules": "Usar apenas grau de vértice e sequência de graus; soma dos graus e paridade; número par de vértices de grau ímpar; teste de listas de graus.",
        "commonErrors": "Não aceitar lista de graus com soma ímpar ou quantidade ímpar de graus ímpares.",
        "outOfScopeRules": "grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury"
      },
      "sourceGuide": "Meta da lição: Calcular graus, aplicar a soma dos graus e testar listas de graus em exercícios curtos.\nIncluir: Usar apenas grau de vértice e sequência de graus; soma dos graus e paridade; número par de vértices de grau ímpar; teste de listas de graus.\nNão incluir: grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury\nNão confundir com: Não aceitar lista de graus com soma ímpar ou quantidade ímpar de graus ímpares.",
      "microsequences": [
        {
          "key": "microsequence-calcular-graus-de-vertices",
          "title": "Calcular graus de vértices",
          "description": "Contar o grau de cada vértice e montar a sequência de graus.",
          "tags": [
            "grau de vértice e sequência de graus"
          ],
          "didacticPurpose": "Contar o grau de cada vértice e montar a sequência de graus.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "grafo-caso-local-graus",
              "title": "Caso local: contar arestas em cada vértice",
              "after": "Observe cada vértice e conte quantas arestas encostam nele.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 1
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 1,
                    "y": 2
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 2,
                    "y": 1
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "E",
                    "label": "E",
                    "x": 3,
                    "y": 0
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "AB"
                  },
                  {
                    "from": "A",
                    "to": "D",
                    "label": "AD"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "BC"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "label": "BD"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "CD"
                  },
                  {
                    "from": "C",
                    "to": "E",
                    "label": "CE"
                  }
                ]
              }
            },
            {
              "key": "leitura-didatica-do-grafo",
              "title": "Como ler o grau",
              "after": "Agora a contagem será organizada em tabela.",
              "say": "O grau de um vértice é a quantidade de arestas que chegam a ele. No grafo mostrado, não importa a posição do vértice no desenho: importa apenas contar as ligações que encostam nele. Por exemplo, em B encostam as arestas AB, BC e BD; por isso, o grau de B é 3."
            },
            {
              "key": "tabela-contagem-de-graus",
              "title": "Contagem organizada",
              "after": "A tabela transforma o desenho em uma lista de graus.",
              "table": {
                "columns": [
                  "Vértice",
                  "Arestas incidentes",
                  "Grau"
                ],
                "rows": [
                  [
                    "A",
                    "AB, AD",
                    "2"
                  ],
                  [
                    "B",
                    "AB, BC, BD",
                    "3"
                  ],
                  [
                    "C",
                    "BC, CD, CE",
                    "3"
                  ],
                  [
                    "D",
                    "AD, BD, CD",
                    "3"
                  ],
                  [
                    "E",
                    "CE",
                    "1"
                  ]
                ]
              }
            },
            {
              "key": "sequencia-de-graus-do-caso",
              "title": "Sequência de graus",
              "after": "Use a mesma leitura para completar as lacunas.",
              "say": "A sequência de graus é a lista formada pelos graus dos vértices. Usando a ordem A, B, C, D, E, temos: A = 2, B = 3, C = 3, D = 3, E = 1. Assim, a sequência de graus nessa ordem é {2, 3, 3, 3, 1}. Se o exercício pedir em ordem decrescente, escreva {3, 3, 3, 2, 1}."
            },
            {
              "key": "treino-guiado-lacunas",
              "title": "Treino guiado",
              "after": "Feche conferindo se cada número veio de uma contagem no desenho.",
              "say": "No grafo do caso local, o vértice A tem grau [[2::1|2|3]], pois nele encostam as arestas [[AB e AD::AB e BC|AB e AD|BD e CD]]. O vértice E tem grau [[1::1|2|3]], pois nele encosta apenas a aresta [[CE::AD|BD|CE]]. Na ordem A, B, C, D, E, a sequência de graus é [[{2, 3, 3, 3, 1}::{2, 3, 3, 3, 1}|{3, 3, 3, 2, 1}|{2, 2, 3, 3, 1}]]."
            },
            {
              "key": "consolidacao-formato-lista",
              "title": "Consolidação",
              "say": "Para resolver exercícios desse tipo, faça sempre o mesmo procedimento: escolha um vértice, conte as arestas que encostam nele, anote o grau e repita até terminar todos os vértices. Depois junte os graus em uma sequência. A resposta deve mostrar claramente de onde veio cada número."
            }
          ],
          "dependsOn": []
        },
        {
          "key": "microsequence-aplicar-a-soma-dos-graus",
          "title": "Aplicar a soma dos graus",
          "description": "Relacionar a soma dos graus ao dobro do número de arestas.",
          "tags": [
            "soma dos graus e paridade"
          ],
          "didacticPurpose": "Relacionar a soma dos graus ao dobro do número de arestas.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "grafo-caso-local-soma-dos-graus",
              "title": "Caso local: contar graus e arestas",
              "after": "Este grafo tem 4 arestas. A leitura didática será comparar esse número com a soma dos graus dos vértices.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 1,
                    "y": 1.5
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 3,
                    "y": 1.5
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "e1"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "e2"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "e3"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "label": "e4"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "A",
                      "C"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "B",
                      "D"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-do-caso-local",
              "title": "Leitura do mesmo grafo",
              "after": "A ideia central é: contar graus soma pontas de arestas, não arestas isoladas.",
              "say": "No grafo mostrado, contamos o grau de cada vértice: A toca 2 arestas, B toca 3 arestas, C toca 2 arestas e D toca 1 aresta. A soma dos graus é 2 + 3 + 2 + 1 = 8. Como o grafo tem 4 arestas, temos 8 = 2 x 4. Cada aresta aparece duas vezes na contagem dos graus: uma em cada ponta."
            },
            {
              "key": "tabela-contagem-graus-arestas",
              "title": "Contagem que justifica a fórmula",
              "after": "A tabela mostra por que a soma dos graus vale 8: cada linha conta as arestas que encostam em um vértice.",
              "table": {
                "columns": [
                  "Vértice",
                  "Arestas incidentes",
                  "Grau"
                ],
                "rows": [
                  [
                    "A",
                    "AB, AC",
                    "2"
                  ],
                  [
                    "B",
                    "AB, BC, BD",
                    "3"
                  ],
                  [
                    "C",
                    "AC, BC",
                    "2"
                  ],
                  [
                    "D",
                    "BD",
                    "1"
                  ],
                  [
                    "Total",
                    "2 + 3 + 2 + 1",
                    "8"
                  ]
                ]
              }
            },
            {
              "key": "formula-soma-dos-graus",
              "title": "Fórmula operacional",
              "after": "Use a fórmula nos dois sentidos: da quantidade de arestas para a soma dos graus, ou da soma dos graus para a quantidade de arestas.",
              "say": "Em qualquer grafo desta lição, a soma dos graus dos vértices é [[2m::duas vezes o número de arestas|o dobro do número de arestas]]. Se a soma dos graus é S e o número de arestas é m, então [[S = 2m::S = 2m|m = 2S]]. Portanto, se S = 14, então m = [[7::7|14]]."
            },
            {
              "key": "treino-formato-lista",
              "title": "Treino guiado no formato da lista",
              "after": "Consolidação: primeiro some os graus; depois divida por 2 para achar o número de arestas. Se o número de arestas já foi dado, multiplique por 2 para achar a soma dos graus.",
              "table": {
                "columns": [
                  "Situação",
                  "Cálculo",
                  "Conclusão"
                ],
                "rows": [
                  [
                    "Graus: {3,2,2,1}",
                    "3 + 2 + 2 + 1 = 8",
                    "Número de arestas: 8 / 2 = 4"
                  ],
                  [
                    "Graus: {2,2,1,1}",
                    "2 + 2 + 1 + 1 = 6",
                    "Número de arestas: 6 / 2 = 3"
                  ],
                  [
                    "Um grafo tem 5 arestas",
                    "2 x 5 = 10",
                    "Soma dos graus: 10"
                  ],
                  [
                    "Soma dos graus é 12",
                    "12 / 2 = 6",
                    "Número de arestas: 6"
                  ]
                ]
              }
            }
          ],
          "dependsOn": [
            "microsequence-calcular-graus-de-vertices"
          ]
        },
        {
          "key": "microsequence-justificar-a-paridade-dos-impares",
          "title": "Justificar a paridade dos ímpares",
          "description": "Mostrar que a quantidade de vértices de grau ímpar deve ser par.",
          "tags": [
            "número par de vértices de grau ímpar"
          ],
          "didacticPurpose": "Mostrar que a quantidade de vértices de grau ímpar deve ser par.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "grafo-caso-local-paridade-impares",
              "title": "Caso local: vértices ímpares aparecem em par",
              "after": "Neste grafo, os vértices destacados são os que têm grau ímpar.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A grau 2",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B grau 3",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C grau 2",
                    "x": 0.5,
                    "y": 1
                  },
                  {
                    "id": "D",
                    "label": "D grau 1",
                    "x": 1.5,
                    "y": 1
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "1"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "2"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "3"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "label": "4"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "B",
                    "D"
                  ],
                  "edges": [
                    [
                      "B",
                      "D"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-do-caso-local",
              "title": "Leitura didática do grafo",
              "after": "O ponto importante é: a soma total dos graus sempre é par, porque cada aresta contribui com 2 para essa soma.",
              "say": "Conte as arestas que chegam em cada vértice: A tem grau 2, B tem grau 3, C tem grau 2 e D tem grau 1. Assim, há exatamente dois vértices de grau ímpar: B e D. A soma dos graus é 2 + 3 + 2 + 1 = 8, que também é 2 vezes o número de arestas."
            },
            {
              "key": "prova-por-separacao-dos-graus",
              "title": "Separando graus pares e ímpares",
              "after": "Esta é a justificativa central: não é uma escolha do desenho; é uma consequência da soma dos graus.",
              "table": {
                "columns": [
                  "Parte da soma dos graus",
                  "O que sabemos",
                  "Consequência"
                ],
                "rows": [
                  [
                    "Graus pares",
                    "A soma de números pares é par",
                    "Essa parte não muda a paridade total"
                  ],
                  [
                    "Graus ímpares",
                    "Cada grau ímpar muda a paridade da soma",
                    "Uma quantidade ímpar deles deixaria a soma total ímpar"
                  ],
                  [
                    "Soma total dos graus",
                    "É igual a 2 vezes o número de arestas",
                    "A soma total precisa ser par"
                  ],
                  [
                    "Conclusão",
                    "A soma total é par e a parte dos graus pares já é par",
                    "A quantidade de graus ímpares deve ser par"
                  ]
                ]
              }
            },
            {
              "key": "completar-argumento-paridade",
              "title": "Complete a justificativa",
              "after": "A lacuna final é a ideia que deve ficar: vértices de grau ímpar não aparecem em quantidade ímpar.",
              "say": "Em qualquer grafo, a soma dos graus é igual a [[2 vezes o número de arestas::o dobro do número de arestas|2m]]. Portanto, essa soma é sempre [[par::par|múltipla de 2]]. Como os graus pares somam um número par, os graus ímpares só mantêm a soma total par se aparecerem em quantidade [[par::par|múltipla de 2]]."
            },
            {
              "key": "consolidacao-formato-lista",
              "title": "Consolidação",
              "after": "Resposta curta para exercício: a quantidade de vértices de grau ímpar é sempre par, pois a soma dos graus é sempre par.",
              "say": "Mostre que um grafo sempre possui um número par de vértices de grau ímpar: pela soma dos graus, cada aresta é contada duas vezes, então a soma de todos os graus é par. Os vértices de grau par contribuem com uma soma par. Logo, para a soma total continuar par, os vértices de grau ímpar precisam aparecer em quantidade par."
            }
          ],
          "dependsOn": [
            "microsequence-aplicar-a-soma-dos-graus"
          ]
        },
        {
          "key": "microsequence-testar-listas-de-graus",
          "title": "Testar listas de graus",
          "description": "Decidir se uma lista pode representar um grafo usando paridade e soma dos graus.",
          "tags": [
            "teste de listas de graus"
          ],
          "didacticPurpose": "Decidir se uma lista pode representar um grafo usando paridade e soma dos graus.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "grafo-caso-local-3221",
              "title": "Caso local: lista {3,2,2,1}",
              "after": "Este grafo materializa a lista {3,2,2,1}: A tem 3 arestas incidentes, B tem 2, C tem 2 e D tem 1.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A: grau 3",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B: grau 2",
                    "x": 1,
                    "y": 1
                  },
                  {
                    "id": "C",
                    "label": "C: grau 2",
                    "x": 1,
                    "y": -1
                  },
                  {
                    "id": "D",
                    "label": "D: grau 1",
                    "x": -1,
                    "y": 0
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B"
                  },
                  {
                    "from": "A",
                    "to": "C"
                  },
                  {
                    "from": "A",
                    "to": "D"
                  },
                  {
                    "from": "B",
                    "to": "C"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "D"
                  ],
                  "edges": []
                }
              }
            },
            {
              "key": "leitura-didatica-do-caso",
              "title": "Como ler o teste",
              "after": "O teste usa somente duas ideias já vistas: a soma dos graus é o dobro do número de arestas, e a quantidade de vértices de grau ímpar deve ser par.",
              "say": "Para testar uma lista de graus, some todos os graus. Se a soma for ímpar, a lista não representa um grafo. Depois conte quantos graus ímpares aparecem. Se essa quantidade for ímpar, a lista também não representa um grafo. No caso {3,2,2,1}, a soma é 8 e há 2 graus ímpares, então ela passa nesses dois testes."
            },
            {
              "key": "tabela-listas-da-lista-anexa",
              "title": "Treino guiado no formato da lista",
              "after": "Uma lista é rejeitada assim que falha na soma par ou na quantidade par de graus ímpares.",
              "table": {
                "columns": [
                  "Lista",
                  "Soma dos graus",
                  "Graus ímpares",
                  "Decisão pelo teste"
                ],
                "rows": [
                  [
                    "{3,2,2,1}",
                    "3+2+2+1=8",
                    "3 e 1: 2 ímpares",
                    "pode representar"
                  ],
                  [
                    "{3,3,3,2}",
                    "3+3+3+2=11",
                    "3, 3 e 3: 3 ímpares",
                    "não representa"
                  ],
                  [
                    "{1,2,3,1}",
                    "1+2+3+1=7",
                    "1, 3 e 1: 3 ímpares",
                    "não representa"
                  ],
                  [
                    "{2,2,1,1}",
                    "2+2+1+1=6",
                    "1 e 1: 2 ímpares",
                    "pode representar"
                  ]
                ]
              }
            },
            {
              "key": "lacunas-regra-decisao",
              "title": "Complete a regra",
              "after": "Essas lacunas resumem o critério operacional desta etapa.",
              "say": "A soma dos graus deve ser [[par::par|ímpar]], porque ela é o dobro do número de arestas. A quantidade de graus ímpares também deve ser [[par::par|ímpar]]. Se uma lista tem soma [[ímpar::ímpar|par]], ela não representa um grafo. Se tem quantidade [[ímpar::ímpar|par]] de graus ímpares, ela também não representa um grafo."
            },
            {
              "key": "consolidacao-manual",
              "title": "Fechamento da etapa",
              "say": "Procedimento manual: escreva a lista, some os graus e confira se a soma é par. Depois marque os valores ímpares e conte quantos são. Se a soma for par e a quantidade de ímpares for par, a lista passa no teste desta microssequência. Se qualquer uma das duas verificações falhar, a resposta é: não representa um grafo."
            }
          ],
          "dependsOn": [
            "microsequence-justificar-a-paridade-dos-impares"
          ]
        }
      ]
    },
    {
      "key": "lesson-isomorfismo-e-grafos-completos",
      "title": "Isomorfismo e grafos completos",
      "description": "Reconhecer grafos isomorfos e calcular arestas de grafos completos.",
      "sourceGuideStructured": {
        "lessonGoal": "Reconhecer grafos isomorfos e calcular arestas de grafos completos.",
        "notationRules": "Usar apenas grafos isomorfos; grafo completo; fórmula de arestas de K_n.",
        "commonErrors": "Não confundir desenhos diferentes com grafos necessariamente não isomorfos.",
        "outOfScopeRules": "grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury"
      },
      "sourceGuide": "Meta da lição: Reconhecer grafos isomorfos e calcular arestas de grafos completos.\nIncluir: Usar apenas grafos isomorfos; grafo completo; fórmula de arestas de K_n.\nNão incluir: grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury\nNão confundir com: Não confundir desenhos diferentes com grafos necessariamente não isomorfos.",
      "microsequences": [
        {
          "key": "microsequence-comparar-grafos-por-estrutura",
          "title": "Comparar grafos por estrutura",
          "description": "Verificar se dois grafos preservam adjacências sob uma renomeação de vértices.",
          "tags": [
            "grafos isomorfos"
          ],
          "didacticPurpose": "Verificar se dois grafos preservam adjacências sob uma renomeação de vértices.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "caso-local-dois-desenhos-mesma-estrutura",
              "title": "Caso local",
              "after": "Compare os dois desenhos pela estrutura, não pela posição dos vértices.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "G: A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "G: B",
                    "x": 1,
                    "y": 1
                  },
                  {
                    "id": "C",
                    "label": "G: C",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "D",
                    "label": "G: D",
                    "x": 3,
                    "y": 0
                  },
                  {
                    "id": "w",
                    "label": "H: w",
                    "x": 0,
                    "y": 3
                  },
                  {
                    "id": "x",
                    "label": "H: x",
                    "x": 1,
                    "y": 2
                  },
                  {
                    "id": "y",
                    "label": "H: y",
                    "x": 2,
                    "y": 3
                  },
                  {
                    "id": "z",
                    "label": "H: z",
                    "x": 3,
                    "y": 3
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "G"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "G"
                  },
                  {
                    "from": "C",
                    "to": "A",
                    "label": "G"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "G"
                  },
                  {
                    "from": "w",
                    "to": "x",
                    "label": "H"
                  },
                  {
                    "from": "x",
                    "to": "y",
                    "label": "H"
                  },
                  {
                    "from": "y",
                    "to": "w",
                    "label": "H"
                  },
                  {
                    "from": "y",
                    "to": "z",
                    "label": "H"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D",
                    "w",
                    "x",
                    "y",
                    "z"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "C",
                      "A"
                    ],
                    [
                      "C",
                      "D"
                    ],
                    [
                      "w",
                      "x"
                    ],
                    [
                      "x",
                      "y"
                    ],
                    [
                      "y",
                      "w"
                    ],
                    [
                      "y",
                      "z"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-do-caso-local",
              "title": "Leitura didática",
              "after": "A ideia central é: desenho diferente não basta para concluir que os grafos são diferentes em estrutura.",
              "say": "Os grafos G e H parecem desenhados de modos diferentes, mas podem representar a mesma estrutura. Para testar isomorfismo, tente renomear cada vértice de G por um vértice de H e verifique se toda aresta continua sendo aresta. Aqui, a renomeação A→w, B→x, C→y e D→z preserva as ligações."
            },
            {
              "key": "prova-por-adjacencias",
              "title": "Teste de adjacências",
              "after": "Como todas as arestas de G viraram arestas de H pela mesma renomeação, a comparação favorece que os grafos sejam isomorfos.",
              "table": {
                "columns": [
                  "Aresta em G",
                  "Renomeação aplicada",
                  "Aresta correspondente em H",
                  "Preservou?"
                ],
                "rows": [
                  [
                    "AB",
                    "A→w e B→x",
                    "wx",
                    "sim"
                  ],
                  [
                    "BC",
                    "B→x e C→y",
                    "xy",
                    "sim"
                  ],
                  [
                    "CA",
                    "C→y e A→w",
                    "yw",
                    "sim"
                  ],
                  [
                    "CD",
                    "C→y e D→z",
                    "yz",
                    "sim"
                  ]
                ]
              }
            },
            {
              "key": "definicao-manual",
              "title": "Definição operacional",
              "after": "Use essa frase como roteiro curto para responder à definição no formato da lista.",
              "say": "Dois grafos são [[isomorfos::isomorfos|iguais no desenho]] quando existe uma [[renomeação::renomeação|soma]] dos vértices que preserva as [[adjacências::adjacências|posições]]. Isso significa que, se dois vértices estão ligados em um grafo, seus correspondentes também devem estar [[ligados::ligados|separados]] no outro."
            },
            {
              "key": "treino-guiado-lista",
              "title": "Treino guiado",
              "after": "Esse é o procedimento manual: propor correspondência, testar arestas, concluir.",
              "table": {
                "columns": [
                  "Passo",
                  "O que verificar",
                  "Aplicação ao caso"
                ],
                "rows": [
                  [
                    "1",
                    "Escolher uma renomeação candidata",
                    "A→w, B→x, C→y, D→z"
                  ],
                  [
                    "2",
                    "Comparar cada aresta do primeiro grafo",
                    "AB, BC, CA, CD"
                  ],
                  [
                    "3",
                    "Ver se as imagens dessas arestas existem no segundo grafo",
                    "wx, xy, yw, yz existem"
                  ],
                  [
                    "4",
                    "Concluir com base na preservação das adjacências",
                    "G e H são isomorfos por essa renomeação"
                  ]
                ]
              }
            },
            {
              "key": "consolidacao-proxima-da-lista",
              "title": "Consolidação",
              "say": "Resposta curta no estilo da lista: dois grafos são isomorfos quando há uma correspondência entre seus vértices que mantém as adjacências. No exemplo, A corresponde a w, B a x, C a y e D a z. Como AB, BC, CA e CD correspondem a wx, xy, yw e yz, os dois grafos têm a mesma estrutura."
            }
          ],
          "dependsOn": []
        },
        {
          "key": "microsequence-reconhecer-um-grafo-completo",
          "title": "Reconhecer um grafo completo",
          "description": "Identificar quando todo par de vértices está ligado por uma aresta.",
          "tags": [
            "grafo completo"
          ],
          "didacticPurpose": "Identificar quando todo par de vértices está ligado por uma aresta.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "k4-caso-local",
              "title": "Caso local: grafo completo com quatro vértices",
              "after": "Este desenho representa explicitamente um grafo completo: não sobra nenhum par de vértices sem aresta.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 2,
                    "y": 2
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 0,
                    "y": 2
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "AB"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "AC"
                  },
                  {
                    "from": "A",
                    "to": "D",
                    "label": "AD"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "BC"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "label": "BD"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "CD"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "A",
                      "C"
                    ],
                    [
                      "A",
                      "D"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "B",
                      "D"
                    ],
                    [
                      "C",
                      "D"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-didatica-k4",
              "title": "Como ler o desenho",
              "after": "A leitura correta não depende do formato do desenho, mas das ligações entre os vértices.",
              "say": "Um grafo é completo quando todo par de vértices distintos está ligado por uma aresta. No caso acima, A se liga a B, C e D; B se liga também a C e D; e C se liga a D. Como todos os pares aparecem, o grafo é completo."
            },
            {
              "key": "checagem-dos-pares",
              "title": "Checklist dos pares",
              "after": "Para provar que este grafo é completo, basta verificar que cada par de vértices distintos tem sua aresta.",
              "table": {
                "columns": [
                  "Par de vértices",
                  "Aresta existe?",
                  "Conclusão local"
                ],
                "rows": [
                  [
                    "A e B",
                    "Sim",
                    "Par atendido"
                  ],
                  [
                    "A e C",
                    "Sim",
                    "Par atendido"
                  ],
                  [
                    "A e D",
                    "Sim",
                    "Par atendido"
                  ],
                  [
                    "B e C",
                    "Sim",
                    "Par atendido"
                  ],
                  [
                    "B e D",
                    "Sim",
                    "Par atendido"
                  ],
                  [
                    "C e D",
                    "Sim",
                    "Par atendido"
                  ]
                ]
              }
            },
            {
              "key": "contraste-nao-completo",
              "title": "Contraste: falta uma ligação",
              "after": "Se apenas um par de vértices distintos fica sem aresta, o grafo não é completo.",
              "table": {
                "columns": [
                  "Par observado",
                  "Situação",
                  "O grafo ainda é completo?"
                ],
                "rows": [
                  [
                    "A e B",
                    "Tem aresta",
                    "Ainda pode ser"
                  ],
                  [
                    "A e C",
                    "Tem aresta",
                    "Ainda pode ser"
                  ],
                  [
                    "A e D",
                    "Tem aresta",
                    "Ainda pode ser"
                  ],
                  [
                    "B e C",
                    "Tem aresta",
                    "Ainda pode ser"
                  ],
                  [
                    "B e D",
                    "Não tem aresta",
                    "Não"
                  ],
                  [
                    "C e D",
                    "Tem aresta",
                    "Não, pois um par falhou"
                  ]
                ]
              }
            },
            {
              "key": "lacunas-definicao",
              "title": "Complete a definição",
              "after": "Use essa frase como teste rápido antes de resolver exercícios de desenho.",
              "say": "Um grafo completo é aquele em que [[todo par de vértices distintos::todo par|todos os pares]] está ligado por [[uma aresta::aresta|ligação]]. Se faltar a aresta entre um único par, o grafo [[não é completo::não é completo|é incompleto]]."
            },
            {
              "key": "consolidacao-formato-lista",
              "title": "Exercício de consolidação",
              "after": "Fechamento: para reconhecer um grafo completo, olhe os pares de vértices, não apenas a aparência do desenho.",
              "say": "Formato da lista: desenhe um grafo completo com os vértices A, B, C e D. Depois responda: ele é completo? Resposta esperada: sim, desde que apareçam exatamente as ligações AB, AC, AD, BC, BD e CD, pois todo par de vértices distintos está ligado por uma aresta."
            }
          ],
          "dependsOn": [
            "microsequence-comparar-grafos-por-estrutura"
          ]
        },
        {
          "key": "microsequence-calcular-arestas-de-k-n",
          "title": "Calcular arestas de K_n",
          "description": "Usar a fórmula combinatória para obter o número de arestas de um grafo completo.",
          "tags": [
            "fórmula de arestas de K_n"
          ],
          "didacticPurpose": "Usar a fórmula combinatória para obter o número de arestas de um grafo completo.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "kn-caso-local-k4",
              "title": "Caso local: K_4",
              "after": "Este é um K_4: há 4 vértices e todo par de vértices está ligado por uma aresta.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 1
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 0,
                    "y": -1
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": -1,
                    "y": 0
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "AB"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "AC"
                  },
                  {
                    "from": "A",
                    "to": "D",
                    "label": "AD"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "BC"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "label": "BD"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "CD"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "A",
                      "C"
                    ],
                    [
                      "A",
                      "D"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "B",
                      "D"
                    ],
                    [
                      "C",
                      "D"
                    ]
                  ]
                }
              }
            },
            {
              "key": "kn-leitura-do-caso",
              "title": "Leitura didática do K_4",
              "after": "A ideia central é: em K_n, cada aresta corresponde a escolher 2 vértices entre os n vértices.",
              "say": "Para contar as arestas de um grafo completo, não contamos desenhos: contamos pares de vértices. No K_4, os pares são AB, AC, AD, BC, BD e CD. Cada par gera exatamente uma aresta, então K_4 tem 6 arestas."
            },
            {
              "key": "kn-formula-combinatoria",
              "title": "Fórmula de arestas de K_n",
              "after": "Use a fórmula quando a pergunta pedir o número de arestas de um grafo completo com n vértices.",
              "say": "Em um grafo completo K_n, todo par de vértices forma uma aresta. Por isso, o número de arestas é C(n, 2) = n(n - 1) / 2."
            },
            {
              "key": "kn-tabela-prova",
              "title": "Aplicações diretas",
              "after": "A tabela mostra o padrão usado em prova: substituir n, multiplicar n por n - 1 e dividir por 2.",
              "table": {
                "columns": [
                  "Grafo completo",
                  "Cálculo",
                  "Número de arestas"
                ],
                "rows": [
                  [
                    "K_3",
                    "C(3, 2) = 3 × 2 / 2",
                    "3"
                  ],
                  [
                    "K_4",
                    "C(4, 2) = 4 × 3 / 2",
                    "6"
                  ],
                  [
                    "K_5",
                    "C(5, 2) = 5 × 4 / 2",
                    "10"
                  ],
                  [
                    "K_6",
                    "C(6, 2) = 6 × 5 / 2",
                    "15"
                  ]
                ]
              }
            },
            {
              "key": "kn-treino-guiado-lacunas",
              "title": "Treino guiado",
              "after": "Se o resultado não for inteiro, refaça a substituição: para grafos completos, n(n - 1) sempre fica par.",
              "say": "Complete: em K_n, cada aresta liga um [[par de vértices::par de vertices|par]]. Logo, o número de arestas de K_n é [[C(n, 2)::combinação de n tomados 2 a 2|n(n - 1) / 2]]. Para K_8, temos 8 × 7 / 2 = [[28::vinte e oito]]."
            },
            {
              "key": "kn-consolidacao-lista",
              "title": "Consolidação no formato da lista",
              "after": "Fechamento: para K_n, conte pares de vértices; não conte posições no desenho.",
              "say": "Questão: Qual é a fórmula, usando combinações, para encontrar o número de arestas em um grafo completo com n vértices, K_n? Resposta: [[C(n, 2) = n(n - 1) / 2::n(n - 1) / 2|combinação de n tomados 2 a 2]]. Exemplo: K_10 possui [[45::quarenta e cinco]] arestas."
            }
          ],
          "dependsOn": [
            "microsequence-reconhecer-um-grafo-completo"
          ]
        }
      ]
    },
    {
      "key": "lesson-grafos-regulares-e-bipartidos",
      "title": "Grafos regulares e bipartidos",
      "description": "Verificar regularidade, bipartição e construção de grafos bipartidos completos.",
      "sourceGuideStructured": {
        "lessonGoal": "Verificar regularidade, bipartição e construção de grafos bipartidos completos.",
        "notationRules": "Usar apenas grafos regulares; grafo bipartido; grafo bipartido completo.",
        "commonErrors": "Não confundir grafo bipartido com grafo desconexo nem exigir que todo bipartido seja completo.",
        "outOfScopeRules": "grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury"
      },
      "sourceGuide": "Meta da lição: Verificar regularidade, bipartição e construção de grafos bipartidos completos.\nIncluir: Usar apenas grafos regulares; grafo bipartido; grafo bipartido completo.\nNão incluir: grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury\nNão confundir com: Não confundir grafo bipartido com grafo desconexo nem exigir que todo bipartido seja completo.",
      "microsequences": [
        {
          "key": "microsequence-testar-regularidade",
          "title": "Testar regularidade",
          "description": "Decidir se todos os vértices têm o mesmo grau e se a construção é possível.",
          "tags": [
            "grafos regulares"
          ],
          "didacticPurpose": "Decidir se todos os vértices têm o mesmo grau e se a construção é possível.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "regularidade-grafo-local",
              "title": "Caso local: todos com mesmo grau",
              "after": "Cada aresta encosta em dois vértices. Para testar regularidade, conte quantas arestas chegam a cada vértice.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 1
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 1,
                    "y": 1
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 0,
                    "y": 0
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "conta para A e B"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "conta para B e C"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "conta para C e D"
                  },
                  {
                    "from": "D",
                    "to": "A",
                    "label": "conta para D e A"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "C",
                      "D"
                    ],
                    [
                      "D",
                      "A"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-do-caso-local",
              "title": "Leitura didática",
              "after": "A palavra regular não quer dizer que o desenho ficou simétrico. Quer dizer apenas que todos os vértices têm o mesmo grau.",
              "say": "No grafo mostrado, o vértice A tem grau 2, pois toca as arestas AB e AD. O vértice B tem grau 2, pois toca AB e BC. O mesmo ocorre com C e D. Como todos os vértices têm grau 2, esse é um grafo 2-regular."
            },
            {
              "key": "tabela-de-teste",
              "title": "Teste de regularidade e possibilidade",
              "after": "A última linha é o teste curto para perguntas como: é possível construir um grafo 3-regular com 5 vértices?",
              "table": {
                "columns": [
                  "Pergunta de prova",
                  "Como verificar",
                  "Conclusão no exemplo"
                ],
                "rows": [
                  [
                    "Todos os vértices têm o mesmo grau?",
                    "Calcule o grau de cada vértice e compare todos os valores.",
                    "A=2, B=2, C=2, D=2: é regular."
                  ],
                  [
                    "Qual é o valor de k em k-regular?",
                    "Use o grau comum dos vértices.",
                    "Como o grau comum é 2, o grafo é 2-regular."
                  ],
                  [
                    "Uma construção k-regular com n vértices é possível?",
                    "Verifique se k não passa de n-1 e se n vezes k é par.",
                    "Para n=5 e k=3: 5 vezes 3 = 15, que é ímpar; então não é possível."
                  ]
                ]
              }
            },
            {
              "key": "treino-guiado-regularidade",
              "title": "Treino guiado",
              "after": "Se o produto n vezes k for ímpar, a lista de graus teria soma ímpar, e isso não fecha para um grafo.",
              "say": "Complete: um grafo é regular quando [[todos os vértices têm o mesmo grau::todos têm graus diferentes|todos os vértices têm o mesmo grau]]. No grafo local, os graus são 2, 2, 2 e 2; portanto ele é [[2-regular::2-regular|4-regular]]. Uma construção 3-regular com 5 vértices é [[impossível::possível|impossível]], porque 5 vezes 3 é [[ímpar::par|ímpar]]."
            },
            {
              "key": "consolidacao-formato-lista",
              "title": "Consolidação próxima da lista",
              "after": "Fechamento: para testar regularidade, primeiro conte os graus; depois veja se todos são iguais; por fim, em uma construção pedida, confira se n vezes k é par.",
              "say": "Responda manualmente: 1. O grafo com graus {2, 2, 2, 2} é regular? Sim, é 2-regular. 2. O grafo com graus {3, 3, 3, 3} é regular? Sim, é 3-regular. 3. O grafo com graus {3, 3, 3, 2} é regular? Não, porque nem todos os graus são iguais. 4. É possível construir um grafo 3-regular com 5 vértices? Não, porque 5 vezes 3 = 15, e 15 é ímpar."
            }
          ],
          "dependsOn": []
        },
        {
          "key": "microsequence-separar-em-duas-partes",
          "title": "Separar em duas partes",
          "description": "Organizar vértices em dois conjuntos sem arestas internas no mesmo conjunto.",
          "tags": [
            "grafo bipartido"
          ],
          "didacticPurpose": "Organizar vértices em dois conjuntos sem arestas internas no mesmo conjunto.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "bipartido-caso-local",
              "title": "Caso local: duas partes",
              "after": "Leia A e B como uma parte, e C, D e E como a outra parte.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 0,
                    "y": 2
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 4,
                    "y": 0
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 4,
                    "y": 2
                  },
                  {
                    "id": "E",
                    "label": "E",
                    "x": 4,
                    "y": 4
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "C",
                    "label": "entre partes"
                  },
                  {
                    "from": "A",
                    "to": "D",
                    "label": "entre partes"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "label": "entre partes"
                  },
                  {
                    "from": "B",
                    "to": "E",
                    "label": "entre partes"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D",
                    "E"
                  ],
                  "edges": [
                    [
                      "A",
                      "C"
                    ],
                    [
                      "A",
                      "D"
                    ],
                    [
                      "B",
                      "D"
                    ],
                    [
                      "B",
                      "E"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-didatica-do-caso",
              "title": "Leitura do desenho",
              "after": "Para testar se um grafo é bipartido, tente distribuir os vértices em dois conjuntos de modo que nenhuma aresta fique dentro de um mesmo conjunto.",
              "say": "O grafo desenhado é bipartido porque seus vértices podem ser separados em duas partes: {A, B} e {C, D, E}. Todas as arestas saem de uma parte e chegam na outra. Não existe aresta A-B dentro da primeira parte, nem aresta C-D, C-E ou D-E dentro da segunda parte."
            },
            {
              "key": "criterio-de-prova",
              "title": "O que verificar na prova",
              "after": "A ideia central é simples: a decisão depende das arestas internas, não apenas dos graus.",
              "table": {
                "columns": [
                  "Situação observada",
                  "Conclusão para bipartição"
                ],
                "rows": [
                  [
                    "Toda aresta liga um vértice da parte 1 a um vértice da parte 2",
                    "A separação é válida"
                  ],
                  [
                    "Aparece uma aresta entre dois vértices da mesma parte",
                    "Essa separação não serve"
                  ],
                  [
                    "Não apareceu nenhuma aresta interna depois da separação",
                    "O grafo é bipartido para essa separação"
                  ],
                  [
                    "O grafo é regular",
                    "Isso não decide sozinho se é bipartido"
                  ]
                ]
              }
            },
            {
              "key": "treino-guiado-lista",
              "title": "Treino guiado",
              "after": "Esse é o formato esperado: apresentar as duas partes e conferir as arestas uma a uma.",
              "say": "Considere as arestas AB, AC, BD e CD. Uma separação possível é {A, D} e {B, C}. Verifique: AB cruza as partes, AC cruza as partes, BD cruza as partes e CD cruza as partes. Como nenhuma dessas arestas ficou dentro de {A, D} ou dentro de {B, C}, o grafo é bipartido."
            },
            {
              "key": "consolidacao-lacunas",
              "title": "Consolidação",
              "after": "Fechamento manual: para responder na lista, escreva as duas partes e confira se cada aresta atravessa de uma parte para a outra.",
              "say": "Um grafo é [[bipartido::bipartido|regular]] quando seus vértices podem ser separados em [[duas partes::duas partes|uma lista de graus]] sem arestas internas no mesmo conjunto. Se uma aresta liga dois vértices da mesma parte, essa separação [[não serve::não serve|sempre serve]]. Um grafo regular pode ou não ser [[bipartido::bipartido|completo]], então regularidade sozinha não resolve o teste."
            }
          ],
          "dependsOn": [
            "microsequence-testar-regularidade"
          ]
        },
        {
          "key": "microsequence-construir-bipartido-completo",
          "title": "Construir bipartido completo",
          "description": "Desenhar um grafo em que todos os vértices de uma parte se ligam a todos da outra.",
          "tags": [
            "grafo bipartido completo"
          ],
          "didacticPurpose": "Desenhar um grafo em que todos os vértices de uma parte se ligam a todos da outra.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "card-1-caso-local-k23",
              "title": "Caso local: bipartido completo",
              "after": "Observe que os vértices foram separados em duas partes: {A1, A2} e {B1, B2, B3}.",
              "graph": {
                "vertices": [
                  {
                    "id": "a1",
                    "label": "A1",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "a2",
                    "label": "A2",
                    "x": 0,
                    "y": 2
                  },
                  {
                    "id": "b1",
                    "label": "B1",
                    "x": 3,
                    "y": -1
                  },
                  {
                    "id": "b2",
                    "label": "B2",
                    "x": 3,
                    "y": 1
                  },
                  {
                    "id": "b3",
                    "label": "B3",
                    "x": 3,
                    "y": 3
                  }
                ],
                "edges": [
                  {
                    "from": "a1",
                    "to": "b1",
                    "label": "A1-B1"
                  },
                  {
                    "from": "a1",
                    "to": "b2",
                    "label": "A1-B2"
                  },
                  {
                    "from": "a1",
                    "to": "b3",
                    "label": "A1-B3"
                  },
                  {
                    "from": "a2",
                    "to": "b1",
                    "label": "A2-B1"
                  },
                  {
                    "from": "a2",
                    "to": "b2",
                    "label": "A2-B2"
                  },
                  {
                    "from": "a2",
                    "to": "b3",
                    "label": "A2-B3"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "a1",
                    "a2",
                    "b1",
                    "b2",
                    "b3"
                  ],
                  "edges": [
                    [
                      "a1",
                      "b1"
                    ],
                    [
                      "a1",
                      "b2"
                    ],
                    [
                      "a1",
                      "b3"
                    ],
                    [
                      "a2",
                      "b1"
                    ],
                    [
                      "a2",
                      "b2"
                    ],
                    [
                      "a2",
                      "b3"
                    ]
                  ]
                }
              }
            },
            {
              "key": "card-2-leitura-didatica",
              "title": "Leitura do desenho",
              "after": "A palavra completo aqui não significa que todos os vértices se ligam entre si; significa que todas as ligações entre as duas partes existem.",
              "say": "O desenho representa um grafo bipartido completo porque há duas partes de vértices e toda ligação possível entre uma parte e a outra foi feita. A1 se liga a B1, B2 e B3. A2 também se liga a B1, B2 e B3. Não há ligação entre A1 e A2, nem entre B1, B2 e B3."
            },
            {
              "key": "card-3-tabela-verificacao",
              "title": "Checklist de prova",
              "after": "Para justificar em exercício, basta mostrar as duas partes e conferir que todas as arestas entre partes aparecem.",
              "table": {
                "columns": [
                  "Pergunta para verificar",
                  "Resposta no caso local",
                  "Conclusão"
                ],
                "rows": [
                  [
                    "Há duas partes de vértices?",
                    "Sim: {A1, A2} e {B1, B2, B3}.",
                    "Pode ser bipartido."
                  ],
                  [
                    "Existe aresta dentro da mesma parte?",
                    "Não: não há A1-A2, nem arestas entre B1, B2 e B3.",
                    "Continua sendo bipartido."
                  ],
                  [
                    "Cada vértice da primeira parte se liga a todos da segunda?",
                    "Sim: A1 e A2 se ligam a B1, B2 e B3.",
                    "É completo entre as partes."
                  ],
                  [
                    "Cada vértice da segunda parte se liga a todos da primeira?",
                    "Sim: B1, B2 e B3 se ligam a A1 e A2.",
                    "É bipartido completo."
                  ]
                ]
              }
            },
            {
              "key": "card-4-treino-guiado",
              "title": "Treino guiado",
              "after": "A ideia principal é conferir ausência de arestas internas e presença de todas as arestas entre as partes.",
              "say": "Complete a justificativa: no grafo bipartido completo com partes {A1, A2} e {B1, B2, B3}, não pode haver aresta dentro da [[mesma parte::mesma parte|parte interna]]. Como cada vértice A se liga a [[todos::todos|alguns]] os vértices B, e cada vértice B se liga aos vértices A, o grafo é [[bipartido completo::bipartido completo|apenas desconexo]]."
            },
            {
              "key": "card-5-consolidacao-lista",
              "title": "Formato de lista",
              "say": "Exercício: construa um grafo bipartido completo qualquer. Resposta manual: escolha duas partes, por exemplo {A1, A2} e {B1, B2, B3}. Depois desenhe as arestas A1-B1, A1-B2, A1-B3, A2-B1, A2-B2 e A2-B3. Não desenhe A1-A2 e não desenhe ligações entre B1, B2 e B3. Assim, o grafo construído é bipartido completo."
            }
          ],
          "dependsOn": [
            "microsequence-separar-em-duas-partes"
          ]
        }
      ]
    },
    {
      "key": "lesson-matriz-de-adjacencia-e-percursos",
      "title": "Matriz de adjacência e percursos",
      "description": "Ler uma matriz de adjacência e distinguir passeio, trilha, caminho e ciclo.",
      "sourceGuideStructured": {
        "lessonGoal": "Ler uma matriz de adjacência e distinguir passeio, trilha, caminho e ciclo.",
        "notationRules": "Usar apenas matriz de adjacência; passeio, trilha, caminho e ciclo.",
        "commonErrors": "Não confundir trilha com caminho: trilha não repete arestas, caminho não repete vértices.",
        "outOfScopeRules": "grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury"
      },
      "sourceGuide": "Meta da lição: Ler uma matriz de adjacência e distinguir passeio, trilha, caminho e ciclo.\nIncluir: Usar apenas matriz de adjacência; passeio, trilha, caminho e ciclo.\nNão incluir: grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury\nNão confundir com: Não confundir trilha com caminho: trilha não repete arestas, caminho não repete vértices.",
      "microsequences": [
        {
          "key": "microsequence-ler-a-matriz-de-adjacencia",
          "title": "Ler a matriz de adjacência",
          "description": "Converter entradas da matriz em arestas do grafo correspondente.",
          "tags": [
            "matriz de adjacência"
          ],
          "didacticPurpose": "Converter entradas da matriz em arestas do grafo correspondente.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "matriz-grafo-caso-local",
              "title": "Grafo lido da matriz",
              "after": "Este grafo representa a matriz local com vértices A, B, C e D.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 1,
                    "y": 1.5
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 3,
                    "y": 1.5
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "1"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "1"
                  },
                  {
                    "from": "A",
                    "to": "D",
                    "label": "1"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "1"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "1"
                  }
                ]
              }
            },
            {
              "key": "leitura-curta-da-matriz",
              "title": "Como ler a matriz",
              "after": "No caso local, A se liga a B, C e D; B se liga a C; C se liga a D.",
              "say": "Em uma matriz de adjacência, cada linha e cada coluna representa um vértice. Quando a entrada entre dois vértices vale 1, existe uma aresta entre eles. Quando vale 0, não existe aresta. Para não contar a mesma aresta duas vezes, leia apenas um lado da matriz: por exemplo, da diagonal principal para cima."
            },
            {
              "key": "tabela-arestas-extraidas",
              "title": "Da entrada da matriz para a aresta",
              "after": "Essa tabela registra exatamente quais pares viram arestas no desenho.",
              "table": {
                "columns": [
                  "Entrada observada",
                  "Valor",
                  "Conclusão"
                ],
                "rows": [
                  [
                    "A-B",
                    "1",
                    "existe aresta AB"
                  ],
                  [
                    "A-C",
                    "1",
                    "existe aresta AC"
                  ],
                  [
                    "A-D",
                    "1",
                    "existe aresta AD"
                  ],
                  [
                    "B-C",
                    "1",
                    "existe aresta BC"
                  ],
                  [
                    "B-D",
                    "0",
                    "não existe aresta BD"
                  ],
                  [
                    "C-D",
                    "1",
                    "existe aresta CD"
                  ]
                ]
              }
            },
            {
              "key": "treino-guiado-lista-de-arestas",
              "title": "Complete a leitura",
              "after": "A resposta correta depende só dos valores 0 e 1 nas posições entre pares de vértices.",
              "say": "Na matriz do caso local, a entrada B-D vale [[0::0|1]], então [[não existe aresta BD::não existe aresta BD|existe aresta BD]]. A entrada C-D vale [[1::1|0]], então [[existe aresta CD::existe aresta CD|não existe aresta CD]]. A lista de arestas lida da matriz é [[AB, AC, AD, BC, CD::AB, AC, AD, BC, CD|AB, AC, BC, BD, CD]]."
            },
            {
              "key": "fechamento-manual",
              "title": "Consolidação",
              "say": "Para resolver uma questão desse tipo na prova, escreva os vértices nas linhas e colunas, escolha os pares de vértices uma vez só e transforme cada 1 em uma aresta. Neste exemplo, a matriz gera cinco arestas: AB, AC, AD, BC e CD."
            }
          ],
          "dependsOn": []
        },
        {
          "key": "microsequence-classificar-percursos",
          "title": "Classificar percursos",
          "description": "Diferenciar passeio, trilha, caminho e ciclo por repetição de arestas e vértices.",
          "tags": [
            "passeio, trilha, caminho e ciclo"
          ],
          "didacticPurpose": "Diferenciar passeio, trilha, caminho e ciclo por repetição de arestas e vértices.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "classificar-percursos-grafo-base",
              "title": "Grafo para classificar percursos",
              "after": "Use este mesmo grafo como caso local: os percursos serão sequências de vértices ligadas por arestas existentes.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 1,
                    "y": 1
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 1,
                    "y": -1
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "AB"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "BC"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "CD"
                  },
                  {
                    "from": "D",
                    "to": "A",
                    "label": "DA"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "label": "AC"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "C",
                      "D"
                    ],
                    [
                      "D",
                      "A"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-do-caso-local",
              "title": "Leitura do caso",
              "after": "A classificação não depende do desenho ficar bonito; depende da sequência e das arestas usadas.",
              "say": "No grafo mostrado, A-B-C-D-A é um percurso válido porque cada par consecutivo está ligado por uma aresta: AB, BC, CD e DA. Para classificar o percurso, observe duas coisas: se alguma aresta foi repetida e se algum vértice foi repetido."
            },
            {
              "key": "criterios-de-classificacao",
              "title": "Critérios para prova",
              "after": "A diferença mais cobrada é: toda caminho é trilha, mas nem toda trilha é caminho.",
              "table": {
                "columns": [
                  "Tipo",
                  "Pode repetir aresta?",
                  "Pode repetir vértice?",
                  "Ideia principal"
                ],
                "rows": [
                  [
                    "Passeio",
                    "Sim",
                    "Sim",
                    "Basta seguir arestas existentes em sequência."
                  ],
                  [
                    "Trilha",
                    "Não",
                    "Sim",
                    "Não repete arestas."
                  ],
                  [
                    "Caminho",
                    "Não",
                    "Não",
                    "Não repete vértices."
                  ],
                  [
                    "Ciclo",
                    "Não",
                    "Só repete o primeiro no fim",
                    "Começa e termina no mesmo vértice, sem repetir outros vértices."
                  ]
                ]
              }
            },
            {
              "key": "classificacao-guiada",
              "title": "Treino guiado",
              "after": "Quando houver dúvida, liste as arestas usadas na ordem e marque as repetições.",
              "say": "No grafo do primeiro card, A-B-C-D é [[caminho::caminho|trilha|passeio]], pois não repete vértices. A-B-C-A-D é [[caminho::caminho|trilha|ciclo]], pois usa vértices sem repetição antes do final e todas as ligações existem. A-B-C-D-A é [[ciclo::ciclo|passeio|trilha]], pois começa e termina em A sem repetir outros vértices. A-B-C-A-B é [[passeio::passeio|caminho|ciclo]], mas não é trilha, porque repete a aresta AB."
            },
            {
              "key": "modelo-de-resposta-manual",
              "title": "Como responder na lista",
              "after": "Fechamento: classificar percurso é verificar repetição de arestas e de vértices, sempre dentro do grafo dado.",
              "say": "Para resolver uma questão desse tipo, escreva a sequência, confirme que cada passo usa uma aresta do grafo e depois classifique: se só respeita as arestas, é passeio; se não repete arestas, é trilha; se não repete vértices, é caminho; se volta ao vértice inicial sem repetir os demais, é ciclo."
            }
          ],
          "dependsOn": [
            "microsequence-ler-a-matriz-de-adjacencia"
          ]
        },
        {
          "key": "microsequence-extrair-subgrafos-de-percurso",
          "title": "Extrair subgrafos de percurso",
          "description": "Marcar em um grafo exemplos de trilha e caminho a partir da matriz.",
          "tags": [
            "matriz de adjacência",
            "passeio, trilha, caminho e ciclo"
          ],
          "didacticPurpose": "Marcar em um grafo exemplos de trilha e caminho a partir da matriz.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "grafo-caso-local-matriz-4-vertices",
              "title": "Caso local da matriz",
              "after": "O destaque mostra o percurso A-B-C-D dentro do grafo extraído da matriz.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 1,
                    "y": 1.5
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 3,
                    "y": 1.5
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B"
                  },
                  {
                    "from": "A",
                    "to": "C"
                  },
                  {
                    "from": "A",
                    "to": "D"
                  },
                  {
                    "from": "B",
                    "to": "C"
                  },
                  {
                    "from": "C",
                    "to": "D"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "C",
                      "D"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-didatica-do-caso",
              "title": "Leitura do mesmo caso",
              "after": "Agora a leitura da matriz vira uma lista curta de arestas que pode ser conferida na prova.",
              "say": "A matriz local tem quatro vértices: A, B, C e D. Cada entrada 1 fora da diagonal indica uma aresta entre o vértice da linha e o vértice da coluna. Assim, o grafo possui as arestas AB, AC, AD, BC e CD. Para extrair um subgrafo de percurso, escolha apenas os vértices e as arestas usados pelo percurso marcado."
            },
            {
              "key": "tabela-extracao-da-matriz",
              "title": "Da matriz para as arestas",
              "after": "Na hora de desenhar um subgrafo de percurso, nunca use um par com entrada 0.",
              "table": {
                "columns": [
                  "Par de vértices",
                  "Entrada na matriz",
                  "Aresta no grafo?",
                  "Uso em percurso"
                ],
                "rows": [
                  [
                    "A-B",
                    "1",
                    "Sim",
                    "Pode entrar em trilha ou caminho"
                  ],
                  [
                    "A-C",
                    "1",
                    "Sim",
                    "Pode entrar em trilha ou caminho"
                  ],
                  [
                    "A-D",
                    "1",
                    "Sim",
                    "Pode entrar em trilha ou caminho"
                  ],
                  [
                    "B-C",
                    "1",
                    "Sim",
                    "Pode entrar em trilha ou caminho"
                  ],
                  [
                    "B-D",
                    "0",
                    "Não",
                    "Não pode ser usado"
                  ],
                  [
                    "C-D",
                    "1",
                    "Sim",
                    "Pode entrar em trilha ou caminho"
                  ]
                ]
              }
            },
            {
              "key": "treino-guiado-trilha-e-caminho",
              "title": "Treino guiado",
              "after": "A diferença prática é esta: trilha controla repetição de arestas; caminho controla repetição de vértices.",
              "say": "No grafo do caso local, A-B-C-A-D é uma trilha: usa as arestas AB, BC, AC e AD, sem repetir nenhuma aresta. Ela não é caminho, porque o vértice A aparece duas vezes. Já A-B-C-D é caminho: usa as arestas AB, BC e CD, e nenhum vértice se repete."
            },
            {
              "key": "marcar-subgrafo-de-caminho",
              "title": "Subgrafo do caminho A-B-C-D",
              "after": "Essas duas linhas são modelos próximos do pedido: desenhar um subgrafo que represente uma trilha e outro que represente um caminho.",
              "table": {
                "columns": [
                  "Percurso",
                  "Vértices do subgrafo",
                  "Arestas do subgrafo",
                  "Classificação"
                ],
                "rows": [
                  [
                    "A-B-C-D",
                    "A, B, C, D",
                    "AB, BC, CD",
                    "Caminho"
                  ],
                  [
                    "A-B-C-A-D",
                    "A, B, C, D",
                    "AB, BC, AC, AD",
                    "Trilha, mas não caminho"
                  ]
                ]
              }
            },
            {
              "key": "consolidacao-lacunas",
              "title": "Consolidação",
              "after": "Fechamento: primeiro leia as arestas na matriz; depois confira se o percurso repete arestas ou vértices.",
              "say": "Na matriz de adjacência, uma entrada [[1::um|1]] indica que existe aresta entre dois vértices. No caso local, B-D tem entrada [[0::zero|0]], então a aresta BD não pode ser usada. O percurso A-B-C-D é [[caminho::caminho|trilha]] porque não repete vértices. O percurso A-B-C-A-D é [[trilha::trilha|passeio]] sem repetição de arestas, mas não é caminho porque repete o vértice [[A::A|a]]."
            }
          ],
          "dependsOn": [
            "microsequence-classificar-percursos"
          ]
        }
      ]
    },
    {
      "key": "lesson-menor-caminho-por-dijkstra",
      "title": "Menor caminho por Dijkstra",
      "description": "Aplicar Dijkstra em grafo ponderado representado por matriz de adjacência.",
      "sourceGuideStructured": {
        "lessonGoal": "Aplicar Dijkstra em grafo ponderado representado por matriz de adjacência.",
        "notationRules": "Usar apenas matriz de adjacência; menor caminho por Dijkstra.",
        "commonErrors": "Não tratar zero na matriz como peso de aresta quando ele indica ausência de ligação.",
        "outOfScopeRules": "grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury"
      },
      "sourceGuide": "Meta da lição: Aplicar Dijkstra em grafo ponderado representado por matriz de adjacência.\nIncluir: Usar apenas matriz de adjacência; menor caminho por Dijkstra.\nNão incluir: grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury\nNão confundir com: Não tratar zero na matriz como peso de aresta quando ele indica ausência de ligação.",
      "microsequences": [
        {
          "key": "microsequence-preparar-distancias-iniciais",
          "title": "Preparar distâncias iniciais",
          "description": "Definir origem, distâncias provisórias e vértices ainda não finalizados.",
          "tags": [
            "menor caminho por Dijkstra"
          ],
          "didacticPurpose": "Definir origem, distâncias provisórias e vértices ainda não finalizados.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "dijkstra-inicial-grafo-local",
              "title": "Caso local: origem A",
              "after": "Neste início, apenas a origem A está destacada. Ainda não recalculamos vizinhos; só preparamos os valores iniciais.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A origem",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 2,
                    "y": -1
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 2,
                    "y": 1
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 4,
                    "y": 0
                  },
                  {
                    "id": "E",
                    "label": "E",
                    "x": 6,
                    "y": -1
                  },
                  {
                    "id": "F",
                    "label": "F destino",
                    "x": 8,
                    "y": 0
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "weight": 2,
                    "label": "2"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "weight": 1,
                    "label": "1"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "weight": 4,
                    "label": "4"
                  },
                  {
                    "from": "B",
                    "to": "E",
                    "weight": 5,
                    "label": "5"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "weight": 3,
                    "label": "3"
                  },
                  {
                    "from": "C",
                    "to": "F",
                    "weight": 8,
                    "label": "8"
                  },
                  {
                    "from": "D",
                    "to": "E",
                    "weight": 6,
                    "label": "6"
                  },
                  {
                    "from": "E",
                    "to": "F",
                    "weight": 1,
                    "label": "1"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A"
                  ],
                  "edges": []
                }
              }
            },
            {
              "key": "dijkstra-leitura-inicial",
              "title": "Leitura didática do início",
              "after": "Zero na diagonal da matriz significa distância do vértice para ele mesmo; zero fora da diagonal indica ausência de ligação, não uma aresta de peso 0.",
              "say": "Para começar Dijkstra, escolha o vértice de origem. Aqui a origem é A. A distância provisória de A até ele mesmo é 0. Todos os outros vértices começam com distância provisória infinita, porque ainda não foi feita nenhuma atualização. Também marcamos todos os vértices como ainda não finalizados."
            },
            {
              "key": "dijkstra-tabela-inicial",
              "title": "Tabela inicial de controle",
              "after": "Esta tabela é a base para a prova ou exercício: origem com 0, demais vértices com infinito, nenhum anterior definido e nenhum vértice finalizado.",
              "table": {
                "columns": [
                  "Vértice",
                  "Distância provisória a partir de A",
                  "Anterior",
                  "Finalizado?"
                ],
                "rows": [
                  [
                    "A",
                    "0",
                    "-",
                    "não"
                  ],
                  [
                    "B",
                    "infinito",
                    "-",
                    "não"
                  ],
                  [
                    "C",
                    "infinito",
                    "-",
                    "não"
                  ],
                  [
                    "D",
                    "infinito",
                    "-",
                    "não"
                  ],
                  [
                    "E",
                    "infinito",
                    "-",
                    "não"
                  ],
                  [
                    "F",
                    "infinito",
                    "-",
                    "não"
                  ]
                ]
              }
            },
            {
              "key": "dijkstra-matriz-base",
              "title": "Matriz usada no caso",
              "after": "Na preparação inicial, a matriz serve para identificar o caso, mas os pesos ainda não foram usados para atualizar vizinhos.",
              "table": {
                "columns": [
                  "A",
                  "B",
                  "C",
                  "D",
                  "E",
                  "F"
                ],
                "rows": [
                  [
                    "A",
                    "0",
                    "2",
                    "1",
                    "0",
                    "0",
                    "0"
                  ],
                  [
                    "B",
                    "2",
                    "0",
                    "0",
                    "4",
                    "5",
                    "0"
                  ],
                  [
                    "C",
                    "1",
                    "0",
                    "0",
                    "3",
                    "0",
                    "8"
                  ],
                  [
                    "D",
                    "0",
                    "4",
                    "3",
                    "0",
                    "6",
                    "0"
                  ],
                  [
                    "E",
                    "0",
                    "5",
                    "0",
                    "6",
                    "0",
                    "1"
                  ],
                  [
                    "F",
                    "0",
                    "0",
                    "8",
                    "0",
                    "1",
                    "0"
                  ]
                ]
              }
            },
            {
              "key": "dijkstra-lacunas-iniciais",
              "title": "Consolidação próxima da lista",
              "after": "Se esses quatro pontos estiverem corretos, a etapa de preparação está pronta.",
              "say": "Complete: No Dijkstra, a origem escolhida aqui é [[A::A|F]]. A distância inicial da origem para ela mesma é [[0::0|infinito]]. Os demais vértices começam com distância [[infinito::infinito|0]]. Antes de escolher o próximo vértice, todos ainda estão [[não finalizados::não finalizados|finalizados]]."
            }
          ],
          "dependsOn": []
        },
        {
          "key": "microsequence-atualizar-vizinhos",
          "title": "Atualizar vizinhos",
          "description": "Recalcular distâncias provisórias a partir do vértice de menor distância atual.",
          "tags": [
            "menor caminho por Dijkstra",
            "matriz de adjacência"
          ],
          "didacticPurpose": "Recalcular distâncias provisórias a partir do vértice de menor distância atual.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "atualizar-vizinhos-grafo-local",
              "title": "Caso local: atualizar a partir de C",
              "after": "Neste momento, C tem a menor distância provisória entre os vértices ainda não finalizados: 1. A atualização olha para os vizinhos de C indicados por entradas diferentes de zero na matriz.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A: 0 finalizado",
                    "x": 0,
                    "y": 1
                  },
                  {
                    "id": "B",
                    "label": "B: 2",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C: 1 atual",
                    "x": 1,
                    "y": 2
                  },
                  {
                    "id": "D",
                    "label": "D: ∞",
                    "x": 2,
                    "y": 1
                  },
                  {
                    "id": "E",
                    "label": "E: ∞",
                    "x": 3,
                    "y": 0
                  },
                  {
                    "id": "F",
                    "label": "F: ∞",
                    "x": 3,
                    "y": 2
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "weight": 2,
                    "label": "2"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "weight": 1,
                    "label": "1"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "weight": 4,
                    "label": "4"
                  },
                  {
                    "from": "B",
                    "to": "E",
                    "weight": 5,
                    "label": "5"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "weight": 3,
                    "label": "3"
                  },
                  {
                    "from": "C",
                    "to": "F",
                    "weight": 8,
                    "label": "8"
                  },
                  {
                    "from": "D",
                    "to": "E",
                    "weight": 6,
                    "label": "6"
                  },
                  {
                    "from": "E",
                    "to": "F",
                    "weight": 1,
                    "label": "1"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "C",
                    "D",
                    "F"
                  ],
                  "edges": [
                    [
                      "C",
                      "D"
                    ],
                    [
                      "C",
                      "F"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-didatica-do-caso",
              "title": "Leitura da etapa",
              "after": "Zero na matriz significa ausência de ligação, não uma aresta de peso zero.",
              "say": "Na etapa de atualizar vizinhos, não se procura ainda o caminho final. O trabalho é local: pegar o vértice atual de menor distância provisória e testar se passar por ele melhora a distância dos seus vizinhos. No caso mostrado, C já está com distância 1 a partir de A. Pela matriz, C se liga a A com peso 1, a D com peso 3 e a F com peso 8. Como A já estava finalizado, a atualização útil agora recai sobre D e F."
            },
            {
              "key": "tabela-atualizacao-c",
              "title": "Cálculo das novas distâncias",
              "after": "A regra é sempre comparar: se a distância calculada pelo vértice atual for menor que a distância provisória antiga, substitua.",
              "table": {
                "columns": [
                  "Vizinho testado",
                  "Peso a partir de C",
                  "Conta",
                  "Distância antiga",
                  "Nova distância provisória"
                ],
                "rows": [
                  [
                    "D",
                    "3",
                    "dist(C) + 3 = 1 + 3 = 4",
                    "∞",
                    "4"
                  ],
                  [
                    "F",
                    "8",
                    "dist(C) + 8 = 1 + 8 = 9",
                    "∞",
                    "9"
                  ],
                  [
                    "B",
                    "0 na posição C-B",
                    "não há aresta C-B",
                    "2",
                    "permanece 2"
                  ],
                  [
                    "E",
                    "0 na posição C-E",
                    "não há aresta C-E",
                    "∞",
                    "permanece ∞"
                  ]
                ]
              }
            },
            {
              "key": "regra-manual-atualizar",
              "title": "Regra manual",
              "after": "Depois dessa atualização, o vértice atual pode ser tratado como finalizado nesta rodada do Dijkstra.",
              "say": "Para atualizar vizinhos manualmente: escolha o vértice não finalizado com menor distância provisória; leia sua linha na matriz de adjacência; ignore as posições com 0; para cada peso diferente de 0, some esse peso à distância do vértice atual; mantenha o menor valor encontrado para cada vizinho."
            },
            {
              "key": "treino-guiado-lacunas",
              "title": "Treino guiado",
              "after": "Esse treino fica apenas na atualização das distâncias, sem reconstruir ainda a rota final.",
              "say": "Partindo de A, depois de observar que C tem distância provisória 1, atualizamos seus vizinhos. Para D, a conta é 1 + 3 = [[4::4|3|5]]. Para F, a conta é 1 + 8 = [[9::9|8|10]]. Uma entrada 0 na matriz deve ser lida como [[ausência de ligação::ausência de ligação|peso zero]]. Portanto, C-B e C-E não alteram as distâncias provisórias."
            },
            {
              "key": "consolidacao-formato-lista",
              "title": "Consolidação",
              "after": "A etapa termina com as distâncias provisórias recalculadas a partir do vértice atual.",
              "table": {
                "columns": [
                  "Pergunta no formato da lista",
                  "Resposta esperada"
                ],
                "rows": [
                  [
                    "Dada a matriz de adjacência, se C é o vértice atual com distância 1, quais vizinhos podem ser atualizados?",
                    "D e F, pois C-D tem peso 3 e C-F tem peso 8."
                  ],
                  [
                    "Qual fica sendo a distância provisória de D ao passar por C?",
                    "4."
                  ],
                  [
                    "Qual fica sendo a distância provisória de F ao passar por C?",
                    "9."
                  ],
                  [
                    "O que fazer com as entradas 0 da linha de C?",
                    "Ignorar, pois indicam ausência de ligação."
                  ]
                ]
              }
            }
          ],
          "dependsOn": [
            "microsequence-preparar-distancias-iniciais"
          ]
        },
        {
          "key": "microsequence-reconstruir-o-menor-caminho",
          "title": "Reconstruir o menor caminho",
          "description": "Determinar a rota final e seu custo total entre origem e destino.",
          "tags": [
            "menor caminho por Dijkstra"
          ],
          "didacticPurpose": "Determinar a rota final e seu custo total entre origem e destino.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "grafo-caso-local-menor-caminho",
              "title": "Caso local: de A até F",
              "after": "As arestas destacadas formam a rota final reconstruída para ir de A até F.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 1
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 1,
                    "y": 2
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 2,
                    "y": 1
                  },
                  {
                    "id": "E",
                    "label": "E",
                    "x": 3,
                    "y": 0
                  },
                  {
                    "id": "F",
                    "label": "F",
                    "x": 4,
                    "y": 1
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "weight": 2,
                    "label": "2"
                  },
                  {
                    "from": "A",
                    "to": "C",
                    "weight": 1,
                    "label": "1"
                  },
                  {
                    "from": "B",
                    "to": "D",
                    "weight": 4,
                    "label": "4"
                  },
                  {
                    "from": "B",
                    "to": "E",
                    "weight": 5,
                    "label": "5"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "weight": 3,
                    "label": "3"
                  },
                  {
                    "from": "C",
                    "to": "F",
                    "weight": 8,
                    "label": "8"
                  },
                  {
                    "from": "D",
                    "to": "E",
                    "weight": 6,
                    "label": "6"
                  },
                  {
                    "from": "E",
                    "to": "F",
                    "weight": 1,
                    "label": "1"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "E",
                    "F"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "B",
                      "E"
                    ],
                    [
                      "E",
                      "F"
                    ]
                  ]
                }
              }
            },
            {
              "key": "leitura-didatica-do-caso",
              "title": "Leitura do caminho",
              "after": "Essa leitura usa apenas o resultado das atualizações anteriores: distância final e predecessor de cada vértice.",
              "say": "Depois que o Dijkstra termina, não basta olhar apenas o custo final. Para reconstruir a rota, partimos do destino F e voltamos pelos predecessores registrados: F veio de E, E veio de B, e B veio de A. Lendo ao contrário, o menor caminho é A, B, E, F."
            },
            {
              "key": "tabela-final-predecessores",
              "title": "Tabela final para prova",
              "after": "A linha de F mostra custo 8 e predecessor E; por isso a reconstrução começa em F e volta para E.",
              "table": {
                "columns": [
                  "Vértice",
                  "Distância final desde A",
                  "Predecessor usado na rota"
                ],
                "rows": [
                  [
                    "A",
                    "0",
                    "nenhum"
                  ],
                  [
                    "B",
                    "2",
                    "A"
                  ],
                  [
                    "C",
                    "1",
                    "A"
                  ],
                  [
                    "D",
                    "4",
                    "C"
                  ],
                  [
                    "E",
                    "7",
                    "B"
                  ],
                  [
                    "F",
                    "8",
                    "E"
                  ]
                ]
              }
            },
            {
              "key": "calculo-do-custo-total",
              "title": "Custo da rota reconstruída",
              "after": "O zero da matriz continua significando ausência de ligação, não uma aresta de custo zero.",
              "say": "Na rota A, B, E, F, somamos os pesos das arestas usadas: A-B vale 2, B-E vale 5 e E-F vale 1. Portanto, o custo total é 2 + 5 + 1 = 8. A rota A, C, F teria custo 1 + 8 = 9, então não é a menor neste caso."
            },
            {
              "key": "treino-lista-anexa",
              "title": "Treino guiado",
              "after": "A resposta deve trazer a rota e o custo total, como em uma questão de lista.",
              "say": "Dada a matriz de adjacência ponderada do caso local, o menor caminho do vértice A até o vértice F é [[A-B-E-F::A-C-F|A-B-D-E-F|A-B-E-F]]. O custo total desse caminho é [[8::7|8|9]]. Para reconstruir a rota, começamos pelo destino [[F::A|E|F]] e voltamos pelos predecessores até chegar em [[A::A|B|F]]."
            }
          ],
          "dependsOn": [
            "microsequence-atualizar-vizinhos"
          ]
        }
      ]
    },
    {
      "key": "lesson-grafos-eulerianos",
      "title": "Grafos eulerianos",
      "description": "Decidir se um grafo é euleriano ou semieuleriano usando graus e conectividade informada.",
      "sourceGuideStructured": {
        "lessonGoal": "Decidir se um grafo é euleriano ou semieuleriano usando graus e conectividade informada.",
        "notationRules": "Usar apenas grafos eulerianos e semieulerianos; grau de vértice e sequência de graus; número par de vértices de grau ímpar.",
        "commonErrors": "Não confundir ciclo euleriano com qualquer ciclo do grafo.",
        "outOfScopeRules": "grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury"
      },
      "sourceGuide": "Meta da lição: Decidir se um grafo é euleriano ou semieuleriano usando graus e conectividade informada.\nIncluir: Usar apenas grafos eulerianos e semieulerianos; grau de vértice e sequência de graus; número par de vértices de grau ímpar.\nNão incluir: grafos direcionados, planaridade, redes neurais, Word2Vec, coloração, Hamiltoniano, árvore geradora mínima, algoritmo de Fleury\nNão confundir com: Não confundir ciclo euleriano com qualquer ciclo do grafo.",
      "microsequences": [
        {
          "key": "microsequence-reconhecer-grafo-euleriano",
          "title": "Reconhecer grafo euleriano",
          "description": "Verificar se um grafo conexo tem todos os vértices de grau par.",
          "tags": [
            "grafos eulerianos e semieulerianos",
            "grau de vértice e sequência de graus"
          ],
          "didacticPurpose": "Verificar se um grafo conexo tem todos os vértices de grau par.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "microsequence-reconhecer-grafo-euleriano-card-1",
              "title": "Caso local: grafo conexo com graus pares",
              "after": "Observe que o desenho forma um único grafo conectado: todos os vértices pertencem à mesma parte do desenho.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 1
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 2,
                    "y": 1
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 1,
                    "y": 2
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "aresta"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "aresta"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "aresta"
                  },
                  {
                    "from": "D",
                    "to": "A",
                    "label": "aresta"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "A",
                    "B",
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "A",
                      "B"
                    ],
                    [
                      "B",
                      "C"
                    ],
                    [
                      "C",
                      "D"
                    ],
                    [
                      "D",
                      "A"
                    ]
                  ]
                }
              }
            },
            {
              "key": "microsequence-reconhecer-grafo-euleriano-card-2",
              "title": "Leitura do caso",
              "after": "Aqui, não basta enxergar um ciclo qualquer: a decisão veio da conectividade e dos graus dos vértices.",
              "say": "Para reconhecer um grafo euleriano nesta etapa, faça duas verificações simples: primeiro, o grafo deve ser conexo; depois, todos os vértices devem ter grau par. No grafo mostrado, A tem grau 2, B tem grau 2, C tem grau 2 e D tem grau 2. Como o grafo é conexo e todos os graus são pares, ele é euleriano."
            },
            {
              "key": "microsequence-reconhecer-grafo-euleriano-card-3",
              "title": "Tabela de verificação",
              "after": "A tabela carrega a prova: todos os vértices do grafo conexo têm grau par.",
              "table": {
                "columns": [
                  "Vértice",
                  "Arestas incidentes",
                  "Grau",
                  "Paridade"
                ],
                "rows": [
                  [
                    "A",
                    "AB e AD",
                    "2",
                    "par"
                  ],
                  [
                    "B",
                    "AB e BC",
                    "2",
                    "par"
                  ],
                  [
                    "C",
                    "BC e CD",
                    "2",
                    "par"
                  ],
                  [
                    "D",
                    "CD e AD",
                    "2",
                    "par"
                  ]
                ]
              }
            },
            {
              "key": "microsequence-reconhecer-grafo-euleriano-card-4",
              "title": "Treino guiado",
              "after": "A palavra importante é todos: se a condição vale para cada vértice do grafo conexo, a classificação é euleriana.",
              "say": "Complete a decisão: um grafo conexo é euleriano quando [[todos os vértices têm grau par::todos os vértices têm grau par|existe pelo menos uma aresta]]. No caso A=2, B=2, C=2, D=2, todos os graus são [[pares::pares|ímpares]], então o grafo é [[euleriano::euleriano|não euleriano]]."
            },
            {
              "key": "microsequence-reconhecer-grafo-euleriano-card-5",
              "title": "Consolidação no formato da lista",
              "after": "Fechamento: para reconhecer grafo euleriano aqui, confirme grafo conexo e grau par em todos os vértices.",
              "table": {
                "columns": [
                  "Afirmação",
                  "Resposta",
                  "Justificativa curta"
                ],
                "rows": [
                  [
                    "Um grafo conexo com grau par em todos os vértices é euleriano.",
                    "Verdadeira",
                    "É exatamente o critério usado nesta microssequência."
                  ],
                  [
                    "No grafo A-B-C-D-A, a sequência de graus é {2,2,2,2}.",
                    "Verdadeira",
                    "Cada vértice toca duas arestas."
                  ],
                  [
                    "Para decidir se o grafo é euleriano, basta contar os graus sem considerar se ele é conexo.",
                    "Falsa",
                    "A conectividade também deve estar informada ou verificada."
                  ]
                ]
              }
            }
          ],
          "dependsOn": []
        },
        {
          "key": "microsequence-reconhecer-grafo-semieuleriano",
          "title": "Reconhecer grafo semieuleriano",
          "description": "Verificar se um grafo conexo tem exatamente dois vértices de grau ímpar.",
          "tags": [
            "grafos eulerianos e semieulerianos",
            "número par de vértices de grau ímpar"
          ],
          "didacticPurpose": "Verificar se um grafo conexo tem exatamente dois vértices de grau ímpar.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "semieuleriano-caso-local-grafo",
              "title": "Caso local: dois graus ímpares",
              "after": "Observe que o grafo está todo em uma única parte conectada e que os vértices destacados são os candidatos a grau ímpar.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 0
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 2,
                    "y": 0
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 1,
                    "y": 1.5
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 3,
                    "y": 1.5
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "AB"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "BC"
                  },
                  {
                    "from": "C",
                    "to": "A",
                    "label": "CA"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "CD"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "C",
                    "D"
                  ],
                  "edges": [
                    [
                      "C",
                      "D"
                    ]
                  ]
                }
              }
            },
            {
              "key": "semieuleriano-leitura-didatica",
              "title": "Leitura do caso",
              "after": "A diferença para o caso euleriano já estudado é simples: euleriano tem todos os graus pares; semieuleriano tem exatamente dois graus ímpares.",
              "say": "Para reconhecer um grafo semieuleriano nesta lição, faça uma verificação curta: primeiro confirme que o grafo é conexo; depois conte o grau de cada vértice; por fim, veja se aparecem exatamente dois vértices de grau ímpar. No grafo mostrado, C e D são os dois vértices de grau ímpar, então ele é semieuleriano."
            },
            {
              "key": "semieuleriano-tabela-graus",
              "title": "Contagem de graus",
              "after": "A tabela carrega a prova da decisão: há exatamente dois graus ímpares, C e D.",
              "table": {
                "columns": [
                  "Vértice",
                  "Arestas incidentes",
                  "Grau",
                  "Paridade"
                ],
                "rows": [
                  [
                    "A",
                    "AB, AC",
                    "2",
                    "par"
                  ],
                  [
                    "B",
                    "AB, BC",
                    "2",
                    "par"
                  ],
                  [
                    "C",
                    "BC, AC, CD",
                    "3",
                    "ímpar"
                  ],
                  [
                    "D",
                    "CD",
                    "1",
                    "ímpar"
                  ]
                ]
              }
            },
            {
              "key": "semieuleriano-treino-guiado",
              "title": "Treino guiado",
              "after": "Use a paridade dos graus, não a aparência do desenho, para justificar a resposta.",
              "say": "Complete a decisão: se o grafo é [[conexo::conexo|desconexo]] e sua sequência de graus é {3, 2, 2, 1}, então existem [[dois::dois|quatro]] vértices de grau ímpar. Portanto, o grafo é [[semieuleriano::semieuleriano|euleriano]]."
            },
            {
              "key": "semieuleriano-consolidacao-lista",
              "title": "Consolidação no formato da lista",
              "after": "Fechamento: para esta etapa, a regra operacional é: conexo + exatamente dois vértices de grau ímpar = semieuleriano.",
              "say": "Exercício: um grafo conexo tem sequência de graus {4, 3, 2, 2, 1}. Esse grafo é semieuleriano? Resposta manual: sim. Os graus ímpares são 3 e 1, portanto há exatamente dois vértices de grau ímpar. Como o grafo é conexo, ele é semieuleriano."
            }
          ],
          "dependsOn": [
            "microsequence-reconhecer-grafo-euleriano"
          ]
        },
        {
          "key": "microsequence-julgar-afirmacoes-eulerianas",
          "title": "Julgar afirmações eulerianas",
          "description": "Classificar afirmações sobre graus, ciclos e propriedades eulerianas como verdadeiras ou falsas.",
          "tags": [
            "grafos eulerianos e semieulerianos"
          ],
          "didacticPurpose": "Classificar afirmações sobre graus, ciclos e propriedades eulerianas como verdadeiras ou falsas.",
          "status": "ready",
          "included": true,
          "cards": [
            {
              "key": "card-1-caso-local-grafo-semieuleriano",
              "title": "Caso Local",
              "after": "Use este grafo como caso de teste: ele é conexo e tem exatamente dois vértices de grau ímpar.",
              "graph": {
                "vertices": [
                  {
                    "id": "A",
                    "label": "A",
                    "x": 0,
                    "y": 1
                  },
                  {
                    "id": "B",
                    "label": "B",
                    "x": 1,
                    "y": 2
                  },
                  {
                    "id": "C",
                    "label": "C",
                    "x": 2,
                    "y": 1
                  },
                  {
                    "id": "D",
                    "label": "D",
                    "x": 1,
                    "y": 0
                  },
                  {
                    "id": "E",
                    "label": "E",
                    "x": 3,
                    "y": 0
                  }
                ],
                "edges": [
                  {
                    "from": "A",
                    "to": "B",
                    "label": "aresta"
                  },
                  {
                    "from": "B",
                    "to": "C",
                    "label": "aresta"
                  },
                  {
                    "from": "C",
                    "to": "D",
                    "label": "aresta"
                  },
                  {
                    "from": "D",
                    "to": "A",
                    "label": "aresta"
                  },
                  {
                    "from": "D",
                    "to": "E",
                    "label": "aresta"
                  }
                ],
                "highlight": {
                  "vertices": [
                    "D",
                    "E"
                  ],
                  "edges": [
                    [
                      "D",
                      "E"
                    ]
                  ]
                }
              }
            },
            {
              "key": "card-2-leitura-do-caso",
              "title": "Leitura Do Caso",
              "after": "A decisão não depende de encontrar qualquer ciclo no desenho; depende de graus e conectividade.",
              "say": "No grafo mostrado, os graus são: A=2, B=2, C=2, D=3 e E=1. Como o grafo é conexo e possui exatamente dois vértices de grau ímpar, ele é semieuleriano. Ele não é euleriano, porque nem todos os vértices têm grau par."
            },
            {
              "key": "card-3-tabela-de-julgamento",
              "title": "Como Julgar Afirmações",
              "after": "A tabela carrega o critério de prova: primeiro identifique a condição, depois aplique a regra correta.",
              "table": {
                "columns": [
                  "Afirmação",
                  "Teste necessário",
                  "Julgamento"
                ],
                "rows": [
                  [
                    "Se todo vértice tem grau maior ou igual a 2, então o grafo contém ciclos.",
                    "Verificar a condição de grau mínimo. Em grafo finito, essa condição força a existência de ciclo.",
                    "Verdadeira"
                  ],
                  [
                    "Um grafo conexo com grau par em todos os vértices é euleriano.",
                    "Verificar conectividade e se todos os graus são pares.",
                    "Verdadeira"
                  ],
                  [
                    "Um grafo conexo e semieuleriano tem no máximo dois vértices de grau ímpar.",
                    "Pela regra local, semieuleriano tem exatamente dois vértices de grau ímpar.",
                    "Verdadeira, mas escrita de forma fraca: exatamente dois também satisfaz no máximo dois."
                  ]
                ]
              }
            },
            {
              "key": "card-4-completar-regras",
              "title": "Completar Regras",
              "after": "Essas três frases bastam para resolver os julgamentos típicos desta etapa.",
              "say": "Um grafo conexo é euleriano quando todos os seus vértices têm grau [[par::ímpar|par]]. Um grafo conexo é semieuleriano quando tem exatamente [[dois::zero|dois]] vértices de grau [[ímpar::par|ímpar]]. Pelo resultado de paridade, a quantidade de vértices de grau ímpar em um grafo é sempre [[par::par|ímpar]]."
            },
            {
              "key": "card-5-treino-lista-anexa",
              "title": "Treino Guiado",
              "after": "Na letra c, lembre que semieuleriano usa exatamente dois vértices ímpares; por isso a expressão no máximo dois não torna a frase falsa.",
              "say": "Julgue como V ou F: a) Se todo vértice de um grafo tem grau maior ou igual a 2, então o grafo contém ciclos: [[V::V|F]]. b) Um grafo conexo com grau par em todos os vértices é euleriano: [[V::V|F]]. c) Um grafo conexo e semieuleriano tem no máximo dois vértices com grau ímpar: [[V::V|F]]."
            },
            {
              "key": "card-6-fechamento-manual",
              "title": "Fechamento",
              "say": "Para julgar uma afirmação euleriana, leia com cuidado as palavras da frase. Se a frase fala em euleriano, procure grafo conexo e todos os graus pares. Se fala em semieuleriano, procure grafo conexo e exatamente dois graus ímpares. Se a frase fala só em existir ciclo, não confunda isso com ciclo euleriano."
            }
          ],
          "dependsOn": [
            "microsequence-reconhecer-grafo-semieuleriano"
          ]
        }
      ]
    }
  ]
};
