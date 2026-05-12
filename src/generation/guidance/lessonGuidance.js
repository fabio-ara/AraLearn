function clone(value) {
  return structuredClone(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeChoiceList(items = [], allowedIds = new Set()) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => text(item))
    .filter((item) => {
      if (!allowedIds.has(item) || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

export const LESSON_RESOURCE_TAG_OPTIONS = Object.freeze([
  Object.freeze({ id: "paragraph", label: "Texto" }),
  Object.freeze({ id: "block_gap_fill", label: "Lacunas" }),
  Object.freeze({ id: "multiple_choice", label: "Múltipla escolha" }),
  Object.freeze({ id: "table", label: "Tabela" }),
  Object.freeze({ id: "code_editor", label: "Editor de código" }),
  Object.freeze({ id: "flowchart", label: "Fluxograma" }),
  Object.freeze({ id: "tree", label: "Árvore" }),
  Object.freeze({ id: "matrix", label: "Matriz" }),
  Object.freeze({ id: "plane", label: "Plano cartesiano" })
]);

export const LESSON_CONTENT_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ id: "concept", label: "Conceito" }),
  Object.freeze({ id: "procedure", label: "Procedimento" }),
  Object.freeze({ id: "comparison", label: "Comparação" }),
  Object.freeze({ id: "classification", label: "Classificação" }),
  Object.freeze({ id: "calculation", label: "Cálculo" }),
  Object.freeze({ id: "interpretation", label: "Interpretação" }),
  Object.freeze({ id: "tool_use", label: "Ferramenta" }),
  Object.freeze({ id: "error_diagnosis", label: "Erro" }),
  Object.freeze({ id: "source_reading", label: "Leitura de fonte" }),
  Object.freeze({ id: "review", label: "Revisão" })
]);

export const LESSON_LEARNING_ACTION_OPTIONS = Object.freeze([
  Object.freeze({ id: "understand", label: "Entender" }),
  Object.freeze({ id: "solve", label: "Resolver" }),
  Object.freeze({ id: "practice", label: "Praticar" }),
  Object.freeze({ id: "compare", label: "Comparar" }),
  Object.freeze({ id: "review", label: "Revisar" }),
  Object.freeze({ id: "read_source", label: "Ler fonte" }),
  Object.freeze({ id: "use_tool", label: "Usar ferramenta" }),
  Object.freeze({ id: "fix_error", label: "Corrigir erro" })
]);

export const LESSON_SUPPORT_LEVEL_OPTIONS = Object.freeze([
  Object.freeze({ id: "very_guided", label: "Muito guiado" }),
  Object.freeze({ id: "guided", label: "Guiado" }),
  Object.freeze({ id: "intermediate", label: "Intermediário" }),
  Object.freeze({ id: "quick_review", label: "Revisão rápida" })
]);

export const LESSON_GUIDANCE_DEFAULTS = Object.freeze({
  resourceTags: Object.freeze(["paragraph", "block_gap_fill", "multiple_choice"]),
  contentTypeTags: Object.freeze(["concept"]),
  learningActionTags: Object.freeze(["understand", "practice"]),
  supportLevel: "guided"
});

const RESOURCE_TAG_IDS = new Set(LESSON_RESOURCE_TAG_OPTIONS.map((item) => item.id));
const CONTENT_TYPE_IDS = new Set(LESSON_CONTENT_TYPE_OPTIONS.map((item) => item.id));
const LEARNING_ACTION_IDS = new Set(LESSON_LEARNING_ACTION_OPTIONS.map((item) => item.id));
const SUPPORT_LEVEL_IDS = new Set(LESSON_SUPPORT_LEVEL_OPTIONS.map((item) => item.id));

export function normalizeLessonGuidance(value = {}) {
  return {
    resourceTags:
      normalizeChoiceList(value?.resourceTags, RESOURCE_TAG_IDS).length > 0
        ? normalizeChoiceList(value?.resourceTags, RESOURCE_TAG_IDS)
        : [...LESSON_GUIDANCE_DEFAULTS.resourceTags],
    contentTypeTags:
      normalizeChoiceList(value?.contentTypeTags, CONTENT_TYPE_IDS).length > 0
        ? normalizeChoiceList(value?.contentTypeTags, CONTENT_TYPE_IDS)
        : [...LESSON_GUIDANCE_DEFAULTS.contentTypeTags],
    learningActionTags:
      normalizeChoiceList(value?.learningActionTags, LEARNING_ACTION_IDS).length > 0
        ? normalizeChoiceList(value?.learningActionTags, LEARNING_ACTION_IDS)
        : [...LESSON_GUIDANCE_DEFAULTS.learningActionTags],
    supportLevel: SUPPORT_LEVEL_IDS.has(text(value?.supportLevel)) ? text(value?.supportLevel) : LESSON_GUIDANCE_DEFAULTS.supportLevel
  };
}

export function buildLessonGuidanceEditorFields(value = {}) {
  const normalized = normalizeLessonGuidance(value);
  return [
    {
      name: "resourceTags",
      label: "Recursos da lição",
      iconName: "module",
      type: "multiselect",
      options: LESSON_RESOURCE_TAG_OPTIONS.map(clone),
      value: [...normalized.resourceTags],
      hint: "Selecione os recursos permitidos. Digite para filtrar, Enter para adicionar e × para remover."
    },
    {
      name: "contentTypeTags",
      label: "Tipos de conteúdo",
      iconName: "intent",
      type: "multiselect",
      options: LESSON_CONTENT_TYPE_OPTIONS.map(clone),
      value: [...normalized.contentTypeTags],
      hint: "Mantenha apenas os tipos de conteúdo que a lição realmente pode usar."
    },
    {
      name: "learningActionTags",
      label: "Ações de estudo",
      iconName: "prompt",
      type: "multiselect",
      options: LESSON_LEARNING_ACTION_OPTIONS.map(clone),
      value: [...normalized.learningActionTags],
      hint: "Defina as ações de estudo que a geração pode cobrar nesta lição."
    },
    {
      name: "supportLevel",
      label: "Nível de apoio",
      iconName: "ready-state",
      type: "select",
      options: LESSON_SUPPORT_LEVEL_OPTIONS.map(clone),
      value: normalized.supportLevel
    }
  ];
}

export function getLessonGuidanceSchemaProperties() {
  return {
    resourceTags: {
      type: "array",
      items: { type: "string", enum: [...RESOURCE_TAG_IDS] },
      minItems: 1,
      uniqueItems: true
    },
    contentTypeTags: {
      type: "array",
      items: { type: "string", enum: [...CONTENT_TYPE_IDS] },
      minItems: 1,
      uniqueItems: true
    },
    learningActionTags: {
      type: "array",
      items: { type: "string", enum: [...LEARNING_ACTION_IDS] },
      minItems: 1,
      uniqueItems: true
    },
    supportLevel: { type: "string", enum: [...SUPPORT_LEVEL_IDS] }
  };
}

export function getLessonGuidanceSchemaRequired() {
  return ["resourceTags", "contentTypeTags", "learningActionTags", "supportLevel"];
}

export function listLessonResourceTagIds() {
  return [...RESOURCE_TAG_IDS];
}

export function listLessonContentTypeIds() {
  return [...CONTENT_TYPE_IDS];
}

export function listLessonLearningActionIds() {
  return [...LEARNING_ACTION_IDS];
}

export function listLessonSupportLevelIds() {
  return [...SUPPORT_LEVEL_IDS];
}
