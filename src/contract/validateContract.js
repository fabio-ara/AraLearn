const CONTRACT_NAME = "aralearn.contract";

import {
  convertPublicFlowToStructure,
  convertStructureToPublicFlow,
  normalizeFlowchartStructure,
  validateFlowchartStructureContract
} from "../flowchart/flowchartStructure.js";

const CARD_TYPES = new Set([
  "text",
  "choice",
  "complete",
  "editor",
  "table",
  "flow",
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
  return { path, message };
}

function ensureRequiredString(value, path, fieldName, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(makeError(path, `Campo obrigatório inválido: "${fieldName}".`));
    return null;
  }

  return value.trim();
}

function readOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeStringList(value, path, fieldName, errors, { required = false } = {}) {
  if (value === undefined) {
    if (required) {
      errors.push(makeError(path, `Campo obrigatório inválido: "${fieldName}".`));
    }
    return [];
  }

  if (!Array.isArray(value) || !value.length) {
    errors.push(makeError(path, `Campo ${required ? "obrigatório" : "opcional"} inválido: "${fieldName}".`));
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
        candidate = `${scopeLabel}-${slugify(fallbackLabel) || scopeLabel}`;
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

  const type = ensureRequiredString(card.type, currentPath, "type", errors);
  if (type && !CARD_TYPES.has(type)) {
    errors.push(makeError(currentPath, `Tipo de card desconhecido: "${type}".`));
  }

  const title = readOptionalString(card.title);
  const key = cardKeys.next(card.key, title || type || `card-${index + 1}`, currentPath, errors);

  const normalized = {
    key,
    type: type ?? ""
  };

  if (title) {
    normalized.title = title;
  }

  if (type === "text") {
    normalized.text = ensureRequiredString(card.text, currentPath, "text", errors) ?? "";
  } else if (type === "choice") {
    normalized.ask = ensureRequiredString(card.ask, currentPath, "ask", errors) ?? "";
    normalized.answer = normalizeStringList(card.answer, currentPath, "answer", errors, { required: true });
    normalized.wrong = normalizeStringList(card.wrong, currentPath, "wrong", errors, { required: true });
  } else if (type === "complete") {
    normalized.text = ensureRequiredString(card.text, currentPath, "text", errors) ?? "";
    normalized.answer = normalizeStringList(card.answer, currentPath, "answer", errors, { required: true });
    normalized.wrong = normalizeStringList(card.wrong, currentPath, "wrong", errors, { required: true });
  } else if (type === "editor") {
    normalized.code = ensureRequiredString(card.code, currentPath, "code", errors) ?? "";
    const language = readOptionalString(card.language);
    if (language) {
      normalized.language = language;
    }
  } else if (type === "table") {
    normalized.columns = normalizeStringList(card.columns, currentPath, "columns", errors, { required: true });
    if (!Array.isArray(card.rows) || !card.rows.length) {
      errors.push(makeError(currentPath, 'Campo obrigatório inválido: "rows".'));
      normalized.rows = [];
    } else {
      normalized.rows = card.rows.map((row, rowIndex) => {
        if (!Array.isArray(row) || !row.length) {
          errors.push(makeError(`${currentPath}.rows[${rowIndex}]`, "Linha da tabela deve ser uma lista de textos."));
          return [];
        }

        return row
          .map((cell, cellIndex) => {
            if (typeof cell !== "string") {
              errors.push(makeError(`${currentPath}.rows[${rowIndex}][${cellIndex}]`, "Célula da tabela deve ser texto."));
              return "";
            }

            return cell.trim();
          });
      });
    }
  } else if (type === "flow") {
    if (!Array.isArray(card.flow) || !card.flow.length) {
      errors.push(makeError(currentPath, 'Campo obrigatório inválido: "flow".'));
      normalized.flow = [];
    } else {
      const structure = normalizeFlowchartStructure(convertPublicFlowToStructure(card.flow));
      const validation = validateFlowchartStructureContract(structure);
      if (!validation.valid) {
        errors.push(makeError(`${currentPath}.flow`, 'Campo obrigatório inválido: "flow".'));
        normalized.flow = [];
      } else {
        normalized.flow = convertStructureToPublicFlow(structure);
      }
    }
  } else if (type === "image") {
    normalized.src = ensureRequiredString(card.src, currentPath, "src", errors) ?? "";
    const alt = readOptionalString(card.alt);
    if (alt) {
      normalized.alt = alt;
    }
  }

  return normalized;
}

function validateMicrosequence(microsequence, index, errors, microKeys, path) {
  const currentPath = `${path}.microsequences[${index}]`;

  if (!isPlainObject(microsequence)) {
    errors.push(makeError(currentPath, "Microssequência deve ser um objeto."));
    return null;
  }

  const title = ensureRequiredString(microsequence.title, currentPath, "title", errors);
  const tags = microsequence.tags === undefined
    ? []
    : normalizeStringList(microsequence.tags, currentPath, "tags", errors);
  const key = microKeys.next(microsequence.key, title || `microsequence-${index + 1}`, currentPath, errors);
  const cards = Array.isArray(microsequence.cards) ? microsequence.cards : [];

  if (!Array.isArray(microsequence.cards) || cards.length === 0) {
    errors.push(makeError(currentPath, 'Microssequência deve conter "cards" com pelo menos um item.'));
  }

  const cardKeys = createKeyGenerator("card");
  const normalizedCards = cards
    .map((card, cardIndex) => validateCard(card, cardIndex, errors, cardKeys, currentPath))
    .filter(Boolean);

  return {
    key,
    title: title ?? "",
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

  const title = ensureRequiredString(lesson.title, currentPath, "title", errors);
  const description = readOptionalString(lesson.description);
  const key = lessonKeys.next(lesson.key, title || `lesson-${index + 1}`, currentPath, errors);
  const microsequences = Array.isArray(lesson.microsequences) ? lesson.microsequences : [];

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

  const title = ensureRequiredString(moduleValue.title, currentPath, "title", errors);
  const description = readOptionalString(moduleValue.description);
  const key = moduleKeys.next(moduleValue.key, title || `module-${index + 1}`, currentPath, errors);
  const lessons = Array.isArray(moduleValue.lessons) ? moduleValue.lessons : [];

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

function validateCourse(course, index, errors, courseKeys) {
  const currentPath = `courses[${index}]`;

  if (!isPlainObject(course)) {
    errors.push(makeError(currentPath, "Curso deve ser um objeto."));
    return null;
  }

  const title = ensureRequiredString(course.title, currentPath, "title", errors);
  const description = readOptionalString(course.description);
  const key = courseKeys.next(course.key, title || `course-${index + 1}`, currentPath, errors);
  const modules = Array.isArray(course.modules) ? course.modules : [];

  if (!Array.isArray(course.modules) || modules.length === 0) {
    errors.push(makeError(currentPath, 'Curso deve conter "modules" com pelo menos um item.'));
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

  if (document.contract !== CONTRACT_NAME) {
    errors.push(makeError("contract", `Contrato inválido. Esperado "${CONTRACT_NAME}".`));
  }

  const courses = Array.isArray(document.courses) ? document.courses : [];
  if (!Array.isArray(document.courses) || courses.length === 0) {
    errors.push(makeError("$", 'Documento deve conter "courses" com pelo menos um item.'));
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
      courses: normalizedCourses
    }
  };
}

export { CARD_TYPES, CONTRACT_NAME };
