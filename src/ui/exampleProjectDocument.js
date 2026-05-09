export function createExampleProjectDocument() {
  const directoryTreeItems = {
    home: {
      aluno: {
        downloads: {
          "arquivos-antigos": {},
          "pacote.zip": null
        },
        projetos: {
          docs: {},
          imagens: {},
          "README.txt": null
        },
        publico: {
          galeria: {},
          "notas.txt": null
        }
      }
    }
  };

  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course-teste-runtime",
        title: "Curso de teste",
        description: "Estrutura vazia para validação manual da interface sem conteúdo de exemplo persistente.",
        modules: [
          {
            key: "module-teste-runtime",
            title: "Módulo de teste",
            description: "Estrutura mínima para inspeção manual.",
            lessons: [
              {
                key: "lesson-arvore-diretorios",
                title: "Fundamentos de Linux, terminal e árvore de diretórios",
                description: "Card oficial de inspeção manual para o contêiner de árvore de pastas.",
                microsequences: [
                  {
                    key: "microsequence-arvore-diretorios",
                    title: "Diretório atual e caminhos",
                    tags: ["Teste", "Árvore"],
                    status: "ready",
                    cards: [
                      {
                        key: "card-arvore-diretorios",
                        title: "Onde você está na árvore",
                        say: "O destaque mostra o diretório atual.",
                        tree: {
                          base: "/",
                          current: "/home/aluno/projetos",
                          selected: "/home/aluno/projetos",
                          closed: ["/home/aluno/downloads", "/home/aluno/publico"],
                          items: directoryTreeItems
                        }
                      },
                      {
                        key: "card-arvore-publico",
                        title: "Pastas irmãs e arquivo final",
                        say: "Observe que `publico` e `projetos` são irmãs dentro de `aluno`, e que `notas.txt` fica em `publico`.",
                        tree: {
                          base: "/",
                          current: "/home/aluno/publico",
                          selected: "/home/aluno/publico/notas.txt",
                          closed: ["/home/aluno/downloads"],
                          items: directoryTreeItems
                        }
                      },
                      {
                        key: "card-arvore-downloads",
                        title: "Downloads e arquivo compactado",
                        say: "Aqui o destaque está em `downloads`, que contém a subpasta `arquivos-antigos` e o arquivo `pacote.zip`.",
                        tree: {
                          base: "/",
                          current: "/home/aluno/downloads",
                          selected: "/home/aluno/downloads/pacote.zip",
                          closed: ["/home/aluno/publico"],
                          items: directoryTreeItems
                        }
                      }
                    ]
                  }
                ]
              },
              {
                key: "lesson-exercicios-opcoes",
                title: "Verificação dos exercícios com opções",
                description: "Lição de teste para validar cada tipo de exercício com feedback inline e popup final.",
                microsequences: [
                  {
                    key: "microsequence-exercicios-opcoes",
                    title: "Todos os exercícios com opções",
                    tags: ["Teste", "Exercícios", "Opções"],
                    status: "ready",
                    cards: [
                      {
                        key: "card-teste-multipla-escolha",
                        title: "Múltipla escolha",
                        ask: "Qual comando lista arquivos no diretório atual?",
                        answer: "ls",
                        wrong: ["cd", "pwd", "mkdir"],
                        after: "Correto! `ls` lista o conteúdo do diretório atual."
                      },
                      {
                        key: "card-teste-paragrafo-opcoes",
                        title: "Parágrafo com lacuna",
                        say: "Para mudar de diretório no terminal, use [[cd::cd|ls|pwd]].",
                        after: "Correto! `cd` altera o diretório atual."
                      },
                      {
                        key: "card-teste-editor-opcoes",
                        title: "Editor com lacuna",
                        say: "Complete o comando para inspecionar o estado do repositório Git.",
                        code: "git [[status::status|commit|clone]]",
                        language: "bash",
                        after: "Correto! `git status` mostra o estado atual do repositório."
                      },
                      {
                        key: "card-teste-tabela-opcoes",
                        title: "Tabela com lacuna",
                        say: "Escolha o comando correto na célula da tabela.",
                        table: {
                          columns: ["Objetivo", "Comando"],
                          rows: [
                            ["Listar arquivos", "[[ls::ls|cd|touch]]"],
                            ["Mostrar diretório atual", "pwd"]
                          ]
                        },
                        after: "Correto! Para listar arquivos, o comando esperado era `ls`."
                      },
                      {
                        key: "card-teste-fluxograma-opcoes",
                        title: "Fluxograma com opções",
                        say: "Preencha o fluxograma escolhendo as opções corretas.",
                        flow: [
                          { "start": "Início" },
                          { "process": "Validar", "blank": { "text": ["Validar", "Executar"] } },
                          {
                            "if": "Está correto?",
                            "blank": { "labels": { "yes": ["Sim", "Não"] } },
                            "then": [{ "output": "Prosseguir" }],
                            "else": [{ "process": "Revisar" }]
                          },
                          { "end": "Fim" }
                        ],
                        after: "Correto! O fluxo valida, segue pelo ramo `Sim` e então prossegue."
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}
