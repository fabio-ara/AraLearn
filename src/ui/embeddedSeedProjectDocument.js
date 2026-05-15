import { createMatematicaParaInformaticaCourse } from "./exampleProjectDocument.js";

const OACO_BASE_URL = "https://andrels.com.br/oaco/";
const OACO_EXERCISES_A_URL = `${OACO_BASE_URL}ExerciciosA.htm`;
const OACO_LESSON_URLS = Object.freeze({
  evolution: `${OACO_BASE_URL}01.htm`,
  moore: `${OACO_BASE_URL}02.htm`,
  devices: `${OACO_BASE_URL}03.htm`,
  ioBuses: `${OACO_BASE_URL}04.htm`,
  memories: `${OACO_BASE_URL}05.htm`,
  vonNeumann: `${OACO_BASE_URL}06.htm`
});

function readyMicrosequence(input) {
  return {
    status: "ready",
    included: true,
    ...input
  };
}

export function createOrganizacaoArquiteturaComputadoresCourse() {
  return {
    key: "course-organizacao-arquitetura-computadores",
    title: "Organização e Arquitetura de Computadores",
    description:
      "Trilha introdutória alinhada à Prova A: evolução do hardware, Lei de Moore, dispositivos, barramentos, memórias e arquitetura de Von Neumann.",
    modules: [
      {
        key: "module-prova-a-fundamentos",
        title: "Prova A: Fundamentos de Hardware",
        description:
          "Seis lições alinhadas às primeiras aulas do curso e aos exercícios da Prova A, sem supor conhecimento prévio.",
        lessons: [
          {
            key: "lesson-evolucao-transistor-soc",
            title: "Evolução dos computadores: do transistor ao SoC",
            description:
              "Miniaturização, integração em chips, microprocessadores e a chegada do System on Chip.",
            sourceGuideStructured: {
              lessonGoal:
                "Explicar por que transistor, circuito integrado, microprocessador e SoC marcam etapas diferentes da evolução do computador.",
              notationRules:
                "Ler e distinguir `transistor`, `circuito integrado (IC)`, `microprocessador`, `CPU` e `SoC` sem tratar todos como sinônimos.",
              commonErrors:
                "Confundir transistor com chip inteiro, achar que microprocessador substitui todo o computador e pensar que SoC significa apenas uma CPU menor."
            },
            domainMap: {
              sourceRefs: [OACO_LESSON_URLS.evolution, OACO_EXERCISES_A_URL],
              items: [
                {
                  id: "evolution-transistor",
                  label:
                    "Transistores substituíram válvulas com miniaturização, menor consumo de energia e maior confiabilidade.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.evolution, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["comparar válvula e transistor", "reconhecer a consequência da troca"]
                },
                {
                  id: "evolution-ic",
                  label: "Circuitos integrados reúnem vários transistores em um único chip e ampliam a capacidade de processamento.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.evolution, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["explicar o que o IC integra", "relacionar IC com escalabilidade"]
                },
                {
                  id: "evolution-microprocessor",
                  label: "Microprocessador condensa a CPU em um único chip e barateia a computação pessoal e embarcada.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.evolution, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["identificar a inovação central", "ligar microprocessador à democratização do hardware"]
                },
                {
                  id: "evolution-soc",
                  label: "SoC integra CPU, GPU, memória e controladores no mesmo chip para elevar eficiência e integração.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.evolution, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["distinguir SoC de um chip só de CPU", "reconhecer aplicações em móveis e IoT"]
                }
              ],
              practiceVariants: [
                {
                  id: "variant-evolution-compare",
                  domainItemRef: "evolution-transistor",
                  variantKind: "discrimination",
                  purpose: "Distinguir a vantagem do transistor sobre a válvula.",
                  difficulty: "baixa",
                  representation: "alternativas de prova"
                },
                {
                  id: "variant-evolution-order",
                  domainItemRef: "evolution-ic",
                  variantKind: "representation_shift",
                  purpose: "Reconhecer a ordem histórica das integrações em chip.",
                  difficulty: "baixa",
                  representation: "linha do tempo"
                },
                {
                  id: "variant-evolution-exam",
                  domainItemRef: "evolution-microprocessor",
                  variantKind: "exam_format",
                  purpose: "Responder questão objetiva sobre microprocessador.",
                  difficulty: "baixa",
                  representation: "múltipla escolha"
                },
                {
                  id: "variant-soc-exam",
                  domainItemRef: "evolution-soc",
                  variantKind: "exam_format",
                  purpose: "Reconhecer a característica do SoC em questão objetiva.",
                  difficulty: "baixa",
                  representation: "múltipla escolha"
                }
              ]
            },
            microsequences: [
              readyMicrosequence({
                key: "microsequence-evolucao-marcos",
                title: "Quatro marcos da miniaturização",
                tags: ["Prova A", "Evolução", "Chips"],
                domainRefs: ["evolution-transistor", "evolution-ic", "evolution-microprocessor", "evolution-soc"],
                didacticPurpose: "Introduzir os quatro marcos cobrados na prova sem supor familiaridade prévia com hardware.",
                coverageRole: "explain",
                cards: [
                  {
                    key: "card-evolucao-valvula-transistor",
                    title: "Da válvula ao transistor",
                    say:
                      "Antes dos transistores, computadores eletrônicos usavam válvulas, que eram grandes, aqueciam muito e consumiam bastante energia.\n\nO transistor reduziu tamanho e consumo, além de tornar o equipamento mais confiável."
                  },
                  {
                    key: "card-evolucao-comparacao",
                    title: "O que mudou com o transistor",
                    say: "A comparação abaixo resume a troca que inaugura a era dos computadores menores e mais práticos.",
                    table: {
                      columns: ["Tecnologia", "Tamanho e calor", "Consumo", "Confiabilidade"],
                      rows: [
                        ["Válvula", "grande e quente", "alto", "menor"],
                        ["Transistor", "menor e mais frio", "menor", "maior"]
                      ]
                    }
                  },
                  {
                    key: "card-evolucao-ic",
                    title: "Circuito integrado",
                    say:
                      "O circuito integrado, ou `IC`, reúne vários transistores em um único chip.\n\nEm vez de espalhar muitos componentes separados pela placa, a integração concentra tudo e permite crescer em poder de processamento."
                  },
                  {
                    key: "card-evolucao-microprocessador",
                    title: "Microprocessador",
                    say:
                      "O microprocessador condensa a `CPU` em um único chip.\n\nIsso reduz custo e tamanho do sistema e ajuda a explicar por que microcomputadores e sistemas embarcados se tornam viáveis em larga escala."
                  },
                  {
                    key: "card-evolucao-soc",
                    title: "System on Chip",
                    say:
                      "No `SoC`, a integração vai além da `CPU`: o mesmo chip pode reunir `CPU`, `GPU`, memória e controladores.\n\nA ideia central não é só caber mais coisas em menos espaço, mas também gastar menos energia e simplificar o sistema."
                  }
                ]
              }),
              readyMicrosequence({
                key: "microsequence-evolucao-pratica-prova",
                title: "Reconheça a inovação cobrada",
                tags: ["Prova A", "Revisão", "Questões"],
                domainRefs: ["evolution-transistor", "evolution-ic", "evolution-microprocessor", "evolution-soc"],
                practiceVariantRefs: [
                  "variant-evolution-compare",
                  "variant-evolution-order",
                  "variant-evolution-exam",
                  "variant-soc-exam"
                ],
                didacticPurpose: "Consolidar os quatro marcos em formato curto de prova.",
                coverageRole: "exam_apply",
                cards: [
                  {
                    key: "card-evolucao-pratica-transistor",
                    title: "Questão sobre transistores",
                    ask:
                      "Qual consequência representa melhor a substituição das válvulas por transistores?",
                    answer: "Miniaturização, menor consumo de energia e maior confiabilidade.",
                    wrong: [
                      "Aumento do tamanho físico das máquinas.",
                      "Queda inevitável da velocidade de processamento.",
                      "Surgimento imediato dos computadores pessoais."
                    ],
                    after:
                      "O ponto central é comparar com a válvula: o transistor reduz tamanho e consumo, e aumenta a confiabilidade."
                  },
                  {
                    key: "card-evolucao-pratica-ic",
                    title: "Questão sobre circuito integrado",
                    ask:
                      "O que o circuito integrado acrescenta em relação ao transistor isolado?",
                    answer: "Integra vários transistores em um único chip.",
                    wrong: [
                      "Elimina totalmente o uso de transistores.",
                      "Serve apenas para armazenamento óptico.",
                      "Aumenta a necessidade de componentes separados."
                    ],
                    after:
                      "O `IC` não substitui o transistor por outra ideia: ele integra muitos transistores no mesmo chip."
                  },
                  {
                    key: "card-evolucao-pratica-microprocessador",
                    title: "Questão sobre microprocessador",
                    ask:
                      "Qual impacto principal explica a importância do microprocessador?",
                    answer:
                      "Condensar a CPU em um chip e baratear a computação pessoal e embarcada.",
                    wrong: [
                      "Centralizar o hardware em poucas empresas e reduzir competição.",
                      "Tornar obsoletos todos os circuitos integrados.",
                      "Eliminar o uso de memória e periféricos."
                    ],
                    after:
                      "O microprocessador concentra a `CPU` no chip, o que reduz custo e abre espaço para novas aplicações."
                  },
                  {
                    key: "card-evolucao-pratica-soc",
                    title: "Complete o conceito de SoC",
                    say:
                      "Um `SoC` combina `CPU`, `GPU`, memória e controladores em [[um único chip::um único chip|placas separadas|várias fontes de alimentação]].",
                    after:
                      "O traço distintivo do `SoC` é a integração de vários subsistemas no mesmo chip."
                  }
                ]
              })
            ]
          },
          {
            key: "lesson-lei-de-moore",
            title: "Lei de Moore",
            description:
              "Densidade de transistores, avanço do desempenho, limites físicos e estratégias além da miniaturização simples.",
            sourceGuideStructured: {
              lessonGoal:
                "Explicar o enunciado da Lei de Moore, suas consequências econômicas e por que o ritmo desacelera em tecnologias recentes.",
              notationRules:
                "Ler `transistor`, `chip`, `18 a 24 meses`, `nanômetro`, `GPU` e `IA` como termos de engenharia, não como sinônimos vagos de velocidade.",
              commonErrors:
                "Trocar Lei de Moore por aumento de frequência de clock, achar que ela fala de tamanho físico do chip e ignorar limites atômicos e térmicos."
            },
            domainMap: {
              sourceRefs: [OACO_LESSON_URLS.moore, OACO_EXERCISES_A_URL],
              items: [
                {
                  id: "moore-definition",
                  label: "A Lei de Moore observa a duplicação aproximada do número de transistores por chip a cada 18 a 24 meses.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.moore, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["enunciar a lei corretamente", "distinguir transistor de clock"]
                },
                {
                  id: "moore-economic-effect",
                  label: "Mais transistores por chip tendem a reduzir o custo por unidade de processamento ao longo do tempo.",
                  kind: "interpretation",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.moore, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["reconhecer a consequência econômica", "ligar densidade a acessibilidade"]
                },
                {
                  id: "moore-physical-limit",
                  label: "A desaceleração recente se relaciona a limites físicos, efeitos quânticos e aquecimento em escalas nanométricas.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.moore, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["identificar a causa da desaceleração", "relacionar miniaturização a limite físico"]
                },
                {
                  id: "moore-alternatives",
                  label: "Paralelismo, GPUs e aceleradores especializados são estratégias para avançar além do escalonamento simples da Lei de Moore.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.moore, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["reconhecer alternativa válida", "não tratar clock indefinido como solução"]
                }
              ],
              practiceVariants: [
                {
                  id: "variant-moore-definition",
                  domainItemRef: "moore-definition",
                  variantKind: "exam_format",
                  purpose: "Reconhecer o enunciado correto da Lei de Moore.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-moore-limit",
                  domainItemRef: "moore-physical-limit",
                  variantKind: "discrimination",
                  purpose: "Separar limite físico de explicações erradas como falta de linguagem de programação.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-moore-economy",
                  domainItemRef: "moore-economic-effect",
                  variantKind: "exam_format",
                  purpose: "Reconhecer a implicação econômica cobrada na prova.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-moore-alternatives",
                  domainItemRef: "moore-alternatives",
                  variantKind: "exam_format",
                  purpose: "Identificar alternativa moderna à miniaturização simples.",
                  difficulty: "baixa"
                }
              ]
            },
            microsequences: [
              readyMicrosequence({
                key: "microsequence-moore-fundamentos",
                title: "O que a Lei de Moore realmente diz",
                tags: ["Prova A", "Lei de Moore", "Semicondutores"],
                domainRefs: [
                  "moore-definition",
                  "moore-economic-effect",
                  "moore-physical-limit",
                  "moore-alternatives"
                ],
                didacticPurpose: "Construir a leitura correta da Lei de Moore antes das questões objetivas.",
                coverageRole: "explain",
                cards: [
                  {
                    key: "card-moore-definicao",
                    title: "Enunciado essencial",
                    say:
                      "A Lei de Moore não afirma que o clock dobra nem que o chip fica fisicamente maior.\n\nA observação central é que o número de transistores em um chip tende a dobrar aproximadamente a cada `18 a 24 meses`."
                  },
                  {
                    key: "card-moore-consequencias",
                    title: "Por que isso importa",
                    say: "Mais transistores no mesmo chip costumam significar mais capacidade computacional e menor custo por unidade de processamento.",
                    table: {
                      columns: ["Mudança", "Efeito técnico", "Efeito econômico"],
                      rows: [
                        ["mais transistores", "mais capacidade de integração", "mais processamento pelo mesmo custo ou menor"],
                        ["menor custo por transistor", "chips mais acessíveis", "hardware mais difundido"]
                      ]
                    }
                  },
                  {
                    key: "card-moore-desaceleracao",
                    title: "Por que o ritmo diminui",
                    say:
                      "Quando os transistores chegam a escalas de poucos `nanômetros`, surgem limites físicos importantes.\n\nEfeitos quânticos, aquecimento e proximidade do tamanho atômico dificultam continuar miniaturizando no mesmo ritmo."
                  },
                  {
                    key: "card-moore-alternativas",
                    title: "O que vem depois do escalonamento simples",
                    say:
                      "Se miniaturizar sozinho já não basta, a indústria procura outras saídas.\n\nArquiteturas paralelas, `GPUs` e aceleradores especializados para `IA` são exemplos de avanço por especialização e paralelismo."
                  }
                ]
              }),
              readyMicrosequence({
                key: "microsequence-moore-pratica-prova",
                title: "Questões típicas sobre a Lei de Moore",
                tags: ["Prova A", "Revisão", "Questões"],
                domainRefs: [
                  "moore-definition",
                  "moore-economic-effect",
                  "moore-physical-limit",
                  "moore-alternatives"
                ],
                practiceVariantRefs: [
                  "variant-moore-definition",
                  "variant-moore-limit",
                  "variant-moore-economy",
                  "variant-moore-alternatives"
                ],
                didacticPurpose: "Fixar o enunciado, os limites e as implicações econômicas em formato de prova.",
                coverageRole: "exam_apply",
                cards: [
                  {
                    key: "card-moore-pratica-definicao",
                    title: "Questão sobre a lei",
                    ask:
                      "Qual formulação representa corretamente a Lei de Moore?",
                    answer:
                      "A quantidade de transistores em um chip dobra aproximadamente a cada 18 a 24 meses.",
                    wrong: [
                      "A velocidade do processador dobra a cada 18 meses.",
                      "O tamanho físico dos chips dobra a cada dois anos.",
                      "O custo de produção dobra a cada 18 meses."
                    ],
                    after:
                      "A lei fala de densidade de transistores, não de clock, tamanho físico do chip ou custo total de fabricação."
                  },
                  {
                    key: "card-moore-pratica-limite",
                    title: "Questão sobre desaceleração",
                    ask:
                      "Qual fator explica melhor a desaceleração recente da Lei de Moore?",
                    answer: "Limites físicos ligados ao tamanho atômico, efeitos quânticos e aquecimento.",
                    wrong: [
                      "Falta de novas linguagens de programação.",
                      "Redução do número de núcleos.",
                      "Substituição total do silício por cobre."
                    ],
                    after:
                      "O obstáculo principal é físico: transistores muito pequenos passam a sofrer efeitos que impedem continuar no mesmo ritmo."
                  },
                  {
                    key: "card-moore-pratica-economia",
                    title: "Questão sobre efeito econômico",
                    ask:
                      "Qual implicação econômica acompanha o aumento de densidade de transistores?",
                    answer: "Redução do custo por unidade de processamento ao longo do tempo.",
                    wrong: [
                      "Aumento constante do preço por transistor.",
                      "Estagnação automática do mercado de semicondutores.",
                      "Eliminação imediata dos chips antigos."
                    ],
                    after:
                      "Se mais processamento cabe no mesmo chip, o custo relativo por capacidade tende a cair."
                  },
                  {
                    key: "card-moore-pratica-alternativa",
                    title: "Complete a alternativa moderna",
                    say:
                      "Com a desaceleração da Lei de Moore, uma estratégia válida é investir em [[arquiteturas paralelas e especializadas::arquiteturas paralelas e especializadas|frequência de clock indefinida|menos transistores por chip]].",
                    after:
                      "A resposta correta aponta para paralelismo e especialização, como `GPUs` e aceleradores de `IA`."
                  }
                ]
              })
            ]
          },
          {
            key: "lesson-dispositivos-basicos",
            title: "Dispositivos de entrada, saída, armazenamento, processamento e alimentação",
            description:
              "Classificação básica de hardware, memória volátil e não volátil, papel da CPU e função da fonte de alimentação.",
            sourceGuideStructured: {
              lessonGoal:
                "Fazer o aluno distinguir entrada, saída, armazenamento, processamento e alimentação em exemplos comuns de hardware.",
              notationRules:
                "Ler `CPU`, `RAM`, `ROM`, `SSD`, `HD`, `AC` e `DC` como siglas com função específica, não como palavras intercambiáveis.",
              commonErrors:
                "Misturar entrada com saída, tratar SSD como se não armazenasse dados e confundir a fonte de alimentação com um componente de processamento."
            },
            domainMap: {
              sourceRefs: [OACO_LESSON_URLS.devices, OACO_EXERCISES_A_URL],
              items: [
                {
                  id: "devices-input-output",
                  label: "Dispositivos de entrada enviam dados ao sistema, enquanto dispositivos de saída apresentam resultados ao usuário.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.devices, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["classificar periféricos como entrada ou saída", "não misturar teclado com monitor"]
                },
                {
                  id: "devices-storage-processing",
                  label: "HD e SSD armazenam dados; RAM é armazenamento volátil; CPU é o principal dispositivo de processamento.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.devices, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["distinguir armazenamento de processamento", "reconhecer volátil e não volátil"]
                },
                {
                  id: "devices-psu",
                  label: "A fonte de alimentação converte energia alternada em contínua para os componentes internos.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.devices, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["explicar a função da fonte", "não atribuir à fonte papel de memória ou vídeo"]
                }
              ],
              practiceVariants: [
                {
                  id: "variant-devices-classification",
                  domainItemRef: "devices-input-output",
                  variantKind: "fluency",
                  purpose: "Classificar conjuntos de periféricos.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-devices-storage",
                  domainItemRef: "devices-storage-processing",
                  variantKind: "exam_format",
                  purpose: "Julgar afirmações sobre RAM, SSD, HD e CPU.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-devices-psu",
                  domainItemRef: "devices-psu",
                  variantKind: "exam_format",
                  purpose: "Reconhecer a função da fonte de alimentação.",
                  difficulty: "baixa"
                }
              ]
            },
            microsequences: [
              readyMicrosequence({
                key: "microsequence-devices-classificacao",
                title: "Como classificar o hardware básico",
                tags: ["Prova A", "Dispositivos", "Classificação"],
                domainRefs: ["devices-input-output", "devices-storage-processing", "devices-psu"],
                didacticPurpose: "Introduzir a classificação mínima de periféricos e componentes cobrados na prova.",
                coverageRole: "explain",
                cards: [
                  {
                    key: "card-devices-tipos",
                    title: "Cinco funções para não misturar",
                    say: "Nesta prova, convém separar o hardware em cinco papéis: entrada, saída, armazenamento, processamento e alimentação.",
                    table: {
                      columns: ["Papel", "Pergunta guia", "Exemplos"],
                      rows: [
                        ["entrada", "o que envia dados ao sistema?", "teclado, scanner, microfone"],
                        ["saída", "o que mostra o resultado?", "monitor, impressora, caixa de som"],
                        ["armazenamento", "o que guarda dados?", "HD, SSD, RAM"],
                        ["processamento", "o que calcula e coordena?", "CPU"],
                        ["alimentação", "o que entrega energia correta?", "fonte de alimentação"]
                      ]
                    }
                  },
                  {
                    key: "card-devices-entrada-saida",
                    title: "Entrada e saída sem confusão",
                    say:
                      "Teclado, scanner e microfone são entrada porque colocam dados no computador.\n\nMonitor, impressora e projetor são saída porque apresentam o resultado do processamento."
                  },
                  {
                    key: "card-devices-armazenamento",
                    title: "Armazenamento e processamento",
                    say:
                      "`RAM` armazena dados temporariamente durante a execução; `HD` e `SSD` guardam dados de forma não volátil; `CPU` processa instruções e dados.\n\nPor isso, dizer que o `SSD` não serve para armazenar está errado."
                  },
                  {
                    key: "card-devices-fonte",
                    title: "Função da fonte de alimentação",
                    say:
                      "A fonte de alimentação não faz cálculos nem guarda dados.\n\nEla converte energia elétrica alternada da tomada em corrente contínua com tensões adequadas aos componentes internos."
                  }
                ]
              }),
              readyMicrosequence({
                key: "microsequence-devices-pratica-prova",
                title: "Questões de classificação e função",
                tags: ["Prova A", "Revisão", "Questões"],
                domainRefs: ["devices-input-output", "devices-storage-processing", "devices-psu"],
                practiceVariantRefs: [
                  "variant-devices-classification",
                  "variant-devices-storage",
                  "variant-devices-psu"
                ],
                didacticPurpose: "Consolidar a classificação básica e a função da fonte em formato de prova.",
                coverageRole: "exam_apply",
                cards: [
                  {
                    key: "card-devices-pratica-entrada",
                    title: "Somente dispositivos de entrada",
                    ask:
                      "Qual conjunto contém somente dispositivos de entrada?",
                    answer: "Scanner, microfone e teclado.",
                    wrong: [
                      "Monitor, teclado e mouse.",
                      "Impressora, mouse e câmera.",
                      "Teclado, monitor e pen drive."
                    ],
                    after:
                      "Scanner, microfone e teclado inserem dados no sistema; os demais conjuntos misturam saída ou armazenamento."
                  },
                  {
                    key: "card-devices-pratica-saida",
                    title: "Qual não é saída",
                    ask: "Qual item abaixo não é dispositivo de saída?",
                    answer: "Teclado.",
                    wrong: ["Impressora.", "Monitor.", "Projetor multimídia."],
                    after:
                      "O teclado serve para entrada de dados; impressora, monitor e projetor exibem resultados."
                  },
                  {
                    key: "card-devices-pratica-armazenamento",
                    title: "Afirmações sobre memória e CPU",
                    ask:
                      "Quais afirmações estão corretas: I) HD é não volátil; II) RAM é volátil; III) CPU é o principal dispositivo de processamento; IV) SSD não é usado para armazenar?",
                    answer: "Apenas I, II e III.",
                    wrong: [
                      "Apenas I e II.",
                      "Apenas II e IV.",
                      "Todas as afirmativas estão corretas."
                    ],
                    after:
                      "A afirmativa IV está errada porque `SSD` é armazenamento não volátil."
                  },
                  {
                    key: "card-devices-pratica-fonte",
                    title: "Complete a função da fonte",
                    say:
                      "A fonte de alimentação converte energia [[alternada em contínua::alternada em contínua|contínua em alternada|lógica em binária]] para os componentes internos.",
                    after:
                      "A função da fonte é preparar a energia elétrica para `CPU`, placa-mãe e dispositivos de armazenamento."
                  }
                ]
              })
            ]
          },
          {
            key: "lesson-io-e-barramentos",
            title: "Dispositivos de E/S, DMA e barramentos internos e externos",
            description:
              "Comunicação entre periféricos e processador, papel do DMA, distinção entre barramento interno e externo e caso clássico do PCIe.",
            sourceGuideStructured: {
              lessonGoal:
                "Explicar como dispositivos de E/S se comunicam com a CPU e distinguir DMA, PCIe e a diferença entre barramentos internos e externos.",
              notationRules:
                "Ler `E/S`, `DMA`, `PCIe`, `USB`, `CPU` e `GPU` como siglas com função de comunicação específica.",
              commonErrors:
                "Achar que o DMA transfere cada byte pela CPU, tratar PCIe como barramento externo de USB e confundir barramento interno com conexão de periféricos externos."
            },
            domainMap: {
              sourceRefs: [OACO_LESSON_URLS.ioBuses, OACO_EXERCISES_A_URL],
              items: [
                {
                  id: "iobuses-dma",
                  label: "DMA transfere dados entre memória e periférico sem a intervenção direta da CPU em cada byte.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.ioBuses, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["distinguir DMA de polling", "reconhecer ganho de desempenho"]
                },
                {
                  id: "iobuses-pcie",
                  label: "PCI Express é um barramento serial de alta velocidade que substitui barramentos paralelos antigos.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.ioBuses, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["identificar PCIe como serial", "não confundir com USB externo"]
                },
                {
                  id: "iobuses-internal-external",
                  label: "Barramento interno conecta CPU, memória e outros componentes da placa; barramento externo conecta periféricos.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.ioBuses, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["distinguir escopos interno e externo", "relacionar exemplos corretos"]
                }
              ],
              practiceVariants: [
                {
                  id: "variant-iobuses-dma",
                  domainItemRef: "iobuses-dma",
                  variantKind: "exam_format",
                  purpose: "Responder questão objetiva sobre DMA.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-iobuses-pcie",
                  domainItemRef: "iobuses-pcie",
                  variantKind: "exam_format",
                  purpose: "Reconhecer a característica do PCIe.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-iobuses-internal-external",
                  domainItemRef: "iobuses-internal-external",
                  variantKind: "discrimination",
                  purpose: "Separar barramento interno de barramento externo.",
                  difficulty: "baixa"
                }
              ]
            },
            microsequences: [
              readyMicrosequence({
                key: "microsequence-iobuses-fundamentos",
                title: "Como os dispositivos falam com o computador",
                tags: ["Prova A", "E/S", "Barramentos"],
                domainRefs: ["iobuses-dma", "iobuses-pcie", "iobuses-internal-external"],
                didacticPurpose: "Apresentar os conceitos mínimos de E/S, DMA e barramentos sem entrar em detalhe excessivo.",
                coverageRole: "explain",
                cards: [
                  {
                    key: "card-iobuses-modos-es",
                    title: "Três modos de lidar com E/S",
                    say: "Em E/S programada, a `CPU` verifica o dispositivo o tempo todo. Em E/S por interrupção, o dispositivo avisa quando precisa de atenção. Em `DMA`, um controlador transfere dados entre memória e periférico sem envolver diretamente a CPU em cada byte."
                  },
                  {
                    key: "card-iobuses-dma",
                    title: "Ideia central do DMA",
                    say:
                      "O `DMA` não elimina a `CPU`, mas a libera do trabalho repetitivo de supervisionar cada unidade de dado.\n\nIsso costuma melhorar o desempenho quando há muita transferência entre periférico e memória."
                  },
                  {
                    key: "card-iobuses-interno-externo",
                    title: "Barramento interno e externo",
                    say: "O barramento interno liga componentes da própria máquina, como `CPU`, memória e `GPU`. O barramento externo liga periféricos, como `USB`, impressora e dispositivos removíveis."
                  },
                  {
                    key: "card-iobuses-pcie",
                    title: "Por que o PCIe aparece na prova",
                    say:
                      "`PCIe` significa `PCI Express`.\n\nEle é um barramento serial de alta velocidade, ponto a ponto, criado para substituir barramentos paralelos mais antigos."
                  }
                ]
              }),
              readyMicrosequence({
                key: "microsequence-iobuses-pratica-prova",
                title: "Questões sobre DMA e barramentos",
                tags: ["Prova A", "Revisão", "Questões"],
                domainRefs: ["iobuses-dma", "iobuses-pcie", "iobuses-internal-external"],
                practiceVariantRefs: [
                  "variant-iobuses-dma",
                  "variant-iobuses-pcie",
                  "variant-iobuses-internal-external"
                ],
                didacticPurpose: "Treinar o reconhecimento das definições corretas cobradas em prova objetiva.",
                coverageRole: "exam_apply",
                cards: [
                  {
                    key: "card-iobuses-pratica-dma",
                    title: "Questão sobre DMA",
                    ask:
                      "Qual descrição representa corretamente a comunicação por DMA?",
                    answer:
                      "O controlador de DMA transfere dados entre memória e periférico sem a intervenção direta da CPU em cada byte.",
                    wrong: [
                      "Os dados passam apenas pela CPU, que supervisiona cada byte.",
                      "DMA é usado apenas em dispositivos de entrada.",
                      "DMA substitui completamente as interrupções."
                    ],
                    after:
                      "No `DMA`, a transferência não depende de a `CPU` controlar cada byte individualmente."
                  },
                  {
                    key: "card-iobuses-pratica-pcie",
                    title: "Questão sobre PCIe",
                    ask:
                      "Qual característica identifica o `PCIe` corretamente?",
                    answer:
                      "É um barramento serial de alta velocidade, substituto dos barramentos paralelos antigos.",
                    wrong: [
                      "Opera apenas como barramento externo para conectar dispositivos USB.",
                      "Usa comunicação paralela fixa de 32 bits por ciclo.",
                      "É exclusivo de armazenamento óptico."
                    ],
                    after:
                      "A palavra-chave aqui é `serial`: `PCIe` rompe com o modelo paralelo tradicional."
                  },
                  {
                    key: "card-iobuses-pratica-barramentos",
                    title: "Questão sobre barramento interno e externo",
                    ask:
                      "Qual distinção está correta?",
                    answer:
                      "O barramento interno conecta componentes internos; o barramento externo conecta periféricos.",
                    wrong: [
                      "O barramento interno conecta a CPU apenas a dispositivos externos.",
                      "O barramento externo conecta apenas teclado e mouse.",
                      "Ambos têm a mesma função, mudando apenas a velocidade."
                    ],
                    after:
                      "O contraste essencial é o alcance: dentro da placa para o barramento interno, fora dela para periféricos no barramento externo."
                  },
                  {
                    key: "card-iobuses-pratica-lacuna",
                    title: "Complete a distinção",
                    say:
                      "O barramento interno conecta `CPU`, memória e `GPU`, enquanto o barramento externo conecta [[periféricos::periféricos|válvulas|registradores]].",
                    after:
                      "Teclados, impressoras e interfaces `USB` entram no lado dos periféricos."
                  }
                ]
              })
            ]
          },
          {
            key: "lesson-memorias",
            title: "Memórias: hierarquia, localidade, RAM, ROM, buffer e mídias",
            description:
              "Ordem da hierarquia de memórias, princípio da proximidade, funções de RAM, ROM, buffer e memória virtual, além das tecnologias de armazenamento.",
            sourceGuideStructured: {
              lessonGoal:
                "Explicar a hierarquia de memórias, o princípio da proximidade e a função das principais memórias e mídias cobradas na prova.",
              notationRules:
                "Ler `cache`, `RAM`, `ROM`, `buffer`, `memória virtual`, `HD`, `SSD`, `CD` e `Blu-ray` como níveis ou tecnologias com função própria.",
              commonErrors:
                "Trocar a ordem da hierarquia, dizer que cache serve para armazenamento permanente e confundir mídia magnética, óptica e eletrônica."
            },
            domainMap: {
              sourceRefs: [OACO_LESSON_URLS.memories, OACO_EXERCISES_A_URL],
              items: [
                {
                  id: "memories-hierarchy",
                  label: "A hierarquia segue da memória mais rápida e cara para a mais lenta e barata: registradores, cache, RAM, disco e fita magnética.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.memories, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["ordenar a hierarquia", "relacionar velocidade, custo e capacidade"]
                },
                {
                  id: "memories-locality",
                  label: "O princípio da proximidade diz que programas tendem a reutilizar dados e instruções próximos no tempo e no espaço.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.memories, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["explicar a localidade", "ligar a ideia ao uso da cache"]
                },
                {
                  id: "memories-functions",
                  label: "RAM é volátil, ROM guarda instruções de inicialização, buffer sincroniza velocidades e memória virtual usa disco como extensão da memória principal.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.memories, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["atribuir a função correta a RAM, ROM, buffer e memória virtual", "identificar afirmações incorretas"]
                },
                {
                  id: "memories-media",
                  label: "HD e fitas usam tecnologia magnética, CDs e Blu-rays usam tecnologia óptica e SSD usa tecnologia eletrônica baseada em memória flash.",
                  kind: "comparison",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.memories, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["correlacionar mídia e tecnologia", "não confundir SSD com óptico"]
                }
              ],
              practiceVariants: [
                {
                  id: "variant-memories-hierarchy",
                  domainItemRef: "memories-hierarchy",
                  variantKind: "exam_format",
                  purpose: "Ordenar a hierarquia correta em questão objetiva.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-memories-locality",
                  domainItemRef: "memories-locality",
                  variantKind: "discrimination",
                  purpose: "Reconhecer o enunciado correto da localidade.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-memories-functions",
                  domainItemRef: "memories-functions",
                  variantKind: "common_error",
                  purpose: "Separar funções corretas e incorretas das memórias.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-memories-media",
                  domainItemRef: "memories-media",
                  variantKind: "exam_format",
                  purpose: "Relacionar mídia e tecnologia predominante.",
                  difficulty: "baixa"
                }
              ]
            },
            microsequences: [
              readyMicrosequence({
                key: "microsequence-memorias-fundamentos",
                title: "Hierarquia e função das memórias",
                tags: ["Prova A", "Memórias", "Hierarquia"],
                domainRefs: ["memories-hierarchy", "memories-locality", "memories-functions", "memories-media"],
                didacticPurpose: "Apresentar a visão geral de hierarquia, localidade e função de cada memória.",
                coverageRole: "explain",
                cards: [
                  {
                    key: "card-memorias-hierarquia",
                    title: "Ordem da hierarquia",
                    say:
                      "Na hierarquia de memórias, quanto mais perto da `CPU`, maior a velocidade e o custo por bit, mas menor a capacidade.\n\nA ordem pedida na prova é: registradores → cache → RAM → disco rígido → fita magnética."
                  },
                  {
                    key: "card-memorias-localidade",
                    title: "Princípio da proximidade",
                    say:
                      "Programas costumam reutilizar dados e instruções próximos no tempo e no espaço.\n\nEssa tendência explica por que faz sentido manter uma `cache`: ela guarda por perto o que tem maior chance de ser acessado logo de novo."
                  },
                  {
                    key: "card-memorias-funcoes",
                    title: "RAM, ROM, buffer e memória virtual",
                    say: "Cada memória aparece por um motivo diferente.",
                    table: {
                      columns: ["Recurso", "Função principal"],
                      rows: [
                        ["`RAM`", "armazenamento volátil de dados e programas em execução"],
                        ["`ROM`", "instruções essenciais de inicialização"],
                        ["`buffer`", "amortecer diferenças de velocidade entre dispositivos"],
                        ["memória virtual", "usar parte do disco como extensão da memória principal"]
                      ]
                    }
                  },
                  {
                    key: "card-memorias-midias",
                    title: "Tecnologia das mídias",
                    say: "Não basta saber o nome do dispositivo; a prova cobra também a tecnologia predominante.",
                    table: {
                      columns: ["Mídia", "Tecnologia"],
                      rows: [
                        ["HD e fita", "magnética"],
                        ["CD e Blu-ray", "óptica"],
                        ["SSD e pen drive", "eletrônica / memória flash"]
                      ]
                    }
                  }
                ]
              }),
              readyMicrosequence({
                key: "microsequence-memorias-pratica-prova",
                title: "Questões sobre memórias e mídias",
                tags: ["Prova A", "Revisão", "Questões"],
                domainRefs: ["memories-hierarchy", "memories-locality", "memories-functions", "memories-media"],
                practiceVariantRefs: [
                  "variant-memories-hierarchy",
                  "variant-memories-locality",
                  "variant-memories-functions",
                  "variant-memories-media"
                ],
                didacticPurpose: "Treinar o reconhecimento rápido das afirmações corretas e incorretas sobre memórias.",
                coverageRole: "exam_apply",
                cards: [
                  {
                    key: "card-memorias-pratica-localidade",
                    title: "Questão sobre localidade",
                    ask:
                      "Qual enunciado expressa o princípio da proximidade corretamente?",
                    answer:
                      "O processador tende a acessar frequentemente dados e instruções próximos no tempo e no espaço.",
                    wrong: [
                      "O processador acessa memórias secundárias na mesma velocidade das primárias.",
                      "Quanto mais distante a memória, menor deve ser sua capacidade.",
                      "A memória virtual elimina a necessidade de hierarquia."
                    ],
                    after:
                      "A localidade explica por que dados recém-usados ou vizinhos de dados recém-usados merecem ficar mais perto da `CPU`."
                  },
                  {
                    key: "card-memorias-pratica-hierarquia",
                    title: "Questão sobre a ordem",
                    ask:
                      "Qual ordem vai da memória mais rápida e cara para a mais lenta e barata?",
                    answer: "Registradores → Cache → RAM → Disco rígido → Fita magnética.",
                    wrong: [
                      "Cache → Registradores → RAM → Disco rígido → Fita magnética.",
                      "Registradores → RAM → Cache → SSD → Disco rígido.",
                      "RAM → Cache → Registradores → Disco rígido → Fita magnética."
                    ],
                    after:
                      "Registradores ficam dentro da `CPU`; depois vêm `cache`, `RAM` e armazenamento secundário."
                  },
                  {
                    key: "card-memorias-pratica-funcao",
                    title: "Questão sobre função incorreta",
                    ask:
                      "Qual afirmação está incorreta?",
                    answer: "A memória cache é usada para expandir a capacidade de armazenamento permanente.",
                    wrong: [
                      "A RAM é volátil e armazena temporariamente dados em execução.",
                      "A ROM contém instruções essenciais para a inicialização.",
                      "O buffer ajuda a sincronizar velocidades diferentes."
                    ],
                    after:
                      "A `cache` acelera acessos frequentes; ela não substitui armazenamento permanente."
                  },
                  {
                    key: "card-memorias-pratica-midias",
                    title: "Complete a tecnologia do SSD",
                    say:
                      "O `SSD` usa tecnologia [[eletrônica baseada em memória flash::eletrônica baseada em memória flash|óptica|magnética]].",
                    after:
                      "`SSD` não usa partes móveis nem leitura óptica; a base é eletrônica."
                  }
                ]
              })
            ]
          },
          {
            key: "lesson-von-neumann",
            title: "Arquitetura de Von Neumann",
            description:
              "Programa armazenado, componentes da CPU, barramentos, E/S e contraste básico com a arquitetura Harvard.",
            sourceGuideStructured: {
              lessonGoal:
                "Explicar a arquitetura de Von Neumann, seus componentes básicos e a ideia de programa armazenado, relacionando isso às questões da prova.",
              notationRules:
                "Ler `CPU`, `UC`, `ULA`, `RAM`, `PC`, `IR`, `barramento` e `E/S` como partes específicas do modelo.",
              commonErrors:
                "Confundir Von Neumann com Harvard, esquecer que dados e instruções dividem a mesma memória e atribuir ao barramento função de cálculo ou armazenamento."
            },
            domainMap: {
              sourceRefs: [OACO_LESSON_URLS.vonNeumann, OACO_EXERCISES_A_URL],
              items: [
                {
                  id: "vonneumann-stored-program",
                  label: "Na arquitetura de Von Neumann, dados e instruções ficam na mesma memória e usam o mesmo barramento.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.vonNeumann, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["descrever o programa armazenado", "distinguir Von Neumann de Harvard"]
                },
                {
                  id: "vonneumann-cpu-parts",
                  label: "O processador é formado principalmente pela Unidade de Controle e pela Unidade Lógica e Aritmética.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.vonNeumann, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["nomear UC e ULA", "atribuir suas funções básicas"]
                },
                {
                  id: "vonneumann-bus",
                  label: "O barramento interliga CPU, memória e dispositivos de E/S para transportar dados, endereços e sinais de controle.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.vonNeumann, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["definir a função do barramento", "não tratá-lo como memória ou ULA"]
                },
                {
                  id: "vonneumann-io",
                  label: "Dispositivos de E/S trocam informações com CPU e memória por barramentos, sob coordenação do processador.",
                  kind: "concept",
                  priority: "core",
                  sourceRefs: [OACO_LESSON_URLS.vonNeumann, OACO_EXERCISES_A_URL],
                  expectedEvidence: ["relacionar E/S com barramentos", "não tratar E/S como totalmente autônoma"]
                }
              ],
              practiceVariants: [
                {
                  id: "variant-vonneumann-stored-program",
                  domainItemRef: "vonneumann-stored-program",
                  variantKind: "exam_format",
                  purpose: "Reconhecer a característica principal da arquitetura de Von Neumann.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-vonneumann-cpu",
                  domainItemRef: "vonneumann-cpu-parts",
                  variantKind: "fluency",
                  purpose: "Nomear as duas partes principais da CPU.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-vonneumann-bus",
                  domainItemRef: "vonneumann-bus",
                  variantKind: "exam_format",
                  purpose: "Identificar a função do barramento.",
                  difficulty: "baixa"
                },
                {
                  id: "variant-vonneumann-io",
                  domainItemRef: "vonneumann-io",
                  variantKind: "discrimination",
                  purpose: "Separar a comunicação por barramento de afirmações erradas sobre autonomia de E/S.",
                  difficulty: "baixa"
                }
              ]
            },
            microsequences: [
              readyMicrosequence({
                key: "microsequence-vonneumann-fundamentos",
                title: "Programa armazenado e componentes",
                tags: ["Prova A", "Von Neumann", "CPU"],
                domainRefs: ["vonneumann-stored-program", "vonneumann-cpu-parts", "vonneumann-bus", "vonneumann-io"],
                didacticPurpose: "Introduzir o modelo de Von Neumann e o vocabulário básico pedido na prova.",
                coverageRole: "explain",
                cards: [
                  {
                    key: "card-vonneumann-armazenamento",
                    title: "Programa e dados na mesma memória",
                    say:
                      "A marca mais importante da arquitetura de Von Neumann é o armazenamento de programa.\n\nDados e instruções ficam na mesma memória principal e são acessados pelo mesmo barramento."
                  },
                  {
                    key: "card-vonneumann-componentes",
                    title: "Quem faz o quê no modelo",
                    say: "O diagrama básico pode ser lido por função.",
                    table: {
                      columns: ["Componente", "Função central"],
                      rows: [
                        ["`UC`", "buscar e coordenar instruções"],
                        ["`ULA`", "executar operações lógicas e aritméticas"],
                        ["memória", "guardar dados e instruções"],
                        ["E/S", "trocar dados com o meio externo"],
                        ["barramento", "interligar os blocos do sistema"]
                      ]
                    }
                  },
                  {
                    key: "card-vonneumann-ciclo",
                    title: "Ciclo de execução",
                    say:
                      "No ciclo `fetch-decode-execute`, a `CPU` busca a instrução, interpreta o que fazer e então executa.\n\nRegistradores como `PC` e `IR` ajudam a controlar qual instrução vem agora e qual está em processamento."
                  },
                  {
                    key: "card-vonneumann-harvard",
                    title: "Contraste com Harvard",
                    say:
                      "Na arquitetura Harvard, dados e instruções usam memórias e barramentos separados.\n\nNa de Von Neumann, a mesma memória guarda ambos, o que simplifica o modelo mas cria o gargalo clássico do barramento único."
                  }
                ]
              }),
              readyMicrosequence({
                key: "microsequence-vonneumann-pratica-prova",
                title: "Questões sobre o modelo de Von Neumann",
                tags: ["Prova A", "Revisão", "Questões"],
                domainRefs: ["vonneumann-stored-program", "vonneumann-cpu-parts", "vonneumann-bus", "vonneumann-io"],
                practiceVariantRefs: [
                  "variant-vonneumann-stored-program",
                  "variant-vonneumann-cpu",
                  "variant-vonneumann-bus",
                  "variant-vonneumann-io"
                ],
                didacticPurpose: "Consolidar as definições do modelo em formato de prova objetiva.",
                coverageRole: "exam_apply",
                cards: [
                  {
                    key: "card-vonneumann-pratica-caracteristica",
                    title: "Questão sobre a característica principal",
                    ask:
                      "Qual característica define a arquitetura de Von Neumann?",
                    answer: "Uma única memória para armazenar tanto instruções quanto dados.",
                    wrong: [
                      "Separação física entre memória de dados e memória de instruções.",
                      "Execução paralela em pipelines distintos como regra central.",
                      "Comunicação direta entre periféricos sem processador."
                    ],
                    after:
                      "O ponto distintivo é o programa armazenado na mesma memória que também guarda os dados."
                  },
                  {
                    key: "card-vonneumann-pratica-cpu",
                    title: "Questão sobre a CPU",
                    ask:
                      "Quais são as duas partes principais do processador nesse modelo?",
                    answer: "Unidade de Controle e Unidade Lógica e Aritmética.",
                    wrong: [
                      "Unidade de Memória e Unidade de Entrada.",
                      "Unidade de Armazenamento e Unidade de Saída.",
                      "Unidade de Entrada e Unidade de Controle."
                    ],
                    after:
                      "A `UC` coordena a execução; a `ULA` faz operações lógicas e aritméticas."
                  },
                  {
                    key: "card-vonneumann-pratica-barramento",
                    title: "Questão sobre barramento",
                    ask:
                      "Qual função pertence ao barramento em um sistema de Von Neumann?",
                    answer: "Interligar CPU, memória e dispositivos de E/S.",
                    wrong: [
                      "Executar operações lógicas e aritméticas.",
                      "Armazenar temporariamente dados e instruções.",
                      "Converter sinais analógicos em digitais para o processador."
                    ],
                    after:
                      "O barramento é o canal de comunicação entre os blocos, não uma unidade de cálculo nem uma memória."
                  },
                  {
                    key: "card-vonneumann-pratica-es",
                    title: "Complete a relação com E/S",
                    say:
                      "Na arquitetura de Von Neumann, os dispositivos de `E/S` trocam informações com `CPU` e memória por meio de [[barramentos::barramentos|válvulas|registradores]].",
                    after:
                      "A coordenação continua sendo do processador; o barramento é o caminho de comunicação."
                  }
                ]
              })
            ]
          }
        ]
      }
    ]
  };
}

export function createOrganizacaoArquiteturaComputadoresProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [structuredClone(createOrganizacaoArquiteturaComputadoresCourse())]
  };
}

export function createEmbeddedSeedProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      structuredClone(createOrganizacaoArquiteturaComputadoresCourse()),
      structuredClone(createMatematicaParaInformaticaCourse())
    ]
  };
}
