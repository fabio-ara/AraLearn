export const SOURCE_GUIDE_LEVELS = Object.freeze({
  COURSE: "course",
  MODULE: "module",
  LESSON: "lesson"
});

const LEGACY_FIELD_ALIASES = Object.freeze({
  prerequisites: "lessonPrerequisites",
  coreScope: "lessonGoal",
  outOfScope: "moduleOutOfScope",
  explanationStyle: "freeNotes",
  practiceStyle: "freeNotes",
  commonErrors: "commonErrors",
  notationRules: "notationRules",
  consolidationGoal: "masteryGoal"
});

export const SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL = Object.freeze({
  [SOURCE_GUIDE_LEVELS.COURSE]: Object.freeze([
    {
      name: "audience",
      label: "Público e ponto de entrada",
      iconName: "module",
      placeholder: "Para quem é o curso e de onde o aluno parte."
    },
    {
      name: "globalScope",
      label: "Escopo do curso",
      iconName: "intent",
      placeholder: "O que este curso cobre de ponta a ponta."
    },
    {
      name: "globalOutOfScope",
      label: "Fora do curso",
      iconName: "excluded-state",
      placeholder: "O que não deve entrar neste curso."
    },
    {
      name: "sharedNotation",
      label: "Convenções gerais",
      iconName: "title",
      placeholder: "Símbolos, comandos ou convenções que valem no curso inteiro."
    },
    {
      name: "freeNotes",
      label: "Observações livres",
      iconName: "lesson",
      placeholder: "Notas complementares ou legado importado."
    }
  ]),
  [SOURCE_GUIDE_LEVELS.MODULE]: Object.freeze([
    {
      name: "moduleScope",
      label: "Escopo do módulo",
      iconName: "intent",
      placeholder: "Qual subdomínio este módulo cobre."
    },
    {
      name: "modulePrerequisites",
      label: "Pré-requisitos locais",
      iconName: "module",
      placeholder: "O que o aluno já precisa trazer para este módulo."
    },
    {
      name: "moduleOutOfScope",
      label: "Fora do módulo",
      iconName: "excluded-state",
      placeholder: "O que não deve entrar neste módulo."
    },
    {
      name: "lessonProgression",
      label: "Progressão das lições",
      iconName: "prompt",
      placeholder: "Como as lições deste módulo devem avançar."
    },
    {
      name: "freeNotes",
      label: "Observações livres",
      iconName: "lesson",
      placeholder: "Notas complementares ou legado importado."
    }
  ]),
  [SOURCE_GUIDE_LEVELS.LESSON]: Object.freeze([
    {
      name: "lessonGoal",
      label: "Meta da lição",
      iconName: "intent",
      placeholder: "O que esta lição precisa fazer o aluno entender ou executar."
    },
    {
      name: "lessonPrerequisites",
      label: "Pré-requisitos imediatos",
      iconName: "module",
      placeholder: "O que já deve estar dominado antes desta lição."
    },
    {
      name: "notationRules",
      label: "Sinais e notação",
      iconName: "title",
      placeholder: "Símbolos, comandos, fórmulas ou nomes que exigem destaque ou tradução."
    },
    {
      name: "commonErrors",
      label: "Confusões prováveis",
      iconName: "draft-state",
      placeholder: "Erros ou confusões que esta lição precisa prevenir."
    },
    {
      name: "masteryGoal",
      label: "Ao final",
      iconName: "ready-state",
      placeholder: "O que o aluno deve conseguir fazer sozinho ao final da lição."
    },
    {
      name: "freeNotes",
      label: "Observações livres",
      iconName: "lesson",
      placeholder: "Notas complementares ou legado importado."
    }
  ])
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getFieldDefinitions(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL[level] || SOURCE_GUIDE_FIELD_DEFINITIONS_BY_LEVEL[SOURCE_GUIDE_LEVELS.LESSON];
}

function getAllowedFieldNames(level) {
  return new Set(getFieldDefinitions(level).map((field) => field.name));
}

function cloneStructured(value = {}, level = SOURCE_GUIDE_LEVELS.LESSON) {
  return Object.fromEntries(
    getFieldDefinitions(level)
      .map((field) => [field.name, normalizeText(value?.[field.name])])
      .filter(([, item]) => item)
  );
}

function cloneStructuredForModel(value = {}, level = SOURCE_GUIDE_LEVELS.LESSON) {
  return Object.fromEntries(
    getFieldDefinitions(level)
      .filter((field) => field.name !== "freeNotes")
      .map((field) => [field.name, normalizeText(value?.[field.name])])
      .filter(([, item]) => item)
  );
}

function migrateLegacyStructured(value, level) {
  const normalized = {};
  const allowed = getAllowedFieldNames(level);
  Object.entries(value || {}).forEach(([key, item]) => {
    const nextKey = allowed.has(key) ? key : LEGACY_FIELD_ALIASES[key];
    if (!nextKey || !allowed.has(nextKey)) {
      return;
    }
    const nextValue = normalizeText(item);
    if (!nextValue) {
      return;
    }
    if (normalized[nextKey]) {
      normalized[nextKey] = `${normalized[nextKey]} ${nextValue}`.trim();
    } else {
      normalized[nextKey] = nextValue;
    }
  });
  return normalized;
}

export function normalizeSourceGuideStructured(value, { fallbackText = "", level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const hasPlainObject = value && typeof value === "object" && !Array.isArray(value);
  const normalized = hasPlainObject ? migrateLegacyStructured(value, level) : {};

  if (Object.keys(normalized).length) {
    return normalized;
  }

  const fallback = normalizeText(fallbackText);
  return fallback ? { freeNotes: fallback } : {};
}

export function buildSourceGuideText(structured, fallbackText = "", { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const hasStructuredInput =
    structured && typeof structured === "object" && !Array.isArray(structured) && Object.keys(cloneStructured(structured, level)).length > 0;
  if (!hasStructuredInput) {
    return normalizeText(fallbackText);
  }

  const normalized = normalizeSourceGuideStructured(structured, { fallbackText, level });
  const entries = getFieldDefinitions(level)
    .map((field) => {
      const value = normalizeText(normalized[field.name]);
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean);

  return entries.join("\n");
}

export function buildSourceGuideTextForModel(structured, fallbackText = "", { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const normalized = sanitizeSourceGuideStructuredForModel(structured, { fallbackText, level });
  const entries = getFieldDefinitions(level)
    .filter((field) => field.name !== "freeNotes")
    .map((field) => {
      const value = normalizeText(normalized[field.name]);
      return value ? `${field.label}: ${value}` : "";
    })
    .filter(Boolean);

  if (entries.length) {
    return entries.join("\n");
  }

  return normalizeText(fallbackText);
}

export function resolveSourceGuidePayload(payload = {}, previousText = "", { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const structured = normalizeSourceGuideStructured(payload, { level });
  const sourceGuide = buildSourceGuideText(structured, "", { level });

  return {
    sourceGuide,
    sourceGuideStructured: cloneStructured(structured, level)
  };
}

export function sanitizeSourceGuideStructuredForModel(value, { fallbackText = "", level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const normalized = normalizeSourceGuideStructured(value, { fallbackText, level });
  const compact = cloneStructuredForModel(normalized, level);
  return Object.keys(compact).length ? compact : {};
}

export function buildSourceGuideEditorFields(sourceGuide = "", sourceGuideStructured = {}, { level = SOURCE_GUIDE_LEVELS.LESSON } = {}) {
  const normalized = normalizeSourceGuideStructured(sourceGuideStructured, { fallbackText: sourceGuide, level });
  return getFieldDefinitions(level).map((field) => ({
    name: field.name,
    label: field.label,
    iconName: field.iconName,
    placeholder: field.placeholder,
    type: "textarea",
    value: normalizeText(normalized[field.name]),
    tone: field.name === "freeNotes" ? "secondary" : "primary",
    hint:
      field.name === "freeNotes"
        ? "Campo auxiliar para autoria humana. Não entra no núcleo estruturado enviado ao modelo quando a governança principal já estiver preenchida."
        : ""
  }));
}

export function getSourceGuideSchemaProperties(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return Object.fromEntries(getFieldDefinitions(level).map((field) => [field.name, { type: "string" }]));
}

export function getSourceGuideSchemaRequired(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return getFieldDefinitions(level)
    .filter((field) => field.name !== "freeNotes")
    .map((field) => field.name);
}

export function getSourceGuideSchemaPropertiesForModel(level = SOURCE_GUIDE_LEVELS.LESSON) {
  return Object.fromEntries(
    getFieldDefinitions(level)
      .filter((field) => field.name !== "freeNotes")
      .map((field) => [field.name, { type: "string" }])
  );
}
