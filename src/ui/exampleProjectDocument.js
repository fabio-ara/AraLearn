function createChoiceCard(key, title, ask, answer, wrong) {
  return {
    key,
    type: "choice",
    title,
    ask,
    answer,
    wrong
  };
}

export function createExampleProjectDocument() {
  return {
    contract: "aralearn.contract",
    courses: [
      {
        key: "course-teste-choice",
        title: "Curso de teste",
        description: "Exemplo dedicado à múltipla escolha.",
        modules: [
          {
            key: "module-choice",
            title: "Módulo de escolha",
            lessons: [
              {
                key: "lesson-choice",
                title: "Escolha simples",
                microsequences: [
                  {
                    key: "microsequence-choice",
                    title: "Múltipla escolha",
                    cards: [
                      createChoiceCard(
                        "card-choice",
                        "Leitura rápida",
                        "Qual propriedade identifica o tipo explícito do card?",
                        ["type"],
                        ["title", "runtime"]
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
