import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import { normalizeLabel, normalizeWhitespace, uniqueStrings } from "../core/text.js";
import { normalizeScopeTermLabel } from "./scopeTerms.js";

export const SCOPE_SCHEMA_VERSION = "aralearn.scope.v1";
export const EVIDENCE_KINDS = Object.freeze([
  "notebook",
  "exercise_list",
  "exam",
  "syllabus",
  "booklet",
  "documentation",
  "article",
  "manual",
  "mixed",
  "none"
]);
export const ASSESSMENT_STYLES = Object.freeze(["theoretical", "practical", "mixed"]);

function normalizeEvidencePriority(value) {
  const values = uniqueStrings(Array.isArray(value) ? value : [])
    .map((item) => item.toLowerCase())
    .filter((item) => EVIDENCE_KINDS.includes(item));
  return values.length ? values : ["none"];
}

function normalizeAssessmentStyle(value) {
  const style = normalizeWhitespace(value).toLowerCase();
  return ASSESSMENT_STYLES.includes(style) ? style : "mixed";
}

function normalizeChipList(value) {
  return uniqueStrings(Array.isArray(value) ? value : []).map((item) => normalizeLabel(item));
}

export function validateScopeContractDocument(document) {
  const errors = [];
  if (!isPlainObject(document)) {
    return { ok: false, errors: [{ path: "$", message: "Contrato de escopo deve ser um objeto." }] };
  }

  const schemaVersion = normalizeWhitespace(document.schemaVersion) || SCOPE_SCHEMA_VERSION;
  if (schemaVersion !== SCOPE_SCHEMA_VERSION) {
    pushError(errors, "$.schemaVersion", `Versão de schema inválida: "${schemaVersion}".`);
  }

  const course = isPlainObject(document.course) ? document.course : {};
  const courseTitle = normalizeLabel(course.title);
  if (!courseTitle) {
    pushError(errors, "$.course.title", "Título do curso é obrigatório.");
  }

  const modules = Array.isArray(document.modules) ? document.modules : [];
  if (!modules.length) {
    pushError(errors, "$.modules", "Informe pelo menos um módulo.");
  }

  const usedModuleTitles = new Set();
  const normalizedModules = modules.map((moduleValue, index) => {
    const path = `$.modules[${index}]`;
    const title = normalizeLabel(moduleValue?.title);
    if (!title) {
      pushError(errors, `${path}.title`, "Título do módulo é obrigatório.");
    }
    const normalizedTitle = normalizeScopeTermLabel(title);
    if (normalizedTitle) {
      if (usedModuleTitles.has(normalizedTitle)) {
        pushError(errors, `${path}.title`, `Módulo duplicado: "${title}".`);
      } else {
        usedModuleTitles.add(normalizedTitle);
      }
    }

    const rawInclude = Array.isArray(moduleValue?.include) ? moduleValue.include.map((item) => normalizeLabel(item)).filter(Boolean) : [];
    const rawExclude = Array.isArray(moduleValue?.exclude) ? moduleValue.exclude.map((item) => normalizeLabel(item)).filter(Boolean) : [];
    const include = normalizeChipList(rawInclude);
    const exclude = normalizeChipList(rawExclude);
    if (!include.length) {
      pushError(errors, `${path}.include`, "Cada módulo precisa ter ao menos um item em \"O que entra\".");
    }

    const includeSeen = new Set();
    for (const item of rawInclude) {
      const key = normalizeScopeTermLabel(item);
      if (includeSeen.has(key)) {
        pushError(errors, `${path}.include`, `Chip duplicado em include: "${item}".`);
      }
      includeSeen.add(key);
    }

    const excludeSeen = new Set();
    for (const item of rawExclude) {
      const key = normalizeScopeTermLabel(item);
      if (excludeSeen.has(key)) {
        pushError(errors, `${path}.exclude`, `Chip duplicado em exclude: "${item}".`);
      }
      excludeSeen.add(key);
      if (includeSeen.has(key)) {
        pushError(errors, `${path}.exclude`, `O mesmo termo não pode entrar e não entrar ao mesmo tempo: "${item}".`);
      }
    }

    return {
      title,
      include,
      exclude,
      notes: normalizeLabel(moduleValue?.notes),
      assessmentStyle: normalizeAssessmentStyle(moduleValue?.assessmentStyle)
    };
  });

  return finalizeValidation(errors, {
    schemaVersion: SCOPE_SCHEMA_VERSION,
    course: {
      title: courseTitle,
      goal: normalizeLabel(course.goal),
      evidencePriority: normalizeEvidencePriority(course.evidencePriority)
    },
    modules: normalizedModules
  });
}
