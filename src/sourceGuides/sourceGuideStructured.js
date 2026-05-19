export const SOURCE_GUIDE_LEVELS = Object.freeze({
  COURSE: "course",
  MODULE: "module",
  LESSON: "lesson"
});

export const SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL = Object.freeze({
  [SOURCE_GUIDE_LEVELS.COURSE]: Object.freeze([]),
  [SOURCE_GUIDE_LEVELS.MODULE]: Object.freeze([]),
  [SOURCE_GUIDE_LEVELS.LESSON]: Object.freeze([
    { name: "lessonGoal", label: "Meta da lição", iconName: "intent", placeholder: "O que esta lição precisa entregar." },
    { name: "notationRules", label: "Incluir", iconName: "title", placeholder: "Lista do que entra nesta lição." },
    { name: "outOfScopeRules", label: "Não incluir", iconName: "module", placeholder: "Lista do que não entra no módulo." },
    { name: "commonErrors", label: "Não confundir com", iconName: "draft-state", placeholder: "Principal confusão que a lição precisa evitar." }
  ])
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChipList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .filter((item, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
  }
  return normalizeText(value)
    .split(/\s*[\n;,]\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
}

function normalizeStructuredFieldValue(fieldName, value) {
  if (fieldName === "notationRules" || fieldName === "outOfScopeRules") {
    return normalizeChipList(value).join(", ");
  }
  return normalizeText(value);
}

function getFieldDefinitions(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL[level] || SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL[SOURCE_GUIDE_LEVELS.LESSON];
}

export function normalizeSourceGuideStructured(value, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    getFieldDefinitions(level)
      .map((field) => [field.name, normalizeStructuredFieldValue(field.name, source[field.name])])
      .filter(([, fieldValue]) => fieldValue)
  );
}

export function buildSourceGuideText(structured, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  return getFieldDefinitions(level)
    .map((field) => {
      const value = normalizeText(structured?.[field.name]);
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function buildSourceGuideTextForModel(structured, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  return buildSourceGuideText(structured, { level });
}

export function resolveSourceGuidePayload(payload = {}, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const sourceGuideStructured = normalizeSourceGuideStructured(payload, { level });
  return {
    sourceGuide: buildSourceGuideText(sourceGuideStructured, { level }),
    sourceGuideStructured
  };
}

export function sanitizeSourceGuideStructuredForModel(value, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  return normalizeSourceGuideStructured(value, { level });
}

export function buildSourceGuideEditorFields(sourceGuideStructured = {}, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const normalized = normalizeSourceGuideStructured(sourceGuideStructured, { level });
  return getFieldDefinitions(level).map((field) => ({
    name: field.name,
    label: field.label,
    iconName: field.iconName,
    placeholder: field.placeholder,
    type: field.name === "notationRules" || field.name === "outOfScopeRules" ? "tokenlist" : "textarea",
    value:
      field.name === "notationRules" || field.name === "outOfScopeRules"
        ? normalizeChipList(normalized[field.name])
        : normalizeText(normalized[field.name]),
    maxLength: level === SOURCE_GUIDE_LEVELS.COURSE ? 160 : level === SOURCE_GUIDE_LEVELS.MODULE ? 140 : 120
  }));
}

export function getSourceGuideSchemaProperties(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return Object.fromEntries(getFieldDefinitions(level).map((field) => [field.name, { type: "string" }]));
}

export function getSourceGuideSchemaRequired(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return getFieldDefinitions(level).map((field) => field.name);
}

export function getSourceGuideSchemaPropertiesForModel(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return getSourceGuideSchemaProperties(level);
}
