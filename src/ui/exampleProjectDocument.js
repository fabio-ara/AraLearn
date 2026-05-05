export function createExampleProjectDocument() {
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
                key: "lesson-tabela-blocos",
                title: "Lição vazia",
                description: "Sem cards carregados por padrão.",
                microsequences: [
                  {
                    key: "microsequence-tabela-blocos",
                    title: "Microssequência vazia",
                    tags: ["Teste", "Tabela"],
                    cards: []
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
