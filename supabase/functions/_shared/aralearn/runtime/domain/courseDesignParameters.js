const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DECIMAL_ID_PATTERN = /^[1-9][0-9]*$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const COMPONENT_REF_PATTERN = /^aralearn\.(?:resource|response)\.[a-z0-9_]+@(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const encoder = new TextEncoder();

export const COURSE_DESIGN_CONTRACT = "aralearn.course-design.v1";
export const COURSE_DESIGN_CHANGE_CONTRACT = "aralearn.course-design-change.v1";
export const COURSE_DESIGN_CONTEXT_CONTRACT = "aralearn.course-design-context.v2";
export const COURSE_DESIGN_PARAMETER_CATALOG_VERSION = "1.0.0";
export const COURSE_COMPONENT_CATALOG_VERSION = "1-3e5629f8";

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

const PARAMETER_SCOPES = Object.freeze([
  "course",
  "lesson",
  "didactic_microsequence"
]);
const DESIGN_SCOPES = Object.freeze([
  "course",
  "module",
  "lesson",
  "didactic_microsequence"
]);
const ASSIGNMENT_ORIGINS = Object.freeze([
  "automatic",
  "author",
  "research_condition"
]);
const COMMAND_TYPES = Object.freeze([
  "set_parameter",
  "clear_parameter",
  "set_guidance",
  "clear_guidance",
  "interpret_guidance",
  "set_component_policy",
  "clear_component_policy",
  "set_target_plan_items"
]);

export const COURSE_DESIGN_PARAMETER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "new_analysis_unit_ceiling_per_expository_study_unit",
    label: "Novas unidades de análise por Unidade expositiva",
    construct: "Quantidade de unidades da análise instrucional introduzidas como novas em uma mesma Unidade de estudo expositiva.",
    operationalization: "Conta identidades distintas declaradas como introduzidas em cada Unidade expositiva ou mista; não usa caracteres, linhas, altura nem tempo como proxy.",
    limitations: "A contagem orienta granularidade de desenho e não mede carga cognitiva, dificuldade, aprendizagem ou qualidade da explicação.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["koedinger2012kli", "chen2023elementinteractivity"]),
    supportedScopes: PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }),
    defaultValue: 2
  }),
  Object.freeze({
    id: "required_explanation_forms",
    label: "Formas de explicação requeridas",
    construct: "Formas semanticamente distintas usadas para desenvolver uma unidade da análise instrucional.",
    operationalization: "Verifica, por identidade introduzida, quais formas foram desenvolvidas e quais foram declaradas não aplicáveis com motivo factual.",
    limitations: "As formas não são uma escala de qualidade nem uma lista universal; adequação depende do objeto, público, tarefa e representação.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["wittwer2008explanations", "ainsworth2006deft"]),
    supportedScopes: PARAMETER_SCOPES,
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
    label: "Oportunidades distintas por requisito de evidência",
    construct: "Quantidade mínima de oportunidades semanticamente distintas relacionadas a cada requisito de evidência.",
    operationalization: "Conta opportunityId distinto por requisito de evidência e conserva a operação-alvo invariável declarada em cada oportunidade.",
    limitations: "Quantidade de oportunidades não demonstra domínio, eficácia ou equivalência entre tarefas; a pertinência da evidência permanece uma hipótese de desenho.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["karpicke2008retrieval", "mislevy2003ecd"]),
    supportedScopes: PARAMETER_SCOPES,
    valueSchema: Object.freeze({ type: "integer", minimum: 1, maximum: 64 }),
    defaultValue: 2
  }),
  Object.freeze({
    id: "required_practice_variation_dimensions",
    label: "Dimensões requeridas de variação da prática",
    construct: "Dimensões semanticamente relevantes que variam entre oportunidades relacionadas ao mesmo requisito de evidência.",
    operationalization: "Verifica as dimensões declaradas nas oportunidades sem tratar mudança cosmética ou reordenação como variação semântica.",
    limitations: "Variação declarada não prova transferência nem aprendizagem e precisa preservar a operação-alvo pertinente ao requisito.",
    defaultStatus: "product_hypothesis",
    evidenceRefs: Object.freeze(["taylor2010interleaved", "ainsworth2006deft"]),
    supportedScopes: PARAMETER_SCOPES,
    valueSchema: Object.freeze({
      type: "set",
      allowedValues: PRACTICE_VARIATION_DIMENSIONS,
      minimumItems: 1,
      maximumItems: PRACTICE_VARIATION_DIMENSIONS.length
    }),
    defaultValue: Object.freeze(["case_or_data"])
  })
]);

const DEFINITION_BY_ID = new Map(
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

function decimalId(value, code, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !DECIMAL_ID_PATTERN.test(value) ||
      BigInt(value) > 9223372036854775807n) {
    fail(code, `${label} precisa ser uma identidade decimal serializada como texto.`);
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
  const allowed = parameter ? PARAMETER_SCOPES : DESIGN_SCOPES;
  if (!allowed.includes(value.kind)) {
    fail("invalid_course_design_scope", "O tipo do escopo de desenho é inválido.");
  }
  return {
    kind: value.kind,
    ref: identity(value.ref, 240, "invalid_course_design_scope", "A referência do escopo")
  };
}

export function normalizeCourseDesignParameterValue(parameterId, value) {
  const definition = DEFINITION_BY_ID.get(parameterId);
  if (!definition) fail("unknown_course_design_parameter", "O parâmetro de desenho não pertence ao catálogo.");
  if (definition.valueSchema.type === "integer") {
    if (!Number.isSafeInteger(value) || value < definition.valueSchema.minimum ||
        value > definition.valueSchema.maximum) {
      fail("invalid_course_design_parameter_value", "O valor inteiro do parâmetro é inválido.", { parameterId });
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

function componentRefList(value, label) {
  const refs = uniqueIdentityList(
    value,
    32,
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

function interpretationTextList(value, label) {
  if (!Array.isArray(value) || value.length > 16) {
    fail("invalid_course_authoring_guidance_interpretation", `${label} precisa ser uma lista limitada.`);
  }
  const normalized = value.map((item) => text(
    item,
    500,
    "invalid_course_authoring_guidance_interpretation",
    label
  ));
  if (new Set(normalized).size !== normalized.length) {
    fail("invalid_course_authoring_guidance_interpretation", `${label} não pode repetir itens.`);
  }
  return normalized;
}

function interpretationDirectives(value) {
  if (!Array.isArray(value) || value.length > 16) {
    fail("invalid_course_authoring_guidance_interpretation", "directives precisa ser uma lista limitada.");
  }
  const normalized = value.map((directive) => {
    exact(
      directive,
      ["kind", "statement"],
      "invalid_course_authoring_guidance_interpretation",
      "A diretiva interpretada"
    );
    if (!["require", "avoid", "prefer"].includes(directive.kind)) {
      fail("invalid_course_authoring_guidance_interpretation", "A espécie da diretiva é inválida.");
    }
    return {
      kind: directive.kind,
      statement: text(
        directive.statement,
        500,
        "invalid_course_authoring_guidance_interpretation",
        "O enunciado da diretiva"
      )
    };
  });
  const keys = normalized.map(({ kind, statement }) => `${kind}\0${statement}`);
  if (new Set(keys).size !== keys.length) {
    fail("invalid_course_authoring_guidance_interpretation", "directives não pode repetir itens.");
  }
  return normalized;
}

export function normalizeCourseAuthoringGuidanceInterpretation(value) {
  exact(
    value,
    ["summary", "directives", "divergences", "questions"],
    "invalid_course_authoring_guidance_interpretation",
    "A interpretação da orientação"
  );
  const normalized = {
    summary: text(
      value.summary,
      1000,
      "invalid_course_authoring_guidance_interpretation",
      "O resumo da interpretação"
    ),
    directives: interpretationDirectives(value.directives),
    divergences: interpretationTextList(value.divergences, "As divergências"),
    questions: interpretationTextList(value.questions, "As perguntas")
  };
  byteBound(
    normalized,
    8192,
    "course_authoring_guidance_interpretation_too_large",
    "A interpretação"
  );
  return normalized;
}

export function normalizeCourseDesignCommand(value, { knownComponentRefs = null } = {}) {
  const command = clone(value);
  if (!isObject(command) || !COMMAND_TYPES.includes(command.type)) {
    fail("invalid_course_design_command", "O comando de desenho é inválido.");
  }
  if (command.type === "set_target_plan_items") {
    exact(
      command,
      ["type", "scope", "instructionalAnalysisUnitIds", "evidenceRequirementIds"],
      "invalid_course_design_command",
      "O comando"
    );
    const scope = normalizeCourseDesignScope(command.scope, { parameter: true });
    if (scope.kind !== "didactic_microsequence") {
      fail(
        "invalid_course_design_scope",
        "Os itens do plano precisam apontar para uma microssequência didática."
      );
    }
    return {
      type: command.type,
      scope,
      instructionalAnalysisUnitIds: uniqueUuidList(
        command.instructionalAnalysisUnitIds,
        256,
        "invalid_course_design_command",
        "instructionalAnalysisUnitIds"
      ),
      evidenceRequirementIds: uniqueUuidList(
        command.evidenceRequirementIds,
        256,
        "invalid_course_design_command",
        "evidenceRequirementIds"
      )
    };
  }
  if (command.type === "set_parameter") {
    exact(command, ["type", "scope", "parameterId", "value", "origin", "reason"], "invalid_course_design_command", "O comando");
    const scope = normalizeCourseDesignScope(command.scope, { parameter: true });
    const parameterId = identity(command.parameterId, 160, "unknown_course_design_parameter", "A identidade do parâmetro");
    return {
      type: command.type,
      scope,
      parameterId,
      value: normalizeCourseDesignParameterValue(parameterId, command.value),
      origin: origin(command.origin),
      reason: reason(command.reason)
    };
  }
  if (command.type === "clear_parameter") {
    exact(command, ["type", "scope", "parameterId"], "invalid_course_design_command", "O comando");
    const parameterId = identity(command.parameterId, 160, "unknown_course_design_parameter", "A identidade do parâmetro");
    if (!DEFINITION_BY_ID.has(parameterId)) fail("unknown_course_design_parameter", "O parâmetro não pertence ao catálogo.");
    return {
      type: command.type,
      scope: normalizeCourseDesignScope(command.scope, { parameter: true }),
      parameterId
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
  if (command.type === "interpret_guidance") {
    exact(command, ["type", "guidanceRevisionId", "interpretation"], "invalid_course_design_command", "O comando");
    const normalized = {
      type: command.type,
      guidanceRevisionId: uuid(
        command.guidanceRevisionId,
        "invalid_course_design_command",
        "A identidade da revisão de orientação"
      ),
      interpretation: normalizeCourseAuthoringGuidanceInterpretation(command.interpretation)
    };
    return normalized;
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

function latestByScope(changes, scopePath, itemKey, itemValue) {
  const scopeOrder = new Map(scopePath.map((scope, index) => [`${scope.kind}\0${scope.ref}`, index]));
  const latest = new Map();
  for (const change of changes) {
    if (itemKey && change[itemKey] !== itemValue) continue;
    const scope = normalizeCourseDesignScope(change.scope, { parameter: itemKey === "parameterId" });
    const key = `${scope.kind}\0${scope.ref}`;
    if (!scopeOrder.has(key)) continue;
    const changeId = BigInt(decimalId(String(change.changeId), "invalid_course_design_change", "A identidade da mudança"));
    const previous = latest.get(key);
    if (!previous || changeId > previous.changeId) latest.set(key, { change, scope, changeId });
  }
  return [...latest.values()].filter(({ change }) => change.action === "set");
}

function precedenceOrigin(originValue) {
  if (["author", "research_condition", "migration"].includes(originValue)) return 2;
  if (originValue === "automatic") return 1;
  return 0;
}

function resolveNearest(changes, scopePath, itemKey = null, itemValue = null) {
  const candidates = latestByScope(changes, scopePath, itemKey, itemValue);
  if (!candidates.length) return null;
  const scopeOrder = new Map(scopePath.map((scope, index) => [`${scope.kind}\0${scope.ref}`, index]));
  return candidates.sort((left, right) => {
    const authority = precedenceOrigin(right.change.origin) - precedenceOrigin(left.change.origin);
    if (authority) return authority;
    const depth = scopeOrder.get(`${right.scope.kind}\0${right.scope.ref}`) -
      scopeOrder.get(`${left.scope.kind}\0${left.scope.ref}`);
    if (depth) return depth;
    return right.changeId > left.changeId ? 1 : -1;
  })[0];
}

export function resolveCourseDesignParameters(changesValue, scopePathValue) {
  const changes = Array.isArray(changesValue) ? changesValue : [];
  const scopePath = scopePathValue.map((scope) => normalizeCourseDesignScope(scope));
  const target = scopePath.at(-1);
  return COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => {
    const resolved = resolveNearest(changes, scopePath, "parameterId", definition.id);
    const local = latestByScope(changes, [target], "parameterId", definition.id)[0] || null;
    return {
      parameterId: definition.id,
      localAssignment: local ? {
        changeId: String(local.change.changeId),
        value: normalizeCourseDesignParameterValue(definition.id, local.change.value),
        origin: origin(local.change.origin),
        reason: reason(local.change.reason)
      } : null,
      effectiveAssignment: resolved ? {
        changeId: String(resolved.change.changeId),
        value: normalizeCourseDesignParameterValue(definition.id, resolved.change.value),
        origin: origin(resolved.change.origin),
        reason: reason(resolved.change.reason),
        sourceScope: resolved.scope,
        inherited: resolved.scope.kind !== target.kind || resolved.scope.ref !== target.ref
      } : {
        changeId: null,
        value: clone(definition.defaultValue),
        origin: "system_default",
        reason: "Hipótese padrão de produto aplicada na ausência de atribuição explícita ou automática.",
        sourceScope: null,
        inherited: false
      }
    };
  });
}

function normalizeExplanationApplication(value) {
  exact(
    value,
    ["instructionalAnalysisUnitId", "developedForms", "notApplicable"],
    "invalid_course_design_application",
    "A aplicação de explicação"
  );
  const developedForms = uniqueEnumList(
    value.developedForms,
    EXPLANATION_FORMS,
    EXPLANATION_FORMS.length,
    "invalid_course_design_application",
    "developedForms"
  );
  if (!Array.isArray(value.notApplicable) || value.notApplicable.length > EXPLANATION_FORMS.length) {
    fail("invalid_course_design_application", "notApplicable precisa ser uma lista limitada.");
  }
  const seen = new Set();
  const notApplicable = value.notApplicable.map((entry) => {
    exact(entry, ["form", "reason"], "invalid_course_design_application", "A não aplicabilidade");
    if (!EXPLANATION_FORMS.includes(entry.form) || seen.has(entry.form) || developedForms.includes(entry.form)) {
      fail("invalid_course_design_application", "A forma não aplicável é inválida ou repetida.");
    }
    seen.add(entry.form);
    return {
      form: entry.form,
      reason: text(entry.reason, 240, "invalid_course_design_application", "O motivo de não aplicabilidade")
    };
  });
  return {
    instructionalAnalysisUnitId: uuid(
      value.instructionalAnalysisUnitId,
      "invalid_course_design_application",
      "A identidade da unidade da análise instrucional"
    ),
    developedForms,
    notApplicable
  };
}

function normalizePracticeApplication(value) {
  exact(
    value,
    ["evidenceRequirementId", "opportunityId", "invariantTaskOperation", "variedDimensions"],
    "invalid_course_design_application",
    "A aplicação de prática"
  );
  return {
    evidenceRequirementId: uuid(
      value.evidenceRequirementId,
      "invalid_course_design_application",
      "A identidade do requisito de evidência"
    ),
    opportunityId: identity(
      value.opportunityId,
      120,
      "invalid_course_design_application",
      "A identidade da oportunidade"
    ),
    invariantTaskOperation: text(
      value.invariantTaskOperation,
      240,
      "invalid_course_design_application",
      "A operação-alvo invariável"
    ),
    variedDimensions: uniqueEnumList(
      value.variedDimensions,
      PRACTICE_VARIATION_DIMENSIONS,
      PRACTICE_VARIATION_DIMENSIONS.length,
      "invalid_course_design_application",
      "variedDimensions"
    )
  };
}

export function normalizeCourseDesignApplication(value, { knownComponentRefs = null } = {}) {
  const application = clone(value);
  exact(
    application,
    ["contextHash", "didacticMicrosequenceId", "studyUnits"],
    "invalid_course_design_application",
    "A aplicação factual do desenho"
  );
  if (typeof application.contextHash !== "string" || !SHA256_PATTERN.test(application.contextHash)) {
    fail("invalid_course_design_application", "contextHash é inválido.");
  }
  if (!Array.isArray(application.studyUnits) || application.studyUnits.length > 64) {
    fail("invalid_course_design_application", "studyUnits precisa conter no máximo 64 Unidades.");
  }
  const studyUnitIds = new Set();
  const opportunityKeys = new Set();
  const known = knownComponentRefs ? new Set(knownComponentRefs) : null;
  const studyUnits = application.studyUnits.map((studyUnit) => {
    exact(
      studyUnit,
      [
        "studyUnitId",
        "mode",
        "introducedInstructionalAnalysisUnitIds",
        "explanationApplications",
        "practiceApplications",
        "componentRefs"
      ],
      "invalid_course_design_application",
      "A Unidade aplicada"
    );
    const studyUnitId = identity(
      studyUnit.studyUnitId,
      240,
      "invalid_course_design_application",
      "A identidade da Unidade de estudo"
    );
    if (studyUnitIds.has(studyUnitId) || !["expository", "practice", "mixed"].includes(studyUnit.mode)) {
      fail("invalid_course_design_application", "A Unidade aplicada possui identidade repetida ou modo inválido.");
    }
    studyUnitIds.add(studyUnitId);
    if (!Array.isArray(studyUnit.explanationApplications) || studyUnit.explanationApplications.length > 256 ||
        !Array.isArray(studyUnit.practiceApplications) || studyUnit.practiceApplications.length > 256) {
      fail("invalid_course_design_application", "As aplicações da Unidade excedem os limites.");
    }
    const explanationApplications = studyUnit.explanationApplications.map(normalizeExplanationApplication);
    const explanationIds = explanationApplications.map(({ instructionalAnalysisUnitId }) => instructionalAnalysisUnitId);
    if (new Set(explanationIds).size !== explanationIds.length) {
      fail("invalid_course_design_application", "A Unidade repete aplicação de explicação.");
    }
    const practiceApplications = studyUnit.practiceApplications.map((entry) => {
      const normalized = normalizePracticeApplication(entry);
      const key = `${normalized.evidenceRequirementId}\0${normalized.opportunityId}`;
      if (opportunityKeys.has(key)) fail("invalid_course_design_application", "A aplicação repete uma oportunidade.");
      opportunityKeys.add(key);
      return normalized;
    });
    const componentRefs = componentRefList(studyUnit.componentRefs, "componentRefs");
    const unknown = known && componentRefs.find((ref) => !known.has(ref));
    if (unknown) fail("unknown_course_component_ref", "A aplicação referencia componente desconhecido.", { ref: unknown });
    return {
      studyUnitId,
      mode: studyUnit.mode,
      introducedInstructionalAnalysisUnitIds: uniqueUuidList(
        studyUnit.introducedInstructionalAnalysisUnitIds,
        256,
        "invalid_course_design_application",
        "introducedInstructionalAnalysisUnitIds"
      ),
      explanationApplications,
      practiceApplications,
      componentRefs
    };
  });
  const normalized = {
    contextHash: application.contextHash,
    didacticMicrosequenceId: identity(
      application.didacticMicrosequenceId,
      240,
      "invalid_course_design_application",
      "A identidade da microssequência didática"
    ),
    studyUnits
  };
  byteBound(normalized, 16384, "course_design_application_too_large", "A aplicação factual do desenho");
  return normalized;
}

function effectiveParameter(target, parameterId) {
  const value = target.parameters?.find((entry) => entry.parameterId === parameterId)?.value;
  return normalizeCourseDesignParameterValue(parameterId, value);
}

function policyAllows(policy, ref) {
  if (policy.excludedRefs.includes(ref)) return false;
  return policy.availability === "all" || policy.allowedRefs.includes(ref);
}

export function auditDesignApplication(contextValue, applicationValue, options = {}) {
  const application = normalizeCourseDesignApplication(applicationValue, options);
  const issues = [];
  if (!isObject(contextValue) || contextValue.contract !== COURSE_DESIGN_CONTEXT_CONTRACT ||
      typeof options.contextHash !== "string" || !SHA256_PATTERN.test(options.contextHash)) {
    fail("invalid_course_design_context", "O contexto de desenho para auditoria é inválido.");
  }
  if (application.contextHash !== options.contextHash) issues.push("context_hash_mismatch");
  const target = contextValue.targets?.find(({ didacticMicrosequenceId }) => (
    didacticMicrosequenceId === application.didacticMicrosequenceId
  ));
  if (!target) {
    issues.push("didactic_microsequence_not_in_context");
    return { valid: false, issues, summary: summarizeDesignApplication(application) };
  }
  if (!Array.isArray(contextValue.instructionalAnalysisUnits) ||
      !Array.isArray(contextValue.evidenceRequirements) ||
      !Array.isArray(target.instructionalAnalysisUnitIds) ||
      !Array.isArray(target.evidenceRequirementIds)) {
    fail("invalid_course_design_context", "O contexto de desenho para auditoria é inválido.");
  }
  const analysisById = new Map(contextValue.instructionalAnalysisUnits.map((item) => [item?.id, item]));
  const evidenceById = new Map(contextValue.evidenceRequirements.map((item) => [item?.id, item]));
  const analysisIds = new Set(uniqueUuidList(
    target.instructionalAnalysisUnitIds,
    256,
    "invalid_course_design_context",
    "instructionalAnalysisUnitIds"
  ));
  const evidenceIds = new Set(uniqueUuidList(
    target.evidenceRequirementIds,
    256,
    "invalid_course_design_context",
    "evidenceRequirementIds"
  ));
  if ([...analysisIds].some((id) => !analysisById.has(id)) ||
      [...evidenceIds].some((id) => !evidenceById.has(id))) {
    fail("invalid_course_design_context", "O alvo referencia itens ausentes do plano selado.");
  }
  const ceiling = effectiveParameter(target, "new_analysis_unit_ceiling_per_expository_study_unit");
  const requiredForms = effectiveParameter(target, "required_explanation_forms");
  const minimumPractice = effectiveParameter(
    target,
    "minimum_distinct_practice_opportunities_per_evidence_requirement"
  );
  const requiredVariation = effectiveParameter(target, "required_practice_variation_dimensions");
  const introductionPosition = new Map();
  const practices = new Map([...evidenceIds].map((id) => [id, []]));
  const componentPolicy = normalizeCourseComponentPolicy(target.componentPolicy.policy, options);

  application.studyUnits.forEach((studyUnit, position) => {
    const introduced = studyUnit.introducedInstructionalAnalysisUnitIds;
    if (studyUnit.mode === "practice" && (introduced.length || studyUnit.explanationApplications.length)) {
      issues.push(`practice_unit_contains_exposition:${studyUnit.studyUnitId}`);
    }
    if (studyUnit.mode === "expository" && studyUnit.practiceApplications.length) {
      issues.push(`expository_unit_contains_practice:${studyUnit.studyUnitId}`);
    }
    if (["expository", "mixed"].includes(studyUnit.mode) && introduced.length > ceiling) {
      issues.push(`new_analysis_unit_ceiling_exceeded:${studyUnit.studyUnitId}`);
    }
    for (const id of introduced) {
      if (!analysisIds.has(id)) issues.push(`unknown_instructional_analysis_unit:${id}`);
      if (introductionPosition.has(id)) issues.push(`instructional_analysis_unit_introduced_twice:${id}`);
      else introductionPosition.set(id, position);
    }
    const introducedSet = new Set(introduced);
    for (const explanation of studyUnit.explanationApplications) {
      if (!introducedSet.has(explanation.instructionalAnalysisUnitId)) {
        issues.push(`explanation_without_local_introduction:${explanation.instructionalAnalysisUnitId}`);
      }
      const accounted = new Set([
        ...explanation.developedForms,
        ...explanation.notApplicable.map(({ form }) => form)
      ]);
      for (const form of requiredForms) {
        if (!accounted.has(form)) {
          issues.push(`required_explanation_form_missing:${explanation.instructionalAnalysisUnitId}:${form}`);
        }
      }
    }
    const explained = new Set(
      studyUnit.explanationApplications.map(({ instructionalAnalysisUnitId }) => instructionalAnalysisUnitId)
    );
    for (const id of introduced) {
      if (!explained.has(id)) issues.push(`introduced_unit_without_explanation_application:${id}`);
    }
    for (const practice of studyUnit.practiceApplications) {
      if (!evidenceIds.has(practice.evidenceRequirementId)) {
        issues.push(`unknown_evidence_requirement:${practice.evidenceRequirementId}`);
      } else practices.get(practice.evidenceRequirementId).push(practice);
    }
    for (const ref of studyUnit.componentRefs) {
      if (!policyAllows(componentPolicy, ref)) issues.push(`component_policy_violation:${ref}`);
    }
  });

  for (const id of analysisIds) {
    if (!introductionPosition.has(id)) issues.push(`instructional_analysis_unit_not_covered:${id}`);
  }
  for (const [evidenceId, opportunities] of practices) {
    if (opportunities.length < minimumPractice) {
      issues.push(`minimum_practice_opportunities_not_met:${evidenceId}`);
    }
    const dimensions = new Set(opportunities.flatMap(({ variedDimensions }) => variedDimensions));
    if (new Set(opportunities.map(({ invariantTaskOperation }) => invariantTaskOperation)).size > 1) {
      issues.push(`invariant_task_operation_changed:${evidenceId}`);
    }
    for (const dimension of requiredVariation) {
      if (!dimensions.has(dimension)) issues.push(`required_practice_variation_missing:${evidenceId}:${dimension}`);
    }
  }
  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    summary: summarizeDesignApplication(application)
  };
}

export function summarizeDesignApplication(applicationValue) {
  const application = normalizeCourseDesignApplication(applicationValue);
  const introducedIds = new Set();
  const forms = new Set();
  const dimensions = new Set();
  const componentRefs = new Set();
  const modeCounts = { expository: 0, practice: 0, mixed: 0 };
  let practiceOpportunityCount = 0;
  for (const studyUnit of application.studyUnits) {
    modeCounts[studyUnit.mode] += 1;
    studyUnit.introducedInstructionalAnalysisUnitIds.forEach((id) => introducedIds.add(id));
    studyUnit.explanationApplications.forEach(({ developedForms }) => {
      developedForms.forEach((form) => forms.add(form));
    });
    studyUnit.practiceApplications.forEach(({ variedDimensions }) => {
      practiceOpportunityCount += 1;
      variedDimensions.forEach((dimension) => dimensions.add(dimension));
    });
    studyUnit.componentRefs.forEach((ref) => componentRefs.add(ref));
  }
  return {
    contextHash: application.contextHash,
    studyUnitCount: application.studyUnits.length,
    modeCounts,
    introducedInstructionalAnalysisUnitIds: [...introducedIds],
    developedExplanationForms: EXPLANATION_FORMS.filter((form) => forms.has(form)),
    practiceOpportunityCount,
    variedDimensions: PRACTICE_VARIATION_DIMENSIONS.filter((dimension) => dimensions.has(dimension)),
    componentRefs: [...componentRefs].sort((left, right) => left.localeCompare(right, "en"))
  };
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

function readTimestamp(value, label) {
  if (typeof value !== "string" || value !== value.trim() || !value ||
      !Number.isFinite(Date.parse(value))) {
    fail("invalid_course_design_read", `${label} é inválido.`);
  }
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
  if (!Array.isArray(value.ancestors) || value.ancestors.length > 3 ||
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
    fail("invalid_course_design_read", "Uma microssequência não pode expor filhos de desenho.");
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
      ? ["changeId", "value", "origin", "reason", "sourceScope", "inherited"]
      : ["changeId", "value", "origin", "reason"],
    "invalid_course_design_read",
    label
  );
  normalizeCourseDesignParameterValue(definition.id, value.value);
  readText(value.reason, 1000, `A justificativa de ${label}`);
  if (!effective) {
    decimalId(value.changeId, "invalid_course_design_read", `A identidade de ${label}`);
    origin(value.origin);
    return;
  }
  if (typeof value.inherited !== "boolean") {
    fail("invalid_course_design_read", `${label} não informa herança válida.`);
  }
  if (value.origin === "system_default") {
    if (value.changeId !== null || value.sourceScope !== null || value.inherited ||
        !sameJson(value.value, definition.defaultValue)) {
      fail("invalid_course_design_read", `${label} não representa o default do sistema.`);
    }
    return;
  }
  origin(value.origin);
  decimalId(value.changeId, "invalid_course_design_read", `A identidade de ${label}`);
  const sourceScope = readScope(value.sourceScope, `O escopo de origem de ${label}`, { parameter: true });
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
    fail("invalid_course_design_read", "A leitura não contém os quatro parâmetros canônicos.");
  }
  value.forEach((entry, index) => {
    exact(
      entry,
      ["parameterId", "localAssignment", "effectiveAssignment"],
      "invalid_course_design_read",
      "A resolução de parâmetro"
    );
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS[index];
    if (entry.parameterId !== definition.id) {
      fail("invalid_course_design_read", "Os parâmetros não seguem a ordem canônica.");
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

function validateGuidanceRevision(value, label, { effective = false } = {}) {
  exact(
    value,
    effective
      ? ["revisionId", "guidance", "origin", "reason", "sourceScope", "currentInterpretation"]
      : ["revisionId", "guidance", "origin", "reason"],
    "invalid_course_design_read",
    label
  );
  uuid(value.revisionId, "invalid_course_design_read", `A identidade de ${label}`);
  origin(value.origin, [...ASSIGNMENT_ORIGINS, "migration"]);
  if (value.origin === "migration") {
    if (typeof value.guidance !== "string" || !value.guidance.trim() ||
        [...value.guidance].length > 16384 || hasControl(value.guidance) ||
        encoder.encode(value.guidance).byteLength > 65536) {
      fail("invalid_course_design_read", `O texto de ${label} é inválido.`);
    }
  } else {
    readText(value.guidance, 8192, `O texto de ${label}`, { bytes: 8192 });
  }
  readText(value.reason, 1000, `A justificativa de ${label}`);
  if (!effective) return null;
  const sourceScope = readScope(value.sourceScope, `O escopo de origem de ${label}`);
  if (value.currentInterpretation !== null) {
    const item = value.currentInterpretation;
    exact(
      item,
      ["interpretationId", "guidanceRevisionId", "interpretation", "createdAt"],
      "invalid_course_design_read",
      "A interpretação corrente"
    );
    decimalId(item.interpretationId, "invalid_course_design_read", "A identidade da interpretação");
    uuid(item.guidanceRevisionId, "invalid_course_design_read", "A revisão interpretada");
    if (item.guidanceRevisionId !== value.revisionId) {
      fail("invalid_course_design_read", "A interpretação não pertence à revisão exposta.");
    }
    normalizeCourseAuthoringGuidanceInterpretation(item.interpretation);
    readTimestamp(item.createdAt, "A data da interpretação");
  }
  return sourceScope;
}

function validateGuidance(value, scopePath, currentScope) {
  exact(
    value,
    ["localRevision", "effectiveRevisions"],
    "invalid_course_design_read",
    "A orientação de Autoria"
  );
  if (!Array.isArray(value.effectiveRevisions) || value.effectiveRevisions.length > 4) {
    fail("invalid_course_design_read", "A pilha de orientações excede a cadeia de escopos.");
  }
  const pathDepth = new Map(scopePath.map((scope, index) => [`${scope.kind}\0${scope.ref}`, index]));
  let previousDepth = -1;
  const revisionIds = new Set();
  for (const revision of value.effectiveRevisions) {
    const sourceScope = validateGuidanceRevision(revision, "Uma revisão efetiva", { effective: true });
    const depth = pathDepth.get(`${sourceScope.kind}\0${sourceScope.ref}`);
    if (depth === undefined || depth <= previousDepth || revisionIds.has(revision.revisionId)) {
      fail("invalid_course_design_read", "A pilha de orientações não segue a ordem ancestral.");
    }
    previousDepth = depth;
    revisionIds.add(revision.revisionId);
  }
  if (value.localRevision !== null) {
    validateGuidanceRevision(value.localRevision, "A revisão local");
    const effectiveLocal = value.effectiveRevisions.find(({ sourceScope }) => (
      sourceScope.kind === currentScope.kind && sourceScope.ref === currentScope.ref
    ));
    if (!effectiveLocal || effectiveLocal.revisionId !== value.localRevision.revisionId ||
        effectiveLocal.guidance !== value.localRevision.guidance ||
        effectiveLocal.origin !== value.localRevision.origin ||
        effectiveLocal.reason !== value.localRevision.reason) {
      fail("invalid_course_design_read", "A revisão local diverge da pilha efetiva.");
    }
  } else if (value.effectiveRevisions.some(({ sourceScope }) => (
    sourceScope.kind === currentScope.kind && sourceScope.ref === currentScope.ref
  ))) {
    fail("invalid_course_design_read", "A pilha contém revisão local não projetada.");
  }
}

function validateComponentCatalog(value) {
  exact(value, ["version", "options"], "invalid_course_design_read", "O catálogo de componentes");
  if (value.version !== COURSE_COMPONENT_CATALOG_VERSION ||
      !Array.isArray(value.options) || value.options.length !== 32) {
    fail("course_component_catalog_drift", "O catálogo de componentes divergiu da revisão corrente.");
  }
  const refs = new Set();
  for (const option of value.options) {
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

function validatePolicyChange(
  value,
  label,
  knownRefs,
  { effective = false, currentScope = null, scopePath = [] } = {}
) {
  exact(
    value,
    effective
      ? ["changeId", "policy", "origin", "reason", "sourceScope", "inherited"]
      : ["changeId", "policy", "origin", "reason"],
    "invalid_course_design_read",
    label
  );
  normalizeCourseComponentPolicy(value.policy, { knownRefs });
  readText(value.reason, 1000, `A justificativa de ${label}`);
  if (!effective) {
    decimalId(value.changeId, "invalid_course_design_read", `A identidade de ${label}`);
    origin(value.origin);
    return;
  }
  if (typeof value.inherited !== "boolean") {
    fail("invalid_course_design_read", `${label} não informa herança válida.`);
  }
  if (value.origin === "system_default") {
    if (value.changeId !== null || value.sourceScope !== null || value.inherited ||
        value.policy.availability !== "all" || value.policy.allowedRefs.length ||
        value.policy.excludedRefs.length || value.policy.preferredRefs.length) {
      fail("invalid_course_design_read", `${label} não representa a política default.`);
    }
    return;
  }
  origin(value.origin);
  decimalId(value.changeId, "invalid_course_design_read", `A identidade de ${label}`);
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
  exact(value, ["localChange", "effectiveChange"], "invalid_course_design_read", "A política resolvida");
  if (value.localChange !== null) {
    validatePolicyChange(value.localChange, "A política local", knownRefs);
  }
  validatePolicyChange(
    value.effectiveChange,
    "A política efetiva",
    knownRefs,
    { effective: true, currentScope, scopePath }
  );
}

function validateRecentApplications(value, knownRefs) {
  if (!Array.isArray(value) || value.length > 16) {
    fail("invalid_course_design_read", "O histórico recente de aplicações excede o limite.");
  }
  const identities = new Set();
  value.forEach((application) => {
    exact(
      application,
      [
        "materializationId", "stepId", "didacticMicrosequenceId", "recordedAt", "contextHash",
        "studyUnitCount", "modeCounts", "introducedInstructionalAnalysisUnitIds",
        "developedExplanationForms", "practiceOpportunityCount", "variedDimensions", "componentRefs"
      ],
      "invalid_course_design_read",
      "Um resumo de aplicação"
    );
    uuid(application.materializationId, "invalid_course_design_read", "A identidade da materialização");
    uuid(application.stepId, "invalid_course_design_read", "A identidade da etapa");
    const identityKey = `${application.materializationId}\0${application.stepId}`;
    if (identities.has(identityKey)) fail("invalid_course_design_read", "O histórico repete uma aplicação.");
    identities.add(identityKey);
    identity(application.didacticMicrosequenceId, 240, "invalid_course_design_read", "A microssequência aplicada");
    readTimestamp(application.recordedAt, "A data da aplicação");
    if (typeof application.contextHash !== "string" || !SHA256_PATTERN.test(application.contextHash) ||
        !Number.isSafeInteger(application.studyUnitCount) || application.studyUnitCount < 0 ||
        application.studyUnitCount > 64 ||
        !Number.isSafeInteger(application.practiceOpportunityCount) || application.practiceOpportunityCount < 0) {
      fail("invalid_course_design_read", "O resumo numérico da aplicação é inválido.");
    }
    exact(
      application.modeCounts,
      ["expository", "practice", "mixed"],
      "invalid_course_design_read",
      "As contagens por modo"
    );
    const counts = ["expository", "practice", "mixed"].map((mode) => application.modeCounts[mode]);
    if (counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
        counts.reduce((sum, count) => sum + count, 0) !== application.studyUnitCount) {
      fail("invalid_course_design_read", "As contagens por modo não fecham o total de Unidades.");
    }
    uniqueUuidList(
      application.introducedInstructionalAnalysisUnitIds,
      4096,
      "invalid_course_design_read",
      "As unidades de análise introduzidas"
    );
    uniqueEnumList(
      application.developedExplanationForms,
      EXPLANATION_FORMS,
      EXPLANATION_FORMS.length,
      "invalid_course_design_read",
      "As formas de explicação desenvolvidas"
    );
    uniqueEnumList(
      application.variedDimensions,
      PRACTICE_VARIATION_DIMENSIONS,
      PRACTICE_VARIATION_DIMENSIONS.length,
      "invalid_course_design_read",
      "As dimensões variadas"
    );
    const refs = componentRefList(application.componentRefs, "componentRefs");
    if (refs.some((ref) => !knownRefs.has(ref))) {
      fail("course_component_catalog_drift", "Uma aplicação recente referencia componente fora do catálogo.");
    }
  });
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
      "componentPolicy",
      "recentApplications"
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
  if (scope.current.kind === "didactic_microsequence") {
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
      "Somente uma microssequência pode expor itens do plano atribuídos."
    );
  }
  validateParameters(read.parameters, scope.path, scope.current);
  validateGuidance(read.guidance, scope.path, scope.current);
  const knownRefs = validateComponentCatalog(read.componentCatalog);
  validateComponentPolicyRead(read.componentPolicy, knownRefs, scope.path, scope.current);
  validateRecentApplications(read.recentApplications, knownRefs);
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
      ["changeId", "type", "scope"],
      "invalid_course_design_change",
      "O fato da mudança"
    );
    decimalId(change.change.changeId, "invalid_course_design_change", "A identidade da mudança");
    if (!COMMAND_TYPES.includes(change.change.type)) fail("invalid_course_design_change", "O tipo da mudança é inválido.");
    const scope = normalizeCourseDesignScope(change.change.scope, {
      parameter: ["set_parameter", "clear_parameter"].includes(change.change.type)
    });
    if (change.change.type === "set_target_plan_items" &&
        scope.kind !== "didactic_microsequence") {
      fail(
        "invalid_course_design_change",
        "A atribuição de itens do plano não aponta para uma microssequência."
      );
    }
    if (scope.kind === "course" && scope.ref !== change.courseId) {
      fail("invalid_course_design_change", "O escopo Course da mudança diverge do Curso retornado.");
    }
  }
  return change;
}
