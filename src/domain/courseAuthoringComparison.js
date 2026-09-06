import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "./courseDesignParameters.js";
import { normalizeCourseAuthoringAnalyticsPage, normalizeCourseAuthoringAnalyticsQuery } from "./courseAuthoringAnalytics.js";
import { CourseAuthoringBasisError, exactAuthoringObject, authoringText, authoringInteger, canonicalAuthoringValue, normalizeCourseAuthoringParameter, normalizeCourseAuthoringSource, observeCourseAuthoringDimensions } from "./courseAuthoringBasis.js";
import { flattenCourseDocument, composeCourseDocument } from "./courseEntities.js";

export const COURSE_AUTHORING_COMPARISON_CONTRACT = "aralearn.course-authoring-comparison.v1";
export const COURSE_AUTHORING_EXPORT_CONTRACT = "aralearn.course-authoring-export.v1";
export const COURSE_AUTHORING_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
export function serializeCourseAuthoringExport(value) {
  const content = JSON.stringify(value);
  if (new TextEncoder().encode(content).byteLength > COURSE_AUTHORING_EXPORT_MAX_BYTES) {
    throw new RangeError("A exportação excede o limite de 32 MiB.");
  }
  return content;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SEMANTIC_VERIFICATION = Object.freeze({ status: "not_performed", message: "A comparação confronta declarações, contagens e textos literais. Não verifica equivalência semântica, aprendizagem ou qualidade pedagógica." });
function fail(message) { throw new CourseAuthoringBasisError(message, "invalid_course_authoring_comparison"); }
export function normalizeCourseAuthoringSelection(value) {
  exactAuthoringObject(value, ["courseId", "expectedRevision", "scope"]);
  if (!UUID.test(value.courseId)) fail("O curso da comparação é inválido.");
  return { courseId: value.courseId.toLowerCase(), expectedRevision: authoringInteger(value.expectedRevision, 1), scope: normalizeCourseAuthoringAnalyticsQuery({ scope: value.scope }).scope };
}
export function normalizeCourseAuthoringComparisonRequest(value) {
  exactAuthoringObject(value, ["left", "right"]);
  return { left: normalizeCourseAuthoringSelection(value.left), right: normalizeCourseAuthoringSelection(value.right) };
}
function literalGroups(rows, valueOf, refOf) {
  const groups = new Map();
  for (const row of rows) {
    const value = valueOf(row); const key = canonicalAuthoringValue(value);
    if (!groups.has(key)) groups.set(key, { value, count: 0, refs: [] });
    const group = groups.get(key); group.count += 1; group.refs.push(refOf(row));
  }
  return groups;
}
function difference(left, right, valueOf, refOf) {
  const leftGroups = literalGroups(left, valueOf, refOf); const rightGroups = literalGroups(right, valueOf, refOf);
  const subtract = (a, b) => [...a].flatMap(([key, value]) => {
    const count = value.count - (b.get(key)?.count || 0);
    return count > 0 ? [{ value: value.value, count, refs: value.refs.slice(-count) }] : [];
  });
  const onlyLeft = subtract(leftGroups, rightGroups); const onlyRight = subtract(rightGroups, leftGroups);
  return { equal: !onlyLeft.length && !onlyRight.length, leftCount: left.length, rightCount: right.length, onlyLeft, onlyRight };
}
function sourceMeaning(source) {
  return { document: source.document, attachments: [...source.attachments].sort((a, b) => a.contentHash.localeCompare(b.contentHash)), anchors: source.anchors.map(({ contentHash, selector, humanLocator }) => ({ contentHash, selector, humanLocator })).sort((a, b) => canonicalAuthoringValue(a).localeCompare(canonicalAuthoringValue(b))) };
}
function itemMeaning({ statement, description }) { return { statement, description }; }
function parameterValues(page, parameterId, requested) {
  const groups = new Map(); let missingCount = 0;
  for (const unit of page.basis.studyUnits) {
    const parameter = unit[requested ? "requestedParameters" : "appliedParameters"]?.find((entry) => entry.parameterId === parameterId);
    if (!parameter) { missingCount += 1; continue; }
    const value = Object.fromEntries(Object.entries(parameter).filter(([key]) => key !== "parameterId"));
    const key = canonicalAuthoringValue(value);
    if (!groups.has(key)) groups.set(key, { ...value, studyUnitRefs: [] });
    groups.get(key).studyUnitRefs.push(unit.studyUnitRef);
  }
  return { values: [...groups.values()], missingCount };
}
function parameterMultiplicity(side) {
  // Scope references identify navigation targets, not the semantic value of a copied assignment.
  return side.values.flatMap(({ studyUnitRefs, sourceScope, ...value }) => Array.from({ length: studyUnitRefs.length }, () => canonicalAuthoringValue({ ...value, sourceScopeKind: sourceScope?.kind ?? null }))).sort();
}
function compareParameters(left, right, requested) {
  return COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ id, label }) => {
    const leftValue = parameterValues(left, id, requested); const rightValue = parameterValues(right, id, requested);
    return { parameterId: id, label, left: leftValue, right: rightValue, equal: leftValue.missingCount === rightValue.missingCount && canonicalAuthoringValue(parameterMultiplicity(leftValue)) === canonicalAuthoringValue(parameterMultiplicity(rightValue)) };
  });
}
function side(page) { return { course: page.course, scope: page.scope.selected, deepLink: page.deepLink }; }
function dimensionSide(value) { const { value: total, denominator, missingCount, notApplicableCount, distribution } = value; return { value: total, denominator, missingCount, notApplicableCount, distribution }; }
export function buildCourseAuthoringComparison({ left, right }) {
  left = normalizeCourseAuthoringAnalyticsPage(left); right = normalizeCourseAuthoringAnalyticsPage(right);
  if (left.course.id === right.course.id && left.course.revision !== right.course.revision) fail("Um curso não pode ser comparado em edições misturadas.");
  return {
    contract: COURSE_AUTHORING_COMPARISON_CONTRACT, left: side(left), right: side(right),
    dimensions: left.dimensions.map((dimension, index) => ({ id: dimension.id, label: dimension.label, definition: dimension.definition, unit: dimension.unit, basis: dimension.basis, left: dimensionSide(dimension), right: dimensionSide(right.dimensions[index]), delta: dimension.value === null || right.dimensions[index].value === null ? null : right.dimensions[index].value - dimension.value })),
    inventory: { scope: "course", analysisUnits: difference(left.basis.analysisUnits, right.basis.analysisUnits, itemMeaning, (entry) => entry.ref), evidenceRequirements: difference(left.basis.evidenceRequirements, right.basis.evidenceRequirements, itemMeaning, (entry) => entry.ref), sources: difference(left.basis.sources, right.basis.sources, sourceMeaning, (entry) => entry.sourceRef) },
    requestedParameters: compareParameters(left, right, true), appliedParameters: compareParameters(left, right, false), semanticVerification: { ...SEMANTIC_VERIFICATION }
  };
}
function normalizeSide(value, expected) {
  exactAuthoringObject(value, ["course", "scope", "deepLink"]); exactAuthoringObject(value.course, ["id", "revision", "title"]); exactAuthoringObject(value.scope, ["kind", "ref", "label"]);
  const selection = normalizeCourseAuthoringSelection({ courseId: value.course.id, expectedRevision: value.course.revision, scope: { kind: value.scope.kind, ref: value.scope.ref } });
  if (expected && canonicalAuthoringValue(selection) !== canonicalAuthoringValue(normalizeCourseAuthoringSelection(expected))) fail("A comparação pertence a outro curso, edição ou escopo.");
  authoringText(value.course.title, 300); authoringText(value.scope.label, 300);
  if (value.deepLink !== null) { const url = new URL(value.deepLink); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) fail("O destino da comparação é inválido."); }
  return structuredClone(value);
}
export function normalizeCourseAuthoringComparison(value, { expectedRequest = null } = {}) {
  exactAuthoringObject(value, ["contract", "left", "right", "dimensions", "inventory", "requestedParameters", "appliedParameters", "semanticVerification"]);
  if (value.contract !== COURSE_AUTHORING_COMPARISON_CONTRACT || canonicalAuthoringValue(value.semanticVerification) !== canonicalAuthoringValue(SEMANTIC_VERIFICATION)) fail("O contrato da comparação é inválido.");
  normalizeSide(value.left, expectedRequest?.left); normalizeSide(value.right, expectedRequest?.right);
  if (value.left.course.id === value.right.course.id && value.left.course.revision !== value.right.course.revision) fail("A comparação mistura edições do mesmo curso.");
  if (!Array.isArray(value.dimensions) || value.dimensions.length !== 9 || new Set(value.dimensions.map(({ id }) => id)).size !== 9) fail("As dimensões da comparação são inválidas.");
  for (const dimension of value.dimensions) {
    exactAuthoringObject(dimension, ["id", "label", "definition", "unit", "basis", "left", "right", "delta"]);
    for (const name of ["id", "label", "definition", "unit", "basis"]) authoringText(dimension[name], 1000);
    const definition = observeCourseAuthoringDimensions({ studyUnits: [] }).find(({ id }) => id === dimension.id);
    if (!definition || ["label", "definition", "unit", "basis"].some((key) => dimension[key] !== definition[key])) fail("A definição da dimensão não pertence ao cálculo compartilhado.");
    for (const sideValue of [dimension.left, dimension.right]) {
      exactAuthoringObject(sideValue, ["value", "denominator", "missingCount", "notApplicableCount", "distribution"]);
      if (sideValue.value !== null) authoringInteger(sideValue.value);
      for (const field of ["denominator", "missingCount", "notApplicableCount"]) authoringInteger(sideValue[field]);
      if (!Array.isArray(sideValue.distribution)) fail("A distribuição da comparação é inválida.");
      const references = [];
      for (const group of sideValue.distribution) {
        exactAuthoringObject(group, ["value", "label", "count", "studyUnitRefs"]); authoringText(group.label, 300); authoringInteger(group.count, 1);
        if (!(typeof group.value === "string" || Number.isSafeInteger(group.value)) || !Array.isArray(group.studyUnitRefs) || group.studyUnitRefs.length !== group.count) fail("A distribuição não corresponde às referências.");
        references.push(...group.studyUnitRefs.map((ref) => authoringText(ref)));
      }
      if (references.length !== sideValue.denominator || new Set(references).size !== references.length) fail("A distribuição repete ou omite unidades de estudo.");
      if (dimension.id === "practice_position") {
        if (sideValue.value !== null || sideValue.distribution.some((entry) => !["expository", "practice", "mixed"].includes(entry.value))) fail("A posição da prática é uma declaração categórica.");
      } else if (sideValue.distribution.some((entry) => !Number.isSafeInteger(entry.value) || entry.value < 0) || sideValue.value !== (sideValue.denominator ? sideValue.distribution.reduce((sum, entry) => sum + entry.value * entry.count, 0) : null)) fail("O total não corresponde à distribuição.");
    }
    if (dimension.delta !== (dimension.left.value === null || dimension.right.value === null ? null : dimension.right.value - dimension.left.value)) fail("A diferença não corresponde às contagens.");
  }
  exactAuthoringObject(value.inventory, ["scope", "analysisUnits", "evidenceRequirements", "sources"]);
  if (value.inventory.scope !== "course") fail("O inventário precisa abranger os cursos completos.");
  for (const name of ["analysisUnits", "evidenceRequirements", "sources"]) {
    const result = value.inventory[name]; exactAuthoringObject(result, ["equal", "leftCount", "rightCount", "onlyLeft", "onlyRight"]);
    authoringInteger(result.leftCount); authoringInteger(result.rightCount);
    for (const list of [result.onlyLeft, result.onlyRight]) {
      if (!Array.isArray(list)) fail("A diferença de inventários é inválida.");
      for (const entry of list) {
        exactAuthoringObject(entry, ["value", "count", "refs"]); authoringInteger(entry.count, 1); if (!Array.isArray(entry.refs) || entry.refs.length !== entry.count) fail("A diferença de inventários perdeu as referências."); entry.refs.forEach((ref) => authoringText(ref, 240));
        if (name !== "sources") { exactAuthoringObject(entry.value, ["statement", "description"]); authoringText(entry.value.statement, 20000); if (entry.value.description !== "") authoringText(entry.value.description, 20000); }
        else {
          exactAuthoringObject(entry.value, ["document", "attachments", "anchors"]);
          if (!Array.isArray(entry.value.anchors)) fail("As Âncoras comparadas são inválidas.");
          entry.value.anchors.forEach((anchor) => exactAuthoringObject(anchor, ["contentHash", "selector", "humanLocator"]));
          normalizeCourseAuthoringSource({ sourceRef: entry.refs[0], revision: 1, document: entry.value.document, attachments: entry.value.attachments, anchors: entry.value.anchors.map((anchor, index) => ({ ...anchor, anchorRef: `anchor-${index + 1}` })) });
        }
      }
    }
    if (result.equal !== (!result.onlyLeft.length && !result.onlyRight.length) || result.leftCount - result.rightCount !== result.onlyLeft.reduce((n, entry) => n + entry.count, 0) - result.onlyRight.reduce((n, entry) => n + entry.count, 0)) fail("A multiplicidade do inventário é incoerente.");
  }
  for (const field of ["requestedParameters", "appliedParameters"]) {
    if (!Array.isArray(value[field]) || value[field].length !== COURSE_DESIGN_PARAMETER_DEFINITIONS.length) fail("O catálogo da comparação está incompleto.");
    value[field].forEach((entry, index) => {
      exactAuthoringObject(entry, ["parameterId", "label", "left", "right", "equal"]);
      if (entry.parameterId !== COURSE_DESIGN_PARAMETER_DEFINITIONS[index].id || entry.label !== COURSE_DESIGN_PARAMETER_DEFINITIONS[index].label) fail("O catálogo da comparação é inválido.");
      for (const sideValue of [entry.left, entry.right]) {
        exactAuthoringObject(sideValue, ["values", "missingCount"]); authoringInteger(sideValue.missingCount); if (!Array.isArray(sideValue.values)) fail("A distribuição de parâmetros é inválida.");
        const refs = [];
        for (const group of sideValue.values) {
          if (!Array.isArray(group.studyUnitRefs) || !group.studyUnitRefs.length) fail("A configuração comparada perdeu suas unidades.");
          const { studyUnitRefs, ...parameter } = group;
          normalizeCourseAuthoringParameter({ ...parameter, parameterId: entry.parameterId }, { requested: field === "requestedParameters" });
          refs.push(...studyUnitRefs.map((ref) => authoringText(ref)));
        }
        if (new Set(refs).size !== refs.length) fail("A distribuição de parâmetros repete unidades.");
      }
      if (entry.equal !== (entry.left.missingCount === entry.right.missingCount && canonicalAuthoringValue(parameterMultiplicity(entry.left)) === canonicalAuthoringValue(parameterMultiplicity(entry.right)))) fail("A comparação de parâmetros é incoerente.");
    });
  }
  return structuredClone(value);
}
export function assembleCourseAuthoringExport({ analytics, document }) {
  analytics = normalizeCourseAuthoringAnalyticsPage(analytics);
  const flattened = flattenCourseDocument(document);
  if (flattened.course.id !== analytics.course.id || flattened.course.title !== analytics.course.title) fail("O artefato exportado pertence a outro curso.");
  const normalizedDocument = composeCourseDocument(flattened.course, flattened.rows);
  // Export retains only the aggregate editorial reading and course content; there are no actor records or temporary download URLs.
  return { contract: COURSE_AUTHORING_EXPORT_CONTRACT, course: analytics.course, scope: analytics.scope.selected, analytics, artifact: { document: normalizedDocument } };
}
export function normalizeCourseAuthoringExport(value, { expectedSelection = null } = {}) {
  exactAuthoringObject(value, ["contract", "course", "scope", "analytics", "artifact"]); exactAuthoringObject(value.artifact, ["document"]);
  if (value.contract !== COURSE_AUTHORING_EXPORT_CONTRACT) fail("O contrato da exportação é inválido.");
  normalizeSide({ course: value.course, scope: value.scope, deepLink: null }, expectedSelection);
  const result = assembleCourseAuthoringExport({ analytics: value.analytics, document: value.artifact.document });
  if (canonicalAuthoringValue(result.course) !== canonicalAuthoringValue(value.course) || canonicalAuthoringValue(result.scope) !== canonicalAuthoringValue(value.scope)) fail("A exportação mistura cursos, edições ou escopos.");
  return result;
}
