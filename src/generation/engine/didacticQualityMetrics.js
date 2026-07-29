import { getTemplateDefinition } from "./templateCatalog.js";
import { getResourceCatalogItemById } from "./resourceCatalog.js";
import { evaluateChoiceOveruse, evaluateTheoryDensity, validatePracticeDistribution } from "./progressionGuard.js";
import { buildScopePacket, validateCardScope, validateCovers } from "./scopeGuard.js";
import { buildDependencyPacket, validateCardPrerequisites } from "./dependencyGuard.js";
import { getChoiceOptionComparableValue } from "../../core/choiceOptions.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function evaluateTheoryDensityMetric(cards = []) {
  const warnings = [];
  let penalty = 0;
  (Array.isArray(cards) ? cards : [])
    .filter((card) => text(card?.kind) === "theory")
    .forEach((card) => {
      const source = text(card?.text || card?.prompt);
      const sentenceCount = source.split(/[.!?]+/u).map((item) => text(item)).filter(Boolean).length;
      const semicolonCount = (source.match(/;/gu) || []).length;
      const enumerations = (source.match(/\b(al[eé]m disso|e tamb[eé]m|por fim)\b/giu) || []).length;
      const charCount = source.length;
      const density = evaluateTheoryDensity(card);
      if (density.dense || sentenceCount >= 4 || semicolonCount >= 2 || enumerations >= 2 || charCount > 280) {
        warnings.push(`card ${card.position}: teoria densa`);
        penalty += 25;
      }
    });
  return {
    score: clampScore(100 - penalty),
    warnings,
    failConditions: warnings.length ? ["theoryDensity"] : [],
    suggestions: warnings.length ? ["dividir teoria ou redistribuir explicação entre cards"] : []
  };
}

function evaluatePracticeDistributionMetric(cards = [], microsequence = {}) {
  const warnings = [];
  const practice = validatePracticeDistribution(cards);
  const firstExerciseIndex = (Array.isArray(cards) ? cards : []).findIndex((card) => text(card?.kind) === "exercise");
  const firstTheoryIndex = (Array.isArray(cards) ? cards : []).findIndex((card) => text(card?.kind) === "theory");
  if (!practice.ok) {
    warnings.push("microssequência sem prática fechada");
  }
  if (text(microsequence?.role) !== "practice" && firstExerciseIndex === 0) {
    warnings.push("prática apareceu antes de base mínima");
  }
  if (text(microsequence?.role) !== "practice" && firstTheoryIndex < 0) {
    warnings.push("microssequência introdutória sem card teórico");
  }
  return {
    score: clampScore(100 - warnings.length * 35),
    warnings,
    failConditions: warnings.length ? ["practiceDistribution"] : [],
    suggestions: warnings.length ? ["garantir base mínima antes da prática"] : []
  };
}

function evaluateChoiceOveruseMetric(cards = [], planItems = []) {
  const warnings = [];
  const choiceStats = evaluateChoiceOveruse(cards);
  const textualChoiceCount = (Array.isArray(cards) ? cards : []).filter((card) => text(card?.resource) === "choice").length;
  const nonChoiceResources = new Set((Array.isArray(cards) ? cards : []).filter((card) => text(card?.resource) !== "choice").map((card) => text(card?.resource)));
  if (choiceStats.excessive) {
    warnings.push("excesso de múltipla escolha sem variação de prática");
  }
  if (textualChoiceCount >= 2 && nonChoiceResources.size === 0 && Array.isArray(planItems) && planItems.length >= 3) {
    warnings.push("choice textual dominante por comodidade");
  }
  return {
    score: clampScore(100 - warnings.length * 30),
    warnings,
    failConditions: warnings.length ? ["choiceOveruse"] : [],
    suggestions: warnings.length ? ["variar recurso ou justificar escolha de choice"] : []
  };
}

function evaluateFeedbackSpecificityMetric(cards = []) {
  const warnings = [];
  const genericPatterns = [
    /^\s*correto[.!]?\s*$/iu,
    /^\s*muito bem[.!]?\s*$/iu,
    /^\s*tente novamente[.!]?\s*$/iu,
    /^\s*revise o conte[uú]do[.!]?\s*$/iu
  ];
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    const after = text(card?.after);
    if (!after) {
      return;
    }
    if (genericPatterns.some((pattern) => pattern.test(after))) {
      warnings.push(`card ${card.position}: feedback genérico`);
      return;
    }
    if (text(card?.kind) === "exercise" && after.length < 20) {
      warnings.push(`card ${card.position}: feedback curto demais`);
    }
  });
  return {
    score: clampScore(100 - warnings.length * 25),
    warnings,
    failConditions: warnings.length ? ["feedbackSpecificity"] : [],
    suggestions: warnings.length ? ["explicar o raciocínio ou o erro provável no feedback"] : []
  };
}

function evaluateDistractorQualityMetric(cards = []) {
  const warnings = [];
  (Array.isArray(cards) ? cards : [])
    .filter((card) => text(card?.exercise) === "choice")
    .forEach((card) => {
      const answerIds = new Set(
        (Array.isArray(card?.answerIds) ? card.answerIds : [])
          .map((answerId) => text(answerId).toLowerCase())
          .filter(Boolean)
      );
      const options = Array.isArray(card?.options) ? card.options : [];
      const correctOptionIndex = options.findIndex((option) => answerIds.has(text(option?.id).toLowerCase()));
      const correctText = correctOptionIndex >= 0 ? text(getChoiceOptionComparableValue(options[correctOptionIndex], correctOptionIndex)) : "";
      options.forEach((option, index) => {
        const optionId = text(option?.id).toLowerCase();
        const optionText = text(getChoiceOptionComparableValue(option, index));
        if (!optionText) {
          warnings.push(`card ${card.position}: distrator vazio`);
          return;
        }
        if (!answerIds.has(optionId) && correctText && optionText === correctText) {
          warnings.push(`card ${card.position}: distrator repete a resposta`);
        }
        if (!answerIds.has(optionId) && optionText.length <= 2) {
          warnings.push(`card ${card.position}: distrator pouco plausível`);
        }
      });
    });
  return {
    score: clampScore(100 - warnings.length * 20),
    warnings,
    failConditions: warnings.length ? ["distractorQuality"] : [],
    suggestions: warnings.length ? ["substituir distratores frágeis por erros plausíveis"] : []
  };
}

function evaluateScopeFidelityMetric(cards = [], { guide = {}, microsequence = {}, path = {}, sources = [] } = {}) {
  const scopePacket = buildScopePacket({ guide, microsequence, path, sources });
  const warnings = [];
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    warnings.push(...validateCardScope(card, scopePacket).errors.map((item) => `card ${card.position}: ${item}`));
  });
  const covers = validateCovers(cards, scopePacket);
  if (!covers.ok) {
    warnings.push(...covers.missing.map((item) => `cobertura ausente: ${item}`));
  }
  return {
    score: clampScore(100 - warnings.length * 25),
    warnings,
    failConditions: warnings.length ? ["scopeFidelity"] : [],
    suggestions: warnings.length ? ["corrigir fuga de escopo ou materializar covers faltantes"] : []
  };
}

function evaluateDependencyDisciplineMetric(cards = [], { lesson = {}, microsequence = {}, dependencyMicrosequences = [], currentCards = [] } = {}) {
  const dependencyPacket = buildDependencyPacket({
    lesson,
    microsequence,
    dependencyMicrosequences,
    currentCards
  });
  const dependency = validateCardPrerequisites(cards, dependencyPacket);
  const warnings = dependency.errors.map((item) => item);
  return {
    score: clampScore(100 - warnings.length * 30),
    warnings,
    failConditions: warnings.length ? ["dependencyDiscipline"] : [],
    suggestions: warnings.length ? ["remover conceito futuro ou materializar dependência antes do exercício"] : []
  };
}

function evaluateResourceFitMetric(cards = [], planItems = []) {
  const warnings = [];
  const planByPosition = new Map((Array.isArray(planItems) ? planItems : []).map((item) => [Number(item.position), item]));
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    const planItem = planByPosition.get(Number(card.position));
    const template = getTemplateDefinition(text(planItem?.templateId));
    const resource = getResourceCatalogItemById(text(card?.resource));
    if (!template || !resource) {
      warnings.push(`card ${card.position}: recurso ou template ausente no catálogo`);
      return;
    }
    if (template.resource !== resource.id) {
      warnings.push(`card ${card.position}: template ${text(planItem?.templateId)} incompatível com recurso ${resource.id}`);
    }
    if (!resource.templates.includes(text(planItem?.templateId))) {
      warnings.push(`card ${card.position}: template fora do catálogo do recurso`);
    }
  });
  return {
    score: clampScore(100 - warnings.length * 30),
    warnings,
    failConditions: warnings.length ? ["resourceFit"] : [],
    suggestions: warnings.length ? ["alinhar template escolhido ao catálogo declarativo do recurso"] : []
  };
}

export function evaluateDidacticQuality({
  cards = [],
  planItems = [],
  guide = {},
  microsequence = {},
  lesson = {},
  dependencyMicrosequences = [],
  currentCards = [],
  path = {},
  sources = []
} = {}) {
  const theoryDensity = evaluateTheoryDensityMetric(cards);
  const practiceDistribution = evaluatePracticeDistributionMetric(cards, microsequence);
  const choiceOveruse = evaluateChoiceOveruseMetric(cards, planItems);
  const feedbackSpecificity = evaluateFeedbackSpecificityMetric(cards);
  const distractorQuality = evaluateDistractorQualityMetric(cards);
  const scopeFidelity = evaluateScopeFidelityMetric(cards, { guide, microsequence, path, sources });
  const dependencyDiscipline = evaluateDependencyDisciplineMetric(cards, {
    lesson,
    microsequence,
    dependencyMicrosequences,
    currentCards
  });
  const resourceFit = evaluateResourceFitMetric(cards, planItems);
  const metrics = {
    theoryDensity,
    practiceDistribution,
    choiceOveruse,
    feedbackSpecificity,
    distractorQuality,
    scopeFidelity,
    dependencyDiscipline,
    resourceFit
  };
  const warnings = Object.values(metrics).flatMap((metric) => metric.warnings);
  const failConditions = Object.values(metrics).flatMap((metric) => metric.failConditions);
  const suggestions = Object.values(metrics).flatMap((metric) => metric.suggestions);
  const totalScore = clampScore(
    Object.values(metrics).reduce((sum, metric) => sum + metric.score, 0) / Object.keys(metrics).length
  );
  return {
    score: totalScore,
    warnings,
    failConditions,
    suggestions,
    metrics
  };
}
