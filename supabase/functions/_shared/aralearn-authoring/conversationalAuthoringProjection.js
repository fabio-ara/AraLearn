const PROJECTION_CONTRACT = "aralearn.conversational-authoring-projection.v1";

const CONFLICT_CODES = new Set([
  "audit_context_changed",
  "course_revision_changed",
  "stale_course_state"
]);
const NO_WRITE_STRATEGIES = new Set(["reconnect", "stop"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} precisa ser um objeto.`);
  }
  return value;
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sentence(value) {
  const normalized = optionalText(value);
  if (!normalized) return "";
  return /[.!?…]$/u.test(normalized) ? normalized : `${normalized}.`;
}

function sentences(...values) {
  return values.flat(Infinity).map(sentence).filter(Boolean).join(" ");
}

function normalizedTitle(value) {
  return optionalText(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function humanAction(toolName, data) {
  const deepLink = optionalText(data?.deepLink || data?.course?.deepLink || data?.result?.deepLink);
  if (!deepLink || !new Set(["criarCurso", "alterarCurso", "consultarComponentesDidaticos"])
    .has(toolName)) return null;
  try {
    const url = new URL(deepLink);
    if (!new Set(["https:", "http:"]).has(url.protocol)) return null;
  } catch {
    return null;
  }
  const label = toolName === "criarCurso"
    ? "Abrir o Curso no AraLearn"
    : toolName === "consultarComponentesDidaticos"
      ? "Abrir a prévia no AraLearn"
      : "Abrir a área alterada no AraLearn";
  return { label };
}

function projection(kind, message, {
  includeTechnicalDetails = false,
  technicalDetails = null,
  level = "standard",
  ...fields
} = {}) {
  const visibleMessage = optionalText(message).slice(0, 12_000);
  if (!visibleMessage) throw new TypeError("A projeção conversacional exige uma mensagem.");
  return {
    contract: PROJECTION_CONTRACT,
    kind,
    level: includeTechnicalDetails ? "technical" : level,
    message: visibleMessage,
    ...fields,
    ...(includeTechnicalDetails
      ? { technicalDetails: structuredClone(technicalDetails) }
      : {})
  };
}

function humanChoice(course, index) {
  const title = optionalText(course.title) || "Curso sem título";
  const context = optionalText(
    course.conversationLabel || course.objective || course.goal || course.summary ||
      course.statusLabel
  ).slice(0, 240);
  const updatedAt = optionalText(course.updatedAt);
  let updated = "";
  if (updatedAt) {
    const date = new Date(updatedAt);
    if (!Number.isNaN(date.getTime())) {
      updated = `atualizado em ${date.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`;
    }
  }
  const details = [context, updated].filter(Boolean);
  return details.length
    ? `${title} — ${details.join("; ")}`
    : `${title} — opção ${index + 1}`;
}

function planCount(plan, countField, collectionField) {
  const count = plan?.counts?.[countField];
  if (Number.isSafeInteger(count) && count >= 0) return count;
  return Array.isArray(plan?.[collectionField]) ? plan[collectionField].length : null;
}

function instructionalPlanState(data) {
  const plan = data?.plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const requiredCounts = [
    ["intendedLearningOutcomeCount", "intendedLearningOutcomes", "os resultados de aprendizagem"],
    ["instructionalAnalysisUnitCount", "instructionalAnalysisUnits", "as unidades de análise"],
    ["evidenceRequirementCount", "evidenceRequirements", "os requisitos de evidência"]
  ].map(([countField, collectionField, label]) => ({
    count: planCount(plan, countField, collectionField),
    label
  }));
  const missing = requiredCounts.filter(({ count }) => count === 0).map(({ label }) => label);
  const partCount = planCount(plan, "authoringPartCount", "parts");
  const noContent = planCount(plan, "studyUnitCount", "studyUnits") === 0;
  const nextDecision = missing.length
    ? `completar ${new Intl.ListFormat("pt-BR").format(missing)} antes de produzir conteúdo`
    : "";
  return {
    plan: {
      complete: missing.length ? false : undefined,
      counts: { authoringPartCount: partCount },
      parts: Array.isArray(plan.parts) ? plan.parts : [],
      nextDecision
    },
    ...(noContent ? { materializationCount: 0 } : {})
  };
}

export function resolveConversationalCourseTitle(courses, requestedTitle) {
  if (!Array.isArray(courses)) throw new TypeError("A lista de Cursos precisa ser uma lista.");
  const query = normalizedTitle(requestedTitle);
  if (!query) throw new TypeError("Informe o título do Curso a retomar.");
  const candidates = courses.filter((course) =>
    course && typeof course === "object" && !Array.isArray(course) && optionalText(course.title)
  );
  const exact = candidates.filter((course) => normalizedTitle(course.title) === query);
  const matches = exact.length ? exact : candidates.filter((course) => {
    const title = normalizedTitle(course.title);
    return title.includes(query) || query.includes(title);
  });
  return {
    status: matches.length === 1 ? "matched" : matches.length > 1 ? "ambiguous" : "not_found",
    requestedTitle: optionalText(requestedTitle),
    match: matches.length === 1 ? matches[0] : null,
    matches
  };
}

export function projectConversationalAuthoringResumption({
  resolution,
  state = null,
  includeTechnicalDetails = false
}) {
  record(resolution, "A resolução do Curso");
  if (resolution.status === "not_found") {
    return projection(
      "resumption_not_found",
      `Não encontrei um Curso próprio correspondente a “${optionalText(resolution.requestedTitle)}”. Confira o título ou descreva qual Curso deseja continuar.`,
      {
        includeTechnicalDetails,
        technicalDetails: { resolution, state },
        needsHumanDecision: true
      }
    );
  }
  if (resolution.status === "ambiguous") {
    const choices = resolution.matches.map(humanChoice);
    return projection(
      "resumption_disambiguation",
      sentences(
        "Encontrei mais de um Curso com esse título. Qual deles você quer continuar?",
        choices.map((choice, index) => `${index + 1}. ${choice}`)
      ),
      {
        includeTechnicalDetails,
        technicalDetails: { resolution, state },
        needsHumanDecision: true,
        choices
      }
    );
  }
  if (resolution.status !== "matched" || !resolution.match) {
    throw new TypeError("A resolução do Curso é inválida.");
  }
  if (state == null) {
    return projection(
      "resumption",
      `Localizei “${optionalText(resolution.match.title)}” entre seus Cursos. Vou reler o estado atual antes de propor a continuação.`,
      {
        includeTechnicalDetails,
        technicalDetails: { resolution, state },
        needsHumanDecision: false
      }
    );
  }
  const authoringState = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  const plan = authoringState.plan && typeof authoringState.plan === "object"
    ? authoringState.plan
    : {};
  const planComplete = authoringState.planningComplete ?? plan.complete;
  const partCount = authoringState.partCount ?? plan.partCount ??
    plan.counts?.authoringPartCount ?? (Array.isArray(plan.parts) ? plan.parts.length : undefined);
  const materializationCount = authoringState.materializationCount ??
    plan.materializationCount ?? (Array.isArray(plan.parts)
      ? plan.parts.reduce((count, part) => count +
        (Array.isArray(part?.progress?.materializations)
          ? part.progress.materializations.length
          : 0), 0)
      : undefined);
  const nextDecision = optionalText(authoringState.nextDecision || plan.nextDecision);
  return projection(
    "resumption",
    sentences(
      `Retomei “${optionalText(resolution.match.title)}” pelo estado atual`,
      planComplete === false ? "Planejamento incompleto" : planComplete === true
        ? "Planejamento completo"
        : "",
      Number.isSafeInteger(partCount) && partCount >= 0
        ? `${partCount} ${partCount === 1 ? "Parte permanece definida" : "Partes permanecem definidas"}`
        : "",
      materializationCount === 0 ? "Nenhum conteúdo foi produzido" : "",
      nextDecision ? `Próxima decisão: ${nextDecision}` : ""
    ),
    {
      includeTechnicalDetails,
      technicalDetails: { resolution, state },
      needsHumanDecision: Boolean(nextDecision)
    }
  );
}

export function projectConversationalAuthoringConfirmation({
  change,
  reason = "",
  preserved = "",
  materialization = "",
  question = "Confirmo?",
  command = null,
  includeTechnicalDetails = false
}) {
  const changeText = sentence(change);
  if (!changeText) throw new TypeError("A confirmação precisa descrever a mudança.");
  return projection(
    "confirmation",
    sentences(changeText, reason, preserved, materialization, question),
    {
      includeTechnicalDetails,
      technicalDetails: { command },
      needsHumanDecision: true
    }
  );
}

export function projectConversationalAuthoringSuccess({
  envelope,
  summary = {},
  toolName = "",
  includeTechnicalDetails = false
}) {
  const raw = record(envelope, "O envelope de sucesso");
  if (raw.ok !== true) throw new TypeError("O envelope não confirma sucesso.");
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
    ? raw.data
    : {};
  const outcome = optionalText(summary.outcome) || (data.idempotent === true
    ? "A alteração já estava gravada e foi validada."
    : data.changed === false
      ? "O estado atual foi conferido; nenhuma alteração era necessária."
      : "A alteração foi gravada e validada.");
  const action = humanAction(toolName, data);
  return projection(
    "success",
    sentences(
      outcome,
      summary.change,
      summary.reason,
      summary.preserved,
      summary.materialization,
      summary.nextDecision ? `Próxima decisão: ${optionalText(summary.nextDecision)}` : ""
    ),
    {
      includeTechnicalDetails,
      technicalDetails: { envelope },
      level: "operational",
      success: true,
      ...(action ? { action } : {})
    }
  );
}

export function projectConversationalAuthoringToolSuccess({
  toolName,
  rawArguments = {},
  envelope,
  summary = {}
}) {
  const query = optionalText(rawArguments?.query);
  if (toolName === "listarCursos" && query && Array.isArray(envelope?.data?.items)) {
    return projectConversationalAuthoringResumption({
      resolution: resolveConversationalCourseTitle(envelope.data.items, query)
    });
  }
  if (toolName === "lerCurso" && rawArguments?.view === "instructional_plan") {
    const title = optionalText(
      envelope?.data?.plan?.title || envelope?.data?.title || envelope?.data?.course?.title
    );
    const state = instructionalPlanState(envelope?.data);
    if (title && state) {
      return projectConversationalAuthoringResumption({
        resolution: {
          status: "matched",
          requestedTitle: title,
          match: { title },
          matches: [{ title }]
        },
        state
      });
    }
  }
  return projectConversationalAuthoringSuccess({ envelope, summary, toolName });
}

function semanticError(error) {
  const code = optionalText(error.code).toLowerCase();
  const strategy = optionalText(error.recovery?.strategy).toLowerCase();
  if (CONFLICT_CODES.has(code) || strategy === "reread_and_retry") return "conflict";
  if (strategy === "split_and_retry" || /(?:too_large|quota|limit)/u.test(code)) return "limit";
  if (strategy === "correct_and_retry" || /(?:invalid|validation)/u.test(code)) {
    return "validation";
  }
  if (strategy === "reconnect" ||
      /(?:authentication|authorization|forbidden|insufficient_scope|permission)/u.test(code)) {
    return "access";
  }
  if (strategy === "repeat_identical" || /(?:internal|network|timeout|unavailable)/u.test(code)) {
    return "uncertain";
  }
  return "failure";
}

function writeStateFor(error, classification, requested) {
  if (["none", "partial", "complete", "unknown"].includes(requested)) return requested;
  if (classification === "conflict" || classification === "validation" ||
      classification === "limit" || classification === "access" ||
      NO_WRITE_STRATEGIES.has(optionalText(error.recovery?.strategy))) {
    return "none";
  }
  return "unknown";
}

export function projectConversationalAuthoringError({
  envelope,
  failure = {},
  failedCall = null,
  includeTechnicalDetails = false
}) {
  const raw = record(envelope, "O envelope de erro");
  if (raw.ok !== false) throw new TypeError("O envelope não representa uma falha.");
  const error = raw.error && typeof raw.error === "object" && !Array.isArray(raw.error)
    ? raw.error
    : {};
  const classification = semanticError(error);
  const writeState = writeStateFor(error, classification, failure.writeState);
  const recoveryStrategy = optionalText(error.recovery?.strategy).toLowerCase();
  const concurrencyConflict = classification === "conflict";
  const reloadRequired = concurrencyConflict || recoveryStrategy === "reread_and_retry";
  const retrySafe = concurrencyConflict || recoveryStrategy === "repeat_identical" ||
    error.recovery?.retryable === true && new Set([
      "correct_and_retry", "reconnect", "split_and_retry"
    ]).has(recoveryStrategy);
  let message;
  if (classification === "conflict") {
    message = sentences(
      "O Curso mudou desde a última leitura",
      "Nada foi sobrescrito com o estado antigo",
      failure.nextStep || "Vou reler o estado atual antes de continuar"
    );
  } else if (writeState === "unknown") {
    message = sentences(
      "Não foi possível confirmar o resultado da operação",
      "Não vou tratá-la como concluída",
      failure.nextStep || "Confira o estado atual antes de tentar novamente"
    );
  } else if (writeState === "complete") {
    message = sentences(
      "A gravação foi concluída, mas a resposta não pôde ser entregue integralmente",
      failure.nextStep || "Confira o estado atual antes de continuar"
    );
  } else if (writeState === "partial") {
    message = sentences(
      "A operação foi concluída apenas em parte",
      failure.notSaved || "Ainda há mudanças não salvas",
      failure.nextStep || "Confira o que foi gravado antes de continuar"
    );
  } else {
    message = sentences(
      failure.task || "A operação de autoria não foi concluída",
      failure.notSaved || "Nada foi salvo",
      failure.nextStep || (classification === "limit"
        ? "Reduza o tamanho da operação e tente novamente"
        : classification === "access"
          ? recoveryStrategy === "reconnect"
            ? "Reconecte a conta antes de continuar"
            : "A conta conectada não possui a permissão necessária; só continue quando ela estiver disponível"
          : "Revise a proposta antes de tentar novamente")
    );
  }
  return projection(
    "error",
    message,
    {
      includeTechnicalDetails,
      technicalDetails: { envelope, failedCall },
      level: "diagnostic",
      success: false,
      classification,
      writeState,
      retrySafe,
      reloadRequired,
      concurrencyConflict
    }
  );
}

export { PROJECTION_CONTRACT };
