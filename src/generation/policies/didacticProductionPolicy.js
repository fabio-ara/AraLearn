export const DIDACTIC_PRODUCTION_POLICY_ID = "didacticProductionPolicy.v1";

const EXHAUSTIVE_SEQUENCE_STEPS = Object.freeze([
  "apresentar o elemento",
  "explicar em linguagem comum",
  "mostrar exemplo guiado",
  "propor prática autossuficiente",
  "consolidar e reconectar à trilha"
]);

const HARD_RULES = Object.freeze([
  "bastidor zero no texto do aluno",
  "card autossuficiente",
  "explicação antes de prática",
  "siglas e termos técnicos explicados localmente",
  "palavras em inglês explicadas de forma funcional quando relevantes",
  "microssequência sem pressupostos ocultos",
  "progressão exaustiva por cards"
]);

const SOURCE_ANCHORING_RULES = Object.freeze([
  "usar o acervo e o comentário do usuário como governança prioritária",
  "não inventar domínio paralelo fora da trilha da lição",
  "não depender de fonte invisível, card anterior ou memória episódica",
  "distinguir aderência à fonte, inferência local e expansão controlada"
]);

const OPERATIONAL_EXHAUSTIVENESS_RULES = Object.freeze([
  "reconhecimento",
  "leitura",
  "produção guiada",
  "combinação",
  "sequência de uso",
  "erro frequente",
  "revisão cumulativa"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value, limit = 8) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter((item) => {
      if (!item) {
        return false;
      }
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function normalizeComparableText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferTechnicalEnglishNeed({ lessonGuidance = {}, lessonSourceGuideStructured = {}, lessonDomainMap = {} } = {}) {
  const signals = [
    ...(lessonGuidance?.contentTypeTags || []),
    ...(lessonGuidance?.learningActionTags || []),
    ...(lessonGuidance?.resourceTags || []),
    lessonGuidance?.presetId,
    lessonGuidance?.supportLevel,
    lessonSourceGuideStructured?.notationRules,
    lessonSourceGuideStructured?.lessonGoal,
    ...(Array.isArray(lessonDomainMap?.items) ? lessonDomainMap.items.flatMap((item) => [item?.label, ...(item?.representations || [])]) : [])
  ]
    .map((item) => normalizeComparableText(item))
    .filter(Boolean)
    .join(" ");

  return /code|command|tool|bash|git|program|notation|cpu|register|instruction|memory|shell|sql|java|c /.test(signals);
}

function inferOperationalDiscipline({ lessonGuidance = {}, lessonSourceGuideStructured = {}, lessonDomainMap = {} } = {}) {
  const signals = [
    ...(lessonGuidance?.contentTypeTags || []),
    ...(lessonGuidance?.learningActionTags || []),
    ...(lessonGuidance?.resourceTags || []),
    lessonGuidance?.presetId,
    lessonSourceGuideStructured?.lessonGoal,
    ...(Array.isArray(lessonDomainMap?.items) ? lessonDomainMap.items.map((item) => item?.kind) : [])
  ]
    .map((item) => normalizeComparableText(item))
    .filter(Boolean)
    .join(" ");

  return /procedure|tool_use|practice|solve|command|code|program|shell|git|sql|terminal/.test(signals);
}

function countCoreDomainItems(lessonDomainMap = {}) {
  return (Array.isArray(lessonDomainMap?.items) ? lessonDomainMap.items : []).filter(
    (item) => text(item?.priority) === "core"
  ).length;
}

export function buildDidacticProductionPolicy({
  weakModelMode = true,
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  lessonDomainMap = {},
  studyTrackPolicy = null
} = {}) {
  const operationalDiscipline = inferOperationalDiscipline({
    lessonGuidance,
    lessonSourceGuideStructured,
    lessonDomainMap
  });
  const technicalEnglishRequired = inferTechnicalEnglishNeed({
    lessonGuidance,
    lessonSourceGuideStructured,
    lessonDomainMap
  });
  const coreDomainItemCount = countCoreDomainItems(lessonDomainMap);
  const minimumReappearancesPerCoreItem = operationalDiscipline ? 4 : 3;
  const suggestedPracticeLoad =
    coreDomainItemCount > 0
      ? {
          minimum: coreDomainItemCount * minimumReappearancesPerCoreItem,
          recommended: coreDomainItemCount * (minimumReappearancesPerCoreItem + 2)
        }
      : null;

  return {
    policyId: DIDACTIC_PRODUCTION_POLICY_ID,
    targetStudentProfile: "estudante-trabalhador com pouco tempo, pouca margem para erro e possível fragilidade de base",
    productionArchitecture: "planner_builder_auditor_internalizado",
    microsequencePrinciple: "a microssequência não pressupõe o que ainda não foi explicitado; pressupostos só podem vir de microssequências anteriores da mesma trilha",
    exhaustiveCardSequence: {
      label: "sequência exaustiva de cards",
      steps: [...EXHAUSTIVE_SEQUENCE_STEPS],
      minimumReappearancesPerCoreItem,
      suggestedPracticeLoad
    },
    hardRules: [...HARD_RULES],
    sourceAnchoringRules: [...SOURCE_ANCHORING_RULES],
    operationalExhaustiveness: operationalDiscipline ? [...OPERATIONAL_EXHAUSTIVENESS_RULES] : [],
    explainAcronymsLocally: true,
    explainTechnicalEnglishLocally: technicalEnglishRequired,
    rejectGenericSummary: true,
    requireBridgeBackToTrack: studyTrackPolicy?.mode === "clarify_local_doubt",
    weakModelCompatible: weakModelMode === true
  };
}

export function summarizeDidacticProductionPolicyForPrompt(input = {}) {
  const policy = buildDidacticProductionPolicy(input);
  return {
    policyId: policy.policyId,
    targetStudentProfile: policy.targetStudentProfile,
    productionArchitecture: policy.productionArchitecture,
    microsequencePrinciple: policy.microsequencePrinciple,
    exhaustiveCardSequence: {
      minimumReappearancesPerCoreItem: policy.exhaustiveCardSequence.minimumReappearancesPerCoreItem,
      steps: policy.exhaustiveCardSequence.steps
    },
    explainAcronymsLocally: policy.explainAcronymsLocally,
    explainTechnicalEnglishLocally: policy.explainTechnicalEnglishLocally,
    rejectGenericSummary: policy.rejectGenericSummary,
    requireBridgeBackToTrack: policy.requireBridgeBackToTrack,
    operationalExhaustiveness: policy.operationalExhaustiveness
  };
}

export function buildDidacticProductionPromptLines(input = {}) {
  const policy = buildDidacticProductionPolicy(input);
  const lines = [
    `Perfil-alvo: ${policy.targetStudentProfile}.`,
    `Arquitetura pedagógica: ${policy.productionArchitecture}.`,
    `Princípio da microssequência: ${policy.microsequencePrinciple}.`,
    `Progressão obrigatória: ${policy.exhaustiveCardSequence.steps.join(" -> ")}.`,
    `Reaparições mínimas por item central: ${policy.exhaustiveCardSequence.minimumReappearancesPerCoreItem}.`,
    "Não produza resumo genérico nem card prolixo para simular profundidade."
  ];

  if (policy.explainAcronymsLocally) {
    lines.push("Explique siglas localmente antes de cobrar uso.");
  }
  if (policy.explainTechnicalEnglishLocally) {
    lines.push("Explique termos técnicos e palavras em inglês de forma funcional e em português claro.");
  }
  if (policy.operationalExhaustiveness.length) {
    lines.push(`Se o conteúdo for operacional, cubra: ${policy.operationalExhaustiveness.join(", ")}.`);
  }
  if (policy.requireBridgeBackToTrack) {
    lines.push("Depois de esclarecer a dúvida local, reconecte explicitamente à trilha didática em curso.");
  }

  return lines;
}

