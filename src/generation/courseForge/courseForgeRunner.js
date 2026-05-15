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
import { mergeCourseForgeArchitectureAudits, validateCourseForgeArchitectureDraft } from "./courseForgeValidation.js";
import { resolveModelForCourseForgePhase } from "../modelProfiles/modelRouting.js";

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
        const modelId = resolveModelForCourseForgePhase(intent);
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
          const modelId = resolveModelForCourseForgePhase(intent, phaseId);
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
          const modelId = resolveModelForCourseForgePhase(intent, phaseId);
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
      } else if (phaseId === "compile_patch") {
        context.patch = compileCourseStructureToPatch({
          intent,
          architectureDraft: context.architectureFinal || context.architectureDraft || {}
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
