import {
  buildDidacticProductionPolicy,
  summarizeDidacticProductionPolicyForPrompt
} from "./didacticProductionPolicy.js";

export const METICULOUS_POLICY_ID = "meticulousDidacticPolicy.v1";

const SHALLOW_CRITERIA = Object.freeze([
  "definição sem exemplo mínimo",
  "prática sem contexto local suficiente",
  "notação sem preparação",
  "feedback ausente em prática",
  "salto direto de teoria para exercício",
  "texto genérico que serviria para qualquer disciplina"
]);

const REAL_COVERAGE_CRITERIA = Object.freeze([
  "novo subpasso",
  "nova representação",
  "novo contraste",
  "erro comum trabalhado",
  "formato avaliativo",
  "integração com conteúdo anterior"
]);

const BAD_REPETITION_CRITERIA = Object.freeze([
  "mesma habilidade",
  "mesmo formato",
  "mesma representação",
  "mesma dificuldade",
  "mesma pergunta",
  "sem finalidade nova"
]);

export function buildMeticulousDidacticPolicy({ weakModelMode = true } = {}) {
  const production = buildDidacticProductionPolicy({ weakModelMode });
  return {
    policyId: METICULOUS_POLICY_ID,
    weakModelCompatible: weakModelMode === true,
    rejectGenericSummary: true,
    requireNewDidacticFunction: true,
    shallowCriteria: [...SHALLOW_CRITERIA],
    realCoverageCriteria: [...REAL_COVERAGE_CRITERIA],
    badRepetitionCriteria: [...BAD_REPETITION_CRITERIA],
    minimumDidacticFunctionsPerMicrosequence: 2,
    minimumPracticeVariantsForCoreItem: 2,
    askForNewMicrosequenceWhen: [
      "domain item central está uncovered",
      "item está weak",
      "explicação existe sem prática",
      "falta erro comum relevante",
      "falta formato de prova relevante"
    ],
    askForPracticeVariationWhen: [
      "item central tem prática única",
      "há caso-limite relevante",
      "há erro comum ainda não diagnosticado",
      "há formato avaliativo ainda ausente"
    ],
    rejectContentWhen: [
      "parece resumo genérico",
      "repete microssequência sem função nova",
      "empilha mais de um foco principal no mesmo card"
    ],
    markDomainItemWeakWhen: [
      "só foi explicado",
      "tem prática sem feedback",
      "tem prática sem variação suficiente",
      "usa notação sem mediação local"
    ],
    markMicrosequenceRedundantWhen: [
      "mesmo domainRef",
      "mesmo coverageRole",
      "mesmo practiceVariantRef",
      "mesma finalidade textual"
    ],
    productionVocabulary: {
      sequenceLabel: production.exhaustiveCardSequence.label,
      targetStudentProfile: production.targetStudentProfile,
      microsequencePrinciple: production.microsequencePrinciple
    }
  };
}

export function summarizeMeticulousPolicyForPrompt({ weakModelMode = true } = {}) {
  const policy = buildMeticulousDidacticPolicy({ weakModelMode });
  const production = summarizeDidacticProductionPolicyForPrompt({ weakModelMode });
  return {
    policyId: policy.policyId,
    rejectGenericSummary: policy.rejectGenericSummary,
    requireNewDidacticFunction: policy.requireNewDidacticFunction,
    minimumDidacticFunctionsPerMicrosequence: policy.minimumDidacticFunctionsPerMicrosequence,
    minimumPracticeVariantsForCoreItem: policy.minimumPracticeVariantsForCoreItem,
    askForNewMicrosequenceWhen: policy.askForNewMicrosequenceWhen,
    askForPracticeVariationWhen: policy.askForPracticeVariationWhen,
    productionVocabulary: production
  };
}
