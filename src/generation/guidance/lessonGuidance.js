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
  Object.freeze({ id: "graph", label: "Grafo" }),
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
  Object.freeze({ id: "notation", label: "Notação" }),
  Object.freeze({ id: "exam_pattern", label: "Formato de prova" }),
  Object.freeze({ id: "interpretation", label: "Interpretação" }),
  Object.freeze({ id: "tool_use", label: "Ferramenta" }),
  Object.freeze({ id: "error_diagnosis", label: "Erro" }),
  Object.freeze({ id: "source_reading", label: "Estudo de fonte" }),
  Object.freeze({ id: "review", label: "Revisão" })
]);

export const LESSON_LEARNING_ACTION_OPTIONS = Object.freeze([
  Object.freeze({ id: "understand", label: "Entender" }),
  Object.freeze({ id: "solve", label: "Resolver" }),
  Object.freeze({ id: "practice", label: "Praticar" }),
  Object.freeze({ id: "compare", label: "Comparar" }),
  Object.freeze({ id: "review", label: "Revisar" }),
  Object.freeze({ id: "read_source", label: "Analisar fonte" }),
  Object.freeze({ id: "use_tool", label: "Usar ferramenta" }),
  Object.freeze({ id: "fix_error", label: "Corrigir erro" })
]);

export const LESSON_SUPPORT_LEVEL_OPTIONS = Object.freeze([
  Object.freeze({ id: "very_guided", label: "Muito guiado" }),
  Object.freeze({ id: "guided", label: "Guiado" }),
  Object.freeze({ id: "intermediate", label: "Intermediário" }),
  Object.freeze({ id: "quick_review", label: "Revisão enxuta" })
]);

export const LESSON_GUIDANCE_PRESETS = Object.freeze([
  Object.freeze({
    id: "direto",
    label: "Direto",
    resourceTags: ["paragraph", "multiple_choice"],
    contentTypeTags: ["concept", "procedure"],
    learningActionTags: ["understand"],
    supportLevel: "quick_review"
  }),
  Object.freeze({
    id: "passo_a_passo",
    label: "Passo a passo",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice"],
    contentTypeTags: ["procedure", "notation"],
    learningActionTags: ["understand", "practice"],
    supportLevel: "very_guided"
  }),
  Object.freeze({
    id: "mais_completo",
    label: "Mais completo",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "table"],
    contentTypeTags: ["concept", "procedure", "comparison", "error_diagnosis"],
    learningActionTags: ["understand", "practice", "compare", "fix_error"],
    supportLevel: "guided"
  }),
  Object.freeze({
    id: "prova",
    label: "Prova",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "table"],
    contentTypeTags: ["procedure", "calculation", "exam_pattern"],
    learningActionTags: ["solve", "practice"],
    supportLevel: "intermediate"
  }),
  Object.freeze({
    id: "erro_comum",
    label: "Erro comum",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "table"],
    contentTypeTags: ["comparison", "error_diagnosis"],
    learningActionTags: ["compare", "fix_error", "practice"],
    supportLevel: "guided"
  }),
  Object.freeze({
    id: "pratica",
    label: "Prática",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "table"],
    contentTypeTags: ["procedure", "calculation"],
    learningActionTags: ["practice", "solve"],
    supportLevel: "guided"
  }),
  Object.freeze({
    id: "guided",
    label: "Guiado",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice"],
    contentTypeTags: ["concept", "procedure"],
    learningActionTags: ["understand", "practice"],
    supportLevel: "guided"
  }),
  Object.freeze({
    id: "practice",
    label: "Prática",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "table"],
    contentTypeTags: ["procedure", "calculation"],
    learningActionTags: ["practice", "solve"],
    supportLevel: "guided"
  }),
  Object.freeze({
    id: "visual",
    label: "Visual",
    resourceTags: ["paragraph", "multiple_choice", "table", "matrix", "plane", "graph", "flowchart", "tree"],
    contentTypeTags: ["comparison", "interpretation", "classification"],
    learningActionTags: ["understand", "compare"],
    supportLevel: "guided"
  }),
  Object.freeze({
    id: "code",
    label: "Código",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "code_editor", "tree"],
    contentTypeTags: ["procedure", "tool_use"],
    learningActionTags: ["practice", "use_tool"],
    supportLevel: "guided"
  }),
  Object.freeze({
    id: "review",
    label: "Revisão",
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice"],
    contentTypeTags: ["review", "error_diagnosis"],
    learningActionTags: ["review", "fix_error"],
    supportLevel: "quick_review"
  }),
  Object.freeze({
    id: "source",
    label: "Fonte",
    resourceTags: ["paragraph", "multiple_choice", "table", "tree"],
    contentTypeTags: ["source_reading", "interpretation"],
    learningActionTags: ["read_source", "understand"],
    supportLevel: "guided"
  })
]);

export const LESSON_GUIDANCE_DEFAULTS = Object.freeze({
  presetId: "passo_a_passo",
  resourceTags: Object.freeze(["paragraph", "block_gap_fill", "multiple_choice"]),
  contentTypeTags: Object.freeze(["procedure", "notation"]),
  learningActionTags: Object.freeze(["understand", "practice"]),
  supportLevel: "very_guided"
});

const RESOURCE_TAG_IDS = new Set(LESSON_RESOURCE_TAG_OPTIONS.map((item) => item.id));
const CONTENT_TYPE_IDS = new Set(LESSON_CONTENT_TYPE_OPTIONS.map((item) => item.id));
const LEARNING_ACTION_IDS = new Set(LESSON_LEARNING_ACTION_OPTIONS.map((item) => item.id));
const SUPPORT_LEVEL_IDS = new Set(LESSON_SUPPORT_LEVEL_OPTIONS.map((item) => item.id));
const PRESET_IDS = new Set(LESSON_GUIDANCE_PRESETS.map((item) => item.id));

export function getLessonGuidancePreset(presetId = "") {
  return LESSON_GUIDANCE_PRESETS.find((item) => item.id === text(presetId)) || null;
}

export function listLessonGuidancePresets() {
  return LESSON_GUIDANCE_PRESETS.map(clone);
}

export function buildLessonGuidanceFromPreset(presetId = "") {
  const preset = getLessonGuidancePreset(presetId) || LESSON_GUIDANCE_DEFAULTS;
  return {
    presetId: preset.id,
    resourceTags: [...preset.resourceTags],
    contentTypeTags: [...preset.contentTypeTags],
    learningActionTags: [...preset.learningActionTags],
    supportLevel: preset.supportLevel
  };
}

export function normalizeLessonGuidance(value = {}) {
  const presetId = PRESET_IDS.has(text(value?.presetId)) ? text(value?.presetId) : LESSON_GUIDANCE_DEFAULTS.presetId;
  const preset = buildLessonGuidanceFromPreset(presetId);
  const resourceTags = normalizeChoiceList(value?.resourceTags, RESOURCE_TAG_IDS);
  const contentTypeTags = normalizeChoiceList(value?.contentTypeTags, CONTENT_TYPE_IDS);
  const learningActionTags = normalizeChoiceList(value?.learningActionTags, LEARNING_ACTION_IDS);
  return {
    presetId,
    resourceTags: resourceTags.length ? resourceTags : [...preset.resourceTags],
    contentTypeTags: contentTypeTags.length ? contentTypeTags : [...preset.contentTypeTags],
    learningActionTags: learningActionTags.length ? learningActionTags : [...preset.learningActionTags],
    supportLevel: SUPPORT_LEVEL_IDS.has(text(value?.supportLevel)) ? text(value?.supportLevel) : preset.supportLevel
  };
}

export function buildLessonGuidanceEditorFields(value = {}) {
  const normalized = normalizeLessonGuidance(value);
  return [
    {
      name: "presetId",
      label: "Modo da lição",
      iconName: "intent",
      type: "select",
      options: LESSON_GUIDANCE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
      value: normalized.presetId,
      hint: "Escolha um modo pronto. Os campos abaixo servem apenas para ajuste fino quando necessário."
    },
    {
      name: "resourceTags",
      label: "Recursos da lição",
      iconName: "module",
      type: "multiselect",
      options: LESSON_RESOURCE_TAG_OPTIONS.map(clone),
      value: [...normalized.resourceTags],
      tone: "secondary",
      hint: "Ajuste fino dos recursos permitidos nesta lição."
    },
    {
      name: "contentTypeTags",
      label: "Tipos de conteúdo",
      iconName: "intent",
      type: "multiselect",
      options: LESSON_CONTENT_TYPE_OPTIONS.map(clone),
      value: [...normalized.contentTypeTags],
      tone: "secondary",
      hint: "Ajuste fino do recorte didático."
    },
    {
      name: "learningActionTags",
      label: "Ações de estudo",
      iconName: "prompt",
      type: "multiselect",
      options: LESSON_LEARNING_ACTION_OPTIONS.map(clone),
      value: [...normalized.learningActionTags],
      tone: "secondary",
      hint: "Ajuste fino do tipo de prática esperado."
    },
    {
      name: "supportLevel",
      label: "Nível de apoio",
      iconName: "ready-state",
      type: "select",
      options: LESSON_SUPPORT_LEVEL_OPTIONS.map(clone),
      value: normalized.supportLevel,
      tone: "secondary",
      hint: "Ajuste fino da intensidade de orientação."
    }
  ];
}

export function getLessonGuidanceSchemaProperties() {
  return {
    presetId: { type: "string", enum: [...PRESET_IDS] },
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
  return ["presetId", "resourceTags", "contentTypeTags", "learningActionTags", "supportLevel"];
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
