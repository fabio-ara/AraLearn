import { buildMicrosequencePlanningContract } from "../planning/buildMicrosequencePlanningContract.js";
import { validateMicrosequencePlan } from "../planning/validateMicrosequencePlan.js";
import { validateGeneratedCards } from "../validation/validateGeneratedCards.js";
import { buildContextPacket } from "./buildContextPacket.js";
import { findSelection, replaceGeneratedCards, replaceMicrosequence } from "./_shared.js";
import { createDeepSeekUsageLogger } from "../engine/deepSeekUsageLogger.js";
import { runStructuredBottomUp } from "../engine/structuredBottomUpRuntime.js";
import { buildScopePacket, buildScopeErrors, validateCardScope, validateCovers } from "../engine/scopeGuard.js";
import { buildDependencyPacket, validateCardPrerequisites } from "../engine/dependencyGuard.js";
import { evaluateChoiceOveruse, suggestTheorySplit, validateExerciseClosedness, validatePracticeDistribution } from "../engine/progressionGuard.js";
import { findGeneratedContentLeak } from "../validation/contentLeakGuard.js";
import { getChoiceOptionComparableValue } from "../../core/choiceOptions.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readResumeArtifacts(resumeState = {}) {
  const artifacts = resumeState?.artifacts;
  return artifacts && typeof artifacts === "object" && !Array.isArray(artifacts) ? artifacts : {};
}

function emitStageProgress(onProgress, event = {}) {
  if (typeof onProgress === "function") {
    onProgress(event);
  }
}

function summarizeErrors(errors = []) {
  return errors.map((error) => (typeof error === "string" ? error : error?.message || String(error))).join("; ");
}

function defaultPlanForMicrosequence(microsequence = {}, userRequest = "") {
  const role = text(microsequence?.role);
  const isBranch = Boolean(text(microsequence?.branchOf));
  const narrowScope = (Array.isArray(microsequence?.covers) ? microsequence.covers.filter(Boolean).length : 0) <= 1;
  const type = role === "practice" ? "guided_practice" : role === "review" ? "review" : "concept";
  const size =
    role === "practice"
      ? "medium"
      : isBranch
        ? "medium"
        : role === "explain" && narrowScope
          ? "short"
          : role === "review" || role === "support"
            ? "long"
            : "long";
  return {
    type,
    size,
    goal: text(userRequest) || text(microsequence?.goal),
    extraResources: [],
    sources: [],
    reason: "Plano local padrão."
  };
}

function buildMaterializationEnvelope({ planningContract, microsequence, cardBlueprint, currentCards = [] } = {}) {
  return {
    task: "structured_card_materialization",
    language: "pt-BR",
    path: structuredClone(planningContract?.path || {}),
    guide: structuredClone(planningContract?.guide || { goal: "", include: [], exclude: [], notation: [], avoid: [] }),
    didactics: structuredClone(planningContract?.didactics || {}),
    microsequence: {
      title: text(microsequence?.title),
      goal: text(microsequence?.goal),
      checks: Array.isArray(microsequence?.checks) ? microsequence.checks : [],
      branchOf: text(microsequence?.branchOf)
    },
    knownErrors: Array.isArray(planningContract?.knownErrors) ? structuredClone(planningContract.knownErrors) : [],
    request: {
      mode: text(planningContract?.request?.mode) === "repair" ? "repair" : "generate",
      prompt: text(planningContract?.request?.prompt)
    },
    context: {
      refs: Array.isArray(planningContract?.context?.refs) ? structuredClone(planningContract.context.refs) : [],
      next: planningContract?.context?.next ? structuredClone(planningContract.context.next) : null,
      existingCards: Array.isArray(planningContract?.context?.existingCards) ? structuredClone(planningContract.context.existingCards) : [],
      currentCards: Array.isArray(currentCards) ? structuredClone(currentCards) : []
    },
    plan: structuredClone(cardBlueprint),
    sources: Array.isArray(planningContract?.sources) ? structuredClone(planningContract.sources) : [],
    output: {
      format: "public_card_json",
      cardCount: Array.isArray(cardBlueprint) ? cardBlueprint.length : 0
    }
  };
}

function validateStructuredOutcome({
  cards,
  envelope,
  info,
  userRequest,
  planningContract,
} = {}) {
  const dependencyPacket = buildDependencyPacket({
    lesson: info.lesson,
    microsequence: info.microsequence,
    dependencyMicrosequences: (info.lesson.microsequences || []).filter((item) => (info.microsequence.dependsOn || []).includes(item.id)),
    currentCards: envelope?.context?.currentCards || []
  });
  const scopePacket = buildScopePacket({
    guide: info.lesson.guide || info.moduleValue.guide,
    microsequence: info.microsequence,
    userRequest,
    path: planningContract?.path,
    sources: planningContract?.sources
  });
  const scopeCardErrors = cards.flatMap((card) => validateCardScope(card, scopePacket).errors);
  const coversResult = validateCovers(cards, scopePacket);
  const dependencyResult = validateCardPrerequisites(cards, dependencyPacket);
  const practiceResult = validatePracticeDistribution(cards);
  const exerciseClosedness = validateExerciseClosedness(cards);
  const validation = validateGeneratedCards({ cards }, envelope);
  const extraErrors = buildScopeErrors({
    cardErrors: scopeCardErrors,
    missingCovers: coversResult.missing
  }).concat(dependencyResult.errors);
  const semanticErrors = [];
  const computedAnswers = [];
  const structuralLeakWarnings = [];
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    const leaks = [card.title, card.prompt, card.text, card.question, card.after]
      .concat(Array.isArray(card.options) ? card.options.map((option, index) => getChoiceOptionComparableValue(option, index)) : [])
      .map((value) => ({ value: text(value), leak: findGeneratedContentLeak(value) }))
      .filter((entry) => entry.value && entry.leak)
      .map((entry) => `card ${card.position}: ${entry.leak.reason}`);
    structuralLeakWarnings.push(...leaks);
  });
  if (!practiceResult.ok) {
    extraErrors.push("Distribuição de prática insuficiente.");
  }
  if (!exerciseClosedness.ok) {
    extraErrors.push(`Exercício aberto detectado nas posições: ${exerciseClosedness.invalidPositions.join(", ")}.`);
  }
  return {
    validation,
    extraErrors,
    semanticErrors,
    computedAnswers,
    structuralLeakWarnings,
    scopeCardErrors,
    dependencyResult,
    choiceStats: evaluateChoiceOveruse(cards),
    theorySplit: suggestTheorySplit(cards)
  };
}

export async function generateMicrosequenceCards({
  project,
  selection,
  provider,
  modelId,
  density = "standard",
  userRequest = "",
  attachedSources = [],
  userSelectedSourceIds = [],
  userSelectedExtraResourceTypes = [],
  requestContext = null,
  didacticPolicy = {},
  onProgress,
  resumeState = null
} = {}) {
  const info = findSelection(project, selection);
  if (!info) {
    throw new Error("Microssequência não encontrada.");
  }
  if (typeof provider?.generateStructured !== "function") {
    throw new Error("Provider sem saída estruturada para o bottom-up.");
  }

  const resumeFrom = text(resumeState?.resumeFrom);
  const resumeArtifacts = readResumeArtifacts(resumeState);
  const contextPacket = buildContextPacket(project, selection, {
    density,
    userRequest,
    selectedRefIds: Array.isArray(requestContext?.selectedRefs) ? requestContext.selectedRefs : []
  });
  const logger = createDeepSeekUsageLogger();

  const planningContract = resumeArtifacts.planningContract || buildMicrosequencePlanningContract({
    selectedCourse: info.course,
    selectedModule: info.moduleValue,
    selectedLesson: info.lesson,
    targetMicrosequence: info.microsequence,
    userPrompt: userRequest,
    attachedSources,
    userSelectedSourceIds,
    userSelectedExtraResourceTypes,
    requestContext,
    contextPacket,
    didacticPolicy
  });

  let validatedPlan = resumeArtifacts.validatedPlan || null;
  let planItems = resumeArtifacts.planItems || null;
  let cardBlueprint = resumeArtifacts.cardBlueprint || null;
  let materializationEnvelope = resumeArtifacts.materializationEnvelope || null;

  if (!validatedPlan || resumeFrom === "plan" || (!resumeFrom && !planItems)) {
    emitStageProgress(onProgress, {
      stage: "plan",
      status: "started",
      message: "Planejando a microssequência no motor estruturado.",
      artifacts: { planningContract }
    });
    validatedPlan = validateMicrosequencePlan(defaultPlanForMicrosequence(info.microsequence, userRequest), planningContract);
    if (!validatedPlan.ok) {
      emitStageProgress(onProgress, {
        stage: "plan",
        status: "failed",
        message: summarizeErrors(validatedPlan.errors),
        resumeFrom: "plan",
        artifacts: { planningContract, validatedPlan }
      });
      throw new Error(summarizeErrors(validatedPlan.errors));
    }
    planItems = structuredClone(validatedPlan.plan.slotPlan);
    emitStageProgress(onProgress, {
      stage: "plan",
      status: "ok",
      message: "Plano local validado.",
      artifacts: { planningContract, validatedPlan, planItems }
    });
  } else {
    emitStageProgress(onProgress, {
      stage: "plan",
      status: "ok",
      message: "Plano local reaproveitado da etapa anterior.",
      artifacts: { planningContract, validatedPlan, planItems }
    });
  }

  if (!cardBlueprint || resumeFrom === "draft") {
    emitStageProgress(onProgress, {
      stage: "draft",
      status: "started",
      message: "Definindo a forma didática dos cards.",
      artifacts: { planningContract, validatedPlan, planItems }
    });
    cardBlueprint = structuredClone(planItems);
    materializationEnvelope = buildMaterializationEnvelope({
      planningContract,
      microsequence: info.microsequence,
      cardBlueprint,
      currentCards: contextPacket?.microsequence?.currentCards || []
    });
    emitStageProgress(onProgress, {
      stage: "draft",
      status: "ok",
      message: "Plano fino estruturado validado.",
      artifacts: { cardBlueprint, materializationEnvelope, planningContract, validatedPlan, planItems }
    });
  } else {
    emitStageProgress(onProgress, {
      stage: "draft",
      status: "ok",
      message: "Plano fino reaproveitado da etapa anterior.",
      artifacts: { cardBlueprint, materializationEnvelope, planningContract, validatedPlan, planItems }
    });
  }

  let cards;
  let cardsBeforeAudit;
  emitStageProgress(onProgress, {
    stage: "compile",
    status: "started",
    message: "Compilando os cards finais.",
    artifacts: { materializationEnvelope, cardBlueprint, planningContract, validatedPlan, planItems }
  });
  try {
    const buildResult = await runStructuredBottomUp({
      provider,
      modelId,
      generationContract: materializationEnvelope,
      didacticPlan: cardBlueprint
    });
    cards = buildResult.cards;
    cardBlueprint = buildResult.cardPlan;
    materializationEnvelope = buildMaterializationEnvelope({
      planningContract,
      microsequence: info.microsequence,
      cardBlueprint,
      currentCards: contextPacket?.microsequence?.currentCards || []
    });
    cardsBeforeAudit = structuredClone(cards);
  } catch (error) {
    emitStageProgress(onProgress, {
      stage: "compile",
      status: "failed",
      message: error instanceof Error ? error.message : "Falha ao compilar os cards finais.",
      resumeFrom: "compile",
      artifacts: { materializationEnvelope, cardBlueprint, planningContract, validatedPlan, planItems }
    });
    throw error;
  }
  emitStageProgress(onProgress, {
    stage: "compile",
    status: "ok",
    message: "Cards compilados pelo motor estruturado.",
      artifacts: { cardCount: cards.length, cards, materializationEnvelope, cardBlueprint, planningContract, validatedPlan, planItems }
  });

  const audit = {
    status: "validated_locally",
    findings: [],
    appliedPatches: []
  };
  const quality = validateStructuredOutcome({
    cards,
    envelope: materializationEnvelope,
    info,
    userRequest,
    planningContract
  });
  if (quality.semanticErrors.length) {
    quality.extraErrors.push(...quality.semanticErrors);
  }
  if (quality.structuralLeakWarnings.length) {
    quality.extraErrors.push(...quality.structuralLeakWarnings);
  }
  if (!quality.validation.ok || quality.extraErrors.length) {
    emitStageProgress(onProgress, {
      stage: "validate",
      status: "failed",
      message: summarizeErrors([...quality.validation.errors, ...quality.extraErrors]),
      resumeFrom: "compile",
      artifacts: {
        materializationEnvelope,
        cardBlueprint,
        planningContract,
        validatedPlan,
        planItems,
        cards,
        validation: quality.validation,
        extraErrors: quality.extraErrors
      }
    });
    throw new Error(summarizeErrors([...quality.validation.errors, ...quality.extraErrors]));
  }

  emitStageProgress(onProgress, {
    stage: "validate",
    status: "ok",
    message: "Validação final concluída.",
    artifacts: {
      cards,
      validation: quality.validation,
      materializationEnvelope,
      cardBlueprint,
      planningContract,
      validatedPlan,
      planItems
    }
  });

  const usageReport = logger.writeReport({
    finalValidation: true,
    cardsGenerated: cards.length,
    resourcesUsed: [...new Set(cards.map((card) => card.resource))],
    audit,
    cardsBeforeAudit,
    cardsAfterAudit: cards,
    choiceCount: quality.choiceStats.choiceCount,
    nonChoiceExerciseCount: quality.choiceStats.nonChoiceExerciseCount,
    theoryDensityWarnings: quality.theorySplit,
    scopeWarnings: quality.scopeCardErrors,
    dependencyWarnings: quality.dependencyResult.errors,
    semanticValidation: quality.semanticErrors.length === 0 && quality.structuralLeakWarnings.length === 0,
    semanticErrors: quality.semanticErrors,
    structuralLeakWarnings: quality.structuralLeakWarnings,
    computedAnswers: quality.computedAnswers,
    fail_closed: false
  });

  const summary = text(validatedPlan.plan.reason) || text(validatedPlan.plan.goal);
  const nextMicrosequence = replaceGeneratedCards(info.microsequence, {
    cards: quality.validation.cards,
    summary,
    validation: { ok: true, issues: [] }
  }, {
    status: "generated"
  });

  emitStageProgress(onProgress, {
    stage: "complete",
    status: "ok",
    message: "Entrega concluída.",
    artifacts: {
      cards: nextMicrosequence.cards
    }
  });

  return {
    project: replaceMicrosequence(project, info, nextMicrosequence),
    selection,
    density: "structured",
    contextPacket,
    planningContract,
    draftPlan: cardBlueprint,
    plan: {
      ...validatedPlan.plan,
      cardPlan: cardBlueprint,
      structured: true
    },
    generationContract: materializationEnvelope,
    cards: nextMicrosequence.cards,
    usageReport
  };
}
