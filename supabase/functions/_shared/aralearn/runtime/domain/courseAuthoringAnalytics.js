import { COURSE_SOURCE_ROLES } from "./courseSources.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS, normalizeCourseDesignParameterValue } from "./courseDesignParameters.js";
import { observeCoursePracticeDistribution } from "./coursePracticeDistribution.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDENTIFIER = /^[a-z][a-z0-9._:-]{0,159}$/u;
const INTERNAL_PUBLIC_LANGUAGE =
  /StudyUnits?|AnalysisUnits?|analysisUnits|evidenceRequirements|missingData|snapshot|schema|\bCAS\b|requestId|courseRevision|componentRef|studyUnitRef|\bUUID\b|\bAnalytics\b|\bSupabase\b|\bHTTP\b|\bRPC\b|\bSQL\b|\bAPI\b/iu;

export const COURSE_AUTHORING_ANALYTICS_CONTRACT =
  "aralearn.course-authoring-analytics.v3";

export const COURSE_AUTHORING_ANALYTICS_SCOPE_KINDS = Object.freeze([
  "course",
  "authoring_part",
  "didactic_microsequence",
  "study_unit"
]);

export const COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS = Object.freeze(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id }) => id)
);

const SCOPE_KIND_SET = new Set(COURSE_AUTHORING_ANALYTICS_SCOPE_KINDS);
const PARAMETER_ID_SET = new Set(COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS);
const SOURCE_ROLE_SET = new Set(COURSE_SOURCE_ROLES);
const PARAMETER_SOURCE_SCOPE_KIND_SET = new Set([
  "course",
  "lesson",
  "didactic_microsequence",
  "study_unit"
]);
const EDITORIAL_SOURCE_SCOPE_KIND_SET = new Set([
  "course",
  "module",
  "lesson",
  "didactic_microsequence",
  "study_unit"
]);
const PARAMETER_VALUE_KINDS = Object.freeze(Object.fromEntries(
  COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id, valueSchema }) => [
    id, valueSchema.type === "set" ? "string_list" : valueSchema.type
  ])
));

export class CourseAuthoringAnalyticsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CourseAuthoringAnalyticsError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CourseAuthoringAnalyticsError(code, message);
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

function exact(value, fields, label) {
  const source = plainObject(value, label);
  const actual = Object.keys(source);
  if (actual.length !== fields.length || actual.some((field) => !fields.includes(field))) {
    fail("invalid_course_authoring_analytics", `${label} não possui a forma esperada.`);
  }
  return source;
}

function hasInvalidControl(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 8 || code === 11 || code === 12 ||
      code >= 14 && code <= 31 || code >= 127 && code <= 159;
  });
}

function text(value, maximum, label, { empty = false } = {}) {
  if (typeof value !== "string" || value !== value.trim() ||
      (!empty && !value) || [...value].length > maximum || hasInvalidControl(value)) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

function nullableText(value, maximum, label) {
  return value === null ? null : text(value, maximum, label);
}

function nullableScopeKind(value, allowed, label) {
  if (value === null) return null;
  const normalized = identifier(value, label);
  if (!allowed.has(normalized)) {
    fail("invalid_course_authoring_analytics", `${label} é desconhecido.`);
  }
  return normalized;
}

function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value.toLowerCase();
}

function identifier(value, label) {
  const normalized = text(value, 160, label);
  if (!IDENTIFIER.test(normalized)) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return normalized;
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  return value;
}

function uniqueRows(value, maximum, key, label, normalize) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  const rows = value.map(normalize);
  if (new Set(rows.map(key)).size !== rows.length) {
    fail("invalid_course_authoring_analytics", `${label} repete informações.`);
  }
  return rows;
}

function uniqueTexts(value, maximumItems, maximumLength, label) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail("invalid_course_authoring_analytics", `${label} é inválido.`);
  }
  const values = value.map((entry) => text(entry, maximumLength, label));
  if (new Set(values).size !== values.length) {
    fail("invalid_course_authoring_analytics", `${label} contém valor repetido.`);
  }
  return values;
}

function scopeReference(value, kind, label) {
  if (kind === "course") {
    if (value !== null) fail("invalid_course_authoring_analytics", `${label} é inválido.`);
    return null;
  }
  return text(value, 240, label);
}

function normalizeScopeOption(value, label = "O escopo") {
  const source = exact(value, ["kind", "ref", "label"], label);
  const kind = identifier(source.kind, `O tipo de ${label}`);
  if (!SCOPE_KIND_SET.has(kind)) {
    fail("invalid_course_authoring_analytics", `${label} usa tipo desconhecido.`);
  }
  return {
    kind,
    ref: scopeReference(source.ref, kind, `O destino de ${label}`),
    label: text(source.label, 300, `O rótulo de ${label}`)
  };
}

export function normalizeCourseAuthoringAnalyticsQuery(value = {}) {
  const source = plainObject(value, "O recorte dos dados de autoria");
  if (Object.keys(source).some((field) => field !== "scope")) {
    fail(
      "invalid_course_authoring_analytics",
      "O recorte dos dados de autoria não pôde ser reconhecido."
    );
  }
  const scope = source.scope === undefined
    ? { kind: "course", ref: null }
    : exact(source.scope, ["kind", "ref"], "O escopo do recorte");
  const kind = identifier(scope.kind, "O tipo do escopo");
  if (!SCOPE_KIND_SET.has(kind)) {
    fail("invalid_course_authoring_analytics", "O escopo do recorte é desconhecido.");
  }
  return { scope: { kind, ref: scopeReference(scope.ref, kind, "O destino do escopo") } };
}

function normalizeScope(value) {
  const source = exact(value, ["selected", "options"], "Os escopos dos dados de autoria");
  const selected = normalizeScopeOption(source.selected, "O escopo selecionado");
  const options = uniqueRows(
    source.options,
    4096,
    (entry) => `${entry.kind}\0${entry.ref ?? ""}`,
    "As opções de escopo",
    (entry) => normalizeScopeOption(entry, "Uma opção de escopo")
  );
  if (!options.some((entry) => entry.kind === selected.kind && entry.ref === selected.ref)) {
    fail("invalid_course_authoring_analytics", "O escopo selecionado não pertence às opções.");
  }
  return { selected, options };
}

function normalizeParameterValue(value, parameterId) {
  if (value === null) return null;
  try { return normalizeCourseDesignParameterValue(parameterId, value); }
  catch { fail("invalid_course_authoring_analytics", "O valor aplicado diverge do catálogo."); }
}

function normalizeParameter(value) {
  const source = exact(value, [
    "parameterId", "label", "valueKind", "definition", "effectiveValues"
  ], "Um parâmetro pedagógico");
  const parameterId = identifier(source.parameterId, "O parâmetro");
  if (!PARAMETER_ID_SET.has(parameterId)) {
    fail(
      "invalid_course_authoring_analytics",
      "Os dados de autoria contêm um parâmetro que não está disponível."
    );
  }
  const valueKind = identifier(source.valueKind, "O tipo do valor do parâmetro");
  const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameterId);
  const canonical = (item) => Array.isArray(item) ? item.map(canonical) :
    item && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical(item[key])])) : item;
  if (JSON.stringify(canonical(source.definition)) !== JSON.stringify(canonical(definition))) {
    fail("invalid_course_authoring_analytics", "A definição exportada diverge do catálogo de parâmetros.");
  }
  if (valueKind !== PARAMETER_VALUE_KINDS[parameterId]) {
    fail("invalid_course_authoring_analytics", "O tipo do valor não corresponde ao parâmetro.");
  }
  const effectiveValues = uniqueRows(
    source.effectiveValues,
    256,
    (entry) => [
      JSON.stringify(entry.value),
      entry.origin ?? "",
      entry.reason ?? "",
      entry.sourceScopeKind ?? ""
    ].join("\0"),
    "Os valores efetivos do parâmetro",
    (entry) => {
      const row = exact(
        entry,
        ["value", "origin", "reason", "sourceScopeKind", "studyUnitCount"],
        "Um valor efetivo"
      );
      return {
        value: normalizeParameterValue(row.value, parameterId),
        origin: row.origin === null ? null : identifier(row.origin, "A origem do valor efetivo"),
        reason: row.reason === null ? null : text(row.reason, 1000, "O motivo da escolha aplicada"),
        sourceScopeKind: nullableScopeKind(
          row.sourceScopeKind,
          PARAMETER_SOURCE_SCOPE_KIND_SET,
          "O escopo de origem do valor efetivo"
        ),
        studyUnitCount: nonnegativeInteger(
          row.studyUnitCount,
          "A quantidade de unidades de estudo deste valor"
        )
      };
    }
  );
  return {
    parameterId,
    label: text(source.label, 240, "O rótulo do parâmetro"),
    valueKind,
    definition: structuredClone(definition),
    effectiveValues
  };
}

function normalizeEditorialDirection(value) {
  const source = exact(
    value,
    ["direction", "origin", "sourceScopeKind", "studyUnitCount"],
    "Uma direção editorial"
  );
  return {
    direction: nullableText(source.direction, 4000, "A direção editorial"),
    origin: source.origin === null ? null : identifier(source.origin, "A origem editorial"),
    sourceScopeKind: nullableScopeKind(
      source.sourceScopeKind,
      EDITORIAL_SOURCE_SCOPE_KIND_SET,
      "O escopo de origem da direção editorial"
    ),
    studyUnitCount: nonnegativeInteger(
      source.studyUnitCount,
      "A quantidade de unidades de estudo desta direção editorial"
    )
  };
}

function normalizeAnalysisUnit(value) {
  const source = exact(value, [
    "position", "statement", "introductionCount", "useCount", "revisitCount"
  ], "Uma unidade de análise");
  return {
    position: positiveInteger(source.position, "A posição da unidade de análise"),
    statement: text(source.statement, 2000, "O enunciado da unidade de análise"),
    introductionCount: nonnegativeInteger(
      source.introductionCount,
      "As introduções da unidade de análise"
    ),
    useCount: nonnegativeInteger(source.useCount, "Os usos da unidade de análise"),
    revisitCount: nonnegativeInteger(source.revisitCount, "As retomadas da unidade de análise")
  };
}

function normalizeStudyUnitIntroduction(value) {
  const source = exact(value, [
    "studyUnitRef", "position", "title", "introducedCount"
  ], "Uma unidade de estudo nos dados de autoria");
  return {
    studyUnitRef: text(source.studyUnitRef, 240, "O destino da unidade de estudo"),
    position: positiveInteger(source.position, "A posição da unidade de estudo"),
    title: text(source.title, 300, "O título da unidade de estudo"),
    introducedCount: nonnegativeInteger(
      source.introducedCount,
      "As novidades da unidade de estudo"
    )
  };
}

function normalizeExplanationForm(value) {
  const source = exact(value, ["form", "studyUnitCount", "applicationCount"], "Uma forma explicativa");
  const studyUnitCount = nonnegativeInteger(
    source.studyUnitCount,
    "As unidades de estudo da forma explicativa"
  );
  const applicationCount = nonnegativeInteger(source.applicationCount, "As aplicações da forma explicativa");
  if (applicationCount < studyUnitCount) {
    fail("invalid_course_authoring_analytics", "A forma explicativa possui aplicações incoerentes.");
  }
  return {
    form: identifier(source.form, "A forma explicativa"),
    studyUnitCount,
    applicationCount
  };
}

function normalizeComponent(value) {
  const source = exact(value, ["componentRef", "studyUnitCount", "instanceCount"], "Um componente");
  const studyUnitCount = nonnegativeInteger(
    source.studyUnitCount,
    "As unidades de estudo do componente"
  );
  const instanceCount = nonnegativeInteger(source.instanceCount, "As instâncias do componente");
  if (instanceCount < studyUnitCount) {
    fail("invalid_course_authoring_analytics", "O componente possui instâncias incoerentes.");
  }
  return {
    componentRef: text(source.componentRef, 240, "A referência do componente"),
    studyUnitCount,
    instanceCount
  };
}

function normalizePracticeRequirement(value) {
  const source = exact(value, ["position", "statement", "opportunityCount"], "Um requisito de prática");
  return {
    position: positiveInteger(source.position, "A posição do requisito"),
    statement: text(source.statement, 2000, "O enunciado do requisito"),
    opportunityCount: nonnegativeInteger(source.opportunityCount, "As oportunidades do requisito")
  };
}

function normalizePracticeDimension(value) {
  const source = exact(value, ["dimension", "opportunityCount"], "Uma dimensão de prática");
  return {
    dimension: identifier(source.dimension, "A dimensão de prática"),
    opportunityCount: nonnegativeInteger(source.opportunityCount, "As oportunidades da dimensão")
  };
}

function normalizeSourceRole(value) {
  const source = exact(value, [
    "role", "sourceCount", "anchorCount", "studyUnitCount"
  ], "Um papel de fonte");
  const role = source.role === null ? null : identifier(source.role, "O papel da fonte");
  if (role !== null && !SOURCE_ROLE_SET.has(role)) {
    fail("invalid_course_authoring_analytics", "O papel da fonte não está disponível.");
  }
  return {
    role,
    sourceCount: nonnegativeInteger(source.sourceCount, "As fontes do papel"),
    anchorCount: nonnegativeInteger(source.anchorCount, "As âncoras do papel"),
    studyUnitCount: nonnegativeInteger(
      source.studyUnitCount,
      "As unidades de estudo do papel"
    )
  };
}

function normalizeWordCountsByStudyUnit(value, studyUnitCount) {
  const distribution = uniqueRows(
    value,
    4096,
    (entry) => String(entry.wordCount),
    "A distribuição de palavras por unidade de estudo",
    (entry) => {
      const row = exact(
        entry,
        ["wordCount", "studyUnitCount"],
        "Uma faixa de palavras por unidade de estudo"
      );
      return {
        wordCount: nonnegativeInteger(row.wordCount, "A quantidade de palavras"),
        studyUnitCount: positiveInteger(
          row.studyUnitCount,
          "A quantidade de unidades com esta extensão"
        )
      };
    }
  ).sort((left, right) => left.wordCount - right.wordCount);
  if (distribution.reduce((sum, entry) => sum + entry.studyUnitCount, 0) !==
      studyUnitCount) {
    fail(
      "invalid_course_authoring_analytics",
      "A distribuição de palavras não fecha com as unidades de estudo."
    );
  }
  return distribution;
}

function normalizeDesign(value) {
  const source = exact(value, [
    "studyUnitCount", "parameters", "editorialDirections", "analysisUnits",
    "introductionsByStudyUnit", "explanationForms", "components",
    "practiceByRequirement", "practiceVariationDimensions", "sourcesByRole",
    "wordCountsByStudyUnit", "practiceSequence",
    ...(Object.hasOwn(value, "practiceDistribution") ? ["practiceDistribution"] : [])
  ], "O desenho quantitativo");
  const studyUnitCount = nonnegativeInteger(
    source.studyUnitCount,
    "A quantidade de unidades de estudo"
  );
  let practiceDistribution;
  try { practiceDistribution = observeCoursePracticeDistribution(source.practiceSequence); }
  catch { fail("invalid_course_authoring_analytics", "A sequência de práticas declaradas é inválida."); }
  if (practiceDistribution.studyUnitCount !== studyUnitCount) {
    fail("invalid_course_authoring_analytics", "A distribuição de práticas não corresponde ao recorte.");
  }
  if (Object.hasOwn(source, "practiceDistribution") && (!source.practiceDistribution ||
    Object.keys(practiceDistribution).some((key) =>
      JSON.stringify(practiceDistribution[key]) !== JSON.stringify(source.practiceDistribution[key])) ||
    Object.keys(source.practiceDistribution).length !== Object.keys(practiceDistribution).length)) {
    fail("invalid_course_authoring_analytics", "A observação da prática diverge da sequência declarada.");
  }
  const parameters = uniqueRows(
    source.parameters,
    COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS.length,
    (entry) => entry.parameterId,
    "Os parâmetros pedagógicos",
    normalizeParameter
  );
  if (parameters.length !== COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS.length ||
      COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS.some((id) =>
        !parameters.some((parameter) => parameter.parameterId === id))) {
    fail(
      "invalid_course_authoring_analytics",
      "Os dados de autoria não incluem toda a configuração do desenho."
    );
  }
  const editorialDirections = uniqueRows(
    source.editorialDirections,
    256,
    (entry) => [
      entry.direction ?? "",
      entry.origin ?? "",
      entry.sourceScopeKind ?? ""
    ].join("\0"),
    "As direções editoriais",
    normalizeEditorialDirection
  );
  const analysisUnits = uniqueRows(
    source.analysisUnits,
    4096,
    (entry) => String(entry.position),
    "As unidades de análise",
    normalizeAnalysisUnit
  );
  const introductionsByStudyUnit = uniqueRows(
    source.introductionsByStudyUnit,
    4096,
    (entry) => entry.studyUnitRef,
    "As introduções por unidade de estudo",
    normalizeStudyUnitIntroduction
  );
  if (introductionsByStudyUnit.length !== studyUnitCount ||
      analysisUnits.reduce((sum, entry) => sum + entry.introductionCount, 0) !==
        introductionsByStudyUnit.reduce((sum, entry) => sum + entry.introducedCount, 0)) {
    fail(
      "invalid_course_authoring_analytics",
      "As introduções não correspondem às unidades de estudo do recorte."
    );
  }
  for (const parameter of parameters) {
    if (parameter.effectiveValues.reduce((sum, entry) => sum + entry.studyUnitCount, 0) >
        studyUnitCount) {
      fail(
        "invalid_course_authoring_analytics",
        "Um parâmetro abrange mais unidades de estudo do que o recorte."
      );
    }
  }
  return {
    studyUnitCount,
    practiceSequence: source.practiceSequence.map((row) => ({ ...row })),
    practiceDistribution,
    parameters,
    editorialDirections,
    analysisUnits,
    introductionsByStudyUnit,
    explanationForms: uniqueRows(source.explanationForms, 32, (entry) => entry.form,
      "As formas explicativas", normalizeExplanationForm),
    components: uniqueRows(source.components, 512, (entry) => entry.componentRef,
      "Os componentes", normalizeComponent),
    practiceByRequirement: uniqueRows(source.practiceByRequirement, 4096,
      (entry) => String(entry.position), "As práticas por requisito", normalizePracticeRequirement),
    practiceVariationDimensions: uniqueRows(source.practiceVariationDimensions, 32,
      (entry) => entry.dimension, "As dimensões de prática", normalizePracticeDimension),
    sourcesByRole: uniqueRows(source.sourcesByRole, 32, (entry) => entry.role,
      "As fontes por papel", normalizeSourceRole),
    wordCountsByStudyUnit: normalizeWordCountsByStudyUnit(
      source.wordCountsByStudyUnit,
      studyUnitCount
    )
  };
}

function normalizeAuthorship(value) {
  const source = exact(value, [
    "observations", "explicitParameterOverrideCount", "manuallyRevisedStudyUnitCount",
    "studyUnitsByOrigin"
  ], "Os dados quantitativos de autoria");
  const observations = exact(source.observations, [
    "createdCount", "openCount", "resolvedCount"
  ], "As contagens de observações");
  const normalizedObservations = {
    createdCount: nonnegativeInteger(observations.createdCount, "As observações criadas"),
    openCount: nonnegativeInteger(observations.openCount, "As observações abertas"),
    resolvedCount: nonnegativeInteger(observations.resolvedCount, "As observações resolvidas")
  };
  if (normalizedObservations.openCount + normalizedObservations.resolvedCount >
      normalizedObservations.createdCount) {
    fail("invalid_course_authoring_analytics", "Os estados das observações excedem as criações.");
  }
  return {
    observations: normalizedObservations,
    explicitParameterOverrideCount: nonnegativeInteger(
      source.explicitParameterOverrideCount,
      "As definições explícitas de parâmetros"
    ),
    manuallyRevisedStudyUnitCount: nonnegativeInteger(
      source.manuallyRevisedStudyUnitCount,
      "As unidades de estudo cuja última edição é humana"
    ),
    studyUnitsByOrigin: uniqueRows(
      source.studyUnitsByOrigin,
      16,
      (entry) => entry.origin,
      "As mudanças de unidades de estudo por origem",
      (entry) => {
        const row = exact(
          entry,
          ["origin", "createdCount", "lastRevisedCount"],
          "Uma origem de mudança"
        );
        return {
          origin: identifier(row.origin, "A origem da mudança"),
          createdCount: nonnegativeInteger(
            row.createdCount,
            "As unidades de estudo criadas pela origem"
          ),
          lastRevisedCount: nonnegativeInteger(
            row.lastRevisedCount,
            "As unidades de estudo cuja última edição tem esta origem"
          )
        };
      }
    )
  };
}

function nullableDeepLink(value) {
  if (value === null) return null;
  const normalized = text(value, 4096, "O link dos dados de autoria");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    fail("invalid_course_authoring_analytics", "O link dos dados de autoria é inválido.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail("invalid_course_authoring_analytics", "O link dos dados de autoria é inválido.");
  }
  return parsed.href;
}

export function normalizeCourseAuthoringAnalyticsPage(value, {
  expectedCourseId = null,
  expectedQuery = null
} = {}) {
  const source = exact(value, [
    "contract", "course", "scope", "design", "authorship", "missingData", "deepLink"
  ], "A leitura dos dados de autoria");
  if (source.contract !== COURSE_AUTHORING_ANALYTICS_CONTRACT) {
    fail("invalid_course_authoring_analytics", "O formato dos dados de autoria não é reconhecido.");
  }
  const course = exact(source.course, ["id", "revision", "title"], "O curso dos dados de autoria");
  const normalizedCourse = {
    id: uuid(course.id, "O curso informado"),
    revision: positiveInteger(course.revision, "A edição do curso"),
    title: text(course.title, 300, "O título do curso")
  };
  if (expectedCourseId !== null && normalizedCourse.id !== uuid(expectedCourseId, "O curso esperado")) {
    fail("course_authoring_analytics_mismatch", "A resposta pertence a outro curso.");
  }
  const scope = normalizeScope(source.scope);
  if (expectedQuery !== null) {
    const expected = normalizeCourseAuthoringAnalyticsQuery(expectedQuery).scope;
    if (scope.selected.kind !== expected.kind || scope.selected.ref !== expected.ref) {
      fail("course_authoring_analytics_mismatch", "A resposta pertence a outro escopo.");
    }
  }
  const design = normalizeDesign(source.design);
  const authorship = normalizeAuthorship(source.authorship);
  const missingData = uniqueTexts(source.missingData, 64, 500, "Os dados ausentes");
  if (missingData.some((message) => INTERNAL_PUBLIC_LANGUAGE.test(message))) {
    fail(
      "invalid_course_authoring_analytics",
      "Os dados ausentes precisam ser apresentados em linguagem humana."
    );
  }
  const incompleteConditions = design.parameters.some((parameter) =>
    parameter.parameterId !==
      "new_analysis_unit_ceiling_per_expository_study_unit" &&
    parameter.effectiveValues.reduce((sum, entry) => sum + entry.studyUnitCount, 0) <
      design.studyUnitCount) ||
    design.editorialDirections.reduce((sum, entry) => sum + entry.studyUnitCount, 0) <
      design.studyUnitCount;
  if (incompleteConditions && missingData.length === 0) {
    fail(
      "invalid_course_authoring_analytics",
      "As ausências de configuração precisam permanecer indicadas nos dados de autoria."
    );
  }
  return {
    contract: source.contract,
    course: normalizedCourse,
    scope,
    design,
    authorship,
    missingData,
    deepLink: nullableDeepLink(source.deepLink)
  };
}

function analyticsBaseUrl(publicAppUrl) {
  const normalized = nullableDeepLink(String(publicAppUrl || ""));
  return normalized.replace(/[#?].*$/u, "").replace(/\/+$/u, "");
}

export function assembleCourseAuthoringAnalyticsPage(rawValue, {
  publicAppUrl = null,
  expectedCourseId = null,
  expectedQuery = null
} = {}) {
  const snapshot = normalizeCourseAuthoringAnalyticsPage(rawValue, {
    expectedCourseId,
    expectedQuery
  });
  if (snapshot.deepLink !== null || publicAppUrl === null) return snapshot;
  const baseUrl = analyticsBaseUrl(publicAppUrl);
  let query = `section=research&analyticsScopeKind=${encodeURIComponent(
    snapshot.scope.selected.kind
  )}`;
  if (snapshot.scope.selected.ref !== null) {
    query += `&analyticsScopeId=${encodeURIComponent(snapshot.scope.selected.ref)}`;
  }
  query += `&analyticsRevision=${snapshot.course.revision}`;
  return normalizeCourseAuthoringAnalyticsPage({
    ...snapshot,
    deepLink: `${baseUrl}/#/authoring/courses/${encodeURIComponent(snapshot.course.id)}?${query}`
  }, { expectedCourseId: snapshot.course.id, expectedQuery });
}
