const RAW_FUNDAMENTOS_IA_ANALISE_DADOS_COURSE = Object.freeze(
{
  "id": "course-fundamentos-ia-analise-dados",
  "title": "Fundamentos de IA e Análise de Dados",
  "goal": "Estudo introdutório de Python aplicado à leitura de código, estruturas básicas, coleções e funções simples como base para análise de dados e IA.",
  "modules": [
    {
      "id": "module-aula-01-python-fundamentos",
      "title": "Aula 1 — Python essencial: variáveis, decisões e repetições",
      "guide": {
        "goal": "Fazer o aluno ler, completar e explicar pequenos scripts em Python usando saída, variáveis, comparação, condicionais, entrada de dados, conversões e repetições.",
        "include": [
          "papel de Python em dados e IA",
          "print()",
          "variáveis",
          "atribuição",
          "f-string",
          "operadores de comparação",
          "if",
          "else",
          "elif",
          "indentação",
          "input()",
          "int()",
          "float()",
          "str()",
          "while",
          "for",
          "range()",
          "listas simples como sequência",
          "combinação de repetição e condição",
          "erros comuns"
        ],
        "exclude": [
          "bibliotecas externas",
          "Pandas",
          "NumPy",
          "Matplotlib",
          "Scikit-learn",
          "programação orientada a objetos",
          "funções complexas",
          "arquivos",
          "exceções",
          "compreensão de listas",
          "regras industriais complexas"
        ],
        "notation": [
          "Usar lacunas no padrão [[resposta::resposta|distrator]].",
          "Usar crases para identificadores e operadores em textos renderizáveis.",
          "Preservar indentação em blocos de código."
        ],
        "avoid": [
          "Não transformar exemplos em sistemas de regras de negócio.",
          "Não antecipar bibliotecas de análise de dados ou IA."
        ]
      },
      "lessons": [
        {
          "id": "lesson-aula-01-python-sintaxe-controle",
          "title": "Sintaxe inicial, decisões e laços em Python",
          "guide": {
            "goal": "Conduzir o aluno da execução de instruções simples até a classificação de vários valores com laço e decisão.",
            "include": [
              "Python como linguagem",
              "saída com print()",
              "variáveis",
              "f-strings",
              "comparações",
              "booleanos",
              "if",
              "else",
              "elif",
              "input()",
              "conversões",
              "while",
              "for",
              "range()",
              "listas simples",
              "classificação com for + if"
            ],
            "exclude": [
              "bibliotecas externas",
              "arquivos",
              "exceções",
              "orientação a objetos",
              "funções avançadas"
            ],
            "notation": [
              "`if` pode ser entendido como “se”; `else` como “senão”; `elif` como “senão se”; `while` como “enquanto”; `for` como “para cada”."
            ],
            "avoid": [
              "Não usar exemplos longos de processo empresarial."
            ]
          },
          "topics": [
            {
              "id": "topic-python-como-linguagem",
              "label": "Python como linguagem",
              "kind": "concept",
              "checks": [
                "explica que Python executa instruções em ordem"
              ],
              "errors": [
                "achar que Python é apenas cálculo pronto"
              ]
            },
            {
              "id": "topic-saida-print",
              "label": "Saída com print()",
              "kind": "skill",
              "checks": [
                "usa `print()` para mostrar texto e variáveis"
              ],
              "errors": [
                "usar `input()` quando precisa mostrar valor"
              ]
            },
            {
              "id": "topic-variaveis-atribuicao",
              "label": "Variáveis e atribuição",
              "kind": "skill",
              "checks": [
                "usa `=` para guardar valor"
              ],
              "errors": [
                "confundir nome da variável com texto"
              ]
            },
            {
              "id": "topic-f-strings",
              "label": "f-strings",
              "kind": "skill",
              "checks": [
                "insere variável com `{}` em f-string"
              ],
              "errors": [
                "esquecer `f` antes da string"
              ]
            },
            {
              "id": "topic-comparacao-booleana",
              "label": "Comparação booleana",
              "kind": "concept",
              "checks": [
                "interpreta `True` e `False`"
              ],
              "errors": [
                "usar `=` em teste de igualdade"
              ]
            },
            {
              "id": "topic-if-indentacao",
              "label": "if e indentação",
              "kind": "skill",
              "checks": [
                "identifica bloco indentado"
              ],
              "errors": [
                "remover indentação depois de `:`"
              ]
            },
            {
              "id": "topic-else-elif",
              "label": "else, elif e ordem",
              "kind": "skill",
              "checks": [
                "ordena faixas corretamente"
              ],
              "errors": [
                "testar condição ampla antes da específica"
              ]
            },
            {
              "id": "topic-input-conversao",
              "label": "input() e conversão",
              "kind": "skill",
              "checks": [
                "converte texto para número antes de operar"
              ],
              "errors": [
                "somar texto como número"
              ]
            },
            {
              "id": "topic-while-contador",
              "label": "while com contador",
              "kind": "skill",
              "checks": [
                "atualiza contador para parar"
              ],
              "errors": [
                "criar laço sem atualização"
              ]
            },
            {
              "id": "topic-for-range",
              "label": "for e range()",
              "kind": "skill",
              "checks": [
                "prevê valores de `range()`"
              ],
              "errors": [
                "achar que `range(5)` inclui `5`"
              ]
            },
            {
              "id": "topic-for-lista",
              "label": "for em lista",
              "kind": "skill",
              "checks": [
                "percorre item por item"
              ],
              "errors": [
                "confundir item com lista inteira"
              ]
            },
            {
              "id": "topic-for-if-classificacao",
              "label": "for + if para classificação",
              "kind": "skill",
              "checks": [
                "classifica cada item da lista"
              ],
              "errors": [
                "colocar `if` fora do `for`"
              ]
            },
            {
              "id": "topic-erros-iniciais-python",
              "label": "Erros iniciais de sintaxe",
              "kind": "diagnostic",
              "checks": [
                "reconhece falta de `:`, indentação e conversão"
              ],
              "errors": [
                "tratar sintaxe como detalhe visual"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-a01-01-python-print-variaveis",
              "title": "Python como instrução executável: saída e variáveis",
              "goal": "Entender que programar é escrever instruções e usar `print()` e variáveis para guardar e mostrar valores.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [],
              "covers": [
                "Python",
                "programar",
                "print()",
                "variáveis",
                "tipos básicos observáveis",
                "="
              ],
              "checks": [
                "Distingue texto, inteiro e decimal.",
                "Explica que `=` guarda valor em uma variável."
              ],
              "errors": [
                "Pensar que variável é texto fixo.",
                "Confundir nome da variável com valor.",
                "Esquecer aspas em texto."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-01-python-print-variaveis-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Introduz Python, saída, variáveis, tipos observáveis e atribuição.",
                  "cards": [
                    {
                      "id": "card-a01-01-01",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Programa como sequência de instruções",
                      "text": "Python é uma linguagem usada para escrever instruções que o computador executa em ordem. Em dados e IA, essa base permite preparar valores, testar condições e repetir operações de forma controlada.",
                      "after": "`Python` não é apenas uma calculadora: ele executa comandos escritos pelo programador, linha por linha, respeitando a ordem e a sintaxe."
                    },
                    {
                      "id": "card-a01-01-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Primeira saída com print()",
                      "prompt": "Observe comandos simples de saída e armazenamento.",
                      "language": "python",
                      "code": "print(\"Olá, Python\")\nnome = \"Ana\"\nidade = 18\ntemperatura = 73.5\nprint(nome)\nprint(idade)\nprint(temperatura)",
                      "after": "`print()` mostra um valor na saída. Texto aparece entre aspas; números podem aparecer sem aspas."
                    },
                    {
                      "id": "card-a01-01-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o comando de saída",
                      "prompt": "Complete o comando que mostra uma mensagem.",
                      "language": "python",
                      "code": "[[print::print|input|int]](\"Máquina pronta\")",
                      "after": "`print()` é o comando de saída. `input()` lê dados digitados, e `int()` converte texto para inteiro."
                    },
                    {
                      "id": "card-a01-01-04",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Reconheça a atribuição",
                      "question": "Em `temperatura = 72.5`, o que acontece?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "O valor `temperatura` é mostrado na tela."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "O valor `72.5` é guardado no nome `temperatura`."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Python compara `temperatura` com `72.5`."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "O nome `72.5` passa a representar a palavra `temperatura`."
                        }
                      ],
                      "answer": "b",
                      "after": "O sinal `=` faz atribuição: o nome à esquerda passa a guardar o valor calculado à direita."
                    },
                    {
                      "id": "card-a01-01-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o nome da variável",
                      "prompt": "Complete a linha que cria uma variável para guardar a idade.",
                      "language": "python",
                      "code": "nome = \"Rafa\"\n[[idade::idade|18|\"idade\"]] = 18\nprint(nome, idade)",
                      "after": "A variável deve ter um nome sem aspas à esquerda do `=`. Com aspas, `\"idade\"` seria texto, não nome de variável."
                    },
                    {
                      "id": "card-a01-01-06",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Diferencie tipos observáveis",
                      "question": "Qual valor representa um número decimal em Python?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`\"73.5\"`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`73`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`73.5`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`\"temperatura\"`"
                        }
                      ],
                      "answer": "c",
                      "after": "`73.5` é número decimal porque não está entre aspas e usa ponto como separador decimal em Python."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-01-python-print-variaveis-20260617-040142"
            },
            {
              "id": "micro-a01-02-saida-formatada-fstring",
              "title": "Mostrar valores com frases usando print() e f-string",
              "goal": "Exibir textos combinados com variáveis usando vírgula no `print()` e f-string.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-01-python-print-variaveis"
              ],
              "covers": [
                "print(\"Nome:\", nome)",
                "f\"...\"",
                "{variavel}"
              ],
              "checks": [
                "Usa variável fora de aspas no `print()`.",
                "Reconhece `{}` dentro de f-string."
              ],
              "errors": [
                "Colocar variável como texto comum.",
                "Esquecer `f` antes da string.",
                "Usar `{}` fora de f-string."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-02-saida-formatada-fstring-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica saída formatada com vírgula e f-string.",
                  "cards": [
                    {
                      "id": "card-a01-02-01",
                      "position": 1,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Duas formas de mostrar variável com texto",
                      "prompt": "Compare o uso de vírgula no `print()` com o uso de f-string.",
                      "language": "python",
                      "code": "nome = \"Ana\"\ntemperatura = 78.4\n\nprint(\"Nome:\", nome)\nprint(f\"Temperatura: {temperatura}\")",
                      "after": "Na primeira forma, a variável fica fora das aspas. Na f-string, o valor aparece dentro de `{}` e o texto começa com `f`."
                    },
                    {
                      "id": "card-a01-02-02",
                      "position": 2,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Função das chaves na f-string",
                      "text": "Em uma f-string, expressões dentro de `{}` são [[avaliadas::avaliadas|ignoradas|mantidas como texto]] antes de a frase ser mostrada.",
                      "after": "As chaves indicam onde Python deve inserir o valor da variável ou expressão."
                    },
                    {
                      "id": "card-a01-02-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o prefixo da f-string",
                      "prompt": "Complete a frase para mostrar o valor da variável.",
                      "language": "python",
                      "code": "nome = \"Lia\"\nprint([[f::f|str|print]]\"Operadora: {nome}\")",
                      "after": "O prefixo `f` transforma a string em f-string. Sem ele, `{nome}` seria mostrado como texto comum."
                    },
                    {
                      "id": "card-a01-02-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Use variável fora das aspas",
                      "prompt": "Complete o `print()` para mostrar o valor guardado em `maquina`.",
                      "language": "python",
                      "code": "maquina = \"M1\"\nprint(\"Máquina:\", [[maquina::maquina|\"maquina\"|M1]])",
                      "after": "`maquina` sem aspas acessa a variável. `\"maquina\"` mostraria a palavra literal, não o valor `M1`."
                    },
                    {
                      "id": "card-a01-02-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a f-string correta",
                      "prompt": "Compare as três versões.",
                      "language": "python",
                      "code": "Escolha a versão que mostra o valor da variável.",
                      "question": "Qual alternativa usa f-string corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 81.5\nprint(f\"Temperatura: {temperatura}\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 81.5\nprint(\"Temperatura: {temperatura}\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 81.5\nprint(f\"Temperatura: temperatura\")"
                        }
                      ],
                      "answer": "a",
                      "after": "A alternativa correta combina `f` antes das aspas com `{temperatura}` dentro da frase."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-02-saida-formatada-fstring-20260617-040142"
            },
            {
              "id": "micro-a01-03-comparacao-booleanos",
              "title": "Comparar valores antes de decidir",
              "goal": "Usar operadores de comparação e entender que comparações produzem `True` ou `False`.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a01-02-saida-formatada-fstring"
              ],
              "covers": [
                ">",
                "<",
                "==",
                "!=",
                ">=",
                "<=",
                "True",
                "False",
                "`=` versus `==`"
              ],
              "checks": [
                "Escolhe operador correto para igualdade, diferença e limites.",
                "Prevê resultado booleano simples."
              ],
              "errors": [
                "Usar `=` no lugar de `==`.",
                "Inverter `>=` e `<=`.",
                "Ler `True` e `False` como texto."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-03-comparacao-booleanos-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Apresenta operadores de comparação, booleanos e distinção entre atribuição e igualdade.",
                  "cards": [
                    {
                      "id": "card-a01-03-01",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Operadores de comparação",
                      "columns": [
                        "Operador",
                        "Pergunta que responde",
                        "Exemplo",
                        "Resultado"
                      ],
                      "rows": [
                        [
                          ">",
                          "maior que?",
                          "85 > 80",
                          "True"
                        ],
                        [
                          "<",
                          "menor que?",
                          "70 < 80",
                          "True"
                        ],
                        [
                          "==",
                          "igual a?",
                          "80 == 80",
                          "True"
                        ],
                        [
                          "!=",
                          "diferente de?",
                          "82 != 80",
                          "True"
                        ],
                        [
                          ">=",
                          "maior ou igual?",
                          "80 >= 80",
                          "True"
                        ],
                        [
                          "<=",
                          "menor ou igual?",
                          "79 <= 80",
                          "True"
                        ]
                      ],
                      "after": "Comparações produzem valores booleanos: `True` quando o teste é verdadeiro e `False` quando o teste é falso."
                    },
                    {
                      "id": "card-a01-03-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Comparações produzem True ou False",
                      "prompt": "Observe o resultado de comparações simples.",
                      "language": "python",
                      "code": "temperatura = 85\n\nprint(temperatura > 80)\nprint(temperatura == 90)\nprint(temperatura != 90)",
                      "after": "`True` e `False` não são textos comuns: são valores booleanos usados para decidir caminhos no programa."
                    },
                    {
                      "id": "card-a01-03-03",
                      "position": 3,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Atribuição não é comparação",
                      "text": "Para guardar um valor em uma variável, use [[=::=|==|!=]]. Para testar igualdade, use `==`.",
                      "after": "`=` atribui valor; `==` pergunta se dois valores são iguais. Trocar os dois muda o sentido do código."
                    },
                    {
                      "id": "card-a01-03-04",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Preveja o resultado booleano",
                      "question": "Considere `temperatura = 72`. Qual é o resultado de `temperatura >= 80`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`True`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`False`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`72`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`80`"
                        }
                      ],
                      "answer": "b",
                      "after": "`72` não é maior nem igual a `80`, então a comparação resulta em `False`."
                    },
                    {
                      "id": "card-a01-03-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o teste de igualdade",
                      "prompt": "Complete o operador que testa se o status é igual a `ok`.",
                      "language": "python",
                      "code": "status = \"ok\"\nprint(status [[==::==|=|!=]] \"ok\")",
                      "after": "`==` compara igualdade. Usar `=` nessa posição tentaria atribuir valor, o que não é o teste desejado."
                    },
                    {
                      "id": "card-a01-03-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o limite mínimo",
                      "prompt": "Complete o operador para testar se a nota alcançou o mínimo.",
                      "language": "python",
                      "code": "nota = 7\nprint(nota [[>=::>=|<=|==]] 6)",
                      "after": "`>=` inclui o próprio limite. Nesse exemplo, `7 >= 6` resulta em `True`."
                    },
                    {
                      "id": "card-a01-03-07",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha o operador de diferença",
                      "question": "Qual operador testa se dois valores são diferentes?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`!=`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`==`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`=`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`>=`"
                        }
                      ],
                      "answer": "a",
                      "after": "`!=` significa diferente de. Ele é útil quando a decisão depende de detectar que dois valores não coincidem."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-03-comparacao-booleanos-20260617-040142"
            },
            {
              "id": "micro-a01-04-if-indentacao",
              "title": "Tomar decisão com if e bloco indentado",
              "goal": "Entender que `if` executa um bloco somente quando a condição é verdadeira.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-03-comparacao-booleanos"
              ],
              "covers": [
                "if",
                "condição",
                "dois pontos",
                "bloco indentado"
              ],
              "checks": [
                "Reconhece a linha do teste.",
                "Identifica a linha pertencente ao bloco."
              ],
              "errors": [
                "Esquecer `:`.",
                "Remover indentação.",
                "Achar que indentação é só estética."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-04-if-indentacao-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica `if`, condição, fluxo e indentação.",
                  "cards": [
                    {
                      "id": "card-a01-04-01",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fluxo de uma decisão simples",
                      "prompt": "Observe a estrutura de uma decisão com `if`.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Ler temperatura"
                          },
                          {
                            "kind": "if_then",
                            "condition": "temperatura >= 80?",
                            "thenBranch": [
                              {
                                "kind": "output",
                                "text": "Mostrar Atenção"
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Encerrar verificação"
                          }
                        ]
                      },
                      "after": "`if` pode ser entendido como “se”: se o teste for verdadeiro, o bloco associado é executado."
                    },
                    {
                      "id": "card-a01-04-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Bloco indentado do if",
                      "prompt": "Observe a linha de teste e o bloco que depende dela.",
                      "language": "python",
                      "code": "temperatura = 82\n\nif temperatura >= 80:\n    print(\"Atenção\")\n\nprint(\"Verificação finalizada\")",
                      "after": "A linha indentada pertence ao bloco do `if`. A última linha não está indentada, então executa depois da decisão."
                    },
                    {
                      "id": "card-a01-04-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a palavra da decisão",
                      "prompt": "Complete a estrutura condicional.",
                      "language": "python",
                      "code": "temperatura = 91\n[[if::if|for|else]] temperatura >= 90:\n    print(\"Alerta crítico\")",
                      "after": "`if` abre a decisão. `for` abre repetição, e `else` só aparece como caso contrário de uma decisão anterior."
                    },
                    {
                      "id": "card-a01-04-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Compare a indentação",
                      "prompt": "Escolha a versão em que o bloco pertence ao `if`.",
                      "language": "python",
                      "code": "Escolha a versão com indentação correta.",
                      "question": "Qual alternativa preserva a linha que só executa quando a condição é verdadeira?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 82\nif temperatura >= 80:\n    print(\"Atenção\")"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "A linha `print(\"Atenção\")` ficaria fora do bloco do `if` por falta de indentação."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "A chamada `print(\"Atenção\")` continuaria fora do bloco do `if`, então a decisão não ficaria estruturada corretamente."
                        }
                      ],
                      "answer": "a",
                      "after": "Python usa indentação para delimitar blocos. Sem recuo depois de `:`, a estrutura da decisão fica incorreta."
                    },
                    {
                      "id": "card-a01-04-05",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Nome do trecho dependente",
                      "text": "A linha indentada depois de `if` pertence ao [[bloco::bloco|nome|valor]] que depende da condição.",
                      "after": "O bloco é o conjunto de comandos controlados pela condição. A indentação não é decoração; ela define a estrutura."
                    },
                    {
                      "id": "card-a01-04-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identifique o comando condicional",
                      "prompt": "Analise o trecho.",
                      "language": "python",
                      "code": "temperatura = 82\nif temperatura >= 80:\n    print(\"Atenção\")\nprint(\"Fim\")",
                      "question": "Qual linha só executa quando `temperatura >= 80` é verdadeira?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "print(\"Atenção\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "print(\"Fim\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 82"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "if temperatura >= 80:"
                        }
                      ],
                      "answer": "a",
                      "after": "Apenas `print(\"Atenção\")` está dentro do bloco indentado do `if`."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-04-if-indentacao-20260617-040142"
            },
            {
              "id": "micro-a01-05-else-elif-ordem",
              "title": "Decidir entre duas ou mais possibilidades",
              "goal": "Usar `else` e `elif` para tratar caso contrário e múltiplas faixas de valor.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-04-if-indentacao"
              ],
              "covers": [
                "else",
                "elif",
                "ordem dos testes",
                "classificação de nota",
                "classificação de temperatura"
              ],
              "checks": [
                "Explica por que a ordem das condições altera a classificação.",
                "Prevê saída de cadeia `if/elif/else`."
              ],
              "errors": [
                "Colocar `else` antes de `elif`.",
                "Repetir condição.",
                "Usar faixas fora de ordem."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-05-else-elif-ordem-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica decisões com dois ou mais caminhos e ordem de faixas.",
                  "cards": [
                    {
                      "id": "card-a01-05-01",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Decisão com caso contrário",
                      "prompt": "Observe uma decisão com dois caminhos.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Ler nota"
                          },
                          {
                            "kind": "if_then_else",
                            "condition": "nota >= 7?",
                            "thenBranch": [
                              {
                                "kind": "output",
                                "text": "Aprovado"
                              }
                            ],
                            "elseBranch": [
                              {
                                "kind": "output",
                                "text": "Revisar conteúdo"
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Encerrar"
                          }
                        ]
                      },
                      "after": "`else` pode ser entendido como “senão”: ele trata o caminho quando o teste do `if` é falso."
                    },
                    {
                      "id": "card-a01-05-02",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Cadeia com várias faixas",
                      "prompt": "Observe uma classificação em três faixas.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Ler temperatura"
                          },
                          {
                            "kind": "if_chain",
                            "branches": [
                              {
                                "condition": "temperatura >= 90?",
                                "items": [
                                  {
                                    "kind": "output",
                                    "text": "Alerta crítico"
                                  }
                                ]
                              },
                              {
                                "condition": "temperatura >= 80?",
                                "items": [
                                  {
                                    "kind": "output",
                                    "text": "Atenção"
                                  }
                                ]
                              }
                            ],
                            "elseBranch": [
                              {
                                "kind": "output",
                                "text": "Normal"
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Encerrar"
                          }
                        ]
                      },
                      "after": "`elif` pode ser entendido como “senão se”: ele testa outra condição quando as anteriores não foram aceitas."
                    },
                    {
                      "id": "card-a01-05-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Exemplo de if, elif e else",
                      "prompt": "Observe a ordem dos testes para classificar uma nota.",
                      "language": "python",
                      "code": "nota = 7\n\nif nota >= 7:\n    print(\"Aprovado\")\nelif nota >= 5:\n    print(\"Recuperação\")\nelse:\n    print(\"Revisar conteúdo\")",
                      "after": "Python testa de cima para baixo e executa o primeiro bloco verdadeiro; depois sai da cadeia."
                    },
                    {
                      "id": "card-a01-05-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o senão se",
                      "prompt": "Complete a palavra que testa uma segunda condição.",
                      "language": "python",
                      "code": "temperatura = 86\n\nif temperatura >= 90:\n    print(\"Alerta crítico\")\n[[elif::elif|else|if]] temperatura >= 80:\n    print(\"Atenção\")\nelse:\n    print(\"Normal\")",
                      "after": "`elif` adiciona um novo teste dentro da mesma cadeia de decisão."
                    },
                    {
                      "id": "card-a01-05-05",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Preveja a classificação",
                      "question": "Considere `nota = 6` no código com `if nota >= 7`, `elif nota >= 5` e `else`. O que será mostrado?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`Aprovado`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`Recuperação`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`Revisar conteúdo`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`True`"
                        }
                      ],
                      "answer": "b",
                      "after": "`6 >= 7` é falso, mas `6 >= 5` é verdadeiro. Por isso, o bloco do `elif` executa."
                    },
                    {
                      "id": "card-a01-05-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a ordem correta das faixas",
                      "prompt": "Classifique temperatura em `alerta crítico`, `atenção` ou `normal`.",
                      "language": "python",
                      "code": "Escolha o script que não esconde a faixa mais alta.",
                      "question": "Qual versão classifica `92` como `alerta crítico`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 92\nif temperatura >= 90:\n    print(\"Alerta crítico\")\nelif temperatura >= 80:\n    print(\"Atenção\")\nelse:\n    print(\"Normal\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 92\nif temperatura >= 80:\n    print(\"Atenção\")\nelif temperatura >= 90:\n    print(\"Alerta crítico\")\nelse:\n    print(\"Normal\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 92\nif temperatura >= 90:\n    print(\"Alerta crítico\")\nelse:\n    print(\"Normal\")\nelif temperatura >= 80:\n    print(\"Atenção\")"
                        }
                      ],
                      "answer": "a",
                      "after": "A faixa mais restritiva deve vir antes. Se `temperatura >= 80` vier primeiro, `92` entra ali e não chega ao teste `>= 90`."
                    },
                    {
                      "id": "card-a01-05-07",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Sentido da ordem dos testes",
                      "text": "Em uma cadeia `if/elif/else`, Python executa o [[primeiro::primeiro|último|todos]] bloco cuja condição for verdadeira.",
                      "after": "A ordem altera o resultado quando uma condição mais ampla aparece antes de uma condição mais específica."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-05-else-elif-ordem-20260617-040142"
            },
            {
              "id": "micro-a01-06-input-conversao",
              "title": "Ler dados digitados e converter para número",
              "goal": "Entender que `input()` lê texto e que cálculos e comparações numéricas exigem conversão.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a01-05-else-elif-ordem"
              ],
              "covers": [
                "input()",
                "int()",
                "float()",
                "str()",
                "conversão antes de soma",
                "conversão antes de comparação"
              ],
              "checks": [
                "Escolhe `int()` ou `float()` conforme o dado.",
                "Identifica erro de usar texto como número."
              ],
              "errors": [
                "Somar texto como se fosse número.",
                "Comparar string numérica.",
                "Esquecer parênteses."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-06-input-conversao-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Apresenta entrada de dados e conversões básicas antes de operar numericamente.",
                  "cards": [
                    {
                      "id": "card-a01-06-01",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Conversões básicas de entrada",
                      "columns": [
                        "Função",
                        "Uso básico",
                        "Quando usar"
                      ],
                      "rows": [
                        [
                          "int()",
                          "int(\"18\")",
                          "número inteiro"
                        ],
                        [
                          "float()",
                          "float(\"78.5\")",
                          "número decimal"
                        ],
                        [
                          "str()",
                          "str(18)",
                          "texto"
                        ]
                      ],
                      "after": "`input()` sempre lê texto. Para comparar ou somar como número, converta antes com `int()` ou `float()`."
                    },
                    {
                      "id": "card-a01-06-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Entrada convertida antes da comparação",
                      "prompt": "Observe a leitura de idade como texto e a conversão para inteiro.",
                      "language": "python",
                      "code": "idade_texto = input(\"Idade: \")\nidade = int(idade_texto)\n\nif idade >= 18:\n    print(\"Maior de idade\")",
                      "after": "`input()` devolve texto. A variável `idade` só vira número inteiro depois de passar por `int()`."
                    },
                    {
                      "id": "card-a01-06-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a conversão para inteiro",
                      "prompt": "Complete o trecho para ler uma idade e somar `1`.",
                      "language": "python",
                      "code": "idade = [[int::int|float|str]](input(\"Idade: \"))\nprint(idade + 1)",
                      "after": "`int(input(...))` lê texto e converte para inteiro. Sem conversão, `idade + 1` não seria soma numérica correta."
                    },
                    {
                      "id": "card-a01-06-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a conversão para decimal",
                      "prompt": "Complete o trecho para ler temperatura com casas decimais.",
                      "language": "python",
                      "code": "temperatura = [[float::float|int|str]](input(\"Temperatura: \"))\nprint(temperatura >= 80.0)",
                      "after": "`float()` aceita valores decimais como `78.5`. Usar `int()` descartaria a parte decimal em muitos casos de entrada."
                    },
                    {
                      "id": "card-a01-06-05",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identifique o erro provável",
                      "question": "Analise o trecho: `valor = input(\"Valor: \")` seguido de `print(valor + 10)`. Qual é o problema central?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "A leitura gera texto, então o valor precisa ser convertido para número antes da soma."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "O comando de saída só aceita texto entre aspas."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`10` deveria estar antes de `valor`."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "A leitura de dados só funciona dentro de uma decisão."
                        }
                      ],
                      "answer": "a",
                      "after": "`input()` entrega texto. Para soma numérica, use `int()` ou `float()` conforme o tipo de valor esperado."
                    },
                    {
                      "id": "card-a01-06-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a leitura numérica correta",
                      "prompt": "Compare as versões para ler temperatura decimal e decidir se exige atenção.",
                      "language": "python",
                      "code": "Escolha o trecho que compara número com número.",
                      "question": "Qual alternativa evita comparar texto com número?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = float(input(\"Temperatura: \"))\nif temperatura >= 80:\n    print(\"Atenção\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = input(\"Temperatura: \")\nif temperatura >= 80:\n    print(\"Atenção\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = str(input(\"Temperatura: \"))\nif temperatura >= 80:\n    print(\"Atenção\")"
                        }
                      ],
                      "answer": "a",
                      "after": "`float(input(...))` converte o valor digitado para número decimal antes da comparação.",
                      "afterBlocks": [
                        {
                          "kind": "heading",
                          "value": "Trecho corrigido"
                        },
                        {
                          "kind": "code",
                          "prompt": "Veja a versão que converte a entrada para número decimal antes da comparação.",
                          "language": "python",
                          "code": "temperatura = float(input(\"Temperatura: \"))\nif temperatura >= 80:\n    print(\"Atenção\")"
                        }
                      ]
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                },
                {
                  "id": "version-micro-a01-06-input-conversao-repair01-20260617-073227",
                  "createdAt": "2026-06-17T07:32:27.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Reparo mínimo solicitado a partir da auditoria fundamentos-ia-analise-dados__parte01__auditoria__v20260617-073227.md.",
                  "summary": "Corrige imprecisão sobre `int()` com entrada decimal e remove formulações vetadas em cards ativos da microssequência de `input()` e conversão.",
                  "cards": [
                    {
                      "id": "card-a01-06-01",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Conversões básicas de entrada",
                      "columns": [
                        "Função",
                        "Uso básico",
                        "Quando usar"
                      ],
                      "rows": [
                        [
                          "int()",
                          "int(\"18\")",
                          "número inteiro"
                        ],
                        [
                          "float()",
                          "float(\"78.5\")",
                          "número decimal"
                        ],
                        [
                          "str()",
                          "str(18)",
                          "texto"
                        ]
                      ],
                      "after": "`input()` sempre lê texto. Para comparar ou somar como número, converta antes com `int()` ou `float()`."
                    },
                    {
                      "id": "card-a01-06-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Entrada convertida antes da comparação",
                      "prompt": "Observe a entrada de idade como texto e a conversão para inteiro.",
                      "language": "python",
                      "code": "idade_texto = input(\"Idade: \")\nidade = int(idade_texto)\n\nif idade >= 18:\n    print(\"Maior de idade\")",
                      "after": "`input()` devolve texto. A variável `idade` só vira número inteiro depois de passar por `int()`."
                    },
                    {
                      "id": "card-a01-06-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a conversão para inteiro",
                      "prompt": "Complete o trecho para ler uma idade e somar `1`.",
                      "language": "python",
                      "code": "idade = [[int::int|float|str]](input(\"Idade: \"))\nprint(idade + 1)",
                      "after": "`int(input(...))` lê texto e converte para inteiro. Sem conversão, `idade + 1` não seria soma numérica correta."
                    },
                    {
                      "id": "card-a01-06-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a conversão para decimal",
                      "prompt": "Complete o trecho para ler temperatura com casas decimais.",
                      "language": "python",
                      "code": "temperatura = [[float::float|int|str]](input(\"Temperatura: \"))\nprint(temperatura >= 80.0)",
                      "after": "`float()` aceita valores decimais como `78.5`. Em entradas desse tipo, `int()` não é adequado: para texto como `\"78.5\"`, a conversão para inteiro falha; por isso, use `float()` quando o dado pode ter casas decimais."
                    },
                    {
                      "id": "card-a01-06-05",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identifique o erro provável",
                      "question": "Analise o trecho: `valor = input(\"Valor: \")` seguido de `print(valor + 10)`. Qual é o problema central?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "O valor vindo de `input()` é texto, então precisa ser convertido para número antes da soma."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "O comando de saída só aceita texto entre aspas."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`10` deveria estar antes de `valor`."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`input()` só funciona dentro de uma decisão."
                        }
                      ],
                      "answer": "a",
                      "after": "`input()` entrega texto. Para soma numérica, use `int()` ou `float()` conforme o tipo de valor esperado."
                    },
                    {
                      "id": "card-a01-06-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a entrada numérica correta",
                      "prompt": "Compare as versões para ler temperatura decimal e decidir se exige atenção.",
                      "language": "python",
                      "code": "Escolha o trecho que compara número com número.",
                      "question": "Qual alternativa evita comparar texto com número?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = float(input(\"Temperatura: \"))\nif temperatura >= 80:\n    print(\"Atenção\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = input(\"Temperatura: \")\nif temperatura >= 80:\n    print(\"Atenção\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = str(input(\"Temperatura: \"))\nif temperatura >= 80:\n    print(\"Atenção\")"
                        }
                      ],
                      "answer": "a",
                      "after": "`float(input(...))` converte o valor digitado para número decimal antes da comparação.",
                      "afterBlocks": [
                        {
                          "kind": "heading",
                          "value": "Trecho corrigido"
                        },
                        {
                          "kind": "code",
                          "prompt": "Veja a versão que converte a entrada para número decimal antes da comparação.",
                          "language": "python",
                          "code": "temperatura = float(input(\"Temperatura: \"))\nif temperatura >= 80:\n    print(\"Atenção\")"
                        }
                      ]
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-06-input-conversao-repair01-20260617-073227"
            },
            {
              "id": "micro-a01-07-while-contador",
              "title": "Repetir enquanto uma condição for verdadeira",
              "goal": "Usar `while` com variável de controle e atualização para evitar laço infinito.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-06-input-conversao"
              ],
              "covers": [
                "while",
                "contador",
                "condição de parada",
                "incremento"
              ],
              "checks": [
                "Identifica início, teste e atualização do contador.",
                "Reconhece risco de laço infinito."
              ],
              "errors": [
                "Esquecer incremento.",
                "Usar condição que nunca fica falsa.",
                "Confundir contador com item de lista."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-07-while-contador-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica `while`, contador, atualização e condição de parada.",
                  "cards": [
                    {
                      "id": "card-a01-07-01",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fluxo do while com contador",
                      "prompt": "Observe a repetição controlada por uma condição.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "contador recebe 1"
                          },
                          {
                            "kind": "while",
                            "condition": "contador <= 3?",
                            "body": [
                              {
                                "kind": "output",
                                "text": "Mostrar contador"
                              },
                              {
                                "kind": "process",
                                "text": "Somar 1 ao contador"
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Condição ficou falsa"
                          }
                        ]
                      },
                      "after": "`while` pode ser entendido como “enquanto”: repete o bloco enquanto a condição continuar verdadeira."
                    },
                    {
                      "id": "card-a01-07-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Contador com atualização",
                      "prompt": "Observe início, teste e atualização do contador.",
                      "language": "python",
                      "code": "contador = 1\n\nwhile contador <= 3:\n    print(contador)\n    contador = contador + 1",
                      "after": "A atualização `contador = contador + 1` faz a condição se aproximar do fim. Sem ela, o laço pode não parar."
                    },
                    {
                      "id": "card-a01-07-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a atualização do contador",
                      "prompt": "Complete o operador que aumenta o contador.",
                      "language": "python",
                      "code": "contador = 1\nwhile contador <= 5:\n    print(contador)\n    contador = contador [[+::+|-|==]] 1",
                      "after": "Somar `1` ao contador evita repetir sempre com o mesmo valor."
                    },
                    {
                      "id": "card-a01-07-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a repetição enquanto",
                      "prompt": "Complete a palavra que abre a repetição controlada por condição.",
                      "language": "python",
                      "code": "quantidade = 0\n[[while::while|for|if]] quantidade < 3:\n    print(\"Registrar peça\")\n    quantidade = quantidade + 1",
                      "after": "`while` repete enquanto `quantidade < 3` for verdadeiro. `if` decidiria uma vez; `for` percorreria uma sequência."
                    },
                    {
                      "id": "card-a01-07-05",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Reconheça o risco de laço infinito",
                      "question": "No trecho `contador = 1` e `while contador <= 3: print(contador)`, qual é o risco?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "O contador não é atualizado, então a condição pode continuar verdadeira sem parar."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Mostrar o valor na saída aumenta o contador automaticamente."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`while` só executa uma vez."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`contador <= 3` nunca pode ser verdadeiro."
                        }
                      ],
                      "answer": "a",
                      "after": "Um `while` precisa de alguma mudança que torne a condição falsa em algum momento."
                    },
                    {
                      "id": "card-a01-07-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Compare laços com e sem parada",
                      "prompt": "Escolha o laço que mostra `1`, `2`, `3` e termina.",
                      "language": "python",
                      "code": "Compare as versões completas.",
                      "question": "Qual alternativa controla a repetição corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "contador = 1\nwhile contador <= 3:\n    print(contador)\n    contador = contador + 1"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "contador = 1\nwhile contador <= 3:\n    print(contador)"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "A versão deixaria `print(contador)` e a atualização sem indentação dentro do `while`, então o laço não ficaria organizado corretamente."
                        }
                      ],
                      "answer": "a",
                      "after": "A versão correta mantém `print()` e atualização dentro do bloco indentado do `while`."
                    },
                    {
                      "id": "card-a01-07-07",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Condição de permanência",
                      "text": "`while` repete enquanto a condição for [[verdadeira::verdadeira|falsa|texto]].",
                      "after": "Quando a condição fica falsa, Python sai do laço e continua o programa depois do bloco."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-07-while-contador-20260617-040142"
            },
            {
              "id": "micro-a01-08-for-range-lista",
              "title": "Percorrer sequências com for e range()",
              "goal": "Usar `for` para repetir ações por quantidade definida e para percorrer lista simples.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-07-while-contador"
              ],
              "covers": [
                "for",
                "in",
                "range(5)",
                "range(1, 6)",
                "lista simples"
              ],
              "checks": [
                "Prevê valores gerados por `range()`.",
                "Reconhece variável temporária do laço."
              ],
              "errors": [
                "Achar que `range(5)` inclui `5`.",
                "Confundir elemento da lista com índice.",
                "Remover indentação."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-08-for-range-lista-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica `for`, `range()` e percurso de listas simples.",
                  "cards": [
                    {
                      "id": "card-a01-08-01",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Valores gerados por range()",
                      "columns": [
                        "Expressão",
                        "Valores percorridos",
                        "Observação"
                      ],
                      "rows": [
                        [
                          "range(5)",
                          "0, 1, 2, 3, 4",
                          "começa em 0 e não inclui 5"
                        ],
                        [
                          "range(1, 6)",
                          "1, 2, 3, 4, 5",
                          "começa em 1 e não inclui 6"
                        ]
                      ],
                      "after": "`range()` descreve uma sequência de números para o `for` percorrer."
                    },
                    {
                      "id": "card-a01-08-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Repetição por quantidade definida",
                      "prompt": "Observe dois usos comuns de `range()`.",
                      "language": "python",
                      "code": "for numero in range(5):\n    print(numero)\n\nfor numero in range(1, 6):\n    print(numero)",
                      "after": "A variável `numero` recebe um valor da sequência a cada repetição."
                    },
                    {
                      "id": "card-a01-08-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o operador de percurso",
                      "prompt": "Complete a palavra usada para percorrer a sequência.",
                      "language": "python",
                      "code": "for numero [[in::in|of|=]] range(1, 6):\n    print(numero)",
                      "after": "`in` indica que `numero` vai assumir cada valor produzido por `range(1, 6)`."
                    },
                    {
                      "id": "card-a01-08-04",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Preveja a sequência",
                      "question": "Quais valores são percorridos por `range(5)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`1, 2, 3, 4, 5`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`0, 1, 2, 3, 4`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`0, 1, 2, 3, 4, 5`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`5`"
                        }
                      ],
                      "answer": "b",
                      "after": "`range(5)` começa em `0` e para antes de `5`."
                    },
                    {
                      "id": "card-a01-08-05",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Sentido do for",
                      "text": "`for` pode ser entendido como “para cada”: executa o bloco para cada item de uma [[sequência::sequência|condição|atribuição]].",
                      "after": "A sequência pode vir de `range()` ou de uma lista, entre outras formas simples."
                    },
                    {
                      "id": "card-a01-08-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Percorrer uma lista simples",
                      "prompt": "Observe o `for` passando por cada temperatura da lista.",
                      "language": "python",
                      "code": "temperaturas = [72, 84, 79]\n\nfor temperatura in temperaturas:\n    print(temperatura)",
                      "after": "A cada volta, `temperatura` recebe um item da lista `temperaturas`."
                    },
                    {
                      "id": "card-a01-08-07",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identifique a variável temporária",
                      "question": "No trecho `for temperatura in temperaturas:`, qual é o papel de `temperatura`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Guardar o item atual da lista a cada repetição."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Guardar a lista inteira sem mudar."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Indicar o último índice da lista."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Converter a lista para número."
                        }
                      ],
                      "answer": "a",
                      "after": "`temperatura` é a variável temporária do laço; ela muda de valor conforme o `for` percorre a lista."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-08-for-range-lista-20260617-040142"
            },
            {
              "id": "micro-a01-09-for-if-classificacao",
              "title": "Classificar vários valores com repetição e condição",
              "goal": "Percorrer uma lista de valores e classificar cada item com `if/elif/else`.",
              "role": "review",
              "status": "generated",
              "dependsOn": [
                "micro-a01-08-for-range-lista"
              ],
              "covers": [
                "lista de temperaturas",
                "for",
                "if/elif/else",
                "f-string",
                "mini script de evidência"
              ],
              "checks": [
                "Completa script que classifica temperaturas como normal, atenção ou alerta crítico."
              ],
              "errors": [
                "Testar só o primeiro valor.",
                "Colocar `if` fora do `for`.",
                "Ordenar faixas incorretamente."
              ],
              "versions": [
                {
                  "id": "version-micro-a01-09-for-if-classificacao-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Consolida a aula 1 combinando lista, laço, decisão e saída formatada.",
                  "cards": [
                    {
                      "id": "card-a01-09-01",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Percurso com decisão em cada item",
                      "prompt": "Observe o padrão: lista, `for` e classificação.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Criar lista de temperaturas"
                          },
                          {
                            "kind": "for",
                            "item": "temperatura",
                            "collection": "temperaturas",
                            "body": [
                              {
                                "kind": "if_chain",
                                "branches": [
                                  {
                                    "condition": "temperatura >= 90?",
                                    "items": [
                                      {
                                        "kind": "output",
                                        "text": "Alerta crítico"
                                      }
                                    ]
                                  },
                                  {
                                    "condition": "temperatura >= 80?",
                                    "items": [
                                      {
                                        "kind": "output",
                                        "text": "Atenção"
                                      }
                                    ]
                                  }
                                ],
                                "elseBranch": [
                                  {
                                    "kind": "output",
                                    "text": "Normal"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Todos os valores foram classificados"
                          }
                        ]
                      },
                      "after": "A decisão precisa ficar dentro do `for` para que cada valor da lista seja classificado."
                    },
                    {
                      "id": "card-a01-09-02",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Faixas de temperatura",
                      "columns": [
                        "Condição",
                        "Classificação"
                      ],
                      "rows": [
                        [
                          "temperatura >= 90",
                          "alerta crítico"
                        ],
                        [
                          "temperatura >= 80",
                          "atenção"
                        ],
                        [
                          "caso contrário",
                          "normal"
                        ]
                      ],
                      "after": "A faixa `>= 90` deve ser testada antes de `>= 80`, porque todo valor crítico também é maior ou igual a `80`."
                    },
                    {
                      "id": "card-a01-09-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Classificação de várias temperaturas",
                      "prompt": "Observe um script que classifica cada item da lista.",
                      "language": "python",
                      "code": "temperaturas = [72, 84, 91]\n\nfor temperatura in temperaturas:\n    if temperatura >= 90:\n        print(f\"{temperatura}: alerta crítico\")\n    elif temperatura >= 80:\n        print(f\"{temperatura}: atenção\")\n    else:\n        print(f\"{temperatura}: normal\")",
                      "after": "O `for` escolhe um valor por vez; o `if/elif/else` decide a classificação daquele valor."
                    },
                    {
                      "id": "card-a01-09-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a condição crítica",
                      "prompt": "Complete o operador para identificar alerta crítico.",
                      "language": "python",
                      "code": "temperaturas = [72, 84, 91]\nfor temperatura in temperaturas:\n    if temperatura [[>=::>=|<=|==]] 90:\n        print(\"alerta crítico\")",
                      "after": "`>= 90` inclui `90` e qualquer valor maior, formando a faixa crítica definida."
                    },
                    {
                      "id": "card-a01-09-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o item do laço",
                      "prompt": "Complete a variável temporária que recebe cada item da lista.",
                      "language": "python",
                      "code": "temperaturas = [75, 82, 94]\nfor [[temperatura::temperatura|temperaturas|range]] in temperaturas:\n    print(temperatura)",
                      "after": "A variável temporária deve representar um item de cada vez. A lista completa permanece em `temperaturas`."
                    },
                    {
                      "id": "card-a01-09-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Encontre a decisão fora do laço",
                      "prompt": "Analise o trecho.",
                      "language": "python",
                      "code": "temperaturas = [75, 82, 94]\nfor temperatura in temperaturas:\n    print(temperatura)\nif temperatura >= 90:\n    print(\"alerta crítico\")",
                      "question": "Qual é o problema principal?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "A decisão ficou fora do `for`, então não classifica cada item no momento do percurso."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "A lista não pode guardar números inteiros."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Mostrar o valor na saída não pode aparecer dentro de um laço."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`temperatura >= 90` deveria usar `=`."
                        }
                      ],
                      "answer": "a",
                      "after": "Para classificar todos os valores, o bloco `if/elif/else` precisa estar indentado dentro do `for`."
                    },
                    {
                      "id": "card-a01-09-07",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha o mini script correto",
                      "prompt": "Compare os scripts completos.",
                      "language": "python",
                      "code": "Escolha a versão que classifica cada temperatura em uma das três faixas.",
                      "question": "Qual alternativa mantém o `if/elif/else` dentro do `for` e testa a faixa crítica primeiro?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = [75, 82, 94]\nfor temperatura in temperaturas:\n    if temperatura >= 90:\n        print(f\"{temperatura}: alerta crítico\")\n    elif temperatura >= 80:\n        print(f\"{temperatura}: atenção\")\n    else:\n        print(f\"{temperatura}: normal\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = [75, 82, 94]\nfor temperatura in temperaturas:\n    if temperatura >= 80:\n        print(f\"{temperatura}: atenção\")\n    elif temperatura >= 90:\n        print(f\"{temperatura}: alerta crítico\")\n    else:\n        print(f\"{temperatura}: normal\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = [75, 82, 94]\nfor temperatura in temperaturas:\n    print(temperatura)\nif temperatura >= 90:\n    print(\"alerta crítico\")"
                        }
                      ],
                      "answer": "a",
                      "after": "A alternativa correta percorre todos os valores e usa a ordem adequada das faixas."
                    },
                    {
                      "id": "card-a01-09-08",
                      "position": 8,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Padrão consolidado da aula 1",
                      "text": "Um script inicial de análise costuma guardar valores, percorrer uma sequência e tomar decisões locais para cada item.",
                      "after": "Esse padrão combina `lista`, `for`, `if/elif/else` e f-string de forma suficiente para ler e completar pequenos scripts de classificação."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a01-09-for-if-classificacao-20260617-040142"
            }
          ]
        }
      ]
    },
    {
      "id": "module-aula-02-estruturas-dados-python",
      "title": "Aula 2 — Estruturas de dados e funções básicas em Python",
      "guide": {
        "goal": "Ensinar o aluno a organizar coleções de dados em listas, tuplas, dicionários e conjuntos, e a criar funções simples para reutilizar análises.",
        "include": [
          "lista",
          "índice",
          "primeiro e último item",
          "alteração de lista",
          "append()",
          "remoção simples",
          "percurso com for",
          "tupla",
          "dicionário",
          "chave e valor",
          "alteração e adição de campo",
          "percurso com .items()",
          "conjunto com set()",
          "eliminação de repetidos",
          "função com def",
          "parâmetro",
          "função que recebe coleção",
          "análise simples com for + if"
        ],
        "exclude": [
          "NumPy",
          "Pandas",
          "classes",
          "funções lambda",
          "compreensão de listas/dicionários",
          "métodos avançados",
          "mutabilidade em profundidade",
          "escopo avançado",
          "argumentos opcionais",
          "retorno complexo",
          "algoritmos de ordenação"
        ],
        "notation": [
          "Usar lacunas no ponto exato do código quando a resposta depender de sintaxe.",
          "Usar alternativas de código estruturadas em comparações de scripts."
        ],
        "avoid": [
          "Não introduzir métodos avançados.",
          "Não substituir a lógica básica por recursos prontos de alto nível."
        ]
      },
      "lessons": [
        {
          "id": "lesson-aula-02-colecoes-funcoes",
          "title": "Coleções e funções para preparar análise de dados",
          "guide": {
            "goal": "Conduzir o aluno de coleções simples até funções que recebem lista e aplicam uma análise local.",
            "include": [
              "listas",
              "índices",
              "append()",
              "remove()",
              "tuplas",
              "dicionários",
              "chaves e valores",
              ".items()",
              "set()",
              "for + if em coleção",
              "def",
              "parâmetros",
              "função com coleção"
            ],
            "exclude": [
              "métodos avançados",
              "classes",
              "lambda",
              "retorno complexo",
              "algoritmos de ordenação"
            ],
            "notation": [
              "Distinguir coleção inteira, item atual, chave e valor com nomes consistentes."
            ],
            "avoid": [
              "Não criar análise extensa de processo produtivo."
            ]
          },
          "topics": [
            {
              "id": "topic-lista-operacoes",
              "label": "Operações em lista",
              "kind": "skill",
              "checks": [
                "cria, altera, adiciona e remove item"
              ],
              "errors": [
                "confundir alteração com adição"
              ]
            },
            {
              "id": "topic-indice-lista",
              "label": "Índice de lista",
              "kind": "concept",
              "checks": [
                "acessa primeiro e último item"
              ],
              "errors": [
                "começar índice em `1`"
              ]
            },
            {
              "id": "topic-metodos-lista",
              "label": "Métodos básicos de lista",
              "kind": "skill",
              "checks": [
                "usa `append()` e `remove()`"
              ],
              "errors": [
                "chamar método sem parênteses"
              ]
            },
            {
              "id": "topic-for-em-lista",
              "label": "for em lista",
              "kind": "skill",
              "checks": [
                "percorre item por item"
              ],
              "errors": [
                "comparar lista inteira com número"
              ]
            },
            {
              "id": "topic-tupla",
              "label": "Tupla",
              "kind": "concept",
              "checks": [
                "usa tupla para valores estáveis"
              ],
              "errors": [
                "tentar alterar tupla como lista"
              ]
            },
            {
              "id": "topic-dicionario-chave-valor",
              "label": "Dicionário chave-valor",
              "kind": "skill",
              "checks": [
                "acessa valor por chave"
              ],
              "errors": [
                "usar índice numérico em dicionário"
              ]
            },
            {
              "id": "topic-set-conjunto",
              "label": "Conjunto com set()",
              "kind": "concept",
              "checks": [
                "identifica valores únicos"
              ],
              "errors": [
                "esperar ordem fixa"
              ]
            },
            {
              "id": "topic-for-if-colecao",
              "label": "for + if em coleção",
              "kind": "skill",
              "checks": [
                "classifica cada item da lista"
              ],
              "errors": [
                "posicionar `if` fora do laço"
              ]
            },
            {
              "id": "topic-funcao-def",
              "label": "Função com def",
              "kind": "skill",
              "checks": [
                "define e chama função"
              ],
              "errors": [
                "definir e não chamar"
              ]
            },
            {
              "id": "topic-parametro",
              "label": "Parâmetro",
              "kind": "concept",
              "checks": [
                "diferencia parâmetro de valor fixo"
              ],
              "errors": [
                "usar literal onde deveria usar parâmetro"
              ]
            },
            {
              "id": "topic-funcao-com-colecao",
              "label": "Função com coleção",
              "kind": "skill",
              "checks": [
                "recebe lista e percorre dados"
              ],
              "errors": [
                "usar lista global sem parâmetro"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-a02-01-listas-base",
              "title": "Guardar vários valores em uma lista",
              "goal": "Criar lista, mostrar valores e entender índice inicial em zero.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [],
              "covers": [
                "lista",
                "[]",
                "valores separados por vírgula",
                "índice 0",
                "índice -1"
              ],
              "checks": [
                "Acessa primeiro e último item corretamente.",
                "Distingue posição humana de índice em Python."
              ],
              "errors": [
                "Pensar que o primeiro índice é 1.",
                "Esquecer colchetes.",
                "Confundir valor e posição."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-01-listas-base-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Apresenta listas, ordem, índice inicial em zero e acesso ao último item.",
                  "cards": [
                    {
                      "id": "card-a02-01-01",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Lista como coleção ordenada",
                      "text": "Uma lista guarda vários valores em uma única variável. Ela usa colchetes `[]`, mantém uma ordem e permite alterar itens.",
                      "after": "A lista é adequada quando os dados formam uma sequência, como temperaturas coletadas em ordem."
                    },
                    {
                      "id": "card-a02-01-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Criar e mostrar uma lista",
                      "prompt": "Observe uma lista com cinco temperaturas.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80, 85, 90]\nprint(temperaturas)",
                      "after": "Os valores ficam separados por vírgula dentro de `[]`. A variável `temperaturas` guarda a coleção inteira."
                    },
                    {
                      "id": "card-a02-01-03",
                      "position": 3,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Posição e índice",
                      "columns": [
                        "Posição humana",
                        "Índice em Python",
                        "Valor"
                      ],
                      "rows": [
                        [
                          "1ª",
                          "0",
                          "70"
                        ],
                        [
                          "2ª",
                          "1",
                          "75"
                        ],
                        [
                          "3ª",
                          "2",
                          "80"
                        ],
                        [
                          "4ª",
                          "3",
                          "85"
                        ],
                        [
                          "5ª",
                          "4 ou -1",
                          "90"
                        ]
                      ],
                      "after": "Em Python, o primeiro índice é `0`. O índice `-1` acessa o último item da lista."
                    },
                    {
                      "id": "card-a02-01-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Acesse o primeiro item",
                      "prompt": "Complete o índice para acessar o primeiro valor.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80, 85, 90]\nindice = [[0::0|1|-1]]\nprint(temperaturas[indice])",
                      "after": "O primeiro item está no índice `0`, não no índice `1`."
                    },
                    {
                      "id": "card-a02-01-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Acesse o último item",
                      "prompt": "Complete o índice para acessar o último valor.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80, 85, 90]\nindice = [[-1::-1|0|5]]\nprint(temperaturas[indice])",
                      "after": "O índice `-1` acessa o último item sem precisar contar o tamanho da lista."
                    },
                    {
                      "id": "card-a02-01-06",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Preveja o valor acessado",
                      "question": "Com `temperaturas = [70, 75, 80]`, qual valor aparece em `temperaturas[1]`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`70`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`75`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`80`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`1`"
                        }
                      ],
                      "answer": "b",
                      "after": "O índice `1` aponta para o segundo item, porque a contagem começa em `0`."
                    },
                    {
                      "id": "card-a02-01-07",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Reconheça o erro de índice inicial",
                      "question": "Qual afirmação corrige a ideia de que o primeiro item de uma lista está no índice `1`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Em Python, o primeiro item da lista está no índice `0`."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Em Python, listas não têm índice."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Em Python, o primeiro item sempre está no índice `-1`."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Em Python, índices só funcionam com texto."
                        }
                      ],
                      "answer": "a",
                      "after": "Confundir posição humana com índice em Python é um erro frequente: posição `1ª` corresponde ao índice `0`."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-01-listas-base-20260617-040142"
            },
            {
              "id": "micro-a02-02-listas-operacoes-for",
              "title": "Modificar e percorrer listas",
              "goal": "Alterar item, adicionar com `append()`, remover valor e percorrer com `for`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-01-listas-base"
              ],
              "covers": [
                "alteração por índice",
                "append()",
                "remoção simples",
                "for item in lista"
              ],
              "checks": [
                "Diferencia alterar item existente de adicionar novo item.",
                "Percorre lista com indentação correta."
              ],
              "errors": [
                "Usar índice fora da lista.",
                "Chamar `append` sem parênteses.",
                "Remover valor inexistente.",
                "Esquecer indentação no `for`."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-02-listas-operacoes-for-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica operações básicas de lista e percurso com `for`.",
                  "cards": [
                    {
                      "id": "card-a02-02-01",
                      "position": 1,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Alterar, adicionar, remover e percorrer",
                      "prompt": "Observe operações básicas em uma lista.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80]\n\ntemperaturas[1] = 76\ntemperaturas.append(85)\ntemperaturas.remove(70)\n\nfor temperatura in temperaturas:\n    print(temperatura)",
                      "after": "`temperaturas[1] = 76` altera item existente; `append(85)` adiciona novo item ao final; `remove(70)` remove um valor."
                    },
                    {
                      "id": "card-a02-02-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o método de adição",
                      "prompt": "Complete o método que adiciona um valor ao final da lista.",
                      "language": "python",
                      "code": "producoes = [40, 55]\nproducoes.[[append::append|remove|print]](60)\nprint(producoes)",
                      "after": "`append()` adiciona um novo item ao final da lista. O método precisa de parênteses para receber o valor."
                    },
                    {
                      "id": "card-a02-02-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Altere um item existente",
                      "prompt": "Complete o novo valor do item no índice `1`.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80]\ntemperaturas[1] = [[76::76|1|75]]\nprint(temperaturas)",
                      "after": "A atribuição por índice troca o valor que já está naquela posição. O índice `1` continua sendo a posição alterada, não o novo valor."
                    },
                    {
                      "id": "card-a02-02-04",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a operação adequada",
                      "question": "Você tem `producoes = [40, 55]` e precisa incluir `60` como novo item no final. Qual operação faz isso?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes.append(60)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes[0] = 60"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes.remove(60)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "print(60)"
                        }
                      ],
                      "answer": "a",
                      "after": "`append(60)` adiciona. Atribuir por índice altera item existente; `remove()` exclui um valor."
                    },
                    {
                      "id": "card-a02-02-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha o for correto para lista",
                      "prompt": "Compare formas de percorrer uma lista.",
                      "language": "python",
                      "code": "Escolha a versão que mostra cada produção.",
                      "question": "Qual alternativa usa `for item in lista` corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [40, 55, 60]\nfor producao in producoes:\n    print(producao)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [40, 55, 60]\nfor producoes in producao:\n    print(producao)"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "A versão deixaria `print(producao)` fora do bloco do `for`, então o percurso da lista não ficaria estruturado corretamente."
                        }
                      ],
                      "answer": "a",
                      "after": "A variável temporária `producao` recebe um item por vez e o `print()` fica indentado dentro do `for`."
                    },
                    {
                      "id": "card-a02-02-06",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identifique índice fora da lista",
                      "question": "Com `valores = [10, 20, 30]`, por que `valores[3]` é um acesso inválido?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Os índices existentes são `0`, `1` e `2`; o índice `3` não existe nessa lista."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Listas não aceitam números."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`3` sempre significa último item."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "O índice precisa estar entre aspas."
                        }
                      ],
                      "answer": "a",
                      "after": "Uma lista com três itens tem índices de `0` a `2`. O tamanho não é o último índice."
                    },
                    {
                      "id": "card-a02-02-07",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a remoção simples",
                      "prompt": "Complete o método que remove o valor indicado.",
                      "language": "python",
                      "code": "status = [\"normal\", \"atenção\", \"normal\"]\nstatus.[[remove::remove|append|set]](\"atenção\")\nprint(status)",
                      "after": "`remove()` exclui a primeira ocorrência do valor informado. Ele não adiciona e não converte a lista."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-02-listas-operacoes-for-20260617-040142"
            },
            {
              "id": "micro-a02-03-tuplas",
              "title": "Usar tuplas para valores que não devem mudar",
              "goal": "Criar tupla e acessar valores, distinguindo tupla de lista pelo uso básico.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a02-02-listas-operacoes-for"
              ],
              "covers": [
                "tupla",
                "()",
                "acesso por índice",
                "diferença prática lista/tupla"
              ],
              "checks": [
                "Reconhece quando basta ler valores fixos.",
                "Acessa item de tupla por índice."
              ],
              "errors": [
                "Tentar alterar tupla como lista.",
                "Usar colchetes na criação e chamar de tupla.",
                "Exagerar diferença conceitual."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-03-tuplas-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Apresenta tuplas como coleções estáveis e acesso por índice.",
                  "cards": [
                    {
                      "id": "card-a02-03-01",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Lista e tupla no uso básico",
                      "columns": [
                        "Estrutura",
                        "Símbolo de criação",
                        "Uso básico"
                      ],
                      "rows": [
                        [
                          "lista",
                          "[]",
                          "coleção ordenada que pode ser alterada"
                        ],
                        [
                          "tupla",
                          "()",
                          "coleção ordenada usada para valores estáveis"
                        ]
                      ],
                      "after": "A diferença prática inicial é a intenção de alteração: lista muda; tupla é usada quando os valores devem permanecer estáveis."
                    },
                    {
                      "id": "card-a02-03-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Criar e acessar tupla",
                      "prompt": "Observe uma tupla de status possíveis.",
                      "language": "python",
                      "code": "status = (\"normal\", \"atenção\", \"alerta\")\n\nprint(status[0])\nprint(status[2])",
                      "after": "A tupla também permite acesso por índice. O uso principal aqui é guardar valores fixos de referência."
                    },
                    {
                      "id": "card-a02-03-03",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a estrutura para valores estáveis",
                      "question": "Para guardar os três status possíveis `normal`, `atenção` e `alerta`, sem necessidade de alterar a coleção durante o script, qual estrutura é adequada?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Uma tupla, porque representa valores estáveis que serão apenas lidos."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Uma comparação, porque ela guarda todas as opções de status."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Um comando de saída, porque ele armazena a coleção."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Um número decimal, porque ele substitui os textos."
                        }
                      ],
                      "answer": "a",
                      "after": "A tupla atende bem quando a coleção representa valores de referência que serão apenas lidos."
                    },
                    {
                      "id": "card-a02-03-04",
                      "position": 4,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Sentido prático da tupla",
                      "text": "Uma tupla é uma coleção ordenada usada para valores [[estáveis::estáveis|temporários|digitados]] no uso básico.",
                      "after": "A palavra decisiva é estabilidade: neste nível, use tupla quando a coleção serve como referência que não será modificada."
                    },
                    {
                      "id": "card-a02-03-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Acesse um valor da tupla",
                      "prompt": "Complete o índice para mostrar `atenção`.",
                      "language": "python",
                      "code": "status = (\"normal\", \"atenção\", \"alerta\")\nindice = [[1::1|0|3]]\nprint(status[indice])",
                      "after": "`atenção` está na segunda posição humana, mas no índice `1` em Python."
                    },
                    {
                      "id": "card-a02-03-06",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Reconheça tentativa inadequada de alteração",
                      "question": "O que há de inadequado em `status = (\"normal\", \"atenção\")` seguido de `status[0] = \"ok\"`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "A tupla foi escolhida para valores estáveis e não deve ser alterada por índice."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "O texto `ok` precisa ser número."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "O índice `0` aponta sempre para o último item."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Tupla não pode conter texto."
                        }
                      ],
                      "answer": "a",
                      "after": "Se o objetivo é alterar itens, uma lista é a estrutura básica mais adequada."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-03-tuplas-20260617-040142"
            },
            {
              "id": "micro-a02-04-dicionarios-chave-valor",
              "title": "Representar um registro com dicionário",
              "goal": "Criar e manipular dicionário com chaves como `nome`, `temperatura` e `status`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-03-tuplas"
              ],
              "covers": [
                "{}",
                "chave",
                "valor",
                "acesso por chave",
                "alteração",
                "adição de campo"
              ],
              "checks": [
                "Acessa `maquina[\"temperatura\"]`.",
                "Altera e adiciona campos em um dicionário."
              ],
              "errors": [
                "Usar índice numérico em dicionário.",
                "Esquecer aspas nas chaves.",
                "Confundir `:` com `=` dentro do literal."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-04-dicionarios-chave-valor-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica dicionários como registros de chave e valor.",
                  "cards": [
                    {
                      "id": "card-a02-04-01",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Registro como chave e valor",
                      "columns": [
                        "Chave",
                        "Valor"
                      ],
                      "rows": [
                        [
                          "nome",
                          "M1"
                        ],
                        [
                          "temperatura",
                          "82.5"
                        ],
                        [
                          "status",
                          "atenção"
                        ]
                      ],
                      "after": "Um dicionário representa bem um registro porque cada valor tem um nome de campo."
                    },
                    {
                      "id": "card-a02-04-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Criar, acessar, alterar e adicionar campo",
                      "prompt": "Observe operações básicas com um dicionário.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 82.5, \"status\": \"atenção\"}\n\nprint(maquina[\"temperatura\"])\nmaquina[\"temperatura\"] = 79.0\nmaquina[\"turno\"] = \"manhã\"\nprint(maquina)",
                      "after": "Dentro do literal, `:` separa chave e valor. Fora dele, `=` atribui um novo valor a uma chave."
                    },
                    {
                      "id": "card-a02-04-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Acesse temperatura por chave",
                      "prompt": "Complete a chave usada para acessar a temperatura.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 82.5}\nchave = [[\"temperatura\"::\"temperatura\"|\"nome\"|temperatura]]\nprint(maquina[chave])",
                      "after": "Chaves textuais precisam de aspas. Sem aspas, `temperatura` seria interpretado como nome de variável."
                    },
                    {
                      "id": "card-a02-04-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Altere o status",
                      "prompt": "Complete o novo valor textual do campo `status`.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"status\": \"atenção\"}\nmaquina[\"status\"] = [[\"normal\"::\"normal\"|\"status\"|normal]]\nprint(maquina)",
                      "after": "O valor textual deve ficar entre aspas. A chave `\"status\"` identifica o campo que será alterado."
                    },
                    {
                      "id": "card-a02-04-05",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha lista ou dicionário",
                      "question": "Você precisa representar uma máquina com campos `nome`, `temperatura` e `status`. Qual estrutura deixa o significado de cada campo mais explícito?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 82.5, \"status\": \"atenção\"}"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina = [\"M1\", 82.5, \"atenção\"]"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Apenas um comando de saída com o nome da máquina."
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura >= 80"
                        }
                      ],
                      "answer": "a",
                      "after": "O dicionário liga cada chave a um valor, evitando depender apenas da posição para entender o dado."
                    },
                    {
                      "id": "card-a02-04-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha o literal correto",
                      "prompt": "Compare formas de criar um dicionário.",
                      "language": "python",
                      "code": "Escolha a versão com chaves textuais e `:` entre chave e valor.",
                      "question": "Qual alternativa cria o dicionário corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 82.5, \"status\": \"atenção\"}"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina = {\"nome\" = \"M1\", \"temperatura\" = 82.5, \"status\" = \"atenção\"}"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina = {nome: \"M1\", temperatura: 82.5, status: \"atenção\"}"
                        }
                      ],
                      "answer": "a",
                      "after": "No literal de dicionário, cada par usa `chave: valor`. Chaves textuais devem estar entre aspas."
                    },
                    {
                      "id": "card-a02-04-07",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicione um novo campo",
                      "prompt": "Complete a nova chave textual antes de atribuir o valor.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 79.0}\nnova_chave = [[\"turno\"::\"turno\"|\"manhã\"|turno]]\nmaquina[nova_chave] = \"manhã\"\nprint(maquina)",
                      "after": "A nova chave `\"turno\"` identifica o campo que será criado no dicionário."
                    },
                    {
                      "id": "card-a02-04-08",
                      "position": 8,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Reconheça acesso inadequado",
                      "question": "Por que `maquina[0]` não é uma boa forma de acessar `temperatura` em um dicionário como `{\"temperatura\": 82.5}`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Dicionários são acessados pela chave textual que identifica o campo."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "A temperatura só pode ser acessada com método de adição."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Dicionários não podem guardar números decimais."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "O índice numérico sempre altera o valor."
                        }
                      ],
                      "answer": "a",
                      "after": "No dicionário, o significado vem da chave. Usar índice numérico é raciocínio de lista, não de dicionário."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-04-dicionarios-chave-valor-20260617-040142"
            },
            {
              "id": "micro-a02-05-dicionarios-for-items",
              "title": "Percorrer um dicionário com chave e valor",
              "goal": "Usar laço para observar os campos de um dicionário.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-04-dicionarios-chave-valor"
              ],
              "covers": [
                "for",
                "chave",
                "valor",
                ".items()"
              ],
              "checks": [
                "Entende que cada repetição entrega um par de informação.",
                "Usa `.items()` quando precisa de chave e valor."
              ],
              "errors": [
                "Percorrer só chaves e esperar valores.",
                "Inverter nomes.",
                "Esquecer `.items()` no caso de chave e valor."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-05-dicionarios-for-items-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Pratica percurso de dicionários com pares chave-valor.",
                  "cards": [
                    {
                      "id": "card-a02-05-01",
                      "position": 1,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Percorrer pares com items()",
                      "prompt": "Observe como ler chave e valor em cada repetição.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 82.5, \"status\": \"atenção\"}\n\nfor chave, valor in maquina.items():\n    print(chave, valor)",
                      "after": "`.items()` entrega pares: a chave do campo e o valor associado a ela."
                    },
                    {
                      "id": "card-a02-05-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete items()",
                      "prompt": "Complete o método para percorrer chave e valor.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 82.5}\nfor chave, valor in maquina.[[items::items|keys|values]]():\n    print(chave, valor)",
                      "after": "Use `.items()` quando o laço precisa receber dois elementos por vez: `chave` e `valor`."
                    },
                    {
                      "id": "card-a02-05-03",
                      "position": 3,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Par de informação",
                      "text": "Ao percorrer `maquina.items()`, cada repetição entrega um [[par::par|índice|decimal]] formado por chave e valor.",
                      "after": "A chave identifica o campo; o valor é a informação guardada naquele campo."
                    },
                    {
                      "id": "card-a02-05-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Preveja a saída com chave e valor",
                      "prompt": "Analise o trecho.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"status\": \"normal\"}\nfor chave, valor in maquina.items():\n    print(f\"{chave}: {valor}\")",
                      "question": "Qual saída corresponde ao percurso dos pares?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`nome: M1` e depois `status: normal`."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`M1: nome` e depois `normal: status`."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`0: nome` e depois `1: status`."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`nome status` sem valores."
                        }
                      ],
                      "answer": "a",
                      "after": "O laço recebe primeiro a chave e depois o valor, respeitando a ordem de inserção desses campos."
                    },
                    {
                      "id": "card-a02-05-05",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identifique o erro sem items()",
                      "question": "Qual é o problema em escrever `for chave, valor in maquina:` esperando receber chave e valor?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Sem `.items()`, o percurso básico do dicionário entrega chaves, não pares `chave, valor`."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`for` não pode percorrer dicionário."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`valor` precisa ser sempre número inteiro."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`maquina` precisa ser uma tupla."
                        }
                      ],
                      "answer": "a",
                      "after": "Para separar chave e valor em duas variáveis, o laço deve percorrer `maquina.items()`."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-05-dicionarios-for-items-20260617-040142"
            },
            {
              "id": "micro-a02-06-conjuntos-set",
              "title": "Remover repetidos com set() quando só importam valores únicos",
              "goal": "Transformar lista com repetição em conjunto e interpretar a ideia de valores únicos.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a02-05-dicionarios-for-items"
              ],
              "covers": [
                "conjunto",
                "set()",
                "remoção de duplicados",
                "ausência de ordem garantida"
              ],
              "checks": [
                "Entende que conjunto não é lista ordenada.",
                "Reconhece `set()` como recurso de unicidade."
              ],
              "errors": [
                "Esperar ordem fixa.",
                "Tentar acessar por índice.",
                "Achar que `set()` conta repetições."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-06-conjuntos-set-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Apresenta conjuntos e `set()` para valores únicos.",
                  "cards": [
                    {
                      "id": "card-a02-06-01",
                      "position": 1,
                      "resource": "relation_map",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Lista com repetidos e conjunto de únicos",
                      "leftSet": {
                        "label": "Lista original",
                        "items": [
                          {
                            "id": "l80a",
                            "label": "80"
                          },
                          {
                            "id": "l80b",
                            "label": "80"
                          },
                          {
                            "id": "l90a",
                            "label": "90"
                          },
                          {
                            "id": "l75",
                            "label": "75"
                          },
                          {
                            "id": "l90b",
                            "label": "90"
                          }
                        ]
                      },
                      "rightSet": {
                        "label": "Valores únicos",
                        "items": [
                          {
                            "id": "s75",
                            "label": "75"
                          },
                          {
                            "id": "s80",
                            "label": "80"
                          },
                          {
                            "id": "s90",
                            "label": "90"
                          }
                        ]
                      },
                      "relations": [
                        {
                          "from": "l80a",
                          "to": "s80"
                        },
                        {
                          "from": "l80b",
                          "to": "s80"
                        },
                        {
                          "from": "l90a",
                          "to": "s90"
                        },
                        {
                          "from": "l75",
                          "to": "s75"
                        },
                        {
                          "from": "l90b",
                          "to": "s90"
                        }
                      ],
                      "after": "O mapa separa a lista de origem e os valores únicos resultantes; repetições apontam para o mesmo valor no conjunto.",
                      "prompt": "Observe como valores repetidos da lista correspondem a um único valor no conjunto."
                    },
                    {
                      "id": "card-a02-06-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Criar conjunto com set()",
                      "prompt": "Observe a remoção de duplicados.",
                      "language": "python",
                      "code": "temperaturas = [80, 80, 90, 75, 90]\nunicas = set(temperaturas)\nprint(unicas)",
                      "after": "`set()` cria um conjunto de valores únicos. A ordem de exibição não deve ser usada como critério."
                    },
                    {
                      "id": "card-a02-06-03",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Finalidade de set()",
                      "question": "Para que serve `set(temperaturas)` quando `temperaturas` tem valores repetidos?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Obter os valores únicos."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Ordenar a lista por índice."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Contar quantas vezes cada valor aparece."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Converter todos os valores em texto."
                        }
                      ],
                      "answer": "a",
                      "after": "`set()` elimina duplicados. Ele não preserva a lógica de posição da lista."
                    },
                    {
                      "id": "card-a02-06-04",
                      "position": 4,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Ideia de unicidade",
                      "text": "Um conjunto guarda valores [[únicos::únicos|duplicados|indexados]] quando a repetição não importa.",
                      "after": "A palavra decisiva é `únicos`: se o mesmo valor aparece várias vezes na lista, ele aparece uma vez no conjunto."
                    },
                    {
                      "id": "card-a02-06-05",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Evite tratar conjunto como lista",
                      "question": "Por que `unicas[0]` não é uma boa forma de trabalhar com um conjunto criado por `set()`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Conjunto não é lista ordenada por índice."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`set()` cria sempre uma string."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "O índice `0` remove duplicados."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Conjuntos só aceitam dicionários."
                        }
                      ],
                      "answer": "a",
                      "after": "Use conjunto quando a pergunta é sobre unicidade, não sobre posição."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-06-conjuntos-set-20260617-040142"
            },
            {
              "id": "micro-a02-07-for-if-colecoes",
              "title": "Analisar listas de produções com for + if",
              "goal": "Percorrer lista de produções e classificar cada valor conforme um limite simples.",
              "role": "review",
              "status": "generated",
              "dependsOn": [
                "micro-a02-06-conjuntos-set"
              ],
              "covers": [
                "lista de produções",
                "for",
                "if",
                "f-string",
                "classificação simples"
              ],
              "checks": [
                "Completa análise local sem criar regra de negócio complexa.",
                "Compara item atual, não lista inteira."
              ],
              "errors": [
                "Comparar lista inteira com número.",
                "Colocar `if` fora do laço.",
                "Não imprimir o valor analisado."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-07-for-if-colecoes-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Consolida coleções com `for + if` em análise simples.",
                  "cards": [
                    {
                      "id": "card-a02-07-01",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Análise item por item",
                      "prompt": "Observe o padrão para classificar produções.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Criar lista de produções"
                          },
                          {
                            "kind": "for",
                            "item": "producao",
                            "collection": "producoes",
                            "body": [
                              {
                                "kind": "if_then_else",
                                "condition": "producao >= 60?",
                                "thenBranch": [
                                  {
                                    "kind": "output",
                                    "text": "Alta"
                                  }
                                ],
                                "elseBranch": [
                                  {
                                    "kind": "output",
                                    "text": "Baixa"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Todos os itens foram analisados"
                          }
                        ]
                      },
                      "after": "O limite é aplicado a cada item da lista, não à lista inteira."
                    },
                    {
                      "id": "card-a02-07-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Classificar lista de produções",
                      "prompt": "Observe a classificação simples com `for + if`.",
                      "language": "python",
                      "code": "producoes = [40, 65, 58]\n\nfor producao in producoes:\n    if producao >= 60:\n        print(f\"{producao}: alta\")\n    else:\n        print(f\"{producao}: baixa\")",
                      "after": "A variável `producao` recebe um número da lista por vez; a condição compara esse número com o limite."
                    },
                    {
                      "id": "card-a02-07-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a condição de produção alta",
                      "prompt": "Complete o operador para incluir o limite `60` como alta.",
                      "language": "python",
                      "code": "producoes = [40, 65, 58]\nfor producao in producoes:\n    if producao [[>=::>=|<=|==]] 60:\n        print(\"alta\")",
                      "after": "`>= 60` considera `60` e valores maiores como produção alta."
                    },
                    {
                      "id": "card-a02-07-04",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Compare item e lista inteira",
                      "question": "Qual é o problema em usar `if producoes >= 60:` para classificar uma lista?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "A comparação deveria usar o item atual, como `producao`, dentro do `for`."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Listas só podem ser comparadas com texto."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`if` precisa aparecer antes da criação da lista."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`60` precisa estar entre aspas para ser número."
                        }
                      ],
                      "answer": "a",
                      "after": "A lista inteira não é o valor analisado. O laço cria uma variável temporária para comparar item por item."
                    },
                    {
                      "id": "card-a02-07-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Mostre o valor classificado",
                      "prompt": "Complete a f-string para mostrar o valor junto da classificação.",
                      "language": "python",
                      "code": "producao = 65\nprint([[f\"{producao}: alta\"::f\"{producao}: alta\"|\"producao: alta\"|f\"{producoes}: alta\"]])",
                      "after": "A f-string correta usa `f` e `{producao}` para inserir o valor atual."
                    },
                    {
                      "id": "card-a02-07-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha o script correto",
                      "prompt": "Compare três versões de classificação.",
                      "language": "python",
                      "code": "Escolha a versão que percorre a lista e decide dentro do laço.",
                      "question": "Qual alternativa classifica cada produção localmente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [40, 65, 58]\nfor producao in producoes:\n    if producao >= 60:\n        print(f\"{producao}: alta\")\n    else:\n        print(f\"{producao}: baixa\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [40, 65, 58]\nif producoes >= 60:\n    print(\"alta\")\nelse:\n    print(\"baixa\")"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "A comparação `if producao >= 60:` precisaria ficar indentada dentro do `for` para classificar cada item da lista."
                        }
                      ],
                      "answer": "a",
                      "after": "A alternativa correta compara `producao`, que é o item atual, e mantém a decisão indentada dentro do `for`."
                    },
                    {
                      "id": "card-a02-07-07",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Posição do if",
                      "question": "Onde deve ficar o `if` para classificar cada item de `producoes`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Dentro do bloco do `for`, indentado abaixo dele."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Antes da lista ser criada."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Depois do `for`, sem indentação."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Dentro do método de adição."
                        }
                      ],
                      "answer": "a",
                      "after": "A decisão precisa ser repetida para cada valor; por isso, ela fica dentro do bloco do `for`."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-07-for-if-colecoes-20260617-040142"
            },
            {
              "id": "micro-a02-08-funcoes-parametros",
              "title": "Criar funções para reutilizar uma ação",
              "goal": "Definir função com `def`, chamar função e passar parâmetro.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a02-07-for-if-colecoes"
              ],
              "covers": [
                "def",
                "nome da função",
                "parênteses",
                "parâmetro",
                "chamada",
                "indentação"
              ],
              "checks": [
                "Diferencia definir função de chamá-la.",
                "Usa parâmetro em f-string dentro da função."
              ],
              "errors": [
                "Esquecer `:`.",
                "Escrever código fora da indentação.",
                "Definir e não chamar.",
                "Confundir parâmetro com valor fixo."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-08-funcoes-parametros-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Apresenta funções, chamada, parâmetro e indentação.",
                  "cards": [
                    {
                      "id": "card-a02-08-01",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Definir e chamar função",
                      "prompt": "Observe a diferença entre criar a função e executá-la.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "process",
                            "text": "Definir função com def"
                          },
                          {
                            "kind": "process",
                            "text": "Guardar bloco indentado da função"
                          },
                          {
                            "kind": "process",
                            "text": "Chamar função pelo nome"
                          },
                          {
                            "kind": "output",
                            "text": "Executar o bloco"
                          }
                        ]
                      },
                      "after": "`def` define a função. A função só executa quando aparece uma chamada, como `mostrar_mensagem()`."
                    },
                    {
                      "id": "card-a02-08-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Função simples sem parâmetro",
                      "prompt": "Observe uma função que mostra uma mensagem.",
                      "language": "python",
                      "code": "def mostrar_mensagem():\n    print(\"Análise iniciada\")\n\nmostrar_mensagem()",
                      "after": "A linha com `def` cria a função; a linha `mostrar_mensagem()` chama a função."
                    },
                    {
                      "id": "card-a02-08-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete a definição",
                      "prompt": "Complete a palavra usada para definir função.",
                      "language": "python",
                      "code": "[[def::def|if|for]] mostrar_mensagem():\n    print(\"Análise iniciada\")",
                      "after": "`def` inicia a definição de uma função. Depois vêm nome, parênteses, `:` e bloco indentado."
                    },
                    {
                      "id": "card-a02-08-04",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identifique a chamada",
                      "question": "Qual linha executa a função já definida no trecho mostrado?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "mostrar_mensagem()"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "def mostrar_mensagem():"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "print(\"Análise iniciada\")"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "O símbolo de dois pontos no final da definição."
                        }
                      ],
                      "answer": "a",
                      "after": "A chamada usa o nome da função com parênteses, sem `def`."
                    },
                    {
                      "id": "card-a02-08-05",
                      "position": 5,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Função com parâmetro",
                      "prompt": "Observe uma função que recebe o nome da máquina.",
                      "language": "python",
                      "code": "def mostrar_maquina(nome):\n    print(f\"Máquina: {nome}\")\n\nmostrar_maquina(\"M1\")",
                      "after": "`nome` é parâmetro: um nome interno que recebe o valor passado na chamada."
                    },
                    {
                      "id": "card-a02-08-06",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o parâmetro",
                      "prompt": "Complete o nome do parâmetro usado dentro da função.",
                      "language": "python",
                      "code": "def mostrar_temperatura([[temperatura::temperatura|82|print]]):\n    print(f\"Temperatura: {temperatura}\")",
                      "after": "O parâmetro deve ser um nome de variável. Ele será usado dentro do bloco da função."
                    },
                    {
                      "id": "card-a02-08-07",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a função correta",
                      "prompt": "Compare versões de função com parâmetro.",
                      "language": "python",
                      "code": "Escolha a versão que define, indenta e chama a função corretamente.",
                      "question": "Qual alternativa está estruturada corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "def mostrar_status(status):\n    print(f\"Status: {status}\")\n\nmostrar_status(\"normal\")"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "A linha `print(f\"Status: {status}\")` precisaria ficar indentada dentro da função após `def mostrar_status(status):`."
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "mostrar_status(\"normal\")\ndef mostrar_status(status):\n    print(f\"Status: {status}\")"
                        }
                      ],
                      "answer": "a",
                      "after": "A função precisa de bloco indentado e deve estar definida antes da chamada no fluxo simples do script."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-08-funcoes-parametros-20260617-040142"
            },
            {
              "id": "micro-a02-09-funcao-com-colecao",
              "title": "Receber uma coleção e analisar item por item",
              "goal": "Criar função que recebe lista, percorre os dados e aplica classificação simples.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-08-funcoes-parametros"
              ],
              "covers": [
                "função com parâmetro lista",
                "for",
                "if",
                "análise simples",
                "saída"
              ],
              "checks": [
                "Completa função que recebe uma coleção e classifica valores.",
                "Mantém o `for` dentro da função."
              ],
              "errors": [
                "Usar lista global sem parâmetro.",
                "Esquecer chamada da função.",
                "Retornar quando o exercício pede mostrar.",
                "Colocar `for` fora da função."
              ],
              "versions": [
                {
                  "id": "version-micro-a02-09-funcao-com-colecao-20260617-040142",
                  "createdAt": "2026-06-17T04:01:42.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materialização da Parte 01 a partir do handoff fundamentos-ia-analise-dados__parte01__prompt_builder__v20260617-040142.md.",
                  "summary": "Consolida funções que recebem coleções e realizam análise simples.",
                  "cards": [
                    {
                      "id": "card-a02-09-01",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Função que analisa uma coleção",
                      "prompt": "Observe o padrão função, laço e decisão.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "process",
                            "text": "Definir função com parâmetro lista"
                          },
                          {
                            "kind": "for",
                            "item": "valor",
                            "collection": "lista recebida",
                            "body": [
                              {
                                "kind": "if_then_else",
                                "condition": "valor atende ao limite?",
                                "thenBranch": [
                                  {
                                    "kind": "output",
                                    "text": "Mostrar classificação positiva"
                                  }
                                ],
                                "elseBranch": [
                                  {
                                    "kind": "output",
                                    "text": "Mostrar classificação alternativa"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "kind": "process",
                            "text": "Chamar função passando uma lista"
                          }
                        ]
                      },
                      "after": "A função recebe a coleção por parâmetro e aplica o mesmo raciocínio a cada item."
                    },
                    {
                      "id": "card-a02-09-02",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Analisar temperaturas com função",
                      "prompt": "Observe a função recebendo uma lista e classificando item por item.",
                      "language": "python",
                      "code": "def analisar_temperaturas(temperaturas):\n    for temperatura in temperaturas:\n        if temperatura >= 80:\n            print(f\"{temperatura}: atenção\")\n        else:\n            print(f\"{temperatura}: normal\")\n\nanalisar_temperaturas([72, 84, 79])",
                      "after": "A lista é passada na chamada. Dentro da função, `for` percorre o parâmetro `temperaturas`."
                    },
                    {
                      "id": "card-a02-09-03",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o parâmetro da coleção",
                      "prompt": "Complete o nome do parâmetro que representa a lista recebida.",
                      "language": "python",
                      "code": "def analisar_producoes([[producoes::producoes|producao|lista()]]):\n    for producao in producoes:\n        print(producao)",
                      "after": "`producoes` representa a coleção inteira recebida. `producao` é mais adequado para o item atual dentro do `for`."
                    },
                    {
                      "id": "card-a02-09-04",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Complete o laço dentro da função",
                      "prompt": "Complete a palavra que percorre a coleção recebida.",
                      "language": "python",
                      "code": "def analisar_producoes(producoes):\n    [[for::for|if|while]] producao in producoes:\n        print(producao)",
                      "after": "`for producao in producoes` percorre cada item da lista passada para a função."
                    },
                    {
                      "id": "card-a02-09-05",
                      "position": 5,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Limite da análise de produções",
                      "columns": [
                        "Condição",
                        "Saída"
                      ],
                      "rows": [
                        [
                          "producao >= 60",
                          "alta"
                        ],
                        [
                          "caso contrário",
                          "baixa"
                        ]
                      ],
                      "after": "O critério precisa estar disponível antes do exercício para que a classificação seja verificável."
                    },
                    {
                      "id": "card-a02-09-06",
                      "position": 6,
                      "resource": "composite",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Complete a função de análise",
                      "blocks": [
                        {
                          "kind": "heading",
                          "value": "Critério de classificação"
                        },
                        {
                          "kind": "table",
                          "columns": [
                            "Condição",
                            "Classificação"
                          ],
                          "rows": [
                            [
                              "`producao >= 60`",
                              "alta"
                            ],
                            [
                              "`producao < 60`",
                              "baixa"
                            ]
                          ]
                        },
                        {
                          "kind": "heading",
                          "value": "Função em análise"
                        },
                        {
                          "kind": "code",
                          "prompt": "Observe a função e decida qual operador deve aparecer na condição.",
                          "language": "python",
                          "code": "def analisar_producoes(producoes):\n    for producao in producoes:\n        if producao [operador] 60:\n            print(f\"{producao}: alta\")\n        else:\n            print(f\"{producao}: baixa\")\n\nanalisar_producoes([55, 67, 60])"
                        },
                        {
                          "kind": "choice",
                          "question": "Qual operador mantém a classificação correta, inclusive para o valor limite `60`?",
                          "options": [
                            {
                              "id": "a",
                              "kind": "text",
                              "text": "`>=`"
                            },
                            {
                              "id": "b",
                              "kind": "text",
                              "text": "`<=`"
                            },
                            {
                              "id": "c",
                              "kind": "text",
                              "text": "`==`"
                            }
                          ],
                          "answer": "a"
                        }
                      ],
                      "after": "`>=` inclui o limite `60`, então `60` também deve ser classificado como `alta`.",
                      "afterBlocks": [
                        {
                          "kind": "heading",
                          "value": "Solução comentada"
                        },
                        {
                          "kind": "code",
                          "prompt": "Veja a função completa com o operador correto.",
                          "language": "python",
                          "code": "def analisar_producoes(producoes):\n    for producao in producoes:\n        if producao >= 60:\n            print(f\"{producao}: alta\")\n        else:\n            print(f\"{producao}: baixa\")\n\nanalisar_producoes([55, 67, 60])"
                        }
                      ]
                    },
                    {
                      "id": "card-a02-09-07",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolha a função com coleção",
                      "prompt": "Compare funções para analisar produções.",
                      "language": "python",
                      "code": "Escolha a versão que recebe a lista por parâmetro, percorre dentro da função e chama a função no final.",
                      "question": "Qual alternativa organiza a análise corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "def analisar_producoes(producoes):\n    for producao in producoes:\n        if producao >= 60:\n            print(f\"{producao}: alta\")\n        else:\n            print(f\"{producao}: baixa\")\n\nanalisar_producoes([55, 67, 60])"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [55, 67, 60]\ndef analisar_producoes():\n    for producao in producoes:\n        print(producao)\n\nanalisar_producoes()"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "A versão correta precisa manter o `for` dentro da função e a comparação `if producao >= 60:` indentada dentro do laço."
                        }
                      ],
                      "answer": "a",
                      "after": "A alternativa correta não depende de lista global, mantém o `for` dentro da função e executa a chamada após a definição."
                    },
                    {
                      "id": "card-a02-09-08",
                      "position": 8,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Base para operar dados com Python",
                      "text": "Listas, dicionários, laços e funções formam uma base prática para organizar dados e aplicar análises simples com Python.",
                      "after": "A próxima evolução natural é usar essa base para operar coleções maiores com recursos prontos da linguagem e de seu ecossistema, sem perder a lógica de item, campo, condição e repetição."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "version-micro-a02-09-funcao-com-colecao-20260617-040142"
            }
          ]
        }
      ]
    }
  ]
}
);

export function createFundamentosIaAnaliseDadosCourse() {
  return structuredClone(RAW_FUNDAMENTOS_IA_ANALISE_DADOS_COURSE);
}
