export const COURSE_CONTRACT = "aralearn.course.v1";
export const CARD_ROLES = Object.freeze(["theory", "practice"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function validateCardEnvelope(card, registry, path = "$.card") {
  const errors = [];
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    return { valid: false, errors: [`${path} precisa ser um objeto.`] };
  }
  const allowedKeys = new Set(["id", "position", "title", "role", "content", "response", "feedback"]);
  Object.keys(card).forEach((key) => {
    if (!allowedKeys.has(key)) errors.push(`${path}.${key} não pertence ao envelope.`);
  });
  if (!text(card.id)) errors.push(`${path}.id é obrigatório.`);
  if (!Number.isInteger(card.position) || card.position < 1) errors.push(`${path}.position precisa ser inteiro positivo.`);
  if (!text(card.title)) errors.push(`${path}.title é obrigatório.`);
  if (!CARD_ROLES.includes(card.role)) errors.push(`${path}.role precisa ser theory ou practice.`);
  if (!Array.isArray(card.content) || card.content.length === 0) {
    errors.push(`${path}.content precisa de ao menos uma instância.`);
  }
  if (!Array.isArray(card.feedback)) errors.push(`${path}.feedback precisa ser uma lista.`);
  if (card.role === "theory" && card.response !== null) {
    errors.push(`${path}.response precisa ser null em card de teoria.`);
  }
  if (card.role === "practice" && (!card.response || typeof card.response !== "object")) {
    errors.push(`${path}.response é obrigatório em card de prática.`);
  }
  const ids = new Set();
  const validateSlot = (instance, slot, instancePath) => {
    const id = text(instance?.id);
    if (id && ids.has(id)) errors.push(`${instancePath}.id está duplicado no card.`);
    if (id) ids.add(id);
    const result = registry?.validateInstance?.(instance, slot);
    if (!result || result.valid !== true) {
      (result?.errors || ["Registry de packages indisponível."]).forEach((error) => {
        errors.push(`${instancePath}: ${error}`);
      });
    }
  };
  list(card.content).forEach((instance, index) => validateSlot(instance, "content", `${path}.content[${index}]`));
  if (card.response && typeof card.response === "object") validateSlot(card.response, "response", `${path}.response`);
  list(card.feedback).forEach((instance, index) => validateSlot(instance, "feedback", `${path}.feedback[${index}]`));
  return { valid: errors.length === 0, errors };
}

export function normalizeCardEnvelope(card, registry) {
  const normalized = {
    id: text(card?.id),
    position: Number(card?.position),
    title: text(card?.title),
    role: text(card?.role),
    content: list(card?.content).map((instance) => registry.normalizeInstance(instance, "content")),
    response: card?.response ? registry.normalizeInstance(card.response, "response") : null,
    feedback: list(card?.feedback).map((instance) => registry.normalizeInstance(instance, "feedback"))
  };
  const validation = validateCardEnvelope(normalized, registry);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return normalized;
}

export function renderCardEnvelope(card, registry, options = {}) {
  const validation = validateCardEnvelope(card, registry);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  const renderList = (instances, slot) => instances.map((instance) => (
    `<section class="package-instance" data-package="${instance.package}" data-package-version="${instance.version}" data-package-instance-id="${instance.id}">` +
    registry.renderInstance(instance, slot, options) +
    "</section>"
  )).join("");
  return {
    contentHtml: renderList(card.content, "content"),
    responseHtml: card.response ? renderList([card.response], "response") : "",
    feedbackHtml: renderList(card.feedback, "feedback"),
    accessibleText: [
      ...card.content.map((instance) => registry.accessibleText(instance, "content")),
      ...(card.response ? [registry.accessibleText(card.response, "response")] : []),
      ...card.feedback.map((instance) => registry.accessibleText(instance, "feedback"))
    ].filter(Boolean).join(" ")
  };
}

export function cloneCardEnvelope(card) {
  return clone(card);
}
