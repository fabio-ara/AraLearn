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
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail("invalid_course_variant_comparison", `${label} é inválido.`);
  return value;
}
function nullableUuid(value, label) { return value === null ? null : uuid(value, label); }
function nullableText(value, maximum, label) { return value === null ? null : text(value, maximum, label); }
function sourceScope(value) {
  if (value === null) return null;
  exact(value, ["kind", "ref"], "A origem do valor efetivo");
  if (!["course", "lesson", "didactic_microsequence"].includes(value.kind)) fail("invalid_course_variant_comparison", "A origem do valor efetivo é inválida.");
  return { kind: value.kind, ref: text(value.ref, 240, "A referência de origem") };
}
function effectiveParameter(value) {
  exact(value, ["scopeKind", "scopeId", "parameterId", "value", "origin", "sourceScope"], "O parâmetro efetivo");
  if (!["course", "lesson", "didactic_microsequence"].includes(value.scopeKind) ||
      !ID.test(value.scopeId) || !/^[a-z][a-z0-9_]{0,159}$/u.test(value.parameterId)) fail("invalid_course_variant_comparison", "O parâmetro efetivo é inválido.");
  return {
    scopeKind: value.scopeKind, scopeId: value.scopeId, parameterId: value.parameterId,
    value: json(value.value, 4096, "O valor efetivo"),
    origin: text(value.origin, 80, "A origem do parâmetro"),
    sourceScope: sourceScope(value.sourceScope)
  };
}
function effectiveComponentPolicy(value) {
  exact(value, ["scopeKind", "scopeId", "policy", "origin", "sourceScope"], "A política efetiva");
  if (!["course", "lesson", "didactic_microsequence"].includes(value.scopeKind) || !ID.test(value.scopeId)) {
    fail("invalid_course_variant_comparison", "A política efetiva é inválida.");
  }
  return {
    scopeKind: value.scopeKind,
    scopeId: value.scopeId,
    policy: json(value.policy, 8192, "A política efetiva"),
    origin: text(value.origin, 80, "A origem da política"),
    sourceScope: sourceScope(value.sourceScope)
  };
}
function part(value) {
  exact(value, [
    "partId", "position", "title", "intent", "version", "status",
    "materializationId", "materializationVersion", "updatedAt", "studyUnitCount"
  ], "A Parte comparada");
  if (!Number.isSafeInteger(value.position) || value.position < 0 || value.position > 63 ||
      !["not_started", "running", "completed", "failed"].includes(value.status) ||
      (value.status === "not_started") !== (value.materializationId === null) ||
      (value.materializationId === null) !== (value.materializationVersion === null) ||
      value.materializationVersion !== null && (!Number.isSafeInteger(value.materializationVersion) || value.materializationVersion < 1)) {
    fail("invalid_course_variant_comparison", "A Parte comparada é inválida.");
  }
  return {
    partId: uuid(value.partId, "A identidade da Parte"), position: value.position,
    title: text(value.title, 300, "O título da Parte"),
    intent: typeof value.intent === "string" && value.intent.length <= 4000 && !hasInvalidTextControl(value.intent)
      ? value.intent : fail("invalid_course_variant_comparison", "A intenção da Parte é inválida."),
    version: positiveInteger(value.version, "A versão da Parte"), status: value.status,
    materializationId: nullableUuid(value.materializationId, "A identidade da materialização"),
    materializationVersion: value.materializationVersion,
    updatedAt: nullableTimestamp(value.updatedAt, "A atualização da materialização"),
    studyUnitCount: nonnegativeInteger(value.studyUnitCount, "A contagem de Unidades da Parte")
  };
}
function studyUnit(value) {
  exact(value, ["studyUnitId", "parentMicrosequenceId", "position", "title", "version", "componentRefs"], "A Unidade comparada");
  if (!ID.test(value.studyUnitId) || !ID.test(value.parentMicrosequenceId) ||
      !Number.isSafeInteger(value.position) || value.position < 1 || !Array.isArray(value.componentRefs) || value.componentRefs.length > 64) {
    fail("invalid_course_variant_comparison", "A Unidade comparada é inválida.");
  }
  const componentRefs = value.componentRefs.map((reference) => text(reference, 240, "A referência de componente"));
  if (new Set(componentRefs).size !== componentRefs.length) fail("invalid_course_variant_comparison", "As referências de componente precisam ser distintas.");
  return {
    studyUnitId: value.studyUnitId, parentMicrosequenceId: value.parentMicrosequenceId,
    position: value.position, title: text(value.title, 300, "O título da Unidade"),
    version: positiveInteger(value.version, "A versão da Unidade"), componentRefs
  };
}
function references(value) {
  exact(value, ["sourceCount", "anchorCount", "pdfCount", "sharedPdfCount", "fingerprint"], "As referências da variante");
  const result = {
    sourceCount: nonnegativeInteger(value.sourceCount, "A contagem de Fontes"),
    anchorCount: nonnegativeInteger(value.anchorCount, "A contagem de Âncoras"),
    pdfCount: nonnegativeInteger(value.pdfCount, "A contagem de PDFs"),
    sharedPdfCount: nonnegativeInteger(value.sharedPdfCount, "A contagem de PDFs compartilhados"),
    fingerprint: isCourseVariantHash(value.fingerprint) ? value.fingerprint : fail("invalid_course_variant_comparison", "A impressão das Fontes é inválida.")
  };
  if (result.sharedPdfCount > result.pdfCount) fail("invalid_course_variant_comparison", "A contagem de PDFs compartilhados é inválida.");
  return result;
}
function materialization(value) {
  exact(value, [
    "plannedPartCount", "notStartedPartCount", "runningPartCount", "completedPartCount",
    "failedPartCount", "studyUnitCount", "latestUpdatedAt", "partFingerprint",
    "studyUnitFingerprint", "parts", "studyUnits", "truncated"
  ], "A materialização da variante");
  const result = {
    plannedPartCount: nonnegativeInteger(value.plannedPartCount, "A contagem de Partes planejadas"),
    notStartedPartCount: nonnegativeInteger(value.notStartedPartCount, "A contagem de Partes não iniciadas"),
    runningPartCount: nonnegativeInteger(value.runningPartCount, "A contagem em andamento"),
    completedPartCount: nonnegativeInteger(value.completedPartCount, "A contagem concluída"),
    failedPartCount: nonnegativeInteger(value.failedPartCount, "A contagem com falha"),
    studyUnitCount: nonnegativeInteger(value.studyUnitCount, "A contagem de Unidades"),
    latestUpdatedAt: nullableTimestamp(value.latestUpdatedAt, "A atualização de materialização"),
    partFingerprint: isCourseVariantHash(value.partFingerprint) ? value.partFingerprint : fail("invalid_course_variant_comparison", "A impressão das Partes é inválida."),
    studyUnitFingerprint: isCourseVariantHash(value.studyUnitFingerprint) ? value.studyUnitFingerprint : fail("invalid_course_variant_comparison", "A impressão das Unidades é inválida."),
    parts: Array.isArray(value.parts) && value.parts.length <= 64 ? value.parts.map(part) : fail("invalid_course_variant_comparison", "As Partes comparadas são inválidas."),
    studyUnits: Array.isArray(value.studyUnits) && value.studyUnits.length <= 64 ? value.studyUnits.map(studyUnit) : fail("invalid_course_variant_comparison", "As Unidades comparadas são inválidas."),
    truncated: (() => {
      exact(value.truncated, ["parts", "studyUnits"], "Os limites da comparação");
      if (typeof value.truncated.parts !== "boolean" || typeof value.truncated.studyUnits !== "boolean") fail("invalid_course_variant_comparison", "Os limites da comparação são inválidos.");
      return { parts: value.truncated.parts, studyUnits: value.truncated.studyUnits };
    })()
  };
  if (result.plannedPartCount !== result.notStartedPartCount + result.runningPartCount + result.completedPartCount + result.failedPartCount ||
      result.parts.length > result.plannedPartCount || result.studyUnits.length > result.studyUnitCount ||
      result.truncated.parts !== (result.parts.length < result.plannedPartCount) ||
      result.truncated.studyUnits !== (result.studyUnits.length < result.studyUnitCount)) {
    fail("invalid_course_variant_comparison", "As contagens de materialização são incoerentes.");
  }
  return result;
}
function comparisonMember(value) {
  exact(value, [
    "courseId", "position", "label", "title", "goal", "attachedCourseRevision",
    "currentCourseRevision", "changedSinceAttached",
    "parameterDifferences", "componentPolicyDifference", "effectiveParameters",
    "effectiveComponentPolicies", "componentsUsed", "references", "materialization"
  ], "A variante comparável");
  if (!Number.isSafeInteger(value.position) || value.position < 0 || value.position > 7 ||
      !Number.isSafeInteger(value.attachedCourseRevision) || value.attachedCourseRevision < 1 ||
      !Number.isSafeInteger(value.currentCourseRevision) || value.currentCourseRevision < 1 ||
      typeof value.changedSinceAttached !== "boolean" ||
      !Array.isArray(value.parameterDifferences) ||
      value.parameterDifferences.length > 16 ||
      value.componentPolicyDifference !== null && (!value.componentPolicyDifference || typeof value.componentPolicyDifference !== "object" || Array.isArray(value.componentPolicyDifference))) fail("invalid_course_variant_comparison", "A variante comparável é inválida.");
  if (!Array.isArray(value.effectiveParameters) || value.effectiveParameters.length > 1024 ||
      !Array.isArray(value.effectiveComponentPolicies) || value.effectiveComponentPolicies.length > 256 ||
      !Array.isArray(value.componentsUsed) || value.componentsUsed.length > 64) fail("invalid_course_variant_comparison", "Os fatos efetivos da variante são inválidos.");
  const effectiveParameters = value.effectiveParameters.map(effectiveParameter);
  const parameterKeys = effectiveParameters.map((entry) => `${entry.scopeKind}\u0000${entry.scopeId}\u0000${entry.parameterId}`);
  if (new Set(parameterKeys).size !== parameterKeys.length) fail("invalid_course_variant_comparison", "Os parâmetros efetivos precisam ser distintos.");
  const effectiveComponentPolicies = value.effectiveComponentPolicies.map(effectiveComponentPolicy);
  const policyKeys = effectiveComponentPolicies.map((entry) => `${entry.scopeKind}\u0000${entry.scopeId}`);
  if (new Set(policyKeys).size !== policyKeys.length ||
      !effectiveComponentPolicies.some((entry) => entry.scopeKind === "course" && entry.scopeId === "course")) {
    fail("invalid_course_variant_comparison", "As políticas efetivas precisam ser distintas e conter a política do Curso.");
  }
  const componentsUsed = value.componentsUsed.map((reference) => text(reference, 240, "O componente usado"));
  if (new Set(componentsUsed).size !== componentsUsed.length) fail("invalid_course_variant_comparison", "Os componentes usados precisam ser distintos.");
  return {
    courseId: uuid(value.courseId, "A identidade do Curso"), position: value.position,
    label: text(value.label, 80, "O rótulo"),
    title: text(value.title, 300, "O título"), goal: text(value.goal, 2000, "O objetivo"),
    attachedCourseRevision: value.attachedCourseRevision,
    currentCourseRevision: value.currentCourseRevision,
    changedSinceAttached: value.changedSinceAttached,
    parameterDifferences: value.parameterDifferences.map(difference),
    componentPolicyDifference: value.componentPolicyDifference === null ? null : json(value.componentPolicyDifference, 8192, "A diferença de resources"),
    effectiveParameters,
    effectiveComponentPolicies,
    componentsUsed, references: references(value.references),
    materialization: materialization(value.materialization)
  };
}

const COMPARISON_KINDS = new Set([
  "parameter", "component_policy", "course_revision", "parts", "study_units",
  "components", "source_references", "materialization"
]);
function comparisonDifference(value) {
  exact(value, [
    "courseId", "referenceCourseId", "kind", "scopeKind", "scopeId", "key",
    "expectedValue", "actualValue", "explanation"
  ], "A diferença observada");
  if (!COMPARISON_KINDS.has(value.kind) ||
      value.scopeKind !== null && !["course", "lesson", "didactic_microsequence"].includes(value.scopeKind) ||
      (value.scopeKind === null) !== (value.scopeId === null)) fail("invalid_course_variant_comparison", "A diferença observada é inválida.");
  return {
    courseId: uuid(value.courseId, "O Curso da diferença"),
    referenceCourseId: nullableUuid(value.referenceCourseId, "O Curso de referência"),
    kind: value.kind,
    scopeKind: value.scopeKind,
    scopeId: nullableText(value.scopeId, 240, "O escopo da diferença"),
    key: text(value.key, 160, "A chave da diferença"),
    expectedValue: json(value.expectedValue, 16384, "O valor esperado"),
    actualValue: json(value.actualValue, 16384, "O valor observado"),
    explanation: text(value.explanation, 1000, "A explicação da diferença")
  };
}
function comparisonDifferences(value, validCourseIds) {
  exact(value, ["referenceCourseId", "declared", "observedExpected", "accidentalDeviations", "factual", "missingData"], "As diferenças da comparação");
  const referenceCourseId = uuid(value.referenceCourseId, "O Curso de referência");
  if (!validCourseIds.has(referenceCourseId)) fail("invalid_course_variant_comparison", "O Curso de referência não pertence à comparação.");
  const result = { referenceCourseId };
  for (const field of ["declared", "observedExpected", "accidentalDeviations", "factual", "missingData"]) {
    if (!Array.isArray(value[field]) || value[field].length > 256) fail("invalid_course_variant_comparison", "As diferenças da comparação excedem o limite.");
    result[field] = value[field].map(comparisonDifference);
    if (result[field].some((entry) => !validCourseIds.has(entry.courseId) || entry.referenceCourseId !== null && !validCourseIds.has(entry.referenceCourseId))) {
      fail("invalid_course_variant_comparison", "Uma diferença referencia Curso externo à comparação.");
    }
  }
  return result;
}

export function normalizeCourseVariantComparison(value) {
  exact(value, ["contract", "comparisonSetId", "planning", "source", "members", "differences"], "A comparação de variantes");
  if (value.contract !== COURSE_VARIANT_COMPARISON_CONTRACT || !Array.isArray(value.members) || value.members.length < 2 || value.members.length > 8) fail("invalid_course_variant_comparison", "A comparação de variantes é inválida.");
  exact(value.source, [
    "courseId", "title", "goal", "currentCourseRevision",
    "checkpointCourseRevision", "changedSinceCheckpoint", "checkpointId", "checkpointHash"
  ], "A origem da comparação");
  if (!Number.isSafeInteger(value.source.currentCourseRevision) || value.source.currentCourseRevision < 1 ||
      !Number.isSafeInteger(value.source.checkpointCourseRevision) || value.source.checkpointCourseRevision < 1 ||
      typeof value.source.changedSinceCheckpoint !== "boolean" ||
      !isCourseVariantHash(value.source.checkpointHash)) fail("invalid_course_variant_comparison", "A origem da comparação é inválida.");
  exact(value.planning, ["checkpointId", "checkpointHash", "courseRevision", "planVersion", "snapshot"], "O planejamento comum");
  if (!isCourseVariantHash(value.planning.checkpointHash) ||
      !Number.isSafeInteger(value.planning.courseRevision) || value.planning.courseRevision < 1 ||
      !Number.isSafeInteger(value.planning.planVersion) || value.planning.planVersion < 1 ||
      !value.planning.snapshot || typeof value.planning.snapshot !== "object" || Array.isArray(value.planning.snapshot)) {
    fail("invalid_course_variant_comparison", "O planejamento comum é inválido.");
  }
  const planning = {
    checkpointId: uuid(value.planning.checkpointId, "A identidade do checkpoint"),
    checkpointHash: value.planning.checkpointHash,
    courseRevision: value.planning.courseRevision,
    planVersion: value.planning.planVersion,
    snapshot: json(value.planning.snapshot, 65536, "O planejamento comum")
  };
  const members = value.members.map(comparisonMember);
  if (members.some((member, index) => member.position !== index)) {
    fail("invalid_course_variant_comparison", "A ordem das variantes comparáveis é inválida.");
  }
  const sourceCourseId = uuid(value.source.courseId, "A identidade do Curso de origem");
  const sourceCheckpointId = uuid(value.source.checkpointId, "A identidade do checkpoint");
  if (planning.checkpointId !== sourceCheckpointId ||
      planning.checkpointHash !== value.source.checkpointHash ||
      planning.courseRevision !== value.source.checkpointCourseRevision) fail("invalid_course_variant_comparison", "O checkpoint da comparação é incoerente.");
  const validCourseIds = new Set([sourceCourseId, ...members.map((member) => member.courseId)]);
  const differences = comparisonDifferences(value.differences, validCourseIds);
  if (differences.referenceCourseId !== members[0].courseId) {
    fail("invalid_course_variant_comparison", "O Curso de referência não é a primeira variante criada.");
  }
  return {
    contract: value.contract,
    comparisonSetId: uuid(value.comparisonSetId, "A identidade do conjunto"),
    planning,
    source: {
      courseId: sourceCourseId,
      title: text(value.source.title, 300, "O título de origem"), goal: text(value.source.goal, 2000, "O objetivo de origem"),
      currentCourseRevision: value.source.currentCourseRevision,
      checkpointCourseRevision: value.source.checkpointCourseRevision,
      changedSinceCheckpoint: value.source.changedSinceCheckpoint,
      checkpointId: sourceCheckpointId,
      checkpointHash: value.source.checkpointHash
    },
    members,
    differences
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
      members: value.members.map((member, index) => {
        exact(member, ["courseId", "position", "label", "title", "goal", "revision"], "O Curso variante criado");
        if (member.position !== index || !Number.isSafeInteger(member.revision) || member.revision < 1) fail("invalid_course_variant_change", "O Curso variante criado é inválido.");
        return { courseId: uuid(member.courseId, "A identidade do Curso variante"), position: member.position, label: text(member.label, 80, "O rótulo"), title: text(member.title, 300, "O título"), goal: text(member.goal, 2000, "O objetivo"), revision: member.revision };
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
