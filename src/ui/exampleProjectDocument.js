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
              }
            ]
          }
        ]
      }
    ]
  };
}
