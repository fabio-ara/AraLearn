function createTableCard(key, title, columns, rows) {
  return {
    key,
    type: "table",
    title,
    columns,
    rows
  };
}

export function createExampleProjectDocument() {
  return {
    contract: "aralearn.contract",
    courses: [
      {
        key: "course-teste-runtime",
        title: "Curso de teste",
        description: "Seed mínimo para validar uma tabela com lacunas por bloco no runtime principal.",
        modules: [
          {
            key: "module-teste-runtime",
            title: "Módulo de teste",
            description: "Estrutura mínima para inspeção manual do card de tabela.",
            lessons: [
              {
                key: "lesson-tabela-blocos",
                title: "Tabela com blocos",
                description: "O primeiro card expõe uma tabela com lacunas por opção.",
                microsequences: [
                  {
                    key: "microsequence-tabela-blocos",
                    title: "Tabela com lacunas por bloco",
                    tags: ["Teste", "Tabela"],
                    cards: [
                      createTableCard(
                        "card-tabela-blocos",
                        "Tabela com lacunas por bloco",
                        ["Campo", "Uso"],
                        [
                          ["[[type::type|title|key]]", "Define o tipo explícito do card."],
                          ["runtime", "Carrega [[blocos::blocos|módulos|tokens]] internos compilados."]
                        ]
                      )
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
