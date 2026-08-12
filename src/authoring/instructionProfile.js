export const AUTHORING_CALIBRATION_VERSION = 1;
export const AUTHORING_CALIBRATION_STORAGE_KEY = "aralearn.authoring-calibration.v1";

export const PROTECTED_AUTHORING_CORE_VERSION = 1;

export const PROTECTED_AUTHORING_CORE_MODULES = Object.freeze([
  Object.freeze({
    id: "pedagogical-integrity",
    title: "Integridade pedagógica",
    protected: true,
    text: "Ensine para uma pessoa que encontra o assunto pela primeira vez, salvo pré-requisito explicitamente comprovado. Simplicidade é a porta de entrada para a profundidade, não autorização para resumir, omitir fundamento ou tornar o conteúdo raso. A teoria precisa tornar cada conceito compreensível antes de a prática cobrá-lo."
  }),
  Object.freeze({
    id: "blueprint-first",
    title: "Planejamento anterior ao custo",
    protected: true,
    text: "Planeje a progressão didática antes de produzir JSON ou estimar quantidade de cards. A quantidade de teoria e prática varia conforme as camadas conceituais, os erros prováveis e as decisões que precisam ser demonstradas. Não compacte para reduzir chamadas, cards ou armazenamento."
  }),
  Object.freeze({
    id: "package-discovery",
    title: "Descoberta de packages sob demanda",
    protected: true,
    text: "Receba primeiro apenas o catálogo compacto de packages. Selecione cada representação pela operação cognitiva do passo planejado; em seguida, solicite somente o contrato da versão escolhida. Não suponha um contrato monolítico nem invente campos de package."
  }),
  Object.freeze({
    id: "stage-and-persistence-integrity",
    title: "Integridade operacional",
    protected: true,
    text: "Respeite escopo, permissões, revisão corrente e etapas editoriais. Só afirme persistência depois da confirmação da ferramenta. Conteúdo estruturalmente válido ainda precisa de julgamento pedagógico e auditoria independente."
  })
]);

export const AUTHORING_PREFERENCE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "tone-and-approach",
    title: "Tom e aproximação",
    help: "Como a explicação deve se aproximar de quem está aprendendo.",
    effect: "Influencia a voz e a entrada de cada explicação; não permite resumir nem remover fundamentos.",
    text: "Use linguagem acolhedora, direta e adulta. Quando o assunto for abstrato, comece por uma intuição simples e avance em camadas, sem infantilizar o estudante."
  }),
  Object.freeze({
    id: "examples-and-context",
    title: "Exemplos e contexto",
    help: "Que tipo de situação concreta ajuda a dar chão aos conceitos.",
    effect: "Orienta exemplos e analogias; não substitui a explicação conceitual precisa.",
    text: "Prefira exemplos concretos e cenários reconhecíveis antes de generalizar. Use analogias somente quando ajudarem e explicite onde elas deixam de corresponder ao conceito técnico."
  }),
  Object.freeze({
    id: "practice-variation",
    title: "Variação da prática",
    help: "Como diversificar a prática depois que a teoria foi ensinada.",
    effect: "Orienta a variedade das operações cognitivas; não fixa quantidade de cards nem quotas de resource.",
    text: "Varie as práticas pelo que o estudante precisa demonstrar: reconhecer, explicar, relacionar, ordenar, completar, aplicar e distinguir erros plausíveis. Evite repetir apenas escolhas de reconhecimento."
  }),
  Object.freeze({
    id: "terminology-and-notation",
    title: "Terminologia e notação",
    help: "Como apresentar termos, siglas e notações novas.",
    effect: "Orienta a forma textual; o contrato do package continua determinando a estrutura do card.",
    text: "Apresente o nome completo antes da sigla e dê significado a cada termo antes de reutilizá-lo. Marque como código toda a expressão técnica completa, incluindo a sigla entre parênteses, quando essa for a unidade conceitual."
  })
]);

export const AUTHORING_DEFAULT_PRESET = Object.freeze({
  id: "aralearn-progressive-dense",
  title: "AraLearn — progressivo e denso"
});

const MAX_PREFERENCE_LENGTH = 1600;

function normalizedText(value) {
  return String(value ?? "").trim();
}

export function composeProtectedAuthoringCore() {
  return PROTECTED_AUTHORING_CORE_MODULES.map(({ text }) => text).join(" ");
}

export function createDefaultAuthoringProfile() {
  return {
    version: AUTHORING_CALIBRATION_VERSION,
    presetId: AUTHORING_DEFAULT_PRESET.id,
    preferences: Object.fromEntries(
      AUTHORING_PREFERENCE_DEFINITIONS.map(({ id, text }) => [id, text])
    )
  };
}

export function normalizeAuthoringProfile(value) {
  const fallback = createDefaultAuthoringProfile();
  if (!value || value.version !== AUTHORING_CALIBRATION_VERSION) return fallback;
  const source = value.preferences && typeof value.preferences === "object"
    ? value.preferences
    : {};
  return {
    version: AUTHORING_CALIBRATION_VERSION,
    presetId: AUTHORING_DEFAULT_PRESET.id,
    preferences: Object.fromEntries(AUTHORING_PREFERENCE_DEFINITIONS.map((definition) => {
      const candidate = normalizedText(source[definition.id]);
      return [
        definition.id,
        candidate && candidate.length <= MAX_PREFERENCE_LENGTH ? candidate : definition.text
      ];
    }))
  };
}

export function validateAuthoringProfile(value) {
  if (!value || value.version !== AUTHORING_CALIBRATION_VERSION) {
    return { valid: false, errors: ["Versão de calibração incompatível."] };
  }
  const errors = [];
  const preferences = value.preferences && typeof value.preferences === "object"
    ? value.preferences
    : {};
  for (const definition of AUTHORING_PREFERENCE_DEFINITIONS) {
    const text = normalizedText(preferences[definition.id]);
    if (!text) errors.push(`${definition.title}: escreva uma orientação.`);
    if (text.length > MAX_PREFERENCE_LENGTH) {
      errors.push(`${definition.title}: use no máximo ${MAX_PREFERENCE_LENGTH} caracteres.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function authoringProfileDiff(value) {
  const profile = normalizeAuthoringProfile(value);
  return AUTHORING_PREFERENCE_DEFINITIONS.filter(
    ({ id, text }) => profile.preferences[id] !== text
  ).map(({ id }) => id);
}

export function composeAuthoringPreferences(value) {
  const profile = normalizeAuthoringProfile(value);
  const validation = validateAuthoringProfile(profile);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  const modules = AUTHORING_PREFERENCE_DEFINITIONS.map(
    ({ title, id }) => `### ${title}\n${profile.preferences[id]}`
  ).join("\n\n");
  return [
    "## Preferências pessoais de autoria",
    `Contrato: aralearn.authoring-calibration.v${AUTHORING_CALIBRATION_VERSION}`,
    "Precedência: núcleo pedagógico protegido > conhecimento protegido > preferências pessoais.",
    "Estas preferências calibram detalhes. Em caso de conflito, preserve integralmente as regras protegidas.",
    modules
  ].join("\n\n");
}

export function serializeAuthoringProfile(value) {
  const profile = normalizeAuthoringProfile(value);
  const validation = validateAuthoringProfile(profile);
  if (!validation.valid) throw new TypeError(validation.errors.join(" "));
  return `${JSON.stringify(profile, null, 2)}\n`;
}
