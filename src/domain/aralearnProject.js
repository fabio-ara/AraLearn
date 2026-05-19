import { buildScopedKey, createKeyAllocator } from "../core/ids.js";
import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import { normalizeLabel, normalizeWhitespace } from "../core/text.js";
import { validateCard } from "./cards.js";
import { MICROSEQUENCE_STATUSES, MICROSEQUENCE_TYPES } from "./microsequence.js";
import { normalizeScopeTermList } from "./scopeTerms.js";

export const PROJECT_CONTRACT = "aralearn.contract";
export const PROJECT_VERSION = 1;

function normalizeEvidencePriority(values = []) {
  const source = Array.isArray(values) ? values : [];
  const unique = [];
  const seen = new Set();
  for (const item of source) {
    const normalized = normalizeWhitespace(item).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique.length ? unique : ["none"];
}

function validateVersion(version, path, errors) {
  if (!isPlainObject(version)) {
    pushError(errors, path, "Versão de microssequência inválida.");
    return null;
  }
  const cards = Array.isArray(version.cards) ? version.cards : [];
  const normalizedCards = cards
    .map((card, index) => {
      const result = validateCard(card, `${path}.cards[${index}]`);
      if (!result.ok) {
        result.errors.forEach((error) => errors.push(error));
        return null;
      }
      return result.value;
    })
    .filter(Boolean);

  return {
    key: normalizeLabel(version.key) || `version-${Date.now().toString(36)}`,
    createdAt: typeof version.createdAt === "string" && version.createdAt.trim() ? version.createdAt.trim() : new Date().toISOString(),
    source: ["llm", "manual", "codex"].includes(String(version.source || "").trim()) ? String(version.source).trim() : "llm",
    mode: ["generate", "improve", "more_practice", "support", "repair"].includes(String(version.mode || "").trim())
      ? String(version.mode).trim()
      : "generate",
    ...(typeof version.userRequest === "string" && version.userRequest.trim() ? { userRequest: version.userRequest.trim() } : {}),
    cards: normalizedCards,
    summary: typeof version.summary === "string" ? version.summary.trim() : "",
    validationReport: isPlainObject(version.validationReport)
      ? structuredClone(version.validationReport)
      : { ok: true, issues: [] }
  };
}

function validateMicrosequence(microsequence, path, errors) {
  if (!isPlainObject(microsequence)) {
    pushError(errors, path, "Microssequência inválida.");
    return null;
  }

  const title = normalizeLabel(microsequence.title);
  const goal = normalizeLabel(microsequence.goal);
  if (!title) {
    pushError(errors, `${path}.title`, "Título da microssequência é obrigatório.");
  }
  if (!goal) {
    pushError(errors, `${path}.goal`, "Objetivo da microssequência é obrigatório.");
  }

  const type = normalizeWhitespace(microsequence.type);
  if (!MICROSEQUENCE_TYPES.includes(type)) {
    pushError(errors, `${path}.type`, "Tipo de microssequência inválido.");
  }

  const status = normalizeWhitespace(microsequence.status);
  if (!MICROSEQUENCE_STATUSES.includes(status)) {
    pushError(errors, `${path}.status`, "Status de microssequência inválido.");
  }

  const versions = (Array.isArray(microsequence.versions) ? microsequence.versions : [])
    .map((version, index) => validateVersion(version, `${path}.versions[${index}]`, errors))
    .filter(Boolean);

  const activeVersionKey = typeof microsequence.activeVersionKey === "string" ? microsequence.activeVersionKey.trim() : "";
  if (activeVersionKey && !versions.some((version) => version.key === activeVersionKey)) {
    pushError(errors, `${path}.activeVersionKey`, "Versão ativa inexistente.");
  }
  if (status !== "planned" && !versions.length) {
    pushError(errors, `${path}.versions`, "Microssequências geradas ou prontas precisam ter ao menos uma versão.");
  }

  return {
    key: normalizeLabel(microsequence.key) || buildScopedKey("microsequence", title),
    title,
    goal,
    type: MICROSEQUENCE_TYPES.includes(type) ? type : "main",
    status: MICROSEQUENCE_STATUSES.includes(status) ? status : "planned",
    dependsOn: Array.isArray(microsequence.dependsOn) ? microsequence.dependsOn.map((item) => String(item).trim()).filter(Boolean) : [],
    scopeRefs: Array.isArray(microsequence.scopeRefs) ? microsequence.scopeRefs.map((item) => String(item).trim()).filter(Boolean) : [],
    ...(microsequence.parentMicrosequenceKey ? { parentMicrosequenceKey: String(microsequence.parentMicrosequenceKey).trim() } : {}),
    ...(microsequence.supportReason ? { supportReason: String(microsequence.supportReason).trim() } : {}),
    versions,
    ...(activeVersionKey || versions[0]?.key ? { activeVersionKey: activeVersionKey || versions[versions.length - 1]?.key } : {})
  };
}

function validateLesson(lesson, path, errors) {
  if (!isPlainObject(lesson)) {
    pushError(errors, path, "Lição inválida.");
    return null;
  }
  const title = normalizeLabel(lesson.title);
  const goal = normalizeLabel(lesson.goal);
  if (!title) {
    pushError(errors, `${path}.title`, "Título da lição é obrigatório.");
  }
  if (!goal) {
    pushError(errors, `${path}.goal`, "Objetivo da lição é obrigatório.");
  }

  const microsequences = (Array.isArray(lesson.microsequences) ? lesson.microsequences : [])
    .map((item, index) => validateMicrosequence(item, `${path}.microsequences[${index}]`, errors))
    .filter(Boolean);

  return {
    key: normalizeLabel(lesson.key) || buildScopedKey("lesson", title),
    title,
    goal,
    microsequences
  };
}

function validateModule(moduleValue, path, errors) {
  if (!isPlainObject(moduleValue)) {
    pushError(errors, path, "Módulo inválido.");
    return null;
  }
  const title = normalizeLabel(moduleValue.title);
  if (!title) {
    pushError(errors, `${path}.title`, "Título do módulo é obrigatório.");
  }
  const include = normalizeScopeTermList(moduleValue.include);
  if (!include.length) {
    pushError(errors, `${path}.include`, "Módulo precisa ter termos de escopo em include.");
  }
  const exclude = normalizeScopeTermList(moduleValue.exclude);
  const lessons = (Array.isArray(moduleValue.lessons) ? moduleValue.lessons : [])
    .map((lesson, index) => validateLesson(lesson, `${path}.lessons[${index}]`, errors))
    .filter(Boolean);

  return {
    key: normalizeLabel(moduleValue.key) || buildScopedKey("module", title),
    title,
    include,
    exclude,
    ...(moduleValue.notes ? { notes: String(moduleValue.notes).trim() } : {}),
    assessmentStyle: ["theoretical", "practical", "mixed"].includes(String(moduleValue.assessmentStyle || "").trim())
      ? String(moduleValue.assessmentStyle).trim()
      : "mixed",
    lessons
  };
}

function validateCourse(course, path, errors) {
  if (!isPlainObject(course)) {
    pushError(errors, path, "Curso inválido.");
    return null;
  }

  const title = normalizeLabel(course.title);
  if (!title) {
    pushError(errors, `${path}.title`, "Título do curso é obrigatório.");
  }

  const modules = (Array.isArray(course.modules) ? course.modules : [])
    .map((moduleValue, index) => validateModule(moduleValue, `${path}.modules[${index}]`, errors))
    .filter(Boolean);

  return {
    key: normalizeLabel(course.key) || buildScopedKey("course", title),
    title,
    ...(course.goal ? { goal: String(course.goal).trim() } : {}),
    evidencePriority: normalizeEvidencePriority(course.evidencePriority),
    modules
  };
}

export function validateProjectDocument(document) {
  const errors = [];
  if (!isPlainObject(document)) {
    return { ok: false, errors: [{ path: "$", message: "Projeto deve ser um objeto." }] };
  }
  if (String(document.contract || "").trim() !== PROJECT_CONTRACT) {
    pushError(errors, "$.contract", `Contrato esperado: "${PROJECT_CONTRACT}".`);
  }
  if (Number(document.version) !== PROJECT_VERSION) {
    pushError(errors, "$.version", `Versão esperada: ${PROJECT_VERSION}.`);
  }
  if (String(document.kind || "").trim() !== "project") {
    pushError(errors, "$.kind", 'Kind esperado: "project".');
  }

  const allocator = createKeyAllocator("course");
  const courses = (Array.isArray(document.courses) ? document.courses : [])
    .map((course, index) => validateCourse(course, `$.courses[${index}]`, errors))
    .filter(Boolean)
    .map((course) => ({
      ...course,
      key: allocator.next(course.key, course.title, "course")
    }));

  return finalizeValidation(errors, {
    contract: PROJECT_CONTRACT,
    version: PROJECT_VERSION,
    kind: "project",
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
