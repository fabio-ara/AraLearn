import { resolveCourseForgeLaunchConfig } from "./courseForgeLaunchConfig.js";
import { createCourseForgeProfileTuning } from "./courseForgeProfileTuning.js";
import { createDefaultCourseModel, listCourseModelOptions } from "./courseModelSemantics.js";
import { callModelWithRetry } from "../providers/callModelWithRetry.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "nao", "não", "no"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function clampMicrosequenceRange(input = {}) {
  const minMicrosequences = Math.max(1, toPositiveInteger(input.minMicrosequences, 3));
  const maxMicrosequences = Math.max(minMicrosequences, toPositiveInteger(input.maxMicrosequences, 8));
  const targetMicrosequences = Math.min(
    maxMicrosequences,
    Math.max(minMicrosequences, toPositiveInteger(input.targetMicrosequences, 5))
  );
  return {
    minMicrosequences,
    targetMicrosequences,
    maxMicrosequences
  };
}

function buildPlanningOptionsText() {
  const allTrails = listCourseModelOptions("").learningTrail;
  return allTrails
    .map((trail) => {
      const progressionOptions = listCourseModelOptions(trail.value).microsequenceProgression;
      const progressionLines = progressionOptions.map((option) => `  - ${option.value}: ${option.label}`).join("\n");
      return `- ${trail.value}: ${trail.label}\n${progressionLines}`;
    })
    .join("\n");
}

function truncateText(value = "", maxLength = 4000) {
  const normalized = text(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}\n...[truncado]`;
}

function summarizeAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => {
      const body = truncateText(attachment?.textContent || "", 2200);
      if (!body) {
        return "";
      }
      return `## ${text(attachment?.name) || "Anexo"}\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildPlanningInferencePrompt({
  requestText = "",
  attachmentSummary = "",
  currentProfileTuning = {},
  didacticProfileId = ""
} = {}) {
  const currentCourseModel = createDefaultCourseModel(currentProfileTuning?.courseModel || {});
  const currentRange = clampMicrosequenceRange(currentProfileTuning || {});
  const optionsText = buildPlanningOptionsText();
  return [
    "ROLE:",
    "Você completa o planejamento didático top-down do AraLearn até microssequências, sem gerar cards.",
    "",
    "TASK:",
    "Leia o pedido do usuário e complete todos os parâmetros modificáveis do planejamento.",
    "Ajuste somente parâmetros, não princípios invariantes do sistema.",
    "Quando requireVocabularyMap for true, interprete isso como diretriz de trilha para introduzir, nomear, expandir abreviações, traduzir funcionalmente e só depois cobrar o uso de vocabulário técnico da linguagem.",
    "Use requireVocabularyMap = true quando o curso depender de termos, tags, comandos, operadores, siglas, notação ou palavras-chave que não devam ser aprendidos só por decoração visual.",
    "Use o texto do pedido e os anexos como fonte principal. Use o planejamento atual apenas como fallback quando o pedido não deixar algo claro.",
    "",
    "PLANEJAMENTO ATUAL:",
    JSON.stringify(
      {
        didacticProfileId: text(didacticProfileId),
        targetStudentProfile: text(currentProfileTuning?.targetStudentProfile),
        courseModelDescription: text(currentCourseModel.description),
        learningTrail: text(currentCourseModel.learningTrail),
        microsequenceProgression: text(currentCourseModel.microsequenceProgression),
        minMicrosequences: currentRange.minMicrosequences,
        targetMicrosequences: currentRange.targetMicrosequences,
        maxMicrosequences: currentRange.maxMicrosequences,
        requireCoreCoverageBeforeExtensions: currentProfileTuning?.requireCoreCoverageBeforeExtensions !== false,
        requireVocabularyMap: currentProfileTuning?.requireVocabularyMap !== false
      },
      null,
      2
    ),
    "",
    "PEDIDO DO USUÁRIO:",
    text(requestText) || "(sem texto direto; use anexos e contexto atual)",
    "",
    "ANEXOS APROVEITÁVEIS:",
    attachmentSummary || "(sem anexos com texto)",
    "",
    "TRILHAS E PROGRESSÕES PERMITIDAS:",
    optionsText,
    "",
    "REGRAS DE SAÍDA:",
    "- Responda somente JSON válido.",
    "- Preencha todos os campos do schema.",
    "- learningTrail deve ser um dos valores permitidos.",
    "- microsequenceProgression deve ser compatível com a learningTrail escolhida.",
    "- minMicrosequences <= targetMicrosequences <= maxMicrosequences.",
    "- requireVocabularyMap=true significa que a trilha deve reservar espaço para explicação explícita de vocabulário técnico antes do uso autônomo; não é mero glossário.",
    "",
    "JSON SCHEMA ESPERADO:",
    JSON.stringify(
      {
        targetStudentProfile: "string",
        courseModelDescription: "string",
        learningTrail: "procedure | technical_reading | formalization | problem_solving | complex_project | language_communication | argumentation_classification",
        microsequenceProgression: "string",
        minMicrosequences: 3,
        targetMicrosequences: 5,
        maxMicrosequences: 8,
        requireCoreCoverageBeforeExtensions: true,
        requireVocabularyMap: true
      },
      null,
      2
    )
  ].join("\n");
}

export function normalizeInferredPlanningProfileTuning({
  inferred = {},
  didacticProfileId = "",
  currentProfileTuning = {}
} = {}) {
  const base = createCourseForgeProfileTuning(didacticProfileId, currentProfileTuning);
  const courseModel = createDefaultCourseModel({
    description: text(inferred?.courseModelDescription) || base.courseModel?.description || "",
    learningTrail: text(inferred?.learningTrail) || base.courseModel?.learningTrail || "",
    microsequenceProgression: text(inferred?.microsequenceProgression) || base.courseModel?.microsequenceProgression || ""
  });
  const range = clampMicrosequenceRange({
    minMicrosequences: inferred?.minMicrosequences,
    targetMicrosequences: inferred?.targetMicrosequences,
    maxMicrosequences: inferred?.maxMicrosequences
  });

  return {
    targetStudentProfile: text(inferred?.targetStudentProfile) || base.targetStudentProfile,
    ...range,
    requireCoreCoverageBeforeExtensions: normalizeBoolean(
      inferred?.requireCoreCoverageBeforeExtensions,
      base.requireCoreCoverageBeforeExtensions !== false
    ),
    requireVocabularyMap: normalizeBoolean(
      inferred?.requireVocabularyMap,
      base.requireVocabularyMap !== false
    ),
    courseModelEdited: true,
    courseModel
  };
}

export async function inferCourseForgePlanningProfileTuning({
  assistConfig = {},
  requestText = "",
  attachments = [],
  ingestAttachments,
  provider = null
} = {}) {
  if (typeof ingestAttachments !== "function") {
    throw new Error("Ingestão de anexos indisponível para inferir o planejamento didático.");
  }

  const launchConfig = resolveCourseForgeLaunchConfig({
    selectedModel: assistConfig.model,
    apiKey: assistConfig.apiKey,
    didacticProfileId: assistConfig.didacticProfileId,
    profileTuning: assistConfig.profileTuning,
    codexEndpoint: assistConfig.codexEndpoint,
    codexToken: assistConfig.codexToken
  });
  const ingestedAttachments = await ingestAttachments(Array.isArray(attachments) ? attachments : []);
  const activeProvider = provider || launchConfig.provider;
  const prompt = buildPlanningInferencePrompt({
    requestText,
    attachmentSummary: summarizeAttachments(ingestedAttachments.attachments),
    currentProfileTuning: assistConfig.profileTuning || {},
    didacticProfileId: launchConfig.didacticProfileId
  });

  const response = await callModelWithRetry({
    phase: "infer_planning_profile_tuning",
    modelId: launchConfig.selectedModel,
    request: {
      prompt,
      schema: null,
      artifacts: []
    },
    callModel: async ({ modelId }) =>
      activeProvider.callJson({
        phaseId: "infer_planning_profile_tuning",
        modelId,
        prompt,
        schema: null,
        artifacts: []
      }).then((result) => result.value)
  });

  return {
    inferred: response.value || {},
    profileTuningPatch: normalizeInferredPlanningProfileTuning({
      inferred: response.value || {},
      didacticProfileId: launchConfig.didacticProfileId,
      currentProfileTuning: assistConfig.profileTuning || {}
    }),
    ingestedAttachments
  };
}
