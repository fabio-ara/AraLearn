const RAW_OACO_BASES_CPU_PARALELISMO_COURSE_JSON = String.raw`
{
  "contract": "aralearn.contract",
  "version": 3,
  "kind": "project",
  "scope": "course",
  "courses": [
    {
      "id": "course-oaco-bases-cpu-paralelismo",
      "title": "Organização e Arquitetura de Computadores — bases, CPU e paralelismo",
      "goal": "Consolidar conceitos e exercícios objetivos de bases numéricas, CPU, arquitetura de instruções, paralelismo e identificação de hardware.",
      "modules": [
        {
          "id": "module-bases-cpu-paralelismo",
          "title": "Bases numéricas, arquitetura da CPU e paralelismo",
          "guide": {
            "goal": "Estudar bases numéricas, CPU, arquiteturas RISC/CISC, paralelismo e identificação de hardware com prática curta, objetiva e verificável.",
            "include": [
              "notação posicional",
              "base 2, base 10 e base 16",
              "conversão decimal para binário",
              "agrupamento binário-hexadecimal",
              "porta lógica OR",
              "CPU na arquitetura de Von Neumann",
              "ciclo buscar-decodificar-executar",
              "registrador PC",
              "ULA",
              "RISC x CISC",
              "instruções de tamanho fixo em RISC",
              "eficiência energética de ARM/RISC",
              "limite térmico do aumento de clock",
              "superescalaridade",
              "Taxonomia de Flynn: SISD, SIMD, MISD, MIMD",
              "dependência RAW",
              "identificação direta e indireta de hardware",
              "CPUID",
              "informações de CPU descobertas por software",
              "barramento PCIe"
            ],
            "exclude": [
              "conteúdos anteriores fora deste recorte",
              "história detalhada da computação",
              "Lei de Moore como tópico central",
              "detalhes de implementação eletrônica de transistores",
              "cálculo formal da Lei de Amdahl",
              "programação prática em assembly MIPS/x86",
              "simuladores MARS/EMU8086",
              "NAND, NOR e XNOR",
              "protocolos detalhados de coerência de cache",
              "SMART como foco principal",
              "USB, SATA e I²C como foco principal"
            ],
            "notation": [
              "Usar ₂, ₁₀ e ₁₆ quando necessário.",
              "Usar 0 e 1 para valores lógicos.",
              "Usar A=10, B=11, C=12, D=13, E=14, F=15.",
              "Usar Fetch, Decode e Execute junto de Buscar, Decodificar e Executar.",
              "Usar PC para Program Counter e ULA para Unidade Lógica e Aritmética."
            ],
            "avoid": [
              "não transformar a unidade em resumo amplo de arquitetura",
              "não pedir respostas abertas",
              "não exigir memorização de dados invisíveis",
              "não usar alternativas absurdas",
              "não usar tópicos excluídos nos cards"
            ]
          },
          "lessons": [
            {
              "id": "lesson-conversoes-cpu-arquiteturas",
              "title": "Conversões, componentes da CPU e classificação de arquiteturas",
              "guide": {
                "goal": "Resolver conversões simples de bases numéricas e decidir alternativas de OACO com base em regras e critérios explícitos.",
                "include": [
                  "notação posicional",
                  "base 2",
                  "base 10",
                  "base 16",
                  "conversão decimal para binário",
                  "agrupamento binário-hexadecimal",
                  "porta lógica OR",
                  "CPU",
                  "Von Neumann",
                  "ciclo buscar-decodificar-executar",
                  "PC",
                  "IR",
                  "ULA",
                  "UC",
                  "registradores",
                  "RISC",
                  "CISC",
                  "ARM/RISC e eficiência energética",
                  "limite térmico do clock",
                  "superescalaridade",
                  "RAW",
                  "Taxonomia de Flynn",
                  "SISD",
                  "SIMD",
                  "MISD",
                  "MIMD",
                  "identificação direta e indireta de hardware",
                  "CPUID",
                  "PCIe"
                ],
                "exclude": [
                  "conteúdos anteriores fora deste recorte",
                  "história detalhada da computação",
                  "Lei de Moore como tópico central",
                  "detalhes de implementação eletrônica de transistores",
                  "cálculo formal da Lei de Amdahl",
                  "programação prática em assembly MIPS/x86",
                  "simuladores MARS/EMU8086",
                  "NAND, NOR e XNOR",
                  "protocolos detalhados de coerência de cache",
                  "SMART como foco principal",
                  "USB, SATA e I²C como foco principal"
                ],
                "notation": [
                  "Usar ₂, ₁₀ e ₁₆ quando necessário.",
                  "Usar 0 e 1 para valores lógicos.",
                  "Usar A=10, B=11, C=12, D=13, E=14, F=15.",
                  "Usar Fetch, Decode e Execute junto de Buscar, Decodificar e Executar.",
                  "Usar PC para Program Counter e ULA para Unidade Lógica e Aritmética."
                ],
                "avoid": [
                  "não abrir tópicos fora deste recorte",
                  "não usar perguntas abertas",
                  "não usar alternativas absurdas",
                  "não depender de dados de outro card para resolver exercício"
                ]
              },
              "topics": [
                {
                  "id": "topic-notacao-posicional",
                  "label": "notação posicional",
                  "kind": "concept",
                  "checks": [
                    "reconhece que cada posição tem peso"
                  ],
                  "errors": [
                    "somar peso cuja posição tem bit 0"
                  ]
                },
                {
                  "id": "topic-base-2",
                  "label": "base 2",
                  "kind": "concept",
                  "checks": [
                    "identifica símbolos 0 e 1"
                  ],
                  "errors": [
                    "confundir binário com decimal ou hexadecimal"
                  ]
                },
                {
                  "id": "topic-base-16",
                  "label": "base 16",
                  "kind": "concept",
                  "checks": [
                    "reconhece A-F e 4 bits por dígito"
                  ],
                  "errors": [
                    "trocar ordem dos grupos de 4 bits"
                  ]
                },
                {
                  "id": "topic-conversao-decimal-binario",
                  "label": "conversão decimal para binário",
                  "kind": "procedure",
                  "checks": [
                    "converte decimais pequenos por pesos ou restos"
                  ],
                  "errors": [
                    "ler restos na ordem errada"
                  ]
                },
                {
                  "id": "topic-porta-or",
                  "label": "porta lógica OR",
                  "kind": "concept",
                  "checks": [
                    "aplica a regra pelo menos uma entrada 1"
                  ],
                  "errors": [
                    "confundir OR com condição de entradas diferentes"
                  ]
                },
                {
                  "id": "topic-cpu",
                  "label": "CPU",
                  "kind": "concept",
                  "checks": [
                    "identifica receber, interpretar e executar instruções"
                  ],
                  "errors": [
                    "confundir CPU com armazenamento permanente"
                  ]
                },
                {
                  "id": "topic-von-neumann",
                  "label": "Von Neumann",
                  "kind": "concept",
                  "checks": [
                    "reconhece dados e instruções na memória"
                  ],
                  "errors": [
                    "separar indevidamente dados e instruções para esta questão"
                  ]
                },
                {
                  "id": "topic-ciclo-instrucao",
                  "label": "ciclo buscar-decodificar-executar",
                  "kind": "procedure",
                  "checks": [
                    "ordena Buscar, Decodificar e Executar"
                  ],
                  "errors": [
                    "trocar Decode e Execute"
                  ]
                },
                {
                  "id": "topic-pc",
                  "label": "PC",
                  "kind": "term",
                  "checks": [
                    "identifica endereço da próxima instrução"
                  ],
                  "errors": [
                    "confundir PC com IR"
                  ]
                },
                {
                  "id": "topic-ula",
                  "label": "ULA",
                  "kind": "term",
                  "checks": [
                    "identifica contas e comparações lógicas"
                  ],
                  "errors": [
                    "confundir ULA com UC"
                  ]
                },
                {
                  "id": "topic-risc-cisc",
                  "label": "RISC x CISC",
                  "kind": "concept",
                  "checks": [
                    "distingue instruções simples e complexas"
                  ],
                  "errors": [
                    "associar RISC a instruções longas e complexas"
                  ]
                },
                {
                  "id": "topic-risc-fixo",
                  "label": "instruções de tamanho fixo em RISC",
                  "kind": "concept",
                  "checks": [
                    "associa formato fixo à decodificação"
                  ],
                  "errors": [
                    "marcar tamanho variável como típico de RISC"
                  ]
                },
                {
                  "id": "topic-arm-energia",
                  "label": "eficiência energética de ARM/RISC",
                  "kind": "concept",
                  "checks": [
                    "associa ARM/RISC a dispositivos móveis e embarcados"
                  ],
                  "errors": [
                    "ignorar relação entre simplicidade e consumo"
                  ]
                },
                {
                  "id": "topic-clock-calor",
                  "label": "limite térmico do clock",
                  "kind": "concept",
                  "checks": [
                    "relaciona clock alto a calor e consumo"
                  ],
                  "errors": [
                    "achar que clock não influencia desempenho"
                  ]
                },
                {
                  "id": "topic-superescalar",
                  "label": "superescalaridade",
                  "kind": "concept",
                  "checks": [
                    "reconhece múltiplas instruções da mesma thread"
                  ],
                  "errors": [
                    "confundir superescalar com multicore"
                  ]
                },
                {
                  "id": "topic-raw",
                  "label": "dependência RAW",
                  "kind": "term",
                  "checks": [
                    "identifica leitura antes de escrita anterior terminar"
                  ],
                  "errors": [
                    "trocar RAW por outro tipo de conflito"
                  ]
                },
                {
                  "id": "topic-flynn",
                  "label": "Taxonomia de Flynn",
                  "kind": "representation",
                  "checks": [
                    "classifica por fluxos de instruções e dados"
                  ],
                  "errors": [
                    "usar clock como critério"
                  ]
                },
                {
                  "id": "topic-sisd",
                  "label": "SISD",
                  "kind": "term",
                  "checks": [
                    "associa uma instrução e um dado"
                  ],
                  "errors": [
                    "trocar SISD com SIMD"
                  ]
                },
                {
                  "id": "topic-simd",
                  "label": "SIMD",
                  "kind": "term",
                  "checks": [
                    "associa uma instrução e múltiplos dados"
                  ],
                  "errors": [
                    "trocar SIMD com MIMD"
                  ]
                },
                {
                  "id": "topic-misd",
                  "label": "MISD",
                  "kind": "term",
                  "checks": [
                    "associa múltiplas instruções e um dado"
                  ],
                  "errors": [
                    "ignorar que é caso raro"
                  ]
                },
                {
                  "id": "topic-mimd",
                  "label": "MIMD",
                  "kind": "term",
                  "checks": [
                    "associa múltiplas instruções e múltiplos dados"
                  ],
                  "errors": [
                    "trocar multicore com SIMD"
                  ]
                },
                {
                  "id": "topic-identificacao-hardware",
                  "label": "identificação de hardware por software",
                  "kind": "concept",
                  "checks": [
                    "distingue objetivo, método direto e indireto"
                  ],
                  "errors": [
                    "confundir consulta ao sistema operacional com identificação direta"
                  ]
                },
                {
                  "id": "topic-cpuid",
                  "label": "CPUID",
                  "kind": "term",
                  "checks": [
                    "reconhece CPUID como identificação direta da CPU"
                  ],
                  "errors": [
                    "atribuir CPUID a periféricos genéricos"
                  ]
                },
                {
                  "id": "topic-pcie",
                  "label": "PCIe",
                  "kind": "term",
                  "checks": [
                    "associa PCIe a GPU, rede rápida e SSD NVMe"
                  ],
                  "errors": [
                    "associar PCIe a dispositivos de baixa performance"
                  ]
                }
              ],
              "microsequences": [
                {
                  "id": "micro-notacao-posicional-binario",
                  "title": "Notação posicional e base binária",
                  "goal": "Reconhecer base, símbolos e pesos ligados em números binários pequenos.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [],
                  "covers": [
                    "notação posicional",
                    "base 2",
                    "importância do binário"
                  ],
                  "checks": [
                    "identifica base binária",
                    "localiza pesos ligados",
                    "calcula valor decimal de binário pequeno"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para estudo de notação posicional e base binária.",
                      "summary": "Apresenta base, símbolos binários, pesos posicionais e erros comuns de leitura de bits.",
                      "cards": [
                        {
                          "id": "card-notacao-regra-base",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Base e posição",
                          "text": "A base de um sistema numérico indica quantos símbolos ele usa. Decimal usa 10 símbolos, de 0 a 9. Binário usa 2 símbolos, 0 e 1. Em notação posicional, cada posição tem um peso; em binário, os pesos são potências de 2.",
                          "after": "Cada posição contribui com seu peso apenas quando o dígito da posição participa do número."
                        },
                        {
                          "id": "card-notacao-pesos-binarios",
                          "position": 2,
                          "resource": "table",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Pesos em quatro bits",
                          "columns": [
                            "Posição da esquerda para a direita",
                            "1ª",
                            "2ª",
                            "3ª",
                            "4ª"
                          ],
                          "rows": [
                            [
                              "Peso binário",
                              "8",
                              "4",
                              "2",
                              "1"
                            ],
                            [
                              "Exemplo 1011₂",
                              "1×8",
                              "0×4",
                              "1×2",
                              "1×1"
                            ]
                          ],
                          "after": "Em 1011₂, os pesos ligados são os que têm dígito 1: 8, 2 e 1."
                        },
                        {
                          "id": "card-notacao-base-binaria",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Reconhecer base 2",
                          "question": "Qual base usa apenas os símbolos 0 e 1?",
                          "options": [
                            {
                              "id": "a",
                              "text": "decimal"
                            },
                            {
                              "id": "b",
                              "text": "hexadecimal"
                            },
                            {
                              "id": "c",
                              "text": "binária"
                            },
                            {
                              "id": "d",
                              "text": "octal"
                            }
                          ],
                          "answer": "c",
                          "after": "A base binária tem exatamente dois símbolos: 0 e 1."
                        },
                        {
                          "id": "card-notacao-pesos-ligados-1011",
                          "position": 4,
                          "resource": "table",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Pesos ligados em 1011₂",
                          "columns": [
                            "Bit",
                            "1",
                            "0",
                            "1",
                            "1"
                          ],
                          "rows": [
                            [
                              "Peso",
                              "8",
                              "4",
                              "2",
                              "1"
                            ]
                          ],
                          "question": "Em 1011₂, quais pesos estão ligados?",
                          "options": [
                            {
                              "id": "a",
                              "text": "8, 2 e 1"
                            },
                            {
                              "id": "b",
                              "text": "4 e 1"
                            },
                            {
                              "id": "c",
                              "text": "8 e 4"
                            },
                            {
                              "id": "d",
                              "text": "2 e 1"
                            }
                          ],
                          "answer": "a",
                          "after": "Um peso fica ligado quando o bit da posição é 1; por isso 8, 2 e 1 entram na soma."
                        },
                        {
                          "id": "card-notacao-valor-1011",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Valor de 1011₂",
                          "question": "Use os pesos 8, 4, 2 e 1. Qual é o valor decimal de 1011₂?",
                          "options": [
                            {
                              "id": "a",
                              "text": "9₁₀"
                            },
                            {
                              "id": "b",
                              "text": "10₁₀"
                            },
                            {
                              "id": "c",
                              "text": "11₁₀"
                            },
                            {
                              "id": "d",
                              "text": "13₁₀"
                            }
                          ],
                          "answer": "c",
                          "after": "1011₂ liga os pesos 8, 2 e 1; 8 + 2 + 1 = 11."
                        },
                        {
                          "id": "card-notacao-lacuna-binario",
                          "position": 6,
                          "resource": "paragraph",
                          "kind": "exercise",
                          "exercise": "gap",
                          "title": "Símbolos do binário",
                          "text": "O sistema binário é base 2 porque usa apenas [[0 e 1::0 e 1|0 a 9|A a F]].",
                          "after": "Base 2 significa dois símbolos disponíveis, justamente 0 e 1."
                        },
                        {
                          "id": "card-notacao-erro-peso",
                          "position": 7,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Erro comum de peso",
                          "question": "Um aluno calculou 1001₂ como 8 + 4 + 1. Qual foi o erro?",
                          "options": [
                            {
                              "id": "a",
                              "text": "Somou o peso 4 mesmo com bit 0"
                            },
                            {
                              "id": "b",
                              "text": "Esqueceu o peso 8"
                            },
                            {
                              "id": "c",
                              "text": "Trocou base 2 por base 16"
                            },
                            {
                              "id": "d",
                              "text": "Leu apenas o último bit"
                            }
                          ],
                          "answer": "a",
                          "after": "Em 1001₂, o segundo bit é 0; o peso 4 não deve entrar na soma."
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
                  "id": "micro-decimal-para-binario",
                  "title": "Conversão decimal para binário",
                  "goal": "Converter decimais pequenos para binário por pesos e por divisões sucessivas.",
                  "role": "practice",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [
                    "micro-notacao-posicional-binario"
                  ],
                  "covers": [
                    "conversão decimal para binário",
                    "pesos binários",
                    "divisão sucessiva por 2"
                  ],
                  "checks": [
                    "converte 13₁₀",
                    "converte 19₁₀",
                    "converte 45₁₀",
                    "evita ler restos na ordem errada"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para praticar conversão de decimal para binário.",
                      "summary": "Treina conversão por pesos e por divisões sucessivas, com atenção à ordem dos restos.",
                      "cards": [
                        {
                          "id": "card-dec-bin-fluxo-13",
                          "position": 1,
                          "resource": "flow",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Divisões sucessivas por 2",
                          "prompt": "Para converter 13₁₀ para binário, divida por 2 e leia os restos de baixo para cima.",
                          "after": "A ordem final dos restos é invertida em relação à ordem em que eles apareceram.",
                          "structure": {
                            "kind": "sequence",
                            "items": [
                              {
                                "kind": "start",
                                "text": "13 ÷ 2 = 6, resto 1"
                              },
                              {
                                "kind": "process",
                                "text": "6 ÷ 2 = 3, resto 0"
                              },
                              {
                                "kind": "process",
                                "text": "3 ÷ 2 = 1, resto 1"
                              },
                              {
                                "kind": "process",
                                "text": "1 ÷ 2 = 0, resto 1"
                              },
                              {
                                "kind": "end",
                                "text": "Ler restos de baixo para cima: 1101₂"
                              }
                            ]
                          }
                        },
                        {
                          "id": "card-dec-bin-pesos",
                          "position": 2,
                          "resource": "table",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Pesos úteis para decimais pequenos",
                          "columns": [
                            "Peso",
                            "32",
                            "16",
                            "8",
                            "4",
                            "2",
                            "1"
                          ],
                          "rows": [
                            [
                              "Quando usar",
                              "valor ≥ 32",
                              "valor ≥ 16",
                              "valor ≥ 8",
                              "valor ≥ 4",
                              "valor ≥ 2",
                              "valor ≥ 1"
                            ]
                          ],
                          "after": "Escolher os pesos ligados ajuda a montar o binário sem perder posições."
                        },
                        {
                          "id": "card-dec-bin-13",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Converter 13₁₀",
                          "question": "Use os pesos 8, 4, 2 e 1. Qual é 13₁₀ em binário?",
                          "options": [
                            {
                              "id": "a",
                              "text": "1011₂"
                            },
                            {
                              "id": "b",
                              "text": "1101₂"
                            },
                            {
                              "id": "c",
                              "text": "1110₂"
                            },
                            {
                              "id": "d",
                              "text": "1001₂"
                            }
                          ],
                          "answer": "b",
                          "after": "13 = 8 + 4 + 1, então os bits dos pesos 8, 4, 2 e 1 ficam 1, 1, 0, 1: 1101₂."
                        },
                        {
                          "id": "card-dec-bin-19",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Converter 19₁₀",
                          "question": "Use os pesos 16, 8, 4, 2 e 1. Qual é 19₁₀ em binário?",
                          "options": [
                            {
                              "id": "a",
                              "text": "10011₂"
                            },
                            {
                              "id": "b",
                              "text": "10101₂"
                            },
                            {
                              "id": "c",
                              "text": "11001₂"
                            },
                            {
                              "id": "d",
                              "text": "10010₂"
                            }
                          ],
                          "answer": "a",
                          "after": "19 = 16 + 2 + 1; os bits são 1, 0, 0, 1, 1."
                        },
                        {
                          "id": "card-dec-bin-45-table",
                          "position": 5,
                          "resource": "table",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Converter 45₁₀ por pesos",
                          "columns": [
                            "Peso",
                            "32",
                            "16",
                            "8",
                            "4",
                            "2",
                            "1"
                          ],
                          "rows": [
                            [
                              "Usa em 45₁₀?",
                              "1",
                              "0",
                              "1",
                              "1",
                              "0",
                              "1"
                            ]
                          ],
                          "question": "A linha mostra os pesos ligados para 45₁₀. Qual é o binário?",
                          "options": [
                            {
                              "id": "a",
                              "text": "101101₂"
                            },
                            {
                              "id": "b",
                              "text": "110101₂"
                            },
                            {
                              "id": "c",
                              "text": "101011₂"
                            },
                            {
                              "id": "d",
                              "text": "111001₂"
                            }
                          ],
                          "answer": "a",
                          "after": "Lendo os bits na ordem dos pesos 32, 16, 8, 4, 2, 1, obtemos 101101₂."
                        },
                        {
                          "id": "card-dec-bin-26",
                          "position": 6,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Converter 26₁₀",
                          "question": "Use os pesos 16, 8, 4, 2 e 1. Qual é 26₁₀ em binário?",
                          "options": [
                            {
                              "id": "a",
                              "text": "11010₂"
                            },
                            {
                              "id": "b",
                              "text": "10110₂"
                            },
                            {
                              "id": "c",
                              "text": "11100₂"
                            },
                            {
                              "id": "d",
                              "text": "11001₂"
                            }
                          ],
                          "answer": "a",
                          "after": "26 = 16 + 8 + 2; os bits ficam 1, 1, 0, 1, 0."
                        },
                        {
                          "id": "card-dec-bin-32",
                          "position": 7,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Potência de 2",
                          "question": "Qual é 32₁₀ em binário?",
                          "options": [
                            {
                              "id": "a",
                              "text": "10000₂"
                            },
                            {
                              "id": "b",
                              "text": "100000₂"
                            },
                            {
                              "id": "c",
                              "text": "11111₂"
                            },
                            {
                              "id": "d",
                              "text": "101000₂"
                            }
                          ],
                          "answer": "b",
                          "after": "32 é exatamente uma potência de 2; fica 1 no peso 32 e zeros nos pesos 16, 8, 4, 2 e 1."
                        },
                        {
                          "id": "card-dec-bin-restos-22",
                          "position": 8,
                          "resource": "flow",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Restos de 22₁₀",
                          "prompt": "Observe as divisões de 22₁₀ por 2.",
                          "question": "Lendo os restos de baixo para cima, qual é o binário de 22₁₀?",
                          "options": [
                            {
                              "id": "a",
                              "text": "01101₂"
                            },
                            {
                              "id": "b",
                              "text": "10110₂"
                            },
                            {
                              "id": "c",
                              "text": "11010₂"
                            },
                            {
                              "id": "d",
                              "text": "10011₂"
                            }
                          ],
                          "answer": "b",
                          "after": "Os restos de baixo para cima são 1, 0, 1, 1, 0; portanto 22₁₀ = 10110₂.",
                          "structure": {
                            "kind": "sequence",
                            "items": [
                              {
                                "kind": "start",
                                "text": "22 ÷ 2 = 11, resto 0"
                              },
                              {
                                "kind": "process",
                                "text": "11 ÷ 2 = 5, resto 1"
                              },
                              {
                                "kind": "process",
                                "text": "5 ÷ 2 = 2, resto 1"
                              },
                              {
                                "kind": "process",
                                "text": "2 ÷ 2 = 1, resto 0"
                              },
                              {
                                "kind": "end",
                                "text": "1 ÷ 2 = 0, resto 1"
                              }
                            ]
                          }
                        },
                        {
                          "id": "card-dec-bin-erro-ordem-restos",
                          "position": 9,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Erro ao ler restos",
                          "question": "Na conversão de 13₁₀, os restos aparecem na ordem 1, 0, 1, 1 durante as divisões. Qual resultado evita o erro de ler na ordem errada?",
                          "options": [
                            {
                              "id": "a",
                              "text": "1011₂"
                            },
                            {
                              "id": "b",
                              "text": "1101₂"
                            },
                            {
                              "id": "c",
                              "text": "1110₂"
                            },
                            {
                              "id": "d",
                              "text": "1001₂"
                            }
                          ],
                          "answer": "b",
                          "after": "Na divisão por 2, os restos devem ser lidos de baixo para cima; por isso 1, 0, 1, 1 vira 1101₂."
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
                  "id": "micro-hexadecimal-agrupamento",
                  "title": "Hexadecimal e agrupamento de bits",
                  "goal": "Converter grupos de 4 bits para hexadecimal e reconhecer a equivalência entre bits e dígitos hexadecimais.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [
                    "micro-notacao-posicional-binario"
                  ],
                  "covers": [
                    "base 16",
                    "A-F",
                    "relação 1 dígito hexadecimal = 4 bits",
                    "agrupamento binário-hexadecimal"
                  ],
                  "checks": [
                    "identifica 4 bits por dígito hexadecimal",
                    "converte 1111₂ para F₁₆",
                    "converte bytes binários para hexadecimal"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para estudo de hexadecimal e agrupamento de bits.",
                      "summary": "Apresenta base 16, tabela de 4 bits, dígitos A–F e conversões por grupos.",
                      "cards": [
                        {
                          "id": "card-hex-regra",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Hexadecimal em blocos de 4 bits",
                          "text": "Hexadecimal é base 16. Usa os símbolos 0 a 9 e A, B, C, D, E, F. Cada dígito hexadecimal representa exatamente 4 bits.",
                          "after": "Em hexadecimal, cada grupo de 4 bits corresponde a um dígito da base 16."
                        },
                        {
                          "id": "card-hex-tabela-4bits",
                          "position": 2,
                          "resource": "table",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Tabela de 4 bits para hexadecimal",
                          "columns": [
                            "Binário",
                            "Hexadecimal"
                          ],
                          "rows": [
                            [
                              "0000₂",
                              "0₁₆"
                            ],
                            [
                              "0001₂",
                              "1₁₆"
                            ],
                            [
                              "0010₂",
                              "2₁₆"
                            ],
                            [
                              "0011₂",
                              "3₁₆"
                            ],
                            [
                              "0100₂",
                              "4₁₆"
                            ],
                            [
                              "0101₂",
                              "5₁₆"
                            ],
                            [
                              "0110₂",
                              "6₁₆"
                            ],
                            [
                              "0111₂",
                              "7₁₆"
                            ],
                            [
                              "1000₂",
                              "8₁₆"
                            ],
                            [
                              "1001₂",
                              "9₁₆"
                            ],
                            [
                              "1010₂",
                              "A₁₆"
                            ],
                            [
                              "1011₂",
                              "B₁₆"
                            ],
                            [
                              "1100₂",
                              "C₁₆"
                            ],
                            [
                              "1101₂",
                              "D₁₆"
                            ],
                            [
                              "1110₂",
                              "E₁₆"
                            ],
                            [
                              "1111₂",
                              "F₁₆"
                            ]
                          ],
                          "after": "A tabela permite converter cada grupo de 4 bits em um dígito hexadecimal."
                        },
                        {
                          "id": "card-hex-quantos-bits",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Bits por dígito hexadecimal",
                          "question": "Quantos bits representam exatamente um dígito hexadecimal?",
                          "options": [
                            {
                              "id": "a",
                              "text": "2 bits"
                            },
                            {
                              "id": "b",
                              "text": "3 bits"
                            },
                            {
                              "id": "c",
                              "text": "4 bits"
                            },
                            {
                              "id": "d",
                              "text": "8 bits"
                            }
                          ],
                          "answer": "c",
                          "after": "Como 16 = 2⁴, um dígito hexadecimal corresponde a 4 bits."
                        },
                        {
                          "id": "card-hex-1111",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Converter 1111₂",
                          "question": "Usando A=10, B=11, C=12, D=13, E=14 e F=15, 1111₂ corresponde a qual valor hexadecimal?",
                          "options": [
                            {
                              "id": "a",
                              "text": "A₁₆"
                            },
                            {
                              "id": "b",
                              "text": "F₁₆"
                            },
                            {
                              "id": "c",
                              "text": "10₁₆"
                            },
                            {
                              "id": "d",
                              "text": "E₁₆"
                            }
                          ],
                          "answer": "b",
                          "after": "1111₂ vale 15, e o símbolo hexadecimal para 15 é F."
                        },
                        {
                          "id": "card-hex-1010",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Converter 1010₂",
                          "question": "Usando A=10, B=11, C=12, D=13, E=14 e F=15, 1010₂ corresponde a:",
                          "options": [
                            {
                              "id": "a",
                              "text": "A₁₆"
                            },
                            {
                              "id": "b",
                              "text": "B₁₆"
                            },
                            {
                              "id": "c",
                              "text": "10₁₆"
                            },
                            {
                              "id": "d",
                              "text": "F₁₆"
                            }
                          ],
                          "answer": "a",
                          "after": "1010₂ vale 10, representado por A no sistema hexadecimal."
                        },
                        {
                          "id": "card-hex-10101100",
                          "position": 6,
                          "resource": "table",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Agrupar 1010 1100₂",
                          "columns": [
                            "Grupo binário",
                            "1010₂",
                            "1100₂"
                          ],
                          "rows": [
                            [
                              "Dígito hexadecimal",
                              "A₁₆",
                              "C₁₆"
                            ]
                          ],
                          "question": "Qual é a representação hexadecimal de 1010 1100₂?",
                          "options": [
                            {
                              "id": "a",
                              "text": "AC₁₆"
                            },
                            {
                              "id": "b",
                              "text": "CA₁₆"
                            },
                            {
                              "id": "c",
                              "text": "A12₁₆"
                            },
                            {
                              "id": "d",
                              "text": "10C₁₆"
                            }
                          ],
                          "answer": "a",
                          "after": "Cada grupo de 4 bits vira um dígito: 1010₂ é A e 1100₂ é C."
                        },
                        {
                          "id": "card-hex-00111110",
                          "position": 7,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Converter 0011 1110₂",
                          "question": "Agrupe 0011 1110₂ em dois blocos: 0011₂ e 1110₂. Qual é o hexadecimal?",
                          "options": [
                            {
                              "id": "a",
                              "text": "3E₁₆"
                            },
                            {
                              "id": "b",
                              "text": "E3₁₆"
                            },
                            {
                              "id": "c",
                              "text": "31₁₆"
                            },
                            {
                              "id": "d",
                              "text": "3F₁₆"
                            }
                          ],
                          "answer": "a",
                          "after": "0011₂ é 3 e 1110₂ é E; mantendo a ordem, o resultado é 3E₁₆."
                        },
                        {
                          "id": "card-hex-byte",
                          "position": 8,
                          "resource": "paragraph",
                          "kind": "exercise",
                          "exercise": "gap",
                          "title": "Byte em hexadecimal",
                          "text": "Um byte tem 8 bits; como cada dígito hexadecimal representa 4 bits, um byte pode ser escrito com [[2::2|4|8]] dígitos hexadecimais.",
                          "after": "8 bits formam dois grupos de 4 bits, então são dois dígitos hexadecimais."
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
                  "id": "micro-porta-or",
                  "title": "Porta lógica OR",
                  "goal": "Aplicar a regra da porta OR em entradas binárias simples.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [],
                  "covers": [
                    "porta lógica OR",
                    "tabela verdade OR",
                    "valores lógicos 0 e 1"
                  ],
                  "checks": [
                    "decide quando OR vale 1",
                    "calcula OR em linhas da tabela verdade"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para aplicar a regra da porta lógica OR.",
                      "summary": "Apresenta a regra da OR, tabela verdade e exercícios de cálculo de saída.",
                      "cards": [
                        {
                          "id": "card-or-regra",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Regra da porta OR",
                          "text": "A porta lógica OR recebe entradas 0 ou 1. A saída é 1 quando pelo menos uma entrada é 1. A única forma de sair 0 é quando todas as entradas são 0.",
                          "after": "Na OR, uma entrada 1 basta para que a saída seja 1."
                        },
                        {
                          "id": "card-or-tabela-verdade",
                          "position": 2,
                          "resource": "table",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Tabela verdade da OR",
                          "columns": [
                            "A",
                            "B",
                            "A OR B"
                          ],
                          "rows": [
                            [
                              "0",
                              "0",
                              "0"
                            ],
                            [
                              "0",
                              "1",
                              "1"
                            ],
                            [
                              "1",
                              "0",
                              "1"
                            ],
                            [
                              "1",
                              "1",
                              "1"
                            ]
                          ],
                          "after": "A tabela mostra que só a linha 0 OR 0 produz saída 0."
                        },
                        {
                          "id": "card-or-condicao-saida-1",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Quando OR vale 1",
                          "question": "Quando a saída de uma OR de duas entradas é 1?",
                          "options": [
                            {
                              "id": "a",
                              "text": "apenas quando as duas entradas são 1"
                            },
                            {
                              "id": "b",
                              "text": "apenas quando as duas entradas são 0"
                            },
                            {
                              "id": "c",
                              "text": "quando pelo menos uma entrada é 1"
                            },
                            {
                              "id": "d",
                              "text": "apenas quando as entradas são diferentes"
                            }
                          ],
                          "answer": "c",
                          "after": "Na OR, uma única entrada 1 já é suficiente para a saída ser 1."
                        },
                        {
                          "id": "card-or-00",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Calcular 0 OR 0",
                          "question": "Qual saída a tabela-verdade da OR associa a esse par de entradas?",
                          "options": [
                            {
                              "id": "a",
                              "text": "Saída 0"
                            },
                            {
                              "id": "b",
                              "text": "Saída 1"
                            },
                            {
                              "id": "c",
                              "text": "Saída 10"
                            },
                            {
                              "id": "d",
                              "text": "Depende da ordem das entradas"
                            }
                          ],
                          "answer": "a",
                          "after": "Para 0 OR 0, nenhuma entrada ativa a porta; por isso a saída é 0."
                        },
                        {
                          "id": "card-or-01",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Calcular 0 OR 1",
                          "question": "Qual saída a tabela-verdade da OR associa a esse par de entradas?",
                          "options": [
                            {
                              "id": "a",
                              "text": "Saída 0"
                            },
                            {
                              "id": "b",
                              "text": "Saída 1"
                            },
                            {
                              "id": "c",
                              "text": "Saída 2"
                            },
                            {
                              "id": "d",
                              "text": "Não há saída definida"
                            }
                          ],
                          "answer": "b",
                          "after": "Em 0 OR 1, há pelo menos uma entrada igual a 1; por isso a saída é 1."
                        },
                        {
                          "id": "card-or-11",
                          "position": 6,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Calcular 1 OR 1",
                          "question": "Qual saída a tabela-verdade da OR associa a esse par de entradas?",
                          "options": [
                            {
                              "id": "a",
                              "text": "Saída 0"
                            },
                            {
                              "id": "b",
                              "text": "Saída 1"
                            },
                            {
                              "id": "c",
                              "text": "Saída 2"
                            },
                            {
                              "id": "d",
                              "text": "Depende da primeira entrada"
                            }
                          ],
                          "answer": "b",
                          "after": "Em 1 OR 1, pelo menos uma entrada é 1, então a saída permanece 1."
                        },
                        {
                          "id": "card-or-linha-saida-zero",
                          "position": 7,
                          "resource": "table",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Linha que produz zero",
                          "columns": [
                            "A",
                            "B",
                            "A OR B"
                          ],
                          "rows": [
                            [
                              "0",
                              "0",
                              "?"
                            ],
                            [
                              "0",
                              "1",
                              "?"
                            ],
                            [
                              "1",
                              "0",
                              "?"
                            ],
                            [
                              "1",
                              "1",
                              "?"
                            ]
                          ],
                          "question": "Na porta OR, a saída só é 0 quando todas as entradas são 0. Qual linha produz saída 0?",
                          "options": [
                            {
                              "id": "a",
                              "text": "A=0 e B=0"
                            },
                            {
                              "id": "b",
                              "text": "A=0 e B=1"
                            },
                            {
                              "id": "c",
                              "text": "A=1 e B=0"
                            },
                            {
                              "id": "d",
                              "text": "A=1 e B=1"
                            }
                          ],
                          "answer": "a",
                          "after": "A única linha com saída 0 é aquela em que nenhuma entrada vale 1."
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
                  "id": "micro-cpu-von-neumann-ciclo",
                  "title": "CPU, Von Neumann e ciclo de instrução",
                  "goal": "Reconhecer a função da CPU, a ideia de Von Neumann e a ordem Buscar, Decodificar e Executar.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [],
                  "covers": [
                    "CPU na arquitetura de Von Neumann",
                    "ciclo buscar-decodificar-executar"
                  ],
                  "checks": [
                    "identifica a função da CPU",
                    "ordena Fetch, Decode e Execute",
                    "reconhece dados e instruções na memória"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para estudo da CPU, memória e ciclo de instrução.",
                      "summary": "Apresenta função da CPU, modelo de Von Neumann e sequência Buscar, Decodificar e Executar.",
                      "cards": [
                        {
                          "id": "card-cpu-regra",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Função central da CPU",
                          "text": "A CPU recebe instruções de programas, interpreta o que cada instrução pede e executa operações. Na arquitetura de Von Neumann, dados e instruções ficam na memória.",
                          "after": "Para reconhecer a CPU, pense em buscar instruções, entender comandos e executar operações."
                        },
                        {
                          "id": "card-cpu-ciclo-flow",
                          "position": 2,
                          "resource": "flow",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Ciclo de instrução",
                          "prompt": "O ciclo básico da CPU repete três etapas.",
                          "after": "O ciclo básico segue a ordem Buscar, Decodificar e Executar.",
                          "structure": {
                            "kind": "sequence",
                            "items": [
                              {
                                "kind": "start",
                                "text": "Buscar / Fetch"
                              },
                              {
                                "kind": "while",
                                "condition": "Ainda existe próxima instrução para processar?",
                                "body": [
                                  {
                                    "kind": "process",
                                    "text": "Decodificar / Decode"
                                  },
                                  {
                                    "kind": "process",
                                    "text": "Executar / Execute"
                                  },
                                  {
                                    "kind": "process",
                                    "text": "Repetir para a próxima instrução"
                                  },
                                  {
                                    "kind": "process",
                                    "text": "Buscar / Fetch"
                                  }
                                ]
                              },
                              {
                                "kind": "end",
                                "text": "Encerrar o ciclo"
                              }
                            ]
                          }
                        },
                        {
                          "id": "card-cpu-papel",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Papel principal da CPU",
                          "question": "Qual é o papel principal da CPU?",
                          "options": [
                            {
                              "id": "a",
                              "text": "armazenar dados permanentemente, como um disco"
                            },
                            {
                              "id": "b",
                              "text": "receber, interpretar e executar instruções"
                            },
                            {
                              "id": "c",
                              "text": "executar apenas operações de vídeo e gráficos"
                            },
                            {
                              "id": "d",
                              "text": "servir apenas como memória temporária para programas"
                            }
                          ],
                          "answer": "b",
                          "after": "A CPU busca, interpreta e executa instruções de programas; armazenamento permanente é função de dispositivos de memória secundária."
                        },
                        {
                          "id": "card-cpu-ordem-ciclo",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Ordem do ciclo",
                          "question": "Qual alternativa apresenta a ordem correta do ciclo básico de instrução?",
                          "options": [
                            {
                              "id": "a",
                              "text": "Executar, Decodificar, Buscar"
                            },
                            {
                              "id": "b",
                              "text": "Buscar, Executar, Decodificar"
                            },
                            {
                              "id": "c",
                              "text": "Decodificar, Buscar, Executar"
                            },
                            {
                              "id": "d",
                              "text": "Buscar, Decodificar, Executar"
                            }
                          ],
                          "answer": "d",
                          "after": "Primeiro a instrução é buscada, depois decodificada e então executada."
                        },
                        {
                          "id": "card-cpu-von-neumann",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Memória em Von Neumann",
                          "question": "Na arquitetura de Von Neumann, onde ficam dados e instruções para a CPU acessar?",
                          "options": [
                            {
                              "id": "a",
                              "text": "na memória"
                            },
                            {
                              "id": "b",
                              "text": "apenas nos registradores internos"
                            },
                            {
                              "id": "c",
                              "text": "apenas em dispositivos de entrada"
                            },
                            {
                              "id": "d",
                              "text": "apenas em barramentos de expansão"
                            }
                          ],
                          "answer": "a",
                          "after": "No modelo de Von Neumann, a memória armazena tanto dados quanto instruções."
                        },
                        {
                          "id": "card-cpu-decode",
                          "position": 6,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Etapa Decode",
                          "question": "No ciclo Buscar / Fetch, Decodificar / Decode e Executar / Execute, o que acontece na etapa Decode?",
                          "options": [
                            {
                              "id": "a",
                              "text": "a CPU obtém a instrução na memória"
                            },
                            {
                              "id": "b",
                              "text": "a CPU interpreta qual operação deve realizar"
                            },
                            {
                              "id": "c",
                              "text": "a CPU realiza a operação já interpretada"
                            },
                            {
                              "id": "d",
                              "text": "o PC aponta para a próxima instrução"
                            }
                          ],
                          "answer": "b",
                          "after": "Decodificar é interpretar a instrução para saber qual ação será executada."
                        },
                        {
                          "id": "card-cpu-fluxo-lacuna",
                          "position": 7,
                          "resource": "flow",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Completar o ciclo",
                          "prompt": "Observe a sequência do ciclo de instrução.",
                          "question": "Qual etapa completa corretamente o lugar marcado com ?",
                          "options": [
                            {
                              "id": "a",
                              "text": "Decodificar / Decode"
                            },
                            {
                              "id": "b",
                              "text": "Executar / Execute"
                            },
                            {
                              "id": "c",
                              "text": "Buscar / Fetch"
                            },
                            {
                              "id": "d",
                              "text": "Atualizar todos os registradores"
                            }
                          ],
                          "answer": "a",
                          "after": "Depois de buscar a instrução, a CPU precisa decodificá-la antes de executar.",
                          "structure": {
                            "kind": "sequence",
                            "items": [
                              {
                                "kind": "start",
                                "text": "Buscar / Fetch"
                              },
                              {
                                "kind": "process",
                                "text": "?"
                              },
                              {
                                "kind": "end",
                                "text": "Executar / Execute"
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
                  "activeVersion": "version-001"
                },
                {
                  "id": "micro-registradores-ula",
                  "title": "PC, ULA e componentes internos",
                  "goal": "Diferenciar PC, IR, ULA, UC e registradores por função objetiva.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [
                    "micro-cpu-von-neumann-ciclo"
                  ],
                  "covers": [
                    "registrador PC",
                    "ULA",
                    "UC",
                    "IR",
                    "registradores"
                  ],
                  "checks": [
                    "identifica função do PC",
                    "identifica função da ULA",
                    "diferencia IR, UC e registradores"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para associar componentes internos da CPU às suas funções.",
                      "summary": "Relaciona PC, IR, ULA, UC e registradores a funções objetivas.",
                      "cards": [
                        {
                          "id": "card-componentes-mapa",
                          "position": 1,
                          "resource": "relation_map",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Componentes e funções",
                          "prompt": "Associe cada componente interno da CPU à sua função central.",
                          "leftSet": {
                            "label": "Componente",
                            "items": [
                              {
                                "id": "pc",
                                "label": "PC"
                              },
                              {
                                "id": "ir",
                                "label": "IR"
                              },
                              {
                                "id": "ula",
                                "label": "ULA"
                              },
                              {
                                "id": "uc",
                                "label": "UC"
                              },
                              {
                                "id": "reg",
                                "label": "Registradores"
                              }
                            ]
                          },
                          "rightSet": {
                            "label": "Função",
                            "items": [
                              {
                                "id": "prox",
                                "label": "endereço da próxima instrução"
                              },
                              {
                                "id": "atual",
                                "label": "instrução atual"
                              },
                              {
                                "id": "calc",
                                "label": "contas e comparações lógicas"
                              },
                              {
                                "id": "coord",
                                "label": "coordenação interna"
                              },
                              {
                                "id": "rap",
                                "label": "memórias internas pequenas e rápidas"
                              }
                            ]
                          },
                          "relations": [
                            {
                              "from": "pc",
                              "to": "prox"
                            },
                            {
                              "from": "ir",
                              "to": "atual"
                            },
                            {
                              "from": "ula",
                              "to": "calc"
                            },
                            {
                              "from": "uc",
                              "to": "coord"
                            },
                            {
                              "from": "reg",
                              "to": "rap"
                            }
                          ],
                          "after": "O mapa separa quem aponta, quem guarda, quem calcula e quem coordena."
                        },
                        {
                          "id": "card-pc-funcao",
                          "position": 2,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Função do PC",
                          "question": "Sabendo que PC significa Program Counter, qual informação ele guarda principalmente?",
                          "options": [
                            {
                              "id": "a",
                              "text": "a instrução atual dentro do IR"
                            },
                            {
                              "id": "b",
                              "text": "o resultado temporário de uma soma"
                            },
                            {
                              "id": "c",
                              "text": "o endereço da próxima instrução"
                            },
                            {
                              "id": "d",
                              "text": "o endereço de um dispositivo de entrada e saída"
                            }
                          ],
                          "answer": "c",
                          "after": "O PC aponta para o endereço da próxima instrução que a CPU deverá buscar."
                        },
                        {
                          "id": "card-ula-funcao",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Função da ULA",
                          "question": "Sabendo que ULA significa Unidade Lógica e Aritmética, ela é responsável por:",
                          "options": [
                            {
                              "id": "a",
                              "text": "coordenar todas as etapas internas"
                            },
                            {
                              "id": "b",
                              "text": "fazer contas e comparações lógicas"
                            },
                            {
                              "id": "c",
                              "text": "guardar o endereço da próxima instrução"
                            },
                            {
                              "id": "d",
                              "text": "armazenar dados por longo prazo"
                            }
                          ],
                          "answer": "b",
                          "after": "A ULA executa operações aritméticas e decisões lógicas sobre dados."
                        },
                        {
                          "id": "card-ir-funcao",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Função do IR",
                          "question": "Sabendo que IR é o registrador de instrução, qual informação ele guarda durante o ciclo de instrução?",
                          "options": [
                            {
                              "id": "a",
                              "text": "a instrução atual"
                            },
                            {
                              "id": "b",
                              "text": "o endereço da próxima instrução a ser buscada"
                            },
                            {
                              "id": "c",
                              "text": "um resultado temporário produzido pela ULA"
                            },
                            {
                              "id": "d",
                              "text": "o identificador de um dispositivo em barramento de expansão"
                            }
                          ],
                          "answer": "a",
                          "after": "O IR guarda a instrução atual; o PC guarda o endereço da próxima instrução."
                        },
                        {
                          "id": "card-uc-funcao",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Função da UC",
                          "question": "Sabendo que UC significa Unidade de Controle, qual função combina melhor com ela?",
                          "options": [
                            {
                              "id": "a",
                              "text": "fazer a soma aritmética principal"
                            },
                            {
                              "id": "b",
                              "text": "coordenar ações internas da CPU"
                            },
                            {
                              "id": "c",
                              "text": "guardar o endereço da próxima instrução"
                            },
                            {
                              "id": "d",
                              "text": "guardar a instrução atual"
                            }
                          ],
                          "answer": "b",
                          "after": "A UC organiza sinais e etapas internas; os cálculos ficam com a ULA."
                        },
                        {
                          "id": "card-componentes-relacao-pc",
                          "position": 6,
                          "resource": "relation_map",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Associação do PC",
                          "prompt": "Observe as associações entre componentes e funções.",
                          "leftSet": {
                            "label": "Componente",
                            "items": [
                              {
                                "id": "pc",
                                "label": "PC"
                              },
                              {
                                "id": "ir",
                                "label": "IR"
                              },
                              {
                                "id": "ula",
                                "label": "ULA"
                              },
                              {
                                "id": "uc",
                                "label": "UC"
                              },
                              {
                                "id": "reg",
                                "label": "Registradores"
                              }
                            ]
                          },
                          "rightSet": {
                            "label": "Função",
                            "items": [
                              {
                                "id": "prox",
                                "label": "endereço da próxima instrução"
                              },
                              {
                                "id": "atual",
                                "label": "instrução atual"
                              },
                              {
                                "id": "calc",
                                "label": "contas e comparações lógicas"
                              },
                              {
                                "id": "coord",
                                "label": "coordenação interna"
                              },
                              {
                                "id": "rap",
                                "label": "memórias internas pequenas e rápidas"
                              }
                            ]
                          },
                          "relations": [
                            {
                              "from": "pc",
                              "to": "prox"
                            },
                            {
                              "from": "ir",
                              "to": "atual"
                            },
                            {
                              "from": "ula",
                              "to": "calc"
                            },
                            {
                              "from": "uc",
                              "to": "coord"
                            },
                            {
                              "from": "reg",
                              "to": "rap"
                            }
                          ],
                          "question": "Qual função está associada ao PC?",
                          "options": [
                            {
                              "id": "a",
                              "text": "endereço da próxima instrução"
                            },
                            {
                              "id": "b",
                              "text": "contas e comparações lógicas"
                            },
                            {
                              "id": "c",
                              "text": "instrução atual"
                            },
                            {
                              "id": "d",
                              "text": "memórias internas pequenas e rápidas"
                            }
                          ],
                          "answer": "a",
                          "after": "No mapa, PC se liga ao endereço da próxima instrução.",
                          "highlight": {
                            "leftItems": [
                              "pc"
                            ],
                            "rightItems": [
                              "prox"
                            ],
                            "relations": [
                              [
                                "pc",
                                "prox"
                              ]
                            ]
                          }
                        },
                        {
                          "id": "card-componentes-relacao-ula",
                          "position": 7,
                          "resource": "relation_map",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Associação da ULA",
                          "prompt": "Observe as associações entre componentes e funções.",
                          "leftSet": {
                            "label": "Componente",
                            "items": [
                              {
                                "id": "pc",
                                "label": "PC"
                              },
                              {
                                "id": "ir",
                                "label": "IR"
                              },
                              {
                                "id": "ula",
                                "label": "ULA"
                              },
                              {
                                "id": "uc",
                                "label": "UC"
                              },
                              {
                                "id": "reg",
                                "label": "Registradores"
                              }
                            ]
                          },
                          "rightSet": {
                            "label": "Função",
                            "items": [
                              {
                                "id": "prox",
                                "label": "endereço da próxima instrução"
                              },
                              {
                                "id": "atual",
                                "label": "instrução atual"
                              },
                              {
                                "id": "calc",
                                "label": "contas e comparações lógicas"
                              },
                              {
                                "id": "coord",
                                "label": "coordenação interna"
                              },
                              {
                                "id": "rap",
                                "label": "memórias internas pequenas e rápidas"
                              }
                            ]
                          },
                          "relations": [
                            {
                              "from": "pc",
                              "to": "prox"
                            },
                            {
                              "from": "ir",
                              "to": "atual"
                            },
                            {
                              "from": "ula",
                              "to": "calc"
                            },
                            {
                              "from": "uc",
                              "to": "coord"
                            },
                            {
                              "from": "reg",
                              "to": "rap"
                            }
                          ],
                          "question": "Qual função está associada à ULA?",
                          "options": [
                            {
                              "id": "a",
                              "text": "coordenação interna"
                            },
                            {
                              "id": "b",
                              "text": "instrução atual"
                            },
                            {
                              "id": "c",
                              "text": "contas e comparações lógicas"
                            },
                            {
                              "id": "d",
                              "text": "endereço da próxima instrução"
                            }
                          ],
                          "answer": "c",
                          "after": "No mapa, ULA se liga a contas e comparações lógicas.",
                          "highlight": {
                            "leftItems": [
                              "ula"
                            ],
                            "rightItems": [
                              "calc"
                            ],
                            "relations": [
                              [
                                "ula",
                                "calc"
                              ]
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
                  "activeVersion": "version-001"
                },
                {
                  "id": "micro-risc-cisc",
                  "title": "RISC x CISC",
                  "goal": "Distinguir RISC e CISC por foco, formato de instrução e eficiência energética.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [],
                  "covers": [
                    "RISC x CISC",
                    "instruções de tamanho fixo em RISC",
                    "eficiência energética de ARM/RISC"
                  ],
                  "checks": [
                    "identifica foco de RISC",
                    "associa RISC a formato geralmente fixo",
                    "associa ARM/RISC à eficiência energética"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para comparar RISC e CISC.",
                      "summary": "Compara simplicidade, formato de instrução, pipeline e eficiência energética.",
                      "cards": [
                        {
                          "id": "card-risc-cisc-regra",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Ideia central de RISC e CISC",
                          "text": "RISC prioriza instruções simples, rápidas e previsíveis. CISC prioriza instruções mais complexas e versáteis. Em RISC, formato e tamanho geralmente fixos ajudam a decodificação e o pipeline.",
                          "after": "RISC é associado a instruções simples e previsíveis; CISC é associado a instruções mais complexas e versáteis."
                        },
                        {
                          "id": "card-risc-cisc-tabela",
                          "position": 2,
                          "resource": "table",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Comparação direta",
                          "columns": [
                            "Critério",
                            "RISC",
                            "CISC"
                          ],
                          "rows": [
                            [
                              "Foco",
                              "instruções simples",
                              "instruções mais complexas"
                            ],
                            [
                              "Formato típico",
                              "geralmente fixo",
                              "mais variável"
                            ],
                            [
                              "Pipeline",
                              "mais fácil de organizar",
                              "decodificação tende a ser mais trabalhosa"
                            ],
                            [
                              "Eficiência energética",
                              "forte em ARM",
                              "depende do projeto"
                            ]
                          ],
                          "after": "A comparação separa simplicidade previsível de versatilidade complexa."
                        },
                        {
                          "id": "card-risc-foco",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Foco principal de RISC",
                          "question": "Sabendo que RISC prioriza instruções simples e previsíveis, qual é o foco principal dessa arquitetura?",
                          "options": [
                            {
                              "id": "a",
                              "text": "instruções longas e complexas"
                            },
                            {
                              "id": "b",
                              "text": "reduzir código com instruções muito densas"
                            },
                            {
                              "id": "c",
                              "text": "simplicidade das instruções para velocidade e pipeline"
                            },
                            {
                              "id": "d",
                              "text": "muitos modos complexos de acesso a dados"
                            }
                          ],
                          "answer": "c",
                          "after": "RISC busca instruções simples e previsíveis, o que favorece velocidade e pipeline."
                        },
                        {
                          "id": "card-risc-formato-fixo",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Formato de instrução em RISC",
                          "question": "Sabendo que RISC costuma usar instruções simples e de formato previsível, qual característica ajuda o hardware a decodificá-las?",
                          "options": [
                            {
                              "id": "a",
                              "text": "instruções de tamanho muito variável"
                            },
                            {
                              "id": "b",
                              "text": "formato e tamanho geralmente fixos"
                            },
                            {
                              "id": "c",
                              "text": "muitos formatos diferentes para operações simples"
                            },
                            {
                              "id": "d",
                              "text": "decodificação dependente de várias etapas irregulares"
                            }
                          ],
                          "answer": "b",
                          "after": "Formato geralmente fixo torna a decodificação mais previsível para o hardware."
                        },
                        {
                          "id": "card-risc-arm-energia",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "ARM e eficiência",
                          "question": "Arquiteturas RISC, como ARM, costumam se destacar por eficiência energética em:",
                          "options": [
                            {
                              "id": "a",
                              "text": "dispositivos móveis e sistemas embarcados"
                            },
                            {
                              "id": "b",
                              "text": "sistemas que priorizam instruções complexas e muito variáveis"
                            },
                            {
                              "id": "c",
                              "text": "ambientes em que consumo de energia não influencia o projeto"
                            },
                            {
                              "id": "d",
                              "text": "arquiteturas escolhidas apenas por terem muitas instruções densas"
                            }
                          ],
                          "answer": "a",
                          "after": "A simplicidade e previsibilidade de muitas arquiteturas RISC favorecem eficiência energética em dispositivos móveis e embarcados."
                        },
                        {
                          "id": "card-cisc-caracteristica",
                          "position": 6,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Reconhecer CISC",
                          "question": "Sabendo que CISC prioriza instruções mais complexas e versáteis, qual descrição combina melhor com CISC?",
                          "options": [
                            {
                              "id": "a",
                              "text": "conjunto com instruções mais complexas e versáteis"
                            },
                            {
                              "id": "b",
                              "text": "conjunto com instruções simples e formato geralmente fixo"
                            },
                            {
                              "id": "c",
                              "text": "classificação pela quantidade de fluxos de dados"
                            },
                            {
                              "id": "d",
                              "text": "execução de várias instruções da mesma thread no mesmo ciclo"
                            }
                          ],
                          "answer": "a",
                          "after": "CISC é associado a instruções mais complexas e versáteis; a alternativa de instruções simples e fixas descreve melhor RISC."
                        },
                        {
                          "id": "card-risc-lacuna-pipeline",
                          "position": 7,
                          "resource": "paragraph",
                          "kind": "exercise",
                          "exercise": "gap",
                          "title": "Pipeline em RISC",
                          "text": "RISC tende a facilitar o pipeline porque suas instruções são mais simples e de formato geralmente [[fixo::fixo|muito variável|dependente de cada dado]].",
                          "after": "Formato fixo reduz a irregularidade na decodificação e na organização das etapas."
                        },
                        {
                          "id": "card-risc-escolha-tabela",
                          "position": 8,
                          "resource": "table",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Escolher pela tabela",
                          "columns": [
                            "Característica",
                            "Arquitetura mais provável"
                          ],
                          "rows": [
                            [
                              "instruções simples",
                              "RISC"
                            ],
                            [
                              "formato geralmente fixo",
                              "RISC"
                            ],
                            [
                              "instruções mais complexas",
                              "CISC"
                            ]
                          ],
                          "question": "Se as características são simplicidade e formato geralmente fixo, qual alternativa é a melhor?",
                          "options": [
                            {
                              "id": "a",
                              "text": "RISC"
                            },
                            {
                              "id": "b",
                              "text": "CISC"
                            },
                            {
                              "id": "c",
                              "text": "classificação por fluxos de dados"
                            },
                            {
                              "id": "d",
                              "text": "dependência de leitura após escrita"
                            }
                          ],
                          "answer": "a",
                          "after": "Instruções simples e formato geralmente fixo descrevem melhor RISC."
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
                  "id": "micro-paralelismo-superescalar-raw",
                  "title": "Limite do clock, superescalaridade e RAW",
                  "goal": "Separar limite térmico, superescalaridade e dependência RAW.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [
                    "micro-cpu-von-neumann-ciclo"
                  ],
                  "covers": [
                    "limite térmico do aumento de clock",
                    "superescalaridade",
                    "dependência RAW",
                    "paralelismo"
                  ],
                  "checks": [
                    "reconhece calor e consumo como limite de clock",
                    "define superescalar",
                    "identifica RAW"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para distinguir clock, paralelismo, superescalaridade e RAW.",
                      "summary": "Trabalha limite térmico, execução de múltiplas instruções e dependência Read After Write.",
                      "cards": [
                        {
                          "id": "card-paralelismo-regra",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Desempenho sem depender só do clock",
                          "text": "Aumentar clock indefinidamente gera calor e consumo de energia. Por isso, arquiteturas exploram paralelismo. Um processador superescalar pode executar múltiplas instruções de uma mesma thread em paralelo no mesmo ciclo. RAW significa Read After Write: uma instrução tenta ler um dado antes de uma anterior terminar de escrever esse dado.",
                          "after": "A separação importante é: clock alto aumenta calor; paralelismo tenta ganhar desempenho por outro caminho."
                        },
                        {
                          "id": "card-paralelismo-comparacao",
                          "position": 2,
                          "resource": "table",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Separar ideias próximas",
                          "columns": [
                            "Ideia",
                            "Característica central"
                          ],
                          "rows": [
                            [
                              "Clock",
                              "frequência de operação"
                            ],
                            [
                              "Superescalar",
                              "múltiplas instruções da mesma thread no mesmo ciclo"
                            ],
                            [
                              "Multicore",
                              "vários núcleos podem executar fluxos diferentes"
                            ],
                            [
                              "RAW",
                              "ler antes de a escrita anterior terminar"
                            ]
                          ],
                          "after": "A mesma thread no mesmo ciclo separa superescalaridade de múltiplos núcleos."
                        },
                        {
                          "id": "card-raw-flow",
                          "position": 3,
                          "resource": "flow",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Dependência RAW",
                          "prompt": "Exemplo abstrato de dependência RAW.",
                          "after": "A leitura depende da escrita anterior; por isso é Read After Write.",
                          "structure": {
                            "kind": "sequence",
                            "items": [
                              {
                                "kind": "start",
                                "text": "Instrução 1 calcula novo valor de R1"
                              },
                              {
                                "kind": "process",
                                "text": "Instrução 1 ainda não terminou de escrever R1"
                              },
                              {
                                "kind": "process",
                                "text": "Instrução 2 tenta ler R1"
                              },
                              {
                                "kind": "end",
                                "text": "Risco: leitura do valor antigo"
                              }
                            ]
                          }
                        },
                        {
                          "id": "card-clock-calor",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Limite do aumento de clock",
                          "question": "Por que aumentar continuamente a frequência de clock se tornou uma estratégia insustentável?",
                          "options": [
                            {
                              "id": "a",
                              "text": "porque frequência maior tende a elevar calor e consumo"
                            },
                            {
                              "id": "b",
                              "text": "porque a memória principal sempre acelera na mesma proporção do clock"
                            },
                            {
                              "id": "c",
                              "text": "porque o pipeline elimina totalmente o consumo extra"
                            },
                            {
                              "id": "d",
                              "text": "porque múltiplos núcleos impedem qualquer uso de frequência alta"
                            }
                          ],
                          "answer": "a",
                          "after": "Elevar frequência aumenta a demanda de energia e a dissipação de calor, criando limite físico e térmico."
                        },
                        {
                          "id": "card-superescalar-definicao",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Definir superescalar",
                          "question": "Processador superescalar é aquele que:",
                          "options": [
                            {
                              "id": "a",
                              "text": "executa obrigatoriamente vários programas independentes em núcleos separados"
                            },
                            {
                              "id": "b",
                              "text": "aplica necessariamente uma mesma instrução a muitos dados"
                            },
                            {
                              "id": "c",
                              "text": "executa múltiplas instruções de uma mesma thread em paralelo"
                            },
                            {
                              "id": "d",
                              "text": "executa uma única instrução por ciclo sem paralelismo interno"
                            }
                          ],
                          "answer": "c",
                          "after": "Superescalaridade explora paralelismo entre instruções dentro de uma mesma thread."
                        },
                        {
                          "id": "card-raw-definicao",
                          "position": 6,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Identificar RAW",
                          "question": "Sabendo que RAW significa Read After Write, quando esse problema ocorre?",
                          "options": [
                            {
                              "id": "a",
                              "text": "uma instrução lê antes de uma anterior escrever o dado necessário"
                            },
                            {
                              "id": "b",
                              "text": "duas instruções independentes leem dados diferentes"
                            },
                            {
                              "id": "c",
                              "text": "uma instrução já escrita é lida depois de concluída"
                            },
                            {
                              "id": "d",
                              "text": "um processador aumenta clock para reduzir espera"
                            }
                          ],
                          "answer": "a",
                          "after": "Read After Write descreve a leitura de um valor que ainda depende de escrita anterior."
                        },
                        {
                          "id": "card-superescalar-nao-multicore",
                          "position": 7,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Superescalar ou multicore",
                          "question": "Um enunciado diz: 'múltiplas instruções de uma mesma thread no mesmo ciclo'. Qual conceito ele descreve melhor?",
                          "options": [
                            {
                              "id": "a",
                              "text": "superescalaridade"
                            },
                            {
                              "id": "b",
                              "text": "multicore com fluxos independentes"
                            },
                            {
                              "id": "c",
                              "text": "SIMD com a mesma instrução em muitos dados"
                            },
                            {
                              "id": "d",
                              "text": "SISD sem paralelismo"
                            }
                          ],
                          "answer": "a",
                          "after": "A expressão 'mesma thread no mesmo ciclo' descreve superescalaridade, não multicore."
                        },
                        {
                          "id": "card-raw-identificar-fluxo",
                          "position": 8,
                          "resource": "flow",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Ler antes de escrever",
                          "prompt": "Observe a sequência. RAW significa Read After Write: leitura antes da escrita necessária estar concluída.",
                          "question": "Qual problema aparece nessa sequência?",
                          "options": [
                            {
                              "id": "a",
                              "text": "RAW"
                            },
                            {
                              "id": "b",
                              "text": "sem dependência de dados"
                            },
                            {
                              "id": "c",
                              "text": "apenas superescalaridade sem conflito"
                            },
                            {
                              "id": "d",
                              "text": "apenas aumento de clock"
                            }
                          ],
                          "answer": "a",
                          "after": "I2 quer ler R2 antes de I1 terminar de escrever R2; isso é RAW.",
                          "structure": {
                            "kind": "sequence",
                            "items": [
                              {
                                "kind": "start",
                                "text": "I1: começa a calcular novo valor de R2"
                              },
                              {
                                "kind": "process",
                                "text": "I2: precisa ler R2"
                              },
                              {
                                "kind": "end",
                                "text": "I1: ainda não escreveu o novo R2"
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
                  "activeVersion": "version-001"
                },
                {
                  "id": "micro-flynn",
                  "title": "Taxonomia de Flynn",
                  "goal": "Classificar SISD, SIMD, MISD e MIMD por fluxos de instruções e dados.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [
                    "micro-paralelismo-superescalar-raw"
                  ],
                  "covers": [
                    "Taxonomia de Flynn",
                    "SISD",
                    "SIMD",
                    "MISD",
                    "MIMD",
                    "multicore"
                  ],
                  "checks": [
                    "identifica critérios de Flynn",
                    "classifica SISD, SIMD, MISD e MIMD",
                    "associa GPU a SIMD",
                    "associa multicore a MIMD"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para classificar arquiteturas pela Taxonomia de Flynn.",
                      "summary": "Apresenta fluxos de instruções e dados para SISD, SIMD, MISD e MIMD.",
                      "cards": [
                        {
                          "id": "card-flynn-regra",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Critérios da Taxonomia de Flynn",
                          "text": "A Taxonomia de Flynn classifica arquiteturas pelo número de fluxos de instruções e pelo número de fluxos de dados. Single significa um fluxo; Multiple significa múltiplos fluxos.",
                          "after": "A sigla combina I de instruções e D de dados."
                        },
                        {
                          "id": "card-flynn-tabela",
                          "position": 2,
                          "resource": "table",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Tabela de Flynn",
                          "columns": [
                            "Categoria",
                            "Fluxos de instruções",
                            "Fluxos de dados",
                            "Exemplo típico"
                          ],
                          "rows": [
                            [
                              "SISD",
                              "1",
                              "1",
                              "execução sequencial simples"
                            ],
                            [
                              "SIMD",
                              "1",
                              "muitos",
                              "mesma operação em muitos dados"
                            ],
                            [
                              "MISD",
                              "muitos",
                              "1",
                              "caso raro"
                            ],
                            [
                              "MIMD",
                              "muitos",
                              "muitos",
                              "multicore"
                            ]
                          ],
                          "after": "Ler a sigla ajuda: SI ou MI fala de instruções; SD ou MD fala de dados."
                        },
                        {
                          "id": "card-flynn-mapa",
                          "position": 3,
                          "resource": "relation_map",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Categorias e combinações",
                          "prompt": "Associe cada categoria à combinação de fluxos de instruções e dados.",
                          "leftSet": {
                            "label": "Categoria",
                            "items": [
                              {
                                "id": "sisd",
                                "label": "SISD"
                              },
                              {
                                "id": "simd",
                                "label": "SIMD"
                              },
                              {
                                "id": "misd",
                                "label": "MISD"
                              },
                              {
                                "id": "mimd",
                                "label": "MIMD"
                              }
                            ]
                          },
                          "rightSet": {
                            "label": "Combinação",
                            "items": [
                              {
                                "id": "umum",
                                "label": "1 instrução e 1 dado"
                              },
                              {
                                "id": "ummuitos",
                                "label": "1 instrução e muitos dados"
                              },
                              {
                                "id": "muitosum",
                                "label": "muitas instruções e 1 dado"
                              },
                              {
                                "id": "muitosmuitos",
                                "label": "muitas instruções e muitos dados"
                              }
                            ]
                          },
                          "relations": [
                            {
                              "from": "sisd",
                              "to": "umum"
                            },
                            {
                              "from": "simd",
                              "to": "ummuitos"
                            },
                            {
                              "from": "misd",
                              "to": "muitosum"
                            },
                            {
                              "from": "mimd",
                              "to": "muitosmuitos"
                            }
                          ],
                          "after": "A sigla combina quantidade de fluxos de instruções com quantidade de fluxos de dados."
                        },
                        {
                          "id": "card-flynn-criterios",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Critérios de Flynn",
                          "question": "A Taxonomia de Flynn usa quais critérios?",
                          "options": [
                            {
                              "id": "a",
                              "text": "tamanho da memória e número de periféricos"
                            },
                            {
                              "id": "b",
                              "text": "clock e consumo de energia"
                            },
                            {
                              "id": "c",
                              "text": "RISC/CISC e pipeline"
                            },
                            {
                              "id": "d",
                              "text": "fluxos de instruções e fluxos de dados"
                            }
                          ],
                          "answer": "d",
                          "after": "Flynn cruza quantidade de fluxos de instruções com quantidade de fluxos de dados."
                        },
                        {
                          "id": "card-flynn-multicore",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Multicore em Flynn",
                          "question": "Sabendo que M = Multiple, I = Instruction e D = Data, processadores multicore comuns, com múltiplos fluxos de instruções e dados, se aproximam de:",
                          "options": [
                            {
                              "id": "a",
                              "text": "SISD"
                            },
                            {
                              "id": "b",
                              "text": "SIMD"
                            },
                            {
                              "id": "c",
                              "text": "MISD"
                            },
                            {
                              "id": "d",
                              "text": "MIMD"
                            }
                          ],
                          "answer": "d",
                          "after": "Múltiplos fluxos de instruções trabalhando sobre múltiplos fluxos de dados correspondem a MIMD."
                        },
                        {
                          "id": "card-flynn-gpu-simd",
                          "position": 6,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Mesma operação em muitos dados",
                          "question": "Sabendo que S = Single, M = Multiple, I = Instruction e D = Data, uma GPU aplicando a mesma operação a muitos pixels se aproxima de:",
                          "options": [
                            {
                              "id": "a",
                              "text": "SISD"
                            },
                            {
                              "id": "b",
                              "text": "SIMD"
                            },
                            {
                              "id": "c",
                              "text": "MISD"
                            },
                            {
                              "id": "d",
                              "text": "MIMD"
                            }
                          ],
                          "answer": "b",
                          "after": "Uma operação aplicada a muitos dados caracteriza SIMD."
                        },
                        {
                          "id": "card-flynn-sisd",
                          "position": 7,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Reconhecer SISD",
                          "question": "Sabendo que S = Single, M = Multiple, I = Instruction e D = Data, qual descrição define SISD?",
                          "options": [
                            {
                              "id": "a",
                              "text": "uma instrução e um dado"
                            },
                            {
                              "id": "b",
                              "text": "uma instrução e muitos dados"
                            },
                            {
                              "id": "c",
                              "text": "muitas instruções e um dado"
                            },
                            {
                              "id": "d",
                              "text": "muitas instruções e muitos dados"
                            }
                          ],
                          "answer": "a",
                          "after": "SISD significa Single Instruction, Single Data: uma instrução e um dado."
                        },
                        {
                          "id": "card-flynn-misd",
                          "position": 8,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Reconhecer MISD",
                          "question": "Sabendo que S = Single, M = Multiple, I = Instruction e D = Data, na Taxonomia de Flynn, MISD significa:",
                          "options": [
                            {
                              "id": "a",
                              "text": "uma instrução e um dado"
                            },
                            {
                              "id": "b",
                              "text": "uma instrução e muitos dados"
                            },
                            {
                              "id": "c",
                              "text": "muitas instruções e um dado"
                            },
                            {
                              "id": "d",
                              "text": "muitas instruções e muitos dados"
                            }
                          ],
                          "answer": "c",
                          "after": "MI indica Multiple Instruction, muitas instruções; SD indica Single Data, um dado."
                        },
                        {
                          "id": "card-flynn-desafio-mimd",
                          "position": 9,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Desafio de MIMD",
                          "question": "Em MIMD, qual desafio aparece porque há múltiplos fluxos trabalhando em paralelo?",
                          "options": [
                            {
                              "id": "a",
                              "text": "comunicação, sincronização e consistência dos dados"
                            },
                            {
                              "id": "b",
                              "text": "garantir uma única instrução para todos os dados"
                            },
                            {
                              "id": "c",
                              "text": "manter todos os núcleos executando exatamente a mesma instrução"
                            },
                            {
                              "id": "d",
                              "text": "tratar todos os fluxos como uma execução sequencial única"
                            }
                          ],
                          "answer": "a",
                          "after": "Quando muitos fluxos trabalham ao mesmo tempo, é preciso coordenar comunicação, sincronização e consistência dos dados."
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
                  "id": "micro-identificacao-hardware",
                  "title": "Identificação de hardware por software",
                  "goal": "Reconhecer objetivos, identificação direta e indireta, CPUID e PCIe.",
                  "role": "explain",
                  "status": "generated",
                  "branchOf": null,
                  "dependsOn": [],
                  "covers": [
                    "identificação direta e indireta de hardware",
                    "CPUID",
                    "informações de CPU descobertas por software",
                    "barramento PCIe"
                  ],
                  "checks": [
                    "identifica objetivo de otimização",
                    "reconhece CPUID como identificação direta",
                    "reconhece informações da CPU",
                    "associa PCIe a GPU, rede rápida e SSD NVMe"
                  ],
                  "versions": [
                    {
                      "id": "version-001",
                      "createdAt": "2026-06-12T00:00:00.000Z",
                      "source": "llm",
                      "action": "repair",
                      "request": "Microssequência para reconhecer identificação de hardware por software.",
                      "summary": "Relaciona objetivo da identificação, métodos direto e indireto, CPUID e PCIe.",
                      "cards": [
                        {
                          "id": "card-hw-regra",
                          "position": 1,
                          "resource": "paragraph",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Identificação de hardware por software",
                          "text": "Software identifica hardware para ajustar configurações, otimizar desempenho e escolher recursos compatíveis. Identificação direta ocorre quando o programa obtém informação do próprio hardware, como pela instrução CPUID. Identificação indireta ocorre quando o programa consulta o sistema operacional ou outra camada intermediária.",
                          "after": "A diferença central é a origem da informação: diretamente do hardware ou por uma camada intermediária."
                        },
                        {
                          "id": "card-hw-mapa",
                          "position": 2,
                          "resource": "relation_map",
                          "kind": "theory",
                          "exercise": "none",
                          "title": "Método e exemplo",
                          "prompt": "Associe cada conceito à característica correspondente.",
                          "leftSet": {
                            "label": "Conceito",
                            "items": [
                              {
                                "id": "obj",
                                "label": "objetivo"
                              },
                              {
                                "id": "dir",
                                "label": "identificação direta"
                              },
                              {
                                "id": "ind",
                                "label": "identificação indireta"
                              },
                              {
                                "id": "cpuid",
                                "label": "CPUID"
                              },
                              {
                                "id": "pcie",
                                "label": "PCIe"
                              }
                            ]
                          },
                          "rightSet": {
                            "label": "Característica",
                            "items": [
                              {
                                "id": "otim",
                                "label": "ajustar configurações e desempenho"
                              },
                              {
                                "id": "instr",
                                "label": "instrução consultada pelo programa"
                              },
                              {
                                "id": "so",
                                "label": "consulta ao sistema operacional"
                              },
                              {
                                "id": "cpuinfo",
                                "label": "modelo, núcleos, caches e instruções especiais"
                              },
                              {
                                "id": "alta",
                                "label": "conectar dispositivos de alta performance"
                              }
                            ]
                          },
                          "relations": [
                            {
                              "from": "obj",
                              "to": "otim"
                            },
                            {
                              "from": "dir",
                              "to": "instr"
                            },
                            {
                              "from": "ind",
                              "to": "so"
                            },
                            {
                              "from": "cpuid",
                              "to": "cpuinfo"
                            },
                            {
                              "from": "pcie",
                              "to": "alta"
                            }
                          ],
                          "after": "A associação separa objetivo, método direto, método indireto, dados da CPU e barramento de alta performance."
                        },
                        {
                          "id": "card-hw-objetivo",
                          "position": 3,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Objetivo da identificação",
                          "question": "Programas podem identificar hardware para adaptar recursos disponíveis. Qual é um objetivo principal dessa identificação?",
                          "options": [
                            {
                              "id": "a",
                              "text": "ajustar configurações e otimizar desempenho"
                            },
                            {
                              "id": "b",
                              "text": "usar sempre a mesma configuração em qualquer hardware"
                            },
                            {
                              "id": "c",
                              "text": "ignorar instruções especiais da CPU"
                            },
                            {
                              "id": "d",
                              "text": "evitar consultar recursos disponíveis"
                            }
                          ],
                          "answer": "a",
                          "after": "Programas podem adaptar uso de recursos conforme o hardware disponível."
                        },
                        {
                          "id": "card-hw-direta-cpuid",
                          "position": 4,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Identificação direta da CPU",
                          "question": "Identificação direta obtém informação no próprio hardware ou por instrução específica. Qual opção representa identificação direta da CPU?",
                          "options": [
                            {
                              "id": "a",
                              "text": "consultar uma API do sistema operacional que informa o modelo da CPU"
                            },
                            {
                              "id": "b",
                              "text": "ler informações expostas por BIOS ou firmware sem consultar a CPU diretamente"
                            },
                            {
                              "id": "c",
                              "text": "executar a instrução CPUID"
                            },
                            {
                              "id": "d",
                              "text": "inferir recursos por uma configuração recomendada de aplicativo"
                            }
                          ],
                          "answer": "c",
                          "after": "CPUID é uma instrução usada pelo programa para obter informações diretamente da CPU."
                        },
                        {
                          "id": "card-hw-indireta",
                          "position": 5,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Identificação indireta",
                          "question": "Identificação indireta usa uma camada intermediária. Qual opção representa identificação indireta de hardware?",
                          "options": [
                            {
                              "id": "a",
                              "text": "executar CPUID diretamente"
                            },
                            {
                              "id": "b",
                              "text": "consultar uma API do sistema operacional"
                            },
                            {
                              "id": "c",
                              "text": "assumir recursos pela marca comercial do computador"
                            },
                            {
                              "id": "d",
                              "text": "usar uma configuração padrão sem consultar o sistema"
                            }
                          ],
                          "answer": "b",
                          "after": "Na identificação indireta, o programa recebe a informação por uma camada intermediária, como o sistema operacional."
                        },
                        {
                          "id": "card-hw-cpuid-dados",
                          "position": 6,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Informações obtidas por CPUID",
                          "question": "CPUID é uma instrução de identificação da CPU. Quais informações ela pode revelar?",
                          "options": [
                            {
                              "id": "a",
                              "text": "modelo, núcleos/threads, caches e instruções especiais"
                            },
                            {
                              "id": "b",
                              "text": "versão do sistema operacional e nome do usuário"
                            },
                            {
                              "id": "c",
                              "text": "capacidade do SSD e taxa de atualização do monitor"
                            },
                            {
                              "id": "d",
                              "text": "dispositivos conectados ao barramento PCIe"
                            }
                          ],
                          "answer": "a",
                          "after": "CPUID retorna características da CPU que ajudam compatibilidade e otimização."
                        },
                        {
                          "id": "card-hw-pcie",
                          "position": 7,
                          "resource": "choice",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Função do PCIe",
                          "question": "PCIe é um barramento de alta velocidade. Ele é projetado para conectar principalmente:",
                          "options": [
                            {
                              "id": "a",
                              "text": "GPU, rede de alta velocidade e SSD NVMe"
                            },
                            {
                              "id": "b",
                              "text": "periféricos simples de baixa largura de banda"
                            },
                            {
                              "id": "c",
                              "text": "registradores internos entre ULA e UC"
                            },
                            {
                              "id": "d",
                              "text": "instruções internas da CPU, como CPUID"
                            }
                          ],
                          "answer": "a",
                          "after": "PCIe é um barramento de alta velocidade para dispositivos que precisam de grande largura de banda."
                        },
                        {
                          "id": "card-hw-classificar-metodo",
                          "position": 8,
                          "resource": "table",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Classificar método",
                          "columns": [
                            "Critério usado pelo programa",
                            "Classificação"
                          ],
                          "rows": [
                            [
                              "obtém a informação no próprio hardware ou por instrução específica",
                              "direto"
                            ],
                            [
                              "obtém a informação por uma camada intermediária",
                              "indireto"
                            ]
                          ],
                          "question": "Um programa chama uma API do sistema operacional para obter dados do processador. Qual é a classificação do método?",
                          "options": [
                            {
                              "id": "a",
                              "text": "indireto"
                            },
                            {
                              "id": "b",
                              "text": "direto"
                            },
                            {
                              "id": "c",
                              "text": "direto, pois o processador é físico"
                            },
                            {
                              "id": "d",
                              "text": "nenhum método, pois software não obtém dados de hardware"
                            }
                          ],
                          "answer": "a",
                          "after": "A API do sistema operacional funciona como camada intermediária; por isso o método é indireto."
                        },
                        {
                          "id": "card-hw-relacao-pcie",
                          "position": 9,
                          "resource": "relation_map",
                          "kind": "exercise",
                          "exercise": "choice",
                          "title": "Associar PCIe",
                          "prompt": "Observe as associações.",
                          "leftSet": {
                            "label": "Conceito",
                            "items": [
                              {
                                "id": "cpuid",
                                "label": "CPUID"
                              },
                              {
                                "id": "pcie",
                                "label": "PCIe"
                              },
                              {
                                "id": "direta",
                                "label": "identificação direta"
                              },
                              {
                                "id": "indireta",
                                "label": "identificação indireta"
                              }
                            ]
                          },
                          "rightSet": {
                            "label": "Característica",
                            "items": [
                              {
                                "id": "cpu",
                                "label": "dados da CPU"
                              },
                              {
                                "id": "alta",
                                "label": "dispositivos de alta performance"
                              },
                              {
                                "id": "hard",
                                "label": "consulta direta ao hardware"
                              },
                              {
                                "id": "so",
                                "label": "consulta por camada intermediária"
                              }
                            ]
                          },
                          "relations": [
                            {
                              "from": "cpuid",
                              "to": "cpu"
                            },
                            {
                              "from": "pcie",
                              "to": "alta"
                            },
                            {
                              "from": "direta",
                              "to": "hard"
                            },
                            {
                              "from": "indireta",
                              "to": "so"
                            }
                          ],
                          "question": "Qual característica está associada a PCIe?",
                          "options": [
                            {
                              "id": "a",
                              "text": "dispositivos de alta performance"
                            },
                            {
                              "id": "b",
                              "text": "dados internos da CPU"
                            },
                            {
                              "id": "c",
                              "text": "consulta por camada intermediária"
                            },
                            {
                              "id": "d",
                              "text": "endereço da próxima instrução"
                            }
                          ],
                          "answer": "a",
                          "after": "PCIe se relaciona a dispositivos que precisam de alta largura de banda.",
                          "highlight": {
                            "leftItems": [
                              "pcie"
                            ],
                            "rightItems": [
                              "alta"
                            ],
                            "relations": [
                              [
                                "pcie",
                                "alta"
                              ]
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
                  "activeVersion": "version-001"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
`;

export function createOacoBasesCpuParalelismoCourse() {
  return JSON.parse(RAW_OACO_BASES_CPU_PARALELISMO_COURSE_JSON).courses[0];
}
