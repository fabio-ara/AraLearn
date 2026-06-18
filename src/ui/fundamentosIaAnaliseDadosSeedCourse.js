const RAW_FUNDAMENTOS_IA_ANALISE_DADOS_COURSE = Object.freeze(
{
  "id": "course-fundamentos-ia-analise-dados",
  "title": "Fundamentos de IA e Análise de Dados",
  "goal": "Desenvolver autonomia inicial e intermediária em Python para ler, completar, explicar e escrever pequenos scripts de análise de dados usando variáveis, controle de fluxo, coleções, funções nativas, métodos, parâmetros, argumentos e retorno.",
  "modules": [
    {
      "id": "module-aula-01-python-fundamentos",
      "title": "Aula 1 — Fundamentos de Python",
      "guide": {
        "goal": "Consolidar autonomia inicial em Python para ler, completar e escrever scripts com linguagem Python, execução, variáveis, tipos observáveis, funções nativas, entrada, conversão, condicionais, indentação e repetições.",
        "include": [
          "Python como linguagem interpretada",
          "tipagem dinâmica e forte",
          "`print()`",
          "`input()`",
          "`type()`",
          "`int()`",
          "`float()`",
          "`str()`",
          "variáveis",
          "f-string",
          "comparações",
          "operadores lógicos",
          "`if`",
          "`elif`",
          "`else`",
          "indentação",
          "`while`",
          "`for`",
          "`range()`",
          "listas simples",
          "`for + if`",
          "erros comuns de sintaxe e execução"
        ],
        "exclude": [
          "NumPy",
          "Pandas",
          "Matplotlib",
          "Scikit-learn",
          "arquivos",
          "exceções",
          "classes",
          "lambda",
          "compreensão de listas",
          "compreensão de dicionários",
          "*args",
          "**kwargs",
          "argumentos opcionais",
          "escopo avançado",
          "recursão",
          "algoritmos de ordenação",
          "retorno complexo",
          "regras industriais complexas"
        ],
        "notation": [
          "Usar lacunas somente nos campos de texto ou código definidos pela especificação.",
          "Usar crases em textos renderizáveis para identificadores, funções, operadores e literais."
        ],
        "avoid": [
          "Vocabulário artificial",
          "Perguntas abertas sem decisão verificável",
          "Lógica desnecessariamente complexa"
        ]
      },
      "lessons": [
        {
          "id": "lesson-aula-01-python-sintaxe-controle",
          "title": "Aula 1 — Python, sintaxe e controle de fluxo",
          "guide": {
            "goal": "Consolidar autonomia inicial em Python: linguagem, modo de execução, variáveis, tipos, funções nativas, entrada, conversão, operadores, condições, indentação e repetições.",
            "include": [
              "Python como linguagem interpretada",
              "tipagem dinâmica e forte",
              "`print()`",
              "`input()`",
              "`type()`",
              "`int()`",
              "`float()`",
              "`str()`",
              "variáveis",
              "f-string",
              "comparações",
              "operadores lógicos",
              "`if`",
              "`elif`",
              "`else`",
              "indentação",
              "`while`",
              "`for`",
              "`range()`",
              "listas simples",
              "`for + if`",
              "erros comuns de sintaxe e execução"
            ],
            "exclude": [
              "NumPy",
              "Pandas",
              "Matplotlib",
              "Scikit-learn",
              "arquivos",
              "exceções",
              "classes",
              "lambda",
              "compreensão de listas",
              "compreensão de dicionários",
              "*args",
              "**kwargs",
              "argumentos opcionais",
              "escopo avançado",
              "recursão",
              "algoritmos de ordenação",
              "retorno complexo",
              "regras industriais complexas"
            ],
            "notation": [
              "Usar lacunas somente nos campos de texto ou código definidos pela especificação.",
              "Usar crases em textos renderizáveis para identificadores, funções, operadores e literais."
            ],
            "avoid": [
              "Vocabulário artificial",
              "Perguntas abertas sem decisão verificável",
              "Lógica desnecessariamente complexa"
            ]
          },
          "topics": [
            {
              "id": "topic-a01-python",
              "label": "Python como linguagem",
              "kind": "concept",
              "checks": [
                "reconhece execução sequencial e tipagem dinâmica"
              ],
              "errors": [
                "achar que variável declara tipo fixo"
              ]
            },
            {
              "id": "topic-a01-variaveis-saida",
              "label": "Variáveis e saída",
              "kind": "skill",
              "checks": [
                "usa `=` e `print()`"
              ],
              "errors": [
                "trocar variável por texto literal"
              ]
            },
            {
              "id": "topic-a01-funcoes-nativas",
              "label": "Funções nativas",
              "kind": "concept",
              "checks": [
                "identifica argumento e retorno observável"
              ],
              "errors": [
                "esquecer parênteses"
              ]
            },
            {
              "id": "topic-a01-condicionais",
              "label": "Condicionais",
              "kind": "skill",
              "checks": [
                "usa `if`, `elif`, `else` e indentação"
              ],
              "errors": [
                "confundir `=` e `==`"
              ]
            },
            {
              "id": "topic-a01-entrada-conversao",
              "label": "Entrada e conversão",
              "kind": "skill",
              "checks": [
                "converte `input()` para número quando necessário"
              ],
              "errors": [
                "comparar texto com número"
              ]
            },
            {
              "id": "topic-a01-repeticao",
              "label": "Repetição",
              "kind": "skill",
              "checks": [
                "usa `while`, `for` e `range()`"
              ],
              "errors": [
                "não atualizar contador"
              ]
            },
            {
              "id": "topic-a01-listas-for-if",
              "label": "Listas simples com filtro",
              "kind": "skill",
              "checks": [
                "compara item atual dentro do laço"
              ],
              "errors": [
                "comparar lista inteira com número"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-a01-python-modo-linguagem-tipagem",
              "title": "Python, execução e tipagem",
              "goal": "Entender que Python executa instruções em ordem, usa indentação para blocos e associa tipos aos valores.",
              "role": "support",
              "status": "generated",
              "dependsOn": [],
              "covers": [
                "Python como linguagem",
                "interpretador",
                "execução sequencial",
                "tipagem dinâmica",
                "tipagem forte",
                "variáveis",
                "indentação"
              ],
              "checks": [
                "descreve Python como linguagem interpretada",
                "distingue variável e valor",
                "usa `type()` para observar tipo",
                "reconhece erro por usar variável antes de criá-la"
              ],
              "errors": [
                "achar que variável já nasce com tipo fixo",
                "usar variável antes de atribuir valor",
                "achar que `==` cria variável"
              ],
              "versions": [
                {
                  "id": "micro-a01-python-modo-linguagem-tipagem__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Cria a base conceitual de Python como linguagem interpretada, com execução sequencial e tipagem dinâmica.",
                  "cards": [
                    {
                      "id": "card-a01-01-python-linguagem",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Python como linguagem",
                      "text": "Python é uma linguagem de programação de alto nível e interpretada. Alto nível significa que o código fica próximo da forma como uma pessoa descreve passos. Interpretada significa que um interpretador lê e executa as instruções, em geral de cima para baixo. Em notebooks, cada célula também segue a ordem em que foi executada.",
                      "after": "A consequência prática é que a ordem importa: uma variável precisa existir antes de ser usada, e uma célula alterada pode mudar o resultado das próximas execuções."
                    },
                    {
                      "id": "card-a01-01-vocabulario-execucao",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Vocabulário básico de execução",
                      "columns": [
                        "Termo",
                        "Sentido prático em Python",
                        "Exemplo"
                      ],
                      "rows": [
                        [
                          "Comando",
                          "instrução que o Python executa",
                          "`print(\"Olá\")`"
                        ],
                        [
                          "Interpretador",
                          "programa que lê e executa o código Python",
                          "execução de uma célula no notebook"
                        ],
                        [
                          "Variável",
                          "nome associado a um valor",
                          "`idade = 18`"
                        ],
                        [
                          "Tipo",
                          "categoria do valor usado pelo Python",
                          "`int`, `float`, `str`, `bool`"
                        ],
                        [
                          "Indentação",
                          "espaços no começo da linha que definem bloco",
                          "linha recuada depois de `if`"
                        ]
                      ],
                      "after": "Esses termos aparecem juntos: o interpretador executa comandos, usa variáveis, observa tipos e respeita a indentação para entender blocos."
                    },
                    {
                      "id": "card-a01-01-tipagem-dinamica",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Tipagem em Python",
                      "question": "Qual alternativa descreve melhor a tipagem de variáveis em Python?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "A variável precisa declarar o tipo antes do primeiro valor, como `int idade = 18`."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "A variável recebe um valor, e o tipo observado é o tipo desse valor."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Toda variável em Python é texto até ser impressa com `print()`."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Python ignora tipos quando faz contas entre texto e número."
                        }
                      ],
                      "answer": "b",
                      "after": "Python usa tipagem dinâmica: o nome da variável não declara tipo fixo antes. O valor associado ao nome tem tipo, e esse tipo interfere no que pode ser feito com ele."
                    },
                    {
                      "id": "card-a01-01-type-observa-mudanca",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Previsão de tipo",
                      "prompt": "Observe a troca do valor associado ao mesmo nome.",
                      "language": "python",
                      "code": "valor = 10\nprint(type(valor))\n\nvalor = \"10\"\nprint(type(valor))",
                      "after": "Primeiro `valor` aponta para um inteiro; depois aponta para um texto. O nome é o mesmo, mas o tipo observado acompanha o valor atual.",
                      "question": "Qual saída representa a ordem correta dos tipos?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`<class 'int'>` e depois `<class 'str'>`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`<class 'str'>` e depois `<class 'int'>`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`<class 'float'>` duas vezes"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`<class 'bool'>` e depois `<class 'str'>`"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-01-lacuna-tipo-valor",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Tipo pertence ao valor",
                      "text": "Em Python, o tipo observado por `type()` pertence ao [[valor::valor|nome da variável|comentário]] associado naquele instante.",
                      "after": "`type(valor)` consulta o objeto associado ao nome `valor`. Se o valor muda de `10` para `\"10\"`, o tipo observado também muda."
                    },
                    {
                      "id": "card-a01-01-fluxo-execucao",
                      "position": 6,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Execução em sequência",
                      "prompt": "Observe a ordem básica de execução de um script pequeno.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Iniciar execução"
                          },
                          {
                            "kind": "process",
                            "text": "Criar variável `nome`"
                          },
                          {
                            "kind": "process",
                            "text": "Criar variável `idade`"
                          },
                          {
                            "kind": "output",
                            "text": "Mostrar frase com `print()`"
                          },
                          {
                            "kind": "end",
                            "text": "Encerrar"
                          }
                        ]
                      },
                      "after": "A sequência mostra por que variáveis precisam ser criadas antes do uso. O Python não adivinha um valor que ainda não foi associado a um nome."
                    },
                    {
                      "id": "card-a01-01-erro-ordem-variavel",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Erro por ordem de execução",
                      "question": "Qual script evita usar uma variável antes de criá-la?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "print(nome)\nnome = \"Ana\""
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "nome = \"Ana\"\nprint(nome)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "print(\"nome\")\nnome = Ana"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "nome == \"Ana\"\nprint(nome)"
                        }
                      ],
                      "answer": "b",
                      "after": "A variável `nome` precisa receber valor com `=` antes de ser usada em `print(nome)`. `==` compara valores; não cria a variável."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a01-python-modo-linguagem-tipagem__v20260618-021923"
            },
            {
              "id": "micro-a01-print-variaveis-fstrings",
              "title": "Variáveis, `print()` e f-strings",
              "goal": "Criar variáveis, exibir valores e montar mensagens simples com f-strings.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-python-modo-linguagem-tipagem"
              ],
              "covers": [
                "variáveis",
                "atribuição",
                "`print()`",
                "texto literal",
                "f-string"
              ],
              "checks": [
                "usa `=` para atribuir",
                "distingue variável de texto entre aspas",
                "prevê saída de f-string",
                "explica que `print()` exibe"
              ],
              "errors": [
                "trocar `=` por `==`",
                "colocar variável entre aspas quando quer o valor",
                "achar que `print()` guarda resultado"
              ],
              "versions": [
                {
                  "id": "micro-a01-print-variaveis-fstrings__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Reforça criação de variáveis, saída com `print()` e uso inicial de f-strings.",
                  "cards": [
                    {
                      "id": "card-a01-02-variavel-atribuicao",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Variáveis e atribuição",
                      "text": "Uma variável é um nome usado para recuperar um valor depois. O operador `=` faz atribuição: ele coloca um valor sob um nome. Já `print()` apenas exibe algo na saída; exibir não é o mesmo que guardar.",
                      "after": "A regra central é ler `nome = \"Ana\"` como: o nome `nome` passa a se referir ao texto `\"Ana\"`."
                    },
                    {
                      "id": "card-a01-02-print-gap",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Mostrar mensagem",
                      "prompt": "Complete a função que exibe a mensagem na tela.",
                      "language": "python",
                      "code": "[[print::print|input|type]](\"Olá, turma!\")",
                      "after": "`print()` mostra o argumento na saída. `input()` pediria uma entrada; `type()` observaria o tipo de um valor."
                    },
                    {
                      "id": "card-a01-02-atribuicao-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Atribuir valor",
                      "prompt": "Complete a atribuição correta.",
                      "language": "python",
                      "code": "nome [[=::=|==|:]] \"Ana\"\nprint(nome)",
                      "after": "`=` atribui o texto `\"Ana\"` ao nome `nome`. `==` seria comparação e não guardaria o valor."
                    },
                    {
                      "id": "card-a01-02-valor-ou-nome",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Variável entre aspas",
                      "prompt": "Compare duas formas de chamar `print()`.",
                      "language": "python",
                      "code": "nome = \"Ana\"",
                      "after": "Sem aspas, `nome` é lido como variável. Com aspas, `\"nome\"` é apenas texto literal.",
                      "question": "Qual alternativa mostra o valor guardado na variável?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "print(nome)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "print(\"nome\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "print(input)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "print(type)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-02-fstring-gap",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Valor dentro da f-string",
                      "prompt": "Complete a f-string para usar a variável já criada.",
                      "language": "python",
                      "code": "nome = \"Carlos\"\nidade = 20\nprint(f\"O aluno {[[nome::nome|\"nome\"|idade]]} tem {idade} anos.\")",
                      "after": "Dentro de `{ }`, a f-string avalia uma expressão Python. `nome` usa o valor da variável; `\"nome\"` mostraria o texto fixo."
                    },
                    {
                      "id": "card-a01-02-prever-fstring",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Previsão de saída com f-string",
                      "prompt": "Leia o script completo.",
                      "language": "python",
                      "code": "nome = \"Carlos\"\nidade = 20\nprint(f\"{nome} tem {idade} anos.\")",
                      "after": "A f-string substitui `{nome}` por `Carlos` e `{idade}` por `20` no momento da execução.",
                      "question": "Qual é a saída exibida?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`Carlos tem 20 anos.`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`nome tem idade anos.`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`{nome} tem {idade} anos.`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`Carlos tem idade anos.`"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-02-print-nao-guarda",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Função de exibição",
                      "question": "Qual frase está correta sobre `print(media)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`print(media)` guarda o valor de `media` para uso posterior."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`print(media)` exibe o valor de `media` na saída."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`print(media)` converte `media` para número inteiro."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`print(media)` pede que o usuário digite a média."
                        }
                      ],
                      "answer": "b",
                      "after": "`print()` é uma função de saída: ela mostra algo. Guardar resultado exige atribuição, como `media = 8.5`."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a01-print-variaveis-fstrings__v20260618-021923"
            },
            {
              "id": "micro-a01-reforco-funcoes-nativas-chamada",
              "title": "Funções nativas, argumentos e resultado observável",
              "goal": "Entender a forma `funcao(argumento)` antes de usar `print()`, `input()`, `type()` e conversões.",
              "role": "support",
              "status": "generated",
              "dependsOn": [
                "micro-a01-print-variaveis-fstrings"
              ],
              "covers": [
                "função nativa",
                "chamada",
                "argumento",
                "parênteses",
                "retorno observável",
                "`print()`",
                "`type()`"
              ],
              "checks": [
                "distingue nome da função, parênteses e argumento",
                "explica que `print()` exibe na tela",
                "usa `type(valor)` para observar tipo"
              ],
              "errors": [
                "esquecer parênteses",
                "colocar nome de variável entre aspas quando quer o valor",
                "achar que `print()` guarda valor"
              ],
              "versions": [
                {
                  "id": "micro-a01-reforco-funcoes-nativas-chamada__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Adiciona microteoria explícita sobre chamada de função, argumento, parênteses e retorno observável.",
                  "cards": [
                    {
                      "id": "card-a01-03-funcao-nativa-gramatica",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Funções nativas e chamada",
                      "text": "Uma função nativa já vem disponível na linguagem. A forma geral é `funcao(argumento)`: o nome identifica a função, os parênteses fazem a chamada e o argumento é a informação entregue para a função trabalhar.",
                      "after": "A ponte mental é: parênteses indicam chamada. Sem parênteses, você normalmente só aponta para a função; com parênteses, você pede a execução."
                    },
                    {
                      "id": "card-a01-03-partes-chamada",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Partes de uma chamada",
                      "columns": [
                        "Chamada",
                        "Nome da função",
                        "Argumento",
                        "Resultado observável"
                      ],
                      "rows": [
                        [
                          "`print(\"Ana\")`",
                          "`print`",
                          "`\"Ana\"`",
                          "exibe `Ana`"
                        ],
                        [
                          "`type(idade)`",
                          "`type`",
                          "`idade`",
                          "devolve o tipo do valor"
                        ],
                        [
                          "`int(\"18\")`",
                          "`int`",
                          "`\"18\"`",
                          "devolve o número inteiro `18`"
                        ]
                      ],
                      "after": "A chamada usa parênteses em todos os casos, mas o efeito muda: algumas funções exibem, outras devolvem um valor que pode ser guardado."
                    },
                    {
                      "id": "card-a01-03-identificar-argumento",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identificar argumento",
                      "question": "Na chamada `type(temperatura)`, qual parte é o argumento?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`type`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`temperatura`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`()`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`=`"
                        }
                      ],
                      "answer": "b",
                      "after": "O argumento é a informação passada entre parênteses. Nesse caso, `temperatura` é o valor que `type()` vai observar."
                    },
                    {
                      "id": "card-a01-03-type-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Observar tipo",
                      "prompt": "Complete a chamada que devolve o tipo do valor.",
                      "language": "python",
                      "code": "temperatura = 27.5\ntipo = [[type::type|print|input]](temperatura)\nprint(tipo)",
                      "after": "`type(temperatura)` devolve o tipo do valor. `print(temperatura)` exibiria o valor, e `input(temperatura)` tentaria pedir uma entrada."
                    },
                    {
                      "id": "card-a01-03-guardar-tipo",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Exibir ou guardar",
                      "prompt": "Compare duas intenções diferentes.",
                      "language": "python",
                      "code": "valor = 18",
                      "after": "A linha que guarda o resultado usa atribuição. A linha com `print()` apenas mostra algo na saída.",
                      "question": "Qual alternativa guarda o tipo de `valor` na variável `tipo`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "tipo = type(valor)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "print(type(valor))"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "tipo == type(valor)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "input(type(valor))"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-03-parenteses",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Parênteses na chamada",
                      "prompt": "Compare versões de uma mesma intenção: mostrar uma mensagem.",
                      "language": "python",
                      "code": "# Objetivo: mostrar uma mensagem na tela.",
                      "after": "`print(\"Teste\")` chama a função. `print \"Teste\"` não é sintaxe válida em Python.",
                      "question": "Qual versão chama corretamente a função `print()`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "print(\"Teste\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "print \"Teste\""
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "print = \"Teste\""
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "\"Teste\"(print)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-03-retorno-observavel-gap",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Resultado reutilizável",
                      "text": "Quando a intenção é usar o resultado depois, a forma mais adequada é guardar o [[retorno::retorno|texto impresso|nome da função]] em uma variável.",
                      "after": "Funções como `type()`, `int()` e `float()` devolvem valores. `print()` exibe valores; exibir não torna o resultado reutilizável por si só."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a01-reforco-funcoes-nativas-chamada__v20260618-021923"
            },
            {
              "id": "micro-a01-operadores-comparacao-logicos",
              "title": "Comparação e lógica booleana",
              "goal": "Usar operadores de comparação e operadores lógicos para produzir decisões corretas.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-reforco-funcoes-nativas-chamada"
              ],
              "covers": [
                "comparação",
                "`True`",
                "`False`",
                "`=`",
                "`==`",
                "`!=`",
                "`>=`",
                "`and`",
                "`or`",
                "`not`"
              ],
              "checks": [
                "distingue `=` de `==`",
                "prevê resultado booleano",
                "combina condições com `and` e `or`"
              ],
              "errors": [
                "usar `=` dentro de condição",
                "trocar `and` por `or` sem intenção",
                "esperar número quando a comparação devolve booleano"
              ],
              "versions": [
                {
                  "id": "micro-a01-operadores-comparacao-logicos__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Amplia operadores de comparação com operadores lógicos básicos, conforme reforço solicitado.",
                  "cards": [
                    {
                      "id": "card-a01-04-comparacao-logica",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Comparações e operadores lógicos",
                      "text": "Comparações geram valores booleanos: `True` ou `False`. Operadores de comparação, como `>`, `<`, `==` e `!=`, testam uma relação. Operadores lógicos, como `and`, `or` e `not`, combinam ou invertem testes.",
                      "after": "Essa base é necessária para `if`, `while` e filtros com `for + if`."
                    },
                    {
                      "id": "card-a01-04-operadores",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Operadores essenciais",
                      "columns": [
                        "Operador",
                        "Uso",
                        "Exemplo"
                      ],
                      "rows": [
                        [
                          "`=`",
                          "atribui valor",
                          "`idade = 18`"
                        ],
                        [
                          "`==`",
                          "compara igualdade",
                          "`idade == 18`"
                        ],
                        [
                          "`!=`",
                          "compara diferença",
                          "`status != \"falha\"`"
                        ],
                        [
                          "`>=`",
                          "maior ou igual",
                          "`temperatura >= 75`"
                        ],
                        [
                          "`and`",
                          "ambas as condições precisam ser verdadeiras",
                          "`idade >= 18 and ativo`"
                        ],
                        [
                          "`or`",
                          "basta uma condição verdadeira",
                          "`status == \"alerta\" or status == \"falha\"`"
                        ],
                        [
                          "`not`",
                          "inverte um booleano",
                          "`not ativo`"
                        ]
                      ],
                      "after": "`=` é o principal ponto de erro: ele não pergunta se dois valores são iguais; ele atribui."
                    },
                    {
                      "id": "card-a01-04-comparacao-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Comparar idade",
                      "prompt": "Complete o operador para testar maioridade.",
                      "language": "python",
                      "code": "idade = 18\nif idade [[>=::>=|=>|=]] 18:\n    print(\"Maior de idade\")",
                      "after": "`>=` testa maior ou igual. `=>` não é operador Python, e `=` faria atribuição, não comparação."
                    },
                    {
                      "id": "card-a01-04-and-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Combinar condições",
                      "prompt": "Complete a condição para exigir as duas regras ao mesmo tempo.",
                      "language": "python",
                      "code": "temperatura = 80\nstatus = \"ligada\"\n\nif temperatura >= 75 [[and::and|or|not]] status == \"ligada\":\n    print(\"Atenção com máquina ligada\")",
                      "after": "`and` exige que as duas comparações sejam verdadeiras: temperatura suficiente e status igual a `\"ligada\"`."
                    },
                    {
                      "id": "card-a01-04-previsao-logica",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Previsão booleana",
                      "prompt": "Leia o script.",
                      "language": "python",
                      "code": "temperatura = 80\nstatus = \"ligada\"\nprint(temperatura >= 75 and status == \"ligada\")",
                      "after": "A primeira comparação é verdadeira e a segunda também. Com `and`, o resultado final é verdadeiro.",
                      "question": "Qual valor será exibido?",
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
                          "text": "`80`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`ligada`"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-04-igualdade-vs-atribuicao",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Erro de comparação",
                      "prompt": "Compare versões completas de uma condição.",
                      "language": "python",
                      "code": "# Objetivo: testar se a senha digitada é igual a \"abc\".",
                      "after": "Dentro de uma condição, a igualdade é testada com `==`. O operador `=` atribui valor e não deve aparecer como teste.",
                      "question": "Qual versão usa comparação de igualdade corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "senha = \"abc\"\nif senha == \"abc\":\n    print(\"Acesso liberado\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "senha = \"abc\"\nif senha = \"abc\":\n    print(\"Acesso liberado\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "senha == \"abc\"\nif senha:\n    print(\"Acesso liberado\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "senha = \"abc\"\nif senha != \"abc\":\n    print(\"Acesso liberado\")"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-04-fluxo-condicao-logica",
                      "position": 7,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Decisão com condição lógica",
                      "prompt": "Observe a decisão quando duas regras precisam ser verdadeiras.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Ler `temperatura` e `status`"
                          },
                          {
                            "kind": "if_then_else",
                            "condition": "`temperatura >= 75 and status == \"ligada\"`?",
                            "thenBranch": [
                              {
                                "kind": "output",
                                "text": "Mostrar alerta"
                              }
                            ],
                            "elseBranch": [
                              {
                                "kind": "output",
                                "text": "Não mostrar alerta"
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Encerrar"
                          }
                        ]
                      },
                      "after": "O fluxo deixa claro que `and` torna a decisão mais restrita: os dois testes precisam passar para o caminho verdadeiro."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a01-operadores-comparacao-logicos__v20260618-021923"
            },
            {
              "id": "micro-a01-condicionais-indentacao",
              "title": "Condicionais e blocos indentados",
              "goal": "Usar `if`, `elif` e `else` com indentação correta e previsão de caminho executado.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-operadores-comparacao-logicos"
              ],
              "covers": [
                "`if`",
                "`elif`",
                "`else`",
                "indentação",
                "dois pontos",
                "cadeia de condições"
              ],
              "checks": [
                "identifica bloco indentado",
                "usa `else` sem condição",
                "prevê saída de `elif`",
                "detecta falta de `:`"
              ],
              "errors": [
                "esquecer `:`",
                "tirar indentação do bloco",
                "usar `else` com condição",
                "esperar que todos os `elif` executem"
              ],
              "versions": [
                {
                  "id": "micro-a01-condicionais-indentacao__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Reforça condicionais com foco em sintaxe, indentação e previsão de saída.",
                  "cards": [
                    {
                      "id": "card-a01-05-if-indentacao",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Condicionais e indentação",
                      "text": "`if` pode ser entendido como “se”. Ele abre um bloco que só executa quando a condição é verdadeira. Em Python, a indentação define o que pertence ao bloco; por isso, a linha dentro do `if`, do `elif` ou do `else` precisa ficar recuada.",
                      "after": "A indentação não é apenas aparência. Ela faz parte da sintaxe de Python e muda a estrutura do programa."
                    },
                    {
                      "id": "card-a01-05-fluxo-if-else",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Dois caminhos com `if` e `else`",
                      "prompt": "Observe a estrutura de decisão com duas possibilidades.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Ler `idade`"
                          },
                          {
                            "kind": "if_then_else",
                            "condition": "`idade >= 18`?",
                            "thenBranch": [
                              {
                                "kind": "output",
                                "text": "Maior de idade"
                              }
                            ],
                            "elseBranch": [
                              {
                                "kind": "output",
                                "text": "Menor de idade"
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Encerrar"
                          }
                        ]
                      },
                      "after": "`if_then_else` separa o caminho verdadeiro do caminho falso. Em código, essa separação aparece pela condição e pela indentação dos blocos."
                    },
                    {
                      "id": "card-a01-05-if-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Abrir uma decisão",
                      "prompt": "Complete a palavra que inicia a condição.",
                      "language": "python",
                      "code": "temperatura = 92\n\n[[if::if|for|while]] temperatura >= 90:\n    print(\"Alerta crítico\")",
                      "after": "`if` inicia uma decisão. `for` e `while` iniciam repetições, não uma decisão isolada."
                    },
                    {
                      "id": "card-a01-05-indentacao-choice",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Indentação correta",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Objetivo: mostrar alerta apenas quando a temperatura for alta.",
                      "after": "A linha do `print()` precisa estar recuada para pertencer ao bloco do `if`.",
                      "question": "Qual alternativa preserva o bloco dependente da condição?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 91\nif temperatura >= 90:\n    print(\"Alerta crítico\")"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "O `print(\"Alerta crítico\")` fica fora do bloco do `if` por falta de indentação."
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 91\nif temperatura >= 90\n    print(\"Alerta crítico\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = 91\nif temperatura = 90:\n    print(\"Alerta crítico\")"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-05-elif-previsao",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Previsão com `elif`",
                      "prompt": "Leia a cadeia de condições.",
                      "language": "python",
                      "code": "nota = 7\n\nif nota >= 9:\n    print(\"Excelente\")\nelif nota >= 7:\n    print(\"Bom\")\nelif nota >= 5:\n    print(\"Regular\")\nelse:\n    print(\"Precisa melhorar\")",
                      "after": "O Python testa de cima para baixo. Como `nota >= 7` é verdadeiro, a saída é `Bom` e os testes seguintes não são executados.",
                      "question": "Qual mensagem será exibida?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`Excelente`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`Bom`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`Regular`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`Precisa melhorar`"
                        }
                      ],
                      "answer": "b"
                    },
                    {
                      "id": "card-a01-05-else-gap",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Caso contrário",
                      "prompt": "Complete a estrutura para tratar o caso falso.",
                      "language": "python",
                      "code": "idade = 16\n\nif idade >= 18:\n    print(\"Maior de idade\")\n[[else::else|elif|if]]:\n    print(\"Menor de idade\")",
                      "after": "`else` não recebe condição: ele cobre o caso contrário ao `if`."
                    },
                    {
                      "id": "card-a01-05-erro-dois-pontos",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Erro provável de sintaxe",
                      "question": "Qual linha está pronta para abrir um bloco condicional em Python?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`if idade >= 18:`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`if idade >= 18`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`if idade = 18:`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`elif:`"
                        }
                      ],
                      "answer": "a",
                      "after": "A condição precisa terminar com `:`. Além disso, comparação de igualdade usaria `==`, não `=`."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a01-condicionais-indentacao__v20260618-021923"
            },
            {
              "id": "micro-a01-reforco-conversoes-entrada",
              "title": "Entrada, conversão e tipo do valor",
              "goal": "Consolidar que `input()` devolve texto e que `int()`, `float()` e `str()` transformam valores.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-condicionais-indentacao"
              ],
              "covers": [
                "`input()`",
                "`int()`",
                "`float()`",
                "`str()`",
                "`type()`",
                "erro de somar texto com número"
              ],
              "checks": [
                "escolhe conversão adequada",
                "prevê tipo antes e depois da conversão",
                "corrige comparação texto/número"
              ],
              "errors": [
                "usar `int()` para entrada decimal textual como `\"78.5\"`",
                "comparar texto com número",
                "esquecer conversão"
              ],
              "versions": [
                {
                  "id": "micro-a01-reforco-conversoes-entrada__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Consolida entrada de dados, conversões e erros comuns de tipo.",
                  "cards": [
                    {
                      "id": "card-a01-06-input-texto",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Entrada, texto e conversão",
                      "text": "`input()` pede uma informação ao usuário e devolve texto, mesmo quando a pessoa digita números. Para fazer conta ou comparação numérica, converta com `int()` ou `float()`. Use `str()` quando precisar transformar um valor em texto.",
                      "after": "A regra prática é: entrada vem como `str`; conta numérica exige conversão antes."
                    },
                    {
                      "id": "card-a01-06-conversoes",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Conversões comuns",
                      "columns": [
                        "Função",
                        "Uso",
                        "Exemplo de resultado"
                      ],
                      "rows": [
                        [
                          "`int()`",
                          "converter texto numérico sem parte decimal para inteiro",
                          "`int(\"18\")` devolve `18`"
                        ],
                        [
                          "`float()`",
                          "converter texto numérico com ou sem parte decimal para decimal",
                          "`float(\"78.5\")` devolve `78.5`"
                        ],
                        [
                          "`str()`",
                          "converter valor para texto",
                          "`str(18)` devolve `\"18\"`"
                        ],
                        [
                          "`type()`",
                          "observar tipo",
                          "`type(18)` devolve `<class 'int'>`"
                        ]
                      ],
                      "after": "`int(\"78.5\")` não é adequado porque `\"78.5\"` representa decimal. Para esse caso, use `float()`."
                    },
                    {
                      "id": "card-a01-06-int-input-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Converter idade",
                      "prompt": "Complete a conversão para fazer conta com idade inteira.",
                      "language": "python",
                      "code": "idade = [[int::int|str|print]](input(\"Digite sua idade: \"))\nprint(idade + 1)",
                      "after": "`int()` transforma o texto digitado em número inteiro. `str()` manteria texto, e `print()` apenas exibiria."
                    },
                    {
                      "id": "card-a01-06-float-input-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Converter temperatura decimal",
                      "prompt": "Complete a conversão adequada para aceitar valor como `78.5`.",
                      "language": "python",
                      "code": "temperatura = [[float::float|int|str]](input(\"Digite a temperatura: \"))\nprint(temperatura >= 75)",
                      "after": "`float()` aceita valores decimais como `\"78.5\"`. `int()` falharia nesse texto decimal."
                    },
                    {
                      "id": "card-a01-06-prever-tipos-input",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Tipo antes e depois da conversão",
                      "prompt": "Considere que o usuário digitou `78.5`.",
                      "language": "python",
                      "code": "entrada = input(\"Digite a temperatura: \")\ntemperatura = float(entrada)\nprint(type(entrada))\nprint(type(temperatura))",
                      "after": "`input()` devolve `str`. Depois de `float(entrada)`, o valor convertido passa a ser `float`.",
                      "question": "Qual sequência de tipos será exibida?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`<class 'str'>` e depois `<class 'float'>`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`<class 'float'>` e depois `<class 'str'>`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`<class 'int'>` e depois `<class 'float'>`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`<class 'str'>` duas vezes"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-06-comparacao-numerica-input",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Comparar número digitado",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "# Objetivo: pedir temperatura e comparar com 80.",
                      "after": "A comparação com `80` deve ocorrer depois da conversão numérica. Sem conversão, o valor digitado ainda é texto.",
                      "question": "Qual alternativa compara a temperatura como número?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = float(input(\"Digite a temperatura: \"))\nif temperatura > 80:\n    print(\"Temperatura alta\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = input(\"Digite a temperatura: \")\nif temperatura > 80:\n    print(\"Temperatura alta\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = print(input(\"Digite a temperatura: \"))\nif temperatura > 80:\n    print(\"Temperatura alta\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "temperatura = str(input(\"Digite a temperatura: \"))\nif temperatura > 80:\n    print(\"Temperatura alta\")"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-06-erro-soma-texto",
                      "position": 7,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Texto não soma com número",
                      "text": "Quando `idade_texto = input(\"Idade: \")`, a expressão `idade_texto + 1` falha porque `idade_texto` ainda é [[texto::texto|inteiro|booleano]].",
                      "after": "`input()` devolve `str`. Para somar `1`, use `idade = int(idade_texto)` antes da conta."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a01-reforco-conversoes-entrada__v20260618-021923"
            },
            {
              "id": "micro-a01-repeticao-while-for-range",
              "title": "Repetição com `while`, `for` e `range()`",
              "goal": "Usar laços simples, prever sequências de `range()` e manter indentação correta.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a01-reforco-conversoes-entrada"
              ],
              "covers": [
                "`while`",
                "`for`",
                "`range()`",
                "contador",
                "laço infinito",
                "indentação"
              ],
              "checks": [
                "atualiza contador",
                "prevê sequência de `range()`",
                "distingue `while` e `for`",
                "mantém bloco indentado"
              ],
              "errors": [
                "esquecer atualização do contador",
                "incluir limite superior de `range()` por engano",
                "tirar indentação do corpo do laço"
              ],
              "versions": [
                {
                  "id": "micro-a01-repeticao-while-for-range__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Reforça estruturas de repetição com foco sintático e previsão de saída.",
                  "cards": [
                    {
                      "id": "card-a01-07-while-for-range",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Repetição com `while`, `for` e `range()`",
                      "text": "`while` repete enquanto uma condição for verdadeira. `for` percorre uma sequência. `range()` gera uma sequência de números inteiros para o `for`, muito útil quando a repetição tem quantidade previsível.",
                      "after": "Use `while` quando a parada depende de uma condição que muda. Use `for` quando já existe uma sequência a percorrer."
                    },
                    {
                      "id": "card-a01-07-fluxo-while",
                      "position": 2,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fluxo de `while`",
                      "prompt": "Observe o papel do contador.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "`contador = 1`"
                          },
                          {
                            "kind": "while",
                            "condition": "`contador <= 5`?",
                            "body": [
                              {
                                "kind": "output",
                                "text": "Mostrar `contador`"
                              },
                              {
                                "kind": "process",
                                "text": "Somar `1` ao contador"
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Parar quando a condição ficar falsa"
                          }
                        ]
                      },
                      "after": "Sem atualizar o contador dentro do corpo, a condição pode continuar verdadeira para sempre."
                    },
                    {
                      "id": "card-a01-07-update-contador",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Atualizar contador",
                      "prompt": "Complete a atualização que evita repetição infinita.",
                      "language": "python",
                      "code": "contador = 1\n\nwhile contador <= 5:\n    print(contador)\n    contador = contador [[+::+|-|==]] 1",
                      "after": "Somar `1` faz o contador avançar até a condição ficar falsa. `==` compararia e não atualizaria o valor."
                    },
                    {
                      "id": "card-a01-07-range-previsao",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Previsão com `range()`",
                      "prompt": "Leia o laço.",
                      "language": "python",
                      "code": "for numero in range(3):\n    print(numero)",
                      "after": "`range(3)` gera `0`, `1` e `2`. O limite superior não entra na sequência.",
                      "question": "Qual sequência será exibida?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`0`, `1`, `2`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`1`, `2`, `3`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`0`, `1`, `2`, `3`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`3`, `2`, `1`"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-07-range-1-5",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Contar de 1 a 5",
                      "prompt": "Complete a chamada de `range()` para mostrar `1`, `2`, `3`, `4`, `5`.",
                      "language": "python",
                      "code": "for numero in [[range(1, 6)::range(1, 6)|range(1, 5)|range(6)]]:\n    print(numero)",
                      "after": "`range(1, 6)` começa em `1` e para antes de `6`, então o último valor exibido é `5`."
                    },
                    {
                      "id": "card-a01-07-for-indentacao",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Bloco do `for`",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "# Objetivo: mostrar três registros.",
                      "after": "A linha que será repetida precisa estar indentada dentro do `for`.",
                      "question": "Qual alternativa usa indentação correta no laço?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "for numero in range(3):\n    print(f\"Registro {numero}\")"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "O `print(f\"Registro {numero}\")` fica fora do bloco do `for` por falta de indentação."
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "for numero in range(3)\n    print(f\"Registro {numero}\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "for numero = range(3):\n    print(numero)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-07-while-ou-for",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolher estrutura de repetição",
                      "question": "Qual estrutura é mais direta para mostrar os números de `1` a `10` uma única vez?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`for numero in range(1, 11):`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`if numero in range(1, 11):`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`print(range)`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`input(range(10))`"
                        }
                      ],
                      "answer": "a",
                      "after": "`for` percorre a sequência gerada por `range(1, 11)`. Essa é a forma direta quando a quantidade de repetições já é conhecida."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a01-repeticao-while-for-range__v20260618-021923"
            },
            {
              "id": "micro-a01-listas-for-if-mini-desafio",
              "title": "Listas simples com `for + if`",
              "goal": "Percorrer listas simples, comparar o item atual e montar um script final de classificação.",
              "role": "review",
              "status": "generated",
              "dependsOn": [
                "micro-a01-repeticao-while-for-range"
              ],
              "covers": [
                "listas simples",
                "índice `0`",
                "índice `-1`",
                "`for + if`",
                "item atual",
                "classificação simples"
              ],
              "checks": [
                "acessa primeiro e último item",
                "usa variável do laço na comparação",
                "classifica valores com `if`, `elif` e `else`"
              ],
              "errors": [
                "comparar lista inteira com número",
                "trocar nome da lista pelo item atual",
                "desalinhar `if` dentro do `for`"
              ],
              "versions": [
                {
                  "id": "micro-a01-listas-for-if-mini-desafio__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Consolida listas simples, item atual no laço e mini desafio de classificação.",
                  "cards": [
                    {
                      "id": "card-a01-08-lista-basica-for-if",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Lista, item atual e filtro",
                      "text": "Uma lista guarda vários valores em ordem. No `for`, a variável do laço recebe um item por vez. Ao combinar `for + if`, a comparação deve usar o item atual, não a lista inteira.",
                      "after": "Essa regra evita o erro comum de comparar `temperaturas >= 90` quando a intenção é comparar cada `temperatura`."
                    },
                    {
                      "id": "card-a01-08-lista-teoria",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Criar e percorrer lista",
                      "prompt": "Observe uma lista simples de temperaturas.",
                      "language": "python",
                      "code": "temperaturas = [68, 72, 91]\n\nfor temperatura in temperaturas:\n    print(temperatura)",
                      "after": "A variável `temperatura` recebe `68`, depois `72`, depois `91`. A lista inteira permanece em `temperaturas`."
                    },
                    {
                      "id": "card-a01-08-indice-zero",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Acessar primeiro valor",
                      "prompt": "Complete o índice que acessa o primeiro item.",
                      "language": "python",
                      "code": "temperaturas = [68, 72, 91]\nprimeira = temperaturas[ [[0::0|1|-1]] ]\nprint(primeira)",
                      "after": "Em Python, o primeiro índice é `0`. O índice `-1` acessaria o último item."
                    },
                    {
                      "id": "card-a01-08-for-if-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Filtrar temperaturas",
                      "prompt": "Complete o nome correto na condição.",
                      "language": "python",
                      "code": "temperaturas = [68, 72, 91]\n\nfor temperatura in temperaturas:\n    if [[temperatura::temperatura|temperaturas|range]] >= 90:\n        print(\"Alerta crítico\")",
                      "after": "A comparação deve usar `temperatura`, o item atual do laço. `temperaturas` é a lista inteira."
                    },
                    {
                      "id": "card-a01-08-bug-lista-inteira",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Depurar comparação no laço",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "# Objetivo: mostrar apenas produções maiores ou iguais a 120.",
                      "after": "Dentro do `for`, a variável `producao` representa um valor da lista por vez. A lista completa fica em `producoes`.",
                      "question": "Qual alternativa usa o item atual na comparação?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [120, 85, 140]\nfor producao in producoes:\n    if producao >= 120:\n        print(producao)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [120, 85, 140]\nfor producao in producoes:\n    if producoes >= 120:\n        print(producao)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [120, 85, 140]\nif producao >= 120:\n    for producao in producoes:\n        print(producao)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [120, 85, 140]\nfor producoes in producao:\n    if producao >= 120:\n        print(producao)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a01-08-mini-desafio-gap",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Classificar temperaturas",
                      "prompt": "Complete a condição de alerta crítico.",
                      "language": "python",
                      "code": "temperaturas_maquinas = [65, 72, 81, 93]\n\nfor temperatura in temperaturas_maquinas:\n    if temperatura [[>=::>=|=|<=]] 90:\n        print(f\"{temperatura}°C -> Alerta crítico\")\n    elif temperatura >= 75:\n        print(f\"{temperatura}°C -> Atenção\")\n    else:\n        print(f\"{temperatura}°C -> Normal\")",
                      "after": "`>= 90` classifica como alerta crítico valores iguais ou superiores a `90`. `=` não compara; `<=` inverteria a regra."
                    },
                    {
                      "id": "card-a01-08-mini-desafio-escolha",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Script final da aula 1",
                      "prompt": "Compare scripts completos para classificar medições.",
                      "language": "python",
                      "code": "# Objetivo: percorrer temperaturas e mostrar classificação simples.",
                      "after": "O script correto percorre cada item, usa `if`, `elif` e `else` dentro do `for` e mantém a indentação.",
                      "question": "Qual script atende ao objetivo?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = [68, 82, 94]\nfor temperatura in temperaturas:\n    if temperatura >= 90:\n        print(\"Alerta crítico\")\n    elif temperatura >= 75:\n        print(\"Atenção\")\n    else:\n        print(\"Normal\")"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "O `if` fica fora do corpo do `for`, então a classificação não acontece item a item."
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = [68, 82, 94]\nif temperaturas >= 90:\n    print(\"Alerta crítico\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = [68, 82, 94]\nfor temperatura in temperaturas:\n    print(input(temperatura))"
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
              "activeVersion": "micro-a01-listas-for-if-mini-desafio__v20260618-021923"
            }
          ]
        }
      ]
    },
    {
      "id": "module-aula-02-estruturas-dados-python",
      "title": "Aula 2 — Estruturas de dados e funções",
      "guide": {
        "goal": "Desenvolver autonomia para usar coleções, funções nativas, métodos, laços e funções próprias em pequenos scripts de análise de dados.",
        "include": [
          "listas",
          "índice `0`",
          "índice `-1`",
          "alteração por índice",
          "`append()`",
          "`remove()`",
          "`pop()` em lista",
          "`pop()` em dicionário",
          "`len()`",
          "`sum()`",
          "`min()`",
          "`max()`",
          "tuplas",
          "dicionários",
          "chave e valor",
          "`.items()`",
          "conjuntos",
          "`set()`",
          "`add()`",
          "função nativa versus método",
          "`def`",
          "parâmetro",
          "argumento",
          "chamada de função",
          "`print()`",
          "`return` simples",
          "função com coleção",
          "`for + if`"
        ],
        "exclude": [
          "NumPy",
          "Pandas",
          "Matplotlib",
          "Scikit-learn",
          "arquivos",
          "exceções",
          "classes",
          "lambda",
          "compreensão de listas",
          "compreensão de dicionários",
          "*args",
          "**kwargs",
          "argumentos opcionais",
          "escopo avançado",
          "recursão",
          "algoritmos de ordenação",
          "retorno complexo",
          "regras industriais complexas"
        ],
        "notation": [
          "Usar lacunas somente nos campos de texto ou código definidos pela especificação.",
          "Preservar indentação Python em todos os blocos de código.",
          "Usar alternativas de código estruturadas em exercícios de escolha."
        ],
        "avoid": [
          "Exemplos com lógica longa",
          "Retornos complexos",
          "Conceitos fora do escopo da aula"
        ]
      },
      "lessons": [
        {
          "id": "lesson-aula-02-colecoes-funcoes",
          "title": "Aula 2 — Coleções e funções em Python",
          "guide": {
            "goal": "Desenvolver autonomia para criar, modificar, percorrer e escolher listas, tuplas, dicionários e conjuntos, além de declarar e usar funções com parâmetro, argumento e retorno simples.",
            "include": [
              "listas",
              "índice `0`",
              "índice `-1`",
              "alteração por índice",
              "`append()`",
              "`remove()`",
              "`pop()` em lista",
              "`pop()` em dicionário",
              "`len()`",
              "`sum()`",
              "`min()`",
              "`max()`",
              "tuplas",
              "dicionários",
              "chave e valor",
              "`.items()`",
              "conjuntos",
              "`set()`",
              "`add()`",
              "função nativa versus método",
              "`def`",
              "parâmetro",
              "argumento",
              "chamada de função",
              "`print()`",
              "`return` simples",
              "função com coleção",
              "`for + if`"
            ],
            "exclude": [
              "NumPy",
              "Pandas",
              "Matplotlib",
              "Scikit-learn",
              "arquivos",
              "exceções",
              "classes",
              "lambda",
              "compreensão de listas",
              "compreensão de dicionários",
              "*args",
              "**kwargs",
              "argumentos opcionais",
              "escopo avançado",
              "recursão",
              "algoritmos de ordenação",
              "retorno complexo",
              "regras industriais complexas"
            ],
            "notation": [
              "Usar lacunas somente nos campos de texto ou código definidos pela especificação.",
              "Preservar indentação Python em todos os blocos de código.",
              "Usar alternativas de código estruturadas em exercícios de escolha."
            ],
            "avoid": [
              "Exemplos com lógica longa",
              "Retornos complexos",
              "Conceitos fora do escopo da aula"
            ]
          },
          "topics": [
            {
              "id": "topic-a02-vocabulario-chamada",
              "label": "Função, método e argumento",
              "kind": "concept",
              "checks": [
                "distingue chamada de função e método"
              ],
              "errors": [
                "usar método sem ponto ou sem parênteses"
              ]
            },
            {
              "id": "topic-a02-listas",
              "label": "Listas",
              "kind": "skill",
              "checks": [
                "cria, acessa, altera, adiciona e remove"
              ],
              "errors": [
                "confundir índice e valor"
              ]
            },
            {
              "id": "topic-a02-tuplas-sets",
              "label": "Tuplas e conjuntos",
              "kind": "concept",
              "checks": [
                "distingue imutabilidade e unicidade"
              ],
              "errors": [
                "usar `append()` em conjunto"
              ]
            },
            {
              "id": "topic-a02-dicionarios",
              "label": "Dicionários",
              "kind": "skill",
              "checks": [
                "usa chave, valor e `.items()`"
              ],
              "errors": [
                "usar índice numérico em dicionário"
              ]
            },
            {
              "id": "topic-a02-nativas",
              "label": "Funções nativas em coleções",
              "kind": "skill",
              "checks": [
                "calcula quantidade, soma, mínimo, máximo e média"
              ],
              "errors": [
                "usar `print()` como cálculo reutilizável"
              ]
            },
            {
              "id": "topic-a02-for-colecoes",
              "label": "`for` em coleções",
              "kind": "skill",
              "checks": [
                "percorre cada estrutura corretamente"
              ],
              "errors": [
                "comparar coleção inteira com número"
              ]
            },
            {
              "id": "topic-a02-funcoes",
              "label": "Funções",
              "kind": "skill",
              "checks": [
                "define, chama, usa parâmetro, argumento e retorno"
              ],
              "errors": [
                "trocar `print()` por `return`"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-a02-00-vocabulario-funcao-metodo-argumento",
              "title": "Ler chamadas: função, método e argumento",
              "goal": "Construir a gramática mental para ler `len(lista)`, `lista.append(85)` e `maquina.items()`.",
              "role": "support",
              "status": "generated",
              "dependsOn": [],
              "covers": [
                "função nativa",
                "método",
                "objeto",
                "ponto",
                "parênteses",
                "argumento",
                "retorno",
                "efeito na coleção"
              ],
              "checks": [
                "distingue `len(temperaturas)` de `temperaturas.append(85)`",
                "identifica argumento em `append(85)`",
                "explica que `len()` devolve tamanho e `append()` modifica a lista"
              ],
              "errors": [
                "escrever `append(temperaturas, 85)`",
                "chamar método sem parênteses",
                "achar que todo comando apenas mostra algo"
              ],
              "versions": [
                {
                  "id": "micro-a02-00-vocabulario-funcao-metodo-argumento__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Introduz função nativa, método, objeto, argumento, retorno e efeito em coleções.",
                  "cards": [
                    {
                      "id": "card-a02-00-gramatica-chamada",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Ler chamadas em coleções",
                      "text": "Em Python, uma função nativa é chamada pelo nome, como `len(lista)`. Um método é uma função ligada a um objeto e chamada com ponto, como `lista.append(85)`. O objeto vem antes do ponto; os parênteses fazem a chamada; o argumento fica entre parênteses quando a chamada precisa de informação.",
                      "after": "Essa gramática ajuda a ler coleções: `len(temperaturas)` mede; `temperaturas.append(85)` altera a própria lista."
                    },
                    {
                      "id": "card-a02-00-funcao-metodo-comparacao",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Função nativa ou método",
                      "columns": [
                        "Chamada",
                        "Como ler",
                        "O que acontece"
                      ],
                      "rows": [
                        [
                          "`len(temperaturas)`",
                          "função nativa recebendo a lista como argumento",
                          "devolve a quantidade de itens"
                        ],
                        [
                          "`temperaturas.append(85)`",
                          "método chamado a partir da lista `temperaturas`",
                          "adiciona `85` ao final da lista"
                        ],
                        [
                          "`maquina.items()`",
                          "método chamado a partir do dicionário `maquina`",
                          "permite percorrer pares de chave e valor"
                        ]
                      ],
                      "after": "A posição do ponto é o sinal visual do método. Em `temperaturas.append(85)`, a lista é o objeto que recebe a ação."
                    },
                    {
                      "id": "card-a02-00-len-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Medir lista",
                      "prompt": "Complete a função nativa que devolve a quantidade de itens.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80]\nquantidade = [[len::len|append|print]](temperaturas)\nprint(quantidade)",
                      "after": "`len(temperaturas)` devolve `3`. `append` não é chamada assim, e `print(temperaturas)` exibiria a lista sem calcular quantidade."
                    },
                    {
                      "id": "card-a02-00-append-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicionar com método",
                      "prompt": "Complete o método chamado a partir da lista.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80]\ntemperaturas.[[append::append|len|items]](85)\nprint(temperaturas)",
                      "after": "`append(85)` é método de lista: ele adiciona o argumento `85` ao final do objeto `temperaturas`."
                    },
                    {
                      "id": "card-a02-00-argumento-append",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Argumento em método",
                      "question": "Na chamada `temperaturas.append(85)`, qual parte é o argumento passado para o método?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`temperaturas`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`append`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`85`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`.`"
                        }
                      ],
                      "answer": "c",
                      "after": "O argumento é a informação dentro dos parênteses. Aqui, `85` é o valor que será adicionado à lista."
                    },
                    {
                      "id": "card-a02-00-efeito-retorno",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Medir ou modificar",
                      "question": "Qual alternativa diferencia corretamente `len(temperaturas)` e `temperaturas.append(85)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`len(temperaturas)` modifica a lista; `append(85)` devolve a quantidade."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`len(temperaturas)` devolve a quantidade; `append(85)` modifica a lista."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "As duas chamadas apenas mostram valores na tela."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "As duas chamadas exigem que a lista esteja entre aspas."
                        }
                      ],
                      "answer": "b",
                      "after": "`len()` calcula e devolve um valor. `append()` altera a lista existente ao inserir um novo item."
                    },
                    {
                      "id": "card-a02-00-sintaxe-metodo",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Sintaxe de método",
                      "prompt": "Compare formas de adicionar `85` à lista.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80]",
                      "after": "Método de lista é chamado com ponto a partir do objeto: `temperaturas.append(85)`.",
                      "question": "Qual alternativa usa a sintaxe correta?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas.append(85)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "append(temperaturas, 85)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas.append = 85"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas.items(85)"
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
              "activeVersion": "micro-a02-00-vocabulario-funcao-metodo-argumento__v20260618-021923"
            },
            {
              "id": "micro-a02-listas-operacoes-basicas",
              "title": "Listas: criar, acessar e modificar",
              "goal": "Criar listas, acessar por índice e praticar `append()`, `remove()` e `pop()` com foco sintático.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-00-vocabulario-funcao-metodo-argumento"
              ],
              "covers": [
                "listas",
                "índice `0`",
                "índice `-1`",
                "alteração por índice",
                "`append()`",
                "`remove()`",
                "`pop()`"
              ],
              "checks": [
                "cria lista com colchetes",
                "acessa primeiro e último valor",
                "altera item por índice",
                "adiciona, remove e usa `pop()` corretamente"
              ],
              "errors": [
                "contar índice a partir de `1`",
                "usar `remove()` com índice",
                "usar `pop()` como se recebesse valor"
              ],
              "versions": [
                {
                  "id": "micro-a02-listas-operacoes-basicas__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Amplia a prática de listas com criação, acesso, alteração, adição e remoção.",
                  "cards": [
                    {
                      "id": "card-a02-01-lista-mutavel",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Listas: ordem, índice e mutabilidade",
                      "text": "Uma lista guarda vários itens em ordem, usa colchetes e pode ser modificada. O primeiro índice é `0`; o último item pode ser acessado com `-1`. Por ser mutável, a lista permite alterar, adicionar e remover itens.",
                      "after": "Use lista quando a ordem importa e os dados podem mudar durante o programa."
                    },
                    {
                      "id": "card-a02-01-criar-lista",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Criar e mostrar lista",
                      "prompt": "Observe uma lista com cinco temperaturas.",
                      "language": "python",
                      "code": "temperaturas = [70, 72, 75, 80, 83]\nprint(temperaturas)",
                      "after": "Os colchetes indicam lista. Os valores ficam separados por vírgula e preservam a ordem."
                    },
                    {
                      "id": "card-a02-01-primeiro-ultimo-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Primeiro e último item",
                      "prompt": "Complete os índices corretos.",
                      "language": "python",
                      "code": "temperaturas = [70, 72, 75, 80, 83]\nprimeira = temperaturas[ [[0::0|1|-2]] ]\nultima = temperaturas[ [[-1::-1|0|5]] ]\nprint(primeira, ultima)",
                      "after": "`0` acessa o primeiro item. `-1` acessa o último item sem precisar contar o tamanho da lista."
                    },
                    {
                      "id": "card-a02-01-alterar-item",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Modificar por índice",
                      "prompt": "Complete o índice para alterar o segundo valor.",
                      "language": "python",
                      "code": "temperaturas = [70, 72, 75]\ntemperaturas[ [[1::1|2|-1]] ] = 74\nprint(temperaturas)",
                      "after": "O segundo item tem índice `1`, porque a contagem começa em `0`."
                    },
                    {
                      "id": "card-a02-01-append-remove",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicionar no final",
                      "prompt": "Complete o método que adiciona um novo valor ao final.",
                      "language": "python",
                      "code": "temperaturas = [70, 72, 75]\ntemperaturas.[[append::append|remove|pop]](80)\nprint(temperaturas)",
                      "after": "`append(80)` adiciona `80` ao final da lista. `remove(80)` tentaria remover esse valor, e `pop()` removeria por posição."
                    },
                    {
                      "id": "card-a02-01-remove-valor",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Remover por valor",
                      "prompt": "Complete o método que remove o valor informado.",
                      "language": "python",
                      "code": "temperaturas = [70, 72, 75, 80]\ntemperaturas.[[remove::remove|append|items]](72)\nprint(temperaturas)",
                      "after": "`remove(72)` remove o valor `72` da lista. Ele não recebe índice; recebe o valor a procurar."
                    },
                    {
                      "id": "card-a02-01-pop-indice",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "`pop()` em lista",
                      "prompt": "Complete o método que remove e devolve o item de índice `0`.",
                      "language": "python",
                      "code": "temperaturas = [70, 72, 75]\nremovida = temperaturas.[[pop::pop|remove|append]](0)\nprint(removida)\nprint(temperaturas)",
                      "after": "Em lista, `pop(0)` usa índice. Ele remove e devolve o primeiro item."
                    },
                    {
                      "id": "card-a02-01-pop-lista-particularidade",
                      "position": 8,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Particularidade de `pop()` em lista",
                      "question": "Em uma lista, o que significa `temperaturas.pop(1)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Remover o valor `1`, onde quer que ele esteja."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Remover e devolver o item que está no índice `1`."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Adicionar `1` ao final da lista."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Percorrer todos os itens da lista."
                        }
                      ],
                      "answer": "b",
                      "after": "Na lista, o argumento de `pop()` é o índice. Para remover por valor, use `remove(valor)`."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a02-listas-operacoes-basicas__v20260618-021923"
            },
            {
              "id": "micro-a02-tuplas-sets",
              "title": "Tuplas e conjuntos",
              "goal": "Distinguir tuplas e conjuntos, criando valores fixos e coleções sem repetição.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-listas-operacoes-basicas"
              ],
              "covers": [
                "tuplas",
                "imutabilidade",
                "conjuntos",
                "`set()`",
                "`add()`",
                "`remove()`",
                "valores únicos",
                "`set.remove(valor)`",
                "conjunto sem índice confiável",
                "conjunto sem ordem garantida"
              ],
              "checks": [
                "cria tupla",
                "explica que tupla não modifica item",
                "usa `set()` para remover repetidos",
                "usa `add()` e `remove()` em conjunto",
                "remove valor existente em conjunto sem usar índice",
                "evita `conjunto[0]` como se fosse lista",
                "não usa ordem de exibição de conjunto como critério"
              ],
              "errors": [
                "tentar alterar tupla por índice",
                "usar `append()` em conjunto",
                "esperar ordem fixa em conjunto"
              ],
              "versions": [
                {
                  "id": "micro-a02-tuplas-sets__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Explicita particularidades de tuplas e conjuntos, com prática simples de criação e uso.",
                  "cards": [
                    {
                      "id": "card-a02-02-lista-tupla-set",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Lista, tupla e conjunto",
                      "columns": [
                        "Estrutura",
                        "Forma",
                        "Pode mudar?",
                        "Uso típico"
                      ],
                      "rows": [
                        [
                          "Lista",
                          "`[70, 72, 75]`",
                          "sim",
                          "dados ordenados que podem ser alterados"
                        ],
                        [
                          "Tupla",
                          "`(\"normal\", \"atenção\")`",
                          "não",
                          "conjunto fixo de valores de referência"
                        ],
                        [
                          "Conjunto",
                          "`set([\"M1\", \"M1\", \"M2\"])`",
                          "sim, mas sem índice",
                          "valores únicos, sem repetição"
                        ]
                      ],
                      "after": "A escolha depende da intenção: lista para sequência mutável, tupla para valores fixos, conjunto para eliminar repetidos."
                    },
                    {
                      "id": "card-a02-02-tupla-criar",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Criar tupla",
                      "prompt": "Compare formas de registrar status fixos.",
                      "language": "python",
                      "code": "# Objetivo: criar uma tupla chamada status com três valores.",
                      "after": "A tupla usa parênteses nesse exemplo. Ela é adequada para opções de status que não serão alteradas durante a prática.",
                      "question": "Qual alternativa cria uma tupla?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "status = (\"normal\", \"atenção\", \"crítico\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "status = [\"normal\", \"atenção\", \"crítico\"]"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "status = {\"normal\", \"atenção\", \"crítico\"}"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "status = {\"normal\": \"atenção\", \"crítico\": \"falha\"}"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a02-02-tupla-imutavel",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Tupla não altera por índice",
                      "question": "Qual afirmação está correta sobre `status = (\"normal\", \"atenção\", \"crítico\")`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`status[0] = \"ok\"` é a forma padrão de alterar uma tupla."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Tupla é indicada quando os valores devem permanecer fixos."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Tupla sempre remove valores repetidos."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Tupla só pode guardar números."
                        }
                      ],
                      "answer": "b",
                      "after": "Tupla é imutável: depois de criada, não é a estrutura adequada para alterar item por índice."
                    },
                    {
                      "id": "card-a02-02-set-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Remover repetidos com `set()`",
                      "prompt": "Complete a função que cria um conjunto de valores únicos.",
                      "language": "python",
                      "code": "codigos = [101, 102, 101, 103, 102]\nunicos = [[set::set|list|tuple]](codigos)\nprint(unicos)",
                      "after": "`set(codigos)` cria um conjunto com valores únicos. A ordem de exibição não deve ser usada como critério."
                    },
                    {
                      "id": "card-a02-02-set-add",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicionar ao conjunto",
                      "prompt": "Complete o método para inserir um valor no conjunto.",
                      "language": "python",
                      "code": "turnos = {\"manhã\", \"tarde\"}\nturnos.[[add::add|append|items]](\"noite\")\nprint(turnos)",
                      "after": "Conjunto usa `add()` para inserir. `append()` é método de lista, não de conjunto."
                    },
                    {
                      "id": "card-a02-02-set-remove",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Remover do conjunto",
                      "prompt": "Complete o método para remover um valor existente.",
                      "language": "python",
                      "code": "turnos = {\"manhã\", \"tarde\", \"noite\"}\nturnos.[[remove::remove|pop|append]](\"tarde\")\nprint(turnos)",
                      "after": "Em conjunto, `remove(\"tarde\")` remove pelo valor. Conjuntos não têm índice como listas."
                    },
                    {
                      "id": "card-a02-02-estrutura-uso",
                      "position": 7,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolher a estrutura",
                      "question": "Qual estrutura é mais adequada para guardar códigos únicos de máquinas, descartando repetidos?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Lista, porque sempre descarta repetidos automaticamente."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Tupla, porque permite alterar itens por índice."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Conjunto, porque mantém valores únicos."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Dicionário, porque todo dado precisa ter índice numérico."
                        }
                      ],
                      "answer": "c",
                      "after": "Conjunto é a escolha direta quando a necessidade principal é manter valores únicos."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                },
                {
                  "id": "micro-a02-tuplas-sets__v20260618-024534",
                  "createdAt": "2026-06-18T02:45:34Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção pontual solicitada pela auditoria v20260617-233830: precisar `set.remove(valor)`, ausência de índice e ausência de ordem garantida.",
                  "summary": "Repara a precisão didática sobre conjuntos, reforçando valores únicos, ausência de índice confiável e remoção por valor existente.",
                  "cards": [
                    {
                      "id": "card-a02-02-lista-tupla-set",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Lista, tupla e conjunto",
                      "columns": [
                        "Estrutura",
                        "Forma",
                        "Pode mudar?",
                        "Uso típico"
                      ],
                      "rows": [
                        [
                          "Lista",
                          "`[70, 72, 75]`",
                          "sim",
                          "dados ordenados que podem ser alterados"
                        ],
                        [
                          "Tupla",
                          "`(\"normal\", \"atenção\")`",
                          "não",
                          "conjunto fixo de valores de referência"
                        ],
                        [
                          "Conjunto",
                          "`set([\"M1\", \"M1\", \"M2\"])`",
                          "sim, mas sem índice confiável",
                          "valores únicos, sem repetição e sem ordem garantida para acesso"
                        ]
                      ],
                      "after": "A escolha depende da intenção: lista para sequência mutável, tupla para valores fixos, conjunto para eliminar repetidos sem depender de posição."
                    },
                    {
                      "id": "card-a02-02-tupla-criar",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Criar tupla",
                      "prompt": "Compare formas de registrar status fixos.",
                      "language": "python",
                      "code": "# Objetivo: criar uma tupla chamada status com três valores.",
                      "after": "A tupla usa parênteses nesse exemplo. Ela é adequada para opções de status que não serão alteradas durante a prática.",
                      "question": "Qual alternativa cria uma tupla?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "status = (\"normal\", \"atenção\", \"crítico\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "status = [\"normal\", \"atenção\", \"crítico\"]"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "status = {\"normal\", \"atenção\", \"crítico\"}"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "status = {\"normal\": \"atenção\", \"crítico\": \"falha\"}"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a02-02-tupla-imutavel",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Tupla não altera por índice",
                      "question": "Qual afirmação está correta sobre `status = (\"normal\", \"atenção\", \"crítico\")`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`status[0] = \"ok\"` é a forma padrão de alterar uma tupla."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Tupla é indicada quando os valores devem permanecer fixos."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Tupla sempre remove valores repetidos."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Tupla só pode guardar números."
                        }
                      ],
                      "answer": "b",
                      "after": "Tupla é imutável: depois de criada, não é a estrutura adequada para alterar item por índice."
                    },
                    {
                      "id": "card-a02-02-set-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Remover repetidos com `set()`",
                      "prompt": "Complete a função que cria um conjunto de valores únicos.",
                      "language": "python",
                      "code": "codigos = [101, 102, 101, 103, 102]\nunicos = [[set::set|list|tuple]](codigos)\nprint(unicos)",
                      "after": "`set(codigos)` cria um conjunto com valores únicos. A ordem de exibição não deve ser usada como critério."
                    },
                    {
                      "id": "card-a02-02-set-remove-precisao",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "`set.remove(valor)` remove valor existente",
                      "text": "Em um conjunto, `remove(valor)` remove um valor existente, não uma posição. A escrita `turnos[0]` aplica raciocínio de lista e deve ser evitada, porque conjunto não tem índice confiável nem ordem garantida.",
                      "after": "Use conjunto quando a pergunta é presença ou unicidade. Use lista quando a posição do item faz parte da tarefa."
                    },
                    {
                      "id": "card-a02-02-set-add",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicionar ao conjunto",
                      "prompt": "Complete o método para inserir um valor no conjunto.",
                      "language": "python",
                      "code": "turnos = {\"manhã\", \"tarde\"}\nturnos.[[add::add|append|items]](\"noite\")\nprint(turnos)",
                      "after": "Conjunto usa `add()` para inserir. `append()` é método de lista, não de conjunto."
                    },
                    {
                      "id": "card-a02-02-set-remove",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Remover do conjunto",
                      "prompt": "Complete o método para remover um valor existente.",
                      "language": "python",
                      "code": "turnos = {\"manhã\", \"tarde\", \"noite\"}\nturnos.[[remove::remove|pop|append]](\"tarde\")\nprint(turnos)",
                      "after": "Em conjunto, `remove(\"tarde\")` remove pelo valor existente. A ordem de exibição do conjunto não deve ser usada como evidência de primeira ou última posição."
                    },
                    {
                      "id": "card-a02-02-set-sem-indice",
                      "position": 8,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Conjunto não usa índice",
                      "prompt": "Compare as formas de remover um valor de um conjunto.",
                      "language": "python",
                      "code": "turnos = {\"manhã\", \"tarde\", \"noite\"}\n# Objetivo: remover o valor \"tarde\".",
                      "question": "Qual alternativa respeita a lógica de conjunto?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "turnos.remove(\"tarde\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "turnos.remove(1)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "turnos[0] = \"tarde\""
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "turnos.append(\"tarde\")"
                        }
                      ],
                      "answer": "a",
                      "after": "`turnos.remove(\"tarde\")` remove pelo valor. `turnos[0]` tenta usar índice, e conjunto não deve ser acessado por posição."
                    },
                    {
                      "id": "card-a02-02-estrutura-uso",
                      "position": 9,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolher a estrutura",
                      "question": "Qual estrutura é mais adequada para guardar códigos únicos de máquinas, descartando repetidos?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Lista, porque sempre descarta repetidos automaticamente."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Tupla, porque permite alterar itens por índice."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Conjunto, porque mantém valores únicos."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Dicionário, porque todo dado precisa ter índice numérico."
                        }
                      ],
                      "answer": "c",
                      "after": "Conjunto é a escolha direta quando a necessidade principal é manter valores únicos, sem depender da ordem de exibição."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a02-tuplas-sets__v20260618-024534"
            },
            {
              "id": "micro-a02-dicionarios-chave-valor",
              "title": "Dicionários: chave, valor e atualização",
              "goal": "Criar dicionários, acessar campos, alterar valores, adicionar campos, usar `pop()` por chave e percorrer com `.items()`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-tuplas-sets"
              ],
              "covers": [
                "dicionários",
                "chave",
                "valor",
                "acesso por chave",
                "alteração",
                "adição",
                "`pop()`",
                "`.items()`"
              ],
              "checks": [
                "cria dicionário com campos",
                "acessa valor por chave",
                "altera e adiciona campo",
                "usa `pop()` com chave",
                "percorre chave e valor com `.items()`"
              ],
              "errors": [
                "usar `maquina[0]`",
                "usar `for chave, valor in maquina` sem `.items()`",
                "usar `pop()` com índice em dicionário"
              ],
              "versions": [
                {
                  "id": "micro-a02-dicionarios-chave-valor__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Reforça dicionários como pares chave-valor e diferencia `pop()` de lista e dicionário.",
                  "cards": [
                    {
                      "id": "card-a02-03-dicionario-chave-valor",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Dicionários: chave e valor",
                      "text": "Um dicionário guarda pares de chave e valor. A chave é o nome usado para acessar o dado; o valor é a informação associada a essa chave. Dicionários usam chaves `{}` e não são acessados por índice numérico quando a intenção é buscar um campo.",
                      "after": "Leia `maquina[\"temperatura\"]` como: no dicionário `maquina`, busque o valor associado à chave `\"temperatura\"`."
                    },
                    {
                      "id": "card-a02-03-criar-dicionario",
                      "position": 2,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Criar dicionário",
                      "prompt": "Observe um dicionário de máquina.",
                      "language": "python",
                      "code": "maquina = {\n    \"nome\": \"M1\",\n    \"temperatura\": 78.5,\n    \"status\": \"atenção\"\n}\n\nprint(maquina)",
                      "after": "Cada entrada tem a forma `chave: valor`. As chaves usadas aqui são textos."
                    },
                    {
                      "id": "card-a02-03-acessar-chave",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Acessar por chave",
                      "prompt": "Complete a chave para acessar a temperatura.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 78.5, \"status\": \"atenção\"}\nprint(maquina[ [[\"temperatura\"::\"temperatura\"|\"M1\"|0]] ])",
                      "after": "Dicionário é acessado pela chave. A chave `\"temperatura\"` devolve o valor `78.5`."
                    },
                    {
                      "id": "card-a02-03-alterar-valor",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Alterar valor por chave",
                      "prompt": "Complete a chave que deve receber novo valor.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 78.5, \"status\": \"atenção\"}\nmaquina[ [[\"status\"::\"status\"|\"atenção\"|0]] ] = \"normal\"\nprint(maquina)",
                      "after": "Para alterar um campo, use a chave. `maquina[\"status\"] = \"normal\"` substitui o valor associado a `\"status\"`."
                    },
                    {
                      "id": "card-a02-03-adicionar-campo",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicionar campo",
                      "prompt": "Complete o novo campo do dicionário.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 78.5}\nmaquina[ [[\"setor\"::\"setor\"|\"M1\"|0]] ] = \"linha 2\"\nprint(maquina)",
                      "after": "Atribuir a uma chave nova adiciona um campo. A chave `\"setor\"` passa a existir no dicionário."
                    },
                    {
                      "id": "card-a02-03-pop-chave",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "`pop()` em dicionário",
                      "prompt": "Complete o argumento correto para remover o campo `status`.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 78.5, \"status\": \"atenção\"}\nremovido = maquina.pop([[\"status\"::\"status\"|0|\"atenção\"]])\nprint(removido)\nprint(maquina)",
                      "after": "Em dicionário, `pop()` recebe chave, não índice. `maquina.pop(\"status\")` remove e devolve o valor associado a essa chave."
                    },
                    {
                      "id": "card-a02-03-items-gap",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Percorrer chave e valor",
                      "prompt": "Complete o método que permite receber os dois elementos no `for`.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 78.5, \"status\": \"atenção\"}\n\nfor chave, valor in maquina.[[items::items|append|remove]]():\n    print(chave, valor)",
                      "after": "`.items()` permite percorrer pares. Sem `.items()`, o laço percorre apenas as chaves."
                    },
                    {
                      "id": "card-a02-03-erro-indice-dicionario",
                      "position": 8,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Dicionário não é lista",
                      "question": "Qual linha acessa corretamente a temperatura no dicionário `maquina`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina[\"temperatura\"]"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina[0]"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.items(\"temperatura\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.append(\"temperatura\")"
                        }
                      ],
                      "answer": "a",
                      "after": "O campo é acessado pela chave `\"temperatura\"`. Índice `0` é raciocínio de lista, não de dicionário com chaves textuais."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a02-dicionarios-chave-valor__v20260618-021923"
            },
            {
              "id": "micro-a02-reforco-nativas-colecoes",
              "title": "Medir coleções com `len()`, `sum()`, `min()` e `max()`",
              "goal": "Usar funções nativas para extrair medidas simples de listas numéricas.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-listas-operacoes-basicas"
              ],
              "covers": [
                "`len()`",
                "`sum()`",
                "`min()`",
                "`max()`",
                "média com `sum()/len()`"
              ],
              "checks": [
                "calcula quantidade, soma, menor, maior e média",
                "guarda resultado em variável",
                "não confunde `print()` com cálculo"
              ],
              "errors": [
                "usar `len` sem parênteses",
                "dividir por valor fixo quando deveria usar `len()`",
                "passar item único onde a função espera coleção"
              ],
              "versions": [
                {
                  "id": "micro-a02-reforco-nativas-colecoes__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Acrescenta prática de funções nativas de medida e cálculo de média com `sum()` e `len()`.",
                  "cards": [
                    {
                      "id": "card-a02-04-nativas-colecoes",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Medidas simples de listas",
                      "text": "`len()`, `sum()`, `min()` e `max()` são funções nativas úteis para listas numéricas. Elas recebem a coleção como argumento e devolvem um valor: quantidade, soma, menor valor ou maior valor.",
                      "after": "Essas funções ajudam a fazer análise inicial sem criar lógica complexa."
                    },
                    {
                      "id": "card-a02-04-len-gap",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Quantidade com `len()`",
                      "prompt": "Complete a chamada para contar os itens.",
                      "language": "python",
                      "code": "valores = [10, 20, 30]\nquantidade = [[len::len|sum|min]](valores)\nprint(quantidade)",
                      "after": "`len(valores)` devolve `3`, que é a quantidade de itens da lista."
                    },
                    {
                      "id": "card-a02-04-sum-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Soma com `sum()`",
                      "prompt": "Complete a chamada para somar os valores.",
                      "language": "python",
                      "code": "valores = [10, 20, 30]\ntotal = [[sum::sum|len|max]](valores)\nprint(total)",
                      "after": "`sum(valores)` devolve `60`. `len(valores)` devolveria a quantidade, não a soma."
                    },
                    {
                      "id": "card-a02-04-min-max-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Menor e maior valor",
                      "prompt": "Complete as chamadas.",
                      "language": "python",
                      "code": "valores = [18, 12, 25]\nmenor = [[min::min|max|sum]](valores)\nmaior = [[max::max|min|len]](valores)\nprint(menor, maior)",
                      "after": "`min()` devolve o menor valor; `max()` devolve o maior valor."
                    },
                    {
                      "id": "card-a02-04-media-gap",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Média com soma e quantidade",
                      "prompt": "Complete o denominador correto.",
                      "language": "python",
                      "code": "valores = [10, 20, 30]\nmedia = sum(valores) / [[len::len|sum|max]](valores)\nprint(media)",
                      "after": "A média usa a soma dividida pela quantidade. A quantidade vem de `len(valores)`."
                    },
                    {
                      "id": "card-a02-04-print-vs-calculo",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Guardar resultado de cálculo",
                      "question": "Qual linha guarda a média em uma variável para uso posterior?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "media = sum(valores) / len(valores)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "print(sum(valores) / len(valores))"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "input(sum(valores) / len(valores))"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "media == sum(valores) / len(valores)"
                        }
                      ],
                      "answer": "a",
                      "after": "A atribuição com `=` guarda o resultado em `media`. `print()` apenas exibe o cálculo na saída."
                    },
                    {
                      "id": "card-a02-04-media-len-choice",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Evitar quantidade fixa",
                      "prompt": "Compare versões de uma média.",
                      "language": "python",
                      "code": "valores = [10, 20, 30, 40]",
                      "after": "Usar `len(valores)` evita fixar a quantidade manualmente. Se a lista mudar, a média continua coerente.",
                      "question": "Qual alternativa calcula a média de modo mais seguro para a lista atual?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "media = sum(valores) / len(valores)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "media = sum(valores) / 3"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "media = len(valores) / sum(valores)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "media = print(sum(valores)) / len(valores)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a02-04-item-unico-erro",
                      "position": 8,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Função espera coleção",
                      "prompt": "Compare as chamadas.",
                      "language": "python",
                      "code": "valores = [10, 20, 30]\nvalor = valores[0]",
                      "after": "`sum()` espera uma coleção de números. O item `valor` é apenas um número inteiro.",
                      "question": "Qual chamada soma a lista inteira?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "sum(valores)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "sum(valor)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "len(valor)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "max(10)"
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
              "activeVersion": "micro-a02-reforco-nativas-colecoes__v20260618-021923"
            },
            {
              "id": "micro-a02-reforco-metodos-lista-dicionario",
              "title": "Métodos de lista e dicionário em uso",
              "goal": "Consolidar `append()`, `remove()`, `pop()` e `.items()` como métodos chamados a partir de objetos.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-dicionarios-chave-valor"
              ],
              "covers": [
                "`lista.append(valor)`",
                "`lista.remove(valor)`",
                "`lista.pop(indice)`",
                "`dicionario.pop(chave)`",
                "`dicionario.items()`",
                "chave e valor",
                "efeito versus retorno",
                "`lista.pop()`",
                "previsão de saída após mutação de lista"
              ],
              "checks": [
                "escolhe método adequado para adicionar/remover",
                "percorre pares com `.items()`",
                "não trata dicionário como lista por índice numérico",
                "distingue `lista.pop()` de `lista.pop(indice)` e `dicionario.pop(chave)`",
                "prevê o estado final da lista após `append()`, `remove()` e `pop()`",
                "escolhe entre `remove(valor)` e `pop(indice)` a partir do objetivo"
              ],
              "errors": [
                "usar `maquina[0]`",
                "usar `for chave, valor in maquina` sem `.items()`",
                "usar `set()` como método de lista"
              ],
              "versions": [
                {
                  "id": "micro-a02-reforco-metodos-lista-dicionario__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Consolida métodos de lista e dicionário, incluindo distinção de `pop()` por índice e por chave.",
                  "cards": [
                    {
                      "id": "card-a02-05-metodos-tabela",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Métodos em lista e dicionário",
                      "columns": [
                        "Chamada",
                        "Objeto",
                        "Argumento",
                        "Efeito principal"
                      ],
                      "rows": [
                        [
                          "`valores.append(85)`",
                          "lista `valores`",
                          "`85`",
                          "adiciona no final"
                        ],
                        [
                          "`valores.remove(70)`",
                          "lista `valores`",
                          "`70`",
                          "remove o valor informado"
                        ],
                        [
                          "`valores.pop(1)`",
                          "lista `valores`",
                          "`1` como índice",
                          "remove e devolve item da posição"
                        ],
                        [
                          "`maquina.pop(\"status\")`",
                          "dicionário `maquina`",
                          "`\"status\"` como chave",
                          "remove e devolve valor da chave"
                        ],
                        [
                          "`maquina.items()`",
                          "dicionário `maquina`",
                          "nenhum",
                          "permite percorrer chave e valor"
                        ]
                      ],
                      "after": "O mesmo nome `pop()` aparece em lista e dicionário, mas o argumento muda: índice em lista, chave em dicionário."
                    },
                    {
                      "id": "card-a02-05-append-exato",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicionar valor na lista",
                      "prompt": "Complete a chamada no ponto exato.",
                      "language": "python",
                      "code": "valores = [70, 75]\nvalores.[[append::append|remove|items]](85)\nprint(valores)",
                      "after": "`append(85)` adiciona ao final da lista. `.items()` pertence ao uso de dicionários."
                    },
                    {
                      "id": "card-a02-05-remove-exato",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Remover valor da lista",
                      "prompt": "Complete a chamada que remove `70` por valor.",
                      "language": "python",
                      "code": "valores = [70, 75, 85]\nvalores.[[remove::remove|append|items]](70)\nprint(valores)",
                      "after": "`remove(70)` procura e remove o valor `70`. Para posição, a lista usa `pop(indice)`."
                    },
                    {
                      "id": "card-a02-05-pop-lista-dict",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Mesmo método, argumento diferente",
                      "prompt": "Complete as duas chamadas de `pop()`.",
                      "language": "python",
                      "code": "valores = [70, 75, 85]\nremovido_lista = valores.pop([[1::1|75|\"status\"]])\n\nmaquina = {\"nome\": \"M1\", \"status\": \"atenção\"}\nremovido_dict = maquina.pop([[\"status\"::\"status\"|1|\"atenção\"]])",
                      "after": "Na lista, `pop(1)` remove pelo índice. No dicionário, `pop(\"status\")` remove pela chave."
                    },
                    {
                      "id": "card-a02-05-items-exato",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Percorrer dicionário",
                      "prompt": "Complete o método para receber chave e valor.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"status\": \"atenção\"}\n\nfor chave, valor in maquina.[[items::items|append|remove]]():\n    print(f\"{chave}: {valor}\")",
                      "after": "`.items()` devolve uma visão dos pares do dicionário, permitindo `for chave, valor in ...`."
                    },
                    {
                      "id": "card-a02-05-linha-chave-valor",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Laço com pares",
                      "question": "Qual trecho percorre corretamente chave e valor de um dicionário?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina.items():\n    print(chave, valor)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina:\n    print(chave, valor)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina.append():\n    print(chave, valor)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina[0]:\n    print(chave, valor)"
                        }
                      ],
                      "answer": "a",
                      "after": "Para desempacotar dois nomes no laço, use `.items()`. Iterar diretamente sobre o dicionário percorre apenas chaves."
                    },
                    {
                      "id": "card-a02-05-sintaxe-dict-metodo",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Remover campo do dicionário",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"status\": \"atenção\"}",
                      "after": "O campo deve ser removido pela chave. O método é chamado a partir do dicionário com ponto.",
                      "question": "Qual alternativa remove o campo `status` corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.pop(\"status\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.pop(0)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "pop(maquina, \"status\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.remove(\"status\")"
                        }
                      ],
                      "answer": "a"
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                },
                {
                  "id": "micro-a02-reforco-metodos-lista-dicionario__v20260618-024534",
                  "createdAt": "2026-06-18T02:45:34Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção pontual solicitada pela auditoria v20260617-233830: reforçar `pop()` sem argumento, `pop(indice)`, `pop(chave)`, previsão de saída e escolha entre `remove(valor)` e `pop(indice)`.",
                  "summary": "Repara a distinção entre métodos de remoção em lista, dicionário e conjunto, com foco em `pop()` como ação que remove e devolve valor.",
                  "cards": [
                    {
                      "id": "card-a02-05-metodos-tabela",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Remover, devolver e percorrer coleções",
                      "columns": [
                        "Chamada",
                        "Estrutura",
                        "Argumento",
                        "Remove por",
                        "Devolve valor?"
                      ],
                      "rows": [
                        [
                          "`lista.remove(20)`",
                          "lista",
                          "`20`",
                          "valor encontrado",
                          "não use como resultado"
                        ],
                        [
                          "`lista.pop()`",
                          "lista",
                          "nenhum",
                          "último índice",
                          "sim"
                        ],
                        [
                          "`lista.pop(1)`",
                          "lista",
                          "`1`",
                          "posição indicada",
                          "sim"
                        ],
                        [
                          "`dicionario.pop(\"status\")`",
                          "dicionário",
                          "`\"status\"`",
                          "chave",
                          "sim"
                        ],
                        [
                          "`conjunto.remove(\"A\")`",
                          "conjunto",
                          "`\"A\"` existente",
                          "valor",
                          "não use posição"
                        ],
                        [
                          "`dicionario.items()`",
                          "dicionário",
                          "nenhum",
                          "não remove",
                          "devolve pares para percorrer"
                        ]
                      ],
                      "after": "`pop` pode ser entendido como “tirar e devolver”. Em lista, o argumento é índice quando aparece; em dicionário, o argumento é chave."
                    },
                    {
                      "id": "card-a02-05-append-exato",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Adicionar valor na lista",
                      "prompt": "Complete a chamada no ponto exato.",
                      "language": "python",
                      "code": "valores = [70, 75]\nvalores.[[append::append|remove|items]](85)\nprint(valores)",
                      "after": "`append(85)` adiciona ao final da lista. `.items()` pertence ao uso de dicionários."
                    },
                    {
                      "id": "card-a02-05-remove-exato",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Remover valor da lista",
                      "prompt": "Complete a chamada que remove `70` por valor.",
                      "language": "python",
                      "code": "valores = [70, 75, 85]\nvalores.[[remove::remove|append|items]](70)\nprint(valores)",
                      "after": "`remove(70)` procura e remove o valor `70`. Se a intenção for remover pela posição, use `pop(indice)`; se a intenção for tirar o último item, use `pop()` sem argumento."
                    },
                    {
                      "id": "card-a02-05-pop-lexico-teoria",
                      "position": 4,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "`pop()` como tirar e devolver",
                      "text": "`pop()` é usado quando a remoção também precisa devolver o item removido. Em lista, `valores.pop()` remove o último item e `valores.pop(1)` remove o item do índice `1`. Em dicionário, `maquina.pop(\"status\")` remove a chave `\"status\"` e devolve o valor associado.",
                      "after": "A decisão principal é observar a estrutura antes do argumento: lista trabalha com posição; dicionário trabalha com chave."
                    },
                    {
                      "id": "card-a02-05-pop-sem-argumento",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "`pop()` sem argumento",
                      "prompt": "Complete a chamada que remove e devolve o último item da lista.",
                      "language": "python",
                      "code": "valores = [70, 75, 85]\nultimo = valores.[[pop::pop|remove|append]]()\nprint(ultimo)\nprint(valores)",
                      "after": "Sem argumento, `pop()` remove o último item da lista e devolve esse valor para a variável `ultimo`.",
                      "afterBlocks": [
                        {
                          "language": "text",
                          "code": "85\n[70, 75]",
                          "kind": "code",
                          "prompt": "Saída esperada."
                        }
                      ]
                    },
                    {
                      "id": "card-a02-05-pop-lista-dict",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "`pop()` com índice ou chave",
                      "prompt": "Complete as duas chamadas de `pop()`.",
                      "language": "python",
                      "code": "valores = [70, 75, 85]\nremovido_lista = valores.pop([[1::1|75|\"status\"]])\n\nmaquina = {\"nome\": \"M1\", \"status\": \"atenção\"}\nremovido_dict = maquina.pop([[\"status\"::\"status\"|1|\"atenção\"]])",
                      "after": "Na lista, `pop(1)` remove e devolve o item da posição `1`. No dicionário, `pop(\"status\")` remove a chave `\"status\"` e devolve o valor associado."
                    },
                    {
                      "id": "card-a02-05-prevendo-estado-lista",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Prever saída depois de `append()`, `remove()` e `pop()`",
                      "prompt": "Execute mentalmente as mudanças na lista.",
                      "language": "python",
                      "code": "valores = [70, 75]\nvalores.append(85)\nvalores.remove(70)\nremovido = valores.pop()\nprint(removido)\nprint(valores)",
                      "question": "Qual saída o código produz?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "text",
                          "code": "85\n[75]"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "text",
                          "code": "70\n[75, 85]"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "text",
                          "code": "75\n[85]"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "text",
                          "code": "85\n[70, 75]"
                        }
                      ],
                      "answer": "a",
                      "after": "`append(85)` acrescenta no final, `remove(70)` tira o valor `70` e `pop()` tira e devolve o último item restante, que é `85`."
                    },
                    {
                      "id": "card-a02-05-remove-ou-pop-indice",
                      "position": 8,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolher entre `remove(valor)` e `pop(indice)`",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "valores = [70, 75, 85]\n# Objetivo: remover o item que está no índice 1 e guardar o valor removido.",
                      "question": "Qual alternativa cumpre o objetivo?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "removido = valores.pop(1)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "removido = valores.remove(1)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "removido = valores.pop(\"1\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "removido = valores.remove(valores)"
                        }
                      ],
                      "answer": "a",
                      "after": "O enunciado pede índice e resultado reutilizável. `pop(1)` remove pela posição `1` e devolve o item removido."
                    },
                    {
                      "id": "card-a02-05-items-exato",
                      "position": 9,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Percorrer dicionário",
                      "prompt": "Complete o método para receber chave e valor.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"status\": \"atenção\"}\n\nfor chave, valor in maquina.[[items::items|append|remove]]():\n    print(f\"{chave}: {valor}\")",
                      "after": "`.items()` devolve uma visão dos pares do dicionário, permitindo `for chave, valor in ...`."
                    },
                    {
                      "id": "card-a02-05-linha-chave-valor",
                      "position": 10,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Laço com pares",
                      "question": "Qual trecho percorre corretamente chave e valor de um dicionário?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina.items():\n    print(chave, valor)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina:\n    print(chave, valor)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina.append():\n    print(chave, valor)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "for chave, valor in maquina[0]:\n    print(chave, valor)"
                        }
                      ],
                      "answer": "a",
                      "after": "Para desempacotar dois nomes no laço, use `.items()`. Iterar diretamente sobre o dicionário percorre apenas chaves."
                    },
                    {
                      "id": "card-a02-05-sintaxe-dict-metodo",
                      "position": 11,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Remover campo do dicionário",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"status\": \"atenção\"}",
                      "after": "O campo deve ser removido pela chave. `maquina.pop(\"status\")` também devolve o valor que estava associado a essa chave.",
                      "question": "Qual alternativa remove o campo `status` corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.pop(\"status\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.pop(0)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "pop(maquina, \"status\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "maquina.remove(\"status\")"
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
              "activeVersion": "micro-a02-reforco-metodos-lista-dicionario__v20260618-024534"
            },
            {
              "id": "micro-a02-for-range-e-colecoes",
              "title": "`for` com `range()` e cada coleção",
              "goal": "Treinar `for` com `range()`, listas, tuplas, conjuntos e dicionários.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a02-reforco-metodos-lista-dicionario"
              ],
              "covers": [
                "`for`",
                "`range()`",
                "lista",
                "tupla",
                "conjunto",
                "dicionário",
                "`.items()`",
                "`for + if`"
              ],
              "checks": [
                "usa `range()` para contagem",
                "percorre lista, tupla e conjunto",
                "percorre dicionário com `.items()`",
                "compara item atual dentro do `for`"
              ],
              "errors": [
                "comparar lista inteira com número",
                "usar ordem de conjunto como garantia",
                "usar dois nomes no dicionário sem `.items()`"
              ],
              "versions": [
                {
                  "id": "micro-a02-for-range-e-colecoes__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "improve",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Inclui treino explícito de `for` com `range()` e com cada agrupamento básico.",
                  "cards": [
                    {
                      "id": "card-a02-06-for-range-colecoes",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "`for` com `range()` e coleções",
                      "text": "`for` pode percorrer números gerados por `range()` ou itens de uma coleção. Em listas e tuplas, a ordem é relevante. Em conjuntos, não use a ordem como critério. Em dicionários, use `.items()` quando precisar de chave e valor.",
                      "after": "A escolha do laço depende do que precisa ser percorrido: posições, valores ou pares."
                    },
                    {
                      "id": "card-a02-06-range-gap",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Repetir por contagem",
                      "prompt": "Complete o `range()` para mostrar `1`, `2` e `3`.",
                      "language": "python",
                      "code": "for numero in [[range(1, 4)::range(1, 4)|range(1, 3)|range(4, 1)]]:\n    print(numero)",
                      "after": "`range(1, 4)` começa em `1` e termina antes de `4`, exibindo `1`, `2` e `3`."
                    },
                    {
                      "id": "card-a02-06-for-lista",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Percorrer lista",
                      "prompt": "Complete a coleção a ser percorrida.",
                      "language": "python",
                      "code": "temperaturas = [70, 75, 80]\n\nfor temperatura in [[temperaturas::temperaturas|temperatura|range]]:\n    print(temperatura)",
                      "after": "O `for` percorre a lista `temperaturas`. A variável `temperatura` recebe um item por vez."
                    },
                    {
                      "id": "card-a02-06-for-tupla",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Percorrer tupla",
                      "prompt": "Complete o nome da tupla.",
                      "language": "python",
                      "code": "status_possiveis = (\"normal\", \"atenção\", \"crítico\")\n\nfor status in [[status_possiveis::status_possiveis|status|set]]:\n    print(status)",
                      "after": "A tupla pode ser percorrida com `for`, mesmo sendo imutável. A imutabilidade impede alteração, mas não impede percorrer seus valores."
                    },
                    {
                      "id": "card-a02-06-for-set",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Percorrer conjunto",
                      "prompt": "Complete a coleção de valores únicos.",
                      "language": "python",
                      "code": "maquinas_unicas = {\"M1\", \"M2\", \"M3\"}\n\nfor maquina in [[maquinas_unicas::maquinas_unicas|maquina|items]]:\n    print(maquina)",
                      "after": "O conjunto pode ser percorrido, mas a ordem de saída não deve ser usada como garantia."
                    },
                    {
                      "id": "card-a02-06-for-dict-items",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Percorrer dicionário com pares",
                      "prompt": "Complete a chamada para percorrer chave e valor.",
                      "language": "python",
                      "code": "maquina = {\"nome\": \"M1\", \"temperatura\": 78.5}\n\nfor chave, valor in maquina.[[items::items|values|append]]():\n    print(chave, valor)",
                      "after": "`.items()` é o método que permite receber dois nomes no laço: `chave` e `valor`."
                    },
                    {
                      "id": "card-a02-06-producao-item-atual",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Comparar item atual",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "# Objetivo: classificar cada produção como adequada quando for maior ou igual a 60.",
                      "after": "A condição deve comparar `producao`, que é o item atual. Comparar `producoes` usa a lista inteira e não resolve a classificação item a item.",
                      "question": "Qual alternativa usa corretamente o item atual?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [55, 62, 70]\nfor producao in producoes:\n    if producao >= 60:\n        print(\"adequada\")\n    else:\n        print(\"abaixo\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [55, 62, 70]\nfor producao in producoes:\n    if producoes >= 60:\n        print(\"adequada\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [55, 62, 70]\nif producao >= 60:\n    for producao in producoes:\n        print(\"adequada\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "producoes = [55, 62, 70]\nfor producoes in producao:\n    if producao >= 60:\n        print(\"adequada\")"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a02-06-fluxo-for-if",
                      "position": 8,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Fluxo de `for + if`",
                      "prompt": "Observe o processo de classificar produções.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Receber lista `producoes`"
                          },
                          {
                            "kind": "for",
                            "iterator": "`producao`",
                            "iterable": "`producoes`",
                            "body": [
                              {
                                "kind": "if_then_else",
                                "condition": "`producao >= 60`?",
                                "thenBranch": [
                                  {
                                    "kind": "output",
                                    "text": "Mostrar `adequada`"
                                  }
                                ],
                                "elseBranch": [
                                  {
                                    "kind": "output",
                                    "text": "Mostrar `abaixo`"
                                  }
                                ]
                              }
                            ]
                          },
                          {
                            "kind": "end",
                            "text": "Encerrar classificação"
                          }
                        ]
                      },
                      "after": "O fluxo evidencia o detalhe decisivo: o `if` fica dentro do `for` e testa o item atual."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a02-for-range-e-colecoes__v20260618-021923"
            },
            {
              "id": "micro-a02-reforco-parametro-argumento",
              "title": "Parâmetro na definição, argumento na chamada",
              "goal": "Diferenciar nome interno declarado pela função e valor real passado para ela.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a02-for-range-e-colecoes"
              ],
              "covers": [
                "`def`",
                "parâmetro",
                "argumento",
                "chamada",
                "f-string com parâmetro",
                "função sem retorno"
              ],
              "checks": [
                "identifica parâmetro em `def mostrar_status(status):`",
                "identifica argumento em `mostrar_status(\"normal\")`",
                "não usa literal fixo onde deveria usar parâmetro"
              ],
              "errors": [
                "trocar parâmetro por valor fixo",
                "chamar função antes de definir",
                "esquecer parênteses na chamada"
              ],
              "versions": [
                {
                  "id": "micro-a02-reforco-parametro-argumento__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Explicita a diferença entre parâmetro e argumento e inclui função simples sem retorno explícito.",
                  "cards": [
                    {
                      "id": "card-a02-07-parametro-argumento-teoria",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Parâmetro na definição, argumento na chamada",
                      "text": "Em uma função, parâmetro é o nome escrito na definição, como `status` em `def mostrar_status(status):`. Argumento é o valor real passado na chamada, como `\"normal\"` em `mostrar_status(\"normal\")`.",
                      "after": "A função usa o parâmetro como nome interno. A chamada entrega o argumento que será associado a esse nome."
                    },
                    {
                      "id": "card-a02-07-def-parametro-gap",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Definir parâmetro",
                      "prompt": "Complete o nome do parâmetro.",
                      "language": "python",
                      "code": "def mostrar_status([[status::status|\"normal\"|argumento]]):\n    print(f\"Status recebido: {status}\")",
                      "after": "`status` é parâmetro porque aparece na definição. O texto `\"normal\"` seria um argumento em uma chamada."
                    },
                    {
                      "id": "card-a02-07-identificar-parametro",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Identificar parâmetro",
                      "question": "No código `def mostrar_status(status):`, qual parte é o parâmetro?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`def`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`mostrar_status`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`status`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`print`"
                        }
                      ],
                      "answer": "c",
                      "after": "O parâmetro é o nome entre parênteses na definição da função."
                    },
                    {
                      "id": "card-a02-07-chamada-argumento-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Passar argumento",
                      "prompt": "Complete a chamada com o argumento real.",
                      "language": "python",
                      "code": "def mostrar_status(status):\n    print(f\"Status recebido: {status}\")\n\nmostrar_status([[\"normal\"::\"normal\"|status|def]])",
                      "after": "`\"normal\"` é argumento porque é o valor passado para a função na chamada."
                    },
                    {
                      "id": "card-a02-07-parametro-nao-literal",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Usar o parâmetro dentro da função",
                      "prompt": "Compare duas definições.",
                      "language": "python",
                      "code": "# Objetivo: mostrar qualquer status recebido na chamada.",
                      "after": "A função deve usar o parâmetro `status`, não um texto fixo. Assim, cada chamada pode exibir um valor diferente.",
                      "question": "Qual alternativa usa o parâmetro corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "def mostrar_status(status):\n    print(f\"Status recebido: {status}\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "def mostrar_status(status):\n    print(\"Status recebido: normal\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "def mostrar_status(\"normal\"):\n    print(status)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "mostrar_status(status):\n    print(status)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a02-07-ordem-def-chamada",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Definir antes de chamar",
                      "question": "Qual sequência respeita a ordem básica de definição e chamada?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "mostrar_status(\"normal\")\n\ndef mostrar_status(status):\n    print(status)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "def mostrar_status(status):\n    print(status)\n\nmostrar_status(\"normal\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "def mostrar_status:\n    print(status)\n\nmostrar_status(\"normal\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "mostrar_status = \"normal\"\nprint(status)"
                        }
                      ],
                      "answer": "b",
                      "after": "A função precisa ser definida com `def`, nome, parênteses e bloco indentado antes da chamada direta nesse script."
                    },
                    {
                      "id": "card-a02-07-funcao-sem-retorno",
                      "position": 7,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Função sem retorno explícito",
                      "prompt": "Observe uma função criada apenas para exibir uma mensagem.",
                      "language": "python",
                      "code": "def mostrar_boas_vindas():\n    print(\"Bem-vindo à análise de dados\")\n\nmostrar_boas_vindas()",
                      "after": "Essa função organiza uma ação de saída. Ela chama `print()`, mas não devolve um valor para ser usado em cálculo."
                    }
                  ],
                  "validation": {
                    "ok": true,
                    "issues": []
                  }
                }
              ],
              "activeVersion": "micro-a02-reforco-parametro-argumento__v20260618-021923"
            },
            {
              "id": "micro-a02-reforco-return-print",
              "title": "Mostrar com `print()` ou devolver com `return`",
              "goal": "Diferenciar função que apenas exibe de função que devolve resultado reutilizável.",
              "role": "review",
              "status": "generated",
              "dependsOn": [
                "micro-a02-reforco-parametro-argumento"
              ],
              "covers": [
                "`print()`",
                "`return`",
                "resultado reutilizável",
                "cálculo de média",
                "guardar retorno em variável"
              ],
              "checks": [
                "escolhe `return` quando o valor será usado depois",
                "escolhe `print()` quando a intenção é apenas exibir",
                "completa função `calcular_media(valores)`"
              ],
              "errors": [
                "usar `print()` dentro de cálculo",
                "não retornar nada",
                "usar variável global em vez de parâmetro"
              ],
              "versions": [
                {
                  "id": "micro-a02-reforco-return-print__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Inclui retorno simples com média e contraste explícito entre `print()` e `return`.",
                  "cards": [
                    {
                      "id": "card-a02-08-print-return-teoria",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Mostrar ou devolver",
                      "text": "`print()` mostra um valor na saída. `return` devolve um valor para quem chamou a função. Quando o resultado precisa ser guardado, comparado ou usado em outro cálculo, use `return`.",
                      "after": "A pergunta prática é: o valor só precisa aparecer na tela ou precisa continuar disponível no programa?"
                    },
                    {
                      "id": "card-a02-08-print-return-tabela",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "`print()` versus `return`",
                      "columns": [
                        "Intenção",
                        "Forma adequada",
                        "Motivo"
                      ],
                      "rows": [
                        [
                          "Apenas mostrar uma mensagem",
                          "`print(\"ok\")`",
                          "saída visual basta"
                        ],
                        [
                          "Calcular média e usar depois",
                          "`return media`",
                          "valor precisa voltar para a chamada"
                        ],
                        [
                          "Guardar resultado em variável",
                          "`resultado = calcular_media(valores)`",
                          "a função precisa devolver algo"
                        ],
                        [
                          "Exibir relatório final simples",
                          "`print(...)`",
                          "quando não haverá uso posterior do valor"
                        ]
                      ],
                      "after": "`print()` e `return` podem aparecer em funções, mas não têm a mesma finalidade."
                    },
                    {
                      "id": "card-a02-08-return-media-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Função que devolve média",
                      "prompt": "Complete a função para devolver a média.",
                      "language": "python",
                      "code": "def calcular_media(valores):\n    media = sum(valores) / len(valores)\n    [[return::return|print|input]] media\n\nresultado = calcular_media([10, 20, 30])\nprint(resultado)",
                      "after": "`return media` devolve o valor calculado. Assim, `resultado` recebe a média."
                    },
                    {
                      "id": "card-a02-08-choice-return",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Valor para uso posterior",
                      "prompt": "Compare funções completas.",
                      "language": "python",
                      "code": "# Objetivo: calcular média e permitir guardar o resultado em uma variável.",
                      "after": "A função que devolve resultado usa `return`. A função que apenas imprime não entrega a média para a variável da chamada.",
                      "question": "Qual alternativa permite `media = calcular_media([10, 20, 30])`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media(valores):\n    media = sum(valores) / len(valores)\n    return media"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media(valores):\n    media = sum(valores) / len(valores)\n    print(media)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media(valores):\n    print(\"media\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media(valores):\n    input(media)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a02-08-qual-devolve",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolher `print()` ou `return`",
                      "question": "Qual alternativa devolve valor para uso posterior?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "def dobro(numero):\n    print(numero * 2)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "def dobro(numero):\n    return numero * 2"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "def dobro(numero):\n    input(numero * 2)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "def dobro(numero):\n    numero == 2"
                        }
                      ],
                      "answer": "b",
                      "after": "`return numero * 2` faz a função devolver o resultado. Com `print()`, o valor aparece na tela, mas não é entregue para a chamada."
                    },
                    {
                      "id": "card-a02-08-parametro-na-media",
                      "position": 6,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Usar parâmetro, não variável fixa",
                      "prompt": "Compare versões de uma função.",
                      "language": "python",
                      "code": "valores_globais = [100, 100, 100]",
                      "after": "A função deve calcular sobre o parâmetro recebido. Assim, o argumento passado na chamada realmente influencia o resultado.",
                      "question": "Qual alternativa respeita o parâmetro `valores`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media(valores):\n    return sum(valores) / len(valores)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media(valores):\n    return sum(valores_globais) / len(valores_globais)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media():\n    return sum(valores) / len(valores)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "def calcular_media(valores):\n    print(sum(valores_globais))"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a02-08-solucao-afterblocks",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Guardar retorno",
                      "prompt": "Complete a chamada que guarda o retorno da função.",
                      "language": "python",
                      "code": "def calcular_media(valores):\n    media = sum(valores) / len(valores)\n    return media\n\n[[media_turma::media_turma|print|return]] = calcular_media([8, 7, 9])\nprint(media_turma)",
                      "after": "O nome `media_turma` recebe o retorno de `calcular_media([8, 7, 9])`. Depois, `print(media_turma)` apenas exibe o valor guardado.",
                      "afterBlocks": [
                        {
                          "language": "python",
                          "code": "def calcular_media(valores):\n    media = sum(valores) / len(valores)\n    return media\n\nmedia_turma = calcular_media([8, 7, 9])\nprint(media_turma)",
                          "kind": "code",
                          "prompt": "Veja o código completo."
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
              "activeVersion": "micro-a02-reforco-return-print__v20260618-021923"
            },
            {
              "id": "micro-a02-desafio-integrador-funcoes-colecoes",
              "title": "Função de análise de produções",
              "goal": "Resolver uma tarefa final com lista, funções nativas, laço, condição, parâmetro, argumento e retorno simples.",
              "role": "review",
              "status": "generated",
              "dependsOn": [
                "micro-a02-reforco-return-print"
              ],
              "covers": [
                "lista de produções",
                "`len()`",
                "`sum()`",
                "`min()`",
                "`max()`",
                "média",
                "função com parâmetro",
                "`for + if`",
                "`return` simples"
              ],
              "checks": [
                "recebe lista por parâmetro",
                "compara item atual, não lista inteira",
                "devolve métrica reutilizável ou exibe relatório conforme enunciado"
              ],
              "errors": [
                "comparar lista inteira com número",
                "deixar `if` fora do `for`",
                "criar função sem chamada",
                "ignorar argumento passado"
              ],
              "versions": [
                {
                  "id": "micro-a02-desafio-integrador-funcoes-colecoes__v20260618-021923",
                  "createdAt": "2026-06-18T02:19:23.000Z",
                  "source": "llm",
                  "action": "repair",
                  "request": "Correção e reforço das aulas 1 e 2 conforme handoff v20260617-230801 e notebooks anexados.",
                  "summary": "Integra coleções e funções em desafio final com critérios, depuração e escolha de script completo.",
                  "cards": [
                    {
                      "id": "card-a02-09-criterios-desafio",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Critérios da análise de produções",
                      "columns": [
                        "Critério",
                        "Regra esperada"
                      ],
                      "rows": [
                        [
                          "Entrada",
                          "receber lista por parâmetro"
                        ],
                        [
                          "Medidas",
                          "calcular `len()`, `sum()`, `min()`, `max()` e média"
                        ],
                        [
                          "Laço",
                          "percorrer cada `producao` da lista"
                        ],
                        [
                          "Condição",
                          "comparar o item atual com `60`"
                        ],
                        [
                          "Retorno",
                          "devolver um valor simples reutilizável quando a função calcula métrica"
                        ]
                      ],
                      "after": "Os critérios mantêm a prática focada em sintaxe e uso autônomo de Python básico."
                    },
                    {
                      "id": "card-a02-09-funcao-medidas-gap",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Média de produções",
                      "prompt": "Complete a função com soma, quantidade e retorno.",
                      "language": "python",
                      "code": "def calcular_media_producao(producoes):\n    total = [[sum::sum|len|max]](producoes)\n    quantidade = [[len::len|sum|min]](producoes)\n    media = total / quantidade\n    [[return::return|print|input]] media\n\nmedia = calcular_media_producao([55, 62, 70])\nprint(media)",
                      "after": "`sum()` calcula o total, `len()` calcula a quantidade e `return media` devolve a métrica para uso posterior."
                    },
                    {
                      "id": "card-a02-09-contar-adequadas-gap",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Contar produções adequadas",
                      "prompt": "Complete a comparação com o item atual.",
                      "language": "python",
                      "code": "def contar_adequadas(producoes):\n    quantidade = 0\n    for producao in producoes:\n        if [[producao::producao|producoes|quantidade]] >= 60:\n            quantidade = quantidade + 1\n    return quantidade\n\nprint(contar_adequadas([55, 62, 70]))",
                      "after": "A condição compara `producao`, o item atual. Comparar `producoes` usaria a lista inteira e não classificaria cada valor."
                    },
                    {
                      "id": "card-a02-09-previsao-contagem",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Previsão de retorno",
                      "prompt": "Leia a função e a chamada.",
                      "language": "python",
                      "code": "def contar_adequadas(producoes):\n    quantidade = 0\n    for producao in producoes:\n        if producao >= 60:\n            quantidade = quantidade + 1\n    return quantidade\n\nresultado = contar_adequadas([55, 62, 70])\nprint(resultado)",
                      "after": "Apenas `62` e `70` atendem à regra `>= 60`; por isso o contador termina em `2`.",
                      "question": "Qual valor será exibido?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`1`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`2`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`3`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`60`"
                        }
                      ],
                      "answer": "b"
                    },
                    {
                      "id": "card-a02-09-corrigir-lista-inteira",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Corrigir comparação incorreta",
                      "prompt": "Compare versões completas.",
                      "language": "python",
                      "code": "# Erro original: usar a lista inteira na condição.",
                      "after": "A correção mínima é trocar `producoes` por `producao` dentro do `if`, mantendo o `if` dentro do `for`.",
                      "question": "Qual versão corrige `if producoes >= 60:`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "for producao in producoes:\n    if producao >= 60:\n        print(\"adequada\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "for producao in producoes:\n    if producoes >= 60:\n        print(\"adequada\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "if producao >= 60:\n    for producao in producoes:\n        print(\"adequada\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "for producoes in producao:\n    if producoes >= 60:\n        print(\"adequada\")"
                        }
                      ],
                      "answer": "a",
                      "afterBlocks": [
                        {
                          "language": "python",
                          "code": "producoes = [55, 62, 70]\n\nfor producao in producoes:\n    if producao >= 60:\n        print(\"adequada\")\n    else:\n        print(\"abaixo\")",
                          "kind": "code",
                          "prompt": "Veja o código completo."
                        }
                      ]
                    },
                    {
                      "id": "card-a02-09-composite-final",
                      "position": 6,
                      "resource": "composite",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Análise final de produções",
                      "blocks": [
                        {
                          "columns": [
                            "Parte",
                            "Exigência"
                          ],
                          "rows": [
                            [
                              "Função",
                              "receber `producoes` por parâmetro"
                            ],
                            [
                              "Métrica",
                              "calcular média com `sum()` e `len()`"
                            ],
                            [
                              "Classificação",
                              "percorrer `producoes` com `for`"
                            ],
                            [
                              "Condição",
                              "comparar cada `producao` com `60`"
                            ],
                            [
                              "Resultado",
                              "devolver a média com `return`"
                            ]
                          ],
                          "kind": "table"
                        },
                        {
                          "language": "python",
                          "code": "def analisar_producoes(producoes):\n    media = sum(producoes) / len(producoes)\n    for producao in producoes:\n        if producao >= 60:\n            print(f\"{producao}: adequada\")\n        else:\n            print(f\"{producao}: abaixo\")\n    return media\n\nresultado = analisar_producoes([55, 62, 70])\nprint(resultado)",
                          "kind": "code",
                          "prompt": "Observe o código."
                        },
                        {
                          "kind": "choice",
                          "question": "Qual alternativa explica por que o script atende aos critérios?",
                          "options": [
                            {
                              "id": "a",
                              "kind": "text",
                              "text": "A função recebe a lista por parâmetro, compara o item atual no `for` e devolve a média com `return`."
                            },
                            {
                              "id": "b",
                              "kind": "text",
                              "text": "A função usa `print()` para devolver a média e compara a lista inteira com `60`."
                            },
                            {
                              "id": "c",
                              "kind": "text",
                              "text": "A função usa dicionário por índice numérico e por isso calcula a média."
                            },
                            {
                              "id": "d",
                              "kind": "text",
                              "text": "A função dispensa parâmetro porque a lista aparece dentro do `for`."
                            }
                          ],
                          "answer": "a"
                        }
                      ],
                      "after": "O script mantém a sintaxe essencial: parâmetro na função, argumento na chamada, laço sobre a lista, condição sobre o item atual e `return` para a média."
                    },
                    {
                      "id": "card-a02-09-script-escolha",
                      "position": 7,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Escolher script completo",
                      "prompt": "Compare versões completas para uma análise simples.",
                      "language": "python",
                      "code": "# Objetivo: receber lista, imprimir classificação e devolver média.",
                      "after": "A versão correta recebe `producoes`, usa o item atual no `if` e retorna a média calculada.",
                      "question": "Qual script cumpre o objetivo?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "def analisar(producoes):\n    media = sum(producoes) / len(producoes)\n    for producao in producoes:\n        if producao >= 60:\n            print(\"adequada\")\n        else:\n            print(\"abaixo\")\n    return media\n\nresultado = analisar([55, 62, 70])\nprint(resultado)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "def analisar(producoes):\n    media = print(sum(producoes) / len(producoes))\n    for producao in producoes:\n        if producoes >= 60:\n            print(\"adequada\")\n    return producoes"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "def analisar():\n    for producao in producoes:\n        if producao >= 60:\n            print(\"adequada\")\n    print(media)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "resultado = analisar\nprint(resultado)"
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
              "activeVersion": "micro-a02-desafio-integrador-funcoes-colecoes__v20260618-021923"
            }
          ]
        }
      ]
    },
    {
      "id": "module-aula-03-bibliotecas-analise-dados",
      "title": "Aula 3 — Bibliotecas para análise de dados com NumPy e Pandas",
      "guide": {
        "goal": "Materializar a Aula 3 como continuação do curso aprovado, mantendo foco em operações iniciais de NumPy e Pandas.",
        "include": [
          "NumPy básico",
          "Pandas básico",
          "CSV da aula 3",
          "decisões verificáveis com valores do dataset"
        ],
        "exclude": [
          "Matplotlib",
          "Seaborn",
          "Scikit-learn",
          "regressão",
          "treino/teste",
          "merge",
          "join",
          "pivot",
          "pivot_table",
          "apply",
          "lambdas",
          "programação orientada a objetos"
        ],
        "notation": [
          "Caminho do CSV: `/mnt/data/dataset_aula3_numpy_pandas.csv`.",
          "Aliases convencionais: `np` para NumPy e `pd` para Pandas."
        ],
        "avoid": [
          "Não recriar aulas anteriores.",
          "Não adicionar continuidade mínima quando não houver próxima parte declarada."
        ]
      },
      "lessons": [
        {
          "id": "lesson-aula-03-numpy-pandas",
          "title": "NumPy e Pandas para operar bases tabulares",
          "guide": {
            "goal": "Ensinar uso básico e correto de NumPy e Pandas para análise inicial de dados tabulares com o CSV da aula 3.",
            "include": [
              "imports com aliases",
              "arrays NumPy",
              "cálculos com NumPy",
              "DataFrame manual",
              "leitura de CSV",
              "exploração com `head()`, `shape`, `columns` e `dtypes`",
              "seleção de colunas",
              "métricas em colunas",
              "filtros booleanos",
              "nova coluna com `np.where()`",
              "`value_counts()`",
              "`describe()`",
              "`groupby(\"setor\")`",
              "atividade final integrada"
            ],
            "exclude": [
              "Matplotlib",
              "Seaborn",
              "Scikit-learn",
              "regressão",
              "treino/teste",
              "merge",
              "join",
              "pivot",
              "pivot_table",
              "apply",
              "lambdas",
              "programação orientada a objetos"
            ],
            "notation": [
              "Usar lacunas no padrão `[[resposta::resposta|distrator]]`.",
              "Usar `code gap` quando a resposta pertence ao ponto exato do código.",
              "Usar crases em textos renderizáveis para identificadores, funções, operadores, arquivos e caminhos."
            ],
            "avoid": [
              "Não introduzir bibliotecas ou técnicas fora do escopo da aula.",
              "Não usar caminho de arquivo diferente de `/mnt/data/dataset_aula3_numpy_pandas.csv`.",
              "Não transformar a aula em referência extensa de Pandas."
            ]
          },
          "topics": [
            {
              "id": "topic-a03-imports-aliases",
              "label": "imports e aliases",
              "kind": "concept",
              "checks": [
                "usa `import numpy as np`",
                "usa `import pandas as pd`"
              ],
              "errors": [
                "inverter `np` e `pd`",
                "usar alias antes de importar"
              ]
            },
            {
              "id": "topic-a03-arrays-numpy",
              "label": "arrays NumPy",
              "kind": "concept",
              "checks": [
                "cria array com `np.array()`",
                "interpreta operação elemento a elemento"
              ],
              "errors": [
                "usar `array()` sem `np`",
                "confundir array com inserção em lista"
              ]
            },
            {
              "id": "topic-a03-dataframes",
              "label": "DataFrames Pandas",
              "kind": "concept",
              "checks": [
                "cria DataFrame com dicionário",
                "lê CSV com `pd.read_csv()`"
              ],
              "errors": [
                "usar listas de tamanhos diferentes",
                "esquecer aspas no caminho do CSV"
              ]
            },
            {
              "id": "topic-a03-exploracao",
              "label": "exploração inicial de DataFrame",
              "kind": "concept",
              "checks": [
                "usa `head()`",
                "interpreta `shape`, `columns` e `dtypes`"
              ],
              "errors": [
                "usar `df.shape()`",
                "confundir método com atributo"
              ]
            },
            {
              "id": "topic-a03-selecao-metricas",
              "label": "seleção e métricas em colunas",
              "kind": "concept",
              "checks": [
                "seleciona uma ou várias colunas",
                "calcula `mean()`, `max()` e `min()`"
              ],
              "errors": [
                "errar colchetes de múltiplas colunas",
                "aplicar método na coluna errada"
              ]
            },
            {
              "id": "topic-a03-filtros",
              "label": "filtros booleanos",
              "kind": "concept",
              "checks": [
                "cria máscara booleana",
                "aplica `df[condicao]`"
              ],
              "errors": [
                "usar `=` em comparação",
                "esquecer `df[...]`"
              ]
            },
            {
              "id": "topic-a03-nova-coluna",
              "label": "nova coluna com `np.where()`",
              "kind": "concept",
              "checks": [
                "cria `classificacao_temp`",
                "interpreta `ALTA` e `NORMAL`"
              ],
              "errors": [
                "inverter rótulos",
                "usar `>` quando a regra pede `>=`"
              ]
            },
            {
              "id": "topic-a03-contagem-agrupamento",
              "label": "contagem, resumo e agrupamento",
              "kind": "concept",
              "checks": [
                "usa `value_counts()`",
                "usa `describe()`",
                "calcula média por setor com `groupby()`"
              ],
              "errors": [
                "confundir frequência com média",
                "calcular média antes de agrupar"
              ]
            }
          ],
          "microsequences": [
            {
              "id": "micro-a03-01-imports-aliases",
              "title": "Importar bibliotecas com aliases",
              "goal": "Usar `import numpy as np` e `import pandas as pd`, entendendo `import`, `as`, `np` e `pd`.",
              "role": "support",
              "status": "generated",
              "dependsOn": [],
              "covers": [
                "import",
                "as",
                "alias",
                "NumPy",
                "Pandas"
              ],
              "checks": [
                "completa importação correta",
                "identifica `np` como apelido de NumPy",
                "identifica `pd` como apelido de Pandas"
              ],
              "errors": [
                "inverter aliases",
                "escrever `import np`",
                "usar biblioteca antes de importar"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Importar bibliotecas com aliases materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-01-import-as-aliases",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Importar com apelidos convencionais",
                      "text": "`import` serve para trazer uma biblioteca para o programa. `as` pode ser entendido como “como”: cria um apelido. Em análise de dados, NumPy costuma ser usado como `np` e Pandas como `pd`.",
                      "after": "Depois da importação, o apelido passa a ser o nome usado no código. Por isso `np.array()` depende de `import numpy as np`, e `pd.read_csv()` depende de `import pandas as pd`."
                    },
                    {
                      "id": "card-a03-01-completar-imports",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Imports da aula",
                      "prompt": "Complete as duas importações com os apelidos convencionais.",
                      "language": "python",
                      "code": "[[import::import|from|use]] numpy [[as::as|with|=]] [[np::np|pd|numpy]]\n[[import::import|from|use]] pandas [[as::as|with|=]] [[pd::pd|np|pandas]]",
                      "after": "`import` traz a biblioteca, `as` define o apelido, `np` identifica NumPy e `pd` identifica Pandas. Trocar os apelidos cria confusão nas chamadas seguintes."
                    },
                    {
                      "id": "card-a03-01-identificar-alias",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Alias correto",
                      "question": "Depois de executar `import pandas as pd`, o que `pd` representa?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "O apelido usado para acessar recursos do Pandas no código."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Um nome de coluna obrigatório em todo DataFrame."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Uma variável criada automaticamente pelo CSV."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Uma função que calcula média."
                        }
                      ],
                      "answer": "a",
                      "after": "`pd` é apenas um apelido. Ele não carrega dados sozinho; ele permite chamar funções da biblioteca, como `pd.DataFrame()` e `pd.read_csv()`."
                    },
                    {
                      "id": "card-a03-01-comparar-scripts-import",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Usar biblioteca depois de importar",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha o script que importa antes de usar os aliases.",
                      "after": "A versão correta cria os apelidos antes das chamadas. Usar `np` ou `pd` antes de importar gera erro porque esses nomes ainda não existem.",
                      "question": "Qual script prepara NumPy e Pandas corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "import numpy as np\nimport pandas as pd\n\nvalores = np.array([1, 2, 3])\ntabela = pd.DataFrame({\"valor\": valores})"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "valores = np.array([1, 2, 3])\nimport numpy as np\nimport pandas as pd\n\ntabela = pd.DataFrame({\"valor\": valores})"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "import np as numpy\nimport pd as pandas\n\nvalores = np.array([1, 2, 3])"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "import pandas as np\nimport numpy as pd\n\nvalores = np.array([1, 2, 3])"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a03-01-erro-import-np",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Erro provável no alias",
                      "question": "Qual linha tem maior chance de falhar porque tenta importar o apelido em vez da biblioteca?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`import numpy as np`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`import pandas as pd`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`import np`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")` depois de importar Pandas"
                        }
                      ],
                      "answer": "c",
                      "after": "`np` é o apelido criado depois da importação, não o nome da biblioteca a ser importada. A forma convencional é `import numpy as np`."
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
              "id": "micro-a03-02-array-numpy",
              "title": "Criar e observar array NumPy",
              "goal": "Criar `temperaturas = np.array([68, 72, 75, 81, 90])` e observar o tipo.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a03-01-imports-aliases"
              ],
              "covers": [
                "np.array()",
                "lista como entrada",
                "type()",
                "array"
              ],
              "checks": [
                "completa `np.array`",
                "explica que a lista é argumento de `np.array()`",
                "usa `print(type(temperaturas))`"
              ],
              "errors": [
                "esquecer colchetes",
                "usar `array()` sem `np`",
                "achar que array e lista são idênticos"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Criar e observar array NumPy materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-02-array-sentido",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Array como arranjo numérico",
                      "text": "`array` pode ser entendido como um arranjo de valores, especialmente numéricos. Em NumPy, `np.array([...])` recebe uma lista e cria uma estrutura própria para cálculos com vários valores.",
                      "after": "A lista fica dentro dos parênteses como argumento de `np.array()`. O resultado não é uma lista comum: ele é um objeto do NumPy preparado para operações numéricas."
                    },
                    {
                      "id": "card-a03-02-criar-array",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Criar `temperaturas`",
                      "prompt": "Complete a criação do array com os valores da aula.",
                      "language": "python",
                      "code": "temperaturas = np.[[array::array|list|DataFrame]]([68, 72, 75, 81, 90])\nprint(temperaturas)",
                      "after": "`np.array()` é a chamada correta porque `array` pertence ao NumPy acessado pelo alias `np`. A lista `[68, 72, 75, 81, 90]` é o argumento usado para criar o array."
                    },
                    {
                      "id": "card-a03-02-lista-array",
                      "position": 3,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Lista de entrada e array criado",
                      "columns": [
                        "Parte",
                        "Função no código",
                        "Exemplo"
                      ],
                      "rows": [
                        [
                          "Lista",
                          "agrupa os valores originais entre colchetes",
                          "`[68, 72, 75, 81, 90]`"
                        ],
                        [
                          "Chamada",
                          "entrega a lista ao NumPy",
                          "`np.array([68, 72, 75, 81, 90])`"
                        ],
                        [
                          "Variável",
                          "guarda o array para uso posterior",
                          "`temperaturas`"
                        ]
                      ],
                      "after": "A lista é o material de entrada; o array é o resultado guardado. Essa distinção evita tentar chamar `array()` sem o alias `np`."
                    },
                    {
                      "id": "card-a03-02-escolher-criacao-array",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Criação completa do array",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha a versão que cria o array com NumPy.",
                      "after": "A forma correta usa `np.array()` e coloca os valores dentro de uma lista. Sem `np`, o nome `array` não foi definido pelo código da aula.",
                      "question": "Qual versão cria `temperaturas` corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = np.array([68, 72, 75, 81, 90])"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = array(68, 72, 75, 81, 90)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = np.array(68, 72, 75, 81, 90)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "temperaturas = pd.array([68, 72, 75, 81, 90])"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a03-02-observar-tipo",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Observar o tipo",
                      "prompt": "Complete a chamada que mostra o tipo do objeto guardado.",
                      "language": "python",
                      "code": "temperaturas = np.array([68, 72, 75, 81, 90])\nprint([[type::type|print|array]](temperaturas))",
                      "after": "`type(temperaturas)` mostra a classe do objeto guardado. Isso confirma que `temperaturas` deixou de ser apenas a lista de entrada e passou a ser um array do NumPy."
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
              "id": "micro-a03-03-calculos-numpy",
              "title": "Soma, média, máximo e mínimo com NumPy",
              "goal": "Calcular `np.sum`, `np.mean`, `np.max` e `np.min`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-02-array-numpy"
              ],
              "covers": [
                "np.sum()",
                "np.mean()",
                "np.max()",
                "np.min()",
                "argumento array"
              ],
              "checks": [
                "escolhe função adequada para cada pergunta",
                "prevê resultados para `[68, 72, 75, 81, 90]`"
              ],
              "errors": [
                "usar `mean` sem `np`",
                "trocar máximo e mínimo",
                "passar nome errado do array"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Soma, média, máximo e mínimo com NumPy materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-03-funcoes-numpy",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Funções NumPy para o array",
                      "columns": [
                        "Pergunta",
                        "Função",
                        "Resultado para `[68, 72, 75, 81, 90]`"
                      ],
                      "rows": [
                        [
                          "Qual é a soma?",
                          "`np.sum(temperaturas)`",
                          "`386`"
                        ],
                        [
                          "Qual é a média?",
                          "`np.mean(temperaturas)`",
                          "`77.2`"
                        ],
                        [
                          "Qual é o maior valor?",
                          "`np.max(temperaturas)`",
                          "`90`"
                        ],
                        [
                          "Qual é o menor valor?",
                          "`np.min(temperaturas)`",
                          "`68`"
                        ]
                      ],
                      "after": "`sum`, `mean`, `max` e `min` indicam soma, média, máximo e mínimo. Na aula, eles são chamados pelo alias `np` e recebem o array como argumento."
                    },
                    {
                      "id": "card-a03-03-completar-funcoes",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Completar cálculos",
                      "prompt": "Complete as funções adequadas para cada métrica.",
                      "language": "python",
                      "code": "temperaturas = np.array([68, 72, 75, 81, 90])\n\nsoma = np.[[sum::sum|mean|max]](temperaturas)\nmedia = np.[[mean::mean|sum|min]](temperaturas)\nmaior = np.[[max::max|min|mean]](temperaturas)\nmenor = np.[[min::min|max|sum]](temperaturas)",
                      "after": "Cada função responde a uma pergunta diferente. O detalhe decisivo é manter o mesmo argumento, `temperaturas`, e trocar apenas a função conforme a métrica pedida."
                    },
                    {
                      "id": "card-a03-03-prever-media",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Previsão da média",
                      "question": "Para `temperaturas = np.array([68, 72, 75, 81, 90])`, qual é o resultado de `np.mean(temperaturas)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`77.2`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`386`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`90`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`68`"
                        }
                      ],
                      "answer": "a",
                      "after": "A média é a soma `386` dividida por `5`, resultando em `77.2`. Os outros valores representam soma, máximo ou mínimo."
                    },
                    {
                      "id": "card-a03-03-max-min",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Máximo e mínimo",
                      "question": "Qual par corresponde a `np.max(temperaturas)` e `np.min(temperaturas)` nessa ordem?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`90` e `68`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`68` e `90`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`386` e `77.2`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`75` e `81`"
                        }
                      ],
                      "answer": "a",
                      "after": "`max` procura o maior valor do array e `min` procura o menor. Trocar a ordem é um erro comum quando os nomes das funções são parecidos."
                    },
                    {
                      "id": "card-a03-03-escolher-media",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Chamada correta de média",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha a versão que calcula a média com NumPy.",
                      "after": "A chamada correta usa `np.mean(temperaturas)`. Usar `mean` sem `np` ou trocar o nome da variável impede que o código use o array criado.",
                      "question": "Qual linha calcula a média do array `temperaturas`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "media = np.mean(temperaturas)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "media = mean(temperaturas)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "media = np.media(temperaturas)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "media = np.mean(temperatura)"
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
              "activeVersion": "version-001"
            },
            {
              "id": "micro-a03-04-operacao-vetorizada",
              "title": "Somar valor a todos os elementos",
              "goal": "Entender operação vetorizada com `temperaturas + 2`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-03-calculos-numpy"
              ],
              "covers": [
                "operação com todos os elementos",
                "array original",
                "resultado calculado"
              ],
              "checks": [
                "prevê resultado `[70, 74, 77, 83, 92]`",
                "distingue operação em array de inserção em lista"
              ],
              "errors": [
                "tentar usar `append(2)` para somar 2",
                "achar que `+ 2` altera automaticamente o array original sem atribuição"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Somar valor a todos os elementos materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-04-operacao-vetorizada",
                      "position": 1,
                      "resource": "code",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Operação aplicada ao array",
                      "prompt": "Observe a operação com todos os elementos.",
                      "language": "python",
                      "code": "temperaturas = np.array([68, 72, 75, 81, 90])\najustadas = temperaturas + 2\nprint(ajustadas)",
                      "after": "Em um array NumPy, `temperaturas + 2` soma `2` a cada elemento. Esse comportamento é diferente de adicionar um item ao final de uma lista."
                    },
                    {
                      "id": "card-a03-04-antes-depois",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Resultado elemento a elemento",
                      "columns": [
                        "Posição",
                        "Valor original",
                        "Após `+ 2`"
                      ],
                      "rows": [
                        [
                          "1",
                          "`68`",
                          "`70`"
                        ],
                        [
                          "2",
                          "`72`",
                          "`74`"
                        ],
                        [
                          "3",
                          "`75`",
                          "`77`"
                        ],
                        [
                          "4",
                          "`81`",
                          "`83`"
                        ],
                        [
                          "5",
                          "`90`",
                          "`92`"
                        ]
                      ],
                      "after": "A operação preserva a quantidade de elementos e altera cada valor no resultado calculado. Não é uma concatenação nem uma inserção."
                    },
                    {
                      "id": "card-a03-04-prever-saida",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Prever array ajustado",
                      "prompt": "Observe o código.",
                      "language": "python",
                      "code": "temperaturas = np.array([68, 72, 75, 81, 90])\najustadas = temperaturas + 2\nprint(ajustadas)",
                      "after": "`+ 2` é aplicado a cada posição do array, por isso todos os valores aumentam em dois pontos.",
                      "question": "Qual saída corresponde a `print(ajustadas)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`[70 74 77 83 92]`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`[68 72 75 81 90 2]`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`[136 144 150 162 180]`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`[68 72 75 81 90]`"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a03-04-erro-append",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Somar não é inserir",
                      "question": "Qual alternativa descreve corretamente a diferença entre `temperaturas + 2` e uma inserção no final?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`temperaturas + 2` soma `2` a cada elemento do array."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`temperaturas + 2` coloca o número `2` como último elemento."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`temperaturas + 2` calcula apenas a média do array."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`temperaturas + 2` transforma todos os valores em texto."
                        }
                      ],
                      "answer": "a",
                      "after": "A operação é numérica e elemento a elemento. Confundir isso com inserir no final leva a um resultado com quantidade de elementos errada."
                    },
                    {
                      "id": "card-a03-04-completar-operacao",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Guardar resultado ajustado",
                      "prompt": "Complete o operador que soma `2` a cada elemento.",
                      "language": "python",
                      "code": "temperaturas = np.array([68, 72, 75, 81, 90])\ntemperaturas_ajustadas = temperaturas [[+::+|==|append]] 2",
                      "after": "O operador `+` cria o resultado elemento a elemento. Para guardar esse resultado em outro nome, é preciso usar atribuição com `=` à esquerda."
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
              "id": "micro-a03-05-dataframe-manual",
              "title": "Criar DataFrame a partir de dicionário",
              "goal": "Criar tabela com `pd.DataFrame(dados)` usando colunas `maquina`, `temperatura` e `status`.",
              "role": "explain",
              "status": "generated",
              "dependsOn": [
                "micro-a03-01-imports-aliases"
              ],
              "covers": [
                "dicionário de listas",
                "pd.DataFrame()",
                "linhas e colunas",
                "tabela"
              ],
              "checks": [
                "reconhece chaves como nomes de coluna",
                "cria DataFrame com listas de mesmo tamanho"
              ],
              "errors": [
                "listas com tamanhos diferentes",
                "usar `DataFrame` sem `pd`",
                "confundir linha com coluna"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Criar DataFrame a partir de dicionário materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-05-dataframe-sentido",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "DataFrame como tabela",
                      "text": "`DataFrame` é uma estrutura tabular do Pandas, parecida com uma tabela com linhas e colunas. Uma forma simples de criá-lo é passar um dicionário em que cada chave vira nome de coluna.",
                      "after": "Quando as listas do dicionário têm o mesmo tamanho, o Pandas consegue alinhar os valores por linha. Se uma lista tiver tamanho diferente, a tabela fica inconsistente e a criação falha."
                    },
                    {
                      "id": "card-a03-05-dicionario-colunas",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Dicionário que vira tabela",
                      "columns": [
                        "Chave no dicionário",
                        "Valores",
                        "Coluna no DataFrame"
                      ],
                      "rows": [
                        [
                          "`maquina`",
                          "`[\"M1\", \"M2\", \"M3\"]`",
                          "`maquina`"
                        ],
                        [
                          "`temperatura`",
                          "`[72, 78, 69]`",
                          "`temperatura`"
                        ],
                        [
                          "`status`",
                          "`[\"ok\", \"alerta\", \"ok\"]`",
                          "`status`"
                        ]
                      ],
                      "after": "As chaves nomeiam as colunas, e cada posição das listas compõe uma linha. Por isso todas as listas precisam ter três valores nesse exemplo."
                    },
                    {
                      "id": "card-a03-05-completar-dataframe",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Criar DataFrame manual",
                      "prompt": "Complete a chamada que transforma o dicionário em DataFrame.",
                      "language": "python",
                      "code": "dados = {\n    \"maquina\": [\"M1\", \"M2\", \"M3\"],\n    \"temperatura\": [72, 78, 69],\n    \"status\": [\"ok\", \"alerta\", \"ok\"]\n}\n\ntabela = pd.[[DataFrame::DataFrame|read_csv|array]](dados)\nprint(tabela)",
                      "after": "`pd.DataFrame(dados)` cria uma tabela a partir do dicionário. `read_csv()` é para ler arquivo CSV; `array()` pertence ao NumPy, não ao Pandas."
                    },
                    {
                      "id": "card-a03-05-chave-coluna",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Chaves como nomes de coluna",
                      "question": "No dicionário `dados`, o que acontece com a chave `\"temperatura\"` ao executar `pd.DataFrame(dados)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Ela vira o nome de uma coluna do DataFrame."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Ela vira sempre a primeira linha da tabela."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Ela é descartada porque contém texto."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Ela define o número total de linhas."
                        }
                      ],
                      "answer": "a",
                      "after": "Em um DataFrame criado de dicionário, cada chave organiza uma coluna. As posições dos valores em cada lista formam as linhas."
                    },
                    {
                      "id": "card-a03-05-comparar-listas",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Listas de mesmo tamanho",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha o dicionário adequado para criar o DataFrame.",
                      "after": "A versão correta mantém três valores em cada coluna e usa `pd.DataFrame(dados)`. Tamanhos diferentes impedem o alinhamento linha a linha.",
                      "question": "Qual versão cria uma tabela de três linhas sem desequilibrar as colunas?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "dados = {\n    \"maquina\": [\"M1\", \"M2\", \"M3\"],\n    \"temperatura\": [72, 78, 69],\n    \"status\": [\"ok\", \"alerta\", \"ok\"]\n}\ntabela = pd.DataFrame(dados)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "dados = {\n    \"maquina\": [\"M1\", \"M2\"],\n    \"temperatura\": [72, 78, 69],\n    \"status\": [\"ok\", \"alerta\", \"ok\"]\n}\ntabela = pd.DataFrame(dados)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "dados = {\n    \"maquina\": [\"M1\", \"M2\", \"M3\"],\n    \"temperatura\": [72],\n    \"status\": [\"ok\", \"alerta\", \"ok\"]\n}\ntabela = DataFrame(dados)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "dados = [\"maquina\", \"temperatura\", \"status\"]\ntabela = pd.DataFrame()"
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
              "activeVersion": "version-001"
            },
            {
              "id": "micro-a03-06-ler-csv",
              "title": "Ler a base da aula com `pd.read_csv()`",
              "goal": "Abrir o CSV correto e guardar em `df`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-05-dataframe-manual"
              ],
              "covers": [
                "pd.read_csv()",
                "caminho correto do arquivo",
                "variável `df`"
              ],
              "checks": [
                "usa `/mnt/data/dataset_aula3_numpy_pandas.csv`",
                "reconhece que o caminho do CSV da aula 3 deve ser mantido"
              ],
              "errors": [
                "esquecer aspas no caminho",
                "chamar `read_csv` sem `pd`",
                "não guardar o resultado em `df`"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Ler a base da aula com `pd.read_csv()` materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-06-read-csv-sentido",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Ler CSV com Pandas",
                      "text": "`read_csv` significa ler um arquivo CSV. Na aula, `pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")` abre a base e o resultado costuma ser guardado em `df`, abreviação comum para DataFrame.",
                      "after": "O caminho precisa apontar para o arquivo correto da aula 3 e ficar entre aspas, pois é um texto. Depois do carregamento, `df` passa a representar a tabela carregada."
                    },
                    {
                      "id": "card-a03-06-completar-leitura",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Carregar a base correta",
                      "prompt": "Complete a função que lê o CSV da aula 3.",
                      "language": "python",
                      "code": "df = pd.[[read_csv::read_csv|DataFrame|head]](\"/mnt/data/dataset_aula3_numpy_pandas.csv\")",
                      "after": "`pd.read_csv()` é a função de leitura de CSV do Pandas. O arquivo correto é `dataset_aula3_numpy_pandas.csv`, e o resultado fica disponível em `df`."
                    },
                    {
                      "id": "card-a03-06-caminho-com-aspas",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Caminho como texto",
                      "question": "Por que o caminho `/mnt/data/dataset_aula3_numpy_pandas.csv` aparece entre aspas na chamada de leitura?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Porque o caminho é um texto que identifica o arquivo no sistema."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Porque aspas transformam o arquivo em número."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Porque `read_csv()` só aceita nomes de colunas."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Porque `df` precisa ser criado como texto."
                        }
                      ],
                      "answer": "a",
                      "after": "O caminho é passado como argumento textual. Sem aspas, Python tentaria interpretar partes do caminho como nomes ou operadores."
                    },
                    {
                      "id": "card-a03-06-comparar-read-csv",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Versão correta de leitura",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha a versão que lê a base da aula 3 e guarda em df.",
                      "after": "A versão correta usa `pd.read_csv()` com o caminho textual do CSV da aula 3. O erro mais comum é esquecer o alias `pd` ou as aspas do caminho.",
                      "question": "Qual versão carrega o CSV corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "df = pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "df = read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "df = pd.read_csv(/mnt/data/dataset_aula3_numpy_pandas.csv)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")"
                        }
                      ],
                      "answer": "a",
                      "afterBlocks": [
                        {
                          "language": "python",
                          "code": "import pandas as pd\n\ndf = pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")\nprint(df.head())",
                          "kind": "code",
                          "prompt": "Veja o código completo."
                        }
                      ]
                    },
                    {
                      "id": "card-a03-06-validar-primeira-leitura",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Conferir o carregamento",
                      "prompt": "Complete a chamada que mostra as primeiras linhas após carregar o arquivo.",
                      "language": "python",
                      "code": "df = pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")\nprint(df.[[head::head|shape|columns]]())",
                      "after": "`head()` mostra as primeiras linhas e ajuda a verificar se o CSV foi carregado. `shape` e `columns` também são úteis, mas não mostram as linhas iniciais."
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
              "id": "micro-a03-07-explorar-estrutura",
              "title": "Ver primeiras linhas, formato, colunas e tipos",
              "goal": "Usar `head()`, `shape`, `columns` e `dtypes` para diagnosticar o DataFrame.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-06-ler-csv"
              ],
              "covers": [
                "df.head()",
                "df.shape",
                "df.columns",
                "df.dtypes"
              ],
              "checks": [
                "interpreta `(40, 6)` como 40 linhas e 6 colunas",
                "distingue método com parênteses de atributo sem parênteses"
              ],
              "errors": [
                "usar `df.shape()` como se fosse método",
                "esquecer parênteses em `head()`",
                "confundir `columns` com valores da coluna"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Ver primeiras linhas, formato, colunas e tipos materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-07-termos-estrutura",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Primeiros diagnósticos do DataFrame",
                      "columns": [
                        "Elemento",
                        "Sentido prático",
                        "Como usar"
                      ],
                      "rows": [
                        [
                          "`head`",
                          "cabeça/início; mostra primeiras linhas",
                          "`df.head()`"
                        ],
                        [
                          "`shape`",
                          "formato; par `(linhas, colunas)`",
                          "`df.shape`"
                        ],
                        [
                          "`columns`",
                          "nomes das colunas",
                          "`df.columns`"
                        ],
                        [
                          "`dtypes`",
                          "tipos de dados das colunas",
                          "`df.dtypes`"
                        ]
                      ],
                      "after": "`head()` tem parênteses porque chama um método. `shape`, `columns` e `dtypes` são atributos observados sem parênteses."
                    },
                    {
                      "id": "card-a03-07-metodo-atributo",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Método e atributos",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha a versão que usa parênteses apenas onde precisa.",
                      "after": "A versão correta chama `head()` com parênteses e observa `shape`, `columns` e `dtypes` sem parênteses. Tratar `shape` como método é um erro comum.",
                      "question": "Qual bloco usa corretamente `head()`, `shape`, `columns` e `dtypes`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "print(df.head())\nprint(df.shape)\nprint(df.columns)\nprint(df.dtypes)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "print(df.head)\nprint(df.shape())\nprint(df.columns())\nprint(df.dtypes())"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "print(df.head)\nprint(df.shape)\nprint(df.columns)\nprint(df.dtypes)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "print(df.head())\nprint(df.shape())\nprint(df.columns)\nprint(df.dtypes)"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a03-07-shape-lacuna",
                      "position": 3,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Interpretar `shape`",
                      "text": "Na base da aula, `df.shape` deve devolver `(40, 6)`, isto é, [[40 linhas e 6 colunas::40 linhas e 6 colunas|6 linhas e 40 colunas|40 colunas e 6 tipos]].",
                      "after": "`shape` é lido na ordem `(linhas, colunas)`. O primeiro número indica registros; o segundo indica variáveis disponíveis."
                    },
                    {
                      "id": "card-a03-07-interpretar-shape",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Formato da base",
                      "question": "O que significa `df.shape` devolver `(40, 6)`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "A base tem `40` linhas e `6` colunas."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "A base tem `6` linhas e `40` colunas."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "A base tem `40` tipos de dados e `6` primeiras linhas."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "A base tem `46` valores ao todo."
                        }
                      ],
                      "answer": "a",
                      "after": "O par segue a ordem `(linhas, colunas)`. Confundir a ordem muda a interpretação do tamanho da base."
                    },
                    {
                      "id": "card-a03-07-completar-diagnostico",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Comandos de diagnóstico",
                      "prompt": "Complete cada acesso conforme o tipo de operação.",
                      "language": "python",
                      "code": "print(df.[[head::head|shape|columns]]())\nprint(df.[[shape::shape|head|read_csv]])\nprint(df.[[columns::columns|head|mean]])\nprint(df.[[dtypes::dtypes|describe|groupby]])",
                      "after": "`head()` é chamada; `shape`, `columns` e `dtypes` são observados. Essa diferença evita erros de parênteses no começo da exploração."
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
              "id": "micro-a03-08-selecionar-colunas",
              "title": "Selecionar uma ou várias colunas",
              "goal": "Usar `df[\"temperatura_c\"]` e `df[[\"setor\", \"temperatura_c\", \"producao_dia\"]]`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-07-explorar-estrutura"
              ],
              "covers": [
                "coluna única",
                "múltiplas colunas",
                "colchetes simples e duplos"
              ],
              "checks": [
                "seleciona coluna única corretamente",
                "usa lista de nomes para várias colunas"
              ],
              "errors": [
                "esquecer aspas nos nomes de coluna",
                "usar uma tupla em vez de lista de colunas",
                "escrever nome de coluna inexistente"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Selecionar uma ou várias colunas materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-08-simples-duplos",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Selecionar uma ou várias colunas",
                      "columns": [
                        "Objetivo",
                        "Forma",
                        "Resultado esperado"
                      ],
                      "rows": [
                        [
                          "Uma coluna",
                          "`df[\"temperatura_c\"]`",
                          "uma Series com valores de temperatura"
                        ],
                        [
                          "Várias colunas",
                          "`df[[\"setor\", \"temperatura_c\", \"producao_dia\"]]`",
                          "um DataFrame com as colunas escolhidas"
                        ],
                        [
                          "Nome da coluna",
                          "texto entre aspas",
                          "evita procurar uma variável com esse nome"
                        ]
                      ],
                      "after": "Para várias colunas, os colchetes externos selecionam no DataFrame e os internos criam uma lista de nomes. Essa dupla camada é o ponto mais fácil de errar."
                    },
                    {
                      "id": "card-a03-08-coluna-unica-gap",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Selecionar temperatura",
                      "prompt": "Complete o nome da coluna de temperatura.",
                      "language": "python",
                      "code": "temperaturas = df[\"[[temperatura_c::temperatura_c|temperatura|temp_c]]\"]\nprint(temperaturas.head())",
                      "after": "O nome da coluna no CSV é `temperatura_c`. Usar um nome aproximado, como `temperatura`, falha porque a coluna não existe com esse rótulo."
                    },
                    {
                      "id": "card-a03-08-varias-colunas-choice",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Selecionar várias colunas",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha a versão que seleciona setor, temperatura e produção.",
                      "after": "A versão correta usa uma lista de nomes dentro dos colchetes de seleção: `df[[...]]`. Sem a lista, o Pandas interpreta a chave de forma incorreta.",
                      "question": "Qual versão seleciona `setor`, `temperatura_c` e `producao_dia`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "recorte = df[[\"setor\", \"temperatura_c\", \"producao_dia\"]]"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "recorte = df[\"setor\", \"temperatura_c\", \"producao_dia\"]"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "recorte = df[[setor, temperatura_c, producao_dia]]"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "recorte = df[\"setor\" + \"temperatura_c\" + \"producao_dia\"]"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a03-08-colunas-da-base",
                      "position": 4,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Colunas disponíveis na base",
                      "columns": [
                        "Coluna",
                        "Tipo de informação"
                      ],
                      "rows": [
                        [
                          "`id_registro`",
                          "identificador da linha"
                        ],
                        [
                          "`setor`",
                          "área do processo"
                        ],
                        [
                          "`temperatura_c`",
                          "temperatura em graus Celsius"
                        ],
                        [
                          "`tempo_ciclo_s`",
                          "tempo do ciclo em segundos"
                        ],
                        [
                          "`producao_dia`",
                          "produção registrada no dia"
                        ],
                        [
                          "`falha`",
                          "indicador numérico de falha"
                        ]
                      ],
                      "after": "Selecionar coluna exige escrever o rótulo exatamente como ele aparece em `df.columns`, inclusive sublinhados."
                    },
                    {
                      "id": "card-a03-08-series-dataframe",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Uma coluna ou tabela recortada",
                      "question": "Qual alternativa descreve melhor a diferença entre `df[\"temperatura_c\"]` e `df[[\"temperatura_c\", \"producao_dia\"]]`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "A primeira seleciona uma coluna; a segunda seleciona uma tabela com duas colunas."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "As duas selecionam sempre a base inteira."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "A primeira remove a coluna; a segunda altera os valores."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "A primeira calcula média; a segunda calcula máximo."
                        }
                      ],
                      "answer": "a",
                      "after": "Colchetes simples com um nome retornam uma coluna. Colchetes com uma lista de nomes retornam um DataFrame recortado."
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
              "id": "micro-a03-09-calculos-colunas",
              "title": "Calcular métricas em colunas",
              "goal": "Calcular média de temperatura, maior produção e menor tempo de ciclo.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-08-selecionar-colunas"
              ],
              "covers": [
                "mean()",
                "max()",
                "min()",
                "Series"
              ],
              "checks": [
                "calcula média de `temperatura_c` aproximadamente `72.53`",
                "calcula maior `producao_dia` igual a `159`",
                "calcula menor `tempo_ciclo_s` igual a `27.20`"
              ],
              "errors": [
                "aplicar método à coluna errada",
                "esquecer parênteses nos métodos",
                "confundir média com soma"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Calcular métricas em colunas materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-09-metricas-colunas",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Métodos para métricas em colunas",
                      "columns": [
                        "Pergunta",
                        "Código",
                        "Resultado verificável"
                      ],
                      "rows": [
                        [
                          "Média de temperatura",
                          "`df[\"temperatura_c\"].mean()`",
                          "aproximadamente `72.53`"
                        ],
                        [
                          "Maior produção",
                          "`df[\"producao_dia\"].max()`",
                          "`159`"
                        ],
                        [
                          "Menor tempo de ciclo",
                          "`df[\"tempo_ciclo_s\"].min()`",
                          "`27.20`"
                        ]
                      ],
                      "after": "`mean` indica média, `max` indica máximo e `min` indica mínimo. Em Pandas, esses métodos são chamados na coluna selecionada."
                    },
                    {
                      "id": "card-a03-09-completar-metricas",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Completar métodos de coluna",
                      "prompt": "Complete o método certo para cada métrica.",
                      "language": "python",
                      "code": "media_temp = df[\"temperatura_c\"].[[mean::mean|max|min]]()\nmaior_producao = df[\"producao_dia\"].[[max::max|mean|min]]()\nmenor_ciclo = df[\"tempo_ciclo_s\"].[[min::min|max|mean]]()",
                      "after": "A coluna define o conjunto de valores; o método define a métrica calculada. Trocar coluna ou método muda a pergunta respondida."
                    },
                    {
                      "id": "card-a03-09-media-verificavel",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Média da temperatura",
                      "question": "Qual valor corresponde à média de `temperatura_c` da base, arredondada a duas casas?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`72.53`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`159`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`27.20`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`40.00`"
                        }
                      ],
                      "answer": "a",
                      "after": "A média da coluna `temperatura_c` é aproximadamente `72.53`. `159` é a maior produção e `27.20` é o menor tempo de ciclo."
                    },
                    {
                      "id": "card-a03-09-script-metricas",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Métricas corretas",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha o script que calcula as três métricas pedidas.",
                      "after": "A versão correta aplica `mean()` em `temperatura_c`, `max()` em `producao_dia` e `min()` em `tempo_ciclo_s`.",
                      "question": "Qual bloco responde às três perguntas da aula?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "media_temp = df[\"temperatura_c\"].mean()\nmaior_producao = df[\"producao_dia\"].max()\nmenor_ciclo = df[\"tempo_ciclo_s\"].min()"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "media_temp = df[\"producao_dia\"].mean()\nmaior_producao = df[\"temperatura_c\"].max()\nmenor_ciclo = df[\"tempo_ciclo_s\"].min()"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "media_temp = df[\"temperatura_c\"].sum()\nmaior_producao = df[\"producao_dia\"].mean()\nmenor_ciclo = df[\"tempo_ciclo_s\"].max()"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "media_temp = df.mean(\"temperatura_c\")\nmaior_producao = df.max(\"producao_dia\")\nmenor_ciclo = df.min(\"tempo_ciclo_s\")"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a03-09-lacuna-metodo",
                      "position": 5,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Escolher a métrica",
                      "text": "Para encontrar o menor valor de `tempo_ciclo_s`, use `df[\"tempo_ciclo_s\"].[[min()::min()|max()|mean()]]`.",
                      "after": "`min()` procura o menor valor da coluna selecionada. `max()` responderia à pergunta oposta, e `mean()` calcularia média."
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
              "id": "micro-a03-10-filtrar-linhas",
              "title": "Filtrar linhas com condições booleanas",
              "goal": "Criar filtros para `temperatura_c > 75` e `falha == 1`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-09-calculos-colunas"
              ],
              "covers": [
                "comparação booleana",
                "máscara",
                "df[condicao]",
                "=="
              ],
              "checks": [
                "usa `>` para temperatura acima de 75",
                "usa `==` para falha igual a 1",
                "entende que a condição seleciona linhas"
              ],
              "errors": [
                "usar `=` em vez de `==`",
                "comparar texto com número",
                "esquecer `df[...]` ao aplicar a condição"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Filtrar linhas com condições booleanas materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-10-fluxo-filtro",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Como um filtro seleciona linhas",
                      "prompt": "Observe o processo de filtragem com uma condição booleana.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Escolher uma coluna"
                          },
                          {
                            "kind": "process",
                            "text": "Comparar valores, como `df[\"temperatura_c\"] > 75`"
                          },
                          {
                            "kind": "process",
                            "text": "Gerar uma máscara com verdadeiro ou falso por linha"
                          },
                          {
                            "kind": "process",
                            "text": "Aplicar a máscara com `df[condicao]`"
                          },
                          {
                            "kind": "output",
                            "text": "Obter apenas as linhas que passam no teste"
                          },
                          {
                            "kind": "end",
                            "text": "Usar ou exibir o recorte"
                          }
                        ]
                      },
                      "after": "A condição booleana não é o recorte final; ela é a máscara. O recorte aparece quando a máscara é colocada dentro de `df[...]`."
                    },
                    {
                      "id": "card-a03-10-filtro-temperatura",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Temperatura acima de `75`",
                      "prompt": "Complete a comparação e aplique o filtro ao DataFrame.",
                      "language": "python",
                      "code": "filtro_temp = df[\"temperatura_c\"] [[>::>|>=|==]] 75\naltas = [[df[filtro_temp]::df[filtro_temp]|filtro_temp|df[\"temperatura_c\"] > 75]]\nprint(altas)",
                      "after": "`>` seleciona temperaturas estritamente acima de `75`. Depois, `df[filtro_temp]` aplica a máscara e retorna as linhas correspondentes."
                    },
                    {
                      "id": "card-a03-10-filtro-falha",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Filtrar falhas",
                      "prompt": "Complete a comparação para selecionar linhas com `falha` igual a `1`.",
                      "language": "python",
                      "code": "filtro_falha = df[\"falha\"] [[==::==|=|>]] 1\nfalhas = df[filtro_falha]\nprint(falhas)",
                      "after": "`==` compara valores. Usar `=` nesse ponto tentaria atribuir valor e não cria uma comparação válida para filtrar linhas."
                    },
                    {
                      "id": "card-a03-10-igualdade",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Comparação de igualdade",
                      "question": "Em um filtro Pandas, por que usamos `df[\"falha\"] == 1` em vez de `df[\"falha\"] = 1`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`==` testa igualdade e gera verdadeiro ou falso por linha."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`=` testa igualdade e mantém a base intacta."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`==` cria uma nova coluna automaticamente."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`=` sempre conta os registros com falha."
                        }
                      ],
                      "answer": "a",
                      "after": "Filtro precisa de uma condição. `==` produz uma máscara booleana; `=` é atribuição e não responde se cada linha tem falha igual a `1`."
                    },
                    {
                      "id": "card-a03-10-contagens-filtros",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Contagens após filtros",
                      "question": "Na base da aula, quantas linhas satisfazem `temperatura_c > 75` e quantas têm `falha == 1`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`15` linhas acima de `75` e `12` linhas com falha."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`12` linhas acima de `75` e `15` linhas com falha."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`28` linhas acima de `75` e `17` linhas com falha."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`40` linhas acima de `75` e `6` linhas com falha."
                        }
                      ],
                      "answer": "a",
                      "after": "A condição de temperatura acima de `75` seleciona `15` registros. A coluna `falha` tem `12` registros com valor `1`."
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
              "id": "micro-a03-11-nova-coluna-np-where",
              "title": "Criar coluna com `np.where()`",
              "goal": "Criar `classificacao_temp` com `ALTA` para `temperatura_c >= 75` e `NORMAL` caso contrário.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-10-filtrar-linhas"
              ],
              "covers": [
                "np.where(condicao, valor_true, valor_false)",
                "nova coluna",
                "condição vetorizada"
              ],
              "checks": [
                "completa ordem dos argumentos",
                "interpreta `ALTA` = 15 e `NORMAL` = 25"
              ],
              "errors": [
                "inverter `ALTA` e `NORMAL`",
                "usar `if` comum linha a linha",
                "usar `>` quando o critério pede `>=`"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Criar coluna com `np.where()` materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-11-where-sentido",
                      "position": 1,
                      "resource": "paragraph",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "`where` para escolher rótulos",
                      "text": "`where` significa “onde” neste contexto: `np.where(condicao, valor_se_verdadeiro, valor_se_falso)` escolhe um valor quando a condição é verdadeira e outro quando é falsa.",
                      "after": "Na aula, a condição é `df[\"temperatura_c\"] >= 75`. Linhas que passam recebem `ALTA`; as demais recebem `NORMAL`."
                    },
                    {
                      "id": "card-a03-11-regra-classificacao",
                      "position": 2,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Regra da nova coluna",
                      "columns": [
                        "Condição por linha",
                        "Valor em `classificacao_temp`"
                      ],
                      "rows": [
                        [
                          "`temperatura_c >= 75` é verdadeira",
                          "`ALTA`"
                        ],
                        [
                          "`temperatura_c >= 75` é falsa",
                          "`NORMAL`"
                        ]
                      ],
                      "after": "A ordem dos argumentos importa: primeiro vem a condição, depois o valor para verdadeiro, depois o valor para falso."
                    },
                    {
                      "id": "card-a03-11-completar-where",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Criar `classificacao_temp`",
                      "prompt": "Complete a nova coluna usando `np.where()`.",
                      "language": "python",
                      "code": "df[\"classificacao_temp\"] = np.[[where::where|mean|value_counts]](\n    df[\"temperatura_c\"] [[>=::>=|>|==]] 75,\n    \"[[ALTA::ALTA|NORMAL|75]]\",\n    \"[[NORMAL::NORMAL|ALTA|0]]\"\n)",
                      "after": "`np.where()` aplica a regra linha a linha. O operador `>=` inclui temperatura igual a `75`, e a ordem `ALTA`, depois `NORMAL`, segue verdadeiro e falso."
                    },
                    {
                      "id": "card-a03-11-classificar-amostras",
                      "position": 4,
                      "resource": "composite",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Classificar temperaturas de exemplo",
                      "blocks": [
                        {
                          "columns": [
                            "`temperatura_c`",
                            "Teste `>= 75`",
                            "Classificação esperada"
                          ],
                          "rows": [
                            [
                              "`74.90`",
                              "falso",
                              "`NORMAL`"
                            ],
                            [
                              "`75.00`",
                              "verdadeiro",
                              "`ALTA`"
                            ],
                            [
                              "`80.00`",
                              "verdadeiro",
                              "`ALTA`"
                            ]
                          ],
                          "kind": "table"
                        },
                        {
                          "language": "python",
                          "code": "np.where(df[\"temperatura_c\"] >= 75, \"ALTA\", \"NORMAL\")",
                          "kind": "code",
                          "prompt": "Observe o código."
                        },
                        {
                          "kind": "choice",
                          "question": "Qual alternativa segue a regra mostrada?",
                          "options": [
                            {
                              "id": "a",
                              "kind": "text",
                              "text": "`74.90 -> NORMAL`, `75.00 -> ALTA`, `80.00 -> ALTA`"
                            },
                            {
                              "id": "b",
                              "kind": "text",
                              "text": "`74.90 -> ALTA`, `75.00 -> NORMAL`, `80.00 -> NORMAL`"
                            },
                            {
                              "id": "c",
                              "kind": "text",
                              "text": "`74.90 -> NORMAL`, `75.00 -> NORMAL`, `80.00 -> ALTA`"
                            },
                            {
                              "id": "d",
                              "kind": "text",
                              "text": "`74.90 -> ALTA`, `75.00 -> ALTA`, `80.00 -> NORMAL`"
                            }
                          ],
                          "answer": "a"
                        }
                      ],
                      "after": "O detalhe decisivo é o `>=`: o valor `75.00` entra no grupo `ALTA`. Inverter os rótulos ou usar apenas `>` mudaria essa linha."
                    },
                    {
                      "id": "card-a03-11-versao-where",
                      "position": 5,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Ordem correta dos argumentos",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha a versão que cria a coluna com a regra da aula.",
                      "after": "A versão correta atribui o resultado a `df[\"classificacao_temp\"]` e mantém a ordem `condição`, valor verdadeiro e valor falso.",
                      "question": "Qual script cria `classificacao_temp` corretamente?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "df[\"classificacao_temp\"] = np.where(\n    df[\"temperatura_c\"] >= 75,\n    \"ALTA\",\n    \"NORMAL\"\n)"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "df[\"classificacao_temp\"] = np.where(\n    df[\"temperatura_c\"] >= 75,\n    \"NORMAL\",\n    \"ALTA\"\n)"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "df[\"classificacao_temp\"] = where(\n    df[\"temperatura_c\"] >= 75,\n    \"ALTA\",\n    \"NORMAL\"\n)"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "np.where(\n    df[\"temperatura_c\"] >= 75,\n    \"ALTA\",\n    \"NORMAL\"\n)"
                        }
                      ],
                      "answer": "a",
                      "afterBlocks": [
                        {
                          "language": "python",
                          "code": "df[\"classificacao_temp\"] = np.where(\n    df[\"temperatura_c\"] >= 75,\n    \"ALTA\",\n    \"NORMAL\"\n)\n\nprint(df.head())",
                          "kind": "code",
                          "prompt": "Veja o código completo."
                        }
                      ]
                    },
                    {
                      "id": "card-a03-11-contagem-classificacao",
                      "position": 6,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Contagem da nova coluna",
                      "question": "Com a regra `temperatura_c >= 75`, qual contagem deve aparecer para `classificacao_temp`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`ALTA = 15` e `NORMAL = 25`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`ALTA = 25` e `NORMAL = 15`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`ALTA = 12` e `NORMAL = 28`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`ALTA = 17` e `NORMAL = 23`"
                        }
                      ],
                      "answer": "a",
                      "after": "A base tem `15` registros com temperatura maior ou igual a `75`. Os outros `25` registros recebem `NORMAL`."
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
              "id": "micro-a03-12-contagens-resumo",
              "title": "Contar categorias e resumir colunas numéricas",
              "goal": "Usar `value_counts()` e `describe()`.",
              "role": "practice",
              "status": "generated",
              "dependsOn": [
                "micro-a03-11-nova-coluna-np-where"
              ],
              "covers": [
                "value_counts()",
                "contagem por categoria",
                "describe()",
                "resumo estatístico"
              ],
              "checks": [
                "interpreta contagem por setor",
                "interpreta `describe()` como resumo numérico, não filtro"
              ],
              "errors": [
                "usar `value_counts()` em `df` inteiro",
                "esperar que `describe()` conte categorias textuais por padrão",
                "confundir frequência com média"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Contar categorias e resumir colunas numéricas materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-12-value-describe",
                      "position": 1,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Contagens e resumo estatístico",
                      "columns": [
                        "Ferramenta",
                        "Sentido prático",
                        "Uso na aula"
                      ],
                      "rows": [
                        [
                          "`value_counts`",
                          "contagem de valores repetidos",
                          "`df[\"setor\"].value_counts()`"
                        ],
                        [
                          "`value_counts` na classificação",
                          "contagem de `ALTA` e `NORMAL`",
                          "`df[\"classificacao_temp\"].value_counts()`"
                        ],
                        [
                          "`describe`",
                          "resumo numérico das colunas",
                          "`df.describe()`"
                        ]
                      ],
                      "after": "`value_counts()` responde quantas vezes cada categoria aparece. `describe()` resume colunas numéricas com medidas como contagem, média, mínimo e máximo."
                    },
                    {
                      "id": "card-a03-12-contar-setor",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Contar registros por setor",
                      "prompt": "Complete o método para contar categorias na coluna `setor`.",
                      "language": "python",
                      "code": "contagem_setor = df[\"setor\"].[[value_counts::value_counts|describe|mean]]()\nprint(contagem_setor)",
                      "after": "`value_counts()` deve ser chamado na coluna categórica. Chamá-lo no DataFrame inteiro não responde diretamente à contagem por setor."
                    },
                    {
                      "id": "card-a03-12-contagem-setor",
                      "position": 3,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Contagem por setor",
                      "question": "Qual contagem por setor é esperada na base da aula?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "`Usinagem = 17`, `Inspeção = 12`, `Montagem = 11`"
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "`Usinagem = 12`, `Inspeção = 17`, `Montagem = 11`"
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "`Usinagem = 11`, `Inspeção = 12`, `Montagem = 17`"
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "`Usinagem = 28`, `Inspeção = 12`, `Montagem = 0`"
                        }
                      ],
                      "answer": "a",
                      "after": "A coluna `setor` tem `17` registros de Usinagem, `12` de Inspeção e `11` de Montagem. Esses totais somam `40` linhas."
                    },
                    {
                      "id": "card-a03-12-describe-gap",
                      "position": 4,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Resumo numérico",
                      "prompt": "Complete o método que gera resumo estatístico das colunas numéricas.",
                      "language": "python",
                      "code": "resumo = df.[[describe::describe|value_counts|columns]]()\nprint(resumo)",
                      "after": "`describe()` resume numericamente as colunas. Ele não filtra linhas e não substitui `value_counts()` para contar categorias específicas."
                    },
                    {
                      "id": "card-a03-12-describe-sentido",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Função de `describe()`",
                      "question": "Qual alternativa descreve melhor `df.describe()` no contexto da aula?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Ele gera um resumo estatístico das colunas numéricas."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Ele mostra apenas as primeiras cinco linhas."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Ele conta setores como resultado principal."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Ele cria a coluna `classificacao_temp`."
                        }
                      ],
                      "answer": "a",
                      "after": "`describe()` resume números. Para contar categorias como `setor` ou `classificacao_temp`, a ferramenta adequada é `value_counts()` na coluna."
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
              "id": "micro-a03-13-groupby-setor",
              "title": "Agrupar por setor e calcular média",
              "goal": "Usar `df.groupby(\"setor\")[\"temperatura_c\"].mean()`.",
              "role": "review",
              "status": "generated",
              "dependsOn": [
                "micro-a03-12-contagens-resumo"
              ],
              "covers": [
                "groupby",
                "categoria",
                "seleção de coluna após agrupamento",
                "média por grupo"
              ],
              "checks": [
                "reconhece que o agrupamento separa linhas por setor antes da média",
                "interpreta médias por setor aproximadas: Inspeção `72.78`, Montagem `71.44`, Usinagem `73.05`"
              ],
              "errors": [
                "chamar `mean()` antes de selecionar a coluna",
                "esquecer aspas em `setor`",
                "agrupar pela coluna numérica errada"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Agrupar por setor e calcular média materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-13-fluxo-groupby",
                      "position": 1,
                      "resource": "flow",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Agrupar antes de calcular",
                      "prompt": "Observe a ordem lógica de `groupby(\"setor\")[\"temperatura_c\"].mean()`.",
                      "structure": {
                        "kind": "sequence",
                        "items": [
                          {
                            "kind": "start",
                            "text": "Começar com `df`"
                          },
                          {
                            "kind": "process",
                            "text": "Separar linhas por `setor` com `groupby(\"setor\")`"
                          },
                          {
                            "kind": "process",
                            "text": "Escolher a coluna numérica `temperatura_c`"
                          },
                          {
                            "kind": "process",
                            "text": "Calcular `mean()` dentro de cada grupo"
                          },
                          {
                            "kind": "output",
                            "text": "Obter uma média de temperatura para cada setor"
                          },
                          {
                            "kind": "end",
                            "text": "Comparar os grupos"
                          }
                        ]
                      },
                      "after": "`groupby` pode ser entendido como agrupar por uma categoria antes de calcular. A média final não é única para a base inteira; é uma média por setor."
                    },
                    {
                      "id": "card-a03-13-completar-groupby",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Média por setor",
                      "prompt": "Complete a chamada que agrupa por setor e calcula média de temperatura.",
                      "language": "python",
                      "code": "media_por_setor = df.[[groupby::groupby|value_counts|describe]](\"setor\")[\"temperatura_c\"].[[mean::mean|max|min]]()\nprint(media_por_setor)",
                      "after": "A chamada agrupa as linhas por `setor`, seleciona `temperatura_c` e só então calcula `mean()`. Inverter essa ordem perde o agrupamento."
                    },
                    {
                      "id": "card-a03-13-versoes-groupby",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Versão correta do agrupamento",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha o agrupamento correto.",
                      "after": "A versão correta agrupa por uma coluna categórica e calcula média da coluna numérica depois da seleção.",
                      "question": "Qual versão calcula a média de `temperatura_c` por `setor`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "media_por_setor = df.groupby(\"setor\")[\"temperatura_c\"].mean()"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "media_por_setor = df[\"temperatura_c\"].mean().groupby(\"setor\")"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "media_por_setor = df.groupby(setor)[temperatura_c].mean()"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "media_por_setor = df.groupby(\"temperatura_c\")[\"setor\"].mean()"
                        }
                      ],
                      "answer": "a"
                    },
                    {
                      "id": "card-a03-13-medias-setor",
                      "position": 4,
                      "resource": "table",
                      "kind": "theory",
                      "exercise": "none",
                      "title": "Média de temperatura por setor",
                      "columns": [
                        "Setor",
                        "Média de `temperatura_c` arredondada"
                      ],
                      "rows": [
                        [
                          "Inspeção",
                          "`72.78`"
                        ],
                        [
                          "Montagem",
                          "`71.44`"
                        ],
                        [
                          "Usinagem",
                          "`73.05`"
                        ]
                      ],
                      "after": "Cada média usa apenas as linhas daquele setor. Por isso o resultado tem uma linha por categoria de `setor`, não uma única média geral."
                    },
                    {
                      "id": "card-a03-13-interpretar-groupby",
                      "position": 5,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Interpretação do agrupamento",
                      "question": "Qual frase interpreta corretamente `df.groupby(\"setor\")[\"temperatura_c\"].mean()`?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Separar as linhas por setor e calcular a média de temperatura dentro de cada grupo."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Calcular a média de todos os setores como se fossem números."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Filtrar apenas linhas com temperatura acima de `75`."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Criar uma nova coluna chamada `setor`."
                        }
                      ],
                      "answer": "a",
                      "after": "`groupby(\"setor\")` cria grupos por categoria. A seleção `[...]` escolhe a coluna numérica, e `mean()` calcula a média dentro de cada grupo."
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
              "id": "micro-a03-14-atividade-final",
              "title": "Atividade final integrada",
              "goal": "Integrar importação, leitura do CSV, métricas, filtro de falhas e nova coluna.",
              "role": "review",
              "status": "generated",
              "dependsOn": [
                "micro-a03-13-groupby-setor"
              ],
              "covers": [
                "imports",
                "pd.read_csv()",
                "mean()",
                "max()",
                "filtro `falha == 1`",
                "np.where()",
                "head()"
              ],
              "checks": [
                "usa caminho correto",
                "calcula média e maior produção",
                "filtra falhas",
                "cria `classificacao_temp`",
                "mostra resultados relevantes"
              ],
              "errors": [
                "esquecer imports",
                "usar dataset errado",
                "aplicar filtro antes de carregar `df`",
                "criar coluna em DataFrame filtrado sem intenção"
              ],
              "versions": [
                {
                  "id": "version-001",
                  "createdAt": "2026-06-18T03:21:02.140Z",
                  "source": "llm",
                  "action": "generate",
                  "request": "Materializar Aula 3 a partir do handoff fundamentos-ia-analise-dados__aula03__prompt_builder__v20260617-230801.md.",
                  "summary": "Microssequência Atividade final integrada materializada com progressão local e exercícios verificáveis.",
                  "cards": [
                    {
                      "id": "card-a03-14-requisitos-integrados",
                      "position": 1,
                      "resource": "composite",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Sequência integrada da atividade",
                      "blocks": [
                        {
                          "columns": [
                            "Etapa",
                            "Critério verificável"
                          ],
                          "rows": [
                            [
                              "Imports",
                              "`import numpy as np` e `import pandas as pd`"
                            ],
                            [
                              "Leitura",
                              "`pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")`"
                            ],
                            [
                              "Métricas",
                              "`mean()` em `temperatura_c` e `max()` em `producao_dia`"
                            ],
                            [
                              "Filtro",
                              "`df[\"falha\"] == 1` aplicado em `df[...]`"
                            ],
                            [
                              "Nova coluna",
                              "`np.where(df[\"temperatura_c\"] >= 75, \"ALTA\", \"NORMAL\")`"
                            ]
                          ],
                          "kind": "table"
                        },
                        {
                          "kind": "choice",
                          "question": "Qual ordem evita usar `df`, `np` ou `pd` antes de existirem?",
                          "options": [
                            {
                              "id": "a",
                              "kind": "text",
                              "text": "Importar bibliotecas, ler o CSV em `df`, calcular métricas, filtrar falhas e criar a nova coluna."
                            },
                            {
                              "id": "b",
                              "kind": "text",
                              "text": "Filtrar falhas, criar `df`, importar bibliotecas e depois ler o CSV."
                            },
                            {
                              "id": "c",
                              "kind": "text",
                              "text": "Criar `classificacao_temp`, calcular métricas e só então importar NumPy."
                            },
                            {
                              "id": "d",
                              "kind": "text",
                              "text": "Calcular média em `df` antes de executar `pd.read_csv()`."
                            }
                          ],
                          "answer": "a"
                        }
                      ],
                      "after": "A ordem correta respeita dependências reais: aliases antes de chamadas, `df` antes de operações na base e coluna criada depois do carregamento."
                    },
                    {
                      "id": "card-a03-14-script-final",
                      "position": 2,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Script final completo",
                      "prompt": "Compare as versões completas.",
                      "language": "python",
                      "code": "# Escolha o script que resolve a atividade final.",
                      "after": "A versão correta junta imports, leitura do CSV da aula 3, métricas, filtro de falha e criação de `classificacao_temp` com `np.where()`.",
                      "question": "Qual script atende aos critérios da atividade final?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "code",
                          "language": "python",
                          "code": "import numpy as np\nimport pandas as pd\n\ndf = pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")\n\nmedia_temp = df[\"temperatura_c\"].mean()\nmaior_producao = df[\"producao_dia\"].max()\nfalhas = df[df[\"falha\"] == 1]\n\ndf[\"classificacao_temp\"] = np.where(\n    df[\"temperatura_c\"] >= 75,\n    \"ALTA\",\n    \"NORMAL\"\n)\n\nprint(media_temp)\nprint(maior_producao)\nprint(falhas.head())\nprint(df.head())"
                        },
                        {
                          "id": "b",
                          "kind": "code",
                          "language": "python",
                          "code": "df = pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")\nimport numpy as np\nimport pandas as pd\n\nmedia_temp = df[\"temperatura_c\"].mean()\nmaior_producao = df[\"producao_dia\"].max()\nfalhas = df[df[\"falha\"] = 1]\nprint(falhas.head())"
                        },
                        {
                          "id": "c",
                          "kind": "code",
                          "language": "python",
                          "code": "import pandas as pd\n\ndf = pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")\nmedia_temp = df[\"producao_dia\"].mean()\nmaior_producao = df[\"temperatura_c\"].max()\ndf[\"classificacao_temp\"] = np.where(df[\"temperatura_c\"] >= 75, \"ALTA\", \"NORMAL\")"
                        },
                        {
                          "id": "d",
                          "kind": "code",
                          "language": "python",
                          "code": "import numpy as np\nimport pandas as pd\n\ndf = pd.DataFrame(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")\nfalhas = df[df[\"falha\"] == 1]\ndf[\"classificacao_temp\"] = np.where(df[\"temperatura_c\"] >= 75, \"NORMAL\", \"ALTA\")"
                        }
                      ],
                      "answer": "a",
                      "afterBlocks": [
                        {
                          "language": "python",
                          "code": "import numpy as np\nimport pandas as pd\n\ndf = pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")\n\nmedia_temp = df[\"temperatura_c\"].mean()\nmaior_producao = df[\"producao_dia\"].max()\nfalhas = df[df[\"falha\"] == 1]\n\ndf[\"classificacao_temp\"] = np.where(\n    df[\"temperatura_c\"] >= 75,\n    \"ALTA\",\n    \"NORMAL\"\n)\n\nprint(media_temp)\nprint(maior_producao)\nprint(falhas.head())\nprint(df.head())",
                          "kind": "code",
                          "prompt": "Veja o código completo."
                        }
                      ]
                    },
                    {
                      "id": "card-a03-14-completar-integracao",
                      "position": 3,
                      "resource": "code",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Completar pontos críticos",
                      "prompt": "Complete o CSV, o filtro de falhas e a classificação.",
                      "language": "python",
                      "code": "df = pd.read_csv(\"/mnt/data/[[dataset_aula3_numpy_pandas.csv::dataset_aula3_numpy_pandas.csv|dataset_numpy_pandas.csv|dataset_aula3.csv]]\")\n\nfalhas = df[df[\"falha\"] [[==::==|=|>]] 1]\n\ndf[\"classificacao_temp\"] = np.where(\n    df[\"temperatura_c\"] [[>=::>=|>|==]] 75,\n    \"ALTA\",\n    \"NORMAL\"\n)",
                      "after": "Os três pontos críticos são o caminho correto do arquivo, `==` para comparar falha e `>=` para incluir temperatura igual a `75` na classificação `ALTA`."
                    },
                    {
                      "id": "card-a03-14-resultados-chave",
                      "position": 4,
                      "resource": "choice",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Resultados esperados",
                      "question": "Quais resultados devem aparecer para média de temperatura, maior produção e quantidade de falhas?",
                      "options": [
                        {
                          "id": "a",
                          "kind": "text",
                          "text": "Média `72.53`, maior produção `159` e `12` registros com falha."
                        },
                        {
                          "id": "b",
                          "kind": "text",
                          "text": "Média `159`, maior produção `72.53` e `15` registros com falha."
                        },
                        {
                          "id": "c",
                          "kind": "text",
                          "text": "Média `27.20`, maior produção `40` e `6` registros com falha."
                        },
                        {
                          "id": "d",
                          "kind": "text",
                          "text": "Média `75.00`, maior produção `28` e `17` registros com falha."
                        }
                      ],
                      "answer": "a",
                      "after": "Esses valores conferem se a base correta foi usada: `temperatura_c` tem média aproximada `72.53`, `producao_dia` tem máximo `159` e `falha == 1` ocorre `12` vezes."
                    },
                    {
                      "id": "card-a03-14-checagem-final",
                      "position": 5,
                      "resource": "composite",
                      "kind": "exercise",
                      "exercise": "choice",
                      "title": "Checagem de autonomia",
                      "blocks": [
                        {
                          "columns": [
                            "Operação",
                            "Expressão esperada"
                          ],
                          "rows": [
                            [
                              "Ler CSV",
                              "`pd.read_csv(\"/mnt/data/dataset_aula3_numpy_pandas.csv\")`"
                            ],
                            [
                              "Ver formato",
                              "`df.shape`"
                            ],
                            [
                              "Selecionar coluna",
                              "`df[\"temperatura_c\"]`"
                            ],
                            [
                              "Filtrar falhas",
                              "`df[df[\"falha\"] == 1]`"
                            ],
                            [
                              "Agrupar",
                              "`df.groupby(\"setor\")[\"temperatura_c\"].mean()`"
                            ]
                          ],
                          "kind": "table"
                        },
                        {
                          "language": "python",
                          "code": "print(df.shape)\nprint(df[\"temperatura_c\"].mean())\nprint(df.groupby(\"setor\")[\"temperatura_c\"].mean())",
                          "kind": "code",
                          "prompt": "Observe o código."
                        },
                        {
                          "kind": "choice",
                          "question": "Qual alternativa explica por que essas expressões formam uma revisão coerente da aula?",
                          "options": [
                            {
                              "id": "a",
                              "kind": "text",
                              "text": "Elas passam por leitura, inspeção, seleção, filtro, métrica e agrupamento sem sair da base carregada."
                            },
                            {
                              "id": "b",
                              "kind": "text",
                              "text": "Elas criam uma base nova em cada linha e descartam o CSV original."
                            },
                            {
                              "id": "c",
                              "kind": "text",
                              "text": "Elas funcionam sem importar Pandas porque `df` é criado automaticamente."
                            },
                            {
                              "id": "d",
                              "kind": "text",
                              "text": "Elas contam categorias usando `describe()` no lugar de `value_counts()`."
                            }
                          ],
                          "answer": "a"
                        }
                      ],
                      "after": "A revisão mantém o mesmo DataFrame e combina as operações centrais da aula. Esse encadeamento permite verificar forma, valores e grupos sem introduzir conteúdo externo."
                    },
                    {
                      "id": "card-a03-14-fechamento",
                      "position": 6,
                      "resource": "paragraph",
                      "kind": "exercise",
                      "exercise": "gap",
                      "title": "Fechamento da aula",
                      "text": "Ao concluir a atividade, o aluno deve conseguir carregar `dataset_aula3_numpy_pandas.csv`, explorar `df.shape`, calcular métricas em colunas, filtrar linhas e agrupar por [[setor::setor|falha|id_registro]].",
                      "after": "`setor` é a categoria usada no agrupamento final. `falha` é usada no filtro, e `id_registro` identifica linhas."
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
);

function forEachFundamentosCard(course, callback) {
  (course.modules || []).forEach((moduleValue) => {
    (moduleValue.lessons || []).forEach((lesson) => {
      (lesson.microsequences || []).forEach((microsequence) => {
        (microsequence.versions || []).forEach((version) => {
          (version.cards || []).forEach((card, cardIndex) => {
            callback(card, { moduleValue, lesson, microsequence, version, cardIndex });
          });
        });
      });
    });
  });
}

function forEachFundamentosVersion(course, callback) {
  (course.modules || []).forEach((moduleValue) => {
    (moduleValue.lessons || []).forEach((lesson) => {
      (lesson.microsequences || []).forEach((microsequence) => {
        (microsequence.versions || []).forEach((version) => {
          callback(version, { moduleValue, lesson, microsequence });
        });
      });
    });
  });
}

function replaceFundamentosCard(version, cardIndex, nextCard) {
  version.cards[cardIndex] = nextCard;
}

function createChoiceBlock(question, options, answer) {
  return {
    kind: "choice",
    question,
    options,
    answer
  };
}

function createTableBlock(columns, rows) {
  return {
    kind: "table",
    columns,
    rows
  };
}

function ensureFundamentosSentence(text) {
  const trimmedText = String(text || "").trim();
  if (!trimmedText) return "";
  return /[.!?]$/.test(trimmedText) ? trimmedText : `${trimmedText}.`;
}

function normalizeFundamentosIaAnaliseDadosCourse(course) {
  const normalizedCourse = structuredClone(course);
  const moduleAula03 = (normalizedCourse.modules || []).find((moduleValue) => moduleValue.id === "module-aula-03-bibliotecas-analise-dados");
  const lessonAula03 = moduleAula03?.lessons?.find((lesson) => lesson.id === "lesson-aula-03-numpy-pandas");
  const microAula03Final = lessonAula03?.microsequences?.find((microsequence) => microsequence.id === "micro-a03-14-atividade-final");

  if (moduleAula03?.guide) {
    moduleAula03.guide.goal =
      "Usar NumPy e Pandas para ler, explorar e transformar dados tabulares com operações iniciais de análise.";
  }
  if (lessonAula03?.guide) {
    lessonAula03.guide.goal =
      "Ler um CSV, inspecionar colunas, calcular métricas simples, filtrar linhas, criar classificações e agrupar dados por setor com NumPy e Pandas.";
  }
  if (microAula03Final) {
    microAula03Final.title = "Integração de leitura, métricas, filtro e classificação";
  }

  forEachFundamentosVersion(normalizedCourse, (version, context) => {
    const normalizedGoal = ensureFundamentosSentence(context.microsequence?.goal);
    const normalizedTitle = ensureFundamentosSentence(context.microsequence?.title);

    version.request = normalizedGoal
      ? `Foco didático da microssequência: ${normalizedGoal}`
      : "Foco didático da microssequência.";
    version.summary = normalizedTitle
      ? `Versão centrada em ${normalizedTitle}`
      : "Versão centrada no objetivo da microssequência.";
  });

  forEachFundamentosCard(normalizedCourse, (card, context) => {
    if (card.id === "card-a03-12-describe-sentido") {
      card.question = "Qual alternativa descreve melhor o tipo de resumo produzido por `df.describe()`?";
    }

    if (card.id === "card-a03-14-script-final") {
      card.title = "Script integrado da base";
      card.question = "Qual script reúne leitura da base, métricas, filtro de falhas e classificação de temperatura?";
    }

    if (card.id === "card-a03-14-fechamento") {
      card.text =
        "Nesta aula, o trabalho com `dataset_aula3_numpy_pandas.csv` combina leitura, inspeção de `df.shape`, cálculo de métricas em colunas, filtros e agrupamento por [[setor::setor|falha|id_registro]].";
    }

    if (card.id === "card-a03-09-media-verificavel") {
      replaceFundamentosCard(context.version, context.cardIndex, {
        id: card.id,
        position: card.position,
        resource: "composite",
        kind: "exercise",
        exercise: "choice",
        title: "Interpretar métricas calculadas",
        blocks: [
          createTableBlock(
            ["Indicador", "Expressão", "Valor observado"],
            [
              ["Média da temperatura", "`df[\"temperatura_c\"].mean()`", "`72.53`"],
              ["Maior produção", "`df[\"producao_dia\"].max()`", "`159`"],
              ["Menor tempo de ciclo", "`df[\"tempo_ciclo_s\"].min()`", "`27.20`"]
            ]
          ),
          createChoiceBlock(
            "Qual linha do quadro corresponde à média de `temperatura_c`?",
            [
              { id: "a", kind: "text", text: "A linha `Média da temperatura`, com valor `72.53`." },
              { id: "b", kind: "text", text: "A linha `Maior produção`, com valor `159`." },
              { id: "c", kind: "text", text: "A linha `Menor tempo de ciclo`, com valor `27.20`." },
              { id: "d", kind: "text", text: "Nenhuma linha do quadro representa média." }
            ],
            "a"
          )
        ],
        after:
          "A média de `temperatura_c` aparece como `72.53`. Já `159` representa o maior valor de `producao_dia`, e `27.20` representa o menor valor de `tempo_ciclo_s`."
      });
    }

    if (card.id === "card-a03-10-contagens-filtros") {
      replaceFundamentosCard(context.version, context.cardIndex, {
        id: card.id,
        position: card.position,
        resource: "composite",
        kind: "exercise",
        exercise: "choice",
        title: "Interpretar contagens de filtros",
        blocks: [
          createTableBlock(
            ["Filtro aplicado", "Contagem observada"],
            [
              ["`df[df[\"temperatura_c\"] > 75]`", "`15` linhas"],
              ["`df[df[\"falha\"] == 1]`", "`12` linhas"]
            ]
          ),
          createChoiceBlock(
            "Qual leitura interpreta corretamente as contagens do quadro?",
            [
              { id: "a", kind: "text", text: "Há mais registros com `temperatura_c > 75` do que registros com `falha == 1`." },
              { id: "b", kind: "text", text: "Há mais registros com `falha == 1` do que registros com `temperatura_c > 75`." },
              { id: "c", kind: "text", text: "As duas contagens são iguais." },
              { id: "d", kind: "text", text: "O quadro mostra que todas as `40` linhas entram nos dois filtros." }
            ],
            "a"
          )
        ],
        after:
          "O filtro `temperatura_c > 75` seleciona `15` registros, enquanto `falha == 1` seleciona `12`. As contagens são próximas, mas não iguais."
      });
    }

    if (card.id === "card-a03-11-contagem-classificacao") {
      replaceFundamentosCard(context.version, context.cardIndex, {
        id: card.id,
        position: card.position,
        resource: "composite",
        kind: "exercise",
        exercise: "choice",
        title: "Interpretar a nova coluna",
        blocks: [
          createTableBlock(
            ["Rótulo em `classificacao_temp`", "Contagem observada"],
            [
              ["`ALTA`", "`15`"],
              ["`NORMAL`", "`25`"]
            ]
          ),
          createChoiceBlock(
            "Qual leitura combina com o resumo mostrado para `classificacao_temp`?",
            [
              { id: "a", kind: "text", text: "A maioria dos registros ficou em `NORMAL`." },
              { id: "b", kind: "text", text: "A maioria dos registros ficou em `ALTA`." },
              { id: "c", kind: "text", text: "As duas categorias têm a mesma quantidade." },
              { id: "d", kind: "text", text: "Nenhum registro recebeu `NORMAL`." }
            ],
            "a"
          )
        ],
        after:
          "Com a regra `temperatura_c >= 75`, a nova coluna fica concentrada em `NORMAL`: são `25` registros, contra `15` em `ALTA`."
      });
    }

    if (card.id === "card-a03-12-contagem-setor") {
      replaceFundamentosCard(context.version, context.cardIndex, {
        id: card.id,
        position: card.position,
        resource: "composite",
        kind: "exercise",
        exercise: "choice",
        title: "Interpretar o resumo por setor",
        blocks: [
          createTableBlock(
            ["Setor", "Registros observados"],
            [
              ["`Usinagem`", "`17`"],
              ["`Inspeção`", "`12`"],
              ["`Montagem`", "`11`"]
            ]
          ),
          createChoiceBlock(
            "Qual leitura interpreta corretamente esse resumo por setor?",
            [
              { id: "a", kind: "text", text: "`Usinagem` tem mais registros, e o total mostrado é `40`." },
              { id: "b", kind: "text", text: "`Inspeção` tem mais registros, e o total mostrado é `28`." },
              { id: "c", kind: "text", text: "`Montagem` tem mais registros, e o total mostrado é `17`." },
              { id: "d", kind: "text", text: "Os três setores aparecem com a mesma quantidade." }
            ],
            "a"
          )
        ],
        after:
          "O quadro soma `40` linhas. `Usinagem` aparece como o setor mais frequente, com `17` registros."
      });
    }

    if (card.id === "card-a03-14-resultados-chave") {
      replaceFundamentosCard(context.version, context.cardIndex, {
        id: card.id,
        position: card.position,
        resource: "composite",
        kind: "exercise",
        exercise: "choice",
        title: "Sintetizar os resultados principais",
        blocks: [
          createTableBlock(
            ["Indicador", "Valor observado"],
            [
              ["Média de `temperatura_c`", "`72.53`"],
              ["Maior valor de `producao_dia`", "`159`"],
              ["Registros com `falha == 1`", "`12`"]
            ]
          ),
          createChoiceBlock(
            "Qual síntese corresponde ao quadro de resultados?",
            [
              { id: "a", kind: "text", text: "Média `72.53`, maior produção `159` e `12` registros com falha." },
              { id: "b", kind: "text", text: "Média `159`, maior produção `72.53` e `15` registros com falha." },
              { id: "c", kind: "text", text: "Média `27.20`, maior produção `40` e `6` registros com falha." },
              { id: "d", kind: "text", text: "Média `75.00`, maior produção `28` e `17` registros com falha." }
            ],
            "a"
          )
        ],
        after:
          "Os três resultados do quadro usam medidas diferentes: média para `temperatura_c`, máximo para `producao_dia` e contagem de linhas para `falha == 1`."
      });
    }
  });

  return normalizedCourse;
}

export function createFundamentosIaAnaliseDadosCourse() {
  return normalizeFundamentosIaAnaliseDadosCourse(RAW_FUNDAMENTOS_IA_ANALISE_DADOS_COURSE);
}
