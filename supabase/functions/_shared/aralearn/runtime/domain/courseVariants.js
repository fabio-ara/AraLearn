const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();

export const COURSE_VARIANT_COMPARISON_CONTRACT = "aralearn.course-variant-comparison.v1";
export const COURSE_VARIANT_COMPARISON_LIST_CONTRACT = "aralearn.course-variant-comparison-list.v1";

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
    const parameterDifferences = entry.parameterDifferences.map(difference);
    const parameterTargets = new Set();
    for (const parameterDifference of parameterDifferences) {
      const target = `${parameterDifference.scopeKind}\u0000${parameterDifference.scopeId}\u0000${parameterDifference.parameterId}`;
      if (parameterTargets.has(target)) fail("invalid_course_variant", "Uma variante não pode declarar o mesmo parâmetro duas vezes.");
      parameterTargets.add(target);
    }
    if (entry.componentPolicyDifference !== null && (!entry.componentPolicyDifference || typeof entry.componentPolicyDifference !== "object" || Array.isArray(entry.componentPolicyDifference))) fail("invalid_course_variant", "A diferença de resources precisa ser um objeto.");
    return { label, title: text(entry.title, 300, "O título"), goal: text(entry.goal, 2000, "O objetivo"), parameterDifferences, componentPolicyDifference: entry.componentPolicyDifference === null ? null : json(entry.componentPolicyDifference, 8192, "A diferença de resources") };
  });
  if (!variants.some((entry) => entry.parameterDifferences.length || entry.componentPolicyDifference !== null)) fail("invalid_course_variant", "Declare ao menos uma diferença intencional.");
  return { type: value.type, comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"), expectedCourseRevision: value.expectedCourseRevision, variants };
}

export function normalizeCourseVariantRead(value) {
  exact(value, ["comparisonSetId", "expectedCourseRevision"], "A leitura de variantes");
  if (!Number.isSafeInteger(value.expectedCourseRevision) || value.expectedCourseRevision < 1) fail("invalid_course_variant", "A revisão esperada é inválida.");
  return { comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"), expectedCourseRevision: value.expectedCourseRevision };
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail("invalid_course_variant_comparison", `${label} é inválido.`);
  return value;
}
function nullableTimestamp(value, label) {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail("invalid_course_variant_comparison", `${label} é inválido.`);
  return value;
}
function comparisonMember(value) {
  exact(value, [
    "courseId", "label", "title", "goal", "attachedCourseRevision",
    "currentCourseRevision", "changedSinceAttached", "detachedAt",
    "parameterDifferences", "componentPolicyDifference", "materialization"
  ], "A variante comparável");
  if (!Number.isSafeInteger(value.attachedCourseRevision) || value.attachedCourseRevision < 1 ||
      !Number.isSafeInteger(value.currentCourseRevision) || value.currentCourseRevision < 1 ||
      typeof value.changedSinceAttached !== "boolean" ||
      !Array.isArray(value.parameterDifferences) ||
      value.parameterDifferences.length > 16 ||
      value.componentPolicyDifference !== null && (!value.componentPolicyDifference || typeof value.componentPolicyDifference !== "object" || Array.isArray(value.componentPolicyDifference))) fail("invalid_course_variant_comparison", "A variante comparável é inválida.");
  exact(value.materialization, ["partCount", "completedCount", "runningCount", "latestUpdatedAt"], "A materialização da variante");
  return {
    courseId: uuid(value.courseId, "A identidade do Curso"), label: text(value.label, 80, "O rótulo"),
    title: text(value.title, 300, "O título"), goal: text(value.goal, 2000, "O objetivo"),
    attachedCourseRevision: value.attachedCourseRevision,
    currentCourseRevision: value.currentCourseRevision,
    changedSinceAttached: value.changedSinceAttached,
    detachedAt: nullableTimestamp(value.detachedAt, "A data de desvinculação"),
    parameterDifferences: value.parameterDifferences.map(difference),
    componentPolicyDifference: value.componentPolicyDifference === null ? null : json(value.componentPolicyDifference, 8192, "A diferença de resources"),
    materialization: {
      partCount: nonnegativeInteger(value.materialization.partCount, "A contagem de Partes"),
      completedCount: nonnegativeInteger(value.materialization.completedCount, "A contagem materializada"),
      runningCount: nonnegativeInteger(value.materialization.runningCount, "A contagem em andamento"),
      latestUpdatedAt: nullableTimestamp(value.materialization.latestUpdatedAt, "A atualização de materialização")
    }
  };
}

export function normalizeCourseVariantComparison(value) {
  exact(value, ["contract", "comparisonSetId", "source", "members"], "A comparação de variantes");
  if (value.contract !== COURSE_VARIANT_COMPARISON_CONTRACT || !Array.isArray(value.members) || value.members.length < 1 || value.members.length > 8) fail("invalid_course_variant_comparison", "A comparação de variantes é inválida.");
  exact(value.source, [
    "courseId", "title", "goal", "currentCourseRevision",
    "checkpointCourseRevision", "changedSinceCheckpoint", "checkpointId", "checkpointHash"
  ], "A origem da comparação");
  if (!Number.isSafeInteger(value.source.currentCourseRevision) || value.source.currentCourseRevision < 1 ||
      !Number.isSafeInteger(value.source.checkpointCourseRevision) || value.source.checkpointCourseRevision < 1 ||
      typeof value.source.changedSinceCheckpoint !== "boolean" ||
      !isCourseVariantHash(value.source.checkpointHash)) fail("invalid_course_variant_comparison", "A origem da comparação é inválida.");
  return {
    contract: value.contract,
    comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"),
    source: {
      courseId: uuid(value.source.courseId, "A identidade do Curso de origem"),
      title: text(value.source.title, 300, "O título de origem"), goal: text(value.source.goal, 2000, "O objetivo de origem"),
      currentCourseRevision: value.source.currentCourseRevision,
      checkpointCourseRevision: value.source.checkpointCourseRevision,
      changedSinceCheckpoint: value.source.changedSinceCheckpoint,
      checkpointId: uuid(value.source.checkpointId, "A identidade do checkpoint"),
      checkpointHash: value.source.checkpointHash
    },
    members: value.members.map(comparisonMember)
  };
}

export function normalizeCourseVariantComparisonList(value) {
  exact(value, ["contract", "sourceCourseId", "sourceCourseRevision", "items"], "A lista de variantes");
  if (value.contract !== COURSE_VARIANT_COMPARISON_LIST_CONTRACT ||
      !Number.isSafeInteger(value.sourceCourseRevision) || value.sourceCourseRevision < 1 ||
      !Array.isArray(value.items)) fail("invalid_course_variant_comparison", "A lista de variantes é inválida.");
  return {
    contract: value.contract,
    sourceCourseId: uuid(value.sourceCourseId, "A identidade do Curso de origem"),
    sourceCourseRevision: value.sourceCourseRevision,
    items: value.items.map((item) => {
      exact(item, [
        "comparisonSetId", "checkpointId", "checkpointHash", "checkpointCourseRevision",
        "memberCount", "attachedCount", "detachedCount", "createdAt", "updatedAt"
      ], "O conjunto de variantes");
      if (!Number.isSafeInteger(item.checkpointCourseRevision) || item.checkpointCourseRevision < 1 ||
          !isCourseVariantHash(item.checkpointHash)) fail("invalid_course_variant_comparison", "O conjunto de variantes é inválido.");
      const memberCount = nonnegativeInteger(item.memberCount, "A contagem de variantes");
      const attachedCount = nonnegativeInteger(item.attachedCount, "A contagem vinculada");
      const detachedCount = nonnegativeInteger(item.detachedCount, "A contagem desvinculada");
      if (memberCount !== attachedCount + detachedCount || memberCount < 2 || memberCount > 8) {
        fail("invalid_course_variant_comparison", "A contagem do conjunto de variantes é inválida.");
      }
      return {
        comparisonSetId: uuid(item.comparisonSetId, "A identidade do conjunto"),
        checkpointId: uuid(item.checkpointId, "A identidade do checkpoint"),
        checkpointHash: item.checkpointHash,
        checkpointCourseRevision: item.checkpointCourseRevision,
        memberCount, attachedCount, detachedCount,
        createdAt: nullableTimestamp(item.createdAt, "A criação do conjunto"),
        updatedAt: nullableTimestamp(item.updatedAt, "A atualização do conjunto")
      };
    })
  };
}

export function normalizeCourseVariantChange(value) {
  object(value, "A mudança de variantes");
  if (value.contract !== "aralearn.course-variant-comparison-change.v1" ||
      typeof value.idempotent !== "boolean") fail("invalid_course_variant_change", "A mudança de variantes é inválida.");
  if (Object.hasOwn(value, "members")) {
    exact(value, ["contract", "comparisonSetId", "sourceCourseId", "sourceCourseRevision", "checkpointId", "checkpointHash", "members", "idempotent"], "A criação de variantes");
    if (!Number.isSafeInteger(value.sourceCourseRevision) || value.sourceCourseRevision < 1 || !Array.isArray(value.members) || value.members.length < 2 || value.members.length > 8 || !isCourseVariantHash(value.checkpointHash)) fail("invalid_course_variant_change", "A criação de variantes é inválida.");
    return {
      contract: value.contract, comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"),
      sourceCourseId: uuid(value.sourceCourseId, "A identidade do Curso de origem"),
      sourceCourseRevision: value.sourceCourseRevision, checkpointId: uuid(value.checkpointId, "A identidade do checkpoint"), checkpointHash: value.checkpointHash,
      members: value.members.map((member) => {
        exact(member, ["courseId", "label", "title", "goal", "revision"], "O Curso variante criado");
        if (!Number.isSafeInteger(member.revision) || member.revision < 1) fail("invalid_course_variant_change", "O Curso variante criado é inválido.");
        return { courseId: uuid(member.courseId, "A identidade do Curso variante"), label: text(member.label, 80, "O rótulo"), title: text(member.title, 300, "O título"), goal: text(member.goal, 2000, "O objetivo"), revision: member.revision };
      }), idempotent: value.idempotent
    };
  }
  exact(value, ["contract", "comparisonSetId", "sourceCourseId", "courseId", "detachedAt", "changed", "idempotent"], "A desvinculação de variante");
  if (typeof value.changed !== "boolean") fail("invalid_course_variant_change", "A desvinculação de variante é inválida.");
  return {
    contract: value.contract, comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"),
    sourceCourseId: uuid(value.sourceCourseId, "A identidade do Curso de origem"),
    courseId: uuid(value.courseId, "A identidade do Curso variante"),
    detachedAt: nullableTimestamp(value.detachedAt, "A data de desvinculação"), changed: value.changed, idempotent: value.idempotent
  };
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
