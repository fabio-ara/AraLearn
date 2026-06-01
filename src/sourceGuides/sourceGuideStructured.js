export const GUIDE_LEVELS = Object.freeze({
  COURSE: "course",
  MODULE: "module",
  LESSON: "lesson"
});

export const GUIDE_FIELDS = Object.freeze(["goal", "include", "exclude", "notation", "avoid"]);

export const GUIDE_FIELD_DEFINITIONS_BY_LEVEL = Object.freeze({
  [GUIDE_LEVELS.COURSE]: Object.freeze([]),
  [GUIDE_LEVELS.MODULE]: Object.freeze([
    { name: "goal", label: "Meta", iconName: "intent", placeholder: "O que este módulo precisa entregar." },
    { name: "include", label: "Incluir", iconName: "title", placeholder: "O que entra neste módulo." },
    { name: "exclude", label: "Não incluir", iconName: "module", placeholder: "O que não entra neste módulo." },
    { name: "notation", label: "Notação", iconName: "draft-state", placeholder: "Regras de notação do módulo." },
    { name: "avoid", label: "Evitar", iconName: "warning", placeholder: "Confusões e desvios a evitar." }
  ]),
  [GUIDE_LEVELS.LESSON]: Object.freeze([
    { name: "goal", label: "Meta", iconName: "intent", placeholder: "O que esta lição precisa entregar." },
    { name: "include", label: "Incluir", iconName: "title", placeholder: "O que entra nesta lição." },
    { name: "exclude", label: "Não incluir", iconName: "module", placeholder: "O que fica fora desta lição." },
    { name: "notation", label: "Notação", iconName: "draft-state", placeholder: "Regras de notação da lição." },
    { name: "avoid", label: "Evitar", iconName: "warning", placeholder: "Confusões e desvios a evitar." }
  ])
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueList(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((item) => normalizeText(item))
    .filter((item) => {
      const token = item.toLowerCase();
      if (!item || seen.has(token)) {
        return false;
      }
      seen.add(token);
      return true;
    });
}

function normalizeChipList(value) {
  if (Array.isArray(value)) {
    return uniqueList(value);
  }
  return uniqueList(
    normalizeText(value)
      .split(/\s*[\n;,]\s*/g)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function isListField(fieldName) {
  return fieldName === "include" || fieldName === "exclude" || fieldName === "notation";
}

function normalizeFieldValue(fieldName, value) {
  if (isListField(fieldName)) {
    return normalizeChipList(value);
  }
  return normalizeText(value);
}

function getFieldDefinitions(level = GUIDE_LEVELS.LESSON) {
  return GUIDE_FIELD_DEFINITIONS_BY_LEVEL[level]
    || GUIDE_FIELD_DEFINITIONS_BY_LEVEL[GUIDE_LEVELS.LESSON];
}

export function normalizeGuide(value, { level = GUIDE_LEVELS.LESSON } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = Object.fromEntries(
    getFieldDefinitions(level)
      .map((field) => [field.name, normalizeFieldValue(field.name, source[field.name])])
      .filter(([, fieldValue]) => {
        if (Array.isArray(fieldValue)) {
          return fieldValue.length > 0;
        }
        return Boolean(fieldValue);
      })
  );
  if (level !== GUIDE_LEVELS.COURSE && !normalized.include) {
    normalized.include = [];
  }
  if (level !== GUIDE_LEVELS.COURSE && !normalized.exclude) {
    normalized.exclude = [];
  }
  if (level !== GUIDE_LEVELS.COURSE && !normalized.notation) {
    normalized.notation = [];
  }
  if (level !== GUIDE_LEVELS.COURSE && !normalized.avoid) {
    normalized.avoid = [];
  }
  return normalized;
}

export function buildGuideText(structured, { level = GUIDE_LEVELS.LESSON } = {}) {
  return getFieldDefinitions(level)
    .map((field) => {
      const value = structured?.[field.name];
      if (Array.isArray(value)) {
        return value.length ? `${field.label}: ${value.join(", ")}` : "";
      }
      return normalizeText(value) ? `${field.label}: ${normalizeText(value)}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function buildGuideTextForModel(structured, { level = GUIDE_LEVELS.LESSON } = {}) {
  return buildGuideText(structured, { level });
}

export function resolveGuidePayload(payload = {}, { level = GUIDE_LEVELS.LESSON } = {}) {
  const guide = normalizeGuide(payload, { level });
  return {
    guideText: buildGuideText(guide, { level }),
    guide
  };
}

export function sanitizeGuideForModel(value, { level = GUIDE_LEVELS.LESSON } = {}) {
  return normalizeGuide(value, { level });
}

export function buildGuideEditorFields(guide = {}, { level = GUIDE_LEVELS.LESSON } = {}) {
  const normalized = normalizeGuide(guide, { level });
  return getFieldDefinitions(level).map((field) => ({
    name: field.name,
    label: field.label,
    iconName: field.iconName,
    placeholder: field.placeholder,
    type: isListField(field.name) ? "tokenlist" : "textarea",
    value: isListField(field.name) ? normalizeChipList(normalized[field.name]) : normalizeText(normalized[field.name]),
    maxLength: level === GUIDE_LEVELS.COURSE ? 160 : level === GUIDE_LEVELS.MODULE ? 140 : 120
  }));
}

export function getGuideSchemaProperties(level = GUIDE_LEVELS.LESSON) {
  return Object.fromEntries(
    getFieldDefinitions(level).map((field) => [
      field.name,
      isListField(field.name)
        ? { type: "array", items: { type: "string" } }
        : { type: "string" }
    ])
  );
}

export function getGuideSchemaRequired(level = GUIDE_LEVELS.LESSON) {
  return getFieldDefinitions(level).map((field) => field.name);
}

export function getGuideSchemaPropertiesForModel(level = GUIDE_LEVELS.LESSON) {
  return getGuideSchemaProperties(level);
}
