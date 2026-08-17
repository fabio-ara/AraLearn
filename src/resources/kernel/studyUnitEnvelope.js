export const COURSE_CONTRACT = "aralearn.course.v1";
export const STUDY_UNIT_ROLES = Object.freeze(["theory", "practice"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function comparablePrompt(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");
}

export function validateStudyUnitEnvelope(studyUnit, registry, path = "$.studyUnit") {
  const errors = [];
  if (!studyUnit || typeof studyUnit !== "object" || Array.isArray(studyUnit)) {
    return { valid: false, errors: [`${path} precisa ser um objeto.`] };
  }
  const allowedKeys = new Set([
    "id", "position", "title", "role", "content", "response", "feedback", "topics", "sources"
  ]);
  Object.keys(studyUnit).forEach((key) => {
    if (!allowedKeys.has(key)) errors.push(`${path}.${key} não pertence ao envelope.`);
  });
  if (!text(studyUnit.id)) errors.push(`${path}.id é obrigatório.`);
  if (!Number.isInteger(studyUnit.position) || studyUnit.position < 1) errors.push(`${path}.position precisa ser inteiro positivo.`);
  if (!text(studyUnit.title)) errors.push(`${path}.title é obrigatório.`);
  if (!STUDY_UNIT_ROLES.includes(studyUnit.role)) errors.push(`${path}.role precisa ser theory ou practice.`);
  if (!Array.isArray(studyUnit.content)) {
    errors.push(`${path}.content precisa ser uma lista.`);
  } else if (studyUnit.role === "theory" && studyUnit.content.length === 0) {
    errors.push(`${path}.content precisa de ao menos uma instância em Unidade de estudo de teoria.`);
  }
  if (!Array.isArray(studyUnit.feedback)) errors.push(`${path}.feedback precisa ser uma lista.`);
  for (const field of ["topics", "sources"]) {
    if (!Array.isArray(studyUnit[field]) || studyUnit[field].some((item) => !text(item))) {
      errors.push(`${path}.${field} precisa ser uma lista de textos não vazios.`);
    } else if (new Set(studyUnit[field]).size !== studyUnit[field].length) {
      errors.push(`${path}.${field} não aceita duplicatas.`);
    }
  }
  if (studyUnit.role === "theory" && studyUnit.response !== null) {
    errors.push(`${path}.response precisa ser null em Unidade de estudo de teoria.`);
  }
  if (studyUnit.role === "practice" && (!studyUnit.response || typeof studyUnit.response !== "object")) {
    errors.push(`${path}.response é obrigatório em Unidade de estudo de prática.`);
  }
  if (studyUnit.response?.package === "aralearn.response.choice") {
    const question = comparablePrompt(studyUnit.response.data?.question);
    const repeatsQuestion = list(studyUnit.content).some((instance) => (
      instance?.package === "aralearn.resource.paragraph" &&
      comparablePrompt(instance.data?.text) === question
    ));
    if (question && repeatsQuestion) {
      errors.push(`${path}.content não pode repetir a mesma pergunta de response.choice.`);
    }
  }
  const ids = new Set();
  const validateSlot = (instance, slot, instancePath) => {
    const id = text(instance?.id);
    if (id && ids.has(id)) errors.push(`${instancePath}.id está duplicado na Unidade de estudo.`);
    if (id) ids.add(id);
    const result = registry?.validateInstance?.(instance, slot);
    if (!result || result.valid !== true) {
      (result?.errors || ["Registry de packages indisponível."]).forEach((error) => {
        errors.push(`${instancePath}: ${error}`);
      });
    }
  };
  list(studyUnit.content).forEach((instance, index) => validateSlot(instance, "content", `${path}.content[${index}]`));
  if (studyUnit.response && typeof studyUnit.response === "object") validateSlot(studyUnit.response, "response", `${path}.response`);
  list(studyUnit.feedback).forEach((instance, index) => validateSlot(instance, "feedback", `${path}.feedback[${index}]`));
  if (errors.length === 0) {
    (registry?.validateStudyUnitRelations?.(studyUnit) || []).forEach((error) => {
      errors.push(`${path}: ${error}`);
    });
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeStudyUnitEnvelope(studyUnit, registry) {
  const normalized = {
    id: text(studyUnit?.id),
    position: Number(studyUnit?.position),
    title: text(studyUnit?.title),
    role: text(studyUnit?.role),
    content: list(studyUnit?.content).map((instance) => registry.normalizeInstance(instance, "content")),
    response: studyUnit?.response ? registry.normalizeInstance(studyUnit.response, "response") : null,
    feedback: list(studyUnit?.feedback).map((instance) => registry.normalizeInstance(instance, "feedback")),
    topics: [...new Set(list(studyUnit?.topics).map(text).filter(Boolean))],
    sources: [...new Set(list(studyUnit?.sources).map(text).filter(Boolean))]
  };
  const validation = validateStudyUnitEnvelope(normalized, registry);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return normalized;
}

export function renderStudyUnitEnvelope(studyUnit, registry, options = {}) {
  const validation = validateStudyUnitEnvelope(studyUnit, registry);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  const renderList = (instances, slot) => instances.map((instance) => (
    `<section class="package-instance" data-package="${instance.package}" data-package-version="${instance.version}" data-package-instance-id="${instance.id}">` +
    registry.renderInstance(instance, slot, { ...options, studyUnit }) +
    "</section>"
  )).join("");
  return {
    contentHtml: renderList(studyUnit.content, "content"),
    responseHtml: studyUnit.response ? renderList([studyUnit.response], "response") : "",
    feedbackHtml: renderList(studyUnit.feedback, "feedback"),
    accessibleText: [
      ...studyUnit.content.map((instance) => registry.accessibleText(instance, "content")),
      ...(studyUnit.response ? [registry.accessibleText(studyUnit.response, "response")] : []),
      ...studyUnit.feedback.map((instance) => registry.accessibleText(instance, "feedback"))
    ].filter(Boolean).join(" ")
  };
}

export function cloneStudyUnitEnvelope(studyUnit) {
  return clone(studyUnit);
}
