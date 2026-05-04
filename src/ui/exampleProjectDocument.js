import { normalizeCardBlocks } from "../core/cardBlockModel.js";

function buildCardBlocks(entry, index) {
  const text = entry.text || "";
  const sentenceParts = text.split(".").map((item) => item.trim()).filter(Boolean);
  const firstLine = sentenceParts[0] || text;
  const secondLine = sentenceParts[1] || firstLine;

  const templates = [
    [
      { kind: "heading", label: entry.title },
      { kind: "paragraph", label: firstLine }
    ],
    [
      { kind: "paragraph", label: firstLine },
      { kind: "list", label: secondLine }
    ],
    [
      { kind: "paragraph", label: firstLine },
      { kind: "choice", label: "Comparação guiada" }
    ],
    [
      { kind: "table", label: "Quadro comparativo" },
      { kind: "paragraph", label: secondLine }
    ],
    [
      { kind: "flowchart", label: "Fluxo resumido" },
      { kind: "paragraph", label: firstLine }
    ]
  ];

  return normalizeCardBlocks({
    title: entry.title,
    text: entry.text,
    blocks: entry.blocks || templates[index % templates.length]
  });
}

function createCards(microsequenceKey, microsequenceTitle, entries) {
  return entries.map((entry, index) => {
    return {
      key: `card-${microsequenceKey}-${index + 1}`,
      intent: "text",
      title: entry.title,
      data: {
        blocks: buildCardBlocks(entry, index)
      }
    };
  });
}

function createMicrosequence({ key, title, objective, cards }) {
  return {
    key,
    title,
    objective,
    cards: createCards(key, title, cards)
  };
}

const engineeringSoftwareLessonOne = [
  createMicrosequence({
    key: "modelo-cascata",
    title: "Modelo cascata",
    objective: "Introduzir o fluxo sequencial clássico.",
    cards: [
      { title: "Visão geral", text: "O modelo cascata organiza o projeto em fases sequenciais com avanço controlado." },
      { title: "Fases", text: "Requisitos, análise, projeto, implementação, testes e manutenção aparecem em sequência." },
      { title: "Limites", text: "Mudanças tardias custam mais quando o processo é rígido e pouco iterativo." },
      { title: "Quando usar", text: "Funciona melhor quando o escopo é estável e as entregas podem seguir um plano mais previsível." },
      { title: "Comparação", text: "Em relação a modelos iterativos, o cascata aceita menos revisões tardias e menos ciclos de feedback." }
    ]
  }),
  createMicrosequence({
    key: "modelo-v",
    title: "Modelo em V",
    objective: "Conectar desenvolvimento e verificação.",
    cards: [
      { title: "Estrutura", text: "O modelo em V espelha as etapas de construção com níveis correspondentes de teste." },
      { title: "Validação", text: "Cada fase de especificação se conecta a uma fase de verificação ou validação." },
      { title: "Uso", text: "É útil quando a rastreabilidade entre requisitos e testes precisa ser explícita." },
      { title: "Benefício", text: "Ele deixa mais claro como cada decisão de análise ou projeto será confirmada depois por teste." },
      { title: "Risco", text: "Se o contexto mudar demais, a estrutura em espelho pode ficar pesada e pouco adaptável." }
    ]
  }),
  createMicrosequence({
    key: "modelo-iterativo",
    title: "Modelo iterativo",
    objective: "Apresentar ciclos curtos de evolução.",
    cards: [
      { title: "Ciclos", text: "O produto evolui por incrementos sucessivos e feedback frequente." },
      { title: "Revisão", text: "Cada iteração permite revisar decisões anteriores com menor custo." },
      { title: "Vantagem", text: "Aprendizado e ajuste contínuo tornam o processo mais adaptável." },
      { title: "Planejamento", text: "O planejamento deixa de ser uma peça única e passa a ser revisto ao longo das iterações." },
      { title: "Exemplo", text: "Uma primeira versão simples pode validar entendimento antes de novas funcionalidades entrarem no produto." }
    ]
  }),
  createMicrosequence({
    key: "modelo-evolucionario",
    title: "Modelo evolucionário",
    objective: "Mostrar evolução progressiva do produto.",
    cards: [
      { title: "Conceito", text: "A solução cresce em versões progressivas a partir de um núcleo funcional." },
      { title: "Feedback", text: "O contato contínuo com o usuário influencia a forma final do produto." },
      { title: "Risco", text: "Sem controle, a evolução pode gerar estrutura instável ou pouco planejada." },
      { title: "Protótipo", text: "A evolução pode nascer de uma solução parcial que vai sendo expandida e corrigida com uso real." },
      { title: "Limite", text: "Sem critério de arquitetura, o acúmulo de mudanças pode degradar a coerência do sistema." }
    ]
  }),
  createMicrosequence({
    key: "espiral-boehm",
    title: "Espiral de Boehm",
    objective: "Introduzir abordagem orientada a risco.",
    cards: [
      { title: "Ciclos orientados a risco", text: "Cada volta da espiral analisa riscos antes de expandir a solução." },
      { title: "Planejamento", text: "Planejamento, análise de risco, engenharia e avaliação aparecem em cada ciclo." },
      { title: "Aplicação", text: "É útil quando o projeto é complexo e a incerteza precisa ser tratada cedo." },
      { title: "Critério", text: "O avanço não depende só de concluir tarefas, mas de reduzir riscos relevantes de negócio e tecnologia." },
      { title: "Comparação", text: "Em relação ao iterativo simples, a espiral explicita a análise de risco como centro do ciclo." }
    ]
  }),
  createMicrosequence({
    key: "rup",
    title: "RUP",
    objective: "Apresentar o Rational Unified Process.",
    cards: [
      { title: "Fases", text: "Concepção, elaboração, construção e transição estruturam o processo." },
      { title: "Iterações", text: "Cada fase pode conter várias iterações com objetivos específicos." },
      { title: "Artefatos", text: "O processo enfatiza papéis, artefatos, disciplinas e rastreabilidade." },
      { title: "Disciplina", text: "Requisitos, análise, implementação e testes aparecem como disciplinas recorrentes ao longo do processo." },
      { title: "Peso", text: "Sua adoção costuma exigir mais formalização e mais disciplina organizacional que abordagens ágeis leves." }
    ]
  }),
  createMicrosequence({
    key: "prototipacao",
    title: "Prototipação",
    objective: "Mostrar protótipos como mecanismo de descoberta.",
    cards: [
      { title: "Objetivo", text: "Protótipos ajudam a validar requisitos e interações antes da solução final." },
      { title: "Tipos", text: "Há protótipos descartáveis e evolutivos, com objetivos diferentes." },
      { title: "Cuidado", text: "Um protótipo não deve ser confundido automaticamente com produto final." },
      { title: "Uso didático", text: "Protótipos podem revelar mal-entendidos cedo, quando ainda é barato corrigir a direção." },
      { title: "Risco de percepção", text: "Usuários podem supor que algo visualmente pronto já está pronto para produção." }
    ]
  }),
  createMicrosequence({
    key: "desenvolvimento-agil",
    title: "Desenvolvimento ágil",
    objective: "Introduzir adaptação contínua e entrega frequente.",
    cards: [
      { title: "Princípio", text: "Entregas curtas e feedback contínuo orientam a evolução do produto." },
      { title: "Equipe", text: "Colaboração constante entre negócio e desenvolvimento é central." },
      { title: "Valor", text: "A prioridade está em responder a mudanças e entregar valor cedo." },
      { title: "Ritmo", text: "Um ritmo sustentável de entrega ajuda a manter qualidade e previsibilidade ao longo do tempo." },
      { title: "Pressuposto", text: "Agilidade não elimina planejamento; ela redistribui o planejamento ao longo do fluxo." }
    ]
  }),
  createMicrosequence({
    key: "scrum",
    title: "Scrum",
    objective: "Apresentar papéis e ciclos básicos do Scrum.",
    cards: [
      { title: "Papéis", text: "Product Owner, Scrum Master e time de desenvolvimento organizam o trabalho." },
      { title: "Eventos", text: "Sprint, planning, daily, review e retrospective estruturam o ciclo." },
      { title: "Artefatos", text: "Product backlog e sprint backlog guiam a execução incremental." },
      { title: "Inspeção", text: "Os eventos existem para inspecionar avanço, adaptar plano e reduzir desvios rapidamente." },
      { title: "Limite", text: "Sem clareza de objetivo da sprint, o ritual pode virar cerimônia sem aprendizagem real." }
    ]
  }),
  createMicrosequence({
    key: "kanban",
    title: "Kanban",
    objective: "Mostrar fluxo contínuo e limitação de trabalho.",
    cards: [
      { title: "Fluxo visual", text: "O quadro evidencia estados do trabalho e gargalos do processo." },
      { title: "WIP", text: "Limites de trabalho em progresso ajudam a controlar capacidade e foco." },
      { title: "Melhoria", text: "O processo evolui por ajuste incremental do fluxo real." },
      { title: "Métrica", text: "Lead time e throughput ajudam a observar o comportamento do fluxo ao longo do tempo." },
      { title: "Uso", text: "É útil quando o trabalho chega de forma contínua e a equipe precisa enxergar gargalos com clareza." }
    ]
  })
];

export function createExampleProjectDocument() {
  return {
    contract: "aralearn.intent.v1",
    course: {
      key: "course-engenharia-software",
      title: "Engenharia de Software",
      description: "Casca editorial com microssequências didáticas curtas e dependências visíveis.",
      modules: [
        {
          key: "module-processos-software",
          title: "Processos de software",
          description: "Modelos de processo e desenvolvimento.",
          lessons: [
            {
              key: "lesson-modelos-processo",
              title: "Modelos de processo",
              description: "Comparar abordagens sequenciais, iterativas e orientadas a risco na condução do desenvolvimento.",
              microsequences: engineeringSoftwareLessonOne
            },
            {
              key: "lesson-praticas-ageis",
              title: "Práticas ágeis",
              description: "Entender como XP, Lean e DevOps encurtam ciclos de feedback e sustentam entregas contínuas.",
              microsequences: [
                createMicrosequence({
                  key: "xp",
                  title: "XP",
                  objective: "Práticas técnicas e feedback rápido.",
                  cards: [
                    { title: "Valores", text: "Comunicação, simplicidade, feedback, coragem e respeito." },
                    { title: "Práticas", text: "Programação em par, testes e integração contínua aparecem como núcleo." }
                  ]
                }),
                createMicrosequence({
                  key: "lean-software",
                  title: "Lean software",
                  objective: "Fluxo enxuto e eliminação de desperdícios.",
                  cards: [
                    { title: "Desperdício", text: "A ideia central é reduzir atividades que não agregam valor." },
                    { title: "Fluxo", text: "Decisões locais devem favorecer o fluxo global do trabalho." }
                  ]
                }),
                createMicrosequence({
                  key: "devops",
                  title: "DevOps",
                  objective: "Integração entre desenvolvimento e operação.",
                  cards: [
                    { title: "Integração", text: "A colaboração reduz atritos entre entrega e operação." },
                    { title: "Automação", text: "Pipelines e monitoramento apoiam entregas frequentes e estáveis." },
                    { title: "Cultura", text: "DevOps também é alinhamento cultural, não só ferramental." }
                  ]
                })
              ]
            }
          ]
        },
        {
          key: "module-requisitos-arquitetura",
          title: "Requisitos e arquitetura",
          description: "Contexto adjacente para ampliar a hierarquia do editor.",
          lessons: [
            {
              key: "lesson-requisitos",
              title: "Requisitos",
              description: "Levantar, negociar e priorizar necessidades do sistema antes da solução técnica.",
              microsequences: [
                createMicrosequence({
                  key: "levantamento-requisitos",
                  title: "Levantamento",
                  objective: "Coletar necessidades do sistema.",
                  cards: [
                    { title: "Fontes", text: "Usuários, documentos, normas e observação ajudam a levantar requisitos." },
                    { title: "Conflitos", text: "Conflitos entre fontes precisam ser explicitados cedo." }
                  ]
                }),
                createMicrosequence({
                  key: "priorizacao-requisitos",
                  title: "Priorização",
                  objective: "Definir valor e urgência dos requisitos.",
                  cards: [
                    { title: "Critérios", text: "Valor, risco, custo e dependência influenciam a priorização." },
                    { title: "Negociação", text: "Priorização costuma exigir negociação entre atores distintos." }
                  ]
                })
              ]
            },
            {
              key: "lesson-arquitetura",
              title: "Arquitetura",
              description: "Relacionar decisões estruturais do sistema com qualidade, evolução e restrições do contexto.",
              microsequences: [
                createMicrosequence({
                  key: "camadas",
                  title: "Arquitetura em camadas",
                  objective: "Separação de responsabilidades por camadas.",
                  cards: [
                    { title: "Separação", text: "Cada camada concentra uma responsabilidade arquitetural clara." },
                    { title: "Dependência", text: "As dependências devem seguir direção arquitetural consistente." }
                  ]
                })
              ]
            }
          ]
        }
      ]
    }
  };
}
