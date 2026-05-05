function createTextCard(key, title, text) {
  return {
    key,
    type: "text",
    title,
    text
  };
}

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

function createCompleteCard(key, title, text, answer, wrong) {
  return {
    key,
    type: "complete",
    title,
    text,
    answer,
    wrong
  };
}

function createEditorCard(key, title, language, code) {
  return {
    key,
    type: "editor",
    title,
    language,
    code
  };
}

function createFlowCard(key, title, flow) {
  return {
    key,
    type: "flow",
    title,
    flow
  };
}

export function createExampleProjectDocument() {
  return {
    contract: "aralearn.contract",
    courses: [
      {
        key: "course-engenharia-software",
        title: "Engenharia de Software",
        description: "Curso base com cards explícitos por tipo e autoria orientada a microssequências.",
        modules: [
          {
            key: "module-processos-software",
            title: "Processos de software",
            description: "Modelos de processo com cards rasos por tipo.",
            lessons: [
              {
                key: "lesson-modelos-processo",
                title: "Modelos de processo",
                description: "Comparar abordagens sequenciais, iterativas e orientadas a risco.",
                microsequences: [
                  {
                    key: "microsequence-modelo-cascata",
                    title: "Modelo cascata",
                    tags: ["Processos de software", "Planejamento"],
                    cards: [
                      createTextCard(
                        "card-cascata-ideia",
                        "Ideia central",
                        "O modelo cascata organiza o projeto em fases sequenciais com avanço controlado."
                      ),
                      createChoiceCard(
                        "card-cascata-choice",
                        "Leitura rápida",
                        "Qual característica combina melhor com o modelo cascata?",
                        ["Fases sequenciais"],
                        ["Backlog contínuo", "Fluxo puxado"]
                      ),
                      createCompleteCard(
                        "card-cascata-complete",
                        "Complete",
                        "No modelo [[cascata]], mudanças tardias costumam custar mais.",
                        ["cascata"],
                        ["iterativo", "kanban"]
                      )
                    ]
                  },
                  {
                    key: "microsequence-modelo-v",
                    title: "Modelo em V",
                    tags: ["Processos de software", "Testes"],
                    cards: [
                      createTextCard(
                        "card-v-estrutura",
                        "Estrutura",
                        "O modelo em V espelha as etapas de construção com níveis correspondentes de teste."
                      ),
                      createFlowCard(
                        "card-v-fluxo",
                        "Fluxo resumido",
                        [
                          { start: "Especificar" },
                          { process: "Projetar" },
                          { process: "Implementar" },
                          { end: "Verificar" }
                        ]
                      ),
                      createFlowCard(
                        "card-v-fluxo-estrutural",
                        "Fluxo com decisão",
                        [
                          { start: "Receber requisito" },
                          {
                            if: "O requisito está completo?",
                            practice: {
                              text: {
                                blank: true,
                                mode: "choice",
                                options: ["O requisito está completo?", "O requisito está atrasado?"]
                              },
                              labels: {
                                yes: {
                                  blank: true,
                                  options: ["Sim", "Não"]
                                },
                                no: {
                                  blank: true,
                                  options: ["Não", "Talvez"]
                                }
                              }
                            },
                            then: [
                              { process: "Planejar implementação" }
                            ],
                            else: [
                              { input: "Solicitar complemento" }
                            ]
                          },
                          { end: "Seguir para execução" }
                        ]
                      ),
                      createFlowCard(
                        "card-v-fluxo-pratica",
                        "Fluxograma em exercício",
                        [
                          {
                            start: "Abrir chamado",
                            practice: {
                              blankShape: true,
                              shapeOptions: ["process", "terminal"]
                            }
                          },
                          {
                            process: "Classificar prioridade",
                            practice: {
                              text: {
                                blank: true,
                                variants: ["Classificar prioridade", "Definir prioridade"]
                              }
                            }
                          },
                          {
                            if: "O impacto é alto?",
                            practice: {
                              blankShape: true,
                              shapeOptions: ["decision", "process"],
                              labels: {
                                yes: {
                                  blank: true,
                                  options: ["Sim", "Não"]
                                },
                                no: {
                                  blank: true,
                                  options: ["Não", "Sim"]
                                }
                              }
                            },
                            then: [
                              { output: "Escalar atendimento" }
                            ],
                            else: [
                              { process: "Entrar na fila normal" }
                            ]
                          },
                          { end: "Registrar conclusão" }
                        ]
                      ),
                      createEditorCard(
                        "card-v-json",
                        "Exemplo estrutural",
                        "json",
                        '{ "microsequence": "modelo-em-v", "focus": "rastreabilidade" }'
                      )
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        key: "course-logica",
        title: "Lógica para Informática",
        description: "Segundo curso do seed principal para validar navegação multi-curso.",
        modules: [
          {
            key: "module-proposicoes",
            title: "Proposições",
            description: "Frases declarativas e operações básicas.",
            lessons: [
              {
                key: "lesson-negacao",
                title: "Negação",
                description: "Aplicar a negação sem trocar o referente da proposição.",
                microsequences: [
                  {
                    key: "microsequence-frases-logicas",
                    title: "Frases lógicas",
                    tags: ["Lógica", "Base"],
                    cards: [
                      createTextCard(
                        "card-logica-definicao",
                        "Definição",
                        "Proposição é uma frase declarativa à qual se pode atribuir valor verdadeiro ou falso."
                      ),
                      createChoiceCard(
                        "card-logica-choice",
                        "Identificação",
                        "Qual item é proposição no sentido lógico clássico?",
                        ["A porta está fechada."],
                        ["Feche a porta.", "A porta está fechada?"]
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
