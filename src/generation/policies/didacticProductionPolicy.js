import { getDidacticPolicyConfig } from "../config/didacticPolicyRegistry.js";
import { buildCourseModelPromptLines } from "../runtime/courseModelSemantics.js";

export const DIDACTIC_PRODUCTION_POLICY_ID = "didacticProductionPolicy.v1";

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
  studyTrackPolicy = null,
  engineProfile = {}
} = {}) {
  const didacticConfig = getDidacticPolicyConfig(engineProfile);
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
  const minimumReappearancesPerCoreItem = operationalDiscipline
    ? Number(didacticConfig?.defaultMinimumReappearances?.operational || 4)
    : Number(didacticConfig?.defaultMinimumReappearances?.conceptual || 3);
  const suggestedPracticeLoad =
    coreDomainItemCount > 0
      ? {
          minimum: coreDomainItemCount * minimumReappearancesPerCoreItem,
          recommended: coreDomainItemCount * (minimumReappearancesPerCoreItem + 2)
        }
      : null;

  return {
    policyId: DIDACTIC_PRODUCTION_POLICY_ID,
    targetStudentProfile: text(didacticConfig?.targetStudentProfile),
    productionArchitecture: text(didacticConfig?.productionArchitecture),
    microsequencePrinciple: text(didacticConfig?.microsequencePrinciple),
    exhaustiveCardSequence: {
      label: "sequência exaustiva de cards",
      steps: [...(didacticConfig?.exhaustiveSequenceSteps || [])],
      minimumReappearancesPerCoreItem,
      suggestedPracticeLoad
    },
    hardRules: [...(didacticConfig?.hardRules || [])],
    sourceAnchoringRules: [...(didacticConfig?.sourceAnchoringRules || [])],
    operationalExhaustiveness: operationalDiscipline ? [...(didacticConfig?.operationalExhaustivenessRules || [])] : [],
    courseModelLines: buildCourseModelPromptLines(didacticConfig?.courseSemantics || {}),
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
    courseModelLines: policy.courseModelLines,
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
  if (policy.courseModelLines.length) {
    lines.push(...policy.courseModelLines);
  }

  return lines;
}
