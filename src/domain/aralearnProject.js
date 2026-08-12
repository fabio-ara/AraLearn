import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import { normalizeCardEnvelope, validateCardEnvelope } from "../resources/kernel/cardEnvelope.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";

export const PROJECT_CONTRACT = "aralearn.library.v1";
export const PROJECT_VERSION = 1;

const PROJECT_SCOPES = new Set(["course", "module", "lesson", "microsequence"]);
const MICROSEQUENCE_ROLES = new Set(["explain", "practice", "review", "support"]);
const TOPIC_KINDS = new Set(["concept", "procedure", "representation", "term"]);

const ROOT_FIELDS = new Set(["contract", "scope", "courses"]);
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

function validateLessonDependencies(microsequences, path, errors) {
  const indexById = new Map();
  const dependenciesById = new Map();
  microsequences.forEach((microsequence, index) => {
    if (!isPlainObject(microsequence)) return;
    const id = text(microsequence.id);
    if (id && !indexById.has(id)) indexById.set(id, index);
  });

  microsequences.forEach((microsequence, microsequenceIndex) => {
    if (!isPlainObject(microsequence) || !Array.isArray(microsequence.dependsOn)) return;
    const id = text(microsequence.id);
    if (!id) return;
    const dependencies = [];
    microsequence.dependsOn.forEach((dependencyValue, dependencyIndex) => {
      const dependencyId = text(dependencyValue);
      if (!dependencyId) return;
      const dependencyPath = `${path}[${microsequenceIndex}].dependsOn[${dependencyIndex}]`;
      dependencies.push({ id: dependencyId, path: dependencyPath });
      if (dependencyId === id) {
        pushError(errors, dependencyPath, "Microssequência não pode depender de si mesma.");
        return;
      }
      if (!indexById.has(dependencyId)) {
        pushError(
          errors,
          dependencyPath,
          `Dependência inexistente na mesma lição: "${dependencyId}".`
        );
        return;
      }
      if (indexById.get(dependencyId) >= microsequenceIndex) {
        pushError(
          errors,
          dependencyPath,
          `dependsOn deve apontar para uma microssequência anterior: "${dependencyId}".`
        );
      }
    });
    dependenciesById.set(id, dependencies);
  });

  const stateById = new Map();
  function visit(id) {
    stateById.set(id, "visiting");
    for (const dependency of dependenciesById.get(id) || []) {
      if (!indexById.has(dependency.id) || dependency.id === id) continue;
      const state = stateById.get(dependency.id);
      if (state === "visiting") {
        pushError(errors, dependency.path, "dependsOn não pode formar ciclo.");
        continue;
      }
      if (state !== "visited") visit(dependency.id);
    }
    stateById.set(id, "visited");
  }
  indexById.forEach((_index, id) => {
    if (!stateById.has(id)) visit(id);
  });
}

function validateEntityIdsPerCourse(courses, errors) {
  courses.forEach((course, courseIndex) => {
    const firstPathByTypeAndId = new Map();
    const register = (entityType, entity, path) => {
      if (!isPlainObject(entity)) return;
      const id = text(entity.id);
      if (!id) return;
      let pathsById = firstPathByTypeAndId.get(entityType);
      if (!pathsById) {
        pathsById = new Map();
        firstPathByTypeAndId.set(entityType, pathsById);
      }
      const identityPath = `${path}.id`;
      const firstPath = pathsById.get(id);
      if (firstPath) {
        pushError(
          errors,
          identityPath,
          `id de ${entityType} duplicado em todo o curso: "${id}"; primeira ocorrência em ${firstPath}.`
        );
        return;
      }
      pathsById.set(id, identityPath);
    };
    const coursePath = `$.courses[${courseIndex}]`;
    if (!isPlainObject(course) || !Array.isArray(course.modules)) return;
    course.modules.forEach((moduleValue, moduleIndex) => {
      const modulePath = `${coursePath}.modules[${moduleIndex}]`;
      register("module", moduleValue, modulePath);
      if (!isPlainObject(moduleValue) || !Array.isArray(moduleValue.lessons)) return;
      moduleValue.lessons.forEach((lesson, lessonIndex) => {
        const lessonPath = `${modulePath}.lessons[${lessonIndex}]`;
        register("lesson", lesson, lessonPath);
        if (!isPlainObject(lesson)) return;
        if (Array.isArray(lesson.topics)) {
          lesson.topics.forEach((topic, topicIndex) => {
            register("topic", topic, `${lessonPath}.topics[${topicIndex}]`);
          });
        }
        if (!Array.isArray(lesson.microsequences)) return;
        lesson.microsequences.forEach((microsequence, microsequenceIndex) => {
          const microsequencePath = `${lessonPath}.microsequences[${microsequenceIndex}]`;
          register("microsequence", microsequence, microsequencePath);
          if (!isPlainObject(microsequence) || !Array.isArray(microsequence.cards)) return;
          microsequence.cards.forEach((card, cardIndex) => {
            register("card", card, `${microsequencePath}.cards[${cardIndex}]`);
          });
        });
      });
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
      const result = validateCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY, cardPath);
      if (!result.valid) {
        result.errors.forEach((message) => pushError(errors, cardPath, message));
        return null;
      }
      return normalizeCardEnvelope(card, RESOURCE_PACKAGE_REGISTRY);
    })
    .filter(Boolean);

  return {
    id,
    title,
    goal,
    role,
    ...(branchOf ? { branchOf } : {}),
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
  validateLessonDependencies(microsequencesInput, `${path}.microsequences`, errors);
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
  const scope = hasOwn(document, "scope") ? text(document.scope) : "";
  if (hasOwn(document, "scope") && (typeof document.scope !== "string" || !PROJECT_SCOPES.has(scope))) {
    pushError(errors, "$.scope", "scope inválido.");
  }

  const coursesInput = validateRequiredArray(document, "courses", "$", errors);
  validateSiblingIds(coursesInput, "$.courses", errors, "cursos do projeto");
  validateEntityIdsPerCourse(coursesInput, errors);
  const courses = coursesInput
    .map((course, index) => validateCourse(course, `$.courses[${index}]`, errors))
    .filter(Boolean);
  return finalizeValidation(errors, {
    contract: PROJECT_CONTRACT,
    ...(scope ? { scope } : {}),
    courses
  });
}

export function createEmptyProjectDocument() {
  return {
    contract: PROJECT_CONTRACT,
    courses: []
  };
}
