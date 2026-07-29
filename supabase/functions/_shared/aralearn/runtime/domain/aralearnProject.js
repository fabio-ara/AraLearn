import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import { validateCard } from "./cards.js";

export const PROJECT_CONTRACT = "aralearn.contract";
export const PROJECT_VERSION = 4;

const PROJECT_SCOPES = new Set(["course", "module", "lesson", "microsequence"]);
const MICROSEQUENCE_ROLES = new Set(["explain", "practice", "review", "support"]);
const MICROSEQUENCE_STATUSES = new Set(["planned", "generated", "needs_review", "ready"]);
const TOPIC_KINDS = new Set(["concept", "procedure", "representation", "term"]);

const ROOT_FIELDS = new Set(["contract", "version", "kind", "scope", "courses"]);
const COURSE_FIELDS = new Set(["id", "title", "goal", "modules"]);
const MODULE_FIELDS = new Set(["id", "title", "guide", "lessons"]);
const LESSON_FIELDS = new Set(["id", "title", "guide", "topics", "microsequences"]);
const GUIDE_FIELDS = new Set(["goal", "include", "exclude", "notation", "avoid"]);
const TOPIC_FIELDS = new Set(["id", "label", "kind", "checks", "errors"]);
const MICROSEQUENCE_FIELDS = new Set([
  "id",
  "title",
  "goal",
  "role",
  "status",
  "branchOf",
  "dependsOn",
  "covers",
  "checks",
  "errors",
  "cards"
]);

function hasOwn(value, fieldName) {
  return Object.prototype.hasOwnProperty.call(value, fieldName);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function rejectUnknownFields(value, allowedFields, path, errors) {
  Object.keys(value).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema: "${fieldName}".`);
    }
  });
}

function validateRequiredText(value, fieldName, path, errors, label = fieldName) {
  const fieldPath = `${path}.${fieldName}`;
  if (!hasOwn(value, fieldName) || typeof value[fieldName] !== "string" || !text(value[fieldName])) {
    pushError(errors, fieldPath, `${label} é obrigatório e deve ser texto não vazio.`);
    return "";
  }
  return text(value[fieldName]);
}

function validateRequiredArray(value, fieldName, path, errors) {
  const fieldPath = `${path}.${fieldName}`;
  if (!hasOwn(value, fieldName) || !Array.isArray(value[fieldName])) {
    pushError(errors, fieldPath, `${fieldName} é obrigatório e deve ser array.`);
    return [];
  }
  return value[fieldName];
}

function validateStringList(value, fieldName, path, errors, { required = true } = {}) {
  if (!hasOwn(value, fieldName)) {
    if (required) {
      pushError(errors, `${path}.${fieldName}`, `${fieldName} é obrigatório e deve ser array de textos.`);
    }
    return [];
  }
  if (!Array.isArray(value[fieldName])) {
    pushError(errors, `${path}.${fieldName}`, `${fieldName} deve ser array de textos.`);
    return [];
  }

  const normalized = [];
  const seen = new Set();
  value[fieldName].forEach((item, index) => {
    const itemPath = `${path}.${fieldName}[${index}]`;
    const normalizedItem = text(item);
    if (!normalizedItem) {
      pushError(errors, itemPath, "Item deve ser texto não vazio.");
      return;
    }
    const token = normalizedItem.toLocaleLowerCase("pt-BR");
    if (seen.has(token)) {
      pushError(errors, itemPath, `Item duplicado: "${normalizedItem}".`);
      return;
    }
    seen.add(token);
    normalized.push(normalizedItem);
  });
  return normalized;
}

function validateSiblingIds(items, path, errors, entityLabel) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      return;
    }
    const id = text(item.id);
    if (!id) {
      return;
    }
    if (seen.has(id)) {
      pushError(errors, `${path}[${index}].id`, `id duplicado entre ${entityLabel}: "${id}".`);
      return;
    }
    seen.add(id);
  });
}

function validateLessonCardIds(microsequences, path, errors) {
  const seen = new Set();
  microsequences.forEach((microsequence, microsequenceIndex) => {
    if (!isPlainObject(microsequence) || !Array.isArray(microsequence.cards)) {
      return;
    }
    microsequence.cards.forEach((card, cardIndex) => {
      if (!isPlainObject(card)) {
        return;
      }
      const id = text(card.id);
      if (!id) {
        return;
      }
      if (seen.has(id)) {
        pushError(
          errors,
          `${path}[${microsequenceIndex}].cards[${cardIndex}].id`,
          `id duplicado entre cards da lição: "${id}".`
        );
        return;
      }
      seen.add(id);
    });
  });
}

function validateGuide(value, path, errors) {
  if (!isPlainObject(value)) {
    pushError(errors, path, "guide é obrigatório e deve ser objeto.");
    return { goal: "", include: [], exclude: [], notation: [], avoid: [] };
  }
  rejectUnknownFields(value, GUIDE_FIELDS, path, errors);
  return {
    goal: validateRequiredText(value, "goal", path, errors, "guide.goal"),
    include: validateStringList(value, "include", path, errors),
    exclude: validateStringList(value, "exclude", path, errors),
    notation: validateStringList(value, "notation", path, errors),
    avoid: validateStringList(value, "avoid", path, errors)
  };
}

function validateTopic(topic, path, errors) {
  if (!isPlainObject(topic)) {
    pushError(errors, path, "topic deve ser objeto.");
    return null;
  }
  rejectUnknownFields(topic, TOPIC_FIELDS, path, errors);
  const id = validateRequiredText(topic, "id", path, errors, "topic.id");
  const label = validateRequiredText(topic, "label", path, errors, "topic.label");
  const kind = validateRequiredText(topic, "kind", path, errors, "topic.kind");
  if (kind && !TOPIC_KINDS.has(kind)) {
    pushError(errors, `${path}.kind`, `topic.kind inválido: "${kind}".`);
  }
  return {
    id,
    label,
    kind,
    checks: validateStringList(topic, "checks", path, errors),
    errors: validateStringList(topic, "errors", path, errors)
  };
}

function validateMicrosequence(microsequence, path, errors) {
  if (!isPlainObject(microsequence)) {
    pushError(errors, path, "Microssequência deve ser objeto.");
    return null;
  }
  rejectUnknownFields(microsequence, MICROSEQUENCE_FIELDS, path, errors);
  const id = validateRequiredText(microsequence, "id", path, errors, "microsequence.id");
  const title = validateRequiredText(microsequence, "title", path, errors, "microsequence.title");
  const goal = validateRequiredText(microsequence, "goal", path, errors, "microsequence.goal");
  const role = validateRequiredText(microsequence, "role", path, errors, "microsequence.role");
  if (role && !MICROSEQUENCE_ROLES.has(role)) {
    pushError(errors, `${path}.role`, `role de microssequência inválido: "${role}".`);
  }
  const status = validateRequiredText(microsequence, "status", path, errors, "microsequence.status");
  if (status && !MICROSEQUENCE_STATUSES.has(status)) {
    pushError(errors, `${path}.status`, `status de microssequência inválido: "${status}".`);
  }

  let branchOf = null;
  if (hasOwn(microsequence, "branchOf")) {
    if (microsequence.branchOf !== null && (!text(microsequence.branchOf) || typeof microsequence.branchOf !== "string")) {
      pushError(errors, `${path}.branchOf`, "branchOf deve ser null ou um id textual não vazio.");
    } else {
      branchOf = text(microsequence.branchOf) || null;
    }
  }

  const cardInputs = validateRequiredArray(microsequence, "cards", path, errors);
  const cards = cardInputs
    .map((card, index) => {
      const cardPath = `${path}.cards[${index}]`;
      if (isPlainObject(card)) {
        validateRequiredText(card, "id", cardPath, errors, "card.id");
      }
      const result = validateCard(card, cardPath);
      if (!result.ok) {
        result.errors.forEach((error) => errors.push(error));
        return null;
      }
      return result.value;
    })
    .filter(Boolean);
  if (status && status !== "planned" && !cards.length) {
    pushError(errors, `${path}.cards`, "Microssequência materializada precisa ter cards.");
  }

  return {
    id,
    title,
    goal,
    role,
    status,
    branchOf,
    dependsOn: validateStringList(microsequence, "dependsOn", path, errors),
    covers: validateStringList(microsequence, "covers", path, errors),
    checks: validateStringList(microsequence, "checks", path, errors),
    errors: validateStringList(microsequence, "errors", path, errors, { required: false }),
    cards
  };
}

function validateLesson(lesson, path, errors) {
  if (!isPlainObject(lesson)) {
    pushError(errors, path, "Lição deve ser objeto.");
    return null;
  }
  rejectUnknownFields(lesson, LESSON_FIELDS, path, errors);
  const topicsInput = validateRequiredArray(lesson, "topics", path, errors);
  const microsequencesInput = validateRequiredArray(lesson, "microsequences", path, errors);
  validateSiblingIds(topicsInput, `${path}.topics`, errors, "topics da lição");
  validateSiblingIds(microsequencesInput, `${path}.microsequences`, errors, "microssequências da lição");
  validateLessonCardIds(microsequencesInput, `${path}.microsequences`, errors);
  return {
    id: validateRequiredText(lesson, "id", path, errors, "lesson.id"),
    title: validateRequiredText(lesson, "title", path, errors, "lesson.title"),
    guide: validateGuide(lesson.guide, `${path}.guide`, errors),
    topics: topicsInput
      .map((topic, index) => validateTopic(topic, `${path}.topics[${index}]`, errors))
      .filter(Boolean),
    microsequences: microsequencesInput
      .map((item, index) => validateMicrosequence(item, `${path}.microsequences[${index}]`, errors))
      .filter(Boolean)
  };
}

function validateModule(moduleValue, path, errors) {
  if (!isPlainObject(moduleValue)) {
    pushError(errors, path, "Módulo deve ser objeto.");
    return null;
  }
  rejectUnknownFields(moduleValue, MODULE_FIELDS, path, errors);
  const lessonsInput = validateRequiredArray(moduleValue, "lessons", path, errors);
  validateSiblingIds(lessonsInput, `${path}.lessons`, errors, "lições do módulo");
  return {
    id: validateRequiredText(moduleValue, "id", path, errors, "module.id"),
    title: validateRequiredText(moduleValue, "title", path, errors, "module.title"),
    guide: validateGuide(moduleValue.guide, `${path}.guide`, errors),
    lessons: lessonsInput
      .map((lesson, index) => validateLesson(lesson, `${path}.lessons[${index}]`, errors))
      .filter(Boolean)
  };
}

function validateCourse(course, path, errors) {
  if (!isPlainObject(course)) {
    pushError(errors, path, "Curso deve ser objeto.");
    return null;
  }
  rejectUnknownFields(course, COURSE_FIELDS, path, errors);
  const modulesInput = validateRequiredArray(course, "modules", path, errors);
  validateSiblingIds(modulesInput, `${path}.modules`, errors, "módulos do curso");
  return {
    id: validateRequiredText(course, "id", path, errors, "course.id"),
    title: validateRequiredText(course, "title", path, errors, "course.title"),
    goal: validateRequiredText(course, "goal", path, errors, "course.goal"),
    modules: modulesInput
      .map((moduleValue, index) => validateModule(moduleValue, `${path}.modules[${index}]`, errors))
      .filter(Boolean)
  };
}

export function validateProjectDocument(document) {
  const errors = [];
  if (!isPlainObject(document)) {
    return { ok: false, errors: [{ path: "$", message: "Projeto deve ser um objeto." }] };
  }

  rejectUnknownFields(document, ROOT_FIELDS, "$", errors);
  if (document.contract !== PROJECT_CONTRACT) {
    pushError(errors, "$.contract", `Contrato esperado: "${PROJECT_CONTRACT}".`);
  }
  if (document.version !== PROJECT_VERSION) {
    pushError(errors, "$.version", `Versão esperada: ${PROJECT_VERSION}.`);
  }
  if (document.kind !== "project") {
    pushError(errors, "$.kind", 'kind esperado: "project".');
  }
  const scope = hasOwn(document, "scope") ? text(document.scope) : "";
  if (hasOwn(document, "scope") && (typeof document.scope !== "string" || !PROJECT_SCOPES.has(scope))) {
    pushError(errors, "$.scope", "scope inválido.");
  }

  const coursesInput = validateRequiredArray(document, "courses", "$", errors);
  validateSiblingIds(coursesInput, "$.courses", errors, "cursos do projeto");
  const courses = coursesInput
    .map((course, index) => validateCourse(course, `$.courses[${index}]`, errors))
    .filter(Boolean);
  return finalizeValidation(errors, {
    contract: PROJECT_CONTRACT,
    version: PROJECT_VERSION,
    kind: "project",
    ...(scope ? { scope } : {}),
    courses
  });
}

export function createEmptyProjectDocument() {
  return {
    contract: PROJECT_CONTRACT,
    version: PROJECT_VERSION,
    kind: "project",
    courses: []
  };
}
