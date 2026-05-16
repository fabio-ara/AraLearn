const OPERATIONS = new Set(["create", "extend", "repair", "replace", "merge", "reorder", "reinforce"]);
const LEVELS = new Set(["project", "course", "module", "lesson", "microsequence"]);
const GENERATION_DEPTHS = new Set(["structure_only", "full_course", "repair_only", "reinforce_only"]);
const IMPLEMENTED_GENERATION_DEPTHS = new Set(["structure_only", "full_course", "repair_only", "reinforce_only"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLooseText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeAttachments(attachments = []) {
  return Array.isArray(attachments)
    ? attachments
        .map((item, index) => ({
          id: text(item?.id) || `attachment_${index + 1}`,
          name: text(item?.name) || `Anexo ${index + 1}`,
          kind: text(item?.kind) || "attachment",
          mimeType: text(item?.mimeType || item?.type) || "application/octet-stream",
          textContent: text(item?.textContent),
          fileRef: text(item?.fileRef)
        }))
        .filter((item) => item.name)
    : [];
}

function scopeTargetExists(projectDocument = {}, scope = {}) {
  const courses = Array.isArray(projectDocument?.courses) ? projectDocument.courses : [];
  if (scope.level === "project") {
    return courses.length > 0;
  }
  const course = courses.find((item) => text(item?.key) === text(scope.courseKey));
  if (!course) {
    return false;
  }
  if (scope.level === "course") {
    return true;
  }
  const moduleValue = (course.modules || []).find((item) => text(item?.key) === text(scope.moduleKey));
  if (!moduleValue) {
    return false;
  }
  if (scope.level === "module") {
    return true;
  }
  const lesson = (moduleValue.lessons || []).find((item) => text(item?.key) === text(scope.lessonKey));
  if (!lesson) {
    return false;
  }
  if (scope.level === "lesson") {
    return true;
  }
  return (lesson.microsequences || []).some((item) => text(item?.key) === text(scope.microsequenceKey));
}

function inferOperation({ requestedOperation, scope, promptText, projectDocument }) {
  if (requestedOperation) {
    return requestedOperation;
  }

  const prompt = normalizeLooseText(promptText);
  const targetExists = scopeTargetExists(projectDocument, scope);

  if (/(reforco|reforço|extra|mais exercicios|mais exercícios|completar lacunas)/.test(prompt)) {
    return "reinforce";
  }
  if (/(reorden|reorgan|mudar a ordem|ajuste a ordem)/.test(prompt)) {
    return "reorder";
  }
  if (/(corrig|repar|consert|revise|audite|verifique)/.test(prompt)) {
    return "repair";
  }
  if (/(substitu|troque tudo|refaca|refaça do zero)/.test(prompt)) {
    return "replace";
  }
  if (/(mescl|integr|incorpor)/.test(prompt)) {
    return "merge";
  }

  return targetExists ? "extend" : "create";
}

function inferRequestedGenerationDepth({ requestedDepth, operation, promptText }) {
  const normalizedRequested = text(requestedDepth);
  if (normalizedRequested) {
    if (!GENERATION_DEPTHS.has(normalizedRequested)) {
      throw new Error(`Profundidade top-down inválida: "${normalizedRequested}".`);
    }
    return normalizedRequested;
  }

  const prompt = normalizeLooseText(promptText);
  if (
    /(so estrutura|só estrutura|apenas estrutura|somente estrutura|sem cards|sem atividades|nao gere conteudo|não gere conteúdo|nao gere microssequencias|não gere microssequências|so modulos|só módulos|so licoes|só lições)/.test(prompt)
  ) {
    return "structure_only";
  }
  if (/(curso completo|pronto para estudar|com atividades|com exercicios|com exercícios|gere tudo|com cards|gere cards|cards prontos)/.test(prompt)) {
    return "full_course";
  }
  if (operation === "repair" || /(revisar|auditar|corrigir|reparar|consertar)/.test(prompt)) {
    return "repair_only";
  }
  if (operation === "reinforce") {
    return "reinforce_only";
  }
  return "full_course";
}

function resolveEffectiveGenerationDepth(requestedDepth) {
  if (IMPLEMENTED_GENERATION_DEPTHS.has(requestedDepth)) {
    return requestedDepth;
  }
  return "structure_only";
}

export function resolveCourseForgeIntent(input = {}) {
  const level = text(input?.scope?.level) || "project";
  if (!LEVELS.has(level)) {
    throw new Error(`Escopo top-down inválido: "${level}".`);
  }

  const scope = {
    level,
    courseKey: text(input?.scope?.courseKey),
    moduleKey: text(input?.scope?.moduleKey),
    lessonKey: text(input?.scope?.lessonKey),
    microsequenceKey: text(input?.scope?.microsequenceKey)
  };
  const promptText = text(input.promptText);
  const operation = inferOperation({
    requestedOperation: text(input.operation),
    scope,
    promptText,
    projectDocument: input.projectDocument
  });
  if (!OPERATIONS.has(operation)) {
    throw new Error(`Operação top-down inválida: "${operation}".`);
  }
  const requestedGenerationDepth = inferRequestedGenerationDepth({
    requestedDepth: input.requestedGenerationDepth || input.generationDepth,
    operation,
    promptText
  });
  const generationDepth = resolveEffectiveGenerationDepth(requestedGenerationDepth);
  const targetExists = scopeTargetExists(input.projectDocument, scope);

  return {
    intentId: "courseforge.intent.v1",
    operation,
    scope,
    promptText,
    rawUserText: promptText,
    goal: promptText,
    audienceLevel: "beginner",
    timeHorizon: "",
    requestedGenerationDepth,
    requestedDepth: requestedGenerationDepth,
    generationDepth,
    deferredGenerationDepth: requestedGenerationDepth === generationDepth ? "" : requestedGenerationDepth,
    attachments: normalizeAttachments(input.attachments),
    selectedTopDownProfileId: text(input.selectedTopDownProfileId) || "codex_all",
    didacticProfileId: text(input.selectedTopDownProfileId) || "codex_all",
    phaseModelOverrides: input.phaseModelOverrides && typeof input.phaseModelOverrides === "object"
      ? structuredClone(input.phaseModelOverrides)
      : {},
    contextSummary: {
      targetExists,
      hasAttachments: normalizeAttachments(input.attachments).length > 0,
      projectHasCourses: Array.isArray(input?.projectDocument?.courses) && input.projectDocument.courses.length > 0
    },
    createdAt: text(input.createdAt) || new Date().toISOString()
  };
}
