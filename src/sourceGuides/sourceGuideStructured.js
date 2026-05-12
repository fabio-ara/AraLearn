export const SOURCE_GUIDE_LEVELS = Object.freeze({
  COURSE: "course",
  MODULE: "module",
  LESSON: "lesson"
});

export const SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL = Object.freeze({
  [SOURCE_GUIDE_LEVELS.COURSE]: Object.freeze([
    { name: "audience", label: "Público e ponto de entrada", iconName: "module", placeholder: "Para quem é o curso." },
    { name: "globalScope", label: "Escopo do curso", iconName: "intent", placeholder: "O que o curso cobre." },
    { name: "globalOutOfScope", label: "Fora do curso", iconName: "excluded-state", placeholder: "O que não entra no curso." },
    { name: "sharedNotation", label: "Convenções gerais", iconName: "title", placeholder: "Símbolos e convenções globais." }
  ]),
  [SOURCE_GUIDE_LEVELS.MODULE]: Object.freeze([
    { name: "moduleScope", label: "Escopo do módulo", iconName: "intent", placeholder: "Qual recorte este módulo cobre." },
    { name: "modulePrerequisites", label: "Pré-requisitos locais", iconName: "module", placeholder: "O que o aluno já precisa trazer." },
    { name: "moduleOutOfScope", label: "Fora do módulo", iconName: "excluded-state", placeholder: "O que não entra neste módulo." },
    { name: "lessonProgression", label: "Progressão das lições", iconName: "prompt", placeholder: "Como as lições devem avançar." }
  ]),
  [SOURCE_GUIDE_LEVELS.LESSON]: Object.freeze([
    { name: "lessonGoal", label: "Meta da lição", iconName: "intent", placeholder: "O que esta lição precisa entregar." },
    { name: "lessonPrerequisites", label: "Pré-requisitos imediatos", iconName: "module", placeholder: "Base necessária antes desta lição." },
    { name: "notationRules", label: "Sinais e notação", iconName: "title", placeholder: "Símbolos e leituras obrigatórias." },
    { name: "commonErrors", label: "Confusões prováveis", iconName: "draft-state", placeholder: "Erros que a lição deve prevenir." },
    { name: "masteryGoal", label: "Ao final", iconName: "ready-state", placeholder: "O que o aluno fará sozinho ao final." }
  ])
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeItemList(value) {
  if (Array.isArray(value)) {
    const seen = new Set();
    return value
      .map((item) => normalizeText(item))
      .filter((item) => {
        if (!item) return false;
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  const text = normalizeText(value);
  if (!text) return [];
  const seen = new Set();
  return text
    .split(/\r?\n|;|•/g)
    .map((item) => normalizeText(item))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function joinItemList(value) {
  return normalizeItemList(value).join("; ");
}

function getFieldDefinitions(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL[level] || SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL[SOURCE_GUIDE_LEVELS.LESSON];
}

export function normalizeSourceGuideStructured(value, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    getFieldDefinitions(level)
      .map((field) => [field.name, joinItemList(source[field.name])])
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
    type: "tokenlist",
    value: normalizeItemList(normalized[field.name]),
    maxLength: level === SOURCE_GUIDE_LEVELS.COURSE ? 180 : level === SOURCE_GUIDE_LEVELS.MODULE ? 160 : 140
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
