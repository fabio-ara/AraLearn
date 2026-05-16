function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function mergeRecords(base = {}, overrides = {}) {
  const result = { ...structuredClone(base || {}) };
  Object.entries(overrides || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = structuredClone(value);
      return;
    }
    if (value && typeof value === "object") {
      result[key] = mergeRecords(result[key] || {}, value);
      return;
    }
    result[key] = value;
  });
  return result;
}

export const DEFAULT_ENGINE_PROFILE_ID = "aralearn.engine.default.v2";

export const DEFAULT_ENGINE_PROFILE = Object.freeze({
  profileId: DEFAULT_ENGINE_PROFILE_ID,
  productPurpose:
    "transformar acervo acadêmico bruto em trilha estudável, progressiva, autossuficiente e de baixo atrito para o estudante",
  userExperience: {
    mode: "simple_by_default",
    principle:
      "o usuário comum não escolhe pedagogia nem pipeline; ele fornece material, objetivo e contexto, e o app decide a rota interna",
    advancedCustomization:
      "profiles, prompt packs, contract packs e provider routing ficam disponíveis para pesquisa e uso avançado sem poluir a superfície comum"
  },
  didacticPolicy: {
    targetStudentProfile: "estudante-trabalhador com pouco tempo, pouca margem para erro e possível fragilidade de base",
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
});

export function resolveEngineProfile(overrides = {}) {
  return mergeRecords(DEFAULT_ENGINE_PROFILE, overrides || {});
}

export function getDidacticPolicyConfig(overrides = {}) {
  return structuredClone(resolveEngineProfile(overrides).didacticPolicy || {});
}

export function getPromptPack(packId = "", overrides = {}) {
  const profile = resolveEngineProfile(overrides);
  return structuredClone(profile.promptPacks?.[text(packId)] || {});
}

export function getContractPack(packId = "", overrides = {}) {
  const profile = resolveEngineProfile(overrides);
  return structuredClone(profile.contractPacks?.[text(packId)] || {});
}

export function listPromptPackGuardrails(packId = "", overrides = {}) {
  return normalizeArray(getPromptPack(packId, overrides).guardrails).map((entry) => text(entry)).filter(Boolean);
}
