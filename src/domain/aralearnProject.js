import { buildScopedKey } from "../core/ids.js";
import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import { validateCard } from "./cards.js";
import { normalizeGuide, GUIDE_LEVELS } from "../sourceGuides/sourceGuideStructured.js";

export const PROJECT_CONTRACT = "aralearn.contract";
export const PROJECT_VERSION = 3;

const PROJECT_SCOPES = new Set(["course", "module", "lesson", "microsequence"]);
const MICROSEQUENCE_ROLES = new Set(["explain", "practice", "review", "support"]);
const MICROSEQUENCE_STATUSES = new Set(["planned", "generated", "needs_review", "ready"]);
const TOPIC_KINDS = new Set(["concept", "procedure", "representation", "term"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueList(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((item) => text(item))
    .filter((item) => {
      const token = item.toLowerCase();
      if (!item || seen.has(token)) {
        return false;
      }
      seen.add(token);
      return true;
    });
}

function validateGuide(value, path, errors, level = GUIDE_LEVELS.LESSON) {
  if (!isPlainObject(value)) {
    pushError(errors, path, "guide inválido.");
    return normalizeGuide({}, { level });
  }
  const normalized = normalizeGuide(value, { level });
  if (!text(normalized.goal)) {
    pushError(errors, `${path}.goal`, "guide.goal é obrigatório.");
  }
  return {
    goal: text(normalized.goal),
    include: uniqueList(normalized.include),
    exclude: uniqueList(normalized.exclude),
    notation: uniqueList(normalized.notation),
    avoid: uniqueList(normalized.avoid)
  };
}

function validateTopic(topic, path, errors) {
  if (!isPlainObject(topic)) {
    pushError(errors, path, "topic inválido.");
    return null;
  }
  const id = text(topic.id) || buildScopedKey("topic", text(topic.label) || "topic");
  const label = text(topic.label);
  if (!label) {
    pushError(errors, `${path}.label`, "topic.label é obrigatório.");
  }
  const kind = TOPIC_KINDS.has(text(topic.kind)) ? text(topic.kind) : "concept";
  return {
    id,
    label,
    kind,
    checks: uniqueList(topic.checks),
    errors: uniqueList(topic.errors)
  };
}

function validateMicrosequence(microsequence, path, errors) {
  if (!isPlainObject(microsequence)) {
    pushError(errors, path, "Microssequência inválida.");
    return null;
  }
  const id = text(microsequence.id) || buildScopedKey("microsequence", text(microsequence.title) || "microsequence");
  const title = text(microsequence.title);
  const goal = text(microsequence.goal);
  if (!title) {
    pushError(errors, `${path}.title`, "Título da microssequência é obrigatório.");
  }
  if (!goal) {
    pushError(errors, `${path}.goal`, "Objetivo da microssequência é obrigatório.");
  }
  const role = text(microsequence.role);
  if (!MICROSEQUENCE_ROLES.has(role)) {
    pushError(errors, `${path}.role`, "role de microssequência inválido.");
  }
  const status = text(microsequence.status);
  if (!MICROSEQUENCE_STATUSES.has(status)) {
    pushError(errors, `${path}.status`, "status de microssequência inválido.");
  }
  const cards = (Array.isArray(microsequence.cards) ? microsequence.cards : [])
    .map((card, index) => {
      const result = validateCard(card, `${path}.cards[${index}]`);
      if (!result.ok) {
        result.errors.forEach((error) => errors.push(error));
        return null;
      }
      return result.value;
    })
    .filter(Boolean);
  if (status !== "planned" && !cards.length) {
    pushError(errors, `${path}.cards`, "Microssequência materializada precisa ter cards.");
  }
  return {
    id,
    title,
    goal,
    role,
    status,
    branchOf: text(microsequence.branchOf) || null,
    dependsOn: uniqueList(microsequence.dependsOn),
    covers: uniqueList(microsequence.covers),
    checks: uniqueList(microsequence.checks),
    cards
  };
}

function validateLesson(lesson, path, errors) {
  if (!isPlainObject(lesson)) {
    pushError(errors, path, "Lição inválida.");
    return null;
  }
  const id = text(lesson.id) || buildScopedKey("lesson", text(lesson.title) || "lesson");
  const title = text(lesson.title);
  if (!title) {
    pushError(errors, `${path}.title`, "Título da lição é obrigatório.");
  }
  const guide = validateGuide(lesson.guide, `${path}.guide`, errors, GUIDE_LEVELS.LESSON);
  const topics = (Array.isArray(lesson.topics) ? lesson.topics : [])
    .map((topic, index) => validateTopic(topic, `${path}.topics[${index}]`, errors))
    .filter(Boolean);
  const microsequences = (Array.isArray(lesson.microsequences) ? lesson.microsequences : [])
    .map((item, index) => validateMicrosequence(item, `${path}.microsequences[${index}]`, errors))
    .filter(Boolean);
  return {
    id,
    title,
    guide,
    topics,
    microsequences
  };
}

function validateModule(moduleValue, path, errors) {
  if (!isPlainObject(moduleValue)) {
    pushError(errors, path, "Módulo inválido.");
    return null;
  }
  const id = text(moduleValue.id) || buildScopedKey("module", text(moduleValue.title) || "module");
  const title = text(moduleValue.title);
  if (!title) {
    pushError(errors, `${path}.title`, "Título do módulo é obrigatório.");
  }
  const guide = validateGuide(moduleValue.guide, `${path}.guide`, errors, GUIDE_LEVELS.MODULE);
  const lessons = (Array.isArray(moduleValue.lessons) ? moduleValue.lessons : [])
    .map((lesson, index) => validateLesson(lesson, `${path}.lessons[${index}]`, errors))
    .filter(Boolean);
  return {
    id,
    title,
    guide,
    lessons
  };
}

function validateCourse(course, path, errors) {
  if (!isPlainObject(course)) {
    pushError(errors, path, "Curso inválido.");
    return null;
  }
  const id = text(course.id) || buildScopedKey("course", text(course.title) || "course");
  const title = text(course.title);
  if (!title) {
    pushError(errors, `${path}.title`, "Título do curso é obrigatório.");
  }
  const goal = text(course.goal);
  if (!goal) {
    pushError(errors, `${path}.goal`, "Objetivo do curso é obrigatório.");
  }
  const modules = (Array.isArray(course.modules) ? course.modules : [])
    .map((moduleValue, index) => validateModule(moduleValue, `${path}.modules[${index}]`, errors))
    .filter(Boolean);
  return {
    id,
    title,
    goal,
    modules
  };
}

export function validateProjectDocument(document) {
  const errors = [];
  if (!isPlainObject(document)) {
    return { ok: false, errors: [{ path: "$", message: "Projeto deve ser um objeto." }] };
  }
  if (text(document.contract) !== PROJECT_CONTRACT) {
    pushError(errors, "$.contract", `Contrato esperado: "${PROJECT_CONTRACT}".`);
  }
  if (Number(document.version) !== PROJECT_VERSION) {
    pushError(errors, "$.version", `Versão esperada: ${PROJECT_VERSION}.`);
  }
  if (text(document.kind) !== "project") {
    pushError(errors, "$.kind", 'kind esperado: "project".');
  }
  const scope = text(document.scope);
  if (scope && !PROJECT_SCOPES.has(scope)) {
    pushError(errors, "$.scope", "scope inválido.");
  }
  const courses = (Array.isArray(document.courses) ? document.courses : [])
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
