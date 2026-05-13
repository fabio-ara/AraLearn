import { sanitizeContractCard, getContractCardKindLabel } from "./contractCard.js";
import {
  buildSourceGuideText,
  normalizeSourceGuideStructured,
  SOURCE_GUIDE_LEVELS
} from "../sourceGuides/sourceGuideStructured.js";
import { normalizeLessonGuidance } from "../generation/guidance/lessonGuidance.js";
import { listCoverageRoles, normalizeLessonDomainMap, normalizeMicrosequenceDidacticMetadata } from "../generation/domain/lessonDomainModel.js";

export const CONTRACT_NAME = "aralearn.contract";
export const CONTRACT_VERSION = 1;
export const CONTRACT_KIND_PROJECT = "project";
const CONTRACT_SCOPES = new Set(["course", "module", "lesson", "microsequence"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function makeError(path, message) {
  return { path, message };
}

function readOptionalString(value, path, fieldName, errors) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    errors.push(makeError(path, `Campo opcional inválido: "${fieldName}".`));
    return "";
  }

  return value.trim();
}

function ensureRequiredString(value, path, fieldName, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(makeError(path, `Campo obrigatório inválido: "${fieldName}".`));
    return null;
  }

  return value.trim();
}

function normalizeStringList(value, path, fieldName, errors) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(makeError(path, `Campo opcional inválido: "${fieldName}".`));
    return [];
  }

  return value
    .map((item, index) => {
      if (typeof item !== "string" || item.trim() === "") {
        errors.push(makeError(`${path}.${fieldName}[${index}]`, "Valor deve ser texto."));
        return "";
      }
      return item.trim();
    })
    .filter(Boolean);
}

function assertAllowedFields(source, allowedFields, path, errors, label) {
  Object.keys(source).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      errors.push(makeError(`${path}.${fieldName}`, `Campo não suportado em ${label}: "${fieldName}".`));
    }
  });
}

function createKeyGenerator(scopeLabel) {
  const usedKeys = new Set();

  return {
    next(rawKey, fallbackLabel, path, errors) {
      let candidate = rawKey;

      if (candidate !== undefined) {
        if (typeof candidate !== "string" || candidate.trim() === "") {
          errors.push(makeError(`${path}.key`, 'Campo opcional inválido: "key".'));
          candidate = undefined;
        } else {
          candidate = candidate.trim();
        }
      }

      if (!candidate) {
        candidate = `${scopeLabel}-${slugify(fallbackLabel) || scopeLabel}`;
      }

      if (!usedKeys.has(candidate)) {
        usedKeys.add(candidate);
        return candidate;
      }

      if (rawKey) {
        errors.push(makeError(`${path}.key`, `Key duplicada no escopo: "${candidate}".`));
        return candidate;
      }

      let counter = 2;
      let nextCandidate = `${candidate}-${counter}`;
      while (usedKeys.has(nextCandidate)) {
        counter += 1;
        nextCandidate = `${candidate}-${counter}`;
      }

      usedKeys.add(nextCandidate);
      return nextCandidate;
    }
  };
}

function validateCard(card, index, errors, cardKeys, path) {
  const currentPath = `${path}.cards[${index}]`;

  if (!isPlainObject(card)) {
    errors.push(makeError(currentPath, "Card deve ser um objeto."));
    return null;
  }

  try {
    const normalizedCard = sanitizeContractCard(card);
    const title = normalizedCard.title || getContractCardKindLabel(normalizedCard) || `card-${index + 1}`;
    const key = cardKeys.next(normalizedCard.key, title, currentPath, errors);
    return {
      ...normalizedCard,
      key
    };
  } catch (error) {
    errors.push(makeError(currentPath, error.message));
    return null;
  }
}

function validateMicrosequence(microsequence, index, errors, microKeys, path) {
  const currentPath = `${path}.microsequences[${index}]`;

  if (!isPlainObject(microsequence)) {
    errors.push(makeError(currentPath, "Microssequência deve ser um objeto."));
    return null;
  }

  assertAllowedFields(
    microsequence,
    new Set([
      "key",
      "title",
      "description",
      "tags",
      "status",
      "included",
      "domainRefs",
      "practiceVariantRefs",
      "didacticPurpose",
      "coverageRole",
      "cards"
    ]),
    currentPath,
    errors,
    "microssequência"
  );

  const title = ensureRequiredString(microsequence.title, `${currentPath}.title`, "title", errors);
  const description = readOptionalString(microsequence.description, `${currentPath}.description`, "description", errors);
  const tags = normalizeStringList(microsequence.tags, currentPath, "tags", errors);
  const status = typeof microsequence.status === "string" ? microsequence.status.trim() : "";
  if (status !== "draft" && status !== "ready") {
    errors.push(makeError(`${currentPath}.status`, 'Campo obrigatório inválido: "status".'));
  }
  const includedValue = microsequence.included;
  if (includedValue !== undefined && typeof includedValue !== "boolean") {
    errors.push(makeError(`${currentPath}.included`, 'Campo opcional inválido: "included".'));
  }
  const key = microKeys.next(microsequence.key, title || `microsequence-${index + 1}`, currentPath, errors);
  const cards = Array.isArray(microsequence.cards) ? microsequence.cards : [];

  if (!Array.isArray(microsequence.cards)) {
    errors.push(makeError(`${currentPath}.cards`, 'Campo obrigatório inválido: "cards".'));
  }

  const cardKeys = createKeyGenerator("card");
  const normalizedCards = cards
    .map((card, cardIndex) => validateCard(card, cardIndex, errors, cardKeys, currentPath))
    .filter(Boolean);
  const didacticMeta = normalizeMicrosequenceDidacticMetadata(microsequence);
  const coverageRole = microsequence.coverageRole === undefined || listCoverageRoles().includes(String(microsequence.coverageRole).trim())
    ? didacticMeta.coverageRole
    : "";
  if (microsequence.coverageRole !== undefined && !coverageRole) {
    errors.push(makeError(`${currentPath}.coverageRole`, 'Campo opcional inválido: "coverageRole".'));
  }

  return {
    key,
    title: title ?? "",
    ...(description ? { description } : {}),
    ...(tags.length ? { tags } : {}),
    status: status || "draft",
    included: typeof includedValue === "boolean" ? includedValue : normalizedCards.length > 0,
    ...(didacticMeta.domainRefs?.length ? { domainRefs: didacticMeta.domainRefs } : {}),
    ...(didacticMeta.practiceVariantRefs?.length ? { practiceVariantRefs: didacticMeta.practiceVariantRefs } : {}),
    ...(didacticMeta.didacticPurpose ? { didacticPurpose: didacticMeta.didacticPurpose } : {}),
    ...(coverageRole ? { coverageRole } : {}),
    cards: normalizedCards
  };
}

function hasLessonDomainMetadata(lesson = {}, microsequences = []) {
  if (lesson?.domainMap && typeof lesson.domainMap === "object") {
    return true;
  }
  return (Array.isArray(microsequences) ? microsequences : []).some(
    (item) =>
      (Array.isArray(item?.domainRefs) && item.domainRefs.length) ||
      (Array.isArray(item?.practiceVariantRefs) && item.practiceVariantRefs.length) ||
      item?.didacticPurpose ||
      item?.coverageRole
  );
}

function readOptionalSourceGuideStructured(value, sourceGuide, path, errors, level) {
  if (value === undefined) {
    if (typeof sourceGuide === "string" && sourceGuide.trim()) {
      errors.push(makeError(path, 'sourceGuide textual puro não é aceito sem "sourceGuideStructured".'));
    }
    return {};
  }
  if (!isPlainObject(value)) {
    errors.push(makeError(path, 'Campo opcional inválido: "sourceGuideStructured".'));
    return {};
  }

  return normalizeSourceGuideStructured(value, { level });
}

function validateLesson(lesson, index, errors, lessonKeys, path) {
  const currentPath = `${path}.lessons[${index}]`;

  if (!isPlainObject(lesson)) {
    errors.push(makeError(currentPath, "Lição deve ser um objeto."));
    return null;
  }

  assertAllowedFields(
    lesson,
    new Set([
      "key",
      "title",
      "description",
      "sourceGuide",
      "sourceGuideStructured",
      "presetId",
      "resourceTags",
      "contentTypeTags",
      "learningActionTags",
      "supportLevel",
      "domainMap",
      "microsequences"
    ]),
    currentPath,
    errors,
    "lição"
  );

  const title = ensureRequiredString(lesson.title, `${currentPath}.title`, "title", errors);
  const description = readOptionalString(lesson.description, `${currentPath}.description`, "description", errors);
  const sourceGuide = readOptionalString(lesson.sourceGuide, `${currentPath}.sourceGuide`, "sourceGuide", errors);
  const sourceGuideStructured = readOptionalSourceGuideStructured(
    lesson.sourceGuideStructured,
    sourceGuide,
    `${currentPath}.sourceGuideStructured`,
    errors,
    SOURCE_GUIDE_LEVELS.LESSON
  );
  const lessonGuidance = normalizeLessonGuidance(lesson);
  const key = lessonKeys.next(lesson.key, title || `lesson-${index + 1}`, currentPath, errors);
  const microsequences = Array.isArray(lesson.microsequences) ? lesson.microsequences : [];

  if (!Array.isArray(lesson.microsequences)) {
    errors.push(makeError(`${currentPath}.microsequences`, 'Campo obrigatório inválido: "microsequences".'));
  }

  const microKeys = createKeyGenerator("microsequence");
  const normalizedMicrosequences = microsequences
    .map((item, microIndex) => validateMicrosequence(item, microIndex, errors, microKeys, currentPath))
    .filter(Boolean);
  const domainMap = hasLessonDomainMetadata(lesson, normalizedMicrosequences)
    ? normalizeLessonDomainMap(lesson.domainMap || {}, {
        lessonMicrosequences: normalizedMicrosequences,
        sourceGuideStructured
      })
    : null;

  return {
    key,
    title: title ?? "",
    ...(description ? { description } : {}),
    ...(buildSourceGuideText(sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
      ? { sourceGuide: buildSourceGuideText(sourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON }) }
      : {}),
    ...(Object.keys(sourceGuideStructured).length ? { sourceGuideStructured } : {}),
    ...lessonGuidance,
    ...(domainMap && (domainMap.items.length || domainMap.practiceVariants.length) ? { domainMap } : {}),
    microsequences: normalizedMicrosequences
  };
}

function validateModule(moduleValue, index, errors, moduleKeys, path) {
  const currentPath = `${path}.modules[${index}]`;

  if (!isPlainObject(moduleValue)) {
    errors.push(makeError(currentPath, "Módulo deve ser um objeto."));
    return null;
  }

  assertAllowedFields(
    moduleValue,
    new Set(["key", "title", "description", "lessons"]),
    currentPath,
    errors,
    "módulo"
  );

  const title = ensureRequiredString(moduleValue.title, `${currentPath}.title`, "title", errors);
  const description = readOptionalString(moduleValue.description, `${currentPath}.description`, "description", errors);
  const key = moduleKeys.next(moduleValue.key, title || `module-${index + 1}`, currentPath, errors);
  const lessons = Array.isArray(moduleValue.lessons) ? moduleValue.lessons : [];

  if (!Array.isArray(moduleValue.lessons)) {
    errors.push(makeError(`${currentPath}.lessons`, 'Campo obrigatório inválido: "lessons".'));
  }

  const lessonKeys = createKeyGenerator("lesson");
  const normalizedLessons = lessons
    .map((lesson, lessonIndex) => validateLesson(lesson, lessonIndex, errors, lessonKeys, currentPath))
    .filter(Boolean);

  return {
    key,
    title: title ?? "",
    ...(description ? { description } : {}),
    lessons: normalizedLessons
  };
}

function validateCourse(course, index, errors, courseKeys) {
  const currentPath = `courses[${index}]`;

  if (!isPlainObject(course)) {
    errors.push(makeError(currentPath, "Curso deve ser um objeto."));
    return null;
  }

  assertAllowedFields(
    course,
    new Set(["key", "title", "description", "modules"]),
    currentPath,
    errors,
    "curso"
  );

  const title = ensureRequiredString(course.title, `${currentPath}.title`, "title", errors);
  const description = readOptionalString(course.description, `${currentPath}.description`, "description", errors);
  const key = courseKeys.next(course.key, title || `course-${index + 1}`, currentPath, errors);
  const modules = Array.isArray(course.modules) ? course.modules : [];

  if (!Array.isArray(course.modules)) {
    errors.push(makeError(`${currentPath}.modules`, 'Campo obrigatório inválido: "modules".'));
  }

  const moduleKeys = createKeyGenerator("module");
  const normalizedModules = modules
    .map((moduleValue, moduleIndex) => validateModule(moduleValue, moduleIndex, errors, moduleKeys, currentPath))
    .filter(Boolean);

  return {
    key,
    title: title ?? "",
    ...(description ? { description } : {}),
    modules: normalizedModules
  };
}

export function validateContractDocument(document) {
  const errors = [];

  if (!isPlainObject(document)) {
    return {
      ok: false,
      errors: [makeError("$", "Documento raiz deve ser um objeto.")]
    };
  }

  assertAllowedFields(
    document,
    new Set(["contract", "version", "kind", "scope", "courses"]),
    "$",
    errors,
    "projeto"
  );

  if (document.contract !== CONTRACT_NAME) {
    errors.push(makeError("contract", `Contrato inválido. Esperado "${CONTRACT_NAME}".`));
  }

  if (document.version !== CONTRACT_VERSION) {
    errors.push(makeError("version", `Versão inválida. Esperado ${CONTRACT_VERSION}.`));
  }

  if (document.kind !== CONTRACT_KIND_PROJECT) {
    errors.push(makeError("kind", `Kind inválido. Esperado "${CONTRACT_KIND_PROJECT}".`));
  }

  const scope = document.scope === undefined ? "" : readOptionalString(document.scope, "scope", "scope", errors);
  if (scope && !CONTRACT_SCOPES.has(scope)) {
    errors.push(makeError("scope", 'Campo opcional inválido: "scope".'));
  }

  const courses = Array.isArray(document.courses) ? document.courses : [];
  if (!Array.isArray(document.courses)) {
    errors.push(makeError("courses", 'Campo obrigatório inválido: "courses".'));
  }

  const courseKeys = createKeyGenerator("course");
  const normalizedCourses = courses
    .map((course, index) => validateCourse(course, index, errors, courseKeys))
    .filter(Boolean);

  if (errors.length > 0) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    value: {
      contract: CONTRACT_NAME,
      version: CONTRACT_VERSION,
      kind: CONTRACT_KIND_PROJECT,
      ...(scope ? { scope } : {}),
      courses: normalizedCourses
    }
  };
}
