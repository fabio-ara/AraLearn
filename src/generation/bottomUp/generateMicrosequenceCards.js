import { buildMicrosequencePlanningContract } from "../planning/buildMicrosequencePlanningContract.js";
import { validateMicrosequencePlan } from "../planning/validateMicrosequencePlan.js";
import { validateGeneratedCards } from "../validation/validateGeneratedCards.js";
import { buildContextPacket } from "./buildContextPacket.js";
import { findSelection, replaceGeneratedCards, replaceMicrosequence } from "./_shared.js";
import { createDeepSeekUsageLogger } from "../engine/deepSeekUsageLogger.js";
import { runBottomUpMicroPlan } from "../engine/bottomUpPlanRuntime.js";
import { compileCardsFromSlotPackets, runBottomUpCardBuild } from "../engine/bottomUpBuildRuntime.js";
import { runBottomUpCardAudit } from "../engine/bottomUpAuditRuntime.js";
import { decodeCode } from "../engine/slotCodebook.js";
import { buildScopePacket, buildScopeErrors, validateCardScope, validateCovers } from "../engine/scopeGuard.js";
import { buildDependencyPacket, validateCardPrerequisites } from "../engine/dependencyGuard.js";
import { evaluateChoiceOveruse, suggestTheorySplit, validateExerciseClosedness, validatePracticeDistribution } from "../engine/progressionGuard.js";
import { validateCompiledCardSemantics, findStructuralLeak } from "../engine/templateSemanticValidation.js";
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

function buildCardBlueprint(planItems = [], validatedPlan = {}, planningContract = {}) {
  const slotPlan = Array.isArray(validatedPlan?.plan?.slotPlan) ? validatedPlan.plan.slotPlan : [];
  const slotByPosition = new Map(slotPlan.map((item) => [Number(item.position), item]));
  const hasKnownErrors = Array.isArray(planningContract?.knownErrors) && planningContract.knownErrors.length > 0;
  return (Array.isArray(planItems) ? planItems : []).map((item) => {
    const resource = decodeCode(item.resourceCode)?.id || "paragraph";
    const templateId = text(item.templateId);
    const shape = ["paragraph_gap", "code_gap"].includes(templateId)
      ? { kind: "exercise", exercise: "gap" }
      : ["paragraph_theory", "matrix_theory", "table_theory", "code_theory"].includes(templateId)
        ? { kind: "theory", exercise: "none" }
        : { kind: "exercise", exercise: "choice" };
    const slot = slotByPosition.get(Number(item.position)) || {};
    const role = text(slot.role || item.role);
    return {
      position: Number(item.position),
      role: role === "fix_error" && !hasKnownErrors ? "practice_more" : role,
      resource,
      kind: shape.kind,
      exercise: shape.exercise,
      goal: text(slot.goal || item.planningReason || validatedPlan?.plan?.goal),
      checks: Array.isArray(slot.checks) ? slot.checks : [],
      templateId
    };
  });
}

function buildMaterializationEnvelope({ planningContract, microsequence, cardBlueprint, currentCards = [] } = {}) {
  return {
    task: "structured_card_materialization",
    language: "pt-BR",
    path: structuredClone(planningContract?.path || {}),
    guide: structuredClone(planningContract?.guide || { goal: "", include: [], exclude: [], notation: [], avoid: [] }),
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
  slotPackets,
  envelope,
  info,
  userRequest,
  planningContract,
  cardBlueprint
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
  const slotPacketByPosition = new Map((Array.isArray(slotPackets) ? slotPackets : []).map((item) => [Number(item.position), item]));
  const planByPosition = new Map((Array.isArray(cardBlueprint) ? cardBlueprint : []).map((item) => [Number(item.position), item]));
  const semanticErrors = [];
  const computedAnswers = [];
  const structuralLeakWarnings = [];
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    try {
      const semantic = validateCompiledCardSemantics(card, {
        templateId: text(planByPosition.get(Number(card.position))?.templateId),
        slotPacket: slotPacketByPosition.get(Number(card.position)) || { position: card.position, slots: {} },
        planItem: planByPosition.get(Number(card.position)) || {}
      });
      if (semantic?.computedAnswer) {
        computedAnswers.push({
          position: Number(card.position),
          answer: semantic.computedAnswer,
          correctValue: semantic.correctValue,
          targetRow: semantic.targetRow,
          targetCol: semantic.targetCol
        });
      }
    } catch (error) {
      semanticErrors.push(`card ${card.position}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const leaks = [card.title, card.prompt, card.text, card.question, card.after]
      .concat(Array.isArray(card.options) ? card.options.map((option, index) => getChoiceOptionComparableValue(option, index)) : [])
      .map((value) => ({ value: text(value), leak: findStructuralLeak(value) }))
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
  source = "llm",
  versionAction,
  attachedSources = [],
  userSelectedSourceIds = [],
  userSelectedExtraResourceTypes = [],
  requestContext = null,
  onProgress,
  resumeState = null
} = {}) {
  const info = findSelection(project, selection);
  if (!info) {
    throw new Error("Microssequência não encontrada.");
  }
  if (typeof provider?.generateText !== "function") {
    throw new Error("Provider sem canal textual para o engine estruturado.");
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
    contextPacket
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
    try {
      planItems = await runBottomUpMicroPlan({
        provider,
        modelId,
        planningContract,
        validatedPlan,
        logger
      });
    } catch (error) {
      emitStageProgress(onProgress, {
        stage: "plan",
        status: "failed",
        message: error instanceof Error ? error.message : "Falha ao planejar a microssequência.",
        resumeFrom: "plan",
        artifacts: { planningContract, validatedPlan }
      });
      throw error;
    }
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
    cardBlueprint = buildCardBlueprint(planItems, validatedPlan, planningContract);
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

  let cards = null;
  let slotPackets = null;
  let cardsBeforeAudit = null;
  emitStageProgress(onProgress, {
    stage: "compile",
    status: "started",
    message: "Compilando os cards finais.",
    artifacts: { materializationEnvelope, cardBlueprint, planningContract, validatedPlan, planItems }
  });
  try {
    const buildResult = await runBottomUpCardBuild({
      provider,
      modelId,
      generationContract: materializationEnvelope,
      planItems: cardBlueprint,
      logger
    });
    cards = buildResult.cards;
    slotPackets = buildResult.slotPackets;
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
      artifacts: { cardCount: cards.length, cards, slotPackets, materializationEnvelope, cardBlueprint, planningContract, validatedPlan, planItems }
  });

  const audit = await runBottomUpCardAudit({
    provider,
    modelId,
    generationContract: materializationEnvelope,
    cards,
    slotPackets,
    planItems: cardBlueprint,
    logger
  });
  if (Array.isArray(audit?.appliedSlotPackets) && audit.appliedSlotPackets.length) {
    slotPackets = audit.appliedSlotPackets;
    cards = compileCardsFromSlotPackets(cardBlueprint, slotPackets, materializationEnvelope);
  }
  const quality = validateStructuredOutcome({
    cards,
    slotPackets,
    envelope: materializationEnvelope,
    info,
    userRequest,
    planningContract,
    cardBlueprint
  });
  if (Array.isArray(audit?.invalidAuditPatches) && audit.invalidAuditPatches.length) {
    quality.extraErrors.push(`Auditoria inválida: ${audit.invalidAuditPatches.join("; ")}`);
  }
  if ((audit?.status && audit.status !== 1201) && !(Array.isArray(audit?.appliedSlotPatches) && audit.appliedSlotPatches.length)) {
    quality.extraErrors.push("Auditoria detectou problema sem patch aplicável.");
  }
  if (audit?.status === 1206 || audit?.failClosed === true) {
    quality.extraErrors.push("Auditoria solicitou fail_closed.");
  }
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
