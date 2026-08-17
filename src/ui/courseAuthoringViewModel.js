import { isCanonicalCourseId } from "./courseAuthoringRoute.js";

const OWNERSHIP_VALUES = new Set(["owned"]);
const AUTHORING_PLAN_ORIGINS = new Set(["automatic", "author", "research_condition"]);
const PART_PROGRESS_STATES = new Set([
  "planned", "materializing", "attention_required", "partially_materialized", "materialized"
]);
const MATERIALIZATION_STATUSES = new Set(["running", "completed", "failed"]);
const AUTHORING_ACTIVITY_KINDS = new Set([
  "plan_changed", "materialization_started", "materialization_step_recorded",
  "materialization_finished"
]);
const POSITIVE_BIGINT_DECIMAL = /^[1-9][0-9]{0,18}$/u;
const MAX_BIGINT_DECIMAL = "9223372036854775807";
export class CourseAuthoringProjectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CourseAuthoringProjectionError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new CourseAuthoringProjectionError(code, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function naturalNumber(value, { minimum = 0 } = {}) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

function revision(value) {
  const parsed = naturalNumber(value, { minimum: 1 });
  if (parsed === null) fail("invalid_course_projection", "A versão do Curso é inválida.");
  return parsed;
}

function cloneJson(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail("invalid_course_projection", `${label} precisa conter somente dados JSON.`);
  }
}

function cursorValue(value, { required = false } = {}) {
  if (value == null) {
    if (required) fail("invalid_course_cursor", "A página seguinte não informou cursor.");
    return null;
  }
  if ((!isPlainObject(value) && typeof value !== "string") ||
      (typeof value === "string" && !value.trim())) {
    fail("invalid_course_cursor", "O cursor da página é inválido.");
  }
  const cloned = cloneJson(value, "O cursor");
  return isPlainObject(cloned) ? Object.freeze(cloned) : cloned;
}

function pageState(value) {
  const hasMore = value?.hasMore === true;
  return Object.freeze({
    hasMore,
    nextCursor: hasMore ? cursorValue(value?.nextCursor, { required: true }) : null
  });
}

function ownership(value) {
  const normalized = text(value);
  if (!normalized) return null;
  if (normalized === "shared") {
    fail("course_not_owned", "Somente Cursos próprios pertencem à Autoria.");
  }
  if (!OWNERSHIP_VALUES.has(normalized)) {
    fail("invalid_course_projection", "O tipo de acesso ao Curso é inválido.");
  }
  return normalized;
}

function editCapability(value, normalizedOwnership) {
  if (!normalizedOwnership) return null;
  const expected = normalizedOwnership === "owned";
  if (typeof value === "boolean" && value !== expected) {
    fail("invalid_course_projection", "A propriedade e a edição do Curso são inconsistentes.");
  }
  return expected;
}

function courseCounts(value) {
  if (!isPlainObject(value)) return null;
  const fields = [
    "moduleCount",
    "lessonCount",
    "topicCount",
    "microsequenceCount",
    "studyUnitCount"
  ];
  if (!fields.some((field) => Object.hasOwn(value, field))) return null;
  const entries = fields.map((field) => [field, naturalNumber(value[field])]);
  if (entries.some(([, count]) => count === null)) {
    fail("invalid_course_projection", "As contagens do Curso são inválidas.");
  }
  return Object.freeze(Object.fromEntries(entries));
}

function normalizeListItem(value) {
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "A lista contém um Curso inválido.");
  }
  const courseId = text(value.courseId);
  const title = text(value.title);
  if (!isCanonicalCourseId(courseId) || !title) {
    fail("invalid_course_projection", "A lista contém um Curso sem identidade ou título válido.");
  }
  const itemRevision = value.revision == null ? null : revision(value.revision);
  const normalizedOwnership = ownership(value.ownership);
  return Object.freeze({
    courseId,
    title,
    goal: text(value.goal) || null,
    revision: itemRevision,
    ownership: normalizedOwnership,
    canEdit: editCapability(value.canEdit, normalizedOwnership),
    counts: courseCounts(isPlainObject(value.counts) ? value.counts : value),
    updatedAt: text(value.updatedAt) || null,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true
  });
}

export function normalizeCourseListPage(value) {
  if (!isPlainObject(value) || !Array.isArray(value.items)) {
    fail("invalid_course_projection", "A página de Cursos é inválida.");
  }
  const items = value.items.map(normalizeListItem);
  const identities = new Set(items.map((item) => item.courseId));
  if (identities.size !== items.length) {
    fail("invalid_course_projection", "A página repete a identidade de um Curso.");
  }
  const pagination = pageState(value);
  if (items.length === 0 && pagination.hasMore) {
    fail("invalid_course_cursor", "A página vazia não pode indicar continuação.");
  }
  return Object.freeze({
    items: Object.freeze(items),
    ...pagination,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true ||
      items.some((item) => item.offlineKnown)
  });
}

export function courseListCardinality(value) {
  const count = Array.isArray(value?.items) ? value.items.length : 0;
  if (count === 0 && value?.hasMore !== true) return "zero";
  if (count === 1 && value?.hasMore !== true) return "one";
  return "many";
}

export function mergeCourseListPages(currentValue, incomingValue) {
  const current = currentValue ? normalizeCourseListPage(currentValue) : null;
  const incoming = normalizeCourseListPage(incomingValue);
  const itemsById = new Map((current?.items || []).map((item) => [item.courseId, item]));
  incoming.items.forEach((item) => itemsById.set(item.courseId, item));
  return Object.freeze({
    items: Object.freeze([...itemsById.values()]),
    hasMore: incoming.hasMore,
    nextCursor: incoming.nextCursor,
    offlineKnown: current?.offlineKnown === true || incoming.offlineKnown
  });
}

export function normalizeCourseDetail(value, { expectedCourseId = "" } = {}) {
  if (!isPlainObject(value)) {
    fail("invalid_course_projection", "O Curso devolvido é inválido.");
  }
  const courseId = text(value.courseId);
  const title = text(value.title);
  if (!isCanonicalCourseId(courseId) || !title ||
      (expectedCourseId && courseId !== expectedCourseId)) {
    fail("invalid_course_projection", "O Curso devolvido não corresponde ao solicitado.");
  }
  const normalizedOwnership = ownership(value.ownership);
  return Object.freeze({
    courseId,
    title,
    goal: text(value.goal) || null,
    revision: revision(value.revision),
    ownership: normalizedOwnership,
    canEdit: editCapability(value.canEdit, normalizedOwnership),
    counts: courseCounts(value.counts),
    updatedAt: text(value.updatedAt) || null,
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true
  });
}

function requiredText(value, label, { maximum = 16_384 } = {}) {
  const normalized = text(value);
  if (!normalized || normalized.length > maximum) {
    fail("invalid_authoring_plan", `${label} é inválido.`);
  }
  return normalized;
}

function optionalText(value, label, { maximum = 16_384 } = {}) {
  if (value == null || value === "") return null;
  const normalized = text(value);
  if (!normalized || normalized.length > maximum) {
    fail("invalid_authoring_plan", `${label} é inválido.`);
  }
  return normalized;
}

function uuid(value, label) {
  const normalized = text(value).toLowerCase();
  if (!isCanonicalCourseId(normalized)) {
    fail("invalid_authoring_plan", `${label} é inválida.`);
  }
  return normalized;
}

function positiveBigintDecimal(value, label) {
  if (typeof value !== "string" || !POSITIVE_BIGINT_DECIMAL.test(value) ||
      (value.length === MAX_BIGINT_DECIMAL.length && value > MAX_BIGINT_DECIMAL)) {
    fail("invalid_authoring_plan", `${label} é inválida.`);
  }
  return value;
}

function dateTime(value, label) {
  const normalized = requiredText(value, label, { maximum: 64 });
  if (!Number.isFinite(Date.parse(normalized))) {
    fail("invalid_authoring_plan", `${label} é inválida.`);
  }
  return normalized;
}

function boundedNaturalNumber(value, label, { minimum = 0, maximum = 10_000 } = {}) {
  const normalized = naturalNumber(value, { minimum });
  if (normalized === null || normalized > maximum) {
    fail("invalid_authoring_plan", `${label} é inválido.`);
  }
  return normalized;
}

function normalizePreferredPartCount(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "A faixa preferencial de Partes é inválida.");
  }
  const minimum = boundedNaturalNumber(value.minimum, "O mínimo de Partes", {
    minimum: 1,
    maximum: 64
  });
  const maximum = boundedNaturalNumber(value.maximum, "O máximo de Partes", {
    minimum: 1,
    maximum: 64
  });
  const origin = text(value.origin);
  if (minimum > maximum || !AUTHORING_PLAN_ORIGINS.has(origin)) {
    fail("invalid_authoring_plan", "A faixa preferencial de Partes é inconsistente.");
  }
  return Object.freeze({ minimum, maximum, origin });
}

function normalizePartMicrosequence(value) {
  if (!isPlainObject(value) || !isPlainObject(value.curriculumPath)) {
    fail("invalid_authoring_plan", "Um vínculo de Parte é inválido.");
  }
  return Object.freeze({
    id: requiredText(value.id, "A microssequência vinculada", {
      maximum: 240
    }),
    productionPosition: boundedNaturalNumber(
      value.productionPosition,
      "A posição de produção da microssequência",
      { maximum: 63 }
    ),
    title: requiredText(value.title, "O título da microssequência", { maximum: 300 }),
    curriculumPath: Object.freeze({
      moduleId: requiredText(value.curriculumPath.moduleId, "O Módulo da microssequência", {
        maximum: 240
      }),
      moduleTitle: requiredText(
        value.curriculumPath.moduleTitle,
        "O título do Módulo",
        { maximum: 300 }
      ),
      lessonId: requiredText(value.curriculumPath.lessonId, "A Lição da microssequência", {
        maximum: 240
      }),
      lessonTitle: requiredText(
        value.curriculumPath.lessonTitle,
        "O título da Lição",
        { maximum: 300 }
      )
    }),
    studyUnitCount: boundedNaturalNumber(value.studyUnitCount, "A quantidade de unidades")
  });
}

function normalizeLastMaterialization(value) {
  if (value == null) return null;
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "A última materialização da Parte é inválida.");
  }
  const completedStepCount = boundedNaturalNumber(
    value.completedStepCount,
    "A quantidade de etapas concluídas"
  );
  const failedStepCount = boundedNaturalNumber(
    value.failedStepCount,
    "A quantidade de etapas com falha"
  );
  const totalStepCount = boundedNaturalNumber(
    value.totalStepCount,
    "A quantidade total de etapas"
  );
  if (completedStepCount > totalStepCount || failedStepCount > totalStepCount) {
    fail("invalid_authoring_plan", "As etapas da última materialização são inconsistentes.");
  }
  const status = text(value.status);
  if (!MATERIALIZATION_STATUSES.has(status)) {
    fail("invalid_authoring_plan", "O estado da última materialização é inválido.");
  }
  return Object.freeze({
    id: uuid(value.id, "A identidade da materialização"),
    status,
    version: boundedNaturalNumber(value.version, "A versão da materialização", {
      minimum: 1
    }),
    completedStepCount,
    failedStepCount,
    totalStepCount,
    startedAt: dateTime(value.startedAt, "O início da materialização"),
    updatedAt: dateTime(value.updatedAt, "A atualização da materialização"),
    completedAt: value.completedAt == null
      ? null
      : dateTime(value.completedAt, "O término da materialização")
  });
}

function normalizePartProgress(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "O progresso de uma Parte é inválido.");
  }
  const state = text(value.state);
  if (!PART_PROGRESS_STATES.has(state)) {
    fail("invalid_authoring_plan", "O estado derivado de uma Parte é inválido.");
  }
  return Object.freeze({
    state,
    microsequenceCount: boundedNaturalNumber(
      value.microsequenceCount,
      "A quantidade materializada de microssequências"
    ),
    studyUnitCount: boundedNaturalNumber(
      value.studyUnitCount,
      "A quantidade materializada de unidades"
    ),
    lastMaterialization: normalizeLastMaterialization(value.lastMaterialization)
  });
}

function normalizeCoursePart(value) {
  if (!isPlainObject(value) || !Array.isArray(value.microsequences) ||
      value.microsequences.length > 500) {
    fail("invalid_authoring_plan", "Uma Parte de autoria é inválida.");
  }
  const microsequences = value.microsequences.map(normalizePartMicrosequence);
  if (new Set(microsequences.map((item) => item.id)).size !== microsequences.length ||
      microsequences.some((item, position) => item.productionPosition !== position)) {
    fail("invalid_authoring_plan", "Uma Parte repete a mesma microssequência.");
  }
  const progress = normalizePartProgress(value.progress);
  const studyUnitCount = microsequences.reduce(
    (total, microsequence) => total + microsequence.studyUnitCount,
    0
  );
  if (progress.microsequenceCount !== microsequences.length ||
      progress.studyUnitCount !== studyUnitCount) {
    fail("invalid_authoring_plan", "O progresso da Parte não corresponde ao conteúdo vivo.");
  }
  return Object.freeze({
    id: uuid(value.id, "A identidade da Parte"),
    title: requiredText(value.title, "O título da Parte", { maximum: 300 }),
    intent: optionalText(value.intent, "A intenção da Parte", { maximum: 4_000 }),
    version: boundedNaturalNumber(value.version, "A versão da Parte", { minimum: 1 }),
    position: boundedNaturalNumber(value.position, "A posição da Parte", { maximum: 63 }),
    microsequences: Object.freeze(microsequences),
    progress
  });
}

function normalizePlanCounts(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "As contagens do planejamento são inválidas.");
  }
  const fields = [
    "intendedLearningOutcomeCount",
    "instructionalAnalysisUnitCount",
    "evidenceRequirementCount",
    "authoringPartCount",
    "linkedDidacticMicrosequenceCount",
    "studyUnitCount"
  ];
  return Object.freeze(Object.fromEntries(fields.map((field) => [
    field,
    boundedNaturalNumber(value[field], `A contagem ${field}`)
  ])));
}

function normalizePlanItem(value, label) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", `${label} é inválido.`);
  }
  return Object.freeze({
    id: uuid(value.id, `A identidade de ${label.toLowerCase()}`),
    position: boundedNaturalNumber(value.position, "A posição do item", { maximum: 511 }),
    statement: requiredText(value.statement, `O enunciado de ${label.toLowerCase()}`, {
      maximum: 2_000
    }),
    version: boundedNaturalNumber(value.version, "A versão do item", { minimum: 1 })
  });
}

function normalizePlanItemList(value, label) {
  if (!Array.isArray(value) || value.length > 512) {
    fail("invalid_authoring_plan", `A lista de ${label.toLowerCase()} é inválida.`);
  }
  const items = value.map((item) => normalizePlanItem(item, label))
    .sort((left, right) => left.position - right.position);
  if (new Set(items.map((item) => item.id)).size !== items.length ||
      items.some((item, position) => item.position !== position)) {
    fail("invalid_authoring_plan", `A ordem de ${label.toLowerCase()} é inconsistente.`);
  }
  return Object.freeze(items);
}

function normalizeAuthoringActivity(value) {
  if (!isPlainObject(value)) {
    fail("invalid_authoring_plan", "Uma atividade recente é inválida.");
  }
  const kind = text(value.kind);
  const channel = text(value.channel);
  if (!AUTHORING_ACTIVITY_KINDS.has(kind) || !["application", "mcp"].includes(channel)) {
    fail("invalid_authoring_plan", "Uma atividade recente é inconsistente.");
  }
  return Object.freeze({
    eventId: positiveBigintDecimal(value.eventId, "A identidade da atividade"),
    revision: boundedNaturalNumber(value.revision, "A revisão da atividade", { minimum: 1 }),
    kind,
    channel,
    instructionalPlanItemId: value.instructionalPlanItemId == null
      ? null
      : uuid(value.instructionalPlanItemId, "O item de planejamento da atividade"),
    partId: value.partId == null ? null : uuid(value.partId, "A Parte da atividade"),
    materializationId: value.materializationId == null
      ? null
      : uuid(value.materializationId, "A materialização da atividade"),
    createdAt: dateTime(value.createdAt, "A data da atividade")
  });
}

export function normalizeCourseAuthoringPlan(value, {
  expectedCourseId = "",
  expectedCourseRevision = null
} = {}) {
  if (!isPlainObject(value) || value.contract !== "aralearn.course-instructional-plan.v1" ||
      !isPlainObject(value.plan) ||
      !Array.isArray(value.plan.intendedLearningOutcomes) ||
      !Array.isArray(value.plan.instructionalAnalysisUnits) ||
      !Array.isArray(value.plan.evidenceRequirements) ||
      !Array.isArray(value.plan.parts) || value.plan.parts.length > 64 ||
      !Array.isArray(value.recentActivity) || value.recentActivity.length > 100) {
    fail("invalid_authoring_plan", "O planejamento de autoria devolvido é inválido.");
  }
  const courseId = text(value.courseId).toLowerCase();
  const courseRevision = revision(value.courseRevision);
  if (!isCanonicalCourseId(courseId) || (expectedCourseId && courseId !== expectedCourseId)) {
    fail("invalid_authoring_plan", "O planejamento pertence a outro Curso.");
  }
  if (expectedCourseRevision !== null && courseRevision !== expectedCourseRevision) {
    fail("course_revision_changed", "O Curso mudou durante a leitura do planejamento.");
  }
  const parts = value.plan.parts.map(normalizeCoursePart)
    .sort((left, right) => left.position - right.position);
  if (new Set(parts.map((part) => part.id)).size !== parts.length ||
      parts.some((part, position) => part.position !== position)) {
    fail("invalid_authoring_plan", "A ordem das Partes é inconsistente.");
  }
  const linkedMicrosequenceIds = parts.flatMap((part) =>
    part.microsequences.map((item) => item.id));
  if (linkedMicrosequenceIds.length > 192) {
    fail("invalid_authoring_plan", "O planejamento excede 192 vínculos de microssequência.");
  }
  if (new Set(linkedMicrosequenceIds).size !== linkedMicrosequenceIds.length) {
    fail("invalid_authoring_plan", "Uma microssequência está vinculada a mais de uma Parte.");
  }
  const intendedLearningOutcomes = normalizePlanItemList(
    value.plan.intendedLearningOutcomes,
    "Resultados de aprendizagem"
  );
  const instructionalAnalysisUnits = normalizePlanItemList(
    value.plan.instructionalAnalysisUnits,
    "Unidades de análise instrucional"
  );
  const evidenceRequirements = normalizePlanItemList(
    value.plan.evidenceRequirements,
    "Requisitos de evidência"
  );
  const counts = normalizePlanCounts(value.plan.counts);
  const computedCounts = {
    intendedLearningOutcomeCount: intendedLearningOutcomes.length,
    instructionalAnalysisUnitCount: instructionalAnalysisUnits.length,
    evidenceRequirementCount: evidenceRequirements.length,
    authoringPartCount: parts.length,
    linkedDidacticMicrosequenceCount: linkedMicrosequenceIds.length,
    studyUnitCount: parts.reduce((total, part) => total + part.microsequences.reduce(
      (partTotal, microsequence) => partTotal + microsequence.studyUnitCount,
      0
    ), 0)
  };
  if (Object.entries(computedCounts).some(([field, count]) => counts[field] !== count)) {
    fail("invalid_authoring_plan", "As contagens do planejamento são inconsistentes.");
  }
  const recentActivity = value.recentActivity.map(normalizeAuthoringActivity);
  return Object.freeze({
    courseId,
    courseRevision,
    plan: Object.freeze({
      id: uuid(value.plan.id, "A identidade do planejamento"),
      version: boundedNaturalNumber(value.plan.version, "A versão do planejamento", {
        minimum: 1
      }),
      title: requiredText(value.plan.title, "O título do Curso", { maximum: 300 }),
      objective: requiredText(value.plan.objective, "O objetivo do Curso", { maximum: 2_000 }),
      audience: optionalText(value.plan.audience, "O público", { maximum: 4_000 }),
      scope: optionalText(value.plan.scope, "O escopo", { maximum: 8_000 }),
      authoringGuidance: optionalText(
        value.plan.authoringGuidance,
        "A orientação",
        { maximum: 16_384 }
      ),
      updatedAt: dateTime(value.plan.updatedAt, "A atualização do planejamento"),
      preferredPartCount: normalizePreferredPartCount(value.plan.preferredPartCount),
      intendedLearningOutcomes,
      instructionalAnalysisUnits,
      evidenceRequirements,
      parts: Object.freeze(parts),
      counts
    }),
    recentActivity: Object.freeze(recentActivity)
  });
}

export function projectCoursePlanning(course, authoringPlan) {
  if (!isPlainObject(course) || !isPlainObject(authoringPlan) ||
      course.courseId !== authoringPlan.courseId ||
      course.revision !== authoringPlan.courseRevision ||
      course.title !== authoringPlan.plan.title ||
      (text(course.goal) || null) !== authoringPlan.plan.objective) {
    fail("invalid_authoring_plan", "O planejamento não corresponde ao Curso aberto.");
  }
  const parts = authoringPlan.plan.parts.map((part) => {
    return Object.freeze({
      ...part,
      linkedMicrosequenceCount: part.microsequences.length,
      studyUnitCount: part.progress.studyUnitCount,
      status: part.progress.state
    });
  });
  return Object.freeze({
    objective: text(course.goal) || null,
    audience: authoringPlan.plan.audience,
    scope: authoringPlan.plan.scope,
    authoringGuidance: authoringPlan.plan.authoringGuidance,
    updatedAt: authoringPlan.plan.updatedAt,
    preferredPartCount: authoringPlan.plan.preferredPartCount,
    parts: Object.freeze(parts),
    linkedMicrosequenceCount: authoringPlan.plan.counts.linkedDidacticMicrosequenceCount,
    studyUnitCount: authoringPlan.plan.counts.studyUnitCount,
    intendedLearningOutcomes: authoringPlan.plan.intendedLearningOutcomes,
    instructionalAnalysisUnits: authoringPlan.plan.instructionalAnalysisUnits,
    evidenceRequirements: authoringPlan.plan.evidenceRequirements,
    counts: authoringPlan.plan.counts,
    recentActivity: authoringPlan.recentActivity
  });
}

function outlineRequiredText(value, label, maximum = 300) {
  const normalized = text(value);
  if (!normalized || normalized.length > maximum) {
    fail("invalid_course_outline", `${label} é inválido.`);
  }
  return normalized;
}

function outlineOptionalText(value, label, maximum = 300) {
  if (value == null || value === "") return null;
  return outlineRequiredText(value, label, maximum);
}

function outlineIdentity(value, label) {
  const normalized = text(value);
  if (!normalized || normalized.length > 240) {
    fail("invalid_course_outline", `${label} é inválida.`);
  }
  return normalized;
}

export function normalizeCourseAuthoringOutline(value, {
  expectedCourseId = "",
  expectedRevision = null
} = {}) {
  if (!isPlainObject(value) || value.contract !== "aralearn.course.v1" ||
      !isPlainObject(value.outline) || !Array.isArray(value.outline.modules)) {
    fail("invalid_course_outline", "A estrutura devolvida é inválida.");
  }
  const course = normalizeCourseDetail(value, { expectedCourseId });
  if (expectedRevision !== null && course.revision !== expectedRevision) {
    fail("course_revision_changed", "O Curso mudou durante a leitura.");
  }
  if (text(value.outline.courseId) !== course.courseId ||
      outlineRequiredText(value.outline.title, "O título da estrutura") !== course.title ||
      (text(value.outline.goal) || null) !== course.goal) {
    fail("invalid_course_outline", "A estrutura não corresponde ao Curso aberto.");
  }

  const identities = new Set();
  const rows = [];
  const microsequences = [];
  let lessonCount = 0;
  let topicCount = 0;
  let studyUnitCount = 0;
  value.outline.modules.forEach((moduleValue, modulePosition) => {
    if (!isPlainObject(moduleValue) || !Array.isArray(moduleValue.lessons)) {
      fail("invalid_course_outline", "Um Módulo da estrutura é inválido.");
    }
    const moduleId = outlineIdentity(moduleValue.id, "A identidade do Módulo");
    const moduleTitle = outlineRequiredText(moduleValue.title, "O título do Módulo");
    const moduleIdentity = `module\u0000${moduleId}`;
    if (identities.has(moduleIdentity)) fail("invalid_course_outline", "A estrutura repete um Módulo.");
    identities.add(moduleIdentity);
    rows.push(Object.freeze({
      kind: "module",
      entityId: moduleId,
      label: "Módulo",
      icon: "module",
      title: moduleTitle,
      summary: null,
      context: null,
      position: modulePosition
    }));
    moduleValue.lessons.forEach((lessonValue, lessonPosition) => {
      if (!isPlainObject(lessonValue) || !Array.isArray(lessonValue.topics) ||
          !Array.isArray(lessonValue.microsequences)) {
        fail("invalid_course_outline", "Uma Lição da estrutura é inválida.");
      }
      lessonCount += 1;
      const lessonId = outlineIdentity(lessonValue.id, "A identidade da Lição");
      const lessonTitle = outlineRequiredText(lessonValue.title, "O título da Lição");
      const lessonIdentity = `lesson\u0000${lessonId}`;
      if (identities.has(lessonIdentity)) fail("invalid_course_outline", "A estrutura repete uma Lição.");
      identities.add(lessonIdentity);
      rows.push(Object.freeze({
        kind: "lesson",
        entityId: lessonId,
        label: "Lição",
        icon: "lesson",
        title: lessonTitle,
        summary: null,
        context: moduleTitle,
        position: lessonPosition
      }));
      lessonValue.topics.forEach((topicValue, topicPosition) => {
        if (!isPlainObject(topicValue)) {
          fail("invalid_course_outline", "Um Tópico da estrutura é inválido.");
        }
        topicCount += 1;
        const topicId = outlineIdentity(topicValue.id, "A identidade do Tópico");
        const topicKey = `topic\u0000${topicId}`;
        if (identities.has(topicKey)) fail("invalid_course_outline", "A estrutura repete um Tópico.");
        identities.add(topicKey);
        rows.push(Object.freeze({
          kind: "topic",
          entityId: topicId,
          label: "Tópico",
          icon: "tags",
          title: outlineRequiredText(topicValue.title, "O título do Tópico"),
          summary: outlineOptionalText(topicValue.summary, "O resumo do Tópico", 4_000),
          context: `${moduleTitle} · ${lessonTitle}`,
          position: topicPosition
        }));
      });
      lessonValue.microsequences.forEach((microsequenceValue, microsequencePosition) => {
        if (!isPlainObject(microsequenceValue)) {
          fail("invalid_course_outline", "Uma Microssequência didática da estrutura é inválida.");
        }
        const microsequenceId = outlineIdentity(
          microsequenceValue.id,
          "A identidade da Microssequência didática"
        );
        const microsequenceIdentity = `microsequence\u0000${microsequenceId}`;
        if (identities.has(microsequenceIdentity)) {
          fail("invalid_course_outline", "A estrutura repete uma Microssequência didática.");
        }
        identities.add(microsequenceIdentity);
        const count = naturalNumber(microsequenceValue.studyUnitCount);
        if (count === null) {
          fail("invalid_course_outline", "A contagem da Microssequência didática é inválida.");
        }
        studyUnitCount += count;
        const title = outlineRequiredText(
          microsequenceValue.title,
          "O título da Microssequência didática"
        );
        const row = Object.freeze({
          kind: "microsequence",
          entityId: microsequenceId,
          label: "Microssequência didática",
          icon: "microsequence",
          title,
          summary: outlineOptionalText(
            microsequenceValue.goal || microsequenceValue.role,
            "A descrição da Microssequência didática",
            4_000
          ),
          context: `${moduleTitle} · ${lessonTitle}`,
          position: microsequencePosition,
          studyUnitCount: count
        });
        rows.push(row);
        microsequences.push(Object.freeze({
          id: microsequenceId,
          label: `${moduleTitle} · ${lessonTitle} · ${title}`
        }));
      });
    });
  });
  const counts = course.counts;
  if (!counts || counts.moduleCount !== value.outline.modules.length ||
      counts.lessonCount !== lessonCount || counts.topicCount !== topicCount ||
      counts.microsequenceCount !== microsequences.length ||
      counts.studyUnitCount !== studyUnitCount) {
    fail("invalid_course_outline", "As contagens da estrutura são inconsistentes.");
  }
  return Object.freeze({
    course,
    rows: Object.freeze(rows),
    microsequences: Object.freeze(microsequences),
    offlineKnown: value.offlineKnown === true || value.offline === true || value.stale === true
  });
}

export function classifyCourseAuthoringError(error, { knownCourse = null } = {}) {
  const code = text(error?.code).toLowerCase();
  const technicalMessage = text(error?.message).toLowerCase();
  const status = Number(error?.status || error?.response?.status || 0);
  const offline = error?.offline === true || [
    "offline",
    "network_error",
    "network_unavailable",
    "request_timeout",
    "service_unavailable",
    "failed_to_fetch"
  ].includes(code) ||
    /(?:failed to fetch|fetch failed|network|offline|load failed|connection|socket)/u
      .test(technicalMessage);
  if (offline && knownCourse) {
    return Object.freeze({
      kind: "offline-known",
      message: "Este Curso é conhecido neste dispositivo, mas o conteúdo não está disponível agora."
    });
  }
  if ([
    "access_revoked",
    "course_access_revoked",
    "course_not_found",
    "forbidden",
    "pt404",
    "course_not_owned"
  ].includes(code) || status === 403 || status === 404) {
    return Object.freeze({
      kind: "access-revoked",
      message: "O acesso a este Curso não está mais disponível."
    });
  }
  if (["40001", "course_revision_changed"].includes(code)) {
    return Object.freeze({
      kind: "revision-changed",
      message: "O Curso mudou durante a leitura. Recarregue para ver a versão atual."
    });
  }
  return Object.freeze({
    kind: "error",
    message: offline
      ? "Não foi possível acessar os Cursos sem conexão."
      : "Não foi possível carregar esta área agora."
  });
}
