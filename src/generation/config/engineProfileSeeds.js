import { freezeRecord, mergeRecords } from "./engineConfigUtils.js";

function createAdsProfile(profileId, label, overrides = {}) {
  const base = {
    family: "ads",
    label,
    productPurpose:
      "transformar acervo acadêmico bruto em trilha estudável, progressiva, autossuficiente e de baixo atrito para o estudante",
    intendedDomains: [
      "programação",
      "matemática para computação",
      "ferramentas e terminal",
      "engenharia de software",
      "teoria computacional aplicada"
    ],
    userExperience: {
      mode: "simple_by_default",
      principle:
        "o usuário comum não escolhe pedagogia nem pipeline; ele fornece material, objetivo e contexto, e o app decide a rota interna",
      advancedCustomization:
        "profiles, prompt packs, contract packs e provider routing ficam disponíveis para pesquisa e uso avançado sem poluir a superfície comum"
    },
    didacticPolicy: {
      targetStudentProfile: "estudante-trabalhador de ADS com pouco tempo, pouca margem para erro e possível fragilidade de base",
      productionArchitecture: "planner_builder_auditor_internalizado",
      microsequencePrinciple:
        "a microssequência não pressupõe o que ainda não foi explicitado; pressupostos só podem vir de microssequências anteriores da mesma trilha",
      exhaustiveSequenceSteps: [
        "apresentar o elemento",
        "explicar em linguagem comum",
        "mostrar exemplo guiado",
        "propor prática autossuficiente",
        "consolidar e reconectar à trilha"
      ],
      hardRules: [
        "bastidor zero no texto do aluno",
        "card autossuficiente",
        "explicação antes de prática",
        "siglas e termos técnicos explicados localmente",
        "palavras em inglês explicadas de forma funcional quando relevantes",
        "microssequência sem pressupostos ocultos",
        "progressão exaustiva por cards"
      ],
      sourceAnchoringRules: [
        "usar o acervo e o comentário do usuário como governança prioritária",
        "não inventar domínio paralelo fora da trilha da lição",
        "não depender de fonte invisível, card anterior ou memória episódica",
        "distinguir aderência à fonte, inferência local e expansão controlada"
      ],
      operationalExhaustivenessRules: [
        "reconhecimento",
        "leitura",
        "produção guiada",
        "combinação",
        "sequência de uso",
        "erro frequente",
        "revisão cumulativa"
      ],
      defaultMinimumReappearances: {
        conceptual: 3,
        operational: 4
      },
      courseSemantics: {
        materialNature: "problem_solving",
        progressionMode: "example_to_rule",
        centralRepresentations: ["plain_text", "diagram", "table"],
        cognitiveOperations: ["define", "decompose", "apply"],
        expectedDifficulties: ["vocabulary", "abstraction", "transfer"],
        practiceModes: ["guided_first", "short_frequent", "partial_reconstruction"]
      },
      topDownCourseStrategy: {
        defaultBudgetByLesson: {
          minMicrosequences: 3,
          targetMicrosequences: 5,
          maxMicrosequences: 8
        },
        requireCoreCoverageBeforeExtensions: true,
        requireVocabularyMap: true
      },
      bottomUpStrategy: {
        preferLocalRepairBeforeNewMicrosequence: true,
        requireBridgeBackToTrack: true,
        allowEscalationToNewMicrosequenceOnlyForCoverageGap: true
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "o aluno vê curso, não mecanismo de autoria",
          "sourceGuideStructured governa meta, notação e confusões prováveis da lição",
          "domainMap, domainRefs e practiceVariantRefs são contrato de cobertura",
          "todo card deve ser autossuficiente",
          "explicar siglas, termos técnicos, palavras em inglês e notação antes de cobrar uso",
          "a microssequência não pode depender de pressuposto oculto",
          "se surgir dúvida local ou reforço bottom-up, responder a dúvida e reconectar à trilha didática"
        ]
      },
      lessonPlanning: {
        guardrails: [
          "não produzir resumo genérico",
          "não gerar cards nessa fase",
          "não gerar duplicata quando o conteúdo já estiver coberto",
          "respeitar progressão didática entre introdução, explicação, demonstração e prática"
        ]
      }
    },
    contractPacks: {
      lessonPlanning: {
        maxGeneratedMicrosequences: 7,
        minGeneratedMicrosequences: 2
      },
      courseForge: {
        enforceDomainCoverage: true,
        enforceSourceAnchoring: true,
        enforceDeterministicRepair: true
      }
    },
    providerRouting: {
      defaultStrategy: "provider_separated_from_didactics",
      weakModelStrategy: "schemas pequenos, contexto mínimo e fases curtas",
      strongModelStrategy: "mesma arquitetura didática com maior orçamento de contexto"
    }
  };

  return freezeRecord({
    profileId,
    ...mergeRecords(base, overrides || {})
  });
}

export const DEFAULT_ENGINE_PROFILE_ID = "aralearn.engine.ads.general.v3";

export const ENGINE_PROFILE_SEEDS = Object.freeze({
  [DEFAULT_ENGINE_PROFILE_ID]: createAdsProfile(DEFAULT_ENGINE_PROFILE_ID, "ADS geral", {
    intendedDomains: [
      "álgebra linear",
      "engenharia de software",
      "teoria dos grafos",
      "lógica de programação",
      "shell linux",
      "linguagem c",
      "administração de empresas"
    ]
  }),
  "aralearn.engine.ads.math.v1": createAdsProfile("aralearn.engine.ads.math.v1", "ADS matemática formal", {
    didacticPolicy: {
      targetStudentProfile: "estudante de ADS em disciplina matemática formal com dificuldade de abstração e notação",
      defaultMinimumReappearances: {
        conceptual: 4,
        operational: 4
      },
      courseSemantics: {
        materialNature: "formal_language",
        progressionMode: "concrete_to_abstract",
        centralRepresentations: ["plain_text", "formula", "matrix", "graph"],
        cognitiveOperations: ["define", "compare", "trace", "apply"],
        expectedDifficulties: ["notation", "abstraction", "fine_comparison"],
        practiceModes: ["guided_first", "comparison", "partial_reconstruction"]
      },
      topDownCourseStrategy: {
        defaultBudgetByLesson: {
          minMicrosequences: 4,
          targetMicrosequences: 6,
          maxMicrosequences: 9
        }
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "concretizar antes de generalizar",
          "explicar a notação antes de cobrar leitura formal",
          "privilegiar contraste, exemplo guiado e visualização quando houver recurso semântico adequado"
        ]
      }
    }
  }),
  "aralearn.engine.ads.programming.v1": createAdsProfile("aralearn.engine.ads.programming.v1", "ADS programação procedural", {
    didacticPolicy: {
      targetStudentProfile: "estudante de ADS aprendendo programação passo a passo, com necessidade de explicação palavra por palavra",
      defaultMinimumReappearances: {
        conceptual: 3,
        operational: 5
      },
      courseSemantics: {
        materialNature: "procedure",
        progressionMode: "visual_to_formal",
        centralRepresentations: ["plain_text", "flowchart", "pseudocode", "code"],
        cognitiveOperations: ["translate", "trace", "diagnose", "build"],
        expectedDifficulties: ["vocabulary", "syntax", "transfer", "many_steps"],
        practiceModes: ["guided_first", "translation", "error_correction", "partial_reconstruction"]
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "explicar palavra-chave, sigla e termo inglês localmente",
          "mostrar estado operacional antes de abstração",
          "distribuir prática incremental antes de pedir combinação mais longa"
        ]
      }
    }
  }),
  "aralearn.engine.ads.systems.v1": createAdsProfile("aralearn.engine.ads.systems.v1", "ADS terminal e ferramentas", {
    didacticPolicy: {
      targetStudentProfile: "estudante de ADS em disciplina operacional de terminal, shell, ferramentas ou workflow",
      defaultMinimumReappearances: {
        conceptual: 3,
        operational: 5
      },
      courseSemantics: {
        materialNature: "applied_tool",
        progressionMode: "structure_to_detail",
        centralRepresentations: ["plain_text", "code", "tree"],
        cognitiveOperations: ["apply", "trace", "diagnose", "build"],
        expectedDifficulties: ["vocabulary", "syntax", "transfer", "many_steps"],
        practiceModes: ["guided_first", "error_correction", "case_study"]
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "cobrir reconhecimento, leitura, produção guiada, combinação, sequência de uso, erro frequente e revisão cumulativa",
          "não pular de conceito para comando composto sem mediação"
        ]
      }
    }
  }),
  "aralearn.engine.ads.theory.v1": createAdsProfile("aralearn.engine.ads.theory.v1", "ADS teoria e modelagem", {
    didacticPolicy: {
      targetStudentProfile: "estudante de ADS em disciplina conceitual, analítica ou de modelagem",
      defaultMinimumReappearances: {
        conceptual: 4,
        operational: 3
      },
      courseSemantics: {
        materialNature: "conceptual_argument",
        progressionMode: "structure_to_detail",
        centralRepresentations: ["plain_text", "table", "diagram", "tree"],
        cognitiveOperations: ["define", "compare", "classify", "interpret"],
        expectedDifficulties: ["vocabulary", "abstraction", "fine_comparison"],
        practiceModes: ["comparison", "commented_reading", "case_study"]
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "diferenciar conceitos próximos antes de cobrar síntese",
          "usar cenários curtos e contraste entre termos para reduzir abstração oca"
        ]
      }
    }
  }),
  "aralearn.engine.languages.v1": freezeRecord({
    profileId: "aralearn.engine.languages.v1",
    family: "generalized",
    label: "Idiomas",
    productPurpose: "transformar material de idioma em trilha de leitura, compreensão, uso e revisão cumulativa",
    intendedDomains: ["idiomas", "vocabulário", "escuta", "gramática aplicada"],
    userExperience: {
      mode: "simple_by_default",
      principle: "o usuário comum escolhe apenas o idioma e o objetivo principal",
      advancedCustomization: "o usuário avançado pode recalibrar ciclos de retomada, variação e níveis de produção"
    },
    didacticPolicy: {
      targetStudentProfile: "aprendiz de idioma com necessidade de exposição, retomada e uso contextual",
      productionArchitecture: "planner_builder_auditor_internalizado",
      microsequencePrinciple: "cada microssequência prepara leitura, uso ou contraste sem pressupor domínio anterior não explicitado",
      exhaustiveSequenceSteps: [
        "apresentar uso ou forma",
        "explicar sentido funcional",
        "mostrar exemplo contextual",
        "propor prática curta",
        "retomar e variar"
      ],
      hardRules: [
        "bastidor zero no texto do aluno",
        "card autossuficiente",
        "exposição antes de produção",
        "explicação funcional antes de regra abstrata",
        "progressão exaustiva por cards"
      ],
      sourceAnchoringRules: [
        "usar o acervo e o objetivo do usuário como governança",
        "não inventar domínio paralelo fora da trilha"
      ],
      operationalExhaustivenessRules: ["reconhecimento", "uso guiado", "retomada", "variação contextual"],
      defaultMinimumReappearances: {
        conceptual: 4,
        operational: 4
      },
      courseSemantics: {
        materialNature: "formal_language",
        progressionMode: "example_to_rule",
        centralRepresentations: ["plain_text"],
        cognitiveOperations: ["recognize", "define", "apply", "build"],
        expectedDifficulties: ["vocabulary", "syntax", "transfer"],
        practiceModes: ["guided_first", "short_frequent", "partial_reconstruction"]
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "privilegiar uso contextual antes de taxonomia gramatical",
          "retomar vocabulário e estruturas em novas frases curtas"
        ]
      }
    },
    contractPacks: {
      lessonPlanning: {
        maxGeneratedMicrosequences: 8,
        minGeneratedMicrosequences: 3
      },
      courseForge: {
        enforceDomainCoverage: true,
        enforceSourceAnchoring: true,
        enforceDeterministicRepair: true
      }
    },
    providerRouting: {
      defaultStrategy: "provider_separated_from_didactics",
      weakModelStrategy: "fases curtas com exemplos mínimos",
      strongModelStrategy: "mais variação contextual com mesma auditoria"
    }
  }),
  "aralearn.engine.research-reading.v1": freezeRecord({
    profileId: "aralearn.engine.research-reading.v1",
    family: "generalized",
    label: "Leitura acadêmica e fundamentos",
    productPurpose: "transformar material teórico denso em trilha de compreensão, avaliação crítica e reconstrução de argumentos",
    intendedDomains: ["artigos", "teses", "fundamentos para leigos", "avaliação crítica"],
    userExperience: {
      mode: "simple_by_default",
      principle: "o usuário comum informa o objetivo de leitura e o nível de base",
      advancedCustomization: "o usuário avançado pode calibrar densidade analítica, foco em argumento, método ou conceito"
    },
    didacticPolicy: {
      targetStudentProfile: "leitor não especialista que precisa entender argumento, conceito e estrutura de texto denso",
      productionArchitecture: "planner_builder_auditor_internalizado",
      microsequencePrinciple: "cada microssequência prepara a leitura do argumento sem pressupor familiaridade com jargão oculto",
      exhaustiveSequenceSteps: [
        "situar o problema",
        "explicar o conceito",
        "reconstruir o argumento",
        "propor checagem interpretativa",
        "retomar com contraste"
      ],
      hardRules: [
        "bastidor zero no texto do aluno",
        "card autossuficiente",
        "conceito antes de avaliação crítica",
        "jargão explicado localmente",
        "progressão exaustiva por cards"
      ],
      sourceAnchoringRules: [
        "aderência forte ao texto-fonte",
        "não inventar tese paralela",
        "distinguir resumo, inferência local e crítica guiada"
      ],
      operationalExhaustivenessRules: [],
      defaultMinimumReappearances: {
        conceptual: 4,
        operational: 3
      },
      courseSemantics: {
        materialNature: "technical_reading",
        progressionMode: "reading_to_application",
        centralRepresentations: ["plain_text", "scientific_article", "table", "tree"],
        cognitiveOperations: ["define", "compare", "interpret"],
        expectedDifficulties: ["vocabulary", "figure_reading", "fine_comparison"],
        practiceModes: ["commented_reading", "comparison", "case_study"]
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "não pressupor vocabulário acadêmico não explicado",
          "reconstruir argumentos antes de julgar"
        ]
      }
    },
    contractPacks: {
      lessonPlanning: {
        maxGeneratedMicrosequences: 8,
        minGeneratedMicrosequences: 3
      },
      courseForge: {
        enforceDomainCoverage: true,
        enforceSourceAnchoring: true,
        enforceDeterministicRepair: true
      }
    },
    providerRouting: {
      defaultStrategy: "provider_separated_from_didactics",
      weakModelStrategy: "frases curtas e foco em núcleo argumentativo",
      strongModelStrategy: "mais reconstrução argumentativa com mesma auditoria"
    }
  }),
  "aralearn.engine.project-programming.v1": createAdsProfile("aralearn.engine.project-programming.v1", "Programação por projeto", {
    family: "generalized",
    intendedDomains: ["programação por projeto", "arquitetura de software", "linguagens e ferramentas"],
    didacticPolicy: {
      targetStudentProfile: "aprendiz de programação por projeto que precisa de progressão conforme o raciocínio do programador ideal",
      defaultMinimumReappearances: {
        conceptual: 3,
        operational: 5
      },
      topDownCourseStrategy: {
        defaultBudgetByLesson: {
          minMicrosequences: 4,
          targetMicrosequences: 6,
          maxMicrosequences: 10
        },
        requireCoreCoverageBeforeExtensions: true,
        requireVocabularyMap: true
      },
      courseSemantics: {
        materialNature: "procedure",
        progressionMode: "structure_to_detail",
        centralRepresentations: ["plain_text", "diagram", "pseudocode", "code"],
        cognitiveOperations: ["decompose", "apply", "diagnose", "build"],
        expectedDifficulties: ["syntax", "abstraction", "transfer", "many_steps"],
        practiceModes: ["guided_first", "error_correction", "case_study", "partial_reconstruction"]
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: [
          "explicar cada elemento de linguagem conforme entra em uso",
          "alinhar progressão ao raciocínio de projeto, não a lista solta de sintaxe",
          "intercalar construção guiada, leitura de código e prática incremental"
        ]
      }
    }
  })
});

export const DEFAULT_ENGINE_PROFILE = ENGINE_PROFILE_SEEDS[DEFAULT_ENGINE_PROFILE_ID];
