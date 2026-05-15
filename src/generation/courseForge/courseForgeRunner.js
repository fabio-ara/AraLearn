import { callModelWithRetry } from "../providers/callModelWithRetry.js";
import { createDefaultProviderRegistry } from "../providers/providerRegistry.js";
import { buildCourseForgePrompt } from "./courseForgePrompts.js";
import { applyCourseForgePatch } from "./courseForgeApply.js";
import { createCourseForgeArtifactsStore } from "./courseForgeArtifacts.js";
import { resolveCourseForgeIntent } from "./courseForgeIntent.js";
import { compileCourseStructureToPatch, validateCourseForgePatch } from "./courseForgePatch.js";
import { resolveCourseForgePhases, resolveDeferredCourseForgePhases } from "./courseForgePhases.js";
import { createCourseForgeRunState, markCourseForgePhase, updateCourseForgeRunState } from "./courseForgeRunState.js";
import { validateCourseForgeSourceLedger } from "./courseForgeSourceLedger.js";
import {
  mergeCourseForgeArchitectureAudits,
  validateCourseForgeArchitectureDraft,
  validateCourseForgeLessonPlanSet,
  validateCourseForgeMicrosequencePlans
} from "./courseForgeValidation.js";
import { resolveModelForCourseForgePhase } from "../modelProfiles/modelRouting.js";
import {
  auditCourseForgeCardDrafts,
  auditCourseForgeDomainCoverage,
  mergeCourseForgeAdherenceAudits,
  auditCourseForgeSourceAdherence,
  buildCourseForgeMicrosequenceContracts,
  normalizeCourseForgeCardsPayload,
  repairCourseForgeDraftCardsDeterministically,
  repairCourseForgeMicrosequenceMetadataDeterministically
} from "./courseForgeCards.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildInlineSourceLedger(intent = {}) {
  return (intent.attachments || []).map((item, index) => ({
    id: item.id || `src_${index + 1}`,
    title: item.name || `Anexo ${index + 1}`,
    kind: item.kind || "attachment",
    locator: "",
    priority: index + 1,
    extractedTopics: [],
    assessmentSignals: [],
    notationSignals: [],
    teacherConventions: []
  }));
}

function buildArchitecturePromptTask(intent = {}, projectDocument = {}) {
  const summary = Array.isArray(projectDocument?.courses)
    ? `Cursos atuais no projeto: ${projectDocument.courses.length}.`
    : "Projeto atual sem cursos.";
  return `${intent.promptText}\n\nContexto do projeto:\n${summary}`;
}

function readArchitectureValue(payload = {}) {
  if (payload?.architectureFinal?.course) {
    return payload.architectureFinal;
  }
  if (payload?.architectureDraft?.course) {
    return payload.architectureDraft;
  }
  if (payload?.course) {
    return payload;
  }
  return payload;
}

function listArchitectureLessons(architectureDraft = {}) {
  const course = readArchitectureValue(architectureDraft)?.course;
  const lessons = [];
  (Array.isArray(course?.modules) ? course.modules : []).forEach((moduleValue) => {
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).forEach((lesson) => {
      lessons.push({
        courseKey: text(course?.key),
        moduleKey: text(moduleValue?.key),
        lessonKey: text(lesson?.key),
        lessonTitle: text(lesson?.title),
        lessonDescription: text(lesson?.description),
        sourceGuideStructured: structuredClone(lesson?.sourceGuideStructured || {}),
        domainMap: structuredClone(lesson?.domainMap || null),
        resourceTags: structuredClone(lesson?.resourceTags || []),
        contentTypeTags: structuredClone(lesson?.contentTypeTags || []),
        learningActionTags: structuredClone(lesson?.learningActionTags || []),
        supportLevel: text(lesson?.supportLevel),
        presetId: text(lesson?.presetId)
      });
    });
  });
  return lessons;
}

function normalizeLessonPlans(payload = {}, architectureDraft = {}) {
  const explicit = Array.isArray(payload?.lessonPlans) ? payload.lessonPlans : [];
  if (explicit.length) {
    return explicit.map((lessonPlan) => ({
      courseKey: text(lessonPlan?.courseKey),
      moduleKey: text(lessonPlan?.moduleKey),
      lessonKey: text(lessonPlan?.lessonKey),
      lessonTitle: text(lessonPlan?.lessonTitle),
      lessonDescription: text(lessonPlan?.lessonDescription),
      sourceGuideStructured: structuredClone(lessonPlan?.sourceGuideStructured || {}),
      domainMap: structuredClone(lessonPlan?.domainMap || null),
      resourceTags: structuredClone(lessonPlan?.resourceTags || []),
      contentTypeTags: structuredClone(lessonPlan?.contentTypeTags || []),
      learningActionTags: structuredClone(lessonPlan?.learningActionTags || []),
      supportLevel: text(lessonPlan?.supportLevel),
      presetId: text(lessonPlan?.presetId)
    }));
  }
  return listArchitectureLessons(architectureDraft);
}

function normalizeMicrosequencePlans(payload = {}, lessonPlans = []) {
  const plans = Array.isArray(payload?.microsequencePlans) ? payload.microsequencePlans : Array.isArray(payload) ? payload : [];
  return plans.map((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    const lessonMeta = lessonPlans.find((item) => text(item?.lessonKey) === lessonKey) || {};
    return {
      lessonKey,
      moduleKey: text(lessonPlan?.moduleKey || lessonMeta.moduleKey),
      courseKey: text(lessonPlan?.courseKey || lessonMeta.courseKey),
      microsequences: (Array.isArray(lessonPlan?.microsequences) ? lessonPlan.microsequences : []).map((microsequence, microIndex) => ({
        key: text(microsequence?.key) || `${lessonKey || "lesson"}-micro-${microIndex + 1}`,
        title: text(microsequence?.title),
        description: text(microsequence?.description),
        objective: text(microsequence?.objective),
        domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs.map(text).filter(Boolean) : [],
        practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs) ? microsequence.practiceVariantRefs.map(text).filter(Boolean) : [],
        didacticPurpose: text(microsequence?.didacticPurpose),
        coverageRole: text(microsequence?.coverageRole),
        tags: Array.isArray(microsequence?.tags) ? microsequence.tags.map(text).filter(Boolean) : []
      }))
    };
  });
}

async function callProviderPhase({ provider, phaseId, modelId, prompt, schema, artifacts }) {
  return callModelWithRetry({
    phase: phaseId,
    modelId,
    request: { prompt, schema, artifacts },
    callModel: async ({ modelId: activeModelId }) =>
      provider.callJson({
        phaseId,
        modelId: activeModelId,
        prompt,
        schema,
        artifacts,
        parameters: {}
      }).then((result) => result.value)
  });
}

function hasBlockingIssues(audit = {}) {
  return (Array.isArray(audit?.issues) ? audit.issues : []).some((item) => item?.severity !== "warning");
}

function mergeCardAudits(...audits) {
  const issues = [];
  const warnings = [];
  audits.forEach((audit) => {
    issues.push(...((Array.isArray(audit?.issues) ? audit.issues : []).filter((item) => item?.severity !== "warning")));
    warnings.push(...(Array.isArray(audit?.warnings) ? audit.warnings : []));
  });
  return {
    approved: issues.length === 0,
    issues,
    warnings
  };
}

export async function runCourseForge({
  intent: rawIntent,
  projectDocument,
  providerRegistry = createDefaultProviderRegistry(),
  providerId = "fake",
  artifactStore = createCourseForgeArtifactsStore(),
  resumeRunId = ""
} = {}) {
  const intent = resolveCourseForgeIntent({ ...rawIntent, projectDocument });
  const phases = resolveCourseForgePhases(intent);
  const deferredPhases = resolveDeferredCourseForgePhases(intent);
  let runState = resumeRunId
    ? artifactStore.loadRun(resumeRunId)?.runState || createCourseForgeRunState({ runId: resumeRunId, intent, phases })
    : createCourseForgeRunState({ intent, phases });
  const runId = runState.runId;
  artifactStore.saveRun(runId, { runState, intent });
  const provider = providerRegistry.get(providerId);
  if (!provider) {
    throw new Error(`Provider não encontrado: ${providerId}.`);
  }

  const context = {
    intent,
    projectDocument: structuredClone(projectDocument),
    sourceLedger: artifactStore.loadArtifact(runId, "source-ledger")?.content || null,
    architectureDraft: artifactStore.loadArtifact(runId, "architecture-draft")?.content || null,
    architectureAudit: artifactStore.loadArtifact(runId, "architecture-audit")?.content || null,
    architectureFinal: artifactStore.loadArtifact(runId, "architecture-final")?.content || null,
    lessonPlans: artifactStore.loadArtifact(runId, "lesson-plans")?.content || null,
    microsequencePlans: artifactStore.loadArtifact(runId, "microsequence-plans")?.content || null,
    microsequenceAudit: artifactStore.loadArtifact(runId, "microsequence-audit")?.content || null,
    microsequenceAdherenceAudit: artifactStore.loadArtifact(runId, "microsequence-adherence-audit")?.content || null,
    microsequenceContracts: artifactStore.loadArtifact(runId, "microsequence-contracts")?.content || null,
    cardDrafts: artifactStore.loadArtifact(runId, "card-drafts")?.content || null,
    cardsAudit: artifactStore.loadArtifact(runId, "cards-audit")?.content || null,
    sourceAdherenceAudit: artifactStore.loadArtifact(runId, "source-adherence-audit")?.content || null,
    cardsFinal: artifactStore.loadArtifact(runId, "cards-final")?.content || null,
    patch: artifactStore.loadArtifact(runId, "patch-final")?.content || null
  };

  for (const phaseId of phases) {
    const phaseState = (runState.phases || []).find((phase) => phase.phaseId === phaseId);
    if (phaseState?.status === "completed") {
      continue;
    }

    runState = markCourseForgePhase(runState, phaseId, {
      status: "running",
      startedAt: new Date().toISOString(),
      attempts: (phaseState?.attempts || 0) + 1
    });
    artifactStore.saveRun(runId, { runState, intent });

    try {
      if (phaseId === "normalize_intent") {
        artifactStore.saveArtifact(runId, "intent", intent);
      } else if (phaseId === "index_sources") {
        const localLedger = buildInlineSourceLedger(intent);
        const result = validateCourseForgeSourceLedger(localLedger);
        if (!result.ok) {
          throw new Error(result.errors.join(" "));
        }
        context.sourceLedger = result.sourceLedger;
        artifactStore.saveArtifact(runId, "source-ledger", context.sourceLedger);
      } else if (phaseId === "plan_architecture") {
        const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
        const response = await callProviderPhase({
          provider,
          phaseId,
          modelId,
          prompt: buildCourseForgePrompt({
            role: "Você planeja a estrutura didática top-down do AraLearn.",
            sourcePack: JSON.stringify(context.sourceLedger || []),
            task: buildArchitecturePromptTask(intent, context.projectDocument),
            output: "Responda somente JSON válido com architectureDraft ou patch."
          }),
          schema: null,
          artifacts: [{ id: "intent", name: "intent", content: JSON.stringify(intent) }]
        });
        context.architectureDraft = structuredClone(readArchitectureValue(response.value || response));
        artifactStore.saveArtifact(runId, "architecture-draft", context.architectureDraft);
      } else if (phaseId === "audit_architecture") {
        const localAudit = validateCourseForgeArchitectureDraft({
          architectureDraft: context.architectureDraft || {},
          sourceLedger: context.sourceLedger || [],
          scope: intent.scope
        });
        let providerAudit = { approved: true, blockingIssues: [], warnings: [] };
        if (provider?.id !== "fake" || provider?.capabilities?.provider === "fake") {
          const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
          const response = await callProviderPhase({
            provider,
            phaseId,
            modelId,
            prompt: buildCourseForgePrompt({
              role: "Você audita a arquitetura didática proposta para o AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Revise a arquitetura proposta. Aponte problemas de escopo, progressão, aderência às fontes e vocabulário de bastidor.",
              output: "Responda somente JSON válido com approved, blockingIssues e warnings."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "architecture-draft", name: "architecture-draft", content: JSON.stringify(context.architectureDraft || {}) }
            ]
          });
          providerAudit = structuredClone(response.value || response || providerAudit);
        }
        context.architectureAudit = mergeCourseForgeArchitectureAudits(localAudit, providerAudit);
        artifactStore.saveArtifact(runId, "architecture-audit", context.architectureAudit);
      } else if (phaseId === "repair_architecture") {
        const audit = context.architectureAudit || { approved: true, blockingIssues: [], warnings: [] };
        if (audit.approved && !(audit.blockingIssues || []).length) {
          context.architectureFinal = structuredClone(context.architectureDraft || {});
          artifactStore.saveArtifact(runId, "architecture-final", context.architectureFinal);
        } else {
          const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
          const response = await callProviderPhase({
            provider,
            phaseId,
            modelId,
            prompt: buildCourseForgePrompt({
              role: "Você repara a arquitetura didática top-down do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Corrija apenas os problemas apontados pela auditoria, sem ampliar o escopo além do pedido.",
              output: "Responda somente JSON válido com architectureFinal."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "architecture-draft", name: "architecture-draft", content: JSON.stringify(context.architectureDraft || {}) },
              { id: "architecture-audit", name: "architecture-audit", content: JSON.stringify(audit) }
            ]
          });
          context.architectureFinal = structuredClone(readArchitectureValue(response.value || response));
          const finalAudit = validateCourseForgeArchitectureDraft({
            architectureDraft: context.architectureFinal || {},
            sourceLedger: context.sourceLedger || [],
            scope: intent.scope
          });
          if (!finalAudit.ok) {
            throw new Error(`A arquitetura reparada ainda falhou na auditoria: ${finalAudit.blockingIssues.map((item) => item.evidence).join(" ")}`);
          }
          artifactStore.saveArtifact(runId, "architecture-final", context.architectureFinal);
        }
      } else if (phaseId === "plan_lessons") {
        const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
        const response = await callProviderPhase({
          provider,
          phaseId,
          modelId,
          prompt: buildCourseForgePrompt({
            role: "Você normaliza o conjunto de lições planejadas para o AraLearn.",
            sourcePack: JSON.stringify(context.sourceLedger || []),
            task: "Confirme e detalhe o conjunto de lições do curso planejado, sem criar cards.",
            output: "Responda somente JSON válido com lessonPlans."
          }),
          schema: null,
          artifacts: [
            { id: "intent", name: "intent", content: JSON.stringify(intent) },
            { id: "architecture-final", name: "architecture-final", content: JSON.stringify(context.architectureFinal || {}) }
          ]
        });
        context.lessonPlans = normalizeLessonPlans(response.value || response || {}, context.architectureFinal || {});
        const lessonValidation = validateCourseForgeLessonPlanSet({
          architectureDraft: context.architectureFinal || {},
          lessonPlans: context.lessonPlans
        });
        if (!lessonValidation.ok) {
          throw new Error(`Planejamento de lições inválido: ${lessonValidation.errors.join(" ")}`);
        }
        artifactStore.saveArtifact(runId, "lesson-plans", context.lessonPlans);
      } else if (phaseId === "plan_microsequences") {
        const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
        const response = await callProviderPhase({
          provider,
          phaseId,
          modelId,
          prompt: buildCourseForgePrompt({
            role: "Você planeja microssequências para as lições do AraLearn.",
            sourcePack: JSON.stringify(context.sourceLedger || []),
            task: "Crie microssequências pequenas, progressivas e sem bastidor para cada lição planejada.",
            output: "Responda somente JSON válido com microsequencePlans."
          }),
          schema: null,
          artifacts: [
            { id: "intent", name: "intent", content: JSON.stringify(intent) },
            { id: "lesson-plans", name: "lesson-plans", content: JSON.stringify(context.lessonPlans || []) }
          ]
        });
        context.microsequencePlans = normalizeMicrosequencePlans(response.value || response || {}, context.lessonPlans || []);
        artifactStore.saveArtifact(runId, "microsequence-plans", context.microsequencePlans);
      } else if (phaseId === "audit_microsequences") {
        const localAudit = validateCourseForgeMicrosequencePlans({
          microsequencePlans: context.microsequencePlans || [],
          lessonPlans: context.lessonPlans || []
        });
        if (!localAudit.ok) {
          throw new Error(`Planejamento de microssequências inválido: ${localAudit.errors.join(" ")}`);
        }
        let providerAudit = { approved: true, issues: [], warnings: [] };
        if (provider?.id !== "fake" || provider?.capabilities?.provider === "fake") {
          const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
          const response = await callProviderPhase({
            provider,
            phaseId,
            modelId,
            prompt: buildCourseForgePrompt({
              role: "Você audita o planejamento de microssequências do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Aponte saltos de progressão, duplicações, escopo excessivo e falta de prática distribuída.",
              output: "Responda somente JSON válido com approved, issues e warnings."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "microsequence-plans", name: "microsequence-plans", content: JSON.stringify(context.microsequencePlans || []) }
            ]
          });
          providerAudit = structuredClone(response.value || response || providerAudit);
        }
        context.microsequenceAudit = {
          approved: providerAudit.approved !== false,
          issues: Array.isArray(providerAudit.issues) ? providerAudit.issues : [],
          warnings: [
            ...(localAudit.warnings || []).map((message) => ({ severity: "warning", evidence: message })),
            ...(Array.isArray(providerAudit.warnings) ? providerAudit.warnings : [])
          ]
        };
        const blockingIssues = (context.microsequenceAudit.issues || []).filter((item) => item?.severity !== "warning");
        if (providerAudit.approved === false || blockingIssues.length) {
          throw new Error("Auditoria de microssequências reprovou o planejamento atual.");
        }
        artifactStore.saveArtifact(runId, "microsequence-audit", context.microsequenceAudit);
      } else if (phaseId === "repair_microsequences") {
        context.microsequencePlans = repairCourseForgeMicrosequenceMetadataDeterministically({
          microsequencePlans: context.microsequencePlans || [],
          lessonPlans: context.lessonPlans || []
        });
        let adherenceAudit = auditCourseForgeDomainCoverage({
          microsequencePlans: context.microsequencePlans || [],
          lessonPlans: context.lessonPlans || []
        });
        context.microsequenceAdherenceAudit = adherenceAudit;

        if (hasBlockingIssues(adherenceAudit)) {
          const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
          const response = await callProviderPhase({
            provider,
            phaseId,
            modelId,
            prompt: buildCourseForgePrompt({
              role: "Você repara o planejamento de microssequências do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Corrija apenas lacunas de cobertura didática, domainRefs, practiceVariantRefs e progressão das microssequências, sem gerar cards.",
              output: "Responda somente JSON válido com microsequencePlans."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "lesson-plans", name: "lesson-plans", content: JSON.stringify(context.lessonPlans || []) },
              { id: "microsequence-plans", name: "microsequence-plans", content: JSON.stringify(context.microsequencePlans || []) },
              { id: "microsequence-issues", name: "microsequence-issues", content: JSON.stringify(adherenceAudit.issues || []) }
            ]
          });
          context.microsequencePlans = normalizeMicrosequencePlans(response.value || response || {}, context.lessonPlans || []);
          const structuralAudit = validateCourseForgeMicrosequencePlans({
            microsequencePlans: context.microsequencePlans || [],
            lessonPlans: context.lessonPlans || []
          });
          if (!structuralAudit.ok) {
            throw new Error(`Reparo de microssequências inválido: ${structuralAudit.errors.join(" ")}`);
          }
          adherenceAudit = auditCourseForgeDomainCoverage({
            microsequencePlans: context.microsequencePlans || [],
            lessonPlans: context.lessonPlans || []
          });
          context.microsequenceAdherenceAudit = adherenceAudit;
        }

        artifactStore.saveArtifact(runId, "microsequence-plans", context.microsequencePlans);
        artifactStore.saveArtifact(runId, "microsequence-adherence-audit", context.microsequenceAdherenceAudit);
        if (hasBlockingIssues(context.microsequenceAdherenceAudit)) {
          throw new Error(`Planejamento de microssequências ainda falhou na cobertura didática: ${context.microsequenceAdherenceAudit.issues.map((item) => item.evidence).join(" ")}`);
        }
      } else if (phaseId === "build_microsequence_contract") {
        context.microsequenceContracts = buildCourseForgeMicrosequenceContracts({
          lessonPlans: context.lessonPlans || [],
          microsequencePlans: context.microsequencePlans || [],
          sourceLedger: context.sourceLedger || []
        });
        artifactStore.saveArtifact(runId, "microsequence-contracts", context.microsequenceContracts);
      } else if (phaseId === "build_cards") {
        const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
        context.cardDrafts = [];
        for (const microsequenceContract of context.microsequenceContracts || []) {
          const response = await callProviderPhase({
            provider,
            phaseId,
            modelId,
            prompt: buildCourseForgePrompt({
              role: "Você constrói cards didáticos para uma microssequência do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Gere apenas os cards pedidos, em linguagem didática autossuficiente, sem bastidor e obedecendo o recurso de cada posição.",
              output: "Responda somente JSON válido com cards."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "microsequence-contract", name: "microsequence-contract", content: JSON.stringify(microsequenceContract) }
            ]
          });
          context.cardDrafts.push(normalizeCourseForgeCardsPayload(response.value || response || {}, microsequenceContract));
        }
        artifactStore.saveArtifact(runId, "card-drafts", context.cardDrafts);
      } else if (phaseId === "audit_cards") {
        context.cardsAudit = auditCourseForgeCardDrafts({
          cardDrafts: context.cardDrafts || [],
          microsequenceContracts: context.microsequenceContracts || []
        });
        if (
          Array.isArray(context.cardsAudit?.normalizedDrafts) &&
          context.cardsAudit.normalizedDrafts.length === (context.cardDrafts || []).length
        ) {
          context.cardDrafts = context.cardsAudit.normalizedDrafts;
          artifactStore.saveArtifact(runId, "card-drafts", context.cardDrafts);
        }
        artifactStore.saveArtifact(runId, "cards-audit", context.cardsAudit);
      } else if (phaseId === "audit_source_adherence") {
        const sourceGroundingAudit = auditCourseForgeSourceAdherence({
          cardDrafts: context.cardDrafts || [],
          sourceLedger: context.sourceLedger || []
        });
        const domainCoverageAudit = auditCourseForgeDomainCoverage({
          microsequencePlans: context.microsequencePlans || [],
          lessonPlans: context.lessonPlans || []
        });
        context.sourceAdherenceAudit = mergeCourseForgeAdherenceAudits(sourceGroundingAudit, domainCoverageAudit);
        artifactStore.saveArtifact(runId, "source-adherence-audit", context.sourceAdherenceAudit);
      } else if (phaseId === "repair_cards") {
        const combinedAudit = mergeCardAudits(context.cardsAudit || {}, context.sourceAdherenceAudit || {});
        if (!hasBlockingIssues(combinedAudit)) {
          context.cardsFinal = structuredClone(context.cardDrafts || []);
          artifactStore.saveArtifact(runId, "cards-final", context.cardsFinal);
        } else {
          context.microsequencePlans = repairCourseForgeMicrosequenceMetadataDeterministically({
            microsequencePlans: context.microsequencePlans || [],
            lessonPlans: context.lessonPlans || []
          });
          artifactStore.saveArtifact(runId, "microsequence-plans", context.microsequencePlans);
          let repairedDrafts = repairCourseForgeDraftCardsDeterministically({
            cardDrafts: context.cardDrafts || [],
            sourceLedger: context.sourceLedger || []
          });
          let postRepairCardsAudit = auditCourseForgeCardDrafts({
            cardDrafts: repairedDrafts,
            microsequenceContracts: context.microsequenceContracts || []
          });
          let postRepairSourceAudit = auditCourseForgeSourceAdherence({
            cardDrafts: repairedDrafts,
            sourceLedger: context.sourceLedger || []
          });
          postRepairSourceAudit = mergeCourseForgeAdherenceAudits(
            postRepairSourceAudit,
            auditCourseForgeDomainCoverage({
              microsequencePlans: context.microsequencePlans || [],
              lessonPlans: context.lessonPlans || []
            })
          );

          if (hasBlockingIssues(mergeCardAudits(postRepairCardsAudit, postRepairSourceAudit))) {
            const modelId = resolveModelForCourseForgePhase({ ...intent, phaseId });
            const repairedByProvider = [];
            for (const microsequenceContract of context.microsequenceContracts || []) {
              const currentDraft = repairedDrafts.find((entry) => entry.contractId === microsequenceContract.contractId);
              const relatedIssues = combinedAudit.issues.filter((item) => item?.contractId === microsequenceContract.contractId);
              if (!relatedIssues.length) {
                repairedByProvider.push(structuredClone(currentDraft));
                continue;
              }
              const response = await callProviderPhase({
                provider,
                phaseId,
                modelId,
                prompt: buildCourseForgePrompt({
                  role: "Você repara cards didáticos já planejados para o AraLearn.",
                  sourcePack: JSON.stringify(context.sourceLedger || []),
                  task: "Corrija apenas os problemas apontados pela auditoria, preservando a intenção didática da microssequência.",
                  output: "Responda somente JSON válido com cards."
                }),
                schema: null,
                artifacts: [
                  { id: "intent", name: "intent", content: JSON.stringify(intent) },
                  { id: "microsequence-contract", name: "microsequence-contract", content: JSON.stringify(microsequenceContract) },
                  { id: "card-draft", name: "card-draft", content: JSON.stringify(currentDraft || {}) },
                  { id: "card-issues", name: "card-issues", content: JSON.stringify(relatedIssues) }
                ]
              });
              repairedByProvider.push(normalizeCourseForgeCardsPayload(response.value || response || {}, microsequenceContract));
            }
            repairedDrafts = repairedByProvider;
            postRepairCardsAudit = auditCourseForgeCardDrafts({
              cardDrafts: repairedDrafts,
              microsequenceContracts: context.microsequenceContracts || []
            });
            postRepairSourceAudit = auditCourseForgeSourceAdherence({
              cardDrafts: repairedDrafts,
              sourceLedger: context.sourceLedger || []
            });
            postRepairSourceAudit = mergeCourseForgeAdherenceAudits(
              postRepairSourceAudit,
              auditCourseForgeDomainCoverage({
                microsequencePlans: context.microsequencePlans || [],
                lessonPlans: context.lessonPlans || []
              })
            );
          }

          const finalAudit = mergeCardAudits(postRepairCardsAudit, postRepairSourceAudit);
          context.cardsAudit = postRepairCardsAudit;
          context.sourceAdherenceAudit = postRepairSourceAudit;
          artifactStore.saveArtifact(runId, "cards-audit", context.cardsAudit);
          artifactStore.saveArtifact(runId, "source-adherence-audit", context.sourceAdherenceAudit);
          if (hasBlockingIssues(finalAudit)) {
            throw new Error(`Os cards ainda falharam na auditoria: ${finalAudit.issues.map((item) => item.evidence).join(" ")}`);
          }
          context.cardsFinal = structuredClone(postRepairCardsAudit.normalizedDrafts || repairedDrafts);
          artifactStore.saveArtifact(runId, "cards-final", context.cardsFinal);
        }
      } else if (phaseId === "compile_patch") {
        const cardsByMicrosequenceId = new Map(
          (Array.isArray(context.cardsFinal) ? context.cardsFinal : [])
            .map((entry) => [entry.contractId, entry])
            .filter(([contractId]) => contractId)
        );
        const microsequencePlansWithCards = (context.microsequencePlans || []).map((lessonPlan) => ({
          ...structuredClone(lessonPlan),
          microsequences: (Array.isArray(lessonPlan?.microsequences) ? lessonPlan.microsequences : []).map((microsequence) => {
            const cardsEntry = cardsByMicrosequenceId.get([
              text(lessonPlan?.courseKey),
              text(lessonPlan?.moduleKey),
              text(lessonPlan?.lessonKey),
              text(microsequence?.key)
            ].join("::"));
            return {
              ...structuredClone(microsequence),
              ...(Array.isArray(cardsEntry?.publicCards) ? { publicCards: structuredClone(cardsEntry.publicCards) } : {})
            };
          })
        }));
        context.patch = compileCourseStructureToPatch({
          intent,
          architectureDraft: {
            ...(context.architectureFinal || context.architectureDraft || {}),
            microsequencePlans: microsequencePlansWithCards
          }
        });
        artifactStore.saveArtifact(runId, "patch-final", context.patch);
      } else if (phaseId === "validate_patch") {
        const validation = validateCourseForgePatch(context.patch, { intent });
        if (!validation.ok) {
          throw new Error(validation.errors.join(" "));
        }
      } else if (phaseId === "apply_patch") {
        context.projectDocument = applyCourseForgePatch(context.projectDocument, context.patch, { intent });
        artifactStore.saveArtifact(runId, "project-after-patch", context.projectDocument);
      } else if (phaseId === "final_report") {
        artifactStore.saveArtifact(runId, "final-report", {
          runId,
          status: "completed",
          phases,
          patchOperations: context.patch?.operations?.length || 0,
          requestedGenerationDepth: intent.requestedGenerationDepth,
          executedGenerationDepth: intent.generationDepth,
          deferredGenerationDepth: intent.deferredGenerationDepth,
          deferredPhases
        });
      }

      runState = markCourseForgePhase(runState, phaseId, {
        status: "completed",
        finishedAt: new Date().toISOString()
      });
      artifactStore.saveRun(runId, { runState, intent });
    } catch (error) {
      runState = markCourseForgePhase(runState, phaseId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: {
          message: text(error?.message) || "Falha do CourseForge."
        }
      });
      runState = updateCourseForgeRunState(runState, {
        status: "partial_failure",
        lastError: {
          phaseId,
          message: text(error?.message) || "Falha do CourseForge."
        }
      });
      artifactStore.saveRun(runId, { runState, intent });
      const wrapped = new Error(text(error?.message) || "Falha do CourseForge.");
      wrapped.runState = runState;
      wrapped.runId = runId;
      throw wrapped;
    }
  }

  runState = updateCourseForgeRunState(runState, { status: "completed" });
  artifactStore.saveRun(runId, { runState, intent });
  return {
    runId,
    runState,
    projectDocument: context.projectDocument,
    patch: context.patch,
    artifacts: artifactStore.listArtifacts(runId)
  };
}
