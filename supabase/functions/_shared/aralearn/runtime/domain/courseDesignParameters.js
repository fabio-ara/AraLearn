import { RESOURCE_CATALOG, RESOURCE_PACKAGE_REGISTRY } from "../resources/catalog/resourceCatalog.js";
import { RESOURCE_PACKAGE_CONTRACT_FINGERPRINT } from "../resources/packages/generated.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const COMPONENT_REF_PATTERN = /^aralearn\.(?:resource|response)\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*@(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const encoder = new TextEncoder();

export const COURSE_DESIGN_CONTRACT = "aralearn.course-design.v3";
export const COURSE_DESIGN_CHANGE_CONTRACT = "aralearn.course-design-change.v3";
export const COURSE_DESIGN_PARAMETER_CATALOG_VERSION = "1.2.1";
export const COURSE_COMPONENT_CATALOG_VERSION = RESOURCE_CATALOG.catalogVersion;
export const COURSE_COMPONENT_CATALOG_SCHEMA_FINGERPRINT = RESOURCE_PACKAGE_CONTRACT_FINGERPRINT;
export const COURSE_COMPONENT_CATALOG = Object.freeze({
  version: COURSE_COMPONENT_CATALOG_VERSION,
  schemaFingerprint: COURSE_COMPONENT_CATALOG_SCHEMA_FINGERPRINT,
  options: Object.freeze(RESOURCE_PACKAGE_REGISTRY.listCatalog().map(({ id, version, label, purpose }) =>
    Object.freeze({ ref: `${id}@${version}`, label, purpose })))
});

export const EXPLANATION_FORMS = Object.freeze([
  "plain_definition",
  "concrete_example",
  "mechanism",
  "contrast",
  "application_condition",
  "limit_or_exception",
  "worked_example",
  "representation_link"
]);

export const PRACTICE_VARIATION_DIMENSIONS = Object.freeze([
  "case_or_data",
  "context",
  "task_feature",
  "external_representation",
  "support_level"
]);

// Fonte das definições de UI, integrações e projeção SQL. Os valores orientam
// decisões; contagens e preferências não certificam adequação pedagógica.
const PEDAGOGICAL_PARAMETER_SCOPES = Object.freeze([
  "course",
  "lesson",
  "didactic_microsequence",
  "study_unit"
]);
const DESIGN_SCOPES = Object.freeze([
  "course",
  "module",
  "lesson",
  "didactic_microsequence",
  "study_unit"
]);
const ASSIGNMENT_ORIGINS = Object.freeze([
  "automatic",
  "author",
  "research_condition"
]);
const COMMAND_TYPES = Object.freeze([
  "set_parameter",
  "delegate_parameter",
  "clear_parameter",
  "set_guidance",
  "clear_guidance",
  "set_component_policy",
  "clear_component_policy",
  "apply_profile"
]);

export const COURSE_DESIGN_PARAMETER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "new_analysis_unit_ceiling_per_expository_study_unit",
    humanField: "maximo_ideias_novas_por_unidade", group: "content", groupLabel: "Explicações", unitLabel: "identidades introduzidas", optionLabels: Object.freeze({}),
    label: "Novas unidades de análise",
    construct: "Quantidade de unidades da análise instrucional introduzidas como novas em uma mesma unidade de estudo expositiva.",
    operationalization: "Conta identidades distintas declaradas como introduzidas em cada unidade expositiva ou mista; não usa caracteres, linhas, altura nem tempo como proxy.",
    limitations: "A contagem orienta granularidade de desenho e não mede carga cognitiva, dificuldade, aprendizagem ou qualidade da explicação.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["koedinger2012kli", "chen2023elementinteractivity"]),
    supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }),
    defaultValue: 2
  }),
  Object.freeze({
    id: "required_explanation_forms",
    humanField: "formas_de_explicacao", group: "content", groupLabel: "Explicações", unitLabel: "formas de explicação", optionLabels: Object.freeze({plain_definition:"Definição",concrete_example:"Exemplo concreto",mechanism:"Mecanismo",contrast:"Contraste",application_condition:"Condição de aplicação",limit_or_exception:"Limite ou exceção",worked_example:"Exemplo resolvido",representation_link:"Relação entre representações"}),
    label: "Formas de explicação",
    construct: "Formas semanticamente distintas usadas para desenvolver uma unidade da análise instrucional.",
    operationalization: "Verifica, por identidade introduzida, quais formas foram desenvolvidas e quais foram declaradas não aplicáveis com motivo factual.",
    limitations: "As formas não são uma escala de qualidade nem uma lista universal; adequação depende do objeto, público, tarefa e representação.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["wittwer2008explanations", "ainsworth2006deft"]),
    supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({
      type: "set",
      allowedValues: EXPLANATION_FORMS,
      minimumItems: 1,
      maximumItems: EXPLANATION_FORMS.length
    }),
    defaultValue: Object.freeze([
      "plain_definition",
      "concrete_example",
      "mechanism",
      "contrast"
    ])
  }),
  Object.freeze({
    id: "minimum_distinct_practice_opportunities_per_evidence_requirement",
    humanField: "oportunidades_distintas_por_requisito", group: "practice", groupLabel: "Prática", unitLabel: "oportunidades distintas", optionLabels: Object.freeze({}),
    label: "Oportunidades por requisito",
    construct: "Quantidade mínima de oportunidades semanticamente distintas relacionadas a cada requisito de evidência.",
    operationalization: "Conta opportunityId distinto por requisito de evidência e conserva a operação-alvo invariável declarada em cada oportunidade.",
    limitations: "Quantidade de oportunidades não demonstra domínio, eficácia ou equivalência entre tarefas; a pertinência da evidência permanece uma hipótese de desenho.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["karpicke2008retrieval", "mislevy2003ecd"]),
    supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }),
    defaultValue: 2
  }),
  Object.freeze({
    id: "required_practice_variation_dimensions",
    humanField: "dimensoes_de_variacao_da_pratica", group: "practice", groupLabel: "Prática", unitLabel: "dimensões de variação", optionLabels: Object.freeze({case_or_data:"Caso ou dados",context:"Contexto",task_feature:"Característica da tarefa",external_representation:"Representação",support_level:"Nível de apoio"}),
    label: "Variação da prática",
    construct: "Dimensões semanticamente relevantes que variam entre oportunidades relacionadas ao mesmo requisito de evidência.",
    operationalization: "Verifica as dimensões declaradas nas oportunidades sem tratar mudança cosmética ou reordenação como variação semântica.",
    limitations: "Variação declarada não prova transferência nem aprendizagem e precisa preservar a operação-alvo pertinente ao requisito.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["taylor2010interleaved", "ainsworth2006deft"]),
    supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({
      type: "set",
      allowedValues: PRACTICE_VARIATION_DIMENSIONS,
      minimumItems: 1,
      maximumItems: PRACTICE_VARIATION_DIMENSIONS.length
    }),
    defaultValue: Object.freeze(["case_or_data"])
  }),
  Object.freeze({
    id: "authoring_chat_response_word_target",
    humanField: "alvo_palavras_conversa", group: "conversation", groupLabel: "Conversa", unitLabel: "palavras por resposta", optionLabels: Object.freeze({}),
    label: "Extensão das respostas",
    construct: "Extensão editorial pretendida para uma resposta do assistente durante a autoria.",
    operationalization: "Informa ao assistente um alvo flexível de palavras para a decisão corrente; respostas podem ultrapassá-lo quando a inspeção ou a segurança exigir.",
    limitations: "O alvo não é limite rígido e não autoriza esconder decisões educacionais, reduzir cobertura nem expor detalhes internos.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze([]),
    supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "integer", minimum: 20, maximum: 500 }),
    defaultValue: 120
  }),
  Object.freeze({
    id: "study_unit_content_word_target",
    humanField: "alvo_palavras_unidade", group: "editorial", groupLabel: "Leitura e estilo", unitLabel: "palavras por unidade", optionLabels: Object.freeze({}),
    label: "Extensão das unidades",
    construct: "Extensão editorial pretendida para o conteúdo de uma unidade de estudo focal.",
    operationalization: "Orienta a distribuição do conteúdo em torno de um alvo flexível, depois de satisfeitas a função didática e as dependências necessárias.",
    limitations: "O alvo não é máximo, não mede qualidade ou carga cognitiva e não justifica compactação nem atomização.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze([]),
    supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "integer", minimum: 40, maximum: 1000 }),
    defaultValue: 180
  }),
  Object.freeze({
    id: "practice_distribution", humanField: "distribuicao_da_pratica", group: "practice", groupLabel: "Prática", unitLabel: "organização da sequência",
    label: "Distribuição das práticas", construct: "Organização das oportunidades de prática entre as exposições.",
    operationalization: "Observa posições e intervalos das unidades declaradas expositivas, práticas ou mistas; intercalar prefere prática entre exposições e agrupar prefere blocos.",
    limitations: "A distribuição é contextual; uma sequência curta ou mista não permite certificar alternância nem qualidade por contagem.",
    defaultStatus: "product_hypothesis", evidenceRefs: Object.freeze([]), supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "enum", allowedValues: Object.freeze(["interleaved", "clustered"]) }),
    optionLabels: Object.freeze({interleaved:"Intercalada",clustered:"Agrupada"}), defaultValue: "interleaved"
  }),
  Object.freeze({
    id: "practice_position", humanField: "posicao_da_pratica", group: "practice", groupLabel: "Prática", unitLabel: "posição em relação à explicação",
    label: "Posição das práticas", construct: "Posição pretendida da prática em relação à explicação pertinente.",
    operationalization: "Orienta prática antes, depois ou antes e depois da explicação; posições declaradas são observáveis sem inferir equivalência semântica.",
    limitations: "A posição não demonstra recuperação, domínio ou eficácia e precisa de justificativa compatível com o repertório e o objetivo.",
    defaultStatus: "product_hypothesis", evidenceRefs: Object.freeze([]), supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "enum", allowedValues: Object.freeze(["before_explanation", "after_explanation", "before_and_after"]) }),
    optionLabels: Object.freeze({before_explanation:"Antes da explicação",after_explanation:"Depois da explicação",before_and_after:"Antes e depois"}), defaultValue: "after_explanation"
  }),
  Object.freeze({
    id: "authoring_part_microsequence_target", humanField: "alvo_microssequencias_por_parte", group: "cadence", groupLabel: "Produção", unitLabel: "microssequências por parte",
    label: "Granularidade da parte", construct: "Tamanho contextual da parte de produção, independente da quantidade de conteúdo curricular.",
    operationalization: "Orienta quantas microssequências existentes uma parte de produção pretende reunir, preservando cobertura, dependências e limites de transporte.",
    limitations: "Uma parte é uma organização de trabalho; não é unidade curricular nem autoriza truncar material ou dividir identidades para caber.",
    defaultStatus: "product_hypothesis", evidenceRefs: Object.freeze([]), supportedScopes: Object.freeze(["course"]),
    valueSchema: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }), optionLabels: Object.freeze({}), defaultValue: 1
  }),
  Object.freeze({
    id: "authoring_batch_part_target", humanField: "alvo_partes_por_lote", group: "cadence", groupLabel: "Produção", unitLabel: "partes por lote",
    label: "Granularidade do lote", construct: "Quantidade contextual de partes a preparar no mesmo lote autorizado.",
    operationalization: "Orienta a cadência do trabalho mantendo cada parte e sua confirmação; não altera automaticamente frequência de pausa.",
    limitations: "Número de lotes não mede conteúdo nem aprendizagem e não amplia o mandato de aplicar propostas.",
    defaultStatus: "product_hypothesis", evidenceRefs: Object.freeze([]), supportedScopes: Object.freeze(["course"]),
    valueSchema: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }), optionLabels: Object.freeze({}), defaultValue: 1
  }),
  Object.freeze({
    id: "authoring_pause_frequency", humanField: "frequencia_de_pausa", group: "cadence", groupLabel: "Produção", unitLabel: "momento de pausa",
    label: "Frequência de pausa", construct: "Preferência por pontos de discussão e revisão durante a produção.",
    operationalization: "Define pontos de pausa por microssequência, parte, lote ou solicitação; permanece independente da granularidade da parte e do lote.",
    limitations: "A preferência não remove confirmações de aplicação, autorização do autor nem limites operacionais.",
    defaultStatus: "product_hypothesis", evidenceRefs: Object.freeze([]), supportedScopes: Object.freeze(["course"]),
    valueSchema: Object.freeze({ type: "enum", allowedValues: Object.freeze(["each_microsequence", "each_part", "each_batch", "on_request"]) }),
    optionLabels: Object.freeze({each_microsequence:"A cada microssequência",each_part:"A cada parte",each_batch:"A cada lote",on_request:"Quando solicitado"}), defaultValue: "each_part"
  }),
  Object.freeze({
    id: "authoring_chat_interaction", humanField: "preferencia_da_conversa", group: "conversation", groupLabel: "Conversa", unitLabel: "forma da conversa",
    label: "Preferência da conversa", construct: "Preferência editorial por concisão, debate ou explicação na conversa de autoria.",
    operationalization: "Orienta como o assistente discute a decisão corrente: concisão, exame de alternativas e argumentos, ou explicação desenvolvida.",
    limitations: "Concisão no chat não autoriza resumir material didático, ocultar incerteza ou substituir a decisão humana.",
    defaultStatus: "product_hypothesis", evidenceRefs: Object.freeze([]), supportedScopes: PEDAGOGICAL_PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "enum", allowedValues: Object.freeze(["concise", "debate", "explanation"]) }),
    optionLabels: Object.freeze({concise:"Concisão",debate:"Debate",explanation:"Explicação"}), defaultValue: "concise"
  })
]);

const PEDAGOGICAL_PARAMETER_BY_ID = new Map(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => [definition.id, definition])
);

export class CourseDesignParametersError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "CourseDesignParametersError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new CourseDesignParametersError(code, message, details);
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    fail("invalid_course_design_json", "O desenho do Curso precisa conter somente dados clonáveis.");
  }
}

function isObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, fields, code, label) {
  if (!isObject(value)) fail(code, `${label} precisa ser um objeto.`);
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail(code, `${label} contém o campo desconhecido ${unknown}.`, { field: unknown });
  const missing = fields.find((field) => !Object.hasOwn(value, field));
  if (missing) fail(code, `${label} não contém ${missing}.`, { field: missing });
}

function hasControl(value, allowLayoutWhitespace = true) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    if (point >= 127 && point <= 159) return true;
    if (point >= 32) return false;
    return !allowLayoutWhitespace || ![9, 10, 13].includes(point);
  });
}

function text(value, maximum, code, label, { trim = true, required = true } = {}) {
  if (typeof value !== "string") fail(code, `${label} precisa ser texto.`);
  const normalized = trim ? value.trim() : value;
  if ((required && !normalized) || normalized !== value && !trim ||
      normalized.length > maximum || hasControl(normalized)) {
    fail(code, `${label} é inválido.`);
  }
  return normalized;
}

function byteBound(value, maximum, code, label) {
  if (encoder.encode(JSON.stringify(value)).byteLength > maximum) {
    fail(code, `${label} excede ${maximum} bytes.`);
  }
}

function uuid(value, code, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(code, `${label} precisa ser um UUID canônico.`);
  }
  return value;
}

function identity(value, maximum, code, label) {
  if (typeof value !== "string" || value !== value.trim() || !value ||
      value.length > maximum || hasControl(value, false)) {
    fail(code, `${label} é inválida.`);
  }
  return value;
}

function uniqueEnumList(value, allowedValues, maximum, code, label) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(code, `${label} precisa ser uma lista limitada.`);
  }
  const allowed = new Set(allowedValues);
  const normalized = value.map((item) => {
    if (typeof item !== "string" || !allowed.has(item)) {
      fail(code, `${label} contém valor desconhecido.`, { value: item });
    }
    return item;
  });
  if (new Set(normalized).size !== normalized.length) {
    fail(code, `${label} não pode repetir valores.`);
  }
  return allowedValues.filter((item) => normalized.includes(item));
}

function uniqueIdentityList(value, maximumItems, maximumLength, code, label) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail(code, `${label} precisa ser uma lista limitada.`);
  }
  const normalized = value.map((item) => identity(item, maximumLength, code, label));
  if (new Set(normalized).size !== normalized.length) fail(code, `${label} não pode repetir valores.`);
  return normalized;
}

function uniqueUuidList(value, maximumItems, code, label) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail(code, `${label} precisa ser uma lista limitada.`);
  }
  const normalized = value.map((item) => uuid(item, code, label));
  if (new Set(normalized).size !== normalized.length) fail(code, `${label} não pode repetir valores.`);
  return normalized;
}

export function normalizeCourseDesignScope(value, { parameter = false } = {}) {
  exact(value, ["kind", "ref"], "invalid_course_design_scope", "O escopo de desenho");
  const allowed = parameter ? PEDAGOGICAL_PARAMETER_SCOPES : DESIGN_SCOPES;
  if (!allowed.includes(value.kind)) {
    fail("invalid_course_design_scope", "O tipo do escopo de desenho é inválido.");
  }
  return {
    kind: value.kind,
    ref: identity(value.ref, 240, "invalid_course_design_scope", "A referência do escopo")
  };
}

export function normalizeCourseDesignParameterValue(parameterId, value) {
  const definition = PEDAGOGICAL_PARAMETER_BY_ID.get(parameterId);
  if (!definition) fail("unknown_course_design_parameter", "O parâmetro pedagógico não pertence ao catálogo.");
  if (definition.valueSchema.type === "integer") {
    if (!Number.isSafeInteger(value) || value < definition.valueSchema.minimum ||
        value > definition.valueSchema.maximum) {
      fail("invalid_course_design_parameter_value", "O valor inteiro do parâmetro é inválido.", { parameterId });
    }
    return value;
  }
  if (definition.valueSchema.type === "enum") {
    if (!definition.valueSchema.allowedValues.includes(value)) {
      fail("invalid_course_design_parameter_value", "A opção do parâmetro é inválida.", { parameterId });
    }
    return value;
  }
  const normalized = uniqueEnumList(
    value,
    definition.valueSchema.allowedValues,
    definition.valueSchema.maximumItems,
    "invalid_course_design_parameter_value",
    `O valor de ${parameterId}`
  );
  if (normalized.length < definition.valueSchema.minimumItems) {
    fail("invalid_course_design_parameter_value", "O conjunto do parâmetro ficou vazio.", { parameterId });
  }
  return normalized;
}

export function normalizeCourseDesignPreference(value) {
  exact(value, ["parameterId", "mode", "value"], "invalid_course_design_preference", "A preferência de autoria");
  if (!PEDAGOGICAL_PARAMETER_BY_ID.has(value.parameterId) || !["fixed", "automatic"].includes(value.mode) ||
      value.mode === "automatic" && value.value !== null) {
    fail("invalid_course_design_preference", "A preferência precisa de parâmetro conhecido e intenção válida.");
  }
  return { parameterId: value.parameterId, mode: value.mode,
    value: value.mode === "automatic" ? null : normalizeCourseDesignParameterValue(value.parameterId, value.value) };
}

function componentRefList(value, label) {
  const refs = uniqueIdentityList(
    value,
    64,
    200,
    "invalid_course_component_policy",
    label
  );
  if (refs.some((ref) => !COMPONENT_REF_PATTERN.test(ref))) {
    fail("invalid_course_component_policy", `${label} contém referência package@version inválida.`);
  }
  return refs.sort((left, right) => left.localeCompare(right, "en"));
}

export function normalizeCourseComponentPolicy(value, { knownRefs = null } = {}) {
  exact(
    value,
    ["catalogVersion", "availability", "allowedRefs", "excludedRefs", "preferredRefs"],
    "invalid_course_component_policy",
    "A política de componentes"
  );
  if (value.catalogVersion !== COURSE_COMPONENT_CATALOG_VERSION ||
      !["all", "allow_only"].includes(value.availability)) {
    fail("invalid_course_component_policy", "A revisão ou disponibilidade da política é inválida.");
  }
  const policy = {
    catalogVersion: value.catalogVersion,
    availability: value.availability,
    allowedRefs: componentRefList(value.allowedRefs, "allowedRefs"),
    excludedRefs: componentRefList(value.excludedRefs, "excludedRefs"),
    preferredRefs: componentRefList(value.preferredRefs, "preferredRefs")
  };
  if (policy.availability === "all" && policy.allowedRefs.length > 0) {
    fail("invalid_course_component_policy", "availability all exige allowedRefs vazio.");
  }
  if (policy.availability === "allow_only" && policy.allowedRefs.length === 0) {
    fail("invalid_course_component_policy", "availability allow_only exige ao menos uma referência permitida.");
  }
  const allowed = new Set(policy.allowedRefs);
  const excluded = new Set(policy.excludedRefs);
  if (policy.allowedRefs.some((ref) => excluded.has(ref)) ||
      policy.preferredRefs.some((ref) => excluded.has(ref)) ||
      policy.availability === "allow_only" && policy.preferredRefs.some((ref) => !allowed.has(ref))) {
    fail("invalid_course_component_policy", "Os conjuntos da política de componentes são incoerentes.");
  }
  if (knownRefs) {
    const known = new Set(knownRefs);
    const unknown = [
      ...policy.allowedRefs,
      ...policy.excludedRefs,
      ...policy.preferredRefs
    ].find((ref) => !known.has(ref));
    if (unknown) fail("unknown_course_component_ref", "A política referencia componente desconhecido.", { ref: unknown });
  }
  byteBound(policy, 4096, "course_component_policy_too_large", "A política de componentes");
  return policy;
}

function origin(value, allowed = ASSIGNMENT_ORIGINS) {
  if (!allowed.includes(value)) fail("invalid_course_design_origin", "A origem da decisão de desenho é inválida.");
  return value;
}

function reason(value) {
  return text(value, 1000, "invalid_course_design_reason", "A justificativa da decisão");
}


export function normalizeCourseDesignCommand(value, { knownComponentRefs = null } = {}) {
  const command = clone(value);
  if (!isObject(command) || !COMMAND_TYPES.includes(command.type) || command.type === "apply_profile") {
    fail("invalid_course_design_command", "O comando de desenho é inválido.");
  }
  if (command.type === "set_parameter") {
    exact(command, ["type", "scope", "parameterId", "value", "origin", "reason"], "invalid_course_design_command", "O comando");
    const scope = normalizeCourseDesignScope(command.scope, { parameter: true });
    const parameterId = identity(command.parameterId, 160, "unknown_course_design_parameter", "A identidade do parâmetro");
    if (!PEDAGOGICAL_PARAMETER_BY_ID.get(parameterId)?.supportedScopes.includes(scope.kind)) {
      fail("invalid_course_design_scope", "O parâmetro não admite este escopo.");
    }
    return {
      type: command.type,
      scope,
      parameterId,
      value: normalizeCourseDesignParameterValue(parameterId, command.value),
      origin: origin(command.origin),
      reason: reason(command.reason)
    };
  }
  if (["clear_parameter", "delegate_parameter"].includes(command.type)) {
    exact(command, command.type === "delegate_parameter" ? ["type", "scope", "parameterId", "reason"] :
      ["type", "scope", "parameterId"], "invalid_course_design_command", "O comando");
    const parameterId = identity(command.parameterId, 160, "unknown_course_design_parameter", "A identidade do parâmetro");
    if (!PEDAGOGICAL_PARAMETER_BY_ID.has(parameterId)) {
      fail("unknown_course_design_parameter", "O parâmetro pedagógico não pertence ao catálogo.");
    }
    const scope = normalizeCourseDesignScope(command.scope, { parameter: true });
    if (!PEDAGOGICAL_PARAMETER_BY_ID.get(parameterId).supportedScopes.includes(scope.kind)) {
      fail("invalid_course_design_scope", "O parâmetro não admite este escopo.");
    }
    return {
      type: command.type,
      scope,
      parameterId,
      ...(command.type === "delegate_parameter" ? { reason: reason(command.reason) } : {})
    };
  }
  if (command.type === "set_guidance") {
    exact(command, ["type", "scope", "guidance", "origin", "reason"], "invalid_course_design_command", "O comando");
    const normalized = {
      type: command.type,
      scope: normalizeCourseDesignScope(command.scope),
      guidance: text(command.guidance, 8192, "invalid_course_authoring_guidance", "A orientação de Autoria"),
      origin: origin(command.origin),
      reason: reason(command.reason)
    };
    byteBound(normalized.guidance, 8192, "course_authoring_guidance_too_large", "A orientação de Autoria");
    return normalized;
  }
  if (command.type === "clear_guidance") {
    exact(command, ["type", "scope"], "invalid_course_design_command", "O comando");
    return { type: command.type, scope: normalizeCourseDesignScope(command.scope) };
  }
  if (command.type === "set_component_policy") {
    exact(command, ["type", "scope", "policy", "origin", "reason"], "invalid_course_design_command", "O comando");
    return {
      type: command.type,
      scope: normalizeCourseDesignScope(command.scope),
      policy: normalizeCourseComponentPolicy(command.policy, { knownRefs: knownComponentRefs }),
      origin: origin(command.origin),
      reason: reason(command.reason)
    };
  }
  exact(command, ["type", "scope"], "invalid_course_design_command", "O comando");
  return { type: command.type, scope: normalizeCourseDesignScope(command.scope) };
}



function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function readText(value, maximum, label, { bytes = null } = {}) {
  const normalized = text(value, maximum, "invalid_course_design_read", label);
  if (normalized !== value) fail("invalid_course_design_read", `${label} não está normalizado.`);
  if (bytes !== null) byteBound(value, bytes, "invalid_course_design_read", label);
  return value;
}

function readScope(value, label, { parameter = false } = {}) {
  try {
    return normalizeCourseDesignScope(value, { parameter });
  } catch (error) {
    if (error instanceof CourseDesignParametersError) {
      fail("invalid_course_design_read", `${label} é inválido.`);
    }
    throw error;
  }
}

function readScopeNavigationEntry(value, label, { child = false } = {}) {
  exact(
    value,
    child ? ["kind", "ref", "label", "position"] : ["kind", "ref", "label"],
    "invalid_course_design_read",
    label
  );
  if (!DESIGN_SCOPES.includes(value.kind)) {
    fail("invalid_course_design_read", `${label} possui tipo desconhecido.`);
  }
  identity(value.ref, 240, "invalid_course_design_read", `A referência de ${label}`);
  readText(value.label, 500, `O rótulo de ${label}`);
  if (child && (!Number.isSafeInteger(value.position) || value.position < 0)) {
    fail("invalid_course_design_read", `A posição de ${label} é inválida.`);
  }
  return value;
}

function validateScopeContext(value, courseId) {
  exact(
    value,
    ["current", "ancestors", "children", "childCount", "hasMoreChildren", "nextChildCursor"],
    "invalid_course_design_read",
    "O contexto de navegação"
  );
  const current = readScopeNavigationEntry(value.current, "O escopo corrente");
  if (!Array.isArray(value.ancestors) || value.ancestors.length > 4 ||
      !Array.isArray(value.children) || value.children.length > 64 ||
      !Number.isSafeInteger(value.childCount) || value.childCount < value.children.length ||
      typeof value.hasMoreChildren !== "boolean") {
    fail("invalid_course_design_read", "O contexto de navegação não respeita seus limites.");
  }
  const ancestors = value.ancestors.map((entry) => (
    readScopeNavigationEntry(entry, "Um escopo ancestral")
  ));
  const path = [...ancestors, current];
  const currentDepth = DESIGN_SCOPES.indexOf(current.kind);
  if (currentDepth < 0 || path.length !== currentDepth + 1 ||
      path.some((entry, index) => entry.kind !== DESIGN_SCOPES[index]) ||
      path[0].ref !== courseId ||
      new Set(path.map(({ kind, ref }) => `${kind}\0${ref}`)).size !== path.length) {
    fail("invalid_course_design_read", "A cadeia de escopos é incoerente com o Curso.");
  }
  const expectedChildKind = DESIGN_SCOPES[currentDepth + 1] ?? null;
  const children = value.children.map((entry) => (
    readScopeNavigationEntry(entry, "Um escopo filho", { child: true })
  ));
  if (children.some(({ kind }) => kind !== expectedChildKind) ||
      new Set(children.map(({ ref }) => ref)).size !== children.length ||
      children.some((entry, index) => index > 0 && (
        entry.position < children[index - 1].position ||
        entry.position === children[index - 1].position && entry.ref <= children[index - 1].ref
      ))) {
    fail("invalid_course_design_read", "A página de filhos é incoerente.");
  }
  if (value.hasMoreChildren) {
    if (!children.length || value.nextChildCursor !== children.at(-1).ref) {
      fail("invalid_course_design_read", "O cursor da página de filhos é inválido.");
    }
  } else if (value.nextChildCursor !== null) {
    fail("invalid_course_design_read", "Uma página final não pode anunciar cursor seguinte.");
  }
  if (expectedChildKind === null && (value.childCount !== 0 || children.length || value.hasMoreChildren)) {
    fail("invalid_course_design_read", "O escopo final não pode expor filhos de desenho.");
  }
  return { path, current };
}

function validateParameterAssignment(
  value,
  definition,
  label,
  { effective = false, currentScope = null, scopePath = [] } = {}
) {
  exact(
    value,
    effective
      ? ["mode", "value", "origin", "reason", "sourceScope", "inherited"]
      : ["mode", "value", "origin", "reason"],
    "invalid_course_design_read",
    label
  );
  if (!["fixed", "automatic"].includes(value.mode) ||
      value.mode === "fixed" && ["automatic", "system_default"].includes(value.origin) ||
      value.mode === "automatic" && ["research_condition", "migration"].includes(value.origin)) {
    fail("invalid_course_design_read", `${label} possui intenção incoerente.`);
  }
  if (value.value !== null || value.mode !== "automatic") normalizeCourseDesignParameterValue(definition.id, value.value);
  readText(value.reason, 1000, `A justificativa de ${label}`);
  if (!effective) {
    origin(value.origin, [...ASSIGNMENT_ORIGINS, "migration"]);
    return;
  }
  if (typeof value.inherited !== "boolean") {
    fail("invalid_course_design_read", `${label} não informa herança válida.`);
  }
  if (value.origin === "system_default") {
    if (value.sourceScope !== null || value.inherited ||
        value.mode !== "automatic" || value.value !== null) {
      fail("invalid_course_design_read", `${label} não representa o default do sistema.`);
    }
    return;
  }
  origin(value.origin, [...ASSIGNMENT_ORIGINS, "migration"]);
  const sourceScope = readScope(
    value.sourceScope,
    `O escopo de origem de ${label}`,
    { parameter: true }
  );
  if (!scopePath.some(({ kind, ref }) => kind === sourceScope.kind && ref === sourceScope.ref)) {
    fail("invalid_course_design_read", `${label} possui origem fora da cadeia do alvo.`);
  }
  if (currentScope && value.inherited !== (
    sourceScope.kind !== currentScope.kind || sourceScope.ref !== currentScope.ref
  )) {
    fail("invalid_course_design_read", `${label} informa herança incoerente.`);
  }
}

function validateParameters(value, scopePath, currentScope) {
  if (!Array.isArray(value) || value.length !== COURSE_DESIGN_PARAMETER_DEFINITIONS.length) {
    fail("invalid_course_design_read", "A leitura não contém todos os parâmetros canônicos.");
  }
  value.forEach((entry, index) => {
    exact(
      entry,
      ["parameterId", "localAssignment", "effectiveAssignment", "conflicts"],
      "invalid_course_design_read",
      "A resolução de parâmetro"
    );
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS[index];
    if (entry.parameterId !== definition.id) {
      fail("invalid_course_design_read", "Os parâmetros não seguem a ordem canônica.");
    }
    if (!Array.isArray(entry.conflicts) || entry.conflicts.length > 10) {
      fail("invalid_course_design_read", "Os conflitos de pesquisa são inválidos.");
    }
    for (const conflict of entry.conflicts) {
      exact(conflict, ["fixedScope", "fixedValue", "exceptionScope", "exceptionValue"], "invalid_course_design_read", "O conflito de pesquisa");
      const fixedScope = readScope(conflict.fixedScope, "A condição de pesquisa", { parameter: true });
      const exceptionScope = readScope(conflict.exceptionScope, "A exceção descendente", { parameter: true });
      const indexOf = (scope) => scopePath.findIndex(({ kind, ref }) => kind === scope.kind && ref === scope.ref);
      if (indexOf(fixedScope) < 0 || indexOf(exceptionScope) <= indexOf(fixedScope) ||
          sameJson(conflict.fixedValue, conflict.exceptionValue)) {
        fail("invalid_course_design_read", "O conflito não pertence à cadeia de herança.");
      }
      normalizeCourseDesignParameterValue(definition.id, conflict.fixedValue);
      if (conflict.exceptionValue !== null) normalizeCourseDesignParameterValue(definition.id, conflict.exceptionValue);
    }
    if (entry.localAssignment !== null) {
      validateParameterAssignment(entry.localAssignment, definition, "A atribuição local");
    }
    validateParameterAssignment(
      entry.effectiveAssignment,
      definition,
      "A atribuição efetiva",
      { effective: true, currentScope, scopePath }
    );
  });
}

export function normalizeCourseDesignParameterAssignment(value, parameterId) {
  const definition = PEDAGOGICAL_PARAMETER_BY_ID.get(parameterId);
  if (!definition) fail("unknown_course_design_parameter", "O parâmetro não pertence ao catálogo.");
  const assignment = clone(value);
  validateParameterAssignment(assignment, definition, "A atribuição de parâmetro");
  return assignment;
}

function validateGuidanceAssignment(value, label, { effective = false } = {}) {
  exact(
    value,
    effective
      ? ["guidance", "origin", "reason", "sourceScope", "inherited"]
      : ["guidance", "origin", "reason"],
    "invalid_course_design_read",
    label
  );
  const maximum = value.origin === "migration" ? 16384 : 8192;
  readText(value.guidance, maximum, `O texto de ${label}`, {
    bytes: value.origin === "migration" ? 65536 : 8192
  });
  readText(value.reason, 1000, `A justificativa de ${label}`);
  origin(value.origin, [...ASSIGNMENT_ORIGINS, "migration"]);
  if (!effective) return null;
  if (typeof value.inherited !== "boolean") {
    fail("invalid_course_design_read", `${label} não informa herança válida.`);
  }
  return readScope(value.sourceScope, `O escopo de origem de ${label}`);
}

function validateGuidance(value, scopePath, currentScope) {
  exact(
    value,
    ["localAssignment", "effectiveAssignments"],
    "invalid_course_design_read",
    "A direção editorial"
  );
  if (!Array.isArray(value.effectiveAssignments) || value.effectiveAssignments.length > 4) {
    fail("invalid_course_design_read", "As direções editoriais excedem a cadeia de escopos.");
  }
  const pathDepth = new Map(scopePath.map((scope, index) => [
    `${scope.kind}\0${scope.ref}`,
    index
  ]));
  let previousDepth = -1;
  const effectiveScopes = new Set();
  for (const assignment of value.effectiveAssignments) {
    const sourceScope = validateGuidanceAssignment(
      assignment,
      "Uma direção editorial efetiva",
      { effective: true }
    );
    const key = `${sourceScope.kind}\0${sourceScope.ref}`;
    const depth = pathDepth.get(key);
    if (depth === undefined || depth <= previousDepth || effectiveScopes.has(key)) {
      fail("invalid_course_design_read", "As direções editoriais não seguem a ordem ancestral.");
    }
    if (assignment.inherited !== (
      sourceScope.kind !== currentScope.kind || sourceScope.ref !== currentScope.ref
    )) {
      fail("invalid_course_design_read", "Uma direção editorial informa herança incoerente.");
    }
    previousDepth = depth;
    effectiveScopes.add(key);
  }
  if (value.localAssignment !== null) {
    validateGuidanceAssignment(value.localAssignment, "A direção editorial local");
    const effectiveLocal = value.effectiveAssignments.find(({ sourceScope }) =>
      sourceScope.kind === currentScope.kind && sourceScope.ref === currentScope.ref);
    if (!effectiveLocal ||
        effectiveLocal.guidance !== value.localAssignment.guidance ||
        effectiveLocal.origin !== value.localAssignment.origin ||
        effectiveLocal.reason !== value.localAssignment.reason) {
      fail("invalid_course_design_read", "A direção editorial local diverge da efetiva.");
    }
  } else if (value.effectiveAssignments.some(({ sourceScope }) =>
    sourceScope.kind === currentScope.kind && sourceScope.ref === currentScope.ref)) {
    fail("invalid_course_design_read", "Há direção editorial local não projetada.");
  }
}

function validateComponentCatalog(value) {
  exact(value, ["version", "schemaFingerprint", "options"], "invalid_course_design_read", "O catálogo de componentes");
  if (value.version !== COURSE_COMPONENT_CATALOG_VERSION ||
      value.schemaFingerprint !== COURSE_COMPONENT_CATALOG_SCHEMA_FINGERPRINT ||
      !Array.isArray(value.options) || value.options.length !== COURSE_COMPONENT_CATALOG.options.length) {
    fail("course_component_catalog_drift", "O catálogo de componentes divergiu da revisão corrente.");
  }
  const refs = new Set();
  for (const [index, option] of value.options.entries()) {
    const expected = COURSE_COMPONENT_CATALOG.options[index];
    if (option?.ref !== expected.ref || option?.label !== expected.label || option?.purpose !== expected.purpose) {
      fail("course_component_catalog_drift", "A opção de componente diverge do catálogo instalado.");
    }
    exact(option, ["ref", "label", "purpose"], "invalid_course_design_read", "Uma opção de componente");
    const ref = identity(option.ref, 200, "invalid_course_design_read", "A referência do componente");
    if (!COMPONENT_REF_PATTERN.test(ref) || refs.has(ref)) {
      fail("course_component_catalog_drift", "O catálogo contém referência inválida ou repetida.");
    }
    refs.add(ref);
    readText(option.label, 200, "O rótulo do componente");
    readText(option.purpose, 1000, "A finalidade do componente");
  }
  return refs;
}

function validatePolicyAssignment(
  value,
  label,
  knownRefs,
  { effective = false, currentScope = null, scopePath = [] } = {}
) {
  exact(
    value,
    effective
      ? ["policy", "origin", "reason", "sourceScope", "inherited"]
      : ["policy", "origin", "reason"],
    "invalid_course_design_read",
    label
  );
  normalizeCourseComponentPolicy(value.policy, { knownRefs });
  readText(value.reason, 1000, `A justificativa de ${label}`);
  if (!effective) {
    origin(value.origin, [...ASSIGNMENT_ORIGINS, "migration"]);
    return;
  }
  if (typeof value.inherited !== "boolean") {
    fail("invalid_course_design_read", `${label} não informa herança válida.`);
  }
  if (value.origin === "system_default") {
    if (value.sourceScope !== null || value.inherited ||
        value.policy.availability !== "all" || value.policy.allowedRefs.length ||
        value.policy.excludedRefs.length || value.policy.preferredRefs.length) {
      fail("invalid_course_design_read", `${label} não representa a política default.`);
    }
    return;
  }
  origin(value.origin, [...ASSIGNMENT_ORIGINS, "migration"]);
  const sourceScope = readScope(value.sourceScope, `O escopo de origem de ${label}`);
  if (!scopePath.some(({ kind, ref }) => kind === sourceScope.kind && ref === sourceScope.ref)) {
    fail("invalid_course_design_read", `${label} possui origem fora da cadeia do alvo.`);
  }
  if (currentScope && value.inherited !== (
    sourceScope.kind !== currentScope.kind || sourceScope.ref !== currentScope.ref
  )) {
    fail("invalid_course_design_read", `${label} informa herança incoerente.`);
  }
}

function validateComponentPolicyRead(value, knownRefs, scopePath, currentScope) {
  exact(
    value,
    ["localAssignment", "effectiveAssignment"],
    "invalid_course_design_read",
    "A política resolvida"
  );
  if (value.localAssignment !== null) {
    validatePolicyAssignment(value.localAssignment, "A política local", knownRefs);
  }
  validatePolicyAssignment(
    value.effectiveAssignment,
    "A política efetiva",
    knownRefs,
    { effective: true, currentScope, scopePath }
  );
}

export function normalizeCourseDesignRead(value) {
  const read = clone(value);
  exact(
    read,
    [
      "contract",
      "courseId",
      "courseRevision",
      "parameterCatalogVersion",
      "scopeContext",
      "targetPlanItems",
      "definitions",
      "parameters",
      "guidance",
      "componentCatalog",
      "componentPolicy"
    ],
    "invalid_course_design_read",
    "A leitura do desenho"
  );
  if (read.contract !== COURSE_DESIGN_CONTRACT ||
      read.parameterCatalogVersion !== COURSE_DESIGN_PARAMETER_CATALOG_VERSION ||
      !Number.isSafeInteger(read.courseRevision) || read.courseRevision < 1) {
    fail("invalid_course_design_read", "A versão da leitura do desenho é inválida.");
  }
  uuid(read.courseId, "invalid_course_design_read", "A identidade do Curso");
  if (!sameJson(read.definitions, COURSE_DESIGN_PARAMETER_DEFINITIONS)) {
    fail("course_design_catalog_drift", "O catálogo de parâmetros divergiu do domínio corrente.");
  }
  const scope = validateScopeContext(read.scopeContext, read.courseId);
  if (["didactic_microsequence", "study_unit"].includes(scope.current.kind)) {
    exact(
      read.targetPlanItems,
      ["instructionalAnalysisUnitIds", "evidenceRequirementIds"],
      "invalid_course_design_read",
      "Os itens de plano atribuídos ao alvo"
    );
    uniqueUuidList(
      read.targetPlanItems.instructionalAnalysisUnitIds,
      256,
      "invalid_course_design_read",
      "instructionalAnalysisUnitIds"
    );
    uniqueUuidList(
      read.targetPlanItems.evidenceRequirementIds,
      256,
      "invalid_course_design_read",
      "evidenceRequirementIds"
    );
  } else if (read.targetPlanItems !== null) {
    fail(
      "invalid_course_design_read",
      "Somente uma microssequência ou sua StudyUnit pode expor itens do plano atribuídos."
    );
  }
  validateParameters(read.parameters, scope.path, scope.current);
  validateGuidance(read.guidance, scope.path, scope.current);
  const knownRefs = validateComponentCatalog(read.componentCatalog);
  validateComponentPolicyRead(read.componentPolicy, knownRefs, scope.path, scope.current);
  byteBound(read, 262144, "course_design_read_too_large", "A leitura do desenho");
  return read;
}

export function normalizeCourseDesignChange(value) {
  const change = clone(value);
  exact(
    change,
    ["contract", "courseId", "courseRevision", "requestId", "idempotent", "changed", "change"],
    "invalid_course_design_change",
    "O resultado da mudança de desenho"
  );
  if (change.contract !== COURSE_DESIGN_CHANGE_CONTRACT ||
      !Number.isSafeInteger(change.courseRevision) || change.courseRevision < 1 ||
      typeof change.idempotent !== "boolean" || typeof change.changed !== "boolean" ||
      change.changed !== (change.change !== null)) {
    fail("invalid_course_design_change", "O resultado da mudança de desenho é inválido.");
  }
  uuid(change.courseId, "invalid_course_design_change", "A identidade do Curso");
  if (typeof change.requestId !== "string" || !REQUEST_ID_PATTERN.test(change.requestId)) {
    fail("invalid_course_design_change", "A identidade da requisição é inválida.");
  }
  if (change.change !== null) {
    exact(
      change.change,
      ["type", "scope", "parameterId"],
      "invalid_course_design_change",
      "O fato da mudança"
    );
    if (!COMMAND_TYPES.includes(change.change.type)) fail("invalid_course_design_change", "O tipo da mudança é inválido.");
    const scope = normalizeCourseDesignScope(change.change.scope, {
      parameter: ["set_parameter", "clear_parameter", "delegate_parameter"].includes(change.change.type)
    });
    if (scope.kind === "course" && scope.ref !== change.courseId) {
      fail("invalid_course_design_change", "O escopo Course da mudança diverge do Curso retornado.");
    }
    const parameterChange = ["set_parameter", "clear_parameter", "delegate_parameter"].includes(change.change.type);
    if (parameterChange) {
      const parameterId = identity(
        change.change.parameterId,
        160,
        "invalid_course_design_change",
        "O parâmetro alterado"
      );
      if (!PEDAGOGICAL_PARAMETER_BY_ID.has(parameterId)) {
        fail("invalid_course_design_change", "A mudança referencia parâmetro desconhecido.");
      }
    } else if (change.change.parameterId !== null) {
      fail("invalid_course_design_change", "Uma mudança não pedagógica informou parâmetro.");
    }
  }
  return change;
}
