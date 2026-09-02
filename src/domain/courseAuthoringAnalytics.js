const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDENTIFIER = /^[a-z][a-z0-9._:-]{0,159}$/u;

export const COURSE_AUTHORING_ANALYTICS_CONTRACT =
  "aralearn.course-authoring-analytics.v2";

export const COURSE_AUTHORING_ANALYTICS_SCOPE_KINDS = Object.freeze([
  "course",
  "authoring_part",
  "didactic_microsequence",
  "study_unit"
]);

export const COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS = Object.freeze([
  "new_analysis_unit_ceiling_per_expository_study_unit",
  "required_explanation_forms",
  "minimum_distinct_practice_opportunities_per_evidence_requirement",
  "required_practice_variation_dimensions"
]);

const SCOPE_KIND_SET = new Set(COURSE_AUTHORING_ANALYTICS_SCOPE_KINDS);
const PARAMETER_ID_SET = new Set(COURSE_AUTHORING_ANALYTICS_PARAMETER_IDS);
const PARAMETER_VALUE_KINDS = Object.freeze({
  new_analysis_unit_ceiling_per_expository_study_unit: "integer",
  required_explanation_forms: "string_list",
  minimum_distinct_practice_opportunities_per_evidence_requirement: "integer",
  required_practice_variation_dimensions: "string_list"
});

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

function uuid(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail("invalid_course_authoring_analytics", `${label} precisa ser UUID.`);
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
    fail("invalid_course_authoring_analytics", `${label} contém linha repetida.`);
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
    ref: scopeReference(source.ref, kind, `A referência de ${label}`),
    label: text(source.label, 300, `O rótulo de ${label}`)
  };
}

export function normalizeCourseAuthoringAnalyticsQuery(value = {}) {
  const source = plainObject(value, "O recorte de Analytics");
  if (Object.keys(source).some((field) => field !== "scope")) {
    fail("invalid_course_authoring_analytics", "O recorte de Analytics contém campos desconhecidos.");
  }
  const scope = source.scope === undefined
    ? { kind: "course", ref: null }
    : exact(source.scope, ["kind", "ref"], "O escopo do recorte");
  const kind = identifier(scope.kind, "O tipo do escopo");
  if (!SCOPE_KIND_SET.has(kind)) {
    fail("invalid_course_authoring_analytics", "O escopo do recorte é desconhecido.");
  }
  return { scope: { kind, ref: scopeReference(scope.ref, kind, "A referência do escopo") } };
}

function normalizeScope(value) {
  const source = exact(value, ["selected", "options"], "Os escopos de Analytics");
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

function normalizeParameterValue(value, valueKind, label) {
  if (value === null) return null;
  if (valueKind === "integer") return positiveInteger(value, label);
  return uniqueTexts(value, 16, 80, label);
}

function normalizeParameter(value) {
  const source = exact(value, [
    "parameterId", "label", "valueKind", "effectiveValues"
  ], "Um parâmetro pedagógico");
  const parameterId = identifier(source.parameterId, "A identidade do parâmetro");
  if (!PARAMETER_ID_SET.has(parameterId)) {
    fail("invalid_course_authoring_analytics", "Analytics recebeu parâmetro fora dos quatro pedagógicos.");
  }
  const valueKind = identifier(source.valueKind, "O tipo do valor do parâmetro");
  if (valueKind !== PARAMETER_VALUE_KINDS[parameterId]) {
    fail("invalid_course_authoring_analytics", "O tipo do valor não corresponde ao parâmetro.");
  }
  const effectiveValues = uniqueRows(
    source.effectiveValues,
    256,
    (entry) => `${JSON.stringify(entry.value)}\0${entry.origin ?? ""}`,
    "Os valores efetivos do parâmetro",
    (entry) => {
      const row = exact(entry, ["value", "origin", "studyUnitCount"], "Um valor efetivo");
      return {
        value: normalizeParameterValue(row.value, valueKind, "O valor pedagógico efetivo"),
        origin: row.origin === null ? null : identifier(row.origin, "A origem do valor efetivo"),
        studyUnitCount: nonnegativeInteger(row.studyUnitCount, "A contagem de Units do valor")
      };
    }
  );
  return {
    parameterId,
    label: text(source.label, 240, "O rótulo do parâmetro"),
    valueKind,
    effectiveValues
  };
}

function normalizeEditorialDirection(value) {
  const source = exact(value, ["direction", "origin", "studyUnitCount"], "Uma direção editorial");
  return {
    direction: nullableText(source.direction, 4000, "A direção editorial"),
    origin: source.origin === null ? null : identifier(source.origin, "A origem editorial"),
    studyUnitCount: nonnegativeInteger(source.studyUnitCount, "A contagem editorial de Units")
  };
}

function normalizeAnalysisUnit(value) {
  const source = exact(value, ["position", "statement", "introductionCount"], "Uma AnalysisUnit");
  return {
    position: positiveInteger(source.position, "A posição da AnalysisUnit"),
    statement: text(source.statement, 2000, "O enunciado da AnalysisUnit"),
    introductionCount: nonnegativeInteger(source.introductionCount, "As introduções da AnalysisUnit")
  };
}

function normalizeStudyUnitIntroduction(value) {
  const source = exact(value, [
    "studyUnitRef", "position", "title", "introducedCount"
  ], "Uma Unit em Analytics");
  return {
    studyUnitRef: text(source.studyUnitRef, 240, "A referência da Unit"),
    position: positiveInteger(source.position, "A posição da Unit"),
    title: text(source.title, 300, "O título da Unit"),
    introducedCount: nonnegativeInteger(source.introducedCount, "As novidades da Unit")
  };
}

function normalizeExplanationForm(value) {
  const source = exact(value, ["form", "studyUnitCount", "applicationCount"], "Uma forma explicativa");
  const studyUnitCount = nonnegativeInteger(source.studyUnitCount, "As Units da forma explicativa");
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
  const studyUnitCount = nonnegativeInteger(source.studyUnitCount, "As Units do componente");
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
  ], "Um papel de Fonte");
  return {
    role: identifier(source.role, "O papel da Fonte"),
    sourceCount: nonnegativeInteger(source.sourceCount, "As Fontes do papel"),
    anchorCount: nonnegativeInteger(source.anchorCount, "As Âncoras do papel"),
    studyUnitCount: nonnegativeInteger(source.studyUnitCount, "As Units do papel")
  };
}

function normalizeDesign(value) {
  const source = exact(value, [
    "studyUnitCount", "parameters", "editorialDirections", "analysisUnits",
    "introductionsByStudyUnit", "explanationForms", "components",
    "practiceByRequirement", "practiceVariationDimensions", "sourcesByRole"
  ], "O desenho quantitativo");
  const studyUnitCount = nonnegativeInteger(source.studyUnitCount, "A quantidade de StudyUnits");
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
    fail("invalid_course_authoring_analytics", "Analytics precisa informar os quatro parâmetros pedagógicos.");
  }
  const editorialDirections = uniqueRows(
    source.editorialDirections,
    256,
    (entry) => `${entry.direction ?? ""}\0${entry.origin ?? ""}`,
    "As direções editoriais",
    normalizeEditorialDirection
  );
  const analysisUnits = uniqueRows(
    source.analysisUnits,
    4096,
    (entry) => String(entry.position),
    "As AnalysisUnits",
    normalizeAnalysisUnit
  );
  const introductionsByStudyUnit = uniqueRows(
    source.introductionsByStudyUnit,
    4096,
    (entry) => entry.studyUnitRef,
    "As introduções por StudyUnit",
    normalizeStudyUnitIntroduction
  );
  if (introductionsByStudyUnit.length !== studyUnitCount ||
      analysisUnits.reduce((sum, entry) => sum + entry.introductionCount, 0) !==
        introductionsByStudyUnit.reduce((sum, entry) => sum + entry.introducedCount, 0)) {
    fail("invalid_course_authoring_analytics", "As introduções não fecham com as StudyUnits.");
  }
  for (const parameter of parameters) {
    if (parameter.effectiveValues.reduce((sum, entry) => sum + entry.studyUnitCount, 0) >
        studyUnitCount) {
      fail("invalid_course_authoring_analytics", "Um parâmetro conta mais Units que o recorte.");
    }
  }
  if (editorialDirections.reduce((sum, entry) => sum + entry.studyUnitCount, 0) >
      studyUnitCount) {
    fail("invalid_course_authoring_analytics", "A direção editorial conta mais Units que o recorte.");
  }
  return {
    studyUnitCount,
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
      "As Fontes por papel", normalizeSourceRole)
  };
}

function normalizeAuthorship(value) {
  const source = exact(value, [
    "observations", "explicitParameterOverrideCount", "manuallyRevisedStudyUnitCount",
    "studyUnitsByOrigin"
  ], "A autoria quantitativa");
  const observations = exact(source.observations, [
    "createdCount", "openCount", "resolvedCount"
  ], "As contagens de Observações");
  const normalizedObservations = {
    createdCount: nonnegativeInteger(observations.createdCount, "As Observações criadas"),
    openCount: nonnegativeInteger(observations.openCount, "As Observações abertas"),
    resolvedCount: nonnegativeInteger(observations.resolvedCount, "As Observações resolvidas")
  };
  if (normalizedObservations.openCount + normalizedObservations.resolvedCount >
      normalizedObservations.createdCount) {
    fail("invalid_course_authoring_analytics", "Os estados das Observações excedem as criações.");
  }
  return {
    observations: normalizedObservations,
    explicitParameterOverrideCount: nonnegativeInteger(
      source.explicitParameterOverrideCount,
      "Os overrides explícitos de parâmetros"
    ),
    manuallyRevisedStudyUnitCount: nonnegativeInteger(
      source.manuallyRevisedStudyUnitCount,
      "As StudyUnits cuja última revisão é humana"
    ),
    studyUnitsByOrigin: uniqueRows(
      source.studyUnitsByOrigin,
      16,
      (entry) => entry.origin,
      "As mudanças de StudyUnit por origem",
      (entry) => {
        const row = exact(
          entry,
          ["origin", "createdCount", "lastRevisedCount"],
          "Uma origem de mudança"
        );
        return {
          origin: identifier(row.origin, "A origem da mudança"),
          createdCount: nonnegativeInteger(row.createdCount, "As Units criadas pela origem"),
          lastRevisedCount: nonnegativeInteger(
            row.lastRevisedCount,
            "As Units cuja última revisão tem esta origem"
          )
        };
      }
    )
  };
}

function nullableDeepLink(value) {
  if (value === null) return null;
  const normalized = text(value, 4096, "O destino de Analytics");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    fail("invalid_course_authoring_analytics", "O destino de Analytics é inválido.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail("invalid_course_authoring_analytics", "O destino de Analytics é inválido.");
  }
  return parsed.href;
}

export function normalizeCourseAuthoringAnalyticsPage(value, {
  expectedCourseId = null,
  expectedQuery = null
} = {}) {
  const source = exact(value, [
    "contract", "course", "scope", "design", "authorship", "missingData", "deepLink"
  ], "O snapshot de Analytics");
  if (source.contract !== COURSE_AUTHORING_ANALYTICS_CONTRACT) {
    fail("invalid_course_authoring_analytics", "O contrato de Analytics é desconhecido.");
  }
  const course = exact(source.course, ["id", "revision", "title"], "O Curso de Analytics");
  const normalizedCourse = {
    id: uuid(course.id, "A identidade do Curso"),
    revision: positiveInteger(course.revision, "A revisão do Curso"),
    title: text(course.title, 300, "O título do Curso")
  };
  if (expectedCourseId !== null && normalizedCourse.id !== uuid(expectedCourseId, "O Curso esperado")) {
    fail("course_authoring_analytics_mismatch", "A resposta pertence a outro Curso.");
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
      "Condições efetivas ausentes precisam permanecer indicadas em missingData."
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
  const query = new URLSearchParams({
    section: "research",
    analyticsScopeKind: snapshot.scope.selected.kind
  });
  if (snapshot.scope.selected.ref !== null) {
    query.set("analyticsScopeRef", snapshot.scope.selected.ref);
  }
  return normalizeCourseAuthoringAnalyticsPage({
    ...snapshot,
    deepLink: `${baseUrl}/#/authoring/courses/${encodeURIComponent(snapshot.course.id)}?${query}`
  }, { expectedCourseId: snapshot.course.id, expectedQuery });
}
