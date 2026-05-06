export function createExampleProjectDocument() {
  const directoryTreeNodes = [
    {
      id: "node-home",
      type: "folder",
      name: "home",
      children: [
        {
          id: "node-aluno",
          type: "folder",
          name: "aluno",
          children: [
            {
              id: "node-downloads",
              type: "folder",
              name: "downloads",
              children: [
                {
                  id: "node-antigos",
                  type: "folder",
                  name: "arquivos-antigos"
                },
                {
                  id: "node-pacote",
                  type: "file",
                  name: "pacote.zip"
                }
              ]
            },
            {
              id: "node-projetos",
              type: "folder",
              name: "projetos",
              children: [
                {
                  id: "node-docs",
                  type: "folder",
                  name: "docs"
                },
                {
                  id: "node-imagens",
                  type: "folder",
                  name: "imagens"
                },
                {
                  id: "node-readme",
                  type: "file",
                  name: "README.txt"
                }
              ]
            },
            {
              id: "node-publico",
              type: "folder",
              name: "publico",
              children: [
                {
                  id: "node-galeria",
                  type: "folder",
                  name: "galeria"
                },
                {
                  id: "node-notas",
                  type: "file",
                  name: "notas.txt"
                }
              ]
            }
          ]
        }
      ]
    }
  ];

  return {
    contract: "aralearn.contract",
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
                    cards: [
                      {
                        key: "card-arvore-diretorios",
                        type: "text",
                        title: "Onde você está na árvore",
                        text: "O destaque mostra o diretório atual.",
                        runtime: {
                          title: "Onde você está na árvore",
                          fallbackText: "O destaque mostra o diretório atual.",
                          blocks: [
                            {
                              kind: "heading",
                              value: "Onde você está na árvore"
                            },
                            {
                              kind: "paragraph",
                              value: "O destaque mostra o diretório atual."
                            },
                            {
                              kind: "directory_tree",
                              base: "/",
                              currentNodeId: "node-projetos",
                              selectedNodeId: "node-projetos",
                              collapsedNodeIds: ["node-downloads", "node-publico"],
                              nodes: directoryTreeNodes
                            }
                          ]
                        }
                      },
                      {
                        key: "card-arvore-publico",
                        type: "text",
                        title: "Pastas irmãs e arquivo final",
                        text: "A pasta `publico` aparece como irmã de `projetos`, com subpasta e arquivo próprio.",
                        runtime: {
                          title: "Pastas irmãs e arquivo final",
                          fallbackText: "A pasta publico aparece como irma de projetos, com subpasta e arquivo proprio.",
                          blocks: [
                            {
                              kind: "heading",
                              value: "Pastas irmãs e arquivo final"
                            },
                            {
                              kind: "paragraph",
                              value: "Observe que `publico` e `projetos` são irmãs dentro de `aluno`, e que `notas.txt` fica em `publico`."
                            },
                            {
                              kind: "directory_tree",
                              base: "/",
                              currentNodeId: "node-publico",
                              selectedNodeId: "node-notas",
                              collapsedNodeIds: ["node-downloads"],
                              nodes: directoryTreeNodes
                            }
                          ]
                        }
                      },
                      {
                        key: "card-arvore-downloads",
                        type: "text",
                        title: "Downloads e arquivo compactado",
                        text: "A árvore também mostra uma pasta irmã recolhida por padrão, com arquivo compactado dentro.",
                        runtime: {
                          title: "Downloads e arquivo compactado",
                          fallbackText: "A arvore tambem mostra uma pasta irma recolhida por padrao, com arquivo compactado dentro.",
                          blocks: [
                            {
                              kind: "heading",
                              value: "Downloads e arquivo compactado"
                            },
                            {
                              kind: "paragraph",
                              value: "Aqui o destaque está em `downloads`, que contém a subpasta `arquivos-antigos` e o arquivo `pacote.zip`."
                            },
                            {
                              kind: "directory_tree",
                              base: "/",
                              currentNodeId: "node-downloads",
                              selectedNodeId: "node-pacote",
                              collapsedNodeIds: ["node-publico"],
                              nodes: directoryTreeNodes
                            }
                          ]
                        }
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
