const RAW_ORGANIZACAO_ARQUITETURA_COMPUTADORES_COURSE = Object.freeze(
{
  "id": "course-organizacao-arquitetura-computadores",
  "title": "Organização e Arquitetura de Computadores",
  "goal": "Compreender como modelos, arquiteturas e suportes físicos de informação condicionam a computação clássica e quântica.",
  "modules": [
    {
      "id": "module-mobilerag",
      "title": "MobileRAG",
      "guide": {
        "goal": "Compreender MobileRAG como solução de RAG on-device que adapta busca, memória e geração aos limites físicos de smartphones.",
        "include": [
          "RAG como recuperação + geração",
          "on-device",
          "privacidade e operação offline",
          "smartphone versus servidor",
          "RAM limitada",
          "CPU limitada",
          "bateria finita",
          "armazenamento Flash",
          "I/O",
          "embedding",
          "vetor",
          "busca vetorial",
          "similaridade por cosseno",
          "top-k",
          "top-r",
          "sLM",
          "token",
          "TTFT",
          "EcoVector",
          "clusters",
          "centróides",
          "listas invertidas",
          "grafo de centróides",
          "SCR",
          "segmentação",
          "score de segmento",
          "contexto reduzido",
          "trade-off arquitetural",
          "energia aproximada",
          "resultados reportados no artigo",
          "preparação de apresentação"
        ],
        "exclude": [
          "treinamento de LLMs",
          "matemática detalhada de quantização",
          "implementação Android",
          "código de produção",
          "prova formal de HNSW",
          "prova formal de k-means",
          "prova formal de IVF",
          "prova formal de PQ",
          "análise estatística completa dos experimentos",
          "configuração de Ollama",
          "programação SQLite",
          "detalhes jurídicos de privacidade"
        ],
        "notation": [
          "Use q para vetor da pergunta.",
          "Use d para vetor do documento quando a fórmula for similaridade entre pergunta e documento.",
          "Use d_dim para dimensão do vetor.",
          "Use e_q para embedding da pergunta.",
          "Use e_i para embedding do segmento i.",
          "Use μ_j para centróide do cluster j.",
          "Use k para quantidade de documentos ou resultados recuperados.",
          "Use r para quantidade de segmentos selecionados.",
          "Use |C| para quantidade de centróides.",
          "Use T_busca, T_redução e T_inferência para decompor TTFT.",
          "Use E_CPU, E_RAM e E_Flash para decompor energia."
        ],
        "avoid": [
          "Não dizer que MobileRAG é sempre melhor.",
          "Não dizer que celular vira equivalente a servidor.",
          "Não dizer que SCR nunca perde informação.",
          "Não dizer que RAG é a mesma coisa que ChatGPT.",
          "Não transformar as fórmulas em cálculo extenso.",
          "Não criar perguntas abertas."
        ]
      },
      "lessons": [
        {
          "id": "lesson-01-base-entender-mobilerag",
          "title": "Base para entender MobileRAG",
          "guide": {
            "goal": "Explicar o problema antes das fórmulas.",
            "include": [
              "smartphone versus servidor",
              "RAG como recuperação + geração",
              "on-device",
              "privacidade",
              "offline",
              "RAM",
              "CPU",
              "bateria",
              "Flash",
              "latência"
            ],
            "exclude": [
              "treinamento de LLMs",
              "matemática detalhada de quantização",
              "implementação Android",
              "código de produção",
              "prova formal de HNSW",
              "prova formal de k-means",
              "prova formal de IVF",
              "prova formal de PQ",
              "análise estatística completa dos experimentos",
              "configuração de Ollama",
              "programação SQLite",
              "detalhes jurídicos de privacidade"
            ],
            "notation": [
              "Usar RAG como recuperação + geração."
            ],
            "avoid": [
              "Não iniciar por fórmulas antes do exemplo concreto.",
              "Não dizer que usar modelo menor resolve todo o problema."
            ]
          },
          "topics": [
            {
              "id": "topic-rag",
              "label": "RAG",
              "kind": "concept",
              "checks": [
                "define RAG como recuperação + geração"
              ],
              "errors": [
                "achar que RAG é geração sem documentos"
              ]
            },
            {
              "id": "topic-on-device",
              "label": "on-device",
              "kind": "concept",
              "checks": [
                "explica que o processamento roda no próprio aparelho"
              ],
              "errors": [
                "achar que on-device depende sempre de servidor"
              ]
            },
            {
              "id": "topic-restricoes-smartphone",
              "label": "restrições de smartphone",
              "kind": "concept",
              "checks": [
                "relaciona RAM, CPU, bateria, Flash e latência"
              ],
              "errors": [
                "achar que basta usar um modelo menor"
              ]
            },
            {
              "id": "topic-privacidade-offline",
              "label": "privacidade e offline",
              "kind": "concept",
              "checks": [
                "explica por que dados locais podem reduzir envio externo"
              ],
              "errors": [
                "confundir privacidade com ausência de custo computacional"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-01-problema-on-device",
              "title": "Por que RAG é difícil no smartphone",
              "goal": "Reconhecer o problema arquitetural: RAG local precisa respeitar limites de memória, processamento, energia e latência.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "RAG",
                "on-device",
                "restrições de smartphone",
                "privacidade",
                "offline"
              ],
              "checks": [
                "identifica que o gargalo envolve RAM, CPU, bateria e latência",
                "distingue smartphone de servidor",
                "explica por que processar localmente pode preservar privacidade e funcionar offline"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Apresenta o problema de executar RAG em smartphones e pratica a identificação dos gargalos.",
                  "cards": [
                    {
                      "id": "card-01-01-problema-concreto",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Um problema de smartphone",
                      "text": "Um smartphone pode guardar PDFs, mensagens e anotações pessoais. Se a pessoa pergunta Qual era o prazo daquele trabalho no PDF da disciplina?, o sistema precisa procurar informação e responder sem depender de um servidor.",
                      "after": "A dificuldade nasce da combinação entre dados locais, resposta rápida e limites de hardware do aparelho."
                    },
                    {
                      "id": "card-01-02-servidor-smartphone",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Servidor e smartphone",
                      "columns": [
                        "Ambiente",
                        "Recursos disponíveis",
                        "Efeito para RAG"
                      ],
                      "rows": [
                        [
                          "Servidor",
                          "Mais memória, energia contínua e maior capacidade de processamento",
                          "Pode manter índices maiores e comparar mais dados"
                        ],
                        [
                          "Smartphone",
                          "RAM menor, CPU móvel, bateria finita e Flash local",
                          "Precisa escolher melhor o que carregar e processar"
                        ]
                      ],
                      "after": "A comparação mostra por que levar a mesma estratégia de servidor para o celular pode causar gargalos."
                    },
                    {
                      "id": "card-01-03-problema-central",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Problema central",
                      "question": "Para executar RAG localmente em um smartphone, qual é o problema central?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Equilibrar busca, memória, CPU, bateria e latência no próprio aparelho."
                        },
                        {
                          "id": "b",
                          "text": "Trocar todos os documentos por respostas gravadas antes da pergunta."
                        },
                        {
                          "id": "c",
                          "text": "Usar apenas a tela para mostrar mais texto ao usuário."
                        },
                        {
                          "id": "d",
                          "text": "Ignorar a etapa de busca e sempre gerar sem documentos."
                        }
                      ],
                      "answer": "a",
                      "after": "O ponto arquitetural é equilibrar recursos físicos limitados enquanto o sistema busca e gera resposta."
                    },
                    {
                      "id": "card-01-04-gargalos-efeitos",
                      "position": 4,
                      "resource": "relation_map",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Gargalos e efeitos",
                      "prompt": "Associe cada recurso limitado a um efeito provável no RAG local.",
                      "leftSet": {
                        "label": "Recurso limitado",
                        "items": [
                          {
                            "id": "ram",
                            "label": "RAM"
                          },
                          {
                            "id": "cpu",
                            "label": "CPU"
                          },
                          {
                            "id": "bat",
                            "label": "Bateria"
                          },
                          {
                            "id": "flash",
                            "label": "Flash"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Efeito provável",
                        "items": [
                          {
                            "id": "mem",
                            "label": "Nem todo índice cabe carregado"
                          },
                          {
                            "id": "calc",
                            "label": "Comparações aumentam custo de processamento"
                          },
                          {
                            "id": "ene",
                            "label": "Mais trabalho reduz autonomia"
                          },
                          {
                            "id": "io",
                            "label": "Leituras precisam ser controladas"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "ram",
                          "to": "mem"
                        },
                        {
                          "from": "cpu",
                          "to": "calc"
                        },
                        {
                          "from": "bat",
                          "to": "ene"
                        },
                        {
                          "from": "flash",
                          "to": "io"
                        }
                      ],
                      "after": "O mapa liga cada parte do hardware ao tipo de decisão que o MobileRAG precisa considerar.",
                      "question": "Qual associação está correta?",
                      "options": [
                        {
                          "id": "a",
                          "text": "CPU → comparações aumentam custo de processamento."
                        },
                        {
                          "id": "b",
                          "text": "RAM → autonomia infinita do aparelho."
                        },
                        {
                          "id": "c",
                          "text": "Flash → geração automática da resposta final."
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-01-05-on-device",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "O que significa on-device",
                      "text": "On-device significa que o pipeline roda no próprio aparelho. Isso pode preservar privacidade e permitir uso offline, porque os documentos pessoais não precisam ser enviados a um servidor para responder.",
                      "after": "O benefício não elimina custo: o aparelho passa a fazer localmente busca, leitura de dados e geração."
                    },
                    {
                      "id": "card-01-06-lacuna-offline",
                      "position": 6,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Privacidade e offline",
                      "text": "Em RAG on-device, os dados ficam no próprio aparelho; por isso a solução pode favorecer [[privacidade::privacidade|contagem de slides|aumento de brilho]] e funcionamento offline.",
                      "after": "Privacidade é favorecida porque o sistema evita enviar documentos pessoais para fora do dispositivo."
                    },
                    {
                      "id": "card-01-07-erro-modelo-menor",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Erro provável",
                      "question": "Um colega diz: Basta usar um modelo menor e o problema do RAG no smartphone acaba. Qual resposta corrige melhor essa ideia?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Um modelo menor ajuda, mas ainda é preciso reduzir busca, memória, tokens e movimentação de dados."
                        },
                        {
                          "id": "b",
                          "text": "Um modelo menor elimina a necessidade de recuperar documentos."
                        },
                        {
                          "id": "c",
                          "text": "Um modelo menor faz todos os vetores caberem automaticamente na RAM."
                        },
                        {
                          "id": "d",
                          "text": "Um modelo menor remove qualquer consumo de energia."
                        }
                      ],
                      "answer": "a",
                      "after": "O gargalo não está só no modelo; a busca vetorial, a leitura no Flash, a RAM e a entrada do modelo também importam."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            },
            {
              "id": "micro-02-rag-base",
              "title": "RAG antes dos termos técnicos",
              "goal": "Entender RAG como busca de informação relevante seguida de geração de resposta.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-01-problema-on-device"
              ],
              "covers": [
                "RAG",
                "recuperação",
                "geração",
                "PDF da disciplina",
                "pergunta do usuário"
              ],
              "checks": [
                "define RAG como recuperação + geração",
                "distingue recuperar trechos de gerar resposta",
                "usa um exemplo concreto para explicar o fluxo"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Explica RAG por meio de um exemplo de pergunta sobre PDF e pratica a separação entre recuperação e geração.",
                  "cards": [
                    {
                      "id": "card-02-01-exemplo-rag-pdf",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "RAG por um exemplo",
                      "text": "Pergunta do usuário: Qual era o prazo daquele trabalho no PDF da disciplina? Em RAG, a recuperação encontra trechos relevantes no PDF. Depois, a geração transforma esses trechos em uma resposta em linguagem natural.",
                      "after": "O exemplo separa as duas partes essenciais: primeiro buscar informação, depois escrever a resposta."
                    },
                    {
                      "id": "card-02-02-fluxo-rag",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Recuperação mais geração",
                      "prompt": "Fluxo básico de RAG para a pergunta sobre o prazo no PDF.",
                      "after": "O fluxo evita confundir RAG com geração isolada: a resposta usa evidências recuperadas.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Pergunta do usuário"
                          },
                          {
                            "kind": "process",
                            "text": "Recuperação de trechos no PDF"
                          },
                          {
                            "kind": "process",
                            "text": "Trechos relevantes"
                          },
                          {
                            "kind": "end",
                            "text": "Geração da resposta"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-02-03-definicao-rag",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Definição de RAG",
                      "question": "Qual alternativa define RAG de forma adequada para esta unidade?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Buscar informações relevantes e usar um modelo de linguagem para gerar resposta baseada nelas."
                        },
                        {
                          "id": "b",
                          "text": "Gerar texto sem consultar documentos."
                        },
                        {
                          "id": "c",
                          "text": "Converter todo texto em imagem antes de responder."
                        },
                        {
                          "id": "d",
                          "text": "Mostrar a lista completa de arquivos sem interpretar a pergunta."
                        }
                      ],
                      "answer": "a",
                      "after": "RAG combina recuperação de informação com geração textual; sem recuperação, vira apenas geração."
                    },
                    {
                      "id": "card-02-04-recuperacao-geracao",
                      "position": 4,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Duas etapas diferentes",
                      "text": "Na recuperação, o sistema procura trechos que combinam com a pergunta. Na geração, o modelo recebe a pergunta e os trechos selecionados para escrever uma resposta clara.",
                      "after": "Separar as etapas ajuda a entender onde EcoVector e SCR atuam no MobileRAG."
                    },
                    {
                      "id": "card-02-05-etapa-correta",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Etapa do exemplo",
                      "question": "No exemplo Qual era o prazo daquele trabalho no PDF da disciplina?, qual ação pertence à etapa de recuperação?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Encontrar no PDF o trecho que menciona o prazo."
                        },
                        {
                          "id": "b",
                          "text": "Escrever a resposta final em linguagem natural."
                        },
                        {
                          "id": "c",
                          "text": "Escolher o tamanho da fonte da resposta."
                        },
                        {
                          "id": "d",
                          "text": "Substituir a pergunta por uma resposta fixa."
                        }
                      ],
                      "answer": "a",
                      "after": "Recuperar é localizar evidências relevantes. Escrever a resposta vem depois."
                    },
                    {
                      "id": "card-02-06-lacuna-rag",
                      "position": 6,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Fórmula verbal do RAG",
                      "text": "RAG pode ser lembrado como [[recuperação + geração::recuperação + geração|brilho + som|senha + tela]].",
                      "after": "A expressão resume a ideia sem exigir termos técnicos antes da hora."
                    },
                    {
                      "id": "card-02-07-rag-nao-e-chatbot",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Confusão comum",
                      "question": "Qual frase evita uma confusão comum ao explicar RAG?",
                      "options": [
                        {
                          "id": "a",
                          "text": "RAG não é só conversar; ele busca trechos relevantes antes de gerar a resposta."
                        },
                        {
                          "id": "b",
                          "text": "RAG sempre responde sem consultar documentos."
                        },
                        {
                          "id": "c",
                          "text": "RAG é apenas uma lista de arquivos do aparelho."
                        },
                        {
                          "id": "d",
                          "text": "RAG serve somente para calcular porcentagem de bateria."
                        }
                      ],
                      "answer": "a",
                      "after": "A busca de evidências é a parte que diferencia RAG de uma geração sem documentos."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            }
          ]
        },
        {
          "id": "lesson-02-vocabulario-formulas",
          "title": "Vocabulário, vetores e fórmulas essenciais",
          "guide": {
            "goal": "Explicar termos e fórmulas dos slides sem cálculo extenso.",
            "include": [
              "embedding",
              "vetor",
              "busca vetorial",
              "similaridade por cosseno",
              "top-k",
              "top-r",
              "token",
              "sLM",
              "TTFT",
              "I/O",
              "energia aproximada"
            ],
            "exclude": [
              "treinamento de LLMs",
              "matemática detalhada de quantização",
              "implementação Android",
              "código de produção",
              "prova formal de HNSW",
              "prova formal de k-means",
              "prova formal de IVF",
              "prova formal de PQ",
              "análise estatística completa dos experimentos",
              "configuração de Ollama",
              "programação SQLite",
              "detalhes jurídicos de privacidade"
            ],
            "notation": [
              "similaridade(q, d) = cos(q, d) = (q · d) / (||q|| ||d||)",
              "TTFT ≈ T_busca + T_redução + T_inferência",
              "E_total ≈ E_CPU + E_RAM + E_Flash"
            ],
            "avoid": [
              "Não transformar fórmula em conta extensa.",
              "Não usar matriz como tabela textual."
            ]
          },
          "topics": [
            {
              "id": "topic-embedding",
              "label": "embedding",
              "kind": "term",
              "checks": [
                "identifica embedding como lista de números para comparar significado"
              ],
              "errors": [
                "achar que embedding é resumo textual"
              ]
            },
            {
              "id": "topic-busca-vetorial",
              "label": "busca vetorial",
              "kind": "procedure",
              "checks": [
                "explica busca por comparação de vetores"
              ],
              "errors": [
                "achar que busca vetorial é contagem literal de palavras"
              ]
            },
            {
              "id": "topic-similaridade-cosseno",
              "label": "similaridade por cosseno",
              "kind": "representation",
              "checks": [
                "interpreta direção parecida entre q e d"
              ],
              "errors": [
                "tentar resolver por cálculo extenso"
              ]
            },
            {
              "id": "topic-topk-topr",
              "label": "top-k e top-r",
              "kind": "term",
              "checks": [
                "distingue resultados de busca e segmentos selecionados"
              ],
              "errors": [
                "confundir top-k com top-r"
              ]
            },
            {
              "id": "topic-ttft",
              "label": "TTFT",
              "kind": "term",
              "checks": [
                "define tempo até o primeiro token"
              ],
              "errors": [
                "confundir TTFT com tempo total de estudo"
              ]
            },
            {
              "id": "topic-io",
              "label": "I/O RAM-Flash",
              "kind": "concept",
              "checks": [
                "relaciona I/O à movimentação de dados"
              ],
              "errors": [
                "achar que Flash não tem custo"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-03-vocabulario-vetores",
              "title": "Vocabulário, embeddings e vetores",
              "goal": "Entender os termos usados nos slides antes das fórmulas.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "embedding",
                "vetor",
                "busca vetorial",
                "top-k",
                "top-r",
                "sLM",
                "token",
                "TTFT",
                "I/O"
              ],
              "checks": [
                "reconhece embedding como lista de números",
                "distingue top-k de top-r",
                "relaciona token e TTFT"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Apresenta vocabulário essencial com exemplos numéricos e prática de distinção entre termos.",
                  "cards": [
                    {
                      "id": "card-03-01-embedding-explicacao",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Embedding em linguagem simples",
                      "text": "Embedding é transformar texto em uma lista de números. Ele não é resumo textual, não é tradução e não foi feito para leitura humana. Ele serve para comparar significados por meio de vetores.",
                      "after": "A ideia importante é funcional: textos com sentidos parecidos tendem a ficar próximos no espaço numérico."
                    },
                    {
                      "id": "card-03-02-embedding-exemplo",
                      "position": 2,
                      "resource": "matrix",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Exemplo de vetor",
                      "prompt": "Texto: prazo do trabalho. Embedding ilustrativo com quatro valores numéricos.",
                      "name": "e_texto",
                      "values": [
                        [
                          0.23,
                          -0.11,
                          0.48,
                          0.07
                        ]
                      ],
                      "after": "O vetor é apenas uma representação numérica simplificada para mostrar o formato.",
                      "question": "O que o embedding ilustrativo representa?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Uma lista de números usada para comparar significado."
                        },
                        {
                          "id": "b",
                          "text": "Uma tradução automática do texto."
                        },
                        {
                          "id": "c",
                          "text": "Um resumo textual pronto para apresentar."
                        },
                        {
                          "id": "d",
                          "text": "Uma resposta final para o usuário."
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-03-03-termos-significados",
                      "position": 3,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Termos essenciais",
                      "prompt": "Associe cada termo ao significado usado na unidade.",
                      "leftSet": {
                        "label": "Termo",
                        "items": [
                          {
                            "id": "emb",
                            "label": "Embedding"
                          },
                          {
                            "id": "vec",
                            "label": "Vetor"
                          },
                          {
                            "id": "topk",
                            "label": "Top-k"
                          },
                          {
                            "id": "tok",
                            "label": "Token"
                          },
                          {
                            "id": "io",
                            "label": "I/O"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Significado",
                        "items": [
                          {
                            "id": "num",
                            "label": "Texto convertido em números"
                          },
                          {
                            "id": "lista",
                            "label": "Lista de valores"
                          },
                          {
                            "id": "melhores",
                            "label": "k melhores resultados"
                          },
                          {
                            "id": "pedaco",
                            "label": "Pedaço de texto processado"
                          },
                          {
                            "id": "dados",
                            "label": "Entrada e saída de dados"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "emb",
                          "to": "num"
                        },
                        {
                          "from": "vec",
                          "to": "lista"
                        },
                        {
                          "from": "topk",
                          "to": "melhores"
                        },
                        {
                          "from": "tok",
                          "to": "pedaco"
                        },
                        {
                          "from": "io",
                          "to": "dados"
                        }
                      ],
                      "after": "O mapa fixa vocabulário mínimo para entender os slides técnicos."
                    },
                    {
                      "id": "card-03-04-o-que-e-topk",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Top-k",
                      "question": "Em busca vetorial, top-k significa:",
                      "options": [
                        {
                          "id": "a",
                          "text": "Selecionar os k documentos ou trechos com maior relevância segundo a busca."
                        },
                        {
                          "id": "b",
                          "text": "Selecionar os r segmentos depois que o SCR já reduziu o conteúdo."
                        },
                        {
                          "id": "c",
                          "text": "Escolher sempre todos os documentos guardados no aparelho."
                        },
                        {
                          "id": "d",
                          "text": "Medir o número de palavras idênticas entre pergunta e documento."
                        }
                      ],
                      "answer": "a",
                      "after": "Top-k se refere aos melhores resultados da busca; top-r será usado depois para segmentos selecionados pelo SCR."
                    },
                    {
                      "id": "card-03-05-slm-token-ttft",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "sLM, token e TTFT",
                      "text": "sLM é um modelo de linguagem pequeno. Token é um pedaço de texto processado pelo modelo. TTFT é o tempo até aparecer o primeiro token da resposta.",
                      "after": "Esses três termos ajudam a explicar por que reduzir a entrada do modelo melhora a sensação de resposta rápida."
                    },
                    {
                      "id": "card-03-06-token-ttft",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Token e resposta",
                      "question": "Qual frase está correta?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Mais tokens na entrada tendem a aumentar o trabalho do modelo antes da resposta começar."
                        },
                        {
                          "id": "b",
                          "text": "Token é sempre um documento completo recuperado pela busca."
                        },
                        {
                          "id": "c",
                          "text": "TTFT mede a quantidade total de arquivos no Flash."
                        },
                        {
                          "id": "d",
                          "text": "sLM é o nome da etapa que escolhe os clusters."
                        }
                      ],
                      "answer": "a",
                      "after": "O modelo precisa processar tokens; por isso uma entrada grande pode aumentar o tempo até o primeiro token."
                    },
                    {
                      "id": "card-03-07-vetor-humano",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Leitura humana",
                      "text": "Um embedding é uma lista de números feita para comparação computacional, não para ser [[lida diretamente por humanos::lida diretamente por humanos|usada como título do slide|tratada como rodapé]].",
                      "after": "O vetor é útil para cálculo de similaridade, não para comunicação direta com a pessoa."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            },
            {
              "id": "micro-04-similaridade-ttft-energia",
              "title": "Similaridade, TTFT e energia",
              "goal": "Interpretar as fórmulas dos slides sem cálculo extenso.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-03-vocabulario-vetores"
              ],
              "covers": [
                "similaridade por cosseno",
                "TTFT",
                "energia aproximada",
                "CPU",
                "RAM",
                "Flash"
              ],
              "checks": [
                "identifica q como vetor da pergunta",
                "identifica d como vetor do documento",
                "interpreta cosseno como direção parecida",
                "interpreta TTFT e energia como somas aproximadas"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Explica as fórmulas essenciais por significado e pratica a leitura de suas partes.",
                  "cards": [
                    {
                      "id": "card-04-01-formula-cosseno-ponte",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Similaridade por cosseno",
                      "text": "A fórmula similaridade(q, d) = cos(q, d) = (q · d) / (||q|| ||d||) compara o vetor da pergunta q com o vetor do documento d. Ela indica se os dois apontam para direções parecidas no espaço de embeddings.",
                      "after": "A fórmula deve ser explicada por significado, não por cálculo extenso."
                    },
                    {
                      "id": "card-04-02-vetores-parecidos",
                      "position": 2,
                      "resource": "plane",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Direções parecidas",
                      "prompt": "O plano mostra dois vetores saindo da origem. Para resolver, use a ideia: vetores com direções parecidas sugerem textos com significados próximos.",
                      "after": "O desenho serve como intuição visual para a similaridade por cosseno.",
                      "vectors": [
                        [
                          3,
                          2
                        ],
                        [
                          4,
                          3
                        ]
                      ],
                      "question": "Se q e d apontam para direções parecidas, o que a busca vetorial tende a concluir?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Pergunta e documento têm maior chance de tratar de assunto parecido."
                        },
                        {
                          "id": "b",
                          "text": "O documento é maior em número de páginas."
                        },
                        {
                          "id": "c",
                          "text": "O Flash deixou de ter custo de leitura."
                        },
                        {
                          "id": "d",
                          "text": "O top-r deve vir antes do top-k."
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-04-03-partes-formula",
                      "position": 3,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Partes da fórmula",
                      "columns": [
                        "Símbolo",
                        "Significado"
                      ],
                      "rows": [
                        [
                          "q",
                          "vetor da pergunta"
                        ],
                        [
                          "d",
                          "vetor do documento"
                        ],
                        [
                          "q · d",
                          "alinhamento entre vetores"
                        ],
                        [
                          "||q|| e ||d||",
                          "tamanhos dos vetores"
                        ]
                      ],
                      "after": "A tabela oferece uma ponte para leigos: o aluno precisa explicar o papel de cada parte, não fazer conta numérica."
                    },
                    {
                      "id": "card-04-04-o-que-mede-cosseno",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "O que a fórmula mede",
                      "question": "Na fórmula similaridade(q, d) = cos(q, d), o que a similaridade por cosseno mede neste contexto?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Se pergunta e documento apontam para direções de significado parecidas."
                        },
                        {
                          "id": "b",
                          "text": "A quantidade exata de palavras repetidas entre pergunta e documento."
                        },
                        {
                          "id": "c",
                          "text": "O tamanho do arquivo PDF no armazenamento."
                        },
                        {
                          "id": "d",
                          "text": "A porcentagem de bateria usada pela tela."
                        }
                      ],
                      "answer": "a",
                      "after": "O erro plausível é pensar em palavras iguais; a busca vetorial compara significado representado por vetores."
                    },
                    {
                      "id": "card-04-05-formula-ttft-energia",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "TTFT e energia em fórmulas simples",
                      "text": "TTFT ≈ T_busca + T_redução + T_inferência. Energia pode ser lembrada como E_total ≈ E_CPU + E_RAM + E_Flash. As duas fórmulas mostram que tempo e energia vêm de partes diferentes do pipeline e do hardware.",
                      "after": "Essas decomposições aproximadas ajudam a conectar IA com Organização e Arquitetura de Computadores."
                    },
                    {
                      "id": "card-04-06-menos-token-ttft",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Menos tokens e TTFT",
                      "question": "Considere TTFT ≈ T_busca + T_redução + T_inferência. Por que reduzir tokens enviados ao modelo pode reduzir TTFT?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Porque pode diminuir T_inferência, já que o modelo processa uma entrada menor."
                        },
                        {
                          "id": "b",
                          "text": "Porque elimina a necessidade de armazenar qualquer dado no Flash."
                        },
                        {
                          "id": "c",
                          "text": "Porque transforma a busca em uma resposta pronta."
                        },
                        {
                          "id": "d",
                          "text": "Porque faz a CPU deixar de executar instruções."
                        }
                      ],
                      "answer": "a",
                      "after": "A redução de tokens atua principalmente no trabalho inicial do modelo, representado por T_inferência."
                    },
                    {
                      "id": "card-04-07-energia-cpu",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Energia e processamento",
                      "question": "Na decomposição aproximada da energia total, qual parcela representa o custo principal do processamento?",
                      "options": [
                        {
                          "id": "a",
                          "text": "E_CPU"
                        },
                        {
                          "id": "b",
                          "text": "E_RAM"
                        },
                        {
                          "id": "c",
                          "text": "E_Flash"
                        }
                      ],
                      "answer": "a",
                      "after": "E_CPU representa energia associada ao trabalho de processamento; RAM e Flash aparecem ligados a manter e acessar dados."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            }
          ]
        },
        {
          "id": "lesson-03-pipeline-ecovector-scr",
          "title": "Pipeline, EcoVector e SCR",
          "guide": {
            "goal": "Explicar o método central do artigo.",
            "include": [
              "pipeline MobileRAG",
              "comparação Naive-RAG EdgeRAG MobileRAG",
              "EcoVector",
              "clusters",
              "centróides",
              "listas invertidas",
              "RAM",
              "Flash",
              "I/O controlado",
              "SCR",
              "segmentação",
              "scores",
              "top-r",
              "contexto reduzido"
            ],
            "exclude": [
              "treinamento de LLMs",
              "matemática detalhada de quantização",
              "implementação Android",
              "código de produção",
              "prova formal de HNSW",
              "prova formal de k-means",
              "prova formal de IVF",
              "prova formal de PQ",
              "análise estatística completa dos experimentos",
              "configuração de Ollama",
              "programação SQLite",
              "detalhes jurídicos de privacidade"
            ],
            "notation": [
              "c* = argmax_j sim(q, μ_j)",
              "Memória RAM ≈ |C| × d_dim × 4 bytes",
              "score_i = cos(e_q, e_i)",
              "C_red = Top-r(score_i)"
            ],
            "avoid": [
              "Não dizer que SCR nunca perde informação.",
              "Não dizer que MobileRAG elimina todos os custos."
            ]
          },
          "topics": [
            {
              "id": "topic-pipeline",
              "label": "pipeline MobileRAG",
              "kind": "procedure",
              "checks": [
                "ordena consulta, embedding, EcoVector, documentos, SCR, sLM e resposta"
              ],
              "errors": [
                "colocar SCR antes da recuperação"
              ]
            },
            {
              "id": "topic-ecovector",
              "label": "EcoVector",
              "kind": "procedure",
              "checks": [
                "explica busca por clusters e centróides"
              ],
              "errors": [
                "achar que todos os vetores precisam ficar na RAM"
              ]
            },
            {
              "id": "topic-scr",
              "label": "SCR",
              "kind": "procedure",
              "checks": [
                "seleciona segmentos por score e top-r"
              ],
              "errors": [
                "confundir redução seletiva com corte aleatório"
              ]
            },
            {
              "id": "topic-listas-invertidas",
              "label": "listas invertidas",
              "kind": "term",
              "checks": [
                "explica lista de vetores por cluster"
              ],
              "errors": [
                "achar que lista invertida é uma resposta gerada"
              ]
            },
            {
              "id": "topic-clusters-centroides",
              "label": "clusters e centróides",
              "kind": "concept",
              "checks": [
                "distingue grupo e representante"
              ],
              "errors": [
                "confundir centróide com documento completo"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-05-comparacao-pipeline",
              "title": "Comparação e pipeline do MobileRAG",
              "goal": "Comparar métodos e reconhecer a ordem do pipeline do MobileRAG.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "Naive-RAG",
                "EdgeRAG",
                "MobileRAG",
                "pipeline MobileRAG",
                "EcoVector",
                "SCR",
                "sLM",
                "TTFT"
              ],
              "checks": [
                "reconhece que Naive-RAG é simples, mas custoso",
                "reconhece que EdgeRAG alivia RAM, mas pode enviar contexto amplo",
                "ordena corretamente as etapas do pipeline"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Compara métodos e apresenta o pipeline local do MobileRAG com prática de ordem.",
                  "cards": [
                    {
                      "id": "card-05-01-comparacao-metodos",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Naive-RAG, EdgeRAG e MobileRAG",
                      "columns": [
                        "Método",
                        "Estratégia",
                        "Gargalo que permanece"
                      ],
                      "rows": [
                        [
                          "Naive-RAG",
                          "Busca documentos e envia muito contexto ao modelo",
                          "Pode aumentar CPU, memória e TTFT"
                        ],
                        [
                          "EdgeRAG",
                          "Alivia RAM usando armazenamento de borda",
                          "Ainda pode enviar contexto amplo ao modelo"
                        ],
                        [
                          "MobileRAG",
                          "Combina EcoVector e SCR",
                          "Depende de escolhas cuidadosas de busca e redução"
                        ]
                      ],
                      "after": "A comparação mostra que MobileRAG atua em dois pontos: busca e entrada do modelo."
                    },
                    {
                      "id": "card-05-02-particularidade-mobilerag",
                      "position": 2,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Particularidade do MobileRAG",
                      "question": "Qual alternativa descreve a particularidade do MobileRAG?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Ele reduz custo da busca com EcoVector e reduz a entrada do modelo com SCR."
                        },
                        {
                          "id": "b",
                          "text": "Ele apenas troca o nome do modelo de linguagem."
                        },
                        {
                          "id": "c",
                          "text": "Ele sempre coloca todos os vetores na RAM."
                        },
                        {
                          "id": "d",
                          "text": "Ele ignora documentos e gera resposta sem recuperação."
                        }
                      ],
                      "answer": "a",
                      "after": "A contribuição do método é atacar busca e geração, não apenas escolher um modelo menor."
                    },
                    {
                      "id": "card-05-03-pipeline-mobile",
                      "position": 3,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Pipeline do MobileRAG",
                      "prompt": "Ordem do pipeline local.",
                      "after": "O fluxo mostra onde cada parte atua antes de aparecer a resposta.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Consulta"
                          },
                          {
                            "kind": "process",
                            "text": "Embedding da consulta"
                          },
                          {
                            "kind": "process",
                            "text": "EcoVector"
                          },
                          {
                            "kind": "process",
                            "text": "Documentos recuperados"
                          },
                          {
                            "kind": "process",
                            "text": "SCR"
                          },
                          {
                            "kind": "process",
                            "text": "sLM"
                          },
                          {
                            "kind": "end",
                            "text": "Resposta"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-05-04-ordem-exercicio",
                      "position": 4,
                      "resource": "flow",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Ordem das etapas",
                      "prompt": "Pipeline: Consulta → Embedding da consulta → EcoVector → Documentos recuperados → SCR → sLM → Resposta.",
                      "after": "A ordem correta coloca SCR depois da recuperação, pois ele reduz conteúdo já encontrado.",
                      "question": "Qual etapa vem imediatamente depois de Documentos recuperados?",
                      "options": [
                        {
                          "id": "a",
                          "text": "SCR"
                        },
                        {
                          "id": "b",
                          "text": "Embedding da consulta"
                        },
                        {
                          "id": "c",
                          "text": "Consulta"
                        },
                        {
                          "id": "d",
                          "text": "Resposta"
                        }
                      ],
                      "answer": "a",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Consulta"
                          },
                          {
                            "kind": "process",
                            "text": "Embedding da consulta"
                          },
                          {
                            "kind": "process",
                            "text": "EcoVector"
                          },
                          {
                            "kind": "process",
                            "text": "Documentos recuperados"
                          },
                          {
                            "kind": "process",
                            "text": "SCR"
                          },
                          {
                            "kind": "process",
                            "text": "sLM"
                          },
                          {
                            "kind": "end",
                            "text": "Resposta"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-05-05-slm-llm-quantizada",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Modelo menor não basta",
                      "text": "Um sLM ou uma LLM quantizada pode ajudar porque reduz custo do modelo. Ainda assim, isso não basta se o sistema enviar contexto demais ou fizer busca com muitas comparações. MobileRAG também reduz o trabalho da busca e o tamanho da entrada do modelo.",
                      "after": "A intuição correta é combinar modelo econômico com pipeline econômico."
                    },
                    {
                      "id": "card-05-06-erro-scr-antes",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "SCR no lugar correto",
                      "question": "No pipeline Consulta → Embedding → EcoVector → Documentos recuperados → SCR → sLM → Resposta, por que SCR não vem antes da busca?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Porque SCR reduz documentos ou trechos já recuperados pela busca."
                        },
                        {
                          "id": "b",
                          "text": "Porque SCR substitui a pergunta do usuário por um centróide."
                        },
                        {
                          "id": "c",
                          "text": "Porque SCR escolhe a porcentagem de bateria do aparelho."
                        },
                        {
                          "id": "d",
                          "text": "Porque SCR guarda todos os vetores na RAM."
                        }
                      ],
                      "answer": "a",
                      "after": "SCR precisa receber conteúdo candidato; por isso aparece depois da recuperação."
                    },
                    {
                      "id": "card-05-07-ttft-pipeline",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "TTFT no pipeline",
                      "text": "No pipeline, reduzir busca e entrada do modelo pode diminuir o tempo até o primeiro token, chamado [[TTFT::TTFT|top-k|Flash]].",
                      "after": "TTFT é a medida percebida quando a resposta começa a aparecer."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            },
            {
              "id": "micro-06-ecovector",
              "title": "EcoVector: clusters, centróides, RAM e Flash",
              "goal": "Explicar como EcoVector reduz pressão sobre RAM e CPU com carregamento seletivo.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-05-comparacao-pipeline"
              ],
              "covers": [
                "EcoVector",
                "clusters",
                "centróides",
                "grafo de centróides",
                "listas invertidas",
                "RAM",
                "Flash",
                "I/O",
                "top-k"
              ],
              "checks": [
                "explica cluster como grupo de vetores parecidos",
                "explica centróide como representante",
                "identifica o que fica na RAM",
                "identifica o que fica no Flash",
                "interpreta c* e memória aproximada"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Explica a busca com clusters, centróides, listas invertidas e separação entre RAM e Flash.",
                  "cards": [
                    {
                      "id": "card-06-01-ecovector-ideia",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Ideia do EcoVector",
                      "text": "EcoVector organiza vetores em clusters. Cada cluster tem um centróide, que funciona como representante. A busca compara a pergunta com centróides primeiro e carrega apenas a parte mais promissora do índice.",
                      "after": "A ideia reduz pressão sobre RAM e evita muitas comparações iniciais."
                    },
                    {
                      "id": "card-06-02-passos-eco",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Passos do EcoVector",
                      "prompt": "Fluxo simplificado da busca com EcoVector.",
                      "after": "O fluxo mostra a troca: menos dados fixos na RAM e leitura seletiva no Flash.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Consulta em vetor q"
                          },
                          {
                            "kind": "process",
                            "text": "Comparar q com centróides"
                          },
                          {
                            "kind": "process",
                            "text": "Escolher cluster promissor"
                          },
                          {
                            "kind": "process",
                            "text": "Carregar lista do Flash"
                          },
                          {
                            "kind": "end",
                            "text": "Buscar top-k no conjunto menor"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-06-03-grafo-centroides",
                      "position": 3,
                      "resource": "graph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Grafo de centróides",
                      "prompt": "Cada vértice representa um centróide. Cada centróide representa um cluster. As arestas indicam vizinhança entre representantes parecidos; o desenho deve ser gerado pelo app a partir da estrutura.",
                      "vertices": [
                        {
                          "id": "mu1",
                          "label": "μ1"
                        },
                        {
                          "id": "mu2",
                          "label": "μ2"
                        },
                        {
                          "id": "mu3",
                          "label": "μ3"
                        },
                        {
                          "id": "mu4",
                          "label": "μ4"
                        }
                      ],
                      "edges": [
                        {
                          "from": "mu1",
                          "to": "mu2"
                        },
                        {
                          "from": "mu2",
                          "to": "mu3"
                        },
                        {
                          "from": "mu2",
                          "to": "mu4"
                        },
                        {
                          "from": "mu3",
                          "to": "mu4"
                        }
                      ],
                      "after": "O grafo apoia navegação entre representantes sem exigir coordenadas manuais."
                    },
                    {
                      "id": "card-06-04-ram-flash",
                      "position": 4,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "RAM e Flash no EcoVector",
                      "columns": [
                        "Local",
                        "O que fica ali",
                        "Motivo"
                      ],
                      "rows": [
                        [
                          "RAM",
                          "centróides e grafo de centróides",
                          "acesso rápido a representantes"
                        ],
                        [
                          "Flash",
                          "listas invertidas e dados completos dos clusters",
                          "maior capacidade de armazenamento"
                        ],
                        [
                          "Leitura seletiva",
                          "cluster escolhido",
                          "evita carregar tudo de uma vez"
                        ]
                      ],
                      "after": "A tabela separa o que precisa estar rápido do que pode ser lido sob demanda."
                    },
                    {
                      "id": "card-06-05-o-que-fica-ram",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "O que fica na RAM",
                      "question": "No EcoVector, qual item fica na RAM para guiar a busca inicial?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Centróides e grafo de centróides."
                        },
                        {
                          "id": "b",
                          "text": "Todos os vetores completos de todos os documentos."
                        },
                        {
                          "id": "c",
                          "text": "A resposta final gerada pelo sLM."
                        },
                        {
                          "id": "d",
                          "text": "Todos os PDFs convertidos para texto integral."
                        }
                      ],
                      "answer": "a",
                      "after": "A RAM guarda representantes compactos para decidir onde procurar; os dados completos podem ficar no Flash."
                    },
                    {
                      "id": "card-06-06-lista-invertida",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Lista invertida",
                      "question": "Neste contexto, o que é uma lista invertida?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Uma lista que indica quais vetores pertencem a cada cluster escolhido para busca."
                        },
                        {
                          "id": "b",
                          "text": "Uma tradução da resposta para outra língua."
                        },
                        {
                          "id": "c",
                          "text": "Uma lista de slides em ordem de apresentação."
                        },
                        {
                          "id": "d",
                          "text": "Um contador de tokens gerados pelo sLM."
                        }
                      ],
                      "answer": "a",
                      "after": "A analogia é uma lista de prateleira: depois de escolher o cluster, o sistema sabe onde procurar."
                    },
                    {
                      "id": "card-06-07-formulas-eco",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fórmulas do EcoVector",
                      "text": "A escolha do cluster pode ser expressa por c* = argmax_j sim(q, μ_j). A memória aproximada dos centróides na RAM pode ser vista como Memória RAM ≈ |C| × d_dim × 4 bytes.",
                      "after": "A primeira fórmula escolhe o centróide mais parecido; a segunda mostra que guardar apenas centróides reduz o espaço necessário."
                    },
                    {
                      "id": "card-06-08-memoria-formula",
                      "position": 8,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Memória aproximada",
                      "question": "Na fórmula Memória RAM ≈ |C| × d_dim × 4 bytes, o que a expressão quer mostrar?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A RAM cresce com a quantidade de centróides e com a dimensão dos vetores mantidos como representantes."
                        },
                        {
                          "id": "b",
                          "text": "A RAM não é usada quando há centróides."
                        },
                        {
                          "id": "c",
                          "text": "O Flash sempre some da arquitetura."
                        },
                        {
                          "id": "d",
                          "text": "O top-r substitui a dimensão do vetor."
                        }
                      ],
                      "answer": "a",
                      "after": "A fórmula não é para cálculo difícil; ela mostra a lógica de armazenar representantes em vez de tudo."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            },
            {
              "id": "micro-07-scr",
              "title": "SCR: redução seletiva do conteúdo",
              "goal": "Explicar como SCR reduz contexto, tokens, CPU, latência e energia.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-05-comparacao-pipeline"
              ],
              "covers": [
                "SCR",
                "segmentação",
                "score de segmento",
                "top-r",
                "contexto reduzido",
                "token",
                "sLM",
                "janelas de sentenças",
                "sobreposição",
                "reordenação"
              ],
              "checks": [
                "explica que documentos recuperados ainda podem ter muito contexto",
                "identifica janelas e sobreposição",
                "interpreta score_i e C_red",
                "explica por que menos tokens reduzem trabalho do modelo"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Explica a redução seletiva de conteúdo com janelas, scores, contexto ao redor e reordenação.",
                  "cards": [
                    {
                      "id": "card-07-01-scr-ideia",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Ideia do SCR",
                      "text": "Depois da busca, os documentos recuperados ainda podem ter muito contexto. SCR divide esse conteúdo em segmentos, calcula relevância de cada segmento e envia ao modelo apenas um contexto reduzido.",
                      "after": "SCR atua na entrada do sLM, reduzindo tokens antes da geração."
                    },
                    {
                      "id": "card-07-02-passos-scr",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Passos do SCR",
                      "prompt": "Fluxo simplificado do SCR.",
                      "after": "O fluxo inclui janelas, contexto ao redor e reordenação sem criar fórmula nova.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Documentos recuperados"
                          },
                          {
                            "kind": "process",
                            "text": "Dividir em janelas de sentenças"
                          },
                          {
                            "kind": "process",
                            "text": "Calcular score de segmento"
                          },
                          {
                            "kind": "process",
                            "text": "Adicionar contexto ao redor"
                          },
                          {
                            "kind": "process",
                            "text": "Reordenar por relevância"
                          },
                          {
                            "kind": "end",
                            "text": "Enviar contexto reduzido ao sLM"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-07-03-janelas-sobreposicao",
                      "position": 3,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Janelas e contexto ao redor",
                      "text": "Uma janela de sentenças agrupa um pequeno trecho. A sobreposição permite que partes vizinhas compartilhem sentenças. Depois de escolher um segmento, o SCR pode manter um pouco de contexto antes e depois para não cortar a ideia.",
                      "after": "Essa etapa reduz o risco de escolher uma frase isolada sem explicação suficiente."
                    },
                    {
                      "id": "card-07-04-scores-segmentos",
                      "position": 4,
                      "resource": "table",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Scores de segmentos",
                      "columns": [
                        "Segmento",
                        "Conteúdo resumido",
                        "score_i"
                      ],
                      "rows": [
                        [
                          "s1",
                          "prazo do trabalho e data de entrega",
                          "0,91"
                        ],
                        [
                          "s2",
                          "bibliografia complementar",
                          "0,32"
                        ],
                        [
                          "s3",
                          "critérios de avaliação",
                          "0,58"
                        ]
                      ],
                      "after": "A tabela mostra dados suficientes para aplicar top-r sem depender de outro card.",
                      "question": "Se r = 1, qual segmento entra em C_red = Top-r(score_i)?",
                      "options": [
                        {
                          "id": "a",
                          "text": "s1"
                        },
                        {
                          "id": "b",
                          "text": "s2"
                        },
                        {
                          "id": "c",
                          "text": "s3"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-07-05-formulas-scr",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fórmulas do SCR",
                      "text": "O score de segmento pode ser escrito como score_i = cos(e_q, e_i). Depois, C_red = Top-r(score_i) seleciona os r segmentos com maior pontuação para formar o contexto reduzido.",
                      "after": "e_q representa a pergunta; e_i representa o segmento i."
                    },
                    {
                      "id": "card-07-06-topr-topk",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Top-r e top-k",
                      "question": "Qual diferença está correta?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Top-k escolhe resultados da busca; top-r escolhe segmentos mais relevantes no SCR."
                        },
                        {
                          "id": "b",
                          "text": "Top-r sempre vem antes da busca vetorial."
                        },
                        {
                          "id": "c",
                          "text": "Top-k mede energia de CPU e top-r mede energia de RAM."
                        },
                        {
                          "id": "d",
                          "text": "Top-k e top-r são nomes para o mesmo campo do Flash."
                        }
                      ],
                      "answer": "a",
                      "after": "O erro plausível é confundir as duas seleções; uma ocorre na recuperação e a outra na redução do conteúdo."
                    },
                    {
                      "id": "card-07-07-menos-token",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Menos tokens",
                      "text": "SCR reduz o contexto enviado ao modelo; menos tokens tendem a causar [[menor trabalho do modelo::menor trabalho do modelo|maior envio de todos os documentos|remoção da busca vetorial]].",
                      "after": "Menos tokens reduzem a entrada que o sLM precisa processar antes de iniciar a resposta."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            }
          ]
        },
        {
          "id": "lesson-04-resultados-apresentacao",
          "title": "Resultados e treino de apresentação",
          "guide": {
            "goal": "Preparar o aluno para apresentar e responder dúvidas.",
            "include": [
              "leitura cautelosa dos resultados",
              "CPU",
              "RAM",
              "Flash",
              "energia",
              "latência",
              "fala segura",
              "perguntas prováveis",
              "treino slide a slide"
            ],
            "exclude": [
              "treinamento de LLMs",
              "matemática detalhada de quantização",
              "implementação Android",
              "código de produção",
              "prova formal de HNSW",
              "prova formal de k-means",
              "prova formal de IVF",
              "prova formal de PQ",
              "análise estatística completa dos experimentos",
              "configuração de Ollama",
              "programação SQLite",
              "detalhes jurídicos de privacidade"
            ],
            "notation": [
              "E_total ≈ E_CPU + E_RAM + E_Flash",
              "Usar até e nos cenários reportados ao falar dos resultados."
            ],
            "avoid": [
              "Não dizer que MobileRAG é garantia universal.",
              "Não dizer que SCR nunca perde informação."
            ]
          },
          "topics": [
            {
              "id": "topic-resultados-reportados",
              "label": "resultados reportados",
              "kind": "concept",
              "checks": [
                "lê resultados com até e nos cenários reportados"
              ],
              "errors": [
                "generalizar resultado para qualquer dispositivo"
              ]
            },
            {
              "id": "topic-tradeoff",
              "label": "trade-off arquitetural",
              "kind": "concept",
              "checks": [
                "relaciona CPU RAM Flash energia e latência"
              ],
              "errors": [
                "achar que otimização elimina todo custo"
              ]
            },
            {
              "id": "topic-energia",
              "label": "energia aproximada",
              "kind": "representation",
              "checks": [
                "interpreta E_total como soma aproximada"
              ],
              "errors": [
                "confundir energia com apenas bateria mostrada na tela"
              ]
            },
            {
              "id": "topic-apresentacao",
              "label": "preparação de apresentação",
              "kind": "procedure",
              "checks": [
                "escolhe fala segura por slide"
              ],
              "errors": [
                "usar afirmações absolutas"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-08-arquitetura-resultados",
              "title": "CPU, RAM, Flash, energia e resultados",
              "goal": "Relacionar MobileRAG à arquitetura de computadores e interpretar resultados com cautela.",
              "role": "review",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "CPU",
                "RAM",
                "Flash",
                "I/O",
                "energia",
                "trade-off arquitetural",
                "resultados reportados",
                "apresentação"
              ],
              "checks": [
                "identifica trade-off entre CPU RAM e I/O controlado",
                "interpreta energia como soma aproximada",
                "reconhece que resultados variam por dataset índice modelo e dispositivo",
                "evita afirmações absolutas"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Relaciona MobileRAG com componentes arquiteturais e apresenta resultados reportados com linguagem cautelosa.",
                  "cards": [
                    {
                      "id": "card-08-01-arquitetura-papeis",
                      "position": 1,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Componentes e papéis",
                      "prompt": "Associe cada componente arquitetural ao papel no MobileRAG.",
                      "leftSet": {
                        "label": "Componente",
                        "items": [
                          {
                            "id": "cpu",
                            "label": "CPU"
                          },
                          {
                            "id": "ram",
                            "label": "RAM"
                          },
                          {
                            "id": "flash",
                            "label": "Flash"
                          },
                          {
                            "id": "bat",
                            "label": "Bateria"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Papel",
                        "items": [
                          {
                            "id": "proc",
                            "label": "processa comparações e inferência"
                          },
                          {
                            "id": "rep",
                            "label": "mantém representantes acessíveis"
                          },
                          {
                            "id": "store",
                            "label": "guarda dados de maior volume"
                          },
                          {
                            "id": "lim",
                            "label": "limita autonomia energética"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "cpu",
                          "to": "proc"
                        },
                        {
                          "from": "ram",
                          "to": "rep"
                        },
                        {
                          "from": "flash",
                          "to": "store"
                        },
                        {
                          "from": "bat",
                          "to": "lim"
                        }
                      ],
                      "after": "O mapa conecta MobileRAG diretamente à disciplina de Organização e Arquitetura de Computadores."
                    },
                    {
                      "id": "card-08-02-resultados-comunicaveis",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Resultados comunicáveis com cautela",
                      "columns": [
                        "Aspecto",
                        "Resultado reportado",
                        "Como falar"
                      ],
                      "rows": [
                        [
                          "Latência / TTFT",
                          "até 2,6x melhor, conforme cenário",
                          "nos cenários reportados"
                        ],
                        [
                          "Uso de memória",
                          "até 8,2x menor, conforme cenário",
                          "varia conforme dataset, índice, modelo e dispositivo"
                        ],
                        [
                          "Eficiência energética",
                          "até 3,7x melhor, conforme cenário",
                          "não é garantia universal"
                        ],
                        [
                          "Precisão",
                          "recall semelhante ou superior em vários cenários reportados",
                          "evitar afirmação absoluta"
                        ]
                      ],
                      "after": "A tabela dá números comunicáveis sem exagerar a conclusão."
                    },
                    {
                      "id": "card-08-03-frase-segura-resultados",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Frase segura",
                      "question": "Qual frase é mais segura para a apresentação dos resultados?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Nos cenários reportados, MobileRAG reduziu latência, memória e energia, mantendo recall semelhante ou superior em vários casos."
                        },
                        {
                          "id": "b",
                          "text": "MobileRAG é garantia universal de melhor resultado em qualquer aparelho."
                        },
                        {
                          "id": "c",
                          "text": "MobileRAG elimina o consumo de energia do RAG local."
                        },
                        {
                          "id": "d",
                          "text": "MobileRAG prova que Flash não tem custo em smartphones."
                        }
                      ],
                      "answer": "a",
                      "after": "A frase correta usa nos cenários reportados e evita transformar resultado experimental em regra universal."
                    },
                    {
                      "id": "card-08-04-tradeoff-arquitetural",
                      "position": 4,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Trade-off arquitetural",
                      "text": "MobileRAG troca parte do trabalho contínuo de CPU e pressão sobre RAM por leituras seletivas no Flash. Isso é um trade-off: não elimina custos, mas muda onde e quando eles aparecem.",
                      "after": "Essa é a ponte com arquitetura: desempenho depende de movimentação de dados, memória e processamento."
                    },
                    {
                      "id": "card-08-05-flash-custo",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Flash também tem custo",
                      "question": "Qual frase corrige a ideia de que usar Flash resolve tudo?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Flash tem maior capacidade que RAM, mas leituras precisam ser seletivas para não aumentar latência e energia."
                        },
                        {
                          "id": "b",
                          "text": "Flash é igual à CPU e executa inferência do sLM."
                        },
                        {
                          "id": "c",
                          "text": "Flash elimina a necessidade de centróides."
                        },
                        {
                          "id": "d",
                          "text": "Flash transforma documentos em embeddings sem processamento."
                        }
                      ],
                      "answer": "a",
                      "after": "O ponto é controlar I/O: o Flash ajuda na capacidade, mas não deve ser acessado sem critério."
                    },
                    {
                      "id": "card-08-06-pergunta-precisao",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Pergunta sobre precisão",
                      "question": "Se alguém pergunta se SCR pode perder informação, qual resposta é mais adequada?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Pode haver risco; por isso SCR seleciona por similaridade, preserva contexto ao redor e os resultados devem ser lidos por cenário."
                        },
                        {
                          "id": "b",
                          "text": "Não há risco em nenhum caso, porque qualquer redução sempre mantém tudo que importa."
                        },
                        {
                          "id": "c",
                          "text": "A precisão não depende dos segmentos selecionados."
                        },
                        {
                          "id": "d",
                          "text": "O método substitui todos os documentos por uma frase fixa."
                        }
                      ],
                      "answer": "a",
                      "after": "A resposta segura reconhece o risco e explica o mecanismo de mitigação sem prometer perfeição."
                    },
                    {
                      "id": "card-08-07-energia-aproximada",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Energia aproximada",
                      "text": "A fórmula E_total ≈ E_CPU + E_RAM + E_Flash mostra que a energia do sistema pode ser vista como soma aproximada de componentes de [[processamento, memória e armazenamento::processamento, memória e armazenamento|título, autor e rodapé|cor, brilho e fonte]].",
                      "after": "A decomposição ajuda a explicar por que reduzir CPU, RAM e leituras desnecessárias importa."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            },
            {
              "id": "micro-09-treino-apresentacao",
              "title": "Treino de apresentação slide a slide",
              "goal": "Preparar o aluno para explicar os 10 slides e responder perguntas prováveis com frases seguras.",
              "role": "practice",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-08-arquitetura-resultados"
              ],
              "covers": [
                "apresentação",
                "slides",
                "fala segura",
                "perguntas prováveis",
                "conclusão"
              ],
              "checks": [
                "associa slides a mensagens principais",
                "escolhe frases seguras",
                "responde perguntas sobre precisão e arquitetura",
                "evita exageros"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-05-29T00:00:00Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Produzir cards da microssequência conforme o escopo didático definido.",
                  "summary": "Treina falas objetivas para os slides e respostas seguras para perguntas prováveis.",
                  "cards": [
                    {
                      "id": "card-09-02-fluxo-slides",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fluxo da apresentação",
                      "prompt": "Sequência dos slides e foco principal.",
                      "after": "O fluxo mostra progressão: problema, método, evidências e fechamento.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "1 Título"
                          },
                          {
                            "kind": "process",
                            "text": "2 Problema"
                          },
                          {
                            "kind": "process",
                            "text": "3 Conceitos"
                          },
                          {
                            "kind": "process",
                            "text": "4 Comparação"
                          },
                          {
                            "kind": "process",
                            "text": "5 Pipeline"
                          },
                          {
                            "kind": "process",
                            "text": "6 EcoVector"
                          },
                          {
                            "kind": "process",
                            "text": "7 SCR"
                          },
                          {
                            "kind": "process",
                            "text": "8 Resultados"
                          },
                          {
                            "kind": "process",
                            "text": "9 Arquitetura"
                          },
                          {
                            "kind": "end",
                            "text": "10 Conclusão"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-09-03-abertura-slide-1",
                      "position": 2,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Abertura segura",
                      "question": "Qual frase é uma boa abertura para o slide 1?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Esta apresentação explica MobileRAG, um método para executar RAG localmente em smartphones com menor pressão sobre memória, energia e latência."
                        },
                        {
                          "id": "b",
                          "text": "Este artigo prova que qualquer celular fica equivalente a um servidor."
                        },
                        {
                          "id": "c",
                          "text": "MobileRAG dispensa busca e usa apenas geração de texto."
                        },
                        {
                          "id": "d",
                          "text": "O foco é decorar fórmulas sem explicar hardware."
                        }
                      ],
                      "answer": "a",
                      "after": "A abertura situa método, objetivo e limites sem exagero."
                    },
                    {
                      "id": "card-09-04-slide-3-conceitos",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Slide 3: conceitos essenciais",
                      "question": "O slide 3 deve apresentar embedding, busca vetorial, top-k, sLM, token, TTFT e I/O. Qual explicação está alinhada ao slide?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Embedding transforma texto em vetor; top-k escolhe melhores resultados; TTFT mede o tempo até o primeiro token."
                        },
                        {
                          "id": "b",
                          "text": "Embedding é resumo textual; top-k é quantidade de slides; TTFT é tamanho do PDF."
                        },
                        {
                          "id": "c",
                          "text": "Busca vetorial é só contar palavras iguais e sLM é o nome do Flash."
                        },
                        {
                          "id": "d",
                          "text": "Token é documento completo e I/O é uma fórmula de precisão."
                        }
                      ],
                      "answer": "a",
                      "after": "A alternativa correta cobre os termos sem confundir busca, modelo e hardware."
                    },
                    {
                      "id": "card-09-05-slide-6-formula-eco",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Slide 6: fórmula do EcoVector",
                      "question": "No slide 6, aparece c* = argmax_j sim(q, μ_j). Qual fala explica melhor a fórmula?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A fórmula escolhe o centróide μ_j mais parecido com a pergunta q para indicar o cluster mais promissor."
                        },
                        {
                          "id": "b",
                          "text": "A fórmula escolhe o segmento top-r enviado ao sLM depois do SCR."
                        },
                        {
                          "id": "c",
                          "text": "A fórmula calcula a energia total da CPU, RAM e Flash."
                        },
                        {
                          "id": "d",
                          "text": "A fórmula mostra que todos os vetores precisam ficar na RAM."
                        }
                      ],
                      "answer": "a",
                      "after": "A fala correta liga q, centróide e cluster, que são as peças do EcoVector."
                    },
                    {
                      "id": "card-09-06-pergunta-banca-precisao",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Pergunta provável: precisão",
                      "question": "Pergunta: O método perde precisão ao reduzir conteúdo? Qual resposta é mais segura?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Pode depender do cenário; o SCR seleciona segmentos por similaridade e os experimentos reportam recall semelhante ou superior em vários casos."
                        },
                        {
                          "id": "b",
                          "text": "Nunca perde precisão em nenhum dispositivo e em qualquer documento."
                        },
                        {
                          "id": "c",
                          "text": "Perde sempre, porque reduzir conteúdo impede qualquer resposta."
                        },
                        {
                          "id": "d",
                          "text": "Precisão não importa em RAG on-device."
                        }
                      ],
                      "answer": "a",
                      "after": "A resposta reconhece variação e usa evidência reportada sem promessa absoluta."
                    },
                    {
                      "id": "card-09-07-respostas-prontas",
                      "position": 6,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Perguntas prováveis",
                      "columns": [
                        "Pergunta",
                        "Resposta segura"
                      ],
                      "rows": [
                        [
                          "Por que não usar nuvem?",
                          "Privacidade, offline e menor dependência externa são objetivos do RAG local."
                        ],
                        [
                          "Por que não só modelo menor?",
                          "Ajuda, mas busca, tokens, RAM e I/O também precisam ser reduzidos."
                        ],
                        [
                          "Por que Flash?",
                          "Porque RAM é limitada; o ganho depende de leitura seletiva."
                        ],
                        [
                          "Qual é a diferença entre EcoVector e SCR?",
                          "EcoVector atua na busca; SCR atua na entrada do modelo."
                        ]
                      ],
                      "after": "A tabela prepara respostas curtas e seguras para colegas e avaliadores."
                    },
                    {
                      "id": "card-09-08-conclusao-arquitetura",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Conclusão alinhada à disciplina",
                      "question": "Qual conclusão conecta melhor MobileRAG com Organização e Arquitetura de Computadores?",
                      "options": [
                        {
                          "id": "a",
                          "text": "MobileRAG mostra que IA local depende de adaptar software à CPU, RAM, Flash, energia e latência do dispositivo."
                        },
                        {
                          "id": "b",
                          "text": "MobileRAG é apenas uma mudança estética na apresentação."
                        },
                        {
                          "id": "c",
                          "text": "MobileRAG elimina qualquer necessidade de pensar em hardware."
                        },
                        {
                          "id": "d",
                          "text": "MobileRAG substitui arquitetura por memorização de siglas."
                        }
                      ],
                      "answer": "a",
                      "after": "A conclusão correta mostra o valor arquitetural: eficiência vem de organizar melhor dados e processamento."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-001"
            }
          ]
        }
      ]
    },
    {
      "id": "module-filosofia-computacao-quantica",
      "title": "Filosofia da Computação Quântica",
      "guide": {
        "goal": "Formar uma compreensão conceitual e arquitetural da computação quântica a partir do artigo de Cuffaro, mostrando como estado, informação, medição, modelo de computação, eficiência, explicação e limites físicos se conectam à Organização e Arquitetura de Computadores.",
        "include": [
          "problema conceitual do artigo",
          "relação entre física, ciência da computação e filosofia",
          "computação clássica",
          "computação quântica idealizada",
          "computação quântica real e híbrida",
          "bit",
          "qubit",
          "estado quântico",
          "amplitude",
          "superposição",
          "medição",
          "porta quântica",
          "interferência",
          "emaranhamento",
          "portas X, H e CNOT em nível conceitual",
          "fluxo de algoritmo quântico",
          "arquitetura híbrida",
          "Máquina de Turing",
          "arquitetura de von Neumann",
          "modelos de circuitos quânticos",
          "modelo baseado em medições",
          "custo computacional",
          "crescimento polinomial e exponencial",
          "BPP",
          "BQP",
          "Shor como exemplo conceitual",
          "interpretações instrumental, realista e informacional do estado",
          "medição como revelar, selecionar ou transformar",
          "problema da base preferida",
          "explicação de muitos mundos como explicação discutida e criticada",
          "Teorema de Gottesman-Knill em nível conceitual",
          "ruído",
          "decoerência",
          "correção de erros",
          "controle clássico",
          "limites reais da computação quântica"
        ],
        "exclude": [
          "cálculo matricial avançado",
          "prova formal do Teorema de Bell",
          "prova formal do Teorema de Gottesman-Knill",
          "demonstração matemática do algoritmo de Shor",
          "implementação em Qiskit, Cirq, Python ou bibliotecas",
          "marcas, fabricantes ou plataformas comerciais de hardware",
          "criptografia aplicada em detalhe",
          "computação quântica topológica",
          "annealing quântico em detalhe",
          "equações diferenciais, Hamiltonianos e evolução temporal contínua",
          "álgebra linear com autovalores, produto tensorial formal e espaços de Hilbert em detalhe"
        ],
        "notation": [
          "Usar `bit` para unidade clássica de informação: 0 ou 1.",
          "Usar `qubit` para sistema quântico de dois níveis.",
          "Usar `|ψ⟩ = α|0⟩ + β|1⟩` como fórmula mínima do estado de um qubit.",
          "Usar `|α|² + |β|² = 1` como normalização mínima.",
          "Usar `P(0) = |α|²` e `P(1) = |β|²` apenas em exercícios simples de interpretação.",
          "Usar `BPP ⊆ BQP` e `BPP ⊂ BQP?` como notação conceitual.",
          "Usar nomes de portas `X`, `H` e `CNOT`.",
          "Usar “arquitetura híbrida” para entrada clássica, núcleo quântico, medição e pós-processamento clássico."
        ],
        "avoid": [
          "Não apresentar computação quântica como solução universal.",
          "Não apresentar qubit como versão apenas mais rápida do bit.",
          "Não tratar medição como leitura passiva sem impacto conceitual.",
          "Não transformar a explicação de muitos mundos em explicação aceita e suficiente.",
          "Não dizer que emaranhamento sozinho basta para vantagem.",
          "Não usar exemplos que dependam de slides externos.",
          "Não usar itens de `guide.exclude` em títulos, textos, questões, alternativas ou feedback."
        ]
      },
      "lessons": [
        {
          "id": "lesson-problema-filosofico-computacional",
          "title": "O problema filosófico-computacional",
          "guide": {
            "goal": "Mostrar que o artigo pergunta como a computação muda quando a informação passa a ser representada por sistemas quânticos.",
            "include": [
              "problema conceitual do artigo",
              "relação entre física, ciência da computação e filosofia",
              "relação com Organização e Arquitetura de Computadores",
              "computação clássica",
              "computação quântica idealizada",
              "computação quântica real/híbrida"
            ],
            "exclude": [
              "cálculo matricial avançado",
              "implementação em bibliotecas",
              "detalhes comerciais de hardware"
            ],
            "notation": [
              "Usar “OAC” como abreviação de Organização e Arquitetura de Computadores.",
              "Usar “arquitetura híbrida” para integração entre parte clássica e núcleo quântico."
            ],
            "avoid": [
              "Não reduzir o artigo a promessa de velocidade.",
              "Não tratar filosofia como assunto externo à arquitetura."
            ]
          },
          "topics": [
            {
              "id": "topic-problema-conceitual",
              "label": "problema conceitual",
              "kind": "concept",
              "checks": [
                "reconhece que o artigo discute conceitos, não construção de processador",
                "identifica que computação quântica combina física, computação e filosofia"
              ],
              "errors": [
                "reduzir o artigo a promessa de velocidade",
                "tratar filosofia como assunto externo à arquitetura"
              ]
            },
            {
              "id": "topic-oac-informacao-fisica",
              "label": "informação física e OAC",
              "kind": "concept",
              "checks": [
                "relaciona representação física da informação com arquitetura",
                "reconhece que bits e qubits dependem de suporte físico"
              ],
              "errors": [
                "separar completamente modelo de máquina e realização física"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-problema-artigo",
              "title": "O problema do artigo",
              "goal": "Identificar a tese central do artigo e seu vínculo com computação e filosofia.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "problema conceitual",
                "filosofia da computação quântica",
                "relação entre física e computação"
              ],
              "checks": [
                "identifica a tese central do artigo",
                "distingue problema conceitual de problema de engenharia"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m1-1-tese",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Pergunta central",
                      "text": "A filosofia da computação quântica pergunta o que muda quando a informação passa a ser representada, transformada e medida por sistemas quânticos. Para apresentar essa ideia, diga: “O ponto não é só velocidade; é entender que estado, operação e medição ganham novo sentido quando a informação tem suporte quântico.”",
                      "after": "A pergunta central separa uma promessa vaga de rapidez de uma análise sobre o que conta como informação processada."
                    },
                    {
                      "id": "card-m1-2-mapa-areas",
                      "position": 2,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Três áreas em contato",
                      "prompt": "Associe cada área à pergunta que ela ajuda a formular.",
                      "leftSet": {
                        "label": "Área",
                        "items": [
                          {
                            "id": "fisica",
                            "label": "Física"
                          },
                          {
                            "id": "computacao",
                            "label": "Ciência da computação"
                          },
                          {
                            "id": "filosofia",
                            "label": "Filosofia"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Pergunta",
                        "items": [
                          {
                            "id": "sistema",
                            "label": "Que sistema físico carrega o estado?"
                          },
                          {
                            "id": "processo",
                            "label": "Que operação conta como computação?"
                          },
                          {
                            "id": "sentido",
                            "label": "O que estado e medição significam?"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "fisica",
                          "to": "sistema"
                        },
                        {
                          "from": "computacao",
                          "to": "processo"
                        },
                        {
                          "from": "filosofia",
                          "to": "sentido"
                        }
                      ],
                      "after": "A discussão junta sistema físico, operação computacional e interpretação do que está sendo processado."
                    },
                    {
                      "id": "card-m1-3-foco-artigo",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Foco do artigo",
                      "question": "Qual descrição identifica melhor o foco do artigo?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Examinar problemas sobre estado, operação, medição e explicação na computação quântica."
                        },
                        {
                          "id": "b",
                          "text": "Descrever um componente eletrônico específico pronto para compra."
                        },
                        {
                          "id": "c",
                          "text": "Listar técnicas que aceleram qualquer tarefa em qualquer computador."
                        },
                        {
                          "id": "d",
                          "text": "Trocar toda arquitetura clássica por uma única máquina quântica isolada."
                        }
                      ],
                      "answer": "a",
                      "after": "A resposta correta aponta o foco nos conceitos que mudam quando a computação usa estados quânticos. As outras opções reduzem o tema a produto, promessa universal ou substituição total."
                    },
                    {
                      "id": "card-m1-4-problema-ou-engenharia",
                      "position": 4,
                      "resource": "relation_map",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Tipo de problema",
                      "prompt": "Classifique cada enunciado pelo tipo de pergunta que ele expressa.",
                      "leftSet": {
                        "label": "Enunciado",
                        "items": [
                          {
                            "id": "e1",
                            "label": "O que significa medir um estado?"
                          },
                          {
                            "id": "e2",
                            "label": "Como resfriar e controlar um dispositivo?"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Tipo",
                        "items": [
                          {
                            "id": "conceitual",
                            "label": "Problema conceitual"
                          },
                          {
                            "id": "engenharia",
                            "label": "Problema de engenharia"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "e1",
                          "to": "conceitual"
                        },
                        {
                          "from": "e2",
                          "to": "engenharia"
                        }
                      ],
                      "after": "Perguntar o significado da medição é uma questão sobre interpretação e conceito. Perguntar como controlar um dispositivo é uma questão de construção e operação física.",
                      "question": "Qual par está corretamente representado no mapa?",
                      "options": [
                        {
                          "id": "a",
                          "text": "“O que significa medir um estado?” → problema conceitual"
                        },
                        {
                          "id": "b",
                          "text": "“O que significa medir um estado?” → problema de engenharia"
                        },
                        {
                          "id": "c",
                          "text": "“Como resfriar e controlar um dispositivo?” → problema conceitual"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m1-5-lacuna-oac",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "OAC e informação física",
                      "text": "Em OAC, a forma física de representar informação importa porque limita e habilita operações. Por isso, a computação quântica também é uma pergunta de [[arquitetura::arquitetura|decoração|memorização]].",
                      "after": "Arquitetura envolve suporte físico, operações possíveis e modo de obter saída. O erro plausível é tratar a forma física da informação como detalhe externo à computação."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            },
            {
              "id": "micro-computacao-classica-quantica-real",
              "title": "Três modos de computação",
              "goal": "Comparar computação clássica, quântica idealizada e quântica real/híbrida.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-problema-artigo"
              ],
              "covers": [
                "computação clássica",
                "computação quântica idealizada",
                "computação quântica real/híbrida"
              ],
              "checks": [
                "compara bit, qubit idealizado e qubit físico",
                "reconhece arquitetura híbrida como condição realista"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m2-1-tres-modos",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Três modos de computação",
                      "columns": [
                        "Modo",
                        "Representação típica",
                        "Saída observável"
                      ],
                      "rows": [
                        [
                          "Clássica",
                          "bit observado como 0 ou 1",
                          "valor clássico"
                        ],
                        [
                          "Quântica idealizada",
                          "qubit em estado controlado antes da medição",
                          "resultado clássico após medição"
                        ],
                        [
                          "Quântica real/híbrida",
                          "preparação clássica, núcleo quântico e leitura clássica",
                          "medição com interpretação clássica"
                        ]
                      ],
                      "after": "A comparação mostra que a parte quântica não elimina a saída clássica: ela transforma o estado antes da leitura."
                    },
                    {
                      "id": "card-m2-2-comparacao",
                      "position": 2,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Comparação central",
                      "question": "Em qual opção a diferença está corretamente descrita?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Na computação clássica, o bit observado é 0 ou 1; no caso quântico, a medição produz 0 ou 1 a partir de um estado quântico."
                        },
                        {
                          "id": "b",
                          "text": "Na computação quântica real, a parte clássica desaparece depois que há qubits."
                        },
                        {
                          "id": "c",
                          "text": "Na computação clássica, o suporte físico nunca influencia a arquitetura."
                        },
                        {
                          "id": "d",
                          "text": "No caso quântico, a amplitude aparece diretamente como saída observada."
                        }
                      ],
                      "answer": "a",
                      "after": "O detalhe decisivo é separar descrição do estado e resultado observado. A amplitude ajuda a calcular chances; ela não é a saída lida pelo aluno ou pelo computador."
                    },
                    {
                      "id": "card-m2-3-arquitetura-hibrida",
                      "position": 3,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Arquitetura híbrida",
                      "prompt": "Associe cada etapa ao seu papel. Para apresentar essa ideia, diga: “Um sistema quântico útil combina preparação clássica, operações quânticas, medição e interpretação clássica.”",
                      "leftSet": {
                        "label": "Etapa",
                        "items": [
                          {
                            "id": "entrada",
                            "label": "Pré-processamento clássico"
                          },
                          {
                            "id": "nucleo",
                            "label": "Núcleo quântico"
                          },
                          {
                            "id": "saida",
                            "label": "Pós-processamento clássico"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Papel",
                        "items": [
                          {
                            "id": "prepara",
                            "label": "Prepara dados e parâmetros"
                          },
                          {
                            "id": "transforma",
                            "label": "Transforma estados quânticos"
                          },
                          {
                            "id": "interpreta",
                            "label": "Interpreta resultados medidos"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "entrada",
                          "to": "prepara"
                        },
                        {
                          "from": "nucleo",
                          "to": "transforma"
                        },
                        {
                          "from": "saida",
                          "to": "interpreta"
                        }
                      ],
                      "after": "Arquitetura híbrida significa integração entre partes clássicas e uma etapa quântica, não abandono completo do computador clássico."
                    },
                    {
                      "id": "card-m2-4-identificar-modo",
                      "position": 4,
                      "resource": "table",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identificação por características",
                      "columns": [
                        "Caso",
                        "Entrada",
                        "Transformação",
                        "Leitura"
                      ],
                      "rows": [
                        [
                          "A",
                          "0 ou 1",
                          "portas clássicas",
                          "0 ou 1"
                        ],
                        [
                          "B",
                          "dados clássicos",
                          "operações em qubits",
                          "medição seguida de interpretação clássica"
                        ]
                      ],
                      "after": "O caso B combina preparação clássica, operação em qubits e leitura clássica. Esse encadeamento é o traço da arquitetura híbrida.",
                      "question": "Qual caso representa melhor computação quântica real/híbrida?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Caso A, porque só usa valores 0 ou 1."
                        },
                        {
                          "id": "b",
                          "text": "Caso B, porque integra etapas clássicas com operações em qubits."
                        },
                        {
                          "id": "c",
                          "text": "Caso A, porque a leitura final é sempre suficiente para ser quântica."
                        },
                        {
                          "id": "d",
                          "text": "Caso B, porque a etapa clássica deixa de existir."
                        }
                      ],
                      "answer": "b"
                    },
                    {
                      "id": "card-m2-5-erro-velocidade",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Além da velocidade",
                      "question": "Qual frase evita reduzir a computação quântica a uma simples promessa de rapidez?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Ela muda o modo físico e computacional de representar, transformar e medir informação."
                        },
                        {
                          "id": "b",
                          "text": "Ela é apenas uma versão mais rápida do mesmo computador para toda tarefa."
                        },
                        {
                          "id": "c",
                          "text": "Ela só importa quando elimina totalmente a etapa clássica."
                        },
                        {
                          "id": "d",
                          "text": "Ela pode ser entendida sem discutir medição ou suporte físico."
                        }
                      ],
                      "answer": "a",
                      "after": "A resposta correta destaca representação física e medição. O erro comum é imaginar que a diferença seja apenas executar o mesmo processo com mais velocidade."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            }
          ]
        },
        {
          "id": "lesson-do-bit-ao-qubit",
          "title": "Do bit ao qubit",
          "guide": {
            "goal": "Formar o vocabulário mínimo para falar de qubit, estado, amplitudes, superposição e medição sem matemática avançada.",
            "include": [
              "bit",
              "qubit",
              "estado quântico",
              "amplitude",
              "superposição",
              "normalização",
              "probabilidade de medição",
              "saída clássica"
            ],
            "exclude": [
              "cálculo matricial avançado",
              "produto tensorial formal",
              "espaços de Hilbert em detalhe"
            ],
            "notation": [
              "Usar `|ψ⟩ = α|0⟩ + β|1⟩`.",
              "Usar `|α|² + |β|² = 1`.",
              "Usar `P(0) = |α|²` e `P(1) = |β|²`."
            ],
            "avoid": [
              "Não tratar amplitude como resultado observado.",
              "Não tratar probabilidade como ausência de regra."
            ]
          },
          "topics": [
            {
              "id": "topic-bit-qubit",
              "label": "bit e qubit",
              "kind": "term",
              "checks": [
                "distingue bit de qubit",
                "reconhece que qubit é descrito por combinação de estados básicos"
              ],
              "errors": [
                "tratar qubit como valor clássico definido",
                "confundir amplitude com resultado observado"
              ]
            },
            {
              "id": "topic-superposicao-medicao",
              "label": "superposição e medição",
              "kind": "concept",
              "checks": [
                "interpreta superposição como combinação de possibilidades",
                "reconhece medição como produção de resultado clássico"
              ],
              "errors": [
                "tratar medição como consulta neutra",
                "confundir probabilidade com ausência de regra"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-bit-qubit-estado",
              "title": "Bit, qubit e estado",
              "goal": "Distinguir bit de qubit e interpretar a fórmula mínima do estado quântico.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "bit",
                "qubit",
                "estado quântico",
                "amplitudes"
              ],
              "checks": [
                "identifica a diferença entre bit e qubit",
                "interpreta |ψ⟩ = α|0⟩ + β|1⟩ como combinação de estados básicos"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m3-1-bit-qubit",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Bit, qubit e estado",
                      "text": "Um bit é uma unidade clássica que pode ser observada como 0 ou 1. Um qubit é uma unidade quântica descrita por uma combinação dos estados básicos |0⟩ e |1⟩ antes da medição. Para apresentar essa diferença, diga: “O bit já é lido como 0 ou 1; o qubit é descrito por um estado que ainda precisa ser medido.”",
                      "after": "A distinção básica é entre valor clássico observado e estado quântico descrito antes da medição."
                    },
                    {
                      "id": "card-m3-2-termos",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Vocabulário mínimo",
                      "columns": [
                        "Termo",
                        "Significado para a apresentação"
                      ],
                      "rows": [
                        [
                          "bit",
                          "unidade clássica observada como 0 ou 1"
                        ],
                        [
                          "qubit",
                          "unidade quântica descrita por combinação de |0⟩ e |1⟩"
                        ],
                        [
                          "estado",
                          "descrição da situação do sistema antes da leitura ou medição"
                        ],
                        [
                          "amplitude",
                          "coeficiente usado para calcular probabilidades de medição"
                        ]
                      ],
                      "after": "A tabela separa o que é observado como saída e o que descreve o sistema antes da medição."
                    },
                    {
                      "id": "card-m3-3-formula",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Ler a fórmula",
                      "question": "No estado |ψ⟩ = α|0⟩ + β|1⟩, o que α e β representam?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Amplitudes associadas aos estados básicos |0⟩ e |1⟩."
                        },
                        {
                          "id": "b",
                          "text": "Probabilidades já observadas como 0 e 1 no mesmo evento."
                        },
                        {
                          "id": "c",
                          "text": "Nomes de portas aplicadas depois da medição."
                        },
                        {
                          "id": "d",
                          "text": "Resultados finais que aparecem no visor."
                        }
                      ],
                      "answer": "a",
                      "after": "α e β são amplitudes. O erro comum é confundir amplitude com probabilidade já calculada ou com resultado observado."
                    },
                    {
                      "id": "card-m3-4-caso-estado",
                      "position": 4,
                      "resource": "table",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Estado e interpretação",
                      "columns": [
                        "Descrição",
                        "Leitura segura"
                      ],
                      "rows": [
                        [
                          "Bit observado",
                          "valor clássico 0 ou 1"
                        ],
                        [
                          "Qubit antes da medição",
                          "estado descrito por combinação de |0⟩ e |1⟩"
                        ]
                      ],
                      "after": "A leitura segura evita tratar o qubit como um bit comum escondido. Antes da medição, a descrição do qubit envolve combinação de estados básicos.",
                      "question": "Qual leitura evita tratar o qubit como valor clássico já definido?",
                      "options": [
                        {
                          "id": "a",
                          "text": "O qubit é descrito por uma combinação de |0⟩ e |1⟩ antes da medição."
                        },
                        {
                          "id": "b",
                          "text": "O qubit sempre já é 0 ou 1, apenas guardado sem acesso."
                        },
                        {
                          "id": "c",
                          "text": "A amplitude é o resultado observado diretamente."
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m3-5-amplitude-resultado",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Amplitude não é saída",
                      "question": "Considere |ψ⟩ = α|0⟩ + β|1⟩. Qual afirmação está correta?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A medição produz 0 ou 1; α e β ajudam a determinar probabilidades."
                        },
                        {
                          "id": "b",
                          "text": "A medição mostra α ou β como resposta final."
                        },
                        {
                          "id": "c",
                          "text": "α e β são portas que invertem o qubit."
                        },
                        {
                          "id": "d",
                          "text": "A fórmula substitui a etapa de medição."
                        }
                      ],
                      "answer": "a",
                      "after": "A saída observada é clássica, 0 ou 1. As amplitudes entram no cálculo de probabilidades, mas não aparecem como resultado lido."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            },
            {
              "id": "micro-superposicao-probabilidade-medicao",
              "title": "Superposição, probabilidade e medição",
              "goal": "Interpretar normalização, probabilidade e saída clássica em casos simples.",
              "role": "practice",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-bit-qubit-estado"
              ],
              "covers": [
                "superposição",
                "normalização",
                "probabilidade de medição",
                "saída clássica"
              ],
              "checks": [
                "reconhece que |α|² + |β|² = 1",
                "interpreta probabilidades simples",
                "identifica que a medição produz 0 ou 1"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m4-1-regra-normalizacao",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Superposição e regra mínima",
                      "text": "Superposição é a combinação de possibilidades antes da medição. Para um qubit escrito como |ψ⟩ = α|0⟩ + β|1⟩, as amplitudes obedecem a |α|² + |β|² = 1. As probabilidades são P(0) = |α|² e P(1) = |β|².",
                      "after": "A normalização garante que as probabilidades de todos os resultados possíveis somem 1."
                    },
                    {
                      "id": "card-m4-2-lacuna",
                      "position": 2,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Completar a regra",
                      "text": "A condição |α|² + |β|² = 1 expressa a [[normalização::normalização|medição|porta X]] do estado.",
                      "after": "Normalização é a regra que organiza as amplitudes para que as probabilidades possíveis formem um total de 1."
                    },
                    {
                      "id": "card-m4-3-probabilidades",
                      "position": 3,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Probabilidades simples",
                      "columns": [
                        "Caso",
                        "|α|²",
                        "|β|²",
                        "P(0)",
                        "P(1)"
                      ],
                      "rows": [
                        [
                          "A",
                          "0,50",
                          "0,50",
                          "0,50",
                          "0,50"
                        ],
                        [
                          "B",
                          "0,25",
                          "0,75",
                          "0,25",
                          "0,75"
                        ],
                        [
                          "C",
                          "0,20",
                          "0,80",
                          "0,20",
                          "0,80"
                        ]
                      ],
                      "after": "A tabela aplica diretamente P(0) = |α|² e P(1) = |β|²."
                    },
                    {
                      "id": "card-m4-4-escolher-probabilidade",
                      "position": 4,
                      "resource": "table",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Leitura de probabilidade",
                      "columns": [
                        "Caso",
                        "|α|²",
                        "|β|²"
                      ],
                      "rows": [
                        [
                          "C",
                          "0,20",
                          "0,80"
                        ]
                      ],
                      "after": "P(1) é calculada por |β|². No caso C, esse valor é 0,80; escolher 0,20 seria trocar o resultado 1 pelo resultado 0.",
                      "question": "No caso C, qual é P(1)?",
                      "options": [
                        {
                          "id": "a",
                          "text": "0,80"
                        },
                        {
                          "id": "b",
                          "text": "0,20"
                        },
                        {
                          "id": "c",
                          "text": "0,60"
                        },
                        {
                          "id": "d",
                          "text": "β como resultado observado"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m4-5-saida-classica",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "O que a medição entrega",
                      "question": "Um qubit tem P(0) = 0,30 e P(1) = 0,70. Qual saída individual a medição pode entregar?",
                      "options": [
                        {
                          "id": "a",
                          "text": "0 ou 1."
                        },
                        {
                          "id": "b",
                          "text": "0,30 ou 0,70 como valor escrito na saída."
                        },
                        {
                          "id": "c",
                          "text": "α ou β como resultado final."
                        },
                        {
                          "id": "d",
                          "text": "Os dois resultados ao mesmo tempo na mesma medição."
                        }
                      ],
                      "answer": "a",
                      "after": "Probabilidades orientam as chances, mas cada medição individual entrega uma saída clássica. O erro comum é confundir probabilidade com o valor observado."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            }
          ]
        },
        {
          "id": "lesson-portas-circuitos-algoritmo-quantico",
          "title": "Portas, circuitos e algoritmo quântico",
          "guide": {
            "goal": "Explicar como um algoritmo quântico transforma estados e por que a saída depende de portas, interferência, medição e interpretação clássica.",
            "include": [
              "porta X",
              "porta H",
              "porta CNOT",
              "circuito quântico",
              "preparação do estado",
              "interferência",
              "medição",
              "interpretação clássica",
              "arquitetura híbrida"
            ],
            "exclude": [
              "matriz unitária avançada",
              "implementação em simuladores",
              "compilação quântica em detalhe"
            ],
            "notation": [
              "Usar `X`, `H` e `CNOT`.",
              "Usar fluxo: preparação → portas → interferência → medição → interpretação clássica."
            ],
            "avoid": [
              "Não apresentar o circuito como mágica.",
              "Não pular a etapa de medição."
            ]
          },
          "topics": [
            {
              "id": "topic-portas-circuitos",
              "label": "portas e circuitos",
              "kind": "procedure",
              "checks": [
                "reconhece o papel de portas X, H e CNOT",
                "identifica circuito como sequência de transformações"
              ],
              "errors": [
                "tratar porta quântica como porta clássica comum",
                "achar que medição pode ser ignorada"
              ]
            },
            {
              "id": "topic-interferencia-pipeline",
              "label": "interferência e fluxo",
              "kind": "procedure",
              "checks": [
                "ordena etapas de algoritmo quântico",
                "reconhece interferência como reforço ou cancelamento de amplitudes"
              ],
              "errors": [
                "explicar vantagem por tentativa mágica de todas as respostas",
                "pular a etapa de interpretação clássica"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-portas-quanticas",
              "title": "Portas quânticas em nível conceitual",
              "goal": "Associar portas X, H e CNOT a seus papéis conceituais.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "porta X",
                "porta H",
                "porta CNOT",
                "circuito quântico"
              ],
              "checks": [
                "associa porta a função conceitual",
                "reconhece que portas transformam amplitudes"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m5-1-portas-papeis",
                      "position": 1,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Portas e funções básicas",
                      "prompt": "Associe cada porta à função que ela costuma representar em uma introdução a circuitos quânticos.",
                      "leftSet": {
                        "label": "Porta",
                        "items": [
                          {
                            "id": "X",
                            "label": "X"
                          },
                          {
                            "id": "H",
                            "label": "H"
                          },
                          {
                            "id": "CNOT",
                            "label": "CNOT"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Função",
                        "items": [
                          {
                            "id": "inverte",
                            "label": "Inverte um estado básico"
                          },
                          {
                            "id": "superpoe",
                            "label": "Cria uma superposição simples"
                          },
                          {
                            "id": "correlaciona",
                            "label": "Cria correlação controlada entre dois qubits"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "X",
                          "to": "inverte"
                        },
                        {
                          "from": "H",
                          "to": "superpoe"
                        },
                        {
                          "from": "CNOT",
                          "to": "correlaciona"
                        }
                      ],
                      "after": "As portas transformam o estado antes da medição. Elas não são a saída: são operações no caminho até a leitura."
                    },
                    {
                      "id": "card-m5-2-circuito-minimo",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Circuito como sequência",
                      "prompt": "Um circuito quântico organiza operações que transformam o estado antes da medição.",
                      "after": "O circuito tem ordem: preparar, aplicar portas, obter um estado transformado e medir.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "estado inicial"
                          },
                          {
                            "kind": "process",
                            "text": "porta X, H ou CNOT"
                          },
                          {
                            "kind": "process",
                            "text": "estado transformado"
                          },
                          {
                            "kind": "end",
                            "text": "medição"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-m5-3-associar-porta",
                      "position": 3,
                      "resource": "relation_map",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolher a porta pela função",
                      "prompt": "Observe as associações entre portas e funções.",
                      "leftSet": {
                        "label": "Porta",
                        "items": [
                          {
                            "id": "X",
                            "label": "X"
                          },
                          {
                            "id": "H",
                            "label": "H"
                          },
                          {
                            "id": "CNOT",
                            "label": "CNOT"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Função",
                        "items": [
                          {
                            "id": "inverte",
                            "label": "inverte um estado básico"
                          },
                          {
                            "id": "combina",
                            "label": "cria combinação de possibilidades"
                          },
                          {
                            "id": "correlaciona",
                            "label": "correlaciona dois qubits"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "X",
                          "to": "inverte"
                        },
                        {
                          "from": "H",
                          "to": "combina"
                        },
                        {
                          "from": "CNOT",
                          "to": "correlaciona"
                        }
                      ],
                      "after": "A porta H é usada em introduções para criar superposição. Confundir H com CNOT mistura operação em um qubit com correlação entre dois qubits.",
                      "question": "Qual associação identifica a porta ligada à criação de superposição?",
                      "options": [
                        {
                          "id": "a",
                          "text": "H → cria combinação de possibilidades"
                        },
                        {
                          "id": "b",
                          "text": "X → correlaciona dois qubits"
                        },
                        {
                          "id": "c",
                          "text": "CNOT → inverte um único estado básico"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m5-4-transformam-amplitudes",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "O que as portas fazem",
                      "question": "Qual afirmação descreve corretamente o papel das portas quânticas no circuito?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Elas transformam o estado e suas amplitudes antes da medição."
                        },
                        {
                          "id": "b",
                          "text": "Elas escolhem diretamente a saída clássica final sem medição."
                        },
                        {
                          "id": "c",
                          "text": "Elas são iguais a portas clássicas comuns em todos os aspectos."
                        },
                        {
                          "id": "d",
                          "text": "Elas garantem vantagem sempre que aparecem em um circuito."
                        }
                      ],
                      "answer": "a",
                      "after": "Portas quânticas atuam no estado antes da medição. O erro plausível é pensar que a porta já produz a saída final ou que sua presença garante vantagem."
                    },
                    {
                      "id": "card-m5-5-cnot",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Papel da CNOT",
                      "question": "Para que serve a CNOT em um circuito introdutório com dois qubits?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Produzir uma correlação controlada entre dois qubits."
                        },
                        {
                          "id": "b",
                          "text": "Apagar a etapa de medição depois das portas."
                        },
                        {
                          "id": "c",
                          "text": "Transformar amplitude em valor observado diretamente."
                        },
                        {
                          "id": "d",
                          "text": "Representar apenas uma entrada clássica isolada."
                        }
                      ],
                      "answer": "a",
                      "after": "CNOT envolve dois qubits e expressa uma operação controlada. Ela não substitui a medição nem transforma amplitude em saída observada."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            },
            {
              "id": "micro-algoritmo-quantico-fluxo",
              "title": "Como um algoritmo quântico produz saída",
              "goal": "Ordenar e interpretar o fluxo de um algoritmo quântico.",
              "role": "practice",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-portas-quanticas"
              ],
              "covers": [
                "preparação do estado",
                "aplicação de portas",
                "interferência",
                "medição",
                "interpretação clássica"
              ],
              "checks": [
                "ordena corretamente o fluxo",
                "identifica o papel da interferência",
                "reconhece que a saída medida é clássica"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m6-1-fluxo-geral",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fluxo de um algoritmo quântico",
                      "prompt": "Fluxo básico: preparação do estado → portas → interferência → medição → interpretação clássica.",
                      "after": "A saída útil depende de preparar o estado, transformar amplitudes, medir e interpretar o valor clássico obtido.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "preparação do estado"
                          },
                          {
                            "kind": "process",
                            "text": "portas"
                          },
                          {
                            "kind": "process",
                            "text": "interferência"
                          },
                          {
                            "kind": "process",
                            "text": "medição"
                          },
                          {
                            "kind": "end",
                            "text": "interpretação clássica"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-m6-2-etapas",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Etapas e funções",
                      "columns": [
                        "Etapa",
                        "Função"
                      ],
                      "rows": [
                        [
                          "preparação do estado",
                          "define a situação inicial do sistema"
                        ],
                        [
                          "portas",
                          "transformam o estado"
                        ],
                        [
                          "interferência",
                          "reforça ou cancela amplitudes"
                        ],
                        [
                          "medição",
                          "produz saída clássica"
                        ],
                        [
                          "interpretação clássica",
                          "dá sentido computacional ao resultado medido"
                        ]
                      ],
                      "after": "A tabela separa transformação quântica, medição e leitura clássica. Para apresentar, diga: “O algoritmo só vira resposta quando o resultado medido é interpretado.”"
                    },
                    {
                      "id": "card-m6-3-ordem-correta",
                      "position": 3,
                      "resource": "flow",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Ordem do processo",
                      "prompt": "O fluxo mostra as etapas A, B, C, D e E.",
                      "after": "A medição vem antes da interpretação clássica, pois fornece o valor que será interpretado. Colocar interpretação antes da medição inverte o fluxo.",
                      "question": "Qual sequência corresponde ao fluxo mostrado?",
                      "options": [
                        {
                          "id": "a",
                          "text": "preparação → portas → interferência → medição → interpretação clássica"
                        },
                        {
                          "id": "b",
                          "text": "medição → preparação → portas → interpretação clássica → interferência"
                        },
                        {
                          "id": "c",
                          "text": "preparação → interpretação clássica → portas → medição → interferência"
                        },
                        {
                          "id": "d",
                          "text": "portas → medição → preparação → interferência → interpretação clássica"
                        }
                      ],
                      "answer": "a",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "preparação do estado"
                          },
                          {
                            "kind": "process",
                            "text": "portas"
                          },
                          {
                            "kind": "process",
                            "text": "interferência"
                          },
                          {
                            "kind": "process",
                            "text": "medição"
                          },
                          {
                            "kind": "end",
                            "text": "interpretação clássica"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-m6-4-interferencia",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Papel da interferência",
                      "question": "O que a interferência faz com as amplitudes durante o algoritmo?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Reforça algumas contribuições de amplitude e cancela outras."
                        },
                        {
                          "id": "b",
                          "text": "Transforma toda possibilidade em resposta correta observada."
                        },
                        {
                          "id": "c",
                          "text": "Dispensa a preparação do estado inicial."
                        },
                        {
                          "id": "d",
                          "text": "Torna desnecessária a interpretação clássica."
                        }
                      ],
                      "answer": "a",
                      "after": "Interferência é reforço ou cancelamento de amplitudes. O erro plausível é imaginar que explorar possibilidades já significa observar todas como respostas úteis."
                    },
                    {
                      "id": "card-m6-5-saida",
                      "position": 5,
                      "resource": "table",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Saída e interpretação",
                      "columns": [
                        "Medição observada",
                        "Interpretação clássica"
                      ],
                      "rows": [
                        [
                          "0",
                          "associar 0 ao significado definido pelo algoritmo"
                        ],
                        [
                          "1",
                          "associar 1 ao significado definido pelo algoritmo"
                        ]
                      ],
                      "after": "A medição entrega um valor clássico, mas o algoritmo ainda precisa de uma regra de interpretação para transformar esse valor em resposta.",
                      "question": "Qual afirmação está correta para a etapa final?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A saída medida é clássica e precisa ser interpretada."
                        },
                        {
                          "id": "b",
                          "text": "A saída medida é uma amplitude não observável."
                        },
                        {
                          "id": "c",
                          "text": "A interpretação clássica vem antes da medição."
                        },
                        {
                          "id": "d",
                          "text": "A medição é opcional quando houve interferência."
                        }
                      ],
                      "answer": "a"
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            }
          ]
        },
        {
          "id": "lesson-modelos-eficiencia-vantagem",
          "title": "Modelos, eficiência e vantagem",
          "guide": {
            "goal": "Mostrar que a computação quântica desafia teses sobre eficiência e modelos físicos de computação, sem prova formal.",
            "include": [
              "Máquina de Turing",
              "arquitetura de von Neumann",
              "circuitos quânticos",
              "modelo baseado em medições",
              "custo computacional",
              "crescimento polinomial",
              "crescimento exponencial",
              "BPP",
              "BQP",
              "Shor como exemplo conceitual"
            ],
            "exclude": [
              "prova formal de complexidade",
              "algoritmo de Shor passo a passo",
              "criptografia aplicada em detalhe"
            ],
            "notation": [
              "Usar `BPP ⊆ BQP`.",
              "Usar `BPP ⊂ BQP?`."
            ],
            "avoid": [
              "Não confundir computabilidade com eficiência.",
              "Não dizer que computação quântica resolve problemas indecidíveis."
            ]
          },
          "topics": [
            {
              "id": "topic-modelos-computacao",
              "label": "modelos de computação",
              "kind": "concept",
              "checks": [
                "diferencia Máquina de Turing, von Neumann e circuitos quânticos",
                "entende modelo de computação como recorte de operações permitidas"
              ],
              "errors": [
                "confundir computabilidade com eficiência",
                "achar que arquitetura física é detalhe irrelevante"
              ]
            },
            {
              "id": "topic-eficiencia-bpp-bqp",
              "label": "eficiência, BPP e BQP",
              "kind": "concept",
              "checks": [
                "distingue crescimento polinomial de exponencial em nível conceitual",
                "interpreta BPP e BQP em linguagem simples",
                "reconhece Shor como exemplo conceitual de mudança de eficiência"
              ],
              "errors": [
                "afirmar vantagem para todos os problemas",
                "confundir exemplo conceitual com disponibilidade prática imediata"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-modelos-maquina-fisica",
              "title": "Modelos de computação e realização física",
              "goal": "Relacionar modelos abstratos de computação com realização física da máquina.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "Máquina de Turing",
                "arquitetura de von Neumann",
                "circuito quântico",
                "modelo baseado em medições"
              ],
              "checks": [
                "identifica modelos pelo papel",
                "relaciona modelo abstrato e realização física"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m7-1-arvore-modelos",
                      "position": 1,
                      "resource": "tree",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Modelos de computação",
                      "prompt": "A árvore organiza modelos pelo tipo de operação que eles destacam.",
                      "nodes": [
                        {
                          "id": "root",
                          "label": "Modelos de computação",
                          "parentId": null,
                          "type": "folder"
                        },
                        {
                          "id": "turing",
                          "label": "Máquina de Turing: regras abstratas para calcular",
                          "parentId": "root",
                          "type": "file"
                        },
                        {
                          "id": "von",
                          "label": "von Neumann: processamento, memória e instruções",
                          "parentId": "root",
                          "type": "file"
                        },
                        {
                          "id": "circuitos",
                          "label": "circuitos quânticos: sequência de portas em qubits",
                          "parentId": "root",
                          "type": "file"
                        },
                        {
                          "id": "medicoes",
                          "label": "modelo baseado em medições: processamento guiado por medições",
                          "parentId": "root",
                          "type": "file"
                        }
                      ],
                      "after": "Um modelo de computação é um recorte das operações permitidas. Ele não é apenas uma peça física."
                    },
                    {
                      "id": "card-m7-2-modelo-papel",
                      "position": 2,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Modelo e função",
                      "prompt": "Associe cada modelo ao papel que ele ajuda a entender.",
                      "leftSet": {
                        "label": "Modelo",
                        "items": [
                          {
                            "id": "turing",
                            "label": "Máquina de Turing"
                          },
                          {
                            "id": "von",
                            "label": "arquitetura de von Neumann"
                          },
                          {
                            "id": "circuitos",
                            "label": "circuitos quânticos"
                          },
                          {
                            "id": "medicoes",
                            "label": "modelo baseado em medições"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Função",
                        "items": [
                          {
                            "id": "abstrato",
                            "label": "descrever cálculo por regras abstratas"
                          },
                          {
                            "id": "organizacao",
                            "label": "organizar memória, processamento e instruções"
                          },
                          {
                            "id": "portas",
                            "label": "descrever transformações por portas"
                          },
                          {
                            "id": "pergunta",
                            "label": "tratar medição como parte do processamento"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "turing",
                          "to": "abstrato"
                        },
                        {
                          "from": "von",
                          "to": "organizacao"
                        },
                        {
                          "from": "circuitos",
                          "to": "portas"
                        },
                        {
                          "from": "medicoes",
                          "to": "pergunta"
                        }
                      ],
                      "after": "A associação mostra que cada modelo enfatiza um modo diferente de organizar a computação."
                    },
                    {
                      "id": "card-m7-3-identificar-von",
                      "position": 3,
                      "resource": "tree",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identificar pela descrição",
                      "prompt": "Observe a árvore de modelos.",
                      "nodes": [
                        {
                          "id": "root",
                          "label": "Modelos",
                          "parentId": null,
                          "type": "folder"
                        },
                        {
                          "id": "mt",
                          "label": "Máquina de Turing",
                          "parentId": "root",
                          "type": "file"
                        },
                        {
                          "id": "vn",
                          "label": "arquitetura de von Neumann",
                          "parentId": "root",
                          "type": "file"
                        },
                        {
                          "id": "cq",
                          "label": "circuitos quânticos",
                          "parentId": "root",
                          "type": "file"
                        }
                      ],
                      "after": "Processamento, memória e instruções caracterizam a arquitetura de von Neumann. Circuitos quânticos destacam portas e qubits.",
                      "question": "Qual item corresponde à organização com processamento, memória e instruções?",
                      "options": [
                        {
                          "id": "a",
                          "text": "arquitetura de von Neumann"
                        },
                        {
                          "id": "b",
                          "text": "circuitos quânticos"
                        },
                        {
                          "id": "c",
                          "text": "Máquina de Turing"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m7-4-modelo-nao-detalhe",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Modelo e suporte físico",
                      "question": "Qual afirmação relaciona modelo abstrato e realização física de modo correto?",
                      "options": [
                        {
                          "id": "a",
                          "text": "O modelo define operações permitidas, e a realização física condiciona como essas operações podem ocorrer."
                        },
                        {
                          "id": "b",
                          "text": "O suporte físico é irrelevante quando se fala de arquitetura de computadores."
                        },
                        {
                          "id": "c",
                          "text": "Todo modelo de computação descreve a mesma organização física."
                        },
                        {
                          "id": "d",
                          "text": "Modelos de computação tratam apenas da velocidade do resultado final."
                        }
                      ],
                      "answer": "a",
                      "after": "A arquitetura depende do modo físico de representar informação. O erro comum é separar completamente o modelo abstrato do suporte que permite executá-lo."
                    },
                    {
                      "id": "card-m7-5-medicoes",
                      "position": 5,
                      "resource": "relation_map",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Modelo baseado em medições",
                      "prompt": "Associe a descrição ao modelo correto.",
                      "leftSet": {
                        "label": "Descrição",
                        "items": [
                          {
                            "id": "guiada",
                            "label": "computação guiada por medições"
                          },
                          {
                            "id": "portas",
                            "label": "sequência de portas em qubits"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Modelo",
                        "items": [
                          {
                            "id": "mbm",
                            "label": "modelo baseado em medições"
                          },
                          {
                            "id": "circuitos",
                            "label": "circuitos quânticos"
                          },
                          {
                            "id": "turing",
                            "label": "Máquina de Turing"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "guiada",
                          "to": "mbm"
                        },
                        {
                          "from": "portas",
                          "to": "circuitos"
                        }
                      ],
                      "after": "Quando a computação é guiada por medições, a medição não é só leitura final: ela faz parte do processamento.",
                      "question": "Qual associação está correta?",
                      "options": [
                        {
                          "id": "a",
                          "text": "computação guiada por medições → modelo baseado em medições"
                        },
                        {
                          "id": "b",
                          "text": "computação guiada por medições → arquitetura de von Neumann"
                        },
                        {
                          "id": "c",
                          "text": "sequência de portas em qubits → Máquina de Turing"
                        }
                      ],
                      "answer": "a"
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            },
            {
              "id": "micro-eficiencia-bpp-bqp-shor",
              "title": "Eficiência, BPP, BQP e exemplo de Shor",
              "goal": "Interpretar a diferença entre eficiência clássica probabilística e eficiência quântica.",
              "role": "practice",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-modelos-maquina-fisica"
              ],
              "covers": [
                "custo computacional",
                "polinomial e exponencial",
                "BPP",
                "BQP",
                "Shor como exemplo conceitual"
              ],
              "checks": [
                "interpreta BPP e BQP sem formalismo excessivo",
                "reconhece que BQP pode ampliar problemas eficientemente tratáveis",
                "entende Shor como exemplo conceitual"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m8-1-crescimentos",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Crescimento de custo",
                      "columns": [
                        "Crescimento",
                        "Ideia simples"
                      ],
                      "rows": [
                        [
                          "polinomial",
                          "o custo cresce de forma controlada quando a entrada aumenta"
                        ],
                        [
                          "exponencial",
                          "o custo cresce muito rapidamente quando a entrada aumenta"
                        ],
                        [
                          "eficiência",
                          "interessa quanto recurso é necessário para resolver o problema"
                        ]
                      ],
                      "after": "A diferença entre polinomial e exponencial ajuda a falar de eficiência, não de possibilidade absoluta de computar."
                    },
                    {
                      "id": "card-m8-2-bpp-bqp",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "BPP e BQP",
                      "columns": [
                        "Classe",
                        "Leitura para apresentação"
                      ],
                      "rows": [
                        [
                          "BPP",
                          "problemas tratados eficientemente por computação probabilística clássica"
                        ],
                        [
                          "BQP",
                          "problemas tratados eficientemente por computação quântica com erro controlado"
                        ],
                        [
                          "BPP ⊆ BQP",
                          "a computação quântica pode incluir o que a probabilística clássica faz eficientemente"
                        ],
                        [
                          "BPP ⊂ BQP?",
                          "pergunta sobre haver mais problemas eficientes no modelo quântico"
                        ]
                      ],
                      "after": "Para apresentar, diga: “BPP e BQP comparam eficiência; não dizem que toda tarefa fica fácil.”"
                    },
                    {
                      "id": "card-m8-3-interpretar-inclusao",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Interpretar BPP ⊆ BQP",
                      "question": "O que significa BPP ⊆ BQP no debate sobre eficiência?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A ideia de que o modelo quântico pode abranger a computação probabilística clássica eficiente."
                        },
                        {
                          "id": "b",
                          "text": "A afirmação de que todo problema conhecido passa a ter solução rápida."
                        },
                        {
                          "id": "c",
                          "text": "A ideia de que medição e saída clássica deixam de ser necessárias."
                        },
                        {
                          "id": "d",
                          "text": "Uma regra sobre a marca ou a plataforma física do computador."
                        }
                      ],
                      "answer": "a",
                      "after": "A inclusão compara classes de problemas tratáveis com eficiência. Ela não promete vantagem para todos os problemas nem remove a etapa de medição."
                    },
                    {
                      "id": "card-m8-4-shor",
                      "position": 4,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Shor como exemplo de eficiência",
                      "text": "Shor aparece como exemplo de mudança de eficiência: um problema específico pode ter tratamento quântico muito mais eficiente em um modelo idealizado. Para apresentar, diga: “Shor ilustra uma possível diferença de eficiência, não uma solução universal para qualquer tarefa.”",
                      "after": "O exemplo ajuda a discutir eficiência sem afirmar vantagem geral ou disponibilidade prática imediata."
                    },
                    {
                      "id": "card-m8-5-poliexp",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Distinguir crescimento",
                      "question": "Um custo que dobra repetidamente quando o tamanho da entrada aumenta ilustra melhor qual ideia?",
                      "options": [
                        {
                          "id": "a",
                          "text": "crescimento exponencial"
                        },
                        {
                          "id": "b",
                          "text": "crescimento polinomial controlado"
                        },
                        {
                          "id": "c",
                          "text": "resultado de uma medição"
                        },
                        {
                          "id": "d",
                          "text": "interpretação do estado"
                        }
                      ],
                      "answer": "a",
                      "after": "Dobrar repetidamente indica crescimento exponencial, que aumenta muito depressa. A confusão comum é chamar qualquer aumento de polinomial."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            }
          ]
        },
        {
          "id": "lesson-estado-medicao-interpretacao",
          "title": "Estado, medição e interpretação",
          "guide": {
            "goal": "Explicitar o núcleo filosófico do artigo: o que é um estado quântico e o que a medição faz.",
            "include": [
              "interpretação instrumental",
              "interpretação realista",
              "interpretação informacional",
              "estado quântico",
              "medição",
              "revelar",
              "selecionar",
              "transformar",
              "base de medição",
              "problema da base preferida"
            ],
            "exclude": [
              "disputa filosófica extensa entre interpretações",
              "formalismo matemático avançado de bases",
              "prova formal de resultados de mecânica quântica"
            ],
            "notation": [
              "Usar “instrumental”, “realista” e “informacional”.",
              "Usar “base de medição” como a forma da pergunta experimental feita ao sistema."
            ],
            "avoid": [
              "Não apresentar uma interpretação como resposta definitiva obrigatória.",
              "Não tratar medição como detalhe técnico neutro."
            ]
          },
          "topics": [
            {
              "id": "topic-interpretacoes-estado",
              "label": "interpretações do estado",
              "kind": "concept",
              "checks": [
                "distingue interpretações instrumental, realista e informacional",
                "reconhece que o artigo não precisa fechar a questão"
              ],
              "errors": [
                "tomar uma interpretação como única resposta obrigatória",
                "ignorar que a interpretação muda o que se considera processado"
              ]
            },
            {
              "id": "topic-medicao-base",
              "label": "medição e base",
              "kind": "concept",
              "checks": [
                "distingue revelar, selecionar e transformar",
                "entende que a base de medição importa",
                "reconhece o problema da base preferida"
              ],
              "errors": [
                "tratar medição como detalhe técnico neutro",
                "ignorar que a saída depende da pergunta experimental"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-estado-quantico-interpretacoes",
              "title": "O que é um estado quântico?",
              "goal": "Distinguir três modos de interpretar o estado quântico.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "interpretação instrumental",
                "interpretação realista",
                "interpretação informacional",
                "estado como objeto filosófico-computacional"
              ],
              "checks": [
                "associa cada interpretação à sua formulação",
                "reconhece por que a pergunta importa para computação"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m9-1-interpretacoes",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Três leituras do estado",
                      "columns": [
                        "Interpretação",
                        "Ideia principal"
                      ],
                      "rows": [
                        [
                          "instrumental",
                          "o estado é ferramenta para prever resultados de medição"
                        ],
                        [
                          "realista",
                          "o estado corresponde a algo que existe no sistema"
                        ],
                        [
                          "informacional",
                          "o estado expressa informação disponível sobre o sistema"
                        ]
                      ],
                      "after": "A tabela apresenta três leituras sem escolher uma como resposta obrigatória."
                    },
                    {
                      "id": "card-m9-2-associar-interpretacao",
                      "position": 2,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Interpretação e formulação",
                      "prompt": "Associe cada interpretação à formulação correspondente.",
                      "leftSet": {
                        "label": "Interpretação",
                        "items": [
                          {
                            "id": "inst",
                            "label": "instrumental"
                          },
                          {
                            "id": "real",
                            "label": "realista"
                          },
                          {
                            "id": "info",
                            "label": "informacional"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Formulação",
                        "items": [
                          {
                            "id": "prediz",
                            "label": "ferramenta de previsão"
                          },
                          {
                            "id": "existe",
                            "label": "descrição de algo existente"
                          },
                          {
                            "id": "informa",
                            "label": "expressão de informação disponível"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "inst",
                          "to": "prediz"
                        },
                        {
                          "from": "real",
                          "to": "existe"
                        },
                        {
                          "from": "info",
                          "to": "informa"
                        }
                      ],
                      "after": "O mapa mostra que a palavra estado pode receber leituras diferentes no debate sobre computação quântica."
                    },
                    {
                      "id": "card-m9-3-identificar-instrumental",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Leitura instrumental",
                      "question": "Qual frase corresponde à interpretação instrumental?",
                      "options": [
                        {
                          "id": "a",
                          "text": "O estado é usado como ferramenta para prever resultados de medição."
                        },
                        {
                          "id": "b",
                          "text": "O estado é sempre a única descrição completa da realidade."
                        },
                        {
                          "id": "c",
                          "text": "O estado é apenas um bit clássico guardado na memória."
                        },
                        {
                          "id": "d",
                          "text": "O estado torna irrelevante discutir medição."
                        }
                      ],
                      "answer": "a",
                      "after": "A leitura instrumental enfatiza uso preditivo. O erro plausível é transformar essa leitura em uma afirmação realista forte."
                    },
                    {
                      "id": "card-m9-4-estado-e-computacao",
                      "position": 4,
                      "resource": "relation_map",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Por que a pergunta importa",
                      "prompt": "Associe a pergunta ao impacto na computação quântica.",
                      "leftSet": {
                        "label": "Pergunta",
                        "items": [
                          {
                            "id": "estado",
                            "label": "O que é o estado?"
                          },
                          {
                            "id": "medicao",
                            "label": "O que a medição entrega?"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Impacto",
                        "items": [
                          {
                            "id": "processado",
                            "label": "afeta o que se considera processado"
                          },
                          {
                            "id": "saida",
                            "label": "define como a saída clássica entra na explicação"
                          },
                          {
                            "id": "dispensa",
                            "label": "elimina a necessidade de resultado observável"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "estado",
                          "to": "processado"
                        },
                        {
                          "from": "medicao",
                          "to": "saida"
                        }
                      ],
                      "after": "Interpretar estado e medição afeta o que se entende por processamento e saída. Não elimina a necessidade de resultado observável.",
                      "question": "Qual associação está correta?",
                      "options": [
                        {
                          "id": "a",
                          "text": "O que é o estado? → afeta o que se considera processado"
                        },
                        {
                          "id": "b",
                          "text": "O que é o estado? → elimina a saída observável"
                        },
                        {
                          "id": "c",
                          "text": "O que a medição entrega? → dispensa a interpretação"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m9-5-sem-resposta-unica",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Sem resposta imposta",
                      "question": "Qual postura é adequada ao comparar interpretações do estado quântico?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Comparar interpretações e reconhecer que a discussão não precisa impor uma única resposta."
                        },
                        {
                          "id": "b",
                          "text": "Declarar uma interpretação como obrigatória para todo uso computacional."
                        },
                        {
                          "id": "c",
                          "text": "Ignorar interpretações porque elas nunca afetam a noção de processamento."
                        },
                        {
                          "id": "d",
                          "text": "Tratar o estado como bit clássico já medido."
                        }
                      ],
                      "answer": "a",
                      "after": "A comparação ajuda o aluno a apresentar o debate sem fechar uma resposta definitiva. O erro comum é escolher uma interpretação como única saída obrigatória."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            },
            {
              "id": "micro-medicao-base-preferida",
              "title": "O que a medição faz?",
              "goal": "Distinguir funções conceituais da medição e reconhecer o problema da base preferida.",
              "role": "practice",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-estado-quantico-interpretacoes"
              ],
              "covers": [
                "medição",
                "revelar",
                "selecionar",
                "transformar",
                "base de medição",
                "problema da base preferida"
              ],
              "checks": [
                "distingue modelos de leitura da medição",
                "identifica que a base define que pergunta é feita ao sistema",
                "entende por que a base preferida é problema para certas explicações"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m10-1-medicao-modelos",
                      "position": 1,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Três leituras da medição",
                      "prompt": "Associe cada verbo à leitura da medição.",
                      "leftSet": {
                        "label": "Verbo",
                        "items": [
                          {
                            "id": "revelar",
                            "label": "revelar"
                          },
                          {
                            "id": "selecionar",
                            "label": "selecionar"
                          },
                          {
                            "id": "transformar",
                            "label": "transformar"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Leitura",
                        "items": [
                          {
                            "id": "mostrar",
                            "label": "mostrar um valor"
                          },
                          {
                            "id": "escolher",
                            "label": "produzir uma alternativa possível"
                          },
                          {
                            "id": "alterar",
                            "label": "mudar o estado relevante para a descrição"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "revelar",
                          "to": "mostrar"
                        },
                        {
                          "from": "selecionar",
                          "to": "escolher"
                        },
                        {
                          "from": "transformar",
                          "to": "alterar"
                        }
                      ],
                      "after": "Medição é o processo que produz uma saída clássica e afeta o estado relevante para a descrição. Para apresentar, diga: “Medir não é apenas olhar; é fazer uma pergunta física ao sistema.”"
                    },
                    {
                      "id": "card-m10-2-base-pergunta",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Base de medição como pergunta",
                      "prompt": "A base de medição é a forma da pergunta experimental feita ao sistema.",
                      "after": "A base importa porque define que tipo de resultado pode aparecer e como esse resultado será interpretado.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "estado preparado"
                          },
                          {
                            "kind": "process",
                            "text": "base de medição"
                          },
                          {
                            "kind": "process",
                            "text": "pergunta experimental"
                          },
                          {
                            "kind": "end",
                            "text": "saída clássica"
                          }
                        ]
                      }
                    },
                    {
                      "id": "card-m10-3-associar-verbo",
                      "position": 3,
                      "resource": "relation_map",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identificar a leitura",
                      "prompt": "Observe as relações entre verbo e leitura.",
                      "leftSet": {
                        "label": "Verbo",
                        "items": [
                          {
                            "id": "revelar",
                            "label": "revelar"
                          },
                          {
                            "id": "selecionar",
                            "label": "selecionar"
                          },
                          {
                            "id": "transformar",
                            "label": "transformar"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Leitura",
                        "items": [
                          {
                            "id": "mostrar",
                            "label": "mostrar um valor"
                          },
                          {
                            "id": "alternativa",
                            "label": "produzir uma alternativa possível"
                          },
                          {
                            "id": "alterar",
                            "label": "alterar o estado relevante"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "revelar",
                          "to": "mostrar"
                        },
                        {
                          "from": "selecionar",
                          "to": "alternativa"
                        },
                        {
                          "from": "transformar",
                          "to": "alterar"
                        }
                      ],
                      "after": "Selecionar destaca que a medição produz uma alternativa entre possibilidades. Confundir com revelar deixa de lado o papel ativo da medição.",
                      "question": "Qual par descreve a leitura “selecionar”?",
                      "options": [
                        {
                          "id": "a",
                          "text": "selecionar → produzir uma alternativa possível"
                        },
                        {
                          "id": "b",
                          "text": "selecionar → ignorar a base de medição"
                        },
                        {
                          "id": "c",
                          "text": "selecionar → eliminar a saída clássica"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m10-4-base-preferida",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Problema da base preferida",
                      "question": "Qual afirmação expressa o problema da base preferida?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A descrição dos resultados depende da base escolhida, então é preciso explicar por que certa base é privilegiada."
                        },
                        {
                          "id": "b",
                          "text": "Toda medição faz exatamente a mesma pergunta experimental."
                        },
                        {
                          "id": "c",
                          "text": "A base é apenas outro nome para o valor clássico já obtido."
                        },
                        {
                          "id": "d",
                          "text": "Escolher uma base torna a medição irrelevante."
                        }
                      ],
                      "answer": "a",
                      "after": "O ponto decisivo é que a base define a forma da pergunta experimental. O erro comum é tratar todas as bases como equivalentes para a explicação."
                    },
                    {
                      "id": "card-m10-5-saida-depende-pergunta",
                      "position": 5,
                      "resource": "flow",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Pergunta experimental",
                      "prompt": "Fluxo mínimo: estado → base de medição → resultado clássico.",
                      "after": "A base define a pergunta experimental feita ao sistema. Por isso, a saída observada depende do modo de medir.",
                      "question": "O que a base de medição define neste fluxo?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A forma da pergunta experimental feita ao sistema."
                        },
                        {
                          "id": "b",
                          "text": "Uma etapa sem efeito na saída."
                        },
                        {
                          "id": "c",
                          "text": "Uma amplitude observada diretamente."
                        },
                        {
                          "id": "d",
                          "text": "Uma substituição da saída clássica."
                        }
                      ],
                      "answer": "a",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "estado"
                          },
                          {
                            "kind": "process",
                            "text": "base de medição"
                          },
                          {
                            "kind": "end",
                            "text": "resultado clássico"
                          }
                        ]
                      }
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            }
          ]
        },
        {
          "id": "lesson-explicacoes-limites-sintese-arquitetural",
          "title": "Explicações, limites e síntese arquitetural",
          "guide": {
            "goal": "Consolidar a leitura do artigo, mostrando que explicações do poder quântico precisam ser cautelosas, gerais e conectadas a limites físicos e arquiteturais.",
            "include": [
              "muitos mundos como explicação discutida",
              "problema da base preferida",
              "modelo baseado em medições",
              "emaranhamento",
              "simulação clássica",
              "Teorema de Gottesman-Knill em nível conceitual",
              "ruído",
              "decoerência",
              "correção de erros",
              "arquitetura híbrida",
              "síntese para OAC"
            ],
            "exclude": [
              "prova formal do Teorema de Bell",
              "prova formal do Teorema de Gottesman-Knill",
              "detalhes de hardware por plataforma",
              "criptografia aplicada em detalhe"
            ],
            "notation": [
              "Usar `Gottesman-Knill` apenas em nível conceitual.",
              "Usar “simulação clássica eficiente” como produção dos mesmos resultados estatísticos com custo controlado."
            ],
            "avoid": [
              "Não tratar uma metáfora como explicação suficiente.",
              "Não concluir que emaranhamento é irrelevante.",
              "Não ignorar custo físico, ruído e medição."
            ]
          },
          "topics": [
            {
              "id": "topic-explicacoes-vantagem",
              "label": "explicações da vantagem quântica",
              "kind": "concept",
              "checks": [
                "reconhece a crítica à explicação de muitos mundos como explicação geral",
                "identifica papel e limite do emaranhamento",
                "entende o impacto do modelo baseado em medições na crítica"
              ],
              "errors": [
                "tratar uma metáfora como explicação suficiente",
                "concluir que emaranhamento automaticamente garante vantagem"
              ]
            },
            {
              "id": "topic-limites-sintese-oac",
              "label": "limites e síntese para OAC",
              "kind": "concept",
              "checks": [
                "relaciona ruído, decoerência, medição e pós-processamento à arquitetura real",
                "sintetiza mensagem final do artigo para OAC"
              ],
              "errors": [
                "ignorar custo físico",
                "substituir arquitetura clássica por uma visão totalmente quântica"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-muitos-mundos-emaranhamento",
              "title": "Explicações da vantagem quântica",
              "goal": "Reconhecer por que a explicação de muitos mundos é criticada como explicação geral e qual é o papel cauteloso do emaranhamento.",
              "role": "explain",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [],
              "covers": [
                "muitos mundos como explicação discutida",
                "problema da base preferida",
                "modelo baseado em medições",
                "emaranhamento"
              ],
              "checks": [
                "reconhece por que a explicação por muitos mundos é problemática como explicação geral",
                "identifica que emaranhamento é importante, mas não basta isoladamente"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m11-1-cautela",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Explicações precisam de cautela",
                      "text": "A explicação por muitos mundos pode ser discutida como interpretação, mas não deve ser tratada como explicação geral suficiente da vantagem quântica. Para apresentar, diga: “A metáfora ajuda a imaginar o problema, mas não substitui a análise de medição, base, modelo e custo.”",
                      "after": "A cautela evita transformar uma interpretação em resposta completa para o poder da computação quântica."
                    },
                    {
                      "id": "card-m11-2-rede-conceitos",
                      "position": 2,
                      "resource": "graph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Rede de conceitos",
                      "prompt": "A rede mostra relações entre explicação, base, medição e emaranhamento.",
                      "vertices": [
                        {
                          "id": "mw",
                          "label": "muitos mundos"
                        },
                        {
                          "id": "base",
                          "label": "base preferida"
                        },
                        {
                          "id": "med",
                          "label": "medição"
                        },
                        {
                          "id": "mbm",
                          "label": "modelo baseado em medições"
                        },
                        {
                          "id": "ent",
                          "label": "emaranhamento"
                        },
                        {
                          "id": "vant",
                          "label": "vantagem quântica"
                        }
                      ],
                      "edges": [
                        {
                          "from": "mw",
                          "to": "base"
                        },
                        {
                          "from": "base",
                          "to": "med"
                        },
                        {
                          "from": "med",
                          "to": "mbm"
                        },
                        {
                          "from": "ent",
                          "to": "vant"
                        },
                        {
                          "from": "mbm",
                          "to": "vant"
                        }
                      ],
                      "after": "Uma explicação ampla precisa considerar medição, base, modelos de computação e emaranhamento, sem reduzir tudo a uma única imagem."
                    },
                    {
                      "id": "card-m11-3-grafo-critica",
                      "position": 3,
                      "resource": "graph",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Crítica em forma de rede",
                      "prompt": "Observe a rede: muitos mundos liga-se ao problema da base preferida; o modelo baseado em medições liga medição ao processamento.",
                      "vertices": [
                        {
                          "id": "mw",
                          "label": "muitos mundos"
                        },
                        {
                          "id": "bp",
                          "label": "problema da base preferida"
                        },
                        {
                          "id": "mbm",
                          "label": "modelo baseado em medições"
                        },
                        {
                          "id": "med",
                          "label": "medição"
                        },
                        {
                          "id": "exp",
                          "label": "explicação geral"
                        }
                      ],
                      "edges": [
                        {
                          "from": "mw",
                          "to": "bp"
                        },
                        {
                          "from": "mbm",
                          "to": "med"
                        },
                        {
                          "from": "med",
                          "to": "exp"
                        },
                        {
                          "from": "bp",
                          "to": "exp"
                        }
                      ],
                      "after": "A ligação entre muitos mundos e o problema da base preferida mostra por que essa interpretação não basta como explicação geral. O modelo baseado em medições reforça que medir pode participar do processamento.",
                      "question": "Qual relação sustenta a crítica à explicação por muitos mundos como explicação geral?",
                      "options": [
                        {
                          "id": "a",
                          "text": "muitos mundos → problema da base preferida"
                        },
                        {
                          "id": "b",
                          "text": "medição → etapa apenas decorativa"
                        },
                        {
                          "id": "c",
                          "text": "modelo baseado em medições → bit clássico comum"
                        },
                        {
                          "id": "d",
                          "text": "explicação geral → resultado já definido"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m11-4-emaranhamento",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Papel do emaranhamento",
                      "question": "Qual afirmação expressa uma leitura cuidadosa do emaranhamento?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Ele é uma correlação quântica forte entre qubits, importante em muitos casos, mas não explica sozinho toda vantagem."
                        },
                        {
                          "id": "b",
                          "text": "Ele garante vantagem sempre que dois qubits aparecem juntos."
                        },
                        {
                          "id": "c",
                          "text": "Ele é irrelevante para discutir computação quântica."
                        },
                        {
                          "id": "d",
                          "text": "Ele substitui a medição e a interpretação clássica."
                        }
                      ],
                      "answer": "a",
                      "after": "Emaranhamento é importante, mas precisa ser analisado junto com operações, medição, modelo e custo. O erro comum é fazer dele uma explicação única."
                    },
                    {
                      "id": "card-m11-5-lacuna",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Completar a cautela",
                      "text": "Uma explicação da vantagem quântica deve evitar tratar uma metáfora como resposta suficiente e deve considerar [[modelo de computação::modelo de computação|correlação isolada|resultado já definido]], medição e custo.",
                      "after": "O modelo de computação define quais operações contam. Por isso, ele muda a explicação do que o sistema está fazendo."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            },
            {
              "id": "micro-limites-gottesman-knill-sintese",
              "title": "Limites, Gottesman-Knill e síntese para OAC",
              "goal": "Consolidar limites técnicos e mensagem arquitetural do artigo.",
              "role": "review",
              "status": "generated",
              "branchOf": null,
              "dependsOn": [
                "micro-muitos-mundos-emaranhamento"
              ],
              "covers": [
                "Teorema de Gottesman-Knill em nível conceitual",
                "ruído",
                "decoerência",
                "correção de erros",
                "arquitetura híbrida",
                "síntese final para OAC"
              ],
              "checks": [
                "reconhece que certos circuitos quânticos podem ser simulados classicamente",
                "evita a conclusão de que emaranhamento é irrelevante",
                "sintetiza que arquitetura depende do suporte físico da informação"
              ],
              "versions": [
                {
                  "id": "version-002",
                  "createdAt": "2026-05-29T00:00:00.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Corrigir linguagem visível, progressão didática, distratores e feedback dos cards, preservando a hierarquia do módulo.",
                  "summary": "Versão reparada com linguagem adequada a aluno iniciante, sem texto de bastidor nos cards, com frases úteis para apresentação oral, distratores plausíveis e after explicativo.",
                  "cards": [
                    {
                      "id": "card-m12-1-limites",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Limites arquiteturais",
                      "columns": [
                        "Fator",
                        "Efeito para a arquitetura"
                      ],
                      "rows": [
                        [
                          "ruído",
                          "pode distorcer o estado e exigir controle"
                        ],
                        [
                          "decoerência",
                          "perda de comportamento quântico útil por interação com o ambiente"
                        ],
                        [
                          "correção de erros",
                          "protege a computação contra falhas"
                        ],
                        [
                          "arquitetura híbrida",
                          "integra preparação clássica, núcleo quântico, medição e interpretação clássica"
                        ]
                      ],
                      "after": "A computação quântica real depende de custo físico, controle, medição e integração com etapas clássicas."
                    },
                    {
                      "id": "card-m12-2-gk-limites",
                      "position": 2,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Gottesman-Knill e simulação",
                      "prompt": "Associe cada ideia à sua leitura. Simulação clássica eficiente significa reproduzir resultados estatísticos em computador clássico com custo controlado.",
                      "leftSet": {
                        "label": "Ideia",
                        "items": [
                          {
                            "id": "gk",
                            "label": "Gottesman-Knill"
                          },
                          {
                            "id": "sim",
                            "label": "simulação clássica eficiente"
                          },
                          {
                            "id": "ent",
                            "label": "emaranhamento"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Leitura",
                        "items": [
                          {
                            "id": "restritos",
                            "label": "certos circuitos restritos podem ser simulados classicamente"
                          },
                          {
                            "id": "estatistica",
                            "label": "reproduz estatísticas sem ser a mesma explicação física"
                          },
                          {
                            "id": "importante",
                            "label": "pode ser importante, mas não basta sozinho"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "gk",
                          "to": "restritos"
                        },
                        {
                          "from": "sim",
                          "to": "estatistica"
                        },
                        {
                          "from": "ent",
                          "to": "importante"
                        }
                      ],
                      "after": "O mapa evita duas confusões: achar que todo circuito quântico ganha vantagem e achar que o emaranhamento se torna irrelevante."
                    },
                    {
                      "id": "card-m12-3-gottesman",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Leitura de Gottesman-Knill",
                      "question": "Qual é a leitura correta de Gottesman-Knill para discutir limites da vantagem quântica?",
                      "options": [
                        {
                          "id": "a",
                          "text": "Certos circuitos quânticos restritos podem ser simulados classicamente de modo eficiente."
                        },
                        {
                          "id": "b",
                          "text": "Todo circuito quântico perde qualquer interesse computacional."
                        },
                        {
                          "id": "c",
                          "text": "Emaranhamento nunca participa de explicações sobre vantagem."
                        },
                        {
                          "id": "d",
                          "text": "Simulação clássica eficiente é a mesma coisa que explicação física completa."
                        }
                      ],
                      "answer": "a",
                      "after": "A leitura correta é limitada: alguns circuitos restritos admitem simulação clássica eficiente. Isso não torna todo circuito inútil nem elimina a importância de outros recursos."
                    },
                    {
                      "id": "card-m12-4-sintese-oac",
                      "position": 4,
                      "resource": "table",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Síntese para OAC",
                      "columns": [
                        "Elemento",
                        "Mensagem"
                      ],
                      "rows": [
                        [
                          "informação",
                          "depende de suporte físico"
                        ],
                        [
                          "medição",
                          "produz saída clássica"
                        ],
                        [
                          "arquitetura",
                          "integra etapas clássicas e quânticas"
                        ],
                        [
                          "limites físicos",
                          "afetam custo e confiabilidade"
                        ]
                      ],
                      "after": "A melhor síntese conecta suporte físico da informação, medição e arquitetura. Para apresentar, diga: “Em OAC, computação quântica mostra que arquitetura depende de como a informação é fisicamente representada e lida.”",
                      "question": "Qual mensagem resume melhor a conexão com OAC?",
                      "options": [
                        {
                          "id": "a",
                          "text": "A arquitetura depende do suporte físico da informação e da forma de medir e interpretar resultados."
                        },
                        {
                          "id": "b",
                          "text": "A computação quântica torna a parte clássica irrelevante em qualquer sistema."
                        },
                        {
                          "id": "c",
                          "text": "Ter qubits basta para ignorar custo físico e ruído."
                        },
                        {
                          "id": "d",
                          "text": "A saída útil aparece sem medição quando o estado foi preparado."
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-m12-5-custo-real",
                      "position": 5,
                      "resource": "relation_map",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Custo físico e função",
                      "prompt": "Associe cada limite ao cuidado arquitetural correspondente.",
                      "leftSet": {
                        "label": "Limite",
                        "items": [
                          {
                            "id": "med",
                            "label": "medição"
                          },
                          {
                            "id": "ruido",
                            "label": "ruído"
                          },
                          {
                            "id": "dec",
                            "label": "decoerência"
                          },
                          {
                            "id": "erros",
                            "label": "erros"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Cuidado",
                        "items": [
                          {
                            "id": "interp",
                            "label": "interpretação clássica da saída"
                          },
                          {
                            "id": "controle",
                            "label": "controle físico"
                          },
                          {
                            "id": "protecao",
                            "label": "proteção do comportamento quântico"
                          },
                          {
                            "id": "correcao",
                            "label": "correção de erros"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "med",
                          "to": "interp"
                        },
                        {
                          "from": "ruido",
                          "to": "controle"
                        },
                        {
                          "from": "dec",
                          "to": "protecao"
                        },
                        {
                          "from": "erros",
                          "to": "correcao"
                        }
                      ],
                      "after": "A medição precisa ser interpretada como saída clássica. Ruído, decoerência e erros exigem cuidados físicos e arquiteturais.",
                      "question": "Qual associação está correta?",
                      "options": [
                        {
                          "id": "a",
                          "text": "medição → interpretação clássica da saída"
                        },
                        {
                          "id": "b",
                          "text": "ruído → dispensar controle físico"
                        },
                        {
                          "id": "c",
                          "text": "decoerência → ignorar o ambiente"
                        },
                        {
                          "id": "d",
                          "text": "erros → manter o circuito sem correção"
                        }
                      ],
                      "answer": "a"
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-002"
            }
          ]
        }
      ]
    }
  ]
}
);

export function createOrganizacaoArquiteturaComputadoresCourse() {
  return structuredClone(RAW_ORGANIZACAO_ARQUITETURA_COMPUTADORES_COURSE);
}
