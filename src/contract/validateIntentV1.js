const CONTRACT_NAME = "aralearn.intent.v1";

const CARD_INTENTS = new Set([
  "text",
  "ask",
  "complete",
  "code",
  "table",
  "compare",
  "scene",
  "map",
  "flow",
  "simulate",
  "image"
]);

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
  return {
    path,
    message
  };
}

function ensureString(value, path, fieldName, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(makeError(path, `Campo obrigatório inválido: "${fieldName}".`));
    return null;
  }

  return value.trim();
}

function normalizeOptionalTags(value, path, errors) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    errors.push(makeError(path, 'Campo opcional inválido: "tags".'));
    return [];
  }

  return value
    .map((item, index) => {
      if (typeof item !== "string") {
        errors.push(makeError(`${path}.tags[${index}]`, "Tag deve ser texto."));
        return "";
      }

      return item.trim();
    })
    .filter(Boolean);
}

function createKeyGenerator(scopeLabel) {
  const usedKeys = new Set();

  return {
    next(rawKey, fallbackLabel, path, errors) {
      let candidate = rawKey;

      if (candidate !== undefined) {
        if (typeof candidate !== "string" || candidate.trim() === "") {
          errors.push(makeError(path, 'Campo opcional inválido: "key".'));
          candidate = undefined;
        } else {
          candidate = candidate.trim();
        }
      }

      if (!candidate) {
        const suffixBase = slugify(fallbackLabel) || scopeLabel;
        candidate = `${scopeLabel}-${suffixBase}`;
      }

      if (!usedKeys.has(candidate)) {
        usedKeys.add(candidate);
        return candidate;
      }

      if (rawKey) {
        errors.push(makeError(path, `Key duplicada no escopo: "${candidate}".`));
        return candidate;
      }

      let counter = 2;
      let generated = `${candidate}-${counter}`;
      while (usedKeys.has(generated)) {
        counter += 1;
        generated = `${candidate}-${counter}`;
      }

      usedKeys.add(generated);
      return generated;
    }
  };
}

function validateCard(card, index, errors, cardKeys, path) {
  const currentPath = `${path}.cards[${index}]`;

  if (!isPlainObject(card)) {
    errors.push(makeError(currentPath, "Card deve ser um objeto."));
    return null;
  }

  const intent = ensureString(card.intent, currentPath, "intent", errors);
  if (intent && !CARD_INTENTS.has(intent)) {
    errors.push(makeError(currentPath, `Intent desconhecida: "${intent}".`));
  }

  if (card.data !== undefined && !isPlainObject(card.data)) {
    errors.push(makeError(currentPath, 'Campo opcional inválido: "data".'));
  }

  const title = card.title && typeof card.title === "string" ? card.title.trim() : "";
  const key = cardKeys.next(card.key, title || intent || `card-${index + 1}`, currentPath, errors);

  return {
    key,
    intent: intent ?? "",
    ...(title ? { title } : {}),
    ...(card.data !== undefined ? { data: card.data } : {})
  };
}

function validateMicrosequence(microsequence, index, errors, microKeys, path) {
  const currentPath = `${path}.microsequences[${index}]`;

  if (!isPlainObject(microsequence)) {
    errors.push(makeError(currentPath, "Microssequência deve ser um objeto."));
    return null;
  }

  if ("cards" in microsequence && !Array.isArray(microsequence.cards)) {
    errors.push(makeError(currentPath, 'Campo obrigatório inválido: "cards".'));
  }

  const objective = ensureString(microsequence.objective, currentPath, "objective", errors);
  const tags = normalizeOptionalTags(microsequence.tags, currentPath, errors);
  const title = microsequence.title && typeof microsequence.title === "string"
    ? microsequence.title.trim()
    : "";
  const key = microKeys.next(
    microsequence.key,
    title || objective || `microsequence-${index + 1}`,
    currentPath,
    errors
  );

  const cards = Array.isArray(microsequence.cards)
    ? microsequence.cards
    : [];

  if (cards.length === 0) {
    errors.push(makeError(currentPath, "Microssequência deve conter pelo menos um card."));
  }

  const cardKeys = createKeyGenerator("card");
  const normalizedCards = cards
    .map((card, cardIndex) => validateCard(card, cardIndex, errors, cardKeys, currentPath))
    .filter(Boolean);

  return {
    key,
    ...(title ? { title } : {}),
    objective: objective ?? "",
    ...(tags.length ? { tags } : {}),
    cards: normalizedCards
  };
}

function validateLesson(lesson, index, errors, lessonKeys, path) {
  const currentPath = `${path}.lessons[${index}]`;

  if (!isPlainObject(lesson)) {
    errors.push(makeError(currentPath, "Lição deve ser um objeto."));
    return null;
  }

  if ("cards" in lesson) {
    errors.push(makeError(currentPath, "Card solto é inválido. Use \"microsequences\" dentro da lição."));
  }

  const title = ensureString(lesson.title, currentPath, "title", errors);
  const description = lesson.description && typeof lesson.description === "string"
    ? lesson.description.trim()
    : "";
  const key = lessonKeys.next(lesson.key, title || `lesson-${index + 1}`, currentPath, errors);

  const microsequences = Array.isArray(lesson.microsequences)
    ? lesson.microsequences
    : [];

  if (!Array.isArray(lesson.microsequences) || microsequences.length === 0) {
    errors.push(makeError(currentPath, 'Lição deve conter "microsequences" com pelo menos um item.'));
  }

  const microKeys = createKeyGenerator("microsequence");
  const normalizedMicrosequences = microsequences
    .map((item, microIndex) => validateMicrosequence(item, microIndex, errors, microKeys, currentPath))
    .filter(Boolean);

  return {
    key,
    title: title ?? "",
    ...(description ? { description } : {}),
    microsequences: normalizedMicrosequences
  };
}

function validateModule(moduleValue, index, errors, moduleKeys, path) {
  const currentPath = `${path}.modules[${index}]`;

  if (!isPlainObject(moduleValue)) {
    errors.push(makeError(currentPath, "Módulo deve ser um objeto."));
    return null;
  }

  const title = ensureString(moduleValue.title, currentPath, "title", errors);
  const description = moduleValue.description && typeof moduleValue.description === "string"
    ? moduleValue.description.trim()
    : "";
  const key = moduleKeys.next(moduleValue.key, title || `module-${index + 1}`, currentPath, errors);

  const lessons = Array.isArray(moduleValue.lessons)
    ? moduleValue.lessons
    : [];

  if (!Array.isArray(moduleValue.lessons) || lessons.length === 0) {
    errors.push(makeError(currentPath, 'Módulo deve conter "lessons" com pelo menos um item.'));
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

function validateCourse(course, errors) {
  const currentPath = "course";

  if (!isPlainObject(course)) {
    errors.push(makeError(currentPath, "Curso deve ser um objeto."));
    return null;
  }

  const title = ensureString(course.title, currentPath, "title", errors);
  const description = course.description && typeof course.description === "string"
    ? course.description.trim()
    : "";
  const courseKeys = createKeyGenerator("course");
  const key = courseKeys.next(course.key, title || "course", currentPath, errors);

  const modules = Array.isArray(course.modules)
    ? course.modules
    : [];

  if (!Array.isArray(course.modules) || modules.length === 0) {
    errors.push(makeError(currentPath, 'Curso deve conter "modules" com pelo menos um item.'));
  }

  const moduleKeys = createKeyGenerator("module");
  const normalizedModules = modules
    .map((moduleValue, index) => validateModule(moduleValue, index, errors, moduleKeys, currentPath))
    .filter(Boolean);

  return {
    key,
    title: title ?? "",
    ...(description ? { description } : {}),
    modules: normalizedModules
  };
}

function validateCourses(document, errors) {
  if ("course" in document) {
    errors.push(makeError("course", 'Campo legado inválido: use "courses" na raiz do documento.'));
  }

  const courses = Array.isArray(document.courses) ? document.courses : [];

  if (!Array.isArray(document.courses) || courses.length === 0) {
    errors.push(makeError("$", 'Documento deve conter "courses" com pelo menos um item.'));
    return [];
  }

  const courseKeys = createKeyGenerator("course");
  return courses
    .map((course, index) => {
      const normalizedCourse = validateCourse(course, errors);
      if (!normalizedCourse) {
        return null;
      }

      const key = courseKeys.next(
        normalizedCourse.key,
        normalizedCourse.title || `course-${index + 1}`,
        `courses[${index}]`,
        errors
      );

      return {
        ...normalizedCourse,
        key
      };
    })
    .filter(Boolean);
}

export function validateIntentV1Document(document) {
  const errors = [];

  if (!isPlainObject(document)) {
    return {
      ok: false,
      errors: [makeError("$", "Documento raiz deve ser um objeto.")]
    };
  }

  if (document.contract !== CONTRACT_NAME) {
    errors.push(makeError("contract", `Contrato inválido. Esperado "${CONTRACT_NAME}".`));
  }

  const courses = validateCourses(document, errors);

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
      courses
    }
  };
}

export { CARD_INTENTS, CONTRACT_NAME };
