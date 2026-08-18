const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();

export const COURSE_VARIANT_COMPARISON_CONTRACT = "aralearn.course-variant-comparison.v1";

export class CourseVariantError extends Error {
  constructor(code, message) { super(message); this.name = "CourseVariantError"; this.code = code; }
}
function fail(code, message) { throw new CourseVariantError(code, message); }
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("invalid_course_variant", `${label} é inválido.`);
  return value;
}
function exact(value, fields, label) {
  object(value, label);
  const actual = Object.keys(value);
  if (actual.some((key) => !fields.includes(key)) || fields.some((key) => !Object.hasOwn(value, key))) fail("invalid_course_variant", `${label} não possui a forma esperada.`);
}
function uuid(value, label) { if (typeof value !== "string" || !UUID.test(value)) fail("invalid_course_variant", `${label} precisa ser UUID.`); return value.toLowerCase(); }
function hasInvalidTextControl(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || (code >= 127 && code <= 159);
  });
}
function text(value, maximum, label) {
  if (typeof value !== "string" || value !== value.trim() || !value || [...value].length > maximum || hasInvalidTextControl(value)) fail("invalid_course_variant", `${label} é inválido.`);
  return value;
}
function json(value, maximum, label) {
  try { structuredClone(value); } catch { fail("invalid_course_variant", `${label} precisa conter JSON.`); }
  if (encoder.encode(JSON.stringify(value)).byteLength > maximum) fail("course_variant_too_large", `${label} excede o limite.`);
  return value;
}
function difference(value) {
  exact(value, ["scopeKind", "scopeId", "parameterId", "value", "rationale"], "A diferença de parâmetro");
  if (!["course", "lesson", "didactic_microsequence"].includes(value.scopeKind) || !ID.test(value.scopeId) || !/^[a-z][a-z0-9_]{0,159}$/u.test(value.parameterId)) fail("invalid_course_variant_difference", "O alvo da diferença é inválido.");
  return { scopeKind: value.scopeKind, scopeId: value.scopeId, parameterId: value.parameterId, value: json(value.value, 4096, "O valor do parâmetro"), rationale: text(value.rationale, 1000, "A justificativa") };
}

export function normalizeCourseVariantCommand(value) {
  exact(value, ["type", "comparisonSetId", "expectedCourseRevision", "variants"], "O comando de variantes");
  if (value.type !== "create_comparison_variants") fail("invalid_course_variant_command", "O comando de variantes é desconhecido.");
  if (!Number.isSafeInteger(value.expectedCourseRevision) || value.expectedCourseRevision < 1) fail("invalid_course_variant", "A revisão esperada é inválida.");
  if (!Array.isArray(value.variants) || value.variants.length < 2 || value.variants.length > 8) fail("invalid_course_variant", "O conjunto precisa ter entre duas e oito variantes.");
  const labels = new Set();
  const variants = value.variants.map((entry) => {
    exact(entry, ["label", "title", "goal", "parameterDifferences", "componentPolicyDifference"], "A variante");
    const label = text(entry.label, 80, "O rótulo");
    if (labels.has(label)) fail("invalid_course_variant", "Os rótulos das variantes precisam ser distintos.");
    labels.add(label);
    if (!Array.isArray(entry.parameterDifferences) || entry.parameterDifferences.length > 16) fail("invalid_course_variant", "As diferenças de parâmetros excedem o limite.");
    return { label, title: text(entry.title, 300, "O título"), goal: text(entry.goal, 2000, "O objetivo"), parameterDifferences: entry.parameterDifferences.map(difference), componentPolicyDifference: entry.componentPolicyDifference === null ? null : json(entry.componentPolicyDifference, 8192, "A diferença de resources") };
  });
  if (!variants.some((entry) => entry.parameterDifferences.length || entry.componentPolicyDifference !== null)) fail("invalid_course_variant", "Declare ao menos uma diferença intencional.");
  return { type: value.type, comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"), expectedCourseRevision: value.expectedCourseRevision, variants };
}

export function normalizeCourseVariantRead(value) {
  exact(value, ["comparisonSetId", "expectedCourseRevision", "cursor", "limit"], "A leitura de variantes");
  if (!Number.isSafeInteger(value.expectedCourseRevision) || value.expectedCourseRevision < 1 || !Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 24) fail("invalid_course_variant", "A paginação é inválida.");
  if (value.cursor !== null && (typeof value.cursor !== "string" || value.cursor.length > 240)) fail("invalid_course_variant", "O cursor é inválido.");
  return { comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"), expectedCourseRevision: value.expectedCourseRevision, cursor: value.cursor, limit: value.limit };
}

export function normalizeCourseVariantDetachCommand(value) {
  exact(value, ["type", "comparisonSetId", "courseId"], "O comando de variantes");
  if (value.type !== "detach_comparison_variant") fail("invalid_course_variant_command", "O comando de variantes é desconhecido.");
  return {
    type: value.type,
    comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"),
    courseId: uuid(value.courseId, "A identidade do Curso")
  };
}

export function isCourseVariantHash(value) { return typeof value === "string" && SHA256.test(value); }
