const PHASE_LABELS = Object.freeze({
  normalize_intent: "Interpretando pedido e escopo",
  index_sources: "Lendo anexos e fontes",
  build_assessment_profile: "Montando perfil avaliativo",
  plan_architecture: "Planejando arquitetura do curso",
  audit_architecture: "Auditando arquitetura",
  repair_architecture: "Reparando arquitetura",
  plan_lessons: "Detalhando lições",
  build_course_graph: "Montando mapa semântico",
  audit_course_graph: "Auditando mapa semântico",
  repair_course_graph: "Reparando mapa semântico",
  build_lesson_governance: "Definindo governança das lições",
  plan_microsequences: "Planejando microssequências",
  audit_microsequences: "Auditando microssequências",
  repair_microsequences: "Reparando microssequências",
  audit_prerequisites: "Checando pré-requisitos",
  compile_patch: "Compilando patch",
  validate_patch: "Validando patch",
  apply_patch: "Aplicando estrutura",
  final_report: "Fechando relatório"
});

export const COURSE_FORGE_PROGRESS_PHASE_IDS = Object.freeze(Object.keys(PHASE_LABELS));

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getCourseForgePhaseLabel(phaseId = "") {
  const normalized = text(phaseId);
  return PHASE_LABELS[normalized] || normalized || "Preparando geração";
}

export function listCourseForgeProgressPhases(phaseCount = 0) {
  const normalizedCount = Number.isFinite(Number(phaseCount)) ? Number(phaseCount) : 0;
  const resolvedCount = normalizedCount > 0 ? normalizedCount : COURSE_FORGE_PROGRESS_PHASE_IDS.length;
  return Array.from({ length: resolvedCount }, (_, index) => {
    const phaseId = COURSE_FORGE_PROGRESS_PHASE_IDS[index] || `phase_${index + 1}`;
    return {
      phaseId,
      phaseLabel: COURSE_FORGE_PROGRESS_PHASE_IDS[index] ? getCourseForgePhaseLabel(phaseId) : `Etapa ${index + 1}`
    };
  });
}

export function summarizeCourseForgeProgressStatus(progress = {}) {
  const history = Array.isArray(progress?.history) ? progress.history : [];
  const lastProviderEvent = [...history].reverse().find((item) =>
    ["provider_call_started", "provider_call_completed", "provider_call_failed"].includes(text(item?.type))
  );
  const lastCompletedPhase = [...history].reverse().find((item) => text(item?.type) === "phase_completed");
  const message = text(progress?.message);

  if (progress?.status === "failed") {
    return message || "A geração top-down falhou.";
  }
  if (progress?.status === "completed") {
    return "Estrutura concluída e aplicada.";
  }
  if (lastProviderEvent?.type === "provider_call_started") {
    return text(progress?.modelId)
      ? `Aguardando resposta do modelo ${text(progress.modelId)}.`
      : "Aguardando resposta do modelo.";
  }
  if (lastProviderEvent?.type === "provider_call_completed" && lastCompletedPhase?.phaseLabel) {
    return `${lastCompletedPhase.phaseLabel} concluído. Preparando próxima etapa.`;
  }
  if (lastCompletedPhase?.phaseLabel) {
    return `${lastCompletedPhase.phaseLabel} concluído.`;
  }
  return message || "Preparando geração.";
}

function eventTimestamp(event = {}) {
  return text(event.timestamp) || new Date().toISOString();
}

function buildEventMessage(event = {}) {
  const phaseLabel = getCourseForgePhaseLabel(event.phaseId);
  const modelId = text(event.modelId);

  if (event.type === "provider_call_started") {
    return modelId
      ? `Chamada ao modelo: ${phaseLabel} (${modelId}).`
      : `Chamada ao modelo: ${phaseLabel}.`;
  }
  if (event.type === "provider_call_completed") {
    return modelId
      ? `Chamada concluída: ${phaseLabel} (${modelId}).`
      : `Chamada concluída: ${phaseLabel}.`;
  }
  if (event.type === "phase_started") {
    return modelId
      ? `${phaseLabel}. Pode envolver chamada ao modelo ${modelId}.`
      : `${phaseLabel}. Etapa local do motor.`;
  }
  if (event.type === "phase_completed") {
    return `${phaseLabel} concluído.`;
  }
  if (event.type === "run_completed") {
    return "Estrutura top-down concluída.";
  }
  if (event.type === "run_failed") {
    return text(event.message) || "A geração top-down falhou.";
  }
  return text(event.message) || phaseLabel;
}

export function createCourseForgeGenerationProgressState(patch = {}) {
  return {
    visible: patch.visible === true,
    status: text(patch.status) || "idle",
    phaseId: text(patch.phaseId),
    phaseLabel: text(patch.phaseLabel),
    message: text(patch.message),
    modelId: text(patch.modelId),
    phaseIndex: Number.isFinite(Number(patch.phaseIndex)) ? Number(patch.phaseIndex) : 0,
    phaseCount: Number.isFinite(Number(patch.phaseCount)) ? Number(patch.phaseCount) : 0,
    history: Array.isArray(patch.history) ? patch.history.slice(-6) : []
  };
}

export function reduceCourseForgeGenerationProgress(current = {}, event = {}) {
  const type = text(event.type);
  const status =
    type === "run_completed"
      ? "completed"
      : type === "run_failed" || type === "provider_call_failed" || type === "phase_failed"
        ? "failed"
        : "running";
  const phaseId = text(event.phaseId || current.phaseId);
  const entry = {
    type,
    phaseId,
    phaseLabel: getCourseForgePhaseLabel(phaseId),
    message: buildEventMessage(event),
    modelId: text(event.modelId),
    timestamp: eventTimestamp(event)
  };

  return createCourseForgeGenerationProgressState({
    ...current,
    visible: type !== "run_started" || current.visible !== false,
    status,
    phaseId,
    phaseLabel: entry.phaseLabel,
    message: entry.message,
    modelId: entry.modelId,
    phaseIndex: Number.isFinite(Number(event.phaseIndex)) ? Number(event.phaseIndex) : Number(current.phaseIndex || 0),
    phaseCount: Number.isFinite(Number(event.phaseCount)) ? Number(event.phaseCount) : Number(current.phaseCount || 0),
    history: [...(Array.isArray(current.history) ? current.history : []), entry].slice(-6)
  });
}
